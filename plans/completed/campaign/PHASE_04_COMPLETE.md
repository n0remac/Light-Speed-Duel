# Phase 4: Story & Tutorial Beats - COMPLETE ✅

## Status: Ready for Testing

Phase 4 has been successfully implemented. Mission 1 "Signal In The Static" now has full story dialogue and tutorial tips integrated with the server-driven DAG system.

## What Was Implemented

### 1. Mission 1 Story Content ✅

Created comprehensive dialogue for all 5 story beats in Mission 1:

1. **story.signal-static-1.start** - Garbled distress signal introduction
   - Tutorial tip: Route Plotting basics

2. **story.signal-static-1.beacon-1** - Signal improving after first beacon
   - Tutorial tip: Heat Management fundamentals

3. **story.signal-static-1.beacon-2** - Possible survivors detected
   - Tutorial tip: Evasive Routing strategies

4. **story.signal-static-1.beacon-3** - Seeker signatures detected
   - Tutorial tip: Combat Awareness

5. **story.signal-static-1.complete** - Archives unlocked, mission complete
   - No tutorial tip (mission complete)

### 2. Story Controller Enhancement ✅

Updated [controller.ts](../internal/server/web/src/story/controller.ts):
- Integrated Mission 1 content from `mission1-content.ts`
- Added tutorial tip rendering alongside dialogue
- Tutorial tips display in top-right corner with slide-in animation
- Tips auto-hide when dialogue is dismissed
- Styled to match game aesthetic (cyan/teal theme)

### 3. Content Authoring System ✅

Created [mission1-content.ts](../internal/server/web/src/story/mission1-content.ts):
- Clean separation of content from controller logic
- TypeScript interfaces for dialogue content
- Optional tutorial tips per story beat
- Easy to extend for future missions

### 4. Tutorial Tip UI ✅

New UI component for lightweight tutorial reminders:
- Fixed position (top-right corner)
- Cyan/teal theme matching story aesthetic
- Smooth slide-in animation
- Auto-cleanup when dialogue closes
- Non-intrusive design
- Monospace font for consistency

## Files Created

1. **internal/server/web/src/story/mission1-content.ts** - Mission 1 story content
2. **plans/campaign/PHASE_04_COMPLETE.md** - This documentation

## Files Modified

1. **internal/server/web/src/story/controller.ts** - Enhanced with content integration and tutorial tips

## Story Content Details

### Narrative Arc

The Mission 1 story follows a clear progression:

1. **Mystery** - Garbled signal draws the player in
2. **Investigation** - Signal improves as beacons are locked
3. **Tension** - Survivors detected, but dangers lurk
4. **Danger** - Automated defenses detected
5. **Resolution** - Archives unlocked, next mission revealed

### Tutorial Integration

Tutorial tips are carefully timed:
- **Start**: Route plotting when player first enters mission
- **Beacon 1**: Heat management as complexity increases
- **Beacon 2**: Evasive routing before more challenging sections
- **Beacon 3**: Combat awareness before final approach
- **Complete**: No tip (celebration moment)

Each tip is:
- Concise (2-3 sentences)
- Actionable (explains what to do)
- Contextual (appears when relevant)
- Non-blocking (doesn't interrupt gameplay)

## Architecture Flow

### Server → Client
```
Mission Event → HandleMissionStoryEventLocked()
  → DAG.Start(story.signal-static-1.beacon-1)
  → StoryEffects.OnStart()
  → ActiveStoryNodeID set
  → WebSocket state message sent
  → Client receives story.active_node
  → bus.emit("story:nodeActivated")
  → controller.handleNodeActivated()
  → getDialogueForNode()
  → overlay.show() + showTutorialTip()
```

### Client → Server
```
User clicks "Continue"
  → acknowledgeNode()
  → sendMessage({ type: "dag_story_ack", node_id })
  → Server receives dag_story_ack
  → DAG.Complete(node)
  → Next node becomes available
  → Cycle repeats
```

## Testing Checklist

### Manual Testing Required

- [ ] **Start campaign mode**
  - Navigate to: `http://localhost:8080/?mode=campaign&mission=signal-static-1`
  - Distress signal dialogue should appear immediately
  - Tutorial tip about route plotting should be visible

- [ ] **Beacon 1 lock**
  - Lock first beacon (hover over it for 2 seconds)
  - "Signal improving" dialogue should appear
  - Tutorial tip about heat management should be visible

- [ ] **Beacon 2 lock**
  - Lock second beacon
  - "Possible survivors" dialogue should appear
  - Tutorial tip about evasive routing should be visible

- [ ] **Beacon 3 lock**
  - Lock third beacon
  - "Seeker signatures" dialogue should appear
  - Tutorial tip about combat awareness should be visible

- [ ] **Mission complete**
  - Complete all 4 beacons
  - "Unit-0, you found us" dialogue should appear
  - No tutorial tip (mission complete message)

- [ ] **Acknowledgement flow**
  - Each "Continue" click should send `dag_story_ack`
  - Check browser Network tab for WebSocket messages
  - Check server logs for acknowledgements

- [ ] **Reconnection**
  - Refresh browser during mission
  - Story should resume from last completed beat
  - Should not replay already-seen dialogue

- [ ] **Tutorial tips**
  - Tips should appear in top-right corner
  - Tips should slide in smoothly
  - Tips should hide when dialogue closes
  - Tips should be readable and styled correctly

### Server Logs to Verify

```
Started Story
dag_story_ack received from p_xxxxx for story.signal-static-1.start
dag_story_ack received from p_xxxxx for story.signal-static-1.beacon-1
dag_story_ack received from p_xxxxx for story.signal-static-1.beacon-2
dag_story_ack received from p_xxxxx for story.signal-static-1.beacon-3
dag_story_ack received from p_xxxxx for story.signal-static-1.complete
```

### Browser Console to Verify

```
[story] Node activated: story.signal-static-1.start
[story] Acknowledged node: story.signal-static-1.start
[story] Node activated: story.signal-static-1.beacon-1
[story] Acknowledged node: story.signal-static-1.beacon-1
...
```

## Content Quality Guidelines

The Mission 1 content follows these principles:

### Dialogue Writing
- **Concise**: Each beat is 2-3 sentences max
- **Atmospheric**: Uses "..."  and "[bracketed observations]" for mood
- **Progressive**: Each beat builds on the previous
- **Clear**: Avoids jargon, explains context
- **Engaging**: Creates mystery and tension

### Tutorial Tips
- **Actionable**: "Click to...", "Watch your...", "Plan ahead..."
- **Contextual**: Appears when the mechanic becomes relevant
- **Brief**: Title + 2-3 sentences
- **Complementary**: Doesn't repeat dialogue content

## Future Enhancements

### Short Term
1. Add sound effects for dialogue appearances
2. Add subtle audio cue for tutorial tips
3. Test with actual players for pacing
4. Adjust timing/content based on feedback

### Long Term
1. Create Mission 2 content
2. Add branching dialogue with choices
3. Support for conditional text based on player actions
4. Localization support for multiple languages
5. Accessibility features (screen reader support)

## Content Authoring for New Missions

To add story content for new missions:

### 1. Define DAG Nodes (Server-side)

Edit `internal/dag/story.go`:

```go
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
```

### 2. Create Content File (Client-side)

Create `internal/server/web/src/story/mission2-content.ts`:

```typescript
export const MISSION_2_CONTENT: Record<string, DialogueContent> = {
  "story.mission-2.start": {
    speaker: "MISSION CONTROL",
    text: "Your dialogue here...",
    intent: "factory",
    continueLabel: "Begin Mission",
    tutorialTip: {
      title: "New Mechanic",
      text: "Tutorial tip text here...",
    },
  },
  // ... more beats
};
```

### 3. Update Controller

Edit `controller.ts` to import and use new content:

```typescript
import { getDialogueForNode as getMission1Content } from "./mission1-content";
import { getDialogueForNode as getMission2Content } from "./mission2-content";

function getDialogueForNode(fullNodeId: string): DialogueContent | null {
  // Try mission 1 content
  let content = getMission1Content(fullNodeId);
  if (content) return content;

  // Try mission 2 content
  content = getMission2Content(fullNodeId);
  if (content) return content;

  return null;
}
```

Or create a content registry system for cleaner scaling.

## Known Issues

None currently identified. Build succeeds, TypeScript types are correct.

## Success Criteria Met ✅

All Phase 4 objectives completed:

- [x] Mission 1 story beats authored with rich dialogue
- [x] Tutorial tips created for key progression points
- [x] Content integrated with server-driven DAG system
- [x] Dialogue overlay displays story content
- [x] Tutorial tips render alongside dialogue
- [x] Acknowledgement wiring sends dag_story_ack
- [x] TypeScript builds successfully
- [x] Go binary builds successfully
- [x] Documentation created

## Integration with Other Phases

### Depends On
- ✅ Phase 1: Map Bootstrap (beacons exist)
- ✅ Phase 2: Beacon locking (mission events fire)
- ✅ Phase 3 (DAG): Server story system (DAG nodes exist)

### Enables
- Phase 5: Polish & QA can now test full story flow
- Future missions can use same content system

## Performance Considerations

- Content is bundled with client (minimal overhead)
- Tutorial tip DOM creation is lazy (only when needed)
- Styles injected once (cached after first use)
- Memory cleanup on dialogue close

## Accessibility

Current implementation:
- Text is readable (good contrast)
- Font sizes are appropriate
- No flashing or rapid animations

Future improvements:
- Add ARIA labels
- Screen reader support
- Keyboard navigation
- Skip dialogue option

## Conclusion

✅ Phase 4 is complete and ready for testing.
✅ Mission 1 has full narrative and tutorial integration.
✅ System is extensible for future missions.
✅ All builds succeed without errors.

**Next**: Manual testing in campaign mode, then proceed to Phase 5 (Polish & QA)!

---

## Quick Start Testing

```bash
# 1. Build (already done)
go build -o LightSpeedDuel

# 2. Run server
./LightSpeedDuel -addr :8080

# 3. Open browser
http://localhost:8080/?mode=campaign&mission=signal-static-1

# 4. Expected flow:
# - Distress signal dialogue appears
# - Route plotting tip visible (top-right)
# - Click "Plot Course" to dismiss
# - Lock beacons to progress story
# - Each beacon triggers new dialogue + tip
# - Complete mission to see final message
```

## Content Preview

### Example Dialogue
```
SPEAKER: UNKNOWN SIGNAL

–gnal… —issus… co–dinates…

[A weak signal crackles through the void. The
transmission is nearly unintelligible, but coordinates
emerge from the static. Something—or someone—needs help.]

[Continue: Plot Course]
```

### Example Tutorial Tip
```
┌─────────────────────────────┐
│ ROUTE PLOTTING              │
│ Click on the map to plot    │
│ waypoints for your ship.    │
│ Right-click waypoints to    │
│ adjust speed. Your route    │
│ determines your heat buildup│
└─────────────────────────────┘
```

Ready for testing! 🚀
