# Upgrade System Plan

## Overview

Add a dedicated **Upgrade Screen** accessible from the lobby where players can unlock and upgrade ship capabilities (speed, missile options, heat management). **Upgrades extend the existing DAG system** using `NodeKindUpgrade` nodes with time-based progression and prerequisites.

## Core Concepts

- **DAG-based progression**: Uses existing `NodeKindUpgrade` nodes (already defined in `internal/dag/graph.go:23`)
- **Time-gated unlocks**: Upgrades use existing DAG timer system (survives disconnects)
- **Tech tree structure**: Prerequisites create a dependency graph (DAG handles this)
- **Mechanics gating**: Upgrades unlock or improve:
  - Ship max speed tiers
  - Missile preset availability (Scout/Hunter/Sniper)
  - Heat capacity/efficiency improvements
  - Future systems (weapon slots, sensors, etc.)
- **Capability computation**: Server computes player bonuses from completed upgrade nodes

## Architecture: Extending DAG, Not Duplicating

### What Already Exists

The DAG system (`internal/dag/`) already provides:
- ✅ `NodeKindUpgrade` node type
- ✅ Timer-based progression with `ActiveJobs`
- ✅ Status tracking (locked/available/in_progress/completed)
- ✅ Prerequisite dependency management
- ✅ Persistence via `dag.State`
- ✅ Protobuf messages: `DagNode`, `DagStart`, `DagState`
- ✅ Frontend handlers: `sendDagStart()`, DAG state sync

### What Needs to Be Added

Only upgrade-specific extensions:
- ✅ `Effects` field on `dag.Node` (describes what upgrade does)
- ✅ `PlayerCapabilities` struct (computed from completed upgrades)
- ✅ Protobuf `UpgradeEffect` and `PlayerCapabilities` messages
- ✅ Capability computation logic (`ComputeCapabilities()`)
- ✅ Upgrade node definitions (`internal/dag/upgrades.go`)
- ✅ Upgrade screen UI (filters DAG by `kind === 'unit'`)

## Detailed Plans

This plan is split into three implementation areas:

- **[Frontend Plan](./FRONTEND.md)** - UI/UX, tech tree rendering, filtering DAG state
- **[Networking Plan](./NETWORKING.md)** - Protobuf extensions, reusing DAG messages
- **[Backend Plan](./BACKEND.md)** - Upgrade definitions, effects system, capabilities

## Implementation Phases

### Phase 1: Backend Foundation (Extend DAG)
- Add `Effects` field to `dag.Node` struct ([Backend](./BACKEND.md))
- Define 5-8 starter upgrade nodes in `internal/dag/upgrades.go`
- Add `PlayerCapabilities` struct to `Player`
- Implement `ComputeCapabilities()` function
- Hook into existing DAG completion handlers
- Test DAG progression end-to-end

### Phase 2: Networking Layer (Minimal Changes)
- Add `UpgradeEffect` and `PlayerCapabilities` protobuf types ([Networking](./NETWORKING.md))
- Extend `DagNode` message with `effects` field
- Add `capabilities` field to `StateUpdate`
- Extend protobuf conversion helpers
- **No new WebSocket messages needed** - reuse `DagStart`

### Phase 3: Upgrades Screen (Filter DAG)
- Create `/upgrades.html` + `upgrades_main.ts` ([Frontend](./FRONTEND.md))
- Filter `AppState.dag.nodes` by `kind === 'unit'`
- Implement tech tree UI (HTML/CSS approach)
- Use existing `sendDagStart()` for node activation
- Add real-time countdown timers

### Phase 4: In-Game Integration
- Read `player.Capabilities` in game systems (movement, missiles)
- Show unlocked missile presets in craft UI
- Apply speed/heat multipliers to ship stats
- Visual indicators for upgraded capabilities

### Phase 5: Polish
- Animations, tooltips, sound effects ([Frontend](./FRONTEND.md))
- Balance tuning (durations, prerequisites)
- Help/tutorial overlay
- Error handling and edge cases

## Example Upgrade Tree

```
Speed Tier 1 ──→ Speed Tier 2 ──→ Speed Tier 3
     ↓                                  ↓
Heat Capacity ──→ Heat Efficiency      ↓
                                  Advanced Engines

Scout Missiles ──→ Scout Range
Hunter Missiles ──→ Hunter Speed
Sniper Missiles ──→ Sniper Agro
```

## Data Flow

### 1. Player Joins
```
Client → Server: join message
Server → Client: StateUpdate with dag (all nodes, including upgrades)
Server → Client: StateUpdate with capabilities (computed from completed upgrades)
Client: Filters dag.nodes where kind === 'unit' for upgrade screen
```

### 2. Player Starts Upgrade
```
Client: User clicks available upgrade node
Client → Server: DagStart (existing message)
Server: Validates prerequisites, starts job in dag.State
Server → Client: StateUpdate with updated dag (node now in_progress)
```

### 3. Upgrade Completes
```
Server: Timer expires, calls DAG completion handler
Server: Detects node.Kind === NodeKindUpgrade
Server: Recomputes player.Capabilities
Server: Applies effects to game systems (speed, missiles, heat)
Server → Client: StateUpdate with updated dag (node now completed)
Server → Client: StateUpdate with updated capabilities
Client: Shows completion animation, unlocks dependent nodes
```

### 4. In-Game Effects
```
Movement System: Uses player.Capabilities.SpeedMultiplier
Missile System: Checks player.Capabilities.UnlockedMissiles
Heat System: Applies player.Capabilities.HeatCapacity/HeatEfficiency
```

## System Integration Points

### Backend
- **DAG System** (`internal/dag/`)
  - Extend `Node` with `Effects` field
  - Add upgrade node definitions
  - Hook completion handlers
- **Game Systems** (`internal/game/`)
  - Add `PlayerCapabilities` to `Player` struct
  - Compute capabilities from DAG state
  - Apply bonuses in movement/missile/heat systems

### Networking
- **Protobuf Schema** (`proto/ws_messages.proto`)
  - Add `UpgradeEffect` type
  - Add `PlayerCapabilities` message
  - Extend `DagNode` with `effects` field
  - Extend `StateUpdate` with `capabilities` field
- **No New Messages** - Reuse existing `DagStart`, `DagState`

### Frontend
- **State Management** (`internal/server/web/src/state.ts`)
  - Add `capabilities` to `AppState`
  - Extend `DagNodeSnapshot` with `effects`
- **Upgrade Screen** (`upgrades.ts`)
  - Filter DAG by `kind === 'unit'`
  - Use existing `sendDagStart()`
  - Render tech tree from filtered nodes
- **In-Game UI**
  - Show unlocked missiles
  - Display speed bonuses

## Open Questions
- Should upgrades persist forever or reset per campaign run? **→ Persist forever (stored in DAG state)**
- Do we need costs/resources or just time + prereqs? **→ v1: just time + prereqs**
- Should upgrades affect only new games or retroactively? **→ Apply immediately to active games**
- Multiplayer: per-player upgrades or room-wide? **→ Per-player**

## Out of Scope (v1)
- Costs/resources (currency, materials)
- Multiple upgrade queues (limit 1 active job per player)
- Upgrade cancellation with refunds
- Visual ship customization
- Multiplayer balancing (matchmaking by upgrade tier)
- Separate `/api/upgrades` endpoint (DAG endpoints are sufficient)

## Success Criteria

- ✅ Players can start upgrade nodes from upgrade screen
- ✅ Timers track progress and survive server restarts
- ✅ Completed upgrades unlock dependent nodes
- ✅ Speed multipliers apply to ship movement
- ✅ Missile unlocks gate crafting UI
- ✅ Heat bonuses modify ship heat behavior
- ✅ No duplicate systems - reuses 90% of existing DAG infrastructure

## Benefits of DAG Integration

- **Code reuse**: 90% of logic already exists (timers, persistence, networking)
- **Consistency**: Upgrades, crafting, and story all use same progression model
- **Maintenance**: One system to debug, test, and extend
- **Performance**: Single DAG state per player, not separate upgrade tracking
- **Scalability**: Easy to add new upgrade types (weapons, sensors, etc.)
