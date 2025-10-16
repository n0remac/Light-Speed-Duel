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

interface ServerMissileWaypoint {
  x: number;
  y: number;
  speed?: number;
}

interface ServerMissileRoute {
  id: string;
  name?: string;
  waypoints?: ServerMissileWaypoint[];
}

interface ServerHeatView {
  v: number;  // current heat value
  m: number;  // max
  w: number;  // warnAt
  o: number;  // overheatAt
  ms: number; // markerSpeed
  su: number; // stallUntil (server time seconds)
  ku: number; // kUp
  kd: number; // kDown
  ex: number; // exp
}

interface ServerShipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp?: number;
  kills?: number;
  waypoints?: Array<{ x: number; y: number; speed?: number }>;
  current_waypoint_index?: number;
  heat?: ServerHeatView;
}

interface ServerMissileState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  self?: boolean;
  agro_radius: number;
}

interface ServerStateMessage {
  type: "state";
  now: number;
  next_missile_ready?: number;
  me?: ServerShipState | null;
  ghosts?: Array<{ x: number; y: number; vx: number; vy: number }>;
  missiles?: ServerMissileState[];
  missile_routes?: ServerMissileRoute[];
  missile_config?: {
    speed?: number;
    speed_min?: number;
    speed_max?: number;
    agro_radius?: number;
    agro_min?: number;
    lifetime?: number;
    heat_config?: {
      max?: number;
      warn_at?: number;
      overheat_at?: number;
      marker_speed?: number;
      k_up?: number;
      k_down?: number;
      exp?: number;
    } | null;
  } | null;
  active_missile_route?: string | null;
  meta?: {
    c?: number;
    w?: number;
    h?: number;
  };
  inventory?: {
    items?: Array<{
      type: string;
      variant_id: string;
      heat_capacity: number;
      quantity: number;
    }>;
  };
  dag?: {
    nodes?: Array<{
      id: string;
      kind: string;
      label: string;
      status: string;
      remaining_s: number;
      duration_s: number;
      repeatable: boolean;
    }>;
  };
  story?: {
    active_node?: string;
    dialogue?: {
      speaker: string;
      text: string;
      intent: string;
      continue_label?: string;
      choices?: Array<{
        id: string;
        text: string;
      }>;
      tutorial_tip?: {
        title: string;
        text: string;
      };
    };
    available?: string[];
    flags?: Record<string, boolean>;
    recent_events?: Array<{
      chapter: string;
      node: string;
      timestamp: number;
    }>;
  };
}

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
    }
  }

  // Fall back to JSON for DAG, mission, and other messages
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  ws.send(data);
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

    // Fall back to JSON for legacy/DAG messages
    const data = safeParse(event.data);
    if (!data || data.type !== "state") {
      return;
    }
    handleStateMessage(state, data, bus, prevRoutes, prevActiveRoute, prevMissileCount);
    prevRoutes = new Map(state.missileRoutes.map((route) => [route.id, cloneRoute(route)]));
    prevActiveRoute = state.activeMissileRouteId;
    prevMissileCount = state.missiles.length;
    bus.emit("state:updated");
    onStateUpdated?.();
  });
}

function handleStateMessage(
  state: AppState,
  msg: ServerStateMessage,
  bus: EventBus,
  prevRoutes: Map<string, MissileRoute>,
  prevActiveRoute: string | null,
  prevMissileCount: number,
): void {
  state.now = msg.now;
  state.nowSyncedAt = monotonicNow();
  state.nextMissileReadyAt = Number.isFinite(msg.next_missile_ready) ? msg.next_missile_ready! : 0;
  state.me = msg.me ? {
    x: msg.me.x,
    y: msg.me.y,
    vx: msg.me.vx,
    vy: msg.me.vy,
    hp: msg.me.hp,
    kills: msg.me.kills ?? 0,
    waypoints: Array.isArray(msg.me.waypoints)
      ? msg.me.waypoints.map((wp) => ({ x: wp.x, y: wp.y, speed: Number.isFinite(wp.speed) ? wp.speed! : 180 }))
      : [],
    currentWaypointIndex: msg.me.current_waypoint_index ?? 0,
    heat: msg.me.heat ? convertHeatView(msg.me.heat, state.nowSyncedAt, state.now) : undefined,
  } : null;
  state.ghosts = Array.isArray(msg.ghosts) ? msg.ghosts.slice() : [];
  state.missiles = Array.isArray(msg.missiles) ? msg.missiles.slice() : [];

  const routesFromServer = Array.isArray(msg.missile_routes) ? msg.missile_routes : [];
  const newRoutes: MissileRoute[] = routesFromServer.map((route) => ({
    id: route.id,
    name: route.name || route.id || "Route",
    waypoints: Array.isArray(route.waypoints)
      ? route.waypoints.map((wp) => ({
          x: wp.x,
          y: wp.y,
          speed: Number.isFinite(wp.speed) ? wp.speed! : state.missileConfig.speed,
        }))
      : [],
  }));

  diffRoutes(prevRoutes, newRoutes, bus);
  state.missileRoutes = newRoutes;

  const nextActive = typeof msg.active_missile_route === "string" && msg.active_missile_route.length > 0
    ? msg.active_missile_route
    : newRoutes.length > 0
      ? newRoutes[0].id
      : null;
  state.activeMissileRouteId = nextActive;
  if (nextActive !== prevActiveRoute) {
    bus.emit("missile:activeRouteChanged", { routeId: nextActive ?? null });
  }

  if (msg.missile_config) {
    if (Number.isFinite(msg.missile_config.speed_min) || Number.isFinite(msg.missile_config.speed_max) || Number.isFinite(msg.missile_config.agro_min)) {
      updateMissileLimits(state, {
        speedMin: msg.missile_config.speed_min,
        speedMax: msg.missile_config.speed_max,
        agroMin: msg.missile_config.agro_min,
      });
    }
    const prevHeat = state.missileConfig.heatParams;
    let heatParams: { max: number; warnAt: number; overheatAt: number; markerSpeed: number; kUp: number; kDown: number; exp: number } | undefined;
    const heatConfig = msg.missile_config.heat_config;
    if (heatConfig) {
      heatParams = {
        max: Number.isFinite(heatConfig.max) ? heatConfig.max! : prevHeat?.max ?? 0,
        warnAt: Number.isFinite(heatConfig.warn_at) ? heatConfig.warn_at! : prevHeat?.warnAt ?? 0,
        overheatAt: Number.isFinite(heatConfig.overheat_at) ? heatConfig.overheat_at! : prevHeat?.overheatAt ?? 0,
        markerSpeed: Number.isFinite(heatConfig.marker_speed) ? heatConfig.marker_speed! : prevHeat?.markerSpeed ?? 0,
        kUp: Number.isFinite(heatConfig.k_up) ? heatConfig.k_up! : prevHeat?.kUp ?? 0,
        kDown: Number.isFinite(heatConfig.k_down) ? heatConfig.k_down! : prevHeat?.kDown ?? 0,
        exp: Number.isFinite(heatConfig.exp) ? heatConfig.exp! : prevHeat?.exp ?? 1,
      };
    }
    const sanitized = sanitizeMissileConfig({
      speed: msg.missile_config.speed,
      agroRadius: msg.missile_config.agro_radius,
      heatParams,
    }, state.missileConfig, state.missileLimits);
    if (Number.isFinite(msg.missile_config.lifetime)) {
      sanitized.lifetime = msg.missile_config.lifetime!;
    }
    state.missileConfig = sanitized;
  }

  const meta = msg.meta ?? {};
  const hasC = typeof meta.c === "number" && Number.isFinite(meta.c);
  const hasW = typeof meta.w === "number" && Number.isFinite(meta.w);
  const hasH = typeof meta.h === "number" && Number.isFinite(meta.h);
  state.worldMeta = {
    c: hasC ? meta.c! : state.worldMeta.c,
    w: hasW ? meta.w! : state.worldMeta.w,
    h: hasH ? meta.h! : state.worldMeta.h,
  };

  if (msg.inventory && Array.isArray(msg.inventory.items)) {
    state.inventory = {
      items: msg.inventory.items.map((item) => ({
        type: item.type,
        variant_id: item.variant_id,
        heat_capacity: item.heat_capacity,
        quantity: item.quantity,
      })),
    };
  }

  if (msg.dag && Array.isArray(msg.dag.nodes)) {
    state.dag = {
      nodes: msg.dag.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        label: node.label,
        status: node.status,
        remaining_s: node.remaining_s,
        duration_s: node.duration_s,
        repeatable: node.repeatable,
      })),
    };
  }

  if (msg.story) {

    const prevActiveNode = state.story?.activeNode ?? null;

    // Convert server dialogue to DialogueContent format
    let dialogue: DialogueContent | null = null;
    if (msg.story.dialogue) {
      const d = msg.story.dialogue;
      dialogue = {
        speaker: d.speaker,
        text: d.text,
        intent: d.intent as "factory" | "unit",
        typingSpeedMs: 18, // Default, or could come from server
        continueLabel: d.continue_label,
        choices: d.choices?.map(c => ({ id: c.id, text: c.text })),
        tutorialTip: d.tutorial_tip ? {
          title: d.tutorial_tip.title,
          text: d.tutorial_tip.text,
        } : undefined,
      };
    }

    state.story = {
      activeNode: msg.story.active_node ?? null,
      dialogue, // Store dialogue
      available: Array.isArray(msg.story.available) ? msg.story.available : [],
      flags: msg.story.flags ?? {},
      recentEvents: Array.isArray(msg.story.recent_events) ? msg.story.recent_events.map((evt) => ({
        chapter: evt.chapter,
        node: evt.node,
        timestamp: evt.timestamp,
      })) : [],
    };
    // Emit event when active story node changes
    if (state.story.activeNode !== prevActiveNode && state.story.activeNode) {
      bus.emit("story:nodeActivated", {
        nodeId: state.story.activeNode,
        dialogue: state.story.dialogue ?? undefined, // Pass dialogue
      });
    }
  }

  if (state.missiles.length > prevMissileCount) {
    const activeRouteId = state.activeMissileRouteId;
    if (activeRouteId) {
      bus.emit("missile:launched", { routeId: activeRouteId });
    } else {
      bus.emit("missile:launched", { routeId: "" });
    }
  }

  const cooldownRemaining = Math.max(0, state.nextMissileReadyAt - getApproxServerNow(state));
  bus.emit("missile:cooldownUpdated", { secondsRemaining: cooldownRemaining });
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
      })),
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

function safeParse(value: unknown): ServerStateMessage | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as ServerStateMessage;
  } catch (err) {
    console.warn("[ws] failed to parse message", err);
    return null;
  }
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

function convertHeatView(serverHeat: ServerHeatView, nowSyncedAtMs: number, serverNowSec: number): import("./state").HeatView {
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
