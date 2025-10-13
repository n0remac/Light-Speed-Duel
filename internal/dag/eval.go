package dag

// EvalResult contains the results of evaluating the DAG state.
type EvalResult struct {
	StatusUpdates  map[NodeID]Status // Nodes whose status changed
	DueCompletions []NodeID          // Nodes ready to be completed
}

// Evaluator evaluates the current state against the graph and time.
// It returns status updates (locked -> available transitions) and
// nodes that are due for completion.
//
// The evaluator is pure: it doesn't mutate state, only reports what should change.
func Evaluator(graph *Graph, state *State, now float64) *EvalResult {
	result := &EvalResult{
		StatusUpdates:  make(map[NodeID]Status),
		DueCompletions: []NodeID{},
	}

	// Pass 1: Check timer completions
	for nodeID, job := range state.ActiveJobs {
		if job.ETA <= now {
			result.DueCompletions = append(result.DueCompletions, nodeID)
		}
	}

	// Pass 2: Update availability based on requirements
	for nodeID, node := range graph.Nodes {
		currentStatus := state.GetStatus(nodeID)

		// Only check locked or completed (repeatable) nodes
		shouldCheck := currentStatus == StatusLocked ||
			(currentStatus == StatusCompleted && node.Repeatable)

		if !shouldCheck {
			continue
		}

		// Check if all requirements are met
		allRequirementsMet := true
		for _, reqID := range node.Requires {
			reqStatus := state.GetStatus(reqID)
			if reqStatus != StatusCompleted {
				allRequirementsMet = false
				break
			}
		}

		// Update status if requirements changed
		if allRequirementsMet && currentStatus != StatusAvailable {
			result.StatusUpdates[nodeID] = StatusAvailable
		} else if !allRequirementsMet && currentStatus == StatusAvailable {
			// This shouldn't happen in normal flow, but handle it for safety
			result.StatusUpdates[nodeID] = StatusLocked
		}
	}

	return result
}

// ApplyEvalResult applies an evaluation result to the state, mutating it.
// This is a convenience helper for the common case of immediately applying updates.
func ApplyEvalResult(state *State, result *EvalResult) {
	// Apply status updates
	for nodeID, newStatus := range result.StatusUpdates {
		state.SetStatus(nodeID, newStatus)
	}

	// Complete due jobs
	for _, nodeID := range result.DueCompletions {
		state.CompleteJob(nodeID)
	}
}
