package server

import (
	"LightSpeedDuel/internal/dag"
	pb "LightSpeedDuel/internal/proto/ws"
)

// Convert internal ghost struct to protobuf message
func ghostToProto(g ghost) *pb.Ghost {
	msg := &pb.Ghost{
		Id:                   g.ID,
		X:                    g.X,
		Y:                    g.Y,
		Vx:                   g.VX,
		Vy:                   g.VY,
		T:                    g.T,
		Self:                 g.Self,
		CurrentWaypointIndex: int32(g.CurrentWaypointIndex),
		Hp:                   int32(g.HP),
		Kills:                int32(g.Kills),
	}

	// Convert waypoints
	if len(g.Waypoints) > 0 {
		msg.Waypoints = make([]*pb.Waypoint, len(g.Waypoints))
		for i, wp := range g.Waypoints {
			msg.Waypoints[i] = &pb.Waypoint{
				X:     wp.X,
				Y:     wp.Y,
				Speed: wp.Speed,
			}
		}
	}

	// Convert heat data
	if g.Heat != nil {
		msg.Heat = &pb.ShipHeatView{
			V:  g.Heat.V,
			M:  g.Heat.M,
			W:  g.Heat.W,
			O:  g.Heat.O,
			Ms: g.Heat.MS,
			Su: g.Heat.SU,
			Ku: g.Heat.KU,
			Kd: g.Heat.KD,
			Ex: g.Heat.EX,
		}
	}

	return msg
}

// Convert internal missile to protobuf message
func missileToProto(m missileDTO) *pb.Missile {
	msg := &pb.Missile{
		Id:         m.ID,
		Owner:      m.Owner,
		Self:       m.Self,
		X:          m.X,
		Y:          m.Y,
		Vx:         m.VX,
		Vy:         m.VY,
		T:          m.T,
		AgroRadius: m.AgroRadius,
		Lifetime:   m.Lifetime,
		LaunchTime: m.LaunchTime,
		ExpiresAt:  m.ExpiresAt,
		TargetId:   m.TargetID,
	}

	if m.Heat != nil {
		msg.Heat = &pb.ShipHeatView{
			V:  m.Heat.V,
			M:  m.Heat.M,
			W:  m.Heat.W,
			O:  m.Heat.O,
			Ms: m.Heat.MS,
			Su: m.Heat.SU,
			Ku: m.Heat.KU,
			Kd: m.Heat.KD,
			Ex: m.Heat.EX,
		}
	}

	return msg
}

// Convert internal stateMsg to protobuf StateUpdate
func stateToProto(s stateMsg) *pb.StateUpdate {
	msg := &pb.StateUpdate{
		Now:                s.Now,
		Me:                 ghostToProto(s.Me),
		Meta:               &pb.RoomMeta{C: s.Meta.C, W: s.Meta.W, H: s.Meta.H},
		ActiveMissileRoute: s.ActiveMissileRoute,
		NextMissileReady:   s.NextMissileReady,
	}

	// Convert ghosts
	if len(s.Ghosts) > 0 {
		msg.Ghosts = make([]*pb.Ghost, len(s.Ghosts))
		for i, g := range s.Ghosts {
			msg.Ghosts[i] = ghostToProto(g)
		}
	}

	// Convert missiles
	if len(s.Missiles) > 0 {
		msg.Missiles = make([]*pb.Missile, len(s.Missiles))
		for i, m := range s.Missiles {
			msg.Missiles[i] = missileToProto(m)
		}
	}

	// Convert missile config
	msg.MissileConfig = &pb.MissileConfig{
		Speed:      s.MissileConfig.Speed,
		SpeedMin:   s.MissileConfig.SpeedMin,
		SpeedMax:   s.MissileConfig.SpeedMax,
		AgroMin:    s.MissileConfig.AgroMin,
		AgroRadius: s.MissileConfig.AgroRadius,
		Lifetime:   s.MissileConfig.Lifetime,
	}

	if s.MissileConfig.HeatConfig != nil {
		msg.MissileConfig.HeatConfig = &pb.HeatParams{
			Max:         s.MissileConfig.HeatConfig.Max,
			WarnAt:      s.MissileConfig.HeatConfig.WarnAt,
			OverheatAt:  s.MissileConfig.HeatConfig.OverheatAt,
			MarkerSpeed: s.MissileConfig.HeatConfig.MarkerSpeed,
			KUp:         s.MissileConfig.HeatConfig.KUp,
			KDown:       s.MissileConfig.HeatConfig.KDown,
			Exp:         s.MissileConfig.HeatConfig.Exp,
		}
	}

	// Convert missile waypoints
	if len(s.MissileWaypoints) > 0 {
		msg.MissileWaypoints = make([]*pb.Waypoint, len(s.MissileWaypoints))
		for i, wp := range s.MissileWaypoints {
			msg.MissileWaypoints[i] = &pb.Waypoint{X: wp.X, Y: wp.Y, Speed: wp.Speed}
		}
	}

	// Convert missile routes
	if len(s.MissileRoutes) > 0 {
		msg.MissileRoutes = make([]*pb.MissileRoute, len(s.MissileRoutes))
		for i, route := range s.MissileRoutes {
			msg.MissileRoutes[i] = &pb.MissileRoute{
				Id:   route.ID,
				Name: route.Name,
			}
			if len(route.Waypoints) > 0 {
				msg.MissileRoutes[i].Waypoints = make([]*pb.Waypoint, len(route.Waypoints))
				for j, wp := range route.Waypoints {
					msg.MissileRoutes[i].Waypoints[j] = &pb.Waypoint{X: wp.X, Y: wp.Y, Speed: wp.Speed}
				}
			}
		}
	}

	// Phase 2 additions:
	if s.Dag != nil {
		msg.Dag = dagStateToProto(*s.Dag)
	}

	if s.Inventory != nil {
		msg.Inventory = inventoryToProto(*s.Inventory)
	}

	if s.Story != nil {
		msg.Story = storyStateToProto(s.Story)
	}

	return msg
}

// ========== Phase 2: Enum Conversions ==========

// Convert DAG node status to proto enum
func dagStatusToProto(status dag.Status) pb.DagNodeStatus {
	switch status {
	case dag.StatusLocked:
		return pb.DagNodeStatus_DAG_NODE_STATUS_LOCKED
	case dag.StatusAvailable:
		return pb.DagNodeStatus_DAG_NODE_STATUS_AVAILABLE
	case dag.StatusInProgress:
		return pb.DagNodeStatus_DAG_NODE_STATUS_IN_PROGRESS
	case dag.StatusCompleted:
		return pb.DagNodeStatus_DAG_NODE_STATUS_COMPLETED
	default:
		return pb.DagNodeStatus_DAG_NODE_STATUS_UNSPECIFIED
	}
}

// Convert DAG node kind to proto enum
// Maps internal kinds: craft→factory, upgrade→unit, story→story, story_gate→story
func dagKindToProto(kind dag.NodeKind) pb.DagNodeKind {
	switch kind {
	case dag.NodeKindCraft:
		return pb.DagNodeKind_DAG_NODE_KIND_FACTORY
	case dag.NodeKindUpgrade:
		return pb.DagNodeKind_DAG_NODE_KIND_UNIT
	case dag.NodeKindStory, dag.NodeKindStoryGate:
		return pb.DagNodeKind_DAG_NODE_KIND_STORY
	default:
		return pb.DagNodeKind_DAG_NODE_KIND_UNSPECIFIED
	}
}

// Convert story intent to proto enum
func storyIntentToProto(intent string) pb.StoryIntent {
	switch intent {
	case "factory":
		return pb.StoryIntent_STORY_INTENT_FACTORY
	case "unit":
		return pb.StoryIntent_STORY_INTENT_UNIT
	default:
		return pb.StoryIntent_STORY_INTENT_UNSPECIFIED
	}
}

// ========== Phase 2: DAG Conversions ==========

// Convert internal dagNodeDTO to protobuf DagNode
func dagNodeToProto(node dagNodeDTO) *pb.DagNode {
	return &pb.DagNode{
		Id:         node.ID,
		Kind:       dagKindToProto(dag.NodeKind(node.Kind)),
		Label:      node.Label,
		Status:     dagStatusToProto(dag.Status(node.Status)),
		RemainingS: node.RemainingS,
		DurationS:  node.DurationS,
		Repeatable: node.Repeatable,
	}
}

// Convert internal dagStateDTO to protobuf DagState
func dagStateToProto(state dagStateDTO) *pb.DagState {
	nodes := make([]*pb.DagNode, len(state.Nodes))
	for i, node := range state.Nodes {
		nodes[i] = dagNodeToProto(node)
	}
	return &pb.DagState{Nodes: nodes}
}

// ========== Phase 2: Inventory Conversions ==========

// Convert internal inventoryItemDTO to protobuf InventoryItem
func inventoryItemToProto(item inventoryItemDTO) *pb.InventoryItem {
	return &pb.InventoryItem{
		Type:         item.Type,
		VariantId:    item.VariantID,
		HeatCapacity: item.HeatCapacity,
		Quantity:     int32(item.Quantity),
	}
}

// Convert internal inventoryDTO to protobuf Inventory
func inventoryToProto(inv inventoryDTO) *pb.Inventory {
	items := make([]*pb.InventoryItem, len(inv.Items))
	for i, item := range inv.Items {
		items[i] = inventoryItemToProto(item)
	}
	return &pb.Inventory{Items: items}
}

// ========== Phase 2: Story Conversions ==========

// Convert internal storyDialogueChoiceDTO to protobuf StoryDialogueChoice
func storyChoiceToProto(choice storyDialogueChoiceDTO) *pb.StoryDialogueChoice {
	return &pb.StoryDialogueChoice{
		Id:   choice.ID,
		Text: choice.Text,
	}
}

// Convert internal storyTutorialTipDTO to protobuf StoryTutorialTip
func storyTipToProto(tip *storyTutorialTipDTO) *pb.StoryTutorialTip {
	if tip == nil {
		return nil
	}
	return &pb.StoryTutorialTip{
		Title: tip.Title,
		Text:  tip.Text,
	}
}

// Convert internal storyDialogueDTO to protobuf StoryDialogue
func storyDialogueToProto(dialogue *storyDialogueDTO) *pb.StoryDialogue {
	if dialogue == nil {
		return nil
	}

	choices := make([]*pb.StoryDialogueChoice, len(dialogue.Choices))
	for i, choice := range dialogue.Choices {
		choices[i] = storyChoiceToProto(choice)
	}

	var tip *pb.StoryTutorialTip
	if dialogue.TutorialTip != nil {
		tip = storyTipToProto(dialogue.TutorialTip)
	}

	return &pb.StoryDialogue{
		Speaker:       dialogue.Speaker,
		Text:          dialogue.Text,
		Intent:        storyIntentToProto(dialogue.Intent),
		ContinueLabel: dialogue.ContinueLabel,
		Choices:       choices,
		TutorialTip:   tip,
	}
}

// Convert internal storyEventDTO to protobuf StoryEvent
func storyEventToProto(event storyEventDTO) *pb.StoryEvent {
	return &pb.StoryEvent{
		ChapterId: event.ChapterID,
		NodeId:    event.NodeID,
		Timestamp: event.Timestamp,
	}
}

// Convert internal storyStateDTO to protobuf StoryState
func storyStateToProto(state *storyStateDTO) *pb.StoryState {
	if state == nil {
		return nil
	}

	events := make([]*pb.StoryEvent, len(state.Events))
	for i, event := range state.Events {
		events[i] = storyEventToProto(event)
	}

	return &pb.StoryState{
		ActiveNode:   state.ActiveNode,
		Dialogue:     storyDialogueToProto(state.Dialogue),
		Available:    state.Available,
		Flags:        state.Flags,
		RecentEvents: events,
	}
}
