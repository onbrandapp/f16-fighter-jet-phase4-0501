import { SECTIONS, requestContact } from "./content";
import { scrollToId } from "./shared";
import { BrandMark, SoundChip } from "./site-nav";

export function SiteFooter() {
  return (
    <footer className="foot" aria-labelledby="foot-title">
      <h2 id="foot-title" className="sr-only">
        Site footer
      </h2>
      <div className="foot-top">
        <div className="foot-brand">
          <a
            className="jet-wordmark"
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("top");
            }}
          >
            <BrandMark />
            <span>FALCON</span>
            <span className="jet-wordmark-sub">F-16</span>
          </a>
          <p>The Fighting Falcon — fifty years of agility, versatility and combat-proven performance.</p>
        </div>

        <nav className="foot-col" aria-label="Footer">
          <p className="foot-label">Sections</p>
          <ul>
            <li>
              <a
                href="#top"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId("top");
                }}
              >
                Overview
              </a>
            </li>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToId(s.id);
                  }}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="foot-col">
          <p className="foot-label">Contact</p>
          <ul>
            <li>
              <button type="button" className="foot-linkbtn" onClick={() => requestContact("tactical-briefing")}>
                Request a briefing
              </button>
            </li>
            <li>
              <button type="button" className="foot-linkbtn" onClick={() => requestContact("variant-inquiry")}>
                Variant inquiries
              </button>
            </li>
            <li>
              <button type="button" className="foot-linkbtn" onClick={() => requestContact("general-inquiry")}>
                General inquiries
              </button>
            </li>
          </ul>
          <p className="foot-small">All messages go through the secure contact form.</p>
        </div>

        <div className="foot-col foot-controls">
          <p className="foot-label">Experience</p>
          <SoundChip />
          <button type="button" className="foot-top-btn" onClick={() => scrollToId("top")}>
            <span>Back to top</span>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="foot-bottom">
        <p>
          © 2026 Falcon. All rights reserved. IP Owned by{" "}
          <a className="foot-credit" href="https://feelgoodstudiodark.framer.website/" target="_blank" rel="noopener noreferrer">
            FeelGood Studio
          </a>
        </p>
        <p className="foot-disclaimer">
          An independent showcase. Imagery and video are AI-generated illustrations; not affiliated with Lockheed Martin
          or any air force.
        </p>
      </div>
    </footer>
  );
}
