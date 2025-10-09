---
description: Build TypeScript frontend to JavaScript
---

Build the TypeScript frontend by running the esbuild compilation step. This compiles:
- `internal/server/web/src/main.ts` → `internal/server/web/client.js`
- `internal/server/web/src/lobby.ts` → `internal/server/web/lobby.js`

Run: `go generate ./internal/server`

Important: This only builds the TypeScript. To run the server, you also need to rebuild the Go binary.
