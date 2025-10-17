// Protobuf conversion helpers
import type {
  Ghost,
  Missile,
  StateUpdate,
  DagNode,
  DagState,
  InventoryItem,
  Inventory,
  StoryState,
  StoryDialogue,
  StoryEvent,
  StoryDialogueChoice,
  StoryTutorialTip,
} from './proto/proto/ws_messages_pb';
// Import enums as values, not types
import {
  DagNodeStatus,
  DagNodeKind,
  StoryIntent,
} from './proto/proto/ws_messages_pb';

// Adapter types for compatibility with existing code
export interface GhostSnapshot {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  self: boolean;
  waypoints?: { x: number; y: number; speed: number }[];
  currentWaypointIndex?: number;
  hp: number;
  kills: number;
  heat?: {
    v: number;
    m: number;
    w: number;
    o: number;
    ms: number;
    su: number;
    ku: number;
    kd: number;
    ex: number;
  };
}

export interface MissileSnapshot {
  id: string;
  owner: string;
  self: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  agroRadius: number;
  lifetime: number;
  launch: number;
  expires: number;
  targetId?: string;
  heat?: {
    v: number;
    m: number;
    w: number;
    o: number;
    ms: number;
    su: number;
    ku: number;
    kd: number;
    ex: number;
  };
}

// Convert proto Ghost to GhostSnapshot
export function protoToGhost(proto: Ghost): GhostSnapshot {
  return {
    id: proto.id,
    x: proto.x,
    y: proto.y,
    vx: proto.vx,
    vy: proto.vy,
    t: proto.t,
    self: proto.self,
    waypoints: proto.waypoints?.map(wp => ({ x: wp.x, y: wp.y, speed: wp.speed })),
    currentWaypointIndex: proto.currentWaypointIndex,
    hp: proto.hp,
    kills: proto.kills,
    heat: proto.heat ? {
      v: proto.heat.v,
      m: proto.heat.m,
      w: proto.heat.w,
      o: proto.heat.o,
      ms: proto.heat.ms,
      su: proto.heat.su,
      ku: proto.heat.ku,
      kd: proto.heat.kd,
      ex: proto.heat.ex,
    } : undefined,
  };
}

// Convert proto Missile to MissileSnapshot
export function protoToMissile(proto: Missile): MissileSnapshot {
  return {
    id: proto.id,
    owner: proto.owner,
    self: proto.self,
    x: proto.x,
    y: proto.y,
    vx: proto.vx,
    vy: proto.vy,
    t: proto.t,
    agroRadius: proto.agroRadius,
    lifetime: proto.lifetime,
    launch: proto.launchTime,
    expires: proto.expiresAt,
    targetId: proto.targetId || undefined,
    heat: proto.heat ? {
      v: proto.heat.v,
      m: proto.heat.m,
      w: proto.heat.w,
      o: proto.heat.o,
      ms: proto.heat.ms,
      su: proto.heat.su,
      ku: proto.heat.ku,
      kd: proto.heat.kd,
      ex: proto.heat.ex,
    } : undefined,
  };
}

// Convert proto StateUpdate to AppState format
export function protoToState(proto: StateUpdate) {
  const base = {
    now: proto.now,
    me: proto.me ? protoToGhost(proto.me) : null,
    ghosts: proto.ghosts.map(protoToGhost),
    missiles: proto.missiles.map(protoToMissile),
    meta: proto.meta ? {
      c: proto.meta.c,
      w: proto.meta.w,
      h: proto.meta.h,
    } : { c: 299, w: 16000, h: 9000 },
    missileConfig: proto.missileConfig ? {
      speed: proto.missileConfig.speed,
      speedMin: proto.missileConfig.speedMin,
      speedMax: proto.missileConfig.speedMax,
      agroMin: proto.missileConfig.agroMin,
      agroRadius: proto.missileConfig.agroRadius,
      lifetime: proto.missileConfig.lifetime,
      heatConfig: proto.missileConfig.heatConfig ? {
        max: proto.missileConfig.heatConfig.max,
        warnAt: proto.missileConfig.heatConfig.warnAt,
        overheatAt: proto.missileConfig.heatConfig.overheatAt,
        markerSpeed: proto.missileConfig.heatConfig.markerSpeed,
        kUp: proto.missileConfig.heatConfig.kUp,
        kDown: proto.missileConfig.heatConfig.kDown,
        exp: proto.missileConfig.heatConfig.exp,
      } : undefined,
    } : {
      speed: 0,
      speedMin: 0,
      speedMax: 0,
      agroMin: 0,
      agroRadius: 0,
      lifetime: 0,
    },
    missileWaypoints: proto.missileWaypoints.map(wp => ({ x: wp.x, y: wp.y, speed: wp.speed })),
    missileRoutes: proto.missileRoutes.map(r => ({
      id: r.id,
      name: r.name,
      waypoints: r.waypoints.map(wp => ({ x: wp.x, y: wp.y, speed: wp.speed })),
    })),
    activeMissileRoute: proto.activeMissileRoute,
    nextMissileReady: proto.nextMissileReady,
  };

  // Phase 2 additions
  return {
    ...base,
    dag: proto.dag ? protoToDagState(proto.dag) : undefined,
    inventory: proto.inventory ? protoToInventory(proto.inventory) : undefined,
    story: proto.story ? protoToStoryState(proto.story) : undefined,
  };
}

// ========== Phase 2: Enum Converters ==========

export function protoStatusToString(status: DagNodeStatus): string {
  switch (status) {
    case DagNodeStatus.LOCKED: return 'locked';
    case DagNodeStatus.AVAILABLE: return 'available';
    case DagNodeStatus.IN_PROGRESS: return 'in_progress';
    case DagNodeStatus.COMPLETED: return 'completed';
    default: return 'unknown';
  }
}

export function protoKindToString(kind: DagNodeKind): string {
  switch (kind) {
    case DagNodeKind.FACTORY: return 'factory';
    case DagNodeKind.UNIT: return 'unit';
    case DagNodeKind.STORY: return 'story';
    case DagNodeKind.CRAFT: return 'craft';
    default: return 'unknown';
  }
}

export function protoIntentToString(intent: StoryIntent): string {
  switch (intent) {
    case StoryIntent.FACTORY: return 'factory';
    case StoryIntent.UNIT: return 'unit';
    default: return '';
  }
}

// ========== Phase 2: Type Definitions ==========

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

export interface InventoryItemData {
  type: string;
  variantId: string;
  heatCapacity: number;
  quantity: number;
}

export interface InventoryData {
  items: InventoryItemData[];
}

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

// ========== Phase 2: Conversion Functions ==========

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
