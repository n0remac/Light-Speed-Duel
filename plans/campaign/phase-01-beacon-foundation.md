# Phase 1 – Beacon Foundation

## Goals

- Extract the current TypeScript-only mission/beacon flow into an authoritative backend service that owns placement, lifecycle, and progression.
- Establish deterministic beacon placement across the map with sparse, evenly spaced distribution backed by stored seeds, not hard-coded arrays.
- Persist per-player beacon discovery, activation, and cooldown windows so revisit timers survive reconnects.
- Keep perception cues consistent with light-delay mechanics by letting the backend schedule notifications while the client focuses on presentation.

## Key Deliverables

- Poisson-disc or jittered grid placement producing configurable density and minimum spacing, persisted via deterministic seeds derived from session/world parameters.
- Beacon schema covering identifiers, world position, trigger radii, encounter slots, cooldown timestamps, and per-player overlays (discovered, active, locked).
- Migration of the existing `mission` controller from `internal/server/web/src/mission/controller.ts` into Go (`internal/game/beacons.go` + helpers) so beacon locking, timers, and progression are server-validated.
- Redesign of existing websocket payloads (`MissionSpawnWave`, `MissionStoryEvent`, beacon HUD deltas) so clients receive authoritative progression updates rather than emitting triggers themselves.
- Authoritative discovery/activation lifecycle that fires on server-confirmed position checks, communicates via protobuf updates, and mirrors the current hold-to-lock gameplay.
- Basic campaign director loop on the server that monitors beacon encounters, enforces simultaneous activation limits, and marks encounter completion for entity cleanup.

## Backend Focus

- Introduce `internal/game/beacons.go` (or expand `mission.go`) to manage placement, indexing, per-player state, cooldowns, and encounter handles; hook it into room initialization.
- Extend `internal/server/ws.go` and related protobuf messages to stream beacon state snapshots and differential updates to clients; retire the current UI-driven `mission_spawn_wave` flow by moving those triggers server-side.
- Move trigger evaluation into the simulation tick: reuse mission heat/position utilities to check hold progress, confirm completion, start cooldowns, and unlock the next beacon.
- Register mission-spawned entities with encounter ids so the director can despawn or recycle them when encounters end or a beacon times out.
- Persist per-player beacon state (redis/file/db TBD) and expose replay-safe seeds; document stopgaps if durable storage is not immediately available.

## Frontend Focus

- Replace the TypeScript mission controller with a thin presenter that reads server-provided beacon state (`state.ts` mission fields) and emits UI events on change.
- Maintain minimal beacon markers, discovery cues, and HUD updates; no progression authority remains on the client.
- Ensure event bus topics (`beacon:discovered`, `beacon:activated`, `mission:completed`) mirror backend messages so Phase 2 UI work can layer on.

## Dependencies & Risks

- Requires consensus on map bounds/seed derivation to keep deterministic placement reproducible between backend and any tooling.
- Persistence strategy must be chosen early enough to store cooldown timestamps; interim solutions (in-memory + reconnect penalty) should be documented.
- Encounter cleanup relies on reliable entity tagging; existing mission waves must be retrofitted with encounter ids during migration.
