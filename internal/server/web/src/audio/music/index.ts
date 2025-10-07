import type { SceneName, MusicSceneOptions } from "../types";
import { AudioEngine } from "../engine";
import { AmbientScene } from "./scenes/ambient";

export class MusicDirector {
  private current?: { name: SceneName; stop: () => void };
  private busOut: GainNode;

  constructor(private engine: AudioEngine) {
    this.busOut = new GainNode(engine.ctx, { gain: 0.9 });
    this.busOut.connect(engine.getMusicBus());
  }

  /** Crossfade to a new scene */
  setScene(name: SceneName, opts?: MusicSceneOptions) {
    if (this.current?.name === name) return;

    const old = this.current;
    const t = this.engine.now;

    // fade-out old
    const fadeOut = new GainNode(this.engine.ctx, { gain: 0.9 });
    fadeOut.connect(this.engine.getMusicBus());
    if (old) {
      // We assume each scene manages its own out node; stopping triggers a natural tail.
      old.stop();
      fadeOut.gain.linearRampToValueAtTime(0.0, t + 0.6);
      setTimeout(() => fadeOut.disconnect(), 650);
    }

    // new scene
    const sceneOut = new GainNode(this.engine.ctx, { gain: 0 });
    sceneOut.connect(this.busOut);

    let stop = () => sceneOut.disconnect();

    if (name === "ambient") {
      const s = new AmbientScene(this.engine.ctx, sceneOut, opts?.seed ?? 1);
      s.start();
      stop = () => {
        s.stop();
        sceneOut.disconnect();
      };
    }
    // else if (name === "combat") { /* implement combat scene later */ }
    // else if (name === "lobby") { /* implement lobby scene later */ }

    this.current = { name, stop };
    sceneOut.gain.linearRampToValueAtTime(0.9, t + 0.6);
  }

  stop() {
    if (!this.current) return;
    this.current.stop();
    this.current = undefined;
  }
}
