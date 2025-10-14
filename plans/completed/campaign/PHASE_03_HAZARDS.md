# Phase 3 – Hazard Waves

Scope
- Spawn escalating missile hazards between beacons as the player progresses.
- Waves tied to beacon locks: after B1→Wave 1, after B2→Wave 2, after B3→Wave 3.
- Use missiles as mines/patrollers/seekers with increasing heat capacity, speed, and agro radius.

Wave Specs (starting points)
- Wave 1 (B1→B2 corridor):
  - Mines: stationary missiles (agro 0), lifetime 120–160s
  - Heat: max 40, warn 28, overheat 40, marker 60, kUp 20, kDown 14
  - Count: 18–24 distributed to form a navigable corridor

- Wave 2 (B2→B3 corridor):
  - Mines: denser; add slow patrollers (speed 20–40, agro ~300), lifetime 160–200s
  - Heat: max 50, warn 35, overheat 50, marker 100, kUp 24, kDown 12
  - Count: 28–36

- Wave 3 (B3→B4 corridor):
  - Seekers: few slow/medium (speed 60–100), agro 600–900; plus some mines, lifetime 200–260s
  - Heat: max 60–70, warn 42–49, overheat 60–70, marker 120, kUp 20, kDown 15
  - Count: 6–10 seekers + supporting mines

## Implementation Requirements

### Server Helpers (NEW - must implement)
**File**: `internal/game/room.go` or new `internal/game/mission.go`

**Status**: ❌ Does NOT exist yet. Must build these APIs.

**Required functions**:
```go
// SpawnMinefield creates stationary hazards in a region
func (r *Room) SpawnMinefield(cx, cy, count int, radius float64, heatParams HeatParams, lifetime float64)

// SpawnPatrollers creates slow-moving hazards along a path
func (r *Room) SpawnPatrollers(waypoints []Vec2, count int, speedRange [2]float64, agro float64, heatParams HeatParams, lifetime float64)

// SpawnSeekers creates homing hazards in a band
func (r *Room) SpawnSeekers(cx, cy, count int, ringRadius float64, speedRange [2]float64, agroRange [2]float64, heatParams HeatParams, lifetime float64)
```

**Implementation notes**:
- Ownership: Use empty string `""` or `"mission"` as neutral owner (threaten all players)
- Call existing `LaunchMissile` with fixed/localized waypoints
- For mines: agro 0, single waypoint at spawn position
- For patrollers: agro 100-500, 2-3 waypoint loop
- For seekers: agro 600-900, waypoints in target direction
- Set custom `HeatParams` per wave spec

### WebSocket Message Handler (NEW)
**File**: `internal/server/ws.go`

**Add message type** to `wsMsg` struct:
```go
// mission wave spawning
WaveIndex int `json:"wave_index,omitempty"`
```

**Add handler** in message loop:
```go
case "mission_spawn_wave":
  // Parse wave index (1, 2, or 3)
  // Call appropriate spawn helper with wave params
  // Only allow if room is in campaign mode
```

### Triggering
- Client emits `mission:beacon-locked(i)` → send WS message `{type: "mission_spawn_wave", wave_index: i}`
- Server receives message, validates campaign mode, spawns configured wave
- Alternative (future): Server could track mission state and spawn automatically

## Deliverables
- ✅ Wave configuration specs (defined above)
- ❌ Server spawn helper functions (must implement)
- ❌ WebSocket message handler for wave spawning (must implement)
- ❌ Client-side wave spawn triggers on beacon lock (must implement)
- Missiles persist longer and get tougher/stronger each wave
- Parameters are centralized so tuning is quick

## Technical Notes
**Dependencies**:
- Requires neutral missile ownership from Phase 1
- Requires `mission:beacon-locked` events from Phase 2
- Uses existing `LaunchMissile()` but needs wrapper helpers

**Estimated work**: 3-4 hours
- 2 hours: Server spawn helper functions
- 1 hour: WebSocket handler and validation
- 1 hour: Client-side trigger wiring and testing

