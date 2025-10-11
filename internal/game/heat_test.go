package game

import (
	"math"
	"testing"
)

// TestHeatNeutralAtMarker verifies that heat remains constant when speed equals MarkerSpeed
func TestHeatNeutralAtMarker(t *testing.T) {
	heat := &HeatComponent{
		P: DefaultHeatParams(),
		S: HeatState{Value: 50.0, StallUntil: 0},
	}

	initialHeat := heat.S.Value
	speed := heat.P.MarkerSpeed
	dt := 0.05
	now := 10.0

	// Run several updates at marker speed
	for i := 0; i < 100; i++ {
		UpdateHeat(heat, speed, dt, now)
		now += dt
	}

	// Heat should remain essentially unchanged (within floating point tolerance)
	if math.Abs(heat.S.Value-initialHeat) > 0.1 {
		t.Errorf("Heat changed at marker speed: started at %.2f, ended at %.2f", initialHeat, heat.S.Value)
	}
}

// TestHeatAboveMarkerAccumulates verifies that heat increases when speed > MarkerSpeed
func TestHeatAboveMarkerAccumulates(t *testing.T) {
	heat := &HeatComponent{
		P: DefaultHeatParams(),
		S: HeatState{Value: 0, StallUntil: 0},
	}

	speed := heat.P.MarkerSpeed * 1.5 // 50% above marker
	dt := 0.05
	now := 10.0

	prevHeat := heat.S.Value

	// Run updates at high speed
	for i := 0; i < 50; i++ {
		UpdateHeat(heat, speed, dt, now)
		now += dt

		// Each tick, heat should increase
		if heat.S.Value < prevHeat {
			t.Errorf("Heat decreased when it should accumulate: %.2f -> %.2f", prevHeat, heat.S.Value)
		}
		prevHeat = heat.S.Value
	}

	// Heat should have accumulated significantly
	if heat.S.Value < 10.0 {
		t.Errorf("Heat did not accumulate enough above marker: final heat %.2f", heat.S.Value)
	}
}

// TestHeatBelowMarkerDissipates verifies that heat decreases when speed < MarkerSpeed
func TestHeatBelowMarkerDissipates(t *testing.T) {
	heat := &HeatComponent{
		P: DefaultHeatParams(),
		S: HeatState{Value: 80.0, StallUntil: 0}, // Start with high heat
	}

	speed := heat.P.MarkerSpeed * 0.5 // 50% below marker
	dt := 0.05
	now := 10.0

	prevHeat := heat.S.Value

	// Run updates at low speed
	for i := 0; i < 50; i++ {
		UpdateHeat(heat, speed, dt, now)
		now += dt

		// Each tick, heat should decrease
		if heat.S.Value > prevHeat {
			t.Errorf("Heat increased when it should dissipate: %.2f -> %.2f", prevHeat, heat.S.Value)
		}
		prevHeat = heat.S.Value
	}

	// Heat should have dissipated significantly
	if heat.S.Value > 70.0 {
		t.Errorf("Heat did not dissipate enough below marker: final heat %.2f", heat.S.Value)
	}

	// Heat should never go below zero
	if heat.S.Value < 0 {
		t.Errorf("Heat went negative: %.2f", heat.S.Value)
	}
}

// TestStallTriggersAtOverheat verifies that reaching overheat threshold triggers a stall
func TestStallTriggersAtOverheat(t *testing.T) {
	heat := &HeatComponent{
		P: DefaultHeatParams(),
		S: HeatState{Value: 99.0, StallUntil: 0},
	}

	speed := heat.P.MarkerSpeed * 2.0 // Very high speed
	dt := 0.05
	now := 10.0

	// Should not be stalled initially
	if heat.IsStalled(now) {
		t.Error("Ship stalled before reaching overheat threshold")
	}

	// Push heat over the overheat threshold
	UpdateHeat(heat, speed, dt, now)

	// Should trigger stall
	if heat.S.Value < heat.P.OverheatAt {
		t.Errorf("Heat did not reach overheat threshold: %.2f < %.2f", heat.S.Value, heat.P.OverheatAt)
	}

	if !heat.IsStalled(now) {
		t.Error("Ship not stalled after overheating")
	}

	// Stall should have a future end time
	if heat.S.StallUntil <= now {
		t.Errorf("Stall end time not set correctly: %.2f <= %.2f", heat.S.StallUntil, now)
	}

	// Should still be stalled immediately after
	if !heat.IsStalled(now + 0.1) {
		t.Error("Ship not stalled shortly after overheat")
	}

	// Should not be stalled after stall duration passes
	afterStall := heat.S.StallUntil + 0.1
	if heat.IsStalled(afterStall) {
		t.Error("Ship still stalled after stall duration expired")
	}
}

// TestClampAtMax verifies that heat never exceeds Max parameter
func TestClampAtMax(t *testing.T) {
	heat := &HeatComponent{
		P: DefaultHeatParams(),
		S: HeatState{Value: 99.0, StallUntil: 0},
	}

	speed := heat.P.MarkerSpeed * 3.0 // Extremely high speed
	dt := 0.05
	now := 10.0

	// Run many updates at very high speed
	for i := 0; i < 200; i++ {
		UpdateHeat(heat, speed, dt, now)
		now += dt

		// Heat should never exceed Max
		if heat.S.Value > heat.P.Max {
			t.Errorf("Heat exceeded Max: %.2f > %.2f", heat.S.Value, heat.P.Max)
		}
	}

	// Heat should have reached Max
	if heat.S.Value < heat.P.Max-0.1 {
		t.Errorf("Heat did not reach Max after sustained high speed: %.2f < %.2f", heat.S.Value, heat.P.Max)
	}
}

// TestHeatSymmetry verifies that heating and cooling are roughly symmetric at equal deviations
func TestHeatSymmetry(t *testing.T) {
	params := DefaultHeatParams()

	// Test heating
	heatUp := &HeatComponent{
		P: params,
		S: HeatState{Value: 50.0, StallUntil: 0},
	}
	speedAbove := params.MarkerSpeed * 1.3
	dt := 0.05
	now := 10.0

	for i := 0; i < 20; i++ {
		UpdateHeat(heatUp, speedAbove, dt, now)
		now += dt
	}
	heatGained := heatUp.S.Value - 50.0

	// Test cooling
	heatDown := &HeatComponent{
		P: params,
		S: HeatState{Value: 50.0, StallUntil: 0},
	}
	speedBelow := params.MarkerSpeed * 0.7 // Same 30% deviation, but below
	now = 10.0

	for i := 0; i < 20; i++ {
		UpdateHeat(heatDown, speedBelow, dt, now)
		now += dt
	}
	heatLost := 50.0 - heatDown.S.Value

	// Heat gained and lost should be in similar ranges (not exactly equal due to KUp vs KDown)
	// We expect them to be within a factor of 2 of each other
	ratio := heatGained / heatLost
	if ratio < 0.5 || ratio > 2.5 {
		t.Errorf("Heat gain/loss asymmetry too large: gained %.2f, lost %.2f (ratio %.2f)", heatGained, heatLost, ratio)
	}
}

// TestStallDoesNotResetWhileStalled verifies that triggering overheat while already stalled doesn't reset the timer
func TestStallDoesNotResetWhileStalled(t *testing.T) {
	heat := &HeatComponent{
		P: DefaultHeatParams(),
		S: HeatState{Value: 100.0, StallUntil: 15.0}, // Already stalled until t=15
	}

	now := 10.0 // Current time before stall ends
	initialStallEnd := heat.S.StallUntil

	// Try to trigger overheat again while already stalled
	speed := heat.P.MarkerSpeed * 2.0
	dt := 0.05
	UpdateHeat(heat, speed, dt, now)

	// Stall end time should not change (still stalled from original overheat)
	if heat.S.StallUntil != initialStallEnd {
		t.Errorf("Stall timer changed while already stalled: %.2f -> %.2f", initialStallEnd, heat.S.StallUntil)
	}
}

func TestApplyMissileHeatSpikeTriggersWithinBounds(t *testing.T) {
	params := DefaultHeatParams()
	params.MissileSpikeChance = 1.0
	params.MissileSpikeMin = 5
	params.MissileSpikeMax = 10

	heat := &HeatComponent{
		P: params,
		S: HeatState{Value: 40, StallUntil: 0},
	}

	rngCalls := []float64{0.2, 0.5}
	callIdx := 0
	spiked := ApplyMissileHeatSpike(heat, 0, func() float64 {
		val := rngCalls[callIdx%len(rngCalls)]
		callIdx++
		return val
	})

	if !spiked {
		t.Fatalf("expected spike to trigger with 100%% chance")
	}
	if heat.S.Value < 45 || heat.S.Value > 50 {
		t.Fatalf("spike outside expected bounds: got %.2f", heat.S.Value)
	}
}

func TestApplyMissileHeatSpikeRespectsChanceAndStall(t *testing.T) {
	params := DefaultHeatParams()
	params.MissileSpikeChance = 0.5
	params.MissileSpikeMin = 50
	params.MissileSpikeMax = 50
	params.OverheatAt = 75
	params.StallSeconds = 3

	heat := &HeatComponent{
		P: params,
		S: HeatState{Value: 40, StallUntil: 0},
	}

	// First call: chance fails (rng returns 0.8)
	spiked := ApplyMissileHeatSpike(heat, 1, func() float64 { return 0.8 })
	if spiked {
		t.Fatalf("spike should not have triggered when rng above chance")
	}
	if heat.S.Value != 40 {
		t.Fatalf("heat should not change when spike fails: got %.2f", heat.S.Value)
	}

	// Second call: chance succeeds, spike places us over threshold, stall should start
	call := 0
	spiked = ApplyMissileHeatSpike(heat, 2, func() float64 {
		if call == 0 {
			call++
			return 0.1
		}
		return 0.9
	})
	if !spiked {
		t.Fatalf("expected spike to trigger on second call")
	}
	if heat.S.Value != 90 {
		t.Fatalf("expected heat to jump to 90 got %.2f", heat.S.Value)
	}
	expectedStall := 2 + params.StallSeconds
	if heat.S.StallUntil != expectedStall {
		t.Fatalf("expected stall until %.2f got %.2f", expectedStall, heat.S.StallUntil)
	}
}

func TestSanitizeHeatParamsUsesDefaultsForInvalidValues(t *testing.T) {
	p := HeatParams{
		Max:                -10,
		WarnAt:             200,
		OverheatAt:         50,
		StallSeconds:       -1,
		MarkerSpeed:        0,
		Exp:                -2,
		KUp:                -3,
		KDown:              -4,
		MissileSpikeChance: 2,
		MissileSpikeMin:    -5,
		MissileSpikeMax:    -1,
	}

	s := SanitizeHeatParams(p)
	defaults := DefaultHeatParams()

	if s.Max != defaults.Max {
		t.Errorf("expected Max to fallback to default, got %.2f want %.2f", s.Max, defaults.Max)
	}
	if s.WarnAt != defaults.WarnAt {
		t.Errorf("expected WarnAt default, got %.2f want %.2f", s.WarnAt, defaults.WarnAt)
	}
	if s.OverheatAt != defaults.OverheatAt {
		t.Errorf("expected OverheatAt default, got %.2f want %.2f", s.OverheatAt, defaults.OverheatAt)
	}
	if s.StallSeconds != defaults.StallSeconds {
		t.Errorf("expected StallSeconds default, got %.2f want %.2f", s.StallSeconds, defaults.StallSeconds)
	}
	if s.MarkerSpeed != defaults.MarkerSpeed {
		t.Errorf("expected MarkerSpeed default, got %.2f want %.2f", s.MarkerSpeed, defaults.MarkerSpeed)
	}
	if s.Exp != defaults.Exp {
		t.Errorf("expected Exp default, got %.2f want %.2f", s.Exp, defaults.Exp)
	}
	if s.KUp != defaults.KUp {
		t.Errorf("expected KUp default, got %.2f want %.2f", s.KUp, defaults.KUp)
	}
	if s.KDown != defaults.KDown {
		t.Errorf("expected KDown default, got %.2f want %.2f", s.KDown, defaults.KDown)
	}
	if s.MissileSpikeChance < 0 || s.MissileSpikeChance > 1 {
		t.Errorf("expected spike chance clamped to [0,1], got %.2f", s.MissileSpikeChance)
	}
	if s.MissileSpikeMin < 0 {
		t.Errorf("expected spike min >= 0, got %.2f", s.MissileSpikeMin)
	}
	if s.MissileSpikeMax < s.MissileSpikeMin {
		t.Errorf("expected spike max >= spike min, got min %.2f max %.2f", s.MissileSpikeMin, s.MissileSpikeMax)
	}
}
