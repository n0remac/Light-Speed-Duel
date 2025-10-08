package game

func updateShips(r *Room, dt float64) {
	world := r.World
	world.ForEach([]ComponentKey{CompTransform, compMovement, CompShip}, func(id EntityID) {
		tr := world.Transform(id)
		mov := world.Movement(id)
		ship := world.ShipData(id)
		route := world.ShipRoute(id)
		if tr == nil || mov == nil || ship == nil {
			return
		}

		if route != nil && len(route.Waypoints) > 0 {
			target := route.Waypoints[0]
			dir := target.Pos.Sub(tr.Pos)
			dist := dir.Len()
			speedLimit := Clamp(target.Speed, 0, mov.MaxSpeed)
			if dist <= ShipStopEps || speedLimit <= 1e-3 || dist <= speedLimit*dt {
				tr.Pos = target.Pos
				tr.Vel = Vec2{}
				route.Waypoints = route.Waypoints[1:]
			} else {
				direction := dir.Scale(1.0 / dist)
				tr.Vel = direction.Scale(speedLimit)
				tr.Pos = tr.Pos.Add(tr.Vel.Scale(dt))
			}
		} else {
			tr.Vel = Vec2{}
		}

		if tr.Pos.X < 0 {
			tr.Pos.X = 0
		}
		if tr.Pos.Y < 0 {
			tr.Pos.Y = 0
		}
		if tr.Pos.X > WorldW {
			tr.Pos.X = WorldW
		}
		if tr.Pos.Y > WorldH {
			tr.Pos.Y = WorldH
		}

		if hist := world.HistoryComponent(id); hist != nil {
			hist.History.push(Snapshot{T: r.Now, Pos: tr.Pos, Vel: tr.Vel})
		}
	})
}

func updateMissiles(r *Room, dt float64) {
	world := r.World

	world.ForEach([]ComponentKey{CompTransform, compMovement, CompMissile}, func(id EntityID) {
		// Skip destroyed missiles - they no longer participate in physics
		if world.DestroyedData(id) != nil {
			return
		}

		tr := world.Transform(id)
		mov := world.Movement(id)
		missile := world.MissileData(id)
		owner := world.Owner(id)
		route := world.MissileRoute(id)
		if tr == nil || mov == nil || missile == nil || owner == nil {
			return
		}

		age := r.Now - missile.LaunchTime
		if age >= missile.Lifetime {
			// Soft delete: mark as destroyed instead of removing
			world.SetComponent(id, CompDestroyed, &DestroyedComponent{DestroyedAt: r.Now})
			return
		}

		chasing := false
		var perceivedTargetPos Vec2

		if missile.Target != 0 {
			if world.Exists(missile.Target) {
				if targetOwner := world.Owner(missile.Target); targetOwner != nil && targetOwner.PlayerID != owner.PlayerID {
					// Use perceived distance to check if target still in agro radius
					perceivedDist := PerceivedDistance(tr.Pos, missile.Target, world, r.Now)
					if perceivedDist <= missile.AgroRadius {
						// Get perceived position of target
						if snap, ok := PerceiveEntity(tr.Pos, missile.Target, world, r.Now); ok {
							chasing = true
							perceivedTargetPos = snap.Pos
						} else {
							missile.Target = 0
							missile.WaypointIdx = missile.ReturnIdx
						}
					} else {
						missile.Target = 0
						missile.WaypointIdx = missile.ReturnIdx
					}
				} else {
					missile.Target = 0
					missile.WaypointIdx = missile.ReturnIdx
				}
			} else {
				missile.Target = 0
				missile.WaypointIdx = missile.ReturnIdx
			}
		}

		if !chasing {
			world.ForEach([]ComponentKey{CompTransform, CompShip, CompOwner}, func(shipID EntityID) {
				if chasing {
					return
				}
				shipOwner := world.Owner(shipID)
				if shipOwner == nil || shipOwner.PlayerID == owner.PlayerID {
					return
				}
				// Use perceived distance for agro detection
				perceivedDist := PerceivedDistance(tr.Pos, shipID, world, r.Now)
				if perceivedDist <= missile.AgroRadius {
					// Get perceived position of target
					if snap, ok := PerceiveEntity(tr.Pos, shipID, world, r.Now); ok {
						chasing = true
						perceivedTargetPos = snap.Pos
						missile.Target = shipID
						missile.ReturnIdx = missile.WaypointIdx
					}
				}
			})
		}

		tr.Vel = Vec2{}

		if chasing {
			// Navigate toward perceived target position
			toTarget := perceivedTargetPos.Sub(tr.Pos)
			dist := toTarget.Len()
			speed := mov.MaxSpeed
			if dist <= ShipStopEps || speed <= 1e-3 || dist <= speed*dt {
				tr.Pos = perceivedTargetPos
				tr.Vel = Vec2{}
			} else {
				direction := toTarget.Scale(1.0 / dist)
				tr.Vel = direction.Scale(speed)
				tr.Pos = tr.Pos.Add(tr.Vel.Scale(dt))
			}
		} else if route != nil && missile.WaypointIdx < len(route.Waypoints) {
			wp := route.Waypoints[missile.WaypointIdx]
			toWp := wp.Sub(tr.Pos)
			dist := toWp.Len()
			speed := mov.MaxSpeed
			if dist <= ShipStopEps || speed <= 1e-3 || dist <= speed*dt {
				tr.Pos = wp
				tr.Vel = Vec2{}
				missile.WaypointIdx++
			} else {
				direction := toWp.Scale(1.0 / dist)
				tr.Vel = direction.Scale(speed)
				tr.Pos = tr.Pos.Add(tr.Vel.Scale(dt))
			}
		}

		if tr.Pos.X < 0 {
			tr.Pos.X = 0
		}
		if tr.Pos.Y < 0 {
			tr.Pos.Y = 0
		}
		if tr.Pos.X > WorldW {
			tr.Pos.X = WorldW
		}
		if tr.Pos.Y > WorldH {
			tr.Pos.Y = WorldH
		}

		if !chasing && route != nil && missile.WaypointIdx >= len(route.Waypoints) {
			tr.Vel = Vec2{}
		}

		hitShip := EntityID(0)
		world.ForEach([]ComponentKey{CompTransform, CompShip, CompOwner}, func(shipID EntityID) {
			if hitShip != 0 {
				return
			}
			shipOwner := world.Owner(shipID)
			if shipOwner == nil || shipOwner.PlayerID == owner.PlayerID {
				return
			}
			// Collision based on missile's perception of ship
			snap, ok := PerceiveEntity(tr.Pos, shipID, world, r.Now)
			if !ok {
				return
			}
			// Check if missile's actual position overlaps with perceived ship position
			if snap.Pos.Sub(tr.Pos).Len() <= MissileHitRadius {
				hitShip = shipID
			}
		})

		if hitShip != 0 {
			if shipData := world.ShipData(hitShip); shipData != nil {
				shipData.HP--
				if shipData.HP <= 0 {
					r.reSpawnShip(hitShip)
				}
			}
			// Soft delete: mark as destroyed instead of removing
			world.SetComponent(id, CompDestroyed, &DestroyedComponent{DestroyedAt: r.Now})
			return
		}

		if hist := world.HistoryComponent(id); hist != nil {
			hist.History.push(Snapshot{T: r.Now, Pos: tr.Pos, Vel: tr.Vel})
		}
	})
}
