import type { Bus, MusicParamMessage, MusicSceneOptions } from "./types";
import { AudioEngine } from "./engine";
import { MusicDirector } from "./music";
import { playSfx } from "./sfx";

/**
 * Bind standard audio events to the engine and music director.
 *
 * Events supported:
 *  - audio:resume
 *  - audio:mute / audio:unmute
 *  - audio:set-master-gain { gain }
 *  - audio:sfx { name, velocity?, pan? }
 *  - audio:music:set-scene { scene, seed? }
 *  - audio:music:param { key, value }
 *  - audio:music:transport { cmd: "start" | "stop" | "pause" }  // pause currently maps to stop
 */
export function registerAudioBusBindings(
  bus: Bus,
  engine: AudioEngine,
  music: MusicDirector
): void {
  bus.on("audio:resume", () => engine.resume());
  bus.on("audio:mute", () => engine.setMasterGain(0));
  bus.on("audio:unmute", () => engine.setMasterGain(0.9));
  bus.on("audio:set-master-gain", ({ gain }: { gain: number }) =>
    engine.setMasterGain(Math.max(0, Math.min(1, gain)))
  );

  bus.on("audio:sfx", (msg: { name: string; velocity?: number; pan?: number }) => {
    playSfx(engine, msg.name as any, { velocity: msg.velocity, pan: msg.pan });
  });

  bus.on("audio:music:set-scene", (msg: { scene: string } & MusicSceneOptions) => {
    engine.resume();
    music.setScene(msg.scene as any, { seed: msg.seed });
  });

  bus.on("audio:music:param", (_msg: MusicParamMessage) => {
    // Hook for future param routing per scene (e.g., intensity/brightness/density)
    // If you want global params, keep a map here and forward to the active scene
  });

  bus.on("audio:music:transport", ({ cmd }: { cmd: "start" | "stop" | "pause" }) => {
    if (cmd === "stop" || cmd === "pause") music.stop();
    // "start" is implicit via setScene
  });
}
