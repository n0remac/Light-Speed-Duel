"use strict";
(() => {
  // web/src/bus.ts
  function createEventBus() {
    const handlers = /* @__PURE__ */ new Map();
    return {
      on(event, handler) {
        let set = handlers.get(event);
        if (!set) {
          set = /* @__PURE__ */ new Set();
          handlers.set(event, set);
        }
        set.add(handler);
        return () => set.delete(handler);
      },
      emit(event, payload) {
        const set = handlers.get(event);
        if (!set || set.size === 0) return;
        for (const fn of set) {
          try {
            fn(payload);
          } catch (err) {
            console.error(`[bus] handler for ${event} failed`, err);
          }
        }
      }
    };
  }

  // web/src/state.ts
  var MISSILE_MIN_SPEED = 40;
  var MISSILE_MAX_SPEED = 250;
  var MISSILE_MIN_AGRO = 100;
  var MISSILE_MAX_LIFETIME = 120;
  var MISSILE_MIN_LIFETIME = 20;
  var MISSILE_LIFETIME_SPEED_PENALTY = 80;
  var MISSILE_LIFETIME_AGRO_PENALTY = 40;
  var MISSILE_LIFETIME_AGRO_REF = 2e3;
  var MISSILE_PRESETS = [
    {
      name: "Scout",
      description: "Slow, efficient, long-range. High heat capacity.",
      speed: 80,
      agroRadius: 1500,
      heatParams: {
        max: 60,
        warnAt: 42,
        overheatAt: 60,
        markerSpeed: 70,
        kUp: 20,
        kDown: 15,
        exp: 1.5
      }
    },
    {
      name: "Hunter",
      description: "Balanced speed and detection. Standard heat.",
      speed: 150,
      agroRadius: 800,
      heatParams: {
        max: 50,
        warnAt: 35,
        overheatAt: 50,
        markerSpeed: 120,
        kUp: 28,
        kDown: 12,
        exp: 1.5
      }
    },
    {
      name: "Sniper",
      description: "Fast, narrow detection. Low heat capacity.",
      speed: 220,
      agroRadius: 300,
      heatParams: {
        max: 40,
        warnAt: 28,
        overheatAt: 40,
        markerSpeed: 180,
        kUp: 35,
        kDown: 8,
        exp: 1.5
      }
    }
  ];
  function createInitialUIState() {
    return {
      inputContext: "ship",
      shipTool: "set",
      missileTool: null,
      activeTool: "ship-set",
      showShipRoute: true,
      helpVisible: false,
      zoom: 1,
      panX: 0,
      panY: 0
    };
  }
  function createInitialState(limits = {
    speedMin: MISSILE_MIN_SPEED,
    speedMax: MISSILE_MAX_SPEED,
    agroMin: MISSILE_MIN_AGRO
  }) {
    return {
      now: 0,
      nowSyncedAt: typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now(),
      me: null,
      ghosts: [],
      missiles: [],
      missileRoutes: [],
      activeMissileRouteId: null,
      nextMissileReadyAt: 0,
      missileConfig: {
        speed: 180,
        agroRadius: 800,
        lifetime: missileLifetimeFor(180, 800, limits),
        heatParams: MISSILE_PRESETS[1].heatParams
        // Default to Hunter preset
      },
      missileLimits: limits,
      worldMeta: {},
      inventory: null,
      dag: null,
      mission: null,
      story: null,
      craftHeatCapacity: 80
      // Default to basic missile heat capacity
    };
  }
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function missileLifetimeFor(speed, agroRadius, limits = {
    speedMin: MISSILE_MIN_SPEED,
    speedMax: MISSILE_MAX_SPEED,
    agroMin: MISSILE_MIN_AGRO
  }) {
    const minSpeed = Number.isFinite(limits.speedMin) ? limits.speedMin : MISSILE_MIN_SPEED;
    const maxSpeed = Number.isFinite(limits.speedMax) ? limits.speedMax : MISSILE_MAX_SPEED;
    const minAgro = Number.isFinite(limits.agroMin) ? limits.agroMin : MISSILE_MIN_AGRO;
    const span = maxSpeed - minSpeed;
    const speedNorm = span > 0 ? clamp((speed - minSpeed) / span, 0, 1) : 0;
    const adjustedAgro = Math.max(0, agroRadius - minAgro);
    const agroNorm = clamp(adjustedAgro / MISSILE_LIFETIME_AGRO_REF, 0, 1);
    const reduction = speedNorm * MISSILE_LIFETIME_SPEED_PENALTY + agroNorm * MISSILE_LIFETIME_AGRO_PENALTY;
    const base = MISSILE_MAX_LIFETIME;
    return clamp(base - reduction, MISSILE_MIN_LIFETIME, MISSILE_MAX_LIFETIME);
  }
  function sanitizeMissileConfig(cfg, fallback, limits) {
    var _a, _b, _c, _d;
    const minSpeed = Number.isFinite(limits.speedMin) ? limits.speedMin : MISSILE_MIN_SPEED;
    const maxSpeed = Number.isFinite(limits.speedMax) ? limits.speedMax : MISSILE_MAX_SPEED;
    const minAgro = Number.isFinite(limits.agroMin) ? limits.agroMin : MISSILE_MIN_AGRO;
    const base = fallback != null ? fallback : {
      speed: minSpeed,
      agroRadius: minAgro,
      lifetime: missileLifetimeFor(minSpeed, minAgro, limits)
    };
    const mergedSpeed = Number.isFinite((_a = cfg.speed) != null ? _a : base.speed) ? (_b = cfg.speed) != null ? _b : base.speed : base.speed;
    const mergedAgro = Number.isFinite((_c = cfg.agroRadius) != null ? _c : base.agroRadius) ? (_d = cfg.agroRadius) != null ? _d : base.agroRadius : base.agroRadius;
    const speed = clamp(mergedSpeed, minSpeed, maxSpeed);
    const agroRadius = Math.max(minAgro, mergedAgro);
    const heatParams = cfg.heatParams ? { ...cfg.heatParams } : base.heatParams ? { ...base.heatParams } : void 0;
    return {
      speed,
      agroRadius,
      lifetime: missileLifetimeFor(speed, agroRadius, limits),
      heatParams
    };
  }
  function monotonicNow() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }
  function updateMissileLimits(state, limits) {
    state.missileLimits = {
      speedMin: Number.isFinite(limits.speedMin) ? limits.speedMin : state.missileLimits.speedMin,
      speedMax: Number.isFinite(limits.speedMax) ? limits.speedMax : state.missileLimits.speedMax,
      agroMin: Number.isFinite(limits.agroMin) ? limits.agroMin : state.missileLimits.agroMin
    };
  }

  // web/src/net.ts
  var ws = null;
  function sendMessage(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    ws.send(data);
  }
  function connectWebSocket({
    room,
    state,
    bus,
    onStateUpdated,
    onOpen,
    mapW,
    mapH,
    mode,
    missionId
  }) {
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
    ws.addEventListener("open", () => {
      console.log("[ws] open");
      const socket = ws;
      if (socket && onOpen) {
        onOpen(socket);
      }
    });
    ws.addEventListener("close", () => console.log("[ws] close"));
    let prevRoutes = /* @__PURE__ */ new Map();
    let prevActiveRoute = null;
    let prevMissileCount = 0;
    ws.addEventListener("message", (event) => {
      const data = safeParse(event.data);
      if (!data || data.type !== "state") {
        return;
      }
      handleStateMessage(state, data, bus, prevRoutes, prevActiveRoute, prevMissileCount);
      prevRoutes = new Map(state.missileRoutes.map((route) => [route.id, cloneRoute(route)]));
      prevActiveRoute = state.activeMissileRouteId;
      prevMissileCount = state.missiles.length;
      bus.emit("state:updated");
      onStateUpdated == null ? void 0 : onStateUpdated();
    });
  }
  function handleStateMessage(state, msg, bus, prevRoutes, prevActiveRoute, prevMissileCount) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
    state.now = msg.now;
    state.nowSyncedAt = monotonicNow();
    state.nextMissileReadyAt = Number.isFinite(msg.next_missile_ready) ? msg.next_missile_ready : 0;
    state.me = msg.me ? {
      x: msg.me.x,
      y: msg.me.y,
      vx: msg.me.vx,
      vy: msg.me.vy,
      hp: msg.me.hp,
      kills: (_a = msg.me.kills) != null ? _a : 0,
      waypoints: Array.isArray(msg.me.waypoints) ? msg.me.waypoints.map((wp) => ({ x: wp.x, y: wp.y, speed: Number.isFinite(wp.speed) ? wp.speed : 180 })) : [],
      currentWaypointIndex: (_b = msg.me.current_waypoint_index) != null ? _b : 0,
      heat: msg.me.heat ? convertHeatView(msg.me.heat, state.nowSyncedAt, state.now) : void 0
    } : null;
    state.ghosts = Array.isArray(msg.ghosts) ? msg.ghosts.slice() : [];
    state.missiles = Array.isArray(msg.missiles) ? msg.missiles.slice() : [];
    const routesFromServer = Array.isArray(msg.missile_routes) ? msg.missile_routes : [];
    const newRoutes = routesFromServer.map((route) => ({
      id: route.id,
      name: route.name || route.id || "Route",
      waypoints: Array.isArray(route.waypoints) ? route.waypoints.map((wp) => ({
        x: wp.x,
        y: wp.y,
        speed: Number.isFinite(wp.speed) ? wp.speed : state.missileConfig.speed
      })) : []
    }));
    diffRoutes(prevRoutes, newRoutes, bus);
    state.missileRoutes = newRoutes;
    const nextActive = typeof msg.active_missile_route === "string" && msg.active_missile_route.length > 0 ? msg.active_missile_route : newRoutes.length > 0 ? newRoutes[0].id : null;
    state.activeMissileRouteId = nextActive;
    if (nextActive !== prevActiveRoute) {
      bus.emit("missile:activeRouteChanged", { routeId: nextActive != null ? nextActive : null });
    }
    if (msg.missile_config) {
      if (Number.isFinite(msg.missile_config.speed_min) || Number.isFinite(msg.missile_config.speed_max) || Number.isFinite(msg.missile_config.agro_min)) {
        updateMissileLimits(state, {
          speedMin: msg.missile_config.speed_min,
          speedMax: msg.missile_config.speed_max,
          agroMin: msg.missile_config.agro_min
        });
      }
      const prevHeat = state.missileConfig.heatParams;
      let heatParams;
      const heatConfig = msg.missile_config.heat_config;
      if (heatConfig) {
        heatParams = {
          max: Number.isFinite(heatConfig.max) ? heatConfig.max : (_c = prevHeat == null ? void 0 : prevHeat.max) != null ? _c : 0,
          warnAt: Number.isFinite(heatConfig.warn_at) ? heatConfig.warn_at : (_d = prevHeat == null ? void 0 : prevHeat.warnAt) != null ? _d : 0,
          overheatAt: Number.isFinite(heatConfig.overheat_at) ? heatConfig.overheat_at : (_e = prevHeat == null ? void 0 : prevHeat.overheatAt) != null ? _e : 0,
          markerSpeed: Number.isFinite(heatConfig.marker_speed) ? heatConfig.marker_speed : (_f = prevHeat == null ? void 0 : prevHeat.markerSpeed) != null ? _f : 0,
          kUp: Number.isFinite(heatConfig.k_up) ? heatConfig.k_up : (_g = prevHeat == null ? void 0 : prevHeat.kUp) != null ? _g : 0,
          kDown: Number.isFinite(heatConfig.k_down) ? heatConfig.k_down : (_h = prevHeat == null ? void 0 : prevHeat.kDown) != null ? _h : 0,
          exp: Number.isFinite(heatConfig.exp) ? heatConfig.exp : (_i = prevHeat == null ? void 0 : prevHeat.exp) != null ? _i : 1
        };
      }
      const sanitized = sanitizeMissileConfig({
        speed: msg.missile_config.speed,
        agroRadius: msg.missile_config.agro_radius,
        heatParams
      }, state.missileConfig, state.missileLimits);
      if (Number.isFinite(msg.missile_config.lifetime)) {
        sanitized.lifetime = msg.missile_config.lifetime;
      }
      state.missileConfig = sanitized;
    }
    const meta = (_j = msg.meta) != null ? _j : {};
    const hasC = typeof meta.c === "number" && Number.isFinite(meta.c);
    const hasW = typeof meta.w === "number" && Number.isFinite(meta.w);
    const hasH = typeof meta.h === "number" && Number.isFinite(meta.h);
    state.worldMeta = {
      c: hasC ? meta.c : state.worldMeta.c,
      w: hasW ? meta.w : state.worldMeta.w,
      h: hasH ? meta.h : state.worldMeta.h
    };
    if (msg.inventory && Array.isArray(msg.inventory.items)) {
      state.inventory = {
        items: msg.inventory.items.map((item) => ({
          type: item.type,
          variant_id: item.variant_id,
          heat_capacity: item.heat_capacity,
          quantity: item.quantity
        }))
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
          repeatable: node.repeatable
        }))
      };
    }
    if (msg.story) {
      const prevActiveNode = (_l = (_k = state.story) == null ? void 0 : _k.activeNode) != null ? _l : null;
      let dialogue = null;
      if (msg.story.dialogue) {
        const d = msg.story.dialogue;
        dialogue = {
          speaker: d.speaker,
          text: d.text,
          intent: d.intent,
          typingSpeedMs: 18,
          // Default, or could come from server
          continueLabel: d.continue_label,
          choices: (_m = d.choices) == null ? void 0 : _m.map((c) => ({ id: c.id, text: c.text })),
          tutorialTip: d.tutorial_tip ? {
            title: d.tutorial_tip.title,
            text: d.tutorial_tip.text
          } : void 0
        };
      }
      state.story = {
        activeNode: (_n = msg.story.active_node) != null ? _n : null,
        dialogue,
        // Store dialogue
        available: Array.isArray(msg.story.available) ? msg.story.available : [],
        flags: (_o = msg.story.flags) != null ? _o : {},
        recentEvents: Array.isArray(msg.story.recent_events) ? msg.story.recent_events.map((evt) => ({
          chapter: evt.chapter,
          node: evt.node,
          timestamp: evt.timestamp
        })) : []
      };
      if (state.story.activeNode !== prevActiveNode && state.story.activeNode) {
        bus.emit("story:nodeActivated", {
          nodeId: state.story.activeNode,
          dialogue: (_p = state.story.dialogue) != null ? _p : void 0
          // Pass dialogue
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
  function diffRoutes(prevRoutes, nextRoutes, bus) {
    const seen = /* @__PURE__ */ new Set();
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
  function cloneRoute(route) {
    return {
      id: route.id,
      name: route.name,
      waypoints: route.waypoints.map((wp) => ({ ...wp }))
    };
  }
  function safeParse(value) {
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch (err) {
      console.warn("[ws] failed to parse message", err);
      return null;
    }
  }
  function getApproxServerNow(state) {
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
    return state.now + elapsedMs / 1e3;
  }
  function convertHeatView(serverHeat, nowSyncedAtMs, serverNowSec) {
    const serverStallUntilSec = serverHeat.su;
    const offsetFromNowSec = serverStallUntilSec - serverNowSec;
    const stallUntilMs = nowSyncedAtMs + offsetFromNowSec * 1e3;
    const heatView = {
      value: serverHeat.v,
      max: serverHeat.m,
      warnAt: serverHeat.w,
      overheatAt: serverHeat.o,
      markerSpeed: serverHeat.ms,
      stallUntilMs,
      kUp: serverHeat.ku,
      kDown: serverHeat.kd,
      exp: serverHeat.ex
    };
    return heatView;
  }

  // web/src/game/constants.ts
  var MIN_ZOOM = 1;
  var MAX_ZOOM = 3;
  var HELP_TEXT = [
    "Primary Modes",
    "  1 \u2013 Toggle ship navigation mode",
    "  2 \u2013 Toggle missile coordination mode",
    "",
    "Ship Navigation",
    "  T \u2013 Switch between set/select",
    "  C \u2013 Clear all waypoints",
    "  H \u2013 Hold (clear waypoints & stop)",
    "  R \u2013 Toggle show route",
    "  [ / ] \u2013 Adjust waypoint speed",
    "  Shift+[ / ] \u2013 Coarse speed adjust",
    "  Tab / Shift+Tab \u2013 Cycle waypoints",
    "  Delete \u2013 Delete from selected waypoint",
    "",
    "Missile Coordination",
    "  N \u2013 Add new missile route",
    "  L \u2013 Launch missiles",
    "  E \u2013 Switch between set/select",
    "  , / . \u2013 Adjust agro radius",
    "  ; / ' \u2013 Adjust missile speed",
    "  Shift+slider keys \u2013 Coarse adjust",
    "  Delete \u2013 Delete selected missile waypoint",
    "",
    "Map Controls",
    "  +/- \u2013 Zoom in/out",
    "  Ctrl+0 \u2013 Reset zoom",
    "  Mouse wheel \u2013 Zoom at cursor",
    "  Pinch \u2013 Zoom on touch devices",
    "",
    "General",
    "  ? \u2013 Toggle this overlay",
    "  Esc \u2013 Cancel selection or close overlay"
  ].join("\n");

  // web/src/game/camera.ts
  function createCamera({ canvas, state, uiState }) {
    const world = { w: 8e3, h: 4500 };
    function resolveCanvas() {
      return canvas != null ? canvas : null;
    }
    function setZoom(newZoom, centerX, centerY) {
      uiState.zoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
    }
    function getCameraPosition() {
      const cv = resolveCanvas();
      if (!cv) return { x: world.w / 2, y: world.h / 2 };
      const zoom = uiState.zoom;
      let cameraX = state.me ? state.me.x : world.w / 2;
      let cameraY = state.me ? state.me.y : world.h / 2;
      const scaleX = cv.width / world.w;
      const scaleY = cv.height / world.h;
      const scale = Math.min(scaleX, scaleY) * zoom;
      const viewportWidth = cv.width / scale;
      const viewportHeight = cv.height / scale;
      const minCameraX = viewportWidth / 2;
      const maxCameraX = world.w - viewportWidth / 2;
      const minCameraY = viewportHeight / 2;
      const maxCameraY = world.h - viewportHeight / 2;
      if (viewportWidth < world.w) {
        cameraX = clamp(cameraX, minCameraX, maxCameraX);
      } else {
        cameraX = world.w / 2;
      }
      if (viewportHeight < world.h) {
        cameraY = clamp(cameraY, minCameraY, maxCameraY);
      } else {
        cameraY = world.h / 2;
      }
      return { x: cameraX, y: cameraY };
    }
    function worldToCanvas(p) {
      const cv = resolveCanvas();
      if (!cv) return { x: p.x, y: p.y };
      const zoom = uiState.zoom;
      const camera = getCameraPosition();
      const worldX = p.x - camera.x;
      const worldY = p.y - camera.y;
      const scaleX = cv.width / world.w;
      const scaleY = cv.height / world.h;
      const scale = Math.min(scaleX, scaleY) * zoom;
      return {
        x: worldX * scale + cv.width / 2,
        y: worldY * scale + cv.height / 2
      };
    }
    function canvasToWorld(p) {
      const cv = resolveCanvas();
      if (!cv) return { x: p.x, y: p.y };
      const zoom = uiState.zoom;
      const camera = getCameraPosition();
      const canvasX = p.x - cv.width / 2;
      const canvasY = p.y - cv.height / 2;
      const scaleX = cv.width / world.w;
      const scaleY = cv.height / world.h;
      const scale = Math.min(scaleX, scaleY) * zoom;
      return {
        x: canvasX / scale + camera.x,
        y: canvasY / scale + camera.y
      };
    }
    function updateWorldFromMeta(meta) {
      if (!meta) return;
      if (typeof meta.w === "number" && Number.isFinite(meta.w)) {
        world.w = meta.w;
      }
      if (typeof meta.h === "number" && Number.isFinite(meta.h)) {
        world.h = meta.h;
      }
    }
    function getWorldSize() {
      return { ...world };
    }
    return {
      setZoom,
      getCameraPosition,
      worldToCanvas,
      canvasToWorld,
      updateWorldFromMeta,
      getWorldSize
    };
  }

  // web/src/game/input.ts
  function createInput({
    canvas,
    ui,
    logic,
    camera,
    state,
    uiState,
    bus,
    sendMessage: sendMessage2
  }) {
    let lastTouchDistance = null;
    let pendingTouchTimeout = null;
    let isPinching = false;
    function getPointerCanvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width !== 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height !== 0 ? canvas.height / rect.height : 1;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      };
    }
    function handlePointerPlacement(canvasPoint, worldPoint) {
      const context = uiState.inputContext === "missile" ? "missile" : "ship";
      if (context === "missile") {
        logic.handleMissilePointer(canvasPoint, worldPoint);
        ui.renderMissileRouteControls();
      } else {
        logic.handleShipPointer(canvasPoint, worldPoint);
        ui.updatePlannedHeatBar();
      }
    }
    function onCanvasPointerDown(event) {
      var _a;
      const canvasPoint = getPointerCanvasPoint(event);
      const worldPoint = camera.canvasToWorld(canvasPoint);
      const context = uiState.inputContext === "missile" ? "missile" : "ship";
      if (context === "ship" && uiState.shipTool === "select" && ((_a = state.me) == null ? void 0 : _a.waypoints)) {
        const wpIndex = logic.findWaypointAtPosition(canvasPoint);
        if (wpIndex !== null) {
          logic.beginShipDrag(wpIndex, canvasPoint);
          canvas.setPointerCapture(event.pointerId);
          event.preventDefault();
          return;
        }
      }
      if (context === "missile" && uiState.missileTool === "select") {
        const hit = logic.hitTestMissileRoutes(canvasPoint);
        if (hit) {
          ui.setInputContext("missile");
          logic.setMissileSelection(hit.selection, hit.route.id);
          ui.renderMissileRouteControls();
          if (hit.selection.type === "waypoint") {
            logic.beginMissileDrag(hit.selection.index, canvasPoint);
            canvas.setPointerCapture(event.pointerId);
          }
          event.preventDefault();
          return;
        }
        logic.setMissileSelection(null);
        ui.renderMissileRouteControls();
      }
      if (event.pointerType === "touch") {
        if (pendingTouchTimeout !== null) {
          clearTimeout(pendingTouchTimeout);
        }
        pendingTouchTimeout = setTimeout(() => {
          if (isPinching) return;
          handlePointerPlacement(canvasPoint, worldPoint);
          pendingTouchTimeout = null;
        }, 150);
      } else {
        handlePointerPlacement(canvasPoint, worldPoint);
      }
      event.preventDefault();
    }
    function onCanvasPointerMove(event) {
      const draggingShip = logic.getDraggedWaypoint() !== null;
      const draggingMissile = logic.getDraggedMissileWaypoint() !== null;
      if (!draggingShip && !draggingMissile) return;
      const canvasPoint = getPointerCanvasPoint(event);
      const worldPoint = camera.canvasToWorld(canvasPoint);
      if (draggingShip) {
        logic.updateShipDrag(worldPoint);
        event.preventDefault();
        return;
      }
      if (draggingMissile) {
        logic.updateMissileDrag(worldPoint);
        ui.renderMissileRouteControls();
        event.preventDefault();
      }
    }
    function onCanvasPointerUp(event) {
      logic.endDrag();
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      pendingTouchTimeout = null;
    }
    function onCanvasWheel(event) {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const centerX = event.clientX - rect.left;
      const centerY = event.clientY - rect.top;
      const scaleX = rect.width !== 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height !== 0 ? canvas.height / rect.height : 1;
      const canvasCenterX = centerX * scaleX;
      const canvasCenterY = centerY * scaleY;
      const delta = event.deltaY;
      const zoomFactor = delta > 0 ? 0.9 : 1.1;
      const newZoom = uiState.zoom * zoomFactor;
      camera.setZoom(newZoom, canvasCenterX, canvasCenterY);
    }
    function getTouchDistance(touches) {
      if (touches.length < 2) return null;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    }
    function getTouchCenter(touches) {
      if (touches.length < 2) return null;
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
      };
    }
    function onCanvasTouchStart(event) {
      if (event.touches.length === 2) {
        event.preventDefault();
        isPinching = true;
        lastTouchDistance = getTouchDistance(event.touches);
        if (pendingTouchTimeout !== null) {
          clearTimeout(pendingTouchTimeout);
          pendingTouchTimeout = null;
        }
      }
    }
    function onCanvasTouchMove(event) {
      if (event.touches.length !== 2) {
        lastTouchDistance = null;
        return;
      }
      event.preventDefault();
      const currentDistance = getTouchDistance(event.touches);
      if (currentDistance === null || lastTouchDistance === null) return;
      const rect = canvas.getBoundingClientRect();
      const center = getTouchCenter(event.touches);
      if (!center) return;
      const scaleX = rect.width !== 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height !== 0 ? canvas.height / rect.height : 1;
      const canvasCenterX = (center.x - rect.left) * scaleX;
      const canvasCenterY = (center.y - rect.top) * scaleY;
      const zoomFactor = currentDistance / lastTouchDistance;
      const newZoom = uiState.zoom * zoomFactor;
      camera.setZoom(newZoom, canvasCenterX, canvasCenterY);
      lastTouchDistance = currentDistance;
    }
    function onCanvasTouchEnd(event) {
      if (event.touches.length < 2) {
        lastTouchDistance = null;
        setTimeout(() => {
          isPinching = false;
        }, 100);
      }
    }
    function handleAddMissileRoute() {
      ui.setInputContext("missile");
      sendMessage2({ type: "add_missile_route" });
    }
    function onWindowKeyDown(event) {
      const target = document.activeElement;
      const isEditable = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (uiState.helpVisible && event.key !== "Escape") {
        event.preventDefault();
        return;
      }
      if (isEditable) {
        if (event.key === "Escape") {
          target.blur();
          event.preventDefault();
        }
        return;
      }
      switch (event.code) {
        case "Digit1":
          ui.setInputContext("ship");
          event.preventDefault();
          return;
        case "Digit2":
          ui.setInputContext("missile");
          event.preventDefault();
          return;
        case "KeyT":
          if (uiState.activeTool === "ship-set") {
            ui.setActiveTool("ship-select");
          } else if (uiState.activeTool === "ship-select") {
            ui.setActiveTool("ship-set");
          } else {
            ui.setActiveTool("ship-set");
          }
          event.preventDefault();
          return;
        case "KeyC":
        case "KeyH":
          ui.setInputContext("ship");
          logic.clearShipRoute();
          event.preventDefault();
          return;
        case "BracketLeft":
          ui.setInputContext("ship");
          ui.adjustShipSpeed(-1, event.shiftKey);
          event.preventDefault();
          return;
        case "BracketRight":
          ui.setInputContext("ship");
          ui.adjustShipSpeed(1, event.shiftKey);
          event.preventDefault();
          return;
        case "Tab":
          ui.setInputContext("ship");
          logic.cycleShipSelection(event.shiftKey ? -1 : 1);
          event.preventDefault();
          return;
        case "KeyN":
          handleAddMissileRoute();
          event.preventDefault();
          return;
        case "KeyL":
          ui.setInputContext("missile");
          logic.launchActiveMissileRoute();
          event.preventDefault();
          return;
        case "KeyE":
          if (uiState.activeTool === "missile-set") {
            ui.setActiveTool("missile-select");
          } else if (uiState.activeTool === "missile-select") {
            ui.setActiveTool("missile-set");
          } else {
            ui.setActiveTool("missile-set");
          }
          event.preventDefault();
          return;
        case "Comma":
          ui.setInputContext("missile");
          ui.adjustMissileAgro(-1, event.shiftKey);
          event.preventDefault();
          return;
        case "Period":
          ui.setInputContext("missile");
          ui.adjustMissileAgro(1, event.shiftKey);
          event.preventDefault();
          return;
        case "Semicolon":
          ui.setInputContext("missile");
          ui.adjustMissileSpeed(-1, event.shiftKey);
          event.preventDefault();
          return;
        case "Quote":
          ui.setInputContext("missile");
          ui.adjustMissileSpeed(1, event.shiftKey);
          event.preventDefault();
          return;
        case "Delete":
        case "Backspace":
          if (uiState.inputContext === "missile" && logic.getMissileSelection()) {
            logic.deleteSelectedMissileWaypoint();
          } else if (logic.getSelection()) {
            logic.deleteSelectedShipWaypoint();
          }
          event.preventDefault();
          return;
        case "Escape": {
          if (uiState.helpVisible) {
            ui.setHelpVisible(false);
          } else if (logic.getMissileSelection()) {
            logic.setMissileSelection(null);
          } else if (logic.getSelection()) {
            logic.setSelection(null);
          } else if (uiState.inputContext === "missile") {
            ui.setInputContext("ship");
          }
          event.preventDefault();
          return;
        }
        case "Equal":
        case "NumpadAdd": {
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          camera.setZoom(uiState.zoom * 1.2, centerX, centerY);
          event.preventDefault();
          return;
        }
        case "Minus":
        case "NumpadSubtract": {
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          camera.setZoom(uiState.zoom / 1.2, centerX, centerY);
          event.preventDefault();
          return;
        }
        case "Digit0":
        case "Numpad0":
          if (event.ctrlKey || event.metaKey) {
            camera.setZoom(1);
            event.preventDefault();
          }
          return;
        default:
          break;
      }
      if (event.key === "?") {
        ui.setHelpVisible(!uiState.helpVisible);
        event.preventDefault();
      }
    }
    function bindInput() {
      canvas.addEventListener("pointerdown", onCanvasPointerDown);
      canvas.addEventListener("pointermove", onCanvasPointerMove);
      canvas.addEventListener("pointerup", onCanvasPointerUp);
      canvas.addEventListener("pointercancel", onCanvasPointerUp);
      canvas.addEventListener("wheel", onCanvasWheel, { passive: false });
      canvas.addEventListener("touchstart", onCanvasTouchStart, { passive: false });
      canvas.addEventListener("touchmove", onCanvasTouchMove, { passive: false });
      canvas.addEventListener("touchend", onCanvasTouchEnd, { passive: false });
      window.addEventListener("keydown", onWindowKeyDown, { capture: false });
      bus.on("context:changed", () => {
        if (pendingTouchTimeout !== null) {
          clearTimeout(pendingTouchTimeout);
          pendingTouchTimeout = null;
        }
      });
    }
    return {
      bindInput
    };
  }

  // web/src/route.ts
  var WAYPOINT_HIT_RADIUS = 12;
  var LEG_HIT_DISTANCE = 10;
  function buildRoutePoints(start, waypoints, world, camera, zoom, worldToCanvas) {
    const worldPoints = [{ x: start.x, y: start.y }];
    for (const wp of waypoints) {
      worldPoints.push({ x: wp.x, y: wp.y });
    }
    const canvasPoints = worldPoints.map((point) => worldToCanvas(point));
    return {
      waypoints: waypoints.slice(),
      worldPoints,
      canvasPoints
    };
  }
  function pointSegmentDistance(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const abLenSq = abx * abx + aby * aby;
    const t = abLenSq === 0 ? 0 : clamp(apx * abx + apy * aby, 0, abLenSq) / abLenSq;
    const projx = a.x + abx * t;
    const projy = a.y + aby * t;
    const dx = p.x - projx;
    const dy = p.y - projy;
    return Math.hypot(dx, dy);
  }
  function hitTestRouteGeneric(canvasPoint, routePoints, opts = {}) {
    var _a, _b, _c;
    const waypointHitRadius = (_a = opts.waypointHitRadius) != null ? _a : WAYPOINT_HIT_RADIUS;
    const legHitDistance = (_b = opts.legHitDistance) != null ? _b : LEG_HIT_DISTANCE;
    const skipLegs = (_c = opts.skipLegs) != null ? _c : false;
    const { waypoints, canvasPoints } = routePoints;
    if (waypoints.length === 0) {
      return null;
    }
    for (let i = 0; i < waypoints.length; i++) {
      const wpCanvas = canvasPoints[i + 1];
      const dx = canvasPoint.x - wpCanvas.x;
      const dy = canvasPoint.y - wpCanvas.y;
      if (Math.hypot(dx, dy) <= waypointHitRadius) {
        return { type: "waypoint", index: i };
      }
    }
    if (!skipLegs) {
      for (let i = 0; i < waypoints.length; i++) {
        const dist = pointSegmentDistance(canvasPoint, canvasPoints[i], canvasPoints[i + 1]);
        if (dist <= legHitDistance) {
          return { type: "leg", index: i };
        }
      }
    }
    return null;
  }
  function updateDashOffsetsForRoute(store, waypoints, worldPoints, canvasPoints, fallbackSpeed, dtSeconds, cycle = 64) {
    var _a;
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
      dtSeconds = 0;
    }
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const speed = typeof wp.speed === "number" && wp.speed > 0 ? wp.speed : fallbackSpeed;
      const aWorld = worldPoints[i];
      const bWorld = worldPoints[i + 1];
      const worldDist = Math.hypot(bWorld.x - aWorld.x, bWorld.y - aWorld.y);
      const aCanvas = canvasPoints[i];
      const bCanvas = canvasPoints[i + 1];
      const canvasDist = Math.hypot(bCanvas.x - aCanvas.x, bCanvas.y - aCanvas.y);
      if (!Number.isFinite(speed) || speed <= 1e-3 || !Number.isFinite(worldDist) || worldDist <= 1e-3 || canvasDist <= 1e-3) {
        store.set(i, 0);
        continue;
      }
      if (dtSeconds <= 0) {
        if (!store.has(i)) {
          store.set(i, 0);
        }
        continue;
      }
      const scale = canvasDist / worldDist;
      const dashSpeed = speed * scale;
      let next = ((_a = store.get(i)) != null ? _a : 0) - dashSpeed * dtSeconds;
      if (!Number.isFinite(next)) {
        next = 0;
      } else {
        next = (next % cycle + cycle) % cycle;
      }
      store.set(i, next);
    }
    for (const key of Array.from(store.keys())) {
      if (key >= waypoints.length) {
        store.delete(key);
      }
    }
  }
  function projectRouteHeat(route, initialHeat, params) {
    var _a;
    const result = {
      heatAtWaypoints: [],
      willOverheat: false
    };
    if (route.length === 0) {
      return result;
    }
    let heat = clamp(initialHeat, 0, params.max);
    let prevPoint = { x: route[0].x, y: route[0].y };
    result.heatAtWaypoints.push(heat);
    for (let i = 1; i < route.length; i++) {
      const targetPos = route[i];
      const dx = targetPos.x - prevPoint.x;
      const dy = targetPos.y - prevPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 1e-3) {
        result.heatAtWaypoints.push(heat);
        prevPoint = { x: targetPos.x, y: targetPos.y };
        continue;
      }
      const rawSpeed = (_a = targetPos.speed) != null ? _a : params.markerSpeed;
      const segmentSpeed = Math.max(rawSpeed, 1e-6);
      const segmentTime = distance / segmentSpeed;
      const Vn = Math.max(params.markerSpeed, 1e-6);
      const dev = segmentSpeed - params.markerSpeed;
      const p = params.exp;
      let hdot;
      if (dev >= 0) {
        hdot = params.kUp * Math.pow(dev / Vn, p);
      } else {
        hdot = -params.kDown * Math.pow(Math.abs(dev) / Vn, p);
      }
      heat += hdot * segmentTime;
      heat = clamp(heat, 0, params.max);
      result.heatAtWaypoints.push(heat);
      if (!result.willOverheat && heat >= params.overheatAt) {
        result.willOverheat = true;
        result.overheatAt = i;
      }
      prevPoint = { x: targetPos.x, y: targetPos.y };
    }
    return result;
  }
  function interpolateColor(color1, color2, t) {
    return [
      Math.round(color1[0] + (color2[0] - color1[0]) * t),
      Math.round(color1[1] + (color2[1] - color1[1]) * t),
      Math.round(color1[2] + (color2[2] - color1[2]) * t)
    ];
  }
  var SHIP_PALETTE = {
    defaultLine: "#38bdf8",
    selection: "#f97316",
    waypointDefault: "#38bdf8",
    waypointSelected: "#f97316",
    waypointDragging: "#facc15",
    waypointStroke: "#0f172a",
    heatCoolRgb: [100, 150, 255],
    heatHotRgb: [255, 50, 50]
  };
  var MISSILE_PALETTE = {
    defaultLine: "#f87171aa",
    selection: "#f97316",
    waypointDefault: "#f87171",
    waypointSelected: "#facc15",
    waypointStroke: "#7f1d1d",
    waypointStrokeSelected: "#854d0e",
    heatCoolRgb: [248, 129, 129],
    heatHotRgb: [220, 38, 38]
  };
  function drawPlannedRoute(ctx, opts) {
    var _a, _b;
    const {
      routePoints,
      selection,
      draggedWaypoint,
      dashStore,
      palette = SHIP_PALETTE,
      showLegs,
      heatParams,
      initialHeat = 0,
      defaultSpeed,
      worldPoints
    } = opts;
    const { waypoints, canvasPoints } = routePoints;
    if (waypoints.length === 0) {
      return;
    }
    let heatProjection = null;
    if (heatParams && worldPoints && worldPoints.length > 0) {
      const routeForHeat = worldPoints.map((pt, i) => {
        var _a2, _b2;
        return {
          x: pt.x,
          y: pt.y,
          speed: i === 0 ? void 0 : (_b2 = (_a2 = waypoints[i - 1]) == null ? void 0 : _a2.speed) != null ? _b2 : defaultSpeed
        };
      });
      heatProjection = projectRouteHeat(routeForHeat, initialHeat, heatParams);
    }
    if (showLegs) {
      let currentHeat = initialHeat;
      for (let i = 0; i < waypoints.length; i++) {
        const isFirstLeg = i === 0;
        const isSelected = (selection == null ? void 0 : selection.type) === "leg" && selection.index === i;
        let segmentHeat = currentHeat;
        if (heatProjection && i + 1 < heatProjection.heatAtWaypoints.length) {
          segmentHeat = heatProjection.heatAtWaypoints[i + 1];
        }
        let strokeStyle;
        let lineWidth;
        let lineDash = null;
        let alphaOverride = null;
        if (isSelected) {
          strokeStyle = palette.selection;
          lineWidth = 3.5;
          lineDash = [4, 4];
        } else if (heatProjection && heatParams && palette.heatCoolRgb && palette.heatHotRgb) {
          const heatRatio = clamp(segmentHeat / heatParams.overheatAt, 0, 1);
          const color = interpolateColor(palette.heatCoolRgb, palette.heatHotRgb, heatRatio);
          const baseWidth = isFirstLeg ? 3 : 1.5;
          lineWidth = baseWidth + heatRatio * 4;
          const alpha = isFirstLeg ? 1 : 0.4;
          strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
          lineDash = isFirstLeg ? [6, 6] : [8, 8];
        } else {
          const baseWidth = isFirstLeg ? 3 : 1.5;
          lineWidth = baseWidth;
          strokeStyle = palette.defaultLine;
          lineDash = isFirstLeg ? [6, 6] : [8, 8];
          alphaOverride = isFirstLeg ? 1 : 0.4;
        }
        ctx.save();
        if (lineDash) {
          ctx.setLineDash(lineDash);
        }
        if (alphaOverride !== null) {
          ctx.globalAlpha = alphaOverride;
        }
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.lineDashOffset = (_a = dashStore.get(i)) != null ? _a : 0;
        ctx.moveTo(canvasPoints[i].x, canvasPoints[i].y);
        ctx.lineTo(canvasPoints[i + 1].x, canvasPoints[i + 1].y);
        ctx.stroke();
        ctx.restore();
        currentHeat = segmentHeat;
      }
    }
    for (let i = 0; i < waypoints.length; i++) {
      const pt = canvasPoints[i + 1];
      const isSelected = (selection == null ? void 0 : selection.type) === "waypoint" && selection.index === i;
      const isDragging = draggedWaypoint === i;
      let fillColor;
      if (isSelected) {
        fillColor = palette.waypointSelected;
      } else if (isDragging && palette.waypointDragging) {
        fillColor = palette.waypointDragging;
      } else if (heatProjection && heatParams) {
        const heat = (_b = heatProjection.heatAtWaypoints[i + 1]) != null ? _b : 0;
        const heatRatio = heat / heatParams.max;
        const warnRatio = heatParams.warnAt / heatParams.max;
        const overheatRatio = heatParams.overheatAt / heatParams.max;
        if (heatRatio < warnRatio) {
          fillColor = "#33aa33";
        } else if (heatRatio < overheatRatio) {
          fillColor = "#ffaa33";
        } else {
          fillColor = "#ff3333";
        }
      } else {
        fillColor = palette.waypointDefault;
      }
      const strokeColor = isSelected && palette.waypointStrokeSelected ? palette.waypointStrokeSelected : palette.waypointStroke;
      ctx.save();
      ctx.beginPath();
      const radius = isSelected || isDragging ? 7 : 5;
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = isSelected || isDragging ? 0.95 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      ctx.restore();
    }
  }

  // web/src/game/logic.ts
  function createLogic({
    state,
    uiState,
    bus,
    sendMessage: sendMessage2,
    getApproxServerNow: getApproxServerNow2,
    camera
  }) {
    let selection = null;
    let missileSelection = null;
    let defaultSpeed = 150;
    let lastMissileLegSpeed = 0;
    const shipLegDashOffsets = /* @__PURE__ */ new Map();
    const missileLegDashOffsets = /* @__PURE__ */ new Map();
    let draggedWaypoint = null;
    let draggedMissileWaypoint = null;
    function getSelection() {
      return selection;
    }
    function setSelection(sel) {
      selection = sel;
      const index = selection ? selection.index : null;
      bus.emit("ship:legSelected", { index });
    }
    function getMissileSelection() {
      return missileSelection;
    }
    function setMissileSelection(sel, routeId) {
      missileSelection = sel;
      if (routeId) {
        state.activeMissileRouteId = routeId;
      }
      bus.emit("missile:selectionChanged", { selection: missileSelection });
    }
    function getDefaultShipSpeed() {
      return defaultSpeed;
    }
    function setDefaultShipSpeed(value) {
      defaultSpeed = value;
    }
    function getDefaultMissileLegSpeed() {
      var _a, _b;
      const minSpeed = (_a = state.missileLimits.speedMin) != null ? _a : MISSILE_MIN_SPEED;
      const maxSpeed = (_b = state.missileLimits.speedMax) != null ? _b : MISSILE_MAX_SPEED;
      const base = lastMissileLegSpeed > 0 ? lastMissileLegSpeed : state.missileConfig.speed;
      return clamp(base, minSpeed, maxSpeed);
    }
    function recordMissileLegSpeed(value) {
      if (Number.isFinite(value) && value > 0) {
        lastMissileLegSpeed = value;
      }
    }
    function getShipWaypointOffset() {
      var _a;
      const currentIndex = (_a = state.me) == null ? void 0 : _a.currentWaypointIndex;
      if (typeof currentIndex === "number" && Number.isFinite(currentIndex) && currentIndex > 0) {
        return currentIndex;
      }
      return 0;
    }
    function displayIndexToActualIndex(displayIndex) {
      return displayIndex + getShipWaypointOffset();
    }
    function actualIndexToDisplayIndex(actualIndex) {
      const offset = getShipWaypointOffset();
      return actualIndex - offset;
    }
    function computeRoutePoints() {
      if (!state.me) return null;
      const allWaypoints = Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
      const offset = getShipWaypointOffset();
      const visibleWaypoints = offset > 0 ? allWaypoints.slice(offset) : allWaypoints;
      if (!visibleWaypoints.length && !uiState.showShipRoute) {
        return null;
      }
      return buildRoutePoints(
        { x: state.me.x, y: state.me.y },
        visibleWaypoints,
        camera.getWorldSize(),
        camera.getCameraPosition,
        () => uiState.zoom,
        camera.worldToCanvas
      );
    }
    function computeMissileRoutePoints() {
      var _a, _b, _c, _d, _e;
      const route = getActiveMissileRoute();
      if (!route || !Array.isArray(route.waypoints) || !route.waypoints.length) {
        return null;
      }
      const origin = (_e = route.origin) != null ? _e : { x: (_b = (_a = state.me) == null ? void 0 : _a.x) != null ? _b : 0, y: (_d = (_c = state.me) == null ? void 0 : _c.y) != null ? _d : 0 };
      return buildRoutePoints(
        origin,
        route.waypoints,
        camera.getWorldSize(),
        camera.getCameraPosition,
        () => uiState.zoom,
        camera.worldToCanvas
      );
    }
    function findWaypointAtPosition(canvasPoint) {
      const route = computeRoutePoints();
      if (!route) return null;
      const hit = hitTestRouteGeneric(canvasPoint, route, {
        waypointRadius: WAYPOINT_HIT_RADIUS,
        legHitTolerance: 0
      });
      if (!hit || hit.type !== "waypoint") return null;
      return displayIndexToActualIndex(hit.index);
    }
    function hitTestRoute(canvasPoint) {
      const route = computeRoutePoints();
      if (!route) return null;
      return hitTestRouteGeneric(canvasPoint, route, {
        waypointRadius: WAYPOINT_HIT_RADIUS,
        legHitTolerance: 6
      });
    }
    function hitTestMissileRoutes(canvasPoint) {
      const routePoints = computeMissileRoutePoints();
      const route = getActiveMissileRoute();
      if (!routePoints || !route) return null;
      const hit = hitTestRouteGeneric(canvasPoint, routePoints, {
        waypointRadius: WAYPOINT_HIT_RADIUS,
        legHitTolerance: 6
      });
      if (!hit) return null;
      const selection2 = hit.type === "leg" ? { type: "leg", index: hit.index } : { type: "waypoint", index: hit.index };
      return { route, selection: selection2 };
    }
    function updateRouteAnimations(dtSeconds) {
      const shipRoute = computeRoutePoints();
      if (shipRoute && shipRoute.waypoints.length > 0 && uiState.showShipRoute) {
        updateDashOffsetsForRoute(
          shipLegDashOffsets,
          shipRoute.waypoints,
          shipRoute.worldPoints,
          shipRoute.canvasPoints,
          defaultSpeed,
          dtSeconds
        );
      } else {
        shipLegDashOffsets.clear();
      }
      const missileRoute = computeMissileRoutePoints();
      if (missileRoute) {
        updateDashOffsetsForRoute(
          missileLegDashOffsets,
          missileRoute.waypoints,
          missileRoute.worldPoints,
          missileRoute.canvasPoints,
          state.missileConfig.speed,
          dtSeconds
        );
      } else {
        missileLegDashOffsets.clear();
      }
    }
    function ensureActiveMissileRoute() {
      var _a, _b;
      const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
      if (!routes.length) return null;
      if (!state.activeMissileRouteId) {
        state.activeMissileRouteId = routes[0].id;
      }
      let route = routes.find((r) => r.id === state.activeMissileRouteId) || null;
      if (!route) {
        route = (_a = routes[0]) != null ? _a : null;
        state.activeMissileRouteId = (_b = route == null ? void 0 : route.id) != null ? _b : null;
      }
      return route;
    }
    function getActiveMissileRoute() {
      var _a;
      const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
      if (!routes.length) return null;
      if (!state.activeMissileRouteId) {
        return ensureActiveMissileRoute();
      }
      return (_a = routes.find((r) => r.id === state.activeMissileRouteId)) != null ? _a : ensureActiveMissileRoute();
    }
    function cycleMissileRoute(direction) {
      const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
      if (!routes.length) {
        return;
      }
      const currentIndex = routes.findIndex(
        (route) => route.id === state.activeMissileRouteId
      );
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = ((baseIndex + direction) % routes.length + routes.length) % routes.length;
      const nextRoute = routes[nextIndex];
      if (!nextRoute) return;
      state.activeMissileRouteId = nextRoute.id;
      setMissileSelection(null);
      sendMessage2({
        type: "set_active_missile_route",
        route_id: nextRoute.id
      });
      bus.emit("missile:activeRouteChanged", { routeId: nextRoute.id });
    }
    function cycleShipSelection(direction) {
      const wps = state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
      if (!wps.length) {
        setSelection(null);
        return;
      }
      let index = selection ? selection.index : direction > 0 ? -1 : wps.length;
      index += direction;
      if (index < 0) index = wps.length - 1;
      if (index >= wps.length) index = 0;
      setSelection({ type: "leg", index });
    }
    function clearShipRoute() {
      const wps = state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
      if (!wps.length) return;
      sendMessage2({ type: "clear_waypoints" });
      if (state.me) {
        state.me.waypoints = [];
      }
      setSelection(null);
      bus.emit("ship:waypointsCleared");
    }
    function deleteSelectedShipWaypoint() {
      if (!selection) return;
      sendMessage2({ type: "delete_waypoint", index: selection.index });
      if (state.me && Array.isArray(state.me.waypoints)) {
        state.me.waypoints = state.me.waypoints.slice(0, selection.index);
      }
      bus.emit("ship:waypointDeleted", { index: selection.index });
      setSelection(null);
    }
    function deleteSelectedMissileWaypoint() {
      const route = getActiveMissileRoute();
      if (!route || !missileSelection) return;
      const index = missileSelection.index;
      if (!Array.isArray(route.waypoints) || index < 0 || index >= route.waypoints.length) {
        return;
      }
      sendMessage2({
        type: "delete_missile_waypoint",
        route_id: route.id,
        index
      });
      route.waypoints = [
        ...route.waypoints.slice(0, index),
        ...route.waypoints.slice(index + 1)
      ];
      bus.emit("missile:waypointDeleted", { routeId: route.id, index });
      setMissileSelection(null);
    }
    function launchActiveMissileRoute() {
      var _a;
      const route = getActiveMissileRoute();
      if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
        return;
      }
      if (getMissileCooldownRemaining() > 0.05) {
        return;
      }
      let hasMissiles = false;
      if ((_a = state.inventory) == null ? void 0 : _a.items) {
        for (const item of state.inventory.items) {
          if (item.type === "missile" && item.quantity > 0) {
            hasMissiles = true;
            break;
          }
        }
      }
      if (!hasMissiles) {
        console.log("No missiles available - craft missiles first");
        return;
      }
      bus.emit("missile:launchRequested", { routeId: route.id });
      sendMessage2({
        type: "launch_missile",
        route_id: route.id
      });
    }
    function handleShipPointer(canvasPoint, worldPoint) {
      if (!state.me) return;
      if (uiState.shipTool === "select") {
        const hit = hitTestRoute(canvasPoint);
        if (hit) {
          const actualIndex = displayIndexToActualIndex(hit.index);
          setSelection({ type: hit.type, index: actualIndex });
        } else {
          setSelection(null);
        }
        return;
      }
      const wp = { x: worldPoint.x, y: worldPoint.y, speed: defaultSpeed };
      sendMessage2({
        type: "add_waypoint",
        x: wp.x,
        y: wp.y,
        speed: defaultSpeed
      });
      const wps = Array.isArray(state.me.waypoints) ? state.me.waypoints.slice() : [];
      wps.push(wp);
      state.me.waypoints = wps;
      bus.emit("ship:waypointAdded", { index: wps.length - 1 });
      setSelection(null);
    }
    function handleMissilePointer(canvasPoint, worldPoint) {
      const route = getActiveMissileRoute();
      if (!route) return;
      if (uiState.missileTool === "select") {
        const hit = hitTestMissileRoutes(canvasPoint);
        if (hit) {
          setMissileSelection(hit.selection, hit.route.id);
        } else {
          setMissileSelection(null);
        }
        return;
      }
      const speed = getDefaultMissileLegSpeed();
      const wp = { x: worldPoint.x, y: worldPoint.y, speed };
      sendMessage2({
        type: "add_missile_waypoint",
        route_id: route.id,
        x: wp.x,
        y: wp.y,
        speed: wp.speed
      });
      route.waypoints = route.waypoints ? [...route.waypoints, wp] : [wp];
      recordMissileLegSpeed(speed);
      setMissileSelection(null, route.id);
      bus.emit("missile:waypointAdded", {
        routeId: route.id,
        index: route.waypoints.length - 1
      });
    }
    function beginShipDrag(index, _origin) {
      draggedWaypoint = index;
    }
    function beginMissileDrag(index, _origin) {
      draggedMissileWaypoint = index;
    }
    function clampToWorld(point) {
      var _a, _b;
      const worldW = (_a = state.worldMeta.w) != null ? _a : 4e3;
      const worldH = (_b = state.worldMeta.h) != null ? _b : 4e3;
      return {
        x: clamp(point.x, 0, worldW),
        y: clamp(point.y, 0, worldH)
      };
    }
    function updateShipDrag(worldPoint) {
      if (draggedWaypoint === null) return;
      const clamped = clampToWorld(worldPoint);
      sendMessage2({
        type: "move_waypoint",
        index: draggedWaypoint,
        x: clamped.x,
        y: clamped.y
      });
      if (state.me && state.me.waypoints && draggedWaypoint < state.me.waypoints.length) {
        state.me.waypoints[draggedWaypoint].x = clamped.x;
        state.me.waypoints[draggedWaypoint].y = clamped.y;
      }
    }
    function updateMissileDrag(worldPoint) {
      if (draggedMissileWaypoint === null) return;
      const route = getActiveMissileRoute();
      if (!route || !Array.isArray(route.waypoints)) return;
      const clamped = clampToWorld(worldPoint);
      if (draggedMissileWaypoint >= route.waypoints.length) return;
      sendMessage2({
        type: "move_missile_waypoint",
        route_id: route.id,
        index: draggedMissileWaypoint,
        x: clamped.x,
        y: clamped.y
      });
      route.waypoints = route.waypoints.map(
        (wp, idx) => idx === draggedMissileWaypoint ? { ...wp, x: clamped.x, y: clamped.y } : wp
      );
    }
    function endDrag() {
      var _a;
      if (draggedWaypoint !== null && ((_a = state.me) == null ? void 0 : _a.waypoints)) {
        const wp = state.me.waypoints[draggedWaypoint];
        if (wp) {
          bus.emit("ship:waypointMoved", {
            index: draggedWaypoint,
            x: wp.x,
            y: wp.y
          });
        }
      }
      if (draggedMissileWaypoint !== null) {
        const route = getActiveMissileRoute();
        if (route && route.waypoints && draggedMissileWaypoint < route.waypoints.length) {
          const wp = route.waypoints[draggedMissileWaypoint];
          bus.emit("missile:waypointMoved", {
            routeId: route.id,
            index: draggedMissileWaypoint,
            x: wp.x,
            y: wp.y
          });
        }
      }
      draggedWaypoint = null;
      draggedMissileWaypoint = null;
    }
    function getDraggedWaypoint() {
      return draggedWaypoint;
    }
    function getDraggedMissileWaypoint() {
      return draggedMissileWaypoint;
    }
    function getMissileCooldownRemaining() {
      const remaining = state.nextMissileReadyAt - getApproxServerNow2(state);
      return remaining > 0 ? remaining : 0;
    }
    return {
      getSelection,
      setSelection,
      getMissileSelection,
      setMissileSelection,
      getDefaultShipSpeed,
      setDefaultShipSpeed,
      getDefaultMissileLegSpeed,
      recordMissileLegSpeed,
      getShipWaypointOffset,
      displayIndexToActualIndex,
      actualIndexToDisplayIndex,
      computeRoutePoints,
      computeMissileRoutePoints,
      findWaypointAtPosition,
      hitTestRoute,
      hitTestMissileRoutes,
      shipLegDashOffsets,
      missileLegDashOffsets,
      updateRouteAnimations,
      ensureActiveMissileRoute,
      getActiveMissileRoute,
      cycleMissileRoute,
      cycleShipSelection,
      clearShipRoute,
      deleteSelectedShipWaypoint,
      deleteSelectedMissileWaypoint,
      launchActiveMissileRoute,
      handleShipPointer,
      handleMissilePointer,
      beginShipDrag,
      beginMissileDrag,
      updateShipDrag,
      updateMissileDrag,
      endDrag,
      getDraggedWaypoint,
      getDraggedMissileWaypoint,
      getMissileCooldownRemaining
    };
  }

  // web/src/game/render.ts
  function createRenderer({
    canvas,
    ctx,
    state,
    uiState,
    camera,
    logic
  }) {
    function drawShip(x, y, vx, vy, color, filled) {
      const p = camera.worldToCanvas({ x, y });
      const r = 10;
      ctx.save();
      ctx.translate(p.x, p.y);
      const angle = Math.atan2(vy, vx);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.7, r * 0.6);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(-r * 0.7, -r * 0.6);
      ctx.closePath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      if (filled) {
        ctx.fillStyle = `${color}cc`;
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
    }
    function drawGhostDot(x, y) {
      const p = camera.worldToCanvas({ x, y });
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ccccccaa";
      ctx.fill();
    }
    function drawRoute() {
      var _a;
      if (!state.me) return;
      const route = logic.computeRoutePoints();
      if (!route || route.waypoints.length === 0) return;
      const heat = state.me.heat;
      const heatParams = heat ? {
        markerSpeed: heat.markerSpeed,
        kUp: heat.kUp,
        kDown: heat.kDown,
        exp: heat.exp,
        max: heat.max,
        overheatAt: heat.overheatAt,
        warnAt: heat.warnAt
      } : void 0;
      const currentSelection = logic.getSelection();
      const displaySelection = currentSelection ? {
        type: currentSelection.type,
        index: logic.actualIndexToDisplayIndex(currentSelection.index)
      } : null;
      const validSelection = displaySelection && displaySelection.index >= 0 ? displaySelection : null;
      const dragged = logic.getDraggedWaypoint();
      const displayDragged = dragged !== null ? logic.actualIndexToDisplayIndex(dragged) : null;
      const validDragged = displayDragged !== null && displayDragged >= 0 ? displayDragged : null;
      drawPlannedRoute(ctx, {
        routePoints: route,
        selection: validSelection,
        draggedWaypoint: validDragged,
        dashStore: logic.shipLegDashOffsets,
        palette: SHIP_PALETTE,
        showLegs: uiState.showShipRoute,
        heatParams,
        initialHeat: (_a = heat == null ? void 0 : heat.value) != null ? _a : 0,
        defaultSpeed: logic.getDefaultShipSpeed(),
        worldPoints: route.worldPoints
      });
    }
    function drawMissileRoute() {
      if (!state.me) return;
      if (uiState.inputContext !== "missile") return;
      const route = logic.computeMissileRoutePoints();
      if (!route || route.waypoints.length === 0) return;
      const heatParams = state.missileConfig.heatParams;
      const missileSelection = logic.getMissileSelection();
      const genericSelection = missileSelection && missileSelection.type === "leg" ? { type: "leg", index: missileSelection.index } : missileSelection && missileSelection.type === "waypoint" ? { type: "waypoint", index: missileSelection.index } : null;
      drawPlannedRoute(ctx, {
        routePoints: route,
        selection: genericSelection,
        draggedWaypoint: null,
        dashStore: logic.missileLegDashOffsets,
        palette: MISSILE_PALETTE,
        showLegs: true,
        heatParams,
        initialHeat: 0,
        defaultSpeed: state.missileConfig.speed,
        worldPoints: route.worldPoints
      });
    }
    function drawMissiles() {
      if (!state.missiles || state.missiles.length === 0) return;
      const world = camera.getWorldSize();
      const scaleX = canvas.width / world.w;
      const scaleY = canvas.height / world.h;
      const radiusScale = (scaleX + scaleY) / 2;
      for (const miss of state.missiles) {
        const p = camera.worldToCanvas({ x: miss.x, y: miss.y });
        const selfOwned = Boolean(miss.self);
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, selfOwned ? 6 : 5, 0, Math.PI * 2);
        ctx.fillStyle = selfOwned ? "#f87171" : "#fca5a5";
        ctx.globalAlpha = selfOwned ? 0.95 : 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#111827";
        ctx.stroke();
        ctx.restore();
        if (selfOwned && miss.agro_radius > 0) {
          ctx.save();
          ctx.beginPath();
          const rCanvas = miss.agro_radius * radiusScale;
          ctx.setLineDash([14, 10]);
          ctx.strokeStyle = "rgba(248,113,113,0.35)";
          ctx.lineWidth = 1.2;
          ctx.arc(p.x, p.y, rCanvas, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    function drawGrid() {
      ctx.save();
      ctx.strokeStyle = "#234";
      ctx.lineWidth = 1;
      const zoom = uiState.zoom;
      let step = 1e3;
      if (zoom < 0.7) {
        step = 2e3;
      } else if (zoom > 1.5) {
        step = 500;
      } else if (zoom > 2.5) {
        step = 250;
      }
      const cameraPos = camera.getCameraPosition();
      const world = camera.getWorldSize();
      const scaleX = canvas.width / world.w;
      const scaleY = canvas.height / world.h;
      const scale = Math.min(scaleX, scaleY) * zoom;
      const viewportWidth = canvas.width / scale;
      const viewportHeight = canvas.height / scale;
      const minX = Math.max(0, cameraPos.x - viewportWidth / 2);
      const maxX = Math.min(world.w, cameraPos.x + viewportWidth / 2);
      const minY = Math.max(0, cameraPos.y - viewportHeight / 2);
      const maxY = Math.min(world.h, cameraPos.y + viewportHeight / 2);
      const startX = Math.floor(minX / step) * step;
      const endX = Math.ceil(maxX / step) * step;
      const startY = Math.floor(minY / step) * step;
      const endY = Math.ceil(maxY / step) * step;
      for (let x = startX; x <= endX; x += step) {
        const a = camera.worldToCanvas({ x, y: Math.max(0, minY) });
        const b = camera.worldToCanvas({ x, y: Math.min(world.h, maxY) });
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (let y = startY; y <= endY; y += step) {
        const a = camera.worldToCanvas({ x: Math.max(0, minX), y });
        const b = camera.worldToCanvas({ x: Math.min(world.w, maxX), y });
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    function drawBeacons() {
      const mission = state.mission;
      if (!mission || !mission.active || mission.beacons.length === 0) {
        return;
      }
      const world = camera.getWorldSize();
      const scale = Math.min(canvas.width / world.w, canvas.height / world.h) * uiState.zoom;
      const me = state.me;
      const holdRequired = mission.holdRequired || 10;
      mission.beacons.forEach((beacon, index) => {
        const center = camera.worldToCanvas({ x: beacon.cx, y: beacon.cy });
        const edge = camera.worldToCanvas({ x: beacon.cx + beacon.radius, y: beacon.cy });
        const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
        if (!Number.isFinite(radius) || radius <= 0.5) {
          return;
        }
        const isLocked = index < mission.beaconIndex;
        const isActive = index === mission.beaconIndex;
        const baseLineWidth = Math.max(1.5, 2.5 * Math.min(1, scale * 1.2));
        const strokeStyle = isLocked ? "rgba(74,222,128,0.85)" : isActive ? "rgba(56,189,248,0.95)" : "rgba(148,163,184,0.65)";
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash(isActive ? [] : [10, 12]);
        ctx.lineWidth = isActive ? baseLineWidth * 1.4 : baseLineWidth;
        ctx.strokeStyle = strokeStyle;
        ctx.globalAlpha = isLocked ? 0.9 : 0.8;
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        const inside = isActive && me ? (() => {
          const dx = me.x - beacon.cx;
          const dy = me.y - beacon.cy;
          return dx * dx + dy * dy <= beacon.radius * beacon.radius;
        })() : false;
        if (inside) {
          ctx.beginPath();
          ctx.fillStyle = "rgba(56,189,248,0.12)";
          ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        if (isActive) {
          const progress = holdRequired > 0 ? Math.max(0, Math.min(1, mission.holdAccum / holdRequired)) : 0;
          if (progress > 0) {
            ctx.beginPath();
            ctx.strokeStyle = "rgba(56,189,248,0.95)";
            ctx.lineWidth = Math.max(baseLineWidth * 1.8, 2);
            ctx.setLineDash([]);
            ctx.arc(center.x, center.y, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
            ctx.stroke();
          }
        }
        if (isLocked) {
          ctx.beginPath();
          ctx.fillStyle = "rgba(74,222,128,0.75)";
          ctx.arc(center.x, center.y, Math.max(4, radius * 0.05), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
    }
    function drawScene() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid();
      drawBeacons();
      drawRoute();
      drawMissileRoute();
      drawMissiles();
      for (const g of state.ghosts) {
        drawShip(g.x, g.y, g.vx, g.vy, "#9ca3af", false);
        drawGhostDot(g.x, g.y);
      }
      if (state.me) {
        drawShip(state.me.x, state.me.y, state.me.vx, state.me.vy, "#22d3ee", true);
      }
    }
    return {
      drawScene,
      drawGrid,
      drawBeacons,
      drawShip,
      drawGhostDot,
      drawRoute,
      drawMissileRoute,
      drawMissiles
    };
  }

  // web/src/game/ui.ts
  function createUI({
    state,
    uiState,
    bus,
    logic,
    camera,
    sendMessage: sendMessage2,
    getApproxServerNow: getApproxServerNow2
  }) {
    let canvas = null;
    let ctx = null;
    let HPspan = null;
    let killsSpan = null;
    let shipControlsCard = null;
    let shipClearBtn = null;
    let shipSetBtn = null;
    let shipSelectBtn = null;
    let shipRoutesContainer = null;
    let shipRouteLeg = null;
    let shipRouteSpeed = null;
    let shipDeleteBtn = null;
    let shipSpeedCard = null;
    let shipSpeedSlider = null;
    let shipSpeedValue = null;
    let missileSpeedMarker = null;
    let missileControlsCard = null;
    let missileAddRouteBtn = null;
    let missileLaunchBtn = null;
    let missileLaunchText = null;
    let missileLaunchInfo = null;
    let missileSetBtn = null;
    let missileSelectBtn = null;
    let missileDeleteBtn = null;
    let missileSpeedCard = null;
    let missileSpeedSlider = null;
    let missileSpeedValue = null;
    let missileAgroCard = null;
    let missileAgroSlider = null;
    let missileAgroValue = null;
    let missileHeatCapacityCard = null;
    let missileHeatCapacitySlider = null;
    let missileHeatCapacityValue = null;
    let missileCraftBtn = null;
    let missileCountSpan = null;
    let missileCraftTimerDiv = null;
    let craftTimeRemainingSpan = null;
    let spawnBotBtn = null;
    let spawnBotText = null;
    let routePrevBtn = null;
    let routeNextBtn = null;
    let routeMenuToggle = null;
    let routeMenu = null;
    let renameMissileRouteBtn = null;
    let deleteMissileRouteBtn = null;
    let clearMissileWaypointsBtn = null;
    let missileRouteNameLabel = null;
    let missileRouteCountLabel = null;
    let helpToggle = null;
    let helpOverlay = null;
    let helpCloseBtn = null;
    let helpText = null;
    let heatBarFill = null;
    let heatBarPlanned = null;
    let heatValueText = null;
    let speedMarker = null;
    let stallOverlay = null;
    let markerAligned = false;
    let heatWarnActive = false;
    let stallActive = false;
    let dualMeterAlert = false;
    let lastMissileLaunchTextHTML = "";
    let lastMissileLaunchInfoHTML = "";
    let lastMissileConfigSent = null;
    function cacheDom() {
      var _a, _b;
      canvas = document.getElementById("cv");
      ctx = (_a = canvas == null ? void 0 : canvas.getContext("2d")) != null ? _a : null;
      HPspan = document.getElementById("ship-hp");
      shipControlsCard = document.getElementById("ship-controls");
      shipClearBtn = document.getElementById("ship-clear");
      shipSetBtn = document.getElementById("ship-set");
      shipSelectBtn = document.getElementById("ship-select");
      shipRoutesContainer = document.getElementById("ship-routes");
      shipRouteLeg = document.getElementById("ship-route-leg");
      shipRouteSpeed = document.getElementById("ship-route-speed");
      shipDeleteBtn = document.getElementById("ship-delete");
      shipSpeedCard = document.getElementById("ship-speed-card");
      shipSpeedSlider = document.getElementById("ship-speed-slider");
      shipSpeedValue = document.getElementById("ship-speed-value");
      missileControlsCard = document.getElementById("missile-controls");
      missileAddRouteBtn = document.getElementById("missile-add-route");
      missileLaunchBtn = document.getElementById("missile-launch");
      missileLaunchText = document.getElementById("missile-launch-text");
      missileLaunchInfo = document.getElementById("missile-launch-info");
      missileSetBtn = document.getElementById("missile-set");
      missileSelectBtn = document.getElementById("missile-select");
      missileDeleteBtn = document.getElementById("missile-delete");
      missileSpeedCard = document.getElementById("missile-speed-card");
      missileSpeedSlider = document.getElementById("missile-speed-slider");
      missileSpeedValue = document.getElementById("missile-speed-value");
      missileAgroCard = document.getElementById("missile-agro-card");
      missileAgroSlider = document.getElementById("missile-agro-slider");
      missileAgroValue = document.getElementById("missile-agro-value");
      missileHeatCapacityCard = document.getElementById("missile-heat-capacity-card");
      missileHeatCapacitySlider = document.getElementById("missile-heat-capacity-slider");
      missileHeatCapacityValue = document.getElementById("missile-heat-capacity-value");
      missileCraftBtn = document.getElementById("missile-craft");
      missileCountSpan = document.getElementById("missile-count");
      missileCraftTimerDiv = document.getElementById("missile-craft-timer");
      craftTimeRemainingSpan = document.getElementById("craft-time-remaining");
      spawnBotBtn = document.getElementById("spawn-bot");
      spawnBotText = document.getElementById("spawn-bot-text");
      killsSpan = document.getElementById("ship-kills");
      routePrevBtn = document.getElementById("route-prev");
      routeNextBtn = document.getElementById("route-next");
      routeMenuToggle = document.getElementById("route-menu-toggle");
      routeMenu = document.getElementById("route-menu");
      renameMissileRouteBtn = document.getElementById("rename-missile-route");
      deleteMissileRouteBtn = document.getElementById("delete-missile-route");
      clearMissileWaypointsBtn = document.getElementById("clear-missile-waypoints");
      missileRouteNameLabel = document.getElementById("missile-route-name");
      missileRouteCountLabel = document.getElementById("missile-route-count");
      helpToggle = document.getElementById("help-toggle");
      helpOverlay = document.getElementById("help-overlay");
      helpCloseBtn = document.getElementById("help-close");
      helpText = document.getElementById("help-text");
      heatBarFill = document.getElementById("heat-bar-fill");
      heatBarPlanned = document.getElementById("heat-bar-planned");
      heatValueText = document.getElementById("heat-value-text");
      speedMarker = document.getElementById("speed-marker");
      missileSpeedMarker = document.getElementById("missile-speed-marker");
      stallOverlay = document.getElementById("stall-overlay");
      const sliderDefault = parseFloat((_b = shipSpeedSlider == null ? void 0 : shipSpeedSlider.value) != null ? _b : "150");
      logic.setDefaultShipSpeed(Number.isFinite(sliderDefault) ? sliderDefault : 150);
      if (missileSpeedSlider) {
        missileSpeedSlider.disabled = false;
      }
      return { canvas, ctx };
    }
    function bindUI() {
      spawnBotBtn == null ? void 0 : spawnBotBtn.addEventListener("click", () => {
        if (spawnBotBtn.disabled) return;
        sendMessage2({ type: "spawn_bot" });
        bus.emit("bot:spawnRequested");
        spawnBotBtn.disabled = true;
        if (spawnBotText) {
          spawnBotText.textContent = "Spawned";
        }
        setTimeout(() => {
          if (spawnBotBtn) {
            spawnBotBtn.disabled = false;
          }
          if (spawnBotText) {
            spawnBotText.textContent = "Bot";
          }
        }, 5e3);
      });
      shipClearBtn == null ? void 0 : shipClearBtn.addEventListener("click", () => {
        setInputContext("ship");
        logic.clearShipRoute();
        bus.emit("ship:clearInvoked");
      });
      shipSetBtn == null ? void 0 : shipSetBtn.addEventListener("click", () => {
        setActiveTool("ship-set");
      });
      shipSelectBtn == null ? void 0 : shipSelectBtn.addEventListener("click", () => {
        setActiveTool("ship-select");
      });
      shipSpeedSlider == null ? void 0 : shipSpeedSlider.addEventListener("input", (event) => {
        var _a;
        const value = parseFloat(event.target.value);
        if (!Number.isFinite(value)) return;
        updateSpeedLabel(value);
        logic.setDefaultShipSpeed(value);
        const selection = logic.getSelection();
        if (selection && state.me && Array.isArray(state.me.waypoints) && state.me.waypoints[selection.index]) {
          sendMessage2({ type: "update_waypoint", index: selection.index, speed: value });
          state.me.waypoints[selection.index].speed = value;
          refreshShipSelectionUI();
          updatePlannedHeatBar();
        }
        const heat = (_a = state.me) == null ? void 0 : _a.heat;
        if (heat) {
          const tolerance = Math.max(5, heat.markerSpeed * 0.02);
          const diff = Math.abs(value - heat.markerSpeed);
          const inRange = diff <= tolerance;
          if (inRange && !markerAligned) {
            markerAligned = true;
            bus.emit("heat:markerAligned", { value, marker: heat.markerSpeed });
          } else if (!inRange && markerAligned) {
            markerAligned = false;
          }
        } else {
          markerAligned = false;
        }
        bus.emit("ship:speedChanged", { value });
      });
      shipDeleteBtn == null ? void 0 : shipDeleteBtn.addEventListener("click", () => {
        setInputContext("ship");
        logic.deleteSelectedShipWaypoint();
      });
      missileAddRouteBtn == null ? void 0 : missileAddRouteBtn.addEventListener("click", () => {
        setInputContext("missile");
        sendMessage2({ type: "add_missile_route" });
      });
      missileLaunchBtn == null ? void 0 : missileLaunchBtn.addEventListener("click", () => {
        setInputContext("missile");
        logic.launchActiveMissileRoute();
      });
      missileSetBtn == null ? void 0 : missileSetBtn.addEventListener("click", () => {
        setActiveTool("missile-set");
      });
      missileSelectBtn == null ? void 0 : missileSelectBtn.addEventListener("click", () => {
        setActiveTool("missile-select");
      });
      missileDeleteBtn == null ? void 0 : missileDeleteBtn.addEventListener("click", () => {
        setInputContext("missile");
        logic.deleteSelectedMissileWaypoint();
        bus.emit("missile:deleteInvoked");
      });
      missileSpeedSlider == null ? void 0 : missileSpeedSlider.addEventListener("input", (event) => {
        var _a, _b;
        const slider = event.target;
        if (slider.disabled) {
          return;
        }
        const raw = parseFloat(slider.value);
        if (!Number.isFinite(raw)) return;
        const minSpeed = (_a = state.missileLimits.speedMin) != null ? _a : MISSILE_MIN_SPEED;
        const maxSpeed = (_b = state.missileLimits.speedMax) != null ? _b : MISSILE_MAX_SPEED;
        const clampedValue = clamp(raw, minSpeed, maxSpeed);
        missileSpeedSlider.value = clampedValue.toFixed(0);
        if (missileSpeedValue) {
          missileSpeedValue.textContent = `${clampedValue.toFixed(0)}`;
        }
        const route = logic.getActiveMissileRoute();
        const missileSelection = logic.getMissileSelection();
        if (route && missileSelection && missileSelection.type === "leg" && Array.isArray(route.waypoints) && missileSelection.index >= 0 && missileSelection.index < route.waypoints.length) {
          route.waypoints = route.waypoints.map(
            (w, idx) => idx === missileSelection.index ? { ...w, speed: clampedValue } : w
          );
          sendMessage2({
            type: "update_missile_waypoint_speed",
            route_id: route.id,
            index: missileSelection.index,
            speed: clampedValue
          });
          bus.emit("missile:speedChanged", { value: clampedValue, index: missileSelection.index });
        } else {
          const cfg = sanitizeMissileConfig(
            {
              speed: clampedValue,
              agroRadius: state.missileConfig.agroRadius
            },
            state.missileConfig,
            state.missileLimits
          );
          state.missileConfig = cfg;
          sendMissileConfig(cfg);
          bus.emit("missile:speedChanged", { value: clampedValue, index: -1 });
        }
        logic.recordMissileLegSpeed(clampedValue);
      });
      missileAgroSlider == null ? void 0 : missileAgroSlider.addEventListener("input", (event) => {
        var _a;
        const raw = parseFloat(event.target.value);
        if (!Number.isFinite(raw)) return;
        const minAgro = (_a = state.missileLimits.agroMin) != null ? _a : MISSILE_MIN_AGRO;
        const clampedValue = Math.max(minAgro, raw);
        missileAgroSlider.value = clampedValue.toFixed(0);
        if (missileAgroValue) {
          missileAgroValue.textContent = `${clampedValue.toFixed(0)}`;
        }
        updateMissileConfigFromUI({ agroRadius: clampedValue });
        bus.emit("missile:agroChanged", { value: clampedValue });
      });
      missileHeatCapacitySlider == null ? void 0 : missileHeatCapacitySlider.addEventListener("input", (event) => {
        const raw = parseFloat(event.target.value);
        if (!Number.isFinite(raw)) return;
        const clampedValue = Math.max(80, Math.min(200, raw));
        missileHeatCapacitySlider.value = clampedValue.toFixed(0);
        if (missileHeatCapacityValue) {
          missileHeatCapacityValue.textContent = `${clampedValue.toFixed(0)}`;
        }
        state.craftHeatCapacity = clampedValue;
      });
      missileCraftBtn == null ? void 0 : missileCraftBtn.addEventListener("click", () => {
        var _a;
        if (missileCraftBtn.disabled) return;
        const heatCap = state.craftHeatCapacity;
        let nodeId = "craft.missile.basic";
        if (state.dag) {
          const craftNodes = state.dag.nodes.filter((n) => n.kind === "craft" && n.id.includes("missile"));
          for (const node of craftNodes) {
            const nodeHeatCap = parseInt(((_a = node.id.match(/(\d+)/)) == null ? void 0 : _a[1]) || "80");
            if (Math.abs(nodeHeatCap - heatCap) < 5) {
              nodeId = node.id;
              break;
            }
          }
          if (heatCap >= 180) {
            nodeId = "craft.missile.extended";
          } else if (heatCap >= 140) {
            nodeId = "craft.missile.high_heat";
          } else if (heatCap >= 110) {
            nodeId = "craft.missile.long_range";
          } else {
            nodeId = "craft.missile.basic";
          }
        }
        sendMessage2({ type: "dag_start", node_id: nodeId });
        bus.emit("missile:craftRequested", { nodeId, heatCapacity: heatCap });
      });
      routePrevBtn == null ? void 0 : routePrevBtn.addEventListener("click", () => logic.cycleMissileRoute(-1));
      routeNextBtn == null ? void 0 : routeNextBtn.addEventListener("click", () => logic.cycleMissileRoute(1));
      routeMenuToggle == null ? void 0 : routeMenuToggle.addEventListener("click", () => {
        routeMenu == null ? void 0 : routeMenu.classList.toggle("visible");
      });
      renameMissileRouteBtn == null ? void 0 : renameMissileRouteBtn.addEventListener("click", () => {
        var _a, _b;
        const route = logic.getActiveMissileRoute();
        if (!route) return;
        const nextName = (_b = prompt("Rename route", (_a = route.name) != null ? _a : "")) != null ? _b : "";
        const trimmed = nextName.trim();
        if (trimmed === route.name) return;
        sendMessage2({
          type: "rename_missile_route",
          route_id: route.id,
          name: trimmed
        });
        route.name = trimmed;
        renderMissileRouteControls();
      });
      deleteMissileRouteBtn == null ? void 0 : deleteMissileRouteBtn.addEventListener("click", () => {
        const route = logic.getActiveMissileRoute();
        if (!route) return;
        sendMessage2({ type: "delete_missile_route", route_id: route.id });
      });
      clearMissileWaypointsBtn == null ? void 0 : clearMissileWaypointsBtn.addEventListener("click", () => {
        const route = logic.getActiveMissileRoute();
        if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
          return;
        }
        sendMessage2({ type: "clear_missile_waypoints", route_id: route.id });
        route.waypoints = [];
        logic.setMissileSelection(null);
        renderMissileRouteControls();
      });
      helpToggle == null ? void 0 : helpToggle.addEventListener("click", () => {
        setHelpVisible(true);
      });
      helpCloseBtn == null ? void 0 : helpCloseBtn.addEventListener("click", () => {
        setHelpVisible(false);
      });
      bus.on("ship:legSelected", () => {
        refreshShipSelectionUI();
      });
      bus.on("ship:waypointAdded", () => {
        refreshShipSelectionUI();
        updatePlannedHeatBar();
      });
      bus.on("ship:waypointDeleted", () => {
        refreshShipSelectionUI();
        updatePlannedHeatBar();
      });
      bus.on("ship:waypointsCleared", () => {
        refreshShipSelectionUI();
        updatePlannedHeatBar();
      });
      bus.on("missile:selectionChanged", () => {
        refreshMissileSelectionUI();
        updateMissileSpeedControls();
      });
      bus.on("missile:waypointAdded", () => {
        renderMissileRouteControls();
      });
      bus.on("missile:waypointDeleted", () => {
        renderMissileRouteControls();
      });
      bus.on("missile:activeRouteChanged", () => {
        renderMissileRouteControls();
      });
    }
    function getCanvas() {
      return canvas;
    }
    function getContext() {
      return ctx;
    }
    function updateSpeedLabel(value) {
      if (!shipSpeedValue) return;
      shipSpeedValue.textContent = `${value.toFixed(0)} u/s`;
    }
    function adjustSliderValue(input, steps, coarse) {
      if (!input) return null;
      const step = Math.abs(parseFloat(input.step)) || 1;
      const multiplier = coarse ? 4 : 1;
      const min = Number.isFinite(parseFloat(input.min)) ? parseFloat(input.min) : -Infinity;
      const max = Number.isFinite(parseFloat(input.max)) ? parseFloat(input.max) : Infinity;
      const current = parseFloat(input.value) || 0;
      let next = current + steps * step * multiplier;
      if (Number.isFinite(min)) next = Math.max(min, next);
      if (Number.isFinite(max)) next = Math.min(max, next);
      if (Math.abs(next - current) < 1e-4) {
        return null;
      }
      input.value = String(next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return next;
    }
    function adjustShipSpeed(steps, coarse) {
      adjustSliderValue(shipSpeedSlider, steps, coarse);
    }
    function adjustMissileAgro(steps, coarse) {
      adjustSliderValue(missileAgroSlider, steps, coarse);
    }
    function adjustMissileSpeed(steps, coarse) {
      if (missileSpeedSlider && !missileSpeedSlider.disabled) {
        adjustSliderValue(missileSpeedSlider, steps, coarse);
      }
    }
    function setShipSliderValue(value) {
      if (!shipSpeedSlider) return;
      shipSpeedSlider.value = value.toFixed(0);
      updateSpeedLabel(value);
    }
    function renderMissileRouteControls() {
      const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
      const activeRoute = logic.getActiveMissileRoute();
      if (missileRouteNameLabel) {
        if (!activeRoute) {
          missileRouteNameLabel.textContent = routes.length === 0 ? "No route" : "Route";
        } else {
          missileRouteNameLabel.textContent = activeRoute.name || "Route";
        }
      }
      if (missileRouteCountLabel) {
        const count = activeRoute && Array.isArray(activeRoute.waypoints) ? activeRoute.waypoints.length : 0;
        missileRouteCountLabel.textContent = `${count} pts`;
      }
      if (deleteMissileRouteBtn) {
        deleteMissileRouteBtn.disabled = routes.length <= 1;
      }
      if (renameMissileRouteBtn) {
        renameMissileRouteBtn.disabled = !activeRoute;
      }
      if (clearMissileWaypointsBtn) {
        const count = activeRoute && Array.isArray(activeRoute.waypoints) ? activeRoute.waypoints.length : 0;
        clearMissileWaypointsBtn.disabled = !activeRoute || count === 0;
      }
      if (routePrevBtn) {
        routePrevBtn.disabled = routes.length <= 1;
      }
      if (routeNextBtn) {
        routeNextBtn.disabled = routes.length <= 1;
      }
      updateMissileLaunchButtonState();
      refreshMissileSelectionUI();
    }
    function syncMissileUIFromState() {
      logic.ensureActiveMissileRoute();
      const activeRoute = logic.getActiveMissileRoute();
      const missileSel = logic.getMissileSelection();
      const routeHasSelection = !!activeRoute && Array.isArray(activeRoute.waypoints) && !!missileSel && missileSel.index >= 0 && missileSel.index < activeRoute.waypoints.length;
      if (!routeHasSelection) {
        logic.setMissileSelection(null);
      }
      const cfg = state.missileConfig;
      applyMissileUI(cfg);
      renderMissileRouteControls();
      refreshMissileSelectionUI();
    }
    function applyMissileUI(cfg) {
      var _a;
      if (missileAgroSlider) {
        const minAgro = (_a = state.missileLimits.agroMin) != null ? _a : MISSILE_MIN_AGRO;
        const maxAgro = Math.max(5e3, Math.ceil((cfg.agroRadius + 500) / 500) * 500);
        missileAgroSlider.min = String(minAgro);
        missileAgroSlider.max = String(maxAgro);
        missileAgroSlider.value = cfg.agroRadius.toFixed(0);
      }
      if (missileAgroValue) {
        missileAgroValue.textContent = cfg.agroRadius.toFixed(0);
      }
      updateMissileSpeedControls();
      updateSpeedMarker();
    }
    function updateMissileConfigFromUI(overrides = {}) {
      var _a, _b;
      const current = state.missileConfig;
      const cfg = sanitizeMissileConfig(
        {
          speed: current.speed,
          agroRadius: (_a = overrides.agroRadius) != null ? _a : current.agroRadius
        },
        current,
        state.missileLimits
      );
      state.missileConfig = cfg;
      applyMissileUI(cfg);
      const last = lastMissileConfigSent;
      const needsSend = !last || Math.abs(((_b = last.agroRadius) != null ? _b : 0) - cfg.agroRadius) > 5;
      if (needsSend) {
        sendMissileConfig(cfg);
      }
      renderMissileRouteControls();
    }
    function sendMissileConfig(cfg) {
      lastMissileConfigSent = {
        speed: cfg.speed,
        agroRadius: cfg.agroRadius
      };
      sendMessage2({
        type: "configure_missile",
        missile_speed: cfg.speed,
        missile_agro: cfg.agroRadius
      });
    }
    function refreshShipSelectionUI() {
      if (!shipRoutesContainer || !shipRouteLeg || !shipRouteSpeed || !shipDeleteBtn) {
        return;
      }
      const wps = state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
      const selection = logic.getSelection();
      const hasValidSelection = selection !== null && selection.index >= 0 && selection.index < wps.length;
      const isShipContext = uiState.inputContext === "ship";
      shipRoutesContainer.style.display = "flex";
      shipRoutesContainer.style.opacity = isShipContext ? "1" : "0.6";
      if (!state.me || !hasValidSelection || !selection) {
        shipRouteLeg.textContent = "";
        shipRouteSpeed.textContent = "";
        shipDeleteBtn.disabled = true;
        if (isShipContext) {
          setShipSliderValue(logic.getDefaultShipSpeed());
        }
        return;
      }
      const wp = wps[selection.index];
      const speed = wp && typeof wp.speed === "number" ? wp.speed : logic.getDefaultShipSpeed();
      if (isShipContext && shipSpeedSlider && Math.abs(parseFloat(shipSpeedSlider.value) - speed) > 0.25) {
        setShipSliderValue(speed);
      } else {
        updateSpeedLabel(speed);
      }
      const displayIndex = selection.index + 1;
      shipRouteLeg.textContent = `${displayIndex}`;
      shipRouteSpeed.textContent = `${speed.toFixed(0)} u/s`;
      shipDeleteBtn.disabled = !isShipContext;
    }
    function refreshMissileSelectionUI() {
      const route = logic.getActiveMissileRoute();
      const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
      const missileSel = logic.getMissileSelection();
      const isWaypointSelection = missileSel !== null && missileSel !== void 0 && missileSel.type === "waypoint" && missileSel.index >= 0 && missileSel.index < count;
      if (missileDeleteBtn) {
        missileDeleteBtn.disabled = !isWaypointSelection;
      }
      updateMissileSpeedControls();
    }
    function updateMissileSpeedControls() {
      var _a, _b;
      if (!missileSpeedSlider || !missileSpeedValue) {
        return;
      }
      const minSpeed = (_a = state.missileLimits.speedMin) != null ? _a : MISSILE_MIN_SPEED;
      const maxSpeed = (_b = state.missileLimits.speedMax) != null ? _b : MISSILE_MAX_SPEED;
      missileSpeedSlider.min = String(minSpeed);
      missileSpeedSlider.max = String(maxSpeed);
      const route = logic.getActiveMissileRoute();
      const missileSel = logic.getMissileSelection();
      const waypoints = route && Array.isArray(route.waypoints) ? route.waypoints : null;
      let selectedSpeed = null;
      let selectedType = null;
      if (waypoints && missileSel && missileSel.index >= 0 && missileSel.index < waypoints.length) {
        const wp = waypoints[missileSel.index];
        const value = typeof wp.speed === "number" && wp.speed > 0 ? wp.speed : logic.getDefaultMissileLegSpeed();
        selectedSpeed = clamp(value, minSpeed, maxSpeed);
        selectedType = missileSel.type;
      }
      const sliderDisabled = selectedType === "waypoint";
      let sliderValue;
      if (selectedSpeed !== null) {
        sliderValue = selectedSpeed;
      } else {
        const rawValue = parseFloat(missileSpeedSlider.value);
        const fallback = logic.getDefaultMissileLegSpeed();
        const targetValue = Number.isFinite(rawValue) ? rawValue : fallback;
        sliderValue = clamp(targetValue, minSpeed, maxSpeed);
      }
      missileSpeedSlider.disabled = sliderDisabled;
      missileSpeedSlider.value = sliderValue.toFixed(0);
      missileSpeedValue.textContent = `${sliderValue.toFixed(0)}`;
      if (!sliderDisabled) {
        logic.recordMissileLegSpeed(sliderValue);
      }
    }
    function setInputContext(context) {
      const next = context === "missile" ? "missile" : "ship";
      if (uiState.inputContext === next) {
        return;
      }
      uiState.inputContext = next;
      if (next === "ship") {
        const shipToolToUse = uiState.shipTool === "select" ? "ship-select" : "ship-set";
        if (uiState.activeTool !== shipToolToUse) {
          uiState.activeTool = shipToolToUse;
        }
      } else {
        const missileToolToUse = uiState.missileTool === "select" ? "missile-select" : "missile-set";
        if (uiState.activeTool !== missileToolToUse) {
          uiState.activeTool = missileToolToUse;
        }
      }
      bus.emit("context:changed", { context: next });
      updateControlHighlights();
      refreshShipSelectionUI();
      refreshMissileSelectionUI();
    }
    function setActiveTool(tool) {
      if (uiState.activeTool === tool) {
        return;
      }
      uiState.activeTool = tool;
      if (tool === "ship-set") {
        uiState.shipTool = "set";
        uiState.missileTool = null;
        setInputContext("ship");
        bus.emit("ship:toolChanged", { tool: "set" });
      } else if (tool === "ship-select") {
        uiState.shipTool = "select";
        uiState.missileTool = null;
        setInputContext("ship");
        bus.emit("ship:toolChanged", { tool: "select" });
      } else if (tool === "missile-set") {
        uiState.shipTool = null;
        uiState.missileTool = "set";
        setInputContext("missile");
        logic.setMissileSelection(null);
        bus.emit("missile:toolChanged", { tool: "set" });
      } else if (tool === "missile-select") {
        uiState.shipTool = null;
        uiState.missileTool = "select";
        setInputContext("missile");
        bus.emit("missile:toolChanged", { tool: "select" });
      }
      updateControlHighlights();
    }
    function setButtonState(btn, active) {
      if (!btn) return;
      if (active) {
        btn.dataset.state = "active";
        btn.setAttribute("aria-pressed", "true");
      } else {
        delete btn.dataset.state;
        btn.setAttribute("aria-pressed", "false");
      }
    }
    function updateControlHighlights() {
      setButtonState(shipSetBtn, uiState.activeTool === "ship-set");
      setButtonState(shipSelectBtn, uiState.activeTool === "ship-select");
      setButtonState(missileSetBtn, uiState.activeTool === "missile-set");
      setButtonState(missileSelectBtn, uiState.activeTool === "missile-select");
      if (shipControlsCard) {
        shipControlsCard.classList.toggle("active", uiState.inputContext === "ship");
      }
      if (missileControlsCard) {
        missileControlsCard.classList.toggle("active", uiState.inputContext === "missile");
      }
    }
    function setHelpVisible(flag) {
      uiState.helpVisible = flag;
      updateHelpOverlay();
      bus.emit("help:visibleChanged", { visible: uiState.helpVisible });
    }
    function updateHelpOverlay() {
      if (!helpOverlay || !helpText) return;
      helpOverlay.classList.toggle("visible", uiState.helpVisible);
      helpText.textContent = HELP_TEXT;
    }
    function updateMissileLaunchButtonState() {
      if (!missileLaunchBtn || !missileLaunchText || !missileLaunchInfo) return;
      const route = logic.getActiveMissileRoute();
      const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
      const remaining = logic.getMissileCooldownRemaining();
      const coolingDown = remaining > 0.05;
      const shouldDisable = !route || count === 0 || coolingDown;
      missileLaunchBtn.disabled = shouldDisable;
      const launchTextHTML = '<span class="btn-text-full">Launch</span><span class="btn-text-short">Fire</span>';
      let launchInfoHTML = "";
      if (!route) {
        launchInfoHTML = "";
      } else if (coolingDown) {
        launchInfoHTML = `${remaining.toFixed(1)}s`;
      } else if (route.name) {
        const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
        const routeIndex = routes.findIndex((r) => r.id === route.id) + 1;
        launchInfoHTML = `<span class="btn-text-full">${route.name}</span><span class="btn-text-short">${routeIndex}</span>`;
      } else {
        launchInfoHTML = "";
      }
      if (lastMissileLaunchTextHTML !== launchTextHTML) {
        missileLaunchText.innerHTML = launchTextHTML;
        lastMissileLaunchTextHTML = launchTextHTML;
      }
      if (lastMissileLaunchInfoHTML !== launchInfoHTML) {
        missileLaunchInfo.innerHTML = launchInfoHTML;
        lastMissileLaunchInfoHTML = launchInfoHTML;
      }
    }
    function updateMissileCountDisplay() {
      if (!missileCountSpan) return;
      let count = 0;
      if (state.inventory && state.inventory.items) {
        for (const item of state.inventory.items) {
          if (item.type === "missile") {
            count += item.quantity;
          }
        }
      }
      missileCountSpan.textContent = count.toString();
    }
    function updateCraftTimer() {
      if (!missileCraftTimerDiv || !craftTimeRemainingSpan) return;
      let craftInProgress = false;
      let remainingTime = 0;
      if (state.dag && state.dag.nodes) {
        for (const node of state.dag.nodes) {
          if (node.kind === "craft" && node.status === "in_progress") {
            craftInProgress = true;
            remainingTime = node.remaining_s;
            break;
          }
        }
      }
      if (craftInProgress && remainingTime > 0) {
        missileCraftTimerDiv.style.display = "block";
        craftTimeRemainingSpan.textContent = Math.ceil(remainingTime).toString();
      } else {
        missileCraftTimerDiv.style.display = "none";
      }
    }
    function updateStatusIndicators() {
      var _a;
      const meta = (_a = state.worldMeta) != null ? _a : {};
      camera.updateWorldFromMeta(meta);
      if (HPspan) {
        if (state.me && Number.isFinite(state.me.hp)) {
          HPspan.textContent = Number(state.me.hp).toString();
        } else {
          HPspan.textContent = "\u2013";
        }
      }
      if (killsSpan) {
        if (state.me && Number.isFinite(state.me.kills)) {
          killsSpan.textContent = Number(state.me.kills).toString();
        } else {
          killsSpan.textContent = "0";
        }
      }
      updateHeatBar();
      updatePlannedHeatBar();
      updateSpeedMarker();
      updateStallOverlay();
    }
    function updateHeatBar() {
      var _a;
      const heat = (_a = state.me) == null ? void 0 : _a.heat;
      if (!heat || !heatBarFill || !heatValueText) {
        heatWarnActive = false;
        return;
      }
      const percent = heat.value / heat.max * 100;
      heatBarFill.style.width = `${percent}%`;
      heatValueText.textContent = `Heat ${Math.round(heat.value)}`;
      heatBarFill.classList.remove("warn", "overheat");
      if (heat.value >= heat.overheatAt) {
        heatBarFill.classList.add("overheat");
      } else if (heat.value >= heat.warnAt) {
        heatBarFill.classList.add("warn");
      }
      const nowWarn = heat.value >= heat.warnAt;
      if (nowWarn && !heatWarnActive) {
        heatWarnActive = true;
        bus.emit("heat:warnEntered", { value: heat.value, warnAt: heat.warnAt });
      } else if (!nowWarn && heatWarnActive) {
        const coolThreshold = Math.max(0, heat.warnAt - 5);
        if (heat.value <= coolThreshold) {
          heatWarnActive = false;
          bus.emit("heat:cooledBelowWarn", { value: heat.value, warnAt: heat.warnAt });
        }
      }
    }
    function projectPlannedHeat() {
      const ship = state.me;
      if (!ship || !Array.isArray(ship.waypoints) || ship.waypoints.length === 0 || !ship.heat) {
        return null;
      }
      const currentIndexRaw = ship.currentWaypointIndex;
      const currentIndex = typeof currentIndexRaw === "number" && Number.isFinite(currentIndexRaw) ? currentIndexRaw : 0;
      const clampedIndex = Math.max(0, Math.min(currentIndex, ship.waypoints.length));
      const remainingWaypoints = clampedIndex > 0 ? ship.waypoints.slice(clampedIndex) : ship.waypoints.slice();
      if (remainingWaypoints.length === 0) {
        return null;
      }
      const route = [{ x: ship.x, y: ship.y, speed: void 0 }, ...remainingWaypoints];
      const heatParams = {
        markerSpeed: ship.heat.markerSpeed,
        kUp: ship.heat.kUp,
        kDown: ship.heat.kDown,
        exp: ship.heat.exp,
        max: ship.heat.max,
        overheatAt: ship.heat.overheatAt,
        warnAt: ship.heat.warnAt
      };
      const projection = projectRouteHeat(route, ship.heat.value, heatParams);
      return Math.max(...projection.heatAtWaypoints);
    }
    function updatePlannedHeatBar() {
      if (!heatBarPlanned) return;
      const resetPlannedBar = () => {
        heatBarPlanned.style.width = "0%";
      };
      const ship = state.me;
      if (!ship || !ship.heat) {
        resetPlannedBar();
        dualMeterAlert = false;
        return;
      }
      const planned = projectPlannedHeat();
      if (planned === null) {
        resetPlannedBar();
        dualMeterAlert = false;
        return;
      }
      const actual = ship.heat.value;
      const percent = planned / ship.heat.max * 100;
      heatBarPlanned.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      const diff = planned - actual;
      const threshold = Math.max(8, ship.heat.warnAt * 0.1);
      if (diff >= threshold && !dualMeterAlert) {
        dualMeterAlert = true;
        bus.emit("heat:dualMeterDiverged", { planned, actual });
      } else if (diff < threshold * 0.6 && dualMeterAlert) {
        dualMeterAlert = false;
      }
    }
    function updateSpeedMarker() {
      var _a, _b;
      const shipHeat = (_a = state.me) == null ? void 0 : _a.heat;
      if (speedMarker && shipSpeedSlider && shipHeat && shipHeat.markerSpeed > 0) {
        const min = parseFloat(shipSpeedSlider.min);
        const max = parseFloat(shipSpeedSlider.max);
        const markerSpeed = shipHeat.markerSpeed;
        const percent = (markerSpeed - min) / (max - min) * 100;
        const clamped = Math.max(0, Math.min(100, percent));
        speedMarker.style.left = `${clamped}%`;
        speedMarker.title = `Heat neutral: ${Math.round(markerSpeed)} units/s`;
        speedMarker.style.display = "block";
      } else if (speedMarker) {
        speedMarker.style.display = "none";
      }
      if (missileSpeedMarker && missileSpeedSlider) {
        const heatParams = state.missileConfig.heatParams;
        const markerSpeed = (_b = heatParams && Number.isFinite(heatParams.markerSpeed) ? heatParams.markerSpeed : void 0) != null ? _b : shipHeat && shipHeat.markerSpeed > 0 ? shipHeat.markerSpeed : void 0;
        if (markerSpeed !== void 0 && markerSpeed > 0) {
          const min = parseFloat(missileSpeedSlider.min);
          const max = parseFloat(missileSpeedSlider.max);
          const percent = (markerSpeed - min) / (max - min) * 100;
          const clamped = Math.max(0, Math.min(100, percent));
          missileSpeedMarker.style.left = `${clamped}%`;
          missileSpeedMarker.title = `Heat neutral: ${Math.round(markerSpeed)} units/s`;
          missileSpeedMarker.style.display = "block";
        } else {
          missileSpeedMarker.style.display = "none";
        }
      }
    }
    function updateStallOverlay() {
      var _a;
      const heat = (_a = state.me) == null ? void 0 : _a.heat;
      if (!heat || !stallOverlay) {
        stallActive = false;
        return;
      }
      const now = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
      const isStalled = now < heat.stallUntilMs;
      if (isStalled) {
        stallOverlay.classList.add("visible");
        if (!stallActive) {
          stallActive = true;
          bus.emit("heat:stallTriggered", { stallUntil: heat.stallUntilMs });
        }
      } else {
        stallOverlay.classList.remove("visible");
        if (stallActive) {
          stallActive = false;
          bus.emit("heat:stallRecovered", { value: heat.value });
        }
      }
    }
    return {
      cacheDom,
      bindUI,
      setActiveTool,
      setInputContext,
      updateControlHighlights,
      refreshShipSelectionUI,
      refreshMissileSelectionUI,
      renderMissileRouteControls,
      syncMissileUIFromState,
      updateHelpOverlay,
      setHelpVisible,
      updateMissileLaunchButtonState,
      updateMissileCountDisplay,
      updateCraftTimer,
      updateStatusIndicators,
      updatePlannedHeatBar,
      updateSpeedMarker,
      updateHeatBar,
      projectPlannedHeat,
      getCanvas,
      getContext,
      adjustShipSpeed,
      adjustMissileAgro,
      adjustMissileSpeed
    };
  }

  // web/src/mission/hud.ts
  function mountMissionHud({ state, bus }) {
    const container = document.getElementById("mission-hud");
    const beaconLabel = document.getElementById("mission-beacon-label");
    const holdLabel = document.getElementById("mission-hold-text");
    if (!container || !beaconLabel || !holdLabel) {
      return { destroy() {
      } };
    }
    function render() {
      const mission = state.mission;
      if (!mission || !mission.active) {
        container.classList.add("hidden");
        container.classList.remove("inside");
        return;
      }
      const total = mission.beacons.length > 0 ? mission.beacons.length : 4;
      const currentIndex = Math.min(mission.beaconIndex + 1, total);
      beaconLabel.textContent = `Beacon ${currentIndex}/${total}`;
      const required = mission.holdRequired || 10;
      const holdSeconds = Math.max(0, mission.holdAccum);
      holdLabel.textContent = `Hold: ${holdSeconds.toFixed(1)}s / ${required.toFixed(1)}s`;
      const beacon = mission.beacons[mission.beaconIndex];
      if (beacon && state.me) {
        const dx = state.me.x - beacon.cx;
        const dy = state.me.y - beacon.cy;
        const inside = dx * dx + dy * dy <= beacon.radius * beacon.radius;
        if (inside) {
          container.classList.add("inside");
        } else {
          container.classList.remove("inside");
        }
      } else {
        container.classList.remove("inside");
      }
      container.classList.remove("hidden");
    }
    render();
    const unsubs = [
      bus.on("state:updated", () => render()),
      bus.on("mission:start", () => render()),
      bus.on("mission:beacon-locked", () => render()),
      bus.on("mission:completed", () => render())
    ];
    return {
      destroy() {
        for (const unsub of unsubs) {
          unsub();
        }
      }
    };
  }

  // web/src/game.ts
  function initGame({ state, uiState, bus }) {
    const canvasEl = document.getElementById("cv");
    if (!canvasEl) {
      throw new Error("Canvas element #cv not found");
    }
    const camera = createCamera({ canvas: canvasEl, state, uiState });
    const logic = createLogic({
      state,
      uiState,
      bus,
      sendMessage,
      getApproxServerNow,
      camera
    });
    const ui = createUI({
      state,
      uiState,
      bus,
      logic,
      camera,
      sendMessage,
      getApproxServerNow
    });
    const { canvas: cachedCanvas, ctx: cachedCtx } = ui.cacheDom();
    const renderCanvas = cachedCanvas != null ? cachedCanvas : canvasEl;
    const renderCtx = cachedCtx != null ? cachedCtx : renderCanvas.getContext("2d");
    if (!renderCtx) {
      throw new Error("Unable to acquire 2D rendering context");
    }
    const renderer = createRenderer({
      canvas: renderCanvas,
      ctx: renderCtx,
      state,
      uiState,
      camera,
      logic
    });
    const input = createInput({
      canvas: renderCanvas,
      ui,
      logic,
      camera,
      state,
      uiState,
      bus,
      sendMessage
    });
    ui.bindUI();
    input.bindInput();
    logic.ensureActiveMissileRoute();
    ui.syncMissileUIFromState();
    ui.updateControlHighlights();
    ui.refreshShipSelectionUI();
    ui.refreshMissileSelectionUI();
    ui.updateHelpOverlay();
    ui.updateStatusIndicators();
    ui.updateMissileLaunchButtonState();
    ui.updateMissileCountDisplay();
    mountMissionHud({ state, bus });
    let lastLoopTs = null;
    function loop(timestamp) {
      if (!Number.isFinite(timestamp)) {
        timestamp = lastLoopTs != null ? lastLoopTs : 0;
      }
      let dtSeconds = 0;
      if (lastLoopTs !== null) {
        dtSeconds = (timestamp - lastLoopTs) / 1e3;
        if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
          dtSeconds = 0;
        }
      }
      lastLoopTs = timestamp;
      logic.updateRouteAnimations(dtSeconds);
      renderer.drawScene();
      ui.updateMissileLaunchButtonState();
      ui.updateCraftTimer();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return {
      onStateUpdated() {
        logic.ensureActiveMissileRoute();
        ui.syncMissileUIFromState();
        ui.refreshShipSelectionUI();
        ui.refreshMissileSelectionUI();
        ui.updateMissileLaunchButtonState();
        ui.updateMissileCountDisplay();
        ui.updateCraftTimer();
        ui.updateStatusIndicators();
      }
    };
  }

  // web/src/tutorial/highlight.ts
  var STYLE_ID = "tutorial-overlay-style";
  function createHighlighter() {
    ensureStyles();
    const overlay = document.createElement("div");
    overlay.className = "tutorial-overlay";
    overlay.setAttribute("aria-live", "polite");
    const scrim = document.createElement("div");
    scrim.className = "tutorial-overlay__scrim";
    const highlightBox = document.createElement("div");
    highlightBox.className = "tutorial-overlay__highlight";
    const tooltip = document.createElement("div");
    tooltip.className = "tutorial-overlay__tooltip";
    const progress = document.createElement("div");
    progress.className = "tutorial-overlay__progress";
    const title = document.createElement("h3");
    title.className = "tutorial-overlay__title";
    const body = document.createElement("p");
    body.className = "tutorial-overlay__body";
    const actions = document.createElement("div");
    actions.className = "tutorial-overlay__actions";
    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "tutorial-overlay__btn tutorial-overlay__btn--ghost";
    skipBtn.textContent = "Skip";
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "tutorial-overlay__btn tutorial-overlay__btn--primary";
    nextBtn.textContent = "Next";
    actions.append(skipBtn, nextBtn);
    tooltip.append(progress, title, body, actions);
    overlay.append(scrim, highlightBox, tooltip);
    document.body.appendChild(overlay);
    let currentTarget = null;
    let visible = false;
    let resizeObserver = null;
    let frameHandle = null;
    let onNext = null;
    let onSkip = null;
    function scheduleUpdate() {
      if (!visible) return;
      if (frameHandle !== null) return;
      frameHandle = window.requestAnimationFrame(() => {
        frameHandle = null;
        updatePosition();
      });
    }
    function updatePosition() {
      if (!visible) return;
      if (currentTarget) {
        const rect = currentTarget.getBoundingClientRect();
        const padding = 12;
        const width = Math.max(0, rect.width + padding * 2);
        const height = Math.max(0, rect.height + padding * 2);
        const left = rect.left - padding;
        const top = rect.top - padding;
        highlightBox.style.opacity = "1";
        highlightBox.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
        highlightBox.style.width = `${Math.round(width)}px`;
        highlightBox.style.height = `${Math.round(height)}px`;
        tooltip.style.opacity = "1";
        tooltip.style.visibility = "visible";
        tooltip.style.maxWidth = `min(340px, ${Math.max(260, window.innerWidth - 32)}px)`;
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        let tooltipTop = rect.bottom + 18;
        if (tooltipTop + tooltipHeight > window.innerHeight - 20) {
          tooltipTop = Math.max(20, rect.top - tooltipHeight - 18);
        }
        let tooltipLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
        tooltipLeft = clamp(tooltipLeft, 20, window.innerWidth - tooltipWidth - 20);
        tooltip.style.transform = `translate(${Math.round(tooltipLeft)}px, ${Math.round(tooltipTop)}px)`;
      } else {
        highlightBox.style.opacity = "0";
        highlightBox.style.width = "0px";
        highlightBox.style.height = "0px";
        highlightBox.style.transform = `translate(${Math.round(window.innerWidth / 2)}px, ${Math.round(window.innerHeight / 2)}px)`;
        tooltip.style.opacity = "1";
        tooltip.style.visibility = "visible";
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        const tooltipLeft = clamp((window.innerWidth - tooltipWidth) / 2, 20, window.innerWidth - tooltipWidth - 20);
        const tooltipTop = clamp((window.innerHeight - tooltipHeight) / 2, 20, window.innerHeight - tooltipHeight - 20);
        tooltip.style.transform = `translate(${Math.round(tooltipLeft)}px, ${Math.round(tooltipTop)}px)`;
      }
    }
    function attachListeners() {
      window.addEventListener("resize", scheduleUpdate, { passive: true });
      window.addEventListener("scroll", scheduleUpdate, { passive: true });
    }
    function detachListeners() {
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle);
        frameHandle = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
    }
    skipBtn.addEventListener("click", (event) => {
      event.preventDefault();
      onSkip == null ? void 0 : onSkip();
    });
    nextBtn.addEventListener("click", (event) => {
      event.preventDefault();
      onNext == null ? void 0 : onNext();
    });
    function renderTooltip(options) {
      var _a, _b;
      const { stepCount, stepIndex, title: optionTitle, body: optionBody, showNext, nextLabel, showSkip, skipLabel } = options;
      if (Number.isFinite(stepCount) && stepCount > 0) {
        progress.textContent = `Step ${stepIndex + 1} of ${stepCount}`;
        progress.style.display = "block";
      } else {
        progress.textContent = "";
        progress.style.display = "none";
      }
      if (optionTitle && optionTitle.trim().length > 0) {
        title.textContent = optionTitle;
        title.style.display = "block";
      } else {
        title.textContent = "";
        title.style.display = "none";
      }
      body.textContent = optionBody;
      onNext = showNext ? (_a = options.onNext) != null ? _a : null : null;
      if (showNext) {
        nextBtn.textContent = nextLabel != null ? nextLabel : "Next";
        nextBtn.style.display = "inline-flex";
      } else {
        nextBtn.style.display = "none";
      }
      onSkip = showSkip ? (_b = options.onSkip) != null ? _b : null : null;
      if (showSkip) {
        skipBtn.textContent = skipLabel != null ? skipLabel : "Skip";
        skipBtn.style.display = "inline-flex";
      } else {
        skipBtn.style.display = "none";
      }
    }
    function show(options) {
      var _a;
      visible = true;
      currentTarget = (_a = options.target) != null ? _a : null;
      overlay.classList.add("visible");
      renderTooltip(options);
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (currentTarget && typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => scheduleUpdate());
        resizeObserver.observe(currentTarget);
      }
      attachListeners();
      scheduleUpdate();
    }
    function hide() {
      if (!visible) return;
      visible = false;
      overlay.classList.remove("visible");
      tooltip.style.visibility = "hidden";
      tooltip.style.opacity = "0";
      highlightBox.style.opacity = "0";
      detachListeners();
    }
    function destroy() {
      hide();
      overlay.remove();
    }
    return {
      show,
      hide,
      destroy
    };
  }
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    .tutorial-overlay {
      position: fixed;
      inset: 0;
      z-index: 50;
      pointer-events: none;
      display: none;
    }
    .tutorial-overlay.visible {
      display: block;
    }
    .tutorial-overlay__scrim {
      position: absolute;
      inset: 0;
    }
    .tutorial-overlay__highlight {
      position: absolute;
      border-radius: 14px;
      border: 2px solid rgba(56, 189, 248, 0.95);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25), 0 0 24px rgba(34, 211, 238, 0.25);
      transition: transform 0.18s ease, width 0.18s ease, height 0.18s ease, opacity 0.18s ease;
      pointer-events: none;
      opacity: 0;
    }
    .tutorial-overlay__tooltip {
      position: fixed;
      min-width: 240px;
      max-width: min(340px, calc(100vw - 32px));
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 16px;
      padding: 16px 18px;
      color: #e2e8f0;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.55);
      pointer-events: auto;
      opacity: 0;
      visibility: hidden;
      transform: translate(0px, 0px);
      transition: transform 0.18s ease, opacity 0.18s ease;
    }
    .tutorial-overlay__progress {
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(148, 163, 184, 0.75);
      margin: 0 0 8px;
    }
    .tutorial-overlay__title {
      margin: 0 0 8px;
      font-size: 15px;
      letter-spacing: 0.04em;
      color: #f1f5f9;
    }
    .tutorial-overlay__body {
      margin: 0 0 14px;
      font-size: 13px;
      line-height: 1.5;
      color: #cbd5f5;
    }
    .tutorial-overlay__actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    .tutorial-overlay__btn {
      font: inherit;
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid transparent;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
    }
    .tutorial-overlay__btn--primary {
      background: rgba(56, 189, 248, 0.25);
      border-color: rgba(56, 189, 248, 0.55);
      color: #f8fafc;
    }
    .tutorial-overlay__btn--primary:hover {
      background: rgba(56, 189, 248, 0.35);
    }
    .tutorial-overlay__btn--ghost {
      background: transparent;
      border-color: rgba(148, 163, 184, 0.35);
      color: rgba(203, 213, 225, 0.9);
    }
    .tutorial-overlay__btn--ghost:hover {
      border-color: rgba(203, 213, 225, 0.55);
    }
    @media (max-width: 768px) {
      .tutorial-overlay__tooltip {
        min-width: 200px;
        max-width: min(320px, calc(100vw - 24px));
        padding: 10px 12px;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 12px;
      }
      .tutorial-overlay__progress {
        display: none !important;
      }
      .tutorial-overlay__title {
        display: none !important;
      }
      .tutorial-overlay__body {
        margin: 0;
        font-size: 12px;
        flex: 1;
        line-height: 1.4;
      }
      .tutorial-overlay__actions {
        flex-direction: column;
        gap: 6px;
        flex-shrink: 0;
      }
      .tutorial-overlay__btn {
        padding: 5px 10px;
        font-size: 10px;
        white-space: nowrap;
      }
    }
  `;
    document.head.appendChild(style);
  }

  // web/src/tutorial/storage.ts
  var STORAGE_PREFIX = "lsd:tutorial:";
  function getStorage() {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return null;
      }
    } catch (err) {
      return null;
    }
    return window.localStorage;
  }
  function loadProgress(id) {
    const storage = getStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(STORAGE_PREFIX + id);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || typeof parsed.stepIndex !== "number" || typeof parsed.completed !== "boolean" || typeof parsed.updatedAt !== "number") {
        return null;
      }
      return parsed;
    } catch (err) {
      return null;
    }
  }
  function saveProgress(id, progress) {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_PREFIX + id, JSON.stringify(progress));
    } catch (err) {
    }
  }
  function clearProgress(id) {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.removeItem(STORAGE_PREFIX + id);
    } catch (err) {
    }
  }

  // web/src/tutorial/roles.ts
  function createRoles() {
    return {
      canvas: () => document.getElementById("cv"),
      shipSet: () => document.getElementById("ship-set"),
      shipSelect: () => document.getElementById("ship-select"),
      shipDelete: () => document.getElementById("ship-delete"),
      shipClear: () => document.getElementById("ship-clear"),
      shipSpeedSlider: () => document.getElementById("ship-speed-slider"),
      heatBar: () => document.getElementById("heat-bar-container"),
      speedMarker: () => document.getElementById("speed-marker"),
      missileSet: () => document.getElementById("missile-set"),
      missileSelect: () => document.getElementById("missile-select"),
      missileDelete: () => document.getElementById("missile-delete"),
      missileSpeedSlider: () => document.getElementById("missile-speed-slider"),
      missileAgroSlider: () => document.getElementById("missile-agro-slider"),
      missileAddRoute: () => document.getElementById("missile-add-route"),
      missileLaunch: () => document.getElementById("missile-launch"),
      routePrev: () => document.getElementById("route-prev"),
      routeNext: () => document.getElementById("route-next"),
      helpToggle: () => document.getElementById("help-toggle"),
      tutorialStart: () => document.getElementById("tutorial-start"),
      spawnBot: () => document.getElementById("spawn-bot")
    };
  }
  function getRoleElement(roles, role) {
    if (!role) return null;
    const resolver = roles[role];
    return resolver ? resolver() : null;
  }

  // web/src/tutorial/engine.ts
  function createTutorialEngine({ id, bus, roles, steps }) {
    const highlighter = createHighlighter();
    let running = false;
    let paused = false;
    let currentIndex = -1;
    let currentStep = null;
    let cleanupCurrent = null;
    let renderCurrent = null;
    let lastSavedCompleted = false;
    let suppressPersistOnStop = false;
    const persistentListeners = [];
    persistentListeners.push(
      bus.on("help:visibleChanged", ({ visible }) => {
        if (!running) return;
        paused = Boolean(visible);
        if (paused) {
          highlighter.hide();
        } else {
          renderCurrent == null ? void 0 : renderCurrent();
        }
      })
    );
    function resolveTarget(step) {
      if (!step.target) {
        return null;
      }
      if (typeof step.target === "function") {
        return step.target();
      }
      return getRoleElement(roles, step.target);
    }
    function clampIndex(index) {
      if (steps.length === 0) return 0;
      if (!Number.isFinite(index) || index < 0) return 0;
      if (index >= steps.length) return steps.length - 1;
      return Math.floor(index);
    }
    function setStep(index) {
      var _a, _b;
      if (!running) return;
      if (steps.length === 0) {
        completeTutorial();
        return;
      }
      if (index < 0 || index >= steps.length) {
        completeTutorial();
        return;
      }
      if (cleanupCurrent) {
        cleanupCurrent();
        cleanupCurrent = null;
      }
      if (currentStep) {
        (_a = currentStep.onExit) == null ? void 0 : _a.call(currentStep);
        currentStep = null;
      }
      currentIndex = index;
      const step = steps[index];
      currentStep = step;
      persistProgress(index, false);
      bus.emit("tutorial:stepChanged", { id, stepIndex: index, total: steps.length });
      (_b = step.onEnter) == null ? void 0 : _b.call(step);
      const allowSkip = step.allowSkip !== false;
      const render = () => {
        var _a2;
        if (!running || paused) return;
        highlighter.show({
          target: resolveTarget(step),
          title: step.title,
          body: step.body,
          stepIndex: index,
          stepCount: steps.length,
          showNext: step.advance.kind === "manual",
          nextLabel: step.advance.kind === "manual" ? (_a2 = step.advance.nextLabel) != null ? _a2 : index === steps.length - 1 ? "Finish" : "Next" : void 0,
          onNext: step.advance.kind === "manual" ? advanceStep : void 0,
          showSkip: allowSkip,
          skipLabel: step.skipLabel,
          onSkip: allowSkip ? skipCurrentStep : void 0
        });
      };
      renderCurrent = render;
      render();
      if (step.advance.kind === "event") {
        const handler = (payload) => {
          if (!running || paused) return;
          if (step.advance.when && !step.advance.when(payload)) {
            return;
          }
          advanceTo(index + 1);
        };
        cleanupCurrent = bus.on(step.advance.event, handler);
        if (step.advance.check && step.advance.check()) {
          handler(void 0);
        }
      } else {
        cleanupCurrent = null;
      }
    }
    function advanceTo(nextIndex) {
      var _a;
      if (!running) return;
      if (cleanupCurrent) {
        cleanupCurrent();
        cleanupCurrent = null;
      }
      if (currentStep) {
        (_a = currentStep.onExit) == null ? void 0 : _a.call(currentStep);
        currentStep = null;
      }
      renderCurrent = null;
      if (nextIndex >= steps.length) {
        completeTutorial();
      } else {
        setStep(nextIndex);
      }
    }
    function advanceStep() {
      advanceTo(currentIndex + 1);
    }
    function skipCurrentStep() {
      if (!running) return;
      const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
      advanceTo(nextIndex);
    }
    function completeTutorial() {
      if (!running) return;
      suppressPersistOnStop = true;
      persistProgress(steps.length, true);
      bus.emit("tutorial:completed", { id });
      stop();
      suppressPersistOnStop = false;
    }
    function start(options) {
      const resume = (options == null ? void 0 : options.resume) !== false;
      if (running) {
        restart();
        return;
      }
      if (steps.length === 0) {
        return;
      }
      running = true;
      paused = false;
      suppressPersistOnStop = false;
      lastSavedCompleted = false;
      let startIndex = 0;
      if (resume) {
        const progress = loadProgress(id);
        if (progress && !progress.completed) {
          startIndex = clampIndex(progress.stepIndex);
        }
      } else {
        clearProgress(id);
      }
      bus.emit("tutorial:started", { id });
      setStep(startIndex);
    }
    function restart() {
      stop();
      start({ resume: false });
    }
    function stop() {
      var _a;
      const shouldPersist = !suppressPersistOnStop && running && !lastSavedCompleted && currentIndex >= 0 && currentIndex < steps.length;
      const indexToPersist = currentIndex;
      if (cleanupCurrent) {
        cleanupCurrent();
        cleanupCurrent = null;
      }
      if (currentStep) {
        (_a = currentStep.onExit) == null ? void 0 : _a.call(currentStep);
        currentStep = null;
      }
      if (shouldPersist) {
        persistProgress(indexToPersist, false);
      }
      running = false;
      paused = false;
      currentIndex = -1;
      renderCurrent = null;
      highlighter.hide();
    }
    function isRunning() {
      return running;
    }
    function destroy() {
      stop();
      for (const dispose of persistentListeners) {
        dispose();
      }
      highlighter.destroy();
    }
    function persistProgress(stepIndex, completed) {
      lastSavedCompleted = completed;
      saveProgress(id, {
        stepIndex,
        completed,
        updatedAt: Date.now()
      });
    }
    return {
      start,
      restart,
      stop,
      isRunning,
      destroy
    };
  }

  // web/src/tutorial/steps_basic.ts
  function hasWaypointIndexAtLeast(payload, minIndex) {
    if (typeof payload !== "object" || payload === null) return false;
    const index = payload.index;
    if (typeof index !== "number" || !Number.isFinite(index)) return false;
    return index >= minIndex;
  }
  function extractRouteId(payload) {
    if (typeof payload !== "object" || payload === null) return null;
    const routeId = payload.routeId;
    return typeof routeId === "string" ? routeId : null;
  }
  function payloadToolEquals(target) {
    return (payload) => {
      if (typeof payload !== "object" || payload === null) return false;
      const tool = payload.tool;
      return typeof tool === "string" && tool === target;
    };
  }
  function getBasicTutorialSteps() {
    let routeSwitchesSinceEnter = 0;
    let initialRouteId = null;
    let newRouteId = null;
    return [
      {
        id: "ship-plot-route",
        target: "canvas",
        title: "Plot a route",
        body: "Click on the map to drop at least three waypoints and sketch your course.",
        advance: {
          kind: "event",
          event: "ship:waypointAdded",
          when: (payload) => hasWaypointIndexAtLeast(payload, 2)
        }
      },
      {
        id: "ship-change-speed",
        target: "shipSpeedSlider",
        title: "Adjust ship speed",
        body: "Use the Ship Speed slider (or press [ / ]) to fine-tune your travel speed.",
        advance: {
          kind: "event",
          event: "ship:speedChanged"
        }
      },
      {
        id: "ship-select-leg",
        target: "shipSelect",
        title: "Select a route leg",
        body: "Switch to Select mode (T key) and then click a waypoint on the map to highlight its leg.",
        advance: {
          kind: "event",
          event: "ship:legSelected",
          when: (payload) => hasWaypointIndexAtLeast(payload, 0)
        }
      },
      {
        id: "heat-match-marker",
        target: "speedMarker",
        title: "Match the marker",
        body: "Line up the Ship Speed slider with the tick to cruise at the neutral heat speed.",
        advance: {
          kind: "event",
          event: "heat:markerAligned"
        },
        allowSkip: false
      },
      {
        id: "heat-push-hot",
        target: "heatBar",
        title: "Sprint into the red",
        body: "Push the throttle above the marker and watch the heat bar reach the warning band.",
        advance: {
          kind: "event",
          event: "heat:warnEntered"
        },
        allowSkip: false
      },
      {
        id: "heat-cool-down",
        target: "heatBar",
        title: "Cool it back down",
        body: "Ease off below the marker until the bar drops out of the warning zone.",
        advance: {
          kind: "event",
          event: "heat:cooledBelowWarn"
        },
        allowSkip: false
      },
      {
        id: "heat-trigger-stall",
        target: "heatBar",
        title: "Trigger a stall",
        body: "Push well above the limit and hold it until the overheat stall overlay appears.",
        advance: {
          kind: "event",
          event: "heat:stallTriggered"
        },
        allowSkip: false
      },
      {
        id: "heat-recover-stall",
        target: "heatBar",
        title: "Recover from the stall",
        body: "Hold steady while systems cool. Once the overlay clears, you\u2019re back online.",
        advance: {
          kind: "event",
          event: "heat:stallRecovered"
        },
        allowSkip: false
      },
      {
        id: "heat-dual-bars",
        target: "heatBar",
        title: "Read both heat bars",
        body: "Adjust a waypoint to make the planned bar extend past live heat. Use it to predict future overloads.",
        advance: {
          kind: "event",
          event: "heat:dualMeterDiverged"
        },
        allowSkip: false
      },
      {
        id: "ship-delete-leg",
        target: "shipDelete",
        title: "Delete a route leg",
        body: "Remove the selected waypoint using the Delete control or the Delete key.",
        advance: {
          kind: "event",
          event: "ship:waypointDeleted"
        }
      },
      {
        id: "ship-clear-route",
        target: "shipClear",
        title: "Clear the route",
        body: "Clear remaining waypoints to reset your plotted course.",
        advance: {
          kind: "event",
          event: "ship:clearInvoked"
        }
      },
      {
        id: "missile-set-mode",
        target: "missileSet",
        title: "Switch to missile planning",
        body: "Tap Set so every click drops missile waypoints on the active route.",
        advance: {
          kind: "event",
          event: "missile:toolChanged",
          when: payloadToolEquals("set")
        }
      },
      {
        id: "missile-plot-initial",
        target: "canvas",
        title: "Plot missile waypoints",
        body: "Click the map to drop at least two guidance points for the current missile route.",
        advance: {
          kind: "event",
          event: "missile:waypointAdded",
          when: (payload) => {
            if (!hasWaypointIndexAtLeast(payload, 1)) return false;
            const routeId = extractRouteId(payload);
            if (routeId) {
              initialRouteId = routeId;
            }
            return true;
          }
        }
      },
      {
        id: "missile-launch-initial",
        target: "missileLaunch",
        title: "Launch the strike",
        body: "Send the planned missile route live with the Launch control (L key).",
        advance: {
          kind: "event",
          event: "missile:launchRequested",
          when: (payload) => {
            const routeId = extractRouteId(payload);
            if (!routeId) return true;
            if (!initialRouteId) {
              initialRouteId = routeId;
              return true;
            }
            return routeId === initialRouteId;
          }
        }
      },
      {
        id: "missile-add-route",
        target: "missileAddRoute",
        title: "Create a new missile route",
        body: "Press New to add a second missile route for another strike group.",
        advance: {
          kind: "event",
          event: "missile:routeAdded",
          when: (payload) => {
            const routeId = extractRouteId(payload);
            if (!routeId) return false;
            newRouteId = routeId;
            return true;
          }
        }
      },
      {
        id: "missile-plot-new-route",
        target: "canvas",
        title: "Plot the new missile route",
        body: "Drop at least two waypoints on the new route to define its path.",
        advance: {
          kind: "event",
          event: "missile:waypointAdded",
          when: (payload) => {
            if (!hasWaypointIndexAtLeast(payload, 1)) return false;
            const routeId = extractRouteId(payload);
            if (newRouteId && routeId && routeId !== newRouteId) {
              return false;
            }
            if (!newRouteId && routeId) {
              newRouteId = routeId;
            }
            return true;
          }
        }
      },
      {
        id: "missile-launch-new-route",
        target: "missileLaunch",
        title: "Launch the new route",
        body: "Launch the fresh missile route to confirm its pattern.",
        advance: {
          kind: "event",
          event: "missile:launchRequested",
          when: (payload) => {
            const routeId = extractRouteId(payload);
            if (!newRouteId || !routeId) return true;
            return routeId === newRouteId;
          }
        }
      },
      {
        id: "missile-switch-route",
        target: "routeNext",
        title: "Switch back to the original route",
        body: "Use the \u25C0 \u25B6 controls (or Tab/Shift+Tab) to select your first missile route again.",
        onEnter: () => {
          routeSwitchesSinceEnter = 0;
        },
        advance: {
          kind: "event",
          event: "missile:activeRouteChanged",
          when: (payload) => {
            routeSwitchesSinceEnter += 1;
            if (routeSwitchesSinceEnter < 1) return false;
            const routeId = extractRouteId(payload);
            if (!initialRouteId || !routeId) {
              return true;
            }
            return routeId === initialRouteId;
          }
        }
      },
      {
        id: "missile-launch-after-switch",
        target: "missileLaunch",
        title: "Launch from the other route",
        body: "Fire the original missile route to practice round-robin strikes.",
        advance: {
          kind: "event",
          event: "missile:launchRequested",
          when: (payload) => {
            const routeId = extractRouteId(payload);
            if (!initialRouteId || !routeId) return true;
            return routeId === initialRouteId;
          }
        }
      },
      {
        id: "tutorial-practice",
        target: "spawnBot",
        title: "Spawn a practice bot",
        body: "Use the Bot control to add a target and rehearse these maneuvers in real time.",
        advance: {
          kind: "event",
          event: "bot:spawnRequested"
        },
        allowSkip: false
      },
      {
        id: "tutorial-complete",
        target: null,
        title: "You\u2019re ready",
        body: "Great work. Reload the console or rejoin a room to revisit these drills.",
        advance: {
          kind: "manual",
          nextLabel: "Finish"
        },
        allowSkip: false
      }
    ];
  }

  // web/src/tutorial/index.ts
  var BASIC_TUTORIAL_ID = "ship-basics";
  function mountTutorial(bus) {
    const roles = createRoles();
    const engine = createTutorialEngine({
      id: BASIC_TUTORIAL_ID,
      bus,
      roles,
      steps: getBasicTutorialSteps()
    });
    return {
      start(options) {
        engine.start(options);
      },
      restart() {
        engine.restart();
      },
      destroy() {
        engine.destroy();
      }
    };
  }

  // web/src/story/overlay.ts
  var STYLE_ID2 = "dialogue-overlay-style";
  function createDialogueOverlay() {
    ensureStyles2();
    const overlay = document.createElement("div");
    overlay.className = "dialogue-overlay";
    overlay.setAttribute("aria-live", "polite");
    const consoleFrame = document.createElement("div");
    consoleFrame.className = "dialogue-console";
    const speakerLabel = document.createElement("div");
    speakerLabel.className = "dialogue-speaker";
    const textBlock = document.createElement("div");
    textBlock.className = "dialogue-text";
    const cursor = document.createElement("span");
    cursor.className = "dialogue-cursor";
    cursor.textContent = "_";
    const choicesList = document.createElement("ul");
    choicesList.className = "dialogue-choices hidden";
    const continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.className = "dialogue-continue hidden";
    continueButton.textContent = "Continue";
    textBlock.append(cursor);
    consoleFrame.append(speakerLabel, textBlock, choicesList, continueButton);
    overlay.append(consoleFrame);
    document.body.appendChild(overlay);
    let visible = false;
    let typingHandle = null;
    let targetText = "";
    let renderedChars = 0;
    let activeContent = null;
    function clearTyping() {
      if (typingHandle !== null) {
        window.clearTimeout(typingHandle);
        typingHandle = null;
      }
    }
    function finishTyping(content) {
      var _a;
      renderedChars = targetText.length;
      updateText();
      clearTyping();
      (_a = content.onTextFullyRendered) == null ? void 0 : _a.call(content);
      if (!Array.isArray(content.choices) || content.choices.length === 0) {
        showContinue(content);
      }
    }
    function updateText() {
      const textToShow = targetText.slice(0, renderedChars);
      textBlock.innerHTML = "";
      const textNode = document.createElement("span");
      textNode.textContent = textToShow;
      textBlock.append(textNode, cursor);
      cursor.classList.toggle("hidden", !visible);
    }
    function renderChoices(content) {
      choicesList.innerHTML = "";
      const choices = Array.isArray(content.choices) ? content.choices : [];
      if (choices.length === 0) {
        choicesList.classList.add("hidden");
        return;
      }
      choicesList.classList.remove("hidden");
      choices.forEach((choice2, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.choiceId = choice2.id;
        button.textContent = `${index + 1}. ${choice2.text}`;
        button.addEventListener("click", () => {
          var _a;
          (_a = content.onChoice) == null ? void 0 : _a.call(content, choice2.id);
        });
        item.append(button);
        choicesList.append(item);
      });
    }
    function showContinue(content) {
      var _a;
      if (!content.onContinue) {
        continueButton.classList.add("hidden");
        continueButton.onclick = null;
        return;
      }
      continueButton.textContent = (_a = content.continueLabel) != null ? _a : "Continue";
      continueButton.classList.remove("hidden");
      continueButton.onclick = () => {
        var _a2;
        (_a2 = content.onContinue) == null ? void 0 : _a2.call(content);
      };
    }
    function scheduleType(content) {
      clearTyping();
      const typingSpeed = clamp(Number(content.typingSpeedMs) || 18, 8, 64);
      const tick = () => {
        var _a;
        renderedChars = Math.min(renderedChars + 1, targetText.length);
        updateText();
        if (renderedChars >= targetText.length) {
          clearTyping();
          (_a = content.onTextFullyRendered) == null ? void 0 : _a.call(content);
          if (!Array.isArray(content.choices) || content.choices.length === 0) {
            showContinue(content);
          }
        } else {
          typingHandle = window.setTimeout(tick, typingSpeed);
        }
      };
      typingHandle = window.setTimeout(tick, typingSpeed);
    }
    function handleKeyDown(event) {
      var _a, _b;
      if (!visible || !activeContent) return;
      if (!Array.isArray(activeContent.choices) || activeContent.choices.length === 0) {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          if (renderedChars < targetText.length) {
            finishTyping(activeContent);
          } else {
            (_a = activeContent.onContinue) == null ? void 0 : _a.call(activeContent);
          }
        }
        return;
      }
      const index = parseInt(event.key, 10);
      if (Number.isFinite(index) && index >= 1 && index <= activeContent.choices.length) {
        event.preventDefault();
        const choice2 = activeContent.choices[index - 1];
        (_b = activeContent.onChoice) == null ? void 0 : _b.call(activeContent, choice2.id);
        return;
      }
      if (event.key === "Enter" && renderedChars < targetText.length) {
        event.preventDefault();
        finishTyping(activeContent);
      }
    }
    function show(content) {
      var _a;
      activeContent = content;
      visible = true;
      overlay.classList.add("visible");
      overlay.dataset.intent = (_a = content.intent) != null ? _a : "factory";
      speakerLabel.textContent = content.speaker;
      targetText = content.text;
      renderedChars = 0;
      updateText();
      renderChoices(content);
      showContinue(content);
      scheduleType(content);
    }
    function hide() {
      visible = false;
      activeContent = null;
      overlay.classList.remove("visible");
      clearTyping();
      targetText = "";
      renderedChars = 0;
      textBlock.innerHTML = "";
      textBlock.append(cursor);
      choicesList.innerHTML = "";
      choicesList.classList.add("hidden");
      continueButton.classList.add("hidden");
      continueButton.onclick = null;
    }
    function destroy() {
      hide();
      document.removeEventListener("keydown", handleKeyDown);
      overlay.remove();
    }
    document.addEventListener("keydown", handleKeyDown);
    return {
      show,
      hide,
      destroy,
      isVisible() {
        return visible;
      }
    };
  }
  function ensureStyles2() {
    if (document.getElementById(STYLE_ID2)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID2;
    style.textContent = `
    .dialogue-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 60;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .dialogue-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }
    .dialogue-console {
      min-width: 320px;
      max-width: min(520px, calc(100vw - 48px));
      background: rgba(6, 11, 16, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 12px;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 28px 64px rgba(2, 6, 16, 0.6);
      color: #e2e8f0;
      font-family: "IBM Plex Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    .dialogue-overlay[data-intent="factory"] .dialogue-console {
      border-color: rgba(56, 189, 248, 0.45);
      box-shadow: 0 28px 64px rgba(13, 148, 136, 0.35);
    }
    .dialogue-overlay[data-intent="unit"] .dialogue-console {
      border-color: rgba(244, 114, 182, 0.45);
      box-shadow: 0 28px 64px rgba(236, 72, 153, 0.28);
    }
    .dialogue-speaker {
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(148, 163, 184, 0.75);
    }
    .dialogue-text {
      min-height: 90px;
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
    }
    .dialogue-cursor {
      display: inline-block;
      margin-left: 4px;
      animation: dialogue-cursor-blink 1.2s steps(2, start) infinite;
    }
    .dialogue-cursor.hidden {
      display: none;
    }
    .dialogue-choices {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .dialogue-choices.hidden {
      display: none;
    }
    .dialogue-choices button,
    .dialogue-continue {
      font: inherit;
      text-align: left;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.3);
      background: rgba(24, 36, 48, 0.85);
      color: inherit;
      cursor: pointer;
      transition: background 0.18s ease, border-color 0.18s ease;
    }
    .dialogue-continue {
      text-align: center;
    }
    .dialogue-continue.hidden {
      display: none;
    }
    .dialogue-choices button:hover,
    .dialogue-choices button:focus-visible,
    .dialogue-continue:hover,
    .dialogue-continue:focus-visible {
      border-color: rgba(56, 189, 248, 0.55);
      background: rgba(30, 45, 60, 0.95);
      outline: none;
    }
    @keyframes dialogue-cursor-blink {
      0%, 50% { opacity: 1; }
      50.01%, 100% { opacity: 0; }
    }
  `;
    document.head.appendChild(style);
  }

  // web/src/story/controller.ts
  function createStoryController({ bus, overlay, state }) {
    const listeners = [];
    let tutorialTipElement = null;
    function handleNodeActivated({ nodeId, dialogue }) {
      console.log("[story] Node activated:", nodeId);
      if (!dialogue) {
        console.error("[story] No dialogue provided by server for:", nodeId);
        acknowledgeNode(nodeId, null);
        return;
      }
      const parts = nodeId.split(".");
      if (parts.length < 3 || parts[0] !== "story") {
        console.warn("[story] Invalid node ID format:", nodeId);
        return;
      }
      const chapter = parts[1];
      const node = parts.slice(2).join(".");
      showDialogueForNode(chapter, node, nodeId, dialogue);
    }
    function showDialogueForNode(chapter, node, fullNodeId, content) {
      if (content.tutorialTip) {
        showTutorialTip(content.tutorialTip);
      }
      const overlayContent = {
        speaker: content.speaker,
        text: content.text,
        intent: content.intent,
        continueLabel: content.continueLabel,
        typingSpeedMs: content.typingSpeedMs
      };
      if (content.choices && content.choices.length > 0) {
        overlayContent.choices = content.choices;
        overlayContent.onChoice = (choiceId) => {
          hideTutorialTip();
          overlay.hide();
          acknowledgeNode(fullNodeId, choiceId);
          bus.emit("dialogue:closed", { nodeId: node, chapterId: chapter });
        };
      } else {
        overlayContent.onContinue = () => {
          hideTutorialTip();
          overlay.hide();
          acknowledgeNode(fullNodeId, null);
          bus.emit("dialogue:closed", { nodeId: node, chapterId: chapter });
        };
      }
      if (content.autoAdvance) {
        overlayContent.onTextFullyRendered = () => {
          setTimeout(() => {
            hideTutorialTip();
            overlay.hide();
            acknowledgeNode(fullNodeId, null);
            bus.emit("dialogue:closed", { nodeId: node, chapterId: chapter });
          }, content.autoAdvance.delayMs);
        };
      }
      overlay.show(overlayContent);
      bus.emit("dialogue:opened", { nodeId: node, chapterId: chapter });
    }
    function showTutorialTip(tip) {
      hideTutorialTip();
      const tipContainer = document.createElement("div");
      tipContainer.className = "story-tutorial-tip";
      tipContainer.innerHTML = `
      <div class="story-tutorial-tip-content">
        <div class="story-tutorial-tip-title">${escapeHtml(tip.title)}</div>
        <div class="story-tutorial-tip-text">${escapeHtml(tip.text)}</div>
      </div>
    `;
      document.body.appendChild(tipContainer);
      tutorialTipElement = tipContainer;
      ensureTutorialTipStyles();
    }
    function hideTutorialTip() {
      if (tutorialTipElement) {
        tutorialTipElement.remove();
        tutorialTipElement = null;
      }
    }
    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
    function ensureTutorialTipStyles() {
      const styleId = "story-tutorial-tip-styles";
      if (document.getElementById(styleId)) {
        return;
      }
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
      .story-tutorial-tip {
        position: fixed;
        top: 80px;
        right: 20px;
        max-width: 320px;
        background: rgba(13, 148, 136, 0.95);
        border: 1px solid rgba(56, 189, 248, 0.6);
        border-radius: 8px;
        padding: 14px 16px;
        color: #e2e8f0;
        font-family: "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;
        font-size: 12px;
        line-height: 1.5;
        z-index: 55;
        box-shadow: 0 8px 24px rgba(2, 6, 16, 0.5);
        animation: story-tip-slide-in 0.3s ease-out;
      }
      .story-tutorial-tip-title {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #38bdf8;
        margin-bottom: 8px;
      }
      .story-tutorial-tip-text {
        color: #f1f5f9;
      }
      @keyframes story-tip-slide-in {
        from {
          opacity: 0;
          transform: translateX(20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `;
      document.head.appendChild(style);
    }
    function acknowledgeNode(nodeId, choiceId) {
      const msg = {
        type: "dag_story_ack",
        node_id: nodeId
      };
      if (choiceId) {
        msg.choice_id = choiceId;
      }
      sendMessage(msg);
      console.log("[story] Acknowledged node:", nodeId, choiceId ? `(choice: ${choiceId})` : "");
    }
    function start() {
      var _a, _b;
      console.log("[story] Starting story controller");
      listeners.push(bus.on("story:nodeActivated", handleNodeActivated));
      if ((_a = state.story) == null ? void 0 : _a.activeNode) {
        console.log("[story] Found active story node on startup:", state.story.activeNode);
        handleNodeActivated({
          nodeId: state.story.activeNode,
          dialogue: (_b = state.story.dialogue) != null ? _b : void 0
        });
      }
    }
    function destroy() {
      hideTutorialTip();
      listeners.forEach((unsub) => unsub());
      listeners.length = 0;
    }
    return {
      start,
      destroy
    };
  }

  // web/src/story/index.ts
  function mountStory({ bus, state }) {
    const overlay = createDialogueOverlay();
    const controller = createStoryController({
      bus,
      overlay,
      state
    });
    controller.start();
    return {
      destroy() {
        controller.destroy();
        overlay.destroy();
      },
      reset() {
        console.warn("[story] reset() called but story is now server-driven");
      }
    };
  }

  // web/src/start-gate.ts
  var STORAGE_KEY = "lsd:muted";
  function getCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = window.LSD_AUDIO_CTX;
    return ctx instanceof AC ? ctx : null;
  }
  var MuteManager = class {
    constructor() {
      this.buttons = [];
      this.enforcing = false;
      document.addEventListener("lsd:muteChanged", (e) => {
        var _a;
        const muted = !!((_a = e == null ? void 0 : e.detail) == null ? void 0 : _a.muted);
        this.applyUI(muted);
      });
    }
    isMuted() {
      return localStorage.getItem(STORAGE_KEY) === "1";
    }
    save(muted) {
      try {
        localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
      } catch (e) {
      }
    }
    label(btn, muted) {
      btn.setAttribute("aria-pressed", String(muted));
      btn.title = muted ? "Unmute (M)" : "Mute (M)";
      btn.textContent = muted ? "\u{1F508} Unmute" : "\u{1F507} Mute";
    }
    applyUI(muted) {
      this.buttons.forEach((b) => this.label(b, muted));
    }
    attachButton(btn) {
      this.buttons.push(btn);
      this.label(btn, this.isMuted());
      btn.addEventListener("click", () => this.toggle());
    }
    async setMuted(muted) {
      this.save(muted);
      this.applyUI(muted);
      const ctx = getCtx();
      if (ctx) {
        try {
          if (muted && ctx.state !== "suspended") {
            await ctx.suspend();
          } else if (!muted && ctx.state !== "running") {
            await ctx.resume();
          }
        } catch (e) {
          console.warn("[audio] mute toggle failed:", e);
        }
      }
      document.dispatchEvent(new CustomEvent("lsd:muteChanged", { detail: { muted } }));
    }
    toggle() {
      this.setMuted(!this.isMuted());
    }
    // If ctx isn't created until after Start, enforce persisted state once available
    enforceOnceWhenReady() {
      if (this.enforcing) return;
      this.enforcing = true;
      const tick = () => {
        const ctx = getCtx();
        if (!ctx) {
          requestAnimationFrame(tick);
          return;
        }
        this.setMuted(this.isMuted());
      };
      tick();
    }
  };
  var muteMgr = new MuteManager();
  function ensureTopFrameMuteButton() {
    const topRight = document.getElementById("top-right");
    if (!topRight) return;
    if (topRight.querySelector("#mute-top")) return;
    const btn = document.createElement("button");
    btn.id = "mute-top";
    btn.className = "ghost-btn small";
    btn.setAttribute("aria-pressed", "false");
    btn.title = "Mute (M)";
    btn.textContent = "\u{1F507} Mute";
    topRight.appendChild(btn);
    muteMgr.attachButton(btn);
  }
  (function installMuteHotkey() {
    window.addEventListener("keydown", (e) => {
      var _a;
      if (((_a = e.key) == null ? void 0 : _a.toLowerCase()) === "m") {
        e.preventDefault();
        muteMgr.toggle();
      }
    });
  })();
  function waitForUserStart(opts = {}) {
    const { label = "Start Game", requestFullscreen = false, resumeAudio: resumeAudio2 } = opts;
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "start-overlay";
      overlay.innerHTML = `
      <div id="start-container">
        <button id="start-btn" aria-label="${label}">${label}</button>
        <div style="margin-top:10px">
          <button id="mute-below-start" class="ghost-btn" aria-pressed="false" title="Mute (M)">\u{1F507} Mute</button>
        </div>
        <p> On mobile turn phone to landscape for best experience. </p>
      </div>
    `;
      document.body.appendChild(overlay);
      const style = document.createElement("style");
      style.textContent = `
      #start-overlay {
        position: fixed; inset: 0; display: flex; justify-content: center; align-items: center;
        background: radial-gradient(circle at center, rgba(0,0,0,0.6), rgba(0,0,0,0.9));
        z-index: 9999;
      }
      #start-container { text-align: center; }
      #start-btn {
        font-size: 2rem; padding: 1rem 2.5rem; border: 2px solid #fff; border-radius: 10px;
        background: transparent; color: #fff; cursor: pointer; transition: transform .12s ease, background .2s ease, color .2s ease;
      }
      #start-btn:hover { background: #fff; color: #000; transform: translateY(-1px); }
      #start-btn:active { transform: translateY(0); }
      #mute-below-start {
        font-size: 1rem; padding: .5rem 1rem; border-radius: 999px; border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(30, 41, 59, 0.72); color: #f8fafc;
      }
      .ghost-btn.small { padding: 4px 8px; font-size: 11px; }
    `;
      document.head.appendChild(style);
      const startBtn = overlay.querySelector("#start-btn");
      const muteBelowStart = overlay.querySelector("#mute-below-start");
      const topMute = document.getElementById("mute-top");
      if (topMute) muteMgr.attachButton(topMute);
      muteMgr.attachButton(muteBelowStart);
      muteMgr.enforceOnceWhenReady();
      const start = async () => {
        var _a, _b;
        try {
          await (resumeAudio2 == null ? void 0 : resumeAudio2());
        } catch (e) {
        }
        muteMgr.enforceOnceWhenReady();
        if (requestFullscreen) {
          try {
            await ((_b = (_a = document.documentElement).requestFullscreen) == null ? void 0 : _b.call(_a));
          } catch (e) {
          }
        }
        style.remove();
        overlay.remove();
        ensureTopFrameMuteButton();
        resolve();
      };
      startBtn.addEventListener("click", start, { once: true });
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          start();
        }
      });
      startBtn.tabIndex = 0;
      startBtn.focus();
      ensureTopFrameMuteButton();
    });
  }

  // web/src/audio/engine.ts
  var _AudioEngine = class _AudioEngine {
    constructor() {
      this._targetMaster = 0.9;
      this._targetMusic = 0.9;
      this._targetSfx = 0.9;
      this.ctx = new AudioContext();
      window.LSD_AUDIO_CTX = this.ctx;
      this.master = new GainNode(this.ctx, { gain: this._targetMaster });
      this.musicBus = new GainNode(this.ctx, { gain: this._targetMusic });
      this.sfxBus = new GainNode(this.ctx, { gain: this._targetSfx });
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    static get() {
      if (!this._inst) this._inst = new _AudioEngine();
      return this._inst;
    }
    get now() {
      return this.ctx.currentTime;
    }
    getMusicBus() {
      return this.musicBus;
    }
    getSfxBus() {
      return this.sfxBus;
    }
    async resume() {
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
    }
    async suspend() {
      if (this.ctx.state === "running") {
        await this.ctx.suspend();
      }
    }
    setMasterGain(v, t = this.now, ramp = 0.03) {
      this._targetMaster = v;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(v, t + ramp);
    }
    setMusicGain(v, t = this.now, ramp = 0.03) {
      this._targetMusic = v;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.linearRampToValueAtTime(v, t + ramp);
    }
    setSfxGain(v, t = this.now, ramp = 0.03) {
      this._targetSfx = v;
      this.sfxBus.gain.cancelScheduledValues(t);
      this.sfxBus.gain.linearRampToValueAtTime(v, t + ramp);
    }
    duckMusic(level = 0.4, attack = 0.05) {
      const t = this.now;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.linearRampToValueAtTime(level, t + attack);
    }
    unduckMusic(release = 0.25) {
      const t = this.now;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.linearRampToValueAtTime(this._targetMusic, t + release);
    }
  };
  _AudioEngine._inst = null;
  var AudioEngine = _AudioEngine;
  function makePRNG(seed) {
    let s = seed >>> 0 || 1;
    return function() {
      s += 1831565813;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // web/src/audio/graph.ts
  function osc(ctx, type, freq) {
    return new OscillatorNode(ctx, { type, frequency: freq });
  }
  function noise(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return new AudioBufferSourceNode(ctx, { buffer, loop: true });
  }
  function makePanner(ctx, pan = 0) {
    return new StereoPannerNode(ctx, { pan });
  }
  function adsr(ctx, param, t0, a = 0.01, d = 0.08, s = 0.5, r = 0.2, peak = 1) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0, t0);
    param.linearRampToValueAtTime(peak, t0 + a);
    param.linearRampToValueAtTime(s * peak, t0 + a + d);
    return (releaseAt = ctx.currentTime) => {
      param.cancelScheduledValues(releaseAt);
      param.setValueAtTime(param.value, releaseAt);
      param.linearRampToValueAtTime(1e-4, releaseAt + r);
    };
  }

  // web/src/audio/sfx.ts
  function playSfx(engine, name, opts = {}) {
    switch (name) {
      case "laser":
        return playLaser(engine, opts);
      case "thrust":
        return playThrust(engine, opts);
      case "explosion":
        return playExplosion(engine, opts);
      case "lock":
        return playLock(engine, opts);
      case "ui":
        return playUi(engine, opts);
      case "dialogue":
        return playDialogue(engine, opts);
    }
  }
  function playLaser(engine, { velocity = 1, pan = 0 } = {}) {
    const { ctx, now } = engine;
    const out = engine.getSfxBus();
    const o = osc(ctx, "square", 680 + 160 * velocity);
    const f = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 1200 });
    const g = new GainNode(ctx, { gain: 0 });
    const p = makePanner(ctx, pan);
    o.connect(f).connect(g).connect(p).connect(out);
    const release = adsr(ctx, g.gain, now, 2e-3, 0.03, 0.25, 0.08, 0.65);
    o.start(now);
    release(now + 0.06);
    o.stop(now + 0.2);
  }
  function playThrust(engine, { velocity = 0.6, pan = 0 } = {}) {
    const { ctx, now } = engine;
    const out = engine.getSfxBus();
    const n = noise(ctx);
    const f = new BiquadFilterNode(ctx, {
      type: "bandpass",
      frequency: 180 + 360 * velocity,
      Q: 1.1
    });
    const g = new GainNode(ctx, { gain: 0 });
    const p = makePanner(ctx, pan);
    n.connect(f).connect(g).connect(p).connect(out);
    const release = adsr(ctx, g.gain, now, 0.012, 0.15, 0.75, 0.25, 0.45 * velocity);
    n.start(now);
    release(now + 0.25);
    n.stop(now + 1);
  }
  function playExplosion(engine, { velocity = 1, pan = 0 } = {}) {
    const { ctx, now } = engine;
    const out = engine.getSfxBus();
    const n = noise(ctx);
    const f = new BiquadFilterNode(ctx, {
      type: "lowpass",
      frequency: 2200 * Math.max(0.2, Math.min(velocity, 1)),
      Q: 0.2
    });
    const g = new GainNode(ctx, { gain: 0 });
    const p = makePanner(ctx, pan);
    n.connect(f).connect(g).connect(p).connect(out);
    const release = adsr(ctx, g.gain, now, 5e-3, 0.08, 0.5, 0.35, 1.1 * velocity);
    n.start(now);
    release(now + 0.15 + 0.1 * velocity);
    n.stop(now + 1.2);
  }
  function playLock(engine, { velocity = 1, pan = 0 } = {}) {
    const { ctx, now } = engine;
    const out = engine.getSfxBus();
    const base = 520 + 140 * velocity;
    const o1 = osc(ctx, "sine", base);
    const o2 = osc(ctx, "sine", base * 1.5);
    const g = new GainNode(ctx, { gain: 0 });
    const p = makePanner(ctx, pan);
    o1.connect(g);
    o2.connect(g);
    g.connect(p).connect(out);
    const release = adsr(ctx, g.gain, now, 1e-3, 0.02, 0, 0.12, 0.6);
    o1.start(now);
    o2.start(now + 0.02);
    release(now + 0.06);
    o1.stop(now + 0.2);
    o2.stop(now + 0.22);
  }
  function playUi(engine, { velocity = 1, pan = 0 } = {}) {
    const { ctx, now } = engine;
    const out = engine.getSfxBus();
    const o = osc(ctx, "triangle", 880 - 120 * velocity);
    const g = new GainNode(ctx, { gain: 0 });
    const p = makePanner(ctx, pan);
    o.connect(g).connect(p).connect(out);
    const release = adsr(ctx, g.gain, now, 1e-3, 0.04, 0, 0.08, 0.35);
    o.start(now);
    release(now + 0.05);
    o.stop(now + 0.18);
  }
  function playDialogue(engine, { velocity = 1, pan = 0 } = {}) {
    const { ctx, now } = engine;
    const out = engine.getSfxBus();
    const freq = 480 + 160 * velocity;
    const o = osc(ctx, "sine", freq);
    const g = new GainNode(ctx, { gain: 1e-4 });
    const p = makePanner(ctx, pan);
    o.connect(g).connect(p).connect(out);
    g.gain.setValueAtTime(1e-4, now);
    g.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
    g.gain.exponentialRampToValueAtTime(5e-4, now + 0.28);
    o.start(now);
    o.stop(now + 0.3);
  }

  // web/src/story/sfx.ts
  async function resumeAudio() {
    await AudioEngine.get().resume();
  }

  // web/src/audio/music/scenes/ambient.ts
  var MODES = {
    Ionian: [0, 2, 4, 5, 7, 9, 11],
    Dorian: [0, 2, 3, 5, 7, 9, 10],
    Phrygian: [0, 1, 3, 5, 7, 8, 10],
    Lydian: [0, 2, 4, 6, 7, 9, 11],
    Mixolydian: [0, 2, 4, 5, 7, 9, 10],
    Aeolian: [0, 2, 3, 5, 7, 8, 10],
    Locrian: [0, 1, 3, 5, 6, 8, 10]
  };
  var ROOT_MAX_GAIN = 0.33;
  var ROOT_SWELL_TIME = 20;
  var DRONE_SHIFT_MIN_S = 24;
  var DRONE_SHIFT_MAX_S = 48;
  var DRONE_GLIDE_MIN_S = 8;
  var DRONE_GLIDE_MAX_S = 15;
  var CHORD_VOICES_MAX = 5;
  var CHORD_FADE_MIN_S = 8;
  var CHORD_FADE_MAX_S = 16;
  var CHORD_HOLD_MIN_S = 10;
  var CHORD_HOLD_MAX_S = 22;
  var CHORD_GAP_MIN_S = 4;
  var CHORD_GAP_MAX_S = 9;
  var CHORD_ANCHOR_PROB = 0.6;
  var FILTER_BASE_HZ = 220;
  var FILTER_PEAK_HZ = 4200;
  var SWEEP_SEG_S = 30;
  var LFO_RATE_HZ = 0.05;
  var LFO_DEPTH_HZ = 900;
  var DELAY_TIME_S = 0.45;
  var FEEDBACK_GAIN = 0.35;
  var WET_MIX = 0.28;
  var PREFERRED_DEGREE_ORDER = [0, 4, 2, 5, 1, 3, 6];
  var clamp01 = (x) => Math.max(0, Math.min(1, x));
  var rand = (rng, a, b) => a + rng() * (b - a);
  var choice = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  var midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  var Voice = class {
    constructor(ctx, targetGain, waveform, freqHz, destination, rng) {
      this.ctx = ctx;
      this.targetGain = targetGain;
      this.killed = false;
      this.osc = new OscillatorNode(ctx, { type: waveform, frequency: freqHz });
      this.shimmer = new OscillatorNode(ctx, { type: "sine", frequency: rand(rng, 0.06, 0.18) });
      this.shimmerGain = new GainNode(ctx, { gain: rand(rng, 0.4, 1.2) });
      this.scale = new GainNode(ctx, { gain: 25 });
      this.shimmer.connect(this.shimmerGain).connect(this.scale).connect(this.osc.detune);
      this.g = new GainNode(ctx, { gain: 0 });
      this.osc.connect(this.g).connect(destination);
      this.osc.start();
      this.shimmer.start();
    }
    fadeIn(seconds) {
      const now = this.ctx.currentTime;
      this.g.gain.cancelScheduledValues(now);
      this.g.gain.setValueAtTime(this.g.gain.value, now);
      this.g.gain.linearRampToValueAtTime(this.targetGain, now + seconds);
    }
    fadeOutKill(seconds) {
      if (this.killed) return;
      this.killed = true;
      const now = this.ctx.currentTime;
      this.g.gain.cancelScheduledValues(now);
      this.g.gain.setValueAtTime(this.g.gain.value, now);
      this.g.gain.linearRampToValueAtTime(1e-4, now + seconds);
      setTimeout(() => this.stop(), seconds * 1e3 + 60);
    }
    setFreqGlide(targetHz, glideSeconds) {
      const now = this.ctx.currentTime;
      const current = Math.max(1e-4, this.osc.frequency.value);
      this.osc.frequency.cancelScheduledValues(now);
      try {
        this.osc.frequency.setValueAtTime(current, now);
        this.osc.frequency.exponentialRampToValueAtTime(targetHz, now + glideSeconds);
      } catch (e) {
        this.osc.frequency.linearRampToValueAtTime(targetHz, now + glideSeconds);
      }
    }
    stop() {
      try {
        this.osc.stop();
        this.shimmer.stop();
      } catch (e) {
      }
      try {
        this.osc.disconnect();
        this.shimmer.disconnect();
        this.g.disconnect();
        this.shimmerGain.disconnect();
        this.scale.disconnect();
      } catch (e) {
      }
    }
  };
  var AmbientScene = class {
    constructor(ctx, out, seed = 1) {
      this.ctx = ctx;
      this.out = out;
      this.running = false;
      this.stopFns = [];
      this.timeouts = [];
      this.params = { intensity: 0.75, brightness: 0.5, density: 0.6 };
      // musical state
      this.keyRootMidi = 43;
      this.mode = "Ionian";
      this.droneDegreeIdx = 0;
      this.rootVoice = null;
      this.rng = makePRNG(seed);
    }
    setParam(k, v) {
      this.params[k] = clamp01(v);
      if (this.running && k === "intensity" && this.master) {
        this.master.gain.value = 0.15 + 0.85 * this.params.intensity;
      }
    }
    start() {
      if (this.running) return;
      this.running = true;
      this.master = new GainNode(this.ctx, { gain: 0.15 + 0.85 * this.params.intensity });
      this.filter = new BiquadFilterNode(this.ctx, { type: "lowpass", Q: 0.707 });
      this.dry = new GainNode(this.ctx, { gain: 1 });
      this.wet = new GainNode(this.ctx, { gain: WET_MIX });
      this.delay = new DelayNode(this.ctx, { delayTime: DELAY_TIME_S, maxDelayTime: 2 });
      this.feedback = new GainNode(this.ctx, { gain: FEEDBACK_GAIN });
      this.filter.connect(this.dry).connect(this.master);
      this.filter.connect(this.delay);
      this.delay.connect(this.feedback).connect(this.delay);
      this.delay.connect(this.wet).connect(this.master);
      this.master.connect(this.out);
      this.filter.frequency.setValueAtTime(FILTER_BASE_HZ, this.ctx.currentTime);
      const sweep = () => {
        const t = this.ctx.currentTime;
        this.filter.frequency.cancelScheduledValues(t);
        this.filter.frequency.setTargetAtTime(
          FILTER_BASE_HZ + (FILTER_PEAK_HZ - FILTER_BASE_HZ) * (0.4 + 0.6 * this.params.brightness),
          t,
          SWEEP_SEG_S / 3
        );
        this.filter.frequency.setTargetAtTime(
          FILTER_BASE_HZ * (0.7 + 0.3 * this.params.brightness),
          t + SWEEP_SEG_S,
          SWEEP_SEG_S / 3
        );
        this.timeouts.push(window.setTimeout(() => this.running && sweep(), SWEEP_SEG_S * 2 * 1e3));
      };
      sweep();
      this.lfoNode = new OscillatorNode(this.ctx, { type: "sine", frequency: LFO_RATE_HZ });
      this.lfoGain = new GainNode(this.ctx, { gain: LFO_DEPTH_HZ * (0.5 + 0.5 * this.params.brightness) });
      this.lfoNode.connect(this.lfoGain).connect(this.filter.frequency);
      this.lfoNode.start();
      this.spawnRootDrone();
      this.scheduleNextDroneMove();
      this.chordCycle();
      this.stopFns.push(() => {
        var _a;
        try {
          (_a = this.lfoNode) == null ? void 0 : _a.stop();
        } catch (e) {
        }
        [this.master, this.filter, this.dry, this.wet, this.delay, this.feedback, this.lfoNode, this.lfoGain].forEach((n) => {
          try {
            n == null ? void 0 : n.disconnect();
          } catch (e) {
          }
        });
      });
    }
    stop() {
      if (!this.running) return;
      this.running = false;
      this.timeouts.splice(0).forEach((id) => window.clearTimeout(id));
      if (this.rootVoice) this.rootVoice.fadeOutKill(1.2);
      this.stopFns.splice(0).forEach((fn) => fn());
    }
    /* ------------------------- Musical engine below ------------------------- */
    currentDegrees() {
      return MODES[this.mode] || MODES.Lydian;
    }
    /** Drone root voice */
    spawnRootDrone() {
      const baseMidi = this.keyRootMidi + this.currentDegrees()[this.droneDegreeIdx];
      const v = new Voice(
        this.ctx,
        ROOT_MAX_GAIN,
        "sine",
        midiToFreq(baseMidi),
        this.filter,
        this.rng
      );
      v.fadeIn(ROOT_SWELL_TIME);
      this.rootVoice = v;
    }
    scheduleNextDroneMove() {
      if (!this.running) return;
      const waitMs = rand(this.rng, DRONE_SHIFT_MIN_S, DRONE_SHIFT_MAX_S) * 1e3;
      const id = window.setTimeout(() => {
        if (!this.running || !this.rootVoice) return;
        const glide = rand(this.rng, DRONE_GLIDE_MIN_S, DRONE_GLIDE_MAX_S);
        const nextIdx = this.pickNextDroneDegreeIdx();
        const targetMidi = this.keyRootMidi + this.currentDegrees()[nextIdx];
        this.rootVoice.setFreqGlide(midiToFreq(targetMidi), glide);
        this.droneDegreeIdx = nextIdx;
        this.scheduleNextDroneMove();
      }, waitMs);
      this.timeouts.push(id);
    }
    pickNextDroneDegreeIdx() {
      const order = [...PREFERRED_DEGREE_ORDER];
      const i = order.indexOf(this.droneDegreeIdx);
      if (i >= 0) {
        const [cur] = order.splice(i, 1);
        order.push(cur);
      }
      return choice(this.rng, order);
    }
    /** Build diatonic stacked-third chord degrees with optional extensions */
    buildChordDegrees(modeDegs, rootIndex, size = 4, add9 = false, add11 = false, add13 = false) {
      const steps = [0, 2, 4, 6];
      const chordIdxs = steps.slice(0, Math.min(size, 4)).map((s) => (rootIndex + s) % 7);
      if (add9) chordIdxs.push((rootIndex + 8) % 7);
      if (add11) chordIdxs.push((rootIndex + 10) % 7);
      if (add13) chordIdxs.push((rootIndex + 12) % 7);
      return chordIdxs.map((i) => modeDegs[i]);
    }
    *endlessChords() {
      while (true) {
        const modeDegs = this.currentDegrees();
        const rootDegreeIndex = this.rng() < CHORD_ANCHOR_PROB ? this.droneDegreeIdx : Math.floor(this.rng() * 7);
        const r = this.rng();
        let size = 3;
        let add9 = false, add11 = false, add13 = false;
        if (r < 0.35) {
          size = 3;
        } else if (r < 0.75) {
          size = 4;
        } else if (r < 0.9) {
          size = 4;
          add9 = true;
        } else if (r < 0.97) {
          size = 4;
          add11 = true;
        } else {
          size = 4;
          add13 = true;
        }
        const chordSemis = this.buildChordDegrees(modeDegs, rootDegreeIndex, size, add9, add11, add13);
        const spread = chordSemis.map((semi) => semi + choice(this.rng, [-12, 0, 0, 12]));
        if (!spread.includes(0) && this.rng() < 0.5) spread.push(0);
        yield spread;
      }
    }
    async chordCycle() {
      var _a;
      const gen = this.endlessChords();
      const voices = /* @__PURE__ */ new Set();
      const sleep = (ms) => new Promise((r) => {
        const id = window.setTimeout(() => r(), ms);
        this.timeouts.push(id);
      });
      while (this.running) {
        const thickness = Math.round(2 + this.params.density * 3);
        const baseMidi = this.keyRootMidi;
        const degreesOff = (_a = gen.next().value) != null ? _a : [];
        for (const off of degreesOff) {
          if (!this.running) break;
          if (voices.size >= Math.min(CHORD_VOICES_MAX, thickness)) break;
          const midi = baseMidi + off;
          const freq = midiToFreq(midi);
          const waveform = choice(this.rng, ["sine", "triangle", "sawtooth"]);
          const gainTarget = rand(this.rng, 0.08, 0.22) * (0.85 + 0.3 * this.params.intensity) * (0.9 + 0.2 * this.params.brightness);
          const v = new Voice(this.ctx, gainTarget, waveform, freq, this.filter, this.rng);
          voices.add(v);
          v.fadeIn(rand(this.rng, CHORD_FADE_MIN_S, CHORD_FADE_MAX_S));
        }
        await sleep(rand(this.rng, CHORD_HOLD_MIN_S, CHORD_HOLD_MAX_S) * 1e3);
        const outs = Array.from(voices);
        for (const v of outs) v.fadeOutKill(rand(this.rng, CHORD_FADE_MIN_S, CHORD_FADE_MAX_S));
        voices.clear();
        await sleep(rand(this.rng, CHORD_GAP_MIN_S, CHORD_GAP_MAX_S) * 1e3);
      }
      for (const v of Array.from(voices)) v.fadeOutKill(0.8);
    }
  };

  // web/src/audio/music/index.ts
  var MusicDirector = class {
    constructor(engine) {
      this.engine = engine;
      this.busOut = new GainNode(engine.ctx, { gain: 0.9 });
      this.busOut.connect(engine.getMusicBus());
    }
    /** Crossfade to a new scene */
    setScene(name, opts) {
      var _a, _b;
      if (((_a = this.current) == null ? void 0 : _a.name) === name) return;
      const old = this.current;
      const t = this.engine.now;
      const fadeOut = new GainNode(this.engine.ctx, { gain: 0.9 });
      fadeOut.connect(this.engine.getMusicBus());
      if (old) {
        old.stop();
        fadeOut.gain.linearRampToValueAtTime(0, t + 0.6);
        setTimeout(() => fadeOut.disconnect(), 650);
      }
      const sceneOut = new GainNode(this.engine.ctx, { gain: 0 });
      sceneOut.connect(this.busOut);
      let stop = () => sceneOut.disconnect();
      if (name === "ambient") {
        const s = new AmbientScene(this.engine.ctx, sceneOut, (_b = opts == null ? void 0 : opts.seed) != null ? _b : 1);
        s.start();
        stop = () => {
          s.stop();
          sceneOut.disconnect();
        };
      }
      this.current = { name, stop };
      sceneOut.gain.linearRampToValueAtTime(0.9, t + 0.6);
    }
    stop() {
      if (!this.current) return;
      this.current.stop();
      this.current = void 0;
    }
  };

  // web/src/audio/cues.ts
  function registerAudioBusBindings(bus, engine, music) {
    bus.on("audio:resume", () => engine.resume());
    bus.on("audio:mute", () => engine.setMasterGain(0));
    bus.on("audio:unmute", () => engine.setMasterGain(0.9));
    bus.on(
      "audio:set-master-gain",
      ({ gain }) => engine.setMasterGain(Math.max(0, Math.min(1, gain)))
    );
    bus.on("audio:sfx", (msg) => {
      playSfx(engine, msg.name, { velocity: msg.velocity, pan: msg.pan });
    });
    bus.on("audio:music:set-scene", (msg) => {
      engine.resume();
      music.setScene(msg.scene, { seed: msg.seed });
    });
    bus.on("audio:music:param", (_msg) => {
    });
    bus.on("audio:music:transport", ({ cmd }) => {
      if (cmd === "stop" || cmd === "pause") music.stop();
    });
  }

  // web/src/mission/controller.ts
  var STORAGE_PREFIX2 = "lsd:mission:";
  var HOLD_EPSILON = 1e-4;
  var CAMPAIGN_MISSIONS = {
    "1": {
      id: "campaign-1",
      holdSeconds: 10,
      defaultWorldSize: { w: 32e3, h: 18e3 },
      beacons: [
        { fx: 0.15, fy: 0.55, radius: 420 },
        { fx: 0.4, fy: 0.5, radius: 360 },
        { fx: 0.65, fy: 0.47, radius: 300 },
        { fx: 0.85, fy: 0.44, radius: 260 }
      ]
    }
  };
  function mountMissionController({ state, bus, mode, missionId }) {
    if (mode !== "campaign") {
      return { destroy() {
      } };
    }
    const spec = missionId && CAMPAIGN_MISSIONS[missionId] ? CAMPAIGN_MISSIONS[missionId] : CAMPAIGN_MISSIONS["1"];
    if (!spec) {
      return { destroy() {
      } };
    }
    const storageKey = `${STORAGE_PREFIX2}${spec.id}`;
    let persisted = loadProgress2(storageKey);
    const completedBefore = persisted.beaconIndex >= spec.beacons.length;
    if (completedBefore) {
      persisted = { beaconIndex: 0, holdAccum: 0 };
      try {
        saveProgress2(storageKey, JSON.stringify(persisted));
      } catch (e) {
      }
    }
    let mission = {
      active: true,
      missionId: spec.id,
      beaconIndex: clampBeaconIndex(persisted.beaconIndex, spec.beacons.length),
      holdAccum: clampHold(persisted.holdAccum, spec.holdSeconds),
      holdRequired: spec.holdSeconds,
      beacons: []
    };
    let lastWorldKey = "";
    let lastPersistedJSON = completedBefore ? JSON.stringify(persisted) : "";
    let lastServerNow = null;
    state.mission = mission;
    bus.emit("mission:start");
    syncBeacons(state.worldMeta);
    function syncBeacons(meta) {
      const worldW = resolveWorldValue(meta == null ? void 0 : meta.w, spec.defaultWorldSize.w);
      const worldH = resolveWorldValue(meta == null ? void 0 : meta.h, spec.defaultWorldSize.h);
      const key = `${worldW.toFixed(2)}:${worldH.toFixed(2)}`;
      if (key === lastWorldKey && mission.beacons.length === spec.beacons.length) {
        return;
      }
      lastWorldKey = key;
      mission.beacons = spec.beacons.map((def) => ({
        cx: def.fx * worldW,
        cy: def.fy * worldH,
        radius: def.radius
      }));
    }
    function persist(force = false) {
      if (!mission.active && mission.beaconIndex >= mission.beacons.length) {
        const payload2 = JSON.stringify({ beaconIndex: mission.beaconIndex, holdAccum: 0 });
        if (!force && payload2 === lastPersistedJSON) return;
        lastPersistedJSON = payload2;
        saveProgress2(storageKey, payload2);
        return;
      }
      const payload = JSON.stringify({
        beaconIndex: mission.beaconIndex,
        holdAccum: clampHold(mission.holdAccum, mission.holdRequired)
      });
      if (!force && payload === lastPersistedJSON) return;
      lastPersistedJSON = payload;
      saveProgress2(storageKey, payload);
    }
    function computeDt(nowSec) {
      if (!Number.isFinite(nowSec)) {
        return 0;
      }
      if (lastServerNow === null || !Number.isFinite(lastServerNow)) {
        lastServerNow = nowSec;
        return 0;
      }
      const dt = nowSec - lastServerNow;
      lastServerNow = nowSec;
      if (!Number.isFinite(dt) || dt <= 0) {
        return 0;
      }
      return dt;
    }
    function isInsideBeacon(cx, cy, radius) {
      const me = state.me;
      if (!me) return false;
      const dx = me.x - cx;
      const dy = me.y - cy;
      const distSq = dx * dx + dy * dy;
      return distSq <= radius * radius;
    }
    function isStalled() {
      var _a;
      const heat = (_a = state.me) == null ? void 0 : _a.heat;
      if (!heat) return false;
      const now = monotonicNow();
      return Number.isFinite(heat.stallUntilMs) && now < heat.stallUntilMs;
    }
    function lockCurrentBeacon() {
      const lockedIndex = mission.beaconIndex;
      bus.emit("mission:beacon-locked", { index: lockedIndex });
      mission.beaconIndex = Math.min(mission.beaconIndex + 1, mission.beacons.length);
      mission.holdAccum = 0;
      persist(true);
      if (mission.beaconIndex >= mission.beacons.length) {
        mission.active = false;
        persist(true);
        bus.emit("mission:completed");
      }
    }
    function resetHoldIfNeeded() {
      if (mission.holdAccum > 0) {
        mission.holdAccum = 0;
        persist();
      }
    }
    const unsubscribe = bus.on("state:updated", () => {
      if (!state.mission || !state.mission.active) {
        return;
      }
      mission = state.mission;
      syncBeacons(state.worldMeta);
      if (mission.beaconIndex >= mission.beacons.length) {
        mission.active = false;
        persist(true);
        bus.emit("mission:completed");
        return;
      }
      const beacon = mission.beacons[mission.beaconIndex];
      if (!beacon) {
        mission.active = false;
        persist(true);
        bus.emit("mission:completed");
        return;
      }
      const dt = computeDt(state.now);
      if (!state.me) {
        lastServerNow = state.now;
        resetHoldIfNeeded();
        return;
      }
      if (isInsideBeacon(beacon.cx, beacon.cy, beacon.radius) && !isStalled()) {
        const nextHold = Math.min(mission.holdRequired, mission.holdAccum + dt);
        if (Math.abs(nextHold - mission.holdAccum) > HOLD_EPSILON) {
          mission.holdAccum = nextHold;
          persist();
        }
        if (mission.holdAccum + HOLD_EPSILON >= mission.holdRequired) {
          lockCurrentBeacon();
        }
      } else {
        resetHoldIfNeeded();
      }
    });
    return {
      destroy() {
        unsubscribe();
      }
    };
  }
  function resolveWorldValue(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
    return fallback;
  }
  function clampBeaconIndex(index, total) {
    if (!Number.isFinite(index)) {
      return 0;
    }
    if (index < 0) return 0;
    if (index > total) return total;
    return Math.floor(index);
  }
  function clampHold(hold, holdRequired) {
    if (!Number.isFinite(hold) || hold < 0) return 0;
    if (hold > holdRequired) return holdRequired;
    return hold;
  }
  function loadProgress2(storageKey) {
    var _a;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return { beaconIndex: 0, holdAccum: 0 };
      }
      const parsed = JSON.parse(raw);
      if (!parsed) {
        return { beaconIndex: 0, holdAccum: 0 };
      }
      return {
        beaconIndex: clampBeaconIndex((_a = parsed.beaconIndex) != null ? _a : 0, Number.MAX_SAFE_INTEGER),
        holdAccum: typeof parsed.holdAccum === "number" ? Math.max(0, parsed.holdAccum) : 0
      };
    } catch (e) {
      return { beaconIndex: 0, holdAccum: 0 };
    }
  }
  function saveProgress2(storageKey, payload) {
    try {
      window.localStorage.setItem(storageKey, payload);
    } catch (e) {
    }
  }

  // web/src/main.ts
  var CALL_SIGN_STORAGE_KEY = "lsd:callsign";
  (async function bootstrap() {
    const qs = new URLSearchParams(window.location.search);
    const room = qs.get("room") || "default";
    const mode = qs.get("mode") || "";
    const missionId = qs.get("mission") || (mode === "campaign" ? "1" : null);
    const nameParam = sanitizeCallSign(qs.get("name"));
    const storedName = sanitizeCallSign(readStoredCallSign());
    const callSign = nameParam || storedName;
    const mapW = parseFloat(qs.get("mapW") || "8000");
    const mapH = parseFloat(qs.get("mapH") || "4500");
    if (nameParam && nameParam !== storedName) {
      persistCallSign(nameParam);
    }
    await waitForUserStart({
      label: "Start Game",
      requestFullscreen: false,
      // flip to true if you want fullscreen
      resumeAudio
      // uses story/sfx.ts
    });
    const state = createInitialState();
    const uiState = createInitialUIState();
    const bus = createEventBus();
    const engine = AudioEngine.get();
    await engine.resume();
    const music = new MusicDirector(engine);
    registerAudioBusBindings(bus, engine, music);
    bus.emit("audio:music:set-scene", { scene: "ambient", seed: 42 });
    bus.on("ship:speedChanged", ({ value }) => {
      if (value > 0) bus.emit("audio:sfx", { name: "thrust", velocity: Math.min(1, value) });
    });
    const game = initGame({ state, uiState, bus });
    mountMissionController({ state, bus, mode, missionId });
    const enableTutorial = mode === "campaign" || mode === "tutorial";
    const enableStory = mode === "campaign";
    if (mode === "campaign") {
      const dispatchedWaves = /* @__PURE__ */ new Set();
      bus.on("mission:beacon-locked", ({ index }) => {
        const waveIndex = index + 1;
        if (waveIndex < 1 || waveIndex > 3) {
          return;
        }
        if (dispatchedWaves.has(waveIndex)) {
          return;
        }
        dispatchedWaves.add(waveIndex);
        sendMessage({ type: "mission_spawn_wave", wave_index: waveIndex });
      });
    }
    let tutorial = null;
    let tutorialStarted = false;
    if (enableTutorial) {
      tutorial = mountTutorial(bus);
    }
    const startTutorial = () => {
      if (!tutorial || tutorialStarted) return;
      tutorialStarted = true;
      clearProgress(BASIC_TUTORIAL_ID);
      tutorial.start({ resume: false });
    };
    if (enableStory) {
      mountStory({ bus, state, roomId: room });
    } else if (mode === "tutorial") {
      startTutorial();
    }
    connectWebSocket({
      room,
      state,
      bus,
      mapW,
      mapH,
      mode,
      missionId: missionId != null ? missionId : void 0,
      onStateUpdated: () => game.onStateUpdated(),
      onOpen: () => {
        const nameToSend = callSign || sanitizeCallSign(readStoredCallSign());
        if (nameToSend) sendMessage({ type: "join", name: nameToSend });
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        void engine.suspend();
      } else {
        void engine.resume();
      }
    });
  })();
  function sanitizeCallSign(value) {
    if (!value) return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.slice(0, 24);
  }
  function persistCallSign(name) {
    try {
      if (name) window.localStorage.setItem(CALL_SIGN_STORAGE_KEY, name);
      else window.localStorage.removeItem(CALL_SIGN_STORAGE_KEY);
    } catch (e) {
    }
  }
  function readStoredCallSign() {
    var _a;
    try {
      return (_a = window.localStorage.getItem(CALL_SIGN_STORAGE_KEY)) != null ? _a : "";
    } catch (e) {
      return "";
    }
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS9jb25zdGFudHMudHMiLCAic3JjL2dhbWUvY2FtZXJhLnRzIiwgInNyYy9nYW1lL2lucHV0LnRzIiwgInNyYy9yb3V0ZS50cyIsICJzcmMvZ2FtZS9sb2dpYy50cyIsICJzcmMvZ2FtZS9yZW5kZXIudHMiLCAic3JjL2dhbWUvdWkudHMiLCAic3JjL21pc3Npb24vaHVkLnRzIiwgInNyYy9nYW1lLnRzIiwgInNyYy90dXRvcmlhbC9oaWdobGlnaHQudHMiLCAic3JjL3R1dG9yaWFsL3N0b3JhZ2UudHMiLCAic3JjL3R1dG9yaWFsL3JvbGVzLnRzIiwgInNyYy90dXRvcmlhbC9lbmdpbmUudHMiLCAic3JjL3R1dG9yaWFsL3N0ZXBzX2Jhc2ljLnRzIiwgInNyYy90dXRvcmlhbC9pbmRleC50cyIsICJzcmMvc3Rvcnkvb3ZlcmxheS50cyIsICJzcmMvc3RvcnkvY29udHJvbGxlci50cyIsICJzcmMvc3RvcnkvaW5kZXgudHMiLCAic3JjL3N0YXJ0LWdhdGUudHMiLCAic3JjL2F1ZGlvL2VuZ2luZS50cyIsICJzcmMvYXVkaW8vZ3JhcGgudHMiLCAic3JjL2F1ZGlvL3NmeC50cyIsICJzcmMvc3Rvcnkvc2Z4LnRzIiwgInNyYy9hdWRpby9tdXNpYy9zY2VuZXMvYW1iaWVudC50cyIsICJzcmMvYXVkaW8vbXVzaWMvaW5kZXgudHMiLCAic3JjL2F1ZGlvL2N1ZXMudHMiLCAic3JjL21pc3Npb24vY29udHJvbGxlci50cyIsICJzcmMvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHR5cGUgeyBNaXNzaWxlU2VsZWN0aW9uIH0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB0eXBlIHsgRGlhbG9ndWVDb250ZW50IH0gZnJvbSBcIi4vc3RvcnkvdHlwZXNcIjtcblxuZXhwb3J0IHR5cGUgU2hpcENvbnRleHQgPSBcInNoaXBcIiB8IFwibWlzc2lsZVwiO1xuZXhwb3J0IHR5cGUgU2hpcFRvb2wgPSBcInNldFwiIHwgXCJzZWxlY3RcIiB8IG51bGw7XG5leHBvcnQgdHlwZSBNaXNzaWxlVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcblxuZXhwb3J0IGludGVyZmFjZSBFdmVudE1hcCB7XG4gIFwiY29udGV4dDpjaGFuZ2VkXCI6IHsgY29udGV4dDogU2hpcENvbnRleHQgfTtcbiAgXCJzaGlwOnRvb2xDaGFuZ2VkXCI6IHsgdG9vbDogU2hpcFRvb2wgfTtcbiAgXCJzaGlwOndheXBvaW50QWRkZWRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwic2hpcDp3YXlwb2ludE1vdmVkXCI6IHsgaW5kZXg6IG51bWJlcjsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcInNoaXA6aGVhdFByb2plY3Rpb25VcGRhdGVkXCI6IHsgaGVhdFZhbHVlczogbnVtYmVyW10gfTtcbiAgXCJoZWF0Om1hcmtlckFsaWduZWRcIjogeyB2YWx1ZTogbnVtYmVyOyBtYXJrZXI6IG51bWJlciB9O1xuICBcImhlYXQ6d2FybkVudGVyZWRcIjogeyB2YWx1ZTogbnVtYmVyOyB3YXJuQXQ6IG51bWJlciB9O1xuICBcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCI6IHsgdmFsdWU6IG51bWJlcjsgd2FybkF0OiBudW1iZXIgfTtcbiAgXCJoZWF0OnN0YWxsVHJpZ2dlcmVkXCI6IHsgc3RhbGxVbnRpbDogbnVtYmVyIH07XG4gIFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCI6IHsgcGxhbm5lZDogbnVtYmVyOyBhY3R1YWw6IG51bWJlciB9O1xuICBcInVpOndheXBvaW50SG92ZXJTdGFydFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJ1aTp3YXlwb2ludEhvdmVyRW5kXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6c2VsZWN0aW9uQ2hhbmdlZFwiOiB7IHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlcjsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6YWdyb0NoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIjogeyBzZWNvbmRzUmVtYWluaW5nOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmRlbGV0ZUludm9rZWRcIjogdm9pZDtcbiAgXCJtaXNzaWxlOnByZXNldFNlbGVjdGVkXCI6IHsgcHJlc2V0TmFtZTogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpoZWF0UHJvamVjdGlvblVwZGF0ZWRcIjogeyB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47IG92ZXJoZWF0QXQ/OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOm92ZXJoZWF0ZWRcIjogeyBtaXNzaWxlSWQ6IHN0cmluZzsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJoZWxwOnZpc2libGVDaGFuZ2VkXCI6IHsgdmlzaWJsZTogYm9vbGVhbiB9O1xuICBcInN0YXRlOnVwZGF0ZWRcIjogdm9pZDtcbiAgXCJ0dXRvcmlhbDpzdGFydGVkXCI6IHsgaWQ6IHN0cmluZyB9O1xuICBcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCI6IHsgaWQ6IHN0cmluZzsgc3RlcEluZGV4OiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfTtcbiAgXCJ0dXRvcmlhbDpjb21wbGV0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c2tpcHBlZFwiOiB7IGlkOiBzdHJpbmc7IGF0U3RlcDogbnVtYmVyIH07XG4gIFwiYm90OnNwYXduUmVxdWVzdGVkXCI6IHZvaWQ7XG4gIFwiZGlhbG9ndWU6b3BlbmVkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwiZGlhbG9ndWU6Y2xvc2VkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwiZGlhbG9ndWU6Y2hvaWNlXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNob2ljZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwic3Rvcnk6ZmxhZ1VwZGF0ZWRcIjogeyBmbGFnOiBzdHJpbmc7IHZhbHVlOiBib29sZWFuIH07XG4gIFwic3Rvcnk6cHJvZ3Jlc3NlZFwiOiB7IGNoYXB0ZXJJZDogc3RyaW5nOyBub2RlSWQ6IHN0cmluZyB9O1xuICBcInN0b3J5Om5vZGVBY3RpdmF0ZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgZGlhbG9ndWU/OiBEaWFsb2d1ZUNvbnRlbnQgfTtcbiAgXCJtaXNzaW9uOnN0YXJ0XCI6IHZvaWQ7XG4gIFwibWlzc2lvbjpiZWFjb24tbG9ja2VkXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3Npb246Y29tcGxldGVkXCI6IHZvaWQ7XG4gIFwiYXVkaW86cmVzdW1lXCI6IHZvaWQ7XG4gIFwiYXVkaW86bXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnVubXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiOiB7IGdhaW46IG51bWJlciB9O1xuICBcImF1ZGlvOnNmeFwiOiB7IG5hbWU6IFwidWlcIiB8IFwibGFzZXJcIiB8IFwidGhydXN0XCIgfCBcImV4cGxvc2lvblwiIHwgXCJsb2NrXCIgfCBcImRpYWxvZ3VlXCI7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIjogeyBzY2VuZTogXCJhbWJpZW50XCIgfCBcImNvbWJhdFwiIHwgXCJsb2JieVwiOyBzZWVkPzogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6cGFyYW1cIjogeyBrZXk6IHN0cmluZzsgdmFsdWU6IG51bWJlciB9O1xuICBcImF1ZGlvOm11c2ljOnRyYW5zcG9ydFwiOiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfTtcbn1cblxuZXhwb3J0IHR5cGUgRXZlbnRLZXkgPSBrZXlvZiBFdmVudE1hcDtcbmV4cG9ydCB0eXBlIEV2ZW50UGF5bG9hZDxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gRXZlbnRNYXBbS107XG5leHBvcnQgdHlwZSBIYW5kbGVyPEsgZXh0ZW5kcyBFdmVudEtleT4gPSAocGF5bG9hZDogRXZlbnRQYXlsb2FkPEs+KSA9PiB2b2lkO1xuXG50eXBlIFZvaWRLZXlzID0ge1xuICBbSyBpbiBFdmVudEtleV06IEV2ZW50TWFwW0tdIGV4dGVuZHMgdm9pZCA/IEsgOiBuZXZlclxufVtFdmVudEtleV07XG5cbnR5cGUgTm9uVm9pZEtleXMgPSBFeGNsdWRlPEV2ZW50S2V5LCBWb2lkS2V5cz47XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnRCdXMge1xuICBvbjxLIGV4dGVuZHMgRXZlbnRLZXk+KGV2ZW50OiBLLCBoYW5kbGVyOiBIYW5kbGVyPEs+KTogKCkgPT4gdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgTm9uVm9pZEtleXM+KGV2ZW50OiBLLCBwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pOiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBWb2lkS2V5cz4oZXZlbnQ6IEspOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXZlbnRCdXMoKTogRXZlbnRCdXMge1xuICBjb25zdCBoYW5kbGVycyA9IG5ldyBNYXA8RXZlbnRLZXksIFNldDxGdW5jdGlvbj4+KCk7XG4gIHJldHVybiB7XG4gICAgb24oZXZlbnQsIGhhbmRsZXIpIHtcbiAgICAgIGxldCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQpIHtcbiAgICAgICAgc2V0ID0gbmV3IFNldCgpO1xuICAgICAgICBoYW5kbGVycy5zZXQoZXZlbnQsIHNldCk7XG4gICAgICB9XG4gICAgICBzZXQuYWRkKGhhbmRsZXIpO1xuICAgICAgcmV0dXJuICgpID0+IHNldCEuZGVsZXRlKGhhbmRsZXIpO1xuICAgIH0sXG4gICAgZW1pdChldmVudDogRXZlbnRLZXksIHBheWxvYWQ/OiB1bmtub3duKSB7XG4gICAgICBjb25zdCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQgfHwgc2V0LnNpemUgPT09IDApIHJldHVybjtcbiAgICAgIGZvciAoY29uc3QgZm4gb2Ygc2V0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgKGZuIGFzICh2YWx1ZT86IHVua25vd24pID0+IHZvaWQpKHBheWxvYWQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBbYnVzXSBoYW5kbGVyIGZvciAke2V2ZW50fSBmYWlsZWRgLCBlcnIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNoaXBDb250ZXh0LCBTaGlwVG9vbCwgTWlzc2lsZVRvb2wgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgRGlhbG9ndWVDb250ZW50IH0gZnJvbSBcIi4vc3RvcnkvdHlwZXNcIjtcblxuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX1NQRUVEID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfU1BFRUQgPSAyNTA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fQUdSTyA9IDEwMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9MSUZFVElNRSA9IDEyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9MSUZFVElNRSA9IDIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSA9IDgwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiA9IDIwMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUxpbWl0cyB7XG4gIHNwZWVkTWluOiBudW1iZXI7XG4gIHNwZWVkTWF4OiBudW1iZXI7XG4gIGFncm9NaW46IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRWaWV3IHtcbiAgdmFsdWU6IG51bWJlcjtcbiAgbWF4OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIHN0YWxsVW50aWxNczogbnVtYmVyOyAvLyBjbGllbnQtc3luY2VkIHRpbWUgaW4gbWlsbGlzZWNvbmRzXG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaGlwU25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgaHA/OiBudW1iZXI7XG4gIGtpbGxzPzogbnVtYmVyO1xuICB3YXlwb2ludHM6IFdheXBvaW50W107XG4gIGN1cnJlbnRXYXlwb2ludEluZGV4PzogbnVtYmVyO1xuICBoZWF0PzogSGVhdFZpZXc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2hvc3RTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbiAgaGVhdD86IEhlYXRWaWV3OyAvLyBNaXNzaWxlIGhlYXQgZGF0YVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVSb3V0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRQYXJhbXMge1xuICBtYXg6IG51bWJlcjtcbiAgd2FybkF0OiBudW1iZXI7XG4gIG92ZXJoZWF0QXQ6IG51bWJlcjtcbiAgbWFya2VyU3BlZWQ6IG51bWJlcjtcbiAga1VwOiBudW1iZXI7XG4gIGtEb3duOiBudW1iZXI7XG4gIGV4cDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVDb25maWcge1xuICBzcGVlZDogbnVtYmVyO1xuICBhZ3JvUmFkaXVzOiBudW1iZXI7XG4gIGxpZmV0aW1lOiBudW1iZXI7XG4gIGhlYXRQYXJhbXM/OiBIZWF0UGFyYW1zOyAvLyBPcHRpb25hbCBjdXN0b20gaGVhdCBjb25maWd1cmF0aW9uXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVByZXNldCB7XG4gIG5hbWU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgc3BlZWQ6IG51bWJlcjtcbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuICBoZWF0UGFyYW1zOiBIZWF0UGFyYW1zO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEludmVudG9yeUl0ZW0ge1xuICB0eXBlOiBzdHJpbmc7XG4gIHZhcmlhbnRfaWQ6IHN0cmluZztcbiAgaGVhdF9jYXBhY2l0eTogbnVtYmVyO1xuICBxdWFudGl0eTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEludmVudG9yeSB7XG4gIGl0ZW1zOiBJbnZlbnRvcnlJdGVtW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGFnTm9kZSB7XG4gIGlkOiBzdHJpbmc7XG4gIGtpbmQ6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgc3RhdHVzOiBzdHJpbmc7IC8vIFwibG9ja2VkXCIgfCBcImF2YWlsYWJsZVwiIHwgXCJpbl9wcm9ncmVzc1wiIHwgXCJjb21wbGV0ZWRcIlxuICByZW1haW5pbmdfczogbnVtYmVyO1xuICBkdXJhdGlvbl9zOiBudW1iZXI7XG4gIHJlcGVhdGFibGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGFnU3RhdGUge1xuICBub2RlczogRGFnTm9kZVtdO1xufVxuXG4vLyBNaXNzaWxlIHByZXNldCBkZWZpbml0aW9ucyBtYXRjaGluZyBiYWNrZW5kXG5leHBvcnQgY29uc3QgTUlTU0lMRV9QUkVTRVRTOiBNaXNzaWxlUHJlc2V0W10gPSBbXG4gIHtcbiAgICBuYW1lOiBcIlNjb3V0XCIsXG4gICAgZGVzY3JpcHRpb246IFwiU2xvdywgZWZmaWNpZW50LCBsb25nLXJhbmdlLiBIaWdoIGhlYXQgY2FwYWNpdHkuXCIsXG4gICAgc3BlZWQ6IDgwLFxuICAgIGFncm9SYWRpdXM6IDE1MDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA2MCxcbiAgICAgIHdhcm5BdDogNDIsXG4gICAgICBvdmVyaGVhdEF0OiA2MCxcbiAgICAgIG1hcmtlclNwZWVkOiA3MCxcbiAgICAgIGtVcDogMjAsXG4gICAgICBrRG93bjogMTUsXG4gICAgICBleHA6IDEuNSxcbiAgICB9LFxuICB9LFxuICB7XG4gICAgbmFtZTogXCJIdW50ZXJcIixcbiAgICBkZXNjcmlwdGlvbjogXCJCYWxhbmNlZCBzcGVlZCBhbmQgZGV0ZWN0aW9uLiBTdGFuZGFyZCBoZWF0LlwiLFxuICAgIHNwZWVkOiAxNTAsXG4gICAgYWdyb1JhZGl1czogODAwLFxuICAgIGhlYXRQYXJhbXM6IHtcbiAgICAgIG1heDogNTAsXG4gICAgICB3YXJuQXQ6IDM1LFxuICAgICAgb3ZlcmhlYXRBdDogNTAsXG4gICAgICBtYXJrZXJTcGVlZDogMTIwLFxuICAgICAga1VwOiAyOCxcbiAgICAgIGtEb3duOiAxMixcbiAgICAgIGV4cDogMS41LFxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBcIlNuaXBlclwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkZhc3QsIG5hcnJvdyBkZXRlY3Rpb24uIExvdyBoZWF0IGNhcGFjaXR5LlwiLFxuICAgIHNwZWVkOiAyMjAsXG4gICAgYWdyb1JhZGl1czogMzAwLFxuICAgIGhlYXRQYXJhbXM6IHtcbiAgICAgIG1heDogNDAsXG4gICAgICB3YXJuQXQ6IDI4LFxuICAgICAgb3ZlcmhlYXRBdDogNDAsXG4gICAgICBtYXJrZXJTcGVlZDogMTgwLFxuICAgICAga1VwOiAzNSxcbiAgICAgIGtEb3duOiA4LFxuICAgICAgZXhwOiAxLjUsXG4gICAgfSxcbiAgfSxcbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNZXRhIHtcbiAgYz86IG51bWJlcjtcbiAgdz86IG51bWJlcjtcbiAgaD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBCZWFjb25EZWZpbml0aW9uIHtcbiAgY3g6IG51bWJlcjtcbiAgY3k6IG51bWJlcjtcbiAgcmFkaXVzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lvblN0YXRlIHtcbiAgYWN0aXZlOiBib29sZWFuO1xuICBtaXNzaW9uSWQ6IHN0cmluZztcbiAgYmVhY29uSW5kZXg6IG51bWJlcjtcbiAgaG9sZEFjY3VtOiBudW1iZXI7XG4gIGhvbGRSZXF1aXJlZDogbnVtYmVyO1xuICBiZWFjb25zOiBCZWFjb25EZWZpbml0aW9uW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlFdmVudCB7XG4gIGNoYXB0ZXI6IHN0cmluZztcbiAgbm9kZTogc3RyaW5nO1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeVN0YXRlIHtcbiAgYWN0aXZlTm9kZTogc3RyaW5nIHwgbnVsbDtcbiAgZGlhbG9ndWU6IERpYWxvZ3VlQ29udGVudCB8IG51bGw7XG4gIGF2YWlsYWJsZTogc3RyaW5nW107XG4gIGZsYWdzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPjtcbiAgcmVjZW50RXZlbnRzOiBTdG9yeUV2ZW50W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBwU3RhdGUge1xuICBub3c6IG51bWJlcjtcbiAgbm93U3luY2VkQXQ6IG51bWJlcjtcbiAgbWU6IFNoaXBTbmFwc2hvdCB8IG51bGw7XG4gIGdob3N0czogR2hvc3RTbmFwc2hvdFtdO1xuICBtaXNzaWxlczogTWlzc2lsZVNuYXBzaG90W107XG4gIG1pc3NpbGVSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdO1xuICBhY3RpdmVNaXNzaWxlUm91dGVJZDogc3RyaW5nIHwgbnVsbDtcbiAgbmV4dE1pc3NpbGVSZWFkeUF0OiBudW1iZXI7XG4gIG1pc3NpbGVDb25maWc6IE1pc3NpbGVDb25maWc7XG4gIG1pc3NpbGVMaW1pdHM6IE1pc3NpbGVMaW1pdHM7XG4gIHdvcmxkTWV0YTogV29ybGRNZXRhO1xuICBpbnZlbnRvcnk6IEludmVudG9yeSB8IG51bGw7XG4gIGRhZzogRGFnU3RhdGUgfCBudWxsO1xuICBtaXNzaW9uOiBNaXNzaW9uU3RhdGUgfCBudWxsO1xuICBzdG9yeTogU3RvcnlTdGF0ZSB8IG51bGw7XG4gIGNyYWZ0SGVhdENhcGFjaXR5OiBudW1iZXI7IC8vIEhlYXQgY2FwYWNpdHkgc2xpZGVyIHZhbHVlIGZvciBjcmFmdGluZ1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlbGVjdGlvbiB7XG4gIHR5cGU6IFwid2F5cG9pbnRcIiB8IFwibGVnXCI7XG4gIGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVNlbGVjdGlvbiB7XG4gIHR5cGU6IFwid2F5cG9pbnRcIiB8IFwibGVnXCI7XG4gIGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIEFjdGl2ZVRvb2wgPVxuICB8IFwic2hpcC1zZXRcIlxuICB8IFwic2hpcC1zZWxlY3RcIlxuICB8IFwibWlzc2lsZS1zZXRcIlxuICB8IFwibWlzc2lsZS1zZWxlY3RcIlxuICB8IG51bGw7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVUlTdGF0ZSB7XG4gIGlucHV0Q29udGV4dDogU2hpcENvbnRleHQ7XG4gIHNoaXBUb29sOiBTaGlwVG9vbDtcbiAgbWlzc2lsZVRvb2w6IE1pc3NpbGVUb29sO1xuICBhY3RpdmVUb29sOiBBY3RpdmVUb29sO1xuICBzaG93U2hpcFJvdXRlOiBib29sZWFuO1xuICBoZWxwVmlzaWJsZTogYm9vbGVhbjtcbiAgem9vbTogbnVtYmVyO1xuICBwYW5YOiBudW1iZXI7XG4gIHBhblk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxVSVN0YXRlKCk6IFVJU3RhdGUge1xuICByZXR1cm4ge1xuICAgIGlucHV0Q29udGV4dDogXCJzaGlwXCIsXG4gICAgc2hpcFRvb2w6IFwic2V0XCIsXG4gICAgbWlzc2lsZVRvb2w6IG51bGwsXG4gICAgYWN0aXZlVG9vbDogXCJzaGlwLXNldFwiLFxuICAgIHNob3dTaGlwUm91dGU6IHRydWUsXG4gICAgaGVscFZpc2libGU6IGZhbHNlLFxuICAgIHpvb206IDEuMCxcbiAgICBwYW5YOiAwLFxuICAgIHBhblk6IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsU3RhdGUobGltaXRzOiBNaXNzaWxlTGltaXRzID0ge1xuICBzcGVlZE1pbjogTUlTU0lMRV9NSU5fU1BFRUQsXG4gIHNwZWVkTWF4OiBNSVNTSUxFX01BWF9TUEVFRCxcbiAgYWdyb01pbjogTUlTU0lMRV9NSU5fQUdSTyxcbn0pOiBBcHBTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgbm93OiAwLFxuICAgIG5vd1N5bmNlZEF0OiB0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiXG4gICAgICA/IHBlcmZvcm1hbmNlLm5vdygpXG4gICAgICA6IERhdGUubm93KCksXG4gICAgbWU6IG51bGwsXG4gICAgZ2hvc3RzOiBbXSxcbiAgICBtaXNzaWxlczogW10sXG4gICAgbWlzc2lsZVJvdXRlczogW10sXG4gICAgYWN0aXZlTWlzc2lsZVJvdXRlSWQ6IG51bGwsXG4gICAgbmV4dE1pc3NpbGVSZWFkeUF0OiAwLFxuICAgIG1pc3NpbGVDb25maWc6IHtcbiAgICAgIHNwZWVkOiAxODAsXG4gICAgICBhZ3JvUmFkaXVzOiA4MDAsXG4gICAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKDE4MCwgODAwLCBsaW1pdHMpLFxuICAgICAgaGVhdFBhcmFtczogTUlTU0lMRV9QUkVTRVRTWzFdLmhlYXRQYXJhbXMsIC8vIERlZmF1bHQgdG8gSHVudGVyIHByZXNldFxuICAgIH0sXG4gICAgbWlzc2lsZUxpbWl0czogbGltaXRzLFxuICAgIHdvcmxkTWV0YToge30sXG4gICAgaW52ZW50b3J5OiBudWxsLFxuICAgIGRhZzogbnVsbCxcbiAgICBtaXNzaW9uOiBudWxsLFxuICAgIHN0b3J5OiBudWxsLFxuICAgIGNyYWZ0SGVhdENhcGFjaXR5OiA4MCwgLy8gRGVmYXVsdCB0byBiYXNpYyBtaXNzaWxlIGhlYXQgY2FwYWNpdHlcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pc3NpbGVMaWZldGltZUZvcihzcGVlZDogbnVtYmVyLCBhZ3JvUmFkaXVzOiBudW1iZXIsIGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogbnVtYmVyIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBzcGFuID0gbWF4U3BlZWQgLSBtaW5TcGVlZDtcbiAgY29uc3Qgc3BlZWROb3JtID0gc3BhbiA+IDAgPyBjbGFtcCgoc3BlZWQgLSBtaW5TcGVlZCkgLyBzcGFuLCAwLCAxKSA6IDA7XG4gIGNvbnN0IGFkanVzdGVkQWdybyA9IE1hdGgubWF4KDAsIGFncm9SYWRpdXMgLSBtaW5BZ3JvKTtcbiAgY29uc3QgYWdyb05vcm0gPSBjbGFtcChhZGp1c3RlZEFncm8gLyBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUkVGLCAwLCAxKTtcbiAgY29uc3QgcmVkdWN0aW9uID0gc3BlZWROb3JtICogTUlTU0lMRV9MSUZFVElNRV9TUEVFRF9QRU5BTFRZICsgYWdyb05vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUEVOQUxUWTtcbiAgY29uc3QgYmFzZSA9IE1JU1NJTEVfTUFYX0xJRkVUSU1FO1xuICByZXR1cm4gY2xhbXAoYmFzZSAtIHJlZHVjdGlvbiwgTUlTU0lMRV9NSU5fTElGRVRJTUUsIE1JU1NJTEVfTUFYX0xJRkVUSU1FKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplTWlzc2lsZUNvbmZpZyhcbiAgY2ZnOiBQYXJ0aWFsPFBpY2s8TWlzc2lsZUNvbmZpZywgXCJzcGVlZFwiIHwgXCJhZ3JvUmFkaXVzXCIgfCBcImhlYXRQYXJhbXNcIj4+LFxuICBmYWxsYmFjazogTWlzc2lsZUNvbmZpZyxcbiAgbGltaXRzOiBNaXNzaWxlTGltaXRzLFxuKTogTWlzc2lsZUNvbmZpZyB7XG4gIGNvbnN0IG1pblNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4gOiBNSVNTSUxFX01JTl9TUEVFRDtcbiAgY29uc3QgbWF4U3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCA6IE1JU1NJTEVfTUFYX1NQRUVEO1xuICBjb25zdCBtaW5BZ3JvID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluIDogTUlTU0lMRV9NSU5fQUdSTztcbiAgY29uc3QgYmFzZSA9IGZhbGxiYWNrID8/IHtcbiAgICBzcGVlZDogbWluU3BlZWQsXG4gICAgYWdyb1JhZGl1czogbWluQWdybyxcbiAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKG1pblNwZWVkLCBtaW5BZ3JvLCBsaW1pdHMpLFxuICB9O1xuICBjb25zdCBtZXJnZWRTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgPyAoY2ZnLnNwZWVkID8/IGJhc2Uuc3BlZWQpIDogYmFzZS5zcGVlZDtcbiAgY29uc3QgbWVyZ2VkQWdybyA9IE51bWJlci5pc0Zpbml0ZShjZmcuYWdyb1JhZGl1cyA/PyBiYXNlLmFncm9SYWRpdXMpID8gKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgOiBiYXNlLmFncm9SYWRpdXM7XG4gIGNvbnN0IHNwZWVkID0gY2xhbXAobWVyZ2VkU3BlZWQsIG1pblNwZWVkLCBtYXhTcGVlZCk7XG4gIGNvbnN0IGFncm9SYWRpdXMgPSBNYXRoLm1heChtaW5BZ3JvLCBtZXJnZWRBZ3JvKTtcbiAgY29uc3QgaGVhdFBhcmFtcyA9IGNmZy5oZWF0UGFyYW1zID8geyAuLi5jZmcuaGVhdFBhcmFtcyB9IDogYmFzZS5oZWF0UGFyYW1zID8geyAuLi5iYXNlLmhlYXRQYXJhbXMgfSA6IHVuZGVmaW5lZDtcbiAgcmV0dXJuIHtcbiAgICBzcGVlZCxcbiAgICBhZ3JvUmFkaXVzLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3Ioc3BlZWQsIGFncm9SYWRpdXMsIGxpbWl0cyksXG4gICAgaGVhdFBhcmFtcyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vbm90b25pY05vdygpOiBudW1iZXIge1xuICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgfVxuICByZXR1cm4gRGF0ZS5ub3coKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lV2F5cG9pbnRMaXN0KGxpc3Q6IFdheXBvaW50W10gfCB1bmRlZmluZWQgfCBudWxsKTogV2F5cG9pbnRbXSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShsaXN0KSkgcmV0dXJuIFtdO1xuICByZXR1cm4gbGlzdC5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSk7XG59XG5cbi8vIFByb2plY3QgaGVhdCBhbG9uZyBhIG1pc3NpbGUgcm91dGVcbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVJvdXRlUHJvamVjdGlvbiB7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbiAgaGVhdEF0V2F5cG9pbnRzOiBudW1iZXJbXTtcbiAgd2lsbE92ZXJoZWF0OiBib29sZWFuO1xuICBvdmVyaGVhdEF0PzogbnVtYmVyOyAvLyBJbmRleCB3aGVyZSBvdmVyaGVhdCBvY2N1cnNcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RNaXNzaWxlSGVhdChcbiAgcm91dGU6IFdheXBvaW50W10sXG4gIGRlZmF1bHRTcGVlZDogbnVtYmVyLFxuICBoZWF0UGFyYW1zOiBIZWF0UGFyYW1zXG4pOiBNaXNzaWxlUm91dGVQcm9qZWN0aW9uIHtcbiAgY29uc3QgcHJvamVjdGlvbjogTWlzc2lsZVJvdXRlUHJvamVjdGlvbiA9IHtcbiAgICB3YXlwb2ludHM6IHJvdXRlLFxuICAgIGhlYXRBdFdheXBvaW50czogW10sXG4gICAgd2lsbE92ZXJoZWF0OiBmYWxzZSxcbiAgfTtcblxuICBpZiAocm91dGUubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHByb2plY3Rpb247XG4gIH1cblxuICBsZXQgaGVhdCA9IDA7IC8vIE1pc3NpbGVzIHN0YXJ0IGF0IHplcm8gaGVhdFxuICBsZXQgcG9zID0geyB4OiByb3V0ZVswXS54LCB5OiByb3V0ZVswXS55IH07XG4gIGxldCBjdXJyZW50U3BlZWQgPSByb3V0ZVswXS5zcGVlZCA+IDAgPyByb3V0ZVswXS5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcblxuICBwcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuXG4gIGZvciAobGV0IGkgPSAxOyBpIDwgcm91dGUubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB0YXJnZXRQb3MgPSByb3V0ZVtpXTtcbiAgICBjb25zdCB0YXJnZXRTcGVlZCA9IHRhcmdldFBvcy5zcGVlZCA+IDAgPyB0YXJnZXRQb3Muc3BlZWQgOiBkZWZhdWx0U3BlZWQ7XG5cbiAgICAvLyBDYWxjdWxhdGUgZGlzdGFuY2UgYW5kIHRpbWVcbiAgICBjb25zdCBkeCA9IHRhcmdldFBvcy54IC0gcG9zLng7XG4gICAgY29uc3QgZHkgPSB0YXJnZXRQb3MueSAtIHBvcy55O1xuICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcblxuICAgIGlmIChkaXN0YW5jZSA8IDAuMDAxKSB7XG4gICAgICBwcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gQXZlcmFnZSBzcGVlZCBkdXJpbmcgc2VnbWVudFxuICAgIGNvbnN0IGF2Z1NwZWVkID0gKGN1cnJlbnRTcGVlZCArIHRhcmdldFNwZWVkKSAqIDAuNTtcbiAgICBjb25zdCBzZWdtZW50VGltZSA9IGRpc3RhbmNlIC8gTWF0aC5tYXgoYXZnU3BlZWQsIDEpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGhlYXQgcmF0ZSAobWF0Y2ggc2VydmVyIGZvcm11bGEpXG4gICAgY29uc3QgVm4gPSBNYXRoLm1heChoZWF0UGFyYW1zLm1hcmtlclNwZWVkLCAwLjAwMDAwMSk7XG4gICAgY29uc3QgZGV2ID0gYXZnU3BlZWQgLSBoZWF0UGFyYW1zLm1hcmtlclNwZWVkO1xuICAgIGNvbnN0IHAgPSBoZWF0UGFyYW1zLmV4cDtcblxuICAgIGxldCBoZG90OiBudW1iZXI7XG4gICAgaWYgKGRldiA+PSAwKSB7XG4gICAgICAvLyBIZWF0aW5nXG4gICAgICBoZG90ID0gaGVhdFBhcmFtcy5rVXAgKiBNYXRoLnBvdyhkZXYgLyBWbiwgcCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENvb2xpbmdcbiAgICAgIGhkb3QgPSAtaGVhdFBhcmFtcy5rRG93biAqIE1hdGgucG93KE1hdGguYWJzKGRldikgLyBWbiwgcCk7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIGhlYXRcbiAgICBoZWF0ICs9IGhkb3QgKiBzZWdtZW50VGltZTtcbiAgICBoZWF0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaGVhdCwgaGVhdFBhcmFtcy5tYXgpKTtcblxuICAgIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG4gICAgcG9zID0geyB4OiB0YXJnZXRQb3MueCwgeTogdGFyZ2V0UG9zLnkgfTtcbiAgICBjdXJyZW50U3BlZWQgPSB0YXJnZXRTcGVlZDtcblxuICAgIC8vIENoZWNrIGZvciBvdmVyaGVhdFxuICAgIGlmIChoZWF0ID49IGhlYXRQYXJhbXMub3ZlcmhlYXRBdCAmJiAhcHJvamVjdGlvbi53aWxsT3ZlcmhlYXQpIHtcbiAgICAgIHByb2plY3Rpb24ud2lsbE92ZXJoZWF0ID0gdHJ1ZTtcbiAgICAgIHByb2plY3Rpb24ub3ZlcmhlYXRBdCA9IGk7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIHBvc2l0aW9uIGFuZCBzcGVlZFxuICAgIHBvcyA9IHRhcmdldFBvcztcbiAgICBjdXJyZW50U3BlZWQgPSB0YXJnZXRTcGVlZDtcbiAgfVxuXG4gIHJldHVybiBwcm9qZWN0aW9uO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUxpbWl0cyhzdGF0ZTogQXBwU3RhdGUsIGxpbWl0czogUGFydGlhbDxNaXNzaWxlTGltaXRzPik6IHZvaWQge1xuICBzdGF0ZS5taXNzaWxlTGltaXRzID0ge1xuICAgIHNwZWVkTWluOiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWluLFxuICAgIHNwZWVkTWF4OiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWF4LFxuICAgIGFncm9NaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLmFncm9NaW4sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgdHlwZSBFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHtcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIG1vbm90b25pY05vdyxcbiAgc2FuaXRpemVNaXNzaWxlQ29uZmlnLFxuICB1cGRhdGVNaXNzaWxlTGltaXRzLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHR5cGUgeyBEaWFsb2d1ZUNvbnRlbnQgfSBmcm9tIFwiLi9zdG9yeS90eXBlc1wiO1xuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHNwZWVkPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVJvdXRlIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZT86IHN0cmluZztcbiAgd2F5cG9pbnRzPzogU2VydmVyTWlzc2lsZVdheXBvaW50W107XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJIZWF0VmlldyB7XG4gIHY6IG51bWJlcjsgIC8vIGN1cnJlbnQgaGVhdCB2YWx1ZVxuICBtOiBudW1iZXI7ICAvLyBtYXhcbiAgdzogbnVtYmVyOyAgLy8gd2FybkF0XG4gIG86IG51bWJlcjsgIC8vIG92ZXJoZWF0QXRcbiAgbXM6IG51bWJlcjsgLy8gbWFya2VyU3BlZWRcbiAgc3U6IG51bWJlcjsgLy8gc3RhbGxVbnRpbCAoc2VydmVyIHRpbWUgc2Vjb25kcylcbiAga3U6IG51bWJlcjsgLy8ga1VwXG4gIGtkOiBudW1iZXI7IC8vIGtEb3duXG4gIGV4OiBudW1iZXI7IC8vIGV4cFxufVxuXG5pbnRlcmZhY2UgU2VydmVyU2hpcFN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIGhwPzogbnVtYmVyO1xuICBraWxscz86IG51bWJlcjtcbiAgd2F5cG9pbnRzPzogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgc3BlZWQ/OiBudW1iZXIgfT47XG4gIGN1cnJlbnRfd2F5cG9pbnRfaW5kZXg/OiBudW1iZXI7XG4gIGhlYXQ/OiBTZXJ2ZXJIZWF0Vmlldztcbn1cblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVTdGF0ZSB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlclN0YXRlTWVzc2FnZSB7XG4gIHR5cGU6IFwic3RhdGVcIjtcbiAgbm93OiBudW1iZXI7XG4gIG5leHRfbWlzc2lsZV9yZWFkeT86IG51bWJlcjtcbiAgbWU/OiBTZXJ2ZXJTaGlwU3RhdGUgfCBudWxsO1xuICBnaG9zdHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB2eDogbnVtYmVyOyB2eTogbnVtYmVyIH0+O1xuICBtaXNzaWxlcz86IFNlcnZlck1pc3NpbGVTdGF0ZVtdO1xuICBtaXNzaWxlX3JvdXRlcz86IFNlcnZlck1pc3NpbGVSb3V0ZVtdO1xuICBtaXNzaWxlX2NvbmZpZz86IHtcbiAgICBzcGVlZD86IG51bWJlcjtcbiAgICBzcGVlZF9taW4/OiBudW1iZXI7XG4gICAgc3BlZWRfbWF4PzogbnVtYmVyO1xuICAgIGFncm9fcmFkaXVzPzogbnVtYmVyO1xuICAgIGFncm9fbWluPzogbnVtYmVyO1xuICAgIGxpZmV0aW1lPzogbnVtYmVyO1xuICAgIGhlYXRfY29uZmlnPzoge1xuICAgICAgbWF4PzogbnVtYmVyO1xuICAgICAgd2Fybl9hdD86IG51bWJlcjtcbiAgICAgIG92ZXJoZWF0X2F0PzogbnVtYmVyO1xuICAgICAgbWFya2VyX3NwZWVkPzogbnVtYmVyO1xuICAgICAga191cD86IG51bWJlcjtcbiAgICAgIGtfZG93bj86IG51bWJlcjtcbiAgICAgIGV4cD86IG51bWJlcjtcbiAgICB9IHwgbnVsbDtcbiAgfSB8IG51bGw7XG4gIGFjdGl2ZV9taXNzaWxlX3JvdXRlPzogc3RyaW5nIHwgbnVsbDtcbiAgbWV0YT86IHtcbiAgICBjPzogbnVtYmVyO1xuICAgIHc/OiBudW1iZXI7XG4gICAgaD86IG51bWJlcjtcbiAgfTtcbiAgaW52ZW50b3J5Pzoge1xuICAgIGl0ZW1zPzogQXJyYXk8e1xuICAgICAgdHlwZTogc3RyaW5nO1xuICAgICAgdmFyaWFudF9pZDogc3RyaW5nO1xuICAgICAgaGVhdF9jYXBhY2l0eTogbnVtYmVyO1xuICAgICAgcXVhbnRpdHk6IG51bWJlcjtcbiAgICB9PjtcbiAgfTtcbiAgZGFnPzoge1xuICAgIG5vZGVzPzogQXJyYXk8e1xuICAgICAgaWQ6IHN0cmluZztcbiAgICAgIGtpbmQ6IHN0cmluZztcbiAgICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgICBzdGF0dXM6IHN0cmluZztcbiAgICAgIHJlbWFpbmluZ19zOiBudW1iZXI7XG4gICAgICBkdXJhdGlvbl9zOiBudW1iZXI7XG4gICAgICByZXBlYXRhYmxlOiBib29sZWFuO1xuICAgIH0+O1xuICB9O1xuICBzdG9yeT86IHtcbiAgICBhY3RpdmVfbm9kZT86IHN0cmluZztcbiAgICBkaWFsb2d1ZT86IHtcbiAgICAgIHNwZWFrZXI6IHN0cmluZztcbiAgICAgIHRleHQ6IHN0cmluZztcbiAgICAgIGludGVudDogc3RyaW5nO1xuICAgICAgY29udGludWVfbGFiZWw/OiBzdHJpbmc7XG4gICAgICBjaG9pY2VzPzogQXJyYXk8e1xuICAgICAgICBpZDogc3RyaW5nO1xuICAgICAgICB0ZXh0OiBzdHJpbmc7XG4gICAgICB9PjtcbiAgICAgIHR1dG9yaWFsX3RpcD86IHtcbiAgICAgICAgdGl0bGU6IHN0cmluZztcbiAgICAgICAgdGV4dDogc3RyaW5nO1xuICAgICAgfTtcbiAgICB9O1xuICAgIGF2YWlsYWJsZT86IHN0cmluZ1tdO1xuICAgIGZsYWdzPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG4gICAgcmVjZW50X2V2ZW50cz86IEFycmF5PHtcbiAgICAgIGNoYXB0ZXI6IHN0cmluZztcbiAgICAgIG5vZGU6IHN0cmluZztcbiAgICAgIHRpbWVzdGFtcDogbnVtYmVyO1xuICAgIH0+O1xuICB9O1xufVxuXG5pbnRlcmZhY2UgQ29ubmVjdE9wdGlvbnMge1xuICByb29tOiBzdHJpbmc7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb25TdGF0ZVVwZGF0ZWQ/OiAoKSA9PiB2b2lkO1xuICBvbk9wZW4/OiAoc29ja2V0OiBXZWJTb2NrZXQpID0+IHZvaWQ7XG4gIG1hcFc/OiBudW1iZXI7XG4gIG1hcEg/OiBudW1iZXI7XG4gIG1vZGU/OiBzdHJpbmc7XG4gIG1pc3Npb25JZD86IHN0cmluZztcbn1cblxubGV0IHdzOiBXZWJTb2NrZXQgfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIHNlbmRNZXNzYWdlKHBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcbiAgaWYgKCF3cyB8fCB3cy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikgcmV0dXJuO1xuICBjb25zdCBkYXRhID0gdHlwZW9mIHBheWxvYWQgPT09IFwic3RyaW5nXCIgPyBwYXlsb2FkIDogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCk7XG4gIHdzLnNlbmQoZGF0YSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0V2ViU29ja2V0KHtcbiAgcm9vbSxcbiAgc3RhdGUsXG4gIGJ1cyxcbiAgb25TdGF0ZVVwZGF0ZWQsXG4gIG9uT3BlbixcbiAgbWFwVyxcbiAgbWFwSCxcbiAgbW9kZSxcbiAgbWlzc2lvbklkLFxufTogQ29ubmVjdE9wdGlvbnMpOiB2b2lkIHtcbiAgY29uc3QgcHJvdG9jb2wgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgPyBcIndzczovL1wiIDogXCJ3czovL1wiO1xuICBsZXQgd3NVcmwgPSBgJHtwcm90b2NvbH0ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fS93cz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb20pfWA7XG4gIGlmIChtYXBXICYmIG1hcFcgPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBXPSR7bWFwV31gO1xuICB9XG4gIGlmIChtYXBIICYmIG1hcEggPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBIPSR7bWFwSH1gO1xuICB9XG4gIGlmIChtb2RlKSB7XG4gICAgd3NVcmwgKz0gYCZtb2RlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1vZGUpfWA7XG4gIH1cbiAgaWYgKG1pc3Npb25JZCkge1xuICAgIHdzVXJsICs9IGAmbWlzc2lvbj0ke2VuY29kZVVSSUNvbXBvbmVudChtaXNzaW9uSWQpfWA7XG4gIH1cbiAgd3MgPSBuZXcgV2ViU29ja2V0KHdzVXJsKTtcbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm9wZW5cIiwgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFwiW3dzXSBvcGVuXCIpO1xuICAgIGNvbnN0IHNvY2tldCA9IHdzO1xuICAgIGlmIChzb2NrZXQgJiYgb25PcGVuKSB7XG4gICAgICBvbk9wZW4oc29ja2V0KTtcbiAgICB9XG4gIH0pO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwiY2xvc2VcIiwgKCkgPT4gY29uc29sZS5sb2coXCJbd3NdIGNsb3NlXCIpKTtcblxuICBsZXQgcHJldlJvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+KCk7XG4gIGxldCBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgcHJldk1pc3NpbGVDb3VudCA9IDA7XG5cbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgZGF0YSA9IHNhZmVQYXJzZShldmVudC5kYXRhKTtcbiAgICBpZiAoIWRhdGEgfHwgZGF0YS50eXBlICE9PSBcInN0YXRlXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaGFuZGxlU3RhdGVNZXNzYWdlKHN0YXRlLCBkYXRhLCBidXMsIHByZXZSb3V0ZXMsIHByZXZBY3RpdmVSb3V0ZSwgcHJldk1pc3NpbGVDb3VudCk7XG4gICAgcHJldlJvdXRlcyA9IG5ldyBNYXAoc3RhdGUubWlzc2lsZVJvdXRlcy5tYXAoKHJvdXRlKSA9PiBbcm91dGUuaWQsIGNsb25lUm91dGUocm91dGUpXSkpO1xuICAgIHByZXZBY3RpdmVSb3V0ZSA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIHByZXZNaXNzaWxlQ291bnQgPSBzdGF0ZS5taXNzaWxlcy5sZW5ndGg7XG4gICAgYnVzLmVtaXQoXCJzdGF0ZTp1cGRhdGVkXCIpO1xuICAgIG9uU3RhdGVVcGRhdGVkPy4oKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVN0YXRlTWVzc2FnZShcbiAgc3RhdGU6IEFwcFN0YXRlLFxuICBtc2c6IFNlcnZlclN0YXRlTWVzc2FnZSxcbiAgYnVzOiBFdmVudEJ1cyxcbiAgcHJldlJvdXRlczogTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPixcbiAgcHJldkFjdGl2ZVJvdXRlOiBzdHJpbmcgfCBudWxsLFxuICBwcmV2TWlzc2lsZUNvdW50OiBudW1iZXIsXG4pOiB2b2lkIHtcbiAgc3RhdGUubm93ID0gbXNnLm5vdztcbiAgc3RhdGUubm93U3luY2VkQXQgPSBtb25vdG9uaWNOb3coKTtcbiAgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0ID0gTnVtYmVyLmlzRmluaXRlKG1zZy5uZXh0X21pc3NpbGVfcmVhZHkpID8gbXNnLm5leHRfbWlzc2lsZV9yZWFkeSEgOiAwO1xuICBzdGF0ZS5tZSA9IG1zZy5tZSA/IHtcbiAgICB4OiBtc2cubWUueCxcbiAgICB5OiBtc2cubWUueSxcbiAgICB2eDogbXNnLm1lLnZ4LFxuICAgIHZ5OiBtc2cubWUudnksXG4gICAgaHA6IG1zZy5tZS5ocCxcbiAgICBraWxsczogbXNnLm1lLmtpbGxzID8/IDAsXG4gICAgd2F5cG9pbnRzOiBBcnJheS5pc0FycmF5KG1zZy5tZS53YXlwb2ludHMpXG4gICAgICA/IG1zZy5tZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHsgeDogd3AueCwgeTogd3AueSwgc3BlZWQ6IE51bWJlci5pc0Zpbml0ZSh3cC5zcGVlZCkgPyB3cC5zcGVlZCEgOiAxODAgfSkpXG4gICAgICA6IFtdLFxuICAgIGN1cnJlbnRXYXlwb2ludEluZGV4OiBtc2cubWUuY3VycmVudF93YXlwb2ludF9pbmRleCA/PyAwLFxuICAgIGhlYXQ6IG1zZy5tZS5oZWF0ID8gY29udmVydEhlYXRWaWV3KG1zZy5tZS5oZWF0LCBzdGF0ZS5ub3dTeW5jZWRBdCwgc3RhdGUubm93KSA6IHVuZGVmaW5lZCxcbiAgfSA6IG51bGw7XG4gIHN0YXRlLmdob3N0cyA9IEFycmF5LmlzQXJyYXkobXNnLmdob3N0cykgPyBtc2cuZ2hvc3RzLnNsaWNlKCkgOiBbXTtcbiAgc3RhdGUubWlzc2lsZXMgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlcykgPyBtc2cubWlzc2lsZXMuc2xpY2UoKSA6IFtdO1xuXG4gIGNvbnN0IHJvdXRlc0Zyb21TZXJ2ZXIgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlX3JvdXRlcykgPyBtc2cubWlzc2lsZV9yb3V0ZXMgOiBbXTtcbiAgY29uc3QgbmV3Um91dGVzOiBNaXNzaWxlUm91dGVbXSA9IHJvdXRlc0Zyb21TZXJ2ZXIubWFwKChyb3V0ZSkgPT4gKHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSB8fCByb3V0ZS5pZCB8fCBcIlJvdXRlXCIsXG4gICAgd2F5cG9pbnRzOiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cylcbiAgICAgID8gcm91dGUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7XG4gICAgICAgICAgeDogd3AueCxcbiAgICAgICAgICB5OiB3cC55LFxuICAgICAgICAgIHNwZWVkOiBOdW1iZXIuaXNGaW5pdGUod3Auc3BlZWQpID8gd3Auc3BlZWQhIDogc3RhdGUubWlzc2lsZUNvbmZpZy5zcGVlZCxcbiAgICAgICAgfSkpXG4gICAgICA6IFtdLFxuICB9KSk7XG5cbiAgZGlmZlJvdXRlcyhwcmV2Um91dGVzLCBuZXdSb3V0ZXMsIGJ1cyk7XG4gIHN0YXRlLm1pc3NpbGVSb3V0ZXMgPSBuZXdSb3V0ZXM7XG5cbiAgY29uc3QgbmV4dEFjdGl2ZSA9IHR5cGVvZiBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGUgPT09IFwic3RyaW5nXCIgJiYgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlLmxlbmd0aCA+IDBcbiAgICA/IG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZVxuICAgIDogbmV3Um91dGVzLmxlbmd0aCA+IDBcbiAgICAgID8gbmV3Um91dGVzWzBdLmlkXG4gICAgICA6IG51bGw7XG4gIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dEFjdGl2ZTtcbiAgaWYgKG5leHRBY3RpdmUgIT09IHByZXZBY3RpdmVSb3V0ZSkge1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIiwgeyByb3V0ZUlkOiBuZXh0QWN0aXZlID8/IG51bGwgfSk7XG4gIH1cblxuICBpZiAobXNnLm1pc3NpbGVfY29uZmlnKSB7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluKSB8fCBOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCkgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5hZ3JvX21pbikpIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGUsIHtcbiAgICAgICAgc3BlZWRNaW46IG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9taW4sXG4gICAgICAgIHNwZWVkTWF4OiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWF4LFxuICAgICAgICBhZ3JvTWluOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4sXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgcHJldkhlYXQgPSBzdGF0ZS5taXNzaWxlQ29uZmlnLmhlYXRQYXJhbXM7XG4gICAgbGV0IGhlYXRQYXJhbXM6IHsgbWF4OiBudW1iZXI7IHdhcm5BdDogbnVtYmVyOyBvdmVyaGVhdEF0OiBudW1iZXI7IG1hcmtlclNwZWVkOiBudW1iZXI7IGtVcDogbnVtYmVyOyBrRG93bjogbnVtYmVyOyBleHA6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuICAgIGNvbnN0IGhlYXRDb25maWcgPSBtc2cubWlzc2lsZV9jb25maWcuaGVhdF9jb25maWc7XG4gICAgaWYgKGhlYXRDb25maWcpIHtcbiAgICAgIGhlYXRQYXJhbXMgPSB7XG4gICAgICAgIG1heDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcubWF4KSA/IGhlYXRDb25maWcubWF4ISA6IHByZXZIZWF0Py5tYXggPz8gMCxcbiAgICAgICAgd2FybkF0OiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy53YXJuX2F0KSA/IGhlYXRDb25maWcud2Fybl9hdCEgOiBwcmV2SGVhdD8ud2FybkF0ID8/IDAsXG4gICAgICAgIG92ZXJoZWF0QXQ6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLm92ZXJoZWF0X2F0KSA/IGhlYXRDb25maWcub3ZlcmhlYXRfYXQhIDogcHJldkhlYXQ/Lm92ZXJoZWF0QXQgPz8gMCxcbiAgICAgICAgbWFya2VyU3BlZWQ6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLm1hcmtlcl9zcGVlZCkgPyBoZWF0Q29uZmlnLm1hcmtlcl9zcGVlZCEgOiBwcmV2SGVhdD8ubWFya2VyU3BlZWQgPz8gMCxcbiAgICAgICAga1VwOiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5rX3VwKSA/IGhlYXRDb25maWcua191cCEgOiBwcmV2SGVhdD8ua1VwID8/IDAsXG4gICAgICAgIGtEb3duOiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5rX2Rvd24pID8gaGVhdENvbmZpZy5rX2Rvd24hIDogcHJldkhlYXQ/LmtEb3duID8/IDAsXG4gICAgICAgIGV4cDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcuZXhwKSA/IGhlYXRDb25maWcuZXhwISA6IHByZXZIZWF0Py5leHAgPz8gMSxcbiAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyh7XG4gICAgICBzcGVlZDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkLFxuICAgICAgYWdyb1JhZGl1czogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fcmFkaXVzLFxuICAgICAgaGVhdFBhcmFtcyxcbiAgICB9LCBzdGF0ZS5taXNzaWxlQ29uZmlnLCBzdGF0ZS5taXNzaWxlTGltaXRzKTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5saWZldGltZSkpIHtcbiAgICAgIHNhbml0aXplZC5saWZldGltZSA9IG1zZy5taXNzaWxlX2NvbmZpZy5saWZldGltZSE7XG4gICAgfVxuICAgIHN0YXRlLm1pc3NpbGVDb25maWcgPSBzYW5pdGl6ZWQ7XG4gIH1cblxuICBjb25zdCBtZXRhID0gbXNnLm1ldGEgPz8ge307XG4gIGNvbnN0IGhhc0MgPSB0eXBlb2YgbWV0YS5jID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmMpO1xuICBjb25zdCBoYXNXID0gdHlwZW9mIG1ldGEudyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS53KTtcbiAgY29uc3QgaGFzSCA9IHR5cGVvZiBtZXRhLmggPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuaCk7XG4gIHN0YXRlLndvcmxkTWV0YSA9IHtcbiAgICBjOiBoYXNDID8gbWV0YS5jISA6IHN0YXRlLndvcmxkTWV0YS5jLFxuICAgIHc6IGhhc1cgPyBtZXRhLnchIDogc3RhdGUud29ybGRNZXRhLncsXG4gICAgaDogaGFzSCA/IG1ldGEuaCEgOiBzdGF0ZS53b3JsZE1ldGEuaCxcbiAgfTtcblxuICBpZiAobXNnLmludmVudG9yeSAmJiBBcnJheS5pc0FycmF5KG1zZy5pbnZlbnRvcnkuaXRlbXMpKSB7XG4gICAgc3RhdGUuaW52ZW50b3J5ID0ge1xuICAgICAgaXRlbXM6IG1zZy5pbnZlbnRvcnkuaXRlbXMubWFwKChpdGVtKSA9PiAoe1xuICAgICAgICB0eXBlOiBpdGVtLnR5cGUsXG4gICAgICAgIHZhcmlhbnRfaWQ6IGl0ZW0udmFyaWFudF9pZCxcbiAgICAgICAgaGVhdF9jYXBhY2l0eTogaXRlbS5oZWF0X2NhcGFjaXR5LFxuICAgICAgICBxdWFudGl0eTogaXRlbS5xdWFudGl0eSxcbiAgICAgIH0pKSxcbiAgICB9O1xuICB9XG5cbiAgaWYgKG1zZy5kYWcgJiYgQXJyYXkuaXNBcnJheShtc2cuZGFnLm5vZGVzKSkge1xuICAgIHN0YXRlLmRhZyA9IHtcbiAgICAgIG5vZGVzOiBtc2cuZGFnLm5vZGVzLm1hcCgobm9kZSkgPT4gKHtcbiAgICAgICAgaWQ6IG5vZGUuaWQsXG4gICAgICAgIGtpbmQ6IG5vZGUua2luZCxcbiAgICAgICAgbGFiZWw6IG5vZGUubGFiZWwsXG4gICAgICAgIHN0YXR1czogbm9kZS5zdGF0dXMsXG4gICAgICAgIHJlbWFpbmluZ19zOiBub2RlLnJlbWFpbmluZ19zLFxuICAgICAgICBkdXJhdGlvbl9zOiBub2RlLmR1cmF0aW9uX3MsXG4gICAgICAgIHJlcGVhdGFibGU6IG5vZGUucmVwZWF0YWJsZSxcbiAgICAgIH0pKSxcbiAgICB9O1xuICB9XG5cbiAgaWYgKG1zZy5zdG9yeSkge1xuXG4gICAgY29uc3QgcHJldkFjdGl2ZU5vZGUgPSBzdGF0ZS5zdG9yeT8uYWN0aXZlTm9kZSA/PyBudWxsO1xuXG4gICAgLy8gQ29udmVydCBzZXJ2ZXIgZGlhbG9ndWUgdG8gRGlhbG9ndWVDb250ZW50IGZvcm1hdFxuICAgIGxldCBkaWFsb2d1ZTogRGlhbG9ndWVDb250ZW50IHwgbnVsbCA9IG51bGw7XG4gICAgaWYgKG1zZy5zdG9yeS5kaWFsb2d1ZSkge1xuICAgICAgY29uc3QgZCA9IG1zZy5zdG9yeS5kaWFsb2d1ZTtcbiAgICAgIGRpYWxvZ3VlID0ge1xuICAgICAgICBzcGVha2VyOiBkLnNwZWFrZXIsXG4gICAgICAgIHRleHQ6IGQudGV4dCxcbiAgICAgICAgaW50ZW50OiBkLmludGVudCBhcyBcImZhY3RvcnlcIiB8IFwidW5pdFwiLFxuICAgICAgICB0eXBpbmdTcGVlZE1zOiAxOCwgLy8gRGVmYXVsdCwgb3IgY291bGQgY29tZSBmcm9tIHNlcnZlclxuICAgICAgICBjb250aW51ZUxhYmVsOiBkLmNvbnRpbnVlX2xhYmVsLFxuICAgICAgICBjaG9pY2VzOiBkLmNob2ljZXM/Lm1hcChjID0+ICh7IGlkOiBjLmlkLCB0ZXh0OiBjLnRleHQgfSkpLFxuICAgICAgICB0dXRvcmlhbFRpcDogZC50dXRvcmlhbF90aXAgPyB7XG4gICAgICAgICAgdGl0bGU6IGQudHV0b3JpYWxfdGlwLnRpdGxlLFxuICAgICAgICAgIHRleHQ6IGQudHV0b3JpYWxfdGlwLnRleHQsXG4gICAgICAgIH0gOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHN0YXRlLnN0b3J5ID0ge1xuICAgICAgYWN0aXZlTm9kZTogbXNnLnN0b3J5LmFjdGl2ZV9ub2RlID8/IG51bGwsXG4gICAgICBkaWFsb2d1ZSwgLy8gU3RvcmUgZGlhbG9ndWVcbiAgICAgIGF2YWlsYWJsZTogQXJyYXkuaXNBcnJheShtc2cuc3RvcnkuYXZhaWxhYmxlKSA/IG1zZy5zdG9yeS5hdmFpbGFibGUgOiBbXSxcbiAgICAgIGZsYWdzOiBtc2cuc3RvcnkuZmxhZ3MgPz8ge30sXG4gICAgICByZWNlbnRFdmVudHM6IEFycmF5LmlzQXJyYXkobXNnLnN0b3J5LnJlY2VudF9ldmVudHMpID8gbXNnLnN0b3J5LnJlY2VudF9ldmVudHMubWFwKChldnQpID0+ICh7XG4gICAgICAgIGNoYXB0ZXI6IGV2dC5jaGFwdGVyLFxuICAgICAgICBub2RlOiBldnQubm9kZSxcbiAgICAgICAgdGltZXN0YW1wOiBldnQudGltZXN0YW1wLFxuICAgICAgfSkpIDogW10sXG4gICAgfTtcbiAgICAvLyBFbWl0IGV2ZW50IHdoZW4gYWN0aXZlIHN0b3J5IG5vZGUgY2hhbmdlc1xuICAgIGlmIChzdGF0ZS5zdG9yeS5hY3RpdmVOb2RlICE9PSBwcmV2QWN0aXZlTm9kZSAmJiBzdGF0ZS5zdG9yeS5hY3RpdmVOb2RlKSB7XG4gICAgICBidXMuZW1pdChcInN0b3J5Om5vZGVBY3RpdmF0ZWRcIiwge1xuICAgICAgICBub2RlSWQ6IHN0YXRlLnN0b3J5LmFjdGl2ZU5vZGUsXG4gICAgICAgIGRpYWxvZ3VlOiBzdGF0ZS5zdG9yeS5kaWFsb2d1ZSA/PyB1bmRlZmluZWQsIC8vIFBhc3MgZGlhbG9ndWVcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChzdGF0ZS5taXNzaWxlcy5sZW5ndGggPiBwcmV2TWlzc2lsZUNvdW50KSB7XG4gICAgY29uc3QgYWN0aXZlUm91dGVJZCA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIGlmIChhY3RpdmVSb3V0ZUlkKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoZWRcIiwgeyByb3V0ZUlkOiBhY3RpdmVSb3V0ZUlkIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoZWRcIiwgeyByb3V0ZUlkOiBcIlwiIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNvb2xkb3duUmVtYWluaW5nID0gTWF0aC5tYXgoMCwgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlKSk7XG4gIGJ1cy5lbWl0KFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIiwgeyBzZWNvbmRzUmVtYWluaW5nOiBjb29sZG93blJlbWFpbmluZyB9KTtcbn1cblxuZnVuY3Rpb24gZGlmZlJvdXRlcyhwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LCBuZXh0Um91dGVzOiBNaXNzaWxlUm91dGVbXSwgYnVzOiBFdmVudEJ1cyk6IHZvaWQge1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3Qgcm91dGUgb2YgbmV4dFJvdXRlcykge1xuICAgIHNlZW4uYWRkKHJvdXRlLmlkKTtcbiAgICBjb25zdCBwcmV2ID0gcHJldlJvdXRlcy5nZXQocm91dGUuaWQpO1xuICAgIGlmICghcHJldikge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlQWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAocm91dGUubmFtZSAhPT0gcHJldi5uYW1lKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVSZW5hbWVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIG5hbWU6IHJvdXRlLm5hbWUgfSk7XG4gICAgfVxuICAgIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleDogcm91dGUud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfSBlbHNlIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoIDwgcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiBwcmV2LndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xuICAgIH1cbiAgICBpZiAocHJldi53YXlwb2ludHMubGVuZ3RoID4gMCAmJiByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IFtyb3V0ZUlkXSBvZiBwcmV2Um91dGVzKSB7XG4gICAgaWYgKCFzZWVuLmhhcyhyb3V0ZUlkKSkge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlRGVsZXRlZFwiLCB7IHJvdXRlSWQgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNsb25lUm91dGUocm91dGU6IE1pc3NpbGVSb3V0ZSk6IE1pc3NpbGVSb3V0ZSB7XG4gIHJldHVybiB7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUsXG4gICAgd2F5cG9pbnRzOiByb3V0ZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHsgLi4ud3AgfSkpLFxuICB9O1xufVxuXG5mdW5jdGlvbiBzYWZlUGFyc2UodmFsdWU6IHVua25vd24pOiBTZXJ2ZXJTdGF0ZU1lc3NhZ2UgfCBudWxsIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UodmFsdWUpIGFzIFNlcnZlclN0YXRlTWVzc2FnZTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS53YXJuKFwiW3dzXSBmYWlsZWQgdG8gcGFyc2UgbWVzc2FnZVwiLCBlcnIpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGU6IEFwcFN0YXRlKTogbnVtYmVyIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93KSkge1xuICAgIHJldHVybiAwO1xuICB9XG4gIGNvbnN0IHN5bmNlZEF0ID0gTnVtYmVyLmlzRmluaXRlKHN0YXRlLm5vd1N5bmNlZEF0KSA/IHN0YXRlLm5vd1N5bmNlZEF0IDogbnVsbDtcbiAgaWYgKCFzeW5jZWRBdCkge1xuICAgIHJldHVybiBzdGF0ZS5ub3c7XG4gIH1cbiAgY29uc3QgZWxhcHNlZE1zID0gbW9ub3RvbmljTm93KCkgLSBzeW5jZWRBdDtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZWxhcHNlZE1zKSB8fCBlbGFwc2VkTXMgPCAwKSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICByZXR1cm4gc3RhdGUubm93ICsgZWxhcHNlZE1zIC8gMTAwMDtcbn1cblxuZnVuY3Rpb24gY29udmVydEhlYXRWaWV3KHNlcnZlckhlYXQ6IFNlcnZlckhlYXRWaWV3LCBub3dTeW5jZWRBdE1zOiBudW1iZXIsIHNlcnZlck5vd1NlYzogbnVtYmVyKTogaW1wb3J0KFwiLi9zdGF0ZVwiKS5IZWF0VmlldyB7XG4gIC8vIENvbnZlcnQgc2VydmVyIHRpbWUgKHN0YWxsVW50aWwgaW4gc2Vjb25kcykgdG8gY2xpZW50IHRpbWUgKG1pbGxpc2Vjb25kcylcbiAgLy8gc3RhbGxVbnRpbCBpcyBhYnNvbHV0ZSBzZXJ2ZXIgdGltZSwgc28gd2UgbmVlZCB0byBjb252ZXJ0IGl0IHRvIGNsaWVudCB0aW1lXG4gIGNvbnN0IHNlcnZlclN0YWxsVW50aWxTZWMgPSBzZXJ2ZXJIZWF0LnN1O1xuICBjb25zdCBvZmZzZXRGcm9tTm93U2VjID0gc2VydmVyU3RhbGxVbnRpbFNlYyAtIHNlcnZlck5vd1NlYztcbiAgY29uc3Qgc3RhbGxVbnRpbE1zID0gbm93U3luY2VkQXRNcyArIChvZmZzZXRGcm9tTm93U2VjICogMTAwMCk7XG5cbiAgY29uc3QgaGVhdFZpZXcgPSB7XG4gICAgdmFsdWU6IHNlcnZlckhlYXQudixcbiAgICBtYXg6IHNlcnZlckhlYXQubSxcbiAgICB3YXJuQXQ6IHNlcnZlckhlYXQudyxcbiAgICBvdmVyaGVhdEF0OiBzZXJ2ZXJIZWF0Lm8sXG4gICAgbWFya2VyU3BlZWQ6IHNlcnZlckhlYXQubXMsXG4gICAgc3RhbGxVbnRpbE1zOiBzdGFsbFVudGlsTXMsXG4gICAga1VwOiBzZXJ2ZXJIZWF0Lmt1LFxuICAgIGtEb3duOiBzZXJ2ZXJIZWF0LmtkLFxuICAgIGV4cDogc2VydmVySGVhdC5leCxcbiAgfTtcbiAgcmV0dXJuIGhlYXRWaWV3O1xufVxuIiwgImV4cG9ydCBjb25zdCBNSU5fWk9PTSA9IDEuMDtcbmV4cG9ydCBjb25zdCBNQVhfWk9PTSA9IDMuMDtcblxuZXhwb3J0IGNvbnN0IEhFTFBfVEVYVCA9IFtcbiAgXCJQcmltYXJ5IE1vZGVzXCIsXG4gIFwiICAxIFx1MjAxMyBUb2dnbGUgc2hpcCBuYXZpZ2F0aW9uIG1vZGVcIixcbiAgXCIgIDIgXHUyMDEzIFRvZ2dsZSBtaXNzaWxlIGNvb3JkaW5hdGlvbiBtb2RlXCIsXG4gIFwiXCIsXG4gIFwiU2hpcCBOYXZpZ2F0aW9uXCIsXG4gIFwiICBUIFx1MjAxMyBTd2l0Y2ggYmV0d2VlbiBzZXQvc2VsZWN0XCIsXG4gIFwiICBDIFx1MjAxMyBDbGVhciBhbGwgd2F5cG9pbnRzXCIsXG4gIFwiICBIIFx1MjAxMyBIb2xkIChjbGVhciB3YXlwb2ludHMgJiBzdG9wKVwiLFxuICBcIiAgUiBcdTIwMTMgVG9nZ2xlIHNob3cgcm91dGVcIixcbiAgXCIgIFsgLyBdIFx1MjAxMyBBZGp1c3Qgd2F5cG9pbnQgc3BlZWRcIixcbiAgXCIgIFNoaWZ0K1sgLyBdIFx1MjAxMyBDb2Fyc2Ugc3BlZWQgYWRqdXN0XCIsXG4gIFwiICBUYWIgLyBTaGlmdCtUYWIgXHUyMDEzIEN5Y2xlIHdheXBvaW50c1wiLFxuICBcIiAgRGVsZXRlIFx1MjAxMyBEZWxldGUgZnJvbSBzZWxlY3RlZCB3YXlwb2ludFwiLFxuICBcIlwiLFxuICBcIk1pc3NpbGUgQ29vcmRpbmF0aW9uXCIsXG4gIFwiICBOIFx1MjAxMyBBZGQgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgXCIgIEwgXHUyMDEzIExhdW5jaCBtaXNzaWxlc1wiLFxuICBcIiAgRSBcdTIwMTMgU3dpdGNoIGJldHdlZW4gc2V0L3NlbGVjdFwiLFxuICBcIiAgLCAvIC4gXHUyMDEzIEFkanVzdCBhZ3JvIHJhZGl1c1wiLFxuICBcIiAgOyAvICcgXHUyMDEzIEFkanVzdCBtaXNzaWxlIHNwZWVkXCIsXG4gIFwiICBTaGlmdCtzbGlkZXIga2V5cyBcdTIwMTMgQ29hcnNlIGFkanVzdFwiLFxuICBcIiAgRGVsZXRlIFx1MjAxMyBEZWxldGUgc2VsZWN0ZWQgbWlzc2lsZSB3YXlwb2ludFwiLFxuICBcIlwiLFxuICBcIk1hcCBDb250cm9sc1wiLFxuICBcIiAgKy8tIFx1MjAxMyBab29tIGluL291dFwiLFxuICBcIiAgQ3RybCswIFx1MjAxMyBSZXNldCB6b29tXCIsXG4gIFwiICBNb3VzZSB3aGVlbCBcdTIwMTMgWm9vbSBhdCBjdXJzb3JcIixcbiAgXCIgIFBpbmNoIFx1MjAxMyBab29tIG9uIHRvdWNoIGRldmljZXNcIixcbiAgXCJcIixcbiAgXCJHZW5lcmFsXCIsXG4gIFwiICA/IFx1MjAxMyBUb2dnbGUgdGhpcyBvdmVybGF5XCIsXG4gIFwiICBFc2MgXHUyMDEzIENhbmNlbCBzZWxlY3Rpb24gb3IgY2xvc2Ugb3ZlcmxheVwiLFxuXS5qb2luKFwiXFxuXCIpO1xuIiwgImltcG9ydCB0eXBlIHsgQXBwU3RhdGUsIFVJU3RhdGUgfSBmcm9tIFwiLi4vc3RhdGVcIjtcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBNQVhfWk9PTSwgTUlOX1pPT00gfSBmcm9tIFwiLi9jb25zdGFudHNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDYW1lcmFEZXBlbmRlbmNpZXMge1xuICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbDtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xufVxuXG5pbnRlcmZhY2UgV29ybGRTaXplIHtcbiAgdzogbnVtYmVyO1xuICBoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FtZXJhIHtcbiAgc2V0Wm9vbShuZXdab29tOiBudW1iZXIsIGNlbnRlclg/OiBudW1iZXIsIGNlbnRlclk/OiBudW1iZXIpOiB2b2lkO1xuICBnZXRDYW1lcmFQb3NpdGlvbigpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG4gIHdvcmxkVG9DYW52YXMocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuICBjYW52YXNUb1dvcmxkKHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgdXBkYXRlV29ybGRGcm9tTWV0YShtZXRhOiBQYXJ0aWFsPFdvcmxkU2l6ZSB8IHVuZGVmaW5lZD4pOiB2b2lkO1xuICBnZXRXb3JsZFNpemUoKTogV29ybGRTaXplO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ2FtZXJhKHsgY2FudmFzLCBzdGF0ZSwgdWlTdGF0ZSB9OiBDYW1lcmFEZXBlbmRlbmNpZXMpOiBDYW1lcmEge1xuICBjb25zdCB3b3JsZDogV29ybGRTaXplID0geyB3OiA4MDAwLCBoOiA0NTAwIH07XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZUNhbnZhcygpOiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGwge1xuICAgIHJldHVybiBjYW52YXMgPz8gbnVsbDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFpvb20obmV3Wm9vbTogbnVtYmVyLCBjZW50ZXJYPzogbnVtYmVyLCBjZW50ZXJZPzogbnVtYmVyKTogdm9pZCB7XG4gICAgLy8gY2VudGVyIHBhcmFtZXRlcnMgcmVzZXJ2ZWQgZm9yIHBvdGVudGlhbCBzbW9vdGggem9vbWluZyBsb2dpY1xuICAgIHZvaWQgY2VudGVyWDtcbiAgICB2b2lkIGNlbnRlclk7XG4gICAgdWlTdGF0ZS56b29tID0gY2xhbXAobmV3Wm9vbSwgTUlOX1pPT00sIE1BWF9aT09NKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldENhbWVyYVBvc2l0aW9uKCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gICAgY29uc3QgY3YgPSByZXNvbHZlQ2FudmFzKCk7XG4gICAgaWYgKCFjdikgcmV0dXJuIHsgeDogd29ybGQudyAvIDIsIHk6IHdvcmxkLmggLyAyIH07XG5cbiAgICBjb25zdCB6b29tID0gdWlTdGF0ZS56b29tO1xuXG4gICAgbGV0IGNhbWVyYVggPSBzdGF0ZS5tZSA/IHN0YXRlLm1lLnggOiB3b3JsZC53IC8gMjtcbiAgICBsZXQgY2FtZXJhWSA9IHN0YXRlLm1lID8gc3RhdGUubWUueSA6IHdvcmxkLmggLyAyO1xuXG4gICAgY29uc3Qgc2NhbGVYID0gY3Yud2lkdGggLyB3b3JsZC53O1xuICAgIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gICAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gICAgY29uc3Qgdmlld3BvcnRXaWR0aCA9IGN2LndpZHRoIC8gc2NhbGU7XG4gICAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjdi5oZWlnaHQgLyBzY2FsZTtcblxuICAgIGNvbnN0IG1pbkNhbWVyYVggPSB2aWV3cG9ydFdpZHRoIC8gMjtcbiAgICBjb25zdCBtYXhDYW1lcmFYID0gd29ybGQudyAtIHZpZXdwb3J0V2lkdGggLyAyO1xuICAgIGNvbnN0IG1pbkNhbWVyYVkgPSB2aWV3cG9ydEhlaWdodCAvIDI7XG4gICAgY29uc3QgbWF4Q2FtZXJhWSA9IHdvcmxkLmggLSB2aWV3cG9ydEhlaWdodCAvIDI7XG5cbiAgICBpZiAodmlld3BvcnRXaWR0aCA8IHdvcmxkLncpIHtcbiAgICAgIGNhbWVyYVggPSBjbGFtcChjYW1lcmFYLCBtaW5DYW1lcmFYLCBtYXhDYW1lcmFYKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2FtZXJhWCA9IHdvcmxkLncgLyAyO1xuICAgIH1cblxuICAgIGlmICh2aWV3cG9ydEhlaWdodCA8IHdvcmxkLmgpIHtcbiAgICAgIGNhbWVyYVkgPSBjbGFtcChjYW1lcmFZLCBtaW5DYW1lcmFZLCBtYXhDYW1lcmFZKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2FtZXJhWSA9IHdvcmxkLmggLyAyO1xuICAgIH1cblxuICAgIHJldHVybiB7IHg6IGNhbWVyYVgsIHk6IGNhbWVyYVkgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHdvcmxkVG9DYW52YXMocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgICBjb25zdCBjdiA9IHJlc29sdmVDYW52YXMoKTtcbiAgICBpZiAoIWN2KSByZXR1cm4geyB4OiBwLngsIHk6IHAueSB9O1xuXG4gICAgY29uc3Qgem9vbSA9IHVpU3RhdGUuem9vbTtcbiAgICBjb25zdCBjYW1lcmEgPSBnZXRDYW1lcmFQb3NpdGlvbigpO1xuXG4gICAgY29uc3Qgd29ybGRYID0gcC54IC0gY2FtZXJhLng7XG4gICAgY29uc3Qgd29ybGRZID0gcC55IC0gY2FtZXJhLnk7XG5cbiAgICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gICAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgICBjb25zdCBzY2FsZSA9IE1hdGgubWluKHNjYWxlWCwgc2NhbGVZKSAqIHpvb207XG5cbiAgICByZXR1cm4ge1xuICAgICAgeDogd29ybGRYICogc2NhbGUgKyBjdi53aWR0aCAvIDIsXG4gICAgICB5OiB3b3JsZFkgKiBzY2FsZSArIGN2LmhlaWdodCAvIDIsXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgICBjb25zdCBjdiA9IHJlc29sdmVDYW52YXMoKTtcbiAgICBpZiAoIWN2KSByZXR1cm4geyB4OiBwLngsIHk6IHAueSB9O1xuXG4gICAgY29uc3Qgem9vbSA9IHVpU3RhdGUuem9vbTtcbiAgICBjb25zdCBjYW1lcmEgPSBnZXRDYW1lcmFQb3NpdGlvbigpO1xuXG4gICAgY29uc3QgY2FudmFzWCA9IHAueCAtIGN2LndpZHRoIC8gMjtcbiAgICBjb25zdCBjYW52YXNZID0gcC55IC0gY3YuaGVpZ2h0IC8gMjtcblxuICAgIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgICBjb25zdCBzY2FsZVkgPSBjdi5oZWlnaHQgLyB3b3JsZC5oO1xuICAgIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAgIHJldHVybiB7XG4gICAgICB4OiBjYW52YXNYIC8gc2NhbGUgKyBjYW1lcmEueCxcbiAgICAgIHk6IGNhbnZhc1kgLyBzY2FsZSArIGNhbWVyYS55LFxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVXb3JsZEZyb21NZXRhKG1ldGE6IFBhcnRpYWw8V29ybGRTaXplIHwgdW5kZWZpbmVkPik6IHZvaWQge1xuICAgIGlmICghbWV0YSkgcmV0dXJuO1xuICAgIGlmICh0eXBlb2YgbWV0YS53ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLncpKSB7XG4gICAgICB3b3JsZC53ID0gbWV0YS53O1xuICAgIH1cbiAgICBpZiAodHlwZW9mIG1ldGEuaCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5oKSkge1xuICAgICAgd29ybGQuaCA9IG1ldGEuaDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBnZXRXb3JsZFNpemUoKTogV29ybGRTaXplIHtcbiAgICByZXR1cm4geyAuLi53b3JsZCB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzZXRab29tLFxuICAgIGdldENhbWVyYVBvc2l0aW9uLFxuICAgIHdvcmxkVG9DYW52YXMsXG4gICAgY2FudmFzVG9Xb3JsZCxcbiAgICB1cGRhdGVXb3JsZEZyb21NZXRhLFxuICAgIGdldFdvcmxkU2l6ZSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHR5cGUgeyBBcHBTdGF0ZSwgVUlTdGF0ZSB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuaW1wb3J0IHR5cGUgeyBDYW1lcmEgfSBmcm9tIFwiLi9jYW1lcmFcIjtcbmltcG9ydCB0eXBlIHsgTG9naWMsIFBvaW50ZXJQb2ludCB9IGZyb20gXCIuL2xvZ2ljXCI7XG5pbXBvcnQgdHlwZSB7IFVJQ29udHJvbGxlciB9IGZyb20gXCIuL3VpXCI7XG5cbmludGVyZmFjZSBJbnB1dERlcGVuZGVuY2llcyB7XG4gIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XG4gIHVpOiBVSUNvbnRyb2xsZXI7XG4gIGxvZ2ljOiBMb2dpYztcbiAgY2FtZXJhOiBDYW1lcmE7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgc2VuZE1lc3NhZ2UocGF5bG9hZDogdW5rbm93bik6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5wdXRDb250cm9sbGVyIHtcbiAgYmluZElucHV0KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbnB1dCh7XG4gIGNhbnZhcyxcbiAgdWksXG4gIGxvZ2ljLFxuICBjYW1lcmEsXG4gIHN0YXRlLFxuICB1aVN0YXRlLFxuICBidXMsXG4gIHNlbmRNZXNzYWdlLFxufTogSW5wdXREZXBlbmRlbmNpZXMpOiBJbnB1dENvbnRyb2xsZXIge1xuICBsZXQgbGFzdFRvdWNoRGlzdGFuY2U6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgcGVuZGluZ1RvdWNoVGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcbiAgbGV0IGlzUGluY2hpbmcgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBnZXRQb2ludGVyQ2FudmFzUG9pbnQoZXZlbnQ6IFBvaW50ZXJFdmVudCk6IFBvaW50ZXJQb2ludCB7XG4gICAgY29uc3QgcmVjdCA9IGNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBzY2FsZVggPSByZWN0LndpZHRoICE9PSAwID8gY2FudmFzLndpZHRoIC8gcmVjdC53aWR0aCA6IDE7XG4gICAgY29uc3Qgc2NhbGVZID0gcmVjdC5oZWlnaHQgIT09IDAgPyBjYW52YXMuaGVpZ2h0IC8gcmVjdC5oZWlnaHQgOiAxO1xuICAgIHJldHVybiB7XG4gICAgICB4OiAoZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdCkgKiBzY2FsZVgsXG4gICAgICB5OiAoZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wKSAqIHNjYWxlWSxcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlUG9pbnRlclBsYWNlbWVudChjYW52YXNQb2ludDogUG9pbnRlclBvaW50LCB3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkIHtcbiAgICBjb25zdCBjb250ZXh0ID0gdWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcbiAgICBpZiAoY29udGV4dCA9PT0gXCJtaXNzaWxlXCIpIHtcbiAgICAgIGxvZ2ljLmhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgICAgIHVpLnJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvZ2ljLmhhbmRsZVNoaXBQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgICAgIHVpLnVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gb25DYW52YXNQb2ludGVyRG93bihldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG4gICAgY29uc3QgY2FudmFzUG9pbnQgPSBnZXRQb2ludGVyQ2FudmFzUG9pbnQoZXZlbnQpO1xuICAgIGNvbnN0IHdvcmxkUG9pbnQgPSBjYW1lcmEuY2FudmFzVG9Xb3JsZChjYW52YXNQb2ludCk7XG4gICAgY29uc3QgY29udGV4dCA9IHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIiA/IFwibWlzc2lsZVwiIDogXCJzaGlwXCI7XG5cbiAgICBpZiAoY29udGV4dCA9PT0gXCJzaGlwXCIgJiYgdWlTdGF0ZS5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIiAmJiBzdGF0ZS5tZT8ud2F5cG9pbnRzKSB7XG4gICAgICBjb25zdCB3cEluZGV4ID0gbG9naWMuZmluZFdheXBvaW50QXRQb3NpdGlvbihjYW52YXNQb2ludCk7XG4gICAgICBpZiAod3BJbmRleCAhPT0gbnVsbCkge1xuICAgICAgICBsb2dpYy5iZWdpblNoaXBEcmFnKHdwSW5kZXgsIGNhbnZhc1BvaW50KTtcbiAgICAgICAgY2FudmFzLnNldFBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgdWlTdGF0ZS5taXNzaWxlVG9vbCA9PT0gXCJzZWxlY3RcIikge1xuICAgICAgY29uc3QgaGl0ID0gbG9naWMuaGl0VGVzdE1pc3NpbGVSb3V0ZXMoY2FudmFzUG9pbnQpO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgICBsb2dpYy5zZXRNaXNzaWxlU2VsZWN0aW9uKGhpdC5zZWxlY3Rpb24sIGhpdC5yb3V0ZS5pZCk7XG4gICAgICAgIHVpLnJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgICAgIGlmIChoaXQuc2VsZWN0aW9uLnR5cGUgPT09IFwid2F5cG9pbnRcIikge1xuICAgICAgICAgIGxvZ2ljLmJlZ2luTWlzc2lsZURyYWcoaGl0LnNlbGVjdGlvbi5pbmRleCwgY2FudmFzUG9pbnQpO1xuICAgICAgICAgIGNhbnZhcy5zZXRQb2ludGVyQ2FwdHVyZShldmVudC5wb2ludGVySWQpO1xuICAgICAgICB9XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGxvZ2ljLnNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICB1aS5yZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5wb2ludGVyVHlwZSA9PT0gXCJ0b3VjaFwiKSB7XG4gICAgICBpZiAocGVuZGluZ1RvdWNoVGltZW91dCAhPT0gbnVsbCkge1xuICAgICAgICBjbGVhclRpbWVvdXQocGVuZGluZ1RvdWNoVGltZW91dCk7XG4gICAgICB9XG4gICAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGlmIChpc1BpbmNoaW5nKSByZXR1cm47XG4gICAgICAgIGhhbmRsZVBvaW50ZXJQbGFjZW1lbnQoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgICAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gbnVsbDtcbiAgICAgIH0sIDE1MCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZVBvaW50ZXJQbGFjZW1lbnQoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgIH1cblxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gIH1cblxuICBmdW5jdGlvbiBvbkNhbnZhc1BvaW50ZXJNb3ZlKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBjb25zdCBkcmFnZ2luZ1NoaXAgPSBsb2dpYy5nZXREcmFnZ2VkV2F5cG9pbnQoKSAhPT0gbnVsbDtcbiAgICBjb25zdCBkcmFnZ2luZ01pc3NpbGUgPSBsb2dpYy5nZXREcmFnZ2VkTWlzc2lsZVdheXBvaW50KCkgIT09IG51bGw7XG4gICAgaWYgKCFkcmFnZ2luZ1NoaXAgJiYgIWRyYWdnaW5nTWlzc2lsZSkgcmV0dXJuO1xuXG4gICAgY29uc3QgY2FudmFzUG9pbnQgPSBnZXRQb2ludGVyQ2FudmFzUG9pbnQoZXZlbnQpO1xuICAgIGNvbnN0IHdvcmxkUG9pbnQgPSBjYW1lcmEuY2FudmFzVG9Xb3JsZChjYW52YXNQb2ludCk7XG5cbiAgICBpZiAoZHJhZ2dpbmdTaGlwKSB7XG4gICAgICBsb2dpYy51cGRhdGVTaGlwRHJhZyh3b3JsZFBvaW50KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGRyYWdnaW5nTWlzc2lsZSkge1xuICAgICAgbG9naWMudXBkYXRlTWlzc2lsZURyYWcod29ybGRQb2ludCk7XG4gICAgICB1aS5yZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbkNhbnZhc1BvaW50ZXJVcChldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG4gICAgbG9naWMuZW5kRHJhZygpO1xuICAgIGlmIChjYW52YXMuaGFzUG9pbnRlckNhcHR1cmUoZXZlbnQucG9pbnRlcklkKSkge1xuICAgICAgY2FudmFzLnJlbGVhc2VQb2ludGVyQ2FwdHVyZShldmVudC5wb2ludGVySWQpO1xuICAgIH1cbiAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gbnVsbDtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzV2hlZWwoZXZlbnQ6IFdoZWVsRXZlbnQpOiB2b2lkIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHJlY3QgPSBjYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3QgY2VudGVyWCA9IGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQ7XG4gICAgY29uc3QgY2VudGVyWSA9IGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcDtcbiAgICBjb25zdCBzY2FsZVggPSByZWN0LndpZHRoICE9PSAwID8gY2FudmFzLndpZHRoIC8gcmVjdC53aWR0aCA6IDE7XG4gICAgY29uc3Qgc2NhbGVZID0gcmVjdC5oZWlnaHQgIT09IDAgPyBjYW52YXMuaGVpZ2h0IC8gcmVjdC5oZWlnaHQgOiAxO1xuICAgIGNvbnN0IGNhbnZhc0NlbnRlclggPSBjZW50ZXJYICogc2NhbGVYO1xuICAgIGNvbnN0IGNhbnZhc0NlbnRlclkgPSBjZW50ZXJZICogc2NhbGVZO1xuICAgIGNvbnN0IGRlbHRhID0gZXZlbnQuZGVsdGFZO1xuICAgIGNvbnN0IHpvb21GYWN0b3IgPSBkZWx0YSA+IDAgPyAwLjkgOiAxLjE7XG4gICAgY29uc3QgbmV3Wm9vbSA9IHVpU3RhdGUuem9vbSAqIHpvb21GYWN0b3I7XG4gICAgY2FtZXJhLnNldFpvb20obmV3Wm9vbSwgY2FudmFzQ2VudGVyWCwgY2FudmFzQ2VudGVyWSk7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRUb3VjaERpc3RhbmNlKHRvdWNoZXM6IFRvdWNoTGlzdCk6IG51bWJlciB8IG51bGwge1xuICAgIGlmICh0b3VjaGVzLmxlbmd0aCA8IDIpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGR4ID0gdG91Y2hlc1swXS5jbGllbnRYIC0gdG91Y2hlc1sxXS5jbGllbnRYO1xuICAgIGNvbnN0IGR5ID0gdG91Y2hlc1swXS5jbGllbnRZIC0gdG91Y2hlc1sxXS5jbGllbnRZO1xuICAgIHJldHVybiBNYXRoLmh5cG90KGR4LCBkeSk7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRUb3VjaENlbnRlcih0b3VjaGVzOiBUb3VjaExpc3QpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCBudWxsIHtcbiAgICBpZiAodG91Y2hlcy5sZW5ndGggPCAyKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4ge1xuICAgICAgeDogKHRvdWNoZXNbMF0uY2xpZW50WCArIHRvdWNoZXNbMV0uY2xpZW50WCkgLyAyLFxuICAgICAgeTogKHRvdWNoZXNbMF0uY2xpZW50WSArIHRvdWNoZXNbMV0uY2xpZW50WSkgLyAyLFxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBvbkNhbnZhc1RvdWNoU3RhcnQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQudG91Y2hlcy5sZW5ndGggPT09IDIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBpc1BpbmNoaW5nID0gdHJ1ZTtcbiAgICAgIGxhc3RUb3VjaERpc3RhbmNlID0gZ2V0VG91Y2hEaXN0YW5jZShldmVudC50b3VjaGVzKTtcbiAgICAgIGlmIChwZW5kaW5nVG91Y2hUaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgICAgcGVuZGluZ1RvdWNoVGltZW91dCA9IG51bGw7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gb25DYW52YXNUb3VjaE1vdmUoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQudG91Y2hlcy5sZW5ndGggIT09IDIpIHtcbiAgICAgIGxhc3RUb3VjaERpc3RhbmNlID0gbnVsbDtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBjdXJyZW50RGlzdGFuY2UgPSBnZXRUb3VjaERpc3RhbmNlKGV2ZW50LnRvdWNoZXMpO1xuICAgIGlmIChjdXJyZW50RGlzdGFuY2UgPT09IG51bGwgfHwgbGFzdFRvdWNoRGlzdGFuY2UgPT09IG51bGwpIHJldHVybjtcbiAgICBjb25zdCByZWN0ID0gY2FudmFzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IGNlbnRlciA9IGdldFRvdWNoQ2VudGVyKGV2ZW50LnRvdWNoZXMpO1xuICAgIGlmICghY2VudGVyKSByZXR1cm47XG4gICAgY29uc3Qgc2NhbGVYID0gcmVjdC53aWR0aCAhPT0gMCA/IGNhbnZhcy53aWR0aCAvIHJlY3Qud2lkdGggOiAxO1xuICAgIGNvbnN0IHNjYWxlWSA9IHJlY3QuaGVpZ2h0ICE9PSAwID8gY2FudmFzLmhlaWdodCAvIHJlY3QuaGVpZ2h0IDogMTtcbiAgICBjb25zdCBjYW52YXNDZW50ZXJYID0gKGNlbnRlci54IC0gcmVjdC5sZWZ0KSAqIHNjYWxlWDtcbiAgICBjb25zdCBjYW52YXNDZW50ZXJZID0gKGNlbnRlci55IC0gcmVjdC50b3ApICogc2NhbGVZO1xuICAgIGNvbnN0IHpvb21GYWN0b3IgPSBjdXJyZW50RGlzdGFuY2UgLyBsYXN0VG91Y2hEaXN0YW5jZTtcbiAgICBjb25zdCBuZXdab29tID0gdWlTdGF0ZS56b29tICogem9vbUZhY3RvcjtcbiAgICBjYW1lcmEuc2V0Wm9vbShuZXdab29tLCBjYW52YXNDZW50ZXJYLCBjYW52YXNDZW50ZXJZKTtcbiAgICBsYXN0VG91Y2hEaXN0YW5jZSA9IGN1cnJlbnREaXN0YW5jZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzVG91Y2hFbmQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQudG91Y2hlcy5sZW5ndGggPCAyKSB7XG4gICAgICBsYXN0VG91Y2hEaXN0YW5jZSA9IG51bGw7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaXNQaW5jaGluZyA9IGZhbHNlO1xuICAgICAgfSwgMTAwKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVBZGRNaXNzaWxlUm91dGUoKTogdm9pZCB7XG4gICAgdWkuc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiYWRkX21pc3NpbGVfcm91dGVcIiB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uV2luZG93S2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICAgIGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGNvbnN0IGlzRWRpdGFibGUgPVxuICAgICAgISF0YXJnZXQgJiZcbiAgICAgICh0YXJnZXQudGFnTmFtZSA9PT0gXCJJTlBVVFwiIHx8XG4gICAgICAgIHRhcmdldC50YWdOYW1lID09PSBcIlRFWFRBUkVBXCIgfHxcbiAgICAgICAgdGFyZ2V0LmlzQ29udGVudEVkaXRhYmxlKTtcblxuICAgIGlmICh1aVN0YXRlLmhlbHBWaXNpYmxlICYmIGV2ZW50LmtleSAhPT0gXCJFc2NhcGVcIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoaXNFZGl0YWJsZSkge1xuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFc2NhcGVcIikge1xuICAgICAgICB0YXJnZXQuYmx1cigpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHN3aXRjaCAoZXZlbnQuY29kZSkge1xuICAgICAgY2FzZSBcIkRpZ2l0MVwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiRGlnaXQyXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJLZXlUXCI6XG4gICAgICAgIGlmICh1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZXRcIikge1xuICAgICAgICAgIHVpLnNldEFjdGl2ZVRvb2woXCJzaGlwLXNlbGVjdFwiKTtcbiAgICAgICAgfSBlbHNlIGlmICh1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZWxlY3RcIikge1xuICAgICAgICAgIHVpLnNldEFjdGl2ZVRvb2woXCJzaGlwLXNldFwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1aS5zZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gICAgICAgIH1cbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIktleUNcIjpcbiAgICAgIGNhc2UgXCJLZXlIXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIGxvZ2ljLmNsZWFyU2hpcFJvdXRlKCk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJCcmFja2V0TGVmdFwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgICB1aS5hZGp1c3RTaGlwU3BlZWQoLTEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIkJyYWNrZXRSaWdodFwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgICB1aS5hZGp1c3RTaGlwU3BlZWQoMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiVGFiXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIGxvZ2ljLmN5Y2xlU2hpcFNlbGVjdGlvbihldmVudC5zaGlmdEtleSA/IC0xIDogMSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJLZXlOXCI6XG4gICAgICAgIGhhbmRsZUFkZE1pc3NpbGVSb3V0ZSgpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiS2V5TFwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgICBsb2dpYy5sYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIktleUVcIjpcbiAgICAgICAgaWYgKHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2VsZWN0XCIpO1xuICAgICAgICB9IGVsc2UgaWYgKHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2V0XCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVpLnNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICAgICAgfVxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiQ29tbWFcIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgICAgdWkuYWRqdXN0TWlzc2lsZUFncm8oLTEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIlBlcmlvZFwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgICB1aS5hZGp1c3RNaXNzaWxlQWdybygxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJTZW1pY29sb25cIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgICAgdWkuYWRqdXN0TWlzc2lsZVNwZWVkKC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJRdW90ZVwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgICB1aS5hZGp1c3RNaXNzaWxlU3BlZWQoMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiRGVsZXRlXCI6XG4gICAgICBjYXNlIFwiQmFja3NwYWNlXCI6XG4gICAgICAgIGlmICh1aVN0YXRlLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgbG9naWMuZ2V0TWlzc2lsZVNlbGVjdGlvbigpKSB7XG4gICAgICAgICAgbG9naWMuZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTtcbiAgICAgICAgfSBlbHNlIGlmIChsb2dpYy5nZXRTZWxlY3Rpb24oKSkge1xuICAgICAgICAgIGxvZ2ljLmRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk7XG4gICAgICAgIH1cbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIkVzY2FwZVwiOiB7XG4gICAgICAgIGlmICh1aVN0YXRlLmhlbHBWaXNpYmxlKSB7XG4gICAgICAgICAgdWkuc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgICAgICB9IGVsc2UgaWYgKGxvZ2ljLmdldE1pc3NpbGVTZWxlY3Rpb24oKSkge1xuICAgICAgICAgIGxvZ2ljLnNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICAgIH0gZWxzZSBpZiAobG9naWMuZ2V0U2VsZWN0aW9uKCkpIHtcbiAgICAgICAgICBsb2dpYy5zZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgICAgIH0gZWxzZSBpZiAodWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiKSB7XG4gICAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgICAgfVxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjYXNlIFwiRXF1YWxcIjpcbiAgICAgIGNhc2UgXCJOdW1wYWRBZGRcIjoge1xuICAgICAgICBjb25zdCBjZW50ZXJYID0gY2FudmFzLndpZHRoIC8gMjtcbiAgICAgICAgY29uc3QgY2VudGVyWSA9IGNhbnZhcy5oZWlnaHQgLyAyO1xuICAgICAgICBjYW1lcmEuc2V0Wm9vbSh1aVN0YXRlLnpvb20gKiAxLjIsIGNlbnRlclgsIGNlbnRlclkpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjYXNlIFwiTWludXNcIjpcbiAgICAgIGNhc2UgXCJOdW1wYWRTdWJ0cmFjdFwiOiB7XG4gICAgICAgIGNvbnN0IGNlbnRlclggPSBjYW52YXMud2lkdGggLyAyO1xuICAgICAgICBjb25zdCBjZW50ZXJZID0gY2FudmFzLmhlaWdodCAvIDI7XG4gICAgICAgIGNhbWVyYS5zZXRab29tKHVpU3RhdGUuem9vbSAvIDEuMiwgY2VudGVyWCwgY2VudGVyWSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJEaWdpdDBcIjpcbiAgICAgIGNhc2UgXCJOdW1wYWQwXCI6XG4gICAgICAgIGlmIChldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXkpIHtcbiAgICAgICAgICBjYW1lcmEuc2V0Wm9vbSgxLjApO1xuICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCI/XCIpIHtcbiAgICAgIHVpLnNldEhlbHBWaXNpYmxlKCF1aVN0YXRlLmhlbHBWaXNpYmxlKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYmluZElucHV0KCk6IHZvaWQge1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcmRvd25cIiwgb25DYW52YXNQb2ludGVyRG93bik7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVybW92ZVwiLCBvbkNhbnZhc1BvaW50ZXJNb3ZlKTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJ1cFwiLCBvbkNhbnZhc1BvaW50ZXJVcCk7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyY2FuY2VsXCIsIG9uQ2FudmFzUG9pbnRlclVwKTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcIndoZWVsXCIsIG9uQ2FudmFzV2hlZWwsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaHN0YXJ0XCIsIG9uQ2FudmFzVG91Y2hTdGFydCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCBvbkNhbnZhc1RvdWNoTW92ZSwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIG9uQ2FudmFzVG91Y2hFbmQsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIG9uV2luZG93S2V5RG93biwgeyBjYXB0dXJlOiBmYWxzZSB9KTtcblxuICAgIGJ1cy5vbihcImNvbnRleHQ6Y2hhbmdlZFwiLCAoKSA9PiB7XG4gICAgICBpZiAocGVuZGluZ1RvdWNoVGltZW91dCAhPT0gbnVsbCkge1xuICAgICAgICBjbGVhclRpbWVvdXQocGVuZGluZ1RvdWNoVGltZW91dCk7XG4gICAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBiaW5kSW5wdXQsXG4gIH07XG59XG4iLCAiLy8gU2hhcmVkIHJvdXRlIHBsYW5uaW5nIG1vZHVsZSBmb3Igc2hpcHMgYW5kIG1pc3NpbGVzXG4vLyBQaGFzZSAxOiBTaGFyZWQgTW9kZWwgJiBIZWxwZXJzXG5cbmltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4vc3RhdGVcIjtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVHlwZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGludGVyZmFjZSBSb3V0ZVdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHNwZWVkPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlUG9pbnRzIHtcbiAgd2F5cG9pbnRzOiBSb3V0ZVdheXBvaW50W107XG4gIHdvcmxkUG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXTtcbiAgY2FudmFzUG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQ29uc3RhbnRzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBjb25zdCBXQVlQT0lOVF9ISVRfUkFESVVTID0gMTI7XG5leHBvcnQgY29uc3QgTEVHX0hJVF9ESVNUQU5DRSA9IDEwO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBCdWlsZGVyc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIEJ1aWxkcyByb3V0ZSBwb2ludHMgZnJvbSBhIHN0YXJ0IHBvc2l0aW9uIGFuZCB3YXlwb2ludHMuXG4gKiBJbmNsdWRlcyB3b3JsZCBjb29yZGluYXRlcyAod3JhcHBpbmcpIGFuZCBjYW52YXMgY29vcmRpbmF0ZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFJvdXRlUG9pbnRzKFxuICBzdGFydDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICB3YXlwb2ludHM6IFJvdXRlV2F5cG9pbnRbXSxcbiAgd29ybGQ6IHsgdzogbnVtYmVyOyBoOiBudW1iZXIgfSxcbiAgY2FtZXJhOiAoKSA9PiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gIHpvb206ICgpID0+IG51bWJlcixcbiAgd29ybGRUb0NhbnZhczogKHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSkgPT4geyB4OiBudW1iZXI7IHk6IG51bWJlciB9XG4pOiBSb3V0ZVBvaW50cyB7XG4gIGNvbnN0IHdvcmxkUG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXSA9IFt7IHg6IHN0YXJ0LngsIHk6IHN0YXJ0LnkgfV07XG5cbiAgZm9yIChjb25zdCB3cCBvZiB3YXlwb2ludHMpIHtcbiAgICB3b3JsZFBvaW50cy5wdXNoKHsgeDogd3AueCwgeTogd3AueSB9KTtcbiAgfVxuXG4gIGNvbnN0IGNhbnZhc1BvaW50cyA9IHdvcmxkUG9pbnRzLm1hcCgocG9pbnQpID0+IHdvcmxkVG9DYW52YXMocG9pbnQpKTtcblxuICByZXR1cm4ge1xuICAgIHdheXBvaW50czogd2F5cG9pbnRzLnNsaWNlKCksXG4gICAgd29ybGRQb2ludHMsXG4gICAgY2FudmFzUG9pbnRzLFxuICB9O1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBHZW9tZXRyeSAvIEhpdC10ZXN0XG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZGlzdGFuY2UgZnJvbSBhIHBvaW50IHRvIGEgbGluZSBzZWdtZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcG9pbnRTZWdtZW50RGlzdGFuY2UoXG4gIHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSxcbiAgYTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICBiOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1cbik6IG51bWJlciB7XG4gIGNvbnN0IGFieCA9IGIueCAtIGEueDtcbiAgY29uc3QgYWJ5ID0gYi55IC0gYS55O1xuICBjb25zdCBhcHggPSBwLnggLSBhLng7XG4gIGNvbnN0IGFweSA9IHAueSAtIGEueTtcbiAgY29uc3QgYWJMZW5TcSA9IGFieCAqIGFieCArIGFieSAqIGFieTtcbiAgY29uc3QgdCA9IGFiTGVuU3EgPT09IDAgPyAwIDogY2xhbXAoYXB4ICogYWJ4ICsgYXB5ICogYWJ5LCAwLCBhYkxlblNxKSAvIGFiTGVuU3E7XG4gIGNvbnN0IHByb2p4ID0gYS54ICsgYWJ4ICogdDtcbiAgY29uc3QgcHJvankgPSBhLnkgKyBhYnkgKiB0O1xuICBjb25zdCBkeCA9IHAueCAtIHByb2p4O1xuICBjb25zdCBkeSA9IHAueSAtIHByb2p5O1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG4vKipcbiAqIEhpdC10ZXN0cyBhIHJvdXRlIGFnYWluc3QgYSBjYW52YXMgcG9pbnQuXG4gKiBSZXR1cm5zIHRoZSBoaXQgdHlwZSBhbmQgaW5kZXgsIG9yIG51bGwgaWYgbm8gaGl0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGl0VGVzdFJvdXRlR2VuZXJpYyhcbiAgY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSxcbiAgcm91dGVQb2ludHM6IFJvdXRlUG9pbnRzLFxuICBvcHRzOiB7XG4gICAgd2F5cG9pbnRIaXRSYWRpdXM/OiBudW1iZXI7XG4gICAgbGVnSGl0RGlzdGFuY2U/OiBudW1iZXI7XG4gICAgc2tpcExlZ3M/OiBib29sZWFuO1xuICB9ID0ge31cbik6IHsgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjsgaW5kZXg6IG51bWJlciB9IHwgbnVsbCB7XG4gIGNvbnN0IHdheXBvaW50SGl0UmFkaXVzID0gb3B0cy53YXlwb2ludEhpdFJhZGl1cyA/PyBXQVlQT0lOVF9ISVRfUkFESVVTO1xuICBjb25zdCBsZWdIaXREaXN0YW5jZSA9IG9wdHMubGVnSGl0RGlzdGFuY2UgPz8gTEVHX0hJVF9ESVNUQU5DRTtcbiAgY29uc3Qgc2tpcExlZ3MgPSBvcHRzLnNraXBMZWdzID8/IGZhbHNlO1xuXG4gIGNvbnN0IHsgd2F5cG9pbnRzLCBjYW52YXNQb2ludHMgfSA9IHJvdXRlUG9pbnRzO1xuXG4gIGlmICh3YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBDaGVjayB3YXlwb2ludHMgZmlyc3QgKGhpZ2hlciBwcmlvcml0eSB0aGFuIGxlZ3MpXG4gIC8vIFNraXAgaW5kZXggMCB3aGljaCBpcyB0aGUgc3RhcnQgcG9zaXRpb25cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB3cENhbnZhcyA9IGNhbnZhc1BvaW50c1tpICsgMV07IC8vICsxIGJlY2F1c2UgZmlyc3QgcG9pbnQgaXMgc3RhcnQgcG9zaXRpb25cbiAgICBjb25zdCBkeCA9IGNhbnZhc1BvaW50LnggLSB3cENhbnZhcy54O1xuICAgIGNvbnN0IGR5ID0gY2FudmFzUG9pbnQueSAtIHdwQ2FudmFzLnk7XG4gICAgaWYgKE1hdGguaHlwb3QoZHgsIGR5KSA8PSB3YXlwb2ludEhpdFJhZGl1cykge1xuICAgICAgcmV0dXJuIHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogaSB9O1xuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGxlZ3MgKGxvd2VyIHByaW9yaXR5KVxuICBpZiAoIXNraXBMZWdzKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGRpc3QgPSBwb2ludFNlZ21lbnREaXN0YW5jZShjYW52YXNQb2ludCwgY2FudmFzUG9pbnRzW2ldLCBjYW52YXNQb2ludHNbaSArIDFdKTtcbiAgICAgIGlmIChkaXN0IDw9IGxlZ0hpdERpc3RhbmNlKSB7XG4gICAgICAgIHJldHVybiB7IHR5cGU6IFwibGVnXCIsIGluZGV4OiBpIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIERhc2ggQW5pbWF0aW9uXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogVXBkYXRlcyBkYXNoIG9mZnNldHMgZm9yIHJvdXRlIGxlZ3MgdG8gY3JlYXRlIG1hcmNoaW5nIGFudHMgYW5pbWF0aW9uLlxuICogTXV0YXRlcyB0aGUgcHJvdmlkZWQgc3RvcmUgbWFwLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlRGFzaE9mZnNldHNGb3JSb3V0ZShcbiAgc3RvcmU6IE1hcDxudW1iZXIsIG51bWJlcj4sXG4gIHdheXBvaW50czogQXJyYXk8eyBzcGVlZD86IG51bWJlciB9PixcbiAgd29ybGRQb2ludHM6IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4sXG4gIGNhbnZhc1BvaW50czogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlciB9PixcbiAgZmFsbGJhY2tTcGVlZDogbnVtYmVyLFxuICBkdFNlY29uZHM6IG51bWJlcixcbiAgY3ljbGUgPSA2NFxuKTogdm9pZCB7XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKGR0U2Vjb25kcykgfHwgZHRTZWNvbmRzIDwgMCkge1xuICAgIGR0U2Vjb25kcyA9IDA7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwID0gd2F5cG9pbnRzW2ldO1xuICAgIGNvbnN0IHNwZWVkID0gdHlwZW9mIHdwLnNwZWVkID09PSBcIm51bWJlclwiICYmIHdwLnNwZWVkID4gMCA/IHdwLnNwZWVkIDogZmFsbGJhY2tTcGVlZDtcbiAgICBjb25zdCBhV29ybGQgPSB3b3JsZFBvaW50c1tpXTtcbiAgICBjb25zdCBiV29ybGQgPSB3b3JsZFBvaW50c1tpICsgMV07XG4gICAgY29uc3Qgd29ybGREaXN0ID0gTWF0aC5oeXBvdChiV29ybGQueCAtIGFXb3JsZC54LCBiV29ybGQueSAtIGFXb3JsZC55KTtcbiAgICBjb25zdCBhQ2FudmFzID0gY2FudmFzUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJDYW52YXMgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGNhbnZhc0Rpc3QgPSBNYXRoLmh5cG90KGJDYW52YXMueCAtIGFDYW52YXMueCwgYkNhbnZhcy55IC0gYUNhbnZhcy55KTtcblxuICAgIGlmIChcbiAgICAgICFOdW1iZXIuaXNGaW5pdGUoc3BlZWQpIHx8XG4gICAgICBzcGVlZCA8PSAxZS0zIHx8XG4gICAgICAhTnVtYmVyLmlzRmluaXRlKHdvcmxkRGlzdCkgfHxcbiAgICAgIHdvcmxkRGlzdCA8PSAxZS0zIHx8XG4gICAgICBjYW52YXNEaXN0IDw9IDFlLTNcbiAgICApIHtcbiAgICAgIHN0b3JlLnNldChpLCAwKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChkdFNlY29uZHMgPD0gMCkge1xuICAgICAgaWYgKCFzdG9yZS5oYXMoaSkpIHtcbiAgICAgICAgc3RvcmUuc2V0KGksIDApO1xuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBjYW52YXNEaXN0IC8gd29ybGREaXN0O1xuICAgIGNvbnN0IGRhc2hTcGVlZCA9IHNwZWVkICogc2NhbGU7XG4gICAgbGV0IG5leHQgPSAoc3RvcmUuZ2V0KGkpID8/IDApIC0gZGFzaFNwZWVkICogZHRTZWNvbmRzO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG5leHQpKSB7XG4gICAgICBuZXh0ID0gMDtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCA9ICgobmV4dCAlIGN5Y2xlKSArIGN5Y2xlKSAlIGN5Y2xlO1xuICAgIH1cbiAgICBzdG9yZS5zZXQoaSwgbmV4dCk7XG4gIH1cbiAgLy8gQ2xlYW4gdXAgb2xkIGtleXNcbiAgZm9yIChjb25zdCBrZXkgb2YgQXJyYXkuZnJvbShzdG9yZS5rZXlzKCkpKSB7XG4gICAgaWYgKGtleSA+PSB3YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBzdG9yZS5kZWxldGUoa2V5KTtcbiAgICB9XG4gIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gSGVhdCBQcm9qZWN0aW9uXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFByb2plY3Rpb25QYXJhbXMge1xuICBtYXJrZXJTcGVlZDogbnVtYmVyO1xuICBrVXA6IG51bWJlcjtcbiAga0Rvd246IG51bWJlcjtcbiAgZXhwOiBudW1iZXI7XG4gIG1heDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRQcm9qZWN0aW9uUmVzdWx0IHtcbiAgaGVhdEF0V2F5cG9pbnRzOiBudW1iZXJbXTtcbiAgd2lsbE92ZXJoZWF0OiBib29sZWFuO1xuICBvdmVyaGVhdEF0PzogbnVtYmVyOyAvLyBJbmRleCB3aGVyZSBvdmVyaGVhdCBvY2N1cnNcbn1cblxuLyoqXG4gKiBQcm9qZWN0cyBoZWF0IGFsb25nIGEgcm91dGUgZ2l2ZW4gaW5pdGlhbCBoZWF0IGFuZCBoZWF0IHBhcmFtZXRlcnMuXG4gKiBSZXR1cm5zIGhlYXQgYXQgZWFjaCB3YXlwb2ludCBhbmQgd2hldGhlciBvdmVyaGVhdCB3aWxsIG9jY3VyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdFJvdXRlSGVhdChcbiAgcm91dGU6IFJvdXRlV2F5cG9pbnRbXSxcbiAgaW5pdGlhbEhlYXQ6IG51bWJlcixcbiAgcGFyYW1zOiBIZWF0UHJvamVjdGlvblBhcmFtc1xuKTogSGVhdFByb2plY3Rpb25SZXN1bHQge1xuICBjb25zdCByZXN1bHQ6IEhlYXRQcm9qZWN0aW9uUmVzdWx0ID0ge1xuICAgIGhlYXRBdFdheXBvaW50czogW10sXG4gICAgd2lsbE92ZXJoZWF0OiBmYWxzZSxcbiAgfTtcblxuICBpZiAocm91dGUubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGxldCBoZWF0ID0gY2xhbXAoaW5pdGlhbEhlYXQsIDAsIHBhcmFtcy5tYXgpO1xuICBsZXQgcHJldlBvaW50ID0geyB4OiByb3V0ZVswXS54LCB5OiByb3V0ZVswXS55IH07XG5cbiAgcmVzdWx0LmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuXG4gIGZvciAobGV0IGkgPSAxOyBpIDwgcm91dGUubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB0YXJnZXRQb3MgPSByb3V0ZVtpXTtcblxuICAgIC8vIENhbGN1bGF0ZSBkaXN0YW5jZSBhbmQgdGltZVxuICAgIGNvbnN0IGR4ID0gdGFyZ2V0UG9zLnggLSBwcmV2UG9pbnQueDtcbiAgICBjb25zdCBkeSA9IHRhcmdldFBvcy55IC0gcHJldlBvaW50Lnk7XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXG4gICAgaWYgKGRpc3RhbmNlIDwgMC4wMDEpIHtcbiAgICAgIHJlc3VsdC5oZWF0QXRXYXlwb2ludHMucHVzaChoZWF0KTtcbiAgICAgIHByZXZQb2ludCA9IHsgeDogdGFyZ2V0UG9zLngsIHk6IHRhcmdldFBvcy55IH07XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCByYXdTcGVlZCA9IHRhcmdldFBvcy5zcGVlZCA/PyBwYXJhbXMubWFya2VyU3BlZWQ7XG4gICAgY29uc3Qgc2VnbWVudFNwZWVkID0gTWF0aC5tYXgocmF3U3BlZWQsIDAuMDAwMDAxKTtcbiAgICBjb25zdCBzZWdtZW50VGltZSA9IGRpc3RhbmNlIC8gc2VnbWVudFNwZWVkO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGhlYXQgcmF0ZSAobWF0Y2ggc2VydmVyIGZvcm11bGEpXG4gICAgY29uc3QgVm4gPSBNYXRoLm1heChwYXJhbXMubWFya2VyU3BlZWQsIDAuMDAwMDAxKTtcbiAgICBjb25zdCBkZXYgPSBzZWdtZW50U3BlZWQgLSBwYXJhbXMubWFya2VyU3BlZWQ7XG4gICAgY29uc3QgcCA9IHBhcmFtcy5leHA7XG5cbiAgICBsZXQgaGRvdDogbnVtYmVyO1xuICAgIGlmIChkZXYgPj0gMCkge1xuICAgICAgLy8gSGVhdGluZ1xuICAgICAgaGRvdCA9IHBhcmFtcy5rVXAgKiBNYXRoLnBvdyhkZXYgLyBWbiwgcCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENvb2xpbmdcbiAgICAgIGhkb3QgPSAtcGFyYW1zLmtEb3duICogTWF0aC5wb3coTWF0aC5hYnMoZGV2KSAvIFZuLCBwKTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgaGVhdFxuICAgIGhlYXQgKz0gaGRvdCAqIHNlZ21lbnRUaW1lO1xuICAgIGhlYXQgPSBjbGFtcChoZWF0LCAwLCBwYXJhbXMubWF4KTtcblxuICAgIHJlc3VsdC5oZWF0QXRXYXlwb2ludHMucHVzaChoZWF0KTtcblxuICAgIC8vIENoZWNrIGZvciBvdmVyaGVhdFxuICAgIGlmICghcmVzdWx0LndpbGxPdmVyaGVhdCAmJiBoZWF0ID49IHBhcmFtcy5vdmVyaGVhdEF0KSB7XG4gICAgICByZXN1bHQud2lsbE92ZXJoZWF0ID0gdHJ1ZTtcbiAgICAgIHJlc3VsdC5vdmVyaGVhdEF0ID0gaTtcbiAgICB9XG5cbiAgICBwcmV2UG9pbnQgPSB7IHg6IHRhcmdldFBvcy54LCB5OiB0YXJnZXRQb3MueSB9O1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBDb21wYXRpYmlsaXR5IHdyYXBwZXIgZm9yIG1pc3NpbGUgaGVhdCBwcm9qZWN0aW9uLlxuICogTWlzc2lsZXMgc3RhcnQgYXQgemVybyBoZWF0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdE1pc3NpbGVIZWF0Q29tcGF0KFxuICByb3V0ZTogUm91dGVXYXlwb2ludFtdLFxuICBkZWZhdWx0U3BlZWQ6IG51bWJlcixcbiAgaGVhdFBhcmFtczogSGVhdFByb2plY3Rpb25QYXJhbXNcbik6IEhlYXRQcm9qZWN0aW9uUmVzdWx0IHtcbiAgLy8gTWlzc2lsZXMgc3RhcnQgYXQgemVybyBoZWF0XG4gIC8vIEVuc3VyZSBhbGwgd2F5cG9pbnRzIGhhdmUgc3BlZWQgc2V0ICh1c2UgZGVmYXVsdCBpZiBtaXNzaW5nKVxuICBjb25zdCByb3V0ZVdpdGhTcGVlZCA9IHJvdXRlLm1hcCgod3ApID0+ICh7XG4gICAgeDogd3AueCxcbiAgICB5OiB3cC55LFxuICAgIHNwZWVkOiB3cC5zcGVlZCA/PyBkZWZhdWx0U3BlZWQsXG4gIH0pKTtcblxuICByZXR1cm4gcHJvamVjdFJvdXRlSGVhdChyb3V0ZVdpdGhTcGVlZCwgMCwgaGVhdFBhcmFtcyk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFJlbmRlcmluZ1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIExpbmVhciBjb2xvciBpbnRlcnBvbGF0aW9uIGJldHdlZW4gdHdvIFJHQiBjb2xvcnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnRlcnBvbGF0ZUNvbG9yKFxuICBjb2xvcjE6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcbiAgY29sb3IyOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG4gIHQ6IG51bWJlclxuKTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdIHtcbiAgcmV0dXJuIFtcbiAgICBNYXRoLnJvdW5kKGNvbG9yMVswXSArIChjb2xvcjJbMF0gLSBjb2xvcjFbMF0pICogdCksXG4gICAgTWF0aC5yb3VuZChjb2xvcjFbMV0gKyAoY29sb3IyWzFdIC0gY29sb3IxWzFdKSAqIHQpLFxuICAgIE1hdGgucm91bmQoY29sb3IxWzJdICsgKGNvbG9yMlsyXSAtIGNvbG9yMVsyXSkgKiB0KSxcbiAgXTtcbn1cblxuLyoqXG4gKiBDb2xvciBwYWxldHRlIGZvciByb3V0ZSByZW5kZXJpbmcuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUm91dGVQYWxldHRlIHtcbiAgLy8gRGVmYXVsdCBsaW5lIGNvbG9yICh3aGVuIG5vIGhlYXQgZGF0YSlcbiAgZGVmYXVsdExpbmU6IHN0cmluZztcbiAgLy8gU2VsZWN0aW9uIGhpZ2hsaWdodCBjb2xvclxuICBzZWxlY3Rpb246IHN0cmluZztcbiAgLy8gV2F5cG9pbnQgY29sb3JzXG4gIHdheXBvaW50RGVmYXVsdDogc3RyaW5nO1xuICB3YXlwb2ludFNlbGVjdGVkOiBzdHJpbmc7XG4gIHdheXBvaW50RHJhZ2dpbmc/OiBzdHJpbmc7XG4gIHdheXBvaW50U3Ryb2tlOiBzdHJpbmc7XG4gIHdheXBvaW50U3Ryb2tlU2VsZWN0ZWQ/OiBzdHJpbmc7XG4gIC8vIEhlYXQgZ3JhZGllbnQgY29sb3JzIChmcm9tIGNvb2wgdG8gaG90KVxuICBoZWF0Q29vbFJnYj86IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXTtcbiAgaGVhdEhvdFJnYj86IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXTtcbn1cblxuLyoqXG4gKiBEZWZhdWx0IHNoaXAgcGFsZXR0ZSAoYmx1ZSB0aGVtZSkuXG4gKi9cbmV4cG9ydCBjb25zdCBTSElQX1BBTEVUVEU6IFJvdXRlUGFsZXR0ZSA9IHtcbiAgZGVmYXVsdExpbmU6IFwiIzM4YmRmOFwiLFxuICBzZWxlY3Rpb246IFwiI2Y5NzMxNlwiLFxuICB3YXlwb2ludERlZmF1bHQ6IFwiIzM4YmRmOFwiLFxuICB3YXlwb2ludFNlbGVjdGVkOiBcIiNmOTczMTZcIixcbiAgd2F5cG9pbnREcmFnZ2luZzogXCIjZmFjYzE1XCIsXG4gIHdheXBvaW50U3Ryb2tlOiBcIiMwZjE3MmFcIixcbiAgaGVhdENvb2xSZ2I6IFsxMDAsIDE1MCwgMjU1XSxcbiAgaGVhdEhvdFJnYjogWzI1NSwgNTAsIDUwXSxcbn07XG5cbi8qKlxuICogTWlzc2lsZSBwYWxldHRlIChyZWQgdGhlbWUpLlxuICovXG5leHBvcnQgY29uc3QgTUlTU0lMRV9QQUxFVFRFOiBSb3V0ZVBhbGV0dGUgPSB7XG4gIGRlZmF1bHRMaW5lOiBcIiNmODcxNzFhYVwiLFxuICBzZWxlY3Rpb246IFwiI2Y5NzMxNlwiLFxuICB3YXlwb2ludERlZmF1bHQ6IFwiI2Y4NzE3MVwiLFxuICB3YXlwb2ludFNlbGVjdGVkOiBcIiNmYWNjMTVcIixcbiAgd2F5cG9pbnRTdHJva2U6IFwiIzdmMWQxZFwiLFxuICB3YXlwb2ludFN0cm9rZVNlbGVjdGVkOiBcIiM4NTRkMGVcIixcbiAgaGVhdENvb2xSZ2I6IFsyNDgsIDEyOSwgMTI5XSxcbiAgaGVhdEhvdFJnYjogWzIyMCwgMzgsIDM4XSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgRHJhd1BsYW5uZWRSb3V0ZU9wdGlvbnMge1xuICAvLyBDYW52YXMgcG9pbnRzIGZvciB0aGUgcm91dGVcbiAgcm91dGVQb2ludHM6IFJvdXRlUG9pbnRzO1xuICAvLyBTZWxlY3Rpb24gc3RhdGUgKHdoaWNoIHdheXBvaW50L2xlZyBpcyBzZWxlY3RlZClcbiAgc2VsZWN0aW9uOiB7IHR5cGU6IFwid2F5cG9pbnRcIiB8IFwibGVnXCI7IGluZGV4OiBudW1iZXIgfSB8IG51bGw7XG4gIC8vIERyYWdnZWQgd2F5cG9pbnQgaW5kZXggKGZvciBkcmFnLWFuZC1kcm9wKVxuICBkcmFnZ2VkV2F5cG9pbnQ/OiBudW1iZXIgfCBudWxsO1xuICAvLyBEYXNoIGFuaW1hdGlvbiBvZmZzZXRzXG4gIGRhc2hTdG9yZTogTWFwPG51bWJlciwgbnVtYmVyPjtcbiAgLy8gQ29sb3IgcGFsZXR0ZSAoZGVmYXVsdHMgdG8gc2hpcCBwYWxldHRlKVxuICBwYWxldHRlPzogUm91dGVQYWxldHRlO1xuICAvLyBXaGV0aGVyIHRvIHNob3cgdGhlIHJvdXRlIGxlZ3NcbiAgc2hvd0xlZ3M6IGJvb2xlYW47XG4gIC8vIEhlYXQgcGFyYW1ldGVycyBhbmQgaW5pdGlhbCBoZWF0IChvcHRpb25hbClcbiAgaGVhdFBhcmFtcz86IEhlYXRQcm9qZWN0aW9uUGFyYW1zO1xuICBpbml0aWFsSGVhdD86IG51bWJlcjtcbiAgLy8gRGVmYXVsdCBzcGVlZCBmb3Igd2F5cG9pbnRzIHdpdGhvdXQgc3BlZWQgc2V0XG4gIGRlZmF1bHRTcGVlZDogbnVtYmVyO1xuICAvLyBXb3JsZCBwb2ludHMgKGZvciBoZWF0IGNhbGN1bGF0aW9uKVxuICB3b3JsZFBvaW50cz86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xufVxuXG4vKipcbiAqIERyYXdzIGEgcGxhbm5lZCByb3V0ZSAoc2hpcCBvciBtaXNzaWxlKSB3aXRoIHVuaWZpZWQgdmlzdWFscy5cbiAqIFVzZXMgc2hpcC1zdHlsZSByZW5kZXJpbmcgYnkgZGVmYXVsdCwgd2l0aCBvcHRpb25hbCBwYWxldHRlIG92ZXJyaWRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZHJhd1BsYW5uZWRSb3V0ZShcbiAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG4gIG9wdHM6IERyYXdQbGFubmVkUm91dGVPcHRpb25zXG4pOiB2b2lkIHtcbiAgY29uc3Qge1xuICAgIHJvdXRlUG9pbnRzLFxuICAgIHNlbGVjdGlvbixcbiAgICBkcmFnZ2VkV2F5cG9pbnQsXG4gICAgZGFzaFN0b3JlLFxuICAgIHBhbGV0dGUgPSBTSElQX1BBTEVUVEUsXG4gICAgc2hvd0xlZ3MsXG4gICAgaGVhdFBhcmFtcyxcbiAgICBpbml0aWFsSGVhdCA9IDAsXG4gICAgZGVmYXVsdFNwZWVkLFxuICAgIHdvcmxkUG9pbnRzLFxuICB9ID0gb3B0cztcblxuICBjb25zdCB7IHdheXBvaW50cywgY2FudmFzUG9pbnRzIH0gPSByb3V0ZVBvaW50cztcblxuICBpZiAod2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENhbGN1bGF0ZSBoZWF0IHByb2plY3Rpb24gaWYgaGVhdCBwYXJhbXMgYXZhaWxhYmxlXG4gIGxldCBoZWF0UHJvamVjdGlvbjogSGVhdFByb2plY3Rpb25SZXN1bHQgfCBudWxsID0gbnVsbDtcbiAgaWYgKGhlYXRQYXJhbXMgJiYgd29ybGRQb2ludHMgJiYgd29ybGRQb2ludHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IHJvdXRlRm9ySGVhdDogUm91dGVXYXlwb2ludFtdID0gd29ybGRQb2ludHMubWFwKChwdCwgaSkgPT4gKHtcbiAgICAgIHg6IHB0LngsXG4gICAgICB5OiBwdC55LFxuICAgICAgc3BlZWQ6IGkgPT09IDAgPyB1bmRlZmluZWQgOiB3YXlwb2ludHNbaSAtIDFdPy5zcGVlZCA/PyBkZWZhdWx0U3BlZWQsXG4gICAgfSkpO1xuICAgIGhlYXRQcm9qZWN0aW9uID0gcHJvamVjdFJvdXRlSGVhdChyb3V0ZUZvckhlYXQsIGluaXRpYWxIZWF0LCBoZWF0UGFyYW1zKTtcbiAgfVxuXG4gIC8vIERyYXcgcm91dGUgc2VnbWVudHNcbiAgaWYgKHNob3dMZWdzKSB7XG4gICAgbGV0IGN1cnJlbnRIZWF0ID0gaW5pdGlhbEhlYXQ7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgaXNGaXJzdExlZyA9IGkgPT09IDA7XG4gICAgICBjb25zdCBpc1NlbGVjdGVkID0gc2VsZWN0aW9uPy50eXBlID09PSBcImxlZ1wiICYmIHNlbGVjdGlvbi5pbmRleCA9PT0gaTtcblxuICAgICAgLy8gR2V0IGhlYXQgYXQgZW5kIG9mIHRoaXMgc2VnbWVudFxuICAgICAgbGV0IHNlZ21lbnRIZWF0ID0gY3VycmVudEhlYXQ7XG4gICAgICBpZiAoaGVhdFByb2plY3Rpb24gJiYgaSArIDEgPCBoZWF0UHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICAgIHNlZ21lbnRIZWF0ID0gaGVhdFByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzW2kgKyAxXTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2FsY3VsYXRlIGhlYXQtYmFzZWQgY29sb3IgaWYgaGVhdCBkYXRhIGF2YWlsYWJsZVxuICAgICAgbGV0IHN0cm9rZVN0eWxlOiBzdHJpbmc7XG4gICAgICBsZXQgbGluZVdpZHRoOiBudW1iZXI7XG4gICAgICBsZXQgbGluZURhc2g6IG51bWJlcltdIHwgbnVsbCA9IG51bGw7XG4gICAgICBsZXQgYWxwaGFPdmVycmlkZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgICAgIGlmIChpc1NlbGVjdGVkKSB7XG4gICAgICAgIC8vIFNlbGVjdGlvbiBzdHlsaW5nXG4gICAgICAgIHN0cm9rZVN0eWxlID0gcGFsZXR0ZS5zZWxlY3Rpb247XG4gICAgICAgIGxpbmVXaWR0aCA9IDMuNTtcbiAgICAgICAgbGluZURhc2ggPSBbNCwgNF07XG4gICAgICB9IGVsc2UgaWYgKGhlYXRQcm9qZWN0aW9uICYmIGhlYXRQYXJhbXMgJiYgcGFsZXR0ZS5oZWF0Q29vbFJnYiAmJiBwYWxldHRlLmhlYXRIb3RSZ2IpIHtcbiAgICAgICAgLy8gSGVhdC1iYXNlZCBjb2xvciBpbnRlcnBvbGF0aW9uIChzaGlwIHN0eWxlKVxuICAgICAgICBjb25zdCBoZWF0UmF0aW8gPSBjbGFtcChzZWdtZW50SGVhdCAvIGhlYXRQYXJhbXMub3ZlcmhlYXRBdCwgMCwgMSk7XG4gICAgICAgIGNvbnN0IGNvbG9yID0gaW50ZXJwb2xhdGVDb2xvcihwYWxldHRlLmhlYXRDb29sUmdiLCBwYWxldHRlLmhlYXRIb3RSZ2IsIGhlYXRSYXRpbyk7XG4gICAgICAgIGNvbnN0IGJhc2VXaWR0aCA9IGlzRmlyc3RMZWcgPyAzIDogMS41O1xuICAgICAgICBsaW5lV2lkdGggPSBiYXNlV2lkdGggKyBoZWF0UmF0aW8gKiA0O1xuICAgICAgICBjb25zdCBhbHBoYSA9IGlzRmlyc3RMZWcgPyAxIDogMC40O1xuICAgICAgICBzdHJva2VTdHlsZSA9IGByZ2JhKCR7Y29sb3JbMF19LCAke2NvbG9yWzFdfSwgJHtjb2xvclsyXX0sICR7YWxwaGF9KWA7XG4gICAgICAgIGxpbmVEYXNoID0gaXNGaXJzdExlZyA/IFs2LCA2XSA6IFs4LCA4XTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIERlZmF1bHQgc3R5bGluZyAobm8gaGVhdClcbiAgICAgICAgY29uc3QgYmFzZVdpZHRoID0gaXNGaXJzdExlZyA/IDMgOiAxLjU7XG4gICAgICAgIGxpbmVXaWR0aCA9IGJhc2VXaWR0aDtcbiAgICAgICAgc3Ryb2tlU3R5bGUgPSBwYWxldHRlLmRlZmF1bHRMaW5lO1xuICAgICAgICBsaW5lRGFzaCA9IGlzRmlyc3RMZWcgPyBbNiwgNl0gOiBbOCwgOF07XG4gICAgICAgIGFscGhhT3ZlcnJpZGUgPSBpc0ZpcnN0TGVnID8gMSA6IDAuNDtcbiAgICAgIH1cblxuICAgICAgY3R4LnNhdmUoKTtcbiAgICAgIGlmIChsaW5lRGFzaCkge1xuICAgICAgICBjdHguc2V0TGluZURhc2gobGluZURhc2gpO1xuICAgICAgfVxuICAgICAgaWYgKGFscGhhT3ZlcnJpZGUgIT09IG51bGwpIHtcbiAgICAgICAgY3R4Lmdsb2JhbEFscGhhID0gYWxwaGFPdmVycmlkZTtcbiAgICAgIH1cbiAgICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0cm9rZVN0eWxlO1xuICAgICAgY3R4LmxpbmVXaWR0aCA9IGxpbmVXaWR0aDtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5saW5lRGFzaE9mZnNldCA9IGRhc2hTdG9yZS5nZXQoaSkgPz8gMDtcbiAgICAgIGN0eC5tb3ZlVG8oY2FudmFzUG9pbnRzW2ldLngsIGNhbnZhc1BvaW50c1tpXS55KTtcbiAgICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzW2kgKyAxXS54LCBjYW52YXNQb2ludHNbaSArIDFdLnkpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgY3R4LnJlc3RvcmUoKTtcblxuICAgICAgY3VycmVudEhlYXQgPSBzZWdtZW50SGVhdDtcbiAgICB9XG4gIH1cblxuICAvLyBEcmF3IHdheXBvaW50IG1hcmtlcnNcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwdCA9IGNhbnZhc1BvaW50c1tpICsgMV07IC8vICsxIGJlY2F1c2UgZmlyc3QgcG9pbnQgaXMgc3RhcnQgcG9zaXRpb25cbiAgICBjb25zdCBpc1NlbGVjdGVkID0gc2VsZWN0aW9uPy50eXBlID09PSBcIndheXBvaW50XCIgJiYgc2VsZWN0aW9uLmluZGV4ID09PSBpO1xuICAgIGNvbnN0IGlzRHJhZ2dpbmcgPSBkcmFnZ2VkV2F5cG9pbnQgPT09IGk7XG5cbiAgICAvLyBEZXRlcm1pbmUgZmlsbCBjb2xvclxuICAgIGxldCBmaWxsQ29sb3I6IHN0cmluZztcbiAgICBpZiAoaXNTZWxlY3RlZCkge1xuICAgICAgZmlsbENvbG9yID0gcGFsZXR0ZS53YXlwb2ludFNlbGVjdGVkO1xuICAgIH0gZWxzZSBpZiAoaXNEcmFnZ2luZyAmJiBwYWxldHRlLndheXBvaW50RHJhZ2dpbmcpIHtcbiAgICAgIGZpbGxDb2xvciA9IHBhbGV0dGUud2F5cG9pbnREcmFnZ2luZztcbiAgICB9IGVsc2UgaWYgKGhlYXRQcm9qZWN0aW9uICYmIGhlYXRQYXJhbXMpIHtcbiAgICAgIC8vIEhlYXQtYmFzZWQgd2F5cG9pbnQgY29sb3JpbmcgKHRocmVzaG9sZC1iYXNlZCBmb3IgbWlzc2lsZXMpXG4gICAgICBjb25zdCBoZWF0ID0gaGVhdFByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzW2kgKyAxXSA/PyAwO1xuICAgICAgY29uc3QgaGVhdFJhdGlvID0gaGVhdCAvIGhlYXRQYXJhbXMubWF4O1xuICAgICAgY29uc3Qgd2FyblJhdGlvID0gaGVhdFBhcmFtcy53YXJuQXQgLyBoZWF0UGFyYW1zLm1heDtcbiAgICAgIGNvbnN0IG92ZXJoZWF0UmF0aW8gPSBoZWF0UGFyYW1zLm92ZXJoZWF0QXQgLyBoZWF0UGFyYW1zLm1heDtcblxuICAgICAgaWYgKGhlYXRSYXRpbyA8IHdhcm5SYXRpbykge1xuICAgICAgICBmaWxsQ29sb3IgPSBcIiMzM2FhMzNcIjsgLy8gR3JlZW5cbiAgICAgIH0gZWxzZSBpZiAoaGVhdFJhdGlvIDwgb3ZlcmhlYXRSYXRpbykge1xuICAgICAgICBmaWxsQ29sb3IgPSBcIiNmZmFhMzNcIjsgLy8gT3JhbmdlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmaWxsQ29sb3IgPSBcIiNmZjMzMzNcIjsgLy8gUmVkXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGZpbGxDb2xvciA9IHBhbGV0dGUud2F5cG9pbnREZWZhdWx0O1xuICAgIH1cblxuICAgIC8vIERldGVybWluZSBzdHJva2UgY29sb3JcbiAgICBjb25zdCBzdHJva2VDb2xvciA9IGlzU2VsZWN0ZWQgJiYgcGFsZXR0ZS53YXlwb2ludFN0cm9rZVNlbGVjdGVkXG4gICAgICA/IHBhbGV0dGUud2F5cG9pbnRTdHJva2VTZWxlY3RlZFxuICAgICAgOiBwYWxldHRlLndheXBvaW50U3Ryb2tlO1xuXG4gICAgLy8gRHJhdyB3YXlwb2ludFxuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGNvbnN0IHJhZGl1cyA9IGlzU2VsZWN0ZWQgfHwgaXNEcmFnZ2luZyA/IDcgOiA1O1xuICAgIGN0eC5hcmMocHQueCwgcHQueSwgcmFkaXVzLCAwLCBNYXRoLlBJICogMik7XG4gICAgY3R4LmZpbGxTdHlsZSA9IGZpbGxDb2xvcjtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSBpc1NlbGVjdGVkIHx8IGlzRHJhZ2dpbmcgPyAwLjk1IDogMC44O1xuICAgIGN0eC5maWxsKCk7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMTtcbiAgICBjdHgubGluZVdpZHRoID0gaXNTZWxlY3RlZCA/IDIgOiAxLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gc3Ryb2tlQ29sb3I7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHR5cGUge1xuICBBcHBTdGF0ZSxcbiAgTWlzc2lsZVJvdXRlLFxuICBNaXNzaWxlU2VsZWN0aW9uLFxuICBTZWxlY3Rpb24sXG4gIFVJU3RhdGUsXG59IGZyb20gXCIuLi9zdGF0ZVwiO1xuaW1wb3J0IHsgTUlTU0lMRV9NQVhfU1BFRUQsIE1JU1NJTEVfTUlOX1NQRUVELCBjbGFtcCB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuaW1wb3J0IHR5cGUgeyBSb3V0ZVBvaW50cyB9IGZyb20gXCIuLi9yb3V0ZVwiO1xuaW1wb3J0IHtcbiAgV0FZUE9JTlRfSElUX1JBRElVUyxcbiAgYnVpbGRSb3V0ZVBvaW50cyxcbiAgaGl0VGVzdFJvdXRlR2VuZXJpYyxcbiAgdXBkYXRlRGFzaE9mZnNldHNGb3JSb3V0ZSxcbn0gZnJvbSBcIi4uL3JvdXRlXCI7XG5pbXBvcnQgdHlwZSB7IENhbWVyYSB9IGZyb20gXCIuL2NhbWVyYVwiO1xuXG5pbnRlcmZhY2UgTG9naWNEZXBlbmRlbmNpZXMge1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIHVpU3RhdGU6IFVJU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG4gIHNlbmRNZXNzYWdlKHBheWxvYWQ6IHVua25vd24pOiB2b2lkO1xuICBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGU6IEFwcFN0YXRlKTogbnVtYmVyO1xuICBjYW1lcmE6IENhbWVyYTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQb2ludGVyUG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBMb2dpYyB7XG4gIGdldFNlbGVjdGlvbigpOiBTZWxlY3Rpb24gfCBudWxsO1xuICBzZXRTZWxlY3Rpb24oc2VsZWN0aW9uOiBTZWxlY3Rpb24gfCBudWxsKTogdm9pZDtcbiAgZ2V0TWlzc2lsZVNlbGVjdGlvbigpOiBNaXNzaWxlU2VsZWN0aW9uIHwgbnVsbDtcbiAgc2V0TWlzc2lsZVNlbGVjdGlvbihzZWxlY3Rpb246IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsLCByb3V0ZUlkPzogc3RyaW5nKTogdm9pZDtcbiAgZ2V0RGVmYXVsdFNoaXBTcGVlZCgpOiBudW1iZXI7XG4gIHNldERlZmF1bHRTaGlwU3BlZWQodmFsdWU6IG51bWJlcik6IHZvaWQ7XG4gIGdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQoKTogbnVtYmVyO1xuICByZWNvcmRNaXNzaWxlTGVnU3BlZWQodmFsdWU6IG51bWJlcik6IHZvaWQ7XG4gIGdldFNoaXBXYXlwb2ludE9mZnNldCgpOiBudW1iZXI7XG4gIGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoZGlzcGxheUluZGV4OiBudW1iZXIpOiBudW1iZXI7XG4gIGFjdHVhbEluZGV4VG9EaXNwbGF5SW5kZXgoYWN0dWFsSW5kZXg6IG51bWJlcik6IG51bWJlcjtcbiAgY29tcHV0ZVJvdXRlUG9pbnRzKCk6IFJvdXRlUG9pbnRzIHwgbnVsbDtcbiAgY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpOiBSb3V0ZVBvaW50cyB8IG51bGw7XG4gIGZpbmRXYXlwb2ludEF0UG9zaXRpb24oY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludCk6IG51bWJlciB8IG51bGw7XG4gIGhpdFRlc3RSb3V0ZShjYW52YXNQb2ludDogUG9pbnRlclBvaW50KTogU2VsZWN0aW9uIHwgbnVsbDtcbiAgaGl0VGVzdE1pc3NpbGVSb3V0ZXMoXG4gICAgY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludFxuICApOiB7IHJvdXRlOiBNaXNzaWxlUm91dGU7IHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB9IHwgbnVsbDtcbiAgc2hpcExlZ0Rhc2hPZmZzZXRzOiBNYXA8bnVtYmVyLCBudW1iZXI+O1xuICBtaXNzaWxlTGVnRGFzaE9mZnNldHM6IE1hcDxudW1iZXIsIG51bWJlcj47XG4gIHVwZGF0ZVJvdXRlQW5pbWF0aW9ucyhkdFNlY29uZHM6IG51bWJlcik6IHZvaWQ7XG4gIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsO1xuICBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbDtcbiAgY3ljbGVNaXNzaWxlUm91dGUoZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkO1xuICBjeWNsZVNoaXBTZWxlY3Rpb24oZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkO1xuICBjbGVhclNoaXBSb3V0ZSgpOiB2b2lkO1xuICBkZWxldGVTZWxlY3RlZFNoaXBXYXlwb2ludCgpOiB2b2lkO1xuICBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpOiB2b2lkO1xuICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTogdm9pZDtcbiAgaGFuZGxlU2hpcFBvaW50ZXIoY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludCwgd29ybGRQb2ludDogUG9pbnRlclBvaW50KTogdm9pZDtcbiAgaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludCwgd29ybGRQb2ludDogUG9pbnRlclBvaW50KTogdm9pZDtcbiAgYmVnaW5TaGlwRHJhZyhpbmRleDogbnVtYmVyLCBvcmlnaW46IFBvaW50ZXJQb2ludCk6IHZvaWQ7XG4gIGJlZ2luTWlzc2lsZURyYWcoaW5kZXg6IG51bWJlciwgb3JpZ2luOiBQb2ludGVyUG9pbnQpOiB2b2lkO1xuICB1cGRhdGVTaGlwRHJhZyh3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkO1xuICB1cGRhdGVNaXNzaWxlRHJhZyh3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkO1xuICBlbmREcmFnKCk6IHZvaWQ7XG4gIGdldERyYWdnZWRXYXlwb2ludCgpOiBudW1iZXIgfCBudWxsO1xuICBnZXREcmFnZ2VkTWlzc2lsZVdheXBvaW50KCk6IG51bWJlciB8IG51bGw7XG4gIGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZygpOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVMb2dpYyh7XG4gIHN0YXRlLFxuICB1aVN0YXRlLFxuICBidXMsXG4gIHNlbmRNZXNzYWdlLFxuICBnZXRBcHByb3hTZXJ2ZXJOb3csXG4gIGNhbWVyYSxcbn06IExvZ2ljRGVwZW5kZW5jaWVzKTogTG9naWMge1xuICBsZXQgc2VsZWN0aW9uOiBTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTZWxlY3Rpb246IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcbiAgbGV0IGRlZmF1bHRTcGVlZCA9IDE1MDtcbiAgbGV0IGxhc3RNaXNzaWxlTGVnU3BlZWQgPSAwO1xuICBjb25zdCBzaGlwTGVnRGFzaE9mZnNldHMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuICBjb25zdCBtaXNzaWxlTGVnRGFzaE9mZnNldHMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuICBsZXQgZHJhZ2dlZFdheXBvaW50OiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGdldFNlbGVjdGlvbigpOiBTZWxlY3Rpb24gfCBudWxsIHtcbiAgICByZXR1cm4gc2VsZWN0aW9uO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0U2VsZWN0aW9uKHNlbDogU2VsZWN0aW9uIHwgbnVsbCk6IHZvaWQge1xuICAgIHNlbGVjdGlvbiA9IHNlbDtcbiAgICBjb25zdCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IG51bGw7XG4gICAgYnVzLmVtaXQoXCJzaGlwOmxlZ1NlbGVjdGVkXCIsIHsgaW5kZXggfSk7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRNaXNzaWxlU2VsZWN0aW9uKCk6IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsIHtcbiAgICByZXR1cm4gbWlzc2lsZVNlbGVjdGlvbjtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldE1pc3NpbGVTZWxlY3Rpb24oc2VsOiBNaXNzaWxlU2VsZWN0aW9uIHwgbnVsbCwgcm91dGVJZD86IHN0cmluZyk6IHZvaWQge1xuICAgIG1pc3NpbGVTZWxlY3Rpb24gPSBzZWw7XG4gICAgaWYgKHJvdXRlSWQpIHtcbiAgICAgIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcm91dGVJZDtcbiAgICB9XG4gICAgYnVzLmVtaXQoXCJtaXNzaWxlOnNlbGVjdGlvbkNoYW5nZWRcIiwgeyBzZWxlY3Rpb246IG1pc3NpbGVTZWxlY3Rpb24gfSk7XG4gIH1cblxuICBmdW5jdGlvbiBnZXREZWZhdWx0U2hpcFNwZWVkKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIGRlZmF1bHRTcGVlZDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldERlZmF1bHRTaGlwU3BlZWQodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgIGRlZmF1bHRTcGVlZCA9IHZhbHVlO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0RGVmYXVsdE1pc3NpbGVMZWdTcGVlZCgpOiBudW1iZXIge1xuICAgIGNvbnN0IG1pblNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1pbiA/PyBNSVNTSUxFX01JTl9TUEVFRDtcbiAgICBjb25zdCBtYXhTcGVlZCA9IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXggPz8gTUlTU0lMRV9NQVhfU1BFRUQ7XG4gICAgY29uc3QgYmFzZSA9XG4gICAgICBsYXN0TWlzc2lsZUxlZ1NwZWVkID4gMCA/IGxhc3RNaXNzaWxlTGVnU3BlZWQgOiBzdGF0ZS5taXNzaWxlQ29uZmlnLnNwZWVkO1xuICAgIHJldHVybiBjbGFtcChiYXNlLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVjb3JkTWlzc2lsZUxlZ1NwZWVkKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+IDApIHtcbiAgICAgIGxhc3RNaXNzaWxlTGVnU3BlZWQgPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBnZXRTaGlwV2F5cG9pbnRPZmZzZXQoKTogbnVtYmVyIHtcbiAgICBjb25zdCBjdXJyZW50SW5kZXggPSBzdGF0ZS5tZT8uY3VycmVudFdheXBvaW50SW5kZXg7XG4gICAgaWYgKHR5cGVvZiBjdXJyZW50SW5kZXggPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKGN1cnJlbnRJbmRleCkgJiYgY3VycmVudEluZGV4ID4gMCkge1xuICAgICAgcmV0dXJuIGN1cnJlbnRJbmRleDtcbiAgICB9XG4gICAgcmV0dXJuIDA7XG4gIH1cblxuICBmdW5jdGlvbiBkaXNwbGF5SW5kZXhUb0FjdHVhbEluZGV4KGRpc3BsYXlJbmRleDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gZGlzcGxheUluZGV4ICsgZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk7XG4gIH1cblxuICBmdW5jdGlvbiBhY3R1YWxJbmRleFRvRGlzcGxheUluZGV4KGFjdHVhbEluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG9mZnNldCA9IGdldFNoaXBXYXlwb2ludE9mZnNldCgpO1xuICAgIHJldHVybiBhY3R1YWxJbmRleCAtIG9mZnNldDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXB1dGVSb3V0ZVBvaW50cygpOiBSb3V0ZVBvaW50cyB8IG51bGwge1xuICAgIGlmICghc3RhdGUubWUpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGFsbFdheXBvaW50cyA9IEFycmF5LmlzQXJyYXkoc3RhdGUubWUud2F5cG9pbnRzKSA/IHN0YXRlLm1lLndheXBvaW50cyA6IFtdO1xuICAgIGNvbnN0IG9mZnNldCA9IGdldFNoaXBXYXlwb2ludE9mZnNldCgpO1xuICAgIGNvbnN0IHZpc2libGVXYXlwb2ludHMgPSBvZmZzZXQgPiAwID8gYWxsV2F5cG9pbnRzLnNsaWNlKG9mZnNldCkgOiBhbGxXYXlwb2ludHM7XG4gICAgaWYgKCF2aXNpYmxlV2F5cG9pbnRzLmxlbmd0aCAmJiAhdWlTdGF0ZS5zaG93U2hpcFJvdXRlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIGJ1aWxkUm91dGVQb2ludHMoXG4gICAgICB7IHg6IHN0YXRlLm1lLngsIHk6IHN0YXRlLm1lLnkgfSxcbiAgICAgIHZpc2libGVXYXlwb2ludHMsXG4gICAgICBjYW1lcmEuZ2V0V29ybGRTaXplKCksXG4gICAgICBjYW1lcmEuZ2V0Q2FtZXJhUG9zaXRpb24sXG4gICAgICAoKSA9PiB1aVN0YXRlLnpvb20sXG4gICAgICBjYW1lcmEud29ybGRUb0NhbnZhc1xuICAgICk7XG4gIH1cblxuICBmdW5jdGlvbiBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk6IFJvdXRlUG9pbnRzIHwgbnVsbCB7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlIHx8ICFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgIXJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjb25zdCBvcmlnaW4gPSByb3V0ZS5vcmlnaW4gPz8geyB4OiBzdGF0ZS5tZT8ueCA/PyAwLCB5OiBzdGF0ZS5tZT8ueSA/PyAwIH07XG4gICAgcmV0dXJuIGJ1aWxkUm91dGVQb2ludHMoXG4gICAgICBvcmlnaW4sXG4gICAgICByb3V0ZS53YXlwb2ludHMsXG4gICAgICBjYW1lcmEuZ2V0V29ybGRTaXplKCksXG4gICAgICBjYW1lcmEuZ2V0Q2FtZXJhUG9zaXRpb24sXG4gICAgICAoKSA9PiB1aVN0YXRlLnpvb20sXG4gICAgICBjYW1lcmEud29ybGRUb0NhbnZhc1xuICAgICk7XG4gIH1cblxuICBmdW5jdGlvbiBmaW5kV2F5cG9pbnRBdFBvc2l0aW9uKGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQpOiBudW1iZXIgfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICAgIGlmICghcm91dGUpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgaGl0ID0gaGl0VGVzdFJvdXRlR2VuZXJpYyhjYW52YXNQb2ludCwgcm91dGUsIHtcbiAgICAgIHdheXBvaW50UmFkaXVzOiBXQVlQT0lOVF9ISVRfUkFESVVTLFxuICAgICAgbGVnSGl0VG9sZXJhbmNlOiAwLFxuICAgIH0pO1xuXG4gICAgaWYgKCFoaXQgfHwgaGl0LnR5cGUgIT09IFwid2F5cG9pbnRcIikgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoaGl0LmluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpdFRlc3RSb3V0ZShjYW52YXNQb2ludDogUG9pbnRlclBvaW50KTogU2VsZWN0aW9uIHwgbnVsbCB7XG4gICAgY29uc3Qgcm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gaGl0VGVzdFJvdXRlR2VuZXJpYyhjYW52YXNQb2ludCwgcm91dGUsIHtcbiAgICAgIHdheXBvaW50UmFkaXVzOiBXQVlQT0lOVF9ISVRfUkFESVVTLFxuICAgICAgbGVnSGl0VG9sZXJhbmNlOiA2LFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gaGl0VGVzdE1pc3NpbGVSb3V0ZXMoY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludCkge1xuICAgIGNvbnN0IHJvdXRlUG9pbnRzID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZVBvaW50cyB8fCAhcm91dGUpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgaGl0ID0gaGl0VGVzdFJvdXRlR2VuZXJpYyhjYW52YXNQb2ludCwgcm91dGVQb2ludHMsIHtcbiAgICAgIHdheXBvaW50UmFkaXVzOiBXQVlQT0lOVF9ISVRfUkFESVVTLFxuICAgICAgbGVnSGl0VG9sZXJhbmNlOiA2LFxuICAgIH0pO1xuICAgIGlmICghaGl0KSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHNlbGVjdGlvbiA9XG4gICAgICBoaXQudHlwZSA9PT0gXCJsZWdcIlxuICAgICAgICA/ICh7IHR5cGU6IFwibGVnXCIsIGluZGV4OiBoaXQuaW5kZXggfSBhcyBNaXNzaWxlU2VsZWN0aW9uKVxuICAgICAgICA6ICh7IHR5cGU6IFwid2F5cG9pbnRcIiwgaW5kZXg6IGhpdC5pbmRleCB9IGFzIE1pc3NpbGVTZWxlY3Rpb24pO1xuXG4gICAgcmV0dXJuIHsgcm91dGUsIHNlbGVjdGlvbiB9O1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlUm91dGVBbmltYXRpb25zKGR0U2Vjb25kczogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3Qgc2hpcFJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gICAgaWYgKHNoaXBSb3V0ZSAmJiBzaGlwUm91dGUud2F5cG9pbnRzLmxlbmd0aCA+IDAgJiYgdWlTdGF0ZS5zaG93U2hpcFJvdXRlKSB7XG4gICAgICB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlKFxuICAgICAgICBzaGlwTGVnRGFzaE9mZnNldHMsXG4gICAgICAgIHNoaXBSb3V0ZS53YXlwb2ludHMsXG4gICAgICAgIHNoaXBSb3V0ZS53b3JsZFBvaW50cyxcbiAgICAgICAgc2hpcFJvdXRlLmNhbnZhc1BvaW50cyxcbiAgICAgICAgZGVmYXVsdFNwZWVkLFxuICAgICAgICBkdFNlY29uZHNcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNoaXBMZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIH1cblxuICAgIGNvbnN0IG1pc3NpbGVSb3V0ZSA9IGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKTtcbiAgICBpZiAobWlzc2lsZVJvdXRlKSB7XG4gICAgICB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlKFxuICAgICAgICBtaXNzaWxlTGVnRGFzaE9mZnNldHMsXG4gICAgICAgIG1pc3NpbGVSb3V0ZS53YXlwb2ludHMsXG4gICAgICAgIG1pc3NpbGVSb3V0ZS53b3JsZFBvaW50cyxcbiAgICAgICAgbWlzc2lsZVJvdXRlLmNhbnZhc1BvaW50cyxcbiAgICAgICAgc3RhdGUubWlzc2lsZUNvbmZpZy5zcGVlZCxcbiAgICAgICAgZHRTZWNvbmRzXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBtaXNzaWxlTGVnRGFzaE9mZnNldHMuY2xlYXIoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbCB7XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZS5taXNzaWxlUm91dGVzKSA/IHN0YXRlLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgICBpZiAoIXJvdXRlcy5sZW5ndGgpIHJldHVybiBudWxsO1xuXG4gICAgaWYgKCFzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCkge1xuICAgICAgc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSByb3V0ZXNbMF0uaWQ7XG4gICAgfVxuXG4gICAgbGV0IHJvdXRlID0gcm91dGVzLmZpbmQoKHIpID0+IHIuaWQgPT09IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSB8fCBudWxsO1xuICAgIGlmICghcm91dGUpIHtcbiAgICAgIHJvdXRlID0gcm91dGVzWzBdID8/IG51bGw7XG4gICAgICBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IHJvdXRlPy5pZCA/PyBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gcm91dGU7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbCB7XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZS5taXNzaWxlUm91dGVzKSA/IHN0YXRlLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgICBpZiAoIXJvdXRlcy5sZW5ndGgpIHJldHVybiBudWxsO1xuICAgIGlmICghc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQpIHtcbiAgICAgIHJldHVybiBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICB9XG4gICAgcmV0dXJuIChcbiAgICAgIHJvdXRlcy5maW5kKChyKSA9PiByLmlkID09PSBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCkgPz9cbiAgICAgIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpXG4gICAgKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGN5Y2xlTWlzc2lsZVJvdXRlKGRpcmVjdGlvbjogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZS5taXNzaWxlUm91dGVzKSA/IHN0YXRlLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgICBpZiAoIXJvdXRlcy5sZW5ndGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY3VycmVudEluZGV4ID0gcm91dGVzLmZpbmRJbmRleChcbiAgICAgIChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkXG4gICAgKTtcbiAgICBjb25zdCBiYXNlSW5kZXggPSBjdXJyZW50SW5kZXggPj0gMCA/IGN1cnJlbnRJbmRleCA6IDA7XG4gICAgY29uc3QgbmV4dEluZGV4ID1cbiAgICAgICgoYmFzZUluZGV4ICsgZGlyZWN0aW9uKSAlIHJvdXRlcy5sZW5ndGggKyByb3V0ZXMubGVuZ3RoKSAlIHJvdXRlcy5sZW5ndGg7XG4gICAgY29uc3QgbmV4dFJvdXRlID0gcm91dGVzW25leHRJbmRleF07XG4gICAgaWYgKCFuZXh0Um91dGUpIHJldHVybjtcbiAgICBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG5leHRSb3V0ZS5pZDtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwic2V0X2FjdGl2ZV9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogbmV4dFJvdXRlLmlkLFxuICAgIH0pO1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIiwgeyByb3V0ZUlkOiBuZXh0Um91dGUuaWQgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBjeWNsZVNoaXBTZWxlY3Rpb24oZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCB3cHMgPSBzdGF0ZS5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlLm1lLndheXBvaW50cykgPyBzdGF0ZS5tZS53YXlwb2ludHMgOiBbXTtcbiAgICBpZiAoIXdwcy5sZW5ndGgpIHtcbiAgICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IGluZGV4ID0gc2VsZWN0aW9uID8gc2VsZWN0aW9uLmluZGV4IDogZGlyZWN0aW9uID4gMCA/IC0xIDogd3BzLmxlbmd0aDtcbiAgICBpbmRleCArPSBkaXJlY3Rpb247XG4gICAgaWYgKGluZGV4IDwgMCkgaW5kZXggPSB3cHMubGVuZ3RoIC0gMTtcbiAgICBpZiAoaW5kZXggPj0gd3BzLmxlbmd0aCkgaW5kZXggPSAwO1xuICAgIHNldFNlbGVjdGlvbih7IHR5cGU6IFwibGVnXCIsIGluZGV4IH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJTaGlwUm91dGUoKTogdm9pZCB7XG4gICAgY29uc3Qgd3BzID1cbiAgICAgIHN0YXRlLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGUubWUud2F5cG9pbnRzKSA/IHN0YXRlLm1lLndheXBvaW50cyA6IFtdO1xuICAgIGlmICghd3BzLmxlbmd0aCkgcmV0dXJuO1xuICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJjbGVhcl93YXlwb2ludHNcIiB9KTtcbiAgICBpZiAoc3RhdGUubWUpIHtcbiAgICAgIHN0YXRlLm1lLndheXBvaW50cyA9IFtdO1xuICAgIH1cbiAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgYnVzLmVtaXQoXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIik7XG4gIH1cblxuICBmdW5jdGlvbiBkZWxldGVTZWxlY3RlZFNoaXBXYXlwb2ludCgpOiB2b2lkIHtcbiAgICBpZiAoIXNlbGVjdGlvbikgcmV0dXJuO1xuICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJkZWxldGVfd2F5cG9pbnRcIiwgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCB9KTtcbiAgICBpZiAoc3RhdGUubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpKSB7XG4gICAgICBzdGF0ZS5tZS53YXlwb2ludHMgPSBzdGF0ZS5tZS53YXlwb2ludHMuc2xpY2UoMCwgc2VsZWN0aW9uLmluZGV4KTtcbiAgICB9XG4gICAgYnVzLmVtaXQoXCJzaGlwOndheXBvaW50RGVsZXRlZFwiLCB7IGluZGV4OiBzZWxlY3Rpb24uaW5kZXggfSk7XG4gICAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTogdm9pZCB7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlIHx8ICFtaXNzaWxlU2VsZWN0aW9uKSByZXR1cm47XG4gICAgY29uc3QgaW5kZXggPSBtaXNzaWxlU2VsZWN0aW9uLmluZGV4O1xuICAgIGlmICghQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IGluZGV4IDwgMCB8fCBpbmRleCA+PSByb3V0ZS53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwiZGVsZXRlX21pc3NpbGVfd2F5cG9pbnRcIixcbiAgICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICAgIGluZGV4LFxuICAgIH0pO1xuICAgIHJvdXRlLndheXBvaW50cyA9IFtcbiAgICAgIC4uLnJvdXRlLndheXBvaW50cy5zbGljZSgwLCBpbmRleCksXG4gICAgICAuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoaW5kZXggKyAxKSxcbiAgICBdO1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXggfSk7XG4gICAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKSA+IDAuMDUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBwbGF5ZXIgaGFzIG1pc3NpbGVzIGluIGludmVudG9yeVxuICAgIGxldCBoYXNNaXNzaWxlcyA9IGZhbHNlO1xuICAgIGlmIChzdGF0ZS5pbnZlbnRvcnk/Lml0ZW1zKSB7XG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2Ygc3RhdGUuaW52ZW50b3J5Lml0ZW1zKSB7XG4gICAgICAgIGlmIChpdGVtLnR5cGUgPT09IFwibWlzc2lsZVwiICYmIGl0ZW0ucXVhbnRpdHkgPiAwKSB7XG4gICAgICAgICAgaGFzTWlzc2lsZXMgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghaGFzTWlzc2lsZXMpIHtcbiAgICAgIGNvbnNvbGUubG9nKFwiTm8gbWlzc2lsZXMgYXZhaWxhYmxlIC0gY3JhZnQgbWlzc2lsZXMgZmlyc3RcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYnVzLmVtaXQoXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwibGF1bmNoX21pc3NpbGVcIixcbiAgICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZVNoaXBQb2ludGVyKFxuICAgIGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQsXG4gICAgd29ybGRQb2ludDogUG9pbnRlclBvaW50XG4gICk6IHZvaWQge1xuICAgIGlmICghc3RhdGUubWUpIHJldHVybjtcbiAgICBpZiAodWlTdGF0ZS5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIikge1xuICAgICAgY29uc3QgaGl0ID0gaGl0VGVzdFJvdXRlKGNhbnZhc1BvaW50KTtcbiAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgY29uc3QgYWN0dWFsSW5kZXggPSBkaXNwbGF5SW5kZXhUb0FjdHVhbEluZGV4KGhpdC5pbmRleCk7XG4gICAgICAgIHNldFNlbGVjdGlvbih7IHR5cGU6IGhpdC50eXBlLCBpbmRleDogYWN0dWFsSW5kZXggfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgd3AgPSB7IHg6IHdvcmxkUG9pbnQueCwgeTogd29ybGRQb2ludC55LCBzcGVlZDogZGVmYXVsdFNwZWVkIH07XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJhZGRfd2F5cG9pbnRcIixcbiAgICAgIHg6IHdwLngsXG4gICAgICB5OiB3cC55LFxuICAgICAgc3BlZWQ6IGRlZmF1bHRTcGVlZCxcbiAgICB9KTtcbiAgICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1lLndheXBvaW50cylcbiAgICAgID8gc3RhdGUubWUud2F5cG9pbnRzLnNsaWNlKClcbiAgICAgIDogW107XG4gICAgd3BzLnB1c2god3ApO1xuICAgIHN0YXRlLm1lLndheXBvaW50cyA9IHdwcztcbiAgICBidXMuZW1pdChcInNoaXA6d2F5cG9pbnRBZGRlZFwiLCB7IGluZGV4OiB3cHMubGVuZ3RoIC0gMSB9KTtcbiAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVNaXNzaWxlUG9pbnRlcihcbiAgICBjYW52YXNQb2ludDogUG9pbnRlclBvaW50LFxuICAgIHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludFxuICApOiB2b2lkIHtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUpIHJldHVybjtcblxuICAgIGlmICh1aVN0YXRlLm1pc3NpbGVUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgICBjb25zdCBoaXQgPSBoaXRUZXN0TWlzc2lsZVJvdXRlcyhjYW52YXNQb2ludCk7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24oaGl0LnNlbGVjdGlvbiwgaGl0LnJvdXRlLmlkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgc3BlZWQgPSBnZXREZWZhdWx0TWlzc2lsZUxlZ1NwZWVkKCk7XG4gICAgY29uc3Qgd3AgPSB7IHg6IHdvcmxkUG9pbnQueCwgeTogd29ybGRQb2ludC55LCBzcGVlZCB9O1xuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwiYWRkX21pc3NpbGVfd2F5cG9pbnRcIixcbiAgICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICAgIHg6IHdwLngsXG4gICAgICB5OiB3cC55LFxuICAgICAgc3BlZWQ6IHdwLnNwZWVkLFxuICAgIH0pO1xuICAgIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cyA/IFsuLi5yb3V0ZS53YXlwb2ludHMsIHdwXSA6IFt3cF07XG4gICAgcmVjb3JkTWlzc2lsZUxlZ1NwZWVkKHNwZWVkKTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwsIHJvdXRlLmlkKTtcbiAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLCB7XG4gICAgICByb3V0ZUlkOiByb3V0ZS5pZCxcbiAgICAgIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSxcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJlZ2luU2hpcERyYWcoaW5kZXg6IG51bWJlciwgX29yaWdpbjogUG9pbnRlclBvaW50KTogdm9pZCB7XG4gICAgZHJhZ2dlZFdheXBvaW50ID0gaW5kZXg7XG4gIH1cblxuICBmdW5jdGlvbiBiZWdpbk1pc3NpbGVEcmFnKGluZGV4OiBudW1iZXIsIF9vcmlnaW46IFBvaW50ZXJQb2ludCk6IHZvaWQge1xuICAgIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPSBpbmRleDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsYW1wVG9Xb3JsZChwb2ludDogUG9pbnRlclBvaW50KTogUG9pbnRlclBvaW50IHtcbiAgICBjb25zdCB3b3JsZFcgPSBzdGF0ZS53b3JsZE1ldGEudyA/PyA0MDAwO1xuICAgIGNvbnN0IHdvcmxkSCA9IHN0YXRlLndvcmxkTWV0YS5oID8/IDQwMDA7XG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IGNsYW1wKHBvaW50LngsIDAsIHdvcmxkVyksXG4gICAgICB5OiBjbGFtcChwb2ludC55LCAwLCB3b3JsZEgpLFxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVTaGlwRHJhZyh3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkIHtcbiAgICBpZiAoZHJhZ2dlZFdheXBvaW50ID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3QgY2xhbXBlZCA9IGNsYW1wVG9Xb3JsZCh3b3JsZFBvaW50KTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcIm1vdmVfd2F5cG9pbnRcIixcbiAgICAgIGluZGV4OiBkcmFnZ2VkV2F5cG9pbnQsXG4gICAgICB4OiBjbGFtcGVkLngsXG4gICAgICB5OiBjbGFtcGVkLnksXG4gICAgfSk7XG4gICAgaWYgKHN0YXRlLm1lICYmIHN0YXRlLm1lLndheXBvaW50cyAmJiBkcmFnZ2VkV2F5cG9pbnQgPCBzdGF0ZS5tZS53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBzdGF0ZS5tZS53YXlwb2ludHNbZHJhZ2dlZFdheXBvaW50XS54ID0gY2xhbXBlZC54O1xuICAgICAgc3RhdGUubWUud2F5cG9pbnRzW2RyYWdnZWRXYXlwb2ludF0ueSA9IGNsYW1wZWQueTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlRHJhZyh3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkIHtcbiAgICBpZiAoZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA9PT0gbnVsbCkgcmV0dXJuO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpKSByZXR1cm47XG4gICAgY29uc3QgY2xhbXBlZCA9IGNsYW1wVG9Xb3JsZCh3b3JsZFBvaW50KTtcbiAgICBpZiAoZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA+PSByb3V0ZS53YXlwb2ludHMubGVuZ3RoKSByZXR1cm47XG5cbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcIm1vdmVfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgaW5kZXg6IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQsXG4gICAgICB4OiBjbGFtcGVkLngsXG4gICAgICB5OiBjbGFtcGVkLnksXG4gICAgfSk7XG5cbiAgICByb3V0ZS53YXlwb2ludHMgPSByb3V0ZS53YXlwb2ludHMubWFwKCh3cCwgaWR4KSA9PlxuICAgICAgaWR4ID09PSBkcmFnZ2VkTWlzc2lsZVdheXBvaW50ID8geyAuLi53cCwgeDogY2xhbXBlZC54LCB5OiBjbGFtcGVkLnkgfSA6IHdwXG4gICAgKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZERyYWcoKTogdm9pZCB7XG4gICAgaWYgKGRyYWdnZWRXYXlwb2ludCAhPT0gbnVsbCAmJiBzdGF0ZS5tZT8ud2F5cG9pbnRzKSB7XG4gICAgICBjb25zdCB3cCA9IHN0YXRlLm1lLndheXBvaW50c1tkcmFnZ2VkV2F5cG9pbnRdO1xuICAgICAgaWYgKHdwKSB7XG4gICAgICAgIGJ1cy5lbWl0KFwic2hpcDp3YXlwb2ludE1vdmVkXCIsIHtcbiAgICAgICAgICBpbmRleDogZHJhZ2dlZFdheXBvaW50LFxuICAgICAgICAgIHg6IHdwLngsXG4gICAgICAgICAgeTogd3AueSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBpZiAocm91dGUgJiYgcm91dGUud2F5cG9pbnRzICYmIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IHdwID0gcm91dGUud2F5cG9pbnRzW2RyYWdnZWRNaXNzaWxlV2F5cG9pbnRdO1xuICAgICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRNb3ZlZFwiLCB7XG4gICAgICAgICAgcm91dGVJZDogcm91dGUuaWQsXG4gICAgICAgICAgaW5kZXg6IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQsXG4gICAgICAgICAgeDogd3AueCxcbiAgICAgICAgICB5OiB3cC55LFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBkcmFnZ2VkV2F5cG9pbnQgPSBudWxsO1xuICAgIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0RHJhZ2dlZFdheXBvaW50KCk6IG51bWJlciB8IG51bGwge1xuICAgIHJldHVybiBkcmFnZ2VkV2F5cG9pbnQ7XG4gIH1cblxuICBmdW5jdGlvbiBnZXREcmFnZ2VkTWlzc2lsZVdheXBvaW50KCk6IG51bWJlciB8IG51bGwge1xuICAgIHJldHVybiBkcmFnZ2VkTWlzc2lsZVdheXBvaW50O1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk6IG51bWJlciB7XG4gICAgY29uc3QgcmVtYWluaW5nID0gc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlKTtcbiAgICByZXR1cm4gcmVtYWluaW5nID4gMCA/IHJlbWFpbmluZyA6IDA7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGdldFNlbGVjdGlvbixcbiAgICBzZXRTZWxlY3Rpb24sXG4gICAgZ2V0TWlzc2lsZVNlbGVjdGlvbixcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uLFxuICAgIGdldERlZmF1bHRTaGlwU3BlZWQsXG4gICAgc2V0RGVmYXVsdFNoaXBTcGVlZCxcbiAgICBnZXREZWZhdWx0TWlzc2lsZUxlZ1NwZWVkLFxuICAgIHJlY29yZE1pc3NpbGVMZWdTcGVlZCxcbiAgICBnZXRTaGlwV2F5cG9pbnRPZmZzZXQsXG4gICAgZGlzcGxheUluZGV4VG9BY3R1YWxJbmRleCxcbiAgICBhY3R1YWxJbmRleFRvRGlzcGxheUluZGV4LFxuICAgIGNvbXB1dGVSb3V0ZVBvaW50cyxcbiAgICBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzLFxuICAgIGZpbmRXYXlwb2ludEF0UG9zaXRpb24sXG4gICAgaGl0VGVzdFJvdXRlLFxuICAgIGhpdFRlc3RNaXNzaWxlUm91dGVzLFxuICAgIHNoaXBMZWdEYXNoT2Zmc2V0cyxcbiAgICBtaXNzaWxlTGVnRGFzaE9mZnNldHMsXG4gICAgdXBkYXRlUm91dGVBbmltYXRpb25zLFxuICAgIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSxcbiAgICBnZXRBY3RpdmVNaXNzaWxlUm91dGUsXG4gICAgY3ljbGVNaXNzaWxlUm91dGUsXG4gICAgY3ljbGVTaGlwU2VsZWN0aW9uLFxuICAgIGNsZWFyU2hpcFJvdXRlLFxuICAgIGRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50LFxuICAgIGRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50LFxuICAgIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSxcbiAgICBoYW5kbGVTaGlwUG9pbnRlcixcbiAgICBoYW5kbGVNaXNzaWxlUG9pbnRlcixcbiAgICBiZWdpblNoaXBEcmFnLFxuICAgIGJlZ2luTWlzc2lsZURyYWcsXG4gICAgdXBkYXRlU2hpcERyYWcsXG4gICAgdXBkYXRlTWlzc2lsZURyYWcsXG4gICAgZW5kRHJhZyxcbiAgICBnZXREcmFnZ2VkV2F5cG9pbnQsXG4gICAgZ2V0RHJhZ2dlZE1pc3NpbGVXYXlwb2ludCxcbiAgICBnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcsXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBBcHBTdGF0ZSwgVUlTdGF0ZSB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuaW1wb3J0IHsgTUlTU0lMRV9QQUxFVFRFLCBTSElQX1BBTEVUVEUsIGRyYXdQbGFubmVkUm91dGUgfSBmcm9tIFwiLi4vcm91dGVcIjtcbmltcG9ydCB0eXBlIHsgQ2FtZXJhIH0gZnJvbSBcIi4vY2FtZXJhXCI7XG5pbXBvcnQgdHlwZSB7IExvZ2ljIH0gZnJvbSBcIi4vbG9naWNcIjtcblxuaW50ZXJmYWNlIFJlbmRlckRlcGVuZGVuY2llcyB7XG4gIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XG4gIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIHVpU3RhdGU6IFVJU3RhdGU7XG4gIGNhbWVyYTogQ2FtZXJhO1xuICBsb2dpYzogTG9naWM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVuZGVyZXIge1xuICBkcmF3U2NlbmUoKTogdm9pZDtcbiAgZHJhd0dyaWQoKTogdm9pZDtcbiAgZHJhd0JlYWNvbnMoKTogdm9pZDtcbiAgZHJhd1NoaXAoeDogbnVtYmVyLCB5OiBudW1iZXIsIHZ4OiBudW1iZXIsIHZ5OiBudW1iZXIsIGNvbG9yOiBzdHJpbmcsIGZpbGxlZDogYm9vbGVhbik6IHZvaWQ7XG4gIGRyYXdHaG9zdERvdCh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQ7XG4gIGRyYXdSb3V0ZSgpOiB2b2lkO1xuICBkcmF3TWlzc2lsZVJvdXRlKCk6IHZvaWQ7XG4gIGRyYXdNaXNzaWxlcygpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUmVuZGVyZXIoe1xuICBjYW52YXMsXG4gIGN0eCxcbiAgc3RhdGUsXG4gIHVpU3RhdGUsXG4gIGNhbWVyYSxcbiAgbG9naWMsXG59OiBSZW5kZXJEZXBlbmRlbmNpZXMpOiBSZW5kZXJlciB7XG4gIGZ1bmN0aW9uIGRyYXdTaGlwKFxuICAgIHg6IG51bWJlcixcbiAgICB5OiBudW1iZXIsXG4gICAgdng6IG51bWJlcixcbiAgICB2eTogbnVtYmVyLFxuICAgIGNvbG9yOiBzdHJpbmcsXG4gICAgZmlsbGVkOiBib29sZWFuXG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHAgPSBjYW1lcmEud29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gICAgY29uc3QgciA9IDEwO1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnRyYW5zbGF0ZShwLngsIHAueSk7XG4gICAgY29uc3QgYW5nbGUgPSBNYXRoLmF0YW4yKHZ5LCB2eCk7XG4gICAgY3R4LnJvdGF0ZShhbmdsZSk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8ociwgMCk7XG4gICAgY3R4LmxpbmVUbygtciAqIDAuNywgciAqIDAuNik7XG4gICAgY3R4LmxpbmVUbygtciAqIDAuNCwgMCk7XG4gICAgY3R4LmxpbmVUbygtciAqIDAuNywgLXIgKiAwLjYpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHgubGluZVdpZHRoID0gMjtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBjb2xvcjtcbiAgICBpZiAoZmlsbGVkKSB7XG4gICAgICBjdHguZmlsbFN0eWxlID0gYCR7Y29sb3J9Y2NgO1xuICAgICAgY3R4LmZpbGwoKTtcbiAgICB9XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBkcmF3R2hvc3REb3QoeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBwID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4LCB5IH0pO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHguYXJjKHAueCwgcC55LCAzLCAwLCBNYXRoLlBJICogMik7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwiI2NjY2NjY2FhXCI7XG4gICAgY3R4LmZpbGwoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdSb3V0ZSgpOiB2b2lkIHtcbiAgICBpZiAoIXN0YXRlLm1lKSByZXR1cm47XG4gICAgY29uc3Qgcm91dGUgPSBsb2dpYy5jb21wdXRlUm91dGVQb2ludHMoKTtcbiAgICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAgIGNvbnN0IGhlYXQgPSBzdGF0ZS5tZS5oZWF0O1xuICAgIGNvbnN0IGhlYXRQYXJhbXMgPSBoZWF0XG4gICAgICA/IHtcbiAgICAgICAgICBtYXJrZXJTcGVlZDogaGVhdC5tYXJrZXJTcGVlZCxcbiAgICAgICAgICBrVXA6IGhlYXQua1VwLFxuICAgICAgICAgIGtEb3duOiBoZWF0LmtEb3duLFxuICAgICAgICAgIGV4cDogaGVhdC5leHAsXG4gICAgICAgICAgbWF4OiBoZWF0Lm1heCxcbiAgICAgICAgICBvdmVyaGVhdEF0OiBoZWF0Lm92ZXJoZWF0QXQsXG4gICAgICAgICAgd2FybkF0OiBoZWF0Lndhcm5BdCxcbiAgICAgICAgfVxuICAgICAgOiB1bmRlZmluZWQ7XG5cbiAgICBjb25zdCBjdXJyZW50U2VsZWN0aW9uID0gbG9naWMuZ2V0U2VsZWN0aW9uKCk7XG4gICAgY29uc3QgZGlzcGxheVNlbGVjdGlvbiA9IGN1cnJlbnRTZWxlY3Rpb25cbiAgICAgID8ge1xuICAgICAgICAgIHR5cGU6IGN1cnJlbnRTZWxlY3Rpb24udHlwZSxcbiAgICAgICAgICBpbmRleDogbG9naWMuYWN0dWFsSW5kZXhUb0Rpc3BsYXlJbmRleChjdXJyZW50U2VsZWN0aW9uLmluZGV4KSxcbiAgICAgICAgfVxuICAgICAgOiBudWxsO1xuICAgIGNvbnN0IHZhbGlkU2VsZWN0aW9uID1cbiAgICAgIGRpc3BsYXlTZWxlY3Rpb24gJiYgZGlzcGxheVNlbGVjdGlvbi5pbmRleCA+PSAwID8gZGlzcGxheVNlbGVjdGlvbiA6IG51bGw7XG5cbiAgICBjb25zdCBkcmFnZ2VkID0gbG9naWMuZ2V0RHJhZ2dlZFdheXBvaW50KCk7XG4gICAgY29uc3QgZGlzcGxheURyYWdnZWQgPVxuICAgICAgZHJhZ2dlZCAhPT0gbnVsbCA/IGxvZ2ljLmFjdHVhbEluZGV4VG9EaXNwbGF5SW5kZXgoZHJhZ2dlZCkgOiBudWxsO1xuICAgIGNvbnN0IHZhbGlkRHJhZ2dlZCA9XG4gICAgICBkaXNwbGF5RHJhZ2dlZCAhPT0gbnVsbCAmJiBkaXNwbGF5RHJhZ2dlZCA+PSAwID8gZGlzcGxheURyYWdnZWQgOiBudWxsO1xuXG4gICAgZHJhd1BsYW5uZWRSb3V0ZShjdHgsIHtcbiAgICAgIHJvdXRlUG9pbnRzOiByb3V0ZSxcbiAgICAgIHNlbGVjdGlvbjogdmFsaWRTZWxlY3Rpb24sXG4gICAgICBkcmFnZ2VkV2F5cG9pbnQ6IHZhbGlkRHJhZ2dlZCxcbiAgICAgIGRhc2hTdG9yZTogbG9naWMuc2hpcExlZ0Rhc2hPZmZzZXRzLFxuICAgICAgcGFsZXR0ZTogU0hJUF9QQUxFVFRFLFxuICAgICAgc2hvd0xlZ3M6IHVpU3RhdGUuc2hvd1NoaXBSb3V0ZSxcbiAgICAgIGhlYXRQYXJhbXMsXG4gICAgICBpbml0aWFsSGVhdDogaGVhdD8udmFsdWUgPz8gMCxcbiAgICAgIGRlZmF1bHRTcGVlZDogbG9naWMuZ2V0RGVmYXVsdFNoaXBTcGVlZCgpLFxuICAgICAgd29ybGRQb2ludHM6IHJvdXRlLndvcmxkUG9pbnRzLFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZHJhd01pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgICBpZiAoIXN0YXRlLm1lKSByZXR1cm47XG4gICAgaWYgKHVpU3RhdGUuaW5wdXRDb250ZXh0ICE9PSBcIm1pc3NpbGVcIikgcmV0dXJuO1xuICAgIGNvbnN0IHJvdXRlID0gbG9naWMuY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICAgIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgY29uc3QgaGVhdFBhcmFtcyA9IHN0YXRlLm1pc3NpbGVDb25maWcuaGVhdFBhcmFtcztcbiAgICBjb25zdCBtaXNzaWxlU2VsZWN0aW9uID0gbG9naWMuZ2V0TWlzc2lsZVNlbGVjdGlvbigpO1xuICAgIGNvbnN0IGdlbmVyaWNTZWxlY3Rpb24gPVxuICAgICAgbWlzc2lsZVNlbGVjdGlvbiAmJiBtaXNzaWxlU2VsZWN0aW9uLnR5cGUgPT09IFwibGVnXCJcbiAgICAgICAgPyB7IHR5cGU6IFwibGVnXCIsIGluZGV4OiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IH1cbiAgICAgICAgOiBtaXNzaWxlU2VsZWN0aW9uICYmIG1pc3NpbGVTZWxlY3Rpb24udHlwZSA9PT0gXCJ3YXlwb2ludFwiXG4gICAgICAgID8geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IH1cbiAgICAgICAgOiBudWxsO1xuXG4gICAgZHJhd1BsYW5uZWRSb3V0ZShjdHgsIHtcbiAgICAgIHJvdXRlUG9pbnRzOiByb3V0ZSxcbiAgICAgIHNlbGVjdGlvbjogZ2VuZXJpY1NlbGVjdGlvbixcbiAgICAgIGRyYWdnZWRXYXlwb2ludDogbnVsbCxcbiAgICAgIGRhc2hTdG9yZTogbG9naWMubWlzc2lsZUxlZ0Rhc2hPZmZzZXRzLFxuICAgICAgcGFsZXR0ZTogTUlTU0lMRV9QQUxFVFRFLFxuICAgICAgc2hvd0xlZ3M6IHRydWUsXG4gICAgICBoZWF0UGFyYW1zLFxuICAgICAgaW5pdGlhbEhlYXQ6IDAsXG4gICAgICBkZWZhdWx0U3BlZWQ6IHN0YXRlLm1pc3NpbGVDb25maWcuc3BlZWQsXG4gICAgICB3b3JsZFBvaW50czogcm91dGUud29ybGRQb2ludHMsXG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBkcmF3TWlzc2lsZXMoKTogdm9pZCB7XG4gICAgaWYgKCFzdGF0ZS5taXNzaWxlcyB8fCBzdGF0ZS5taXNzaWxlcy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICBjb25zdCB3b3JsZCA9IGNhbWVyYS5nZXRXb3JsZFNpemUoKTtcbiAgICBjb25zdCBzY2FsZVggPSBjYW52YXMud2lkdGggLyB3b3JsZC53O1xuICAgIGNvbnN0IHNjYWxlWSA9IGNhbnZhcy5oZWlnaHQgLyB3b3JsZC5oO1xuICAgIGNvbnN0IHJhZGl1c1NjYWxlID0gKHNjYWxlWCArIHNjYWxlWSkgLyAyO1xuICAgIGZvciAoY29uc3QgbWlzcyBvZiBzdGF0ZS5taXNzaWxlcykge1xuICAgICAgY29uc3QgcCA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeDogbWlzcy54LCB5OiBtaXNzLnkgfSk7XG4gICAgICBjb25zdCBzZWxmT3duZWQgPSBCb29sZWFuKG1pc3Muc2VsZik7XG4gICAgICBjdHguc2F2ZSgpO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4LmFyYyhwLngsIHAueSwgc2VsZk93bmVkID8gNiA6IDUsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBzZWxmT3duZWQgPyBcIiNmODcxNzFcIiA6IFwiI2ZjYTVhNVwiO1xuICAgICAgY3R4Lmdsb2JhbEFscGhhID0gc2VsZk93bmVkID8gMC45NSA6IDAuODtcbiAgICAgIGN0eC5maWxsKCk7XG4gICAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiIzExMTgyN1wiO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgY3R4LnJlc3RvcmUoKTtcblxuICAgICAgaWYgKHNlbGZPd25lZCAmJiBtaXNzLmFncm9fcmFkaXVzID4gMCkge1xuICAgICAgICBjdHguc2F2ZSgpO1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGNvbnN0IHJDYW52YXMgPSBtaXNzLmFncm9fcmFkaXVzICogcmFkaXVzU2NhbGU7XG4gICAgICAgIGN0eC5zZXRMaW5lRGFzaChbMTQsIDEwXSk7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSgyNDgsMTEzLDExMywwLjM1KVwiO1xuICAgICAgICBjdHgubGluZVdpZHRoID0gMS4yO1xuICAgICAgICBjdHguYXJjKHAueCwgcC55LCByQ2FudmFzLCAwLCBNYXRoLlBJICogMik7XG4gICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkcmF3R3JpZCgpOiB2b2lkIHtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiIzIzNFwiO1xuICAgIGN0eC5saW5lV2lkdGggPSAxO1xuXG4gICAgY29uc3Qgem9vbSA9IHVpU3RhdGUuem9vbTtcbiAgICBsZXQgc3RlcCA9IDEwMDA7XG4gICAgaWYgKHpvb20gPCAwLjcpIHtcbiAgICAgIHN0ZXAgPSAyMDAwO1xuICAgIH0gZWxzZSBpZiAoem9vbSA+IDEuNSkge1xuICAgICAgc3RlcCA9IDUwMDtcbiAgICB9IGVsc2UgaWYgKHpvb20gPiAyLjUpIHtcbiAgICAgIHN0ZXAgPSAyNTA7XG4gICAgfVxuXG4gICAgY29uc3QgY2FtZXJhUG9zID0gY2FtZXJhLmdldENhbWVyYVBvc2l0aW9uKCk7XG4gICAgY29uc3Qgd29ybGQgPSBjYW1lcmEuZ2V0V29ybGRTaXplKCk7XG4gICAgY29uc3Qgc2NhbGVYID0gY2FudmFzLndpZHRoIC8gd29ybGQudztcbiAgICBjb25zdCBzY2FsZVkgPSBjYW52YXMuaGVpZ2h0IC8gd29ybGQuaDtcbiAgICBjb25zdCBzY2FsZSA9IE1hdGgubWluKHNjYWxlWCwgc2NhbGVZKSAqIHpvb207XG4gICAgY29uc3Qgdmlld3BvcnRXaWR0aCA9IGNhbnZhcy53aWR0aCAvIHNjYWxlO1xuICAgIGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gY2FudmFzLmhlaWdodCAvIHNjYWxlO1xuXG4gICAgY29uc3QgbWluWCA9IE1hdGgubWF4KDAsIGNhbWVyYVBvcy54IC0gdmlld3BvcnRXaWR0aCAvIDIpO1xuICAgIGNvbnN0IG1heFggPSBNYXRoLm1pbih3b3JsZC53LCBjYW1lcmFQb3MueCArIHZpZXdwb3J0V2lkdGggLyAyKTtcbiAgICBjb25zdCBtaW5ZID0gTWF0aC5tYXgoMCwgY2FtZXJhUG9zLnkgLSB2aWV3cG9ydEhlaWdodCAvIDIpO1xuICAgIGNvbnN0IG1heFkgPSBNYXRoLm1pbih3b3JsZC5oLCBjYW1lcmFQb3MueSArIHZpZXdwb3J0SGVpZ2h0IC8gMik7XG5cbiAgICBjb25zdCBzdGFydFggPSBNYXRoLmZsb29yKG1pblggLyBzdGVwKSAqIHN0ZXA7XG4gICAgY29uc3QgZW5kWCA9IE1hdGguY2VpbChtYXhYIC8gc3RlcCkgKiBzdGVwO1xuICAgIGNvbnN0IHN0YXJ0WSA9IE1hdGguZmxvb3IobWluWSAvIHN0ZXApICogc3RlcDtcbiAgICBjb25zdCBlbmRZID0gTWF0aC5jZWlsKG1heFkgLyBzdGVwKSAqIHN0ZXA7XG5cbiAgICBmb3IgKGxldCB4ID0gc3RhcnRYOyB4IDw9IGVuZFg7IHggKz0gc3RlcCkge1xuICAgICAgY29uc3QgYSA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeCwgeTogTWF0aC5tYXgoMCwgbWluWSkgfSk7XG4gICAgICBjb25zdCBiID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4LCB5OiBNYXRoLm1pbih3b3JsZC5oLCBtYXhZKSB9KTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5tb3ZlVG8oYS54LCBhLnkpO1xuICAgICAgY3R4LmxpbmVUbyhiLngsIGIueSk7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxuXG4gICAgZm9yIChsZXQgeSA9IHN0YXJ0WTsgeSA8PSBlbmRZOyB5ICs9IHN0ZXApIHtcbiAgICAgIGNvbnN0IGEgPSBjYW1lcmEud29ybGRUb0NhbnZhcyh7IHg6IE1hdGgubWF4KDAsIG1pblgpLCB5IH0pO1xuICAgICAgY29uc3QgYiA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeDogTWF0aC5taW4od29ybGQudywgbWF4WCksIHkgfSk7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHgubW92ZVRvKGEueCwgYS55KTtcbiAgICAgIGN0eC5saW5lVG8oYi54LCBiLnkpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgIH1cbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gZHJhd0JlYWNvbnMoKTogdm9pZCB7XG4gICAgY29uc3QgbWlzc2lvbiA9IHN0YXRlLm1pc3Npb247XG4gICAgaWYgKCFtaXNzaW9uIHx8ICFtaXNzaW9uLmFjdGl2ZSB8fCBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgd29ybGQgPSBjYW1lcmEuZ2V0V29ybGRTaXplKCk7XG4gICAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihjYW52YXMud2lkdGggLyB3b3JsZC53LCBjYW52YXMuaGVpZ2h0IC8gd29ybGQuaCkgKiB1aVN0YXRlLnpvb207XG4gICAgY29uc3QgbWUgPSBzdGF0ZS5tZTtcbiAgICBjb25zdCBob2xkUmVxdWlyZWQgPSBtaXNzaW9uLmhvbGRSZXF1aXJlZCB8fCAxMDtcblxuICAgIG1pc3Npb24uYmVhY29ucy5mb3JFYWNoKChiZWFjb24sIGluZGV4KSA9PiB7XG4gICAgICBjb25zdCBjZW50ZXIgPSBjYW1lcmEud29ybGRUb0NhbnZhcyh7IHg6IGJlYWNvbi5jeCwgeTogYmVhY29uLmN5IH0pO1xuICAgICAgY29uc3QgZWRnZSA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeDogYmVhY29uLmN4ICsgYmVhY29uLnJhZGl1cywgeTogYmVhY29uLmN5IH0pO1xuICAgICAgY29uc3QgcmFkaXVzID0gTWF0aC5oeXBvdChlZGdlLnggLSBjZW50ZXIueCwgZWRnZS55IC0gY2VudGVyLnkpO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocmFkaXVzKSB8fCByYWRpdXMgPD0gMC41KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaXNMb2NrZWQgPSBpbmRleCA8IG1pc3Npb24uYmVhY29uSW5kZXg7XG4gICAgICBjb25zdCBpc0FjdGl2ZSA9IGluZGV4ID09PSBtaXNzaW9uLmJlYWNvbkluZGV4O1xuICAgICAgY29uc3QgYmFzZUxpbmVXaWR0aCA9IE1hdGgubWF4KDEuNSwgMi41ICogTWF0aC5taW4oMSwgc2NhbGUgKiAxLjIpKTtcbiAgICAgIGNvbnN0IHN0cm9rZVN0eWxlID0gaXNMb2NrZWRcbiAgICAgICAgPyBcInJnYmEoNzQsMjIyLDEyOCwwLjg1KVwiXG4gICAgICAgIDogaXNBY3RpdmVcbiAgICAgICAgPyBcInJnYmEoNTYsMTg5LDI0OCwwLjk1KVwiXG4gICAgICAgIDogXCJyZ2JhKDE0OCwxNjMsMTg0LDAuNjUpXCI7XG5cbiAgICAgIGN0eC5zYXZlKCk7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHguc2V0TGluZURhc2goaXNBY3RpdmUgPyBbXSA6IFsxMCwgMTJdKTtcbiAgICAgIGN0eC5saW5lV2lkdGggPSBpc0FjdGl2ZSA/IGJhc2VMaW5lV2lkdGggKiAxLjQgOiBiYXNlTGluZVdpZHRoO1xuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gc3Ryb2tlU3R5bGU7XG4gICAgICBjdHguZ2xvYmFsQWxwaGEgPSBpc0xvY2tlZCA/IDAuOSA6IDAuODtcbiAgICAgIGN0eC5hcmMoY2VudGVyLngsIGNlbnRlci55LCByYWRpdXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgIGN0eC5zdHJva2UoKTtcblxuICAgICAgY29uc3QgaW5zaWRlID1cbiAgICAgICAgaXNBY3RpdmUgJiYgbWVcbiAgICAgICAgICA/ICgoKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IGR4ID0gbWUueCAtIGJlYWNvbi5jeDtcbiAgICAgICAgICAgICAgY29uc3QgZHkgPSBtZS55IC0gYmVhY29uLmN5O1xuICAgICAgICAgICAgICByZXR1cm4gZHggKiBkeCArIGR5ICogZHkgPD0gYmVhY29uLnJhZGl1cyAqIGJlYWNvbi5yYWRpdXM7XG4gICAgICAgICAgICB9KSgpXG4gICAgICAgICAgOiBmYWxzZTtcblxuICAgICAgaWYgKGluc2lkZSkge1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoNTYsMTg5LDI0OCwwLjEyKVwiO1xuICAgICAgICBjdHguYXJjKGNlbnRlci54LCBjZW50ZXIueSwgcmFkaXVzLCAwLCBNYXRoLlBJICogMik7XG4gICAgICAgIGN0eC5maWxsKCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc0FjdGl2ZSkge1xuICAgICAgICBjb25zdCBwcm9ncmVzcyA9IGhvbGRSZXF1aXJlZCA+IDAgPyBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCBtaXNzaW9uLmhvbGRBY2N1bSAvIGhvbGRSZXF1aXJlZCkpIDogMDtcbiAgICAgICAgaWYgKHByb2dyZXNzID4gMCkge1xuICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBcInJnYmEoNTYsMTg5LDI0OCwwLjk1KVwiO1xuICAgICAgICAgIGN0eC5saW5lV2lkdGggPSBNYXRoLm1heChiYXNlTGluZVdpZHRoICogMS44LCAyKTtcbiAgICAgICAgICBjdHguc2V0TGluZURhc2goW10pO1xuICAgICAgICAgIGN0eC5hcmMoY2VudGVyLngsIGNlbnRlci55LCByYWRpdXMsIC1NYXRoLlBJIC8gMiwgLU1hdGguUEkgLyAyICsgcHJvZ3Jlc3MgKiBNYXRoLlBJICogMik7XG4gICAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChpc0xvY2tlZCkge1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoNzQsMjIyLDEyOCwwLjc1KVwiO1xuICAgICAgICBjdHguYXJjKGNlbnRlci54LCBjZW50ZXIueSwgTWF0aC5tYXgoNCwgcmFkaXVzICogMC4wNSksIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgICAgY3R4LmZpbGwoKTtcbiAgICAgIH1cblxuICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdTY2VuZSgpOiB2b2lkIHtcbiAgICBjdHguY2xlYXJSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XG4gICAgZHJhd0dyaWQoKTtcbiAgICBkcmF3QmVhY29ucygpO1xuICAgIGRyYXdSb3V0ZSgpO1xuICAgIGRyYXdNaXNzaWxlUm91dGUoKTtcbiAgICBkcmF3TWlzc2lsZXMoKTtcblxuICAgIGZvciAoY29uc3QgZyBvZiBzdGF0ZS5naG9zdHMpIHtcbiAgICAgIGRyYXdTaGlwKGcueCwgZy55LCBnLnZ4LCBnLnZ5LCBcIiM5Y2EzYWZcIiwgZmFsc2UpO1xuICAgICAgZHJhd0dob3N0RG90KGcueCwgZy55KTtcbiAgICB9XG4gICAgaWYgKHN0YXRlLm1lKSB7XG4gICAgICBkcmF3U2hpcChzdGF0ZS5tZS54LCBzdGF0ZS5tZS55LCBzdGF0ZS5tZS52eCwgc3RhdGUubWUudnksIFwiIzIyZDNlZVwiLCB0cnVlKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGRyYXdTY2VuZSxcbiAgICBkcmF3R3JpZCxcbiAgICBkcmF3QmVhY29ucyxcbiAgICBkcmF3U2hpcCxcbiAgICBkcmF3R2hvc3REb3QsXG4gICAgZHJhd1JvdXRlLFxuICAgIGRyYXdNaXNzaWxlUm91dGUsXG4gICAgZHJhd01pc3NpbGVzLFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IEFjdGl2ZVRvb2wsIEFwcFN0YXRlLCBVSVN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQge1xuICBNSVNTSUxFX01BWF9TUEVFRCxcbiAgTUlTU0lMRV9NSU5fQUdSTyxcbiAgTUlTU0lMRV9NSU5fU1BFRUQsXG4gIGNsYW1wLFxuICBzYW5pdGl6ZU1pc3NpbGVDb25maWcsXG59IGZyb20gXCIuLi9zdGF0ZVwiO1xuaW1wb3J0IHsgSEVMUF9URVhUIH0gZnJvbSBcIi4vY29uc3RhbnRzXCI7XG5pbXBvcnQgdHlwZSB7IENhbWVyYSB9IGZyb20gXCIuL2NhbWVyYVwiO1xuaW1wb3J0IHR5cGUgeyBMb2dpYyB9IGZyb20gXCIuL2xvZ2ljXCI7XG5pbXBvcnQgeyBwcm9qZWN0Um91dGVIZWF0IH0gZnJvbSBcIi4uL3JvdXRlXCI7XG5cbmludGVyZmFjZSBVSURlcGVuZGVuY2llcyB7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgbG9naWM6IExvZ2ljO1xuICBjYW1lcmE6IENhbWVyYTtcbiAgc2VuZE1lc3NhZ2UocGF5bG9hZDogdW5rbm93bik6IHZvaWQ7XG4gIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDYWNoZWRDYW52YXMge1xuICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbDtcbiAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVJQ29udHJvbGxlciB7XG4gIGNhY2hlRG9tKCk6IENhY2hlZENhbnZhcztcbiAgYmluZFVJKCk6IHZvaWQ7XG4gIHNldEFjdGl2ZVRvb2wodG9vbDogQWN0aXZlVG9vbCk6IHZvaWQ7XG4gIHNldElucHV0Q29udGV4dChjb250ZXh0OiBcInNoaXBcIiB8IFwibWlzc2lsZVwiKTogdm9pZDtcbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTogdm9pZDtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpOiB2b2lkO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk6IHZvaWQ7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk6IHZvaWQ7XG4gIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUoKTogdm9pZDtcbiAgdXBkYXRlSGVscE92ZXJsYXkoKTogdm9pZDtcbiAgc2V0SGVscFZpc2libGUoZmxhZzogYm9vbGVhbik6IHZvaWQ7XG4gIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpOiB2b2lkO1xuICB1cGRhdGVNaXNzaWxlQ291bnREaXNwbGF5KCk6IHZvaWQ7XG4gIHVwZGF0ZUNyYWZ0VGltZXIoKTogdm9pZDtcbiAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpOiB2b2lkO1xuICB1cGRhdGVQbGFubmVkSGVhdEJhcigpOiB2b2lkO1xuICB1cGRhdGVTcGVlZE1hcmtlcigpOiB2b2lkO1xuICB1cGRhdGVIZWF0QmFyKCk6IHZvaWQ7XG4gIHByb2plY3RQbGFubmVkSGVhdCgpOiBudW1iZXIgfCBudWxsO1xuICBnZXRDYW52YXMoKTogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBnZXRDb250ZXh0KCk6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCB8IG51bGw7XG4gIGFkanVzdFNoaXBTcGVlZChzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiB2b2lkO1xuICBhZGp1c3RNaXNzaWxlQWdybyhzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiB2b2lkO1xuICBhZGp1c3RNaXNzaWxlU3BlZWQoc3RlcHM6IG51bWJlciwgY29hcnNlOiBib29sZWFuKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVVJKHtcbiAgc3RhdGUsXG4gIHVpU3RhdGUsXG4gIGJ1cyxcbiAgbG9naWMsXG4gIGNhbWVyYSxcbiAgc2VuZE1lc3NhZ2UsXG4gIGdldEFwcHJveFNlcnZlck5vdyxcbn06IFVJRGVwZW5kZW5jaWVzKTogVUlDb250cm9sbGVyIHtcbiAgbGV0IGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEIHwgbnVsbCA9IG51bGw7XG4gIGxldCBIUHNwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBraWxsc1NwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwQ29udHJvbHNDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcENsZWFyQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwUm91dGVzQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFJvdXRlTGVnOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFJvdXRlU3BlZWQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwRGVsZXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBTcGVlZFNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFNwZWVkVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlU3BlZWRNYXJrZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgbGV0IG1pc3NpbGVDb250cm9sc0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlQWRkUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlTGF1bmNoQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUxhdW5jaFRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlTGF1bmNoSW5mbzogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTZXRCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlU2VsZWN0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZURlbGV0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTcGVlZENhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlU3BlZWRTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTcGVlZFZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUFncm9DYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUFncm9TbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVBZ3JvVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlSGVhdENhcGFjaXR5Q2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVIZWF0Q2FwYWNpdHlTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVIZWF0Q2FwYWNpdHlWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVDcmFmdEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVDb3VudFNwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlQ3JhZnRUaW1lckRpdjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGNyYWZ0VGltZVJlbWFpbmluZ1NwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzcGF3bkJvdEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNwYXduQm90VGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgcm91dGVQcmV2QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgcm91dGVOZXh0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgcm91dGVNZW51VG9nZ2xlOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgcm91dGVNZW51OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgcmVuYW1lTWlzc2lsZVJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgZGVsZXRlTWlzc2lsZVJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVJvdXRlTmFtZUxhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVJvdXRlQ291bnRMYWJlbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgaGVscFRvZ2dsZTogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGhlbHBPdmVybGF5OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgaGVscENsb3NlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgaGVscFRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgbGV0IGhlYXRCYXJGaWxsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgaGVhdEJhclBsYW5uZWQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBoZWF0VmFsdWVUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc3BlZWRNYXJrZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzdGFsbE92ZXJsYXk6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgbGV0IG1hcmtlckFsaWduZWQgPSBmYWxzZTtcbiAgbGV0IGhlYXRXYXJuQWN0aXZlID0gZmFsc2U7XG4gIGxldCBzdGFsbEFjdGl2ZSA9IGZhbHNlO1xuICBsZXQgZHVhbE1ldGVyQWxlcnQgPSBmYWxzZTtcbiAgbGV0IGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgPSBcIlwiO1xuICBsZXQgbGFzdE1pc3NpbGVMYXVuY2hJbmZvSFRNTCA9IFwiXCI7XG4gIGxldCBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQ6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBjYWNoZURvbSgpOiBDYWNoZWRDYW52YXMge1xuICAgIGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3ZcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICAgIGN0eCA9IGNhbnZhcz8uZ2V0Q29udGV4dChcIjJkXCIpID8/IG51bGw7XG4gICAgSFBzcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWhwXCIpO1xuICAgIHNoaXBDb250cm9sc0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY29udHJvbHNcIik7XG4gICAgc2hpcENsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNsZWFyXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBzaGlwU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgc2hpcFNlbGVjdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZWxlY3RcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIHNoaXBSb3V0ZXNDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtcm91dGVzXCIpO1xuICAgIHNoaXBSb3V0ZUxlZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZS1sZWdcIik7XG4gICAgc2hpcFJvdXRlU3BlZWQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtcm91dGUtc3BlZWRcIik7XG4gICAgc2hpcERlbGV0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1kZWxldGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIHNoaXBTcGVlZENhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtY2FyZFwiKTtcbiAgICBzaGlwU3BlZWRTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgIHNoaXBTcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXZhbHVlXCIpO1xuXG4gICAgbWlzc2lsZUNvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1jb250cm9sc1wiKTtcbiAgICBtaXNzaWxlQWRkUm91dGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWRkLXJvdXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlTGF1bmNoQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgbWlzc2lsZUxhdW5jaFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoLXRleHRcIik7XG4gICAgbWlzc2lsZUxhdW5jaEluZm8gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoLWluZm9cIik7XG4gICAgbWlzc2lsZVNldEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVTZWxlY3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2VsZWN0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlRGVsZXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWRlbGV0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgbWlzc2lsZVNwZWVkQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1jYXJkXCIpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgbWlzc2lsZVNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtdmFsdWVcIik7XG4gICAgbWlzc2lsZUFncm9DYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tY2FyZFwiKTtcbiAgICBtaXNzaWxlQWdyb1NsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlQWdyb1ZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tdmFsdWVcIik7XG4gICAgbWlzc2lsZUhlYXRDYXBhY2l0eUNhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtaGVhdC1jYXBhY2l0eS1jYXJkXCIpO1xuICAgIG1pc3NpbGVIZWF0Q2FwYWNpdHlTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtaGVhdC1jYXBhY2l0eS1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgbWlzc2lsZUhlYXRDYXBhY2l0eVZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWhlYXQtY2FwYWNpdHktdmFsdWVcIik7XG4gICAgbWlzc2lsZUNyYWZ0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWNyYWZ0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlQ291bnRTcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWNvdW50XCIpO1xuICAgIG1pc3NpbGVDcmFmdFRpbWVyRGl2ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWNyYWZ0LXRpbWVyXCIpO1xuICAgIGNyYWZ0VGltZVJlbWFpbmluZ1NwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNyYWZ0LXRpbWUtcmVtYWluaW5nXCIpO1xuXG4gICAgc3Bhd25Cb3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgc3Bhd25Cb3RUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGF3bi1ib3QtdGV4dFwiKTtcbiAgICBraWxsc1NwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAta2lsbHNcIik7XG4gICAgcm91dGVQcmV2QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1wcmV2XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICByb3V0ZU5leHRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW5leHRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIHJvdXRlTWVudVRvZ2dsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbWVudS10b2dnbGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIHJvdXRlTWVudSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbWVudVwiKTtcbiAgICByZW5hbWVNaXNzaWxlUm91dGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlbmFtZS1taXNzaWxlLXJvdXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBkZWxldGVNaXNzaWxlUm91dGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlbGV0ZS1taXNzaWxlLXJvdXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNsZWFyLW1pc3NpbGUtd2F5cG9pbnRzXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtbmFtZVwiKTtcbiAgICBtaXNzaWxlUm91dGVDb3VudExhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXJvdXRlLWNvdW50XCIpO1xuXG4gICAgaGVscFRvZ2dsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC10b2dnbGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGhlbHBPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLW92ZXJsYXlcIik7XG4gICAgaGVscENsb3NlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLWNsb3NlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBoZWxwVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC10ZXh0XCIpO1xuXG4gICAgaGVhdEJhckZpbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlYXQtYmFyLWZpbGxcIik7XG4gICAgaGVhdEJhclBsYW5uZWQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlYXQtYmFyLXBsYW5uZWRcIik7XG4gICAgaGVhdFZhbHVlVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC12YWx1ZS10ZXh0XCIpO1xuICAgIHNwZWVkTWFya2VyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGVlZC1tYXJrZXJcIik7XG4gICAgbWlzc2lsZVNwZWVkTWFya2VyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLW1hcmtlclwiKTtcbiAgICBzdGFsbE92ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YWxsLW92ZXJsYXlcIik7XG5cbiAgICBjb25zdCBzbGlkZXJEZWZhdWx0ID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXI/LnZhbHVlID8/IFwiMTUwXCIpO1xuICAgIGxvZ2ljLnNldERlZmF1bHRTaGlwU3BlZWQoTnVtYmVyLmlzRmluaXRlKHNsaWRlckRlZmF1bHQpID8gc2xpZGVyRGVmYXVsdCA6IDE1MCk7XG4gICAgaWYgKG1pc3NpbGVTcGVlZFNsaWRlcikge1xuICAgICAgbWlzc2lsZVNwZWVkU2xpZGVyLmRpc2FibGVkID0gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgY2FudmFzLCBjdHggfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJpbmRVSSgpOiB2b2lkIHtcbiAgICBzcGF3bkJvdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGlmIChzcGF3bkJvdEJ0bi5kaXNhYmxlZCkgcmV0dXJuO1xuXG4gICAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwic3Bhd25fYm90XCIgfSk7XG4gICAgICBidXMuZW1pdChcImJvdDpzcGF3blJlcXVlc3RlZFwiKTtcblxuICAgICAgc3Bhd25Cb3RCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgaWYgKHNwYXduQm90VGV4dCkge1xuICAgICAgICBzcGF3bkJvdFRleHQudGV4dENvbnRlbnQgPSBcIlNwYXduZWRcIjtcbiAgICAgIH1cblxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGlmIChzcGF3bkJvdEJ0bikge1xuICAgICAgICAgIHNwYXduQm90QnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNwYXduQm90VGV4dCkge1xuICAgICAgICAgIHNwYXduQm90VGV4dC50ZXh0Q29udGVudCA9IFwiQm90XCI7XG4gICAgICAgIH1cbiAgICAgIH0sIDUwMDApO1xuICAgIH0pO1xuXG4gICAgc2hpcENsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGxvZ2ljLmNsZWFyU2hpcFJvdXRlKCk7XG4gICAgICBidXMuZW1pdChcInNoaXA6Y2xlYXJJbnZva2VkXCIpO1xuICAgIH0pO1xuXG4gICAgc2hpcFNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNldFwiKTtcbiAgICB9KTtcblxuICAgIHNoaXBTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZWxlY3RcIik7XG4gICAgfSk7XG5cbiAgICBzaGlwU3BlZWRTbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHZhbHVlKSkgcmV0dXJuO1xuICAgICAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG4gICAgICBsb2dpYy5zZXREZWZhdWx0U2hpcFNwZWVkKHZhbHVlKTtcbiAgICAgIGNvbnN0IHNlbGVjdGlvbiA9IGxvZ2ljLmdldFNlbGVjdGlvbigpO1xuICAgICAgaWYgKFxuICAgICAgICBzZWxlY3Rpb24gJiZcbiAgICAgICAgc3RhdGUubWUgJiZcbiAgICAgICAgQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpICYmXG4gICAgICAgIHN0YXRlLm1lLndheXBvaW50c1tzZWxlY3Rpb24uaW5kZXhdXG4gICAgICApIHtcbiAgICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcInVwZGF0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4LCBzcGVlZDogdmFsdWUgfSk7XG4gICAgICAgIHN0YXRlLm1lLndheXBvaW50c1tzZWxlY3Rpb24uaW5kZXhdLnNwZWVkID0gdmFsdWU7XG4gICAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgICAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGhlYXQgPSBzdGF0ZS5tZT8uaGVhdDtcbiAgICAgIGlmIChoZWF0KSB7XG4gICAgICAgIGNvbnN0IHRvbGVyYW5jZSA9IE1hdGgubWF4KDUsIGhlYXQubWFya2VyU3BlZWQgKiAwLjAyKTtcbiAgICAgICAgY29uc3QgZGlmZiA9IE1hdGguYWJzKHZhbHVlIC0gaGVhdC5tYXJrZXJTcGVlZCk7XG4gICAgICAgIGNvbnN0IGluUmFuZ2UgPSBkaWZmIDw9IHRvbGVyYW5jZTtcbiAgICAgICAgaWYgKGluUmFuZ2UgJiYgIW1hcmtlckFsaWduZWQpIHtcbiAgICAgICAgICBtYXJrZXJBbGlnbmVkID0gdHJ1ZTtcbiAgICAgICAgICBidXMuZW1pdChcImhlYXQ6bWFya2VyQWxpZ25lZFwiLCB7IHZhbHVlLCBtYXJrZXI6IGhlYXQubWFya2VyU3BlZWQgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAoIWluUmFuZ2UgJiYgbWFya2VyQWxpZ25lZCkge1xuICAgICAgICAgIG1hcmtlckFsaWduZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWFya2VyQWxpZ25lZCA9IGZhbHNlO1xuICAgICAgfVxuICAgICAgYnVzLmVtaXQoXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICAgIH0pO1xuXG4gICAgc2hpcERlbGV0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBsb2dpYy5kZWxldGVTZWxlY3RlZFNoaXBXYXlwb2ludCgpO1xuICAgIH0pO1xuXG4gICAgbWlzc2lsZUFkZFJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJhZGRfbWlzc2lsZV9yb3V0ZVwiIH0pO1xuICAgIH0pO1xuXG4gICAgbWlzc2lsZUxhdW5jaEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBsb2dpYy5sYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVTZXRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlU2VsZWN0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2VsZWN0XCIpO1xuICAgIH0pO1xuXG4gICAgbWlzc2lsZURlbGV0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBsb2dpYy5kZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOmRlbGV0ZUludm9rZWRcIik7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlU3BlZWRTbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHNsaWRlciA9IGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgaWYgKHNsaWRlci5kaXNhYmxlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCByYXcgPSBwYXJzZUZsb2F0KHNsaWRlci52YWx1ZSk7XG4gICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShyYXcpKSByZXR1cm47XG4gICAgICBjb25zdCBtaW5TcGVlZCA9IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4gPz8gTUlTU0lMRV9NSU5fU1BFRUQ7XG4gICAgICBjb25zdCBtYXhTcGVlZCA9IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXggPz8gTUlTU0lMRV9NQVhfU1BFRUQ7XG4gICAgICBjb25zdCBjbGFtcGVkVmFsdWUgPSBjbGFtcChyYXcsIG1pblNwZWVkLCBtYXhTcGVlZCk7XG4gICAgICBtaXNzaWxlU3BlZWRTbGlkZXIudmFsdWUgPSBjbGFtcGVkVmFsdWUudG9GaXhlZCgwKTtcbiAgICAgIGlmIChtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgICAgICBtaXNzaWxlU3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IGAke2NsYW1wZWRWYWx1ZS50b0ZpeGVkKDApfWA7XG4gICAgICB9XG4gICAgICBjb25zdCByb3V0ZSA9IGxvZ2ljLmdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgY29uc3QgbWlzc2lsZVNlbGVjdGlvbiA9IGxvZ2ljLmdldE1pc3NpbGVTZWxlY3Rpb24oKTtcbiAgICAgIGlmIChcbiAgICAgICAgcm91dGUgJiZcbiAgICAgICAgbWlzc2lsZVNlbGVjdGlvbiAmJlxuICAgICAgICBtaXNzaWxlU2VsZWN0aW9uLnR5cGUgPT09IFwibGVnXCIgJiZcbiAgICAgICAgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpICYmXG4gICAgICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPj0gMCAmJlxuICAgICAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aFxuICAgICAgKSB7XG4gICAgICAgIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cy5tYXAoKHcsIGlkeCkgPT5cbiAgICAgICAgICBpZHggPT09IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPyB7IC4uLncsIHNwZWVkOiBjbGFtcGVkVmFsdWUgfSA6IHdcbiAgICAgICAgKTtcbiAgICAgICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgIHR5cGU6IFwidXBkYXRlX21pc3NpbGVfd2F5cG9pbnRfc3BlZWRcIixcbiAgICAgICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgICAgICAgaW5kZXg6IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXgsXG4gICAgICAgICAgc3BlZWQ6IGNsYW1wZWRWYWx1ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIiwgeyB2YWx1ZTogY2xhbXBlZFZhbHVlLCBpbmRleDogbWlzc2lsZVNlbGVjdGlvbi5pbmRleCB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGNmZyA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyhcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzcGVlZDogY2xhbXBlZFZhbHVlLFxuICAgICAgICAgICAgYWdyb1JhZGl1czogc3RhdGUubWlzc2lsZUNvbmZpZy5hZ3JvUmFkaXVzLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgc3RhdGUubWlzc2lsZUNvbmZpZyxcbiAgICAgICAgICBzdGF0ZS5taXNzaWxlTGltaXRzXG4gICAgICAgICk7XG4gICAgICAgIHN0YXRlLm1pc3NpbGVDb25maWcgPSBjZmc7XG4gICAgICAgIHNlbmRNaXNzaWxlQ29uZmlnKGNmZyk7XG4gICAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIiwgeyB2YWx1ZTogY2xhbXBlZFZhbHVlLCBpbmRleDogLTEgfSk7XG4gICAgICB9XG4gICAgICBsb2dpYy5yZWNvcmRNaXNzaWxlTGVnU3BlZWQoY2xhbXBlZFZhbHVlKTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVBZ3JvU2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBjb25zdCByYXcgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocmF3KSkgcmV0dXJuO1xuICAgICAgY29uc3QgbWluQWdybyA9IHN0YXRlLm1pc3NpbGVMaW1pdHMuYWdyb01pbiA/PyBNSVNTSUxFX01JTl9BR1JPO1xuICAgICAgY29uc3QgY2xhbXBlZFZhbHVlID0gTWF0aC5tYXgobWluQWdybywgcmF3KTtcbiAgICAgIG1pc3NpbGVBZ3JvU2xpZGVyLnZhbHVlID0gY2xhbXBlZFZhbHVlLnRvRml4ZWQoMCk7XG4gICAgICBpZiAobWlzc2lsZUFncm9WYWx1ZSkge1xuICAgICAgICBtaXNzaWxlQWdyb1ZhbHVlLnRleHRDb250ZW50ID0gYCR7Y2xhbXBlZFZhbHVlLnRvRml4ZWQoMCl9YDtcbiAgICAgIH1cbiAgICAgIHVwZGF0ZU1pc3NpbGVDb25maWdGcm9tVUkoeyBhZ3JvUmFkaXVzOiBjbGFtcGVkVmFsdWUgfSk7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6YWdyb0NoYW5nZWRcIiwgeyB2YWx1ZTogY2xhbXBlZFZhbHVlIH0pO1xuICAgIH0pO1xuXG4gICAgbWlzc2lsZUhlYXRDYXBhY2l0eVNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgICAgY29uc3QgcmF3ID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHJhdykpIHJldHVybjtcbiAgICAgIGNvbnN0IGNsYW1wZWRWYWx1ZSA9IE1hdGgubWF4KDgwLCBNYXRoLm1pbigyMDAsIHJhdykpO1xuICAgICAgbWlzc2lsZUhlYXRDYXBhY2l0eVNsaWRlci52YWx1ZSA9IGNsYW1wZWRWYWx1ZS50b0ZpeGVkKDApO1xuICAgICAgaWYgKG1pc3NpbGVIZWF0Q2FwYWNpdHlWYWx1ZSkge1xuICAgICAgICBtaXNzaWxlSGVhdENhcGFjaXR5VmFsdWUudGV4dENvbnRlbnQgPSBgJHtjbGFtcGVkVmFsdWUudG9GaXhlZCgwKX1gO1xuICAgICAgfVxuICAgICAgc3RhdGUuY3JhZnRIZWF0Q2FwYWNpdHkgPSBjbGFtcGVkVmFsdWU7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlQ3JhZnRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBpZiAobWlzc2lsZUNyYWZ0QnRuLmRpc2FibGVkKSByZXR1cm47XG5cbiAgICAgIC8vIEZpbmQgdGhlIGNyYWZ0IG5vZGUgZm9yIHRoZSBzZWxlY3RlZCBoZWF0IGNhcGFjaXR5XG4gICAgICBjb25zdCBoZWF0Q2FwID0gc3RhdGUuY3JhZnRIZWF0Q2FwYWNpdHk7XG4gICAgICBsZXQgbm9kZUlkID0gXCJjcmFmdC5taXNzaWxlLmJhc2ljXCI7IC8vIERlZmF1bHRcblxuICAgICAgaWYgKHN0YXRlLmRhZykge1xuICAgICAgICAvLyBGaW5kIHRoZSBiZXN0IG1hdGNoaW5nIGNyYWZ0IG5vZGUgYmFzZWQgb24gaGVhdCBjYXBhY2l0eVxuICAgICAgICBjb25zdCBjcmFmdE5vZGVzID0gc3RhdGUuZGFnLm5vZGVzLmZpbHRlcihuID0+IG4ua2luZCA9PT0gXCJjcmFmdFwiICYmIG4uaWQuaW5jbHVkZXMoXCJtaXNzaWxlXCIpKTtcbiAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIGNyYWZ0Tm9kZXMpIHtcbiAgICAgICAgICBjb25zdCBub2RlSGVhdENhcCA9IHBhcnNlSW50KG5vZGUuaWQubWF0Y2goLyhcXGQrKS8pPy5bMV0gfHwgXCI4MFwiKTtcbiAgICAgICAgICBpZiAoTWF0aC5hYnMobm9kZUhlYXRDYXAgLSBoZWF0Q2FwKSA8IDUpIHtcbiAgICAgICAgICAgIG5vZGVJZCA9IG5vZGUuaWQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEZXRlcm1pbmUgdGhlIHJpZ2h0IG5vZGUgYmFzZWQgb24gaGVhdCBjYXBhY2l0eSByYW5nZXNcbiAgICAgICAgaWYgKGhlYXRDYXAgPj0gMTgwKSB7XG4gICAgICAgICAgbm9kZUlkID0gXCJjcmFmdC5taXNzaWxlLmV4dGVuZGVkXCI7XG4gICAgICAgIH0gZWxzZSBpZiAoaGVhdENhcCA+PSAxNDApIHtcbiAgICAgICAgICBub2RlSWQgPSBcImNyYWZ0Lm1pc3NpbGUuaGlnaF9oZWF0XCI7XG4gICAgICAgIH0gZWxzZSBpZiAoaGVhdENhcCA+PSAxMTApIHtcbiAgICAgICAgICBub2RlSWQgPSBcImNyYWZ0Lm1pc3NpbGUubG9uZ19yYW5nZVwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG5vZGVJZCA9IFwiY3JhZnQubWlzc2lsZS5iYXNpY1wiO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJkYWdfc3RhcnRcIiwgbm9kZV9pZDogbm9kZUlkIH0pO1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOmNyYWZ0UmVxdWVzdGVkXCIsIHsgbm9kZUlkLCBoZWF0Q2FwYWNpdHk6IGhlYXRDYXAgfSk7XG4gICAgfSk7XG5cbiAgICByb3V0ZVByZXZCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBsb2dpYy5jeWNsZU1pc3NpbGVSb3V0ZSgtMSkpO1xuICAgIHJvdXRlTmV4dEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGxvZ2ljLmN5Y2xlTWlzc2lsZVJvdXRlKDEpKTtcblxuICAgIHJvdXRlTWVudVRvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnRvZ2dsZShcInZpc2libGVcIik7XG4gICAgfSk7XG5cbiAgICByZW5hbWVNaXNzaWxlUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCByb3V0ZSA9IGxvZ2ljLmdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgaWYgKCFyb3V0ZSkgcmV0dXJuO1xuICAgICAgY29uc3QgbmV4dE5hbWUgPSBwcm9tcHQoXCJSZW5hbWUgcm91dGVcIiwgcm91dGUubmFtZSA/PyBcIlwiKSA/PyBcIlwiO1xuICAgICAgY29uc3QgdHJpbW1lZCA9IG5leHROYW1lLnRyaW0oKTtcbiAgICAgIGlmICh0cmltbWVkID09PSByb3V0ZS5uYW1lKSByZXR1cm47XG4gICAgICBzZW5kTWVzc2FnZSh7XG4gICAgICAgIHR5cGU6IFwicmVuYW1lX21pc3NpbGVfcm91dGVcIixcbiAgICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgICBuYW1lOiB0cmltbWVkLFxuICAgICAgfSk7XG4gICAgICByb3V0ZS5uYW1lID0gdHJpbW1lZDtcbiAgICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfSk7XG5cbiAgICBkZWxldGVNaXNzaWxlUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCByb3V0ZSA9IGxvZ2ljLmdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgaWYgKCFyb3V0ZSkgcmV0dXJuO1xuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRlbGV0ZV9taXNzaWxlX3JvdXRlXCIsIHJvdXRlX2lkOiByb3V0ZS5pZCB9KTtcbiAgICB9KTtcblxuICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBpZiAoIXJvdXRlIHx8ICFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiY2xlYXJfbWlzc2lsZV93YXlwb2ludHNcIiwgcm91dGVfaWQ6IHJvdXRlLmlkIH0pO1xuICAgICAgcm91dGUud2F5cG9pbnRzID0gW107XG4gICAgICBsb2dpYy5zZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9KTtcblxuICAgIGhlbHBUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRIZWxwVmlzaWJsZSh0cnVlKTtcbiAgICB9KTtcblxuICAgIGhlbHBDbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEhlbHBWaXNpYmxlKGZhbHNlKTtcbiAgICB9KTtcblxuICAgIGJ1cy5vbihcInNoaXA6bGVnU2VsZWN0ZWRcIiwgKCkgPT4ge1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgIH0pO1xuICAgIGJ1cy5vbihcInNoaXA6d2F5cG9pbnRBZGRlZFwiLCAoKSA9PiB7XG4gICAgICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gICAgICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xuICAgIH0pO1xuICAgIGJ1cy5vbihcInNoaXA6d2F5cG9pbnREZWxldGVkXCIsICgpID0+IHtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG4gICAgfSk7XG4gICAgYnVzLm9uKFwic2hpcDp3YXlwb2ludHNDbGVhcmVkXCIsICgpID0+IHtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG4gICAgfSk7XG4gICAgYnVzLm9uKFwibWlzc2lsZTpzZWxlY3Rpb25DaGFuZ2VkXCIsICgpID0+IHtcbiAgICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZU1pc3NpbGVTcGVlZENvbnRyb2xzKCk7XG4gICAgfSk7XG4gICAgYnVzLm9uKFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsICgpID0+IHtcbiAgICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfSk7XG4gICAgYnVzLm9uKFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgKCkgPT4ge1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLCAoKSA9PiB7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0Q2FudmFzKCk6IEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbCB7XG4gICAgcmV0dXJuIGNhbnZhcztcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldENvbnRleHQoKTogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEIHwgbnVsbCB7XG4gICAgcmV0dXJuIGN0eDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVNwZWVkTGFiZWwodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghc2hpcFNwZWVkVmFsdWUpIHJldHVybjtcbiAgICBzaGlwU3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IGAke3ZhbHVlLnRvRml4ZWQoMCl9IHUvc2A7XG4gIH1cblxuICBmdW5jdGlvbiBhZGp1c3RTbGlkZXJWYWx1ZShcbiAgICBpbnB1dDogSFRNTElucHV0RWxlbWVudCB8IG51bGwsXG4gICAgc3RlcHM6IG51bWJlcixcbiAgICBjb2Fyc2U6IGJvb2xlYW5cbiAgKTogbnVtYmVyIHwgbnVsbCB7XG4gICAgaWYgKCFpbnB1dCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3Qgc3RlcCA9IE1hdGguYWJzKHBhcnNlRmxvYXQoaW5wdXQuc3RlcCkpIHx8IDE7XG4gICAgY29uc3QgbXVsdGlwbGllciA9IGNvYXJzZSA/IDQgOiAxO1xuICAgIGNvbnN0IG1pbiA9IE51bWJlci5pc0Zpbml0ZShwYXJzZUZsb2F0KGlucHV0Lm1pbikpID8gcGFyc2VGbG9hdChpbnB1dC5taW4pIDogLUluZmluaXR5O1xuICAgIGNvbnN0IG1heCA9IE51bWJlci5pc0Zpbml0ZShwYXJzZUZsb2F0KGlucHV0Lm1heCkpID8gcGFyc2VGbG9hdChpbnB1dC5tYXgpIDogSW5maW5pdHk7XG4gICAgY29uc3QgY3VycmVudCA9IHBhcnNlRmxvYXQoaW5wdXQudmFsdWUpIHx8IDA7XG4gICAgbGV0IG5leHQgPSBjdXJyZW50ICsgc3RlcHMgKiBzdGVwICogbXVsdGlwbGllcjtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG1pbikpIG5leHQgPSBNYXRoLm1heChtaW4sIG5leHQpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobWF4KSkgbmV4dCA9IE1hdGgubWluKG1heCwgbmV4dCk7XG4gICAgaWYgKE1hdGguYWJzKG5leHQgLSBjdXJyZW50KSA8IDFlLTQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpbnB1dC52YWx1ZSA9IFN0cmluZyhuZXh0KTtcbiAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudChcImlucHV0XCIsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgcmV0dXJuIG5leHQ7XG4gIH1cblxuICBmdW5jdGlvbiBhZGp1c3RTaGlwU3BlZWQoc3RlcHM6IG51bWJlciwgY29hcnNlOiBib29sZWFuKTogdm9pZCB7XG4gICAgYWRqdXN0U2xpZGVyVmFsdWUoc2hpcFNwZWVkU2xpZGVyLCBzdGVwcywgY29hcnNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkanVzdE1pc3NpbGVBZ3JvKHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGFkanVzdFNsaWRlclZhbHVlKG1pc3NpbGVBZ3JvU2xpZGVyLCBzdGVwcywgY29hcnNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkanVzdE1pc3NpbGVTcGVlZChzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBpZiAobWlzc2lsZVNwZWVkU2xpZGVyICYmICFtaXNzaWxlU3BlZWRTbGlkZXIuZGlzYWJsZWQpIHtcbiAgICAgIGFkanVzdFNsaWRlclZhbHVlKG1pc3NpbGVTcGVlZFNsaWRlciwgc3RlcHMsIGNvYXJzZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0U2hpcFNsaWRlclZhbHVlKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXNoaXBTcGVlZFNsaWRlcikgcmV0dXJuO1xuICAgIHNoaXBTcGVlZFNsaWRlci52YWx1ZSA9IHZhbHVlLnRvRml4ZWQoMCk7XG4gICAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG4gIH1cblxuICBmdW5jdGlvbiByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpOiB2b2lkIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGNvbnN0IGFjdGl2ZVJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKG1pc3NpbGVSb3V0ZU5hbWVMYWJlbCkge1xuICAgICAgaWYgKCFhY3RpdmVSb3V0ZSkge1xuICAgICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSByb3V0ZXMubGVuZ3RoID09PSAwID8gXCJObyByb3V0ZVwiIDogXCJSb3V0ZVwiO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWlzc2lsZVJvdXRlTmFtZUxhYmVsLnRleHRDb250ZW50ID0gYWN0aXZlUm91dGUubmFtZSB8fCBcIlJvdXRlXCI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwpIHtcbiAgICAgIGNvbnN0IGNvdW50ID1cbiAgICAgICAgYWN0aXZlUm91dGUgJiYgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpID8gYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gICAgICBtaXNzaWxlUm91dGVDb3VudExhYmVsLnRleHRDb250ZW50ID0gYCR7Y291bnR9IHB0c2A7XG4gICAgfVxuXG4gICAgaWYgKGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bikge1xuICAgICAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICAgIH1cbiAgICBpZiAocmVuYW1lTWlzc2lsZVJvdXRlQnRuKSB7XG4gICAgICByZW5hbWVNaXNzaWxlUm91dGVCdG4uZGlzYWJsZWQgPSAhYWN0aXZlUm91dGU7XG4gICAgfVxuICAgIGlmIChjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4pIHtcbiAgICAgIGNvbnN0IGNvdW50ID1cbiAgICAgICAgYWN0aXZlUm91dGUgJiYgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpID8gYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gICAgICBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4uZGlzYWJsZWQgPSAhYWN0aXZlUm91dGUgfHwgY291bnQgPT09IDA7XG4gICAgfVxuICAgIGlmIChyb3V0ZVByZXZCdG4pIHtcbiAgICAgIHJvdXRlUHJldkJ0bi5kaXNhYmxlZCA9IHJvdXRlcy5sZW5ndGggPD0gMTtcbiAgICB9XG4gICAgaWYgKHJvdXRlTmV4dEJ0bikge1xuICAgICAgcm91dGVOZXh0QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICAgIH1cblxuICAgIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUoKTogdm9pZCB7XG4gICAgbG9naWMuZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgY29uc3QgYWN0aXZlUm91dGUgPSBsb2dpYy5nZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBjb25zdCBtaXNzaWxlU2VsID0gbG9naWMuZ2V0TWlzc2lsZVNlbGVjdGlvbigpO1xuICAgIGNvbnN0IHJvdXRlSGFzU2VsZWN0aW9uID1cbiAgICAgICEhYWN0aXZlUm91dGUgJiZcbiAgICAgIEFycmF5LmlzQXJyYXkoYWN0aXZlUm91dGUud2F5cG9pbnRzKSAmJlxuICAgICAgISFtaXNzaWxlU2VsICYmXG4gICAgICBtaXNzaWxlU2VsLmluZGV4ID49IDAgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPCBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoO1xuICAgIGlmICghcm91dGVIYXNTZWxlY3Rpb24pIHtcbiAgICAgIGxvZ2ljLnNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgfVxuICAgIGNvbnN0IGNmZyA9IHN0YXRlLm1pc3NpbGVDb25maWc7XG4gICAgYXBwbHlNaXNzaWxlVUkoY2ZnKTtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFwcGx5TWlzc2lsZVVJKGNmZzogeyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfSk6IHZvaWQge1xuICAgIGlmIChtaXNzaWxlQWdyb1NsaWRlcikge1xuICAgICAgY29uc3QgbWluQWdybyA9IHN0YXRlLm1pc3NpbGVMaW1pdHMuYWdyb01pbiA/PyBNSVNTSUxFX01JTl9BR1JPO1xuICAgICAgY29uc3QgbWF4QWdybyA9IE1hdGgubWF4KDUwMDAsIE1hdGguY2VpbCgoY2ZnLmFncm9SYWRpdXMgKyA1MDApIC8gNTAwKSAqIDUwMCk7XG4gICAgICBtaXNzaWxlQWdyb1NsaWRlci5taW4gPSBTdHJpbmcobWluQWdybyk7XG4gICAgICBtaXNzaWxlQWdyb1NsaWRlci5tYXggPSBTdHJpbmcobWF4QWdybyk7XG4gICAgICBtaXNzaWxlQWdyb1NsaWRlci52YWx1ZSA9IGNmZy5hZ3JvUmFkaXVzLnRvRml4ZWQoMCk7XG4gICAgfVxuICAgIGlmIChtaXNzaWxlQWdyb1ZhbHVlKSB7XG4gICAgICBtaXNzaWxlQWdyb1ZhbHVlLnRleHRDb250ZW50ID0gY2ZnLmFncm9SYWRpdXMudG9GaXhlZCgwKTtcbiAgICB9XG4gICAgdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTtcbiAgICB1cGRhdGVTcGVlZE1hcmtlcigpO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSShcbiAgICBvdmVycmlkZXM6IFBhcnRpYWw8eyBhZ3JvUmFkaXVzOiBudW1iZXIgfT4gPSB7fVxuICApOiB2b2lkIHtcbiAgICBjb25zdCBjdXJyZW50ID0gc3RhdGUubWlzc2lsZUNvbmZpZztcbiAgICBjb25zdCBjZmcgPSBzYW5pdGl6ZU1pc3NpbGVDb25maWcoXG4gICAgICB7XG4gICAgICAgIHNwZWVkOiBjdXJyZW50LnNwZWVkLFxuICAgICAgICBhZ3JvUmFkaXVzOiBvdmVycmlkZXMuYWdyb1JhZGl1cyA/PyBjdXJyZW50LmFncm9SYWRpdXMsXG4gICAgICB9LFxuICAgICAgY3VycmVudCxcbiAgICAgIHN0YXRlLm1pc3NpbGVMaW1pdHNcbiAgICApO1xuICAgIHN0YXRlLm1pc3NpbGVDb25maWcgPSBjZmc7XG4gICAgYXBwbHlNaXNzaWxlVUkoY2ZnKTtcbiAgICBjb25zdCBsYXN0ID0gbGFzdE1pc3NpbGVDb25maWdTZW50O1xuICAgIGNvbnN0IG5lZWRzU2VuZCA9XG4gICAgICAhbGFzdCB8fCBNYXRoLmFicygobGFzdC5hZ3JvUmFkaXVzID8/IDApIC0gY2ZnLmFncm9SYWRpdXMpID4gNTtcbiAgICBpZiAobmVlZHNTZW5kKSB7XG4gICAgICBzZW5kTWlzc2lsZUNvbmZpZyhjZmcpO1xuICAgIH1cbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2VuZE1pc3NpbGVDb25maWcoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gICAgbGFzdE1pc3NpbGVDb25maWdTZW50ID0ge1xuICAgICAgc3BlZWQ6IGNmZy5zcGVlZCxcbiAgICAgIGFncm9SYWRpdXM6IGNmZy5hZ3JvUmFkaXVzLFxuICAgIH07XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJjb25maWd1cmVfbWlzc2lsZVwiLFxuICAgICAgbWlzc2lsZV9zcGVlZDogY2ZnLnNwZWVkLFxuICAgICAgbWlzc2lsZV9hZ3JvOiBjZmcuYWdyb1JhZGl1cyxcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTogdm9pZCB7XG4gICAgaWYgKCFzaGlwUm91dGVzQ29udGFpbmVyIHx8ICFzaGlwUm91dGVMZWcgfHwgIXNoaXBSb3V0ZVNwZWVkIHx8ICFzaGlwRGVsZXRlQnRuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHdwcyA9IHN0YXRlLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGUubWUud2F5cG9pbnRzKSA/IHN0YXRlLm1lLndheXBvaW50cyA6IFtdO1xuICAgIGNvbnN0IHNlbGVjdGlvbiA9IGxvZ2ljLmdldFNlbGVjdGlvbigpO1xuICAgIGNvbnN0IGhhc1ZhbGlkU2VsZWN0aW9uID1cbiAgICAgIHNlbGVjdGlvbiAhPT0gbnVsbCAmJiBzZWxlY3Rpb24uaW5kZXggPj0gMCAmJiBzZWxlY3Rpb24uaW5kZXggPCB3cHMubGVuZ3RoO1xuICAgIGNvbnN0IGlzU2hpcENvbnRleHQgPSB1aVN0YXRlLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCI7XG5cbiAgICBzaGlwUm91dGVzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICBzaGlwUm91dGVzQ29udGFpbmVyLnN0eWxlLm9wYWNpdHkgPSBpc1NoaXBDb250ZXh0ID8gXCIxXCIgOiBcIjAuNlwiO1xuXG4gICAgaWYgKCFzdGF0ZS5tZSB8fCAhaGFzVmFsaWRTZWxlY3Rpb24gfHwgIXNlbGVjdGlvbikge1xuICAgICAgc2hpcFJvdXRlTGVnLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIHNoaXBSb3V0ZVNwZWVkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIHNoaXBEZWxldGVCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgaWYgKGlzU2hpcENvbnRleHQpIHtcbiAgICAgICAgc2V0U2hpcFNsaWRlclZhbHVlKGxvZ2ljLmdldERlZmF1bHRTaGlwU3BlZWQoKSk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgd3AgPSB3cHNbc2VsZWN0aW9uLmluZGV4XTtcbiAgICBjb25zdCBzcGVlZCA9XG4gICAgICB3cCAmJiB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgPyB3cC5zcGVlZCA6IGxvZ2ljLmdldERlZmF1bHRTaGlwU3BlZWQoKTtcbiAgICBpZiAoXG4gICAgICBpc1NoaXBDb250ZXh0ICYmXG4gICAgICBzaGlwU3BlZWRTbGlkZXIgJiZcbiAgICAgIE1hdGguYWJzKHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyLnZhbHVlKSAtIHNwZWVkKSA+IDAuMjVcbiAgICApIHtcbiAgICAgIHNldFNoaXBTbGlkZXJWYWx1ZShzcGVlZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHVwZGF0ZVNwZWVkTGFiZWwoc3BlZWQpO1xuICAgIH1cbiAgICBjb25zdCBkaXNwbGF5SW5kZXggPSBzZWxlY3Rpb24uaW5kZXggKyAxO1xuICAgIHNoaXBSb3V0ZUxlZy50ZXh0Q29udGVudCA9IGAke2Rpc3BsYXlJbmRleH1gO1xuICAgIHNoaXBSb3V0ZVNwZWVkLnRleHRDb250ZW50ID0gYCR7c3BlZWQudG9GaXhlZCgwKX0gdS9zYDtcbiAgICBzaGlwRGVsZXRlQnRuLmRpc2FibGVkID0gIWlzU2hpcENvbnRleHQ7XG4gIH1cblxuICBmdW5jdGlvbiByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk6IHZvaWQge1xuICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgY29uc3QgY291bnQgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICBjb25zdCBtaXNzaWxlU2VsID0gbG9naWMuZ2V0TWlzc2lsZVNlbGVjdGlvbigpO1xuICAgIGNvbnN0IGlzV2F5cG9pbnRTZWxlY3Rpb24gPVxuICAgICAgbWlzc2lsZVNlbCAhPT0gbnVsbCAmJlxuICAgICAgbWlzc2lsZVNlbCAhPT0gdW5kZWZpbmVkICYmXG4gICAgICBtaXNzaWxlU2VsLnR5cGUgPT09IFwid2F5cG9pbnRcIiAmJlxuICAgICAgbWlzc2lsZVNlbC5pbmRleCA+PSAwICYmXG4gICAgICBtaXNzaWxlU2VsLmluZGV4IDwgY291bnQ7XG4gICAgaWYgKG1pc3NpbGVEZWxldGVCdG4pIHtcbiAgICAgIG1pc3NpbGVEZWxldGVCdG4uZGlzYWJsZWQgPSAhaXNXYXlwb2ludFNlbGVjdGlvbjtcbiAgICB9XG4gICAgdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVTcGVlZENvbnRyb2xzKCk6IHZvaWQge1xuICAgIGlmICghbWlzc2lsZVNwZWVkU2xpZGVyIHx8ICFtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IG1pblNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1pbiA/PyBNSVNTSUxFX01JTl9TUEVFRDtcbiAgICBjb25zdCBtYXhTcGVlZCA9IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXggPz8gTUlTU0lMRV9NQVhfU1BFRUQ7XG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5TcGVlZCk7XG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyLm1heCA9IFN0cmluZyhtYXhTcGVlZCk7XG5cbiAgICBjb25zdCByb3V0ZSA9IGxvZ2ljLmdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGNvbnN0IG1pc3NpbGVTZWwgPSBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCk7XG4gICAgY29uc3Qgd2F5cG9pbnRzID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzIDogbnVsbDtcbiAgICBsZXQgc2VsZWN0ZWRTcGVlZDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IHNlbGVjdGVkVHlwZTogXCJsZWdcIiB8IFwid2F5cG9pbnRcIiB8IG51bGwgPSBudWxsO1xuXG4gICAgaWYgKFxuICAgICAgd2F5cG9pbnRzICYmXG4gICAgICBtaXNzaWxlU2VsICYmXG4gICAgICBtaXNzaWxlU2VsLmluZGV4ID49IDAgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPCB3YXlwb2ludHMubGVuZ3RoXG4gICAgKSB7XG4gICAgICBjb25zdCB3cCA9IHdheXBvaW50c1ttaXNzaWxlU2VsLmluZGV4XTtcbiAgICAgIGNvbnN0IHZhbHVlID1cbiAgICAgICAgdHlwZW9mIHdwLnNwZWVkID09PSBcIm51bWJlclwiICYmIHdwLnNwZWVkID4gMFxuICAgICAgICAgID8gd3Auc3BlZWRcbiAgICAgICAgICA6IGxvZ2ljLmdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQoKTtcbiAgICAgIHNlbGVjdGVkU3BlZWQgPSBjbGFtcCh2YWx1ZSwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgICAgIHNlbGVjdGVkVHlwZSA9IG1pc3NpbGVTZWwudHlwZTtcbiAgICB9XG5cbiAgICBjb25zdCBzbGlkZXJEaXNhYmxlZCA9IHNlbGVjdGVkVHlwZSA9PT0gXCJ3YXlwb2ludFwiO1xuICAgIGxldCBzbGlkZXJWYWx1ZTogbnVtYmVyO1xuICAgIGlmIChzZWxlY3RlZFNwZWVkICE9PSBudWxsKSB7XG4gICAgICBzbGlkZXJWYWx1ZSA9IHNlbGVjdGVkU3BlZWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHJhd1ZhbHVlID0gcGFyc2VGbG9hdChtaXNzaWxlU3BlZWRTbGlkZXIudmFsdWUpO1xuICAgICAgY29uc3QgZmFsbGJhY2sgPSBsb2dpYy5nZXREZWZhdWx0TWlzc2lsZUxlZ1NwZWVkKCk7XG4gICAgICBjb25zdCB0YXJnZXRWYWx1ZSA9IE51bWJlci5pc0Zpbml0ZShyYXdWYWx1ZSkgPyByYXdWYWx1ZSA6IGZhbGxiYWNrO1xuICAgICAgc2xpZGVyVmFsdWUgPSBjbGFtcCh0YXJnZXRWYWx1ZSwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgICB9XG5cbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIuZGlzYWJsZWQgPSBzbGlkZXJEaXNhYmxlZDtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIudmFsdWUgPSBzbGlkZXJWYWx1ZS50b0ZpeGVkKDApO1xuICAgIG1pc3NpbGVTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7c2xpZGVyVmFsdWUudG9GaXhlZCgwKX1gO1xuXG4gICAgaWYgKCFzbGlkZXJEaXNhYmxlZCkge1xuICAgICAgbG9naWMucmVjb3JkTWlzc2lsZUxlZ1NwZWVkKHNsaWRlclZhbHVlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRJbnB1dENvbnRleHQoY29udGV4dDogXCJzaGlwXCIgfCBcIm1pc3NpbGVcIik6IHZvaWQge1xuICAgIGNvbnN0IG5leHQgPSBjb250ZXh0ID09PSBcIm1pc3NpbGVcIiA/IFwibWlzc2lsZVwiIDogXCJzaGlwXCI7XG4gICAgaWYgKHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBuZXh0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHVpU3RhdGUuaW5wdXRDb250ZXh0ID0gbmV4dDtcblxuICAgIGlmIChuZXh0ID09PSBcInNoaXBcIikge1xuICAgICAgY29uc3Qgc2hpcFRvb2xUb1VzZSA9IHVpU3RhdGUuc2hpcFRvb2wgPT09IFwic2VsZWN0XCIgPyBcInNoaXAtc2VsZWN0XCIgOiBcInNoaXAtc2V0XCI7XG4gICAgICBpZiAodWlTdGF0ZS5hY3RpdmVUb29sICE9PSBzaGlwVG9vbFRvVXNlKSB7XG4gICAgICAgIHVpU3RhdGUuYWN0aXZlVG9vbCA9IHNoaXBUb29sVG9Vc2U7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IG1pc3NpbGVUb29sVG9Vc2UgPVxuICAgICAgICB1aVN0YXRlLm1pc3NpbGVUb29sID09PSBcInNlbGVjdFwiID8gXCJtaXNzaWxlLXNlbGVjdFwiIDogXCJtaXNzaWxlLXNldFwiO1xuICAgICAgaWYgKHVpU3RhdGUuYWN0aXZlVG9vbCAhPT0gbWlzc2lsZVRvb2xUb1VzZSkge1xuICAgICAgICB1aVN0YXRlLmFjdGl2ZVRvb2wgPSBtaXNzaWxlVG9vbFRvVXNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGJ1cy5lbWl0KFwiY29udGV4dDpjaGFuZ2VkXCIsIHsgY29udGV4dDogbmV4dCB9KTtcbiAgICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRBY3RpdmVUb29sKHRvb2w6IEFjdGl2ZVRvb2wpOiB2b2lkIHtcbiAgICBpZiAodWlTdGF0ZS5hY3RpdmVUb29sID09PSB0b29sKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdWlTdGF0ZS5hY3RpdmVUb29sID0gdG9vbDtcblxuICAgIGlmICh0b29sID09PSBcInNoaXAtc2V0XCIpIHtcbiAgICAgIHVpU3RhdGUuc2hpcFRvb2wgPSBcInNldFwiO1xuICAgICAgdWlTdGF0ZS5taXNzaWxlVG9vbCA9IG51bGw7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgYnVzLmVtaXQoXCJzaGlwOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZXRcIiB9KTtcbiAgICB9IGVsc2UgaWYgKHRvb2wgPT09IFwic2hpcC1zZWxlY3RcIikge1xuICAgICAgdWlTdGF0ZS5zaGlwVG9vbCA9IFwic2VsZWN0XCI7XG4gICAgICB1aVN0YXRlLm1pc3NpbGVUb29sID0gbnVsbDtcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBidXMuZW1pdChcInNoaXA6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNlbGVjdFwiIH0pO1xuICAgIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKSB7XG4gICAgICB1aVN0YXRlLnNoaXBUb29sID0gbnVsbDtcbiAgICAgIHVpU3RhdGUubWlzc2lsZVRvb2wgPSBcInNldFwiO1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGxvZ2ljLnNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNldFwiIH0pO1xuICAgIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKSB7XG4gICAgICB1aVN0YXRlLnNoaXBUb29sID0gbnVsbDtcbiAgICAgIHVpU3RhdGUubWlzc2lsZVRvb2wgPSBcInNlbGVjdFwiO1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2VsZWN0XCIgfSk7XG4gICAgfVxuXG4gICAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEJ1dHRvblN0YXRlKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsLCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBpZiAoIWJ0bikgcmV0dXJuO1xuICAgIGlmIChhY3RpdmUpIHtcbiAgICAgIGJ0bi5kYXRhc2V0LnN0YXRlID0gXCJhY3RpdmVcIjtcbiAgICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJ0cnVlXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWxldGUgYnRuLmRhdGFzZXQuc3RhdGU7XG4gICAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwiZmFsc2VcIik7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTogdm9pZCB7XG4gICAgc2V0QnV0dG9uU3RhdGUoc2hpcFNldEJ0biwgdWlTdGF0ZS5hY3RpdmVUb29sID09PSBcInNoaXAtc2V0XCIpO1xuICAgIHNldEJ1dHRvblN0YXRlKHNoaXBTZWxlY3RCdG4sIHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKTtcbiAgICBzZXRCdXR0b25TdGF0ZShtaXNzaWxlU2V0QnRuLCB1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZXRcIik7XG4gICAgc2V0QnV0dG9uU3RhdGUobWlzc2lsZVNlbGVjdEJ0biwgdWlTdGF0ZS5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2VsZWN0XCIpO1xuXG4gICAgaWYgKHNoaXBDb250cm9sc0NhcmQpIHtcbiAgICAgIHNoaXBDb250cm9sc0NhcmQuY2xhc3NMaXN0LnRvZ2dsZShcImFjdGl2ZVwiLCB1aVN0YXRlLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCIpO1xuICAgIH1cbiAgICBpZiAobWlzc2lsZUNvbnRyb2xzQ2FyZCkge1xuICAgICAgbWlzc2lsZUNvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIik7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2V0SGVscFZpc2libGUoZmxhZzogYm9vbGVhbik6IHZvaWQge1xuICAgIHVpU3RhdGUuaGVscFZpc2libGUgPSBmbGFnO1xuICAgIHVwZGF0ZUhlbHBPdmVybGF5KCk7XG4gICAgYnVzLmVtaXQoXCJoZWxwOnZpc2libGVDaGFuZ2VkXCIsIHsgdmlzaWJsZTogdWlTdGF0ZS5oZWxwVmlzaWJsZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUhlbHBPdmVybGF5KCk6IHZvaWQge1xuICAgIGlmICghaGVscE92ZXJsYXkgfHwgIWhlbHBUZXh0KSByZXR1cm47XG4gICAgaGVscE92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZShcInZpc2libGVcIiwgdWlTdGF0ZS5oZWxwVmlzaWJsZSk7XG4gICAgaGVscFRleHQudGV4dENvbnRlbnQgPSBIRUxQX1RFWFQ7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTogdm9pZCB7XG4gICAgaWYgKCFtaXNzaWxlTGF1bmNoQnRuIHx8ICFtaXNzaWxlTGF1bmNoVGV4dCB8fCAhbWlzc2lsZUxhdW5jaEluZm8pIHJldHVybjtcbiAgICBjb25zdCByb3V0ZSA9IGxvZ2ljLmdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGNvbnN0IGNvdW50ID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gICAgY29uc3QgcmVtYWluaW5nID0gbG9naWMuZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk7XG4gICAgY29uc3QgY29vbGluZ0Rvd24gPSByZW1haW5pbmcgPiAwLjA1O1xuICAgIGNvbnN0IHNob3VsZERpc2FibGUgPSAhcm91dGUgfHwgY291bnQgPT09IDAgfHwgY29vbGluZ0Rvd247XG4gICAgbWlzc2lsZUxhdW5jaEJ0bi5kaXNhYmxlZCA9IHNob3VsZERpc2FibGU7XG5cbiAgICBjb25zdCBsYXVuY2hUZXh0SFRNTCA9XG4gICAgICAnPHNwYW4gY2xhc3M9XCJidG4tdGV4dC1mdWxsXCI+TGF1bmNoPC9zcGFuPjxzcGFuIGNsYXNzPVwiYnRuLXRleHQtc2hvcnRcIj5GaXJlPC9zcGFuPic7XG4gICAgbGV0IGxhdW5jaEluZm9IVE1MID0gXCJcIjtcblxuICAgIGlmICghcm91dGUpIHtcbiAgICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgICB9IGVsc2UgaWYgKGNvb2xpbmdEb3duKSB7XG4gICAgICBsYXVuY2hJbmZvSFRNTCA9IGAke3JlbWFpbmluZy50b0ZpeGVkKDEpfXNgO1xuICAgIH0gZWxzZSBpZiAocm91dGUubmFtZSkge1xuICAgICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZS5taXNzaWxlUm91dGVzKSA/IHN0YXRlLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgICAgIGNvbnN0IHJvdXRlSW5kZXggPSByb3V0ZXMuZmluZEluZGV4KChyKSA9PiByLmlkID09PSByb3V0ZS5pZCkgKyAxO1xuICAgICAgbGF1bmNoSW5mb0hUTUwgPSBgPHNwYW4gY2xhc3M9XCJidG4tdGV4dC1mdWxsXCI+JHtyb3V0ZS5uYW1lfTwvc3Bhbj48c3BhbiBjbGFzcz1cImJ0bi10ZXh0LXNob3J0XCI+JHtyb3V0ZUluZGV4fTwvc3Bhbj5gO1xuICAgIH0gZWxzZSB7XG4gICAgICBsYXVuY2hJbmZvSFRNTCA9IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgIT09IGxhdW5jaFRleHRIVE1MKSB7XG4gICAgICBtaXNzaWxlTGF1bmNoVGV4dC5pbm5lckhUTUwgPSBsYXVuY2hUZXh0SFRNTDtcbiAgICAgIGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgPSBsYXVuY2hUZXh0SFRNTDtcbiAgICB9XG5cbiAgICBpZiAobGFzdE1pc3NpbGVMYXVuY2hJbmZvSFRNTCAhPT0gbGF1bmNoSW5mb0hUTUwpIHtcbiAgICAgIG1pc3NpbGVMYXVuY2hJbmZvLmlubmVySFRNTCA9IGxhdW5jaEluZm9IVE1MO1xuICAgICAgbGFzdE1pc3NpbGVMYXVuY2hJbmZvSFRNTCA9IGxhdW5jaEluZm9IVE1MO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVDb3VudERpc3BsYXkoKTogdm9pZCB7XG4gICAgaWYgKCFtaXNzaWxlQ291bnRTcGFuKSByZXR1cm47XG5cbiAgICBsZXQgY291bnQgPSAwO1xuICAgIGlmIChzdGF0ZS5pbnZlbnRvcnkgJiYgc3RhdGUuaW52ZW50b3J5Lml0ZW1zKSB7XG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2Ygc3RhdGUuaW52ZW50b3J5Lml0ZW1zKSB7XG4gICAgICAgIGlmIChpdGVtLnR5cGUgPT09IFwibWlzc2lsZVwiKSB7XG4gICAgICAgICAgY291bnQgKz0gaXRlbS5xdWFudGl0eTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIG1pc3NpbGVDb3VudFNwYW4udGV4dENvbnRlbnQgPSBjb3VudC50b1N0cmluZygpO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlQ3JhZnRUaW1lcigpOiB2b2lkIHtcbiAgICBpZiAoIW1pc3NpbGVDcmFmdFRpbWVyRGl2IHx8ICFjcmFmdFRpbWVSZW1haW5pbmdTcGFuKSByZXR1cm47XG5cbiAgICAvLyBMb29rIGZvciBhbnkgY3JhZnQgbm9kZSB0aGF0J3MgaW4gcHJvZ3Jlc3NcbiAgICBsZXQgY3JhZnRJblByb2dyZXNzID0gZmFsc2U7XG4gICAgbGV0IHJlbWFpbmluZ1RpbWUgPSAwO1xuXG4gICAgaWYgKHN0YXRlLmRhZyAmJiBzdGF0ZS5kYWcubm9kZXMpIHtcbiAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBzdGF0ZS5kYWcubm9kZXMpIHtcbiAgICAgICAgaWYgKG5vZGUua2luZCA9PT0gXCJjcmFmdFwiICYmIG5vZGUuc3RhdHVzID09PSBcImluX3Byb2dyZXNzXCIpIHtcbiAgICAgICAgICBjcmFmdEluUHJvZ3Jlc3MgPSB0cnVlO1xuICAgICAgICAgIHJlbWFpbmluZ1RpbWUgPSBub2RlLnJlbWFpbmluZ19zO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGNyYWZ0SW5Qcm9ncmVzcyAmJiByZW1haW5pbmdUaW1lID4gMCkge1xuICAgICAgbWlzc2lsZUNyYWZ0VGltZXJEaXYuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIGNyYWZ0VGltZVJlbWFpbmluZ1NwYW4udGV4dENvbnRlbnQgPSBNYXRoLmNlaWwocmVtYWluaW5nVGltZSkudG9TdHJpbmcoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbWlzc2lsZUNyYWZ0VGltZXJEaXYuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVN0YXR1c0luZGljYXRvcnMoKTogdm9pZCB7XG4gICAgY29uc3QgbWV0YSA9IHN0YXRlLndvcmxkTWV0YSA/PyB7fTtcbiAgICBjYW1lcmEudXBkYXRlV29ybGRGcm9tTWV0YShtZXRhKTtcblxuICAgIGlmIChIUHNwYW4pIHtcbiAgICAgIGlmIChzdGF0ZS5tZSAmJiBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubWUuaHApKSB7XG4gICAgICAgIEhQc3Bhbi50ZXh0Q29udGVudCA9IE51bWJlcihzdGF0ZS5tZS5ocCkudG9TdHJpbmcoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIEhQc3Bhbi50ZXh0Q29udGVudCA9IFwiXHUyMDEzXCI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChraWxsc1NwYW4pIHtcbiAgICAgIGlmIChzdGF0ZS5tZSAmJiBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubWUua2lsbHMpKSB7XG4gICAgICAgIGtpbGxzU3Bhbi50ZXh0Q29udGVudCA9IE51bWJlcihzdGF0ZS5tZS5raWxscykudG9TdHJpbmcoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGtpbGxzU3Bhbi50ZXh0Q29udGVudCA9IFwiMFwiO1xuICAgICAgfVxuICAgIH1cblxuICAgIHVwZGF0ZUhlYXRCYXIoKTtcbiAgICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xuICAgIHVwZGF0ZVNwZWVkTWFya2VyKCk7XG4gICAgdXBkYXRlU3RhbGxPdmVybGF5KCk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVIZWF0QmFyKCk6IHZvaWQge1xuICAgIGNvbnN0IGhlYXQgPSBzdGF0ZS5tZT8uaGVhdDtcbiAgICBpZiAoIWhlYXQgfHwgIWhlYXRCYXJGaWxsIHx8ICFoZWF0VmFsdWVUZXh0KSB7XG4gICAgICBoZWF0V2FybkFjdGl2ZSA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHBlcmNlbnQgPSAoaGVhdC52YWx1ZSAvIGhlYXQubWF4KSAqIDEwMDtcbiAgICBoZWF0QmFyRmlsbC5zdHlsZS53aWR0aCA9IGAke3BlcmNlbnR9JWA7XG5cbiAgICBoZWF0VmFsdWVUZXh0LnRleHRDb250ZW50ID0gYEhlYXQgJHtNYXRoLnJvdW5kKGhlYXQudmFsdWUpfWA7XG5cbiAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QucmVtb3ZlKFwid2FyblwiLCBcIm92ZXJoZWF0XCIpO1xuICAgIGlmIChoZWF0LnZhbHVlID49IGhlYXQub3ZlcmhlYXRBdCkge1xuICAgICAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LmFkZChcIm92ZXJoZWF0XCIpO1xuICAgIH0gZWxzZSBpZiAoaGVhdC52YWx1ZSA+PSBoZWF0Lndhcm5BdCkge1xuICAgICAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LmFkZChcIndhcm5cIik7XG4gICAgfVxuXG4gICAgY29uc3Qgbm93V2FybiA9IGhlYXQudmFsdWUgPj0gaGVhdC53YXJuQXQ7XG4gICAgaWYgKG5vd1dhcm4gJiYgIWhlYXRXYXJuQWN0aXZlKSB7XG4gICAgICBoZWF0V2FybkFjdGl2ZSA9IHRydWU7XG4gICAgICBidXMuZW1pdChcImhlYXQ6d2FybkVudGVyZWRcIiwgeyB2YWx1ZTogaGVhdC52YWx1ZSwgd2FybkF0OiBoZWF0Lndhcm5BdCB9KTtcbiAgICB9IGVsc2UgaWYgKCFub3dXYXJuICYmIGhlYXRXYXJuQWN0aXZlKSB7XG4gICAgICBjb25zdCBjb29sVGhyZXNob2xkID0gTWF0aC5tYXgoMCwgaGVhdC53YXJuQXQgLSA1KTtcbiAgICAgIGlmIChoZWF0LnZhbHVlIDw9IGNvb2xUaHJlc2hvbGQpIHtcbiAgICAgICAgaGVhdFdhcm5BY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgYnVzLmVtaXQoXCJoZWF0OmNvb2xlZEJlbG93V2FyblwiLCB7IHZhbHVlOiBoZWF0LnZhbHVlLCB3YXJuQXQ6IGhlYXQud2FybkF0IH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHByb2plY3RQbGFubmVkSGVhdCgpOiBudW1iZXIgfCBudWxsIHtcbiAgICBjb25zdCBzaGlwID0gc3RhdGUubWU7XG4gICAgaWYgKCFzaGlwIHx8ICFBcnJheS5pc0FycmF5KHNoaXAud2F5cG9pbnRzKSB8fCBzaGlwLndheXBvaW50cy5sZW5ndGggPT09IDAgfHwgIXNoaXAuaGVhdCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgY3VycmVudEluZGV4UmF3ID0gc2hpcC5jdXJyZW50V2F5cG9pbnRJbmRleDtcbiAgICBjb25zdCBjdXJyZW50SW5kZXggPVxuICAgICAgdHlwZW9mIGN1cnJlbnRJbmRleFJhdyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUoY3VycmVudEluZGV4UmF3KSA/IGN1cnJlbnRJbmRleFJhdyA6IDA7XG4gICAgY29uc3QgY2xhbXBlZEluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY3VycmVudEluZGV4LCBzaGlwLndheXBvaW50cy5sZW5ndGgpKTtcbiAgICBjb25zdCByZW1haW5pbmdXYXlwb2ludHMgPVxuICAgICAgY2xhbXBlZEluZGV4ID4gMCA/IHNoaXAud2F5cG9pbnRzLnNsaWNlKGNsYW1wZWRJbmRleCkgOiBzaGlwLndheXBvaW50cy5zbGljZSgpO1xuXG4gICAgaWYgKHJlbWFpbmluZ1dheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHJvdXRlID0gW3sgeDogc2hpcC54LCB5OiBzaGlwLnksIHNwZWVkOiB1bmRlZmluZWQgfSwgLi4ucmVtYWluaW5nV2F5cG9pbnRzXTtcblxuICAgIGNvbnN0IGhlYXRQYXJhbXMgPSB7XG4gICAgICBtYXJrZXJTcGVlZDogc2hpcC5oZWF0Lm1hcmtlclNwZWVkLFxuICAgICAga1VwOiBzaGlwLmhlYXQua1VwLFxuICAgICAga0Rvd246IHNoaXAuaGVhdC5rRG93bixcbiAgICAgIGV4cDogc2hpcC5oZWF0LmV4cCxcbiAgICAgIG1heDogc2hpcC5oZWF0Lm1heCxcbiAgICAgIG92ZXJoZWF0QXQ6IHNoaXAuaGVhdC5vdmVyaGVhdEF0LFxuICAgICAgd2FybkF0OiBzaGlwLmhlYXQud2FybkF0LFxuICAgIH07XG5cbiAgICBjb25zdCBwcm9qZWN0aW9uID0gcHJvamVjdFJvdXRlSGVhdChyb3V0ZSwgc2hpcC5oZWF0LnZhbHVlLCBoZWF0UGFyYW1zKTtcbiAgICByZXR1cm4gTWF0aC5tYXgoLi4ucHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHMpO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTogdm9pZCB7XG4gICAgaWYgKCFoZWF0QmFyUGxhbm5lZCkgcmV0dXJuO1xuICAgIGNvbnN0IHJlc2V0UGxhbm5lZEJhciA9ICgpID0+IHtcbiAgICAgIGhlYXRCYXJQbGFubmVkLnN0eWxlLndpZHRoID0gXCIwJVwiO1xuICAgIH07XG5cbiAgICBjb25zdCBzaGlwID0gc3RhdGUubWU7XG4gICAgaWYgKCFzaGlwIHx8ICFzaGlwLmhlYXQpIHtcbiAgICAgIHJlc2V0UGxhbm5lZEJhcigpO1xuICAgICAgZHVhbE1ldGVyQWxlcnQgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBwbGFubmVkID0gcHJvamVjdFBsYW5uZWRIZWF0KCk7XG4gICAgaWYgKHBsYW5uZWQgPT09IG51bGwpIHtcbiAgICAgIHJlc2V0UGxhbm5lZEJhcigpO1xuICAgICAgZHVhbE1ldGVyQWxlcnQgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBhY3R1YWwgPSBzaGlwLmhlYXQudmFsdWU7XG4gICAgY29uc3QgcGVyY2VudCA9IChwbGFubmVkIC8gc2hpcC5oZWF0Lm1heCkgKiAxMDA7XG4gICAgaGVhdEJhclBsYW5uZWQuc3R5bGUud2lkdGggPSBgJHtNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIHBlcmNlbnQpKX0lYDtcblxuICAgIGNvbnN0IGRpZmYgPSBwbGFubmVkIC0gYWN0dWFsO1xuICAgIGNvbnN0IHRocmVzaG9sZCA9IE1hdGgubWF4KDgsIHNoaXAuaGVhdC53YXJuQXQgKiAwLjEpO1xuICAgIGlmIChkaWZmID49IHRocmVzaG9sZCAmJiAhZHVhbE1ldGVyQWxlcnQpIHtcbiAgICAgIGR1YWxNZXRlckFsZXJ0ID0gdHJ1ZTtcbiAgICAgIGJ1cy5lbWl0KFwiaGVhdDpkdWFsTWV0ZXJEaXZlcmdlZFwiLCB7IHBsYW5uZWQsIGFjdHVhbCB9KTtcbiAgICB9IGVsc2UgaWYgKGRpZmYgPCB0aHJlc2hvbGQgKiAwLjYgJiYgZHVhbE1ldGVyQWxlcnQpIHtcbiAgICAgIGR1YWxNZXRlckFsZXJ0ID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU3BlZWRNYXJrZXIoKTogdm9pZCB7XG4gICAgY29uc3Qgc2hpcEhlYXQgPSBzdGF0ZS5tZT8uaGVhdDtcbiAgICBpZiAoc3BlZWRNYXJrZXIgJiYgc2hpcFNwZWVkU2xpZGVyICYmIHNoaXBIZWF0ICYmIHNoaXBIZWF0Lm1hcmtlclNwZWVkID4gMCkge1xuICAgICAgY29uc3QgbWluID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIubWluKTtcbiAgICAgIGNvbnN0IG1heCA9IHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyLm1heCk7XG4gICAgICBjb25zdCBtYXJrZXJTcGVlZCA9IHNoaXBIZWF0Lm1hcmtlclNwZWVkO1xuICAgICAgY29uc3QgcGVyY2VudCA9ICgobWFya2VyU3BlZWQgLSBtaW4pIC8gKG1heCAtIG1pbikpICogMTAwO1xuICAgICAgY29uc3QgY2xhbXBlZCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGVyY2VudCkpO1xuICAgICAgc3BlZWRNYXJrZXIuc3R5bGUubGVmdCA9IGAke2NsYW1wZWR9JWA7XG4gICAgICBzcGVlZE1hcmtlci50aXRsZSA9IGBIZWF0IG5ldXRyYWw6ICR7TWF0aC5yb3VuZChtYXJrZXJTcGVlZCl9IHVuaXRzL3NgO1xuICAgICAgc3BlZWRNYXJrZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2UgaWYgKHNwZWVkTWFya2VyKSB7XG4gICAgICBzcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgaWYgKG1pc3NpbGVTcGVlZE1hcmtlciAmJiBtaXNzaWxlU3BlZWRTbGlkZXIpIHtcbiAgICAgIGNvbnN0IGhlYXRQYXJhbXMgPSBzdGF0ZS5taXNzaWxlQ29uZmlnLmhlYXRQYXJhbXM7XG4gICAgICBjb25zdCBtYXJrZXJTcGVlZCA9XG4gICAgICAgIChoZWF0UGFyYW1zICYmIE51bWJlci5pc0Zpbml0ZShoZWF0UGFyYW1zLm1hcmtlclNwZWVkKSA/IGhlYXRQYXJhbXMubWFya2VyU3BlZWQgOiB1bmRlZmluZWQpID8/XG4gICAgICAgIChzaGlwSGVhdCAmJiBzaGlwSGVhdC5tYXJrZXJTcGVlZCA+IDAgPyBzaGlwSGVhdC5tYXJrZXJTcGVlZCA6IHVuZGVmaW5lZCk7XG5cbiAgICAgIGlmIChtYXJrZXJTcGVlZCAhPT0gdW5kZWZpbmVkICYmIG1hcmtlclNwZWVkID4gMCkge1xuICAgICAgICBjb25zdCBtaW4gPSBwYXJzZUZsb2F0KG1pc3NpbGVTcGVlZFNsaWRlci5taW4pO1xuICAgICAgICBjb25zdCBtYXggPSBwYXJzZUZsb2F0KG1pc3NpbGVTcGVlZFNsaWRlci5tYXgpO1xuICAgICAgICBjb25zdCBwZXJjZW50ID0gKChtYXJrZXJTcGVlZCAtIG1pbikgLyAobWF4IC0gbWluKSkgKiAxMDA7XG4gICAgICAgIGNvbnN0IGNsYW1wZWQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIHBlcmNlbnQpKTtcbiAgICAgICAgbWlzc2lsZVNwZWVkTWFya2VyLnN0eWxlLmxlZnQgPSBgJHtjbGFtcGVkfSVgO1xuICAgICAgICBtaXNzaWxlU3BlZWRNYXJrZXIudGl0bGUgPSBgSGVhdCBuZXV0cmFsOiAke01hdGgucm91bmQobWFya2VyU3BlZWQpfSB1bml0cy9zYDtcbiAgICAgICAgbWlzc2lsZVNwZWVkTWFya2VyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaXNzaWxlU3BlZWRNYXJrZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVN0YWxsT3ZlcmxheSgpOiB2b2lkIHtcbiAgICBjb25zdCBoZWF0ID0gc3RhdGUubWU/LmhlYXQ7XG4gICAgaWYgKCFoZWF0IHx8ICFzdGFsbE92ZXJsYXkpIHtcbiAgICAgIHN0YWxsQWN0aXZlID0gZmFsc2U7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgbm93ID1cbiAgICAgIHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSBcImZ1bmN0aW9uXCJcbiAgICAgICAgPyBwZXJmb3JtYW5jZS5ub3coKVxuICAgICAgICA6IERhdGUubm93KCk7XG5cbiAgICBjb25zdCBpc1N0YWxsZWQgPSBub3cgPCBoZWF0LnN0YWxsVW50aWxNcztcblxuICAgIGlmIChpc1N0YWxsZWQpIHtcbiAgICAgIHN0YWxsT3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICAgIGlmICghc3RhbGxBY3RpdmUpIHtcbiAgICAgICAgc3RhbGxBY3RpdmUgPSB0cnVlO1xuICAgICAgICBidXMuZW1pdChcImhlYXQ6c3RhbGxUcmlnZ2VyZWRcIiwgeyBzdGFsbFVudGlsOiBoZWF0LnN0YWxsVW50aWxNcyB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RhbGxPdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgICAgaWYgKHN0YWxsQWN0aXZlKSB7XG4gICAgICAgIHN0YWxsQWN0aXZlID0gZmFsc2U7XG4gICAgICAgIGJ1cy5lbWl0KFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiLCB7IHZhbHVlOiBoZWF0LnZhbHVlIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2FjaGVEb20sXG4gICAgYmluZFVJLFxuICAgIHNldEFjdGl2ZVRvb2wsXG4gICAgc2V0SW5wdXRDb250ZXh0LFxuICAgIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzLFxuICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUksXG4gICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSxcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scyxcbiAgICBzeW5jTWlzc2lsZVVJRnJvbVN0YXRlLFxuICAgIHVwZGF0ZUhlbHBPdmVybGF5LFxuICAgIHNldEhlbHBWaXNpYmxlLFxuICAgIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSxcbiAgICB1cGRhdGVNaXNzaWxlQ291bnREaXNwbGF5LFxuICAgIHVwZGF0ZUNyYWZ0VGltZXIsXG4gICAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycyxcbiAgICB1cGRhdGVQbGFubmVkSGVhdEJhcixcbiAgICB1cGRhdGVTcGVlZE1hcmtlcixcbiAgICB1cGRhdGVIZWF0QmFyLFxuICAgIHByb2plY3RQbGFubmVkSGVhdCxcbiAgICBnZXRDYW52YXMsXG4gICAgZ2V0Q29udGV4dCxcbiAgICBhZGp1c3RTaGlwU3BlZWQsXG4gICAgYWRqdXN0TWlzc2lsZUFncm8sXG4gICAgYWRqdXN0TWlzc2lsZVNwZWVkLFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lvbkh1ZCB7XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIE1pc3Npb25IdWRPcHRpb25zIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRNaXNzaW9uSHVkKHsgc3RhdGUsIGJ1cyB9OiBNaXNzaW9uSHVkT3B0aW9ucyk6IE1pc3Npb25IdWQge1xuICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3Npb24taHVkXCIpO1xuICBjb25zdCBiZWFjb25MYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lvbi1iZWFjb24tbGFiZWxcIik7XG4gIGNvbnN0IGhvbGRMYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lvbi1ob2xkLXRleHRcIik7XG5cbiAgaWYgKCFjb250YWluZXIgfHwgIWJlYWNvbkxhYmVsIHx8ICFob2xkTGFiZWwpIHtcbiAgICByZXR1cm4geyBkZXN0cm95KCkge30gfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlcigpOiB2b2lkIHtcbiAgICBjb25zdCBtaXNzaW9uID0gc3RhdGUubWlzc2lvbjtcbiAgICBpZiAoIW1pc3Npb24gfHwgIW1pc3Npb24uYWN0aXZlKSB7XG4gICAgICBjb250YWluZXIuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICAgIGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKFwiaW5zaWRlXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRvdGFsID0gbWlzc2lvbi5iZWFjb25zLmxlbmd0aCA+IDAgPyBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoIDogNDtcbiAgICBjb25zdCBjdXJyZW50SW5kZXggPSBNYXRoLm1pbihtaXNzaW9uLmJlYWNvbkluZGV4ICsgMSwgdG90YWwpO1xuICAgIGJlYWNvbkxhYmVsLnRleHRDb250ZW50ID0gYEJlYWNvbiAke2N1cnJlbnRJbmRleH0vJHt0b3RhbH1gO1xuXG4gICAgY29uc3QgcmVxdWlyZWQgPSBtaXNzaW9uLmhvbGRSZXF1aXJlZCB8fCAxMDtcbiAgICBjb25zdCBob2xkU2Vjb25kcyA9IE1hdGgubWF4KDAsIG1pc3Npb24uaG9sZEFjY3VtKTtcbiAgICBob2xkTGFiZWwudGV4dENvbnRlbnQgPSBgSG9sZDogJHtob2xkU2Vjb25kcy50b0ZpeGVkKDEpfXMgLyAke3JlcXVpcmVkLnRvRml4ZWQoMSl9c2A7XG5cbiAgICBjb25zdCBiZWFjb24gPSBtaXNzaW9uLmJlYWNvbnNbbWlzc2lvbi5iZWFjb25JbmRleF07XG4gICAgaWYgKGJlYWNvbiAmJiBzdGF0ZS5tZSkge1xuICAgICAgY29uc3QgZHggPSBzdGF0ZS5tZS54IC0gYmVhY29uLmN4O1xuICAgICAgY29uc3QgZHkgPSBzdGF0ZS5tZS55IC0gYmVhY29uLmN5O1xuICAgICAgY29uc3QgaW5zaWRlID0gZHggKiBkeCArIGR5ICogZHkgPD0gYmVhY29uLnJhZGl1cyAqIGJlYWNvbi5yYWRpdXM7XG4gICAgICBpZiAoaW5zaWRlKSB7XG4gICAgICAgIGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwiaW5zaWRlXCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnNpZGVcIik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKFwiaW5zaWRlXCIpO1xuICAgIH1cblxuICAgIGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICB9XG5cbiAgcmVuZGVyKCk7XG4gIGNvbnN0IHVuc3VicyA9IFtcbiAgICBidXMub24oXCJzdGF0ZTp1cGRhdGVkXCIsICgpID0+IHJlbmRlcigpKSxcbiAgICBidXMub24oXCJtaXNzaW9uOnN0YXJ0XCIsICgpID0+IHJlbmRlcigpKSxcbiAgICBidXMub24oXCJtaXNzaW9uOmJlYWNvbi1sb2NrZWRcIiwgKCkgPT4gcmVuZGVyKCkpLFxuICAgIGJ1cy5vbihcIm1pc3Npb246Y29tcGxldGVkXCIsICgpID0+IHJlbmRlcigpKSxcbiAgXTtcblxuICByZXR1cm4ge1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICBmb3IgKGNvbnN0IHVuc3ViIG9mIHVuc3Vicykge1xuICAgICAgICB1bnN1YigpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHsgZ2V0QXBwcm94U2VydmVyTm93LCBzZW5kTWVzc2FnZSB9IGZyb20gXCIuL25ldFwiO1xuaW1wb3J0IHR5cGUgeyBBcHBTdGF0ZSwgVUlTdGF0ZSB9IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQgeyBjcmVhdGVDYW1lcmEgfSBmcm9tIFwiLi9nYW1lL2NhbWVyYVwiO1xuaW1wb3J0IHsgY3JlYXRlSW5wdXQgfSBmcm9tIFwiLi9nYW1lL2lucHV0XCI7XG5pbXBvcnQgeyBjcmVhdGVMb2dpYyB9IGZyb20gXCIuL2dhbWUvbG9naWNcIjtcbmltcG9ydCB7IGNyZWF0ZVJlbmRlcmVyIH0gZnJvbSBcIi4vZ2FtZS9yZW5kZXJcIjtcbmltcG9ydCB7IGNyZWF0ZVVJIH0gZnJvbSBcIi4vZ2FtZS91aVwiO1xuaW1wb3J0IHsgbW91bnRNaXNzaW9uSHVkIH0gZnJvbSBcIi4vbWlzc2lvbi9odWRcIjtcblxuaW50ZXJmYWNlIEluaXRHYW1lT3B0aW9ucyB7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbn1cblxuaW50ZXJmYWNlIEdhbWVDb250cm9sbGVyIHtcbiAgb25TdGF0ZVVwZGF0ZWQoKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRHYW1lKHsgc3RhdGUsIHVpU3RhdGUsIGJ1cyB9OiBJbml0R2FtZU9wdGlvbnMpOiBHYW1lQ29udHJvbGxlciB7XG4gIGNvbnN0IGNhbnZhc0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdlwiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gIGlmICghY2FudmFzRWwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW52YXMgZWxlbWVudCAjY3Ygbm90IGZvdW5kXCIpO1xuICB9XG5cbiAgY29uc3QgY2FtZXJhID0gY3JlYXRlQ2FtZXJhKHsgY2FudmFzOiBjYW52YXNFbCwgc3RhdGUsIHVpU3RhdGUgfSk7XG4gIGNvbnN0IGxvZ2ljID0gY3JlYXRlTG9naWMoe1xuICAgIHN0YXRlLFxuICAgIHVpU3RhdGUsXG4gICAgYnVzLFxuICAgIHNlbmRNZXNzYWdlLFxuICAgIGdldEFwcHJveFNlcnZlck5vdyxcbiAgICBjYW1lcmEsXG4gIH0pO1xuICBjb25zdCB1aSA9IGNyZWF0ZVVJKHtcbiAgICBzdGF0ZSxcbiAgICB1aVN0YXRlLFxuICAgIGJ1cyxcbiAgICBsb2dpYyxcbiAgICBjYW1lcmEsXG4gICAgc2VuZE1lc3NhZ2UsXG4gICAgZ2V0QXBwcm94U2VydmVyTm93LFxuICB9KTtcblxuICBjb25zdCB7IGNhbnZhczogY2FjaGVkQ2FudmFzLCBjdHg6IGNhY2hlZEN0eCB9ID0gdWkuY2FjaGVEb20oKTtcbiAgY29uc3QgcmVuZGVyQ2FudmFzID0gY2FjaGVkQ2FudmFzID8/IGNhbnZhc0VsO1xuICBjb25zdCByZW5kZXJDdHggPSBjYWNoZWRDdHggPz8gcmVuZGVyQ2FudmFzLmdldENvbnRleHQoXCIyZFwiKTtcbiAgaWYgKCFyZW5kZXJDdHgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmFibGUgdG8gYWNxdWlyZSAyRCByZW5kZXJpbmcgY29udGV4dFwiKTtcbiAgfVxuXG4gIGNvbnN0IHJlbmRlcmVyID0gY3JlYXRlUmVuZGVyZXIoe1xuICAgIGNhbnZhczogcmVuZGVyQ2FudmFzLFxuICAgIGN0eDogcmVuZGVyQ3R4LFxuICAgIHN0YXRlLFxuICAgIHVpU3RhdGUsXG4gICAgY2FtZXJhLFxuICAgIGxvZ2ljLFxuICB9KTtcblxuICBjb25zdCBpbnB1dCA9IGNyZWF0ZUlucHV0KHtcbiAgICBjYW52YXM6IHJlbmRlckNhbnZhcyxcbiAgICB1aSxcbiAgICBsb2dpYyxcbiAgICBjYW1lcmEsXG4gICAgc3RhdGUsXG4gICAgdWlTdGF0ZSxcbiAgICBidXMsXG4gICAgc2VuZE1lc3NhZ2UsXG4gIH0pO1xuXG4gIHVpLmJpbmRVSSgpO1xuICBpbnB1dC5iaW5kSW5wdXQoKTtcbiAgbG9naWMuZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIHVpLnN5bmNNaXNzaWxlVUlGcm9tU3RhdGUoKTtcbiAgdWkudXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbiAgdWkucmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICB1aS5yZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIHVpLnVwZGF0ZUhlbHBPdmVybGF5KCk7XG4gIHVpLnVwZGF0ZVN0YXR1c0luZGljYXRvcnMoKTtcbiAgdWkudXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gIHVpLnVwZGF0ZU1pc3NpbGVDb3VudERpc3BsYXkoKTtcblxuICBtb3VudE1pc3Npb25IdWQoeyBzdGF0ZSwgYnVzIH0pO1xuXG4gIGxldCBsYXN0TG9vcFRzOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBsb29wKHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodGltZXN0YW1wKSkge1xuICAgICAgdGltZXN0YW1wID0gbGFzdExvb3BUcyA/PyAwO1xuICAgIH1cblxuICAgIGxldCBkdFNlY29uZHMgPSAwO1xuICAgIGlmIChsYXN0TG9vcFRzICE9PSBudWxsKSB7XG4gICAgICBkdFNlY29uZHMgPSAodGltZXN0YW1wIC0gbGFzdExvb3BUcykgLyAxMDAwO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPCAwKSB7XG4gICAgICAgIGR0U2Vjb25kcyA9IDA7XG4gICAgICB9XG4gICAgfVxuICAgIGxhc3RMb29wVHMgPSB0aW1lc3RhbXA7XG5cbiAgICBsb2dpYy51cGRhdGVSb3V0ZUFuaW1hdGlvbnMoZHRTZWNvbmRzKTtcbiAgICByZW5kZXJlci5kcmF3U2NlbmUoKTtcbiAgICB1aS51cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgICB1aS51cGRhdGVDcmFmdFRpbWVyKCk7XG5cbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG4gIH1cblxuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG5cbiAgcmV0dXJuIHtcbiAgICBvblN0YXRlVXBkYXRlZCgpIHtcbiAgICAgIGxvZ2ljLmVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgdWkuc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICAgICAgdWkucmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgdWkucmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICAgICAgdWkudXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gICAgICB1aS51cGRhdGVNaXNzaWxlQ291bnREaXNwbGF5KCk7XG4gICAgICB1aS51cGRhdGVDcmFmdFRpbWVyKCk7XG4gICAgICB1aS51cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk7XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBjbGFtcCB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuXG5pbnRlcmZhY2UgSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMge1xuICB0YXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGJvZHk6IHN0cmluZztcbiAgc3RlcEluZGV4OiBudW1iZXI7XG4gIHN0ZXBDb3VudDogbnVtYmVyO1xuICBzaG93TmV4dDogYm9vbGVhbjtcbiAgbmV4dExhYmVsPzogc3RyaW5nO1xuICBvbk5leHQ/OiAoKSA9PiB2b2lkO1xuICBzaG93U2tpcDogYm9vbGVhbjtcbiAgc2tpcExhYmVsPzogc3RyaW5nO1xuICBvblNraXA/OiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhpZ2hsaWdodGVyIHtcbiAgc2hvdyhvcHRpb25zOiBIaWdobGlnaHRDb250ZW50T3B0aW9ucyk6IHZvaWQ7XG4gIGhpZGUoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5jb25zdCBTVFlMRV9JRCA9IFwidHV0b3JpYWwtb3ZlcmxheS1zdHlsZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSGlnaGxpZ2h0ZXIoKTogSGlnaGxpZ2h0ZXIge1xuICBlbnN1cmVTdHlsZXMoKTtcblxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgb3ZlcmxheS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlcIjtcbiAgb3ZlcmxheS5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxpdmVcIiwgXCJwb2xpdGVcIik7XG5cbiAgY29uc3Qgc2NyaW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzY3JpbS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3NjcmltXCI7XG5cbiAgY29uc3QgaGlnaGxpZ2h0Qm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGlnaGxpZ2h0Qm94LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9faGlnaGxpZ2h0XCI7XG5cbiAgY29uc3QgdG9vbHRpcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRvb2x0aXAuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X190b29sdGlwXCI7XG5cbiAgY29uc3QgcHJvZ3Jlc3MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBwcm9ncmVzcy5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzXCI7XG5cbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaDNcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fdGl0bGVcIjtcblxuICBjb25zdCBib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XG4gIGJvZHkuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19ib2R5XCI7XG5cbiAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zXCI7XG5cbiAgY29uc3Qgc2tpcEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIHNraXBCdG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIHNraXBCdG4uY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19idG4gdHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdFwiO1xuICBza2lwQnRuLnRleHRDb250ZW50ID0gXCJTa2lwXCI7XG5cbiAgY29uc3QgbmV4dEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIG5leHRCdG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIG5leHRCdG4uY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19idG4gdHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5XCI7XG4gIG5leHRCdG4udGV4dENvbnRlbnQgPSBcIk5leHRcIjtcblxuICBhY3Rpb25zLmFwcGVuZChza2lwQnRuLCBuZXh0QnRuKTtcbiAgdG9vbHRpcC5hcHBlbmQocHJvZ3Jlc3MsIHRpdGxlLCBib2R5LCBhY3Rpb25zKTtcbiAgb3ZlcmxheS5hcHBlbmQoc2NyaW0sIGhpZ2hsaWdodEJveCwgdG9vbHRpcCk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgbGV0IGN1cnJlbnRUYXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCB2aXNpYmxlID0gZmFsc2U7XG4gIGxldCByZXNpemVPYnNlcnZlcjogUmVzaXplT2JzZXJ2ZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IGZyYW1lSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IG9uTmV4dDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCBvblNraXA6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIHNjaGVkdWxlVXBkYXRlKCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSkgcmV0dXJuO1xuICAgIGlmIChmcmFtZUhhbmRsZSAhPT0gbnVsbCkgcmV0dXJuO1xuICAgIGZyYW1lSGFuZGxlID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICBmcmFtZUhhbmRsZSA9IG51bGw7XG4gICAgICB1cGRhdGVQb3NpdGlvbigpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlUG9zaXRpb24oKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG5cbiAgICBpZiAoY3VycmVudFRhcmdldCkge1xuICAgICAgY29uc3QgcmVjdCA9IGN1cnJlbnRUYXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBjb25zdCBwYWRkaW5nID0gMTI7XG4gICAgICBjb25zdCB3aWR0aCA9IE1hdGgubWF4KDAsIHJlY3Qud2lkdGggKyBwYWRkaW5nICogMik7XG4gICAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1heCgwLCByZWN0LmhlaWdodCArIHBhZGRpbmcgKiAyKTtcbiAgICAgIGNvbnN0IGxlZnQgPSByZWN0LmxlZnQgLSBwYWRkaW5nO1xuICAgICAgY29uc3QgdG9wID0gcmVjdC50b3AgLSBwYWRkaW5nO1xuXG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKGxlZnQpfXB4LCAke01hdGgucm91bmQodG9wKX1weClgO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLndpZHRoID0gYCR7TWF0aC5yb3VuZCh3aWR0aCl9cHhgO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLmhlaWdodCA9IGAke01hdGgucm91bmQoaGVpZ2h0KX1weGA7XG5cbiAgICAgIHRvb2x0aXAuc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJ2aXNpYmxlXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLm1heFdpZHRoID0gYG1pbigzNDBweCwgJHtNYXRoLm1heCgyNjAsIHdpbmRvdy5pbm5lcldpZHRoIC0gMzIpfXB4KWA7XG4gICAgICBjb25zdCB0b29sdGlwV2lkdGggPSB0b29sdGlwLm9mZnNldFdpZHRoO1xuICAgICAgY29uc3QgdG9vbHRpcEhlaWdodCA9IHRvb2x0aXAub2Zmc2V0SGVpZ2h0O1xuICAgICAgbGV0IHRvb2x0aXBUb3AgPSByZWN0LmJvdHRvbSArIDE4O1xuICAgICAgaWYgKHRvb2x0aXBUb3AgKyB0b29sdGlwSGVpZ2h0ID4gd2luZG93LmlubmVySGVpZ2h0IC0gMjApIHtcbiAgICAgICAgdG9vbHRpcFRvcCA9IE1hdGgubWF4KDIwLCByZWN0LnRvcCAtIHRvb2x0aXBIZWlnaHQgLSAxOCk7XG4gICAgICB9XG4gICAgICBsZXQgdG9vbHRpcExlZnQgPSByZWN0LmxlZnQgKyByZWN0LndpZHRoIC8gMiAtIHRvb2x0aXBXaWR0aCAvIDI7XG4gICAgICB0b29sdGlwTGVmdCA9IGNsYW1wKHRvb2x0aXBMZWZ0LCAyMCwgd2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGggLSAyMCk7XG4gICAgICB0b29sdGlwLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHRvb2x0aXBMZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvb2x0aXBUb3ApfXB4KWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUud2lkdGggPSBcIjBweFwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLmhlaWdodCA9IFwiMHB4XCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQod2luZG93LmlubmVyV2lkdGggLyAyKX1weCwgJHtNYXRoLnJvdW5kKHdpbmRvdy5pbm5lckhlaWdodCAvIDIpfXB4KWA7XG5cbiAgICAgIHRvb2x0aXAuc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJ2aXNpYmxlXCI7XG4gICAgICBjb25zdCB0b29sdGlwV2lkdGggPSB0b29sdGlwLm9mZnNldFdpZHRoO1xuICAgICAgY29uc3QgdG9vbHRpcEhlaWdodCA9IHRvb2x0aXAub2Zmc2V0SGVpZ2h0O1xuICAgICAgY29uc3QgdG9vbHRpcExlZnQgPSBjbGFtcCgod2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGgpIC8gMiwgMjAsIHdpbmRvdy5pbm5lcldpZHRoIC0gdG9vbHRpcFdpZHRoIC0gMjApO1xuICAgICAgY29uc3QgdG9vbHRpcFRvcCA9IGNsYW1wKCh3aW5kb3cuaW5uZXJIZWlnaHQgLSB0b29sdGlwSGVpZ2h0KSAvIDIsIDIwLCB3aW5kb3cuaW5uZXJIZWlnaHQgLSB0b29sdGlwSGVpZ2h0IC0gMjApO1xuICAgICAgdG9vbHRpcC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh0b29sdGlwTGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b29sdGlwVG9wKX1weClgO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaExpc3RlbmVycygpOiB2b2lkIHtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBzY2hlZHVsZVVwZGF0ZSwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIHNjaGVkdWxlVXBkYXRlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBkZXRhY2hMaXN0ZW5lcnMoKTogdm9pZCB7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgc2NoZWR1bGVVcGRhdGUpO1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIHNjaGVkdWxlVXBkYXRlKTtcbiAgICBpZiAoZnJhbWVIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZShmcmFtZUhhbmRsZSk7XG4gICAgICBmcmFtZUhhbmRsZSA9IG51bGw7XG4gICAgfVxuICAgIGlmIChyZXNpemVPYnNlcnZlcikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHNraXBCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgb25Ta2lwPy4oKTtcbiAgfSk7XG5cbiAgbmV4dEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBvbk5leHQ/LigpO1xuICB9KTtcblxuICBmdW5jdGlvbiByZW5kZXJUb29sdGlwKG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZCB7XG4gICAgY29uc3QgeyBzdGVwQ291bnQsIHN0ZXBJbmRleCwgdGl0bGU6IG9wdGlvblRpdGxlLCBib2R5OiBvcHRpb25Cb2R5LCBzaG93TmV4dCwgbmV4dExhYmVsLCBzaG93U2tpcCwgc2tpcExhYmVsIH0gPSBvcHRpb25zO1xuXG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShzdGVwQ291bnQpICYmIHN0ZXBDb3VudCA+IDApIHtcbiAgICAgIHByb2dyZXNzLnRleHRDb250ZW50ID0gYFN0ZXAgJHtzdGVwSW5kZXggKyAxfSBvZiAke3N0ZXBDb3VudH1gO1xuICAgICAgcHJvZ3Jlc3Muc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgcHJvZ3Jlc3MudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgcHJvZ3Jlc3Muc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIGlmIChvcHRpb25UaXRsZSAmJiBvcHRpb25UaXRsZS50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgdGl0bGUudGV4dENvbnRlbnQgPSBvcHRpb25UaXRsZTtcbiAgICAgIHRpdGxlLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRpdGxlLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIHRpdGxlLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBib2R5LnRleHRDb250ZW50ID0gb3B0aW9uQm9keTtcblxuICAgIG9uTmV4dCA9IHNob3dOZXh0ID8gb3B0aW9ucy5vbk5leHQgPz8gbnVsbCA6IG51bGw7XG4gICAgaWYgKHNob3dOZXh0KSB7XG4gICAgICBuZXh0QnRuLnRleHRDb250ZW50ID0gbmV4dExhYmVsID8/IFwiTmV4dFwiO1xuICAgICAgbmV4dEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJpbmxpbmUtZmxleFwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0QnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBvblNraXAgPSBzaG93U2tpcCA/IG9wdGlvbnMub25Ta2lwID8/IG51bGwgOiBudWxsO1xuICAgIGlmIChzaG93U2tpcCkge1xuICAgICAgc2tpcEJ0bi50ZXh0Q29udGVudCA9IHNraXBMYWJlbCA/PyBcIlNraXBcIjtcbiAgICAgIHNraXBCdG4uc3R5bGUuZGlzcGxheSA9IFwiaW5saW5lLWZsZXhcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgc2tpcEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvdyhvcHRpb25zOiBIaWdobGlnaHRDb250ZW50T3B0aW9ucyk6IHZvaWQge1xuICAgIHZpc2libGUgPSB0cnVlO1xuICAgIGN1cnJlbnRUYXJnZXQgPSBvcHRpb25zLnRhcmdldCA/PyBudWxsO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gICAgcmVuZGVyVG9vbHRpcChvcHRpb25zKTtcbiAgICBpZiAocmVzaXplT2JzZXJ2ZXIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKGN1cnJlbnRUYXJnZXQgJiYgdHlwZW9mIFJlc2l6ZU9ic2VydmVyICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcigoKSA9PiBzY2hlZHVsZVVwZGF0ZSgpKTtcbiAgICAgIHJlc2l6ZU9ic2VydmVyLm9ic2VydmUoY3VycmVudFRhcmdldCk7XG4gICAgfVxuICAgIGF0dGFjaExpc3RlbmVycygpO1xuICAgIHNjaGVkdWxlVXBkYXRlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBoaWRlKCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSkgcmV0dXJuO1xuICAgIHZpc2libGUgPSBmYWxzZTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIHRvb2x0aXAuc3R5bGUudmlzaWJpbGl0eSA9IFwiaGlkZGVuXCI7XG4gICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICBkZXRhY2hMaXN0ZW5lcnMoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgaGlkZSgpO1xuICAgIG92ZXJsYXkucmVtb3ZlKCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNob3csXG4gICAgaGlkZSxcbiAgICBkZXN0cm95LFxuICB9O1xufVxuXG5mdW5jdGlvbiBlbnN1cmVTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gIHN0eWxlLmlkID0gU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC50dXRvcmlhbC1vdmVybGF5IHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGluc2V0OiAwO1xuICAgICAgei1pbmRleDogNTA7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5LnZpc2libGUge1xuICAgICAgZGlzcGxheTogYmxvY2s7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19zY3JpbSB7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICBpbnNldDogMDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2hpZ2hsaWdodCB7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNHB4O1xuICAgICAgYm9yZGVyOiAycHggc29saWQgcmdiYSg1NiwgMTg5LCAyNDgsIDAuOTUpO1xuICAgICAgYm94LXNoYWRvdzogMCAwIDAgMnB4IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjI1KSwgMCAwIDI0cHggcmdiYSgzNCwgMjExLCAyMzgsIDAuMjUpO1xuICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMThzIGVhc2UsIHdpZHRoIDAuMThzIGVhc2UsIGhlaWdodCAwLjE4cyBlYXNlLCBvcGFjaXR5IDAuMThzIGVhc2U7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIG9wYWNpdHk6IDA7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X190b29sdGlwIHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIG1pbi13aWR0aDogMjQwcHg7XG4gICAgICBtYXgtd2lkdGg6IG1pbigzNDBweCwgY2FsYygxMDB2dyAtIDMycHgpKTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTUsIDIzLCA0MiwgMC45NSk7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTZweDtcbiAgICAgIHBhZGRpbmc6IDE2cHggMThweDtcbiAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgYm94LXNoYWRvdzogMCAxMnB4IDMycHggcmdiYSgxNSwgMjMsIDQyLCAwLjU1KTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICAgIHZpc2liaWxpdHk6IGhpZGRlbjtcbiAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlKDBweCwgMHB4KTtcbiAgICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE4cyBlYXNlLCBvcGFjaXR5IDAuMThzIGVhc2U7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19wcm9ncmVzcyB7XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wOGVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuNzUpO1xuICAgICAgbWFyZ2luOiAwIDAgOHB4O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fdGl0bGUge1xuICAgICAgbWFyZ2luOiAwIDAgOHB4O1xuICAgICAgZm9udC1zaXplOiAxNXB4O1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDRlbTtcbiAgICAgIGNvbG9yOiAjZjFmNWY5O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYm9keSB7XG4gICAgICBtYXJnaW46IDAgMCAxNHB4O1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuNTtcbiAgICAgIGNvbG9yOiAjY2JkNWY1O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYWN0aW9ucyB7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZ2FwOiAxMHB4O1xuICAgICAganVzdGlmeS1jb250ZW50OiBmbGV4LWVuZDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0biB7XG4gICAgICBmb250OiBpbmhlcml0O1xuICAgICAgcGFkZGluZzogNnB4IDE0cHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA5OTlweDtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnkge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjUpO1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC41NSk7XG4gICAgICBjb2xvcjogI2Y4ZmFmYztcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeTpob3ZlciB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4zNSk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0IHtcbiAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgY29sb3I6IHJnYmEoMjAzLCAyMTMsIDIyNSwgMC45KTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3Q6aG92ZXIge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDIwMywgMjEzLCAyMjUsIDAuNTUpO1xuICAgIH1cbiAgICBAbWVkaWEgKG1heC13aWR0aDogNzY4cHgpIHtcbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X190b29sdGlwIHtcbiAgICAgICAgbWluLXdpZHRoOiAyMDBweDtcbiAgICAgICAgbWF4LXdpZHRoOiBtaW4oMzIwcHgsIGNhbGMoMTAwdncgLSAyNHB4KSk7XG4gICAgICAgIHBhZGRpbmc6IDEwcHggMTJweDtcbiAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgZmxleC1kaXJlY3Rpb246IHJvdztcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgZ2FwOiAxMnB4O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzIHtcbiAgICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3RpdGxlIHtcbiAgICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2JvZHkge1xuICAgICAgICBtYXJnaW46IDA7XG4gICAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgICAgZmxleDogMTtcbiAgICAgICAgbGluZS1oZWlnaHQ6IDEuNDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zIHtcbiAgICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgICAgZ2FwOiA2cHg7XG4gICAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0biB7XG4gICAgICAgIHBhZGRpbmc6IDVweCAxMHB4O1xuICAgICAgICBmb250LXNpemU6IDEwcHg7XG4gICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICB9XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cbiIsICJjb25zdCBTVE9SQUdFX1BSRUZJWCA9IFwibHNkOnR1dG9yaWFsOlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsUHJvZ3Jlc3Mge1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgY29tcGxldGVkOiBib29sZWFuO1xuICB1cGRhdGVkQXQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZ2V0U3RvcmFnZSgpOiBTdG9yYWdlIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIgfHwgIXdpbmRvdy5sb2NhbFN0b3JhZ2UpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkUHJvZ3Jlc3MoaWQ6IHN0cmluZyk6IFR1dG9yaWFsUHJvZ3Jlc3MgfCBudWxsIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSBzdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCk7XG4gICAgaWYgKCFyYXcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBUdXRvcmlhbFByb2dyZXNzO1xuICAgIGlmIChcbiAgICAgIHR5cGVvZiBwYXJzZWQgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkID09PSBudWxsIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnN0ZXBJbmRleCAhPT0gXCJudW1iZXJcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5jb21wbGV0ZWQgIT09IFwiYm9vbGVhblwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnVwZGF0ZWRBdCAhPT0gXCJudW1iZXJcIlxuICAgICkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZWQ7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlUHJvZ3Jlc3MoaWQ6IHN0cmluZywgcHJvZ3Jlc3M6IFR1dG9yaWFsUHJvZ3Jlc3MpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfUFJFRklYICsgaWQsIEpTT04uc3RyaW5naWZ5KHByb2dyZXNzKSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIGlnbm9yZSBzdG9yYWdlIGZhaWx1cmVzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyUHJvZ3Jlc3MoaWQ6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnJlbW92ZUl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIGlnbm9yZSBzdG9yYWdlIGZhaWx1cmVzXG4gIH1cbn1cbiIsICJleHBvcnQgdHlwZSBSb2xlSWQgPVxuICB8IFwiY2FudmFzXCJcbiAgfCBcInNoaXBTZXRcIlxuICB8IFwic2hpcFNlbGVjdFwiXG4gIHwgXCJzaGlwRGVsZXRlXCJcbiAgfCBcInNoaXBDbGVhclwiXG4gIHwgXCJzaGlwU3BlZWRTbGlkZXJcIlxuICB8IFwiaGVhdEJhclwiXG4gIHwgXCJzcGVlZE1hcmtlclwiXG4gIHwgXCJtaXNzaWxlU2V0XCJcbiAgfCBcIm1pc3NpbGVTZWxlY3RcIlxuICB8IFwibWlzc2lsZURlbGV0ZVwiXG4gIHwgXCJtaXNzaWxlU3BlZWRTbGlkZXJcIlxuICB8IFwibWlzc2lsZUFncm9TbGlkZXJcIlxuICB8IFwibWlzc2lsZUFkZFJvdXRlXCJcbiAgfCBcIm1pc3NpbGVMYXVuY2hcIlxuICB8IFwicm91dGVQcmV2XCJcbiAgfCBcInJvdXRlTmV4dFwiXG4gIHwgXCJoZWxwVG9nZ2xlXCJcbiAgfCBcInR1dG9yaWFsU3RhcnRcIlxuICB8IFwic3Bhd25Cb3RcIjtcblxuZXhwb3J0IHR5cGUgUm9sZVJlc29sdmVyID0gKCkgPT4gSFRNTEVsZW1lbnQgfCBudWxsO1xuXG5leHBvcnQgdHlwZSBSb2xlc01hcCA9IFJlY29yZDxSb2xlSWQsIFJvbGVSZXNvbHZlcj47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSb2xlcygpOiBSb2xlc01hcCB7XG4gIHJldHVybiB7XG4gICAgY2FudmFzOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImN2XCIpLFxuICAgIHNoaXBTZXQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZXRcIiksXG4gICAgc2hpcFNlbGVjdDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSxcbiAgICBzaGlwRGVsZXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtZGVsZXRlXCIpLFxuICAgIHNoaXBDbGVhcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNsZWFyXCIpLFxuICAgIHNoaXBTcGVlZFNsaWRlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXNsaWRlclwiKSxcbiAgICBoZWF0QmFyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlYXQtYmFyLWNvbnRhaW5lclwiKSxcbiAgICBzcGVlZE1hcmtlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGVlZC1tYXJrZXJcIiksXG4gICAgbWlzc2lsZVNldDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSxcbiAgICBtaXNzaWxlU2VsZWN0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2VsZWN0XCIpLFxuICAgIG1pc3NpbGVEZWxldGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1kZWxldGVcIiksXG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtc2xpZGVyXCIpLFxuICAgIG1pc3NpbGVBZ3JvU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1zbGlkZXJcIiksXG4gICAgbWlzc2lsZUFkZFJvdXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWRkLXJvdXRlXCIpLFxuICAgIG1pc3NpbGVMYXVuY2g6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2hcIiksXG4gICAgcm91dGVQcmV2OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIiksXG4gICAgcm91dGVOZXh0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW5leHRcIiksXG4gICAgaGVscFRvZ2dsZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSxcbiAgICB0dXRvcmlhbFN0YXJ0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInR1dG9yaWFsLXN0YXJ0XCIpLFxuICAgIHNwYXduQm90OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdFwiKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJvbGVFbGVtZW50KHJvbGVzOiBSb2xlc01hcCwgcm9sZTogUm9sZUlkIHwgbnVsbCB8IHVuZGVmaW5lZCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGlmICghcm9sZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJlc29sdmVyID0gcm9sZXNbcm9sZV07XG4gIHJldHVybiByZXNvbHZlciA/IHJlc29sdmVyKCkgOiBudWxsO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMsIEV2ZW50S2V5IH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlSGlnaGxpZ2h0ZXIsIHR5cGUgSGlnaGxpZ2h0ZXIgfSBmcm9tIFwiLi9oaWdobGlnaHRcIjtcbmltcG9ydCB7IGNsZWFyUHJvZ3Jlc3MsIGxvYWRQcm9ncmVzcywgc2F2ZVByb2dyZXNzIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuaW1wb3J0IHsgZ2V0Um9sZUVsZW1lbnQsIHR5cGUgUm9sZUlkLCB0eXBlIFJvbGVzTWFwIH0gZnJvbSBcIi4vcm9sZXNcIjtcblxuZXhwb3J0IHR5cGUgU3RlcEFkdmFuY2UgPVxuICB8IHtcbiAgICAgIGtpbmQ6IFwiZXZlbnRcIjtcbiAgICAgIGV2ZW50OiBFdmVudEtleTtcbiAgICAgIHdoZW4/OiAocGF5bG9hZDogdW5rbm93bikgPT4gYm9vbGVhbjtcbiAgICAgIGNoZWNrPzogKCkgPT4gYm9vbGVhbjtcbiAgICB9XG4gIHwge1xuICAgICAga2luZDogXCJtYW51YWxcIjtcbiAgICAgIG5leHRMYWJlbD86IHN0cmluZztcbiAgICB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsU3RlcCB7XG4gIGlkOiBzdHJpbmc7XG4gIHRhcmdldDogUm9sZUlkIHwgKCgpID0+IEhUTUxFbGVtZW50IHwgbnVsbCkgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBhZHZhbmNlOiBTdGVwQWR2YW5jZTtcbiAgb25FbnRlcj86ICgpID0+IHZvaWQ7XG4gIG9uRXhpdD86ICgpID0+IHZvaWQ7XG4gIGFsbG93U2tpcD86IGJvb2xlYW47XG4gIHNraXBMYWJlbD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEVuZ2luZU9wdGlvbnMge1xuICBpZDogc3RyaW5nO1xuICBidXM6IEV2ZW50QnVzO1xuICByb2xlczogUm9sZXNNYXA7XG4gIHN0ZXBzOiBUdXRvcmlhbFN0ZXBbXTtcbn1cblxuaW50ZXJmYWNlIFN0YXJ0T3B0aW9ucyB7XG4gIHJlc3VtZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxFbmdpbmUge1xuICBzdGFydChvcHRpb25zPzogU3RhcnRPcHRpb25zKTogdm9pZDtcbiAgcmVzdGFydCgpOiB2b2lkO1xuICBzdG9wKCk6IHZvaWQ7XG4gIGlzUnVubmluZygpOiBib29sZWFuO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUdXRvcmlhbEVuZ2luZSh7IGlkLCBidXMsIHJvbGVzLCBzdGVwcyB9OiBFbmdpbmVPcHRpb25zKTogVHV0b3JpYWxFbmdpbmUge1xuICBjb25zdCBoaWdobGlnaHRlcjogSGlnaGxpZ2h0ZXIgPSBjcmVhdGVIaWdobGlnaHRlcigpO1xuICBsZXQgcnVubmluZyA9IGZhbHNlO1xuICBsZXQgcGF1c2VkID0gZmFsc2U7XG4gIGxldCBjdXJyZW50SW5kZXggPSAtMTtcbiAgbGV0IGN1cnJlbnRTdGVwOiBUdXRvcmlhbFN0ZXAgfCBudWxsID0gbnVsbDtcbiAgbGV0IGNsZWFudXBDdXJyZW50OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IHJlbmRlckN1cnJlbnQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgbGFzdFNhdmVkQ29tcGxldGVkID0gZmFsc2U7XG4gIGxldCBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcblxuICBjb25zdCBwZXJzaXN0ZW50TGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuXG4gIHBlcnNpc3RlbnRMaXN0ZW5lcnMucHVzaChcbiAgICBidXMub24oXCJoZWxwOnZpc2libGVDaGFuZ2VkXCIsICh7IHZpc2libGUgfSkgPT4ge1xuICAgICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgICBwYXVzZWQgPSBCb29sZWFuKHZpc2libGUpO1xuICAgICAgaWYgKHBhdXNlZCkge1xuICAgICAgICBoaWdobGlnaHRlci5oaWRlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZW5kZXJDdXJyZW50Py4oKTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcblxuICBmdW5jdGlvbiByZXNvbHZlVGFyZ2V0KHN0ZXA6IFR1dG9yaWFsU3RlcCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gICAgaWYgKCFzdGVwLnRhcmdldCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygc3RlcC50YXJnZXQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgcmV0dXJuIHN0ZXAudGFyZ2V0KCk7XG4gICAgfVxuICAgIHJldHVybiBnZXRSb2xlRWxlbWVudChyb2xlcywgc3RlcC50YXJnZXQpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2xhbXBJbmRleChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShpbmRleCkgfHwgaW5kZXggPCAwKSByZXR1cm4gMDtcbiAgICBpZiAoaW5kZXggPj0gc3RlcHMubGVuZ3RoKSByZXR1cm4gc3RlcHMubGVuZ3RoIC0gMTtcbiAgICByZXR1cm4gTWF0aC5mbG9vcihpbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTdGVwKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gc3RlcHMubGVuZ3RoKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cblxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG5cbiAgICBjdXJyZW50SW5kZXggPSBpbmRleDtcbiAgICBjb25zdCBzdGVwID0gc3RlcHNbaW5kZXhdO1xuICAgIGN1cnJlbnRTdGVwID0gc3RlcDtcblxuICAgIHBlcnNpc3RQcm9ncmVzcyhpbmRleCwgZmFsc2UpO1xuXG4gICAgYnVzLmVtaXQoXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiLCB7IGlkLCBzdGVwSW5kZXg6IGluZGV4LCB0b3RhbDogc3RlcHMubGVuZ3RoIH0pO1xuICAgIHN0ZXAub25FbnRlcj8uKCk7XG5cbiAgICBjb25zdCBhbGxvd1NraXAgPSBzdGVwLmFsbG93U2tpcCAhPT0gZmFsc2U7XG4gICAgY29uc3QgcmVuZGVyID0gKCk6IHZvaWQgPT4ge1xuICAgICAgaWYgKCFydW5uaW5nIHx8IHBhdXNlZCkgcmV0dXJuO1xuICAgICAgaGlnaGxpZ2h0ZXIuc2hvdyh7XG4gICAgICAgIHRhcmdldDogcmVzb2x2ZVRhcmdldChzdGVwKSxcbiAgICAgICAgdGl0bGU6IHN0ZXAudGl0bGUsXG4gICAgICAgIGJvZHk6IHN0ZXAuYm9keSxcbiAgICAgICAgc3RlcEluZGV4OiBpbmRleCxcbiAgICAgICAgc3RlcENvdW50OiBzdGVwcy5sZW5ndGgsXG4gICAgICAgIHNob3dOZXh0OiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIixcbiAgICAgICAgbmV4dExhYmVsOiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIlxuICAgICAgICAgID8gc3RlcC5hZHZhbmNlLm5leHRMYWJlbCA/PyAoaW5kZXggPT09IHN0ZXBzLmxlbmd0aCAtIDEgPyBcIkZpbmlzaFwiIDogXCJOZXh0XCIpXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIG9uTmV4dDogc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwibWFudWFsXCIgPyBhZHZhbmNlU3RlcCA6IHVuZGVmaW5lZCxcbiAgICAgICAgc2hvd1NraXA6IGFsbG93U2tpcCxcbiAgICAgICAgc2tpcExhYmVsOiBzdGVwLnNraXBMYWJlbCxcbiAgICAgICAgb25Ta2lwOiBhbGxvd1NraXAgPyBza2lwQ3VycmVudFN0ZXAgOiB1bmRlZmluZWQsXG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmVuZGVyQ3VycmVudCA9IHJlbmRlcjtcbiAgICByZW5kZXIoKTtcblxuICAgIGlmIChzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJldmVudFwiKSB7XG4gICAgICBjb25zdCBoYW5kbGVyID0gKHBheWxvYWQ6IHVua25vd24pOiB2b2lkID0+IHtcbiAgICAgICAgaWYgKCFydW5uaW5nIHx8IHBhdXNlZCkgcmV0dXJuO1xuICAgICAgICBpZiAoc3RlcC5hZHZhbmNlLndoZW4gJiYgIXN0ZXAuYWR2YW5jZS53aGVuKHBheWxvYWQpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2VUbyhpbmRleCArIDEpO1xuICAgICAgfTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gYnVzLm9uKHN0ZXAuYWR2YW5jZS5ldmVudCwgaGFuZGxlciBhcyAodmFsdWU6IG5ldmVyKSA9PiB2b2lkKTtcbiAgICAgIGlmIChzdGVwLmFkdmFuY2UuY2hlY2sgJiYgc3RlcC5hZHZhbmNlLmNoZWNrKCkpIHtcbiAgICAgICAgaGFuZGxlcih1bmRlZmluZWQpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYWR2YW5jZVRvKG5leHRJbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuICAgIHJlbmRlckN1cnJlbnQgPSBudWxsO1xuICAgIGlmIChuZXh0SW5kZXggPj0gc3RlcHMubGVuZ3RoKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldFN0ZXAobmV4dEluZGV4KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlU3RlcCgpOiB2b2lkIHtcbiAgICBhZHZhbmNlVG8oY3VycmVudEluZGV4ICsgMSk7XG4gIH1cblxuICBmdW5jdGlvbiBza2lwQ3VycmVudFN0ZXAoKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgY29uc3QgbmV4dEluZGV4ID0gY3VycmVudEluZGV4ID49IDAgPyBjdXJyZW50SW5kZXggKyAxIDogMDtcbiAgICBhZHZhbmNlVG8obmV4dEluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBsZXRlVHV0b3JpYWwoKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gdHJ1ZTtcbiAgICBwZXJzaXN0UHJvZ3Jlc3Moc3RlcHMubGVuZ3RoLCB0cnVlKTtcbiAgICBidXMuZW1pdChcInR1dG9yaWFsOmNvbXBsZXRlZFwiLCB7IGlkIH0pO1xuICAgIHN0b3AoKTtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0KG9wdGlvbnM/OiBTdGFydE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCByZXN1bWUgPSBvcHRpb25zPy5yZXN1bWUgIT09IGZhbHNlO1xuICAgIGlmIChydW5uaW5nKSB7XG4gICAgICByZXN0YXJ0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcnVubmluZyA9IHRydWU7XG4gICAgcGF1c2VkID0gZmFsc2U7XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gZmFsc2U7XG4gICAgbGFzdFNhdmVkQ29tcGxldGVkID0gZmFsc2U7XG4gICAgbGV0IHN0YXJ0SW5kZXggPSAwO1xuICAgIGlmIChyZXN1bWUpIHtcbiAgICAgIGNvbnN0IHByb2dyZXNzID0gbG9hZFByb2dyZXNzKGlkKTtcbiAgICAgIGlmIChwcm9ncmVzcyAmJiAhcHJvZ3Jlc3MuY29tcGxldGVkKSB7XG4gICAgICAgIHN0YXJ0SW5kZXggPSBjbGFtcEluZGV4KHByb2dyZXNzLnN0ZXBJbmRleCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFyUHJvZ3Jlc3MoaWQpO1xuICAgIH1cbiAgICBidXMuZW1pdChcInR1dG9yaWFsOnN0YXJ0ZWRcIiwgeyBpZCB9KTtcbiAgICBzZXRTdGVwKHN0YXJ0SW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVzdGFydCgpOiB2b2lkIHtcbiAgICBzdG9wKCk7XG4gICAgc3RhcnQoeyByZXN1bWU6IGZhbHNlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RvcCgpOiB2b2lkIHtcbiAgICBjb25zdCBzaG91bGRQZXJzaXN0ID0gIXN1cHByZXNzUGVyc2lzdE9uU3RvcCAmJiBydW5uaW5nICYmICFsYXN0U2F2ZWRDb21wbGV0ZWQgJiYgY3VycmVudEluZGV4ID49IDAgJiYgY3VycmVudEluZGV4IDwgc3RlcHMubGVuZ3RoO1xuICAgIGNvbnN0IGluZGV4VG9QZXJzaXN0ID0gY3VycmVudEluZGV4O1xuXG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChzaG91bGRQZXJzaXN0KSB7XG4gICAgICBwZXJzaXN0UHJvZ3Jlc3MoaW5kZXhUb1BlcnNpc3QsIGZhbHNlKTtcbiAgICB9XG4gICAgcnVubmluZyA9IGZhbHNlO1xuICAgIHBhdXNlZCA9IGZhbHNlO1xuICAgIGN1cnJlbnRJbmRleCA9IC0xO1xuICAgIHJlbmRlckN1cnJlbnQgPSBudWxsO1xuICAgIGhpZ2hsaWdodGVyLmhpZGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzUnVubmluZygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gcnVubmluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgc3RvcCgpO1xuICAgIGZvciAoY29uc3QgZGlzcG9zZSBvZiBwZXJzaXN0ZW50TGlzdGVuZXJzKSB7XG4gICAgICBkaXNwb3NlKCk7XG4gICAgfVxuICAgIGhpZ2hsaWdodGVyLmRlc3Ryb3koKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBlcnNpc3RQcm9ncmVzcyhzdGVwSW5kZXg6IG51bWJlciwgY29tcGxldGVkOiBib29sZWFuKTogdm9pZCB7XG4gICAgbGFzdFNhdmVkQ29tcGxldGVkID0gY29tcGxldGVkO1xuICAgIHNhdmVQcm9ncmVzcyhpZCwge1xuICAgICAgc3RlcEluZGV4LFxuICAgICAgY29tcGxldGVkLFxuICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydCxcbiAgICByZXN0YXJ0LFxuICAgIHN0b3AsXG4gICAgaXNSdW5uaW5nLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBUdXRvcmlhbFN0ZXAgfSBmcm9tIFwiLi9lbmdpbmVcIjtcblxuZnVuY3Rpb24gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZDogdW5rbm93biwgbWluSW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBpbmRleCA9IChwYXlsb2FkIGFzIHsgaW5kZXg/OiB1bmtub3duIH0pLmluZGV4O1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSBcIm51bWJlclwiIHx8ICFOdW1iZXIuaXNGaW5pdGUoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBpbmRleCA+PSBtaW5JbmRleDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFJvdXRlSWQocGF5bG9hZDogdW5rbm93bik6IHN0cmluZyB8IG51bGwge1xuICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvdXRlSWQgPSAocGF5bG9hZCBhcyB7IHJvdXRlSWQ/OiB1bmtub3duIH0pLnJvdXRlSWQ7XG4gIHJldHVybiB0eXBlb2Ygcm91dGVJZCA9PT0gXCJzdHJpbmdcIiA/IHJvdXRlSWQgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXlsb2FkVG9vbEVxdWFscyh0YXJnZXQ6IHN0cmluZyk6IChwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuIHtcbiAgcmV0dXJuIChwYXlsb2FkOiB1bmtub3duKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiIHx8IHBheWxvYWQgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCB0b29sID0gKHBheWxvYWQgYXMgeyB0b29sPzogdW5rbm93biB9KS50b29sO1xuICAgIHJldHVybiB0eXBlb2YgdG9vbCA9PT0gXCJzdHJpbmdcIiAmJiB0b29sID09PSB0YXJnZXQ7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCYXNpY1R1dG9yaWFsU3RlcHMoKTogVHV0b3JpYWxTdGVwW10ge1xuICBsZXQgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPSAwO1xuICBsZXQgaW5pdGlhbFJvdXRlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgbmV3Um91dGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgcmV0dXJuIFtcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLXBsb3Qtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgYSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJDbGljayBvbiB0aGUgbWFwIHRvIGRyb3AgYXQgbGVhc3QgdGhyZWUgd2F5cG9pbnRzIGFuZCBza2V0Y2ggeW91ciBjb3Vyc2UuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAyKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWNoYW5nZS1zcGVlZFwiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBTcGVlZFNsaWRlclwiLFxuICAgICAgdGl0bGU6IFwiQWRqdXN0IHNoaXAgc3BlZWRcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBTaGlwIFNwZWVkIHNsaWRlciAob3IgcHJlc3MgWyAvIF0pIHRvIGZpbmUtdHVuZSB5b3VyIHRyYXZlbCBzcGVlZC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtc2VsZWN0LWxlZ1wiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBTZWxlY3RcIixcbiAgICAgIHRpdGxlOiBcIlNlbGVjdCBhIHJvdXRlIGxlZ1wiLFxuICAgICAgYm9keTogXCJTd2l0Y2ggdG8gU2VsZWN0IG1vZGUgKFQga2V5KSBhbmQgdGhlbiBjbGljayBhIHdheXBvaW50IG9uIHRoZSBtYXAgdG8gaGlnaGxpZ2h0IGl0cyBsZWcuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpsZWdTZWxlY3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMCksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1tYXRjaC1tYXJrZXJcIixcbiAgICAgIHRhcmdldDogXCJzcGVlZE1hcmtlclwiLFxuICAgICAgdGl0bGU6IFwiTWF0Y2ggdGhlIG1hcmtlclwiLFxuICAgICAgYm9keTogXCJMaW5lIHVwIHRoZSBTaGlwIFNwZWVkIHNsaWRlciB3aXRoIHRoZSB0aWNrIHRvIGNydWlzZSBhdCB0aGUgbmV1dHJhbCBoZWF0IHNwZWVkLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6bWFya2VyQWxpZ25lZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LXB1c2gtaG90XCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiU3ByaW50IGludG8gdGhlIHJlZFwiLFxuICAgICAgYm9keTogXCJQdXNoIHRoZSB0aHJvdHRsZSBhYm92ZSB0aGUgbWFya2VyIGFuZCB3YXRjaCB0aGUgaGVhdCBiYXIgcmVhY2ggdGhlIHdhcm5pbmcgYmFuZC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0Ondhcm5FbnRlcmVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtY29vbC1kb3duXCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiQ29vbCBpdCBiYWNrIGRvd25cIixcbiAgICAgIGJvZHk6IFwiRWFzZSBvZmYgYmVsb3cgdGhlIG1hcmtlciB1bnRpbCB0aGUgYmFyIGRyb3BzIG91dCBvZiB0aGUgd2FybmluZyB6b25lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtdHJpZ2dlci1zdGFsbFwiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIlRyaWdnZXIgYSBzdGFsbFwiLFxuICAgICAgYm9keTogXCJQdXNoIHdlbGwgYWJvdmUgdGhlIGxpbWl0IGFuZCBob2xkIGl0IHVudGlsIHRoZSBvdmVyaGVhdCBzdGFsbCBvdmVybGF5IGFwcGVhcnMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDpzdGFsbFRyaWdnZXJlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LXJlY292ZXItc3RhbGxcIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJSZWNvdmVyIGZyb20gdGhlIHN0YWxsXCIsXG4gICAgICBib2R5OiBcIkhvbGQgc3RlYWR5IHdoaWxlIHN5c3RlbXMgY29vbC4gT25jZSB0aGUgb3ZlcmxheSBjbGVhcnMsIHlvdVx1MjAxOXJlIGJhY2sgb25saW5lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6c3RhbGxSZWNvdmVyZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1kdWFsLWJhcnNcIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJSZWFkIGJvdGggaGVhdCBiYXJzXCIsXG4gICAgICBib2R5OiBcIkFkanVzdCBhIHdheXBvaW50IHRvIG1ha2UgdGhlIHBsYW5uZWQgYmFyIGV4dGVuZCBwYXN0IGxpdmUgaGVhdC4gVXNlIGl0IHRvIHByZWRpY3QgZnV0dXJlIG92ZXJsb2Fkcy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtZGVsZXRlLWxlZ1wiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBEZWxldGVcIixcbiAgICAgIHRpdGxlOiBcIkRlbGV0ZSBhIHJvdXRlIGxlZ1wiLFxuICAgICAgYm9keTogXCJSZW1vdmUgdGhlIHNlbGVjdGVkIHdheXBvaW50IHVzaW5nIHRoZSBEZWxldGUgY29udHJvbCBvciB0aGUgRGVsZXRlIGtleS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOndheXBvaW50RGVsZXRlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtY2xlYXItcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJzaGlwQ2xlYXJcIixcbiAgICAgIHRpdGxlOiBcIkNsZWFyIHRoZSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJDbGVhciByZW1haW5pbmcgd2F5cG9pbnRzIHRvIHJlc2V0IHlvdXIgcGxvdHRlZCBjb3Vyc2UuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpjbGVhckludm9rZWRcIixcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXNldC1tb2RlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZVNldFwiLFxuICAgICAgdGl0bGU6IFwiU3dpdGNoIHRvIG1pc3NpbGUgcGxhbm5pbmdcIixcbiAgICAgIGJvZHk6IFwiVGFwIFNldCBzbyBldmVyeSBjbGljayBkcm9wcyBtaXNzaWxlIHdheXBvaW50cyBvbiB0aGUgYWN0aXZlIHJvdXRlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIixcbiAgICAgICAgd2hlbjogcGF5bG9hZFRvb2xFcXVhbHMoXCJzZXRcIiksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1wbG90LWluaXRpYWxcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgbWlzc2lsZSB3YXlwb2ludHNcIixcbiAgICAgIGJvZHk6IFwiQ2xpY2sgdGhlIG1hcCB0byBkcm9wIGF0IGxlYXN0IHR3byBndWlkYW5jZSBwb2ludHMgZm9yIHRoZSBjdXJyZW50IG1pc3NpbGUgcm91dGUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgaWYgKCFoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAxKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAocm91dGVJZCkge1xuICAgICAgICAgICAgaW5pdGlhbFJvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1pbml0aWFsXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIHRoZSBzdHJpa2VcIixcbiAgICAgIGJvZHk6IFwiU2VuZCB0aGUgcGxhbm5lZCBtaXNzaWxlIHJvdXRlIGxpdmUgd2l0aCB0aGUgTGF1bmNoIGNvbnRyb2wgKEwga2V5KS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQpIHtcbiAgICAgICAgICAgIGluaXRpYWxSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gaW5pdGlhbFJvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1hZGQtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlQWRkUm91dGVcIixcbiAgICAgIHRpdGxlOiBcIkNyZWF0ZSBhIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIlByZXNzIE5ldyB0byBhZGQgYSBzZWNvbmQgbWlzc2lsZSByb3V0ZSBmb3IgYW5vdGhlciBzdHJpa2UgZ3JvdXAuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpyb3V0ZUFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghcm91dGVJZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIG5ld1JvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtcGxvdC1uZXctcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgdGhlIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkRyb3AgYXQgbGVhc3QgdHdvIHdheXBvaW50cyBvbiB0aGUgbmV3IHJvdXRlIHRvIGRlZmluZSBpdHMgcGF0aC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBpZiAoIWhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDEpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmIChuZXdSb3V0ZUlkICYmIHJvdXRlSWQgJiYgcm91dGVJZCAhPT0gbmV3Um91dGVJZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIW5ld1JvdXRlSWQgJiYgcm91dGVJZCkge1xuICAgICAgICAgICAgbmV3Um91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLW5ldy1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCB0aGUgbmV3IHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkxhdW5jaCB0aGUgZnJlc2ggbWlzc2lsZSByb3V0ZSB0byBjb25maXJtIGl0cyBwYXR0ZXJuLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghbmV3Um91dGVJZCB8fCAhcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IG5ld1JvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1zd2l0Y2gtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJyb3V0ZU5leHRcIixcbiAgICAgIHRpdGxlOiBcIlN3aXRjaCBiYWNrIHRvIHRoZSBvcmlnaW5hbCByb3V0ZVwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIFx1MjVDMCBcdTI1QjYgY29udHJvbHMgKG9yIFRhYi9TaGlmdCtUYWIpIHRvIHNlbGVjdCB5b3VyIGZpcnN0IG1pc3NpbGUgcm91dGUgYWdhaW4uXCIsXG4gICAgICBvbkVudGVyOiAoKSA9PiB7XG4gICAgICAgIHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyID0gMDtcbiAgICAgIH0sXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciArPSAxO1xuICAgICAgICAgIGlmIChyb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA8IDEpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCB8fCAhcm91dGVJZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1hZnRlci1zd2l0Y2hcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggZnJvbSB0aGUgb3RoZXIgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiRmlyZSB0aGUgb3JpZ2luYWwgbWlzc2lsZSByb3V0ZSB0byBwcmFjdGljZSByb3VuZC1yb2JpbiBzdHJpa2VzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQgfHwgIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJ0dXRvcmlhbC1wcmFjdGljZVwiLFxuICAgICAgdGFyZ2V0OiBcInNwYXduQm90XCIsXG4gICAgICB0aXRsZTogXCJTcGF3biBhIHByYWN0aWNlIGJvdFwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIEJvdCBjb250cm9sIHRvIGFkZCBhIHRhcmdldCBhbmQgcmVoZWFyc2UgdGhlc2UgbWFuZXV2ZXJzIGluIHJlYWwgdGltZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwidHV0b3JpYWwtY29tcGxldGVcIixcbiAgICAgIHRhcmdldDogbnVsbCxcbiAgICAgIHRpdGxlOiBcIllvdVx1MjAxOXJlIHJlYWR5XCIsXG4gICAgICBib2R5OiBcIkdyZWF0IHdvcmsuIFJlbG9hZCB0aGUgY29uc29sZSBvciByZWpvaW4gYSByb29tIHRvIHJldmlzaXQgdGhlc2UgZHJpbGxzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcIm1hbnVhbFwiLFxuICAgICAgICBuZXh0TGFiZWw6IFwiRmluaXNoXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICBdO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVUdXRvcmlhbEVuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgY3JlYXRlUm9sZXMgfSBmcm9tIFwiLi9yb2xlc1wiO1xuaW1wb3J0IHsgZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzIH0gZnJvbSBcIi4vc3RlcHNfYmFzaWNcIjtcbmV4cG9ydCBjb25zdCBCQVNJQ19UVVRPUklBTF9JRCA9IFwic2hpcC1iYXNpY3NcIjtcblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbENvbnRyb2xsZXIge1xuICBzdGFydChvcHRpb25zPzogeyByZXN1bWU/OiBib29sZWFuIH0pOiB2b2lkO1xuICByZXN0YXJ0KCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50VHV0b3JpYWwoYnVzOiBFdmVudEJ1cyk6IFR1dG9yaWFsQ29udHJvbGxlciB7XG4gIGNvbnN0IHJvbGVzID0gY3JlYXRlUm9sZXMoKTtcbiAgY29uc3QgZW5naW5lID0gY3JlYXRlVHV0b3JpYWxFbmdpbmUoe1xuICAgIGlkOiBCQVNJQ19UVVRPUklBTF9JRCxcbiAgICBidXMsXG4gICAgcm9sZXMsXG4gICAgc3RlcHM6IGdldEJhc2ljVHV0b3JpYWxTdGVwcygpLFxuICB9KTtcblxuICByZXR1cm4ge1xuICAgIHN0YXJ0KG9wdGlvbnMpIHtcbiAgICAgIGVuZ2luZS5zdGFydChvcHRpb25zKTtcbiAgICB9LFxuICAgIHJlc3RhcnQoKSB7XG4gICAgICBlbmdpbmUucmVzdGFydCgpO1xuICAgIH0sXG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGVuZ2luZS5kZXN0cm95KCk7XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBjbGFtcCB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlQ2hvaWNlIHtcbiAgaWQ6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlQ29udGVudCB7XG4gIHNwZWFrZXI6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBpbnRlbnQ/OiBcImZhY3RvcnlcIiB8IFwidW5pdFwiO1xuICBjaG9pY2VzPzogRGlhbG9ndWVDaG9pY2VbXTtcbiAgdHlwaW5nU3BlZWRNcz86IG51bWJlcjtcbiAgb25DaG9pY2U/OiAoY2hvaWNlSWQ6IHN0cmluZykgPT4gdm9pZDtcbiAgb25UZXh0RnVsbHlSZW5kZXJlZD86ICgpID0+IHZvaWQ7XG4gIG9uQ29udGludWU/OiAoKSA9PiB2b2lkO1xuICBjb250aW51ZUxhYmVsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlT3ZlcmxheSB7XG4gIHNob3coY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZDtcbiAgaGlkZSgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIGlzVmlzaWJsZSgpOiBib29sZWFuO1xufVxuXG5jb25zdCBTVFlMRV9JRCA9IFwiZGlhbG9ndWUtb3ZlcmxheS1zdHlsZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRGlhbG9ndWVPdmVybGF5KCk6IERpYWxvZ3VlT3ZlcmxheSB7XG4gIGVuc3VyZVN0eWxlcygpO1xuXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtb3ZlcmxheVwiO1xuICBvdmVybGF5LnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBcInBvbGl0ZVwiKTtcblxuICBjb25zdCBjb25zb2xlRnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBjb25zb2xlRnJhbWUuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jb25zb2xlXCI7XG5cbiAgY29uc3Qgc3BlYWtlckxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc3BlYWtlckxhYmVsLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtc3BlYWtlclwiO1xuXG4gIGNvbnN0IHRleHRCbG9jayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRleHRCbG9jay5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLXRleHRcIjtcblxuICBjb25zdCBjdXJzb3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgY3Vyc29yLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY3Vyc29yXCI7XG4gIGN1cnNvci50ZXh0Q29udGVudCA9IFwiX1wiO1xuXG4gIGNvbnN0IGNob2ljZXNMaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInVsXCIpO1xuICBjaG9pY2VzTGlzdC5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNob2ljZXMgaGlkZGVuXCI7XG5cbiAgY29uc3QgY29udGludWVCdXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBjb250aW51ZUJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgY29udGludWVCdXR0b24uY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jb250aW51ZSBoaWRkZW5cIjtcbiAgY29udGludWVCdXR0b24udGV4dENvbnRlbnQgPSBcIkNvbnRpbnVlXCI7XG5cbiAgdGV4dEJsb2NrLmFwcGVuZChjdXJzb3IpO1xuICBjb25zb2xlRnJhbWUuYXBwZW5kKHNwZWFrZXJMYWJlbCwgdGV4dEJsb2NrLCBjaG9pY2VzTGlzdCwgY29udGludWVCdXR0b24pO1xuICBvdmVybGF5LmFwcGVuZChjb25zb2xlRnJhbWUpO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gIGxldCB2aXNpYmxlID0gZmFsc2U7XG4gIGxldCB0eXBpbmdIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgdGFyZ2V0VGV4dCA9IFwiXCI7XG4gIGxldCByZW5kZXJlZENoYXJzID0gMDtcbiAgbGV0IGFjdGl2ZUNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGNsZWFyVHlwaW5nKCk6IHZvaWQge1xuICAgIGlmICh0eXBpbmdIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodHlwaW5nSGFuZGxlKTtcbiAgICAgIHR5cGluZ0hhbmRsZSA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZmluaXNoVHlwaW5nKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIHJlbmRlcmVkQ2hhcnMgPSB0YXJnZXRUZXh0Lmxlbmd0aDtcbiAgICB1cGRhdGVUZXh0KCk7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICBjb250ZW50Lm9uVGV4dEZ1bGx5UmVuZGVyZWQ/LigpO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShjb250ZW50LmNob2ljZXMpIHx8IGNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVUZXh0KCk6IHZvaWQge1xuICAgIGNvbnN0IHRleHRUb1Nob3cgPSB0YXJnZXRUZXh0LnNsaWNlKDAsIHJlbmRlcmVkQ2hhcnMpO1xuICAgIHRleHRCbG9jay5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNvbnN0IHRleHROb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgdGV4dE5vZGUudGV4dENvbnRlbnQgPSB0ZXh0VG9TaG93O1xuICAgIHRleHRCbG9jay5hcHBlbmQodGV4dE5vZGUsIGN1cnNvcik7XG4gICAgY3Vyc29yLmNsYXNzTGlzdC50b2dnbGUoXCJoaWRkZW5cIiwgIXZpc2libGUpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyQ2hvaWNlcyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBjaG9pY2VzTGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNvbnN0IGNob2ljZXMgPSBBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgPyBjb250ZW50LmNob2ljZXMgOiBbXTtcbiAgICBpZiAoY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gICAgY2hvaWNlcy5mb3JFYWNoKChjaG9pY2UsIGluZGV4KSA9PiB7XG4gICAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgICAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICAgIGJ1dHRvbi5kYXRhc2V0LmNob2ljZUlkID0gY2hvaWNlLmlkO1xuICAgICAgYnV0dG9uLnRleHRDb250ZW50ID0gYCR7aW5kZXggKyAxfS4gJHtjaG9pY2UudGV4dH1gO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICAgIGNvbnRlbnQub25DaG9pY2U/LihjaG9pY2UuaWQpO1xuICAgICAgfSk7XG4gICAgICBpdGVtLmFwcGVuZChidXR0b24pO1xuICAgICAgY2hvaWNlc0xpc3QuYXBwZW5kKGl0ZW0pO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc2hvd0NvbnRpbnVlKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGlmICghY29udGVudC5vbkNvbnRpbnVlKSB7XG4gICAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgICAgY29udGludWVCdXR0b24ub25jbGljayA9IG51bGw7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnRpbnVlQnV0dG9uLnRleHRDb250ZW50ID0gY29udGVudC5jb250aW51ZUxhYmVsID8/IFwiQ29udGludWVcIjtcbiAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSAoKSA9PiB7XG4gICAgICBjb250ZW50Lm9uQ29udGludWU/LigpO1xuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBzY2hlZHVsZVR5cGUoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICBjb25zdCB0eXBpbmdTcGVlZCA9IGNsYW1wKE51bWJlcihjb250ZW50LnR5cGluZ1NwZWVkTXMpIHx8IDE4LCA4LCA2NCk7XG4gICAgY29uc3QgdGljayA9ICgpOiB2b2lkID0+IHtcbiAgICAgIHJlbmRlcmVkQ2hhcnMgPSBNYXRoLm1pbihyZW5kZXJlZENoYXJzICsgMSwgdGFyZ2V0VGV4dC5sZW5ndGgpO1xuICAgICAgdXBkYXRlVGV4dCgpO1xuICAgICAgaWYgKHJlbmRlcmVkQ2hhcnMgPj0gdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgICAgY2xlYXJUeXBpbmcoKTtcbiAgICAgICAgY29udGVudC5vblRleHRGdWxseVJlbmRlcmVkPy4oKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgfHwgY29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHlwaW5nSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQodGljaywgdHlwaW5nU3BlZWQpO1xuICAgICAgfVxuICAgIH07XG4gICAgdHlwaW5nSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQodGljaywgdHlwaW5nU3BlZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSB8fCAhYWN0aXZlQ29udGVudCkgcmV0dXJuO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShhY3RpdmVDb250ZW50LmNob2ljZXMpIHx8IGFjdGl2ZUNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGlmIChldmVudC5rZXkgPT09IFwiIFwiIHx8IGV2ZW50LmtleSA9PT0gXCJFbnRlclwiKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGlmIChyZW5kZXJlZENoYXJzIDwgdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgICAgICBmaW5pc2hUeXBpbmcoYWN0aXZlQ29udGVudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYWN0aXZlQ29udGVudC5vbkNvbnRpbnVlPy4oKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBpbmRleCA9IHBhcnNlSW50KGV2ZW50LmtleSwgMTApO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoaW5kZXgpICYmIGluZGV4ID49IDEgJiYgaW5kZXggPD0gYWN0aXZlQ29udGVudC5jaG9pY2VzLmxlbmd0aCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IGNob2ljZSA9IGFjdGl2ZUNvbnRlbnQuY2hvaWNlc1tpbmRleCAtIDFdO1xuICAgICAgYWN0aXZlQ29udGVudC5vbkNob2ljZT8uKGNob2ljZS5pZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRW50ZXJcIiAmJiByZW5kZXJlZENoYXJzIDwgdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBmaW5pc2hUeXBpbmcoYWN0aXZlQ29udGVudCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvdyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBhY3RpdmVDb250ZW50ID0gY29udGVudDtcbiAgICB2aXNpYmxlID0gdHJ1ZTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgIG92ZXJsYXkuZGF0YXNldC5pbnRlbnQgPSBjb250ZW50LmludGVudCA/PyBcImZhY3RvcnlcIjtcbiAgICBzcGVha2VyTGFiZWwudGV4dENvbnRlbnQgPSBjb250ZW50LnNwZWFrZXI7XG5cbiAgICB0YXJnZXRUZXh0ID0gY29udGVudC50ZXh0O1xuICAgIHJlbmRlcmVkQ2hhcnMgPSAwO1xuICAgIHVwZGF0ZVRleHQoKTtcbiAgICByZW5kZXJDaG9pY2VzKGNvbnRlbnQpO1xuICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICBzY2hlZHVsZVR5cGUoY29udGVudCk7XG4gIH1cblxuICBmdW5jdGlvbiBoaWRlKCk6IHZvaWQge1xuICAgIHZpc2libGUgPSBmYWxzZTtcbiAgICBhY3RpdmVDb250ZW50ID0gbnVsbDtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgdGFyZ2V0VGV4dCA9IFwiXCI7XG4gICAgcmVuZGVyZWRDaGFycyA9IDA7XG4gICAgdGV4dEJsb2NrLmlubmVySFRNTCA9IFwiXCI7XG4gICAgdGV4dEJsb2NrLmFwcGVuZChjdXJzb3IpO1xuICAgIGNob2ljZXNMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlKCk7XG4gICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlS2V5RG93bik7XG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfVxuXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleURvd24pO1xuXG4gIHJldHVybiB7XG4gICAgc2hvdyxcbiAgICBoaWRlLFxuICAgIGRlc3Ryb3ksXG4gICAgaXNWaXNpYmxlKCkge1xuICAgICAgcmV0dXJuIHZpc2libGU7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlU3R5bGVzKCk6IHZvaWQge1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoU1RZTEVfSUQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICBzdHlsZS5pZCA9IFNUWUxFX0lEO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAuZGlhbG9ndWUtb3ZlcmxheSB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICBpbnNldDogMDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIHotaW5kZXg6IDYwO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICAgIHRyYW5zaXRpb246IG9wYWNpdHkgMC4ycyBlYXNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheS52aXNpYmxlIHtcbiAgICAgIG9wYWNpdHk6IDE7XG4gICAgICBwb2ludGVyLWV2ZW50czogYXV0bztcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgbWluLXdpZHRoOiAzMjBweDtcbiAgICAgIG1heC13aWR0aDogbWluKDUyMHB4LCBjYWxjKDEwMHZ3IC0gNDhweCkpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSg2LCAxMSwgMTYsIDAuOTIpO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDEycHg7XG4gICAgICBwYWRkaW5nOiAxOHB4IDIwcHg7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGdhcDogMTRweDtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMiwgNiwgMTYsIDAuNik7XG4gICAgICBjb2xvcjogI2UyZThmMDtcbiAgICAgIGZvbnQtZmFtaWx5OiBcIklCTSBQbGV4IE1vbm9cIiwgXCJKZXRCcmFpbnMgTW9ub1wiLCB1aS1tb25vc3BhY2UsIFNGTW9uby1SZWd1bGFyLCBNZW5sbywgTW9uYWNvLCBDb25zb2xhcywgXCJMaWJlcmF0aW9uIE1vbm9cIiwgXCJDb3VyaWVyIE5ld1wiLCBtb25vc3BhY2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5W2RhdGEtaW50ZW50PVwiZmFjdG9yeVwiXSAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjQ1KTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMTMsIDE0OCwgMTM2LCAwLjM1KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXlbZGF0YS1pbnRlbnQ9XCJ1bml0XCJdIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyNDQsIDExNCwgMTgyLCAwLjQ1KTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMjM2LCA3MiwgMTUzLCAwLjI4KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLXNwZWFrZXIge1xuICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMTZlbTtcbiAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgICBjb2xvcjogcmdiYSgxNDgsIDE2MywgMTg0LCAwLjc1KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLXRleHQge1xuICAgICAgbWluLWhlaWdodDogOTBweDtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGxpbmUtaGVpZ2h0OiAxLjU1O1xuICAgICAgd2hpdGUtc3BhY2U6IHByZS13cmFwO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY3Vyc29yIHtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbiAgICAgIG1hcmdpbi1sZWZ0OiA0cHg7XG4gICAgICBhbmltYXRpb246IGRpYWxvZ3VlLWN1cnNvci1ibGluayAxLjJzIHN0ZXBzKDIsIHN0YXJ0KSBpbmZpbml0ZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWN1cnNvci5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMge1xuICAgICAgbGlzdC1zdHlsZTogbm9uZTtcbiAgICAgIG1hcmdpbjogMDtcbiAgICAgIHBhZGRpbmc6IDA7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGdhcDogOHB4O1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcy5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZSB7XG4gICAgICBmb250OiBpbmhlcml0O1xuICAgICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICAgIHBhZGRpbmc6IDhweCAxMHB4O1xuICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjMpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgyNCwgMzYsIDQ4LCAwLjg1KTtcbiAgICAgIGNvbG9yOiBpbmhlcml0O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAwLjE4cyBlYXNlLCBib3JkZXItY29sb3IgMC4xOHMgZWFzZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlIHtcbiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b246aG92ZXIsXG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uOmZvY3VzLXZpc2libGUsXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlOmhvdmVyLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZTpmb2N1cy12aXNpYmxlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNTUpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgzMCwgNDUsIDYwLCAwLjk1KTtcbiAgICAgIG91dGxpbmU6IG5vbmU7XG4gICAgfVxuICAgIEBrZXlmcmFtZXMgZGlhbG9ndWUtY3Vyc29yLWJsaW5rIHtcbiAgICAgIDAlLCA1MCUgeyBvcGFjaXR5OiAxOyB9XG4gICAgICA1MC4wMSUsIDEwMCUgeyBvcGFjaXR5OiAwOyB9XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cblxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgdHlwZSB7IERpYWxvZ3VlT3ZlcmxheSB9IGZyb20gXCIuL292ZXJsYXlcIjtcbmltcG9ydCB0eXBlIHsgRGlhbG9ndWVDb250ZW50IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IHNlbmRNZXNzYWdlIH0gZnJvbSBcIi4uL25ldFwiO1xuXG5pbnRlcmZhY2UgU3RvcnlDb250cm9sbGVyT3B0aW9ucyB7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG92ZXJsYXk6IERpYWxvZ3VlT3ZlcmxheTtcbiAgc3RhdGU6IEFwcFN0YXRlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5Q29udHJvbGxlciB7XG4gIHN0YXJ0KCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuLyoqXG4gKiBTZXJ2ZXItZHJpdmVuIHN0b3J5IGNvbnRyb2xsZXIuXG4gKiBSZWFjdHMgdG8gc3Rvcnk6bm9kZUFjdGl2YXRlZCBldmVudHMgZnJvbSB0aGUgc2VydmVyIGFuZCBkaXNwbGF5cyBkaWFsb2d1ZS5cbiAqIFNlbmRzIGRhZ19zdG9yeV9hY2sgbWVzc2FnZXMgYmFjayB0byB0aGUgc2VydmVyIHdoZW4gZGlhbG9ndWUgaXMgY29tcGxldGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU3RvcnlDb250cm9sbGVyKHsgYnVzLCBvdmVybGF5LCBzdGF0ZSB9OiBTdG9yeUNvbnRyb2xsZXJPcHRpb25zKTogU3RvcnlDb250cm9sbGVyIHtcbiAgY29uc3QgbGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuICBsZXQgdHV0b3JpYWxUaXBFbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGhhbmRsZU5vZGVBY3RpdmF0ZWQoeyBub2RlSWQsIGRpYWxvZ3VlIH06IHsgbm9kZUlkOiBzdHJpbmc7IGRpYWxvZ3VlPzogRGlhbG9ndWVDb250ZW50IH0pOiB2b2lkIHtcbiAgICBjb25zb2xlLmxvZyhcIltzdG9yeV0gTm9kZSBhY3RpdmF0ZWQ6XCIsIG5vZGVJZCk7XG5cbiAgICBpZiAoIWRpYWxvZ3VlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiW3N0b3J5XSBObyBkaWFsb2d1ZSBwcm92aWRlZCBieSBzZXJ2ZXIgZm9yOlwiLCBub2RlSWQpO1xuICAgICAgLy8gQXV0by1hY2tub3dsZWRnZSB0byBwcmV2ZW50IGJsb2NraW5nIHByb2dyZXNzaW9uXG4gICAgICBhY2tub3dsZWRnZU5vZGUobm9kZUlkLCBudWxsKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSB0aGUgbm9kZSBJRCB0byBleHRyYWN0IGNoYXB0ZXIgYW5kIG5vZGUgaW5mb1xuICAgIC8vIEV4cGVjdGVkIGZvcm1hdDogXCJzdG9yeS48Y2hhcHRlcj4uPG5vZGU+XCJcbiAgICBjb25zdCBwYXJ0cyA9IG5vZGVJZC5zcGxpdChcIi5cIik7XG4gICAgaWYgKHBhcnRzLmxlbmd0aCA8IDMgfHwgcGFydHNbMF0gIT09IFwic3RvcnlcIikge1xuICAgICAgY29uc29sZS53YXJuKFwiW3N0b3J5XSBJbnZhbGlkIG5vZGUgSUQgZm9ybWF0OlwiLCBub2RlSWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNoYXB0ZXIgPSBwYXJ0c1sxXTtcbiAgICBjb25zdCBub2RlID0gcGFydHMuc2xpY2UoMikuam9pbihcIi5cIik7XG5cbiAgICBzaG93RGlhbG9ndWVGb3JOb2RlKGNoYXB0ZXIsIG5vZGUsIG5vZGVJZCwgZGlhbG9ndWUpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2hvd0RpYWxvZ3VlRm9yTm9kZShjaGFwdGVyOiBzdHJpbmcsIG5vZGU6IHN0cmluZywgZnVsbE5vZGVJZDogc3RyaW5nLCBjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcblxuICAgIC8vIFNob3cgdHV0b3JpYWwgdGlwIGlmIHByZXNlbnRcbiAgICBpZiAoY29udGVudC50dXRvcmlhbFRpcCkge1xuICAgICAgc2hvd1R1dG9yaWFsVGlwKGNvbnRlbnQudHV0b3JpYWxUaXApO1xuICAgIH1cblxuICAgIC8vIFByZXBhcmUgb3ZlcmxheSBjb250ZW50XG4gICAgY29uc3Qgb3ZlcmxheUNvbnRlbnQ6IGFueSA9IHtcbiAgICAgIHNwZWFrZXI6IGNvbnRlbnQuc3BlYWtlcixcbiAgICAgIHRleHQ6IGNvbnRlbnQudGV4dCxcbiAgICAgIGludGVudDogY29udGVudC5pbnRlbnQsXG4gICAgICBjb250aW51ZUxhYmVsOiBjb250ZW50LmNvbnRpbnVlTGFiZWwsXG4gICAgICB0eXBpbmdTcGVlZE1zOiBjb250ZW50LnR5cGluZ1NwZWVkTXMsXG4gICAgfTtcblxuICAgIC8vIEFkZCBjaG9pY2VzIGlmIHByZXNlbnRcbiAgICBpZiAoY29udGVudC5jaG9pY2VzICYmIGNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPiAwKSB7XG4gICAgICBvdmVybGF5Q29udGVudC5jaG9pY2VzID0gY29udGVudC5jaG9pY2VzO1xuICAgICAgb3ZlcmxheUNvbnRlbnQub25DaG9pY2UgPSAoY2hvaWNlSWQ6IHN0cmluZykgPT4ge1xuICAgICAgICBoaWRlVHV0b3JpYWxUaXAoKTtcbiAgICAgICAgb3ZlcmxheS5oaWRlKCk7XG4gICAgICAgIGFja25vd2xlZGdlTm9kZShmdWxsTm9kZUlkLCBjaG9pY2VJZCk7XG4gICAgICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2xvc2VkXCIsIHsgbm9kZUlkOiBub2RlLCBjaGFwdGVySWQ6IGNoYXB0ZXIgfSk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBObyBjaG9pY2VzIC0ganVzdCBjb250aW51ZVxuICAgICAgb3ZlcmxheUNvbnRlbnQub25Db250aW51ZSA9ICgpID0+IHtcbiAgICAgICAgaGlkZVR1dG9yaWFsVGlwKCk7XG4gICAgICAgIG92ZXJsYXkuaGlkZSgpO1xuICAgICAgICBhY2tub3dsZWRnZU5vZGUoZnVsbE5vZGVJZCwgbnVsbCk7XG4gICAgICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2xvc2VkXCIsIHsgbm9kZUlkOiBub2RlLCBjaGFwdGVySWQ6IGNoYXB0ZXIgfSk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBhdXRvLWFkdmFuY2VcbiAgICBpZiAoY29udGVudC5hdXRvQWR2YW5jZSkge1xuICAgICAgb3ZlcmxheUNvbnRlbnQub25UZXh0RnVsbHlSZW5kZXJlZCA9ICgpID0+IHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgaGlkZVR1dG9yaWFsVGlwKCk7XG4gICAgICAgICAgb3ZlcmxheS5oaWRlKCk7XG4gICAgICAgICAgYWNrbm93bGVkZ2VOb2RlKGZ1bGxOb2RlSWQsIG51bGwpO1xuICAgICAgICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2xvc2VkXCIsIHsgbm9kZUlkOiBub2RlLCBjaGFwdGVySWQ6IGNoYXB0ZXIgfSk7XG4gICAgICAgIH0sIGNvbnRlbnQuYXV0b0FkdmFuY2UuZGVsYXlNcyk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIG92ZXJsYXkuc2hvdyhvdmVybGF5Q29udGVudCk7XG5cbiAgICBidXMuZW1pdChcImRpYWxvZ3VlOm9wZW5lZFwiLCB7IG5vZGVJZDogbm9kZSwgY2hhcHRlcklkOiBjaGFwdGVyIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc2hvd1R1dG9yaWFsVGlwKHRpcDogeyB0aXRsZTogc3RyaW5nOyB0ZXh0OiBzdHJpbmcgfSk6IHZvaWQge1xuICAgIGhpZGVUdXRvcmlhbFRpcCgpO1xuXG4gICAgY29uc3QgdGlwQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0aXBDb250YWluZXIuY2xhc3NOYW1lID0gXCJzdG9yeS10dXRvcmlhbC10aXBcIjtcbiAgICB0aXBDb250YWluZXIuaW5uZXJIVE1MID0gYFxuICAgICAgPGRpdiBjbGFzcz1cInN0b3J5LXR1dG9yaWFsLXRpcC1jb250ZW50XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdG9yeS10dXRvcmlhbC10aXAtdGl0bGVcIj4ke2VzY2FwZUh0bWwodGlwLnRpdGxlKX08L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInN0b3J5LXR1dG9yaWFsLXRpcC10ZXh0XCI+JHtlc2NhcGVIdG1sKHRpcC50ZXh0KX08L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIGA7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aXBDb250YWluZXIpO1xuICAgIHR1dG9yaWFsVGlwRWxlbWVudCA9IHRpcENvbnRhaW5lcjtcblxuICAgIC8vIEVuc3VyZSBzdHlsZXMgYXJlIGxvYWRlZFxuICAgIGVuc3VyZVR1dG9yaWFsVGlwU3R5bGVzKCk7XG4gIH1cblxuICBmdW5jdGlvbiBoaWRlVHV0b3JpYWxUaXAoKTogdm9pZCB7XG4gICAgaWYgKHR1dG9yaWFsVGlwRWxlbWVudCkge1xuICAgICAgdHV0b3JpYWxUaXBFbGVtZW50LnJlbW92ZSgpO1xuICAgICAgdHV0b3JpYWxUaXBFbGVtZW50ID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBlc2NhcGVIdG1sKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBkaXYudGV4dENvbnRlbnQgPSB0ZXh0O1xuICAgIHJldHVybiBkaXYuaW5uZXJIVE1MO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5zdXJlVHV0b3JpYWxUaXBTdHlsZXMoKTogdm9pZCB7XG4gICAgY29uc3Qgc3R5bGVJZCA9IFwic3RvcnktdHV0b3JpYWwtdGlwLXN0eWxlc1wiO1xuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChzdHlsZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgICBzdHlsZS5pZCA9IHN0eWxlSWQ7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgICAuc3RvcnktdHV0b3JpYWwtdGlwIHtcbiAgICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgICB0b3A6IDgwcHg7XG4gICAgICAgIHJpZ2h0OiAyMHB4O1xuICAgICAgICBtYXgtd2lkdGg6IDMyMHB4O1xuICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDEzLCAxNDgsIDEzNiwgMC45NSk7XG4gICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjYpO1xuICAgICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICAgIHBhZGRpbmc6IDE0cHggMTZweDtcbiAgICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICAgIGZvbnQtZmFtaWx5OiBcIklCTSBQbGV4IE1vbm9cIiwgXCJKZXRCcmFpbnMgTW9ub1wiLCB1aS1tb25vc3BhY2UsIG1vbm9zcGFjZTtcbiAgICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgICBsaW5lLWhlaWdodDogMS41O1xuICAgICAgICB6LWluZGV4OiA1NTtcbiAgICAgICAgYm94LXNoYWRvdzogMCA4cHggMjRweCByZ2JhKDIsIDYsIDE2LCAwLjUpO1xuICAgICAgICBhbmltYXRpb246IHN0b3J5LXRpcC1zbGlkZS1pbiAwLjNzIGVhc2Utb3V0O1xuICAgICAgfVxuICAgICAgLnN0b3J5LXR1dG9yaWFsLXRpcC10aXRsZSB7XG4gICAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTtcbiAgICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgICAgY29sb3I6ICMzOGJkZjg7XG4gICAgICAgIG1hcmdpbi1ib3R0b206IDhweDtcbiAgICAgIH1cbiAgICAgIC5zdG9yeS10dXRvcmlhbC10aXAtdGV4dCB7XG4gICAgICAgIGNvbG9yOiAjZjFmNWY5O1xuICAgICAgfVxuICAgICAgQGtleWZyYW1lcyBzdG9yeS10aXAtc2xpZGUtaW4ge1xuICAgICAgICBmcm9tIHtcbiAgICAgICAgICBvcGFjaXR5OiAwO1xuICAgICAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCgyMHB4KTtcbiAgICAgICAgfVxuICAgICAgICB0byB7XG4gICAgICAgICAgb3BhY2l0eTogMTtcbiAgICAgICAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoMCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuICB9XG5cbiAgZnVuY3Rpb24gYWNrbm93bGVkZ2VOb2RlKG5vZGVJZDogc3RyaW5nLCBjaG9pY2VJZDogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuICAgIGNvbnN0IG1zZzogeyB0eXBlOiBzdHJpbmc7IG5vZGVfaWQ6IHN0cmluZzsgY2hvaWNlX2lkPzogc3RyaW5nIH0gPSB7XG4gICAgICB0eXBlOiBcImRhZ19zdG9yeV9hY2tcIixcbiAgICAgIG5vZGVfaWQ6IG5vZGVJZCxcbiAgICB9O1xuICAgIGlmIChjaG9pY2VJZCkge1xuICAgICAgbXNnLmNob2ljZV9pZCA9IGNob2ljZUlkO1xuICAgIH1cbiAgICBzZW5kTWVzc2FnZShtc2cpO1xuICAgIGNvbnNvbGUubG9nKFwiW3N0b3J5XSBBY2tub3dsZWRnZWQgbm9kZTpcIiwgbm9kZUlkLCBjaG9pY2VJZCA/IGAoY2hvaWNlOiAke2Nob2ljZUlkfSlgIDogXCJcIik7XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydCgpOiB2b2lkIHtcbiAgICBjb25zb2xlLmxvZyhcIltzdG9yeV0gU3RhcnRpbmcgc3RvcnkgY29udHJvbGxlclwiKTtcbiAgICAvLyBMaXN0ZW4gZm9yIHN0b3J5IG5vZGUgYWN0aXZhdGlvbiBmcm9tIHRoZSBzZXJ2ZXJcbiAgICBsaXN0ZW5lcnMucHVzaChidXMub24oXCJzdG9yeTpub2RlQWN0aXZhdGVkXCIsIGhhbmRsZU5vZGVBY3RpdmF0ZWQpKTtcblxuICAgIC8vIENoZWNrIGlmIHRoZXJlJ3MgYWxyZWFkeSBhbiBhY3RpdmUgc3Rvcnkgbm9kZSBvbiBzdGFydHVwXG4gICAgaWYgKHN0YXRlLnN0b3J5Py5hY3RpdmVOb2RlKSB7XG4gICAgICBjb25zb2xlLmxvZyhcIltzdG9yeV0gRm91bmQgYWN0aXZlIHN0b3J5IG5vZGUgb24gc3RhcnR1cDpcIiwgc3RhdGUuc3RvcnkuYWN0aXZlTm9kZSk7XG4gICAgICBoYW5kbGVOb2RlQWN0aXZhdGVkKHtcbiAgICAgICAgbm9kZUlkOiBzdGF0ZS5zdG9yeS5hY3RpdmVOb2RlLFxuICAgICAgICBkaWFsb2d1ZTogc3RhdGUuc3RvcnkuZGlhbG9ndWUgPz8gdW5kZWZpbmVkLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlVHV0b3JpYWxUaXAoKTtcbiAgICBsaXN0ZW5lcnMuZm9yRWFjaCgodW5zdWIpID0+IHVuc3ViKCkpO1xuICAgIGxpc3RlbmVycy5sZW5ndGggPSAwO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydCxcbiAgICBkZXN0cm95LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkgfSBmcm9tIFwiLi9vdmVybGF5XCI7XG5pbXBvcnQgeyBjcmVhdGVTdG9yeUNvbnRyb2xsZXIgfSBmcm9tIFwiLi9jb250cm9sbGVyXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlDb250cm9sbGVyIHtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICByZXNldCgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgTW91bnRTdG9yeU9wdGlvbnMge1xuICBidXM6IEV2ZW50QnVzO1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIHJvb21JZD86IHN0cmluZyB8IG51bGw7XG59XG5cbi8qKlxuICogTW91bnRzIHRoZSBzZXJ2ZXItZHJpdmVuIHN0b3J5IHN5c3RlbS5cbiAqIFN0b3J5IHByb2dyZXNzaW9uIGlzIG5vdyBjb250cm9sbGVkIGJ5IHRoZSBzZXJ2ZXIgREFHLFxuICogYW5kIHRoaXMgY29udHJvbGxlciBzaW1wbHkgZGlzcGxheXMgZGlhbG9ndWUgd2hlbiBub2RlcyBhcmUgYWN0aXZhdGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbW91bnRTdG9yeSh7IGJ1cywgc3RhdGUgfTogTW91bnRTdG9yeU9wdGlvbnMpOiBTdG9yeUNvbnRyb2xsZXIge1xuICBjb25zdCBvdmVybGF5ID0gY3JlYXRlRGlhbG9ndWVPdmVybGF5KCk7XG4gIGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVTdG9yeUNvbnRyb2xsZXIoe1xuICAgIGJ1cyxcbiAgICBvdmVybGF5LFxuICAgIHN0YXRlLFxuICB9KTtcbiAgXG4gIGNvbnRyb2xsZXIuc3RhcnQoKTtcblxuICByZXR1cm4ge1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICBjb250cm9sbGVyLmRlc3Ryb3koKTtcbiAgICAgIG92ZXJsYXkuZGVzdHJveSgpO1xuICAgIH0sXG4gICAgcmVzZXQoKSB7XG4gICAgICAvLyBSZXNldCBpcyBubyBsb25nZXIgbmVlZGVkIGFzIHN0YXRlIGlzIHNlcnZlci1hdXRob3JpdGF0aXZlXG4gICAgICAvLyBCdXQgd2Uga2VlcCB0aGUgaW50ZXJmYWNlIGZvciBjb21wYXRpYmlsaXR5XG4gICAgICBjb25zb2xlLndhcm4oXCJbc3RvcnldIHJlc2V0KCkgY2FsbGVkIGJ1dCBzdG9yeSBpcyBub3cgc2VydmVyLWRyaXZlblwiKTtcbiAgICB9LFxuICB9O1xufVxuXG4vLyBMZWdhY3kgZXhwb3J0cyBmb3IgY29tcGF0aWJpbGl0eVxuZXhwb3J0IGNvbnN0IElOVFJPX0NIQVBURVJfSUQgPSBcImludHJvXCI7XG5leHBvcnQgY29uc3QgSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMgPSBbXCIyQVwiLCBcIjJCXCIsIFwiMkNcIl0gYXMgY29uc3Q7XG4iLCAiLy8gc3JjL3N0YXJ0LWdhdGUudHNcbmV4cG9ydCB0eXBlIFN0YXJ0R2F0ZU9wdGlvbnMgPSB7XG4gIGxhYmVsPzogc3RyaW5nO1xuICByZXF1ZXN0RnVsbHNjcmVlbj86IGJvb2xlYW47XG4gIHJlc3VtZUF1ZGlvPzogKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQ7IC8vIGUuZy4sIGZyb20gc3Rvcnkvc2Z4LnRzXG59O1xuXG5jb25zdCBTVE9SQUdFX0tFWSA9IFwibHNkOm11dGVkXCI7XG5cbi8vIEhlbHBlcjogZ2V0IHRoZSBzaGFyZWQgQXVkaW9Db250ZXh0IHlvdSBleHBvc2Ugc29tZXdoZXJlIGluIHlvdXIgYXVkaW8gZW5naW5lOlxuLy8gICAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWCA9IGN0eDtcbmZ1bmN0aW9uIGdldEN0eCgpOiBBdWRpb0NvbnRleHQgfCBudWxsIHtcbiAgY29uc3QgQUMgPSAod2luZG93IGFzIGFueSkuQXVkaW9Db250ZXh0IHx8ICh3aW5kb3cgYXMgYW55KS53ZWJraXRBdWRpb0NvbnRleHQ7XG4gIGNvbnN0IGN0eCA9ICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYO1xuICByZXR1cm4gY3R4IGluc3RhbmNlb2YgQUMgPyBjdHggYXMgQXVkaW9Db250ZXh0IDogbnVsbDtcbn1cblxuY2xhc3MgTXV0ZU1hbmFnZXIge1xuICBwcml2YXRlIGJ1dHRvbnM6IEhUTUxCdXR0b25FbGVtZW50W10gPSBbXTtcbiAgcHJpdmF0ZSBlbmZvcmNpbmcgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvLyBrZWVwIFVJIGluIHN5bmMgaWYgc29tZW9uZSBlbHNlIHRvZ2dsZXNcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibHNkOm11dGVDaGFuZ2VkXCIsIChlOiBhbnkpID0+IHtcbiAgICAgIGNvbnN0IG11dGVkID0gISFlPy5kZXRhaWw/Lm11dGVkO1xuICAgICAgdGhpcy5hcHBseVVJKG11dGVkKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlzTXV0ZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFNUT1JBR0VfS0VZKSA9PT0gXCIxXCI7XG4gIH1cblxuICBwcml2YXRlIHNhdmUobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0cnkgeyBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShTVE9SQUdFX0tFWSwgbXV0ZWQgPyBcIjFcIiA6IFwiMFwiKTsgfSBjYXRjaCB7fVxuICB9XG5cbiAgcHJpdmF0ZSBsYWJlbChidG46IEhUTUxCdXR0b25FbGVtZW50LCBtdXRlZDogYm9vbGVhbikge1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgU3RyaW5nKG11dGVkKSk7XG4gICAgYnRuLnRpdGxlID0gbXV0ZWQgPyBcIlVubXV0ZSAoTSlcIiA6IFwiTXV0ZSAoTSlcIjtcbiAgICBidG4udGV4dENvbnRlbnQgPSBtdXRlZCA/IFwiXHVEODNEXHVERDA4IFVubXV0ZVwiIDogXCJcdUQ4M0RcdUREMDcgTXV0ZVwiO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseVVJKG11dGVkOiBib29sZWFuKSB7XG4gICAgdGhpcy5idXR0b25zLmZvckVhY2goYiA9PiB0aGlzLmxhYmVsKGIsIG11dGVkKSk7XG4gIH1cblxuICBhdHRhY2hCdXR0b24oYnRuOiBIVE1MQnV0dG9uRWxlbWVudCkge1xuICAgIHRoaXMuYnV0dG9ucy5wdXNoKGJ0bik7XG4gICAgdGhpcy5sYWJlbChidG4sIHRoaXMuaXNNdXRlZCgpKTtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMudG9nZ2xlKCkpO1xuICB9XG5cbiAgYXN5bmMgc2V0TXV0ZWQobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNhdmUobXV0ZWQpO1xuICAgIHRoaXMuYXBwbHlVSShtdXRlZCk7XG5cbiAgICBjb25zdCBjdHggPSBnZXRDdHgoKTtcbiAgICBpZiAoY3R4KSB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAobXV0ZWQgJiYgY3R4LnN0YXRlICE9PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgICAgICAgYXdhaXQgY3R4LnN1c3BlbmQoKTtcbiAgICAgICAgfSBlbHNlIGlmICghbXV0ZWQgJiYgY3R4LnN0YXRlICE9PSBcInJ1bm5pbmdcIikge1xuICAgICAgICAgIGF3YWl0IGN0eC5yZXN1bWUoKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXCJbYXVkaW9dIG11dGUgdG9nZ2xlIGZhaWxlZDpcIiwgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoXCJsc2Q6bXV0ZUNoYW5nZWRcIiwgeyBkZXRhaWw6IHsgbXV0ZWQgfSB9KSk7XG4gIH1cblxuICB0b2dnbGUoKSB7XG4gICAgdGhpcy5zZXRNdXRlZCghdGhpcy5pc011dGVkKCkpO1xuICB9XG5cbiAgLy8gSWYgY3R4IGlzbid0IGNyZWF0ZWQgdW50aWwgYWZ0ZXIgU3RhcnQsIGVuZm9yY2UgcGVyc2lzdGVkIHN0YXRlIG9uY2UgYXZhaWxhYmxlXG4gIGVuZm9yY2VPbmNlV2hlblJlYWR5KCkge1xuICAgIGlmICh0aGlzLmVuZm9yY2luZykgcmV0dXJuO1xuICAgIHRoaXMuZW5mb3JjaW5nID0gdHJ1ZTtcbiAgICBjb25zdCB0aWNrID0gKCkgPT4ge1xuICAgICAgY29uc3QgY3R4ID0gZ2V0Q3R4KCk7XG4gICAgICBpZiAoIWN0eCkgeyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGljayk7IHJldHVybjsgfVxuICAgICAgdGhpcy5zZXRNdXRlZCh0aGlzLmlzTXV0ZWQoKSk7XG4gICAgfTtcbiAgICB0aWNrKCk7XG4gIH1cbn1cblxuY29uc3QgbXV0ZU1nciA9IG5ldyBNdXRlTWFuYWdlcigpO1xuXG4vLyBJbnN0YWxsIGEgbXV0ZSBidXR0b24gaW4gdGhlIHRvcCBmcmFtZSAocmlnaHQgc2lkZSkgaWYgcG9zc2libGUuXG5mdW5jdGlvbiBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKSB7XG4gIGNvbnN0IHRvcFJpZ2h0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0b3AtcmlnaHRcIik7XG4gIGlmICghdG9wUmlnaHQpIHJldHVybjtcblxuICAvLyBBdm9pZCBkdXBsaWNhdGVzXG4gIGlmICh0b3BSaWdodC5xdWVyeVNlbGVjdG9yKFwiI211dGUtdG9wXCIpKSByZXR1cm47XG5cbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLmlkID0gXCJtdXRlLXRvcFwiO1xuICBidG4uY2xhc3NOYW1lID0gXCJnaG9zdC1idG4gc21hbGxcIjtcbiAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcImZhbHNlXCIpO1xuICBidG4udGl0bGUgPSBcIk11dGUgKE0pXCI7XG4gIGJ0bi50ZXh0Q29udGVudCA9IFwiXHVEODNEXHVERDA3IE11dGVcIjtcbiAgdG9wUmlnaHQuYXBwZW5kQ2hpbGQoYnRuKTtcbiAgbXV0ZU1nci5hdHRhY2hCdXR0b24oYnRuKTtcbn1cblxuLy8gR2xvYmFsIGtleWJvYXJkIHNob3J0Y3V0IChNKVxuKGZ1bmN0aW9uIGluc3RhbGxNdXRlSG90a2V5KCkge1xuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHtcbiAgICBpZiAoZS5rZXk/LnRvTG93ZXJDYXNlKCkgPT09IFwibVwiKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBtdXRlTWdyLnRvZ2dsZSgpO1xuICAgIH1cbiAgfSk7XG59KSgpO1xuXG5leHBvcnQgZnVuY3Rpb24gd2FpdEZvclVzZXJTdGFydChvcHRzOiBTdGFydEdhdGVPcHRpb25zID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgeyBsYWJlbCA9IFwiU3RhcnQgR2FtZVwiLCByZXF1ZXN0RnVsbHNjcmVlbiA9IGZhbHNlLCByZXN1bWVBdWRpbyB9ID0gb3B0cztcblxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAvLyBvdmVybGF5XG4gICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgb3ZlcmxheS5pZCA9IFwic3RhcnQtb3ZlcmxheVwiO1xuICAgIG92ZXJsYXkuaW5uZXJIVE1MID0gYFxuICAgICAgPGRpdiBpZD1cInN0YXJ0LWNvbnRhaW5lclwiPlxuICAgICAgICA8YnV0dG9uIGlkPVwic3RhcnQtYnRuXCIgYXJpYS1sYWJlbD1cIiR7bGFiZWx9XCI+JHtsYWJlbH08L2J1dHRvbj5cbiAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi10b3A6MTBweFwiPlxuICAgICAgICAgIDxidXR0b24gaWQ9XCJtdXRlLWJlbG93LXN0YXJ0XCIgY2xhc3M9XCJnaG9zdC1idG5cIiBhcmlhLXByZXNzZWQ9XCJmYWxzZVwiIHRpdGxlPVwiTXV0ZSAoTSlcIj5cdUQ4M0RcdUREMDcgTXV0ZTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPHA+IE9uIG1vYmlsZSB0dXJuIHBob25lIHRvIGxhbmRzY2FwZSBmb3IgYmVzdCBleHBlcmllbmNlLiA8L3A+XG4gICAgICA8L2Rpdj5cbiAgICBgO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgICAvLyBzdHlsZXMgKG1vdmUgdG8gQ1NTIGxhdGVyIGlmIHlvdSB3YW50KVxuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgI3N0YXJ0LW92ZXJsYXkge1xuICAgICAgICBwb3NpdGlvbjogZml4ZWQ7IGluc2V0OiAwOyBkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgYmFja2dyb3VuZDogcmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCBjZW50ZXIsIHJnYmEoMCwwLDAsMC42KSwgcmdiYSgwLDAsMCwwLjkpKTtcbiAgICAgICAgei1pbmRleDogOTk5OTtcbiAgICAgIH1cbiAgICAgICNzdGFydC1jb250YWluZXIgeyB0ZXh0LWFsaWduOiBjZW50ZXI7IH1cbiAgICAgICNzdGFydC1idG4ge1xuICAgICAgICBmb250LXNpemU6IDJyZW07IHBhZGRpbmc6IDFyZW0gMi41cmVtOyBib3JkZXI6IDJweCBzb2xpZCAjZmZmOyBib3JkZXItcmFkaXVzOiAxMHB4O1xuICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6ICNmZmY7IGN1cnNvcjogcG9pbnRlcjsgdHJhbnNpdGlvbjogdHJhbnNmb3JtIC4xMnMgZWFzZSwgYmFja2dyb3VuZCAuMnMgZWFzZSwgY29sb3IgLjJzIGVhc2U7XG4gICAgICB9XG4gICAgICAjc3RhcnQtYnRuOmhvdmVyIHsgYmFja2dyb3VuZDogI2ZmZjsgY29sb3I6ICMwMDA7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMXB4KTsgfVxuICAgICAgI3N0YXJ0LWJ0bjphY3RpdmUgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMCk7IH1cbiAgICAgICNtdXRlLWJlbG93LXN0YXJ0IHtcbiAgICAgICAgZm9udC1zaXplOiAxcmVtOyBwYWRkaW5nOiAuNXJlbSAxcmVtOyBib3JkZXItcmFkaXVzOiA5OTlweDsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgICAgYmFja2dyb3VuZDogcmdiYSgzMCwgNDEsIDU5LCAwLjcyKTsgY29sb3I6ICNmOGZhZmM7XG4gICAgICB9XG4gICAgICAuZ2hvc3QtYnRuLnNtYWxsIHsgcGFkZGluZzogNHB4IDhweDsgZm9udC1zaXplOiAxMXB4OyB9XG4gICAgYDtcbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcblxuICAgIC8vIFdpcmUgb3ZlcmxheSBidXR0b25zXG4gICAgY29uc3Qgc3RhcnRCdG4gPSBvdmVybGF5LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFwiI3N0YXJ0LWJ0blwiKSE7XG4gICAgY29uc3QgbXV0ZUJlbG93U3RhcnQgPSBvdmVybGF5LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFwiI211dGUtYmVsb3ctc3RhcnRcIikhO1xuICAgIGNvbnN0IHRvcE11dGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm11dGUtdG9wXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBpZiAodG9wTXV0ZSkgbXV0ZU1nci5hdHRhY2hCdXR0b24odG9wTXV0ZSk7XG4gICAgbXV0ZU1nci5hdHRhY2hCdXR0b24obXV0ZUJlbG93U3RhcnQpO1xuXG4gICAgLy8gcmVzdG9yZSBwZXJzaXN0ZWQgbXV0ZSBsYWJlbCBpbW1lZGlhdGVseVxuICAgIG11dGVNZ3IuZW5mb3JjZU9uY2VXaGVuUmVhZHkoKTtcblxuICAgIGNvbnN0IHN0YXJ0ID0gYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gYXVkaW8gZmlyc3QgKHVzZXIgZ2VzdHVyZSlcbiAgICAgIHRyeSB7IGF3YWl0IHJlc3VtZUF1ZGlvPy4oKTsgfSBjYXRjaCB7fVxuXG4gICAgICAvLyByZXNwZWN0IHBlcnNpc3RlZCBtdXRlIHN0YXRlIG5vdyB0aGF0IGN0eCBsaWtlbHkgZXhpc3RzXG4gICAgICBtdXRlTWdyLmVuZm9yY2VPbmNlV2hlblJlYWR5KCk7XG5cbiAgICAgIC8vIG9wdGlvbmFsIGZ1bGxzY3JlZW5cbiAgICAgIGlmIChyZXF1ZXN0RnVsbHNjcmVlbikge1xuICAgICAgICB0cnkgeyBhd2FpdCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQucmVxdWVzdEZ1bGxzY3JlZW4/LigpOyB9IGNhdGNoIHt9XG4gICAgICB9XG5cbiAgICAgIC8vIGNsZWFudXAgb3ZlcmxheVxuICAgICAgc3R5bGUucmVtb3ZlKCk7XG4gICAgICBvdmVybGF5LnJlbW92ZSgpO1xuXG4gICAgICAvLyBlbnN1cmUgdG9wLWZyYW1lIG11dGUgYnV0dG9uIGV4aXN0cyBhZnRlciBvdmVybGF5XG4gICAgICBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKTtcblxuICAgICAgcmVzb2x2ZSgpO1xuICAgIH07XG5cbiAgICAvLyBzdGFydCBidXR0b25cbiAgICBzdGFydEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgc3RhcnQsIHsgb25jZTogdHJ1ZSB9KTtcblxuICAgIC8vIEFjY2Vzc2liaWxpdHk6IGFsbG93IEVudGVyIC8gU3BhY2VcbiAgICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XG4gICAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiB8fCBlLmtleSA9PT0gXCIgXCIpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBzdGFydCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gRm9jdXMgZm9yIGtleWJvYXJkIHVzZXJzXG4gICAgc3RhcnRCdG4udGFiSW5kZXggPSAwO1xuICAgIHN0YXJ0QnRuLmZvY3VzKCk7XG5cbiAgICAvLyBBbHNvIHRyeSB0byBjcmVhdGUgdGhlIHRvcC1mcmFtZSBtdXRlIGltbWVkaWF0ZWx5IGlmIERPTSBpcyByZWFkeVxuICAgIC8vIChJZiAjdG9wLXJpZ2h0IGlzbid0IHRoZXJlIHlldCwgaXQncyBoYXJtbGVzczsgd2UnbGwgYWRkIGl0IGFmdGVyIHN0YXJ0IHRvby4pXG4gICAgZW5zdXJlVG9wRnJhbWVNdXRlQnV0dG9uKCk7XG4gIH0pO1xufVxuIiwgImltcG9ydCB0eXBlIHsgUFJORyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBBdWRpb0VuZ2luZSB7XG4gIHByaXZhdGUgc3RhdGljIF9pbnN0OiBBdWRpb0VuZ2luZSB8IG51bGwgPSBudWxsO1xuXG4gIHB1YmxpYyByZWFkb25seSBjdHg6IEF1ZGlvQ29udGV4dDtcbiAgcHJpdmF0ZSByZWFkb25seSBtYXN0ZXI6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHJlYWRvbmx5IG11c2ljQnVzOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSByZWFkb25seSBzZnhCdXM6IEdhaW5Ob2RlO1xuXG4gIHByaXZhdGUgX3RhcmdldE1hc3RlciA9IDAuOTtcbiAgcHJpdmF0ZSBfdGFyZ2V0TXVzaWMgPSAwLjk7XG4gIHByaXZhdGUgX3RhcmdldFNmeCA9IDAuOTtcblxuICBzdGF0aWMgZ2V0KCk6IEF1ZGlvRW5naW5lIHtcbiAgICBpZiAoIXRoaXMuX2luc3QpIHRoaXMuX2luc3QgPSBuZXcgQXVkaW9FbmdpbmUoKTtcbiAgICByZXR1cm4gdGhpcy5faW5zdDtcbiAgfVxuXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5jdHggPSBuZXcgQXVkaW9Db250ZXh0KCk7XG4gICAgKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFggPSAodGhpcyBhcyBhbnkpLmN0eDtcblxuICAgIHRoaXMubWFzdGVyID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldE1hc3RlciB9KTtcbiAgICB0aGlzLm11c2ljQnVzID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldE11c2ljIH0pO1xuICAgIHRoaXMuc2Z4QnVzID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldFNmeCB9KTtcblxuICAgIHRoaXMubXVzaWNCdXMuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5zZnhCdXMuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5tYXN0ZXIuY29ubmVjdCh0aGlzLmN0eC5kZXN0aW5hdGlvbik7XG4gIH1cblxuICBnZXQgbm93KCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICB9XG5cbiAgZ2V0TXVzaWNCdXMoKTogR2Fpbk5vZGUge1xuICAgIHJldHVybiB0aGlzLm11c2ljQnVzO1xuICB9XG5cbiAgZ2V0U2Z4QnVzKCk6IEdhaW5Ob2RlIHtcbiAgICByZXR1cm4gdGhpcy5zZnhCdXM7XG4gIH1cblxuICBhc3luYyByZXN1bWUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuY3R4LnN0YXRlID09PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgICBhd2FpdCB0aGlzLmN0eC5yZXN1bWUoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzdXNwZW5kKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmN0eC5zdGF0ZSA9PT0gXCJydW5uaW5nXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuY3R4LnN1c3BlbmQoKTtcbiAgICB9XG4gIH1cblxuICBzZXRNYXN0ZXJHYWluKHY6IG51bWJlciwgdCA9IHRoaXMubm93LCByYW1wID0gMC4wMyk6IHZvaWQge1xuICAgIHRoaXMuX3RhcmdldE1hc3RlciA9IHY7XG4gICAgdGhpcy5tYXN0ZXIuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tYXN0ZXIuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2LCB0ICsgcmFtcCk7XG4gIH1cblxuICBzZXRNdXNpY0dhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0TXVzaWMgPSB2O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIHNldFNmeEdhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0U2Z4ID0gdjtcbiAgICB0aGlzLnNmeEJ1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLnNmeEJ1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIGR1Y2tNdXNpYyhsZXZlbCA9IDAuNCwgYXR0YWNrID0gMC4wNSk6IHZvaWQge1xuICAgIGNvbnN0IHQgPSB0aGlzLm5vdztcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShsZXZlbCwgdCArIGF0dGFjayk7XG4gIH1cblxuICB1bmR1Y2tNdXNpYyhyZWxlYXNlID0gMC4yNSk6IHZvaWQge1xuICAgIGNvbnN0IHQgPSB0aGlzLm5vdztcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0aGlzLl90YXJnZXRNdXNpYywgdCArIHJlbGVhc2UpO1xuICB9XG59XG5cbi8vIFRpbnkgc2VlZGFibGUgUFJORyAoTXVsYmVycnkzMilcbmV4cG9ydCBmdW5jdGlvbiBtYWtlUFJORyhzZWVkOiBudW1iZXIpOiBQUk5HIHtcbiAgbGV0IHMgPSAoc2VlZCA+Pj4gMCkgfHwgMTtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICBzICs9IDB4NkQyQjc5RjU7XG4gICAgbGV0IHQgPSBNYXRoLmltdWwocyBeIChzID4+PiAxNSksIDEgfCBzKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgNjEgfCB0KTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cbiIsICIvLyBMb3ctbGV2ZWwgZ3JhcGggYnVpbGRlcnMgLyBoZWxwZXJzXG5cbmV4cG9ydCBmdW5jdGlvbiBvc2MoY3R4OiBBdWRpb0NvbnRleHQsIHR5cGU6IE9zY2lsbGF0b3JUeXBlLCBmcmVxOiBudW1iZXIpIHtcbiAgcmV0dXJuIG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZSwgZnJlcXVlbmN5OiBmcmVxIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9pc2UoY3R4OiBBdWRpb0NvbnRleHQpIHtcbiAgY29uc3QgYnVmZmVyID0gY3R4LmNyZWF0ZUJ1ZmZlcigxLCBjdHguc2FtcGxlUmF0ZSAqIDIsIGN0eC5zYW1wbGVSYXRlKTtcbiAgY29uc3QgZGF0YSA9IGJ1ZmZlci5nZXRDaGFubmVsRGF0YSgwKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSBkYXRhW2ldID0gTWF0aC5yYW5kb20oKSAqIDIgLSAxO1xuICByZXR1cm4gbmV3IEF1ZGlvQnVmZmVyU291cmNlTm9kZShjdHgsIHsgYnVmZmVyLCBsb29wOiB0cnVlIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFrZVBhbm5lcihjdHg6IEF1ZGlvQ29udGV4dCwgcGFuID0gMCkge1xuICByZXR1cm4gbmV3IFN0ZXJlb1Bhbm5lck5vZGUoY3R4LCB7IHBhbiB9KTtcbn1cblxuLyoqIEJhc2ljIEFEU1IgYXBwbGllZCB0byBhIEdhaW5Ob2RlIEF1ZGlvUGFyYW0uIFJldHVybnMgYSBmdW5jdGlvbiB0byByZWxlYXNlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFkc3IoXG4gIGN0eDogQXVkaW9Db250ZXh0LFxuICBwYXJhbTogQXVkaW9QYXJhbSxcbiAgdDA6IG51bWJlcixcbiAgYSA9IDAuMDEsIC8vIGF0dGFja1xuICBkID0gMC4wOCwgLy8gZGVjYXlcbiAgcyA9IDAuNSwgIC8vIHN1c3RhaW4gKDAuLjEgb2YgcGVhaylcbiAgciA9IDAuMiwgIC8vIHJlbGVhc2VcbiAgcGVhayA9IDFcbikge1xuICBwYXJhbS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModDApO1xuICBwYXJhbS5zZXRWYWx1ZUF0VGltZSgwLCB0MCk7XG4gIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHBlYWssIHQwICsgYSk7XG4gIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHMgKiBwZWFrLCB0MCArIGEgKyBkKTtcbiAgcmV0dXJuIChyZWxlYXNlQXQgPSBjdHguY3VycmVudFRpbWUpID0+IHtcbiAgICBwYXJhbS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMocmVsZWFzZUF0KTtcbiAgICAvLyBhdm9pZCBzdWRkZW4ganVtcHM7IGNvbnRpbnVlIGZyb20gY3VycmVudFxuICAgIHBhcmFtLnNldFZhbHVlQXRUaW1lKHBhcmFtLnZhbHVlLCByZWxlYXNlQXQpO1xuICAgIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwMSwgcmVsZWFzZUF0ICsgcik7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsZm9Ub1BhcmFtKFxuICBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgdGFyZ2V0OiBBdWRpb1BhcmFtLFxuICB7IGZyZXF1ZW5jeSA9IDAuMSwgZGVwdGggPSAzMDAsIHR5cGUgPSBcInNpbmVcIiBhcyBPc2NpbGxhdG9yVHlwZSB9ID0ge31cbikge1xuICBjb25zdCBsZm8gPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGUsIGZyZXF1ZW5jeSB9KTtcbiAgY29uc3QgYW1wID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiBkZXB0aCB9KTtcbiAgbGZvLmNvbm5lY3QoYW1wKS5jb25uZWN0KHRhcmdldCk7XG4gIHJldHVybiB7XG4gICAgc3RhcnQoYXQgPSBjdHguY3VycmVudFRpbWUpIHsgbGZvLnN0YXJ0KGF0KTsgfSxcbiAgICBzdG9wKGF0ID0gY3R4LmN1cnJlbnRUaW1lKSB7IGxmby5zdG9wKGF0KTsgYW1wLmRpc2Nvbm5lY3QoKTsgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgYWRzciwgbWFrZVBhbm5lciwgbm9pc2UsIG9zYyB9IGZyb20gXCIuL2dyYXBoXCI7XG5pbXBvcnQgdHlwZSB7IFNmeE5hbWUgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG4vKiogRmlyZS1hbmQtZm9yZ2V0IFNGWCBieSBuYW1lLCB3aXRoIHNpbXBsZSBwYXJhbXMuICovXG5leHBvcnQgZnVuY3Rpb24gcGxheVNmeChcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgbmFtZTogU2Z4TmFtZSxcbiAgb3B0czogeyB2ZWxvY2l0eT86IG51bWJlcjsgcGFuPzogbnVtYmVyIH0gPSB7fVxuKSB7XG4gIHN3aXRjaCAobmFtZSkge1xuICAgIGNhc2UgXCJsYXNlclwiOiByZXR1cm4gcGxheUxhc2VyKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcInRocnVzdFwiOiByZXR1cm4gcGxheVRocnVzdChlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJleHBsb3Npb25cIjogcmV0dXJuIHBsYXlFeHBsb3Npb24oZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwibG9ja1wiOiByZXR1cm4gcGxheUxvY2soZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwidWlcIjogcmV0dXJuIHBsYXlVaShlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJkaWFsb2d1ZVwiOiByZXR1cm4gcGxheURpYWxvZ3VlKGVuZ2luZSwgb3B0cyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlMYXNlcihcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbyA9IG9zYyhjdHgsIFwic3F1YXJlXCIsIDY4MCArIDE2MCAqIHZlbG9jaXR5KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwgeyB0eXBlOiBcImxvd3Bhc3NcIiwgZnJlcXVlbmN5OiAxMjAwIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgby5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAyLCAwLjAzLCAwLjI1LCAwLjA4LCAwLjY1KTtcbiAgby5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMDYpO1xuICBvLnN0b3Aobm93ICsgMC4yKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlUaHJ1c3QoXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAwLjYsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbiA9IG5vaXNlKGN0eCk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHtcbiAgICB0eXBlOiBcImJhbmRwYXNzXCIsXG4gICAgZnJlcXVlbmN5OiAxODAgKyAzNjAgKiB2ZWxvY2l0eSxcbiAgICBROiAxLjEsXG4gIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbi5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDEyLCAwLjE1LCAwLjc1LCAwLjI1LCAwLjQ1ICogdmVsb2NpdHkpO1xuICBuLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4yNSk7XG4gIG4uc3RvcChub3cgKyAxLjApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUV4cGxvc2lvbihcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbiA9IG5vaXNlKGN0eCk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHtcbiAgICB0eXBlOiBcImxvd3Bhc3NcIixcbiAgICBmcmVxdWVuY3k6IDIyMDAgKiBNYXRoLm1heCgwLjIsIE1hdGgubWluKHZlbG9jaXR5LCAxKSksXG4gICAgUTogMC4yLFxuICB9KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG4uY29ubmVjdChmKS5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwNSwgMC4wOCwgMC41LCAwLjM1LCAxLjEgKiB2ZWxvY2l0eSk7XG4gIG4uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjE1ICsgMC4xICogdmVsb2NpdHkpO1xuICBuLnN0b3Aobm93ICsgMS4yKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlMb2NrKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBiYXNlID0gNTIwICsgMTQwICogdmVsb2NpdHk7XG4gIGNvbnN0IG8xID0gb3NjKGN0eCwgXCJzaW5lXCIsIGJhc2UpO1xuICBjb25zdCBvMiA9IG9zYyhjdHgsIFwic2luZVwiLCBiYXNlICogMS41KTtcblxuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbzEuY29ubmVjdChnKTsgbzIuY29ubmVjdChnKTtcbiAgZy5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcblxuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwMSwgMC4wMiwgMC4wLCAwLjEyLCAwLjYpO1xuICBvMS5zdGFydChub3cpOyBvMi5zdGFydChub3cgKyAwLjAyKTtcbiAgcmVsZWFzZShub3cgKyAwLjA2KTtcbiAgbzEuc3RvcChub3cgKyAwLjIpOyBvMi5zdG9wKG5vdyArIDAuMjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheVVpKGVuZ2luZTogQXVkaW9FbmdpbmUsIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fSkge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBvID0gb3NjKGN0eCwgXCJ0cmlhbmdsZVwiLCA4ODAgLSAxMjAgKiB2ZWxvY2l0eSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAxLCAwLjA0LCAwLjAsIDAuMDgsIDAuMzUpO1xuICBvLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4wNSk7XG4gIG8uc3RvcChub3cgKyAwLjE4KTtcbn1cblxuLyoqIERpYWxvZ3VlIGN1ZSB1c2VkIGJ5IHRoZSBzdG9yeSBvdmVybGF5IChzaG9ydCwgZ2VudGxlIHBpbmcpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYXlEaWFsb2d1ZShlbmdpbmU6IEF1ZGlvRW5naW5lLCB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge30pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgZnJlcSA9IDQ4MCArIDE2MCAqIHZlbG9jaXR5O1xuICBjb25zdCBvID0gb3NjKGN0eCwgXCJzaW5lXCIsIGZyZXEpO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwLjAwMDEgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSgwLjAwMDEsIG5vdyk7XG4gIGcuZ2Fpbi5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKDAuMDQsIG5vdyArIDAuMDIpO1xuICBnLmdhaW4uZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDUsIG5vdyArIDAuMjgpO1xuXG4gIG8uc3RhcnQobm93KTtcbiAgby5zdG9wKG5vdyArIDAuMyk7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTdG9yeUludGVudCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuLi9hdWRpby9lbmdpbmVcIjtcbmltcG9ydCB7IHBsYXlEaWFsb2d1ZSBhcyBwbGF5RGlhbG9ndWVTZnggfSBmcm9tIFwiLi4vYXVkaW8vc2Z4XCI7XG5cbmxldCBsYXN0UGxheWVkQXQgPSAwO1xuXG4vLyBNYWludGFpbiB0aGUgb2xkIHB1YmxpYyBBUEkgc28gZW5naW5lLnRzIGRvZXNuJ3QgY2hhbmdlXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXVkaW9Db250ZXh0KCk6IEF1ZGlvQ29udGV4dCB7XG4gIHJldHVybiBBdWRpb0VuZ2luZS5nZXQoKS5jdHg7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXN1bWVBdWRpbygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgQXVkaW9FbmdpbmUuZ2V0KCkucmVzdW1lKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RGlhbG9ndWVDdWUoaW50ZW50OiBTdG9yeUludGVudCk6IHZvaWQge1xuICBjb25zdCBlbmdpbmUgPSBBdWRpb0VuZ2luZS5nZXQoKTtcbiAgY29uc3Qgbm93ID0gZW5naW5lLm5vdztcblxuICAvLyBUaHJvdHRsZSByYXBpZCBjdWVzIHRvIGF2b2lkIGNsdXR0ZXJcbiAgaWYgKG5vdyAtIGxhc3RQbGF5ZWRBdCA8IDAuMSkgcmV0dXJuO1xuICBsYXN0UGxheWVkQXQgPSBub3c7XG5cbiAgLy8gTWFwIFwiZmFjdG9yeVwiIHZzIG90aGVycyB0byBhIHNsaWdodGx5IGRpZmZlcmVudCB2ZWxvY2l0eSAoYnJpZ2h0bmVzcylcbiAgY29uc3QgdmVsb2NpdHkgPSBpbnRlbnQgPT09IFwiZmFjdG9yeVwiID8gMC44IDogMC41O1xuICBwbGF5RGlhbG9ndWVTZngoZW5naW5lLCB7IHZlbG9jaXR5LCBwYW46IDAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdXNwZW5kRGlhbG9ndWVBdWRpbygpOiB2b2lkIHtcbiAgdm9pZCBBdWRpb0VuZ2luZS5nZXQoKS5zdXNwZW5kKCk7XG59XG4iLCAiaW1wb3J0IHsgbWFrZVBSTkcgfSBmcm9tIFwiLi4vLi4vZW5naW5lXCI7XG5cbmV4cG9ydCB0eXBlIEFtYmllbnRQYXJhbXMgPSB7XG4gIGludGVuc2l0eTogbnVtYmVyOyAgLy8gb3ZlcmFsbCBsb3VkbmVzcyAvIGVuZXJneSAoMC4uMSlcbiAgYnJpZ2h0bmVzczogbnVtYmVyOyAvLyBmaWx0ZXIgb3Blbm5lc3MgJiBjaG9yZCB0aW1icmUgKDAuLjEpXG4gIGRlbnNpdHk6IG51bWJlcjsgICAgLy8gY2hvcmQgc3Bhd24gcmF0ZSAvIHRoaWNrbmVzcyAoMC4uMSlcbn07XG5cbnR5cGUgTW9kZU5hbWUgPSBcIklvbmlhblwiIHwgXCJEb3JpYW5cIiB8IFwiUGhyeWdpYW5cIiB8IFwiTHlkaWFuXCIgfCBcIk1peG9seWRpYW5cIiB8IFwiQWVvbGlhblwiIHwgXCJMb2NyaWFuXCI7XG5cbmNvbnN0IE1PREVTOiBSZWNvcmQ8TW9kZU5hbWUsIG51bWJlcltdPiA9IHtcbiAgSW9uaWFuOiAgICAgWzAsMiw0LDUsNyw5LDExXSxcbiAgRG9yaWFuOiAgICAgWzAsMiwzLDUsNyw5LDEwXSxcbiAgUGhyeWdpYW46ICAgWzAsMSwzLDUsNyw4LDEwXSxcbiAgTHlkaWFuOiAgICAgWzAsMiw0LDYsNyw5LDExXSxcbiAgTWl4b2x5ZGlhbjogWzAsMiw0LDUsNyw5LDEwXSxcbiAgQWVvbGlhbjogICAgWzAsMiwzLDUsNyw4LDEwXSxcbiAgTG9jcmlhbjogICAgWzAsMSwzLDUsNiw4LDEwXSxcbn07XG5cbi8vIE11c2ljYWwgY29uc3RhbnRzIHR1bmVkIHRvIG1hdGNoIHRoZSBIVE1MIHZlcnNpb25cbmNvbnN0IFJPT1RfTUFYX0dBSU4gICAgID0gMC4zMztcbmNvbnN0IFJPT1RfU1dFTExfVElNRSAgID0gMjA7XG5jb25zdCBEUk9ORV9TSElGVF9NSU5fUyA9IDI0O1xuY29uc3QgRFJPTkVfU0hJRlRfTUFYX1MgPSA0ODtcbmNvbnN0IERST05FX0dMSURFX01JTl9TID0gODtcbmNvbnN0IERST05FX0dMSURFX01BWF9TID0gMTU7XG5cbmNvbnN0IENIT1JEX1ZPSUNFU19NQVggID0gNTtcbmNvbnN0IENIT1JEX0ZBREVfTUlOX1MgID0gODtcbmNvbnN0IENIT1JEX0ZBREVfTUFYX1MgID0gMTY7XG5jb25zdCBDSE9SRF9IT0xEX01JTl9TICA9IDEwO1xuY29uc3QgQ0hPUkRfSE9MRF9NQVhfUyAgPSAyMjtcbmNvbnN0IENIT1JEX0dBUF9NSU5fUyAgID0gNDtcbmNvbnN0IENIT1JEX0dBUF9NQVhfUyAgID0gOTtcbmNvbnN0IENIT1JEX0FOQ0hPUl9QUk9CID0gMC42OyAvLyBwcmVmZXIgYWxpZ25pbmcgY2hvcmQgcm9vdCB0byBkcm9uZVxuXG5jb25zdCBGSUxURVJfQkFTRV9IWiAgICA9IDIyMDtcbmNvbnN0IEZJTFRFUl9QRUFLX0haICAgID0gNDIwMDtcbmNvbnN0IFNXRUVQX1NFR19TICAgICAgID0gMzA7ICAvLyB1cCB0aGVuIGRvd24sIHZlcnkgc2xvd1xuY29uc3QgTEZPX1JBVEVfSFogICAgICAgPSAwLjA1O1xuY29uc3QgTEZPX0RFUFRIX0haICAgICAgPSA5MDA7XG5cbmNvbnN0IERFTEFZX1RJTUVfUyAgICAgID0gMC40NTtcbmNvbnN0IEZFRURCQUNLX0dBSU4gICAgID0gMC4zNTtcbmNvbnN0IFdFVF9NSVggICAgICAgICAgID0gMC4yODtcblxuLy8gZGVncmVlIHByZWZlcmVuY2UgZm9yIGRyb25lIG1vdmVzOiAxLDUsMyw2LDIsNCw3IChpbmRleGVzIDAuLjYpXG5jb25zdCBQUkVGRVJSRURfREVHUkVFX09SREVSID0gWzAsNCwyLDUsMSwzLDZdO1xuXG4vKiogVXRpbGl0eSAqL1xuY29uc3QgY2xhbXAwMSA9ICh4OiBudW1iZXIpID0+IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIHgpKTtcbmNvbnN0IHJhbmQgPSAocm5nOiAoKSA9PiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBhICsgcm5nKCkgKiAoYiAtIGEpO1xuY29uc3QgY2hvaWNlID0gPFQsPihybmc6ICgpID0+IG51bWJlciwgYXJyOiBUW10pID0+IGFycltNYXRoLmZsb29yKHJuZygpICogYXJyLmxlbmd0aCldO1xuXG5jb25zdCBtaWRpVG9GcmVxID0gKG06IG51bWJlcikgPT4gNDQwICogTWF0aC5wb3coMiwgKG0gLSA2OSkgLyAxMik7XG5cbi8qKiBBIHNpbmdsZSBzdGVhZHkgb3NjaWxsYXRvciB2b2ljZSB3aXRoIHNoaW1tZXIgZGV0dW5lIGFuZCBnYWluIGVudmVsb3BlLiAqL1xuY2xhc3MgVm9pY2Uge1xuICBwcml2YXRlIGtpbGxlZCA9IGZhbHNlO1xuICBwcml2YXRlIHNoaW1tZXI6IE9zY2lsbGF0b3JOb2RlO1xuICBwcml2YXRlIHNoaW1tZXJHYWluOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBzY2FsZTogR2Fpbk5vZGU7XG4gIHB1YmxpYyBnOiBHYWluTm9kZTtcbiAgcHVibGljIG9zYzogT3NjaWxsYXRvck5vZGU7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgICBwcml2YXRlIHRhcmdldEdhaW46IG51bWJlcixcbiAgICB3YXZlZm9ybTogT3NjaWxsYXRvclR5cGUsXG4gICAgZnJlcUh6OiBudW1iZXIsXG4gICAgZGVzdGluYXRpb246IEF1ZGlvTm9kZSxcbiAgICBybmc6ICgpID0+IG51bWJlclxuICApe1xuICAgIHRoaXMub3NjID0gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlOiB3YXZlZm9ybSwgZnJlcXVlbmN5OiBmcmVxSHogfSk7XG5cbiAgICAvLyBzdWJ0bGUgc2hpbW1lciB2aWEgZGV0dW5lIG1vZHVsYXRpb25cbiAgICB0aGlzLnNoaW1tZXIgPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGU6IFwic2luZVwiLCBmcmVxdWVuY3k6IHJhbmQocm5nLCAwLjA2LCAwLjE4KSB9KTtcbiAgICB0aGlzLnNoaW1tZXJHYWluID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiByYW5kKHJuZywgMC40LCAxLjIpIH0pO1xuICAgIHRoaXMuc2NhbGUgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDI1IH0pOyAvLyBjZW50cyByYW5nZVxuICAgIHRoaXMuc2hpbW1lci5jb25uZWN0KHRoaXMuc2hpbW1lckdhaW4pLmNvbm5lY3QodGhpcy5zY2FsZSkuY29ubmVjdCh0aGlzLm9zYy5kZXR1bmUpO1xuXG4gICAgdGhpcy5nID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICAgIHRoaXMub3NjLmNvbm5lY3QodGhpcy5nKS5jb25uZWN0KGRlc3RpbmF0aW9uKTtcblxuICAgIHRoaXMub3NjLnN0YXJ0KCk7XG4gICAgdGhpcy5zaGltbWVyLnN0YXJ0KCk7XG4gIH1cblxuICBmYWRlSW4oc2Vjb25kczogbnVtYmVyKSB7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgdGhpcy5nLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdGhpcy5nLmdhaW4uc2V0VmFsdWVBdFRpbWUodGhpcy5nLmdhaW4udmFsdWUsIG5vdyk7XG4gICAgdGhpcy5nLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGhpcy50YXJnZXRHYWluLCBub3cgKyBzZWNvbmRzKTtcbiAgfVxuXG4gIGZhZGVPdXRLaWxsKHNlY29uZHM6IG51bWJlcikge1xuICAgIGlmICh0aGlzLmtpbGxlZCkgcmV0dXJuO1xuICAgIHRoaXMua2lsbGVkID0gdHJ1ZTtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICB0aGlzLmcuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSh0aGlzLmcuZ2Fpbi52YWx1ZSwgbm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDEsIG5vdyArIHNlY29uZHMpO1xuICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5zdG9wKCksIHNlY29uZHMgKiAxMDAwICsgNjApO1xuICB9XG5cbiAgc2V0RnJlcUdsaWRlKHRhcmdldEh6OiBudW1iZXIsIGdsaWRlU2Vjb25kczogbnVtYmVyKSB7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgLy8gZXhwb25lbnRpYWwgd2hlbiBwb3NzaWJsZSBmb3Igc21vb3RobmVzc1xuICAgIGNvbnN0IGN1cnJlbnQgPSBNYXRoLm1heCgwLjAwMDEsIHRoaXMub3NjLmZyZXF1ZW5jeS52YWx1ZSk7XG4gICAgdGhpcy5vc2MuZnJlcXVlbmN5LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kuc2V0VmFsdWVBdFRpbWUoY3VycmVudCwgbm93KTtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKHRhcmdldEh6LCBub3cgKyBnbGlkZVNlY29uZHMpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRhcmdldEh6LCBub3cgKyBnbGlkZVNlY29uZHMpO1xuICAgIH1cbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgdHJ5IHsgdGhpcy5vc2Muc3RvcCgpOyB0aGlzLnNoaW1tZXIuc3RvcCgpOyB9IGNhdGNoIHt9XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMub3NjLmRpc2Nvbm5lY3QoKTsgdGhpcy5zaGltbWVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHRoaXMuZy5kaXNjb25uZWN0KCk7IHRoaXMuc2hpbW1lckdhaW4uZGlzY29ubmVjdCgpOyB0aGlzLnNjYWxlLmRpc2Nvbm5lY3QoKTtcbiAgICB9IGNhdGNoIHt9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEFtYmllbnRTY2VuZSB7XG4gIHByaXZhdGUgcnVubmluZyA9IGZhbHNlO1xuICBwcml2YXRlIHN0b3BGbnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG4gIHByaXZhdGUgdGltZW91dHM6IG51bWJlcltdID0gW107XG5cbiAgcHJpdmF0ZSBwYXJhbXM6IEFtYmllbnRQYXJhbXMgPSB7IGludGVuc2l0eTogMC43NSwgYnJpZ2h0bmVzczogMC41LCBkZW5zaXR5OiAwLjYgfTtcblxuICBwcml2YXRlIHJuZzogKCkgPT4gbnVtYmVyO1xuICBwcml2YXRlIG1hc3RlciE6IEdhaW5Ob2RlO1xuICBwcml2YXRlIGZpbHRlciE6IEJpcXVhZEZpbHRlck5vZGU7XG4gIHByaXZhdGUgZHJ5ITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgd2V0ITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgZGVsYXkhOiBEZWxheU5vZGU7XG4gIHByaXZhdGUgZmVlZGJhY2shOiBHYWluTm9kZTtcblxuICBwcml2YXRlIGxmb05vZGU/OiBPc2NpbGxhdG9yTm9kZTtcbiAgcHJpdmF0ZSBsZm9HYWluPzogR2Fpbk5vZGU7XG5cbiAgLy8gbXVzaWNhbCBzdGF0ZVxuICBwcml2YXRlIGtleVJvb3RNaWRpID0gNDM7XG4gIHByaXZhdGUgbW9kZTogTW9kZU5hbWUgPSBcIklvbmlhblwiO1xuICBwcml2YXRlIGRyb25lRGVncmVlSWR4ID0gMDtcbiAgcHJpdmF0ZSByb290Vm9pY2U6IFZvaWNlIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgICBwcml2YXRlIG91dDogR2Fpbk5vZGUsXG4gICAgc2VlZCA9IDFcbiAgKSB7XG4gICAgdGhpcy5ybmcgPSBtYWtlUFJORyhzZWVkKTtcbiAgfVxuXG4gIHNldFBhcmFtPEsgZXh0ZW5kcyBrZXlvZiBBbWJpZW50UGFyYW1zPihrOiBLLCB2OiBBbWJpZW50UGFyYW1zW0tdKSB7XG4gICAgdGhpcy5wYXJhbXNba10gPSBjbGFtcDAxKHYpO1xuICAgIGlmICh0aGlzLnJ1bm5pbmcgJiYgayA9PT0gXCJpbnRlbnNpdHlcIiAmJiB0aGlzLm1hc3Rlcikge1xuICAgICAgdGhpcy5tYXN0ZXIuZ2Fpbi52YWx1ZSA9IDAuMTUgKyAwLjg1ICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5OyBcbiAgICB9XG4gIH1cblxuICBzdGFydCgpIHtcbiAgICBpZiAodGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcblxuICAgIC8vIC0tLS0gQ29yZSBncmFwaCAoZmlsdGVyIC0+IGRyeStkZWxheSAtPiBtYXN0ZXIgLT4gb3V0KSAtLS0tXG4gICAgdGhpcy5tYXN0ZXIgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogMC4xNSArIDAuODUgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHkgfSk7XG4gICAgdGhpcy5maWx0ZXIgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZSh0aGlzLmN0eCwgeyB0eXBlOiBcImxvd3Bhc3NcIiwgUTogMC43MDcgfSk7XG4gICAgdGhpcy5kcnkgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogMSB9KTtcbiAgICB0aGlzLndldCA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBXRVRfTUlYIH0pO1xuICAgIHRoaXMuZGVsYXkgPSBuZXcgRGVsYXlOb2RlKHRoaXMuY3R4LCB7IGRlbGF5VGltZTogREVMQVlfVElNRV9TLCBtYXhEZWxheVRpbWU6IDIgfSk7XG4gICAgdGhpcy5mZWVkYmFjayA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBGRUVEQkFDS19HQUlOIH0pO1xuXG4gICAgdGhpcy5maWx0ZXIuY29ubmVjdCh0aGlzLmRyeSkuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5maWx0ZXIuY29ubmVjdCh0aGlzLmRlbGF5KTtcbiAgICB0aGlzLmRlbGF5LmNvbm5lY3QodGhpcy5mZWVkYmFjaykuY29ubmVjdCh0aGlzLmRlbGF5KTtcbiAgICB0aGlzLmRlbGF5LmNvbm5lY3QodGhpcy53ZXQpLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMubWFzdGVyLmNvbm5lY3QodGhpcy5vdXQpO1xuXG4gICAgLy8gLS0tLSBGaWx0ZXIgYmFzZWxpbmUgKyBzbG93IHN3ZWVwcyAtLS0tXG4gICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFZhbHVlQXRUaW1lKEZJTFRFUl9CQVNFX0haLCB0aGlzLmN0eC5jdXJyZW50VGltZSk7XG4gICAgY29uc3Qgc3dlZXAgPSAoKSA9PiB7XG4gICAgICBjb25zdCB0ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgICAgLy8gdXAgdGhlbiBkb3duIHVzaW5nIHZlcnkgc2xvdyB0aW1lIGNvbnN0YW50c1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFRhcmdldEF0VGltZShcbiAgICAgICAgRklMVEVSX0JBU0VfSFogKyAoRklMVEVSX1BFQUtfSFogLSBGSUxURVJfQkFTRV9IWikgKiAoMC40ICsgMC42ICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyksXG4gICAgICAgIHQsIFNXRUVQX1NFR19TIC8gM1xuICAgICAgKTtcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5zZXRUYXJnZXRBdFRpbWUoXG4gICAgICAgIEZJTFRFUl9CQVNFX0haICogKDAuNyArIDAuMyAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpLFxuICAgICAgICB0ICsgU1dFRVBfU0VHX1MsIFNXRUVQX1NFR19TIC8gM1xuICAgICAgKTtcbiAgICAgIHRoaXMudGltZW91dHMucHVzaCh3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB0aGlzLnJ1bm5pbmcgJiYgc3dlZXAoKSwgKFNXRUVQX1NFR19TICogMikgKiAxMDAwKSBhcyB1bmtub3duIGFzIG51bWJlcik7XG4gICAgfTtcbiAgICBzd2VlcCgpO1xuXG4gICAgLy8gLS0tLSBHZW50bGUgTEZPIG9uIGZpbHRlciBmcmVxIChzbWFsbCBkZXB0aCkgLS0tLVxuICAgIHRoaXMubGZvTm9kZSA9IG5ldyBPc2NpbGxhdG9yTm9kZSh0aGlzLmN0eCwgeyB0eXBlOiBcInNpbmVcIiwgZnJlcXVlbmN5OiBMRk9fUkFURV9IWiB9KTtcbiAgICB0aGlzLmxmb0dhaW4gPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogTEZPX0RFUFRIX0haICogKDAuNSArIDAuNSAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpIH0pO1xuICAgIHRoaXMubGZvTm9kZS5jb25uZWN0KHRoaXMubGZvR2FpbikuY29ubmVjdCh0aGlzLmZpbHRlci5mcmVxdWVuY3kpO1xuICAgIHRoaXMubGZvTm9kZS5zdGFydCgpO1xuXG4gICAgLy8gLS0tLSBTcGF3biByb290IGRyb25lIChnbGlkaW5nIHRvIGRpZmZlcmVudCBkZWdyZWVzKSAtLS0tXG4gICAgdGhpcy5zcGF3blJvb3REcm9uZSgpO1xuICAgIHRoaXMuc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCk7XG5cbiAgICAvLyAtLS0tIENob3JkIGN5Y2xlIGxvb3AgLS0tLVxuICAgIHRoaXMuY2hvcmRDeWNsZSgpO1xuXG4gICAgLy8gY2xlYW51cFxuICAgIHRoaXMuc3RvcEZucy5wdXNoKCgpID0+IHtcbiAgICAgIHRyeSB7IHRoaXMubGZvTm9kZT8uc3RvcCgpOyB9IGNhdGNoIHt9XG4gICAgICBbdGhpcy5tYXN0ZXIsIHRoaXMuZmlsdGVyLCB0aGlzLmRyeSwgdGhpcy53ZXQsIHRoaXMuZGVsYXksIHRoaXMuZmVlZGJhY2ssIHRoaXMubGZvTm9kZSwgdGhpcy5sZm9HYWluXVxuICAgICAgICAuZm9yRWFjaChuID0+IHsgdHJ5IHsgbj8uZGlzY29ubmVjdCgpOyB9IGNhdGNoIHt9IH0pO1xuICAgIH0pO1xuICB9XG5cbiAgc3RvcCgpIHtcbiAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuXG4gICAgLy8gY2FuY2VsIHRpbWVvdXRzXG4gICAgdGhpcy50aW1lb3V0cy5zcGxpY2UoMCkuZm9yRWFjaChpZCA9PiB3aW5kb3cuY2xlYXJUaW1lb3V0KGlkKSk7XG5cbiAgICAvLyBmYWRlIGFuZCBjbGVhbnVwIHZvaWNlc1xuICAgIGlmICh0aGlzLnJvb3RWb2ljZSkgdGhpcy5yb290Vm9pY2UuZmFkZU91dEtpbGwoMS4yKTtcblxuICAgIC8vIHJ1biBkZWZlcnJlZCBzdG9wc1xuICAgIHRoaXMuc3RvcEZucy5zcGxpY2UoMCkuZm9yRWFjaChmbiA9PiBmbigpKTtcbiAgfVxuXG4gIC8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gTXVzaWNhbCBlbmdpbmUgYmVsb3cgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSAqL1xuXG4gIHByaXZhdGUgY3VycmVudERlZ3JlZXMoKTogbnVtYmVyW10ge1xuICAgIHJldHVybiBNT0RFU1t0aGlzLm1vZGVdIHx8IE1PREVTLkx5ZGlhbjtcbiAgfVxuXG4gIC8qKiBEcm9uZSByb290IHZvaWNlICovXG4gIHByaXZhdGUgc3Bhd25Sb290RHJvbmUoKSB7XG4gICAgY29uc3QgYmFzZU1pZGkgPSB0aGlzLmtleVJvb3RNaWRpICsgdGhpcy5jdXJyZW50RGVncmVlcygpW3RoaXMuZHJvbmVEZWdyZWVJZHhdO1xuICAgIGNvbnN0IHYgPSBuZXcgVm9pY2UoXG4gICAgICB0aGlzLmN0eCxcbiAgICAgIFJPT1RfTUFYX0dBSU4sXG4gICAgICBcInNpbmVcIixcbiAgICAgIG1pZGlUb0ZyZXEoYmFzZU1pZGkpLFxuICAgICAgdGhpcy5maWx0ZXIsXG4gICAgICB0aGlzLnJuZ1xuICAgICk7XG4gICAgdi5mYWRlSW4oUk9PVF9TV0VMTF9USU1FKTtcbiAgICB0aGlzLnJvb3RWb2ljZSA9IHY7XG4gIH1cblxuICBwcml2YXRlIHNjaGVkdWxlTmV4dERyb25lTW92ZSgpIHtcbiAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIGNvbnN0IHdhaXRNcyA9IHJhbmQodGhpcy5ybmcsIERST05FX1NISUZUX01JTl9TLCBEUk9ORV9TSElGVF9NQVhfUykgKiAxMDAwO1xuICAgIGNvbnN0IGlkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcgfHwgIXRoaXMucm9vdFZvaWNlKSByZXR1cm47XG4gICAgICBjb25zdCBnbGlkZSA9IHJhbmQodGhpcy5ybmcsIERST05FX0dMSURFX01JTl9TLCBEUk9ORV9HTElERV9NQVhfUyk7XG4gICAgICBjb25zdCBuZXh0SWR4ID0gdGhpcy5waWNrTmV4dERyb25lRGVncmVlSWR4KCk7XG4gICAgICBjb25zdCB0YXJnZXRNaWRpID0gdGhpcy5rZXlSb290TWlkaSArIHRoaXMuY3VycmVudERlZ3JlZXMoKVtuZXh0SWR4XTtcbiAgICAgIHRoaXMucm9vdFZvaWNlLnNldEZyZXFHbGlkZShtaWRpVG9GcmVxKHRhcmdldE1pZGkpLCBnbGlkZSk7XG4gICAgICB0aGlzLmRyb25lRGVncmVlSWR4ID0gbmV4dElkeDtcbiAgICAgIHRoaXMuc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCk7XG4gICAgfSwgd2FpdE1zKSBhcyB1bmtub3duIGFzIG51bWJlcjtcbiAgICB0aGlzLnRpbWVvdXRzLnB1c2goaWQpO1xuICB9XG5cbiAgcHJpdmF0ZSBwaWNrTmV4dERyb25lRGVncmVlSWR4KCk6IG51bWJlciB7XG4gICAgY29uc3Qgb3JkZXIgPSBbLi4uUFJFRkVSUkVEX0RFR1JFRV9PUkRFUl07XG4gICAgY29uc3QgaSA9IG9yZGVyLmluZGV4T2YodGhpcy5kcm9uZURlZ3JlZUlkeCk7XG4gICAgaWYgKGkgPj0gMCkgeyBjb25zdCBbY3VyXSA9IG9yZGVyLnNwbGljZShpLCAxKTsgb3JkZXIucHVzaChjdXIpOyB9XG4gICAgcmV0dXJuIGNob2ljZSh0aGlzLnJuZywgb3JkZXIpO1xuICB9XG5cbiAgLyoqIEJ1aWxkIGRpYXRvbmljIHN0YWNrZWQtdGhpcmQgY2hvcmQgZGVncmVlcyB3aXRoIG9wdGlvbmFsIGV4dGVuc2lvbnMgKi9cbiAgcHJpdmF0ZSBidWlsZENob3JkRGVncmVlcyhtb2RlRGVnczogbnVtYmVyW10sIHJvb3RJbmRleDogbnVtYmVyLCBzaXplID0gNCwgYWRkOSA9IGZhbHNlLCBhZGQxMSA9IGZhbHNlLCBhZGQxMyA9IGZhbHNlKSB7XG4gICAgY29uc3Qgc3RlcHMgPSBbMCwgMiwgNCwgNl07IC8vIHRoaXJkcyBvdmVyIDctbm90ZSBzY2FsZVxuICAgIGNvbnN0IGNob3JkSWR4cyA9IHN0ZXBzLnNsaWNlKDAsIE1hdGgubWluKHNpemUsIDQpKS5tYXAocyA9PiAocm9vdEluZGV4ICsgcykgJSA3KTtcbiAgICBpZiAoYWRkOSkgIGNob3JkSWR4cy5wdXNoKChyb290SW5kZXggKyA4KSAlIDcpO1xuICAgIGlmIChhZGQxMSkgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDEwKSAlIDcpO1xuICAgIGlmIChhZGQxMykgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDEyKSAlIDcpO1xuICAgIHJldHVybiBjaG9yZElkeHMubWFwKGkgPT4gbW9kZURlZ3NbaV0pO1xuICB9XG5cbiAgcHJpdmF0ZSAqZW5kbGVzc0Nob3JkcygpIHtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgbW9kZURlZ3MgPSB0aGlzLmN1cnJlbnREZWdyZWVzKCk7XG4gICAgICAvLyBjaG9vc2UgY2hvcmQgcm9vdCBkZWdyZWUgKG9mdGVuIGFsaWduIHdpdGggZHJvbmUpXG4gICAgICBjb25zdCByb290RGVncmVlSW5kZXggPSAodGhpcy5ybmcoKSA8IENIT1JEX0FOQ0hPUl9QUk9CKSA/IHRoaXMuZHJvbmVEZWdyZWVJZHggOiBNYXRoLmZsb29yKHRoaXMucm5nKCkgKiA3KTtcblxuICAgICAgLy8gY2hvcmQgc2l6ZSAvIGV4dGVuc2lvbnNcbiAgICAgIGNvbnN0IHIgPSB0aGlzLnJuZygpO1xuICAgICAgbGV0IHNpemUgPSAzOyBsZXQgYWRkOSA9IGZhbHNlLCBhZGQxMSA9IGZhbHNlLCBhZGQxMyA9IGZhbHNlO1xuICAgICAgaWYgKHIgPCAwLjM1KSAgICAgICAgICAgIHsgc2l6ZSA9IDM7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjc1KSAgICAgICB7IHNpemUgPSA0OyB9XG4gICAgICBlbHNlIGlmIChyIDwgMC45MCkgICAgICAgeyBzaXplID0gNDsgYWRkOSA9IHRydWU7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjk3KSAgICAgICB7IHNpemUgPSA0OyBhZGQxMSA9IHRydWU7IH1cbiAgICAgIGVsc2UgICAgICAgICAgICAgICAgICAgICB7IHNpemUgPSA0OyBhZGQxMyA9IHRydWU7IH1cblxuICAgICAgY29uc3QgY2hvcmRTZW1pcyA9IHRoaXMuYnVpbGRDaG9yZERlZ3JlZXMobW9kZURlZ3MsIHJvb3REZWdyZWVJbmRleCwgc2l6ZSwgYWRkOSwgYWRkMTEsIGFkZDEzKTtcbiAgICAgIC8vIHNwcmVhZCBjaG9yZCBhY3Jvc3Mgb2N0YXZlcyAoLTEyLCAwLCArMTIpLCBiaWFzIHRvIGNlbnRlclxuICAgICAgY29uc3Qgc3ByZWFkID0gY2hvcmRTZW1pcy5tYXAoc2VtaSA9PiBzZW1pICsgY2hvaWNlKHRoaXMucm5nLCBbLTEyLCAwLCAwLCAxMl0pKTtcblxuICAgICAgLy8gb2NjYXNpb25hbGx5IGVuc3VyZSB0b25pYyBpcyBwcmVzZW50IGZvciBncm91bmRpbmdcbiAgICAgIGlmICghc3ByZWFkLmluY2x1ZGVzKDApICYmIHRoaXMucm5nKCkgPCAwLjUpIHNwcmVhZC5wdXNoKDApO1xuXG4gICAgICB5aWVsZCBzcHJlYWQ7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaG9yZEN5Y2xlKCkge1xuICAgIGNvbnN0IGdlbiA9IHRoaXMuZW5kbGVzc0Nob3JkcygpO1xuICAgIGNvbnN0IHZvaWNlcyA9IG5ldyBTZXQ8Vm9pY2U+KCk7XG5cbiAgICBjb25zdCBzbGVlcCA9IChtczogbnVtYmVyKSA9PiBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHtcbiAgICAgIGNvbnN0IGlkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4gcigpLCBtcykgYXMgdW5rbm93biBhcyBudW1iZXI7XG4gICAgICB0aGlzLnRpbWVvdXRzLnB1c2goaWQpO1xuICAgIH0pO1xuXG4gICAgd2hpbGUgKHRoaXMucnVubmluZykge1xuICAgICAgLy8gY2hvcmQgc3Bhd24gcHJvYmFiaWxpdHkgLyB0aGlja25lc3Mgc2NhbGUgd2l0aCBkZW5zaXR5ICYgYnJpZ2h0bmVzc1xuICAgICAgY29uc3QgdGhpY2tuZXNzID0gTWF0aC5yb3VuZCgyICsgdGhpcy5wYXJhbXMuZGVuc2l0eSAqIDMpO1xuICAgICAgY29uc3QgYmFzZU1pZGkgPSB0aGlzLmtleVJvb3RNaWRpO1xuICAgICAgY29uc3QgZGVncmVlc09mZjogbnVtYmVyW10gPSBnZW4ubmV4dCgpLnZhbHVlID8/IFtdO1xuXG4gICAgICAvLyBzcGF3blxuICAgICAgZm9yIChjb25zdCBvZmYgb2YgZGVncmVlc09mZikge1xuICAgICAgICBpZiAoIXRoaXMucnVubmluZykgYnJlYWs7XG4gICAgICAgIGlmICh2b2ljZXMuc2l6ZSA+PSBNYXRoLm1pbihDSE9SRF9WT0lDRVNfTUFYLCB0aGlja25lc3MpKSBicmVhaztcblxuICAgICAgICBjb25zdCBtaWRpID0gYmFzZU1pZGkgKyBvZmY7XG4gICAgICAgIGNvbnN0IGZyZXEgPSBtaWRpVG9GcmVxKG1pZGkpO1xuICAgICAgICBjb25zdCB3YXZlZm9ybSA9IGNob2ljZSh0aGlzLnJuZywgW1wic2luZVwiLCBcInRyaWFuZ2xlXCIsIFwic2F3dG9vdGhcIl0gYXMgT3NjaWxsYXRvclR5cGVbXSk7XG5cbiAgICAgICAgLy8gbG91ZGVyIHdpdGggaW50ZW5zaXR5OyBzbGlnaHRseSBicmlnaHRlciAtPiBzbGlnaHRseSBsb3VkZXJcbiAgICAgICAgY29uc3QgZ2FpblRhcmdldCA9IHJhbmQodGhpcy5ybmcsIDAuMDgsIDAuMjIpICpcbiAgICAgICAgICAoMC44NSArIDAuMyAqIHRoaXMucGFyYW1zLmludGVuc2l0eSkgKlxuICAgICAgICAgICgwLjkgKyAwLjIgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKTtcblxuICAgICAgICBjb25zdCB2ID0gbmV3IFZvaWNlKHRoaXMuY3R4LCBnYWluVGFyZ2V0LCB3YXZlZm9ybSwgZnJlcSwgdGhpcy5maWx0ZXIsIHRoaXMucm5nKTtcbiAgICAgICAgdm9pY2VzLmFkZCh2KTtcbiAgICAgICAgdi5mYWRlSW4ocmFuZCh0aGlzLnJuZywgQ0hPUkRfRkFERV9NSU5fUywgQ0hPUkRfRkFERV9NQVhfUykpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCBzbGVlcChyYW5kKHRoaXMucm5nLCBDSE9SRF9IT0xEX01JTl9TLCBDSE9SRF9IT0xEX01BWF9TKSAqIDEwMDApO1xuXG4gICAgICAvLyBmYWRlIG91dFxuICAgICAgY29uc3Qgb3V0cyA9IEFycmF5LmZyb20odm9pY2VzKTtcbiAgICAgIGZvciAoY29uc3QgdiBvZiBvdXRzKSB2LmZhZGVPdXRLaWxsKHJhbmQodGhpcy5ybmcsIENIT1JEX0ZBREVfTUlOX1MsIENIT1JEX0ZBREVfTUFYX1MpKTtcbiAgICAgIHZvaWNlcy5jbGVhcigpO1xuXG4gICAgICBhd2FpdCBzbGVlcChyYW5kKHRoaXMucm5nLCBDSE9SRF9HQVBfTUlOX1MsIENIT1JEX0dBUF9NQVhfUykgKiAxMDAwKTtcbiAgICB9XG5cbiAgICAvLyBzYWZldHk6IGtpbGwgYW55IGxpbmdlcmluZyB2b2ljZXNcbiAgICBmb3IgKGNvbnN0IHYgb2YgQXJyYXkuZnJvbSh2b2ljZXMpKSB2LmZhZGVPdXRLaWxsKDAuOCk7XG4gIH1cbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNjZW5lTmFtZSwgTXVzaWNTY2VuZU9wdGlvbnMgfSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4uL2VuZ2luZVwiO1xuaW1wb3J0IHsgQW1iaWVudFNjZW5lIH0gZnJvbSBcIi4vc2NlbmVzL2FtYmllbnRcIjtcblxuZXhwb3J0IGNsYXNzIE11c2ljRGlyZWN0b3Ige1xuICBwcml2YXRlIGN1cnJlbnQ/OiB7IG5hbWU6IFNjZW5lTmFtZTsgc3RvcDogKCkgPT4gdm9pZCB9O1xuICBwcml2YXRlIGJ1c091dDogR2Fpbk5vZGU7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBlbmdpbmU6IEF1ZGlvRW5naW5lKSB7XG4gICAgdGhpcy5idXNPdXQgPSBuZXcgR2Fpbk5vZGUoZW5naW5lLmN0eCwgeyBnYWluOiAwLjkgfSk7XG4gICAgdGhpcy5idXNPdXQuY29ubmVjdChlbmdpbmUuZ2V0TXVzaWNCdXMoKSk7XG4gIH1cblxuICAvKiogQ3Jvc3NmYWRlIHRvIGEgbmV3IHNjZW5lICovXG4gIHNldFNjZW5lKG5hbWU6IFNjZW5lTmFtZSwgb3B0cz86IE11c2ljU2NlbmVPcHRpb25zKSB7XG4gICAgaWYgKHRoaXMuY3VycmVudD8ubmFtZSA9PT0gbmFtZSkgcmV0dXJuO1xuXG4gICAgY29uc3Qgb2xkID0gdGhpcy5jdXJyZW50O1xuICAgIGNvbnN0IHQgPSB0aGlzLmVuZ2luZS5ub3c7XG5cbiAgICAvLyBmYWRlLW91dCBvbGRcbiAgICBjb25zdCBmYWRlT3V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuZW5naW5lLmN0eCwgeyBnYWluOiAwLjkgfSk7XG4gICAgZmFkZU91dC5jb25uZWN0KHRoaXMuZW5naW5lLmdldE11c2ljQnVzKCkpO1xuICAgIGlmIChvbGQpIHtcbiAgICAgIC8vIFdlIGFzc3VtZSBlYWNoIHNjZW5lIG1hbmFnZXMgaXRzIG93biBvdXQgbm9kZTsgc3RvcHBpbmcgdHJpZ2dlcnMgYSBuYXR1cmFsIHRhaWwuXG4gICAgICBvbGQuc3RvcCgpO1xuICAgICAgZmFkZU91dC5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMCwgdCArIDAuNik7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IGZhZGVPdXQuZGlzY29ubmVjdCgpLCA2NTApO1xuICAgIH1cblxuICAgIC8vIG5ldyBzY2VuZVxuICAgIGNvbnN0IHNjZW5lT3V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuZW5naW5lLmN0eCwgeyBnYWluOiAwIH0pO1xuICAgIHNjZW5lT3V0LmNvbm5lY3QodGhpcy5idXNPdXQpO1xuXG4gICAgbGV0IHN0b3AgPSAoKSA9PiBzY2VuZU91dC5kaXNjb25uZWN0KCk7XG5cbiAgICBpZiAobmFtZSA9PT0gXCJhbWJpZW50XCIpIHtcbiAgICAgIGNvbnN0IHMgPSBuZXcgQW1iaWVudFNjZW5lKHRoaXMuZW5naW5lLmN0eCwgc2NlbmVPdXQsIG9wdHM/LnNlZWQgPz8gMSk7XG4gICAgICBzLnN0YXJ0KCk7XG4gICAgICBzdG9wID0gKCkgPT4ge1xuICAgICAgICBzLnN0b3AoKTtcbiAgICAgICAgc2NlbmVPdXQuZGlzY29ubmVjdCgpO1xuICAgICAgfTtcbiAgICB9XG4gICAgLy8gZWxzZSBpZiAobmFtZSA9PT0gXCJjb21iYXRcIikgeyAvKiBpbXBsZW1lbnQgY29tYmF0IHNjZW5lIGxhdGVyICovIH1cbiAgICAvLyBlbHNlIGlmIChuYW1lID09PSBcImxvYmJ5XCIpIHsgLyogaW1wbGVtZW50IGxvYmJ5IHNjZW5lIGxhdGVyICovIH1cblxuICAgIHRoaXMuY3VycmVudCA9IHsgbmFtZSwgc3RvcCB9O1xuICAgIHNjZW5lT3V0LmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC45LCB0ICsgMC42KTtcbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgaWYgKCF0aGlzLmN1cnJlbnQpIHJldHVybjtcbiAgICB0aGlzLmN1cnJlbnQuc3RvcCgpO1xuICAgIHRoaXMuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgQnVzLCBNdXNpY1BhcmFtTWVzc2FnZSwgTXVzaWNTY2VuZU9wdGlvbnMgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IE11c2ljRGlyZWN0b3IgfSBmcm9tIFwiLi9tdXNpY1wiO1xuaW1wb3J0IHsgcGxheVNmeCB9IGZyb20gXCIuL3NmeFwiO1xuXG4vKipcbiAqIEJpbmQgc3RhbmRhcmQgYXVkaW8gZXZlbnRzIHRvIHRoZSBlbmdpbmUgYW5kIG11c2ljIGRpcmVjdG9yLlxuICpcbiAqIEV2ZW50cyBzdXBwb3J0ZWQ6XG4gKiAgLSBhdWRpbzpyZXN1bWVcbiAqICAtIGF1ZGlvOm11dGUgLyBhdWRpbzp1bm11dGVcbiAqICAtIGF1ZGlvOnNldC1tYXN0ZXItZ2FpbiB7IGdhaW4gfVxuICogIC0gYXVkaW86c2Z4IHsgbmFtZSwgdmVsb2NpdHk/LCBwYW4/IH1cbiAqICAtIGF1ZGlvOm11c2ljOnNldC1zY2VuZSB7IHNjZW5lLCBzZWVkPyB9XG4gKiAgLSBhdWRpbzptdXNpYzpwYXJhbSB7IGtleSwgdmFsdWUgfVxuICogIC0gYXVkaW86bXVzaWM6dHJhbnNwb3J0IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9ICAvLyBwYXVzZSBjdXJyZW50bHkgbWFwcyB0byBzdG9wXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MoXG4gIGJ1czogQnVzLFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICBtdXNpYzogTXVzaWNEaXJlY3RvclxuKTogdm9pZCB7XG4gIGJ1cy5vbihcImF1ZGlvOnJlc3VtZVwiLCAoKSA9PiBlbmdpbmUucmVzdW1lKCkpO1xuICBidXMub24oXCJhdWRpbzptdXRlXCIsICgpID0+IGVuZ2luZS5zZXRNYXN0ZXJHYWluKDApKTtcbiAgYnVzLm9uKFwiYXVkaW86dW5tdXRlXCIsICgpID0+IGVuZ2luZS5zZXRNYXN0ZXJHYWluKDAuOSkpO1xuICBidXMub24oXCJhdWRpbzpzZXQtbWFzdGVyLWdhaW5cIiwgKHsgZ2FpbiB9OiB7IGdhaW46IG51bWJlciB9KSA9PlxuICAgIGVuZ2luZS5zZXRNYXN0ZXJHYWluKE1hdGgubWF4KDAsIE1hdGgubWluKDEsIGdhaW4pKSlcbiAgKTtcblxuICBidXMub24oXCJhdWRpbzpzZnhcIiwgKG1zZzogeyBuYW1lOiBzdHJpbmc7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfSkgPT4ge1xuICAgIHBsYXlTZngoZW5naW5lLCBtc2cubmFtZSBhcyBhbnksIHsgdmVsb2NpdHk6IG1zZy52ZWxvY2l0eSwgcGFuOiBtc2cucGFuIH0pO1xuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIiwgKG1zZzogeyBzY2VuZTogc3RyaW5nIH0gJiBNdXNpY1NjZW5lT3B0aW9ucykgPT4ge1xuICAgIGVuZ2luZS5yZXN1bWUoKTtcbiAgICBtdXNpYy5zZXRTY2VuZShtc2cuc2NlbmUgYXMgYW55LCB7IHNlZWQ6IG1zZy5zZWVkIH0pO1xuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzpwYXJhbVwiLCAoX21zZzogTXVzaWNQYXJhbU1lc3NhZ2UpID0+IHtcbiAgICAvLyBIb29rIGZvciBmdXR1cmUgcGFyYW0gcm91dGluZyBwZXIgc2NlbmUgKGUuZy4sIGludGVuc2l0eS9icmlnaHRuZXNzL2RlbnNpdHkpXG4gICAgLy8gSWYgeW91IHdhbnQgZ2xvYmFsIHBhcmFtcywga2VlcCBhIG1hcCBoZXJlIGFuZCBmb3J3YXJkIHRvIHRoZSBhY3RpdmUgc2NlbmVcbiAgfSk7XG5cbiAgYnVzLm9uKFwiYXVkaW86bXVzaWM6dHJhbnNwb3J0XCIsICh7IGNtZCB9OiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfSkgPT4ge1xuICAgIGlmIChjbWQgPT09IFwic3RvcFwiIHx8IGNtZCA9PT0gXCJwYXVzZVwiKSBtdXNpYy5zdG9wKCk7XG4gICAgLy8gXCJzdGFydFwiIGlzIGltcGxpY2l0IHZpYSBzZXRTY2VuZVxuICB9KTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHR5cGUgeyBBcHBTdGF0ZSwgQmVhY29uRGVmaW5pdGlvbiwgTWlzc2lvblN0YXRlLCBXb3JsZE1ldGEgfSBmcm9tIFwiLi4vc3RhdGVcIjtcbmltcG9ydCB7IG1vbm90b25pY05vdyB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3Npb25Db250cm9sbGVyIHtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgTWlzc2lvbkNvbnRyb2xsZXJPcHRpb25zIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBtb2RlOiBzdHJpbmc7XG4gIG1pc3Npb25JZDogc3RyaW5nIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIE1pc3Npb25TcGVjIHtcbiAgaWQ6IHN0cmluZztcbiAgaG9sZFNlY29uZHM6IG51bWJlcjtcbiAgZGVmYXVsdFdvcmxkU2l6ZTogeyB3OiBudW1iZXI7IGg6IG51bWJlciB9O1xuICBiZWFjb25zOiBBcnJheTx7IGZ4OiBudW1iZXI7IGZ5OiBudW1iZXI7IHJhZGl1czogbnVtYmVyIH0+O1xufVxuXG5pbnRlcmZhY2UgUGVyc2lzdGVkUHJvZ3Jlc3Mge1xuICBiZWFjb25JbmRleDogbnVtYmVyO1xuICBob2xkQWNjdW06IG51bWJlcjtcbn1cblxuY29uc3QgU1RPUkFHRV9QUkVGSVggPSBcImxzZDptaXNzaW9uOlwiO1xuY29uc3QgSE9MRF9FUFNJTE9OID0gMC4wMDAxO1xuXG5jb25zdCBDQU1QQUlHTl9NSVNTSU9OUzogUmVjb3JkPHN0cmluZywgTWlzc2lvblNwZWM+ID0ge1xuICBcIjFcIjoge1xuICAgIGlkOiBcImNhbXBhaWduLTFcIixcbiAgICBob2xkU2Vjb25kczogMTAsXG4gICAgZGVmYXVsdFdvcmxkU2l6ZTogeyB3OiAzMjAwMCwgaDogMTgwMDAgfSxcbiAgICBiZWFjb25zOiBbXG4gICAgICB7IGZ4OiAwLjE1LCBmeTogMC41NSwgcmFkaXVzOiA0MjAgfSxcbiAgICAgIHsgZng6IDAuNDAsIGZ5OiAwLjUwLCByYWRpdXM6IDM2MCB9LFxuICAgICAgeyBmeDogMC42NSwgZnk6IDAuNDcsIHJhZGl1czogMzAwIH0sXG4gICAgICB7IGZ4OiAwLjg1LCBmeTogMC40NCwgcmFkaXVzOiAyNjAgfSxcbiAgICBdLFxuICB9LFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50TWlzc2lvbkNvbnRyb2xsZXIoeyBzdGF0ZSwgYnVzLCBtb2RlLCBtaXNzaW9uSWQgfTogTWlzc2lvbkNvbnRyb2xsZXJPcHRpb25zKTogTWlzc2lvbkNvbnRyb2xsZXIge1xuICBpZiAobW9kZSAhPT0gXCJjYW1wYWlnblwiKSB7XG4gICAgcmV0dXJuIHsgZGVzdHJveSgpIHt9IH07XG4gIH1cblxuICBjb25zdCBzcGVjID0gbWlzc2lvbklkICYmIENBTVBBSUdOX01JU1NJT05TW21pc3Npb25JZF0gPyBDQU1QQUlHTl9NSVNTSU9OU1ttaXNzaW9uSWRdIDogQ0FNUEFJR05fTUlTU0lPTlNbXCIxXCJdO1xuICBpZiAoIXNwZWMpIHtcbiAgICByZXR1cm4geyBkZXN0cm95KCkge30gfTtcbiAgfVxuXG4gIGNvbnN0IHN0b3JhZ2VLZXkgPSBgJHtTVE9SQUdFX1BSRUZJWH0ke3NwZWMuaWR9YDtcbiAgbGV0IHBlcnNpc3RlZCA9IGxvYWRQcm9ncmVzcyhzdG9yYWdlS2V5KTtcbiAgY29uc3QgY29tcGxldGVkQmVmb3JlID0gcGVyc2lzdGVkLmJlYWNvbkluZGV4ID49IHNwZWMuYmVhY29ucy5sZW5ndGg7XG4gIGlmIChjb21wbGV0ZWRCZWZvcmUpIHtcbiAgICBwZXJzaXN0ZWQgPSB7IGJlYWNvbkluZGV4OiAwLCBob2xkQWNjdW06IDAgfTtcbiAgICB0cnkge1xuICAgICAgc2F2ZVByb2dyZXNzKHN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KHBlcnNpc3RlZCkpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gaWdub3JlIHN0b3JhZ2UgZXJyb3JzXG4gICAgfVxuICB9XG5cbiAgbGV0IG1pc3Npb246IE1pc3Npb25TdGF0ZSA9IHtcbiAgICBhY3RpdmU6IHRydWUsXG4gICAgbWlzc2lvbklkOiBzcGVjLmlkLFxuICAgIGJlYWNvbkluZGV4OiBjbGFtcEJlYWNvbkluZGV4KHBlcnNpc3RlZC5iZWFjb25JbmRleCwgc3BlYy5iZWFjb25zLmxlbmd0aCksXG4gICAgaG9sZEFjY3VtOiBjbGFtcEhvbGQocGVyc2lzdGVkLmhvbGRBY2N1bSwgc3BlYy5ob2xkU2Vjb25kcyksXG4gICAgaG9sZFJlcXVpcmVkOiBzcGVjLmhvbGRTZWNvbmRzLFxuICAgIGJlYWNvbnM6IFtdLFxuICB9O1xuXG4gIGxldCBsYXN0V29ybGRLZXkgPSBcIlwiO1xuICBsZXQgbGFzdFBlcnNpc3RlZEpTT04gPSBjb21wbGV0ZWRCZWZvcmUgPyBKU09OLnN0cmluZ2lmeShwZXJzaXN0ZWQpIDogXCJcIjtcbiAgbGV0IGxhc3RTZXJ2ZXJOb3c6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gIHN0YXRlLm1pc3Npb24gPSBtaXNzaW9uO1xuICBidXMuZW1pdChcIm1pc3Npb246c3RhcnRcIik7XG4gIC8vIFByaW1lIGJlYWNvbiBjb29yZGluYXRlcyBpbW1lZGlhdGVseSB1c2luZyB3aGF0ZXZlciB3b3JsZCBtZXRhIGlzIGF2YWlsYWJsZS5cbiAgLy8gU3Vic2VxdWVudCBzdGF0ZSB1cGRhdGVzIHdpbGwgcmVmaW5lIGlmIHRoZSB3b3JsZCBzaXplIGNoYW5nZXMuXG4gIHN5bmNCZWFjb25zKHN0YXRlLndvcmxkTWV0YSk7XG5cbiAgZnVuY3Rpb24gc3luY0JlYWNvbnMobWV0YTogV29ybGRNZXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG4gICAgY29uc3Qgd29ybGRXID0gcmVzb2x2ZVdvcmxkVmFsdWUobWV0YT8udywgc3BlYy5kZWZhdWx0V29ybGRTaXplLncpO1xuICAgIGNvbnN0IHdvcmxkSCA9IHJlc29sdmVXb3JsZFZhbHVlKG1ldGE/LmgsIHNwZWMuZGVmYXVsdFdvcmxkU2l6ZS5oKTtcbiAgICBjb25zdCBrZXkgPSBgJHt3b3JsZFcudG9GaXhlZCgyKX06JHt3b3JsZEgudG9GaXhlZCgyKX1gO1xuICAgIGlmIChrZXkgPT09IGxhc3RXb3JsZEtleSAmJiBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoID09PSBzcGVjLmJlYWNvbnMubGVuZ3RoKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxhc3RXb3JsZEtleSA9IGtleTtcbiAgICBtaXNzaW9uLmJlYWNvbnMgPSBzcGVjLmJlYWNvbnMubWFwKChkZWYpOiBCZWFjb25EZWZpbml0aW9uID0+ICh7XG4gICAgICBjeDogZGVmLmZ4ICogd29ybGRXLFxuICAgICAgY3k6IGRlZi5meSAqIHdvcmxkSCxcbiAgICAgIHJhZGl1czogZGVmLnJhZGl1cyxcbiAgICB9KSk7XG4gIH1cblxuICBmdW5jdGlvbiBwZXJzaXN0KGZvcmNlID0gZmFsc2UpOiB2b2lkIHtcbiAgICBpZiAoIW1pc3Npb24uYWN0aXZlICYmIG1pc3Npb24uYmVhY29uSW5kZXggPj0gbWlzc2lvbi5iZWFjb25zLmxlbmd0aCkge1xuICAgICAgLy8gTWlzc2lvbiBjb21wbGV0ZSwgc3RvcmUgY29tcGxldGlvbiB3aXRoIHplcm8gaG9sZC5cbiAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh7IGJlYWNvbkluZGV4OiBtaXNzaW9uLmJlYWNvbkluZGV4LCBob2xkQWNjdW06IDAgfSk7XG4gICAgICBpZiAoIWZvcmNlICYmIHBheWxvYWQgPT09IGxhc3RQZXJzaXN0ZWRKU09OKSByZXR1cm47XG4gICAgICBsYXN0UGVyc2lzdGVkSlNPTiA9IHBheWxvYWQ7XG4gICAgICBzYXZlUHJvZ3Jlc3Moc3RvcmFnZUtleSwgcGF5bG9hZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICBiZWFjb25JbmRleDogbWlzc2lvbi5iZWFjb25JbmRleCxcbiAgICAgIGhvbGRBY2N1bTogY2xhbXBIb2xkKG1pc3Npb24uaG9sZEFjY3VtLCBtaXNzaW9uLmhvbGRSZXF1aXJlZCksXG4gICAgfSk7XG4gICAgaWYgKCFmb3JjZSAmJiBwYXlsb2FkID09PSBsYXN0UGVyc2lzdGVkSlNPTikgcmV0dXJuO1xuICAgIGxhc3RQZXJzaXN0ZWRKU09OID0gcGF5bG9hZDtcbiAgICBzYXZlUHJvZ3Jlc3Moc3RvcmFnZUtleSwgcGF5bG9hZCk7XG4gIH1cblxuICBmdW5jdGlvbiBjb21wdXRlRHQobm93U2VjOiBudW1iZXIgfCB1bmRlZmluZWQgfCBudWxsKTogbnVtYmVyIHtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShub3dTZWMpKSB7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gICAgaWYgKGxhc3RTZXJ2ZXJOb3cgPT09IG51bGwgfHwgIU51bWJlci5pc0Zpbml0ZShsYXN0U2VydmVyTm93KSkge1xuICAgICAgbGFzdFNlcnZlck5vdyA9IG5vd1NlYyE7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gICAgY29uc3QgZHQgPSBub3dTZWMhIC0gbGFzdFNlcnZlck5vdztcbiAgICBsYXN0U2VydmVyTm93ID0gbm93U2VjITtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShkdCkgfHwgZHQgPD0gMCkge1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICAgIHJldHVybiBkdDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzSW5zaWRlQmVhY29uKGN4OiBudW1iZXIsIGN5OiBudW1iZXIsIHJhZGl1czogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgY29uc3QgbWUgPSBzdGF0ZS5tZTtcbiAgICBpZiAoIW1lKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgZHggPSBtZS54IC0gY3g7XG4gICAgY29uc3QgZHkgPSBtZS55IC0gY3k7XG4gICAgY29uc3QgZGlzdFNxID0gZHggKiBkeCArIGR5ICogZHk7XG4gICAgcmV0dXJuIGRpc3RTcSA8PSByYWRpdXMgKiByYWRpdXM7XG4gIH1cblxuICBmdW5jdGlvbiBpc1N0YWxsZWQoKTogYm9vbGVhbiB7XG4gICAgY29uc3QgaGVhdCA9IHN0YXRlLm1lPy5oZWF0O1xuICAgIGlmICghaGVhdCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IG5vdyA9IG1vbm90b25pY05vdygpO1xuICAgIHJldHVybiBOdW1iZXIuaXNGaW5pdGUoaGVhdC5zdGFsbFVudGlsTXMpICYmIG5vdyA8IGhlYXQuc3RhbGxVbnRpbE1zO1xuICB9XG5cbiAgZnVuY3Rpb24gbG9ja0N1cnJlbnRCZWFjb24oKTogdm9pZCB7XG4gICAgY29uc3QgbG9ja2VkSW5kZXggPSBtaXNzaW9uLmJlYWNvbkluZGV4O1xuICAgIGJ1cy5lbWl0KFwibWlzc2lvbjpiZWFjb24tbG9ja2VkXCIsIHsgaW5kZXg6IGxvY2tlZEluZGV4IH0pO1xuICAgIG1pc3Npb24uYmVhY29uSW5kZXggPSBNYXRoLm1pbihtaXNzaW9uLmJlYWNvbkluZGV4ICsgMSwgbWlzc2lvbi5iZWFjb25zLmxlbmd0aCk7XG4gICAgbWlzc2lvbi5ob2xkQWNjdW0gPSAwO1xuICAgIHBlcnNpc3QodHJ1ZSk7XG4gICAgaWYgKG1pc3Npb24uYmVhY29uSW5kZXggPj0gbWlzc2lvbi5iZWFjb25zLmxlbmd0aCkge1xuICAgICAgbWlzc2lvbi5hY3RpdmUgPSBmYWxzZTtcbiAgICAgIHBlcnNpc3QodHJ1ZSk7XG4gICAgICBidXMuZW1pdChcIm1pc3Npb246Y29tcGxldGVkXCIpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2V0SG9sZElmTmVlZGVkKCk6IHZvaWQge1xuICAgIGlmIChtaXNzaW9uLmhvbGRBY2N1bSA+IDApIHtcbiAgICAgIG1pc3Npb24uaG9sZEFjY3VtID0gMDtcbiAgICAgIHBlcnNpc3QoKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCB1bnN1YnNjcmliZSA9IGJ1cy5vbihcInN0YXRlOnVwZGF0ZWRcIiwgKCkgPT4ge1xuICAgIGlmICghc3RhdGUubWlzc2lvbiB8fCAhc3RhdGUubWlzc2lvbi5hY3RpdmUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBtaXNzaW9uID0gc3RhdGUubWlzc2lvbjtcbiAgICBzeW5jQmVhY29ucyhzdGF0ZS53b3JsZE1ldGEpO1xuXG4gICAgaWYgKG1pc3Npb24uYmVhY29uSW5kZXggPj0gbWlzc2lvbi5iZWFjb25zLmxlbmd0aCkge1xuICAgICAgbWlzc2lvbi5hY3RpdmUgPSBmYWxzZTtcbiAgICAgIHBlcnNpc3QodHJ1ZSk7XG4gICAgICBidXMuZW1pdChcIm1pc3Npb246Y29tcGxldGVkXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGJlYWNvbiA9IG1pc3Npb24uYmVhY29uc1ttaXNzaW9uLmJlYWNvbkluZGV4XTtcbiAgICBpZiAoIWJlYWNvbikge1xuICAgICAgbWlzc2lvbi5hY3RpdmUgPSBmYWxzZTtcbiAgICAgIHBlcnNpc3QodHJ1ZSk7XG4gICAgICBidXMuZW1pdChcIm1pc3Npb246Y29tcGxldGVkXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGR0ID0gY29tcHV0ZUR0KHN0YXRlLm5vdyk7XG4gICAgaWYgKCFzdGF0ZS5tZSkge1xuICAgICAgbGFzdFNlcnZlck5vdyA9IHN0YXRlLm5vdztcbiAgICAgIHJlc2V0SG9sZElmTmVlZGVkKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGlzSW5zaWRlQmVhY29uKGJlYWNvbi5jeCwgYmVhY29uLmN5LCBiZWFjb24ucmFkaXVzKSAmJiAhaXNTdGFsbGVkKCkpIHtcbiAgICAgIGNvbnN0IG5leHRIb2xkID0gTWF0aC5taW4obWlzc2lvbi5ob2xkUmVxdWlyZWQsIG1pc3Npb24uaG9sZEFjY3VtICsgZHQpO1xuICAgICAgaWYgKE1hdGguYWJzKG5leHRIb2xkIC0gbWlzc2lvbi5ob2xkQWNjdW0pID4gSE9MRF9FUFNJTE9OKSB7XG4gICAgICAgIG1pc3Npb24uaG9sZEFjY3VtID0gbmV4dEhvbGQ7XG4gICAgICAgIHBlcnNpc3QoKTtcbiAgICAgIH1cbiAgICAgIGlmIChtaXNzaW9uLmhvbGRBY2N1bSArIEhPTERfRVBTSUxPTiA+PSBtaXNzaW9uLmhvbGRSZXF1aXJlZCkge1xuICAgICAgICBsb2NrQ3VycmVudEJlYWNvbigpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXNldEhvbGRJZk5lZWRlZCgpO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBkZXN0cm95KCkge1xuICAgICAgdW5zdWJzY3JpYmUoKTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlV29ybGRWYWx1ZSh2YWx1ZTogbnVtYmVyIHwgdW5kZWZpbmVkLCBmYWxsYmFjazogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMCkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gZmFsbGJhY2s7XG59XG5cbmZ1bmN0aW9uIGNsYW1wQmVhY29uSW5kZXgoaW5kZXg6IG51bWJlciwgdG90YWw6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKGluZGV4KSkge1xuICAgIHJldHVybiAwO1xuICB9XG4gIGlmIChpbmRleCA8IDApIHJldHVybiAwO1xuICBpZiAoaW5kZXggPiB0b3RhbCkgcmV0dXJuIHRvdGFsO1xuICByZXR1cm4gTWF0aC5mbG9vcihpbmRleCk7XG59XG5cbmZ1bmN0aW9uIGNsYW1wSG9sZChob2xkOiBudW1iZXIsIGhvbGRSZXF1aXJlZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoaG9sZCkgfHwgaG9sZCA8IDApIHJldHVybiAwO1xuICBpZiAoaG9sZCA+IGhvbGRSZXF1aXJlZCkgcmV0dXJuIGhvbGRSZXF1aXJlZDtcbiAgcmV0dXJuIGhvbGQ7XG59XG5cbmZ1bmN0aW9uIGxvYWRQcm9ncmVzcyhzdG9yYWdlS2V5OiBzdHJpbmcpOiBQZXJzaXN0ZWRQcm9ncmVzcyB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmF3ID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKHN0b3JhZ2VLZXkpO1xuICAgIGlmICghcmF3KSB7XG4gICAgICByZXR1cm4geyBiZWFjb25JbmRleDogMCwgaG9sZEFjY3VtOiAwIH07XG4gICAgfVxuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBQYXJ0aWFsPFBlcnNpc3RlZFByb2dyZXNzPiB8IG51bGw7XG4gICAgaWYgKCFwYXJzZWQpIHtcbiAgICAgIHJldHVybiB7IGJlYWNvbkluZGV4OiAwLCBob2xkQWNjdW06IDAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGJlYWNvbkluZGV4OiBjbGFtcEJlYWNvbkluZGV4KHBhcnNlZC5iZWFjb25JbmRleCA/PyAwLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiksXG4gICAgICBob2xkQWNjdW06IHR5cGVvZiBwYXJzZWQuaG9sZEFjY3VtID09PSBcIm51bWJlclwiID8gTWF0aC5tYXgoMCwgcGFyc2VkLmhvbGRBY2N1bSkgOiAwLFxuICAgIH07XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB7IGJlYWNvbkluZGV4OiAwLCBob2xkQWNjdW06IDAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzYXZlUHJvZ3Jlc3Moc3RvcmFnZUtleTogc3RyaW5nLCBwYXlsb2FkOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oc3RvcmFnZUtleSwgcGF5bG9hZCk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIExvY2FsIHN0b3JhZ2UgbWF5IGJlIHVuYXZhaWxhYmxlOyBpZ25vcmUuXG4gIH1cbn1cbiIsICJpbXBvcnQgeyBjcmVhdGVFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHsgY29ubmVjdFdlYlNvY2tldCwgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi9uZXRcIjtcbmltcG9ydCB7IGluaXRHYW1lIH0gZnJvbSBcIi4vZ2FtZVwiO1xuaW1wb3J0IHsgY3JlYXRlSW5pdGlhbFN0YXRlLCBjcmVhdGVJbml0aWFsVUlTdGF0ZSB9IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQgeyBtb3VudFR1dG9yaWFsLCBCQVNJQ19UVVRPUklBTF9JRCB9IGZyb20gXCIuL3R1dG9yaWFsXCI7XG5pbXBvcnQgeyBjbGVhclByb2dyZXNzIGFzIGNsZWFyVHV0b3JpYWxQcm9ncmVzcyB9IGZyb20gXCIuL3R1dG9yaWFsL3N0b3JhZ2VcIjtcbmltcG9ydCB7IG1vdW50U3RvcnksIElOVFJPX0NIQVBURVJfSUQsIElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTIH0gZnJvbSBcIi4vc3RvcnlcIjtcbmltcG9ydCB7IHdhaXRGb3JVc2VyU3RhcnQgfSBmcm9tIFwiLi9zdGFydC1nYXRlXCI7XG5pbXBvcnQgeyByZXN1bWVBdWRpbyB9IGZyb20gXCIuL3N0b3J5L3NmeFwiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9hdWRpby9lbmdpbmVcIjtcbmltcG9ydCB7IE11c2ljRGlyZWN0b3IgfSBmcm9tIFwiLi9hdWRpby9tdXNpY1wiO1xuaW1wb3J0IHsgcmVnaXN0ZXJBdWRpb0J1c0JpbmRpbmdzIH0gZnJvbSBcIi4vYXVkaW8vY3Vlc1wiO1xuaW1wb3J0IHsgbW91bnRNaXNzaW9uQ29udHJvbGxlciB9IGZyb20gXCIuL21pc3Npb24vY29udHJvbGxlclwiO1xuXG5jb25zdCBDQUxMX1NJR05fU1RPUkFHRV9LRVkgPSBcImxzZDpjYWxsc2lnblwiO1xuXG4oYXN5bmMgZnVuY3Rpb24gYm9vdHN0cmFwKCkge1xuICBjb25zdCBxcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG4gIGNvbnN0IHJvb20gPSBxcy5nZXQoXCJyb29tXCIpIHx8IFwiZGVmYXVsdFwiO1xuICBjb25zdCBtb2RlID0gcXMuZ2V0KFwibW9kZVwiKSB8fCBcIlwiO1xuICBjb25zdCBtaXNzaW9uSWQgPSBxcy5nZXQoXCJtaXNzaW9uXCIpIHx8IChtb2RlID09PSBcImNhbXBhaWduXCIgPyBcIjFcIiA6IG51bGwpO1xuICBjb25zdCBuYW1lUGFyYW0gPSBzYW5pdGl6ZUNhbGxTaWduKHFzLmdldChcIm5hbWVcIikpO1xuICBjb25zdCBzdG9yZWROYW1lID0gc2FuaXRpemVDYWxsU2lnbihyZWFkU3RvcmVkQ2FsbFNpZ24oKSk7XG4gIGNvbnN0IGNhbGxTaWduID0gbmFtZVBhcmFtIHx8IHN0b3JlZE5hbWU7XG4gIGNvbnN0IG1hcFcgPSBwYXJzZUZsb2F0KHFzLmdldChcIm1hcFdcIikgfHwgXCI4MDAwXCIpO1xuICBjb25zdCBtYXBIID0gcGFyc2VGbG9hdChxcy5nZXQoXCJtYXBIXCIpIHx8IFwiNDUwMFwiKTtcblxuICBpZiAobmFtZVBhcmFtICYmIG5hbWVQYXJhbSAhPT0gc3RvcmVkTmFtZSkge1xuICAgIHBlcnNpc3RDYWxsU2lnbihuYW1lUGFyYW0pO1xuICB9XG5cbiAgLy8gR2F0ZSBldmVyeXRoaW5nIG9uIGEgdXNlciBnZXN0dXJlIChjZW50cmVkIGJ1dHRvbilcbiAgYXdhaXQgd2FpdEZvclVzZXJTdGFydCh7XG4gICAgbGFiZWw6IFwiU3RhcnQgR2FtZVwiLFxuICAgIHJlcXVlc3RGdWxsc2NyZWVuOiBmYWxzZSwgICAvLyBmbGlwIHRvIHRydWUgaWYgeW91IHdhbnQgZnVsbHNjcmVlblxuICAgIHJlc3VtZUF1ZGlvLCAgICAgICAgICAgICAgICAvLyB1c2VzIHN0b3J5L3NmeC50c1xuICB9KTtcblxuICAvLyAtLS0tIFN0YXJ0IGFjdHVhbCBhcHAgYWZ0ZXIgZ2VzdHVyZSAtLS0tXG4gIGNvbnN0IHN0YXRlID0gY3JlYXRlSW5pdGlhbFN0YXRlKCk7XG4gIGNvbnN0IHVpU3RhdGUgPSBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpO1xuICBjb25zdCBidXMgPSBjcmVhdGVFdmVudEJ1cygpO1xuXG4gIC8vIC0tLSBBVURJTzogZW5naW5lICsgYmluZGluZ3MgKyBkZWZhdWx0IHNjZW5lIC0tLVxuICBjb25zdCBlbmdpbmUgPSBBdWRpb0VuZ2luZS5nZXQoKTtcbiAgYXdhaXQgZW5naW5lLnJlc3VtZSgpOyAvLyBzYWZlIHBvc3QtZ2VzdHVyZVxuICBjb25zdCBtdXNpYyA9IG5ldyBNdXNpY0RpcmVjdG9yKGVuZ2luZSk7XG4gIHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyhidXMgYXMgYW55LCBlbmdpbmUsIG11c2ljKTtcblxuICAvLyBTdGFydCBhIGRlZmF1bHQgbXVzaWMgc2NlbmUgKGFkanVzdCBzZWVkL3NjZW5lIGFzIHlvdSBsaWtlKVxuICBidXMuZW1pdChcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiLCB7IHNjZW5lOiBcImFtYmllbnRcIiwgc2VlZDogNDIgfSk7XG5cbiAgLy8gT3B0aW9uYWw6IGJhc2ljIGhvb2tzIHRvIGRlbW9uc3RyYXRlIFNGWCAmIGR1Y2tpbmdcbiAgLy8gYnVzLm9uKFwiZGlhbG9ndWU6b3BlbmVkXCIsICgpID0+IGVuZ2luZS5kdWNrTXVzaWMoMC4zNSwgMC4xKSk7XG4gIC8vIGJ1cy5vbihcImRpYWxvZ3VlOmNsb3NlZFwiLCAoKSA9PiBlbmdpbmUudW5kdWNrTXVzaWMoMC4yNSkpO1xuXG4gIC8vIEV4YW1wbGUgZ2FtZSBTRlggd2lyaW5nIChhZGFwdCB0byB5b3VyIGFjdHVhbCBldmVudHMpXG4gIGJ1cy5vbihcInNoaXA6c3BlZWRDaGFuZ2VkXCIsICh7IHZhbHVlIH0pID0+IHtcbiAgICBpZiAodmFsdWUgPiAwKSBidXMuZW1pdChcImF1ZGlvOnNmeFwiLCB7IG5hbWU6IFwidGhydXN0XCIsIHZlbG9jaXR5OiBNYXRoLm1pbigxLCB2YWx1ZSkgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGdhbWUgPSBpbml0R2FtZSh7IHN0YXRlLCB1aVN0YXRlLCBidXMgfSk7XG4gIG1vdW50TWlzc2lvbkNvbnRyb2xsZXIoeyBzdGF0ZSwgYnVzLCBtb2RlLCBtaXNzaW9uSWQgfSk7XG5cbiAgLy8gTW91bnQgdHV0b3JpYWwgYW5kIHN0b3J5IGJhc2VkIG9uIGdhbWUgbW9kZVxuICBjb25zdCBlbmFibGVUdXRvcmlhbCA9IG1vZGUgPT09IFwiY2FtcGFpZ25cIiB8fCBtb2RlID09PSBcInR1dG9yaWFsXCI7XG4gIGNvbnN0IGVuYWJsZVN0b3J5ID0gbW9kZSA9PT0gXCJjYW1wYWlnblwiO1xuXG4gIGlmIChtb2RlID09PSBcImNhbXBhaWduXCIpIHtcbiAgICBjb25zdCBkaXNwYXRjaGVkV2F2ZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgICBidXMub24oXCJtaXNzaW9uOmJlYWNvbi1sb2NrZWRcIiwgKHsgaW5kZXggfSkgPT4ge1xuICAgICAgY29uc3Qgd2F2ZUluZGV4ID0gaW5kZXggKyAxO1xuICAgICAgaWYgKHdhdmVJbmRleCA8IDEgfHwgd2F2ZUluZGV4ID4gMykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoZGlzcGF0Y2hlZFdhdmVzLmhhcyh3YXZlSW5kZXgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGRpc3BhdGNoZWRXYXZlcy5hZGQod2F2ZUluZGV4KTtcbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJtaXNzaW9uX3NwYXduX3dhdmVcIiwgd2F2ZV9pbmRleDogd2F2ZUluZGV4IH0pO1xuICAgIH0pO1xuICB9XG5cbiAgbGV0IHR1dG9yaWFsOiBSZXR1cm5UeXBlPHR5cGVvZiBtb3VudFR1dG9yaWFsPiB8IG51bGwgPSBudWxsO1xuICBsZXQgdHV0b3JpYWxTdGFydGVkID0gZmFsc2U7XG5cbiAgaWYgKGVuYWJsZVR1dG9yaWFsKSB7XG4gICAgdHV0b3JpYWwgPSBtb3VudFR1dG9yaWFsKGJ1cyk7XG4gIH1cblxuICBjb25zdCBzdGFydFR1dG9yaWFsID0gKCk6IHZvaWQgPT4ge1xuICAgIGlmICghdHV0b3JpYWwgfHwgdHV0b3JpYWxTdGFydGVkKSByZXR1cm47XG4gICAgdHV0b3JpYWxTdGFydGVkID0gdHJ1ZTtcbiAgICBjbGVhclR1dG9yaWFsUHJvZ3Jlc3MoQkFTSUNfVFVUT1JJQUxfSUQpO1xuICAgIHR1dG9yaWFsLnN0YXJ0KHsgcmVzdW1lOiBmYWxzZSB9KTtcbiAgfTtcblxuICBpZiAoZW5hYmxlU3RvcnkpIHtcbiAgICAvLyBDYW1wYWlnbiBtb2RlOiBzdG9yeSArIHR1dG9yaWFsXG4gICAgXG4gICAgbW91bnRTdG9yeSh7IGJ1cywgc3RhdGUsIHJvb21JZDogcm9vbSB9KTtcbiAgfSBlbHNlIGlmIChtb2RlID09PSBcInR1dG9yaWFsXCIpIHtcbiAgICAvLyBUdXRvcmlhbCBtb2RlOiBhdXRvLXN0YXJ0IHR1dG9yaWFsIHdpdGhvdXQgc3RvcnlcbiAgICBzdGFydFR1dG9yaWFsKCk7XG4gIH1cbiAgLy8gRnJlZSBwbGF5IGFuZCBkZWZhdWx0OiBubyBzeXN0ZW1zIG1vdW50ZWRcblxuICBjb25uZWN0V2ViU29ja2V0KHtcbiAgICByb29tLFxuICAgIHN0YXRlLFxuICAgIGJ1cyxcbiAgICBtYXBXLFxuICAgIG1hcEgsXG4gICAgbW9kZSxcbiAgICBtaXNzaW9uSWQ6IG1pc3Npb25JZCA/PyB1bmRlZmluZWQsXG4gICAgb25TdGF0ZVVwZGF0ZWQ6ICgpID0+IGdhbWUub25TdGF0ZVVwZGF0ZWQoKSxcbiAgICBvbk9wZW46ICgpID0+IHtcbiAgICAgIGNvbnN0IG5hbWVUb1NlbmQgPSBjYWxsU2lnbiB8fCBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgICAgIGlmIChuYW1lVG9TZW5kKSBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiam9pblwiLCBuYW1lOiBuYW1lVG9TZW5kIH0pO1xuICAgIH0sXG4gIH0pO1xuXG4gIC8vIE9wdGlvbmFsOiBzdXNwZW5kL3Jlc3VtZSBhdWRpbyBvbiB0YWIgdmlzaWJpbGl0eSB0byBzYXZlIENQVVxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwidmlzaWJpbGl0eWNoYW5nZVwiLCAoKSA9PiB7XG4gICAgaWYgKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gXCJoaWRkZW5cIikge1xuICAgICAgdm9pZCBlbmdpbmUuc3VzcGVuZCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2b2lkIGVuZ2luZS5yZXN1bWUoKTtcbiAgICB9XG4gIH0pO1xufSkoKTtcblxuZnVuY3Rpb24gc2FuaXRpemVDYWxsU2lnbih2YWx1ZTogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHJldHVybiBcIlwiO1xuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHJldHVybiBcIlwiO1xuICByZXR1cm4gdHJpbW1lZC5zbGljZSgwLCAyNCk7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RDYWxsU2lnbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBpZiAobmFtZSkgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSwgbmFtZSk7XG4gICAgZWxzZSB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZKTtcbiAgfSBjYXRjaCB7fVxufVxuXG5mdW5jdGlvbiByZWFkU3RvcmVkQ2FsbFNpZ24oKTogc3RyaW5nIHtcbiAgdHJ5IHsgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVkpID8/IFwiXCI7IH1cbiAgY2F0Y2ggeyBy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LElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxVQUNQLE1BQU0sa0JBQWtCLEtBQUs7QUFBQSxRQUMvQjtBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixR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QUFBQSxFQUNILEdBQUc7QUFFSCxXQUFTLGlCQUFpQixPQUE4QjtBQUN0RCxRQUFJLENBQUMsTUFBTyxRQUFPO0FBQ25CLFVBQU0sVUFBVSxNQUFNLEtBQUs7QUFDM0IsUUFBSSxDQUFDLFFBQVMsUUFBTztBQUNyQixXQUFPLFFBQVEsTUFBTSxHQUFHLEVBQUU7QUFBQSxFQUM1QjtBQUVBLFdBQVMsZ0JBQWdCLE1BQW9CO0FBQzNDLFFBQUk7QUFDRixVQUFJLEtBQU0sUUFBTyxhQUFhLFFBQVEsdUJBQXVCLElBQUk7QUFBQSxVQUM1RCxRQUFPLGFBQWEsV0FBVyxxQkFBcUI7QUFBQSxJQUMzRCxTQUFRO0FBQUEsSUFBQztBQUFBLEVBQ1g7QUFFQSxXQUFTLHFCQUE2QjtBQWxKdEM7QUFtSkUsUUFBSTtBQUFFLGNBQU8sWUFBTyxhQUFhLFFBQVEscUJBQXFCLE1BQWpELFlBQXNEO0FBQUEsSUFBSSxTQUNqRTtBQUFFLGFBQU87QUFBQSxJQUFJO0FBQUEsRUFDckI7IiwKICAibmFtZXMiOiBbInNlbmRNZXNzYWdlIiwgIl9hIiwgIl9iIiwgInNlbmRNZXNzYWdlIiwgImdldEFwcHJveFNlcnZlck5vdyIsICJzZWxlY3Rpb24iLCAic2VuZE1lc3NhZ2UiLCAiZ2V0QXBwcm94U2VydmVyTm93IiwgIl9hIiwgIlNUWUxFX0lEIiwgImVuc3VyZVN0eWxlcyIsICJjaG9pY2UiLCAiX2EiLCAicmVzdW1lQXVkaW8iLCAiU1RPUkFHRV9QUkVGSVgiLCAibG9hZFByb2dyZXNzIiwgInNhdmVQcm9ncmVzcyIsICJwYXlsb2FkIl0KfQo=
