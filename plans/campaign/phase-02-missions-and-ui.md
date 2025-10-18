# Phase 2 – Mission Templates & UI

## Goals

- Introduce the first mission archetypes (travel, kill, clear missiles) that can be attached to beacon triggers.
- Provide clear mission tracking in the client so players understand objectives and progress despite light-delay visibility.
- Ensure mission state changes flow through the existing event-driven architecture without coupling UI to low-level logic.

## Key Deliverables

- Mission lifecycle states (offered, accepted, in-progress, completed, failed) with per-player tracking on the server.
- Validation helpers for spatial bounds, kill counts, and hazard clearing thresholds.
- Mission controller that associates beacon events with mission templates and hands them to the campaign director.
- Frontend HUD elements showing active objectives, progress bars, and optional guidance markers on the map.

## Backend Focus

- New `internal/game/missions.go` managing mission definitions, instances, and progress updates.
- Protobuf additions for mission updates and acknowledgements; WebSocket handlers for accepting/declining when needed.
- Integration with beacon lifecycle so activation automatically assigns travel/kill/clear missions based on script metadata.
- Hooks for mission completion events that can later trigger rewards or escalate difficulty.

## Frontend Focus

- Extend `state.ts` with mission arrays and progress metrics; emit `mission:updated` events for UI modules.
- Implement lightweight mission HUD in `mission/hud.ts` plus map indicators for the current mission target.
- Handle new mission protobuf messages in `net.ts`, keeping reconciliation tolerant of delayed world snapshots.
- Accessibility pass to ensure mission indicators remain readable across zoom levels and colour schemes.

## Dependencies & Risks

- Precision of kill/clear tracking depends on reliable entity tagging from Phase 1.
- UI should avoid promising instant feedback; messaging must note when confirmation is pending due to light delay.
