package game

import "math"

// HeatParams defines the parameters for the heat system.
// Heat rises when flying above MarkerSpeed and dissipates below it.
type HeatParams struct {
	Max                float64 // Maximum heat capacity (e.g., 100)
	WarnAt             float64 // Warning threshold for UI (e.g., 70)
	OverheatAt         float64 // Overheat threshold triggers stall (e.g., 100)
	StallSeconds       float64 // Duration of stall when overheated (e.g., 2.5)
	MarkerSpeed        float64 // Neutral speed where net heat change = 0
	Exp                float64 // Response exponent for heat curve (e.g., 1.5)
	KUp                float64 // Heating rate scale above marker (e.g., 22.0)
	KDown              float64 // Cooling rate scale below marker (e.g., 16.0)
	MissileSpikeChance float64 // Probability of heat spike on missile hit (0..1)
	MissileSpikeMin    float64 // Minimum heat spike amount
	MissileSpikeMax    float64 // Maximum heat spike amount
}

// HeatState represents the current heat state of a ship.
type HeatState struct {
	Value      float64 // Current heat level (0..Max)
	StallUntil float64 // Game time when stall ends; 0 if not stalling
}

// HeatComponent is the ECS component for ship heat.
type HeatComponent struct {
	P HeatParams
	S HeatState
}

// IsStalled returns true if the ship is currently stalled.
func (h *HeatComponent) IsStalled(now float64) bool {
	return now < h.S.StallUntil
}

// UpdateHeat computes and applies heat change based on current speed.
// Uses marker-based model: heat rises above MarkerSpeed, dissipates below.
//
// Formula:
//
//	dev = speed - MarkerSpeed
//	if dev >= 0: Ḣ = +KUp * (dev/MarkerSpeed)^Exp
//	else:        Ḣ = -KDown * (|dev|/MarkerSpeed)^Exp
func UpdateHeat(h *HeatComponent, speed float64, dt, now float64) {
	Vn := math.Max(h.P.MarkerSpeed, 1e-6) // Avoid division by zero
	dev := speed - h.P.MarkerSpeed
	p := h.P.Exp

	var hdot float64
	if dev >= 0 {
		// Above marker: heat accumulates
		hdot = h.P.KUp * math.Pow(dev/Vn, p)
	} else {
		// Below marker: heat dissipates
		hdot = -h.P.KDown * math.Pow(math.Abs(dev)/Vn, p)
	}

	// Integrate heat change
	h.S.Value += hdot * dt

	// Clamp to valid range
	if h.S.Value < 0 {
		h.S.Value = 0
	}
	if h.S.Value > h.P.Max {
		h.S.Value = h.P.Max
	}

	// Trigger stall if overheating (and not already stalled)
	if h.S.Value >= h.P.OverheatAt && now >= h.S.StallUntil {
		h.S.StallUntil = now + h.P.StallSeconds
	}
}

// ApplyMissileHeatSpike adds a stochastic heat spike when a missile impacts the ship.
// Returns true if a spike was applied.
func ApplyMissileHeatSpike(h *HeatComponent, now float64, rng func() float64) bool {
	if h == nil || rng == nil {
		return false
	}
	if h.P.MissileSpikeChance <= 0 || h.P.MissileSpikeMax <= 0 {
		return false
	}
	chance := rng()
	if chance >= h.P.MissileSpikeChance {
		return false
	}
	span := h.P.MissileSpikeMax - h.P.MissileSpikeMin
	if span < 0 {
		span = 0
	}
	spike := h.P.MissileSpikeMin
	if span > 0 {
		spike += rng() * span
	}
	h.S.Value += spike
	if h.S.Value > h.P.Max {
		h.S.Value = h.P.Max
	}
	if h.S.Value >= h.P.OverheatAt && now >= h.S.StallUntil {
		h.S.StallUntil = now + h.P.StallSeconds
	}
	return true
}

// SanitizeHeatParams clamps and normalizes heat parameters to safe defaults.
func SanitizeHeatParams(p HeatParams) HeatParams {
	defaults := HeatParams{
		Max:                HeatMax,
		WarnAt:             HeatWarnAt,
		OverheatAt:         HeatOverheatAt,
		StallSeconds:       HeatStallSeconds,
		MarkerSpeed:        HeatMarkerSpeed,
		Exp:                HeatExp,
		KUp:                HeatKUp,
		KDown:              HeatKDown,
		MissileSpikeChance: HeatMissileSpikeChance,
		MissileSpikeMin:    HeatMissileSpikeMin,
		MissileSpikeMax:    HeatMissileSpikeMax,
	}

	if !(p.Max > 0) {
		p.Max = defaults.Max
	}
	if !(p.WarnAt > 0 && p.WarnAt <= p.Max) {
		p.WarnAt = defaults.WarnAt
	}
	if !(p.OverheatAt > 0 && p.OverheatAt <= p.Max && p.OverheatAt >= p.WarnAt) {
		p.OverheatAt = math.Max(p.WarnAt, defaults.OverheatAt)
		if p.OverheatAt > p.Max {
			p.OverheatAt = p.Max
		}
	}
	if !(p.StallSeconds >= 0) {
		p.StallSeconds = defaults.StallSeconds
	}
	if !(p.MarkerSpeed > 0) {
		p.MarkerSpeed = defaults.MarkerSpeed
	}
	if !(p.Exp > 0) {
		p.Exp = defaults.Exp
	}
	if !(p.KUp >= 0) {
		p.KUp = defaults.KUp
	}
	if !(p.KDown >= 0) {
		p.KDown = defaults.KDown
	}
	if p.MissileSpikeChance < 0 {
		p.MissileSpikeChance = 0
	}
	if p.MissileSpikeChance > 1 {
		p.MissileSpikeChance = 1
	}
	if !(p.MissileSpikeMin >= 0) {
		p.MissileSpikeMin = defaults.MissileSpikeMin
	}
	if !(p.MissileSpikeMax >= p.MissileSpikeMin) {
		p.MissileSpikeMax = math.Max(p.MissileSpikeMin, defaults.MissileSpikeMax)
	}
	return p
}

// DefaultHeatParams returns sensible default heat parameters for ships.
func DefaultHeatParams() HeatParams {
	// Default values sourced from consts.go to avoid drift
	return SanitizeHeatParams(HeatParams{
		Max:                HeatMax,
		WarnAt:             HeatWarnAt,
		OverheatAt:         HeatOverheatAt,
		StallSeconds:       HeatStallSeconds,
		MarkerSpeed:        HeatMarkerSpeed,
		Exp:                HeatExp,
		KUp:                HeatKUp,
		KDown:              HeatKDown,
		MissileSpikeChance: HeatMissileSpikeChance,
		MissileSpikeMin:    HeatMissileSpikeMin,
		MissileSpikeMax:    HeatMissileSpikeMax,
	})
}

// DefaultMissileHeatParams returns default heat parameters for missiles.
// Missiles use the same heat physics as ships but with different thresholds:
// - Lower heat capacity (50 vs 100)
// - Faster heating, slower cooling
// - Lower marker speed for efficiency
// - No stall time (missiles explode when overheated)
func DefaultMissileHeatParams() HeatParams {
	return SanitizeHeatParams(HeatParams{
		Max:                MissileHeatMax,
		WarnAt:             MissileHeatWarnAt,
		OverheatAt:         MissileHeatOverheatAt,
		StallSeconds:       0.0, // Missiles explode instead of stalling
		MarkerSpeed:        MissileHeatMarkerSpeed,
		Exp:                MissileHeatExp,
		KUp:                MissileHeatKUp,
		KDown:              MissileHeatKDown,
		MissileSpikeChance: 0.0, // Missiles don't get heat spikes from hits
		MissileSpikeMin:    0.0,
		MissileSpikeMax:    0.0,
	})
}

// ProjectHeatForRoute simulates heat changes along a planned route
// Returns array of projected heat values at each waypoint
// projected[0] = current heat, projected[i] = heat after waypoint i-1
//
// Phase 1a implementation: Simple projection based on waypoint speed and distance
func ProjectHeatForRoute(currentHeat float64, params HeatParams, currentPos Vec2, currentSpeed float64, waypoints []RouteWaypoint) []float64 {
	projected := make([]float64, len(waypoints)+1)
	projected[0] = currentHeat

	heat := currentHeat
	pos := currentPos
	speed := currentSpeed

	for i, wp := range waypoints {
		targetSpeed := wp.Speed
		targetPos := wp.Pos

		// Calculate distance to waypoint
		distance := targetPos.Sub(pos).Len()
		if distance < 1e-6 {
			// Already at waypoint
			projected[i+1] = heat
			continue
		}

		// Estimate average speed during segment
		// Simple approximation: average of current and target speed
		avgSpeed := (speed + targetSpeed) * 0.5

		// Estimate time to reach waypoint
		// This is simplified - actual physics includes acceleration curves
		segmentTime := distance / math.Max(avgSpeed, 1.0)

		// Calculate heat rate at average speed
		Vn := math.Max(params.MarkerSpeed, 1e-6)
		dev := avgSpeed - params.MarkerSpeed
		p := params.Exp

		var hdot float64
		if dev >= 0 {
			// Above marker: heat accumulates
			hdot = params.KUp * math.Pow(dev/Vn, p)
		} else {
			// Below marker: heat dissipates
			hdot = -params.KDown * math.Pow(math.Abs(dev)/Vn, p)
		}

		// Integrate heat change over segment
		heat += hdot * segmentTime

		// Clamp to valid range
		if heat < 0 {
			heat = 0
		}
		if heat > params.Max {
			heat = params.Max
		}

		projected[i+1] = heat

		// Update position and speed for next segment
		pos = targetPos
		speed = targetSpeed
	}

	return projected
}
