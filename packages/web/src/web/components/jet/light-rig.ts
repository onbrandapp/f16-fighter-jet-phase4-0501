import * as THREE from "three";

/**
 * Light rhythm. Each page section owns a palette: sky gradient, the five
 * scene lights, exposure and env reflections. The rig eases the live values
 * toward whichever palette the flight director's station asks for, so
 * scrolling reads as light → dark → warm → cold. Reduced motion snaps.
 */

export type Palette = {
  top: string;
  horizon: string;
  bottom: string;
  glow: string;
  glowDir: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  key: string;
  keyI: number;
  keyPos: [number, number, number];
  rim: string;
  rimI: number;
  fill: string;
  fillI: number;
  bounce: string;
  bounceI: number;
  exposure: number;
  env: number;
};

// Sky hexes are display values (the sky shader writes them untouched). The
// storm values equal the original hand-tuned sky after linear conversion.
const STORM: Palette = {
  top: "#000000",
  horizon: "#010102",
  bottom: "#000001",
  glow: "#030406",
  glowDir: [-0.55, 0.45, -0.7],
  hemiSky: "#7d8a9c",
  hemiGround: "#0a0b0d",
  hemi: 0.25,
  key: "#d5dde8",
  keyI: 1.25,
  keyPos: [-9, 16, -10],
  rim: "#9fb1c9",
  rimI: 1.1,
  fill: "#5d6878",
  fillI: 0.3,
  bounce: "#3a3f47",
  bounceI: 0.4,
  exposure: 0.82,
  env: 0.22,
};

const p = (o: Partial<Palette>): Palette => ({ ...STORM, ...o });

export const PALETTES = {
  storm: STORM,
  // Performance: clear, high and bright — the page's first "light" beat
  perf: p({
    top: "#08111d",
    horizon: "#1f3046",
    bottom: "#090e15",
    glow: "#34506e",
    glowDir: [-0.5, 0.35, -0.8],
    hemiSky: "#9db4d2",
    hemiGround: "#12161c",
    hemi: 0.42,
    key: "#eef3fa",
    keyI: 1.7,
    keyPos: [-8, 17, -9],
    rim: "#b4cbe8",
    rimI: 1.2,
    fill: "#6f8098",
    fillI: 0.38,
    bounce: "#56606e",
    bounceI: 0.42,
    exposure: 0.92,
    env: 0.3,
  }),
  // Supersonic card: golden hour, low warm sun from the left
  gold: p({
    top: "#150c0a",
    horizon: "#5e2e12",
    bottom: "#140a04",
    glow: "#a85020",
    glowDir: [-0.85, 0.16, -0.5],
    hemiSky: "#d29a70",
    hemiGround: "#1c100a",
    hemi: 0.36,
    key: "#ffb36e",
    keyI: 2.1,
    keyPos: [-15, 8, -8],
    rim: "#ff9a52",
    rimI: 1.45,
    fill: "#5b4c5e",
    fillI: 0.28,
    bounce: "#7a4a2c",
    bounceI: 0.55,
    exposure: 0.95,
    env: 0.28,
  }),
  // Turn explainer: cold clear blue at altitude
  turn: p({
    top: "#05112a",
    horizon: "#24507e",
    bottom: "#081322",
    glow: "#6e9ee0",
    glowDir: [0.3, 0.6, -0.7],
    hemiSky: "#a6c6ee",
    hemiGround: "#142030",
    hemi: 0.5,
    key: "#f2f7ff",
    keyI: 1.85,
    keyPos: [-5, 20, -7],
    rim: "#bcd6ff",
    rimI: 1.05,
    fill: "#7088aa",
    fillI: 0.38,
    bounce: "#4c5e78",
    bounceI: 0.45,
    exposure: 0.96,
    env: 0.32,
  }),
};

/** History rows, in MILESTONES order: each era's light over its terrain */
export const HIST_PALETTES: Palette[] = [
  // 1974 Mojave lakebed, midday high key
  p({ bottom: "#3a362e", hemiSky: "#f0e6d4", hemiGround: "#8a7c62", hemi: 0.65, key: "#fff4e4", keyI: 2.0, keyPos: [-3, 22, -4], rim: "#e8dcc8", rimI: 0.9, fill: "#a09482", fillI: 0.4, bounce: "#b0a080", bounceI: 0.6, exposure: 0.98, env: 0.34 }),
  // 1979 Wasatch snow, blue morning
  p({ bottom: "#16202e", hemiSky: "#aec8ea", hemiGround: "#6a7c94", hemi: 0.55, key: "#e2ecff", keyI: 1.8, keyPos: [-10, 14, -8], rim: "#c2d8ff", rimI: 1.1, fill: "#7a8cab", fillI: 0.4, bounce: "#8494ac", bounceI: 0.55, exposure: 0.95, env: 0.32 }),
  // 1981 violet dusk river
  p({ bottom: "#1a1020", hemiSky: "#8e70a8", hemiGround: "#2a1a2c", hemi: 0.42, key: "#ff9c7c", keyI: 1.35, keyPos: [-14, 8, -6], rim: "#a888ff", rimI: 1.2, fill: "#5a4870", fillI: 0.32, bounce: "#4a2c3a", bounceI: 0.45, exposure: 0.9, env: 0.26 }),
  // 1991 Desert Storm dawn
  p({ bottom: "#2a160a", hemiSky: "#e4a874", hemiGround: "#5c321a", hemi: 0.48, key: "#ffb877", keyI: 2.0, keyPos: [-15, 9, -6], rim: "#ffa060", rimI: 1.3, fill: "#6a5048", fillI: 0.3, bounce: "#8a5430", bounceI: 0.6, exposure: 0.95, env: 0.28 }),
  // 1994–99 Balkans, overcast green
  p({ bottom: "#141a14", hemiSky: "#a8b2ae", hemiGround: "#2e3c2e", hemi: 0.62, key: "#cfd6d2", keyI: 1.15, keyPos: [-4, 20, -6], rim: "#b4c0bc", rimI: 0.8, fill: "#7a8680", fillI: 0.42, bounce: "#3e4c3c", bounceI: 0.5, exposure: 0.92, env: 0.3 }),
  // 2001– arctic pack ice, white
  p({ bottom: "#1c2630", hemiSky: "#e4f2ff", hemiGround: "#a4bccc", hemi: 0.72, key: "#f4faff", keyI: 1.85, keyPos: [-8, 18, -6], rim: "#d8ecff", rimI: 1.0, fill: "#9cb0c4", fillI: 0.45, bounce: "#c0d4e2", bounceI: 0.7, exposure: 0.96, env: 0.36 }),
  // Today: blue hour, city light from below
  p({ bottom: "#0a0e1c", hemiSky: "#4e5e90", hemiGround: "#2a1e1a", hemi: 0.42, key: "#8aa0d0", keyI: 1.1, keyPos: [-8, 16, -10], rim: "#ffb070", rimI: 0.9, fill: "#4a5680", fillI: 0.32, bounce: "#a06838", bounceI: 0.55, exposure: 0.9, env: 0.24 }),
];

/** Variants: AB blue winter morning, CD desert-tan dawn, EF amber sunset, V cold silver */
export const VAR_PALETTES: Record<string, Palette> = {
  ab: p({
    top: "#06122a",
    horizon: "#22487a",
    bottom: "#0a1220",
    glow: "#6c9ce0",
    glowDir: [0.5, 0.5, -0.7],
    hemiSky: "#a8c6ee",
    hemiGround: "#2a3446",
    hemi: 0.5,
    key: "#e8f0ff",
    keyI: 1.8,
    keyPos: [-8, 16, -9],
    rim: "#c4daff",
    rimI: 1.15,
    fill: "#7288aa",
    fillI: 0.38,
    bounce: "#7a8aa6",
    bounceI: 0.5,
    exposure: 0.95,
    env: 0.32,
  }),
  cd: p({
    top: "#18130d",
    horizon: "#7a5634",
    bottom: "#16100a",
    glow: "#d8a464",
    glowDir: [-0.7, 0.25, -0.6],
    hemiSky: "#d6b08a",
    hemiGround: "#3c2a1c",
    hemi: 0.45,
    key: "#ffd2a0",
    keyI: 1.8,
    keyPos: [-13, 10, -8],
    rim: "#f0b080",
    rimI: 1.2,
    fill: "#6a5a50",
    fillI: 0.32,
    bounce: "#8a6a48",
    bounceI: 0.55,
    exposure: 0.94,
    env: 0.28,
  }),
  ef: p({
    top: "#1e0f07",
    horizon: "#94400e",
    bottom: "#1a0c04",
    glow: "#ff7a26",
    glowDir: [0.75, 0.18, -0.55],
    hemiSky: "#e08a58",
    hemiGround: "#2a1408",
    hemi: 0.4,
    key: "#ff9e58",
    keyI: 2.1,
    keyPos: [14, 8, -8],
    rim: "#ff8a40",
    rimI: 1.4,
    fill: "#5a3e44",
    fillI: 0.28,
    bounce: "#8a4420",
    bounceI: 0.6,
    exposure: 0.95,
    env: 0.26,
  }),
  v: p({
    top: "#0d1117",
    horizon: "#4a5666",
    bottom: "#0d1016",
    glow: "#c6d2e0",
    glowDir: [-0.8, 0.12, -0.55],
    hemiSky: "#b8c2ce",
    hemiGround: "#283038",
    hemi: 0.5,
    key: "#e4e8ee",
    keyI: 1.45,
    keyPos: [-15, 7, -8],
    rim: "#c8d2de",
    rimI: 1.2,
    fill: "#6a7684",
    fillI: 0.38,
    bounce: "#5a6470",
    bounceI: 0.5,
    exposure: 0.92,
    env: 0.3,
  }),
};

type Live = {
  top: THREE.Color;
  horizon: THREE.Color;
  bottom: THREE.Color;
  glow: THREE.Color;
  glowDir: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  key: THREE.Color;
  keyPos: THREE.Vector3;
  rim: THREE.Color;
  fill: THREE.Color;
  bounce: THREE.Color;
  hemi: number;
  keyI: number;
  rimI: number;
  fillI: number;
  bounceI: number;
  exposure: number;
  env: number;
};

const COLORS = ["top", "horizon", "bottom", "glow", "hemiSky", "hemiGround", "key", "rim", "fill", "bounce"] as const;
const NUMS = ["hemi", "keyI", "rimI", "fillI", "bounceI", "exposure", "env"] as const;

function toLive(pl: Palette): Live {
  return {
    top: new THREE.Color(pl.top),
    horizon: new THREE.Color(pl.horizon),
    bottom: new THREE.Color(pl.bottom),
    glow: new THREE.Color(pl.glow),
    glowDir: new THREE.Vector3(...pl.glowDir).normalize(),
    hemiSky: new THREE.Color(pl.hemiSky),
    hemiGround: new THREE.Color(pl.hemiGround),
    key: new THREE.Color(pl.key),
    keyPos: new THREE.Vector3(...pl.keyPos),
    rim: new THREE.Color(pl.rim),
    fill: new THREE.Color(pl.fill),
    bounce: new THREE.Color(pl.bounce),
    hemi: pl.hemi,
    keyI: pl.keyI,
    rimI: pl.rimI,
    fillI: pl.fillI,
    bounceI: pl.bounceI,
    exposure: pl.exposure,
    env: pl.env,
  };
}

function copyLive(out: Live, a: Live) {
  for (const k of COLORS) out[k].copy(a[k]);
  out.glowDir.copy(a.glowDir);
  out.keyPos.copy(a.keyPos);
  for (const k of NUMS) out[k] = a[k];
}

function lerpLive(out: Live, a: Live, b: Live, t: number) {
  for (const k of COLORS) out[k].copy(a[k]).lerp(b[k], t);
  out.glowDir.copy(a.glowDir).lerp(b.glowDir, t).normalize();
  out.keyPos.copy(a.keyPos).lerp(b.keyPos, t);
  for (const k of NUMS) out[k] = a[k] + (b[k] - a[k]) * t;
}

export type LightTarget = { a: string; b?: string; t?: number };

export class LightRig {
  readonly hemi = new THREE.HemisphereLight();
  readonly key = new THREE.DirectionalLight();
  readonly rim = new THREE.DirectionalLight();
  readonly fill = new THREE.DirectionalLight();
  readonly bounce = new THREE.DirectionalLight();
  private lib = new Map<string, Live>();
  private cur: Live;
  private goal: Live;
  private first = true;

  constructor(
    scene: THREE.Scene,
    private sky: THREE.ShaderMaterial,
    private renderer: THREE.WebGLRenderer,
  ) {
    for (const [k, v] of Object.entries(PALETTES)) this.lib.set(k, toLive(v));
    HIST_PALETTES.forEach((v, i) => this.lib.set(`hist${i}`, toLive(v)));
    for (const [k, v] of Object.entries(VAR_PALETTES)) this.lib.set(`var-${k}`, toLive(v));
    this.cur = toLive(STORM);
    this.goal = toLive(STORM);
    this.rim.position.set(14, 5, 18);
    this.fill.position.set(18, -2, -4);
    this.bounce.position.set(0, -10, 2);
    scene.add(this.hemi, this.key, this.rim, this.fill, this.bounce);
    this.apply(scene);
  }

  /** ease toward the target palette (optionally a blend of two) */
  update(scene: THREE.Scene, target: LightTarget, dt: number, reduced: boolean) {
    const a = this.lib.get(target.a) ?? this.lib.get("storm")!;
    const b = target.b ? this.lib.get(target.b) : undefined;
    if (b && target.t) lerpLive(this.goal, a, b, Math.min(1, Math.max(0, target.t)));
    else copyLive(this.goal, a);
    if (reduced || this.first) {
      copyLive(this.cur, this.goal);
      this.first = false;
    } else if (dt > 0) lerpLive(this.cur, this.cur, this.goal, 1 - Math.exp(-dt * 2.2));
    this.apply(scene);
  }

  private apply(scene: THREE.Scene) {
    const c = this.cur;
    const u = this.sky.uniforms;
    // palette colours live in linear space; the sky shader has no output
    // conversion, so hand it display (sRGB) values
    (u.uTop!.value as THREE.Color).copy(c.top).convertLinearToSRGB();
    (u.uHorizon!.value as THREE.Color).copy(c.horizon).convertLinearToSRGB();
    (u.uBottom!.value as THREE.Color).copy(c.bottom).convertLinearToSRGB();
    (u.uGlowColor!.value as THREE.Color).copy(c.glow).convertLinearToSRGB();
    (u.uGlowDir!.value as THREE.Vector3).copy(c.glowDir);
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemi;
    this.key.color.copy(c.key);
    this.key.intensity = c.keyI;
    this.key.position.copy(c.keyPos);
    this.rim.color.copy(c.rim);
    this.rim.intensity = c.rimI;
    this.fill.color.copy(c.fill);
    this.fill.intensity = c.fillI;
    this.bounce.color.copy(c.bounce);
    this.bounce.intensity = c.bounceI;
    this.renderer.toneMappingExposure = c.exposure;
    scene.environmentIntensity = c.env;
  }
}
