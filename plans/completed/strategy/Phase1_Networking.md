# Phase 1 Networking Layer: Enhanced Route Planning & Heat Visualization

**Objective**: Define WebSocket messages and DTOs for waypoint manipulation and heat synchronization.

---

## 1.1 New WebSocket Message Types

### Client → Server Messages

#### Move Waypoint

**File**: `internal/server/dto.go`

```go
type moveWaypointDTO struct {
    Index int     `json:"index"` // Waypoint index in route
    X     float64 `json:"x"`     // New X position
    Y     float64 `json:"y"`     // New Y position
}
```

**Message Format**:
```json
{
    "type": "move_waypoint",
    "index": 2,
    "x": 1234.5,
    "y": 678.9
}
```

**Handler** (`internal/server/ws.go`):
```go
case "move_waypoint":
    var dto moveWaypointDTO
    if err := json.Unmarshal(msg.Data, &dto); err == nil {
        room.MoveShipWaypoint(shipID, dto.Index, game.Vec2{dto.X, dto.Y})
    }
```

**Validation**:
- Check index bounds: `0 <= index < len(waypoints)`
- No position validation (allow any coordinate)
- Rate limit: Max 60 updates/second per client

---

#### Clear Waypoints (Hold Command)

**Existing message**, no new DTO needed:
```json
{
    "type": "clear_waypoints"
}
```

Already handled in `ws.go` - clears all waypoints from ship route.

---

### Server → Client Messages

#### Ship Snapshot with Heat Parameters

**File**: `internal/server/dto.go`

Update existing `shipSnapshotDTO` to include full heat parameters:

```go
type shipHeatViewDTO struct {
    Value      float64 `json:"value"`       // Current heat level
    Max        float64 `json:"max"`         // Maximum heat (same as overheatAt)
    WarnAt     float64 `json:"warnAt"`      // Warning threshold (yellow)
    OverheatAt float64 `json:"overheatAt"`  // Overheat threshold (red)
    KUp        float64 `json:"kUp"`         // Heat accumulation rate
    KDown      float64 `json:"kDown"`       // Heat dissipation rate
    Vmin       float64 `json:"vmin"`        // Speed threshold for heat
}

// Update shipSnapshotDTO
type shipSnapshotDTO struct {
    X          float64             `json:"x"`
    Y          float64             `json:"y"`
    Vx         float64             `json:"vx"`
    Vy         float64             `json:"vy"`
    Hp         float64             `json:"hp"`
    MaxHp      float64             `json:"maxHp"`
    Heat       *shipHeatViewDTO    `json:"heat"`      // NEW: Full heat state
    Waypoints  []waypointViewDTO   `json:"waypoints"`
    // ... other fields
}
```

**Serialization** (`internal/server/ws.go`):
```go
func serializeShipSnapshot(ship *game.ShipSnapshot) shipSnapshotDTO {
    dto := shipSnapshotDTO{
        X:     ship.Pos.X,
        Y:     ship.Pos.Y,
        Vx:    ship.Vel.X,
        Vy:    ship.Vel.Y,
        Hp:    ship.HP,
        MaxHp: ship.MaxHP,
        // ... other fields
    }

    // Serialize heat if present
    if ship.Heat != nil {
        dto.Heat = &shipHeatViewDTO{
            Value:      ship.Heat.S.Value,
            Max:        ship.Heat.P.OverheatAt,
            WarnAt:     ship.Heat.P.WarnAt,
            OverheatAt: ship.Heat.P.OverheatAt,
            KUp:        ship.Heat.P.KUp,
            KDown:      ship.Heat.P.KDown,
            Vmin:       ship.Heat.P.Vmin,
        }
    }

    return dto
}
```

---

## 1.2 Message Flow Diagrams

### Waypoint Dragging

```
Client                          Server
  |                               |
  |  (User drags waypoint)        |
  |  move_waypoint (idx=2, x, y)  |
  |------------------------------>|
  |                               |
  |  (Optimistic local update)    | (Validate & update)
  |  Update UI immediately        | room.MoveShipWaypoint()
  |                               |
  |       snapshot (next tick)    |
  |<------------------------------|
  |                               |
  | (Reconcile if mismatch)       |
  |                               |
```

**Optimistic Updates**:
- Client updates local state immediately for smooth dragging
- Server sends canonical state on next tick
- Client reconciles if server position differs (rare)

---

### Heat Projection

```
Client                          Server
  |                               |
  | (Route changes)               |
  | Request heat params           |
  |------------------------------>|
  |                               |
  |       snapshot (heat params)  |
  |<------------------------------|
  |                               |
  | (Calculate locally)           |
  | for wp in waypoints:          |
  |   heat = estimate(wp, params) |
  |   draw heat color             |
  |                               |
```

**Design Decision**: Heat projection is **client-side** calculation
- **Why**: Reduces server load, faster UX
- **Trade-off**: Client and server heat calculations may diverge slightly
- **Mitigation**: Periodically sync actual heat from server snapshots

---

## 1.3 Bandwidth Analysis

### Current State (Before Phase 1)

**Per ship snapshot** (~80 bytes):
```
x, y, vx, vy: 32 bytes
hp, maxHp: 16 bytes
waypoints (avg 3): ~30 bytes
heat value: 8 bytes
```

**Per tick** (60 ticks/s, 4 ships): ~19 KB/s

---

### After Phase 1 (With Full Heat Params)

**Per ship snapshot** (~120 bytes):
```
x, y, vx, vy: 32 bytes
hp, maxHp: 16 bytes
waypoints (avg 3): 30 bytes
heat (full params): 56 bytes  ← +48 bytes
```

**Per tick** (60 ticks/s, 4 ships): ~28 KB/s

**Impact**: +47% bandwidth increase

---

### Optimization: Send Heat Params Once

**Solution**: Send heat parameters only on ship spawn, not every tick

```go
// One-time message when ship joins
type shipJoinedDTO struct {
    ShipID     string           `json:"shipId"`
    HeatParams shipHeatViewDTO  `json:"heatParams"`
}

// Regular snapshot (every tick)
type shipSnapshotDTO struct {
    // ... position, velocity, etc.
    HeatValue float64 `json:"heatValue"` // Only current value
}
```

**Bandwidth after optimization**: ~20 KB/s (+5% instead of +47%)

---

## 1.4 Rate Limiting

**Waypoint Move Messages**:
- Client-side throttle: Max 60 msgs/second (per frame)
- Server-side rate limit: Max 100 msgs/second per client
- If exceeded: Drop messages, log warning

**Implementation** (`internal/server/ws.go`):
```go
type clientRateLimiter struct {
    lastMessageTime time.Time
    messageCount    int
}

func (rl *clientRateLimiter) Allow() bool {
    now := time.Now()
    if now.Sub(rl.lastMessageTime) > time.Second {
        rl.messageCount = 0
        rl.lastMessageTime = now
    }

    rl.messageCount++
    return rl.messageCount <= 100
}
```

---

## 1.5 Error Handling

### Client-Side Errors

**Invalid waypoint index**:
```typescript
// Client validates before sending
if (index >= 0 && index < state.me.waypoints.length) {
    sendMessage({ type: "move_waypoint", index, x, y });
} else {
    console.warn("Invalid waypoint index:", index);
}
```

**Network disconnection**:
```typescript
// Queue messages during reconnection
if (!wsConnected) {
    messageQueue.push({ type: "move_waypoint", index, x, y });
} else {
    sendMessage({ type: "move_waypoint", index, x, y });
}
```

### Server-Side Errors

**Invalid index**: Silently ignore (bounds check in `MoveShipWaypoint`)
**Malformed JSON**: Log error, continue processing other messages
**Rate limit exceeded**: Drop message, send warning to client (optional)

---

## 1.6 Testing Scenarios

- [ ] **Rapid dragging**: Drag waypoint quickly, verify smooth motion
- [ ] **Multi-client sync**: Drag waypoint, verify other clients see update
- [ ] **Packet loss**: Simulate 10% packet loss, verify graceful degradation
- [ ] **Rate limiting**: Send 200 msgs/second, verify server throttles
- [ ] **Reconnection**: Disconnect during drag, verify state recovers
- [ ] **Heat param sync**: Verify heat params sent only once per ship

---

## 1.7 Future Enhancements

**Batch Waypoint Updates**:
```json
{
    "type": "batch_move_waypoints",
    "updates": [
        { "index": 0, "x": 100, "y": 200 },
        { "index": 1, "x": 300, "y": 400 }
    ]
}
```

**Undo/Redo Support**:
```json
{
    "type": "undo_waypoint_move"
}
```

**Predictive Reconciliation**:
- Client predicts server response
- Corrects only if prediction wrong
- Smoother UX during high latency
