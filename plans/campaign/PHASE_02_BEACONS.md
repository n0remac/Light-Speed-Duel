# Phase 2 – Beacons & Hold Logic

Scope
- Implement a sequence of four beacons (B1→B4) revealed one at a time.
- Player must enter the beacon ring and hold for 10 seconds to lock it.
- After locking a beacon, reveal the next one further to the right.
- Stall resets the current hold timer; exiting the ring also resets.

Beacon Layout (huge map)
- B1: center (15% W, 55% H), radius 420, hold 10s
- B2: center (40% W, 50% H), radius 360, hold 10s
- B3: center (65% W, 47% H), radius 300, hold 10s
- B4: center (85% W, 44% H), radius 260, hold 10s

Client Mission Controller
- State: `beaconIndex (0..4), holdSeconds, holdAccum, insideRing, stalled`.
- On `state:updated`, compute `insideRing` (distance to current beacon <= radius) and `stalled` from heat view.
- If `insideRing && !stalled`, increment `holdAccum` by dt; else reset to 0.
- When `holdAccum >= 10`, emit `mission:beacon-locked` with index (1..4), advance `beaconIndex`, reset `holdAccum`.
- Update Mission HUD with current index (n/4) and hold progress.

Pseudocode
```
on tick/state:updated:
  b = beacons[beaconIndex]
  if not b: emit('mission:completed'); return
  inside = dist(state.me, b.center) <= b.radius
  stalled = state.me.heat && (nowMs < state.me.heat.stallUntilMs)
  if inside and not stalled:
    hold += dt
  else:
    hold = 0
  if hold >= 10:
    emit('mission:beacon-locked', { index: beaconIndex+1 })
    beaconIndex += 1
    hold = 0
```

Persistence
- Store `beaconIndex` and partial `holdAccum` in localStorage (keyed by room/mission) to recover progress.

Deliverables
- Beacons appear sequentially and lock with a 10s hold requirement.
- Mission HUD shows live hold countdown.
- Emits `mission:beacon-locked` bus events for later phases.

