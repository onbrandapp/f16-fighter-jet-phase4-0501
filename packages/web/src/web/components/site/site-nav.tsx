import { useEffect, useRef, useState } from "react";
import { useExperience } from "../experience/experience-context";
import { SECTIONS } from "./content";
import { scrollToId } from "./shared";

export function BrandMark() {
  return (
    <span className="jet-wordmark-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path d="M12 2 L14 10 L22 14 L14 14.5 L13 20 L16 22 L8 22 L11 20 L10 14.5 L2 14 L10 10 Z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function SoundChip({ className = "" }: { className?: string }) {
  const { sound, toggleSound, engine, reduced } = useExperience();
  const eqRef = useRef<HTMLSpanElement>(null);

  // live level bars from the engine's analyser while sound is on
  useEffect(() => {
    const eq = eqRef.current;
    if (!sound || !eq) return;
    const bars = Array.from(eq.children) as HTMLElement[];
    const lv = [0, 0, 0, 0];
    const shown = [0.2, 0.2, 0.2, 0.2];
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      engine()?.bands(lv);
      for (let i = 0; i < bars.length; i++) {
        // a little gain per band (highs are naturally quieter), eased
        const goal = Math.min(1, (lv[i] ?? 0) * (1.25 + i * 0.35));
        shown[i]! += (goal - shown[i]!) * (reduced ? 1 : 0.35);
        bars[i]!.style.transform = `scaleY(${(0.22 + 0.78 * shown[i]!).toFixed(3)})`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      for (const b of bars) b.style.transform = "";
    };
  }, [sound, engine, reduced]);

  return (
    <button
      type="button"
      className={`jet-chip jet-sound ${sound ? "is-on" : ""} ${className}`}
      aria-pressed={sound}
      aria-keyshortcuts="M"
      title={sound ? "Mute (M)" : "Turn sound on (M)"}
      onClick={toggleSound}
    >
      <span ref={eqRef} className="jet-eq" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>{sound ? "Sound on" : "Sound off"}</span>
    </button>
  );
}

const HINT_KEY = "falcon.soundHint";

/** one-time nudge after the loader: sound is off by default */
function SoundHint({ ready }: { ready: boolean }) {
  const { sound, toggleSound } = useExperience();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let seen = false;
    try {
      seen = localStorage.getItem(HINT_KEY) === "1";
    } catch {
      /* storage blocked: show it this once */
    }
    if (seen) return;
    const t0 = window.setTimeout(() => setShow(true), 1400);
    const t1 = window.setTimeout(() => setShow(false), 1400 + 9000);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [ready]);

  useEffect(() => {
    if (!show) return;
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [show]);

  useEffect(() => {
    if (sound) setShow(false);
  }, [sound]);

  return (
    <div className={`sound-hint ${show ? "is-in" : ""}`} aria-live="polite" aria-hidden={!show}>
      <p>
        <b>Sound on</b> for the full experience
        <span className="sound-hint-key">
          or press <kbd>M</kbd>
        </span>
      </p>
      <button type="button" className="sound-hint-on" tabIndex={show ? 0 : -1} onClick={toggleSound}>
        Turn on
      </button>
      <button
        type="button"
        className="sound-hint-x"
        aria-label="Dismiss"
        tabIndex={show ? 0 : -1}
        onClick={() => setShow(false)}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
    </div>
  );
}

export function SiteNav({ ready }: { ready: boolean }) {
  const { reduced, toggleReduced } = useExperience();
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    const top = document.getElementById("top");
    if (top) io.observe(top);
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  return (
    <header className={`jet-nav ${ready ? "is-in" : ""} ${scrolled ? "is-scrolled" : ""}`} data-hero-keys>
      <a
        className="jet-wordmark"
        href="#top"
        aria-label="Falcon — back to top"
        onClick={(e) => {
          e.preventDefault();
          scrollToId("top");
        }}
      >
        <BrandMark />
        <span>FALCON</span>
        <span className="jet-wordmark-sub">F-16</span>
      </a>
      <nav className="jet-links" aria-label="Primary">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={active === s.id ? "is-active" : ""}
            aria-current={active === s.id ? "true" : undefined}
            onClick={(e) => {
              e.preventDefault();
              scrollToId(s.id);
            }}
          >
            {s.label}
          </a>
        ))}
      </nav>
      <div className="jet-controls">
        <button type="button" className="jet-chip" aria-pressed={reduced} onClick={toggleReduced} title="Reduce motion">
          <span className={`jet-dot ${reduced ? "on" : ""}`} aria-hidden="true" />
          <span className="jet-chip-label">Reduced motion</span>
        </button>
        <SoundChip />
      </div>
      <SoundHint ready={ready} />
    </header>
  );
}
