import * as THREE from "three";
import { createCloudAtlas } from "./cloud-texture";

// Layered billboard cloud field. Positions are recycled along the flight axis
// on the CPU and re-sorted back-to-front every frame so the soft sprites blend
// correctly. Recycling happens deep inside fog with edge fades, so the loop
// never shows a visible reset.

const Z_MIN = -280;
const Z_MAX = 150;
const RANGE = Z_MAX - Z_MIN;
const EDGE_FADE = 55;

type Layer = {
  count: number;
  x: [number, number];
  y: [number, number];
  scale: [number, number];
  alpha: [number, number];
  keepOut: { x: number; y: number };
};

const vertex = /* glsl */ `
  attribute vec4 aOffset;   // xyz world center, w rotation
  attribute vec4 aParams;   // x scale, y variant, z alpha, w tint
  uniform vec3 uLightPos;
  uniform float uGlowRadius;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vGlow;
  varying float vDepth;
  varying float vTint;
  varying float vHeight;
  void main() {
    float variant = aParams.y;
    vec2 cell = vec2(mod(variant, 2.0), floor(variant / 2.0));
    vUv = (uv + cell) * 0.5;
    vec4 mv = modelViewMatrix * vec4(aOffset.xyz, 1.0);
    float c = cos(aOffset.w);
    float s = sin(aOffset.w);
    vec2 corner = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
    mv.xy += corner * aParams.x;
    gl_Position = projectionMatrix * mv;
    vDepth = -mv.z;
    float nearFade = smoothstep(1.0, 3.0 + aParams.x * 0.55, vDepth);
    vAlpha = aParams.z * nearFade;
    vec3 d = aOffset.xyz - uLightPos;
    d.y *= 1.6;
    vGlow = exp(-dot(d, d) / (uGlowRadius * uGlowRadius));
    vTint = aParams.w;
    vHeight = aOffset.y;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uShadow;
  uniform vec3 uLit;
  uniform vec3 uFog;
  uniform float uFogDensity;
  uniform float uAmbient;
  uniform float uGlowStrength;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vGlow;
  varying float vDepth;
  varying float vTint;
  varying float vHeight;
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    float density = t.r * (0.8 + 0.4 * t.b);
    float alpha = density * vAlpha;
    if (alpha < 0.004) discard;
    float lit = pow(t.g, 1.3) * (0.85 + 0.3 * t.b);
    float heightLight = smoothstep(-34.0, 20.0, vHeight);
    float energy = uAmbient * (0.55 + 0.9 * heightLight) * vTint + vGlow * uGlowStrength;
    vec3 col = mix(uShadow, uLit, clamp(lit * energy, 0.0, 1.0));
    col += uLit * vGlow * 0.08 * (1.0 - t.r);
    float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 1.45));
    col = mix(col, uFog, clamp(fog, 0.0, 1.0));
    float a = alpha * (1.0 - fog * 0.55);
    gl_FragColor = vec4(col * a, a); // premultiplied
  }
`;

export class CloudField {
  readonly mesh: THREE.Mesh;
  private readonly count: number;
  private readonly base: Float32Array; // x, y, z, rot
  private readonly params: Float32Array; // scale, variant, alpha, tint
  private readonly offsetAttr: THREE.InstancedBufferAttribute;
  private readonly paramAttr: THREE.InstancedBufferAttribute;
  private readonly order: Uint32Array;
  private readonly dist: Float32Array;
  private readonly world = new Float32Array(0);
  private readonly material: THREE.ShaderMaterial;
  private readonly atlas: THREE.Texture;
  private readonly fade: Float32Array;

  constructor(quality: number) {
    const q = Math.max(0.4, Math.min(1, quality));
    const layers: Layer[] = [
      // dense floor of cloud below the aircraft
      { count: Math.round(260 * q), x: [-170, 170], y: [-34, -10], scale: [34, 74], alpha: [0.55, 0.95], keepOut: { x: 0, y: 0 } },
      // scattered mid-level cumulus all around
      { count: Math.round(250 * q), x: [-150, 150], y: [-12, 24], scale: [14, 38], alpha: [0.4, 0.85], keepOut: { x: 17, y: 11 } },
      // ceiling overhead
      { count: Math.round(90 * q), x: [-190, 190], y: [28, 60], scale: [55, 95], alpha: [0.35, 0.65], keepOut: { x: 0, y: 0 } },
      // near wisps for parallax
      { count: Math.round(130 * q), x: [-26, 26], y: [-10, 10], scale: [4, 11], alpha: [0.12, 0.3], keepOut: { x: 8, y: 5.5 } },
    ];
    this.count = layers.reduce((s, l) => s + l.count, 0);
    this.base = new Float32Array(this.count * 4);
    this.params = new Float32Array(this.count * 4);
    this.order = new Uint32Array(this.count);
    this.dist = new Float32Array(this.count);
    this.fade = new Float32Array(this.count).fill(1);
    this.world = new Float32Array(this.count * 3);

    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const range = (r: [number, number]) => r[0] + (r[1] - r[0]) * rnd();

    let i = 0;
    for (const layer of layers) {
      for (let n = 0; n < layer.count; n++, i++) {
        let x = 0;
        let y = 0;
        for (let tries = 0; tries < 20; tries++) {
          x = range(layer.x);
          y = range(layer.y);
          if (Math.abs(x) > layer.keepOut.x || Math.abs(y) > layer.keepOut.y) break;
        }
        this.base[i * 4] = x;
        this.base[i * 4 + 1] = y;
        this.base[i * 4 + 2] = Z_MIN + rnd() * RANGE;
        this.base[i * 4 + 3] = (rnd() - 0.5) * 0.5;
        this.params[i * 4] = range(layer.scale);
        this.params[i * 4 + 1] = Math.floor(rnd() * 4);
        this.params[i * 4 + 2] = range(layer.alpha);
        this.params[i * 4 + 3] = 0.6 + rnd() * 0.8;
      }
    }

    const plane = new THREE.PlaneGeometry(1.7, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute("position", plane.getAttribute("position"));
    geo.setAttribute("uv", plane.getAttribute("uv"));
    this.offsetAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 4), 4);
    this.paramAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 4), 4);
    this.offsetAttr.setUsage(THREE.DynamicDrawUsage);
    this.paramAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aOffset", this.offsetAttr);
    geo.setAttribute("aParams", this.paramAttr);
    geo.instanceCount = this.count;

    this.atlas = createCloudAtlas();
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        uAtlas: { value: this.atlas },
        uShadow: { value: new THREE.Color("#06080b") },
        uLit: { value: new THREE.Color("#b4bcc8") },
        uFog: { value: new THREE.Color("#050608") },
        uFogDensity: { value: 0.0125 },
        uAmbient: { value: 0.78 },
        uGlowStrength: { value: 1.45 },
        uLightPos: { value: new THREE.Vector3(-3, 4, -4) },
        uGlowRadius: { value: 46 },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  private tmp = new THREE.Vector3();
  private seg = new THREE.Vector3();

  update(travel: number, camera: THREE.Camera, focus: THREE.Vector3) {
    const cam = camera.position;
    const seg = this.seg.subVectors(focus, cam);
    const segLen2 = Math.max(1e-4, seg.lengthSq());
    for (let i = 0; i < this.count; i++) {
      const b = i * 4;
      let z = this.base[b + 2]! + travel;
      z = Z_MIN + ((((z - Z_MIN) % RANGE) + RANGE) % RANGE);
      const x = this.base[b]!;
      const y = this.base[b + 1]!;
      this.world[i * 3] = x;
      this.world[i * 3 + 1] = y;
      this.world[i * 3 + 2] = z;
      const edge = Math.min(1, (z - Z_MIN) / EDGE_FADE, (Z_MAX - z) / EDGE_FADE);
      // keep the aircraft unobstructed: soften puffs on the camera→jet line
      const p = this.tmp.set(x - cam.x, y - cam.y, z - cam.z);
      const t = p.dot(seg) / segLen2;
      let occl = 1;
      if (t > 0 && t < 1.05) {
        const closest = p.addScaledVector(seg, -t).length();
        const r = this.params[b]! * 0.55 + 7;
        occl = 0.12 + 0.88 * smooth(r * 0.5, r, closest);
      }
      this.fade[i] = Math.max(0, edge) * occl;
      const dx = x - cam.x;
      const dy = y - cam.y;
      const dz = z - cam.z;
      this.dist[i] = dx * dx + dy * dy + dz * dz;
      this.order[i] = i;
    }
    const dist = this.dist;
    this.order.sort((a, b) => dist[b]! - dist[a]!);

    const off = this.offsetAttr.array as Float32Array;
    const par = this.paramAttr.array as Float32Array;
    for (let k = 0; k < this.count; k++) {
      const i = this.order[k]!;
      off[k * 4] = this.world[i * 3]!;
      off[k * 4 + 1] = this.world[i * 3 + 1]!;
      off[k * 4 + 2] = this.world[i * 3 + 2]!;
      off[k * 4 + 3] = this.base[i * 4 + 3]!;
      par[k * 4] = this.params[i * 4]!;
      par[k * 4 + 1] = this.params[i * 4 + 1]!;
      par[k * 4 + 2] = this.params[i * 4 + 2]! * this.fade[i]!;
      par[k * 4 + 3] = this.params[i * 4 + 3]!;
    }
    this.offsetAttr.needsUpdate = true;
    this.paramAttr.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
