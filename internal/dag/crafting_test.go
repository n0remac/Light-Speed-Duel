package dag

import (
	"testing"
)

// TestComputeCraftDuration tests the duration scaling based on heat capacity
func TestComputeCraftDuration(t *testing.T) {
	tests := []struct {
		name         string
		baseDuration float64
		heatCapacity float64
		expected     float64
	}{
		{
			name:         "baseline capacity",
			baseDuration: 60.0,
			heatCapacity: 100.0,
			expected:     60.0, // 60 * (100/100) = 60
		},
		{
			name:         "80% of baseline",
			baseDuration: 60.0,
			heatCapacity: 80.0,
			expected:     48.0, // 60 * (80/100) = 48
		},
		{
			name:         "150% of baseline",
			baseDuration: 60.0,
			heatCapacity: 150.0,
			expected:     90.0, // 60 * (150/100) = 90
		},
		{
			name:         "200% of baseline",
			baseDuration: 60.0,
			heatCapacity: 200.0,
			expected:     120.0, // 60 * (200/100) = 120
		},
		{
			name:         "different base duration",
			baseDuration: 75.0,
			heatCapacity: 120.0,
			expected:     90.0, // 75 * (120/100) = 90
		},
		{
			name:         "zero heat capacity falls back to base",
			baseDuration: 60.0,
			heatCapacity: 0.0,
			expected:     60.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ComputeCraftDuration(tt.baseDuration, tt.heatCapacity)
			if result != tt.expected {
				t.Errorf("ComputeCraftDuration(%f, %f) = %f, want %f",
					tt.baseDuration, tt.heatCapacity, result, tt.expected)
			}
		})
	}
}

// TestGetPayloadFloat tests payload float extraction
func TestGetPayloadFloat(t *testing.T) {
	payload := map[string]string{
		"heat_capacity": "150.5",
		"duration":      "60",
		"invalid":       "not-a-number",
	}

	// Valid key
	val, err := GetPayloadFloat(payload, "heat_capacity")
	if err != nil {
		t.Errorf("GetPayloadFloat should succeed for valid key: %v", err)
	}
	if val != 150.5 {
		t.Errorf("Expected 150.5, got %f", val)
	}

	// Missing key
	_, err = GetPayloadFloat(payload, "missing")
	if err == nil {
		t.Error("GetPayloadFloat should error for missing key")
	}

	// Invalid value
	_, err = GetPayloadFloat(payload, "invalid")
	if err == nil {
		t.Error("GetPayloadFloat should error for invalid float")
	}
}

// TestGetPayloadString tests payload string extraction
func TestGetPayloadString(t *testing.T) {
	payload := map[string]string{
		"variant_id": "basic",
		"item_type":  "missile",
	}

	// Valid key
	val, err := GetPayloadString(payload, "variant_id")
	if err != nil {
		t.Errorf("GetPayloadString should succeed for valid key: %v", err)
	}
	if val != "basic" {
		t.Errorf("Expected 'basic', got '%s'", val)
	}

	// Missing key
	_, err = GetPayloadString(payload, "missing")
	if err == nil {
		t.Error("GetPayloadString should error for missing key")
	}
}

// TestMissileCraftNodes tests the missile craft node definitions
func TestMissileCraftNodes(t *testing.T) {
	nodes := SeedMissileCraftNodes()

	if len(nodes) != 4 {
		t.Errorf("Expected 4 missile craft nodes, got %d", len(nodes))
	}

	// Test basic missile
	basic := nodes[0]
	if basic.ID != "craft.missile.basic" {
		t.Errorf("Expected first node to be basic missile, got %s", basic.ID)
	}
	if basic.Kind != NodeKindCraft {
		t.Error("Node should be craft kind")
	}
	if !basic.Repeatable {
		t.Error("Craft nodes should be repeatable")
	}

	heatCap, err := GetPayloadFloat(basic.Payload, "heat_capacity")
	if err != nil {
		t.Errorf("Basic missile should have heat_capacity: %v", err)
	}
	if heatCap != 80.0 {
		t.Errorf("Basic missile heat capacity should be 80, got %f", heatCap)
	}

	// Test dependencies
	highHeat := nodes[1]
	if len(highHeat.Requires) != 1 || highHeat.Requires[0] != "craft.missile.basic" {
		t.Error("High heat missile should require basic missile")
	}

	extended := nodes[3]
	if len(extended.Requires) != 1 || extended.Requires[0] != "craft.missile.long_range" {
		t.Error("Extended missile should require long range missile")
	}
}

// TestMissileCraftGraphValidation tests that the missile craft graph is valid
func TestMissileCraftGraphValidation(t *testing.T) {
	nodes := SeedMissileCraftNodes()
	err := Init(nodes)
	if err != nil {
		t.Errorf("Missile craft graph should be valid: %v", err)
	}

	graph := GetGraph()
	if graph == nil {
		t.Fatal("Graph should be initialized")
	}

	// Verify all nodes are present
	for _, node := range nodes {
		if graph.GetNode(node.ID) == nil {
			t.Errorf("Node %s not found in graph", node.ID)
		}
	}

	// Verify topological order is valid
	if len(graph.TopoOrder) != len(nodes) {
		t.Errorf("Topological order should have %d nodes, got %d", len(nodes), len(graph.TopoOrder))
	}
}

// TestCraftWithDurationScaling tests that craft nodes use scaled durations
func TestCraftWithDurationScaling(t *testing.T) {
	nodes := SeedMissileCraftNodes()
	if err := Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	graph := GetGraph()
	state := NewState()

	// Start basic missile craft (heat: 80, base: 60)
	// Expected duration: 60 * (80/100) = 48s
	state.SetStatus("craft.missile.basic", StatusAvailable)
	err := Start(graph, state, "craft.missile.basic", 100.0, &NoOpEffects{})
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	job := state.GetActiveJob("craft.missile.basic")
	if job == nil {
		t.Fatal("Job should be active")
	}

	expectedETA := 100.0 + 48.0 // start + scaled duration
	if job.ETA != expectedETA {
		t.Errorf("Expected ETA %f, got %f", expectedETA, job.ETA)
	}

	// Start high heat missile (heat: 150, base: 60)
	// First need to complete basic
	state.CompleteJob("craft.missile.basic")

	// Evaluate to make high_heat available
	result := Evaluator(graph, state, 150.0)
	ApplyEvalResult(state, result)

	// Expected duration: 60 * (150/100) = 90s
	err = Start(graph, state, "craft.missile.high_heat", 200.0, &NoOpEffects{})
	if err != nil {
		t.Fatalf("Start high heat failed: %v", err)
	}

	job = state.GetActiveJob("craft.missile.high_heat")
	if job == nil {
		t.Fatal("High heat job should be active")
	}

	expectedETA = 200.0 + 90.0
	if job.ETA != expectedETA {
		t.Errorf("Expected high heat ETA %f, got %f", expectedETA, job.ETA)
	}
}

// TestRepeatableCraft tests that craft nodes can be repeated
func TestRepeatableCraft(t *testing.T) {
	nodes := SeedMissileCraftNodes()
	if err := Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	graph := GetGraph()
	state := NewState()
	effects := &NoOpEffects{}

	// First craft
	state.SetStatus("craft.missile.basic", StatusAvailable)
	_ = Start(graph, state, "craft.missile.basic", 100.0, effects)
	_ = Complete(graph, state, "craft.missile.basic", effects)

	if state.GetStatus("craft.missile.basic") != StatusCompleted {
		t.Error("Craft should be completed")
	}

	// Second craft - should be allowed
	err := Start(graph, state, "craft.missile.basic", 200.0, effects)
	if err != nil {
		t.Errorf("Should be able to repeat craft: %v", err)
	}

	if state.GetStatus("craft.missile.basic") != StatusInProgress {
		t.Error("Repeated craft should be in progress")
	}
}
