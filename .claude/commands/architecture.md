---
description: Explain project architecture
---

Explain the Light Speed Duel architecture:

**Backend (Go)**:
- `internal/game/` - Core game logic, physics, ECS, AI
- `internal/server/` - HTTP/WebSocket server, DTOs
- Uses `//go:embed` to embed frontend assets into binary
- Uses `//go:generate` to build TypeScript before Go build

**Frontend (TypeScript)**:
- `internal/server/web/src/` - TypeScript source (EDIT THESE)
- `internal/server/web/*.js` - Compiled output (DON'T EDIT)
- Event-driven architecture using EventBus pattern
- Modular: game, tutorial, story, audio systems
- Built with esbuild (via Go command)

**Key Patterns**:
- Event Bus for frontend communication
- DTOs for Go↔TypeScript messages
- Light-time delays in perception system
- Waypoint-based movement
- WebSocket for real-time updates

**Build Flow**:
1. Edit TypeScript in `internal/server/web/src/*.ts`
2. Run `go generate ./internal/server` (runs esbuild)
3. Run `go build` (embeds compiled JS)
4. Run `./LightSpeedDuel` or `./restart-dev.sh`
