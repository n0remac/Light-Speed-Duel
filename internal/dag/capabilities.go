package dag

import "strings"

// PlayerCapabilities aggregates active upgrade effects for a player.
type PlayerCapabilities struct {
    ShipSpeedMultiplier    float64
    MissileSpeedMultiplier float64
    ShipHeatCapacity       float64
    MissileHeatCapacity    float64
    UnlockedMissiles       []string
}

// DefaultCapabilities returns base capabilities with no upgrades.
func DefaultCapabilities() PlayerCapabilities {
    return PlayerCapabilities{
        ShipSpeedMultiplier:    1.0,
        MissileSpeedMultiplier: 1.0,
        ShipHeatCapacity:       1.0,
        MissileHeatCapacity:    1.0,
        UnlockedMissiles:       nil,
    }
}

// CalculateCapabilities computes capabilities from a player's DAG state using
// existing effect types and node ID prefixes to disambiguate targets.
func CalculateCapabilities(state *State) PlayerCapabilities {
    caps := DefaultCapabilities()
    if state == nil {
        return caps
    }

    highestShipSpeed := 1.0
    highestMissileSpeed := 1.0
    highestShipHeat := 1.0
    highestMissileHeat := 1.0

    graph := GetGraph()
    if graph == nil {
        return caps
    }

    for nodeID, status := range state.Status {
        if status != StatusCompleted {
            continue
        }
        node := graph.GetNode(nodeID)
        if node == nil || node.Kind != NodeKindUpgrade {
            continue
        }
        id := string(node.ID)
        isShip := strings.HasPrefix(id, "upgrade.ship.")
        isMissile := strings.HasPrefix(id, "upgrade.missile.")
        for _, eff := range node.Effects {
            switch eff.Type {
            case EffectSpeedMultiplier:
                if v, ok := eff.Value.(float64); ok {
                    if isShip && v > highestShipSpeed {
                        highestShipSpeed = v
                    }
                    if isMissile && v > highestMissileSpeed {
                        highestMissileSpeed = v
                    }
                }
            case EffectHeatCapacity:
                if v, ok := eff.Value.(float64); ok {
                    if isShip && v > highestShipHeat {
                        highestShipHeat = v
                    }
                    if isMissile && v > highestMissileHeat {
                        highestMissileHeat = v
                    }
                }
            case EffectMissileUnlock:
                if id, ok := eff.Value.(string); ok {
                    caps.UnlockedMissiles = append(caps.UnlockedMissiles, id)
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

