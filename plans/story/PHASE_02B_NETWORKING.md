# Phase 2B: Networking - WebSocket DTOs

**Focus**: WebSocket protocol and serialization
**Estimated Time**: 1 hour
**Depends On**: Phase 2A complete (backend dialogue structures exist)
**Blocks**: Phase 2C (frontend needs server to send dialogue)

## Objective

Create Data Transfer Objects (DTOs) to serialize dialogue over WebSocket and modify the server to send dialogue when a story node activates.

## Implementation Steps

### Step 2B.1: Create WebSocket DTOs

**File**: `internal/server/dto.go`

**Add dialogue DTOs** after the existing types (around line 93):

```go
// storyDialogueChoiceDTO represents a player response option
type storyDialogueChoiceDTO struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// storyTutorialTipDTO provides gameplay hints alongside dialogue
type storyTutorialTipDTO struct {
	Title string `json:"title"`
	Text  string `json:"text"`
}

// storyDialogueDTO contains presentation data for a story node
type storyDialogueDTO struct {
	Speaker       string                     `json:"speaker"`
	Text          string                     `json:"text"`
	Intent        string                     `json:"intent"`                    // "factory" or "unit"
	ContinueLabel string                     `json:"continue_label,omitempty"`  // Empty = default "Continue"
	Choices       []storyDialogueChoiceDTO   `json:"choices,omitempty"`         // Empty = show continue button
	TutorialTip   *storyTutorialTipDTO       `json:"tutorial_tip,omitempty"`    // Optional gameplay hint
}
```

### Step 2B.2: Modify Story State DTO

**File**: `internal/server/ws.go`

**Find `storyStateDTO`** (around line 154) and modify:

**Before**:
```go
type storyStateDTO struct {
	ActiveNode string          `json:"active_node,omitempty"`
	Available  []string        `json:"available,omitempty"`
	Flags      map[string]bool `json:"flags,omitempty"`
	Events     []storyEventDTO `json:"recent_events,omitempty"`
}
```

**After**:
```go
type storyStateDTO struct {
	ActiveNode string            `json:"active_node,omitempty"`
	Dialogue   *storyDialogueDTO `json:"dialogue,omitempty"`  // ← NEW: Full dialogue content
	Available  []string          `json:"available,omitempty"`
	Flags      map[string]bool   `json:"flags,omitempty"`
	Events     []storyEventDTO   `json:"recent_events,omitempty"`
}
```

### Step 2B.3: Serialize and Send Dialogue

**File**: `internal/server/ws.go`

**Find the story DTO building code** (around line 805-814) and modify:

**Before**:
```go
flags := copyStoryFlags(p.StoryFlags)
if flags == nil {
    flags = make(map[string]bool)
}
storyDTO = &storyStateDTO{
    ActiveNode: p.ActiveStoryNodeID,
    Flags:      flags,
    Available:  storyAvailable,
}
```

**After**:
```go
flags := copyStoryFlags(p.StoryFlags)
if flags == nil {
    flags = make(map[string]bool)
}
storyDTO = &storyStateDTO{
    ActiveNode: p.ActiveStoryNodeID,
    Flags:      flags,
    Available:  storyAvailable,
}

// Serialize dialogue for active node
if p.ActiveStoryNodeID != "" {
    if graph := dag.GetGraph(); graph != nil {
        nodeID := dag.NodeID(p.ActiveStoryNodeID)
        if node := graph.GetNode(nodeID); node != nil && node.Dialogue != nil {
            d := node.Dialogue

            // Convert choices
            var choices []storyDialogueChoiceDTO
            for _, choice := range d.Choices {
                choices = append(choices, storyDialogueChoiceDTO{
                    ID:   choice.ID,
                    Text: choice.Text,
                })
            }

            // Convert tutorial tip
            var tip *storyTutorialTipDTO
            if d.TutorialTip != nil {
                tip = &storyTutorialTipDTO{
                    Title: d.TutorialTip.Title,
                    Text:  d.TutorialTip.Text,
                }
            }

            // Build dialogue DTO
            storyDTO.Dialogue = &storyDialogueDTO{
                Speaker:       d.Speaker,
                Text:          d.Text,
                Intent:        d.Intent,
                ContinueLabel: d.ContinueLabel,
                Choices:       choices,
                TutorialTip:   tip,
            }
        }
    }
}
```

### Step 2B.4: Add Logging

**Add debug logging** to verify dialogue is being sent:

```go
// After building storyDTO.Dialogue
if storyDTO.Dialogue != nil {
    log.Printf("[story] Sending dialogue for node %s to player %s (speaker: %s, choices: %d)",
        p.ActiveStoryNodeID, p.ID, storyDTO.Dialogue.Speaker, len(storyDTO.Dialogue.Choices))
}
```

### Step 2B.5: Build and Test

```bash
# Build Go code
go build -o LightSpeedDuel

# Run server
./LightSpeedDuel -addr :8080
```

## Testing Phase 2B

### Test Checklist

- [ ] **Server starts without errors**
  - No compilation errors
  - No panics on startup

- [ ] **Inspect WebSocket messages**
  - Open browser: `http://localhost:8080/?room=test&mode=campaign&mission=1`
  - Open DevTools → Network tab
  - Filter by "WS" (WebSocket)
  - Click the WebSocket connection
  - Look at Messages tab

- [ ] **Verify dialogue in messages**
  - Find a message with `"type":"state"`
  - Look for `"story"` object
  - Check `"story.dialogue"` exists
  - Verify fields: `speaker`, `text`, `intent`, `choices`

### Expected WebSocket Message

When story node activates, you should see:

```json
{
  "type": "state",
  "story": {
    "active_node": "story.signal-static-1.start",
    "dialogue": {
      "speaker": "UNKNOWN SIGNAL",
      "text": "–gnal… —issus… co–dinates…\n\n[A weak signal crackles through the void...]",
      "intent": "factory",
      "choices": [
        {"id": "investigate", "text": "Investigate the signal"},
        {"id": "cautious", "text": "Approach with extreme caution"},
        {"id": "ignore", "text": "Log coordinates and continue patrol"}
      ],
      "tutorial_tip": {
        "title": "Route Plotting",
        "text": "Click on the map to plot waypoints..."
      }
    },
    "flags": {},
    "available": []
  }
}
```

### Server Log Verification

Look for:
```
[story] Sending dialogue for node story.signal-static-1.start to player <id> (speaker: UNKNOWN SIGNAL, choices: 3)
```

### Common Issues

**Problem**: `dialogue` field missing from WebSocket message
- **Check**: Does node have `node.Dialogue != nil`?
- **Check**: Is `ActiveStoryNodeID` set?
- **Check**: Did you rebuild Go binary?

**Problem**: Dialogue fields are empty/null
- **Check**: Is `node.Dialogue.Speaker` populated in `story.go`?
- **Check**: Are choices being copied to DTO correctly?

**Problem**: JSON serialization error
- **Check**: All DTO fields have correct `json` tags
- **Check**: Struct field names are capitalized (exported)

**Problem**: Server panics when sending dialogue
- **Check**: Nil pointer checks (`node != nil`, `d.TutorialTip != nil`)
- **Check**: Initialized slices/maps properly

## Verification with curl

Test the WebSocket message format:

```bash
# 1. Start server
./LightSpeedDuel -addr :8080

# 2. In another terminal, connect with websocat (if installed)
websocat ws://localhost:8080/ws?room=test&mode=campaign&mission=1

# 3. Send join message
{"type":"join","name":"TestPlayer"}

# 4. Look for state messages with story.dialogue field
```

Or use browser DevTools as described above.

## Success Criteria

Phase 2B is complete when:

- [x] WebSocket DTOs created in `dto.go`
- [x] `storyStateDTO` has `Dialogue` field
- [x] Server serializes dialogue from `node.Dialogue`
- [x] WebSocket messages include `story.dialogue` object
- [x] All dialogue fields present: speaker, text, intent, choices, tip
- [x] No serialization errors
- [x] Server logs confirm dialogue being sent

## Next Steps

After Phase 2B is complete:

1. **Verify**: WebSocket messages contain dialogue
2. **Proceed to Phase 2C**: [PHASE_02C_FRONTEND.md](PHASE_02C_FRONTEND.md)
   - Update client to receive and display server dialogue
   - Remove dependency on `mission1-content.ts`

## Rollback

If Phase 2B causes issues:

```bash
# 1. Revert dto.go - remove dialogue DTOs
# 2. Revert ws.go storyStateDTO - remove Dialogue field
# 3. Revert ws.go dialogue serialization code
# 4. Rebuild

go build -o LightSpeedDuel
```

Client will fall back to local dialogue lookup (Phase 2C handles fallback).

## Time Estimate

- **Create DTOs**: 15 minutes
- **Modify storyStateDTO**: 5 minutes
- **Add serialization logic**: 20 minutes
- **Testing**: 20 minutes

**Total**: 1 hour
