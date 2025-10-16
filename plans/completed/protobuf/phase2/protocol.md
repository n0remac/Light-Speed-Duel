# Phase 2: Protocol Extensions

## Overview

Extend the Phase 1 protobuf schema to include DAG progression, inventory/crafting, and story/dialogue systems.

## Schema Extensions

### Updated StateUpdate Message

```protobuf
// Extend StateUpdate from Phase 1
message StateUpdate {
  double now = 1;
  Ghost me = 2;
  repeated Ghost ghosts = 3;
  RoomMeta meta = 4;
  repeated Missile missiles = 5;
  MissileConfig missile_config = 6;
  repeated Waypoint missile_waypoints = 7;
  repeated MissileRoute missile_routes = 8;
  string active_missile_route = 9;
  double next_missile_ready = 10;

  // Phase 2 additions:
  optional DagState dag = 11;
  optional Inventory inventory = 12;
  optional StoryState story = 13;
}
```

### New Client Commands (Extend WsEnvelope)

```protobuf
message WsEnvelope {
  oneof payload {
    // ... Phase 1 messages (1-27)

    // Phase 2: DAG commands
    DagStart dag_start = 30;
    DagCancel dag_cancel = 31;
    DagStoryAck dag_story_ack = 32;
    DagList dag_list = 33;

    // Phase 2: Mission commands
    MissionSpawnWave mission_spawn_wave = 40;
    MissionStoryEvent mission_story_event = 41;

    // Phase 2: Server responses
    DagListResponse dag_list_response = 50;
  }
}
```

### DAG System Messages

```protobuf
// DAG node status enum
enum DagNodeStatus {
  DAG_NODE_STATUS_UNSPECIFIED = 0;
  DAG_NODE_STATUS_LOCKED = 1;
  DAG_NODE_STATUS_AVAILABLE = 2;
  DAG_NODE_STATUS_IN_PROGRESS = 3;
  DAG_NODE_STATUS_COMPLETED = 4;
}

// DAG node kind enum
enum DagNodeKind {
  DAG_NODE_KIND_UNSPECIFIED = 0;
  DAG_NODE_KIND_FACTORY = 1;
  DAG_NODE_KIND_UNIT = 2;
  DAG_NODE_KIND_STORY = 3;
}

// DAG node state
message DagNode {
  string id = 1;
  DagNodeKind kind = 2;
  string label = 3;
  DagNodeStatus status = 4;
  double remaining_s = 5;  // Time remaining for in-progress jobs
  double duration_s = 6;   // Total duration
  bool repeatable = 7;     // Can be repeated after completion
}

// Full DAG state
message DagState {
  repeated DagNode nodes = 1;
}

// Client → Server: Start a DAG node
message DagStart {
  string node_id = 1;
}

// Client → Server: Cancel a DAG node
message DagCancel {
  string node_id = 1;
}

// Client → Server: Acknowledge story dialogue
message DagStoryAck {
  string node_id = 1;
  string choice_id = 2;  // Empty if just continue (no choice)
}

// Client → Server: Request full DAG list
message DagList {}

// Server → Client: DAG list response
message DagListResponse {
  DagState dag = 1;
}
```

### Inventory System Messages

```protobuf
// Inventory item
message InventoryItem {
  string type = 1;            // "missile", "component", etc.
  string variant_id = 2;      // Specific variant identifier
  double heat_capacity = 3;   // Heat capacity for this item
  int32 quantity = 4;         // Stack quantity
}

// Player inventory
message Inventory {
  repeated InventoryItem items = 1;
}
```

### Story/Dialogue System Messages

```protobuf
// Story intent enum
enum StoryIntent {
  STORY_INTENT_UNSPECIFIED = 0;
  STORY_INTENT_FACTORY = 1;
  STORY_INTENT_UNIT = 2;
}

// Story dialogue choice option
message StoryDialogueChoice {
  string id = 1;
  string text = 2;
}

// Story tutorial tip
message StoryTutorialTip {
  string title = 1;
  string text = 2;
}

// Story dialogue content
message StoryDialogue {
  string speaker = 1;
  string text = 2;
  StoryIntent intent = 3;
  string continue_label = 4;                    // Empty = default "Continue"
  repeated StoryDialogueChoice choices = 5;     // Empty = show continue button
  optional StoryTutorialTip tutorial_tip = 6;   // Optional gameplay hint
}

// Story event (history entry)
message StoryEvent {
  string chapter_id = 1;
  string node_id = 2;
  double timestamp = 3;
}

// Story state
message StoryState {
  string active_node = 1;                    // Currently active story node ID
  optional StoryDialogue dialogue = 2;       // Full dialogue content
  repeated string available = 3;             // Available story node IDs
  map<string, bool> flags = 4;               // Story flags for branching
  repeated StoryEvent recent_events = 5;     // Recent story events
}
```

### Mission Event Messages

```protobuf
// Client → Server: Spawn mission wave
message MissionSpawnWave {
  int32 wave_index = 1;  // 1, 2, or 3
}

// Client → Server: Trigger mission story event
message MissionStoryEvent {
  string event = 1;      // e.g. "mission:start", "mission:beacon-locked"
  int32 beacon = 2;      // Beacon index for beacon-specific events
}
```

## Field Numbering Strategy

- Phase 1 core messages: 1-27
- Phase 2 DAG commands: 30-39
- Phase 2 mission commands: 40-49
- Phase 2 server responses: 50-59
- Reserve 100+ for Phase 3 (versioning, feature flags)

This leaves room for future additions without renumbering.

## Enum Usage

### Why Enums for Phase 2?

Phase 2 introduces enums for:
- **DagNodeStatus** - Limited set of states (locked, available, in_progress, completed)
- **DagNodeKind** - Limited set of types (factory, unit, story)
- **StoryIntent** - Limited set of intents (factory, unit)

Enums provide:
- Type safety (invalid values rejected at decode time)
- Smaller wire size (varint instead of string)
- Better code generation (TypeScript unions, Go constants)

### Enum Naming Convention

- Use `SCREAMING_SNAKE_CASE` for enum values (protobuf convention)
- Prefix enum values with enum type (e.g., `DAG_NODE_STATUS_LOCKED`)
- Always include `_UNSPECIFIED = 0` as default value

### Enum Evolution

Adding new enum values is backwards compatible:
```protobuf
enum DagNodeStatus {
  DAG_NODE_STATUS_UNSPECIFIED = 0;
  DAG_NODE_STATUS_LOCKED = 1;
  DAG_NODE_STATUS_AVAILABLE = 2;
  DAG_NODE_STATUS_IN_PROGRESS = 3;
  DAG_NODE_STATUS_COMPLETED = 4;
  // Future: DAG_NODE_STATUS_FAILED = 5;  ✓ Safe to add
}
```

Removing or renumbering enum values is a breaking change.

## Optional Field Semantics

### When to Use `optional`

Use `optional` keyword for fields that may legitimately be absent:
- `DagState.dag` - Only present in campaign mode
- `Inventory.inventory` - May be empty in some game modes
- `StoryState.dialogue` - Only present when story node is active
- `StoryDialogue.tutorial_tip` - Not all dialogues have tips

Do NOT use `optional` for fields where zero/empty has semantic meaning:
- `DagNode.remaining_s` - Zero means "not in progress", not "unknown"
- `InventoryItem.quantity` - Zero means "out of stock", not "unknown"

### Checking Optional Fields

**Go:**
```go
if state.Dag != nil {
    // DAG data present
}
```

**TypeScript:**
```typescript
if (state.dag !== undefined) {
    // DAG data present
}
```

## Map Fields

`StoryState.flags` uses a map:
```protobuf
map<string, bool> flags = 4;
```

Maps are efficient for sparse key-value data. Alternatives:
- Repeated pairs: More verbose, but preserves order
- Bitfields: More compact, but limited to 64 flags

We choose maps for flexibility and readability.

## Backwards Compatibility

Phase 2 schema is backwards compatible with Phase 1:
- All Phase 1 fields unchanged (field numbers 1-27)
- New fields are optional or have default values
- Old clients ignore unknown fields (Phase 2 additions)
- New servers can detect old clients (missing Phase 2 fields)

**Strategy for gradual rollout:**
- Deploy Phase 2 server first
- Server detects if client sends Phase 2 messages
- If not, server omits Phase 2 fields from responses
- Once all clients upgraded, remove fallback code

## Testing Strategy

### Schema Validation

```bash
# Lint proto file
buf lint proto/ws_messages.proto

# Check backwards compatibility
buf breaking proto/ws_messages.proto --against .git#branch=main
```

### Integration Tests

Test cases for Phase 2:
1. **DAG flow**: Start node → check in_progress → complete → check completed
2. **Inventory flow**: Launch missile → check quantity decremented
3. **Story flow**: Trigger story node → receive dialogue → send ack → check flags
4. **Mission flow**: Spawn wave → check enemies appear → trigger event

### Round-Trip Tests

Encode a message in Go, decode in TypeScript:
```go
// Go
state := &pb.StoryState{
    ActiveNode: "intro_01",
    Dialogue: &pb.StoryDialogue{
        Speaker: "Captain",
        Text: "Welcome aboard!",
        Intent: pb.StoryIntent_STORY_INTENT_FACTORY,
    },
}
data, _ := proto.Marshal(state)
// Send to TypeScript test
```

```typescript
// TypeScript
const state = StoryState.fromBinary(data);
expect(state.activeNode).toBe("intro_01");
expect(state.dialogue?.speaker).toBe("Captain");
```

## Documentation

Add detailed comments to proto file:

```protobuf
// DagState contains the player's progression through the directed acyclic graph
// of crafting recipes and story nodes. Only present in campaign mode.
//
// The server sends updated node statuses every tick if anything changed.
// Clients should merge this with existing state to avoid flickering UI.
message DagState {
  // All nodes in the graph with current status.
  // Nodes not in this list are locked by default.
  repeated DagNode nodes = 1;
}
```

## Code Generation

Same as Phase 1:

```bash
# Go
protoc --go_out=. --go_opt=module=LightSpeedDuel --go_opt=paths=source_relative proto/ws_messages.proto

# TypeScript
npx @bufbuild/protoc-gen-es proto/ws_messages.proto --es_out internal/server/web/src/proto --es_opt target=ts
```

## Migration Checklist

- [ ] Extend `proto/ws_messages.proto` with Phase 2 messages
- [ ] Add enum definitions for DAG and story
- [ ] Add optional fields to `StateUpdate`
- [ ] Add new client commands to `WsEnvelope`
- [ ] Run `buf lint` to validate schema
- [ ] Run `buf breaking` to check compatibility
- [ ] Regenerate Go code
- [ ] Regenerate TypeScript code
- [ ] Verify generated code compiles
- [ ] Update DTOs in `internal/server/dto.go` with comments referencing proto types
- [ ] Proceed to backend implementation (backend.md)

## Next Steps

After protocol is extended:
- Update backend conversion functions
- Update frontend conversion functions
- Test each subsystem independently
- Integration test full campaign mode
