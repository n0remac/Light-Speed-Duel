# Phase 3 Backend Tasks

**Prerequisites**: Read [OVERVIEW.md](OVERVIEW.md) first for sampler parameters and tag taxonomy.

---

## Implementation Tasks

### 1. Poisson-Disc Beacon Sampler

**Goal**: Generate evenly-spaced beacon positions deterministically using Poisson-disc sampling

**Files to Create/Modify**:
- Create `internal/game/beacons_sampling.go` (new file)
- Modify `internal/game/beacons.go` (integrate sampler into layout generation)
- Modify `internal/game/room.go` (call sampler on room creation)

**Code Sketch**:
```go
// internal/game/beacons_sampling.go

package game

import (
	"math"
	"math/rand"
)

// SamplerConfig controls beacon placement density and constraints
type SamplerConfig struct {
	MinDistance   float64            // Minimum distance between beacons
	MaxAttempts   int                // Max attempts to place each beacon (default 30)
	WorldBounds   Rect               // Sampling area
	Seed          int64              // Deterministic seed
	DesignerPins  []BeaconPin        // Fixed beacon positions
	BiomeTaggers  []BiomeTagger      // Functions to tag beacons by position
}

// BeaconPin represents a designer-specified beacon location
type BeaconPin struct {
	X, Y   float64
	Tags   map[string]bool  // e.g., {"start": true, "boss": true}
	Radius float64
}

// BiomeTagger assigns tags based on beacon position
type BiomeTagger func(x, y float64) map[string]bool

// Rect defines a rectangular sampling area
type Rect struct {
	MinX, MinY, MaxX, MaxY float64
}

// PoissonDiscSampler generates evenly-spaced beacon positions
type PoissonDiscSampler struct {
	config   SamplerConfig
	rng      *rand.Rand
	grid     map[GridKey]*BeaconCandidate
	cellSize float64
}

type GridKey struct {
	X, Y int
}

type BeaconCandidate struct {
	X, Y   float64
	Tags   map[string]bool
	Radius float64
	Pinned bool  // True if designer-specified
}

// NewPoissonDiscSampler creates a sampler with given config
func NewPoissonDiscSampler(config SamplerConfig) *PoissonDiscSampler {
	if config.MaxAttempts == 0 {
		config.MaxAttempts = 30
	}

	return &PoissonDiscSampler{
		config:   config,
		rng:      rand.New(rand.NewSource(config.Seed)),
		grid:     make(map[GridKey]*BeaconCandidate),
		cellSize: config.MinDistance / math.Sqrt2,
	}
}

// Sample generates beacon positions using Poisson-disc algorithm
func (s *PoissonDiscSampler) Sample(count int) []BeaconCandidate {
	beacons := []BeaconCandidate{}

	// 1. Add designer pins first
	for _, pin := range s.config.DesignerPins {
		candidate := BeaconCandidate{
			X:      pin.X,
			Y:      pin.Y,
			Tags:   pin.Tags,
			Radius: pin.Radius,
			Pinned: true,
		}
		beacons = append(beacons, candidate)
		s.addToGrid(candidate)
	}

	// 2. Generate procedural beacons
	activeList := []BeaconCandidate{}

	// Seed with random start point if no pins
	if len(beacons) == 0 {
		initial := s.randomPointInBounds()
		initial.Tags = s.applyBiomeTaggers(initial.X, initial.Y)
		beacons = append(beacons, initial)
		activeList = append(activeList, initial)
		s.addToGrid(initial)
	} else {
		// Use pins as seeds
		activeList = append(activeList, beacons...)
	}

	// Poisson-disc algorithm
	for len(activeList) > 0 && len(beacons) < count {
		// Pick random active point
		idx := s.rng.Intn(len(activeList))
		active := activeList[idx]

		// Try to place new point in annulus around active point
		placed := false
		for attempt := 0; attempt < s.config.MaxAttempts; attempt++ {
			candidate := s.generateAnnulusPoint(active)

			if s.isValid(candidate) {
				candidate.Tags = s.applyBiomeTaggers(candidate.X, candidate.Y)
				beacons = append(beacons, candidate)
				activeList = append(activeList, candidate)
				s.addToGrid(candidate)
				placed = true
				break
			}
		}

		// Remove from active list if no valid placement found
		if !placed {
			activeList = append(activeList[:idx], activeList[idx+1:]...)
		}
	}

	return beacons
}

// generateAnnulusPoint creates a random point in annulus [minDist, 2*minDist] from center
func (s *PoissonDiscSampler) generateAnnulusPoint(center BeaconCandidate) BeaconCandidate {
	angle := s.rng.Float64() * 2 * math.Pi
	radius := s.config.MinDistance * (1 + s.rng.Float64())  // [minDist, 2*minDist]

	return BeaconCandidate{
		X:      center.X + radius*math.Cos(angle),
		Y:      center.Y + radius*math.Sin(angle),
		Radius: 300,  // Default radius, can be varied later
		Tags:   make(map[string]bool),
	}
}

// isValid checks if candidate is within bounds and far enough from all others
func (s *PoissonDiscSampler) isValid(candidate BeaconCandidate) bool {
	// Check bounds
	if candidate.X < s.config.WorldBounds.MinX || candidate.X > s.config.WorldBounds.MaxX ||
		candidate.Y < s.config.WorldBounds.MinY || candidate.Y > s.config.WorldBounds.MaxY {
		return false
	}

	// Check distance to neighbors using spatial grid
	gridX := int(candidate.X / s.cellSize)
	gridY := int(candidate.Y / s.cellSize)

	// Check 5x5 grid around candidate
	for dx := -2; dx <= 2; dx++ {
		for dy := -2; dy <= 2; dy++ {
			key := GridKey{X: gridX + dx, Y: gridY + dy}
			if neighbor, exists := s.grid[key]; exists {
				dist := math.Hypot(candidate.X-neighbor.X, candidate.Y-neighbor.Y)
				if dist < s.config.MinDistance {
					return false
				}
			}
		}
	}

	return true
}

// addToGrid inserts candidate into spatial grid
func (s *PoissonDiscSampler) addToGrid(candidate BeaconCandidate) {
	gridX := int(candidate.X / s.cellSize)
	gridY := int(candidate.Y / s.cellSize)
	s.grid[GridKey{X: gridX, Y: gridY}] = &candidate
}

// randomPointInBounds returns random point within world bounds
func (s *PoissonDiscSampler) randomPointInBounds() BeaconCandidate {
	return BeaconCandidate{
		X:      s.config.WorldBounds.MinX + s.rng.Float64()*(s.config.WorldBounds.MaxX-s.config.WorldBounds.MinX),
		Y:      s.config.WorldBounds.MinY + s.rng.Float64()*(s.config.WorldBounds.MaxY-s.config.WorldBounds.MinY),
		Radius: 300,
		Tags:   make(map[string]bool),
	}
}

// applyBiomeTaggers runs all biome taggers and merges results
func (s *PoissonDiscSampler) applyBiomeTaggers(x, y float64) map[string]bool {
	tags := make(map[string]bool)
	for _, tagger := range s.config.BiomeTaggers {
		for tag, value := range tagger(x, y) {
			tags[tag] = value
		}
	}
	return tags
}

// Example biome tagger: tag beacons by quadrant
func QuadrantTagger(worldWidth, worldHeight float64) BiomeTagger {
	return func(x, y float64) map[string]bool {
		tags := make(map[string]bool)

		// Determine tier by distance from center
		centerX, centerY := worldWidth/2, worldHeight/2
		distFromCenter := math.Hypot(x-centerX, y-centerY)
		maxDist := math.Hypot(centerX, centerY)

		if distFromCenter < maxDist*0.3 {
			tags["tier-1"] = true
		} else if distFromCenter < maxDist*0.6 {
			tags["tier-2"] = true
		} else {
			tags["tier-3"] = true
		}

		// Tag by zone (NE, NW, SE, SW)
		if x > centerX && y > centerY {
			tags["zone-ne"] = true
		} else if x < centerX && y > centerY {
			tags["zone-nw"] = true
		} else if x > centerX && y < centerY {
			tags["zone-se"] = true
		} else {
			tags["zone-sw"] = true
		}

		return tags
	}
}
```

**Integration into BeaconDirector**:
```go
// In internal/game/beacons.go

func (d *BeaconDirector) GenerateLayout(missionSpec *MissionSpec, roomID string, worldBounds Rect) *BeaconLayout {
	seed := hashRoomAndMission(roomID, missionSpec.ID)

	// Configure sampler
	config := SamplerConfig{
		MinDistance: 2500,  // Minimum 2500 units between beacons
		MaxAttempts: 30,
		WorldBounds: worldBounds,
		Seed:        seed,
		DesignerPins: missionSpec.DesignerPins,  // Allow mission to specify fixed beacons
		BiomeTaggers: []BiomeTagger{
			QuadrantTagger(worldBounds.MaxX-worldBounds.MinX, worldBounds.MaxY-worldBounds.MinY),
		},
	}

	sampler := NewPoissonDiscSampler(config)
	candidates := sampler.Sample(missionSpec.BeaconCount)

	// Convert candidates to BeaconLayout
	layout := &BeaconLayout{
		Beacons: make([]MissionBeacon, len(candidates)),
	}

	for i, candidate := range candidates {
		layout.Beacons[i] = MissionBeacon{
			ID:       fmt.Sprintf("beacon-%d", i),
			Ordinal:  i,
			X:        candidate.X,
			Y:        candidate.Y,
			Radius:   candidate.Radius,
			Tags:     candidate.Tags,
			Seed:     seed + int64(i),
			Pinned:   candidate.Pinned,
		}
	}

	return layout
}
```

**Task Checklist**:
- [ ] Create `internal/game/beacons_sampling.go` file
- [ ] Define `SamplerConfig` struct with all configuration fields
- [ ] Define `BeaconPin` and `BiomeTagger` types
- [ ] Implement `PoissonDiscSampler` struct with grid-based spatial partitioning
- [ ] Implement `Sample()` method with Poisson-disc algorithm
- [ ] Implement `generateAnnulusPoint()` for candidate generation
- [ ] Implement `isValid()` with bounds checking and distance validation
- [ ] Implement `addToGrid()` for spatial grid insertion
- [ ] Implement `randomPointInBounds()` for initial seeding
- [ ] Implement `applyBiomeTaggers()` to merge tags from all taggers
- [ ] Create `QuadrantTagger()` example biome tagger
- [ ] Modify `BeaconDirector.GenerateLayout()` to use sampler
- [ ] Add `DesignerPins` field to `MissionSpec`
- [ ] Add `Tags` and `Pinned` fields to `MissionBeacon`
- [ ] Write unit tests for sampler (determinism, distance constraints, bounds)

**Acceptance Criteria**:
- Sampler generates exactly `count` beacons (or as many as possible within constraints)
- All procedural beacons are at least `MinDistance` apart
- Designer pins are placed exactly at specified positions
- Same seed produces identical beacon layout every time
- Beacons are tagged correctly by biome taggers
- Beacons stay within world bounds
- Tests pass: `go test ./internal/game -run TestPoissonDiscSampler`

---

### 2. Encounter Template System

**Goal**: Define reusable encounter templates describing spawn patterns, entity compositions, and behavior parameters

**Files to Create/Modify**:
- Create `internal/game/encounters.go` (new file)
- Modify `internal/game/mission.go` (refactor existing spawn functions to use templates)

**Code Sketch**:
```go
// internal/game/encounters.go

package game

// EncounterTemplate defines a reusable encounter configuration
type EncounterTemplate struct {
	ID              string
	DisplayName     string
	EncounterType   string            // "patrol" | "seeker" | "minefield" | "mixed"
	SpawnGroups     []SpawnGroup
	WaypointGen     WaypointGenerator // Generates patrol paths
	HeatProfile     HeatParams        // Heat accumulation profile
	Lifetime        float64           // Encounter cleanup timeout (seconds)
	Tags            map[string]bool   // Tags for spawn table matching
	MaxConcurrency  int               // Max instances of this encounter at once
	Cooldown        float64           // Seconds before can spawn again
}

// SpawnGroup defines a cluster of entities to spawn
type SpawnGroup struct {
	EntityType  string            // "mine" | "patroller" | "seeker"
	Count       CountRange        // Min/max entities to spawn
	Formation   string            // "ring" | "cluster" | "line" | "scattered"
	HeatParams  HeatParams        // Per-entity heat profile
	SpeedRange  SpeedRange        // Velocity range for moving entities
	AgroRange   AgroRange         // Agro radius range
	Tags        map[string]bool   // Tags applied to spawned entities
}

type CountRange struct {
	Min, Max int
}

type SpeedRange struct {
	Min, Max float64
}

type AgroRange struct {
	Min, Max float64
}

type HeatParams struct {
	Max   float64
	KUp   float64
	KDown float64
}

// WaypointGenerator creates patrol paths for entities
type WaypointGenerator interface {
	Generate(center Vec2, rng *rand.Rand) []Vec2
}

// CircularPathGenerator creates circular patrol route
type CircularPathGenerator struct {
	Radius       float64
	PointCount   int
	Clockwise    bool
}

func (g CircularPathGenerator) Generate(center Vec2, rng *rand.Rand) []Vec2 {
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

// RandomPathGenerator creates random waypoint path
type RandomPathGenerator struct {
	PointCount int
	Radius     float64  // Max distance from center
}

func (g RandomPathGenerator) Generate(center Vec2, rng *rand.Rand) []Vec2 {
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

// EncounterRegistry holds all defined encounter templates
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
				Tags:       map[string]bool{"mine": true, "hazard": true},
			},
		},
		HeatProfile: HeatParams{Max: 40, KUp: 20, KDown: 14},
		Lifetime:    160,
		Tags:        map[string]bool{"tier-1": true, "hazard": true},
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
				Tags:       map[string]bool{"patrol": true, "hostile": true},
			},
		},
		WaypointGen: CircularPathGenerator{Radius: 800, PointCount: 6, Clockwise: true},
		HeatProfile: HeatParams{Max: 50, KUp: 24, KDown: 12},
		Lifetime:    200,
		Tags:        map[string]bool{"tier-1": true, "patrol": true},
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
				Tags:       map[string]bool{"seeker": true, "hostile": true},
			},
		},
		HeatProfile: HeatParams{Max: 68, KUp: 20, KDown: 15},
		Lifetime:    260,
		Tags:        map[string]bool{"tier-2": true, "seeker": true},
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
				Tags:       map[string]bool{"mine": true, "hazard": true},
			},
			{
				EntityType: "patroller",
				Count:      CountRange{Min: 3, Max: 5},
				Formation:  "line",
				HeatParams: HeatParams{Max: 50, KUp: 24, KDown: 12},
				SpeedRange: SpeedRange{Min: 20, Max: 40},
				AgroRange:  AgroRange{Min: 280, Max: 320},
				Tags:       map[string]bool{"patrol": true, "hostile": true},
			},
		},
		WaypointGen: RandomPathGenerator{PointCount: 8, Radius: 1000},
		HeatProfile: HeatParams{Max: 50, KUp: 24, KDown: 12},
		Lifetime:    200,
		Tags:        map[string]bool{"tier-2": true, "mixed": true},
		MaxConcurrency: 2,
		Cooldown:       50,
	},
}

// GetEncounter retrieves an encounter template by ID
func GetEncounter(id string) (*EncounterTemplate, error) {
	template, ok := EncounterRegistry[id]
	if !ok {
		return nil, fmt.Errorf("encounter template not found: %s", id)
	}
	return &template, nil
}
```

**Refactor Existing Spawn Functions**:
```go
// In internal/game/mission.go

// SpawnFromTemplate instantiates an encounter template at a location
func SpawnFromTemplate(r *Room, template *EncounterTemplate, center Vec2, seed int64) []EntityID {
	rng := rand.New(rand.NewSource(seed))
	spawnedEntities := []EntityID{}

	for _, group := range template.SpawnGroups {
		// Determine count
		count := group.Count.Min
		if group.Count.Max > group.Count.Min {
			count += rng.Intn(group.Count.Max - group.Count.Min + 1)
		}

		// Generate positions based on formation
		positions := generateFormation(group.Formation, center, count, rng)

		// Spawn entities
		for i := 0; i < count; i++ {
			var entID EntityID

			switch group.EntityType {
			case "mine":
				entID = spawnMine(r, positions[i], group.HeatParams, group.Tags)
			case "patroller":
				speed := group.SpeedRange.Min + rng.Float64()*(group.SpeedRange.Max-group.SpeedRange.Min)
				agro := group.AgroRange.Min + rng.Float64()*(group.AgroRange.Max-group.AgroRange.Min)
				waypoints := template.WaypointGen.Generate(center, rng)
				entID = spawnPatroller(r, positions[i], speed, agro, waypoints, group.HeatParams, group.Tags)
			case "seeker":
				speed := group.SpeedRange.Min + rng.Float64()*(group.SpeedRange.Max-group.SpeedRange.Min)
				agro := group.AgroRange.Min + rng.Float64()*(group.AgroRange.Max-group.AgroRange.Min)
				entID = spawnSeeker(r, positions[i], center, speed, agro, group.HeatParams, group.Tags)
			}

			spawnedEntities = append(spawnedEntities, entID)
		}
	}

	return spawnedEntities
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
		// Default to scattered
		for i := 0; i < count; i++ {
			positions[i] = center
		}
	}

	return positions
}
```

**Task Checklist**:
- [ ] Create `internal/game/encounters.go` file
- [ ] Define `EncounterTemplate` struct with all fields
- [ ] Define `SpawnGroup`, `CountRange`, `SpeedRange`, `AgroRange`, `HeatParams` structs
- [ ] Define `WaypointGenerator` interface
- [ ] Implement `CircularPathGenerator` and `RandomPathGenerator`
- [ ] Create `EncounterRegistry` map with 4 example templates
- [ ] Implement `GetEncounter(id string)` function
- [ ] In `mission.go`, create `SpawnFromTemplate()` function
- [ ] Implement `generateFormation()` helper (ring, cluster, line, scattered)
- [ ] Refactor existing `SpawnMinefield`, `SpawnPatrollers`, `SpawnSeekers` to use templates
- [ ] Add entity tagging to spawn functions
- [ ] Write unit tests for template instantiation

**Acceptance Criteria**:
- `GetEncounter("minefield-basic")` returns correct template
- `SpawnFromTemplate()` spawns correct number of entities
- Entity counts respect Min/Max ranges
- Formations generate correct spatial patterns
- Entity tags are applied correctly
- Waypoint generators produce valid paths
- Tests pass: `go test ./internal/game -run TestEncounterTemplates`

---

### 3. Spawn Table System

**Goal**: Define spawn tables that map beacon tags to weighted encounter selections

**Files to Create/Modify**:
- Create `internal/game/spawn_tables.go` (new file)
- Modify `internal/game/beacons.go` (integrate spawn table queries into director)

**Code Sketch**:
```go
// internal/game/spawn_tables.go

package game

// SpawnTable maps beacon tags to weighted encounter selections
type SpawnTable struct {
	ID          string
	DisplayName string
	Rules       []SpawnRule
}

// SpawnRule defines conditions and weighted encounter choices
type SpawnRule struct {
	RequiredTags   []string          // Beacon must have ALL these tags
	ForbiddenTags  []string          // Beacon must have NONE of these tags
	Encounters     []WeightedEncounter
	MaxConcurrent  int               // Max instances of encounters from this rule
	Cooldown       float64           // Seconds between spawns from this rule
	Prerequisites  []string          // Story flags required
}

// WeightedEncounter pairs an encounter ID with spawn probability
type WeightedEncounter struct {
	EncounterID string
	Weight      int  // Relative weight (higher = more likely)
}

// SpawnTableRegistry holds all spawn tables
var SpawnTableRegistry = map[string]SpawnTable{
	"campaign-1-standard": {
		ID:          "campaign-1-standard",
		DisplayName: "Campaign 1 Standard Encounters",
		Rules: []SpawnRule{
			{
				// Tier 1 beacons get basic minefields
				RequiredTags: []string{"tier-1"},
				Encounters: []WeightedEncounter{
					{EncounterID: "minefield-basic", Weight: 70},
					{EncounterID: "patrol-light", Weight: 30},
				},
				MaxConcurrent: 2,
				Cooldown:      30,
			},
			{
				// Tier 2 beacons get mixed encounters
				RequiredTags: []string{"tier-2"},
				Encounters: []WeightedEncounter{
					{EncounterID: "mixed-hazard", Weight: 60},
					{EncounterID: "patrol-light", Weight: 25},
					{EncounterID: "seeker-swarm", Weight: 15},
				},
				MaxConcurrent: 2,
				Cooldown:      45,
			},
			{
				// Tier 3 beacons get seekers (requires story flag)
				RequiredTags:  []string{"tier-3"},
				Prerequisites: []string{"encounter-1-briefed"},
				Encounters: []WeightedEncounter{
					{EncounterID: "seeker-swarm", Weight: 50},
					{EncounterID: "mixed-hazard", Weight: 50},
				},
				MaxConcurrent: 1,
				Cooldown:      60,
			},
			{
				// NE zone gets extra patrols
				RequiredTags:  []string{"zone-ne"},
				ForbiddenTags: []string{"tier-1"},  // Don't spawn on tier-1
				Encounters: []WeightedEncounter{
					{EncounterID: "patrol-light", Weight: 100},
				},
				MaxConcurrent: 1,
				Cooldown:      50,
			},
		},
	},
}

// GetSpawnTable retrieves a spawn table by ID
func GetSpawnTable(id string) (*SpawnTable, error) {
	table, ok := SpawnTableRegistry[id]
	if !ok {
		return nil, fmt.Errorf("spawn table not found: %s", id)
	}
	return &table, nil
}

// SelectEncounter chooses an encounter from spawn table based on beacon tags
func (table *SpawnTable) SelectEncounter(beacon *MissionBeacon, playerFlags map[string]bool, rng *rand.Rand) (string, error) {
	// Find matching rules
	matchingRules := []SpawnRule{}

	for _, rule := range table.Rules {
		// Check required tags
		hasAllRequired := true
		for _, reqTag := range rule.RequiredTags {
			if !beacon.Tags[reqTag] {
				hasAllRequired = false
				break
			}
		}

		if !hasAllRequired {
			continue
		}

		// Check forbidden tags
		hasAnyForbidden := false
		for _, forbTag := range rule.ForbiddenTags {
			if beacon.Tags[forbTag] {
				hasAnyForbidden = true
				break
			}
		}

		if hasAnyForbidden {
			continue
		}

		// Check prerequisites
		hasAllPrereqs := true
		for _, prereq := range rule.Prerequisites {
			if !playerFlags[prereq] {
				hasAllPrereqs = false
				break
			}
		}

		if !hasAllPrereqs {
			continue
		}

		matchingRules = append(matchingRules, rule)
	}

	if len(matchingRules) == 0 {
		return "", fmt.Errorf("no matching spawn rules for beacon tags: %v", beacon.Tags)
	}

	// Pick random rule
	rule := matchingRules[rng.Intn(len(matchingRules))]

	// Calculate total weight
	totalWeight := 0
	for _, enc := range rule.Encounters {
		totalWeight += enc.Weight
	}

	// Weighted random selection
	roll := rng.Intn(totalWeight)
	cumulative := 0

	for _, enc := range rule.Encounters {
		cumulative += enc.Weight
		if roll < cumulative {
			return enc.EncounterID, nil
		}
	}

	// Fallback (should never reach here)
	return rule.Encounters[0].EncounterID, nil
}
```

**Integration into BeaconDirector**:
```go
// In internal/game/beacons.go

type BeaconDirector struct {
	// ... existing fields ...

	// New fields for spawn table integration
	SpawnTableID      string
	ActiveEncounters  map[string]*ActiveEncounter  // encounterID -> instance
	EncounterCooldowns map[string]float64          // encounterID -> next spawn time
}

type ActiveEncounter struct {
	EncounterID string
	BeaconID    string
	Entities    []EntityID
	SpawnTime   float64
	Lifetime    float64
}

// In BeaconDirector.Tick()
func (d *BeaconDirector) Tick(r *Room) {
	// ... existing beacon logic ...

	// Check for encounter spawns
	d.checkEncounterSpawns(r)

	// Clean up expired encounters
	d.cleanupEncounters(r)
}

func (d *BeaconDirector) checkEncounterSpawns(r *Room) {
	spawnTable, err := GetSpawnTable(d.SpawnTableID)
	if err != nil {
		return
	}

	for _, player := range r.Players {
		// Check each beacon
		for _, beacon := range d.Layout.Beacons {
			// Skip if beacon not discovered
			if !d.PerPlayerState[player.ID].DiscoveredBeacons[beacon.ID] {
				continue
			}

			// Skip if encounter already active at this beacon
			hasActiveEncounter := false
			for _, enc := range d.ActiveEncounters {
				if enc.BeaconID == beacon.ID {
					hasActiveEncounter = true
					break
				}
			}

			if hasActiveEncounter {
				continue
			}

			// Check spawn chance (e.g., 5% per tick when near beacon)
			dist := math.Hypot(player.X-beacon.X, player.Y-beacon.Y)
			if dist > beacon.Radius*2 {
				continue  // Too far from beacon
			}

			// Roll for spawn
			if r.RNG.Float64() > 0.05 {
				continue
			}

			// Select encounter from spawn table
			encounterID, err := spawnTable.SelectEncounter(&beacon, player.StoryFlags, r.RNG)
			if err != nil {
				continue
			}

			// Check cooldown
			if cooldownUntil, exists := d.EncounterCooldowns[encounterID]; exists {
				if r.T < cooldownUntil {
					continue
				}
			}

			// Spawn encounter
			d.spawnEncounterAtBeacon(r, encounterID, &beacon)
		}
	}
}

func (d *BeaconDirector) spawnEncounterAtBeacon(r *Room, encounterID string, beacon *MissionBeacon) {
	template, err := GetEncounter(encounterID)
	if err != nil {
		return
	}

	// Spawn entities
	center := Vec2{X: beacon.X, Y: beacon.Y}
	entities := SpawnFromTemplate(r, template, center, beacon.Seed)

	// Track active encounter
	activeEnc := &ActiveEncounter{
		EncounterID: encounterID,
		BeaconID:    beacon.ID,
		Entities:    entities,
		SpawnTime:   r.T,
		Lifetime:    template.Lifetime,
	}

	d.ActiveEncounters[encounterID] = activeEnc

	// Set cooldown
	d.EncounterCooldowns[encounterID] = r.T + template.Cooldown

	log.Printf("Spawned encounter %s at beacon %s with %d entities", encounterID, beacon.ID, len(entities))
}

func (d *BeaconDirector) cleanupEncounters(r *Room) {
	for encID, enc := range d.ActiveEncounters {
		// Check if lifetime expired
		if r.T > enc.SpawnTime+enc.Lifetime {
			// Remove all entities
			for _, entID := range enc.Entities {
				r.World.RemoveEntity(entID)
			}
			delete(d.ActiveEncounters, encID)
			log.Printf("Cleaned up expired encounter %s", encID)
		}
	}
}
```

**Task Checklist**:
- [ ] Create `internal/game/spawn_tables.go` file
- [ ] Define `SpawnTable`, `SpawnRule`, `WeightedEncounter` structs
- [ ] Create `SpawnTableRegistry` map with `campaign-1-standard` table
- [ ] Implement `GetSpawnTable(id string)` function
- [ ] Implement `SelectEncounter()` method with tag matching and weighting
- [ ] Add `SpawnTableID`, `ActiveEncounters`, `EncounterCooldowns` to BeaconDirector
- [ ] Define `ActiveEncounter` struct
- [ ] Implement `checkEncounterSpawns()` in BeaconDirector
- [ ] Implement `spawnEncounterAtBeacon()` in BeaconDirector
- [ ] Implement `cleanupEncounters()` in BeaconDirector
- [ ] Integrate encounter spawn checks into BeaconDirector.Tick()
- [ ] Write unit tests for spawn table selection logic

**Acceptance Criteria**:
- Spawn table correctly matches rules based on beacon tags
- Weighted selection produces encounters according to weights
- Prerequisites block encounter selection when flags not set
- Forbidden tags prevent rule matching
- Cooldowns prevent rapid re-spawning
- Encounters clean up after lifetime expires
- Tests pass: `go test ./internal/game -run TestSpawnTables`

---

