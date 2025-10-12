package game

type EntityID int64

type ComponentKey string

type World struct {
	nextEntity EntityID
	components map[ComponentKey]map[EntityID]any
}

type Transform struct {
	Pos Vec2
	Vel Vec2
}

type Movement struct {
	MaxSpeed float64
}

type ShipComponent struct {
	HP int
}

type RouteWaypoint struct {
	Pos   Vec2
	Speed float64
}

type RouteComponent struct {
	Waypoints []RouteWaypoint
}

type RouteFollower struct {
	Index       int
	Hold        bool
	hasOverride bool
	override    RouteWaypoint
}

type MissileComponent struct {
	AgroRadius  float64
	LaunchTime  float64
	Lifetime    float64
	Target      EntityID
	ReturnIndex int
}

type OwnerComponent struct {
	PlayerID string
}

type HistoryComponent struct {
	History *History
}

type DestroyedComponent struct {
	DestroyedAt float64
}

type MissileConfig struct {
	Speed      float64
	AgroRadius float64
	Lifetime   float64
	HeatParams HeatParams // Heat configuration for this missile
}

const (
	CompTransform     ComponentKey = "transform"
	compMovement      ComponentKey = "movement"
	CompShip          ComponentKey = "ship"
	CompRoute         ComponentKey = "route"
	CompRouteFollower ComponentKey = "route_follower"
	CompMissile       ComponentKey = "missile"
	CompOwner         ComponentKey = "owner"
	CompHistory       ComponentKey = "history"
	CompDestroyed     ComponentKey = "destroyed"
	CompHeat          ComponentKey = "heat"
)

func SanitizeMissileConfig(cfg MissileConfig) MissileConfig {
	speed := Clamp(cfg.Speed, MissileMinSpeed, MissileMaxSpeed)
	agro := cfg.AgroRadius
	if agro < MissileMinAgroRadius {
		agro = MissileMinAgroRadius
	}
	lifetime := MissileLifetimeFor(speed, agro)

	// Sanitize heat params or use defaults
	heatParams := cfg.HeatParams
	if heatParams.Max <= 0 {
		heatParams = DefaultMissileHeatParams()
	} else {
		heatParams = SanitizeHeatParams(heatParams)
	}

	return MissileConfig{
		Speed:      speed,
		AgroRadius: agro,
		Lifetime:   lifetime,
		HeatParams: heatParams,
	}
}

func MissileLifetimeFor(speed, agro float64) float64 {
	var speedNorm float64
	if span := MissileMaxSpeed - MissileMinSpeed; span > 0 {
		speedNorm = Clamp((speed-MissileMinSpeed)/span, 0, 1)
	}
	effectiveAgro := agro - MissileMinAgroRadius
	if effectiveAgro < 0 {
		effectiveAgro = 0
	}
	agroNorm := Clamp(effectiveAgro/MissileLifetimeAgroRef, 0, 1)
	reduction := speedNorm*MissileLifetimeSpeedPenalty + agroNorm*MissileLifetimeAgroPenalty
	lifetime := MissileMaxLifetime - reduction
	return Clamp(lifetime, MissileMinLifetime, MissileMaxLifetime)
}

func (w *World) Transform(id EntityID) *Transform {
	if v, ok := w.GetComponent(id, CompTransform); ok {
		if t, ok := v.(*Transform); ok {
			return t
		}
	}
	return nil
}

func (w *World) Movement(id EntityID) *Movement {
	if v, ok := w.GetComponent(id, compMovement); ok {
		if t, ok := v.(*Movement); ok {
			return t
		}
	}
	return nil
}

func (w *World) ShipData(id EntityID) *ShipComponent {
	if v, ok := w.GetComponent(id, CompShip); ok {
		if t, ok := v.(*ShipComponent); ok {
			return t
		}
	}
	return nil
}

func (w *World) Route(id EntityID) *RouteComponent {
	if v, ok := w.GetComponent(id, CompRoute); ok {
		if t, ok := v.(*RouteComponent); ok {
			return t
		}
	}
	return nil
}

func (w *World) RouteFollower(id EntityID) *RouteFollower {
	if v, ok := w.GetComponent(id, CompRouteFollower); ok {
		if t, ok := v.(*RouteFollower); ok {
			return t
		}
	}
	return nil
}

func (w *World) MissileData(id EntityID) *MissileComponent {
	if v, ok := w.GetComponent(id, CompMissile); ok {
		if t, ok := v.(*MissileComponent); ok {
			return t
		}
	}
	return nil
}

func (w *World) Owner(id EntityID) *OwnerComponent {
	if v, ok := w.GetComponent(id, CompOwner); ok {
		if t, ok := v.(*OwnerComponent); ok {
			return t
		}
	}
	return nil
}

func (w *World) HistoryComponent(id EntityID) *HistoryComponent {
	if v, ok := w.GetComponent(id, CompHistory); ok {
		if t, ok := v.(*HistoryComponent); ok {
			return t
		}
	}
	return nil
}

func (w *World) DestroyedData(id EntityID) *DestroyedComponent {
	if v, ok := w.GetComponent(id, CompDestroyed); ok {
		if t, ok := v.(*DestroyedComponent); ok {
			return t
		}
	}
	return nil
}

func (w *World) HeatData(id EntityID) *HeatComponent {
	if v, ok := w.GetComponent(id, CompHeat); ok {
		if t, ok := v.(*HeatComponent); ok {
			return t
		}
	}
	return nil
}

func newWorld() *World {
	return &World{
		nextEntity: 0,
		components: make(map[ComponentKey]map[EntityID]any),
	}
}

func (w *World) NewEntity() EntityID {
	w.nextEntity++
	return w.nextEntity
}

func (w *World) SetComponent(id EntityID, key ComponentKey, value any) {
	store, ok := w.components[key]
	if !ok {
		store = make(map[EntityID]any)
		w.components[key] = store
	}
	store[id] = value
}

func (w *World) RemoveComponent(id EntityID, key ComponentKey) {
	if store, ok := w.components[key]; ok {
		delete(store, id)
	}
}

func (w *World) GetComponent(id EntityID, key ComponentKey) (any, bool) {
	if store, ok := w.components[key]; ok {
		val, ok := store[id]
		return val, ok
	}
	return nil, false
}

func (w *World) HasComponent(id EntityID, key ComponentKey) bool {
	if store, ok := w.components[key]; ok {
		_, ok := store[id]
		return ok
	}
	return false
}

func (w *World) RemoveEntity(id EntityID) {
	for _, store := range w.components {
		delete(store, id)
	}
}

func (w *World) ForEach(required []ComponentKey, fn func(EntityID)) {
	if len(required) == 0 {
		return
	}
	first := w.components[required[0]]
	if first == nil {
		return
	}
	for id := range first {
		match := true
		for _, key := range required[1:] {
			if store := w.components[key]; store == nil {
				match = false
				break
			} else if _, ok := store[id]; !ok {
				match = false
				break
			}
		}
		if match {
			fn(id)
		}
	}
}

func (w *World) Exists(id EntityID) bool {
	for _, store := range w.components {
		if _, ok := store[id]; ok {
			return true
		}
	}
	return false
}
