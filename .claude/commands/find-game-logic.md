---
description: Find game logic and physics code
---

Find game logic and physics implementations in the Go backend. Game logic is in `internal/game/`:

Key files:
- `internal/game/core.go` - Vec2 math, History, physics utilities
- `internal/game/systems.go` - Movement, missile systems
- `internal/game/perception.go` - Light-time delay calculations
- `internal/game/ecs.go` - Entity component system
- `internal/game/room.go` - Room/lobby management
- `internal/game/ai_*.go` - AI systems
- `internal/game/consts.go` - Game constants (C, speeds, etc)

Search pattern: Look in `internal/game/*.go` files
