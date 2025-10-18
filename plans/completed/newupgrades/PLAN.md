# New Upgrade System Plan

## Overview

Add four upgrade paths for incremental stat improvements:
- **Ship Speed**: Increase maximum ship velocity
- **Missile Speed**: Increase missile velocity
- **Ship Heat Capacity**: Increase ship heat threshold before overheat
- **Missile Heat Capacity**: Increase missile heat threshold

Each path has multiple tiers, with each tier providing +10% to the base stat and requiring progressively more time to complete.

## Upgrade Paths

### 1. Ship Speed Upgrades

Increases the maximum speed the ship can travel at waypoints.

| Node ID | Label | Duration | Requires | Effect |
|---------|-------|----------|----------|--------|
| `upgrade.ship.speed_1` | Engine Boost I | 30s | - | +10% max speed |
| `upgrade.ship.speed_2` | Engine Boost II | 60s | speed_1 | +20% max speed |
| `upgrade.ship.speed_3` | Engine Boost III | 120s | speed_2 | +30% max speed |
| `upgrade.ship.speed_4` | Engine Boost IV | 240s | speed_3 | +40% max speed |
| `upgrade.ship.speed_5` | Engine Boost V | 480s | speed_4 | +50% max speed |

**Implementation**: Multiply ship waypoint speed limits by the multiplier.

### 2. Missile Speed Upgrades

Increases the maximum speed missiles can travel.

| Node ID | Label | Duration | Requires | Effect |
|---------|-------|----------|----------|--------|
| `upgrade.missile.speed_1` | Warhead Boost I | 30s | - | +10% missile speed |
| `upgrade.missile.speed_2` | Warhead Boost II | 60s | missile.speed_1 | +20% missile speed |
| `upgrade.missile.speed_3` | Warhead Boost III | 120s | missile.speed_2 | +30% missile speed |
| `upgrade.missile.speed_4` | Warhead Boost IV | 240s | missile.speed_3 | +40% missile speed |
| `upgrade.missile.speed_5` | Warhead Boost V | 480s | missile.speed_4 | +50% missile speed |

**Implementation**: Multiply missile configuration speed max by the multiplier.

### 3. Ship Heat Capacity Upgrades

Increases the ship's heat capacity, allowing it to operate at higher speeds longer before overheating.

| Node ID | Label | Duration | Requires | Effect |
|---------|-------|----------|----------|--------|
| `upgrade.ship.heat_cap_1` | Cooling System I | 30s | - | +10% heat capacity |
| `upgrade.ship.heat_cap_2` | Cooling System II | 60s | heat_cap_1 | +20% heat capacity |
| `upgrade.ship.heat_cap_3` | Cooling System III | 120s | heat_cap_2 | +30% heat capacity |
| `upgrade.ship.heat_cap_4` | Cooling System IV | 240s | heat_cap_3 | +40% heat capacity |
| `upgrade.ship.heat_cap_5` | Cooling System V | 480s | heat_cap_4 | +50% heat capacity |

**Implementation**: Multiply ship heat max threshold by the multiplier.

### 4. Missile Heat Capacity Upgrades

Increases missile heat capacity, allowing missiles to travel at higher speeds.

| Node ID | Label | Duration | Requires | Effect |
|---------|-------|----------|----------|--------|
| `upgrade.missile.heat_cap_1` | Thermal Shield I | 30s | - | +10% missile heat |
| `upgrade.missile.heat_cap_2` | Thermal Shield II | 60s | missile.heat_cap_1 | +20% missile heat |
| `upgrade.missile.heat_cap_3` | Thermal Shield III | 120s | missile.heat_cap_2 | +30% missile heat |
| `upgrade.missile.heat_cap_4` | Thermal Shield IV | 240s | missile.heat_cap_3 | +40% missile heat |
| `upgrade.missile.heat_cap_5` | Thermal Shield V | 480s | missile.heat_cap_4 | +50% missile heat |

**Implementation**: Multiply missile heat max threshold by the multiplier.

## Effect Types

Reuse existing DAG effect types; no new enums needed. Target (ship vs missile) is inferred from node IDs (`upgrade.ship.*`, `upgrade.missile.*`) or a `payload.target` hint.

Existing effect types:
- `EffectSpeedMultiplier`
- `EffectMissileUnlock`
- `EffectHeatCapacity`
- `EffectHeatEfficiency`

## Progression Design

**Time Doubling**: Each tier takes 2x longer than the previous tier, starting at 30 seconds:
- Tier 1: 30s
- Tier 2: 60s (1 minute)
- Tier 3: 120s (2 minutes)
- Tier 4: 240s (4 minutes)
- Tier 5: 480s (8 minutes)

**Linear Stacking**: Each tier adds another +10% multiplicatively on the base value:
- Tier 1: 1.1x (10% increase)
- Tier 2: 1.2x (20% increase)
- Tier 3: 1.3x (30% increase)
- Tier 4: 1.4x (40% increase)
- Tier 5: 1.5x (50% increase)

**Prerequisites**: Each tier requires the previous tier to be completed (linear progression).

## Implementation Plan

### Phase 1: Backend - Define Upgrade Nodes

1. Create `internal/dag/upgrades.go`:
   - Define `SeedUpgradeNodes()` function
   - Add all 20 upgrade nodes (4 paths × 5 tiers)
   - Use appropriate effect types for each upgrade

2. Update `internal/server/app.go`:
   - Call `dag.SeedUpgradeNodes()` and include in DAG initialization

### Phase 2: Backend - Apply Upgrade Effects

1. Create `internal/dag/capabilities.go`:
   - `CalculateCapabilities(state *PlayerState) PlayerCapabilities`
   - Aggregate all completed upgrade effects
   - Return multipliers for ship speed, missile speed, ship heat, missile heat

2. Update `internal/game/room.go`:
   - Apply capabilities when creating/updating ships
   - Apply capabilities to missile configuration

3. No protobuf enum changes required; effects are applied server‑side based on node IDs and existing types.

### Phase 3: Frontend - Display Upgrades

1. Update `internal/server/web/src/upgrades.ts`:
   - Keep existing effect types; vary display by inferring target from `node.id`.
   - Render as "+X% Ship Speed" or "+X% Missile Speed" for `speed_multiplier`, and similar for `heat_capacity`.

2. No changes to `proto/ws_messages.proto` are required for effect types.

3. No changes needed in proto helpers for new effect types.

### Phase 4: Testing & Balancing

1. Verify upgrade effects apply correctly in-game
2. Test that upgrades stack properly (later tiers override earlier ones)
3. Balance time durations if needed
4. Test multiplayer: upgrades should be per-player

## Display Logic Tip

When rendering effects, use `node.id` to tailor labels. Example: if `node.id` starts with `upgrade.ship.` and effect is `speed_multiplier`, display "+X% Ship Speed"; if it starts with `upgrade.missile.`, display "+X% Missile Speed".

## Summary

- **Total Nodes**: 20 (4 paths × 5 tiers each)
- **Time Range**: 30s to 8 minutes
- **Effect Range**: +10% to +50% per stat
- **Linear Prerequisites**: Must complete tier N to unlock tier N+1
- **Independent Paths**: All 4 paths can be progressed in parallel

This creates a simple, clear progression system where players can choose which stats to prioritize while maintaining balanced time investments.
