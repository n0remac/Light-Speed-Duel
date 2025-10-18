import { type EventBus } from "./bus";
import {
  type AppState,
  type MissileRoute,
  monotonicNow,
  sanitizeMissileConfig,
  updateMissileLimits,
} from "./state";
import type { DialogueContent } from "./story/types";
import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import { WsEnvelopeSchema, type WsEnvelope } from "./proto/proto/ws_messages_pb";
import { protoToState, protoToDagState } from "./proto_helpers";

interface ConnectOptions {
  room: string;
  state: AppState;
  bus: EventBus;
  onStateUpdated?: () => void;
  onOpen?: (socket: WebSocket) => void;
  mapW?: number;
  mapH?: number;
  mode?: string;
  missionId?: string;
}

let ws: WebSocket | null = null;

// Helper to send protobuf messages
function sendProto(envelope: WsEnvelope) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const bytes = toBinary(WsEnvelopeSchema, envelope);
  ws.send(bytes);
}

// Legacy JSON message sender (kept for backward compatibility and DAG messages)
export function sendMessage(payload: unknown): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // If payload has a "type" field, convert to protobuf
  if (typeof payload === "object" && payload !== null && "type" in payload) {
    const msg = payload as any;

    // Convert common message types to protobuf
    switch (msg.type) {
      case "join":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "join",
            value: {
              name: msg.name || "",
              room: msg.room || "",
              mapW: msg.map_w || 0,
              mapH: msg.map_h || 0,
            },
          },
        }));
        return;

      case "spawn_bot":
        sendProto(create(WsEnvelopeSchema, {
          payload: { case: "spawnBot", value: {} },
        }));
        return;

      case "add_waypoint":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "addWaypoint",
            value: { x: msg.x, y: msg.y, speed: msg.speed },
          },
        }));
        return;

      case "update_waypoint":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "updateWaypoint",
            value: { index: msg.index, speed: msg.speed },
          },
        }));
        return;

      case "move_waypoint":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "moveWaypoint",
            value: { index: msg.index, x: msg.x, y: msg.y },
          },
        }));
        return;

      case "delete_waypoint":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "deleteWaypoint",
            value: { index: msg.index },
          },
        }));
        return;

      case "clear_waypoints":
        sendProto(create(WsEnvelopeSchema, {
          payload: { case: "clearWaypoints", value: {} },
        }));
        return;

      case "configure_missile":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "configureMissile",
            value: { missileSpeed: msg.missile_speed, missileAgro: msg.missile_agro },
          },
        }));
        return;

      case "launch_missile":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "launchMissile",
            value: { routeId: msg.route_id || "" },
          },
        }));
        return;

      case "add_missile_waypoint":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "addMissileWaypoint",
            value: { routeId: msg.route_id || "", x: msg.x, y: msg.y, speed: msg.speed },
          },
        }));
        return;

      case "update_missile_waypoint_speed":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "updateMissileWaypointSpeed",
            value: { routeId: msg.route_id || "", index: msg.index, speed: msg.speed },
          },
        }));
        return;

      case "move_missile_waypoint":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "moveMissileWaypoint",
            value: { routeId: msg.route_id || "", index: msg.index, x: msg.x, y: msg.y },
          },
        }));
        return;

      case "delete_missile_waypoint":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "deleteMissileWaypoint",
            value: { routeId: msg.route_id || "", index: msg.index },
          },
        }));
        return;

      case "clear_missile_route":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "clearMissileRoute",
            value: { routeId: msg.route_id || "" },
          },
        }));
        return;

      case "add_missile_route":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "addMissileRoute",
            value: { name: msg.name || "" },
          },
        }));
        return;

      case "rename_missile_route":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "renameMissileRoute",
            value: { routeId: msg.route_id || "", name: msg.name || "" },
          },
        }));
        return;

      case "delete_missile_route":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "deleteMissileRoute",
            value: { routeId: msg.route_id || "" },
          },
        }));
        return;

      case "set_active_missile_route":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "setActiveMissileRoute",
            value: { routeId: msg.route_id || "" },
          },
        }));
        return;

      case "dag_start":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "dagStart",
            value: { nodeId: msg.node_id || "" },
          },
        }));
        return;

      case "clear_missile_waypoints":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "clearMissileWaypoints",
            value: { routeId: msg.route_id || "" },
          },
        }));
        return;
    }
  }
}

// ========== Phase 2: DAG Command Functions ==========

export function sendDagStart(nodeId: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  sendProto(create(WsEnvelopeSchema, {
    payload: {
      case: "dagStart",
      value: { nodeId },
    },
  }));
}

export function sendDagCancel(nodeId: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  sendProto(create(WsEnvelopeSchema, {
    payload: {
      case: "dagCancel",
      value: { nodeId },
    },
  }));
}

export function sendDagStoryAck(nodeId: string, choiceId: string = ""): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  sendProto(create(WsEnvelopeSchema, {
    payload: {
      case: "dagStoryAck",
      value: { nodeId, choiceId },
    },
  }));
}

export function sendDagList(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  sendProto(create(WsEnvelopeSchema, {
    payload: {
      case: "dagList",
      value: {},
    },
  }));
}

// ========== Phase 2: Mission Event Functions ==========

export function sendMissionSpawnWave(waveIndex: number): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  sendProto(create(WsEnvelopeSchema, {
    payload: {
      case: "missionSpawnWave",
      value: { waveIndex },
    },
  }));
}

export function sendMissionStoryEvent(event: string, beacon: number = 0): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  sendProto(create(WsEnvelopeSchema, {
    payload: {
      case: "missionStoryEvent",
      value: { event, beacon },
    },
  }));
}

export function connectWebSocket({
  room,
  state,
  bus,
  onStateUpdated,
  onOpen,
  mapW,
  mapH,
  mode,
  missionId,
}: ConnectOptions): void {
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  let wsUrl = `${protocol}${window.location.host}/ws?room=${encodeURIComponent(room)}`;
  if (mapW && mapW > 0) {
    wsUrl += `&mapW=${mapW}`;
  }
  if (mapH && mapH > 0) {
    wsUrl += `&mapH=${mapH}`;
  }
  if (mode) {
    wsUrl += `&mode=${encodeURIComponent(mode)}`;
  }
  if (missionId) {
    wsUrl += `&mission=${encodeURIComponent(missionId)}`;
  }
  ws = new WebSocket(wsUrl);
  // Set binary type for protobuf messages
  ws.binaryType = "arraybuffer";
  ws.addEventListener("open", () => {
    console.log("[ws] open");
    const socket = ws;
    if (socket && onOpen) {
      onOpen(socket);
    }
  });
  ws.addEventListener("close", () => console.log("[ws] close"));

  let prevRoutes = new Map<string, MissileRoute>();
  let prevActiveRoute: string | null = null;
  let prevMissileCount = 0;

  ws.addEventListener("message", (event) => {
    // Handle binary protobuf messages
    if (event.data instanceof ArrayBuffer) {
      try {
        const envelope = fromBinary(WsEnvelopeSchema, new Uint8Array(event.data));

        if (envelope.payload.case === "stateUpdate") {
          const protoState = protoToState(envelope.payload.value);
          handleProtoStateMessage(state, protoState, bus, prevRoutes, prevActiveRoute, prevMissileCount);
          prevRoutes = new Map(state.missileRoutes.map((route) => [route.id, cloneRoute(route)]));
          prevActiveRoute = state.activeMissileRouteId;
          prevMissileCount = state.missiles.length;
          bus.emit("state:updated");
          onStateUpdated?.();
        } else if (envelope.payload.case === "roomFull") {
          console.error("[ws] Room full:", envelope.payload.value.message);
          bus.emit("connection:error", { message: envelope.payload.value.message });
        } else if (envelope.payload.case === "dagListResponse") {
          // Handle DAG list response from Phase 2
          const dagData = envelope.payload.value.dag;
          if (dagData) {
            bus.emit("dag:list", protoToDagState(dagData));
          }
        } else {
          console.warn("[ws] Unknown protobuf message type:", envelope.payload.case);
        }
      } catch (err) {
        console.error("[ws] Failed to decode protobuf message:", err);
      }
      return;
    }
  });
}


// Handle protobuf state messages (simplified version of handleStateMessage)
function handleProtoStateMessage(
  state: AppState,
  msg: ReturnType<typeof protoToState>,
  bus: EventBus,
  prevRoutes: Map<string, MissileRoute>,
  prevActiveRoute: string | null,
  prevMissileCount: number,
): void {
  state.now = msg.now;
  state.nowSyncedAt = monotonicNow();
  state.nextMissileReadyAt = msg.nextMissileReady;

  // Update player ship
  if (msg.me) {
    state.me = {
      x: msg.me.x,
      y: msg.me.y,
      vx: msg.me.vx,
      vy: msg.me.vy,
      hp: msg.me.hp,
      kills: msg.me.kills,
      waypoints: msg.me.waypoints ?? [],
      currentWaypointIndex: msg.me.currentWaypointIndex ?? 0,
      heat: msg.me.heat ? convertHeatView(msg.me.heat, state.nowSyncedAt, state.now) : undefined,
    };
  } else {
    state.me = null;
  }

  // Update ghosts and missiles (already in correct format from proto_helpers)
  state.ghosts = msg.ghosts;
  state.missiles = msg.missiles;

  // Update missile routes
  const newRoutes: MissileRoute[] = msg.missileRoutes;
  diffRoutes(prevRoutes, newRoutes, bus);
  state.missileRoutes = newRoutes;

  // Update active route
  const nextActive = msg.activeMissileRoute || (newRoutes.length > 0 ? newRoutes[0].id : null);
  state.activeMissileRouteId = nextActive;
  if (nextActive !== prevActiveRoute) {
    bus.emit("missile:activeRouteChanged", { routeId: nextActive });
  }

  // Update missile config
  if (msg.missileConfig) {
    updateMissileLimits(state, {
      speedMin: msg.missileConfig.speedMin,
      speedMax: msg.missileConfig.speedMax,
      agroMin: msg.missileConfig.agroMin,
    });

    const prevHeat = state.missileConfig.heatParams;
    let heatParams: { max: number; warnAt: number; overheatAt: number; markerSpeed: number; kUp: number; kDown: number; exp: number } | undefined;
    if (msg.missileConfig.heatConfig) {
      const heatConfig = msg.missileConfig.heatConfig;
      heatParams = {
        max: heatConfig.max ?? prevHeat?.max ?? 0,
        warnAt: heatConfig.warnAt ?? prevHeat?.warnAt ?? 0,
        overheatAt: heatConfig.overheatAt ?? prevHeat?.overheatAt ?? 0,
        markerSpeed: heatConfig.markerSpeed ?? prevHeat?.markerSpeed ?? 0,
        kUp: heatConfig.kUp ?? prevHeat?.kUp ?? 0,
        kDown: heatConfig.kDown ?? prevHeat?.kDown ?? 0,
        exp: heatConfig.exp ?? prevHeat?.exp ?? 1,
      };
    }

    const sanitized = sanitizeMissileConfig({
      speed: msg.missileConfig.speed,
      agroRadius: msg.missileConfig.agroRadius,
      heatParams,
    }, state.missileConfig, state.missileLimits);
    sanitized.lifetime = msg.missileConfig.lifetime;
    state.missileConfig = sanitized;
  }

  // Update world meta
  state.worldMeta = {
    c: msg.meta.c,
    w: msg.meta.w,
    h: msg.meta.h,
  };

  // Phase 2: Update inventory
  if (msg.inventory) {
    state.inventory = {
      items: msg.inventory.items.map((item) => ({
        type: item.type,
        variant_id: item.variantId,
        heat_capacity: item.heatCapacity,
        quantity: item.quantity,
      })),
    };
  }

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
        effects: node.effects || [],
      })),
    };
  }

  // Phase 2: Update capabilities
  if (msg.capabilities) {
    state.capabilities = {
      speedMultiplier: msg.capabilities.speedMultiplier,
      unlockedMissiles: msg.capabilities.unlockedMissiles,
      heatCapacity: msg.capabilities.heatCapacity,
      heatEfficiency: msg.capabilities.heatEfficiency,
    };
  }

  // Phase 2: Update story
  if (msg.story) {
    const prevActiveNode = state.story?.activeNode ?? null;

    // Convert story dialogue to DialogueContent format
    let dialogue: DialogueContent | null = null;
    if (msg.story.dialogue) {
      const d = msg.story.dialogue;
      dialogue = {
        speaker: d.speaker,
        text: d.text,
        intent: d.intent as "factory" | "unit",
        typingSpeedMs: 18,
        continueLabel: d.continueLabel,
        choices: d.choices?.map(c => ({ id: c.id, text: c.text })),
        tutorialTip: d.tutorialTip ? {
          title: d.tutorialTip.title,
          text: d.tutorialTip.text,
        } : undefined,
      };
    }

    state.story = {
      activeNode: msg.story.activeNode || null,
      dialogue,
      available: msg.story.available,
      flags: msg.story.flags,
      recentEvents: msg.story.recentEvents.map((evt) => ({
        chapter: evt.chapterId,
        node: evt.nodeId,
        timestamp: evt.timestamp,
      })),
    };

    // Emit event when active story node changes
    if (state.story.activeNode !== prevActiveNode && state.story.activeNode) {
      bus.emit("story:nodeActivated", {
        nodeId: state.story.activeNode,
        dialogue: state.story.dialogue ?? undefined,
      });
    }
  }

  // Emit missile count change if needed
  const newMissileCount = state.missiles.length;
  if (newMissileCount > prevMissileCount) {
    for (let i = prevMissileCount; i < newMissileCount; i++) {
      const m = state.missiles[i];
      if (m && m.self) {
        bus.emit("missile:launched", { routeId: msg.activeMissileRoute || "" });
      }
    }
  }

  // Emit cooldown update
  const cooldownRemaining = Math.max(0, state.nextMissileReadyAt - getApproxServerNow(state));
  bus.emit("missile:cooldownUpdated", { secondsRemaining: cooldownRemaining });
}

function diffRoutes(prevRoutes: Map<string, MissileRoute>, nextRoutes: MissileRoute[], bus: EventBus): void {
  const seen = new Set<string>();
  for (const route of nextRoutes) {
    seen.add(route.id);
    const prev = prevRoutes.get(route.id);
    if (!prev) {
      bus.emit("missile:routeAdded", { routeId: route.id });
      continue;
    }
    if (route.name !== prev.name) {
      bus.emit("missile:routeRenamed", { routeId: route.id, name: route.name });
    }
    if (route.waypoints.length > prev.waypoints.length) {
      bus.emit("missile:waypointAdded", { routeId: route.id, index: route.waypoints.length - 1 });
    } else if (route.waypoints.length < prev.waypoints.length) {
      bus.emit("missile:waypointDeleted", { routeId: route.id, index: prev.waypoints.length - 1 });
    }
    if (prev.waypoints.length > 0 && route.waypoints.length === 0) {
      bus.emit("missile:waypointsCleared", { routeId: route.id });
    }
  }
  for (const [routeId] of prevRoutes) {
    if (!seen.has(routeId)) {
      bus.emit("missile:routeDeleted", { routeId });
    }
  }
}

function cloneRoute(route: MissileRoute): MissileRoute {
  return {
    id: route.id,
    name: route.name,
    waypoints: route.waypoints.map((wp) => ({ ...wp })),
  };
}

export function getApproxServerNow(state: AppState): number {
  if (!Number.isFinite(state.now)) {
    return 0;
  }
  const syncedAt = Number.isFinite(state.nowSyncedAt) ? state.nowSyncedAt : null;
  if (!syncedAt) {
    return state.now;
  }
  const elapsedMs = monotonicNow() - syncedAt;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return state.now;
  }
  return state.now + elapsedMs / 1000;
}

function convertHeatView(serverHeat: { v: number; m: number; w: number; o: number; ms: number; su: number; ku: number; kd: number; ex: number }, nowSyncedAtMs: number, serverNowSec: number): import("./state").HeatView {
  // Convert server time (stallUntil in seconds) to client time (milliseconds)
  // stallUntil is absolute server time, so we need to convert it to client time
  const serverStallUntilSec = serverHeat.su;
  const offsetFromNowSec = serverStallUntilSec - serverNowSec;
  const stallUntilMs = nowSyncedAtMs + (offsetFromNowSec * 1000);

  const heatView = {
    value: serverHeat.v,
    max: serverHeat.m,
    warnAt: serverHeat.w,
    overheatAt: serverHeat.o,
    markerSpeed: serverHeat.ms,
    stallUntilMs: stallUntilMs,
    kUp: serverHeat.ku,
    kDown: serverHeat.kd,
    exp: serverHeat.ex,
  };
  return heatView;
}
