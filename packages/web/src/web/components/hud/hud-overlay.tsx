import "./hud.css";
import { useEffect, useRef } from "react";
import { useExperience } from "../experience/experience-context";
import { getLenis } from "../experience/smooth-scroll";
import { flight } from "../jet/flight-store";

const STATION_LABEL: Record<string, string> = {
  hero: "",
  perf: "02 · Performance",
  hist: "03 · History",
  var: "04 · Variants",
  off: "",
};

/**
 * Cockpit symbology over the page, used sparingly: thin tapes at the edges
 * that read the page as a flight. Altitude is page depth, Mach is scroll
 * speed, g is how hard the camera is turning around the jet between stations.
 * Hidden over the hero (which has its own composition) and the contact form.
 */
export function HudOverlay() {
  const { reduced } = useExperience();
  const rootRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLElement>(null);
  const machRef = useRef<HTMLElement>(null);
  const gRef = useRef<HTMLElement>(null);
  const hdgRef = useRef<HTMLElement>(null);
  const stnRef = useRef<HTMLElement>(null);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    let last = performance.now();
    let lastY = window.scrollY;
    let mach = 0.62;
    let shown = false;
    let lastText = "";
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
      last = now;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const max = Math.max(1, document.documentElement.scrollHeight - vh);
      const lv = getLenis()?.velocity;
      const v = Math.abs(lv !== undefined && lv !== 0 ? lv * 60 : (y - lastY) / dt);
      lastY = y;
      const goal = 0.62 + Math.min(1.43, v / 2600);
      mach += (goal - mach) * Math.min(1, dt * (goal > mach ? 4 : 1.6));
      const alt = Math.round((42000 * (1 - y / max)) / 10) * 10;
      const contact = document.getElementById("contact");
      const ct = contact ? contact.getBoundingClientRect().top : Infinity;
      const on = y > vh * 0.55 && ct > vh * 0.55;
      if (on !== shown) {
        shown = on;
        root.classList.toggle("is-on", on);
      }
      if (!on) return;
      root.style.setProperty("--alt", String(y / max));
      root.style.setProperty("--hdg", (flight.hud.heading / 360).toFixed(4));
      const text = `${alt}|${mach.toFixed(2)}|${flight.hud.g.toFixed(1)}|${Math.round(flight.hud.heading)}|${flight.hud.station}`;
      if (text === lastText) return;
      lastText = text;
      if (altRef.current) altRef.current.textContent = alt.toLocaleString("en-US");
      if (machRef.current) machRef.current.textContent = mach.toFixed(2);
      if (gRef.current) gRef.current.textContent = flight.hud.g.toFixed(1);
      if (hdgRef.current) hdgRef.current.textContent = String(Math.round(flight.hud.heading) % 360).padStart(3, "0");
      if (stnRef.current) stnRef.current.textContent = STATION_LABEL[flight.hud.station] ?? "";
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={rootRef} className="hud" aria-hidden="true">
      <div className="hud-hdg">
        <span className="hud-hdg-tape" />
        <span className="hud-hdg-box">
          <b ref={hdgRef}>000</b>
        </span>
      </div>
      <div className="hud-alt">
        <span className="hud-tape" />
        <span className="hud-box">
          <i>ALT</i>
          <b ref={altRef}>42,000</b>
        </span>
      </div>
      <div className="hud-air">
        <span className="hud-tape" />
        <span className="hud-box">
          <i>M</i>
          <b ref={machRef}>0.62</b>
        </span>
        <span className="hud-g">
          <i>G</i>
          <b ref={gRef}>1.0</b>
        </span>
      </div>
      <p className="hud-stn">
        <span className="hud-stn-dot" />
        <span ref={stnRef} />
      </p>
    </div>
  );
}

const LOCKABLE = 'a[href], button:not(:disabled), [role="button"], summary, select, label[for], .fx-choice-row label';

/**
 * Reticle cursor. Free, it is a small gunsight; over anything clickable it
 * "locks": brackets close around the target and a LOCK tag appears. Fine
 * pointers only; never under reduced motion, and the native cursor comes
 * back inside dialogs and text fields.
 */
export function Reticle() {
  const { reduced } = useExperience();
  const sightRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    if (reduced || !fine.matches) return;
    const sight = sightRef.current;
    const box = boxRef.current;
    if (!sight || !box) return;
    const html = document.documentElement;
    html.classList.add("has-reticle");
    let x = -100;
    let y = -100;
    let lock: Element | null = null;
    let inside = false;
    let free = false; // over a dialog / text field: native cursor
    const b = { x: -100, y: -100, w: 30, h: 30, a: 0 };
    let raf = 0;
    let last = performance.now();

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      inside = true;
      const t = e.target instanceof Element ? e.target : null;
      const nowFree = !!t?.closest("dialog, input, textarea");
      if (nowFree !== free) {
        free = nowFree;
        html.classList.toggle("reticle-free", free);
      }
      const next = free ? null : (t?.closest(LOCKABLE) ?? null);
      if (next !== lock) {
        lock = next;
        sight.classList.toggle("is-locked", !!lock);
        box.classList.toggle("is-locked", !!lock);
      }
    };
    const onLeave = () => {
      inside = false;
    };
    const onDown = () => sight.classList.add("is-down");
    const onUp = () => sight.classList.remove("is-down");

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const show = inside && !free;
      sight.style.opacity = show ? "1" : "0";
      sight.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      let tx = x - 15;
      let ty = y - 15;
      let tw = 30;
      let th = 30;
      let ta = 0;
      if (lock && lock.isConnected && show) {
        const r = lock.getBoundingClientRect();
        const pad = 7;
        tx = r.left - pad;
        ty = r.top - pad;
        tw = r.width + pad * 2;
        th = r.height + pad * 2;
        ta = 1;
      }
      const k = 1 - Math.exp(-dt * (ta ? 22 : 30));
      b.x += (tx - b.x) * k;
      b.y += (ty - b.y) * k;
      b.w += (tw - b.w) * k;
      b.h += (th - b.h) * k;
      b.a += (ta - b.a) * (1 - Math.exp(-dt * 16));
      box.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0)`;
      box.style.width = `${b.w.toFixed(1)}px`;
      box.style.height = `${b.h.toFixed(1)}px`;
      box.style.opacity = b.a.toFixed(3);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      html.classList.remove("has-reticle", "reticle-free");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      sight.style.opacity = "0";
      box.style.opacity = "0";
    };
  }, [reduced]);

  return (
    <>
      <div ref={boxRef} className="reticle-box" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <span className="reticle-tag">LOCK</span>
      </div>
      <div ref={sightRef} className="reticle" aria-hidden="true">
        <span className="reticle-ring" />
        <span className="reticle-dot" />
      </div>
    </>
  );
}
