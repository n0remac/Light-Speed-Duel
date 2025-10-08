package game

import (
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"
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
	MissileReadyAt       float64
	IsBot                bool
	Kills                int
}

type Room struct {
	ID       string
	Now      float64
	World    *World
	Players  map[string]*Player
	Mu       sync.Mutex
	Bots     map[string]*AIAgent
	stopChan chan struct{}
	stopped  bool
}

func newRoom(id string) *Room {
	return &Room{
		ID:       id,
		World:    newWorld(),
		Players:  map[string]*Player{},
		Bots:     map[string]*AIAgent{},
		stopChan: make(chan struct{}),
		stopped:  false,
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
		r.Start()
	}
	return r
}

func (h *Hub) CleanupEmptyRooms() {
	h.Mu.Lock()
	defer h.Mu.Unlock()
	for id, r := range h.Rooms {
		if r.IsEmpty() {
			r.Stop()
			delete(h.Rooms, id)
		}
	}
}

func (r *Room) Tick() {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	r.Now += Dt

	r.updateAI()
	updateShips(r, Dt)
	updateMissiles(r, Dt)

	// Run garbage collection every second to clean up old destroyed entities
	tickCount := int(r.Now * SimHz)
	if tickCount%int(SimHz) == 0 {
		r.cleanupDestroyedEntitiesLocked()
	}
}

func (r *Room) cleanupDestroyedEntitiesLocked() {
	world := r.World
	var toRemove []EntityID

	// Find all entities that were destroyed more than HistoryKeepS ago
	world.ForEach([]ComponentKey{CompDestroyed}, func(id EntityID) {
		destroyed := world.DestroyedData(id)
		if destroyed != nil && r.Now-destroyed.DestroyedAt > HistoryKeepS {
			toRemove = append(toRemove, id)
		}
	})

	// Actually remove the entities
	for _, id := range toRemove {
		world.RemoveEntity(id)
	}
}

func (r *Room) Start() {
	go func() {
		ticker := time.NewTicker(time.Duration(1000.0/SimHz) * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-r.stopChan:
				return
			case <-ticker.C:
				r.Tick()
			}
		}
	}()
}

func (r *Room) Stop() {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	if !r.stopped {
		r.stopped = true
		close(r.stopChan)
	}
}

func (r *Room) IsEmpty() bool {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	return len(r.Players) == 0
}

func (r *Room) humanPlayerCountUnlocked() int {
	count := 0
	for _, p := range r.Players {
		if p != nil && !p.IsBot {
			count++
		}
	}
	return count
}

func (r *Room) removePlayerEntitiesUnlocked(playerID string) {
	var toRemove []EntityID
	r.World.ForEach([]ComponentKey{CompOwner}, func(e EntityID) {
		owner := r.World.Owner(e)
		if owner != nil && owner.PlayerID == playerID {
			toRemove = append(toRemove, e)
		}
	})
	for _, e := range toRemove {
		r.World.RemoveEntity(e)
	}
}

func (r *Room) addBotUnlocked(name string, behavior AIBehavior, startPos Vec2) *Player {
	id := RandId("bot")
	for {
		if _, exists := r.Players[id]; !exists {
			break
		}
		id = RandId("bot")
	}
	player := &Player{
		ID:            id,
		Name:          name,
		MissileConfig: SanitizeMissileConfig(MissileConfig{Speed: ShipMaxSpeed * 0.7, AgroRadius: 900}),
		IsBot:         true,
	}
	player.EnsureMissileRoutes()
	shipID := r.SpawnShip(id, startPos)
	player.Ship = shipID
	r.Players[id] = player
	r.Bots[id] = NewAIAgent(id, behavior)
	return player
}

func (r *Room) removeBotUnlocked(id string) {
	delete(r.Bots, id)
	if _, ok := r.Players[id]; ok {
		r.removePlayerEntitiesUnlocked(id)
		delete(r.Players, id)
	}
}

func (r *Room) removeAllBotsUnlocked() {
	for id := range r.Bots {
		r.removeBotUnlocked(id)
	}
}

func (r *Room) HumanPlayerCountLocked() int {
	return r.humanPlayerCountUnlocked()
}

func (r *Room) AddBotLocked(name string, behavior AIBehavior, startPos Vec2) *Player {
	return r.addBotUnlocked(name, behavior, startPos)
}

func (r *Room) RemoveAllBotsLocked() {
	r.removeAllBotsUnlocked()
}

func (r *Room) RemovePlayerEntitiesLocked(playerID string) {
	r.removePlayerEntitiesUnlocked(playerID)
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
		AgroRadius:   cfg.AgroRadius,
		LaunchTime:   r.Now,
		Lifetime:     cfg.Lifetime,
		BaseVelocity: startVel, // Store ship's velocity to maintain it during navigation
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

func (r *Room) handleShipDestruction(shipID EntityID, attackerID string) {
	// Find which player owns this ship
	owner := r.World.Owner(shipID)
	if owner == nil {
		return
	}

	player := r.Players[owner.PlayerID]
	if player == nil {
		return
	}

	// Increment kill count for attacker if they destroyed a bot
	if attackerID != "" && player.IsBot {
		if attacker := r.Players[attackerID]; attacker != nil && !attacker.IsBot {
			attacker.Kills++
		}
	}

	if player.IsBot {
		// Bot: mark as destroyed and spawn a new bot at random location
		r.World.SetComponent(shipID, CompDestroyed, &DestroyedComponent{DestroyedAt: r.Now})

		// Spawn new bot at random location
		randX := WorldW * (0.2 + 0.6*rand.Float64())
		randY := WorldH * (0.2 + 0.6*rand.Float64())
		r.addBotUnlocked(player.Name, NewDefensiveBehavior(), Vec2{X: randX, Y: randY})
	} else {
		// Player: respawn at center
		r.reSpawnShip(shipID)
	}
}

func (r *Room) reSpawnShip(id EntityID) {
	respawnPos := Vec2{X: WorldW * 0.5, Y: WorldH * 0.5}

	if tr := r.World.Transform(id); tr != nil {
		tr.Pos = respawnPos
		tr.Vel = Vec2{}
	}
	if route := r.World.ShipRoute(id); route != nil {
		route.Waypoints = nil
	}
	if ship := r.World.ShipData(id); ship != nil {
		ship.HP = ShipMaxHP
	}
	// Clear old history and start fresh from respawn position
	// This prevents missiles from tracking/colliding with old positions
	if hist := r.World.HistoryComponent(id); hist != nil {
		hist.History = newHistory(HistoryKeepS, SimHz)
		hist.History.push(Snapshot{T: r.Now, Pos: respawnPos})
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
