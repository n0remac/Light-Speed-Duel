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

type ShipWaypoint struct {
	Pos   Vec2
	Speed float64
}

type ShipRoute struct {
	Waypoints []ShipWaypoint
}

type ShipComponent struct {
	HP int
}

type MissileRoute struct {
	Waypoints []Vec2
}

type MissileComponent struct {
	AgroRadius  float64
	LaunchTime  float64
	Lifetime    float64
	WaypointIdx int
	ReturnIdx   int
	Target      EntityID
}

type OwnerComponent struct {
	PlayerID string
}

type HistoryComponent struct {
	History *History
}

type MissileConfig struct {
	Speed      float64
	AgroRadius float64
	Lifetime   float64
}

const (
	compTransform    ComponentKey = "transform"
	compMovement     ComponentKey = "movement"
	compShip         ComponentKey = "ship"
	compShipRoute    ComponentKey = "ship_route"
	compMissile      ComponentKey = "missile"
	compMissileRoute ComponentKey = "missile_route"
	compOwner        ComponentKey = "owner"
	compHistory      ComponentKey = "history"
)

func sanitizeMissileConfig(cfg MissileConfig) MissileConfig {
	speed := clamp(cfg.Speed, missileMinSpeed, missileMaxSpeed)
	agro := cfg.AgroRadius
	if agro < missileMinAgroRadius {
		agro = missileMinAgroRadius
	}
	lifetime := missileLifetimeFor(speed, agro)
	return MissileConfig{
		Speed:      speed,
		AgroRadius: agro,
		Lifetime:   lifetime,
	}
}

func missileLifetimeFor(speed, agro float64) float64 {
	var speedNorm float64
	if span := missileMaxSpeed - missileMinSpeed; span > 0 {
		speedNorm = clamp((speed-missileMinSpeed)/span, 0, 1)
	}
	effectiveAgro := agro - missileMinAgroRadius
	if effectiveAgro < 0 {
		effectiveAgro = 0
	}
	agroNorm := clamp(effectiveAgro/missileLifetimeAgroRef, 0, 1)
	reduction := speedNorm*missileLifetimeSpeedPenalty + agroNorm*missileLifetimeAgroPenalty
	lifetime := missileMaxLifetime - reduction
	return clamp(lifetime, missileMinLifetime, missileMaxLifetime)
}

func (w *World) Transform(id EntityID) *Transform {
	if v, ok := w.GetComponent(id, compTransform); ok {
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
	if v, ok := w.GetComponent(id, compShip); ok {
		if t, ok := v.(*ShipComponent); ok {
			return t
		}
	}
	return nil
}

func (w *World) ShipRoute(id EntityID) *ShipRoute {
	if v, ok := w.GetComponent(id, compShipRoute); ok {
		if t, ok := v.(*ShipRoute); ok {
			return t
		}
	}
	return nil
}

func (w *World) MissileData(id EntityID) *MissileComponent {
	if v, ok := w.GetComponent(id, compMissile); ok {
		if t, ok := v.(*MissileComponent); ok {
			return t
		}
	}
	return nil
}

func (w *World) MissileRoute(id EntityID) *MissileRoute {
	if v, ok := w.GetComponent(id, compMissileRoute); ok {
		if t, ok := v.(*MissileRoute); ok {
			return t
		}
	}
	return nil
}

func (w *World) Owner(id EntityID) *OwnerComponent {
	if v, ok := w.GetComponent(id, compOwner); ok {
		if t, ok := v.(*OwnerComponent); ok {
			return t
		}
	}
	return nil
}

func (w *World) HistoryComponent(id EntityID) *HistoryComponent {
	if v, ok := w.GetComponent(id, compHistory); ok {
		if t, ok := v.(*HistoryComponent); ok {
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
