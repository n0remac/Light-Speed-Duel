import type { StoryIntent } from "./types";
import { AudioEngine } from "../audio/engine";
import { playDialogue as playDialogueSfx } from "../audio/sfx";

let lastPlayedAt = 0;

// Maintain the old public API so engine.ts doesn't change
export function getAudioContext(): AudioContext {
  return AudioEngine.get().ctx;
}

export async function resumeAudio(): Promise<void> {
  await AudioEngine.get().resume();
}

export function playDialogueCue(intent: StoryIntent): void {
  const engine = AudioEngine.get();
  const now = engine.now;

  // Throttle rapid cues to avoid clutter
  if (now - lastPlayedAt < 0.1) return;
  lastPlayedAt = now;

  // Map "factory" vs others to a slightly different velocity (brightness)
  const velocity = intent === "factory" ? 0.8 : 0.5;
  playDialogueSfx(engine, { velocity, pan: 0 });
}

export function suspendDialogueAudio(): void {
  void AudioEngine.get().suspend();
}
