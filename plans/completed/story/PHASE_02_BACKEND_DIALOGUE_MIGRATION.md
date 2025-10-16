# Phase 2: Backend Dialogue Migration

**Priority**: Medium (Security Enhancement)
**Estimated Time**: 4-5 hours
**Depends On**: Phase 1 (must be complete and working)
**Benefits**: Prevents spoilers, enables dynamic dialogue, server-side validation

## Problem Statement

Currently, all dialogue content lives in `internal/server/web/src/story/mission1-content.ts`, which is compiled into the JavaScript bundle sent to the client. This means:

❌ Players can open browser devtools and read all future dialogue
❌ Players can see all choice options before they're presented
❌ Players can modify dialogue client-side (though server validates choices)
❌ Story spoilers are visible in the JavaScript source

### Current Architecture

```
Client Bundle (mission1-content.ts)
  ├─ "story.signal-static-1.start" → Full dialogue
  ├─ "story.signal-static-1.beacon-1" → Full dialogue
  ├─ "story.signal-static-1.beacon-2" → Full dialogue
  ├─ "story.signal-static-1.beacon-3" → Full dialogue
  └─ "story.signal-static-1.complete" → Full dialogue

Server sends: { story: { active_node: "story.signal-static-1.start" } }
Client looks up: MISSION_1_CONTENT["story.signal-static-1.start"]
Client displays: Dialogue from local lookup
```

**Problem**: All dialogue is visible before player reaches it.

## Solution

Move dialogue content to the backend. Server sends full dialogue when activating a node.

### Target Architecture

```
Server (internal/dag/story.go)
  └─ Node {
       ID: "story.signal-static-1.start"
       Dialogue: &DialogueContent{
         Speaker: "UNKNOWN SIGNAL",
         Text: "–gnal…",
         Choices: [...]
       }
     }

Server sends: {
  story: {
    active_node: "story.signal-static-1.start",
    dialogue: { speaker, text, choices, ... }  ← NEW
  }
}

Client receives: Full dialogue from server
Client displays: Whatever server sent (no local lookup)
```

**Benefit**: Dialogue only revealed when server activates node.

## Phase 2 Sub-Phases

Phase 2 is split into three focused sub-phases for easier implementation and review:

### [Phase 2A: Backend](PHASE_02A_BACKEND.md)
**Focus**: Go structs and data modeling
**Time**: 2-3 hours

- Create `internal/dag/dialogue.go` with dialogue structs
- Add `Dialogue *DialogueContent` field to `Node` struct
- Populate all story nodes with full dialogue content
- Test: Nodes compile and load correctly

### [Phase 2B: Networking](PHASE_02B_NETWORKING.md)
**Focus**: WebSocket protocol and serialization
**Time**: 1 hour

- Create DTOs for dialogue (choice, tip, content)
- Modify `storyStateDTO` to include dialogue
- Serialize dialogue when sending story state
- Test: WebSocket messages contain dialogue

### [Phase 2C: Frontend](PHASE_02C_FRONTEND.md)
**Focus**: Client updates and cleanup
**Time**: 1 hour

- Update TypeScript interfaces to expect server dialogue
- Modify controller to use server dialogue
- Add fallback to local lookup (temporary)
- Test: Dialogue displays from server
- Remove local `mission1-content.ts` file
- Test: Still works without local file

## Implementation Strategy

### Safe Incremental Rollout

#### Stage 1: Dual System (Safe)
1. Add backend dialogue support (Phase 2A)
2. Send dialogue via WebSocket (Phase 2B)
3. Client uses server dialogue if present, else falls back to local (Phase 2C)
4. Test thoroughly with both sources

**Benefit**: Can roll back at any time - client falls back to local file.

#### Stage 2: Backend Only (Final)
1. Verify all dialogue comes from server
2. Remove fallback to local lookup
3. Delete `mission1-content.ts`
4. Test without client-side file

**Benefit**: Dialogue fully server-authoritative.

## Benefits

### Security
- ✅ Players cannot read future dialogue in devtools
- ✅ Choices hidden until server presents them
- ✅ Story twists/spoilers protected

### Flexibility
- ✅ Can generate dynamic dialogue based on player state
  - Example: "Welcome back, Commander {name}. Kills: {kills}"
- ✅ Can modify dialogue without client updates
- ✅ Can A/B test different dialogue

### Features
- ✅ Server-side localization (send different languages)
- ✅ DLC content without client patches
- ✅ Event-specific dialogue (seasonal, achievements)
- ✅ Player-specific dialogue (based on choices, flags)

## Testing Strategy

### Phase 2A Testing
- [ ] Go compiles without errors
- [ ] Story nodes have `Dialogue` field populated
- [ ] Can access `node.Dialogue.Speaker`, `.Text`, `.Choices`
- [ ] No nil pointer panics

### Phase 2B Testing
- [ ] WebSocket messages include `story.dialogue` field
- [ ] Dialogue JSON structure correct
- [ ] All fields serialized (speaker, text, choices, tips)
- [ ] No serialization errors in server logs

### Phase 2C Testing
- [ ] Client receives dialogue from server
- [ ] Dialogue displays correctly (text, choices, speaker)
- [ ] Tutorial tips appear if present
- [ ] Choice buttons work
- [ ] Continue button works
- [ ] Client fallback works (if server dialogue missing)

### Integration Testing
- [ ] Start campaign mode
- [ ] Opening dialogue appears (from server)
- [ ] Click choice → server receives correct choice ID
- [ ] Reach beacon → new dialogue appears (from server)
- [ ] Open devtools → no mission1-content.ts in sources
- [ ] Inspect WebSocket → see full dialogue in messages
- [ ] Complete all story beats without errors

## Rollback Plan

### If Phase 2A Breaks
- Revert `internal/dag/graph.go` (remove Dialogue field)
- Revert `internal/dag/story.go` (remove dialogue content)
- System continues with client-side dialogue

### If Phase 2B Breaks
- Revert WebSocket changes
- Server stops sending dialogue
- Client falls back to local lookup

### If Phase 2C Breaks
- Keep client fallback in place
- System uses local dialogue until fixed

## Success Criteria

Phase 2 is complete when:

- [x] All dialogue defined in backend Go code
- [x] Server sends dialogue via WebSocket
- [x] Client displays server dialogue correctly
- [x] All features work (choices, tips, continue)
- [x] No `mission1-content.ts` in compiled JavaScript
- [x] Cannot read future dialogue in devtools
- [x] Story progression works end-to-end
- [x] No errors in server logs or browser console

## Timeline

| Sub-Phase | Focus | Time |
|-----------|-------|------|
| 2A | Backend structures | 2-3 hours |
| 2B | Networking/DTOs | 1 hour |
| 2C | Frontend updates | 1 hour |
| **Total** | | **4-5 hours** |

## Next Steps

1. **Ensure Phase 1 is complete** - dialogue must wait for player input
2. **Read Phase 2A** - [PHASE_02A_BACKEND.md](PHASE_02A_BACKEND.md)
3. **Implement Phase 2A** - create Go structs, populate dialogue
4. **Test Phase 2A** - verify nodes compile and load
5. **Proceed to Phase 2B** - [PHASE_02B_NETWORKING.md](PHASE_02B_NETWORKING.md)
6. **Proceed to Phase 2C** - [PHASE_02C_FRONTEND.md](PHASE_02C_FRONTEND.md)
7. **Integration test** - play through story mode end-to-end
8. **Deploy** - story is now fully server-authoritative

## Related Documentation

- [PHASE_02A_BACKEND.md](PHASE_02A_BACKEND.md) - Backend implementation guide
- [PHASE_02B_NETWORKING.md](PHASE_02B_NETWORKING.md) - WebSocket protocol guide
- [PHASE_02C_FRONTEND.md](PHASE_02C_FRONTEND.md) - Frontend update guide
- [OVERVIEW.md](OVERVIEW.md) - Project overview
- [PHASE_01_FIX_DIALOGUE_WAITING.md](PHASE_01_FIX_DIALOGUE_WAITING.md) - Prerequisite

## Future Enhancements (Post-Phase 2)

### Dynamic Dialogue Generation
```go
Dialogue: &DialogueContent{
    Speaker: "Commander",
    Text: fmt.Sprintf("Welcome, %s. Mission success rate: %.1f%%",
        player.Name, player.GetSuccessRate()),
}
```

### Branching Based on Flags
```go
func GetDialogueForNode(nodeID string, flags map[string]bool) *DialogueContent {
    if flags["chose_aggressive_path"] {
        return aggressiveDialogue
    }
    return diplomaticDialogue
}
```

### Server-Side Localization
```go
Dialogue: &DialogueContent{
    Speaker: GetLocalizedString(player.Language, "speaker.commander"),
    Text: GetLocalizedString(player.Language, "mission.intro.text"),
}
```

### Event-Specific Content
```go
if isHolidayEvent() {
    node.Dialogue.Text = holidayVersionText
}
```
