# Phase 1 – Networking Summary

## Summary

- Redesign the websocket contract so beacon and mission progression flows from the server to the client rather than the reverse.
- Stream authoritative beacon state snapshots/deltas, including hold progress, cooldown timers, active encounter ids, and discovery flags.
- Route encounter launch commands (e.g., patrol or minefield spawns) through the backend director, eliminating the browser-originated `mission_spawn_wave` message.

## Analysis

- **Existing Messages**: `MissionSpawnWave` and `MissionStoryEvent` are currently sent from the client to the server when the browser mission controller advances beacons. Once authority shifts server-side, these messages become obsolete in their current roles.
- **Required Additions**: We need new protobuf definitions for:
  - A beacon state snapshot (`BeaconStateSnapshot`) carrying the full list of beacons, per-player overlays, and encounter cooldowns.
  - Incremental beacon updates (`BeaconStateDelta` or similar) so the server can push hold-progress changes without resending the entire snapshot.
  - Optional encounter lifecycle events (`EncounterActivated`, `EncounterCompleted`) if the client needs explicit hooks distinct from beacon lock events.
- **Reuse Opportunities**: `MissionStoryEvent` can remain as a server-to-client narrative trigger once the server emits it; only its direction changes. Any new beacon messages should be added to `WsEnvelope` alongside existing mission events.
- **Backward Compatibility**: Introduce new message IDs while the old ones still exist, then phase out client-sent `mission_spawn_wave` after the frontend presenter is deployed. Provide temporary dual-handling to avoid breaking older clients during rollout.

## Proto Work Items

- Define new messages in `proto/ws_messages.proto` (snapshot + delta + encounter events) and regenerate TypeScript/Go bindings.
- Update websocket handlers to publish the new messages from the backend director and to consume them on the client.
- Remove client emission paths for `mission_spawn_wave` once the new authoritative flow is verified.
