Story System → DAG Migration Plan
================================

Why
---
- Move dialogue/story gating from the client-only system (`internal/server/web/src/story/`) into the new server-authoritative DAG so progress persists, survives reconnects, and can drive gameplay unlocks.
- Reuse the tiny DAG core (single `requires` edges, implicit visibility) without expanding scope yet.

Current State (baseline)
------------------------
- Chapters defined in TypeScript (`story/types.ts`) and run entirely on the client via `createStoryEngine`.
- Progress stored in browser storage; server is unaware of story flags or advancement.
- Triggers (tutorial events, immediate delays) fire locally off the event bus.

Target Architecture (v1)
------------------------
- Represent story beats as DAG nodes (`kind: "story"`, `repeatable: false`).
- Server drives progression: completion unlocks downstream nodes (using existing `requires` logic).
- Client requests current story DAG snapshot, then asks server to start/ack specific nodes (or server auto-starts when prereqs satisfied).
- Keep UI rendering and dialogue playback client-side, but state and timers (if any) authoritative on server.

Content Mapping
---------------
- For each chapter, define a linear or mildly branching node chain:
  - Nodes map to dialogue scenes or auto-advance steps (`node.id = "story.<chapter>.<beat>"`).
  - `duration_s` optional (mostly 0) unless a beat should auto-complete after delay.
  - `payload` contains existing story metadata:
    ```json
    {
      "chapter": "tutorial-alpha",
      "node": "intro-1",
      "speaker": "...",
      "flags": ["unlock-help-overlay"]
    }
    ```
- Edges use `"requires"` to ensure only the next beat is `Available`.
- Completion effects update `Player.StoryFlags` (new map) and push events to client.

Server Changes
--------------
1. **Graph Seed**
   - Add story nodes to the static DAG content alongside craft nodes (PLAN step #2).
   - Group by chapter via naming convention or `payload.chapter`.
2. **Player State**
   - Extend `game.Player` with `StoryFlags map[string]bool` and `ActiveStoryNodeID string`.
3. **Effects Hook**
   - In DAG completion handler, when `kind == "story"`:
     - Set flags from payload.
     - Queue `StoryEvent { chapter, node, flags }` for the next state push.
4. **Auto-Start**
   - During evaluator output, for any `story` node transitioning to `Available`, immediately mark it `InProgress` and snapshot duration:
     - If `duration_s == 0`, schedule completion to happen as soon as client confirms.
     - For client-driven beats, leave as `Available` and wait for explicit `dag_complete_ack`.
5. **Commands**
   - Add WS handler `dag_story_ack` (client confirms dialogue finished) → call `Complete(node_id)`.
   - Reuse existing `dag_start` only if client-initiated beat is needed.
6. **State Payload**
   - Augment `state` message with:
     ```json
     {
       "story": {
         "active_node": "...",
         "available": ["..."],
         "flags": {...},
         "recent_events": [...]
       }
     }
     ```

Client Adjustments
------------------
1. **Remove Local Storage**
   - Replace `loadStoryProgress`/`saveStoryProgress` usage with server-provided state.
2. **Event Handling**
   - Subscribe to `state.story` updates; when a new node becomes active, call `overlay.show(...)`.
   - On user choice/continue:
     - Send `dag_story_ack` with node id and selected choice (payload extends to include choice id).
3. **Choice Resolution**
   - If node has choices, client sends `choice_id`; server effects decide next node (by completing the current node and unlocking the target).
4. **Fallback**
   - If no server story data arrives, retain current local-only flow (debug mode toggle).

Testing & Validation
--------------------
- Unit test DAG story transitions: prerequisites, auto-available, choice branching.
- Integration test: simulate player receiving `story` node, ack completion, ensure flag set and next node unlocked.
- Client manual test: ensure dialogue flows identical to current behavior when online.

Out of Scope (v1)
-----------------
- Visibility/unlocks edges (beyond simple `requires`).
- Story authoring tooling or YAML migration.
- Multi-player synchronization of shared story (dogfight rooms only track per-player story).
- Persisting story state beyond process lifetime (in-memory per PLAN).

Open Questions
--------------
1. Do story beats require timers (auto-complete after delay) or purely client acknowledgment?
2. Should choices remain client-driven or move entirely server-side (server picks next node based on `choice_id`)?
3. Is there a need to gate gameplay features immediately on story completion, or just track progress for now?
