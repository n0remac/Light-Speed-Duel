package game

import (
	"math/rand"
	"testing"
)

func TestSelectEncounterTier1(t *testing.T) {
	table, err := GetSpawnTable("campaign-1-standard")
	if err != nil {
		t.Fatalf("expected spawn table, got error: %v", err)
	}
	beacon := &BeaconLayout{
		ID:   "beacon-1",
		Tags: map[string]bool{"tier-1": true},
	}
	rng := rand.New(rand.NewSource(7))
	encounterID, ruleIdx, err := table.SelectEncounter(beacon, map[string]bool{}, rng)
	if err != nil {
		t.Fatalf("unexpected error selecting encounter: %v", err)
	}
	if encounterID != "minefield-basic" && encounterID != "patrol-light" {
		t.Fatalf("unexpected encounter id %s", encounterID)
	}
	if ruleIdx < 0 {
		t.Fatalf("expected valid rule index")
	}
}

func TestSelectEncounterPrerequisiteBlocks(t *testing.T) {
	table, err := GetSpawnTable("campaign-1-standard")
	if err != nil {
		t.Fatalf("expected spawn table, got error: %v", err)
	}
	beacon := &BeaconLayout{
		ID:   "beacon-3",
		Tags: map[string]bool{"tier-3": true},
	}
	_, _, err = table.SelectEncounter(beacon, map[string]bool{}, rand.New(rand.NewSource(3)))
	if err == nil {
		t.Fatalf("expected error when prerequisites missing")
	}

	flags := map[string]bool{"encounter-1-briefed": true}
	encounterID, _, err := table.SelectEncounter(beacon, flags, rand.New(rand.NewSource(3)))
	if err != nil {
		t.Fatalf("expected selection when prerequisites met: %v", err)
	}
	if encounterID != "seeker-swarm" && encounterID != "mixed-hazard" {
		t.Fatalf("unexpected encounter %s for tier-3 beacon", encounterID)
	}
}

func TestSelectEncounterForbiddenTags(t *testing.T) {
	table, err := GetSpawnTable("campaign-1-standard")
	if err != nil {
		t.Fatalf("expected spawn table, got error: %v", err)
	}
	beacon := &BeaconLayout{
		ID:   "beacon-ne",
		Tags: map[string]bool{"zone-ne": true, "tier-1": true},
	}
	zoneRuleIdx := -1
	for i, rule := range table.Rules {
		for _, tag := range rule.RequiredTags {
			if tag == "zone-ne" {
				zoneRuleIdx = i
				break
			}
		}
	}
	if zoneRuleIdx < 0 {
		t.Fatalf("expected zone rule in spawn table")
	}
	_, idx, err := table.SelectEncounter(beacon, nil, rand.New(rand.NewSource(11)))
	if err != nil {
		t.Fatalf("unexpected error selecting encounter: %v", err)
	}
	if idx == zoneRuleIdx {
		t.Fatalf("expected zone rule to be skipped due to forbidden tier-1 tag")
	}
}
