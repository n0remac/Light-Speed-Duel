import type { EventBus } from "../bus";
import type { ActiveTool, AppState, UIState } from "../state";
import {
  MISSILE_MAX_SPEED,
  MISSILE_MIN_AGRO,
  MISSILE_MIN_SPEED,
  clamp,
  sanitizeMissileConfig,
} from "../state";
import { HELP_TEXT } from "./constants";
import type { Camera } from "./camera";
import type { Logic } from "./logic";
import { projectRouteHeat } from "../route";

interface UIDependencies {
  state: AppState;
  uiState: UIState;
  bus: EventBus;
  logic: Logic;
  camera: Camera;
  sendMessage(payload: unknown): void;
  getApproxServerNow(state: AppState): number;
}

interface CachedCanvas {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
}

export interface UIController {
  cacheDom(): CachedCanvas;
  bindUI(): void;
  setActiveTool(tool: ActiveTool): void;
  setInputContext(context: "ship" | "missile"): void;
  updateControlHighlights(): void;
  refreshShipSelectionUI(): void;
  refreshMissileSelectionUI(): void;
  renderMissileRouteControls(): void;
  syncMissileUIFromState(): void;
  updateHelpOverlay(): void;
  setHelpVisible(flag: boolean): void;
  updateMissileLaunchButtonState(): void;
  updateMissileCountDisplay(): void;
  updateCraftTimer(): void;
  updateStatusIndicators(): void;
  updatePlannedHeatBar(): void;
  updateSpeedMarker(): void;
  updateHeatBar(): void;
  projectPlannedHeat(): number | null;
  getCanvas(): HTMLCanvasElement | null;
  getContext(): CanvasRenderingContext2D | null;
  adjustShipSpeed(steps: number, coarse: boolean): void;
  adjustMissileAgro(steps: number, coarse: boolean): void;
  adjustMissileSpeed(steps: number, coarse: boolean): void;
}

export function createUI({
  state,
  uiState,
  bus,
  logic,
  camera,
  sendMessage,
  getApproxServerNow,
}: UIDependencies): UIController {
  let canvas: HTMLCanvasElement | null = null;
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
  let missileHeatCapacityCard: HTMLElement | null = null;
  let missileHeatCapacitySlider: HTMLInputElement | null = null;
  let missileHeatCapacityValue: HTMLElement | null = null;
  let missileCraftBtn: HTMLButtonElement | null = null;
  let missileCountSpan: HTMLElement | null = null;
  let missileCraftTimerDiv: HTMLElement | null = null;
  let craftTimeRemainingSpan: HTMLElement | null = null;
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
  let lastMissileLaunchTextHTML = "";
  let lastMissileLaunchInfoHTML = "";
  let lastMissileConfigSent: { speed: number; agroRadius: number } | null = null;

  function cacheDom(): CachedCanvas {
    canvas = document.getElementById("cv") as HTMLCanvasElement | null;
    ctx = canvas?.getContext("2d") ?? null;
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
    missileHeatCapacityCard = document.getElementById("missile-heat-capacity-card");
    missileHeatCapacitySlider = document.getElementById("missile-heat-capacity-slider") as HTMLInputElement | null;
    missileHeatCapacityValue = document.getElementById("missile-heat-capacity-value");
    missileCraftBtn = document.getElementById("missile-craft") as HTMLButtonElement | null;
    missileCountSpan = document.getElementById("missile-count");
    missileCraftTimerDiv = document.getElementById("missile-craft-timer");
    craftTimeRemainingSpan = document.getElementById("craft-time-remaining");

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

    const sliderDefault = parseFloat(shipSpeedSlider?.value ?? "150");
    logic.setDefaultShipSpeed(Number.isFinite(sliderDefault) ? sliderDefault : 150);
    if (missileSpeedSlider) {
      missileSpeedSlider.disabled = false;
    }

    return { canvas, ctx };
  }

  function bindUI(): void {
    spawnBotBtn?.addEventListener("click", () => {
      if (!spawnBotBtn || spawnBotBtn.disabled) return;

      sendMessage({ type: "spawn_bot" });
      bus.emit("bot:spawnRequested");

      spawnBotBtn.disabled = true;
      if (spawnBotText) {
        spawnBotText.textContent = "Spawned";
      }

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
      logic.clearShipRoute();
      bus.emit("ship:clearInvoked");
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
      logic.setDefaultShipSpeed(value);
      const selection = logic.getSelection();
      if (
        selection &&
        state.me &&
        Array.isArray(state.me.waypoints) &&
        state.me.waypoints[selection.index]
      ) {
        sendMessage({ type: "update_waypoint", index: selection.index, speed: value });
        state.me.waypoints[selection.index].speed = value;
        refreshShipSelectionUI();
        updatePlannedHeatBar();
      }
      const heat = state.me?.heat;
      if (heat) {
        const tolerance = Math.max(5, heat.markerSpeed * 0.02);
        const diff = Math.abs(value - heat.markerSpeed);
        const inRange = diff <= tolerance;
        if (inRange && !markerAligned) {
          markerAligned = true;
          bus.emit("heat:markerAligned", { value, marker: heat.markerSpeed });
        } else if (!inRange && markerAligned) {
          markerAligned = false;
        }
      } else {
        markerAligned = false;
      }
      bus.emit("ship:speedChanged", { value });
    });

    shipDeleteBtn?.addEventListener("click", () => {
      setInputContext("ship");
      logic.deleteSelectedShipWaypoint();
    });

    missileAddRouteBtn?.addEventListener("click", () => {
      setInputContext("missile");
      sendMessage({ type: "add_missile_route" });
    });

    missileLaunchBtn?.addEventListener("click", () => {
      setInputContext("missile");
      logic.launchActiveMissileRoute();
    });

    missileSetBtn?.addEventListener("click", () => {
      setActiveTool("missile-set");
    });

    missileSelectBtn?.addEventListener("click", () => {
      setActiveTool("missile-select");
    });

    missileDeleteBtn?.addEventListener("click", () => {
      setInputContext("missile");
      logic.deleteSelectedMissileWaypoint();
      bus.emit("missile:deleteInvoked");
    });

    missileSpeedSlider?.addEventListener("input", (event) => {
      const slider = event.target as HTMLInputElement;
      if (slider.disabled) {
        return;
      }
      const raw = parseFloat(slider.value);
      if (!Number.isFinite(raw)) return;
      const minSpeed = state.missileLimits.speedMin ?? MISSILE_MIN_SPEED;
      const maxSpeed = state.missileLimits.speedMax ?? MISSILE_MAX_SPEED;
      const clampedValue = clamp(raw, minSpeed, maxSpeed);
      slider.value = clampedValue.toFixed(0);
      if (missileSpeedValue) {
        missileSpeedValue.textContent = `${clampedValue.toFixed(0)}`;
      }
      const route = logic.getActiveMissileRoute();
      const missileSelection = logic.getMissileSelection();
      if (
        route &&
        missileSelection &&
        missileSelection.type === "leg" &&
        Array.isArray(route.waypoints) &&
        missileSelection.index >= 0 &&
        missileSelection.index < route.waypoints.length
      ) {
        route.waypoints = route.waypoints.map((w, idx) =>
          idx === missileSelection.index ? { ...w, speed: clampedValue } : w
        );
        sendMessage({
          type: "update_missile_waypoint_speed",
          route_id: route.id,
          index: missileSelection.index,
          speed: clampedValue,
        });
        bus.emit("missile:speedChanged", { value: clampedValue, index: missileSelection.index });
      } else {
        const cfg = sanitizeMissileConfig(
          {
            speed: clampedValue,
            agroRadius: state.missileConfig.agroRadius,
          },
          state.missileConfig,
          state.missileLimits
        );
        state.missileConfig = cfg;
        sendMissileConfig(cfg);
        bus.emit("missile:speedChanged", { value: clampedValue, index: -1 });
      }
      logic.recordMissileLegSpeed(clampedValue);
    });

    missileAgroSlider?.addEventListener("input", (event) => {
      const slider = event.target as HTMLInputElement;
      const raw = parseFloat(slider.value);
      if (!Number.isFinite(raw)) return;
      const minAgro = state.missileLimits.agroMin ?? MISSILE_MIN_AGRO;
      const clampedValue = Math.max(minAgro, raw);
      slider.value = clampedValue.toFixed(0);
      if (missileAgroValue) {
        missileAgroValue.textContent = `${clampedValue.toFixed(0)}`;
      }
      updateMissileConfigFromUI({ agroRadius: clampedValue });
      bus.emit("missile:agroChanged", { value: clampedValue });
    });

    missileHeatCapacitySlider?.addEventListener("input", (event) => {
      const raw = parseFloat((event.target as HTMLInputElement).value);
      if (!Number.isFinite(raw)) return;
      const clampedValue = Math.max(80, Math.min(200, raw));
      missileHeatCapacitySlider.value = clampedValue.toFixed(0);
      if (missileHeatCapacityValue) {
        missileHeatCapacityValue.textContent = `${clampedValue.toFixed(0)}`;
      }
      state.craftHeatCapacity = clampedValue;
    });

    missileCraftBtn?.addEventListener("click", () => {
      if (missileCraftBtn.disabled) return;

      // Find the craft node for the selected heat capacity
      const heatCap = state.craftHeatCapacity;
      let nodeId = "craft.missile.basic"; // Default

      if (state.dag) {
        // Find the best matching craft node based on heat capacity
        const craftNodes = state.dag.nodes.filter(n => n.kind === "craft" && n.id.includes("missile"));
        for (const node of craftNodes) {
          const nodeHeatCap = parseInt(node.id.match(/(\d+)/)?.[1] || "80");
          if (Math.abs(nodeHeatCap - heatCap) < 5) {
            nodeId = node.id;
            break;
          }
        }

        // Determine the right node based on heat capacity ranges
        if (heatCap >= 180) {
          nodeId = "craft.missile.extended";
        } else if (heatCap >= 140) {
          nodeId = "craft.missile.high_heat";
        } else if (heatCap >= 110) {
          nodeId = "craft.missile.long_range";
        } else {
          nodeId = "craft.missile.basic";
        }
      }

      sendMessage({ type: "dag_start", node_id: nodeId });
      bus.emit("missile:craftRequested", { nodeId, heatCapacity: heatCap });
    });

    routePrevBtn?.addEventListener("click", () => logic.cycleMissileRoute(-1));
    routeNextBtn?.addEventListener("click", () => logic.cycleMissileRoute(1));

    routeMenuToggle?.addEventListener("click", () => {
      routeMenu?.classList.toggle("visible");
    });

    renameMissileRouteBtn?.addEventListener("click", () => {
      const route = logic.getActiveMissileRoute();
      if (!route) return;
      const nextName = prompt("Rename route", route.name ?? "") ?? "";
      const trimmed = nextName.trim();
      if (trimmed === route.name) return;
      sendMessage({
        type: "rename_missile_route",
        route_id: route.id,
        name: trimmed,
      });
      route.name = trimmed;
      renderMissileRouteControls();
    });

    deleteMissileRouteBtn?.addEventListener("click", () => {
      const route = logic.getActiveMissileRoute();
      if (!route) return;
      sendMessage({ type: "delete_missile_route", route_id: route.id });
    });

    clearMissileWaypointsBtn?.addEventListener("click", () => {
      const route = logic.getActiveMissileRoute();
      if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
        return;
      }
      sendMessage({ type: "clear_missile_waypoints", route_id: route.id });
      route.waypoints = [];
      logic.setMissileSelection(null);
      renderMissileRouteControls();
    });

    helpToggle?.addEventListener("click", () => {
      setHelpVisible(true);
    });

    helpCloseBtn?.addEventListener("click", () => {
      setHelpVisible(false);
    });

    bus.on("ship:legSelected", () => {
      refreshShipSelectionUI();
    });
    bus.on("ship:waypointAdded", () => {
      refreshShipSelectionUI();
      updatePlannedHeatBar();
    });
    bus.on("ship:waypointDeleted", () => {
      refreshShipSelectionUI();
      updatePlannedHeatBar();
    });
    bus.on("ship:waypointsCleared", () => {
      refreshShipSelectionUI();
      updatePlannedHeatBar();
    });
    bus.on("missile:selectionChanged", () => {
      refreshMissileSelectionUI();
      updateMissileSpeedControls();
    });
    bus.on("missile:waypointAdded", () => {
      renderMissileRouteControls();
    });
    bus.on("missile:waypointDeleted", () => {
      renderMissileRouteControls();
    });
    bus.on("missile:activeRouteChanged", () => {
      renderMissileRouteControls();
    });
    bus.on("missile:craftRequested", () => {
      // Disable craft button temporarily to prevent double-clicks
      if (missileCraftBtn) {
        missileCraftBtn.disabled = true;
      }
      // Force immediate timer update
      updateCraftTimer();
      // Re-enable after a short delay (server will update state)
      setTimeout(() => {
        if (missileCraftBtn) {
          missileCraftBtn.disabled = false;
        }
      }, 500);
    });
  }

  function getCanvas(): HTMLCanvasElement | null {
    return canvas;
  }

  function getContext(): CanvasRenderingContext2D | null {
    return ctx;
  }

  function updateSpeedLabel(value: number): void {
    if (!shipSpeedValue) return;
    shipSpeedValue.textContent = `${value.toFixed(0)} u/s`;
  }

  function adjustSliderValue(
    input: HTMLInputElement | null,
    steps: number,
    coarse: boolean
  ): number | null {
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

  function adjustShipSpeed(steps: number, coarse: boolean): void {
    adjustSliderValue(shipSpeedSlider, steps, coarse);
  }

  function adjustMissileAgro(steps: number, coarse: boolean): void {
    adjustSliderValue(missileAgroSlider, steps, coarse);
  }

  function adjustMissileSpeed(steps: number, coarse: boolean): void {
    if (missileSpeedSlider && !missileSpeedSlider.disabled) {
      adjustSliderValue(missileSpeedSlider, steps, coarse);
    }
  }

  function setShipSliderValue(value: number): void {
    if (!shipSpeedSlider) return;
    shipSpeedSlider.value = value.toFixed(0);
    updateSpeedLabel(value);
  }

  function renderMissileRouteControls(): void {
    const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
    const activeRoute = logic.getActiveMissileRoute();
    if (missileRouteNameLabel) {
      if (!activeRoute) {
        missileRouteNameLabel.textContent = routes.length === 0 ? "No route" : "Route";
      } else {
        missileRouteNameLabel.textContent = activeRoute.name || "Route";
      }
    }

    if (missileRouteCountLabel) {
      const count =
        activeRoute && Array.isArray(activeRoute.waypoints) ? activeRoute.waypoints.length : 0;
      missileRouteCountLabel.textContent = `${count} pts`;
    }

    if (deleteMissileRouteBtn) {
      deleteMissileRouteBtn.disabled = routes.length <= 1;
    }
    if (renameMissileRouteBtn) {
      renameMissileRouteBtn.disabled = !activeRoute;
    }
    if (clearMissileWaypointsBtn) {
      const count =
        activeRoute && Array.isArray(activeRoute.waypoints) ? activeRoute.waypoints.length : 0;
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
    logic.ensureActiveMissileRoute();
    const activeRoute = logic.getActiveMissileRoute();
    const missileSel = logic.getMissileSelection();
    const routeHasSelection =
      !!activeRoute &&
      Array.isArray(activeRoute.waypoints) &&
      !!missileSel &&
      missileSel.index >= 0 &&
      missileSel.index < activeRoute.waypoints.length;
    if (!routeHasSelection) {
      logic.setMissileSelection(null);
    }
    const cfg = state.missileConfig;
    applyMissileUI(cfg);
    renderMissileRouteControls();
    refreshMissileSelectionUI();
  }

  function applyMissileUI(cfg: { speed: number; agroRadius: number }): void {
    if (missileAgroSlider) {
      const minAgro = state.missileLimits.agroMin ?? MISSILE_MIN_AGRO;
      const maxAgro = Math.max(5000, Math.ceil((cfg.agroRadius + 500) / 500) * 500);
      missileAgroSlider.min = String(minAgro);
      missileAgroSlider.max = String(maxAgro);
      missileAgroSlider.value = cfg.agroRadius.toFixed(0);
    }
    if (missileAgroValue) {
      missileAgroValue.textContent = cfg.agroRadius.toFixed(0);
    }
    updateMissileSpeedControls();
    updateSpeedMarker();
  }

  function updateMissileConfigFromUI(
    overrides: Partial<{ agroRadius: number }> = {}
  ): void {
    const current = state.missileConfig;
    const cfg = sanitizeMissileConfig(
      {
        speed: current.speed,
        agroRadius: overrides.agroRadius ?? current.agroRadius,
      },
      current,
      state.missileLimits
    );
    state.missileConfig = cfg;
    applyMissileUI(cfg);
    const last = lastMissileConfigSent;
    const needsSend =
      !last || Math.abs((last.agroRadius ?? 0) - cfg.agroRadius) > 5;
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
    const wps = state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
    const selection = logic.getSelection();
    const hasValidSelection =
      selection !== null && selection.index >= 0 && selection.index < wps.length;
    const isShipContext = uiState.inputContext === "ship";

    shipRoutesContainer.style.display = "flex";
    shipRoutesContainer.style.opacity = isShipContext ? "1" : "0.6";

    if (!state.me || !hasValidSelection || !selection) {
      shipRouteLeg.textContent = "";
      shipRouteSpeed.textContent = "";
      shipDeleteBtn.disabled = true;
      if (isShipContext) {
        setShipSliderValue(logic.getDefaultShipSpeed());
      }
      return;
    }

    const wp = wps[selection.index];
    const speed =
      wp && typeof wp.speed === "number" ? wp.speed : logic.getDefaultShipSpeed();
    if (
      isShipContext &&
      shipSpeedSlider &&
      Math.abs(parseFloat(shipSpeedSlider.value) - speed) > 0.25
    ) {
      setShipSliderValue(speed);
    } else {
      updateSpeedLabel(speed);
    }
    const displayIndex = selection.index + 1;
    shipRouteLeg.textContent = `${displayIndex}`;
    shipRouteSpeed.textContent = `${speed.toFixed(0)} u/s`;
    shipDeleteBtn.disabled = !isShipContext;
  }

  function refreshMissileSelectionUI(): void {
    const route = logic.getActiveMissileRoute();
    const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
    const missileSel = logic.getMissileSelection();
    const isWaypointSelection =
      missileSel !== null &&
      missileSel !== undefined &&
      missileSel.type === "waypoint" &&
      missileSel.index >= 0 &&
      missileSel.index < count;
    if (missileDeleteBtn) {
      missileDeleteBtn.disabled = !isWaypointSelection;
    }
    updateMissileSpeedControls();
  }

  function updateMissileSpeedControls(): void {
    if (!missileSpeedSlider || !missileSpeedValue) {
      return;
    }

    const minSpeed = state.missileLimits.speedMin ?? MISSILE_MIN_SPEED;
    const maxSpeed = state.missileLimits.speedMax ?? MISSILE_MAX_SPEED;
    missileSpeedSlider.min = String(minSpeed);
    missileSpeedSlider.max = String(maxSpeed);

    const route = logic.getActiveMissileRoute();
    const missileSel = logic.getMissileSelection();
    const waypoints = route && Array.isArray(route.waypoints) ? route.waypoints : null;
    let selectedSpeed: number | null = null;
    let selectedType: "leg" | "waypoint" | null = null;

    if (
      waypoints &&
      missileSel &&
      missileSel.index >= 0 &&
      missileSel.index < waypoints.length
    ) {
      const wp = waypoints[missileSel.index];
      const value =
        typeof wp.speed === "number" && wp.speed > 0
          ? wp.speed
          : logic.getDefaultMissileLegSpeed();
      selectedSpeed = clamp(value, minSpeed, maxSpeed);
      selectedType = missileSel.type;
    }

    const sliderDisabled = selectedType === "waypoint";
    let sliderValue: number;
    if (selectedSpeed !== null) {
      sliderValue = selectedSpeed;
    } else {
      const rawValue = parseFloat(missileSpeedSlider.value);
      const fallback = logic.getDefaultMissileLegSpeed();
      const targetValue = Number.isFinite(rawValue) ? rawValue : fallback;
      sliderValue = clamp(targetValue, minSpeed, maxSpeed);
    }

    missileSpeedSlider.disabled = sliderDisabled;
    missileSpeedSlider.value = sliderValue.toFixed(0);
    missileSpeedValue.textContent = `${sliderValue.toFixed(0)}`;

    if (!sliderDisabled) {
      logic.recordMissileLegSpeed(sliderValue);
    }
  }

  function setInputContext(context: "ship" | "missile"): void {
    const next = context === "missile" ? "missile" : "ship";
    if (uiState.inputContext === next) {
      return;
    }
    uiState.inputContext = next;

    if (next === "ship") {
      const shipToolToUse = uiState.shipTool === "select" ? "ship-select" : "ship-set";
      if (uiState.activeTool !== shipToolToUse) {
        uiState.activeTool = shipToolToUse;
      }
    } else {
      const missileToolToUse =
        uiState.missileTool === "select" ? "missile-select" : "missile-set";
      if (uiState.activeTool !== missileToolToUse) {
        uiState.activeTool = missileToolToUse;
      }
    }

    bus.emit("context:changed", { context: next });
    updateControlHighlights();
    refreshShipSelectionUI();
    refreshMissileSelectionUI();
  }

  function setActiveTool(tool: ActiveTool): void {
    if (uiState.activeTool === tool) {
      return;
    }

    uiState.activeTool = tool;

    if (tool === "ship-set") {
      uiState.shipTool = "set";
      uiState.missileTool = null;
      setInputContext("ship");
      bus.emit("ship:toolChanged", { tool: "set" });
    } else if (tool === "ship-select") {
      uiState.shipTool = "select";
      uiState.missileTool = null;
      setInputContext("ship");
      bus.emit("ship:toolChanged", { tool: "select" });
    } else if (tool === "missile-set") {
      uiState.shipTool = null;
      uiState.missileTool = "set";
      setInputContext("missile");
      logic.setMissileSelection(null);
      bus.emit("missile:toolChanged", { tool: "set" });
    } else if (tool === "missile-select") {
      uiState.shipTool = null;
      uiState.missileTool = "select";
      setInputContext("missile");
      bus.emit("missile:toolChanged", { tool: "select" });
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
    setButtonState(shipSetBtn, uiState.activeTool === "ship-set");
    setButtonState(shipSelectBtn, uiState.activeTool === "ship-select");
    setButtonState(missileSetBtn, uiState.activeTool === "missile-set");
    setButtonState(missileSelectBtn, uiState.activeTool === "missile-select");

    if (shipControlsCard) {
      shipControlsCard.classList.toggle("active", uiState.inputContext === "ship");
    }
    if (missileControlsCard) {
      missileControlsCard.classList.toggle("active", uiState.inputContext === "missile");
    }
  }

  function setHelpVisible(flag: boolean): void {
    uiState.helpVisible = flag;
    updateHelpOverlay();
    bus.emit("help:visibleChanged", { visible: uiState.helpVisible });
  }

  function updateHelpOverlay(): void {
    if (!helpOverlay || !helpText) return;
    helpOverlay.classList.toggle("visible", uiState.helpVisible);
    helpText.textContent = HELP_TEXT;
  }

  function updateMissileLaunchButtonState(): void {
    if (!missileLaunchBtn || !missileLaunchText || !missileLaunchInfo) return;
    const route = logic.getActiveMissileRoute();
    const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
    const remaining = logic.getMissileCooldownRemaining();
    const coolingDown = remaining > 0.05;
    const shouldDisable = !route || count === 0 || coolingDown;
    missileLaunchBtn.disabled = shouldDisable;

    const launchTextHTML =
      '<span class="btn-text-full">Launch</span><span class="btn-text-short">Fire</span>';
    let launchInfoHTML = "";

    if (!route) {
      launchInfoHTML = "";
    } else if (coolingDown) {
      launchInfoHTML = `${remaining.toFixed(1)}s`;
    } else if (route.name) {
      const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
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

  function updateMissileCountDisplay(): void {
    if (!missileCountSpan) return;

    let count = 0;
    if (state.inventory && state.inventory.items) {
      for (const item of state.inventory.items) {
        if (item.type === "missile") {
          count += item.quantity;
        }
      }
    }

    missileCountSpan.textContent = count.toString();
  }

  function updateCraftTimer(): void {
    if (!missileCraftTimerDiv || !craftTimeRemainingSpan) return;

    // Look for any craft node that's in progress
    let craftInProgress = false;
    let remainingTime = 0;

    if (state.dag && state.dag.nodes) {
      for (const node of state.dag.nodes) {
        if (node.kind === "craft" && node.status === "in_progress") {
          craftInProgress = true;
          remainingTime = node.remaining_s;
          break;
        }
      }
    }

    if (craftInProgress && remainingTime > 0) {
      missileCraftTimerDiv.style.display = "block";
      craftTimeRemainingSpan.textContent = Math.ceil(remainingTime).toString();
    } else {
      missileCraftTimerDiv.style.display = "none";
    }
  }

  function updateStatusIndicators(): void {
    const meta = state.worldMeta ?? {};
    camera.updateWorldFromMeta(meta);

    if (HPspan) {
      if (state.me && Number.isFinite(state.me.hp)) {
        HPspan.textContent = Number(state.me.hp).toString();
      } else {
        HPspan.textContent = "–";
      }
    }
    if (killsSpan) {
      if (state.me && Number.isFinite(state.me.kills)) {
        killsSpan.textContent = Number(state.me.kills).toString();
      } else {
        killsSpan.textContent = "0";
      }
    }

    updateHeatBar();
    updatePlannedHeatBar();
    updateSpeedMarker();
    updateStallOverlay();
  }

  function updateHeatBar(): void {
    const heat = state.me?.heat;
    if (!heat || !heatBarFill || !heatValueText) {
      heatWarnActive = false;
      return;
    }

    const percent = (heat.value / heat.max) * 100;
    heatBarFill.style.width = `${percent}%`;

    heatValueText.textContent = `Heat ${Math.round(heat.value)}`;

    heatBarFill.classList.remove("warn", "overheat");
    if (heat.value >= heat.overheatAt) {
      heatBarFill.classList.add("overheat");
    } else if (heat.value >= heat.warnAt) {
      heatBarFill.classList.add("warn");
    }

    const nowWarn = heat.value >= heat.warnAt;
    if (nowWarn && !heatWarnActive) {
      heatWarnActive = true;
      bus.emit("heat:warnEntered", { value: heat.value, warnAt: heat.warnAt });
    } else if (!nowWarn && heatWarnActive) {
      const coolThreshold = Math.max(0, heat.warnAt - 5);
      if (heat.value <= coolThreshold) {
        heatWarnActive = false;
        bus.emit("heat:cooledBelowWarn", { value: heat.value, warnAt: heat.warnAt });
      }
    }
  }

  function projectPlannedHeat(): number | null {
    const ship = state.me;
    if (!ship || !Array.isArray(ship.waypoints) || ship.waypoints.length === 0 || !ship.heat) {
      return null;
    }

    const currentIndexRaw = ship.currentWaypointIndex;
    const currentIndex =
      typeof currentIndexRaw === "number" && Number.isFinite(currentIndexRaw) ? currentIndexRaw : 0;
    const clampedIndex = Math.max(0, Math.min(currentIndex, ship.waypoints.length));
    const remainingWaypoints =
      clampedIndex > 0 ? ship.waypoints.slice(clampedIndex) : ship.waypoints.slice();

    if (remainingWaypoints.length === 0) {
      return null;
    }

    const route = [{ x: ship.x, y: ship.y, speed: undefined }, ...remainingWaypoints];

    const heatParams = {
      markerSpeed: ship.heat.markerSpeed,
      kUp: ship.heat.kUp,
      kDown: ship.heat.kDown,
      exp: ship.heat.exp,
      max: ship.heat.max,
      overheatAt: ship.heat.overheatAt,
      warnAt: ship.heat.warnAt,
    };

    const projection = projectRouteHeat(route, ship.heat.value, heatParams);
    return Math.max(...projection.heatAtWaypoints);
  }

  function updatePlannedHeatBar(): void {
    if (!heatBarPlanned) return;
    const resetPlannedBar = () => {
      if (heatBarPlanned) {
        heatBarPlanned.style.width = "0%";
      }
    };

    const ship = state.me;
    if (!ship || !ship.heat) {
      resetPlannedBar();
      dualMeterAlert = false;
      return;
    }

    const planned = projectPlannedHeat();
    if (planned === null) {
      resetPlannedBar();
      dualMeterAlert = false;
      return;
    }

    const actual = ship.heat.value;
    const percent = (planned / ship.heat.max) * 100;
    heatBarPlanned.style.width = `${Math.max(0, Math.min(100, percent))}%`;

    const diff = planned - actual;
    const threshold = Math.max(8, ship.heat.warnAt * 0.1);
    if (diff >= threshold && !dualMeterAlert) {
      dualMeterAlert = true;
      bus.emit("heat:dualMeterDiverged", { planned, actual });
    } else if (diff < threshold * 0.6 && dualMeterAlert) {
      dualMeterAlert = false;
    }
  }

  function updateSpeedMarker(): void {
    const shipHeat = state.me?.heat;
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
      const heatParams = state.missileConfig.heatParams;
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
    const heat = state.me?.heat;
    if (!heat || !stallOverlay) {
      stallActive = false;
      return;
    }

    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    const isStalled = now < heat.stallUntilMs;

    if (isStalled) {
      stallOverlay.classList.add("visible");
      if (!stallActive) {
        stallActive = true;
        bus.emit("heat:stallTriggered", { stallUntil: heat.stallUntilMs });
      }
    } else {
      stallOverlay.classList.remove("visible");
      if (stallActive) {
        stallActive = false;
        bus.emit("heat:stallRecovered", { value: heat.value });
      }
    }
  }

  return {
    cacheDom,
    bindUI,
    setActiveTool,
    setInputContext,
    updateControlHighlights,
    refreshShipSelectionUI,
    refreshMissileSelectionUI,
    renderMissileRouteControls,
    syncMissileUIFromState,
    updateHelpOverlay,
    setHelpVisible,
    updateMissileLaunchButtonState,
    updateMissileCountDisplay,
    updateCraftTimer,
    updateStatusIndicators,
    updatePlannedHeatBar,
    updateSpeedMarker,
    updateHeatBar,
    projectPlannedHeat,
    getCanvas,
    getContext,
    adjustShipSpeed,
    adjustMissileAgro,
    adjustMissileSpeed,
  };
}
