---
description: Commit changes following project conventions
---

When committing changes to Light Speed Duel, follow these guidelines:

**Before committing**:
1. If you modified TypeScript (.ts files), run `go generate ./internal/server` to rebuild JS
2. The compiled .js files (client.js, lobby.js) should be committed (they're embedded in the binary)

**Commit message style**:
- Use present tense: "Add feature" not "Added feature"
- Be specific about what changed
- Reference systems: "Fix missile physics", "Update tutorial step"

**Common commit patterns**:
- Game logic: `Fix missile lifetime calculation`, `Update light-time delay algorithm`
- Frontend: `Add missile route UI`, `Improve canvas rendering`
- Backend: `Optimize WebSocket broadcasting`, `Add new DTO for X`
- Build: `Update esbuild config`, `Fix build script`

**Remember**:
- Compiled JS files ARE tracked in git (they're embedded)
- Binary files (LightSpeedDuel) are NOT tracked
