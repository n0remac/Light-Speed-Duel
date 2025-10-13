# PLAN.md — Heat v1 for Continuous Waypoint Movement (Marker-Based)

**Goal:** Add a _heat-only_ system tuned to your existing continuous, waypoint-driven movement. Heat rises when flying **above** a speed “marker,” and dissipates when flying **below** it. The preview UI shows projected heat along planned legs. Overheating causes a **stall** (can see; cannot move) for a short period. Missile hits can randomly add heat. Upgrades later can raise the marker.

---

## Player-Facing Summary
- A **speed marker** appears on the ship speed slider.  
  - Fly **faster** than the marker → heat **accumulates**.  
  - Fly **slower** than the marker → heat **dissipates**.  
  - The farther from the marker, the stronger the effect.
- The route editor shows a **dual-line heat bar** under the speed slider:
  - **Planned heat (lighter red):** cumulative projected heat over the *entire planned route* (adds with each leg; removing a leg immediately reduces this line).
  - **Actual heat (darker red):** real heat measured in flight.
- If either line reaches **Overheat**, the ship will **stall** briefly.
- **Missile hits** may spike your heat unpredictably.
- **Upgrades** can raise the marker, letting you cruise faster without heating up.

---

## Core Model (Server-Authoritative)

We align with your continuous physics (accel/decel, velocity caps) and compute heat each tick from **actual** speed.

### Parameters
```go
// internal/game/heat.go
type HeatParams struct {
    Max             float64  // e.g., 100
    WarnAt          float64  // e.g., 70
    OverheatAt      float64  // e.g., 100
    StallSeconds    float64  // e.g., 2.5  (no thrust while stalling)
    MarkerSpeed     float64  // Vn: the neutral speed where net heat change = 0
    Exp             float64  // p: response exponent (e.g., 1.5 for smooth nonlinearity)
    KUp             float64  // scale when v > MarkerSpeed (heating)
    KDown           float64  // scale when v < MarkerSpeed (cooling, positive number)
    // Missile heat spike
    MissileSpikeChance float64 // 0..1
    MissileSpikeMin    float64 // min spike (heat units)
    MissileSpikeMax    float64 // max spike (heat units)
}
type HeatState struct {
    Value        float64 // current heat 0..Max
    StallUntil   float64 // gameTime when motion unfreezes; 0 if not stalling
}
type HeatComp struct {
    P HeatParams
    S HeatState
}
```

### Net Heat Change (per second)
Let `v = |velocity|`, `Vn = MarkerSpeed`, `dev = v - Vn`, `p = Exp`.
```
if dev >= 0:   Ḣ =  +KUp   * (dev / max(Vn, ε))^p
else:          Ḣ =  -KDown * (|dev| / max(Vn, ε))^p
```
- At the **marker** (`dev=0`), `Ḣ=0` → heat neither rises nor falls.
- Above the marker, heat rises; below, heat falls (dissipates).
- Choose `p ∈ [1.0, 2.0]` (1.5 default) to make the effect scale smoothly.
- You may clamp `v` with your existing max speed/accel controllers; heat uses the **actual** speed after physics.

**Integration per tick (dt):**
```go
S.Value += Hdot * dt
S.Value = clamp(S.Value, 0, P.Max)
if S.Value >= P.OverheatAt && now >= S.StallUntil {
    S.StallUntil = now + P.StallSeconds
}
```
**Stall behavior:**
- While `now < StallUntil`: reject thrust/boost; leave sensors/camera enabled.
- End automatically when `now ≥ StallUntil`.

### Missile Heat Spikes
On missile hit (server-side weapon impact handler):
```go
if rand.Float64() < P.MissileSpikeChance {
    spike := randBetween(P.MissileSpikeMin, P.MissileSpikeMax)
    S.Value = min(P.Max, S.Value + spike)
    if S.Value >= P.OverheatAt && now >= S.StallUntil {
        S.StallUntil = now + P.StallSeconds
    }
}
```
Spike values can later scale with missile type/damage.

---

## Waypoint & Speed Controls (No Protocol Breakage)

- Keep your existing **waypoint route** messages.  
- Optionally annotate waypoints with:
  ```ts
  type SpeedBand = "eco" | "cruise" | "sprint";
  type Waypoint = { x:number; y:number; speedBand?: SpeedBand; waitMs?: number };
  ```
  - The server maps `speedBand` → a **target speed** (cap) used by the existing controller; `waitMs` inserts dwell to cool.
  - If omitted, current behavior remains; unrecognized fields can be ignored for back-compat.
- A **global ship speed slider** (HUD) still works; the **marker** is shown on that slider. Per-leg speed bands override global when present.

---

## Client Preview Logic (Route Editor)

When editing a route, run a **local forward sim** (coarse) using:
- Current ship `pos, vel`,
- Server-broadcast heat constants (`MarkerSpeed`, `KUp`, `KDown`, `Exp`, `Max`, `WarnAt`, `OverheatAt`, `StallSeconds`),
- Kinematic caps (`maxAccel`, `maxSpeedFor(band)`),
- The planned waypoints with optional `speedBand`/`waitMs`.

**Sim step (every `dt_preview ≈ 50–100 ms`):**
1. Update desired speed from band/global slider target; apply your accel limits.
2. Update position/velocity.
3. Compute `dev = |v| - MarkerSpeed`, `Hdot` via formula above; integrate **projected** heat.
4. Record projected heat over time for the **heat bar** sparkline.

**UI: Dual-Line Heat Bar**
- Render **two overlaid traces** (same width as the speed slider):
  - **Planned Heat** (lighter red): time-aligned projection over the **entire planned route**; each added leg extends the line and adds cumulative heat. Removing a leg immediately shortens and lowers this line.
  - **Actual Heat** (darker red): the live heat from server snapshots.
- Segment the planned line by legs and waits (subtle tick marks); color any segment that crosses **OverheatAt** in red.
- If the planned line caps out at any time, show **“Will Stall”** warning; if the actual line caps, trigger **stall overlay**.
- Quick actions:
  - **Insert cool-down** at the hottest waypoint (`waitMs += Δ` until safe).
  - **Slow this leg** toggles the leg’s speed band down one step (e.g., sprint→cruise).

**Desync tolerance:** Preview is advisory; server recomputes from real motion.

---

## Snapshots (Server → Client)

Add a tiny view to ship state:
```go
type ShipHeatView struct {
    V  float64 // current heat
    M  float64 // max
    W  float64 // warnAt
    O  float64 // overheatAt
    MS float64 // markerSpeed
    SU float64 // stallUntil (server time seconds)
}
```
Client converts times to wall-clock using your existing time sync.

---

## Defaults (Starting Tuning)

```
Max = 100
WarnAt = 70
OverheatAt = 100
StallSeconds = 2.5

MarkerSpeed = match your current “comfortable cruise” (e.g., 600 in your units)
Exp = 1.5       // softer near the marker, harsher further away
KUp = 22.0      // heat build above marker
KDown = 16.0    // cooling below marker (smaller in magnitude to keep heat meaningful)

MissileSpikeChance = 0.35
MissileSpikeMin    = 6.0
MissileSpikeMax    = 18.0
```
**Intent:** cruising right at the marker is neutral; short sprints above it push you into **Warn** after a few sustained seconds; dipping below marker cools steadily but not instantly.

---

## Upgrades (Later)

- **Cooling Fins:** raise `MarkerSpeed` by +10–20% (the marker tick slides right).
- **Thermal Mass:** increase `Max` and `OverheatAt` together.
- **Shock Gel:** reduce missile spike chance and/or spike size.
- **Efficient Thrusters:** reduce `KUp` (less heat above marker).

All upgrades are parameter changes—no code path changes.

---

## ECS / Systems Checklist

**Server (Go)**
- [ ] Add `HeatComp` with params/state; attach to ship entity.
- [ ] On tick: compute `Ḣ` from actual speed; integrate; handle stall.
- [ ] In movement system: while stalled, clamp thrust/accel to zero; ignore route edits or queue them (your call).
- [ ] On missile hit: apply spike by chance.
- [ ] Include `ShipHeatView` in snapshots.
- [ ] Expose params via room/world config (JSON or flags).

**Client (TS)**
- [ ] Add `HeatView` to `AppState/UIState`; render HUD heat bar with warn/red zones and stall overlay.
- [ ] Speed slider with **marker tick**; tooltip shows exact marker speed.
- [ ] Planner preview sim; draw **dual-line heat bar** (planned vs actual). Planned line updates cumulatively with each added leg and drops immediately when a leg is removed.
- [ ] Quick actions: “Insert cool-down”, “Slow this leg”.
- [ ] Parse `ShipHeatView` from WS; convert `stallUntil` using time sync.

**Bots**
- [ ] Use same preview routine to evaluate routes.
- [ ] Prefer plans staying below `WarnAt`; insert `waitMs` if needed.
- [ ] If stalled, keep heading; on recovery, replan.

**Tutorial**
- [ ] “Find the marker and cruise neutral.”
- [ ] “Sprint to heat up; dip below to cool.”
- [ ] “Read the two-line heat bar; keep the **planned** below red.”
- [ ] “Trigger and recover from a stall.”
- [ ] “Use waits/speed bands to keep plans safe.”

**Tests**
- [ ] Unit tests for Ḣ symmetry and stall threshold.
- [ ] Sim tests: routes that should/shouldn’t stall.
- [ ] UI snapshot tests for marker/dual-line heat bar visuals.

---

## Why this fits now
- Perfectly matches your continuous waypoint physics—no jump/teleport mechanics added.
- Backward compatible messaging; optional waypoint metadata only.
- Clear, learnable rhythm: **neutral → sprint → cool**, guided by the **marker** and reinforced by the **dual-line heat bar** (planned vs actual).
- Future-proof for upgrades and later FTL layers by adjusting parameters, not core logic.
