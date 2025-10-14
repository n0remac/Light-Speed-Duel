package game

import (
    "math"
    "math/rand"
)

// Phase constants for minimal tactical cycle
const (
    aiPhaseAttack    = 0
    aiPhaseCoolFire  = 1
    aiPhaseEvade     = 2
)

// Tunables for Phase 1 behavior (kept local to AI)
const (
    phaseAttackMinS = 0.9
    phaseAttackMaxS = 1.6
    phaseCoolMinS   = 0.8
    phaseCoolMaxS   = 1.4
    phaseEvadeMinS  = 0.9
    phaseEvadeMaxS  = 1.6

    closeRangePX = 900.0

    shipHeatCapRatio    = 0.92 // fraction of OverheatAt
    missileHeatCapRatio = 0.90 // fraction of OverheatAt

    speedScaleStep       = 0.90
    speedScaleIterations = 6
)

func projectHeatAfterDuration(h *HeatComponent, speed, duration float64) float64 {
	if h == nil || duration <= 0 {
		if h != nil {
			return Clamp(h.S.Value, 0, h.P.Max)
		}
		return 0
	}
	vn := math.Max(h.P.MarkerSpeed, 1e-6)
	dev := speed - h.P.MarkerSpeed
	p := h.P.Exp

	var rate float64
	if dev >= 0 {
		rate = h.P.KUp * math.Pow(dev/vn, p)
	} else {
		rate = -h.P.KDown * math.Pow(math.Abs(dev)/vn, p)
	}
	projected := h.S.Value + rate*duration
	if projected < 0 {
		projected = 0
	}
	if projected > h.P.Max {
		projected = h.P.Max
	}
	return projected
}

func estimateHeatAfterSegment(h *HeatComponent, speed, distance float64) float64 {
	if h == nil {
		return 0
	}
	if distance <= 0 || speed <= 1e-6 {
		return Clamp(h.S.Value, 0, h.P.Max)
	}
	duration := distance / speed
	return projectHeatAfterDuration(h, speed, duration)
}

func projectRouteHeat(h *HeatComponent, startPos Vec2, route *RouteComponent) float64 {
	if h == nil {
		return 0
	}
	current := Clamp(h.S.Value, 0, h.P.Max)
	heatCopy := *h
	heatCopy.S.Value = current

	if route == nil || len(route.Waypoints) == 0 {
		return current
	}

	maxHeat := current
	pos := startPos
	for _, wp := range route.Waypoints {
		dist := wp.Pos.Sub(pos).Len()
		speed := math.Max(wp.Speed, 1e-3)
		if dist <= 1e-3 {
			pos = wp.Pos
			continue
		}
		duration := dist / speed
		next := projectHeatAfterDuration(&heatCopy, speed, duration)
		if next > maxHeat {
			maxHeat = next
		}
		heatCopy.S.Value = next
		pos = wp.Pos
	}
	return maxHeat
}

func clampPlanDestination(pos Vec2, direction Vec2, distance, worldW, worldH float64) Vec2 {
	dest := pos.Add(direction.Scale(distance))
	return clampPointToWorldBounds(dest, worldW, worldH)
}

func planHeatBuildRoute(pos Vec2, direction Vec2, worldW, worldH, shipSpeed float64) []RouteWaypoint {
	direction = unitOrZero(direction)
	if direction.Len() <= 1e-3 {
		direction = Vec2{X: 1, Y: 0}
	}
	distance := Clamp(300+rand.Float64()*250, 200, 650)
	dest := clampPlanDestination(pos, direction, distance, worldW, worldH)
	speed := Clamp(shipSpeed*0.95, shipSpeed*0.8, shipSpeed)
	return []RouteWaypoint{{Pos: dest, Speed: speed}}
}

func planHeatCooldownRoute(pos Vec2, direction Vec2, worldW, worldH, markerSpeed float64) []RouteWaypoint {
	direction = unitOrZero(direction)
	if direction.Len() <= 1e-3 {
		direction = Vec2{X: 0, Y: 1}
	}
	distance := Clamp(900+rand.Float64()*500, 600, 1500)
	speed := Clamp(markerSpeed*0.8, math.Max(markerSpeed*0.6, markerSpeed-20), markerSpeed)
	if speed <= 5 {
		speed = markerSpeed
	}
	dest := clampPlanDestination(pos, direction, distance, worldW, worldH)
	return []RouteWaypoint{{Pos: dest, Speed: speed}}
}

func planDirectMissileRoute(pos Vec2, threat AIMissileThreat, worldW, worldH, shipSpeed float64) []RouteWaypoint {
	toShip := unitOrZero(pos.Sub(threat.Pos))
	if toShip.Len() <= 1e-3 {
		toShip = Vec2{X: 1, Y: 0}
	}
	lateral := unitOrZero(orthogonal(toShip))
	if lateral.Len() <= 1e-3 {
		lateral = Vec2{X: -toShip.Y, Y: toShip.X}
	}
	if threat.Vel.Dot(lateral) > 0 {
		lateral = lateral.Scale(-1)
	}
	sideDistance := Clamp(550+rand.Float64()*200, 400, 800)
	sidePoint := clampPlanDestination(pos, lateral, sideDistance, worldW, worldH)
	escapeDir := unitOrZero(lateral.Scale(0.6).Add(toShip.Scale(0.4)))
	if escapeDir.Len() <= 1e-3 {
		escapeDir = toShip
	}
	escapeDistance := Clamp(900+rand.Float64()*400, 700, 1400)
	escapePoint := clampPlanDestination(sidePoint, escapeDir, escapeDistance, worldW, worldH)
	speed := Clamp(shipSpeed, shipSpeed*0.8, shipSpeed)
	return []RouteWaypoint{
		{Pos: sidePoint, Speed: speed},
		{Pos: escapePoint, Speed: speed},
	}
}

func planGeneralThreatRoute(pos Vec2, threat AIMissileThreat, worldW, worldH, shipSpeed float64) []RouteWaypoint {
	away := unitOrZero(pos.Sub(threat.Pos))
	if away.Len() <= 1e-3 {
		away = Vec2{X: 1, Y: 0}
	}
	distance := Clamp(800+rand.Float64()*400, 500, 1400)
	dest := clampPlanDestination(pos, away, distance, worldW, worldH)
	speed := Clamp(shipSpeed, shipSpeed*0.7, shipSpeed)
	return []RouteWaypoint{{Pos: dest, Speed: speed}}
}

type DefensiveBehavior struct {
    desiredMin  float64
    desiredMax  float64
    lastPlanDir Vec2
    phase       int
    phaseUntil  float64
}

func NewDefensiveBehavior() *DefensiveBehavior {
    return &DefensiveBehavior{
        desiredMin:  1200,
        desiredMax:  2000,
        lastPlanDir: Vec2{X: 1, Y: 0},
        phase:       aiPhaseAttack,
    }
}

func randRange(lo, hi float64) float64 {
    if hi <= lo {
        return lo
    }
    return lo + rand.Float64()*(hi-lo)
}

func projectMaxHeatForWaypoints(h *HeatComponent, startPos Vec2, waypoints []RouteWaypoint) float64 {
    if h == nil {
        return 0
    }
    rc := &RouteComponent{Waypoints: waypoints}
    return projectRouteHeat(h, startPos, rc)
}

func clampShipWaypointsToHeat(h *HeatComponent, startPos Vec2, waypoints []RouteWaypoint, heatCap float64, minSpeed float64) []RouteWaypoint {
    if h == nil || len(waypoints) == 0 {
        return waypoints
    }
    wps := make([]RouteWaypoint, len(waypoints))
    copy(wps, waypoints)
    for iter := 0; iter < speedScaleIterations; iter++ {
        maxHeat := projectMaxHeatForWaypoints(h, startPos, wps)
        if maxHeat <= heatCap {
            return wps
        }
        // scale down speeds
        for i := range wps {
            s := wps[i].Speed * speedScaleStep
            if s < minSpeed {
                s = minSpeed
            }
            wps[i].Speed = s
        }
    }
    return wps
}

func clampMissileWaypointsToHeat(params HeatParams, startPos Vec2, waypoints []RouteWaypoint, heatCap float64, minSpeed, maxSpeed float64) []RouteWaypoint {
    if len(waypoints) == 0 {
        return waypoints
    }
    // We don't have missile current heat; assume 0 at launch
    currentHeat := 0.0
    wps := make([]RouteWaypoint, len(waypoints))
    copy(wps, waypoints)
    for iter := 0; iter < speedScaleIterations; iter++ {
        projected := ProjectHeatForRoute(currentHeat, params, startPos, 0, wps)
        maxProjected := 0.0
        for _, v := range projected {
            if v > maxProjected {
                maxProjected = v
            }
        }
        if maxProjected <= heatCap {
            return wps
        }
        for i := range wps {
            s := wps[i].Speed * speedScaleStep
            if s < minSpeed {
                s = minSpeed
            }
            if s > maxSpeed {
                s = maxSpeed
            }
            wps[i].Speed = s
        }
    }
    return wps
}

func (b *DefensiveBehavior) Plan(ctx *AIContext) []AICommand {
	if ctx == nil || ctx.SelfTransform == nil {
		return nil
	}
	pos := ctx.SelfTransform.Pos
	shipSpeed := ShipMaxSpeed
	if ctx.SelfMovement != nil && ctx.SelfMovement.MaxSpeed > 0 {
		shipSpeed = ctx.SelfMovement.MaxSpeed
	}

	steer := Vec2{}

	// Missile avoidance takes precedence
	var imminentThreat *AIMissileThreat
	var closeThreat *AIMissileThreat
	closestThreatDist := math.MaxFloat64
	for i := range ctx.Threats {
		threat := ctx.Threats[i]
		dirAway := pos.Sub(threat.Pos)
		if dirAway.Len() <= 1e-3 {
			continue
		}
		dist := math.Max(threat.Distance, 1)
		weight := 0.0

		if threat.TargetingSelf {
			weight += 6.0
		}
		if threat.Distance <= threat.AgroRadius {
			weight += 4.0
		}
		if threat.TimeToClosest > 0 && threat.TimeToClosest < 4 {
			weight += 2.0
		}
		if threat.DistanceAtClosest <= MissileHitRadius*3 {
			weight += 8.0
		}
		if weight == 0 {
			weight = 1.0
		}
		weight = weight / dist

		steer = steer.Add(unitOrZero(dirAway).Scale(weight))

		if threat.TargetingSelf {
			// Add a lateral dodge to break pursuit
			lateral := orthogonal(dirAway)
			if lateral.Len() > 1e-3 {
				// pick side based on missile velocity direction
				sign := 1.0
				if threat.Vel.Dot(lateral) < 0 {
					sign = -1.0
				}
				steer = steer.Add(unitOrZero(lateral).Scale(0.5 * sign))
			}
		}

		if dist < closestThreatDist {
			closestThreatDist = dist
			closeThreat = &ctx.Threats[i]
		}
		if threat.TargetingSelf {
			toShip := unitOrZero(pos.Sub(threat.Pos))
			missileDir := unitOrZero(threat.Vel)
			if toShip.Len() > 1e-3 && missileDir.Len() > 1e-3 {
				if toShip.Dot(missileDir) > 0.85 && dist <= 1500 && threat.DistanceAtClosest <= MissileHitRadius*3 {
					imminentThreat = &ctx.Threats[i]
				}
			}
		}
	}

	// Distance control relative to nearest opponent
	var nearest *AIShipInfo
	minDist := math.MaxFloat64
	for i := range ctx.Opponents {
		op := ctx.Opponents[i]
		if op.Transform == nil {
			continue
		}
		dist := op.Transform.Pos.Sub(pos).Len()
		if dist < minDist {
			minDist = dist
			nearest = &ctx.Opponents[i]
		}
	}

	if nearest != nil && nearest.Transform != nil {
		oppVec := pos.Sub(nearest.Transform.Pos)
		if oppVec.Len() <= 1e-6 {
			oppVec = Vec2{X: 1, Y: 0}
		}
		if minDist < b.desiredMin {
			tooClose := b.desiredMin - minDist
			factor := smoothStep(tooClose / b.desiredMin)
			steer = steer.Add(unitOrZero(oppVec).Scale(4.0 * (1.0 + factor)))
		} else if minDist > b.desiredMax {
			toOpponent := unitOrZero(nearest.Transform.Pos.Sub(pos))
			// Move tangentially to avoid closing distance aggressively
			steer = steer.Add(unitOrZero(orthogonal(toOpponent)).Scale(1.5))
		} else {
			// Orbit around opponent to stay unpredictable
			steer = steer.Add(unitOrZero(orthogonal(oppVec)).Scale(1.0))
		}
	}

	// Boundary avoidance keeps the ship inside safe zone
	margin := 400.0
	worldW := ctx.Room.WorldWidth
	worldH := ctx.Room.WorldHeight
	if pos.X < margin {
		steer = steer.Add(Vec2{X: (margin - pos.X) / margin})
	}
	if pos.X > worldW-margin {
		steer = steer.Add(Vec2{X: -((pos.X - (worldW - margin)) / margin)})
	}
	if pos.Y < margin {
		steer = steer.Add(Vec2{Y: (margin - pos.Y) / margin})
	}
	if pos.Y > worldH-margin {
		steer = steer.Add(Vec2{Y: -((pos.Y - (worldH - margin)) / margin)})
	}

	direction := unitOrZero(steer)
	if direction.Len() <= 1e-3 {
		// default to hold current heading if available
		if ctx.SelfTransform != nil && ctx.SelfTransform.Vel.Len() > 1 {
			direction = unitOrZero(ctx.SelfTransform.Vel)
		} else if nearest != nil && nearest.Transform != nil {
			direction = unitOrZero(pos.Sub(nearest.Transform.Pos))
		} else {
			direction = Vec2{X: 1, Y: 0}
		}
	}

	commands := []AICommand{}
	if direction.Len() <= 1e-3 {
		direction = unitOrZero(b.lastPlanDir)
	}
	if direction.Len() <= 1e-3 {
		direction = Vec2{X: 1, Y: 0}
	}
	b.lastPlanDir = direction

    if imminentThreat != nil {
        route := planDirectMissileRoute(pos, *imminentThreat, worldW, worldH, shipSpeed)
        commands = append(commands, CommandClearShipRoute())
        // When dodging, keep as-is (threat escape has priority)
        commands = append(commands, CommandSetShipRoute(route))
    } else if closeThreat != nil && closestThreatDist <= 1400 {
        route := planGeneralThreatRoute(pos, *closeThreat, worldW, worldH, shipSpeed)
        commands = append(commands, CommandSetShipRoute(route))
    } else {
        heat := ctx.SelfHeat
        route := ctx.SelfRoute
        needPlan := false
        if route == nil || len(route.Waypoints) == 0 {
            needPlan = true
        } else {
            distToFirst := route.Waypoints[0].Pos.Sub(pos).Len()
            if distToFirst < 160 {
                needPlan = true
            }
        }

        if heat == nil {
            needPlan = true
        }

        if needPlan {
            // Choose route by phase
            if heat != nil {
                shipCap := math.Min(heat.P.Max, heat.P.OverheatAt*shipHeatCapRatio)
                minSpeed := math.Max(heat.P.MarkerSpeed*0.7, 60)
                switch b.phase {
                case aiPhaseAttack:
                    // Move toward nearest opponent if available
                    toward := direction
                    if nearest != nil && nearest.Transform != nil {
                        toward = unitOrZero(nearest.Transform.Pos.Sub(pos))
                    }
                    newRoute := planHeatBuildRoute(pos, toward, worldW, worldH, shipSpeed)
                    newRoute = clampShipWaypointsToHeat(heat, pos, newRoute, shipCap, minSpeed)
                    // If still too hot, fallback to cooldown
                    if projectMaxHeatForWaypoints(heat, pos, newRoute) > shipCap {
                        newRoute = planHeatCooldownRoute(pos, toward, worldW, worldH, heat.P.MarkerSpeed)
                    }
                    commands = append(commands, CommandSetShipRoute(newRoute))
                    // Initialize or maintain attack phase timer
                    if b.phaseUntil <= ctx.Now {
                        b.phaseUntil = ctx.Now + randRange(phaseAttackMinS, phaseAttackMaxS)
                    }
                    // Transition to Cool&Fire when close to target or timer elapsed
                    if (nearest != nil && nearest.Transform != nil && nearest.Transform.Pos.Sub(pos).Len() <= closeRangePX) || ctx.Now >= b.phaseUntil {
                        b.phase = aiPhaseCoolFire
                        b.phaseUntil = ctx.Now + randRange(phaseCoolMinS, phaseCoolMaxS)
                    }

                case aiPhaseCoolFire:
                    toward := direction
                    if nearest != nil && nearest.Transform != nil {
                        toward = unitOrZero(nearest.Transform.Pos.Sub(pos))
                    }
                    newRoute := planHeatCooldownRoute(pos, toward, worldW, worldH, heat.P.MarkerSpeed)
                    newRoute = clampShipWaypointsToHeat(heat, pos, newRoute, shipCap, minSpeed)
                    commands = append(commands, CommandSetShipRoute(newRoute))
                    if b.phaseUntil <= ctx.Now {
                        b.phaseUntil = ctx.Now + randRange(phaseCoolMinS, phaseCoolMaxS)
                    }
                    if ctx.Now >= b.phaseUntil {
                        b.phase = aiPhaseEvade
                        b.phaseUntil = ctx.Now + randRange(phaseEvadeMinS, phaseEvadeMaxS)
                    }

                case aiPhaseEvade:
                    away := direction
                    if nearest != nil && nearest.Transform != nil {
                        away = unitOrZero(pos.Sub(nearest.Transform.Pos))
                    }
                    newRoute := planHeatBuildRoute(pos, away, worldW, worldH, shipSpeed)
                    newRoute = clampShipWaypointsToHeat(heat, pos, newRoute, shipCap, minSpeed)
                    if projectMaxHeatForWaypoints(heat, pos, newRoute) > shipCap {
                        newRoute = planHeatCooldownRoute(pos, away, worldW, worldH, heat.P.MarkerSpeed)
                    }
                    commands = append(commands, CommandSetShipRoute(newRoute))
                    if b.phaseUntil <= ctx.Now {
                        b.phaseUntil = ctx.Now + randRange(phaseEvadeMinS, phaseEvadeMaxS)
                    }
                    if ctx.Now >= b.phaseUntil {
                        b.phase = aiPhaseAttack
                        b.phaseUntil = ctx.Now + randRange(phaseAttackMinS, phaseAttackMaxS)
                    }
                }
            } else {
                // No heat data: default to build route
                newRoute := planHeatBuildRoute(pos, direction, worldW, worldH, shipSpeed)
                commands = append(commands, CommandSetShipRoute(newRoute))
            }
        }
    }

    // Gate missile firing: only when close and in Cool&Fire phase
    canFirePhase := b.phase == aiPhaseCoolFire
    isClose := false
    if nearest != nil && nearest.Transform != nil {
        isClose = nearest.Transform.Pos.Sub(pos).Len() <= closeRangePX
    }

    // Count available missiles (all variants)
    ammo := 0
    if ctx.Self != nil && ctx.Self.Inventory != nil {
        for i := range ctx.Self.Inventory.Items {
            it := ctx.Self.Inventory.Items[i]
            if it.Type == "missile" && it.Quantity > 0 {
                ammo += it.Quantity
            }
        }
    }

    // Auto-craft when ammo low
    if ammo < 3 {
        commands = append(commands, CommandDagStart("craft.missile.basic"))
    }

    if nearest != nil && canFirePhase && isClose && ctx.MissileReady() && ammo > 0 && ctx.SelfTransform != nil {
        oppPos := nearest.Transform.Pos
        oppVel := Vec2{}
        if nearest.Transform != nil {
            oppVel = nearest.Transform.Vel
        }
		rel := oppPos.Sub(pos)
		relSpeed := rel.Len()

		longCfg := MissileConfig{Speed: ShipMaxSpeed * 0.95, AgroRadius: 1600}
		shortCfg := MissileConfig{Speed: ShipMaxSpeed * 0.6, AgroRadius: 600}

		cfg := shortCfg
		if relSpeed > 1400 {
			cfg = longCfg
		} else if minDist > 1500 {
			cfg = longCfg
		}

		cfg = SanitizeMissileConfig(cfg)

		dirToOpponent := unitOrZero(nearest.Transform.Pos.Sub(pos))
		leadTime := rel.Len() / math.Max(cfg.Speed, 1)
		leadTime = Clamp(leadTime, 0.4, 3.5)
		leadPoint := oppPos.Add(oppVel.Scale(leadTime))

		startAccel := pos.Add(dirToOpponent.Scale(250))
		tail := leadPoint.Add(oppVel.Scale(0.5 * leadTime))

		clampedStart := clampPointToWorldBounds(startAccel, worldW, worldH)
		clampedLead := clampPointToWorldBounds(leadPoint, worldW, worldH)
		clampedTail := clampPointToWorldBounds(tail, worldW, worldH)
		waypoints := []RouteWaypoint{
			{Pos: clampedStart, Speed: cfg.Speed},
			{Pos: clampedLead, Speed: cfg.Speed},
			{Pos: clampedTail, Speed: cfg.Speed},
		}

        // Clamp missile speeds to avoid overheating
        missileCap := cfg.HeatParams.OverheatAt * missileHeatCapRatio
        clamped := clampMissileWaypointsToHeat(cfg.HeatParams, pos, waypoints, missileCap, MissileMinSpeed, cfg.Speed)
        commands = append(commands, CommandLaunchMissile(cfg, clamped))
    }

    return commands
}
