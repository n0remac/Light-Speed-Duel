Phase 1 – Tactical Heat-Aware Movement And Missile Routes
=========================================================

Goals
-----
- Enemy ship plans fast approach and retreat routes that do not project into overheat.
- When close to target, switch to a slow cooling leg and fire missiles.
- Missile waypoint speeds are clamped so missiles don’t overheat along their planned route.
- Preserve existing missile avoidance behavior and lateral dodges.

Key Changes
-----------
- Add light state machine to `DefensiveBehavior`:
  - Phases: `Attack`, `CoolAndFire`, `Evade`.
  - Track `phaseUntil` (time-based) and use ship heat thresholds + distance to drive transitions.
- Heat-safe ship routing:
  - Attack/Evade: short fast waypoints (toward/away) with heat projection check; scale segment speed down if `ProjectHeatForRoute` would exceed cap.
  - Cool&Fire: one slower waypoint near marker speed to reduce heat while opening a firing window.
- Fire missiles only in `CoolAndFire` when near the target (distance threshold) and `MissileReady()`.
- Heat-safe missile route planning:
  - After constructing (start/lead/tail) waypoints, run `ProjectHeatForRoute(0, cfg.HeatParams, pos, 0, waypoints)`.
  - Iteratively reduce per-waypoint speeds until projected heat stays below a cap (e.g., 0.85–0.90 of `OverheatAt`) or `MissileMinSpeed`.
- Keep current missile avoidance steer blending unchanged.

Files To Touch
--------------
- `internal/game/ai_defensive.go`
  - Extend `DefensiveBehavior` with `phase`, `phaseUntil`.
  - Add constants: phase durations, distance thresholds, ship and missile heat caps, speed scale step.
  - Add helpers: `planAttackRoute`, `planEvadeRoute`, `planCoolRoute`, all reusing existing clamp/project helpers.
  - Update `Plan(...)` to select route by phase, apply transitions, and gate missile firing to `CoolAndFire` + proximity.
  - Update missile route builder to clamp speeds using `ProjectHeatForRoute` and `cfg.HeatParams`.

Tunables (Initial Values)
------------------------
- `phaseAttack_s`: 1.2–2.0
- `phaseCool_s`: 0.8–1.4
- `phaseEvade_s`: 1.2–2.0
- `closeRange_px`: 750–1000
- `shipHeatCapRatio`: 0.92 of `OverheatAt` (or `WarnAt + margin`)
- `missileHeatCapRatio`: 0.88–0.92 of missile `OverheatAt`
- `speedScaleStep`: 0.85 (multiply per iteration up to N times)

Acceptance Criteria
-------------------
- Ship performs short fast jumps toward opponent, doesn’t overheat on plan, then a slower cooling leg while close, fires a missile, then short fast jumps away.
- Projected ship heat for any selected route <= `shipHeatCap`.
- Missile projected route heat <= `missileHeatCap`; speeds reduced automatically if needed.
- Missile avoidance remains active and visibly influences movement.

Notes
-----
- Keep changes minimal and local; do not refactor unrelated systems.
- Prefer existing helpers: `projectRouteHeat`, `ProjectHeatForRoute`, steering and clamp utilities.

