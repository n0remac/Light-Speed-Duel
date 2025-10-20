package game

import (
	"math"
	"testing"
)

func TestPoissonDiscSamplerDeterminism(t *testing.T) {
	config := SamplerConfig{
		MinDistance:   200,
		MaxAttempts:   30,
		WorldBounds:   Rect{MinX: 0, MinY: 0, MaxX: 1000, MaxY: 1000},
		Seed:          42,
		DensityFactor: 1.0,
		BiomeTaggers: []BiomeTagger{
			QuadrantTagger(Rect{MinX: 0, MinY: 0, MaxX: 1000, MaxY: 1000}),
		},
	}

	samplerA := NewPoissonDiscSampler(config)
	samplerB := NewPoissonDiscSampler(config)

	count := 8
	beaconsA := samplerA.Sample(count)
	beaconsB := samplerB.Sample(count)

	if len(beaconsA) != len(beaconsB) {
		t.Fatalf("expected same beacon count: %d vs %d", len(beaconsA), len(beaconsB))
	}

	for i := range beaconsA {
		if !almostEqual(beaconsA[i].X, beaconsB[i].X) || !almostEqual(beaconsA[i].Y, beaconsB[i].Y) {
			t.Fatalf("determinism failure at index %d: (%.6f, %.6f) vs (%.6f, %.6f)",
				i, beaconsA[i].X, beaconsA[i].Y, beaconsB[i].X, beaconsB[i].Y)
		}
	}
}

func TestPoissonDiscSamplerDistanceConstraint(t *testing.T) {
	minDistance := 150.0
	config := SamplerConfig{
		MinDistance:   minDistance,
		MaxAttempts:   30,
		WorldBounds:   Rect{MinX: 0, MinY: 0, MaxX: 1200, MaxY: 1200},
		Seed:          99,
		DensityFactor: 1.0,
	}

	beacons := NewPoissonDiscSampler(config).Sample(10)
	for i := 0; i < len(beacons); i++ {
		for j := i + 1; j < len(beacons); j++ {
			dist := math.Hypot(beacons[i].X-beacons[j].X, beacons[i].Y-beacons[j].Y)
			if dist+1e-6 < minDistance {
				t.Fatalf("beacons %d and %d too close: %.2f < %.2f", i, j, dist, minDistance)
			}
		}
	}
}

func TestPoissonDiscSamplerDesignerPins(t *testing.T) {
	config := SamplerConfig{
		MinDistance: 200,
		WorldBounds: Rect{MinX: 0, MinY: 0, MaxX: 1000, MaxY: 1000},
		Seed:        7,
		DesignerPins: []BeaconPin{
			{
				X:      100,
				Y:      200,
				Radius: 420,
				Tags: map[string]bool{
					"start":     true,
					"safe-zone": true,
				},
			},
		},
	}

	beacons := NewPoissonDiscSampler(config).Sample(3)
	if len(beacons) == 0 {
		t.Fatalf("expected at least one beacon")
	}

	first := beacons[0]
	if !almostEqual(first.X, 100) || !almostEqual(first.Y, 200) {
		t.Fatalf("designer pin not preserved: got (%.2f, %.2f)", first.X, first.Y)
	}
	if !first.Tags["start"] || !first.Tags["safe-zone"] {
		t.Fatalf("designer tags missing on pinned beacon: %#v", first.Tags)
	}
	if !first.Pinned {
		t.Fatalf("expected pinned beacon to be marked")
	}
}

func TestQuadrantTagger(t *testing.T) {
	bounds := Rect{MinX: 0, MinY: 0, MaxX: 2000, MaxY: 2000}
	tagger := QuadrantTagger(bounds)

	tests := []struct {
		x, y float64
		tag  string
	}{
		{1800, 1800, "zone-ne"},
		{200, 1700, "zone-nw"},
		{1800, 200, "zone-se"},
		{200, 200, "zone-sw"},
	}

	for _, tc := range tests {
		tags := tagger(tc.x, tc.y)
		if !tags[tc.tag] {
			t.Fatalf("expected tag %s for position (%.0f, %.0f), got %#v", tc.tag, tc.x, tc.y, tags)
		}
		if !(tags["tier-1"] || tags["tier-2"] || tags["tier-3"]) {
			t.Fatalf("expected tier tag for position (%.0f, %.0f)", tc.x, tc.y)
		}
	}
}

func almostEqual(a, b float64) bool {
	return math.Abs(a-b) <= 1e-6
}
