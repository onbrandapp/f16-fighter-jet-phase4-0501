import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CloudField } from "./clouds";
import { buildMove, LEGS, STAGES, smootherstep, type Move } from "./camera-stages";
import { ANCHORS, JetFx, type AnchorId } from "./jet-fx";
import { FlightDirector, makePose, poseCamera, poseFromLook, type Pose } from "./flight-director";
import { BOOM_EVENT, flight, STATION_EVENT, type BoomDetail, type StationDetail } from "./flight-store";
import { FootWordmark } from "./foot-wordmark";
import { LightRig, type LightTarget } from "./light-rig";
import { HistBackdrop } from "./hist-backdrop";
import { ExhaustPlume } from "../site/exhaust-plume";
import { radiusFt } from "../site/turn-model";
import { TurnViz } from "./turn-viz";

export const MODEL_URL = "/models/f16.glb";
// The GLB uses KHR_draco_mesh_compression. The decoder (wasm + wrapper, copied from
// the installed three version) is self-hosted under /draco/ — no CDN dependency.
const DRACO_PATH = "/draco/";

export type SceneEvents = {
  onProgress?: (p: number) => void;
  onMoveStart?: (from: number, to: number, duration: number) => void;
  onSettle?: (stage: number) => void;
};

const TRANSITION_SECONDS = 2.6;
const REDUCED_SECONDS = 0.9;

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uGlowDir;
  uniform vec3 uGlowColor;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
    col = mix(col, uBottom, smoothstep(0.0, -0.35, h));
    float g = max(dot(d, normalize(uGlowDir)), 0.0);
    col += uGlowColor * (pow(g, 6.0) * 0.55 + pow(g, 40.0) * 0.35);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class JetScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clouds: CloudField;
  private jetRoot = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private last = 0;
  /** wall-clock seconds — camera moves always finish on time even at low fps */
  private wall = 0;
  private raf = 0;
  private time = 0;
  private travel = 0;
  private speed = 0;
  private stage = 0;
  private move: (Move & { from: number; to: number }) | null = null;
  private holdSince = 0;
  private reduced: boolean;
  private camTarget = new THREE.Vector3();
  private basePos = new THREE.Vector3();
  private baseTarget = new THREE.Vector3();
  private baseFov = 34;
  private shift: [number, number] = [0, 0];
  private shiftScale: [number, number] = [1, 0];
  private viewW = 1;
  private viewH = 1;
  private frameScale = 1;
  private fovScale = 1;
  private ro: ResizeObserver;
  private disposed = false;
  private paused = false;
  private frameTimes: number[] = [];
  private pixelRatio: number;
  private fadeEl: HTMLElement | null;
  // clouds render at reduced resolution into their own target, then composite
  private cloudScene = new THREE.Scene();
  private cloudRT: THREE.WebGLRenderTarget;
  private cloudScale: number;
  private sky!: THREE.Mesh;
  private depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  private composite: THREE.Mesh;
  private compositeScene = new THREE.Scene();
  private compositeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private reducedCut: { start: number; to: number; from: number; swapped: boolean } | null = null;
  private fx = new JetFx();
  private director = new FlightDirector();
  private heroPose = makePose();
  private pose: Pose = makePose();
  private plume: ExhaustPlume;
  private plumeOn = false;
  private turnViz = new TurnViz();
  private rig!: LightRig;
  private backdrop = new HistBackdrop();
  private wordmark = new FootWordmark();
  private footEl: Element | null = null;
  private footStageEl: Element | null = null;
  private nozTmp = { x: 0, y: 0 };
  private lastStation = "hero";
  private boomArmed = true;
  private wasOff = false;
  private lightTarget: LightTarget = { a: "storm" };
  private camPos = new THREE.Vector3();
  private projTmp = new THREE.Vector3();
  private lastYaw = 0;
  private turn = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private events: SceneEvents,
    opts: { reducedMotion: boolean; fadeEl: HTMLElement | null },
  ) {
    this.reduced = opts.reducedMotion;
    this.fadeEl = opts.fadeEl;
    const mobile = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 700;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.setClearColor("#050608", 1);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 2000);
    this.camera.up.set(0, 1, 0);

    // Environment reflections — dim, so metal reads as metal without glare.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.22;
    pmrem.dispose();

    this.addSky();
    this.addLights();

    this.clouds = new CloudField(mobile ? 0.55 : 1);
    this.cloudScene.add(this.clouds.mesh);
    this.cloudScale = mobile ? 0.45 : 0.5;
    this.cloudRT = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.composite = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { tClouds: { value: this.cloudRT.texture } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: "uniform sampler2D tClouds; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tClouds, vUv); }",
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        toneMapped: false,
      }),
    );
    this.composite.frustumCulled = false;
    this.compositeScene.add(this.composite);
    this.renderer.autoClear = false;
    this.scene.add(this.jetRoot);
    this.scene.add(this.turnViz.group);
    this.jetRoot.rotation.order = "YXZ";
    this.plume = new ExhaustPlume(this.scene);
    this.plume.glow.position.set(0, -0.6, 6.75);
    this.plume.glow.visible = false;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.applyStagePose(0);
  }

  private addSky() {
    const geo = new THREE.SphereGeometry(1500, 32, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color("#030405") },
        uHorizon: { value: new THREE.Color("#0b0e12") },
        uBottom: { value: new THREE.Color("#040506") },
        uGlowDir: { value: new THREE.Vector3(-0.55, 0.45, -0.7) },
        uGlowColor: { value: new THREE.Color("#1a2029") },
      },
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    this.scene.add(sky);
    this.sky = sky;
  }

  private addLights() {
    // hemi / moon-key / rim / fill / bounce, recoloured per section by the rig
    this.rig = new LightRig(this.scene, this.sky.material as THREE.ShaderMaterial, this.renderer);
    this.scene.add(this.backdrop.mesh, this.wordmark.mesh);
  }

  /** which palette the current station wants */
  private pickLight(): LightTarget {
    const lt = this.lightTarget;
    lt.b = undefined;
    lt.t = 0;
    switch (this.director.station) {
      case "perf":
        lt.a = "perf";
        lt.b = "gold";
        lt.t = Math.min(1, Math.max(0, flight.perf - 3));
        break;
      case "turn":
        lt.a = "turn";
        break;
      case "hist":
        lt.a = `hist${flight.hist.row}`;
        break;
      case "var":
        lt.a = `var-${flight.variant.id}`;
        break;
      case "foot":
        lt.a = "foot";
        break;
      default:
        lt.a = "storm";
    }
    return lt;
  }

  async load(): Promise<void> {
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_PATH);
    draco.preload();
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    const buffer = await fetchWithProgress(MODEL_URL, (p) => this.events.onProgress?.(p * 0.92));
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) =>
      loader.parse(buffer, "/models/", (g) => resolve(g as { scene: THREE.Group }), reject),
    );
    draco.dispose();
    if (this.disposed) return;

    const model = gltf.scene;
    // The GLB's own node rotation already leaves the nose pointing toward -Z,
    // which is our direction of travel. Geometry/materials are untouched.
    const holder = new THREE.Group();
    holder.add(model);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const center = box.getCenter(new THREE.Vector3());
    holder.position.sub(center);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.frustumCulled = false;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const tex = (mat as THREE.MeshStandardMaterial).map;
          if (tex) tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        }
      }
    });
    this.jetRoot.add(holder);
    this.jetRoot.add(this.fx.parts, this.fx.effects, this.plume.glow);
    this.model = holder;

    // compile shaders + upload textures before revealing
    // warm every add-on's shader too, so nothing hitches on first appearance
    this.fx.parts.traverse((o) => (o.visible = true));
    this.fx.effects.traverse((o) => (o.visible = true));
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.cloudScene, this.camera);
    this.events.onProgress?.(1);
    this.start();
  }

  private start() {
    this.last = performance.now();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      // keep a running move on schedule even off-screen, but skip GPU work
      if ((this.paused || this.director.offstage()) && !this.busy) {
        this.last = performance.now();
        this.wasOff = true;
        return;
      }
      this.tick();
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Request a one-stage move. Returns false if not allowed. */
  go(dir: 1 | -1): boolean {
    if (this.busy) return false;
    const to = this.stage + dir;
    if (to < 0 || to >= STAGES.length) return false;
    const from = this.stage;
    if (this.reduced) {
      this.reducedCut = { start: performance.now() / 1000, from, to, swapped: false };
      this.events.onMoveStart?.(from, to, REDUCED_SECONDS);
      return true;
    }
    const m = buildMove(
      this.basePos,
      this.baseTarget,
      this.baseFov,
      this.shift,
      from,
      to,
      (p, t) => this.frame(p, t),
      TRANSITION_SECONDS,
      performance.now() / 1000,
    );
    this.move = { ...m, from, to };
    this.events.onMoveStart?.(from, to, TRANSITION_SECONDS);
    return true;
  }

  get busy() {
    return this.move !== null || this.reducedCut !== null;
  }

  get currentStage() {
    return this.stage;
  }

  /** Stop rendering while the hero is scrolled out of view. */
  setPaused(p: boolean) {
    this.paused = p;
  }

  setReducedMotion(r: boolean) {
    this.reduced = r;
  }

  private frame(p: THREE.Vector3, target: THREE.Vector3) {
    // push the camera away from its target on narrow screens
    return p.sub(target).multiplyScalar(this.frameScale).add(target);
  }

  private applyStagePose(stage: number) {
    const s = STAGES[stage]!;
    this.baseTarget.copy(s.target);
    this.basePos.copy(this.frame(s.pos.clone(), s.target));
    this.baseFov = s.fov;
    this.shift = [s.shift[0], s.shift[1]];
  }

  private tick() {
    const nowMs = performance.now();
    const dt = Math.min((nowMs - this.last) / 1000, 0.05);
    this.last = nowMs;
    this.wall = nowMs / 1000;
    this.time += dt;
    const t = this.time;
    const r = this.reduced;

    // forward travel — clouds stream past at a steady cruise
    const targetSpeed = r ? 9 : 30;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 1.5);
    this.travel += this.speed * dt;

    // aircraft: level, stable heading, barely-there float + vibration
    const amp = r ? 0.25 : 1;
    const vib = r ? 0 : 0.0035 * (Math.sin(t * 37.1) + Math.sin(t * 53.7 + 1.3) * 0.6);
    const idleX = Math.sin(t * 0.37) * 0.035 * amp;
    const idleY = (Math.sin(t * 0.62) * 0.07 + Math.sin(t * 1.43 + 0.8) * 0.02) * amp + vib;
    const idleRx = Math.sin(t * 0.51 + 0.4) * 0.0025 * amp + vib * 0.05;
    const idleRy = Math.sin(t * 0.29) * 0.0015 * amp;
    const idleRz = Math.sin(t * 0.71) * 0.004 * amp;

    // camera
    if (this.move) {
      const m = this.move;
      const p = Math.min(1, (this.wall - m.start) / m.duration);
      const e = smootherstep(p);
      m.posCurve.getPointAt(e, this.basePos);
      m.targetCurve.getPointAt(e, this.baseTarget);
      this.baseFov = m.fromFov + (m.toFov - m.fromFov) * e;
      this.shift = [
        m.fromShift[0] + (m.toShift[0] - m.fromShift[0]) * e,
        m.fromShift[1] + (m.toShift[1] - m.fromShift[1]) * e,
      ];
      if (p >= 1) {
        this.stage = m.to;
        this.move = null;
        this.holdSince = t;
        this.events.onSettle?.(this.stage);
      }
    } else if (this.reducedCut) {
      const c = this.reducedCut;
      const p = (this.wall - c.start) / REDUCED_SECONDS;
      const fade = p < 0.5 ? smootherstep(p * 2) : 1 - smootherstep((p - 0.5) * 2);
      if (this.fadeEl) this.fadeEl.style.opacity = String(fade);
      if (p >= 0.5 && !c.swapped) {
        c.swapped = true;
        this.stage = c.to;
        this.holdSince = t;
        this.applyStagePose(c.to);
      }
      if (p >= 1) {
        if (this.fadeEl) this.fadeEl.style.opacity = "0";
        this.reducedCut = null;
        this.events.onSettle?.(this.stage);
      }
    } else {
      this.applyStagePose(this.stage);
      if (this.stage === STAGES.length - 1) {
        // the jet keeps pushing on into the clouds: slow, capped pull-out
        const hold = t - this.holdSince;
        const k = 1 + 0.16 * (1 - Math.exp(-hold / 9)) * (r ? 0 : 1);
        this.basePos.sub(this.baseTarget).multiplyScalar(k).add(this.baseTarget);
      }
    }

    // hero pose → director → final pose
    const hp = poseFromLook(this.heroPose, this.basePos, this.baseTarget);
    hp.fov = this.baseFov * this.fovScale;
    hp.sx = this.shift[0] * this.shiftScale[0];
    hp.sy = this.shift[1] + this.shiftScale[1];
    const pose = (this.pose = this.director.sample(hp, this.viewW, this.viewH, t, dt, r));

    this.jetRoot.position.set(idleX, idleY, pose.jz);
    this.jetRoot.rotation.set(pose.jpitch + idleRx, pose.jyaw + idleRy, pose.roll + idleRz);

    poseCamera(pose, this.camPos);
    const sway = r ? 0 : 1;
    this.camera.position.set(
      this.camPos.x + Math.sin(t * 0.23) * 0.05 * sway,
      this.camPos.y + Math.sin(t * 0.31 + 1.1) * 0.04 * sway,
      this.camPos.z + Math.sin(t * 0.19 + 2.0) * 0.05 * sway,
    );
    this.camTarget.copy(pose.target);
    this.camera.lookAt(this.camTarget);
    this.camera.fov = pose.fov;
    // lens shift: slide the frame so the aircraft sits where the layout wants it
    this.camera.setViewOffset(this.viewW, this.viewH, -pose.sx * this.viewW, pose.sy * this.viewH, this.viewW, this.viewH);
    this.camera.updateProjectionMatrix();
    this.jetRoot.updateMatrixWorld(true);

    // add-ons + exhaust
    this.fx.update(pose.fx, t, dt, r);
    const tn = this.director.turnN;
    this.turnViz.update(pose.fx.turn ?? 0, tn, radiusFt(flight.turn.v, tn), flight.turn.v, this.jetRoot.position, dt, r);
    const plumeOn = pose.plume > 0.6;
    if (plumeOn !== this.plumeOn) {
      this.plumeOn = plumeOn;
      this.plume.reset();
    }
    this.plume.glow.visible = plumeOn;
    this.plume.setVisible(plumeOn);
    if (plumeOn) {
      this.plume.setScale(this.director.histPpu, this.renderer.getPixelRatio());
      this.plume.update(dt, 0.35 + Math.min(1, Math.abs(pose.jz - this.lastJz) / Math.max(dt, 1e-3) / 14) * 0.65, t, r);
    }
    this.lastJz = pose.jz;
    this.clouds.opacity = pose.clouds;

    // telemetry for the HUD: load factor from bank + turn rate, heading from the view
    const yawRate = dt > 0 ? Math.abs(((pose.yaw - this.lastYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / dt : 0;
    this.lastYaw = pose.yaw;
    this.turn += (Math.min(yawRate, 3) - this.turn) * Math.min(1, dt * 3);
    flight.hud.g = Math.min(9.4, 1 / Math.max(0.105, Math.cos(pose.roll)) + this.turn * 1.6);
    if (this.director.station === "turn") flight.hud.g = tn;
    flight.hud.heading = ((THREE.MathUtils.radToDeg(-pose.yaw) % 360) + 360) % 360;

    // per-section light + the history terrain plate (snap after an offstage gap,
    // so the footer never shows the variants' light easing away)
    this.rig.update(this.scene, this.pickLight(), dt, r || this.wasOff);
    this.wasOff = false;
    this.updateFoot();
    this.signal();
    if (this.director.station === "turn") this.backdrop.preload();
    this.backdrop.update(this.director.histWeight, flight.hist.row, flight.hist.p, dt, r);

    this.clouds.update(this.travel, this.camera, this.jetRoot.position);
    this.render();
    this.adaptQuality(dt);
  }

  /** footer wordmark: rect from its DOM anchor, lit by the nozzle */
  private updateFoot() {
    if (this.director.station !== "foot") {
      this.wordmark.update(null, null, 0, 0);
      return;
    }
    if (!this.footEl?.isConnected) this.footEl = document.querySelector('[data-flight="foot"]');
    if (!this.footStageEl?.isConnected) this.footStageEl = document.querySelector('[data-flight="foot-stage"]');
    const rect = this.footEl ? this.footEl.getBoundingClientRect() : null;
    const st = this.footStageEl?.getBoundingClientRect();
    const vh = this.viewH;
    const vis = st ? Math.min(1, Math.max(0, (vh - st.top) / (vh * 0.45))) : 1;
    const noz = this.project("nozzle", this.nozTmp);
    this.wordmark.update(rect, noz, 1, vis * vis * (3 - 2 * vis));
  }

  /** station handoffs + the sonic boom, as window events (sound + shock ring) */
  private signal() {
    const st = this.director.station;
    if (st !== this.lastStation) {
      const detail: StationDetail = { from: this.lastStation, to: st };
      this.lastStation = st;
      window.dispatchEvent(new CustomEvent(STATION_EVENT, { detail }));
    }
    if (st === "perf" && flight.perf > 3.6 && this.boomArmed) {
      this.boomArmed = false;
      const p = this.project("nose", this.nozTmp);
      const detail: BoomDetail = { x: p ? p.x : this.viewW / 2, y: p ? p.y : this.viewH / 2 };
      window.dispatchEvent(new CustomEvent(BOOM_EVENT, { detail }));
    } else if (flight.perf < 3) this.boomArmed = true;
  }

  private clearColor = new THREE.Color("#050608");
  private lastJz = 0;

  /** viewport px of a named point on the airframe (for DOM callouts); null if behind the camera */
  project(anchor: AnchorId, out: { x: number; y: number }) {
    if (!this.model) return null;
    const a = ANCHORS[anchor];
    const v = this.projTmp.set(a[0], a[1], a[2]);
    this.jetRoot.localToWorld(v);
    v.project(this.camera);
    if (v.z > 1) return null;
    out.x = ((v.x + 1) / 2) * this.viewW;
    out.y = ((1 - v.y) / 2) * this.viewH;
    return out;
  }

  /** which page station currently owns the aircraft */
  get station() {
    return this.director.station;
  }

  private render() {
    const r = this.renderer;
    // 1. sky + aircraft at full resolution
    r.setRenderTarget(null);
    r.setClearColor(this.clearColor, 1);
    r.clear();
    r.render(this.scene, this.camera);
    if (this.clouds.opacity < 0.01) return;
    // 2. clouds at reduced resolution, depth-tested against the aircraft
    r.setRenderTarget(this.cloudRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    this.sky.visible = false;
    const bd = this.backdrop.mesh.visible;
    this.backdrop.mesh.visible = false;
    const wm = this.wordmark.mesh.visible;
    this.wordmark.mesh.visible = false;
    this.fx.effects.visible = false;
    const pg = this.plume.glow.visible;
    this.plume.glow.visible = false;
    this.plume.setVisible(false);
    this.scene.overrideMaterial = this.depthMat;
    r.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.sky.visible = true;
    this.backdrop.mesh.visible = bd;
    this.wordmark.mesh.visible = wm;
    this.fx.effects.visible = true;
    this.plume.glow.visible = pg;
    this.plume.setVisible(pg);
    r.render(this.cloudScene, this.camera);
    // 3. composite (premultiplied) over the frame
    r.setRenderTarget(null);
    r.render(this.compositeScene, this.compositeCam);
  }

  private adaptQuality(dt: number) {
    if (this.frameTimes.length >= 120 || this.time < 1.5) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length === 120) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / 120;
      if (avg > 1 / 40 && this.pixelRatio > 1) {
        this.pixelRatio = 1;
        this.renderer.setPixelRatio(1);
        this.resize();
      }
    }
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    this.cloudRT.setSize(Math.max(2, Math.round(w * pr * this.cloudScale)), Math.max(2, Math.round(h * pr * this.cloudScale)));
    this.camera.aspect = w / h;
    const a = w / h;
    const k = Math.min(2.2, Math.max(1, 1.45 / a));
    this.frameScale = 1 + (k - 1) * 0.75;
    this.fovScale = 1 + (k - 1) * 0.22;
    this.viewW = w;
    this.viewH = h;
    this.backdrop.setViewport(w, h);
    this.wordmark.setViewport(w, h);
    this.fx.setViewHeight(h * this.renderer.getPixelRatio());
    // portrait: less horizontal shift, lift the jet above the bottom captions
    this.shiftScale = a < 0.9 ? [0.15, 0.08] : [1, 0];
    this.camera.updateProjectionMatrix();
  }

  /** Dev helper: minimum camera→mesh distance along every leg (both directions). */
  debugClearance(samples = 160) {
    if (!this.model) return null;
    const verts: THREE.Vector3[] = [];
    this.model.updateMatrixWorld(true);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i += 2) {
        verts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
      }
    });
    const out: { leg: number; min: number }[] = [];
    for (let i = 0; i < LEGS.length; i++) {
      const fromStage = STAGES[i]!;
      const m = buildMove(
        this.frame(fromStage.pos.clone(), fromStage.target),
        fromStage.target.clone(),
        fromStage.fov,
        fromStage.shift,
        i,
        i + 1,
        (p, t) => this.frame(p, t),
        1,
        0,
      );
      let min = Infinity;
      for (let s = 0; s <= samples; s++) {
        const p = m.posCurve.getPointAt(s / samples);
        for (const v of verts) {
          const d = v.distanceToSquared(p);
          if (d < min) min = d;
        }
      }
      out.push({ leg: i, min: Math.sqrt(min) });
    }
    const box = new THREE.Box3().setFromObject(this.model);
    return { legs: out, box: { min: box.min.toArray(), max: box.max.toArray() }, verts: verts.length };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.fx.dispose();
    this.plume.dispose();
    this.turnViz.dispose();
    this.backdrop.dispose();
    this.wordmark.dispose();
    this.clouds.dispose();
    this.cloudRT.dispose();
    this.depthMat.dispose();
    this.composite.geometry.dispose();
    (this.composite.material as THREE.Material).dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => mat?.dispose());
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}

async function fetchWithProgress(url: string, onProgress: (p: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model request failed (${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("text/html")) throw new Error("Model URL returned HTML instead of a GLB");
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    onProgress(1);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(1, received / total));
  }
  const out = new Uint8Array(received);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}
