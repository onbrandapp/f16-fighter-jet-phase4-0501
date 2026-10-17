// Web Audio soundtrack: ambient bed (crossfaded into itself for a seamless
// loop), a looping engine hum, and a whoosh per camera move. Nothing is
// created or played until the visitor explicitly enables sound.

const AMBIENT_URL = "/audio/ambient.mp3";
const ENGINE_URL = "/audio/engine.mp3";
const WHOOSH_URL = "/audio/whoosh.mp3";

const MASTER = 0.55;
const AMBIENT_GAIN = 0.42;
const ENGINE_GAIN = 0.9;
const WHOOSH_GAIN = 0.32;
const XFADE = 6;

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers: Partial<Record<"ambient" | "engine" | "whoosh", AudioBuffer>> = {};
  private loading: Promise<void> | null = null;
  private ambientTimer: number | undefined;
  private engineSrc: AudioBufferSourceNode | null = null;
  private ambientBus: GainNode | null = null;
  private enabled = false;

  get isEnabled() {
    return this.enabled;
  }

  private async ensure() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      // gentle low-pass keeps everything soft and cinematic
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 9000;
      this.master.connect(lp).connect(this.ctx.destination);
    }
    if (!this.loading) {
      const ctx = this.ctx;
      const get = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`audio ${url} ${res.status}`);
        return ctx.decodeAudioData(await res.arrayBuffer());
      };
      this.loading = Promise.all([get(AMBIENT_URL), get(ENGINE_URL), get(WHOOSH_URL)]).then(([a, e, w]) => {
        this.buffers = { ambient: a, engine: e, whoosh: w };
      });
    }
    await this.loading;
  }

  async enable() {
    this.enabled = true;
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

  private startBeds() {
    const ctx = this.ctx!;
    const { ambient, engine } = this.buffers;
    if (!ambient || !engine) return;
    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = AMBIENT_GAIN;
    this.ambientBus.connect(this.master!);

    const engineGain = ctx.createGain();
    engineGain.gain.value = ENGINE_GAIN;
    const engineLp = ctx.createBiquadFilter();
    engineLp.type = "lowpass";
    engineLp.frequency.value = 2200;
    engineGain.connect(engineLp).connect(this.master!);
    this.engineSrc = ctx.createBufferSource();
    this.engineSrc.buffer = engine;
    this.engineSrc.loop = true;
    this.engineSrc.connect(engineGain);
    this.engineSrc.start();

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

  whoosh(direction: 1 | -1, duration: number) {
    if (!this.enabled || !this.ctx || !this.buffers.whoosh || this.ctx.state !== "running") return;
    const ctx = this.ctx;
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
    src.connect(g).connect(pan).connect(this.master!);
    src.start(now);
    src.stop(now + duration + 1.5);
  }

  dispose() {
    window.clearTimeout(this.ambientTimer);
    try {
      this.engineSrc?.stop();
    } catch {
      /* already stopped */
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
