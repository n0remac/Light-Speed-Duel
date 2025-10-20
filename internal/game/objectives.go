package game

import (
	"math"
)

// ObjectiveEvaluator exposes mission objective completion checks.
type ObjectiveEvaluator interface {
	// Evaluate returns (complete, progress) where progress is 0.0-1.0.
	Evaluate(r *Room, p *Player) (bool, float64)
}

// DistanceEvaluator checks if a player's ship is within a threshold of a target point.
type DistanceEvaluator struct {
	TargetX    float64
	TargetY    float64
	Threshold  float64
	Identifier string
}

// Evaluate implements ObjectiveEvaluator.
func (e *DistanceEvaluator) Evaluate(r *Room, p *Player) (bool, float64) {
	if r == nil || p == nil || r.World == nil {
		return false, 0
	}
	ship := r.World.Transform(p.Ship)
	if ship == nil {
		return false, 0
	}
	dist := math.Hypot(ship.Pos.X-e.TargetX, ship.Pos.Y-e.TargetY)
	if dist <= e.Threshold {
		return true, 1
	}
	if e.Threshold <= 0 {
		return false, 0
	}
	maxDist := e.Threshold * 3
	if maxDist <= e.Threshold {
		return false, 0
	}
	progress := 1 - (dist-e.Threshold)/(maxDist-e.Threshold)
	return false, Clamp(progress, 0, 1)
}

// KillCountEvaluator checks if enough tagged entities have been destroyed.
type KillCountEvaluator struct {
	TargetTag     string
	RequiredKills int
	currentKills  int
}

// Evaluate implements ObjectiveEvaluator.
func (e *KillCountEvaluator) Evaluate(r *Room, _ *Player) (bool, float64) {
	if r == nil || r.World == nil || e.RequiredKills <= 0 || e.TargetTag == "" {
		return false, 0
	}
	killed := 0
	r.World.ForEach([]ComponentKey{CompTags}, func(id EntityID) {
		tags := r.World.Tags(id)
		if tags == nil || tags.Tags == nil || !tags.Tags[e.TargetTag] {
			return
		}
		if destroyed := r.World.DestroyedData(id); destroyed != nil {
			killed++
		}
	})
	e.currentKills = killed
	if killed >= e.RequiredKills {
		return true, 1
	}
	return false, float64(killed) / float64(e.RequiredKills)
}

// TimerEvaluator checks if elapsed room time exceeds the requirement.
type TimerEvaluator struct {
	StartTime    float64
	RequiredTime float64
	Identifier   string
}

// Evaluate implements ObjectiveEvaluator.
func (e *TimerEvaluator) Evaluate(r *Room, _ *Player) (bool, float64) {
	if r == nil || e.RequiredTime <= 0 {
		return false, 0
	}
	elapsed := r.Now - e.StartTime
	if elapsed >= e.RequiredTime {
		return true, 1
	}
	progress := elapsed / e.RequiredTime
	return false, Clamp(progress, 0, 1)
}

// HazardClearEvaluator checks if all tagged mines in an area are destroyed.
type HazardClearEvaluator struct {
	CenterX      float64
	CenterY      float64
	Radius       float64
	initialCount int
}

// Evaluate implements ObjectiveEvaluator.
func (e *HazardClearEvaluator) Evaluate(r *Room, _ *Player) (bool, float64) {
	if r == nil || r.World == nil || e.Radius <= 0 {
		return false, 0
	}
	total := 0
	remaining := 0
	r.World.ForEach([]ComponentKey{CompTags, CompTransform}, func(id EntityID) {
		tags := r.World.Tags(id)
		if tags == nil || tags.Tags == nil || !tags.Tags["mine"] {
			return
		}
		tr := r.World.Transform(id)
		if tr == nil {
			return
		}
		dist := math.Hypot(tr.Pos.X-e.CenterX, tr.Pos.Y-e.CenterY)
		if dist > e.Radius {
			return
		}
		total++
		if r.World.DestroyedData(id) == nil {
			remaining++
		}
	})

	if e.initialCount == 0 {
		e.initialCount = total
	}

	if total == 0 {
		return false, 0
	}
	if remaining == 0 {
		return true, 1
	}
	progress := float64(total-remaining) / float64(total)
	return false, Clamp(progress, 0, 1)
}
