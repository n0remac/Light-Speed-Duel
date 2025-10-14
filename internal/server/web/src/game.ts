import type { EventBus } from "./bus";
import { getApproxServerNow, sendMessage } from "./net";
import type { AppState, UIState } from "./state";
import { createCamera } from "./game/camera";
import { createInput } from "./game/input";
import { createLogic } from "./game/logic";
import { createRenderer } from "./game/render";
import { createUI } from "./game/ui";
import { mountMissionHud } from "./mission/hud";

interface InitGameOptions {
  state: AppState;
  uiState: UIState;
  bus: EventBus;
}

interface GameController {
  onStateUpdated(): void;
}

export function initGame({ state, uiState, bus }: InitGameOptions): GameController {
  const canvasEl = document.getElementById("cv") as HTMLCanvasElement | null;
  if (!canvasEl) {
    throw new Error("Canvas element #cv not found");
  }

  const camera = createCamera({ canvas: canvasEl, state, uiState });
  const logic = createLogic({
    state,
    uiState,
    bus,
    sendMessage,
    getApproxServerNow,
    camera,
  });
  const ui = createUI({
    state,
    uiState,
    bus,
    logic,
    camera,
    sendMessage,
    getApproxServerNow,
  });

  const { canvas: cachedCanvas, ctx: cachedCtx } = ui.cacheDom();
  const renderCanvas = cachedCanvas ?? canvasEl;
  const renderCtx = cachedCtx ?? renderCanvas.getContext("2d");
  if (!renderCtx) {
    throw new Error("Unable to acquire 2D rendering context");
  }

  const renderer = createRenderer({
    canvas: renderCanvas,
    ctx: renderCtx,
    state,
    uiState,
    camera,
    logic,
  });

  const input = createInput({
    canvas: renderCanvas,
    ui,
    logic,
    camera,
    state,
    uiState,
    bus,
    sendMessage,
  });

  ui.bindUI();
  input.bindInput();
  logic.ensureActiveMissileRoute();
  ui.syncMissileUIFromState();
  ui.updateControlHighlights();
  ui.refreshShipSelectionUI();
  ui.refreshMissileSelectionUI();
  ui.updateHelpOverlay();
  ui.updateStatusIndicators();
  ui.updateMissileLaunchButtonState();
  ui.updateMissileCountDisplay();

  mountMissionHud({ state, bus });

  let lastLoopTs: number | null = null;

  function loop(timestamp: number): void {
    if (!Number.isFinite(timestamp)) {
      timestamp = lastLoopTs ?? 0;
    }

    let dtSeconds = 0;
    if (lastLoopTs !== null) {
      dtSeconds = (timestamp - lastLoopTs) / 1000;
      if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
        dtSeconds = 0;
      }
    }
    lastLoopTs = timestamp;

    logic.updateRouteAnimations(dtSeconds);
    renderer.drawScene();
    ui.updateMissileLaunchButtonState();
    ui.updateCraftTimer();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  return {
    onStateUpdated() {
      logic.ensureActiveMissileRoute();
      ui.syncMissileUIFromState();
      ui.refreshShipSelectionUI();
      ui.refreshMissileSelectionUI();
      ui.updateMissileLaunchButtonState();
      ui.updateMissileCountDisplay();
      ui.updateCraftTimer();
      ui.updateStatusIndicators();
    },
  };
}
