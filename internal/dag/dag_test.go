package dag

import (
	"testing"
)

// TestGraphInit tests basic graph initialization and validation
func TestGraphInit(t *testing.T) {
	nodes := []*Node{
		{
			ID:        "node1",
			Kind:      NodeKindCraft,
			Label:     "Node 1",
			DurationS: 5.0,
			Requires:  []NodeID{},
		},
		{
			ID:        "node2",
			Kind:      NodeKindCraft,
			Label:     "Node 2",
			DurationS: 10.0,
			Requires:  []NodeID{"node1"},
		},
	}

	err := Init(nodes)
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	graph := GetGraph()
	if graph == nil {
		t.Fatal("GetGraph returned nil")
	}

	if len(graph.Nodes) != 2 {
		t.Errorf("Expected 2 nodes, got %d", len(graph.Nodes))
	}

	node2 := graph.GetNode("node2")
	if node2 == nil {
		t.Fatal("node2 not found")
	}
	if len(node2.Requires) != 1 || node2.Requires[0] != "node1" {
		t.Error("node2 should require node1")
	}
}

// TestGraphCycleDetection tests that cycles are detected
func TestGraphCycleDetection(t *testing.T) {
	nodes := []*Node{
		{
			ID:        "a",
			Kind:      NodeKindCraft,
			Label:     "A",
			DurationS: 1.0,
			Requires:  []NodeID{"b"},
		},
		{
			ID:        "b",
			Kind:      NodeKindCraft,
			Label:     "B",
			DurationS: 1.0,
			Requires:  []NodeID{"a"},
		},
	}

	err := Init(nodes)
	if err != ErrCycleDetected {
		t.Errorf("Expected ErrCycleDetected, got %v", err)
	}
}

// TestGraphMissingDependency tests that missing dependencies are detected
func TestGraphMissingDependency(t *testing.T) {
	nodes := []*Node{
		{
			ID:        "node1",
			Kind:      NodeKindCraft,
			Label:     "Node 1",
			DurationS: 5.0,
			Requires:  []NodeID{"nonexistent"},
		},
	}

	err := Init(nodes)
	if err == nil {
		t.Error("Expected error for missing dependency")
	}
}

// TestStateInitialization tests basic state operations
func TestStateInitialization(t *testing.T) {
	state := NewState()

	if state == nil {
		t.Fatal("NewState returned nil")
	}

	status := state.GetStatus("test_node")
	if status != StatusLocked {
		t.Errorf("Expected StatusLocked for uninitialized node, got %s", status)
	}

	state.SetStatus("test_node", StatusAvailable)
	status = state.GetStatus("test_node")
	if status != StatusAvailable {
		t.Errorf("Expected StatusAvailable after set, got %s", status)
	}
}

// TestEvaluatorAvailability tests that nodes become available when requirements are met
func TestEvaluatorAvailability(t *testing.T) {
	nodes := []*Node{
		{
			ID:        "root",
			Kind:      NodeKindCraft,
			Label:     "Root",
			DurationS: 1.0,
			Requires:  []NodeID{},
		},
		{
			ID:        "child",
			Kind:      NodeKindCraft,
			Label:     "Child",
			DurationS: 1.0,
			Requires:  []NodeID{"root"},
		},
	}

	if err := Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	graph := GetGraph()
	state := NewState()

	// Initially, root should be available, child should be locked
	result := Evaluator(graph, state, 0.0)

	if result.StatusUpdates["root"] != StatusAvailable {
		t.Error("Root should become available")
	}
	if result.StatusUpdates["child"] != "" {
		t.Error("Child should remain locked")
	}

	// Complete root
	ApplyEvalResult(state, result)
	state.SetStatus("root", StatusCompleted)

	// Now child should become available
	result = Evaluator(graph, state, 0.0)
	if result.StatusUpdates["child"] != StatusAvailable {
		t.Error("Child should become available after root is completed")
	}
}

// TestStartCommand tests starting a node
func TestStartCommand(t *testing.T) {
	nodes := []*Node{
		{
			ID:        "test",
			Kind:      NodeKindCraft,
			Label:     "Test Node",
			DurationS: 5.0,
			Requires:  []NodeID{},
		},
	}

	if err := Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	graph := GetGraph()
	state := NewState()
	effects := &NoOpEffects{}

	// Initially, node should be available
	state.SetStatus("test", StatusAvailable)

	// Start the node
	err := Start(graph, state, "test", 10.0, effects)
	if err != nil {
		t.Errorf("Start failed: %v", err)
	}

	// Check status
	if state.GetStatus("test") != StatusInProgress {
		t.Error("Node should be in progress after start")
	}

	// Check active job
	job := state.GetActiveJob("test")
	if job == nil {
		t.Fatal("Active job should exist")
	}
	if job.StartedAt != 10.0 {
		t.Errorf("Expected start time 10.0, got %f", job.StartedAt)
	}
	if job.ETA != 15.0 {
		t.Errorf("Expected ETA 15.0, got %f", job.ETA)
	}
}

// TestInstantCompletion tests nodes with zero duration
func TestInstantCompletion(t *testing.T) {
	nodes := []*Node{
		{
			ID:        "instant",
			Kind:      NodeKindStoryGate,
			Label:     "Instant Node",
			DurationS: 0.0,
			Requires:  []NodeID{},
		},
	}

	if err := Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	graph := GetGraph()
	state := NewState()
	effects := &NoOpEffects{}

	state.SetStatus("instant", StatusAvailable)

	err := Start(graph, state, "instant", 10.0, effects)
	if err != nil {
		t.Errorf("Start failed: %v", err)
	}

	// Should complete immediately
	if state.GetStatus("instant") != StatusCompleted {
		t.Error("Instant node should complete immediately")
	}
}

// TestTimerCompletion tests that timed nodes complete at the right time
func TestTimerCompletion(t *testing.T) {
	nodes := []*Node{
		{
			ID:        "timed",
			Kind:      NodeKindCraft,
			Label:     "Timed Node",
			DurationS: 5.0,
			Requires:  []NodeID{},
		},
	}

	if err := Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	graph := GetGraph()
	state := NewState()
	effects := &NoOpEffects{}

	state.SetStatus("timed", StatusAvailable)
	_ = Start(graph, state, "timed", 10.0, effects)

	// At time 14.5, should not be complete
	result := Evaluator(graph, state, 14.5)
	if len(result.DueCompletions) > 0 {
		t.Error("Node should not be due at 14.5")
	}

	// At time 15.0, should be complete
	result = Evaluator(graph, state, 15.0)
	if len(result.DueCompletions) != 1 || result.DueCompletions[0] != "timed" {
		t.Error("Node should be due at 15.0")
	}

	// At time 20.0, should definitely be complete
	result = Evaluator(graph, state, 20.0)
	if len(result.DueCompletions) != 1 || result.DueCompletions[0] != "timed" {
		t.Error("Node should be due at 20.0")
	}
}

// TestCompleteCommand tests manually completing a node
func TestCompleteCommand(t *testing.T) {
	nodes := []*Node{
		{
			ID:        "test",
			Kind:      NodeKindCraft,
			Label:     "Test Node",
			DurationS: 5.0,
			Requires:  []NodeID{},
		},
	}

	if err := Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	graph := GetGraph()
	state := NewState()
	effects := &NoOpEffects{}

	state.SetStatus("test", StatusAvailable)
	_ = Start(graph, state, "test", 10.0, effects)

	// Complete the node
	err := Complete(graph, state, "test", effects)
	if err != nil {
		t.Errorf("Complete failed: %v", err)
	}

	if state.GetStatus("test") != StatusCompleted {
		t.Error("Node should be completed")
	}

	if state.GetActiveJob("test") != nil {
		t.Error("Active job should be removed")
	}
}

// TestCancelCommand tests cancelling a node
func TestCancelCommand(t *testing.T) {
	nodes := []*Node{
		{
			ID:        "test",
			Kind:      NodeKindCraft,
			Label:     "Test Node",
			DurationS: 5.0,
			Requires:  []NodeID{},
		},
	}

	if err := Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	graph := GetGraph()
	state := NewState()
	effects := &NoOpEffects{}

	state.SetStatus("test", StatusAvailable)
	_ = Start(graph, state, "test", 10.0, effects)

	// Cancel the node
	err := Cancel(graph, state, "test", effects)
	if err != nil {
		t.Errorf("Cancel failed: %v", err)
	}

	if state.GetStatus("test") != StatusAvailable {
		t.Error("Node should return to available after cancel")
	}

	if state.GetActiveJob("test") != nil {
		t.Error("Active job should be removed after cancel")
	}
}

// TestRepeatableNode tests that repeatable nodes can be started again
func TestRepeatableNode(t *testing.T) {
	nodes := []*Node{
		{
			ID:         "repeatable",
			Kind:       NodeKindCraft,
			Label:      "Repeatable Node",
			DurationS:  1.0,
			Repeatable: true,
			Requires:   []NodeID{},
		},
	}

	if err := Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	graph := GetGraph()
	state := NewState()
	effects := &NoOpEffects{}

	// First completion
	state.SetStatus("repeatable", StatusAvailable)
	_ = Start(graph, state, "repeatable", 10.0, effects)
	_ = Complete(graph, state, "repeatable", effects)

	if state.GetStatus("repeatable") != StatusCompleted {
		t.Error("Node should be completed")
	}

	// Should be able to start again
	err := Start(graph, state, "repeatable", 20.0, effects)
	if err != nil {
		t.Errorf("Should be able to start repeatable node again: %v", err)
	}

	if state.GetStatus("repeatable") != StatusInProgress {
		t.Error("Repeatable node should be in progress again")
	}
}

// TestCanStart tests the CanStart helper function
func TestCanStart(t *testing.T) {
	nodes := []*Node{
		{
			ID:        "test",
			Kind:      NodeKindCraft,
			Label:     "Test Node",
			DurationS: 5.0,
			Requires:  []NodeID{},
		},
	}

	if err := Init(nodes); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	graph := GetGraph()
	state := NewState()

	// Locked node cannot start
	if CanStart(graph, state, "test") {
		t.Error("Locked node should not be startable")
	}

	// Available node can start
	state.SetStatus("test", StatusAvailable)
	if !CanStart(graph, state, "test") {
		t.Error("Available node should be startable")
	}

	// In-progress node cannot start
	state.SetStatus("test", StatusInProgress)
	if CanStart(graph, state, "test") {
		t.Error("In-progress node should not be startable")
	}
}

// TestRemainingTime tests the RemainingTime calculation
func TestRemainingTime(t *testing.T) {
	state := NewState()

	// No active job
	remaining := state.RemainingTime("test", 10.0)
	if remaining != 0 {
		t.Errorf("Expected 0 remaining time for inactive job, got %f", remaining)
	}

	// Active job with time remaining
	state.StartJob("test", 10.0, 5.0)
	remaining = state.RemainingTime("test", 12.0)
	if remaining != 3.0 {
		t.Errorf("Expected 3.0 remaining time, got %f", remaining)
	}

	// Job past ETA
	remaining = state.RemainingTime("test", 20.0)
	if remaining != 0 {
		t.Errorf("Expected 0 remaining time for expired job, got %f", remaining)
	}
}

// TestStateClone tests that state can be cloned correctly
func TestStateClone(t *testing.T) {
	state := NewState()
	state.SetStatus("node1", StatusAvailable)
	state.SetStatus("node2", StatusCompleted)
	state.StartJob("node3", 10.0, 5.0)

	clone := state.Clone()

	if clone.GetStatus("node1") != StatusAvailable {
		t.Error("Clone should preserve node1 status")
	}
	if clone.GetStatus("node2") != StatusCompleted {
		t.Error("Clone should preserve node2 status")
	}
	if clone.GetActiveJob("node3") == nil {
		t.Error("Clone should preserve active jobs")
	}

	// Verify deep copy
	clone.SetStatus("node1", StatusCompleted)
	if state.GetStatus("node1") != StatusAvailable {
		t.Error("Modifying clone should not affect original")
	}
}
