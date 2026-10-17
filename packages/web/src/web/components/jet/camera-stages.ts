import * as THREE from "three";

// Aircraft frame (after normalising the GLB): nose points to -Z, +Y is up,
// camera generally works on the +X side. Units ≈ metres (model is ~15 m long).

export type Stage = {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  /** lens shift (fraction of viewport) so the jet sits clear of the copy; +x right, +y up */
  shift: [number, number];
};

export type Leg = {
  /** intermediate camera positions between stage i and i+1 (curved path) */
  via: THREE.Vector3[];
  /** optional intermediate look-at points to coordinate the target */
  targetVia?: THREE.Vector3[];
};

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const STAGES: Stage[] = [
  // 0 — dramatic front three-quarter
  { pos: v(9.6, 0.9, -16), target: v(0.4, 0.3, -1.2), fov: 34, shift: [0.2, 0.02] },
  // 1 — full side profile
  { pos: v(26, 0.9, 0.4), target: v(0, 0.35, 0.4), fov: 31, shift: [0.04, 0.06] },
  // 2 — elevated three-quarter: wings and upper fuselage
  { pos: v(15.5, 16.5, 12.5), target: v(0, -0.2, 0.6), fov: 33, shift: [0.12, 0.02] },
  // 3 — close on the cockpit / canopy
  { pos: v(4.6, 2.5, -10), target: v(0, 0.7, -3.6), fov: 38, shift: [-0.1, -0.02] },
  // 4 — engine, intake and wing detail
  { pos: v(6.8, -1.1, 11.6), target: v(0.3, 0, 4.4), fov: 40, shift: [0.1, -0.02] },
  // 5 — wide rear three-quarter as the jet pushes on into the weather
  { pos: v(-14, 5.2, 25), target: v(0, 0.4, -2.5), fov: 35, shift: [-0.04, 0.1] },
];

export const LEGS: Leg[] = [
  // pull back and arc into the profile
  { via: [v(19, 2.4, -16.5), v(25, 1.4, -8)], targetVia: [v(0.3, 0.25, -0.6)] },
  // rise into the elevated view
  { via: [v(26, 8.5, 8)], targetVia: [v(0, 0.1, 0.6)] },
  // sweep down to the cockpit
  { via: [v(13, 10, -3), v(7.5, 4.6, -9.5)], targetVia: [v(0, 0.3, -1.8)] },
  // glide along the fuselage towards the engine
  { via: [v(6.6, 1.9, -3), v(7.6, 0.4, 4.5)], targetVia: [v(0.2, 0.5, -0.5)] },
  // orbit around the tail and pull out wide
  { via: [v(8, 2.2, 17), v(-3, 4.2, 22)], targetVia: [v(0.1, 0.4, 3.5)] },
];

export const STAGE_COUNT = STAGES.length - 1; // 5 transitions

export function smootherstep(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export type Move = {
  posCurve: THREE.CatmullRomCurve3;
  targetCurve: THREE.CatmullRomCurve3;
  fromFov: number;
  toFov: number;
  fromShift: [number, number];
  toShift: [number, number];
  duration: number;
  start: number;
};

/** Build a move from the live camera pose into `to` along leg `legIndex`. */
export function buildMove(
  fromPos: THREE.Vector3,
  fromTarget: THREE.Vector3,
  fromFov: number,
  fromShift: [number, number],
  from: number,
  to: number,
  frame: (p: THREE.Vector3, t: THREE.Vector3) => THREE.Vector3,
  duration: number,
  now: number,
): Move {
  const forward = to > from;
  const leg = LEGS[Math.min(from, to)]!;
  const via = forward ? leg.via : [...leg.via].reverse();
  const tvia = leg.targetVia ? (forward ? leg.targetVia : [...leg.targetVia].reverse()) : [];
  const dest = STAGES[to]!;
  const destTarget = dest.target.clone();
  const destPos = frame(dest.pos.clone(), destTarget);
  const posPts = [fromPos.clone(), ...via.map((p) => frame(p.clone(), destTarget)), destPos];
  const tgtPts = [fromTarget.clone(), ...tvia.map((p) => p.clone()), destTarget];
  if (tgtPts.length === 2) tgtPts.splice(1, 0, fromTarget.clone().lerp(destTarget, 0.5));
  return {
    posCurve: new THREE.CatmullRomCurve3(posPts, false, "centripetal"),
    targetCurve: new THREE.CatmullRomCurve3(tgtPts, false, "centripetal"),
    fromFov,
    toFov: dest.fov,
    fromShift: [fromShift[0], fromShift[1]],
    toShift: dest.shift,
    duration,
    start: now,
  };
}
