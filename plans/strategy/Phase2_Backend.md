# Phase 2 Backend Changes: Missile Economy & Heat Integration

**Objective**: Transform missiles from spam tools into tactical assets with heat costs.

---

## 2.1 Missile Launch Heat Cost

**File**: `internal/game/consts.go`

Add new constants for missile heat economics:

```go
const (
    // Existing missile constants
    MissileBaseCooldown = 5.0
    // ... other constants ...

    // NEW: Missile heat costs
    MissileLaunchHeatBase  = 15.0  // Base heat cost per missile launch
    MissileLaunchHeatScale = 0.1   // Additional heat cost per speed unit
    // Example: Speed 100 = 15 + (100 * 0.1) = 25 heat
    //          Speed 200 = 15 + (200 * 0.1) = 35 heat
)
```

**Design Rationale**:
- **Base cost (15)**: Prevents spam even at low speeds
- **Speed scaling (0.1)**: Faster missiles cost more (risk/reward)
- **Example costs**:
  - Slow missile (speed 80): 15 + 8 = 23 heat
  - Medium missile (speed 150): 15 + 15 = 30 heat
  - Fast missile (speed 220): 15 + 22 = 37 heat

**Tuning Parameters** (adjust during playtesting):
- If missiles too expensive → reduce base or scale
- If missiles still spammed → increase base or scale
- Target: ~3-4 missiles before overheat risk

---

## 2.2 Heat-Based Launch System

**File**: `internal/game/room.go`

Modify missile launch logic to check and deduct heat:

```go
// LaunchMissile creates a missile entity and deducts heat from the launching ship
// Returns error if ship lacks sufficient heat capacity
func (r *Room) LaunchMissile(shipID EntityID, route *MissileRoute, cfg MissileConfig) error {
    heat := r.World.HeatData(shipID)
    if heat == nil {
        return fmt.Errorf("ship has no heat component")
    }

    // Calculate launch cost
    launchCost := MissileLaunchHeatBase + (cfg.Speed * MissileLaunchHeatScale)

    // Check if launch would cause immediate overheat
    projectedHeat := heat.S.Value + launchCost
    if projectedHeat >= heat.P.OverheatAt {
        return fmt.Errorf("insufficient heat capacity (would overheat)")
    }

    // Apply heat cost BEFORE spawning missile
    heat.S.Value = projectedHeat

    // Emit event for analytics/sound
    r.EventBus.Emit("missile:launched", map[string]interface{}{
        "shipID":     shipID,
        "cost":       launchCost,
        "remaining":  heat.P.OverheatAt - heat.S.Value,
    })

    // ... existing missile spawn logic ...
    missileID := r.World.NewEntity()
    r.World.Set(missileID, CompTransform, &TransformComponent{
        Pos: route.Waypoints[0].Pos,
        Vel: Vec2{0, 0}, // Initial velocity
    })
    // ... rest of missile setup ...

    return nil
}
```

**Error Handling**:
- Return error if overheat would occur
- Client displays error message: "Too hot to launch!"
- Future: Allow "risky launch" that causes partial overheat

---

## 2.3 Launch Validation & Feedback

**File**: `internal/server/ws.go`

Update missile launch handler to return errors to client:

```go
case "missile_route":
    var dto missileRouteDTO
    if err := json.Unmarshal(msg.Data, &dto); err == nil {
        route := convertDTOToRoute(dto)
        cfg := getMissileConfig(shipID) // From ship's current config

        // Try to launch missile
        if err := room.LaunchMissile(shipID, route, cfg); err != nil {
            // Send error back to client
            errMsg := map[string]interface{}{
                "type":    "error",
                "code":    "launch_failed",
                "message": err.Error(),
            }
            json.NewEncoder(conn).Encode(errMsg)
        } else {
            // Success feedback (optional)
            successMsg := map[string]interface{}{
                "type": "missile_launched",
            }
            json.NewEncoder(conn).Encode(successMsg)
        }
    }
```

---

## 2.4 Missile Inventory System (Future)

**File**: `internal/game/ecs.go`

Add component for missile crafting/inventory:

```go
type MissileInventory struct {
    Ready    []MissileConfig // Missiles ready to launch
    Queue    []MissileConfig // Missiles being crafted
    MaxReady int             // Inventory capacity (e.g., 5)
}

const CompMissileInventory ComponentKey = "missile_inventory"
```

**File**: `internal/game/systems.go`

Add crafting system (runs each game tick):

```go
// updateMissileCrafting processes the missile crafting queue
// Missiles take time to build and consume resources
func updateMissileCrafting(r *Room, dt float64) {
    r.World.ForEach([]ComponentKey{CompMissileInventory, CompHeat}, func(id EntityID) {
        inv := r.World.MissileInventory(id)
        heat := r.World.HeatData(id)

        if inv == nil || heat == nil {
            return
        }

        // Process queue (first item)
        if len(inv.Queue) > 0 && len(inv.Ready) < inv.MaxReady {
            missile := &inv.Queue[0]

            // Accumulate "craft progress" from heat dissipation
            // Idea: Cooling cycles generate energy for crafting
            if heat.S.Value < heat.P.WarnAt {
                // Low heat = crafting active
                missile.CraftProgress += dt * 10.0 // Arbitrary craft rate

                if missile.CraftProgress >= 100.0 {
                    // Missile complete - move to ready
                    inv.Ready = append(inv.Ready, inv.Queue[0])
                    inv.Queue = inv.Queue[1:]
                }
            }
        }
    })
}
```

**Design Notes**:
- **Crafting as idle activity**: Encourages cooling down between fights
- **Queue limit**: Prevents hoarding (e.g., max 3 in queue)
- **Craft time**: ~10 seconds per missile (tunable)
- **Future**: Different missile types take different craft times

---

## 2.5 Heat Balancing Formula

### Current Heat System Recap

From `internal/game/consts.go`:
```go
const (
    HeatKUp   = 20.0  // Heat accumulation rate (heat/s when speeding)
    HeatKDown = 3.0   // Heat dissipation rate (heat/s when cooling)
    HeatVmin  = 150.0 // Speed threshold (heat if speed > this)
)
```

### Heat Capacity Analysis

**Assumptions**:
- Max heat = 100
- Overheat at = 100
- Warn at = 70

**Scenarios**:

| Scenario | Heat Cost | Time to Cool | Missiles Before Overheat |
|----------|-----------|--------------|--------------------------|
| Low-speed missiles (speed 80) | 23 | ~7.7s | 4 missiles |
| Medium missiles (speed 150) | 30 | ~10s | 3 missiles |
| High-speed missiles (speed 220) | 37 | ~12.3s | 2 missiles |

**Overheat Recovery Time**: 2.5 seconds (from `consts.go`)

**Strategic Depth**:
- Spamming fast missiles = overheat risk
- Mixing speeds = heat management mini-game
- Cooling between salvos = tactical pacing

---

## 2.6 Testing & Tuning

### Unit Tests

**File**: `internal/game/room_test.go`

```go
func TestMissileLaunchHeatCost(t *testing.T) {
    room := NewTestRoom()
    shipID := room.CreateTestShip()

    // Set ship heat to 70
    heat := room.World.HeatData(shipID)
    heat.S.Value = 70.0

    // Configure missile (speed 150 = cost 30)
    cfg := MissileConfig{Speed: 150, AgroRadius: 500}
    route := &MissileRoute{/* ... */}

    // Launch should succeed (70 + 30 = 100, exactly at overheat)
    err := room.LaunchMissile(shipID, route, cfg)
    assert.NoError(t, err)

    // Verify heat increased
    assert.Equal(t, 100.0, heat.S.Value)

    // Second launch should fail (already at overheat)
    err = room.LaunchMissile(shipID, route, cfg)
    assert.Error(t, err)
}
```

### Playtesting Metrics

Track in analytics:
- **Missiles per minute** (before/after): Target 60% reduction
- **Overheat frequency**: Should increase (heat management matters)
- **Match duration**: Should increase (slower pacing)
- **Player frustration**: Monitor for "too restrictive" feedback

---

## 2.7 Future Enhancements

### Aggressive Launch Mode

Allow launching even if it causes overheat:

```go
type launchMissileDTO struct {
    Route       missileRouteDTO `json:"route"`
    ForceRisky  bool            `json:"forceRisky"` // Allow overheat
}

func (r *Room) LaunchMissile(..., forceRisky bool) error {
    // ... calculate launch cost ...

    if projectedHeat >= heat.P.OverheatAt && !forceRisky {
        return fmt.Errorf("insufficient heat capacity")
    }

    // Apply heat even if it causes overheat
    heat.S.Value = projectedHeat
    if heat.S.Value >= heat.P.OverheatAt {
        // Trigger overheat event
        r.TriggerOverheat(shipID)
    }

    // ... launch missile ...
}
```

### Heat Transfer Mechanics

**Concept**: Nearby friendly ships share heat dissipation
**Implementation**: Bonus cooling when multiple ships cluster
**Strategic Impact**: Encourages formation flying

### Missile Salvos

**Concept**: Launch multiple missiles at once with bulk discount
**Example**: 3 missiles = 2.5x cost instead of 3x
**Strategic Impact**: Burst damage vs sustained fire trade-off

---

## Implementation Priority

**High Priority** (Sprint 3):
- ✅ Missile launch heat cost
- ✅ Launch validation and error handling

**Medium Priority** (Sprint 4):
- Heat balancing playtesting
- Tuning constants based on telemetry

**Low Priority** (Future sprints):
- Missile inventory/crafting system
- Aggressive launch mode
- Heat transfer mechanics
