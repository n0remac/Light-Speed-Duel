# Sub-Plan 1: Core Heat System - COMPLETED ✅

**Completion Date:** 2025-10-09

## Summary

Successfully implemented the server-side heat system foundation for Light Speed Duel. The heat system uses a marker-based model where ships accumulate heat when flying above a neutral "marker speed" and dissipate heat when flying below it. Overheating triggers a temporary stall.

## Files Created

1. **`internal/game/heat.go`** (93 lines)
   - `HeatParams` struct with all tuning parameters
   - `HeatState` struct tracking current heat and stall status
   - `HeatComponent` ECS component
   - `UpdateHeat()` function implementing marker-based heat model
   - `IsStalled()` helper method
   - `DefaultHeatParams()` factory function

2. **`internal/game/heat_test.go`** (223 lines)
   - 7 comprehensive unit tests covering:
     - Heat neutrality at marker speed
     - Heat accumulation above marker
     - Heat dissipation below marker
     - Stall triggering on overheat
     - Heat clamping at maximum
     - Heating/cooling symmetry
     - Stall timer behavior

## Files Modified

1. **`internal/game/ecs.go`**
   - Added `CompHeat` component key constant
   - Added `World.HeatData(id)` accessor method

2. **`internal/game/consts.go`**
   - Added 11 heat system constants:
     - `HeatMax = 100.0`
     - `HeatWarnAt = 70.0`
     - `HeatOverheatAt = 100.0`
     - `HeatStallSeconds = 2.5`
     - `HeatMarkerSpeed = 150.0` (60% of ShipMaxSpeed)
     - `HeatExp = 1.5`
     - `HeatKUp = 22.0`
     - `HeatKDown = 16.0`
     - Missile spike parameters (for future use)

3. **`internal/game/systems.go`**
   - Integrated heat updates into ship tick loop
   - Added stall check before waypoint navigation
   - Stalled ships remain visible but cannot move

4. **`internal/game/room.go`**
   - Added heat component initialization in `SpawnShip()`
   - Added heat reset in `reSpawnShip()` (heat clears on respawn)

## Test Results

All 7 unit tests pass:
```
✅ TestHeatNeutralAtMarker
✅ TestHeatAboveMarkerAccumulates
✅ TestHeatBelowMarkerDissipates
✅ TestStallTriggersAtOverheat
✅ TestClampAtMax
✅ TestHeatSymmetry
✅ TestStallDoesNotResetWhileStalled
```

## Heat Model Details

**Formula:**
```
dev = speed - MarkerSpeed
if dev >= 0:  Ḣ = +KUp   * (dev/MarkerSpeed)^Exp
else:         Ḣ = -KDown * (|dev|/MarkerSpeed)^Exp
```

**Behavior:**
- At `speed = 150` (marker): Heat stays constant
- Above marker: Heat accumulates (quadratic-ish with Exp=1.5)
- Below marker: Heat dissipates (slower than accumulation with KDown < KUp)
- At `heat >= 100`: Ship stalls for 2.5 seconds (cannot move)
- Heat clamps at 0 (minimum) and 100 (maximum)

## Integration Points Verified

✅ **ECS Component System** - Heat component properly integrated
✅ **Ship Tick Loop** - Heat updates every frame based on velocity
✅ **Stall Enforcement** - Movement disabled when stalled
✅ **Spawn/Respawn** - Heat properly initialized and reset
✅ **Build System** - Project compiles successfully
✅ **Server Startup** - Server starts without errors

## Known Limitations (By Design)

- **No UI** - Heat is invisible to players (Sub-Plan 3)
- **No network protocol** - Heat not sent to clients yet (Sub-Plan 2)
- **No missile spikes** - Damage doesn't add heat yet (Sub-Plan 5)
- **No preview** - Players can't see projected heat (Sub-Plan 4)

## Next Steps

Proceed to **Sub-Plan 2: Network Protocol & Client State**
- Add `ShipHeatView` DTO
- Include heat in WebSocket state messages
- Client-side state management
- Time synchronization for stall timing

## Performance Notes

- Heat update is O(1) per ship per tick
- No allocations in hot path
- Stall check is simple boolean
- Minimal performance impact on 20Hz tick rate

## Tuning Notes

Current defaults assume:
- Comfortable cruise at 150 units/s (60% of max speed)
- ~4 seconds of sustained sprint (250 units/s) to overheat
- ~3-4 seconds to cool from warn to safe at slow speed (75 units/s)
- 2.5 second stall penalty for overheating

These can be adjusted via constants in `consts.go` or per-room parameters in future updates.
