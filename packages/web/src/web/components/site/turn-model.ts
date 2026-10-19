/**
 * A simplified sea-level turn-performance (energy–manoeuvrability) model for
 * the F-16 at a typical air-combat weight. Built from public figures — 9 g
 * structural limit, ~350 kt corner speed, ~28°/s instantaneous and ~18°/s
 * sustained turn rate — and the textbook level-turn equations:
 *
 *   turn rate  ω = g·√(n² − 1) / V
 *   radius     r = V² / (g·√(n² − 1))
 *   bank       φ = acos(1 / n)
 *   lift limit n_max = (V / V_s)²        (1 g stall speed V_s)
 *
 * Illustrative only — not flight-manual data.
 */

export const G = 9.80665;
export const KT = 0.514444; // m/s per knot
export const FT = 3.28084; // ft per metre

export const V_MIN = 150; // kt, chart floor
export const V_MAX = 650; // kt, chart ceiling
export const N_LIMIT = 9; // structural limit
export const V_STALL = 350 / 3; // kt (≈117), 1 g stall at combat weight → corner 350 kt
export const V_CORNER = V_STALL * Math.sqrt(N_LIMIT);

/** max load the wing can make at this speed (aerodynamic limit) */
export const nLift = (v: number) => (v / V_STALL) ** 2;

/** max instantaneous load: lift limit, capped by structure */
export const nInst = (v: number) => Math.min(nLift(v), N_LIMIT);

/**
 * Sustained load (Ps = 0): where thrust exactly balances drag in the turn.
 * Shaped to peak near 7 g around 0.7 M (≈ 460 kt) and fall away either side.
 */
export const nSus = (v: number) => {
  const n = 7.0 - 3.0 * ((v - 460) / 200) ** 2;
  return Math.max(1, Math.min(n, nInst(v)));
};

/** turn rate in deg/s */
export const rate = (v: number, n: number) => {
  if (n <= 1) return 0;
  return ((G * Math.sqrt(n * n - 1)) / (v * KT)) * (180 / Math.PI);
};

/** turn radius in feet (Infinity for wings level) */
export const radiusFt = (v: number, n: number) => {
  if (n <= 1.0001) return Infinity;
  const ms = v * KT;
  return ((ms * ms) / (G * Math.sqrt(n * n - 1))) * FT;
};

/** bank angle for a level turn, degrees */
export const bankDeg = (n: number) => (Math.acos(1 / Math.max(1, n)) * 180) / Math.PI;

/** load factor that gives a turn rate (deg/s) at a speed */
export const nForRate = (v: number, deg: number) => {
  const w = (deg * Math.PI) / 180;
  const k = (w * v * KT) / G;
  return Math.sqrt(1 + k * k);
};

/**
 * Specific excess power, expressed as speed change in kt/s at constant
 * altitude. Negative = bleeding energy. Pulling past the sustained line costs
 * speed roughly with the square of the extra load.
 */
export const bleed = (v: number, n: number) => {
  const ns = nSus(v);
  const d = 0.5 * (ns * ns - n * n);
  // thrust-limited acceleration when unloaded; drag rises past ~600 kt
  const cap = 12 * Math.max(0, 1 - ((v - 420) / 280) ** 2);
  return Math.max(-34, Math.min(d, cap));
};

export type Zone = "lift" | "corner" | "structural";

export const zoneOf = (v: number): Zone => {
  if (Math.abs(v - V_CORNER) < 14) return "corner";
  return v < V_CORNER ? "lift" : "structural";
};

/** peak values, for chart scaling and copy */
export const RATE_PEAK = rate(V_CORNER, N_LIMIT);
export const RATE_MAX_AXIS = 32;

/** sample a curve across the speed range */
export function sample(fn: (v: number) => number, from = V_MIN, to = V_MAX, step = 5) {
  const out: [number, number][] = [];
  for (let v = from; v <= to + 0.001; v += step) out.push([v, fn(v)]);
  return out;
}

/** speed at which the sustained curve peaks in turn *rate* (not g) */
export const V_SUS_BEST = (() => {
  let best = V_MIN;
  let r = 0;
  for (let v = V_MIN; v <= V_MAX; v += 1) {
    const x = rate(v, nSus(v));
    if (x > r) {
      r = x;
      best = v;
    }
  }
  return best;
})();
export const RATE_SUS_PEAK = rate(V_SUS_BEST, nSus(V_SUS_BEST));
