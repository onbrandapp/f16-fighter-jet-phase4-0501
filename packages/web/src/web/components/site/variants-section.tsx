import { useCallback, useRef, useState } from "react";
import { useExperience } from "../experience/experience-context";
import { requestContact, VARIANTS, type Variant } from "./content";
import { clamp, Dialog, LoopVideo, tiltHandlers, useFrameWhileVisible, type DialogHandle } from "./shared";

const N = VARIANTS.length;

/**
 * Floating cards on a shallow 3D arc. A single continuous value (`cur`) eases
 * toward the selected index every frame, and each card's translate / rotate /
 * scale / depth is derived from its signed distance to it — so a change moves
 * the whole arrangement along the arc in one flowing motion. Dragging feeds the
 * same value directly, so swipes track the finger.
 */
export function VariantsSection() {
  const { reduced, cue } = useExperience();
  const [index, setIndex] = useState(0);
  const target = useRef(0);
  const cur = useRef(0);
  const drag = useRef<{ id: number; x0: number; y0: number; dx: number; locked: boolean | null } | null>(null);
  const moved = useRef(false);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const stageRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [spec, setSpec] = useState<Variant | null>(null);
  const dialog = useRef<DialogHandle>(null);

  const go = useCallback(
    (i: number) => {
      const n = clamp(i, 0, N - 1);
      if (n === target.current) return;
      target.current = n;
      setIndex(n);
      cue("swish");
    },
    [cue],
  );

  const ref = useFrameWhileVisible<HTMLElement>((rect, dt) => {
    const vh = window.innerHeight;
    const on = rect.top < vh && rect.bottom > 0;
    if (on !== visible) setVisible(on);
    const stage = stageRef.current;
    if (!stage) return;
    const w = stage.clientWidth;
    const mobile = w < 640;
    const dragOff = drag.current?.locked ? -drag.current.dx / ((mobile ? 0.7 : 0.34) * w) : 0;
    const goal = clamp(target.current + dragOff, -0.35, N - 0.65);
    if (reduced || dt === 0) cur.current = goal;
    else cur.current += (goal - cur.current) * (1 - Math.exp(-dt * 7));
    if (Math.abs(goal - cur.current) < 0.0004) cur.current = goal;

    const c = cur.current;
    const spread = mobile ? w * 0.62 : Math.min(w * 0.27, 400);
    cardsRef.current.forEach((el, i) => {
      if (!el) return;
      const d = i - c;
      const ad = Math.abs(d);
      const x = Math.sign(d) * (1 - Math.exp(-ad * 1.05)) * spread * 1.55;
      const y = Math.min(ad, 2.5) ** 1.5 * (mobile ? 30 : 72);
      const z = -Math.min(ad, 3) * (mobile ? 140 : 240);
      const ry = clamp(-d, -1.6, 1.6) * 24;
      const rz = clamp(d, -2, 2) * 3.2;
      const s = 1 - Math.min(ad, 2.5) * 0.11;
      el.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${s.toFixed(4)})`;
      el.style.setProperty("--dim", Math.min(1, ad * 0.75).toFixed(3));
      el.style.opacity = String(clamp(2.6 - ad).toFixed(3));
      el.style.zIndex = String(20 - Math.round(ad * 4));
    });
  });

  const v = VARIANTS[index]!;

  const openSpecs = () => {
    setSpec(v);
    cue("open");
    requestAnimationFrame(() => dialog.current?.open());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(target.current - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(target.current + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(N - 1);
    }
  };

  // swipe / drag: horizontal intent locks the gesture, vertical lets the page scroll
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, locked: null };
    moved.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.locked === null && Math.hypot(dx, dy) > 8) {
      g.locked = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (g.locked) stageRef.current?.setPointerCapture(e.pointerId);
      else drag.current = null;
    }
    if (g.locked) {
      g.dx = dx;
      moved.current = true;
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    if (!g.locked) return;
    const w = stageRef.current?.clientWidth ?? 800;
    const th = Math.min(90, w * 0.12);
    // settle where the drag left the arrangement, nudged by direction
    if (g.dx < -th) go(target.current + Math.max(1, Math.round(-g.dx / (w * 0.45))));
    else if (g.dx > th) go(target.current - Math.max(1, Math.round(g.dx / (w * 0.45))));
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

      {/* carousel container: focusable so Arrow / Home / End work once a visitor is inside it */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <section
        ref={stageRef}
        className="var-stage"
        aria-roledescription="carousel"
        aria-label="F-16 variants — use the left and right arrow keys to browse"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {VARIANTS.map((item, i) => {
          const isActive = i === index;
          return (
            <div
              key={item.id}
              ref={(el) => {
                cardsRef.current[i] = el;
              }}
              className={`var-card ${isActive ? "is-active" : ""}`}
              aria-hidden={!isActive}
            >
              <button
                type="button"
                className="var-card-btn"
                tabIndex={isActive ? 0 : -1}
                aria-label={`${i + 1} of ${N}: ${item.name}${isActive ? " — explore specifications" : ""}`}
                onClick={() => {
                  if (moved.current) return;
                  if (isActive) openSpecs();
                  else go(i);
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") cue("hover", (e.clientX / window.innerWidth) * 2 - 1);
                }}
              >
                <span className="fx-tilt" {...tiltHandlers(!reduced && isActive)}>
                  <LoopVideo
                    src={item.video}
                    poster={item.poster}
                    alt=""
                    play={visible && Math.abs(i - index) <= 1}
                    reduced={reduced}
                    className="var-media"
                  />
                  <span className="var-card-shade" aria-hidden="true" />
                  <span className="fx-edge" aria-hidden="true" />
                  <span className="var-card-meta" aria-hidden="true">
                    <span className="var-card-name">{item.name}</span>
                    <span className="var-card-tag">{item.tag}</span>
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </section>

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
