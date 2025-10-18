# New Upgrades - Backend Implementation (Aligned with Current Code)

This plan reuses existing effect types in the DAG and applies upgrade effects on the server without changing protobuf enums. Target (ship vs missile) is inferred from node IDs or a simple payload hint.

## Step 1: Reuse Existing Effect Types

No changes to `internal/dag/graph.go`. Use:
- `EffectSpeedMultiplier`
- `EffectMissileUnlock`
- `EffectHeatCapacity`
- `EffectHeatEfficiency`

Disambiguate by node ID prefix and/or `Payload["target"]`:
- `upgrade.ship.*` → ship
- `upgrade.missile.*` → missile

## Step 2: Create Upgrade Nodes

Add `internal/dag/upgrades.go` with 20 nodes (4×5 tiers). Example pattern:

```go
package dag

func SeedUpgradeNodes() []*Node {
    return []*Node{
        // Ship Speed
        { ID: "upgrade.ship.speed_1", Kind: NodeKindUpgrade, Label: "Engine Boost I", DurationS: 30,
          Effects: []UpgradeEffect{{ Type: EffectSpeedMultiplier, Value: 1.10 }},
          Payload: map[string]string{"target": "ship", "description": "+10% max ship speed"}, },
        { ID: "upgrade.ship.speed_2", Kind: NodeKindUpgrade, Label: "Engine Boost II", DurationS: 60, Requires: []NodeID{"upgrade.ship.speed_1"},
          Effects: []UpgradeEffect{{ Type: EffectSpeedMultiplier, Value: 1.20 }},
          Payload: map[string]string{"target": "ship", "description": "+20% max ship speed"}, },
        // ... tiers 3–5

        // Missile Speed
        { ID: "upgrade.missile.speed_1", Kind: NodeKindUpgrade, Label: "Warhead Boost I", DurationS: 30,
          Effects: []UpgradeEffect{{ Type: EffectSpeedMultiplier, Value: 1.10 }},
          Payload: map[string]string{"target": "missile", "description": "+10% max missile speed"}, },
        // ... tiers 2–5

        // Ship Heat Capacity
        { ID: "upgrade.ship.heat_cap_1", Kind: NodeKindUpgrade, Label: "Cooling System I", DurationS: 30,
          Effects: []UpgradeEffect{{ Type: EffectHeatCapacity, Value: 1.10 }},
          Payload: map[string]string{"target": "ship", "description": "+10% ship heat capacity"}, },
        // ... tiers 2–5

        // Missile Heat Capacity
        { ID: "upgrade.missile.heat_cap_1", Kind: NodeKindUpgrade, Label: "Thermal Shield I", DurationS: 30,
          Effects: []UpgradeEffect{{ Type: EffectHeatCapacity, Value: 1.10 }},
          Payload: map[string]string{"target": "missile", "description": "+10% missile heat capacity"}, },
        // ... tiers 2–5
    }
}
```

Keep durations doubling per tier: 30s, 60s, 120s, 240s, 480s. Effects stack linearly vs base (1.10 → 1.50); within a path, later tier replaces earlier.

## Step 3: Initialize in `app.go`

Append upgrade nodes to the existing set:

```go
craftNodes := dag.SeedMissileCraftNodes()
storyNodes := dag.SeedStoryNodes()
upgradeNodes := dag.SeedUpgradeNodes()
nodes := append(append(craftNodes, storyNodes...), upgradeNodes...)
if err := dag.Init(nodes); err != nil { /* handle */ }
```

## Step 4: Apply Effects Server‑Side (No enum changes)

Apply per player at the appropriate points:

1) Missile speed upgrades
- Compute the highest missile speed multiplier from completed `upgrade.missile.speed_*` nodes.
- Increase that player’s `MissileConfig.SpeedMax` or clamp logic accordingly before sending state (client already clamps to `speed_max`).

2) Ship speed upgrades
- Compute the highest ship speed multiplier from `upgrade.ship.speed_*`.
- Clamp waypoint speeds to `BASE_SHIP_MAX * multiplier` wherever speeds are set/enforced.

3) Ship heat capacity upgrades
- On ship spawn/reset, scale `HeatParams` (Max/WarnAt/OverheatAt) by the highest ship heat capacity multiplier.

4) Missile heat capacity upgrades
- On missile launch, scale missile heat params similarly by the highest missile heat capacity multiplier.

Implementation tips
- Identify target via `strings.HasPrefix(node.ID, "upgrade.ship.")` or `Payload["target"]`.
- Choose “highest completed tier” per path so tiers replace, not multiply.

## Step 5: Optional – Capabilities View

Optionally populate existing `PlayerCapabilities` fields (already defined in proto) as a convenience view:
- `speed_multiplier`: set to the ship speed multiplier (or a representative combined value)
- `heat_capacity`: set to the ship heat capacity multiplier
- `heat_efficiency`: leave as 1.0 unless modeled
- `unlocked_missiles`: carry through unlocks

Gameplay should not depend on client applying capabilities; enforce all limits server‑side.

## Step 6: Test

- DAG shows 20 upgrade nodes; start/complete works.
- Missile speed slider max increases after missile speed upgrades.
- Ship waypoint speeds clamp to new max.
- Heat meters reflect increased capacity for ship/missiles after upgrades.
