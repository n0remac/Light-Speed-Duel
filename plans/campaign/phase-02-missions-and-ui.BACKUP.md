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

**Complete Node List** (campaign-1):
```typescript
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
      "trigger": {"kind": "mission-event", "event": "mission:start", "missionId": "campaign-1"},
      "autoAdvance": 3000,
      "next": null
    },
    "beacon-1-locked": {
      "id": "beacon-1-locked",
      "speaker": "Ship AI",
      "text": "Beacon 1 secured. Route segment established. Proceed to Beacon 2.",
      "intent": "factory",
      "trigger": {"kind": "mission-event", "event": "mission:beacon-locked", "beaconIndex": 1},
      "tutorialTip": "Use right-click to set waypoints. Your ship will accelerate and decelerate automatically.",
      "autoAdvance": 4000,
      "next": null
    },
    "beacon-2-locked": {
      "id": "beacon-2-locked",
      "speaker": "Ship AI",
      "text": "Beacon 2 secured. Warning: hostile signatures detected ahead. Recommend defensive posture.",
      "intent": "factory",
      "trigger": {"kind": "mission-event", "event": "mission:beacon-locked", "beaconIndex": 2},
      "choices": [{"text": "Acknowledged", "next": "encounter-warning"}]
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
      "trigger": {"kind": "mission-event", "event": "mission:beacon-locked", "beaconIndex": 3},
      "autoAdvance": 3000,
      "next": null
    },
    "mission-complete": {
      "id": "mission-complete",
      "speaker": "Ship AI",
      "text": "All beacons secured. Navigation corridor established. Mission successful.",
      "intent": "factory",
      "trigger": {"kind": "mission-event", "event": "mission:completed"},
      "autoAdvance": 4000,
      "next": null,
      "flags": ["campaign-1-complete"]
    },
    "mission-failed": {
      "id": "mission-failed",
      "speaker": "Ship AI",
      "text": "Mission failure detected. Rebooting systems. You may retry from the last checkpoint.",
      "intent": "factory",
      "trigger": {"kind": "mission-event", "event": "mission:failed"},
      "choices": [{"text": "Retry Mission", "next": "intro"}]
    }
  }
}
```

**Backend Integration Points**:
- `internal/game/room.go:HandleMissionStoryEventLocked()` must emit events matching trigger format
- Event payload must include:
  - `mission:start`: `{ missionId: string }`
  - `mission:beacon-locked`: `{ missionId: string, beaconIndex: int }` (1-indexed)
  - `mission:completed`: `{ missionId: string }`
  - `mission:failed`: `{ missionId: string }`

**Frontend Event Listeners** (in `story/controller.ts`):
```typescript
bus.on("mission:start", ({ missionId }) => {
  const node = findNodeByTrigger("mission-event", "mission:start", { missionId });
  if (node) displayStoryNode(node);
});

bus.on("mission:beacon-locked", ({ missionId, beaconIndex }) => {
  const node = findNodeByTrigger("mission-event", "mission:beacon-locked", { beaconIndex });
  if (node) displayStoryNode(node);
});

bus.on("mission:completed", ({ missionId }) => {
  const node = findNodeByTrigger("mission-event", "mission:completed");
  if (node) displayStoryNode(node);
});

bus.on("mission:failed", ({ missionId }) => {
  const node = findNodeByTrigger("mission-event", "mission:failed");
  if (node) displayStoryNode(node);
});
```

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

**Data Contract** (`state.ts` extensions):

```typescript
// Complete MissionState interface with all Phase 2 fields
export interface MissionState {
  // Existing Phase 1 fields
  missionId: string | null;
  layoutSeed: number;
  serverTime: number;
  status: "idle" | "active" | "completed" | "failed";
  beacons: MissionBeacon[];
  player: MissionPlayerState | null;
  encounters: MissionEncounterState[];

  // NEW Phase 2 fields
  templateId: string | null;           // References mission template
  displayName: string | null;          // Human-readable mission name
  archetype: MissionArchetype | null;  // "travel" | "escort" | "kill" | "hazard"
  objectives: ObjectiveState[];        // Active objective list
  timeout: number | null;              // Mission timeout in seconds (null = no timeout)
  startTime: number | null;            // Server time when mission started
  completionTime: number | null;       // Server time when mission completed
  failureReason: string | null;        // Why mission failed (null = not failed)
}

export type MissionArchetype = "travel" | "escort" | "kill" | "hazard";

export interface ObjectiveState {
  id: string;                          // Unique objective ID
  type: ObjectiveType;                 // Objective type enum
  progress: number;                    // 0.0 - 1.0
  complete: boolean;                   // True when progress = 1.0
  description: string;                 // Human-readable objective ("Reach Beacon 2")
}

export type ObjectiveType = "distance" | "kill" | "timer" | "hazard";

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

  // NEW Phase 2 fields
  tags: string[];                      // Beacon tags from sampler (Phase 3)
  pinned: boolean;                     // Designer-specified beacon (Phase 3)
}
```

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

**Event Contracts**:

**Server → Client Messages**:
```typescript
// Sent when mission becomes available (on room join or mission unlock)
interface MissionOfferDTO {
  missionId: string;
  templateId: string;
  displayName: string;
  archetype: string;                   // "travel" | "escort" | "kill" | "hazard"
  objectives: string[];                // Human-readable list ["Reach 4 beacons", "Survive encounters"]
  storyNodeId: string;
  timeout: number;                     // 0 = no timeout
}

// Sent on objective progress change (>1% delta) or completion
interface MissionUpdateDTO {
  missionId: string;
  status: string;                      // "active" | "completed" | "failed"
  objectives: ObjectiveStateDTO[];
  serverTime: number;
}

interface ObjectiveStateDTO {
  id: string;
  type: string;                        // "distance" | "kill" | "timer" | "hazard"
  progress: number;                    // 0.0 - 1.0
  complete: boolean;
  description: string;                 // Generated server-side
}
```

**Client → Server Messages**:
```typescript
// Sent by client to accept offered mission
interface MissionAcceptDTO {
  missionId: string;
}
```

**Event Bus Events** (client-side):
```typescript
bus.emit("mission:offered", offer: MissionOfferDTO)      // Server sent offer
bus.emit("mission:start", { missionId: string })         // Client accepted mission
bus.emit("mission:update", update: MissionUpdateDTO)     // Server sent progress
bus.emit("mission:objectives-updated", { objectives: ObjectiveState[] })
bus.emit("mission:progress-changed", { progress: number, objectives: ObjectiveState[] })
bus.emit("mission:completed", { missionId: string })
bus.emit("mission:failed", { missionId: string, reason?: string })
```

**Pre-Implementation Checklist**:
- [ ] All state fields are documented with types and purpose
- [ ] UI state matrix defines rendering logic for each status
- [ ] Wireframe shows exact HUD layout and field positioning
- [ ] Server→Client message formats match backend DTO definitions (Task 3)
- [ ] Client→Server message formats are validated
- [ ] Event bus event names and payloads are consistent across tasks
- [ ] Legacy beacon progress display is marked for Phase 3 removal

---

## Implementation Tasks

### 1. Mission Template Registry

**Goal**: Create Go structs defining mission archetypes with objective parameters and story hooks

**Files to Create/Modify**:
- Create `internal/game/missions.go` (new file)
- Modify `internal/game/beacons.go` (extend BeaconDirector to use templates)

**Code Sketch**:
```go
// internal/game/missions.go

package game

type MissionArchetype int

const (
	ArchetypeTravel MissionArchetype = iota  // Navigate beacon-to-beacon
	ArchetypeEscort                          // Protect entity from A to B
	ArchetypeKill                            // Destroy N entities with tag
	ArchetypeHazard                          // Clear mines/obstacles in area
)

type MissionTemplate struct {
	ID              string
	DisplayName     string
	Archetype       MissionArchetype
	ObjectiveParams map[string]interface{}
	StoryNodeID     string               // ID of story DAG node to trigger on start
	EncounterRefs   []string             // IDs of encounters to spawn (from Phase 1)
	FailureTimeout  float64              // Max seconds before auto-fail (0 = no timeout)
	Cooldown        float64              // Seconds before mission can be re-attempted
}

// TemplateRegistry holds all defined mission templates
var TemplateRegistry = map[string]MissionTemplate{
	"campaign-1": {
		ID:          "campaign-1",
		DisplayName: "Navigation Protocols",
		Archetype:   ArchetypeTravel,
		ObjectiveParams: map[string]interface{}{
			"beaconCount": 4,
			"holdTime":    10.0,
		},
		StoryNodeID:   "campaign-1-intro",
		EncounterRefs: []string{"wave-1", "wave-2", "wave-3"},
		FailureTimeout: 0,
		Cooldown:       0,
	},
}

// GetTemplate retrieves a mission template by ID
func GetTemplate(id string) (*MissionTemplate, error) {
	template, ok := TemplateRegistry[id]
	if !ok {
		return nil, fmt.Errorf("mission template not found: %s", id)
	}
	return &template, nil
}

// ValidateTemplate checks that a template's references are valid
func (t *MissionTemplate) Validate() error {
	if t.ID == "" {
		return fmt.Errorf("template ID cannot be empty")
	}
	if t.DisplayName == "" {
		return fmt.Errorf("template %s missing display name", t.ID)
	}
	// TODO: Validate StoryNodeID exists in story DAG (Phase 2.3)
	// TODO: Validate EncounterRefs exist in encounter registry (Phase 3)
	return nil
}
```

**Task Checklist**:
- [ ] Create `internal/game/missions.go` file
- [ ] Define `MissionArchetype` enum with Travel, Escort, Kill, Hazard
- [ ] Define `MissionTemplate` struct with all fields shown above
- [ ] Create `TemplateRegistry` map with `campaign-1` entry
- [ ] Implement `GetTemplate(id string) (*MissionTemplate, error)` function
- [ ] Implement `Validate()` method on MissionTemplate
- [ ] Add unit test for GetTemplate with valid/invalid IDs

**Acceptance Criteria**:
- `GetTemplate("campaign-1")` returns correct template with all fields
- `GetTemplate("invalid")` returns error "mission template not found: invalid"
- Template validation passes for campaign-1
- Tests pass: `go test ./internal/game -run TestMissionTemplate`

---

### 2. Objective Evaluator System

**Goal**: Implement predicates that check objective completion and report progress

**Files to Create/Modify**:
- Create `internal/game/objectives.go` (new file)
- Modify `internal/game/beacons.go` (add objective tracking to BeaconDirector)

**Code Sketch**:
```go
// internal/game/objectives.go

package game

type ObjectiveEvaluator interface {
	// Evaluate returns (complete, progress) where progress is 0.0-1.0
	Evaluate(r *Room, p *Player) (complete bool, progress float64)
}

// DistanceEvaluator checks if player is within threshold of target
type DistanceEvaluator struct {
	TargetX    float64
	TargetY    float64
	Threshold  float64
	Identifier string  // For logging/debugging
}

func (e *DistanceEvaluator) Evaluate(r *Room, p *Player) (bool, float64) {
	dist := math.Hypot(p.X-e.TargetX, p.Y-e.TargetY)
	if dist <= e.Threshold {
		return true, 1.0
	}
	// Linear falloff for progress reporting
	maxDist := e.Threshold * 3.0  // Consider "in progress" within 3x threshold
	progress := math.Max(0, 1.0-(dist-e.Threshold)/(maxDist-e.Threshold))
	return false, progress
}

// KillCountEvaluator checks if N entities with tag are destroyed
type KillCountEvaluator struct {
	TargetTag     string
	RequiredKills int
	currentKills  int  // Track kills across ticks
}

func (e *KillCountEvaluator) Evaluate(r *Room, p *Player) (bool, float64) {
	// Count entities with TargetTag that are dead
	killed := 0
	for _, ent := range r.World.Entities {
		if ent.Tags != nil && ent.Tags[e.TargetTag] && ent.Dead {
			killed++
		}
	}
	e.currentKills = killed

	if killed >= e.RequiredKills {
		return true, 1.0
	}
	progress := float64(killed) / float64(e.RequiredKills)
	return false, progress
}

// TimerEvaluator checks if elapsed time exceeds threshold
type TimerEvaluator struct {
	StartTime      float64
	RequiredTime   float64
	Identifier     string
}

func (e *TimerEvaluator) Evaluate(r *Room, p *Player) (bool, float64) {
	elapsed := r.T - e.StartTime
	if elapsed >= e.RequiredTime {
		return true, 1.0
	}
	progress := elapsed / e.RequiredTime
	return false, progress
}

// HazardClearEvaluator checks if all mines in area are destroyed
type HazardClearEvaluator struct {
	CenterX       float64
	CenterY       float64
	Radius        float64
	initialCount  int
}

func (e *HazardClearEvaluator) Evaluate(r *Room, p *Player) (bool, float64) {
	// Count mines within radius that are still alive
	remaining := 0
	total := 0
	for _, ent := range r.World.Entities {
		if ent.Tags != nil && ent.Tags["mine"] {
			dist := math.Hypot(ent.X-e.CenterX, ent.Y-e.CenterY)
			if dist <= e.Radius {
				total++
				if !ent.Dead {
					remaining++
				}
			}
		}
	}

	if e.initialCount == 0 {
		e.initialCount = total
	}

	if remaining == 0 && total > 0 {
		return true, 1.0
	}

	if total == 0 {
		return false, 0.0
	}

	progress := float64(total-remaining) / float64(total)
	return false, progress
}
```

**Extension to BeaconDirector**:
```go
// In internal/game/beacons.go

type BeaconDirector struct {
	// ... existing fields ...

	// New fields for objective tracking
	ActiveObjectives map[string]ObjectiveEvaluator  // objectiveID -> evaluator
	ObjectiveProgress map[string]float64             // objectiveID -> last progress
}

// In BeaconDirector.Tick(), add after existing logic:
func (d *BeaconDirector) Tick(r *Room) {
	// ... existing beacon logic ...

	// Evaluate active objectives
	for objID, evaluator := range d.ActiveObjectives {
		for _, p := range r.Players {
			complete, progress := evaluator.Evaluate(r, p)

			// Check if progress changed significantly (>1% change)
			lastProgress := d.ObjectiveProgress[objID]
			if math.Abs(progress-lastProgress) > 0.01 {
				d.ObjectiveProgress[objID] = progress
				// Emit progress update event
				r.BroadcastObjectiveProgress(p, objID, progress)
			}

			if complete {
				// Emit completion event
				r.BroadcastObjectiveComplete(p, objID)
				delete(d.ActiveObjectives, objID)
				delete(d.ObjectiveProgress, objID)
			}
		}
	}
}
```

**Task Checklist**:
- [ ] Create `internal/game/objectives.go` file
- [ ] Define `ObjectiveEvaluator` interface
- [ ] Implement `DistanceEvaluator` struct and Evaluate method
- [ ] Implement `KillCountEvaluator` struct and Evaluate method
- [ ] Implement `TimerEvaluator` struct and Evaluate method
- [ ] Implement `HazardClearEvaluator` struct and Evaluate method
- [ ] Add `ActiveObjectives` and `ObjectiveProgress` maps to BeaconDirector
- [ ] Add objective evaluation loop to `BeaconDirector.Tick()`
- [ ] Add `BroadcastObjectiveProgress()` helper to Room
- [ ] Add `BroadcastObjectiveComplete()` helper to Room
- [ ] Write unit tests for each evaluator type

**Acceptance Criteria**:
- DistanceEvaluator returns (true, 1.0) when player within threshold
- DistanceEvaluator returns (false, 0.5) when player at 50% progress distance
- KillCountEvaluator returns (false, 0.6) when 3 of 5 required kills complete
- TimerEvaluator returns (true, 1.0) after elapsed time exceeds requirement
- HazardClearEvaluator tracks mine destruction correctly
- BeaconDirector.Tick() emits progress events when progress changes >1%
- Tests pass: `go test ./internal/game -run TestObjectiveEvaluators`

---

### 3. Mission Lifecycle Events & Networking

**Goal**: Extend DTO schema and WebSocket handlers for mission offers, updates, completions

**Files to Modify**:
- `internal/server/dto.go` (add new message types)
- `internal/server/ws.go` (add message handlers)
- `internal/game/room.go` (add broadcast helpers)

**Code Sketch**:
```go
// internal/server/dto.go

// MissionOfferDTO sent when mission becomes available
type MissionOfferDTO struct {
	MissionID   string   `json:"missionId"`
	TemplateID  string   `json:"templateId"`
	DisplayName string   `json:"displayName"`
	Archetype   string   `json:"archetype"`  // "travel" | "escort" | "kill" | "hazard"
	Objectives  []string `json:"objectives"` // Human-readable objective list
	StoryNodeID string   `json:"storyNodeId"`
	Timeout     float64  `json:"timeout"`    // 0 = no timeout
}

// MissionUpdateDTO sent on objective progress/completion
type MissionUpdateDTO struct {
	MissionID         string             `json:"missionId"`
	Status            string             `json:"status"` // "active" | "completed" | "failed"
	Objectives        []ObjectiveStateDTO `json:"objectives"`
	ServerTime        float64            `json:"serverTime"`
}

type ObjectiveStateDTO struct {
	ID       string  `json:"id"`
	Type     string  `json:"type"`  // "distance" | "kill" | "timer" | "hazard"
	Progress float64 `json:"progress"` // 0.0 - 1.0
	Complete bool    `json:"complete"`
}

// MissionAcceptDTO sent by client to accept offered mission
type MissionAcceptDTO struct {
	MissionID string `json:"missionId"`
}
```

**WebSocket Handler Extensions**:
```go
// internal/server/ws.go

// In handlePlayerMessage, add new case:
case "mission:accept":
	var payload MissionAcceptDTO
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("Invalid mission:accept payload: %v", err)
		return
	}

	// Find player's room
	room := findRoomForPlayer(player)
	if room == nil {
		return
	}

	// Delegate to room/director to start mission
	room.BeaconDir.AcceptMission(room, player, payload.MissionID)
```

**Room Broadcast Helpers**:
```go
// internal/game/room.go

func (r *Room) BroadcastMissionOffer(p *Player, template *MissionTemplate) {
	msg := MissionOfferDTO{
		MissionID:   template.ID,
		TemplateID:  template.ID,
		DisplayName: template.DisplayName,
		Archetype:   archetypeToString(template.Archetype),
		Objectives:  generateObjectiveDescriptions(template),
		StoryNodeID: template.StoryNodeID,
		Timeout:     template.FailureTimeout,
	}
	// Send to player via WebSocket
	p.SendMessage("mission:offer", msg)
}

func (r *Room) BroadcastObjectiveProgress(p *Player, objectiveID string, progress float64) {
	// Build objective state from current evaluators
	objectives := []ObjectiveStateDTO{}
	for id, eval := range r.BeaconDir.ActiveObjectives {
		complete, prog := eval.Evaluate(r, p)
		objectives = append(objectives, ObjectiveStateDTO{
			ID:       id,
			Type:     getEvaluatorType(eval),
			Progress: prog,
			Complete: complete,
		})
	}

	msg := MissionUpdateDTO{
		MissionID:  r.BeaconDir.CurrentMissionID,
		Status:     "active",
		Objectives: objectives,
		ServerTime: r.T,
	}
	p.SendMessage("mission:update", msg)
}

func (r *Room) BroadcastObjectiveComplete(p *Player, objectiveID string) {
	// Check if all objectives complete -> mission complete
	allComplete := len(r.BeaconDir.ActiveObjectives) == 0

	status := "active"
	if allComplete {
		status = "completed"
		r.HandleMissionStoryEventLocked(p, "mission:completed", 0)
	}

	msg := MissionUpdateDTO{
		MissionID:  r.BeaconDir.CurrentMissionID,
		Status:     status,
		Objectives: buildObjectiveStates(r, p),
		ServerTime: r.T,
	}
	p.SendMessage("mission:update", msg)
}
```

**Task Checklist**:
- [ ] Add `MissionOfferDTO` struct to `internal/server/dto.go`
- [ ] Add `MissionUpdateDTO` struct to `internal/server/dto.go`
- [ ] Add `ObjectiveStateDTO` struct to `internal/server/dto.go`
- [ ] Add `MissionAcceptDTO` struct to `internal/server/dto.go`
- [ ] Add `"mission:accept"` case to `handlePlayerMessage` in `ws.go`
- [ ] Implement `BroadcastMissionOffer()` in `room.go`
- [ ] Implement `BroadcastObjectiveProgress()` in `room.go`
- [ ] Implement `BroadcastObjectiveComplete()` in `room.go`
- [ ] Add helper functions: `archetypeToString()`, `generateObjectiveDescriptions()`, `getEvaluatorType()`
- [ ] Add `AcceptMission()` method to BeaconDirector
- [ ] Add `CurrentMissionID` field to BeaconDirector

**Acceptance Criteria**:
- Server sends `mission:offer` message when mission becomes available
- Client can send `mission:accept` message and server processes it
- Server sends `mission:update` with progress values on objective progress
- Server sends `mission:update` with status="completed" when all objectives done
- WebSocket messages are valid JSON and match DTO schema

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

## Testing & Validation

### Integration Test Scenarios

1. **Mission Template Loading**:
   - Start server
   - Verify `GetTemplate("campaign-1")` returns valid template
   - Verify template validation passes

2. **Objective Evaluation**:
   - Spawn player at (0, 0)
   - Create DistanceEvaluator for (1000, 1000) with threshold 100
   - Move player toward target
   - Verify progress increases from 0.0 → 1.0
   - Verify complete=true when within threshold

3. **Mission Lifecycle**:
   - Join room with campaign mode
   - Verify `mission:offer` message received
   - Send `mission:accept` message
   - Verify mission starts and story node "intro" displays
   - Complete first beacon
   - Verify `mission:update` with increased progress
   - Verify story node "beacon-1-locked" displays

4. **Story DAG Integration**:
   - Start mission → verify "intro" node shows
   - Lock beacon 1 → verify "beacon-1-locked" shows with tutorial tip
   - Lock beacon 2 → verify "beacon-2-locked" shows with choice
   - Complete mission → verify "mission-complete" shows
   - Verify flags set: "encounter-1-briefed", "campaign-1-complete"

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
