package game

import (
	"fmt"
	"math"
	"math/rand"
)

// EncounterTemplate defines a reusable encounter configuration.
type EncounterTemplate struct {
	ID             string
	DisplayName    string
	EncounterType  string
	SpawnGroups    []SpawnGroup
	WaypointGen    WaypointGenerator
	HeatProfile    HeatParams
	Lifetime       float64
	Tags           map[string]bool
	MaxConcurrency int
	Cooldown       float64
}

// SpawnGroup defines a cluster of entities to spawn.
type SpawnGroup struct {
	EntityType string
	Count      CountRange
	Formation  string
	HeatParams HeatParams
	SpeedRange SpeedRange
	AgroRange  AgroRange
	Tags       map[string]bool
}

// CountRange represents an inclusive range for entity counts.
type CountRange struct {
	Min int
	Max int
}

// SpeedRange defines the min/max speed for spawned entities.
type SpeedRange struct {
	Min float64
	Max float64
}

// AgroRange defines the min/max agro radius for spawned entities.
type AgroRange struct {
	Min float64
	Max float64
}

// WaypointGenerator creates patrol paths for entities.
type WaypointGenerator interface {
	Generate(center Vec2, rng *rand.Rand) []Vec2
}

// CircularPathGenerator creates a circular patrol route.
type CircularPathGenerator struct {
	Radius     float64
	PointCount int
	Clockwise  bool
}

// Generate builds waypoints along a circle.
func (g CircularPathGenerator) Generate(center Vec2, rng *rand.Rand) []Vec2 {
	if g.PointCount <= 0 {
		return nil
	}
	waypoints := make([]Vec2, g.PointCount)
	angleStep := 2 * math.Pi / float64(g.PointCount)
	for i := 0; i < g.PointCount; i++ {
		angle := float64(i) * angleStep
		if !g.Clockwise {
			angle = -angle
		}
		waypoints[i] = Vec2{
			X: center.X + g.Radius*math.Cos(angle),
			Y: center.Y + g.Radius*math.Sin(angle),
		}
	}
	return waypoints
}

// RandomPathGenerator creates a random wander path around a center.
type RandomPathGenerator struct {
	PointCount int
	Radius     float64
}

// Generate builds random waypoints within the configured radius.
func (g RandomPathGenerator) Generate(center Vec2, rng *rand.Rand) []Vec2 {
	if g.PointCount <= 0 {
		return nil
	}
	waypoints := make([]Vec2, g.PointCount)
	for i := 0; i < g.PointCount; i++ {
		angle := rng.Float64() * 2 * math.Pi
		dist := rng.Float64() * g.Radius
		waypoints[i] = Vec2{
			X: center.X + dist*math.Cos(angle),
			Y: center.Y + dist*math.Sin(angle),
		}
	}
	return waypoints
}

// EncounterRegistry holds all defined encounter templates.
var EncounterRegistry = map[string]EncounterTemplate{
	"minefield-basic": {
		ID:            "minefield-basic",
		DisplayName:   "Basic Minefield",
		EncounterType: "minefield",
		SpawnGroups: []SpawnGroup{
			{
				EntityType: "mine",
				Count:      CountRange{Min: 18, Max: 24},
				Formation:  "scattered",
				HeatParams: HeatParams{Max: 40, KUp: 20, KDown: 14},
				Tags:       map[string]bool{"mine": true, "hazard": true, "static": true},
			},
		},
		HeatProfile:    HeatParams{Max: 40, KUp: 20, KDown: 14},
		Lifetime:       160,
		Tags:           map[string]bool{"tier-1": true, "minefield": true, "hazard": true, "static": true},
		MaxConcurrency: 2,
		Cooldown:       30,
	},
	"patrol-light": {
		ID:            "patrol-light",
		DisplayName:   "Light Patrol",
		EncounterType: "patrol",
		SpawnGroups: []SpawnGroup{
			{
				EntityType: "patroller",
				Count:      CountRange{Min: 3, Max: 5},
				Formation:  "line",
				HeatParams: HeatParams{Max: 50, KUp: 24, KDown: 12},
				SpeedRange: SpeedRange{Min: 20, Max: 40},
				AgroRange:  AgroRange{Min: 280, Max: 320},
				Tags:       map[string]bool{"patrol": true, "hostile": true, "mobile": true},
			},
		},
		WaypointGen:    CircularPathGenerator{Radius: 800, PointCount: 6, Clockwise: true},
		HeatProfile:    HeatParams{Max: 50, KUp: 24, KDown: 12},
		Lifetime:       200,
		Tags:           map[string]bool{"tier-1": true, "patrol": true, "mobile": true, "hostile": true},
		MaxConcurrency: 1,
		Cooldown:       45,
	},
	"seeker-swarm": {
		ID:            "seeker-swarm",
		DisplayName:   "Seeker Swarm",
		EncounterType: "seeker",
		SpawnGroups: []SpawnGroup{
			{
				EntityType: "seeker",
				Count:      CountRange{Min: 6, Max: 10},
				Formation:  "ring",
				HeatParams: HeatParams{Max: 68, KUp: 20, KDown: 15},
				SpeedRange: SpeedRange{Min: 60, Max: 100},
				AgroRange:  AgroRange{Min: 600, Max: 900},
				Tags:       map[string]bool{"seeker": true, "hostile": true, "mobile": true},
			},
		},
		HeatProfile:    HeatParams{Max: 68, KUp: 20, KDown: 15},
		Lifetime:       260,
		Tags:           map[string]bool{"tier-2": true, "seeker": true, "mobile": true, "hostile": true},
		MaxConcurrency: 1,
		Cooldown:       60,
	},
	"mixed-hazard": {
		ID:            "mixed-hazard",
		DisplayName:   "Mixed Hazard Zone",
		EncounterType: "mixed",
		SpawnGroups: []SpawnGroup{
			{
				EntityType: "mine",
				Count:      CountRange{Min: 18, Max: 24},
				Formation:  "scattered",
				HeatParams: HeatParams{Max: 50, KUp: 24, KDown: 12},
				Tags:       map[string]bool{"mine": true, "hazard": true, "static": true},
			},
			{
				EntityType: "patroller",
				Count:      CountRange{Min: 3, Max: 5},
				Formation:  "line",
				HeatParams: HeatParams{Max: 50, KUp: 24, KDown: 12},
				SpeedRange: SpeedRange{Min: 20, Max: 40},
				AgroRange:  AgroRange{Min: 280, Max: 320},
				Tags:       map[string]bool{"patrol": true, "hostile": true, "mobile": true},
			},
		},
		WaypointGen:    RandomPathGenerator{PointCount: 8, Radius: 1000},
		HeatProfile:    HeatParams{Max: 50, KUp: 24, KDown: 12},
		Lifetime:       200,
		Tags:           map[string]bool{"tier-2": true, "mixed": true, "mobile": true, "hazard": true},
		MaxConcurrency: 2,
		Cooldown:       50,
	},
}

// GetEncounter retrieves an encounter template by ID.
func GetEncounter(id string) (*EncounterTemplate, error) {
	if id == "" {
		return nil, fmt.Errorf("encounter template not found: empty id")
	}
	template, ok := EncounterRegistry[id]
	if !ok {
		return nil, fmt.Errorf("encounter template not found: %s", id)
	}
	return &template, nil
}
