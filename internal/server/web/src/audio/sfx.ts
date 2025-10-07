import { AudioEngine } from "./engine";
import { adsr, makePanner, noise, osc } from "./graph";
import type { SfxName } from "./types";

/** Fire-and-forget SFX by name, with simple params. */
export function playSfx(
  engine: AudioEngine,
  name: SfxName,
  opts: { velocity?: number; pan?: number } = {}
) {
  switch (name) {
    case "laser": return playLaser(engine, opts);
    case "thrust": return playThrust(engine, opts);
    case "explosion": return playExplosion(engine, opts);
    case "lock": return playLock(engine, opts);
    case "ui": return playUi(engine, opts);
    case "dialogue": return playDialogue(engine, opts);
  }
}

export function playLaser(
  engine: AudioEngine,
  { velocity = 1, pan = 0 } = {}
) {
  const { ctx, now } = engine;
  const out = engine.getSfxBus();

  const o = osc(ctx, "square", 680 + 160 * velocity);
  const f = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 1200 });
  const g = new GainNode(ctx, { gain: 0 });
  const p = makePanner(ctx, pan);

  o.connect(f).connect(g).connect(p).connect(out);
  const release = adsr(ctx, g.gain, now, 0.002, 0.03, 0.25, 0.08, 0.65);
  o.start(now);
  release(now + 0.06);
  o.stop(now + 0.2);
}

export function playThrust(
  engine: AudioEngine,
  { velocity = 0.6, pan = 0 } = {}
) {
  const { ctx, now } = engine;
  const out = engine.getSfxBus();

  const n = noise(ctx);
  const f = new BiquadFilterNode(ctx, {
    type: "bandpass",
    frequency: 180 + 360 * velocity,
    Q: 1.1,
  });
  const g = new GainNode(ctx, { gain: 0 });
  const p = makePanner(ctx, pan);

  n.connect(f).connect(g).connect(p).connect(out);
  const release = adsr(ctx, g.gain, now, 0.012, 0.15, 0.75, 0.25, 0.45 * velocity);
  n.start(now);
  release(now + 0.25);
  n.stop(now + 1.0);
}

export function playExplosion(
  engine: AudioEngine,
  { velocity = 1, pan = 0 } = {}
) {
  const { ctx, now } = engine;
  const out = engine.getSfxBus();

  const n = noise(ctx);
  const f = new BiquadFilterNode(ctx, {
    type: "lowpass",
    frequency: 2200 * Math.max(0.2, Math.min(velocity, 1)),
    Q: 0.2,
  });
  const g = new GainNode(ctx, { gain: 0 });
  const p = makePanner(ctx, pan);

  n.connect(f).connect(g).connect(p).connect(out);
  const release = adsr(ctx, g.gain, now, 0.005, 0.08, 0.5, 0.35, 1.1 * velocity);
  n.start(now);
  release(now + 0.15 + 0.1 * velocity);
  n.stop(now + 1.2);
}

export function playLock(
  engine: AudioEngine,
  { velocity = 1, pan = 0 } = {}
) {
  const { ctx, now } = engine;
  const out = engine.getSfxBus();

  const base = 520 + 140 * velocity;
  const o1 = osc(ctx, "sine", base);
  const o2 = osc(ctx, "sine", base * 1.5);

  const g = new GainNode(ctx, { gain: 0 });
  const p = makePanner(ctx, pan);

  o1.connect(g); o2.connect(g);
  g.connect(p).connect(out);

  const release = adsr(ctx, g.gain, now, 0.001, 0.02, 0.0, 0.12, 0.6);
  o1.start(now); o2.start(now + 0.02);
  release(now + 0.06);
  o1.stop(now + 0.2); o2.stop(now + 0.22);
}

export function playUi(engine: AudioEngine, { velocity = 1, pan = 0 } = {}) {
  const { ctx, now } = engine;
  const out = engine.getSfxBus();

  const o = osc(ctx, "triangle", 880 - 120 * velocity);
  const g = new GainNode(ctx, { gain: 0 });
  const p = makePanner(ctx, pan);

  o.connect(g).connect(p).connect(out);
  const release = adsr(ctx, g.gain, now, 0.001, 0.04, 0.0, 0.08, 0.35);
  o.start(now);
  release(now + 0.05);
  o.stop(now + 0.18);
}

/** Dialogue cue used by the story overlay (short, gentle ping). */
export function playDialogue(engine: AudioEngine, { velocity = 1, pan = 0 } = {}) {
  const { ctx, now } = engine;
  const out = engine.getSfxBus();

  const freq = 480 + 160 * velocity;
  const o = osc(ctx, "sine", freq);
  const g = new GainNode(ctx, { gain: 0.0001 });
  const p = makePanner(ctx, pan);

  o.connect(g).connect(p).connect(out);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0005, now + 0.28);

  o.start(now);
  o.stop(now + 0.3);
}
