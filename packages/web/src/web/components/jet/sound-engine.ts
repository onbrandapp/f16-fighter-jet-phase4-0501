// Web Audio soundscape. Nothing is created or played until the visitor
// explicitly enables sound.
//
//   beds bus ─┬─ ambient pad (crossfaded into itself for a seamless loop)
//             ├─ turbine hum (always on, low)
//             └─ afterburner layer (gain / brightness / pitch follow scroll speed,
//                plus the footer fly-past, panned with the jet)
//   fx bus   ─── section-handoff air sweeps, sonic boom, footer fly-by sting,
//                whoosh per hero camera move, UI cues
//   beds + fx → master → soft low-pass → analyser → speakers
//
// The boom ducks the beds for a beat so it lands in a hole.

const AMBIENT_URL = "/audio/ambient.mp3";
const WHOOSH_URL = "/audio/whoosh.mp3";
const SX_URLS = {
  drone: "/audio/sx-drone.mp3",
  burner: "/audio/sx-burner.mp3",
  sweepA: "/audio/sx-sweep_a.mp3",
  sweepB: "/audio/sx-sweep_b.mp3",
  boom: "/audio/sx-boom.mp3",
  flyby: "/audio/sx-flyby.mp3",
} as const;
type SxId = keyof typeof SX_URLS;
const UI_URLS = {
  hover: "/audio/ui-hover.mp3",
  swish: "/audio/ui-swish.mp3",
  open: "/audio/ui-open.mp3",
} as const;
export type UiCue = keyof typeof UI_URLS;
// per-cue level and minimum spacing (ms) so cues never pile up
const UI_CFG: Record<UiCue, { gain: number; gap: number }> = {
  hover: { gain: 0.22, gap: 260 },
  swish: { gain: 0.3, gap: 420 },
  open: { gain: 0.34, gap: 600 },
};

const MASTER = 0.55;
const AMBIENT_GAIN = 0.34;
const DRONE_GAIN = 0.5;
const BURNER_IDLE = 0.035;
const BURNER_MAX = 0.62;
const WHOOSH_GAIN = 0.3;
const SWEEP_GAIN = 0.5;
const BOOM_GAIN = 0.95;
const FLYBY_GAIN = 0.7;
const XFADE = 6;
/** scroll speed (px/s) that counts as "full throttle" */
const SPEED_FULL = 2600;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private beds: GainNode | null = null;
  private fxBus: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freq: Uint8Array<ArrayBuffer> | null = null;
  private buffers: Partial<Record<"ambient" | "whoosh", AudioBuffer>> = {};
  private sx: Partial<Record<SxId, AudioBuffer>> = {};
  private uiBuffers: Partial<Record<UiCue, AudioBuffer>> = {};
  private uiLast: Partial<Record<UiCue, number>> = {};
  private uiPlaying: Partial<Record<UiCue, { src: AudioBufferSourceNode; g: GainNode }>> = {};
  private listeners = new Set<(on: boolean) => void>();
  private loading: Promise<void> | null = null;
  private ambientTimer: number | undefined;
  private loops: AudioBufferSourceNode[] = [];
  private ambientBus: GainNode | null = null;
  private burner: { src: AudioBufferSourceNode; g: GainNode; lp: BiquadFilterNode; pan: StereoPannerNode } | null = null;
  private enabled = false;
  private sweepFlip = false;
  private lastSweep = 0;
  private lastBoom = 0;
  /** smoothed throttle 0..1, for the HUD-free debug readout */
  throttle = 0;
  private footPresence = 0;
  private footPan = 0;

  get isEnabled() {
    return this.enabled;
  }

  private async ensure() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = (this.ctx = new Ctor());
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.beds = ctx.createGain();
      this.fxBus = ctx.createGain();
      this.beds.connect(this.master);
      this.fxBus.connect(this.master);
      // gentle low-pass keeps everything soft and cinematic; a light
      // compressor stops the boom from clipping on small speakers
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 9000;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;
      this.freq = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      this.master.connect(lp).connect(comp).connect(this.analyser).connect(ctx.destination);
    }
    if (!this.loading) {
      const ctx = this.ctx;
      const get = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`audio ${url} ${res.status}`);
        return ctx.decodeAudioData(await res.arrayBuffer());
      };
      // the beds must load; every other layer is optional and never blocks
      const sx = Promise.all(
        (Object.entries(SX_URLS) as [SxId, string][]).map(([k, url]) =>
          get(url)
            .then((b) => (this.sx[k] = b))
            .catch((e: unknown) => console.warn(e)),
        ),
      );
      this.loading = Promise.all([get(AMBIENT_URL), get(WHOOSH_URL), sx]).then(([a, w]) => {
        this.buffers = { ambient: a, whoosh: w };
      });
      for (const [k, url] of Object.entries(UI_URLS) as [UiCue, string][]) {
        get(url)
          .then((b) => (this.uiBuffers[k] = b))
          .catch((e: unknown) => console.warn(e));
      }
    }
    await this.loading;
  }

  private get live() {
    return this.enabled && this.ctx !== null && this.ctx.state === "running";
  }

  /** Subscribe to on/off changes (used by every sound toggle on the page). */
  subscribe(fn: (on: boolean) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const fn of this.listeners) fn(this.enabled);
  }

  /** Toggle from a user gesture. Resolves to the new state. */
  async toggle(): Promise<boolean> {
    if (this.enabled) {
      this.disable();
      return false;
    }
    try {
      await this.enable();
    } catch (e) {
      console.error(e);
      this.enabled = false;
      this.emit();
    }
    return this.enabled;
  }

  /** Short interface cue; throttled and never stacked on itself. */
  ui(cue: UiCue, pan = 0) {
    if (!this.live) return;
    const buf = this.uiBuffers[cue];
    if (!buf) return;
    const nowMs = performance.now();
    const cfg = UI_CFG[cue];
    if (nowMs - (this.uiLast[cue] ?? -1e9) < cfg.gap) return;
    this.uiLast[cue] = nowMs;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const prev = this.uiPlaying[cue];
    if (prev) {
      prev.g.gain.cancelScheduledValues(now);
      prev.g.gain.setTargetAtTime(0, now, 0.03);
      try {
        prev.src.stop(now + 0.15);
      } catch {
        /* already stopped */
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = cfg.gain;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -0.6, 0.6);
    src.connect(g).connect(p).connect(this.fxBus!);
    src.start(now);
    src.onended = () => {
      if (this.uiPlaying[cue]?.src === src) delete this.uiPlaying[cue];
    };
    this.uiPlaying[cue] = { src, g };
  }

  async enable() {
    this.enabled = true;
    this.emit();
    await this.ensure();
    const ctx = this.ctx!;
    if (ctx.state === "suspended") await ctx.resume();
    if (!this.enabled) return;
    const now = ctx.currentTime;
    this.master!.gain.cancelScheduledValues(now);
    this.master!.gain.setValueAtTime(this.master!.gain.value, now);
    this.master!.gain.linearRampToValueAtTime(MASTER, now + 2.5);
    if (!this.ambientBus) this.startBeds();
  }

  disable() {
    this.enabled = false;
    this.emit();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.8);
    window.setTimeout(() => {
      if (!this.enabled && ctx.state === "running") void ctx.suspend();
    }, 900);
  }

  private loop(buf: AudioBuffer, dest: AudioNode) {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(dest);
    // start each loop at a different point so the layers never phase together
    src.start(this.ctx!.currentTime + 0.05, Math.random() * buf.duration * 0.8);
    this.loops.push(src);
    return src;
  }

  private startBeds() {
    const ctx = this.ctx!;
    const { ambient } = this.buffers;
    if (!ambient) return;
    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = AMBIENT_GAIN;
    this.ambientBus.connect(this.beds!);

    // turbine hum: always there, low and dark
    if (this.sx.drone) {
      const g = ctx.createGain();
      g.gain.value = DRONE_GAIN;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      g.connect(lp).connect(this.beds!);
      this.loop(this.sx.drone, g);
    }

    // afterburner: idles almost silent, opens up with scroll speed
    if (this.sx.burner) {
      const g = ctx.createGain();
      g.gain.value = BURNER_IDLE;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 380;
      lp.Q.value = 0.7;
      const pan = ctx.createStereoPanner();
      lp.connect(g).connect(pan).connect(this.beds!);
      const src = this.loop(this.sx.burner, lp);
      this.burner = { src, g, lp, pan };
    }

    // seamless ambient: overlapping copies with equal-power crossfades
    const schedule = (when: number) => {
      const src = ctx.createBufferSource();
      src.buffer = ambient;
      const g = ctx.createGain();
      const dur = ambient.duration;
      g.gain.setValueAtTime(0, when);
      g.gain.setValueCurveAtTime(curve(true), when, XFADE);
      g.gain.setValueAtTime(1, when + dur - XFADE);
      g.gain.setValueCurveAtTime(curve(false), when + dur - XFADE, XFADE);
      src.connect(g).connect(this.ambientBus!);
      src.start(when);
      src.stop(when + dur + 0.05);
      const next = when + dur - XFADE;
      const ms = Math.max(0, (next - ctx.currentTime - 2) * 1000);
      this.ambientTimer = window.setTimeout(() => schedule(next), ms);
    };
    schedule(ctx.currentTime + 0.05);
  }

  /**
   * Called every frame while sound is on. speed: page scroll speed in px/s.
   * The footer fly-past adds its own presence (0..1) panned with the jet (−1..1).
   */
  setScroll(speed: number, dt: number) {
    const target = clamp(Math.abs(speed) / SPEED_FULL);
    // spool up quickly, wind down slowly, like a real engine
    const k = 1 - Math.exp(-dt * (target > this.throttle ? 5 : 1.2));
    this.throttle += (target - this.throttle) * k;
    if (!this.live || !this.burner) return;
    const t = this.throttle;
    const f = this.footPresence;
    const drive = Math.max(t, f);
    const now = this.ctx!.currentTime;
    const b = this.burner;
    b.g.gain.setTargetAtTime(BURNER_IDLE + (BURNER_MAX - BURNER_IDLE) * drive * drive, now, 0.12);
    b.lp.frequency.setTargetAtTime(380 * Math.pow(10, drive * 1.15), now, 0.12);
    b.src.playbackRate.setTargetAtTime(0.9 + 0.22 * drive, now, 0.2);
    b.pan.pan.setTargetAtTime(clamp(this.footPan * f, -0.85, 0.85), now, 0.08);
  }

  /** footer fly-past presence (0..1) and the jet's screen position (−1 left … 1 right) */
  setFoot(presence: number, pan: number) {
    this.footPresence = clamp(presence);
    this.footPan = clamp(pan, -1, 1);
  }

  /** filtered air sweep across the stereo field on a section handoff */
  sweep(dir: 1 | -1) {
    if (!this.live) return;
    const nowMs = performance.now();
    if (nowMs - this.lastSweep < 650) return;
    this.lastSweep = nowMs;
    this.sweepFlip = !this.sweepFlip;
    const buf = this.sweepFlip ? this.sx.sweepA : this.sx.sweepB;
    if (!buf) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    const up = dir > 0;
    bp.frequency.setValueAtTime(up ? 380 : 2600, now);
    bp.frequency.exponentialRampToValueAtTime(up ? 2600 : 380, now + buf.duration * 0.75);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(SWEEP_GAIN, now + 0.12);
    g.gain.setTargetAtTime(0, now + buf.duration * 0.55, 0.3);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(up ? -0.7 : 0.7, now);
    pan.pan.linearRampToValueAtTime(up ? 0.7 : -0.7, now + buf.duration * 0.8);
    src.connect(bp).connect(g).connect(pan).connect(this.fxBus!);
    src.start(now);
    src.stop(now + buf.duration + 0.5);
  }

  /** sonic boom: double crack + rumble tail, beds ducked ~6 dB for a beat */
  boom() {
    if (!this.live || !this.sx.boom) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBoom < 2500) return;
    this.lastBoom = nowMs;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.sx.boom;
    const g = ctx.createGain();
    g.gain.value = BOOM_GAIN;
    src.connect(g).connect(this.fxBus!);
    src.start(now);
    const d = this.beds!.gain;
    d.cancelScheduledValues(now);
    d.setValueAtTime(d.value, now);
    d.linearRampToValueAtTime(0.5, now + 0.03);
    d.setValueAtTime(0.5, now + 1.2);
    d.setTargetAtTime(1, now + 1.2, 0.45);
  }

  /** the footer pass sting */
  flyby() {
    if (!this.live || !this.sx.flyby) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.sx.flyby;
    const g = ctx.createGain();
    g.gain.value = FLYBY_GAIN;
    // right → left, like the jet
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(0.75, now);
    pan.pan.linearRampToValueAtTime(-0.75, now + this.sx.flyby.duration * 0.8);
    src.connect(g).connect(pan).connect(this.fxBus!);
    src.start(now);
  }

  whoosh(direction: 1 | -1, duration: number) {
    if (!this.live || !this.buffers.whoosh) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.whoosh;
    // stretch the whoosh to roughly match the camera move
    const rate = Math.min(1.25, Math.max(0.75, this.buffers.whoosh.duration / Math.max(0.6, duration * 0.95)));
    src.playbackRate.value = direction > 0 ? rate : rate * 0.92;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(WHOOSH_GAIN, now + 0.25);
    g.gain.setTargetAtTime(0, now + duration * 0.7, 0.35);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(direction > 0 ? -0.25 : 0.25, now);
    pan.pan.linearRampToValueAtTime(direction > 0 ? 0.25 : -0.25, now + duration);
    src.connect(g).connect(pan).connect(this.fxBus!);
    src.start(now);
    src.stop(now + duration + 1.5);
  }

  /** live output level in 4 bands (0..1 each), for the sound chip's bars */
  bands(out: number[]) {
    const a = this.analyser;
    const f = this.freq;
    if (!a || !f || !this.live) {
      for (let i = 0; i < out.length; i++) out[i] = 0;
      return out;
    }
    a.getByteFrequencyData(f);
    // log-spaced bands over the first ~6 kHz
    const edges = [1, 3, 8, 20, 48];
    for (let i = 0; i < out.length; i++) {
      const lo = edges[i]!;
      const hi = edges[i + 1]!;
      let s = 0;
      for (let j = lo; j < hi; j++) s += f[j]!;
      out[i] = s / (hi - lo) / 255;
    }
    return out;
  }

  /** dev/test snapshot */
  debug() {
    return {
      state: this.ctx?.state ?? "none",
      enabled: this.enabled,
      loaded: Object.keys(this.sx),
      master: this.master?.gain.value ?? 0,
      beds: this.beds?.gain.value ?? 0,
      burner: this.burner?.g.gain.value ?? 0,
      burnerLp: this.burner?.lp.frequency.value ?? 0,
      throttle: this.throttle,
      foot: this.footPresence,
    };
  }

  dispose() {
    window.clearTimeout(this.ambientTimer);
    for (const s of this.loops) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    void this.ctx?.close();
    this.ctx = null;
  }
}

function curve(up: boolean) {
  const n = 64;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    c[i] = up ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
  }
  return c;
}
