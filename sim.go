package main

import (
	"math"
	"math/rand"
	"sync"
)

/* ------------------------------- Sim ------------------------------- */

const (
	c                  = 600.0 // "speed of light" in map units/s
	simHz              = 20.0  // server tick rate
	dt                 = 1.0 / simHz
	shipMaxSpeed       = 250.0 // units/s
	shipAccel          = 90.0  // units/s^2
	shipStopEps        = 10.0
	shipMaxHP          = 3
	historyKeepS       = 30.0 // seconds of history to keep
	updateRateHz       = 10.0 // per-client WS state pushes
	roomMaxPlayers     = 2
	worldW             = 8000.0
	worldH             = 4500.0
	missileMinSpeed    = 40.0
	missileMaxSpeed    = shipMaxSpeed
	missileMaxAccel    = 240.0
	missileMinAccel    = 20.0
	missileMaxLifetime = 120.0
	missileHitRadius   = 80.0
)

type Vec2 struct{ X, Y float64 }

func (a Vec2) Add(b Vec2) Vec2      { return Vec2{a.X + b.X, a.Y + b.Y} }
func (a Vec2) Sub(b Vec2) Vec2      { return Vec2{a.X - b.X, a.Y - b.Y} }
func (a Vec2) Dot(b Vec2) float64   { return a.X*b.X + a.Y*b.Y }
func (a Vec2) Len() float64         { return math.Hypot(a.X, a.Y) }
func (a Vec2) Scale(s float64) Vec2 { return Vec2{a.X * s, a.Y * s} }
func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func moveTowardsVec(current, target Vec2, maxDelta float64) Vec2 {
	toTarget := target.Sub(current)
	d := toTarget.Len()
	if d <= maxDelta || d == 0 {
		return target
	}
	factor := maxDelta / d
	return current.Add(toTarget.Scale(factor))
}

func missileAllowedAccelForSpeed(speed float64) float64 {
	span := missileMaxSpeed - missileMinSpeed
	var sNorm float64
	if span > 0 {
		sNorm = clamp((speed-missileMinSpeed)/span, 0, 1)
	}
	curve := 1.0 - sNorm*sNorm*sNorm
	if curve < 0 {
		curve = 0
	}
	accel := missileMinAccel + (missileMaxAccel-missileMinAccel)*curve
	return clamp(accel, missileMinAccel, missileMaxAccel)
}

func missileLifetimeFor(speed, accel float64) float64 {
	allowed := missileAllowedAccelForSpeed(speed)
	var accelNorm float64
	if allowed > 0 {
		accelNorm = clamp(accel/allowed, 0, 1)
	}
	span := missileMaxSpeed - missileMinSpeed
	var speedNorm float64
	if span > 0 {
		speedNorm = clamp((speed-missileMinSpeed)/span, 0, 1)
	}
	base := 60.0 + (1.0-speedNorm)*40.0 + accelNorm*20.0
	base = clamp(base, 10.0, missileMaxLifetime)
	return base
}

func sanitizeMissileConfig(cfg MissileConfig) MissileConfig {
	speed := clamp(cfg.Speed, missileMinSpeed, missileMaxSpeed)
	allowed := missileAllowedAccelForSpeed(speed)
	accel := clamp(cfg.Accel, missileMinAccel, allowed)
	agro := cfg.AgroRadius
	if agro < 0 {
		agro = 0
	}
	lifetime := missileLifetimeFor(speed, accel)
	return MissileConfig{
		Speed:      speed,
		Accel:      accel,
		AgroRadius: agro,
		Lifetime:   lifetime,
	}
}

type Snapshot struct {
	T   float64
	Pos Vec2
	Vel Vec2
}

type History struct {
	buf   []Snapshot
	head  int
	size  int
	mu    sync.RWMutex
	limit int // max entries
}

func newHistory(seconds float64, hz float64) *History {
	n := int(seconds*hz) + 4
	return &History{buf: make([]Snapshot, n), limit: n}
}

func (h *History) push(s Snapshot) {
	h.mu.Lock()
	h.buf[h.head] = s
	h.head = (h.head + 1) % h.limit
	if h.size < h.limit {
		h.size++
	}
	h.mu.Unlock()
}

func (h *History) getAt(t float64) (Snapshot, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if h.size == 0 {
		return Snapshot{}, false
	}
	bestAfter := -1
	bestBefore := -1
	var sAfter, sBefore Snapshot
	for i := 0; i < h.size; i++ {
		idx := (h.head - 1 - i + h.limit) % h.limit
		s := h.buf[idx]
		if s.T >= t {
			sAfter = s
			bestAfter = idx
		}
		if s.T <= t {
			sBefore = s
			bestBefore = idx
			break
		}
	}
	if bestBefore == -1 {
		earliest := h.buf[(h.head-h.size+h.limit)%h.limit]
		return earliest, true
	}
	if bestAfter == -1 {
		latest := h.buf[(h.head-1+h.limit)%h.limit]
		return latest, true
	}
	a := sBefore
	b := sAfter
	if b.T == a.T {
		return a, true
	}
	alpha := (t - a.T) / (b.T - a.T)
	lerp := func(a, b float64) float64 { return a + alpha*(b-a) }
	return Snapshot{
		T:   t,
		Pos: Vec2{X: lerp(a.Pos.X, b.Pos.X), Y: lerp(a.Pos.Y, b.Pos.Y)},
		Vel: Vec2{X: lerp(a.Vel.X, b.Vel.X), Y: lerp(a.Vel.Y, b.Vel.Y)},
	}, true
}

type ShipWaypoint struct {
	Pos   Vec2
	Speed float64
}

type MissileWaypoint struct {
	Pos Vec2
}

type MissileConfig struct {
	Speed      float64
	Accel      float64
	AgroRadius float64
	Lifetime   float64
}

type Missile struct {
	ID          string
	Owner       string
	Pos         Vec2
	Vel         Vec2
	Waypoints   []MissileWaypoint
	WaypointIdx int
	ReturnIdx   int
	Config      MissileConfig
	LaunchTime  float64
	TargetShip  string
	History     *History
}

type Ship struct {
	ID        string
	Owner     string // playerID
	Pos       Vec2
	Vel       Vec2
	Waypoints []ShipWaypoint
	History   *History
	HP        int
}

type Player struct {
	ID               string
	Name             string
	ShipID           string
	MissileConfig    MissileConfig
	MissileWaypoints []MissileWaypoint
	// net bits (conn, tick) live in net.go to keep sim pure
}

type Room struct {
	ID       string
	Now      float64
	Ships    map[string]*Ship
	Missiles map[string]*Missile
	Players  map[string]*Player
	mu       sync.Mutex
}

func newRoom(id string) *Room {
	return &Room{
		ID:       id,
		Ships:    map[string]*Ship{},
		Missiles: map[string]*Missile{},
		Players:  map[string]*Player{},
	}
}

/* ----------------------------- World Hub ----------------------------- */

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

/* --------------------------- Simulation Tick ------------------------- */

func (r *Room) tick() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Now += dt

	for _, s := range r.Ships {
		maxAccel := shipAccel
		if len(s.Waypoints) > 0 {
			target := s.Waypoints[0]
			dir := target.Pos.Sub(s.Pos)
			dist := dir.Len()
			speedLimit := clamp(target.Speed, 0, shipMaxSpeed)
			currentSpeed := s.Vel.Len()
			stopDist := 0.0
			if maxAccel > 0 {
				stopDist = (currentSpeed * currentSpeed) / (2 * maxAccel)
			}
			stopDist += shipStopEps
			var desiredVel Vec2
			if dist <= 1e-3 {
				s.Pos = target.Pos
				s.Vel = Vec2{}
				s.Waypoints = s.Waypoints[1:]
			} else {
				if dist <= stopDist {
					desiredVel = Vec2{}
				} else if dist > 0 {
					desiredVel = dir.Scale(1.0 / dist).Scale(speedLimit)
				}
				s.Vel = moveTowardsVec(s.Vel, desiredVel, maxAccel*dt)
				s.Pos = s.Pos.Add(s.Vel.Scale(dt))
				if dir := target.Pos.Sub(s.Pos); dir.Len() <= shipStopEps && s.Vel.Len() <= 5 {
					s.Pos = target.Pos
					s.Vel = Vec2{}
					s.Waypoints = s.Waypoints[1:]
				}
			}
		} else {
			s.Vel = moveTowardsVec(s.Vel, Vec2{}, shipAccel*dt)
			s.Pos = s.Pos.Add(s.Vel.Scale(dt))
		}
		if s.Pos.X < 0 {
			s.Pos.X = 0
		}
		if s.Pos.Y < 0 {
			s.Pos.Y = 0
		}
		if s.Pos.X > worldW {
			s.Pos.X = worldW
		}
		if s.Pos.Y > worldH {
			s.Pos.Y = worldH
		}

		s.History.push(Snapshot{T: r.Now, Pos: s.Pos, Vel: s.Vel})
	}

	var missilesToRemove []string
	for id, m := range r.Missiles {
		age := r.Now - m.LaunchTime
		if age >= m.Config.Lifetime {
			missilesToRemove = append(missilesToRemove, id)
			continue
		}
		configSpeed := clamp(m.Config.Speed, missileMinSpeed, missileMaxSpeed)
		allowedAccel := missileAllowedAccelForSpeed(configSpeed)
		accelLimit := clamp(m.Config.Accel, missileMinAccel, allowedAccel)
		if accelLimit <= 0 {
			accelLimit = missileMinAccel
		}

		chasing := false
		var targetShip *Ship
		if m.TargetShip != "" {
			if ship, ok := r.Ships[m.TargetShip]; ok && ship.Owner != m.Owner {
				d := ship.Pos.Sub(m.Pos).Len()
				if d <= m.Config.AgroRadius {
					chasing = true
					targetShip = ship
				} else {
					m.TargetShip = ""
					if m.ReturnIdx < len(m.Waypoints) {
						m.WaypointIdx = m.ReturnIdx
					}
				}
			} else {
				m.TargetShip = ""
				if m.ReturnIdx < len(m.Waypoints) {
					m.WaypointIdx = m.ReturnIdx
				}
			}
		}

		if !chasing {
			var bestShip *Ship
			bestDist := 0.0
			for _, ship := range r.Ships {
				if ship.Owner == m.Owner {
					continue
				}
				d := ship.Pos.Sub(m.Pos).Len()
				if d <= m.Config.AgroRadius {
					if bestShip == nil || d < bestDist {
						bestShip = ship
						bestDist = d
					}
				}
			}
			if bestShip != nil {
				chasing = true
				targetShip = bestShip
				m.TargetShip = bestShip.ID
				m.ReturnIdx = m.WaypointIdx
			}
		}

		var desiredVel Vec2
		var desiredPos Vec2
		currentSpeed := m.Vel.Len()
		stopDist := 0.0
		if accelLimit > 0 {
			stopDist = (currentSpeed * currentSpeed) / (2 * accelLimit)
		}
		stopDist += shipStopEps

		if chasing && targetShip != nil {
			desiredPos = targetShip.Pos
			toTarget := desiredPos.Sub(m.Pos)
			if dist := toTarget.Len(); dist > 0 {
				desiredVel = toTarget.Scale(1.0 / dist).Scale(configSpeed)
			}
		} else {
			if m.WaypointIdx < len(m.Waypoints) {
				wp := m.Waypoints[m.WaypointIdx]
				desiredPos = wp.Pos
				toTarget := desiredPos.Sub(m.Pos)
				dist := toTarget.Len()
				if dist <= stopDist {
					desiredVel = Vec2{}
				} else if dist > 0 {
					desiredVel = toTarget.Scale(1.0 / dist).Scale(configSpeed)
				}
			} else {
				desiredPos = m.Pos
				desiredVel = Vec2{}
			}
		}

		m.Vel = moveTowardsVec(m.Vel, desiredVel, accelLimit*dt)
		m.Pos = m.Pos.Add(m.Vel.Scale(dt))

		if m.Pos.X < 0 {
			m.Pos.X = 0
		}
		if m.Pos.Y < 0 {
			m.Pos.Y = 0
		}
		if m.Pos.X > worldW {
			m.Pos.X = worldW
		}
		if m.Pos.Y > worldH {
			m.Pos.Y = worldH
		}

		if !chasing && m.WaypointIdx < len(m.Waypoints) {
			toWp := m.Waypoints[m.WaypointIdx].Pos.Sub(m.Pos)
			if toWp.Len() <= shipStopEps && m.Vel.Len() <= 5 {
				m.Pos = m.Waypoints[m.WaypointIdx].Pos
				m.Vel = Vec2{}
				m.WaypointIdx++
			}
		}

		// Collision detection
		hitShip := (*Ship)(nil)
		for _, ship := range r.Ships {
			if ship.Owner == m.Owner {
				continue
			}
			if ship.Pos.Sub(m.Pos).Len() <= missileHitRadius {
				hitShip = ship
				break
			}
		}
		if hitShip != nil {
			hitShip.HP--
			if hitShip.HP <= 0 {
				r.resetShip(hitShip)
			}
			missilesToRemove = append(missilesToRemove, id)
			continue
		}

		m.History.push(Snapshot{T: r.Now, Pos: m.Pos, Vel: m.Vel})
	}

	for _, id := range missilesToRemove {
		delete(r.Missiles, id)
	}
}

func (r *Room) resetShip(s *Ship) {
	s.HP = shipMaxHP
	s.Vel = Vec2{}
	s.Waypoints = nil
	s.Pos = Vec2{X: worldW * 0.5, Y: worldH * 0.5}
}

/* ------------------------------ Helpers ----------------------------- */

func randID(prefix string) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return prefix + "-" + string(b)
}
