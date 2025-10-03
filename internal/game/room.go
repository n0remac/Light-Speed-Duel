package game

import (
	"fmt"
	"math/rand"
	"strings"
	"sync"
)

type MissileRouteDef struct {
	ID        string
	Name      string
	Waypoints []Vec2
}

type Player struct {
	ID                   string
	Name                 string
	Ship                 EntityID
	MissileConfig        MissileConfig
	MissileRoutes        []*MissileRouteDef
	ActiveMissileRouteID string
}

type Room struct {
	ID      string
	Now     float64
	World   *World
	Players map[string]*Player
	Mu      sync.Mutex
}

func newRoom(id string) *Room {
	return &Room{
		ID:      id,
		World:   newWorld(),
		Players: map[string]*Player{},
	}
}

type Hub struct {
	Rooms map[string]*Room
	Mu    sync.Mutex
}

func NewHub() *Hub { return &Hub{Rooms: map[string]*Room{}} }

func (h *Hub) GetRoom(id string) *Room {
	h.Mu.Lock()
	defer h.Mu.Unlock()
	r, ok := h.Rooms[id]
	if !ok {
		r = newRoom(id)
		h.Rooms[id] = r
	}
	return r
}

func (r *Room) Tick() {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	r.Now += Dt

	updateShips(r, Dt)
	updateMissiles(r, Dt)
}

func (r *Room) SpawnShip(owner string, startPos Vec2) EntityID {
	id := r.World.NewEntity()
	r.World.SetComponent(id, CompTransform, &Transform{Pos: startPos})
	r.World.SetComponent(id, compMovement, &Movement{MaxSpeed: ShipMaxSpeed})
	r.World.SetComponent(id, CompShip, &ShipComponent{HP: ShipMaxHP})
	r.World.SetComponent(id, compShipRoute, &ShipRoute{})
	r.World.SetComponent(id, CompOwner, &OwnerComponent{PlayerID: owner})
	history := newHistory(HistoryKeepS, SimHz)
	history.push(Snapshot{T: r.Now, Pos: startPos})
	r.World.SetComponent(id, CompHistory, &HistoryComponent{History: history})
	return id
}

func (r *Room) LaunchMissile(owner string, cfg MissileConfig, waypoints []Vec2, startPos Vec2, startVel Vec2) EntityID {
	if len(waypoints) == 0 {
		return 0
	}
	id := r.World.NewEntity()
	r.World.SetComponent(id, CompTransform, &Transform{Pos: startPos, Vel: startVel})
	r.World.SetComponent(id, compMovement, &Movement{MaxSpeed: cfg.Speed})
	missile := &MissileComponent{
		AgroRadius: cfg.AgroRadius,
		LaunchTime: r.Now,
		Lifetime:   cfg.Lifetime,
	}
	r.World.SetComponent(id, CompMissile, missile)
	copied := append([]Vec2(nil), waypoints...)
	r.World.SetComponent(id, compMissileRoute, &MissileRoute{Waypoints: copied})
	r.World.SetComponent(id, CompOwner, &OwnerComponent{PlayerID: owner})
	history := newHistory(HistoryKeepS, SimHz)
	history.push(Snapshot{T: r.Now, Pos: startPos, Vel: startVel})
	r.World.SetComponent(id, CompHistory, &HistoryComponent{History: history})
	return id
}

func (r *Room) reSpawnShip(id EntityID) {
	if tr := r.World.Transform(id); tr != nil {
		tr.Pos = Vec2{X: WorldW * 0.5, Y: WorldH * 0.5}
		tr.Vel = Vec2{}
	}
	if route := r.World.ShipRoute(id); route != nil {
		route.Waypoints = nil
	}
	if ship := r.World.ShipData(id); ship != nil {
		ship.HP = ShipMaxHP
	}
	if hist := r.World.HistoryComponent(id); hist != nil {
		hist.History.push(Snapshot{T: r.Now, Pos: Vec2{X: WorldW * 0.5, Y: WorldH * 0.5}})
	}
}

func RandId(prefix string) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return prefix + "-" + string(b)
}

func (p *Player) missileRouteIndex(id string) int {
	for i, route := range p.MissileRoutes {
		if route.ID == id {
			return i
		}
	}
	return -1
}

func (p *Player) MissileRouteByID(id string) *MissileRouteDef {
	if id == "" {
		return nil
	}
	if idx := p.missileRouteIndex(id); idx >= 0 {
		return p.MissileRoutes[idx]
	}
	return nil
}

func (p *Player) ActiveMissileRoute() *MissileRouteDef {
	if route := p.MissileRouteByID(p.ActiveMissileRouteID); route != nil {
		return route
	}
	if len(p.MissileRoutes) > 0 {
		return p.MissileRoutes[0]
	}
	return nil
}

func (p *Player) EnsureMissileRoutes() {
	if len(p.MissileRoutes) == 0 {
		route := &MissileRouteDef{ID: RandId("mr"), Name: "Route 1"}
		p.MissileRoutes = []*MissileRouteDef{route}
		p.ActiveMissileRouteID = route.ID
	}
	if p.ActiveMissileRouteID == "" || p.MissileRouteByID(p.ActiveMissileRouteID) == nil {
		p.ActiveMissileRouteID = p.MissileRoutes[0].ID
	}
}

func (p *Player) generateRouteName() string {
	p.EnsureMissileRoutes()
	n := len(p.MissileRoutes) + 1
	for {
		candidate := fmt.Sprintf("Route %d", n)
		exists := false
		for _, route := range p.MissileRoutes {
			if strings.EqualFold(route.Name, candidate) {
				exists = true
				break
			}
		}
		if !exists {
			return candidate
		}
		n++
	}
}

func (p *Player) AddMissileRoute(name string) *MissileRouteDef {
	p.EnsureMissileRoutes()
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		trimmed = p.generateRouteName()
	}
	route := &MissileRouteDef{ID: RandId("mr"), Name: trimmed}
	p.MissileRoutes = append(p.MissileRoutes, route)
	p.ActiveMissileRouteID = route.ID
	return route
}

func (p *Player) RenameMissileRoute(id, name string) bool {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return false
	}
	if route := p.MissileRouteByID(id); route != nil {
		route.Name = trimmed
		return true
	}
	return false
}

func (p *Player) DeleteMissileRoute(id string) bool {
	p.EnsureMissileRoutes()
	idx := p.missileRouteIndex(id)
	if idx == -1 {
		return false
	}
	if len(p.MissileRoutes) <= 1 {
		p.MissileRoutes[idx].Waypoints = nil
		return true
	}
	p.MissileRoutes = append(p.MissileRoutes[:idx], p.MissileRoutes[idx+1:]...)
	if p.ActiveMissileRouteID == id {
		p.ActiveMissileRouteID = p.MissileRoutes[0].ID
	}
	return true
}

func (p *Player) ClearMissileRoute(id string) bool {
	if route := p.MissileRouteByID(id); route != nil {
		route.Waypoints = nil
		return true
	}
	return false
}

func (p *Player) SetActiveMissileRoute(id string) bool {
	if route := p.MissileRouteByID(id); route != nil {
		p.ActiveMissileRouteID = route.ID
		return true
	}
	return false
}

func (p *Player) AddWaypointToRoute(id string, wp Vec2) bool {
	if route := p.MissileRouteByID(id); route != nil {
		route.Waypoints = append(route.Waypoints, wp)
		return true
	}
	return false
}

func (p *Player) DeleteWaypointFromRoute(id string, index int) bool {
	if route := p.MissileRouteByID(id); route != nil {
		if index >= 0 && index < len(route.Waypoints) {
			route.Waypoints = append(route.Waypoints[:index], route.Waypoints[index+1:]...)
			return true
		}
	}
	return false
}
