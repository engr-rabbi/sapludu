/**
 * Sapludu — synthesized sound effects via the Web Audio API.
 * No binary assets needed: every effect is generated procedurally.
 * Respects the global sound setting and browser autoplay policies (unlocks on first gesture).
 */

type SfxName =
  | "dice"
  | "hop"
  | "ladder"
  | "snake"
  | "win"
  | "click"
  | "turn"
  | "overshoot"
  | "rung"
  | "gulp"
  | "emerge";

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call once on a user gesture to satisfy autoplay policies. */
  unlock() {
    this.ensure();
  }

  setEnabled(v: boolean) {
    this.enabled = v;
  }

  private tone(freq: number, durMs: number, type: OscillatorType = "sine", when = 0, vol = 1) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + when / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000 + 0.05);
  }

  private noise(durMs: number, when = 0, vol = 0.5, filterFreq = 1200) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + when / 1000;
    const len = Math.floor(ctx.sampleRate * (durMs / 1000));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  play(name: SfxName) {
    if (!this.enabled) return;
    switch (name) {
      case "dice":
        // tumbling rattle
        this.noise(90, 0, 0.5, 900);
        this.noise(80, 110, 0.4, 1400);
        this.noise(70, 220, 0.35, 1800);
        this.tone(520, 60, "triangle", 300, 0.5);
        break;
      case "hop":
        this.tone(660, 55, "square", 0, 0.25);
        break;
      case "ladder": {
        const scale = [392, 494, 587, 659, 784];
        scale.forEach((f, i) => this.tone(f, 110, "triangle", i * 95, 0.4));
        break;
      }
      case "snake": {
        this.noise(420, 0, 0.5, 700);
        const drop = [520, 440, 370, 300, 240];
        drop.forEach((f, i) => this.tone(f, 120, "sawtooth", i * 80, 0.22));
        break;
      }
      case "win": {
        const fanfare = [523, 659, 784, 1047, 784, 1047, 1319];
        fanfare.forEach((f, i) => this.tone(f, 170, "triangle", i * 140, 0.5));
        this.noise(500, 950, 0.25, 3000);
        break;
      }
      case "click":
        this.tone(880, 40, "square", 0, 0.15);
        break;
      case "turn":
        this.tone(740, 80, "sine", 0, 0.3);
        this.tone(988, 90, "sine", 90, 0.3);
        break;
      case "overshoot":
        this.tone(320, 130, "sine", 0, 0.3);
        this.tone(260, 160, "sine", 110, 0.3);
        break;
      case "rung":
        // wooden step tick while climbing a ladder
        this.tone(210, 45, "square", 0, 0.18);
        this.noise(35, 0, 0.18, 2200);
        break;
      case "gulp":
        // comic, family-friendly swallowing plop
        this.tone(300, 90, "sine", 0, 0.45);
        this.tone(170, 140, "sine", 70, 0.5);
        break;
      case "emerge":
        // cheerful pop when the token reappears from the tail
        this.tone(330, 70, "triangle", 0, 0.35);
        this.tone(560, 110, "triangle", 60, 0.4);
        break;
    }
  }
}

export const sound = new SoundManager();

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}
