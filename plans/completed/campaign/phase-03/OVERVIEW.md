# Phase 3 – Encounters, Spawn Tables & Beacon Sampling

## Vision (High-Level Context)

Build a Poisson-disc beacon sampler with tunable density so each session scatters beacons deterministically while still letting designers pin special locations. Implement encounter templates and spawn tables that attach to beacon metadata, delivering patrols, seekers, mines, and combined encounters without hardcoding behaviour.

**Foundation Status**: Phase 1 complete (beacon director, spawn functions). Phase 2 expected complete (mission templates, objectives). This phase focuses on procedural beacon placement and encounter variety.

---

## Foundation Specifications (Required Before Implementation)

**IMPORTANT**: These specifications must be complete and validated before beginning implementation tasks. They define sampling parameters, tag vocabularies, and metadata schemas.

### 0.1 Poisson-Disc Sampler Configuration Specification

**Goal**: Define exact sampling parameters, world bounds, density factors, and designer override format

**Sampler Parameters**:

```go
type SamplerConfig struct {
	MinDistance   float64            // Minimum distance between beacons (units)
	MaxAttempts   int                // Max placement attempts per beacon (default 30)
	WorldBounds   Rect               // Sampling area boundaries
	Seed          int64              // Deterministic seed derived from roomID + missionID
	DensityFactor float64            // Multiplier for MinDistance (0.5 = denser, 2.0 = sparser)
	DesignerPins  []BeaconPin        // Fixed designer-specified positions
	BiomeTaggers  []BiomeTagger      // Functions to assign tags based on position
}
```

**Standard Configuration Values**:

| Parameter | Campaign Value | Range | Notes |
|-----------|----------------|-------|-------|
| MinDistance | 2500 units | 1500-4000 | Determines beacon spacing |
| MaxAttempts | 30 | 20-50 | Higher = more complete fill, slower |
| DensityFactor | 1.0 | 0.5-2.0 | 1.0 = baseline, <1.0 = denser, >1.0 = sparser |
| WorldBounds | (0,0) to (10000,10000) | Mission-specific | Phase 1 uses 10000x10000 world |

**Effective MinDistance Calculation**:
```go
effectiveMinDistance := config.MinDistance * config.DensityFactor
```

**Seed Derivation**:
```go
func hashRoomAndMission(roomID string, missionID string) int64 {
	h := fnv.New64a()
	h.Write([]byte(roomID + "::" + missionID))
	return int64(h.Sum64())
}
```

**Designer Override Format** (`designer_beacons.json`):
```json
{
  "missionId": "campaign-1",
  "designerPins": [
    {
      "ordinal": 0,
      "x": 1500,
      "y": 1500,
      "radius": 420,
      "tags": {
        "start": true,
        "safe-zone": true
      },
      "reason": "Starting beacon - must be in safe zone"
    },
    {
      "ordinal": 3,
      "x": 8500,
      "y": 8500,
      "radius": 260,
      "tags": {
        "boss": true,
        "tier-3": true
      },
      "reason": "Final beacon - boss encounter"
    }
  ]
}
```

**Override Behavior**:
- Designer pins are placed **first**, before procedural generation
- Pin ordinals can be sparse (e.g., pin only beacon 0 and beacon 3, generate 1-2 procedurally)
- Pinned beacons still contribute to spatial grid (affect procedural placement)
- Pinned beacons override biome tags (designer tags take precedence)

**Sampling Algorithm Constraints**:
- Annulus sampling range: `[minDist, 2*minDist]` from active point
- Grid cell size: `minDist / sqrt(2)` for optimal neighbor queries
- 5x5 grid neighborhood check for collision detection
- Beacons clamped to world bounds with 5% margin: `[0.05*width, 0.95*width]`

**Expected Beacon Density** (for 10000x10000 world):

| MinDistance | Expected Count (no pins) | Notes |
|-------------|--------------------------|-------|
| 1500 | ~35-45 beacons | Dense, good for long campaigns |
| 2500 | ~15-20 beacons | Baseline, good for medium missions |
| 4000 | ~6-10 beacons | Sparse, good for short missions |

**Pre-Implementation Checklist**:
- [ ] MinDistance value chosen for campaign-1 (recommend 2500)
- [ ] DensityFactor multiplier defined (default 1.0)
- [ ] WorldBounds match existing Phase 1 world size
- [ ] Seed derivation function specified with FNV hash
- [ ] Designer pin format validated with JSON schema
- [ ] Expected beacon count matches mission requirements (campaign-1 = 4 beacons)
- [ ] Grid cell size calculation documented
- [ ] Boundary clamping rules specified

---

### 0.2 Encounter Tag Taxonomy & Metadata Schema

**Goal**: Define the complete tag vocabulary for beacons and encounters, and how tags drive spawn table matching

**Beacon Tag Categories**:

**1. Tier Tags** (difficulty/progression):
- `tier-1`: Safe zone, basic enemies, tutorial-friendly
- `tier-2`: Mid-game zone, mixed encounters, moderate difficulty
- `tier-3`: End-game zone, advanced enemies, high difficulty

**2. Zone Tags** (spatial quadrants):
- `zone-ne`: Northeast quadrant (x > centerX, y > centerY)
- `zone-nw`: Northwest quadrant (x < centerX, y > centerY)
- `zone-se`: Southeast quadrant (x > centerX, y < centerY)
- `zone-sw`: Southwest quadrant (x < centerX, y < centerY)

**3. Special Tags** (designer-assigned):
- `start`: Starting beacon (safe, no encounters)
- `boss`: Boss encounter beacon
- `checkpoint`: Safe zone, mission save point
- `hazard`: Environmental hazard zone (extra mines)
- `patrol-route`: Patrol spawn preferred
- `safe-zone`: No hostile spawns

**Tier Assignment Rules** (QuadrantTagger):
```go
distFromCenter := math.Hypot(x-centerX, y-centerY)
maxDist := math.Hypot(centerX, centerY)

if distFromCenter < maxDist*0.3 {
	tags["tier-1"] = true  // Inner 30% radius
} else if distFromCenter < maxDist*0.6 {
	tags["tier-2"] = true  // Middle 30% annulus
} else {
	tags["tier-3"] = true  // Outer 40% annulus
}
```

**Encounter Tag Categories**:

**1. Encounter Type Tags**:
- `minefield`: Static mine obstacles
- `patrol`: Moving patrollers with waypoints
- `seeker`: Homing seekers that pursue players
- `mixed`: Combination encounters

**2. Difficulty Tags**:
- `tier-1`: Safe for early game
- `tier-2`: Mid-game challenge
- `tier-3`: End-game difficulty

**3. Behavior Tags**:
- `static`: Entities don't move (mines)
- `mobile`: Entities move (patrols, seekers)
- `hazard`: Environmental threat
- `hostile`: Actively attacks player

**Encounter Template Tag Examples**:
```go
EncounterRegistry = map[string]EncounterTemplate{
	"minefield-basic": {
		Tags: map[string]bool{
			"tier-1":    true,
			"minefield": true,
			"hazard":    true,
			"static":    true,
		},
		// ...
	},
	"patrol-light": {
		Tags: map[string]bool{
			"tier-1":  true,
			"patrol":  true,
			"mobile":  true,
			"hostile": true,
		},
		// ...
	},
	"seeker-swarm": {
		Tags: map[string]bool{
			"tier-2": true,
			"seeker": true,
			"mobile": true,
			"hostile": true,
		},
		// ...
	},
}
```

**Spawn Table Matching Rules**:

**Rule Priority** (highest to lowest):
1. **RequiredTags**: Beacon must have ALL listed tags
2. **ForbiddenTags**: Beacon must have NONE of listed tags
3. **Prerequisites**: Player must have ALL listed story flags
4. **Weighted Selection**: From matching rules, select encounter by weight

**Example Spawn Rule**:
```go
{
	RequiredTags:  []string{"tier-2", "zone-ne"},  // Must be tier-2 AND zone-ne
	ForbiddenTags: []string{"safe-zone", "start"}, // Can't be safe-zone OR start
	Prerequisites: []string{"encounter-1-briefed"}, // Player must have flag
	Encounters: []WeightedEncounter{
		{EncounterID: "patrol-light", Weight: 70},    // 70% chance
		{EncounterID: "seeker-swarm", Weight: 30},    // 30% chance
	},
}
```

**Tag Inheritance**:
- Designer pins: Tags specified in `designerPins[].tags` override biome tags
- Procedural beacons: Tags assigned by `BiomeTaggers` (tier + zone)
- Encounter spawns: No tag inheritance - encounters use their own template tags

**Metadata Schema for Active Encounters**:

```go
type ActiveEncounter struct {
	EncounterID string              // Template ID
	BeaconID    string              // Which beacon spawned this
	Entities    []EntityID          // Spawned entity IDs
	SpawnTime   float64             // Game time when spawned
	Lifetime    float64             // Max lifetime before cleanup
	Tags        map[string]bool     // Copied from template
}
```

**BeaconDirector Metadata Storage**:
```go
type BeaconDirector struct {
	// ... existing fields ...

	SpawnTableID       string                          // Which spawn table to use
	ActiveEncounters   map[string]*ActiveEncounter     // encounterID -> instance
	EncounterCooldowns map[string]float64              // encounterID -> next spawn time
	BiomeMetadata      map[string]BeaconBiomeMetadata  // beaconID -> metadata
}

type BeaconBiomeMetadata struct {
	Tier         int       // 1, 2, or 3
	Zone         string    // "ne", "nw", "se", "sw"
	DistFromCenter float64 // Distance from world center
	IsPinned     bool      // Designer-specified
}
```

**Debug Logging Format**:
```
[BeaconSampler] Generated beacon beacon-0 at (1520, 1480) with tags: tier-1, zone-sw, start
[BeaconSampler] Generated beacon beacon-1 at (4123, 2567) with tags: tier-1, zone-ne
[SpawnTable] Evaluating beacon-1 (tier-1, zone-ne) against spawn table campaign-1-standard
[SpawnTable]   Rule 0 matched: RequiredTags=[tier-1] → Selected minefield-basic (weight=70)
[SpawnDirector] Spawned encounter minefield-basic at beacon-1 with 22 entities
```

**Pre-Implementation Checklist**:
- [ ] All beacon tag categories documented (tier, zone, special)
- [ ] Tier assignment thresholds specified (30%, 60%, 100%)
- [ ] Zone assignment logic documented (quadrant calculation)
- [ ] All encounter template tags defined with examples
- [ ] Spawn rule matching priority order specified
- [ ] Tag inheritance rules documented (pins override biome)
- [ ] ActiveEncounter metadata schema defined
- [ ] BeaconBiomeMetadata structure specified
- [ ] Debug logging format standardized

---

