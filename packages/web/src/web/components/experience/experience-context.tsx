import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SoundEngine, type UiCue } from "../jet/sound-engine";
import { BOOM_EVENT, flight, STATION_EVENT, STATION_ORDER, type StationDetail } from "../jet/flight-store";
import { getLenis } from "./smooth-scroll";

type Experience = {
  sound: boolean;
  toggleSound: () => void;
  reduced: boolean;
  toggleReduced: () => void;
  /** play a short interface cue (no-op unless sound is on) */
  cue: (c: UiCue, pan?: number) => void;
  engine: () => SoundEngine | null;
};

const Ctx = createContext<Experience | null>(null);

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
};

export function ExperienceProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<SoundEngine | null>(null);
  const [sound, setSound] = useState(false);
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const e = new SoundEngine();
    engineRef.current = e;
    const off = e.subscribe(setSound);
    if (import.meta.env.DEV) (window as unknown as { __sound: SoundEngine }).__sound = e;
    return () => {
      off();
      e.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reduced ? "1" : "0";
  }, [reduced]);

  const toggleSound = useCallback(() => {
    void engineRef.current?.toggle();
  }, []);

  // M toggles sound anywhere except while typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "m" && e.key !== "M") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target)) return;
      void engineRef.current?.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the scene's handoffs and boom → sound
  useEffect(() => {
    const onStation = (ev: Event) => {
      const d = (ev as CustomEvent<StationDetail>).detail;
      const a = STATION_ORDER.indexOf(d.from);
      const b = STATION_ORDER.indexOf(d.to);
      if (a < 0 || b < 0) return;
      engineRef.current?.sweep(b >= a ? 1 : -1);
    };
    const onBoom = () => engineRef.current?.boom();
    window.addEventListener(STATION_EVENT, onStation);
    window.addEventListener(BOOM_EVENT, onBoom);
    return () => {
      window.removeEventListener(STATION_EVENT, onStation);
      window.removeEventListener(BOOM_EVENT, onBoom);
    };
  }, []);

  // while sound is on: scroll speed drives the afterburner, the footer pass pans it
  useEffect(() => {
    if (!sound) return;
    let raf = 0;
    let last = performance.now();
    let lastY = window.scrollY;
    let flyArmed = true;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const e = engineRef.current;
      if (!e) return;
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
      last = now;
      const y = window.scrollY;
      const lv = getLenis()?.velocity;
      const v = lv !== undefined && lv !== 0 ? lv * 60 : (y - lastY) / dt;
      lastY = y;
      const f = flight.foot;
      const inFoot = flight.hud.station === "foot";
      e.setFoot(inFoot ? f.w : 0, f.x);
      if (inFoot && flyArmed && f.t > 0.12 && f.t < 0.6) {
        flyArmed = false;
        e.flyby();
      } else if (!inFoot || f.t < 0.03) flyArmed = true;
      e.setScroll(v, dt);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sound]);

  const toggleReduced = useCallback(() => setReduced((r) => !r), []);
  const cue = useCallback((c: UiCue, pan?: number) => engineRef.current?.ui(c, pan), []);
  const engine = useCallback(() => engineRef.current, []);

  const value = useMemo(
    () => ({ sound, toggleSound, reduced, toggleReduced, cue, engine }),
    [sound, toggleSound, reduced, toggleReduced, cue, engine],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExperience() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useExperience must be used inside <ExperienceProvider>");
  return v;
}
