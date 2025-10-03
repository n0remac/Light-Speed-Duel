package main

import (
	"math"
	"math/rand"
	"sync"
)

/* ------------------------------- Sim ------------------------------- */

const (
	c              = 600.0 // "speed of light" in map units/s
	simHz          = 20.0  // server tick rate
	dt             = 1.0 / simHz
	shipMaxSpeed   = 250.0 // units/s
	historyKeepS   = 30.0  // seconds of history to keep
	updateRateHz   = 10.0  // per-client WS state pushes
	roomMaxPlayers = 2
	worldW         = 8000.0
	worldH         = 4500.0
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

type Ship struct {
	ID        string
	Owner     string // playerID
	Pos       Vec2
	Vel       Vec2
	Waypoints []ShipWaypoint
	History   *History
}

type Player struct {
	ID     string
	Name   string
	ShipID string
	// net bits (conn, tick) live in net.go to keep sim pure
}

type Room struct {
	ID      string
	Now     float64
	Ships   map[string]*Ship
	Players map[string]*Player
	mu      sync.Mutex
}

func newRoom(id string) *Room {
	return &Room{
		ID:      id,
		Ships:   map[string]*Ship{},
		Players: map[string]*Player{},
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

	// Integrate motion toward waypoints
	for _, s := range r.Ships {
		if len(s.Waypoints) > 0 {
			for len(s.Waypoints) > 0 {
				target := s.Waypoints[0]
				dir := target.Pos.Sub(s.Pos)
				dist := dir.Len()
				if dist <= 1e-3 {
					s.Pos = target.Pos
					s.Vel = Vec2{}
					s.Waypoints = s.Waypoints[1:]
					continue
				}
				speed := clamp(target.Speed, 0, shipMaxSpeed)
				if speed <= 1e-3 {
					s.Vel = Vec2{}
					break
				}
				vel := dir.Scale(1.0 / dist).Scale(speed)
				step := vel.Scale(dt)
				if step.Len() >= dist {
					s.Pos = target.Pos
					s.Vel = Vec2{}
					s.Waypoints = s.Waypoints[1:]
					continue
				}
				s.Pos = s.Pos.Add(step)
				s.Vel = vel
				break
			}
		} else {
			s.Vel = Vec2{}
		}
		// Bounds
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
