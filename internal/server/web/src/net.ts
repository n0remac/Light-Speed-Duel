import { type EventBus } from "./bus";
import {
  type AppState,
  type MissileRoute,
  monotonicNow,
  sanitizeMissileConfig,
  updateMissileLimits,
} from "./state";

interface ServerMissileWaypoint {
  x: number;
  y: number;
}

interface ServerMissileRoute {
  id: string;
  name?: string;
  waypoints?: ServerMissileWaypoint[];
}

interface ServerShipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp?: number;
  waypoints?: Array<{ x: number; y: number; speed?: number }>;
}

interface ServerMissileState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  self?: boolean;
  agro_radius: number;
}

interface ServerStateMessage {
  type: "state";
  now: number;
  next_missile_ready?: number;
  me?: ServerShipState | null;
  ghosts?: Array<{ x: number; y: number; vx: number; vy: number }>;
  missiles?: ServerMissileState[];
  missile_routes?: ServerMissileRoute[];
  missile_config?: {
    speed?: number;
    speed_min?: number;
    speed_max?: number;
    agro_radius?: number;
    agro_min?: number;
    lifetime?: number;
  } | null;
  active_missile_route?: string | null;
  meta?: {
    c?: number;
    w?: number;
    h?: number;
  };
}

interface ConnectOptions {
  room: string;
  state: AppState;
  bus: EventBus;
  onStateUpdated?: () => void;
  onOpen?: (socket: WebSocket) => void;
}

let ws: WebSocket | null = null;

export function sendMessage(payload: unknown): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  ws.send(data);
}

export function connectWebSocket({ room, state, bus, onStateUpdated, onOpen }: ConnectOptions): void {
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  ws = new WebSocket(`${protocol}${window.location.host}/ws?room=${encodeURIComponent(room)}`);
  ws.addEventListener("open", () => {
    console.log("[ws] open");
    const socket = ws;
    if (socket && onOpen) {
      onOpen(socket);
    }
  });
  ws.addEventListener("close", () => console.log("[ws] close"));

  let prevRoutes = new Map<string, MissileRoute>();
  let prevActiveRoute: string | null = null;
  let prevMissileCount = 0;

  ws.addEventListener("message", (event) => {
    const data = safeParse(event.data);
    if (!data || data.type !== "state") {
      return;
    }
    handleStateMessage(state, data, bus, prevRoutes, prevActiveRoute, prevMissileCount);
    prevRoutes = new Map(state.missileRoutes.map((route) => [route.id, cloneRoute(route)]));
    prevActiveRoute = state.activeMissileRouteId;
    prevMissileCount = state.missiles.length;
    bus.emit("state:updated");
    onStateUpdated?.();
  });
}

function handleStateMessage(
  state: AppState,
  msg: ServerStateMessage,
  bus: EventBus,
  prevRoutes: Map<string, MissileRoute>,
  prevActiveRoute: string | null,
  prevMissileCount: number,
): void {
  state.now = msg.now;
  state.nowSyncedAt = monotonicNow();
  state.nextMissileReadyAt = Number.isFinite(msg.next_missile_ready) ? msg.next_missile_ready! : 0;
  state.me = msg.me ? {
    x: msg.me.x,
    y: msg.me.y,
    vx: msg.me.vx,
    vy: msg.me.vy,
    hp: msg.me.hp,
    waypoints: Array.isArray(msg.me.waypoints)
      ? msg.me.waypoints.map((wp) => ({ x: wp.x, y: wp.y, speed: Number.isFinite(wp.speed) ? wp.speed! : 180 }))
      : [],
  } : null;
  state.ghosts = Array.isArray(msg.ghosts) ? msg.ghosts.slice() : [];
  state.missiles = Array.isArray(msg.missiles) ? msg.missiles.slice() : [];

  const routesFromServer = Array.isArray(msg.missile_routes) ? msg.missile_routes : [];
  const newRoutes: MissileRoute[] = routesFromServer.map((route) => ({
    id: route.id,
    name: route.name || route.id || "Route",
    waypoints: Array.isArray(route.waypoints)
      ? route.waypoints.map((wp) => ({ x: wp.x, y: wp.y }))
      : [],
  }));

  diffRoutes(prevRoutes, newRoutes, bus);
  state.missileRoutes = newRoutes;

  const nextActive = typeof msg.active_missile_route === "string" && msg.active_missile_route.length > 0
    ? msg.active_missile_route
    : newRoutes.length > 0
      ? newRoutes[0].id
      : null;
  state.activeMissileRouteId = nextActive;
  if (nextActive !== prevActiveRoute) {
    bus.emit("missile:activeRouteChanged", { routeId: nextActive ?? null });
  }

  if (msg.missile_config) {
    if (Number.isFinite(msg.missile_config.speed_min) || Number.isFinite(msg.missile_config.speed_max) || Number.isFinite(msg.missile_config.agro_min)) {
      updateMissileLimits(state, {
        speedMin: msg.missile_config.speed_min,
        speedMax: msg.missile_config.speed_max,
        agroMin: msg.missile_config.agro_min,
      });
    }
    const sanitized = sanitizeMissileConfig({
      speed: msg.missile_config.speed,
      agroRadius: msg.missile_config.agro_radius,
    }, state.missileConfig, state.missileLimits);
    if (Number.isFinite(msg.missile_config.lifetime)) {
      sanitized.lifetime = msg.missile_config.lifetime!;
    }
    state.missileConfig = sanitized;
  }

  const meta = msg.meta ?? {};
  const hasC = typeof meta.c === "number" && Number.isFinite(meta.c);
  const hasW = typeof meta.w === "number" && Number.isFinite(meta.w);
  const hasH = typeof meta.h === "number" && Number.isFinite(meta.h);
  state.worldMeta = {
    c: hasC ? meta.c! : state.worldMeta.c,
    w: hasW ? meta.w! : state.worldMeta.w,
    h: hasH ? meta.h! : state.worldMeta.h,
  };

  if (state.missiles.length > prevMissileCount) {
    const activeRouteId = state.activeMissileRouteId;
    if (activeRouteId) {
      bus.emit("missile:launched", { routeId: activeRouteId });
    } else {
      bus.emit("missile:launched", { routeId: "" });
    }
  }

  const cooldownRemaining = Math.max(0, state.nextMissileReadyAt - getApproxServerNow(state));
  bus.emit("missile:cooldownUpdated", { secondsRemaining: cooldownRemaining });
}

function diffRoutes(prevRoutes: Map<string, MissileRoute>, nextRoutes: MissileRoute[], bus: EventBus): void {
  const seen = new Set<string>();
  for (const route of nextRoutes) {
    seen.add(route.id);
    const prev = prevRoutes.get(route.id);
    if (!prev) {
      bus.emit("missile:routeAdded", { routeId: route.id });
      continue;
    }
    if (route.name !== prev.name) {
      bus.emit("missile:routeRenamed", { routeId: route.id, name: route.name });
    }
    if (route.waypoints.length > prev.waypoints.length) {
      bus.emit("missile:waypointAdded", { routeId: route.id, index: route.waypoints.length - 1 });
    } else if (route.waypoints.length < prev.waypoints.length) {
      bus.emit("missile:waypointDeleted", { routeId: route.id, index: prev.waypoints.length - 1 });
    }
    if (prev.waypoints.length > 0 && route.waypoints.length === 0) {
      bus.emit("missile:waypointsCleared", { routeId: route.id });
    }
  }
  for (const [routeId] of prevRoutes) {
    if (!seen.has(routeId)) {
      bus.emit("missile:routeDeleted", { routeId });
    }
  }
}

function cloneRoute(route: MissileRoute): MissileRoute {
  return {
    id: route.id,
    name: route.name,
    waypoints: route.waypoints.map((wp) => ({ ...wp })),
  };
}

function safeParse(value: unknown): ServerStateMessage | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as ServerStateMessage;
  } catch (err) {
    console.warn("[ws] failed to parse message", err);
    return null;
  }
}

export function getApproxServerNow(state: AppState): number {
  if (!Number.isFinite(state.now)) {
    return 0;
  }
  const syncedAt = Number.isFinite(state.nowSyncedAt) ? state.nowSyncedAt : null;
  if (!syncedAt) {
    return state.now;
  }
  const elapsedMs = monotonicNow() - syncedAt;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return state.now;
  }
  return state.now + elapsedMs / 1000;
}
