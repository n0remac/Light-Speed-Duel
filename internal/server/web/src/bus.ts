import type { MissileSelection } from "./state";
import type { DialogueContent } from "./story/types";

export type ShipContext = "ship" | "missile";
export type ShipTool = "set" | "select" | null;
export type MissileTool = "set" | "select" | null;

export interface EventMap {
  "context:changed": { context: ShipContext };
  "ship:toolChanged": { tool: ShipTool };
  "ship:waypointAdded": { index: number };
  "ship:waypointMoved": { index: number; x: number; y: number };
  "ship:legSelected": { index: number | null };
  "ship:waypointDeleted": { index: number };
  "ship:waypointsCleared": void;
  "ship:clearInvoked": void;
  "ship:speedChanged": { value: number };
  "ship:heatProjectionUpdated": { heatValues: number[] };
  "heat:markerAligned": { value: number; marker: number };
  "heat:warnEntered": { value: number; warnAt: number };
  "heat:cooledBelowWarn": { value: number; warnAt: number };
  "heat:stallTriggered": { stallUntil: number };
  "heat:stallRecovered": { value: number };
  "heat:dualMeterDiverged": { planned: number; actual: number };
  "ui:waypointHoverStart": { index: number };
  "ui:waypointHoverEnd": { index: number };
  "missile:routeAdded": { routeId: string };
  "missile:routeDeleted": { routeId: string };
  "missile:routeRenamed": { routeId: string; name: string };
  "missile:activeRouteChanged": { routeId: string | null };
  "missile:toolChanged": { tool: MissileTool };
  "missile:selectionChanged": { selection: MissileSelection | null };
  "missile:waypointAdded": { routeId: string; index: number };
  "missile:waypointMoved": { routeId: string; index: number; x: number; y: number };
  "missile:waypointDeleted": { routeId: string; index: number };
  "missile:waypointsCleared": { routeId: string };
  "missile:speedChanged": { value: number; index: number };
  "missile:agroChanged": { value: number };
  "missile:launchRequested": { routeId: string };
  "missile:launched": { routeId: string };
  "missile:cooldownUpdated": { secondsRemaining: number };
  "missile:deleteInvoked": void;
  "missile:presetSelected": { presetName: string };
  "missile:heatProjectionUpdated": { willOverheat: boolean; overheatAt?: number };
  "missile:overheated": { missileId: string; x: number; y: number };
  "missile:craftRequested": { nodeId: string; heatCapacity: number };
  "help:visibleChanged": { visible: boolean };
  "state:updated": void;
  "connection:error": { message: string };
  "dag:list": { nodes: Array<{ id: string; kind: string; label: string; status: string; remaining_s: number; duration_s: number; repeatable: boolean }> };
  "tutorial:started": { id: string };
  "tutorial:stepChanged": { id: string; stepIndex: number; total: number };
  "tutorial:completed": { id: string };
  "tutorial:skipped": { id: string; atStep: number };
  "bot:spawnRequested": void;
  "dialogue:opened": { nodeId: string; chapterId: string };
  "dialogue:closed": { nodeId: string; chapterId: string };
  "dialogue:choice": { nodeId: string; choiceId: string; chapterId: string };
  "story:flagUpdated": { flag: string; value: boolean };
  "story:progressed": { chapterId: string; nodeId: string };
  "story:nodeActivated": { nodeId: string; dialogue?: DialogueContent };
  "mission:start": void;
  "mission:beacon-locked": { index: number };
  "mission:completed": void;
  "audio:resume": void;
  "audio:mute": void;
  "audio:unmute": void;
  "audio:set-master-gain": { gain: number };
  "audio:sfx": { name: "ui" | "laser" | "thrust" | "explosion" | "lock" | "dialogue"; velocity?: number; pan?: number };
  "audio:music:set-scene": { scene: "ambient" | "combat" | "lobby"; seed?: number };
  "audio:music:param": { key: string; value: number };
  "audio:music:transport": { cmd: "start" | "stop" | "pause" };
  "upgrades:toggle": void;
  "upgrades:show": void;
  "upgrades:hide": void;
  "upgrades:countUpdated": { count: number };
}

export type EventKey = keyof EventMap;
export type EventPayload<K extends EventKey> = EventMap[K];
export type Handler<K extends EventKey> = (payload: EventPayload<K>) => void;

type VoidKeys = {
  [K in EventKey]: EventMap[K] extends void ? K : never
}[EventKey];

type NonVoidKeys = Exclude<EventKey, VoidKeys>;

export interface EventBus {
  on<K extends EventKey>(event: K, handler: Handler<K>): () => void;
  emit<K extends NonVoidKeys>(event: K, payload: EventPayload<K>): void;
  emit<K extends VoidKeys>(event: K): void;
}

export function createEventBus(): EventBus {
  const handlers = new Map<EventKey, Set<Function>>();
  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler);
      return () => set!.delete(handler);
    },
    emit(event: EventKey, payload?: unknown) {
      const set = handlers.get(event);
      if (!set || set.size === 0) return;
      for (const fn of set) {
        try {
          (fn as (value?: unknown) => void)(payload);
        } catch (err) {
          console.error(`[bus] handler for ${event} failed`, err);
        }
      }
    },
  };
}
