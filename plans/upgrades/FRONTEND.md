# Upgrade System - Frontend Plan

## Overview

**IMPORTANT:** This plan uses the existing DAG state from `AppState.dag` and filters for upgrade nodes (`kind === 'unit'`). No separate upgrade-specific networking is needed.

## UI Architecture

### Upgrades Panel (Overlay)
- Modal overlay accessible from **both lobby and game screens**
- Toggle open/close with "Upgrades" button
- Visual tech tree showing DAG nodes filtered by `kind === 'unit'`
- Node states map directly from DAG status:
  - **Available** (green, clickable) - `status === 'available'`
  - **Locked** (gray, shows prerequisites) - `status === 'locked'`
  - **In-progress** (yellow, countdown timer) - `status === 'in_progress'`
  - **Completed** (blue, checkmark) - `status === 'completed'`
- Node cards display: label, description (from payload), duration, effects
- Close button or click outside to dismiss
- **Game pauses** when panel is open (prevents actions while browsing upgrades)

### Lobby Integration
- Add "Upgrades" button alongside Campaign/Freeplay
- Badge showing active upgrade count (e.g., "⚙️ 1 in progress")
- Button toggles panel visibility

### Game Screen Integration
- Add "Upgrades" button in top frame/HUD (near mission info or settings)
- Badge showing active upgrade count
- Opening panel pauses game input (no ship commands while browsing)
- Keyboard shortcut (e.g., 'U' key) to toggle panel

## Frontend Changes

### State Management

**CURRENT STATE:** The codebase has `DagNode` and `DagState` interfaces in state.ts (lines 108-120), but they are **missing the effects field**. The proto_helpers.ts has the correct types with effects.

**REQUIRED CHANGES:**

1. **Add effects field to DagNode interface** in `internal/server/web/src/state.ts` (lines 108-116):

```typescript
// MODIFY existing DagNode interface to add effects field
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
```

2. **Add UpgradeEffectData interface** before DagNode (after line 107):

```typescript
// ADD new interface for upgrade effects
export interface UpgradeEffectData {
  type: string;                // 'speed_multiplier', 'missile_unlock', etc.
  value: number | string;
}
```

3. **Add PlayerCapabilities interface** after DagState (after line 120):

```typescript
// ADD new interface for capabilities
export interface PlayerCapabilities {
  speedMultiplier: number;
  unlockedMissiles: string[];
  heatCapacity: number;
  heatEfficiency: number;
}
```

4. **Add capabilities field to AppState** in `internal/server/web/src/state.ts` (line 206-223):

```typescript
// MODIFY existing AppState interface to add capabilities
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

5. **Update createInitialState** to include capabilities (line 268-298):

```typescript
export function createInitialState(limits: MissileLimits = {
  // ...
}): AppState {
  return {
    // ... existing fields ...
    capabilities: null, // NEW - add this line
  };
}
```

### Update Network Message Handling

**CURRENT STATE:** In `internal/server/web/src/net.ts`, the handleProtoStateMessage function (lines 464-477) maps DAG state but **does NOT map the effects field**. The capabilities field is also **not mapped**.

**REQUIRED CHANGES:**

1. **Import helper functions** from proto_helpers.ts (add to top of file around line 12):

```typescript
import { protoToState, protoToDagState, protoToUpgradeEffect } from "./proto_helpers";
```

2. **Update DAG mapping in handleProtoStateMessage** (around lines 464-477):

```typescript
// REPLACE the existing DAG mapping block:
// Phase 2: Update DAG
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
      effects: node.effects || [],  // NEW - include effects field
    })),
  };
}
```

**NOTE:** The proto_helpers.ts already has protoToDagNode which includes effects mapping (line 324-335), but the current code doesn't use it. The mapping should include the effects field.

3. **Add capabilities mapping** after DAG mapping (after line 477):

```typescript
// Phase 2: Update capabilities
if (msg.capabilities) {
  state.capabilities = {
    speedMultiplier: msg.capabilities.speedMultiplier,
    unlockedMissiles: msg.capabilities.unlockedMissiles,
    heatCapacity: msg.capabilities.heatCapacity,
    heatEfficiency: msg.capabilities.heatEfficiency,
  };
}
```

**IMPORTANT:** The msg object comes from protoToState() which already converts effects (proto_helpers.ts line 186-189 includes capabilities). Check if the conversion is already happening at that level.

### New Module: `upgrades.ts`

Create `internal/server/web/src/upgrades.ts`:

```typescript
import type { EventBus } from "./bus";
import type { AppState, DagNode } from "./state";
import { sendDagStart } from "./net";

export function initUpgradesPanel(
  state: AppState,
  bus: EventBus
): void {
  // Create panel DOM structure
  const panel = createPanelElement();
  document.body.appendChild(panel);

  const container = panel.querySelector('.tech-tree-container') as HTMLElement;
  const closeBtn = panel.querySelector('.close-btn') as HTMLElement;
  const overlay = panel.querySelector('.panel-overlay') as HTMLElement;

  // Render function
  function renderUpgrades() {
    const upgradeNodes = state.dag?.nodes.filter(n => n.kind === 'unit') || [];
    renderTechTree(upgradeNodes, container);
  }

  // Toggle panel visibility
  function togglePanel(visible: boolean) {
    panel.classList.toggle('visible', visible);
    if (visible) {
      renderUpgrades();
    }
  }

  // Event listeners
  bus.on("upgrades:toggle", () => {
    togglePanel(!panel.classList.contains('visible'));
  });

  bus.on("upgrades:show", () => togglePanel(true));
  bus.on("upgrades:hide", () => togglePanel(false));

  closeBtn.addEventListener("click", () => togglePanel(false));
  overlay.addEventListener("click", () => togglePanel(false));

  // Subscribe to DAG updates (event-driven pattern)
  bus.on("state:updated", () => {
    if (panel.classList.contains('visible')) {
      renderUpgrades();
    }
  });

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

function createPanelElement(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'upgrades-panel';
  panel.innerHTML = `
    <div class="panel-overlay"></div>
    <div class="panel-content">
      <div class="panel-header">
        <h2>Ship Upgrades</h2>
        <button class="close-btn">×</button>
      </div>
      <div class="tech-tree-container"></div>
    </div>
  `;
  return panel;
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

    // Update badge count in lobby
    const inProgressCount = upgradeNodes.length;
    bus.emit("upgrades:countUpdated", { count: inProgressCount });
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

## Tech Tree Panel Styling

### CSS Styling

Add to shared CSS or both lobby/game stylesheets:

```css
/* Game HUD Top Bar */
#game-top-bar {
  position: fixed;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 10px;
  z-index: 100;
}

.hud-button {
  background: rgba(26, 26, 46, 0.9);
  border: 2px solid #00d9ff;
  border-radius: 6px;
  color: #00d9ff;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: monospace;
}

.hud-button:hover {
  background: rgba(0, 217, 255, 0.2);
  transform: scale(1.05);
}

.badge {
  display: inline-block;
  background: #ff9800;
  color: #fff;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: bold;
  margin-left: 4px;
  min-width: 18px;
  text-align: center;
}

/* Upgrades Panel Overlay */
.upgrades-panel {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2000; /* Above game HUD */
  display: none;
  opacity: 0;
  transition: opacity 0.3s;
}

.upgrades-panel.visible {
  display: flex;
  opacity: 1;
}

.panel-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
}

.panel-content {
  position: relative;
  width: 80%;
  max-width: 1200px;
  height: 80%;
  margin: auto;
  background: #1a1a2e;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 2px solid #16213e;
  background: #0f0f1e;
}

.panel-header h2 {
  margin: 0;
  color: #00d9ff;
}

.close-btn {
  background: none;
  border: none;
  font-size: 32px;
  color: #fff;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  line-height: 1;
}

.close-btn:hover {
  color: #00d9ff;
}

.tech-tree-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.tech-tree {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.node {
  border: 2px solid #ccc;
  border-radius: 8px;
  padding: 15px;
  background: #2a2a3e;
  transition: all 0.3s;
  color: #fff;
}

.node-available {
  border-color: #4caf50;
  background: #1e3a1e;
  cursor: pointer;
}

.node-available:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.5);
}

.node-locked {
  border-color: #555;
  background: #1a1a2e;
  opacity: 0.5;
}

.node-in_progress {
  border-color: #ff9800;
  background: #3a2a1e;
  animation: pulse 2s infinite;
}

.node-completed {
  border-color: #2196f3;
  background: #1e2a3a;
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

### Lobby Integration

Add to `internal/server/web/src/lobby.ts`:

```typescript
import { initUpgradesPanel, startCountdownTimer } from "./upgrades";

// After existing lobby initialization
initUpgradesPanel(state, bus);
startCountdownTimer(state, bus);

// Add upgrades button handler
const upgradesBtn = document.getElementById("upgrades-btn");
if (upgradesBtn) {
  upgradesBtn.addEventListener("click", () => {
    bus.emit("upgrades:toggle");
  });
}

// Update badge with in-progress count
bus.on("upgrades:countUpdated", ({ count }) => {
  const badge = document.getElementById("upgrades-badge");
  if (badge) {
    badge.textContent = count > 0 ? `⚙️ ${count}` : "";
    badge.style.display = count > 0 ? "inline" : "none";
  }
});
```

Add button to `internal/server/web/lobby.html`:

```html
<!-- Add alongside Campaign/Freeplay buttons -->
<button id="upgrades-btn" class="lobby-button">
  Upgrades <span id="upgrades-badge"></span>
</button>
```

### Game Screen Integration

Add to `internal/server/web/src/main.ts`:

```typescript
import { initUpgradesPanel, startCountdownTimer } from "./upgrades";

// After existing game initialization
initUpgradesPanel(state, bus);
startCountdownTimer(state, bus);

// Add keyboard shortcut (U key)
window.addEventListener("keydown", (e) => {
  if (e.key === "u" || e.key === "U") {
    bus.emit("upgrades:toggle");
  }
});

// Update badge with in-progress count
bus.on("upgrades:countUpdated", ({ count }) => {
  const badge = document.getElementById("game-upgrades-badge");
  if (badge) {
    badge.textContent = count > 0 ? `${count}` : "";
    badge.style.display = count > 0 ? "inline" : "none";
  }
});

// Pause game input when panel is open
let panelOpen = false;
bus.on("upgrades:toggle", () => {
  panelOpen = !panelOpen;
});
bus.on("upgrades:show", () => {
  panelOpen = true;
});
bus.on("upgrades:hide", () => {
  panelOpen = false;
});

// Prevent game input when panel is open
bus.on("game:input", (event) => {
  if (panelOpen) {
    event.preventDefault?.();
    return false;
  }
});
```

Add to game HUD in `internal/server/web/index.html` (or render dynamically):

```html
<!-- Add to top frame/HUD area -->
<div id="game-top-bar">
  <!-- Other HUD elements... -->
  <button id="game-upgrades-btn" class="hud-button" title="Upgrades (U)">
    ⚙️ Upgrades <span id="game-upgrades-badge" class="badge"></span>
  </button>
</div>

<script>
  // Wire up button in main.ts or inline
  document.getElementById("game-upgrades-btn")?.addEventListener("click", () => {
    bus.emit("upgrades:toggle");
  });
</script>
```

Alternative: Render HUD button dynamically in `main.ts`:

```typescript
// Create upgrades button in HUD
function createUpgradesButton(): void {
  const topBar = document.getElementById("game-top-bar") || createTopBar();

  const button = document.createElement("button");
  button.id = "game-upgrades-btn";
  button.className = "hud-button";
  button.title = "Upgrades (U)";
  button.innerHTML = `⚙️ Upgrades <span id="game-upgrades-badge" class="badge"></span>`;

  button.addEventListener("click", () => {
    bus.emit("upgrades:toggle");
  });

  topBar.appendChild(button);
}

function createTopBar(): HTMLElement {
  const topBar = document.createElement("div");
  topBar.id = "game-top-bar";
  topBar.className = "game-hud-top";
  document.body.appendChild(topBar);
  return topBar;
}
```

## Event Integration

### Add Upgrade Events to EventBus

**REQUIRED CHANGE:** Add upgrade-related events to `internal/server/web/src/bus.ts` EventMap interface (around line 8-73):

```typescript
export interface EventMap {
  // ... existing events ...
  "upgrades:toggle": void;
  "upgrades:show": void;
  "upgrades:hide": void;
  "upgrades:countUpdated": { count: number };
  // ... rest of events ...
}
```

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

No changes needed to esbuild configuration - upgrades module will be bundled into both `lobby.js` and `client.js` since it's imported by both `lobby.ts` and `main.ts`.

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
| **UI** | ✅ Panel overlay accessible from both lobby and game |
| **Entry Points** | ✅ Integrate into `lobby.ts` and `main.ts` |
| **Game HUD** | ✅ Add upgrades button in top frame with badge |
| **Keyboard** | ✅ 'U' key shortcut to toggle panel in-game |
| **Build** | ✅ No changes needed (bundled with lobby + client) |
| **Integration** | ✅ Show unlocked missiles, speed bonuses in game |

This approach reuses 100% of the existing DAG networking and state management, only adding UI presentation logic specific to upgrades as a panel overlay accessible from both lobby and game screens.
