import * as THREE from "three";

/**
 * Procedural add-ons for the persistent jet. The supplied GLB is used exactly
 * as loaded; everything here is separate geometry parented to the aircraft:
 *
 *  - stores (missiles, bombs, pods, pylons) that slide onto the hardpoints
 *  - block-specific airframe parts (conformal fuel tanks, dorsal spine)
 *  - capability effects (wingtip vortices, EW pulses, radar sweep, shock cone,
 *    Mach diamonds, helmet cue line, showcase deck)
 *
 * Coordinates are in the aircraft frame after centring: nose toward -Z, +Y up,
 * ~14 m long. Hardpoint positions were measured off the model's geometry.
 */

export const HUD_GREEN = new THREE.Color("#8ff0a8");
export const HUD_AMBER = new THREE.Color("#e6b766");

export const STORE_IDS = [
  "tip9",
  "tip120",
  "st2_9",
  "st3_120",
  "st3_jdam",
  "pod",
  "ecm",
] as const;
export type StoreId = (typeof STORE_IDS)[number];

export const FX_IDS = ["vortex", "pulse", "radar", "shock", "cue", "deck", "cft", "spine"] as const;
export type FxId = (typeof FX_IDS)[number];

export type FxState = Record<StoreId | FxId, number>;

export const emptyFx = (): FxState => {
  const o = {} as FxState;
  for (const k of STORE_IDS) o[k] = 0;
  for (const k of FX_IDS) o[k] = 0;
  return o;
};

/** named points on the airframe, for HUD callouts */
export const ANCHORS = {
  nose: [0, -0.89, -7.06],
  radome: [0, -0.62, -6.1],
  canopy: [0, 0.38, -3.1],
  intake: [0, -1.55, -2.3],
  tipL: [-4.68, -0.86, 0.4],
  tipR: [4.68, -0.86, 0.4],
  st2R: [3.85, -1.2, 1.2],
  st3L: [-3.05, -1.45, 0.4],
  st3R: [3.05, -1.25, 0.6],
  tankR: [2.12, -1.85, 0.6],
  pod: [0.52, -1.72, -1.6],
  ecm: [0, -1.85, 0.6],
  wingR: [3.2, -0.78, 2.2],
  spine: [0, 0.32, 1.2],
  cftR: [0.9, 0.0, 0.7],
  fin: [0, 2.0, 5.6],
  nozzle: [0, -0.62, 6.75],
  cue: [26, 7, 6],
} as const satisfies Record<string, readonly [number, number, number]>;
export type AnchorId = keyof typeof ANCHORS;

// ───────────────────────── geometry builders ─────────────────────────

/** Lathe a body of revolution along -Z (nose first) from a radius profile. */
function body(length: number, radius: number, noseFrac: number, tailTaper = 0.92, seg = 18) {
  const pts: THREE.Vector2[] = [];
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const s = i / n; // 0 tail → 1 nose
    const y = -length / 2 + s * length;
    let r = radius;
    const fromNose = 1 - s;
    if (fromNose < noseFrac) {
      const k = fromNose / noseFrac;
      r = radius * Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k)));
    }
    if (s < 0.04) r *= tailTaper;
    pts.push(new THREE.Vector2(Math.max(0.0005, r), y));
  }
  pts.unshift(new THREE.Vector2(0.0005, -length / 2));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** a cruciform set of thin trapezoid fins at z (aircraft frame) */
function fins(span: number, rootChord: number, tipChord: number, z: number, roll: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -rootChord / 2);
  shape.lineTo(span, -rootChord / 2 + (rootChord - tipChord) * 0.7);
  shape.lineTo(span, -rootChord / 2 + (rootChord - tipChord) * 0.7 + tipChord);
  shape.lineTo(0, rootChord / 2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: false });
  geo.translate(0, 0, -0.004);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(geo, mat);
    // shape lies in XY with chord along Y; turn chord onto Z
    m.rotation.set(Math.PI / 2, 0, 0);
    const holder = new THREE.Group();
    holder.add(m);
    holder.rotation.z = roll + (i * Math.PI) / 2;
    holder.position.z = z;
    g.add(holder);
  }
  return g;
}

type Mats = { white: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; olive: THREE.MeshStandardMaterial; grey: THREE.MeshStandardMaterial };

function missile(kind: "aim9" | "aim120", m: Mats) {
  const g = new THREE.Group();
  if (kind === "aim9") {
    const L = 2.87;
    const R = 0.064;
    g.add(new THREE.Mesh(body(L, R, 0.06), m.white));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.92, 14, 10), m.dark);
    dome.position.z = -L / 2 + 0.06;
    g.add(dome);
    g.add(fins(0.16, 0.2, 0.06, -L / 2 + 0.42, Math.PI / 4, m.white)); // canards
    g.add(fins(0.2, 0.34, 0.16, L / 2 - 0.22, Math.PI / 4, m.white));
  } else {
    const L = 3.65;
    const R = 0.089;
    g.add(new THREE.Mesh(body(L, R, 0.13), m.white));
    g.add(fins(0.12, 0.42, 0.22, -0.15, Math.PI / 4, m.white)); // mid wings
    g.add(fins(0.17, 0.3, 0.14, L / 2 - 0.17, Math.PI / 4, m.white));
  }
  return g;
}

function jdam(m: Mats) {
  const g = new THREE.Group();
  const L = 3.85;
  g.add(new THREE.Mesh(body(L, 0.23, 0.2, 0.55), m.olive));
  g.add(fins(0.3, 0.42, 0.3, L / 2 - 0.24, Math.PI / 4, m.olive));
  return g;
}

function pod(length: number, radius: number, m: Mats, glass = true) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(body(length, radius, 0.1, 0.7), m.grey));
  if (glass) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.9, 18, 12), m.dark);
    eye.position.z = -length / 2 + radius * 0.6;
    g.add(eye);
  }
  return g;
}

function pylon(length: number, height: number, m: Mats) {
  const geo = new THREE.BoxGeometry(0.07, height, length);
  return new THREE.Mesh(geo, m.grey);
}

// ───────────────────────── effect shaders ─────────────────────────

const flatVert = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const radarFrag = /* glsl */ `
  uniform float uW;
  uniform float uSweep;
  uniform float uDir;
  uniform vec3 uColor;
  varying vec2 vP;
  void main() {
    // plane lies in the aircraft's horizontal plane; after the -90° x-rotation local +y is forward (-Z)
    vec2 p = vP;
    float r = length(p);
    float R = 46.0;
    float ang = atan(p.x, p.y);
    float halfA = 1.05;
    if (r > R || abs(ang) > halfA || p.y < 0.0) discard;
    float d = (ang - uSweep) * uDir;
    float beam = exp(-abs(d) * 26.0);
    float trail = d < 0.0 ? exp(d * 3.2) * 0.4 : 0.0;
    float m = mod(r, 11.5);
    float ring = 1.0 - smoothstep(0.0, 0.16, min(m, 11.5 - m));
    float edge = 1.0 - smoothstep(0.0, 0.012, halfA - abs(ang));
    float fade = (1.0 - smoothstep(R * 0.6, R, r)) * smoothstep(0.0, 3.0, r);
    // three contacts, lit as the beam passes
    float blip = 0.0;
    vec2 t1 = vec2(-9.0, 24.0); vec2 t2 = vec2(14.0, 33.0); vec2 t3 = vec2(3.0, 40.0);
    blip += exp(-dot(p - t1, p - t1) * 1.4) * (0.35 + trail * 2.0 + beam);
    blip += exp(-dot(p - t2, p - t2) * 1.4) * (0.35 + trail * 2.0 + beam);
    blip += exp(-dot(p - t3, p - t3) * 1.4) * (0.35 + trail * 2.0 + beam);
    float a = uW * fade * (0.035 + beam * 0.55 + trail * 0.5 + ring * 0.14 + edge * 0.3) + uW * blip * 0.9;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const ringsFrag = /* glsl */ `
  uniform float uW;
  uniform float uTime;
  uniform float uMode; // 0 = EW pulses, 1 = showcase deck
  uniform vec3 uColor;
  uniform vec3 uColor2;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float ang = atan(vP.x, vP.y);
    vec3 col = vec3(0.0);
    float a = 0.0;
    if (uMode < 0.5) {
      for (int i = 0; i < 3; i++) {
        float ph = fract(uTime * 0.26 + float(i) / 3.0);
        float rr = 4.0 + ph * 34.0;
        float k = exp(-pow((r - rr) / 0.32, 2.0)) * pow(1.0 - ph, 1.6);
        a += k;
      }
      // bearing ticks of the warning receiver
      float tick = step(0.96, abs(cos(ang * 18.0))) * (1.0 - smoothstep(0.0, 0.25, abs(r - 22.0)));
      float spoke = step(0.9994, cos(ang * 4.0 - 0.785)) * smoothstep(6.0, 9.0, r) * (1.0 - smoothstep(20.0, 22.0, r));
      a = a * 0.9 + tick * 0.45 + spoke * 0.2;
      col = mix(uColor, uColor2, 0.35);
    } else {
      float rings = 0.0;
      for (int i = 1; i <= 3; i++) {
        float rr = float(i) * 4.4;
        rings += exp(-pow((r - rr) / 0.035, 2.0)) * (1.15 - float(i) * 0.25);
      }
      float tick = step(0.985, abs(cos(ang * 36.0))) * (1.0 - smoothstep(0.0, 0.18, abs(r - 13.9))) * smoothstep(13.6, 13.75, r);
      float cross = (exp(-pow(vP.x / 0.02, 2.0)) + exp(-pow(vP.y / 0.02, 2.0))) * (1.0 - smoothstep(2.0, 15.0, r)) * 0.35;
      float pool = exp(-r * r / 40.0) * 0.08;
      a = rings * 0.4 + tick * 0.5 + cross + pool;
      col = mix(uColor2, uColor, smoothstep(0.0, 6.0, r));
    }
    a *= uW * (1.0 - smoothstep(30.0, 40.0, r));
    gl_FragColor = vec4(col * a, a);
  }
`;

const ribbonVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ribbonFrag = /* glsl */ `
  uniform float uW;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float s = vUv.y; // 0 at the wingtip
    float across = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 1.6);
    float flow = 0.72 + 0.28 * sin(s * 70.0 - uTime * 38.0) * sin(s * 23.0 - uTime * 11.0);
    float a = uW * across * pow(1.0 - s, 1.7) * smoothstep(0.0, 0.025, s) * flow * 0.55;
    vec3 col = mix(vec3(0.92, 0.95, 1.0), vec3(0.6, 0.68, 0.8), s);
    gl_FragColor = vec4(col * a, a);
  }
`;

const fresnelVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const shockFrag = /* glsl */ `
  uniform float uW;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(f, 3.0);
    float band = 0.6 + 0.4 * sin(vUv.y * 46.0 + uTime * 16.0);
    float along = smoothstep(0.0, 0.08, 1.0 - vUv.y) * (1.0 - smoothstep(0.35, 1.0, 1.0 - vUv.y));
    float a = uW * (rim * 0.5 * band + 0.012) * along;
    vec3 col = vec3(0.8, 0.88, 1.0);
    gl_FragColor = vec4(col * a, a);
  }
`;

const diamondVert = /* glsl */ `
  attribute float aSize;
  attribute float aTone;
  uniform float uViewH;
  uniform float uW;
  uniform float uTime;
  varying float vTone;
  void main() {
    vTone = aTone;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float flick = 0.9 + 0.1 * sin(uTime * 40.0 + aTone * 9.0);
    gl_PointSize = aSize * projectionMatrix[1][1] * uViewH * 0.5 / max(0.1, -mv.z) * uW * flick;
  }
`;
const diamondFrag = /* glsl */ `
  uniform float uW;
  varying float vTone;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    // diamonds are stretched along the flow
    float r = length(vec2(c.x * 1.0, c.y * 2.2)) * 2.0;
    if (r > 1.0) discard;
    float soft = pow(1.0 - r, 2.0);
    vec3 col = mix(vec3(1.0, 0.82, 0.55), vec3(0.6, 0.75, 1.0), vTone);
    float a = soft * uW * (1.0 - vTone * 0.5);
    gl_FragColor = vec4(col * a, a);
  }
`;

const additive = {
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  side: THREE.DoubleSide,
} as const;

function ribbonGeo(x: number, y: number, z: number, length: number, vertical: boolean, curl: number) {
  const n = 48;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const w = 0.04 + s * 0.75;
    const cx = x + Math.sign(x) * s * s * 2.2 * curl;
    const cy = y + s * s * 3.2 * curl;
    const cz = z + s * length;
    if (vertical) {
      pos.push(cx, cy - w / 2, cz, cx, cy + w / 2, cz);
    } else {
      pos.push(cx - w / 2, cy, cz, cx + w / 2, cy, cz);
    }
    uv.push(0, s, 1, s);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function cueTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.strokeStyle = "#fff";
  x.lineWidth = 4;
  const k = 30;
  const a = 18;
  const b = 110;
  x.beginPath();
  for (const [px, py, dx, dy] of [
    [a, a, 1, 1],
    [b, a, -1, 1],
    [a, b, 1, -1],
    [b, b, -1, -1],
  ] as const) {
    x.moveTo(px, py + dy * k * 0.6);
    x.lineTo(px, py);
    x.lineTo(px + dx * k * 0.6, py);
  }
  x.stroke();
  x.beginPath();
  x.moveTo(64, 52);
  x.lineTo(76, 64);
  x.lineTo(64, 76);
  x.lineTo(52, 64);
  x.closePath();
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────────────────── the rig ─────────────────────────

type Slot = { obj: THREE.Object3D; base: THREE.Vector3; mats: THREE.Material[]; drop: number };

export class JetFx {
  /** solid parts (stores, CFTs, spine) — included in the cloud depth pass */
  readonly parts = new THREE.Group();
  /** translucent effects — skipped by the cloud depth pass */
  readonly effects = new THREE.Group();
  private slots = new Map<StoreId | "cft" | "spine", Slot>();
  private mats: Mats;
  private radarMat: THREE.ShaderMaterial;
  private pulseMat: THREE.ShaderMaterial;
  private deckMat: THREE.ShaderMaterial;
  private ribbonMat: THREE.ShaderMaterial;
  private shockMat: THREE.ShaderMaterial;
  private diamondMat: THREE.ShaderMaterial;
  private cueLine: THREE.Line;
  private cueSprite: THREE.Sprite;
  private cueTex: THREE.Texture;
  private radar: THREE.Mesh;
  private pulse: THREE.Mesh;
  private deck: THREE.Mesh;
  private ribbons: THREE.Group;
  private shock: THREE.Mesh;
  private diamonds: THREE.Points;
  private sweep = 0;
  private sweepDir = 1;

  constructor() {
    this.mats = {
      white: new THREE.MeshStandardMaterial({ color: "#d6d9dc", roughness: 0.42, metalness: 0.12 }),
      dark: new THREE.MeshStandardMaterial({ color: "#1c1f23", roughness: 0.18, metalness: 0.55 }),
      olive: new THREE.MeshStandardMaterial({ color: "#5d6150", roughness: 0.7, metalness: 0.1 }),
      grey: new THREE.MeshStandardMaterial({ color: "#7c8288", roughness: 0.55, metalness: 0.35 }),
    };
    const m = this.mats;

    const addSlot = (id: StoreId | "cft" | "spine", build: () => THREE.Object3D, at: [number, number, number][], drop = 0.35) => {
      const g = new THREE.Group();
      for (const p of at) {
        const o = build();
        o.position.set(p[0], p[1], p[2]);
        g.add(o);
      }
      // per-slot materials so each store can fade on its own
      const mats: THREE.Material[] = [];
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mm = (mesh.material as THREE.Material).clone();
        mm.transparent = true;
        mesh.material = mm;
        mats.push(mm);
      });
      g.visible = false;
      this.parts.add(g);
      this.slots.set(id, { obj: g, base: new THREE.Vector3(), mats, drop });
    };

    const withPylon = (build: () => THREE.Object3D, len: number, h: number, dy: number) => () => {
      const g = new THREE.Group();
      const s = build();
      g.add(s);
      const py = pylon(len, h, m);
      py.position.y = dy;
      g.add(py);
      return g;
    };

    // wingtip rails (stations 1 / 9) — rails are part of the GLB already
    addSlot("tip9", () => missile("aim9", m), [
      [-4.66, -0.9, 1.15],
      [4.66, -0.9, 1.15],
    ]);
    addSlot("tip120", () => missile("aim120", m), [
      [-4.66, -0.92, 1.0],
      [4.66, -0.92, 1.0],
    ]);
    // outboard under-wing (2 / 8)
    addSlot("st2_9", withPylon(() => missile("aim9", m), 1.2, 0.2, 0.17), [
      [-3.85, -1.12, 1.55],
      [3.85, -1.12, 1.55],
    ]);
    // mid under-wing (3 / 7): AMRAAM or a 2,000 lb JDAM
    addSlot("st3_120", withPylon(() => missile("aim120", m), 1.6, 0.26, 0.2), [
      [-3.05, -1.16, 1.25],
      [3.05, -1.16, 1.25],
    ]);
    addSlot("st3_jdam", withPylon(() => jdam(m), 1.8, 0.2, 0.3), [
      [-3.05, -1.4, 1.55],
      [3.05, -1.4, 1.55],
    ]);
    // targeting pod on the chin station, ECM pod on the centreline
    addSlot("pod", () => pod(2.45, 0.16, m), [[0.52, -1.72, -1.2]]);
    addSlot("ecm", withPylon(() => pod(3.9, 0.2, m, false), 1.6, 0.3, 0.3), [[0, -1.9, 1.1]]);

    // Block 60 / Block 70 conformal fuel tanks on the upper fuselage shoulders
    addSlot(
      "cft",
      () => {
        const g = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 18), m.grey);
        g.scale.set(0.34, 0.24, 2.35);
        return g;
      },
      [
        [-0.84, -0.26, 1.05],
        [0.84, -0.26, 1.05],
      ],
      -0.2,
    );
    // two-seat dorsal avionics spine, canopy to fin root
    addSlot(
      "spine",
      () => {
        const g = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 18), m.grey);
        g.scale.set(0.34, 0.34, 3.1);
        return g;
      },
      [[0, -0.06, 1.45]],
      -0.25,
    );

    // radar sweep: a fan in the aircraft's horizontal plane, from the radome
    this.radarMat = new THREE.ShaderMaterial({
      vertexShader: flatVert,
      fragmentShader: radarFrag,
      uniforms: { uW: { value: 0 }, uSweep: { value: 0 }, uDir: { value: 1 }, uColor: { value: HUD_GREEN.clone() } },
      ...additive,
    });
    this.radar = new THREE.Mesh(new THREE.PlaneGeometry(92, 92), this.radarMat);
    this.radar.rotation.x = -Math.PI / 2;
    this.radar.position.set(0, -0.62, -6.6);
    this.radar.renderOrder = 4;
    this.effects.add(this.radar);

    const ringMat = (mode: number) =>
      new THREE.ShaderMaterial({
        vertexShader: flatVert,
        fragmentShader: ringsFrag,
        uniforms: {
          uW: { value: 0 },
          uTime: { value: 0 },
          uMode: { value: mode },
          uColor: { value: HUD_GREEN.clone() },
          uColor2: { value: HUD_AMBER.clone() },
        },
        ...additive,
      });
    this.pulseMat = ringMat(0);
    this.pulse = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), this.pulseMat);
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.position.y = -0.7;
    this.pulse.renderOrder = 4;
    this.effects.add(this.pulse);

    this.deckMat = ringMat(1);
    this.deck = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), this.deckMat);
    this.deck.rotation.x = -Math.PI / 2;
    this.deck.position.y = -3.1;
    this.deck.renderOrder = 3;
    this.effects.add(this.deck);

    // wingtip vortices: crossed ribbons so they read from any angle
    this.ribbonMat = new THREE.ShaderMaterial({
      vertexShader: ribbonVert,
      fragmentShader: ribbonFrag,
      uniforms: { uW: { value: 0 }, uTime: { value: 0 } },
      ...additive,
    });
    this.ribbons = new THREE.Group();
    for (const sx of [-1, 1]) {
      for (const vertical of [false, true]) {
        const r = new THREE.Mesh(ribbonGeo(sx * 4.66, -0.86, 2.6, 34, vertical, 1), this.ribbonMat);
        r.renderOrder = 5;
        this.ribbons.add(r);
      }
    }
    this.effects.add(this.ribbons);

    // supersonic: a faint Mach cone off the nose + shock diamonds in the plume
    this.shockMat = new THREE.ShaderMaterial({
      vertexShader: fresnelVert,
      fragmentShader: shockFrag,
      uniforms: { uW: { value: 0 }, uTime: { value: 0 } },
      ...additive,
    });
    const coneLen = 15;
    const cone = new THREE.ConeGeometry(Math.tan(0.52) * coneLen, coneLen, 64, 1, true);
    cone.rotateX(-Math.PI / 2);
    cone.translate(0, -0.89, -7.1 + coneLen / 2);
    this.shock = new THREE.Mesh(cone, this.shockMat);
    this.shock.renderOrder = 5;
    this.effects.add(this.shock);

    const dg = new THREE.BufferGeometry();
    const dp: number[] = [];
    const ds: number[] = [];
    const dt: number[] = [];
    for (let i = 0; i < 6; i++) {
      dp.push(0, -0.62, 7.25 + i * 0.82);
      ds.push(1.05 - i * 0.12);
      dt.push(i / 5);
    }
    dg.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
    dg.setAttribute("aSize", new THREE.Float32BufferAttribute(ds, 1));
    dg.setAttribute("aTone", new THREE.Float32BufferAttribute(dt, 1));
    this.diamondMat = new THREE.ShaderMaterial({
      vertexShader: diamondVert,
      fragmentShader: diamondFrag,
      uniforms: { uW: { value: 0 }, uViewH: { value: 900 }, uTime: { value: 0 } },
      ...additive,
    });
    this.diamonds = new THREE.Points(dg, this.diamondMat);
    this.diamonds.frustumCulled = false;
    this.diamonds.renderOrder = 6;
    this.effects.add(this.diamonds);

    // helmet cue: sight line from the canopy to a boxed target off the nose
    const cuePts = [new THREE.Vector3(...ANCHORS.canopy), new THREE.Vector3(...ANCHORS.cue)];
    const lg = new THREE.BufferGeometry().setFromPoints(cuePts);
    this.cueLine = new THREE.Line(
      lg,
      new THREE.LineDashedMaterial({
        color: HUD_GREEN,
        dashSize: 0.5,
        gapSize: 0.35,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.cueLine.computeLineDistances();
    this.cueLine.renderOrder = 6;
    this.effects.add(this.cueLine);
    this.cueTex = cueTexture();
    this.cueSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.cueTex,
        color: HUD_GREEN,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.cueSprite.position.set(...ANCHORS.cue);
    this.cueSprite.scale.setScalar(3.4);
    this.cueSprite.renderOrder = 6;
    this.effects.add(this.cueSprite);

    for (const o of this.effects.children) o.frustumCulled = false;
  }

  setViewHeight(px: number) {
    this.diamondMat.uniforms.uViewH!.value = px;
  }

  update(s: FxState, t: number, dt: number, reduced: boolean) {
    const tt = reduced ? 0 : t;
    for (const [id, slot] of this.slots) {
      const w = s[id] ?? 0;
      slot.obj.visible = w > 0.004;
      if (!slot.obj.visible) continue;
      const e = 1 - (1 - w) * (1 - w);
      slot.obj.position.set(0, (1 - e) * slot.drop, (1 - e) * 0.6);
      for (const mm of slot.mats) mm.opacity = Math.min(1, w * 1.6);
    }

    // radar
    const rw = s.radar;
    this.radar.visible = rw > 0.004;
    if (this.radar.visible) {
      if (!reduced) {
        this.sweep += this.sweepDir * dt * 1.15;
        if (this.sweep > 1.0) this.sweepDir = -1;
        if (this.sweep < -1.0) this.sweepDir = 1;
      } else this.sweep = 0;
      this.radarMat.uniforms.uW!.value = rw;
      this.radarMat.uniforms.uSweep!.value = this.sweep;
      this.radarMat.uniforms.uDir!.value = this.sweepDir;
    }

    this.pulse.visible = s.pulse > 0.004;
    this.pulseMat.uniforms.uW!.value = s.pulse;
    this.pulseMat.uniforms.uTime!.value = reduced ? 0.4 : t;

    this.deck.visible = s.deck > 0.004;
    this.deckMat.uniforms.uW!.value = s.deck;

    this.ribbons.visible = s.vortex > 0.004;
    this.ribbonMat.uniforms.uW!.value = s.vortex;
    this.ribbonMat.uniforms.uTime!.value = tt;

    this.shock.visible = s.shock > 0.004;
    this.shockMat.uniforms.uW!.value = s.shock;
    this.shockMat.uniforms.uTime!.value = tt;
    this.diamonds.visible = this.shock.visible;
    this.diamondMat.uniforms.uW!.value = s.shock;
    this.diamondMat.uniforms.uTime!.value = tt;

    const cw = s.cue;
    this.cueLine.visible = this.cueSprite.visible = cw > 0.004;
    (this.cueLine.material as THREE.LineDashedMaterial).opacity = cw * 0.8;
    const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 6);
    this.cueSprite.material.opacity = cw * pulse;
  }

  dispose() {
    const done = new Set<unknown>();
    const kill = (o: THREE.Object3D) => {
      o.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (mesh.geometry && !done.has(mesh.geometry)) {
          done.add(mesh.geometry);
          mesh.geometry.dispose();
        }
        const mm = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (mm)
          for (const x of Array.isArray(mm) ? mm : [mm]) {
            if (done.has(x)) continue;
            done.add(x);
            x.dispose();
          }
      });
    };
    kill(this.parts);
    kill(this.effects);
    Object.values(this.mats).forEach((x) => x.dispose());
    this.cueTex.dispose();
  }
}
