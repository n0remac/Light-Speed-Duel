import type { EventBus } from "../bus";
import type { AppState, MissionPlayerState } from "../state";
import { clamp, monotonicNow } from "../state";
import { acceptMission } from "../net";

export interface MissionController {
  destroy(): void;
}

interface MissionControllerOptions {
  state: AppState;
  bus: EventBus;
  mode: string;
  missionId: string | null;
}

const HOLD_SMOOTH_RATE = 6;
const HOLD_EPSILON = 0.01;

export function mountMissionController({ state, bus, mode }: MissionControllerOptions): MissionController {
  if (mode !== "campaign") {
    return { destroy() {} };
  }

  let knownMissionId: string | null = null;
  let missionStarted = false;
  let activeBeaconId: string | null = null;
  const discoveredBeacons = new Set<string>();
  const completedBeacons = new Set<string>();

  function reset(): void {
    knownMissionId = null;
    missionStarted = false;
    activeBeaconId = null;
    discoveredBeacons.clear();
    completedBeacons.clear();
  }

  function handleMissionUpdate(): void {
    const mission = state.mission;
    if (!mission) {
      reset();
      return;
    }
    const player = mission.player;
    if (!player) {
      missionStarted = false;
      activeBeaconId = null;
      return;
    }

    if (mission.missionId !== knownMissionId) {
      knownMissionId = mission.missionId;
      missionStarted = false;
      activeBeaconId = null;
      discoveredBeacons.clear();
      completedBeacons.clear();
    }

    if (!missionStarted && mission.status !== "idle") {
      missionStarted = true;
    }

    for (const beacon of mission.beacons) {
      if (beacon.discovered && !discoveredBeacons.has(beacon.id)) {
        discoveredBeacons.add(beacon.id);
        bus.emit("beacon:discovered", { id: beacon.id, ordinal: beacon.ordinal });
      }
    }

    for (const beacon of mission.beacons) {
      if (beacon.completed && !completedBeacons.has(beacon.id)) {
        completedBeacons.add(beacon.id);
        bus.emit("mission:beacon-locked", { index: beacon.ordinal });
      }
    }

    if (player.activeBeaconId && player.activeBeaconId !== activeBeaconId) {
      activeBeaconId = player.activeBeaconId;
      const beacon = mission.beacons.find((b) => b.id === player.activeBeaconId);
      bus.emit("beacon:activated", {
        id: player.activeBeaconId,
        ordinal: beacon?.ordinal ?? player.currentIndex,
      });
    } else if (!player.activeBeaconId) {
      activeBeaconId = null;
    }

    synchronizeHoldDisplay(player);
    updateInsideFlag(player);
  }

  function handleTick(): void {
    const mission = state.mission;
    if (!mission?.player) return;
    synchronizeHoldDisplay(mission.player);
    updateInsideFlag(mission.player);
  }

  function synchronizeHoldDisplay(player: MissionPlayerState): void {
    if (!Number.isFinite(player.holdAccum)) {
      player.holdAccum = 0;
    }
    if (!Number.isFinite(player.displayHold)) {
      player.displayHold = player.holdAccum;
    }
    const nowMs = monotonicNow();
    const previousSync = Number.isFinite(player.lastDisplaySync) ? player.lastDisplaySync : nowMs;
    const dt = Math.max(0, (nowMs - previousSync) / 1000);
    player.lastDisplaySync = nowMs;

    const target = clamp(player.holdAccum, 0, Math.max(player.holdRequired, player.holdAccum));
    const smoothing = 1 - Math.exp(-dt * HOLD_SMOOTH_RATE);
    if (smoothing > 0) {
      player.displayHold = player.displayHold + (target - player.displayHold) * smoothing;
    }
    if (Math.abs(player.displayHold - target) < HOLD_EPSILON) {
      player.displayHold = target;
    }
    player.displayHold = clamp(player.displayHold, 0, Math.max(player.holdRequired, target));
  }

  function updateInsideFlag(player: MissionPlayerState): void {
    const mission = state.mission;
    if (!mission) {
      player.insideActiveBeacon = false;
      return;
    }
    if (!player.activeBeaconId || !state.me) {
      player.insideActiveBeacon = false;
      return;
    }
    const beacon = mission.beacons.find((b) => b.id === player.activeBeaconId);
    if (!beacon) {
      player.insideActiveBeacon = false;
      return;
    }
    const dx = state.me.x - beacon.x;
    const dy = state.me.y - beacon.y;
    player.insideActiveBeacon = dx * dx + dy * dy <= beacon.radius * beacon.radius;
  }

  const unsubMission = bus.on("mission:update", () => handleMissionUpdate());
  const unsubMissionStart = bus.on("mission:start", () => {
    missionStarted = true;
  });
  const unsubOffer = bus.on("mission:offered", ({ missionId }) => {
    if (missionId) {
      acceptMission(missionId);
    }
  });
  const unsubState = bus.on("state:updated", () => handleTick());

  return {
    destroy() {
      unsubMission();
      unsubState();
      unsubOffer();
      unsubMissionStart();
    },
  };
}
