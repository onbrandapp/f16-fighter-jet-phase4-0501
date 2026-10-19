import * as THREE from "three";
import { emptyFx, FX_IDS, STORE_IDS, type FxState } from "./jet-fx";
import { flight, type Loadout } from "./flight-store";
import { smootherstep } from "./camera-stages";
import { bankDeg } from "../site/turn-model";

/**
 * The flight director: one persistent aircraft, many stations. The hero's
 * gesture-driven camera owns the top of the page; below it, scroll position
 * through the page picks a station (or a blend of two) and the director
 * produces a camera + aircraft pose for it.
 *
 * Stations are anchored to DOM elements marked `data-flight="…"`, so the
 * aircraft always lands where the layout left room for it, at any breakpoint.
 *
 * Poses are spherical (yaw / pitch / distance around a target) so blends
 * between stations orbit around the jet instead of cutting through it.
 */

export type Pose = {
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  dist: number;
  fov: number;
  /** lens shift, as fractions of the viewport (setViewOffset convention) */
  sx: number;
  sy: number;
  /** aircraft attitude (radians), applied yaw → pitch → roll */
  roll: number;
  jpitch: number;
  jyaw: number;
  /** aircraft world offset along Z (history: the jet travels down the column) */
  jz: number;
  fx: FxState;
  clouds: number;
  plume: number;
};

export const makePose = (): Pose => ({
  target: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  dist: 30,
  fov: 34,
  sx: 0,
  sy: 0,
  roll: 0,
  jpitch: 0,
  jyaw: 0,
  jz: 0,
  fx: emptyFx(),
  clouds: 1,
  plume: 0,
});

const FX_KEYS = [...STORE_IDS, ...FX_IDS];

const wrap = (a: number) => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function copyPose(out: Pose, a: Pose) {
  out.target.copy(a.target);
  out.yaw = a.yaw;
  out.pitch = a.pitch;
  out.dist = a.dist;
  out.fov = a.fov;
  out.sx = a.sx;
  out.sy = a.sy;
  out.roll = a.roll;
  out.jpitch = a.jpitch;
  out.jyaw = a.jyaw;
  out.jz = a.jz;
  for (const k of FX_KEYS) out.fx[k] = a.fx[k];
  out.clouds = a.clouds;
  out.plume = a.plume;
  return out;
}

export function lerpPose(out: Pose, a: Pose, b: Pose, t: number) {
  if (t <= 0) return copyPose(out, a);
  if (t >= 1) return copyPose(out, b);
  out.target.lerpVectors(a.target, b.target, t);
  out.yaw = a.yaw + wrap(b.yaw - a.yaw) * t;
  out.pitch = lerp(a.pitch, b.pitch, t);
  // distance blends in log space so dolly moves feel even
  out.dist = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), t));
  out.fov = lerp(a.fov, b.fov, t);
  out.sx = lerp(a.sx, b.sx, t);
  out.sy = lerp(a.sy, b.sy, t);
  out.roll = lerp(a.roll, b.roll, t);
  out.jpitch = lerp(a.jpitch, b.jpitch, t);
  out.jyaw = lerp(a.jyaw, b.jyaw, t);
  out.jz = lerp(a.jz, b.jz, t);
  for (const k of FX_KEYS) out.fx[k] = lerp(a.fx[k], b.fx[k], t);
  out.clouds = lerp(a.clouds, b.clouds, t);
  out.plume = lerp(a.plume, b.plume, t);
  return out;
}

/** camera position for a pose */
export function poseCamera(p: Pose, out: THREE.Vector3) {
  const c = Math.cos(p.pitch);
  return out.set(Math.sin(p.yaw) * c, Math.sin(p.pitch), Math.cos(p.yaw) * c).multiplyScalar(p.dist).add(p.target);
}

/** spherical pose from a world camera position + target */
export function poseFromLook(out: Pose, pos: THREE.Vector3, target: THREE.Vector3) {
  const dx = pos.x - target.x;
  const dy = pos.y - target.y;
  const dz = pos.z - target.z;
  const d = Math.max(0.001, Math.hypot(dx, dy, dz));
  out.target.copy(target);
  out.dist = d;
  out.pitch = Math.asin(clamp(dy / d, -1, 1));
  out.yaw = Math.atan2(dx, dz);
  return out;
}

// ───────────────────────── stations ─────────────────────────

type FxPartial = Partial<FxState>;

type CapStation = {
  yaw: number;
  pitch: number;
  roll: number;
  jpitch: number;
  jyaw: number;
  /** fraction of the stage box the aircraft fills */
  size: number;
  fov: number;
  target: [number, number, number];
  fx: FxPartial;
};

/** one station per capability, in CAPABILITIES order */
export const CAP_STATIONS: CapStation[] = [
  // agility — hard bank toward the camera, vortices peeling off the tips
  {
    yaw: 2.3,
    pitch: 0.16,
    roll: -1.2,
    jpitch: 0.16,
    jyaw: 0.08,
    size: 1.0,
    fov: 30,
    target: [0, 0, 0.6],
    fx: { vortex: 1, tip9: 1, st2_9: 1 },
  },
  // multi-role — from below, the full mixed load on the hardpoints
  {
    yaw: 2.0,
    pitch: -0.34,
    roll: 0.16,
    jpitch: 0.02,
    jyaw: 0,
    size: 1.0,
    fov: 30,
    target: [0, -0.9, 0.4],
    fx: { tip120: 1, st2_9: 1, st3_jdam: 1, pod: 1 },
  },
  // EW — high overhead, the warning receiver's rings spreading around the jet
  {
    yaw: 0.85,
    pitch: 0.82,
    roll: 0,
    jpitch: 0,
    jyaw: 0,
    size: 0.78,
    fov: 30,
    target: [0, -0.4, 0.4],
    fx: { pulse: 1, ecm: 1, tip120: 1 },
  },
  // avionics — over the shoulder, radar fan ahead and the helmet cue line
  {
    yaw: 0.42,
    pitch: 0.3,
    roll: 0,
    jpitch: 0,
    jyaw: 0,
    size: 0.7,
    fov: 32,
    target: [0, 0, -2.4],
    fx: { radar: 1, cue: 1, pod: 1, tip9: 1, st2_9: 1 },
  },
  // supersonic — flat side profile, Mach cone off the nose, diamonds in the plume
  {
    yaw: 1.6,
    pitch: 0.03,
    roll: 0,
    jpitch: 0.03,
    jyaw: 0,
    size: 0.84,
    fov: 28,
    target: [0, -0.1, 0.8],
    fx: { shock: 1, tip120: 1 },
  },
];

export const VARIANT_PARTS: Record<string, FxPartial> = {
  ab: {},
  cd: {},
  ef: { cft: 1, spine: 1 },
  v: { cft: 1 },
};

export const LOADOUTS: Record<Loadout, FxPartial> = {
  clean: {},
  a2a: { tip120: 1, st2_9: 1, st3_120: 1 },
  strike: { tip9: 1, st3_jdam: 1, pod: 1, ecm: 1 },
};

const JET_FIT = 15.2; // world units the aircraft needs (nose to tail + a little air)

type Box = { cx: number; cy: number; w: number; h: number; top: number; bottom: number };

function boxOf(el: Element | null): Box | null {
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom };
}

export class FlightDirector {
  private els: Record<string, Element | null> = {};
  private lastQuery = -1;
  private capPose = makePose();
  private capA = makePose();
  private capB = makePose();
  private histPose = makePose();
  private turnPose = makePose();
  /** eased load factor the turn station is flying (HUD + turn viz read it) */
  turnN = 1;
  private varPose = makePose();
  private out = makePose();
  private tmp = makePose();
  private varFx = emptyFx();
  private varAuto = 0;
  private histP = 0;
  private histInit = false;
  /** 0 hero … 1 fully handed to the page stations (for HUD + render decisions) */
  cruise = 0;
  /** which station dominates: hero | perf | hist | var | off */
  station: "hero" | "perf" | "turn" | "hist" | "var" | "off" = "hero";
  /** world units → px for the history pose (plume sizing) */
  histPpu = 20;
  histWeight = 0;

  private q(name: string, now: number) {
    let el = this.els[name];
    if (!el || !el.isConnected || now - this.lastQuery > 2) {
      el = document.querySelector(`[data-flight="${name}"]`);
      this.els[name] = el;
    }
    return el;
  }

  /** past the last station (contact / footer cover the canvas) */
  offstage(): boolean {
    const v = this.els.section;
    const el = v && v.isConnected ? v : document.getElementById("variants");
    this.els.section = el;
    if (!el) return false;
    return el.getBoundingClientRect().bottom < -40;
  }

  /**
   * hero: the pose the hero stage logic produced this frame.
   * W/H: canvas size in CSS px. Returns the pose to render.
   */
  sample(hero: Pose, W: number, H: number, t: number, dt: number, reduced: boolean): Pose {
    const now = t;
    const perfEl = document.getElementById("performance");
    const perfStage = boxOf(this.q("perf", now));
    const histTrack = boxOf(this.q("hist", now));
    const turnStage = boxOf(this.q("turn", now));
    const varStage = boxOf(this.q("var", now));
    if (now - this.lastQuery > 2) this.lastQuery = now;
    const vh = window.innerHeight || H;
    const mobile = W < 760;

    if (!perfEl || !perfStage) {
      this.cruise = 0;
      this.station = "hero";
      return hero;
    }
    const pr = perfEl.getBoundingClientRect();

    // ── performance: blend between neighbouring capability stations
    const n = CAP_STATIONS.length;
    const c = clamp(flight.perf, 0, n - 1);
    const i0 = Math.min(n - 2, Math.floor(c));
    const f = smootherstep(c - i0);
    this.capStation(this.capA, CAP_STATIONS[i0]!, perfStage, W, H, mobile);
    this.capStation(this.capB, CAP_STATIONS[i0 + 1]!, perfStage, W, H, mobile);
    lerpPose(this.capPose, this.capA, this.capB, f);
    // once the sticky releases, the jet leaves with its section
    const lift = Math.min(0, pr.bottom - vh);
    this.capPose.sy += -lift / H;

    // ── segment weights
    const u0 = smootherstep(clamp(1 - pr.top / vh));
    let out = lerpPose(this.out, hero, this.capPose, u0);
    this.station = u0 < 0.5 ? "hero" : "perf";
    this.histWeight = 0;

    // ── turn explainer: hand off from the perf reel as it releases
    let prev = this.capPose;
    let prevBottom = pr.bottom;
    const turnEl = turnStage ? document.getElementById("turn") : null;
    if (turnStage && turnEl) {
      this.turnStation(this.turnPose, turnStage, W, H, t, dt, reduced);
      const d = turnStage.cy - vh / 2 - (pr.bottom - vh);
      const ut = smootherstep(clamp((vh - pr.bottom) / Math.max(1, d)));
      if (ut > 0) {
        lerpPose(this.tmp, this.capPose, this.turnPose, ut);
        copyPose(this.out, this.tmp);
        out = this.out;
        if (ut >= 0.5) this.station = "turn";
      }
      prev = this.turnPose;
      prevBottom = turnEl.getBoundingClientRect().bottom;
    }

    if (histTrack) {
      this.historyStation(this.histPose, histTrack, W, H, vh, t, dt, reduced);
      const d1 = histTrack.top - 0.15 * vh - (prevBottom - vh);
      const u1 = smootherstep(clamp((vh - prevBottom) / Math.max(1, d1)));
      if (u1 > 0) {
        out = lerpPose(this.tmp, prev, this.histPose, u1);
        copyPose(this.out, out);
        out = this.out;
        this.histWeight = u1;
        if (u1 >= 0.5) this.station = "hist";
      }

      if (varStage) {
        this.variantStation(this.varPose, varStage, W, H, t, dt, reduced);
        const start = histTrack.bottom - 0.5 * vh; // > 0 before the jet reaches the end
        const d2 = varStage.cy - histTrack.bottom;
        const u2 = smootherstep(clamp(-start / Math.max(1, d2)));
        if (u2 > 0) {
          lerpPose(this.tmp, this.histPose, this.varPose, u2);
          copyPose(this.out, this.tmp);
          out = this.out;
          this.histWeight = 1 - u2;
          if (u2 >= 0.5) this.station = "var";
        }
      }
    }

    this.cruise = u0;
    flight.hud.station = this.station;
    return out;
  }

  /** px the aircraft should span inside a stage box */
  private fitPx(b: Box, W: number, H: number, mobile: boolean) {
    const w = mobile ? Math.min(b.w, W) : b.w;
    return Math.max(120, Math.min(w * 0.98, b.h * (mobile ? 1.15 : 1.05), H * 0.95));
  }

  private place(p: Pose, b: Box, px: number, W: number, H: number) {
    const ppu = px / JET_FIT;
    p.dist = H / (2 * Math.tan(THREE.MathUtils.degToRad(p.fov) / 2) * ppu);
    p.sx = (b.cx - W / 2) / W;
    p.sy = (H / 2 - b.cy) / H;
  }

  private capStation(p: Pose, s: CapStation, b: Box, W: number, H: number, mobile: boolean) {
    p.target.set(s.target[0], s.target[1], s.target[2]);
    p.yaw = s.yaw;
    p.pitch = s.pitch;
    p.roll = s.roll;
    p.jpitch = s.jpitch;
    p.jyaw = s.jyaw;
    p.jz = 0;
    p.fov = s.fov;
    for (const k of FX_KEYS) p.fx[k] = s.fx[k] ?? 0;
    p.clouds = 0;
    p.plume = 0;
    this.place(p, b, this.fitPx(b, W, H, mobile) * s.size, W, H);
  }

  private historyStation(p: Pose, b: Box, W: number, H: number, vh: number, t: number, dt: number, reduced: boolean) {
    // jet length ≈ 82% of the column width, capped (as the old top-down canvas)
    const ppu = Math.min((b.w * 0.8) / 9.3, 300 / 14.1);
    this.histPpu = ppu;
    const m = 7.9 * ppu;
    const target = clamp((vh * 0.5 - b.top - m) / Math.max(1, b.h - 2 * m));
    if (!this.histInit || reduced || dt === 0) this.histP = target;
    else this.histP += (target - this.histP) * (1 - Math.exp(-dt * 5));
    this.histInit = true;
    const pp = this.histP;
    const y = b.top + m + pp * (b.h - 2 * m);
    const drift = reduced ? 0 : 1;

    p.fov = 14;
    p.dist = H / (2 * Math.tan(THREE.MathUtils.degToRad(p.fov) / 2) * ppu);
    p.target.set(0, 0, 0);
    p.yaw = Math.PI;
    p.pitch = 1.5;
    p.sx = (b.cx - W / 2) / W;
    p.sy = 0;
    // screen-down is world −Z from this camera
    p.jz = -(y - H / 2) / ppu;
    p.roll = Math.sin(pp * Math.PI * 2.2) * 0.16 + Math.sin(t * 0.7) * 0.02 * drift;
    p.jpitch = Math.sin(pp * Math.PI) * 0.1;
    p.jyaw = Math.sin(pp * Math.PI * 1.4 + 0.6) * 0.07 + Math.sin(t * 0.45) * 0.01 * drift;
    for (const k of FX_KEYS) p.fx[k] = 0;
    p.clouds = 0;
    p.plume = 1;

    flight.hist.y = y;
    flight.hist.x = b.cx;
    flight.hist.p = pp;
    flight.hist.live = true;
  }

  private turnStation(p: Pose, b: Box, W: number, H: number, t: number, dt: number, reduced: boolean) {
    const goal = flight.turn.n;
    this.turnN = reduced || dt === 0 ? goal : this.turnN + (goal - this.turnN) * (1 - Math.exp(-dt * 6));
    const n = this.turnN;
    const bank = (bankDeg(n) * Math.PI) / 180;
    const drift = reduced ? 0 : 1;
    const mobile = W < 760;
    // chase view from behind and outside the turn, looking across the jet
    // toward the centre of the circle
    p.target.set(mobile ? 0.9 : 1.7, 0.4, -3.0);
    p.yaw = -0.34 + Math.sin(t * 0.13) * 0.04 * drift;
    p.pitch = 0.38;
    p.fov = 30;
    // right-wing-down bank; nose pulled up a touch with g (angle of attack)
    p.roll = -bank + Math.sin(t * 0.9) * 0.012 * drift;
    p.jpitch = 0.02 + 0.014 * (n - 1);
    p.jyaw = 0;
    p.jz = 0;
    for (const k of FX_KEYS) p.fx[k] = 0;
    p.fx.turn = 1;
    p.fx.tip120 = 1;
    p.fx.st2_9 = 1;
    // condensation off the tips once the pull gets hard
    p.fx.vortex = clamp((n - 4.5) / 3.5);
    p.clouds = 0;
    p.plume = 0;
    this.place(p, b, this.fitPx(b, W, H, mobile) * (mobile ? 0.66 : 0.6), W, H);
  }

  private variantStation(p: Pose, b: Box, W: number, H: number, t: number, dt: number, reduced: boolean) {
    const v = flight.variant;
    const idle = !v.dragging && !reduced;
    if (idle) this.varAuto += dt * 0.11;
    const parts = VARIANT_PARTS[v.id] ?? {};
    const load = LOADOUTS[v.loadout] ?? {};
    const k = reduced ? 1 : 1 - Math.exp(-dt * 4.5);
    for (const key of FX_KEYS) {
      const goal = key === "deck" ? 1 : (parts[key] ?? load[key] ?? 0);
      this.varFx[key] += (goal - this.varFx[key]) * k;
      p.fx[key] = this.varFx[key];
    }
    p.target.set(0, -0.3, 0.4);
    p.yaw = 2.25 + v.yaw + Math.sin(this.varAuto) * 0.5;
    p.pitch = clamp(0.3 + v.pitch, -0.25, 1.2);
    p.roll = reduced ? 0 : Math.sin(t * 0.4) * 0.03;
    p.jpitch = 0;
    p.jyaw = 0;
    p.jz = 0;
    p.fov = 30;
    p.clouds = 0;
    p.plume = 0;
    this.place(p, b, this.fitPx(b, W, H, W < 760) * 0.92, W, H);
  }
}
