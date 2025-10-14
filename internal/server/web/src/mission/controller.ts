import type { EventBus } from "../bus";
import type { AppState, BeaconDefinition, MissionState, WorldMeta } from "../state";
import { monotonicNow } from "../state";

export interface MissionController {
  destroy(): void;
}

interface MissionControllerOptions {
  state: AppState;
  bus: EventBus;
  mode: string;
  missionId: string | null;
}

interface MissionSpec {
  id: string;
  holdSeconds: number;
  defaultWorldSize: { w: number; h: number };
  beacons: Array<{ fx: number; fy: number; radius: number }>;
}

interface PersistedProgress {
  beaconIndex: number;
  holdAccum: number;
}

const STORAGE_PREFIX = "lsd:mission:";
const HOLD_EPSILON = 0.0001;

const CAMPAIGN_MISSIONS: Record<string, MissionSpec> = {
  "1": {
    id: "campaign-1",
    holdSeconds: 10,
    defaultWorldSize: { w: 32000, h: 18000 },
    beacons: [
      { fx: 0.15, fy: 0.55, radius: 420 },
      { fx: 0.40, fy: 0.50, radius: 360 },
      { fx: 0.65, fy: 0.47, radius: 300 },
      { fx: 0.85, fy: 0.44, radius: 260 },
    ],
  },
};

export function mountMissionController({ state, bus, mode, missionId }: MissionControllerOptions): MissionController {
  if (mode !== "campaign") {
    return { destroy() {} };
  }

  const spec = missionId && CAMPAIGN_MISSIONS[missionId] ? CAMPAIGN_MISSIONS[missionId] : CAMPAIGN_MISSIONS["1"];
  if (!spec) {
    return { destroy() {} };
  }

  const storageKey = `${STORAGE_PREFIX}${spec.id}`;
  const persisted = loadProgress(storageKey);

  let mission: MissionState = {
    active: true,
    missionId: spec.id,
    beaconIndex: clampBeaconIndex(persisted.beaconIndex, spec.beacons.length),
    holdAccum: clampHold(persisted.holdAccum, spec.holdSeconds),
    holdRequired: spec.holdSeconds,
    beacons: [],
  };

  let lastWorldKey = "";
  let lastPersistedJSON = "";
  let lastServerNow: number | null = null;

  state.mission = mission;
  bus.emit("mission:start");
  // Prime beacon coordinates immediately using whatever world meta is available.
  // Subsequent state updates will refine if the world size changes.
  syncBeacons(state.worldMeta);

  function syncBeacons(meta: WorldMeta | undefined): void {
    const worldW = resolveWorldValue(meta?.w, spec.defaultWorldSize.w);
    const worldH = resolveWorldValue(meta?.h, spec.defaultWorldSize.h);
    const key = `${worldW.toFixed(2)}:${worldH.toFixed(2)}`;
    if (key === lastWorldKey && mission.beacons.length === spec.beacons.length) {
      return;
    }
    lastWorldKey = key;
    mission.beacons = spec.beacons.map((def): BeaconDefinition => ({
      cx: def.fx * worldW,
      cy: def.fy * worldH,
      radius: def.radius,
    }));
  }

  function persist(force = false): void {
    if (!mission.active && mission.beaconIndex >= mission.beacons.length) {
      // Mission complete, store completion with zero hold.
      const payload = JSON.stringify({ beaconIndex: mission.beaconIndex, holdAccum: 0 });
      if (!force && payload === lastPersistedJSON) return;
      lastPersistedJSON = payload;
      saveProgress(storageKey, payload);
      return;
    }
    const payload = JSON.stringify({
      beaconIndex: mission.beaconIndex,
      holdAccum: clampHold(mission.holdAccum, mission.holdRequired),
    });
    if (!force && payload === lastPersistedJSON) return;
    lastPersistedJSON = payload;
    saveProgress(storageKey, payload);
  }

  function computeDt(nowSec: number | undefined | null): number {
    if (!Number.isFinite(nowSec)) {
      return 0;
    }
    if (lastServerNow === null || !Number.isFinite(lastServerNow)) {
      lastServerNow = nowSec!;
      return 0;
    }
    const dt = nowSec! - lastServerNow;
    lastServerNow = nowSec!;
    if (!Number.isFinite(dt) || dt <= 0) {
      return 0;
    }
    return dt;
  }

  function isInsideBeacon(cx: number, cy: number, radius: number): boolean {
    const me = state.me;
    if (!me) return false;
    const dx = me.x - cx;
    const dy = me.y - cy;
    const distSq = dx * dx + dy * dy;
    return distSq <= radius * radius;
  }

  function isStalled(): boolean {
    const heat = state.me?.heat;
    if (!heat) return false;
    const now = monotonicNow();
    return Number.isFinite(heat.stallUntilMs) && now < heat.stallUntilMs;
  }

  function lockCurrentBeacon(): void {
    const lockedIndex = mission.beaconIndex;
    bus.emit("mission:beacon-locked", { index: lockedIndex });
    mission.beaconIndex = Math.min(mission.beaconIndex + 1, mission.beacons.length);
    mission.holdAccum = 0;
    persist(true);
    if (mission.beaconIndex >= mission.beacons.length) {
      mission.active = false;
      persist(true);
      bus.emit("mission:completed");
    }
  }

  function resetHoldIfNeeded(): void {
    if (mission.holdAccum > 0) {
      mission.holdAccum = 0;
      persist();
    }
  }

  const unsubscribe = bus.on("state:updated", () => {
    if (!state.mission || !state.mission.active) {
      return;
    }

    mission = state.mission;
    syncBeacons(state.worldMeta);

    if (mission.beaconIndex >= mission.beacons.length) {
      mission.active = false;
      persist(true);
      bus.emit("mission:completed");
      return;
    }

    const beacon = mission.beacons[mission.beaconIndex];
    if (!beacon) {
      mission.active = false;
      persist(true);
      bus.emit("mission:completed");
      return;
    }

    const dt = computeDt(state.now);
    if (!state.me) {
      lastServerNow = state.now;
      resetHoldIfNeeded();
      return;
    }

    if (isInsideBeacon(beacon.cx, beacon.cy, beacon.radius) && !isStalled()) {
      const nextHold = Math.min(mission.holdRequired, mission.holdAccum + dt);
      if (Math.abs(nextHold - mission.holdAccum) > HOLD_EPSILON) {
        mission.holdAccum = nextHold;
        persist();
      }
      if (mission.holdAccum + HOLD_EPSILON >= mission.holdRequired) {
        lockCurrentBeacon();
      }
    } else {
      resetHoldIfNeeded();
    }
  });

  return {
    destroy() {
      unsubscribe();
    },
  };
}

function resolveWorldValue(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallback;
}

function clampBeaconIndex(index: number, total: number): number {
  if (!Number.isFinite(index)) {
    return 0;
  }
  if (index < 0) return 0;
  if (index > total) return total;
  return Math.floor(index);
}

function clampHold(hold: number, holdRequired: number): number {
  if (!Number.isFinite(hold) || hold < 0) return 0;
  if (hold > holdRequired) return holdRequired;
  return hold;
}

function loadProgress(storageKey: string): PersistedProgress {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return { beaconIndex: 0, holdAccum: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedProgress> | null;
    if (!parsed) {
      return { beaconIndex: 0, holdAccum: 0 };
    }
    return {
      beaconIndex: clampBeaconIndex(parsed.beaconIndex ?? 0, Number.MAX_SAFE_INTEGER),
      holdAccum: typeof parsed.holdAccum === "number" ? Math.max(0, parsed.holdAccum) : 0,
    };
  } catch {
    return { beaconIndex: 0, holdAccum: 0 };
  }
}

function saveProgress(storageKey: string, payload: string): void {
  try {
    window.localStorage.setItem(storageKey, payload);
  } catch {
    // Local storage may be unavailable; ignore.
  }
}
