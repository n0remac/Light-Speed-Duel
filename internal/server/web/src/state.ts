import type { ShipContext, ShipTool, MissileTool } from "./bus";
import type { DialogueContent } from "./story/types";

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

export interface HeatView {
  value: number;
  max: number;
  warnAt: number;
  overheatAt: number;
  markerSpeed: number;
  stallUntilMs: number; // client-synced time in milliseconds
  kUp: number;
  kDown: number;
  exp: number;
}

export interface ShipSnapshot {
  id?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp?: number;
  kills?: number;
  waypoints: Waypoint[];
  currentWaypointIndex?: number;
  heat?: HeatView;
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
  heat?: HeatView; // Missile heat data
}

export interface MissileRoute {
  id: string;
  name: string;
  waypoints: Waypoint[];
}

export interface HeatParams {
  max: number;
  warnAt: number;
  overheatAt: number;
  markerSpeed: number;
  kUp: number;
  kDown: number;
  exp: number;
}

export interface MissileConfig {
  speed: number;
  agroRadius: number;
  lifetime: number;
  heatParams?: HeatParams; // Optional custom heat configuration
}

export interface MissilePreset {
  name: string;
  description: string;
  speed: number;
  agroRadius: number;
  heatParams: HeatParams;
}

export interface InventoryItem {
  type: string;
  variant_id: string;
  heat_capacity: number;
  quantity: number;
}

export interface Inventory {
  items: InventoryItem[];
}

export interface UpgradeEffectData {
  type: string; // 'speed_multiplier', 'missile_unlock', etc.
  value: number | string;
}

export interface DagNode {
  id: string;
  kind: string;
  label: string;
  status: string; // "locked" | "available" | "in_progress" | "completed"
  remaining_s: number;
  duration_s: number;
  repeatable: boolean;
  effects?: UpgradeEffectData[];
}

export interface DagState {
  nodes: DagNode[];
}

export interface PlayerCapabilities {
  speedMultiplier: number;
  unlockedMissiles: string[];
  heatCapacity: number;
  heatEfficiency: number;
}

// Missile preset definitions matching backend
export const MISSILE_PRESETS: MissilePreset[] = [
  {
    name: "Scout",
    description: "Slow, efficient, long-range. High heat capacity.",
    speed: 80,
    agroRadius: 1500,
    heatParams: {
      max: 60,
      warnAt: 42,
      overheatAt: 60,
      markerSpeed: 70,
      kUp: 20,
      kDown: 15,
      exp: 1.5,
    },
  },
  {
    name: "Hunter",
    description: "Balanced speed and detection. Standard heat.",
    speed: 150,
    agroRadius: 800,
    heatParams: {
      max: 50,
      warnAt: 35,
      overheatAt: 50,
      markerSpeed: 120,
      kUp: 28,
      kDown: 12,
      exp: 1.5,
    },
  },
  {
    name: "Sniper",
    description: "Fast, narrow detection. Low heat capacity.",
    speed: 220,
    agroRadius: 300,
    heatParams: {
      max: 40,
      warnAt: 28,
      overheatAt: 40,
      markerSpeed: 180,
      kUp: 35,
      kDown: 8,
      exp: 1.5,
    },
  },
];

export interface WorldMeta {
  c?: number;
  w?: number;
  h?: number;
}

export interface BeaconDefinition {
  cx: number;
  cy: number;
  radius: number;
}

export interface MissionBeacon {
  id: string;
  ordinal: number;
  x: number;
  y: number;
  radius: number;
  seed: number;
  discovered: boolean;
  completed: boolean;
  cooldownUntil: number | null;
}

export interface MissionEncounterState {
  id: string;
  beaconId: string;
  waveIndex: number;
  spawnedAt: number;
  expiresAt: number;
  active: boolean;
  reason?: string;
}

export interface MissionPlayerState {
  playerId: string;
  currentIndex: number;
  activeBeaconId: string | null;
  holdAccum: number;
  holdRequired: number;
  displayHold: number;
  lastServerUpdate: number;
  lastDisplaySync: number;
  insideActiveBeacon: boolean;
}

export type MissionStatus = "idle" | "active" | "completed";

export interface MissionState {
  missionId: string;
  layoutSeed: number;
  serverTime: number;
  status: MissionStatus;
  beacons: MissionBeacon[];
  player: MissionPlayerState | null;
  encounters: MissionEncounterState[];
}

export interface StoryEvent {
  chapter: string;
  node: string;
  timestamp: number;
}

export interface StoryState {
  activeNode: string | null;
  dialogue: DialogueContent | null;
  available: string[];
  flags: Record<string, boolean>;
  recentEvents: StoryEvent[];
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
  inventory: Inventory | null;
  dag: DagState | null;
  mission: MissionState | null;
  story: StoryState | null;
  craftHeatCapacity: number; // Heat capacity slider value for crafting
  capabilities: PlayerCapabilities | null;
}

export interface Selection {
  type: "waypoint" | "leg";
  index: number;
}

export interface MissileSelection {
  type: "waypoint" | "leg";
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
  zoom: number;
  panX: number;
  panY: number;
}

export function createInitialUIState(): UIState {
  return {
    inputContext: "ship",
    shipTool: "set",
    missileTool: null,
    activeTool: "ship-set",
    showShipRoute: true,
    helpVisible: false,
    zoom: 1.0,
    panX: 0,
    panY: 0,
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
      heatParams: MISSILE_PRESETS[1].heatParams, // Default to Hunter preset
    },
    missileLimits: limits,
    worldMeta: {},
    inventory: null,
    dag: null,
    mission: null,
    story: null,
    craftHeatCapacity: 80, // Default to basic missile heat capacity
    capabilities: null,
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
  cfg: Partial<Pick<MissileConfig, "speed" | "agroRadius" | "heatParams">>,
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
  const heatParams = cfg.heatParams ? { ...cfg.heatParams } : base.heatParams ? { ...base.heatParams } : undefined;
  return {
    speed,
    agroRadius,
    lifetime: missileLifetimeFor(speed, agroRadius, limits),
    heatParams,
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

// Project heat along a missile route
export interface MissileRouteProjection {
  waypoints: Waypoint[];
  heatAtWaypoints: number[];
  willOverheat: boolean;
  overheatAt?: number; // Index where overheat occurs
}

export function projectMissileHeat(
  route: Waypoint[],
  defaultSpeed: number,
  heatParams: HeatParams
): MissileRouteProjection {
  const projection: MissileRouteProjection = {
    waypoints: route,
    heatAtWaypoints: [],
    willOverheat: false,
  };

  if (route.length === 0) {
    return projection;
  }

  let heat = 0; // Missiles start at zero heat
  let pos = { x: route[0].x, y: route[0].y };
  let currentSpeed = route[0].speed > 0 ? route[0].speed : defaultSpeed;

  projection.heatAtWaypoints.push(heat);

  for (let i = 1; i < route.length; i++) {
    const targetPos = route[i];
    const targetSpeed = targetPos.speed > 0 ? targetPos.speed : defaultSpeed;

    // Calculate distance and time
    const dx = targetPos.x - pos.x;
    const dy = targetPos.y - pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 0.001) {
      projection.heatAtWaypoints.push(heat);
      continue;
    }

    // Average speed during segment
    const avgSpeed = (currentSpeed + targetSpeed) * 0.5;
    const segmentTime = distance / Math.max(avgSpeed, 1);

    // Calculate heat rate (match server formula)
    const Vn = Math.max(heatParams.markerSpeed, 0.000001);
    const dev = avgSpeed - heatParams.markerSpeed;
    const p = heatParams.exp;

    let hdot: number;
    if (dev >= 0) {
      // Heating
      hdot = heatParams.kUp * Math.pow(dev / Vn, p);
    } else {
      // Cooling
      hdot = -heatParams.kDown * Math.pow(Math.abs(dev) / Vn, p);
    }

    // Update heat
    heat += hdot * segmentTime;
    heat = Math.max(0, Math.min(heat, heatParams.max));

    projection.heatAtWaypoints.push(heat);
    pos = { x: targetPos.x, y: targetPos.y };
    currentSpeed = targetSpeed;

    // Check for overheat
    if (heat >= heatParams.overheatAt && !projection.willOverheat) {
      projection.willOverheat = true;
      projection.overheatAt = i;
    }

    // Update position and speed
    pos = targetPos;
    currentSpeed = targetSpeed;
  }

  return projection;
}

export function updateMissileLimits(state: AppState, limits: Partial<MissileLimits>): void {
  state.missileLimits = {
    speedMin: Number.isFinite(limits.speedMin) ? limits.speedMin! : state.missileLimits.speedMin,
    speedMax: Number.isFinite(limits.speedMax) ? limits.speedMax! : state.missileLimits.speedMax,
    agroMin: Number.isFinite(limits.agroMin) ? limits.agroMin! : state.missileLimits.agroMin,
  };
}
