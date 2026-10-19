import { useRef, useState } from "react";
import { useExperience } from "../experience/experience-context";
import { CAPABILITIES, requestContact, type Capability } from "./content";
import { clamp, Dialog, LoopVideo, smooth, tiltHandlers, useFrameWhileVisible, type DialogHandle } from "./shared";

const N = CAPABILITIES.length;

/**
 * Sticky vertical reel. Scroll progress through the (tall) section maps onto a
 * card position with a dwell at each card, eased toward with a critically
 * damped lerp so the column glides rather than tracks the wheel 1:1.
 */
export function PerformanceSection() {
  const { reduced, cue } = useExperience();
  const cardsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const progressRef = useRef<HTMLDivElement>(null);
  const cur = useRef(0);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<Capability | null>(null);
  const dialog = useRef<DialogHandle>(null);
  const [visible, setVisible] = useState(false);

  const ref = useFrameWhileVisible<HTMLElement>((rect, dt) => {
    const vh = window.innerHeight;
    const onScreen = rect.top < vh && rect.bottom > 0;
    if (onScreen !== visible) setVisible(onScreen);
    if (dt === 0) return;
    const total = Math.max(1, rect.height - vh);
    const raw = clamp(-rect.top / total);
    const x = raw * (N - 1);
    const seg = Math.min(N - 2, Math.floor(x));
    const pos = seg + smooth(0.18, 0.82, x - seg);
    if (reduced) cur.current = Math.round(pos);
    else cur.current += (pos - cur.current) * (1 - Math.exp(-dt * 8));
    if (Math.abs(pos - cur.current) < 0.0005) cur.current = pos;

    const c = cur.current;
    const first = cardsRef.current[0];
    const gap = (first?.offsetHeight ?? 300) * 0.9;
    cardsRef.current.forEach((el, i) => {
      if (!el) return;
      const d = i - c;
      const ad = Math.abs(d);
      const s = 1 - Math.min(ad, 2) * 0.17;
      el.style.transform = `translate3d(-50%, calc(-50% + ${(d * gap).toFixed(1)}px), 0) scale(${s.toFixed(4)})`;
      el.style.setProperty("--dim", Math.min(1, ad * 0.7).toFixed(3));
      el.style.opacity = String(clamp(2.4 - ad));
      el.style.zIndex = String(10 - Math.round(ad * 2));
    });
    progressRef.current?.style.setProperty("--p", (c / (N - 1)).toFixed(4));
    const a = Math.round(c);
    if (a !== activeRef.current) {
      activeRef.current = a;
      setActive(a);
      cue("swish");
    }
  });

  const cap = CAPABILITIES[active]!;
  const openCard = (c: Capability) => {
    setOpen(c);
    cue("open");
    requestAnimationFrame(() => dialog.current?.open());
  };

  return (
    <section ref={ref} id="performance" className="perf" style={{ height: `${N * 90 + 40}vh` }} aria-labelledby="perf-title">
      <div className="perf-sticky">
        <div className="perf-head">
          <p className="fx-eyebrow">
            <span className="fx-num">02</span> Performance
          </p>
          <h2 id="perf-title" className="fx-display">
            Built to win <em>the merge.</em>
          </h2>
          <p className="fx-lede">Five tactical capabilities that keep a fifty-year-old design at the front of the fight.</p>
          <div ref={progressRef} className="perf-progress" aria-hidden="true">
            <div className="perf-progress-track">
              <span />
            </div>
            <ol>
              {CAPABILITIES.map((c, i) => (
                <li key={c.id} className={i === active ? "is-active" : ""}>
                  {c.index}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="perf-reel">
          {CAPABILITIES.map((c, i) => (
            <button
              key={c.id}
              type="button"
              ref={(el) => {
                cardsRef.current[i] = el;
              }}
              className={`perf-card ${i === active ? "is-active" : ""}`}
              onClick={() => openCard(c)}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") cue("hover", (e.clientX / window.innerWidth) * 2 - 1);
              }}
              aria-label={`${c.name} — open details`}
              tabIndex={i === active ? 0 : -1}
            >
              <span className="fx-tilt" {...tiltHandlers(!reduced)}>
                <LoopVideo
                  src={c.video}
                  poster={c.poster}
                  alt=""
                  play={visible && Math.abs(i - active) <= 1}
                  reduced={reduced}
                  className="perf-media"
                />
                <span className="perf-card-shade" aria-hidden="true" />
                <span className="fx-edge" aria-hidden="true" />
                <span className="perf-card-meta" aria-hidden="true">
                  <span>{c.index}</span>
                  <span>{c.short}</span>
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="perf-desc" aria-live="polite">
          <div key={cap.id} className="fx-reveal">
            <p className="fx-eyebrow">
              <span className="fx-mask">
                <span>
                  <span className="fx-num">{cap.index}</span> {cap.short}
                </span>
              </span>
            </p>
            <h3 className="perf-desc-title">
              <span className="fx-mask">
                <span>{cap.name}</span>
              </span>
            </h3>
            <p className="perf-desc-statement">
              <span className="fx-mask">
                <span>{cap.statement}</span>
              </span>
            </p>
            <dl className="perf-stats">
              {cap.stats.map((s) => (
                <div key={s.label} className="fx-mask">
                  <span>
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </span>
                </div>
              ))}
            </dl>
            <button type="button" className="fx-link" onClick={() => openCard(cap)}>
              <span>View module</span>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <Dialog ref={dialog} label={open ? open.name : "Capability"} onClosed={() => setOpen(null)}>
        {open && (
          <div className="fx-detail">
            <LoopVideo src={open.video} poster={open.poster} alt={open.name} play reduced={reduced} eager className="fx-detail-media" />
            <div className="fx-detail-body">
              <p className="fx-eyebrow">
                <span className="fx-num">{open.index}</span> Tactical capability
              </p>
              <h3 className="fx-detail-title">{open.name}</h3>
              <p className="fx-detail-statement">{open.statement}</p>
              <p className="fx-detail-text">{open.detail}</p>
              <dl className="fx-detail-stats">
                {open.stats.map((s) => (
                  <div key={s.label}>
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                className="jet-cta"
                onClick={() => {
                  dialog.current?.close();
                  requestContact("tactical-briefing");
                }}
              >
                <span>Request Briefing</span>
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
