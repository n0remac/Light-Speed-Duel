# Route Planning Unification Plan

## Overview
- Unify ship and missile route planning using the Ship Planning system design.
- Extract route planning, heat projection, hit-testing, and rendering out of `internal/server/web/src/game.ts` into `internal/server/web/src/route.ts`.
- Remove old/duplicate code from `game.ts` after integration.

## Scope
- Client web code only: `internal/server/web/src/`.
- Keep missile multi-route management and UI as-is; only unify planning/visualization/logic.

## Outcomes
- One shared route module powering both ship and missile planning.
- Identical interaction model: set/select/drag, leg animations, selection visuals.
- Consistent heat projection and coloring for both, parameterized by per-entity heat params.

---

## Phases

- Phase 0 – Audit
  - Compare builders, hit-tests, renderers, heat, and animations; confirm Ship Planning visuals as the standard.
  - See: plans/routes/PHASE_0_Audit.md

---

- Phase 1 – Shared Model & Helpers (route.ts)
  - Add shared types, builders, hit-test geometry, dash animation, and generic heat projection.
  - See: plans/routes/PHASE_1_Shared_Model_and_Helpers.md

---

- Phase 2 – Shared Renderer
  - Implement `drawPlannedRoute` in route.ts with ship visuals and optional palette override.
  - See: plans/routes/PHASE_2_Shared_Renderer.md

---

- Phase 3 – Integrate in game.ts
  - Wire builders, hit-tests, renderers, heat, and animations to route.ts.
  - See: plans/routes/PHASE_3_Integrate_in_game_ts.md

---

- Phase 4 – Remove Duplicates from game.ts
  - Delete old builders, hit-test, renderer, heat helpers, and constants now covered by route.ts.
  - See: plans/routes/PHASE_4_Remove_Duplicates.md

---

- Phase 5 – Validation
  - Verify visuals, interactions, heat behavior, and performance.
  - See: plans/routes/PHASE_5_Validation.md

---

## Deliverables
- `internal/server/web/src/route.ts` with shared helpers and renderer.
- `internal/server/web/src/game.ts` simplified to UI wiring + calls into route.ts.
- Old route/heat/hit-test/draw duplicates removed from `game.ts`.

## Acceptance Criteria
- Ship and missile routes behave and render identically per Ship Planning design.
- A single shared module (`route.ts`) owns route planning logic.
- No duplicated route logic remains in `game.ts`.

## Follow-ups (Optional)
- Add unit or visual tests for `route.ts` helpers.
- Document public API of `route.ts` in PROJECT.md.

## Appendix – route.ts API (initial)
- Types: `RouteWaypoint`, `RoutePoints`.
- Helpers: `buildRoutePoints`, `pointSegmentDistance`, `hitTestRouteGeneric`, `updateDashOffsetsForRoute`.
- Heat: `projectRouteHeat`, `projectMissileHeatCompat` (temporary shim if needed).
- Render: `drawPlannedRoute`.
