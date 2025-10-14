# Story DAG Migration – Phase 1: DAG Foundation

## Goal
Prepare the existing DAG infrastructure so it can host story progression in a server-authoritative way without touching the current client story flow yet.

## Objectives
- Extend core data structures to represent story beats and story-specific metadata.
- Ensure the server can persist per-player story state and expose it via state messages.
- Establish the plumbing for story-related commands/events before any migration.

## Tasks
1. **Graph Support**
   - Add a `kind: "story"` classification to DAG nodes.
   - Confirm serialization/deserialization of DAG content supports the new kind and payload fields (`chapter`, `node`, optional `flags`, etc.).
   - Document naming conventions (e.g., `story.<chapter>.<beat>`).

2. **Player State Extensions**
   - Update `internal/game/room.go` player struct(s) with:
     - `StoryFlags map[string]bool`
     - `ActiveStoryNodeID string`
   - Make sure persistence/reset paths clear these safely.

3. **State Payload Wiring**
   - Extend the websocket `state` message to include a placeholder story payload:
     ```json
     {
       "story": {
         "active_node": null,
         "available": [],
         "flags": {}
       }
     }
     ```
   - Populate with current player story state; empty until Phase 2 populates it.

4. **Command Stubs**
   - Define backend handlers for upcoming client acknowledgements (e.g., `dag_story_ack`).
   - No functional logic yet—return early or log until Phase 2/3 hook them up.

5. **Testing & Validation**
   - Add unit coverage ensuring player structs initialise the new fields.
   - Verify the websocket payload change is backward-compatible (clients ignore missing `story` data).

## Exit Criteria
- DAG can represent story nodes without errors.
- Player/session state stores story flags/active node.
- State messages include a `story` section (empty for now).
- Command scaffolding for story acknowledgements exists.
