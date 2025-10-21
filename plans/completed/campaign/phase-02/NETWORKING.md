# Phase 2 Networking & Message Contracts

**Prerequisites**: Read [OVERVIEW.md](OVERVIEW.md) for foundation specifications.

---

## WebSocket Message Contracts

### Server → Client Messages

#### MissionOfferDTO
Sent when mission becomes available (on room join or mission unlock).

```typescript
interface MissionOfferDTO {
  missionId: string;
  templateId: string;
  displayName: string;
  archetype: string;                   // "travel" | "escort" | "kill" | "hazard"
  objectives: string[];                // Human-readable list ["Reach 4 beacons", "Survive encounters"]
  storyNodeId: string;
  timeout: number;                     // 0 = no timeout
}
```

**Go Struct**:
```go
type MissionOfferDTO struct {
	MissionID   string   `json:"missionId"`
	TemplateID  string   `json:"templateId"`
	DisplayName string   `json:"displayName"`
	Archetype   string   `json:"archetype"`  // "travel" | "escort" | "kill" | "hazard"
	Objectives  []string `json:"objectives"` // Human-readable objective list
	StoryNodeID string   `json:"storyNodeId"`
	Timeout     float64  `json:"timeout"`    // 0 = no timeout
}
```

---

#### MissionUpdateDTO
Sent on objective progress change (>1% delta) or completion.

```typescript
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

**Go Structs**:
```go
type MissionUpdateDTO struct {
	MissionID  string              `json:"missionId"`
	Status     string              `json:"status"` // "active" | "completed" | "failed"
	Objectives []ObjectiveStateDTO `json:"objectives"`
	ServerTime float64             `json:"serverTime"`
}

type ObjectiveStateDTO struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"`  // "distance" | "kill" | "timer" | "hazard"
	Progress    float64 `json:"progress"` // 0.0 - 1.0
	Complete    bool    `json:"complete"`
	Description string  `json:"description"` // Generated server-side
}
```

---

### Client → Server Messages

#### MissionAcceptDTO
Sent by client to accept offered mission.

```typescript
interface MissionAcceptDTO {
  missionId: string;
}
```

**Go Struct**:
```go
type MissionAcceptDTO struct {
	MissionID string `json:"missionId"`
}
```

---

## WebSocket Handler Implementation

### Backend (Go)

**File**: `internal/server/ws.go`

Add to `handlePlayerMessage` switch:

```go
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

**Room Broadcast Helpers** (`internal/game/room.go`):

```go
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
	p.SendMessage("mission:offer", msg)
}

func (r *Room) BroadcastObjectiveProgress(p *Player, objectiveID string, progress float64) {
	// Build objective state from current evaluators
	objectives := []ObjectiveStateDTO{}
	for id, eval := range r.BeaconDir.ActiveObjectives {
		complete, prog := eval.Evaluate(r, p)
		objectives = append(objectives, ObjectiveStateDTO{
			ID:          id,
			Type:        getEvaluatorType(eval),
			Progress:    prog,
			Complete:    complete,
			Description: generateObjectiveDescription(eval),
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

---

### Frontend (TypeScript)

**File**: `internal/server/web/src/net.ts`

Add to `handleServerMessage` switch:

```typescript
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

**Send Mission Accept**:
```typescript
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
```

---

## Event Bus Contracts

### Client-Side Events

```typescript
// Server sent offer
bus.emit("mission:offered", offer: MissionOfferDTO)

// Client accepted mission
bus.emit("mission:start", { missionId: string })

// Server sent progress update
bus.emit("mission:update", update: MissionUpdateDTO)

// Objectives array updated
bus.emit("mission:objectives-updated", { objectives: ObjectiveState[] })

// Aggregate progress changed
bus.emit("mission:progress-changed", {
  progress: number,        // 0.0 - 1.0
  objectives: ObjectiveState[]
})

// Mission completed
bus.emit("mission:completed", { missionId: string })

// Mission failed
bus.emit("mission:failed", {
  missionId: string,
  reason?: string
})
```

---

## Integration Flow

### Mission Offer Flow
```
1. Player joins room
2. Backend: BeaconDirector.Init() → BroadcastMissionOffer()
3. Server sends "mission:offer" via WebSocket
4. Client receives in net.ts → updates state.mission
5. Client emits "mission:offered" on event bus
6. Mission controller listens → calls acceptMission()
7. Client sends "mission:accept" to server
8. Backend: BeaconDirector.AcceptMission() → start mission
```

### Objective Progress Flow
```
1. Backend: BeaconDirector.Tick() evaluates objectives
2. Progress changes > 1% → BroadcastObjectiveProgress()
3. Server sends "mission:update" via WebSocket
4. Client receives in net.ts → updateMissionObjectives()
5. Client emits "mission:objectives-updated"
6. Mission controller updates HUD display
7. Client emits "mission:progress-changed"
```

### Mission Completion Flow
```
1. Backend: All objectives complete
2. BroadcastObjectiveComplete() with status="completed"
3. Backend: HandleMissionStoryEventLocked("mission:completed")
4. Server sends "mission:update" status="completed"
5. Client receives → emits "mission:completed"
6. Story controller triggers "mission-complete" DAG node
7. HUD shows completion banner
```

---

## Message Timing & Throttling

- **Objective progress updates**: Max 10Hz (every 100ms), only if progress changes >1%
- **Mission offers**: Sent once on room join or mission unlock
- **Mission accept**: Sent once on user action
- **Completion/Failure**: Sent once when state changes

---

## Error Handling

### Client Errors
- Invalid missionId in accept → Server logs warning, no state change
- Missing fields in DTO → TypeScript validation error, fallback to defaults

### Server Errors
- Template not found → Log error, don't send offer
- Objective evaluator crash → Log error, skip that objective
- WebSocket send failure → Log error, retry next tick

---

## Testing

### WebSocket Message Tests
```bash
# Test mission offer
wscat -c ws://localhost:8080/ws
# Wait for mission:offer message
# Verify JSON matches MissionOfferDTO schema

# Test mission accept
# Send: {"type": "mission:accept", "payload": {"missionId": "campaign-1"}}
# Verify mission:update received

# Test objective progress
# Move player toward objective
# Verify mission:update messages with increasing progress
```

### Integration Tests
See [TESTING.md](TESTING.md) for full integration test scenarios.
