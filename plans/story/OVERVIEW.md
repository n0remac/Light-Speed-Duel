# Story System Overhaul - Overview

## Document Structure

This directory contains a phased plan to fix and migrate the story/dialogue system.

### Quick Links

- **[OVERVIEW.md](OVERVIEW.md)** ← You are here
- **[PHASE_01_FIX_DIALOGUE_WAITING.md](PHASE_01_FIX_DIALOGUE_WAITING.md)** - Critical bug fix (MUST DO FIRST)
- **[PHASE_02_BACKEND_DIALOGUE_MIGRATION.md](PHASE_02_BACKEND_DIALOGUE_MIGRATION.md)** - Security enhancement (optional)
  - [PHASE_02A_BACKEND.md](PHASE_02A_BACKEND.md) - Backend dialogue structures
  - [PHASE_02B_NETWORKING.md](PHASE_02B_NETWORKING.md) - WebSocket DTOs and serialization
  - [PHASE_02C_FRONTEND.md](PHASE_02C_FRONTEND.md) - Client-side updates

## The Two Problems

### Problem 1: Dialogue Disappears Instantly ❌ CRITICAL
**Status**: Broken in production
**Impact**: Story mode is unplayable - dialogue never displays
**Fix**: Phase 1 (1.5 hours)

Story nodes complete instantly before the client can see them, so `ActiveStoryNodeID` is cleared before the WebSocket message is sent.

### Problem 2: Dialogue Visible in Client Code ⚠️ SECURITY
**Status**: Working but insecure
**Impact**: Players can read all dialogue/spoilers in browser devtools
**Fix**: Phase 2 (4-5 hours)

All dialogue text is bundled in the JavaScript file `mission1-content.ts`, allowing players to read ahead.

## Recommended Approach

### Step 1: Fix Critical Bug (Phase 1)
**Priority**: URGENT
**Document**: [PHASE_01_FIX_DIALOGUE_WAITING.md](PHASE_01_FIX_DIALOGUE_WAITING.md)

1. Change `DurationS: 0` → `DurationS: 999999` in story nodes
2. Add logging to track node lifecycle
3. Test thoroughly
4. Deploy

**After this**: Story mode is playable ✅

### Step 2: Migrate to Backend Dialogue (Phase 2)
**Priority**: Medium (security enhancement)
**Documents**:
- [PHASE_02_BACKEND_DIALOGUE_MIGRATION.md](PHASE_02_BACKEND_DIALOGUE_MIGRATION.md) - Overview
- [PHASE_02A_BACKEND.md](PHASE_02A_BACKEND.md) - Backend changes
- [PHASE_02B_NETWORKING.md](PHASE_02B_NETWORKING.md) - Network protocol changes
- [PHASE_02C_FRONTEND.md](PHASE_02C_FRONTEND.md) - Frontend changes

Phase 2 is split into sub-phases for easier review:
- **2A (Backend)**: Create Go structs for dialogue, populate story nodes
- **2B (Networking)**: Add WebSocket DTOs, send dialogue to client
- **2C (Frontend)**: Update client to use server dialogue, delete local file

**After this**: Dialogue is server-authoritative ✅

## Timeline

| Phase | Time | Cumulative |
|-------|------|------------|
| Phase 1 | 1.5 hours | 1.5 hours |
| Phase 2A | 2-3 hours | 3.5-4.5 hours |
| Phase 2B | 1 hour | 4.5-5.5 hours |
| Phase 2C | 1 hour | 5.5-6.5 hours |
| **Total** | **5.5-6.5 hours** | |

## Testing Strategy

### Phase 1 Testing
- [ ] Start campaign mode
- [ ] Verify dialogue appears and stays visible
- [ ] Click choices/continue → dialogue closes
- [ ] Verify server logs show proper lifecycle
- [ ] Reach beacon 1 → new dialogue appears

### Phase 2 Testing
- [ ] Start campaign mode
- [ ] Open browser devtools → no mission1-content.ts loaded
- [ ] Inspect WebSocket messages → see `story.dialogue` field
- [ ] Verify all dialogue displays correctly
- [ ] Test choices, tutorial tips, continue buttons

## Rollback Plan

### If Phase 1 Breaks
Revert `internal/dag/story.go` to previous `DurationS` values.

### If Phase 2 Breaks
Client falls back to local `mission1-content.ts` lookup.

## Success Criteria

### Phase 1 Complete ✅
- [ ] Dialogue visible and stays until player acknowledges
- [ ] No auto-timeout
- [ ] Server logs show: start → ack → complete
- [ ] Story progression works

### Phase 2 Complete ✅
- [ ] All dialogue served from backend
- [ ] No client-side dialogue file in compiled JavaScript
- [ ] Cannot read future dialogue from devtools
- [ ] All features work (choices, tips, etc.)

## Architecture Diagrams

### Current (Broken) Flow
```
Server: dag.Start(DurationS: 0)
  ├─> OnStart() sets ActiveStoryNodeID = "story.x"
  └─> OnComplete() clears ActiveStoryNodeID = ""
      └─> WebSocket sends { active_node: "" }  ❌
          └─> Client never sees dialogue
```

### Phase 1 (Fixed) Flow
```
Server: dag.Start(DurationS: 999999)
  └─> OnStart() sets ActiveStoryNodeID = "story.x"
      └─> WebSocket sends { active_node: "story.x" }  ✅
          └─> Client displays dialogue
              └─> User clicks → sends dag_story_ack
                  └─> Server: dag.Complete()
                      └─> OnComplete() clears ActiveStoryNodeID
```

### Phase 2 (Secure) Flow
```
Server: dag.Start(DurationS: 999999)
  └─> OnStart() sets ActiveStoryNodeID = "story.x"
      └─> WebSocket sends {
            active_node: "story.x",
            dialogue: { speaker, text, choices, ... }  ← NEW
          }
          └─> Client displays dialogue from server (not local file)
              └─> User clicks → sends dag_story_ack with choice_id
                  └─> Server: dag.Complete()
                      └─> OnComplete() clears ActiveStoryNodeID
```

## Related Documentation

- [../../STORY_SYSTEM_GUIDE.md](../../STORY_SYSTEM_GUIDE.md) - High-level architecture
- [../../CLAUDE.md](../../CLAUDE.md) - Project structure
- [../campaign/PHASE_04_COMPLETE.md](../campaign/PHASE_04_COMPLETE.md) - Campaign notes
- [./PLAN.md](./PLAN.md) - Original monolithic plan (deprecated, use phase-specific docs)

## Getting Started

1. **Read this overview** to understand the problems
2. **Start with Phase 1** - read [PHASE_01_FIX_DIALOGUE_WAITING.md](PHASE_01_FIX_DIALOGUE_WAITING.md)
3. **Implement Phase 1** - follow the step-by-step guide
4. **Test Phase 1** - use the checklist
5. **Deploy Phase 1** - story mode should work now
6. **Optional: Phase 2** - read [PHASE_02_BACKEND_DIALOGUE_MIGRATION.md](PHASE_02_BACKEND_DIALOGUE_MIGRATION.md) when ready

## Questions?

If you're unclear on anything, check the phase-specific documents. Each has:
- Detailed problem description
- Step-by-step implementation
- Code examples (before/after)
- Testing checklist
- Rollback procedure
