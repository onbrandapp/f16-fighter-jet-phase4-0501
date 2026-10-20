import * as THREE from "three";

/**
 * History backdrop: a full-screen terrain plate drawn right after the sky and
 * before the aircraft, so the top-down jet flies over each era's ground. Two
 * texture slots crossfade when the active milestone changes; the plate drifts
 * with the timeline so the ground scrolls under the jet. A scrim darkens the
 * list side (left on desktop, everywhere on portrait) to keep text legible.
 */
export const HIST_PLATES = [0, 1, 2, 3, 4, 5, 6].map((i) => `/media/hist_${i}.jpg`);
/** per-plate gain: bright plates (lakebed, ice) are pulled down harder */
const GAIN = [0.66, 0.72, 0.9, 0.8, 0.8, 0.58, 0.95];

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const frag = /* glsl */ `
  uniform sampler2D tA;
  uniform sampler2D tB;
  uniform float uMix;
  uniform float uOpacity;
  uniform float uGainA;
  uniform float uGainB;
  uniform float uAspect;   // viewport w/h
  uniform float uImgAspect;
  uniform float uDrift;    // 0..1 along the timeline
  uniform float uPortrait;
  varying vec2 vUv;
  vec2 cover(vec2 uv) {
    vec2 s = uAspect > uImgAspect ? vec2(1.0, uImgAspect / uAspect) : vec2(uAspect / uImgAspect, 1.0);
    s /= 1.14; // headroom for the drift
    vec2 c = (uv - 0.5) * s + 0.5;
    c.y += (uDrift - 0.5) * (1.0 - s.y) * 0.9;
    return c;
  }
  void main() {
    vec2 uv = cover(vUv);
    vec3 a = texture2D(tA, uv).rgb * uGainA;
    vec3 b = texture2D(tB, uv).rgb * uGainB;
    vec3 col = mix(a, b, uMix);
    // scrim: list side darker, track side open
    float side = mix(smoothstep(0.08, 0.78, vUv.x), 0.0, uPortrait);
    col *= mix(mix(0.42, 0.36, uPortrait), 0.95, side);
    // soft top/bottom falloff into the page ink
    float edge = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.84, vUv.y);
    col = mix(vec3(0.012, 0.014, 0.018), col, 0.55 + 0.45 * edge);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

export class HistBackdrop {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private tex: (THREE.Texture | null)[] = HIST_PLATES.map(() => null);
  private loading = false;
  private a = 0;
  private b = 0;
  private mix = 1;
  private blank = new THREE.DataTexture(new Uint8Array([4, 5, 6, 255]), 1, 1);

  constructor() {
    this.blank.needsUpdate = true;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        tA: { value: this.blank },
        tB: { value: this.blank },
        uMix: { value: 1 },
        uOpacity: { value: 0 },
        uGainA: { value: 0 },
        uGainB: { value: 0 },
        uAspect: { value: 1.6 },
        uImgAspect: { value: 1920 / 1088 },
        uDrift: { value: 0 },
        uPortrait: { value: 0 },
      },
      // stays in the opaque list (drawn before the jet) but still blends
      transparent: false,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -0.5;
    this.mesh.visible = false;
  }

  /** start fetching plates (call once the reader is heading toward history) */
  preload() {
    if (this.loading) return;
    this.loading = true;
    const loader = new THREE.TextureLoader();
    HIST_PLATES.forEach((url, i) => {
      loader.load(url, (t) => {
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        this.tex[i] = t;
      });
    });
  }

  setViewport(w: number, h: number) {
    this.mat.uniforms.uAspect!.value = w / h;
    this.mat.uniforms.uPortrait!.value = w / h < 0.9 ? 1 : 0;
  }

  update(weight: number, row: number, drift: number, dt: number, reduced: boolean) {
    const u = this.mat.uniforms;
    const on = weight > 0.002;
    this.mesh.visible = on;
    if (!on) return;
    this.preload();
    row = Math.max(0, Math.min(HIST_PLATES.length - 1, row));
    if (row !== this.b && this.tex[row]) {
      if (this.mix > 0.5) this.a = this.b;
      this.b = row;
      this.mix = reduced ? 1 : 0;
    }
    if (this.mix < 1) this.mix = reduced ? 1 : Math.min(1, this.mix + dt / 0.7);
    const ta = this.tex[this.a];
    const tb = this.tex[this.b];
    u.tA!.value = ta ?? this.blank;
    u.tB!.value = tb ?? this.blank;
    u.uGainA!.value = ta ? GAIN[this.a]! : 1;
    u.uGainB!.value = tb ? GAIN[this.b]! : 1;
    const m = this.mix;
    u.uMix!.value = m * m * (3 - 2 * m);
    u.uOpacity!.value = weight * weight * (3 - 2 * weight);
    u.uDrift!.value = reduced ? 0.5 : drift;
  }

  dispose() {
    this.tex.forEach((t) => t?.dispose());
    this.blank.dispose();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
