import { useEffect, useRef } from "react";
import type { AnchorId } from "../jet/jet-fx";
import { flight } from "../jet/flight-store";

export type Callout = {
  anchor: AnchorId;
  /** short mono code, e.g. STA 9 */
  k: string;
  /** what it is */
  v: string;
  /** which way the label leaves the point; auto = away from the box centre */
  side?: "l" | "r";
  tone?: "green" | "amber";
};

/**
 * HUD callouts pinned to points on the live 3D airframe. Positions come from
 * the shared scene's projection every frame, so labels track the jet through
 * camera moves. Absolutely positioned inside their parent (which must be
 * positioned); pointer-events none.
 */
export function HudCallouts({ items, show, group }: { items: Callout[]; show: boolean; group: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const elsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !show) return;
    let raf = 0;
    const pt = { x: 0, y: 0 };
    const pos = items.map(() => ({ x: 0, y: 0, ok: false, side: "r" as "l" | "r", ly: 0 }));
    const GAP = 36;
    const widths: number[] = [];
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const scene = flight.scene;
      if (!scene) return;
      const r = root.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const lead = Math.max(36, Math.min(72, window.innerWidth * 0.05));
      items.forEach((it, i) => {
        const q = pos[i]!;
        const p = scene.project(it.anchor, pt);
        q.ok = !!p;
        if (!p) return;
        q.x = p.x - r.left;
        q.y = p.y - r.top;
        q.ly = q.y;
        let side: "l" | "r" = it.side ?? (p.x >= cx ? "r" : "l");
        // flip a label that would run off the viewport edge (narrow screens)
        if (widths[i] === undefined) {
          const lab = elsRef.current[i]?.querySelector<HTMLElement>(".hud-callout-label");
          if (lab && lab.offsetWidth > 0) widths[i] = lab.offsetWidth;
        }
        const w = (widths[i] ?? 90) + lead + 14 + 12;
        if (side === "l" && p.x - w < 0 && p.x + w <= window.innerWidth) side = "r";
        else if (side === "r" && p.x + w > window.innerWidth && p.x - w >= 0) side = "l";
        q.side = side;
      });
      // keep labels on the same side from stacking: push them apart vertically
      for (const side of ["l", "r"] as const) {
        const col = pos.filter((q) => q.ok && q.side === side).sort((a, b) => a.y - b.y);
        for (let k = 1; k < col.length; k++) {
          const prev = col[k - 1]!;
          if (col[k]!.ly < prev.ly + GAP) col[k]!.ly = prev.ly + GAP;
        }
        // recentre the stack on its anchors so it doesn't only grow downward
        if (col.length > 1) {
          const shift = col.reduce((s, q) => s + (q.ly - q.y), 0) / col.length;
          for (const q of col) q.ly -= shift;
        }
      }
      items.forEach((_, i) => {
        const el = elsRef.current[i];
        const q = pos[i]!;
        if (!el) return;
        if (!q.ok) {
          el.style.opacity = "0";
          return;
        }
        el.style.opacity = "";
        if (el.dataset.side !== q.side) el.dataset.side = q.side;
        const dy = q.ly - q.y;
        el.style.transform = `translate3d(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px, 0)`;
        el.style.setProperty("--dy", `${dy.toFixed(1)}px`);
        el.style.setProperty("--lw", `${Math.hypot(lead, dy).toFixed(1)}px`);
        el.style.setProperty("--la", `${((Math.atan2(dy, lead) * 180) / Math.PI).toFixed(2)}deg`);
        el.style.setProperty("--lx", `${lead.toFixed(1)}px`);
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [items, show]);

  return (
    <div ref={rootRef} className={`hud-callouts ${show ? "is-in" : ""}`} aria-hidden="true" data-group={group}>
      {items.map((it, i) => (
        <div
          key={`${group}-${it.anchor}-${it.k}`}
          ref={(el) => {
            elsRef.current[i] = el;
          }}
          className={`hud-callout tone-${it.tone ?? "green"}`}
          style={{ "--i": i } as React.CSSProperties}
        >
          <span className="hud-callout-pip" />
          <span className="hud-callout-lead" />
          <span className="hud-callout-label">
            <b>{it.k}</b>
            <span>{it.v}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
