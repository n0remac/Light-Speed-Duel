# New Upgrades - Backend Implementation

## Step 1: Add New Effect Types

Update `internal/dag/graph.go`:

```go
// EffectType describes the type of effect an upgrade provides.
type EffectType int

const (
    EffectSpeedMultiplier EffectType = iota
    EffectMissileUnlock
    EffectHeatCapacity
    EffectHeatEfficiency
    // New effect types for granular upgrades
    EffectShipSpeedMultiplier
    EffectMissileSpeedMultiplier
    EffectShipHeatCapacity
    EffectMissileHeatCapacity
)
```

## Step 2: Create Upgrade Nodes

Create `internal/dag/upgrades.go`:

```go
package dag

func SeedUpgradeNodes() []*Node {
    return []*Node{
        // ========== Ship Speed Upgrades ==========
        {
            ID:        "upgrade.ship.speed_1",
            Kind:      NodeKindUpgrade,
            Label:     "Engine Boost I",
            DurationS: 30,
            Requires:  []NodeID{},
            Effects: []UpgradeEffect{
                {Type: EffectShipSpeedMultiplier, Value: 1.1},
            },
            Payload: map[string]string{
                "description": "Increase maximum ship speed by 10%",
            },
        },
        {
            ID:        "upgrade.ship.speed_2",
            Kind:      NodeKindUpgrade,
            Label:     "Engine Boost II",
            DurationS: 60,
            Requires:  []NodeID{"upgrade.ship.speed_1"},
            Effects: []UpgradeEffect{
                {Type: EffectShipSpeedMultiplier, Value: 1.2},
            },
            Payload: map[string]string{
                "description": "Increase maximum ship speed by 20%",
            },
        },
        {
            ID:        "upgrade.ship.speed_3",
            Kind:      NodeKindUpgrade,
            Label:     "Engine Boost III",
            DurationS: 120,
            Requires:  []NodeID{"upgrade.ship.speed_2"},
            Effects: []UpgradeEffect{
                {Type: EffectShipSpeedMultiplier, Value: 1.3},
            },
            Payload: map[string]string{
                "description": "Increase maximum ship speed by 30%",
            },
        },
        {
            ID:        "upgrade.ship.speed_4",
            Kind:      NodeKindUpgrade,
            Label:     "Engine Boost IV",
            DurationS: 240,
            Requires:  []NodeID{"upgrade.ship.speed_3"},
            Effects: []UpgradeEffect{
                {Type: EffectShipSpeedMultiplier, Value: 1.4},
            },
            Payload: map[string]string{
                "description": "Increase maximum ship speed by 40%",
            },
        },
        {
            ID:        "upgrade.ship.speed_5",
            Kind:      NodeKindUpgrade,
            Label:     "Engine Boost V",
            DurationS: 480,
            Requires:  []NodeID{"upgrade.ship.speed_4"},
            Effects: []UpgradeEffect{
                {Type: EffectShipSpeedMultiplier, Value: 1.5},
            },
            Payload: map[string]string{
                "description": "Increase maximum ship speed by 50%",
            },
        },

        // ========== Missile Speed Upgrades ==========
        {
            ID:        "upgrade.missile.speed_1",
            Kind:      NodeKindUpgrade,
            Label:     "Warhead Boost I",
            DurationS: 30,
            Requires:  []NodeID{},
            Effects: []UpgradeEffect{
                {Type: EffectMissileSpeedMultiplier, Value: 1.1},
            },
            Payload: map[string]string{
                "description": "Increase missile speed by 10%",
            },
        },
        {
            ID:        "upgrade.missile.speed_2",
            Kind:      NodeKindUpgrade,
            Label:     "Warhead Boost II",
            DurationS: 60,
            Requires:  []NodeID{"upgrade.missile.speed_1"},
            Effects: []UpgradeEffect{
                {Type: EffectMissileSpeedMultiplier, Value: 1.2},
            },
            Payload: map[string]string{
                "description": "Increase missile speed by 20%",
            },
        },
        {
            ID:        "upgrade.missile.speed_3",
            Kind:      NodeKindUpgrade,
            Label:     "Warhead Boost III",
            DurationS: 120,
            Requires:  []NodeID{"upgrade.missile.speed_2"},
            Effects: []UpgradeEffect{
                {Type: EffectMissileSpeedMultiplier, Value: 1.3},
            },
            Payload: map[string]string{
                "description": "Increase missile speed by 30%",
            },
        },
        {
            ID:        "upgrade.missile.speed_4",
            Kind:      NodeKindUpgrade,
            Label:     "Warhead Boost IV",
            DurationS: 240,
            Requires:  []NodeID{"upgrade.missile.speed_3"},
            Effects: []UpgradeEffect{
                {Type: EffectMissileSpeedMultiplier, Value: 1.4},
            },
            Payload: map[string]string{
                "description": "Increase missile speed by 40%",
            },
        },
        {
            ID:        "upgrade.missile.speed_5",
            Kind:      NodeKindUpgrade,
            Label:     "Warhead Boost V",
            DurationS: 480,
            Requires:  []NodeID{"upgrade.missile.speed_4"},
            Effects: []UpgradeEffect{
                {Type: EffectMissileSpeedMultiplier, Value: 1.5},
            },
            Payload: map[string]string{
                "description": "Increase missile speed by 50%",
            },
        },

        // ========== Ship Heat Capacity Upgrades ==========
        {
            ID:        "upgrade.ship.heat_cap_1",
            Kind:      NodeKindUpgrade,
            Label:     "Cooling System I",
            DurationS: 30,
            Requires:  []NodeID{},
            Effects: []UpgradeEffect{
                {Type: EffectShipHeatCapacity, Value: 1.1},
            },
            Payload: map[string]string{
                "description": "Increase ship heat capacity by 10%",
            },
        },
        {
            ID:        "upgrade.ship.heat_cap_2",
            Kind:      NodeKindUpgrade,
            Label:     "Cooling System II",
            DurationS: 60,
            Requires:  []NodeID{"upgrade.ship.heat_cap_1"},
            Effects: []UpgradeEffect{
                {Type: EffectShipHeatCapacity, Value: 1.2},
            },
            Payload: map[string]string{
                "description": "Increase ship heat capacity by 20%",
            },
        },
        {
            ID:        "upgrade.ship.heat_cap_3",
            Kind:      NodeKindUpgrade,
            Label:     "Cooling System III",
            DurationS: 120,
            Requires:  []NodeID{"upgrade.ship.heat_cap_2"},
            Effects: []UpgradeEffect{
                {Type: EffectShipHeatCapacity, Value: 1.3},
            },
            Payload: map[string]string{
                "description": "Increase ship heat capacity by 30%",
            },
        },
        {
            ID:        "upgrade.ship.heat_cap_4",
            Kind:      NodeKindUpgrade,
            Label:     "Cooling System IV",
            DurationS: 240,
            Requires:  []NodeID{"upgrade.ship.heat_cap_3"},
            Effects: []UpgradeEffect{
                {Type: EffectShipHeatCapacity, Value: 1.4},
            },
            Payload: map[string]string{
                "description": "Increase ship heat capacity by 40%",
            },
        },
        {
            ID:        "upgrade.ship.heat_cap_5",
            Kind:      NodeKindUpgrade,
            Label:     "Cooling System V",
            DurationS: 480,
            Requires:  []NodeID{"upgrade.ship.heat_cap_4"},
            Effects: []UpgradeEffect{
                {Type: EffectShipHeatCapacity, Value: 1.5},
            },
            Payload: map[string]string{
                "description": "Increase ship heat capacity by 50%",
            },
        },

        // ========== Missile Heat Capacity Upgrades ==========
        {
            ID:        "upgrade.missile.heat_cap_1",
            Kind:      NodeKindUpgrade,
            Label:     "Thermal Shield I",
            DurationS: 30,
            Requires:  []NodeID{},
            Effects: []UpgradeEffect{
                {Type: EffectMissileHeatCapacity, Value: 1.1},
            },
            Payload: map[string]string{
                "description": "Increase missile heat capacity by 10%",
            },
        },
        {
            ID:        "upgrade.missile.heat_cap_2",
            Kind:      NodeKindUpgrade,
            Label:     "Thermal Shield II",
            DurationS: 60,
            Requires:  []NodeID{"upgrade.missile.heat_cap_1"},
            Effects: []UpgradeEffect{
                {Type: EffectMissileHeatCapacity, Value: 1.2},
            },
            Payload: map[string]string{
                "description": "Increase missile heat capacity by 20%",
            },
        },
        {
            ID:        "upgrade.missile.heat_cap_3",
            Kind:      NodeKindUpgrade,
            Label:     "Thermal Shield III",
            DurationS: 120,
            Requires:  []NodeID{"upgrade.missile.heat_cap_2"},
            Effects: []UpgradeEffect{
                {Type: EffectMissileHeatCapacity, Value: 1.3},
            },
            Payload: map[string]string{
                "description": "Increase missile heat capacity by 30%",
            },
        },
        {
            ID:        "upgrade.missile.heat_cap_4",
            Kind:      NodeKindUpgrade,
            Label:     "Thermal Shield IV",
            DurationS: 240,
            Requires:  []NodeID{"upgrade.missile.heat_cap_3"},
            Effects: []UpgradeEffect{
                {Type: EffectMissileHeatCapacity, Value: 1.4},
            },
            Payload: map[string]string{
                "description": "Increase missile heat capacity by 40%",
            },
        },
        {
            ID:        "upgrade.missile.heat_cap_5",
            Kind:      NodeKindUpgrade,
            Label:     "Thermal Shield V",
            DurationS: 480,
            Requires:  []NodeID{"upgrade.missile.heat_cap_4"},
            Effects: []UpgradeEffect{
                {Type: EffectMissileHeatCapacity, Value: 1.5},
            },
            Payload: map[string]string{
                "description": "Increase missile heat capacity by 50%",
            },
        },
    }
}
```

## Step 3: Initialize Upgrade Nodes

Update `internal/server/app.go`:

```go
func StartApp(addr string, cfg AppConfig) {
    heat := resolveHeatParams(cfg)
    hub := NewHub(heat)

    // Initialize DAG system with all node types
    craftNodes := dag.SeedMissileCraftNodes()
    storyNodes := dag.SeedStoryNodes()
    upgradeNodes := dag.SeedUpgradeNodes() // NEW
    nodes := append(craftNodes, storyNodes...)
    nodes = append(nodes, upgradeNodes...) // NEW

    if err := dag.Init(nodes); err != nil {
        log.Fatalf("failed to initialize DAG: %v", err)
    }
    log.Printf("DAG system initialized with %d nodes (%d craft, %d story, %d upgrade)",
        len(nodes), len(craftNodes), len(storyNodes), len(upgradeNodes)) // UPDATED

    // ... rest of function
}
```

## Step 4: Update Proto Definitions

Update `proto/ws_messages.proto`:

```protobuf
// Upgrade effect type enum
enum UpgradeEffectType {
  UPGRADE_EFFECT_TYPE_UNSPECIFIED = 0;
  UPGRADE_EFFECT_TYPE_SPEED_MULTIPLIER = 1;
  UPGRADE_EFFECT_TYPE_MISSILE_UNLOCK = 2;
  UPGRADE_EFFECT_TYPE_HEAT_CAPACITY = 3;
  UPGRADE_EFFECT_TYPE_HEAT_EFFICIENCY = 4;
  // New granular effect types
  UPGRADE_EFFECT_TYPE_SHIP_SPEED_MULTIPLIER = 5;
  UPGRADE_EFFECT_TYPE_MISSILE_SPEED_MULTIPLIER = 6;
  UPGRADE_EFFECT_TYPE_SHIP_HEAT_CAPACITY = 7;
  UPGRADE_EFFECT_TYPE_MISSILE_HEAT_CAPACITY = 8;
}
```

## Step 5: Update Proto Conversion

Update `internal/server/proto_convert.go`:

```go
// Convert upgrade effect type to proto enum
func effectTypeToProto(t dag.EffectType) pb.UpgradeEffectType {
    switch t {
    case dag.EffectSpeedMultiplier:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_SPEED_MULTIPLIER
    case dag.EffectMissileUnlock:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_MISSILE_UNLOCK
    case dag.EffectHeatCapacity:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_HEAT_CAPACITY
    case dag.EffectHeatEfficiency:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_HEAT_EFFICIENCY
    case dag.EffectShipSpeedMultiplier:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_SHIP_SPEED_MULTIPLIER
    case dag.EffectMissileSpeedMultiplier:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_MISSILE_SPEED_MULTIPLIER
    case dag.EffectShipHeatCapacity:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_SHIP_HEAT_CAPACITY
    case dag.EffectMissileHeatCapacity:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_MISSILE_HEAT_CAPACITY
    default:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_UNSPECIFIED
    }
}

// Convert upgrade effects to protobuf
func effectsToProto(effects []dag.UpgradeEffect) []*pb.UpgradeEffect {
    if len(effects) == 0 {
        return nil
    }

    result := make([]*pb.UpgradeEffect, len(effects))
    for i, effect := range effects {
        protoEffect := &pb.UpgradeEffect{
            Type: effectTypeToProto(effect.Type),
        }

        switch effect.Type {
        case dag.EffectSpeedMultiplier, dag.EffectHeatCapacity, dag.EffectHeatEfficiency,
            dag.EffectShipSpeedMultiplier, dag.EffectMissileSpeedMultiplier,
            dag.EffectShipHeatCapacity, dag.EffectMissileHeatCapacity:
            if multiplier, ok := effect.Value.(float64); ok {
                protoEffect.Value = &pb.UpgradeEffect_Multiplier{Multiplier: multiplier}
            }
        case dag.EffectMissileUnlock:
            if unlockID, ok := effect.Value.(string); ok {
                protoEffect.Value = &pb.UpgradeEffect_UnlockId{UnlockId: unlockID}
            }
        }

        result[i] = protoEffect
    }
    return result
}
```

## Step 6: Regenerate Proto Files

```bash
make proto
go build
```

## Testing

1. Start server: `./LightSpeedDuel`
2. Open lobby: `http://localhost:8080/lobby.html`
3. Open upgrades panel (should see 20 upgrade nodes in 4 categories)
4. Start an upgrade and verify countdown timer works
5. Complete an upgrade and verify it shows as completed

## Notes

- Upgrades are defined but **not yet applied** to gameplay
- Effects will need to be applied in Phase 2 (capabilities system)
- All 4 upgrade paths start unlocked and can be progressed independently
- Each path has linear prerequisites (must complete tier N before tier N+1)
