import "../components/jet/jet-hero.css";
import "../components/hud/hud.css";
import "../components/site/site.css";
import "./not-found.css";
import { useEffect } from "react";
import { Link } from "wouter";
import { BrandMark } from "../components/site/site-nav";

const TICKS = Array.from({ length: 72 }, (_, i) => i);

/**
 * 404 — a HUD radar with nothing on it. The sweep keeps turning, the
 * readouts have lost the track, and the only way out is back to base.
 */
export default function NotFound() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";

  useEffect(() => {
    const prev = document.title;
    document.title = "No contact · Falcon";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <main className="nf" aria-labelledby="nf-title">
      <header className="nf-top">
        <Link href="/" className="jet-wordmark nf-brand" aria-label="Falcon home">
          <BrandMark />
          <span>FALCON</span>
          <span className="jet-wordmark-sub">F-16</span>
        </Link>
        <p className="nf-code">
          ERR <b>404</b>
        </p>
      </header>

      <div className="nf-grid">
        <div className="nf-scope" aria-hidden="true">
          <svg viewBox="0 0 400 400">
            {TICKS.map((i) => (
              <line
                key={i}
                x1="200"
                y1="6"
                x2="200"
                y2={i % 6 === 0 ? "20" : "13"}
                transform={`rotate(${i * 5} 200 200)`}
                className={i % 6 === 0 ? "maj" : ""}
              />
            ))}
            {[48, 96, 144, 186].map((r) => (
              <circle key={r} cx="200" cy="200" r={r} />
            ))}
            <path d="M200 14V386M14 200H386" className="cross" />
            <path d="M200 200 L69 69M200 200 L331 69" className="fan" />
            {(
              [
                ["N", 200, 40],
                ["E", 362, 204],
                ["S", 200, 368],
                ["W", 38, 204],
              ] as const
            ).map(([l, x, y]) => (
              <text key={l} x={x} y={y} textAnchor="middle">
                {l}
              </text>
            ))}
          </svg>
          <span className="nf-sweep" />
          <span className="nf-ghost" />
          <span className="nf-own" />
        </div>

        <div className="nf-copy">
          <p className="nf-eyebrow">
            <span className="nf-dot" />
            Signal lost
          </p>
          <h1 id="nf-title" className="nf-title">
            No <em>contact.</em>
          </h1>
          <p className="nf-body">
            This page has dropped off the scope. It may have been moved, renamed, or it never filed a flight plan.
          </p>
          <dl className="nf-read">
            <div>
              <dt>Last known</dt>
              <dd title={path}>{path}</dd>
            </div>
            <div>
              <dt>Bearing</dt>
              <dd>---°</dd>
            </div>
            <div>
              <dt>Range</dt>
              <dd>-- NM</dd>
            </div>
            <div>
              <dt>Squawk</dt>
              <dd className="amber">7600</dd>
            </div>
          </dl>
          <Link href="/" className="jet-cta is-solid nf-cta">
            <span>Return to base</span>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
