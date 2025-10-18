# New Upgrades - Capabilities System Implementation

## Overview

Implement the capabilities system that aggregates completed upgrades and applies their effects to ships and missiles.

## Step 1: Define Capabilities Structure

Create `internal/dag/capabilities.go`:

```go
package dag

// PlayerCapabilities aggregates all active upgrade effects for a player
type PlayerCapabilities struct {
    ShipSpeedMultiplier     float64
    MissileSpeedMultiplier  float64
    ShipHeatCapacity        float64
    MissileHeatCapacity     float64
    UnlockedMissiles        []string
}

// DefaultCapabilities returns the base capabilities with no upgrades
func DefaultCapabilities() PlayerCapabilities {
    return PlayerCapabilities{
        ShipSpeedMultiplier:    1.0,
        MissileSpeedMultiplier: 1.0,
        ShipHeatCapacity:       1.0,
        MissileHeatCapacity:    1.0,
        UnlockedMissiles:       []string{},
    }
}

// CalculateCapabilities computes player capabilities from completed upgrades
func CalculateCapabilities(state *PlayerState) PlayerCapabilities {
    caps := DefaultCapabilities()

    // Find the highest completed upgrade in each path
    highestShipSpeed := 1.0
    highestMissileSpeed := 1.0
    highestShipHeat := 1.0
    highestMissileHeat := 1.0

    for nodeID, nodeState := range state.Nodes {
        if nodeState.Status != StatusCompleted {
            continue
        }

        node := GetGraph().GetNode(nodeID)
        if node == nil || node.Kind != NodeKindUpgrade {
            continue
        }

        for _, effect := range node.Effects {
            switch effect.Type {
            case EffectShipSpeedMultiplier:
                if multiplier, ok := effect.Value.(float64); ok {
                    if multiplier > highestShipSpeed {
                        highestShipSpeed = multiplier
                    }
                }
            case EffectMissileSpeedMultiplier:
                if multiplier, ok := effect.Value.(float64); ok {
                    if multiplier > highestMissileSpeed {
                        highestMissileSpeed = multiplier
                    }
                }
            case EffectShipHeatCapacity:
                if multiplier, ok := effect.Value.(float64); ok {
                    if multiplier > highestShipHeat {
                        highestShipHeat = multiplier
                    }
                }
            case EffectMissileHeatCapacity:
                if multiplier, ok := effect.Value.(float64); ok {
                    if multiplier > highestMissileHeat {
                        highestMissileHeat = multiplier
                    }
                }
            case EffectMissileUnlock:
                if unlockID, ok := effect.Value.(string); ok {
                    caps.UnlockedMissiles = append(caps.UnlockedMissiles, unlockID)
                }
            }
        }
    }

    caps.ShipSpeedMultiplier = highestShipSpeed
    caps.MissileSpeedMultiplier = highestMissileSpeed
    caps.ShipHeatCapacity = highestShipHeat
    caps.MissileHeatCapacity = highestMissileHeat

    return caps
}
```

## Step 2: Update Proto Definitions

Update `proto/ws_messages.proto` to include capabilities in StateUpdate:

```protobuf
// Player capabilities (computed from completed upgrades)
message PlayerCapabilities {
  double ship_speed_multiplier = 1;
  double missile_speed_multiplier = 2;
  double ship_heat_capacity = 3;
  double missile_heat_capacity = 4;
  repeated string unlocked_missiles = 5;
}

message StateUpdate {
  double now = 1;
  Ghost me = 2;
  repeated Ghost ghosts = 3;
  RoomMeta meta = 4;
  repeated Missile missiles = 5;
  MissileConfig missile_config = 6;
  repeated Waypoint missile_waypoints = 7;
  repeated MissileRoute missile_routes = 8;
  string active_missile_route = 9;
  double next_missile_ready = 10;
  optional DagState dag = 11;
  optional Inventory inventory = 12;
  optional StoryState story = 13;
  optional PlayerCapabilities capabilities = 14; // NEW
}
```

## Step 3: Store Capabilities in Player State

Update `internal/game/room.go` to store and use capabilities:

```go
type Player struct {
    Ship          *Ship
    MissileConfig MissileConfig
    DagState      *dag.PlayerState
    Capabilities  dag.PlayerCapabilities // NEW
    // ... other fields
}

// Add method to refresh capabilities
func (p *Player) RefreshCapabilities() {
    if p.DagState != nil {
        p.Capabilities = dag.CalculateCapabilities(p.DagState)
    } else {
        p.Capabilities = dag.DefaultCapabilities()
    }
}
```

## Step 4: Apply Ship Speed Multiplier

Update ship waypoint handling in `internal/game/room.go`:

```go
// When player adds/updates waypoint
func (r *Room) handleAddWaypoint(playerID string, x, y, speed float64) {
    player := r.Players[playerID]
    ship := player.Ship

    // Apply ship speed multiplier from upgrades
    maxSpeed := BASE_SHIP_MAX_SPEED * player.Capabilities.ShipSpeedMultiplier

    // Clamp speed to upgraded max
    if speed > maxSpeed {
        speed = maxSpeed
    }

    waypoint := Waypoint{X: x, Y: y, Speed: speed}
    ship.Waypoints = append(ship.Waypoints, waypoint)
}
```

Or, if speed limits are enforced elsewhere, update that location:

```go
// In systems.go or wherever ship speed is clamped
func applyShipSpeedLimit(ship *Ship, capabilities dag.PlayerCapabilities) {
    maxSpeed := BASE_SHIP_MAX_SPEED * capabilities.ShipSpeedMultiplier

    for i := range ship.Waypoints {
        if ship.Waypoints[i].Speed > maxSpeed {
            ship.Waypoints[i].Speed = maxSpeed
        }
    }
}
```

## Step 5: Apply Missile Speed Multiplier

Update missile configuration in `internal/game/room.go`:

```go
// When player configures missile speed
func (r *Room) handleMissileConfig(playerID string, speed, agro float64) {
    player := r.Players[playerID]

    // Apply missile speed multiplier from upgrades
    maxMissileSpeed := BASE_MISSILE_MAX_SPEED * player.Capabilities.MissileSpeedMultiplier

    // Clamp speed to upgraded max
    if speed > maxMissileSpeed {
        speed = maxMissileSpeed
    }

    player.MissileConfig.Speed = speed
    player.MissileConfig.AgroRadius = agro
    // ... update other fields
}
```

## Step 6: Apply Ship Heat Capacity

Update ship heat initialization in `internal/game/systems.go` or where ships are created:

```go
// When creating a new ship
func createPlayerShip(playerID string, capabilities dag.PlayerCapabilities) *Ship {
    baseHeatParams := DefaultHeatParams()

    // Apply ship heat capacity multiplier
    baseHeatParams.Max *= capabilities.ShipHeatCapacity
    baseHeatParams.WarnAt *= capabilities.ShipHeatCapacity
    baseHeatParams.OverheatAt *= capabilities.ShipHeatCapacity

    ship := &Ship{
        ID:   playerID,
        Heat: NewHeat(baseHeatParams),
        // ... other fields
    }
    return ship
}
```

## Step 7: Apply Missile Heat Capacity

Update missile heat initialization when missiles are launched:

```go
// When launching a missile
func (r *Room) launchMissile(playerID string, routeID string) {
    player := r.Players[playerID]

    // Get base missile heat config
    baseHeatParams := player.MissileConfig.HeatConfig

    // Apply missile heat capacity multiplier
    missileHeatParams := baseHeatParams
    missileHeatParams.Max *= player.Capabilities.MissileHeatCapacity
    missileHeatParams.WarnAt *= player.Capabilities.MissileHeatCapacity
    missileHeatParams.OverheatAt *= player.Capabilities.MissileHeatCapacity

    missile := &Missile{
        ID:   generateMissileID(),
        Heat: NewHeat(missileHeatParams),
        // ... other fields
    }

    r.Missiles = append(r.Missiles, missile)
}
```

## Step 8: Send Capabilities to Client

Update `internal/server/ws.go` to include capabilities in state updates:

```go
func (c *Client) sendStateUpdate(state stateMsg) {
    // Calculate capabilities from player's DAG state
    var capabilities *PlayerCapabilities
    if c.player.DagState != nil {
        caps := dag.CalculateCapabilities(c.player.DagState)
        capabilities = &PlayerCapabilities{
            ShipSpeedMultiplier:    caps.ShipSpeedMultiplier,
            MissileSpeedMultiplier: caps.MissileSpeedMultiplier,
            ShipHeatCapacity:       caps.ShipHeatCapacity,
            MissileHeatCapacity:    caps.MissileHeatCapacity,
            UnlockedMissiles:       caps.UnlockedMissiles,
        }
    }

    state.Capabilities = capabilities
    // ... send state to client
}
```

## Step 9: Refresh Capabilities on Upgrade Completion

Update `internal/dag/commands.go` or wherever DAG progression happens:

```go
func (s *PlayerState) Tick(now float64) []CompletedNode {
    completed := []CompletedNode{}

    for nodeID, nodeState := range s.Nodes {
        if nodeState.Status == StatusInProgress {
            nodeState.RemainingS -= (now - s.LastTickAt)

            if nodeState.RemainingS <= 0 {
                nodeState.Status = StatusCompleted
                nodeState.RemainingS = 0
                completed = append(completed, CompletedNode{NodeID: nodeID})

                // NEW: Mark capabilities as dirty when upgrade completes
                node := GetGraph().GetNode(nodeID)
                if node != nil && node.Kind == NodeKindUpgrade {
                    s.CapabilitiesDirty = true // Add this flag to PlayerState
                }
            }

            s.Nodes[nodeID] = nodeState
        }
    }

    s.LastTickAt = now
    return completed
}
```

Then in the room tick or wherever state is updated:

```go
func (r *Room) Tick(now float64) {
    for _, player := range r.Players {
        if player.DagState != nil {
            completedNodes := player.DagState.Tick(now)

            // Refresh capabilities if any upgrades completed
            if player.DagState.CapabilitiesDirty {
                player.RefreshCapabilities()
                player.DagState.CapabilitiesDirty = false
            }
        }
    }
}
```

## Step 10: Frontend Display (Optional)

Update `internal/server/web/src/main.ts` to display current capabilities:

```typescript
function displayCapabilities(caps: PlayerCapabilities | null) {
  if (!caps) return;

  const capElement = document.getElementById('capabilities-display');
  if (!capElement) return;

  capElement.innerHTML = `
    Ship Speed: ${(caps.ship_speed_multiplier * 100).toFixed(0)}%
    | Missile Speed: ${(caps.missile_speed_multiplier * 100).toFixed(0)}%
    | Ship Heat: ${(caps.ship_heat_capacity * 100).toFixed(0)}%
    | Missile Heat: ${(caps.missile_heat_capacity * 100).toFixed(0)}%
  `;
}
```

## Testing Plan

1. **No upgrades**: Verify base stats work correctly (all multipliers = 1.0)
2. **Ship speed upgrade**: Complete "Engine Boost I", verify ship max speed increased by 10%
3. **Missile speed upgrade**: Complete "Warhead Boost I", verify missile max speed increased by 10%
4. **Ship heat upgrade**: Complete "Cooling System I", verify ship can operate at higher speeds longer
5. **Missile heat upgrade**: Complete "Thermal Shield I", verify missiles can travel faster
6. **Multiple tiers**: Complete tier 1 and tier 2, verify tier 2 effect overrides tier 1
7. **Parallel paths**: Complete upgrades in different paths, verify they stack correctly
8. **Persistence**: Restart server, verify capabilities persist with DAG state

## Constants to Define

Add to `internal/game/consts.go`:

```go
const (
    // Base speed limits (before upgrades)
    BASE_SHIP_MAX_SPEED    = 150.0
    BASE_MISSILE_MAX_SPEED = 200.0
)
```

## Notes

- Capabilities are calculated on-demand from DAG state
- Higher tier upgrades in the same path override lower tiers (not additive)
- Different paths stack multiplicatively (e.g., ship speed + ship heat both apply)
- Capabilities are per-player and server-authoritative
- Client receives capabilities for display but server enforces limits
