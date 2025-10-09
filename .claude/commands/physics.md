---
description: Understand the game's physics and light-time mechanics
---

Light Speed Duel features relativistic physics with light-time delays.

**Core Physics Constants** (in `internal/game/consts.go`):
- `C = 299.0` - Speed of light (units/second)
- Ships can approach but not exceed C
- Missiles have speed limits relative to C

**Light-Time Delay** (in `internal/game/perception.go`):
- All observations are delayed by `distance / C`
- Players see ships where they *were*, not where they *are*
- Own ship also shows delayed position (no privileged info)
- Creates prediction-based gameplay

**Movement System** (in `internal/game/systems.go`):
- Waypoint-based navigation
- Acceleration → Cruise → Deceleration phases
- Speed affects missile cooldown (time dilation effect)

**Missile Physics**:
- Inherit ship velocity at launch
- Homing behavior within agro radius
- Speed/agro tradeoff affects lifetime:
  - Higher speed = shorter lifetime
  - Larger agro = shorter lifetime
- Formula in `internal/server/web/src/state.ts`:
  ```typescript
  lifetime = MAX - (speedNorm * SPEED_PENALTY + agroNorm * AGRO_PENALTY)
  ```

**Vec2 Math** (in `internal/game/core.go`):
```go
type Vec2 struct{ X, Y float64 }
func (a Vec2) Add(b Vec2) Vec2
func (a Vec2) Sub(b Vec2) Vec2
func (a Vec2) Dot(b Vec2) float64
func (a Vec2) Len() float64
func (a Vec2) Scale(s float64) Vec2
```

**Key Files**:
- `internal/game/core.go` - Vec2, math utilities
- `internal/game/systems.go` - Movement, missiles
- `internal/game/perception.go` - Light-time delays
- `internal/server/web/src/state.ts` - Client-side physics
