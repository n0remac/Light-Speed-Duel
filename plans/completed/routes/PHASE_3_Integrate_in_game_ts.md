# Phase 3 – Integrate in game.ts

- Builders
  - Replace `computeRoutePoints` and `computeMissileRoutePoints` with `buildRoutePoints`.

- Hit-tests
  - Ship: use `hitTestRouteGeneric`.
  - Missile: loop routes, call `hitTestRouteGeneric`, choose nearest by pointer distance, tie-break by ship distance; map to selection.

- Renderers
  - `drawRoute` → call `drawPlannedRoute` with ship palette.
  - `drawMissileRoute` → call `drawPlannedRoute` with missile palette.

- Heat projection
  - Use `projectRouteHeat` for both planned ship heat and missile preview.
  - Remove ship-specific `estimateHeatChange` in favor of the shared helper.

- Animations
  - Use `updateDashOffsetsForRoute` from `route.ts` for both.

- Defaults/limits
  - Keep missile speed clamping in UI layer; pass effective speed to shared helpers.

