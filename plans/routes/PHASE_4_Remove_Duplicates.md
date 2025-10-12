# Phase 4 – Remove Duplicates from game.ts

- Remove or shim then delete:
  - `computeRoutePoints`, `computeMissileRoutePoints`.
  - `hitTestMissileRoutes` (use generic + route loop).
  - `estimateHeatChange` and duplicate `interpolateColor` (centralize).
  - Old `drawMissileRoute` and missile-specific drawing logic (replace with shared call).
  - Route-specific constants for hit radii/distances.

- Cleanup
  - Remove unused imports and local helpers.

