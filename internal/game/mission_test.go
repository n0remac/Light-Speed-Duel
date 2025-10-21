package game

import (
	"math"
	"testing"
)

func TestSpawnMissionWaveWithContextUsesTemplates(t *testing.T) {
	room := &Room{
		ID:          "test-room",
		World:       newWorld(),
		Players:     map[string]*Player{},
		WorldWidth:  WorldW,
		WorldHeight: WorldH,
	}

	beacons := []Vec2{
		{X: 1500, Y: 1500},
		{X: 3200, Y: 1800},
		{X: 4200, Y: 2600},
	}
	radii := []float64{600, 700, 800}

	entities := room.SpawnMissionWaveWithContext(1, beacons, radii)
	if len(entities) == 0 {
		t.Fatalf("expected entities for wave 1")
	}

	center := beacons[0]
	safe := radii[0]
	maxRadius := math.Max(1200, safe*3)

	for _, id := range entities {
		tr := room.World.Transform(id)
		if tr == nil {
			t.Fatalf("expected transform for entity %d", id)
		}
		dist := tr.Pos.Sub(center).Len()
		if dist < safe {
			t.Fatalf("entity %d spawned inside safe radius %.2f < %.2f", id, dist, safe)
		}
		if dist > maxRadius+1e-3 {
			t.Fatalf("entity %d spawned outside spread radius %.2f > %.2f", id, dist, maxRadius)
		}
	}
}

func TestSpawnMissionWaveWithContextUnknownWave(t *testing.T) {
	room := &Room{
		World:       newWorld(),
		Players:     map[string]*Player{},
		WorldWidth:  WorldW,
		WorldHeight: WorldH,
	}
	beacons := []Vec2{{X: 1000, Y: 1000}}
	if ids := room.SpawnMissionWaveWithContext(99, beacons, nil); len(ids) != 0 {
		t.Fatalf("expected no entities for unknown wave, got %d", len(ids))
	}
}

func TestSpawnFromTemplateWithContextRespectsAnnulus(t *testing.T) {
	room := &Room{
		World:       newWorld(),
		Players:     map[string]*Player{},
		WorldWidth:  WorldW,
		WorldHeight: WorldH,
	}

	template, err := GetEncounter("patrol-light")
	if err != nil {
		t.Fatalf("failed to load encounter: %v", err)
	}

	center := Vec2{X: 2400, Y: 2600}
	ctx := SpawnContext{
		Center:       center,
		SafeRadius:   900,
		SpreadRadius: 1800,
	}
	ids := SpawnFromTemplateWithContext(room, template, ctx, 12345)
	if len(ids) == 0 {
		t.Fatalf("expected entities from SpawnFromTemplateWithContext")
	}

	for _, id := range ids {
		tr := room.World.Transform(id)
		if tr == nil {
			t.Fatalf("missing transform for entity %d", id)
		}
		dist := tr.Pos.Sub(center).Len()
		if dist < ctx.SafeRadius-1e-3 {
			t.Fatalf("entity %d spawned at %.2f inside safe radius %.2f", id, dist, ctx.SafeRadius)
		}
		if dist > ctx.SpreadRadius+1e-3 {
			t.Fatalf("entity %d spawned at %.2f outside spread radius %.2f", id, dist, ctx.SpreadRadius)
		}

		if missile := room.World.MissileData(id); missile != nil {
			if missile.AgroRadius < template.SpawnGroups[0].AgroRange.Min || missile.AgroRadius > template.SpawnGroups[0].AgroRange.Max {
				t.Fatalf("agro radius %.2f out of bounds [%.2f, %.2f]", missile.AgroRadius, template.SpawnGroups[0].AgroRange.Min, template.SpawnGroups[0].AgroRange.Max)
			}
		}
	}
}
