# Sub‑Plan 4 — Route Planner & Preview Simulation

**Goal:** Add strategic planning tools: dual‑line heat bar (planned vs actual), local preview sim, and quick actions.

---

## Scope
- **Dual‑line heat bar** under the speed slider:
  - **Planned heat** (lighter red): cumulative projection across the full planned route.
  - **Actual heat** (darker red): live server value.
- Local forward **preview simulator** using current kinematics & heat formula.
- Quick actions: **Insert cool‑down** and **Slow this leg**.
- Optional waypoint metadata: `speedBand`, `waitMs` (server tolerant).

---

## Files & Touch Points
- `web/src/planner/preview.ts` — deterministic preview integrator (dt≈50–100ms).
- `web/src/ui/planner/HeatTimeline.tsx` — dual‑line sparkline aligned to legs & waits.
- `web/src/ui/planner/QuickActions.tsx` — buttons to insert waits / lower band.
- `web/src/net/messages.ts` — optional waypoint metadata (client‑only for now).
- Server parser: safely ignore unknown fields or record them for later.

---

## Preview Integrator (pseudo)
```ts
function simulatePreview(state, route, constants, dt=0.1) {
  let pos = state.pos.clone(), vel = state.vel.clone();
  let heat = state.heat.value;
  const samples: number[] = [];
  let t = 0;

  for (const leg of expandRoute(route)) {
    const targetSpeed = speedForBandOrGlobal(leg, constants);
    const accel = accelToward(vel, targetSpeed, constants.maxAccel);
    for (let i=0; i<leg.duration/dt; i++) {
      vel = stepVelocity(vel, accel, dt, constants);
      const v = mag(vel);
      const dev = v - constants.markerSpeed;
      const hdot = dev >= 0
        ? constants.kUp * Math.pow(dev/Math.max(constants.markerSpeed, 1e-6), constants.exp)
        : -constants.kDown * Math.pow(Math.abs(dev)/Math.max(constants.markerSpeed, 1e-6), constants.exp);
      heat = clamp(heat + hdot*dt, 0, constants.max);
      samples.push(heat);
      t += dt;
    }
    // waits (cooling windows)
    const wait = leg.waitSec ?? 0;
    for (let i=0; i<wait/dt; i++) {
      const dev = 0 - constants.markerSpeed; // assume v≈0 → strong cooling
      const hdot = -constants.kDown * Math.pow(1, constants.exp);
      heat = clamp(heat + hdot*dt, 0, constants.max);
      samples.push(heat);
      t += dt;
    }
  }
  return samples;
}
```

---

## UI Behavior
- The **planned** line updates **immediately** when legs are added/removed (cumulative).
- If the planned trace crosses Overheat, show **“Will Stall”** on that segment.
- Clicking **Insert cool‑down** adds `waitMs` to the hottest segment until safe.
- Clicking **Slow this leg** reduces that leg’s `speedBand` (sprint→cruise→eco).

---

## Acceptance Criteria
- Dual‑line timeline renders; planned updates instantly on edits.
- Preview trends roughly match actual in flight (not exact).
- Quick actions produce safe plans in common cases.

---

## Rollback Plan
Feature flag `plannerHeatPreview`. If disabled, hide timeline and quick actions.
