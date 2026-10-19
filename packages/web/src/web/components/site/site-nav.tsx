import { useEffect, useState } from "react";
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
  const { sound, toggleSound } = useExperience();
  return (
    <button
      type="button"
      className={`jet-chip jet-sound ${sound ? "is-on" : ""} ${className}`}
      aria-pressed={sound}
      onClick={toggleSound}
    >
      <span className="jet-eq" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>{sound ? "Sound on" : "Sound off"}</span>
    </button>
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
    </header>
  );
}
