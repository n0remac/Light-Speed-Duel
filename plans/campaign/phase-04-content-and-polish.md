# Phase 4 – Content & Polish

## Goals

- Populate the beacon network with varied encounters, story beats, and audio/visual polish that reinforce the campaign loop.
- Blend hazard, combat, and support beacons into curated arcs while keeping replayability through deterministic randomness.
- Integrate narrative and tutorial guidance to introduce new mechanics as the campaign unfolds.

## Key Deliverables

- Spawn tables for missile fields, patrol waves, support stations, and boss-style beacons with scripted pacing.
- Story/dialogue events tied to milestone beacons plus optional branching choices affecting later encounters.
- Audio stingers and ambience layers for beacon discovery, activation, mission completion, and reward claim moments.
- Tutorial refresh covering beacon mechanics, mission flow, and upgrade selection.

## Backend Focus

- Data-driven event scripts combining Conditions (onEnter, onClear, afterWave) and Actions (spawn, despawn, dialogue, reward).
- Additional AI behaviours or waypoint patterns for new bot archetypes referenced in spawn tables.
- Director enhancements to schedule content mixes, enforce cooldowns, and avoid repetitive beacon types in quick succession.

## Frontend Focus

- Canvas overlays for beacon-specific hazards, story vignettes, and mission hints.
- Dialogue/story UI updates in `story/` namespace to trigger from beacon events without blocking gameplay.
- Audio engine cues for the new event types, including stacking/ducking rules when multiple triggers fire.
- Optional map guidance (e.g., subtle trails) pointing to the next suggested beacon based on director hints.

## Dependencies & Risks

- Content creation cadence should be supported by tooling (preview commands, debug overlays) to avoid slow iteration.
- Narrative pacing must respect survivability thresholds; story moments cannot occur during overwhelming encounters.
