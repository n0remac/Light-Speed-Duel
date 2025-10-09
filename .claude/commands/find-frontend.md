---
description: Find frontend TypeScript code
---

Find frontend code in the TypeScript source directory.

**IMPORTANT**: Frontend source is in `.ts` files, NOT `.js` files!

Frontend structure:
- `internal/server/web/src/main.ts` - Game entry point
- `internal/server/web/src/lobby.ts` - Lobby entry point
- `internal/server/web/src/game.ts` - Game rendering (Canvas)
- `internal/server/web/src/net.ts` - WebSocket client
- `internal/server/web/src/bus.ts` - Event bus system
- `internal/server/web/src/state.ts` - State management
- `internal/server/web/src/tutorial/` - Tutorial system
- `internal/server/web/src/story/` - Story/dialogue system
- `internal/server/web/src/audio/` - Audio engine

**Always edit `.ts` files in `internal/server/web/src/`**
**Never edit `.js` files in `internal/server/web/` (they are generated)**
