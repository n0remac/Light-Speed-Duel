# New Upgrade System - Implementation Guide

## Overview

This directory contains plans for implementing a comprehensive upgrade system with 4 independent upgrade paths:
- **Ship Speed** - Increase maximum ship velocity
- **Missile Speed** - Increase missile velocity
- **Ship Heat Capacity** - Increase ship heat threshold
- **Missile Heat Capacity** - Increase missile heat threshold

Each path has 5 tiers, providing +10% per tier (10%, 20%, 30%, 40%, 50%).

## Documents

1. **PLAN.md** - High-level design and progression overview
2. **BACKEND.md** - Backend implementation (DAG nodes, server application)
3. **FRONTEND.md** - Frontend implementation (UI rendering, TypeScript)
4. **CAPABILITIES.md** - Capabilities system (applying upgrade effects to gameplay)

## Implementation Order

### Phase 1: Define Upgrades (Backend)
Follow **BACKEND.md**:
- [ ] Create `internal/dag/upgrades.go` with 20 upgrade nodes
- [ ] Update `internal/server/app.go` to initialize upgrade nodes
- [ ] Reuse existing effect types (no proto enum changes)
- [ ] `go build` to verify

**Result**: Upgrades appear in the upgrade panel but don't affect gameplay yet.

### Phase 2: Display Upgrades (Frontend)
Follow **FRONTEND.md**:
- [ ] Update `internal/server/web/src/upgrades.ts` to render new effect types
- [ ] (Optional) Organize upgrades by category with grouped layout
- [ ] (Optional) Add CSS styling for better UX
- [ ] Run `go generate ./internal/server` and rebuild
- [ ] Test in browser: verify all 20 upgrades display correctly

**Result**: Upgrades are visible, can be started/completed, but still don't affect gameplay.

### Phase 3: Apply Effects (Capabilities System)
Follow **CAPABILITIES.md**:
- [ ] Create `internal/dag/capabilities.go` (or equivalent helper)
- [ ] Add `Capabilities` field to `Player` struct in `internal/game/room.go`
- [ ] Apply ship speed multiplier to waypoint handling
- [ ] Apply missile speed multiplier by raising `missile_config.speed_max`
- [ ] Apply ship heat capacity to ship heat initialization
- [ ] Apply missile heat capacity to missile heat initialization
- [ ] Optionally populate existing `PlayerCapabilities` in state updates
- [ ] Rebuild and test in-game

**Result**: Upgrades now affect gameplay! Ships/missiles benefit from completed upgrades.

## Quick Start

If you want to get started immediately, run these commands:

```bash
# 1. Implement backend
# Follow BACKEND.md to create internal/dag/upgrades.go

# 2. Build
go build -o LightSpeedDuel

# 3. Test
./LightSpeedDuel
# Open http://localhost:8080/lobby.html
# Click upgrades button to see the 20 upgrade nodes
```

## Testing Checklist

After full implementation:

**Backend**:
- [ ] All 20 upgrade nodes exist in DAG
- [ ] Upgrades have correct prerequisites (tier 2 requires tier 1, etc.)
- [ ] Starting an upgrade changes status to `in_progress`
- [ ] Countdown timer decrements correctly
- [ ] Completing an upgrade changes status to `completed`

**Frontend**:
- [ ] All 20 upgrades render in panel
- [ ] Effect text displays correctly ("+10% Ship Speed", etc.)
- [ ] Available upgrades are clickable
- [ ] Locked upgrades are grayed out
- [ ] In-progress upgrades show countdown
- [ ] Completed upgrades show checkmark

**Capabilities**:
- [ ] Ship speed upgrade increases max ship speed
- [ ] Missile speed upgrade increases missile speed max (slider reflects server value)
- [ ] Ship heat upgrade allows higher speed before overheat
- [ ] Missile heat upgrade allows missiles to travel faster
- [ ] Tier 2 overrides tier 1 (not additive)
- [ ] Different paths stack correctly
- [ ] Capabilities persist across server restarts

## Design Notes

**Time Progression**: Each tier takes 2x longer (30s → 60s → 120s → 240s → 480s)

**Effect Stacking**: Within a path, higher tiers override lower tiers. Across paths, effects multiply.

**Prerequisites**: Linear progression within each path (must complete tier N before tier N+1).

**Independent Paths**: All 4 paths start unlocked and can be upgraded in any order.

**Per-Player**: Each player has independent upgrade progress and capabilities.

## Future Enhancements

- Add unlock requirements (e.g., "Complete 5 matches to unlock tier 3")
- Add cost/resources to start upgrades
- Add visual effects when upgrades complete
- Add sound effects for upgrade interactions
- Add upgrade preview/comparison UI
- Add reset/respec functionality
- Add achievement tracking for upgrade milestones
