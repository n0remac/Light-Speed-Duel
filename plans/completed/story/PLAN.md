# Story System Fix & Migration Plan

## Executive Summary

This plan addresses two critical issues with the story/dialogue system:
1. **Dialogue doesn't wait for player input** - Nodes complete instantly before client sees them
2. **Dialogue visible in client code** - Players can read ahead and see spoilers

## Current State Analysis

### Architecture Overview

**Backend (Go)**:
- `internal/dag/story.go` - Defines story nodes in DAG system
- `internal/game/story_effects.go` - Handles node lifecycle (OnStart, OnComplete, OnCancel)
- `internal/server/ws.go` - Sends story state via WebSocket

**Frontend (TypeScript)**:
- `internal/server/web/src/story/mission1-content.ts` - Dialogue lookup table (CLIENT-SIDE)
- `internal/server/web/src/story/controller.ts` - Displays dialogue when node activates
- `internal/server/web/src/story/overlay.ts` - UI overlay for dialogue rendering

### The Broken Flow

1. Player joins campaign mode
2. Server calls `HandleMissionStoryEventLocked("mission:start")`
3. Server calls `dag.Start()` on node `"story.signal-static-1.start"`
4. **PROBLEM**: Node has `DurationS: 0` → instant completion
5. `OnStart()` sets `ActiveStoryNodeID = "story.signal-static-1.start"` ✅
6. `OnComplete()` **immediately** sets `ActiveStoryNodeID = ""` ❌
7. WebSocket sends `{ story: { active_node: "" } }` to client
8. Client never sees the active node → no dialogue displays

### Why DurationS: 5 "Works"

Looking at `internal/dag/commands.go:74-87`:

```go
if effectiveDuration == 0 {
    // INSTANT: Start and complete in same tick
    effects.OnStart(nodeID, node)        // Sets ActiveStoryNodeID
    state.SetStatus(nodeID, StatusCompleted)
    effects.OnComplete(nodeID, node)     // Clears ActiveStoryNodeID
} else {
    // TIMED: Start, schedule completion for later
    state.StartJob(nodeID, now, effectiveDuration)
    effects.OnStart(nodeID, node)        // Sets ActiveStoryNodeID
    // OnComplete() called later by evaluator when ETA reached
}
```

With `DurationS: 5`:
- Node starts → `ActiveStoryNodeID` set
- Timer starts for 5 seconds
- Client receives active node and displays dialogue ✅
- After 5 seconds: node auto-completes (even if player hasn't acknowledged) ⚠️

**This is a hacky workaround, not a real solution.**

## Problem 1: Dialogue Doesn't Wait

### Root Cause

Story nodes use the crafting system's timer-based completion model, which is wrong for dialogue:
- **Crafting**: "Start crafting, wait 60 seconds, item appears" ✅
- **Story**: "Start dialogue, player reads and responds, story progresses" ❌

Story needs **event-driven completion** (wait for `dag_story_ack`), not timer-based.

### Current `dag_story_ack` Handler

The infrastructure is already 90% built! Look at `internal/server/ws.go:582-610`:

```go
case "dag_story_ack":
    room.Mu.Lock()
    if p := room.Players[playerID]; p != nil {
        // Parse node ID from message
        if err := dag.Complete(graph, p.DagState, nodeID, effects); err != nil {
            log.Printf("error: %v", err)
        }
    }
    room.Mu.Unlock()
```

**This already calls `Complete()`!** It just needs the node to still be in-progress when ack arrives.

### Solution: Use Long Duration + Manual Completion

**Strategy**:
1. Set `DurationS: 999999` (11+ days - effectively infinite)
2. Node starts → stays in-progress
3. Client displays dialogue
4. Player clicks choice/continue → client sends `dag_story_ack`
5. Server receives ack → calls `Complete()` manually
6. Node completes → unlocks next node

**Benefits**:
- ✅ Dialogue stays active until player responds
- ✅ No auto-timeout (unless we add explicit timeout later)
- ✅ Server validates player actually saw the dialogue
- ✅ Prevents rushing through story

## Problem 2: Dialogue Visible in Client Code

### Security Risk

Current system exposes ALL dialogue in `mission1-content.ts`:
```typescript
export const MISSION_1_CONTENT: Record<string, DialogueContent> = {
  "story.signal-static-1.start": { /* ... */ },
  "story.signal-static-1.beacon-1": { /* ... */ },
  "story.signal-static-1.beacon-2": { /* ... */ },
  "story.signal-static-1.beacon-3": { /* ... */ },
  "story.signal-static-1.complete": { /* ... */ },
};
```

**Problem**: Player can:
- Open browser devtools → read all future dialogue
- See all choice options before they appear
- Spoil story twists
- Edit client code to skip/modify dialogue

### Solution: Server-Side Dialogue

Move dialogue content to backend. Server sends dialogue only when node activates.

**Benefits**:
- ✅ Player can't read ahead
- ✅ Can't modify dialogue client-side
- ✅ Server can generate dynamic dialogue (player name, choices based on flags)
- ✅ Enables server-side localization
- ✅ Facilitates DLC without client updates

## Implementation Plan

### Phase 1: Fix Dialogue Waiting (CRITICAL - DO FIRST)

#### 1.1 Update Story Node Durations

**File**: `internal/dag/story.go`

**Change**: Set all story nodes to `DurationS: 999999`

**Before**:
```go
{
    ID:         "story.signal-static-1.start",
    Kind:       NodeKindStory,
    Label:      "Signal In The Static – Arrival",
    DurationS:  0,  // ← PROBLEM: Instant completion
    Repeatable: false,
    // ...
}
```

**After**:
```go
{
    ID:         "story.signal-static-1.start",
    Kind:       NodeKindStory,
    Label:      "Signal In The Static – Arrival",
    DurationS:  999999,  // ← SOLUTION: Wait for manual completion
    Repeatable: false,
    // ...
}
```

**Repeat for all 5 story nodes** in `story.go`.

#### 1.2 Verify `dag_story_ack` Handler

**File**: `internal/server/ws.go:582-610`

**Current code is correct!** Just verify it:
1. Receives `dag_story_ack` message from client
2. Parses `node_id` from message
3. Calls `dag.Complete(graph, player.DagState, nodeID, effects)`

**No changes needed** - already implemented.

#### 1.3 Verify Client Sends Ack

**File**: `internal/server/web/src/story/controller.ts:188-197`

**Current code is correct!** The `acknowledgeNode()` function already sends:
```typescript
function acknowledgeNode(nodeId: string, choiceId: string | null): void {
    const msg: { type: string; node_id: string; choice_id?: string } = {
        type: "dag_story_ack",
        node_id: nodeId,
    };
    if (choiceId) {
        msg.choice_id = choiceId;
    }
    sendMessage(msg);
}
```

**No changes needed** - already implemented.

#### 1.4 Add Server-Side Logging

**File**: `internal/game/room.go:225-241`

**Add debug logging** to track node lifecycle:

```go
func (r *Room) tryStartStoryNodeLocked(player *Player, nodeID dag.NodeID) {
    graph := dag.GetGraph()
    if graph == nil || player == nil || nodeID == "" {
        return
    }
    effects := NewRoomDagEffects(r, player)
    r.EvaluatePlayerDagLocked(graph, player, effects)

    status := player.DagState.GetStatus(nodeID)
    log.Printf("[story] Player %s trying to start node %s (status: %s)", player.ID, nodeID, status)

    if status != dag.StatusAvailable {
        log.Printf("[story] Node %s not available for player %s, skipping", nodeID, player.ID)
        return
    }

    if err := dag.Start(graph, player.DagState, nodeID, r.Now, effects); err != nil {
        log.Printf("[story] Start error for player %s node %s: %v", player.ID, nodeID, err)
        return
    }

    log.Printf("[story] Successfully started node %s for player %s", nodeID, player.ID)
    r.EvaluatePlayerDagLocked(graph, player, effects)
}
```

**File**: `internal/server/ws.go:582-610`

**Add logging** to ack handler:

```go
case "dag_story_ack":
    log.Printf("[story] Received ack from player %s for node %s", playerID, m.NodeID)
    room.Mu.Lock()
    if p := room.Players[playerID]; p != nil {
        // ... existing code ...
        if err := dag.Complete(graph, p.DagState, nodeID, effects); err != nil {
            log.Printf("[story] Complete error for player %s node %s: %v", playerID, nodeID, err)
        } else {
            log.Printf("[story] Successfully completed node %s for player %s", nodeID, playerID)
        }
    }
    room.Mu.Unlock()
```

#### 1.5 Testing Phase 1

**Test Checklist**:
- [ ] Start campaign mode
- [ ] See opening dialogue appear
- [ ] Dialogue stays visible (doesn't disappear after 5 seconds)
- [ ] Click choice/continue button
- [ ] Dialogue closes
- [ ] Next node unlocks (can verify in DAG state)
- [ ] Server logs show: "started node", "received ack", "completed node"

**Expected Server Logs**:
```
[story] Player <id> trying to start node story.signal-static-1.start (status: available)
[story] Successfully started node story.signal-static-1.start for player <id>
[story] Received ack from player <id> for node story.signal-static-1.start
[story] Successfully completed node story.signal-static-1.start for player <id>
```

### Phase 2: Move Dialogue to Backend (OPTIONAL - DO AFTER PHASE 1 WORKS)

#### 2.1 Create Dialogue Data Structures

**File**: `internal/dag/dialogue.go` (NEW)

```go
package dag

// DialogueChoice represents a player response option
type DialogueChoice struct {
    ID   string
    Text string
}

// TutorialTip provides gameplay hints alongside dialogue
type TutorialTip struct {
    Title string
    Text  string
}

// DialogueContent contains all presentation data for a story node
type DialogueContent struct {
    Speaker       string
    Text          string
    Intent        string            // "factory" or "unit"
    ContinueLabel string            // Custom label for continue button
    Choices       []DialogueChoice  // Player response options
    TutorialTip   *TutorialTip      // Optional gameplay hint
}
```

#### 2.2 Add Dialogue Field to Node Struct

**File**: `internal/dag/graph.go`

**Modify `Node` struct**:

```go
type Node struct {
    ID         NodeID
    Kind       NodeKind
    Label      string
    DurationS  float64
    Repeatable bool
    Payload    map[string]string
    Requires   []NodeID
    Dialogue   *DialogueContent  // ← NEW: Dialogue for story nodes
}
```

#### 2.3 Populate Dialogue in Story Nodes

**File**: `internal/dag/story.go`

**Update story nodes** with full dialogue:

```go
func SeedStoryNodes() []*Node {
    return []*Node{
        {
            ID:         "story.signal-static-1.start",
            Kind:       NodeKindStory,
            Label:      "Signal In The Static – Arrival",
            DurationS:  999999,
            Repeatable: false,
            Payload: map[string]string{
                "chapter": "signal-static-1",
                "node":    "start",
                "flag":    "story.signal-static-1.start",
            },
            Requires: []NodeID{},
            Dialogue: &DialogueContent{
                Speaker: "UNKNOWN SIGNAL",
                Text:    "–gnal… —issus… co–dinates…\n\n[A weak signal crackles through the void. The transmission is nearly unintelligible, but coordinates emerge from the static. Something—or someone—needs help.]",
                Intent:  "factory",
                Choices: []DialogueChoice{
                    {ID: "investigate", Text: "Investigate the signal"},
                    {ID: "cautious", Text: "Approach with extreme caution"},
                    {ID: "ignore", Text: "Log coordinates and continue patrol"},
                },
                TutorialTip: &TutorialTip{
                    Title: "Route Plotting",
                    Text:  "Click on the map to plot waypoints for your ship. Right-click waypoints to adjust speed. Your route determines your heat buildup.",
                },
            },
        },
        // ... repeat for other nodes
    }
}
```

#### 2.4 Create WebSocket DTOs

**File**: `internal/server/dto.go`

**Add new DTOs**:

```go
type storyDialogueChoiceDTO struct {
    ID   string `json:"id"`
    Text string `json:"text"`
}

type storyTutorialTipDTO struct {
    Title string `json:"title"`
    Text  string `json:"text"`
}

type storyDialogueDTO struct {
    Speaker       string                     `json:"speaker"`
    Text          string                     `json:"text"`
    Intent        string                     `json:"intent"`
    ContinueLabel string                     `json:"continue_label,omitempty"`
    Choices       []storyDialogueChoiceDTO   `json:"choices,omitempty"`
    TutorialTip   *storyTutorialTipDTO       `json:"tutorial_tip,omitempty"`
}
```

**Modify `storyStateDTO`**:

```go
type storyStateDTO struct {
    ActiveNode string            `json:"active_node,omitempty"`
    Dialogue   *storyDialogueDTO `json:"dialogue,omitempty"`  // ← NEW
    Available  []string          `json:"available,omitempty"`
    Flags      map[string]bool   `json:"flags,omitempty"`
    Events     []storyEventDTO   `json:"recent_events,omitempty"`
}
```

#### 2.5 Send Dialogue via WebSocket

**File**: `internal/server/ws.go` (around line 805-814)

**Modify story DTO building**:

```go
flags := copyStoryFlags(p.StoryFlags)
if flags == nil {
    flags = make(map[string]bool)
}
storyDTO = &storyStateDTO{
    ActiveNode: p.ActiveStoryNodeID,
    Flags:      flags,
    Available:  storyAvailable,
}

// Add dialogue if active node exists
if p.ActiveStoryNodeID != "" {
    if graph := dag.GetGraph(); graph != nil {
        if node := graph.GetNode(dag.NodeID(p.ActiveStoryNodeID)); node != nil && node.Dialogue != nil {
            d := node.Dialogue
            var choices []storyDialogueChoiceDTO
            for _, choice := range d.Choices {
                choices = append(choices, storyDialogueChoiceDTO{
                    ID:   choice.ID,
                    Text: choice.Text,
                })
            }

            var tip *storyTutorialTipDTO
            if d.TutorialTip != nil {
                tip = &storyTutorialTipDTO{
                    Title: d.TutorialTip.Title,
                    Text:  d.TutorialTip.Text,
                }
            }

            storyDTO.Dialogue = &storyDialogueDTO{
                Speaker:       d.Speaker,
                Text:          d.Text,
                Intent:        d.Intent,
                ContinueLabel: d.ContinueLabel,
                Choices:       choices,
                TutorialTip:   tip,
            }
        }
    }
}
```

#### 2.6 Update Frontend to Use Server Dialogue

**File**: `internal/server/web/src/net.ts` (line 311-328)

**Update story state handling**:

```typescript
if (msg.story) {
    const prevActiveNode = state.story?.activeNode ?? null;
    state.story = {
        activeNode: msg.story.active_node ?? null,
        dialogue: msg.story.dialogue ?? null,  // ← NEW: Store dialogue
        available: Array.isArray(msg.story.available) ? msg.story.available : [],
        flags: msg.story.flags ?? {},
        recentEvents: Array.isArray(msg.story.recent_events) ? msg.story.recent_events.map((evt) => ({
            chapter: evt.chapter,
            node: evt.node,
            timestamp: evt.timestamp,
        })) : [],
    };

    // Emit event with dialogue
    if (state.story.activeNode !== prevActiveNode && state.story.activeNode) {
        bus.emit("story:nodeActivated", {
            nodeId: state.story.activeNode,
            dialogue: state.story.dialogue  // ← NEW: Pass dialogue
        });
    }
}
```

**File**: `internal/server/web/src/state.ts`

**Update `AppState` interface**:

```typescript
export interface StoryState {
    activeNode: string | null;
    dialogue: DialogueContent | null;  // ← NEW
    available: string[];
    flags: Record<string, boolean>;
    recentEvents: Array<{
        chapter: string;
        node: string;
        timestamp: number;
    }>;
}
```

**File**: `internal/server/web/src/bus.ts`

**Update event type**:

```typescript
export interface EventMap {
    // ... other events ...
    "story:nodeActivated": { nodeId: string; dialogue?: DialogueContent };
}
```

**File**: `internal/server/web/src/story/controller.ts` (line 27-45)

**Update handler to use server dialogue**:

```typescript
function handleNodeActivated({ nodeId, dialogue }: { nodeId: string; dialogue?: DialogueContent }): void {
    console.log("[story] Node activated:", nodeId, "Dialogue:", dialogue);

    // Parse the node ID to extract chapter and node info
    const parts = nodeId.split(".");
    if (parts.length < 3 || parts[0] !== "story") {
        console.warn("[story] Invalid node ID format:", nodeId);
        return;
    }

    const chapter = parts[1];
    const node = parts.slice(2).join(".");

    // Use server dialogue if provided, else fall back to local lookup
    const content = dialogue || getDialogueForNode(nodeId);

    showDialogueForNode(chapter, node, nodeId, content);
}

function showDialogueForNode(chapter: string, node: string, fullNodeId: string, content: DialogueContent | null): void {
    console.log("[story] Showing dialogue:", content);
    if (!content) {
        console.warn("[story] No dialogue content found for:", fullNodeId);
        acknowledgeNode(fullNodeId, null);
        return;
    }

    // ... rest of function unchanged
}
```

#### 2.7 Delete Client-Side Dialogue (Optional)

**File**: `internal/server/web/src/story/mission1-content.ts`

**After testing Phase 2**, delete this file or keep as fallback.

#### 2.8 Testing Phase 2

**Test Checklist**:
- [ ] Start campaign mode
- [ ] Opening dialogue appears (from server, not local file)
- [ ] All text/choices/speaker names correct
- [ ] Tutorial tips appear if present
- [ ] Click choices → server receives correct choice ID
- [ ] Dialogue closes and progresses to next node
- [ ] Browser devtools → no mission1-content.ts loaded
- [ ] Inspect WebSocket messages → see full dialogue in `story.dialogue` field

**Expected WebSocket Message**:
```json
{
  "type": "state",
  "story": {
    "active_node": "story.signal-static-1.start",
    "dialogue": {
      "speaker": "UNKNOWN SIGNAL",
      "text": "–gnal… —issus… co–dinates…\n\n[A weak signal...]",
      "intent": "factory",
      "choices": [
        {"id": "investigate", "text": "Investigate the signal"},
        {"id": "cautious", "text": "Approach with extreme caution"},
        {"id": "ignore", "text": "Log coordinates and continue patrol"}
      ],
      "tutorial_tip": {
        "title": "Route Plotting",
        "text": "Click on the map to plot waypoints..."
      }
    }
  }
}
```

## Migration Strategy

### Safe Incremental Rollout

#### Step 1: Fix Waiting (Phase 1)
1. Change `DurationS: 0` → `DurationS: 999999` in all story nodes
2. Test thoroughly - dialogue should wait for player
3. Deploy to production

#### Step 2: Add Server Dialogue (Phase 2a)
1. Add dialogue structs and fields
2. Populate dialogue in story nodes
3. Send via WebSocket
4. **Keep client-side mission1-content.ts as fallback**
5. Client uses server dialogue if present, else local
6. Test - both should work

#### Step 3: Cut Over (Phase 2b)
1. Verify all story nodes send dialogue correctly
2. Remove fallback to `getDialogueForNode()`
3. Delete `mission1-content.ts`
4. Deploy

### Rollback Plan

**If Phase 1 breaks**:
- Revert `DurationS` back to `0` or `5`
- System returns to previous (hacky) behavior

**If Phase 2 breaks**:
- Client falls back to local `mission1-content.ts`
- System continues working with client-side dialogue

## Future Enhancements

### Timeout Protection
Add auto-completion for story nodes older than 60 seconds (prevent stuck states if client disconnects):

```go
// In server ticker loop
for _, player := range room.Players {
    if player.ActiveStoryNodeID != "" {
        if job := player.DagState.GetActiveJob(dag.NodeID(player.ActiveStoryNodeID)); job != nil {
            elapsed := room.Now - job.StartedAt
            if elapsed > 60.0 {  // 60 second timeout
                log.Printf("[story] Auto-completing stuck node %s for player %s", player.ActiveStoryNodeID, player.ID)
                dag.Complete(graph, player.DagState, dag.NodeID(player.ActiveStoryNodeID), effects)
            }
        }
    }
}
```

### Dynamic Dialogue
Generate dialogue based on player state:

```go
Dialogue: &DialogueContent{
    Speaker: "UNIT-0",
    Text: fmt.Sprintf("Welcome back, %s. Your kill count: %d", player.Name, player.Kills),
    // ...
}
```

### Localization
Store multiple language versions:

```go
type LocalizedDialogue struct {
    English  *DialogueContent
    Spanish  *DialogueContent
    Japanese *DialogueContent
}
```

### Branching Paths
Track player choices and modify story based on flags:

```go
if player.StoryFlags["chose_investigate"] {
    return investigatePath
} else {
    return cautiousPath
}
```

## References

### Key Files
- `internal/dag/story.go` - Story node definitions
- `internal/dag/commands.go` - DAG lifecycle (Start, Complete)
- `internal/game/story_effects.go` - Story node effects (OnStart, OnComplete)
- `internal/server/ws.go` - WebSocket handlers (send story state, receive ack)
- `internal/server/web/src/story/controller.ts` - Client story controller
- `internal/server/web/src/story/overlay.ts` - Dialogue UI overlay

### Related Documentation
- `STORY_SYSTEM_GUIDE.md` - High-level story system overview
- `CLAUDE.md` - Project architecture guide
- `plans/campaign/PHASE_04_COMPLETE.md` - Campaign implementation notes

## Success Criteria

### Phase 1 Complete
- [ ] Dialogue appears and stays until player acknowledges
- [ ] No auto-timeout after 5 seconds
- [ ] Server logs show proper lifecycle (start → ack → complete)
- [ ] Story progression works (next nodes unlock after ack)

### Phase 2 Complete
- [ ] All dialogue served from backend
- [ ] No client-side mission1-content.ts file
- [ ] Cannot read future dialogue from browser devtools
- [ ] WebSocket messages contain full dialogue data
- [ ] Choices and tutorial tips work correctly

## Timeline Estimate

**Phase 1** (Critical Fix):
- Implementation: 1 hour
- Testing: 30 minutes
- **Total: 1.5 hours**

**Phase 2** (Backend Migration):
- Backend implementation: 2-3 hours
- Frontend implementation: 1 hour
- Testing: 1 hour
- **Total: 4-5 hours**

**Overall Project**: 6 hours for complete solution
