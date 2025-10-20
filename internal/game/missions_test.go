package game

import (
	"testing"
)

func TestGetTemplateValid(t *testing.T) {
	template, err := GetTemplate("campaign-1")
	if err != nil {
		t.Fatalf("expected no error retrieving campaign-1 template, got %v", err)
	}
	if template == nil {
		t.Fatalf("expected template, got nil")
	}
	if template.ID != "campaign-1" {
		t.Errorf("expected template ID campaign-1, got %s", template.ID)
	}
	if template.DisplayName != "Navigation Protocols" {
		t.Errorf("expected display name Navigation Protocols, got %s", template.DisplayName)
	}
	if template.Archetype != ArchetypeTravel {
		t.Errorf("expected archetype ArchetypeTravel, got %d", template.Archetype)
	}
	if count, ok := template.ObjectiveParams["beaconCount"]; !ok {
		t.Errorf("expected objective param beaconCount")
	} else if count != 4 {
		t.Errorf("expected beaconCount 4, got %v", count)
	}
}

func TestGetTemplateInvalid(t *testing.T) {
	template, err := GetTemplate("invalid")
	if err == nil {
		t.Fatalf("expected error retrieving invalid template, got nil")
	}
	if template != nil {
		t.Fatalf("expected nil template for invalid ID")
	}
	expected := "mission template not found: invalid"
	if err.Error() != expected {
		t.Fatalf("expected error %q, got %q", expected, err.Error())
	}
}

func TestMissionTemplateValidate(t *testing.T) {
	template, err := GetTemplate("campaign-1")
	if err != nil {
		t.Fatalf("expected campaign-1 template, got error %v", err)
	}
	if err := template.Validate(); err != nil {
		t.Fatalf("expected template to validate, got %v", err)
	}

	bad := &MissionTemplate{}
	if err := bad.Validate(); err == nil {
		t.Fatalf("expected validation error for empty template")
	}
}

func TestBeaconDirectorAcceptMission(t *testing.T) {
	room := &Room{
		ID:          "test-room",
		World:       newWorld(),
		Players:     map[string]*Player{},
		WorldWidth:  10000,
		WorldHeight: 6000,
	}
	director, ok := NewBeaconDirector(room.ID, "campaign-1", room.WorldWidth, room.WorldHeight)
	if !ok || director == nil {
		t.Fatalf("expected beacon director")
	}
	player := &Player{
		ID:   "p1",
		Ship: room.World.NewEntity(),
	}
	room.World.SetComponent(player.Ship, CompTransform, &Transform{Pos: Vec2{X: 100, Y: 100}})
	room.Players[player.ID] = player

	if err := director.AcceptMission(room, player, "campaign-1"); err != nil {
		t.Fatalf("expected mission acceptance to succeed, got %v", err)
	}
	if director.CurrentMissionID != "campaign-1" {
		t.Fatalf("expected current mission ID campaign-1, got %s", director.CurrentMissionID)
	}
	if len(director.ActiveObjectives) == 0 {
		t.Fatalf("expected active objectives after mission acceptance")
	}

	if err := director.AcceptMission(room, player, "invalid"); err == nil {
		t.Fatalf("expected error for invalid mission ID")
	}
}

func TestBuildObjectiveStatesIncludesDescription(t *testing.T) {
	room := &Room{
		World:   newWorld(),
		Players: map[string]*Player{},
	}
	player := &Player{
		ID:   "p1",
		Ship: room.World.NewEntity(),
	}
	room.World.SetComponent(player.Ship, CompTransform, &Transform{Pos: Vec2{X: 0, Y: 0}})
	room.missionDirector = &BeaconDirector{
		CurrentMissionID: "test",
		ActiveObjectives: map[string]ObjectiveEvaluator{
			"kill-test": &KillCountEvaluator{
				TargetTag:     "enemy",
				RequiredKills: 3,
			},
		},
		ObjectiveProgress: map[string]float64{},
	}

	states := room.buildObjectiveStates(player)
	if len(states) != 1 {
		t.Fatalf("expected 1 objective state, got %d", len(states))
	}
	if states[0].Description == "" {
		t.Fatalf("expected objective description to be populated")
	}
}
