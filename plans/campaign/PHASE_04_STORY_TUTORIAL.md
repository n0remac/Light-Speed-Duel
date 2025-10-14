# Phase 4 – Story & Tutorial Beats

## ⚠️ BLOCKED - Requires Story System Review

**Status**: DEFERRED until `plans/dag/STORY.md` migration is resolved.

**Reason**: The story system is being migrated from client-only (browser storage) to server-authoritative DAG-based progression. Campaign story beats should follow the new architecture to ensure:
- Progress persists across reconnects
- Server can gate gameplay unlocks
- Story flags are authoritative

**Action required**:
1. Review and finalize `plans/dag/STORY.md` migration plan
2. Decide on story architecture (client-only vs DAG-based)
3. Return to this phase once story system architecture is settled

---

## Scope (Original Plan - May Change)
- Add a short story chapter for Mission 1 (id: `signal-static-1`).
- Trigger lines as the beacon locks progress; final line on mission complete.
- Add light tutorial prompts at key moments; reuse tutorial engine where possible.

## Story Wiring (TENTATIVE - depends on architecture decision)

### If Client-Only Story (Current System)
- Chapter file: `internal/server/web/src/story/chapters/campaign_signal.ts` (NEW - does not exist)
- Triggers:
  - `mission:start` (immediate after start gate)
  - `mission:beacon-locked` (1..4) → progressively clearer messages
  - `mission:completed` → closing line/unlock cue

**Required changes**:
- Extend `StoryTrigger` type in `story/types.ts` to support mission events:
  ```typescript
  | { kind: "mission-start"; delayMs?: number }
  | { kind: "mission-beacon-locked"; beaconIndex: number; delayMs?: number }
  | { kind: "mission-completed"; delayMs?: number }
  ```
- Add trigger binding in `story/engine.ts` (lines 268-303) for new trigger kinds

### If DAG-Based Story (Migration Plan)
- Story beats become DAG nodes with `kind: "story"`
- Server drives progression based on mission events
- Client receives story state in `state` message
- Overlay.show() called when server marks node as active

Sample Beats
- Start: “–gnal… —issus… co–dinates… [garbled tone]”
- After B1 lock: “Signal improving… triangulating… maintain low thrust.”
- After B2 lock: “Possible survivors… uplink unstable… watch for debris.”
- After B3 lock: “Beacon lock… seeker signatures nearby… caution.”
- Completion: “Unit-0, you found us. Archives unlocked… uploading next route.”

Tutorial Beats (lightweight)
- At B1 arrival (first entry into ring): prompt route plotting/editing controls.
- Between B2 and B3: tip about heat marker and stall recovery (listen to `heat:warnEntered` / `heat:stallRecovered`).
- Before B4 (on revealing B4): reminder about low‑heat cruising and evasive routing.

## Tasks (DEFERRED - see block above)
- ⏸️ Decide on story architecture (client vs DAG)
- ⏸️ If client-only: Extend story trigger types
- ⏸️ If client-only: Add bus bindings in story engine to listen for mission events
- ⏸️ If DAG-based: Create story nodes in DAG graph
- ⏸️ Author chapter nodes/choices (no choices required; continue/auto-advance OK)
- ⏸️ Wire tutorial steps to existing events (or minimal new tips if reusing full tutorial is heavy)

## Deliverables (TENTATIVE)
- Dialogue overlay reacts to mission milestones
- Tutorial tips appear at the right time without overwhelming the player

## Technical Notes
**Current state**:
- ✅ Story engine exists and works (`story/engine.ts`)
- ✅ Tutorial engine exists and works (`tutorial/`)
- ❌ Story chapter for campaign does not exist
- ❌ Story triggers for mission events not implemented
- ⚠️ Architecture decision pending (see `plans/dag/STORY.md`)

**Dependencies**:
- Requires `mission:*` events from Phase 1
- Requires beacon lock events from Phase 2
- **BLOCKS**: Story architecture decision from DAG migration plan

**Recommendation**: Implement Phases 1-3 first (foundation + gameplay), then return to Phase 4 once story system architecture is finalized.

