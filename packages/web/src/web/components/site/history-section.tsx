import { useEffect, useRef, useState } from "react";
import { useExperience } from "../experience/experience-context";
import { FEATURE, MILESTONES, requestContact } from "./content";
import { clamp, LoopVideo, smooth, useFrameWhileVisible, useInView } from "./shared";
import { TopDownJet } from "./topdown-jet";

export function HistorySection() {
  const { reduced } = useExperience();

  // expanding cinematic panel
  const [headRef, headIn] = useInView<HTMLDivElement>({ once: true, threshold: 0.35 });
  const panelRef = useFrameWhileVisible<HTMLDivElement>((rect, dt) => {
    if (dt === 0) return;
    const vh = window.innerHeight;
    const e = reduced ? 1 : smooth(vh * 0.95, vh * 0.12, rect.top);
    const par = clamp((rect.top + rect.height / 2 - vh / 2) / vh, -1, 1);
    const el = panelRef.current!;
    el.style.setProperty("--e", e.toFixed(4));
    el.style.setProperty("--par", reduced ? "0" : par.toFixed(4));
  });

  // milestone list + top-down jet
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jetRef = useRef<TopDownJet | null>(null);
  const rowsRef = useRef<(HTMLLIElement | null)[]>([]);
  const [activeRow, setActiveRow] = useState(0);
  const activeRowRef = useRef(0);
  const [nearRef, near] = useInView<HTMLDivElement>({ margin: "600px", once: true });
  const pCur = useRef(0);
  const time = useRef(0);
  const [jetState, setJetState] = useState<"idle" | "ready" | "failed">("idle");

  useEffect(() => {
    if (!near || !canvasRef.current) return;
    let jet: TopDownJet;
    try {
      jet = new TopDownJet(canvasRef.current);
    } catch (e) {
      console.warn(e);
      setJetState("failed");
      return;
    }
    jetRef.current = jet;
    jet
      .load()
      .then(() => setJetState("ready"))
      .catch((e: unknown) => {
        console.warn(e);
        setJetState("failed");
      });
    return () => {
      jet.dispose();
      jetRef.current = null;
    };
  }, [near]);

  const listRef = useFrameWhileVisible<HTMLDivElement>((rect, dt) => {
    if (dt === 0) return;
    const vh = window.innerHeight;
    const m = jetRef.current?.marginPx ?? Math.min(150, rect.height * 0.12);
    const target = clamp((vh * 0.5 - rect.top - m) / Math.max(1, rect.height - 2 * m));
    pCur.current = reduced ? target : pCur.current + (target - pCur.current) * (1 - Math.exp(-dt * 5));
    time.current += dt;
    const drawnY = jetRef.current?.render(pCur.current, time.current, reduced);

    // the row nearest the aircraft lights up
    const jetY = rect.top + (drawnY ?? m + pCur.current * (rect.height - 2 * m));
    let best = 0;
    let bestD = Infinity;
    rowsRef.current.forEach((row, i) => {
      if (!row) return;
      const r = row.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - jetY);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best !== activeRowRef.current) {
      activeRowRef.current = best;
      setActiveRow(best);
    }
  });

  return (
    <section id="history" className="hist" aria-labelledby="hist-title">
      <div ref={panelRef} className="hist-panel">
        <div className="hist-frame">
          <LoopVideo
            src={FEATURE.video}
            poster={FEATURE.poster}
            alt="An F-16 flying level through dark high-altitude cloud"
            play
            reduced={reduced}
            className="hist-media"
          />
          <div className="hist-shade" aria-hidden="true" />
          <div ref={headRef} className={`hist-copy ${headIn ? "is-in" : ""}`}>
            <p className="fx-eyebrow">
              <span className="fx-num">03</span> Operational history
            </p>
            <h2 id="hist-title" className="fx-display">
              <span className="fx-mask">
                <span>Proven where</span>
              </span>{" "}
              <span className="fx-mask">
                <span>
                  <em>it mattered.</em>
                </span>
              </span>
            </h2>
            <p className="fx-lede hist-lede">
              From the opening night of Operation Desert Storm to the skies over the Balkans and today&apos;s
              round-the-clock air-defence and air-policing missions, the Falcon has flown more combat sorties for
              more air forces than any fighter of its generation.
            </p>
            <button type="button" className="jet-cta" onClick={() => requestContact("tactical-briefing")}>
              <span>Request Briefing</span>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div ref={nearRef} className="hist-timeline">
        <div ref={listRef} className="hist-grid">
          <div className="hist-list-wrap">
            <p className="fx-eyebrow hist-list-label">Operational milestones</p>
            <ol className="hist-list">
              {MILESTONES.map((m, i) => (
                <li
                  key={m.year}
                  ref={(el) => {
                    rowsRef.current[i] = el;
                  }}
                  className={i === activeRow ? "is-active" : ""}
                >
                  <span className="hist-year">{m.year}</span>
                  <span className="hist-row-body">
                    <span className="hist-row-title">{m.title}</span>
                    <span className="hist-row-text">{m.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className={`hist-track is-${jetState}`} aria-hidden="true">
            <canvas ref={canvasRef} className="hist-canvas" aria-label="The F-16 seen from above" />
          </div>
        </div>
      </div>
    </section>
  );
}
