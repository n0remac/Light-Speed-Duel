# Claude Code Features for Light Speed Duel

This directory contains Claude Code configurations to enhance development on this project.

## Available Slash Commands

Use these commands by typing `/command-name` in Claude Code:

### Build & Development
- `/build-frontend` - Compile TypeScript to JavaScript using esbuild
- `/build-all` - Build complete project (TypeScript + Go)
- `/dev` - Start development server with restart-dev.sh
- `/test-local` - Instructions for local testing with multiple clients

### Code Navigation
- `/find-frontend` - Locate TypeScript source files (NOT the compiled .js!)
- `/find-game-logic` - Find Go game logic and physics code
- `/architecture` - Explain project structure and patterns

### Specific Systems
- `/event-bus` - Work with the EventBus communication system
- `/websocket` - Understand WebSocket message protocol
- `/physics` - Learn about relativistic physics and light-time delays
- `/git-commit` - Commit changes following project conventions

## Important Files

- **CLAUDE.md** - Comprehensive development guide (read this first!)
- **.claudeignore** - Tells Claude to ignore compiled .js files
- **.gitignore** - Git ignore patterns

## Key Reminders

### ⚠️ Critical: TypeScript vs JavaScript
- **ALWAYS edit `.ts` files** in `internal/server/web/src/`
- **NEVER edit `.js` files** in `internal/server/web/` (they are generated!)
- Run `go generate ./internal/server` after editing TypeScript
- The .js files are committed to git (they're embedded in the Go binary)

### Project Structure Quick Reference
```
internal/
├── game/           # Go game logic, physics, AI
└── server/         # Go HTTP/WebSocket server
    └── web/
        ├── src/    # TypeScript SOURCE (edit here!)
        └── *.js    # Compiled OUTPUT (don't edit!)
```

### Common Workflows

**Modify Frontend**:
1. Edit files in `internal/server/web/src/*.ts`
2. Run `go generate ./internal/server`
3. Rebuild: `go build`
4. Run: `./LightSpeedDuel` or `./restart-dev.sh`

**Modify Backend**:
1. Edit files in `internal/game/*.go` or `internal/server/*.go`
2. Rebuild: `go build`
3. Run: `./LightSpeedDuel`

**Quick Dev Iteration**:
```bash
./restart-dev.sh  # Builds and runs on :8082
```

## Tips for Claude

When working on this project:
1. Always check CLAUDE.md for context
2. Remember: edit `.ts` not `.js`
3. Use slash commands for quick references
4. Frontend uses EventBus pattern - check bus.ts for events
5. Backend uses DTOs for client communication
6. Game has unique light-time delay physics

## Adding New Features

**New Frontend Feature**:
1. Add types/interfaces in appropriate `.ts` file
2. Add events to `bus.ts` EventMap if needed
3. Implement in relevant module (game, tutorial, story, audio)
4. Test with `/test-local`

**New Backend Feature**:
1. Add to appropriate package (game or server)
2. Add DTOs if client communication needed
3. Update WebSocket handlers if needed
4. Consider light-time delay implications

## Questions?

Refer to:
- `CLAUDE.md` - Full development guide
- `/architecture` - Project structure
- Source code comments for specific systems
