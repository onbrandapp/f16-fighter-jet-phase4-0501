import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ExhaustPlume } from "./exhaust-plume";

const MODEL_URL = "/models/f16.glb";

/**
 * The supplied GLB seen from above, gliding down a tall column as the visitor
 * reads the milestone list. Geometry and materials are used as loaded.
 * Renders only when asked (render on demand from the host's frame loop).
 */
export class TopDownJet {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(18, 1, 1, 2000);
  private jet = new THREE.Group();
  private key: THREE.DirectionalLight;
  private rim: THREE.DirectionalLight;
  private w = 1;
  private h = 1;
  private pxPerUnit = 20;
  private disposed = false;
  private ro: ResizeObserver;
  private plume: ExhaustPlume;
  private lastT: number | null = null;
  private lastZ = 0;
  private travel = 0;
  ready = false;
  /** px between the column edge and the jet's centre at p = 0 / 1 */
  get marginPx() {
    return 7.9 * this.pxPerUnit;
  }

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.35;

    this.scene.add(new THREE.HemisphereLight("#9aa3b0", "#0b0d10", 0.55));
    this.key = new THREE.DirectionalLight("#dfe5ee", 1.6);
    this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight("#c9a86a", 0.35);
    this.scene.add(this.rim);
    this.scene.add(this.jet);
    this.plume = new ExhaustPlume(this.scene);

    // looking straight down; the nose (−Z) points down the screen
    this.camera.up.set(0, 0, 1);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  async load() {
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    const gltf = await loader.loadAsync(MODEL_URL);
    draco.dispose();
    if (this.disposed) return;
    const holder = new THREE.Group();
    holder.add(gltf.scene);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const centre = box.getCenter(new THREE.Vector3());
    holder.position.sub(centre);
    // tail end of the airframe; the nozzle sits on the centreline there
    const tailZ = box.max.z - centre.z;
    // nose already points along −Z, which is screen-down with camera.up = +Z
    const wrap = new THREE.Group();
    wrap.add(holder);
    this.plume.glow.position.set(0, 0, tailZ - 0.25);
    wrap.add(this.plume.glow);
    this.jet.add(wrap);
    this.renderer.compile(this.scene, this.camera);
    this.ready = true;
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    // jet length (~14.1u) occupies about 82% of the column width, capped
    this.pxPerUnit = Math.min((this.w * 0.8) / 9.3, 300 / 14.1);
    const worldH = this.h / this.pxPerUnit;
    const dist = 400;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(worldH / 2 / dist));
    this.camera.aspect = this.w / this.h;
    this.camera.position.set(0, dist, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.plume?.setScale(this.pxPerUnit, this.renderer.getPixelRatio());
  }

  /**
   * p: 0..1 progress down the column. t: seconds (idle drift).
   */
  render(p: number, t: number, reduced: boolean): number | null {
    if (!this.ready || this.disposed) return null;
    const worldH = this.h / this.pxPerUnit;
    const margin = 7.9; // half the airframe length + a little air
    // screen-up is world +Z, so travelling down the list means decreasing Z
    const z = THREE.MathUtils.lerp(-(worldH / 2 - margin), worldH / 2 - margin, p);
    this.jet.position.set(0, 0, -z);
    const drift = reduced ? 0 : 1;
    // gentle bank + yaw that eases with progress, plus a breath of idle motion
    this.jet.rotation.z = Math.sin(p * Math.PI * 2.2) * 0.16 + Math.sin(t * 0.7) * 0.02 * drift;
    this.jet.rotation.x = Math.sin(p * Math.PI) * 0.1;
    this.jet.rotation.y = Math.sin(p * Math.PI * 1.4 + 0.6) * 0.07 + Math.sin(t * 0.45) * 0.01 * drift;
    this.jet.position.x = Math.sin(t * 0.5) * 0.12 * drift;
    // light sweeps from upper-left to lower-right as the story advances
    const a = THREE.MathUtils.lerp(-0.9, 0.9, p);
    this.key.position.set(Math.sin(a) * 30 - 10, 60, -z + Math.cos(a) * 30);
    this.key.target.position.copy(this.jet.position);
    this.key.target.updateMatrixWorld();
    this.key.intensity = 1.25 + Math.sin(p * Math.PI) * 0.6;
    this.rim.position.set(30, 10, -z - 40);
    this.rim.intensity = 0.2 + p * 0.45;

    // travel speed (world units / s) drives the burner and how thick the trail is
    const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
    if (this.lastT === null) this.plume.reset();
    else if (dt > 0) {
      const v = Math.abs(-z - this.lastZ) / dt;
      const target = Math.min(1, v / 14);
      this.travel += (target - this.travel) * (1 - Math.exp(-dt * 4));
    }
    this.lastT = t;
    this.lastZ = -z;
    this.jet.updateMatrixWorld(true);
    this.plume.update(dt, this.travel, t, reduced);
    this.renderer.render(this.scene, this.camera);
    // where the jet actually landed on screen (px from the canvas top)
    this.tmp.copy(this.jet.position).project(this.camera);
    return ((1 - this.tmp.y) / 2) * this.h;
  }
  private tmp = new THREE.Vector3();

  dispose() {
    this.disposed = true;
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => mat?.dispose());
      }
    });
    this.plume.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
