# Phase 3 – Progression & Rewards

## Goals

- Tie beacon completion to tangible ship growth through upgrades, items, or DAG progression.
- Scale encounter difficulty in tandem with player power while protecting survivability.
- Persist campaign progress so players can resume a run without replaying earlier beacons.

## Key Deliverables

- Reward catalogue mapping mission outcomes to DAG nodes, inventory items, or currency tokens.
- Choice-based reward presentation for key beacons, allowing players to tailor builds.
- Difficulty scaling curves that adjust encounter budgets, spawn templates, or hazard intensity based on cleared beacon count and upgrade loadout.
- Save/resume payload capturing per-player beacon states, mission history, and earned rewards.

## Backend Focus

- Expand `internal/dag` hooks to support beacon-driven unlocks and repeatable reward nodes.
- New `internal/game/rewards.go` (or similar) handling reward selection logic, validation, and serialization.
- Persistence layer storing campaign snapshots keyed by player or session identifiers; integrate with existing room lifecycle.
- Campaign director updates to read current power level and push scaled encounter configs to beacon events.

## Frontend Focus

- UI for reward choice popups integrated with `upgrades.ts` and the event bus; ensure non-blocking behaviour for ongoing combat.
- Visual indicators of campaign tier or threat level so players understand rising stakes.
- State serialization/deserialization helpers for client-side resume when server signals restored progress.

## Dependencies & Risks

- Requires stable mission flow from Phase 2 to avoid awarding duplicate rewards.
- Balancing scaling curves demands telemetry (Phase 5) but initial heuristics must prevent overwhelming players.
