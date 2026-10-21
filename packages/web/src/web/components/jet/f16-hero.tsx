import "./jet-hero.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { JetScene } from "./jet-scene";
import { attachGestureInput } from "./gesture-input";
import { atTop, smoothScrollTo } from "../experience/smooth-scroll";
import { useExperience } from "../experience/experience-context";
import { STAGE_COPY } from "./stage-copy";
import { STAGE_COUNT } from "./camera-stages";
import { flight } from "./flight-store";

type Phase = "loading" | "ready" | "error";

type HeroProps = {
  onReady?: () => void;
  /** id of the section the page releases into after the final stage */
  nextId: string;
};

export function F16Hero({ onReady, nextId }: HeroProps) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<JetScene | null>(null);
  const { reduced, engine } = useExperience();
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(0); // settled stage
  const [target, setTarget] = useState(0); // stage being travelled to
  const [moving, setMoving] = useState(false);
  const [engaged, setEngaged] = useState(true);
  const reducedRef = useRef(reduced);
  const stageRef = useRef(0);

  // scene lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: JetScene;
    try {
      scene = new JetScene(
        canvas,
        {
          onProgress: (p) => setProgress(p),
          onMoveStart: (from, to, duration) => {
            setMoving(true);
            setTarget(to);
            engineRef.current()?.whoosh(to > from ? 1 : -1, duration);
          },
          onSettle: (s) => {
            stageRef.current = s;
            setStage(s);
            setTarget(s);
            setMoving(false);
          },
        },
        { reducedMotion: reducedRef.current, fadeEl: fadeRef.current },
      );
    } catch (e) {
      console.error(e);
      setError("Your browser could not start WebGL, which this experience needs.");
      setPhase("error");
      return;
    }
    sceneRef.current = scene;
    flight.scene = scene;
    scene
      .load()
      .then(() => {
        document.documentElement.classList.add("has-webgl");
        setPhase("ready");
        onReadyRef.current?.();
      })
      .catch((e: unknown) => {
        console.error(e);
        setError(e instanceof Error ? e.message : "The aircraft failed to load.");
        setPhase("error");
        onReadyRef.current?.();
      });
    if (import.meta.env.DEV) (window as unknown as { __jet: JetScene }).__jet = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
      if (flight.scene === scene) flight.scene = null;
    };
  }, []);

  useEffect(() => {
    reducedRef.current = reduced;
    sceneRef.current?.setReducedMotion(reduced);
  }, [reduced]);

  const step = useCallback((dir: 1 | -1) => {
    const s = sceneRef.current;
    if (!s) return false;
    return s.go(dir);
  }, []);

  const release = useCallback(
    (source: "wheel" | "touch" | "key") => {
      // wheel releases scroll natively; touch and keys get a smooth hand-off
      if (source === "wheel") return;
      const next = document.getElementById(nextId);
      if (next) smoothScrollTo(next, { immediate: reducedRef.current });
    },
    [nextId],
  );

  // input
  useEffect(() => {
    const el = rootRef.current;
    if (!el || phase !== "ready") return;
    return attachGestureInput(el, {
      isBusy: () => sceneRef.current?.busy ?? true,
      isEngaged: atTop,
      canRelease: () => stageRef.current === STAGE_COUNT && !(sceneRef.current?.busy ?? true),
      onStep: (dir) => {
        step(dir);
      },
      onRelease: release,
    });
  }, [phase, step, release]);

  // engaged flag (drives touch-action). The scene keeps flying below the hero —
  // it decides for itself when it is covered (past the last station).
  useEffect(() => {
    const onScroll = () => setEngaged(window.scrollY <= 1);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const onVis = () => sceneRef.current?.setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // keep the page still until the hero is ready (error state releases it)
  useEffect(() => {
    const lock = phase === "loading";
    document.documentElement.classList.toggle("is-locked", lock);
    return () => document.documentElement.classList.remove("is-locked");
  }, [phase]);

  const caption = !moving && stage > 0 ? STAGE_COPY[stage - 1] : undefined;
  const showHero = stage === 0 && !moving;
  const ready = phase === "ready";

  const pct = Math.round(progress * 100);
  const airframe = Math.min(1, progress / 0.92);
  const steps: { k: string; v: string; s: "ok" | "run" | "wait" }[] = [
    { k: "Data link", v: progress > 0 ? "OK" : "SYNC", s: progress > 0 ? "ok" : "run" },
    {
      k: "Airframe",
      v: airframe >= 1 ? "OK" : `${String(Math.round(airframe * 100)).padStart(2, "0")}%`,
      s: airframe >= 1 ? "ok" : progress > 0 ? "run" : "wait",
    },
    { k: "Decode + stores", v: progress >= 1 ? "OK" : progress >= 0.92 ? "RUN" : "--", s: progress >= 1 ? "ok" : progress >= 0.92 ? "run" : "wait" },
    { k: "Shaders · weather", v: ready ? "OK" : progress >= 1 ? "RUN" : "--", s: ready ? "ok" : progress >= 1 ? "run" : "wait" },
  ];
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <>
    <div className="sky-layer" aria-hidden="true">
      <canvas ref={canvasRef} className="jet-canvas" aria-label="F-16 3D scene" />
      <div className="jet-vignette" />
      <div className="jet-grain" />
      <div ref={fadeRef} className="jet-fade" />
    </div>
    <section
      ref={rootRef}
      className="jet-hero"
      aria-label="F-16 Fighting Falcon — interactive 3D hero"
      data-stage={stage}
      data-moving={moving ? "1" : "0"}
      data-engaged={engaged ? "1" : "0"}
      id="top"
    >

      {/* stop 0 headline */}
      <div className={`jet-intro ${ready && showHero ? "is-in" : ""}`} aria-hidden={!showHero}>
        <p className="jet-eyebrow">Lockheed Martin · F-16 Fighting Falcon</p>
        <h1 className="jet-title">
          Master of the <em>unseen</em> sky.
        </h1>
        <p className="jet-lede">
          A single-engine legend, rendered in real time. Five perspectives, one gesture at a time.
        </p>
        <div className="jet-cta-row">
          <button type="button" className="jet-cta" onClick={() => step(1)} tabIndex={showHero ? 0 : -1}>
            <span>Explore the Jet</span>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
          <span className="jet-hint">
            <span className="jet-hint-line" aria-hidden="true" />
            Scroll, swipe or press ↓
          </span>
        </div>
      </div>

      {/* stage captions */}
      {STAGE_COPY.map((c, i) => (
        <div
          key={c.index}
          className={`jet-caption place-${c.place} ${caption === c ? "is-in" : ""}`}
          aria-hidden={caption !== c}
        >
          <p className="jet-eyebrow">
            <span className="jet-caption-index">{c.index}</span>
            {c.label}
          </p>
          <h2 className="jet-caption-title">{c.title}</h2>
          <p className="jet-caption-body">{c.body}</p>
          {i === STAGE_COPY.length - 1 && (
            <button
              type="button"
              className="jet-caption-foot"
              tabIndex={caption === c ? 0 : -1}
              onClick={() => release("key")}
            >
              Continue to capabilities <span aria-hidden="true">↓</span>
            </button>
          )}
        </div>
      ))}

      {/* progress */}
      <ol className={`jet-progress ${ready ? "is-in" : ""}`} aria-label="Camera stages">
        {STAGE_COPY.map((c, i) => {
          const n = i + 1;
          const done = stage >= n && !(moving && target < n);
          const active = moving ? target === n : stage === n;
          return (
            <li
              key={c.index}
              className={`${done ? "done" : ""} ${active ? "active" : ""}`}
              aria-current={stage === n ? "step" : undefined}
            >
              <span className="jet-progress-label">{c.label}</span>
              <span className="jet-progress-bar" />
            </li>
          );
        })}
        <li className="jet-progress-count" aria-live="polite">
          {String(moving ? target : stage).padStart(2, "0")} / {String(STAGE_COUNT).padStart(2, "0")}
        </li>
      </ol>

      {/* loading */}
      <div className={`jet-loader ${ready ? "is-done" : ""}`} aria-busy={!ready}>
        {phase === "error" ? (
          <div className="jet-loader-inner">
            <p className="jet-eyebrow">Signal lost</p>
            <p className="jet-loader-error">{error}</p>
            <button type="button" className="jet-cta" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        ) : (
          <div className="boot">
            <div className="boot-dial" aria-hidden="true">
              <svg viewBox="0 0 120 120">
                {Array.from({ length: 48 }, (_, i) => (
                  <line
                    key={i}
                    x1="60"
                    y1="3"
                    x2="60"
                    y2={i % 4 === 0 ? "10" : "7"}
                    transform={`rotate(${i * 7.5} 60 60)`}
                    className={i / 48 <= progress ? "on" : ""}
                  />
                ))}
                <circle cx="60" cy="60" r={R} className="boot-track" />
                <circle
                  cx="60"
                  cy="60"
                  r={R}
                  className="boot-arc"
                  strokeDasharray={`${(C * Math.max(0.01, progress)).toFixed(2)} ${C.toFixed(2)}`}
                  transform="rotate(-90 60 60)"
                />
                <path d="M52 60h-8M68 60h8M60 52v-8M60 68v8" className="boot-cross" />
              </svg>
              <span className="boot-pct">
                {String(pct).padStart(3, "0")}
                <i>%</i>
              </span>
            </div>
            <div className="boot-read">
              <p className="boot-title">
                F-16 · Pre-flight <span>BIT</span>
              </p>
              <ul className="boot-steps">
                {steps.map((st) => (
                  <li key={st.k} className={`is-${st.s}`}>
                    <span>{st.k}</span>
                    <b>{st.v}</b>
                  </li>
                ))}
              </ul>
              <output className="boot-status">{ready ? "Systems go" : progress < 0.92 ? "Loading airframe" : "Calibrating"}</output>
            </div>
          </div>
        )}
      </div>
    </section>
    </>
  );
}
