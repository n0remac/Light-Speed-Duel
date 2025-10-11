# 🚀 Light Speed Duel — Strategic Enhancement Roadmap

> **Goal**: Deepen the core strategic loop through enhanced control, predictive combat, resource management, and progression systems.

---

## 🎯 Core Design Loop (Current Vision)

The player's rhythm alternates between:

1. **Planning** – route and heat management
2. **Hunting** – predicting delayed positions to strike
3. **Evading** – cooling down, hiding, and countering
4. **Rearming** – configuring missiles for the next engagement

Each subsystem—movement, heat, missiles, upgrades, and story—feeds this loop.

---

## 🧭 Phase 1: Enhanced Route Planning & Heat Visualization

**Objective**: Make route planning feel precise, visual, and physically meaningful.

### Backend Changes (Go)

#### 1.1 Waypoint Mutation API
**File**: `internal/game/routes.go`

```go
// Add new method to Room
func (r *Room) MoveShipWaypoint(shipID EntityID, index int, newPos Vec2) {
    if route := r.World.ShipRoute(shipID); route != nil {
        if index >= 0 && index < len(route.Waypoints) {
            route.Waypoints[index].Pos = newPos
        }
    }
}
```

#### 1.2 WebSocket Message Types
**File**: `internal/server/dto.go`

Add new DTO for waypoint drag:
```go
type moveWaypointDTO struct {
    Index int     `json:"index"`
    X     float64 `json:"x"`
    Y     float64 `json:"y"`
}
```

**File**: `internal/server/ws.go`

Add handler in `handlePlayerMessage`:
```go
case "move_waypoint":
    var dto moveWaypointDTO
    if err := json.Unmarshal(msg.Data, &dto); err == nil {
        room.MoveShipWaypoint(shipID, dto.Index, Vec2{dto.X, dto.Y})
    }
```

#### 1.3 Heat Projection System
**File**: `internal/game/heat.go`

Add function to calculate projected heat for a route:
```go
// ProjectHeatForRoute simulates heat changes along a planned route
func ProjectHeatForRoute(current HeatComponent, waypoints []ShipWaypoint, now float64) []float64 {
    projected := make([]float64, len(waypoints)+1)
    projected[0] = current.S.Value
    h := current

    for i, wp := range waypoints {
        // Simplified simulation: estimate time to waypoint, integrate heat
        // This is approximate - client will show estimated heat spikes
        projected[i+1] = h.S.Value // Placeholder for actual projection
    }
    return projected
}
```

### Frontend Changes (TypeScript)

#### 1.4 Drag-to-Move Waypoints
**File**: `internal/server/web/src/game.ts`

Add waypoint drag state and handlers:
```typescript
let draggedWaypoint: number | null = null;
let dragStartPos: { x: number; y: number } | null = null;

function onCanvasPointerDown(e: PointerEvent) {
    // ... existing code ...

    // Check if clicking on waypoint (visual detection)
    if (uiStateRef.shipTool === "select" && stateRef.me?.waypoints) {
        const wp = findWaypointAtPosition(mouseX, mouseY);
        if (wp !== null) {
            draggedWaypoint = wp;
            dragStartPos = { x: mouseX, y: mouseY };
            cv?.setPointerCapture(e.pointerId);
        }
    }
}

function onCanvasPointerMove(e: PointerEvent) {
    if (draggedWaypoint !== null && dragStartPos) {
        const worldPos = screenToWorld(e.offsetX, e.offsetY);
        sendMessage({
            type: "move_waypoint",
            index: draggedWaypoint,
            x: worldPos.x,
            y: worldPos.y
        });
        // Optimistic update
        stateRef.me!.waypoints[draggedWaypoint].x = worldPos.x;
        stateRef.me!.waypoints[draggedWaypoint].y = worldPos.y;
    }
}
```

#### 1.5 Heat-Weighted Route Visualization
**File**: `internal/server/web/src/game.ts`

Enhance route rendering with heat-based colors:
```typescript
function drawShipRoute(ship: ShipSnapshot) {
    if (!ship.waypoints || !ship.heat) return;

    let pos = { x: ship.x, y: ship.y };
    let currentHeat = ship.heat.value;

    for (let i = 0; i < ship.waypoints.length; i++) {
        const wp = ship.waypoints[i];
        const segmentHeat = estimateHeatChange(pos, wp, currentHeat, ship.heat);

        // Color based on projected heat
        const heatRatio = segmentHeat / ship.heat.max;
        const color = interpolateColor(
            [100, 150, 255], // cool blue
            [255, 50, 50],   // hot red
            heatRatio
        );

        ctx.strokeStyle = `rgb(${color.join(',')})`;
        ctx.lineWidth = 2 + (heatRatio * 4); // Thicker at high heat

        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(wp.x, wp.y);
        ctx.stroke();

        // Draw heat value tooltip on hover
        if (isNearSegment(mousePos, pos, wp)) {
            drawHeatTooltip(wp.x, wp.y, segmentHeat);
        }

        pos = wp;
        currentHeat = segmentHeat;
    }
}
```

#### 1.6 "Hold" Command (Stop Thrust)
**File**: `internal/server/web/src/game.ts`

Add keyboard shortcut and UI button:
```typescript
function onKeyDown(e: KeyboardEvent) {
    // ... existing shortcuts ...

    if (e.key === "h" || e.key === "H") {
        sendMessage({ type: "clear_waypoints" });
        busRef.emit("ship:waypointsCleared");
    }
}
```

**Note**: Clearing waypoints already stops the ship (no waypoint = zero velocity in `updateShips`).

### EventBus Integration
**File**: `internal/server/web/src/bus.ts`

Add events:
```typescript
export interface EventMap {
    // ... existing events ...
    "ship:waypointMoved": { index: number; x: number; y: number };
    "ship:heatProjectionUpdated": { heatValues: number[] };
    "ship:holdToggled": { active: boolean };
}
```

---

## 🔥 Phase 2: Missile Economy & Heat Integration

**Objective**: Transform missiles from spam tools into tactical assets with heat costs.

### Backend Changes (Go)

#### 2.1 Missile Launch Heat Cost
**File**: `internal/game/consts.go`

Add new constants:
```go
const (
    MissileLaunchHeatBase = 15.0  // Base heat cost per missile
    MissileLaunchHeatScale = 0.1  // Additional heat per speed unit
)
```

#### 2.2 Heat-Based Launch System
**File**: `internal/game/room.go`

Modify missile launch to deduct heat:
```go
func (r *Room) LaunchMissile(shipID EntityID, route *MissileRoute, cfg MissileConfig) error {
    heat := r.World.HeatData(shipID)
    if heat != nil {
        launchCost := MissileLaunchHeatBase + (cfg.Speed * MissileLaunchHeatScale)

        // Check if launch would cause overheat
        if heat.S.Value + launchCost >= heat.P.OverheatAt {
            return fmt.Errorf("insufficient heat capacity")
        }

        // Apply heat cost
        heat.S.Value += launchCost
    }

    // ... existing missile spawn logic ...
    return nil
}
```

#### 2.3 Missile Crafting Queue (Future)
**File**: `internal/game/ecs.go`

Add new component for missile inventory:
```go
type MissileInventory struct {
    Ready    []MissileConfig // Missiles ready to launch
    Queue    []MissileConfig // Missiles being crafted
    MaxReady int             // Inventory limit (e.g., 5)
}

const CompMissileInventory ComponentKey = "missile_inventory"
```

**File**: `internal/game/systems.go`

Add crafting system (runs each tick):
```go
func updateMissileCrafting(r *Room, dt float64) {
    // Process crafting queue - missiles take time to build
    // Energy accumulates from heat dissipation cycles
    // Completed missiles move from Queue to Ready
}
```

### Frontend Changes (TypeScript)

#### 2.4 Launch Heat Indicator
**File**: `internal/server/web/src/game.ts`

Show heat cost before launch:
```typescript
function updateMissileLaunchButtonState() {
    const route = getActiveMissileRoute();
    const heat = stateRef.me?.heat;

    if (route && heat) {
        const launchCost = 15 + (stateRef.missileConfig.speed * 0.1);
        const wouldOverheat = (heat.value + launchCost) >= heat.overheatAt;

        if (missileLaunchBtn) {
            missileLaunchBtn.disabled = wouldOverheat || !route.waypoints.length;
        }

        if (missileLaunchInfo) {
            missileLaunchInfo.innerHTML = wouldOverheat
                ? `⚠️ Overheat risk (+${launchCost.toFixed(1)} heat)`
                : `Heat cost: +${launchCost.toFixed(1)}`;
        }
    }
}
```

#### 2.5 Missile Configuration Presets
**File**: `internal/server/web/src/state.ts`

Add missile preset system:
```typescript
export interface MissilePreset {
    name: string;
    speed: number;
    agroRadius: number;
}

export const MISSILE_PRESETS: MissilePreset[] = [
    { name: "Scout", speed: 100, agroRadius: 1500 },
    { name: "Hunter", speed: 180, agroRadius: 800 },
    { name: "Sniper", speed: 240, agroRadius: 300 },
];
```

---

## ⚙️ Phase 3: Upgrade & Progression System

**Objective**: Add persistent strategic variety and long-term goals.

### Backend Changes (Go)

#### 3.1 Player Profile System
**File**: `internal/server/profile.go` (new file)

```go
package server

type PlayerProfile struct {
    ID       string
    Upgrades map[string]int // upgrade_id -> level
    XP       int
    Matches  int
}

type UpgradeDefinition struct {
    ID          string
    Name        string
    Description string
    Branch      string // "engineering", "tactics", "combat"
    MaxLevel    int
    Effects     map[string]float64 // param -> value modifier
}

var UpgradeTree = []UpgradeDefinition{
    {
        ID: "heat_dissipation",
        Name: "Enhanced Cooling",
        Branch: "engineering",
        MaxLevel: 3,
        Effects: map[string]float64{
            "heat_kdown": 4.0, // +4 per level
        },
    },
    {
        ID: "sensor_range",
        Name: "Long-Range Sensors",
        Branch: "tactics",
        MaxLevel: 3,
        Effects: map[string]float64{
            "perception_bonus": 50.0, // +50 units per level
        },
    },
    // ... more upgrades
}
```

#### 3.2 Apply Upgrades to ECS
**File**: `internal/game/room.go`

Modify ship creation to apply upgrades:
```go
func (r *Room) CreatePlayerShip(playerID string, profile *PlayerProfile) EntityID {
    // ... existing ship creation ...

    // Apply heat upgrades
    if level := profile.Upgrades["heat_dissipation"]; level > 0 {
        heat.P.KDown += float64(level) * 4.0
    }

    return shipID
}
```

### Frontend Changes (TypeScript)

#### 3.3 Upgrade UI
**File**: `internal/server/web/src/upgrades.ts` (new file)

```typescript
import type { EventBus } from "./bus";

export interface UpgradeNode {
    id: string;
    name: string;
    branch: "engineering" | "tactics" | "combat";
    level: number;
    maxLevel: number;
    cost: number;
    description: string;
}

export function initUpgradeUI(bus: EventBus) {
    // Modal or screen showing upgrade tree
    // Grid or branch layout
    // Click to purchase with XP
}
```

**File**: `internal/server/web/lobby.html`

Add upgrade button to lobby UI.

---

## 🌌 Phase 4: Environmental Strategy

**Objective**: Add spatial elements that affect perception and heat.

### Backend Changes (Go)

#### 4.1 Obstacle Components
**File**: `internal/game/ecs.go`

```go
type ObstacleComponent struct {
    Radius      float64
    Type        string // "asteroid", "station"
    BlocksLight bool
    CoolsShips  bool
    CoolRate    float64 // heat/s reduction when docked
}

const CompObstacle ComponentKey = "obstacle"
```

#### 4.2 Occlusion System
**File**: `internal/game/perception.go`

Add line-of-sight check:
```go
func IsOccluded(observerPos, targetPos Vec2, world *World) bool {
    // Raycast between observer and target
    // Check intersection with obstacles where BlocksLight == true
    // Return true if blocked
}

// Modify PerceiveEntity to check occlusion
func PerceiveEntity(observerPos Vec2, targetID EntityID, world *World, now float64) (Snapshot, bool) {
    targetTr := world.Transform(targetID)
    if targetTr == nil {
        return Snapshot{}, false
    }

    // Check occlusion
    if IsOccluded(observerPos, targetTr.Pos, world) {
        return Snapshot{}, false // Cannot see through obstacles
    }

    // ... existing light-delay logic ...
}
```

#### 4.3 Station Cooling Zones
**File**: `internal/game/systems.go`

Add to `updateShips`:
```go
// Check if ship is near a cooling station
world.ForEach([]ComponentKey{CompTransform, CompObstacle}, func(obstID EntityID) {
    obst := world.Obstacle(obstID)
    if obst != nil && obst.CoolsShips {
        obstTr := world.Transform(obstID)
        dist := tr.Pos.Sub(obstTr.Pos).Len()
        if dist <= obst.Radius {
            // Apply cooling bonus
            heat.S.Value -= obst.CoolRate * dt
            if heat.S.Value < 0 {
                heat.S.Value = 0
            }
        }
    }
})
```

### Frontend Changes (TypeScript)

#### 4.4 Render Obstacles
**File**: `internal/server/web/src/game.ts`

```typescript
function drawObstacles() {
    // Receive obstacle positions from server
    // Draw asteroids (gray circles)
    // Draw stations (blue circles with cooling icon)
    // Draw occlusion shadows on perception rays
}
```

---

## 🧠 Phase 5: AI & Tutorial Expansion

**Objective**: Teach new systems through AI behavior and tutorial steps.

### Backend Changes (Go)

#### 5.1 Heat-Aware AI
**File**: `internal/game/ai_defensive.go`

Enhance AI decision-making:
```go
func (ai *DefensiveAI) updateDecision(world *World, shipID EntityID, now float64) {
    heat := world.HeatData(shipID)

    // If overheating, prioritize cooling
    if heat != nil && heat.S.Value > heat.P.WarnAt {
        ai.mode = "cooling"
        // Clear waypoints or set low-speed retreat waypoint
        return
    }

    // ... existing threat assessment ...
}
```

#### 5.2 AI Personality Traits
**File**: `internal/game/ai_types.go`

Add heat thresholds per AI type:
```go
type AIPersonality struct {
    Name            string
    HeatTolerance   float64 // % of max heat before retreat
    AggressionLevel float64 // 0-1, affects engagement distance
    // ... other traits
}

var Personalities = map[string]AIPersonality{
    "sniper": {HeatTolerance: 0.5, AggressionLevel: 0.3},
    "brawler": {HeatTolerance: 0.9, AggressionLevel: 0.9},
}
```

### Frontend Changes (TypeScript)

#### 5.3 Tutorial Chapters for New Systems
**File**: `internal/server/web/src/tutorial/steps_heat.ts` (new file)

```typescript
import type { TutorialStep } from "./engine";

export const heatTutorialSteps: TutorialStep[] = [
    {
        id: "heat-intro",
        text: "Your ship generates heat when flying above 150 units/s. Watch the heat bar!",
        highlight: "#heat-bar",
        condition: () => state.me?.heat?.value > 0,
    },
    {
        id: "heat-overheat",
        text: "If heat reaches 100, your engines stall for 2.5 seconds. Plan your speed carefully!",
        condition: () => state.me?.heat?.value >= 70,
    },
    // ... more steps
];
```

**File**: `internal/server/web/src/tutorial/index.ts`

Register new tutorial:
```typescript
export function initTutorials(bus: EventBus, state: AppState) {
    registerTutorial("basic_flight", basicSteps);
    registerTutorial("heat_management", heatTutorialSteps);
    registerTutorial("missile_crafting", missileCraftingSteps);
}
```

---

## 🧩 Implementation Roadmap

### Sprint Priority Matrix

| Phase | System | Complexity | Files to Modify | Priority |
|-------|--------|-----------|-----------------|----------|
| **1** | Waypoint Dragging | ★★ | `routes.go`, `ws.go`, `dto.go`, `game.ts` | High |
| **1** | Heat Visualization | ★★ | `game.ts`, `state.ts` | High |
| **1** | Hold Command | ★ | `game.ts`, `bus.ts` | Medium |
| **2** | Missile Heat Cost | ★★ | `room.go`, `consts.go`, `game.ts` | High |
| **2** | Launch Restrictions | ★★ | `game.ts`, `state.ts` | High |
| **2** | Crafting Queue | ★★★★ | `ecs.go`, `systems.go`, `dto.go` | Low (Future) |
| **3** | Upgrade System | ★★★ | `profile.go`, `room.go`, `upgrades.ts` | Medium |
| **3** | Persistence | ★★ | `profile.go`, database integration | Medium |
| **4** | Obstacles | ★★★ | `ecs.go`, `perception.go`, `game.ts` | Low |
| **4** | Stations | ★★★ | `systems.go`, `game.ts` | Low |
| **5** | AI Heat Logic | ★★ | `ai_defensive.go`, `ai_types.go` | Medium |
| **5** | Tutorial Expansion | ★★ | `tutorial/steps_*.ts` | High |

### Implementation Sequence

**Sprint 1-2: Core UX Improvements**
- Implement waypoint dragging (routes.go, game.ts, ws.go, dto.go)
- Add heat-colored route rendering (game.ts)
- Create heat projection visualization (heat.go, game.ts)

**Sprint 3-4: Missile Economy**
- Add missile launch heat cost (room.go, consts.go)
- Update launch UI with heat warnings (game.ts)
- Tune missile heat balance through playtesting

**Sprint 5-6: Progression Foundation**
- Build upgrade system backend (profile.go)
- Create upgrade tree UI (upgrades.ts)
- Integrate upgrades into ship creation (room.go)

**Sprint 7-8: Environmental Elements**
- Implement obstacle ECS components (ecs.go)
- Add occlusion to perception system (perception.go)
- Render obstacles and stations (game.ts)

**Sprint 9-10: AI & Learning**
- Enhance AI heat awareness (ai_defensive.go)
- Create heat management tutorial (tutorial/steps_heat.ts)
- Add missile crafting tutorial steps

---

## 📐 Architecture Notes

### Key Design Patterns

**Backend (Go)**
- Use ECS components for all game entities (`CompHeat`, `CompObstacle`)
- Define constants in `consts.go`, never hardcode
- Add DTOs for new WebSocket messages in `dto.go`
- Extend Room methods for gameplay mutations (`MoveShipWaypoint`)

**Frontend (TypeScript)**
- Emit EventBus events for all UI interactions
- Update `AppState` for all game state changes
- Keep rendering logic in `game.ts` `draw*` functions
- Use TypeScript interfaces for all data structures

**Network Protocol**
- Define message types in `ws.go` message switch
- Keep DTOs lightweight (use abbreviations like `shipHeatViewDTO`)
- Server authoritative: validate all mutations on backend

### Testing Strategy
- Unit test heat projection in `heat_test.go`
- Integration test upgrade application in `room_test.go`
- Manual playtest each sprint for balance tuning

---

## 🎯 Success Metrics

**Phase 1**: Players use heat visualization to plan efficient routes (telemetry: heat bar attention time)

**Phase 2**: Missile spam reduces by 60% (telemetry: launches per minute)

**Phase 3**: 70% of players engage with upgrade system (telemetry: upgrade purchases)

**Phase 4**: Environmental tactics emerge (telemetry: station proximity time)

**Phase 5**: Tutorial completion rate >80% (telemetry: tutorial abandonment rate)
