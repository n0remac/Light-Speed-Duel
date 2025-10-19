package game

import (
	"testing"
)

func TestLerpVec(t *testing.T) {
	a := Vec2{X: 0, Y: 0}
	b := Vec2{X: 100, Y: 100}

	mid := lerpVec(a, b, 0.5)
	if mid.X != 50 || mid.Y != 50 {
		t.Fatalf("expected midpoint (50,50), got (%.2f, %.2f)", mid.X, mid.Y)
	}

	start := lerpVec(a, b, 0.0)
	if start.X != 0 || start.Y != 0 {
		t.Fatalf("expected start (0,0), got (%.2f, %.2f)", start.X, start.Y)
	}

	end := lerpVec(a, b, 1.0)
	if end.X != 100 || end.Y != 100 {
		t.Fatalf("expected end (100,100), got (%.2f, %.2f)", end.X, end.Y)
	}
}

func TestLerpVecWithVerticalSpreadBounds(t *testing.T) {
	a := Vec2{X: 0, Y: 5000}
	b := Vec2{X: 10000, Y: 5000}
	worldHeight := 10000.0
	spread := 0.15

	for i := 0; i < 10; i++ {
		result := lerpVecWithVerticalSpread(a, b, 0.5, worldHeight, spread)
		if result.Y < 0 || result.Y > worldHeight {
			t.Fatalf("expected Y within [0, %.2f], got %.2f", worldHeight, result.Y)
		}
	}
}
