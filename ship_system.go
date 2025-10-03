package main

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
