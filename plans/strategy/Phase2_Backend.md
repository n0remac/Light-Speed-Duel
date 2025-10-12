# Phase 2 Backend Changes: Missile Heat System Integration

**Objective**: Give missiles their own complete heat system, making them behave like autonomous ships with heat mechanics.

---

## 2.1 Missile Heat Architecture

### Design Philosophy

Missiles should behave like ships with their own heat mechanics:
- **Same heat dynamics**: Missiles use the same `HeatComponent` and heat physics as ships
- **Same route planning**: Missiles follow waypoint-based routes with speed control
- **Autonomous operation**: Once launched, missiles manage their own heat like independent ships
- **Different thresholds**: Missiles have different heat capacities and overheat behavior
- **Explosion on overheat**: Instead of stalling, overheated missiles explode

### Key Differences from Ships

| Property | Ships | Missiles |
|----------|-------|----------|
| Heat capacity | 100.0 (default) | Configurable (e.g., 50.0) |
| Overheat behavior | Stall for 2.5s | Explode (destroy missile) |
| Heat marker speed | 150.0 | Configurable per missile type |
| Control | Player-controlled waypoints | Pre-programmed route at launch |
| Heat management | Active player decision | Configured at launch time |

---

## 2.2 Missile Heat Component Setup

**File**: `internal/game/consts.go`

Add missile-specific heat constants:

```go
const (
    // Existing missile constants
    MissileMinSpeed             = 40.0
    MissileMaxSpeed             = ShipMaxSpeed
    // ... other constants ...

    // NEW: Missile heat system defaults
    MissileHeatMax          = 50.0  // Lower capacity than ships
    MissileHeatWarnAt       = 35.0  // 70% of max
    MissileHeatOverheatAt   = 50.0  // 100% of max
    MissileHeatMarkerSpeed  = 120.0 // Lower comfortable speed than ships
    MissileHeatKUp          = 28.0  // Heats up faster than ships
    MissileHeatKDown        = 12.0  // Cools down slower than ships
    MissileHeatExp          = 1.5   // Same response curve as ships
)
```

**Design Rationale**:
- **Lower capacity (50 vs 100)**: Missiles have less thermal mass, limited flight time
- **Faster heating (28 vs 22)**: Missiles are smaller, accumulate heat faster
- **Slower cooling (12 vs 16)**: Less cooling surface area
- **Lower marker speed (120 vs 150)**: Encourages slower, more efficient missile routes
- **No stall time**: Missiles explode instead of stalling

---

## 2.3 Missile Launch with Heat Configuration

**File**: `internal/game/ecs.go`

Update `MissileConfig` to include heat parameters:

```go
type MissileConfig struct {
    Speed       float64
    AgroRadius  float64
    Lifetime    float64

    // NEW: Heat configuration
    HeatParams  HeatParams  // Complete heat configuration for this missile
}

// Helper function to create default missile heat params
func DefaultMissileHeatParams() HeatParams {
    return HeatParams{
        Max:                MissileHeatMax,
        WarnAt:             MissileHeatWarnAt,
        OverheatAt:         MissileHeatOverheatAt,
        StallSeconds:       0.0,  // Missiles don't stall, they explode
        MarkerSpeed:        MissileHeatMarkerSpeed,
        Exp:                MissileHeatExp,
        KUp:                MissileHeatKUp,
        KDown:              MissileHeatKDown,
        MissileSpikeChance: 0.0,  // Missiles don't have heat spikes
        MissileSpikeMin:    0.0,
        MissileSpikeMax:    0.0,
    }
}

// Update sanitize function to include heat params
func SanitizeMissileConfig(cfg MissileConfig) MissileConfig {
    speed := Clamp(cfg.Speed, MissileMinSpeed, MissileMaxSpeed)
    agro := cfg.AgroRadius
    if agro < MissileMinAgroRadius {
        agro = MissileMinAgroRadius
    }
    lifetime := MissileLifetimeFor(speed, agro)

    // Sanitize heat params or use defaults
    heatParams := cfg.HeatParams
    if heatParams.Max <= 0 {
        heatParams = DefaultMissileHeatParams()
    } else {
        heatParams = SanitizeHeatParams(heatParams)
    }

    return MissileConfig{
        Speed:      speed,
        AgroRadius: agro,
        Lifetime:   lifetime,
        HeatParams: heatParams,
    }
}
```

---

## 2.4 Missile Creation with Heat Component

**File**: `internal/game/room.go`

Update missile creation to add `HeatComponent`:

```go
// LaunchMissile creates a missile entity with full heat system
func (r *Room) LaunchMissile(shipID EntityID, route *MissileRoute, cfg MissileConfig) error {
    // Sanitize configuration
    cfg = SanitizeMissileConfig(cfg)

    // Create missile entity
    missileID := r.World.NewEntity()

    // Add transform component
    startPos := route.Waypoints[0]
    r.World.Set(missileID, CompTransform, &Transform{
        Pos: startPos,
        Vel: Vec2{0, 0},
    })

    // Add movement component
    r.World.Set(missileID, compMovement, &Movement{
        MaxSpeed: cfg.Speed,
    })

    // Add missile component (agro, lifetime, etc.)
    r.World.Set(missileID, CompMissile, &MissileComponent{
        AgroRadius:  cfg.AgroRadius,
        LaunchTime:  r.Now,
        Lifetime:    cfg.Lifetime,
        WaypointIdx: 0,
        ReturnIdx:   len(route.Waypoints) - 1,
        Target:      0,  // No target yet
    })

    // Convert Vec2 waypoints to ShipWaypoint format for route component
    shipWaypoints := make([]ShipWaypoint, len(route.Waypoints))
    for i, wp := range route.Waypoints {
        shipWaypoints[i] = ShipWaypoint{
            Pos:   wp,
            Speed: cfg.Speed,  // All waypoints use config speed
        }
    }

    // Add route component (reuse ship route system)
    r.World.Set(missileID, compMissileRoute, &ShipRoute{
        Waypoints: shipWaypoints,
    })

    // NEW: Add heat component with missile-specific parameters
    r.World.Set(missileID, CompHeat, &HeatComponent{
        P: cfg.HeatParams,
        S: HeatState{
            Value:      0.0,  // Start at zero heat
            StallUntil: 0.0,  // Not used for missiles
        },
    })

    // Add owner component
    owner := r.World.Get(shipID, CompOwner).(*OwnerComponent)
    r.World.Set(missileID, CompOwner, &OwnerComponent{
        PlayerID: owner.PlayerID,
    })

    // Add history component for light-time delays
    r.World.Set(missileID, CompHistory, &HistoryComponent{
        History: NewHistory(HistoryKeepS),
    })

    return nil
}
```

---

## 2.5 Missile Heat Update System

**File**: `internal/game/systems.go`

Add heat update for missiles in the main game loop:

```go
// updateMissileHeat applies heat physics to all missiles
// Missiles that overheat explode instead of stalling
func updateMissileHeat(r *Room, dt float64) {
    r.World.ForEach([]ComponentKey{CompMissile, CompHeat, CompTransform}, func(id EntityID) {
        heat := r.World.Get(id, CompHeat).(*HeatComponent)
        transform := r.World.Get(id, CompTransform).(*Transform)

        // Calculate current speed
        speed := transform.Vel.Len()

        // Update heat using same physics as ships
        UpdateHeat(heat, speed, dt, r.Now)

        // Check for overheat explosion
        if heat.S.Value >= heat.P.OverheatAt {
            // Missile explodes when overheated
            r.World.Set(id, CompDestroyed, &DestroyedComponent{
                DestroyedAt: r.Now,
            })

            // Emit event for visual/audio feedback
            r.EventBus.Emit("missile:overheated", map[string]interface{}{
                "missileID": id,
                "pos":       transform.Pos,
            })
        }
    })
}

// Update the main Tick function to call this system
func (r *Room) Tick() {
    // ... existing systems ...

    updateMovement(r, Dt)
    updateMissileHoming(r)
    updateMissileHeat(r, Dt)  // NEW: Update missile heat
    updateCollisions(r)

    // ... rest of tick ...
}
```

---

## 2.6 Missile Configuration Presets

**File**: `internal/game/consts.go`

Define preset missile configurations with different heat profiles:

```go
// Missile preset types
type MissilePresetType int

const (
    MissilePresetScout MissilePresetType = iota
    MissilePresetHunter
    MissilePresetSniper
)

// GetMissilePreset returns a configured missile config for the given preset
func GetMissilePreset(preset MissilePresetType) MissileConfig {
    switch preset {
    case MissilePresetScout:
        // Slow, long-range, high heat capacity
        return MissileConfig{
            Speed:      80.0,
            AgroRadius: 1500.0,
            HeatParams: HeatParams{
                Max:         60.0,  // Higher capacity for long missions
                WarnAt:      42.0,
                OverheatAt:  60.0,
                MarkerSpeed: 70.0,  // Very efficient at low speed
                KUp:         20.0,  // Slower heating
                KDown:       15.0,  // Better cooling
                Exp:         1.5,
                // ... other params ...
            },
        }

    case MissilePresetHunter:
        // Balanced speed and detection
        return MissileConfig{
            Speed:      150.0,
            AgroRadius: 800.0,
            HeatParams: DefaultMissileHeatParams(),  // Use defaults
        }

    case MissilePresetSniper:
        // Fast, narrow detection, low heat capacity
        return MissileConfig{
            Speed:      220.0,
            AgroRadius: 300.0,
            HeatParams: HeatParams{
                Max:         40.0,  // Lower capacity, short-lived
                WarnAt:      28.0,
                OverheatAt:  40.0,
                MarkerSpeed: 180.0,  // Optimized for high speed
                KUp:         35.0,   // Heats very fast
                KDown:       8.0,    // Poor cooling
                Exp:         1.5,
                // ... other params ...
            },
        }

    default:
        cfg := MissileConfig{
            Speed:      150.0,
            AgroRadius: 600.0,
            HeatParams: DefaultMissileHeatParams(),
        }
        return SanitizeMissileConfig(cfg)
    }
}
```

---

## 2.7 Heat Projection for Missile Planning

**File**: `internal/game/heat.go`

The existing `ProjectHeatForRoute` function already works for missiles!
Since missiles use `ShipWaypoint` routes and `HeatComponent`, the projection
system works identically:

```go
// ProjectHeatForRoute works for both ships and missiles
// Just pass the missile's HeatParams and route
func (r *Room) GetMissileHeatProjection(cfg MissileConfig, route *MissileRoute) []float64 {
    // Convert missile route to ship waypoints
    waypoints := make([]ShipWaypoint, len(route.Waypoints))
    for i, wp := range route.Waypoints {
        waypoints[i] = ShipWaypoint{
            Pos:   wp,
            Speed: cfg.Speed,
        }
    }

    // Project heat along route (starts at 0 heat)
    return ProjectHeatForRoute(
        0.0,                    // Start at zero heat
        cfg.HeatParams,         // Missile-specific heat params
        route.Waypoints[0],     // Start position
        0.0,                    // Start speed
        waypoints,              // Route to project
    )
}
```

---

## 2.8 Network Protocol Updates

**File**: `internal/server/dto.go`

Update DTOs to include missile heat configuration:

```go
// missileConfigDTO now includes heat parameters
type missileConfigDTO struct {
    Speed      float64         `json:"speed"`
    AgroRadius float64         `json:"agroRadius"`
    HeatConfig *heatParamsDTO  `json:"heatConfig,omitempty"`  // Optional custom heat
}

type heatParamsDTO struct {
    Max         float64 `json:"max"`
    WarnAt      float64 `json:"warnAt"`
    OverheatAt  float64 `json:"overheatAt"`
    MarkerSpeed float64 `json:"markerSpeed"`
    KUp         float64 `json:"kUp"`
    KDown       float64 `json:"kDown"`
    Exp         float64 `json:"exp"`
}

// Convert DTO to game types
func (dto missileConfigDTO) ToGameConfig() MissileConfig {
    cfg := MissileConfig{
        Speed:      dto.Speed,
        AgroRadius: dto.AgroRadius,
    }

    // Use custom heat config if provided, otherwise use defaults
    if dto.HeatConfig != nil {
        cfg.HeatParams = HeatParams{
            Max:         dto.HeatConfig.Max,
            WarnAt:      dto.HeatConfig.WarnAt,
            OverheatAt:  dto.HeatConfig.OverheatAt,
            MarkerSpeed: dto.HeatConfig.MarkerSpeed,
            KUp:         dto.HeatConfig.KUp,
            KDown:       dto.HeatConfig.KDown,
            Exp:         dto.HeatConfig.Exp,
            StallSeconds: 0.0,  // Missiles don't stall
            // Spike params not used for missiles
        }
    } else {
        cfg.HeatParams = DefaultMissileHeatParams()
    }

    return SanitizeMissileConfig(cfg)
}

// Missile snapshot now includes heat info
type missileSnapshotDTO struct {
    ID         int64     `json:"id"`
    Pos        []float64 `json:"pos"`
    Vel        []float64 `json:"vel"`
    AgroRadius float64   `json:"agroRadius"`
    Target     *int64    `json:"target,omitempty"`
    Heat       *heatDTO  `json:"heat"`  // NEW: Include heat state
}

type heatDTO struct {
    Value      float64 `json:"value"`
    Max        float64 `json:"max"`
    WarnAt     float64 `json:"warnAt"`
    OverheatAt float64 `json:"overheatAt"`
}
```

---

## 2.9 Client Snapshot Generation

**File**: `internal/server/ws.go`

Update missile snapshot to include heat data:

```go
func makeMissileSnapshot(w *World, id EntityID, now float64) missileSnapshotDTO {
    transform := w.Get(id, CompTransform).(*Transform)
    missile := w.Get(id, CompMissile).(*MissileComponent)
    heat := w.Get(id, CompHeat).(*HeatComponent)  // Get heat component

    dto := missileSnapshotDTO{
        ID:         int64(id),
        Pos:        []float64{transform.Pos.X, transform.Pos.Y},
        Vel:        []float64{transform.Vel.X, transform.Vel.Y},
        AgroRadius: missile.AgroRadius,
    }

    if missile.Target != 0 {
        targetID := int64(missile.Target)
        dto.Target = &targetID
    }

    // NEW: Include heat data
    if heat != nil {
        dto.Heat = &heatDTO{
            Value:      heat.S.Value,
            Max:        heat.P.Max,
            WarnAt:     heat.P.WarnAt,
            OverheatAt: heat.P.OverheatAt,
        }
    }

    return dto
}
```

---

## 2.10 Testing & Validation

### Unit Tests

**File**: `internal/game/heat_test.go`

Add tests for missile heat behavior:

```go
func TestMissileHeatPhysics(t *testing.T) {
    cfg := GetMissilePreset(MissilePresetHunter)
    heat := &HeatComponent{
        P: cfg.HeatParams,
        S: HeatState{Value: 0.0, StallUntil: 0.0},
    }

    // Test heating above marker speed
    speed := 200.0  // Above marker speed of 120
    UpdateHeat(heat, speed, 1.0, 0.0)

    assert.True(t, heat.S.Value > 0, "Heat should increase above marker speed")

    // Test that missile reaches overheat
    for i := 0; i < 100; i++ {
        UpdateHeat(heat, speed, 1.0, float64(i))
        if heat.S.Value >= heat.P.OverheatAt {
            break
        }
    }

    assert.Equal(t, heat.P.OverheatAt, heat.S.Value, "Missile should reach overheat")
}

func TestMissileOverheatExplosion(t *testing.T) {
    room := NewTestRoom()

    // Create missile with very low heat capacity
    cfg := MissileConfig{
        Speed:      200.0,
        AgroRadius: 500.0,
        HeatParams: HeatParams{
            Max:         10.0,  // Very low capacity
            OverheatAt:  10.0,
            MarkerSpeed: 50.0,
            KUp:         50.0,  // Heats very fast
            // ... other params ...
        },
    }

    route := &MissileRoute{
        Waypoints: []Vec2{{X: 0, Y: 0}, {X: 1000, Y: 1000}},
    }

    shipID := room.CreateTestShip()
    err := room.LaunchMissile(shipID, route, cfg)
    assert.NoError(t, err)

    // Find the missile
    var missileID EntityID
    room.World.ForEach([]ComponentKey{CompMissile}, func(id EntityID) {
        missileID = id
    })

    // Simulate until missile overheats
    for i := 0; i < 100; i++ {
        room.Tick()

        // Check if destroyed
        destroyed := room.World.Get(missileID, CompDestroyed)
        if destroyed != nil {
            return  // Success - missile exploded
        }
    }

    t.Fatal("Missile should have exploded from overheat")
}

func TestMissileHeatProjection(t *testing.T) {
    room := NewTestRoom()
    cfg := GetMissilePreset(MissilePresetScout)

    route := &MissileRoute{
        Waypoints: []Vec2{
            {X: 0, Y: 0},
            {X: 1000, Y: 0},
            {X: 1000, Y: 1000},
        },
    }

    projection := room.GetMissileHeatProjection(cfg, route)

    assert.Equal(t, len(route.Waypoints)+1, len(projection))
    assert.Equal(t, 0.0, projection[0], "Should start at zero heat")
    assert.True(t, projection[len(projection)-1] >= 0, "Final heat should be non-negative")
}
```

---

## 2.11 Balancing Considerations

### Heat Capacity vs. Missile Performance

| Preset | Speed | Agro | Heat Max | Time to Overheat |
|--------|-------|------|----------|------------------|
| Scout  | 80    | 1500 | 60       | ~120s at max speed |
| Hunter | 150   | 800  | 50       | ~60s at max speed |
| Sniper | 220   | 300  | 40       | ~20s at max speed |

**Design Goals**:
- Scout missiles can travel long distances efficiently
- Hunter missiles balance speed and range
- Sniper missiles are short-lived burst damage
- All missiles require heat-conscious route planning

### Tuning Parameters

Adjust in `consts.go` during playtesting:

```go
// If missiles overheat too quickly:
MissileHeatMax     = 60.0  // Increase capacity
MissileHeatKUp     = 24.0  // Reduce heating rate

// If missiles last too long:
MissileHeatMax     = 45.0  // Decrease capacity
MissileHeatKUp     = 32.0  // Increase heating rate

// If missiles are too forgiving:
MissileHeatMarkerSpeed = 100.0  // Lower efficient speed
```

---

## 2.12 Strategic Implications

### Route Planning Matters
- **Slow approach, fast strike**: Plan efficient approach routes, burst speed near target
- **Cool-down periods**: Build waypoints with slower sections to manage heat
- **Overheat timing**: Calculate when missile will overheat based on route

### Missile Types Have Trade-offs
- **Scout**: Efficient long-range reconnaissance, but slow to strike
- **Hunter**: Balanced for most situations, requires moderate heat management
- **Sniper**: High-risk/high-reward fast strikes with tight heat margins

### Counter-play Opportunities
- **Dodge longer**: High-heat missiles will self-destruct if you evade long enough
- **Bait overheats**: Force missiles into high-speed pursuits to burn their heat
- **Environment**: Use terrain to force inefficient missile routes (future feature)

---

## 2.13 Implementation Priority

**High Priority** (Sprint 3-4):
- ✅ Add missile heat component to ECS
- ✅ Update missile creation with heat system
- ✅ Implement missile heat update and overheat explosion
- ✅ Update network protocol with heat data
- ✅ Add heat projection for missile planning

**Medium Priority** (Sprint 5):
- Missile preset configurations
- Heat balancing and playtesting
- Unit tests for missile heat physics

**Low Priority** (Future):
- Custom heat configuration UI
- Advanced missile heat strategies
- Heat-based missile AI improvements

---

## 2.14 Migration Notes

**Breaking Changes**:
- `MissileConfig` now requires `HeatParams`
- `missileSnapshotDTO` includes heat data (frontend must handle)
- Missiles will now self-destruct if overheated

**Backward Compatibility**:
- If `HeatConfig` is null in DTO, use `DefaultMissileHeatParams()`
- Frontend can ignore heat data for now (optional rendering)

---

## 2.15 Future Enhancements

### Heat-Based Missile Upgrades
```go
// Unlock better missile heat characteristics
type MissileUpgrade struct {
    Name          string
    HeatMaxBonus  float64  // +10 heat capacity
    CoolingBonus  float64  // +2 cooling rate
}
```

### Missile Heat Transfer
**Concept**: Nearby friendly ships can cool allied missiles
**Implementation**: Detect proximity, boost missile cooling rate
**Strategic Impact**: Encourages tactical positioning

### Environmental Cooling
**Concept**: Missiles cool faster near cooling stations (Phase 4)
**Implementation**: Modify heat params based on position
**Strategic Impact**: Enables longer missile flights via stations

---

**Last Updated**: 2025-10-11
**Version**: 2.0 (Complete Heat Integration)
