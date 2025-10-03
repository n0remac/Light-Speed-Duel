package main

func (r *Room) appendShipWaypoint(shipID EntityID, wp ShipWaypoint) {
	if route := r.World.ShipRoute(shipID); route != nil {
		route.Waypoints = append(route.Waypoints, wp)
	}
}

func (r *Room) updateShipWaypoint(shipID EntityID, index int, speed float64) {
	if route := r.World.ShipRoute(shipID); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints[index].Speed = clamp(speed, 0, shipMaxSpeed)
		}
	}
}

func (r *Room) deleteShipWaypointsFrom(shipID EntityID, index int) {
	if route := r.World.ShipRoute(shipID); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints = route.Waypoints[:index]
		}
	}
}

func (r *Room) clearShipWaypoints(shipID EntityID) {
	if route := r.World.ShipRoute(shipID); route != nil {
		route.Waypoints = nil
	}
}
