# Sub‑Plan 1 — Core Heat System (Server Foundation)

**Goal:** Implement a server‑authoritative, marker‑based heat model that integrates with the continuous waypoint physics. No UI yet.

---

## Scope
- Add `HeatParams`, `HeatState`, `HeatComp` to ECS.
- Compute heat from **actual speed** each tick (marker model).
- Enforce **stall** (movement disabled; sensors allowed).
- Unit tests for the heat math and stall threshold.
- No client/UI changes yet (verify by logs and tests).

---

## Files & Touch Points
- `internal/game/heat.go` (new): data structures + update logic
- `internal/game/ship.go` (or where Ship entity lives): add `HeatComp`
- `internal/game/systems.go` (or movement / tick loop): call `UpdateHeat`
- `internal/server/…` (no changes yet)
- `internal/game/tests/heat_test.go` (new): unit tests

---

## Data Model (Go)
```go
// internal/game/heat.go
package game

import "math"

type HeatParams struct {
    Max             float64  // 100
    WarnAt          float64  // 70
    OverheatAt      float64  // 100
    StallSeconds    float64  // 2.5
    MarkerSpeed     float64  // neutral speed (Vn)
    Exp             float64  // 1.5
    KUp             float64  // 22.0
    KDown           float64  // 16.0
    MissileSpikeChance float64 // reserved for Sub‑Plan 5
    MissileSpikeMin    float64
    MissileSpikeMax    float64
}

type HeatState struct {
    Value      float64 // 0..Max
    StallUntil float64 // gameTime seconds; 0 if not stalling
}

type HeatComp struct {
    P HeatParams
    S HeatState
}

func (h *HeatComp) IsStalled(now float64) bool {
    return now < h.S.StallUntil
}

func UpdateHeat(h *HeatComp, speed float64, dt, now float64) {
    Vn := math.Max(h.P.MarkerSpeed, 1e-6)
    dev := speed - Vn
    p := h.P.Exp
    hdot := 0.0
    if dev >= 0 {
        hdot = h.P.KUp * math.Pow(dev/Vn, p)
    } else {
        hdot = -h.P.KDown * math.Pow(math.Abs(dev)/Vn, p)
    }
    h.S.Value += hdot * dt
    if h.S.Value < 0 { h.S.Value = 0 }
    if h.S.Value > h.P.Max { h.S.Value = h.P.Max }
    if h.S.Value >= h.P.OverheatAt && now >= h.S.StallUntil {
        h.S.StallUntil = now + h.P.StallSeconds
    }
}
```

**Ship integration (example):**
```go
// during world init or ship spawn
ship.Heat = HeatComp{
    P: HeatParams{
        Max:100, WarnAt:70, OverheatAt:100, StallSeconds:2.5,
        MarkerSpeed:600, Exp:1.5, KUp:22.0, KDown:16.0,
    },
}

// in tick loop
speed := ship.Vel.Length()
UpdateHeat(&ship.Heat, speed, dt, now)

// in movement application (before accel/thrust)
if ship.Heat.IsStalled(now) {
    ship.Accel = Vec2{0,0} // or clamp thrust to zero
    // optionally queue/ignore incoming waypoint edits while stalled
}
```

---

## Unit Tests
- `TestHeatNeutralAtMarker` — speed==MarkerSpeed → no net change.
- `TestHeatAboveMarkerAccumulates` — monotonic increase; rate grows with (speed‑Vn).
- `TestHeatBelowMarkerDissipates` — monotonic decrease; bounded at 0.
- `TestStallTriggersAtOverheat` — when value crosses `OverheatAt`, `StallUntil` is set.
- `TestClampAtMax` — heat never exceeds `Max`.

Skeleton:
```go
func TestHeatNeutralAtMarker(t *testing.T) { /* … */ }
func TestHeatAboveMarkerAccumulates(t *testing.T) { /* … */ }
func TestHeatBelowMarkerDissipates(t *testing.T) { /* … */ }
func TestStallTriggersAtOverheat(t *testing.T) { /* … */ }
func TestClampAtMax(t *testing.T) { /* … */ }
```

---

## Acceptance Criteria
- Server compiles; ships have `HeatComp` with defaults.
- With speed==MarkerSpeed, heat curve is flat in logs.
- With prolonged speed > MarkerSpeed, heat reaches Overheat and sets Stall.
- While stalled, movement/thrust is disabled.
- All unit tests pass.

---

## Rollback Plan
Feature behind a room flag (e.g., `enableHeat`). If issues, disable flag to restore prior behavior.
