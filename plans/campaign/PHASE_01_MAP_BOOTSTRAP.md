# Phase 1 – Map & Bootstrap

Scope
- Use huge map (32000×18000) for Mission 1 rooms.
- Spawn player on left side (≈ 8% W, 50% H) on join.
- Add a minimal Mission HUD (current beacon index and hold timer).

## Precursor Tasks (Foundation Work)

### 1. Event Bus Extensions
**File**: `internal/server/web/src/bus.ts`
**Add mission events to EventMap**:
```typescript
"mission:start": void;
"mission:beacon-locked": { index: number };
"mission:completed": void;
```

### 2. Mission State Interface
**File**: `internal/server/web/src/state.ts`
**Add**:
```typescript
export interface BeaconDefinition {
  cx: number;
  cy: number;
  radius: number;
}

export interface MissionState {
  active: boolean;
  missionId: string;
  beaconIndex: number; // 0-based, 0..3 for B1..B4
  holdAccum: number;   // seconds accumulated in current beacon
  beacons: BeaconDefinition[];
}
```
**Extend AppState**:
```typescript
mission: MissionState | null;
```

### 3. Mission Controller Module
**File**: `internal/server/web/src/mission/controller.ts` (new)
**Responsibilities**:
- Initialize mission state from mode/mission params
- Subscribe to `state:updated` to evaluate beacon hold logic
- Emit `mission:beacon-locked` when hold timer reaches 10s
- Emit `mission:completed` when final beacon locked
- Persist mission progress to localStorage (beacon index, partial hold)
- Reset hold timer on stall or exit from beacon ring

**Pseudocode** (from PLAN.md lines 108-130):
```typescript
on tick/state:updated:
  if not state.mission or not state.me: return

  beacon = state.mission.beacons[state.mission.beaconIndex]
  if not beacon:
    emit('mission:completed')
    return

  pos = {x: state.me.x, y: state.me.y}
  dist = distance(pos, {x: beacon.cx, y: beacon.cy})
  inside = dist <= beacon.radius

  stalled = state.me.heat && (nowMs < state.me.heat.stallUntilMs)

  if inside and not stalled:
    state.mission.holdAccum += dt
  else:
    state.mission.holdAccum = 0

  if state.mission.holdAccum >= 10:
    emit('mission:beacon-locked', { index: state.mission.beaconIndex })
    state.mission.beaconIndex++
    state.mission.holdAccum = 0
    saveMissionProgress(state.mission)
```

### 4. Beacon Rendering
**File**: `internal/server/web/src/game/render.ts`
**Add beacon layer**:
- Render circles for beacons (stroke only, semi-transparent)
- Highlight current beacon (brighter stroke)
- Show hold progress as arc/ring fill (0-360° based on holdAccum/10)
- Visual feedback for "inside ring" (e.g., pulse effect)

### 5. Mission HUD Component
**File**: `internal/server/web/src/game/ui.ts` or new `internal/server/web/src/mission/hud.ts`
**Display**:
- Top-left overlay: `Beacon 2/4`
- Hold progress: `Hold: 7.3s / 10.0s`
- Only visible when `state.mission.active === true`
- Style consistent with existing heat bar

### 6. Neutral Missile Ownership
**File**: `internal/game/room.go` (line 340+)
**Modify `LaunchMissile()`**:
- Accept empty string `""` or special `"mission"` as owner
- Ensure missiles with neutral owner threaten all players
- Update guidance system to not exclude any targets when owner is neutral

### 7. Campaign-Only Access
**File**: `internal/server/web/src/lobby.ts`
**Modify campaign button handler** (line 32-38):
- Force `mode=campaign&mission=1`
- Force `mapW=32000&mapH=18000`
- Remove ability to select map size when clicking campaign button

**Remove previous campaign content**:
- Note: Any old campaign references will be replaced by this mission system

## Implementation Tasks

### Lobby/main wiring
- Campaign button exclusively launches `mode=campaign&mission=1` with huge map
- Client initializes mission state when mode=campaign detected
- Mount mission controller alongside game initialization

### Spawn position
**File**: `internal/server/ws.go` (around line 200+)
- Parse `mode` query parameter
- If `mode=campaign`, spawn ship at `(mapW * 0.08, mapH * 0.50)`
- Pass custom spawn position to `SpawnShip()`

### Mission Controller Integration
**File**: `internal/server/web/src/main.ts`
- Import and initialize mission controller when `mode === "campaign"`
- Wire up mission events to trigger hazard spawns (Phase 3)
- Integrate with story system (Phase 4)

## Deliverables
- Player reliably spawns on left side in huge map when campaign button clicked
- Mission controller tracks beacon progress and emits events
- Beacons render with visual feedback
- HUD displays current beacon and live hold countdown
- Lobby campaign button is the only way to access campaign mode

## Validation Checklist
- ✅ Event bus supports mission events
- ✅ Mission state tracks beacons and hold timer
- ✅ Controller detects beacon entry/exit and stall conditions
- ✅ Hold timer resets correctly on stall or exit
- ✅ Beacons render at correct positions on huge map
- ✅ HUD updates in real-time
- ✅ Campaign mode only accessible via lobby button

