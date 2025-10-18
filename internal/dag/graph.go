// Package dag implements a minimal deterministic DAG engine for progression,
// crafting, upgrades, and story gating.
//
// All transitions are pure with respect to (graph, player_state, now).
// The graph is server-authoritative and validated at boot time.
package dag

import (
	"errors"
	"fmt"
)

// NodeID uniquely identifies a node in the graph.
type NodeID string

// NodeKind categorizes the node type.
type NodeKind string

const (
	// NodeKindCraft represents a crafting node.
	NodeKindCraft NodeKind = "craft"
	// NodeKindUpgrade represents an upgrade node.
	NodeKindUpgrade NodeKind = "upgrade"
	// NodeKindStoryGate represents a story gate node.
	NodeKindStoryGate NodeKind = "story_gate"
	// NodeKindStory represents a narrative beat controlled by the server DAG.
	NodeKindStory NodeKind = "story"
)

// EffectType describes the type of effect an upgrade provides.
type EffectType int

const (
	EffectSpeedMultiplier EffectType = iota
	EffectMissileUnlock
	EffectHeatCapacity
	EffectHeatEfficiency
)

// UpgradeEffect describes what an upgrade does when completed.
type UpgradeEffect struct {
	Type  EffectType  `json:"type"`
	Value interface{} `json:"value"` // float64 for multipliers, string for unlocks
}

// Node represents a single node in the DAG.
type Node struct {
	ID         NodeID            `json:"id"`
	Kind       NodeKind          `json:"kind"`
	Label      string            `json:"label"`
	DurationS  float64           `json:"duration_s"` // Duration in seconds (0 = instant)
	Repeatable bool              `json:"repeatable"` // Can be repeated after completion
	Payload    map[string]string `json:"payload"`    // Arbitrary key-value data
	Requires   []NodeID          `json:"requires"`   // Dependencies (must be completed)
	Dialogue   *DialogueContent  `json:"dialogue,omitempty"` // Story nodes only - dialogue content to display
	Effects    []UpgradeEffect   `json:"effects,omitempty"`  // Upgrade nodes only - effects to apply when completed
}

// Graph represents the complete DAG.
type Graph struct {
	Nodes      map[NodeID]*Node    // All nodes indexed by ID
	RequiresIn map[NodeID][]NodeID // Reverse index: which nodes require this one
	TopoOrder  []NodeID            // Topologically sorted node IDs
}

var (
	// ErrCycleDetected is returned when a cycle is detected in the graph.
	ErrCycleDetected = errors.New("dag: cycle detected in graph")
	// ErrNodeNotFound is returned when a referenced node doesn't exist.
	ErrNodeNotFound = errors.New("dag: node not found")
	// ErrInvalidDuration is returned when a duration is negative.
	ErrInvalidDuration = errors.New("dag: negative duration")
)

// defaultGraph is the singleton graph instance.
var defaultGraph *Graph

// Init initializes the global graph with the provided nodes and validates it.
func Init(nodes []*Node) error {
	g := &Graph{
		Nodes:      make(map[NodeID]*Node),
		RequiresIn: make(map[NodeID][]NodeID),
	}

	// Index all nodes
	for _, node := range nodes {
		if node.DurationS < 0 {
			return fmt.Errorf("%w: node %s has duration %.2f", ErrInvalidDuration, node.ID, node.DurationS)
		}
		g.Nodes[node.ID] = node
	}

	// Build reverse index and validate dependencies
	for _, node := range nodes {
		for _, reqID := range node.Requires {
			if _, exists := g.Nodes[reqID]; !exists {
				return fmt.Errorf("%w: node %s requires missing node %s", ErrNodeNotFound, node.ID, reqID)
			}
			g.RequiresIn[reqID] = append(g.RequiresIn[reqID], node.ID)
		}
	}

	// Validate acyclic via topological sort
	order, err := g.topoSort()
	if err != nil {
		return err
	}
	g.TopoOrder = order

	defaultGraph = g
	return nil
}

// GetGraph returns the initialized global graph.
func GetGraph() *Graph {
	return defaultGraph
}

// GetNode returns a node by ID, or nil if not found.
func (g *Graph) GetNode(id NodeID) *Node {
	return g.Nodes[id]
}

// topoSort performs topological sorting using Kahn's algorithm to detect cycles.
func (g *Graph) topoSort() ([]NodeID, error) {
	// Count in-degrees
	inDegree := make(map[NodeID]int)
	for id := range g.Nodes {
		inDegree[id] = 0
	}
	for _, node := range g.Nodes {
		for range node.Requires {
			inDegree[node.ID]++
		}
	}

	// Queue nodes with no dependencies
	var queue []NodeID
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}

	var order []NodeID
	for len(queue) > 0 {
		// Dequeue
		curr := queue[0]
		queue = queue[1:]
		order = append(order, curr)

		// Reduce in-degree for dependents
		for _, depID := range g.RequiresIn[curr] {
			inDegree[depID]--
			if inDegree[depID] == 0 {
				queue = append(queue, depID)
			}
		}
	}

	// If not all nodes processed, there's a cycle
	if len(order) != len(g.Nodes) {
		return nil, ErrCycleDetected
	}

	return order, nil
}
