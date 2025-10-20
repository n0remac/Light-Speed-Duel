package game

import "testing"

func TestSpawnMissionWaveUsesTemplates(t *testing.T) {
	room := &Room{
		ID:          "test-room",
		World:       newWorld(),
		Players:     map[string]*Player{},
		WorldWidth:  WorldW,
		WorldHeight: WorldH,
	}

	beacons := []Vec2{
		{X: 1000, Y: 1000},
		{X: 2000, Y: 2000},
		{X: 3000, Y: 3000},
		{X: 4000, Y: 4000},
	}

	entities := room.SpawnMissionWave(1, beacons)
	if len(entities) == 0 {
		t.Fatalf("expected entities for wave 1")
	}

	for _, id := range entities {
		tags := room.World.Tags(id)
		if tags == nil || tags.Tags == nil {
			t.Fatalf("expected tags on spawned entity %d", id)
		}
	}
}

func TestSpawnMissionWaveUnknownWave(t *testing.T) {
	room := &Room{
		World:       newWorld(),
		Players:     map[string]*Player{},
		WorldWidth:  WorldW,
		WorldHeight: WorldH,
	}
	beacons := []Vec2{{X: 1000, Y: 1000}}
	if ids := room.SpawnMissionWave(99, beacons); len(ids) != 0 {
		t.Fatalf("expected no entities for unknown wave, got %d", len(ids))
	}
}
