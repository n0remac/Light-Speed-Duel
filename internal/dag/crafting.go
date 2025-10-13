package dag

import (
	"fmt"
	"strconv"
)

// Baseline heat capacity for duration calculation (100 units)
const BaselineHeatCapacity = 100.0

// ComputeCraftDuration calculates the effective duration for a craft node
// based on heat capacity using linear scaling.
// Formula: effective_duration = base_duration * (heat_capacity / baseline)
func ComputeCraftDuration(baseDuration, heatCapacity float64) float64 {
	if heatCapacity <= 0 {
		return baseDuration
	}
	return baseDuration * (heatCapacity / BaselineHeatCapacity)
}

// GetPayloadFloat extracts a float64 from a node's payload map.
func GetPayloadFloat(payload map[string]string, key string) (float64, error) {
	val, exists := payload[key]
	if !exists {
		return 0, fmt.Errorf("payload missing key: %s", key)
	}
	f, err := strconv.ParseFloat(val, 64)
	if err != nil {
		return 0, fmt.Errorf("payload key %s is not a valid float: %v", key, err)
	}
	return f, nil
}

// GetPayloadString extracts a string from a node's payload map.
func GetPayloadString(payload map[string]string, key string) (string, error) {
	val, exists := payload[key]
	if !exists {
		return "", fmt.Errorf("payload missing key: %s", key)
	}
	return val, nil
}

// SeedMissileCraftNodes creates the missile crafting progression graph.
func SeedMissileCraftNodes() []*Node {
	return []*Node{
		{
			ID:         "craft.missile.basic",
			Kind:       NodeKindCraft,
			Label:      "Craft Basic Missile",
			DurationS:  60.0, // Base duration
			Repeatable: true,
			Payload: map[string]string{
				"item_type":        "missile",
				"variant_id":       "basic",
				"heat_capacity":    "80",
				"base_duration_s":  "60",
				"desc":             "Standard missile with moderate heat capacity",
			},
			Requires: []NodeID{},
		},
		{
			ID:         "craft.missile.high_heat",
			Kind:       NodeKindCraft,
			Label:      "Craft High-Heat Missile",
			DurationS:  60.0, // Base duration
			Repeatable: true,
			Payload: map[string]string{
				"item_type":        "missile",
				"variant_id":       "high_heat",
				"heat_capacity":    "150",
				"base_duration_s":  "60",
				"desc":             "Enhanced missile with high heat capacity for extended use",
			},
			Requires: []NodeID{"craft.missile.basic"},
		},
		{
			ID:         "craft.missile.long_range",
			Kind:       NodeKindCraft,
			Label:      "Craft Long-Range Missile",
			DurationS:  75.0, // Base duration
			Repeatable: true,
			Payload: map[string]string{
				"item_type":        "missile",
				"variant_id":       "long_range",
				"heat_capacity":    "120",
				"base_duration_s":  "75",
				"desc":             "Extended range missile with good heat capacity",
			},
			Requires: []NodeID{"craft.missile.basic"},
		},
		{
			ID:         "craft.missile.extended",
			Kind:       NodeKindCraft,
			Label:      "Craft Extended Missile",
			DurationS:  90.0, // Base duration
			Repeatable: true,
			Payload: map[string]string{
				"item_type":        "missile",
				"variant_id":       "extended",
				"heat_capacity":    "200",
				"base_duration_s":  "90",
				"desc":             "Premium missile with maximum heat capacity",
			},
			Requires: []NodeID{"craft.missile.long_range"},
		},
	}
}
