---
description: Build entire project (TypeScript + Go)
---

Build the complete Light Speed Duel project:

1. First build TypeScript → JavaScript: `go generate ./internal/server`
2. Then build Go binary with embedded assets: `go build -o LightSpeedDuel`

This creates a single binary with all frontend assets embedded.

To run: `./LightSpeedDuel -addr :8080`
