# Beacon Interaction Refactor Plan

## Overview

This plan refactors beacon lock interactions to:
1. Make ambient encounters respect safe rings around beacons (using annulus spawning)
2. Replace automatic missile spawns with story-driven choices (friendly dialogue vs hostile encounters)
3. Clean up legacy missile code that's no longer needed

## Phase 1: Scope Existing Systems

### Current Encounter Flow
**Location**: `internal/game/beacons.go`

1. `checkEncounterSpawns()` (line 565) - Runs every tick for discovered beacons
2. `spawnEncounterFromTemplate()` (line 639) - Creates encounter entities
3. **Problem**: Uses `SpawnFromTemplate()` which ignores beacon safe zones

**Location**: `internal/game/mission.go`

- `SpawnFromTemplate()` (line 28) - OLD: No safe ring support
- `SpawnFromTemplateWithContext()` (line 102) - NEW: Supports annulus spawning with `SpawnContext`
- `SpawnMissionWave()` (line 442) - LEGACY: Should be removed
- `SpawnMissionWaveWithContext()` (line 462) - PREFERRED: Safe ring aware

### Current Beacon Lock Flow
**Location**: `internal/game/beacons.go:1077-1118`

1. `lockBeacon()` is called when player completes beacon hold
2. Fires story event: `HandleMissionStoryEventLocked(p, "mission:beacon-locked", beacon.Ordinal+1)`
3. **Problem**: Also spawns waves directly via `launchEncounter()` at line 1114
4. `launchEncounter()` (line 1134) calls `SpawnMissionWaveWithContext()` - this is good, but shouldn't be automatic

### Legacy Code Targets for Removal

**In `internal/game/mission.go`:**
- `SpawnMissionWave()` (line 442-458) - Replace all callers with `SpawnMissionWaveWithContext()`
- `waveEncounterMap` (line 10-14) - Keep for now (used by context variant)

**In `internal/game/beacons.go`:**
- `TriggerEncounterForWaveLocked()` (line 1122-1132) - Legacy client command, check if still used
- Direct `launchEncounter()` call in `lockBeacon()` (line 1114) - Remove after story branching

**To investigate**:
- WebSocket handlers for old mission commands (check `internal/server/ws.go`)
- Proto message types that trigger manual wave spawns

## Phase 2: Refactor Ambient Encounters to Respect Safe Ring

### Goal
Ambient encounters (random spawns near beacons) should spawn OUTSIDE the beacon safe zone, not directly on top of players.

### Implementation

**File**: `internal/game/beacons.go:639` (`spawnEncounterFromTemplate`)

**Current code**:
```go
center := d.beaconWorldPosition(beacon, r)
seed := beacon.Seed + int64(ruleIdx+1)*31 + int64(d.nextEncounterID+1)*17
entities := SpawnFromTemplate(r, template, center, seed)
```

**Change to**:
```go
center := d.beaconWorldPosition(beacon, r)
seed := beacon.Seed + int64(ruleIdx+1)*31 + int64(d.nextEncounterID+1)*17

// Build spawn context with safe ring around beacon
ctx := SpawnContext{
    Center:       center,
    SafeRadius:   beacon.Radius,           // Don't spawn inside beacon
    SpreadRadius: beacon.Radius * 3.0,     // Spread within 3x beacon radius
}
entities := SpawnFromTemplateWithContext(r, template, ctx, seed)
```

**Why this works**:
- `SpawnFromTemplateWithContext()` already exists (mission.go:102)
- Uses `adjustToAnnulus()` to push spawns into the ring [SafeRadius, SpreadRadius]
- Scales agro radius based on distance from center (closer = smaller agro)

### Testing
- Verify ambient encounters spawn outside beacon rings
- Confirm cooldowns and MaxConcurrency still work
- Check that entities don't spawn at world edges (clamping still applies)

## Phase 3: Replace Beacon Lock Wave Spawns with Story Branching

### Goal
When a beacon is locked, show dialogue with choices instead of auto-spawning missiles.

### Story Node Design

**File**: `internal/dag/story.go` (add to `SeedStoryNodes()`)

For each beacon lock (1-3), create TWO nodes: the dialogue choice and the outcomes.

#### Beacon 1 Lock - Example Structure

```go
// Beacon 1: Initial lock with choice
{
    ID:         "story.signal-static-1.beacon-1-lock",
    Kind:       NodeKindStory,
    Label:      "Beacon 1 Lock Response",
    DurationS:  999999,  // Wait for player choice
    Repeatable: false,
    Payload: map[string]string{
        "chapter": "signal-static-1",
        "node":    "beacon-1-lock",
        "beacon":  "1",
    },
    Requires: []NodeID{"story.signal-static-1.beacon-1"},
    Dialogue: &DialogueContent{
        Speaker: "BEACON SYSTEM",
        Text: `Beacon 1 locked. Triangulation grid stabilizing.

[The beacon's security protocols are active. You can attempt to bypass them peacefully, or force your way through.]`,
        Intent: "factory",
        Choices: []DialogueChoice{
            {ID: "friendly", Text: "Negotiate with the beacon's AI"},
            {ID: "hostile", Text: "Override security protocols by force"},
        },
    },
},

// Friendly outcome: Grant upgrade
{
    ID:         "story.signal-static-1.beacon-1-friendly",
    Kind:       NodeKindStory,
    Label:      "Beacon 1 Peaceful Resolution",
    DurationS:  999999,
    Repeatable: false,
    Payload: map[string]string{
        "chapter":        "signal-static-1",
        "node":           "beacon-1-friendly",
        "flag":           "beacon-1-friendly",
        "grant_upgrade":  "upgrade.missile.speed_1",  // First missile speed upgrade
    },
    Requires: []NodeID{"story.signal-static-1.beacon-1-lock"},
    Dialogue: &DialogueContent{
        Speaker: "BEACON AI",
        Text: `Access granted. Uploading tactical data to your systems.

[The beacon shares archived weapon schematics. Your missile systems have been enhanced.]

**Reward: Missile Speed Boost I unlocked**`,
        Intent:        "unit",
        ContinueLabel: "Accept Upgrade",
    },
},

// Hostile outcome: Spawn missiles
{
    ID:         "story.signal-static-1.beacon-1-hostile",
    Kind:       NodeKindStory,
    Label:      "Beacon 1 Forced Override",
    DurationS:  999999,
    Repeatable: false,
    Payload: map[string]string{
        "chapter":           "signal-static-1",
        "node":              "beacon-1-hostile",
        "flag":              "beacon-1-hostile",
        "spawn_encounter":   "true",
        "encounter_wave":    "1",     // Wave index to spawn
        "encounter_beacon":  "1",     // Which beacon triggered this
    },
    Requires: []NodeID{"story.signal-static-1.beacon-1-lock"},
    Dialogue: &DialogueContent{
        Speaker: "BEACON SYSTEM",
        Text: `WARNING: UNAUTHORIZED ACCESS DETECTED. DEPLOYING COUNTERMEASURES.

[The beacon's defenses activate. Hostile missiles are inbound.]`,
        Intent:        "factory",
        ContinueLabel: "Brace for Impact",
    },
},
```

**Repeat this pattern** for beacons 2 and 3 with:
- Beacon 2 friendly: `upgrade.missile.speed_2` or `upgrade.missile.heat_cap_1`
- Beacon 3 friendly: `upgrade.ship.speed_1` or `upgrade.ship.heat_cap_1`

### Backend Integration

#### Step 1: Modify lockBeacon() to Only Fire Story Event

**File**: `internal/game/beacons.go:1077-1118`

**Current problematic code** (lines 1111-1116):
```go
} else {
    // Launch campaign encounter tied to this beacon completion.
    nextWave := beacon.Ordinal + 1
    if nextWave >= 1 && nextWave <= 3 {
        d.launchEncounter(r, beacon.ID, nextWave)
    }
}
```

**Change to**:
```go
} else {
    // Story branching will handle encounters/rewards based on player choice
    // Fire beacon-lock story event instead of auto-spawning
    // (The existing story event at line 1098 will trigger the choice dialogue)
}
```

#### Step 2: Update Story Event Mapping

**File**: `internal/game/room.go:408` (`storyNodeForMissionEvent`)

**Current code**:
```go
func storyNodeForMissionEvent(event string, beaconIndex int) dag.NodeID {
    switch event {
    case "mission:start":
        return dag.NodeID("story.signal-static-1.start")
    case "mission:beacon-locked":
        switch beaconIndex {
        case 1:
            return dag.NodeID("story.signal-static-1.beacon-1")
        case 2:
            return dag.NodeID("story.signal-static-1.beacon-2")
        case 3:
            return dag.NodeID("story.signal-static-1.beacon-3")
        }
    case "mission:completed":
        return dag.NodeID("story.signal-static-1.complete")
    }
    return ""
}
```

**Change to**:
```go
func storyNodeForMissionEvent(event string, beaconIndex int) dag.NodeID {
    switch event {
    case "mission:start":
        return dag.NodeID("story.signal-static-1.start")
    case "mission:beacon-locked":
        switch beaconIndex {
        case 1:
            return dag.NodeID("story.signal-static-1.beacon-1-lock")  // Changed: now goes to choice
        case 2:
            return dag.NodeID("story.signal-static-1.beacon-2-lock")  // Changed
        case 3:
            return dag.NodeID("story.signal-static-1.beacon-3-lock")  // Changed
        }
    case "mission:completed":
        return dag.NodeID("story.signal-static-1.complete")
    }
    return ""
}
```

#### Step 3: Handle Player Choices in Story Acknowledgment

**File**: `internal/server/ws.go:1202` (`handleDagStoryAck`)

**Current code** (line 1223):
```go
if status == dag.StatusInProgress {
    if err := dag.Complete(graph, p.DagState, nodeID, effects); err != nil {
```

**Add choice handling BEFORE completing**:
```go
if status == dag.StatusInProgress {
    // Handle story branching based on player choice
    if msg.ChoiceId != "" {
        room.handleStoryChoiceBranching(p, nodeID, msg.ChoiceId, graph)
    }

    if err := dag.Complete(graph, p.DagState, nodeID, effects); err != nil {
```

**Add new method to Room** in `internal/game/room.go`:

```go
// handleStoryChoiceBranching activates the appropriate child node based on player choice.
func (r *Room) handleStoryChoiceBranching(p *Player, parentNodeID dag.NodeID, choiceID string, graph *dag.Graph) {
    // Map choice ID to the appropriate child node
    // Convention: parent node ID + "-" + choice ID
    childNodeID := dag.NodeID(string(parentNodeID) + "-" + choiceID)

    childNode := graph.GetNode(childNodeID)
    if childNode == nil {
        log.Printf("[story] No child node found for choice: %s -> %s", parentNodeID, choiceID)
        return
    }

    log.Printf("[story] Player %s chose %s, activating node %s", p.ID, choiceID, childNodeID)

    // Immediately start the chosen branch
    r.tryStartStoryNodeLocked(p, childNodeID)

    // Handle special effects based on node payload
    r.handleStoryNodeEffects(p, childNode)
}

// handleStoryNodeEffects processes special actions defined in node payload.
func (r *Room) handleStoryNodeEffects(p *Player, node *dag.Node) {
    if node == nil {
        return
    }

    // Grant upgrade if specified
    if upgradeID := node.Payload["grant_upgrade"]; upgradeID != "" {
        r.grantUpgradeToPlayer(p, dag.NodeID(upgradeID))
    }

    // Spawn encounter if specified
    if node.Payload["spawn_encounter"] == "true" {
        waveIndex := 0
        if waveStr := node.Payload["encounter_wave"]; waveStr != "" {
            if parsed, err := strconv.Atoi(waveStr); err == nil {
                waveIndex = parsed
            }
        }
        if waveIndex > 0 && r.missionDirector != nil {
            beaconID := node.Payload["encounter_beacon"]
            r.missionDirector.launchEncounter(r, beaconID, waveIndex)
        }
    }
}

// grantUpgradeToPlayer immediately unlocks a DAG upgrade node.
func (r *Room) grantUpgradeToPlayer(p *Player, upgradeNodeID dag.NodeID) {
    if p == nil {
        return
    }

    p.EnsureDagState()
    graph := dag.GetGraph()
    if graph == nil {
        log.Printf("[story] Cannot grant upgrade %s: no graph", upgradeNodeID)
        return
    }

    node := graph.GetNode(upgradeNodeID)
    if node == nil {
        log.Printf("[story] Cannot grant upgrade %s: node not found", upgradeNodeID)
        return
    }

    effects := NewRoomDagEffects(r, p)

    // Unlock by marking as available if requirements are met, or force-complete
    // For story rewards, we force-complete instantly
    if err := dag.Start(graph, p.DagState, upgradeNodeID, r.Now, effects); err != nil {
        log.Printf("[story] Failed to start upgrade %s: %v", upgradeNodeID, err)
        return
    }

    // Instantly complete the upgrade (duration = 0 for rewards)
    if err := dag.Complete(graph, p.DagState, upgradeNodeID, effects); err != nil {
        log.Printf("[story] Failed to complete upgrade %s: %v", upgradeNodeID, err)
        return
    }

    log.Printf("[story] Granted upgrade %s to player %s", upgradeNodeID, p.ID)
}
```

**Import addition needed** in `internal/game/room.go`:
```go
import (
    "strconv"  // Add this
    // ... existing imports
)
```

### Frontend Integration

**File**: `internal/server/web/src/story/mission1-content.ts`

Add dialogue content matching the backend nodes:

```typescript
export const MISSION_1_CONTENT: Record<string, DialogueContent> = {
  // ... existing nodes ...

  "story.signal-static-1.beacon-1-lock": {
    speaker: "BEACON SYSTEM",
    text: "Beacon 1 locked. Triangulation grid stabilizing.\n\n[The beacon's security protocols are active. You can attempt to bypass them peacefully, or force your way through.]",
    intent: "factory",
    typingSpeedMs: 18,
    choices: [
      { id: "friendly", text: "Negotiate with the beacon's AI" },
      { id: "hostile", text: "Override security protocols by force" },
    ],
  },

  "story.signal-static-1.beacon-1-friendly": {
    speaker: "BEACON AI",
    text: "Access granted. Uploading tactical data to your systems.\n\n[The beacon shares archived weapon schematics. Your missile systems have been enhanced.]\n\n**Reward: Missile Speed Boost I unlocked**",
    intent: "unit",
    typingSpeedMs: 18,
    continueLabel: "Accept Upgrade",
  },

  "story.signal-static-1.beacon-1-hostile": {
    speaker: "BEACON SYSTEM",
    text: "WARNING: UNAUTHORIZED ACCESS DETECTED. DEPLOYING COUNTERMEASURES.\n\n[The beacon's defenses activate. Hostile missiles are inbound.]",
    intent: "factory",
    typingSpeedMs: 18,
    continueLabel: "Brace for Impact",
  },

  // Repeat for beacon-2-lock, beacon-2-friendly, beacon-2-hostile
  // Repeat for beacon-3-lock, beacon-3-friendly, beacon-3-hostile
};
```

**File**: `internal/server/web/src/story/controller.ts`

The existing choice handling should already work - verify that:
1. When choices are present, the overlay shows buttons instead of continue
2. Clicking a choice sends `dag_story_ack` with the choice ID
3. The controller can handle multiple sequential story nodes (choice → outcome)

## Phase 4: Integrate Upgrade Rewards

### Mechanism

**Already implemented** via the approach above:
1. Node payload includes `"grant_upgrade": "upgrade.missile.speed_1"`
2. `handleStoryNodeEffects()` calls `grantUpgradeToPlayer()`
3. `grantUpgradeToPlayer()` uses `dag.Start()` + `dag.Complete()` to instantly unlock
4. Existing `UpgradeEffect` system applies the stat changes (see `internal/dag/upgrades.go`)

### Upgrade Selection

**Recommended progression**:
- **Beacon 1 friendly**: `upgrade.missile.speed_1` (10% missile speed)
- **Beacon 2 friendly**: `upgrade.missile.heat_cap_1` (10% missile heat capacity)
- **Beacon 3 friendly**: `upgrade.ship.speed_1` (10% ship speed)

**Rationale**:
- Missile upgrades first (teaches combat mechanics)
- Ship speed last (rewards mastery)
- Incremental 10% boosts feel meaningful but not overpowered

### Verification

1. Check that upgrade appears in player's DAG state immediately
2. Verify stats update on next missile launch / ship movement
3. Confirm frontend DAG UI shows upgrade as completed
4. Test that upgrade persists across reconnects (room lifetime only, no persistence yet)

## Phase 5: Spawn Missiles on Hostile Branch

### Mechanism

**Already implemented** via `handleStoryNodeEffects()`:
1. Node payload includes `"spawn_encounter": "true"`, `"encounter_wave": "1"`, `"encounter_beacon": "1"`
2. Calls `r.missionDirector.launchEncounter(r, beaconID, waveIndex)`
3. `launchEncounter()` already uses `SpawnMissionWaveWithContext()` (line 1146)
4. Annulus spawning is already applied (no spawns inside beacon ring)

### Wave Mapping

**Current mapping** (mission.go:10-14):
```go
var waveEncounterMap = map[int]string{
    1: "minefield-basic",
    2: "mixed-hazard",
    3: "seeker-swarm",
}
```

**Keep this mapping** - it's appropriate:
- Wave 1 (beacon 1): Static mines (easiest)
- Wave 2 (beacon 2): Mixed mines + seekers (medium)
- Wave 3 (beacon 3): Pure seekers (hardest)

### Cooldown Handling

The existing `SetMissionWaveSpawnedLocked()` (room.go:191) prevents duplicate spawns:
- Returns `false` if wave already spawned
- `launchEncounter()` respects this (line 1135-1137)
- **Issue**: If player chooses friendly, then visits another beacon and chooses hostile, waves could be out of order
- **Solution**: Story flags prevent replaying beacon locks, so this shouldn't happen in practice

## Phase 6: Clean Up Legacy Code

### Safe to Remove

**File**: `internal/game/mission.go`

```go
// REMOVE: SpawnMissionWave (line 442-458)
// Reason: All callers should use SpawnMissionWaveWithContext
func (r *Room) SpawnMissionWave(waveIndex int, beacons []Vec2) []EntityID {
    // ... delete entire function
}
```

**File**: `internal/game/beacons.go`

```go
// REMOVE: TriggerEncounterForWaveLocked (line 1122-1132)
// Reason: Legacy client command, replaced by story system
func (d *BeaconDirector) TriggerEncounterForWaveLocked(r *Room, waveIndex int) {
    // ... delete entire function
}
```

**File**: `internal/game/beacons.go:1111-1116` (in lockBeacon)

```go
// REMOVE: Auto-spawn logic
} else {
    // Launch campaign encounter tied to this beacon completion.
    nextWave := beacon.Ordinal + 1
    if nextWave >= 1 && nextWave <= 3 {
        d.launchEncounter(r, beacon.ID, nextWave)
    }
}
// Replace with: (nothing - story handles it)
```

### Investigate Before Removing

**WebSocket handlers** in `internal/server/ws.go`:
- Search for handlers that call `TriggerEncounterForWaveLocked()`
- If found, check if any clients still use those messages
- Consider deprecation warning before removal

**Proto messages**:
- Check `proto/ws_messages.proto` for mission-related commands
- May have `trigger_wave` or similar - safe to deprecate if unused

### Keep (Don't Remove)

- `launchEncounter()` - Still needed for hostile branch spawns
- `SpawnMissionWaveWithContext()` - Core spawning mechanism
- `waveEncounterMap` - Used by wave spawns
- `SpawnFromTemplateWithContext()` - Used by ambient encounters

## Phase 7: Validation & Testing

### Unit Tests

**File**: `internal/game/mission_test.go`

Add tests for annulus spawning:
```go
func TestSpawnFromTemplateWithContext_RespectsAnnulus(t *testing.T) {
    // Test that entities spawn outside safe radius
    // Test that entities spawn within spread radius
    // Test that agro scales with distance
}
```

**File**: `internal/game/beacons_test.go` (create if needed)

Add tests for ambient encounters:
```go
func TestCheckEncounterSpawns_UsesAnnulusPlacement(t *testing.T) {
    // Test that ambient encounters don't spawn on top of beacons
}
```

### Story System Tests

**File**: `internal/game/room_test.go`

Add tests for branching:
```go
func TestStoryChoiceBranching_GrantsUpgrade(t *testing.T) {
    // Mock player, room, beacon lock
    // Simulate friendly choice
    // Verify upgrade unlocked
}

func TestStoryChoiceBranching_SpawnsEncounter(t *testing.T) {
    // Mock player, room, beacon lock
    // Simulate hostile choice
    // Verify entities spawned outside beacon ring
}
```

### Manual Playtest Checklist

**Ambient Encounters**:
- [ ] Start campaign mission
- [ ] Discover a beacon
- [ ] Wait for ambient encounter spawn
- [ ] Verify missiles spawn OUTSIDE beacon ring (not on top of player)
- [ ] Verify cooldowns prevent spam spawns

**Beacon Lock Dialogue**:
- [ ] Lock beacon 1
- [ ] Verify dialogue appears with two choices
- [ ] Choose "friendly" path
- [ ] Verify upgrade granted message
- [ ] Check DAG UI shows upgrade unlocked
- [ ] Verify no missiles spawn

**Hostile Path**:
- [ ] Start fresh mission
- [ ] Lock beacon 1
- [ ] Choose "hostile" path
- [ ] Verify warning message appears
- [ ] Verify missiles spawn OUTSIDE beacon ring
- [ ] Verify missiles attack player
- [ ] Verify no upgrade granted

**Wave Progression**:
- [ ] Complete beacons 1, 2, 3 with mixed choices
- [ ] Verify appropriate encounter types spawn (mines, mixed, seekers)
- [ ] Verify no duplicate spawns

**Edge Cases**:
- [ ] Test reconnect during dialogue (should preserve state)
- [ ] Test bot players (should skip story, no crashes)
- [ ] Test completing mission with all friendly choices (no combat)
- [ ] Test completing mission with all hostile choices (max combat)

### Performance & Build

```bash
# Format code
go fmt ./...

# Run tests
go test ./internal/game/... -v

# Build TypeScript
go generate ./internal/server

# Build binary
go build -o LightSpeedDuel

# Run locally
./LightSpeedDuel -addr :8080
```

Open `http://localhost:8080/?room=test-beacons&mode=campaign` and test manually.

## Implementation Order

1. **Phase 2** (Ambient encounters annulus) - Standalone, low risk
2. **Phase 3** (Story nodes + backend branching) - Core refactor
3. **Phase 3** (Frontend dialogue content) - Required for testing
4. **Phase 4** (Upgrade rewards) - Builds on phase 3
5. **Phase 5** (Hostile spawns) - Builds on phase 3
6. **Phase 6** (Cleanup) - Only after all features verified working
7. **Phase 7** (Tests + validation) - Continuous throughout

## Success Criteria

- ✅ Ambient encounters never spawn inside beacon safe zones
- ✅ Beacon locks show dialogue with meaningful choices
- ✅ Friendly path grants upgrades (no combat)
- ✅ Hostile path spawns missiles outside safe zone
- ✅ No legacy auto-spawn code remains
- ✅ All tests pass
- ✅ Manual playtest checklist 100% complete
- ✅ No regressions in existing campaign flow

## Notes

- **Story flag persistence**: Player choices stored as flags like `beacon-1-friendly` or `beacon-1-hostile`
- **Multiplayer**: Each player gets independent story branches (server-authoritative per-player state)
- **Replay prevention**: Story nodes are `Repeatable: false`, so players can't farm upgrades
- **Balance**: Players who choose all friendly paths get 3 upgrades but miss combat practice
- **Balance**: Players who choose all hostile paths get combat XP but no early upgrades
- **Future**: Could add story flag checks for future missions ("You helped the beacons" vs "You fought the beacons")
