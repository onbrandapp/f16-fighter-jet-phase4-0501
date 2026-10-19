import { useRef, useState } from "react";
import { useExperience } from "../experience/experience-context";
import { HudCallouts, type Callout } from "../hud/hud-callouts";
import { flight } from "../jet/flight-store";
import { CAPABILITIES, requestContact, type Capability } from "./content";
import { clamp, Dialog, LoopVideo, smooth, useFrameWhileVisible, type DialogHandle } from "./shared";

const N = CAPABILITIES.length;

/** HUD callouts pinned to the live airframe, per capability */
const CALLOUTS: Record<string, Callout[]> = {
  agility: [
    { anchor: "tipR", k: "VTX", v: "Wingtip vortex" },
    { anchor: "canopy", k: "SEAT", v: "30° recline" },
    { anchor: "fin", k: "FBW", v: "Quad-redundant", tone: "amber" },
  ],
  multirole: [
    { anchor: "tipR", k: "STA 9", v: "AIM-120 AMRAAM" },
    { anchor: "st2R", k: "STA 8", v: "AIM-9X" },
    { anchor: "st3R", k: "STA 7", v: "GBU-31 JDAM", tone: "amber" },
    { anchor: "pod", k: "CHIN", v: "Targeting pod" },
  ],
  ew: [
    { anchor: "ecm", k: "CL", v: "ECM pod", tone: "amber" },
    { anchor: "fin", k: "RWR", v: "360° warning" },
    { anchor: "nozzle", k: "CMDS", v: "Chaff · flare" },
  ],
  avionics: [
    { anchor: "radome", k: "AESA", v: "APG-83 SABR" },
    { anchor: "canopy", k: "JHMCS", v: "Visor cueing" },
    { anchor: "cue", k: "HOBS", v: "Target · locked", tone: "amber" },
  ],
  supersonic: [
    { anchor: "nose", k: "M 2.05", v: "Bow shock" },
    { anchor: "intake", k: "INLET", v: "Fixed geometry" },
    { anchor: "nozzle", k: "F110", v: "Afterburner", tone: "amber" },
  ],
};

/**
 * Sticky vertical reel. Scroll progress through the (tall) section maps onto a
 * card position with a dwell at each card, eased toward with a critically
 * damped lerp so the column glides rather than tracks the wheel 1:1.
 */
export function PerformanceSection() {
  const { reduced, cue } = useExperience();
  const progressRef = useRef<HTMLDivElement>(null);
  const cur = useRef(0);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<Capability | null>(null);
  const dialog = useRef<DialogHandle>(null);
  const [visible, setVisible] = useState(false);
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);

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
    flight.perf = c;
    const target = Math.round(pos);
    const st =
      Math.abs(pos - target) < 0.08 &&
      Math.abs(c - target) < 0.22 &&
      rect.top <= 1 && rect.bottom >= vh - 1;
    if (st !== settledRef.current) {
      settledRef.current = st;
      setSettled(st);
    }
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

        <div className="perf-stage" data-flight="perf">
          <HudCallouts group={cap.id} items={CALLOUTS[cap.id] ?? []} show={settled && visible} />
          <span className="perf-stage-mark" aria-hidden="true">
            <span>{cap.index}</span> / {String(N).padStart(2, "0")}
          </span>
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
            <button
              type="button"
              className="perf-thumb"
              onClick={() => openCard(cap)}
              aria-label={`${cap.name} — watch footage`}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") cue("hover", (e.clientX / window.innerWidth) * 2 - 1);
              }}
            >
              <LoopVideo src={cap.video} poster={cap.poster} alt="" play={visible} reduced={reduced} className="perf-thumb-media" />
              <span className="perf-thumb-tag" aria-hidden="true">
                <i /> Footage
              </span>
            </button>
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
