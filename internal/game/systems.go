package game

func updateShips(r *Room, dt float64) {
	world := r.World
	world.ForEach([]ComponentKey{compTransform, compMovement, compShip}, func(id EntityID) {
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
			speedLimit := clamp(target.Speed, 0, mov.MaxSpeed)
			if dist <= shipStopEps || speedLimit <= 1e-3 || dist <= speedLimit*dt {
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
		if tr.Pos.X > worldW {
			tr.Pos.X = worldW
		}
		if tr.Pos.Y > worldH {
			tr.Pos.Y = worldH
		}

		if hist := world.HistoryComponent(id); hist != nil {
			hist.History.push(Snapshot{T: r.Now, Pos: tr.Pos, Vel: tr.Vel})
		}
	})
}

func updateMissiles(r *Room, dt float64) {
	world := r.World
	var toRemove []EntityID

	world.ForEach([]ComponentKey{compTransform, compMovement, compMissile}, func(id EntityID) {
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
			toRemove = append(toRemove, id)
			return
		}

		chasing := false
		var targetTransform *Transform

		if missile.Target != 0 {
			if world.Exists(missile.Target) {
				if targetOwner := world.Owner(missile.Target); targetOwner != nil && targetOwner.PlayerID != owner.PlayerID {
					tt := world.Transform(missile.Target)
					if tt != nil {
						dist := tt.Pos.Sub(tr.Pos).Len()
						if dist <= missile.AgroRadius {
							chasing = true
							targetTransform = tt
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
			world.ForEach([]ComponentKey{compTransform, compShip, compOwner}, func(shipID EntityID) {
				if chasing {
					return
				}
				shipOwner := world.Owner(shipID)
				if shipOwner == nil || shipOwner.PlayerID == owner.PlayerID {
					return
				}
				shipTransform := world.Transform(shipID)
				if shipTransform == nil {
					return
				}
				dist := shipTransform.Pos.Sub(tr.Pos).Len()
				if dist <= missile.AgroRadius {
					chasing = true
					targetTransform = shipTransform
					missile.Target = shipID
					missile.ReturnIdx = missile.WaypointIdx
				}
			})
		}

		tr.Vel = Vec2{}

		if chasing && targetTransform != nil {
			toTarget := targetTransform.Pos.Sub(tr.Pos)
			dist := toTarget.Len()
			speed := mov.MaxSpeed
			if dist <= shipStopEps || speed <= 1e-3 || dist <= speed*dt {
				tr.Pos = targetTransform.Pos
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
			if dist <= shipStopEps || speed <= 1e-3 || dist <= speed*dt {
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
		if tr.Pos.X > worldW {
			tr.Pos.X = worldW
		}
		if tr.Pos.Y > worldH {
			tr.Pos.Y = worldH
		}

		if !chasing && route != nil && missile.WaypointIdx >= len(route.Waypoints) {
			tr.Vel = Vec2{}
		}

		hitShip := EntityID(0)
		world.ForEach([]ComponentKey{compTransform, compShip, compOwner}, func(shipID EntityID) {
			if hitShip != 0 {
				return
			}
			shipOwner := world.Owner(shipID)
			if shipOwner == nil || shipOwner.PlayerID == owner.PlayerID {
				return
			}
			shipTransform := world.Transform(shipID)
			if shipTransform == nil {
				return
			}
			if shipTransform.Pos.Sub(tr.Pos).Len() <= missileHitRadius {
				hitShip = shipID
			}
		})

		if hitShip != 0 {
			if shipData := world.ShipData(hitShip); shipData != nil {
				shipData.HP--
				if shipData.HP <= 0 {
					r.respawnShip(hitShip)
				}
			}
			toRemove = append(toRemove, id)
			return
		}

		if hist := world.HistoryComponent(id); hist != nil {
			hist.History.push(Snapshot{T: r.Now, Pos: tr.Pos, Vel: tr.Vel})
		}
	})

	for _, id := range toRemove {
		world.RemoveEntity(id)
	}
}
