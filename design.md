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
