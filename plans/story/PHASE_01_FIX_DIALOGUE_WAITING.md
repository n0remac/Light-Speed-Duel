# Phase 1: Fix Dialogue Waiting

**Priority**: URGENT - Critical bug fix
**Estimated Time**: 1.5 hours
**Depends On**: Nothing
**Blocks**: Phase 2

## Problem Statement

Story dialogue nodes complete instantly before the client can see them. This causes `ActiveStoryNodeID` to be set and immediately cleared, resulting in the WebSocket message containing an empty `active_node` field.

### Root Cause

Story nodes in `internal/dag/story.go` have `DurationS: 0`, which triggers instant completion logic in `internal/dag/commands.go:75-79`:

```go
if effectiveDuration == 0 {
    // Instant completion
    effects.OnStart(nodeID, node)        // Sets ActiveStoryNodeID ✅
    state.SetStatus(nodeID, StatusCompleted)
    effects.OnComplete(nodeID, node)     // CLEARS ActiveStoryNodeID ❌
}
```

Both `OnStart()` and `OnComplete()` happen in the same server tick, so the client never sees the active node.

### Current Behavior

1. Player joins campaign
2. Server calls `HandleMissionStoryEventLocked("mission:start")`
3. Server calls `dag.Start("story.signal-static-1.start")`
4. Node starts and completes in same frame
5. `ActiveStoryNodeID` set then immediately cleared
6. WebSocket sends `{ story: { active_node: "" } }`
7. Client receives empty active_node → no dialogue displays ❌

### Why DurationS: 5 "Works"

With a non-zero duration, the completion logic changes:

```go
else {
    // Timed job
    state.StartJob(nodeID, now, effectiveDuration)  // Schedule completion
    effects.OnStart(nodeID, node)                    // Sets ActiveStoryNodeID ✅
    // OnComplete() NOT called yet
}
```

This gives the client time to receive and display the dialogue. However, after 5 seconds, the server auto-completes the node (even if player hasn't responded).

## Solution

Use a very long duration (`999999` seconds ≈ 11.5 days) to effectively disable auto-completion. The node will only complete when the client sends `dag_story_ack`, triggering manual completion.

### Why This Works

1. Server starts node with long duration
2. `ActiveStoryNodeID` set, stays set
3. Client receives active node via WebSocket
4. Client displays dialogue
5. Player clicks choice/continue
6. Client sends `dag_story_ack` message
7. Server receives ack → manually calls `dag.Complete()`
8. `ActiveStoryNodeID` cleared
9. Next node unlocks

**The `dag_story_ack` handler is already implemented!** See `internal/server/ws.go:582-610`.

## Implementation Steps

### Step 1.1: Update Story Node Durations

**File**: `internal/dag/story.go`

**Change all 5 story nodes** from `DurationS: 0` to `DurationS: 999999`:

```go
func SeedStoryNodes() []*Node {
    return []*Node{
        {
            ID:         "story.signal-static-1.start",
            Kind:       NodeKindStory,
            Label:      "Signal In The Static – Arrival",
            DurationS:  999999,  // ← CHANGE: was 0
            Repeatable: false,
            Payload: map[string]string{
                "chapter": "signal-static-1",
                "node":    "start",
                "flag":    "story.signal-static-1.start",
            },
            Requires: []NodeID{},
        },
        {
            ID:         "story.signal-static-1.beacon-1",
            Kind:       NodeKindStory,
            Label:      "Signal In The Static – Beacon 1",
            DurationS:  999999,  // ← CHANGE: was 5
            Repeatable: false,
            Payload: map[string]string{
                "chapter": "signal-static-1",
                "node":    "beacon-1",
                "flag":    "story.signal-static-1.beacon-1",
            },
            Requires: []NodeID{"story.signal-static-1.start"},
        },
        {
            ID:         "story.signal-static-1.beacon-2",
            Kind:       NodeKindStory,
            Label:      "Signal In The Static – Beacon 2",
            DurationS:  999999,  // ← CHANGE: was 0
            Repeatable: false,
            Payload: map[string]string{
                "chapter": "signal-static-1",
                "node":    "beacon-2",
                "flag":    "story.signal-static-1.beacon-2",
            },
            Requires: []NodeID{"story.signal-static-1.beacon-1"},
        },
        {
            ID:         "story.signal-static-1.beacon-3",
            Kind:       NodeKindStory,
            Label:      "Signal In The Static – Beacon 3",
            DurationS:  999999,  // ← CHANGE: was 0
            Repeatable: false,
            Payload: map[string]string{
                "chapter": "signal-static-1",
                "node":    "beacon-3",
                "flag":    "story.signal-static-1.beacon-3",
            },
            Requires: []NodeID{"story.signal-static-1.beacon-2"},
        },
        {
            ID:         "story.signal-static-1.complete",
            Kind:       NodeKindStory,
            Label:      "Signal In The Static – Completion",
            DurationS:  999999,  // ← CHANGE: was 0
            Repeatable: false,
            Payload: map[string]string{
                "chapter": "signal-static-1",
                "node":    "complete",
                "flag":    "story.signal-static-1.complete",
            },
            Requires: []NodeID{"story.signal-static-1.beacon-3"},
        },
    }
}
```

**Lines to change**: 10, 23, 36, 49, 62

### Step 1.2: Add Server-Side Logging

**File**: `internal/game/room.go`

**Modify `tryStartStoryNodeLocked()` function** (around line 225):

**Before**:
```go
func (r *Room) tryStartStoryNodeLocked(player *Player, nodeID dag.NodeID) {
    graph := dag.GetGraph()
    if graph == nil || player == nil || nodeID == "" {
        return
    }
    effects := NewRoomDagEffects(r, player)
    r.EvaluatePlayerDagLocked(graph, player, effects)
    if player.DagState.GetStatus(nodeID) != dag.StatusAvailable {
        return
    }
    if err := dag.Start(graph, player.DagState, nodeID, r.Now, effects); err != nil {
        log.Printf("story start error for player %s node %s: %v", player.ID, nodeID, err)
        return
    }
    // Re-evaluate to unlock downstream nodes immediately.
    r.EvaluatePlayerDagLocked(graph, player, effects)
}
```

**After**:
```go
func (r *Room) tryStartStoryNodeLocked(player *Player, nodeID dag.NodeID) {
    graph := dag.GetGraph()
    if graph == nil || player == nil || nodeID == "" {
        return
    }
    effects := NewRoomDagEffects(r, player)
    r.EvaluatePlayerDagLocked(graph, player, effects)

    status := player.DagState.GetStatus(nodeID)
    log.Printf("[story] Player %s attempting to start node %s (status: %s)", player.ID, nodeID, status)

    if status != dag.StatusAvailable {
        log.Printf("[story] Node %s not available for player %s (status: %s), skipping", nodeID, player.ID, status)
        return
    }

    if err := dag.Start(graph, player.DagState, nodeID, r.Now, effects); err != nil {
        log.Printf("[story] Start error for player %s node %s: %v", player.ID, nodeID, err)
        return
    }

    log.Printf("[story] Successfully started node %s for player %s", nodeID, player.ID)
    // Re-evaluate to unlock downstream nodes immediately.
    r.EvaluatePlayerDagLocked(graph, player, effects)
}
```

**File**: `internal/server/ws.go`

**Modify `dag_story_ack` handler** (around line 582):

**Before**:
```go
case "dag_story_ack":
    room.Mu.Lock()
    if p := room.Players[playerID]; p != nil {
        nodeID := dag.NodeID(strings.TrimSpace(m.NodeID))
        if nodeID == "" {
            room.Mu.Unlock()
            continue
        }
        graph := dag.GetGraph()
        if graph == nil {
            room.Mu.Unlock()
            continue
        }
        effects := game.NewRoomDagEffects(room, p)
        if err := dag.Complete(graph, p.DagState, nodeID, effects); err != nil {
            log.Printf("dag_story_ack complete error for player %s node %s: %v", playerID, nodeID, err)
        }
    }
    room.Mu.Unlock()
```

**After**:
```go
case "dag_story_ack":
    log.Printf("[story] Received dag_story_ack from player %s for node %s (choice: %s)",
        playerID, m.NodeID, m.ChoiceID)

    room.Mu.Lock()
    if p := room.Players[playerID]; p != nil {
        nodeID := dag.NodeID(strings.TrimSpace(m.NodeID))
        if nodeID == "" {
            log.Printf("[story] Empty node ID in ack from player %s", playerID)
            room.Mu.Unlock()
            continue
        }
        graph := dag.GetGraph()
        if graph == nil {
            log.Printf("[story] No graph available for ack from player %s", playerID)
            room.Mu.Unlock()
            continue
        }
        effects := game.NewRoomDagEffects(room, p)
        if err := dag.Complete(graph, p.DagState, nodeID, effects); err != nil {
            log.Printf("[story] Complete error for player %s node %s: %v", playerID, nodeID, err)
        } else {
            log.Printf("[story] Successfully completed node %s for player %s", nodeID, playerID)
        }
    } else {
        log.Printf("[story] Player %s not found when processing ack", playerID)
    }
    room.Mu.Unlock()
```

### Step 1.3: Verify Client Code (No Changes Needed)

**File**: `internal/server/web/src/story/controller.ts`

The `acknowledgeNode()` function (line 188) already sends the correct message:

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
    console.log("[story] Acknowledged node:", nodeId, choiceId ? `(choice: ${choiceId})` : "");
}
```

**No changes required** - this is already correct.

### Step 1.4: Build and Deploy

```bash
# 1. Build TypeScript (if you made any frontend changes - you shouldn't have)
go generate ./internal/server

# 2. Build Go binary
go build -o LightSpeedDuel

# 3. Run server
./LightSpeedDuel -addr :8080
```

## Testing Phase 1

### Test Checklist

Start campaign mode: `http://localhost:8080/?room=test&mode=campaign&mission=1`

- [ ] **Initial dialogue appears**
  - Opening dialogue displays ("–gnal… —issus… co–dinates…")
  - Speaker shows "UNKNOWN SIGNAL"
  - Three choice buttons visible

- [ ] **Dialogue stays visible**
  - Dialogue doesn't disappear after 5 seconds
  - Can read text at your own pace

- [ ] **Choices work**
  - Click any choice button
  - Dialogue closes
  - No errors in browser console

- [ ] **Story progression**
  - Reach first beacon (navigate to it on map)
  - New dialogue appears (Beacon 1)
  - Repeats: display → stays → close on click

- [ ] **Server logs correct**
  - Check terminal for log messages
  - Should see pattern: start → ack → complete

### Expected Server Logs

```
[story] Player <id> attempting to start node story.signal-static-1.start (status: available)
[story] Successfully started node story.signal-static-1.start for player <id>

... player reads and clicks ...

[story] Received dag_story_ack from player <id> for node story.signal-static-1.start (choice: investigate)
[story] Successfully completed node story.signal-static-1.start for player <id>

... player reaches beacon 1 ...

[story] Player <id> attempting to start node story.signal-static-1.beacon-1 (status: available)
[story] Successfully started node story.signal-static-1.beacon-1 for player <id>
```

### Expected Browser Console Logs

```
[story] Starting story controller
[story] Node activated: story.signal-static-1.start
[story] Dialogue content: {speaker: "UNKNOWN SIGNAL", text: "–gnal…", ...}
[story] Acknowledged node: story.signal-static-1.start (choice: investigate)

... later ...

[story] Node activated: story.signal-static-1.beacon-1
[story] Dialogue content: {speaker: "DISTRESS BEACON", ...}
```

### Troubleshooting

**Problem**: Dialogue doesn't appear
- Check: Is `mode=campaign` in URL?
- Check: Server logs - does node start?
- Check: Browser console - any JavaScript errors?
- Check: WebSocket messages - does `story.active_node` exist?

**Problem**: Dialogue disappears immediately
- Check: Did you change ALL 5 nodes to `DurationS: 999999`?
- Check: Did you rebuild Go binary? (`go build`)
- Check: Server logs - is Complete() called before ack received?

**Problem**: Dialogue stays but won't close on click
- Check: Browser console for JavaScript errors
- Check: Is `acknowledgeNode()` being called?
- Check: Server logs - is ack received?

**Problem**: Story doesn't progress to next node
- Check: Did complete successfully? (server logs)
- Check: Is next node unlocked? (check `Requires` dependencies)
- Check: Did you trigger the event? (e.g., reach beacon for beacon dialogue)

## Rollback Procedure

If Phase 1 causes issues, revert changes:

```bash
# 1. Open internal/dag/story.go
# 2. Change all DurationS back to original values:
#    - story.signal-static-1.start: 0
#    - story.signal-static-1.beacon-1: 5
#    - story.signal-static-1.beacon-2: 0
#    - story.signal-static-1.beacon-3: 0
#    - story.signal-static-1.complete: 0

# 3. Rebuild
go build -o LightSpeedDuel

# 4. Restart server
./LightSpeedDuel -addr :8080
```

System returns to previous (hacky but somewhat working) state.

## Success Criteria

Phase 1 is complete when:

- [x] All 5 story nodes have `DurationS: 999999`
- [x] Logging added to track node lifecycle
- [x] Dialogue appears when node activates
- [x] Dialogue stays visible until player clicks
- [x] Dialogue closes when player clicks choice/continue
- [x] Server receives `dag_story_ack` message
- [x] Server completes node after ack
- [x] Next node unlocks after completion
- [x] Server logs show proper flow: start → ack → complete
- [x] No errors in browser console
- [x] Can play through all 5 story beats

## Next Steps

After Phase 1 is complete and tested:

1. **Deploy to production** - story mode is now playable
2. **Optional: Proceed to Phase 2** - migrate dialogue to backend for security
   - Read [PHASE_02_BACKEND_DIALOGUE_MIGRATION.md](PHASE_02_BACKEND_DIALOGUE_MIGRATION.md)
   - Or continue with current system (dialogue in client-side TypeScript)

## Related Files

### Modified
- `internal/dag/story.go` - Story node definitions (DurationS changed)
- `internal/game/room.go` - Added logging to tryStartStoryNodeLocked
- `internal/server/ws.go` - Added logging to dag_story_ack handler

### Verified (No Changes)
- `internal/server/web/src/story/controller.ts` - Already sends ack correctly
- `internal/server/web/src/story/overlay.ts` - UI works as-is
- `internal/game/story_effects.go` - OnStart/OnComplete logic correct

## Time Estimate

- **Edit story.go**: 5 minutes
- **Add logging**: 15 minutes
- **Build & deploy**: 5 minutes
- **Testing**: 30 minutes
- **Debugging** (if needed): 30 minutes

**Total**: 1-1.5 hours
