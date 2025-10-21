# Phase 2 Frontend Tasks

**Prerequisites**: Read [OVERVIEW.md](OVERVIEW.md) and [NETWORKING.md](NETWORKING.md) first.

---

### 4. Story DAG Placeholder Replacement

**Goal**: Replace "Signal Static" flow with branching DAG nodes triggered by mission events

**Files to Create/Modify**:
- Create `internal/server/web/data/campaign-1-story.json` (new file)
- Modify `internal/server/web/src/story/controller.ts` (wire mission event triggers)
- Search and remove legacy "Signal Static" references

**Story DAG JSON Structure**:
```json
{
  "chapterId": "campaign-1",
  "tutorialId": "campaign-1-tutorial",
  "startNode": "intro",
  "nodes": {
    "intro": {
      "id": "intro",
      "speaker": "Ship AI",
      "text": "Navigation protocols loaded. Mission objective: secure 4 waypoint beacons to establish safe corridor.",
      "intent": "factory",
      "trigger": {
        "kind": "mission-event",
        "event": "mission:start",
        "missionId": "campaign-1"
      },
      "autoAdvance": 3000,
      "next": null
    },

    "beacon-1-locked": {
      "id": "beacon-1-locked",
      "speaker": "Ship AI",
      "text": "Beacon 1 secured. Route segment established. Proceed to Beacon 2.",
      "intent": "factory",
      "trigger": {
        "kind": "mission-event",
        "event": "mission:beacon-locked",
        "beaconIndex": 1
      },
      "tutorialTip": "Use right-click to set waypoints. Your ship will accelerate and decelerate automatically.",
      "autoAdvance": 4000,
      "next": null
    },

    "beacon-2-locked": {
      "id": "beacon-2-locked",
      "speaker": "Ship AI",
      "text": "Beacon 2 secured. Warning: hostile signatures detected ahead. Recommend defensive posture.",
      "intent": "factory",
      "trigger": {
        "kind": "mission-event",
        "event": "mission:beacon-locked",
        "beaconIndex": 2
      },
      "choices": [
        {
          "text": "Acknowledged",
          "next": "encounter-warning"
        }
      ]
    },

    "encounter-warning": {
      "id": "encounter-warning",
      "speaker": "Ship AI",
      "text": "Deploying tactical overlay. Use missiles to clear obstacles. Remember: light-time delay affects targeting.",
      "intent": "factory",
      "tutorialTip": "Configure missiles in the right panel. Higher speed = shorter lifetime. Larger agro radius = easier to detect.",
      "autoAdvance": 5000,
      "next": null,
      "flags": ["encounter-1-briefed"]
    },

    "beacon-3-locked": {
      "id": "beacon-3-locked",
      "speaker": "Ship AI",
      "text": "Beacon 3 secured. Final waypoint ahead. Mission completion imminent.",
      "intent": "factory",
      "trigger": {
        "kind": "mission-event",
        "event": "mission:beacon-locked",
        "beaconIndex": 3
      },
      "autoAdvance": 3000,
      "next": null
    },

    "mission-complete": {
      "id": "mission-complete",
      "speaker": "Ship AI",
      "text": "All beacons secured. Navigation corridor established. Mission successful.",
      "intent": "factory",
      "trigger": {
        "kind": "mission-event",
        "event": "mission:completed"
      },
      "autoAdvance": 4000,
      "next": null,
      "flags": ["campaign-1-complete"]
    },

    "mission-failed": {
      "id": "mission-failed",
      "speaker": "Ship AI",
      "text": "Mission failure detected. Rebooting systems. You may retry from the last checkpoint.",
      "intent": "factory",
      "trigger": {
        "kind": "mission-event",
        "event": "mission:failed"
      },
      "choices": [
        {
          "text": "Retry Mission",
          "next": "intro"
        }
      ]
    }
  }
}
```

**Story Controller Modifications**:
```typescript
// internal/server/web/src/story/controller.ts

// Add mission event listeners
function initMissionEventListeners() {
  bus.on("mission:start", ({ missionId }) => {
    const node = findNodeByTrigger("mission-event", "mission:start", { missionId });
    if (node) {
      displayStoryNode(node);
    }
  });

  bus.on("mission:beacon-locked", ({ index }) => {
    const node = findNodeByTrigger("mission-event", "mission:beacon-locked", { beaconIndex: index });
    if (node) {
      displayStoryNode(node);
    }
  });

  bus.on("mission:completed", () => {
    const node = findNodeByTrigger("mission-event", "mission:completed");
    if (node) {
      displayStoryNode(node);
    }
  });

  bus.on("mission:failed", () => {
    const node = findNodeByTrigger("mission-event", "mission:failed");
    if (node) {
      displayStoryNode(node);
    }
  });
}

function findNodeByTrigger(kind: string, event: string, params?: any): StoryNode | null {
  const chapter = getCurrentChapter();
  if (!chapter) return null;

  for (const nodeId in chapter.nodes) {
    const node = chapter.nodes[nodeId];
    if (!node.trigger) continue;

    if (node.trigger.kind === kind && node.trigger.event === event) {
      // Check additional params if needed
      if (params?.beaconIndex !== undefined) {
        if (node.trigger.beaconIndex === params.beaconIndex) {
          return node;
        }
      } else {
        return node;
      }
    }
  }

  return null;
}
```

**Task Checklist**:
- [ ] Create `internal/server/web/data/campaign-1-story.json` with structure above
- [ ] Add all 7 story nodes: intro, beacon-1/2/3-locked, encounter-warning, mission-complete, mission-failed
- [ ] Add mission event triggers to each node
- [ ] Add `initMissionEventListeners()` function to `story/controller.ts`
- [ ] Implement `findNodeByTrigger()` helper function
- [ ] Call `initMissionEventListeners()` in story controller init
- [ ] Search codebase for "Signal Static" references and remove/replace
- [ ] Update story loader to load campaign-1-story.json
- [ ] Test story progression with tutorial tip display

**Acceptance Criteria**:
- Mission start triggers "intro" node with "Navigation protocols loaded" text
- Locking beacon 1 triggers "beacon-1-locked" node with tutorial tip
- Locking beacon 2 triggers "beacon-2-locked" with encounter warning
- Mission completion triggers "mission-complete" node
- Mission failure triggers "mission-failed" with retry option
- No references to "Signal Static" remain in codebase
- Story flags are set correctly ("encounter-1-briefed", "campaign-1-complete")

---

### 5. Client Mission State Extensions

**Goal**: Extend state.ts to store mission arrays, objective states, and lifecycle info

**Files to Modify**:
- `internal/server/web/src/state.ts` (extend MissionState interface)
- `internal/server/web/src/net.ts` (handle new message types)
- `internal/server/web/src/mission/controller.ts` (process mission updates)

**State Extensions**:
```typescript
// internal/server/web/src/state.ts

// Add to MissionState interface:
export interface MissionState {
  // ... existing fields ...

  // New fields for Phase 2
  templateId: string | null;
  displayName: string | null;
  archetype: "travel" | "escort" | "kill" | "hazard" | null;
  objectives: ObjectiveState[];
  timeout: number | null;        // Mission timeout in seconds, null = no timeout
  startTime: number | null;      // Server time when mission started
  completionTime: number | null; // Server time when mission completed
}

export interface ObjectiveState {
  id: string;
  type: "distance" | "kill" | "timer" | "hazard";
  progress: number;  // 0.0 - 1.0
  complete: boolean;
}

// Add helper functions:
export function resetMissionState(): void {
  state.mission.status = "idle";
  state.mission.templateId = null;
  state.mission.displayName = null;
  state.mission.archetype = null;
  state.mission.objectives = [];
  state.mission.timeout = null;
  state.mission.startTime = null;
  state.mission.completionTime = null;
}

export function updateMissionObjectives(objectives: ObjectiveState[]): void {
  state.mission.objectives = objectives;
  bus.emit("mission:objectives-updated", { objectives });
}
```

**Network Message Handlers**:
```typescript
// internal/server/web/src/net.ts

// Add to handleServerMessage cases:
case "mission:offer": {
  const offer = msg.payload as MissionOfferDTO;
  state.mission.missionId = offer.missionId;
  state.mission.templateId = offer.templateId;
  state.mission.displayName = offer.displayName;
  state.mission.archetype = offer.archetype;
  state.mission.timeout = offer.timeout;
  state.mission.status = "idle";  // Offered but not yet accepted
  bus.emit("mission:offered", offer);
  break;
}

case "mission:update": {
  const update = msg.payload as MissionUpdateDTO;
  state.mission.status = update.status;
  state.mission.serverTime = update.serverTime;
  updateMissionObjectives(update.objectives);

  if (update.status === "completed") {
    state.mission.completionTime = update.serverTime;
    bus.emit("mission:completed", { missionId: update.missionId });
  } else if (update.status === "failed") {
    bus.emit("mission:failed", { missionId: update.missionId });
  }

  bus.emit("mission:update", update);
  break;
}
```

**Mission Controller Extensions**:
```typescript
// internal/server/web/src/mission/controller.ts

// Add listener for mission offers
bus.on("mission:offered", (offer) => {
  console.log(`Mission offered: ${offer.displayName}`);
  // Auto-accept for now (can add UI prompt later)
  acceptMission(offer.missionId);
});

function acceptMission(missionId: string): void {
  const msg = {
    type: "mission:accept",
    payload: { missionId }
  };
  sendMessage(msg);
  state.mission.status = "active";
  state.mission.startTime = state.now;
  bus.emit("mission:start", { missionId });
}

// Add listener for objective updates
bus.on("mission:objectives-updated", ({ objectives }) => {
  // Update HUD to show objective progress
  updateObjectiveDisplay(objectives);
});

function updateObjectiveDisplay(objectives: ObjectiveState[]): void {
  // Calculate overall mission progress
  const totalProgress = objectives.reduce((sum, obj) => sum + obj.progress, 0);
  const avgProgress = objectives.length > 0 ? totalProgress / objectives.length : 0;

  // Emit for HUD rendering
  bus.emit("mission:progress-changed", { progress: avgProgress, objectives });
}
```

**Task Checklist**:
- [ ] Add new fields to `MissionState` interface in `state.ts`
- [ ] Create `ObjectiveState` interface in `state.ts`
- [ ] Implement `resetMissionState()` helper function
- [ ] Implement `updateMissionObjectives()` helper function
- [ ] Add `"mission:offer"` case to message handler in `net.ts`
- [ ] Add `"mission:update"` case to message handler in `net.ts`
- [ ] Add `acceptMission()` function to `mission/controller.ts`
- [ ] Add `"mission:offered"` event listener with auto-accept logic
- [ ] Add `"mission:objectives-updated"` event listener
- [ ] Implement `updateObjectiveDisplay()` function
- [ ] Add TypeScript type definitions for DTOs

**Acceptance Criteria**:
- State updates when `mission:offer` message received
- Mission auto-accepts and sends `mission:accept` to server
- State updates when `mission:update` message received
- Objective progress values update in state.mission.objectives
- `mission:completed` event fires when status="completed"
- `mission:failed` event fires when status="failed"
- Mission controller emits `mission:progress-changed` with aggregate progress

---

### 6. Mission HUD Updates

**Goal**: Adapt existing HUD to show objectives, progress, and timeout warnings

**Files to Modify**:
- `internal/server/web/src/mission/hud.ts` (extend rendering logic)

**HUD Extension Sketch**:
```typescript
// internal/server/web/src/mission/hud.ts

function renderMissionHUD(): void {
  const hud = document.querySelector('[role="mission-hud"]');
  if (!hud) return;

  const { mission } = state;

  if (mission.status === "idle" || mission.status === "completed") {
    hud.innerHTML = "";
    return;
  }

  // Build HUD content
  let html = `
    <div class="mission-header">
      <h3>${mission.displayName || "Mission"}</h3>
      <span class="mission-type">${mission.archetype || ""}</span>
    </div>
  `;

  // Show timeout if present
  if (mission.timeout && mission.startTime) {
    const elapsed = state.now - mission.startTime;
    const remaining = mission.timeout - elapsed;
    if (remaining > 0) {
      const minutes = Math.floor(remaining / 60);
      const seconds = Math.floor(remaining % 60);
      html += `
        <div class="mission-timer ${remaining < 30 ? 'warning' : ''}">
          Time: ${minutes}:${seconds.toString().padStart(2, '0')}
        </div>
      `;
    }
  }

  // Show objectives
  if (mission.objectives.length > 0) {
    html += `<div class="mission-objectives">`;
    for (const obj of mission.objectives) {
      const percent = Math.floor(obj.progress * 100);
      const statusIcon = obj.complete ? "✓" : "○";
      html += `
        <div class="objective ${obj.complete ? 'complete' : ''}">
          <span class="icon">${statusIcon}</span>
          <span class="type">${obj.type}</span>
          <span class="progress">${percent}%</span>
        </div>
      `;
    }
    html += `</div>`;
  }

  // Legacy beacon progress (keep for Phase 2, refactor in Phase 3)
  if (mission.player && mission.player.activeBeaconId) {
    const beaconNum = mission.player.currentIndex + 1;
    const totalBeacons = mission.beacons.length;
    const holdProgress = mission.player.displayHold.toFixed(1);
    const holdRequired = mission.player.holdRequired.toFixed(1);

    html += `
      <div class="beacon-progress">
        <div>Beacon ${beaconNum}/${totalBeacons}</div>
        <div>Hold: ${holdProgress}s / ${holdRequired}s</div>
      </div>
    `;
  }

  hud.innerHTML = html;
}

// Update on mission events
bus.on("mission:progress-changed", renderMissionHUD);
bus.on("mission:update", renderMissionHUD);
bus.on("mission:start", renderMissionHUD);
bus.on("mission:completed", renderMissionHUD);
```

**Task Checklist**:
- [ ] Extend `renderMissionHUD()` to show mission display name
- [ ] Add mission archetype badge rendering
- [ ] Add timeout countdown display with warning style (<30s)
- [ ] Add objective list rendering with progress percentages
- [ ] Add completion checkmarks for finished objectives
- [ ] Keep existing beacon hold progress display (for backward compatibility)
- [ ] Wire HUD rendering to mission events
- [ ] Add CSS styles for new HUD elements (timer warning, objective list)
- [ ] Test HUD updates in real-time as objectives progress

**Acceptance Criteria**:
- HUD shows mission display name when mission active
- Timeout countdown appears and updates each second
- Timeout shows warning style when <30 seconds remaining
- Objective list shows each objective with type and progress %
- Completed objectives show checkmark icon
- HUD clears when mission status is "idle" or "completed"
- Existing beacon hold progress still displays correctly

---

