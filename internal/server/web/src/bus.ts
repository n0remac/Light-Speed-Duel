export type ShipContext = "ship" | "missile";
export type ShipTool = "set" | "select";
export type MissileTool = "set" | "select";

export interface EventMap {
  "context:changed": { context: ShipContext };
  "ship:toolChanged": { tool: ShipTool };
  "ship:waypointAdded": { index: number };
  "ship:legSelected": { index: number | null };
  "ship:waypointDeleted": { index: number };
  "ship:waypointsCleared": void;
  "ship:speedChanged": { value: number };
  "missile:routeAdded": { routeId: string };
  "missile:routeDeleted": { routeId: string };
  "missile:routeRenamed": { routeId: string; name: string };
  "missile:activeRouteChanged": { routeId: string | null };
  "missile:toolChanged": { tool: MissileTool };
  "missile:waypointAdded": { routeId: string; index: number };
  "missile:waypointDeleted": { routeId: string; index: number };
  "missile:waypointsCleared": { routeId: string };
  "missile:speedChanged": { value: number };
  "missile:agroChanged": { value: number };
  "missile:launchRequested": { routeId: string };
  "missile:launched": { routeId: string };
  "missile:cooldownUpdated": { secondsRemaining: number };
  "help:visibleChanged": { visible: boolean };
  "state:updated": void;
  "tutorial:started": { id: string };
  "tutorial:stepChanged": { id: string; stepIndex: number; total: number };
  "tutorial:completed": { id: string };
  "tutorial:skipped": { id: string; atStep: number };
  "bot:spawnRequested": void;
}

export type EventKey = keyof EventMap;
export type EventPayload<K extends EventKey> = EventMap[K];
export type Handler<K extends EventKey> = (payload: EventPayload<K>) => void;

export interface EventBus {
  on<K extends EventKey>(event: K, handler: Handler<K>): () => void;
  emit<K extends EventKey>(event: K, payload: EventPayload<K>): void;
  emit<K extends EventKey>(event: K): void;
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
      return () => set?.delete(handler);
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
