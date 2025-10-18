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

4. **Binary Protocol (Protobuf)**: Client and server exchange WebSocket messages using Protocol Buffers for compact, strongly-typed payloads.

5. **Embedded Deployment**: The frontend is compiled to JavaScript and embedded directly into the Go binary using `//go:embed`, creating a single deployable artifact.

### Component Architecture

#### Backend (Go)

**Package Structure:**
- `internal/game/`: Core game logic (ECS, physics, AI, missions)
- `internal/dag/`: Deterministic DAG for upgrades, crafting, and story gating
- `internal/server/`: HTTP/WebSocket networking layer and protobuf conversion
- `internal/proto/ws/`: Generated Go protobuf types

**Game Engine (ECS Pattern):**
```
World
  ├── Entities (EntityID)
  ├── Components
  │   ├── Transform (position, velocity, angle)
  │   ├── History (circular buffer of past states)
  │   ├── Missile (homing behavior, agro radius)
  │   ├── Ship (waypoints, cooldowns)
  │   ├── Heat (value, stall state, parameters)
  │   └── Player (connection, perception)
  └── Systems
      ├── MovementSystem (waypoint navigation)
      ├── MissileSystem (homing, lifetime)
      ├── HeatSystem (thermal accumulation, stalls)
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

**Module Organization (refactored):**
```
src/
  ├── main.ts                 # Game entry point
  ├── lobby.ts                # Lobby entry point
  ├── net.ts                  # WebSocket (protobuf) client
  ├── bus.ts                  # Event bus (pub/sub)
  ├── state.ts                # Centralized app state
  ├── route.ts                # Shared route helpers (ship + missile)
  ├── game/                   # Game modules
  │   ├── logic.ts            # Core client-side logic
  │   ├── render.ts           # Canvas rendering
  │   ├── input.ts            # Input + map tools
  │   ├── ui.ts               # HUD widgets, heat bars, overlays
  │   └── camera.ts           # Camera + pan/zoom
  ├── mission/                # Campaign beacons + HUD
  │   ├── controller.ts       # Beacon hold/lock logic
  │   └── hud.ts              # Mission status UI
  ├── upgrades.ts             # Upgrades/crafting panel (DAG driven)
  ├── proto_helpers.ts        # Protobuf ↔ state adapters
  ├── proto/proto/ws_messages_pb.ts # Generated TS protobuf types
  ├── tutorial/               # Tutorial system
  ├── story/                  # Story/dialogue system
  └── audio/                  # Audio engine
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
| Protocol | Protobuf (google.golang.org/protobuf) | Compact, typed WS payloads |
| Build | esbuild (embedded) | TypeScript compilation at build time |
| Deployment | Systemd service | Linux server process management |

**Key Libraries:**
- Standard library for HTTP/JSON
- Gorilla WebSocket for upgrade handling
- Protobuf runtime for Go
- No external game engine dependencies

### Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Language | TypeScript | Type-safe client code |
| Rendering | Canvas 2D API | High-performance 2D graphics |
| Protocol | Protobuf (@bufbuild/protobuf) | Typed binary WS messages |
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
- **Heat System**: Speed-based heat accumulation with overheat stalls (ships) and heat-driven limits (missiles)

**Key Files:**
- `core.go`: Vec2 math, History circular buffer
- `ecs.go`: Entity component system implementation
- `systems.go`: Movement, missile, and physics systems
- `routes.go`: Unified route utilities (ship + missile)
- `heat.go`: Heat accumulation physics and stall mechanics
- `perception.go`: Light-time delay calculations
- `mission.go`: Campaign spawners (beacons, seekers, patrols)
- `story_effects.go`: Story DAG effect hooks
- `room.go`: Game room/lobby management
- `consts.go`: Game constants including heat parameters

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

**Protocol:**
- WebSocket frames are binary Protobuf envelopes (`proto/ws_messages.proto`).
- Go server uses generated types in `internal/proto/ws`; client uses generated TS in `internal/server/web/src/proto/proto/ws_messages_pb.ts`.

**Client → Server:**
- `join`, `spawn_bot`
- Ship routing: `add_waypoint`, `update_waypoint`, `move_waypoint`, `delete_waypoint`, `clear_waypoints`
- Missile routing: `add_missile_route`, `rename_missile_route`, `delete_missile_route`, `set_active_missile_route`, `add_missile_waypoint`, `update_missile_waypoint_speed`, `move_missile_waypoint`, `delete_missile_waypoint`, `clear_missile_route`, `launch_missile`
- DAG progression: `dag_start`, `dag_cancel`, `dag_story_ack`, `dag_list`
- Missions: `mission_spawn_wave`, `mission_story_event`

**Server → Client:**
- `state_update` (authoritative per-player view)
- `room_full` error
- `dag_list_response`

**Per-Player Updates:**
- Server calculates unique light-delayed view for each player
- Simulation: 20 Hz; WebSocket pushes: 10 Hz
- Compact Protobuf serialization

### 4. Frontend Renderer

**Location**: `internal/server/web/src/game/`

**Rendering Pipeline:**
1. Receive state updates via WebSocket
2. Update centralized AppState
3. Emit state change events
4. Render loop draws:
   - Background/grid
   - Ships (delayed positions)
   - Missiles (with trails)
   - Waypoints and routes
   - UI overlays (dual heat bars, speed markers, stall warning, crosshair)

**Input Handling:**
- Click to add waypoints
- Right-click to launch missiles
- Drag to move waypoints; in-place speed edit
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

### 8. Progression System (DAG)

**Locations**:
- Backend: `internal/dag/*`, hooks in `internal/server/ws.go`, effects in `internal/game/story_effects.go` and `internal/game/crafting.go`
- Frontend: `internal/server/web/src/upgrades.ts`, `internal/server/web/src/proto_helpers.ts`

**Concepts:**
- Validated, deterministic directed acyclic graph of nodes (craft, upgrade, story).
- Effects: speed multipliers, missile unlocks, heat capacity/efficiency.
- Player capabilities aggregated from completed upgrade nodes and included in state updates.
- Crafting nodes yield items into inventory (missile variants with heat capacity); progress persists client-side for missions.

**Client UX:**
- Upgrades panel renders available/in-progress/completed nodes and triggers `dag_start` actions. Repeatable craft nodes show timers and quantities.

## Unique Features

### 1. Relativistic Light-Time Delay

**The Core Innovation:**

Every object in the game world is visible only at its **delayed position**, determined by:

```
Delay = Distance / C
```

Where C = 600 units/second (speed of light in game units).

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

### 2. Heat Management System

**Core Mechanic**: Ships accumulate heat based on speed relative to a neutral "marker speed" threshold.

**Implementation**:

The heat system is implemented as an ECS component (`HeatComponent`) with physics-based accumulation:

```go
// Heat rate formula
dev = speed - MarkerSpeed
if dev >= 0:
    Ḣ = +KUp * (dev / MarkerSpeed)^Exp     // Heating
else:
    Ḣ = -KDown * (|dev| / MarkerSpeed)^Exp // Cooling
```

**Parameters** (from `internal/game/consts.go`):
- **Max**: 100 heat units (capacity)
- **MarkerSpeed**: 150 units/s (60% of max ship speed - neutral point)
- **WarnAt**: 70 (yellow warning threshold)
- **OverheatAt**: 100 (triggers stall)
- **StallSeconds**: 2.5s (overheat penalty duration)
- **KUp**: 22.0 (heating rate multiplier)
- **KDown**: 16.0 (cooling rate multiplier)
- **Exp**: 1.5 (nonlinear response curve)

**Consequences:**

1. **Overheat Stall**: Reaching 100 heat triggers a 2.5-second stall where the ship loses thrust completely
2. **Heat Spikes**: Missile hits have a 35% chance to add 6-18 heat units
3. **Time Dilation**: Faster ships experience slower cooldowns for missile reloads (relativistic effect simulation)

**UI Features** (`internal/server/web/src/game/ui.ts`):

- **Dual Heat Bars**:
  - Current heat bar (green → yellow → red)
  - Planned heat projection (shows predicted heat based on waypoint route)
- **Speed Marker**: Visual indicator showing the neutral speed on the speed slider
- **Stall Overlay**: Warning screen when overheated
- **Color Coding**:
  - Green: Normal (< 70)
  - Yellow: Warning (70-99)
  - Red: Overheat (100)

**Route Planning Integration**:

The frontend calculates projected heat for the entire waypoint route using the same physics formula, allowing players to plan routes that avoid overheating. The `projectPlannedHeat()` function simulates heat accumulation across all waypoints.

**Strategic Implications:**

- **Speed vs Safety**: High-speed maneuvering provides tactical advantage but risks stall
- **Route Optimization**: Players must balance speed and distance to manage heat over long routes
- **Combat Pressure**: Missile hits can push ships over the heat limit at critical moments
- **Recovery Planning**: Slowing below marker speed allows heat dissipation for sustained operations

This system creates a resource management layer on top of the movement system, forcing players to balance aggressive maneuvering with thermal discipline.

### 3. Configurable Missile System

**Design**: Missiles have two configurable parameters:
- **Speed**: Higher speed = shorter lifetime (harder to catch, less range)
- **Agro Radius**: Detection range (larger = shorter lifetime, easier to detect)

**Tradeoffs**:
- Fast, small agro: Precision strike (hard to see, must be accurate)
- Slow, large agro: Area denial (visible, but harder to evade)

**Homing Behavior**: Missiles pursue targets within agro radius, creating tactical depth.

### 4. Integrated Route Planning with Heat Projection

**Feature**: The frontend provides live heat projection across the entire planned route.

**Implementation Details**:
- `projectPlannedHeat()` in `game/ui.ts` simulates the full waypoint path (using helpers in `route.ts`)
- Uses the same physics formula as the server for accurate prediction
- Updates in real-time as waypoints are added/modified
- Displays as a secondary "planned" heat bar overlay

**Player Benefit**: Players can see if their planned route will cause overheating before committing, enabling strategic route optimization.

### 5. Multi-Mode Gameplay

**Modes:**
- **Tutorial**: Teaches mechanics step-by-step
- **Story**: Narrative-driven missions with dialogue
- **Freeplay**: Open combat with optional AI

**Seamless Integration**: All modes share the same engine, just different initial conditions and objectives.

### 6. Single-Binary Deployment

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
