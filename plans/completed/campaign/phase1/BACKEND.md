# Phase 1 – Backend Summary

## Summary

- Move beacon and mission authority from the TypeScript mission controller to new Go services (`internal/game/beacons.go` or an expanded `mission.go`) that own placement, lifecycle, and progression.
- Generate deterministic beacon layouts (Poisson-disc or jittered grid) using reproducible seeds derived from session parameters, and persist those seeds together with beacon state.
- Track per-player discovery, activation, hold timers, and cooldown windows on the server so revisit timing survives reconnects.
- Extend the campaign director to monitor active encounters, enforce simultaneous activation limits, and clean up spawned entities when encounters end or time out.
- Persist beacon state and encounter metadata using an interim storage strategy (in-memory with reconnection penalties) until durable storage is selected.

## Analysis

- **Lifecycle Migration**: The browser currently advances `mission.beaconIndex` and emits `mission_spawn_wave`; moving this logic server-side means porting hold-progress evaluation into the simulation tick and exposing the results via websocket updates. The TypeScript controller becomes a passive presenter once this work lands.
- **Deterministic Placement**: `missionBeaconPositions` in `internal/server/ws.go` uses per-call randomness. We need to replace it with a deterministic sampler seeded at room creation and stored alongside beacon IDs so both backend and tooling can reproduce placements.
- **Per-Player State**: State presently lives in browser `localStorage`; backend implementation must capture discovered beacons, active timers, and cooldown expiries keyed by player/session. Document stopgap persistence (e.g., in-memory map) and plan for a production-ready store later.
- **Encounter Registry**: Existing helpers (`SpawnMinefield`, `SpawnPatrollers`, `SpawnSeekers`) shoot missiles without tracking ownership. Wrapping these spawns in encounter records lets the director despawn or recycle them as soon as the player completes or abandons a beacon.
- **Dependencies & Risks**: Final placement math needs agreed map bounds; encounter cleanup depends on tagging missiles/bots with encounter IDs; storage requirements should be captured early to avoid rework when persistence is chosen.
