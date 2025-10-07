import type { StoryIntent } from "./types";

let audioCtx: AudioContext | null = null;
let lastPlayedAt = 0;
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export async function resumeAudio(): Promise<void> {
  const ac = getAudioContext();
  if (ac.state === "suspended") {
    await ac.resume();
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") {
    return null;
  }
  if (audioCtx) {
    return audioCtx;
  }
  try {
    audioCtx = new AudioContext();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

export function playDialogueCue(intent: StoryIntent): void {

  const ctx = ensureContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  console.log({ now, lastPlayedAt, diff: now - lastPlayedAt });
  if (now - lastPlayedAt < 0.1) {
    console.log("Dialogue cue skipped", intent);
    return;
  }
  lastPlayedAt = now;


  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = intent === "factory" ? 420 : 620;
  gain.gain.value = 0.0001;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.28);

  osc.connect(gain);
  gain.connect(ctx.destination);

  console.log("Playing dialogue cue", intent, osc.frequency.value);
  osc.start(now);
  osc.stop(now + 0.3);
}

export function suspendDialogueAudio(): void {
  if (!audioCtx) return;
  try {
    void audioCtx.suspend();
  } catch {
    // ignore
  }
}

