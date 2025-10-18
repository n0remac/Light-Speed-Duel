# Upgrade System - Networking Plan

## Protocol Overview

**IMPORTANT:** This plan extends the existing DAG system rather than creating a parallel upgrade system. Upgrades are `NodeKindUpgrade` nodes in the existing DAG infrastructure.

Uses Protocol Buffers for WebSocket messages, leveraging existing `DagNode`, `DagStart`, and `DagState` messages in `proto/ws_messages.proto`.

## Protocol Buffer Schema Changes

### 1. Add Upgrade Effects (New)

Add these new types to `proto/ws_messages.proto`:

```protobuf
// ========== Upgrade System Extensions ==========

// Upgrade effect type enum
enum UpgradeEffectType {
  UPGRADE_EFFECT_TYPE_UNSPECIFIED = 0;
  UPGRADE_EFFECT_TYPE_SPEED_MULTIPLIER = 1;
  UPGRADE_EFFECT_TYPE_MISSILE_UNLOCK = 2;
  UPGRADE_EFFECT_TYPE_HEAT_CAPACITY = 3;
  UPGRADE_EFFECT_TYPE_HEAT_EFFICIENCY = 4;
}

// Upgrade effect definition
message UpgradeEffect {
  UpgradeEffectType type = 1;
  oneof value {
    double multiplier = 2;    // For speed/heat multipliers
    string unlock_id = 3;     // For missile unlocks (e.g., "scout")
  }
}

// Player capabilities (computed from completed upgrades)
message PlayerCapabilities {
  double speed_multiplier = 1;
  repeated string unlocked_missiles = 2;
  double heat_capacity = 3;
  double heat_efficiency = 4;
}
```

### 2. Extend Existing DagNode Message

Modify the existing `DagNode` message (proto/ws_messages.proto:292-300):

```protobuf
message DagNode {
  string id = 1;
  DagNodeKind kind = 2;
  string label = 3;
  DagNodeStatus status = 4;
  double remaining_s = 5;
  double duration_s = 6;
  bool repeatable = 7;
  repeated UpgradeEffect effects = 8;  // NEW: Only populated for upgrade nodes
}
```

### 3. Extend StateUpdate Message

Add capabilities to the existing `StateUpdate` message (proto/ws_messages.proto:52-68):

```protobuf
message StateUpdate {
  // ... existing fields (now, me, ghosts, etc.) ...
  optional DagState dag = 11;                    // EXISTING
  optional Inventory inventory = 12;             // EXISTING
  optional StoryState story = 13;                // EXISTING
  optional PlayerCapabilities capabilities = 14; // NEW
}
```

## WebSocket Messages (Reuse Existing)

### Client → Server: Start Upgrade

**Use existing `DagStart` message** (already defined at proto/ws_messages.proto:308-310):

```typescript
// TypeScript (Client) - internal/server/web/src/net.ts
import { sendDagStart } from "./net";

// Start an upgrade node
sendDagStart("upgrade.ship.speed_1");
```

**Go (Server - Receive):**
```go
// Already handled in existing DAG command handler
// Filter to only allow NodeKindUpgrade nodes in upgrade context
func handleDagStart(msg *pb.DagStart, playerID string) {
    node := dag.GetGraph().Nodes[dag.NodeID(msg.NodeId)]

    // Validate it's an upgrade node if called from upgrade screen
    if node.Kind == dag.NodeKindUpgrade {
        // Process upgrade start
        StartNode(playerID, dag.NodeID(msg.NodeId), now)
    }
}
```

### Server → Client: State Updates

**Use existing `StateUpdate` with DAG state** (already sent ~20Hz):

```go
// In buildStateUpdate (internal/server/ws.go or similar)
func buildStateUpdate(player *Player) *pb.StateUpdate {
    return &pb.StateUpdate{
        // ... existing fields ...
        Dag: buildDagState(player),  // EXISTING - includes upgrade nodes
        Capabilities: &pb.PlayerCapabilities{  // NEW
            SpeedMultiplier: player.Capabilities.SpeedMultiplier,
            UnlockedMissiles: player.Capabilities.UnlockedMissiles,
            HeatCapacity: player.Capabilities.HeatCapacity,
            HeatEfficiency: player.Capabilities.HeatEfficiency,
        },
    }
}

func buildDagState(player *Player) *pb.DagState {
    // EXISTING FUNCTION - just ensure it includes effects for upgrade nodes
    nodes := make([]*pb.DagNode, 0)

    for _, node := range dag.GetGraph().Nodes {
        protoNode := &pb.DagNode{
            Id:         string(node.ID),
            Kind:       dagKindToProto(node.Kind),
            Label:      node.Label,
            Status:     computeStatus(node, player.DagState),
            RemainingS: player.DagState.RemainingTime(node.ID, now),
            DurationS:  node.DurationS,
            Repeatable: node.Repeatable,
        }

        // Add effects for upgrade nodes
        if node.Kind == dag.NodeKindUpgrade {
            protoNode.Effects = convertEffects(node.Effects)
        }

        nodes = append(nodes, protoNode)
    }

    return &pb.DagState{Nodes: nodes}
}
```

**TypeScript (Client - Receive):**
```typescript
// In message handler (internal/server/web/src/net.ts)
ws.onmessage = (event) => {
  const envelope = fromBinary(WsEnvelopeSchema, new Uint8Array(event.data));

  if (envelope.payload.case === "stateUpdate") {
    const update = envelope.payload.value;

    // Extract DAG state (includes upgrade nodes)
    if (update.dag) {
      state.dag = protoToDagState(update.dag);

      // Filter upgrade nodes if on upgrade screen
      const upgradeNodes = state.dag.nodes.filter(n => n.kind === 'unit');
      bus.emit("upgrades:updated", { nodes: upgradeNodes });
    }

    // Extract player capabilities (NEW)
    if (update.capabilities) {
      state.capabilities = {
        speedMultiplier: update.capabilities.speedMultiplier,
        unlockedMissiles: update.capabilities.unlockedMissiles,
        heatCapacity: update.capabilities.heatCapacity,
        heatEfficiency: update.capabilities.heatEfficiency
      };
    }
  }
};
```

## Helper Functions

### TypeScript Proto Conversion

**IMPORTANT:** There are two patterns for handling protobuf data:

1. **proto_helpers.ts** - Converts to `DagNodeData` (used for event emission)
2. **net.ts** - Converts directly to `DagNode` for AppState (used in state updates)

#### Option A: Update proto_helpers.ts (for DAG list events)

Add to existing `proto_helpers.ts`:

```typescript
// ADD new interface (should match state.ts)
export interface UpgradeEffectData {
  type: string;
  value: number | string;
}

// ADD helper function
export function protoToUpgradeEffect(proto: UpgradeEffect): UpgradeEffectData {
  return {
    type: protoEffectTypeToString(proto.type),
    value: proto.value.case === "multiplier" ? proto.value.value : proto.value.value
  };
}

// ADD enum converter
export function protoEffectTypeToString(type: UpgradeEffectType): string {
  switch (type) {
    case UpgradeEffectType.SPEED_MULTIPLIER: return "speed_multiplier";
    case UpgradeEffectType.MISSILE_UNLOCK: return "missile_unlock";
    case UpgradeEffectType.HEAT_CAPACITY: return "heat_capacity";
    case UpgradeEffectType.HEAT_EFFICIENCY: return "heat_efficiency";
    default: return "unknown";
  }
}

// EXTEND existing DagNodeData interface (line 221)
export interface DagNodeData {
  id: string;
  kind: string;
  label: string;
  status: string;
  remainingS: number;
  durationS: number;
  repeatable: boolean;
  effects?: UpgradeEffectData[];  // NEW - add this line
}

// MODIFY existing protoToDagNode function (line 281)
export function protoToDagNode(proto: DagNode): DagNodeData {
  return {
    id: proto.id,
    kind: protoKindToString(proto.kind),
    label: proto.label,
    status: protoStatusToString(proto.status),
    remainingS: proto.remainingS,
    durationS: proto.durationS,
    repeatable: proto.repeatable,
    effects: proto.effects?.map(protoToUpgradeEffect) || [],  // NEW - add this line
  };
}
```

#### Option B: Update net.ts (for state updates)

This is shown in detail in the Frontend plan. In `net.ts` around line 464-477, the DAG mapping needs to include effects:

```typescript
// In handleProtoStateMessage
if (msg.dag) {
  state.dag = {
    nodes: msg.dag.nodes.map((node) => ({
      // ... existing fields ...
      effects: node.effects?.map(e => ({
        type: protoEffectTypeToString(e.type),
        value: e.value.case === "multiplier" ? e.value.value : e.value.value
      })) || []  // NEW
    })),
  };
}
```

**Both conversions should be updated** to ensure consistency between DAG list events and state updates.

### Go Proto Conversion

Add to existing `internal/server/proto_convert.go`:

```go
// Convert upgrade effects to protobuf
func convertEffects(effects []dag.UpgradeEffect) []*pb.UpgradeEffect {
    result := make([]*pb.UpgradeEffect, len(effects))
    for i, effect := range effects {
        protoEffect := &pb.UpgradeEffect{
            Type: convertEffectType(effect.Type),
        }

        switch effect.Type {
        case dag.EffectSpeedMultiplier, dag.EffectHeatCapacity, dag.EffectHeatEfficiency:
            multiplier := effect.Value.(float64)
            protoEffect.Value = &pb.UpgradeEffect_Multiplier{Multiplier: multiplier}
        case dag.EffectMissileUnlock:
            unlockID := effect.Value.(string)
            protoEffect.Value = &pb.UpgradeEffect_UnlockId{UnlockId: unlockID}
        }

        result[i] = protoEffect
    }
    return result
}

func convertEffectType(t dag.EffectType) pb.UpgradeEffectType {
    switch t {
    case dag.EffectSpeedMultiplier:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_SPEED_MULTIPLIER
    case dag.EffectMissileUnlock:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_MISSILE_UNLOCK
    case dag.EffectHeatCapacity:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_HEAT_CAPACITY
    case dag.EffectHeatEfficiency:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_HEAT_EFFICIENCY
    default:
        return pb.UpgradeEffectType_UPGRADE_EFFECT_TYPE_UNSPECIFIED
    }
}
```

## Connection Flow

### On Lobby/Upgrade Screen Connection
1. Client connects WebSocket
2. Client sends `join` message (existing flow)
3. Server sends initial `StateUpdate` with:
   - `dag`: Full DAG tree (includes upgrade nodes with kind=UNIT)
   - `capabilities`: Current player capabilities
4. Client filters `dag.nodes` by `kind === 'unit'` for upgrade screen
5. Client initializes UI and countdown timers

### During Upgrade Screen
1. User clicks "Start" on available upgrade node
2. Client sends existing `DagStart` message: `sendDagStart(nodeId)`
3. Server validates and starts upgrade via DAG system
4. Server sends updated `StateUpdate` with modified DAG (next tick)
5. Client updates UI to show in-progress state

### On Upgrade Completion
1. Server detects upgrade completion (existing DAG timer logic)
2. Server applies effects to `player.Capabilities`
3. Server sends `StateUpdate` with:
   - Updated DAG (node now has status=COMPLETED)
   - Updated `capabilities` with new values
4. Client shows completion and unlocks dependent nodes

## Upgrade vs Other DAG Nodes

### Filtering by Kind

```typescript
// Upgrade screen: show only upgrade nodes
const upgradeNodes = state.dag.nodes.filter(n => n.kind === 'unit');

// Crafting screen: show only craft nodes
const craftNodes = state.dag.nodes.filter(n => n.kind === 'craft');

// Story screen: show only story nodes
const storyNodes = state.dag.nodes.filter(n => n.kind === 'story');
```

### Client-Side Distinction

Upgrade nodes have:
- `kind === 'unit'` (maps from backend `NodeKindUpgrade`)
- `effects` array populated with upgrade bonuses
- Used to compute `capabilities` after completion

## Network Resilience

- Client re-syncs DAG state on reconnect (already handled)
- Server persists DAG state (already implemented)
- Countdown timers recalculated from `remainingS` field
- All timing uses server timestamps

## Build Process

After modifying `proto/ws_messages.proto`:

```bash
# 1. Regenerate proto files
make proto

# 2. Rebuild TypeScript
go generate ./internal/server

# 3. Rebuild Go binary
go build

# 4. Run
./LightSpeedDuel -addr :8080
```

Or use the quick script:
```bash
./restart-dev.sh
```

## Summary of Changes

| What | Action |
|------|--------|
| **New Messages** | ❌ None - reuse existing `DagStart`, `DagState` |
| **New Enums** | ✅ `UpgradeEffectType` |
| **New Types** | ✅ `UpgradeEffect`, `PlayerCapabilities` |
| **Modified** | ✅ Add `effects` field to `DagNode`, `capabilities` to `StateUpdate` |
| **Client Code** | ✅ Use existing `sendDagStart()`, filter DAG by kind |
| **Server Code** | ✅ Extend DAG handlers, add `Capabilities` computation |

This approach leverages 90% of existing infrastructure and adds only what's truly unique to upgrades.
