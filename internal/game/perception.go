package game

import "math"

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

    // Align tolerance with tick; use half a tick for final sampling tolerance
    tolerance := Dt
    epsilon := Dt * 0.5 // iteration convergence

    // Initial guess using current actual position
    d0 := observerPos.Sub(tr.Pos).Len()
    t := now - (d0 / C)
    // Clamp guess to retention window
    minT := now - HistoryKeepS
    if t > now {
        t = now
    }
    if t < minT {
        t = minT
    }

    // Fixed-point iterate t = now - |observer - pos(t)| / C
    const maxIter = 8
    for i := 0; i < maxIter; i++ {
        snap, ok := hist.History.GetAt(t)
        if !ok {
            return Snapshot{}, false
        }
        d := observerPos.Sub(snap.Pos).Len()
        nextT := now - (d / C)
        if nextT > now {
            nextT = now
        }
        if nextT < minT {
            nextT = minT
        }
        if math.Abs(nextT-t) <= epsilon {
            t = nextT
            break
        }
        t = nextT
    }

    // Check destruction time: if asking for light emitted after destruction, not visible
    destroyed := world.DestroyedData(target)
    if destroyed != nil && t > destroyed.DestroyedAt {
        return Snapshot{}, false
    }

    // Final sample at converged emission time
    snap, ok := hist.History.GetAt(t)
    if !ok {
        return Snapshot{}, false
    }

    // If the history can't provide a sample at or before t within tolerance,
    // we treat it as not yet visible to the observer.
    if snap.T > t+tolerance {
        return Snapshot{}, false
    }

    return snap, true
}

// PerceivedDistance calculates the distance between observer and the perceived position of target
func PerceivedDistance(observerPos Vec2, target EntityID, world *World, now float64) float64 {
    snap, ok := PerceiveEntity(observerPos, target, world, now)
    if !ok {
        // Strictly perception-based: if not perceived, treat as out of range
        return math.Inf(1)
    }
    return observerPos.Sub(snap.Pos).Len()
}
