# Phase 2 – Mission Templates & Narrative Hooks

## Vision (High-Level Context)

Build a protobuf-driven mission template system layered on the beacon director, starting with simple archetypes (travel, escort, kill, hazard). Replace the legacy "Signal Static" flow with a branching story/tutorial DAG that hangs placeholder dialogue/tips on top of mission progress without yet delivering full narrative depth.

**Foundation Status**: Phase 1 complete. BeaconDirector manages beacon lifecycle, MissionState exists in state.ts, story/tutorial systems have integration hooks ready.

---

## Foundation Specifications (Required Before Implementation)

**IMPORTANT**: These specifications must be complete and validated before beginning implementation tasks. They define the contracts between systems and prevent rework.

### 0.1 Mission Template Protobuf Schema

**Goal**: Define the protobuf schema for mission templates, validation rules, and example configs

**Schema Definition** (`internal/game/proto/mission_template.proto`):
```protobuf
syntax = "proto3";
package game;

// MissionTemplate defines a mission configuration
message MissionTemplate {
  string id = 1;
  string display_name = 2;
  MissionArchetype archetype = 3;
  map<string, ObjectiveParam> objective_params = 4;
  string story_node_id = 5;         // ID in story DAG
  repeated string encounter_refs = 6;
  double failure_timeout = 7;       // 0 = no timeout
  double cooldown = 8;
  repeated BeaconBinding beacon_bindings = 9;
}

enum MissionArchetype {
  ARCHETYPE_UNSPECIFIED = 0;
  ARCHETYPE_TRAVEL = 1;      // Navigate beacon-to-beacon
  ARCHETYPE_ESCORT = 2;      // Protect entity from A to B
  ARCHETYPE_KILL = 3;        // Destroy N entities with tag
  ARCHETYPE_HAZARD = 4;      // Clear mines/obstacles in area
}

// ObjectiveParam is a flexible parameter value
message ObjectiveParam {
  oneof value {
    double number = 1;
    string text = 2;
    bool flag = 3;
  }
}

// BeaconBinding maps beacon ordinal to objectives and encounters
message BeaconBinding {
  int32 ordinal = 1;              // Which beacon (0-indexed)
  repeated Objective objectives = 2;
  string encounter_ref = 3;       // Optional encounter to spawn at this beacon
  string story_node_id = 4;       // Story node triggered on beacon lock
}

// Objective defines a single mission objective
message Objective {
  string id = 1;
  ObjectiveType type = 2;
  map<string, ObjectiveParam> params = 3;
}

enum ObjectiveType {
  OBJECTIVE_UNSPECIFIED = 0;
  OBJECTIVE_DISTANCE = 1;    // Reach location
  OBJECTIVE_KILL = 2;        // Destroy N entities
  OBJECTIVE_TIMER = 3;       // Survive T seconds
  OBJECTIVE_HAZARD = 4;      // Clear hazards in area
}
```

**Example Mission Config** (`campaign-1-travel.json`):
```json
{
  "id": "campaign-1",
  "displayName": "Navigation Protocols",
  "archetype": "ARCHETYPE_TRAVEL",
  "objectiveParams": {
    "beaconCount": {"number": 4},
    "holdTime": {"number": 10.0}
  },
  "storyNodeId": "campaign-1-intro",
  "encounterRefs": ["wave-1", "wave-2", "wave-3"],
  "failureTimeout": 0,
  "cooldown": 0,
  "beaconBindings": [
    {
      "ordinal": 0,
      "objectives": [
        {
          "id": "reach-beacon-0",
          "type": "OBJECTIVE_DISTANCE",
          "params": {
            "targetX": {"number": 1500},
            "targetY": {"number": 1500},
            "threshold": {"number": 420}
          }
        }
      ],
      "storyNodeId": "campaign-1-beacon-0-approach"
    },
    {
      "ordinal": 1,
      "objectives": [
        {
          "id": "reach-beacon-1",
          "type": "OBJECTIVE_DISTANCE",
          "params": {
            "targetX": {"number": 4000},
            "targetY": {"number": 2500},
            "threshold": {"number": 360}
          }
        }
      ],
      "encounterRef": "wave-1",
      "storyNodeId": "campaign-1-beacon-1-locked"
    },
    {
      "ordinal": 2,
      "objectives": [
        {
          "id": "reach-beacon-2",
          "type": "OBJECTIVE_DISTANCE",
          "params": {
            "targetX": {"number": 6500},
            "targetY": {"number": 4700},
            "threshold": {"number": 300}
          }
        }
      ],
      "encounterRef": "wave-2",
      "storyNodeId": "campaign-1-beacon-2-locked"
    },
    {
      "ordinal": 3,
      "objectives": [
        {
          "id": "reach-beacon-3",
          "type": "OBJECTIVE_DISTANCE",
          "params": {
            "targetX": {"number": 8500},
            "targetY": {"number": 4400},
            "threshold": {"number": 260}
          }
        }
      ],
      "encounterRef": "wave-3",
      "storyNodeId": "campaign-1-beacon-3-locked"
    }
  ]
}
```

**Example Combat Mission Config** (`mission-patrol-clear.json`):
```json
{
  "id": "patrol-clear-1",
  "displayName": "Patrol Clearance",
  "archetype": "ARCHETYPE_KILL",
  "objectiveParams": {
    "targetTag": {"text": "patrol"},
    "requiredKills": {"number": 5}
  },
  "storyNodeId": "patrol-clear-intro",
  "encounterRefs": ["patrol-light"],
  "failureTimeout": 300,
  "cooldown": 60,
  "beaconBindings": [
    {
      "ordinal": 0,
      "objectives": [
        {
          "id": "kill-patrols",
          "type": "OBJECTIVE_KILL",
          "params": {
            "targetTag": {"text": "patrol"},
            "requiredKills": {"number": 5}
          }
        }
      ],
      "encounterRef": "patrol-light",
      "storyNodeId": "patrol-clear-active"
    }
  ]
}
```

**Validation Rules**:
- `id` must be unique across all mission templates
- `displayName` cannot be empty
- `storyNodeId` must reference a valid node in the story DAG (validated after DAG load)
- `encounterRefs` must reference valid encounter IDs (validated against EncounterRegistry)
- `beaconBindings[].ordinal` must be 0-indexed and contiguous (no gaps)
- `beaconBindings[].objectives[].params` must match expected params for objective type:
  - `OBJECTIVE_DISTANCE`: `targetX`, `targetY`, `threshold` (all numbers)
  - `OBJECTIVE_KILL`: `targetTag` (text), `requiredKills` (number)
  - `OBJECTIVE_TIMER`: `requiredTime` (number)
  - `OBJECTIVE_HAZARD`: `centerX`, `centerY`, `radius` (all numbers)

**Pre-Implementation Checklist**:
- [ ] Protobuf schema compiles and generates Go code
- [ ] JSON example configs pass schema validation
- [ ] Validation tooling catches all invalid configs (missing fields, bad types, etc.)
- [ ] Story node references are marked as "pending validation" (validated in 0.2)
- [ ] Encounter references are marked as "pending validation" (validated in Phase 3)

---

### 0.2 Story DAG Structure Specification

**Goal**: Define the branching story DAG structure, node IDs, and mission event mapping

**Current State**: `internal/game/story_effects.go` exists but references legacy "Signal Static" flow. The DAG loader and node structure are functional but content is placeholder.

**Required Story DAG Structure**:

**Node ID Convention**: `{mission-id}-{event}-{ordinal?}`
- Mission intro: `campaign-1-intro`
- Beacon events: `campaign-1-beacon-{N}-locked` (N = 1-indexed beacon number)
- Encounter events: `campaign-1-encounter-{N}-start`
- Mission complete: `campaign-1-complete`
- Mission failure: `campaign-1-failed`

**Branching Logic**:
```
campaign-1-intro (autoAdvance: 3s)
  ↓
campaign-1-beacon-1-locked (trigger: mission:beacon-locked, index=1)
  ↓ (autoAdvance: 4s)
campaign-1-beacon-2-locked (trigger: mission:beacon-locked, index=2)
  ↓ (has choice)
  → Choice: "Acknowledged" → campaign-1-encounter-warning
      ↓ (autoAdvance: 5s, sets flag: "encounter-1-briefed")
campaign-1-beacon-3-locked (trigger: mission:beacon-locked, index=3)
  ↓ (autoAdvance: 3s)
campaign-1-complete (trigger: mission:completed)
  ↓ (autoAdvance: 4s, sets flag: "campaign-1-complete")
  → END

campaign-1-failed (trigger: mission:failed)
  → Choice: "Retry Mission" → campaign-1-intro
```

**Tutorial Tip Mapping**:
- `campaign-1-beacon-1-locked`: "Use right-click to set waypoints. Your ship will accelerate and decelerate automatically."
- `campaign-1-encounter-warning`: "Configure missiles in the right panel. Higher speed = shorter lifetime. Larger agro radius = easier to detect."

**Complete Node List** - See [FRONTEND.md](FRONTEND.md) Task 4 for full JSON structure.

**Backend Integration Points**:
- `internal/game/room.go:HandleMissionStoryEventLocked()` must emit events matching trigger format
- Event payload must include:
  - `mission:start`: `{ missionId: string }`
  - `mission:beacon-locked`: `{ missionId: string, beaconIndex: int }` (1-indexed)
  - `mission:completed`: `{ missionId: string }`
  - `mission:failed`: `{ missionId: string }`

**Pre-Implementation Checklist**:
- [ ] All 7 story nodes are documented with IDs, text, triggers, and transitions
- [ ] Node IDs match references in mission template configs (0.1)
- [ ] Event payloads specify all required fields
- [ ] Tutorial tips are assigned to specific nodes
- [ ] Story flags are documented: `encounter-1-briefed`, `campaign-1-complete`
- [ ] Failure recovery path is defined (retry loops back to intro)
- [ ] Legacy "Signal Static" references are marked for removal

---

### 0.3 Frontend Mission Panel Data Contract

**Goal**: Define the exact data shape, UI states, and event contracts for the mission panel

**Data Contract** - See [NETWORKING.md](NETWORKING.md) for full interface definitions.

**UI States & Rendering Logic**:

| State | Mission HUD Display | Story Overlay | Tutorial Tips |
|-------|---------------------|---------------|---------------|
| `status: "idle"` | Hidden | Hidden | None |
| `status: "active"` + no objectives | Beacon progress only (Phase 1 fallback) | Mission intro shown | None |
| `status: "active"` + objectives | Mission name, objectives, timeout, beacon progress | Hidden (story nodes trigger on events) | Show on story node |
| `status: "completed"` | "Mission Complete" banner (3s) | Mission complete node | None |
| `status: "failed"` | "Mission Failed" banner | Failure node with retry option | None |

**Mission HUD Wireframe** (ASCII):
```
┌─────────────────────────────────────┐
│ Navigation Protocols [TRAVEL]       │  ← displayName + archetype badge
├─────────────────────────────────────┤
│ Time: 4:23 / 5:00 [WARNING]         │  ← timeout countdown (if present)
├─────────────────────────────────────┤
│ ✓ Reach Beacon 1         [100%]    │  ← objectives[0] (complete)
│ ○ Reach Beacon 2         [73%]     │  ← objectives[1] (in progress)
│ ○ Reach Beacon 3         [0%]      │  ← objectives[2] (not started)
├─────────────────────────────────────┤
│ Beacon 2/4                          │  ← legacy beacon progress
│ Hold: 7.3s / 10.0s                  │  ← (keep for Phase 2, remove Phase 3)
└─────────────────────────────────────┘
```

**Pre-Implementation Checklist**:
- [ ] All state fields are documented with types and purpose
- [ ] UI state matrix defines rendering logic for each status
- [ ] Wireframe shows exact HUD layout and field positioning
- [ ] Server→Client message formats match backend DTO definitions
- [ ] Client→Server message formats are validated
- [ ] Event bus event names and payloads are consistent across tasks
- [ ] Legacy beacon progress display is marked for Phase 3 removal

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Template schema drift between Go/TypeScript | High | Use shared JSON schema validation, add Go→JSON export for DTOs |
| Story DAG nodes reference invalid IDs | Medium | Add validation in `MissionTemplate.Validate()`, check node IDs exist |
| Legacy mission controller conflicts | Medium | Refactor incrementally, keep old beacon progress display, add feature flags |
| Objective evaluator performance | Low | Limit evaluation frequency (max 10Hz), cache entity queries |
| WebSocket message ordering | Medium | Add sequence numbers to mission updates, client ignores out-of-order |

---

## Success Metrics

- [ ] `go build` succeeds with no errors
- [ ] `go test ./internal/game` passes all tests
- [ ] Mission template registry loads campaign-1 successfully
- [ ] Client receives mission:offer on room join
- [ ] Objective progress updates visible in HUD in real-time
- [ ] Story nodes trigger on correct mission events
- [ ] No "Signal Static" references remain in codebase
- [ ] Mission completion triggers final story node and mission:completed event

---

## Notes for Future Phases

- **Persistence**: Phase 2 keeps all state in-memory. Phase 4 will add database persistence.
- **Mission Selection**: Phase 2 auto-starts campaign-1. Phase 3 will add mission selection UI.
- **Rewards**: Phase 2 defines reward hooks but doesn't implement reward system (Phase 4).
- **Failure Recovery**: Phase 2 adds mission:failed events but doesn't implement checkpoint system (Phase 3).
