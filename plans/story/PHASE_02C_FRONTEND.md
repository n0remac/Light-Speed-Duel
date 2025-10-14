# Phase 2C: Frontend - Client Updates

**Focus**: TypeScript/client-side changes
**Estimated Time**: 1 hour
**Depends On**: Phase 2B complete (server sends dialogue)
**Completes**: Phase 2 migration

## Objective

Update the client to receive dialogue from the server and remove dependency on the local `mission1-content.ts` file.

## Implementation Strategy

### Two-Stage Rollout

#### Stage 1: Dual System (Safe)
- Client accepts dialogue from server OR local file
- Uses server dialogue if present, falls back to local
- System works with or without server dialogue

#### Stage 2: Server Only (Final)
- Remove fallback to local file
- Delete `mission1-content.ts`
- Client only uses server dialogue

## Implementation Steps

### Step 2C.1: Update TypeScript Interfaces

**File**: `internal/server/web/src/net.ts`

**Find `ServerStateMessage` interface** (around line 55) and modify:

**Before**:
```typescript
interface ServerStateMessage {
  type: "state";
  // ... other fields ...
  story?: {
    active_node?: string;
    available?: string[];
    flags?: Record<string, boolean>;
    recent_events?: Array<{
      chapter: string;
      node: string;
      timestamp: number;
    }>;
  };
}
```

**After**:
```typescript
interface ServerStateMessage {
  type: "state";
  // ... other fields ...
  story?: {
    active_node?: string;
    dialogue?: {                           // ← NEW: Server-provided dialogue
      speaker: string;
      text: string;
      intent: string;
      continue_label?: string;
      choices?: Array<{
        id: string;
        text: string;
      }>;
      tutorial_tip?: {
        title: string;
        text: string;
      };
    };
    available?: string[];
    flags?: Record<string, boolean>;
    recent_events?: Array<{
      chapter: string;
      node: string;
      timestamp: number;
    }>;
  };
}
```

### Step 2C.2: Update AppState

**File**: `internal/server/web/src/state.ts`

**Find or add `StoryState` interface**:

**Before** (if exists):
```typescript
export interface StoryState {
  activeNode: string | null;
  available: string[];
  flags: Record<string, boolean>;
  recentEvents: Array<{
    chapter: string;
    node: string;
    timestamp: number;
  }>;
}
```

**After**:
```typescript
export interface StoryState {
  activeNode: string | null;
  dialogue: DialogueContent | null;    // ← NEW: Store server dialogue
  available: string[];
  flags: Record<string, boolean>;
  recentEvents: Array<{
    chapter: string;
    node: string;
    timestamp: number;
  }>;
}
```

**Import DialogueContent** if needed:
```typescript
import type { DialogueContent } from "./story/mission1-content";
```

### Step 2C.3: Store Dialogue from Server

**File**: `internal/server/web/src/net.ts`

**Find story state handling** (around line 311) and modify:

**Before**:
```typescript
if (msg.story) {
  const prevActiveNode = state.story?.activeNode ?? null;
  state.story = {
    activeNode: msg.story.active_node ?? null,
    available: Array.isArray(msg.story.available) ? msg.story.available : [],
    flags: msg.story.flags ?? {},
    recentEvents: Array.isArray(msg.story.recent_events) ? msg.story.recent_events.map((evt) => ({
      chapter: evt.chapter,
      node: evt.node,
      timestamp: evt.timestamp,
    })) : [],
  };

  if (state.story.activeNode !== prevActiveNode && state.story.activeNode) {
    bus.emit("story:nodeActivated", { nodeId: state.story.activeNode });
  }
}
```

**After**:
```typescript
if (msg.story) {
  const prevActiveNode = state.story?.activeNode ?? null;

  // Convert server dialogue to DialogueContent format
  let dialogue: DialogueContent | null = null;
  if (msg.story.dialogue) {
    const d = msg.story.dialogue;
    dialogue = {
      speaker: d.speaker,
      text: d.text,
      intent: d.intent as "factory" | "unit",
      typingSpeedMs: 18,  // Default, or could come from server
      continueLabel: d.continue_label,
      choices: d.choices?.map(c => ({ id: c.id, text: c.text })),
      tutorialTip: d.tutorial_tip ? {
        title: d.tutorial_tip.title,
        text: d.tutorial_tip.text,
      } : undefined,
    };
  }

  state.story = {
    activeNode: msg.story.active_node ?? null,
    dialogue,  // ← NEW: Store dialogue
    available: Array.isArray(msg.story.available) ? msg.story.available : [],
    flags: msg.story.flags ?? {},
    recentEvents: Array.isArray(msg.story.recent_events) ? msg.story.recent_events.map((evt) => ({
      chapter: evt.chapter,
      node: evt.node,
      timestamp: evt.timestamp,
    })) : [],
  };

  // Emit event with dialogue
  if (state.story.activeNode !== prevActiveNode && state.story.activeNode) {
    bus.emit("story:nodeActivated", {
      nodeId: state.story.activeNode,
      dialogue: state.story.dialogue ?? undefined,  // ← Pass dialogue
    });
  }
}
```

### Step 2C.4: Update Event Bus Type

**File**: `internal/server/web/src/bus.ts`

**Find EventMap** and modify `story:nodeActivated`:

**Before**:
```typescript
export interface EventMap {
  // ... other events ...
  "story:nodeActivated": { nodeId: string };
}
```

**After**:
```typescript
export interface EventMap {
  // ... other events ...
  "story:nodeActivated": { nodeId: string; dialogue?: DialogueContent };
}
```

**Import DialogueContent** if needed:
```typescript
import type { DialogueContent } from "./story/mission1-content";
```

### Step 2C.5: Use Server Dialogue in Controller (Stage 1: Dual System)

**File**: `internal/server/web/src/story/controller.ts`

**Modify `handleNodeActivated()`** (around line 27):

**Before**:
```typescript
function handleNodeActivated({ nodeId }: { nodeId: string }): void {
  console.log("[story] Node activated:", nodeId);
  const parts = nodeId.split(".");
  if (parts.length < 3 || parts[0] !== "story") {
    console.warn("[story] Invalid node ID format:", nodeId);
    return;
  }
  const chapter = parts[1];
  const node = parts.slice(2).join(".");
  showDialogueForNode(chapter, node, nodeId);
}
```

**After**:
```typescript
function handleNodeActivated({ nodeId, dialogue }: { nodeId: string; dialogue?: DialogueContent }): void {
  console.log("[story] Node activated:", nodeId, "Server dialogue:", dialogue ? "present" : "missing");

  const parts = nodeId.split(".");
  if (parts.length < 3 || parts[0] !== "story") {
    console.warn("[story] Invalid node ID format:", nodeId);
    return;
  }
  const chapter = parts[1];
  const node = parts.slice(2).join(".");

  // Use server dialogue if provided, else fall back to local lookup
  const content = dialogue ?? getDialogueForNode(nodeId);

  if (!content) {
    console.warn("[story] No dialogue found (server or local) for:", nodeId);
    acknowledgeNode(nodeId, null);
    return;
  }

  console.log("[story] Using dialogue from:", dialogue ? "server" : "local file");
  showDialogueForNode(chapter, node, nodeId, content);
}

function showDialogueForNode(chapter: string, node: string, fullNodeId: string, content: DialogueContent): void {
  // ... rest of function unchanged
}
```

### Step 2C.6: Build and Test (Stage 1)

```bash
# Build TypeScript
go generate ./internal/server

# Build Go
go build -o LightSpeedDuel

# Run server
./LightSpeedDuel -addr :8080

# Test: http://localhost:8080/?room=test&mode=campaign&mission=1
```

### Step 2C.7: Remove Local Dialogue (Stage 2 - After Testing)

Once Stage 1 works perfectly:

**File**: `internal/server/web/src/story/controller.ts`

**Remove fallback**:

```typescript
function handleNodeActivated({ nodeId, dialogue }: { nodeId: string; dialogue?: DialogueContent }): void {
  console.log("[story] Node activated:", nodeId);

  if (!dialogue) {
    console.error("[story] No dialogue provided by server for:", nodeId);
    // Could auto-acknowledge or show error message
    acknowledgeNode(nodeId, null);
    return;
  }

  const parts = nodeId.split(".");
  if (parts.length < 3 || parts[0] !== "story") {
    console.warn("[story] Invalid node ID format:", nodeId);
    return;
  }
  const chapter = parts[1];
  const node = parts.slice(2).join(".");

  showDialogueForNode(chapter, node, nodeId, dialogue);
}
```

**Delete file**: `internal/server/web/src/story/mission1-content.ts`

**Remove imports**:
- Remove import from `controller.ts`
- Remove import from any other files

**Rebuild**:
```bash
go generate ./internal/server
go build -o LightSpeedDuel
```

## Testing Phase 2C

### Stage 1 Testing (Dual System)

- [ ] **Server dialogue works**
  - Start campaign mode
  - Opening dialogue displays
  - Check browser console: "Using dialogue from: server"
  - All features work (choices, tips, continue)

- [ ] **Fallback works**
  - Temporarily break server dialogue (comment out serialization in `ws.go`)
  - Rebuild and run
  - Dialogue still displays
  - Check console: "Using dialogue from: local file"
  - Restore server dialogue

- [ ] **Both sources produce same result**
  - Compare dialogue appearance with server vs local
  - Should be identical

### Stage 2 Testing (Server Only)

- [ ] **No local file in bundle**
  - Build and run
  - Open DevTools → Sources tab
  - Search for "mission1-content"
  - Should NOT find it

- [ ] **Server dialogue required**
  - If server doesn't send dialogue → error logged
  - Graceful handling (no crashes)

- [ ] **End-to-end story works**
  - Start campaign
  - Play through all 5 story beats
  - All dialogue displays correctly
  - Choices work
  - Tutorial tips appear
  - Story progresses

### Browser Console Verification

**Expected Stage 1 logs**:
```
[story] Node activated: story.signal-static-1.start Server dialogue: present
[story] Using dialogue from: server
[story] Showing dialogue: {speaker: "UNKNOWN SIGNAL", ...}
```

**Expected Stage 2 logs**:
```
[story] Node activated: story.signal-static-1.start
[story] Showing dialogue: {speaker: "UNKNOWN SIGNAL", ...}
```

## Common Issues

**Problem**: Dialogue doesn't display
- **Check**: Is server sending dialogue? (WebSocket messages)
- **Check**: Is `state.story.dialogue` being set?
- **Check**: Is event emitting dialogue?
- **Check**: Browser console for errors

**Problem**: Choices don't work
- **Check**: Are choices array being passed to overlay?
- **Check**: Is `onChoice` callback defined?
- **Check**: Are choice IDs matching server expectations?

**Problem**: Tutorial tips missing
- **Check**: Is `tutorialTip` being converted correctly?
- **Check**: Is `showTutorialTip()` being called?

**Problem**: TypeScript compilation errors
- **Check**: All interface updates match
- **Check**: Imports are correct
- **Check**: Optional chaining (`?.`) used appropriately

## Success Criteria

### Stage 1 Complete
- [x] Client receives dialogue from server
- [x] Client stores dialogue in state
- [x] Client displays server dialogue
- [x] Client falls back to local if server dialogue missing
- [x] Both sources work identically
- [x] No errors in browser console

### Stage 2 Complete (Phase 2 Fully Done)
- [x] Client only uses server dialogue
- [x] `mission1-content.ts` deleted
- [x] No local dialogue in compiled JavaScript
- [x] Cannot read future dialogue in DevTools
- [x] Story mode works end-to-end
- [x] All features work (choices, tips, continue)

## Rollback

### Stage 1 Rollback
If dual system breaks, revert TypeScript changes:
```bash
git checkout internal/server/web/src/net.ts
git checkout internal/server/web/src/bus.ts
git checkout internal/server/web/src/story/controller.ts
go generate ./internal/server
go build -o LightSpeedDuel
```

### Stage 2 Rollback
If server-only breaks, restore `mission1-content.ts` and fallback logic:
```bash
git checkout internal/server/web/src/story/mission1-content.ts
git checkout internal/server/web/src/story/controller.ts
go generate ./internal/server
go build -o LightSpeedDuel
```

## Next Steps

After Phase 2C is complete:

1. **Integration test** - Play through story mode completely
2. **Deploy** - Story system is now fully server-authoritative
3. **Optional enhancements**:
   - Dynamic dialogue based on player state
   - Localization support
   - Event-specific content

## Time Estimate

- **Update interfaces**: 15 minutes
- **Modify net.ts**: 15 minutes
- **Update controller**: 15 minutes
- **Testing Stage 1**: 15 minutes
- **Remove local file**: 5 minutes
- **Testing Stage 2**: 15 minutes

**Total**: 1 hour

## Related Files

### Modified
- `internal/server/web/src/net.ts` - Store dialogue from server
- `internal/server/web/src/bus.ts` - Event type updated
- `internal/server/web/src/story/controller.ts` - Use server dialogue
- `internal/server/web/src/state.ts` - StoryState interface

### Deleted (Stage 2)
- `internal/server/web/src/story/mission1-content.ts` - No longer needed

### Unchanged
- `internal/server/web/src/story/overlay.ts` - UI works with any source
- `internal/server/web/src/story/types.ts` - Type definitions still valid
