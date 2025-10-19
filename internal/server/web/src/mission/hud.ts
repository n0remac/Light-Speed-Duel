import type { EventBus } from "../bus";
import type { AppState } from "../state";

export interface MissionHud {
  destroy(): void;
}

interface MissionHudOptions {
  state: AppState;
  bus: EventBus;
}

export function mountMissionHud({ state, bus }: MissionHudOptions): MissionHud {
  const container = document.getElementById("mission-hud");
  const beaconLabel = document.getElementById("mission-beacon-label");
  const holdLabel = document.getElementById("mission-hold-text");

  if (!container || !beaconLabel || !holdLabel) {
    return { destroy() {} };
  }
  const hudContainer = container;
  const hudBeaconLabel = beaconLabel;
  const hudHoldLabel = holdLabel;

  function render(): void {
    const mission = state.mission;
    if (!mission || mission.status !== "active" || !mission.player) {
      hudContainer.classList.add("hidden");
      hudContainer.classList.remove("inside");
      return;
    }

    const player = mission.player;
    const total = mission.beacons.length;
    if (total === 0) {
      hudContainer.classList.add("hidden");
      hudContainer.classList.remove("inside");
      return;
    }

    const activeBeacon = player.activeBeaconId
      ? mission.beacons.find((b) => b.id === player.activeBeaconId)
      : mission.beacons.find((b) => !b.completed);
    const completedCount = mission.beacons.filter((b) => b.completed).length;
    const displayIndex = activeBeacon
      ? Math.min(activeBeacon.ordinal + 1, total)
      : Math.min(completedCount, total);
    hudBeaconLabel.textContent = `Beacon ${displayIndex}/${total}`;

    const holdRequired = player.holdRequired || 0;
    const holdSeconds = Math.max(0, player.displayHold ?? player.holdAccum);
    if (holdRequired > 0) {
      hudHoldLabel.textContent = `Hold: ${holdSeconds.toFixed(1)}s / ${holdRequired.toFixed(1)}s`;
    } else {
      hudHoldLabel.textContent = `Hold: ${holdSeconds.toFixed(1)}s`;
    }

    if (player.insideActiveBeacon) {
      hudContainer.classList.add("inside");
    } else {
      hudContainer.classList.remove("inside");
    }

    hudContainer.classList.remove("hidden");
  }

  render();
  const unsubs = [
    bus.on("state:updated", () => render()),
    bus.on("mission:update", () => render()),
    bus.on("mission:start", () => render()),
    bus.on("mission:beacon-locked", () => render()),
    bus.on("mission:completed", () => render()),
  ];

  return {
    destroy() {
      for (const unsub of unsubs) {
        unsub();
      }
    },
  };
}
