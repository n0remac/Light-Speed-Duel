# Phase 1 – Shared Model & Helpers (route.ts)

Create `internal/server/web/src/route.ts` exporting:

- Types
  - `RouteWaypoint = { x: number; y: number; speed?: number }`.
  - `RoutePoints = { waypoints: RouteWaypoint[]; worldPoints: {x:number;y:number}[]; canvasPoints: {x:number;y:number}[] }`.

- Builders
  - `buildRoutePoints(start: {x:number;y:number}, waypoints: RouteWaypoint[], world: {w:number;h:number}, camera: () => {x:number;y:number}, zoom: () => number, worldToCanvas: (p) => {x:number;y:number}): RoutePoints`.

- Geometry/Hit-test
  - `pointSegmentDistance(p, a, b)`.
  - `hitTestRouteGeneric(canvasPoint, routePoints, opts)` → `{ type: 'waypoint' | 'leg', index } | null`.
  - Constants: `WAYPOINT_HIT_RADIUS`, `LEG_HIT_DISTANCE` (same for ship/missile).

- Dash Animation
  - Move `updateDashOffsetsForRoute(store, waypoints, worldPoints, canvasPoints, fallbackSpeed, dtSeconds, cycle)` out of `game.ts` (keep signature).

- Heat Projection (generic)
  - `projectRouteHeat(route: RouteWaypoint[], initialHeat: number, params: { markerSpeed; kUp; kDown; exp; max; overheatAt; warnAt })`
    → `{ heatAtWaypoints: number[], willOverheat: boolean, overheatAt?: number }`.
  - Optional compatibility wrapper: `projectMissileHeatCompat(route, defaultSpeed, heatParams)`.

Notes
- Import and reuse `clamp` from `state.ts`.
- Do not bake missile limits into route.ts; pass values in from callers.

