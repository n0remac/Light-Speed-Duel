# Phase 5 – Validation

- Visual
  - Dashes/animation speed, selection highlight, waypoint sizes identical for ship/missile.

- Interaction
  - Set/select/drag waypoints and legs (mouse + touch) for both contexts.

- Heat
  - Consistent thresholds (safe/warn/overheat) and projected values across ship/missile.
  - Planned ship heat bar matches shared projection.

- Behavior
  - Missile multi-route UI/launch unaffected; only planning logic unified.
  - No performance regressions with typical route sizes.

- Manual checks
  - Shortcuts: 1/2, T/E, [,], N/L, Delete/Backspace.
  - Zoom/pan alignment of hit-tests and draw.
  - No console errors; remove dead code.

