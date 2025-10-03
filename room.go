package main

import (
	"math/rand"
	"sync"
)

type Player struct {
	ID               string
	Name             string
	Ship             EntityID
	MissileConfig    MissileConfig
	MissileWaypoints []Vec2
}

type Room struct {
	ID      string
	Now     float64
	World   *World
	Players map[string]*Player
	mu      sync.Mutex
}

func newRoom(id string) *Room {
	return &Room{
		ID:      id,
		World:   newWorld(),
		Players: map[string]*Player{},
	}
}

type Hub struct {
	rooms map[string]*Room
	mu    sync.Mutex
}

func newHub() *Hub { return &Hub{rooms: map[string]*Room{}} }

func (h *Hub) getRoom(id string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[id]
	if !ok {
		r = newRoom(id)
		h.rooms[id] = r
	}
	return r
}

func (r *Room) tick() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Now += dt

	updateShips(r, dt)
	updateMissiles(r, dt)
}

func (r *Room) spawnShip(owner string, startPos Vec2) EntityID {
	id := r.World.NewEntity()
	r.World.SetComponent(id, compTransform, &Transform{Pos: startPos})
	r.World.SetComponent(id, compMovement, &Movement{MaxSpeed: shipMaxSpeed})
	r.World.SetComponent(id, compShip, &ShipComponent{HP: shipMaxHP})
	r.World.SetComponent(id, compShipRoute, &ShipRoute{})
	r.World.SetComponent(id, compOwner, &OwnerComponent{PlayerID: owner})
	history := newHistory(historyKeepS, simHz)
	history.push(Snapshot{T: r.Now, Pos: startPos})
	r.World.SetComponent(id, compHistory, &HistoryComponent{History: history})
	return id
}

func (r *Room) launchMissile(owner string, cfg MissileConfig, waypoints []Vec2, startPos Vec2, startVel Vec2) EntityID {
	id := r.World.NewEntity()
	r.World.SetComponent(id, compTransform, &Transform{Pos: startPos, Vel: startVel})
	r.World.SetComponent(id, compMovement, &Movement{MaxSpeed: cfg.Speed})
	missile := &MissileComponent{
		AgroRadius: cfg.AgroRadius,
		LaunchTime: r.Now,
		Lifetime:   cfg.Lifetime,
	}
	r.World.SetComponent(id, compMissile, missile)
	copied := append([]Vec2(nil), waypoints...)
	r.World.SetComponent(id, compMissileRoute, &MissileRoute{Waypoints: copied})
	r.World.SetComponent(id, compOwner, &OwnerComponent{PlayerID: owner})
	history := newHistory(historyKeepS, simHz)
	history.push(Snapshot{T: r.Now, Pos: startPos, Vel: startVel})
	r.World.SetComponent(id, compHistory, &HistoryComponent{History: history})
	return id
}

func (r *Room) respawnShip(id EntityID) {
	if tr := r.World.Transform(id); tr != nil {
		tr.Pos = Vec2{X: worldW * 0.5, Y: worldH * 0.5}
		tr.Vel = Vec2{}
	}
	if route := r.World.ShipRoute(id); route != nil {
		route.Waypoints = nil
	}
	if ship := r.World.ShipData(id); ship != nil {
		ship.HP = shipMaxHP
	}
	if hist := r.World.HistoryComponent(id); hist != nil {
		hist.History.push(Snapshot{T: r.Now, Pos: Vec2{X: worldW * 0.5, Y: worldH * 0.5}})
	}
}

func randID(prefix string) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return prefix + "-" + string(b)
}
