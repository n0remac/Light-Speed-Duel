import type { EventBus } from "../bus";
import type { AppState, UIState } from "../state";
import type { Camera } from "./camera";
import type { Logic, PointerPoint } from "./logic";
import type { UIController } from "./ui";

interface InputDependencies {
  canvas: HTMLCanvasElement;
  ui: UIController;
  logic: Logic;
  camera: Camera;
  state: AppState;
  uiState: UIState;
  bus: EventBus;
  sendMessage(payload: unknown): void;
}

export interface InputController {
  bindInput(): void;
}

export function createInput({
  canvas,
  ui,
  logic,
  camera,
  state,
  uiState,
  bus,
  sendMessage,
}: InputDependencies): InputController {
  let lastTouchDistance: number | null = null;
  let pendingTouchTimeout: ReturnType<typeof setTimeout> | null = null;
  let isPinching = false;

  function getPointerCanvasPoint(event: PointerEvent): PointerPoint {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width !== 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height !== 0 ? canvas.height / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function handlePointerPlacement(canvasPoint: PointerPoint, worldPoint: PointerPoint): void {
    const context = uiState.inputContext === "missile" ? "missile" : "ship";
    if (context === "missile") {
      logic.handleMissilePointer(canvasPoint, worldPoint);
      ui.renderMissileRouteControls();
    } else {
      logic.handleShipPointer(canvasPoint, worldPoint);
      ui.updatePlannedHeatBar();
    }
  }

  function onCanvasPointerDown(event: PointerEvent): void {
    const canvasPoint = getPointerCanvasPoint(event);
    const worldPoint = camera.canvasToWorld(canvasPoint);
    const context = uiState.inputContext === "missile" ? "missile" : "ship";

    if (context === "ship" && uiState.shipTool === "select" && state.me?.waypoints) {
      const wpIndex = logic.findWaypointAtPosition(canvasPoint);
      if (wpIndex !== null) {
        logic.beginShipDrag(wpIndex, canvasPoint);
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }

    if (context === "missile" && uiState.missileTool === "select") {
      const hit = logic.hitTestMissileRoutes(canvasPoint);
      if (hit) {
        ui.setInputContext("missile");
        logic.setMissileSelection(hit.selection, hit.route.id);
        ui.renderMissileRouteControls();
        if (hit.selection.type === "waypoint") {
          logic.beginMissileDrag(hit.selection.index, canvasPoint);
          canvas.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        return;
      }
      logic.setMissileSelection(null);
      ui.renderMissileRouteControls();
    }

    if (event.pointerType === "touch") {
      if (pendingTouchTimeout !== null) {
        clearTimeout(pendingTouchTimeout);
      }
      pendingTouchTimeout = setTimeout(() => {
        if (isPinching) return;
        handlePointerPlacement(canvasPoint, worldPoint);
        pendingTouchTimeout = null;
      }, 150);
    } else {
      handlePointerPlacement(canvasPoint, worldPoint);
    }

    event.preventDefault();
  }

  function onCanvasPointerMove(event: PointerEvent): void {
    const draggingShip = logic.getDraggedWaypoint() !== null;
    const draggingMissile = logic.getDraggedMissileWaypoint() !== null;
    if (!draggingShip && !draggingMissile) return;

    const canvasPoint = getPointerCanvasPoint(event);
    const worldPoint = camera.canvasToWorld(canvasPoint);

    if (draggingShip) {
      logic.updateShipDrag(worldPoint);
      event.preventDefault();
      return;
    }

    if (draggingMissile) {
      logic.updateMissileDrag(worldPoint);
      ui.renderMissileRouteControls();
      event.preventDefault();
    }
  }

  function onCanvasPointerUp(event: PointerEvent): void {
    logic.endDrag();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    pendingTouchTimeout = null;
  }

  function onCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const centerX = event.clientX - rect.left;
    const centerY = event.clientY - rect.top;
    const scaleX = rect.width !== 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height !== 0 ? canvas.height / rect.height : 1;
    const canvasCenterX = centerX * scaleX;
    const canvasCenterY = centerY * scaleY;
    const delta = event.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    const newZoom = uiState.zoom * zoomFactor;
    camera.setZoom(newZoom, canvasCenterX, canvasCenterY);
  }

  function getTouchDistance(touches: TouchList): number | null {
    if (touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function getTouchCenter(touches: TouchList): { x: number; y: number } | null {
    if (touches.length < 2) return null;
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  function onCanvasTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      event.preventDefault();
      isPinching = true;
      lastTouchDistance = getTouchDistance(event.touches);
      if (pendingTouchTimeout !== null) {
        clearTimeout(pendingTouchTimeout);
        pendingTouchTimeout = null;
      }
    }
  }

  function onCanvasTouchMove(event: TouchEvent): void {
    if (event.touches.length !== 2) {
      lastTouchDistance = null;
      return;
    }
    event.preventDefault();
    const currentDistance = getTouchDistance(event.touches);
    if (currentDistance === null || lastTouchDistance === null) return;
    const rect = canvas.getBoundingClientRect();
    const center = getTouchCenter(event.touches);
    if (!center) return;
    const scaleX = rect.width !== 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height !== 0 ? canvas.height / rect.height : 1;
    const canvasCenterX = (center.x - rect.left) * scaleX;
    const canvasCenterY = (center.y - rect.top) * scaleY;
    const zoomFactor = currentDistance / lastTouchDistance;
    const newZoom = uiState.zoom * zoomFactor;
    camera.setZoom(newZoom, canvasCenterX, canvasCenterY);
    lastTouchDistance = currentDistance;
  }

  function onCanvasTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      lastTouchDistance = null;
      setTimeout(() => {
        isPinching = false;
      }, 100);
    }
  }

  function handleAddMissileRoute(): void {
    ui.setInputContext("missile");
    sendMessage({ type: "add_missile_route" });
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    const target = document.activeElement as HTMLElement | null;
    const isEditable =
      !!target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    if (uiState.helpVisible && event.key !== "Escape") {
      event.preventDefault();
      return;
    }

    if (isEditable) {
      if (event.key === "Escape") {
        target.blur();
        event.preventDefault();
      }
      return;
    }

    switch (event.code) {
      case "Digit1":
        ui.setInputContext("ship");
        event.preventDefault();
        return;
      case "Digit2":
        ui.setInputContext("missile");
        event.preventDefault();
        return;
      case "KeyT":
        if (uiState.activeTool === "ship-set") {
          ui.setActiveTool("ship-select");
        } else if (uiState.activeTool === "ship-select") {
          ui.setActiveTool("ship-set");
        } else {
          ui.setActiveTool("ship-set");
        }
        event.preventDefault();
        return;
      case "KeyC":
      case "KeyH":
        ui.setInputContext("ship");
        logic.clearShipRoute();
        event.preventDefault();
        return;
      case "BracketLeft":
        ui.setInputContext("ship");
        ui.adjustShipSpeed(-1, event.shiftKey);
        event.preventDefault();
        return;
      case "BracketRight":
        ui.setInputContext("ship");
        ui.adjustShipSpeed(1, event.shiftKey);
        event.preventDefault();
        return;
      case "Tab":
        ui.setInputContext("ship");
        logic.cycleShipSelection(event.shiftKey ? -1 : 1);
        event.preventDefault();
        return;
      case "KeyN":
        handleAddMissileRoute();
        event.preventDefault();
        return;
      case "KeyL":
        ui.setInputContext("missile");
        logic.launchActiveMissileRoute();
        event.preventDefault();
        return;
      case "KeyE":
        if (uiState.activeTool === "missile-set") {
          ui.setActiveTool("missile-select");
        } else if (uiState.activeTool === "missile-select") {
          ui.setActiveTool("missile-set");
        } else {
          ui.setActiveTool("missile-set");
        }
        event.preventDefault();
        return;
      case "Comma":
        ui.setInputContext("missile");
        ui.adjustMissileAgro(-1, event.shiftKey);
        event.preventDefault();
        return;
      case "Period":
        ui.setInputContext("missile");
        ui.adjustMissileAgro(1, event.shiftKey);
        event.preventDefault();
        return;
      case "Semicolon":
        ui.setInputContext("missile");
        ui.adjustMissileSpeed(-1, event.shiftKey);
        event.preventDefault();
        return;
      case "Quote":
        ui.setInputContext("missile");
        ui.adjustMissileSpeed(1, event.shiftKey);
        event.preventDefault();
        return;
      case "Delete":
      case "Backspace":
        if (uiState.inputContext === "missile" && logic.getMissileSelection()) {
          logic.deleteSelectedMissileWaypoint();
        } else if (logic.getSelection()) {
          logic.deleteSelectedShipWaypoint();
        }
        event.preventDefault();
        return;
      case "Escape": {
        if (uiState.helpVisible) {
          ui.setHelpVisible(false);
        } else if (logic.getMissileSelection()) {
          logic.setMissileSelection(null);
        } else if (logic.getSelection()) {
          logic.setSelection(null);
        } else if (uiState.inputContext === "missile") {
          ui.setInputContext("ship");
        }
        event.preventDefault();
        return;
      }
      case "Equal":
      case "NumpadAdd": {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        camera.setZoom(uiState.zoom * 1.2, centerX, centerY);
        event.preventDefault();
        return;
      }
      case "Minus":
      case "NumpadSubtract": {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        camera.setZoom(uiState.zoom / 1.2, centerX, centerY);
        event.preventDefault();
        return;
      }
      case "Digit0":
      case "Numpad0":
        if (event.ctrlKey || event.metaKey) {
          camera.setZoom(1.0);
          event.preventDefault();
        }
        return;
      default:
        break;
    }

    if (event.key === "?") {
      ui.setHelpVisible(!uiState.helpVisible);
      event.preventDefault();
    }
  }

  function bindInput(): void {
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerup", onCanvasPointerUp);
    canvas.addEventListener("pointercancel", onCanvasPointerUp);
    canvas.addEventListener("wheel", onCanvasWheel, { passive: false });
    canvas.addEventListener("touchstart", onCanvasTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onCanvasTouchMove, { passive: false });
    canvas.addEventListener("touchend", onCanvasTouchEnd, { passive: false });
    window.addEventListener("keydown", onWindowKeyDown, { capture: false });

    bus.on("context:changed", () => {
      if (pendingTouchTimeout !== null) {
        clearTimeout(pendingTouchTimeout);
        pendingTouchTimeout = null;
      }
    });
  }

  return {
    bindInput,
  };
}
