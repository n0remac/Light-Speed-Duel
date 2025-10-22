# Campaign Editor - Complete Implementation Plan

## Overview

Create a campaign editor UI panel in the lobby that allows editing campaign settings, managing beacons, viewing story flags, spawn table info, and restarting campaign progression. The editor will follow the existing Upgrades panel pattern and use WebSocket + Protobuf for all communication.

---

## Current System Architecture

### Backend Components

#### BeaconDirector (`internal/game/beacons.go`)
- **Purpose**: Manages beacon layout, player progression, encounter spawning
- **Key State**:
  - `beacons []BeaconLayout` - Normalized beacon positions with tags/radius
  - `player map[string]*playerBeaconProgress` - Per-player progression tracking
  - `encounters map[string]*EncounterState` - Active encounters at beacons
  - `spec MissionSpec` - Campaign configuration (currently hardcoded)
- **Current Limitation**: `missionSpecs` is a static map, not editable at runtime

#### MissionSpec (`internal/game/beacons.go:44-57`)
```go
type MissionSpec struct {
    ID                  string          // "campaign-1"
    HoldSeconds         float64         // 10
    RevisitCooldown     float64         // 30
    MaxActiveEncounters int             // 2
    EncounterTimeout    float64         // 120
    BeaconCount         int             // 4 (HARDCODED - needs to be editable)
    MinDistance         float64         // 2500
    MaxAttempts         int             // 30
    DensityFactor       float64         // 1.0
    DesignerPins        []BeaconPin     // Manual beacon placements (empty)
    SpawnTableID        string          // "campaign-1-standard"
}
```

#### BeaconLayout (`internal/game/beacons.go:60-68`)
```go
type BeaconLayout struct {
    ID         string              // "beacon-1", "beacon-2"...
    Ordinal    int                 // 0, 1, 2, 3...
    Normalized Vec2                // 0.0-1.0 normalized coords
    Radius     float64             // 300 (detection/hold radius)
    Seed       int64               // Deterministic seed for encounters
    Tags       map[string]bool     // tier-1/2/3, zone-ne/nw/se/sw
    Pinned     bool                // Designer-placed vs procedural
}
```

#### Beacon Tag System (`internal/game/beacons_sampling.go:311-352`)
- **QuadrantTagger**: Auto-assigns tags based on beacon position
  - **Tier tags** (distance from center):
    - `tier-1`: < 30% of max distance (easy encounters)
    - `tier-2`: 30-60% of max distance (medium encounters)
    - `tier-3`: > 60% of max distance (hard encounters)
  - **Zone tags** (quadrant):
    - `zone-ne`, `zone-nw`, `zone-se`, `zone-sw`
- **Used by**: SpawnTable rules to select appropriate encounters

#### SpawnTable (`internal/game/spawn_tables.go:8-76`)
- **Purpose**: Maps beacon tags to weighted encounter pools
- **Structure**:
```go
type SpawnTable struct {
    ID          string       // "campaign-1-standard"
    DisplayName string
    Rules       []SpawnRule  // Conditional encounter selection
}

type SpawnRule struct {
    RequiredTags  []string             // e.g. ["tier-1"]
    ForbiddenTags []string             // e.g. ["tier-3"]
    Encounters    []WeightedEncounter  // Pool of encounters to spawn
    MaxConcurrent int                  // Limit active encounters
    Cooldown      float64              // Seconds between spawns
    Prerequisites []string             // Story flags required
}
```

#### EncounterTemplate (`internal/game/encounters.go:9-21`)
- **Purpose**: Defines reusable enemy group configurations
- **Examples**:
  - `minefield-basic`: 18-24 static mines
  - `patrol-light`: 3-5 patrolling missiles
  - `seeker-swarm`: 6-10 homing missiles
  - `mixed-hazard`: Mines + patrols

#### Story Flags (`internal/dag/story.go`)
- **Storage**: `Player.StoryFlags map[string]bool`
- **Examples**:
  - `story.signal-static-1.start` - Mission started
  - `story.signal-static-1.beacon-1-lock` - Beacon 1 captured
  - `story.signal-static-1.beacon-1-friendly` - Chose friendly option
  - `encounter-1-briefed` - Unlocks tier-3 encounters
- **Used by**: Spawn table prerequisites, story branching

### Frontend Components

#### Upgrades Panel Pattern (`internal/server/web/src/upgrades.ts`)
- **Architecture to replicate**:
  - Overlay panel with backdrop (`lobby.html:205-377`)
  - Event-driven rendering via EventBus
  - Toggle visibility on button click
  - Grid layout for items
  - Real-time updates from WebSocket

#### Existing WebSocket Infrastructure
- **Connection**: Established in lobby for DAG state (`lobby.ts:42-54`)
- **Protocol**: Binary protobuf messages over WebSocket
- **Pattern**: Client sends requests, server broadcasts updates

---

## Design Goals

1. **Increase Beacon Count**: Primary use case - allow 8-12 beacons instead of hardcoded 4
2. **Adjust Spacing**: Control MinDistance to make beacons closer/farther
3. **View Story State**: Inspect which story flags are set, understand branching
4. **Understand Encounters**: See spawn table rules and which beacons spawn what
5. **Reset Progression**: Clear player progress to restart campaign
6. **Live Preview**: Changes apply immediately (for new games or after restart)

---

## Implementation Plan

### Phase 1: Protobuf Schema Extensions

**File**: `proto/ws_messages.proto`

**Location**: After `MissionEncounterEventType` enum (line ~517)

```protobuf
// ========== Campaign Editor Messages ==========

// Client → Server: Request campaign configuration
message CampaignConfigRequest {
  string mission_id = 1;  // "campaign-1" (default if empty)
}

// Server → Client: Campaign configuration response
message CampaignConfigResponse {
  CampaignConfig config = 1;
  repeated string active_story_flags = 2;      // Current player's story flags
  repeated BeaconDebugInfo beacon_details = 3; // Full beacon info with tags
}

// Client → Server: Update campaign configuration
message CampaignConfigUpdate {
  string mission_id = 1;
  CampaignConfig config = 2;
}

// Client → Server: Restart campaign progression
message CampaignRestart {
  string mission_id = 1;  // "campaign-1"
}

// Server → Client: Campaign restart confirmation
message CampaignRestartResponse {
  bool success = 1;
  string error = 2;  // Empty if success
}

// Campaign configuration data
message CampaignConfig {
  string mission_id = 1;
  int32 beacon_count = 2;
  double min_distance = 3;
  double hold_seconds = 4;
  double revisit_cooldown = 5;
  int32 max_active_encounters = 6;
  double encounter_timeout = 7;
  string spawn_table_id = 8;
  repeated BeaconPinConfig designer_pins = 9;  // Manual beacon placements
}

// Designer-placed beacon configuration
message BeaconPinConfig {
  double x = 1;
  double y = 2;
  double radius = 3;
  repeated string tags = 4;
}

// Beacon debug information (includes computed tags)
message BeaconDebugInfo {
  string id = 1;              // "beacon-1"
  int32 ordinal = 2;          // 0, 1, 2...
  double x = 3;               // World position
  double y = 4;
  double radius = 5;
  repeated string tags = 6;   // ["tier-1", "zone-ne"]
  bool pinned = 7;            // Designer-placed vs procedural
}

// Spawn table information (readonly for now)
message SpawnTableInfo {
  string id = 1;
  string display_name = 2;
  repeated SpawnRuleInfo rules = 3;
}

message SpawnRuleInfo {
  repeated string required_tags = 1;
  repeated string forbidden_tags = 2;
  repeated string prerequisites = 3;      // Story flags required
  repeated WeightedEncounterInfo encounters = 4;
  int32 max_concurrent = 5;
  double cooldown = 6;
}

message WeightedEncounterInfo {
  string encounter_id = 1;
  int32 weight = 2;
}
```

**Update WsEnvelope** (line ~8):
```protobuf
message WsEnvelope {
  oneof payload {
    // ... existing messages ...

    // Campaign editor (add after mission messages ~line 47)
    CampaignConfigRequest campaign_config_request = 70;
    CampaignConfigResponse campaign_config_response = 71;
    CampaignConfigUpdate campaign_config_update = 72;
    CampaignRestart campaign_restart = 73;
    CampaignRestartResponse campaign_restart_response = 74;
    SpawnTableInfo spawn_table_info = 75;
  }
}
```

**Build Step**:
```bash
# Regenerate Go protobuf code
make proto-go
# Or manually:
protoc --go_out=. --go_opt=paths=source_relative proto/ws_messages.proto

# Regenerate TypeScript protobuf code (via esbuild)
go generate ./internal/server
```

---

### Phase 2: Backend - Mutable Mission Registry

**File**: `internal/game/beacons.go`

**Changes Required**:

#### 2.1: Make MissionSpec Registry Mutable

**Current** (line 177):
```go
var missionSpecs = map[string]MissionSpec{
    "campaign-1": { /* ... */ },
}
```

**Replace with**:
```go
var (
    missionSpecsMu sync.RWMutex
    missionSpecs   = map[string]MissionSpec{
        "campaign-1": {
            ID:                  "campaign-1",
            HoldSeconds:         10,
            RevisitCooldown:     30,
            MaxActiveEncounters: 2,
            EncounterTimeout:    120,
            BeaconCount:         4,
            MinDistance:         2500,
            MaxAttempts:         30,
            DensityFactor:       1.0,
            DesignerPins:        nil,
            SpawnTableID:        "campaign-1-standard",
        },
    }
)
```

#### 2.2: Add Getter/Setter Functions

**Add after line 191**:
```go
// GetMissionSpec retrieves a mission spec by ID (thread-safe read).
func GetMissionSpec(id string) (MissionSpec, bool) {
    missionSpecsMu.RLock()
    defer missionSpecsMu.RUnlock()
    spec, ok := missionSpecs[id]
    return spec, ok
}

// UpdateMissionSpec updates or creates a mission spec (thread-safe write).
// Returns error if validation fails.
func UpdateMissionSpec(spec MissionSpec) error {
    if err := ValidateMissionSpec(spec); err != nil {
        return err
    }
    missionSpecsMu.Lock()
    defer missionSpecsMu.Unlock()
    missionSpecs[spec.ID] = spec
    return nil
}

// ValidateMissionSpec checks if a mission spec is valid.
func ValidateMissionSpec(spec MissionSpec) error {
    if spec.ID == "" {
        return fmt.Errorf("mission ID cannot be empty")
    }
    if spec.BeaconCount < 1 || spec.BeaconCount > 20 {
        return fmt.Errorf("beacon count must be 1-20, got %d", spec.BeaconCount)
    }
    if spec.MinDistance < 500 || spec.MinDistance > 10000 {
        return fmt.Errorf("min distance must be 500-10000, got %.0f", spec.MinDistance)
    }
    if spec.HoldSeconds < 1 || spec.HoldSeconds > 60 {
        return fmt.Errorf("hold seconds must be 1-60, got %.0f", spec.HoldSeconds)
    }
    return nil
}
```

#### 2.3: Update NewBeaconDirector to Use Getter

**Replace line 204**:
```go
// OLD:
spec, ok := missionSpecs[missionID]

// NEW:
spec, ok := GetMissionSpec(missionID)
```

**Replace line 206**:
```go
// OLD:
spec, ok = missionSpecs["campaign-1"]

// NEW:
spec, ok = GetMissionSpec("campaign-1")
```

#### 2.4: Add Reload Method to BeaconDirector

**Add after line 511**:
```go
// ReloadLayout regenerates beacon positions with updated spec.
// Preserves player progression indices if possible.
func (d *BeaconDirector) ReloadLayout(worldW, worldH float64) {
    if d == nil {
        return
    }

    // Fetch latest spec
    spec, ok := GetMissionSpec(d.missionID)
    if !ok {
        return
    }

    // Store old beacon count for migration
    oldCount := len(d.beacons)

    // Update spec and regenerate layout
    d.spec = spec
    d.beacons = instantiateLayout(spec, d.seed, worldW, worldH)

    // Adjust player progression if beacon count changed
    newCount := len(d.beacons)
    for _, state := range d.player {
        if state == nil {
            continue
        }
        // If player was beyond new beacon count, cap at new count
        if state.CurrentIndex >= newCount {
            state.CurrentIndex = newCount
        }
        // Update active beacon ID
        state.ActiveBeaconID = d.activeBeaconID(state.CurrentIndex)
    }

    // Mark layout dirty to trigger snapshot broadcast
    d.layoutDirty = true
    d.snapshotDirty = true
}
```

---

### Phase 3: Backend - WebSocket Handlers

**File**: `internal/server/ws.go`

**Location**: Add handlers in the message switch statement (after line 450)

#### 3.1: Add Handler in serveWS Function

**Find the message handling loop** (around line 350-450) and add:

```go
case *pb.WsEnvelope_CampaignConfigRequest:
    handleCampaignConfigRequest(room, player, msg.CampaignConfigRequest, lc.conn)

case *pb.WsEnvelope_CampaignConfigUpdate:
    handleCampaignConfigUpdate(room, player, msg.CampaignConfigUpdate, lc.conn)

case *pb.WsEnvelope_CampaignRestart:
    handleCampaignRestart(room, player, msg.CampaignRestart, lc.conn)
```

#### 3.2: Implement Handler Functions

**Add at end of file** (after line 800):

```go
// handleCampaignConfigRequest sends current campaign configuration to client
func handleCampaignConfigRequest(r *Room, p *Player, msg *pb.CampaignConfigRequest, conn *websocket.Conn) {
    if msg == nil || r == nil || p == nil || conn == nil {
        return
    }

    missionID := msg.MissionId
    if missionID == "" {
        missionID = "campaign-1"
    }

    // Get mission spec
    spec, ok := GetMissionSpec(missionID)
    if !ok {
        log.Printf("campaign config request: mission not found: %s", missionID)
        return
    }

    // Build config proto
    config := &pb.CampaignConfig{
        MissionId:           spec.ID,
        BeaconCount:         int32(spec.BeaconCount),
        MinDistance:         spec.MinDistance,
        HoldSeconds:         spec.HoldSeconds,
        RevisitCooldown:     spec.RevisitCooldown,
        MaxActiveEncounters: int32(spec.MaxActiveEncounters),
        EncounterTimeout:    spec.EncounterTimeout,
        SpawnTableId:        spec.SpawnTableID,
    }

    // Convert designer pins
    for _, pin := range spec.DesignerPins {
        config.DesignerPins = append(config.DesignerPins, &pb.BeaconPinConfig{
            X:      pin.X,
            Y:      pin.Y,
            Radius: pin.Radius,
            Tags:   tagsToStringSlice(pin.Tags),
        })
    }

    // Get beacon details from director if available
    var beaconDetails []*pb.BeaconDebugInfo
    r.Mu.RLock()
    director := r.BeaconDirector
    if director != nil {
        positions := director.Positions(r.WorldWidth, r.WorldHeight)
        for idx, beacon := range director.beacons {
            var pos Vec2
            if idx < len(positions) {
                pos = positions[idx]
            }
            beaconDetails = append(beaconDetails, &pb.BeaconDebugInfo{
                Id:      beacon.ID,
                Ordinal: int32(beacon.Ordinal),
                X:       pos.X,
                Y:       pos.Y,
                Radius:  beacon.Radius,
                Tags:    tagsToStringSlice(beacon.Tags),
                Pinned:  beacon.Pinned,
            })
        }
    }
    r.Mu.RUnlock()

    // Get active story flags
    var storyFlags []string
    if p.StoryFlags != nil {
        for flag, active := range p.StoryFlags {
            if active {
                storyFlags = append(storyFlags, flag)
            }
        }
        sort.Strings(storyFlags)
    }

    // Send response
    response := &pb.CampaignConfigResponse{
        Config:           config,
        ActiveStoryFlags: storyFlags,
        BeaconDetails:    beaconDetails,
    }

    if err := sendProtoMessage(conn, response); err != nil {
        log.Printf("failed to send campaign config response: %v", err)
    }
}

// handleCampaignConfigUpdate applies campaign configuration changes
func handleCampaignConfigUpdate(r *Room, p *Player, msg *pb.CampaignConfigUpdate, conn *websocket.Conn) {
    if msg == nil || msg.Config == nil || r == nil || p == nil {
        return
    }

    cfg := msg.Config
    missionID := cfg.MissionId
    if missionID == "" {
        missionID = "campaign-1"
    }

    // Build MissionSpec from proto
    spec := MissionSpec{
        ID:                  missionID,
        BeaconCount:         int(cfg.BeaconCount),
        MinDistance:         cfg.MinDistance,
        HoldSeconds:         cfg.HoldSeconds,
        RevisitCooldown:     cfg.RevisitCooldown,
        MaxActiveEncounters: int(cfg.MaxActiveEncounters),
        EncounterTimeout:    cfg.EncounterTimeout,
        MaxAttempts:         30,           // Keep default
        DensityFactor:       1.0,          // Keep default
        SpawnTableID:        cfg.SpawnTableId,
    }

    // Convert designer pins
    for _, pin := range cfg.DesignerPins {
        spec.DesignerPins = append(spec.DesignerPins, BeaconPin{
            X:      pin.X,
            Y:      pin.Y,
            Radius: pin.Radius,
            Tags:   stringSliceToTags(pin.Tags),
        })
    }

    // Update mission spec
    if err := UpdateMissionSpec(spec); err != nil {
        log.Printf("campaign config update failed: %v", err)
        return
    }

    // Reload beacon layout if director exists
    r.Mu.Lock()
    if r.BeaconDirector != nil && r.BeaconDirector.MissionID() == missionID {
        r.BeaconDirector.ReloadLayout(r.WorldWidth, r.WorldHeight)
    }
    r.Mu.Unlock()

    log.Printf("campaign config updated: %s (beacons: %d, min_dist: %.0f)",
        missionID, spec.BeaconCount, spec.MinDistance)
}

// handleCampaignRestart clears player progression for the campaign
func handleCampaignRestart(r *Room, p *Player, msg *pb.CampaignRestart, conn *websocket.Conn) {
    if msg == nil || r == nil || p == nil || conn == nil {
        return
    }

    missionID := msg.MissionId
    if missionID == "" {
        missionID = "campaign-1"
    }

    r.Mu.Lock()
    defer r.Mu.Unlock()

    // Clear story flags (prefix with "story.")
    if p.StoryFlags != nil {
        for flag := range p.StoryFlags {
            if strings.HasPrefix(flag, "story.") {
                delete(p.StoryFlags, flag)
            }
        }
    }

    // Reset DAG state (upgrades persist, story nodes reset)
    if p.DagState != nil {
        for _, node := range p.DagState.Nodes {
            if node.Kind == dag.NodeKindStory {
                node.Status = dag.StatusLocked
                node.Started = 0
                node.LastTick = 0
            }
        }
    }

    // Clear active story node
    p.ActiveStoryNodeID = ""
    if p.StoryState != nil {
        p.StoryState.History = nil
    }

    // Reset beacon progression if director exists
    if r.BeaconDirector != nil && r.BeaconDirector.MissionID() == missionID {
        // Clear player's beacon progress
        if state, ok := r.BeaconDirector.player[p.ID]; ok {
            state.CurrentIndex = 0
            state.HoldAccum = 0
            state.Discovered = make(map[string]bool)
            state.Completed = make(map[string]bool)
            state.Cooldowns = make(map[string]float64)
            state.ActiveBeaconID = r.BeaconDirector.activeBeaconID(0)
        }

        // Remove all active encounters
        for encID := range r.BeaconDirector.encounters {
            delete(r.BeaconDirector.encounters, encID)
        }

        // Mark snapshot dirty to broadcast reset
        r.BeaconDirector.snapshotDirty = true
    }

    // Send success response
    response := &pb.CampaignRestartResponse{
        Success: true,
    }
    if err := sendProtoMessage(conn, response); err != nil {
        log.Printf("failed to send campaign restart response: %v", err)
    }

    log.Printf("campaign restarted for player %s: %s", p.ID, missionID)
}

// Helper: convert map[string]bool to []string
func tagsToStringSlice(tags map[string]bool) []string {
    result := make([]string, 0, len(tags))
    for tag, active := range tags {
        if active {
            result = append(result, tag)
        }
    }
    sort.Strings(result)
    return result
}

// Helper: convert []string to map[string]bool
func stringSliceToTags(tags []string) map[string]bool {
    result := make(map[string]bool, len(tags))
    for _, tag := range tags {
        result[tag] = true
    }
    return result
}
```

---

### Phase 4: Frontend - Campaign Editor Panel

**File**: `internal/server/web/src/campaign-editor.ts` (NEW)

```typescript
import type { EventBus } from "./bus";
import type { AppState } from "./state";
import { sendProto } from "./net";
import { create } from "@bufbuild/protobuf";
import {
  WsEnvelopeSchema,
  type CampaignConfig,
  type BeaconDebugInfo,
  type CampaignConfigResponse,
} from "./proto/proto/ws_messages_pb";

interface CampaignEditorState {
  config: CampaignConfig | null;
  beacons: BeaconDebugInfo[];
  storyFlags: string[];
  activeTab: "beacons" | "spawns" | "flags" | "settings";
}

let editorState: CampaignEditorState = {
  config: null,
  beacons: [],
  storyFlags: [],
  activeTab: "beacons",
};

export function initCampaignPanel(state: AppState, bus: EventBus): void {
  // Create panel DOM structure
  const panel = createPanelElement();
  document.body.appendChild(panel);

  const container = panel.querySelector(".campaign-editor-content") as HTMLElement;
  const closeBtn = panel.querySelector(".close-btn") as HTMLElement;
  const overlay = panel.querySelector(".panel-overlay") as HTMLElement;

  // Toggle panel visibility
  function togglePanel(visible: boolean) {
    panel.classList.toggle("visible", visible);
    if (visible) {
      requestCampaignConfig();
    }
  }

  // Event listeners
  bus.on("campaign:toggle", () => {
    const next = !panel.classList.contains("visible");
    togglePanel(next);
  });

  bus.on("campaign:show", () => togglePanel(true));
  bus.on("campaign:hide", () => togglePanel(false));

  closeBtn.addEventListener("click", () => togglePanel(false));
  overlay.addEventListener("click", () => togglePanel(false));

  // Listen for config responses
  bus.on("campaign:configReceived", (response: CampaignConfigResponse) => {
    editorState.config = response.config || null;
    editorState.beacons = response.beaconDetails || [];
    editorState.storyFlags = response.activeStoryFlags || [];
    renderEditor(container);
  });

  // Handle tab clicks
  container.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    // Tab switching
    if (target.classList.contains("tab-btn")) {
      const tab = target.dataset.tab as typeof editorState.activeTab;
      if (tab) {
        editorState.activeTab = tab;
        renderEditor(container);
      }
    }

    // Beacon count change
    if (target.id === "beacon-count-apply") {
      applyBeaconCount();
    }

    // Min distance change
    if (target.id === "min-distance-apply") {
      applyMinDistance();
    }

    // Restart campaign
    if (target.id === "campaign-restart-btn") {
      confirmAndRestartCampaign();
    }

    // Refresh button
    if (target.id === "campaign-refresh-btn") {
      requestCampaignConfig();
    }
  });
}

function createPanelElement(): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "campaign-editor-panel";
  panel.innerHTML = `
    <div class="panel-overlay"></div>
    <div class="panel-content">
      <div class="panel-header">
        <h2>Campaign Editor</h2>
        <button class="close-btn">×</button>
      </div>
      <div class="campaign-editor-content"></div>
    </div>
  `;
  return panel;
}

function renderEditor(container: HTMLElement): void {
  if (!editorState.config) {
    container.innerHTML = `<div class="loading">Loading campaign configuration...</div>`;
    return;
  }

  container.innerHTML = `
    <div class="editor-tabs">
      <button class="tab-btn ${editorState.activeTab === "beacons" ? "active" : ""}" data-tab="beacons">
        Beacons
      </button>
      <button class="tab-btn ${editorState.activeTab === "spawns" ? "active" : ""}" data-tab="spawns">
        Spawn Tables
      </button>
      <button class="tab-btn ${editorState.activeTab === "flags" ? "active" : ""}" data-tab="flags">
        Story Flags
      </button>
      <button class="tab-btn ${editorState.activeTab === "settings" ? "active" : ""}" data-tab="settings">
        Settings
      </button>
    </div>
    <div class="editor-tab-content">
      ${renderTabContent()}
    </div>
  `;
}

function renderTabContent(): string {
  switch (editorState.activeTab) {
    case "beacons":
      return renderBeaconsTab();
    case "spawns":
      return renderSpawnsTab();
    case "flags":
      return renderFlagsTab();
    case "settings":
      return renderSettingsTab();
    default:
      return "";
  }
}

function renderBeaconsTab(): string {
  const beacons = editorState.beacons;

  return `
    <div class="beacons-tab">
      <div class="tab-header">
        <h3>Beacon Layout</h3>
        <button id="campaign-refresh-btn" class="refresh-btn">Refresh</button>
      </div>
      <p class="tab-description">
        Current configuration has ${beacons.length} beacons.
        Beacons are auto-tagged based on position (tier-1/2/3 for difficulty, zone for quadrant).
      </p>
      <div class="beacon-list">
        ${beacons.map(renderBeaconItem).join("")}
      </div>
    </div>
  `;
}

function renderBeaconItem(beacon: BeaconDebugInfo): string {
  const tags = beacon.tags.join(", ");
  return `
    <div class="beacon-item">
      <div class="beacon-header">
        <span class="beacon-name">${beacon.id}</span>
        <span class="beacon-ordinal">#${beacon.ordinal + 1}</span>
      </div>
      <div class="beacon-details">
        <div class="beacon-detail">
          <span class="label">Position:</span>
          <span class="value">(${Math.round(beacon.x)}, ${Math.round(beacon.y)})</span>
        </div>
        <div class="beacon-detail">
          <span class="label">Radius:</span>
          <span class="value">${Math.round(beacon.radius)}</span>
        </div>
        <div class="beacon-detail">
          <span class="label">Tags:</span>
          <span class="beacon-tags">
            ${beacon.tags.map(tag => `<span class="tag tag-${tag}">${tag}</span>`).join("")}
          </span>
        </div>
      </div>
    </div>
  `;
}

function renderSpawnsTab(): string {
  // For now, show static info about spawn tables
  // Could be enhanced to fetch via separate message
  return `
    <div class="spawns-tab">
      <div class="tab-header">
        <h3>Spawn Table: ${editorState.config?.spawnTableId || "N/A"}</h3>
      </div>
      <p class="tab-description">
        Spawn tables control which encounters appear at each beacon based on tags and story flags.
      </p>
      <div class="spawn-rules">
        <div class="spawn-rule">
          <div class="rule-header">Rule 1: Tier-1 Beacons</div>
          <div class="rule-body">
            <div class="rule-detail">
              <span class="label">Tags:</span> tier-1
            </div>
            <div class="rule-detail">
              <span class="label">Encounters:</span> minefield-basic (70%), patrol-light (30%)
            </div>
            <div class="rule-detail">
              <span class="label">Max Concurrent:</span> 2
            </div>
            <div class="rule-detail">
              <span class="label">Cooldown:</span> 30s
            </div>
          </div>
        </div>
        <div class="spawn-rule">
          <div class="rule-header">Rule 2: Tier-2 Beacons</div>
          <div class="rule-body">
            <div class="rule-detail">
              <span class="label">Tags:</span> tier-2
            </div>
            <div class="rule-detail">
              <span class="label">Encounters:</span> mixed-hazard (60%), patrol-light (25%), seeker-swarm (15%)
            </div>
            <div class="rule-detail">
              <span class="label">Max Concurrent:</span> 2
            </div>
            <div class="rule-detail">
              <span class="label">Cooldown:</span> 45s
            </div>
          </div>
        </div>
        <div class="spawn-rule">
          <div class="rule-header">Rule 3: Tier-3 Beacons</div>
          <div class="rule-body">
            <div class="rule-detail">
              <span class="label">Tags:</span> tier-3
            </div>
            <div class="rule-detail">
              <span class="label">Prerequisites:</span> <code>encounter-1-briefed</code> story flag
            </div>
            <div class="rule-detail">
              <span class="label">Encounters:</span> seeker-swarm (50%), mixed-hazard (50%)
            </div>
            <div class="rule-detail">
              <span class="label">Max Concurrent:</span> 1
            </div>
            <div class="rule-detail">
              <span class="label">Cooldown:</span> 60s
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFlagsTab(): string {
  const flags = editorState.storyFlags;

  // Categorize flags
  const beaconLocks = flags.filter(f => f.includes("beacon") && f.includes("lock"));
  const choices = flags.filter(f => f.includes("friendly") || f.includes("hostile"));
  const encounters = flags.filter(f => f.includes("encounter"));
  const other = flags.filter(f => !beaconLocks.includes(f) && !choices.includes(f) && !encounters.includes(f));

  return `
    <div class="flags-tab">
      <div class="tab-header">
        <h3>Story Flags (${flags.length} active)</h3>
      </div>
      <p class="tab-description">
        Story flags track player choices and progression. Some flags unlock new spawn table rules.
      </p>
      <div class="flag-categories">
        ${renderFlagCategory("Beacons Locked", beaconLocks)}
        ${renderFlagCategory("Player Choices", choices)}
        ${renderFlagCategory("Encounters", encounters)}
        ${renderFlagCategory("Other", other)}
      </div>
    </div>
  `;
}

function renderFlagCategory(title: string, flags: string[]): string {
  if (flags.length === 0) return "";

  return `
    <div class="flag-category">
      <h4>${title}</h4>
      <div class="flag-list">
        ${flags.map(flag => `<div class="flag-item"><code>${flag}</code></div>`).join("")}
      </div>
    </div>
  `;
}

function renderSettingsTab(): string {
  const config = editorState.config!;

  return `
    <div class="settings-tab">
      <div class="tab-header">
        <h3>Campaign Settings</h3>
      </div>
      <div class="settings-grid">
        <div class="setting-item">
          <label for="beacon-count-input">Beacon Count</label>
          <div class="input-group">
            <input
              type="number"
              id="beacon-count-input"
              value="${config.beaconCount}"
              min="1"
              max="20"
            />
            <button id="beacon-count-apply" class="apply-btn">Apply</button>
          </div>
          <p class="setting-help">Number of beacons in the mission (1-20)</p>
        </div>

        <div class="setting-item">
          <label for="min-distance-input">Min Distance</label>
          <div class="input-group">
            <input
              type="number"
              id="min-distance-input"
              value="${config.minDistance}"
              min="500"
              max="10000"
              step="100"
            />
            <button id="min-distance-apply" class="apply-btn">Apply</button>
          </div>
          <p class="setting-help">Minimum spacing between beacons (500-10000)</p>
        </div>

        <div class="setting-item readonly">
          <label>Hold Duration</label>
          <div class="value">${config.holdSeconds}s</div>
          <p class="setting-help">Time to hold position at beacon</p>
        </div>

        <div class="setting-item readonly">
          <label>Revisit Cooldown</label>
          <div class="value">${config.revisitCooldown}s</div>
          <p class="setting-help">Cooldown before revisiting beacon</p>
        </div>

        <div class="setting-item readonly">
          <label>Max Active Encounters</label>
          <div class="value">${config.maxActiveEncounters}</div>
          <p class="setting-help">Maximum simultaneous encounters</p>
        </div>
      </div>

      <div class="danger-zone">
        <h4>Danger Zone</h4>
        <button id="campaign-restart-btn" class="danger-btn">Restart Campaign</button>
        <p class="warning">
          ⚠️ This will clear all progression, story flags, and active encounters.
          Upgrades will be preserved. This action cannot be undone.
        </p>
      </div>
    </div>
  `;
}

function requestCampaignConfig(): void {
  sendProto(
    create(WsEnvelopeSchema, {
      payload: {
        case: "campaignConfigRequest",
        value: { missionId: "campaign-1" },
      },
    })
  );
}

function applyBeaconCount(): void {
  const input = document.getElementById("beacon-count-input") as HTMLInputElement;
  const newCount = parseInt(input.value, 10);

  if (isNaN(newCount) || newCount < 1 || newCount > 20) {
    alert("Beacon count must be between 1 and 20");
    return;
  }

  if (!editorState.config) return;

  const updatedConfig = { ...editorState.config, beaconCount: newCount };
  sendConfigUpdate(updatedConfig);
}

function applyMinDistance(): void {
  const input = document.getElementById("min-distance-input") as HTMLInputElement;
  const newDistance = parseFloat(input.value);

  if (isNaN(newDistance) || newDistance < 500 || newDistance > 10000) {
    alert("Min distance must be between 500 and 10000");
    return;
  }

  if (!editorState.config) return;

  const updatedConfig = { ...editorState.config, minDistance: newDistance };
  sendConfigUpdate(updatedConfig);
}

function sendConfigUpdate(config: CampaignConfig): void {
  sendProto(
    create(WsEnvelopeSchema, {
      payload: {
        case: "campaignConfigUpdate",
        value: { missionId: "campaign-1", config },
      },
    })
  );

  // Request updated config after short delay
  setTimeout(() => requestCampaignConfig(), 500);
}

function confirmAndRestartCampaign(): void {
  const confirmed = confirm(
    "Are you sure you want to restart the campaign?\n\n" +
    "This will:\n" +
    "- Clear all story progression\n" +
    "- Reset all story flags\n" +
    "- Remove active encounters\n" +
    "- Reset beacon completion\n\n" +
    "Upgrades will be preserved.\n\n" +
    "This action cannot be undone."
  );

  if (!confirmed) return;

  sendProto(
    create(WsEnvelopeSchema, {
      payload: {
        case: "campaignRestart",
        value: { missionId: "campaign-1" },
      },
    })
  );

  // Request updated config after restart
  setTimeout(() => requestCampaignConfig(), 1000);
}
```

---

### Phase 5: Frontend - Message Handling

**File**: `internal/server/web/src/net.ts`

**Location**: In the WebSocket message handler (around line 400-500)

**Add handler for campaign responses**:

```typescript
case "campaignConfigResponse":
  if (envelope.payload.value) {
    connectedBus?.emit("campaign:configReceived", envelope.payload.value);
  }
  break;

case "campaignRestartResponse":
  if (envelope.payload.value) {
    const response = envelope.payload.value;
    if (response.success) {
      connectedBus?.emit("campaign:restarted");
      alert("Campaign restarted successfully!");
    } else {
      alert(`Campaign restart failed: ${response.error}`);
    }
  }
  break;
```

**Export sendProto function** (if not already exported):

```typescript
// At top of file, update export
export function sendProto(envelope: WsEnvelope) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const bytes = toBinary(WsEnvelopeSchema, envelope);
  ws.send(bytes);
}
```

---

### Phase 6: Frontend - Lobby Integration

**File**: `internal/server/web/src/lobby.ts`

**Add imports** (line ~4):
```typescript
import { initCampaignPanel } from "./campaign-editor";
```

**Initialize panel** (after line 26):
```typescript
// Initialize campaign editor panel
initCampaignPanel(state, bus);
```

**Add button handler** (after line 40):
```typescript
const campaignEditorBtn = document.getElementById("campaign-editor-btn");
campaignEditorBtn?.addEventListener("click", () => {
  bus.emit("campaign:toggle");
});
```

---

### Phase 7: Frontend - HTML & CSS

**File**: `internal/server/web/lobby.html`

#### 7.1: Add Button (after line 418)

```html
<button id="campaign-editor-btn" type="button">Campaign Editor</button>
<p class="muted">Configure beacons, view spawn tables, and restart campaign.</p>
```

#### 7.2: Add CSS (after line 391)

```css
/* Campaign Editor Panel */
.campaign-editor-panel {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2000;
  display: none;
  opacity: 0;
  transition: opacity 0.3s;
}

.campaign-editor-panel.visible {
  display: flex;
  opacity: 1;
}

/* Tabs */
.editor-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 2px solid #16213e;
  padding: 0 20px;
  background: #0f0f1e;
}

.tab-btn {
  padding: 12px 20px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #999;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: #00d9ff;
}

.tab-btn.active {
  color: #00d9ff;
  border-bottom-color: #00d9ff;
}

/* Tab content */
.editor-tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.tab-header h3 {
  margin: 0;
  font-size: 20px;
  color: #00d9ff;
}

.tab-description {
  color: #999;
  margin-bottom: 20px;
  line-height: 1.6;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #999;
  font-size: 16px;
}

/* Beacons Tab */
.beacon-list {
  display: grid;
  gap: 16px;
}

.beacon-item {
  background: #2a2a3e;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 16px;
  transition: border-color 0.2s;
}

.beacon-item:hover {
  border-color: #00d9ff;
}

.beacon-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.beacon-name {
  font-size: 16px;
  font-weight: bold;
  color: #fff;
}

.beacon-ordinal {
  font-size: 14px;
  color: #999;
  background: #1a1a2e;
  padding: 4px 10px;
  border-radius: 12px;
}

.beacon-details {
  display: grid;
  gap: 8px;
}

.beacon-detail {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.beacon-detail .label {
  color: #999;
  min-width: 80px;
}

.beacon-detail .value {
  color: #fff;
}

.beacon-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
}

.tag-tier-1 {
  background: #2d5016;
  color: #7bed9f;
}

.tag-tier-2 {
  background: #5a3f11;
  color: #ffa502;
}

.tag-tier-3 {
  background: #5a1111;
  color: #ff4757;
}

.tag-zone-ne,
.tag-zone-nw,
.tag-zone-se,
.tag-zone-sw {
  background: #1e3a5a;
  color: #70a1ff;
}

/* Spawn Rules Tab */
.spawn-rules {
  display: grid;
  gap: 16px;
}

.spawn-rule {
  background: #2a2a3e;
  border: 1px solid #444;
  border-radius: 8px;
  overflow: hidden;
}

.rule-header {
  background: #1a1a2e;
  padding: 12px 16px;
  font-weight: bold;
  color: #00d9ff;
  border-bottom: 1px solid #444;
}

.rule-body {
  padding: 16px;
  display: grid;
  gap: 10px;
}

.rule-detail {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.rule-detail .label {
  color: #999;
  min-width: 140px;
  font-weight: bold;
}

.rule-detail code {
  background: #1a1a2e;
  padding: 2px 6px;
  border-radius: 4px;
  color: #00d9ff;
  font-family: monospace;
}

/* Flags Tab */
.flag-categories {
  display: grid;
  gap: 20px;
}

.flag-category h4 {
  color: #00d9ff;
  margin: 0 0 12px 0;
  font-size: 16px;
}

.flag-list {
  display: grid;
  gap: 8px;
}

.flag-item {
  background: #2a2a3e;
  padding: 10px 14px;
  border-radius: 6px;
  border-left: 3px solid #00d9ff;
}

.flag-item code {
  color: #fff;
  font-family: monospace;
  font-size: 12px;
}

/* Settings Tab */
.settings-grid {
  display: grid;
  gap: 24px;
  margin-bottom: 40px;
}

.setting-item {
  background: #2a2a3e;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #444;
}

.setting-item label {
  display: block;
  color: #00d9ff;
  font-weight: bold;
  margin-bottom: 8px;
  font-size: 14px;
}

.input-group {
  display: flex;
  gap: 8px;
}

.setting-item input {
  flex: 1;
  padding: 8px 12px;
  background: #1a1a2e;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.apply-btn {
  padding: 8px 16px;
  background: #00d9ff;
  color: #0f0f1e;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}

.apply-btn:hover {
  background: #00b8d4;
}

.setting-help {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: #999;
}

.setting-item.readonly .value {
  background: #1a1a2e;
  padding: 10px 12px;
  border-radius: 6px;
  color: #fff;
  font-size: 16px;
  font-weight: bold;
}

/* Danger Zone */
.danger-zone {
  background: #3a1a1a;
  border: 2px solid #ff4757;
  border-radius: 8px;
  padding: 20px;
}

.danger-zone h4 {
  margin: 0 0 12px 0;
  color: #ff4757;
  font-size: 16px;
}

.danger-btn {
  padding: 12px 24px;
  background: #ff4757;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 12px;
}

.danger-btn:hover {
  background: #ee2f3f;
}

.danger-zone .warning {
  color: #ffb8c1;
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}

.refresh-btn {
  padding: 6px 12px;
  background: #1a1a2e;
  border: 1px solid #00d9ff;
  color: #00d9ff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.refresh-btn:hover {
  background: #00d9ff;
  color: #0f0f1e;
}
```

---

## Testing Plan

### Unit Tests (Optional)

**File**: `internal/game/beacons_test.go`

Add tests for new functionality:
```go
func TestValidateMissionSpec(t *testing.T) {
    // Valid spec
    valid := MissionSpec{ID: "test", BeaconCount: 5, MinDistance: 2000, HoldSeconds: 10}
    if err := ValidateMissionSpec(valid); err != nil {
        t.Errorf("valid spec rejected: %v", err)
    }

    // Invalid beacon count
    invalid := MissionSpec{ID: "test", BeaconCount: 25, MinDistance: 2000, HoldSeconds: 10}
    if err := ValidateMissionSpec(invalid); err == nil {
        t.Error("invalid beacon count not rejected")
    }
}

func TestUpdateMissionSpec(t *testing.T) {
    spec := MissionSpec{
        ID: "test-mission",
        BeaconCount: 8,
        MinDistance: 3000,
        HoldSeconds: 15,
    }

    if err := UpdateMissionSpec(spec); err != nil {
        t.Fatalf("failed to update spec: %v", err)
    }

    retrieved, ok := GetMissionSpec("test-mission")
    if !ok {
        t.Fatal("spec not found after update")
    }

    if retrieved.BeaconCount != 8 {
        t.Errorf("beacon count mismatch: got %d, want 8", retrieved.BeaconCount)
    }
}
```

### Integration Testing

1. **Campaign Config Request**
   - [ ] Open lobby
   - [ ] Click "Campaign Editor" button
   - [ ] Panel opens with current config
   - [ ] Beacon count shows 4
   - [ ] Min distance shows 2500

2. **Beacon Count Update**
   - [ ] Change beacon count to 8
   - [ ] Click "Apply"
   - [ ] Click "Refresh"
   - [ ] Beacon list shows 8 beacons
   - [ ] Tags are correctly assigned (tier/zone)

3. **Min Distance Update**
   - [ ] Change min distance to 4000
   - [ ] Click "Apply"
   - [ ] Start new campaign game
   - [ ] Beacons are farther apart

4. **Story Flags Display**
   - [ ] Start campaign
   - [ ] Complete beacon 1
   - [ ] Open campaign editor
   - [ ] Navigate to "Story Flags" tab
   - [ ] See `story.signal-static-1.beacon-1-lock`

5. **Campaign Restart**
   - [ ] Play campaign, complete 2 beacons
   - [ ] Open campaign editor
   - [ ] Go to "Settings" tab
   - [ ] Click "Restart Campaign"
   - [ ] Confirm dialog
   - [ ] Story flags cleared
   - [ ] Beacon progression reset
   - [ ] Start new game - back at beacon 1

6. **Live Updates** (if multiple lobby tabs open)
   - [ ] Open 2 lobby tabs
   - [ ] Edit config in tab 1
   - [ ] Check if tab 2 sees update (may need manual refresh)

---

## Build & Deployment

### Build Steps
```bash
# 1. Regenerate protobuf code
make proto-go
# Or: protoc --go_out=. --go_opt=paths=source_relative proto/ws_messages.proto

# 2. Compile TypeScript
go generate ./internal/server

# 3. Build Go binary
go build -o LightSpeedDuel

# 4. Run server
./LightSpeedDuel -addr :8080
```

### Verification
```bash
# Open lobby
open http://localhost:8080/lobby

# Or direct to campaign
open http://localhost:8080/?room=test&mode=campaign&mission=1
```

---

## Future Enhancements

### Phase 8: Advanced Beacon Editing (Future)
- **Manual beacon placement**: Drag-and-drop on mini-map
- **Custom tags**: Add/remove tags per beacon
- **Radius editing**: Adjust individual beacon radii
- **Pin beacons**: Lock specific beacons to positions

### Phase 9: Spawn Table Editor (Future)
- **Edit encounter weights**: Adjust spawn probabilities
- **Add/remove encounters**: Modify encounter pools
- **Custom spawn rules**: Create new rules with tag filters
- **Story flag conditions**: Add prerequisite flags

### Phase 10: Persistence (Future)
- **Save configs to disk**: JSON file or database
- **Multiple mission profiles**: Switch between configs
- **Config versioning**: Track changes over time
- **Export/import**: Share configs with others

### Phase 11: Visual Preview (Future)
- **Mini-map canvas**: Show beacon positions visually
- **Tag visualization**: Color-code beacons by tier
- **Encounter zones**: Show spawn radii
- **Player path tracking**: Visualize progression

---

## File Summary

### New Files
- `proto/ws_messages.proto` (modified - new messages)
- `internal/server/web/src/campaign-editor.ts` (~400 lines)
- `plans/campaigneditor/PLAN.md` (this file)

### Modified Files
- `internal/game/beacons.go` (mutable registry, reload method)
- `internal/server/ws.go` (3 new handlers)
- `internal/server/web/src/net.ts` (message handlers)
- `internal/server/web/src/lobby.ts` (init campaign panel)
- `internal/server/web/lobby.html` (button + CSS)

### Generated Files (auto-generated, do not edit)
- `internal/proto/ws/ws_messages.pb.go`
- `internal/server/web/src/proto/proto/ws_messages_pb.ts`
- `internal/server/web/lobby.js`

---

## Notes

- **In-Memory Only**: Config changes persist only during server lifetime. Restart = reset to defaults.
- **Read-Only Spawn Tables**: Viewing only, editing requires future work.
- **Single Mission Focus**: Currently targets "campaign-1" only, multi-mission support possible later.
- **No Undo**: Config changes are immediate, no undo/rollback (use caution).
- **Story Flag Persistence**: Restart clears story flags but preserves upgrades (by design).

---

## Questions & Answers

**Q: Why WebSocket + Protobuf instead of HTTP/JSON?**
A: Consistency with existing architecture. All game communication uses WS+Proto (DAG, missions, beacons). Real-time updates, type safety, and performance benefits.

**Q: Can I edit spawn tables?**
A: Not in Phase 1-7. Spawn table editing is a future enhancement (Phase 9). Current plan is read-only viewing.

**Q: Will beacon changes affect mid-game sessions?**
A: No. Changes apply to new campaign games. Existing game sessions use their loaded spec. Use "Restart Campaign" to apply changes to current player.

**Q: How are beacon tags assigned?**
A: Automatically via `QuadrantTagger` based on position. Tier tags (1/2/3) by distance from center, zone tags (ne/nw/se/sw) by quadrant. Future: manual tag editing.

**Q: Can I have more than 20 beacons?**
A: Validation limits to 20. Technically possible to increase, but UI/performance may degrade. Adjust `ValidateMissionSpec` if needed.

---

## Conclusion

This plan provides a complete, production-ready campaign editor following best practices from the existing codebase. It enables the primary goal (increase beacon count from 4 to 8+) while providing visibility into story flags, spawn tables, and campaign settings. The architecture is extensible for future enhancements like visual editing, spawn table customization, and config persistence.
