import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SoundEngine, type UiCue } from "../jet/sound-engine";

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
