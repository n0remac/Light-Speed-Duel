package game

import (
	"fmt"
	"math/rand"
)

// SpawnTable maps beacon tags to weighted encounter selections.
type SpawnTable struct {
	ID          string
	DisplayName string
	Rules       []SpawnRule
}

// SpawnRule defines conditions and weighted encounter choices.
type SpawnRule struct {
	RequiredTags  []string
	ForbiddenTags []string
	Encounters    []WeightedEncounter
	MaxConcurrent int
	Cooldown      float64
	Prerequisites []string
}

// WeightedEncounter pairs an encounter ID with spawn probability weight.
type WeightedEncounter struct {
	EncounterID string
	Weight      int
}

// SpawnTableRegistry holds all spawn tables keyed by identifier.
var SpawnTableRegistry = map[string]SpawnTable{
	"campaign-1-standard": {
		ID:          "campaign-1-standard",
		DisplayName: "Campaign 1 Standard Encounters",
		Rules: []SpawnRule{
			{
				RequiredTags: []string{"tier-1"},
				Encounters: []WeightedEncounter{
					{EncounterID: "minefield-basic", Weight: 70},
					{EncounterID: "patrol-light", Weight: 30},
				},
				MaxConcurrent: 2,
				Cooldown:      30,
			},
			{
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
				RequiredTags:  []string{"zone-ne"},
				ForbiddenTags: []string{"tier-1"},
				Encounters: []WeightedEncounter{
					{EncounterID: "patrol-light", Weight: 100},
				},
				MaxConcurrent: 1,
				Cooldown:      50,
			},
		},
	},
}

// GetSpawnTable retrieves a spawn table by ID.
func GetSpawnTable(id string) (*SpawnTable, error) {
	if id == "" {
		return nil, fmt.Errorf("spawn table not found: empty id")
	}
	table, ok := SpawnTableRegistry[id]
	if !ok {
		return nil, fmt.Errorf("spawn table not found: %s", id)
	}
	return &table, nil
}

// SelectEncounter chooses an encounter from the spawn table based on beacon tags.
// Returns the encounter ID, matched rule index, or an error if no rule matches.
func (table *SpawnTable) SelectEncounter(beacon *BeaconLayout, playerFlags map[string]bool, rng *rand.Rand) (string, int, error) {
	if table == nil {
		return "", -1, fmt.Errorf("spawn table is nil")
	}
	if beacon == nil {
		return "", -1, fmt.Errorf("beacon is nil")
	}
	if rng == nil {
		rng = rand.New(rand.NewSource(0))
	}

	matching := make([]int, 0)
	for idx := range table.Rules {
		rule := &table.Rules[idx]
		if !beaconHasAllTags(beacon, rule.RequiredTags) {
			continue
		}
		if beaconHasAnyTag(beacon, rule.ForbiddenTags) {
			continue
		}
		if !playerHasPrerequisites(playerFlags, rule.Prerequisites) {
			continue
		}
		if len(rule.Encounters) == 0 {
			continue
		}
		matching = append(matching, idx)
	}

	if len(matching) == 0 {
		return "", -1, fmt.Errorf("no matching spawn rules for beacon tags: %v", beacon.Tags)
	}

	ruleIdx := matching[rng.Intn(len(matching))]
	rule := table.Rules[ruleIdx]

	totalWeight := 0
	for _, enc := range rule.Encounters {
		if enc.Weight > 0 {
			totalWeight += enc.Weight
		}
	}
	if totalWeight <= 0 {
		return "", -1, fmt.Errorf("spawn rule %d has no weighted encounters", ruleIdx)
	}

	roll := rng.Intn(totalWeight)
	cumulative := 0
	for _, enc := range rule.Encounters {
		if enc.Weight <= 0 {
			continue
		}
		cumulative += enc.Weight
		if roll < cumulative {
			return enc.EncounterID, ruleIdx, nil
		}
	}

	// Fallback: return first encounter (should never reach due to weight logic).
	return rule.Encounters[0].EncounterID, ruleIdx, nil
}

func beaconHasAllTags(beacon *BeaconLayout, tags []string) bool {
	if len(tags) == 0 {
		return true
	}
	for _, tag := range tags {
		if !beacon.Tags[tag] {
			return false
		}
	}
	return true
}

func beaconHasAnyTag(beacon *BeaconLayout, tags []string) bool {
	for _, tag := range tags {
		if beacon.Tags[tag] {
			return true
		}
	}
	return false
}

func playerHasPrerequisites(flags map[string]bool, required []string) bool {
	if len(required) == 0 {
		return true
	}
	for _, key := range required {
		if !flags[key] {
			return false
		}
	}
	return true
}
