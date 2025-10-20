import type { EventBus } from "../bus";
import type { AppState, MissionObjectiveState } from "../state";
import { getApproxServerNow } from "../net";

export interface MissionHud {
  destroy(): void;
}

interface MissionHudOptions {
  state: AppState;
  bus: EventBus;
}

export function mountMissionHud({ state, bus }: MissionHudOptions): MissionHud {
  const container = document.getElementById("mission-hud");

  if (!container) {
    return { destroy() {} };
  }
  const hudContainer = container;

  function render(): void {
    const mission = state.mission;
    if (!mission) {
      hudContainer.classList.add("hidden");
      hudContainer.classList.remove("inside");
      return;
    }

    const hasObjectives = mission.objectives.length > 0 || mission.objectiveSummaries.length > 0;
    if (!hasObjectives && !mission.displayName) {
      hudContainer.classList.add("hidden");
      hudContainer.classList.remove("inside");
      return;
    }

    const objectives: MissionObjectiveState[] = mission.objectives.length > 0
      ? mission.objectives
      : mission.objectiveSummaries.map((description, index) => ({
        id: `summary-${index}`,
        type: "summary",
        progress: 0,
        complete: false,
        description,
      }));

    const aggregateProgress = mission.progress && Number.isFinite(mission.progress)
      ? mission.progress
      : objectives.length > 0
        ? objectives.reduce((sum, obj) => sum + obj.progress, 0) / objectives.length
        : 0;

    const statusLabel = (() => {
      switch (mission.status) {
        case "completed":
          return "Completed";
        case "failed":
          return "Failed";
        case "active":
          return "Active";
        default:
          return "Ready";
      }
    })();

    const archetypeLabel = mission.archetype ? mission.archetype.toUpperCase() : "";
    const now = getApproxServerNow(state);
    let timerMarkup = "";
    if (mission.timeout && mission.timeout > 0 && mission.startTime) {
      const elapsed = Math.max(0, now - mission.startTime);
      const remaining = Math.max(0, mission.timeout - elapsed);
      const minutes = Math.floor(remaining / 60);
      const seconds = Math.floor(remaining % 60);
      const warningClass = remaining < 30 ? "warning" : "";
      timerMarkup = `
        <div class="mission-timer ${warningClass}">
          Time Remaining: ${minutes}:${seconds.toString().padStart(2, "0")}
        </div>
      `;
    }

    const objectiveItems = objectives.map((obj) => {
      const percent = Math.round(obj.progress * 100);
      const complete = obj.complete || percent >= 100;
      return `
        <li class="mission-objective">
          <div class="mission-objective-label">
            <span>${obj.description}</span>
            <span class="mission-objective-progress">${percent}%</span>
          </div>
          <div class="mission-objective-bar">
            <div class="mission-objective-fill ${complete ? "complete" : ""}" style="width: ${Math.min(100, Math.max(0, percent))}%"></div>
          </div>
        </li>
      `;
    }).join("");

    let playerStatus = "";
    if (mission.player) {
      const player = mission.player;
      const total = mission.beacons.length;
      const completedCount = mission.beacons.filter((b) => b.completed).length;
      const activeBeacon = player.activeBeaconId
        ? mission.beacons.find((b) => b.id === player.activeBeaconId)
        : mission.beacons.find((b) => !b.completed);
      const displayIndex = activeBeacon
        ? Math.min(activeBeacon.ordinal + 1, total)
        : Math.min(completedCount, total);
      const holdRequired = player.holdRequired || 0;
      const holdSeconds = Math.max(0, player.displayHold ?? player.holdAccum);
      playerStatus = `
        <div class="mission-player-status">
          <div>Beacon ${total > 0 ? `${displayIndex}/${total}` : "–"}</div>
          <div>Hold: ${holdRequired > 0 ? `${holdSeconds.toFixed(1)}s / ${holdRequired.toFixed(1)}s` : `${holdSeconds.toFixed(1)}s`}</div>
        </div>
      `;

      if (player.insideActiveBeacon) {
        hudContainer.classList.add("inside");
      } else {
        hudContainer.classList.remove("inside");
      }
    } else {
      hudContainer.classList.remove("inside");
    }

    hudContainer.innerHTML = `
      <div class="mission-header">
        <h3>${mission.displayName || "Mission"}</h3>
        <span class="mission-status">${statusLabel}</span>
      </div>
      ${archetypeLabel ? `<div class="mission-archetype">${archetypeLabel}</div>` : ""}
      <div class="mission-progress">
        <div class="mission-progress-track">
          <div class="mission-progress-fill" style="width: ${Math.min(100, Math.max(0, aggregateProgress * 100))}%"></div>
        </div>
        <span class="mission-progress-value">${Math.round(aggregateProgress * 100)}%</span>
      </div>
      ${timerMarkup}
      ${objectiveItems ? `<ul class="mission-objectives">${objectiveItems}</ul>` : ""}
      ${playerStatus}
    `;

    hudContainer.classList.remove("hidden");
  }

  render();
  const unsubs = [
    bus.on("state:updated", () => render()),
    bus.on("mission:update", () => render()),
    bus.on("mission:start", () => render()),
    bus.on("mission:offered", () => render()),
    bus.on("mission:completed", () => render()),
    bus.on("mission:failed", () => render()),
    bus.on("mission:objectives-updated", () => render()),
    bus.on("mission:progress-changed", () => render()),
    bus.on("mission:beacon-locked", () => render()),
  ];

  return {
    destroy() {
      for (const unsub of unsubs) {
        unsub();
      }
    },
  };
}
