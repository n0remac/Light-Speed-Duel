# Phase 2: Backend Implementation (Go)

## Overview

Extend the Phase 1 backend to send/receive DAG, inventory, and story data via protobuf.

## Prerequisites

- Phase 1 backend complete and tested
- Phase 2 proto schema defined and code generated
- Understanding of DAG system (`internal/dag/`)

## File Changes

### Files to modify:
- `internal/server/proto_convert.go` - Add conversion functions for Phase 2 types
- `internal/server/ws.go` - Add handlers for new commands

### No new files needed (extend existing)

## Implementation Steps

### 1. Add Enum Conversion Utilities

Add to `internal/server/proto_convert.go`:

```go
import (
    "LightSpeedDuel/internal/dag"
    pb "LightSpeedDuel/internal/proto/ws"
)

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
func dagKindToProto(kind dag.NodeKind) pb.DagNodeKind {
    switch kind {
    case dag.NodeKindFactory:
        return pb.DagNodeKind_DAG_NODE_KIND_FACTORY
    case dag.NodeKindUnit:
        return pb.DagNodeKind_DAG_NODE_KIND_UNIT
    case dag.NodeKindStory:
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
```

### 2. Add DAG Conversion Functions

```go
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
```

### 3. Add Inventory Conversion Functions

```go
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
```

### 4. Add Story Conversion Functions

```go
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
```

### 5. Update `stateToProto` to Include Phase 2 Fields

Extend the existing function from Phase 1:

```go
func stateToProto(s stateMsg) *pb.StateUpdate {
    msg := &pb.StateUpdate{
        // ... Phase 1 fields (lines from Phase 1 backend.md)
        Now:                s.Now,
        Me:                 ghostToProto(s.Me),
        // ... etc
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
```

### 6. Add DAG Command Handlers

Add to `internal/server/ws.go`:

```go
func handleDagStart(room *Room, playerID string, msg *pb.DagStart) {
    room.Mu.Lock()
    defer room.Mu.Unlock()

    if p := room.Players[playerID]; p != nil {
        p.EnsureDagState()
        p.EnsureStoryState()
        graph := dag.GetGraph()
        if graph != nil {
            effects := NewRoomDagEffects(room, p)
            nodeID := dag.NodeID(msg.NodeId)
            if err := dag.Start(graph, p.DagState, nodeID, room.Now, effects); err != nil {
                log.Printf("dag_start error for player %s node %s: %v", playerID, nodeID, err)
            }
        }
    }
}

func handleDagCancel(room *Room, playerID string, msg *pb.DagCancel) {
    room.Mu.Lock()
    defer room.Mu.Unlock()

    if p := room.Players[playerID]; p != nil {
        p.EnsureDagState()
        p.EnsureStoryState()
        graph := dag.GetGraph()
        if graph != nil {
            effects := NewRoomDagEffects(room, p)
            nodeID := dag.NodeID(msg.NodeId)
            if err := dag.Cancel(graph, p.DagState, nodeID, effects); err != nil {
                log.Printf("dag_cancel error for player %s node %s: %v", playerID, nodeID, err)
            }
        }
    }
}

func handleDagStoryAck(room *Room, playerID string, msg *pb.DagStoryAck) {
    log.Printf("[story] Received dag_story_ack from player %s for node %s (choice: %s)",
        playerID, msg.NodeId, msg.ChoiceId)

    room.Mu.Lock()
    defer room.Mu.Unlock()

    if p := room.Players[playerID]; p != nil {
        p.EnsureStoryState()
        if msg.NodeId != "" {
            nodeID := dag.NodeID(msg.NodeId)
            graph := dag.GetGraph()
            if graph == nil {
                log.Printf("[story] No graph available for ack from player %s", playerID)
                return
            }
            node := graph.GetNode(nodeID)
            effects := NewRoomDagEffects(room, p)
            if node != nil && node.Kind == dag.NodeKindStory {
                status := p.DagState.GetStatus(nodeID)
                if status == dag.StatusInProgress {
                    if err := dag.Complete(graph, p.DagState, nodeID, effects); err != nil {
                        log.Printf("[story] Complete error for player %s node %s: %v", playerID, nodeID, err)
                    } else {
                        log.Printf("[story] Successfully completed node %s for player %s", nodeID, playerID)
                    }
                }
            }
        }
    }
}

func handleDagList(room *Room, playerID string, conn *websocket.Conn) {
    room.Mu.Lock()
    var dagProto *pb.DagState
    if p := room.Players[playerID]; p != nil {
        p.EnsureDagState()
        if graph := dag.GetGraph(); graph != nil && p.DagState != nil {
            now := room.Now
            var nodes []dagNodeDTO
            for nodeID, node := range graph.Nodes {
                status := p.DagState.GetStatus(nodeID)
                remaining := p.DagState.RemainingTime(nodeID, now)
                nodes = append(nodes, dagNodeDTO{
                    ID:         string(nodeID),
                    Kind:       string(node.Kind),
                    Label:      node.Label,
                    Status:     string(status),
                    RemainingS: remaining,
                    DurationS:  node.DurationS,
                    Repeatable: node.Repeatable,
                })
            }
            dagDTO := dagStateDTO{Nodes: nodes}
            dagProto = dagStateToProto(dagDTO)
        }
    }
    room.Mu.Unlock()

    // Send response
    if dagProto != nil {
        response := &pb.DagListResponse{Dag: dagProto}
        sendProtoMessage(conn, response)
    }
}
```

### 7. Add Mission Event Handlers

```go
func handleMissionSpawnWave(room *Room, playerID string, msg *pb.MissionSpawnWave, mode string) {
    if mode != "campaign" {
        return
    }

    waveIndex := int(msg.WaveIndex)
    if waveIndex < 1 || waveIndex > 3 {
        return
    }

    room.Mu.Lock()
    defer room.Mu.Unlock()

    if room.SetMissionWaveSpawnedLocked(waveIndex) {
        spawnMissionWave(room, waveIndex)
    }
    if p := room.Players[playerID]; p != nil {
        room.HandleMissionStoryEventLocked(p, "mission:beacon-locked", waveIndex)
    }
}

func handleMissionStoryEvent(room *Room, playerID string, msg *pb.MissionStoryEvent, mode string) {
    if mode != "campaign" {
        return
    }

    event := strings.ToLower(strings.TrimSpace(msg.Event))
    beacon := int(msg.Beacon)

    room.Mu.Lock()
    defer room.Mu.Unlock()

    if p := room.Players[playerID]; p != nil {
        room.HandleMissionStoryEventLocked(p, event, beacon)
    }
}
```

### 8. Update Message Dispatcher

Update the receive loop in `serveWS()` to handle Phase 2 messages:

```go
// Around line 286 in ws.go, extend switch statement:
switch payload := envelope.Payload.(type) {
    // ... Phase 1 cases

    // Phase 2: DAG commands
    case *pb.WsEnvelope_DagStart:
        handleDagStart(room, playerID, payload.DagStart)
    case *pb.WsEnvelope_DagCancel:
        handleDagCancel(room, playerID, payload.DagCancel)
    case *pb.WsEnvelope_DagStoryAck:
        handleDagStoryAck(room, playerID, payload.DagStoryAck)
    case *pb.WsEnvelope_DagList:
        handleDagList(room, playerID, conn)

    // Phase 2: Mission commands
    case *pb.WsEnvelope_MissionSpawnWave:
        handleMissionSpawnWave(room, playerID, payload.MissionSpawnWave, mode)
    case *pb.WsEnvelope_MissionStoryEvent:
        handleMissionStoryEvent(room, playerID, payload.MissionStoryEvent, mode)

    default:
        log.Printf("unknown payload type: %T", payload)
}
```

### 9. Update `sendProtoMessage` for New Response Types

```go
func sendProtoMessage(conn *websocket.Conn, payload proto.Message) error {
    var envelope pb.WsEnvelope

    switch msg := payload.(type) {
    case *pb.StateUpdate:
        envelope.Payload = &pb.WsEnvelope_StateUpdate{StateUpdate: msg}
    case *pb.RoomFullError:
        envelope.Payload = &pb.WsEnvelope_RoomFull{RoomFull: msg}
    case *pb.DagListResponse:
        envelope.Payload = &pb.WsEnvelope_DagListResponse{DagListResponse: msg}
    default:
        return fmt.Errorf("unknown message type: %T", payload)
    }

    data, err := proto.Marshal(&envelope)
    if err != nil {
        return fmt.Errorf("marshal error: %w", err)
    }

    return conn.WriteMessage(websocket.BinaryMessage, data)
}
```

## Testing

### Unit Tests

Add to `internal/server/proto_convert_test.go`:

```go
func TestDagNodeToProto(t *testing.T) {
    node := dagNodeDTO{
        ID:         "craft_missile_01",
        Kind:       "factory",
        Label:      "Craft Basic Missile",
        Status:     "available",
        RemainingS: 0,
        DurationS:  10.0,
        Repeatable: true,
    }

    proto := dagNodeToProto(node)

    assert.Equal(t, "craft_missile_01", proto.Id)
    assert.Equal(t, pb.DagNodeKind_DAG_NODE_KIND_FACTORY, proto.Kind)
    assert.Equal(t, pb.DagNodeStatus_DAG_NODE_STATUS_AVAILABLE, proto.Status)
    assert.True(t, proto.Repeatable)
}

func TestStoryDialogueToProto(t *testing.T) {
    dialogue := &storyDialogueDTO{
        Speaker: "Captain",
        Text:    "Welcome aboard!",
        Intent:  "factory",
        Choices: []storyDialogueChoiceDTO{
            {ID: "accept", Text: "Thank you!"},
            {ID: "decline", Text: "I'm not sure..."},
        },
    }

    proto := storyDialogueToProto(dialogue)

    assert.Equal(t, "Captain", proto.Speaker)
    assert.Equal(t, pb.StoryIntent_STORY_INTENT_FACTORY, proto.Intent)
    assert.Len(t, proto.Choices, 2)
    assert.Equal(t, "accept", proto.Choices[0].Id)
}

func TestInventoryToProto(t *testing.T) {
    inv := inventoryDTO{
        Items: []inventoryItemDTO{
            {Type: "missile", VariantID: "basic", HeatCapacity: 40, Quantity: 5},
        },
    }

    proto := inventoryToProto(inv)

    assert.Len(t, proto.Items, 1)
    assert.Equal(t, "missile", proto.Items[0].Type)
    assert.Equal(t, int32(5), proto.Items[0].Quantity)
}
```

### Integration Test

Update `cmd/proto_demo/main.go`:

```go
// Send DAG start command
envelope := pb.WsEnvelope{
    Payload: &pb.WsEnvelope_DagStart{
        DagStart: &pb.DagStart{NodeId: "craft_missile_01"},
    },
}
data, _ := proto.Marshal(&envelope)
conn.WriteMessage(websocket.BinaryMessage, data)

// Read state update with DAG data
_, respData, _ := conn.ReadMessage()
var respEnvelope pb.WsEnvelope
proto.Unmarshal(respData, &respEnvelope)

if state := respEnvelope.GetStateUpdate(); state != nil {
    if state.Dag != nil {
        fmt.Printf("DAG has %d nodes\n", len(state.Dag.Nodes))
        for _, node := range state.Dag.Nodes {
            fmt.Printf("  - %s: %s\n", node.Id, node.Status)
        }
    }
}
```

### Campaign Mode Test

```bash
# Start server
go run . -addr :8080

# Connect with campaign mode
open http://localhost:8080/?room=test&mode=campaign

# Verify:
# - Story dialogue appears
# - DAG menu shows crafting nodes
# - Inventory displays missiles
# - Can craft missiles
# - Can trigger mission waves
```

## Performance Considerations

### Message Size

Measure typical message sizes:
- Phase 1 only: ~500-1000 bytes per frame
- Phase 2 with DAG: +200-500 bytes
- Phase 2 with story: +100-300 bytes
- Phase 2 with inventory: +50-200 bytes

Total: ~850-2000 bytes per frame (still reasonable at 20Hz = 16-40 KB/s)

### Optimization Strategies

1. **Delta updates**: Only send changed DAG nodes (requires more complex logic)
2. **Lazy loading**: Send inventory/DAG only when requested (use `DagList` command)
3. **Field omission**: Don't populate optional fields if empty

Example:
```go
// Only add DAG if it has data
if s.Dag != nil && len(s.Dag.Nodes) > 0 {
    msg.Dag = dagStateToProto(*s.Dag)
}
```

## Checklist

- [ ] Add enum conversion functions
- [ ] Add DAG conversion functions
- [ ] Add inventory conversion functions
- [ ] Add story conversion functions
- [ ] Update `stateToProto` to include Phase 2 fields
- [ ] Add DAG command handlers
- [ ] Add mission event handlers
- [ ] Update message dispatcher
- [ ] Update `sendProtoMessage` for new response types
- [ ] Add unit tests for all conversion functions
- [ ] Update integration test with Phase 2 commands
- [ ] Test campaign mode end-to-end
- [ ] Profile message sizes and bandwidth
- [ ] Document any performance issues

## Next Steps

After backend implementation is complete:
- Proceed to frontend implementation (frontend.md)
- Consider optimization strategies if message sizes are too large
- Document any edge cases or gotchas discovered
