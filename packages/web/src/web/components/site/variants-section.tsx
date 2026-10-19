import { useCallback, useMemo, useRef, useState } from "react";
import { useExperience } from "../experience/experience-context";
import { HudCallouts, type Callout } from "../hud/hud-callouts";
import { flight, type Loadout } from "../jet/flight-store";
import { requestContact, VARIANTS, type Variant } from "./content";
import { clamp, Dialog, LoopVideo, useFrameWhileVisible, type DialogHandle } from "./shared";

const N = VARIANTS.length;

const LOADOUT_OPTS: { id: Loadout; label: string; code: string }[] = [
  { id: "clean", label: "Clean", code: "CLN" },
  { id: "a2a", label: "Air-to-air", code: "A/A" },
  { id: "strike", label: "Strike", code: "A/G" },
];

/** block-specific hardware, pinned to the airframe */
const PART_CALLOUTS: Record<string, Callout[]> = {
  ab: [
    { anchor: "radome", k: "APG-66", v: "Pulse-Doppler" },
    { anchor: "canopy", k: "CANOPY", v: "One-piece bubble" },
  ],
  cd: [
    { anchor: "radome", k: "APG-68", v: "Multi-mode radar" },
    { anchor: "intake", k: "MCID", v: "Big-mouth inlet" },
  ],
  ef: [
    { anchor: "radome", k: "APG-80", v: "First F-16 AESA" },
    { anchor: "cftR", k: "CFT", v: "Conformal tanks", tone: "amber" },
    { anchor: "spine", k: "SPINE", v: "Avionics bay", tone: "amber" },
  ],
  v: [
    { anchor: "radome", k: "APG-83", v: "SABR AESA" },
    { anchor: "cftR", k: "CFT", v: "Conformal tanks", tone: "amber" },
  ],
};

const LOAD_CALLOUTS: Record<Loadout, Callout[]> = {
  clean: [],
  a2a: [
    { anchor: "tipR", k: "STA 9", v: "AIM-120" },
    { anchor: "st3L", k: "STA 3", v: "AIM-120" },
  ],
  strike: [
    { anchor: "st3L", k: "STA 3", v: "GBU-31 JDAM", tone: "amber" },
    { anchor: "pod", k: "STA 5R", v: "Targeting pod" },
  ],
};

/**
 * The persistent jet comes to rest here as an orbitable model. Drag orbits the
 * camera (the scene's director reads `flight.variant`), the tabs swap the block
 * (conformal tanks, dorsal spine) and the chips swap the loadout live. The
 * original stills and footage live on in the specification dialog.
 */
export function VariantsSection() {
  const { reduced, cue } = useExperience();
  const [index, setIndex] = useState(0);
  const [loadout, setLoadout] = useState<Loadout>(flight.variant.loadout);
  const [inView, setInView] = useState(false);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    yaw0: number;
    pitch0: number;
    mouse: boolean;
    locked: boolean | null;
  } | null>(null);
  const [spec, setSpec] = useState<Variant | null>(null);
  const dialog = useRef<DialogHandle>(null);

  const go = useCallback(
    (i: number) => {
      const n = clamp(i, 0, N - 1);
      if (n === index) return;
      setIndex(n);
      flight.variant.id = VARIANTS[n]!.id;
      cue("swish");
    },
    [cue, index],
  );

  const pickLoadout = (l: Loadout) => {
    if (l === loadout) return;
    setLoadout(l);
    flight.variant.loadout = l;
    cue("swish");
  };

  const ref = useFrameWhileVisible<HTMLElement>((rect, dt) => {
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const vh = window.innerHeight;
    const cy = r.top + r.height / 2;
    const on = cy > vh * 0.18 && cy < vh * 0.82 && rect.bottom > 0;
    if (on !== inView) setInView(on);
    // let a released drag drift its pitch back toward the resting view
    if (!drag.current && dt > 0) {
      flight.variant.pitch += (0 - flight.variant.pitch) * (1 - Math.exp(-dt * (reduced ? 50 : 1.2)));
    }
  });

  const v = VARIANTS[index]!;
  const callouts = useMemo(() => [...(PART_CALLOUTS[v.id] ?? []), ...LOAD_CALLOUTS[loadout]].slice(0, 4), [v.id, loadout]);

  const openSpecs = () => {
    setSpec(v);
    cue("open");
    requestAnimationFrame(() => dialog.current?.open());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      flight.variant.yaw += e.key === "ArrowUp" ? 0.35 : -0.35;
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(N - 1);
    }
  };

  // orbit: a mouse grabs immediately; touch locks to horizontal intent so vertical swipes still scroll
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const mouse = e.pointerType === "mouse";
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      yaw0: flight.variant.yaw,
      pitch0: flight.variant.pitch,
      mouse,
      locked: mouse ? true : null,
    };
    if (mouse) {
      stageRef.current?.setPointerCapture(e.pointerId);
      flight.variant.dragging = true;
      setDragging(true);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.locked === null && Math.hypot(dx, dy) > 8) {
      g.locked = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (g.locked) {
        stageRef.current?.setPointerCapture(e.pointerId);
        flight.variant.dragging = true;
        setDragging(true);
      } else drag.current = null;
    }
    if (!g.locked) return;
    const w = stageRef.current?.clientWidth ?? 800;
    flight.variant.yaw = g.yaw0 - (dx / w) * Math.PI * 1.6;
    if (g.mouse) flight.variant.pitch = clamp(g.pitch0 + dy * 0.004, -0.5, 0.85);
  };
  const endDrag = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    flight.variant.dragging = false;
    setDragging(false);
  };

  return (
    <section ref={ref} id="variants" className="var" aria-labelledby="var-title">
      <div className="var-head">
        <p className="fx-eyebrow">
          <span className="fx-num">04</span> Variants
        </p>
        <h2 id="var-title" className="fx-display">
          One airframe. <em>Five decades.</em>
        </h2>
      </div>

      {/* 3D viewer: focusable so Arrow / Home / End work once a visitor is inside it */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <section
        ref={stageRef}
        className={`var-stage ${dragging ? "is-dragging" : ""}`}
        data-flight="var"
        aria-roledescription="3D viewer"
        aria-label={`${v.name} — drag to orbit; left and right arrow keys change variant, up and down rotate`}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <HudCallouts group={`${v.id}-${loadout}`} items={callouts} show={inView && !dragging} />
        <span className="var-orbit" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M3 12c0-2.8 4-5 9-5s9 2.2 9 5-4 5-9 5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M10 14.5 12.2 17 10 19.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Drag to orbit
        </span>
      </section>

      <div className="var-controls">
        <fieldset className="var-tabs" aria-label="Variant">
          {VARIANTS.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`var-tab ${i === index ? "is-active" : ""}`}
              aria-pressed={i === index}
              onClick={() => go(i)}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") cue("hover", (e.clientX / window.innerWidth) * 2 - 1);
              }}
            >
              <span className="var-tab-n">{String(i + 1).padStart(2, "0")}</span>
              {item.name}
            </button>
          ))}
        </fieldset>
        <fieldset className="var-load" aria-label="Loadout">
          <span className="var-load-label" aria-hidden="true">
            Stores
          </span>
          {LOADOUT_OPTS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`var-chip ${loadout === o.id ? "is-active" : ""}`}
              aria-pressed={loadout === o.id}
              onClick={() => pickLoadout(o.id)}
            >
              <b aria-hidden="true">{o.code}</b>
              {o.label}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="var-foot">
        <div className="var-info" aria-live="polite">
          <div key={v.id} className="fx-reveal">
            <p className="fx-eyebrow">
              <span className="fx-mask">
                <span>
                  <span className="fx-num">{String(index + 1).padStart(2, "0")}</span> {v.era}
                </span>
              </span>
            </p>
            <h3 className="var-title">
              <span className="fx-mask">
                <span>
                  {v.name} <em>— {v.tag}</em>
                </span>
              </span>
            </h3>
            <p className="var-headline">
              <span className="fx-mask">
                <span>{v.headline}</span>
              </span>
            </p>
          </div>
        </div>

        <div className="var-actions">
          <button type="button" className="jet-cta" onClick={openSpecs}>
            <span>Explore Specifications</span>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
          <div className="var-nav">
            <button
              type="button"
              className="var-arrow"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Previous variant"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
            <span className="var-count" aria-hidden="true">
              <b>{String(index + 1).padStart(2, "0")}</b> / {String(N).padStart(2, "0")}
            </span>
            <button
              type="button"
              className="var-arrow"
              onClick={() => go(index + 1)}
              disabled={index === N - 1}
              aria-label="Next variant"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <Dialog ref={dialog} label={spec ? `${spec.name} specifications` : "Specifications"} onClosed={() => setSpec(null)}>
        {spec && (
          <div className="fx-detail">
            <LoopVideo src={spec.video} poster={spec.poster} alt={spec.name} play reduced={reduced} eager className="fx-detail-media is-portrait" />
            <div className="fx-detail-body">
              <p className="fx-eyebrow">
                <span className="fx-num">{spec.era}</span>
              </p>
              <h3 className="fx-detail-title">
                {spec.name} <em>{spec.tag}</em>
              </h3>
              <p className="fx-detail-statement">{spec.headline}</p>
              <p className="fx-detail-text">{spec.summary}</p>
              <dl className="fx-detail-stats is-specs">
                {spec.specs.map((s) => (
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
                  requestContact("variant-inquiry");
                }}
              >
                <span>Enquire about the {spec.name}</span>
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
