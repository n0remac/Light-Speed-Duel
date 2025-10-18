# New Upgrades - Frontend Implementation

## Overview

Update the TypeScript frontend to display and handle the new upgrade effect types for ship/missile speed and heat capacity.

## Step 1: Update Effect Type Rendering

Update `internal/server/web/src/upgrades.ts` in the `renderNode` function:

```typescript
function renderNode(node: DagNode): string {
  const statusClass = `node-${node.status}`;
  const effectsHtml = node.effects?.map(e => {
    const type = e.type;
    const value = e.value as number;

    // Calculate percentage increase
    const percentIncrease = Math.round((value - 1) * 100);

    // Map effect types to display strings
    switch (type) {
      case 'speed_multiplier':
        return `+${percentIncrease}% Speed`;
      case 'missile_unlock':
        return `Unlock ${e.value}`;
      case 'heat_capacity':
        return `+${percentIncrease}% Heat Capacity`;
      case 'heat_efficiency':
        return `+${percentIncrease}% Cooling`;

      // NEW: Granular effect types
      case 'ship_speed_multiplier':
        return `+${percentIncrease}% Ship Speed`;
      case 'missile_speed_multiplier':
        return `+${percentIncrease}% Missile Speed`;
      case 'ship_heat_capacity':
        return `+${percentIncrease}% Ship Heat`;
      case 'missile_heat_capacity':
        return `+${percentIncrease}% Missile Heat`;

      default:
        return '';
    }
  }).join(', ') || '';

  const countdownHtml = node.status === 'in_progress'
    ? `<div class="countdown">${formatTime(node.remaining_s)}</div>`
    : '';

  return `
    <div class="node ${statusClass}" data-node-id="${node.id}">
      <h3>${node.label}</h3>
      ${effectsHtml ? `<p class="effects">${effectsHtml}</p>` : ''}
      <p class="duration">Duration: ${formatTime(node.duration_s)}</p>
      ${countdownHtml}
      ${node.status === 'available' ? '<button>Start</button>' : ''}
      ${node.status === 'completed' ? '<div class="checkmark">✓</div>' : ''}
    </div>
  `;
}
```

## Step 2: Update TypeScript Types

If there's a `state.ts` or types file that defines effect types, update it:

```typescript
// In state.ts or types.ts
export type UpgradeEffectType =
  | 'speed_multiplier'
  | 'missile_unlock'
  | 'heat_capacity'
  | 'heat_efficiency'
  | 'ship_speed_multiplier'
  | 'missile_speed_multiplier'
  | 'ship_heat_capacity'
  | 'missile_heat_capacity';

export interface UpgradeEffect {
  type: UpgradeEffectType;
  value: number | string;
}
```

## Step 3: Organize Upgrades by Category (Optional Enhancement)

For better UX, group upgrades by category in the tech tree:

```typescript
function renderTechTree(nodes: DagNode[], container: HTMLElement): void {
  // Group nodes by upgrade path
  const shipSpeed = nodes.filter(n => n.id.startsWith('upgrade.ship.speed_'));
  const missileSpeed = nodes.filter(n => n.id.startsWith('upgrade.missile.speed_'));
  const shipHeat = nodes.filter(n => n.id.startsWith('upgrade.ship.heat_cap_'));
  const missileHeat = nodes.filter(n => n.id.startsWith('upgrade.missile.heat_cap_'));

  container.innerHTML = `
    <div class="tech-tree">
      ${renderUpgradePath('Ship Speed', shipSpeed)}
      ${renderUpgradePath('Missile Speed', missileSpeed)}
      ${renderUpgradePath('Ship Heat', shipHeat)}
      ${renderUpgradePath('Missile Heat', missileHeat)}
    </div>
  `;
}

function renderUpgradePath(title: string, nodes: DagNode[]): string {
  if (nodes.length === 0) return '';

  return `
    <div class="upgrade-path">
      <h3 class="path-title">${title}</h3>
      <div class="path-nodes">
        ${nodes.map(renderNode).join('')}
      </div>
    </div>
  `;
}
```

## Step 4: Add CSS Styling (Optional Enhancement)

Add to `internal/server/web/lobby.html` or wherever upgrade styles are defined:

```css
.tech-tree {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px;
}

.upgrade-path {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.3);
}

.path-title {
  margin: 0 0 12px 0;
  font-size: 18px;
  color: #4fc3f7;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.path-nodes {
  display: flex;
  gap: 12px;
  overflow-x: auto;
}

.node {
  min-width: 160px;
  padding: 12px;
  border: 2px solid #555;
  border-radius: 6px;
  background: rgba(30, 30, 30, 0.9);
  cursor: pointer;
  transition: all 0.2s;
}

.node:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.node-locked {
  opacity: 0.5;
  border-color: #333;
  cursor: not-allowed;
}

.node-available {
  border-color: #4caf50;
}

.node-in_progress {
  border-color: #ff9800;
  animation: pulse 2s infinite;
}

.node-completed {
  border-color: #2196f3;
  background: rgba(33, 150, 243, 0.1);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.effects {
  color: #4fc3f7;
  font-size: 14px;
  margin: 8px 0;
  font-weight: bold;
}

.duration {
  color: #999;
  font-size: 12px;
  margin: 4px 0;
}

.countdown {
  color: #ff9800;
  font-size: 16px;
  font-weight: bold;
  margin-top: 8px;
}

.checkmark {
  position: absolute;
  top: 8px;
  right: 8px;
  color: #4caf50;
  font-size: 24px;
}
```

## Step 5: Handle Proto Message Parsing

Update `internal/server/web/src/proto_helpers.ts` (if it exists) to handle new effect types:

```typescript
import { UpgradeEffectType } from './proto/proto/ws_messages_pb';

export function parseUpgradeEffectType(protoType: UpgradeEffectType): string {
  switch (protoType) {
    case UpgradeEffectType.UPGRADE_EFFECT_TYPE_SPEED_MULTIPLIER:
      return 'speed_multiplier';
    case UpgradeEffectType.UPGRADE_EFFECT_TYPE_MISSILE_UNLOCK:
      return 'missile_unlock';
    case UpgradeEffectType.UPGRADE_EFFECT_TYPE_HEAT_CAPACITY:
      return 'heat_capacity';
    case UpgradeEffectType.UPGRADE_EFFECT_TYPE_HEAT_EFFICIENCY:
      return 'heat_efficiency';
    case UpgradeEffectType.UPGRADE_EFFECT_TYPE_SHIP_SPEED_MULTIPLIER:
      return 'ship_speed_multiplier';
    case UpgradeEffectType.UPGRADE_EFFECT_TYPE_MISSILE_SPEED_MULTIPLIER:
      return 'missile_speed_multiplier';
    case UpgradeEffectType.UPGRADE_EFFECT_TYPE_SHIP_HEAT_CAPACITY:
      return 'ship_heat_capacity';
    case UpgradeEffectType.UPGRADE_EFFECT_TYPE_MISSILE_HEAT_CAPACITY:
      return 'missile_heat_capacity';
    default:
      return 'unknown';
  }
}
```

## Step 6: Build Frontend

After making TypeScript changes:

```bash
go generate ./internal/server
go build
```

## Testing Checklist

- [ ] All 20 upgrade nodes appear in the upgrade panel
- [ ] Ship speed upgrades show "+10% Ship Speed", "+20% Ship Speed", etc.
- [ ] Missile speed upgrades show "+10% Missile Speed", etc.
- [ ] Ship heat capacity upgrades show "+10% Ship Heat", etc.
- [ ] Missile heat capacity upgrades show "+10% Missile Heat", etc.
- [ ] Locked nodes are grayed out
- [ ] Available nodes are highlighted
- [ ] In-progress nodes show countdown timer
- [ ] Completed nodes show checkmark
- [ ] Clicking an available node starts the upgrade
- [ ] Prerequisites are enforced (tier 2 locked until tier 1 complete)

## Notes

- This phase focuses on **display only** - effects are not yet applied to gameplay
- The grouped layout by upgrade path is optional but improves UX
- Effect application will be handled in a separate capabilities system implementation
