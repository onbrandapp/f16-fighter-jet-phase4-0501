# F-16 Hero — Design

Single full-screen cinematic hero (web only). A real-time three.js scene of the supplied F-16 GLB flying level through a dark, layered cloud field. Five scroll-gesture camera stages tell the aircraft's story.

## Mood
Night flight inside weather. Distant environment almost black; jet and nearby clouds softly lit by a cool, diffused key from upper-left plus a thin rim from behind. Restrained highlights — never washed out.

## Colors
- `--ink` #050608 — page / far fog
- `--haze` #0d1015 — horizon haze
- `--cloud-shadow` #07090c, `--cloud-lit` #8c95a3
- `--text` #e8ebf0, `--text-dim` rgba(232,235,240,0.56), `--hairline` rgba(255,255,255,0.12)
- Accent: `--signal` #c9a86a (warm brass, used sparingly: progress fill, button hover line)

## Light rhythm (phase 5)
Each section owns its light (`jet/light-rig.ts`): sky gradient + hemi/key/rim/fill/bounce + exposure, eased (~0.5 s) toward the station's palette; reduced motion snaps. Sky palette hexes are display values.
- Hero / contact: storm (original night values) — dark
- Performance: cool clear high altitude — light; Supersonic card blends to golden hour (low warm sun, amber sky)
- Turn: cold clear blue
- Feature video: storm footage kept as the one dark beat
- History: per milestone row, terrain plate behind the list (`jet/hist-backdrop.ts`, `/media/hist_0..6.jpg`) crossfades as the jet passes: 1974 lakebed midday, 1979 snowy Wasatch blue morning, 1981 violet dusk river, 1991 desert dawn, 1994–99 overcast Balkans, 2001– arctic ice, Today blue-hour coast. Left/list side scrimmed (all of it on portrait) + row text-shadow.
- Variants: AB blue winter morning, CD desert-tan dawn, EF amber sunset, V cold silver.
Card posters: `p5_supersonic_gold.jpg`, `v1_ab_lit`…`v4_viper_lit.jpg` (originals kept).

## Typography
- Display: **Instrument Serif** (regular + italic) — headline and stage titles, tight tracking, large.
- UI/body: **Manrope** 300–600 — nav, labels (uppercase, 0.28em tracking, 10–11px), body 14–15px.

## Layout
- Nav: thin top bar, wordmark left, 3 quiet links center/right, sound + motion toggles right.
- Hero copy bottom-left in stage 0; stage captions placed opposite the aircraft per stop.
- Progress: 5 hairline segments, right edge vertical on desktop, bottom center horizontal on mobile.
- Generous negative space; the aircraft is the composition.

## Motion
- Staged camera: one gesture = one 2.6s curved move (smootherstep, arc-length paths). Holds between.
- Text fades/rises 600ms after the camera settles; fades out at move start.
- Reduced motion: short crossfade cuts, no vibration, slower clouds.

## Audio
Ambient bed (drone + wind) + engine hum loop + whoosh on each move. Off by default; explicit toggle.

## Persistent jet (phase 3)
- One fixed WebGL scene (`.sky-layer`, z 0) sits behind the whole page; sections are transparent so the same GLB carries every chapter. `flight-director.ts` blends per-section poses from `flight-store.ts` (hero stage, perf index, history year, variant yaw/pitch/loadout).
- Performance: each capability is a pose plus a procedural effect (`jet-fx.ts`): wingtip vortices, store stations, EW rings, radar fan, shock cone.
- History: top-down plan view, nose down-screen, plume on; the rail tracks the active year.
- Variants: orbitable on a deck ring (drag / arrow keys); CFTs, spine and loadouts are separate procedural meshes. GLB geometry and materials are never altered.
- Contact and footer are opaque ink; clouds fade out below the hero.

## Turn explainer (phase 4)
- Section 03 `#turn`: transparent, sticky stage column (data-flight="turn") on the right; copy, readouts, chart, controls on the left. Mobile: head → stage (≤320px) → readouts → sliders/presets → chart.
- Model in `site/turn-model.ts` — illustrative sea-level E-M: lift limit (V/Vs)², 9 g structural cap, corner 350 kt, sustained curve peaks ~7 g at 460 kt. Always labelled "not flight-manual data".
- Chart colours: amber = instantaneous/limits/corner, green = sustained, amber band = energy bleed. Readouts in HUD mono; energy turns amber when bleeding.
- 3D: jet banks to acos(1/n); world-space ring (compressed radius 6+20·(ft/4000)^0.8), dashed radius + centre cross, amber lift vector with green 1 g / horizontal components. Wingtip vortices above ~4.5 g.

## HUD language
- Lines: green `--hud` #8ff0a8 (data), amber `--hud-amber` #e6b766 (propulsion / warnings), dimmed with `--hud-dim` / `--hud-faint`. 1px only, no fills beyond 6% tints.
- Type: **JetBrains Mono** 9.5–11px, uppercase, 0.1–0.22em tracking.
- Tapes: ALT = page depth, M = scroll speed, G = section turn rate. Fixed, pointer-events none.
- Callouts: diamond pip on a projected 3D anchor → angled leader → label (code + description). Same-side labels de-stack (36px gap); labels flip sides at viewport edges. Max 4 at once.
- Reticle cursor: locks brackets onto clickables; hidden on `pointer: coarse` and reduced motion; native cursor in inputs and dialogs.
- Boot loader: dial + BIT checklist driven by real asset load progress.
