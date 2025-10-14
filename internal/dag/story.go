package dag

// SeedStoryNodes defines the campaign story beats that run through the DAG system.
func SeedStoryNodes() []*Node {
	return []*Node{
		{
			ID:         "story.signal-static-1.start",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Arrival",
			DurationS:  5,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "start",
				"flag":    "story.signal-static-1.start",
			},
			Requires: []NodeID{},
		},
		{
			ID:         "story.signal-static-1.beacon-1",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Beacon 1",
			DurationS:  5,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "beacon-1",
				"flag":    "story.signal-static-1.beacon-1",
			},
			Requires: []NodeID{"story.signal-static-1.start"},
		},
		{
			ID:         "story.signal-static-1.beacon-2",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Beacon 2",
			DurationS:  0,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "beacon-2",
				"flag":    "story.signal-static-1.beacon-2",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-1"},
		},
		{
			ID:         "story.signal-static-1.beacon-3",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Beacon 3",
			DurationS:  0,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "beacon-3",
				"flag":    "story.signal-static-1.beacon-3",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-2"},
		},
		{
			ID:         "story.signal-static-1.complete",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Completion",
			DurationS:  0,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "complete",
				"flag":    "story.signal-static-1.complete",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-3"},
		},
	}
}
