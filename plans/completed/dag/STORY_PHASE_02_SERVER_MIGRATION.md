# Story DAG Migration – Phase 2: Server Story Engine

## Goal
Move story progression from the client-only system into the server DAG. After this phase the server owns the story state and progression logic, but the client UI still relies on legacy rendering.

## Objectives
- Seed actual story content into the DAG graph.
- Drive story node activation/completion on the server using mission/tutorial signals.
- Emit structured story events to clients through the new payload created in Phase 1.

## Tasks
1. **Content Authoring**
   - Convert existing narrative beats (e.g., campaign Mission 1) into DAG nodes with `kind: "story"`.
   - Define `requires` edges for linear progression.
   - Store metadata in node payloads (`chapter`, `node`, `flags`, optional `duration_s`).

2. **Progression Logic**
   - Update DAG evaluator/completion code:
     - Auto-start story nodes when they become available (set `ActiveStoryNodeID`).
     - When a story node completes, update `StoryFlags` and queue events for the websocket payload.
   - Hook mission/tutorial signals so the server calls `Complete` on the appropriate story nodes.

3. **Command Implementations**
   - Finalise `dag_story_ack` (or reuse `dag_start/dag_complete`) to let clients confirm completion where required.
   - Enforce server authority: ignore duplicate/out-of-order acknowledgements.

4. **State Serialization**
   - Populate the `story` section of the websocket payload with:
     ```json
     {
       "active_node": "story.signal-static-1.lock-b2",
       "available": ["story.signal-static-1.lock-b3"],
       "flags": {"signal-static-1": true},
       "recent_events": [
         {"chapter": "...", "node": "...", "timestamp": ...}
       ]
     }
     ```
   - Include only the data the client needs for rendering/UX.

5. **Backwards Compatibility**
   - Leave the legacy client story engine untouched but idle; it should see the new payload and can log it for debugging.

6. **Testing & Validation**
   - Unit test DAG progression for story nodes (available → active → completed).
   - Integration test via websocket: ensure events arrive when mission milestones fire.

## Exit Criteria
- Story progression is fully server-driven via DAG.
- Clients receive meaningful `story` payload updates when events occur.
- Legacy client story code is still present but no longer authoritative.
