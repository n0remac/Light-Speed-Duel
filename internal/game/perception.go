package game

// PerceiveEntity calculates what an observer at observerPos sees of a target entity
// at the given time, accounting for light delay.
// Returns the perceived snapshot of the target and whether it was found.
// Returns false if light from the entity hasn't reached the observer yet.
func PerceiveEntity(observerPos Vec2, target EntityID, world *World, now float64) (Snapshot, bool) {
	tr := world.Transform(target)
	hist := world.HistoryComponent(target)

	if tr == nil || hist == nil {
		return Snapshot{}, false
	}

	// Calculate distance from observer to target's current actual position
	distance := observerPos.Sub(tr.Pos).Len()

	// Calculate retarded time (when light left the target to reach observer now)
	tRet := now - (distance / C)

	// Get target's historical position at that retarded time
	snap, ok := hist.History.GetAt(tRet)
	if !ok {
		return Snapshot{}, false
	}

	// Check if the returned snapshot is from the requested time
	// If snap.T is significantly later than tRet, it means we got the earliest
	// snapshot as a fallback, which means light hasn't reached observer yet
	const tolerance = 0.01 // Small tolerance for floating point comparison
	if snap.T > tRet+tolerance {
		// Light hasn't reached observer yet - entity shouldn't be visible
		return Snapshot{}, false
	}

	return snap, true
}

// PerceivedDistance calculates the distance between observer and the perceived position of target
func PerceivedDistance(observerPos Vec2, target EntityID, world *World, now float64) float64 {
	snap, ok := PerceiveEntity(observerPos, target, world, now)
	if !ok {
		// Fallback to actual distance if perception fails
		if tr := world.Transform(target); tr != nil {
			return observerPos.Sub(tr.Pos).Len()
		}
		return 0
	}
	return observerPos.Sub(snap.Pos).Len()
}
