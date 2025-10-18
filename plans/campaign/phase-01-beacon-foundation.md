# Phase 1 – Beacon Foundation

## Goals

- Establish deterministic beacon placement across the map with sparse, evenly spaced distribution.
- Track beacon discovery/activation state on the authoritative server while keeping perception cues consistent with light-delay mechanics.
- Lay groundwork for future pacing by introducing a lightweight campaign director loop that monitors active encounters.

## Key Deliverables

- Poisson-disc or jittered grid placement producing configurable density and minimum spacing.
- Beacon data model covering identifiers, world position, trigger radii, available event types, cooldowns, and per-player state overlays.
- Discovery and activation lifecycle that fires on server-confirmed position checks and broadcasts perception-friendly feedback (e.g., wavefront cues).
- Basic director loop that enforces limits on simultaneous beacon activations and sets encounter budgets for later phases.

## Backend Focus

- New `internal/game/beacons.go` for placement, indexing, and lifecycle helpers.
- Extend room initialization to seed beacon sets deterministically per session and expose them to the simulation/world state.
- Authoritative trigger checks inside simulation tick; ensure trigger timing accounts for observer distance when notifying clients.
- Director scaffolding that captures encounter slots without yet spawning content.

## Frontend Focus

- Minimal representation of beacon locations within app state (positions, discovered flags) and canvas markers for discovered beacons.
- Visual/audio feedback hooks that can later be styled without reworking networking payloads.
- Event bus topics such as `beacon:discovered` and `beacon:activated` to decouple UI from networking.

## Dependencies & Risks

- Requires consensus on map bounds or region layout to tune spacing.
- Perception-aware feedback needs coordination with rendering teams to avoid confusing latency cues.
