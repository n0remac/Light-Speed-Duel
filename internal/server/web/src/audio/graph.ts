// Low-level graph builders / helpers

export function osc(ctx: AudioContext, type: OscillatorType, freq: number) {
  return new OscillatorNode(ctx, { type, frequency: freq });
}

export function noise(ctx: AudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return new AudioBufferSourceNode(ctx, { buffer, loop: true });
}

export function makePanner(ctx: AudioContext, pan = 0) {
  return new StereoPannerNode(ctx, { pan });
}

/** Basic ADSR applied to a GainNode AudioParam. Returns a function to release. */
export function adsr(
  ctx: AudioContext,
  param: AudioParam,
  t0: number,
  a = 0.01, // attack
  d = 0.08, // decay
  s = 0.5,  // sustain (0..1 of peak)
  r = 0.2,  // release
  peak = 1
) {
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, t0 + a);
  param.linearRampToValueAtTime(s * peak, t0 + a + d);
  return (releaseAt = ctx.currentTime) => {
    param.cancelScheduledValues(releaseAt);
    // avoid sudden jumps; continue from current
    param.setValueAtTime(param.value, releaseAt);
    param.linearRampToValueAtTime(0.0001, releaseAt + r);
  };
}

export function lfoToParam(
  ctx: AudioContext,
  target: AudioParam,
  { frequency = 0.1, depth = 300, type = "sine" as OscillatorType } = {}
) {
  const lfo = new OscillatorNode(ctx, { type, frequency });
  const amp = new GainNode(ctx, { gain: depth });
  lfo.connect(amp).connect(target);
  return {
    start(at = ctx.currentTime) { lfo.start(at); },
    stop(at = ctx.currentTime) { lfo.stop(at); amp.disconnect(); },
  };
}
