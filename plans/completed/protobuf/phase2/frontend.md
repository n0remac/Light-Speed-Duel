# Phase 2: Frontend Implementation (TypeScript)

## Overview

Extend the Phase 1 frontend to handle DAG, inventory, and story data via protobuf.

## Prerequisites

- Phase 1 frontend complete and tested
- Phase 2 proto schema defined and TypeScript code regenerated
- Understanding of DAG UI system
- Understanding of story/dialogue system

## File Changes

### Files to modify:
- `internal/server/web/src/proto_helpers.ts` - Extend with Phase 2 converters
- `internal/server/web/src/net.ts` - Add Phase 2 send functions
- `internal/server/web/src/state.ts` - Extend AppState interface (if needed)

### Files to update (consumers):
- `internal/server/web/src/game.ts` - Handle DAG/inventory/story state
- `internal/server/web/src/dag_ui.ts` - Consume DAG data (if exists)
- `internal/server/web/src/story/system.ts` - Consume story data

## Implementation Steps

### 1. Extend State Type Definitions

Add to `internal/server/web/src/proto_helpers.ts`:

```typescript
import type {
  DagNode,
  DagState,
  DagNodeStatus,
  DagNodeKind,
  InventoryItem,
  Inventory,
  StoryState,
  StoryDialogue,
  StoryIntent,
} from './proto/ws_messages';

// Enum converters
export function protoStatusToString(status: DagNodeStatus): string {
  switch (status) {
    case DagNodeStatus.DAG_NODE_STATUS_LOCKED: return 'locked';
    case DagNodeStatus.DAG_NODE_STATUS_AVAILABLE: return 'available';
    case DagNodeStatus.DAG_NODE_STATUS_IN_PROGRESS: return 'in_progress';
    case DagNodeStatus.DAG_NODE_STATUS_COMPLETED: return 'completed';
    default: return 'unknown';
  }
}

export function protoKindToString(kind: DagNodeKind): string {
  switch (kind) {
    case DagNodeKind.DAG_NODE_KIND_FACTORY: return 'factory';
    case DagNodeKind.DAG_NODE_KIND_UNIT: return 'unit';
    case DagNodeKind.DAG_NODE_KIND_STORY: return 'story';
    default: return 'unknown';
  }
}

export function protoIntentToString(intent: StoryIntent): string {
  switch (intent) {
    case StoryIntent.STORY_INTENT_FACTORY: return 'factory';
    case StoryIntent.STORY_INTENT_UNIT: return 'unit';
    default: return '';
  }
}

// DAG types
export interface DagNodeData {
  id: string;
  kind: string;
  label: string;
  status: string;
  remainingS: number;
  durationS: number;
  repeatable: boolean;
}

export interface DagStateData {
  nodes: DagNodeData[];
}

// Inventory types
export interface InventoryItemData {
  type: string;
  variantId: string;
  heatCapacity: number;
  quantity: number;
}

export interface InventoryData {
  items: InventoryItemData[];
}

// Story types
export interface StoryDialogueChoiceData {
  id: string;
  text: string;
}

export interface StoryTutorialTipData {
  title: string;
  text: string;
}

export interface StoryDialogueData {
  speaker: string;
  text: string;
  intent: string;
  continueLabel: string;
  choices: StoryDialogueChoiceData[];
  tutorialTip?: StoryTutorialTipData;
}

export interface StoryEventData {
  chapterId: string;
  nodeId: string;
  timestamp: number;
}

export interface StoryStateData {
  activeNode: string;
  dialogue?: StoryDialogueData;
  available: string[];
  flags: Record<string, boolean>;
  recentEvents: StoryEventData[];
}

// Conversion functions
export function protoToDagNode(proto: DagNode): DagNodeData {
  return {
    id: proto.id,
    kind: protoKindToString(proto.kind),
    label: proto.label,
    status: protoStatusToString(proto.status),
    remainingS: proto.remainingS,
    durationS: proto.durationS,
    repeatable: proto.repeatable,
  };
}

export function protoToDagState(proto: DagState): DagStateData {
  return {
    nodes: proto.nodes.map(protoToDagNode),
  };
}

export function protoToInventoryItem(proto: InventoryItem): InventoryItemData {
  return {
    type: proto.type,
    variantId: proto.variantId,
    heatCapacity: proto.heatCapacity,
    quantity: proto.quantity,
  };
}

export function protoToInventory(proto: Inventory): InventoryData {
  return {
    items: proto.items.map(protoToInventoryItem),
  };
}

export function protoToStoryDialogue(proto: StoryDialogue): StoryDialogueData {
  return {
    speaker: proto.speaker,
    text: proto.text,
    intent: protoIntentToString(proto.intent),
    continueLabel: proto.continueLabel,
    choices: proto.choices.map(c => ({ id: c.id, text: c.text })),
    tutorialTip: proto.tutorialTip ? {
      title: proto.tutorialTip.title,
      text: proto.tutorialTip.text,
    } : undefined,
  };
}

export function protoToStoryState(proto: StoryState): StoryStateData {
  return {
    activeNode: proto.activeNode,
    dialogue: proto.dialogue ? protoToStoryDialogue(proto.dialogue) : undefined,
    available: proto.available,
    flags: proto.flags,
    recentEvents: proto.recentEvents.map(e => ({
      chapterId: e.chapterId,
      nodeId: e.nodeId,
      timestamp: e.timestamp,
    })),
  };
}
```

### 2. Update `protoToState` Function

Extend the existing function from Phase 1:

```typescript
export function protoToState(proto: StateUpdate) {
  const base = {
    // ... Phase 1 fields
    now: proto.now,
    me: protoToGhost(proto.me!),
    ghosts: proto.ghosts.map(protoToGhost),
    // ... etc
  };

  // Phase 2 additions
  return {
    ...base,
    dag: proto.dag ? protoToDagState(proto.dag) : undefined,
    inventory: proto.inventory ? protoToInventory(proto.inventory) : undefined,
    story: proto.story ? protoToStoryState(proto.story) : undefined,
  };
}
```

### 3. Add DAG Command Functions

Add to `internal/server/web/src/net.ts`:

```typescript
import {
  WsEnvelope,
  DagStart,
  DagCancel,
  DagStoryAck,
  DagList,
  MissionSpawnWave,
  MissionStoryEvent,
} from './proto/ws_messages';

// Start a DAG node (e.g., crafting)
export function sendDagStart(ws: WebSocket, nodeId: string) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'dagStart',
      value: { nodeId },
    },
  });
  sendProto(ws, envelope);
}

// Cancel a DAG node in progress
export function sendDagCancel(ws: WebSocket, nodeId: string) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'dagCancel',
      value: { nodeId },
    },
  });
  sendProto(ws, envelope);
}

// Acknowledge story dialogue (with optional choice)
export function sendDagStoryAck(ws: WebSocket, nodeId: string, choiceId: string = '') {
  const envelope = new WsEnvelope({
    payload: {
      case: 'dagStoryAck',
      value: { nodeId, choiceId },
    },
  });
  sendProto(ws, envelope);
}

// Request full DAG list
export function sendDagList(ws: WebSocket) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'dagList',
      value: {},
    },
  });
  sendProto(ws, envelope);
}

// Spawn mission wave
export function sendMissionSpawnWave(ws: WebSocket, waveIndex: number) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'missionSpawnWave',
      value: { waveIndex },
    },
  });
  sendProto(ws, envelope);
}

// Trigger mission story event
export function sendMissionStoryEvent(ws: WebSocket, event: string, beacon: number = 0) {
  const envelope = new WsEnvelope({
    payload: {
      case: 'missionStoryEvent',
      value: { event, beacon },
    },
  });
  sendProto(ws, envelope);
}
```

### 4. Update Message Handler

Extend the message handler in `net.ts`:

```typescript
ws.onmessage = (event: MessageEvent) => {
  if (!(event.data instanceof ArrayBuffer)) {
    return;
  }

  try {
    const envelope = WsEnvelope.fromBinary(new Uint8Array(event.data));

    // Handle message based on type
    if (envelope.payload.case === 'stateUpdate') {
      const state = protoToState(envelope.payload.value);
      onStateUpdate(state);

    } else if (envelope.payload.case === 'roomFull') {
      console.error('Room full:', envelope.payload.value.message);
      bus.emit('connection:error', { message: envelope.payload.value.message });

    } else if (envelope.payload.case === 'dagListResponse') {
      const dagData = protoToDagState(envelope.payload.value.dag!);
      bus.emit('dag:list', dagData);

    } else {
      console.warn('Unknown message type:', envelope.payload.case);
    }
  } catch (err) {
    console.error('Failed to decode message:', err);
  }
};
```

### 5. Update AppState Interface

If using a centralized state object, extend it:

```typescript
// internal/server/web/src/state.ts
export interface AppState {
  // ... Phase 1 fields
  now: number;
  me: GhostSnapshot | null;
  ghosts: GhostSnapshot[];
  missiles: MissileSnapshot[];
  // ...

  // Phase 2 additions
  dag?: DagStateData;
  inventory?: InventoryData;
  story?: StoryStateData;
}
```

### 6. Update Consumers

#### DAG UI

If there's a DAG UI component:

```typescript
// Example: internal/server/web/src/dag_ui.ts
import { bus } from './bus';
import type { DagStateData } from './proto_helpers';

export function initDagUI() {
  bus.on('state:updated', (state: AppState) => {
    if (state.dag) {
      renderDagNodes(state.dag.nodes);
    }
  });
}

function renderDagNodes(nodes: DagNodeData[]) {
  nodes.forEach(node => {
    const el = document.getElementById(`dag-${node.id}`);
    if (el) {
      el.className = `dag-node dag-node--${node.status}`;
      el.textContent = node.label;

      if (node.status === 'in_progress') {
        showProgressBar(el, node.remainingS, node.durationS);
      }
    }
  });
}
```

Update event handlers to use new send functions:

```typescript
// When user clicks "Craft" button
document.getElementById('craft-btn')?.addEventListener('click', () => {
  sendDagStart(ws, 'craft_missile_01');
});

// When user clicks "Cancel" button
document.getElementById('cancel-btn')?.addEventListener('click', () => {
  sendDagCancel(ws, currentNodeId);
});
```

#### Story System

Update story dialogue handler:

```typescript
// Example: internal/server/web/src/story/system.ts
import { sendDagStoryAck } from '../net';
import type { StoryStateData } from '../proto_helpers';

export function handleStoryState(state: StoryStateData, ws: WebSocket) {
  if (state.dialogue) {
    showDialogue(state.dialogue);

    // Handle continue button
    if (state.dialogue.choices.length === 0) {
      document.getElementById('continue-btn')?.addEventListener('click', () => {
        sendDagStoryAck(ws, state.activeNode);
        hideDialogue();
      });
    } else {
      // Handle choices
      state.dialogue.choices.forEach(choice => {
        const btn = document.getElementById(`choice-${choice.id}`);
        btn?.addEventListener('click', () => {
          sendDagStoryAck(ws, state.activeNode, choice.id);
          hideDialogue();
        });
      });
    }
  }
}
```

#### Inventory Display

Create or update inventory UI:

```typescript
// Example: internal/server/web/src/inventory_ui.ts
import type { InventoryData } from './proto_helpers';

export function renderInventory(inventory: InventoryData) {
  const container = document.getElementById('inventory');
  if (!container) return;

  container.innerHTML = '';

  inventory.items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'inventory-item';
    div.innerHTML = `
      <div class="item-icon" data-type="${item.type}"></div>
      <div class="item-label">${item.variantId}</div>
      <div class="item-quantity">x${item.quantity}</div>
      <div class="item-heat">Heat: ${item.heatCapacity}</div>
    `;
    container.appendChild(div);
  });
}
```

### 7. Update Mission Integration

If using mission-specific features:

```typescript
// internal/server/web/src/mission.ts
import { sendMissionSpawnWave, sendMissionStoryEvent } from './net';

// When player reaches beacon
export function onBeaconReached(beaconIndex: number, ws: WebSocket) {
  sendMissionStoryEvent(ws, 'mission:beacon-reached', beaconIndex);
}

// When player locks on to beacon
export function onBeaconLocked(beaconIndex: number, ws: WebSocket) {
  sendMissionSpawnWave(ws, beaconIndex);
}

// When wave is defeated
export function onWaveDefeated(waveIndex: number, ws: WebSocket) {
  sendMissionStoryEvent(ws, 'mission:wave-defeated', waveIndex);
}
```

## Testing

### Manual Testing Checklist

**DAG System:**
- [ ] DAG nodes display with correct status
- [ ] Click "Craft" starts a node (status → in_progress)
- [ ] Progress bar shows remaining time
- [ ] Node completes and status → completed
- [ ] Can repeat repeatable nodes
- [ ] Can cancel in-progress nodes

**Inventory System:**
- [ ] Inventory displays items with quantities
- [ ] Launching missile decrements quantity
- [ ] Crafting missile increments quantity
- [ ] Heat capacity displayed correctly

**Story System:**
- [ ] Story dialogue appears with correct speaker/text
- [ ] Continue button works
- [ ] Choice buttons work
- [ ] Choosing option advances story
- [ ] Tutorial tips display when present
- [ ] Story flags persist across nodes

**Mission System:**
- [ ] Can trigger wave spawns
- [ ] Can trigger story events
- [ ] Mission progression works end-to-end

### Unit Tests

```typescript
// test/proto_helpers.test.ts (Phase 2 additions)
import { describe, it, expect } from 'vitest';
import { protoToDagNode, protoToStoryDialogue } from '../src/proto_helpers';
import { DagNode, DagNodeKind, DagNodeStatus, StoryDialogue, StoryIntent } from '../src/proto/ws_messages';

describe('proto_helpers Phase 2', () => {
  it('converts proto DagNode to DagNodeData', () => {
    const proto = new DagNode({
      id: 'craft_missile_01',
      kind: DagNodeKind.DAG_NODE_KIND_FACTORY,
      label: 'Craft Basic Missile',
      status: DagNodeStatus.DAG_NODE_STATUS_AVAILABLE,
      remainingS: 0,
      durationS: 10,
      repeatable: true,
    });

    const data = protoToDagNode(proto);

    expect(data.id).toBe('craft_missile_01');
    expect(data.kind).toBe('factory');
    expect(data.status).toBe('available');
    expect(data.repeatable).toBe(true);
  });

  it('converts proto StoryDialogue to StoryDialogueData', () => {
    const proto = new StoryDialogue({
      speaker: 'Captain',
      text: 'Welcome aboard!',
      intent: StoryIntent.STORY_INTENT_FACTORY,
      continueLabel: 'Next',
      choices: [
        { id: 'accept', text: 'Thank you!' },
      ],
    });

    const data = protoToStoryDialogue(proto);

    expect(data.speaker).toBe('Captain');
    expect(data.intent).toBe('factory');
    expect(data.choices).toHaveLength(1);
    expect(data.choices[0].id).toBe('accept');
  });
});
```

### Browser Console Testing

```javascript
// Check that DAG data is present
console.log(state.dag);

// Manually trigger DAG start
sendDagStart(ws, 'craft_missile_01');

// Check inventory
console.log(state.inventory);

// Trigger story event
sendMissionStoryEvent(ws, 'mission:start', 0);
```

## Edge Cases

### Empty Optional Fields

Handle cases where optional fields are missing:

```typescript
// Safe access to optional fields
if (state.dag) {
  renderDag(state.dag);
} else {
  hideDagUI();
}

if (state.story?.dialogue) {
  showDialogue(state.story.dialogue);
} else {
  hideDialogue();
}
```

### Enum Unknown Values

Handle unknown enum values gracefully:

```typescript
function getStatusClass(status: string): string {
  switch (status) {
    case 'locked': return 'status-locked';
    case 'available': return 'status-available';
    case 'in_progress': return 'status-in-progress';
    case 'completed': return 'status-completed';
    default:
      console.warn('Unknown DAG status:', status);
      return 'status-unknown';
  }
}
```

### Story Flags

Story flags may be empty or missing:

```typescript
const flags = state.story?.flags ?? {};
const hasSeenIntro = flags['seen_intro'] ?? false;
```

## Performance Considerations

### State Updates

With Phase 2 data, state objects are larger. Consider:

```typescript
// Only update components that changed
let previousDag: DagStateData | undefined;
let previousInventory: InventoryData | undefined;

bus.on('state:updated', (state: AppState) => {
  if (state.dag !== previousDag) {
    renderDag(state.dag);
    previousDag = state.dag;
  }

  if (state.inventory !== previousInventory) {
    renderInventory(state.inventory);
    previousInventory = state.inventory;
  }
});
```

### Conditional Rendering

Don't render DAG/inventory UI if not in campaign mode:

```typescript
const isCampaign = new URLSearchParams(location.search).get('mode') === 'campaign';

if (isCampaign && state.dag) {
  renderDag(state.dag);
}
```

## Checklist

- [ ] Extend `proto_helpers.ts` with Phase 2 types and converters
- [ ] Add enum conversion functions
- [ ] Update `protoToState` to include Phase 2 fields
- [ ] Add DAG/mission/story send functions to `net.ts`
- [ ] Update message handler for new response types
- [ ] Extend `AppState` interface (if used)
- [ ] Update DAG UI to consume proto data
- [ ] Update story system to use proto send functions
- [ ] Create/update inventory UI
- [ ] Update mission integration
- [ ] Add unit tests for Phase 2 converters
- [ ] Test campaign mode end-to-end
- [ ] Test all DAG/inventory/story features
- [ ] Handle edge cases (missing optional fields)

## Next Steps

After frontend implementation is complete:
- Test full Phase 2 functionality with backend
- Verify campaign mode works correctly
- Document any UI/UX issues discovered
- Proceed to Phase 3 planning (versioning/rollout)
