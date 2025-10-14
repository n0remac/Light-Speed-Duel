# Story System Guide - Light Speed Duel

## Overview

Light Speed Duel uses a **server-authoritative story system** powered by the DAG (Directed Acyclic Graph) progression framework. Story beats are triggered by mission events and delivered to clients via WebSocket, ensuring multiplayer safety and persistence.

## Architecture

### Server-Side (Go)

**Components:**
- `internal/dag/story.go` - Story node definitions
- `internal/game/story_effects.go` - Story progression effects
- `internal/game/room.go` - Mission event handling
- `internal/server/ws.go` - WebSocket story payload

**Flow:**
1. Mission event occurs (e.g., beacon locked)
2. `HandleMissionStoryEventLocked()` maps event to DAG node
3. `DAG.Start()` activates the story node
4. `StoryEffects` updates player state
5. `ActiveStoryNodeID` and `StoryFlags` sent to client

### Client-Side (TypeScript)

**Components:**
- `src/story/controller.ts` - Server-driven story controller
- `src/story/mission1-content.ts` - Mission 1 dialogue content
- `src/story/overlay.ts` - Dialogue rendering
- `src/net.ts` - WebSocket story consumption

**Flow:**
1. Receive story state via WebSocket
2. Emit `story:nodeActivated` event
3. Controller looks up dialogue content
4. Display dialogue + optional tutorial tip
5. User acknowledges → send `dag_story_ack` to server

## Adding New Story Content

### 1. Define Server-Side Nodes

Edit `internal/dag/story.go`:

```go
func SeedStoryNodes() []*Node {
    return []*Node{
        // ... existing nodes
        {
            ID:         "story.mission-2.start",
            Kind:       NodeKindStory,
            Label:      "Mission 2 - Opening",
            DurationS:  0,
            Repeatable: false,
            Payload: map[string]string{
                "chapter": "mission-2",
                "node":    "start",
                "flag":    "story.mission-2.start",
            },
            Requires: []NodeID{"story.signal-static-1.complete"},
        },
    }
}
```

### 2. Map Mission Events to Nodes

Edit `internal/game/room.go` (if new mission):

```go
func storyNodeForMissionEvent(event string, beaconIndex int) dag.NodeID {
    switch event {
    case "mission:start":
        return dag.NodeID("story.mission-2.start")
    case "mission:beacon-locked":
        switch beaconIndex {
        case 1:
            return dag.NodeID("story.mission-2.beacon-1")
        // ...
        }
    case "mission:completed":
        return dag.NodeID("story.mission-2.complete")
    }
    return ""
}
```

### 3. Create Client-Side Content

Create `internal/server/web/src/story/mission2-content.ts`:

```typescript
import type { DialogueContent } from "./mission1-content";

export const MISSION_2_CONTENT: Record<string, DialogueContent> = {
  "story.mission-2.start": {
    speaker: "MISSION CONTROL",
    text: "Your mission dialogue here...\n\n[Narrative description in brackets]",
    intent: "factory", // or "unit"
    typingSpeedMs: 18,
    continueLabel: "Begin Mission",
    tutorialTip: {
      title: "Tutorial Title",
      text: "Tutorial tip explaining a new mechanic or strategy.",
    },
  },
  // ... more beats
};

export function getDialogueForNode(nodeId: string): DialogueContent | null {
  return MISSION_2_CONTENT[nodeId] || null;
}
```

### 4. Register Content in Controller

Edit `internal/server/web/src/story/controller.ts`:

```typescript
import { getDialogueForNode as getMission1 } from "./mission1-content";
import { getDialogueForNode as getMission2 } from "./mission2-content";

// In showDialogueForNode function:
let content = getMission1(fullNodeId);
if (!content) content = getMission2(fullNodeId);
```

**Better approach** (for multiple missions):

```typescript
const contentSources = [
  getMission1,
  getMission2,
  // ... add more
];

function getContent(nodeId: string): DialogueContent | null {
  for (const source of contentSources) {
    const content = source(nodeId);
    if (content) return content;
  }
  return null;
}
```

### 5. Rebuild and Test

```bash
go generate ./internal/server  # Build TypeScript
go build -o LightSpeedDuel      # Build Go
./LightSpeedDuel -addr :8080    # Run server
```

## Content Authoring Guidelines

### Dialogue Writing

**Do:**
- Keep beats concise (2-3 sentences)
- Use atmospheric language ("crackles", "flickers")
- Add narrative context in [brackets]
- Build tension progressively
- End with clear next step

**Don't:**
- Write walls of text
- Use complex jargon without explanation
- Repeat information
- Break immersion with meta-commentary

**Example:**

```typescript
{
  speaker: "DISTRESS BEACON",
  text: "Signal lock acquired… coordinates resolving…\n\n[The transmission stabilizes. Whatever's out there, it's close now.]",
  intent: "factory",
  continueLabel: "Proceed",
}
```

### Tutorial Tips

**Do:**
- Focus on one mechanic
- Explain "what" and "why"
- Use active voice ("Click to...", "Watch for...")
- Time to when mechanic is first relevant

**Don't:**
- Overwhelm with multiple concepts
- State the obvious
- Be too vague
- Use passive constructions

**Example:**

```typescript
tutorialTip: {
  title: "Heat Management",
  text: "Flying too fast heats your ship. Match your speed to the marker line for optimal efficiency.",
}
```

## Testing Story Beats

### Local Testing

```bash
# Start server
./LightSpeedDuel -addr :8080

# Test specific mission
http://localhost:8080/?mode=campaign&mission=signal-static-1

# Watch server logs
Started Story
dag_story_ack received from p_xxxxx for story.signal-static-1.start
```

### Browser Console

```javascript
// Check story state
console.log(state.story);
// {
//   activeNode: "story.signal-static-1.beacon-1",
//   available: ["story.signal-static-1.beacon-2"],
//   flags: {"story.signal-static-1.start": true, ...},
//   recentEvents: [...]
// }

// Manually trigger story node (testing)
bus.emit("story:nodeActivated", { nodeId: "story.signal-static-1.start" });
```

### WebSocket Messages

Check Network tab in browser DevTools:

**Story activation** (server → client):
```json
{
  "type": "state",
  "story": {
    "active_node": "story.signal-static-1.beacon-1",
    "available": ["story.signal-static-1.beacon-2"],
    "flags": {"story.signal-static-1.start": true},
    "recent_events": []
  }
}
```

**Story acknowledgement** (client → server):
```json
{
  "type": "dag_story_ack",
  "node_id": "story.signal-static-1.beacon-1"
}
```

## Troubleshooting

### Story doesn't appear

**Check:**
1. Server logs - is mission event firing?
2. DAG node exists - check `internal/dag/story.go`
3. Content exists - check `mission1-content.ts`
4. WebSocket payload - inspect in Network tab
5. Controller listening - check browser console

### Story appears but doesn't acknowledge

**Check:**
1. `sendMessage()` is called
2. WebSocket is connected
3. Server receives `dag_story_ack`
4. DAG node status changes to `completed`

### Tutorial tip not showing

**Check:**
1. Content has `tutorialTip` field
2. Styles are injected (check `<head>`)
3. Element is in DOM (check Elements tab)
4. Z-index conflicts with other UI

### Story replays after reconnect

**Check:**
1. Server persists `ActiveStoryNodeID`
2. Client receives story state on reconnect
3. Controller checks `state.story?.activeNode` on start
4. Node is not marked `repeatable: true`

## Current Missions

### Mission 1: Signal In The Static

**Story Beats:**
1. `story.signal-static-1.start` - Garbled distress signal
2. `story.signal-static-1.beacon-1` - Signal improving
3. `story.signal-static-1.beacon-2` - Possible survivors
4. `story.signal-static-1.beacon-3` - Seeker signatures
5. `story.signal-static-1.complete` - Archives unlocked

**Files:**
- Server: `internal/dag/story.go`
- Client: `internal/server/web/src/story/mission1-content.ts`

## Future Plans

### Short Term
- Add sound effects for dialogue
- Audio cues for tutorial tips
- Mission 2 content

### Long Term
- Branching dialogue with choices
- Conditional text based on player actions
- Character portraits
- Animated transitions
- Localization support

## API Reference

### DialogueContent Interface

```typescript
interface DialogueContent {
  speaker: string;           // Speaker name (all caps)
  text: string;              // Dialogue text with \n for line breaks
  intent?: "factory" | "unit"; // Visual theme
  typingSpeedMs?: number;    // Typing animation speed (default: 18)
  continueLabel?: string;    // Button text (default: "Continue")
  tutorialTip?: {
    title: string;           // Tip title (all caps)
    text: string;            // Tip body text
  };
}
```

### Server Payload

```go
type storyStateDTO struct {
    ActiveNode string              `json:"active_node,omitempty"`
    Available  []string            `json:"available,omitempty"`
    Flags      map[string]bool     `json:"flags,omitempty"`
    Events     []storyEventDTO     `json:"recent_events,omitempty"`
}
```

### Client State

```typescript
interface StoryState {
  activeNode: string | null;
  available: string[];
  flags: Record<string, boolean>;
  recentEvents: StoryEvent[];
}
```

## Resources

- **DAG System**: `plans/dag/PHASE_03_COMPLETE.md`
- **Phase 4 Details**: `plans/campaign/PHASE_04_COMPLETE.md`
- **Campaign Plan**: `plans/campaign/PLAN.md`

---

**Questions?** Check the implementation in:
- `internal/server/web/src/story/controller.ts`
- `internal/server/web/src/story/mission1-content.ts`
- `internal/dag/story.go`
