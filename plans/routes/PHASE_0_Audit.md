# Phase 0 – Audit

- Compare ship vs missile implementations:
  - Builders: `computeRoutePoints` vs `computeMissileRoutePoints`.
  - Hit-tests: `hitTestRoute` vs `hitTestMissileRoutes`.
  - Renderers: `drawRoute` vs `drawMissileRoute` (colors, widths, dashes, selection).
  - Heat: ship `estimateHeatChange` vs missile `projectMissileHeat` (state.ts).
  - Animations: `updateDashOffsetsForRoute` is already generic.
- Outcome: Identify duplicated logic and confirm Ship Planning visuals/behavior as the source of truth to unify against.

