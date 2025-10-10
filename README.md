# Light Speed Duel

Light Speed Duel is a 2D top‑down space duel where you never see anyone’s true real‑time position. Every ship and missile is rendered at its light‑delayed position, so combat is all about prediction, timing, and route planning.

## Play

- Website: https://lightspeedduel.com
- Local quick play (auto room): http://localhost:8080/play
- Lobby and room picker: http://localhost:8080 or http://localhost:8080/lobby

## What’s in the game

- Light‑time rendering: you and opponents are visible only at delayed positions.
- Route planning: click to lay out multi‑leg paths; the ship accelerates, cruises, and decelerates to stop cleanly at each leg.
- Heat system: sprint above the marker speed to build heat; hitting overheat triggers a short stall (no thrust). UI shows warn/overheat and recovery.
- Missiles: configurable speed/aggro, pursue within aggro radius. Multiple missile routes supported.
- Game modes: tutorial, story, and freeplay (use /play for a quick freeplay room).
- Map and zoom: multiple map sizes, smooth zoom; mobile pinch‑zoom fixes.
- AI opponent: optional bot for solo testing.
- Audio: music and sound effects, with a mute toggle.

## Run locally

Prereqs: Go 1.25+ (go toolchain auto‑fetch is supported).

1) Install deps

```bash
go mod tidy
```

2) Build web assets (optional for development; rerun after editing TS)

```bash
go generate ./internal/server
```

3) Start the server

```bash
go run .
```

The server listens on :8080 by default. You can override with:

```bash
go run . -addr 127.0.0.1:8080
```

Then open one of:

- http://localhost:8080/play — instant freeplay room
- http://localhost:8080 — lobby with room selector

Tip: There’s a developer script `restart-dev.sh` that builds a trimmed binary and runs it on 127.0.0.1:8082. It’s optional and may require adjusting paths for your environment.

## Tech stack

- Go (authoritative ECS‑style sim, per‑player light‑delayed views) with Gorilla WebSocket
- TypeScript + Canvas (bundled with esbuild via `go generate` and embedded into the Go binary)

## How it plays

- Neither player has instant information; you have to predict where the enemy will be by the time your shots or intercepts arrive.
- Sprinting raises heat; plan cool‑down legs or short waits to avoid stalls.
- Missiles and light‑delay make baiting and timing windows central to duels.
