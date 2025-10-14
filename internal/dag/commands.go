package dag

import (
	"errors"
	"fmt"
)

var (
	// ErrNodeNotAvailable is returned when trying to start a node that isn't available.
	ErrNodeNotAvailable = errors.New("dag: node not available")
	// ErrNodeNotInProgress is returned when trying to complete/cancel a node that isn't in progress.
	ErrNodeNotInProgress = errors.New("dag: node not in progress")
	// ErrAlreadyInProgress is returned when trying to start a node already in progress.
	ErrAlreadyInProgress = errors.New("dag: node already in progress")
)

// Effects is an interface for side effects triggered by DAG events.
// Consumers can implement this to handle crafting, upgrades, unlocks, etc.
type Effects interface {
	// OnStart is called when a node starts.
	OnStart(nodeID NodeID, node *Node)
	// OnComplete is called when a node completes.
	OnComplete(nodeID NodeID, node *Node)
	// OnCancel is called when a node is cancelled.
	OnCancel(nodeID NodeID, node *Node)
}

// NoOpEffects is a default implementation that does nothing.
type NoOpEffects struct{}

func (e *NoOpEffects) OnStart(nodeID NodeID, node *Node)    {}
func (e *NoOpEffects) OnComplete(nodeID NodeID, node *Node) {}
func (e *NoOpEffects) OnCancel(nodeID NodeID, node *Node)   {}

// Start begins execution of a node.
// It validates that the node is available and not already in progress.
// If duration is 0, the node completes immediately.
// For craft nodes, the duration is scaled based on heat_capacity in the payload.
func Start(graph *Graph, state *State, nodeID NodeID, now float64, effects Effects) error {
	node := graph.GetNode(nodeID)
	if node == nil {
		return fmt.Errorf("%w: %s", ErrNodeNotFound, nodeID)
	}

	status := state.GetStatus(nodeID)

	// Allow repeatable nodes to be started again
	if status == StatusCompleted && node.Repeatable {
		// Reset to available so it can be started
		state.SetStatus(nodeID, StatusAvailable)
		status = StatusAvailable
	}

	// Validate status
	if status != StatusAvailable {
		if status == StatusInProgress {
			return fmt.Errorf("%w: %s", ErrAlreadyInProgress, nodeID)
		}
		return fmt.Errorf("%w: %s (status: %s)", ErrNodeNotAvailable, nodeID, status)
	}

	// Compute effective duration
	effectiveDuration := node.DurationS

	// For craft nodes with heat_capacity, scale the duration
	if node.Kind == NodeKindCraft {
		if heatCapacity, err := GetPayloadFloat(node.Payload, "heat_capacity"); err == nil {
			if baseDuration, err := GetPayloadFloat(node.Payload, "base_duration_s"); err == nil {
				effectiveDuration = ComputeCraftDuration(baseDuration, heatCapacity)
			}
		}
	}
	
	// Start the job
	if effectiveDuration == 0 {
		// Instant completion - call OnStart first to ensure proper state initialization
		effects.OnStart(nodeID, node)
		state.SetStatus(nodeID, StatusCompleted)
		effects.OnComplete(nodeID, node)
	} else {
		// Timed job
		state.StartJob(nodeID, now, effectiveDuration)
		effects.OnStart(nodeID, node)
	}

	return nil
}

// Complete manually completes a node that is in progress.
// This is typically called by the evaluator when a job's ETA is reached.
func Complete(graph *Graph, state *State, nodeID NodeID, effects Effects) error {
	node := graph.GetNode(nodeID)
	if node == nil {
		return fmt.Errorf("%w: %s", ErrNodeNotFound, nodeID)
	}

	status := state.GetStatus(nodeID)
	if status != StatusInProgress {
		// Idempotent: if already completed, don't error
		if status == StatusCompleted {
			return nil
		}
		return fmt.Errorf("%w: %s (status: %s)", ErrNodeNotInProgress, nodeID, status)
	}

	state.CompleteJob(nodeID)
	effects.OnComplete(nodeID, node)

	return nil
}

// Cancel cancels a node that is in progress, returning it to available status.
// If nodeID is empty, all active jobs are cancelled.
func Cancel(graph *Graph, state *State, nodeID NodeID, effects Effects) error {
	// Cancel all if no specific node given
	if nodeID == "" {
		for id := range state.ActiveJobs {
			node := graph.GetNode(id)
			if node != nil {
				state.CancelJob(id)
				effects.OnCancel(id, node)
			}
		}
		return nil
	}

	// Cancel specific node
	node := graph.GetNode(nodeID)
	if node == nil {
		return fmt.Errorf("%w: %s", ErrNodeNotFound, nodeID)
	}

	status := state.GetStatus(nodeID)
	if status != StatusInProgress {
		// Idempotent: if not in progress, succeed silently
		return nil
	}

	state.CancelJob(nodeID)
	effects.OnCancel(nodeID, node)

	return nil
}

// CanStart returns true if a node can be started in the current state.
func CanStart(graph *Graph, state *State, nodeID NodeID) bool {
	node := graph.GetNode(nodeID)
	if node == nil {
		return false
	}

	status := state.GetStatus(nodeID)

	// Allow repeatable completed nodes
	if status == StatusCompleted && node.Repeatable {
		return true
	}

	return status == StatusAvailable
}
