# Phase 4 – Story & Tutorial Beats

## Status
Ready for implementation. The backend DAG story system (see `plans/completed/dag/PHASE_03_COMPLETE.md`) now drives campaign narrative beats, so this phase focuses on consuming that data on the frontend and authoring the associated dialogue/tutorial content. The legacy client-only story engine should be treated purely as a UI layer that reacts to server updates.

## Scope
- Author the Mission 1 `signal-static-1` story beats that are already seeded in the DAG (`story.signal-static-1.start`, `…beacon-*`, `…complete`) and map them to dialogue/tip copy.
- Render dialogue/tip overlays when the server marks a story node active via the websocket `state.story` payload.
- Send `dag_story_ack` when a dialogue is dismissed so the server can complete the node and unlock the next beat.
- Deliver lightweight tutorial reminders at appropriate progression points (route editing, heat management, evasive routing) using DAG events or existing tutorial hooks.

## Story Wiring (Server-Driven)
- Server flow:
  - Mission controller emits `mission:*` events ➜ `Room.HandleMissionStoryEventLocked` starts the matching DAG node.
  - `StoryEffects` sets `ActiveStoryNodeID`, records `StoryFlags`, and queues `StoryEvent` records that are sent to clients via `state.story`.
- Client flow:
  - Consume `state.story` updates (`active_node`, `available`, `flags`, `recent_events`) in app state.
  - Lookup the corresponding dialogue/tutorial content and display it when a new event arrives.
  - After the player clicks through/acknowledges the dialogue, call `dag_story_ack` with the node id (and choice id if needed).

Sample dialogue beats:
- Start: “–gnal… —issus… co–dinates… [garbled tone]”
- After B1 lock: “Signal improving… triangulating… maintain low thrust.”
- After B2 lock: “Possible survivors… uplink unstable… watch for debris.”
- After B3 lock: “Beacon lock… seeker signatures nearby… caution.”
- Completion: “Unit-0, you found us. Archives unlocked… uploading next route.”

Tutorial reminders (lightweight):
- On entering Beacon 1: highlight route plotting/editing controls.
- Between B2 and B3: explain heat marker, stall recovery, and safe cruising speeds.
- Before Beacon 4 exposure/completion: reinforce low-heat cruising and evasive routing tips.

## Tasks
1. **Content Authoring**
   - Create a Mission 1 story chapter definition (text, intent, optional SFX cues) keyed by the DAG node ids.
   - Draft short tutorial tip text that complements the dialogue beats.

2. **Frontend State & Overlay Integration**
   - Extend client state to store the `story` payload from the websocket.
   - Build a small controller that subscribes to story events, selects the proper content, and shows the overlay.
   - Ensure the overlay can differentiate dialogue vs tutorial tips if styling diverges.

3. **Acknowledgement Wiring**
   - When the user advances or closes a story beat, send `dag_story_ack` with the active node id.
   - Handle optional choice flows (if added later) by including a `choice_id`.

4. **Tutorial Hooks**
   - Reuse the existing tutorial engine where possible; otherwise present lightweight tooltip-style prompts gated by DAG story flags/events.
   - Avoid duplicating tips that the main tutorial already covers (respect `StoryFlags`).

5. **Cleanup**
   - Remove or gate any legacy client-only mission triggers, ensuring the overlay only responds to server-driven events.
   - Verify local storage is no longer used for story persistence.

6. **Validation**
   - Manual campaign playthrough verifying each beacon locks dispatches the correct dialogue and that acknowledgements advance the DAG.
   - Confirm reconnect behaviour: story state resumes correctly without replaying already completed beats unless they are marked repeatable.
   - Regression-test tutorial flow in non-campaign modes to confirm no unintended overlays appear.

## Deliverables
- Story/tip content for Mission 1 defined and rendered through the DAG-driven pipeline.
- Frontend overlay fully driven by `state.story`, including acknowledgements and optional choices.
- Tutorial reminders triggered at the intended mission milestones without overwhelming the player.
- No dependency on the old client-only trigger architecture; progress persists via the server DAG.
