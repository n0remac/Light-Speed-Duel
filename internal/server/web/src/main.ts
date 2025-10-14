import { createEventBus } from "./bus";
import { connectWebSocket, sendMessage } from "./net";
import { initGame } from "./game";
import { createInitialState, createInitialUIState } from "./state";
import { mountTutorial, BASIC_TUTORIAL_ID } from "./tutorial";
import { clearProgress as clearTutorialProgress } from "./tutorial/storage";
import { mountStory, INTRO_CHAPTER_ID, INTRO_INITIAL_RESPONSE_IDS } from "./story";
import { waitForUserStart } from "./start-gate";
import { resumeAudio } from "./story/sfx";
import { AudioEngine } from "./audio/engine";
import { MusicDirector } from "./audio/music";
import { registerAudioBusBindings } from "./audio/cues";
import { mountMissionController } from "./mission/controller";

const CALL_SIGN_STORAGE_KEY = "lsd:callsign";

(async function bootstrap() {
  const qs = new URLSearchParams(window.location.search);
  const room = qs.get("room") || "default";
  const mode = qs.get("mode") || "";
  const missionId = qs.get("mission") || (mode === "campaign" ? "1" : null);
  const nameParam = sanitizeCallSign(qs.get("name"));
  const storedName = sanitizeCallSign(readStoredCallSign());
  const callSign = nameParam || storedName;
  const mapW = parseFloat(qs.get("mapW") || "8000");
  const mapH = parseFloat(qs.get("mapH") || "4500");

  if (nameParam && nameParam !== storedName) {
    persistCallSign(nameParam);
  }

  // Gate everything on a user gesture (centred button)
  await waitForUserStart({
    label: "Start Game",
    requestFullscreen: false,   // flip to true if you want fullscreen
    resumeAudio,                // uses story/sfx.ts
  });

  // ---- Start actual app after gesture ----
  const state = createInitialState();
  const uiState = createInitialUIState();
  const bus = createEventBus();

  // --- AUDIO: engine + bindings + default scene ---
  const engine = AudioEngine.get();
  await engine.resume(); // safe post-gesture
  const music = new MusicDirector(engine);
  registerAudioBusBindings(bus as any, engine, music);

  // Start a default music scene (adjust seed/scene as you like)
  bus.emit("audio:music:set-scene", { scene: "ambient", seed: 42 });

  // Optional: basic hooks to demonstrate SFX & ducking
  // bus.on("dialogue:opened", () => engine.duckMusic(0.35, 0.1));
  // bus.on("dialogue:closed", () => engine.unduckMusic(0.25));

  // Example game SFX wiring (adapt to your actual events)
  bus.on("ship:speedChanged", ({ value }) => {
    if (value > 0) bus.emit("audio:sfx", { name: "thrust", velocity: Math.min(1, value) });
  });

  const game = initGame({ state, uiState, bus });
  mountMissionController({ state, bus, mode, missionId });

  // Mount tutorial and story based on game mode
  const enableTutorial = mode === "campaign" || mode === "tutorial";
  const enableStory = mode === "campaign";

  let tutorial: ReturnType<typeof mountTutorial> | null = null;
  let tutorialStarted = false;

  if (enableTutorial) {
    tutorial = mountTutorial(bus);
  }

  const startTutorial = (): void => {
    if (!tutorial || tutorialStarted) return;
    tutorialStarted = true;
    clearTutorialProgress(BASIC_TUTORIAL_ID);
    tutorial.start({ resume: false });
  };

  if (enableStory) {
    // Campaign mode: story + tutorial
    const unsubscribeStoryClosed = bus.on("dialogue:closed", ({ chapterId, nodeId }) => {
      if (chapterId !== INTRO_CHAPTER_ID) return;
      if (!INTRO_INITIAL_RESPONSE_IDS.includes(nodeId as typeof INTRO_INITIAL_RESPONSE_IDS[number])) return;
      unsubscribeStoryClosed();
      startTutorial();
    });
    mountStory({ bus, roomId: room });
  } else if (mode === "tutorial") {
    // Tutorial mode: auto-start tutorial without story
    startTutorial();
  }
  // Free play and default: no systems mounted

  connectWebSocket({
    room,
    state,
    bus,
    mapW,
    mapH,
    mode,
    missionId: missionId ?? undefined,
    onStateUpdated: () => game.onStateUpdated(),
    onOpen: () => {
      const nameToSend = callSign || sanitizeCallSign(readStoredCallSign());
      if (nameToSend) sendMessage({ type: "join", name: nameToSend });
    },
  });

  // Optional: suspend/resume audio on tab visibility to save CPU
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void engine.suspend();
    } else {
      void engine.resume();
    }
  });
})();

function sanitizeCallSign(value: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, 24);
}

function persistCallSign(name: string): void {
  try {
    if (name) window.localStorage.setItem(CALL_SIGN_STORAGE_KEY, name);
    else window.localStorage.removeItem(CALL_SIGN_STORAGE_KEY);
  } catch {}
}

function readStoredCallSign(): string {
  try { return window.localStorage.getItem(CALL_SIGN_STORAGE_KEY) ?? ""; }
  catch { return ""; }
}
