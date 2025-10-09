---
description: Understand WebSocket message protocol
---

The game uses WebSocket for real-time client-server communication.

**Client → Server** (see `internal/server/ws.go`):
- `join` - Join room with player name
- `waypoint` - Add waypoint to ship route
- `missile_config` - Update missile settings
- `missile_route` - Create/update missile route
- `missile_launch` - Launch a missile
- `spawn_bot` - Request AI bot spawn

**Server → Client** (see `internal/server/dto.go`):
- `snapshot` - Full game state update
- `missile_config` - Missile configuration
- `missile_route` - Missile route data
- `meta` - World metadata (c, width, height)

**Message format**:
```json
{
  "type": "message_type",
  "data": { ... }
}
```

**WebSocket client**: `internal/server/web/src/net.ts`
**WebSocket server**: `internal/server/ws.go`
**DTOs**: `internal/server/dto.go`
