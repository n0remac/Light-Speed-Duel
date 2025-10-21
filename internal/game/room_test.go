package game

import (
	"testing"

	"LightSpeedDuel/internal/dag"
)

func initTestDAG(t *testing.T) {
	t.Helper()
	craft := dag.SeedMissileCraftNodes()
	story := dag.SeedStoryNodes()
	upgrades := dag.SeedUpgradeNodes()
	nodes := append(append(craft, story...), upgrades...)
	if err := dag.Init(nodes); err != nil {
		t.Fatalf("failed to init DAG: %v", err)
	}
}

func TestStoryChoiceBranchingGrantsUpgrade(t *testing.T) {
	initTestDAG(t)

	room := &Room{
		ID:           "room-choice-upgrade",
		World:        newWorld(),
		Players:      map[string]*Player{},
		WorldWidth:   WorldW,
		WorldHeight:  WorldH,
		heatDefaults: DefaultHeatParams(),
	}

	player := &Player{ID: "player-1"}
	room.Players[player.ID] = player
	player.EnsureDagState()
	player.EnsureStoryState()
	player.DagState.SetStatus(dag.NodeID("story.signal-static-1.start"), dag.StatusCompleted)

	room.HandleMissionStoryEventLocked(player, "mission:beacon-locked", 1)
	if player.ActiveStoryNodeID != "story.signal-static-1.beacon-1-lock" {
		t.Fatalf("expected lock node active, got %s", player.ActiveStoryNodeID)
	}

	graph := dag.GetGraph()
	if graph == nil {
		t.Fatal("graph not initialized")
	}

	effects := NewRoomDagEffects(room, player)
	parentID := dag.NodeID("story.signal-static-1.beacon-1-lock")
	if err := dag.Complete(graph, player.DagState, parentID, effects); err != nil {
		t.Fatalf("completing parent node failed: %v", err)
	}

	room.HandleStoryChoiceBranching(player, parentID, "friendly", graph)

	upgradeID := dag.NodeID("upgrade.missile.speed_1")
	if status := player.DagState.GetStatus(upgradeID); status != dag.StatusCompleted {
		t.Fatalf("expected upgrade %s to be completed, got %s", upgradeID, status)
	}
	if player.Capabilities.MissileSpeedMultiplier <= 1.0 {
		t.Fatalf("expected missile speed multiplier to increase, got %.2f", player.Capabilities.MissileSpeedMultiplier)
	}
}

func TestStoryChoiceBranchingSpawnsEncounter(t *testing.T) {
	initTestDAG(t)

	room := &Room{
		ID:           "room-choice-hostile",
		World:        newWorld(),
		Players:      map[string]*Player{},
		WorldWidth:   WorldW,
		WorldHeight:  WorldH,
		heatDefaults: DefaultHeatParams(),
	}

	player := &Player{ID: "player-1"}
	room.Players[player.ID] = player
	player.EnsureDagState()
	player.EnsureStoryState()
	player.DagState.SetStatus(dag.NodeID("story.signal-static-1.start"), dag.StatusCompleted)

	room.HandleMissionStoryEventLocked(player, "mission:beacon-locked", 1)

	graph := dag.GetGraph()
	if graph == nil {
		t.Fatal("graph not initialized")
	}

	effects := NewRoomDagEffects(room, player)
	parentID := dag.NodeID("story.signal-static-1.beacon-1-lock")
	if err := dag.Complete(graph, player.DagState, parentID, effects); err != nil {
		t.Fatalf("completing parent node failed: %v", err)
	}

	room.HandleStoryChoiceBranching(player, parentID, "hostile", graph)

	if !room.MissionWaveSpawnedLocked(1) {
		t.Fatal("expected mission wave 1 to be marked as spawned")
	}

	director := room.BeaconDirectorLocked()
	if director == nil {
		t.Fatal("expected beacon director to exist after hostile choice")
	}
	if len(director.encounters) == 0 {
		t.Fatal("expected hostile branch to spawn an encounter")
	}
}
