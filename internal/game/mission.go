package game

import (
	"math"
	"math/rand"
)

const missionOwnerID = "mission"

func (r *Room) SpawnMinefield(cx, cy, count int, radius float64, heatParams HeatParams, lifetime float64) {
	if count <= 0 || radius <= 0 {
		return
	}
	center := Vec2{X: float64(cx), Y: float64(cy)}
	sanitizedHeat := SanitizeHeatParams(heatParams)
	for i := 0; i < count; i++ {
		theta := rand.Float64() * 2 * math.Pi
		dist := radius * math.Sqrt(rand.Float64())
		offset := Vec2{
			X: math.Cos(theta) * dist,
			Y: math.Sin(theta) * dist,
		}
		pos := clampVec(center.Add(offset), r.WorldWidth, r.WorldHeight)
		cfg := MissileConfig{
			Speed:      0,
			AgroRadius: 0,
			Lifetime:   sampleLifetime(lifetime),
			HeatParams: sanitizedHeat,
		}
		waypoints := []RouteWaypoint{
			{Pos: pos, Speed: 0},
		}
		r.LaunchMissile(missionOwnerID, 0, cfg, waypoints, pos, Vec2{})
	}
}

func (r *Room) SpawnPatrollers(waypoints []Vec2, count int, speedRange [2]float64, agro float64, heatParams HeatParams, lifetime float64) {
	if count <= 0 || len(waypoints) < 2 {
		return
	}
	sanitizedHeat := SanitizeHeatParams(heatParams)
	for i := 0; i < count; i++ {
		speed := randomBetween(speedRange[0], speedRange[1])
		if speed <= 0 {
			speed = 10
		}
		offset := rand.Intn(len(waypoints))
		route := make([]RouteWaypoint, 0, len(waypoints)+1)
		for idx := 0; idx < len(waypoints); idx++ {
			wp := waypoints[(offset+idx)%len(waypoints)]
			clamped := clampVec(wp, r.WorldWidth, r.WorldHeight)
			route = append(route, RouteWaypoint{Pos: clamped, Speed: speed})
		}
		// Close the loop to encourage continuous patrol behaviour.
		route = append(route, RouteWaypoint{
			Pos:   route[0].Pos,
			Speed: speed,
		})
		start := route[0].Pos
		cfg := MissileConfig{
			Speed:      speed,
			AgroRadius: agro,
			Lifetime:   sampleLifetime(lifetime),
			HeatParams: sanitizedHeat,
		}
		r.LaunchMissile(missionOwnerID, 0, cfg, route, start, Vec2{})
	}
}

func (r *Room) SpawnSeekers(cx, cy, count int, ringRadius float64, speedRange [2]float64, agroRange [2]float64, heatParams HeatParams, lifetime float64) {
	if count <= 0 || ringRadius <= 0 {
		return
	}
	center := Vec2{X: float64(cx), Y: float64(cy)}
	sanitizedHeat := SanitizeHeatParams(heatParams)
	for i := 0; i < count; i++ {
		theta := rand.Float64() * 2 * math.Pi
		radius := ringRadius * (0.7 + 0.3*rand.Float64())
		spawn := Vec2{
			X: center.X + math.Cos(theta)*radius,
			Y: center.Y + math.Sin(theta)*radius,
		}
		spawn = clampVec(spawn, r.WorldWidth, r.WorldHeight)
		target := clampVec(center, r.WorldWidth, r.WorldHeight)
		speed := randomBetween(speedRange[0], speedRange[1])
		if speed <= 0 {
			speed = 80
		}
		agro := randomBetween(agroRange[0], agroRange[1])
		if agro < 0 {
			agro = 0
		}
		cfg := MissileConfig{
			Speed:      speed,
			AgroRadius: agro,
			Lifetime:   sampleLifetime(lifetime),
			HeatParams: sanitizedHeat,
		}
		route := []RouteWaypoint{
			{Pos: spawn, Speed: speed},
			{Pos: target, Speed: speed},
		}
		r.LaunchMissile(missionOwnerID, 0, cfg, route, spawn, Vec2{})
	}
}

func sampleLifetime(max float64) float64 {
	if max <= 0 {
		return MissileMaxLifetime
	}
	min := max * 0.75
	if min <= 0 {
		min = max * 0.5
	}
	return randomBetween(min, max)
}

func randomBetween(a, b float64) float64 {
	if math.IsNaN(a) || math.IsInf(a, 0) {
		a = 0
	}
	if math.IsNaN(b) || math.IsInf(b, 0) {
		b = 0
	}
	if a == b {
		return a
	}
	lo := math.Min(a, b)
	hi := math.Max(a, b)
	return lo + rand.Float64()*(hi-lo)
}

func clampVec(v Vec2, maxX, maxY float64) Vec2 {
	return Vec2{
		X: Clamp(v.X, 0, maxX),
		Y: Clamp(v.Y, 0, maxY),
	}
}
