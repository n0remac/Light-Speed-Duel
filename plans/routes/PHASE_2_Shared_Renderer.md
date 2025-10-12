# Phase 2 – Shared Renderer

Implement `drawPlannedRoute(ctx, opts)` in `route.ts`.

- Inputs
  - `start`, `waypoints`, `selection`, `dashStore`, `palette`, `show`, `heatParams?`, `defaultSpeed`.

- Behavior
  - Ship-style visuals for both: dashed segments, selection emphasis, consistent line widths.
  - Heat-based coloring using unified interpolation/threshold semantics; allow palette override for missile accent.
  - Draw waypoint markers with unified sizing and selection styling.

