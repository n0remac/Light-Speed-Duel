# Phase 3 – Encounters & Spawn Tables

## Goals

- Expand the backend campaign director with reusable encounter templates for missile fields, patrol bots, seekers, and support drones.
- Introduce data-driven spawn tables that let designers compose encounter playlists per beacon without code changes.
- Tighten AI behaviours: patrol routing, engagement envelopes, cooldown/retreat logic, and coordinated wave sequencing.

## Key Deliverables

- Encounter template library (Go) describing spawn groups, waypoint generators, heat parameters, and cleanup hooks keyed by encounter ids.
- Spawn table config format (JSON/Proto) mapping beacon states to encounter templates, weights, and difficulty tiers.
- Authoritative encounter scheduler in the beacon director that activates templates, tracks live entity handles, and applies cooldown windows.
- Support for stacked encounters (e.g., patrol + minefield) with shared escalation logic and safe teardown when objectives complete or fail.
- Telemetry stubs capturing encounter lifecycle data (for future balancing) without surfacing full analytics tooling yet.
- Wrapper layer over existing `SpawnMinefield`, `SpawnPatrollers`, and `SpawnSeekers` helpers so legacy content slots into the new encounter-id pipeline without rewrite.

## Backend Focus

- Extend mission/beacon state to reference active encounter ids, spawn table selections, and timing budget.
- Implement waypoint/path generation utilities for patrol routes (loops, figure-eights, sweeps) and integrate with missile patrol AI, seeding deterministic paths instead of the current ad-hoc randomization.
- Add server-side behaviours for patrolling bots (route following, alert states) and seekers (ring spawns with focus targets).
- Ensure cleanup flows remove or recycle entities when encounters finish, preventing orphaned missiles after beacon completion.

## Frontend Focus

- Update client state models to show active encounter hints (iconography, heat zones) using data from the server.
- Provide debug overlays for designers to visualize patrol paths, spawn points, and encounter cooldown timers.
- Refine HUD cues so players can differentiate encounter types and anticipate patrol patterns.

## Dependencies & Risks

- Requires Phase 1 authoritative beacon state and Phase 2 mission pipelines to be stable; encounter hooks will attach to those systems.
- Spawn table tooling must stay synchronized between designers and engineers; consider validation scripts to catch schema drift.
- Increased entity counts may expose performance hotspots; profiling hooks should be laid down early.
