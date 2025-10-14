package server

import (
	"testing"

	. "LightSpeedDuel/internal/game"
)

func TestMissionBeaconPositions(t *testing.T) {
	room := &Room{
		WorldWidth:  10000.0,
		WorldHeight: 8000.0,
	}

	// Test that beacons are generated with proper X spacing and Y variance
	beacons := missionBeaconPositions(room)

	if len(beacons) != 4 {
		t.Fatalf("Expected 4 beacons, got %d", len(beacons))
	}

	// Check X positions are as expected (horizontal spacing)
	expectedX := []float64{0.15 * room.WorldWidth, 0.40 * room.WorldWidth, 0.65 * room.WorldWidth, 0.85 * room.WorldWidth}
	for i, beacon := range beacons {
		if beacon.X != expectedX[i] {
			t.Errorf("Beacon %d: expected X=%.2f, got %.2f", i, expectedX[i], beacon.X)
		}
	}

	// Check Y positions have variance and are within bounds
	for i, beacon := range beacons {
		if beacon.Y < 0 || beacon.Y > room.WorldHeight {
			t.Errorf("Beacon %d: Y position %.2f is out of bounds [0, %.2f]", i, beacon.Y, room.WorldHeight)
		}
		// Y should be within 0.35 to 0.65 of world height (0.50 ± 0.15)
		minY := 0.35 * room.WorldHeight
		maxY := 0.65 * room.WorldHeight
		if beacon.Y < minY || beacon.Y > maxY {
			t.Errorf("Beacon %d: Y position %.2f is outside expected range [%.2f, %.2f]", i, beacon.Y, minY, maxY)
		}
	}
}

func TestLerpVec(t *testing.T) {
	a := Vec2{X: 0, Y: 0}
	b := Vec2{X: 100, Y: 100}

	// Test basic interpolation
	mid := lerpVec(a, b, 0.5)
	if mid.X != 50 || mid.Y != 50 {
		t.Errorf("Expected (50, 50), got (%.2f, %.2f)", mid.X, mid.Y)
	}

	// Test at endpoints
	start := lerpVec(a, b, 0.0)
	if start.X != 0 || start.Y != 0 {
		t.Errorf("Expected (0, 0), got (%.2f, %.2f)", start.X, start.Y)
	}

	end := lerpVec(a, b, 1.0)
	if end.X != 100 || end.Y != 100 {
		t.Errorf("Expected (100, 100), got (%.2f, %.2f)", end.X, end.Y)
	}
}

func TestLerpVecWithVerticalSpread(t *testing.T) {
	a := Vec2{X: 0, Y: 5000}
	b := Vec2{X: 10000, Y: 5000}
	worldHeight := 10000.0
	spreadFactor := 0.15

	// Test multiple times to check variance
	results := make([]Vec2, 10)
	for i := range results {
		results[i] = lerpVecWithVerticalSpread(a, b, 0.5, worldHeight, spreadFactor)
	}

	// Check all results are within bounds
	for i, result := range results {
		if result.Y < 0 || result.Y > worldHeight {
			t.Errorf("Result %d: Y position %.2f is out of bounds [0, %.2f]", i, result.Y, worldHeight)
		}

		// X should be interpolated correctly (should be 5000 at t=0.5)
		if result.X != 5000 {
			t.Errorf("Result %d: X position %.2f != 5000", i, result.X)
		}
	}

	// Check that there is actual variance (not all Y values are the same)
	firstY := results[0].Y
	hasVariance := false
	for i := 1; i < len(results); i++ {
		if results[i].Y != firstY {
			hasVariance = true
			break
		}
	}
	if !hasVariance {
		t.Error("No Y variance detected in results; all Y values are identical")
	}
}

func TestLerpVecWithVerticalSpreadBoundsClamping(t *testing.T) {
	a := Vec2{X: 0, Y: 0}
	b := Vec2{X: 100, Y: 0}
	worldHeight := 100.0
	spreadFactor := 2.0 // Intentionally large to test clamping

	// Run multiple times to try to trigger boundary conditions
	for i := 0; i < 100; i++ {
		result := lerpVecWithVerticalSpread(a, b, 0.5, worldHeight, spreadFactor)
		if result.Y < 0 {
			t.Errorf("Y position %.2f is below 0", result.Y)
		}
		if result.Y > worldHeight {
			t.Errorf("Y position %.2f is above worldHeight %.2f", result.Y, worldHeight)
		}
	}
}
