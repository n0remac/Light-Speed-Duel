package game

import (
	"LightSpeedDuel/internal/dag"
)

type StoryEffects struct {
	room   *Room
	player *Player
}

func NewStoryEffects(room *Room, player *Player) *StoryEffects {
	if player == nil {
		return nil
	}
	return &StoryEffects{room: room, player: player}
}

func (e *StoryEffects) OnStart(nodeID dag.NodeID, node *dag.Node) {
	if node == nil || node.Kind != dag.NodeKindStory {
		return
	}
	e.player.EnsureStoryState()
	e.player.ActiveStoryNodeID = string(nodeID)
}

func (e *StoryEffects) OnComplete(nodeID dag.NodeID, node *dag.Node) {
	if node == nil || node.Kind != dag.NodeKindStory {
		return
	}
	e.player.EnsureStoryState()
	chapter := node.Payload["chapter"]
	if chapter == "" {
		chapter = "default"
	}
	beat := node.Payload["node"]
	if beat == "" {
		beat = string(nodeID)
	}
	if flag, ok := node.Payload["flag"]; ok && flag != "" {
		e.player.StoryFlags[flag] = true
	}
	e.player.enqueueStoryEvent(StoryEvent{
		Chapter:   chapter,
		Node:      beat,
		Timestamp: e.room.Now,
	})
	e.player.ActiveStoryNodeID = ""
}

func (e *StoryEffects) OnCancel(nodeID dag.NodeID, node *dag.Node) {
	if node == nil || node.Kind != dag.NodeKindStory {
		return
	}
	e.player.ActiveStoryNodeID = ""
}

type CombinedDagEffects struct {
	craft *CraftingEffects
	story *StoryEffects
}

func NewRoomDagEffects(room *Room, player *Player) *CombinedDagEffects {
	return &CombinedDagEffects{
		craft: NewCraftingEffects(player),
		story: NewStoryEffects(room, player),
	}
}

func (e *CombinedDagEffects) OnStart(nodeID dag.NodeID, node *dag.Node) {
	if e.craft != nil {
		e.craft.OnStart(nodeID, node)
	}
	if e.story != nil {
		e.story.OnStart(nodeID, node)
	}
}

func (e *CombinedDagEffects) OnComplete(nodeID dag.NodeID, node *dag.Node) {
	if e.craft != nil {
		e.craft.OnComplete(nodeID, node)
	}
	if e.story != nil {
		e.story.OnComplete(nodeID, node)
	}
}

func (e *CombinedDagEffects) OnCancel(nodeID dag.NodeID, node *dag.Node) {
	if e.craft != nil {
		e.craft.OnCancel(nodeID, node)
	}
	if e.story != nil {
		e.story.OnCancel(nodeID, node)
	}
}
