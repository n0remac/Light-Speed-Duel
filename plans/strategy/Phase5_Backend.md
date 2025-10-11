# Phase 5 Backend Changes: AI & Tutorial Expansion

**Objective**: Enhance AI behavior to demonstrate new systems and teach players through improved AI.

---

## 5.1 Heat-Aware AI Decision Making

**File**: `internal/game/ai_defensive.go`

Enhance AI to manage heat strategically:

```go
type DefensiveAI struct {
    shipID       EntityID
    mode         string  // "hunting", "evading", "cooling", "docked"
    target       EntityID
    cooldownUntil float64
    heatThreshold float64 // Personality-based heat tolerance
}

func (ai *DefensiveAI) Update(world *World, now float64) {
    heat := world.HeatData(ai.shipID)
    if heat == nil {
        return
    }

    // Heat-based mode switching
    heatRatio := heat.S.Value / heat.P.OverheatAt

    // CRITICAL: If near overheat, prioritize cooling
    if heatRatio >= ai.heatThreshold {
        if ai.mode != "cooling" {
            ai.mode = "cooling"
            ai.findCoolingStrategy(world, now)
        }
        return
    }

    // If heat is safe, resume normal behavior
    if heatRatio < (ai.heatThreshold - 0.2) { // Hysteresis to prevent thrashing
        if ai.mode == "cooling" {
            ai.mode = "hunting" // Resume combat
        }
    }

    // Normal decision tree
    switch ai.mode {
    case "hunting":
        ai.updateHunting(world, now)
    case "evading":
        ai.updateEvading(world, now)
    case "cooling":
        ai.updateCooling(world, now)
    case "docked":
        ai.updateDocked(world, now)
    }
}

// findCoolingStrategy determines best cooling approach
func (ai *DefensiveAI) findCoolingStrategy(world *World, now float64) {
    tr := world.Transform(ai.shipID)
    if tr == nil {
        return
    }

    // Option 1: Find nearest cooling station
    station, dist := ai.findNearestStation(world, tr.Pos)
    if station != EntityID("") {
        // Head to station
        ai.mode = "docked"
        ai.setWaypointToStation(world, station)
        return
    }

    // Option 2: Reduce speed and drift
    ai.mode = "cooling"
    route := world.ShipRoute(ai.shipID)
    if route != nil {
        // Clear waypoints to drift at low speed
        route.Waypoints = []ShipWaypoint{}
    }
}

// findNearestStation finds closest cooling station
func (ai *DefensiveAI) findNearestStation(world *World, pos Vec2) (EntityID, float64) {
    var nearestID EntityID
    nearestDist := math.MaxFloat64

    world.ForEach([]ComponentKey{CompObstacle, CompTransform}, func(id EntityID) {
        obst := world.Obstacle(id)
        obstTr := world.Transform(id)

        if obst == nil || obstTr == nil || !obst.CoolsShips {
            return
        }

        dist := pos.Sub(obstTr.Pos).Len()
        if dist < nearestDist {
            nearestDist = dist
            nearestID = id
        }
    })

    return nearestID, nearestDist
}

// setWaypointToStation sets route to cooling station
func (ai *DefensiveAI) setWaypointToStation(world *World, stationID EntityID) {
    route := world.ShipRoute(ai.shipID)
    stationTr := world.Transform(stationID)

    if route == nil || stationTr == nil {
        return
    }

    // Set low-speed waypoint to station
    route.Waypoints = []ShipWaypoint{
        {
            Pos:   stationTr.Pos,
            Speed: 100, // Below HeatVmin for cooling
        },
    }
}

// updateCooling handles cooling mode behavior
func (ai *DefensiveAI) updateCooling(world *World, now float64) {
    heat := world.HeatData(ai.shipID)
    if heat == nil {
        return
    }

    // Stay in cooling mode until heat drops to safe level
    if heat.S.Value < (heat.P.WarnAt * 0.5) {
        ai.mode = "hunting" // Safe to resume combat
    }

    // Maintain low speed
    route := world.ShipRoute(ai.shipID)
    if route != nil && len(route.Waypoints) > 0 {
        // Ensure waypoint speed is low
        for i := range route.Waypoints {
            if route.Waypoints[i].Speed > HeatVmin {
                route.Waypoints[i].Speed = HeatVmin * 0.8
            }
        }
    }
}

// updateDocked handles station docking behavior
func (ai *DefensiveAI) updateDocked(world *World, now float64) {
    tr := world.Transform(ai.shipID)
    heat := world.HeatData(ai.shipID)

    if tr == nil || heat == nil {
        return
    }

    // Check if still at station
    inStation := false
    world.ForEach([]ComponentKey{CompObstacle, CompTransform}, func(id EntityID) {
        obst := world.Obstacle(id)
        obstTr := world.Transform(id)

        if obst == nil || obstTr == nil || !obst.CoolsShips {
            return
        }

        dist := tr.Pos.Sub(obstTr.Pos).Len()
        if dist <= obst.Radius {
            inStation = true
        }
    })

    // If heat is low and in station, consider leaving
    if heat.S.Value < (heat.P.WarnAt * 0.3) {
        ai.mode = "hunting"
        return
    }

    // If not at station, navigate there
    if !inStation {
        ai.findCoolingStrategy(world, now)
    }
}
```

---

## 5.2 AI Personality System

**File**: `internal/game/ai_types.go`

Define AI personalities with different heat management styles:

```go
type AIPersonality struct {
    Name            string
    HeatTolerance   float64 // % of max heat before cooling (0.0-1.0)
    AggressionLevel float64 // 0.0=defensive, 1.0=aggressive
    MissileUsage    string  // "conservative", "balanced", "aggressive"
    PreferredSpeed  float64 // Target cruising speed
}

var Personalities = map[string]AIPersonality{
    "sniper": {
        Name:            "Sniper",
        HeatTolerance:   0.5,  // Retreat at 50% heat
        AggressionLevel: 0.3,  // Keep distance
        MissileUsage:    "conservative",
        PreferredSpeed:  200,  // High speed, manages heat carefully
    },
    "brawler": {
        Name:            "Brawler",
        HeatTolerance:   0.9,  // Risk overheat for kills
        AggressionLevel: 0.9,  // Close-range combat
        MissileUsage:    "aggressive",
        PreferredSpeed:  180,  // Medium-high speed
    },
    "tactician": {
        Name:            "Tactician",
        HeatTolerance:   0.7,  // Balanced heat management
        AggressionLevel: 0.5,  // Adaptive positioning
        MissileUsage:    "balanced",
        PreferredSpeed:  150,  // Medium speed
    },
    "engineer": {
        Name:            "Engineer",
        HeatTolerance:   0.4,  // Very conservative
        AggressionLevel: 0.2,  // Avoids combat
        MissileUsage:    "conservative",
        PreferredSpeed:  100,  // Low speed, minimal heat
    },
}

// CreateAIWithPersonality spawns AI with specific personality
func (r *Room) CreateAIWithPersonality(personalityName string) EntityID {
    personality := Personalities[personalityName]

    shipID := r.CreatePlayerShip("AI_"+personalityName, nil)

    ai := &DefensiveAI{
        shipID:        shipID,
        mode:          "hunting",
        heatThreshold: personality.HeatTolerance,
    }

    r.AIControllers[shipID] = ai

    return shipID
}
```

---

## 5.3 Heat-Aware Missile Launching

**File**: `internal/game/ai_offensive.go`

AI checks heat before launching missiles:

```go
// decideMissileLaunch returns true if AI should launch missile
func (ai *DefensiveAI) decideMissileLaunch(world *World, now float64) bool {
    heat := world.HeatData(ai.shipID)
    if heat == nil {
        return false
    }

    // Get personality
    personality := ai.getPersonality()

    // Calculate launch cost (must match server formula)
    missileSpeed := 150.0 // Default speed
    launchCost := MissileLaunchHeatBase + (missileSpeed * MissileLaunchHeatScale)

    // Check if launch would cause overheat
    projectedHeat := heat.S.Value + launchCost

    switch personality.MissileUsage {
    case "conservative":
        // Only launch if heat is very low
        return projectedHeat < (heat.P.WarnAt * 0.5)

    case "balanced":
        // Launch if heat is below warning threshold
        return projectedHeat < heat.P.WarnAt

    case "aggressive":
        // Launch even if near overheat (but not over)
        return projectedHeat < heat.P.OverheatAt

    default:
        return projectedHeat < heat.P.WarnAt
    }
}

func (ai *DefensiveAI) getPersonality() AIPersonality {
    // Lookup based on heat threshold
    for _, p := range Personalities {
        if p.HeatTolerance == ai.heatThreshold {
            return p
        }
    }
    return Personalities["tactician"] // Default
}
```

---

## 5.4 AI Station Awareness

**File**: `internal/game/ai_defensive.go`

AI uses stations tactically:

```go
// considerStationTactics checks if AI should use station strategically
func (ai *DefensiveAI) considerStationTactics(world *World, now float64) {
    tr := world.Transform(ai.shipID)
    heat := world.HeatData(ai.shipID)

    if tr == nil || heat == nil {
        return
    }

    // If taking damage and heat is high, retreat to station
    hp := world.HPData(ai.shipID)
    if hp != nil && hp.S.Value < (hp.P.Max * 0.5) {
        if heat.S.Value > heat.P.WarnAt {
            // Tactical retreat: find nearest station
            ai.findCoolingStrategy(world, now)
            return
        }
    }

    // Proactive station use: if enemy is near station, ambush there
    station, _ := ai.findNearestStation(world, tr.Pos)
    if station != EntityID("") {
        enemyNearStation := ai.checkEnemyNearStation(world, station)
        if enemyNearStation {
            // Position near station for heat advantage
            ai.setWaypointNearStation(world, station)
        }
    }
}

// checkEnemyNearStation returns true if enemy is near station
func (ai *DefensiveAI) checkEnemyNearStation(world *World, stationID EntityID) bool {
    stationTr := world.Transform(stationID)
    stationObst := world.Obstacle(stationID)

    if stationTr == nil || stationObst == nil {
        return false
    }

    // Check all enemy ships
    world.ForEach([]ComponentKey{CompTransform}, func(id EntityID) {
        if id == ai.shipID {
            return // Skip self
        }

        enemyTr := world.Transform(id)
        if enemyTr == nil {
            return
        }

        dist := enemyTr.Pos.Sub(stationTr.Pos).Len()
        if dist <= stationObst.Radius * 1.5 {
            // Enemy is near station
            return
        }
    })

    return false
}
```

---

## 5.5 AI Occlusion Awareness

**File**: `internal/game/ai_defensive.go`

AI uses obstacles for cover:

```go
// findCoverObstacle finds asteroid to hide behind
func (ai *DefensiveAI) findCoverObstacle(world *World, threatPos Vec2) EntityID {
    tr := world.Transform(ai.shipID)
    if tr == nil {
        return EntityID("")
    }

    var bestCover EntityID
    bestScore := 0.0

    world.ForEach([]ComponentKey{CompObstacle, CompTransform}, func(id EntityID) {
        obst := world.Obstacle(id)
        obstTr := world.Transform(id)

        if obst == nil || obstTr == nil || !obst.BlocksLight {
            return
        }

        // Check if obstacle is between us and threat
        // Score based on: distance to obstacle, coverage quality

        toObst := obstTr.Pos.Sub(tr.Pos).Len()
        toThreat := threatPos.Sub(tr.Pos).Len()

        // Prefer obstacles that are closer to us than threat
        if toObst < toThreat {
            score := (toThreat - toObst) / obst.Radius
            if score > bestScore {
                bestScore = score
                bestCover = id
            }
        }
    })

    return bestCover
}

// useCoverTactic positions AI behind obstacle
func (ai *DefensiveAI) useCoverTactic(world *World, now float64) {
    // Find nearest enemy
    enemy := ai.findNearestEnemy(world)
    if enemy == EntityID("") {
        return
    }

    enemyTr := world.Transform(enemy)
    if enemyTr == nil {
        return
    }

    // Find cover
    cover := ai.findCoverObstacle(world, enemyTr.Pos)
    if cover == EntityID("") {
        return
    }

    // Set waypoint to position behind cover
    ai.setWaypointBehindObstacle(world, cover, enemyTr.Pos)
}
```

---

## 5.6 AI Difficulty Levels

**File**: `internal/game/ai_types.go`

Create difficulty presets that affect all AI parameters:

```go
type AIDifficulty struct {
    Name               string
    ReactionTime       float64 // Seconds delay before reacting
    AimAccuracy        float64 // 0.0-1.0, affects missile targeting
    HeatManagementSkill float64 // 0.0-1.0, affects heat threshold tuning
}

var Difficulties = map[string]AIDifficulty{
    "easy": {
        Name:               "Easy",
        ReactionTime:       1.5,
        AimAccuracy:        0.5,
        HeatManagementSkill: 0.5, // Often overheats
    },
    "medium": {
        Name:               "Medium",
        ReactionTime:       0.8,
        AimAccuracy:        0.7,
        HeatManagementSkill: 0.7,
    },
    "hard": {
        Name:               "Hard",
        ReactionTime:       0.3,
        AimAccuracy:        0.9,
        HeatManagementSkill: 0.9, // Rarely overheats
    },
}

// ApplyDifficulty modifies AI personality based on difficulty
func (p AIPersonality) ApplyDifficulty(diff AIDifficulty) AIPersonality {
    adjusted := p

    // Adjust heat tolerance based on skill
    adjusted.HeatTolerance = adjusted.HeatTolerance * diff.HeatManagementSkill

    return adjusted
}
```

---

## Implementation Priority

**High Priority** (Sprint 9):
- ✅ Heat-aware AI decision making
- ✅ AI cooling behavior (drift or dock)
- ✅ AI missile launch heat checks

**Medium Priority** (Sprint 10):
- AI personality system
- Station tactical usage
- AI difficulty levels

**Low Priority** (Future):
- Cover tactics with obstacles
- Coordinated AI team tactics
- Learning AI (adapts to player behavior)

---

## Testing Checklist

- [ ] Test AI retreat to stations when overheating
- [ ] Verify AI missile launches respect heat limits
- [ ] Test different AI personalities behave distinctly
- [ ] Verify AI uses obstacles for cover
- [ ] Test AI difficulty scaling
- [ ] Test AI performance with multiple bots

---

## Balancing Considerations

**Heat Thresholds**:
- Sniper (0.5): Very cautious, frequent cooling breaks
- Tactician (0.7): Balanced, occasional cooling
- Brawler (0.9): Aggressive, risks overheat

**Missile Usage**:
- Conservative: ~1 missile per engagement
- Balanced: ~2-3 missiles per engagement
- Aggressive: Spam until heat limit

**Difficulty Scaling**:
- Easy: Overheats frequently, poor heat management
- Medium: Occasionally overheats, decent management
- Hard: Rarely overheats, optimal heat usage

---

## Future Enhancements

**Emergent Behaviors**:
- AI forms "cooling lines" at stations
- AI baits enemies into overheating
- AI uses heat as feint tactic

**Advanced Tactics**:
```go
// AI predicts enemy heat state based on speed/behavior
func (ai *DefensiveAI) predictEnemyHeat(world *World, enemyID EntityID) float64 {
    // Observe enemy speed over time
    // Estimate heat accumulation
    // Return predicted heat value
}
```

**Team Coordination**:
```go
// Multiple AIs coordinate cooling rotations
func (ai *DefensiveAI) coordinateCoolingWithTeam(world *World) {
    // If teammate is cooling, this AI stays aggressive
    // If this AI is cooling, signal to teammates
}
```
