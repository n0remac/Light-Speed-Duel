package main

import "sync"

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
	limit int
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
