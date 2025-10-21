package game

import (
	"math"
	"math/rand"
	"testing"
)

func TestSpawnEncounterFromTemplateUsesAnnulus(t *testing.T) {
	room := &Room{
		World:       newWorld(),
		WorldWidth:  WorldW,
		WorldHeight: WorldH,
	}

	director := &BeaconDirector{
		beacons: []BeaconLayout{
			{
				ID:         "beacon-1",
				Ordinal:    0,
				Normalized: Vec2{X: 0.5, Y: 0.5},
				Radius:     650,
				Seed:       8675309,
			},
		},
		encounters:         make(map[string]*EncounterState),
		encounterCooldowns: make(map[string]float64),
		rng:                rand.New(rand.NewSource(42)),
		spec: MissionSpec{
			EncounterTimeout: 120,
		},
	}

	template, err := GetEncounter("minefield-basic")
	if err != nil {
		t.Fatalf("failed to load encounter template: %v", err)
	}

	beacon := &director.beacons[0]
	director.spawnEncounterFromTemplate(room, "minefield-basic", 0, beacon, template, SpawnRule{})

	if len(director.encounters) == 0 {
		t.Fatal("expected encounter to be registered")
	}

	center := director.beaconWorldPosition(beacon, room)
	safe := beacon.Radius
	spread := math.Max(1200, safe*3)

	for _, enc := range director.encounters {
		for _, id := range enc.EntityIDs {
			tr := room.World.Transform(id)
			if tr == nil {
				t.Fatalf("expected transform for entity %d", id)
			}
			dist := tr.Pos.Sub(center).Len()
			if dist < safe-1e-3 {
				t.Fatalf("entity %d spawned inside safe radius: %.2f < %.2f", id, dist, safe)
			}
			if dist > spread+1e-3 {
				t.Fatalf("entity %d spawned outside spread radius: %.2f > %.2f", id, dist, spread)
			}
		}
	}
}
