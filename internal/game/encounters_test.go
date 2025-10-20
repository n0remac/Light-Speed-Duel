package game

import "testing"

func TestGetEncounterValid(t *testing.T) {
	template, err := GetEncounter("minefield-basic")
	if err != nil {
		t.Fatalf("expected encounter template, got error: %v", err)
	}
	if template == nil {
		t.Fatalf("expected non-nil template")
	}
	if template.ID != "minefield-basic" {
		t.Fatalf("expected template id minefield-basic, got %s", template.ID)
	}
	if len(template.SpawnGroups) == 0 {
		t.Fatalf("expected spawn groups in template")
	}
}

func TestSpawnFromTemplateMinefield(t *testing.T) {
	room := &Room{
		ID:          "test-room",
		World:       newWorld(),
		Players:     map[string]*Player{},
		WorldWidth:  WorldW,
		WorldHeight: WorldH,
	}

	template, err := GetEncounter("minefield-basic")
	if err != nil {
		t.Fatalf("unexpected error retrieving template: %v", err)
	}

	center := Vec2{X: room.WorldWidth * 0.5, Y: room.WorldHeight * 0.5}
	ids := SpawnFromTemplate(room, template, center, 12345)
	if len(ids) == 0 {
		t.Fatalf("expected mines to spawn")
	}

	min := template.SpawnGroups[0].Count.Min
	max := template.SpawnGroups[0].Count.Max
	if len(ids) < min || len(ids) > max {
		t.Fatalf("spawned %d entities, expected between %d and %d", len(ids), min, max)
	}

	for _, id := range ids {
		tags := room.World.Tags(id)
		if tags == nil || tags.Tags == nil || !tags.Tags["mine"] {
			t.Fatalf("expected mine tag on entity %d, got %#v", id, tags)
		}
	}
}
