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

  function render(): void {
    const mission = state.mission;
    if (!mission || !mission.active) {
      container.classList.add("hidden");
      container.classList.remove("inside");
      return;
    }

    const total = mission.beacons.length > 0 ? mission.beacons.length : 4;
    const currentIndex = Math.min(mission.beaconIndex + 1, total);
    beaconLabel.textContent = `Beacon ${currentIndex}/${total}`;

    const required = mission.holdRequired || 10;
    const holdSeconds = Math.max(0, mission.holdAccum);
    holdLabel.textContent = `Hold: ${holdSeconds.toFixed(1)}s / ${required.toFixed(1)}s`;

    const beacon = mission.beacons[mission.beaconIndex];
    if (beacon && state.me) {
      const dx = state.me.x - beacon.cx;
      const dy = state.me.y - beacon.cy;
      const inside = dx * dx + dy * dy <= beacon.radius * beacon.radius;
      if (inside) {
        container.classList.add("inside");
      } else {
        container.classList.remove("inside");
      }
    } else {
      container.classList.remove("inside");
    }

    container.classList.remove("hidden");
  }

  render();
  const unsubs = [
    bus.on("state:updated", () => render()),
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
