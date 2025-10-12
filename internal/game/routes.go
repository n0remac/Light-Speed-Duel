package game

func clampRouteSpeed(entityID EntityID, speed float64, world *World) float64 {
	maxSpeed := ShipMaxSpeed
	if mov := world.Movement(entityID); mov != nil && mov.MaxSpeed > 0 {
		maxSpeed = mov.MaxSpeed
	}
	return Clamp(speed, 0, maxSpeed)
}

func (r *Room) AppendRouteWaypoint(entityID EntityID, wp RouteWaypoint) {
	wp.Speed = clampRouteSpeed(entityID, wp.Speed, r.World)
	if route := r.World.Route(entityID); route != nil {
		route.Waypoints = append(route.Waypoints, wp)
	}
}

func (r *Room) UpdateRouteWaypointSpeed(entityID EntityID, index int, speed float64) {
	if route := r.World.Route(entityID); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints[index].Speed = clampRouteSpeed(entityID, speed, r.World)
		}
	}
}

func (r *Room) DeleteRouteWaypointsFrom(entityID EntityID, index int) {
	if route := r.World.Route(entityID); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints = route.Waypoints[:index]
			if follower := r.World.RouteFollower(entityID); follower != nil {
				if follower.Index > len(route.Waypoints) {
					follower.Index = len(route.Waypoints)
				}
			}
		}
	}
}

func (r *Room) ClearRouteWaypoints(entityID EntityID) {
	if route := r.World.Route(entityID); route != nil {
		route.Waypoints = route.Waypoints[:0]
	}
	if follower := r.World.RouteFollower(entityID); follower != nil {
		follower.Index = 0
		follower.Hold = false
		follower.hasOverride = false
	}
}

// MoveRouteWaypoint updates an existing waypoint position to support drag-and-drop editing.
func (r *Room) MoveRouteWaypoint(entityID EntityID, index int, newPos Vec2) {
	if route := r.World.Route(entityID); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints[index].Pos = newPos
		}
	}
}
