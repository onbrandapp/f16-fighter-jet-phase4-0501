import { SECTIONS, requestContact } from "./content";
import { scrollToId } from "./shared";
import { SoundChip } from "./site-nav";

/**
 * Closing moment. The footer stage is transparent: the persistent WebGL scene
 * draws a huge FALCON wordmark into it (anchored to `[data-flight="foot"]`)
 * and flies the jet past in front of it, right → left, tied to scroll. The DOM
 * word underneath is the accessible title and the no-WebGL fallback.
 */
export function SiteFooter() {
  return (
    <footer className="foot" aria-labelledby="foot-title">
      <div className="foot-stage" data-flight="foot-stage">
        <div className="foot-sticky">
          <p className="foot-eyebrow">
            <span className="foot-eyebrow-dot" aria-hidden="true" />
            Sortie complete · Return to base
          </p>
          <h2 id="foot-title" className="foot-word">
            <span className="foot-word-anchor" data-flight="foot">
              FALCON
            </span>
          </h2>
          <p className="foot-tag">Fifty years of agility, versatility and combat-proven performance.</p>
        </div>
      </div>

      <div className="foot-bar">
        <nav className="foot-links" aria-label="Footer">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("top");
            }}
          >
            Overview
          </a>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToId(s.id);
              }}
            >
              {s.label}
            </a>
          ))}
          <button type="button" className="foot-linkbtn" onClick={() => requestContact("tactical-briefing")}>
            Request a briefing
          </button>
        </nav>
        <div className="foot-actions">
          <SoundChip />
          <button type="button" className="foot-top-btn" onClick={() => scrollToId("top")}>
            <span>Back to top</span>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>

        <div className="foot-bottom">
          <p>
            <span className="foot-rights">© 2026 Falcon. All rights reserved.</span>{" "}
            <span className="foot-ip">
              IP Owned by{" "}
              <a className="foot-credit" href="https://feelgoodstudiodark.framer.website/" target="_blank" rel="noopener noreferrer">
                FeelGood Studio
              </a>
            </span>
          </p>
          <p className="foot-disclaimer">
            An independent showcase. Imagery and video are AI-generated illustrations; not affiliated with Lockheed Martin
            or any air force.
          </p>
        </div>
      </div>
    </footer>
  );
}
