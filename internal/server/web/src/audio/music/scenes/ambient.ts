import { makePRNG } from "../../engine";

export type AmbientParams = {
  intensity: number;  // overall loudness / energy (0..1)
  brightness: number; // filter openness & chord timbre (0..1)
  density: number;    // chord spawn rate / thickness (0..1)
};

type ModeName = "Ionian" | "Dorian" | "Phrygian" | "Lydian" | "Mixolydian" | "Aeolian" | "Locrian";

const MODES: Record<ModeName, number[]> = {
  Ionian:     [0,2,4,5,7,9,11],
  Dorian:     [0,2,3,5,7,9,10],
  Phrygian:   [0,1,3,5,7,8,10],
  Lydian:     [0,2,4,6,7,9,11],
  Mixolydian: [0,2,4,5,7,9,10],
  Aeolian:    [0,2,3,5,7,8,10],
  Locrian:    [0,1,3,5,6,8,10],
};

// Musical constants tuned to match the HTML version
const ROOT_MAX_GAIN     = 0.33;
const ROOT_SWELL_TIME   = 20;
const DRONE_SHIFT_MIN_S = 24;
const DRONE_SHIFT_MAX_S = 48;
const DRONE_GLIDE_MIN_S = 8;
const DRONE_GLIDE_MAX_S = 15;

const CHORD_VOICES_MAX  = 5;
const CHORD_FADE_MIN_S  = 8;
const CHORD_FADE_MAX_S  = 16;
const CHORD_HOLD_MIN_S  = 10;
const CHORD_HOLD_MAX_S  = 22;
const CHORD_GAP_MIN_S   = 4;
const CHORD_GAP_MAX_S   = 9;
const CHORD_ANCHOR_PROB = 0.6; // prefer aligning chord root to drone

const FILTER_BASE_HZ    = 220;
const FILTER_PEAK_HZ    = 4200;
const SWEEP_SEG_S       = 30;  // up then down, very slow
const LFO_RATE_HZ       = 0.05;
const LFO_DEPTH_HZ      = 900;

const DELAY_TIME_S      = 0.45;
const FEEDBACK_GAIN     = 0.35;
const WET_MIX           = 0.28;

// degree preference for drone moves: 1,5,3,6,2,4,7 (indexes 0..6)
const PREFERRED_DEGREE_ORDER = [0,4,2,5,1,3,6];

/** Utility */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const rand = (rng: () => number, a: number, b: number) => a + rng() * (b - a);
const choice = <T,>(rng: () => number, arr: T[]) => arr[Math.floor(rng() * arr.length)];

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** A single steady oscillator voice with shimmer detune and gain envelope. */
class Voice {
  private killed = false;
  private shimmer: OscillatorNode;
  private shimmerGain: GainNode;
  private scale: GainNode;
  public g: GainNode;
  public osc: OscillatorNode;

  constructor(
    private ctx: AudioContext,
    private targetGain: number,
    waveform: OscillatorType,
    freqHz: number,
    destination: AudioNode,
    rng: () => number
  ){
    this.osc = new OscillatorNode(ctx, { type: waveform, frequency: freqHz });

    // subtle shimmer via detune modulation
    this.shimmer = new OscillatorNode(ctx, { type: "sine", frequency: rand(rng, 0.06, 0.18) });
    this.shimmerGain = new GainNode(ctx, { gain: rand(rng, 0.4, 1.2) });
    this.scale = new GainNode(ctx, { gain: 25 }); // cents range
    this.shimmer.connect(this.shimmerGain).connect(this.scale).connect(this.osc.detune);

    this.g = new GainNode(ctx, { gain: 0 });
    this.osc.connect(this.g).connect(destination);

    this.osc.start();
    this.shimmer.start();
  }

  fadeIn(seconds: number) {
    const now = this.ctx.currentTime;
    this.g.gain.cancelScheduledValues(now);
    this.g.gain.setValueAtTime(this.g.gain.value, now);
    this.g.gain.linearRampToValueAtTime(this.targetGain, now + seconds);
  }

  fadeOutKill(seconds: number) {
    if (this.killed) return;
    this.killed = true;
    const now = this.ctx.currentTime;
    this.g.gain.cancelScheduledValues(now);
    this.g.gain.setValueAtTime(this.g.gain.value, now);
    this.g.gain.linearRampToValueAtTime(0.0001, now + seconds);
    setTimeout(() => this.stop(), seconds * 1000 + 60);
  }

  setFreqGlide(targetHz: number, glideSeconds: number) {
    const now = this.ctx.currentTime;
    // exponential when possible for smoothness
    const current = Math.max(0.0001, this.osc.frequency.value);
    this.osc.frequency.cancelScheduledValues(now);
    try {
      this.osc.frequency.setValueAtTime(current, now);
      this.osc.frequency.exponentialRampToValueAtTime(targetHz, now + glideSeconds);
    } catch {
      this.osc.frequency.linearRampToValueAtTime(targetHz, now + glideSeconds);
    }
  }

  stop() {
    try { this.osc.stop(); this.shimmer.stop(); } catch {}
    try {
      this.osc.disconnect(); this.shimmer.disconnect();
      this.g.disconnect(); this.shimmerGain.disconnect(); this.scale.disconnect();
    } catch {}
  }
}

export class AmbientScene {
  private running = false;
  private stopFns: Array<() => void> = [];
  private timeouts: number[] = [];

  private params: AmbientParams = { intensity: 0.75, brightness: 0.5, density: 0.6 };

  private rng: () => number;
  private master!: GainNode;
  private filter!: BiquadFilterNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private delay!: DelayNode;
  private feedback!: GainNode;

  private lfoNode?: OscillatorNode;
  private lfoGain?: GainNode;

  // musical state
  private keyRootMidi = 43;
  private mode: ModeName = "Ionian";
  private droneDegreeIdx = 0;
  private rootVoice: Voice | null = null;

  constructor(
    private ctx: AudioContext,
    private out: GainNode,
    seed = 1
  ) {
    this.rng = makePRNG(seed);
  }

  setParam<K extends keyof AmbientParams>(k: K, v: AmbientParams[K]) {
    this.params[k] = clamp01(v);
    if (this.running && k === "intensity" && this.master) {
      this.master.gain.value = 0.15 + 0.85 * this.params.intensity; 
    }
  }

  start() {
    if (this.running) return;
    this.running = true;

    // ---- Core graph (filter -> dry+delay -> master -> out) ----
    this.master = new GainNode(this.ctx, { gain: 0.15 + 0.85 * this.params.intensity });
    this.filter = new BiquadFilterNode(this.ctx, { type: "lowpass", Q: 0.707 });
    this.dry = new GainNode(this.ctx, { gain: 1 });
    this.wet = new GainNode(this.ctx, { gain: WET_MIX });
    this.delay = new DelayNode(this.ctx, { delayTime: DELAY_TIME_S, maxDelayTime: 2 });
    this.feedback = new GainNode(this.ctx, { gain: FEEDBACK_GAIN });

    this.filter.connect(this.dry).connect(this.master);
    this.filter.connect(this.delay);
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(this.wet).connect(this.master);
    this.master.connect(this.out);

    // ---- Filter baseline + slow sweeps ----
    this.filter.frequency.setValueAtTime(FILTER_BASE_HZ, this.ctx.currentTime);
    const sweep = () => {
      const t = this.ctx.currentTime;
      this.filter.frequency.cancelScheduledValues(t);
      // up then down using very slow time constants
      this.filter.frequency.setTargetAtTime(
        FILTER_BASE_HZ + (FILTER_PEAK_HZ - FILTER_BASE_HZ) * (0.4 + 0.6 * this.params.brightness),
        t, SWEEP_SEG_S / 3
      );
      this.filter.frequency.setTargetAtTime(
        FILTER_BASE_HZ * (0.7 + 0.3 * this.params.brightness),
        t + SWEEP_SEG_S, SWEEP_SEG_S / 3
      );
      this.timeouts.push(window.setTimeout(() => this.running && sweep(), (SWEEP_SEG_S * 2) * 1000) as unknown as number);
    };
    sweep();

    // ---- Gentle LFO on filter freq (small depth) ----
    this.lfoNode = new OscillatorNode(this.ctx, { type: "sine", frequency: LFO_RATE_HZ });
    this.lfoGain = new GainNode(this.ctx, { gain: LFO_DEPTH_HZ * (0.5 + 0.5 * this.params.brightness) });
    this.lfoNode.connect(this.lfoGain).connect(this.filter.frequency);
    this.lfoNode.start();

    // ---- Spawn root drone (gliding to different degrees) ----
    this.spawnRootDrone();
    this.scheduleNextDroneMove();

    // ---- Chord cycle loop ----
    this.chordCycle();

    // cleanup
    this.stopFns.push(() => {
      try { this.lfoNode?.stop(); } catch {}
      [this.master, this.filter, this.dry, this.wet, this.delay, this.feedback, this.lfoNode, this.lfoGain]
        .forEach(n => { try { n?.disconnect(); } catch {} });
    });
  }

  stop() {
    if (!this.running) return;
    this.running = false;

    // cancel timeouts
    this.timeouts.splice(0).forEach(id => window.clearTimeout(id));

    // fade and cleanup voices
    if (this.rootVoice) this.rootVoice.fadeOutKill(1.2);

    // run deferred stops
    this.stopFns.splice(0).forEach(fn => fn());
  }

  /* ------------------------- Musical engine below ------------------------- */

  private currentDegrees(): number[] {
    return MODES[this.mode] || MODES.Lydian;
  }

  /** Drone root voice */
  private spawnRootDrone() {
    const baseMidi = this.keyRootMidi + this.currentDegrees()[this.droneDegreeIdx];
    const v = new Voice(
      this.ctx,
      ROOT_MAX_GAIN,
      "sine",
      midiToFreq(baseMidi),
      this.filter,
      this.rng
    );
    v.fadeIn(ROOT_SWELL_TIME);
    this.rootVoice = v;
  }

  private scheduleNextDroneMove() {
    if (!this.running) return;
    const waitMs = rand(this.rng, DRONE_SHIFT_MIN_S, DRONE_SHIFT_MAX_S) * 1000;
    const id = window.setTimeout(() => {
      if (!this.running || !this.rootVoice) return;
      const glide = rand(this.rng, DRONE_GLIDE_MIN_S, DRONE_GLIDE_MAX_S);
      const nextIdx = this.pickNextDroneDegreeIdx();
      const targetMidi = this.keyRootMidi + this.currentDegrees()[nextIdx];
      this.rootVoice.setFreqGlide(midiToFreq(targetMidi), glide);
      this.droneDegreeIdx = nextIdx;
      this.scheduleNextDroneMove();
    }, waitMs) as unknown as number;
    this.timeouts.push(id);
  }

  private pickNextDroneDegreeIdx(): number {
    const order = [...PREFERRED_DEGREE_ORDER];
    const i = order.indexOf(this.droneDegreeIdx);
    if (i >= 0) { const [cur] = order.splice(i, 1); order.push(cur); }
    return choice(this.rng, order);
  }

  /** Build diatonic stacked-third chord degrees with optional extensions */
  private buildChordDegrees(modeDegs: number[], rootIndex: number, size = 4, add9 = false, add11 = false, add13 = false) {
    const steps = [0, 2, 4, 6]; // thirds over 7-note scale
    const chordIdxs = steps.slice(0, Math.min(size, 4)).map(s => (rootIndex + s) % 7);
    if (add9)  chordIdxs.push((rootIndex + 8) % 7);
    if (add11) chordIdxs.push((rootIndex + 10) % 7);
    if (add13) chordIdxs.push((rootIndex + 12) % 7);
    return chordIdxs.map(i => modeDegs[i]);
  }

  private *endlessChords() {
    while (true) {
      const modeDegs = this.currentDegrees();
      // choose chord root degree (often align with drone)
      const rootDegreeIndex = (this.rng() < CHORD_ANCHOR_PROB) ? this.droneDegreeIdx : Math.floor(this.rng() * 7);

      // chord size / extensions
      const r = this.rng();
      let size = 3; let add9 = false, add11 = false, add13 = false;
      if (r < 0.35)            { size = 3; }
      else if (r < 0.75)       { size = 4; }
      else if (r < 0.90)       { size = 4; add9 = true; }
      else if (r < 0.97)       { size = 4; add11 = true; }
      else                     { size = 4; add13 = true; }

      const chordSemis = this.buildChordDegrees(modeDegs, rootDegreeIndex, size, add9, add11, add13);
      // spread chord across octaves (-12, 0, +12), bias to center
      const spread = chordSemis.map(semi => semi + choice(this.rng, [-12, 0, 0, 12]));

      // occasionally ensure tonic is present for grounding
      if (!spread.includes(0) && this.rng() < 0.5) spread.push(0);

      yield spread;
    }
  }

  private async chordCycle() {
    const gen = this.endlessChords();
    const voices = new Set<Voice>();

    const sleep = (ms: number) => new Promise<void>(r => {
      const id = window.setTimeout(() => r(), ms) as unknown as number;
      this.timeouts.push(id);
    });

    while (this.running) {
      // chord spawn probability / thickness scale with density & brightness
      const thickness = Math.round(2 + this.params.density * 3);
      const baseMidi = this.keyRootMidi;
      const degreesOff: number[] = gen.next().value ?? [];

      // spawn
      for (const off of degreesOff) {
        if (!this.running) break;
        if (voices.size >= Math.min(CHORD_VOICES_MAX, thickness)) break;

        const midi = baseMidi + off;
        const freq = midiToFreq(midi);
        const waveform = choice(this.rng, ["sine", "triangle", "sawtooth"] as OscillatorType[]);

        // louder with intensity; slightly brighter -> slightly louder
        const gainTarget = rand(this.rng, 0.08, 0.22) *
          (0.85 + 0.3 * this.params.intensity) *
          (0.9 + 0.2 * this.params.brightness);

        const v = new Voice(this.ctx, gainTarget, waveform, freq, this.filter, this.rng);
        voices.add(v);
        v.fadeIn(rand(this.rng, CHORD_FADE_MIN_S, CHORD_FADE_MAX_S));
      }

      await sleep(rand(this.rng, CHORD_HOLD_MIN_S, CHORD_HOLD_MAX_S) * 1000);

      // fade out
      const outs = Array.from(voices);
      for (const v of outs) v.fadeOutKill(rand(this.rng, CHORD_FADE_MIN_S, CHORD_FADE_MAX_S));
      voices.clear();

      await sleep(rand(this.rng, CHORD_GAP_MIN_S, CHORD_GAP_MAX_S) * 1000);
    }

    // safety: kill any lingering voices
    for (const v of Array.from(voices)) v.fadeOutKill(0.8);
  }
}
