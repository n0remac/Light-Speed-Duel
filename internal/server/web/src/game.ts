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
} from "./state";
import {
  MISSILE_MIN_SPEED,
  MISSILE_MAX_SPEED,
  MISSILE_MIN_AGRO,
} from "./state";

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
let heatValueText: HTMLElement | null = null;
let speedMarker: HTMLElement | null = null;
let stallOverlay: HTMLElement | null = null;

let selection: Selection | null = null;
let missileSelection: MissileSelection | null = null;
let defaultSpeed = 150;
let lastLoopTs: number | null = null;
let lastMissileConfigSent: { speed: number; agroRadius: number } | null = null;
const legDashOffsets = new Map<number, number>();
let lastMissileLaunchTextHTML = "";
let lastMissileLaunchInfoHTML = "";
let lastTouchDistance: number | null = null;
let pendingTouchTimeout: ReturnType<typeof setTimeout> | null = null;
let isPinching = false;

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
  heatValueText = document.getElementById("heat-value-text");
  speedMarker = document.getElementById("speed-marker");
  stallOverlay = document.getElementById("stall-overlay");

  defaultSpeed = parseFloat(shipSpeedSlider?.value ?? "150");
}

function bindListeners(): void {
  if (!cv) return;
  cv.addEventListener("pointerdown", onCanvasPointerDown);
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
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    updateMissileConfigFromUI({ speed: value });
    busRef.emit("missile:speedChanged", { value });
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
  if (missileSpeedSlider) {
    const minSpeed = stateRef.missileLimits.speedMin ?? MISSILE_MIN_SPEED;
    const maxSpeed = stateRef.missileLimits.speedMax ?? MISSILE_MAX_SPEED;
    missileSpeedSlider.min = String(minSpeed);
    missileSpeedSlider.max = String(maxSpeed);
    missileSpeedSlider.value = cfg.speed.toFixed(0);
  }
  if (missileSpeedValue) {
    missileSpeedValue.textContent = cfg.speed.toFixed(0);
  }
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
}

function updateMissileConfigFromUI(overrides: Partial<{ speed: number; agroRadius: number }> = {}): void {
  const current = stateRef.missileConfig;
  const cfg = sanitizeMissileConfig({
    speed: overrides.speed ?? current.speed,
    agroRadius: overrides.agroRadius ?? current.agroRadius,
  }, current, stateRef.missileLimits);
  stateRef.missileConfig = cfg;
  applyMissileUI(cfg);
  const last = lastMissileConfigSent;
  const needsSend =
    !last ||
    Math.abs(last.speed - cfg.speed) > 0.25 ||
    Math.abs((last.agroRadius ?? 0) - cfg.agroRadius) > 5;
  if (needsSend) {
    sendMissileConfig(cfg);
  }
  renderMissileRouteControls();
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
  if (!missileDeleteBtn) return;
  const route = getActiveMissileRoute();
  const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
  const hasSelection = missileSelection !== null && missileSelection !== undefined && missileSelection.index >= 0 && missileSelection.index < count;
  missileDeleteBtn.disabled = !hasSelection;
}

function setSelection(sel: Selection | null): void {
  selection = sel;
  refreshShipSelectionUI();
  const index = selection ? selection.index : null;
  busRef.emit("ship:legSelected", { index });
}

function setMissileSelection(sel: MissileSelection | null): void {
  missileSelection = sel;
  refreshMissileSelectionUI();
}

function handleShipPointer(canvasPoint: { x: number; y: number }, worldPoint: { x: number; y: number }): void {
  if (!stateRef.me) return;
  if (uiStateRef.shipTool === "select") {
    const hit = hitTestRoute(canvasPoint);
    setSelection(hit ?? null);
    return;
  }

  const wp = { x: worldPoint.x, y: worldPoint.y, speed: defaultSpeed };
  sendMessage({ type: "add_waypoint", x: wp.x, y: wp.y, speed: defaultSpeed });
  const wps = Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints.slice() : [];
  wps.push(wp);
  stateRef.me.waypoints = wps;
  if (wps.length > 0) {
    setSelection({ type: "leg", index: wps.length - 1 });
    busRef.emit("ship:waypointAdded", { index: wps.length - 1 });
  }
}

function handleMissilePointer(canvasPoint: { x: number; y: number }, worldPoint: { x: number; y: number }): void {
  const route = getActiveMissileRoute();
  if (!route) return;

  if (uiStateRef.missileTool === "select") {
    const hit = hitTestMissileRoute(canvasPoint);
    setMissileSelection(hit);
    return;
  }

  const wp = { x: worldPoint.x, y: worldPoint.y };
  sendMessage({
    type: "add_missile_waypoint",
    route_id: route.id,
    x: wp.x,
    y: wp.y,
  });
  route.waypoints = route.waypoints ? [...route.waypoints, wp] : [wp];
  renderMissileRouteControls();
  setMissileSelection({ type: "waypoint", index: route.waypoints.length - 1 });
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
}

function deleteSelectedShipWaypoint(): void {
  if (!selection) return;
  sendMessage({ type: "delete_waypoint", index: selection.index });
  if (stateRef.me && Array.isArray(stateRef.me.waypoints)) {
    stateRef.me.waypoints = stateRef.me.waypoints.slice(0, selection.index);
  }
  busRef.emit("ship:waypointDeleted", { index: selection.index });
  setSelection(null);
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
      adjustSliderValue(missileSpeedSlider, -1, event.shiftKey);
      event.preventDefault();
      return;
    case "Quote":
      setInputContext("missile");
      adjustSliderValue(missileSpeedSlider, 1, event.shiftKey);
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

function computeRoutePoints() {
  if (!stateRef.me) return null;
  const wps = Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
  const worldPoints = [{ x: stateRef.me.x, y: stateRef.me.y }];
  for (const wp of wps) {
    worldPoints.push({ x: wp.x, y: wp.y });
  }
  const canvasPoints = worldPoints.map((point) => worldToCanvas(point));
  return { waypoints: wps, worldPoints, canvasPoints };
}

function computeMissileRoutePoints() {
  if (!stateRef.me) return null;
  const route = getActiveMissileRoute();
  const wps = route && Array.isArray(route.waypoints) ? route.waypoints : [];
  const worldPoints = [{ x: stateRef.me.x, y: stateRef.me.y }];
  for (const wp of wps) {
    worldPoints.push({ x: wp.x, y: wp.y });
  }
  const canvasPoints = worldPoints.map((point) => worldToCanvas(point));
  return { waypoints: wps, worldPoints, canvasPoints };
}

function updateLegDashOffsets(dtSeconds: number): void {
  if (!uiStateRef.showShipRoute || !stateRef.me) {
    legDashOffsets.clear();
    return;
  }
  const route = computeRoutePoints();
  if (!route || route.waypoints.length === 0) {
    legDashOffsets.clear();
    return;
  }
  const { waypoints, worldPoints, canvasPoints } = route;
  const cycle = 64;
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const speed = typeof wp.speed === "number" ? wp.speed : defaultSpeed;
    const aWorld = worldPoints[i];
    const bWorld = worldPoints[i + 1];
    const worldDist = Math.hypot(bWorld.x - aWorld.x, bWorld.y - aWorld.y);
    const aCanvas = canvasPoints[i];
    const bCanvas = canvasPoints[i + 1];
    const canvasDist = Math.hypot(bCanvas.x - aCanvas.x, bCanvas.y - aCanvas.y);

    if (!Number.isFinite(speed) || speed <= 1e-3 || !Number.isFinite(worldDist) || worldDist <= 1e-3 || canvasDist <= 1e-3) {
      legDashOffsets.set(i, 0);
      continue;
    }

    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
      if (!legDashOffsets.has(i)) {
        legDashOffsets.set(i, 0);
      }
      continue;
    }

    const scale = canvasDist / worldDist;
    const dashSpeed = speed * scale;
    let next = (legDashOffsets.get(i) ?? 0) - dashSpeed * dtSeconds;
    if (!Number.isFinite(next)) {
      next = 0;
    } else {
      next = ((next % cycle) + cycle) % cycle;
    }
    legDashOffsets.set(i, next);
  }
  for (const key of Array.from(legDashOffsets.keys())) {
    if (key >= waypoints.length) {
      legDashOffsets.delete(key);
    }
  }
}

function pointSegmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq === 0 ? 0 : clamp(apx * abx + apy * aby, 0, abLenSq) / abLenSq;
  const projx = a.x + abx * t;
  const projy = a.y + aby * t;
  const dx = p.x - projx;
  const dy = p.y - projy;
  return Math.hypot(dx, dy);
}

function hitTestRoute(canvasPoint: { x: number; y: number }): Selection | null {
  const route = computeRoutePoints();
  if (!route || route.waypoints.length === 0) {
    return null;
  }
  const { canvasPoints } = route;
  const waypointHitRadius = 12;
  for (let i = 0; i < route.waypoints.length; i++) {
    const wpCanvas = canvasPoints[i + 1];
    const dx = canvasPoint.x - wpCanvas.x;
    const dy = canvasPoint.y - wpCanvas.y;
    if (Math.hypot(dx, dy) <= waypointHitRadius) {
      return { type: "waypoint", index: i };
    }
  }
  if (!uiStateRef.showShipRoute) {
    return null;
  }
  const legHitDistance = 10;
  for (let i = 0; i < route.waypoints.length; i++) {
    const dist = pointSegmentDistance(canvasPoint, canvasPoints[i], canvasPoints[i + 1]);
    if (dist <= legHitDistance) {
      return { type: "leg", index: i };
    }
  }
  return null;
}

function hitTestMissileRoute(canvasPoint: { x: number; y: number }): MissileSelection | null {
  const route = computeMissileRoutePoints();
  if (!route || route.waypoints.length === 0) {
    return null;
  }
  const { canvasPoints } = route;
  const waypointHitRadius = 16;
  for (let i = 1; i < canvasPoints.length; i++) {
    const wpCanvas = canvasPoints[i];
    const dx = canvasPoint.x - wpCanvas.x;
    const dy = canvasPoint.y - wpCanvas.y;
    if (Math.hypot(dx, dy) <= waypointHitRadius) {
      return { type: "waypoint", index: i - 1 };
    }
  }
  return null;
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
  const { canvasPoints } = route;
  const legCount = canvasPoints.length - 1;

  if (uiStateRef.showShipRoute && legCount > 0) {
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#38bdf866";
    for (let i = 0; i < legCount; i++) {
      ctx.beginPath();
      ctx.moveTo(canvasPoints[i].x, canvasPoints[i].y);
      ctx.lineTo(canvasPoints[i + 1].x, canvasPoints[i + 1].y);
      ctx.lineDashOffset = legDashOffsets.get(i) ?? 0;
      ctx.stroke();
    }
    ctx.restore();
  }

  if (uiStateRef.showShipRoute && legCount > 0) {
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#38bdf8";
    ctx.beginPath();
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
    ctx.lineTo(canvasPoints[1].x, canvasPoints[1].y);
    ctx.lineDashOffset = legDashOffsets.get(0) ?? 0;
    ctx.stroke();
    ctx.restore();
  }

  if (uiStateRef.showShipRoute && selection && selection.index < legCount) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(canvasPoints[selection.index].x, canvasPoints[selection.index].y);
    ctx.lineTo(canvasPoints[selection.index + 1].x, canvasPoints[selection.index + 1].y);
    ctx.lineDashOffset = legDashOffsets.get(selection.index) ?? 0;
    ctx.stroke();
    ctx.restore();
  }

  for (let i = 0; i < route.waypoints.length; i++) {
    const pt = canvasPoints[i + 1];
    const isSelected = selection && selection.index === i;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isSelected ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#f97316" : "#38bdf8";
    ctx.globalAlpha = isSelected ? 0.95 : 0.8;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0f172a";
    ctx.stroke();
    ctx.restore();
  }
}

function drawMissileRoute(): void {
  if (!ctx || !stateRef.me) return;
  if (uiStateRef.inputContext !== "missile") return;
  const route = computeMissileRoutePoints();
  if (!route || route.waypoints.length === 0) return;
  const { canvasPoints } = route;
  ctx.save();
  ctx.setLineDash([10, 6]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#f87171aa";
  ctx.beginPath();
  ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
  for (let i = 1; i < canvasPoints.length; i++) {
    ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
  }
  ctx.stroke();
  ctx.restore();

  for (let i = 1; i < canvasPoints.length; i++) {
    const pt = canvasPoints[i];
    const waypointIndex = i - 1;
    const isSelected = missileSelection && missileSelection.index === waypointIndex;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isSelected ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#facc15" : "#f87171";
    ctx.globalAlpha = isSelected ? 0.95 : 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isSelected ? "#854d0e" : "#7f1d1d";
    ctx.stroke();
    ctx.restore();
  }
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
  // Update speed marker position
  updateSpeedMarker();
  // Update stall overlay
  updateStallOverlay();
}

function updateHeatBar(): void {
  const heat = stateRef.me?.heat;
  if (!heat || !heatBarFill || !heatValueText) return;

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
}

function updateSpeedMarker(): void {
  const heat = stateRef.me?.heat;
  if (!heat || !speedMarker || !shipSpeedSlider) return;

  const min = parseFloat(shipSpeedSlider.min);
  const max = parseFloat(shipSpeedSlider.max);
  const markerSpeed = heat.markerSpeed;

  // Calculate position as percentage
  const percent = ((markerSpeed - min) / (max - min)) * 100;
  speedMarker.style.left = `${percent}%`;
  speedMarker.title = `Heat neutral: ${Math.round(markerSpeed)} units/s`;
}

function updateStallOverlay(): void {
  const heat = stateRef.me?.heat;
  if (!heat || !stallOverlay) return;

  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

  const isStalled = now < heat.stallUntilMs;

  if (isStalled) {
    stallOverlay.classList.add("visible");
  } else {
    stallOverlay.classList.remove("visible");
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
  updateLegDashOffsets(dtSeconds);

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
