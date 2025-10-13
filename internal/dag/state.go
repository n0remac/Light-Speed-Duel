package dag

import (
	"encoding/json"
)

// Status represents the current state of a node for a player.
type Status string

const (
	// StatusLocked means the node's requirements are not met.
	StatusLocked Status = "locked"
	// StatusAvailable means the node can be started.
	StatusAvailable Status = "available"
	// StatusInProgress means the node is currently being executed.
	StatusInProgress Status = "in_progress"
	// StatusCompleted means the node has been finished.
	StatusCompleted Status = "completed"
)

// ActiveJob tracks a node that is currently in progress.
type ActiveJob struct {
	StartedAt float64 // When the job started (server time)
	ETA       float64 // When the job will complete (server time)
}

// State represents per-player DAG progression state.
type State struct {
	Status     map[NodeID]Status     `json:"status"`      // Current status of each node
	ActiveJobs map[NodeID]*ActiveJob `json:"active_jobs"` // Jobs currently in progress
}

// NewState creates a new empty state.
func NewState() *State {
	return &State{
		Status:     make(map[NodeID]Status),
		ActiveJobs: make(map[NodeID]*ActiveJob),
	}
}

// GetStatus returns the status of a node, defaulting to locked if not set.
func (s *State) GetStatus(id NodeID) Status {
	if status, exists := s.Status[id]; exists {
		return status
	}
	return StatusLocked
}

// SetStatus updates the status of a node.
func (s *State) SetStatus(id NodeID, status Status) {
	s.Status[id] = status
}

// GetActiveJob returns the active job for a node, or nil if not in progress.
func (s *State) GetActiveJob(id NodeID) *ActiveJob {
	return s.ActiveJobs[id]
}

// StartJob marks a node as in progress with the given start time and duration.
func (s *State) StartJob(id NodeID, startedAt float64, durationS float64) {
	s.Status[id] = StatusInProgress
	s.ActiveJobs[id] = &ActiveJob{
		StartedAt: startedAt,
		ETA:       startedAt + durationS,
	}
}

// CompleteJob marks a node as completed and removes it from active jobs.
func (s *State) CompleteJob(id NodeID) {
	s.Status[id] = StatusCompleted
	delete(s.ActiveJobs, id)
}

// CancelJob cancels an in-progress job, returning it to available status.
func (s *State) CancelJob(id NodeID) {
	s.Status[id] = StatusAvailable
	delete(s.ActiveJobs, id)
}

// Clone creates a deep copy of the state for serialization.
func (s *State) Clone() *State {
	clone := NewState()

	// Copy status map
	for id, status := range s.Status {
		clone.Status[id] = status
	}

	// Copy active jobs
	for id, job := range s.ActiveJobs {
		clone.ActiveJobs[id] = &ActiveJob{
			StartedAt: job.StartedAt,
			ETA:       job.ETA,
		}
	}

	return clone
}

// Snapshot creates a serializable snapshot of the current state.
// Returns a JSON-encoded byte slice.
func (s *State) Snapshot() ([]byte, error) {
	return json.Marshal(s)
}

// LoadSnapshot restores state from a JSON snapshot.
func LoadSnapshot(data []byte) (*State, error) {
	state := NewState()
	if err := json.Unmarshal(data, state); err != nil {
		return nil, err
	}
	return state, nil
}

// RemainingTime returns the remaining time in seconds for an active job.
// Returns 0 if the job is not active or already complete.
func (s *State) RemainingTime(id NodeID, now float64) float64 {
	job := s.GetActiveJob(id)
	if job == nil {
		return 0
	}
	remaining := job.ETA - now
	if remaining < 0 {
		return 0
	}
	return remaining
}
