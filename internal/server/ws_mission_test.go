package server

import (
	"testing"

	. "LightSpeedDuel/internal/game"
)

func TestMissionBeaconFallbackPositions(t *testing.T) {
	room := &Room{
		WorldWidth:  12000,
		WorldHeight: 8000,
	}
	positions := missionBeaconFallbackPositions(room)
	if len(positions) != 4 {
		t.Fatalf("expected 4 beacons, got %d", len(positions))
	}

	expected := []Vec2{
		{X: 0.15 * room.WorldWidth, Y: 0.55 * room.WorldHeight},
		{X: 0.40 * room.WorldWidth, Y: 0.50 * room.WorldHeight},
		{X: 0.65 * room.WorldWidth, Y: 0.47 * room.WorldHeight},
		{X: 0.85 * room.WorldWidth, Y: 0.44 * room.WorldHeight},
	}
	for i, pos := range positions {
		if pos.X != expected[i].X || pos.Y != expected[i].Y {
			t.Errorf("beacon %d mismatch: got (%.2f, %.2f) expected (%.2f, %.2f)", i, pos.X, pos.Y, expected[i].X, expected[i].Y)
		}
	}
}

func TestNormalizeMissionID(t *testing.T) {
	cases := map[string]string{
		"":               "campaign-1",
		"1":              "campaign-1",
		"CAMPAIGN-1":     "campaign-1",
		"campaign-2":     "campaign-2",
		"  Campaign-3  ": "campaign-3",
	}
	for input, expected := range cases {
		actual := normalizeMissionID(input)
		if actual != expected {
			t.Errorf("normalizeMissionID(%q) = %q, expected %q", input, actual, expected)
		}
	}
}
