package game

import "math/rand"

func updateRouteFollowers(r *Room, dt float64) {
	world := r.World
	world.ForEach([]ComponentKey{CompTransform, compMovement, CompRouteFollower, CompRoute}, func(id EntityID) {
		if world.DestroyedData(id) != nil {
			return
		}

		tr := world.Transform(id)
		mov := world.Movement(id)
		route := world.Route(id)
		follower := world.RouteFollower(id)
		if tr == nil || mov == nil || route == nil || follower == nil {
			return
		}

		heat := world.HeatData(id)
		if heat != nil {
			UpdateHeat(heat, tr.Vel.Len(), dt, r.Now)
			if heat.IsStalled(r.Now) {
				tr.Vel = Vec2{}
				follower.hasOverride = false
				follower.override = RouteWaypoint{}
				if hist := world.HistoryComponent(id); hist != nil && hist.History != nil {
					hist.History.push(Snapshot{T: r.Now, Pos: tr.Pos, Vel: tr.Vel})
				}
				return
			}
		}

		if follower.Hold {
			tr.Vel = Vec2{}
			if hist := world.HistoryComponent(id); hist != nil && hist.History != nil {
				hist.History.push(Snapshot{T: r.Now, Pos: tr.Pos, Vel: tr.Vel})
			}
			return
		}

		usingOverride := false
		var target RouteWaypoint

		if follower.hasOverride {
			target = follower.override
			usingOverride = true
		} else if follower.Index < len(route.Waypoints) {
			target = route.Waypoints[follower.Index]
		} else {
			tr.Vel = Vec2{}
			if follower.Index > len(route.Waypoints) {
				follower.Index = len(route.Waypoints)
			}
			follower.hasOverride = false
			follower.override = RouteWaypoint{}
			if hist := world.HistoryComponent(id); hist != nil && hist.History != nil {
				hist.History.push(Snapshot{T: r.Now, Pos: tr.Pos, Vel: tr.Vel})
			}
			return
		}

		speedLimit := mov.MaxSpeed
		if target.Speed > 0 {
			speedLimit = Clamp(target.Speed, 0, mov.MaxSpeed)
		}

		dir := target.Pos.Sub(tr.Pos)
		dist := dir.Len()
		if dist <= ShipStopEps || speedLimit <= 1e-3 || dist <= speedLimit*dt {
			tr.Pos = target.Pos
			tr.Vel = Vec2{}
			if !usingOverride {
				follower.Index++
			}
		} else {
			direction := dir.Scale(1.0 / dist)
			tr.Vel = direction.Scale(speedLimit)
			tr.Pos = tr.Pos.Add(tr.Vel.Scale(dt))
		}

		follower.hasOverride = false
		follower.override = RouteWaypoint{}

		if tr.Pos.X < 0 {
			tr.Pos.X = 0
		}
		if tr.Pos.Y < 0 {
			tr.Pos.Y = 0
		}
		if tr.Pos.X > r.WorldWidth {
			tr.Pos.X = r.WorldWidth
		}
		if tr.Pos.Y > r.WorldHeight {
			tr.Pos.Y = r.WorldHeight
		}

		if hist := world.HistoryComponent(id); hist != nil && hist.History != nil {
			hist.History.push(Snapshot{T: r.Now, Pos: tr.Pos, Vel: tr.Vel})
		}
	})
}

func updateMissileGuidance(r *Room, dt float64) {
	world := r.World
	world.ForEach([]ComponentKey{CompTransform, compMovement, CompMissile, CompRouteFollower, CompRoute}, func(id EntityID) {
		if world.DestroyedData(id) != nil {
			return
		}

		tr := world.Transform(id)
		mov := world.Movement(id)
		missile := world.MissileData(id)
		owner := world.Owner(id)
		route := world.Route(id)
		follower := world.RouteFollower(id)
		if tr == nil || mov == nil || missile == nil || owner == nil || route == nil || follower == nil {
			return
		}

		age := r.Now - missile.LaunchTime
		if age >= missile.Lifetime {
			world.SetComponent(id, CompDestroyed, &DestroyedComponent{DestroyedAt: r.Now})
			follower.hasOverride = false
			return
		}

		chasing := false
		var perceivedTargetPos Vec2

		resetToRoute := func() {
			follower.hasOverride = false
			follower.override = RouteWaypoint{}
			if follower.Index < 0 {
				follower.Index = 0
			}
			if follower.Index > len(route.Waypoints) {
				follower.Index = len(route.Waypoints)
			}
			if missile.ReturnIndex >= 0 && missile.ReturnIndex < len(route.Waypoints) {
				follower.Index = missile.ReturnIndex
			}
		}

		if missile.Target != 0 {
			if world.Exists(missile.Target) {
				if targetOwner := world.Owner(missile.Target); targetOwner != nil && targetOwner.PlayerID != owner.PlayerID {
					perceivedDist := PerceivedDistance(tr.Pos, missile.Target, world, r.Now)
					if perceivedDist <= missile.AgroRadius {
						if snap, ok := PerceiveEntity(tr.Pos, missile.Target, world, r.Now); ok {
							chasing = true
							perceivedTargetPos = snap.Pos
						} else {
							missile.Target = 0
							resetToRoute()
						}
					} else {
						missile.Target = 0
						resetToRoute()
					}
				} else {
					missile.Target = 0
					resetToRoute()
				}
			} else {
				missile.Target = 0
				resetToRoute()
			}
		}

		if !chasing {
			world.ForEach([]ComponentKey{CompTransform, CompShip, CompOwner}, func(shipID EntityID) {
				if chasing {
					return
				}
				if world.DestroyedData(shipID) != nil {
					return
				}
				shipOwner := world.Owner(shipID)
				if shipOwner == nil || shipOwner.PlayerID == owner.PlayerID {
					return
				}
				perceivedDist := PerceivedDistance(tr.Pos, shipID, world, r.Now)
				if perceivedDist <= missile.AgroRadius {
					if snap, ok := PerceiveEntity(tr.Pos, shipID, world, r.Now); ok {
						chasing = true
						perceivedTargetPos = snap.Pos
						missile.Target = shipID
						missile.ReturnIndex = follower.Index
					}
				}
			})
		}

		if chasing {
			missile.ReturnIndex = follower.Index
			follower.override = RouteWaypoint{Pos: perceivedTargetPos, Speed: mov.MaxSpeed}
			follower.hasOverride = true
		} else {
			follower.hasOverride = false
			follower.override = RouteWaypoint{}
		}
	})
}

func resolveMissileCollisions(r *Room) {
	world := r.World
	world.ForEach([]ComponentKey{CompTransform, CompMissile, CompOwner}, func(id EntityID) {
		if world.DestroyedData(id) != nil {
			return
		}

		tr := world.Transform(id)
		missile := world.MissileData(id)
		owner := world.Owner(id)
		if tr == nil || missile == nil || owner == nil {
			return
		}

		hitShip := EntityID(0)
		world.ForEach([]ComponentKey{CompTransform, CompShip, CompOwner}, func(shipID EntityID) {
			if hitShip != 0 {
				return
			}
			if world.DestroyedData(shipID) != nil {
				return
			}
			shipOwner := world.Owner(shipID)
			if shipOwner == nil || shipOwner.PlayerID == owner.PlayerID {
				return
			}
			snap, ok := PerceiveEntity(tr.Pos, shipID, world, r.Now)
			if !ok {
				return
			}
			if snap.Pos.Sub(tr.Pos).Len() <= MissileHitRadius {
				hitShip = shipID
			}
		})

		if hitShip != 0 {
			if shipData := world.ShipData(hitShip); shipData != nil {
				shipData.HP--
				if shipData.HP <= 0 {
					r.handleShipDestruction(hitShip, owner.PlayerID)
				}
			}
			if heat := world.HeatData(hitShip); heat != nil {
				ApplyMissileHeatSpike(heat, r.Now, rand.Float64)
			}
			world.SetComponent(id, CompDestroyed, &DestroyedComponent{DestroyedAt: r.Now})
		}
	})
}

// updateMissileHeat applies heat physics to all missiles.
// Missiles that overheat explode (get destroyed) instead of stalling.
func updateMissileHeat(r *Room, dt float64) {
	world := r.World
	world.ForEach([]ComponentKey{CompMissile, CompHeat, CompTransform}, func(id EntityID) {
		if world.DestroyedData(id) != nil {
			return
		}

		heat := world.HeatData(id)
		transform := world.Transform(id)
		if heat == nil || transform == nil {
			return
		}

		speed := transform.Vel.Len()
		UpdateHeat(heat, speed, dt, r.Now)

		if heat.S.Value >= heat.P.OverheatAt {
			world.SetComponent(id, CompDestroyed, &DestroyedComponent{DestroyedAt: r.Now})
		}
	})
}
