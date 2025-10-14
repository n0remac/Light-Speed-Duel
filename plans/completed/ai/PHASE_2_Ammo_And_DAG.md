Phase 2 – Ammo And DAG Integration
==================================

Goals
-----
- Bots start with 10 basic missiles.
- Missile launches consume ammo; AI only fires when ammo > 0 and cooldown ready.
- When ammo low, AI triggers missile crafting via DAG; inventory is updated on completion.

Key Changes
-----------
- Seed ammo on bot spawn:
  - `internal/game/room.go`: after `player.EnsureInventory()`, add `player.Inventory.AddItem("missile", "basic", 80, 10)`.
- Consume ammo on launch:
  - `internal/game/ai_types.go`: in `aiCommandLaunchMissile.apply`, check `p.Inventory` for a missile stack and `RemoveItem` one unit before `r.LaunchMissile(...)`. Abort if none.
- Gate firing by availability:
  - Extend `AIContext` or Plan logic to require ammo > 0 for missile launch.
- Craft when low:
  - In `DefensiveBehavior.Plan`, if ammo below threshold (e.g., <3) and no active craft job, call `dag.Start(...)` for `craft.missile.basic` with `NewCraftingEffects(p)`; rely on existing room tick to complete and add inventory.

Tunables
--------
- `initialBasicMissiles`: 10
- `lowAmmoThreshold`: 3
- `craftNodeID`: `craft.missile.basic` (upgrade later if unlocked)

Acceptance Criteria
-------------------
- Bot shows finite missiles; each launch reduces inventory.
- Bot refrains from firing when out of ammo even if cooldown ready.
- Crafting starts automatically when ammo is low and completes into inventory via DAG.

Notes
-----
- Keep missile route planning from Phase 1 intact; Phase 2 only adds ammo/crafting constraints.
- DAG is server-authoritative; no new UI required.

