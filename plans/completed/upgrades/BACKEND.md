# Upgrade System - Backend Plan

## Overview

**IMPORTANT:** This plan extends the existing DAG system in `internal/dag/` rather than creating parallel upgrade structures. Upgrade nodes use `NodeKindUpgrade` and hook into existing DAG progression logic.

## 1. Extend DAG Node Definition

### Add Effects to dag.Node

Modify `internal/dag/graph.go`:

```go
// UpgradeEffect describes what an upgrade does when completed
type UpgradeEffect struct {
    Type  EffectType
    Value interface{} // float64 for multipliers, string for unlocks
}

type EffectType int
const (
    EffectSpeedMultiplier EffectType = iota
    EffectMissileUnlock
    EffectHeatCapacity
    EffectHeatEfficiency
)

// Extend existing Node struct
type Node struct {
    ID         NodeID            `json:"id"`
    Kind       NodeKind          `json:"kind"`
    Label      string            `json:"label"`
    DurationS  float64           `json:"duration_s"`
    Repeatable bool              `json:"repeatable"`
    Payload    map[string]string `json:"payload"`
    Requires   []NodeID          `json:"requires"`
    Dialogue   *DialogueContent  `json:"dialogue,omitempty"`
    Effects    []UpgradeEffect   `json:"effects,omitempty"` // NEW - only for upgrade nodes
}
```

## 2. Define Upgrade Nodes

Create `internal/dag/upgrades.go`:

```go
package dag

// GetUpgradeNodes returns all upgrade node definitions
func GetUpgradeNodes() []*Node {
    return []*Node{
        // ========== Speed Upgrades ==========
        {
            ID:        "upgrade.ship.speed_1",
            Kind:      NodeKindUpgrade,
            Label:     "Speed Boost I",
            DurationS: 60,
            Requires:  []NodeID{},
            Effects: []UpgradeEffect{
                {Type: EffectSpeedMultiplier, Value: 1.1},
            },
            Payload: map[string]string{
                "description": "Increase maximum ship speed by 10%",
            },
        },
        {
            ID:        "upgrade.ship.speed_2",
            Kind:      NodeKindUpgrade,
            Label:     "Speed Boost II",
            DurationS: 180,
            Requires:  []NodeID{"upgrade.ship.speed_1"},
            Effects: []UpgradeEffect{
                {Type: EffectSpeedMultiplier, Value: 1.2},
            },
            Payload: map[string]string{
                "description": "Further increase maximum speed by 20%",
            },
        },
        {
            ID:        "upgrade.ship.speed_3",
            Kind:      NodeKindUpgrade,
            Label:     "Speed Boost III",
            DurationS: 300,
            Requires:  []NodeID{"upgrade.ship.speed_2"},
            Effects: []UpgradeEffect{
                {Type: EffectSpeedMultiplier, Value: 1.3},
            },
            Payload: map[string]string{
                "description": "Advanced engines, +30% max speed",
            },
        },

        // ========== Missile Unlocks ==========
        {
            ID:        "upgrade.missile.scout",
            Kind:      NodeKindUpgrade,
            Label:     "Scout Missiles",
            DurationS: 120,
            Requires:  []NodeID{},
            Effects: []UpgradeEffect{
                {Type: EffectMissileUnlock, Value: "scout"},
            },
            Payload: map[string]string{
                "description": "Unlock fast, short-range Scout preset",
            },
        },
        {
            ID:        "upgrade.missile.hunter",
            Kind:      NodeKindUpgrade,
            Label:     "Hunter Missiles",
            DurationS: 120,
            Requires:  []NodeID{},
            Effects: []UpgradeEffect{
                {Type: EffectMissileUnlock, Value: "hunter"},
            },
            Payload: map[string]string{
                "description": "Unlock balanced Hunter preset",
            },
        },
        {
            ID:        "upgrade.missile.sniper",
            Kind:      NodeKindUpgrade,
            Label:     "Sniper Missiles",
            DurationS: 180,
            Requires:  []NodeID{"upgrade.missile.scout", "upgrade.missile.hunter"},
            Effects: []UpgradeEffect{
                {Type: EffectMissileUnlock, Value: "sniper"},
            },
            Payload: map[string]string{
                "description": "Unlock long-range Sniper preset",
            },
        },

        // ========== Heat Management ==========
        {
            ID:        "upgrade.heat.capacity",
            Kind:      NodeKindUpgrade,
            Label:     "Heat Sink Upgrade",
            DurationS: 240,
            Requires:  []NodeID{"upgrade.ship.speed_1"},
            Effects: []UpgradeEffect{
                {Type: EffectHeatCapacity, Value: 1.2},
            },
            Payload: map[string]string{
                "description": "Increase heat capacity by 20%",
            },
        },
        {
            ID:        "upgrade.heat.efficiency",
            Kind:      NodeKindUpgrade,
            Label:     "Coolant System",
            DurationS: 240,
            Requires:  []NodeID{"upgrade.heat.capacity"},
            Effects: []UpgradeEffect{
                {Type: EffectHeatEfficiency, Value: 1.15},
            },
            Payload: map[string]string{
                "description": "Improve heat dissipation by 15%",
            },
        },
    }
}
```

### Initialize with Other DAG Nodes

Modify the DAG initialization to include upgrade nodes:

```go
// In main.go or wherever DAG is initialized
func initializeDAG() error {
    allNodes := append(
        dag.GetCraftingNodes(),
        dag.GetStoryNodes()...,
    )
    allNodes = append(allNodes, dag.GetUpgradeNodes()...) // NEW

    return dag.Init(allNodes)
}
```

## 3. Player Capabilities System

### Add to Player Struct

Modify `internal/game/room.go`:

```go
// PlayerCapabilities represents computed bonuses from completed upgrades
type PlayerCapabilities struct {
    SpeedMultiplier   float64
    UnlockedMissiles  []string
    HeatCapacity      float64
    HeatEfficiency    float64
}

// Extend existing Player struct
type Player struct {
    ID                   string
    Name                 string
    Ship                 EntityID
    MissileConfig        MissileConfig
    MissileRoutes        []*MissileRouteDef
    ActiveMissileRouteID string
    MissileReadyAt       float64
    IsBot                bool
    Kills                int
    DagState             *dag.State           // EXISTING
    Inventory            *Inventory           // EXISTING
    StoryFlags           map[string]bool      // EXISTING
    ActiveStoryNodeID    string               // EXISTING
    PendingStoryEvents   []StoryEvent         // EXISTING
    Capabilities         PlayerCapabilities   // NEW
}

// DefaultCapabilities returns base player capabilities (no upgrades)
func DefaultCapabilities() PlayerCapabilities {
    return PlayerCapabilities{
        SpeedMultiplier:  1.0,
        UnlockedMissiles: []string{},
        HeatCapacity:     100.0,
        HeatEfficiency:   1.0,
    }
}
```

### Compute Capabilities from Completed Upgrades

Add `internal/game/capabilities.go`:

```go
package game

import "LightSpeedDuel/internal/dag"

// ComputeCapabilities calculates effective player stats from completed upgrade nodes
func ComputeCapabilities(dagState *dag.State) PlayerCapabilities {
    caps := DefaultCapabilities()

    // Get all completed upgrade nodes
    graph := dag.GetGraph()
    for nodeID, status := range dagState.Status {
        if status != dag.StatusCompleted {
            continue
        }

        node, exists := graph.Nodes[nodeID]
        if !exists || node.Kind != dag.NodeKindUpgrade {
            continue
        }

        // Apply effects
        for _, effect := range node.Effects {
            switch effect.Type {
            case dag.EffectSpeedMultiplier:
                // Multiplicative stacking
                caps.SpeedMultiplier *= effect.Value.(float64)

            case dag.EffectMissileUnlock:
                unlockID := effect.Value.(string)
                if !contains(caps.UnlockedMissiles, unlockID) {
                    caps.UnlockedMissiles = append(caps.UnlockedMissiles, unlockID)
                }

            case dag.EffectHeatCapacity:
                caps.HeatCapacity *= effect.Value.(float64)

            case dag.EffectHeatEfficiency:
                caps.HeatEfficiency *= effect.Value.(float64)
            }
        }
    }

    return caps
}

func contains(slice []string, item string) bool {
    for _, s := range slice {
        if s == item {
            return true
        }
    }
    return false
}
```

## 4. Hook into DAG Completion

### Implement UpgradeEffects Using DAG Effects Interface

The DAG system uses the `Effects` interface pattern (defined in `internal/dag/commands.go:17-26`). Create upgrade effects handler:

Create `internal/game/upgrade_effects.go`:

```go
package game

import "LightSpeedDuel/internal/dag"

// UpgradeEffects handles side effects when upgrade nodes complete
type UpgradeEffects struct {
    player *Player
}

func NewUpgradeEffects(player *Player) *UpgradeEffects {
    return &UpgradeEffects{player: player}
}

func (e *UpgradeEffects) OnStart(nodeID dag.NodeID, node *dag.Node) {
    // No special action needed when upgrade starts
}

func (e *UpgradeEffects) OnComplete(nodeID dag.NodeID, node *dag.Node) {
    if node == nil || node.Kind != dag.NodeKindUpgrade {
        return
    }

    // Recompute player capabilities from all completed upgrades
    e.player.Capabilities = ComputeCapabilities(e.player.DagState)
}

func (e *UpgradeEffects) OnCancel(nodeID dag.NodeID, node *dag.Node) {
    // No special action needed when upgrade cancelled
}
```

### Integrate with Existing CombinedDagEffects

Modify `internal/game/story_effects.go` to include upgrade effects:

```go
type CombinedDagEffects struct {
    craft   *CraftingEffects
    story   *StoryEffects
    upgrade *UpgradeEffects  // NEW
}

func NewRoomDagEffects(room *Room, player *Player) *CombinedDagEffects {
    return &CombinedDagEffects{
        craft:   NewCraftingEffects(player),
        story:   NewStoryEffects(room, player),
        upgrade: NewUpgradeEffects(player),  // NEW
    }
}

func (e *CombinedDagEffects) OnStart(nodeID dag.NodeID, node *dag.Node) {
    if e.craft != nil {
        e.craft.OnStart(nodeID, node)
    }
    if e.story != nil {
        e.story.OnStart(nodeID, node)
    }
    if e.upgrade != nil {  // NEW
        e.upgrade.OnStart(nodeID, node)
    }
}

func (e *CombinedDagEffects) OnComplete(nodeID dag.NodeID, node *dag.Node) {
    if e.craft != nil {
        e.craft.OnComplete(nodeID, node)
    }
    if e.story != nil {
        e.story.OnComplete(nodeID, node)
    }
    if e.upgrade != nil {  // NEW
        e.upgrade.OnComplete(nodeID, node)
    }
}

func (e *CombinedDagEffects) OnCancel(nodeID dag.NodeID, node *dag.Node) {
    if e.craft != nil {
        e.craft.OnCancel(nodeID, node)
    }
    if e.story != nil {
        e.story.OnCancel(nodeID, node)
    }
    if e.upgrade != nil {  // NEW
        e.upgrade.OnCancel(nodeID, node)
    }
}
```

This integrates seamlessly with the existing DAG evaluation loop which already calls `effects.OnComplete()` when jobs finish.

## 5. Apply Capabilities in Game Systems

### Movement System

Modify `internal/game/systems.go`:

```go
// In MovementSystem.Update
func (s *MovementSystem) Update(dt float64) {
    for _, shipID := range s.entities {
        ship := s.world.Ships[shipID]
        player := s.getPlayerForShip(shipID)

        // Apply speed multiplier from upgrades
        effectiveMaxSpeed := BaseMaxSpeed * player.Capabilities.SpeedMultiplier

        // Enforce upgraded limit
        if ship.Speed > effectiveMaxSpeed {
            ship.Speed = effectiveMaxSpeed
        }

        // ... rest of movement logic
    }
}
```

### Missile System

Modify missile validation to check unlocks:

```go
// In MissileSystem or wherever missiles are crafted/launched
func ValidateMissilePreset(player *game.Player, presetID string) error {
    // Check if missile type is unlocked
    if presetID != "basic" && !contains(player.Capabilities.UnlockedMissiles, presetID) {
        return fmt.Errorf("missile preset %s not unlocked", presetID)
    }
    return nil
}
```

### Heat System (Future)

```go
func (s *HeatSystem) Update(dt float64) {
    for _, shipID := range s.entities {
        ship := s.world.Ships[shipID]
        player := s.getPlayerForShip(shipID)

        // Apply upgraded heat capacity
        ship.MaxHeat = BaseHeatCapacity * player.Capabilities.HeatCapacity

        // Apply upgraded dissipation rate
        dissipationRate := BaseDissipation * player.Capabilities.HeatEfficiency
        ship.Heat -= dissipationRate * dt
    }
}
```

## 6. Persistence

### Database Schema

Capabilities are computed from DAG state, so no separate storage needed. Just ensure `DagState` is persisted:

```sql
-- Player DAG state (already exists for crafting/story)
CREATE TABLE IF NOT EXISTS player_dag_state (
    player_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,  -- JSON serialization of dag.State
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Save/Load Logic

```go
// Save player DAG state (already implemented for crafting)
func SavePlayerDagState(playerID string, state *dag.State) error {
    stateJSON, err := state.Snapshot()
    if err != nil {
        return err
    }

    _, err = db.Exec(`
        INSERT INTO player_dag_state (player_id, state_json)
        VALUES ($1, $2)
        ON CONFLICT (player_id) DO UPDATE SET state_json = $2, updated_at = NOW()
    `, playerID, string(stateJSON))
    return err
}

// Load player DAG state (already implemented)
func LoadPlayerDagState(playerID string) (*dag.State, error) {
    var stateJSON string
    err := db.QueryRow(`
        SELECT state_json FROM player_dag_state WHERE player_id = $1
    `, playerID).Scan(&stateJSON)

    if err == sql.ErrNoRows {
        return dag.NewState(), nil // New player
    }
    if err != nil {
        return nil, err
    }

    return dag.LoadSnapshot([]byte(stateJSON))
}

// On player join
func (r *Room) AddPlayer(playerID, name string) error {
    dagState, err := LoadPlayerDagState(playerID)
    if err != nil {
        return err
    }

    player := &Player{
        ID:           playerID,
        Name:         name,
        DagState:     dagState,
        Capabilities: ComputeCapabilities(dagState), // NEW
        // ... other fields
    }

    r.Players[playerID] = player
    return nil
}
```

## 7. Server Restart Resilience

The DAG system already handles in-progress jobs via the evaluator (internal/dag/eval.go):

```go
// The existing evaluator checks all active jobs and returns completions
result := dag.Evaluator(graph, player.DagState, now)

// Apply completions with effects
for _, nodeID := range result.DueCompletions {
    node := graph.GetNode(nodeID)
    effects := NewRoomDagEffects(room, player)
    dag.Complete(graph, player.DagState, nodeID, effects)
    // This calls effects.OnComplete(), which triggers UpgradeEffects.OnComplete()
}
```

Upgrades that were in-progress before a server restart will automatically complete when the server comes back up and the evaluator runs.

## 8. Testing Strategy

### Unit Tests

Add `internal/dag/upgrades_test.go`:

```go
func TestUpgradeEffectStacking(t *testing.T) {
    dagState := dag.NewState()

    // Complete speed_1 (1.1x)
    dagState.SetStatus("upgrade.ship.speed_1", dag.StatusCompleted)
    caps1 := game.ComputeCapabilities(dagState)
    assert.Equal(t, 1.1, caps1.SpeedMultiplier)

    // Complete speed_2 (1.2x) - should multiply
    dagState.SetStatus("upgrade.ship.speed_2", dag.StatusCompleted)
    caps2 := game.ComputeCapabilities(dagState)
    assert.Equal(t, 1.32, caps2.SpeedMultiplier) // 1.1 * 1.2
}

func TestMissileUnlocks(t *testing.T) {
    dagState := dag.NewState()

    dagState.SetStatus("upgrade.missile.scout", dag.StatusCompleted)
    dagState.SetStatus("upgrade.missile.hunter", dag.StatusCompleted)

    caps := game.ComputeCapabilities(dagState)
    assert.Contains(t, caps.UnlockedMissiles, "scout")
    assert.Contains(t, caps.UnlockedMissiles, "hunter")
    assert.NotContains(t, caps.UnlockedMissiles, "sniper")
}
```

### Integration Tests

```go
func TestUpgradeCompletion(t *testing.T) {
    room := game.NewTestRoom()
    player := room.AddTestPlayer("p1")
    graph := dag.GetGraph()
    effects := game.NewRoomDagEffects(room, player)

    // Start upgrade
    err := dag.Start(graph, player.DagState, "upgrade.ship.speed_1", 0.0, effects)
    assert.NoError(t, err)
    assert.Equal(t, 1.0, player.Capabilities.SpeedMultiplier)

    // Complete upgrade (simulates timer expiry)
    err = dag.Complete(graph, player.DagState, "upgrade.ship.speed_1", effects)
    assert.NoError(t, err)
    assert.Equal(t, 1.1, player.Capabilities.SpeedMultiplier)
}
```

## Summary

| What | Action |
|------|--------|
| **New Structs** | ✅ `UpgradeEffect`, `PlayerCapabilities`, `UpgradeEffects` |
| **Modified Structs** | ✅ Add `Effects` to `dag.Node`, `Capabilities` to `Player` |
| **New Files** | ✅ `internal/dag/upgrades.go`, `internal/game/capabilities.go`, `internal/game/upgrade_effects.go` |
| **Modified Files** | ✅ `internal/dag/graph.go`, `internal/game/room.go`, `internal/game/story_effects.go` |
| **Database Changes** | ❌ None - reuse existing DAG state persistence |
| **New Systems** | ❌ None - extends existing `CombinedDagEffects` pattern |

This approach integrates upgrades seamlessly into the existing DAG infrastructure with minimal code duplication.
