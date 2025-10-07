import type { PRNG } from "./types";

export class AudioEngine {
  private static _inst: AudioEngine | null = null;

  public readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly musicBus: GainNode;
  private readonly sfxBus: GainNode;

  private _targetMaster = 0.9;
  private _targetMusic = 0.9;
  private _targetSfx = 0.9;

  static get(): AudioEngine {
    if (!this._inst) this._inst = new AudioEngine();
    return this._inst;
  }

  private constructor() {
    this.ctx = new AudioContext();

    this.master = new GainNode(this.ctx, { gain: this._targetMaster });
    this.musicBus = new GainNode(this.ctx, { gain: this._targetMusic });
    this.sfxBus = new GainNode(this.ctx, { gain: this._targetSfx });

    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  getMusicBus(): GainNode {
    return this.musicBus;
  }

  getSfxBus(): GainNode {
    return this.sfxBus;
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  async suspend(): Promise<void> {
    if (this.ctx.state === "running") {
      await this.ctx.suspend();
    }
  }

  setMasterGain(v: number, t = this.now, ramp = 0.03): void {
    this._targetMaster = v;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.linearRampToValueAtTime(v, t + ramp);
  }

  setMusicGain(v: number, t = this.now, ramp = 0.03): void {
    this._targetMusic = v;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.linearRampToValueAtTime(v, t + ramp);
  }

  setSfxGain(v: number, t = this.now, ramp = 0.03): void {
    this._targetSfx = v;
    this.sfxBus.gain.cancelScheduledValues(t);
    this.sfxBus.gain.linearRampToValueAtTime(v, t + ramp);
  }

  duckMusic(level = 0.4, attack = 0.05): void {
    const t = this.now;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.linearRampToValueAtTime(level, t + attack);
  }

  unduckMusic(release = 0.25): void {
    const t = this.now;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.linearRampToValueAtTime(this._targetMusic, t + release);
  }
}

// Tiny seedable PRNG (Mulberry32)
export function makePRNG(seed: number): PRNG {
  let s = (seed >>> 0) || 1;
  return function () {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
