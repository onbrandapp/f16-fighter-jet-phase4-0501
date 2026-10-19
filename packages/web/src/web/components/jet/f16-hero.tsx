import "./jet-hero.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { JetScene } from "./jet-scene";
import { attachGestureInput } from "./gesture-input";
import { atTop, smoothScrollTo } from "../experience/smooth-scroll";
import { useExperience } from "../experience/experience-context";
import { STAGE_COPY } from "./stage-copy";
import { STAGE_COUNT } from "./camera-stages";

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
    scene
      .load()
      .then(() => {
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

  // engaged flag (drives touch-action) + pause rendering when off-screen
  useEffect(() => {
    const onScroll = () => setEngaged(window.scrollY <= 1);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const el = rootRef.current;
    const io = new IntersectionObserver(([en]) => sceneRef.current?.setPaused(!en?.isIntersecting), {
      threshold: 0,
    });
    if (el) io.observe(el);
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
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

  return (
    <section
      ref={rootRef}
      className="jet-hero"
      aria-label="F-16 Fighting Falcon — interactive 3D hero"
      data-stage={stage}
      data-moving={moving ? "1" : "0"}
      data-engaged={engaged ? "1" : "0"}
      id="top"
    >
      <canvas ref={canvasRef} className="jet-canvas" aria-hidden="true" />
      <div className="jet-vignette" aria-hidden="true" />
      <div className="jet-grain" aria-hidden="true" />
      <div ref={fadeRef} className="jet-fade" aria-hidden="true" />

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
      <div className={`jet-loader ${ready ? "is-done" : ""}`} aria-live="polite" aria-busy={!ready}>
        {phase === "error" ? (
          <div className="jet-loader-inner">
            <p className="jet-eyebrow">Signal lost</p>
            <p className="jet-loader-error">{error}</p>
            <button type="button" className="jet-cta" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        ) : (
          <div className="jet-loader-inner">
            <p className="jet-eyebrow">Falcon · Pre-flight</p>
            <div className="jet-loader-bar">
              <span style={{ transform: `scaleX(${Math.max(0.02, progress)})` }} />
            </div>
            <p className="jet-loader-meta">
              <span>{progress < 0.92 ? "Loading airframe" : "Calibrating clouds"}</span>
              <span>{Math.round(progress * 100)}%</span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
