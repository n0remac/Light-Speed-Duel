# Phase 3 Frontend Tasks

**Prerequisites**: Read [OVERVIEW.md](OVERVIEW.md) and [NETWORKING.md](NETWORKING.md) first.

---

### 4. Frontend Debugging Overlay

**Goal**: Add developer overlay showing beacon sampler results, encounter choices, and cooldown timers

**Files to Create/Modify**:
- Create `internal/server/web/src/debug/encounter-overlay.ts` (new file)
- Modify `internal/server/web/src/state.ts` (add debug state)
- Modify `internal/server/web/game.html` (add debug UI toggle)

**Code Sketch**:
```typescript
// internal/server/web/src/debug/encounter-overlay.ts

import { bus } from "../bus.js";
import { state } from "../state.js";

interface DebugEncounterInfo {
  encounterId: string;
  beaconId: string;
  spawnTime: number;
  lifetime: number;
  entityCount: number;
}

interface DebugBeaconInfo {
  id: string;
  x: number;
  y: number;
  tags: string[];
  pinned: boolean;
}

// Debug state (toggled by hotkey)
let debugVisible = false;
let debugBeacons: DebugBeaconInfo[] = [];
let debugEncounters: DebugEncounterInfo[] = [];

export function initEncounterDebugOverlay(): void {
  // Toggle with 'D' key
  document.addEventListener("keydown", (e) => {
    if (e.key === "d" || e.key === "D") {
      debugVisible = !debugVisible;
      render();
    }
  });

  // Listen for debug data from server
  bus.on("debug:beacons", (data: { beacons: DebugBeaconInfo[] }) => {
    debugBeacons = data.beacons;
    render();
  });

  bus.on("debug:encounters", (data: { encounters: DebugEncounterInfo[] }) => {
    debugEncounters = data.encounters;
    render();
  });

  // Request debug data on mission start
  bus.on("mission:start", () => {
    requestDebugData();
  });

  createOverlayElement();
}

function createOverlayElement(): void {
  const overlay = document.createElement("div");
  overlay.id = "encounter-debug-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "10px";
  overlay.style.right = "10px";
  overlay.style.width = "400px";
  overlay.style.maxHeight = "80vh";
  overlay.style.overflow = "auto";
  overlay.style.background = "rgba(0, 0, 0, 0.85)";
  overlay.style.color = "#0f0";
  overlay.style.fontFamily = "monospace";
  overlay.style.fontSize = "12px";
  overlay.style.padding = "10px";
  overlay.style.borderRadius = "5px";
  overlay.style.display = "none";
  overlay.style.zIndex = "10000";

  document.body.appendChild(overlay);
}

function render(): void {
  const overlay = document.getElementById("encounter-debug-overlay");
  if (!overlay) return;

  if (!debugVisible) {
    overlay.style.display = "none";
    return;
  }

  overlay.style.display = "block";

  let html = `
    <h3 style="margin: 0 0 10px 0; color: #0ff;">Encounter Debug (Press D to hide)</h3>
  `;

  // Beacon sampler info
  html += `<div style="margin-bottom: 15px;">
    <h4 style="margin: 5px 0; color: #ff0;">Beacons (${debugBeacons.length})</h4>
  `;

  for (const beacon of debugBeacons) {
    const tagStr = beacon.tags.join(", ");
    const pinnedMark = beacon.pinned ? "📍" : "";
    html += `
      <div style="margin: 5px 0; padding: 5px; background: rgba(255,255,255,0.05);">
        ${pinnedMark} <strong>${beacon.id}</strong><br/>
        Pos: (${beacon.x.toFixed(0)}, ${beacon.y.toFixed(0)})<br/>
        Tags: ${tagStr || "none"}
      </div>
    `;
  }

  html += `</div>`;

  // Active encounters
  html += `<div style="margin-bottom: 15px;">
    <h4 style="margin: 5px 0; color: #ff0;">Active Encounters (${debugEncounters.length})</h4>
  `;

  const now = state.now;

  for (const enc of debugEncounters) {
    const elapsed = now - enc.spawnTime;
    const remaining = Math.max(0, enc.lifetime - elapsed);
    const progress = Math.min(100, (elapsed / enc.lifetime) * 100);

    html += `
      <div style="margin: 5px 0; padding: 5px; background: rgba(255,255,255,0.05);">
        <strong>${enc.encounterId}</strong> @ ${enc.beaconId}<br/>
        Entities: ${enc.entityCount}<br/>
        Lifetime: ${remaining.toFixed(1)}s / ${enc.lifetime.toFixed(0)}s<br/>
        <div style="width: 100%; height: 5px; background: #333; margin-top: 3px;">
          <div style="width: ${progress}%; height: 100%; background: #0f0;"></div>
        </div>
      </div>
    `;
  }

  html += `</div>`;

  // Spawn table cooldowns (placeholder - would need server data)
  html += `<div>
    <h4 style="margin: 5px 0; color: #ff0;">Cooldowns</h4>
    <div style="color: #888; font-style: italic;">
      (Would display encounter cooldown timers here)
    </div>
  </div>`;

  overlay.innerHTML = html;
}

function requestDebugData(): void {
  // Send message to server requesting debug info
  bus.emit("send-message", {
    type: "debug:request-encounter-info",
    payload: {}
  });
}

// Update display every second
setInterval(() => {
  if (debugVisible) {
    render();
  }
}, 1000);
```

**Server-Side Debug Data**:
```go
// In internal/game/beacons.go

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

**WebSocket Handler**:
```go
// In internal/server/ws.go

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

**Task Checklist**:
- [ ] Create `internal/server/web/src/debug/encounter-overlay.ts` file
- [ ] Implement overlay toggle with 'D' key
- [ ] Create overlay DOM element with styling
- [ ] Implement `render()` function showing beacons and encounters
- [ ] Add beacon display with position, tags, pinned status
- [ ] Add encounter display with lifetime progress bars
- [ ] Implement `requestDebugData()` to fetch from server
- [ ] Add `BuildDebugSnapshot()` method to BeaconDirector
- [ ] Add `"debug:request-encounter-info"` WebSocket handler
- [ ] Import and initialize overlay in main.ts
- [ ] Add CSS styles for debug overlay
- [ ] Test overlay display and data updates

**Acceptance Criteria**:
- Pressing 'D' toggles debug overlay visibility
- Overlay shows all beacons with correct positions and tags
- Pinned beacons show pin indicator
- Active encounters display with entity count and lifetime
- Lifetime progress bars update in real-time
- Overlay updates when new encounters spawn
- Debug data matches server state

---

