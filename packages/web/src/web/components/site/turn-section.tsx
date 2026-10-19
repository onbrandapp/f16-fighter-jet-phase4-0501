import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useExperience } from "../experience/experience-context";
import { flight } from "../jet/flight-store";
import { useFrameWhileVisible } from "./shared";
import {
  bankDeg,
  bleed,
  N_LIMIT,
  nForRate,
  nInst,
  nLift,
  nSus,
  radiusFt,
  rate,
  RATE_MAX_AXIS,
  RATE_PEAK,
  RATE_SUS_PEAK,
  sample,
  V_CORNER,
  V_MAX,
  V_MIN,
  V_SUS_BEST,
  zoneOf,
} from "./turn-model";

/* chart geometry (SVG user units) */
const CW = 560;
const CH = 330;
const PAD = { l: 40, r: 14, t: 16, b: 34 };
const PW = CW - PAD.l - PAD.r;
const PH = CH - PAD.t - PAD.b;
const xOf = (v: number) => PAD.l + ((v - V_MIN) / (V_MAX - V_MIN)) * PW;
const yOf = (r: number) => PAD.t + (1 - Math.min(r, RATE_MAX_AXIS + 2) / RATE_MAX_AXIS) * PH;
const vOfX = (x: number) => V_MIN + ((x - PAD.l) / PW) * (V_MAX - V_MIN);
const rOfY = (y: number) => (1 - (y - PAD.t) / PH) * RATE_MAX_AXIS;

const path = (pts: [number, number][]) =>
  pts.map(([v, r], i) => `${i ? "L" : "M"}${xOf(v).toFixed(1)},${yOf(r).toFixed(1)}`).join("");

const CORNER = Math.round(V_CORNER);

const PRESETS = [
  { id: "corner", label: "Max rate", sub: `${CORNER} kt · 9 g`, v: CORNER, n: N_LIMIT },
  { id: "sus", label: "Sustained", sub: `${Math.round(V_SUS_BEST)} kt · ${nSus(V_SUS_BEST).toFixed(1)} g`, v: Math.round(V_SUS_BEST), n: +nSus(V_SUS_BEST).toFixed(1) },
  { id: "slow", label: "Slow fight", sub: "240 kt · lift-limited", v: 240, n: +nInst(240).toFixed(1) },
  { id: "fast", label: "Fast", sub: "560 kt · 9 g", v: 560, n: N_LIMIT },
] as const;

const fmtFt = (ft: number) => (Number.isFinite(ft) ? Math.round(ft / 10) * 10 : Infinity);

/**
 * Turn-performance explainer. Two controls (airspeed, load factor) drive a
 * simplified F-16 energy–manoeuvrability chart, live readouts, and the
 * persistent 3D jet, which banks into the selected turn with its turn circle
 * and lift-vector triangle drawn around it (see turn-viz.ts).
 */
export function TurnSection() {
  const { reduced, cue } = useExperience();
  const [v, setV] = useState(flight.turn.v);
  const [n, setN] = useState(flight.turn.n);
  const stageRef = useRef<HTMLDivElement>(null);
  // the jet's on-stage tags follow the aircraft: shown only while the turn
  // station owns it (no WebGL: always shown)
  const ref = useFrameWhileVisible<HTMLElement>((rect) => {
    const vh = window.innerHeight;
    const live = rect.top < vh && rect.bottom > 0;
    flight.turn.live = live;
    const on = !flight.scene || flight.hud.station === "turn";
    const el = stageRef.current;
    if (el && (el.dataset.on === "1") !== on) el.dataset.on = on ? "1" : "0";
  });
  const ids = useId();
  const chartRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const nMax = nInst(v);
  const nOk = Math.min(n, nMax);

  useEffect(() => {
    flight.turn.v = v;
    flight.turn.n = nOk;
  }, [v, nOk]);

  const curves = useMemo(() => {
    const liftOut = sample((x) => rate(x, nLift(x)), V_CORNER, 470, 2);
    const g9In = sample((x) => rate(x, N_LIMIT), 230, V_CORNER, 5);
    const sus = sample((x) => rate(x, nSus(x)), V_MIN, V_MAX, 4);
    const inst = sample((x) => rate(x, nInst(x)), V_MIN, V_MAX, 2);
    // band between sustained and instantaneous: turning here costs energy
    const band = `${path(inst)}L${xOf(V_MAX).toFixed(1)},${yOf(rate(V_MAX, nSus(V_MAX))).toFixed(1)}${path(
      [...sus].reverse(),
    ).replace(/^M/, "L")}Z`;
    const guides = [3, 5, 7].map((g) => ({ g, d: path(sample((x) => rate(x, g), V_MIN, V_MAX, 10)) }));
    return {
      liftOut: path(liftOut),
      g9In: path(g9In),
      sus: path(sus),
      inst: path(inst),
      band,
      guides,
    };
  }, []);

  const r = rate(v, nOk);
  const ft = radiusFt(v, nOk);
  const bank = bankDeg(nOk);
  const ps = bleed(v, nOk);
  const zone = zoneOf(v);
  const energy = Math.abs(ps) < 0.6 ? "Holding energy" : ps < 0 ? "Bleeding speed" : "Gaining speed";
  const energyTone = Math.abs(ps) < 0.6 ? "ok" : ps < 0 ? "warn" : "ok";
  const zoneLabel =
    zone === "corner" ? "At corner speed" : zone === "lift" ? "Lift-limited · below corner" : "G-limited · above corner";
  const pctV = ((v - V_MIN) / (V_MAX - V_MIN)) * 100;
  const pctLim = ((nMax - 1) / (N_LIMIT - 1)) * 100;

  const setFromChart = (e: RPointerEvent<SVGSVGElement>) => {
    const svg = chartRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * CW;
    const y = ((e.clientY - box.top) / box.height) * CH;
    const nv = Math.round(Math.min(V_MAX, Math.max(V_MIN, vOfX(x))));
    const nr = Math.max(0, rOfY(y));
    const nn = Math.min(nInst(nv), Math.max(1, nForRate(nv, nr)));
    setV(nv);
    setN(Math.round(nn * 10) / 10);
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setV(p.v);
    setN(p.n);
    cue("hover");
  };

  return (
    <section ref={ref} id="turn" className={`turn ${reduced ? "is-reduced" : ""}`} aria-labelledby="turn-title">
      <div className="turn-grid">
        <div className="turn-head">
          <p className="fx-eyebrow">
            <span className="fx-num">03</span> Turn performance
          </p>
          <h2 id="turn-title" className="fx-display">
            Speed is life. <em>Corner is everything.</em>
          </h2>
          <p className="fx-lede turn-lede">
            A fighter turns hardest at one speed. Slower, the wing runs out of lift; faster, the airframe runs into its
            9&nbsp;g limit. Where those two walls meet — about {CORNER} knots in this model — the F-16 reaches its peak
            turn rate of roughly {Math.round(RATE_PEAK)}°/s. The catch: it can&apos;t hold it. Engine thrust only
            sustains around {Math.round(RATE_SUS_PEAK)}°/s, so every degree above that line is paid for in airspeed.
          </p>
        </div>

        <div ref={stageRef} className="turn-stage" data-flight="turn" data-on="0" aria-hidden="true">
          <span className="turn-stage-tag">
            <span>BANK</span> {Math.round(bank)}°
          </span>
          <span className="turn-stage-tag turn-stage-tag--r">
            <span>R</span> {Number.isFinite(ft) ? `${fmtFt(ft).toLocaleString("en-US")} FT` : "STRAIGHT"}
          </span>
        </div>

        <div className="turn-panel">
          <dl className="turn-read" aria-live="polite">
            <div>
              <dt>Load</dt>
              <dd>
                {nOk.toFixed(1)}
                <small>g</small>
              </dd>
            </div>
            <div>
              <dt>Bank</dt>
              <dd>
                {Math.round(bank)}
                <small>°</small>
              </dd>
            </div>
            <div>
              <dt>Turn rate</dt>
              <dd>
                {r.toFixed(1)}
                <small>°/s</small>
              </dd>
            </div>
            <div>
              <dt>Radius</dt>
              <dd>
                {Number.isFinite(ft) ? fmtFt(ft).toLocaleString("en-US") : "—"}
                <small>ft</small>
              </dd>
            </div>
            <div className={`turn-read-energy is-${energyTone}`}>
              <dt>Energy</dt>
              <dd>
                {ps > 0 ? "+" : ps < 0 ? "−" : ""}
                {Math.abs(ps).toFixed(1)}
                <small>kt/s</small>
              </dd>
              <span>{energy}</span>
            </div>
          </dl>

          <figure className="turn-chart">
            <figcaption className="turn-chart-cap">
              <span>Turn rate vs airspeed</span>
              <span className={`turn-zone is-${zone}`}>{zoneLabel}</span>
            </figcaption>
            <svg
              ref={chartRef}
              viewBox={`0 0 ${CW} ${CH}`}
              aria-hidden="true"
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                setFromChart(e);
              }}
              onPointerMove={(e) => {
                if (dragging.current) setFromChart(e);
              }}
              onPointerUp={() => {
                dragging.current = false;
              }}
              onPointerCancel={() => {
                dragging.current = false;
              }}
            >
              <defs>
                <clipPath id={`${ids}-clip`}>
                  <rect x={PAD.l} y={PAD.t} width={PW} height={PH} />
                </clipPath>
              </defs>
              {/* grid */}
              <g className="tc-grid">
                {[0, 8, 16, 24, 32].map((y) => (
                  <g key={y}>
                    <line x1={PAD.l} x2={CW - PAD.r} y1={yOf(y)} y2={yOf(y)} />
                    <text x={PAD.l - 8} y={yOf(y) + 3} textAnchor="end">
                      {y}
                    </text>
                  </g>
                ))}
                {[200, 300, 400, 500, 600].map((x) => (
                  <g key={x}>
                    <line x1={xOf(x)} x2={xOf(x)} y1={PAD.t} y2={CH - PAD.b} />
                    <text x={xOf(x)} y={CH - PAD.b + 16} textAnchor="middle">
                      {x}
                    </text>
                  </g>
                ))}
                <text className="tc-axis" x={CW - PAD.r} y={CH - 4} textAnchor="end">
                  KCAS
                </text>
                <text className="tc-axis" x={PAD.l - 8} y={PAD.t - 4} textAnchor="end">
                  °/S
                </text>
              </g>
              <g clipPath={`url(#${ids}-clip)`}>
                {curves.guides.map((gd) => (
                  <path key={gd.g} className="tc-guide" d={gd.d} />
                ))}
                <path className="tc-band" d={curves.band} />
                <path className="tc-ghost" d={curves.liftOut} />
                <path className="tc-ghost" d={curves.g9In} />
                <path className="tc-sus" d={curves.sus} />
                <path className="tc-inst" d={curves.inst} />
                {/* corner */}
                <line className="tc-corner" x1={xOf(V_CORNER)} x2={xOf(V_CORNER)} y1={PAD.t} y2={CH - PAD.b} />
                {/* current point */}
                <line className="tc-cross" x1={xOf(v)} x2={xOf(v)} y1={yOf(r)} y2={CH - PAD.b} />
                <line className="tc-cross" x1={PAD.l} x2={xOf(v)} y1={yOf(r)} y2={yOf(r)} />
              </g>
              {curves.guides.map((gd) => (
                <text key={gd.g} className="tc-guide-l" x={xOf(V_MAX) - 4} y={yOf(rate(V_MAX, gd.g)) - 4} textAnchor="end">
                  {gd.g} g
                </text>
              ))}
              <text className="tc-label tc-label--amber" x={xOf(V_CORNER) + 6} y={PAD.t + 10}>
                CORNER {CORNER} KT
              </text>
              <text className="tc-label tc-label--amber" x={xOf(480)} y={yOf(rate(480, 9)) - 14} textAnchor="middle">
                9 G LIMIT
              </text>
              <text className="tc-label tc-label--amber" x={xOf(205)} y={yOf(rate(205, nLift(205))) - 10} textAnchor="end">
                LIFT LIMIT
              </text>
              <text className="tc-label" x={xOf(600)} y={yOf(rate(600, nSus(600))) + 16} textAnchor="middle">
                SUSTAINED
              </text>
              <circle className="tc-dot-halo" cx={xOf(v)} cy={yOf(r)} r={11} />
              <circle className="tc-dot" cx={xOf(v)} cy={yOf(r)} r={4.5} />
            </svg>
            <p className="sr-only">
              Chart of turn rate against airspeed. Current point {v} knots at {r.toFixed(1)} degrees per second; corner
              speed {CORNER} knots, where the lift limit meets the 9 g limit.
            </p>
            <p className="turn-legend">
              <span className="lg-inst">Instantaneous</span>
              <span className="lg-sus">Sustained</span>
              <span className="lg-band">Bleeds energy</span>
              <span className="lg-hint">Drag on the chart</span>
            </p>
          </figure>

          <div className="turn-controls">
            <label className="turn-range" style={{ ["--p" as string]: `${pctV}%` }}>
              <span className="turn-range-k">
                Airspeed <b>{v} kt</b>
              </span>
              <input
                type="range"
                min={V_MIN}
                max={V_MAX}
                step={5}
                value={v}
                aria-label="Airspeed"
                onChange={(e) => setV(+e.target.value)}
                aria-valuetext={`${v} knots`}
              />
            </label>
            <label
              className="turn-range turn-range--g"
              style={{ ["--p" as string]: `${((nOk - 1) / (N_LIMIT - 1)) * 100}%`, ["--lim" as string]: `${pctLim}%` }}
            >
              <span className="turn-range-k">
                Pull <b>{nOk.toFixed(1)} g</b>
                {n > nMax + 0.05 && <i> · wing limit {nMax.toFixed(1)} g</i>}
              </span>
              <input
                type="range"
                min={1}
                max={N_LIMIT}
                step={0.1}
                value={nOk}
                aria-label="Load factor"
                onChange={(e) => setN(Math.min(nMax, +e.target.value))}
                aria-valuetext={`${nOk.toFixed(1)} g`}
              />
            </label>
            <fieldset className="turn-presets">
              <legend className="sr-only">Turn presets</legend>
              {PRESETS.map((p) => {
                const on = Math.abs(v - p.v) < 3 && Math.abs(nOk - Math.min(p.n, nInst(p.v))) < 0.15;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`turn-preset ${on ? "is-on" : ""}`}
                    aria-pressed={on}
                    onClick={() => applyPreset(p)}
                  >
                    <span>{p.label}</span>
                    <small>{p.sub}</small>
                  </button>
                );
              })}
            </fieldset>
          </div>
          <p className="turn-note">
            Illustrative sea-level model from public figures and the level-turn equations — not flight-manual data.
          </p>
        </div>
      </div>
    </section>
  );
}
