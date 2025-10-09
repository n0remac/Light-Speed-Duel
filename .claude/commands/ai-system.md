---
description: Work with the AI bot system
---

The game includes AI bots for single-player testing and gameplay.

**AI System Location**: `internal/game/ai_*.go`

**Key Files**:
- `ai_types.go` - AI state, behavior types, utility functions
- `ai_defensive.go` - Defensive AI behaviors
- `ai_manager.go` - AI lifecycle management

**AI Behaviors**:
- **Defensive**: Evades missiles, maintains distance
- **Aggressive**: (if implemented) Pursues targets
- **Patrol**: (if implemented) Follows waypoints

**Spawning Bots**:

1. **From client**: Press 'b' key (if enabled)
   - Sends `spawn_bot` WebSocket message

2. **From server**: Handled in `internal/server/ws.go`
   ```go
   case "spawn_bot":
       room.SpawnBot()
   ```

3. **Bot creation**: In `internal/game/room.go`
   - Creates AI entity
   - Assigns behavior
   - Adds to ECS system

**AI Update Loop**:
- Runs in game tick (usually 60 Hz)
- AI makes decisions based on perceived state
- Also subject to light-time delays

**Customizing AI**:
1. Edit behaviors in `ai_defensive.go` or create new files
2. Update `ai_types.go` for new behavior types
3. Modify spawn logic in `room.go` for different AI configs

**Testing with AI**:
```bash
# Start server
./restart-dev.sh

# Open game
open http://localhost:8080/?room=test&mode=freeplay

# Press 'b' to spawn bot
# Or send WebSocket message: {"type": "spawn_bot"}
```
