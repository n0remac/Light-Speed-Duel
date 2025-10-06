import { createEventBus } from "./bus";
import { connectWebSocket } from "./net";
import { initGame } from "./game";
import { createInitialState, createInitialUIState } from "./state";

(function bootstrap() {
  const qs = new URLSearchParams(window.location.search);
  const room = qs.get("room") || "default";
  const roomLabel = document.getElementById("room-name");
  if (roomLabel) {
    roomLabel.textContent = room;
  }

  const state = createInitialState();
  const uiState = createInitialUIState();
  const bus = createEventBus();

  const game = initGame({ state, uiState, bus });

  connectWebSocket({
    room,
    state,
    bus,
    onStateUpdated: () => {
      game.onStateUpdated();
    },
  });
})();
