package game

import (
	"math"
)

type DefensiveBehavior struct {
	desiredMin float64
	desiredMax float64
}

func NewDefensiveBehavior() *DefensiveBehavior {
	return &DefensiveBehavior{
		desiredMin: 1200,
		desiredMax: 2000,
	}
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
	for _, threat := range ctx.Threats {
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
	if pos.X < margin {
		steer = steer.Add(Vec2{X: (margin - pos.X) / margin})
	}
	if pos.X > WorldW-margin {
		steer = steer.Add(Vec2{X: -((pos.X - (WorldW - margin)) / margin)})
	}
	if pos.Y < margin {
		steer = steer.Add(Vec2{Y: (margin - pos.Y) / margin})
	}
	if pos.Y > WorldH-margin {
		steer = steer.Add(Vec2{Y: -((pos.Y - (WorldH - margin)) / margin)})
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

	distance := shipSpeed * 0.6
	destination := clampPointToWorld(pos.Add(direction.Scale(distance)))

	commands := []AICommand{CommandSetShipRoute([]ShipWaypoint{{Pos: destination, Speed: shipSpeed}})}

	if nearest != nil && ctx.MissileReady() && ctx.SelfTransform != nil {
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

		waypoints := []Vec2{
			clampPointToWorld(startAccel),
			clampPointToWorld(leadPoint),
			clampPointToWorld(tail),
		}

		commands = append(commands, CommandLaunchMissile(cfg, waypoints))
	}

	return commands
}
