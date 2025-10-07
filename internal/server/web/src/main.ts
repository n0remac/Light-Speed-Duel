import { createEventBus } from "./bus";
import { connectWebSocket, sendMessage } from "./net";
import { initGame } from "./game";
import { createInitialState, createInitialUIState } from "./state";
import { mountTutorial, BASIC_TUTORIAL_ID } from "./tutorial";
import { clearProgress as clearTutorialProgress } from "./tutorial/storage";
import { mountStory, INTRO_CHAPTER_ID, INTRO_INITIAL_RESPONSE_IDS } from "./story";
import { waitForUserStart } from "./start-gate";
import { resumeAudio } from "./story/sfx";

const CALL_SIGN_STORAGE_KEY = "lsd:callsign";

(async function bootstrap() {
  const qs = new URLSearchParams(window.location.search);
  const room = qs.get("room") || "default";
  const nameParam = sanitizeCallSign(qs.get("name"));
  const storedName = sanitizeCallSign(readStoredCallSign());
  const callSign = nameParam || storedName;

  if (nameParam && nameParam !== storedName) {
    persistCallSign(nameParam);
  }

  const roomLabel = document.getElementById("room-name");
  if (roomLabel) roomLabel.textContent = room;

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

  const game = initGame({ state, uiState, bus });
  const tutorial = mountTutorial(bus);

  let tutorialStarted = false;
  const startTutorial = (): void => {
    if (tutorialStarted) return;
    tutorialStarted = true;
    clearTutorialProgress(BASIC_TUTORIAL_ID);
    tutorial.start({ resume: false });
  };

  const unsubscribeStoryClosed = bus.on("dialogue:closed", ({ chapterId, nodeId }) => {
    if (chapterId !== INTRO_CHAPTER_ID) return;
    if (!INTRO_INITIAL_RESPONSE_IDS.includes(nodeId as typeof INTRO_INITIAL_RESPONSE_IDS[number])) return;
    unsubscribeStoryClosed();
    startTutorial();
  });

  mountStory({ bus, roomId: room });

  connectWebSocket({
    room,
    state,
    bus,
    onStateUpdated: () => game.onStateUpdated(),
    onOpen: () => {
      const nameToSend = callSign || sanitizeCallSign(readStoredCallSign());
      if (nameToSend) sendMessage({ type: "join", name: nameToSend });
    },
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
