// Shared types for the audio system

export type Bus = {
  on<T = any>(type: string, handler: (payload: T) => void): () => void;
  emit<T = any>(type: string, payload?: T): void;
};

export type SfxName =
  | "ui"
  | "laser"
  | "thrust"
  | "explosion"
  | "lock"
  | "dialogue";

export type SceneName = "ambient" | "combat" | "lobby";

export type MusicParamMessage = {
  key: string;
  value: number;
};

export type MusicTransportMessage = {
  cmd: "start" | "stop" | "pause";
};

export type MusicSceneOptions = {
  seed?: number;
};

export type PRNG = () => number;
