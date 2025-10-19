# Phase 2 – Mission Templates & UI

## Goals

- Layer flexible mission archetypes (travel, escort, kill, hazard-clear) on top of the Phase 1 backend beacon director so the server drives objective assignment and validation.
- Expand the authoritative mission state machine to cover offered/accepted/in-progress/completed/failed, exposing per-player progression and failure recovery hooks.
- Deliver UI that visualizes server-sourced mission objectives while respecting light-delay constraints and the new cooldown cadence introduced in Phase 1.

## Key Deliverables

- Mission template library in Go (`internal/game/missions.go`) describing objective predicates, failure conditions, and reward hooks that the beacon director can instantiate.
- Data-driven binding between beacon metadata and mission templates (JSON/Proto config) so designers can author encounter playlists without editing code.
- Protobuf/WebSocket flows for mission offers, updates, and completion acknowledgements that extend the Phase 1 beacon payloads instead of creating parallel channels.
- Reshaped client mission state (replacing the legacy `MissionState` singleton) so the frontend consumes authoritative mission arrays streamed from the server.
- HUD/map presentation improvements that consume authoritative mission arrays from `state.ts`, including guidance markers, progress meters, and cooldown indicators for locked beacons.

## Backend Focus

- Extend the Phase 1 director to queue missions when a beacon enters the “active” state, track objective progress, and release encounter slots when an encounter ends or fails.
- Build validation helpers for spatial bounds, kill counts, hazard clearing, and timers using the encounter entity ids seeded in Phase 1.
- Persist mission history alongside beacon state so reconnecting clients recover outstanding objectives and cooldowns.
- Emit mission lifecycle events (`mission:offered`, `mission:updated`, `mission:failed`) through the same event bus path used in Phase 1 to keep story and upgrades integrations simple.

## Frontend Focus

- Update `state.ts` to hold arrays of active missions, objective progress snapshots, cooldown timers, and failure reasons streamed from the server; remove the old TypeScript mission controller and adapt presenters to the new shape.
- Replace ad-hoc HUD logic with a mission panel that reacts to authoritative updates, scales to multiple concurrent objectives, and flags when confirmation is pending due to light delay.
- Map overlay enhancements that read beacon cooldowns and next-available timestamps, guiding players back to completed beacons when timers expire.
- Accessibility and UX passes to ensure mission indicators remain legible across zoom levels and communicate server latency expectations clearly.

## Dependencies & Risks

- Accuracy of mission validation depends on the entity tagging and encounter cleanup introduced in Phase 1; gaps there will surface as stuck objectives.
- Designer tooling/schema for beacon-to-mission bindings must stay in lockstep with engineering changes to avoid mismatched configs.
- Additional protobuf messages will increase client/server coupling; versioning and backwards compatibility need a minimal plan before rollout.
