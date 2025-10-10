package game

import "math"

// HeatParams defines the parameters for the heat system.
// Heat rises when flying above MarkerSpeed and dissipates below it.
type HeatParams struct {
	Max            float64 // Maximum heat capacity (e.g., 100)
	WarnAt         float64 // Warning threshold for UI (e.g., 70)
	OverheatAt     float64 // Overheat threshold triggers stall (e.g., 100)
	StallSeconds   float64 // Duration of stall when overheated (e.g., 2.5)
	MarkerSpeed    float64 // Neutral speed where net heat change = 0
	Exp            float64 // Response exponent for heat curve (e.g., 1.5)
	KUp            float64 // Heating rate scale above marker (e.g., 22.0)
	KDown          float64 // Cooling rate scale below marker (e.g., 16.0)
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
//   dev = speed - MarkerSpeed
//   if dev >= 0: Ḣ = +KUp * (dev/MarkerSpeed)^Exp
//   else:        Ḣ = -KDown * (|dev|/MarkerSpeed)^Exp
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

// DefaultHeatParams returns sensible default heat parameters.
func DefaultHeatParams() HeatParams {
	return HeatParams{
		Max:                100.0,
		WarnAt:             70.0,
		OverheatAt:         100.0,
		StallSeconds:       2.5,
		MarkerSpeed:        150.0, // Comfortable cruise speed (ShipMaxSpeed is 250)
		Exp:                1.5,
		KUp:                22.0,
		KDown:              16.0,
		MissileSpikeChance: 0.35,
		MissileSpikeMin:    6.0,
		MissileSpikeMax:    18.0,
	}
}
