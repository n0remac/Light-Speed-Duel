# Phase 4 Backend Changes: Environmental Strategy

**Objective**: Add spatial elements (obstacles, stations) that affect perception and heat.

---

## 4.1 Obstacle Components

**File**: `internal/game/ecs.go`

Add new component for environmental obstacles:

```go
type ObstacleComponent struct {
    Radius      float64
    Type        string  // "asteroid", "station", "debris"
    BlocksLight bool    // Blocks line-of-sight for perception
    CoolsShips  bool    // Provides cooling when docked
    CoolRate    float64 // Heat dissipation bonus (heat/s)
}

const CompObstacle ComponentKey = "obstacle"
```

**Getter method** (`internal/game/world.go`):

```go
func (w *World) Obstacle(id EntityID) *ObstacleComponent {
    if comp, ok := w.components[id][CompObstacle]; ok {
        return comp.(*ObstacleComponent)
    }
    return nil
}
```

---

## 4.2 Obstacle Factory

**File**: `internal/game/room.go`

Helper methods to spawn obstacles:

```go
// CreateAsteroid spawns a light-blocking asteroid
func (r *Room) CreateAsteroid(pos Vec2, radius float64) EntityID {
    id := r.World.NewEntity()

    r.World.Set(id, CompTransform, &TransformComponent{
        Pos: pos,
        Vel: Vec2{0, 0}, // Static obstacles for now
    })

    r.World.Set(id, CompObstacle, &ObstacleComponent{
        Radius:      radius,
        Type:        "asteroid",
        BlocksLight: true,
        CoolsShips:  false,
        CoolRate:    0,
    })

    return id
}

// CreateCoolingStation spawns a cooling station
func (r *Room) CreateCoolingStation(pos Vec2, radius float64, coolRate float64) EntityID {
    id := r.World.NewEntity()

    r.World.Set(id, CompTransform, &TransformComponent{
        Pos: pos,
        Vel: Vec2{0, 0},
    })

    r.World.Set(id, CompObstacle, &ObstacleComponent{
        Radius:      radius,
        Type:        "station",
        BlocksLight: false, // Stations don't block sight
        CoolsShips:  true,
        CoolRate:    coolRate,
    })

    return id
}

// CreateDebrisField spawns multiple small asteroids
func (r *Room) CreateDebrisField(center Vec2, count int, maxRadius float64) {
    for i := 0; i < count; i++ {
        // Random position around center
        angle := float64(i) * (2 * math.Pi / float64(count))
        offset := Vec2{
            X: math.Cos(angle) * maxRadius,
            Y: math.Sin(angle) * maxRadius,
        }
        pos := center.Add(offset)

        // Random asteroid radius
        radius := 50 + (rand.Float64() * 100) // 50-150 units

        r.CreateAsteroid(pos, radius)
    }
}
```

---

## 4.3 Occlusion System

**File**: `internal/game/perception.go`

Add line-of-sight check for obstacles:

```go
// IsOccluded checks if line-of-sight between two points is blocked
func IsOccluded(observerPos, targetPos Vec2, world *World, now float64) bool {
    // Get all obstacles
    obstacles := []EntityID{}
    world.ForEach([]ComponentKey{CompObstacle}, func(id EntityID) {
        obstacles = append(obstacles, id)
    })

    // Check intersection with each obstacle
    for _, obstID := range obstacles {
        obst := world.Obstacle(obstID)
        if obst == nil || !obst.BlocksLight {
            continue
        }

        obstTr := world.Transform(obstID)
        if obstTr == nil {
            continue
        }

        // Check if line segment intersects circle
        if lineIntersectsCircle(observerPos, targetPos, obstTr.Pos, obst.Radius) {
            return true // Blocked by this obstacle
        }
    }

    return false // Line-of-sight clear
}

// lineIntersectsCircle checks if a line segment intersects a circle
func lineIntersectsCircle(p1, p2, center Vec2, radius float64) bool {
    // Vector from p1 to p2
    d := p2.Sub(p1)
    // Vector from p1 to center
    f := p1.Sub(center)

    // Quadratic equation coefficients
    a := d.Dot(d)
    b := 2 * f.Dot(d)
    c := f.Dot(f) - radius*radius

    discriminant := b*b - 4*a*c

    if discriminant < 0 {
        return false // No intersection
    }

    // Check if intersection is within segment bounds [0, 1]
    discriminant = math.Sqrt(discriminant)
    t1 := (-b - discriminant) / (2 * a)
    t2 := (-b + discriminant) / (2 * a)

    if (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) {
        return true
    }

    return false
}
```

**Modify perception function** to use occlusion:

```go
// PerceiveEntity calculates what the observer sees of a target entity
func PerceiveEntity(observerPos Vec2, targetID EntityID, world *World, now float64) (Snapshot, bool) {
    targetTr := world.Transform(targetID)
    if targetTr == nil {
        return Snapshot{}, false
    }

    // Check occlusion BEFORE light-delay calculation
    if IsOccluded(observerPos, targetTr.Pos, world, now) {
        return Snapshot{}, false // Cannot see through obstacles
    }

    // ... existing light-delay logic ...
    distance := targetTr.Pos.Sub(observerPos).Len()
    lightDelay := distance / C // C is speed of light

    // Look back in history
    hist := world.History(targetID)
    if hist != nil {
        return hist.Sample(now - lightDelay), true
    }

    return Snapshot{}, false
}
```

---

## 4.4 Station Cooling System

**File**: `internal/game/systems.go`

Modify ship update system to apply station cooling:

```go
// updateShips processes ship movement and heat
func updateShips(r *Room, dt float64) {
    r.World.ForEach([]ComponentKey{CompTransform, CompHeat}, func(shipID EntityID) {
        tr := r.World.Transform(shipID)
        heat := r.World.HeatData(shipID)

        if tr == nil || heat == nil {
            return
        }

        // ... existing heat accumulation/dissipation logic ...

        // NEW: Check if ship is near a cooling station
        stationCooling := checkStationCooling(r.World, shipID, tr.Pos)
        if stationCooling > 0 {
            // Apply bonus cooling from station
            heat.S.Value -= stationCooling * dt
            if heat.S.Value < 0 {
                heat.S.Value = 0
            }

            // Emit event for UI feedback
            r.EventBus.Emit("ship:cooling_at_station", map[string]interface{}{
                "shipID": shipID,
                "rate":   stationCooling,
            })
        }
    })
}

// checkStationCooling returns total cooling rate from nearby stations
func checkStationCooling(world *World, shipID EntityID, shipPos Vec2) float64 {
    totalCooling := 0.0

    world.ForEach([]ComponentKey{CompTransform, CompObstacle}, func(obstID EntityID) {
        obst := world.Obstacle(obstID)
        if obst == nil || !obst.CoolsShips {
            return
        }

        obstTr := world.Transform(obstID)
        if obstTr == nil {
            return
        }

        // Check distance to station
        dist := shipPos.Sub(obstTr.Pos).Len()
        if dist <= obst.Radius {
            // Ship is within station radius
            totalCooling += obst.CoolRate

            // Optional: Scaling based on distance
            // ratio := 1.0 - (dist / obst.Radius) // Closer = more cooling
            // totalCooling += obst.CoolRate * ratio
        }
    })

    return totalCooling
}
```

---

## 4.5 Obstacle Initialization

**File**: `internal/game/room.go`

Add method to initialize map with obstacles:

```go
// InitializeMap spawns obstacles for a specific map layout
func (r *Room) InitializeMap(mapName string) {
    switch mapName {
    case "asteroids":
        r.initAsteroidMap()
    case "stations":
        r.initStationMap()
    case "debris":
        r.initDebrisMap()
    default:
        r.initEmptyMap()
    }
}

func (r *Room) initAsteroidMap() {
    // Central asteroid cluster
    r.CreateDebrisField(Vec2{0, 0}, 8, 500)

    // Large corner asteroids
    r.CreateAsteroid(Vec2{-1000, -1000}, 200)
    r.CreateAsteroid(Vec2{1000, -1000}, 200)
    r.CreateAsteroid(Vec2{-1000, 1000}, 200)
    r.CreateAsteroid(Vec2{1000, 1000}, 200)
}

func (r *Room) initStationMap() {
    // Cooling stations at strategic locations
    r.CreateCoolingStation(Vec2{0, 0}, 200, 10.0)      // Center
    r.CreateCoolingStation(Vec2{-800, 0}, 150, 8.0)    // Left
    r.CreateCoolingStation(Vec2{800, 0}, 150, 8.0)     // Right
    r.CreateCoolingStation(Vec2{0, -800}, 150, 8.0)    // Top
    r.CreateCoolingStation(Vec2{0, 800}, 150, 8.0)     // Bottom
}

func (r *Room) initDebrisMap() {
    // Mix of asteroids and stations
    r.CreateCoolingStation(Vec2{0, 0}, 250, 12.0)
    r.CreateDebrisField(Vec2{500, 500}, 6, 300)
    r.CreateDebrisField(Vec2{-500, -500}, 6, 300)
}

func (r *Room) initEmptyMap() {
    // No obstacles (default)
}
```

**Call during room creation**:

```go
func NewRoom(mapName string) *Room {
    room := &Room{
        World: NewWorld(),
        // ... other initialization ...
    }

    room.InitializeMap(mapName)

    return room
}
```

---

## 4.6 Obstacle Snapshots for Client

**File**: `internal/server/dto.go`

Add DTO for obstacles:

```go
type obstacleSnapshotDTO struct {
    ID          string  `json:"id"`
    X           float64 `json:"x"`
    Y           float64 `json:"y"`
    Radius      float64 `json:"radius"`
    Type        string  `json:"type"`
    BlocksLight bool    `json:"blocksLight"`
    CoolsShips  bool    `json:"coolsShips"`
    CoolRate    float64 `json:"coolRate"`
}
```

**File**: `internal/server/ws.go`

Send obstacles to client on room join:

```go
// Send initial room state to new player
func sendRoomState(conn *websocket.Conn, room *Room) {
    // ... existing ship/missile snapshots ...

    // NEW: Send obstacles
    obstacles := []obstacleSnapshotDTO{}
    room.World.ForEach([]ComponentKey{CompObstacle}, func(id EntityID) {
        obst := room.World.Obstacle(id)
        tr := room.World.Transform(id)

        if obst != nil && tr != nil {
            obstacles = append(obstacles, obstacleSnapshotDTO{
                ID:          string(id),
                X:           tr.Pos.X,
                Y:           tr.Pos.Y,
                Radius:      obst.Radius,
                Type:        obst.Type,
                BlocksLight: obst.BlocksLight,
                CoolsShips:  obst.CoolsShips,
                CoolRate:    obst.CoolRate,
            })
        }
    })

    msg := map[string]interface{}{
        "type":      "room_state",
        "obstacles": obstacles,
        // ... other state ...
    }

    json.NewEncoder(conn).Encode(msg)
}
```

---

## 4.7 Collision Detection (Future)

**File**: `internal/game/systems.go`

Optional: Add collision system to prevent ships/missiles from passing through obstacles:

```go
// checkCollision returns true if entity collides with obstacle
func checkCollision(world *World, entityPos Vec2, entityRadius float64) (bool, EntityID) {
    collision := false
    var collidedWith EntityID

    world.ForEach([]ComponentKey{CompObstacle}, func(obstID EntityID) {
        obst := world.Obstacle(obstID)
        obstTr := world.Transform(obstID)

        if obst == nil || obstTr == nil {
            return
        }

        // Circle-circle collision
        dist := entityPos.Sub(obstTr.Pos).Len()
        if dist < (entityRadius + obst.Radius) {
            collision = true
            collidedWith = obstID
        }
    })

    return collision, collidedWith
}

// Apply in ship/missile update systems
func updateShips(r *Room, dt float64) {
    r.World.ForEach([]ComponentKey{CompTransform}, func(shipID EntityID) {
        tr := r.World.Transform(shipID)

        // Check collision
        if collided, obstID := checkCollision(r.World, tr.Pos, 20); collided {
            // Bounce off or take damage
            handleShipCollision(r, shipID, obstID)
        }
    })
}
```

---

## Implementation Priority

**High Priority** (Sprint 7):
- ✅ Obstacle component and ECS integration
- ✅ Occlusion system (line-of-sight blocking)
- ✅ Obstacle initialization (map layouts)

**Medium Priority** (Sprint 8):
- Station cooling system
- Obstacle snapshots to client
- Map selection UI

**Low Priority** (Future):
- Collision detection/physics
- Moving obstacles
- Destructible obstacles

---

## Testing Checklist

- [ ] Test occlusion with multiple asteroids
- [ ] Verify station cooling applies correctly
- [ ] Test line-circle intersection math
- [ ] Verify obstacles sync to clients
- [ ] Test performance with 20+ obstacles
- [ ] Test edge cases (ship exactly on obstacle edge)

---

## Balancing Considerations

**Asteroid Placement**:
- Central clusters: Force close-range combat
- Corner placements: Create hiding spots
- Density: Balance stealth vs. open space

**Station Parameters**:
- Radius: 150-250 units (allows multiple ships)
- Cool rate: 8-12 heat/s (vs base 3 heat/s)
- Placement: Strategic control points

**Map Types**:
- **Asteroids**: High occlusion, ambush tactics
- **Stations**: Heat management focus, king-of-the-hill
- **Debris**: Mix of both, dynamic strategies
- **Empty**: Pure skill, no environmental factors

---

## Future Enhancements

**Dynamic Obstacles**:
```go
type ObstacleComponent struct {
    // ... existing fields ...
    Velocity Vec2  // Moving asteroids
    Rotation float64 // Spinning debris
}
```

**Destructible Obstacles**:
```go
type ObstacleComponent struct {
    // ... existing fields ...
    HP       float64
    MaxHP    float64
    OnDestroy func() // Spawn debris, resources, etc.
}
```

**Resource Stations**:
```go
type ObstacleComponent struct {
    // ... existing fields ...
    ResourceType string  // "ammo", "repair", "boost"
    ResourceRate float64
}
```
