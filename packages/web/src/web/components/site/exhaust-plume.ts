import * as THREE from "three";

/**
 * Exhaust plume for the top-down jet: a soft particle stream emitted from the
 * nozzle in world space, so as the aircraft travels down the column the
 * exhaust is left hanging behind it, cooling from amber to grey smoke and
 * fading. A small afterburner glow sits in the nozzle and brightens with speed.
 */

const COUNT = 420;
const LIFE = 1.5; // s
const EXHAUST_SPEED = 5.5; // world units / s, rearward
const BASE_RATE = 46; // particles / s when holding position
const SPEED_RATE = 150; // extra particles / s at full travel speed
/** puffs closer than this behind the nozzle (world units) are cleared */
const CLEAR = 0.2;

const plumeVert = /* glsl */ `
  attribute float aAge;
  attribute float aSeed;
  uniform float uScale;
  varying float vAge;
  varying float vSeed;
  void main() {
    vAge = aAge;
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float a = clamp(aAge, 0.0, 1.0);
    float size = mix(0.38, 2.9, pow(a, 0.6)) * (0.75 + 0.5 * aSeed);
    gl_PointSize = aAge >= 1.0 ? 0.0 : size * uScale;
  }
`;

const plumeFrag = /* glsl */ `
  uniform float uHeat;
  varying float vAge;
  varying float vSeed;
  void main() {
    if (vAge >= 1.0) discard;
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    float soft = 1.0 - smoothstep(0.0, 1.0, r);
    soft *= soft;
    vec3 core = vec3(1.0, 0.86, 0.62);
    vec3 hot = vec3(1.0, 0.52, 0.2);
    vec3 smoke = vec3(0.56, 0.6, 0.67);
    float cool = smoothstep(0.02, 0.24 + 0.1 * uHeat, vAge);
    vec3 col = mix(mix(core, hot, smoothstep(0.0, 0.06, vAge)), smoke, cool);
    float fade = pow(1.0 - vAge, 1.6);
    float a = soft * fade * mix(0.95, 0.2 + 0.06 * vSeed, cool);
    gl_FragColor = vec4(col * a, a);
  }
`;

const glowVert = /* glsl */ `
  attribute float aSize;
  attribute float aTone;
  uniform float uScale;
  uniform float uHeat;
  varying float vTone;
  void main() {
    vTone = aTone;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (0.75 + 0.55 * uHeat) * uScale;
  }
`;

const glowFrag = /* glsl */ `
  uniform float uHeat;
  uniform float uFlicker;
  varying float vTone;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float soft = pow(1.0 - r, 2.2);
    vec3 col = mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 0.45, 0.16), vTone);
    float a = soft * (0.55 + 0.45 * uHeat) * uFlicker;
    gl_FragColor = vec4(col * a, a);
  }
`;

export class ExhaustPlume {
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(COUNT * 3);
  private vel = new Float32Array(COUNT * 3);
  private age = new Float32Array(COUNT).fill(1);
  private life = new Float32Array(COUNT).fill(LIFE);
  private seed = new Float32Array(COUNT);
  private head = 0;
  private carry = 0;
  private points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private glowMat: THREE.ShaderMaterial;
  private glowGeo = new THREE.BufferGeometry();
  readonly glow: THREE.Points;

  private nozzleW = new THREE.Vector3();
  private prevNozzle = new THREE.Vector3();
  private hasPrev = false;
  private rear = new THREE.Vector3();
  private q = new THREE.Quaternion();
  heat = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < COUNT; i++) this.seed[i] = Math.random();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aAge", new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSeed", new THREE.BufferAttribute(this.seed, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: plumeVert,
      fragmentShader: plumeFrag,
      uniforms: { uScale: { value: 20 }, uHeat: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
    scene.add(this.points);

    // three stacked sprites: white core, amber halo, wide faint bloom
    this.glowGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0.35, 0, 0, 0.9], 3));
    this.glowGeo.setAttribute("aSize", new THREE.Float32BufferAttribute([0.75, 1.5, 2.6], 1));
    this.glowGeo.setAttribute("aTone", new THREE.Float32BufferAttribute([0, 0.6, 1], 1));
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      uniforms: { uScale: { value: 20 }, uHeat: { value: 0 }, uFlicker: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.glow = new THREE.Points(this.glowGeo, this.glowMat);
    this.glow.frustumCulled = false;
  }

  setScale(pxPerUnit: number, pixelRatio: number) {
    this.mat.uniforms.uScale.value = pxPerUnit * pixelRatio;
    this.glowMat.uniforms.uScale.value = pxPerUnit * pixelRatio;
  }

  setVisible(v: boolean) {
    this.points.visible = v;
  }

  /** Forget the last nozzle position (after a jump, so no streak is drawn). */
  reset() {
    this.hasPrev = false;
    this.age.fill(1);
  }

  /**
   * nozzle: the glow object (child of the airframe at the nozzle); travel: how
   * fast the jet is moving, 0..1. Particles live in world space.
   */
  update(dt: number, travel: number, t: number, reduced: boolean) {
    const target = reduced ? 0.15 : 0.25 + 0.75 * travel;
    this.heat += (target - this.heat) * (1 - Math.exp(-dt * 6));
    this.mat.uniforms.uHeat.value = this.heat;
    this.glowMat.uniforms.uHeat.value = this.heat;
    this.glowMat.uniforms.uFlicker.value = reduced
      ? 0.9
      : 0.86 + 0.08 * Math.sin(t * 37) + 0.06 * Math.sin(t * 23.3 + 1.7);

    this.glow.updateWorldMatrix(true, false);
    this.glow.getWorldPosition(this.nozzleW);
    this.glow.getWorldQuaternion(this.q);
    this.rear.set(0, 0, 1).applyQuaternion(this.q).normalize();

    if (reduced) {
      // no particle animation: a short static wisp is drawn by the glow alone
      if (this.age.some((a) => a < 1)) {
        this.age.fill(1);
        (this.geo.attributes.aAge as THREE.BufferAttribute).needsUpdate = true;
      }
      this.prevNozzle.copy(this.nozzleW);
      this.hasPrev = true;
      return;
    }

    const step = Math.min(dt, 0.1);
    const nx = this.nozzleW.x;
    const nz = this.nozzleW.z;
    const rx = this.rear.x;
    const rz = this.rear.z;
    // age + move live particles
    for (let i = 0; i < COUNT; i++) {
      if (this.age[i] >= 1) continue;
      const k = i * 3;
      // how far behind the nozzle this puff sits along the exhaust axis. When the
      // jet backs up faster than its exhaust (a fast scroll reversal, momentum
      // flicks on touch) it would fly into its own smoke, so anything that ends
      // up level with or ahead of the nozzle fades out fast instead of drawing
      // over the airframe.
      const behind = (this.pos[k] - nx) * rx + (this.pos[k + 2] - nz) * rz;
      const overtaken = behind < CLEAR ? 1 + (CLEAR - behind) * 6 : 0;
      this.age[i] += dt / this.life[i] + overtaken * dt * 3;
      if (this.age[i] >= 1) {
        this.age[i] = 1;
        continue;
      }
      const drag = Math.exp(-step * 1.6);
      this.vel[k] *= drag;
      this.vel[k + 1] *= drag;
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * step;
      this.pos[k + 1] += this.vel[k + 1] * step;
      this.pos[k + 2] += this.vel[k + 2] * step;
    }

    // emit along the path the nozzle swept this frame, so fast scrolling still
    // leaves a continuous trail rather than dotted puffs
    const from = this.hasPrev ? this.prevNozzle : this.nozzleW;
    // jet's own rearward speed this frame: exhaust always leaves at least this
    // fast relative to the ground, so the trail stays behind a reversing jet
    const back =
      this.hasPrev && dt > 0
        ? Math.max(0, ((this.nozzleW.x - from.x) * rx + (this.nozzleW.z - from.z) * rz) / Math.max(dt, 1 / 120))
        : 0;
    const carrySp = Math.min(back, 40);
    const rate = BASE_RATE + SPEED_RATE * travel;
    this.carry += rate * Math.min(dt, 0.5);
    const swept = from.distanceTo(this.nozzleW);
    this.carry = Math.max(this.carry, Math.min(swept * 5, 90)); // ~5 puffs / unit
    const n = Math.min(Math.floor(this.carry), 90);
    this.carry -= n;
    for (let j = 0; j < n; j++) {
      const f = (j + Math.random()) / n;
      const i = this.head;
      this.head = (this.head + 1) % COUNT;
      const k = i * 3;
      const sp = EXHAUST_SPEED * (0.75 + Math.random() * 0.5) + carrySp;
      // particles born earlier in the frame have already flown a little way back
      const off = 0.15 + Math.random() * 0.2 + sp * (1 - f) * Math.min(dt, 0.1);
      this.pos[k] = THREE.MathUtils.lerp(from.x, this.nozzleW.x, f) + rx * off;
      this.pos[k + 1] = THREE.MathUtils.lerp(from.y, this.nozzleW.y, f) - 0.6;
      this.pos[k + 2] = THREE.MathUtils.lerp(from.z, this.nozzleW.z, f) + rz * off;
      const spread = 0.7;
      this.vel[k] = this.rear.x * sp + (Math.random() - 0.5) * spread;
      this.vel[k + 1] = 0;
      this.vel[k + 2] = this.rear.z * sp + (Math.random() - 0.5) * spread;
      // particles born earlier in the frame are already a little older
      this.age[i] = (1 - f) * Math.min(dt, 0.5) / LIFE;
      this.life[i] = LIFE * (0.7 + Math.random() * 0.6);
    }
    this.prevNozzle.copy(this.nozzleW);
    this.hasPrev = true;

    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAge as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.glowGeo.dispose();
    this.glowMat.dispose();
  }
}
