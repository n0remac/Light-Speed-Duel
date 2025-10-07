import type { ShipContext, ShipTool, MissileTool } from "./bus";

export const MISSILE_MIN_SPEED = 40;
export const MISSILE_MAX_SPEED = 250;
export const MISSILE_MIN_AGRO = 100;
export const MISSILE_MAX_LIFETIME = 120;
export const MISSILE_MIN_LIFETIME = 20;
export const MISSILE_LIFETIME_SPEED_PENALTY = 80;
export const MISSILE_LIFETIME_AGRO_PENALTY = 40;
export const MISSILE_LIFETIME_AGRO_REF = 2000;

export interface MissileLimits {
  speedMin: number;
  speedMax: number;
  agroMin: number;
}

export interface Waypoint {
  x: number;
  y: number;
  speed: number;
}

export interface MissileWaypoint {
  x: number;
  y: number;
}

export interface ShipSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp?: number;
  waypoints: Waypoint[];
}

export interface GhostSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface MissileSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  self?: boolean;
  agro_radius: number;
}

export interface MissileRoute {
  id: string;
  name: string;
  waypoints: MissileWaypoint[];
}

export interface MissileConfig {
  speed: number;
  agroRadius: number;
  lifetime: number;
}

export interface WorldMeta {
  c?: number;
  w?: number;
  h?: number;
}

export interface AppState {
  now: number;
  nowSyncedAt: number;
  me: ShipSnapshot | null;
  ghosts: GhostSnapshot[];
  missiles: MissileSnapshot[];
  missileRoutes: MissileRoute[];
  activeMissileRouteId: string | null;
  nextMissileReadyAt: number;
  missileConfig: MissileConfig;
  missileLimits: MissileLimits;
  worldMeta: WorldMeta;
}

export interface Selection {
  type: "waypoint" | "leg";
  index: number;
}

export interface MissileSelection {
  type: "waypoint";
  index: number;
}

export type ActiveTool =
  | "ship-set"
  | "ship-select"
  | "missile-set"
  | "missile-select"
  | null;

export interface UIState {
  inputContext: ShipContext;
  shipTool: ShipTool;
  missileTool: MissileTool;
  activeTool: ActiveTool;
  showShipRoute: boolean;
  helpVisible: boolean;
}

export function createInitialUIState(): UIState {
  return {
    inputContext: "ship",
    shipTool: "set",
    missileTool: null,
    activeTool: "ship-set",
    showShipRoute: true,
    helpVisible: false,
  };
}

export function createInitialState(limits: MissileLimits = {
  speedMin: MISSILE_MIN_SPEED,
  speedMax: MISSILE_MAX_SPEED,
  agroMin: MISSILE_MIN_AGRO,
}): AppState {
  return {
    now: 0,
    nowSyncedAt: typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now(),
    me: null,
    ghosts: [],
    missiles: [],
    missileRoutes: [],
    activeMissileRouteId: null,
    nextMissileReadyAt: 0,
    missileConfig: {
      speed: 180,
      agroRadius: 800,
      lifetime: missileLifetimeFor(180, 800, limits),
    },
    missileLimits: limits,
    worldMeta: {},
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function missileLifetimeFor(speed: number, agroRadius: number, limits: MissileLimits = {
  speedMin: MISSILE_MIN_SPEED,
  speedMax: MISSILE_MAX_SPEED,
  agroMin: MISSILE_MIN_AGRO,
}): number {
  const minSpeed = Number.isFinite(limits.speedMin) ? limits.speedMin : MISSILE_MIN_SPEED;
  const maxSpeed = Number.isFinite(limits.speedMax) ? limits.speedMax : MISSILE_MAX_SPEED;
  const minAgro = Number.isFinite(limits.agroMin) ? limits.agroMin : MISSILE_MIN_AGRO;
  const span = maxSpeed - minSpeed;
  const speedNorm = span > 0 ? clamp((speed - minSpeed) / span, 0, 1) : 0;
  const adjustedAgro = Math.max(0, agroRadius - minAgro);
  const agroNorm = clamp(adjustedAgro / MISSILE_LIFETIME_AGRO_REF, 0, 1);
  const reduction = speedNorm * MISSILE_LIFETIME_SPEED_PENALTY + agroNorm * MISSILE_LIFETIME_AGRO_PENALTY;
  const base = MISSILE_MAX_LIFETIME;
  return clamp(base - reduction, MISSILE_MIN_LIFETIME, MISSILE_MAX_LIFETIME);
}

export function sanitizeMissileConfig(
  cfg: Partial<Pick<MissileConfig, "speed" | "agroRadius">>,
  fallback: MissileConfig,
  limits: MissileLimits,
): MissileConfig {
  const minSpeed = Number.isFinite(limits.speedMin) ? limits.speedMin : MISSILE_MIN_SPEED;
  const maxSpeed = Number.isFinite(limits.speedMax) ? limits.speedMax : MISSILE_MAX_SPEED;
  const minAgro = Number.isFinite(limits.agroMin) ? limits.agroMin : MISSILE_MIN_AGRO;
  const base = fallback ?? {
    speed: minSpeed,
    agroRadius: minAgro,
    lifetime: missileLifetimeFor(minSpeed, minAgro, limits),
  };
  const mergedSpeed = Number.isFinite(cfg.speed ?? base.speed) ? (cfg.speed ?? base.speed) : base.speed;
  const mergedAgro = Number.isFinite(cfg.agroRadius ?? base.agroRadius) ? (cfg.agroRadius ?? base.agroRadius) : base.agroRadius;
  const speed = clamp(mergedSpeed, minSpeed, maxSpeed);
  const agroRadius = Math.max(minAgro, mergedAgro);
  return {
    speed,
    agroRadius,
    lifetime: missileLifetimeFor(speed, agroRadius, limits),
  };
}

export function monotonicNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function cloneWaypointList(list: Waypoint[] | undefined | null): Waypoint[] {
  if (!Array.isArray(list)) return [];
  return list.map((wp) => ({ ...wp }));
}

export function updateMissileLimits(state: AppState, limits: Partial<MissileLimits>): void {
  state.missileLimits = {
    speedMin: Number.isFinite(limits.speedMin) ? limits.speedMin! : state.missileLimits.speedMin,
    speedMax: Number.isFinite(limits.speedMax) ? limits.speedMax! : state.missileLimits.speedMax,
    agroMin: Number.isFinite(limits.agroMin) ? limits.agroMin! : state.missileLimits.agroMin,
  };
}
