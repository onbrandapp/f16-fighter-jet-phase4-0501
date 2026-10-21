import type { JetScene } from "./jet-scene";

/**
 * Shared, mutable flight state. The page has one persistent WebGL scene (owned
 * by the hero) that keeps flying behind every section; sections publish what
 * they know here from their own frame loops and the scene's director reads it
 * every frame. Plain object on purpose — nothing here should re-render React.
 */
export type Loadout = "clean" | "a2a" | "strike";

export const flight = {
  scene: null as JetScene | null,
  /** Performance reel position, 0..N-1 (eased, continuous) */
  perf: 0,
  /** History timeline: where the director drew the jet (viewport px), and the lit milestone row */
  hist: { y: 0, x: 0, live: false, p: 0, row: 0 },
  /** Variants: selected airframe + loadout, and orbit offsets (radians) from dragging */
  variant: { id: "ab", loadout: "a2a" as Loadout, yaw: 0, pitch: 0, dragging: false },
  /** Turn explainer: airspeed (kt) and load factor (g) the reader has set */
  turn: { v: 350, n: 5, live: false },
  /** Footer fly-past: 0..1 pass progress, presence (0..1) and nozzle x (−1 left … 1 right) */
  foot: { t: 0, w: 0, x: 0 },
  /** HUD telemetry, written by the scene every frame */
  hud: { g: 1, heading: 0, station: "hero" as string },
};

/** window events the scene fires for the soundscape + visuals */
export const STATION_EVENT = "falcon:station";
export const BOOM_EVENT = "falcon:boom";
export type StationDetail = { from: string; to: string };
export type BoomDetail = { x: number; y: number };
/** page order of the stations, for the direction of handoff sweeps */
export const STATION_ORDER = ["hero", "perf", "turn", "hist", "var", "foot"];
