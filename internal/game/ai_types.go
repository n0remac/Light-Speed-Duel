package game

type AICommand interface {
	apply(r *Room, p *Player)
}

type aiCommandSetShipRoute struct {
	waypoints []ShipWaypoint
}

func (c aiCommandSetShipRoute) apply(r *Room, p *Player) {
	if p == nil || p.Ship == 0 {
		return
	}
	route := r.World.ShipRoute(p.Ship)
	if route == nil {
		return
	}
	copied := make([]ShipWaypoint, len(c.waypoints))
	copy(copied, c.waypoints)
	route.Waypoints = copied
}

type aiCommandClearShipRoute struct{}

func (aiCommandClearShipRoute) apply(r *Room, p *Player) {
	if p == nil || p.Ship == 0 {
		return
	}
	if route := r.World.ShipRoute(p.Ship); route != nil {
		route.Waypoints = nil
	}
}

type aiCommandLaunchMissile struct {
	config    MissileConfig
	waypoints []Vec2
}

func (c aiCommandLaunchMissile) apply(r *Room, p *Player) {
	if p == nil || p.Ship == 0 || len(c.waypoints) == 0 {
		return
	}
	now := r.Now
	if p.MissileReadyAt > 0 && now < p.MissileReadyAt {
		return
	}
	cfg := SanitizeMissileConfig(c.config)
	if tr := r.World.Transform(p.Ship); tr != nil {
		missileID := r.LaunchMissile(p.ID, p.Ship, cfg, c.waypoints, tr.Pos, tr.Vel)
		if missileID != 0 {
			speed := tr.Vel.Len()
			p.MissileReadyAt = now + MissileCooldownForSpeed(speed)
		}
	}
}

func CommandSetShipRoute(waypoints []ShipWaypoint) AICommand {
	return aiCommandSetShipRoute{waypoints: waypoints}
}

func CommandClearShipRoute() AICommand {
	return aiCommandClearShipRoute{}
}

func CommandLaunchMissile(cfg MissileConfig, waypoints []Vec2) AICommand {
	return aiCommandLaunchMissile{config: cfg, waypoints: append([]Vec2(nil), waypoints...)}
}

type AIBehavior interface {
	Plan(ctx *AIContext) []AICommand
}

type AIAgent struct {
	PlayerID     string
	Behavior     AIBehavior
	PlanInterval float64
	nextPlanAt   float64
}

func NewAIAgent(playerID string, behavior AIBehavior) *AIAgent {
	interval := 0.2
	if interval < Dt {
		interval = Dt
	}
	return &AIAgent{PlayerID: playerID, Behavior: behavior, PlanInterval: interval}
}

func (a *AIAgent) ready(now float64) bool {
	return now >= a.nextPlanAt
}

func (a *AIAgent) planned(now float64) {
	a.nextPlanAt = now + a.PlanInterval
}

type AIShipInfo struct {
	Player    *Player
	Entity    EntityID
	Transform *Transform
	Movement  *Movement
}

type AIMissileThreat struct {
	Entity            EntityID
	Pos               Vec2
	Vel               Vec2
	AgroRadius        float64
	TargetingSelf     bool
	Distance          float64
	TimeToClosest     float64
	DistanceAtClosest float64
}

type AIContext struct {
	Room          *Room
	Now           float64
	Self          *Player
	SelfEntity    EntityID
	SelfTransform *Transform
	SelfMovement  *Movement
	SelfRoute     *ShipRoute
	SelfHeat      *HeatComponent
	Opponents     []AIShipInfo
	Threats       []AIMissileThreat
}

func (ctx *AIContext) MissileReady() bool {
	if ctx == nil || ctx.Self == nil {
		return false
	}
	return ctx.Self.MissileReadyAt <= 0 || ctx.Now >= ctx.Self.MissileReadyAt
}

func buildAIContext(r *Room, self *Player) *AIContext {
	ctx := &AIContext{Room: r, Now: r.Now, Self: self}
	if self != nil {
		ctx.SelfEntity = self.Ship
		if self.Ship != 0 {
			ctx.SelfTransform = r.World.Transform(self.Ship)
			ctx.SelfMovement = r.World.Movement(self.Ship)
			ctx.SelfRoute = r.World.ShipRoute(self.Ship)
			ctx.SelfHeat = r.World.HeatData(self.Ship)
		}
	}

	if ctx.SelfTransform != nil {
		selfPos := ctx.SelfTransform.Pos
		r.World.ForEach([]ComponentKey{CompTransform, CompShip, CompOwner}, func(e EntityID) {
			if ctx.Self != nil && e == ctx.SelfEntity {
				return
			}
			owner := r.World.Owner(e)
			if owner == nil || (ctx.Self != nil && owner.PlayerID == ctx.Self.ID) {
				return
			}
			tr := r.World.Transform(e)
			mov := r.World.Movement(e)
			if tr == nil {
				return
			}
			ctx.Opponents = append(ctx.Opponents, AIShipInfo{
				Player:    r.Players[owner.PlayerID],
				Entity:    e,
				Transform: tr,
				Movement:  mov,
			})
		})

		r.World.ForEach([]ComponentKey{CompTransform, CompMissile, CompOwner}, func(e EntityID) {
			owner := r.World.Owner(e)
			if owner == nil || (ctx.Self != nil && owner.PlayerID == ctx.Self.ID) {
				return
			}
			tr := r.World.Transform(e)
			missile := r.World.MissileData(e)
			if tr == nil || missile == nil {
				return
			}
			distVec := selfPos.Sub(tr.Pos)
			dist := distVec.Len()
			relVel := tr.Vel
			if ctx.SelfTransform != nil {
				relVel = tr.Vel.Sub(ctx.SelfTransform.Vel)
			}
			tClosest, dClosest := closestApproach(distVec.Scale(-1), relVel)
			targeting := ctx.Self != nil && missile.Target == ctx.SelfEntity && ctx.SelfEntity != 0
			ctx.Threats = append(ctx.Threats, AIMissileThreat{
				Entity:            e,
				Pos:               tr.Pos,
				Vel:               tr.Vel,
				AgroRadius:        missile.AgroRadius,
				TargetingSelf:     targeting,
				Distance:          dist,
				TimeToClosest:     tClosest,
				DistanceAtClosest: dClosest,
			})
		})
	}

	return ctx
}

func closestApproach(relativePos Vec2, relativeVel Vec2) (float64, float64) {
	speedSq := relativeVel.Dot(relativeVel)
	if speedSq <= 1e-6 {
		return 0, relativePos.Len()
	}
	t := -relativePos.Dot(relativeVel) / speedSq
	if t < 0 {
		t = 0
	}
	dist := relativePos.Add(relativeVel.Scale(t)).Len()
	return t, dist
}

func clampPointToWorld(p Vec2) Vec2 {
	return Vec2{X: Clamp(p.X, 0, WorldW), Y: Clamp(p.Y, 0, WorldH)}
}

func clampPointToWorldBounds(p Vec2, worldW, worldH float64) Vec2 {
	return Vec2{X: Clamp(p.X, 0, worldW), Y: Clamp(p.Y, 0, worldH)}
}

func unitOrZero(v Vec2) Vec2 {
	len := v.Len()
	if len <= 1e-6 {
		return Vec2{}
	}
	return v.Scale(1.0 / len)
}

func blendDirections(dirs []Vec2) Vec2 {
	sum := Vec2{}
	for _, d := range dirs {
		sum = sum.Add(d)
	}
	return sum
}

func orthogonal(v Vec2) Vec2 {
	return Vec2{X: -v.Y, Y: v.X}
}

func smoothStep(x float64) float64 {
	clamped := Clamp(x, 0, 1)
	return clamped * clamped * (3 - 2*clamped)
}

func lerpFloat(a, b, t float64) float64 {
	return a + (b-a)*t
}
