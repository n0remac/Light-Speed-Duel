# Campaign Overhaul Plan

## Vision

Build a beacon-to-beacon campaign loop that scatters sparse, evenly spaced beacons across the map. Each beacon becomes a pacing anchor that can trigger encounters, issue missions, and hand out upgrades so the player advances through increasingly challenging zones while struggling to stay alive.

## Guiding Principles

- Respect light-delay perception in every new interaction so the campaign still feels consistent with core game physics.
- Keep the server authoritative: all beacon triggers, missions, and rewards originate on the Go backend.
- Drive variety with data rather than hardcoded behaviour; strive for deterministic generation seeded per session.
- Scale difficulty slightly ahead of player power while avoiding sudden death spikes.

## Phase Breakdown

- [Phase 1 – Beacon Foundation](phase-01-beacon-foundation.md)
- [Phase 2 – Mission Templates & UI](phase-02-missions-and-ui.md)
- [Phase 3 – Encounters & Spawn Tables](phase-03-encounters-and-spawn-tables.md)

## Supporting Threads

- Networking: Extend protobuf schema and WS handlers alongside phase-specific work.
- Persistence: Store per-player beacon and mission state early to make later phases easier.
- QA: Build a lightweight simulation harness to iterate on pacing and survivability throughout development.
