import * as THREE from "three";

/**
 * The footer's FALCON wordmark, drawn inside the WebGL frame (after the sky,
 * before the aircraft) so the jet genuinely passes in front of it. The
 * letters sit dark and engraved until the afterburner comes near: a hot core
 * around the nozzle, a streak trailing behind it, and a slow ember memory on
 * the letters the jet has already passed.
 *
 * Its screen rect comes from the DOM anchor `[data-flight="foot"]`, which
 * shares the text canvas' aspect ratio.
 */
export const WORD = "FALCON";
const TEX_W = 2400;
const TEX_H = 560;
export const WORD_ASPECT = TEX_W / TEX_H;

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const frag = /* glsl */ `
  uniform sampler2D tText;
  uniform vec4 uRect;     // x0 y0 x1 y1, GL uv (y up)
  uniform vec2 uNoz;      // nozzle, GL uv
  uniform float uAspect;  // viewport w/h
  uniform float uHeat;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 q = (vUv - uRect.xy) / (uRect.zw - uRect.xy);
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
    vec4 tx = texture2D(tText, q);
    float fill = tx.r;
    float edge = tx.g;
    float a = max(fill, edge);
    if (a < 0.003) discard;

    vec2 d = (vUv - uNoz) * vec2(uAspect, 1.0);
    float behind = max(d.x, 0.0);
    float core = exp(-dot(d, d) / 0.018);
    float trail = exp(-pow(d.y / 0.075, 2.0)) * exp(-behind / 0.45) * smoothstep(-0.03, 0.04, d.x);
    float memory = smoothstep(-0.05, 0.35, d.x) * exp(-behind / 1.4) * 0.32;
    float heat = uHeat * (core * 1.25 + trail * 0.75 + memory);

    // engraved steel at rest: faint top-lit face, a thin bright rim
    vec3 base = vec3(0.040, 0.046, 0.056) * (0.65 + 0.7 * q.y) * fill + vec3(0.15, 0.16, 0.18) * edge * 0.55;
    vec3 hot = mix(vec3(1.0, 0.34, 0.07), vec3(1.0, 0.84, 0.58), clamp(heat - 0.55, 0.0, 1.0));
    vec3 col = base + hot * heat * (fill * 0.85 + edge * 0.9);
    gl_FragColor = vec4(col, a * uOpacity);
  }
`;

export class FootWordmark {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private canvas: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private drawn = false;
  private w = 1;
  private h = 1;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = TEX_W;
    this.canvas.height = TEX_H;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.generateMipmaps = true;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        tText: { value: this.tex },
        uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uNoz: { value: new THREE.Vector2(2, 0.5) },
        uAspect: { value: 1.6 },
        uHeat: { value: 0 },
        uOpacity: { value: 0 },
      },
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
    this.mesh.renderOrder = -0.4;
    this.mesh.visible = false;
  }

  private draw() {
    if (this.drawn) return;
    this.drawn = true;
    const paint = () => {
      const c = this.canvas.getContext("2d");
      if (!c) return;
      c.clearRect(0, 0, TEX_W, TEX_H);
      let size = 540;
      const font = (s: number) => `400 ${s}px "Instrument Serif", "Times New Roman", serif`;
      c.font = font(size);
      if ("letterSpacing" in c) (c as unknown as { letterSpacing: string }).letterSpacing = "0.02em";
      const m = c.measureText(WORD);
      size = Math.min(size, (size * (TEX_W * 0.96)) / Math.max(1, m.width));
      c.font = font(size);
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      const mm = c.measureText(WORD);
      const asc = mm.actualBoundingBoxAscent || size * 0.7;
      const desc = mm.actualBoundingBoxDescent || 0;
      const y = TEX_H / 2 + (asc - desc) / 2;
      c.fillStyle = "#ff0000";
      c.fillText(WORD, TEX_W / 2, y);
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = "#00ff00";
      c.lineWidth = 3;
      c.strokeText(WORD, TEX_W / 2, y);
      c.globalCompositeOperation = "source-over";
      this.tex.needsUpdate = true;
    };
    paint();
    // redraw once the display face is ready
    document.fonts?.load('400 100px "Instrument Serif"').then(paint, () => undefined);
  }

  setViewport(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.mat.uniforms.uAspect!.value = w / h;
  }

  /**
   * rect: anchor box in viewport px (null hides). noz: nozzle in viewport px.
   * heat 0..1, opacity 0..1.
   */
  update(rect: DOMRect | null, noz: { x: number; y: number } | null, heat: number, opacity: number) {
    const on = !!rect && opacity > 0.002 && rect.width > 1;
    this.mesh.visible = on;
    if (!on || !rect) return;
    this.draw();
    const u = this.mat.uniforms;
    const W = this.w;
    const H = this.h;
    (u.uRect!.value as THREE.Vector4).set(rect.left / W, 1 - rect.bottom / H, rect.right / W, 1 - rect.top / H);
    if (noz) (u.uNoz!.value as THREE.Vector2).set(noz.x / W, 1 - noz.y / H);
    u.uHeat!.value = heat;
    u.uOpacity!.value = opacity;
  }

  dispose() {
    this.tex.dispose();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
