import type { EventBus } from "./bus";
import { getApproxServerNow, sendMessage } from "./net";
import {
  type ActiveTool,
  type AppState,
  type MissileRoute,
  type MissileSelection,
  type Selection,
  type UIState,
  clamp,
  sanitizeMissileConfig,
  MISSILE_PRESETS,
} from "./state";
import {
  MISSILE_MIN_SPEED,
  MISSILE_MAX_SPEED,
  MISSILE_MIN_AGRO,
} from "./state";
import {
  buildRoutePoints,
  hitTestRouteGeneric,
  updateDashOffsetsForRoute,
  projectRouteHeat,
  drawPlannedRoute,
  SHIP_PALETTE,
  MISSILE_PALETTE,
  WAYPOINT_HIT_RADIUS,
  type RoutePoints,
  type HeatProjectionParams,
} from "./route";

interface InitGameOptions {
  state: AppState;
  uiState: UIState;
  bus: EventBus;
}

interface GameController {
  onStateUpdated(): void;
}

let stateRef: AppState;
let uiStateRef: UIState;
let busRef: EventBus;

let cv: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let HPspan: HTMLElement | null = null;
let killsSpan: HTMLElement | null = null;
let shipControlsCard: HTMLElement | null = null;
let shipClearBtn: HTMLButtonElement | null = null;
let shipSetBtn: HTMLButtonElement | null = null;
let shipSelectBtn: HTMLButtonElement | null = null;
let shipRoutesContainer: HTMLElement | null = null;
let shipRouteLeg: HTMLElement | null = null;
let shipRouteSpeed: HTMLElement | null = null;
let shipDeleteBtn: HTMLButtonElement | null = null;
let shipSpeedCard: HTMLElement | null = null;
let shipSpeedSlider: HTMLInputElement | null = null;
let shipSpeedValue: HTMLElement | null = null;
let missileSpeedMarker: HTMLElement | null = null;

let missileControlsCard: HTMLElement | null = null;
let missileAddRouteBtn: HTMLButtonElement | null = null;
let missileLaunchBtn: HTMLButtonElement | null = null;
let missileLaunchText: HTMLElement | null = null;
let missileLaunchInfo: HTMLElement | null = null;
let missileSetBtn: HTMLButtonElement | null = null;
let missileSelectBtn: HTMLButtonElement | null = null;
let missileDeleteBtn: HTMLButtonElement | null = null;
let missileSpeedCard: HTMLElement | null = null;
let missileSpeedSlider: HTMLInputElement | null = null;
let missileSpeedValue: HTMLElement | null = null;
let missileAgroCard: HTMLElement | null = null;
let missileAgroSlider: HTMLInputElement | null = null;
let missileAgroValue: HTMLElement | null = null;
let spawnBotBtn: HTMLButtonElement | null = null;
let spawnBotText: HTMLElement | null = null;

let routePrevBtn: HTMLButtonElement | null = null;
let routeNextBtn: HTMLButtonElement | null = null;
let routeMenuToggle: HTMLButtonElement | null = null;
let routeMenu: HTMLElement | null = null;
let renameMissileRouteBtn: HTMLButtonElement | null = null;
let deleteMissileRouteBtn: HTMLButtonElement | null = null;
let clearMissileWaypointsBtn: HTMLButtonElement | null = null;
let missileRouteNameLabel: HTMLElement | null = null;
let missileRouteCountLabel: HTMLElement | null = null;

let helpToggle: HTMLButtonElement | null = null;
let helpOverlay: HTMLElement | null = null;
let helpCloseBtn: HTMLButtonElement | null = null;
let helpText: HTMLElement | null = null;

let heatBarFill: HTMLElement | null = null;
let heatBarPlanned: HTMLElement | null = null;
let heatValueText: HTMLElement | null = null;
let speedMarker: HTMLElement | null = null;
let stallOverlay: HTMLElement | null = null;
let markerAligned = false;
let heatWarnActive = false;
let stallActive = false;
let dualMeterAlert = false;

let selection: Selection | null = null;
let missileSelection: MissileSelection | null = null;
let defaultSpeed = 150;
let lastMissileLegSpeed = 0;
let lastLoopTs: number | null = null;
let lastMissileConfigSent: { speed: number; agroRadius: number } | null = null;
const shipLegDashOffsets = new Map<number, number>();
const missileLegDashOffsets = new Map<number, number>();
let lastMissileLaunchTextHTML = "";
let lastMissileLaunchInfoHTML = "";
let lastTouchDistance: number | null = null;
let pendingTouchTimeout: ReturnType<typeof setTimeout> | null = null;
let isPinching = false;

// Waypoint dragging state
let draggedWaypoint: number | null = null;
let dragStartPos: { x: number; y: number } | null = null;
let draggedMissileWaypoint: number | null = null;

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 3.0;

const HELP_TEXT = [
  "Primary Modes",
  "  1 – Toggle ship navigation mode",
  "  2 – Toggle missile coordination mode",
  "",
  "Ship Navigation",
  "  T – Switch between set/select",
  "  C – Clear all waypoints",
  "  H – Hold (clear waypoints & stop)",
  "  R – Toggle show route",
  "  [ / ] – Adjust waypoint speed",
  "  Shift+[ / ] – Coarse speed adjust",
  "  Tab / Shift+Tab – Cycle waypoints",
  "  Delete – Delete from selected waypoint",
  "",
  "Missile Coordination",
  "  N – Add new missile route",
  "  L – Launch missiles",
  "  E – Switch between set/select",
  "  , / . – Adjust agro radius",
  "  ; / ' – Adjust missile speed",
  "  Shift+slider keys – Coarse adjust",
  "  Delete – Delete selected missile waypoint",
  "",
  "Map Controls",
  "  +/- – Zoom in/out",
  "  Ctrl+0 – Reset zoom",
  "  Mouse wheel – Zoom at cursor",
  "  Pinch – Zoom on touch devices",
  "",
  "General",
  "  ? – Toggle this overlay",
  "  Esc – Cancel selection or close overlay",
].join("\n");

const world = { w: 8000, h: 4500 };

export function initGame({ state, uiState, bus }: InitGameOptions): GameController {
  stateRef = state;
  uiStateRef = uiState;
  busRef = bus;

  cacheDom();
  if (!cv) {
    throw new Error("Canvas element #cv not found");
  }
  ctx = cv.getContext("2d");

  bindListeners();
  syncMissileUIFromState();
  updateControlHighlights();
  refreshShipSelectionUI();
  refreshMissileSelectionUI();
  updateHelpOverlay();
  updateStatusIndicators();
  requestAnimationFrame(loop);

  return {
    onStateUpdated() {
      syncMissileUIFromState();
      refreshShipSelectionUI();
      refreshMissileSelectionUI();
      updateMissileLaunchButtonState();
      updateStatusIndicators();
    },
  };
}

function cacheDom(): void {
  cv = document.getElementById("cv") as HTMLCanvasElement | null;
  ctx = cv?.getContext("2d") ?? null;
  HPspan = document.getElementById("ship-hp");
  shipControlsCard = document.getElementById("ship-controls");
  shipClearBtn = document.getElementById("ship-clear") as HTMLButtonElement | null;
  shipSetBtn = document.getElementById("ship-set") as HTMLButtonElement | null;
  shipSelectBtn = document.getElementById("ship-select") as HTMLButtonElement | null;
  shipRoutesContainer = document.getElementById("ship-routes");
  shipRouteLeg = document.getElementById("ship-route-leg");
  shipRouteSpeed = document.getElementById("ship-route-speed");
  shipDeleteBtn = document.getElementById("ship-delete") as HTMLButtonElement | null;
  shipSpeedCard = document.getElementById("ship-speed-card");
  shipSpeedSlider = document.getElementById("ship-speed-slider") as HTMLInputElement | null;
  shipSpeedValue = document.getElementById("ship-speed-value");

  missileControlsCard = document.getElementById("missile-controls");
  missileAddRouteBtn = document.getElementById("missile-add-route") as HTMLButtonElement | null;
  missileLaunchBtn = document.getElementById("missile-launch") as HTMLButtonElement | null;
  missileLaunchText = document.getElementById("missile-launch-text");
  missileLaunchInfo = document.getElementById("missile-launch-info");
  missileSetBtn = document.getElementById("missile-set") as HTMLButtonElement | null;
  missileSelectBtn = document.getElementById("missile-select") as HTMLButtonElement | null;
  missileDeleteBtn = document.getElementById("missile-delete") as HTMLButtonElement | null;
  missileSpeedCard = document.getElementById("missile-speed-card");
  missileSpeedSlider = document.getElementById("missile-speed-slider") as HTMLInputElement | null;
  missileSpeedValue = document.getElementById("missile-speed-value");
  missileAgroCard = document.getElementById("missile-agro-card");
  missileAgroSlider = document.getElementById("missile-agro-slider") as HTMLInputElement | null;
  missileAgroValue = document.getElementById("missile-agro-value");

  spawnBotBtn = document.getElementById("spawn-bot") as HTMLButtonElement | null;
  spawnBotText = document.getElementById("spawn-bot-text");
  killsSpan = document.getElementById("ship-kills");
  routePrevBtn = document.getElementById("route-prev") as HTMLButtonElement | null;
  routeNextBtn = document.getElementById("route-next") as HTMLButtonElement | null;
  routeMenuToggle = document.getElementById("route-menu-toggle") as HTMLButtonElement | null;
  routeMenu = document.getElementById("route-menu");
  renameMissileRouteBtn = document.getElementById("rename-missile-route") as HTMLButtonElement | null;
  deleteMissileRouteBtn = document.getElementById("delete-missile-route") as HTMLButtonElement | null;
  clearMissileWaypointsBtn = document.getElementById("clear-missile-waypoints") as HTMLButtonElement | null;
  missileRouteNameLabel = document.getElementById("missile-route-name");
  missileRouteCountLabel = document.getElementById("missile-route-count");

  helpToggle = document.getElementById("help-toggle") as HTMLButtonElement | null;
  helpOverlay = document.getElementById("help-overlay");
  helpCloseBtn = document.getElementById("help-close") as HTMLButtonElement | null;
  helpText = document.getElementById("help-text");

  heatBarFill = document.getElementById("heat-bar-fill");
  heatBarPlanned = document.getElementById("heat-bar-planned");
  heatValueText = document.getElementById("heat-value-text");
  speedMarker = document.getElementById("speed-marker");
  missileSpeedMarker = document.getElementById("missile-speed-marker");
  stallOverlay = document.getElementById("stall-overlay");

  defaultSpeed = parseFloat(shipSpeedSlider?.value ?? "150");
  if (missileSpeedSlider) {
    missileSpeedSlider.disabled = false;
  }
}

function bindListeners(): void {
  if (!cv) return;
  cv.addEventListener("pointerdown", onCanvasPointerDown);
  cv.addEventListener("pointermove", onCanvasPointerMove);
  cv.addEventListener("pointerup", onCanvasPointerUp);
  cv.addEventListener("pointercancel", onCanvasPointerUp);
  cv.addEventListener("wheel", onCanvasWheel, { passive: false });
  cv.addEventListener("touchstart", onCanvasTouchStart, { passive: false });
  cv.addEventListener("touchmove", onCanvasTouchMove, { passive: false });
  cv.addEventListener("touchend", onCanvasTouchEnd, { passive: false });

  spawnBotBtn?.addEventListener("click", () => {
    if (spawnBotBtn.disabled) return;

    sendMessage({ type: "spawn_bot" });
    busRef.emit("bot:spawnRequested");

    // Disable button and update text
    spawnBotBtn.disabled = true;
    if (spawnBotText) {
      spawnBotText.textContent = "Spawned";
    }

    // Re-enable after 5 seconds
    setTimeout(() => {
      if (spawnBotBtn) {
        spawnBotBtn.disabled = false;
      }
      if (spawnBotText) {
        spawnBotText.textContent = "Bot";
      }
    }, 5000);
  });

  shipClearBtn?.addEventListener("click", () => {
    setInputContext("ship");
    clearShipRoute();
    busRef.emit("ship:clearInvoked");
  });

  shipSetBtn?.addEventListener("click", () => {
    setActiveTool("ship-set");
  });

  shipSelectBtn?.addEventListener("click", () => {
    setActiveTool("ship-select");
  });

  shipSpeedSlider?.addEventListener("input", (event) => {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    updateSpeedLabel(value);
    defaultSpeed = value;
    if (selection && stateRef.me && Array.isArray(stateRef.me.waypoints) && stateRef.me.waypoints[selection.index]) {
      sendMessage({ type: "update_waypoint", index: selection.index, speed: value });
      stateRef.me.waypoints[selection.index].speed = value;
      refreshShipSelectionUI();
      updatePlannedHeatBar();
    }
    const heat = stateRef.me?.heat;
    if (heat) {
      const tolerance = Math.max(5, heat.markerSpeed * 0.02);
      const diff = Math.abs(value - heat.markerSpeed);
      const inRange = diff <= tolerance;
      if (inRange && !markerAligned) {
        markerAligned = true;
        busRef.emit("heat:markerAligned", { value, marker: heat.markerSpeed });
      } else if (!inRange && markerAligned) {
        markerAligned = false;
      }
    } else {
      markerAligned = false;
    }
    busRef.emit("ship:speedChanged", { value });
  });

  shipDeleteBtn?.addEventListener("click", () => {
    setInputContext("ship");
    deleteSelectedShipWaypoint();
  });

  missileAddRouteBtn?.addEventListener("click", () => {
    setInputContext("missile");
    sendMessage({ type: "add_missile_route" });
  });

  missileLaunchBtn?.addEventListener("click", () => {
    setInputContext("missile");
    launchActiveMissileRoute();
  });

  missileSetBtn?.addEventListener("click", () => {
    setActiveTool("missile-set");
  });

  missileSelectBtn?.addEventListener("click", () => {
    setActiveTool("missile-select");
  });

  missileDeleteBtn?.addEventListener("click", () => {
    setInputContext("missile");
    deleteSelectedMissileWaypoint();
    busRef.emit("missile:deleteInvoked");
  });

  missileSpeedSlider?.addEventListener("input", (event) => {
    const inputEl = event.target as HTMLInputElement;
    const rawValue = parseFloat(inputEl.value);
    if (!Number.isFinite(rawValue)) {
      updateMissileSpeedControls();
      return;
    }

    const minSpeed = stateRef.missileLimits.speedMin ?? MISSILE_MIN_SPEED;
    const maxSpeed = stateRef.missileLimits.speedMax ?? MISSILE_MAX_SPEED;
    const clampedValue = clamp(rawValue, minSpeed, maxSpeed);
    if (Math.abs(clampedValue - rawValue) > 1e-3) {
      inputEl.value = clampedValue.toFixed(0);
    }
    lastMissileLegSpeed = clampedValue;
    if (missileSpeedValue) {
      missileSpeedValue.textContent = `${clampedValue.toFixed(0)}`;
    }

    const route = getActiveMissileRoute();
    if (!route || !Array.isArray(route.waypoints)) {
      updateMissileSpeedControls();
      return;
    }

    if (
      missileSelection &&
      missileSelection.type === "waypoint" &&
      missileSelection.index >= 0 &&
      missileSelection.index < route.waypoints.length
    ) {
      const idx = missileSelection.index;
      route.waypoints[idx] = { ...route.waypoints[idx], speed: clampedValue };
      sendMessage({
        type: "update_missile_waypoint_speed",
        route_id: route.id,
        index: idx,
        speed: clampedValue,
      });
      busRef.emit("missile:speedChanged", { value: clampedValue, index: idx });
      renderMissileRouteControls();
    } else {
      updateMissileSpeedControls();
    }
  });

  missileAgroSlider?.addEventListener("input", (event) => {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    updateMissileConfigFromUI({ agroRadius: value });
    busRef.emit("missile:agroChanged", { value });
  });

  routePrevBtn?.addEventListener("click", () => cycleMissileRoute(-1));
  routeNextBtn?.addEventListener("click", () => cycleMissileRoute(1));

  routeMenuToggle?.addEventListener("click", () => {
    routeMenu?.classList.toggle("visible");
  });

  document.addEventListener("click", (event) => {
    if (!routeMenu || !routeMenu.classList.contains("visible")) return;
    if (event.target === routeMenuToggle) return;
    if (routeMenu.contains(event.target as Node)) return;
    routeMenu.classList.remove("visible");
  });

  renameMissileRouteBtn?.addEventListener("click", () => {
    routeMenu?.classList.remove("visible");
    const route = getActiveMissileRoute();
    if (!route) return;
    const name = window.prompt("Rename route", route.name || "");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    route.name = trimmed;
    renderMissileRouteControls();
    sendMessage({
      type: "rename_missile_route",
      route_id: route.id,
      route_name: trimmed,
    });
  });

  deleteMissileRouteBtn?.addEventListener("click", () => {
    routeMenu?.classList.remove("visible");
    const route = getActiveMissileRoute();
    if (!route) return;
    if (!window.confirm(`Delete ${route.name}?`)) return;
    const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
    if (routes.length <= 1) {
      route.waypoints = [];
    } else {
      stateRef.missileRoutes = routes.filter((r) => r.id !== route.id);
      const remaining = stateRef.missileRoutes;
      stateRef.activeMissileRouteId = remaining.length > 0 ? remaining[0].id : null;
    }
    missileSelection = null;
    renderMissileRouteControls();
    refreshMissileSelectionUI();
    sendMessage({
      type: "delete_missile_route",
      route_id: route.id,
    });
  });

  clearMissileWaypointsBtn?.addEventListener("click", () => {
    routeMenu?.classList.remove("visible");
    const route = getActiveMissileRoute();
    if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
      return;
    }
    sendMessage({
      type: "clear_missile_route",
      route_id: route.id,
    });
    route.waypoints = [];
    missileSelection = null;
    renderMissileRouteControls();
    refreshMissileSelectionUI();
  });

  helpToggle?.addEventListener("click", () => {
    setHelpVisible(true);
  });

  helpCloseBtn?.addEventListener("click", () => {
    setHelpVisible(false);
  });

  window.addEventListener("keydown", onWindowKeyDown, { capture: false });
}

function setZoom(newZoom: number, centerX?: number, centerY?: number): void {
  uiStateRef.zoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
}

function onCanvasWheel(event: WheelEvent): void {
  if (!cv) return;
  event.preventDefault();

  const rect = cv.getBoundingClientRect();
  const centerX = event.clientX - rect.left;
  const centerY = event.clientY - rect.top;

  const delta = event.deltaY;
  const zoomFactor = delta > 0 ? 0.9 : 1.1;
  const newZoom = uiStateRef.zoom * zoomFactor;

  const scaleX = cv.width / rect.width;
  const scaleY = cv.height / rect.height;
  const canvasCenterX = centerX * scaleX;
  const canvasCenterY = centerY * scaleY;

  setZoom(newZoom, canvasCenterX, canvasCenterY);
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
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

function onCanvasTouchStart(event: TouchEvent): void {
  if (event.touches.length === 2) {
    event.preventDefault();
    isPinching = true;
    lastTouchDistance = getTouchDistance(event.touches);

    // Cancel any pending waypoint placement
    if (pendingTouchTimeout !== null) {
      clearTimeout(pendingTouchTimeout);
      pendingTouchTimeout = null;
    }
  }
}

function onCanvasTouchMove(event: TouchEvent): void {
  if (!cv || event.touches.length !== 2) {
    lastTouchDistance = null;
    return;
  }

  event.preventDefault();
  const currentDistance = getTouchDistance(event.touches);
  if (currentDistance === null || lastTouchDistance === null) return;

  const rect = cv.getBoundingClientRect();
  const center = getTouchCenter(event.touches);
  if (!center) return;

  const scaleX = cv.width / rect.width;
  const scaleY = cv.height / rect.height;
  const canvasCenterX = (center.x - rect.left) * scaleX;
  const canvasCenterY = (center.y - rect.top) * scaleY;

  const zoomFactor = currentDistance / lastTouchDistance;
  const newZoom = uiStateRef.zoom * zoomFactor;

  setZoom(newZoom, canvasCenterX, canvasCenterY);
  lastTouchDistance = currentDistance;
}

function onCanvasTouchEnd(event: TouchEvent): void {
  if (event.touches.length < 2) {
    lastTouchDistance = null;
    // Reset pinching flag after a short delay to prevent waypoint placement
    setTimeout(() => {
      isPinching = false;
    }, 100);
  }
}

function onCanvasPointerDown(event: PointerEvent): void {
  if (!cv || !ctx) return;
  if (helpOverlay?.classList.contains("visible")) {
    return;
  }
  if (lastTouchDistance !== null || isPinching) {
    return;
  }

  const rect = cv.getBoundingClientRect();
  const scaleX = rect.width !== 0 ? cv.width / rect.width : 1;
  const scaleY = rect.height !== 0 ? cv.height / rect.height : 1;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const canvasPoint = { x, y };
  const worldPoint = canvasToWorld(canvasPoint);

  const context = uiStateRef.inputContext === "missile" ? "missile" : "ship";

  // Check if clicking on waypoint for dragging (ship mode + select tool)
  if (context === "ship" && uiStateRef.shipTool === "select" && stateRef.me?.waypoints) {
    const wpIndex = findWaypointAtPosition(canvasPoint);
    if (wpIndex !== null) {
      draggedWaypoint = wpIndex;
      dragStartPos = { x: canvasPoint.x, y: canvasPoint.y };
      cv.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
  }

  if (context === "missile" && uiStateRef.missileTool === "select") {
    const hit = hitTestMissileRoutes(canvasPoint);
    if (hit) {
      setInputContext("missile");
      const { route, selection: missileSel } = hit;
      setMissileSelection(missileSel, route.id);
      renderMissileRouteControls();
      if (missileSel.type === "waypoint") {
        draggedMissileWaypoint = missileSel.index;
        dragStartPos = { x: canvasPoint.x, y: canvasPoint.y };
        cv.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      return;
    }
    setMissileSelection(null);
    renderMissileRouteControls();
  }

  // For touch events, delay waypoint placement to allow for pinch gesture detection
  // For mouse events, place immediately
  if (event.pointerType === "touch") {
    if (pendingTouchTimeout !== null) {
      clearTimeout(pendingTouchTimeout);
    }

    pendingTouchTimeout = setTimeout(() => {
      if (isPinching) return; // Double-check we're not pinching

      if (context === "missile") {
        handleMissilePointer(canvasPoint, worldPoint);
      } else {
        handleShipPointer(canvasPoint, worldPoint);
      }
      pendingTouchTimeout = null;
    }, 150); // 150ms delay to detect pinch gesture
  } else {
    // Mouse/pen: immediate placement
    if (context === "missile") {
      handleMissilePointer(canvasPoint, worldPoint);
    } else {
      handleShipPointer(canvasPoint, worldPoint);
    }
  }

  event.preventDefault();
}

function onCanvasPointerMove(event: PointerEvent): void {
  if (!cv || !ctx) return;

  const draggingShip = draggedWaypoint !== null && dragStartPos;
  const draggingMissile = draggedMissileWaypoint !== null && dragStartPos;

  if (!draggingShip && !draggingMissile) {
    return;
  }

  const rect = cv.getBoundingClientRect();
  const scaleX = rect.width !== 0 ? cv.width / rect.width : 1;
  const scaleY = rect.height !== 0 ? cv.height / rect.height : 1;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const canvasPoint = { x, y };
  const worldPoint = canvasToWorld(canvasPoint);

  // Clamp to world bounds
  const worldW = stateRef.worldMeta.w ?? 4000;
  const worldH = stateRef.worldMeta.h ?? 4000;
  const clampedX = clamp(worldPoint.x, 0, worldW);
  const clampedY = clamp(worldPoint.y, 0, worldH);

  if (draggingShip && draggedWaypoint !== null) {
    sendMessage({
      type: "move_waypoint",
      index: draggedWaypoint,
      x: clampedX,
      y: clampedY,
    });

    if (stateRef.me && stateRef.me.waypoints && draggedWaypoint < stateRef.me.waypoints.length) {
      stateRef.me.waypoints[draggedWaypoint].x = clampedX;
      stateRef.me.waypoints[draggedWaypoint].y = clampedY;
    }
    event.preventDefault();
    return;
  }

  if (draggingMissile && draggedMissileWaypoint !== null) {
    const route = getActiveMissileRoute();
    if (route && Array.isArray(route.waypoints) && draggedMissileWaypoint < route.waypoints.length) {
      sendMessage({
        type: "move_missile_waypoint",
        route_id: route.id,
        index: draggedMissileWaypoint,
        x: clampedX,
        y: clampedY,
      });

      route.waypoints = route.waypoints.map((wp, idx) =>
        idx === draggedMissileWaypoint ? { ...wp, x: clampedX, y: clampedY } : wp
      );
      renderMissileRouteControls();
    }
    event.preventDefault();
  }
}

function onCanvasPointerUp(event: PointerEvent): void {
  let released = false;

  if (draggedWaypoint !== null && stateRef.me?.waypoints) {
    const wp = stateRef.me.waypoints[draggedWaypoint];
    if (wp) {
      busRef.emit("ship:waypointMoved", {
        index: draggedWaypoint,
        x: wp.x,
        y: wp.y,
      });
    }
    draggedWaypoint = null;
    released = true;
  }

  if (draggedMissileWaypoint !== null) {
    const route = getActiveMissileRoute();
    if (route && route.waypoints && draggedMissileWaypoint < route.waypoints.length) {
      const wp = route.waypoints[draggedMissileWaypoint];
      busRef.emit("missile:waypointMoved", {
        routeId: route.id,
        index: draggedMissileWaypoint,
        x: wp.x,
        y: wp.y,
      });
    }
    draggedMissileWaypoint = null;
    released = true;
  }

  dragStartPos = null;

  if (released && cv) {
    cv.releasePointerCapture(event.pointerId);
  }
}

function updateSpeedLabel(value: number): void {
  if (shipSpeedValue) {
    shipSpeedValue.textContent = Number(value).toFixed(0);
  }
}

function setShipSliderValue(value: number): void {
  if (!shipSpeedSlider) return;
  shipSpeedSlider.value = String(value);
  updateSpeedLabel(value);
}

function ensureActiveMissileRoute(): MissileRoute | null {
  const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
  if (routes.length === 0) {
    stateRef.activeMissileRouteId = null;
    return null;
  }
  if (!stateRef.activeMissileRouteId || !routes.some((route) => route.id === stateRef.activeMissileRouteId)) {
    stateRef.activeMissileRouteId = routes[0].id;
  }
  return routes.find((route) => route.id === stateRef.activeMissileRouteId) ?? null;
}

function getActiveMissileRoute(): MissileRoute | null {
  return ensureActiveMissileRoute();
}

function renderMissileRouteControls(): void {
  const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
  const activeRoute = getActiveMissileRoute();
  if (missileRouteNameLabel) {
    if (!activeRoute) {
      missileRouteNameLabel.textContent = routes.length === 0 ? "No route" : "Route";
    } else {
      missileRouteNameLabel.textContent = activeRoute.name || "Route";
    }
  }

  if (missileRouteCountLabel) {
    const count = activeRoute && Array.isArray(activeRoute.waypoints) ? activeRoute.waypoints.length : 0;
    missileRouteCountLabel.textContent = `${count} pts`;
  }

  if (deleteMissileRouteBtn) {
    deleteMissileRouteBtn.disabled = routes.length <= 1;
  }
  if (renameMissileRouteBtn) {
    renameMissileRouteBtn.disabled = !activeRoute;
  }
  if (clearMissileWaypointsBtn) {
    const count = activeRoute && Array.isArray(activeRoute.waypoints) ? activeRoute.waypoints.length : 0;
    clearMissileWaypointsBtn.disabled = !activeRoute || count === 0;
  }
  if (routePrevBtn) {
    routePrevBtn.disabled = routes.length <= 1;
  }
  if (routeNextBtn) {
    routeNextBtn.disabled = routes.length <= 1;
  }

  updateMissileLaunchButtonState();
  refreshMissileSelectionUI();
}

function syncMissileUIFromState(): void {
  ensureActiveMissileRoute();
  const activeRoute = getActiveMissileRoute();
  const routeHasSelection =
    !!activeRoute &&
    Array.isArray(activeRoute.waypoints) &&
    !!missileSelection &&
    missileSelection.index >= 0 &&
    missileSelection.index < activeRoute.waypoints.length;
  if (!routeHasSelection) {
    missileSelection = null;
  }
  const cfg = stateRef.missileConfig;
  applyMissileUI(cfg);
  renderMissileRouteControls();
  refreshMissileSelectionUI();
}

function applyMissileUI(cfg: { speed: number; agroRadius: number }): void {
  if (missileAgroSlider) {
    const minAgro = stateRef.missileLimits.agroMin ?? MISSILE_MIN_AGRO;
    const maxAgro = Math.max(5000, Math.ceil((cfg.agroRadius + 500) / 500) * 500);
    missileAgroSlider.min = String(minAgro);
    missileAgroSlider.max = String(maxAgro);
    missileAgroSlider.value = cfg.agroRadius.toFixed(0);
  }
  if (missileAgroValue) {
    missileAgroValue.textContent = cfg.agroRadius.toFixed(0);
  }
  if (!lastMissileLegSpeed || lastMissileLegSpeed <= 0) {
    lastMissileLegSpeed = cfg.speed;
  }
  updateMissileSpeedControls();
}

function updateMissileConfigFromUI(overrides: Partial<{ agroRadius: number }> = {}): void {
  const current = stateRef.missileConfig;
  const cfg = sanitizeMissileConfig(
    {
      speed: current.speed,
      agroRadius: overrides.agroRadius ?? current.agroRadius,
    },
    current,
    stateRef.missileLimits,
  );
  stateRef.missileConfig = cfg;
  applyMissileUI(cfg);
  const last = lastMissileConfigSent;
  const needsSend =
    !last ||
    Math.abs((last.agroRadius ?? 0) - cfg.agroRadius) > 5;
  if (needsSend) {
    sendMissileConfig(cfg);
  }
  renderMissileRouteControls();
  updateSpeedMarker();
}

function sendMissileConfig(cfg: { speed: number; agroRadius: number }): void {
  lastMissileConfigSent = {
    speed: cfg.speed,
    agroRadius: cfg.agroRadius,
  };
  sendMessage({
    type: "configure_missile",
    missile_speed: cfg.speed,
    missile_agro: cfg.agroRadius,
  });
}

function refreshShipSelectionUI(): void {
  if (!shipRoutesContainer || !shipRouteLeg || !shipRouteSpeed || !shipDeleteBtn) {
    return;
  }
  const wps = stateRef.me && Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
  const hasValidSelection = selection !== null && selection.index >= 0 && selection.index < wps.length;
  const isShipContext = uiStateRef.inputContext === "ship";

  shipRoutesContainer.style.display = "flex";
  shipRoutesContainer.style.opacity = isShipContext ? "1" : "0.6";

  if (!stateRef.me || !hasValidSelection) {
    shipRouteLeg.textContent = "";
    shipRouteSpeed.textContent = "";
    shipDeleteBtn.disabled = true;
    if (isShipContext) {
      setShipSliderValue(defaultSpeed);
    }
    return;
  }

  if (selection !== null) {
    const wp = wps[selection.index];
    const speed = wp && typeof wp.speed === "number" ? wp.speed : defaultSpeed;
    if (isShipContext && shipSpeedSlider && Math.abs(parseFloat(shipSpeedSlider.value) - speed) > 0.25) {
      setShipSliderValue(speed);
    } else {
      updateSpeedLabel(speed);
    }
    const displayIndex = selection.index + 1;
    shipRouteLeg.textContent = `${displayIndex}`;
    shipRouteSpeed.textContent = `${speed.toFixed(0)} u/s`;
    shipDeleteBtn.disabled = !isShipContext;
  }
}

function refreshMissileSelectionUI(): void {
  const route = getActiveMissileRoute();
  const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
  const isWaypointSelection =
    missileSelection !== null &&
    missileSelection !== undefined &&
    missileSelection.type === "waypoint" &&
    missileSelection.index >= 0 &&
    missileSelection.index < count;
  if (missileDeleteBtn) {
    missileDeleteBtn.disabled = !isWaypointSelection;
  }
  updateMissileSpeedControls();
}

function updateMissileSpeedControls(): void {
  if (!missileSpeedSlider || !missileSpeedValue) {
    return;
  }

  const minSpeed = stateRef.missileLimits.speedMin ?? MISSILE_MIN_SPEED;
  const maxSpeed = stateRef.missileLimits.speedMax ?? MISSILE_MAX_SPEED;
  missileSpeedSlider.min = String(minSpeed);
  missileSpeedSlider.max = String(maxSpeed);

  const route = getActiveMissileRoute();
  let sliderValue: number | null = null;

  if (
    route &&
    missileSelection &&
    missileSelection.type === "waypoint" &&
    Array.isArray(route.waypoints) &&
    missileSelection.index >= 0 &&
    missileSelection.index < route.waypoints.length
  ) {
    const wp = route.waypoints[missileSelection.index];
    const value = typeof wp.speed === "number" && wp.speed > 0 ? wp.speed : stateRef.missileConfig.speed;
    sliderValue = clamp(value, minSpeed, maxSpeed);
    if (sliderValue > 0) {
      lastMissileLegSpeed = sliderValue;
    }
  }

  if (sliderValue === null) {
    const rawValue = parseFloat(missileSpeedSlider.value);
    const fallback = lastMissileLegSpeed > 0 ? lastMissileLegSpeed : stateRef.missileConfig.speed;
    const targetValue = Number.isFinite(rawValue) ? rawValue : fallback;
    sliderValue = clamp(targetValue, minSpeed, maxSpeed);
  }

  missileSpeedSlider.disabled = false;
  missileSpeedSlider.value = sliderValue.toFixed(0);
  missileSpeedValue.textContent = `${sliderValue.toFixed(0)}`;

  if (sliderValue > 0) {
    lastMissileLegSpeed = sliderValue;
  }
}

function setSelection(sel: Selection | null): void {
  selection = sel;
  refreshShipSelectionUI();
  const index = selection ? selection.index : null;
  busRef.emit("ship:legSelected", { index });
}

function setMissileSelection(sel: MissileSelection | null, routeId?: string): void {
  missileSelection = sel;
  if (routeId) {
    stateRef.activeMissileRouteId = routeId;
  }
  refreshMissileSelectionUI();
  updateMissileSpeedControls();
}

function handleShipPointer(canvasPoint: { x: number; y: number }, worldPoint: { x: number; y: number }): void {
  if (!stateRef.me) return;
  if (uiStateRef.shipTool === "select") {
    const hit = hitTestRoute(canvasPoint);
    // Convert display index to actual waypoint index
    if (hit) {
      const actualIndex = displayIndexToActualIndex(hit.index);
      setSelection({ type: hit.type, index: actualIndex });
    } else {
      setSelection(null);
    }
    return;
  }

  const wp = { x: worldPoint.x, y: worldPoint.y, speed: defaultSpeed };
  sendMessage({ type: "add_waypoint", x: wp.x, y: wp.y, speed: defaultSpeed });
  const wps = Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints.slice() : [];
  wps.push(wp);
  stateRef.me.waypoints = wps;
  busRef.emit("ship:waypointAdded", { index: wps.length - 1 });
  setSelection(null);
  updatePlannedHeatBar();
}

function getDefaultMissileLegSpeed(): number {
  const minSpeed = stateRef.missileLimits.speedMin ?? MISSILE_MIN_SPEED;
  const maxSpeed = stateRef.missileLimits.speedMax ?? MISSILE_MAX_SPEED;
  const base = lastMissileLegSpeed > 0 ? lastMissileLegSpeed : stateRef.missileConfig.speed;
  return clamp(base, minSpeed, maxSpeed);
}

function handleMissilePointer(canvasPoint: { x: number; y: number }, worldPoint: { x: number; y: number }): void {
  const route = getActiveMissileRoute();
  if (!route) return;

  if (uiStateRef.missileTool === "select") {
    const hit = hitTestMissileRoutes(canvasPoint);
    if (hit) {
      setMissileSelection(hit.selection, hit.route.id);
      renderMissileRouteControls();
    } else {
      setMissileSelection(null);
    }
    return;
  }

  const speed = getDefaultMissileLegSpeed();
  const wp = { x: worldPoint.x, y: worldPoint.y, speed };
  sendMessage({
    type: "add_missile_waypoint",
    route_id: route.id,
    x: wp.x,
    y: wp.y,
    speed: wp.speed,
  });
  route.waypoints = route.waypoints ? [...route.waypoints, wp] : [wp];
  lastMissileLegSpeed = speed;
  renderMissileRouteControls();
  setMissileSelection(null, route.id);
  busRef.emit("missile:waypointAdded", { routeId: route.id, index: route.waypoints.length - 1 });
}

function clearShipRoute(): void {
  const wps = stateRef.me && Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
  if (!wps || wps.length === 0) {
    return;
  }
  sendMessage({ type: "clear_waypoints" });
  if (stateRef.me) {
    stateRef.me.waypoints = [];
  }
  setSelection(null);
  busRef.emit("ship:waypointsCleared");
  updatePlannedHeatBar();
}

function deleteSelectedShipWaypoint(): void {
  if (!selection) return;
  sendMessage({ type: "delete_waypoint", index: selection.index });
  if (stateRef.me && Array.isArray(stateRef.me.waypoints)) {
    stateRef.me.waypoints = stateRef.me.waypoints.slice(0, selection.index);
  }
  busRef.emit("ship:waypointDeleted", { index: selection.index });
  setSelection(null);
  updatePlannedHeatBar();
}

function deleteSelectedMissileWaypoint(): void {
  const route = getActiveMissileRoute();
  if (!route || !missileSelection) return;
  const index = missileSelection.index;
  if (!Array.isArray(route.waypoints) || index < 0 || index >= route.waypoints.length) {
    return;
  }
  sendMessage({
    type: "delete_missile_waypoint",
    route_id: route.id,
    index,
  });
  route.waypoints = [...route.waypoints.slice(0, index), ...route.waypoints.slice(index + 1)];
  busRef.emit("missile:waypointDeleted", { routeId: route.id, index });
  setMissileSelection(null);
  renderMissileRouteControls();
}

function launchActiveMissileRoute(): void {
  if (missileLaunchBtn?.disabled) {
    return;
  }
  const route = getActiveMissileRoute();
  if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
    return;
  }
  busRef.emit("missile:launchRequested", { routeId: route.id });
  sendMessage({
    type: "launch_missile",
    route_id: route.id,
  });
}

function cycleMissileRoute(direction: number): void {
  const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
  if (routes.length === 0) {
    return;
  }
  const currentIndex = routes.findIndex((route) => route.id === stateRef.activeMissileRouteId);
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = ((baseIndex + direction) % routes.length + routes.length) % routes.length;
  const nextRoute = routes[nextIndex];
  if (!nextRoute) return;
  stateRef.activeMissileRouteId = nextRoute.id;
  setMissileSelection(null);
  renderMissileRouteControls();
  sendMessage({
    type: "set_active_missile_route",
    route_id: nextRoute.id,
  });
  busRef.emit("missile:activeRouteChanged", { routeId: nextRoute.id });
}

function cycleShipSelection(direction: number): void {
  const wps = stateRef.me && Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
  if (!wps || wps.length === 0) {
    setSelection(null);
    return;
  }
  let index = selection ? selection.index : direction > 0 ? -1 : wps.length;
  index += direction;
  if (index < 0) index = wps.length - 1;
  if (index >= wps.length) index = 0;
  setSelection({ type: "leg", index });
}

function setInputContext(context: "ship" | "missile"): void {
  const next = context === "missile" ? "missile" : "ship";
  if (uiStateRef.inputContext === next) {
    return;
  }
  uiStateRef.inputContext = next;

  // Also update activeTool to match the context to keep button states in sync
  if (next === "ship") {
    const shipToolToUse = uiStateRef.shipTool === "select" ? "ship-select" : "ship-set";
    if (uiStateRef.activeTool !== shipToolToUse) {
      uiStateRef.activeTool = shipToolToUse;
    }
  } else {
    const missileToolToUse = uiStateRef.missileTool === "select" ? "missile-select" : "missile-set";
    if (uiStateRef.activeTool !== missileToolToUse) {
      uiStateRef.activeTool = missileToolToUse;
    }
  }

  busRef.emit("context:changed", { context: next });
  updateControlHighlights();
  refreshShipSelectionUI();
  refreshMissileSelectionUI();
}

function setActiveTool(tool: ActiveTool): void {
  if (uiStateRef.activeTool === tool) {
    return;
  }

  uiStateRef.activeTool = tool;

  // Update backward compatibility states
  if (tool === "ship-set") {
    uiStateRef.shipTool = "set";
    uiStateRef.missileTool = null;
    setInputContext("ship");
    busRef.emit("ship:toolChanged", { tool: "set" });
  } else if (tool === "ship-select") {
    uiStateRef.shipTool = "select";
    uiStateRef.missileTool = null;
    setInputContext("ship");
    busRef.emit("ship:toolChanged", { tool: "select" });
  } else if (tool === "missile-set") {
    uiStateRef.shipTool = null;
    uiStateRef.missileTool = "set";
    setInputContext("missile");
    setMissileSelection(null);
    busRef.emit("missile:toolChanged", { tool: "set" });
  } else if (tool === "missile-select") {
    uiStateRef.shipTool = null;
    uiStateRef.missileTool = "select";
    setInputContext("missile");
    busRef.emit("missile:toolChanged", { tool: "select" });
  }

  updateControlHighlights();
}

function setButtonState(btn: HTMLButtonElement | null, active: boolean): void {
  if (!btn) return;
  if (active) {
    btn.dataset.state = "active";
    btn.setAttribute("aria-pressed", "true");
  } else {
    delete btn.dataset.state;
    btn.setAttribute("aria-pressed", "false");
  }
}

function updateControlHighlights(): void {
  setButtonState(shipSetBtn, uiStateRef.activeTool === "ship-set");
  setButtonState(shipSelectBtn, uiStateRef.activeTool === "ship-select");
  setButtonState(missileSetBtn, uiStateRef.activeTool === "missile-set");
  setButtonState(missileSelectBtn, uiStateRef.activeTool === "missile-select");

  if (shipControlsCard) {
    shipControlsCard.classList.toggle("active", uiStateRef.inputContext === "ship");
  }
  if (missileControlsCard) {
    missileControlsCard.classList.toggle("active", uiStateRef.inputContext === "missile");
  }
}

function setHelpVisible(flag: boolean): void {
  uiStateRef.helpVisible = Boolean(flag);
  updateHelpOverlay();
  busRef.emit("help:visibleChanged", { visible: uiStateRef.helpVisible });
}

function updateHelpOverlay(): void {
  if (!helpOverlay) return;
  if (helpText) {
    helpText.textContent = HELP_TEXT;
  }
  helpOverlay.classList.toggle("visible", uiStateRef.helpVisible);
}

function adjustSliderValue(input: HTMLInputElement | null, steps: number, coarse: boolean): number | null {
  if (!input) return null;
  const step = Math.abs(parseFloat(input.step)) || 1;
  const multiplier = coarse ? 4 : 1;
  const min = Number.isFinite(parseFloat(input.min)) ? parseFloat(input.min) : -Infinity;
  const max = Number.isFinite(parseFloat(input.max)) ? parseFloat(input.max) : Infinity;
  const current = parseFloat(input.value) || 0;
  let next = current + steps * step * multiplier;
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  if (Math.abs(next - current) < 1e-4) {
    return null;
  }
  input.value = String(next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return next;
}

function onWindowKeyDown(event: KeyboardEvent): void {
  const target = document.activeElement as HTMLElement | null;
  const isEditable = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

  if (uiStateRef.helpVisible && event.key !== "Escape") {
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
      setInputContext("ship");
      event.preventDefault();
      return;
    case "Digit2":
      setInputContext("missile");
      event.preventDefault();
      return;
    case "KeyT":
      if (uiStateRef.activeTool === "ship-set") {
        setActiveTool("ship-select");
      } else if (uiStateRef.activeTool === "ship-select") {
        setActiveTool("ship-set");
      } else {
        setActiveTool("ship-set");
      }
      event.preventDefault();
      return;
    case "KeyC":
      setInputContext("ship");
      clearShipRoute();
      event.preventDefault();
      return;
    case "KeyH":
      // H key: Hold position (clear all waypoints, stop ship)
      setInputContext("ship");
      clearShipRoute();
      event.preventDefault();
      return;
    case "BracketLeft":
      setInputContext("ship");
      adjustSliderValue(shipSpeedSlider, -1, event.shiftKey);
      event.preventDefault();
      return;
    case "BracketRight":
      setInputContext("ship");
      adjustSliderValue(shipSpeedSlider, 1, event.shiftKey);
      event.preventDefault();
      return;
    case "Tab":
      setInputContext("ship");
      cycleShipSelection(event.shiftKey ? -1 : 1);
      event.preventDefault();
      return;
    case "KeyN":
      setInputContext("missile");
      missileAddRouteBtn?.click();
      event.preventDefault();
      return;
    case "KeyL":
      setInputContext("missile");
      launchActiveMissileRoute();
      event.preventDefault();
      return;
    case "KeyE":
      if (uiStateRef.activeTool === "missile-set") {
        setActiveTool("missile-select");
      } else if (uiStateRef.activeTool === "missile-select") {
        setActiveTool("missile-set");
      } else {
        setActiveTool("missile-set");
      }
      event.preventDefault();
      return;
    case "Comma":
      setInputContext("missile");
      adjustSliderValue(missileAgroSlider, -1, event.shiftKey);
      event.preventDefault();
      return;
    case "Period":
      setInputContext("missile");
      adjustSliderValue(missileAgroSlider, 1, event.shiftKey);
      event.preventDefault();
      return;
    case "Semicolon":
      setInputContext("missile");
      if (missileSpeedSlider && !missileSpeedSlider.disabled) {
        adjustSliderValue(missileSpeedSlider, -1, event.shiftKey);
      }
      event.preventDefault();
      return;
    case "Quote":
      setInputContext("missile");
      if (missileSpeedSlider && !missileSpeedSlider.disabled) {
        adjustSliderValue(missileSpeedSlider, 1, event.shiftKey);
      }
      event.preventDefault();
      return;
    case "Delete":
    case "Backspace":
      if (uiStateRef.inputContext === "missile" && missileSelection) {
        deleteSelectedMissileWaypoint();
      } else if (selection) {
        deleteSelectedShipWaypoint();
      }
      event.preventDefault();
      return;
    case "Escape":
      if (uiStateRef.helpVisible) {
        setHelpVisible(false);
      } else if (missileSelection) {
        setMissileSelection(null);
      } else if (selection) {
        setSelection(null);
      } else if (uiStateRef.inputContext === "missile") {
        setInputContext("ship");
      }
      event.preventDefault();
      return;
    case "Equal":
    case "NumpadAdd":
      if (!cv) return;
      setZoom(uiStateRef.zoom * 1.2, cv.width / 2, cv.height / 2);
      event.preventDefault();
      return;
    case "Minus":
    case "NumpadSubtract":
      if (!cv) return;
      setZoom(uiStateRef.zoom / 1.2, cv.width / 2, cv.height / 2);
      event.preventDefault();
      return;
    case "Digit0":
    case "Numpad0":
      if (event.ctrlKey || event.metaKey) {
        uiStateRef.zoom = 1.0;
        event.preventDefault();
      }
      return;
    default:
      break;
  }

  if (event.key === "?") {
    setHelpVisible(!uiStateRef.helpVisible);
    event.preventDefault();
  }
}

function getCameraPosition(): { x: number; y: number } {
  if (!cv) return { x: world.w / 2, y: world.h / 2 };

  const zoom = uiStateRef.zoom;

  // Camera follows ship, or defaults to world center
  let cameraX = stateRef.me ? stateRef.me.x : world.w / 2;
  let cameraY = stateRef.me ? stateRef.me.y : world.h / 2;

  // Calculate visible world area at current zoom using uniform scale
  const scaleX = cv.width / world.w;
  const scaleY = cv.height / world.h;
  const scale = Math.min(scaleX, scaleY) * zoom;

  // World units visible on screen
  const viewportWidth = cv.width / scale;
  const viewportHeight = cv.height / scale;

  // Clamp camera to prevent zooming past world boundaries
  // When zoomed out, camera can't get closer to edges than half viewport
  const minCameraX = viewportWidth / 2;
  const maxCameraX = world.w - viewportWidth / 2;
  const minCameraY = viewportHeight / 2;
  const maxCameraY = world.h - viewportHeight / 2;

  // Always clamp camera to world boundaries
  // When viewport >= world dimensions, center the world on screen
  if (viewportWidth < world.w) {
    cameraX = clamp(cameraX, minCameraX, maxCameraX);
  } else {
    cameraX = world.w / 2;
  }

  if (viewportHeight < world.h) {
    cameraY = clamp(cameraY, minCameraY, maxCameraY);
  } else {
    cameraY = world.h / 2;
  }

  return { x: cameraX, y: cameraY };
}

function worldToCanvas(p: { x: number; y: number }): { x: number; y: number } {
  if (!cv) return { x: p.x, y: p.y };

  const zoom = uiStateRef.zoom;
  const camera = getCameraPosition();

  // World position relative to camera
  const worldX = p.x - camera.x;
  const worldY = p.y - camera.y;

  // Use uniform scale to maintain aspect ratio
  // Scale is pixels per world unit - choose the dimension that fits
  const scaleX = cv.width / world.w;
  const scaleY = cv.height / world.h;
  const scale = Math.min(scaleX, scaleY) * zoom;

  // Convert to canvas coordinates (centered on screen)
  return {
    x: worldX * scale + cv.width / 2,
    y: worldY * scale + cv.height / 2
  };
}

function canvasToWorld(p: { x: number; y: number }): { x: number; y: number } {
  if (!cv) return { x: p.x, y: p.y };

  const zoom = uiStateRef.zoom;
  const camera = getCameraPosition();

  // Canvas position relative to center
  const canvasX = p.x - cv.width / 2;
  const canvasY = p.y - cv.height / 2;

  // Use uniform scale to maintain aspect ratio
  const scaleX = cv.width / world.w;
  const scaleY = cv.height / world.h;
  const scale = Math.min(scaleX, scaleY) * zoom;

  // Convert to world coordinates (inverse of worldToCanvas)
  return {
    x: canvasX / scale + camera.x,
    y: canvasY / scale + camera.y
  };
}

// Get the offset for ship waypoint indices (how many waypoints have been passed)
function getShipWaypointOffset(): number {
  return stateRef.me?.currentWaypointIndex ?? 0;
}

// Convert a displayed waypoint index to the actual waypoint array index
function displayIndexToActualIndex(displayIndex: number): number {
  return displayIndex + getShipWaypointOffset();
}

// Convert an actual waypoint index to a displayed index (or -1 if waypoint has been passed)
function actualIndexToDisplayIndex(actualIndex: number): number {
  const offset = getShipWaypointOffset();
  return actualIndex >= offset ? actualIndex - offset : -1;
}

function computeRoutePoints(): RoutePoints | null {
  if (!stateRef.me) return null;
  const wps = Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
  // Filter waypoints to only show those that haven't been passed yet
  const currentIndex = getShipWaypointOffset();
  const visibleWps = currentIndex > 0 ? wps.slice(currentIndex) : wps;
  return buildRoutePoints(
    { x: stateRef.me.x, y: stateRef.me.y },
    visibleWps,
    world,
    getCameraPosition,
    () => uiStateRef.zoom,
    worldToCanvas
  );
}

function computeMissileRoutePoints(): RoutePoints | null {
  if (!stateRef.me) return null;
  const route = getActiveMissileRoute();
  const wps = route && Array.isArray(route.waypoints) ? route.waypoints : [];
  return buildRoutePoints(
    { x: stateRef.me.x, y: stateRef.me.y },
    wps,
    world,
    getCameraPosition,
    () => uiStateRef.zoom,
    worldToCanvas
  );
}

// Helper: Find waypoint at canvas position
function findWaypointAtPosition(canvasPoint: { x: number; y: number }): number | null {
  if (!stateRef.me?.waypoints) return null;

  const route = computeRoutePoints();
  if (!route || route.waypoints.length === 0) return null;

  // Check waypoints in reverse order (top to bottom visually)
  // Skip the first canvas point (ship position)
  for (let i = route.waypoints.length - 1; i >= 0; i--) {
    const waypointCanvas = route.canvasPoints[i + 1]; // +1 because first point is ship position
    const dx = canvasPoint.x - waypointCanvas.x;
    const dy = canvasPoint.y - waypointCanvas.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= WAYPOINT_HIT_RADIUS) {
      // Convert display index to actual waypoint index
      return displayIndexToActualIndex(i);
    }
  }

  return null;
}

function updateRouteAnimations(dtSeconds: number): void {
  if (!stateRef.me) {
    shipLegDashOffsets.clear();
    missileLegDashOffsets.clear();
    return;
  }

  if (uiStateRef.showShipRoute) {
    const shipRoute = computeRoutePoints();
    if (shipRoute && shipRoute.waypoints.length > 0) {
      updateDashOffsetsForRoute(shipLegDashOffsets, shipRoute.waypoints, shipRoute.worldPoints, shipRoute.canvasPoints, defaultSpeed, dtSeconds);
    } else {
      shipLegDashOffsets.clear();
    }
  } else {
    shipLegDashOffsets.clear();
  }

  const activeMissileRoute = getActiveMissileRoute();
  const missileRoutePoints = computeMissileRoutePoints();
  if (
    activeMissileRoute &&
    missileRoutePoints &&
    Array.isArray(activeMissileRoute.waypoints) &&
    activeMissileRoute.waypoints.length > 0
  ) {
    const fallbackSpeed = lastMissileLegSpeed > 0 ? lastMissileLegSpeed : stateRef.missileConfig.speed;
    updateDashOffsetsForRoute(
      missileLegDashOffsets,
      activeMissileRoute.waypoints,
      missileRoutePoints.worldPoints,
      missileRoutePoints.canvasPoints,
      fallbackSpeed,
      dtSeconds,
      64,
    );
  } else {
    missileLegDashOffsets.clear();
  }
}

function hitTestRoute(canvasPoint: { x: number; y: number }): Selection | null {
  const route = computeRoutePoints();
  if (!route || route.waypoints.length === 0) {
    return null;
  }
  return hitTestRouteGeneric(canvasPoint, route, {
    skipLegs: !uiStateRef.showShipRoute,
  });
}

function hitTestMissileRoutes(canvasPoint: { x: number; y: number }): { route: MissileRoute; selection: MissileSelection } | null {
  if (!stateRef.me) return null;
  const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
  if (routes.length === 0) return null;

  const shipPos = { x: stateRef.me.x, y: stateRef.me.y };

  let best: { route: MissileRoute; selection: MissileSelection; pointerDist: number; shipDist: number } | null = null;

  for (const route of routes) {
    const waypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
    if (waypoints.length === 0) {
      continue;
    }

    const routePoints = buildRoutePoints(
      shipPos,
      waypoints,
      world,
      getCameraPosition,
      () => uiStateRef.zoom,
      worldToCanvas
    );

    const hit = hitTestRouteGeneric(canvasPoint, routePoints, {
      waypointHitRadius: 16,
      legHitDistance: 10,
    });

    if (!hit) continue;

    // Calculate distances for best selection
    let pointerDist: number;
    let shipDist: number;

    if (hit.type === "waypoint") {
      // Distance from pointer to waypoint
      const wpCanvas = routePoints.canvasPoints[hit.index + 1];
      pointerDist = Math.hypot(canvasPoint.x - wpCanvas.x, canvasPoint.y - wpCanvas.y);
      // Distance from ship to waypoint
      const wpWorld = routePoints.worldPoints[hit.index + 1];
      shipDist = Math.hypot(wpWorld.x - shipPos.x, wpWorld.y - shipPos.y);
    } else {
      // hit.type === "leg"
      // Distance from pointer to leg (already calculated in hitTest, recalc for consistency)
      const { canvasPoints, worldPoints } = routePoints;
      pointerDist = Math.hypot(
        (canvasPoints[hit.index].x + canvasPoints[hit.index + 1].x) * 0.5 - canvasPoint.x,
        (canvasPoints[hit.index].y + canvasPoints[hit.index + 1].y) * 0.5 - canvasPoint.y
      );
      // Distance from ship to leg midpoint
      const midWorld = {
        x: (worldPoints[hit.index].x + worldPoints[hit.index + 1].x) * 0.5,
        y: (worldPoints[hit.index].y + worldPoints[hit.index + 1].y) * 0.5,
      };
      shipDist = Math.hypot(midWorld.x - shipPos.x, midWorld.y - shipPos.y);
    }

    // Check if this is the best hit so far
    if (
      !best ||
      pointerDist < best.pointerDist - 0.1 ||
      (Math.abs(pointerDist - best.pointerDist) <= 0.5 && shipDist < best.shipDist)
    ) {
      const selection: MissileSelection = hit.type === "waypoint"
        ? { type: "waypoint", index: hit.index }
        : { type: "route", index: hit.index };

      best = {
        route,
        selection,
        pointerDist,
        shipDist,
      };
    }
  }

  if (!best) {
    return null;
  }
  return { route: best.route, selection: best.selection };
}

function drawShip(x: number, y: number, vx: number, vy: number, color: string, filled: boolean): void {
  if (!ctx) return;
  const p = worldToCanvas({ x, y });
  const r = 10;
  ctx.save();
  ctx.translate(p.x, p.y);
  const angle = Math.atan2(vy, vx);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.7, r * 0.6);
  ctx.lineTo(-r * 0.4, 0);
  ctx.lineTo(-r * 0.7, -r * 0.6);
  ctx.closePath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  if (filled) {
    ctx.fillStyle = `${color}cc`;
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}

function drawGhostDot(x: number, y: number): void {
  if (!ctx) return;
  const p = worldToCanvas({ x, y });
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ccccccaa";
  ctx.fill();
}

function drawRoute(): void {
  if (!ctx || !stateRef.me) return;
  const route = computeRoutePoints();
  if (!route || route.waypoints.length === 0) return;

  const heat = stateRef.me.heat;
  const heatParams: HeatProjectionParams | undefined = heat
    ? {
        markerSpeed: heat.markerSpeed,
        kUp: heat.kUp,
        kDown: heat.kDown,
        exp: heat.exp,
        max: heat.max,
        overheatAt: heat.overheatAt,
        warnAt: heat.warnAt,
      }
    : undefined;

  // Convert selection from actual index to display index for rendering
  const displaySelection = selection ? {
    type: selection.type,
    index: actualIndexToDisplayIndex(selection.index)
  } : null;

  // Only show selection if the waypoint hasn't been passed
  const validSelection = displaySelection && displaySelection.index >= 0 ? displaySelection : null;

  // Convert draggedWaypoint index as well
  const displayDraggedWaypoint = draggedWaypoint !== null
    ? actualIndexToDisplayIndex(draggedWaypoint)
    : null;
  const validDraggedWaypoint = displayDraggedWaypoint !== null && displayDraggedWaypoint >= 0
    ? displayDraggedWaypoint
    : null;

  drawPlannedRoute(ctx, {
    routePoints: route,
    selection: validSelection,
    draggedWaypoint: validDraggedWaypoint,
    dashStore: shipLegDashOffsets,
    palette: SHIP_PALETTE,
    showLegs: uiStateRef.showShipRoute,
    heatParams,
    initialHeat: heat?.value ?? 0,
    defaultSpeed,
    worldPoints: route.worldPoints,
  });
}

function drawMissileRoute(): void {
  if (!ctx || !stateRef.me) return;
  if (uiStateRef.inputContext !== "missile") return;
  const route = computeMissileRoutePoints();
  if (!route || route.waypoints.length === 0) return;

  const heatParams: HeatProjectionParams | undefined = stateRef.missileConfig.heatParams;

  // Map MissileSelection (uses "route" for legs) to generic Selection (uses "leg" for legs)
  const genericSelection: { type: "waypoint" | "leg"; index: number } | null = missileSelection
    ? missileSelection.type === "route"
      ? { type: "leg", index: missileSelection.index }
      : { type: "waypoint", index: missileSelection.index }
    : null;

  drawPlannedRoute(ctx, {
    routePoints: route,
    selection: genericSelection,
    draggedWaypoint: null,
    dashStore: missileLegDashOffsets,
    palette: MISSILE_PALETTE,
    showLegs: true,
    heatParams,
    initialHeat: 0, // Missiles start at zero heat
    defaultSpeed: stateRef.missileConfig.speed,
    worldPoints: route.worldPoints,
  });
}

function drawMissiles(): void {
  if (!ctx || !stateRef.missiles || stateRef.missiles.length === 0 || !cv) return;
  const scaleX = cv.width / world.w;
  const scaleY = cv.height / world.h;
  const radiusScale = (scaleX + scaleY) / 2;
  for (const miss of stateRef.missiles) {
    const p = worldToCanvas({ x: miss.x, y: miss.y });
    const selfOwned = Boolean(miss.self);
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, selfOwned ? 6 : 5, 0, Math.PI * 2);
    ctx.fillStyle = selfOwned ? "#f87171" : "#fca5a5";
    ctx.globalAlpha = selfOwned ? 0.95 : 0.8;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#111827";
    ctx.stroke();
    ctx.restore();

    if (selfOwned && miss.agro_radius > 0) {
      ctx.save();
      ctx.beginPath();
      const rCanvas = miss.agro_radius * radiusScale;
      ctx.setLineDash([14, 10]);
      ctx.strokeStyle = "rgba(248,113,113,0.35)";
      ctx.lineWidth = 1.2;
      ctx.arc(p.x, p.y, rCanvas, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

  }
}

function drawGrid(): void {
  if (!ctx || !cv) return;
  ctx.save();
  ctx.strokeStyle = "#234";
  ctx.lineWidth = 1;

  const zoom = uiStateRef.zoom;
  let step = 1000;
  if (zoom < 0.7) {
    step = 2000;
  } else if (zoom > 1.5) {
    step = 500;
  } else if (zoom > 2.5) {
    step = 250;
  }

  const camera = getCameraPosition();

  // Calculate viewport using uniform scale (same as coordinate transforms)
  const scaleX = cv.width / world.w;
  const scaleY = cv.height / world.h;
  const scale = Math.min(scaleX, scaleY) * zoom;
  const viewportWidth = cv.width / scale;
  const viewportHeight = cv.height / scale;

  const minX = Math.max(0, camera.x - viewportWidth / 2);
  const maxX = Math.min(world.w, camera.x + viewportWidth / 2);
  const minY = Math.max(0, camera.y - viewportHeight / 2);
  const maxY = Math.min(world.h, camera.y + viewportHeight / 2);

  const startX = Math.floor(minX / step) * step;
  const endX = Math.ceil(maxX / step) * step;
  const startY = Math.floor(minY / step) * step;
  const endY = Math.ceil(maxY / step) * step;

  for (let x = startX; x <= endX; x += step) {
    const a = worldToCanvas({ x, y: Math.max(0, minY) });
    const b = worldToCanvas({ x, y: Math.min(world.h, maxY) });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = startY; y <= endY; y += step) {
    const a = worldToCanvas({ x: Math.max(0, minX), y });
    const b = worldToCanvas({ x: Math.min(world.w, maxX), y });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function updateMissileLaunchButtonState(): void {
  if (!missileLaunchBtn || !missileLaunchText || !missileLaunchInfo) return;
  const route = getActiveMissileRoute();
  const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
  const remaining = getMissileCooldownRemaining();
  const coolingDown = remaining > 0.05;
  const shouldDisable = !route || count === 0 || coolingDown;
  missileLaunchBtn.disabled = shouldDisable;

  const launchTextHTML = '<span class="btn-text-full">Launch</span><span class="btn-text-short">Fire</span>';
  let launchInfoHTML = "";

  if (!route) {
    launchInfoHTML = "";
  } else if (coolingDown) {
    launchInfoHTML = `${remaining.toFixed(1)}s`;
  } else if (route.name) {
    const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
    const routeIndex = routes.findIndex((r) => r.id === route.id) + 1;
    launchInfoHTML = `<span class="btn-text-full">${route.name}</span><span class="btn-text-short">${routeIndex}</span>`;
  } else {
    launchInfoHTML = "";
  }

  if (lastMissileLaunchTextHTML !== launchTextHTML) {
    missileLaunchText.innerHTML = launchTextHTML;
    lastMissileLaunchTextHTML = launchTextHTML;
  }

  if (lastMissileLaunchInfoHTML !== launchInfoHTML) {
    missileLaunchInfo.innerHTML = launchInfoHTML;
    lastMissileLaunchInfoHTML = launchInfoHTML;
  }
}

function getMissileCooldownRemaining(): number {
  const remaining = stateRef.nextMissileReadyAt - getApproxServerNow(stateRef);
  return remaining > 0 ? remaining : 0;
}

function updateStatusIndicators(): void {
  const meta = stateRef.worldMeta ?? {};
  const hasWidth = typeof meta.w === "number" && Number.isFinite(meta.w);
  const hasHeight = typeof meta.h === "number" && Number.isFinite(meta.h);

  if (hasWidth) {
    world.w = meta.w!;
  }
  if (hasHeight) {
    world.h = meta.h!;
  }
  if (HPspan) {
    if (stateRef.me && Number.isFinite(stateRef.me.hp)) {
      HPspan.textContent = Number(stateRef.me.hp).toString();
    } else {
      HPspan.textContent = "–";
    }
  }
  if (killsSpan) {
    if (stateRef.me && Number.isFinite(stateRef.me.kills)) {
      killsSpan.textContent = Number(stateRef.me.kills).toString();
    } else {
      killsSpan.textContent = "0";
    }
  }

  // Update heat bar
  updateHeatBar();
  // Update planned heat bar
  updatePlannedHeatBar();
  // Update speed marker position
  updateSpeedMarker();
  // Update stall overlay
  updateStallOverlay();
}

function updateHeatBar(): void {
  const heat = stateRef.me?.heat;
  if (!heat || !heatBarFill || !heatValueText) {
    heatWarnActive = false;
    return;
  }

  const percent = (heat.value / heat.max) * 100;
  heatBarFill.style.width = `${percent}%`;

  // Update text
  heatValueText.textContent = `Heat ${Math.round(heat.value)}`;

  // Update color classes
  heatBarFill.classList.remove("warn", "overheat");
  if (heat.value >= heat.overheatAt) {
    heatBarFill.classList.add("overheat");
  } else if (heat.value >= heat.warnAt) {
    heatBarFill.classList.add("warn");
  }

  const nowWarn = heat.value >= heat.warnAt;
  if (nowWarn && !heatWarnActive) {
    heatWarnActive = true;
    busRef.emit("heat:warnEntered", { value: heat.value, warnAt: heat.warnAt });
  } else if (!nowWarn && heatWarnActive) {
    const coolThreshold = Math.max(0, heat.warnAt - 5);
    if (heat.value <= coolThreshold) {
      heatWarnActive = false;
      busRef.emit("heat:cooledBelowWarn", { value: heat.value, warnAt: heat.warnAt });
    }
  }
}

function updatePlannedHeatBar(): void {
  const ship = stateRef.me;
  const plannedEl = heatBarPlanned;
  if (!ship || !ship.heat || !plannedEl) {
    dualMeterAlert = false;
    return;
  }

  const planned = projectPlannedHeat(ship);
  const actual = ship.heat.value;
  const percent = (planned / ship.heat.max) * 100;
  plannedEl.style.width = `${Math.max(0, Math.min(100, percent))}%`;

  const diff = planned - actual;
  const threshold = Math.max(8, ship.heat.warnAt * 0.1);
  if (diff >= threshold && !dualMeterAlert) {
    dualMeterAlert = true;
    busRef.emit("heat:dualMeterDiverged", { planned, actual });
  } else if (diff < threshold * 0.6 && dualMeterAlert) {
    dualMeterAlert = false;
  }
}

function projectPlannedHeat(ship: { x: number; y: number; waypoints: { x: number; y: number; speed?: number }[]; heat?: { value: number; max: number; markerSpeed: number; kUp: number; kDown: number; exp: number; warnAt: number; overheatAt: number } }): number {
  const heat = ship.heat!;

  // Build route from ship position and waypoints
  const route = [{ x: ship.x, y: ship.y, speed: undefined }, ...ship.waypoints];

  // Use shared heat projection
  const heatParams: HeatProjectionParams = {
    markerSpeed: heat.markerSpeed,
    kUp: heat.kUp,
    kDown: heat.kDown,
    exp: heat.exp,
    max: heat.max,
    overheatAt: heat.overheatAt,
    warnAt: heat.warnAt,
  };

  const projection = projectRouteHeat(route, heat.value, heatParams);

  // Return maximum heat along route
  return Math.max(...projection.heatAtWaypoints);
}

function updateSpeedMarker(): void {
  const shipHeat = stateRef.me?.heat;
  if (speedMarker && shipSpeedSlider && shipHeat && shipHeat.markerSpeed > 0) {
    const min = parseFloat(shipSpeedSlider.min);
    const max = parseFloat(shipSpeedSlider.max);
    const markerSpeed = shipHeat.markerSpeed;
    const percent = ((markerSpeed - min) / (max - min)) * 100;
    const clamped = Math.max(0, Math.min(100, percent));
    speedMarker.style.left = `${clamped}%`;
    speedMarker.title = `Heat neutral: ${Math.round(markerSpeed)} units/s`;
    speedMarker.style.display = "block";
  } else if (speedMarker) {
    speedMarker.style.display = "none";
  }

  if (missileSpeedMarker && missileSpeedSlider) {
    const heatParams = stateRef.missileConfig.heatParams;
    const markerSpeed =
      (heatParams && Number.isFinite(heatParams.markerSpeed) ? heatParams.markerSpeed : undefined) ??
      (shipHeat && shipHeat.markerSpeed > 0 ? shipHeat.markerSpeed : undefined);

    if (markerSpeed !== undefined && markerSpeed > 0) {
      const min = parseFloat(missileSpeedSlider.min);
      const max = parseFloat(missileSpeedSlider.max);
      const percent = ((markerSpeed - min) / (max - min)) * 100;
      const clamped = Math.max(0, Math.min(100, percent));
      missileSpeedMarker.style.left = `${clamped}%`;
      missileSpeedMarker.title = `Heat neutral: ${Math.round(markerSpeed)} units/s`;
      missileSpeedMarker.style.display = "block";
    } else {
      missileSpeedMarker.style.display = "none";
    }
  }
}

function updateStallOverlay(): void {
  const heat = stateRef.me?.heat;
  if (!heat || !stallOverlay) {
    stallActive = false;
    return;
  }

  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

  const isStalled = now < heat.stallUntilMs;

  if (isStalled) {
    stallOverlay.classList.add("visible");
    if (!stallActive) {
      stallActive = true;
      busRef.emit("heat:stallTriggered", { stallUntil: heat.stallUntilMs });
    }
  } else {
    stallOverlay.classList.remove("visible");
    if (stallActive) {
      stallActive = false;
      busRef.emit("heat:stallRecovered", { value: heat.value });
    }
  }
}

function loop(timestamp: number): void {
  if (!ctx || !cv) return;
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
  updateRouteAnimations(dtSeconds);

  ctx.clearRect(0, 0, cv.width, cv.height);
  drawGrid();
  drawRoute();
  drawMissileRoute();
  drawMissiles();

  updateMissileLaunchButtonState();

  for (const g of stateRef.ghosts) {
    drawShip(g.x, g.y, g.vx, g.vy, "#9ca3af", false);
    drawGhostDot(g.x, g.y);
  }
  if (stateRef.me) {
    drawShip(stateRef.me.x, stateRef.me.y, stateRef.me.vx, stateRef.me.vy, "#22d3ee", true);
  }
  requestAnimationFrame(loop);
}
