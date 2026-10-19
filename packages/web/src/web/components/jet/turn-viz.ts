import * as THREE from "three";
import { HUD_AMBER, HUD_GREEN } from "./jet-fx";

/**
 * World-space HUD geometry for the turn explainer, drawn around the persistent
 * jet (not parented to it, so it stays level while the aircraft banks):
 *
 *  - the turn circle in the horizontal plane through the jet, with dashes that
 *    stream past at the airspeed, brightest along the path ahead
 *  - a radius line to the centre of the turn and a centre mark
 *  - the lift-vector triangle: total lift tilted by the bank angle, split into
 *    the 1 g that holds altitude and the horizontal part that turns the jet
 *
 * Radius is drawn on a compressed scale (real radii run from ~1,200 ft to
 * miles), so a tighter turn still visibly closes the circle.
 */

const SEG = 256;

const ringVert = /* glsl */ `
  attribute float aA;
  varying float vA;
  void main() {
    vA = aA;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ringFrag = /* glsl */ `
  uniform float uW;
  uniform float uR;
  uniform float uOff;
  uniform vec3 uColor;
  uniform vec3 uAhead;
  varying float vA;
  void main() {
    float TAU = 6.2831853;
    float s = vA * uR;                       // arc length from the jet, world units
    float dash = step(0.45, fract((s + uOff) / 1.6));
    // brightest just ahead of the nose, fading round the far side and behind
    float ahead = exp(-vA * 1.15);
    float behind = exp(-(TAU - vA) * 2.6);
    float a = (0.16 + 0.84 * ahead + 0.22 * behind) * mix(0.35, 1.0, dash);
    vec3 col = mix(uColor, uAhead, ahead * 0.55);
    gl_FragColor = vec4(col * a * uW, a * uW);
  }
`;

function lineMat(color: THREE.Color, opacity: number) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
  });
}

export class TurnViz {
  readonly group = new THREE.Group();
  private ring: THREE.Line;
  private ringMat: THREE.ShaderMaterial;
  private radius: THREE.LineSegments;
  private radiusMat: THREE.LineDashedMaterial;
  private mark: THREE.LineSegments;
  private markMat: THREE.LineBasicMaterial;
  private lift: THREE.Line;
  private liftMat: THREE.LineBasicMaterial;
  private parts: THREE.LineSegments;
  private partsMat: THREE.LineBasicMaterial;
  private liftPos: Float32Array;
  private partsPos: Float32Array;
  private off = 0;
  private rVis = 20;

  constructor() {
    // unit turn circle, starting at the jet and running the way it flies:
    // jet heading −Z, turning right toward +X, centre at (+R, 0, 0)
    const pos = new Float32Array((SEG + 1) * 3);
    const ang = new Float32Array(SEG + 1);
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      pos[i * 3] = 1 - Math.cos(a);
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = -Math.sin(a);
      ang[i] = a;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aA", new THREE.BufferAttribute(ang, 1));
    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: ringVert,
      fragmentShader: ringFrag,
      uniforms: {
        uW: { value: 0 },
        uR: { value: 20 },
        uOff: { value: 0 },
        uColor: { value: HUD_GREEN.clone() },
        uAhead: { value: new THREE.Color("#d9ffe4") },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.ring = new THREE.Line(g, this.ringMat);
    this.ring.frustumCulled = false;

    // radius: jet → centre (unit, scaled with the ring)
    const rg = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3),
    );
    this.radiusMat = new THREE.LineDashedMaterial({
      color: HUD_GREEN,
      transparent: true,
      opacity: 0.5,
      dashSize: 0.02,
      gapSize: 0.02,
      depthWrite: false,
      depthTest: false,
    });
    this.radius = new THREE.LineSegments(rg, this.radiusMat);
    this.radius.computeLineDistances();
    this.radius.frustumCulled = false;

    // centre mark: a small cross in the horizontal plane
    const c = 0.9;
    const mg = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-c, 0, 0, c, 0, 0, 0, 0, -c, 0, 0, c], 3),
    );
    this.markMat = lineMat(HUD_GREEN, 0.75);
    this.mark = new THREE.LineSegments(mg, this.markMat);
    this.mark.frustumCulled = false;

    // lift vector (amber) and its two components (green, dim)
    this.liftPos = new Float32Array(6);
    const lg = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(this.liftPos, 3));
    this.liftMat = lineMat(HUD_AMBER, 0.95);
    this.lift = new THREE.Line(lg, this.liftMat);
    this.lift.frustumCulled = false;

    this.partsPos = new Float32Array(12);
    const pg = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(this.partsPos, 3));
    this.partsMat = lineMat(HUD_GREEN, 0.55);
    this.parts = new THREE.LineSegments(pg, this.partsMat);
    this.parts.frustumCulled = false;

    for (const o of [this.ring, this.radius, this.mark, this.lift, this.parts]) {
      o.renderOrder = 4;
      this.group.add(o);
    }
    this.group.visible = false;
  }

  /** compressed on-screen radius (world units) for a real radius in feet */
  static visRadius(ft: number) {
    if (!Number.isFinite(ft)) return 400;
    return 6 + 20 * (ft / 4000) ** 0.8;
  }

  /**
   * w: blend weight 0..1; n: load factor; ft: real turn radius; kts: airspeed;
   * at: aircraft CG in world space.
   */
  update(w: number, n: number, ft: number, kts: number, at: THREE.Vector3, dt: number, reduced: boolean) {
    const on = w > 0.004;
    this.group.visible = on;
    if (!on) return;
    const turning = Math.min(1, Math.max(0, (n - 1.02) / 0.3));
    const target = TurnViz.visRadius(ft);
    // ease the drawn radius so slider steps read as the circle tightening
    this.rVis += (target - this.rVis) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
    const R = this.rVis;

    this.group.position.copy(at);
    this.ring.scale.setScalar(R);
    this.ring.position.set(0, 0, 0);
    this.ringMat.uniforms.uW!.value = w * turning;
    this.ringMat.uniforms.uR!.value = R;
    // dashes stream back past the jet at a pace that follows airspeed
    if (!reduced) this.off += dt * (2 + kts / 45);
    this.ringMat.uniforms.uOff!.value = this.off;

    this.radius.scale.setScalar(R);
    this.radiusMat.opacity = 0.42 * w * turning;
    this.radiusMat.dashSize = 0.6 / R;
    this.radiusMat.gapSize = 0.5 / R;
    this.mark.position.set(R, 0, 0);
    this.markMat.opacity = 0.75 * w * turning;

    // lift triangle in the plane across the jet (right = +X, up = +Y)
    const s = 0.95; // world units per g
    const h = Math.sqrt(Math.max(0, n * n - 1)) * s;
    const up = 1 * s;
    const L = this.liftPos;
    L[0] = 0;
    L[1] = 0;
    L[2] = 0;
    L[3] = h;
    L[4] = up;
    L[5] = 0;
    const P = this.partsPos;
    // vertical 1 g, then the horizontal turning force
    P.set([0, 0, 0, 0, up, 0, 0, up, 0, h, up, 0]);
    (this.lift.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.parts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.lift.geometry.computeBoundingSphere();
    this.liftMat.opacity = 0.95 * w;
    this.partsMat.opacity = 0.5 * w * turning;
    // lift vector rides above the canopy so it doesn't vanish into the fuselage
    this.lift.position.set(0, 1.1, 0);
    this.parts.position.set(0, 1.1, 0);
  }

  dispose() {
    for (const o of [this.ring, this.radius, this.mark, this.lift, this.parts]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
}
