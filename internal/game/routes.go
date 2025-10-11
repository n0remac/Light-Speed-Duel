package game

func (r *Room) AppendShipWaypoint(shipID EntityID, wp ShipWaypoint) {
	if route := r.World.ShipRoute(shipID); route != nil {
		route.Waypoints = append(route.Waypoints, wp)
	}
}

func (r *Room) UpdateShipWaypoint(shipID EntityID, index int, speed float64) {
	if route := r.World.ShipRoute(shipID); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints[index].Speed = Clamp(speed, 0, ShipMaxSpeed)
		}
	}
}

func (r *Room) DeleteShipWaypointsFrom(shipID EntityID, index int) {
	if route := r.World.ShipRoute(shipID); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints = route.Waypoints[:index]
		}
	}
}

func (r *Room) ClearShipWaypoints(shipID EntityID) {
	if route := r.World.ShipRoute(shipID); route != nil {
		route.Waypoints = route.Waypoints[:0]
	}
}

// MoveShipWaypoint updates an existing waypoint position
// This allows drag-and-drop waypoint editing from the client
func (r *Room) MoveShipWaypoint(shipID EntityID, index int, newPos Vec2) {
	if route := r.World.ShipRoute(shipID); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints[index].Pos = newPos
		}
	}
}
