import type { EventBus } from "./bus";
import { getApproxServerNow, sendMessage } from "./net";
import {
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
let Tspan: HTMLElement | null = null;
let Cspan: HTMLElement | null = null;
let WHspan: HTMLElement | null = null;
let HPspan: HTMLElement | null = null;
let shipControlsCard: HTMLElement | null = null;
let shipClearBtn: HTMLButtonElement | null = null;
let shipSetBtn: HTMLButtonElement | null = null;
let shipSelectBtn: HTMLButtonElement | null = null;
let shipToggleRouteBtn: HTMLButtonElement | null = null;
let shipSelectionContainer: HTMLElement | null = null;
let shipSelectionLabel: HTMLElement | null = null;
let shipDeleteBtn: HTMLButtonElement | null = null;
let shipSpeedCard: HTMLElement | null = null;
let shipSpeedSlider: HTMLInputElement | null = null;
let shipSpeedValue: HTMLElement | null = null;

let missileControlsCard: HTMLElement | null = null;
let missileAddRouteBtn: HTMLButtonElement | null = null;
let missileLaunchBtn: HTMLButtonElement | null = null;
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

let selection: Selection | null = null;
let missileSelection: MissileSelection | null = null;
let defaultSpeed = 150;
let lastLoopTs: number | null = null;
let lastMissileConfigSent: { speed: number; agroRadius: number } | null = null;
const legDashOffsets = new Map<number, number>();

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
  Tspan = document.getElementById("t");
  Cspan = document.getElementById("c");
  WHspan = document.getElementById("wh");
  HPspan = document.getElementById("ship-hp");
  shipControlsCard = document.getElementById("ship-controls");
  shipClearBtn = document.getElementById("ship-clear") as HTMLButtonElement | null;
  shipSetBtn = document.getElementById("ship-set") as HTMLButtonElement | null;
  shipSelectBtn = document.getElementById("ship-select") as HTMLButtonElement | null;
  shipToggleRouteBtn = document.getElementById("ship-toggle-route") as HTMLButtonElement | null;
  shipSelectionContainer = document.getElementById("ship-selection");
  shipSelectionLabel = document.getElementById("ship-selection-label");
  shipDeleteBtn = document.getElementById("ship-delete") as HTMLButtonElement | null;
  shipSpeedCard = document.getElementById("ship-speed-card");
  shipSpeedSlider = document.getElementById("ship-speed-slider") as HTMLInputElement | null;
  shipSpeedValue = document.getElementById("ship-speed-value");

  missileControlsCard = document.getElementById("missile-controls");
  missileAddRouteBtn = document.getElementById("missile-add-route") as HTMLButtonElement | null;
  missileLaunchBtn = document.getElementById("missile-launch") as HTMLButtonElement | null;
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

  defaultSpeed = parseFloat(shipSpeedSlider?.value ?? "150");
}

function bindListeners(): void {
  if (!cv) return;
  cv.addEventListener("pointerdown", onCanvasPointerDown);

  spawnBotBtn?.addEventListener("click", () => {
    sendMessage({ type: "spawn_bot" });
  });

  shipClearBtn?.addEventListener("click", () => {
    setInputContext("ship");
    clearShipRoute();
  });

  shipSetBtn?.addEventListener("click", () => {
    setShipTool("set");
  });

  shipSelectBtn?.addEventListener("click", () => {
    setShipTool("select");
  });

  shipToggleRouteBtn?.addEventListener("click", () => {
    uiStateRef.showShipRoute = !uiStateRef.showShipRoute;
    updateControlHighlights();
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
    setMissileTool("set");
  });

  missileSelectBtn?.addEventListener("click", () => {
    setMissileTool("select");
  });

  missileDeleteBtn?.addEventListener("click", () => {
    setInputContext("missile");
    deleteSelectedMissileWaypoint();
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

function onCanvasPointerDown(event: PointerEvent): void {
  if (!cv || !ctx) return;
  if (helpOverlay?.classList.contains("visible")) {
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
  if (context === "missile") {
    handleMissilePointer(canvasPoint, worldPoint);
  } else {
    handleShipPointer(canvasPoint, worldPoint);
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
  if (!shipSelectionContainer || !shipSelectionLabel || !shipDeleteBtn) {
    return;
  }
  const wps = stateRef.me && Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
  const hasValidSelection = selection !== null && selection.index >= 0 && selection.index < wps.length;
  const isShipContext = uiStateRef.inputContext === "ship";

  shipSelectionContainer.style.display = "flex";
  shipSelectionContainer.style.opacity = isShipContext ? "1" : "0.6";

  if (!stateRef.me || !hasValidSelection) {
    shipSelectionLabel.textContent = "";
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
    shipSelectionLabel.textContent = `${displayIndex} — ${speed.toFixed(0)} u/s`;
    shipDeleteBtn.disabled = !isShipContext;
  }
}

function refreshMissileSelectionUI(): void {
  if (!missileDeleteBtn) return;
  const route = getActiveMissileRoute();
  const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
  const hasSelection = missileSelection !== null && missileSelection !== undefined && missileSelection.index >= 0 && missileSelection.index < count;
  missileDeleteBtn.disabled = !hasSelection;
  if (missileSelection && hasSelection) {
    missileDeleteBtn.textContent = `Del #${missileSelection.index + 1}`;
  } else {
    missileDeleteBtn.textContent = "Delete";
  }
}

function setSelection(sel: Selection | null): void {
  selection = sel;
  refreshShipSelectionUI();
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
  busRef.emit("context:changed", { context: next });
  updateControlHighlights();
  refreshShipSelectionUI();
  refreshMissileSelectionUI();
}

function setShipTool(tool: "set" | "select"): void {
  if (tool !== "set" && tool !== "select") {
    return;
  }
  if (uiStateRef.shipTool === tool) {
    setInputContext("ship");
    return;
  }
  uiStateRef.shipTool = tool;
  setInputContext("ship");
  updateControlHighlights();
  busRef.emit("ship:toolChanged", { tool });
}

function setMissileTool(tool: "set" | "select"): void {
  if (tool !== "set" && tool !== "select") {
    return;
  }
  if (uiStateRef.missileTool === tool) {
    setInputContext("missile");
    return;
  }
  uiStateRef.missileTool = tool;
  setInputContext("missile");
  if (tool === "set") {
    setMissileSelection(null);
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
  setButtonState(shipSetBtn, uiStateRef.shipTool === "set");
  setButtonState(shipSelectBtn, uiStateRef.shipTool === "select");
  setButtonState(shipToggleRouteBtn, uiStateRef.showShipRoute);
  setButtonState(missileSetBtn, uiStateRef.missileTool === "set");
  setButtonState(missileSelectBtn, uiStateRef.missileTool === "select");

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
      setShipTool(uiStateRef.shipTool === "set" ? "select" : "set");
      event.preventDefault();
      return;
    case "KeyC":
      setInputContext("ship");
      clearShipRoute();
      event.preventDefault();
      return;
    case "KeyR":
      uiStateRef.showShipRoute = !uiStateRef.showShipRoute;
      updateControlHighlights();
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
      setMissileTool(uiStateRef.missileTool === "set" ? "select" : "set");
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
    default:
      break;
  }

  if (event.key === "?") {
    setHelpVisible(!uiStateRef.helpVisible);
    event.preventDefault();
  }
}

function worldToCanvas(p: { x: number; y: number }): { x: number; y: number } {
  if (!cv) return { x: p.x, y: p.y };
  const sx = cv.width / world.w;
  const sy = cv.height / world.h;
  return { x: p.x * sx, y: p.y * sy };
}

function canvasToWorld(p: { x: number; y: number }): { x: number; y: number } {
  if (!cv) return { x: p.x, y: p.y };
  const sx = world.w / cv.width;
  const sy = world.h / cv.height;
  return { x: p.x * sx, y: p.y * sy };
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
  if (!ctx) return;
  ctx.save();
  ctx.strokeStyle = "#234";
  ctx.lineWidth = 1;
  const step = 1000;
  for (let x = 0; x <= world.w; x += step) {
    const a = worldToCanvas({ x, y: 0 });
    const b = worldToCanvas({ x, y: world.h });
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let y = 0; y <= world.h; y += step) {
    const a = worldToCanvas({ x: 0, y });
    const b = worldToCanvas({ x: world.w, y });
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.restore();
}

function updateMissileLaunchButtonState(): void {
  if (!missileLaunchBtn) return;
  const route = getActiveMissileRoute();
  const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
  const remaining = getMissileCooldownRemaining();
  const coolingDown = remaining > 0.05;
  const shouldDisable = !route || count === 0 || coolingDown;
  missileLaunchBtn.disabled = shouldDisable;

  if (!route) {
    missileLaunchBtn.textContent = "Launch missiles";
    return;
  }

  if (coolingDown) {
    missileLaunchBtn.textContent = `Launch in ${remaining.toFixed(1)}s`;
    return;
  }

  if (route.name) {
    missileLaunchBtn.textContent = `Launch ${route.name}`;
  } else {
    missileLaunchBtn.textContent = "Launch missiles";
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
  const hasC = typeof meta.c === "number" && Number.isFinite(meta.c);

  if (hasWidth) {
    world.w = meta.w!;
  }
  if (hasHeight) {
    world.h = meta.h!;
  }
  if (Cspan) {
    Cspan.textContent = hasC ? meta.c!.toFixed(0) : "–";
  }
  if (WHspan) {
    const w = hasWidth ? meta.w! : world.w;
    const h = hasHeight ? meta.h! : world.h;
    WHspan.textContent = `${w.toFixed(0)}×${h.toFixed(0)}`;
  }
  if (HPspan) {
    if (stateRef.me && Number.isFinite(stateRef.me.hp)) {
      HPspan.textContent = Number(stateRef.me.hp).toString();
    } else {
      HPspan.textContent = "–";
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
  updateLegDashOffsets(dtSeconds);

  ctx.clearRect(0, 0, cv.width, cv.height);
  drawGrid();
  drawRoute();
  drawMissileRoute();
  drawMissiles();

  updateMissileLaunchButtonState();

  if (Tspan) {
    Tspan.textContent = getApproxServerNow(stateRef).toFixed(2);
  }

  for (const g of stateRef.ghosts) {
    drawShip(g.x, g.y, g.vx, g.vy, "#9ca3af", false);
    drawGhostDot(g.x, g.y);
  }
  if (stateRef.me) {
    drawShip(stateRef.me.x, stateRef.me.y, stateRef.me.vx, stateRef.me.vy, "#22d3ee", true);
  }
  requestAnimationFrame(loop);
}
