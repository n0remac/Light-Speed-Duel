# Story DAG Migration – Phase 3: Client Integration & Legacy Removal

## Goal
Connect the new server-driven story system to the frontend UI, remove the legacy client-only story engine, and ensure feature parity (or better).

## Objectives
- Replace old local storage and story engine usage with the DAG-driven payload.
- Hook dialogue/tutorial overlays to the new events.
- Clean up dead code and provide migration/rollback safeguards.

## Tasks
1. **Client Data Flow**
   - Update websocket handlers to consume the `story` section and store it in app state.
   - Expose selectors/helpers so UI components can query active node info, flags, etc.

2. **Overlay & Tutorial Wiring**
   - Replace calls into the old story engine with a new controller that reacts to `state.story`.
   - When a story node becomes active:
     - Render the corresponding dialogue.
     - On completion/choice, send `dag_story_ack` (with `choice_id` if applicable).
   - For tutorial prompts, ensure they use the new server-triggered data or existing tutorial engine as appropriate.

3. **Legacy System Removal**
   - Delete or gate the old `story/engine.ts` persistence, localStorage helpers, and trigger listeners.
   - Remove any redundant tutorial/story progress storage.
   - Update build and lint configs to exclude removed files.

4. **Feature Parity Validation**
   - Verify dialogue flows match previous behaviour in campaign/tutorial contexts.
   - Confirm story and tutorial tips persist across reconnects and multiple clients.
   - Ensure the HUD and other systems handle missing/empty story payloads gracefully.

5. **Cleanup & Documentation**
   - Update developer docs/README to describe the new server-authoritative story flow.
   - Provide migration notes for creating new story beats using DAG.

6. **Testing**
   - Manual playthrough to confirm UX.
   - Add frontend tests (unit/integration) for new selectors or controllers.
   - Regression test websocket handling with mock story payloads.

## Exit Criteria
- Frontend relies solely on the server DAG for story progression.
- Legacy client-only story storage/logic is removed.
- Tutorial/story UX works end-to-end with the new architecture.
