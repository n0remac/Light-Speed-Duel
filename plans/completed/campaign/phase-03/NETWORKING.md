# Phase 3 Networking & Debug Message Contracts

**Prerequisites**: Read [OVERVIEW.md](OVERVIEW.md) for foundation specifications.

---

## Debug WebSocket Messages

### Client → Server Messages

#### DebugRequestEncounterInfoDTO
Sent by client to request debug information about beacons and encounters.

```typescript
interface DebugRequestEncounterInfoDTO {
  // No payload - just request all debug data
}
```

**WebSocket Message**:
```json
{
  "type": "debug:request-encounter-info",
  "payload": {}
}
```

---

### Server → Client Messages

#### DebugBeaconsDTO
Sent in response to debug request - contains beacon sampler results.

```typescript
interface DebugBeaconsDTO {
  beacons: DebugBeaconInfo[];
}

interface DebugBeaconInfo {
  id: string;
  x: number;
  y: number;
  tags: string[];      // e.g., ["tier-1", "zone-ne", "start"]
  pinned: boolean;     // True if designer-specified
}
```

**Go Struct**:
```go
type DebugBeaconsDTO struct {
	Beacons []DebugBeaconInfo `json:"beacons"`
}

type DebugBeaconInfo struct {
	ID     string   `json:"id"`
	X      float64  `json:"x"`
	Y      float64  `json:"y"`
	Tags   []string `json:"tags"`
	Pinned bool     `json:"pinned"`
}
```

---

#### DebugEncountersDTO
Sent in response to debug request - contains active encounter info.

```typescript
interface DebugEncountersDTO {
  encounters: DebugEncounterInfo[];
}

interface DebugEncounterInfo {
  encounterId: string;
  beaconId: string;
  spawnTime: number;
  lifetime: number;
  entityCount: number;
}
```

**Go Struct**:
```go
type DebugEncountersDTO struct {
	Encounters []DebugEncounterInfo `json:"encounters"`
}

type DebugEncounterInfo struct {
	EncounterID string  `json:"encounterId"`
	BeaconID    string  `json:"beaconId"`
	SpawnTime   float64 `json:"spawnTime"`
	Lifetime    float64 `json:"lifetime"`
	EntityCount int     `json:"entityCount"`
}
```

---

## WebSocket Handler Implementation

### Backend (Go)

**File**: `internal/server/ws.go`

Add to `handlePlayerMessage` switch:

```go
case "debug:request-encounter-info":
	if room := findRoomForPlayer(player); room != nil {
		debugData := room.BeaconDir.BuildDebugSnapshot()

		player.SendMessage("debug:beacons", map[string]interface{}{
			"beacons": debugData["beacons"],
		})

		player.SendMessage("debug:encounters", map[string]interface{}{
			"encounters": debugData["encounters"],
		})
	}
```

**BeaconDirector Helper** (`internal/game/beacons.go`):

```go
func (d *BeaconDirector) BuildDebugSnapshot() map[string]interface{} {
	beaconInfo := []map[string]interface{}{}

	for _, beacon := range d.Layout.Beacons {
		tags := []string{}
		for tag := range beacon.Tags {
			tags = append(tags, tag)
		}

		beaconInfo = append(beaconInfo, map[string]interface{}{
			"id":     beacon.ID,
			"x":      beacon.X,
			"y":      beacon.Y,
			"tags":   tags,
			"pinned": beacon.Pinned,
		})
	}

	encounterInfo := []map[string]interface{}{}

	for _, enc := range d.ActiveEncounters {
		encounterInfo = append(encounterInfo, map[string]interface{}{
			"encounterId": enc.EncounterID,
			"beaconId":    enc.BeaconID,
			"spawnTime":   enc.SpawnTime,
			"lifetime":    enc.Lifetime,
			"entityCount": len(enc.Entities),
		})
	}

	return map[string]interface{}{
		"beacons":    beaconInfo,
		"encounters": encounterInfo,
	}
}
```

---

### Frontend (TypeScript)

**File**: `internal/server/web/src/debug/encounter-overlay.ts`

**Request Debug Data**:
```typescript
function requestDebugData(): void {
  // Send message to server requesting debug info
  sendMessage({
    type: "debug:request-encounter-info",
    payload: {}
  });
}
```

**Handle Debug Responses**:
```typescript
// In event bus listeners
bus.on("debug:beacons", (data: { beacons: DebugBeaconInfo[] }) => {
  debugBeacons = data.beacons;
  render();
});

bus.on("debug:encounters", (data: { encounters: DebugEncounterInfo[] }) => {
  debugEncounters = data.encounters;
  render();
});
```

**Net.ts Message Handlers**:
```typescript
// Add to handleServerMessage switch in net.ts
case "debug:beacons": {
  const data = msg.payload as DebugBeaconsDTO;
  bus.emit("debug:beacons", data);
  break;
}

case "debug:encounters": {
  const data = msg.payload as DebugEncountersDTO;
  bus.emit("debug:encounters", data);
  break;
}
```

---

## Integration Flow

### Debug Overlay Toggle Flow
```
1. User presses 'D' key
2. Frontend: debugVisible = true
3. Frontend: requestDebugData()
4. Client sends "debug:request-encounter-info" to server
5. Server: BuildDebugSnapshot()
6. Server sends "debug:beacons" message
7. Server sends "debug:encounters" message
8. Client receives → emits bus events
9. Debug overlay renders with data
```

### Auto-Refresh Flow
```
1. Debug overlay visible
2. Timer (1s interval) triggers requestDebugData()
3. Server sends fresh data
4. Overlay re-renders with updated encounter lifetimes
```

---

## Message Timing

- **Debug requests**: Sent on demand (user presses 'D', or 1s timer when visible)
- **Debug responses**: Sent immediately when requested
- **No throttling**: Debug messages are low-frequency (max 1Hz)

---

## Error Handling

### Client Errors
- Server doesn't respond → Overlay shows "No data available"
- Invalid data format → Log error, skip rendering

### Server Errors
- Room not found → Log warning, don't send response
- BeaconDirector not initialized → Send empty arrays

---

## Testing

### WebSocket Debug Message Tests
```bash
# Test debug request
wscat -c ws://localhost:8080/ws
# Send: {"type": "debug:request-encounter-info", "payload": {}}
# Verify "debug:beacons" and "debug:encounters" received
# Verify JSON matches DTO schemas

# Test data accuracy
# Compare beacon positions from debug:beacons with in-game positions
# Verify encounter entityCount matches actual spawned entities
```

### Integration Tests
See [TESTING.md](TESTING.md) for full integration test scenarios.

---

## Debug Logging Format

Server-side logs should follow this format for consistency with debug overlay:

```
[BeaconSampler] Generated beacon beacon-0 at (1520, 1480) with tags: tier-1, zone-sw, start
[BeaconSampler] Generated beacon beacon-1 at (4123, 2567) with tags: tier-1, zone-ne
[SpawnTable] Evaluating beacon-1 (tier-1, zone-ne) against spawn table campaign-1-standard
[SpawnTable]   Rule 0 matched: RequiredTags=[tier-1] → Selected minefield-basic (weight=70)
[SpawnDirector] Spawned encounter minefield-basic at beacon-1 with 22 entities
```

This format allows developers to correlate server logs with debug overlay data.
