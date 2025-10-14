AI Tactical Heat-Aware Plan
===========================

Purpose
-------
- Deliver minimal, targeted AI upgrades so enemy ships plan fast approach/retreat routes without overheating and fire missiles while close, with missile routes that avoid missile overheating.
- Keep scope tight and leverage existing systems (heat projection, missile avoidance, DAG).

Phases
------
1) Phase 1 – Tactical Heat-Aware Movement And Missile Routes
- Add light AI phases (attack → cool & fire → evade) and validate heat for both ship and missile routes.
- Preserve current missile-avoidance behavior.

2) Phase 2 – Ammo And DAG Integration
- Seed bot ammo, consume on launch, and auto-craft missiles via DAG when low.

Non‑Goals (For Now)
-------------------
- No new AI framework (BT/GOAP). Keep rule-based + small state machine.
- No new UI. Optional debug logs only.

Dependencies
------------
- Existing heat system and projections: `internal/game/heat.go`.
- AI framework and defensive behavior: `internal/game/ai_defensive.go`.
- Missile launch and config: `internal/game/ai_types.go`, `internal/game/ecs.go`.
- DAG + crafting effects (Phase 2): `internal/dag/*`, `internal/game/crafting.go`, `internal/game/room.go`.

Validation
----------
- Manual playtest: observe approach/cool/fire/evade rhythm, ensure ship heat never hits overheat during planned segments, and missiles don’t overheat per route.
- Quick code-level checks: projected heat caps respected before setting routes/launching.

