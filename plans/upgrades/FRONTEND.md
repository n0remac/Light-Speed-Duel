# Upgrade System - Frontend Plan

## Overview

**IMPORTANT:** This plan uses the existing DAG state from `AppState.dag` and filters for upgrade nodes (`kind === 'unit'`). No separate upgrade-specific networking is needed.

## UI Architecture

### New Screen: `/upgrades.html`
- Separate page linked from lobby (new "Upgrades" button)
- Visual tech tree showing DAG nodes filtered by `kind === 'unit'`
- Node states map directly from DAG status:
  - **Available** (green, clickable) - `status === 'available'`
  - **Locked** (gray, shows prerequisites) - `status === 'locked'`
  - **In-progress** (yellow, countdown timer) - `status === 'in_progress'`
  - **Completed** (blue, checkmark) - `status === 'completed'`
- Node cards display: label, description (from payload), duration, effects

### Lobby Integration
- Add "Upgrades" button alongside Campaign/Freeplay
- Badge showing active upgrade count (e.g., "⚙️ 1 in progress")

## Frontend Changes

### State Management

**IMPORTANT:** Use existing `DagNode` and `DagState` interfaces from state.ts, don't create new ones.

Extend existing interfaces in `internal/server/web/src/state.ts`:

```typescript
// ADD new interface for upgrade effects (after line 102)
export interface UpgradeEffectData {
  type: string;                // 'speed_multiplier', 'missile_unlock', etc.
  value: number | string;
}

// MODIFY existing DagNode interface (lines 108-116) to add effects field
export interface DagNode {
  id: string;
  kind: string;
  label: string;
  status: string; // "locked" | "available" | "in_progress" | "completed"
  remaining_s: number;
  duration_s: number;
  repeatable: boolean;
  effects?: UpgradeEffectData[];  // NEW - add this line
}

// ADD new interface for capabilities (after DagState)
export interface PlayerCapabilities {
  speedMultiplier: number;
  unlockedMissiles: string[];
  heatCapacity: number;
  heatEfficiency: number;
}

// MODIFY existing AppState interface (line 206) to add capabilities
export interface AppState {
  now: number;
  nowSyncedAt: number;
  me: ShipSnapshot | null;
  ghosts: GhostSnapshot[];
  missiles: MissileSnapshot[];
  missileRoutes: MissileRoute[];
  activeMissileRouteId: string | null;
  nextMissileReadyAt: number;
  missileConfig: MissileConfig;
  missileLimits: MissileLimits;
  worldMeta: WorldMeta;
  inventory: Inventory | null;
  dag: DagState | null;              // EXISTING
  mission: MissionState | null;
  story: StoryState | null;
  craftHeatCapacity: number;
  capabilities: PlayerCapabilities | null;  // NEW - add this line
}
```

### Update Network Message Handling

Modify `internal/server/web/src/net.ts` to map the `effects` field when receiving DAG state:

```typescript
// In handleProtoStateMessage (around line 464-477)
// MODIFY the DAG state mapping to include effects
if (msg.dag) {
  state.dag = {
    nodes: msg.dag.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      status: node.status,
      remaining_s: node.remainingS,
      duration_s: node.durationS,
      repeatable: node.repeatable,
      effects: node.effects?.map(e => ({  // NEW - map effects field
        type: protoEffectTypeToString(e.type),
        value: e.value.case === "multiplier" ? e.value.value : e.value.value
      })) || []
    })),
  };
}

// ADD helper function (use existing from proto_helpers.ts or add locally)
function protoEffectTypeToString(type: UpgradeEffectType): string {
  switch (type) {
    case UpgradeEffectType.SPEED_MULTIPLIER: return "speed_multiplier";
    case UpgradeEffectType.MISSILE_UNLOCK: return "missile_unlock";
    case UpgradeEffectType.HEAT_CAPACITY: return "heat_capacity";
    case UpgradeEffectType.HEAT_EFFICIENCY: return "heat_efficiency";
    default: return "unknown";
  }
}

// ALSO map capabilities field (after DAG mapping)
if (msg.capabilities) {
  state.capabilities = {
    speedMultiplier: msg.capabilities.speedMultiplier,
    unlockedMissiles: msg.capabilities.unlockedMissiles,
    heatCapacity: msg.capabilities.heatCapacity,
    heatEfficiency: msg.capabilities.heatEfficiency
  };
}
```

Alternatively, use the helper from `proto_helpers.ts` if it's exported:

```typescript
import { protoToUpgradeEffect } from "./proto_helpers";

// In DAG mapping
effects: node.effects?.map(protoToUpgradeEffect) || []
```

### New Module: `upgrades.ts`

Create `internal/server/web/src/upgrades.ts`:

```typescript
import type { EventBus } from "./bus";
import type { AppState, DagNode } from "./state";
import { sendDagStart } from "./net";

export function initUpgradesScreen(
  state: AppState,
  bus: EventBus,
  container: HTMLElement
): void {
  // Render function
  function renderUpgrades() {
    const upgradeNodes = state.dag?.nodes.filter(n => n.kind === 'unit') || [];
    renderTechTree(upgradeNodes, container);
  }

  // Initial render
  renderUpgrades();

  // Subscribe to DAG updates (event-driven pattern)
  bus.on("state:updated", renderUpgrades);

  // Handle node click
  container.addEventListener("click", (e) => {
    const nodeEl = (e.target as HTMLElement).closest("[data-node-id]");
    if (!nodeEl) return;

    const nodeId = nodeEl.getAttribute("data-node-id");
    const node = state.dag?.nodes.find(n => n.id === nodeId);

    if (node?.status === "available") {
      sendDagStart(nodeId!); // Use existing DAG start message
    }
  });
}

function renderTechTree(nodes: DagNode[], container: HTMLElement): void {
  container.innerHTML = `
    <div class="tech-tree">
      ${nodes.map(renderNode).join('')}
    </div>
  `;
}

function renderNode(node: DagNode): string {
  const statusClass = `node-${node.status}`;
  const effectsHtml = node.effects?.map(e => {
    if (e.type === 'speed_multiplier') {
      return `+${((e.value as number - 1) * 100).toFixed(0)}% Speed`;
    } else if (e.type === 'missile_unlock') {
      return `Unlock ${e.value}`;
    } else if (e.type === 'heat_capacity') {
      return `+${((e.value as number - 1) * 100).toFixed(0)}% Heat Capacity`;
    } else if (e.type === 'heat_efficiency') {
      return `+${((e.value as number - 1) * 100).toFixed(0)}% Cooling`;
    }
    return '';
  }).join(', ') || '';

  const countdownHtml = node.status === 'in_progress'
    ? `<div class="countdown">${formatTime(node.remaining_s)}</div>`  // Note: remaining_s not remainingS
    : '';

  return `
    <div class="node ${statusClass}" data-node-id="${node.id}">
      <h3>${node.label}</h3>
      <p class="effects">${effectsHtml}</p>
      <p class="duration">Duration: ${formatTime(node.duration_s)}</p>
      ${countdownHtml}
      ${node.status === 'available' ? '<button>Start</button>' : ''}
    </div>
  `;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
```

### Real-time Countdown

Add countdown timer for in-progress upgrades:

```typescript
// In upgrades.ts
let countdownInterval: number | null = null;

export function startCountdownTimer(state: AppState, bus: EventBus): void {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  countdownInterval = window.setInterval(() => {
    const upgradeNodes = state.dag?.nodes.filter(n =>
      n.kind === 'unit' && n.status === 'in_progress'
    ) || [];

    upgradeNodes.forEach(node => {
      const el = document.querySelector(`[data-node-id="${node.id}"] .countdown`);
      if (el && node.remaining_s > 0) {  // Note: remaining_s not remainingS
        el.textContent = formatTime(node.remaining_s);
      }
    });
  }, 1000);
}

export function stopCountdownTimer(): void {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}
```

## In-Game Integration

### Missile Selector Updates

Modify missile crafting UI to show locked presets:

```typescript
// In missile config UI
function renderMissilePresets(state: AppState): void {
  const unlockedMissiles = state.capabilities?.unlockedMissiles || [];

  const presets = [
    { id: 'basic', name: 'Basic', unlocked: true },
    { id: 'scout', name: 'Scout', unlocked: unlockedMissiles.includes('scout') },
    { id: 'hunter', name: 'Hunter', unlocked: unlockedMissiles.includes('hunter') },
    { id: 'sniper', name: 'Sniper', unlocked: unlockedMissiles.includes('sniper') },
  ];

  const html = presets.map(preset => {
    if (!preset.unlocked) {
      return `<div class="preset locked" title="Unlock in Upgrades">
        ${preset.name} 🔒
      </div>`;
    }
    return `<div class="preset" data-preset="${preset.id}">
      ${preset.name}
    </div>`;
  }).join('');

  document.querySelector('.missile-presets')!.innerHTML = html;
}
```

### Speed Display

Show current speed multiplier:

```typescript
// In HUD or ship status display
function renderSpeedBonus(state: AppState): void {
  const multiplier = state.capabilities?.speedMultiplier || 1.0;

  if (multiplier > 1.0) {
    const bonusPercent = ((multiplier - 1) * 100).toFixed(0);
    const el = document.querySelector('.speed-bonus');
    if (el) {
      el.textContent = `+${bonusPercent}% Speed`;
      el.classList.add('active');
    }
  }
}
```

## Tech Tree Rendering (HTML/CSS Approach)

### HTML Structure

```html
<!-- internal/server/web/upgrades.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Upgrades - Light Speed Duel</title>
  <link rel="stylesheet" href="upgrades.css">
</head>
<body>
  <div id="upgrades-container">
    <h1>Ship Upgrades</h1>
    <div id="tech-tree"></div>
    <a href="/lobby.html" class="back-button">Back to Lobby</a>
  </div>
  <script type="module" src="upgrades.js"></script>
</body>
</html>
```

### CSS Styling

```css
/* internal/server/web/upgrades.css */
.tech-tree {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  padding: 20px;
}

.node {
  border: 2px solid #ccc;
  border-radius: 8px;
  padding: 15px;
  background: #f9f9f9;
  transition: all 0.3s;
}

.node-available {
  border-color: #4caf50;
  background: #e8f5e9;
  cursor: pointer;
}

.node-available:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

.node-locked {
  border-color: #999;
  background: #e0e0e0;
  opacity: 0.6;
}

.node-in_progress {
  border-color: #ff9800;
  background: #fff3e0;
  animation: pulse 2s infinite;
}

.node-completed {
  border-color: #2196f3;
  background: #e3f2fd;
}

.countdown {
  font-weight: bold;
  color: #ff9800;
  margin-top: 10px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

### Entry Point Script

```typescript
// internal/server/web/src/upgrades_main.ts
import { createEventBus } from "./bus";
import { createAppState } from "./state";
import { connectWebSocket } from "./net";
import { initUpgradesScreen, startCountdownTimer } from "./upgrades";

const bus = createEventBus();
const state = createAppState();

// Connect to server
const urlParams = new URLSearchParams(window.location.search);
const room = urlParams.get("room") || "lobby";

connectWebSocket({
  room,
  state,
  bus,
  onStateUpdated: () => {
    // DAG state updated, UI will refresh via bus listeners
  },
});

// Initialize upgrades UI
const container = document.getElementById("tech-tree")!;
initUpgradesScreen(state, bus, container);
startCountdownTimer(state, bus);
```

## Event Integration

### Listen for DAG Updates

```typescript
// The existing DAG state handling in net.ts already emits updates
// Just filter for upgrade nodes in the UI:

bus.on("state:updated", () => {
  if (state.dag) {
    const upgradeNodes = state.dag.nodes.filter(n => n.kind === 'unit');
    // Update UI
  }

  if (state.capabilities) {
    // Update capability displays
    updateMissilePresets(state.capabilities.unlockedMissiles);
    updateSpeedDisplay(state.capabilities.speedMultiplier);
  }
});
```

## Build Configuration

Add new entry point to esbuild config:

```go
// internal/server/cmd/webbuild/main.go
err := api.Build(api.BuildOptions{
    EntryPoints: []string{
        "internal/server/web/src/main.ts",
        "internal/server/web/src/lobby.ts",
        "internal/server/web/src/upgrades_main.ts", // NEW
    },
    Bundle:  true,
    Outdir:  "internal/server/web",
    Format:  "esm",
    // ... other options
})
```

This generates `internal/server/web/upgrades.js` referenced in `upgrades.html`.

## Polish Phase

### Animations

```css
.node-available button {
  background: #4caf50;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: background 0.2s;
}

.node-available button:hover {
  background: #45a049;
}

.node-completed::after {
  content: "✓";
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 24px;
  color: #2196f3;
}
```

### Sound Effects

```typescript
// In upgrades.ts
import { playSfx } from "./audio/sfx";

function onUpgradeStarted(nodeId: string): void {
  playSfx("upgrade_start");
}

bus.on("state:updated", () => {
  const completedUpgrades = state.dag?.nodes.filter(n =>
    n.kind === 'unit' && n.status === 'completed'
  ) || [];

  // Detect new completions
  if (completedUpgrades.length > previousCount) {
    playSfx("upgrade_complete");
    showCompletionNotification();
  }
});
```

### Tooltips

```typescript
function addTooltips(): void {
  document.querySelectorAll('.node').forEach(nodeEl => {
    nodeEl.addEventListener('mouseenter', (e) => {
      const nodeId = (e.target as HTMLElement).getAttribute('data-node-id');
      const node = state.dag?.nodes.find(n => n.id === nodeId);

      if (node) {
        showTooltip(node, e.clientX, e.clientY);
      }
    });
  });
}

function showTooltip(node: DagNodeSnapshot, x: number, y: number): void {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.innerHTML = `
    <strong>${node.label}</strong><br>
    ${node.effects?.map(e => `${e.type}: ${e.value}`).join('<br>')}
  `;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  document.body.appendChild(tooltip);
}
```

## Summary

| Component | Implementation |
|-----------|----------------|
| **State** | ✅ Reuse `AppState.dag`, filter by `kind === 'unit'` |
| **Networking** | ✅ Use existing `sendDagStart()`, no new messages |
| **UI** | ✅ HTML/CSS tech tree, render from DAG state |
| **Entry Point** | ✅ New `upgrades_main.ts` → `upgrades.js` |
| **Build** | ✅ Add to esbuild entry points |
| **Integration** | ✅ Show unlocked missiles, speed bonuses in game |

This approach reuses 100% of the existing DAG networking and state management, only adding UI presentation logic specific to upgrades.
