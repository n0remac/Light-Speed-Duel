# Phase 2 Backend Tasks

**Prerequisites**: Read [OVERVIEW.md](OVERVIEW.md) first for foundation specifications and contracts.

---

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

