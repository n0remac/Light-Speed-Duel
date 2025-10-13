# Sub‑Plan 4 — Route Planner & Preview

Goal: Add a forward projection of heat that updates as the user edits the route, and visualize it alongside actual heat. Keep the UI minimal and performant.

---

## Scope
- Dual‑meter heat UI under the speed slider:
  - Planned heat (lighter red): projected maximum heat over the current route.
  - Actual heat (darker): live server heat.
- Client‑side projection using the server’s heat constants:
  - current model is constant‑speed per leg (matches server movement today).
  - integrate the existing formula to estimate final/max heat across legs.
- Optional: later, replace with a time‑sparkline when acceleration/advanced preview is introduced.

---

## Files & Touch Points
- `internal/server/dto.go` `shipHeatViewDTO`: include `ku`, `kd`, `ex` so the client can project heat correctly.
- `internal/server/ws.go`: populate the new fields in the heat view.
- `web/src/state.ts`: extend `HeatView` with `kUp`, `kDown`, `exp`.
- `web/src/net.ts`: parse new constants; remove debug logging.
- `web/src/game.ts`: compute projected max heat for the current route and render a planned underlay bar.
- `web/index.html` & CSS: add a planned underlay element to the heat bar.

---

## Projection (constant‑speed per leg)
Assumptions: server movement applies leg speed immediately; no accel.

For each leg from current pos → wp[i]:
- `duration = distance / speed`
- `dev = speed - markerSpeed`
- `Ḣ = dev >= 0 ? kUp*(dev/Vn)^exp : -kDown*(|dev|/Vn)^exp` with `Vn=max(markerSpeed,1e-6)`
- `heat = clamp(heat + Ḣ*duration, 0, max)`
- Track `maxHeat` encountered across all legs

UI uses `maxHeat` as the planned meter value. It increases as legs are added; may cap at Max/Overheat.

---

## UI Behavior
- The planned underlay expands immediately on route edits (add/update/clear). Slower routes will lessen the planned heat.
- Actual heat overlays on top; as the ship moves/fights, it grows and can catch up/surpass if plan changes mid‑flight.
- Stall: if actual reaches Overheat, overlay appears as in Sub‑Plan 3; planned may already indicate risk.

---

## Acceptance Criteria
- Planned underlay appears and updates as waypoints change.
- Underlay respects heat constants and uses the same formula.
- Actual meter remains smooth and accurate.
- Marker tick remains visible and clamped to slider bounds.

---

## Rollback Plan
Feature flag or graceful degradation: if `heat` view/fields are missing, hide planned underlay and keep actual heat bar only.
