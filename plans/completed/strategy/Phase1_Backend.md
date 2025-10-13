# Phase 1 Backend Changes: Enhanced Route Planning & Heat Visualization

**Objective**: Make route planning feel precise, visual, and physically meaningful.

---

## 1.1 Waypoint Mutation API

**File**: `internal/game/routes.go`

Add new method to Room for modifying waypoints after they're placed:

```go
// MoveShipWaypoint updates an existing waypoint position
// This allows drag-and-drop waypoint editing from the client
func (r *Room) MoveShipWaypoint(shipID EntityID, index int, newPos Vec2) {
    if route := r.World.ShipRoute(shipID); route != nil {
        if index >= 0 && index < len(route.Waypoints) {
            route.Waypoints[index].Pos = newPos
        }
    }
}
```

**Implementation Notes**:
- This mutation is authoritative on the server
- Client sends optimistic updates but server position is canonical
- No validation needed beyond bounds checking (index validity)
- Future: Add validation for waypoint placement (e.g., min distance between waypoints)

---

## 1.2 Heat Projection System

**File**: `internal/game/heat.go`

Add function to calculate projected heat along a planned route:

```go
// ProjectHeatForRoute simulates heat changes along a planned route
// Returns array of projected heat values at each waypoint
// projected[0] = current heat, projected[i] = heat after waypoint i-1
func ProjectHeatForRoute(current HeatComponent, waypoints []ShipWaypoint, now float64) []float64 {
    projected := make([]float64, len(waypoints)+1)
    projected[0] = current.S.Value
    h := current

    for i, wp := range waypoints {
        // Estimate time to reach waypoint
        // This is simplified - actual physics more complex
        // Consider: current velocity, target speed, distance

        // Estimate heat accumulation during acceleration/cruise
        // heatRate = f(speed, acceleration)
        // Integrate over segment

        // For now, placeholder logic:
        // - If speed > HeatVmin: accumulate heat
        // - If speed < HeatVmin: dissipate heat

        projected[i+1] = h.S.Value // TODO: Implement actual projection
    }

    return projected
}
```

**Implementation Strategy**:
1. **Phase 1a**: Simple projection based on waypoint speed only
   - `speed > HeatVmin`: add fixed heat per segment
   - `speed < HeatVmin`: subtract fixed heat per segment
2. **Phase 1b**: Time-based projection
   - Estimate segment duration based on distance and acceleration
   - Integrate heat rate over time
3. **Phase 1c**: Full physics simulation
   - Run lightweight simulation forward in time
   - Account for acceleration curves, velocity changes

**Alternative Approach**:
Instead of backend projection, send heat parameters to client and let client calculate projections locally. This reduces network traffic and server CPU.

---

## 1.3 Heat Parameter Synchronization

**File**: `internal/game/room.go` or `internal/server/ws.go`

Ensure heat parameters are sent to client on ship creation:

```go
// In shipSnapshotDTO or similar
type shipHeatViewDTO struct {
    Value      float64 `json:"value"`       // Current heat
    Max        float64 `json:"max"`         // Max heat (overheat threshold)
    WarnAt     float64 `json:"warnAt"`      // Warning threshold
    OverheatAt float64 `json:"overheatAt"`  // Overheat threshold
    KUp        float64 `json:"kUp"`         // Heat accumulation rate
    KDown      float64 `json:"kDown"`       // Heat dissipation rate
    Vmin       float64 `json:"vmin"`        // Minimum speed for heat
}
```

This allows client to:
- Calculate local heat projections
- Show accurate heat warnings
- Display heat rate information

---

## Implementation Priority

**High Priority** (Sprint 1):
- ✅ Waypoint mutation API (`MoveShipWaypoint`)
- ✅ Heat parameter synchronization (DTO updates)

**Medium Priority** (Sprint 2):
- Heat projection system (Phase 1a - simple version)

**Low Priority** (Future):
- Advanced heat projection (Phase 1b/1c)
- Waypoint validation rules

---

## Testing Checklist

- [ ] Test waypoint dragging with multiple clients
- [ ] Verify waypoint mutations are atomic and race-free
- [ ] Test heat projection accuracy against actual gameplay
- [ ] Verify heat parameters sync correctly on ship spawn
- [ ] Test edge cases (empty routes, single waypoint, etc.)

---

## Performance Considerations

- **Waypoint mutations**: Negligible overhead (simple array update)
- **Heat projection**: Could be expensive if called every frame
  - Solution: Cache projections, invalidate on route change
  - Solution: Move projection to client-side
- **Network traffic**: Heat parameters add ~40 bytes per ship
  - Acceptable overhead for improved UX
