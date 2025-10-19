package game

import (
	"math"
	"math/rand"
)

const missionOwnerID = "mission"

func (r *Room) SpawnMinefield(cx, cy, count int, radius float64, heatParams HeatParams, lifetime float64) []EntityID {
	if count <= 0 || radius <= 0 {
		return nil
	}
	center := Vec2{X: float64(cx), Y: float64(cy)}
	sanitizedHeat := SanitizeHeatParams(heatParams)
	ids := make([]EntityID, 0, count)
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
		if id := r.LaunchMissile(missionOwnerID, 0, cfg, waypoints, pos, Vec2{}); id != 0 {
			ids = append(ids, id)
		}
	}
	return ids
}

func (r *Room) SpawnPatrollers(waypoints []Vec2, count int, speedRange [2]float64, agro float64, heatParams HeatParams, lifetime float64) []EntityID {
	if count <= 0 || len(waypoints) < 2 {
		return nil
	}
	sanitizedHeat := SanitizeHeatParams(heatParams)
	ids := make([]EntityID, 0, count)
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
		if id := r.LaunchMissile(missionOwnerID, 0, cfg, route, start, Vec2{}); id != 0 {
			ids = append(ids, id)
		}
	}
	return ids
}

func (r *Room) SpawnSeekers(cx, cy, count int, ringRadius float64, speedRange [2]float64, agroRange [2]float64, heatParams HeatParams, lifetime float64) []EntityID {
	if count <= 0 || ringRadius <= 0 {
		return nil
	}
	center := Vec2{X: float64(cx), Y: float64(cy)}
	sanitizedHeat := SanitizeHeatParams(heatParams)
	ids := make([]EntityID, 0, count)
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
		if id := r.LaunchMissile(missionOwnerID, 0, cfg, route, spawn, Vec2{}); id != 0 {
			ids = append(ids, id)
		}
	}
	return ids
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

// SpawnMissionWave spawns deterministic encounter content for the provided wave index.
// Returns the entity IDs spawned so the caller can track and clean them up later.
func (r *Room) SpawnMissionWave(waveIndex int, beacons []Vec2) []EntityID {
	if len(beacons) < 4 {
		return nil
	}
	var spawned []EntityID
	switch waveIndex {
	case 1:
		heat := HeatParams{
			Max:         40,
			WarnAt:      28,
			OverheatAt:  40,
			MarkerSpeed: 60,
			KUp:         20,
			KDown:       14,
			Exp:         HeatExp,
		}
		total := 18 + rand.Intn(7) // 18-24
		points := []Vec2{
			lerpVecWithVerticalSpread(beacons[0], beacons[1], 0.25, r.WorldHeight, 0.15),
			lerpVecWithVerticalSpread(beacons[0], beacons[1], 0.5, r.WorldHeight, 0.15),
			lerpVecWithVerticalSpread(beacons[0], beacons[1], 0.75, r.WorldHeight, 0.15),
		}
		radius := math.Max(r.WorldWidth*0.025, 600)
		distributed := total
		for idx, center := range points {
			if distributed <= 0 {
				break
			}
			remainingSlots := len(points) - idx
			group := distributed / remainingSlots
			if group <= 0 {
				group = distributed
			}
			if ids := r.SpawnMinefield(int(center.X), int(center.Y), group, radius, heat, 160); len(ids) > 0 {
				spawned = append(spawned, ids...)
			}
			distributed -= group
		}
	case 2:
		minesHeat := HeatParams{
			Max:         50,
			WarnAt:      35,
			OverheatAt:  50,
			MarkerSpeed: 100,
			KUp:         24,
			KDown:       12,
			Exp:         HeatExp,
		}
		total := 28 + rand.Intn(9) // 28-36
		mineCount := int(math.Round(float64(total) * 0.65))
		if mineCount < 12 {
			mineCount = 12
		}
		if mineCount > total {
			mineCount = total
		}
		patrollerCount := total - mineCount
		points := []Vec2{
			lerpVecWithVerticalSpread(beacons[1], beacons[2], 0.2, r.WorldHeight, 0.15),
			lerpVecWithVerticalSpread(beacons[1], beacons[2], 0.45, r.WorldHeight, 0.15),
			lerpVecWithVerticalSpread(beacons[1], beacons[2], 0.7, r.WorldHeight, 0.15),
		}
		radius := math.Max(r.WorldWidth*0.02, 500)
		distributed := mineCount
		for idx, center := range points {
			if distributed <= 0 {
				break
			}
			remainingSlots := len(points) - idx
			group := distributed / remainingSlots
			if group <= 0 {
				group = distributed
			}
			if ids := r.SpawnMinefield(int(center.X), int(center.Y), group, radius, minesHeat, 200); len(ids) > 0 {
				spawned = append(spawned, ids...)
			}
			distributed -= group
		}
		if patrollerCount > 0 {
			path := []Vec2{
				lerpVecWithVerticalSpread(beacons[1], beacons[2], 0.15, r.WorldHeight, 0.15),
				lerpVecWithVerticalSpread(beacons[1], beacons[2], 0.5, r.WorldHeight, 0.15),
				lerpVecWithVerticalSpread(beacons[1], beacons[2], 0.85, r.WorldHeight, 0.15),
			}
			if ids := r.SpawnPatrollers(path, patrollerCount, [2]float64{20, 40}, 320, minesHeat, 200); len(ids) > 0 {
				spawned = append(spawned, ids...)
			}
		}
	case 3:
		seekersHeat := HeatParams{
			Max:         68,
			WarnAt:      46,
			OverheatAt:  68,
			MarkerSpeed: 120,
			KUp:         20,
			KDown:       15,
			Exp:         HeatExp,
		}
		seekers := 6 + rand.Intn(5) // 6-10
		center := lerpVecWithVerticalSpread(beacons[2], beacons[3], 0.55, r.WorldHeight, 0.15)
		ring := math.Max(r.WorldWidth*0.035, 900)
		if ids := r.SpawnSeekers(int(center.X), int(center.Y), seekers, ring, [2]float64{60, 100}, [2]float64{600, 900}, seekersHeat, 260); len(ids) > 0 {
			spawned = append(spawned, ids...)
		}

		supportHeat := HeatParams{
			Max:         55,
			WarnAt:      38,
			OverheatAt:  55,
			MarkerSpeed: 90,
			KUp:         22,
			KDown:       13,
			Exp:         HeatExp,
		}
		mines := 12 + rand.Intn(5)
		if ids := r.SpawnMinefield(int(center.X), int(center.Y), mines, ring*0.8, supportHeat, 220); len(ids) > 0 {
			spawned = append(spawned, ids...)
		}
	}
	return spawned
}

func lerpVec(a, b Vec2, t float64) Vec2 {
	return Vec2{
		X: a.X + (b.X-a.X)*t,
		Y: a.Y + (b.Y-a.Y)*t,
	}
}

// lerpVecWithVerticalSpread interpolates between two points and adds vertical variance.
// spreadFactor controls how much vertical spread to add (0.0 = no spread, 1.0 = full world height variance).
func lerpVecWithVerticalSpread(a, b Vec2, t float64, worldHeight float64, spreadFactor float64) Vec2 {
	base := lerpVec(a, b, t)
	verticalVariance := (rand.Float64() - 0.5) * 2.0 * spreadFactor * worldHeight
	base.Y += verticalVariance
	if base.Y < 0 {
		base.Y = 0
	}
	if base.Y > worldHeight {
		base.Y = worldHeight
	}
	return base
}
