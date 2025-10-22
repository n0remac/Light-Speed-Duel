import { type EventBus } from "./bus";
import {
  type AppState,
  type MissileRoute,
  type MissionState,
  type MissionBeacon,
  type MissionEncounterState,
  type MissionPlayerState,
  type MissionObjectiveState,
  type DebugBeaconInfo,
  type DebugEncounterInfo,
  monotonicNow,
  sanitizeMissileConfig,
  updateMissileLimits,
  clampProgress,
} from "./state";
import type { DialogueContent } from "./story/types";
import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import {
  WsEnvelopeSchema,
  type WsEnvelope,
  MissionBeaconDeltaType,
  MissionEncounterEventType,
} from "./proto/proto/ws_messages_pb";
import type { MissionBeaconSnapshot, MissionBeaconDelta } from "./proto/proto/ws_messages_pb";
import { protoToState, protoToDagState } from "./proto_helpers";
import type { MissionOfferDTO, MissionUpdateDTO, ObjectiveStateDTO } from "./mission/types";

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
let connectedState: AppState | null = null;
let connectedBus: EventBus | null = null;

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

      case "dag_story_ack":
        sendProto(create(WsEnvelopeSchema, {
          payload: {
            case: "dagStoryAck",
            value: { nodeId: msg.node_id || "", choiceId: msg.choice_id || "" },
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

      case "mission:accept":
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
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

export function acceptMission(missionId: string): void {
  if (!missionId) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // Allow local state update even if socket not ready for resilience
    if (connectedState && connectedBus) {
      const mission = ensureMissionState(connectedState);
      mission.missionId = missionId;
      mission.status = "active";
      mission.startTime = mission.startTime ?? getApproxServerNow(connectedState);
      connectedBus.emit("mission:start", { missionId });
    }
    return;
  }

  ws.send(JSON.stringify({ type: "mission:accept", payload: { missionId } }));

  if (connectedState && connectedBus) {
    const mission = ensureMissionState(connectedState);
    mission.missionId = missionId;
    mission.status = "active";
    mission.startTime = mission.startTime ?? getApproxServerNow(connectedState);
    connectedBus.emit("mission:start", { missionId });
  }
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
  connectedState = state;
  connectedBus = bus;
  // Set binary type for protobuf messages
  ws.binaryType = "arraybuffer";
  ws.addEventListener("open", () => {
    console.log("[ws] open");
    const socket = ws;
    if (socket && onOpen) {
      onOpen(socket);
    }
  });
  ws.addEventListener("close", () => {
    console.log("[ws] close");
    connectedState = null;
    connectedBus = null;
  });

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
        } else if (envelope.payload.case === "missionBeaconSnapshot") {
          handleMissionSnapshot(state, envelope.payload.value, bus);
        } else if (envelope.payload.case === "missionBeaconDelta") {
          handleMissionDelta(state, envelope.payload.value, bus);
        } else {
          console.warn("[ws] Unknown protobuf message type:", envelope.payload.case);
        }
      } catch (err) {
        console.error("[ws] Failed to decode protobuf message:", err);
      }
      return;
    }

    if (typeof event.data === "string") {
      handleJsonMessage(state, bus, event.data);
      return;
    }

    if (event.data instanceof Blob) {
      event.data.text()
        .then((text) => handleJsonMessage(state, bus, text))
        .catch((err) => console.error("[ws] Failed to read text message:", err));
      return;
    }
  });
}


// Handle protobuf state messages (simplified version of handleStateMessage)
function handleJsonMessage(state: AppState, bus: EventBus, raw: string): void {
  if (!raw) {
    return;
  }
  let msg: { type?: string; payload?: unknown };
  try {
    msg = JSON.parse(raw);
  } catch (err) {
    console.error("[ws] Failed to parse JSON message:", err);
    return;
  }
  if (!msg || typeof msg.type !== "string") {
    return;
  }

  switch (msg.type) {
    case "mission:offer": {
      const payload = msg.payload as Partial<MissionOfferDTO> | undefined;
      if (!payload) {
        return;
      }
      const mission = ensureMissionState(state);
      mission.missionId = payload.missionId ?? mission.missionId ?? "";
      mission.templateId = payload.templateId ?? "";
      mission.displayName = payload.displayName ?? mission.displayName ?? "";
      mission.archetype = payload.archetype ?? mission.archetype ?? "";
      mission.timeout = Number.isFinite(payload.timeout) ? Number(payload.timeout) : 0;
      mission.status = "idle";
      mission.startTime = null;
      mission.completionTime = null;
      mission.progress = 0;
      mission.objectives = [];
      mission.objectiveSummaries = Array.isArray(payload.objectives) ? [...payload.objectives] : [];
      mission.serverTime = getApproxServerNow(state);

      bus.emit("mission:offered", {
        missionId: mission.missionId,
        templateId: mission.templateId,
        displayName: mission.displayName,
        archetype: mission.archetype,
        objectives: mission.objectiveSummaries,
        timeout: mission.timeout,
      });
      break;
    }

    case "mission:update": {
      const payload = msg.payload as Partial<MissionUpdateDTO> | undefined;
      if (!payload) {
        return;
      }
      const mission = ensureMissionState(state);
      if (payload.missionId) {
        mission.missionId = payload.missionId;
      }
      if (Number.isFinite(payload.serverTime)) {
        mission.serverTime = Number(payload.serverTime);
      }
      if (typeof payload.status === "string") {
        mission.status = payload.status as MissionStatus;
      }
      if (mission.status === "active" && mission.startTime == null) {
        mission.startTime = getApproxServerNow(state);
      }
      if (payload.objectives) {
        const objectives = updateMissionObjectives(state, bus, payload.objectives);
        bus.emit("mission:update", {
          missionId: mission.missionId,
          status: mission.status,
          objectives,
          serverTime: mission.serverTime,
        });
      } else {
        bus.emit("mission:update", {
          missionId: mission.missionId,
          status: mission.status,
          objectives: mission.objectives,
          serverTime: mission.serverTime,
        });
      }

      if (mission.status === "completed") {
        mission.completionTime = mission.serverTime;
        mission.progress = 1;
        bus.emit("mission:completed", { missionId: mission.missionId });
      } else if (mission.status === "failed") {
        mission.completionTime = mission.serverTime;
        bus.emit("mission:failed", { missionId: mission.missionId });
      }
      break;
    }

    case "debug:beacons": {
      const payload = msg.payload as { beacons?: unknown } | undefined;
      const beaconsArray = Array.isArray(payload?.beacons) ? payload!.beacons : [];
      const beacons: DebugBeaconInfo[] = beaconsArray.map(normalizeDebugBeacon);
      state.debug.beacons = beacons;
      state.debug.lastReceivedAt = getApproxServerNow(state);
      bus.emit("debug:beacons", { beacons });
      break;
    }

    case "debug:encounters": {
      const payload = msg.payload as { encounters?: unknown } | undefined;
      const encountersArray = Array.isArray(payload?.encounters) ? payload!.encounters : [];
      const encounters: DebugEncounterInfo[] = encountersArray.map(normalizeDebugEncounter);
      state.debug.encounters = encounters;
      state.debug.lastReceivedAt = getApproxServerNow(state);
      bus.emit("debug:encounters", { encounters });
      break;
    }

    default:
      break;
  }
}

function updateMissionObjectives(state: AppState, bus: EventBus, objectiveDTOs: ObjectiveStateDTO[]): MissionObjectiveState[] {
  const mission = ensureMissionState(state);
  const objectives = Array.isArray(objectiveDTOs)
    ? objectiveDTOs.map((obj) => ({
      id: obj.id ?? "",
      type: obj.type ?? "unknown",
      progress: clampProgress(obj.progress ?? 0),
      complete: Boolean(obj.complete),
      description: obj.description ?? "",
    }))
    : [];

  mission.objectives = objectives;
  mission.progress = calculateMissionProgress(objectives);

  bus.emit("mission:objectives-updated", { objectives });
  bus.emit("mission:progress-changed", { progress: mission.progress, objectives });

  return objectives;
}

function calculateMissionProgress(objectives: MissionObjectiveState[]): number {
  if (!objectives || objectives.length === 0) {
    return 0;
  }
  const total = objectives.reduce((sum, obj) => sum + clampProgress(obj.progress), 0);
  const mean = total / objectives.length;
  return clampProgress(mean);
}

function normalizeDebugBeacon(raw: any): DebugBeaconInfo {
  const id = typeof raw?.id === "string" ? raw.id : String(raw?.id ?? "");
  const x = Number(raw?.x);
  const y = Number(raw?.y);
  const tags = Array.isArray(raw?.tags) ? raw.tags.map((tag: unknown) => String(tag ?? "")) : [];
  return {
    id,
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    tags,
    pinned: Boolean(raw?.pinned),
  };
}

function normalizeDebugEncounter(raw: any): DebugEncounterInfo {
  const encounterId = typeof raw?.encounterId === "string" ? raw.encounterId : String(raw?.encounterId ?? "");
  const beaconId = typeof raw?.beaconId === "string" ? raw.beaconId : String(raw?.beaconId ?? "");
  const spawnTimeNum = Number(raw?.spawnTime);
  const lifetimeNum = Number(raw?.lifetime);
  const entityCountNum = Number(raw?.entityCount);
  return {
    encounterId,
    beaconId,
    spawnTime: Number.isFinite(spawnTimeNum) ? spawnTimeNum : 0,
    lifetime: Number.isFinite(lifetimeNum) ? Math.max(0, lifetimeNum) : 0,
    entityCount: Number.isFinite(entityCountNum) ? Math.max(0, Math.floor(entityCountNum)) : 0,
  };
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

  // Phase 2: Update DAG (protoToState already normalized via proto_helpers)
  if (msg.dag) {
    state.dag = {
      nodes: msg.dag.nodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        status: n.status,
        remaining_s: n.remainingS,
        duration_s: n.durationS,
        repeatable: n.repeatable,
        effects: n.effects,
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

function handleMissionSnapshot(state: AppState, snapshot: MissionBeaconSnapshot, bus: EventBus): void {
  const mission = ensureMissionState(state);
  const previousMissionId = mission.missionId;
  mission.missionId = snapshot.missionId || mission.missionId || "";
  mission.layoutSeed = Number(snapshot.layoutSeed ?? mission.layoutSeed ?? 0);
  mission.serverTime = Number.isFinite(snapshot.serverTime) ? snapshot.serverTime : mission.serverTime;

  const previousBeacons = new Map(mission.beacons.map((b) => [b.id, b]));
  mission.beacons = snapshot.beacons
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((def): MissionBeacon => {
      const prev = previousBeacons.get(def.id);
      return {
        id: def.id,
        ordinal: def.ordinal,
        x: def.x,
        y: def.y,
        radius: def.radius,
        seed: Number(def.seed || 0),
        discovered: prev?.discovered ?? false,
        completed: prev?.completed ?? false,
        cooldownUntil: prev?.cooldownUntil ?? null,
      };
    });

  const localPlayerId = getLocalPlayerId(state);
  let playerProto = localPlayerId
    ? snapshot.players.find((p) => p.playerId === localPlayerId) || null
    : null;
  if (!playerProto && snapshot.players.length === 1) {
    playerProto = snapshot.players[0];
  }

  if (playerProto) {
    const nowMs = monotonicNow();
    const discoveredSet = new Set(playerProto.discovered ?? []);
    const completedSet = new Set(playerProto.completed ?? []);
    for (const beacon of mission.beacons) {
      beacon.discovered = discoveredSet.has(beacon.id);
      beacon.completed = completedSet.has(beacon.id);
      const cooldown = playerProto.cooldowns?.[beacon.id];
      beacon.cooldownUntil = Number.isFinite(cooldown) ? cooldown : null;
    }

    let player = mission.player;
    if (!player || player.playerId !== playerProto.playerId) {
      player = {
        playerId: playerProto.playerId,
        currentIndex: playerProto.currentIndex ?? 0,
        activeBeaconId: playerProto.activeBeacon || null,
        holdAccum: playerProto.holdAccum ?? 0,
        holdRequired: Math.max(0, playerProto.holdRequired ?? 0),
        displayHold: playerProto.holdAccum ?? 0,
        lastServerUpdate: Number.isFinite(snapshot.serverTime) ? snapshot.serverTime : getApproxServerNow(state),
        lastDisplaySync: nowMs,
        insideActiveBeacon: false,
      };
      mission.player = player;
    } else {
      player.currentIndex = playerProto.currentIndex ?? player.currentIndex;
      player.activeBeaconId = playerProto.activeBeacon || null;
      player.holdAccum = playerProto.holdAccum ?? player.holdAccum;
      player.holdRequired = Math.max(0, playerProto.holdRequired ?? player.holdRequired);
      player.displayHold = playerProto.holdAccum ?? player.displayHold ?? 0;
      player.lastServerUpdate = Number.isFinite(snapshot.serverTime) ? snapshot.serverTime : getApproxServerNow(state);
      player.lastDisplaySync = nowMs;
    }

    mission.status = completedSet.size > 0 && completedSet.size >= mission.beacons.length && mission.beacons.length > 0
      ? "completed"
      : "active";
  } else if (!mission.player || mission.player.playerId === "") {
    mission.player = null;
    mission.status = "idle";
    for (const beacon of mission.beacons) {
      beacon.discovered = false;
      beacon.completed = false;
      beacon.cooldownUntil = null;
    }
  }

  mission.encounters = snapshot.encounters.map((enc): MissionEncounterState => ({
    id: enc.encounterId,
    beaconId: enc.beaconId,
    waveIndex: enc.waveIndex,
    spawnedAt: enc.spawnedAt,
    expiresAt: enc.expiresAt,
    active: true,
  }));

  // If this is a new mission id, reset transient player state
  if (mission.player && mission.missionId !== previousMissionId) {
    mission.player.displayHold = mission.player.holdAccum;
    mission.player.lastDisplaySync = monotonicNow();
    mission.player.insideActiveBeacon = false;
  }

  alignMissionProgress(mission);
  bus.emit("mission:update", { reason: "snapshot" });
}

function handleMissionDelta(state: AppState, delta: MissionBeaconDelta, bus: EventBus): void {
  const mission = ensureMissionState(state);
  const nowMs = monotonicNow();
  const approxNow = getApproxServerNow(state);
  const localPlayerId = getLocalPlayerId(state) ?? mission.player?.playerId ?? null;
  let changed = false;

  for (const entry of delta.players ?? []) {
    if (localPlayerId && entry.playerId !== localPlayerId) {
      continue;
    }
    const player = ensureMissionPlayer(mission, entry.playerId);
    if (Number.isFinite(entry.holdRequired) && entry.holdRequired > 0) {
      player.holdRequired = entry.holdRequired;
    }
    if (Number.isFinite(entry.holdAccum)) {
      player.holdAccum = entry.holdAccum;
    }
    player.lastServerUpdate = Number.isFinite(entry.serverTime) ? entry.serverTime : approxNow;
    player.lastDisplaySync = nowMs;

    const beacon = findBeaconForDelta(mission, entry);

    switch (entry.type) {
      case MissionBeaconDeltaType.MISSION_BEACON_DELTA_DISCOVERED:
        if (beacon) {
          beacon.discovered = true;
          changed = true;
        }
        break;
      case MissionBeaconDeltaType.MISSION_BEACON_DELTA_HOLD_PROGRESS:
        changed = true;
        break;
      case MissionBeaconDeltaType.MISSION_BEACON_DELTA_HOLD_RESET:
        player.holdAccum = 0;
        player.displayHold = Math.min(player.displayHold, 0);
        changed = true;
        break;
      case MissionBeaconDeltaType.MISSION_BEACON_DELTA_LOCKED:
        if (beacon) {
          beacon.completed = true;
          const cooldown = Number.isFinite(entry.cooldownUntil) ? entry.cooldownUntil : null;
          beacon.cooldownUntil = cooldown;
          changed = true;
        }
        player.holdAccum = 0;
        player.displayHold = 0;
        break;
      case MissionBeaconDeltaType.MISSION_BEACON_DELTA_COOLDOWN:
        if (beacon) {
          const cooldown = Number.isFinite(entry.cooldownUntil) ? entry.cooldownUntil : null;
          beacon.cooldownUntil = cooldown;
          changed = true;
        }
        break;
      case MissionBeaconDeltaType.MISSION_BEACON_DELTA_MISSION_COMPLETED:
        mission.status = "completed";
        player.holdAccum = 0;
        player.displayHold = 0;
        player.activeBeaconId = null;
        changed = true;
        break;
      default:
        break;
    }
  }

  if (delta.encounters && delta.encounters.length > 0) {
    const encounterMap = new Map<string, MissionEncounterState>();
    for (const enc of mission.encounters) {
      encounterMap.set(enc.id, { ...enc });
    }
    for (const event of delta.encounters) {
      let encounter = encounterMap.get(event.encounterId);
      if (!encounter) {
        encounter = {
          id: event.encounterId,
          beaconId: event.beaconId,
          waveIndex: event.waveIndex,
          spawnedAt: event.spawnedAt,
          expiresAt: event.expiresAt,
          active: false,
        };
        encounterMap.set(event.encounterId, encounter);
      }
      encounter.beaconId = event.beaconId || encounter.beaconId;
      encounter.waveIndex = event.waveIndex ?? encounter.waveIndex;
      encounter.spawnedAt = Number.isFinite(event.spawnedAt) ? event.spawnedAt : encounter.spawnedAt;
      encounter.expiresAt = Number.isFinite(event.expiresAt) ? event.expiresAt : encounter.expiresAt;
      switch (event.type) {
        case MissionEncounterEventType.MISSION_ENCOUNTER_EVENT_SPAWNED:
          encounter.active = true;
          encounter.reason = undefined;
          break;
        case MissionEncounterEventType.MISSION_ENCOUNTER_EVENT_CLEARED:
          encounter.active = false;
          encounter.reason = event.reason || "cleared";
          break;
        case MissionEncounterEventType.MISSION_ENCOUNTER_EVENT_TIMEOUT:
          encounter.active = false;
          encounter.reason = event.reason || "timeout";
          break;
        case MissionEncounterEventType.MISSION_ENCOUNTER_EVENT_PURGED:
          encounter.active = false;
          encounter.reason = event.reason || "purged";
          break;
        default:
          break;
      }
    }
    mission.encounters = Array.from(encounterMap.values()).sort((a, b) => a.spawnedAt - b.spawnedAt);
    changed = true;
  }

  if (mission.player) {
    mission.player.displayHold = Math.min(mission.player.displayHold, mission.player.holdAccum);
  }

  if (changed) {
    alignMissionProgress(mission);
    bus.emit("mission:update", { reason: "delta" });
  }
}

function ensureMissionState(state: AppState): MissionState {
  if (!state.mission) {
    state.mission = {
      missionId: "",
      templateId: "",
      displayName: "",
      archetype: "",
      layoutSeed: 0,
      serverTime: 0,
      status: "idle",
      timeout: 0,
      startTime: null,
      completionTime: null,
      progress: 0,
      beacons: [],
      player: null,
      encounters: [],
      objectives: [],
      objectiveSummaries: [],
    };
  } else {
    state.mission.templateId = state.mission.templateId ?? "";
    state.mission.displayName = state.mission.displayName ?? "";
    state.mission.archetype = state.mission.archetype ?? "";
    state.mission.timeout = state.mission.timeout ?? 0;
    state.mission.startTime = state.mission.startTime ?? null;
    state.mission.completionTime = state.mission.completionTime ?? null;
    state.mission.progress = state.mission.progress ?? 0;
    state.mission.objectives = state.mission.objectives ?? [];
    state.mission.objectiveSummaries = state.mission.objectiveSummaries ?? [];
  }
  return state.mission;
}

function ensureMissionPlayer(mission: MissionState, playerId: string): MissionPlayerState {
  const nowMs = monotonicNow();
  if (!mission.player || mission.player.playerId !== playerId) {
    mission.player = {
      playerId,
      currentIndex: mission.player?.currentIndex ?? 0,
      activeBeaconId: mission.player?.activeBeaconId ?? null,
      holdAccum: mission.player?.holdAccum ?? 0,
      holdRequired: mission.player?.holdRequired ?? 0,
      displayHold: mission.player?.displayHold ?? 0,
      lastServerUpdate: mission.player?.lastServerUpdate ?? 0,
      lastDisplaySync: nowMs,
      insideActiveBeacon: mission.player?.insideActiveBeacon ?? false,
    };
  }
  return mission.player;
}

function getLocalPlayerId(state: AppState): string | null {
  if (state.mission?.player?.playerId) {
    return state.mission.player.playerId;
  }
  const id = state.me?.id;
  if (!id) return null;
  if (id.startsWith("ship-")) {
    return id.slice("ship-".length);
  }
  return id;
}

function findBeaconForDelta(mission: MissionState, delta: { beaconId: string; ordinal: number }): MissionBeacon | undefined {
  if (!mission.beacons.length) return undefined;
  if (delta.beaconId) {
    const beacon = mission.beacons.find((b) => b.id === delta.beaconId);
    if (beacon) return beacon;
  }
  return mission.beacons.find((b) => b.ordinal === delta.ordinal);
}

function alignMissionProgress(mission: MissionState): void {
  if (mission.objectives && mission.objectives.length > 0) {
    return;
  }
  const player = mission.player;
  if (!player) {
    mission.status = "idle";
    return;
  }
  const nextBeacon = mission.beacons.find((b) => !b.completed);
  if (!nextBeacon) {
    mission.status = "completed";
    player.currentIndex = mission.beacons.length;
    player.activeBeaconId = null;
    player.insideActiveBeacon = false;
    return;
  }
  mission.status = "active";
  player.currentIndex = nextBeacon.ordinal;
  player.activeBeaconId = nextBeacon.id;
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
