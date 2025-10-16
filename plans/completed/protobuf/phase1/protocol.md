# Phase 1: Protocol Definition

## Overview

Define the protobuf schema for core game state messages, focusing on real-time gameplay data (ships, missiles, waypoints).

## File Structure

```
proto/
├── ws_messages.proto       # Main message definitions
└── buf.yaml               # Buf configuration (optional)
```

## Schema Design

### Top-Level Envelope

All WebSocket messages are wrapped in a discriminated union:

```protobuf
syntax = "proto3";

package lightspeedduel.ws;

option go_package = "LightSpeedDuel/internal/proto/ws";

message WsEnvelope {
  oneof payload {
    // Server → Client
    StateUpdate state_update = 1;
    RoomFullError room_full = 2;

    // Client → Server
    ClientJoin join = 10;
    SpawnBot spawn_bot = 11;
    AddWaypoint add_waypoint = 12;
    UpdateWaypoint update_waypoint = 13;
    MoveWaypoint move_waypoint = 14;
    DeleteWaypoint delete_waypoint = 15;
    ClearWaypoints clear_waypoints = 16;
    ConfigureMissile configure_missile = 17;
    AddMissileWaypoint add_missile_waypoint = 18;
    UpdateMissileWaypointSpeed update_missile_waypoint_speed = 19;
    MoveMissileWaypoint move_missile_waypoint = 20;
    DeleteMissileWaypoint delete_missile_waypoint = 21;
    ClearMissileRoute clear_missile_route = 22;
    AddMissileRoute add_missile_route = 23;
    RenameMissileRoute rename_missile_route = 24;
    DeleteMissileRoute delete_missile_route = 25;
    SetActiveMissileRoute set_active_missile_route = 26;
    LaunchMissile launch_missile = 27;
  }
}
```

### Core Message Types

```protobuf
// Server → Client: Full game state
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
}

// Server → Client: Room full error
message RoomFullError {
  string message = 1;
}

// Client → Server: Join game
message ClientJoin {
  string name = 1;
  string room = 2;
  double map_w = 3;
  double map_h = 4;
}

// Client → Server: Spawn bot
message SpawnBot {}

// Client → Server: Waypoint operations
message AddWaypoint {
  double x = 1;
  double y = 2;
  double speed = 3;
}

message UpdateWaypoint {
  int32 index = 1;
  double speed = 2;
}

message MoveWaypoint {
  int32 index = 1;
  double x = 2;
  double y = 3;
}

message DeleteWaypoint {
  int32 index = 1;
}

message ClearWaypoints {}

// Client → Server: Missile configuration
message ConfigureMissile {
  double missile_speed = 1;
  double missile_agro = 2;
}

// Client → Server: Missile waypoint operations
message AddMissileWaypoint {
  string route_id = 1;
  double x = 2;
  double y = 3;
  double speed = 4;
}

message UpdateMissileWaypointSpeed {
  string route_id = 1;
  int32 index = 2;
  double speed = 3;
}

message MoveMissileWaypoint {
  string route_id = 1;
  int32 index = 2;
  double x = 3;
  double y = 4;
}

message DeleteMissileWaypoint {
  string route_id = 1;
  int32 index = 2;
}

message ClearMissileRoute {
  string route_id = 1;
}

// Client → Server: Missile route operations
message AddMissileRoute {
  string name = 1;
}

message RenameMissileRoute {
  string route_id = 1;
  string name = 2;
}

message DeleteMissileRoute {
  string route_id = 1;
}

message SetActiveMissileRoute {
  string route_id = 1;
}

message LaunchMissile {
  string route_id = 1;
}
```

### Supporting Types

```protobuf
// Ship/ghost snapshot
message Ghost {
  string id = 1;
  double x = 2;
  double y = 3;
  double vx = 4;
  double vy = 5;
  double t = 6;
  bool self = 7;
  repeated Waypoint waypoints = 8;
  int32 current_waypoint_index = 9;
  int32 hp = 10;
  int32 kills = 11;
  optional ShipHeatView heat = 12;
}

// Waypoint position/speed
message Waypoint {
  double x = 1;
  double y = 2;
  double speed = 3;
}

// Room constants
message RoomMeta {
  double c = 1;  // Speed of light
  double w = 2;  // World width
  double h = 3;  // World height
}

// Missile snapshot
message Missile {
  string id = 1;
  string owner = 2;
  bool self = 3;
  double x = 4;
  double y = 5;
  double vx = 6;
  double vy = 7;
  double t = 8;
  double agro_radius = 9;
  double lifetime = 10;
  double launch_time = 11;
  double expires_at = 12;
  string target_id = 13;
  optional ShipHeatView heat = 14;
}

// Missile configuration
message MissileConfig {
  double speed = 1;
  double speed_min = 2;
  double speed_max = 3;
  double agro_min = 4;
  double agro_radius = 5;
  double lifetime = 6;
  optional HeatParams heat_config = 7;
}

// Missile route
message MissileRoute {
  string id = 1;
  string name = 2;
  repeated Waypoint waypoints = 3;
}

// Heat view (abbreviated field names match JSON)
message ShipHeatView {
  double v = 1;   // value
  double m = 2;   // max
  double w = 3;   // warnAt
  double o = 4;   // overheatAt
  double ms = 5;  // markerSpeed
  double su = 6;  // stallUntil
  double ku = 7;  // kUp
  double kd = 8;  // kDown
  double ex = 9;  // exp
}

// Heat parameters
message HeatParams {
  double max = 1;
  double warn_at = 2;
  double overheat_at = 3;
  double marker_speed = 4;
  double k_up = 5;
  double k_down = 6;
  double exp = 7;
}
```

## Field Naming Conventions

- Use `snake_case` for proto field names (protobuf convention)
- Generated Go code will use `PascalCase` (Go convention)
- Generated TypeScript code will use `camelCase` (TypeScript convention)
- Exception: `ShipHeatView` uses abbreviated names to match existing JSON contract

## Optional vs Required Fields

- Use `optional` keyword for fields that may be absent (e.g., `heat`, `target_id`)
- All other fields have default values (0, "", false, empty array) per proto3 semantics
- Document where zero values have special meaning (e.g., speed = 0 means "no speed set")

## Enum Strategy

Phase 1 does not introduce enums. The `type` discriminator is replaced by the `oneof` mechanism in `WsEnvelope`.

Future phases will add:
- `DagNodeStatus` enum (locked, available, in_progress, completed)
- `DagNodeKind` enum (factory, unit, story)
- `StoryIntent` enum (factory, unit)

## Code Generation

### Go

```bash
protoc --go_out=. --go_opt=module=LightSpeedDuel --go_opt=paths=source_relative proto/ws_messages.proto
```

Output: `internal/proto/ws/ws_messages.pb.go`

### TypeScript

Option 1: Using `@bufbuild/protoc-gen-es`
```bash
npx @bufbuild/protoc-gen-es proto/ws_messages.proto --es_out internal/server/web/src/proto --es_opt target=ts
```

Option 2: Using `ts-proto`
```bash
protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=internal/server/web/src/proto proto/ws_messages.proto
```

Output: `internal/server/web/src/proto/ws_messages.ts`

## Versioning

Phase 1 does not include versioning. All clients/servers must be on the same proto schema.

Phase 3 will introduce:
- Protocol version negotiation during handshake
- Feature flags for gradual rollout

## Testing Strategy

1. **Manual inspection**: Generate code and verify types are correct
2. **Round-trip test**: Encode a message in Go, decode in TypeScript (via Node.js test runner)
3. **Schema validation**: Use `buf lint` to catch common proto mistakes
4. **Backwards compatibility**: Use `buf breaking` to prevent breaking changes (Phase 2+)

## Documentation

Add inline comments to proto file:
```protobuf
// StateUpdate is sent from server to client every tick (~20Hz).
// Contains full game state visible to the player, including light-delayed
// positions of other ships and missiles.
message StateUpdate { ... }
```

These comments will appear in generated code.

## Next Steps

1. Create `proto/ws_messages.proto` with above schema
2. Set up code generation scripts
3. Verify generated code compiles in both Go and TypeScript
4. Proceed to backend implementation (backend.md)
