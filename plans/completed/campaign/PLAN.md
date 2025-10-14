# Campaign – Mission 1: Signal in the Static

Mission goal: Follow a glitchy distress beacon by progressing through a sequence of four beacons. Each beacon appears one at a time; the player must fly into its ring and hold for 10 seconds to “lock” it, then the next beacon appears further right. As the player advances, missile hazards scale up in number, speed, range, and heat capacity. This teaches route plotting/editing first, then heat management while dodging missiles.

Use the phase sub‑plans below for implementation details and task breakdowns.

## Implementation Status & Dependencies

### ✅ Ready Systems (Existing Codebase)
- Heat system (client + server with full projection)
- Missile launching with custom heat parameters
- Dynamic map sizing (huge maps supported)
- Story & tutorial engines (mature, working)
- Event bus architecture

### ❌ Required New Systems (Must Build)
- Mission controller & beacon tracking logic
- Beacon rendering system
- Mission HUD overlay
- Hazard wave spawning helpers (server-side)
- Neutral missile ownership support
- Mode-based spawn positioning
- Campaign story chapter (blocked by DAG migration)

## Phases
- Phase 1 – Map & Bootstrap: PHASE_01_MAP_BOOTSTRAP.md
  - **Includes precursor tasks** for foundational systems
  - Estimated: 8-10 hours
- Phase 2 – Beacons & Hold Logic: PHASE_02_BEACONS.md
  - Estimated: 2-3 hours
- Phase 3 – Hazard Waves: PHASE_03_HAZARDS.md
  - Estimated: 3-4 hours
- Phase 4 – Story & Tutorial Beats: PHASE_04_STORY_TUTORIAL.md
  - **BLOCKED**: Requires `plans/dag/STORY.md` migration decision
  - Estimated: TBD (depends on architecture choice)
- Phase 5 – Polish & QA: PHASE_05_POLISH_QA.md
  - Estimated: 4-6 hours

**Total estimated work**: 17-23 hours (excluding Phase 4 until story architecture finalized)

## Learning Goals
- Plot and edit ship routes (add/move/delete waypoints; select legs; adjust leg speeds).
- Read and manage heat (marker speed, warn/overheat, stall and recovery).
- Navigate under pressure from increasing missile hazards.

## Player Flow (High-Level)
1) Briefing overlay introduces a corrupted beacon; Beacon B1 appears on the left‑to‑right path.
2) Player reaches B1 and holds inside its ring for 10 seconds. Beacon message clarity improves; Beacon B2 appears further right.
3) Repeat for B2 → B3 → B4, with hazard waves escalating between each beacon. Each beacon requires a 10‑second hold to lock.

Completion: Lock B4 (10s hold) without dying. Optional bonus: complete with ≤1 stall overall.

## Beacon Narrative Beats (sample lines)
- Far range (A): “–gnal… —issus… co–dinates… [garbled tone]”
- Mid range (B): “Signal improving… possible survivors… coordinates uplink unstable.”
- Near range (C start): “Beacon lock… caution: debris field… recommend low-thrust approach.”
- Completion: “Unit-0, you found us. Archives unlocked… uploading next route.”

Delivery: Use story overlay nodes triggered by mission events: mission-start, beacon-locked(1..4), mission-complete.

## Objectives & Triggers
- B1: Reach and Hold (centerB1, radiusB1, 10s)
  - Trigger: inside ring accumulates timer; resets on exit or stall (configurable)
  - Teach: route plotting, leg selection, speed changes
- B2: Reach and Hold (centerB2, radiusB2, 10s)
  - Trigger: on lock → spawn Hazard Wave 2
  - Teach: editing route mid-flight; heat marker alignment
- B3: Reach and Hold (centerB3, radiusB3, 10s)
  - Trigger: on lock → spawn Hazard Wave 3
  - Teach: low-heat cruising; evasive routing
- B4: Reach and Hold (centerB4, radiusB4, 10s)
  - Trigger: on lock → mission complete
  - Teach: sustained heat management under pressure

Failure/Retry rules:
- Soft fail: If player stalls during the C hold, the hold timer resets (optionally show a hint). If HP reaches 0, respawn at previous objective’s edge and keep mission state.

## Hazard Design (by beacon wave)

Missiles act as hazards (“mines” and light seekers). With each locked beacon, spawn the next wave with higher pressure: more units, higher speeds, larger agro, and higher heat capacity.

- Wave 1 (B1→B2 path):
  - Mines: stationary missiles (agro 0), long lifetime, low heat capacity (Max/Overheat ≈ 40)
  - Count: sparse (e.g., 18–24 distributed in a corridor)
  - Purpose: teach careful pathing

- Wave 2 (B2→B3 path):
  - Mines: denser cluster; add slow patrollers (speed 20–40, agro ~300)
  - Heat capacity: medium (Max/Overheat ≈ 50)
  - Count: medium density (e.g., 28–36)
  - Purpose: route edits mid-flight; heat marker alignment

- Wave 3 (B3→B4 path):
  - Seekers: few slow‑to‑medium (speed 60–100), agro 600–900; plus some mines
  - Heat capacity: high (Max/Overheat ≈ 60–70) to persist
  - Count: light but threatening (e.g., 6–10 seekers + mines)
  - Purpose: evasive routing under sustained pressure

Tuning knobs per wave:
- speed (missile MaxSpeed)
- agro_radius
- lifetime
- heat params: max, warnAt, overheatAt, markerSpeed, kUp/kDown

## Map & Parameters (suggested defaults)
- Map size: 32000 × 18000 (huge)
- Player spawn: left side, around (8% W, 50% H)
- Beacons (left → right):
  - B1: center (15% W, 55% H), radius 420, hold 10s
  - B2: center (40% W, 50% H), radius 360, hold 10s
  - B3: center (65% W, 47% H), radius 300, hold 10s
  - B4: center (85% W, 44% H), radius 260, hold 10s

## Integration With Existing Systems

Frontend
- Mission Engine (lightweight controller):
  - Watches `state:updated` and bus events to evaluate objectives and beacon hold timers.
  - Emits: `mission:beacon-locked` (1..4), `mission:completed`, and updates a small HUD (“Lock Beacon 2: 7.3s”).
  - Drives story overlay by emitting story triggers or by having the story engine subscribe to mission events.
- Overlay: add chapter “Signal in the Static” with nodes for B1/B2/B3/B4 beats and completion.

Backend
- Hazard spawns: server helper APIs to create mines/seekers:
  - `mission_spawn_minefield(cx, cy, count, radius, heatPreset)`
  - `mission_spawn_seekers(cx, cy, count, ring, heatPreset)`
  - Internally use `LaunchMissile` with waypoints anchored near spawn; agro 0 for mines; moderate agro for seekers; per‑ring heat params.
  - Ownership: neutral or dedicated “mission” owner so they threaten all players.

Minimal alternative (interim):
- Use a WS debug message to spawn hazards with parameters (no general mission system yet).
- Hardcode wave spawns when a mission room starts (on first connection with mode=campaign&mission=1).

## Objective Evaluation (pseudo)
```
on tick/state:updated:
  pos = {x: state.me.x, y: state.me.y}
  stalled = state.me.heat && (nowMs < state.me.heat.stallUntilMs)
  if beaconIndex < 4:
    beacon = beacons[beaconIndex]
    if inside(pos, beacon.circle):
      if not stalled:
        hold += dt
      else:
        hold = 0
      if hold >= 10s:
        emit('mission:beacon-locked', { index: beaconIndex+1 })
        beaconIndex += 1
        hold = 0
        spawnHazardWave(beaconIndex) // 1→2→3 as we progress
    else:
      hold = 0
  else:
    emit('mission:completed')
```

Stall detection: derive from state.me.heat.stallUntilMs > now; also listen to `heat:stallTriggered` bus event for hints.

## Story Wiring
- Add chapter file: `internal/server/web/src/story/chapters/campaign_signal.ts` (id: `signal-static-1`).
- Triggers:
  - immediate: intro after start gate
  - on `mission:beacon-locked(1..4)` → progressively clearer lines
  - on `mission:completed` → final line

## Tuning Table (starting points)
- Wave 1 mines: {speed: 0–20, agro: 0, lifetime: 120–160s, heat: max 40, warn 28, overheat 40, marker 60, kUp 20, kDown 14}
- Wave 2 mix: {speed: 0–60, agro: 0–300, lifetime: 160–200s, heat: max 50, warn 35, overheat 50, marker 100, kUp 24, kDown 12}
- Wave 3 seekers: {speed: 80–120, agro: 600–900, lifetime: 200–260s, heat: max 60–70, warn 42–49, overheat 60–70, marker 120, kUp 20, kDown 15}

## Success, Failure, and Hints
- Success: Hold at C for 8s (no stall resets) → completion overlay and unlock next mission.
- Failure: HP reaches 0 → respawn near last completed objective, hazards persist.
- Hints: if two stalls occur within 20s, show overlay tip about matching marker speed and easing throttle.

## Phase Links
- See PHASE_01_MAP_BOOTSTRAP.md for map/bootstrap tasks.
- See PHASE_02_BEACONS.md for beacon sequence and hold logic.
- See PHASE_03_HAZARDS.md for hazard wave specs and tuning.
- See PHASE_04_STORY_TUTORIAL.md for story/tutorial wiring.
- See PHASE_05_POLISH_QA.md for polish/QA items.

## Access & Scope
- **Campaign mode accessible ONLY via lobby campaign button**
- Previous campaign content will be removed/replaced
- Lobby campaign button forces `mode=campaign&mission=1` with huge map (32000×18000)
- No map size selection for campaign (always huge)

## Open Questions
- Should stalls during holds fail the mission or only reset the hold timer? (Plan: reset only.)
- Persist mission progress across reconnects? (Plan: store locally like story + re-request hazard spawns.)
- Multiplayer in campaign rooms? (Plan: single‑player for now.)

## Story Integration - DEFERRED
**Note**: Story beats for Mission 1 are deferred pending resolution of `plans/dag/STORY.md` migration plan. The story system is transitioning from client-only (browser storage) to server-authoritative DAG-based progression. Campaign story implementation will proceed once architecture is finalized.

**Impact**: Phases 1-3 can proceed independently. Phase 4 is blocked until story architecture decision is made.
