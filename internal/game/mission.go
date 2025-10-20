package game

import (
	"math"
	"math/rand"
)

const missionOwnerID = "mission"

var waveEncounterMap = map[int]string{
	1: "minefield-basic",
	2: "mixed-hazard",
	3: "seeker-swarm",
}

// SpawnFromTemplate instantiates all spawn groups defined in the encounter template.
func SpawnFromTemplate(r *Room, template *EncounterTemplate, center Vec2, seed int64) []EntityID {
	if r == nil || template == nil {
		return nil
	}
	rng := rand.New(rand.NewSource(seed))
	spawned := make([]EntityID, 0)

	for _, group := range template.SpawnGroups {
		count := group.Count.Min
		if group.Count.Max > group.Count.Min {
			count += rng.Intn(group.Count.Max - group.Count.Min + 1)
		}
		if count <= 0 {
			continue
		}

		positions := generateFormation(group.Formation, center, count, rng)
		lifetime := template.Lifetime
		if lifetime <= 0 {
			lifetime = 180
		}

		switch group.EntityType {
		case "mine":
			for i := 0; i < count; i++ {
				pos := clampVec(positions[i], r.WorldWidth, r.WorldHeight)
				id := spawnMineEntity(r, pos, group.HeatParams, lifetime, group.Tags)
				if id != 0 {
					spawned = append(spawned, id)
				}
			}
		case "patroller":
			waypoints := waypointsOrDefault(template.WaypointGen, center, rng)
			for i := 0; i < count; i++ {
				pos := clampVec(positions[i], r.WorldWidth, r.WorldHeight)
				speed := randomBetween(group.SpeedRange.Min, group.SpeedRange.Max)
				if speed <= 0 {
					speed = 20
				}
				agro := randomBetween(group.AgroRange.Min, group.AgroRange.Max)
				if agro < 0 {
					agro = MissileMinAgroRadius
				}
				id := spawnPatrollerEntity(r, pos, speed, agro, waypoints, group.HeatParams, lifetime, group.Tags)
				if id != 0 {
					spawned = append(spawned, id)
				}
			}
		case "seeker":
			for i := 0; i < count; i++ {
				pos := clampVec(positions[i], r.WorldWidth, r.WorldHeight)
				speed := randomBetween(group.SpeedRange.Min, group.SpeedRange.Max)
				if speed <= 0 {
					speed = 80
				}
				agro := randomBetween(group.AgroRange.Min, group.AgroRange.Max)
				if agro < 0 {
					agro = MissileMinAgroRadius
				}
				id := spawnSeekerEntity(r, pos, center, speed, agro, group.HeatParams, lifetime, group.Tags)
				if id != 0 {
					spawned = append(spawned, id)
				}
			}
		default:
			// Unknown entity type: skip
		}
	}

	return spawned
}

func waypointsOrDefault(generator WaypointGenerator, center Vec2, rng *rand.Rand) []Vec2 {
	if generator != nil {
		if path := generator.Generate(center, rng); len(path) > 0 {
			return path
		}
	}
	// Default to a small circular patrol if no generator is provided.
	circle := CircularPathGenerator{Radius: 600, PointCount: 4, Clockwise: true}
	return circle.Generate(center, rng)
}

func spawnMineEntity(r *Room, pos Vec2, heatParams HeatParams, lifetime float64, tags map[string]bool) EntityID {
	cfg := MissileConfig{
		Speed:      0,
		AgroRadius: 0,
		Lifetime:   sampleLifetime(lifetime),
		HeatParams: SanitizeHeatParams(heatParams),
	}
	route := []RouteWaypoint{{Pos: pos, Speed: 0}}
	id := r.LaunchMissile(missionOwnerID, 0, cfg, route, pos, Vec2{})
	applyEntityTags(r, id, tags)
	return id
}

func spawnPatrollerEntity(r *Room, start Vec2, speed, agro float64, waypoints []Vec2, heatParams HeatParams, lifetime float64, tags map[string]bool) EntityID {
	if len(waypoints) == 0 {
		return 0
	}
	cfg := MissileConfig{
		Speed:      speed,
		AgroRadius: agro,
		Lifetime:   sampleLifetime(lifetime),
		HeatParams: SanitizeHeatParams(heatParams),
	}

	route := make([]RouteWaypoint, 0, len(waypoints)+1)
	for _, wp := range waypoints {
		clamped := clampVec(wp, r.WorldWidth, r.WorldHeight)
		route = append(route, RouteWaypoint{Pos: clamped, Speed: speed})
	}
	route = append(route, RouteWaypoint{Pos: route[0].Pos, Speed: speed})
	id := r.LaunchMissile(missionOwnerID, 0, cfg, route, clampVec(start, r.WorldWidth, r.WorldHeight), Vec2{})
	applyEntityTags(r, id, tags)
	return id
}

func spawnSeekerEntity(r *Room, start Vec2, target Vec2, speed, agro float64, heatParams HeatParams, lifetime float64, tags map[string]bool) EntityID {
	cfg := MissileConfig{
		Speed:      speed,
		AgroRadius: agro,
		Lifetime:   sampleLifetime(lifetime),
		HeatParams: SanitizeHeatParams(heatParams),
	}
	start = clampVec(start, r.WorldWidth, r.WorldHeight)
	target = clampVec(target, r.WorldWidth, r.WorldHeight)
	route := []RouteWaypoint{
		{Pos: start, Speed: speed},
		{Pos: target, Speed: speed},
	}
	id := r.LaunchMissile(missionOwnerID, 0, cfg, route, start, Vec2{})
	applyEntityTags(r, id, tags)
	return id
}

func applyEntityTags(r *Room, id EntityID, tags map[string]bool) {
	if r == nil || id == 0 || len(tags) == 0 {
		return
	}
	existing := r.World.Tags(id)
	if existing == nil {
		r.World.SetComponent(id, CompTags, &TagComponent{Tags: copyTags(tags)})
		return
	}
	if existing.Tags == nil {
		existing.Tags = make(map[string]bool)
	}
	for k, v := range tags {
		if v {
			existing.Tags[k] = true
		} else {
			delete(existing.Tags, k)
		}
	}
}

func generateFormation(formation string, center Vec2, count int, rng *rand.Rand) []Vec2 {
	positions := make([]Vec2, count)
	switch formation {
	case "ring":
		radius := 800.0
		angleStep := 2 * math.Pi / float64(count)
		for i := 0; i < count; i++ {
			angle := float64(i) * angleStep
			positions[i] = Vec2{
				X: center.X + radius*math.Cos(angle),
				Y: center.Y + radius*math.Sin(angle),
			}
		}
	case "cluster":
		clusterRadius := 300.0
		for i := 0; i < count; i++ {
			angle := rng.Float64() * 2 * math.Pi
			dist := rng.Float64() * clusterRadius
			positions[i] = Vec2{
				X: center.X + dist*math.Cos(angle),
				Y: center.Y + dist*math.Sin(angle),
			}
		}
	case "line":
		spacing := 200.0
		angle := rng.Float64() * 2 * math.Pi
		for i := 0; i < count; i++ {
			offset := (float64(i) - float64(count-1)/2) * spacing
			positions[i] = Vec2{
				X: center.X + offset*math.Cos(angle),
				Y: center.Y + offset*math.Sin(angle),
			}
		}
	case "scattered":
		scatterRadius := 600.0
		for i := 0; i < count; i++ {
			angle := rng.Float64() * 2 * math.Pi
			dist := rng.Float64() * scatterRadius
			positions[i] = Vec2{
				X: center.X + dist*math.Cos(angle),
				Y: center.Y + dist*math.Sin(angle),
			}
		}
	default:
		for i := 0; i < count; i++ {
			positions[i] = center
		}
	}
	return positions
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
	encounterID, ok := waveEncounterMap[waveIndex]
	if !ok {
		return nil
	}
	template, err := GetEncounter(encounterID)
	if err != nil {
		return nil
	}

	center := Vec2{X: r.WorldWidth * 0.5, Y: r.WorldHeight * 0.5}
	if idx := waveIndex - 1; idx >= 0 && idx < len(beacons) {
		center = clampVec(beacons[idx], r.WorldWidth, r.WorldHeight)
	}
	seed := int64(waveIndex)*1_000_003 + int64(len(beacons))*97
	return SpawnFromTemplate(r, template, center, seed)
}
