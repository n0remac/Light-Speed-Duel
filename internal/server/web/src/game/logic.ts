import type { EventBus } from "../bus";
import type {
  AppState,
  MissileRoute,
  MissileSelection,
  Selection,
  UIState,
} from "../state";
import { MISSILE_MAX_SPEED, MISSILE_MIN_SPEED, clamp } from "../state";
import type { RoutePoints } from "../route";
import {
  WAYPOINT_HIT_RADIUS,
  buildRoutePoints,
  hitTestRouteGeneric,
  updateDashOffsetsForRoute,
} from "../route";
import type { Camera } from "./camera";

interface LogicDependencies {
  state: AppState;
  uiState: UIState;
  bus: EventBus;
  sendMessage(payload: unknown): void;
  getApproxServerNow(state: AppState): number;
  camera: Camera;
}

export interface PointerPoint {
  x: number;
  y: number;
}

export interface Logic {
  getSelection(): Selection | null;
  setSelection(selection: Selection | null): void;
  getMissileSelection(): MissileSelection | null;
  setMissileSelection(selection: MissileSelection | null, routeId?: string): void;
  getDefaultShipSpeed(): number;
  setDefaultShipSpeed(value: number): void;
  getDefaultMissileLegSpeed(): number;
  recordMissileLegSpeed(value: number): void;
  getShipWaypointOffset(): number;
  displayIndexToActualIndex(displayIndex: number): number;
  actualIndexToDisplayIndex(actualIndex: number): number;
  computeRoutePoints(): RoutePoints | null;
  computeMissileRoutePoints(): RoutePoints | null;
  findWaypointAtPosition(canvasPoint: PointerPoint): number | null;
  hitTestRoute(canvasPoint: PointerPoint): Selection | null;
  hitTestMissileRoutes(
    canvasPoint: PointerPoint
  ): { route: MissileRoute; selection: MissileSelection } | null;
  shipLegDashOffsets: Map<number, number>;
  missileLegDashOffsets: Map<number, number>;
  updateRouteAnimations(dtSeconds: number): void;
  ensureActiveMissileRoute(): MissileRoute | null;
  getActiveMissileRoute(): MissileRoute | null;
  cycleMissileRoute(direction: number): void;
  cycleShipSelection(direction: number): void;
  clearShipRoute(): void;
  deleteSelectedShipWaypoint(): void;
  deleteSelectedMissileWaypoint(): void;
  launchActiveMissileRoute(): void;
  handleShipPointer(canvasPoint: PointerPoint, worldPoint: PointerPoint): void;
  handleMissilePointer(canvasPoint: PointerPoint, worldPoint: PointerPoint): void;
  beginShipDrag(index: number, origin: PointerPoint): void;
  beginMissileDrag(index: number, origin: PointerPoint): void;
  updateShipDrag(worldPoint: PointerPoint): void;
  updateMissileDrag(worldPoint: PointerPoint): void;
  endDrag(): void;
  getDraggedWaypoint(): number | null;
  getDraggedMissileWaypoint(): number | null;
  getMissileCooldownRemaining(): number;
}

export function createLogic({
  state,
  uiState,
  bus,
  sendMessage,
  getApproxServerNow,
  camera,
}: LogicDependencies): Logic {
  let selection: Selection | null = null;
  let missileSelection: MissileSelection | null = null;
  let defaultSpeed = 150;
  let lastMissileLegSpeed = 0;
  const shipLegDashOffsets = new Map<number, number>();
  const missileLegDashOffsets = new Map<number, number>();
  let draggedWaypoint: number | null = null;
  let draggedMissileWaypoint: number | null = null;

  function getSelection(): Selection | null {
    return selection;
  }

  function setSelection(sel: Selection | null): void {
    selection = sel;
    const index = selection ? selection.index : null;
    bus.emit("ship:legSelected", { index });
  }

  function getMissileSelection(): MissileSelection | null {
    return missileSelection;
  }

  function setMissileSelection(sel: MissileSelection | null, routeId?: string): void {
    missileSelection = sel;
    if (routeId) {
      state.activeMissileRouteId = routeId;
    }
    bus.emit("missile:selectionChanged", { selection: missileSelection });
  }

  function getDefaultShipSpeed(): number {
    return defaultSpeed;
  }

  function setDefaultShipSpeed(value: number): void {
    defaultSpeed = value;
  }

  function getDefaultMissileLegSpeed(): number {
    const minSpeed = state.missileLimits.speedMin ?? MISSILE_MIN_SPEED;
    const maxSpeed = state.missileLimits.speedMax ?? MISSILE_MAX_SPEED;
    const base =
      lastMissileLegSpeed > 0 ? lastMissileLegSpeed : state.missileConfig.speed;
    return clamp(base, minSpeed, maxSpeed);
  }

  function recordMissileLegSpeed(value: number): void {
    if (Number.isFinite(value) && value > 0) {
      lastMissileLegSpeed = value;
    }
  }

  function getShipWaypointOffset(): number {
    const currentIndex = state.me?.currentWaypointIndex;
    if (typeof currentIndex === "number" && Number.isFinite(currentIndex) && currentIndex > 0) {
      return currentIndex;
    }
    return 0;
  }

  function displayIndexToActualIndex(displayIndex: number): number {
    return displayIndex + getShipWaypointOffset();
  }

  function actualIndexToDisplayIndex(actualIndex: number): number {
    const offset = getShipWaypointOffset();
    return actualIndex - offset;
  }

  function computeRoutePoints(): RoutePoints | null {
    if (!state.me) return null;
    const allWaypoints = Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
    const offset = getShipWaypointOffset();
    const visibleWaypoints = offset > 0 ? allWaypoints.slice(offset) : allWaypoints;
    if (!visibleWaypoints.length && !uiState.showShipRoute) {
      return null;
    }
    return buildRoutePoints(
      { x: state.me.x, y: state.me.y },
      visibleWaypoints,
      camera.getWorldSize(),
      camera.getCameraPosition,
      () => uiState.zoom,
      camera.worldToCanvas
    );
  }

  function computeMissileRoutePoints(): RoutePoints | null {
    const route = getActiveMissileRoute();
    if (!route || !Array.isArray(route.waypoints) || !route.waypoints.length) {
      return null;
    }
    const origin = route.origin ?? { x: state.me?.x ?? 0, y: state.me?.y ?? 0 };
    return buildRoutePoints(
      origin,
      route.waypoints,
      camera.getWorldSize(),
      camera.getCameraPosition,
      () => uiState.zoom,
      camera.worldToCanvas
    );
  }

  function findWaypointAtPosition(canvasPoint: PointerPoint): number | null {
    const route = computeRoutePoints();
    if (!route) return null;

    const hit = hitTestRouteGeneric(canvasPoint, route, {
      waypointRadius: WAYPOINT_HIT_RADIUS,
      legHitTolerance: 0,
    });

    if (!hit || hit.type !== "waypoint") return null;
    return displayIndexToActualIndex(hit.index);
  }

  function hitTestRoute(canvasPoint: PointerPoint): Selection | null {
    const route = computeRoutePoints();
    if (!route) return null;
    return hitTestRouteGeneric(canvasPoint, route, {
      waypointRadius: WAYPOINT_HIT_RADIUS,
      legHitTolerance: 6,
    });
  }

  function hitTestMissileRoutes(canvasPoint: PointerPoint) {
    const routePoints = computeMissileRoutePoints();
    const route = getActiveMissileRoute();
    if (!routePoints || !route) return null;

    const hit = hitTestRouteGeneric(canvasPoint, routePoints, {
      waypointRadius: WAYPOINT_HIT_RADIUS,
      legHitTolerance: 6,
    });
    if (!hit) return null;

    const selection =
      hit.type === "leg"
        ? ({ type: "leg", index: hit.index } as MissileSelection)
        : ({ type: "waypoint", index: hit.index } as MissileSelection);

    return { route, selection };
  }

  function updateRouteAnimations(dtSeconds: number): void {
    const shipRoute = computeRoutePoints();
    if (shipRoute && shipRoute.waypoints.length > 0 && uiState.showShipRoute) {
      updateDashOffsetsForRoute(
        shipLegDashOffsets,
        shipRoute.waypoints,
        shipRoute.worldPoints,
        shipRoute.canvasPoints,
        defaultSpeed,
        dtSeconds
      );
    } else {
      shipLegDashOffsets.clear();
    }

    const missileRoute = computeMissileRoutePoints();
    if (missileRoute) {
      updateDashOffsetsForRoute(
        missileLegDashOffsets,
        missileRoute.waypoints,
        missileRoute.worldPoints,
        missileRoute.canvasPoints,
        state.missileConfig.speed,
        dtSeconds
      );
    } else {
      missileLegDashOffsets.clear();
    }
  }

  function ensureActiveMissileRoute(): MissileRoute | null {
    const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
    if (!routes.length) return null;

    if (!state.activeMissileRouteId) {
      state.activeMissileRouteId = routes[0].id;
    }

    let route = routes.find((r) => r.id === state.activeMissileRouteId) || null;
    if (!route) {
      route = routes[0] ?? null;
      state.activeMissileRouteId = route?.id ?? null;
    }
    return route;
  }

  function getActiveMissileRoute(): MissileRoute | null {
    const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
    if (!routes.length) return null;
    if (!state.activeMissileRouteId) {
      return ensureActiveMissileRoute();
    }
    return (
      routes.find((r) => r.id === state.activeMissileRouteId) ??
      ensureActiveMissileRoute()
    );
  }

  function cycleMissileRoute(direction: number): void {
    const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
    if (!routes.length) {
      return;
    }
    const currentIndex = routes.findIndex(
      (route) => route.id === state.activeMissileRouteId
    );
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      ((baseIndex + direction) % routes.length + routes.length) % routes.length;
    const nextRoute = routes[nextIndex];
    if (!nextRoute) return;
    state.activeMissileRouteId = nextRoute.id;
    setMissileSelection(null);
    sendMessage({
      type: "set_active_missile_route",
      route_id: nextRoute.id,
    });
    bus.emit("missile:activeRouteChanged", { routeId: nextRoute.id });
  }

  function cycleShipSelection(direction: number): void {
    const wps = state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
    if (!wps.length) {
      setSelection(null);
      return;
    }
    let index = selection ? selection.index : direction > 0 ? -1 : wps.length;
    index += direction;
    if (index < 0) index = wps.length - 1;
    if (index >= wps.length) index = 0;
    setSelection({ type: "leg", index });
  }

  function clearShipRoute(): void {
    const wps =
      state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
    if (!wps.length) return;
    sendMessage({ type: "clear_waypoints" });
    if (state.me) {
      state.me.waypoints = [];
    }
    setSelection(null);
    bus.emit("ship:waypointsCleared");
  }

  function deleteSelectedShipWaypoint(): void {
    if (!selection) return;
    sendMessage({ type: "delete_waypoint", index: selection.index });
    if (state.me && Array.isArray(state.me.waypoints)) {
      state.me.waypoints = state.me.waypoints.slice(0, selection.index);
    }
    bus.emit("ship:waypointDeleted", { index: selection.index });
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
    route.waypoints = [
      ...route.waypoints.slice(0, index),
      ...route.waypoints.slice(index + 1),
    ];
    bus.emit("missile:waypointDeleted", { routeId: route.id, index });
    setMissileSelection(null);
  }

  function launchActiveMissileRoute(): void {
    const route = getActiveMissileRoute();
    if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
      return;
    }
    if (getMissileCooldownRemaining() > 0.05) {
      return;
    }
    bus.emit("missile:launchRequested", { routeId: route.id });
    sendMessage({
      type: "launch_missile",
      route_id: route.id,
    });
  }

  function handleShipPointer(
    canvasPoint: PointerPoint,
    worldPoint: PointerPoint
  ): void {
    if (!state.me) return;
    if (uiState.shipTool === "select") {
      const hit = hitTestRoute(canvasPoint);
      if (hit) {
        const actualIndex = displayIndexToActualIndex(hit.index);
        setSelection({ type: hit.type, index: actualIndex });
      } else {
        setSelection(null);
      }
      return;
    }

    const wp = { x: worldPoint.x, y: worldPoint.y, speed: defaultSpeed };
    sendMessage({
      type: "add_waypoint",
      x: wp.x,
      y: wp.y,
      speed: defaultSpeed,
    });
    const wps = Array.isArray(state.me.waypoints)
      ? state.me.waypoints.slice()
      : [];
    wps.push(wp);
    state.me.waypoints = wps;
    bus.emit("ship:waypointAdded", { index: wps.length - 1 });
    setSelection(null);
  }

  function handleMissilePointer(
    canvasPoint: PointerPoint,
    worldPoint: PointerPoint
  ): void {
    const route = getActiveMissileRoute();
    if (!route) return;

    if (uiState.missileTool === "select") {
      const hit = hitTestMissileRoutes(canvasPoint);
      if (hit) {
        setMissileSelection(hit.selection, hit.route.id);
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
    recordMissileLegSpeed(speed);
    setMissileSelection(null, route.id);
    bus.emit("missile:waypointAdded", {
      routeId: route.id,
      index: route.waypoints.length - 1,
    });
  }

  function beginShipDrag(index: number, _origin: PointerPoint): void {
    draggedWaypoint = index;
  }

  function beginMissileDrag(index: number, _origin: PointerPoint): void {
    draggedMissileWaypoint = index;
  }

  function clampToWorld(point: PointerPoint): PointerPoint {
    const worldW = state.worldMeta.w ?? 4000;
    const worldH = state.worldMeta.h ?? 4000;
    return {
      x: clamp(point.x, 0, worldW),
      y: clamp(point.y, 0, worldH),
    };
  }

  function updateShipDrag(worldPoint: PointerPoint): void {
    if (draggedWaypoint === null) return;
    const clamped = clampToWorld(worldPoint);
    sendMessage({
      type: "move_waypoint",
      index: draggedWaypoint,
      x: clamped.x,
      y: clamped.y,
    });
    if (state.me && state.me.waypoints && draggedWaypoint < state.me.waypoints.length) {
      state.me.waypoints[draggedWaypoint].x = clamped.x;
      state.me.waypoints[draggedWaypoint].y = clamped.y;
    }
  }

  function updateMissileDrag(worldPoint: PointerPoint): void {
    if (draggedMissileWaypoint === null) return;
    const route = getActiveMissileRoute();
    if (!route || !Array.isArray(route.waypoints)) return;
    const clamped = clampToWorld(worldPoint);
    if (draggedMissileWaypoint >= route.waypoints.length) return;

    sendMessage({
      type: "move_missile_waypoint",
      route_id: route.id,
      index: draggedMissileWaypoint,
      x: clamped.x,
      y: clamped.y,
    });

    route.waypoints = route.waypoints.map((wp, idx) =>
      idx === draggedMissileWaypoint ? { ...wp, x: clamped.x, y: clamped.y } : wp
    );
  }

  function endDrag(): void {
    if (draggedWaypoint !== null && state.me?.waypoints) {
      const wp = state.me.waypoints[draggedWaypoint];
      if (wp) {
        bus.emit("ship:waypointMoved", {
          index: draggedWaypoint,
          x: wp.x,
          y: wp.y,
        });
      }
    }

    if (draggedMissileWaypoint !== null) {
      const route = getActiveMissileRoute();
      if (route && route.waypoints && draggedMissileWaypoint < route.waypoints.length) {
        const wp = route.waypoints[draggedMissileWaypoint];
        bus.emit("missile:waypointMoved", {
          routeId: route.id,
          index: draggedMissileWaypoint,
          x: wp.x,
          y: wp.y,
        });
      }
    }

    draggedWaypoint = null;
    draggedMissileWaypoint = null;
  }

  function getDraggedWaypoint(): number | null {
    return draggedWaypoint;
  }

  function getDraggedMissileWaypoint(): number | null {
    return draggedMissileWaypoint;
  }

  function getMissileCooldownRemaining(): number {
    const remaining = state.nextMissileReadyAt - getApproxServerNow(state);
    return remaining > 0 ? remaining : 0;
  }

  return {
    getSelection,
    setSelection,
    getMissileSelection,
    setMissileSelection,
    getDefaultShipSpeed,
    setDefaultShipSpeed,
    getDefaultMissileLegSpeed,
    recordMissileLegSpeed,
    getShipWaypointOffset,
    displayIndexToActualIndex,
    actualIndexToDisplayIndex,
    computeRoutePoints,
    computeMissileRoutePoints,
    findWaypointAtPosition,
    hitTestRoute,
    hitTestMissileRoutes,
    shipLegDashOffsets,
    missileLegDashOffsets,
    updateRouteAnimations,
    ensureActiveMissileRoute,
    getActiveMissileRoute,
    cycleMissileRoute,
    cycleShipSelection,
    clearShipRoute,
    deleteSelectedShipWaypoint,
    deleteSelectedMissileWaypoint,
    launchActiveMissileRoute,
    handleShipPointer,
    handleMissilePointer,
    beginShipDrag,
    beginMissileDrag,
    updateShipDrag,
    updateMissileDrag,
    endDrag,
    getDraggedWaypoint,
    getDraggedMissileWaypoint,
    getMissileCooldownRemaining,
  };
}
