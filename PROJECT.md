# Light Speed Duel - Technical Overview

## Purpose

Light Speed Duel is a real-time multiplayer space combat game that simulates relativistic physics through light-time delay mechanics. Unlike traditional games where players see real-time positions, this game enforces causality: players observe opponents only as they were in the past, delayed by the time light takes to travel between ships.

This creates a unique strategic gameplay where combat revolves around prediction, information warfare, and understanding that all information—including your own ship's position—is subject to the same light-speed constraints.

## Architecture

### System Design

The application follows a client-server architecture with an authoritative server model:

```
┌─────────────────┐         WebSocket          ┌──────────────────┐
│  Browser Client │◄──────────────────────────►│   Go Server      │
│  (TypeScript)   │  Per-player delayed views  │  (Authoritative) │
└─────────────────┘                            └──────────────────┘
        │                                               │
        │ Canvas Rendering                              │ ECS Simulation
        │ Event Bus                                     │ Light-time Calc
        │ State Management                              │ Physics Engine
        └───────────────────────────────────────────────┘
```

**Key Design Principles:**

1. **Server Authority**: All game state lives on the server. The server runs the physics simulation, processes player inputs, and calculates per-player views.

2. **Per-Player Perception**: Each client receives a unique view of the game world based on light-time delays calculated from their ship's position.

3. **Event-Driven Frontend**: The TypeScript client uses a central event bus for decoupled component communication.

4. **Embedded Deployment**: The frontend is compiled to JavaScript and embedded directly into the Go binary using `//go:embed`, creating a single deployable artifact.

### Component Architecture

#### Backend (Go)

**Package Structure:**
- `internal/game/`: Core game logic (ECS, physics, AI)
- `internal/server/`: HTTP/WebSocket networking layer

**Game Engine (ECS Pattern):**
```
World
  ├── Entities (EntityID)
  ├── Components
  │   ├── Transform (position, velocity, angle)
  │   ├── History (circular buffer of past states)
  │   ├── Missile (homing behavior, agro radius)
  │   ├── Ship (heat, waypoints, cooldowns)
  │   └── Player (connection, perception)
  └── Systems
      ├── MovementSystem (waypoint navigation)
      ├── MissileSystem (homing, lifetime)
      ├── PerceptionSystem (light-delay calculations)
      └── AISystem (bot behaviors)
```

**Perception Pipeline:**
```go
// For each player at time T:
1. Get observer position
2. For each entity in world:
   - Calculate distance to entity
   - Calculate retarded time: tRet = T - (distance / C)
   - Query entity's history buffer at tRet
   - Return delayed snapshot if available
3. Send per-player view via WebSocket
```

#### Frontend (TypeScript)

**Module Organization:**
```
src/
  ├── main.ts          # Game entry point
  ├── lobby.ts         # Lobby entry point
  ├── game.ts          # Rendering engine, input handling
  ├── net.ts           # WebSocket client
  ├── bus.ts           # Event bus (pub/sub)
  ├── state.ts         # Centralized app state
  ├── tutorial/        # Tutorial system
  ├── story/           # Story/dialogue system
  └── audio/           # Audio engine
```

**Event-Driven Architecture:**
```typescript
// Central event bus coordinates all subsystems
EventBus
  ├── "ship:waypointAdded"     → UI updates, audio cues
  ├── "missile:launched"       → Animation, sound
  ├── "tutorial:stepCompleted" → Progress tracking
  └── "state:updated"          → Re-render

// Decoupled communication
bus.emit("ship:waypointAdded", { index: 0 });
bus.on("ship:waypointAdded", updateWaypointUI);
```

## Technical Stack

### Backend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Language | Go 1.22+ | High-performance server, concurrent handling |
| WebSocket | Gorilla WebSocket | Real-time bidirectional communication |
| Build | esbuild (embedded) | TypeScript compilation at build time |
| Deployment | Systemd service | Linux server process management |

**Key Libraries:**
- Standard library for HTTP/JSON
- Gorilla WebSocket for upgrade handling
- No external game engine dependencies

### Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Language | TypeScript | Type-safe client code |
| Rendering | Canvas 2D API | High-performance 2D graphics |
| Build | esbuild | Fast bundling and minification |
| Audio | Web Audio API | Music and sound effects |

**No frameworks**: Vanilla TypeScript with functional patterns for minimal bundle size and maximum control.

### Build System

```bash
# TypeScript compilation
go generate ./internal/server  # Runs esbuild via Go

# Embedding
//go:embed web/*.html web/*.js web/*.css
var webFiles embed.FS

# Single binary output
go build -o LightSpeedDuel
```

The build process is integrated into Go tooling, making deployment a single static binary with all assets embedded.

## Major Components

### 1. Game Simulation Engine (Go)

**Location**: `internal/game/`

**Core Systems:**
- **Physics**: Vector math (Vec2), velocity integration, acceleration/deceleration curves
- **ECS**: Entity-component-system for scalable entity management
- **Movement**: Waypoint-based navigation with automatic speed curves
- **Missile System**: Homing missiles with configurable speed/agro radius
- **Heat System**: Overheat mechanics with time dilation effects on cooldowns

**Key Files:**
- `core.go`: Vec2 math, History circular buffer
- `ecs.go`: Entity component system implementation
- `systems.go`: Movement, missile, and physics systems
- `perception.go`: Light-time delay calculations
- `room.go`: Game room/lobby management

### 2. Perception System (Relativistic Delays)

**Location**: `internal/game/perception.go`

The heart of the unique gameplay mechanic:

```go
func PerceiveEntity(observerPos Vec2, target EntityID, world *World, now float64) (Snapshot, bool) {
    distance := observerPos.Sub(tr.Pos).Len()
    tRet := now - (distance / C)  // Retarded time
    snap, ok := hist.History.GetAt(tRet)  // Historical lookup
    return snap, ok
}
```

**Features:**
- Circular buffer stores position history
- Binary search for efficient historical lookup
- Handles entity destruction (light cutoff)
- Same delay applies to player's own ship (no privileged information)

### 3. WebSocket Server

**Location**: `internal/server/ws.go`

**Message Types:**
- `join`: Player connects to room
- `waypoint`: Add navigation waypoint
- `missile_config`: Configure missile parameters
- `missile_route`: Launch missile on route
- `spawn_bot`: Add AI opponent

**Per-Player Updates:**
- Server calculates unique light-delayed view for each player
- 60 FPS update rate
- Efficient JSON serialization

### 4. Frontend Renderer

**Location**: `internal/server/web/src/game.ts`

**Rendering Pipeline:**
1. Receive state updates via WebSocket
2. Update centralized AppState
3. Emit state change events
4. Render loop draws:
   - Background/grid
   - Ships (delayed positions)
   - Missiles (with trails)
   - Waypoints and routes
   - UI overlays (heat bar, crosshair, warnings)

**Input Handling:**
- Click to add waypoints
- Right-click to launch missiles
- Keyboard shortcuts for zooming, map selection
- Mobile touch/pinch support

### 5. Tutorial System

**Location**: `internal/server/web/src/tutorial/`

**Features:**
- Step-based progression
- Highlight overlays with instructions
- Event-driven completion detection
- LocalStorage persistence
- Auto-advance and manual triggers

**Example Step:**
```typescript
{
  id: "add-waypoint",
  title: "Add a Waypoint",
  instruction: "Click anywhere to set your first destination",
  highlightId: "waypoint-tutorial-highlight",
  completionEvent: "ship:waypointAdded"
}
```

### 6. Story System

**Location**: `internal/server/web/src/story/`

**Features:**
- Chapter-based narrative
- Dialogue with character portraits
- Choice system with branching
- Flag tracking for story state
- Auto-advance dialogue

### 7. Audio Engine

**Location**: `internal/server/web/src/audio/`

**Features:**
- Music director with scene management
- SFX with spatial audio (pan/velocity)
- Automatic music ducking for dialogue
- Crossfading between tracks
- Mute/unmute controls

## Unique Features

### 1. Relativistic Light-Time Delay

**The Core Innovation:**

Every object in the game world is visible only at its **delayed position**, determined by:

```
Delay = Distance / C
```

Where C = 299 units/second (speed of light in game units).

**Implementation Details:**

1. **History Buffer**: Each entity maintains a circular buffer of past states (position, velocity, angle) with timestamps.

2. **Retarded Time Calculation**: When rendering for a player at position P observing entity E:
   ```
   distance = |P - E_current|
   tRet = T_now - (distance / C)
   E_perceived = E.history.GetAt(tRet)
   ```

3. **No Privileged Information**: Your own ship is also delayed. You see yourself as others see you, creating perfect information symmetry.

4. **Light Cutoff**: If an entity is destroyed, it stops emitting light. Observers continue to see it until the "destruction light" reaches them.

**Gameplay Implications:**

- **Prediction**: You must predict where enemies will be, not just where they appear
- **Information Warfare**: Distance = delay = advantage
- **Causality**: Strategic positioning to maximize your information while minimizing theirs
- **No Instant Feedback**: Even your own actions have delayed confirmation

### 2. Heat and Time Dilation

**Mechanic**: Ships moving faster than the "marker speed" accumulate heat.

**Consequences:**
- Heat bars show planned vs actual heat
- Overheat triggers a stall (no thrust)
- **Time dilation**: Faster ships experience slower cooldowns (relativistic effect simulation)

This forces players to balance speed (tactical advantage) with heat management (operational risk).

### 3. Configurable Missile System

**Design**: Missiles have two configurable parameters:
- **Speed**: Higher speed = shorter lifetime (harder to catch, less range)
- **Agro Radius**: Detection range (larger = shorter lifetime, easier to detect)

**Tradeoffs**:
- Fast, small agro: Precision strike (hard to see, must be accurate)
- Slow, large agro: Area denial (visible, but harder to evade)

**Homing Behavior**: Missiles pursue targets within agro radius, creating tactical depth.

### 4. Multi-Mode Gameplay

**Modes:**
- **Tutorial**: Teaches mechanics step-by-step
- **Story**: Narrative-driven missions with dialogue
- **Freeplay**: Open combat with optional AI

**Seamless Integration**: All modes share the same engine, just different initial conditions and objectives.

### 5. Single-Binary Deployment

**Build Process:**
1. esbuild compiles TypeScript → JavaScript
2. `//go:embed` embeds frontend assets into Go binary
3. Single static binary contains server + client + assets

**Benefits:**
- No separate frontend hosting needed
- Simple deployment (copy one file)
- No runtime dependencies except the binary
- Simplified CI/CD

---

## Development Philosophy

- **Physics First**: Core gameplay emerges from realistic constraints (light speed)
- **No Magic**: Players and server obey same rules (no wallhacks or instant information)
- **Type Safety**: TypeScript + Go provide compile-time guarantees
- **Event-Driven**: Decoupled systems communicate via events (extensible architecture)
- **Developer Experience**: Fast builds, hot reloading, integrated tooling

This architecture supports both the unique gameplay mechanics and rapid iteration during development.
