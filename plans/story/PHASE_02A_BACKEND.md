# Phase 2A: Backend Dialogue Structures

**Focus**: Go data modeling and population
**Estimated Time**: 2-3 hours
**Depends On**: Phase 1 complete
**Blocks**: Phase 2B, Phase 2C

## Objective

Create Go structs to represent dialogue content and populate story nodes with full dialogue data.

## Implementation Steps

### Step 2A.1: Create Dialogue Structs

**File**: `internal/dag/dialogue.go` (NEW)

Create a new file with dialogue data structures:

```go
package dag

// DialogueChoice represents a player response option in a story node.
// Each choice has an ID (sent back to server) and display text.
type DialogueChoice struct {
	ID   string  // Unique identifier, e.g. "investigate", "cautious"
	Text string  // Display text shown to player
}

// TutorialTip provides gameplay hints alongside dialogue.
// Tips appear in a separate overlay panel next to the main dialogue.
type TutorialTip struct {
	Title string  // Brief title, e.g. "Route Plotting"
	Text  string  // Helpful explanation of game mechanics
}

// DialogueContent contains all presentation data for a story node.
// This data is sent to the client when the node activates.
type DialogueContent struct {
	Speaker       string             // Name displayed above dialogue, e.g. "UNKNOWN SIGNAL"
	Text          string             // Main dialogue text (supports \n newlines)
	Intent        string             // Visual theme: "factory" (blue) or "unit" (pink)
	ContinueLabel string             // Custom label for continue button (empty = "Continue")
	Choices       []DialogueChoice   // Player response options (empty = show continue button)
	TutorialTip   *TutorialTip       // Optional gameplay hint (nil = no tip)
}
```

### Step 2A.2: Add Dialogue Field to Node

**File**: `internal/dag/graph.go`

**Modify the `Node` struct** (around line 15):

**Before**:
```go
type Node struct {
	ID         NodeID
	Kind       NodeKind
	Label      string
	DurationS  float64
	Repeatable bool
	Payload    map[string]string
	Requires   []NodeID
}
```

**After**:
```go
type Node struct {
	ID         NodeID
	Kind       NodeKind
	Label      string
	DurationS  float64
	Repeatable bool
	Payload    map[string]string
	Requires   []NodeID
	Dialogue   *DialogueContent  // Story nodes only - dialogue content to display
}
```

### Step 2A.3: Populate Story Nodes with Dialogue

**File**: `internal/dag/story.go`

**Replace the existing `SeedStoryNodes()` function** with full dialogue content:

```go
package dag

// SeedStoryNodes defines the campaign story beats that run through the DAG system.
func SeedStoryNodes() []*Node {
	return []*Node{
		// Mission 1, Beat 1: Opening - garbled distress signal
		{
			ID:         "story.signal-static-1.start",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Arrival",
			DurationS:  999999,  // Wait for player acknowledgement
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "start",
				"flag":    "story.signal-static-1.start",
			},
			Requires: []NodeID{},
			Dialogue: &DialogueContent{
				Speaker: "UNKNOWN SIGNAL",
				Text: `–gnal… —issus… co–dinates…

[A weak signal crackles through the void. The transmission is nearly unintelligible, but coordinates emerge from the static. Something—or someone—needs help.]`,
				Intent: "factory",
				Choices: []DialogueChoice{
					{ID: "investigate", Text: "Investigate the signal"},
					{ID: "cautious", Text: "Approach with extreme caution"},
					{ID: "ignore", Text: "Log coordinates and continue patrol"},
				},
				TutorialTip: &TutorialTip{
					Title: "Route Plotting",
					Text:  "Click on the map to plot waypoints for your ship. Right-click waypoints to adjust speed. Your route determines your heat buildup.",
				},
			},
		},

		// Mission 1, Beat 2: Beacon 1 - signal improving
		{
			ID:         "story.signal-static-1.beacon-1",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Beacon 1",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "beacon-1",
				"flag":    "story.signal-static-1.beacon-1",
			},
			Requires: []NodeID{"story.signal-static-1.start"},
			Dialogue: &DialogueContent{
				Speaker:       "DISTRESS BEACON",
				Text: `Signal improving… triangulating source… maintain low thrust.

[The first beacon lock stabilizes the transmission. The signal is getting clearer, but you'll need to reach more beacons to pinpoint the origin.]`,
				Intent:        "factory",
				ContinueLabel: "Continue",
				Choices:       nil,  // No choices - just continue button
				TutorialTip: &TutorialTip{
					Title: "Heat Management",
					Text:  "Watch your heat gauge. Flying too fast heats your ship. If you overheat, you'll stall. Match your speed to the marker line for optimal efficiency.",
				},
			},
		},

		// Mission 1, Beat 3: Beacon 2 - possible survivors
		{
			ID:         "story.signal-static-1.beacon-2",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Beacon 2",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "beacon-2",
				"flag":    "story.signal-static-1.beacon-2",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-1"},
			Dialogue: &DialogueContent{
				Speaker: "DISTRESS BEACON",
				Text: `Possible survivors detected… uplink unstable… watch for debris.

[The second beacon reveals faint life signs. Something survived out here. The transmission warns of hazards ahead—proceed with caution.]`,
				Intent:        "factory",
				ContinueLabel: "Proceed Carefully",
				Choices:       nil,
				TutorialTip: &TutorialTip{
					Title: "Evasive Routing",
					Text:  "Plot routes that avoid obstacles and give you reaction time. Light-time delay means you see missiles where they were, not where they are. Plan ahead.",
				},
			},
		},

		// Mission 1, Beat 4: Beacon 3 - seeker signatures detected
		{
			ID:         "story.signal-static-1.beacon-3",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Beacon 3",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "beacon-3",
				"flag":    "story.signal-static-1.beacon-3",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-2"},
			Dialogue: &DialogueContent{
				Speaker: "DISTRESS BEACON",
				Text: `Beacon lock acquired… seeker signatures detected nearby… extreme caution advised.

[The third beacon triangulates the distress source, but passive sensors detect automated defense systems. Whatever's out there, it's heavily guarded.]`,
				Intent:        "factory",
				ContinueLabel: "Approach Final Beacon",
				Choices:       nil,
				TutorialTip: &TutorialTip{
					Title: "Combat Awareness",
					Text:  "Hostile seekers patrol this sector. Keep your speed low to avoid detection. High-speed runs generate heat signatures that draw attention.",
				},
			},
		},

		// Mission 1, Beat 5: Completion - archives unlocked
		{
			ID:         "story.signal-static-1.complete",
			Kind:       NodeKindStory,
			Label:      "Signal In The Static – Completion",
			DurationS:  999999,
			Repeatable: false,
			Payload: map[string]string{
				"chapter": "signal-static-1",
				"node":    "complete",
				"flag":    "story.signal-static-1.complete",
			},
			Requires: []NodeID{"story.signal-static-1.beacon-3"},
			Dialogue: &DialogueContent{
				Speaker: "UNIT-0 ARCHIVES",
				Text: `Unit-0, you found us.

Archives unlocked. Emergency protocols bypassed. Uploading next mission parameters to your nav system.

[The distress signal resolves into a data stream. Ancient archives flicker to life, revealing coordinates for your next objective.]`,
				Intent:        "unit",
				ContinueLabel: "Mission Complete",
				Choices:       nil,
				TutorialTip:   nil,  // No tip on final node
			},
		},
	}
}
```

### Step 2A.4: Build and Test

```bash
# Build Go code
go build -o LightSpeedDuel

# Expected output: No errors
# If you see errors, check:
# - Syntax in dialogue strings (backticks for multiline)
# - Struct field names (capitalized)
# - Node struct has Dialogue field
```

## Testing Phase 2A

### Test Checklist

- [ ] **Code compiles without errors**
  ```bash
  go build -o LightSpeedDuel
  ```

- [ ] **DAG initializes correctly**
  - Run server: `./LightSpeedDuel -addr :8080`
  - Check server logs for: "DAG system initialized with X nodes"
  - Should see no panic/crash

- [ ] **Can access dialogue fields**
  - Add temporary test code if needed:
  ```go
  // In app.go after dag.Init()
  graph := dag.GetGraph()
  node := graph.GetNode("story.signal-static-1.start")
  if node != nil && node.Dialogue != nil {
      log.Printf("Test: Node has dialogue, speaker=%s", node.Dialogue.Speaker)
  }
  ```

- [ ] **All nodes have dialogue**
  - Verify all 5 nodes populated
  - Check nil pointers: `node.Dialogue != nil`
  - Check choices: `len(node.Dialogue.Choices)`

### Expected Output

Server should start successfully and log:
```
DAG system initialized with X nodes (Y craft, 5 story)
```

No errors, no panics, no nil pointer dereferences.

### Common Issues

**Problem**: Compilation error "undefined: DialogueContent"
- **Solution**: Make sure `dialogue.go` is in `internal/dag/` package

**Problem**: Compilation error "unknown field 'Dialogue' in struct literal"
- **Solution**: Add `Dialogue *DialogueContent` to `Node` struct in `graph.go`

**Problem**: Server panics with "invalid memory address"
- **Solution**: Check for nil pointers - use `node.Dialogue != nil` before accessing

**Problem**: Multiline strings causing syntax errors
- **Solution**: Use backticks for multiline: `` `text...` ``

## Verification Script

Optional: Add this temporary test to `internal/dag/story_test.go`:

```go
package dag

import (
	"testing"
)

func TestStoryNodesHaveDialogue(t *testing.T) {
	nodes := SeedStoryNodes()

	if len(nodes) != 5 {
		t.Errorf("Expected 5 story nodes, got %d", len(nodes))
	}

	for _, node := range nodes {
		if node.Dialogue == nil {
			t.Errorf("Node %s has nil dialogue", node.ID)
			continue
		}

		if node.Dialogue.Speaker == "" {
			t.Errorf("Node %s has empty speaker", node.ID)
		}

		if node.Dialogue.Text == "" {
			t.Errorf("Node %s has empty text", node.ID)
		}

		if node.Dialogue.Intent != "factory" && node.Dialogue.Intent != "unit" {
			t.Errorf("Node %s has invalid intent: %s", node.ID, node.Dialogue.Intent)
		}

		t.Logf("Node %s: speaker=%s, text_len=%d, choices=%d",
			node.ID, node.Dialogue.Speaker, len(node.Dialogue.Text), len(node.Dialogue.Choices))
	}
}

func TestDialogueChoicesValid(t *testing.T) {
	nodes := SeedStoryNodes()

	for _, node := range nodes {
		if node.Dialogue == nil {
			continue
		}

		for i, choice := range node.Dialogue.Choices {
			if choice.ID == "" {
				t.Errorf("Node %s choice %d has empty ID", node.ID, i)
			}
			if choice.Text == "" {
				t.Errorf("Node %s choice %d has empty text", node.ID, i)
			}
		}
	}
}
```

Run test:
```bash
go test ./internal/dag -v -run TestStoryNodes
```

## Success Criteria

Phase 2A is complete when:

- [x] `internal/dag/dialogue.go` created with all structs
- [x] `Node` struct has `Dialogue *DialogueContent` field
- [x] All 5 story nodes have `Dialogue` populated
- [x] Code compiles without errors
- [x] Server starts without panics
- [x] Can access `node.Dialogue.Speaker`, `.Text`, `.Choices`
- [x] Tests pass (if written)

## Next Steps

After Phase 2A is complete:

1. **Verify**: Server starts, no errors, dialogue accessible
2. **Proceed to Phase 2B**: [PHASE_02B_NETWORKING.md](PHASE_02B_NETWORKING.md)
   - Create WebSocket DTOs
   - Serialize dialogue to JSON
   - Send to client

## Rollback

If Phase 2A causes issues:

```bash
# 1. Delete internal/dag/dialogue.go
rm internal/dag/dialogue.go

# 2. Remove Dialogue field from Node struct in graph.go
# 3. Revert story.go to original (without Dialogue field)

# 4. Rebuild
go build -o LightSpeedDuel
```

System continues working with client-side dialogue.

## Time Estimate

- **Create dialogue.go**: 15 minutes
- **Modify graph.go**: 5 minutes
- **Populate story.go**: 1.5-2 hours (typing out dialogue)
- **Testing**: 30 minutes

**Total**: 2-3 hours
