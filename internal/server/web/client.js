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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
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
      state.story = {
        activeNode: (_m = msg.story.active_node) != null ? _m : null,
        available: Array.isArray(msg.story.available) ? msg.story.available : [],
        flags: (_n = msg.story.flags) != null ? _n : {},
        recentEvents: Array.isArray(msg.story.recent_events) ? msg.story.recent_events.map((evt) => ({
          chapter: evt.chapter,
          node: evt.node,
          timestamp: evt.timestamp
        })) : []
      };
      if (state.story.activeNode === null) {
        state.story.activeNode = "story.signal-static-1.start";
      }
      if (state.story.activeNode !== prevActiveNode && state.story.activeNode) {
        bus.emit("story:nodeActivated", { nodeId: state.story.activeNode });
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

  // web/src/story/mission1-content.ts
  var MISSION_1_CONTENT = {
    // Mission start - garbled distress signal
    "story.signal-static-1.start": {
      speaker: "UNKNOWN SIGNAL",
      text: "\u2013gnal\u2026 \u2014issus\u2026 co\u2013dinates\u2026\n\n[A weak signal crackles through the void. The transmission is nearly unintelligible, but coordinates emerge from the static. Something\u2014or someone\u2014needs help.]",
      intent: "factory",
      typingSpeedMs: 20,
      choices: [
        { id: "investigate", text: "Investigate the signal" },
        { id: "cautious", text: "Approach with extreme caution" },
        { id: "ignore", text: "Log coordinates and continue patrol" }
      ],
      tutorialTip: {
        title: "Route Plotting",
        text: "Click on the map to plot waypoints for your ship. Right-click waypoints to adjust speed. Your route determines your heat buildup."
      }
    },
    // Beacon 1 locked - signal improving
    "story.signal-static-1.beacon-1": {
      speaker: "DISTRESS BEACON",
      text: "Signal improving\u2026 triangulating source\u2026 maintain low thrust.\n\n[The first beacon lock stabilizes the transmission. The signal is getting clearer, but you'll need to reach more beacons to pinpoint the origin.]",
      intent: "factory",
      typingSpeedMs: 18,
      continueLabel: "Continue",
      tutorialTip: {
        title: "Heat Management",
        text: "Watch your heat gauge. Flying too fast heats your ship. If you overheat, you'll stall. Match your speed to the marker line for optimal efficiency."
      }
    },
    // Beacon 2 locked - possible survivors
    "story.signal-static-1.beacon-2": {
      speaker: "DISTRESS BEACON",
      text: "Possible survivors detected\u2026 uplink unstable\u2026 watch for debris.\n\n[The second beacon reveals faint life signs. Something survived out here. The transmission warns of hazards ahead\u2014proceed with caution.]",
      intent: "factory",
      typingSpeedMs: 18,
      continueLabel: "Proceed Carefully",
      tutorialTip: {
        title: "Evasive Routing",
        text: "Plot routes that avoid obstacles and give you reaction time. Light-time delay means you see missiles where they were, not where they are. Plan ahead."
      }
    },
    // Beacon 3 locked - seeker signatures detected
    "story.signal-static-1.beacon-3": {
      speaker: "DISTRESS BEACON",
      text: "Beacon lock acquired\u2026 seeker signatures detected nearby\u2026 extreme caution advised.\n\n[The third beacon triangulates the distress source, but passive sensors detect automated defense systems. Whatever's out there, it's heavily guarded.]",
      intent: "factory",
      typingSpeedMs: 18,
      continueLabel: "Approach Final Beacon",
      tutorialTip: {
        title: "Combat Awareness",
        text: "Hostile seekers patrol this sector. Keep your speed low to avoid detection. High-speed runs generate heat signatures that draw attention."
      }
    },
    // Mission complete - archives unlocked
    "story.signal-static-1.complete": {
      speaker: "UNIT-0 ARCHIVES",
      text: "Unit-0, you found us.\n\nArchives unlocked. Emergency protocols bypassed. Uploading next mission parameters to your nav system.\n\n[The distress signal resolves into a data stream. Ancient archives flicker to life, revealing coordinates for your next objective.]",
      intent: "unit",
      typingSpeedMs: 16,
      continueLabel: "Mission Complete"
    }
  };
  function getDialogueForNode(nodeId) {
    return MISSION_1_CONTENT[nodeId] || null;
  }

  // web/src/story/controller.ts
  function createStoryController({ bus, overlay, state }) {
    const listeners = [];
    let tutorialTipElement = null;
    function handleNodeActivated({ nodeId }) {
      console.log("[story] Node activated:", nodeId);
      const parts = nodeId.split(".");
      if (parts.length < 3 || parts[0] !== "story") {
        console.warn("[story] Invalid node ID format:", nodeId);
        return;
      }
      const chapter = parts[1];
      const node = parts.slice(2).join(".");
      showDialogueForNode(chapter, node, nodeId);
    }
    function showDialogueForNode(chapter, node, fullNodeId) {
      const content = getDialogueForNode(fullNodeId);
      console.log("[story] Dialogue content:", content);
      if (!content) {
        console.warn("[story] No dialogue content found for:", fullNodeId);
        acknowledgeNode(fullNodeId, null);
        return;
      }
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
      var _a;
      console.log("[story] Starting story controller");
      listeners.push(bus.on("story:nodeActivated", handleNodeActivated));
      if ((_a = state.story) == null ? void 0 : _a.activeNode) {
        console.log("[story] Found active story node on startup:", state.story.activeNode);
        handleNodeActivated({ nodeId: state.story.activeNode });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS9jb25zdGFudHMudHMiLCAic3JjL2dhbWUvY2FtZXJhLnRzIiwgInNyYy9nYW1lL2lucHV0LnRzIiwgInNyYy9yb3V0ZS50cyIsICJzcmMvZ2FtZS9sb2dpYy50cyIsICJzcmMvZ2FtZS9yZW5kZXIudHMiLCAic3JjL2dhbWUvdWkudHMiLCAic3JjL21pc3Npb24vaHVkLnRzIiwgInNyYy9nYW1lLnRzIiwgInNyYy90dXRvcmlhbC9oaWdobGlnaHQudHMiLCAic3JjL3R1dG9yaWFsL3N0b3JhZ2UudHMiLCAic3JjL3R1dG9yaWFsL3JvbGVzLnRzIiwgInNyYy90dXRvcmlhbC9lbmdpbmUudHMiLCAic3JjL3R1dG9yaWFsL3N0ZXBzX2Jhc2ljLnRzIiwgInNyYy90dXRvcmlhbC9pbmRleC50cyIsICJzcmMvc3Rvcnkvb3ZlcmxheS50cyIsICJzcmMvc3RvcnkvbWlzc2lvbjEtY29udGVudC50cyIsICJzcmMvc3RvcnkvY29udHJvbGxlci50cyIsICJzcmMvc3RvcnkvaW5kZXgudHMiLCAic3JjL3N0YXJ0LWdhdGUudHMiLCAic3JjL2F1ZGlvL2VuZ2luZS50cyIsICJzcmMvYXVkaW8vZ3JhcGgudHMiLCAic3JjL2F1ZGlvL3NmeC50cyIsICJzcmMvc3Rvcnkvc2Z4LnRzIiwgInNyYy9hdWRpby9tdXNpYy9zY2VuZXMvYW1iaWVudC50cyIsICJzcmMvYXVkaW8vbXVzaWMvaW5kZXgudHMiLCAic3JjL2F1ZGlvL2N1ZXMudHMiLCAic3JjL21pc3Npb24vY29udHJvbGxlci50cyIsICJzcmMvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHR5cGUgeyBNaXNzaWxlU2VsZWN0aW9uIH0gZnJvbSBcIi4vc3RhdGVcIjtcblxuZXhwb3J0IHR5cGUgU2hpcENvbnRleHQgPSBcInNoaXBcIiB8IFwibWlzc2lsZVwiO1xuZXhwb3J0IHR5cGUgU2hpcFRvb2wgPSBcInNldFwiIHwgXCJzZWxlY3RcIiB8IG51bGw7XG5leHBvcnQgdHlwZSBNaXNzaWxlVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcblxuZXhwb3J0IGludGVyZmFjZSBFdmVudE1hcCB7XG4gIFwiY29udGV4dDpjaGFuZ2VkXCI6IHsgY29udGV4dDogU2hpcENvbnRleHQgfTtcbiAgXCJzaGlwOnRvb2xDaGFuZ2VkXCI6IHsgdG9vbDogU2hpcFRvb2wgfTtcbiAgXCJzaGlwOndheXBvaW50QWRkZWRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwic2hpcDp3YXlwb2ludE1vdmVkXCI6IHsgaW5kZXg6IG51bWJlcjsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcInNoaXA6aGVhdFByb2plY3Rpb25VcGRhdGVkXCI6IHsgaGVhdFZhbHVlczogbnVtYmVyW10gfTtcbiAgXCJoZWF0Om1hcmtlckFsaWduZWRcIjogeyB2YWx1ZTogbnVtYmVyOyBtYXJrZXI6IG51bWJlciB9O1xuICBcImhlYXQ6d2FybkVudGVyZWRcIjogeyB2YWx1ZTogbnVtYmVyOyB3YXJuQXQ6IG51bWJlciB9O1xuICBcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCI6IHsgdmFsdWU6IG51bWJlcjsgd2FybkF0OiBudW1iZXIgfTtcbiAgXCJoZWF0OnN0YWxsVHJpZ2dlcmVkXCI6IHsgc3RhbGxVbnRpbDogbnVtYmVyIH07XG4gIFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCI6IHsgcGxhbm5lZDogbnVtYmVyOyBhY3R1YWw6IG51bWJlciB9O1xuICBcInVpOndheXBvaW50SG92ZXJTdGFydFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJ1aTp3YXlwb2ludEhvdmVyRW5kXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6c2VsZWN0aW9uQ2hhbmdlZFwiOiB7IHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlcjsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6YWdyb0NoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIjogeyBzZWNvbmRzUmVtYWluaW5nOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmRlbGV0ZUludm9rZWRcIjogdm9pZDtcbiAgXCJtaXNzaWxlOnByZXNldFNlbGVjdGVkXCI6IHsgcHJlc2V0TmFtZTogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpoZWF0UHJvamVjdGlvblVwZGF0ZWRcIjogeyB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47IG92ZXJoZWF0QXQ/OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOm92ZXJoZWF0ZWRcIjogeyBtaXNzaWxlSWQ6IHN0cmluZzsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJoZWxwOnZpc2libGVDaGFuZ2VkXCI6IHsgdmlzaWJsZTogYm9vbGVhbiB9O1xuICBcInN0YXRlOnVwZGF0ZWRcIjogdm9pZDtcbiAgXCJ0dXRvcmlhbDpzdGFydGVkXCI6IHsgaWQ6IHN0cmluZyB9O1xuICBcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCI6IHsgaWQ6IHN0cmluZzsgc3RlcEluZGV4OiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfTtcbiAgXCJ0dXRvcmlhbDpjb21wbGV0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c2tpcHBlZFwiOiB7IGlkOiBzdHJpbmc7IGF0U3RlcDogbnVtYmVyIH07XG4gIFwiYm90OnNwYXduUmVxdWVzdGVkXCI6IHZvaWQ7XG4gIFwiZGlhbG9ndWU6b3BlbmVkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwiZGlhbG9ndWU6Y2xvc2VkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwiZGlhbG9ndWU6Y2hvaWNlXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNob2ljZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwic3Rvcnk6ZmxhZ1VwZGF0ZWRcIjogeyBmbGFnOiBzdHJpbmc7IHZhbHVlOiBib29sZWFuIH07XG4gIFwic3Rvcnk6cHJvZ3Jlc3NlZFwiOiB7IGNoYXB0ZXJJZDogc3RyaW5nOyBub2RlSWQ6IHN0cmluZyB9O1xuICBcInN0b3J5Om5vZGVBY3RpdmF0ZWRcIjogeyBub2RlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3Npb246c3RhcnRcIjogdm9pZDtcbiAgXCJtaXNzaW9uOmJlYWNvbi1sb2NrZWRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lvbjpjb21wbGV0ZWRcIjogdm9pZDtcbiAgXCJhdWRpbzpyZXN1bWVcIjogdm9pZDtcbiAgXCJhdWRpbzptdXRlXCI6IHZvaWQ7XG4gIFwiYXVkaW86dW5tdXRlXCI6IHZvaWQ7XG4gIFwiYXVkaW86c2V0LW1hc3Rlci1nYWluXCI6IHsgZ2FpbjogbnVtYmVyIH07XG4gIFwiYXVkaW86c2Z4XCI6IHsgbmFtZTogXCJ1aVwiIHwgXCJsYXNlclwiIHwgXCJ0aHJ1c3RcIiB8IFwiZXhwbG9zaW9uXCIgfCBcImxvY2tcIiB8IFwiZGlhbG9ndWVcIjsgdmVsb2NpdHk/OiBudW1iZXI7IHBhbj86IG51bWJlciB9O1xuICBcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiOiB7IHNjZW5lOiBcImFtYmllbnRcIiB8IFwiY29tYmF0XCIgfCBcImxvYmJ5XCI7IHNlZWQ/OiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzpwYXJhbVwiOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6dHJhbnNwb3J0XCI6IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9O1xufVxuXG5leHBvcnQgdHlwZSBFdmVudEtleSA9IGtleW9mIEV2ZW50TWFwO1xuZXhwb3J0IHR5cGUgRXZlbnRQYXlsb2FkPEsgZXh0ZW5kcyBFdmVudEtleT4gPSBFdmVudE1hcFtLXTtcbmV4cG9ydCB0eXBlIEhhbmRsZXI8SyBleHRlbmRzIEV2ZW50S2V5PiA9IChwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pID0+IHZvaWQ7XG5cbnR5cGUgVm9pZEtleXMgPSB7XG4gIFtLIGluIEV2ZW50S2V5XTogRXZlbnRNYXBbS10gZXh0ZW5kcyB2b2lkID8gSyA6IG5ldmVyXG59W0V2ZW50S2V5XTtcblxudHlwZSBOb25Wb2lkS2V5cyA9IEV4Y2x1ZGU8RXZlbnRLZXksIFZvaWRLZXlzPjtcblxuZXhwb3J0IGludGVyZmFjZSBFdmVudEJ1cyB7XG4gIG9uPEsgZXh0ZW5kcyBFdmVudEtleT4oZXZlbnQ6IEssIGhhbmRsZXI6IEhhbmRsZXI8Sz4pOiAoKSA9PiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBOb25Wb2lkS2V5cz4oZXZlbnQ6IEssIHBheWxvYWQ6IEV2ZW50UGF5bG9hZDxLPik6IHZvaWQ7XG4gIGVtaXQ8SyBleHRlbmRzIFZvaWRLZXlzPihldmVudDogSyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFdmVudEJ1cygpOiBFdmVudEJ1cyB7XG4gIGNvbnN0IGhhbmRsZXJzID0gbmV3IE1hcDxFdmVudEtleSwgU2V0PEZ1bmN0aW9uPj4oKTtcbiAgcmV0dXJuIHtcbiAgICBvbihldmVudCwgaGFuZGxlcikge1xuICAgICAgbGV0IHNldCA9IGhhbmRsZXJzLmdldChldmVudCk7XG4gICAgICBpZiAoIXNldCkge1xuICAgICAgICBzZXQgPSBuZXcgU2V0KCk7XG4gICAgICAgIGhhbmRsZXJzLnNldChldmVudCwgc2V0KTtcbiAgICAgIH1cbiAgICAgIHNldC5hZGQoaGFuZGxlcik7XG4gICAgICByZXR1cm4gKCkgPT4gc2V0IS5kZWxldGUoaGFuZGxlcik7XG4gICAgfSxcbiAgICBlbWl0KGV2ZW50OiBFdmVudEtleSwgcGF5bG9hZD86IHVua25vd24pIHtcbiAgICAgIGNvbnN0IHNldCA9IGhhbmRsZXJzLmdldChldmVudCk7XG4gICAgICBpZiAoIXNldCB8fCBzZXQuc2l6ZSA9PT0gMCkgcmV0dXJuO1xuICAgICAgZm9yIChjb25zdCBmbiBvZiBzZXQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAoZm4gYXMgKHZhbHVlPzogdW5rbm93bikgPT4gdm9pZCkocGF5bG9hZCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtidXNdIGhhbmRsZXIgZm9yICR7ZXZlbnR9IGZhaWxlZGAsIGVycik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgU2hpcENvbnRleHQsIFNoaXBUb29sLCBNaXNzaWxlVG9vbCB9IGZyb20gXCIuL2J1c1wiO1xuXG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fU1BFRUQgPSA0MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9TUEVFRCA9IDI1MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9BR1JPID0gMTAwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUFYX0xJRkVUSU1FID0gMTIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX0xJRkVUSU1FID0gMjA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9TUEVFRF9QRU5BTFRZID0gODA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1BFTkFMVFkgPSA0MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUkVGID0gMjAwMDtcblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlTGltaXRzIHtcbiAgc3BlZWRNaW46IG51bWJlcjtcbiAgc3BlZWRNYXg6IG51bWJlcjtcbiAgYWdyb01pbjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHNwZWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFZpZXcge1xuICB2YWx1ZTogbnVtYmVyO1xuICBtYXg6IG51bWJlcjtcbiAgd2FybkF0OiBudW1iZXI7XG4gIG92ZXJoZWF0QXQ6IG51bWJlcjtcbiAgbWFya2VyU3BlZWQ6IG51bWJlcjtcbiAgc3RhbGxVbnRpbE1zOiBudW1iZXI7IC8vIGNsaWVudC1zeW5jZWQgdGltZSBpbiBtaWxsaXNlY29uZHNcbiAga1VwOiBudW1iZXI7XG4gIGtEb3duOiBudW1iZXI7XG4gIGV4cDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNoaXBTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBocD86IG51bWJlcjtcbiAga2lsbHM/OiBudW1iZXI7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbiAgY3VycmVudFdheXBvaW50SW5kZXg/OiBudW1iZXI7XG4gIGhlYXQ/OiBIZWF0Vmlldztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHaG9zdFNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIHNlbGY/OiBib29sZWFuO1xuICBhZ3JvX3JhZGl1czogbnVtYmVyO1xuICBoZWF0PzogSGVhdFZpZXc7IC8vIE1pc3NpbGUgaGVhdCBkYXRhXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVJvdXRlIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICB3YXlwb2ludHM6IFdheXBvaW50W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFBhcmFtcyB7XG4gIG1heDogbnVtYmVyO1xuICB3YXJuQXQ6IG51bWJlcjtcbiAgb3ZlcmhlYXRBdDogbnVtYmVyO1xuICBtYXJrZXJTcGVlZDogbnVtYmVyO1xuICBrVXA6IG51bWJlcjtcbiAga0Rvd246IG51bWJlcjtcbiAgZXhwOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUNvbmZpZyB7XG4gIHNwZWVkOiBudW1iZXI7XG4gIGFncm9SYWRpdXM6IG51bWJlcjtcbiAgbGlmZXRpbWU6IG51bWJlcjtcbiAgaGVhdFBhcmFtcz86IEhlYXRQYXJhbXM7IC8vIE9wdGlvbmFsIGN1c3RvbSBoZWF0IGNvbmZpZ3VyYXRpb25cbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUHJlc2V0IHtcbiAgbmFtZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBzcGVlZDogbnVtYmVyO1xuICBhZ3JvUmFkaXVzOiBudW1iZXI7XG4gIGhlYXRQYXJhbXM6IEhlYXRQYXJhbXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW52ZW50b3J5SXRlbSB7XG4gIHR5cGU6IHN0cmluZztcbiAgdmFyaWFudF9pZDogc3RyaW5nO1xuICBoZWF0X2NhcGFjaXR5OiBudW1iZXI7XG4gIHF1YW50aXR5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW52ZW50b3J5IHtcbiAgaXRlbXM6IEludmVudG9yeUl0ZW1bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYWdOb2RlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICBzdGF0dXM6IHN0cmluZzsgLy8gXCJsb2NrZWRcIiB8IFwiYXZhaWxhYmxlXCIgfCBcImluX3Byb2dyZXNzXCIgfCBcImNvbXBsZXRlZFwiXG4gIHJlbWFpbmluZ19zOiBudW1iZXI7XG4gIGR1cmF0aW9uX3M6IG51bWJlcjtcbiAgcmVwZWF0YWJsZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYWdTdGF0ZSB7XG4gIG5vZGVzOiBEYWdOb2RlW107XG59XG5cbi8vIE1pc3NpbGUgcHJlc2V0IGRlZmluaXRpb25zIG1hdGNoaW5nIGJhY2tlbmRcbmV4cG9ydCBjb25zdCBNSVNTSUxFX1BSRVNFVFM6IE1pc3NpbGVQcmVzZXRbXSA9IFtcbiAge1xuICAgIG5hbWU6IFwiU2NvdXRcIixcbiAgICBkZXNjcmlwdGlvbjogXCJTbG93LCBlZmZpY2llbnQsIGxvbmctcmFuZ2UuIEhpZ2ggaGVhdCBjYXBhY2l0eS5cIixcbiAgICBzcGVlZDogODAsXG4gICAgYWdyb1JhZGl1czogMTUwMCxcbiAgICBoZWF0UGFyYW1zOiB7XG4gICAgICBtYXg6IDYwLFxuICAgICAgd2FybkF0OiA0MixcbiAgICAgIG92ZXJoZWF0QXQ6IDYwLFxuICAgICAgbWFya2VyU3BlZWQ6IDcwLFxuICAgICAga1VwOiAyMCxcbiAgICAgIGtEb3duOiAxNSxcbiAgICAgIGV4cDogMS41LFxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBcIkh1bnRlclwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkJhbGFuY2VkIHNwZWVkIGFuZCBkZXRlY3Rpb24uIFN0YW5kYXJkIGhlYXQuXCIsXG4gICAgc3BlZWQ6IDE1MCxcbiAgICBhZ3JvUmFkaXVzOiA4MDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA1MCxcbiAgICAgIHdhcm5BdDogMzUsXG4gICAgICBvdmVyaGVhdEF0OiA1MCxcbiAgICAgIG1hcmtlclNwZWVkOiAxMjAsXG4gICAgICBrVXA6IDI4LFxuICAgICAga0Rvd246IDEyLFxuICAgICAgZXhwOiAxLjUsXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiU25pcGVyXCIsXG4gICAgZGVzY3JpcHRpb246IFwiRmFzdCwgbmFycm93IGRldGVjdGlvbi4gTG93IGhlYXQgY2FwYWNpdHkuXCIsXG4gICAgc3BlZWQ6IDIyMCxcbiAgICBhZ3JvUmFkaXVzOiAzMDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA0MCxcbiAgICAgIHdhcm5BdDogMjgsXG4gICAgICBvdmVyaGVhdEF0OiA0MCxcbiAgICAgIG1hcmtlclNwZWVkOiAxODAsXG4gICAgICBrVXA6IDM1LFxuICAgICAga0Rvd246IDgsXG4gICAgICBleHA6IDEuNSxcbiAgICB9LFxuICB9LFxuXTtcblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1ldGEge1xuICBjPzogbnVtYmVyO1xuICB3PzogbnVtYmVyO1xuICBoPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEJlYWNvbkRlZmluaXRpb24ge1xuICBjeDogbnVtYmVyO1xuICBjeTogbnVtYmVyO1xuICByYWRpdXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaW9uU3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIG1pc3Npb25JZDogc3RyaW5nO1xuICBiZWFjb25JbmRleDogbnVtYmVyO1xuICBob2xkQWNjdW06IG51bWJlcjtcbiAgaG9sZFJlcXVpcmVkOiBudW1iZXI7XG4gIGJlYWNvbnM6IEJlYWNvbkRlZmluaXRpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUV2ZW50IHtcbiAgY2hhcHRlcjogc3RyaW5nO1xuICBub2RlOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5U3RhdGUge1xuICBhY3RpdmVOb2RlOiBzdHJpbmcgfCBudWxsO1xuICBhdmFpbGFibGU6IHN0cmluZ1tdO1xuICBmbGFnczogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG4gIHJlY2VudEV2ZW50czogU3RvcnlFdmVudFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFwcFN0YXRlIHtcbiAgbm93OiBudW1iZXI7XG4gIG5vd1N5bmNlZEF0OiBudW1iZXI7XG4gIG1lOiBTaGlwU25hcHNob3QgfCBudWxsO1xuICBnaG9zdHM6IEdob3N0U25hcHNob3RbXTtcbiAgbWlzc2lsZXM6IE1pc3NpbGVTbmFwc2hvdFtdO1xuICBtaXNzaWxlUm91dGVzOiBNaXNzaWxlUm91dGVbXTtcbiAgYWN0aXZlTWlzc2lsZVJvdXRlSWQ6IHN0cmluZyB8IG51bGw7XG4gIG5leHRNaXNzaWxlUmVhZHlBdDogbnVtYmVyO1xuICBtaXNzaWxlQ29uZmlnOiBNaXNzaWxlQ29uZmlnO1xuICBtaXNzaWxlTGltaXRzOiBNaXNzaWxlTGltaXRzO1xuICB3b3JsZE1ldGE6IFdvcmxkTWV0YTtcbiAgaW52ZW50b3J5OiBJbnZlbnRvcnkgfCBudWxsO1xuICBkYWc6IERhZ1N0YXRlIHwgbnVsbDtcbiAgbWlzc2lvbjogTWlzc2lvblN0YXRlIHwgbnVsbDtcbiAgc3Rvcnk6IFN0b3J5U3RhdGUgfCBudWxsO1xuICBjcmFmdEhlYXRDYXBhY2l0eTogbnVtYmVyOyAvLyBIZWF0IGNhcGFjaXR5IHNsaWRlciB2YWx1ZSBmb3IgY3JhZnRpbmdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBBY3RpdmVUb29sID1cbiAgfCBcInNoaXAtc2V0XCJcbiAgfCBcInNoaXAtc2VsZWN0XCJcbiAgfCBcIm1pc3NpbGUtc2V0XCJcbiAgfCBcIm1pc3NpbGUtc2VsZWN0XCJcbiAgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVJU3RhdGUge1xuICBpbnB1dENvbnRleHQ6IFNoaXBDb250ZXh0O1xuICBzaGlwVG9vbDogU2hpcFRvb2w7XG4gIG1pc3NpbGVUb29sOiBNaXNzaWxlVG9vbDtcbiAgYWN0aXZlVG9vbDogQWN0aXZlVG9vbDtcbiAgc2hvd1NoaXBSb3V0ZTogYm9vbGVhbjtcbiAgaGVscFZpc2libGU6IGJvb2xlYW47XG4gIHpvb206IG51bWJlcjtcbiAgcGFuWDogbnVtYmVyO1xuICBwYW5ZOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpOiBVSVN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpbnB1dENvbnRleHQ6IFwic2hpcFwiLFxuICAgIHNoaXBUb29sOiBcInNldFwiLFxuICAgIG1pc3NpbGVUb29sOiBudWxsLFxuICAgIGFjdGl2ZVRvb2w6IFwic2hpcC1zZXRcIixcbiAgICBzaG93U2hpcFJvdXRlOiB0cnVlLFxuICAgIGhlbHBWaXNpYmxlOiBmYWxzZSxcbiAgICB6b29tOiAxLjAsXG4gICAgcGFuWDogMCxcbiAgICBwYW5ZOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFN0YXRlKGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogQXBwU3RhdGUge1xuICByZXR1cm4ge1xuICAgIG5vdzogMCxcbiAgICBub3dTeW5jZWRBdDogdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgPyBwZXJmb3JtYW5jZS5ub3coKVxuICAgICAgOiBEYXRlLm5vdygpLFxuICAgIG1lOiBudWxsLFxuICAgIGdob3N0czogW10sXG4gICAgbWlzc2lsZXM6IFtdLFxuICAgIG1pc3NpbGVSb3V0ZXM6IFtdLFxuICAgIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBudWxsLFxuICAgIG5leHRNaXNzaWxlUmVhZHlBdDogMCxcbiAgICBtaXNzaWxlQ29uZmlnOiB7XG4gICAgICBzcGVlZDogMTgwLFxuICAgICAgYWdyb1JhZGl1czogODAwLFxuICAgICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcigxODAsIDgwMCwgbGltaXRzKSxcbiAgICAgIGhlYXRQYXJhbXM6IE1JU1NJTEVfUFJFU0VUU1sxXS5oZWF0UGFyYW1zLCAvLyBEZWZhdWx0IHRvIEh1bnRlciBwcmVzZXRcbiAgICB9LFxuICAgIG1pc3NpbGVMaW1pdHM6IGxpbWl0cyxcbiAgICB3b3JsZE1ldGE6IHt9LFxuICAgIGludmVudG9yeTogbnVsbCxcbiAgICBkYWc6IG51bGwsXG4gICAgbWlzc2lvbjogbnVsbCxcbiAgICBzdG9yeTogbnVsbCxcbiAgICBjcmFmdEhlYXRDYXBhY2l0eTogODAsIC8vIERlZmF1bHQgdG8gYmFzaWMgbWlzc2lsZSBoZWF0IGNhcGFjaXR5XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtaXNzaWxlTGlmZXRpbWVGb3Ioc3BlZWQ6IG51bWJlciwgYWdyb1JhZGl1czogbnVtYmVyLCBsaW1pdHM6IE1pc3NpbGVMaW1pdHMgPSB7XG4gIHNwZWVkTWluOiBNSVNTSUxFX01JTl9TUEVFRCxcbiAgc3BlZWRNYXg6IE1JU1NJTEVfTUFYX1NQRUVELFxuICBhZ3JvTWluOiBNSVNTSUxFX01JTl9BR1JPLFxufSk6IG51bWJlciB7XG4gIGNvbnN0IG1pblNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4gOiBNSVNTSUxFX01JTl9TUEVFRDtcbiAgY29uc3QgbWF4U3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCA6IE1JU1NJTEVfTUFYX1NQRUVEO1xuICBjb25zdCBtaW5BZ3JvID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluIDogTUlTU0lMRV9NSU5fQUdSTztcbiAgY29uc3Qgc3BhbiA9IG1heFNwZWVkIC0gbWluU3BlZWQ7XG4gIGNvbnN0IHNwZWVkTm9ybSA9IHNwYW4gPiAwID8gY2xhbXAoKHNwZWVkIC0gbWluU3BlZWQpIC8gc3BhbiwgMCwgMSkgOiAwO1xuICBjb25zdCBhZGp1c3RlZEFncm8gPSBNYXRoLm1heCgwLCBhZ3JvUmFkaXVzIC0gbWluQWdybyk7XG4gIGNvbnN0IGFncm9Ob3JtID0gY2xhbXAoYWRqdXN0ZWRBZ3JvIC8gTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiwgMCwgMSk7XG4gIGNvbnN0IHJlZHVjdGlvbiA9IHNwZWVkTm9ybSAqIE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSArIGFncm9Ob3JtICogTUlTU0lMRV9MSUZFVElNRV9BR1JPX1BFTkFMVFk7XG4gIGNvbnN0IGJhc2UgPSBNSVNTSUxFX01BWF9MSUZFVElNRTtcbiAgcmV0dXJuIGNsYW1wKGJhc2UgLSByZWR1Y3Rpb24sIE1JU1NJTEVfTUlOX0xJRkVUSU1FLCBNSVNTSUxFX01BWF9MSUZFVElNRSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZU1pc3NpbGVDb25maWcoXG4gIGNmZzogUGFydGlhbDxQaWNrPE1pc3NpbGVDb25maWcsIFwic3BlZWRcIiB8IFwiYWdyb1JhZGl1c1wiIHwgXCJoZWF0UGFyYW1zXCI+PixcbiAgZmFsbGJhY2s6IE1pc3NpbGVDb25maWcsXG4gIGxpbWl0czogTWlzc2lsZUxpbWl0cyxcbik6IE1pc3NpbGVDb25maWcge1xuICBjb25zdCBtaW5TcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluIDogTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXggOiBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgbWluQWdybyA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiA6IE1JU1NJTEVfTUlOX0FHUk87XG4gIGNvbnN0IGJhc2UgPSBmYWxsYmFjayA/PyB7XG4gICAgc3BlZWQ6IG1pblNwZWVkLFxuICAgIGFncm9SYWRpdXM6IG1pbkFncm8sXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihtaW5TcGVlZCwgbWluQWdybywgbGltaXRzKSxcbiAgfTtcbiAgY29uc3QgbWVyZ2VkU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUoY2ZnLnNwZWVkID8/IGJhc2Uuc3BlZWQpID8gKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA6IGJhc2Uuc3BlZWQ7XG4gIGNvbnN0IG1lcmdlZEFncm8gPSBOdW1iZXIuaXNGaW5pdGUoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA/IChjZmcuYWdyb1JhZGl1cyA/PyBiYXNlLmFncm9SYWRpdXMpIDogYmFzZS5hZ3JvUmFkaXVzO1xuICBjb25zdCBzcGVlZCA9IGNsYW1wKG1lcmdlZFNwZWVkLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICBjb25zdCBhZ3JvUmFkaXVzID0gTWF0aC5tYXgobWluQWdybywgbWVyZ2VkQWdybyk7XG4gIGNvbnN0IGhlYXRQYXJhbXMgPSBjZmcuaGVhdFBhcmFtcyA/IHsgLi4uY2ZnLmhlYXRQYXJhbXMgfSA6IGJhc2UuaGVhdFBhcmFtcyA/IHsgLi4uYmFzZS5oZWF0UGFyYW1zIH0gOiB1bmRlZmluZWQ7XG4gIHJldHVybiB7XG4gICAgc3BlZWQsXG4gICAgYWdyb1JhZGl1cyxcbiAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKHNwZWVkLCBhZ3JvUmFkaXVzLCBsaW1pdHMpLFxuICAgIGhlYXRQYXJhbXMsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb25vdG9uaWNOb3coKTogbnVtYmVyIHtcbiAgaWYgKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gIH1cbiAgcmV0dXJuIERhdGUubm93KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZVdheXBvaW50TGlzdChsaXN0OiBXYXlwb2ludFtdIHwgdW5kZWZpbmVkIHwgbnVsbCk6IFdheXBvaW50W10ge1xuICBpZiAoIUFycmF5LmlzQXJyYXkobGlzdCkpIHJldHVybiBbXTtcbiAgcmV0dXJuIGxpc3QubWFwKCh3cCkgPT4gKHsgLi4ud3AgfSkpO1xufVxuXG4vLyBQcm9qZWN0IGhlYXQgYWxvbmcgYSBtaXNzaWxlIHJvdXRlXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVSb3V0ZVByb2plY3Rpb24ge1xuICB3YXlwb2ludHM6IFdheXBvaW50W107XG4gIGhlYXRBdFdheXBvaW50czogbnVtYmVyW107XG4gIHdpbGxPdmVyaGVhdDogYm9vbGVhbjtcbiAgb3ZlcmhlYXRBdD86IG51bWJlcjsgLy8gSW5kZXggd2hlcmUgb3ZlcmhlYXQgb2NjdXJzXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0TWlzc2lsZUhlYXQoXG4gIHJvdXRlOiBXYXlwb2ludFtdLFxuICBkZWZhdWx0U3BlZWQ6IG51bWJlcixcbiAgaGVhdFBhcmFtczogSGVhdFBhcmFtc1xuKTogTWlzc2lsZVJvdXRlUHJvamVjdGlvbiB7XG4gIGNvbnN0IHByb2plY3Rpb246IE1pc3NpbGVSb3V0ZVByb2plY3Rpb24gPSB7XG4gICAgd2F5cG9pbnRzOiByb3V0ZSxcbiAgICBoZWF0QXRXYXlwb2ludHM6IFtdLFxuICAgIHdpbGxPdmVyaGVhdDogZmFsc2UsXG4gIH07XG5cbiAgaWYgKHJvdXRlLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBwcm9qZWN0aW9uO1xuICB9XG5cbiAgbGV0IGhlYXQgPSAwOyAvLyBNaXNzaWxlcyBzdGFydCBhdCB6ZXJvIGhlYXRcbiAgbGV0IHBvcyA9IHsgeDogcm91dGVbMF0ueCwgeTogcm91dGVbMF0ueSB9O1xuICBsZXQgY3VycmVudFNwZWVkID0gcm91dGVbMF0uc3BlZWQgPiAwID8gcm91dGVbMF0uc3BlZWQgOiBkZWZhdWx0U3BlZWQ7XG5cbiAgcHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHMucHVzaChoZWF0KTtcblxuICBmb3IgKGxldCBpID0gMTsgaSA8IHJvdXRlLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgdGFyZ2V0UG9zID0gcm91dGVbaV07XG4gICAgY29uc3QgdGFyZ2V0U3BlZWQgPSB0YXJnZXRQb3Muc3BlZWQgPiAwID8gdGFyZ2V0UG9zLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGRpc3RhbmNlIGFuZCB0aW1lXG4gICAgY29uc3QgZHggPSB0YXJnZXRQb3MueCAtIHBvcy54O1xuICAgIGNvbnN0IGR5ID0gdGFyZ2V0UG9zLnkgLSBwb3MueTtcbiAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG5cbiAgICBpZiAoZGlzdGFuY2UgPCAwLjAwMSkge1xuICAgICAgcHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHMucHVzaChoZWF0KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIEF2ZXJhZ2Ugc3BlZWQgZHVyaW5nIHNlZ21lbnRcbiAgICBjb25zdCBhdmdTcGVlZCA9IChjdXJyZW50U3BlZWQgKyB0YXJnZXRTcGVlZCkgKiAwLjU7XG4gICAgY29uc3Qgc2VnbWVudFRpbWUgPSBkaXN0YW5jZSAvIE1hdGgubWF4KGF2Z1NwZWVkLCAxKTtcblxuICAgIC8vIENhbGN1bGF0ZSBoZWF0IHJhdGUgKG1hdGNoIHNlcnZlciBmb3JtdWxhKVxuICAgIGNvbnN0IFZuID0gTWF0aC5tYXgoaGVhdFBhcmFtcy5tYXJrZXJTcGVlZCwgMC4wMDAwMDEpO1xuICAgIGNvbnN0IGRldiA9IGF2Z1NwZWVkIC0gaGVhdFBhcmFtcy5tYXJrZXJTcGVlZDtcbiAgICBjb25zdCBwID0gaGVhdFBhcmFtcy5leHA7XG5cbiAgICBsZXQgaGRvdDogbnVtYmVyO1xuICAgIGlmIChkZXYgPj0gMCkge1xuICAgICAgLy8gSGVhdGluZ1xuICAgICAgaGRvdCA9IGhlYXRQYXJhbXMua1VwICogTWF0aC5wb3coZGV2IC8gVm4sIHApO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDb29saW5nXG4gICAgICBoZG90ID0gLWhlYXRQYXJhbXMua0Rvd24gKiBNYXRoLnBvdyhNYXRoLmFicyhkZXYpIC8gVm4sIHApO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBoZWF0XG4gICAgaGVhdCArPSBoZG90ICogc2VnbWVudFRpbWU7XG4gICAgaGVhdCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGhlYXQsIGhlYXRQYXJhbXMubWF4KSk7XG5cbiAgICBwcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuICAgIHBvcyA9IHsgeDogdGFyZ2V0UG9zLngsIHk6IHRhcmdldFBvcy55IH07XG4gICAgY3VycmVudFNwZWVkID0gdGFyZ2V0U3BlZWQ7XG5cbiAgICAvLyBDaGVjayBmb3Igb3ZlcmhlYXRcbiAgICBpZiAoaGVhdCA+PSBoZWF0UGFyYW1zLm92ZXJoZWF0QXQgJiYgIXByb2plY3Rpb24ud2lsbE92ZXJoZWF0KSB7XG4gICAgICBwcm9qZWN0aW9uLndpbGxPdmVyaGVhdCA9IHRydWU7XG4gICAgICBwcm9qZWN0aW9uLm92ZXJoZWF0QXQgPSBpO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBwb3NpdGlvbiBhbmQgc3BlZWRcbiAgICBwb3MgPSB0YXJnZXRQb3M7XG4gICAgY3VycmVudFNwZWVkID0gdGFyZ2V0U3BlZWQ7XG4gIH1cblxuICByZXR1cm4gcHJvamVjdGlvbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGU6IEFwcFN0YXRlLCBsaW1pdHM6IFBhcnRpYWw8TWlzc2lsZUxpbWl0cz4pOiB2b2lkIHtcbiAgc3RhdGUubWlzc2lsZUxpbWl0cyA9IHtcbiAgICBzcGVlZE1pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4hIDogc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1pbixcbiAgICBzcGVlZE1heDogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXghIDogc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCxcbiAgICBhZ3JvTWluOiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4hIDogc3RhdGUubWlzc2lsZUxpbWl0cy5hZ3JvTWluLFxuICB9O1xufVxuIiwgImltcG9ydCB7IHR5cGUgRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7XG4gIHR5cGUgQXBwU3RhdGUsXG4gIHR5cGUgTWlzc2lsZVJvdXRlLFxuICBtb25vdG9uaWNOb3csXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbiAgdXBkYXRlTWlzc2lsZUxpbWl0cyxcbn0gZnJvbSBcIi4vc3RhdGVcIjtcblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBzcGVlZD86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVSb3V0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU/OiBzdHJpbmc7XG4gIHdheXBvaW50cz86IFNlcnZlck1pc3NpbGVXYXlwb2ludFtdO1xufVxuXG5pbnRlcmZhY2UgU2VydmVySGVhdFZpZXcge1xuICB2OiBudW1iZXI7ICAvLyBjdXJyZW50IGhlYXQgdmFsdWVcbiAgbTogbnVtYmVyOyAgLy8gbWF4XG4gIHc6IG51bWJlcjsgIC8vIHdhcm5BdFxuICBvOiBudW1iZXI7ICAvLyBvdmVyaGVhdEF0XG4gIG1zOiBudW1iZXI7IC8vIG1hcmtlclNwZWVkXG4gIHN1OiBudW1iZXI7IC8vIHN0YWxsVW50aWwgKHNlcnZlciB0aW1lIHNlY29uZHMpXG4gIGt1OiBudW1iZXI7IC8vIGtVcFxuICBrZDogbnVtYmVyOyAvLyBrRG93blxuICBleDogbnVtYmVyOyAvLyBleHBcbn1cblxuaW50ZXJmYWNlIFNlcnZlclNoaXBTdGF0ZSB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBocD86IG51bWJlcjtcbiAga2lsbHM/OiBudW1iZXI7XG4gIHdheXBvaW50cz86IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHNwZWVkPzogbnVtYmVyIH0+O1xuICBjdXJyZW50X3dheXBvaW50X2luZGV4PzogbnVtYmVyO1xuICBoZWF0PzogU2VydmVySGVhdFZpZXc7XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlU3RhdGUge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgc2VsZj86IGJvb2xlYW47XG4gIGFncm9fcmFkaXVzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJTdGF0ZU1lc3NhZ2Uge1xuICB0eXBlOiBcInN0YXRlXCI7XG4gIG5vdzogbnVtYmVyO1xuICBuZXh0X21pc3NpbGVfcmVhZHk/OiBudW1iZXI7XG4gIG1lPzogU2VydmVyU2hpcFN0YXRlIHwgbnVsbDtcbiAgZ2hvc3RzPzogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgdng6IG51bWJlcjsgdnk6IG51bWJlciB9PjtcbiAgbWlzc2lsZXM/OiBTZXJ2ZXJNaXNzaWxlU3RhdGVbXTtcbiAgbWlzc2lsZV9yb3V0ZXM/OiBTZXJ2ZXJNaXNzaWxlUm91dGVbXTtcbiAgbWlzc2lsZV9jb25maWc/OiB7XG4gICAgc3BlZWQ/OiBudW1iZXI7XG4gICAgc3BlZWRfbWluPzogbnVtYmVyO1xuICAgIHNwZWVkX21heD86IG51bWJlcjtcbiAgICBhZ3JvX3JhZGl1cz86IG51bWJlcjtcbiAgICBhZ3JvX21pbj86IG51bWJlcjtcbiAgICBsaWZldGltZT86IG51bWJlcjtcbiAgICBoZWF0X2NvbmZpZz86IHtcbiAgICAgIG1heD86IG51bWJlcjtcbiAgICAgIHdhcm5fYXQ/OiBudW1iZXI7XG4gICAgICBvdmVyaGVhdF9hdD86IG51bWJlcjtcbiAgICAgIG1hcmtlcl9zcGVlZD86IG51bWJlcjtcbiAgICAgIGtfdXA/OiBudW1iZXI7XG4gICAgICBrX2Rvd24/OiBudW1iZXI7XG4gICAgICBleHA/OiBudW1iZXI7XG4gICAgfSB8IG51bGw7XG4gIH0gfCBudWxsO1xuICBhY3RpdmVfbWlzc2lsZV9yb3V0ZT86IHN0cmluZyB8IG51bGw7XG4gIG1ldGE/OiB7XG4gICAgYz86IG51bWJlcjtcbiAgICB3PzogbnVtYmVyO1xuICAgIGg/OiBudW1iZXI7XG4gIH07XG4gIGludmVudG9yeT86IHtcbiAgICBpdGVtcz86IEFycmF5PHtcbiAgICAgIHR5cGU6IHN0cmluZztcbiAgICAgIHZhcmlhbnRfaWQ6IHN0cmluZztcbiAgICAgIGhlYXRfY2FwYWNpdHk6IG51bWJlcjtcbiAgICAgIHF1YW50aXR5OiBudW1iZXI7XG4gICAgfT47XG4gIH07XG4gIGRhZz86IHtcbiAgICBub2Rlcz86IEFycmF5PHtcbiAgICAgIGlkOiBzdHJpbmc7XG4gICAgICBraW5kOiBzdHJpbmc7XG4gICAgICBsYWJlbDogc3RyaW5nO1xuICAgICAgc3RhdHVzOiBzdHJpbmc7XG4gICAgICByZW1haW5pbmdfczogbnVtYmVyO1xuICAgICAgZHVyYXRpb25fczogbnVtYmVyO1xuICAgICAgcmVwZWF0YWJsZTogYm9vbGVhbjtcbiAgICB9PjtcbiAgfTtcbiAgc3Rvcnk/OiB7XG4gICAgYWN0aXZlX25vZGU/OiBzdHJpbmc7XG4gICAgYXZhaWxhYmxlPzogc3RyaW5nW107XG4gICAgZmxhZ3M/OiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPjtcbiAgICByZWNlbnRfZXZlbnRzPzogQXJyYXk8e1xuICAgICAgY2hhcHRlcjogc3RyaW5nO1xuICAgICAgbm9kZTogc3RyaW5nO1xuICAgICAgdGltZXN0YW1wOiBudW1iZXI7XG4gICAgfT47XG4gIH07XG59XG5cbmludGVyZmFjZSBDb25uZWN0T3B0aW9ucyB7XG4gIHJvb206IHN0cmluZztcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBvblN0YXRlVXBkYXRlZD86ICgpID0+IHZvaWQ7XG4gIG9uT3Blbj86IChzb2NrZXQ6IFdlYlNvY2tldCkgPT4gdm9pZDtcbiAgbWFwVz86IG51bWJlcjtcbiAgbWFwSD86IG51bWJlcjtcbiAgbW9kZT86IHN0cmluZztcbiAgbWlzc2lvbklkPzogc3RyaW5nO1xufVxuXG5sZXQgd3M6IFdlYlNvY2tldCB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gc2VuZE1lc3NhZ2UocGF5bG9hZDogdW5rbm93bik6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG4gIGNvbnN0IGRhdGEgPSB0eXBlb2YgcGF5bG9hZCA9PT0gXCJzdHJpbmdcIiA/IHBheWxvYWQgOiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKTtcbiAgd3Muc2VuZChkYXRhKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbm5lY3RXZWJTb2NrZXQoe1xuICByb29tLFxuICBzdGF0ZSxcbiAgYnVzLFxuICBvblN0YXRlVXBkYXRlZCxcbiAgb25PcGVuLFxuICBtYXBXLFxuICBtYXBILFxuICBtb2RlLFxuICBtaXNzaW9uSWQsXG59OiBDb25uZWN0T3B0aW9ucyk6IHZvaWQge1xuICBjb25zdCBwcm90b2NvbCA9IHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gXCJodHRwczpcIiA/IFwid3NzOi8vXCIgOiBcIndzOi8vXCI7XG4gIGxldCB3c1VybCA9IGAke3Byb3RvY29sfSR7d2luZG93LmxvY2F0aW9uLmhvc3R9L3dzP3Jvb209JHtlbmNvZGVVUklDb21wb25lbnQocm9vbSl9YDtcbiAgaWYgKG1hcFcgJiYgbWFwVyA+IDApIHtcbiAgICB3c1VybCArPSBgJm1hcFc9JHttYXBXfWA7XG4gIH1cbiAgaWYgKG1hcEggJiYgbWFwSCA+IDApIHtcbiAgICB3c1VybCArPSBgJm1hcEg9JHttYXBIfWA7XG4gIH1cbiAgaWYgKG1vZGUpIHtcbiAgICB3c1VybCArPSBgJm1vZGU9JHtlbmNvZGVVUklDb21wb25lbnQobW9kZSl9YDtcbiAgfVxuICBpZiAobWlzc2lvbklkKSB7XG4gICAgd3NVcmwgKz0gYCZtaXNzaW9uPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1pc3Npb25JZCl9YDtcbiAgfVxuICB3cyA9IG5ldyBXZWJTb2NrZXQod3NVcmwpO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwib3BlblwiLCAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coXCJbd3NdIG9wZW5cIik7XG4gICAgY29uc3Qgc29ja2V0ID0gd3M7XG4gICAgaWYgKHNvY2tldCAmJiBvbk9wZW4pIHtcbiAgICAgIG9uT3Blbihzb2NrZXQpO1xuICAgIH1cbiAgfSk7XG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbG9zZVwiLCAoKSA9PiBjb25zb2xlLmxvZyhcIlt3c10gY2xvc2VcIikpO1xuXG4gIGxldCBwcmV2Um91dGVzID0gbmV3IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4oKTtcbiAgbGV0IHByZXZBY3RpdmVSb3V0ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBwcmV2TWlzc2lsZUNvdW50ID0gMDtcblxuICB3cy5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCBkYXRhID0gc2FmZVBhcnNlKGV2ZW50LmRhdGEpO1xuICAgIGlmICghZGF0YSB8fCBkYXRhLnR5cGUgIT09IFwic3RhdGVcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBoYW5kbGVTdGF0ZU1lc3NhZ2Uoc3RhdGUsIGRhdGEsIGJ1cywgcHJldlJvdXRlcywgcHJldkFjdGl2ZVJvdXRlLCBwcmV2TWlzc2lsZUNvdW50KTtcbiAgICBwcmV2Um91dGVzID0gbmV3IE1hcChzdGF0ZS5taXNzaWxlUm91dGVzLm1hcCgocm91dGUpID0+IFtyb3V0ZS5pZCwgY2xvbmVSb3V0ZShyb3V0ZSldKSk7XG4gICAgcHJldkFjdGl2ZVJvdXRlID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgcHJldk1pc3NpbGVDb3VudCA9IHN0YXRlLm1pc3NpbGVzLmxlbmd0aDtcbiAgICBidXMuZW1pdChcInN0YXRlOnVwZGF0ZWRcIik7XG4gICAgb25TdGF0ZVVwZGF0ZWQ/LigpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU3RhdGVNZXNzYWdlKFxuICBzdGF0ZTogQXBwU3RhdGUsXG4gIG1zZzogU2VydmVyU3RhdGVNZXNzYWdlLFxuICBidXM6IEV2ZW50QnVzLFxuICBwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LFxuICBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwsXG4gIHByZXZNaXNzaWxlQ291bnQ6IG51bWJlcixcbik6IHZvaWQge1xuICBzdGF0ZS5ub3cgPSBtc2cubm93O1xuICBzdGF0ZS5ub3dTeW5jZWRBdCA9IG1vbm90b25pY05vdygpO1xuICBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgPSBOdW1iZXIuaXNGaW5pdGUobXNnLm5leHRfbWlzc2lsZV9yZWFkeSkgPyBtc2cubmV4dF9taXNzaWxlX3JlYWR5ISA6IDA7XG4gIHN0YXRlLm1lID0gbXNnLm1lID8ge1xuICAgIHg6IG1zZy5tZS54LFxuICAgIHk6IG1zZy5tZS55LFxuICAgIHZ4OiBtc2cubWUudngsXG4gICAgdnk6IG1zZy5tZS52eSxcbiAgICBocDogbXNnLm1lLmhwLFxuICAgIGtpbGxzOiBtc2cubWUua2lsbHMgPz8gMCxcbiAgICB3YXlwb2ludHM6IEFycmF5LmlzQXJyYXkobXNnLm1lLndheXBvaW50cylcbiAgICAgID8gbXNnLm1lLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogTnVtYmVyLmlzRmluaXRlKHdwLnNwZWVkKSA/IHdwLnNwZWVkISA6IDE4MCB9KSlcbiAgICAgIDogW10sXG4gICAgY3VycmVudFdheXBvaW50SW5kZXg6IG1zZy5tZS5jdXJyZW50X3dheXBvaW50X2luZGV4ID8/IDAsXG4gICAgaGVhdDogbXNnLm1lLmhlYXQgPyBjb252ZXJ0SGVhdFZpZXcobXNnLm1lLmhlYXQsIHN0YXRlLm5vd1N5bmNlZEF0LCBzdGF0ZS5ub3cpIDogdW5kZWZpbmVkLFxuICB9IDogbnVsbDtcbiAgc3RhdGUuZ2hvc3RzID0gQXJyYXkuaXNBcnJheShtc2cuZ2hvc3RzKSA/IG1zZy5naG9zdHMuc2xpY2UoKSA6IFtdO1xuICBzdGF0ZS5taXNzaWxlcyA9IEFycmF5LmlzQXJyYXkobXNnLm1pc3NpbGVzKSA/IG1zZy5taXNzaWxlcy5zbGljZSgpIDogW107XG5cbiAgY29uc3Qgcm91dGVzRnJvbVNlcnZlciA9IEFycmF5LmlzQXJyYXkobXNnLm1pc3NpbGVfcm91dGVzKSA/IG1zZy5taXNzaWxlX3JvdXRlcyA6IFtdO1xuICBjb25zdCBuZXdSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdID0gcm91dGVzRnJvbVNlcnZlci5tYXAoKHJvdXRlKSA9PiAoe1xuICAgIGlkOiByb3V0ZS5pZCxcbiAgICBuYW1lOiByb3V0ZS5uYW1lIHx8IHJvdXRlLmlkIHx8IFwiUm91dGVcIixcbiAgICB3YXlwb2ludHM6IEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKVxuICAgICAgPyByb3V0ZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHtcbiAgICAgICAgICB4OiB3cC54LFxuICAgICAgICAgIHk6IHdwLnksXG4gICAgICAgICAgc3BlZWQ6IE51bWJlci5pc0Zpbml0ZSh3cC5zcGVlZCkgPyB3cC5zcGVlZCEgOiBzdGF0ZS5taXNzaWxlQ29uZmlnLnNwZWVkLFxuICAgICAgICB9KSlcbiAgICAgIDogW10sXG4gIH0pKTtcblxuICBkaWZmUm91dGVzKHByZXZSb3V0ZXMsIG5ld1JvdXRlcywgYnVzKTtcbiAgc3RhdGUubWlzc2lsZVJvdXRlcyA9IG5ld1JvdXRlcztcblxuICBjb25zdCBuZXh0QWN0aXZlID0gdHlwZW9mIG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZSA9PT0gXCJzdHJpbmdcIiAmJiBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGUubGVuZ3RoID4gMFxuICAgID8gbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlXG4gICAgOiBuZXdSb3V0ZXMubGVuZ3RoID4gMFxuICAgICAgPyBuZXdSb3V0ZXNbMF0uaWRcbiAgICAgIDogbnVsbDtcbiAgc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSBuZXh0QWN0aXZlO1xuICBpZiAobmV4dEFjdGl2ZSAhPT0gcHJldkFjdGl2ZVJvdXRlKSB7XG4gICAgYnVzLmVtaXQoXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLCB7IHJvdXRlSWQ6IG5leHRBY3RpdmUgPz8gbnVsbCB9KTtcbiAgfVxuXG4gIGlmIChtc2cubWlzc2lsZV9jb25maWcpIHtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9taW4pIHx8IE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWF4KSB8fCBOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLmFncm9fbWluKSkge1xuICAgICAgdXBkYXRlTWlzc2lsZUxpbWl0cyhzdGF0ZSwge1xuICAgICAgICBzcGVlZE1pbjogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21pbixcbiAgICAgICAgc3BlZWRNYXg6IG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9tYXgsXG4gICAgICAgIGFncm9NaW46IG1zZy5taXNzaWxlX2NvbmZpZy5hZ3JvX21pbixcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBwcmV2SGVhdCA9IHN0YXRlLm1pc3NpbGVDb25maWcuaGVhdFBhcmFtcztcbiAgICBsZXQgaGVhdFBhcmFtczogeyBtYXg6IG51bWJlcjsgd2FybkF0OiBudW1iZXI7IG92ZXJoZWF0QXQ6IG51bWJlcjsgbWFya2VyU3BlZWQ6IG51bWJlcjsga1VwOiBudW1iZXI7IGtEb3duOiBudW1iZXI7IGV4cDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGVhdENvbmZpZyA9IG1zZy5taXNzaWxlX2NvbmZpZy5oZWF0X2NvbmZpZztcbiAgICBpZiAoaGVhdENvbmZpZykge1xuICAgICAgaGVhdFBhcmFtcyA9IHtcbiAgICAgICAgbWF4OiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5tYXgpID8gaGVhdENvbmZpZy5tYXghIDogcHJldkhlYXQ/Lm1heCA/PyAwLFxuICAgICAgICB3YXJuQXQ6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLndhcm5fYXQpID8gaGVhdENvbmZpZy53YXJuX2F0ISA6IHByZXZIZWF0Py53YXJuQXQgPz8gMCxcbiAgICAgICAgb3ZlcmhlYXRBdDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcub3ZlcmhlYXRfYXQpID8gaGVhdENvbmZpZy5vdmVyaGVhdF9hdCEgOiBwcmV2SGVhdD8ub3ZlcmhlYXRBdCA/PyAwLFxuICAgICAgICBtYXJrZXJTcGVlZDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcubWFya2VyX3NwZWVkKSA/IGhlYXRDb25maWcubWFya2VyX3NwZWVkISA6IHByZXZIZWF0Py5tYXJrZXJTcGVlZCA/PyAwLFxuICAgICAgICBrVXA6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLmtfdXApID8gaGVhdENvbmZpZy5rX3VwISA6IHByZXZIZWF0Py5rVXAgPz8gMCxcbiAgICAgICAga0Rvd246IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLmtfZG93bikgPyBoZWF0Q29uZmlnLmtfZG93biEgOiBwcmV2SGVhdD8ua0Rvd24gPz8gMCxcbiAgICAgICAgZXhwOiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5leHApID8gaGVhdENvbmZpZy5leHAhIDogcHJldkhlYXQ/LmV4cCA/PyAxLFxuICAgICAgfTtcbiAgICB9XG4gICAgY29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKHtcbiAgICAgIHNwZWVkOiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWQsXG4gICAgICBhZ3JvUmFkaXVzOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19yYWRpdXMsXG4gICAgICBoZWF0UGFyYW1zLFxuICAgIH0sIHN0YXRlLm1pc3NpbGVDb25maWcsIHN0YXRlLm1pc3NpbGVMaW1pdHMpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLmxpZmV0aW1lKSkge1xuICAgICAgc2FuaXRpemVkLmxpZmV0aW1lID0gbXNnLm1pc3NpbGVfY29uZmlnLmxpZmV0aW1lITtcbiAgICB9XG4gICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IHNhbml0aXplZDtcbiAgfVxuXG4gIGNvbnN0IG1ldGEgPSBtc2cubWV0YSA/PyB7fTtcbiAgY29uc3QgaGFzQyA9IHR5cGVvZiBtZXRhLmMgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuYyk7XG4gIGNvbnN0IGhhc1cgPSB0eXBlb2YgbWV0YS53ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLncpO1xuICBjb25zdCBoYXNIID0gdHlwZW9mIG1ldGEuaCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5oKTtcbiAgc3RhdGUud29ybGRNZXRhID0ge1xuICAgIGM6IGhhc0MgPyBtZXRhLmMhIDogc3RhdGUud29ybGRNZXRhLmMsXG4gICAgdzogaGFzVyA/IG1ldGEudyEgOiBzdGF0ZS53b3JsZE1ldGEudyxcbiAgICBoOiBoYXNIID8gbWV0YS5oISA6IHN0YXRlLndvcmxkTWV0YS5oLFxuICB9O1xuXG4gIGlmIChtc2cuaW52ZW50b3J5ICYmIEFycmF5LmlzQXJyYXkobXNnLmludmVudG9yeS5pdGVtcykpIHtcbiAgICBzdGF0ZS5pbnZlbnRvcnkgPSB7XG4gICAgICBpdGVtczogbXNnLmludmVudG9yeS5pdGVtcy5tYXAoKGl0ZW0pID0+ICh7XG4gICAgICAgIHR5cGU6IGl0ZW0udHlwZSxcbiAgICAgICAgdmFyaWFudF9pZDogaXRlbS52YXJpYW50X2lkLFxuICAgICAgICBoZWF0X2NhcGFjaXR5OiBpdGVtLmhlYXRfY2FwYWNpdHksXG4gICAgICAgIHF1YW50aXR5OiBpdGVtLnF1YW50aXR5LFxuICAgICAgfSkpLFxuICAgIH07XG4gIH1cblxuICBpZiAobXNnLmRhZyAmJiBBcnJheS5pc0FycmF5KG1zZy5kYWcubm9kZXMpKSB7XG4gICAgc3RhdGUuZGFnID0ge1xuICAgICAgbm9kZXM6IG1zZy5kYWcubm9kZXMubWFwKChub2RlKSA9PiAoe1xuICAgICAgICBpZDogbm9kZS5pZCxcbiAgICAgICAga2luZDogbm9kZS5raW5kLFxuICAgICAgICBsYWJlbDogbm9kZS5sYWJlbCxcbiAgICAgICAgc3RhdHVzOiBub2RlLnN0YXR1cyxcbiAgICAgICAgcmVtYWluaW5nX3M6IG5vZGUucmVtYWluaW5nX3MsXG4gICAgICAgIGR1cmF0aW9uX3M6IG5vZGUuZHVyYXRpb25fcyxcbiAgICAgICAgcmVwZWF0YWJsZTogbm9kZS5yZXBlYXRhYmxlLFxuICAgICAgfSkpLFxuICAgIH07XG4gIH1cblxuICBpZiAobXNnLnN0b3J5KSB7XG4gICAgXG4gICAgY29uc3QgcHJldkFjdGl2ZU5vZGUgPSBzdGF0ZS5zdG9yeT8uYWN0aXZlTm9kZSA/PyBudWxsO1xuICAgIHN0YXRlLnN0b3J5ID0ge1xuICAgICAgYWN0aXZlTm9kZTogbXNnLnN0b3J5LmFjdGl2ZV9ub2RlID8/IG51bGwsXG4gICAgICBhdmFpbGFibGU6IEFycmF5LmlzQXJyYXkobXNnLnN0b3J5LmF2YWlsYWJsZSkgPyBtc2cuc3RvcnkuYXZhaWxhYmxlIDogW10sXG4gICAgICBmbGFnczogbXNnLnN0b3J5LmZsYWdzID8/IHt9LFxuICAgICAgcmVjZW50RXZlbnRzOiBBcnJheS5pc0FycmF5KG1zZy5zdG9yeS5yZWNlbnRfZXZlbnRzKSA/IG1zZy5zdG9yeS5yZWNlbnRfZXZlbnRzLm1hcCgoZXZ0KSA9PiAoe1xuICAgICAgICBjaGFwdGVyOiBldnQuY2hhcHRlcixcbiAgICAgICAgbm9kZTogZXZ0Lm5vZGUsXG4gICAgICAgIHRpbWVzdGFtcDogZXZ0LnRpbWVzdGFtcCxcbiAgICAgIH0pKSA6IFtdLFxuICAgIH07XG4gICAgaWYgKHN0YXRlLnN0b3J5LmFjdGl2ZU5vZGUgPT09IG51bGwpIHtcbiAgICAgIHN0YXRlLnN0b3J5LmFjdGl2ZU5vZGUgPSBcInN0b3J5LnNpZ25hbC1zdGF0aWMtMS5zdGFydFwiO1xuICAgIH1cbiAgICAvLyBFbWl0IGV2ZW50IHdoZW4gYWN0aXZlIHN0b3J5IG5vZGUgY2hhbmdlc1xuICAgIGlmIChzdGF0ZS5zdG9yeS5hY3RpdmVOb2RlICE9PSBwcmV2QWN0aXZlTm9kZSAmJiBzdGF0ZS5zdG9yeS5hY3RpdmVOb2RlKSB7XG4gICAgICBidXMuZW1pdChcInN0b3J5Om5vZGVBY3RpdmF0ZWRcIiwgeyBub2RlSWQ6IHN0YXRlLnN0b3J5LmFjdGl2ZU5vZGUgfSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA+IHByZXZNaXNzaWxlQ291bnQpIHtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZUlkID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgaWYgKGFjdGl2ZVJvdXRlSWQpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IGFjdGl2ZVJvdXRlSWQgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IFwiXCIgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY29vbGRvd25SZW1haW5pbmcgPSBNYXRoLm1heCgwLCBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpKTtcbiAgYnVzLmVtaXQoXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiLCB7IHNlY29uZHNSZW1haW5pbmc6IGNvb2xkb3duUmVtYWluaW5nIH0pO1xufVxuXG5mdW5jdGlvbiBkaWZmUm91dGVzKHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sIG5leHRSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdLCBidXM6IEV2ZW50QnVzKTogdm9pZCB7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByb3V0ZSBvZiBuZXh0Um91dGVzKSB7XG4gICAgc2Vlbi5hZGQocm91dGUuaWQpO1xuICAgIGNvbnN0IHByZXYgPSBwcmV2Um91dGVzLmdldChyb3V0ZS5pZCk7XG4gICAgaWYgKCFwcmV2KSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChyb3V0ZS5uYW1lICE9PSBwcmV2Lm5hbWUpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgbmFtZTogcm91dGUubmFtZSB9KTtcbiAgICB9XG4gICAgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPiBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgICB9IGVsc2UgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPCBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHByZXYud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfVxuICAgIGlmIChwcmV2LndheXBvaW50cy5sZW5ndGggPiAwICYmIHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgW3JvdXRlSWRdIG9mIHByZXZSb3V0ZXMpIHtcbiAgICBpZiAoIXNlZW4uaGFzKHJvdXRlSWQpKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVEZWxldGVkXCIsIHsgcm91dGVJZCB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xvbmVSb3V0ZShyb3V0ZTogTWlzc2lsZVJvdXRlKTogTWlzc2lsZVJvdXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSxcbiAgICB3YXlwb2ludHM6IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHNhZmVQYXJzZSh2YWx1ZTogdW5rbm93bik6IFNlcnZlclN0YXRlTWVzc2FnZSB8IG51bGwge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSkgYXMgU2VydmVyU3RhdGVNZXNzYWdlO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLndhcm4oXCJbd3NdIGZhaWxlZCB0byBwYXJzZSBtZXNzYWdlXCIsIGVycik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShzdGF0ZS5ub3cpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgY29uc3Qgc3luY2VkQXQgPSBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93U3luY2VkQXQpID8gc3RhdGUubm93U3luY2VkQXQgOiBudWxsO1xuICBpZiAoIXN5bmNlZEF0KSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICBjb25zdCBlbGFwc2VkTXMgPSBtb25vdG9uaWNOb3coKSAtIHN5bmNlZEF0O1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShlbGFwc2VkTXMpIHx8IGVsYXBzZWRNcyA8IDApIHtcbiAgICByZXR1cm4gc3RhdGUubm93O1xuICB9XG4gIHJldHVybiBzdGF0ZS5ub3cgKyBlbGFwc2VkTXMgLyAxMDAwO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0SGVhdFZpZXcoc2VydmVySGVhdDogU2VydmVySGVhdFZpZXcsIG5vd1N5bmNlZEF0TXM6IG51bWJlciwgc2VydmVyTm93U2VjOiBudW1iZXIpOiBpbXBvcnQoXCIuL3N0YXRlXCIpLkhlYXRWaWV3IHtcbiAgLy8gQ29udmVydCBzZXJ2ZXIgdGltZSAoc3RhbGxVbnRpbCBpbiBzZWNvbmRzKSB0byBjbGllbnQgdGltZSAobWlsbGlzZWNvbmRzKVxuICAvLyBzdGFsbFVudGlsIGlzIGFic29sdXRlIHNlcnZlciB0aW1lLCBzbyB3ZSBuZWVkIHRvIGNvbnZlcnQgaXQgdG8gY2xpZW50IHRpbWVcbiAgY29uc3Qgc2VydmVyU3RhbGxVbnRpbFNlYyA9IHNlcnZlckhlYXQuc3U7XG4gIGNvbnN0IG9mZnNldEZyb21Ob3dTZWMgPSBzZXJ2ZXJTdGFsbFVudGlsU2VjIC0gc2VydmVyTm93U2VjO1xuICBjb25zdCBzdGFsbFVudGlsTXMgPSBub3dTeW5jZWRBdE1zICsgKG9mZnNldEZyb21Ob3dTZWMgKiAxMDAwKTtcblxuICBjb25zdCBoZWF0VmlldyA9IHtcbiAgICB2YWx1ZTogc2VydmVySGVhdC52LFxuICAgIG1heDogc2VydmVySGVhdC5tLFxuICAgIHdhcm5BdDogc2VydmVySGVhdC53LFxuICAgIG92ZXJoZWF0QXQ6IHNlcnZlckhlYXQubyxcbiAgICBtYXJrZXJTcGVlZDogc2VydmVySGVhdC5tcyxcbiAgICBzdGFsbFVudGlsTXM6IHN0YWxsVW50aWxNcyxcbiAgICBrVXA6IHNlcnZlckhlYXQua3UsXG4gICAga0Rvd246IHNlcnZlckhlYXQua2QsXG4gICAgZXhwOiBzZXJ2ZXJIZWF0LmV4LFxuICB9O1xuICByZXR1cm4gaGVhdFZpZXc7XG59XG4iLCAiZXhwb3J0IGNvbnN0IE1JTl9aT09NID0gMS4wO1xuZXhwb3J0IGNvbnN0IE1BWF9aT09NID0gMy4wO1xuXG5leHBvcnQgY29uc3QgSEVMUF9URVhUID0gW1xuICBcIlByaW1hcnkgTW9kZXNcIixcbiAgXCIgIDEgXHUyMDEzIFRvZ2dsZSBzaGlwIG5hdmlnYXRpb24gbW9kZVwiLFxuICBcIiAgMiBcdTIwMTMgVG9nZ2xlIG1pc3NpbGUgY29vcmRpbmF0aW9uIG1vZGVcIixcbiAgXCJcIixcbiAgXCJTaGlwIE5hdmlnYXRpb25cIixcbiAgXCIgIFQgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgIEMgXHUyMDEzIENsZWFyIGFsbCB3YXlwb2ludHNcIixcbiAgXCIgIEggXHUyMDEzIEhvbGQgKGNsZWFyIHdheXBvaW50cyAmIHN0b3ApXCIsXG4gIFwiICBSIFx1MjAxMyBUb2dnbGUgc2hvdyByb3V0ZVwiLFxuICBcIiAgWyAvIF0gXHUyMDEzIEFkanVzdCB3YXlwb2ludCBzcGVlZFwiLFxuICBcIiAgU2hpZnQrWyAvIF0gXHUyMDEzIENvYXJzZSBzcGVlZCBhZGp1c3RcIixcbiAgXCIgIFRhYiAvIFNoaWZ0K1RhYiBcdTIwMTMgQ3ljbGUgd2F5cG9pbnRzXCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBmcm9tIHNlbGVjdGVkIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiTWlzc2lsZSBDb29yZGluYXRpb25cIixcbiAgXCIgIE4gXHUyMDEzIEFkZCBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICBcIiAgTCBcdTIwMTMgTGF1bmNoIG1pc3NpbGVzXCIsXG4gIFwiICBFIFx1MjAxMyBTd2l0Y2ggYmV0d2VlbiBzZXQvc2VsZWN0XCIsXG4gIFwiICAsIC8gLiBcdTIwMTMgQWRqdXN0IGFncm8gcmFkaXVzXCIsXG4gIFwiICA7IC8gJyBcdTIwMTMgQWRqdXN0IG1pc3NpbGUgc3BlZWRcIixcbiAgXCIgIFNoaWZ0K3NsaWRlciBrZXlzIFx1MjAxMyBDb2Fyc2UgYWRqdXN0XCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBzZWxlY3RlZCBtaXNzaWxlIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiTWFwIENvbnRyb2xzXCIsXG4gIFwiICArLy0gXHUyMDEzIFpvb20gaW4vb3V0XCIsXG4gIFwiICBDdHJsKzAgXHUyMDEzIFJlc2V0IHpvb21cIixcbiAgXCIgIE1vdXNlIHdoZWVsIFx1MjAxMyBab29tIGF0IGN1cnNvclwiLFxuICBcIiAgUGluY2ggXHUyMDEzIFpvb20gb24gdG91Y2ggZGV2aWNlc1wiLFxuICBcIlwiLFxuICBcIkdlbmVyYWxcIixcbiAgXCIgID8gXHUyMDEzIFRvZ2dsZSB0aGlzIG92ZXJsYXlcIixcbiAgXCIgIEVzYyBcdTIwMTMgQ2FuY2VsIHNlbGVjdGlvbiBvciBjbG9zZSBvdmVybGF5XCIsXG5dLmpvaW4oXCJcXG5cIik7XG4iLCAiaW1wb3J0IHR5cGUgeyBBcHBTdGF0ZSwgVUlTdGF0ZSB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi4vc3RhdGVcIjtcbmltcG9ydCB7IE1BWF9aT09NLCBNSU5fWk9PTSB9IGZyb20gXCIuL2NvbnN0YW50c1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENhbWVyYURlcGVuZGVuY2llcyB7XG4gIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIHVpU3RhdGU6IFVJU3RhdGU7XG59XG5cbmludGVyZmFjZSBXb3JsZFNpemUge1xuICB3OiBudW1iZXI7XG4gIGg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYW1lcmEge1xuICBzZXRab29tKG5ld1pvb206IG51bWJlciwgY2VudGVyWD86IG51bWJlciwgY2VudGVyWT86IG51bWJlcik6IHZvaWQ7XG4gIGdldENhbWVyYVBvc2l0aW9uKCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgd29ybGRUb0NhbnZhcyhwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG4gIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuICB1cGRhdGVXb3JsZEZyb21NZXRhKG1ldGE6IFBhcnRpYWw8V29ybGRTaXplIHwgdW5kZWZpbmVkPik6IHZvaWQ7XG4gIGdldFdvcmxkU2l6ZSgpOiBXb3JsZFNpemU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDYW1lcmEoeyBjYW52YXMsIHN0YXRlLCB1aVN0YXRlIH06IENhbWVyYURlcGVuZGVuY2llcyk6IENhbWVyYSB7XG4gIGNvbnN0IHdvcmxkOiBXb3JsZFNpemUgPSB7IHc6IDgwMDAsIGg6IDQ1MDAgfTtcblxuICBmdW5jdGlvbiByZXNvbHZlQ2FudmFzKCk6IEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbCB7XG4gICAgcmV0dXJuIGNhbnZhcyA/PyBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0Wm9vbShuZXdab29tOiBudW1iZXIsIGNlbnRlclg/OiBudW1iZXIsIGNlbnRlclk/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAvLyBjZW50ZXIgcGFyYW1ldGVycyByZXNlcnZlZCBmb3IgcG90ZW50aWFsIHNtb290aCB6b29taW5nIGxvZ2ljXG4gICAgdm9pZCBjZW50ZXJYO1xuICAgIHZvaWQgY2VudGVyWTtcbiAgICB1aVN0YXRlLnpvb20gPSBjbGFtcChuZXdab29tLCBNSU5fWk9PTSwgTUFYX1pPT00pO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0Q2FtZXJhUG9zaXRpb24oKTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgICBjb25zdCBjdiA9IHJlc29sdmVDYW52YXMoKTtcbiAgICBpZiAoIWN2KSByZXR1cm4geyB4OiB3b3JsZC53IC8gMiwgeTogd29ybGQuaCAvIDIgfTtcblxuICAgIGNvbnN0IHpvb20gPSB1aVN0YXRlLnpvb207XG5cbiAgICBsZXQgY2FtZXJhWCA9IHN0YXRlLm1lID8gc3RhdGUubWUueCA6IHdvcmxkLncgLyAyO1xuICAgIGxldCBjYW1lcmFZID0gc3RhdGUubWUgPyBzdGF0ZS5tZS55IDogd29ybGQuaCAvIDI7XG5cbiAgICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gICAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgICBjb25zdCBzY2FsZSA9IE1hdGgubWluKHNjYWxlWCwgc2NhbGVZKSAqIHpvb207XG5cbiAgICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgICBjb25zdCB2aWV3cG9ydEhlaWdodCA9IGN2LmhlaWdodCAvIHNjYWxlO1xuXG4gICAgY29uc3QgbWluQ2FtZXJhWCA9IHZpZXdwb3J0V2lkdGggLyAyO1xuICAgIGNvbnN0IG1heENhbWVyYVggPSB3b3JsZC53IC0gdmlld3BvcnRXaWR0aCAvIDI7XG4gICAgY29uc3QgbWluQ2FtZXJhWSA9IHZpZXdwb3J0SGVpZ2h0IC8gMjtcbiAgICBjb25zdCBtYXhDYW1lcmFZID0gd29ybGQuaCAtIHZpZXdwb3J0SGVpZ2h0IC8gMjtcblxuICAgIGlmICh2aWV3cG9ydFdpZHRoIDwgd29ybGQudykge1xuICAgICAgY2FtZXJhWCA9IGNsYW1wKGNhbWVyYVgsIG1pbkNhbWVyYVgsIG1heENhbWVyYVgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYW1lcmFYID0gd29ybGQudyAvIDI7XG4gICAgfVxuXG4gICAgaWYgKHZpZXdwb3J0SGVpZ2h0IDwgd29ybGQuaCkge1xuICAgICAgY2FtZXJhWSA9IGNsYW1wKGNhbWVyYVksIG1pbkNhbWVyYVksIG1heENhbWVyYVkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYW1lcmFZID0gd29ybGQuaCAvIDI7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgeDogY2FtZXJhWCwgeTogY2FtZXJhWSB9O1xuICB9XG5cbiAgZnVuY3Rpb24gd29ybGRUb0NhbnZhcyhwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICAgIGNvbnN0IGN2ID0gcmVzb2x2ZUNhbnZhcygpO1xuICAgIGlmICghY3YpIHJldHVybiB7IHg6IHAueCwgeTogcC55IH07XG5cbiAgICBjb25zdCB6b29tID0gdWlTdGF0ZS56b29tO1xuICAgIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgICBjb25zdCB3b3JsZFggPSBwLnggLSBjYW1lcmEueDtcbiAgICBjb25zdCB3b3JsZFkgPSBwLnkgLSBjYW1lcmEueTtcblxuICAgIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgICBjb25zdCBzY2FsZVkgPSBjdi5oZWlnaHQgLyB3b3JsZC5oO1xuICAgIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAgIHJldHVybiB7XG4gICAgICB4OiB3b3JsZFggKiBzY2FsZSArIGN2LndpZHRoIC8gMixcbiAgICAgIHk6IHdvcmxkWSAqIHNjYWxlICsgY3YuaGVpZ2h0IC8gMixcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gY2FudmFzVG9Xb3JsZChwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICAgIGNvbnN0IGN2ID0gcmVzb2x2ZUNhbnZhcygpO1xuICAgIGlmICghY3YpIHJldHVybiB7IHg6IHAueCwgeTogcC55IH07XG5cbiAgICBjb25zdCB6b29tID0gdWlTdGF0ZS56b29tO1xuICAgIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgICBjb25zdCBjYW52YXNYID0gcC54IC0gY3Yud2lkdGggLyAyO1xuICAgIGNvbnN0IGNhbnZhc1kgPSBwLnkgLSBjdi5oZWlnaHQgLyAyO1xuXG4gICAgY29uc3Qgc2NhbGVYID0gY3Yud2lkdGggLyB3b3JsZC53O1xuICAgIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gICAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IGNhbnZhc1ggLyBzY2FsZSArIGNhbWVyYS54LFxuICAgICAgeTogY2FudmFzWSAvIHNjYWxlICsgY2FtZXJhLnksXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVdvcmxkRnJvbU1ldGEobWV0YTogUGFydGlhbDxXb3JsZFNpemUgfCB1bmRlZmluZWQ+KTogdm9pZCB7XG4gICAgaWYgKCFtZXRhKSByZXR1cm47XG4gICAgaWYgKHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudykpIHtcbiAgICAgIHdvcmxkLncgPSBtZXRhLnc7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpKSB7XG4gICAgICB3b3JsZC5oID0gbWV0YS5oO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFdvcmxkU2l6ZSgpOiBXb3JsZFNpemUge1xuICAgIHJldHVybiB7IC4uLndvcmxkIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNldFpvb20sXG4gICAgZ2V0Q2FtZXJhUG9zaXRpb24sXG4gICAgd29ybGRUb0NhbnZhcyxcbiAgICBjYW52YXNUb1dvcmxkLFxuICAgIHVwZGF0ZVdvcmxkRnJvbU1ldGEsXG4gICAgZ2V0V29ybGRTaXplLFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBVSVN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgdHlwZSB7IENhbWVyYSB9IGZyb20gXCIuL2NhbWVyYVwiO1xuaW1wb3J0IHR5cGUgeyBMb2dpYywgUG9pbnRlclBvaW50IH0gZnJvbSBcIi4vbG9naWNcIjtcbmltcG9ydCB0eXBlIHsgVUlDb250cm9sbGVyIH0gZnJvbSBcIi4vdWlcIjtcblxuaW50ZXJmYWNlIElucHV0RGVwZW5kZW5jaWVzIHtcbiAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgdWk6IFVJQ29udHJvbGxlcjtcbiAgbG9naWM6IExvZ2ljO1xuICBjYW1lcmE6IENhbWVyYTtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnB1dENvbnRyb2xsZXIge1xuICBiaW5kSW5wdXQoKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUlucHV0KHtcbiAgY2FudmFzLFxuICB1aSxcbiAgbG9naWMsXG4gIGNhbWVyYSxcbiAgc3RhdGUsXG4gIHVpU3RhdGUsXG4gIGJ1cyxcbiAgc2VuZE1lc3NhZ2UsXG59OiBJbnB1dERlcGVuZGVuY2llcyk6IElucHV0Q29udHJvbGxlciB7XG4gIGxldCBsYXN0VG91Y2hEaXN0YW5jZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCBwZW5kaW5nVG91Y2hUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuICBsZXQgaXNQaW5jaGluZyA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGdldFBvaW50ZXJDYW52YXNQb2ludChldmVudDogUG9pbnRlckV2ZW50KTogUG9pbnRlclBvaW50IHtcbiAgICBjb25zdCByZWN0ID0gY2FudmFzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IHNjYWxlWCA9IHJlY3Qud2lkdGggIT09IDAgPyBjYW52YXMud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgICBjb25zdCBzY2FsZVkgPSByZWN0LmhlaWdodCAhPT0gMCA/IGNhbnZhcy5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IChldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0KSAqIHNjYWxlWCxcbiAgICAgIHk6IChldmVudC5jbGllbnRZIC0gcmVjdC50b3ApICogc2NhbGVZLFxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVQb2ludGVyUGxhY2VtZW50KGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQsIHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQge1xuICAgIGNvbnN0IGNvbnRleHQgPSB1aVN0YXRlLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgPyBcIm1pc3NpbGVcIiA6IFwic2hpcFwiO1xuICAgIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgbG9naWMuaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgICAgdWkucmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9naWMuaGFuZGxlU2hpcFBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgICAgdWkudXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbkNhbnZhc1BvaW50ZXJEb3duKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBjb25zdCBjYW52YXNQb2ludCA9IGdldFBvaW50ZXJDYW52YXNQb2ludChldmVudCk7XG4gICAgY29uc3Qgd29ybGRQb2ludCA9IGNhbWVyYS5jYW52YXNUb1dvcmxkKGNhbnZhc1BvaW50KTtcbiAgICBjb25zdCBjb250ZXh0ID0gdWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcblxuICAgIGlmIChjb250ZXh0ID09PSBcInNoaXBcIiAmJiB1aVN0YXRlLnNoaXBUb29sID09PSBcInNlbGVjdFwiICYmIHN0YXRlLm1lPy53YXlwb2ludHMpIHtcbiAgICAgIGNvbnN0IHdwSW5kZXggPSBsb2dpYy5maW5kV2F5cG9pbnRBdFBvc2l0aW9uKGNhbnZhc1BvaW50KTtcbiAgICAgIGlmICh3cEluZGV4ICE9PSBudWxsKSB7XG4gICAgICAgIGxvZ2ljLmJlZ2luU2hpcERyYWcod3BJbmRleCwgY2FudmFzUG9pbnQpO1xuICAgICAgICBjYW52YXMuc2V0UG9pbnRlckNhcHR1cmUoZXZlbnQucG9pbnRlcklkKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIiAmJiB1aVN0YXRlLm1pc3NpbGVUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgICBjb25zdCBoaXQgPSBsb2dpYy5oaXRUZXN0TWlzc2lsZVJvdXRlcyhjYW52YXNQb2ludCk7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIGxvZ2ljLnNldE1pc3NpbGVTZWxlY3Rpb24oaGl0LnNlbGVjdGlvbiwgaGl0LnJvdXRlLmlkKTtcbiAgICAgICAgdWkucmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICAgICAgaWYgKGhpdC5zZWxlY3Rpb24udHlwZSA9PT0gXCJ3YXlwb2ludFwiKSB7XG4gICAgICAgICAgbG9naWMuYmVnaW5NaXNzaWxlRHJhZyhoaXQuc2VsZWN0aW9uLmluZGV4LCBjYW52YXNQb2ludCk7XG4gICAgICAgICAgY2FudmFzLnNldFBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgICAgIH1cbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgIHVpLnJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnBvaW50ZXJUeXBlID09PSBcInRvdWNoXCIpIHtcbiAgICAgIGlmIChwZW5kaW5nVG91Y2hUaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgIH1cbiAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaWYgKGlzUGluY2hpbmcpIHJldHVybjtcbiAgICAgICAgaGFuZGxlUG9pbnRlclBsYWNlbWVudChjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICAgICAgfSwgMTUwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFuZGxlUG9pbnRlclBsYWNlbWVudChjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgfVxuXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlck1vdmUoZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICAgIGNvbnN0IGRyYWdnaW5nU2hpcCA9IGxvZ2ljLmdldERyYWdnZWRXYXlwb2ludCgpICE9PSBudWxsO1xuICAgIGNvbnN0IGRyYWdnaW5nTWlzc2lsZSA9IGxvZ2ljLmdldERyYWdnZWRNaXNzaWxlV2F5cG9pbnQoKSAhPT0gbnVsbDtcbiAgICBpZiAoIWRyYWdnaW5nU2hpcCAmJiAhZHJhZ2dpbmdNaXNzaWxlKSByZXR1cm47XG5cbiAgICBjb25zdCBjYW52YXNQb2ludCA9IGdldFBvaW50ZXJDYW52YXNQb2ludChldmVudCk7XG4gICAgY29uc3Qgd29ybGRQb2ludCA9IGNhbWVyYS5jYW52YXNUb1dvcmxkKGNhbnZhc1BvaW50KTtcblxuICAgIGlmIChkcmFnZ2luZ1NoaXApIHtcbiAgICAgIGxvZ2ljLnVwZGF0ZVNoaXBEcmFnKHdvcmxkUG9pbnQpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoZHJhZ2dpbmdNaXNzaWxlKSB7XG4gICAgICBsb2dpYy51cGRhdGVNaXNzaWxlRHJhZyh3b3JsZFBvaW50KTtcbiAgICAgIHVpLnJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlclVwKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBsb2dpYy5lbmREcmFnKCk7XG4gICAgaWYgKGNhbnZhcy5oYXNQb2ludGVyQ2FwdHVyZShldmVudC5wb2ludGVySWQpKSB7XG4gICAgICBjYW52YXMucmVsZWFzZVBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgfVxuICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gb25DYW52YXNXaGVlbChldmVudDogV2hlZWxFdmVudCk6IHZvaWQge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgcmVjdCA9IGNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBjZW50ZXJYID0gZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdDtcbiAgICBjb25zdCBjZW50ZXJZID0gZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wO1xuICAgIGNvbnN0IHNjYWxlWCA9IHJlY3Qud2lkdGggIT09IDAgPyBjYW52YXMud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgICBjb25zdCBzY2FsZVkgPSByZWN0LmhlaWdodCAhPT0gMCA/IGNhbnZhcy5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gICAgY29uc3QgY2FudmFzQ2VudGVyWCA9IGNlbnRlclggKiBzY2FsZVg7XG4gICAgY29uc3QgY2FudmFzQ2VudGVyWSA9IGNlbnRlclkgKiBzY2FsZVk7XG4gICAgY29uc3QgZGVsdGEgPSBldmVudC5kZWx0YVk7XG4gICAgY29uc3Qgem9vbUZhY3RvciA9IGRlbHRhID4gMCA/IDAuOSA6IDEuMTtcbiAgICBjb25zdCBuZXdab29tID0gdWlTdGF0ZS56b29tICogem9vbUZhY3RvcjtcbiAgICBjYW1lcmEuc2V0Wm9vbShuZXdab29tLCBjYW52YXNDZW50ZXJYLCBjYW52YXNDZW50ZXJZKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFRvdWNoRGlzdGFuY2UodG91Y2hlczogVG91Y2hMaXN0KTogbnVtYmVyIHwgbnVsbCB7XG4gICAgaWYgKHRvdWNoZXMubGVuZ3RoIDwgMikgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgZHggPSB0b3VjaGVzWzBdLmNsaWVudFggLSB0b3VjaGVzWzFdLmNsaWVudFg7XG4gICAgY29uc3QgZHkgPSB0b3VjaGVzWzBdLmNsaWVudFkgLSB0b3VjaGVzWzFdLmNsaWVudFk7XG4gICAgcmV0dXJuIE1hdGguaHlwb3QoZHgsIGR5KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFRvdWNoQ2VudGVyKHRvdWNoZXM6IFRvdWNoTGlzdCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB8IG51bGwge1xuICAgIGlmICh0b3VjaGVzLmxlbmd0aCA8IDIpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICB4OiAodG91Y2hlc1swXS5jbGllbnRYICsgdG91Y2hlc1sxXS5jbGllbnRYKSAvIDIsXG4gICAgICB5OiAodG91Y2hlc1swXS5jbGllbnRZICsgdG91Y2hlc1sxXS5jbGllbnRZKSAvIDIsXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzVG91Y2hTdGFydChldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICAgIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCA9PT0gMikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGlzUGluY2hpbmcgPSB0cnVlO1xuICAgICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBnZXRUb3VjaERpc3RhbmNlKGV2ZW50LnRvdWNoZXMpO1xuICAgICAgaWYgKHBlbmRpbmdUb3VjaFRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHBlbmRpbmdUb3VjaFRpbWVvdXQpO1xuICAgICAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gbnVsbDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbkNhbnZhc1RvdWNoTW92ZShldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICAgIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCAhPT0gMikge1xuICAgICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBudWxsO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGN1cnJlbnREaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG4gICAgaWYgKGN1cnJlbnREaXN0YW5jZSA9PT0gbnVsbCB8fCBsYXN0VG91Y2hEaXN0YW5jZSA9PT0gbnVsbCkgcmV0dXJuO1xuICAgIGNvbnN0IHJlY3QgPSBjYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3QgY2VudGVyID0gZ2V0VG91Y2hDZW50ZXIoZXZlbnQudG91Y2hlcyk7XG4gICAgaWYgKCFjZW50ZXIpIHJldHVybjtcbiAgICBjb25zdCBzY2FsZVggPSByZWN0LndpZHRoICE9PSAwID8gY2FudmFzLndpZHRoIC8gcmVjdC53aWR0aCA6IDE7XG4gICAgY29uc3Qgc2NhbGVZID0gcmVjdC5oZWlnaHQgIT09IDAgPyBjYW52YXMuaGVpZ2h0IC8gcmVjdC5oZWlnaHQgOiAxO1xuICAgIGNvbnN0IGNhbnZhc0NlbnRlclggPSAoY2VudGVyLnggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICAgIGNvbnN0IGNhbnZhc0NlbnRlclkgPSAoY2VudGVyLnkgLSByZWN0LnRvcCkgKiBzY2FsZVk7XG4gICAgY29uc3Qgem9vbUZhY3RvciA9IGN1cnJlbnREaXN0YW5jZSAvIGxhc3RUb3VjaERpc3RhbmNlO1xuICAgIGNvbnN0IG5ld1pvb20gPSB1aVN0YXRlLnpvb20gKiB6b29tRmFjdG9yO1xuICAgIGNhbWVyYS5zZXRab29tKG5ld1pvb20sIGNhbnZhc0NlbnRlclgsIGNhbnZhc0NlbnRlclkpO1xuICAgIGxhc3RUb3VjaERpc3RhbmNlID0gY3VycmVudERpc3RhbmNlO1xuICB9XG5cbiAgZnVuY3Rpb24gb25DYW52YXNUb3VjaEVuZChldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICAgIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCA8IDIpIHtcbiAgICAgIGxhc3RUb3VjaERpc3RhbmNlID0gbnVsbDtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpc1BpbmNoaW5nID0gZmFsc2U7XG4gICAgICB9LCAxMDApO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUFkZE1pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJhZGRfbWlzc2lsZV9yb3V0ZVwiIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gb25XaW5kb3dLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgaXNFZGl0YWJsZSA9XG4gICAgICAhIXRhcmdldCAmJlxuICAgICAgKHRhcmdldC50YWdOYW1lID09PSBcIklOUFVUXCIgfHxcbiAgICAgICAgdGFyZ2V0LnRhZ05hbWUgPT09IFwiVEVYVEFSRUFcIiB8fFxuICAgICAgICB0YXJnZXQuaXNDb250ZW50RWRpdGFibGUpO1xuXG4gICAgaWYgKHVpU3RhdGUuaGVscFZpc2libGUgJiYgZXZlbnQua2V5ICE9PSBcIkVzY2FwZVwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChpc0VkaXRhYmxlKSB7XG4gICAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XG4gICAgICAgIHRhcmdldC5ibHVyKCk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc3dpdGNoIChldmVudC5jb2RlKSB7XG4gICAgICBjYXNlIFwiRGlnaXQxXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJEaWdpdDJcIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIktleVRcIjpcbiAgICAgICAgaWYgKHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNldFwiKSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcInNoaXAtc2VsZWN0XCIpO1xuICAgICAgICB9IGVsc2UgaWYgKHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVpLnNldEFjdGl2ZVRvb2woXCJzaGlwLXNldFwiKTtcbiAgICAgICAgfVxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiS2V5Q1wiOlxuICAgICAgY2FzZSBcIktleUhcIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgICAgbG9naWMuY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIkJyYWNrZXRMZWZ0XCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIHVpLmFkanVzdFNoaXBTcGVlZCgtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiQnJhY2tldFJpZ2h0XCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIHVpLmFkanVzdFNoaXBTcGVlZCgxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJUYWJcIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgICAgbG9naWMuY3ljbGVTaGlwU2VsZWN0aW9uKGV2ZW50LnNoaWZ0S2V5ID8gLTEgOiAxKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIktleU5cIjpcbiAgICAgICAgaGFuZGxlQWRkTWlzc2lsZVJvdXRlKCk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJLZXlMXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIGxvZ2ljLmxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiS2V5RVwiOlxuICAgICAgICBpZiAodWlTdGF0ZS5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2V0XCIpIHtcbiAgICAgICAgICB1aS5zZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZWxlY3RcIik7XG4gICAgICAgIH0gZWxzZSBpZiAodWlTdGF0ZS5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2VsZWN0XCIpIHtcbiAgICAgICAgICB1aS5zZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2V0XCIpO1xuICAgICAgICB9XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJDb21tYVwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgICB1aS5hZGp1c3RNaXNzaWxlQWdybygtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiUGVyaW9kXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIHVpLmFkanVzdE1pc3NpbGVBZ3JvKDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIlNlbWljb2xvblwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgICB1aS5hZGp1c3RNaXNzaWxlU3BlZWQoLTEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIlF1b3RlXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIHVpLmFkanVzdE1pc3NpbGVTcGVlZCgxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJEZWxldGVcIjpcbiAgICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgICAgaWYgKHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIiAmJiBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCkpIHtcbiAgICAgICAgICBsb2dpYy5kZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgICB9IGVsc2UgaWYgKGxvZ2ljLmdldFNlbGVjdGlvbigpKSB7XG4gICAgICAgICAgbG9naWMuZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgICAgfVxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiRXNjYXBlXCI6IHtcbiAgICAgICAgaWYgKHVpU3RhdGUuaGVscFZpc2libGUpIHtcbiAgICAgICAgICB1aS5zZXRIZWxwVmlzaWJsZShmYWxzZSk7XG4gICAgICAgIH0gZWxzZSBpZiAobG9naWMuZ2V0TWlzc2lsZVNlbGVjdGlvbigpKSB7XG4gICAgICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgICAgfSBlbHNlIGlmIChsb2dpYy5nZXRTZWxlY3Rpb24oKSkge1xuICAgICAgICAgIGxvZ2ljLnNldFNlbGVjdGlvbihudWxsKTtcbiAgICAgICAgfSBlbHNlIGlmICh1aVN0YXRlLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIpIHtcbiAgICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgICB9XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJFcXVhbFwiOlxuICAgICAgY2FzZSBcIk51bXBhZEFkZFwiOiB7XG4gICAgICAgIGNvbnN0IGNlbnRlclggPSBjYW52YXMud2lkdGggLyAyO1xuICAgICAgICBjb25zdCBjZW50ZXJZID0gY2FudmFzLmhlaWdodCAvIDI7XG4gICAgICAgIGNhbWVyYS5zZXRab29tKHVpU3RhdGUuem9vbSAqIDEuMiwgY2VudGVyWCwgY2VudGVyWSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJNaW51c1wiOlxuICAgICAgY2FzZSBcIk51bXBhZFN1YnRyYWN0XCI6IHtcbiAgICAgICAgY29uc3QgY2VudGVyWCA9IGNhbnZhcy53aWR0aCAvIDI7XG4gICAgICAgIGNvbnN0IGNlbnRlclkgPSBjYW52YXMuaGVpZ2h0IC8gMjtcbiAgICAgICAgY2FtZXJhLnNldFpvb20odWlTdGF0ZS56b29tIC8gMS4yLCBjZW50ZXJYLCBjZW50ZXJZKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY2FzZSBcIkRpZ2l0MFwiOlxuICAgICAgY2FzZSBcIk51bXBhZDBcIjpcbiAgICAgICAgaWYgKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSkge1xuICAgICAgICAgIGNhbWVyYS5zZXRab29tKDEuMCk7XG4gICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgICAgdWkuc2V0SGVscFZpc2libGUoIXVpU3RhdGUuaGVscFZpc2libGUpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBiaW5kSW5wdXQoKTogdm9pZCB7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCBvbkNhbnZhc1BvaW50ZXJEb3duKTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJtb3ZlXCIsIG9uQ2FudmFzUG9pbnRlck1vdmUpO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIG9uQ2FudmFzUG9pbnRlclVwKTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJjYW5jZWxcIiwgb25DYW52YXNQb2ludGVyVXApO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwid2hlZWxcIiwgb25DYW52YXNXaGVlbCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgb25DYW52YXNUb3VjaFN0YXJ0LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIG9uQ2FudmFzVG91Y2hNb3ZlLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgb25DYW52YXNUb3VjaEVuZCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgb25XaW5kb3dLZXlEb3duLCB7IGNhcHR1cmU6IGZhbHNlIH0pO1xuXG4gICAgYnVzLm9uKFwiY29udGV4dDpjaGFuZ2VkXCIsICgpID0+IHtcbiAgICAgIGlmIChwZW5kaW5nVG91Y2hUaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgICAgcGVuZGluZ1RvdWNoVGltZW91dCA9IG51bGw7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJpbmRJbnB1dCxcbiAgfTtcbn1cbiIsICIvLyBTaGFyZWQgcm91dGUgcGxhbm5pbmcgbW9kdWxlIGZvciBzaGlwcyBhbmQgbWlzc2lsZXNcbi8vIFBoYXNlIDE6IFNoYXJlZCBNb2RlbCAmIEhlbHBlcnNcblxuaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUeXBlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgc3BlZWQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUm91dGVQb2ludHMge1xuICB3YXlwb2ludHM6IFJvdXRlV2F5cG9pbnRbXTtcbiAgd29ybGRQb2ludHM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xuICBjYW52YXNQb2ludHM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBDb25zdGFudHNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGNvbnN0IFdBWVBPSU5UX0hJVF9SQURJVVMgPSAxMjtcbmV4cG9ydCBjb25zdCBMRUdfSElUX0RJU1RBTkNFID0gMTA7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEJ1aWxkZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQnVpbGRzIHJvdXRlIHBvaW50cyBmcm9tIGEgc3RhcnQgcG9zaXRpb24gYW5kIHdheXBvaW50cy5cbiAqIEluY2x1ZGVzIHdvcmxkIGNvb3JkaW5hdGVzICh3cmFwcGluZykgYW5kIGNhbnZhcyBjb29yZGluYXRlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUm91dGVQb2ludHMoXG4gIHN0YXJ0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gIHdheXBvaW50czogUm91dGVXYXlwb2ludFtdLFxuICB3b3JsZDogeyB3OiBudW1iZXI7IGg6IG51bWJlciB9LFxuICBjYW1lcmE6ICgpID0+IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSxcbiAgem9vbTogKCkgPT4gbnVtYmVyLFxuICB3b3JsZFRvQ2FudmFzOiAocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KSA9PiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1cbik6IFJvdXRlUG9pbnRzIHtcbiAgY29uc3Qgd29ybGRQb2ludHM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdID0gW3sgeDogc3RhcnQueCwgeTogc3RhcnQueSB9XTtcblxuICBmb3IgKGNvbnN0IHdwIG9mIHdheXBvaW50cykge1xuICAgIHdvcmxkUG9pbnRzLnB1c2goeyB4OiB3cC54LCB5OiB3cC55IH0pO1xuICB9XG5cbiAgY29uc3QgY2FudmFzUG9pbnRzID0gd29ybGRQb2ludHMubWFwKChwb2ludCkgPT4gd29ybGRUb0NhbnZhcyhwb2ludCkpO1xuXG4gIHJldHVybiB7XG4gICAgd2F5cG9pbnRzOiB3YXlwb2ludHMuc2xpY2UoKSxcbiAgICB3b3JsZFBvaW50cyxcbiAgICBjYW52YXNQb2ludHMsXG4gIH07XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEdlb21ldHJ5IC8gSGl0LXRlc3Rcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkaXN0YW5jZSBmcm9tIGEgcG9pbnQgdG8gYSBsaW5lIHNlZ21lbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwb2ludFNlZ21lbnREaXN0YW5jZShcbiAgcDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICBhOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gIGI6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVxuKTogbnVtYmVyIHtcbiAgY29uc3QgYWJ4ID0gYi54IC0gYS54O1xuICBjb25zdCBhYnkgPSBiLnkgLSBhLnk7XG4gIGNvbnN0IGFweCA9IHAueCAtIGEueDtcbiAgY29uc3QgYXB5ID0gcC55IC0gYS55O1xuICBjb25zdCBhYkxlblNxID0gYWJ4ICogYWJ4ICsgYWJ5ICogYWJ5O1xuICBjb25zdCB0ID0gYWJMZW5TcSA9PT0gMCA/IDAgOiBjbGFtcChhcHggKiBhYnggKyBhcHkgKiBhYnksIDAsIGFiTGVuU3EpIC8gYWJMZW5TcTtcbiAgY29uc3QgcHJvanggPSBhLnggKyBhYnggKiB0O1xuICBjb25zdCBwcm9qeSA9IGEueSArIGFieSAqIHQ7XG4gIGNvbnN0IGR4ID0gcC54IC0gcHJvang7XG4gIGNvbnN0IGR5ID0gcC55IC0gcHJvank7XG4gIHJldHVybiBNYXRoLmh5cG90KGR4LCBkeSk7XG59XG5cbi8qKlxuICogSGl0LXRlc3RzIGEgcm91dGUgYWdhaW5zdCBhIGNhbnZhcyBwb2ludC5cbiAqIFJldHVybnMgdGhlIGhpdCB0eXBlIGFuZCBpbmRleCwgb3IgbnVsbCBpZiBubyBoaXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoaXRUZXN0Um91dGVHZW5lcmljKFxuICBjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICByb3V0ZVBvaW50czogUm91dGVQb2ludHMsXG4gIG9wdHM6IHtcbiAgICB3YXlwb2ludEhpdFJhZGl1cz86IG51bWJlcjtcbiAgICBsZWdIaXREaXN0YW5jZT86IG51bWJlcjtcbiAgICBza2lwTGVncz86IGJvb2xlYW47XG4gIH0gPSB7fVxuKTogeyB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiOyBpbmRleDogbnVtYmVyIH0gfCBudWxsIHtcbiAgY29uc3Qgd2F5cG9pbnRIaXRSYWRpdXMgPSBvcHRzLndheXBvaW50SGl0UmFkaXVzID8/IFdBWVBPSU5UX0hJVF9SQURJVVM7XG4gIGNvbnN0IGxlZ0hpdERpc3RhbmNlID0gb3B0cy5sZWdIaXREaXN0YW5jZSA/PyBMRUdfSElUX0RJU1RBTkNFO1xuICBjb25zdCBza2lwTGVncyA9IG9wdHMuc2tpcExlZ3MgPz8gZmFsc2U7XG5cbiAgY29uc3QgeyB3YXlwb2ludHMsIGNhbnZhc1BvaW50cyB9ID0gcm91dGVQb2ludHM7XG5cbiAgaWYgKHdheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIENoZWNrIHdheXBvaW50cyBmaXJzdCAoaGlnaGVyIHByaW9yaXR5IHRoYW4gbGVncylcbiAgLy8gU2tpcCBpbmRleCAwIHdoaWNoIGlzIHRoZSBzdGFydCBwb3NpdGlvblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwQ2FudmFzID0gY2FudmFzUG9pbnRzW2kgKyAxXTsgLy8gKzEgYmVjYXVzZSBmaXJzdCBwb2ludCBpcyBzdGFydCBwb3NpdGlvblxuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdwQ2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd3BDYW52YXMueTtcbiAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpIDw9IHdheXBvaW50SGl0UmFkaXVzKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgbGVncyAobG93ZXIgcHJpb3JpdHkpXG4gIGlmICghc2tpcExlZ3MpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgZGlzdCA9IHBvaW50U2VnbWVudERpc3RhbmNlKGNhbnZhc1BvaW50LCBjYW52YXNQb2ludHNbaV0sIGNhbnZhc1BvaW50c1tpICsgMV0pO1xuICAgICAgaWYgKGRpc3QgPD0gbGVnSGl0RGlzdGFuY2UpIHtcbiAgICAgICAgcmV0dXJuIHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IGkgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRGFzaCBBbmltYXRpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBVcGRhdGVzIGRhc2ggb2Zmc2V0cyBmb3Igcm91dGUgbGVncyB0byBjcmVhdGUgbWFyY2hpbmcgYW50cyBhbmltYXRpb24uXG4gKiBNdXRhdGVzIHRoZSBwcm92aWRlZCBzdG9yZSBtYXAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlKFxuICBzdG9yZTogTWFwPG51bWJlciwgbnVtYmVyPixcbiAgd2F5cG9pbnRzOiBBcnJheTx7IHNwZWVkPzogbnVtYmVyIH0+LFxuICB3b3JsZFBvaW50czogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlciB9PixcbiAgY2FudmFzUG9pbnRzOiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0+LFxuICBmYWxsYmFja1NwZWVkOiBudW1iZXIsXG4gIGR0U2Vjb25kczogbnVtYmVyLFxuICBjeWNsZSA9IDY0XG4pOiB2b2lkIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPCAwKSB7XG4gICAgZHRTZWNvbmRzID0gMDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3AgPSB3YXlwb2ludHNbaV07XG4gICAgY29uc3Qgc3BlZWQgPSB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgJiYgd3Auc3BlZWQgPiAwID8gd3Auc3BlZWQgOiBmYWxsYmFja1NwZWVkO1xuICAgIGNvbnN0IGFXb3JsZCA9IHdvcmxkUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJXb3JsZCA9IHdvcmxkUG9pbnRzW2kgKyAxXTtcbiAgICBjb25zdCB3b3JsZERpc3QgPSBNYXRoLmh5cG90KGJXb3JsZC54IC0gYVdvcmxkLngsIGJXb3JsZC55IC0gYVdvcmxkLnkpO1xuICAgIGNvbnN0IGFDYW52YXMgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3QgYkNhbnZhcyA9IGNhbnZhc1BvaW50c1tpICsgMV07XG4gICAgY29uc3QgY2FudmFzRGlzdCA9IE1hdGguaHlwb3QoYkNhbnZhcy54IC0gYUNhbnZhcy54LCBiQ2FudmFzLnkgLSBhQ2FudmFzLnkpO1xuXG4gICAgaWYgKFxuICAgICAgIU51bWJlci5pc0Zpbml0ZShzcGVlZCkgfHxcbiAgICAgIHNwZWVkIDw9IDFlLTMgfHxcbiAgICAgICFOdW1iZXIuaXNGaW5pdGUod29ybGREaXN0KSB8fFxuICAgICAgd29ybGREaXN0IDw9IDFlLTMgfHxcbiAgICAgIGNhbnZhc0Rpc3QgPD0gMWUtM1xuICAgICkge1xuICAgICAgc3RvcmUuc2V0KGksIDApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGR0U2Vjb25kcyA8PSAwKSB7XG4gICAgICBpZiAoIXN0b3JlLmhhcyhpKSkge1xuICAgICAgICBzdG9yZS5zZXQoaSwgMCk7XG4gICAgICB9XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBzY2FsZSA9IGNhbnZhc0Rpc3QgLyB3b3JsZERpc3Q7XG4gICAgY29uc3QgZGFzaFNwZWVkID0gc3BlZWQgKiBzY2FsZTtcbiAgICBsZXQgbmV4dCA9IChzdG9yZS5nZXQoaSkgPz8gMCkgLSBkYXNoU3BlZWQgKiBkdFNlY29uZHM7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobmV4dCkpIHtcbiAgICAgIG5leHQgPSAwO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0ID0gKChuZXh0ICUgY3ljbGUpICsgY3ljbGUpICUgY3ljbGU7XG4gICAgfVxuICAgIHN0b3JlLnNldChpLCBuZXh0KTtcbiAgfVxuICAvLyBDbGVhbiB1cCBvbGQga2V5c1xuICBmb3IgKGNvbnN0IGtleSBvZiBBcnJheS5mcm9tKHN0b3JlLmtleXMoKSkpIHtcbiAgICBpZiAoa2V5ID49IHdheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHN0b3JlLmRlbGV0ZShrZXkpO1xuICAgIH1cbiAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBIZWF0IFByb2plY3Rpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGludGVyZmFjZSBIZWF0UHJvamVjdGlvblBhcmFtcyB7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbiAgbWF4OiBudW1iZXI7XG4gIG92ZXJoZWF0QXQ6IG51bWJlcjtcbiAgd2FybkF0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFByb2plY3Rpb25SZXN1bHQge1xuICBoZWF0QXRXYXlwb2ludHM6IG51bWJlcltdO1xuICB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47XG4gIG92ZXJoZWF0QXQ/OiBudW1iZXI7IC8vIEluZGV4IHdoZXJlIG92ZXJoZWF0IG9jY3Vyc1xufVxuXG4vKipcbiAqIFByb2plY3RzIGhlYXQgYWxvbmcgYSByb3V0ZSBnaXZlbiBpbml0aWFsIGhlYXQgYW5kIGhlYXQgcGFyYW1ldGVycy5cbiAqIFJldHVybnMgaGVhdCBhdCBlYWNoIHdheXBvaW50IGFuZCB3aGV0aGVyIG92ZXJoZWF0IHdpbGwgb2NjdXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0Um91dGVIZWF0KFxuICByb3V0ZTogUm91dGVXYXlwb2ludFtdLFxuICBpbml0aWFsSGVhdDogbnVtYmVyLFxuICBwYXJhbXM6IEhlYXRQcm9qZWN0aW9uUGFyYW1zXG4pOiBIZWF0UHJvamVjdGlvblJlc3VsdCB7XG4gIGNvbnN0IHJlc3VsdDogSGVhdFByb2plY3Rpb25SZXN1bHQgPSB7XG4gICAgaGVhdEF0V2F5cG9pbnRzOiBbXSxcbiAgICB3aWxsT3ZlcmhlYXQ6IGZhbHNlLFxuICB9O1xuXG4gIGlmIChyb3V0ZS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgbGV0IGhlYXQgPSBjbGFtcChpbml0aWFsSGVhdCwgMCwgcGFyYW1zLm1heCk7XG4gIGxldCBwcmV2UG9pbnQgPSB7IHg6IHJvdXRlWzBdLngsIHk6IHJvdXRlWzBdLnkgfTtcblxuICByZXN1bHQuaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCByb3V0ZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHRhcmdldFBvcyA9IHJvdXRlW2ldO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGRpc3RhbmNlIGFuZCB0aW1lXG4gICAgY29uc3QgZHggPSB0YXJnZXRQb3MueCAtIHByZXZQb2ludC54O1xuICAgIGNvbnN0IGR5ID0gdGFyZ2V0UG9zLnkgLSBwcmV2UG9pbnQueTtcbiAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG5cbiAgICBpZiAoZGlzdGFuY2UgPCAwLjAwMSkge1xuICAgICAgcmVzdWx0LmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuICAgICAgcHJldlBvaW50ID0geyB4OiB0YXJnZXRQb3MueCwgeTogdGFyZ2V0UG9zLnkgfTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHJhd1NwZWVkID0gdGFyZ2V0UG9zLnNwZWVkID8/IHBhcmFtcy5tYXJrZXJTcGVlZDtcbiAgICBjb25zdCBzZWdtZW50U3BlZWQgPSBNYXRoLm1heChyYXdTcGVlZCwgMC4wMDAwMDEpO1xuICAgIGNvbnN0IHNlZ21lbnRUaW1lID0gZGlzdGFuY2UgLyBzZWdtZW50U3BlZWQ7XG5cbiAgICAvLyBDYWxjdWxhdGUgaGVhdCByYXRlIChtYXRjaCBzZXJ2ZXIgZm9ybXVsYSlcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KHBhcmFtcy5tYXJrZXJTcGVlZCwgMC4wMDAwMDEpO1xuICAgIGNvbnN0IGRldiA9IHNlZ21lbnRTcGVlZCAtIHBhcmFtcy5tYXJrZXJTcGVlZDtcbiAgICBjb25zdCBwID0gcGFyYW1zLmV4cDtcblxuICAgIGxldCBoZG90OiBudW1iZXI7XG4gICAgaWYgKGRldiA+PSAwKSB7XG4gICAgICAvLyBIZWF0aW5nXG4gICAgICBoZG90ID0gcGFyYW1zLmtVcCAqIE1hdGgucG93KGRldiAvIFZuLCBwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ29vbGluZ1xuICAgICAgaGRvdCA9IC1wYXJhbXMua0Rvd24gKiBNYXRoLnBvdyhNYXRoLmFicyhkZXYpIC8gVm4sIHApO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBoZWF0XG4gICAgaGVhdCArPSBoZG90ICogc2VnbWVudFRpbWU7XG4gICAgaGVhdCA9IGNsYW1wKGhlYXQsIDAsIHBhcmFtcy5tYXgpO1xuXG4gICAgcmVzdWx0LmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuXG4gICAgLy8gQ2hlY2sgZm9yIG92ZXJoZWF0XG4gICAgaWYgKCFyZXN1bHQud2lsbE92ZXJoZWF0ICYmIGhlYXQgPj0gcGFyYW1zLm92ZXJoZWF0QXQpIHtcbiAgICAgIHJlc3VsdC53aWxsT3ZlcmhlYXQgPSB0cnVlO1xuICAgICAgcmVzdWx0Lm92ZXJoZWF0QXQgPSBpO1xuICAgIH1cblxuICAgIHByZXZQb2ludCA9IHsgeDogdGFyZ2V0UG9zLngsIHk6IHRhcmdldFBvcy55IH07XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIENvbXBhdGliaWxpdHkgd3JhcHBlciBmb3IgbWlzc2lsZSBoZWF0IHByb2plY3Rpb24uXG4gKiBNaXNzaWxlcyBzdGFydCBhdCB6ZXJvIGhlYXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0TWlzc2lsZUhlYXRDb21wYXQoXG4gIHJvdXRlOiBSb3V0ZVdheXBvaW50W10sXG4gIGRlZmF1bHRTcGVlZDogbnVtYmVyLFxuICBoZWF0UGFyYW1zOiBIZWF0UHJvamVjdGlvblBhcmFtc1xuKTogSGVhdFByb2plY3Rpb25SZXN1bHQge1xuICAvLyBNaXNzaWxlcyBzdGFydCBhdCB6ZXJvIGhlYXRcbiAgLy8gRW5zdXJlIGFsbCB3YXlwb2ludHMgaGF2ZSBzcGVlZCBzZXQgKHVzZSBkZWZhdWx0IGlmIG1pc3NpbmcpXG4gIGNvbnN0IHJvdXRlV2l0aFNwZWVkID0gcm91dGUubWFwKCh3cCkgPT4gKHtcbiAgICB4OiB3cC54LFxuICAgIHk6IHdwLnksXG4gICAgc3BlZWQ6IHdwLnNwZWVkID8/IGRlZmF1bHRTcGVlZCxcbiAgfSkpO1xuXG4gIHJldHVybiBwcm9qZWN0Um91dGVIZWF0KHJvdXRlV2l0aFNwZWVkLCAwLCBoZWF0UGFyYW1zKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUmVuZGVyaW5nXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogTGluZWFyIGNvbG9yIGludGVycG9sYXRpb24gYmV0d2VlbiB0d28gUkdCIGNvbG9ycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGludGVycG9sYXRlQ29sb3IoXG4gIGNvbG9yMTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuICBjb2xvcjI6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcbiAgdDogbnVtYmVyXG4pOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0ge1xuICByZXR1cm4gW1xuICAgIE1hdGgucm91bmQoY29sb3IxWzBdICsgKGNvbG9yMlswXSAtIGNvbG9yMVswXSkgKiB0KSxcbiAgICBNYXRoLnJvdW5kKGNvbG9yMVsxXSArIChjb2xvcjJbMV0gLSBjb2xvcjFbMV0pICogdCksXG4gICAgTWF0aC5yb3VuZChjb2xvcjFbMl0gKyAoY29sb3IyWzJdIC0gY29sb3IxWzJdKSAqIHQpLFxuICBdO1xufVxuXG4vKipcbiAqIENvbG9yIHBhbGV0dGUgZm9yIHJvdXRlIHJlbmRlcmluZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBSb3V0ZVBhbGV0dGUge1xuICAvLyBEZWZhdWx0IGxpbmUgY29sb3IgKHdoZW4gbm8gaGVhdCBkYXRhKVxuICBkZWZhdWx0TGluZTogc3RyaW5nO1xuICAvLyBTZWxlY3Rpb24gaGlnaGxpZ2h0IGNvbG9yXG4gIHNlbGVjdGlvbjogc3RyaW5nO1xuICAvLyBXYXlwb2ludCBjb2xvcnNcbiAgd2F5cG9pbnREZWZhdWx0OiBzdHJpbmc7XG4gIHdheXBvaW50U2VsZWN0ZWQ6IHN0cmluZztcbiAgd2F5cG9pbnREcmFnZ2luZz86IHN0cmluZztcbiAgd2F5cG9pbnRTdHJva2U6IHN0cmluZztcbiAgd2F5cG9pbnRTdHJva2VTZWxlY3RlZD86IHN0cmluZztcbiAgLy8gSGVhdCBncmFkaWVudCBjb2xvcnMgKGZyb20gY29vbCB0byBob3QpXG4gIGhlYXRDb29sUmdiPzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuICBoZWF0SG90UmdiPzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xufVxuXG4vKipcbiAqIERlZmF1bHQgc2hpcCBwYWxldHRlIChibHVlIHRoZW1lKS5cbiAqL1xuZXhwb3J0IGNvbnN0IFNISVBfUEFMRVRURTogUm91dGVQYWxldHRlID0ge1xuICBkZWZhdWx0TGluZTogXCIjMzhiZGY4XCIsXG4gIHNlbGVjdGlvbjogXCIjZjk3MzE2XCIsXG4gIHdheXBvaW50RGVmYXVsdDogXCIjMzhiZGY4XCIsXG4gIHdheXBvaW50U2VsZWN0ZWQ6IFwiI2Y5NzMxNlwiLFxuICB3YXlwb2ludERyYWdnaW5nOiBcIiNmYWNjMTVcIixcbiAgd2F5cG9pbnRTdHJva2U6IFwiIzBmMTcyYVwiLFxuICBoZWF0Q29vbFJnYjogWzEwMCwgMTUwLCAyNTVdLFxuICBoZWF0SG90UmdiOiBbMjU1LCA1MCwgNTBdLFxufTtcblxuLyoqXG4gKiBNaXNzaWxlIHBhbGV0dGUgKHJlZCB0aGVtZSkuXG4gKi9cbmV4cG9ydCBjb25zdCBNSVNTSUxFX1BBTEVUVEU6IFJvdXRlUGFsZXR0ZSA9IHtcbiAgZGVmYXVsdExpbmU6IFwiI2Y4NzE3MWFhXCIsXG4gIHNlbGVjdGlvbjogXCIjZjk3MzE2XCIsXG4gIHdheXBvaW50RGVmYXVsdDogXCIjZjg3MTcxXCIsXG4gIHdheXBvaW50U2VsZWN0ZWQ6IFwiI2ZhY2MxNVwiLFxuICB3YXlwb2ludFN0cm9rZTogXCIjN2YxZDFkXCIsXG4gIHdheXBvaW50U3Ryb2tlU2VsZWN0ZWQ6IFwiIzg1NGQwZVwiLFxuICBoZWF0Q29vbFJnYjogWzI0OCwgMTI5LCAxMjldLFxuICBoZWF0SG90UmdiOiBbMjIwLCAzOCwgMzhdLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBEcmF3UGxhbm5lZFJvdXRlT3B0aW9ucyB7XG4gIC8vIENhbnZhcyBwb2ludHMgZm9yIHRoZSByb3V0ZVxuICByb3V0ZVBvaW50czogUm91dGVQb2ludHM7XG4gIC8vIFNlbGVjdGlvbiBzdGF0ZSAod2hpY2ggd2F5cG9pbnQvbGVnIGlzIHNlbGVjdGVkKVxuICBzZWxlY3Rpb246IHsgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjsgaW5kZXg6IG51bWJlciB9IHwgbnVsbDtcbiAgLy8gRHJhZ2dlZCB3YXlwb2ludCBpbmRleCAoZm9yIGRyYWctYW5kLWRyb3ApXG4gIGRyYWdnZWRXYXlwb2ludD86IG51bWJlciB8IG51bGw7XG4gIC8vIERhc2ggYW5pbWF0aW9uIG9mZnNldHNcbiAgZGFzaFN0b3JlOiBNYXA8bnVtYmVyLCBudW1iZXI+O1xuICAvLyBDb2xvciBwYWxldHRlIChkZWZhdWx0cyB0byBzaGlwIHBhbGV0dGUpXG4gIHBhbGV0dGU/OiBSb3V0ZVBhbGV0dGU7XG4gIC8vIFdoZXRoZXIgdG8gc2hvdyB0aGUgcm91dGUgbGVnc1xuICBzaG93TGVnczogYm9vbGVhbjtcbiAgLy8gSGVhdCBwYXJhbWV0ZXJzIGFuZCBpbml0aWFsIGhlYXQgKG9wdGlvbmFsKVxuICBoZWF0UGFyYW1zPzogSGVhdFByb2plY3Rpb25QYXJhbXM7XG4gIGluaXRpYWxIZWF0PzogbnVtYmVyO1xuICAvLyBEZWZhdWx0IHNwZWVkIGZvciB3YXlwb2ludHMgd2l0aG91dCBzcGVlZCBzZXRcbiAgZGVmYXVsdFNwZWVkOiBudW1iZXI7XG4gIC8vIFdvcmxkIHBvaW50cyAoZm9yIGhlYXQgY2FsY3VsYXRpb24pXG4gIHdvcmxkUG9pbnRzPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9W107XG59XG5cbi8qKlxuICogRHJhd3MgYSBwbGFubmVkIHJvdXRlIChzaGlwIG9yIG1pc3NpbGUpIHdpdGggdW5pZmllZCB2aXN1YWxzLlxuICogVXNlcyBzaGlwLXN0eWxlIHJlbmRlcmluZyBieSBkZWZhdWx0LCB3aXRoIG9wdGlvbmFsIHBhbGV0dGUgb3ZlcnJpZGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkcmF3UGxhbm5lZFJvdXRlKFxuICBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcbiAgb3B0czogRHJhd1BsYW5uZWRSb3V0ZU9wdGlvbnNcbik6IHZvaWQge1xuICBjb25zdCB7XG4gICAgcm91dGVQb2ludHMsXG4gICAgc2VsZWN0aW9uLFxuICAgIGRyYWdnZWRXYXlwb2ludCxcbiAgICBkYXNoU3RvcmUsXG4gICAgcGFsZXR0ZSA9IFNISVBfUEFMRVRURSxcbiAgICBzaG93TGVncyxcbiAgICBoZWF0UGFyYW1zLFxuICAgIGluaXRpYWxIZWF0ID0gMCxcbiAgICBkZWZhdWx0U3BlZWQsXG4gICAgd29ybGRQb2ludHMsXG4gIH0gPSBvcHRzO1xuXG4gIGNvbnN0IHsgd2F5cG9pbnRzLCBjYW52YXNQb2ludHMgfSA9IHJvdXRlUG9pbnRzO1xuXG4gIGlmICh3YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQ2FsY3VsYXRlIGhlYXQgcHJvamVjdGlvbiBpZiBoZWF0IHBhcmFtcyBhdmFpbGFibGVcbiAgbGV0IGhlYXRQcm9qZWN0aW9uOiBIZWF0UHJvamVjdGlvblJlc3VsdCB8IG51bGwgPSBudWxsO1xuICBpZiAoaGVhdFBhcmFtcyAmJiB3b3JsZFBvaW50cyAmJiB3b3JsZFBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3Qgcm91dGVGb3JIZWF0OiBSb3V0ZVdheXBvaW50W10gPSB3b3JsZFBvaW50cy5tYXAoKHB0LCBpKSA9PiAoe1xuICAgICAgeDogcHQueCxcbiAgICAgIHk6IHB0LnksXG4gICAgICBzcGVlZDogaSA9PT0gMCA/IHVuZGVmaW5lZCA6IHdheXBvaW50c1tpIC0gMV0/LnNwZWVkID8/IGRlZmF1bHRTcGVlZCxcbiAgICB9KSk7XG4gICAgaGVhdFByb2plY3Rpb24gPSBwcm9qZWN0Um91dGVIZWF0KHJvdXRlRm9ySGVhdCwgaW5pdGlhbEhlYXQsIGhlYXRQYXJhbXMpO1xuICB9XG5cbiAgLy8gRHJhdyByb3V0ZSBzZWdtZW50c1xuICBpZiAoc2hvd0xlZ3MpIHtcbiAgICBsZXQgY3VycmVudEhlYXQgPSBpbml0aWFsSGVhdDtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBpc0ZpcnN0TGVnID0gaSA9PT0gMDtcbiAgICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3Rpb24/LnR5cGUgPT09IFwibGVnXCIgJiYgc2VsZWN0aW9uLmluZGV4ID09PSBpO1xuXG4gICAgICAvLyBHZXQgaGVhdCBhdCBlbmQgb2YgdGhpcyBzZWdtZW50XG4gICAgICBsZXQgc2VnbWVudEhlYXQgPSBjdXJyZW50SGVhdDtcbiAgICAgIGlmIChoZWF0UHJvamVjdGlvbiAmJiBpICsgMSA8IGhlYXRQcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgICAgc2VnbWVudEhlYXQgPSBoZWF0UHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHNbaSArIDFdO1xuICAgICAgfVxuXG4gICAgICAvLyBDYWxjdWxhdGUgaGVhdC1iYXNlZCBjb2xvciBpZiBoZWF0IGRhdGEgYXZhaWxhYmxlXG4gICAgICBsZXQgc3Ryb2tlU3R5bGU6IHN0cmluZztcbiAgICAgIGxldCBsaW5lV2lkdGg6IG51bWJlcjtcbiAgICAgIGxldCBsaW5lRGFzaDogbnVtYmVyW10gfCBudWxsID0gbnVsbDtcbiAgICAgIGxldCBhbHBoYU92ZXJyaWRlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICAgICAgaWYgKGlzU2VsZWN0ZWQpIHtcbiAgICAgICAgLy8gU2VsZWN0aW9uIHN0eWxpbmdcbiAgICAgICAgc3Ryb2tlU3R5bGUgPSBwYWxldHRlLnNlbGVjdGlvbjtcbiAgICAgICAgbGluZVdpZHRoID0gMy41O1xuICAgICAgICBsaW5lRGFzaCA9IFs0LCA0XTtcbiAgICAgIH0gZWxzZSBpZiAoaGVhdFByb2plY3Rpb24gJiYgaGVhdFBhcmFtcyAmJiBwYWxldHRlLmhlYXRDb29sUmdiICYmIHBhbGV0dGUuaGVhdEhvdFJnYikge1xuICAgICAgICAvLyBIZWF0LWJhc2VkIGNvbG9yIGludGVycG9sYXRpb24gKHNoaXAgc3R5bGUpXG4gICAgICAgIGNvbnN0IGhlYXRSYXRpbyA9IGNsYW1wKHNlZ21lbnRIZWF0IC8gaGVhdFBhcmFtcy5vdmVyaGVhdEF0LCAwLCAxKTtcbiAgICAgICAgY29uc3QgY29sb3IgPSBpbnRlcnBvbGF0ZUNvbG9yKHBhbGV0dGUuaGVhdENvb2xSZ2IsIHBhbGV0dGUuaGVhdEhvdFJnYiwgaGVhdFJhdGlvKTtcbiAgICAgICAgY29uc3QgYmFzZVdpZHRoID0gaXNGaXJzdExlZyA/IDMgOiAxLjU7XG4gICAgICAgIGxpbmVXaWR0aCA9IGJhc2VXaWR0aCArIGhlYXRSYXRpbyAqIDQ7XG4gICAgICAgIGNvbnN0IGFscGhhID0gaXNGaXJzdExlZyA/IDEgOiAwLjQ7XG4gICAgICAgIHN0cm9rZVN0eWxlID0gYHJnYmEoJHtjb2xvclswXX0sICR7Y29sb3JbMV19LCAke2NvbG9yWzJdfSwgJHthbHBoYX0pYDtcbiAgICAgICAgbGluZURhc2ggPSBpc0ZpcnN0TGVnID8gWzYsIDZdIDogWzgsIDhdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGVmYXVsdCBzdHlsaW5nIChubyBoZWF0KVxuICAgICAgICBjb25zdCBiYXNlV2lkdGggPSBpc0ZpcnN0TGVnID8gMyA6IDEuNTtcbiAgICAgICAgbGluZVdpZHRoID0gYmFzZVdpZHRoO1xuICAgICAgICBzdHJva2VTdHlsZSA9IHBhbGV0dGUuZGVmYXVsdExpbmU7XG4gICAgICAgIGxpbmVEYXNoID0gaXNGaXJzdExlZyA/IFs2LCA2XSA6IFs4LCA4XTtcbiAgICAgICAgYWxwaGFPdmVycmlkZSA9IGlzRmlyc3RMZWcgPyAxIDogMC40O1xuICAgICAgfVxuXG4gICAgICBjdHguc2F2ZSgpO1xuICAgICAgaWYgKGxpbmVEYXNoKSB7XG4gICAgICAgIGN0eC5zZXRMaW5lRGFzaChsaW5lRGFzaCk7XG4gICAgICB9XG4gICAgICBpZiAoYWxwaGFPdmVycmlkZSAhPT0gbnVsbCkge1xuICAgICAgICBjdHguZ2xvYmFsQWxwaGEgPSBhbHBoYU92ZXJyaWRlO1xuICAgICAgfVxuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gc3Ryb2tlU3R5bGU7XG4gICAgICBjdHgubGluZVdpZHRoID0gbGluZVdpZHRoO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4LmxpbmVEYXNoT2Zmc2V0ID0gZGFzaFN0b3JlLmdldChpKSA/PyAwO1xuICAgICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbaV0ueCwgY2FudmFzUG9pbnRzW2ldLnkpO1xuICAgICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbaSArIDFdLngsIGNhbnZhc1BvaW50c1tpICsgMV0ueSk7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgICBjdXJyZW50SGVhdCA9IHNlZ21lbnRIZWF0O1xuICAgIH1cbiAgfVxuXG4gIC8vIERyYXcgd2F5cG9pbnQgbWFya2Vyc1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHB0ID0gY2FudmFzUG9pbnRzW2kgKyAxXTsgLy8gKzEgYmVjYXVzZSBmaXJzdCBwb2ludCBpcyBzdGFydCBwb3NpdGlvblxuICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3Rpb24/LnR5cGUgPT09IFwid2F5cG9pbnRcIiAmJiBzZWxlY3Rpb24uaW5kZXggPT09IGk7XG4gICAgY29uc3QgaXNEcmFnZ2luZyA9IGRyYWdnZWRXYXlwb2ludCA9PT0gaTtcblxuICAgIC8vIERldGVybWluZSBmaWxsIGNvbG9yXG4gICAgbGV0IGZpbGxDb2xvcjogc3RyaW5nO1xuICAgIGlmIChpc1NlbGVjdGVkKSB7XG4gICAgICBmaWxsQ29sb3IgPSBwYWxldHRlLndheXBvaW50U2VsZWN0ZWQ7XG4gICAgfSBlbHNlIGlmIChpc0RyYWdnaW5nICYmIHBhbGV0dGUud2F5cG9pbnREcmFnZ2luZykge1xuICAgICAgZmlsbENvbG9yID0gcGFsZXR0ZS53YXlwb2ludERyYWdnaW5nO1xuICAgIH0gZWxzZSBpZiAoaGVhdFByb2plY3Rpb24gJiYgaGVhdFBhcmFtcykge1xuICAgICAgLy8gSGVhdC1iYXNlZCB3YXlwb2ludCBjb2xvcmluZyAodGhyZXNob2xkLWJhc2VkIGZvciBtaXNzaWxlcylcbiAgICAgIGNvbnN0IGhlYXQgPSBoZWF0UHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHNbaSArIDFdID8/IDA7XG4gICAgICBjb25zdCBoZWF0UmF0aW8gPSBoZWF0IC8gaGVhdFBhcmFtcy5tYXg7XG4gICAgICBjb25zdCB3YXJuUmF0aW8gPSBoZWF0UGFyYW1zLndhcm5BdCAvIGhlYXRQYXJhbXMubWF4O1xuICAgICAgY29uc3Qgb3ZlcmhlYXRSYXRpbyA9IGhlYXRQYXJhbXMub3ZlcmhlYXRBdCAvIGhlYXRQYXJhbXMubWF4O1xuXG4gICAgICBpZiAoaGVhdFJhdGlvIDwgd2FyblJhdGlvKSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiIzMzYWEzM1wiOyAvLyBHcmVlblxuICAgICAgfSBlbHNlIGlmIChoZWF0UmF0aW8gPCBvdmVyaGVhdFJhdGlvKSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiI2ZmYWEzM1wiOyAvLyBPcmFuZ2VcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiI2ZmMzMzM1wiOyAvLyBSZWRcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZmlsbENvbG9yID0gcGFsZXR0ZS53YXlwb2ludERlZmF1bHQ7XG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIHN0cm9rZSBjb2xvclxuICAgIGNvbnN0IHN0cm9rZUNvbG9yID0gaXNTZWxlY3RlZCAmJiBwYWxldHRlLndheXBvaW50U3Ryb2tlU2VsZWN0ZWRcbiAgICAgID8gcGFsZXR0ZS53YXlwb2ludFN0cm9rZVNlbGVjdGVkXG4gICAgICA6IHBhbGV0dGUud2F5cG9pbnRTdHJva2U7XG5cbiAgICAvLyBEcmF3IHdheXBvaW50XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY29uc3QgcmFkaXVzID0gaXNTZWxlY3RlZCB8fCBpc0RyYWdnaW5nID8gNyA6IDU7XG4gICAgY3R4LmFyYyhwdC54LCBwdC55LCByYWRpdXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gZmlsbENvbG9yO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IGlzU2VsZWN0ZWQgfHwgaXNEcmFnZ2luZyA/IDAuOTUgOiAwLjg7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSBpc1NlbGVjdGVkID8gMiA6IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHJva2VDb2xvcjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7XG4gIEFwcFN0YXRlLFxuICBNaXNzaWxlUm91dGUsXG4gIE1pc3NpbGVTZWxlY3Rpb24sXG4gIFNlbGVjdGlvbixcbiAgVUlTdGF0ZSxcbn0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBNSVNTSUxFX01BWF9TUEVFRCwgTUlTU0lMRV9NSU5fU1BFRUQsIGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgdHlwZSB7IFJvdXRlUG9pbnRzIH0gZnJvbSBcIi4uL3JvdXRlXCI7XG5pbXBvcnQge1xuICBXQVlQT0lOVF9ISVRfUkFESVVTLFxuICBidWlsZFJvdXRlUG9pbnRzLFxuICBoaXRUZXN0Um91dGVHZW5lcmljLFxuICB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlLFxufSBmcm9tIFwiLi4vcm91dGVcIjtcbmltcG9ydCB0eXBlIHsgQ2FtZXJhIH0gZnJvbSBcIi4vY2FtZXJhXCI7XG5cbmludGVyZmFjZSBMb2dpY0RlcGVuZGVuY2llcyB7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgc2VuZE1lc3NhZ2UocGF5bG9hZDogdW5rbm93bik6IHZvaWQ7XG4gIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXI7XG4gIGNhbWVyYTogQ2FtZXJhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBvaW50ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExvZ2ljIHtcbiAgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB8IG51bGw7XG4gIHNldFNlbGVjdGlvbihzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwpOiB2b2lkO1xuICBnZXRNaXNzaWxlU2VsZWN0aW9uKCk6IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwsIHJvdXRlSWQ/OiBzdHJpbmcpOiB2b2lkO1xuICBnZXREZWZhdWx0U2hpcFNwZWVkKCk6IG51bWJlcjtcbiAgc2V0RGVmYXVsdFNoaXBTcGVlZCh2YWx1ZTogbnVtYmVyKTogdm9pZDtcbiAgZ2V0RGVmYXVsdE1pc3NpbGVMZWdTcGVlZCgpOiBudW1iZXI7XG4gIHJlY29yZE1pc3NpbGVMZWdTcGVlZCh2YWx1ZTogbnVtYmVyKTogdm9pZDtcbiAgZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk6IG51bWJlcjtcbiAgZGlzcGxheUluZGV4VG9BY3R1YWxJbmRleChkaXNwbGF5SW5kZXg6IG51bWJlcik6IG51bWJlcjtcbiAgYWN0dWFsSW5kZXhUb0Rpc3BsYXlJbmRleChhY3R1YWxJbmRleDogbnVtYmVyKTogbnVtYmVyO1xuICBjb21wdXRlUm91dGVQb2ludHMoKTogUm91dGVQb2ludHMgfCBudWxsO1xuICBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk6IFJvdXRlUG9pbnRzIHwgbnVsbDtcbiAgZmluZFdheXBvaW50QXRQb3NpdGlvbihjYW52YXNQb2ludDogUG9pbnRlclBvaW50KTogbnVtYmVyIHwgbnVsbDtcbiAgaGl0VGVzdFJvdXRlKGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQpOiBTZWxlY3Rpb24gfCBudWxsO1xuICBoaXRUZXN0TWlzc2lsZVJvdXRlcyhcbiAgICBjYW52YXNQb2ludDogUG9pbnRlclBvaW50XG4gICk6IHsgcm91dGU6IE1pc3NpbGVSb3V0ZTsgc2VsZWN0aW9uOiBNaXNzaWxlU2VsZWN0aW9uIH0gfCBudWxsO1xuICBzaGlwTGVnRGFzaE9mZnNldHM6IE1hcDxudW1iZXIsIG51bWJlcj47XG4gIG1pc3NpbGVMZWdEYXNoT2Zmc2V0czogTWFwPG51bWJlciwgbnVtYmVyPjtcbiAgdXBkYXRlUm91dGVBbmltYXRpb25zKGR0U2Vjb25kczogbnVtYmVyKTogdm9pZDtcbiAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk6IE1pc3NpbGVSb3V0ZSB8IG51bGw7XG4gIGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsO1xuICBjeWNsZU1pc3NpbGVSb3V0ZShkaXJlY3Rpb246IG51bWJlcik6IHZvaWQ7XG4gIGN5Y2xlU2hpcFNlbGVjdGlvbihkaXJlY3Rpb246IG51bWJlcik6IHZvaWQ7XG4gIGNsZWFyU2hpcFJvdXRlKCk6IHZvaWQ7XG4gIGRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk6IHZvaWQ7XG4gIGRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk6IHZvaWQ7XG4gIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiB2b2lkO1xuICBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludDogUG9pbnRlclBvaW50LCB3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkO1xuICBoYW5kbGVNaXNzaWxlUG9pbnRlcihjYW52YXNQb2ludDogUG9pbnRlclBvaW50LCB3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkO1xuICBiZWdpblNoaXBEcmFnKGluZGV4OiBudW1iZXIsIG9yaWdpbjogUG9pbnRlclBvaW50KTogdm9pZDtcbiAgYmVnaW5NaXNzaWxlRHJhZyhpbmRleDogbnVtYmVyLCBvcmlnaW46IFBvaW50ZXJQb2ludCk6IHZvaWQ7XG4gIHVwZGF0ZVNoaXBEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQ7XG4gIHVwZGF0ZU1pc3NpbGVEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQ7XG4gIGVuZERyYWcoKTogdm9pZDtcbiAgZ2V0RHJhZ2dlZFdheXBvaW50KCk6IG51bWJlciB8IG51bGw7XG4gIGdldERyYWdnZWRNaXNzaWxlV2F5cG9pbnQoKTogbnVtYmVyIHwgbnVsbDtcbiAgZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvZ2ljKHtcbiAgc3RhdGUsXG4gIHVpU3RhdGUsXG4gIGJ1cyxcbiAgc2VuZE1lc3NhZ2UsXG4gIGdldEFwcHJveFNlcnZlck5vdyxcbiAgY2FtZXJhLFxufTogTG9naWNEZXBlbmRlbmNpZXMpOiBMb2dpYyB7XG4gIGxldCBzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xuICBsZXQgZGVmYXVsdFNwZWVkID0gMTUwO1xuICBsZXQgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IDA7XG4gIGNvbnN0IHNoaXBMZWdEYXNoT2Zmc2V0cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gIGNvbnN0IG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gIGxldCBkcmFnZ2VkV2F5cG9pbnQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB8IG51bGwge1xuICAgIHJldHVybiBzZWxlY3Rpb247XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTZWxlY3Rpb24oc2VsOiBTZWxlY3Rpb24gfCBudWxsKTogdm9pZCB7XG4gICAgc2VsZWN0aW9uID0gc2VsO1xuICAgIGNvbnN0IGluZGV4ID0gc2VsZWN0aW9uID8gc2VsZWN0aW9uLmluZGV4IDogbnVsbDtcbiAgICBidXMuZW1pdChcInNoaXA6bGVnU2VsZWN0ZWRcIiwgeyBpbmRleCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldE1pc3NpbGVTZWxlY3Rpb24oKTogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwge1xuICAgIHJldHVybiBtaXNzaWxlU2VsZWN0aW9uO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0TWlzc2lsZVNlbGVjdGlvbihzZWw6IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsLCByb3V0ZUlkPzogc3RyaW5nKTogdm9pZCB7XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IHNlbDtcbiAgICBpZiAocm91dGVJZCkge1xuICAgICAgc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSByb3V0ZUlkO1xuICAgIH1cbiAgICBidXMuZW1pdChcIm1pc3NpbGU6c2VsZWN0aW9uQ2hhbmdlZFwiLCB7IHNlbGVjdGlvbjogbWlzc2lsZVNlbGVjdGlvbiB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldERlZmF1bHRTaGlwU3BlZWQoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gZGVmYXVsdFNwZWVkO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0RGVmYXVsdFNoaXBTcGVlZCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgZGVmYXVsdFNwZWVkID0gdmFsdWU7XG4gIH1cblxuICBmdW5jdGlvbiBnZXREZWZhdWx0TWlzc2lsZUxlZ1NwZWVkKCk6IG51bWJlciB7XG4gICAgY29uc3QgbWluU3BlZWQgPSBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWluID8/IE1JU1NJTEVfTUlOX1NQRUVEO1xuICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICBjb25zdCBiYXNlID1cbiAgICAgIGxhc3RNaXNzaWxlTGVnU3BlZWQgPiAwID8gbGFzdE1pc3NpbGVMZWdTcGVlZCA6IHN0YXRlLm1pc3NpbGVDb25maWcuc3BlZWQ7XG4gICAgcmV0dXJuIGNsYW1wKGJhc2UsIG1pblNwZWVkLCBtYXhTcGVlZCk7XG4gIH1cblxuICBmdW5jdGlvbiByZWNvcmRNaXNzaWxlTGVnU3BlZWQodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMCkge1xuICAgICAgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNoaXBXYXlwb2ludE9mZnNldCgpOiBudW1iZXIge1xuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IHN0YXRlLm1lPy5jdXJyZW50V2F5cG9pbnRJbmRleDtcbiAgICBpZiAodHlwZW9mIGN1cnJlbnRJbmRleCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUoY3VycmVudEluZGV4KSAmJiBjdXJyZW50SW5kZXggPiAwKSB7XG4gICAgICByZXR1cm4gY3VycmVudEluZGV4O1xuICAgIH1cbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoZGlzcGxheUluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBkaXNwbGF5SW5kZXggKyBnZXRTaGlwV2F5cG9pbnRPZmZzZXQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFjdHVhbEluZGV4VG9EaXNwbGF5SW5kZXgoYWN0dWFsSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgb2Zmc2V0ID0gZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk7XG4gICAgcmV0dXJuIGFjdHVhbEluZGV4IC0gb2Zmc2V0O1xuICB9XG5cbiAgZnVuY3Rpb24gY29tcHV0ZVJvdXRlUG9pbnRzKCk6IFJvdXRlUG9pbnRzIHwgbnVsbCB7XG4gICAgaWYgKCFzdGF0ZS5tZSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYWxsV2F5cG9pbnRzID0gQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpID8gc3RhdGUubWUud2F5cG9pbnRzIDogW107XG4gICAgY29uc3Qgb2Zmc2V0ID0gZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk7XG4gICAgY29uc3QgdmlzaWJsZVdheXBvaW50cyA9IG9mZnNldCA+IDAgPyBhbGxXYXlwb2ludHMuc2xpY2Uob2Zmc2V0KSA6IGFsbFdheXBvaW50cztcbiAgICBpZiAoIXZpc2libGVXYXlwb2ludHMubGVuZ3RoICYmICF1aVN0YXRlLnNob3dTaGlwUm91dGUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gYnVpbGRSb3V0ZVBvaW50cyhcbiAgICAgIHsgeDogc3RhdGUubWUueCwgeTogc3RhdGUubWUueSB9LFxuICAgICAgdmlzaWJsZVdheXBvaW50cyxcbiAgICAgIGNhbWVyYS5nZXRXb3JsZFNpemUoKSxcbiAgICAgIGNhbWVyYS5nZXRDYW1lcmFQb3NpdGlvbixcbiAgICAgICgpID0+IHVpU3RhdGUuem9vbSxcbiAgICAgIGNhbWVyYS53b3JsZFRvQ2FudmFzXG4gICAgKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKTogUm91dGVQb2ludHMgfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCAhcm91dGUud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGNvbnN0IG9yaWdpbiA9IHJvdXRlLm9yaWdpbiA/PyB7IHg6IHN0YXRlLm1lPy54ID8/IDAsIHk6IHN0YXRlLm1lPy55ID8/IDAgfTtcbiAgICByZXR1cm4gYnVpbGRSb3V0ZVBvaW50cyhcbiAgICAgIG9yaWdpbixcbiAgICAgIHJvdXRlLndheXBvaW50cyxcbiAgICAgIGNhbWVyYS5nZXRXb3JsZFNpemUoKSxcbiAgICAgIGNhbWVyYS5nZXRDYW1lcmFQb3NpdGlvbixcbiAgICAgICgpID0+IHVpU3RhdGUuem9vbSxcbiAgICAgIGNhbWVyYS53b3JsZFRvQ2FudmFzXG4gICAgKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmRXYXlwb2ludEF0UG9zaXRpb24oY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludCk6IG51bWJlciB8IG51bGwge1xuICAgIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gICAgaWYgKCFyb3V0ZSkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGVHZW5lcmljKGNhbnZhc1BvaW50LCByb3V0ZSwge1xuICAgICAgd2F5cG9pbnRSYWRpdXM6IFdBWVBPSU5UX0hJVF9SQURJVVMsXG4gICAgICBsZWdIaXRUb2xlcmFuY2U6IDAsXG4gICAgfSk7XG5cbiAgICBpZiAoIWhpdCB8fCBoaXQudHlwZSAhPT0gXCJ3YXlwb2ludFwiKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gZGlzcGxheUluZGV4VG9BY3R1YWxJbmRleChoaXQuaW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGl0VGVzdFJvdXRlKGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQpOiBTZWxlY3Rpb24gfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICAgIGlmICghcm91dGUpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBoaXRUZXN0Um91dGVHZW5lcmljKGNhbnZhc1BvaW50LCByb3V0ZSwge1xuICAgICAgd2F5cG9pbnRSYWRpdXM6IFdBWVBPSU5UX0hJVF9SQURJVVMsXG4gICAgICBsZWdIaXRUb2xlcmFuY2U6IDYsXG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBoaXRUZXN0TWlzc2lsZVJvdXRlcyhjYW52YXNQb2ludDogUG9pbnRlclBvaW50KSB7XG4gICAgY29uc3Qgcm91dGVQb2ludHMgPSBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlUG9pbnRzIHx8ICFyb3V0ZSkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGVHZW5lcmljKGNhbnZhc1BvaW50LCByb3V0ZVBvaW50cywge1xuICAgICAgd2F5cG9pbnRSYWRpdXM6IFdBWVBPSU5UX0hJVF9SQURJVVMsXG4gICAgICBsZWdIaXRUb2xlcmFuY2U6IDYsXG4gICAgfSk7XG4gICAgaWYgKCFoaXQpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3Qgc2VsZWN0aW9uID1cbiAgICAgIGhpdC50eXBlID09PSBcImxlZ1wiXG4gICAgICAgID8gKHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IGhpdC5pbmRleCB9IGFzIE1pc3NpbGVTZWxlY3Rpb24pXG4gICAgICAgIDogKHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogaGl0LmluZGV4IH0gYXMgTWlzc2lsZVNlbGVjdGlvbik7XG5cbiAgICByZXR1cm4geyByb3V0ZSwgc2VsZWN0aW9uIH07XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVSb3V0ZUFuaW1hdGlvbnMoZHRTZWNvbmRzOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBzaGlwUm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgICBpZiAoc2hpcFJvdXRlICYmIHNoaXBSb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gMCAmJiB1aVN0YXRlLnNob3dTaGlwUm91dGUpIHtcbiAgICAgIHVwZGF0ZURhc2hPZmZzZXRzRm9yUm91dGUoXG4gICAgICAgIHNoaXBMZWdEYXNoT2Zmc2V0cyxcbiAgICAgICAgc2hpcFJvdXRlLndheXBvaW50cyxcbiAgICAgICAgc2hpcFJvdXRlLndvcmxkUG9pbnRzLFxuICAgICAgICBzaGlwUm91dGUuY2FudmFzUG9pbnRzLFxuICAgICAgICBkZWZhdWx0U3BlZWQsXG4gICAgICAgIGR0U2Vjb25kc1xuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2hpcExlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgfVxuXG4gICAgY29uc3QgbWlzc2lsZVJvdXRlID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICAgIGlmIChtaXNzaWxlUm91dGUpIHtcbiAgICAgIHVwZGF0ZURhc2hPZmZzZXRzRm9yUm91dGUoXG4gICAgICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyxcbiAgICAgICAgbWlzc2lsZVJvdXRlLndheXBvaW50cyxcbiAgICAgICAgbWlzc2lsZVJvdXRlLndvcmxkUG9pbnRzLFxuICAgICAgICBtaXNzaWxlUm91dGUuY2FudmFzUG9pbnRzLFxuICAgICAgICBzdGF0ZS5taXNzaWxlQ29uZmlnLnNwZWVkLFxuICAgICAgICBkdFNlY29uZHNcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmICghcm91dGVzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoIXN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSB7XG4gICAgICBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IHJvdXRlc1swXS5pZDtcbiAgICB9XG5cbiAgICBsZXQgcm91dGUgPSByb3V0ZXMuZmluZCgocikgPT4gci5pZCA9PT0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQpIHx8IG51bGw7XG4gICAgaWYgKCFyb3V0ZSkge1xuICAgICAgcm91dGUgPSByb3V0ZXNbMF0gPz8gbnVsbDtcbiAgICAgIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcm91dGU/LmlkID8/IG51bGw7XG4gICAgfVxuICAgIHJldHVybiByb3V0ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmICghcm91dGVzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKCFzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCkge1xuICAgICAgcmV0dXJuIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gKFxuICAgICAgcm91dGVzLmZpbmQoKHIpID0+IHIuaWQgPT09IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSA/P1xuICAgICAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKClcbiAgICApO1xuICB9XG5cbiAgZnVuY3Rpb24gY3ljbGVNaXNzaWxlUm91dGUoZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmICghcm91dGVzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjdXJyZW50SW5kZXggPSByb3V0ZXMuZmluZEluZGV4KFxuICAgICAgKHJvdXRlKSA9PiByb3V0ZS5pZCA9PT0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWRcbiAgICApO1xuICAgIGNvbnN0IGJhc2VJbmRleCA9IGN1cnJlbnRJbmRleCA+PSAwID8gY3VycmVudEluZGV4IDogMDtcbiAgICBjb25zdCBuZXh0SW5kZXggPVxuICAgICAgKChiYXNlSW5kZXggKyBkaXJlY3Rpb24pICUgcm91dGVzLmxlbmd0aCArIHJvdXRlcy5sZW5ndGgpICUgcm91dGVzLmxlbmd0aDtcbiAgICBjb25zdCBuZXh0Um91dGUgPSByb3V0ZXNbbmV4dEluZGV4XTtcbiAgICBpZiAoIW5leHRSb3V0ZSkgcmV0dXJuO1xuICAgIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dFJvdXRlLmlkO1xuICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJzZXRfYWN0aXZlX21pc3NpbGVfcm91dGVcIixcbiAgICAgIHJvdXRlX2lkOiBuZXh0Um91dGUuaWQsXG4gICAgfSk7XG4gICAgYnVzLmVtaXQoXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLCB7IHJvdXRlSWQ6IG5leHRSb3V0ZS5pZCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGN5Y2xlU2hpcFNlbGVjdGlvbihkaXJlY3Rpb246IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHdwcyA9IHN0YXRlLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGUubWUud2F5cG9pbnRzKSA/IHN0YXRlLm1lLndheXBvaW50cyA6IFtdO1xuICAgIGlmICghd3BzLmxlbmd0aCkge1xuICAgICAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgaW5kZXggPSBzZWxlY3Rpb24gPyBzZWxlY3Rpb24uaW5kZXggOiBkaXJlY3Rpb24gPiAwID8gLTEgOiB3cHMubGVuZ3RoO1xuICAgIGluZGV4ICs9IGRpcmVjdGlvbjtcbiAgICBpZiAoaW5kZXggPCAwKSBpbmRleCA9IHdwcy5sZW5ndGggLSAxO1xuICAgIGlmIChpbmRleCA+PSB3cHMubGVuZ3RoKSBpbmRleCA9IDA7XG4gICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXggfSk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhclNoaXBSb3V0ZSgpOiB2b2lkIHtcbiAgICBjb25zdCB3cHMgPVxuICAgICAgc3RhdGUubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpID8gc3RhdGUubWUud2F5cG9pbnRzIDogW107XG4gICAgaWYgKCF3cHMubGVuZ3RoKSByZXR1cm47XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImNsZWFyX3dheXBvaW50c1wiIH0pO1xuICAgIGlmIChzdGF0ZS5tZSkge1xuICAgICAgc3RhdGUubWUud2F5cG9pbnRzID0gW107XG4gICAgfVxuICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgICBidXMuZW1pdChcInNoaXA6d2F5cG9pbnRzQ2xlYXJlZFwiKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk6IHZvaWQge1xuICAgIGlmICghc2VsZWN0aW9uKSByZXR1cm47XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRlbGV0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICAgIGlmIChzdGF0ZS5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlLm1lLndheXBvaW50cykpIHtcbiAgICAgIHN0YXRlLm1lLndheXBvaW50cyA9IHN0YXRlLm1lLndheXBvaW50cy5zbGljZSgwLCBzZWxlY3Rpb24uaW5kZXgpO1xuICAgIH1cbiAgICBidXMuZW1pdChcInNoaXA6d2F5cG9pbnREZWxldGVkXCIsIHsgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCB9KTtcbiAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIH1cblxuICBmdW5jdGlvbiBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpOiB2b2lkIHtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUgfHwgIW1pc3NpbGVTZWxlY3Rpb24pIHJldHVybjtcbiAgICBjb25zdCBpbmRleCA9IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXg7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJkZWxldGVfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgaW5kZXgsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gW1xuICAgICAgLi4ucm91dGUud2F5cG9pbnRzLnNsaWNlKDAsIGluZGV4KSxcbiAgICAgIC4uLnJvdXRlLndheXBvaW50cy5zbGljZShpbmRleCArIDEpLFxuICAgIF07XG4gICAgYnVzLmVtaXQoXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleCB9KTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICB9XG5cbiAgZnVuY3Rpb24gbGF1bmNoQWN0aXZlTWlzc2lsZVJvdXRlKCk6IHZvaWQge1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZygpID4gMC4wNSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHBsYXllciBoYXMgbWlzc2lsZXMgaW4gaW52ZW50b3J5XG4gICAgbGV0IGhhc01pc3NpbGVzID0gZmFsc2U7XG4gICAgaWYgKHN0YXRlLmludmVudG9yeT8uaXRlbXMpIHtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBzdGF0ZS5pbnZlbnRvcnkuaXRlbXMpIHtcbiAgICAgICAgaWYgKGl0ZW0udHlwZSA9PT0gXCJtaXNzaWxlXCIgJiYgaXRlbS5xdWFudGl0eSA+IDApIHtcbiAgICAgICAgICBoYXNNaXNzaWxlcyA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFoYXNNaXNzaWxlcykge1xuICAgICAgY29uc29sZS5sb2coXCJObyBtaXNzaWxlcyBhdmFpbGFibGUgLSBjcmFmdCBtaXNzaWxlcyBmaXJzdFwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJsYXVuY2hfbWlzc2lsZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlU2hpcFBvaW50ZXIoXG4gICAgY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludCxcbiAgICB3b3JsZFBvaW50OiBQb2ludGVyUG9pbnRcbiAgKTogdm9pZCB7XG4gICAgaWYgKCFzdGF0ZS5tZSkgcmV0dXJuO1xuICAgIGlmICh1aVN0YXRlLnNoaXBUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGUoY2FudmFzUG9pbnQpO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBjb25zdCBhY3R1YWxJbmRleCA9IGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoaGl0LmluZGV4KTtcbiAgICAgICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogaGl0LnR5cGUsIGluZGV4OiBhY3R1YWxJbmRleCB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkOiBkZWZhdWx0U3BlZWQgfTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImFkZF93YXlwb2ludFwiLFxuICAgICAgeDogd3AueCxcbiAgICAgIHk6IHdwLnksXG4gICAgICBzcGVlZDogZGVmYXVsdFNwZWVkLFxuICAgIH0pO1xuICAgIGNvbnN0IHdwcyA9IEFycmF5LmlzQXJyYXkoc3RhdGUubWUud2F5cG9pbnRzKVxuICAgICAgPyBzdGF0ZS5tZS53YXlwb2ludHMuc2xpY2UoKVxuICAgICAgOiBbXTtcbiAgICB3cHMucHVzaCh3cCk7XG4gICAgc3RhdGUubWUud2F5cG9pbnRzID0gd3BzO1xuICAgIGJ1cy5lbWl0KFwic2hpcDp3YXlwb2ludEFkZGVkXCIsIHsgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1pc3NpbGVQb2ludGVyKFxuICAgIGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQsXG4gICAgd29ybGRQb2ludDogUG9pbnRlclBvaW50XG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSkgcmV0dXJuO1xuXG4gICAgaWYgKHVpU3RhdGUubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RNaXNzaWxlUm91dGVzKGNhbnZhc1BvaW50KTtcbiAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgc2V0TWlzc2lsZVNlbGVjdGlvbihoaXQuc2VsZWN0aW9uLCBoaXQucm91dGUuaWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzcGVlZCA9IGdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQoKTtcbiAgICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkIH07XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJhZGRfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgeDogd3AueCxcbiAgICAgIHk6IHdwLnksXG4gICAgICBzcGVlZDogd3Auc3BlZWQsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gcm91dGUud2F5cG9pbnRzID8gWy4uLnJvdXRlLndheXBvaW50cywgd3BdIDogW3dwXTtcbiAgICByZWNvcmRNaXNzaWxlTGVnU3BlZWQoc3BlZWQpO1xuICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCwgcm91dGUuaWQpO1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHtcbiAgICAgIHJvdXRlSWQ6IHJvdXRlLmlkLFxuICAgICAgaW5kZXg6IHJvdXRlLndheXBvaW50cy5sZW5ndGggLSAxLFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gYmVnaW5TaGlwRHJhZyhpbmRleDogbnVtYmVyLCBfb3JpZ2luOiBQb2ludGVyUG9pbnQpOiB2b2lkIHtcbiAgICBkcmFnZ2VkV2F5cG9pbnQgPSBpbmRleDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJlZ2luTWlzc2lsZURyYWcoaW5kZXg6IG51bWJlciwgX29yaWdpbjogUG9pbnRlclBvaW50KTogdm9pZCB7XG4gICAgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA9IGluZGV4O1xuICB9XG5cbiAgZnVuY3Rpb24gY2xhbXBUb1dvcmxkKHBvaW50OiBQb2ludGVyUG9pbnQpOiBQb2ludGVyUG9pbnQge1xuICAgIGNvbnN0IHdvcmxkVyA9IHN0YXRlLndvcmxkTWV0YS53ID8/IDQwMDA7XG4gICAgY29uc3Qgd29ybGRIID0gc3RhdGUud29ybGRNZXRhLmggPz8gNDAwMDtcbiAgICByZXR1cm4ge1xuICAgICAgeDogY2xhbXAocG9pbnQueCwgMCwgd29ybGRXKSxcbiAgICAgIHk6IGNsYW1wKHBvaW50LnksIDAsIHdvcmxkSCksXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVNoaXBEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQge1xuICAgIGlmIChkcmFnZ2VkV2F5cG9pbnQgPT09IG51bGwpIHJldHVybjtcbiAgICBjb25zdCBjbGFtcGVkID0gY2xhbXBUb1dvcmxkKHdvcmxkUG9pbnQpO1xuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwibW92ZV93YXlwb2ludFwiLFxuICAgICAgaW5kZXg6IGRyYWdnZWRXYXlwb2ludCxcbiAgICAgIHg6IGNsYW1wZWQueCxcbiAgICAgIHk6IGNsYW1wZWQueSxcbiAgICB9KTtcbiAgICBpZiAoc3RhdGUubWUgJiYgc3RhdGUubWUud2F5cG9pbnRzICYmIGRyYWdnZWRXYXlwb2ludCA8IHN0YXRlLm1lLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHN0YXRlLm1lLndheXBvaW50c1tkcmFnZ2VkV2F5cG9pbnRdLnggPSBjbGFtcGVkLng7XG4gICAgICBzdGF0ZS5tZS53YXlwb2ludHNbZHJhZ2dlZFdheXBvaW50XS55ID0gY2xhbXBlZC55O1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQge1xuICAgIGlmIChkcmFnZ2VkTWlzc2lsZVdheXBvaW50ID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlIHx8ICFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykpIHJldHVybjtcbiAgICBjb25zdCBjbGFtcGVkID0gY2xhbXBUb1dvcmxkKHdvcmxkUG9pbnQpO1xuICAgIGlmIChkcmFnZ2VkTWlzc2lsZVdheXBvaW50ID49IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHJldHVybjtcblxuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwibW92ZV9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgICBpbmRleDogZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCxcbiAgICAgIHg6IGNsYW1wZWQueCxcbiAgICAgIHk6IGNsYW1wZWQueSxcbiAgICB9KTtcblxuICAgIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cy5tYXAoKHdwLCBpZHgpID0+XG4gICAgICBpZHggPT09IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPyB7IC4uLndwLCB4OiBjbGFtcGVkLngsIHk6IGNsYW1wZWQueSB9IDogd3BcbiAgICApO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5kRHJhZygpOiB2b2lkIHtcbiAgICBpZiAoZHJhZ2dlZFdheXBvaW50ICE9PSBudWxsICYmIHN0YXRlLm1lPy53YXlwb2ludHMpIHtcbiAgICAgIGNvbnN0IHdwID0gc3RhdGUubWUud2F5cG9pbnRzW2RyYWdnZWRXYXlwb2ludF07XG4gICAgICBpZiAod3ApIHtcbiAgICAgICAgYnVzLmVtaXQoXCJzaGlwOndheXBvaW50TW92ZWRcIiwge1xuICAgICAgICAgIGluZGV4OiBkcmFnZ2VkV2F5cG9pbnQsXG4gICAgICAgICAgeDogd3AueCxcbiAgICAgICAgICB5OiB3cC55LFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCAhPT0gbnVsbCkge1xuICAgICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgIGlmIChyb3V0ZSAmJiByb3V0ZS53YXlwb2ludHMgJiYgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA8IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgICAgY29uc3Qgd3AgPSByb3V0ZS53YXlwb2ludHNbZHJhZ2dlZE1pc3NpbGVXYXlwb2ludF07XG4gICAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludE1vdmVkXCIsIHtcbiAgICAgICAgICByb3V0ZUlkOiByb3V0ZS5pZCxcbiAgICAgICAgICBpbmRleDogZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCxcbiAgICAgICAgICB4OiB3cC54LFxuICAgICAgICAgIHk6IHdwLnksXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRyYWdnZWRXYXlwb2ludCA9IG51bGw7XG4gICAgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBnZXREcmFnZ2VkV2F5cG9pbnQoKTogbnVtYmVyIHwgbnVsbCB7XG4gICAgcmV0dXJuIGRyYWdnZWRXYXlwb2ludDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldERyYWdnZWRNaXNzaWxlV2F5cG9pbnQoKTogbnVtYmVyIHwgbnVsbCB7XG4gICAgcmV0dXJuIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQ7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTogbnVtYmVyIHtcbiAgICBjb25zdCByZW1haW5pbmcgPSBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpO1xuICAgIHJldHVybiByZW1haW5pbmcgPiAwID8gcmVtYWluaW5nIDogMDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2V0U2VsZWN0aW9uLFxuICAgIHNldFNlbGVjdGlvbixcbiAgICBnZXRNaXNzaWxlU2VsZWN0aW9uLFxuICAgIHNldE1pc3NpbGVTZWxlY3Rpb24sXG4gICAgZ2V0RGVmYXVsdFNoaXBTcGVlZCxcbiAgICBzZXREZWZhdWx0U2hpcFNwZWVkLFxuICAgIGdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQsXG4gICAgcmVjb3JkTWlzc2lsZUxlZ1NwZWVkLFxuICAgIGdldFNoaXBXYXlwb2ludE9mZnNldCxcbiAgICBkaXNwbGF5SW5kZXhUb0FjdHVhbEluZGV4LFxuICAgIGFjdHVhbEluZGV4VG9EaXNwbGF5SW5kZXgsXG4gICAgY29tcHV0ZVJvdXRlUG9pbnRzLFxuICAgIGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMsXG4gICAgZmluZFdheXBvaW50QXRQb3NpdGlvbixcbiAgICBoaXRUZXN0Um91dGUsXG4gICAgaGl0VGVzdE1pc3NpbGVSb3V0ZXMsXG4gICAgc2hpcExlZ0Rhc2hPZmZzZXRzLFxuICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyxcbiAgICB1cGRhdGVSb3V0ZUFuaW1hdGlvbnMsXG4gICAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlLFxuICAgIGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSxcbiAgICBjeWNsZU1pc3NpbGVSb3V0ZSxcbiAgICBjeWNsZVNoaXBTZWxlY3Rpb24sXG4gICAgY2xlYXJTaGlwUm91dGUsXG4gICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQsXG4gICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQsXG4gICAgbGF1bmNoQWN0aXZlTWlzc2lsZVJvdXRlLFxuICAgIGhhbmRsZVNoaXBQb2ludGVyLFxuICAgIGhhbmRsZU1pc3NpbGVQb2ludGVyLFxuICAgIGJlZ2luU2hpcERyYWcsXG4gICAgYmVnaW5NaXNzaWxlRHJhZyxcbiAgICB1cGRhdGVTaGlwRHJhZyxcbiAgICB1cGRhdGVNaXNzaWxlRHJhZyxcbiAgICBlbmREcmFnLFxuICAgIGdldERyYWdnZWRXYXlwb2ludCxcbiAgICBnZXREcmFnZ2VkTWlzc2lsZVdheXBvaW50LFxuICAgIGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZyxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBVSVN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBNSVNTSUxFX1BBTEVUVEUsIFNISVBfUEFMRVRURSwgZHJhd1BsYW5uZWRSb3V0ZSB9IGZyb20gXCIuLi9yb3V0ZVwiO1xuaW1wb3J0IHR5cGUgeyBDYW1lcmEgfSBmcm9tIFwiLi9jYW1lcmFcIjtcbmltcG9ydCB0eXBlIHsgTG9naWMgfSBmcm9tIFwiLi9sb2dpY1wiO1xuXG5pbnRlcmZhY2UgUmVuZGVyRGVwZW5kZW5jaWVzIHtcbiAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgY2FtZXJhOiBDYW1lcmE7XG4gIGxvZ2ljOiBMb2dpYztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZW5kZXJlciB7XG4gIGRyYXdTY2VuZSgpOiB2b2lkO1xuICBkcmF3R3JpZCgpOiB2b2lkO1xuICBkcmF3QmVhY29ucygpOiB2b2lkO1xuICBkcmF3U2hpcCh4OiBudW1iZXIsIHk6IG51bWJlciwgdng6IG51bWJlciwgdnk6IG51bWJlciwgY29sb3I6IHN0cmluZywgZmlsbGVkOiBib29sZWFuKTogdm9pZDtcbiAgZHJhd0dob3N0RG90KHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZDtcbiAgZHJhd1JvdXRlKCk6IHZvaWQ7XG4gIGRyYXdNaXNzaWxlUm91dGUoKTogdm9pZDtcbiAgZHJhd01pc3NpbGVzKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZW5kZXJlcih7XG4gIGNhbnZhcyxcbiAgY3R4LFxuICBzdGF0ZSxcbiAgdWlTdGF0ZSxcbiAgY2FtZXJhLFxuICBsb2dpYyxcbn06IFJlbmRlckRlcGVuZGVuY2llcyk6IFJlbmRlcmVyIHtcbiAgZnVuY3Rpb24gZHJhd1NoaXAoXG4gICAgeDogbnVtYmVyLFxuICAgIHk6IG51bWJlcixcbiAgICB2eDogbnVtYmVyLFxuICAgIHZ5OiBudW1iZXIsXG4gICAgY29sb3I6IHN0cmluZyxcbiAgICBmaWxsZWQ6IGJvb2xlYW5cbiAgKTogdm9pZCB7XG4gICAgY29uc3QgcCA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeCwgeSB9KTtcbiAgICBjb25zdCByID0gMTA7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHgudHJhbnNsYXRlKHAueCwgcC55KTtcbiAgICBjb25zdCBhbmdsZSA9IE1hdGguYXRhbjIodnksIHZ4KTtcbiAgICBjdHgucm90YXRlKGFuZ2xlKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhyLCAwKTtcbiAgICBjdHgubGluZVRvKC1yICogMC43LCByICogMC42KTtcbiAgICBjdHgubGluZVRvKC1yICogMC40LCAwKTtcbiAgICBjdHgubGluZVRvKC1yICogMC43LCAtciAqIDAuNik7XG4gICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGNvbG9yO1xuICAgIGlmIChmaWxsZWQpIHtcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBgJHtjb2xvcn1jY2A7XG4gICAgICBjdHguZmlsbCgpO1xuICAgIH1cbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdHaG9zdERvdCh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHAgPSBjYW1lcmEud29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMocC54LCBwLnksIDMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gXCIjY2NjY2NjYWFcIjtcbiAgICBjdHguZmlsbCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gZHJhd1JvdXRlKCk6IHZvaWQge1xuICAgIGlmICghc3RhdGUubWUpIHJldHVybjtcbiAgICBjb25zdCByb3V0ZSA9IGxvZ2ljLmNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICAgIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgY29uc3QgaGVhdCA9IHN0YXRlLm1lLmhlYXQ7XG4gICAgY29uc3QgaGVhdFBhcmFtcyA9IGhlYXRcbiAgICAgID8ge1xuICAgICAgICAgIG1hcmtlclNwZWVkOiBoZWF0Lm1hcmtlclNwZWVkLFxuICAgICAgICAgIGtVcDogaGVhdC5rVXAsXG4gICAgICAgICAga0Rvd246IGhlYXQua0Rvd24sXG4gICAgICAgICAgZXhwOiBoZWF0LmV4cCxcbiAgICAgICAgICBtYXg6IGhlYXQubWF4LFxuICAgICAgICAgIG92ZXJoZWF0QXQ6IGhlYXQub3ZlcmhlYXRBdCxcbiAgICAgICAgICB3YXJuQXQ6IGhlYXQud2FybkF0LFxuICAgICAgICB9XG4gICAgICA6IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGN1cnJlbnRTZWxlY3Rpb24gPSBsb2dpYy5nZXRTZWxlY3Rpb24oKTtcbiAgICBjb25zdCBkaXNwbGF5U2VsZWN0aW9uID0gY3VycmVudFNlbGVjdGlvblxuICAgICAgPyB7XG4gICAgICAgICAgdHlwZTogY3VycmVudFNlbGVjdGlvbi50eXBlLFxuICAgICAgICAgIGluZGV4OiBsb2dpYy5hY3R1YWxJbmRleFRvRGlzcGxheUluZGV4KGN1cnJlbnRTZWxlY3Rpb24uaW5kZXgpLFxuICAgICAgICB9XG4gICAgICA6IG51bGw7XG4gICAgY29uc3QgdmFsaWRTZWxlY3Rpb24gPVxuICAgICAgZGlzcGxheVNlbGVjdGlvbiAmJiBkaXNwbGF5U2VsZWN0aW9uLmluZGV4ID49IDAgPyBkaXNwbGF5U2VsZWN0aW9uIDogbnVsbDtcblxuICAgIGNvbnN0IGRyYWdnZWQgPSBsb2dpYy5nZXREcmFnZ2VkV2F5cG9pbnQoKTtcbiAgICBjb25zdCBkaXNwbGF5RHJhZ2dlZCA9XG4gICAgICBkcmFnZ2VkICE9PSBudWxsID8gbG9naWMuYWN0dWFsSW5kZXhUb0Rpc3BsYXlJbmRleChkcmFnZ2VkKSA6IG51bGw7XG4gICAgY29uc3QgdmFsaWREcmFnZ2VkID1cbiAgICAgIGRpc3BsYXlEcmFnZ2VkICE9PSBudWxsICYmIGRpc3BsYXlEcmFnZ2VkID49IDAgPyBkaXNwbGF5RHJhZ2dlZCA6IG51bGw7XG5cbiAgICBkcmF3UGxhbm5lZFJvdXRlKGN0eCwge1xuICAgICAgcm91dGVQb2ludHM6IHJvdXRlLFxuICAgICAgc2VsZWN0aW9uOiB2YWxpZFNlbGVjdGlvbixcbiAgICAgIGRyYWdnZWRXYXlwb2ludDogdmFsaWREcmFnZ2VkLFxuICAgICAgZGFzaFN0b3JlOiBsb2dpYy5zaGlwTGVnRGFzaE9mZnNldHMsXG4gICAgICBwYWxldHRlOiBTSElQX1BBTEVUVEUsXG4gICAgICBzaG93TGVnczogdWlTdGF0ZS5zaG93U2hpcFJvdXRlLFxuICAgICAgaGVhdFBhcmFtcyxcbiAgICAgIGluaXRpYWxIZWF0OiBoZWF0Py52YWx1ZSA/PyAwLFxuICAgICAgZGVmYXVsdFNwZWVkOiBsb2dpYy5nZXREZWZhdWx0U2hpcFNwZWVkKCksXG4gICAgICB3b3JsZFBvaW50czogcm91dGUud29ybGRQb2ludHMsXG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBkcmF3TWlzc2lsZVJvdXRlKCk6IHZvaWQge1xuICAgIGlmICghc3RhdGUubWUpIHJldHVybjtcbiAgICBpZiAodWlTdGF0ZS5pbnB1dENvbnRleHQgIT09IFwibWlzc2lsZVwiKSByZXR1cm47XG4gICAgY29uc3Qgcm91dGUgPSBsb2dpYy5jb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgICBjb25zdCBoZWF0UGFyYW1zID0gc3RhdGUubWlzc2lsZUNvbmZpZy5oZWF0UGFyYW1zO1xuICAgIGNvbnN0IG1pc3NpbGVTZWxlY3Rpb24gPSBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCk7XG4gICAgY29uc3QgZ2VuZXJpY1NlbGVjdGlvbiA9XG4gICAgICBtaXNzaWxlU2VsZWN0aW9uICYmIG1pc3NpbGVTZWxlY3Rpb24udHlwZSA9PT0gXCJsZWdcIlxuICAgICAgICA/IHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggfVxuICAgICAgICA6IG1pc3NpbGVTZWxlY3Rpb24gJiYgbWlzc2lsZVNlbGVjdGlvbi50eXBlID09PSBcIndheXBvaW50XCJcbiAgICAgICAgPyB7IHR5cGU6IFwid2F5cG9pbnRcIiwgaW5kZXg6IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggfVxuICAgICAgICA6IG51bGw7XG5cbiAgICBkcmF3UGxhbm5lZFJvdXRlKGN0eCwge1xuICAgICAgcm91dGVQb2ludHM6IHJvdXRlLFxuICAgICAgc2VsZWN0aW9uOiBnZW5lcmljU2VsZWN0aW9uLFxuICAgICAgZHJhZ2dlZFdheXBvaW50OiBudWxsLFxuICAgICAgZGFzaFN0b3JlOiBsb2dpYy5taXNzaWxlTGVnRGFzaE9mZnNldHMsXG4gICAgICBwYWxldHRlOiBNSVNTSUxFX1BBTEVUVEUsXG4gICAgICBzaG93TGVnczogdHJ1ZSxcbiAgICAgIGhlYXRQYXJhbXMsXG4gICAgICBpbml0aWFsSGVhdDogMCxcbiAgICAgIGRlZmF1bHRTcGVlZDogc3RhdGUubWlzc2lsZUNvbmZpZy5zcGVlZCxcbiAgICAgIHdvcmxkUG9pbnRzOiByb3V0ZS53b3JsZFBvaW50cyxcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdNaXNzaWxlcygpOiB2b2lkIHtcbiAgICBpZiAoIXN0YXRlLm1pc3NpbGVzIHx8IHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgIGNvbnN0IHdvcmxkID0gY2FtZXJhLmdldFdvcmxkU2l6ZSgpO1xuICAgIGNvbnN0IHNjYWxlWCA9IGNhbnZhcy53aWR0aCAvIHdvcmxkLnc7XG4gICAgY29uc3Qgc2NhbGVZID0gY2FudmFzLmhlaWdodCAvIHdvcmxkLmg7XG4gICAgY29uc3QgcmFkaXVzU2NhbGUgPSAoc2NhbGVYICsgc2NhbGVZKSAvIDI7XG4gICAgZm9yIChjb25zdCBtaXNzIG9mIHN0YXRlLm1pc3NpbGVzKSB7XG4gICAgICBjb25zdCBwID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4OiBtaXNzLngsIHk6IG1pc3MueSB9KTtcbiAgICAgIGNvbnN0IHNlbGZPd25lZCA9IEJvb2xlYW4obWlzcy5zZWxmKTtcbiAgICAgIGN0eC5zYXZlKCk7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHguYXJjKHAueCwgcC55LCBzZWxmT3duZWQgPyA2IDogNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgY3R4LmZpbGxTdHlsZSA9IHNlbGZPd25lZCA/IFwiI2Y4NzE3MVwiIDogXCIjZmNhNWE1XCI7XG4gICAgICBjdHguZ2xvYmFsQWxwaGEgPSBzZWxmT3duZWQgPyAwLjk1IDogMC44O1xuICAgICAgY3R4LmZpbGwoKTtcbiAgICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgICBjdHgubGluZVdpZHRoID0gMS41O1xuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMTExODI3XCI7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgICBpZiAoc2VsZk93bmVkICYmIG1pc3MuYWdyb19yYWRpdXMgPiAwKSB7XG4gICAgICAgIGN0eC5zYXZlKCk7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY29uc3QgckNhbnZhcyA9IG1pc3MuYWdyb19yYWRpdXMgKiByYWRpdXNTY2FsZTtcbiAgICAgICAgY3R4LnNldExpbmVEYXNoKFsxNCwgMTBdKTtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJyZ2JhKDI0OCwxMTMsMTEzLDAuMzUpXCI7XG4gICAgICAgIGN0eC5saW5lV2lkdGggPSAxLjI7XG4gICAgICAgIGN0eC5hcmMocC54LCBwLnksIHJDYW52YXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgICBjdHgucmVzdG9yZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdHcmlkKCk6IHZvaWQge1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMjM0XCI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDE7XG5cbiAgICBjb25zdCB6b29tID0gdWlTdGF0ZS56b29tO1xuICAgIGxldCBzdGVwID0gMTAwMDtcbiAgICBpZiAoem9vbSA8IDAuNykge1xuICAgICAgc3RlcCA9IDIwMDA7XG4gICAgfSBlbHNlIGlmICh6b29tID4gMS41KSB7XG4gICAgICBzdGVwID0gNTAwO1xuICAgIH0gZWxzZSBpZiAoem9vbSA+IDIuNSkge1xuICAgICAgc3RlcCA9IDI1MDtcbiAgICB9XG5cbiAgICBjb25zdCBjYW1lcmFQb3MgPSBjYW1lcmEuZ2V0Q2FtZXJhUG9zaXRpb24oKTtcbiAgICBjb25zdCB3b3JsZCA9IGNhbWVyYS5nZXRXb3JsZFNpemUoKTtcbiAgICBjb25zdCBzY2FsZVggPSBjYW52YXMud2lkdGggLyB3b3JsZC53O1xuICAgIGNvbnN0IHNjYWxlWSA9IGNhbnZhcy5oZWlnaHQgLyB3b3JsZC5oO1xuICAgIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcbiAgICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY2FudmFzLndpZHRoIC8gc2NhbGU7XG4gICAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjYW52YXMuaGVpZ2h0IC8gc2NhbGU7XG5cbiAgICBjb25zdCBtaW5YID0gTWF0aC5tYXgoMCwgY2FtZXJhUG9zLnggLSB2aWV3cG9ydFdpZHRoIC8gMik7XG4gICAgY29uc3QgbWF4WCA9IE1hdGgubWluKHdvcmxkLncsIGNhbWVyYVBvcy54ICsgdmlld3BvcnRXaWR0aCAvIDIpO1xuICAgIGNvbnN0IG1pblkgPSBNYXRoLm1heCgwLCBjYW1lcmFQb3MueSAtIHZpZXdwb3J0SGVpZ2h0IC8gMik7XG4gICAgY29uc3QgbWF4WSA9IE1hdGgubWluKHdvcmxkLmgsIGNhbWVyYVBvcy55ICsgdmlld3BvcnRIZWlnaHQgLyAyKTtcblxuICAgIGNvbnN0IHN0YXJ0WCA9IE1hdGguZmxvb3IobWluWCAvIHN0ZXApICogc3RlcDtcbiAgICBjb25zdCBlbmRYID0gTWF0aC5jZWlsKG1heFggLyBzdGVwKSAqIHN0ZXA7XG4gICAgY29uc3Qgc3RhcnRZID0gTWF0aC5mbG9vcihtaW5ZIC8gc3RlcCkgKiBzdGVwO1xuICAgIGNvbnN0IGVuZFkgPSBNYXRoLmNlaWwobWF4WSAvIHN0ZXApICogc3RlcDtcblxuICAgIGZvciAobGV0IHggPSBzdGFydFg7IHggPD0gZW5kWDsgeCArPSBzdGVwKSB7XG4gICAgICBjb25zdCBhID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4LCB5OiBNYXRoLm1heCgwLCBtaW5ZKSB9KTtcbiAgICAgIGNvbnN0IGIgPSBjYW1lcmEud29ybGRUb0NhbnZhcyh7IHgsIHk6IE1hdGgubWluKHdvcmxkLmgsIG1heFkpIH0pO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4Lm1vdmVUbyhhLngsIGEueSk7XG4gICAgICBjdHgubGluZVRvKGIueCwgYi55KTtcbiAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCB5ID0gc3RhcnRZOyB5IDw9IGVuZFk7IHkgKz0gc3RlcCkge1xuICAgICAgY29uc3QgYSA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeDogTWF0aC5tYXgoMCwgbWluWCksIHkgfSk7XG4gICAgICBjb25zdCBiID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4OiBNYXRoLm1pbih3b3JsZC53LCBtYXhYKSwgeSB9KTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5tb3ZlVG8oYS54LCBhLnkpO1xuICAgICAgY3R4LmxpbmVUbyhiLngsIGIueSk7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBkcmF3QmVhY29ucygpOiB2b2lkIHtcbiAgICBjb25zdCBtaXNzaW9uID0gc3RhdGUubWlzc2lvbjtcbiAgICBpZiAoIW1pc3Npb24gfHwgIW1pc3Npb24uYWN0aXZlIHx8IG1pc3Npb24uYmVhY29ucy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB3b3JsZCA9IGNhbWVyYS5nZXRXb3JsZFNpemUoKTtcbiAgICBjb25zdCBzY2FsZSA9IE1hdGgubWluKGNhbnZhcy53aWR0aCAvIHdvcmxkLncsIGNhbnZhcy5oZWlnaHQgLyB3b3JsZC5oKSAqIHVpU3RhdGUuem9vbTtcbiAgICBjb25zdCBtZSA9IHN0YXRlLm1lO1xuICAgIGNvbnN0IGhvbGRSZXF1aXJlZCA9IG1pc3Npb24uaG9sZFJlcXVpcmVkIHx8IDEwO1xuXG4gICAgbWlzc2lvbi5iZWFjb25zLmZvckVhY2goKGJlYWNvbiwgaW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IGNlbnRlciA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeDogYmVhY29uLmN4LCB5OiBiZWFjb24uY3kgfSk7XG4gICAgICBjb25zdCBlZGdlID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4OiBiZWFjb24uY3ggKyBiZWFjb24ucmFkaXVzLCB5OiBiZWFjb24uY3kgfSk7XG4gICAgICBjb25zdCByYWRpdXMgPSBNYXRoLmh5cG90KGVkZ2UueCAtIGNlbnRlci54LCBlZGdlLnkgLSBjZW50ZXIueSk7XG4gICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShyYWRpdXMpIHx8IHJhZGl1cyA8PSAwLjUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBpc0xvY2tlZCA9IGluZGV4IDwgbWlzc2lvbi5iZWFjb25JbmRleDtcbiAgICAgIGNvbnN0IGlzQWN0aXZlID0gaW5kZXggPT09IG1pc3Npb24uYmVhY29uSW5kZXg7XG4gICAgICBjb25zdCBiYXNlTGluZVdpZHRoID0gTWF0aC5tYXgoMS41LCAyLjUgKiBNYXRoLm1pbigxLCBzY2FsZSAqIDEuMikpO1xuICAgICAgY29uc3Qgc3Ryb2tlU3R5bGUgPSBpc0xvY2tlZFxuICAgICAgICA/IFwicmdiYSg3NCwyMjIsMTI4LDAuODUpXCJcbiAgICAgICAgOiBpc0FjdGl2ZVxuICAgICAgICA/IFwicmdiYSg1NiwxODksMjQ4LDAuOTUpXCJcbiAgICAgICAgOiBcInJnYmEoMTQ4LDE2MywxODQsMC42NSlcIjtcblxuICAgICAgY3R4LnNhdmUoKTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5zZXRMaW5lRGFzaChpc0FjdGl2ZSA/IFtdIDogWzEwLCAxMl0pO1xuICAgICAgY3R4LmxpbmVXaWR0aCA9IGlzQWN0aXZlID8gYmFzZUxpbmVXaWR0aCAqIDEuNCA6IGJhc2VMaW5lV2lkdGg7XG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHJva2VTdHlsZTtcbiAgICAgIGN0eC5nbG9iYWxBbHBoYSA9IGlzTG9ja2VkID8gMC45IDogMC44O1xuICAgICAgY3R4LmFyYyhjZW50ZXIueCwgY2VudGVyLnksIHJhZGl1cywgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuXG4gICAgICBjb25zdCBpbnNpZGUgPVxuICAgICAgICBpc0FjdGl2ZSAmJiBtZVxuICAgICAgICAgID8gKCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZHggPSBtZS54IC0gYmVhY29uLmN4O1xuICAgICAgICAgICAgICBjb25zdCBkeSA9IG1lLnkgLSBiZWFjb24uY3k7XG4gICAgICAgICAgICAgIHJldHVybiBkeCAqIGR4ICsgZHkgKiBkeSA8PSBiZWFjb24ucmFkaXVzICogYmVhY29uLnJhZGl1cztcbiAgICAgICAgICAgIH0pKClcbiAgICAgICAgICA6IGZhbHNlO1xuXG4gICAgICBpZiAoaW5zaWRlKSB7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSg1NiwxODksMjQ4LDAuMTIpXCI7XG4gICAgICAgIGN0eC5hcmMoY2VudGVyLngsIGNlbnRlci55LCByYWRpdXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgICAgY3R4LmZpbGwoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGlzQWN0aXZlKSB7XG4gICAgICAgIGNvbnN0IHByb2dyZXNzID0gaG9sZFJlcXVpcmVkID4gMCA/IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIG1pc3Npb24uaG9sZEFjY3VtIC8gaG9sZFJlcXVpcmVkKSkgOiAwO1xuICAgICAgICBpZiAocHJvZ3Jlc3MgPiAwKSB7XG4gICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSg1NiwxODksMjQ4LDAuOTUpXCI7XG4gICAgICAgICAgY3R4LmxpbmVXaWR0aCA9IE1hdGgubWF4KGJhc2VMaW5lV2lkdGggKiAxLjgsIDIpO1xuICAgICAgICAgIGN0eC5zZXRMaW5lRGFzaChbXSk7XG4gICAgICAgICAgY3R4LmFyYyhjZW50ZXIueCwgY2VudGVyLnksIHJhZGl1cywgLU1hdGguUEkgLyAyLCAtTWF0aC5QSSAvIDIgKyBwcm9ncmVzcyAqIE1hdGguUEkgKiAyKTtcbiAgICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGlzTG9ja2VkKSB7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSg3NCwyMjIsMTI4LDAuNzUpXCI7XG4gICAgICAgIGN0eC5hcmMoY2VudGVyLngsIGNlbnRlci55LCBNYXRoLm1heCg0LCByYWRpdXMgKiAwLjA1KSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgICBjdHguZmlsbCgpO1xuICAgICAgfVxuXG4gICAgICBjdHgucmVzdG9yZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZHJhd1NjZW5lKCk6IHZvaWQge1xuICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcbiAgICBkcmF3R3JpZCgpO1xuICAgIGRyYXdCZWFjb25zKCk7XG4gICAgZHJhd1JvdXRlKCk7XG4gICAgZHJhd01pc3NpbGVSb3V0ZSgpO1xuICAgIGRyYXdNaXNzaWxlcygpO1xuXG4gICAgZm9yIChjb25zdCBnIG9mIHN0YXRlLmdob3N0cykge1xuICAgICAgZHJhd1NoaXAoZy54LCBnLnksIGcudngsIGcudnksIFwiIzljYTNhZlwiLCBmYWxzZSk7XG4gICAgICBkcmF3R2hvc3REb3QoZy54LCBnLnkpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUubWUpIHtcbiAgICAgIGRyYXdTaGlwKHN0YXRlLm1lLngsIHN0YXRlLm1lLnksIHN0YXRlLm1lLnZ4LCBzdGF0ZS5tZS52eSwgXCIjMjJkM2VlXCIsIHRydWUpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZHJhd1NjZW5lLFxuICAgIGRyYXdHcmlkLFxuICAgIGRyYXdCZWFjb25zLFxuICAgIGRyYXdTaGlwLFxuICAgIGRyYXdHaG9zdERvdCxcbiAgICBkcmF3Um91dGUsXG4gICAgZHJhd01pc3NpbGVSb3V0ZSxcbiAgICBkcmF3TWlzc2lsZXMsXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgQWN0aXZlVG9vbCwgQXBwU3RhdGUsIFVJU3RhdGUgfSBmcm9tIFwiLi4vc3RhdGVcIjtcbmltcG9ydCB7XG4gIE1JU1NJTEVfTUFYX1NQRUVELFxuICBNSVNTSUxFX01JTl9BR1JPLFxuICBNSVNTSUxFX01JTl9TUEVFRCxcbiAgY2xhbXAsXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbn0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBIRUxQX1RFWFQgfSBmcm9tIFwiLi9jb25zdGFudHNcIjtcbmltcG9ydCB0eXBlIHsgQ2FtZXJhIH0gZnJvbSBcIi4vY2FtZXJhXCI7XG5pbXBvcnQgdHlwZSB7IExvZ2ljIH0gZnJvbSBcIi4vbG9naWNcIjtcbmltcG9ydCB7IHByb2plY3RSb3V0ZUhlYXQgfSBmcm9tIFwiLi4vcm91dGVcIjtcblxuaW50ZXJmYWNlIFVJRGVwZW5kZW5jaWVzIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBsb2dpYzogTG9naWM7XG4gIGNhbWVyYTogQ2FtZXJhO1xuICBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZDtcbiAgZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlOiBBcHBTdGF0ZSk6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENhY2hlZENhbnZhcyB7XG4gIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVUlDb250cm9sbGVyIHtcbiAgY2FjaGVEb20oKTogQ2FjaGVkQ2FudmFzO1xuICBiaW5kVUkoKTogdm9pZDtcbiAgc2V0QWN0aXZlVG9vbCh0b29sOiBBY3RpdmVUb29sKTogdm9pZDtcbiAgc2V0SW5wdXRDb250ZXh0KGNvbnRleHQ6IFwic2hpcFwiIHwgXCJtaXNzaWxlXCIpOiB2b2lkO1xuICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpOiB2b2lkO1xuICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk6IHZvaWQ7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTogdm9pZDtcbiAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTogdm9pZDtcbiAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpOiB2b2lkO1xuICB1cGRhdGVIZWxwT3ZlcmxheSgpOiB2b2lkO1xuICBzZXRIZWxwVmlzaWJsZShmbGFnOiBib29sZWFuKTogdm9pZDtcbiAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk6IHZvaWQ7XG4gIHVwZGF0ZU1pc3NpbGVDb3VudERpc3BsYXkoKTogdm9pZDtcbiAgdXBkYXRlQ3JhZnRUaW1lcigpOiB2b2lkO1xuICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk6IHZvaWQ7XG4gIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk6IHZvaWQ7XG4gIHVwZGF0ZVNwZWVkTWFya2VyKCk6IHZvaWQ7XG4gIHVwZGF0ZUhlYXRCYXIoKTogdm9pZDtcbiAgcHJvamVjdFBsYW5uZWRIZWF0KCk6IG51bWJlciB8IG51bGw7XG4gIGdldENhbnZhcygpOiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gIGdldENvbnRleHQoKTogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEIHwgbnVsbDtcbiAgYWRqdXN0U2hpcFNwZWVkKHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IHZvaWQ7XG4gIGFkanVzdE1pc3NpbGVBZ3JvKHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IHZvaWQ7XG4gIGFkanVzdE1pc3NpbGVTcGVlZChzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVUkoe1xuICBzdGF0ZSxcbiAgdWlTdGF0ZSxcbiAgYnVzLFxuICBsb2dpYyxcbiAgY2FtZXJhLFxuICBzZW5kTWVzc2FnZSxcbiAgZ2V0QXBwcm94U2VydmVyTm93LFxufTogVUlEZXBlbmRlbmNpZXMpOiBVSUNvbnRyb2xsZXIge1xuICBsZXQgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQgfCBudWxsID0gbnVsbDtcbiAgbGV0IEhQc3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGtpbGxzU3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBDb250cm9sc0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwQ2xlYXJCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFNlbGVjdEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBSb3V0ZXNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwUm91dGVMZWc6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwUm91dGVTcGVlZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwU3BlZWRDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFNwZWVkU2xpZGVyOiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTcGVlZE1hcmtlcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgbWlzc2lsZUNvbnRyb2xzQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVBZGRSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVMYXVuY2hCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlTGF1bmNoVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVMYXVuY2hJbmZvOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlRGVsZXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTcGVlZFNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNwZWVkVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlQWdyb0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlQWdyb1NsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUFncm9WYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVIZWF0Q2FwYWNpdHlDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUhlYXRDYXBhY2l0eVNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUhlYXRDYXBhY2l0eVZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUNyYWZ0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUNvdW50U3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVDcmFmdFRpbWVyRGl2OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgY3JhZnRUaW1lUmVtYWluaW5nU3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNwYXduQm90QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc3Bhd25Cb3RUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG4gIGxldCByb3V0ZVByZXZCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByb3V0ZU5leHRCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByb3V0ZU1lbnVUb2dnbGU6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByb3V0ZU1lbnU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByZW5hbWVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBkZWxldGVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlUm91dGVOYW1lTGFiZWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlUm91dGVDb3VudExhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG4gIGxldCBoZWxwVG9nZ2xlOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgaGVscE92ZXJsYXk6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBoZWxwQ2xvc2VCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBoZWxwVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgaGVhdEJhckZpbGw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBoZWF0QmFyUGxhbm5lZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGhlYXRWYWx1ZVRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzcGVlZE1hcmtlcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHN0YWxsT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgbWFya2VyQWxpZ25lZCA9IGZhbHNlO1xuICBsZXQgaGVhdFdhcm5BY3RpdmUgPSBmYWxzZTtcbiAgbGV0IHN0YWxsQWN0aXZlID0gZmFsc2U7XG4gIGxldCBkdWFsTWV0ZXJBbGVydCA9IGZhbHNlO1xuICBsZXQgbGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCA9IFwiXCI7XG4gIGxldCBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgbGV0IGxhc3RNaXNzaWxlQ29uZmlnU2VudDogeyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGNhY2hlRG9tKCk6IENhY2hlZENhbnZhcyB7XG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdlwiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gICAgY3R4ID0gY2FudmFzPy5nZXRDb250ZXh0KFwiMmRcIikgPz8gbnVsbDtcbiAgICBIUHNwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtaHBcIik7XG4gICAgc2hpcENvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1jb250cm9sc1wiKTtcbiAgICBzaGlwQ2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIHNoaXBTZXRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2V0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBzaGlwU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgc2hpcFJvdXRlc0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZXNcIik7XG4gICAgc2hpcFJvdXRlTGVnID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXJvdXRlLWxlZ1wiKTtcbiAgICBzaGlwUm91dGVTcGVlZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZS1zcGVlZFwiKTtcbiAgICBzaGlwRGVsZXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgc2hpcFNwZWVkQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1jYXJkXCIpO1xuICAgIHNoaXBTcGVlZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgc2hpcFNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtdmFsdWVcIik7XG5cbiAgICBtaXNzaWxlQ29udHJvbHNDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWNvbnRyb2xzXCIpO1xuICAgIG1pc3NpbGVBZGRSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVMYXVuY2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlTGF1bmNoVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2gtdGV4dFwiKTtcbiAgICBtaXNzaWxlTGF1bmNoSW5mbyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2gtaW5mb1wiKTtcbiAgICBtaXNzaWxlU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgbWlzc2lsZVNlbGVjdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZWxlY3RcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVEZWxldGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtZGVsZXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlU3BlZWRDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLWNhcmRcIik7XG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlU3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC12YWx1ZVwiKTtcbiAgICBtaXNzaWxlQWdyb0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1jYXJkXCIpO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVBZ3JvVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby12YWx1ZVwiKTtcbiAgICBtaXNzaWxlSGVhdENhcGFjaXR5Q2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1oZWF0LWNhcGFjaXR5LWNhcmRcIik7XG4gICAgbWlzc2lsZUhlYXRDYXBhY2l0eVNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1oZWF0LWNhcGFjaXR5LXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlSGVhdENhcGFjaXR5VmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtaGVhdC1jYXBhY2l0eS12YWx1ZVwiKTtcbiAgICBtaXNzaWxlQ3JhZnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY3JhZnRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVDb3VudFNwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY291bnRcIik7XG4gICAgbWlzc2lsZUNyYWZ0VGltZXJEaXYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY3JhZnQtdGltZXJcIik7XG4gICAgY3JhZnRUaW1lUmVtYWluaW5nU3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3JhZnQtdGltZS1yZW1haW5pbmdcIik7XG5cbiAgICBzcGF3bkJvdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBzcGF3bkJvdFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdC10ZXh0XCIpO1xuICAgIGtpbGxzU3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1raWxsc1wiKTtcbiAgICByb3V0ZVByZXZCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIHJvdXRlTmV4dEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbmV4dFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgcm91dGVNZW51VG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51LXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgcm91dGVNZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51XCIpO1xuICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVuYW1lLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVsZXRlLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2xlYXItbWlzc2lsZS13YXlwb2ludHNcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVSb3V0ZU5hbWVMYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1yb3V0ZS1uYW1lXCIpO1xuICAgIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtY291bnRcIik7XG5cbiAgICBoZWxwVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgaGVscE92ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtb3ZlcmxheVwiKTtcbiAgICBoZWxwQ2xvc2VCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtY2xvc2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGhlbHBUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRleHRcIik7XG5cbiAgICBoZWF0QmFyRmlsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItZmlsbFwiKTtcbiAgICBoZWF0QmFyUGxhbm5lZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItcGxhbm5lZFwiKTtcbiAgICBoZWF0VmFsdWVUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWF0LXZhbHVlLXRleHRcIik7XG4gICAgc3BlZWRNYXJrZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkLW1hcmtlclwiKTtcbiAgICBtaXNzaWxlU3BlZWRNYXJrZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtbWFya2VyXCIpO1xuICAgIHN0YWxsT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhbGwtb3ZlcmxheVwiKTtcblxuICAgIGNvbnN0IHNsaWRlckRlZmF1bHQgPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlcj8udmFsdWUgPz8gXCIxNTBcIik7XG4gICAgbG9naWMuc2V0RGVmYXVsdFNoaXBTcGVlZChOdW1iZXIuaXNGaW5pdGUoc2xpZGVyRGVmYXVsdCkgPyBzbGlkZXJEZWZhdWx0IDogMTUwKTtcbiAgICBpZiAobWlzc2lsZVNwZWVkU2xpZGVyKSB7XG4gICAgICBtaXNzaWxlU3BlZWRTbGlkZXIuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBjYW52YXMsIGN0eCB9O1xuICB9XG5cbiAgZnVuY3Rpb24gYmluZFVJKCk6IHZvaWQge1xuICAgIHNwYXduQm90QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgaWYgKHNwYXduQm90QnRuLmRpc2FibGVkKSByZXR1cm47XG5cbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJzcGF3bl9ib3RcIiB9KTtcbiAgICAgIGJ1cy5lbWl0KFwiYm90OnNwYXduUmVxdWVzdGVkXCIpO1xuXG4gICAgICBzcGF3bkJvdEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBpZiAoc3Bhd25Cb3RUZXh0KSB7XG4gICAgICAgIHNwYXduQm90VGV4dC50ZXh0Q29udGVudCA9IFwiU3Bhd25lZFwiO1xuICAgICAgfVxuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaWYgKHNwYXduQm90QnRuKSB7XG4gICAgICAgICAgc3Bhd25Cb3RCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc3Bhd25Cb3RUZXh0KSB7XG4gICAgICAgICAgc3Bhd25Cb3RUZXh0LnRleHRDb250ZW50ID0gXCJCb3RcIjtcbiAgICAgICAgfVxuICAgICAgfSwgNTAwMCk7XG4gICAgfSk7XG5cbiAgICBzaGlwQ2xlYXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgbG9naWMuY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgIGJ1cy5lbWl0KFwic2hpcDpjbGVhckludm9rZWRcIik7XG4gICAgfSk7XG5cbiAgICBzaGlwU2V0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICAgIH0pO1xuXG4gICAgc2hpcFNlbGVjdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNlbGVjdFwiKTtcbiAgICB9KTtcblxuICAgIHNoaXBTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSByZXR1cm47XG4gICAgICB1cGRhdGVTcGVlZExhYmVsKHZhbHVlKTtcbiAgICAgIGxvZ2ljLnNldERlZmF1bHRTaGlwU3BlZWQodmFsdWUpO1xuICAgICAgY29uc3Qgc2VsZWN0aW9uID0gbG9naWMuZ2V0U2VsZWN0aW9uKCk7XG4gICAgICBpZiAoXG4gICAgICAgIHNlbGVjdGlvbiAmJlxuICAgICAgICBzdGF0ZS5tZSAmJlxuICAgICAgICBBcnJheS5pc0FycmF5KHN0YXRlLm1lLndheXBvaW50cykgJiZcbiAgICAgICAgc3RhdGUubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF1cbiAgICAgICkge1xuICAgICAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwidXBkYXRlX3dheXBvaW50XCIsIGluZGV4OiBzZWxlY3Rpb24uaW5kZXgsIHNwZWVkOiB2YWx1ZSB9KTtcbiAgICAgICAgc3RhdGUubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0uc3BlZWQgPSB2YWx1ZTtcbiAgICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xuICAgICAgfVxuICAgICAgY29uc3QgaGVhdCA9IHN0YXRlLm1lPy5oZWF0O1xuICAgICAgaWYgKGhlYXQpIHtcbiAgICAgICAgY29uc3QgdG9sZXJhbmNlID0gTWF0aC5tYXgoNSwgaGVhdC5tYXJrZXJTcGVlZCAqIDAuMDIpO1xuICAgICAgICBjb25zdCBkaWZmID0gTWF0aC5hYnModmFsdWUgLSBoZWF0Lm1hcmtlclNwZWVkKTtcbiAgICAgICAgY29uc3QgaW5SYW5nZSA9IGRpZmYgPD0gdG9sZXJhbmNlO1xuICAgICAgICBpZiAoaW5SYW5nZSAmJiAhbWFya2VyQWxpZ25lZCkge1xuICAgICAgICAgIG1hcmtlckFsaWduZWQgPSB0cnVlO1xuICAgICAgICAgIGJ1cy5lbWl0KFwiaGVhdDptYXJrZXJBbGlnbmVkXCIsIHsgdmFsdWUsIG1hcmtlcjogaGVhdC5tYXJrZXJTcGVlZCB9KTtcbiAgICAgICAgfSBlbHNlIGlmICghaW5SYW5nZSAmJiBtYXJrZXJBbGlnbmVkKSB7XG4gICAgICAgICAgbWFya2VyQWxpZ25lZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtYXJrZXJBbGlnbmVkID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBidXMuZW1pdChcInNoaXA6c3BlZWRDaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gICAgfSk7XG5cbiAgICBzaGlwRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGxvZ2ljLmRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlQWRkUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF9taXNzaWxlX3JvdXRlXCIgfSk7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlTGF1bmNoQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGxvZ2ljLmxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIH0pO1xuXG4gICAgbWlzc2lsZVNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZWxlY3RcIik7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGxvZ2ljLmRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiKTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgICAgY29uc3Qgc2xpZGVyID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICBpZiAoc2xpZGVyLmRpc2FibGVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJhdyA9IHBhcnNlRmxvYXQoc2xpZGVyLnZhbHVlKTtcbiAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHJhdykpIHJldHVybjtcbiAgICAgIGNvbnN0IG1pblNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1pbiA/PyBNSVNTSUxFX01JTl9TUEVFRDtcbiAgICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICAgIGNvbnN0IGNsYW1wZWRWYWx1ZSA9IGNsYW1wKHJhdywgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IGNsYW1wZWRWYWx1ZS50b0ZpeGVkKDApO1xuICAgICAgaWYgKG1pc3NpbGVTcGVlZFZhbHVlKSB7XG4gICAgICAgIG1pc3NpbGVTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7Y2xhbXBlZFZhbHVlLnRvRml4ZWQoMCl9YDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBjb25zdCBtaXNzaWxlU2VsZWN0aW9uID0gbG9naWMuZ2V0TWlzc2lsZVNlbGVjdGlvbigpO1xuICAgICAgaWYgKFxuICAgICAgICByb3V0ZSAmJlxuICAgICAgICBtaXNzaWxlU2VsZWN0aW9uICYmXG4gICAgICAgIG1pc3NpbGVTZWxlY3Rpb24udHlwZSA9PT0gXCJsZWdcIiAmJlxuICAgICAgICBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgJiZcbiAgICAgICAgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA+PSAwICYmXG4gICAgICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoXG4gICAgICApIHtcbiAgICAgICAgcm91dGUud2F5cG9pbnRzID0gcm91dGUud2F5cG9pbnRzLm1hcCgodywgaWR4KSA9PlxuICAgICAgICAgIGlkeCA9PT0gbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA/IHsgLi4udywgc3BlZWQ6IGNsYW1wZWRWYWx1ZSB9IDogd1xuICAgICAgICApO1xuICAgICAgICBzZW5kTWVzc2FnZSh7XG4gICAgICAgICAgdHlwZTogXCJ1cGRhdGVfbWlzc2lsZV93YXlwb2ludF9zcGVlZFwiLFxuICAgICAgICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICAgICAgICBpbmRleDogbWlzc2lsZVNlbGVjdGlvbi5pbmRleCxcbiAgICAgICAgICBzcGVlZDogY2xhbXBlZFZhbHVlLFxuICAgICAgICB9KTtcbiAgICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlOiBjbGFtcGVkVmFsdWUsIGluZGV4OiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY2ZnID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNwZWVkOiBjbGFtcGVkVmFsdWUsXG4gICAgICAgICAgICBhZ3JvUmFkaXVzOiBzdGF0ZS5taXNzaWxlQ29uZmlnLmFncm9SYWRpdXMsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzdGF0ZS5taXNzaWxlQ29uZmlnLFxuICAgICAgICAgIHN0YXRlLm1pc3NpbGVMaW1pdHNcbiAgICAgICAgKTtcbiAgICAgICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgICAgICAgc2VuZE1pc3NpbGVDb25maWcoY2ZnKTtcbiAgICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlOiBjbGFtcGVkVmFsdWUsIGluZGV4OiAtMSB9KTtcbiAgICAgIH1cbiAgICAgIGxvZ2ljLnJlY29yZE1pc3NpbGVMZWdTcGVlZChjbGFtcGVkVmFsdWUpO1xuICAgIH0pO1xuXG4gICAgbWlzc2lsZUFncm9TbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHJhdyA9IHBhcnNlRmxvYXQoKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShyYXcpKSByZXR1cm47XG4gICAgICBjb25zdCBtaW5BZ3JvID0gc3RhdGUubWlzc2lsZUxpbWl0cy5hZ3JvTWluID8/IE1JU1NJTEVfTUlOX0FHUk87XG4gICAgICBjb25zdCBjbGFtcGVkVmFsdWUgPSBNYXRoLm1heChtaW5BZ3JvLCByYXcpO1xuICAgICAgbWlzc2lsZUFncm9TbGlkZXIudmFsdWUgPSBjbGFtcGVkVmFsdWUudG9GaXhlZCgwKTtcbiAgICAgIGlmIChtaXNzaWxlQWdyb1ZhbHVlKSB7XG4gICAgICAgIG1pc3NpbGVBZ3JvVmFsdWUudGV4dENvbnRlbnQgPSBgJHtjbGFtcGVkVmFsdWUudG9GaXhlZCgwKX1gO1xuICAgICAgfVxuICAgICAgdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSSh7IGFncm9SYWRpdXM6IGNsYW1wZWRWYWx1ZSB9KTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiLCB7IHZhbHVlOiBjbGFtcGVkVmFsdWUgfSk7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlSGVhdENhcGFjaXR5U2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBjb25zdCByYXcgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocmF3KSkgcmV0dXJuO1xuICAgICAgY29uc3QgY2xhbXBlZFZhbHVlID0gTWF0aC5tYXgoODAsIE1hdGgubWluKDIwMCwgcmF3KSk7XG4gICAgICBtaXNzaWxlSGVhdENhcGFjaXR5U2xpZGVyLnZhbHVlID0gY2xhbXBlZFZhbHVlLnRvRml4ZWQoMCk7XG4gICAgICBpZiAobWlzc2lsZUhlYXRDYXBhY2l0eVZhbHVlKSB7XG4gICAgICAgIG1pc3NpbGVIZWF0Q2FwYWNpdHlWYWx1ZS50ZXh0Q29udGVudCA9IGAke2NsYW1wZWRWYWx1ZS50b0ZpeGVkKDApfWA7XG4gICAgICB9XG4gICAgICBzdGF0ZS5jcmFmdEhlYXRDYXBhY2l0eSA9IGNsYW1wZWRWYWx1ZTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVDcmFmdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGlmIChtaXNzaWxlQ3JhZnRCdG4uZGlzYWJsZWQpIHJldHVybjtcblxuICAgICAgLy8gRmluZCB0aGUgY3JhZnQgbm9kZSBmb3IgdGhlIHNlbGVjdGVkIGhlYXQgY2FwYWNpdHlcbiAgICAgIGNvbnN0IGhlYXRDYXAgPSBzdGF0ZS5jcmFmdEhlYXRDYXBhY2l0eTtcbiAgICAgIGxldCBub2RlSWQgPSBcImNyYWZ0Lm1pc3NpbGUuYmFzaWNcIjsgLy8gRGVmYXVsdFxuXG4gICAgICBpZiAoc3RhdGUuZGFnKSB7XG4gICAgICAgIC8vIEZpbmQgdGhlIGJlc3QgbWF0Y2hpbmcgY3JhZnQgbm9kZSBiYXNlZCBvbiBoZWF0IGNhcGFjaXR5XG4gICAgICAgIGNvbnN0IGNyYWZ0Tm9kZXMgPSBzdGF0ZS5kYWcubm9kZXMuZmlsdGVyKG4gPT4gbi5raW5kID09PSBcImNyYWZ0XCIgJiYgbi5pZC5pbmNsdWRlcyhcIm1pc3NpbGVcIikpO1xuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2YgY3JhZnROb2Rlcykge1xuICAgICAgICAgIGNvbnN0IG5vZGVIZWF0Q2FwID0gcGFyc2VJbnQobm9kZS5pZC5tYXRjaCgvKFxcZCspLyk/LlsxXSB8fCBcIjgwXCIpO1xuICAgICAgICAgIGlmIChNYXRoLmFicyhub2RlSGVhdENhcCAtIGhlYXRDYXApIDwgNSkge1xuICAgICAgICAgICAgbm9kZUlkID0gbm9kZS5pZDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVybWluZSB0aGUgcmlnaHQgbm9kZSBiYXNlZCBvbiBoZWF0IGNhcGFjaXR5IHJhbmdlc1xuICAgICAgICBpZiAoaGVhdENhcCA+PSAxODApIHtcbiAgICAgICAgICBub2RlSWQgPSBcImNyYWZ0Lm1pc3NpbGUuZXh0ZW5kZWRcIjtcbiAgICAgICAgfSBlbHNlIGlmIChoZWF0Q2FwID49IDE0MCkge1xuICAgICAgICAgIG5vZGVJZCA9IFwiY3JhZnQubWlzc2lsZS5oaWdoX2hlYXRcIjtcbiAgICAgICAgfSBlbHNlIGlmIChoZWF0Q2FwID49IDExMCkge1xuICAgICAgICAgIG5vZGVJZCA9IFwiY3JhZnQubWlzc2lsZS5sb25nX3JhbmdlXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbm9kZUlkID0gXCJjcmFmdC5taXNzaWxlLmJhc2ljXCI7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRhZ19zdGFydFwiLCBub2RlX2lkOiBub2RlSWQgfSk7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6Y3JhZnRSZXF1ZXN0ZWRcIiwgeyBub2RlSWQsIGhlYXRDYXBhY2l0eTogaGVhdENhcCB9KTtcbiAgICB9KTtcblxuICAgIHJvdXRlUHJldkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGxvZ2ljLmN5Y2xlTWlzc2lsZVJvdXRlKC0xKSk7XG4gICAgcm91dGVOZXh0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gbG9naWMuY3ljbGVNaXNzaWxlUm91dGUoMSkpO1xuXG4gICAgcm91dGVNZW51VG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgcm91dGVNZW51Py5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiKTtcbiAgICB9KTtcblxuICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgICBjb25zdCBuZXh0TmFtZSA9IHByb21wdChcIlJlbmFtZSByb3V0ZVwiLCByb3V0ZS5uYW1lID8/IFwiXCIpID8/IFwiXCI7XG4gICAgICBjb25zdCB0cmltbWVkID0gbmV4dE5hbWUudHJpbSgpO1xuICAgICAgaWYgKHRyaW1tZWQgPT09IHJvdXRlLm5hbWUpIHJldHVybjtcbiAgICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgICAgdHlwZTogXCJyZW5hbWVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgICAgIG5hbWU6IHRyaW1tZWQsXG4gICAgICB9KTtcbiAgICAgIHJvdXRlLm5hbWUgPSB0cmltbWVkO1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9KTtcblxuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiZGVsZXRlX21pc3NpbGVfcm91dGVcIiwgcm91dGVfaWQ6IHJvdXRlLmlkIH0pO1xuICAgIH0pO1xuXG4gICAgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgcm91dGUgPSBsb2dpYy5nZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJjbGVhcl9taXNzaWxlX3dheXBvaW50c1wiLCByb3V0ZV9pZDogcm91dGUuaWQgfSk7XG4gICAgICByb3V0ZS53YXlwb2ludHMgPSBbXTtcbiAgICAgIGxvZ2ljLnNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH0pO1xuXG4gICAgaGVscFRvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEhlbHBWaXNpYmxlKHRydWUpO1xuICAgIH0pO1xuXG4gICAgaGVscENsb3NlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgIH0pO1xuXG4gICAgYnVzLm9uKFwic2hpcDpsZWdTZWxlY3RlZFwiLCAoKSA9PiB7XG4gICAgICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gICAgfSk7XG4gICAgYnVzLm9uKFwic2hpcDp3YXlwb2ludEFkZGVkXCIsICgpID0+IHtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG4gICAgfSk7XG4gICAgYnVzLm9uKFwic2hpcDp3YXlwb2ludERlbGV0ZWRcIiwgKCkgPT4ge1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIiwgKCkgPT4ge1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJtaXNzaWxlOnNlbGVjdGlvbkNoYW5nZWRcIiwgKCkgPT4ge1xuICAgICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIiwgKCkgPT4ge1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiLCAoKSA9PiB7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH0pO1xuICAgIGJ1cy5vbihcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsICgpID0+IHtcbiAgICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRDYW52YXMoKTogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsIHtcbiAgICByZXR1cm4gY2FudmFzO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0Q29udGV4dCgpOiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQgfCBudWxsIHtcbiAgICByZXR1cm4gY3R4O1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFzaGlwU3BlZWRWYWx1ZSkgcmV0dXJuO1xuICAgIHNoaXBTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7dmFsdWUudG9GaXhlZCgwKX0gdS9zYDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkanVzdFNsaWRlclZhbHVlKFxuICAgIGlucHV0OiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCxcbiAgICBzdGVwczogbnVtYmVyLFxuICAgIGNvYXJzZTogYm9vbGVhblxuICApOiBudW1iZXIgfCBudWxsIHtcbiAgICBpZiAoIWlucHV0KSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5hYnMocGFyc2VGbG9hdChpbnB1dC5zdGVwKSkgfHwgMTtcbiAgICBjb25zdCBtdWx0aXBsaWVyID0gY29hcnNlID8gNCA6IDE7XG4gICAgY29uc3QgbWluID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWluKSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1pbikgOiAtSW5maW5pdHk7XG4gICAgY29uc3QgbWF4ID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWF4KSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1heCkgOiBJbmZpbml0eTtcbiAgICBjb25zdCBjdXJyZW50ID0gcGFyc2VGbG9hdChpbnB1dC52YWx1ZSkgfHwgMDtcbiAgICBsZXQgbmV4dCA9IGN1cnJlbnQgKyBzdGVwcyAqIHN0ZXAgKiBtdWx0aXBsaWVyO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobWluKSkgbmV4dCA9IE1hdGgubWF4KG1pbiwgbmV4dCk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtYXgpKSBuZXh0ID0gTWF0aC5taW4obWF4LCBuZXh0KTtcbiAgICBpZiAoTWF0aC5hYnMobmV4dCAtIGN1cnJlbnQpIDwgMWUtNCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlucHV0LnZhbHVlID0gU3RyaW5nKG5leHQpO1xuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIiwgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICByZXR1cm4gbmV4dDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkanVzdFNoaXBTcGVlZChzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBhZGp1c3RTbGlkZXJWYWx1ZShzaGlwU3BlZWRTbGlkZXIsIHN0ZXBzLCBjb2Fyc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gYWRqdXN0TWlzc2lsZUFncm8oc3RlcHM6IG51bWJlciwgY29hcnNlOiBib29sZWFuKTogdm9pZCB7XG4gICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIHN0ZXBzLCBjb2Fyc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gYWRqdXN0TWlzc2lsZVNwZWVkKHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIgJiYgIW1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCkge1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCBzdGVwcywgY29hcnNlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTaGlwU2xpZGVyVmFsdWUodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghc2hpcFNwZWVkU2xpZGVyKSByZXR1cm47XG4gICAgc2hpcFNwZWVkU2xpZGVyLnZhbHVlID0gdmFsdWUudG9GaXhlZCgwKTtcbiAgICB1cGRhdGVTcGVlZExhYmVsKHZhbHVlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk6IHZvaWQge1xuICAgIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGUubWlzc2lsZVJvdXRlcykgPyBzdGF0ZS5taXNzaWxlUm91dGVzIDogW107XG4gICAgY29uc3QgYWN0aXZlUm91dGUgPSBsb2dpYy5nZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAobWlzc2lsZVJvdXRlTmFtZUxhYmVsKSB7XG4gICAgICBpZiAoIWFjdGl2ZVJvdXRlKSB7XG4gICAgICAgIG1pc3NpbGVSb3V0ZU5hbWVMYWJlbC50ZXh0Q29udGVudCA9IHJvdXRlcy5sZW5ndGggPT09IDAgPyBcIk5vIHJvdXRlXCIgOiBcIlJvdXRlXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSBhY3RpdmVSb3V0ZS5uYW1lIHx8IFwiUm91dGVcIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobWlzc2lsZVJvdXRlQ291bnRMYWJlbCkge1xuICAgICAgY29uc3QgY291bnQgPVxuICAgICAgICBhY3RpdmVSb3V0ZSAmJiBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgPyBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICAgIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwudGV4dENvbnRlbnQgPSBgJHtjb3VudH0gcHRzYDtcbiAgICB9XG5cbiAgICBpZiAoZGVsZXRlTWlzc2lsZVJvdXRlQnRuKSB7XG4gICAgICBkZWxldGVNaXNzaWxlUm91dGVCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gICAgfVxuICAgIGlmIChyZW5hbWVNaXNzaWxlUm91dGVCdG4pIHtcbiAgICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZTtcbiAgICB9XG4gICAgaWYgKGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bikge1xuICAgICAgY29uc3QgY291bnQgPVxuICAgICAgICBhY3RpdmVSb3V0ZSAmJiBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgPyBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZSB8fCBjb3VudCA9PT0gMDtcbiAgICB9XG4gICAgaWYgKHJvdXRlUHJldkJ0bikge1xuICAgICAgcm91dGVQcmV2QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICAgIH1cbiAgICBpZiAocm91dGVOZXh0QnRuKSB7XG4gICAgICByb3V0ZU5leHRCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gICAgfVxuXG4gICAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpOiB2b2lkIHtcbiAgICBsb2dpYy5lbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZSA9IGxvZ2ljLmdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGNvbnN0IG1pc3NpbGVTZWwgPSBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCk7XG4gICAgY29uc3Qgcm91dGVIYXNTZWxlY3Rpb24gPVxuICAgICAgISFhY3RpdmVSb3V0ZSAmJlxuICAgICAgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpICYmXG4gICAgICAhIW1pc3NpbGVTZWwgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPj0gMCAmJlxuICAgICAgbWlzc2lsZVNlbC5pbmRleCA8IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGg7XG4gICAgaWYgKCFyb3V0ZUhhc1NlbGVjdGlvbikge1xuICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICB9XG4gICAgY29uc3QgY2ZnID0gc3RhdGUubWlzc2lsZUNvbmZpZztcbiAgICBhcHBseU1pc3NpbGVVSShjZmcpO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gYXBwbHlNaXNzaWxlVUkoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gICAgaWYgKG1pc3NpbGVBZ3JvU2xpZGVyKSB7XG4gICAgICBjb25zdCBtaW5BZ3JvID0gc3RhdGUubWlzc2lsZUxpbWl0cy5hZ3JvTWluID8/IE1JU1NJTEVfTUlOX0FHUk87XG4gICAgICBjb25zdCBtYXhBZ3JvID0gTWF0aC5tYXgoNTAwMCwgTWF0aC5jZWlsKChjZmcuYWdyb1JhZGl1cyArIDUwMCkgLyA1MDApICogNTAwKTtcbiAgICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5BZ3JvKTtcbiAgICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1heCA9IFN0cmluZyhtYXhBZ3JvKTtcbiAgICAgIG1pc3NpbGVBZ3JvU2xpZGVyLnZhbHVlID0gY2ZnLmFncm9SYWRpdXMudG9GaXhlZCgwKTtcbiAgICB9XG4gICAgaWYgKG1pc3NpbGVBZ3JvVmFsdWUpIHtcbiAgICAgIG1pc3NpbGVBZ3JvVmFsdWUudGV4dENvbnRlbnQgPSBjZmcuYWdyb1JhZGl1cy50b0ZpeGVkKDApO1xuICAgIH1cbiAgICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xuICAgIHVwZGF0ZVNwZWVkTWFya2VyKCk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKFxuICAgIG92ZXJyaWRlczogUGFydGlhbDx7IGFncm9SYWRpdXM6IG51bWJlciB9PiA9IHt9XG4gICk6IHZvaWQge1xuICAgIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZS5taXNzaWxlQ29uZmlnO1xuICAgIGNvbnN0IGNmZyA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyhcbiAgICAgIHtcbiAgICAgICAgc3BlZWQ6IGN1cnJlbnQuc3BlZWQsXG4gICAgICAgIGFncm9SYWRpdXM6IG92ZXJyaWRlcy5hZ3JvUmFkaXVzID8/IGN1cnJlbnQuYWdyb1JhZGl1cyxcbiAgICAgIH0sXG4gICAgICBjdXJyZW50LFxuICAgICAgc3RhdGUubWlzc2lsZUxpbWl0c1xuICAgICk7XG4gICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgICBhcHBseU1pc3NpbGVVSShjZmcpO1xuICAgIGNvbnN0IGxhc3QgPSBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQ7XG4gICAgY29uc3QgbmVlZHNTZW5kID1cbiAgICAgICFsYXN0IHx8IE1hdGguYWJzKChsYXN0LmFncm9SYWRpdXMgPz8gMCkgLSBjZmcuYWdyb1JhZGl1cykgPiA1O1xuICAgIGlmIChuZWVkc1NlbmQpIHtcbiAgICAgIHNlbmRNaXNzaWxlQ29uZmlnKGNmZyk7XG4gICAgfVxuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIH1cblxuICBmdW5jdGlvbiBzZW5kTWlzc2lsZUNvbmZpZyhjZmc6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0pOiB2b2lkIHtcbiAgICBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQgPSB7XG4gICAgICBzcGVlZDogY2ZnLnNwZWVkLFxuICAgICAgYWdyb1JhZGl1czogY2ZnLmFncm9SYWRpdXMsXG4gICAgfTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImNvbmZpZ3VyZV9taXNzaWxlXCIsXG4gICAgICBtaXNzaWxlX3NwZWVkOiBjZmcuc3BlZWQsXG4gICAgICBtaXNzaWxlX2Fncm86IGNmZy5hZ3JvUmFkaXVzLFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpOiB2b2lkIHtcbiAgICBpZiAoIXNoaXBSb3V0ZXNDb250YWluZXIgfHwgIXNoaXBSb3V0ZUxlZyB8fCAhc2hpcFJvdXRlU3BlZWQgfHwgIXNoaXBEZWxldGVCdG4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgd3BzID0gc3RhdGUubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpID8gc3RhdGUubWUud2F5cG9pbnRzIDogW107XG4gICAgY29uc3Qgc2VsZWN0aW9uID0gbG9naWMuZ2V0U2VsZWN0aW9uKCk7XG4gICAgY29uc3QgaGFzVmFsaWRTZWxlY3Rpb24gPVxuICAgICAgc2VsZWN0aW9uICE9PSBudWxsICYmIHNlbGVjdGlvbi5pbmRleCA+PSAwICYmIHNlbGVjdGlvbi5pbmRleCA8IHdwcy5sZW5ndGg7XG4gICAgY29uc3QgaXNTaGlwQ29udGV4dCA9IHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIjtcblxuICAgIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUub3BhY2l0eSA9IGlzU2hpcENvbnRleHQgPyBcIjFcIiA6IFwiMC42XCI7XG5cbiAgICBpZiAoIXN0YXRlLm1lIHx8ICFoYXNWYWxpZFNlbGVjdGlvbiB8fCAhc2VsZWN0aW9uKSB7XG4gICAgICBzaGlwUm91dGVMZWcudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgc2hpcFJvdXRlU3BlZWQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgc2hpcERlbGV0ZUJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBpZiAoaXNTaGlwQ29udGV4dCkge1xuICAgICAgICBzZXRTaGlwU2xpZGVyVmFsdWUobG9naWMuZ2V0RGVmYXVsdFNoaXBTcGVlZCgpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB3cCA9IHdwc1tzZWxlY3Rpb24uaW5kZXhdO1xuICAgIGNvbnN0IHNwZWVkID1cbiAgICAgIHdwICYmIHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiA/IHdwLnNwZWVkIDogbG9naWMuZ2V0RGVmYXVsdFNoaXBTcGVlZCgpO1xuICAgIGlmIChcbiAgICAgIGlzU2hpcENvbnRleHQgJiZcbiAgICAgIHNoaXBTcGVlZFNsaWRlciAmJlxuICAgICAgTWF0aC5hYnMocGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIudmFsdWUpIC0gc3BlZWQpID4gMC4yNVxuICAgICkge1xuICAgICAgc2V0U2hpcFNsaWRlclZhbHVlKHNwZWVkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdXBkYXRlU3BlZWRMYWJlbChzcGVlZCk7XG4gICAgfVxuICAgIGNvbnN0IGRpc3BsYXlJbmRleCA9IHNlbGVjdGlvbi5pbmRleCArIDE7XG4gICAgc2hpcFJvdXRlTGVnLnRleHRDb250ZW50ID0gYCR7ZGlzcGxheUluZGV4fWA7XG4gICAgc2hpcFJvdXRlU3BlZWQudGV4dENvbnRlbnQgPSBgJHtzcGVlZC50b0ZpeGVkKDApfSB1L3NgO1xuICAgIHNoaXBEZWxldGVCdG4uZGlzYWJsZWQgPSAhaXNTaGlwQ29udGV4dDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTogdm9pZCB7XG4gICAgY29uc3Qgcm91dGUgPSBsb2dpYy5nZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBjb25zdCBjb3VudCA9IHJvdXRlICYmIEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIGNvbnN0IG1pc3NpbGVTZWwgPSBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCk7XG4gICAgY29uc3QgaXNXYXlwb2ludFNlbGVjdGlvbiA9XG4gICAgICBtaXNzaWxlU2VsICE9PSBudWxsICYmXG4gICAgICBtaXNzaWxlU2VsICE9PSB1bmRlZmluZWQgJiZcbiAgICAgIG1pc3NpbGVTZWwudHlwZSA9PT0gXCJ3YXlwb2ludFwiICYmXG4gICAgICBtaXNzaWxlU2VsLmluZGV4ID49IDAgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPCBjb3VudDtcbiAgICBpZiAobWlzc2lsZURlbGV0ZUJ0bikge1xuICAgICAgbWlzc2lsZURlbGV0ZUJ0bi5kaXNhYmxlZCA9ICFpc1dheXBvaW50U2VsZWN0aW9uO1xuICAgIH1cbiAgICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTogdm9pZCB7XG4gICAgaWYgKCFtaXNzaWxlU3BlZWRTbGlkZXIgfHwgIW1pc3NpbGVTcGVlZFZhbHVlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbWluU3BlZWQgPSBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWluID8/IE1JU1NJTEVfTUlOX1NQRUVEO1xuICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIubWluID0gU3RyaW5nKG1pblNwZWVkKTtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIubWF4ID0gU3RyaW5nKG1heFNwZWVkKTtcblxuICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgY29uc3QgbWlzc2lsZVNlbCA9IGxvZ2ljLmdldE1pc3NpbGVTZWxlY3Rpb24oKTtcbiAgICBjb25zdCB3YXlwb2ludHMgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMgOiBudWxsO1xuICAgIGxldCBzZWxlY3RlZFNwZWVkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgc2VsZWN0ZWRUeXBlOiBcImxlZ1wiIHwgXCJ3YXlwb2ludFwiIHwgbnVsbCA9IG51bGw7XG5cbiAgICBpZiAoXG4gICAgICB3YXlwb2ludHMgJiZcbiAgICAgIG1pc3NpbGVTZWwgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPj0gMCAmJlxuICAgICAgbWlzc2lsZVNlbC5pbmRleCA8IHdheXBvaW50cy5sZW5ndGhcbiAgICApIHtcbiAgICAgIGNvbnN0IHdwID0gd2F5cG9pbnRzW21pc3NpbGVTZWwuaW5kZXhdO1xuICAgICAgY29uc3QgdmFsdWUgPVxuICAgICAgICB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgJiYgd3Auc3BlZWQgPiAwXG4gICAgICAgICAgPyB3cC5zcGVlZFxuICAgICAgICAgIDogbG9naWMuZ2V0RGVmYXVsdE1pc3NpbGVMZWdTcGVlZCgpO1xuICAgICAgc2VsZWN0ZWRTcGVlZCA9IGNsYW1wKHZhbHVlLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICAgICAgc2VsZWN0ZWRUeXBlID0gbWlzc2lsZVNlbC50eXBlO1xuICAgIH1cblxuICAgIGNvbnN0IHNsaWRlckRpc2FibGVkID0gc2VsZWN0ZWRUeXBlID09PSBcIndheXBvaW50XCI7XG4gICAgbGV0IHNsaWRlclZhbHVlOiBudW1iZXI7XG4gICAgaWYgKHNlbGVjdGVkU3BlZWQgIT09IG51bGwpIHtcbiAgICAgIHNsaWRlclZhbHVlID0gc2VsZWN0ZWRTcGVlZDtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgcmF3VmFsdWUgPSBwYXJzZUZsb2F0KG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSk7XG4gICAgICBjb25zdCBmYWxsYmFjayA9IGxvZ2ljLmdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQoKTtcbiAgICAgIGNvbnN0IHRhcmdldFZhbHVlID0gTnVtYmVyLmlzRmluaXRlKHJhd1ZhbHVlKSA/IHJhd1ZhbHVlIDogZmFsbGJhY2s7XG4gICAgICBzbGlkZXJWYWx1ZSA9IGNsYW1wKHRhcmdldFZhbHVlLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICAgIH1cblxuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCA9IHNsaWRlckRpc2FibGVkO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IHNsaWRlclZhbHVlLnRvRml4ZWQoMCk7XG4gICAgbWlzc2lsZVNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtzbGlkZXJWYWx1ZS50b0ZpeGVkKDApfWA7XG5cbiAgICBpZiAoIXNsaWRlckRpc2FibGVkKSB7XG4gICAgICBsb2dpYy5yZWNvcmRNaXNzaWxlTGVnU3BlZWQoc2xpZGVyVmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldElucHV0Q29udGV4dChjb250ZXh0OiBcInNoaXBcIiB8IFwibWlzc2lsZVwiKTogdm9pZCB7XG4gICAgY29uc3QgbmV4dCA9IGNvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcbiAgICBpZiAodWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IG5leHQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdWlTdGF0ZS5pbnB1dENvbnRleHQgPSBuZXh0O1xuXG4gICAgaWYgKG5leHQgPT09IFwic2hpcFwiKSB7XG4gICAgICBjb25zdCBzaGlwVG9vbFRvVXNlID0gdWlTdGF0ZS5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIiA/IFwic2hpcC1zZWxlY3RcIiA6IFwic2hpcC1zZXRcIjtcbiAgICAgIGlmICh1aVN0YXRlLmFjdGl2ZVRvb2wgIT09IHNoaXBUb29sVG9Vc2UpIHtcbiAgICAgICAgdWlTdGF0ZS5hY3RpdmVUb29sID0gc2hpcFRvb2xUb1VzZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgbWlzc2lsZVRvb2xUb1VzZSA9XG4gICAgICAgIHVpU3RhdGUubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIgPyBcIm1pc3NpbGUtc2VsZWN0XCIgOiBcIm1pc3NpbGUtc2V0XCI7XG4gICAgICBpZiAodWlTdGF0ZS5hY3RpdmVUb29sICE9PSBtaXNzaWxlVG9vbFRvVXNlKSB7XG4gICAgICAgIHVpU3RhdGUuYWN0aXZlVG9vbCA9IG1pc3NpbGVUb29sVG9Vc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgYnVzLmVtaXQoXCJjb250ZXh0OmNoYW5nZWRcIiwgeyBjb250ZXh0OiBuZXh0IH0pO1xuICAgIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEFjdGl2ZVRvb2wodG9vbDogQWN0aXZlVG9vbCk6IHZvaWQge1xuICAgIGlmICh1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IHRvb2wpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB1aVN0YXRlLmFjdGl2ZVRvb2wgPSB0b29sO1xuXG4gICAgaWYgKHRvb2wgPT09IFwic2hpcC1zZXRcIikge1xuICAgICAgdWlTdGF0ZS5zaGlwVG9vbCA9IFwic2V0XCI7XG4gICAgICB1aVN0YXRlLm1pc3NpbGVUb29sID0gbnVsbDtcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBidXMuZW1pdChcInNoaXA6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNldFwiIH0pO1xuICAgIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKSB7XG4gICAgICB1aVN0YXRlLnNoaXBUb29sID0gXCJzZWxlY3RcIjtcbiAgICAgIHVpU3RhdGUubWlzc2lsZVRvb2wgPSBudWxsO1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGJ1cy5lbWl0KFwic2hpcDp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2VsZWN0XCIgfSk7XG4gICAgfSBlbHNlIGlmICh0b29sID09PSBcIm1pc3NpbGUtc2V0XCIpIHtcbiAgICAgIHVpU3RhdGUuc2hpcFRvb2wgPSBudWxsO1xuICAgICAgdWlTdGF0ZS5taXNzaWxlVG9vbCA9IFwic2V0XCI7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2V0XCIgfSk7XG4gICAgfSBlbHNlIGlmICh0b29sID09PSBcIm1pc3NpbGUtc2VsZWN0XCIpIHtcbiAgICAgIHVpU3RhdGUuc2hpcFRvb2wgPSBudWxsO1xuICAgICAgdWlTdGF0ZS5taXNzaWxlVG9vbCA9IFwic2VsZWN0XCI7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZWxlY3RcIiB9KTtcbiAgICB9XG5cbiAgICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0QnV0dG9uU3RhdGUoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmICghYnRuKSByZXR1cm47XG4gICAgaWYgKGFjdGl2ZSkge1xuICAgICAgYnRuLmRhdGFzZXQuc3RhdGUgPSBcImFjdGl2ZVwiO1xuICAgICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcInRydWVcIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlbGV0ZSBidG4uZGF0YXNldC5zdGF0ZTtcbiAgICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJmYWxzZVwiKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpOiB2b2lkIHtcbiAgICBzZXRCdXR0b25TdGF0ZShzaGlwU2V0QnRuLCB1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZXRcIik7XG4gICAgc2V0QnV0dG9uU3RhdGUoc2hpcFNlbGVjdEJ0biwgdWlTdGF0ZS5hY3RpdmVUb29sID09PSBcInNoaXAtc2VsZWN0XCIpO1xuICAgIHNldEJ1dHRvblN0YXRlKG1pc3NpbGVTZXRCdG4sIHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKTtcbiAgICBzZXRCdXR0b25TdGF0ZShtaXNzaWxlU2VsZWN0QnRuLCB1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZWxlY3RcIik7XG5cbiAgICBpZiAoc2hpcENvbnRyb2xzQ2FyZCkge1xuICAgICAgc2hpcENvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIik7XG4gICAgfVxuICAgIGlmIChtaXNzaWxlQ29udHJvbHNDYXJkKSB7XG4gICAgICBtaXNzaWxlQ29udHJvbHNDYXJkLmNsYXNzTGlzdC50b2dnbGUoXCJhY3RpdmVcIiwgdWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRIZWxwVmlzaWJsZShmbGFnOiBib29sZWFuKTogdm9pZCB7XG4gICAgdWlTdGF0ZS5oZWxwVmlzaWJsZSA9IGZsYWc7XG4gICAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgICBidXMuZW1pdChcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgeyB2aXNpYmxlOiB1aVN0YXRlLmhlbHBWaXNpYmxlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlSGVscE92ZXJsYXkoKTogdm9pZCB7XG4gICAgaWYgKCFoZWxwT3ZlcmxheSB8fCAhaGVscFRleHQpIHJldHVybjtcbiAgICBoZWxwT3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiLCB1aVN0YXRlLmhlbHBWaXNpYmxlKTtcbiAgICBoZWxwVGV4dC50ZXh0Q29udGVudCA9IEhFTFBfVEVYVDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpOiB2b2lkIHtcbiAgICBpZiAoIW1pc3NpbGVMYXVuY2hCdG4gfHwgIW1pc3NpbGVMYXVuY2hUZXh0IHx8ICFtaXNzaWxlTGF1bmNoSW5mbykgcmV0dXJuO1xuICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgY29uc3QgY291bnQgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICBjb25zdCByZW1haW5pbmcgPSBsb2dpYy5nZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTtcbiAgICBjb25zdCBjb29saW5nRG93biA9IHJlbWFpbmluZyA+IDAuMDU7XG4gICAgY29uc3Qgc2hvdWxkRGlzYWJsZSA9ICFyb3V0ZSB8fCBjb3VudCA9PT0gMCB8fCBjb29saW5nRG93bjtcbiAgICBtaXNzaWxlTGF1bmNoQnRuLmRpc2FibGVkID0gc2hvdWxkRGlzYWJsZTtcblxuICAgIGNvbnN0IGxhdW5jaFRleHRIVE1MID1cbiAgICAgICc8c3BhbiBjbGFzcz1cImJ0bi10ZXh0LWZ1bGxcIj5MYXVuY2g8L3NwYW4+PHNwYW4gY2xhc3M9XCJidG4tdGV4dC1zaG9ydFwiPkZpcmU8L3NwYW4+JztcbiAgICBsZXQgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuXG4gICAgaWYgKCFyb3V0ZSkge1xuICAgICAgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuICAgIH0gZWxzZSBpZiAoY29vbGluZ0Rvd24pIHtcbiAgICAgIGxhdW5jaEluZm9IVE1MID0gYCR7cmVtYWluaW5nLnRvRml4ZWQoMSl9c2A7XG4gICAgfSBlbHNlIGlmIChyb3V0ZS5uYW1lKSB7XG4gICAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgICAgY29uc3Qgcm91dGVJbmRleCA9IHJvdXRlcy5maW5kSW5kZXgoKHIpID0+IHIuaWQgPT09IHJvdXRlLmlkKSArIDE7XG4gICAgICBsYXVuY2hJbmZvSFRNTCA9IGA8c3BhbiBjbGFzcz1cImJ0bi10ZXh0LWZ1bGxcIj4ke3JvdXRlLm5hbWV9PC9zcGFuPjxzcGFuIGNsYXNzPVwiYnRuLXRleHQtc2hvcnRcIj4ke3JvdXRlSW5kZXh9PC9zcGFuPmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgICB9XG5cbiAgICBpZiAobGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCAhPT0gbGF1bmNoVGV4dEhUTUwpIHtcbiAgICAgIG1pc3NpbGVMYXVuY2hUZXh0LmlubmVySFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICAgICAgbGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICAgIH1cblxuICAgIGlmIChsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MICE9PSBsYXVuY2hJbmZvSFRNTCkge1xuICAgICAgbWlzc2lsZUxhdW5jaEluZm8uaW5uZXJIVE1MID0gbGF1bmNoSW5mb0hUTUw7XG4gICAgICBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gbGF1bmNoSW5mb0hUTUw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUNvdW50RGlzcGxheSgpOiB2b2lkIHtcbiAgICBpZiAoIW1pc3NpbGVDb3VudFNwYW4pIHJldHVybjtcblxuICAgIGxldCBjb3VudCA9IDA7XG4gICAgaWYgKHN0YXRlLmludmVudG9yeSAmJiBzdGF0ZS5pbnZlbnRvcnkuaXRlbXMpIHtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBzdGF0ZS5pbnZlbnRvcnkuaXRlbXMpIHtcbiAgICAgICAgaWYgKGl0ZW0udHlwZSA9PT0gXCJtaXNzaWxlXCIpIHtcbiAgICAgICAgICBjb3VudCArPSBpdGVtLnF1YW50aXR5O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgbWlzc2lsZUNvdW50U3Bhbi50ZXh0Q29udGVudCA9IGNvdW50LnRvU3RyaW5nKCk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVDcmFmdFRpbWVyKCk6IHZvaWQge1xuICAgIGlmICghbWlzc2lsZUNyYWZ0VGltZXJEaXYgfHwgIWNyYWZ0VGltZVJlbWFpbmluZ1NwYW4pIHJldHVybjtcblxuICAgIC8vIExvb2sgZm9yIGFueSBjcmFmdCBub2RlIHRoYXQncyBpbiBwcm9ncmVzc1xuICAgIGxldCBjcmFmdEluUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICBsZXQgcmVtYWluaW5nVGltZSA9IDA7XG5cbiAgICBpZiAoc3RhdGUuZGFnICYmIHN0YXRlLmRhZy5ub2Rlcykge1xuICAgICAgZm9yIChjb25zdCBub2RlIG9mIHN0YXRlLmRhZy5ub2Rlcykge1xuICAgICAgICBpZiAobm9kZS5raW5kID09PSBcImNyYWZ0XCIgJiYgbm9kZS5zdGF0dXMgPT09IFwiaW5fcHJvZ3Jlc3NcIikge1xuICAgICAgICAgIGNyYWZ0SW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgICAgICAgcmVtYWluaW5nVGltZSA9IG5vZGUucmVtYWluaW5nX3M7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY3JhZnRJblByb2dyZXNzICYmIHJlbWFpbmluZ1RpbWUgPiAwKSB7XG4gICAgICBtaXNzaWxlQ3JhZnRUaW1lckRpdi5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgY3JhZnRUaW1lUmVtYWluaW5nU3Bhbi50ZXh0Q29udGVudCA9IE1hdGguY2VpbChyZW1haW5pbmdUaW1lKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBtaXNzaWxlQ3JhZnRUaW1lckRpdi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpOiB2b2lkIHtcbiAgICBjb25zdCBtZXRhID0gc3RhdGUud29ybGRNZXRhID8/IHt9O1xuICAgIGNhbWVyYS51cGRhdGVXb3JsZEZyb21NZXRhKG1ldGEpO1xuXG4gICAgaWYgKEhQc3Bhbikge1xuICAgICAgaWYgKHN0YXRlLm1lICYmIE51bWJlci5pc0Zpbml0ZShzdGF0ZS5tZS5ocCkpIHtcbiAgICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlLm1lLmhwKS50b1N0cmluZygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gXCJcdTIwMTNcIjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGtpbGxzU3Bhbikge1xuICAgICAgaWYgKHN0YXRlLm1lICYmIE51bWJlci5pc0Zpbml0ZShzdGF0ZS5tZS5raWxscykpIHtcbiAgICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlLm1lLmtpbGxzKS50b1N0cmluZygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gXCIwXCI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdXBkYXRlSGVhdEJhcigpO1xuICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG4gICAgdXBkYXRlU3BlZWRNYXJrZXIoKTtcbiAgICB1cGRhdGVTdGFsbE92ZXJsYXkoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUhlYXRCYXIoKTogdm9pZCB7XG4gICAgY29uc3QgaGVhdCA9IHN0YXRlLm1lPy5oZWF0O1xuICAgIGlmICghaGVhdCB8fCAhaGVhdEJhckZpbGwgfHwgIWhlYXRWYWx1ZVRleHQpIHtcbiAgICAgIGhlYXRXYXJuQWN0aXZlID0gZmFsc2U7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcGVyY2VudCA9IChoZWF0LnZhbHVlIC8gaGVhdC5tYXgpICogMTAwO1xuICAgIGhlYXRCYXJGaWxsLnN0eWxlLndpZHRoID0gYCR7cGVyY2VudH0lYDtcblxuICAgIGhlYXRWYWx1ZVRleHQudGV4dENvbnRlbnQgPSBgSGVhdCAke01hdGgucm91bmQoaGVhdC52YWx1ZSl9YDtcblxuICAgIGhlYXRCYXJGaWxsLmNsYXNzTGlzdC5yZW1vdmUoXCJ3YXJuXCIsIFwib3ZlcmhlYXRcIik7XG4gICAgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC5vdmVyaGVhdEF0KSB7XG4gICAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QuYWRkKFwib3ZlcmhlYXRcIik7XG4gICAgfSBlbHNlIGlmIChoZWF0LnZhbHVlID49IGhlYXQud2FybkF0KSB7XG4gICAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QuYWRkKFwid2FyblwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBub3dXYXJuID0gaGVhdC52YWx1ZSA+PSBoZWF0Lndhcm5BdDtcbiAgICBpZiAobm93V2FybiAmJiAhaGVhdFdhcm5BY3RpdmUpIHtcbiAgICAgIGhlYXRXYXJuQWN0aXZlID0gdHJ1ZTtcbiAgICAgIGJ1cy5lbWl0KFwiaGVhdDp3YXJuRW50ZXJlZFwiLCB7IHZhbHVlOiBoZWF0LnZhbHVlLCB3YXJuQXQ6IGhlYXQud2FybkF0IH0pO1xuICAgIH0gZWxzZSBpZiAoIW5vd1dhcm4gJiYgaGVhdFdhcm5BY3RpdmUpIHtcbiAgICAgIGNvbnN0IGNvb2xUaHJlc2hvbGQgPSBNYXRoLm1heCgwLCBoZWF0Lndhcm5BdCAtIDUpO1xuICAgICAgaWYgKGhlYXQudmFsdWUgPD0gY29vbFRocmVzaG9sZCkge1xuICAgICAgICBoZWF0V2FybkFjdGl2ZSA9IGZhbHNlO1xuICAgICAgICBidXMuZW1pdChcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCIsIHsgdmFsdWU6IGhlYXQudmFsdWUsIHdhcm5BdDogaGVhdC53YXJuQXQgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcHJvamVjdFBsYW5uZWRIZWF0KCk6IG51bWJlciB8IG51bGwge1xuICAgIGNvbnN0IHNoaXAgPSBzdGF0ZS5tZTtcbiAgICBpZiAoIXNoaXAgfHwgIUFycmF5LmlzQXJyYXkoc2hpcC53YXlwb2ludHMpIHx8IHNoaXAud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCB8fCAhc2hpcC5oZWF0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBjdXJyZW50SW5kZXhSYXcgPSBzaGlwLmN1cnJlbnRXYXlwb2ludEluZGV4O1xuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9XG4gICAgICB0eXBlb2YgY3VycmVudEluZGV4UmF3ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShjdXJyZW50SW5kZXhSYXcpID8gY3VycmVudEluZGV4UmF3IDogMDtcbiAgICBjb25zdCBjbGFtcGVkSW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjdXJyZW50SW5kZXgsIHNoaXAud2F5cG9pbnRzLmxlbmd0aCkpO1xuICAgIGNvbnN0IHJlbWFpbmluZ1dheXBvaW50cyA9XG4gICAgICBjbGFtcGVkSW5kZXggPiAwID8gc2hpcC53YXlwb2ludHMuc2xpY2UoY2xhbXBlZEluZGV4KSA6IHNoaXAud2F5cG9pbnRzLnNsaWNlKCk7XG5cbiAgICBpZiAocmVtYWluaW5nV2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgcm91dGUgPSBbeyB4OiBzaGlwLngsIHk6IHNoaXAueSwgc3BlZWQ6IHVuZGVmaW5lZCB9LCAuLi5yZW1haW5pbmdXYXlwb2ludHNdO1xuXG4gICAgY29uc3QgaGVhdFBhcmFtcyA9IHtcbiAgICAgIG1hcmtlclNwZWVkOiBzaGlwLmhlYXQubWFya2VyU3BlZWQsXG4gICAgICBrVXA6IHNoaXAuaGVhdC5rVXAsXG4gICAgICBrRG93bjogc2hpcC5oZWF0LmtEb3duLFxuICAgICAgZXhwOiBzaGlwLmhlYXQuZXhwLFxuICAgICAgbWF4OiBzaGlwLmhlYXQubWF4LFxuICAgICAgb3ZlcmhlYXRBdDogc2hpcC5oZWF0Lm92ZXJoZWF0QXQsXG4gICAgICB3YXJuQXQ6IHNoaXAuaGVhdC53YXJuQXQsXG4gICAgfTtcblxuICAgIGNvbnN0IHByb2plY3Rpb24gPSBwcm9qZWN0Um91dGVIZWF0KHJvdXRlLCBzaGlwLmhlYXQudmFsdWUsIGhlYXRQYXJhbXMpO1xuICAgIHJldHVybiBNYXRoLm1heCguLi5wcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cyk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVQbGFubmVkSGVhdEJhcigpOiB2b2lkIHtcbiAgICBpZiAoIWhlYXRCYXJQbGFubmVkKSByZXR1cm47XG4gICAgY29uc3QgcmVzZXRQbGFubmVkQmFyID0gKCkgPT4ge1xuICAgICAgaGVhdEJhclBsYW5uZWQuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gICAgfTtcblxuICAgIGNvbnN0IHNoaXAgPSBzdGF0ZS5tZTtcbiAgICBpZiAoIXNoaXAgfHwgIXNoaXAuaGVhdCkge1xuICAgICAgcmVzZXRQbGFubmVkQmFyKCk7XG4gICAgICBkdWFsTWV0ZXJBbGVydCA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHBsYW5uZWQgPSBwcm9qZWN0UGxhbm5lZEhlYXQoKTtcbiAgICBpZiAocGxhbm5lZCA9PT0gbnVsbCkge1xuICAgICAgcmVzZXRQbGFubmVkQmFyKCk7XG4gICAgICBkdWFsTWV0ZXJBbGVydCA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGFjdHVhbCA9IHNoaXAuaGVhdC52YWx1ZTtcbiAgICBjb25zdCBwZXJjZW50ID0gKHBsYW5uZWQgLyBzaGlwLmhlYXQubWF4KSAqIDEwMDtcbiAgICBoZWF0QmFyUGxhbm5lZC5zdHlsZS53aWR0aCA9IGAke01hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGVyY2VudCkpfSVgO1xuXG4gICAgY29uc3QgZGlmZiA9IHBsYW5uZWQgLSBhY3R1YWw7XG4gICAgY29uc3QgdGhyZXNob2xkID0gTWF0aC5tYXgoOCwgc2hpcC5oZWF0Lndhcm5BdCAqIDAuMSk7XG4gICAgaWYgKGRpZmYgPj0gdGhyZXNob2xkICYmICFkdWFsTWV0ZXJBbGVydCkge1xuICAgICAgZHVhbE1ldGVyQWxlcnQgPSB0cnVlO1xuICAgICAgYnVzLmVtaXQoXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCIsIHsgcGxhbm5lZCwgYWN0dWFsIH0pO1xuICAgIH0gZWxzZSBpZiAoZGlmZiA8IHRocmVzaG9sZCAqIDAuNiAmJiBkdWFsTWV0ZXJBbGVydCkge1xuICAgICAgZHVhbE1ldGVyQWxlcnQgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVTcGVlZE1hcmtlcigpOiB2b2lkIHtcbiAgICBjb25zdCBzaGlwSGVhdCA9IHN0YXRlLm1lPy5oZWF0O1xuICAgIGlmIChzcGVlZE1hcmtlciAmJiBzaGlwU3BlZWRTbGlkZXIgJiYgc2hpcEhlYXQgJiYgc2hpcEhlYXQubWFya2VyU3BlZWQgPiAwKSB7XG4gICAgICBjb25zdCBtaW4gPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci5taW4pO1xuICAgICAgY29uc3QgbWF4ID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIubWF4KTtcbiAgICAgIGNvbnN0IG1hcmtlclNwZWVkID0gc2hpcEhlYXQubWFya2VyU3BlZWQ7XG4gICAgICBjb25zdCBwZXJjZW50ID0gKChtYXJrZXJTcGVlZCAtIG1pbikgLyAobWF4IC0gbWluKSkgKiAxMDA7XG4gICAgICBjb25zdCBjbGFtcGVkID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBwZXJjZW50KSk7XG4gICAgICBzcGVlZE1hcmtlci5zdHlsZS5sZWZ0ID0gYCR7Y2xhbXBlZH0lYDtcbiAgICAgIHNwZWVkTWFya2VyLnRpdGxlID0gYEhlYXQgbmV1dHJhbDogJHtNYXRoLnJvdW5kKG1hcmtlclNwZWVkKX0gdW5pdHMvc2A7XG4gICAgICBzcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSBpZiAoc3BlZWRNYXJrZXIpIHtcbiAgICAgIHNwZWVkTWFya2VyLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBpZiAobWlzc2lsZVNwZWVkTWFya2VyICYmIG1pc3NpbGVTcGVlZFNsaWRlcikge1xuICAgICAgY29uc3QgaGVhdFBhcmFtcyA9IHN0YXRlLm1pc3NpbGVDb25maWcuaGVhdFBhcmFtcztcbiAgICAgIGNvbnN0IG1hcmtlclNwZWVkID1cbiAgICAgICAgKGhlYXRQYXJhbXMgJiYgTnVtYmVyLmlzRmluaXRlKGhlYXRQYXJhbXMubWFya2VyU3BlZWQpID8gaGVhdFBhcmFtcy5tYXJrZXJTcGVlZCA6IHVuZGVmaW5lZCkgPz9cbiAgICAgICAgKHNoaXBIZWF0ICYmIHNoaXBIZWF0Lm1hcmtlclNwZWVkID4gMCA/IHNoaXBIZWF0Lm1hcmtlclNwZWVkIDogdW5kZWZpbmVkKTtcblxuICAgICAgaWYgKG1hcmtlclNwZWVkICE9PSB1bmRlZmluZWQgJiYgbWFya2VyU3BlZWQgPiAwKSB7XG4gICAgICAgIGNvbnN0IG1pbiA9IHBhcnNlRmxvYXQobWlzc2lsZVNwZWVkU2xpZGVyLm1pbik7XG4gICAgICAgIGNvbnN0IG1heCA9IHBhcnNlRmxvYXQobWlzc2lsZVNwZWVkU2xpZGVyLm1heCk7XG4gICAgICAgIGNvbnN0IHBlcmNlbnQgPSAoKG1hcmtlclNwZWVkIC0gbWluKSAvIChtYXggLSBtaW4pKSAqIDEwMDtcbiAgICAgICAgY29uc3QgY2xhbXBlZCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGVyY2VudCkpO1xuICAgICAgICBtaXNzaWxlU3BlZWRNYXJrZXIuc3R5bGUubGVmdCA9IGAke2NsYW1wZWR9JWA7XG4gICAgICAgIG1pc3NpbGVTcGVlZE1hcmtlci50aXRsZSA9IGBIZWF0IG5ldXRyYWw6ICR7TWF0aC5yb3VuZChtYXJrZXJTcGVlZCl9IHVuaXRzL3NgO1xuICAgICAgICBtaXNzaWxlU3BlZWRNYXJrZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pc3NpbGVTcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU3RhbGxPdmVybGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IGhlYXQgPSBzdGF0ZS5tZT8uaGVhdDtcbiAgICBpZiAoIWhlYXQgfHwgIXN0YWxsT3ZlcmxheSkge1xuICAgICAgc3RhbGxBY3RpdmUgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBub3cgPVxuICAgICAgdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgICA/IHBlcmZvcm1hbmNlLm5vdygpXG4gICAgICAgIDogRGF0ZS5ub3coKTtcblxuICAgIGNvbnN0IGlzU3RhbGxlZCA9IG5vdyA8IGhlYXQuc3RhbGxVbnRpbE1zO1xuXG4gICAgaWYgKGlzU3RhbGxlZCkge1xuICAgICAgc3RhbGxPdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgICAgaWYgKCFzdGFsbEFjdGl2ZSkge1xuICAgICAgICBzdGFsbEFjdGl2ZSA9IHRydWU7XG4gICAgICAgIGJ1cy5lbWl0KFwiaGVhdDpzdGFsbFRyaWdnZXJlZFwiLCB7IHN0YWxsVW50aWw6IGhlYXQuc3RhbGxVbnRpbE1zIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdGFsbE92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgICBpZiAoc3RhbGxBY3RpdmUpIHtcbiAgICAgICAgc3RhbGxBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgYnVzLmVtaXQoXCJoZWF0OnN0YWxsUmVjb3ZlcmVkXCIsIHsgdmFsdWU6IGhlYXQudmFsdWUgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYWNoZURvbSxcbiAgICBiaW5kVUksXG4gICAgc2V0QWN0aXZlVG9vbCxcbiAgICBzZXRJbnB1dENvbnRleHQsXG4gICAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMsXG4gICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSxcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJLFxuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzLFxuICAgIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUsXG4gICAgdXBkYXRlSGVscE92ZXJsYXksXG4gICAgc2V0SGVscFZpc2libGUsXG4gICAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlLFxuICAgIHVwZGF0ZU1pc3NpbGVDb3VudERpc3BsYXksXG4gICAgdXBkYXRlQ3JhZnRUaW1lcixcbiAgICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzLFxuICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyLFxuICAgIHVwZGF0ZVNwZWVkTWFya2VyLFxuICAgIHVwZGF0ZUhlYXRCYXIsXG4gICAgcHJvamVjdFBsYW5uZWRIZWF0LFxuICAgIGdldENhbnZhcyxcbiAgICBnZXRDb250ZXh0LFxuICAgIGFkanVzdFNoaXBTcGVlZCxcbiAgICBhZGp1c3RNaXNzaWxlQWdybyxcbiAgICBhZGp1c3RNaXNzaWxlU3BlZWQsXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgQXBwU3RhdGUgfSBmcm9tIFwiLi4vc3RhdGVcIjtcblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaW9uSHVkIHtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgTWlzc2lvbkh1ZE9wdGlvbnMge1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3VudE1pc3Npb25IdWQoeyBzdGF0ZSwgYnVzIH06IE1pc3Npb25IdWRPcHRpb25zKTogTWlzc2lvbkh1ZCB7XG4gIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lvbi1odWRcIik7XG4gIGNvbnN0IGJlYWNvbkxhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaW9uLWJlYWNvbi1sYWJlbFwiKTtcbiAgY29uc3QgaG9sZExhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaW9uLWhvbGQtdGV4dFwiKTtcblxuICBpZiAoIWNvbnRhaW5lciB8fCAhYmVhY29uTGFiZWwgfHwgIWhvbGRMYWJlbCkge1xuICAgIHJldHVybiB7IGRlc3Ryb3koKSB7fSB9O1xuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyKCk6IHZvaWQge1xuICAgIGNvbnN0IG1pc3Npb24gPSBzdGF0ZS5taXNzaW9uO1xuICAgIGlmICghbWlzc2lvbiB8fCAhbWlzc2lvbi5hY3RpdmUpIHtcbiAgICAgIGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgICAgY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnNpZGVcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdG90YWwgPSBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoID4gMCA/IG1pc3Npb24uYmVhY29ucy5sZW5ndGggOiA0O1xuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IE1hdGgubWluKG1pc3Npb24uYmVhY29uSW5kZXggKyAxLCB0b3RhbCk7XG4gICAgYmVhY29uTGFiZWwudGV4dENvbnRlbnQgPSBgQmVhY29uICR7Y3VycmVudEluZGV4fS8ke3RvdGFsfWA7XG5cbiAgICBjb25zdCByZXF1aXJlZCA9IG1pc3Npb24uaG9sZFJlcXVpcmVkIHx8IDEwO1xuICAgIGNvbnN0IGhvbGRTZWNvbmRzID0gTWF0aC5tYXgoMCwgbWlzc2lvbi5ob2xkQWNjdW0pO1xuICAgIGhvbGRMYWJlbC50ZXh0Q29udGVudCA9IGBIb2xkOiAke2hvbGRTZWNvbmRzLnRvRml4ZWQoMSl9cyAvICR7cmVxdWlyZWQudG9GaXhlZCgxKX1zYDtcblxuICAgIGNvbnN0IGJlYWNvbiA9IG1pc3Npb24uYmVhY29uc1ttaXNzaW9uLmJlYWNvbkluZGV4XTtcbiAgICBpZiAoYmVhY29uICYmIHN0YXRlLm1lKSB7XG4gICAgICBjb25zdCBkeCA9IHN0YXRlLm1lLnggLSBiZWFjb24uY3g7XG4gICAgICBjb25zdCBkeSA9IHN0YXRlLm1lLnkgLSBiZWFjb24uY3k7XG4gICAgICBjb25zdCBpbnNpZGUgPSBkeCAqIGR4ICsgZHkgKiBkeSA8PSBiZWFjb24ucmFkaXVzICogYmVhY29uLnJhZGl1cztcbiAgICAgIGlmIChpbnNpZGUpIHtcbiAgICAgICAgY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJpbnNpZGVcIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShcImluc2lkZVwiKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnNpZGVcIik7XG4gICAgfVxuXG4gICAgY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gIH1cblxuICByZW5kZXIoKTtcbiAgY29uc3QgdW5zdWJzID0gW1xuICAgIGJ1cy5vbihcInN0YXRlOnVwZGF0ZWRcIiwgKCkgPT4gcmVuZGVyKCkpLFxuICAgIGJ1cy5vbihcIm1pc3Npb246c3RhcnRcIiwgKCkgPT4gcmVuZGVyKCkpLFxuICAgIGJ1cy5vbihcIm1pc3Npb246YmVhY29uLWxvY2tlZFwiLCAoKSA9PiByZW5kZXIoKSksXG4gICAgYnVzLm9uKFwibWlzc2lvbjpjb21wbGV0ZWRcIiwgKCkgPT4gcmVuZGVyKCkpLFxuICBdO1xuXG4gIHJldHVybiB7XG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGZvciAoY29uc3QgdW5zdWIgb2YgdW5zdWJzKSB7XG4gICAgICAgIHVuc3ViKCk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgeyBnZXRBcHByb3hTZXJ2ZXJOb3csIHNlbmRNZXNzYWdlIH0gZnJvbSBcIi4vbmV0XCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBVSVN0YXRlIH0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7IGNyZWF0ZUNhbWVyYSB9IGZyb20gXCIuL2dhbWUvY2FtZXJhXCI7XG5pbXBvcnQgeyBjcmVhdGVJbnB1dCB9IGZyb20gXCIuL2dhbWUvaW5wdXRcIjtcbmltcG9ydCB7IGNyZWF0ZUxvZ2ljIH0gZnJvbSBcIi4vZ2FtZS9sb2dpY1wiO1xuaW1wb3J0IHsgY3JlYXRlUmVuZGVyZXIgfSBmcm9tIFwiLi9nYW1lL3JlbmRlclwiO1xuaW1wb3J0IHsgY3JlYXRlVUkgfSBmcm9tIFwiLi9nYW1lL3VpXCI7XG5pbXBvcnQgeyBtb3VudE1pc3Npb25IdWQgfSBmcm9tIFwiLi9taXNzaW9uL2h1ZFwiO1xuXG5pbnRlcmZhY2UgSW5pdEdhbWVPcHRpb25zIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xufVxuXG5pbnRlcmZhY2UgR2FtZUNvbnRyb2xsZXIge1xuICBvblN0YXRlVXBkYXRlZCgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH06IEluaXRHYW1lT3B0aW9ucyk6IEdhbWVDb250cm9sbGVyIHtcbiAgY29uc3QgY2FudmFzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImN2XCIpIGFzIEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbDtcbiAgaWYgKCFjYW52YXNFbCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbnZhcyBlbGVtZW50ICNjdiBub3QgZm91bmRcIik7XG4gIH1cblxuICBjb25zdCBjYW1lcmEgPSBjcmVhdGVDYW1lcmEoeyBjYW52YXM6IGNhbnZhc0VsLCBzdGF0ZSwgdWlTdGF0ZSB9KTtcbiAgY29uc3QgbG9naWMgPSBjcmVhdGVMb2dpYyh7XG4gICAgc3RhdGUsXG4gICAgdWlTdGF0ZSxcbiAgICBidXMsXG4gICAgc2VuZE1lc3NhZ2UsXG4gICAgZ2V0QXBwcm94U2VydmVyTm93LFxuICAgIGNhbWVyYSxcbiAgfSk7XG4gIGNvbnN0IHVpID0gY3JlYXRlVUkoe1xuICAgIHN0YXRlLFxuICAgIHVpU3RhdGUsXG4gICAgYnVzLFxuICAgIGxvZ2ljLFxuICAgIGNhbWVyYSxcbiAgICBzZW5kTWVzc2FnZSxcbiAgICBnZXRBcHByb3hTZXJ2ZXJOb3csXG4gIH0pO1xuXG4gIGNvbnN0IHsgY2FudmFzOiBjYWNoZWRDYW52YXMsIGN0eDogY2FjaGVkQ3R4IH0gPSB1aS5jYWNoZURvbSgpO1xuICBjb25zdCByZW5kZXJDYW52YXMgPSBjYWNoZWRDYW52YXMgPz8gY2FudmFzRWw7XG4gIGNvbnN0IHJlbmRlckN0eCA9IGNhY2hlZEN0eCA/PyByZW5kZXJDYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICBpZiAoIXJlbmRlckN0eCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlVuYWJsZSB0byBhY3F1aXJlIDJEIHJlbmRlcmluZyBjb250ZXh0XCIpO1xuICB9XG5cbiAgY29uc3QgcmVuZGVyZXIgPSBjcmVhdGVSZW5kZXJlcih7XG4gICAgY2FudmFzOiByZW5kZXJDYW52YXMsXG4gICAgY3R4OiByZW5kZXJDdHgsXG4gICAgc3RhdGUsXG4gICAgdWlTdGF0ZSxcbiAgICBjYW1lcmEsXG4gICAgbG9naWMsXG4gIH0pO1xuXG4gIGNvbnN0IGlucHV0ID0gY3JlYXRlSW5wdXQoe1xuICAgIGNhbnZhczogcmVuZGVyQ2FudmFzLFxuICAgIHVpLFxuICAgIGxvZ2ljLFxuICAgIGNhbWVyYSxcbiAgICBzdGF0ZSxcbiAgICB1aVN0YXRlLFxuICAgIGJ1cyxcbiAgICBzZW5kTWVzc2FnZSxcbiAgfSk7XG5cbiAgdWkuYmluZFVJKCk7XG4gIGlucHV0LmJpbmRJbnB1dCgpO1xuICBsb2dpYy5lbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgdWkuc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICB1aS51cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICB1aS5yZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gIHVpLnJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgdWkudXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgdWkudXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICB1aS51cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgdWkudXBkYXRlTWlzc2lsZUNvdW50RGlzcGxheSgpO1xuXG4gIG1vdW50TWlzc2lvbkh1ZCh7IHN0YXRlLCBidXMgfSk7XG5cbiAgbGV0IGxhc3RMb29wVHM6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh0aW1lc3RhbXApKSB7XG4gICAgICB0aW1lc3RhbXAgPSBsYXN0TG9vcFRzID8/IDA7XG4gICAgfVxuXG4gICAgbGV0IGR0U2Vjb25kcyA9IDA7XG4gICAgaWYgKGxhc3RMb29wVHMgIT09IG51bGwpIHtcbiAgICAgIGR0U2Vjb25kcyA9ICh0aW1lc3RhbXAgLSBsYXN0TG9vcFRzKSAvIDEwMDA7XG4gICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShkdFNlY29uZHMpIHx8IGR0U2Vjb25kcyA8IDApIHtcbiAgICAgICAgZHRTZWNvbmRzID0gMDtcbiAgICAgIH1cbiAgICB9XG4gICAgbGFzdExvb3BUcyA9IHRpbWVzdGFtcDtcblxuICAgIGxvZ2ljLnVwZGF0ZVJvdXRlQW5pbWF0aW9ucyhkdFNlY29uZHMpO1xuICAgIHJlbmRlcmVyLmRyYXdTY2VuZSgpO1xuICAgIHVpLnVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuICAgIHVpLnVwZGF0ZUNyYWZ0VGltZXIoKTtcblxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcbiAgfVxuXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcblxuICByZXR1cm4ge1xuICAgIG9uU3RhdGVVcGRhdGVkKCkge1xuICAgICAgbG9naWMuZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICB1aS5zeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk7XG4gICAgICB1aS5yZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gICAgICB1aS5yZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gICAgICB1aS51cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgICAgIHVpLnVwZGF0ZU1pc3NpbGVDb3VudERpc3BsYXkoKTtcbiAgICAgIHVpLnVwZGF0ZUNyYWZ0VGltZXIoKTtcbiAgICAgIHVpLnVwZGF0ZVN0YXR1c0luZGljYXRvcnMoKTtcbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmludGVyZmFjZSBIaWdobGlnaHRDb250ZW50T3B0aW9ucyB7XG4gIHRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgc3RlcENvdW50OiBudW1iZXI7XG4gIHNob3dOZXh0OiBib29sZWFuO1xuICBuZXh0TGFiZWw/OiBzdHJpbmc7XG4gIG9uTmV4dD86ICgpID0+IHZvaWQ7XG4gIHNob3dTa2lwOiBib29sZWFuO1xuICBza2lwTGFiZWw/OiBzdHJpbmc7XG4gIG9uU2tpcD86ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGlnaGxpZ2h0ZXIge1xuICBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZDtcbiAgaGlkZSgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJ0dXRvcmlhbC1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVIaWdobGlnaHRlcigpOiBIaWdobGlnaHRlciB7XG4gIGVuc3VyZVN0eWxlcygpO1xuXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheVwiO1xuICBvdmVybGF5LnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBcInBvbGl0ZVwiKTtcblxuICBjb25zdCBzY3JpbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNjcmltLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fc2NyaW1cIjtcblxuICBjb25zdCBoaWdobGlnaHRCb3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoaWdobGlnaHRCb3guY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19oaWdobGlnaHRcIjtcblxuICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdG9vbHRpcC5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXBcIjtcblxuICBjb25zdCBwcm9ncmVzcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHByb2dyZXNzLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3NcIjtcblxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJoM1wiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X190aXRsZVwiO1xuXG4gIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwicFwiKTtcbiAgYm9keS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2JvZHlcIjtcblxuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnNcIjtcblxuICBjb25zdCBza2lwQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgc2tpcEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgc2tpcEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0XCI7XG4gIHNraXBCdG4udGV4dENvbnRlbnQgPSBcIlNraXBcIjtcblxuICBjb25zdCBuZXh0QnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgbmV4dEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgbmV4dEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnlcIjtcbiAgbmV4dEJ0bi50ZXh0Q29udGVudCA9IFwiTmV4dFwiO1xuXG4gIGFjdGlvbnMuYXBwZW5kKHNraXBCdG4sIG5leHRCdG4pO1xuICB0b29sdGlwLmFwcGVuZChwcm9ncmVzcywgdGl0bGUsIGJvZHksIGFjdGlvbnMpO1xuICBvdmVybGF5LmFwcGVuZChzY3JpbSwgaGlnaGxpZ2h0Qm94LCB0b29sdGlwKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICBsZXQgY3VycmVudFRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHJlc2l6ZU9ic2VydmVyOiBSZXNpemVPYnNlcnZlciB8IG51bGwgPSBudWxsO1xuICBsZXQgZnJhbWVIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgb25OZXh0OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IG9uU2tpcDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gc2NoZWR1bGVVcGRhdGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgaWYgKGZyYW1lSGFuZGxlICE9PSBudWxsKSByZXR1cm47XG4gICAgZnJhbWVIYW5kbGUgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICAgIHVwZGF0ZVBvc2l0aW9uKCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVQb3NpdGlvbigpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUpIHJldHVybjtcblxuICAgIGlmIChjdXJyZW50VGFyZ2V0KSB7XG4gICAgICBjb25zdCByZWN0ID0gY3VycmVudFRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IHBhZGRpbmcgPSAxMjtcbiAgICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMCwgcmVjdC53aWR0aCArIHBhZGRpbmcgKiAyKTtcbiAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDAsIHJlY3QuaGVpZ2h0ICsgcGFkZGluZyAqIDIpO1xuICAgICAgY29uc3QgbGVmdCA9IHJlY3QubGVmdCAtIHBhZGRpbmc7XG4gICAgICBjb25zdCB0b3AgPSByZWN0LnRvcCAtIHBhZGRpbmc7XG5cbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQobGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b3ApfXB4KWA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUud2lkdGggPSBgJHtNYXRoLnJvdW5kKHdpZHRoKX1weGA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gYCR7TWF0aC5yb3VuZChoZWlnaHQpfXB4YDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIHRvb2x0aXAuc3R5bGUubWF4V2lkdGggPSBgbWluKDM0MHB4LCAke01hdGgubWF4KDI2MCwgd2luZG93LmlubmVyV2lkdGggLSAzMil9cHgpYDtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBsZXQgdG9vbHRpcFRvcCA9IHJlY3QuYm90dG9tICsgMTg7XG4gICAgICBpZiAodG9vbHRpcFRvcCArIHRvb2x0aXBIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSAyMCkge1xuICAgICAgICB0b29sdGlwVG9wID0gTWF0aC5tYXgoMjAsIHJlY3QudG9wIC0gdG9vbHRpcEhlaWdodCAtIDE4KTtcbiAgICAgIH1cbiAgICAgIGxldCB0b29sdGlwTGVmdCA9IHJlY3QubGVmdCArIHJlY3Qud2lkdGggLyAyIC0gdG9vbHRpcFdpZHRoIC8gMjtcbiAgICAgIHRvb2x0aXBMZWZ0ID0gY2xhbXAodG9vbHRpcExlZnQsIDIwLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCAtIDIwKTtcbiAgICAgIHRvb2x0aXAuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQodG9vbHRpcExlZnQpfXB4LCAke01hdGgucm91bmQodG9vbHRpcFRvcCl9cHgpYDtcbiAgICB9IGVsc2Uge1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS53aWR0aCA9IFwiMHB4XCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gXCIwcHhcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh3aW5kb3cuaW5uZXJXaWR0aCAvIDIpfXB4LCAke01hdGgucm91bmQod2luZG93LmlubmVySGVpZ2h0IC8gMil9cHgpYDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBjb25zdCB0b29sdGlwTGVmdCA9IGNsYW1wKCh3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCkgLyAyLCAyMCwgd2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGggLSAyMCk7XG4gICAgICBjb25zdCB0b29sdGlwVG9wID0gY2xhbXAoKHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQpIC8gMiwgMjAsIHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQgLSAyMCk7XG4gICAgICB0b29sdGlwLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHRvb2x0aXBMZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvb2x0aXBUb3ApfXB4KWA7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKCk6IHZvaWQge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHNjaGVkdWxlVXBkYXRlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycygpOiB2b2lkIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBzY2hlZHVsZVVwZGF0ZSk7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUpO1xuICAgIGlmIChmcmFtZUhhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKGZyYW1lSGFuZGxlKTtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHJlc2l6ZU9ic2VydmVyKSB7XG4gICAgICByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgc2tpcEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBvblNraXA/LigpO1xuICB9KTtcblxuICBuZXh0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIG9uTmV4dD8uKCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIHJlbmRlclRvb2x0aXAob3B0aW9uczogSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCB7IHN0ZXBDb3VudCwgc3RlcEluZGV4LCB0aXRsZTogb3B0aW9uVGl0bGUsIGJvZHk6IG9wdGlvbkJvZHksIHNob3dOZXh0LCBuZXh0TGFiZWwsIHNob3dTa2lwLCBza2lwTGFiZWwgfSA9IG9wdGlvbnM7XG5cbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHN0ZXBDb3VudCkgJiYgc3RlcENvdW50ID4gMCkge1xuICAgICAgcHJvZ3Jlc3MudGV4dENvbnRlbnQgPSBgU3RlcCAke3N0ZXBJbmRleCArIDF9IG9mICR7c3RlcENvdW50fWA7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9ncmVzcy50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvblRpdGxlICYmIG9wdGlvblRpdGxlLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aXRsZS50ZXh0Q29udGVudCA9IG9wdGlvblRpdGxlO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGl0bGUudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIGJvZHkudGV4dENvbnRlbnQgPSBvcHRpb25Cb2R5O1xuXG4gICAgb25OZXh0ID0gc2hvd05leHQgPyBvcHRpb25zLm9uTmV4dCA/PyBudWxsIDogbnVsbDtcbiAgICBpZiAoc2hvd05leHQpIHtcbiAgICAgIG5leHRCdG4udGV4dENvbnRlbnQgPSBuZXh0TGFiZWwgPz8gXCJOZXh0XCI7XG4gICAgICBuZXh0QnRuLnN0eWxlLmRpc3BsYXkgPSBcImlubGluZS1mbGV4XCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHRCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIG9uU2tpcCA9IHNob3dTa2lwID8gb3B0aW9ucy5vblNraXAgPz8gbnVsbCA6IG51bGw7XG4gICAgaWYgKHNob3dTa2lwKSB7XG4gICAgICBza2lwQnRuLnRleHRDb250ZW50ID0gc2tpcExhYmVsID8/IFwiU2tpcFwiO1xuICAgICAgc2tpcEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJpbmxpbmUtZmxleFwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBza2lwQnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IHRydWU7XG4gICAgY3VycmVudFRhcmdldCA9IG9wdGlvbnMudGFyZ2V0ID8/IG51bGw7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICByZW5kZXJUb29sdGlwKG9wdGlvbnMpO1xuICAgIGlmIChyZXNpemVPYnNlcnZlcikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFRhcmdldCAmJiB0eXBlb2YgUmVzaXplT2JzZXJ2ZXIgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHNjaGVkdWxlVXBkYXRlKCkpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShjdXJyZW50VGFyZ2V0KTtcbiAgICB9XG4gICAgYXR0YWNoTGlzdGVuZXJzKCk7XG4gICAgc2NoZWR1bGVVcGRhdGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjtcbiAgICB0b29sdGlwLnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIGRldGFjaExpc3RlbmVycygpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlKCk7XG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2hvdyxcbiAgICBoaWRlLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNUWUxFX0lEKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgc3R5bGUuaWQgPSBTVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLnR1dG9yaWFsLW92ZXJsYXkge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgICB6LWluZGV4OiA1MDtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXkudmlzaWJsZSB7XG4gICAgICBkaXNwbGF5OiBibG9jaztcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3NjcmltIHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGluc2V0OiAwO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9faGlnaGxpZ2h0IHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gICAgICBib3JkZXI6IDJweCBzb2xpZCByZ2JhKDU2LCAxODksIDI0OCwgMC45NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDAgMCAycHggcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjUpLCAwIDAgMjRweCByZ2JhKDM0LCAyMTEsIDIzOCwgMC4yNSk7XG4gICAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC4xOHMgZWFzZSwgd2lkdGggMC4xOHMgZWFzZSwgaGVpZ2h0IDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgbWluLXdpZHRoOiAyNDBweDtcbiAgICAgIG1heC13aWR0aDogbWluKDM0MHB4LCBjYWxjKDEwMHZ3IC0gMzJweCkpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgxNSwgMjMsIDQyLCAwLjk1KTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNnB4O1xuICAgICAgcGFkZGluZzogMTZweCAxOHB4O1xuICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICBib3gtc2hhZG93OiAwIDEycHggMzJweCByZ2JhKDE1LCAyMywgNDIsIDAuNTUpO1xuICAgICAgcG9pbnRlci1ldmVudHM6IGF1dG87XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdmlzaWJpbGl0eTogaGlkZGVuO1xuICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoMHB4LCAwcHgpO1xuICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzIHtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC43NSk7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X190aXRsZSB7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgICBmb250LXNpemU6IDE1cHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wNGVtO1xuICAgICAgY29sb3I6ICNmMWY1Zjk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19ib2R5IHtcbiAgICAgIG1hcmdpbjogMCAwIDE0cHg7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBsaW5lLWhlaWdodDogMS41O1xuICAgICAgY29sb3I6ICNjYmQ1ZjU7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBnYXA6IDEwcHg7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICBwYWRkaW5nOiA2cHggMTRweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDk5OXB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeSB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4yNSk7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjU1KTtcbiAgICAgIGNvbG9yOiAjZjhmYWZjO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5OmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjM1KTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3Qge1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBjb2xvcjogcmdiYSgyMDMsIDIxMywgMjI1LCAwLjkpO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdDpob3ZlciB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMjAzLCAyMTMsIDIyNSwgMC41NSk7XG4gICAgfVxuICAgIEBtZWRpYSAobWF4LXdpZHRoOiA3NjhweCkge1xuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgICBtaW4td2lkdGg6IDIwMHB4O1xuICAgICAgICBtYXgtd2lkdGg6IG1pbigzMjBweCwgY2FsYygxMDB2dyAtIDI0cHgpKTtcbiAgICAgICAgcGFkZGluZzogMTBweCAxMnB4O1xuICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogcm93O1xuICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBnYXA6IDEycHg7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3Mge1xuICAgICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fdGl0bGUge1xuICAgICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYm9keSB7XG4gICAgICAgIG1hcmdpbjogMDtcbiAgICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgICBmbGV4OiAxO1xuICAgICAgICBsaW5lLWhlaWdodDogMS40O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnMge1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgICAgcGFkZGluZzogNXB4IDEwcHg7XG4gICAgICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICAgIH1cbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuIiwgImNvbnN0IFNUT1JBR0VfUFJFRklYID0gXCJsc2Q6dHV0b3JpYWw6XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxQcm9ncmVzcyB7XG4gIHN0ZXBJbmRleDogbnVtYmVyO1xuICBjb21wbGV0ZWQ6IGJvb2xlYW47XG4gIHVwZGF0ZWRBdDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBnZXRTdG9yYWdlKCk6IFN0b3JhZ2UgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIiB8fCAhd2luZG93LmxvY2FsU3RvcmFnZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRQcm9ncmVzcyhpZDogc3RyaW5nKTogVHV0b3JpYWxQcm9ncmVzcyB8IG51bGwge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IHN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX1BSRUZJWCArIGlkKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFR1dG9yaWFsUHJvZ3Jlc3M7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHBhcnNlZCAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQgPT09IG51bGwgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuc3RlcEluZGV4ICE9PSBcIm51bWJlclwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmNvbXBsZXRlZCAhPT0gXCJib29sZWFuXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQudXBkYXRlZEF0ICE9PSBcIm51bWJlclwiXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnNlZDtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVQcm9ncmVzcyhpZDogc3RyaW5nLCBwcm9ncmVzczogVHV0b3JpYWxQcm9ncmVzcyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnNldEl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCwgSlNPTi5zdHJpbmdpZnkocHJvZ3Jlc3MpKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gaWdub3JlIHN0b3JhZ2UgZmFpbHVyZXNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJQcm9ncmVzcyhpZDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2UucmVtb3ZlSXRlbShTVE9SQUdFX1BSRUZJWCArIGlkKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gaWdub3JlIHN0b3JhZ2UgZmFpbHVyZXNcbiAgfVxufVxuIiwgImV4cG9ydCB0eXBlIFJvbGVJZCA9XG4gIHwgXCJjYW52YXNcIlxuICB8IFwic2hpcFNldFwiXG4gIHwgXCJzaGlwU2VsZWN0XCJcbiAgfCBcInNoaXBEZWxldGVcIlxuICB8IFwic2hpcENsZWFyXCJcbiAgfCBcInNoaXBTcGVlZFNsaWRlclwiXG4gIHwgXCJoZWF0QmFyXCJcbiAgfCBcInNwZWVkTWFya2VyXCJcbiAgfCBcIm1pc3NpbGVTZXRcIlxuICB8IFwibWlzc2lsZVNlbGVjdFwiXG4gIHwgXCJtaXNzaWxlRGVsZXRlXCJcbiAgfCBcIm1pc3NpbGVTcGVlZFNsaWRlclwiXG4gIHwgXCJtaXNzaWxlQWdyb1NsaWRlclwiXG4gIHwgXCJtaXNzaWxlQWRkUm91dGVcIlxuICB8IFwibWlzc2lsZUxhdW5jaFwiXG4gIHwgXCJyb3V0ZVByZXZcIlxuICB8IFwicm91dGVOZXh0XCJcbiAgfCBcImhlbHBUb2dnbGVcIlxuICB8IFwidHV0b3JpYWxTdGFydFwiXG4gIHwgXCJzcGF3bkJvdFwiO1xuXG5leHBvcnQgdHlwZSBSb2xlUmVzb2x2ZXIgPSAoKSA9PiBIVE1MRWxlbWVudCB8IG51bGw7XG5cbmV4cG9ydCB0eXBlIFJvbGVzTWFwID0gUmVjb3JkPFJvbGVJZCwgUm9sZVJlc29sdmVyPjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJvbGVzKCk6IFJvbGVzTWFwIHtcbiAgcmV0dXJuIHtcbiAgICBjYW52YXM6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3ZcIiksXG4gICAgc2hpcFNldDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNldFwiKSxcbiAgICBzaGlwU2VsZWN0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0XCIpLFxuICAgIHNoaXBEZWxldGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1kZWxldGVcIiksXG4gICAgc2hpcENsZWFyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIiksXG4gICAgc2hpcFNwZWVkU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtc2xpZGVyXCIpLFxuICAgIGhlYXRCYXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItY29udGFpbmVyXCIpLFxuICAgIHNwZWVkTWFya2VyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkLW1hcmtlclwiKSxcbiAgICBtaXNzaWxlU2V0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2V0XCIpLFxuICAgIG1pc3NpbGVTZWxlY3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZWxlY3RcIiksXG4gICAgbWlzc2lsZURlbGV0ZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWRlbGV0ZVwiKSxcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1zbGlkZXJcIiksXG4gICAgbWlzc2lsZUFncm9TbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXNsaWRlclwiKSxcbiAgICBtaXNzaWxlQWRkUm91dGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIiksXG4gICAgbWlzc2lsZUxhdW5jaDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaFwiKSxcbiAgICByb3V0ZVByZXY6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtcHJldlwiKSxcbiAgICByb3V0ZU5leHQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbmV4dFwiKSxcbiAgICBoZWxwVG9nZ2xlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtdG9nZ2xlXCIpLFxuICAgIHR1dG9yaWFsU3RhcnQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidHV0b3JpYWwtc3RhcnRcIiksXG4gICAgc3Bhd25Cb3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Um9sZUVsZW1lbnQocm9sZXM6IFJvbGVzTWFwLCByb2xlOiBSb2xlSWQgfCBudWxsIHwgdW5kZWZpbmVkKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgaWYgKCFyb2xlKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcmVzb2x2ZXIgPSByb2xlc1tyb2xlXTtcbiAgcmV0dXJuIHJlc29sdmVyID8gcmVzb2x2ZXIoKSA6IG51bGw7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cywgRXZlbnRLZXkgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVIaWdobGlnaHRlciwgdHlwZSBIaWdobGlnaHRlciB9IGZyb20gXCIuL2hpZ2hsaWdodFwiO1xuaW1wb3J0IHsgY2xlYXJQcm9ncmVzcywgbG9hZFByb2dyZXNzLCBzYXZlUHJvZ3Jlc3MgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBnZXRSb2xlRWxlbWVudCwgdHlwZSBSb2xlSWQsIHR5cGUgUm9sZXNNYXAgfSBmcm9tIFwiLi9yb2xlc1wiO1xuXG5leHBvcnQgdHlwZSBTdGVwQWR2YW5jZSA9XG4gIHwge1xuICAgICAga2luZDogXCJldmVudFwiO1xuICAgICAgZXZlbnQ6IEV2ZW50S2V5O1xuICAgICAgd2hlbj86IChwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuO1xuICAgICAgY2hlY2s/OiAoKSA9PiBib29sZWFuO1xuICAgIH1cbiAgfCB7XG4gICAgICBraW5kOiBcIm1hbnVhbFwiO1xuICAgICAgbmV4dExhYmVsPzogc3RyaW5nO1xuICAgIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxTdGVwIHtcbiAgaWQ6IHN0cmluZztcbiAgdGFyZ2V0OiBSb2xlSWQgfCAoKCkgPT4gSFRNTEVsZW1lbnQgfCBudWxsKSB8IG51bGw7XG4gIHRpdGxlPzogc3RyaW5nO1xuICBib2R5OiBzdHJpbmc7XG4gIGFkdmFuY2U6IFN0ZXBBZHZhbmNlO1xuICBvbkVudGVyPzogKCkgPT4gdm9pZDtcbiAgb25FeGl0PzogKCkgPT4gdm9pZDtcbiAgYWxsb3dTa2lwPzogYm9vbGVhbjtcbiAgc2tpcExhYmVsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgRW5naW5lT3B0aW9ucyB7XG4gIGlkOiBzdHJpbmc7XG4gIGJ1czogRXZlbnRCdXM7XG4gIHJvbGVzOiBSb2xlc01hcDtcbiAgc3RlcHM6IFR1dG9yaWFsU3RlcFtdO1xufVxuXG5pbnRlcmZhY2UgU3RhcnRPcHRpb25zIHtcbiAgcmVzdW1lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbEVuZ2luZSB7XG4gIHN0YXJ0KG9wdGlvbnM/OiBTdGFydE9wdGlvbnMpOiB2b2lkO1xuICByZXN0YXJ0KCk6IHZvaWQ7XG4gIHN0b3AoKTogdm9pZDtcbiAgaXNSdW5uaW5nKCk6IGJvb2xlYW47XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVR1dG9yaWFsRW5naW5lKHsgaWQsIGJ1cywgcm9sZXMsIHN0ZXBzIH06IEVuZ2luZU9wdGlvbnMpOiBUdXRvcmlhbEVuZ2luZSB7XG4gIGNvbnN0IGhpZ2hsaWdodGVyOiBIaWdobGlnaHRlciA9IGNyZWF0ZUhpZ2hsaWdodGVyKCk7XG4gIGxldCBydW5uaW5nID0gZmFsc2U7XG4gIGxldCBwYXVzZWQgPSBmYWxzZTtcbiAgbGV0IGN1cnJlbnRJbmRleCA9IC0xO1xuICBsZXQgY3VycmVudFN0ZXA6IFR1dG9yaWFsU3RlcCB8IG51bGwgPSBudWxsO1xuICBsZXQgY2xlYW51cEN1cnJlbnQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgcmVuZGVyQ3VycmVudDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBmYWxzZTtcbiAgbGV0IHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuXG4gIGNvbnN0IHBlcnNpc3RlbnRMaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cbiAgcGVyc2lzdGVudExpc3RlbmVycy5wdXNoKFxuICAgIGJ1cy5vbihcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgKHsgdmlzaWJsZSB9KSA9PiB7XG4gICAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICAgIHBhdXNlZCA9IEJvb2xlYW4odmlzaWJsZSk7XG4gICAgICBpZiAocGF1c2VkKSB7XG4gICAgICAgIGhpZ2hsaWdodGVyLmhpZGUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlbmRlckN1cnJlbnQ/LigpO1xuICAgICAgfVxuICAgIH0pLFxuICApO1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVUYXJnZXQoc3RlcDogVHV0b3JpYWxTdGVwKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgICBpZiAoIXN0ZXAudGFyZ2V0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBzdGVwLnRhcmdldCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICByZXR1cm4gc3RlcC50YXJnZXQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGdldFJvbGVFbGVtZW50KHJvbGVzLCBzdGVwLnRhcmdldCk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGFtcEluZGV4KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHJldHVybiAwO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGluZGV4KSB8fCBpbmRleCA8IDApIHJldHVybiAwO1xuICAgIGlmIChpbmRleCA+PSBzdGVwcy5sZW5ndGgpIHJldHVybiBzdGVwcy5sZW5ndGggLSAxO1xuICAgIHJldHVybiBNYXRoLmZsb29yKGluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFN0ZXAoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSBzdGVwcy5sZW5ndGgpIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnRTdGVwKSB7XG4gICAgICBjdXJyZW50U3RlcC5vbkV4aXQ/LigpO1xuICAgICAgY3VycmVudFN0ZXAgPSBudWxsO1xuICAgIH1cblxuICAgIGN1cnJlbnRJbmRleCA9IGluZGV4O1xuICAgIGNvbnN0IHN0ZXAgPSBzdGVwc1tpbmRleF07XG4gICAgY3VycmVudFN0ZXAgPSBzdGVwO1xuXG4gICAgcGVyc2lzdFByb2dyZXNzKGluZGV4LCBmYWxzZSk7XG5cbiAgICBidXMuZW1pdChcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCIsIHsgaWQsIHN0ZXBJbmRleDogaW5kZXgsIHRvdGFsOiBzdGVwcy5sZW5ndGggfSk7XG4gICAgc3RlcC5vbkVudGVyPy4oKTtcblxuICAgIGNvbnN0IGFsbG93U2tpcCA9IHN0ZXAuYWxsb3dTa2lwICE9PSBmYWxzZTtcbiAgICBjb25zdCByZW5kZXIgPSAoKTogdm9pZCA9PiB7XG4gICAgICBpZiAoIXJ1bm5pbmcgfHwgcGF1c2VkKSByZXR1cm47XG4gICAgICBoaWdobGlnaHRlci5zaG93KHtcbiAgICAgICAgdGFyZ2V0OiByZXNvbHZlVGFyZ2V0KHN0ZXApLFxuICAgICAgICB0aXRsZTogc3RlcC50aXRsZSxcbiAgICAgICAgYm9keTogc3RlcC5ib2R5LFxuICAgICAgICBzdGVwSW5kZXg6IGluZGV4LFxuICAgICAgICBzdGVwQ291bnQ6IHN0ZXBzLmxlbmd0aCxcbiAgICAgICAgc2hvd05leHQ6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiLFxuICAgICAgICBuZXh0TGFiZWw6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiXG4gICAgICAgICAgPyBzdGVwLmFkdmFuY2UubmV4dExhYmVsID8/IChpbmRleCA9PT0gc3RlcHMubGVuZ3RoIC0gMSA/IFwiRmluaXNoXCIgOiBcIk5leHRcIilcbiAgICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgICAgb25OZXh0OiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIiA/IGFkdmFuY2VTdGVwIDogdW5kZWZpbmVkLFxuICAgICAgICBzaG93U2tpcDogYWxsb3dTa2lwLFxuICAgICAgICBza2lwTGFiZWw6IHN0ZXAuc2tpcExhYmVsLFxuICAgICAgICBvblNraXA6IGFsbG93U2tpcCA/IHNraXBDdXJyZW50U3RlcCA6IHVuZGVmaW5lZCxcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICByZW5kZXJDdXJyZW50ID0gcmVuZGVyO1xuICAgIHJlbmRlcigpO1xuXG4gICAgaWYgKHN0ZXAuYWR2YW5jZS5raW5kID09PSBcImV2ZW50XCIpIHtcbiAgICAgIGNvbnN0IGhhbmRsZXIgPSAocGF5bG9hZDogdW5rbm93bik6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoIXJ1bm5pbmcgfHwgcGF1c2VkKSByZXR1cm47XG4gICAgICAgIGlmIChzdGVwLmFkdmFuY2Uud2hlbiAmJiAhc3RlcC5hZHZhbmNlLndoZW4ocGF5bG9hZCkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgYWR2YW5jZVRvKGluZGV4ICsgMSk7XG4gICAgICB9O1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBidXMub24oc3RlcC5hZHZhbmNlLmV2ZW50LCBoYW5kbGVyIGFzICh2YWx1ZTogbmV2ZXIpID0+IHZvaWQpO1xuICAgICAgaWYgKHN0ZXAuYWR2YW5jZS5jaGVjayAmJiBzdGVwLmFkdmFuY2UuY2hlY2soKSkge1xuICAgICAgICBoYW5kbGVyKHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlVG8obmV4dEluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG4gICAgcmVuZGVyQ3VycmVudCA9IG51bGw7XG4gICAgaWYgKG5leHRJbmRleCA+PSBzdGVwcy5sZW5ndGgpIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0U3RlcChuZXh0SW5kZXgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGFkdmFuY2VTdGVwKCk6IHZvaWQge1xuICAgIGFkdmFuY2VUbyhjdXJyZW50SW5kZXggKyAxKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNraXBDdXJyZW50U3RlcCgpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBjb25zdCBuZXh0SW5kZXggPSBjdXJyZW50SW5kZXggPj0gMCA/IGN1cnJlbnRJbmRleCArIDEgOiAwO1xuICAgIGFkdmFuY2VUbyhuZXh0SW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gY29tcGxldGVUdXRvcmlhbCgpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSB0cnVlO1xuICAgIHBlcnNpc3RQcm9ncmVzcyhzdGVwcy5sZW5ndGgsIHRydWUpO1xuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6Y29tcGxldGVkXCIsIHsgaWQgfSk7XG4gICAgc3RvcCgpO1xuICAgIHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnQob3B0aW9ucz86IFN0YXJ0T3B0aW9ucyk6IHZvaWQge1xuICAgIGNvbnN0IHJlc3VtZSA9IG9wdGlvbnM/LnJlc3VtZSAhPT0gZmFsc2U7XG4gICAgaWYgKHJ1bm5pbmcpIHtcbiAgICAgIHJlc3RhcnQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBydW5uaW5nID0gdHJ1ZTtcbiAgICBwYXVzZWQgPSBmYWxzZTtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcbiAgICBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBmYWxzZTtcbiAgICBsZXQgc3RhcnRJbmRleCA9IDA7XG4gICAgaWYgKHJlc3VtZSkge1xuICAgICAgY29uc3QgcHJvZ3Jlc3MgPSBsb2FkUHJvZ3Jlc3MoaWQpO1xuICAgICAgaWYgKHByb2dyZXNzICYmICFwcm9ncmVzcy5jb21wbGV0ZWQpIHtcbiAgICAgICAgc3RhcnRJbmRleCA9IGNsYW1wSW5kZXgocHJvZ3Jlc3Muc3RlcEluZGV4KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2xlYXJQcm9ncmVzcyhpZCk7XG4gICAgfVxuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6c3RhcnRlZFwiLCB7IGlkIH0pO1xuICAgIHNldFN0ZXAoc3RhcnRJbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiByZXN0YXJ0KCk6IHZvaWQge1xuICAgIHN0b3AoKTtcbiAgICBzdGFydCh7IHJlc3VtZTogZmFsc2UgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzdG9wKCk6IHZvaWQge1xuICAgIGNvbnN0IHNob3VsZFBlcnNpc3QgPSAhc3VwcHJlc3NQZXJzaXN0T25TdG9wICYmIHJ1bm5pbmcgJiYgIWxhc3RTYXZlZENvbXBsZXRlZCAmJiBjdXJyZW50SW5kZXggPj0gMCAmJiBjdXJyZW50SW5kZXggPCBzdGVwcy5sZW5ndGg7XG4gICAgY29uc3QgaW5kZXhUb1BlcnNpc3QgPSBjdXJyZW50SW5kZXg7XG5cbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHNob3VsZFBlcnNpc3QpIHtcbiAgICAgIHBlcnNpc3RQcm9ncmVzcyhpbmRleFRvUGVyc2lzdCwgZmFsc2UpO1xuICAgIH1cbiAgICBydW5uaW5nID0gZmFsc2U7XG4gICAgcGF1c2VkID0gZmFsc2U7XG4gICAgY3VycmVudEluZGV4ID0gLTE7XG4gICAgcmVuZGVyQ3VycmVudCA9IG51bGw7XG4gICAgaGlnaGxpZ2h0ZXIuaGlkZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNSdW5uaW5nKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBydW5uaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBzdG9wKCk7XG4gICAgZm9yIChjb25zdCBkaXNwb3NlIG9mIHBlcnNpc3RlbnRMaXN0ZW5lcnMpIHtcbiAgICAgIGRpc3Bvc2UoKTtcbiAgICB9XG4gICAgaGlnaGxpZ2h0ZXIuZGVzdHJveSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGVyc2lzdFByb2dyZXNzKHN0ZXBJbmRleDogbnVtYmVyLCBjb21wbGV0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBjb21wbGV0ZWQ7XG4gICAgc2F2ZVByb2dyZXNzKGlkLCB7XG4gICAgICBzdGVwSW5kZXgsXG4gICAgICBjb21wbGV0ZWQsXG4gICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHN0YXJ0LFxuICAgIHJlc3RhcnQsXG4gICAgc3RvcCxcbiAgICBpc1J1bm5pbmcsXG4gICAgZGVzdHJveSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFR1dG9yaWFsU3RlcCB9IGZyb20gXCIuL2VuZ2luZVwiO1xuXG5mdW5jdGlvbiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkOiB1bmtub3duLCBtaW5JbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGluZGV4ID0gKHBheWxvYWQgYXMgeyBpbmRleD86IHVua25vd24gfSkuaW5kZXg7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09IFwibnVtYmVyXCIgfHwgIU51bWJlci5pc0Zpbml0ZShpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGluZGV4ID49IG1pbkluZGV4O1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Um91dGVJZChwYXlsb2FkOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgcm91dGVJZCA9IChwYXlsb2FkIGFzIHsgcm91dGVJZD86IHVua25vd24gfSkucm91dGVJZDtcbiAgcmV0dXJuIHR5cGVvZiByb3V0ZUlkID09PSBcInN0cmluZ1wiID8gcm91dGVJZCA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIHBheWxvYWRUb29sRXF1YWxzKHRhcmdldDogc3RyaW5nKTogKHBheWxvYWQ6IHVua25vd24pID0+IGJvb2xlYW4ge1xuICByZXR1cm4gKHBheWxvYWQ6IHVua25vd24pOiBib29sZWFuID0+IHtcbiAgICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHRvb2wgPSAocGF5bG9hZCBhcyB7IHRvb2w/OiB1bmtub3duIH0pLnRvb2w7XG4gICAgcmV0dXJuIHR5cGVvZiB0b29sID09PSBcInN0cmluZ1wiICYmIHRvb2wgPT09IHRhcmdldDtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJhc2ljVHV0b3JpYWxTdGVwcygpOiBUdXRvcmlhbFN0ZXBbXSB7XG4gIGxldCByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA9IDA7XG4gIGxldCBpbml0aWFsUm91dGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBuZXdSb3V0ZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICByZXR1cm4gW1xuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtcGxvdC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCBhIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkNsaWNrIG9uIHRoZSBtYXAgdG8gZHJvcCBhdCBsZWFzdCB0aHJlZSB3YXlwb2ludHMgYW5kIHNrZXRjaCB5b3VyIGNvdXJzZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IGhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDIpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtY2hhbmdlLXNwZWVkXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcFNwZWVkU2xpZGVyXCIsXG4gICAgICB0aXRsZTogXCJBZGp1c3Qgc2hpcCBzcGVlZFwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIFNoaXAgU3BlZWQgc2xpZGVyIChvciBwcmVzcyBbIC8gXSkgdG8gZmluZS10dW5lIHlvdXIgdHJhdmVsIHNwZWVkLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6c3BlZWRDaGFuZ2VkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1zZWxlY3QtbGVnXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcFNlbGVjdFwiLFxuICAgICAgdGl0bGU6IFwiU2VsZWN0IGEgcm91dGUgbGVnXCIsXG4gICAgICBib2R5OiBcIlN3aXRjaCB0byBTZWxlY3QgbW9kZSAoVCBrZXkpIGFuZCB0aGVuIGNsaWNrIGEgd2F5cG9pbnQgb24gdGhlIG1hcCB0byBoaWdobGlnaHQgaXRzIGxlZy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOmxlZ1NlbGVjdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAwKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LW1hdGNoLW1hcmtlclwiLFxuICAgICAgdGFyZ2V0OiBcInNwZWVkTWFya2VyXCIsXG4gICAgICB0aXRsZTogXCJNYXRjaCB0aGUgbWFya2VyXCIsXG4gICAgICBib2R5OiBcIkxpbmUgdXAgdGhlIFNoaXAgU3BlZWQgc2xpZGVyIHdpdGggdGhlIHRpY2sgdG8gY3J1aXNlIGF0IHRoZSBuZXV0cmFsIGhlYXQgc3BlZWQuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDptYXJrZXJBbGlnbmVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtcHVzaC1ob3RcIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJTcHJpbnQgaW50byB0aGUgcmVkXCIsXG4gICAgICBib2R5OiBcIlB1c2ggdGhlIHRocm90dGxlIGFib3ZlIHRoZSBtYXJrZXIgYW5kIHdhdGNoIHRoZSBoZWF0IGJhciByZWFjaCB0aGUgd2FybmluZyBiYW5kLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6d2FybkVudGVyZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1jb29sLWRvd25cIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJDb29sIGl0IGJhY2sgZG93blwiLFxuICAgICAgYm9keTogXCJFYXNlIG9mZiBiZWxvdyB0aGUgbWFya2VyIHVudGlsIHRoZSBiYXIgZHJvcHMgb3V0IG9mIHRoZSB3YXJuaW5nIHpvbmUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDpjb29sZWRCZWxvd1dhcm5cIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC10cmlnZ2VyLXN0YWxsXCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiVHJpZ2dlciBhIHN0YWxsXCIsXG4gICAgICBib2R5OiBcIlB1c2ggd2VsbCBhYm92ZSB0aGUgbGltaXQgYW5kIGhvbGQgaXQgdW50aWwgdGhlIG92ZXJoZWF0IHN0YWxsIG92ZXJsYXkgYXBwZWFycy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0OnN0YWxsVHJpZ2dlcmVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtcmVjb3Zlci1zdGFsbFwiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIlJlY292ZXIgZnJvbSB0aGUgc3RhbGxcIixcbiAgICAgIGJvZHk6IFwiSG9sZCBzdGVhZHkgd2hpbGUgc3lzdGVtcyBjb29sLiBPbmNlIHRoZSBvdmVybGF5IGNsZWFycywgeW91XHUyMDE5cmUgYmFjayBvbmxpbmUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LWR1YWwtYmFyc1wiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIlJlYWQgYm90aCBoZWF0IGJhcnNcIixcbiAgICAgIGJvZHk6IFwiQWRqdXN0IGEgd2F5cG9pbnQgdG8gbWFrZSB0aGUgcGxhbm5lZCBiYXIgZXh0ZW5kIHBhc3QgbGl2ZSBoZWF0LiBVc2UgaXQgdG8gcHJlZGljdCBmdXR1cmUgb3ZlcmxvYWRzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6ZHVhbE1ldGVyRGl2ZXJnZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1kZWxldGUtbGVnXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcERlbGV0ZVwiLFxuICAgICAgdGl0bGU6IFwiRGVsZXRlIGEgcm91dGUgbGVnXCIsXG4gICAgICBib2R5OiBcIlJlbW92ZSB0aGUgc2VsZWN0ZWQgd2F5cG9pbnQgdXNpbmcgdGhlIERlbGV0ZSBjb250cm9sIG9yIHRoZSBEZWxldGUga2V5LlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6d2F5cG9pbnREZWxldGVkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1jbGVhci1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBDbGVhclwiLFxuICAgICAgdGl0bGU6IFwiQ2xlYXIgdGhlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkNsZWFyIHJlbWFpbmluZyB3YXlwb2ludHMgdG8gcmVzZXQgeW91ciBwbG90dGVkIGNvdXJzZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOmNsZWFySW52b2tlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtc2V0LW1vZGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlU2V0XCIsXG4gICAgICB0aXRsZTogXCJTd2l0Y2ggdG8gbWlzc2lsZSBwbGFubmluZ1wiLFxuICAgICAgYm9keTogXCJUYXAgU2V0IHNvIGV2ZXJ5IGNsaWNrIGRyb3BzIG1pc3NpbGUgd2F5cG9pbnRzIG9uIHRoZSBhY3RpdmUgcm91dGUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLFxuICAgICAgICB3aGVuOiBwYXlsb2FkVG9vbEVxdWFscyhcInNldFwiKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXBsb3QtaW5pdGlhbFwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCBtaXNzaWxlIHdheXBvaW50c1wiLFxuICAgICAgYm9keTogXCJDbGljayB0aGUgbWFwIHRvIGRyb3AgYXQgbGVhc3QgdHdvIGd1aWRhbmNlIHBvaW50cyBmb3IgdGhlIGN1cnJlbnQgbWlzc2lsZSByb3V0ZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBpZiAoIWhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDEpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmIChyb3V0ZUlkKSB7XG4gICAgICAgICAgICBpbml0aWFsUm91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLWluaXRpYWxcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggdGhlIHN0cmlrZVwiLFxuICAgICAgYm9keTogXCJTZW5kIHRoZSBwbGFubmVkIG1pc3NpbGUgcm91dGUgbGl2ZSB3aXRoIHRoZSBMYXVuY2ggY29udHJvbCAoTCBrZXkpLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCkge1xuICAgICAgICAgICAgaW5pdGlhbFJvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWFkZC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVBZGRSb3V0ZVwiLFxuICAgICAgdGl0bGU6IFwiQ3JlYXRlIGEgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiUHJlc3MgTmV3IHRvIGFkZCBhIHNlY29uZCBtaXNzaWxlIHJvdXRlIGZvciBhbm90aGVyIHN0cmlrZSBncm91cC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOnJvdXRlQWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFyb3V0ZUlkKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgbmV3Um91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1wbG90LW5ldy1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCB0aGUgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiRHJvcCBhdCBsZWFzdCB0d28gd2F5cG9pbnRzIG9uIHRoZSBuZXcgcm91dGUgdG8gZGVmaW5lIGl0cyBwYXRoLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGlmICghaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKG5ld1JvdXRlSWQgJiYgcm91dGVJZCAmJiByb3V0ZUlkICE9PSBuZXdSb3V0ZUlkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghbmV3Um91dGVJZCAmJiByb3V0ZUlkKSB7XG4gICAgICAgICAgICBuZXdSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtbmV3LXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIHRoZSBuZXcgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiTGF1bmNoIHRoZSBmcmVzaCBtaXNzaWxlIHJvdXRlIHRvIGNvbmZpcm0gaXRzIHBhdHRlcm4uXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFuZXdSb3V0ZUlkIHx8ICFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gbmV3Um91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXN3aXRjaC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcInJvdXRlTmV4dFwiLFxuICAgICAgdGl0bGU6IFwiU3dpdGNoIGJhY2sgdG8gdGhlIG9yaWdpbmFsIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgXHUyNUMwIFx1MjVCNiBjb250cm9scyAob3IgVGFiL1NoaWZ0K1RhYikgdG8gc2VsZWN0IHlvdXIgZmlyc3QgbWlzc2lsZSByb3V0ZSBhZ2Fpbi5cIixcbiAgICAgIG9uRW50ZXI6ICgpID0+IHtcbiAgICAgICAgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPSAwO1xuICAgICAgfSxcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyICs9IDE7XG4gICAgICAgICAgaWYgKHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyIDwgMSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkIHx8ICFyb3V0ZUlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLWFmdGVyLXN3aXRjaFwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCBmcm9tIHRoZSBvdGhlciByb3V0ZVwiLFxuICAgICAgYm9keTogXCJGaXJlIHRoZSBvcmlnaW5hbCBtaXNzaWxlIHJvdXRlIHRvIHByYWN0aWNlIHJvdW5kLXJvYmluIHN0cmlrZXMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCB8fCAhcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInR1dG9yaWFsLXByYWN0aWNlXCIsXG4gICAgICB0YXJnZXQ6IFwic3Bhd25Cb3RcIixcbiAgICAgIHRpdGxlOiBcIlNwYXduIGEgcHJhY3RpY2UgYm90XCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgQm90IGNvbnRyb2wgdG8gYWRkIGEgdGFyZ2V0IGFuZCByZWhlYXJzZSB0aGVzZSBtYW5ldXZlcnMgaW4gcmVhbCB0aW1lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImJvdDpzcGF3blJlcXVlc3RlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJ0dXRvcmlhbC1jb21wbGV0ZVwiLFxuICAgICAgdGFyZ2V0OiBudWxsLFxuICAgICAgdGl0bGU6IFwiWW91XHUyMDE5cmUgcmVhZHlcIixcbiAgICAgIGJvZHk6IFwiR3JlYXQgd29yay4gUmVsb2FkIHRoZSBjb25zb2xlIG9yIHJlam9pbiBhIHJvb20gdG8gcmV2aXNpdCB0aGVzZSBkcmlsbHMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwibWFudWFsXCIsXG4gICAgICAgIG5leHRMYWJlbDogXCJGaW5pc2hcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gIF07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZVR1dG9yaWFsRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBjcmVhdGVSb2xlcyB9IGZyb20gXCIuL3JvbGVzXCI7XG5pbXBvcnQgeyBnZXRCYXNpY1R1dG9yaWFsU3RlcHMgfSBmcm9tIFwiLi9zdGVwc19iYXNpY1wiO1xuZXhwb3J0IGNvbnN0IEJBU0lDX1RVVE9SSUFMX0lEID0gXCJzaGlwLWJhc2ljc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsQ29udHJvbGxlciB7XG4gIHN0YXJ0KG9wdGlvbnM/OiB7IHJlc3VtZT86IGJvb2xlYW4gfSk6IHZvaWQ7XG4gIHJlc3RhcnQoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRUdXRvcmlhbChidXM6IEV2ZW50QnVzKTogVHV0b3JpYWxDb250cm9sbGVyIHtcbiAgY29uc3Qgcm9sZXMgPSBjcmVhdGVSb2xlcygpO1xuICBjb25zdCBlbmdpbmUgPSBjcmVhdGVUdXRvcmlhbEVuZ2luZSh7XG4gICAgaWQ6IEJBU0lDX1RVVE9SSUFMX0lELFxuICAgIGJ1cyxcbiAgICByb2xlcyxcbiAgICBzdGVwczogZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzKCksXG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RhcnQob3B0aW9ucykge1xuICAgICAgZW5naW5lLnN0YXJ0KG9wdGlvbnMpO1xuICAgIH0sXG4gICAgcmVzdGFydCgpIHtcbiAgICAgIGVuZ2luZS5yZXN0YXJ0KCk7XG4gICAgfSxcbiAgICBkZXN0cm95KCkge1xuICAgICAgZW5naW5lLmRlc3Ryb3koKTtcbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVDaG9pY2Uge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVDb250ZW50IHtcbiAgc3BlYWtlcjogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIGludGVudD86IFwiZmFjdG9yeVwiIHwgXCJ1bml0XCI7XG4gIGNob2ljZXM/OiBEaWFsb2d1ZUNob2ljZVtdO1xuICB0eXBpbmdTcGVlZE1zPzogbnVtYmVyO1xuICBvbkNob2ljZT86IChjaG9pY2VJZDogc3RyaW5nKSA9PiB2b2lkO1xuICBvblRleHRGdWxseVJlbmRlcmVkPzogKCkgPT4gdm9pZDtcbiAgb25Db250aW51ZT86ICgpID0+IHZvaWQ7XG4gIGNvbnRpbnVlTGFiZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVPdmVybGF5IHtcbiAgc2hvdyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkO1xuICBoaWRlKCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgaXNWaXNpYmxlKCk6IGJvb2xlYW47XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJkaWFsb2d1ZS1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkoKTogRGlhbG9ndWVPdmVybGF5IHtcbiAgZW5zdXJlU3R5bGVzKCk7XG5cbiAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1vdmVybGF5XCI7XG4gIG92ZXJsYXkuc2V0QXR0cmlidXRlKFwiYXJpYS1saXZlXCIsIFwicG9saXRlXCIpO1xuXG4gIGNvbnN0IGNvbnNvbGVGcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGNvbnNvbGVGcmFtZS5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNvbnNvbGVcIjtcblxuICBjb25zdCBzcGVha2VyTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzcGVha2VyTGFiZWwuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1zcGVha2VyXCI7XG5cbiAgY29uc3QgdGV4dEJsb2NrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGV4dEJsb2NrLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtdGV4dFwiO1xuXG4gIGNvbnN0IGN1cnNvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBjdXJzb3IuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jdXJzb3JcIjtcbiAgY3Vyc29yLnRleHRDb250ZW50ID0gXCJfXCI7XG5cbiAgY29uc3QgY2hvaWNlc0xpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidWxcIik7XG4gIGNob2ljZXNMaXN0LmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY2hvaWNlcyBoaWRkZW5cIjtcblxuICBjb25zdCBjb250aW51ZUJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGNvbnRpbnVlQnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICBjb250aW51ZUJ1dHRvbi5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNvbnRpbnVlIGhpZGRlblwiO1xuICBjb250aW51ZUJ1dHRvbi50ZXh0Q29udGVudCA9IFwiQ29udGludWVcIjtcblxuICB0ZXh0QmxvY2suYXBwZW5kKGN1cnNvcik7XG4gIGNvbnNvbGVGcmFtZS5hcHBlbmQoc3BlYWtlckxhYmVsLCB0ZXh0QmxvY2ssIGNob2ljZXNMaXN0LCBjb250aW51ZUJ1dHRvbik7XG4gIG92ZXJsYXkuYXBwZW5kKGNvbnNvbGVGcmFtZSk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHR5cGluZ0hhbmRsZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCB0YXJnZXRUZXh0ID0gXCJcIjtcbiAgbGV0IHJlbmRlcmVkQ2hhcnMgPSAwO1xuICBsZXQgYWN0aXZlQ29udGVudDogRGlhbG9ndWVDb250ZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gY2xlYXJUeXBpbmcoKTogdm9pZCB7XG4gICAgaWYgKHR5cGluZ0hhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0eXBpbmdIYW5kbGUpO1xuICAgICAgdHlwaW5nSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBmaW5pc2hUeXBpbmcoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgcmVuZGVyZWRDaGFycyA9IHRhcmdldFRleHQubGVuZ3RoO1xuICAgIHVwZGF0ZVRleHQoKTtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIGNvbnRlbnQub25UZXh0RnVsbHlSZW5kZXJlZD8uKCk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgfHwgY29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVRleHQoKTogdm9pZCB7XG4gICAgY29uc3QgdGV4dFRvU2hvdyA9IHRhcmdldFRleHQuc2xpY2UoMCwgcmVuZGVyZWRDaGFycyk7XG4gICAgdGV4dEJsb2NrLmlubmVySFRNTCA9IFwiXCI7XG4gICAgY29uc3QgdGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICB0ZXh0Tm9kZS50ZXh0Q29udGVudCA9IHRleHRUb1Nob3c7XG4gICAgdGV4dEJsb2NrLmFwcGVuZCh0ZXh0Tm9kZSwgY3Vyc29yKTtcbiAgICBjdXJzb3IuY2xhc3NMaXN0LnRvZ2dsZShcImhpZGRlblwiLCAhdmlzaWJsZSk7XG4gIH1cblxuICBmdW5jdGlvbiByZW5kZXJDaG9pY2VzKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGNob2ljZXNMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgY29uc3QgY2hvaWNlcyA9IEFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSA/IGNvbnRlbnQuY2hvaWNlcyA6IFtdO1xuICAgIGlmIChjaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgYnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgICAgYnV0dG9uLmRhdGFzZXQuY2hvaWNlSWQgPSBjaG9pY2UuaWQ7XG4gICAgICBidXR0b24udGV4dENvbnRlbnQgPSBgJHtpbmRleCArIDF9LiAke2Nob2ljZS50ZXh0fWA7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgICAgY29udGVudC5vbkNob2ljZT8uKGNob2ljZS5pZCk7XG4gICAgICB9KTtcbiAgICAgIGl0ZW0uYXBwZW5kKGJ1dHRvbik7XG4gICAgICBjaG9pY2VzTGlzdC5hcHBlbmQoaXRlbSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzaG93Q29udGludWUoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgaWYgKCFjb250ZW50Lm9uQ29udGludWUpIHtcbiAgICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gbnVsbDtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29udGludWVCdXR0b24udGV4dENvbnRlbnQgPSBjb250ZW50LmNvbnRpbnVlTGFiZWwgPz8gXCJDb250aW51ZVwiO1xuICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24ub25jbGljayA9ICgpID0+IHtcbiAgICAgIGNvbnRlbnQub25Db250aW51ZT8uKCk7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjaGVkdWxlVHlwZShjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIGNvbnN0IHR5cGluZ1NwZWVkID0gY2xhbXAoTnVtYmVyKGNvbnRlbnQudHlwaW5nU3BlZWRNcykgfHwgMTgsIDgsIDY0KTtcbiAgICBjb25zdCB0aWNrID0gKCk6IHZvaWQgPT4ge1xuICAgICAgcmVuZGVyZWRDaGFycyA9IE1hdGgubWluKHJlbmRlcmVkQ2hhcnMgKyAxLCB0YXJnZXRUZXh0Lmxlbmd0aCk7XG4gICAgICB1cGRhdGVUZXh0KCk7XG4gICAgICBpZiAocmVuZGVyZWRDaGFycyA+PSB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgICBjbGVhclR5cGluZygpO1xuICAgICAgICBjb250ZW50Lm9uVGV4dEZ1bGx5UmVuZGVyZWQ/LigpO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSB8fCBjb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0eXBpbmdIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCh0aWNrLCB0eXBpbmdTcGVlZCk7XG4gICAgICB9XG4gICAgfTtcbiAgICB0eXBpbmdIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCh0aWNrLCB0eXBpbmdTcGVlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlIHx8ICFhY3RpdmVDb250ZW50KSByZXR1cm47XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFjdGl2ZUNvbnRlbnQuY2hvaWNlcykgfHwgYWN0aXZlQ29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCIgXCIgfHwgZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaWYgKHJlbmRlcmVkQ2hhcnMgPCB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgICAgIGZpbmlzaFR5cGluZyhhY3RpdmVDb250ZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhY3RpdmVDb250ZW50Lm9uQ29udGludWU/LigpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGluZGV4ID0gcGFyc2VJbnQoZXZlbnQua2V5LCAxMCk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShpbmRleCkgJiYgaW5kZXggPj0gMSAmJiBpbmRleCA8PSBhY3RpdmVDb250ZW50LmNob2ljZXMubGVuZ3RoKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgY2hvaWNlID0gYWN0aXZlQ29udGVudC5jaG9pY2VzW2luZGV4IC0gMV07XG4gICAgICBhY3RpdmVDb250ZW50Lm9uQ2hvaWNlPy4oY2hvaWNlLmlkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiICYmIHJlbmRlcmVkQ2hhcnMgPCB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGZpbmlzaFR5cGluZyhhY3RpdmVDb250ZW50KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGFjdGl2ZUNvbnRlbnQgPSBjb250ZW50O1xuICAgIHZpc2libGUgPSB0cnVlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gICAgb3ZlcmxheS5kYXRhc2V0LmludGVudCA9IGNvbnRlbnQuaW50ZW50ID8/IFwiZmFjdG9yeVwiO1xuICAgIHNwZWFrZXJMYWJlbC50ZXh0Q29udGVudCA9IGNvbnRlbnQuc3BlYWtlcjtcblxuICAgIHRhcmdldFRleHQgPSBjb250ZW50LnRleHQ7XG4gICAgcmVuZGVyZWRDaGFycyA9IDA7XG4gICAgdXBkYXRlVGV4dCgpO1xuICAgIHJlbmRlckNob2ljZXMoY29udGVudCk7XG4gICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgIHNjaGVkdWxlVHlwZShjb250ZW50KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIGFjdGl2ZUNvbnRlbnQgPSBudWxsO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICB0YXJnZXRUZXh0ID0gXCJcIjtcbiAgICByZW5kZXJlZENoYXJzID0gMDtcbiAgICB0ZXh0QmxvY2suaW5uZXJIVE1MID0gXCJcIjtcbiAgICB0ZXh0QmxvY2suYXBwZW5kKGN1cnNvcik7XG4gICAgY2hvaWNlc0xpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24ub25jbGljayA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95KCk6IHZvaWQge1xuICAgIGhpZGUoKTtcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duKTtcbiAgICBvdmVybGF5LnJlbW92ZSgpO1xuICB9XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlS2V5RG93bik7XG5cbiAgcmV0dXJuIHtcbiAgICBzaG93LFxuICAgIGhpZGUsXG4gICAgZGVzdHJveSxcbiAgICBpc1Zpc2libGUoKSB7XG4gICAgICByZXR1cm4gdmlzaWJsZTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBlbnN1cmVTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gIHN0eWxlLmlkID0gU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC5kaWFsb2d1ZS1vdmVybGF5IHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGluc2V0OiAwO1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgei1pbmRleDogNjA7XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdHJhbnNpdGlvbjogb3BhY2l0eSAwLjJzIGVhc2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5LnZpc2libGUge1xuICAgICAgb3BhY2l0eTogMTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBtaW4td2lkdGg6IDMyMHB4O1xuICAgICAgbWF4LXdpZHRoOiBtaW4oNTIwcHgsIGNhbGMoMTAwdncgLSA0OHB4KSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDYsIDExLCAxNiwgMC45Mik7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgICAgIHBhZGRpbmc6IDE4cHggMjBweDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiAxNHB4O1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgyLCA2LCAxNiwgMC42KTtcbiAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgZm9udC1mYW1pbHk6IFwiSUJNIFBsZXggTW9ub1wiLCBcIkpldEJyYWlucyBNb25vXCIsIHVpLW1vbm9zcGFjZSwgU0ZNb25vLVJlZ3VsYXIsIE1lbmxvLCBNb25hY28sIENvbnNvbGFzLCBcIkxpYmVyYXRpb24gTW9ub1wiLCBcIkNvdXJpZXIgTmV3XCIsIG1vbm9zcGFjZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXlbZGF0YS1pbnRlbnQ9XCJmYWN0b3J5XCJdIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNDUpO1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgxMywgMTQ4LCAxMzYsIDAuMzUpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheVtkYXRhLWludGVudD1cInVuaXRcIl0gLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDI0NCwgMTE0LCAxODIsIDAuNDUpO1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgyMzYsIDcyLCAxNTMsIDAuMjgpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtc3BlYWtlciB7XG4gICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4xNmVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuNzUpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtdGV4dCB7XG4gICAgICBtaW4taGVpZ2h0OiA5MHB4O1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuNTU7XG4gICAgICB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jdXJzb3Ige1xuICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICAgICAgbWFyZ2luLWxlZnQ6IDRweDtcbiAgICAgIGFuaW1hdGlvbjogZGlhbG9ndWUtY3Vyc29yLWJsaW5rIDEuMnMgc3RlcHMoMiwgc3RhcnQpIGluZmluaXRlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY3Vyc29yLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyB7XG4gICAgICBsaXN0LXN0eWxlOiBub25lO1xuICAgICAgbWFyZ2luOiAwO1xuICAgICAgcGFkZGluZzogMDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiA4cHg7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b24sXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgICAgcGFkZGluZzogOHB4IDEwcHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMyk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI0LCAzNiwgNDgsIDAuODUpO1xuICAgICAgY29sb3I6IGluaGVyaXQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMThzIGVhc2UsIGJvcmRlci1jb2xvciAwLjE4cyBlYXNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29udGludWUge1xuICAgICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29udGludWUuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbjpob3ZlcixcbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b246Zm9jdXMtdmlzaWJsZSxcbiAgICAuZGlhbG9ndWUtY29udGludWU6aG92ZXIsXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlOmZvY3VzLXZpc2libGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC41NSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMwLCA0NSwgNjAsIDAuOTUpO1xuICAgICAgb3V0bGluZTogbm9uZTtcbiAgICB9XG4gICAgQGtleWZyYW1lcyBkaWFsb2d1ZS1jdXJzb3ItYmxpbmsge1xuICAgICAgMCUsIDUwJSB7IG9wYWNpdHk6IDE7IH1cbiAgICAgIDUwLjAxJSwgMTAwJSB7IG9wYWNpdHk6IDA7IH1cbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG4iLCAiLyoqXG4gKiBNaXNzaW9uIDE6IFNpZ25hbCBJbiBUaGUgU3RhdGljIC0gU3RvcnkgQ29udGVudFxuICogTWFwcyBEQUcgc3Rvcnkgbm9kZXMgdG8gZGlhbG9ndWUgYW5kIHR1dG9yaWFsIGNvbnRlbnRcbiAqL1xuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlQ2hvaWNlIHtcbiAgaWQ6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlQ29udGVudCB7XG4gIHNwZWFrZXI6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBpbnRlbnQ/OiBcImZhY3RvcnlcIiB8IFwidW5pdFwiO1xuICB0eXBpbmdTcGVlZE1zPzogbnVtYmVyO1xuICBjb250aW51ZUxhYmVsPzogc3RyaW5nO1xuICBjaG9pY2VzPzogRGlhbG9ndWVDaG9pY2VbXTtcbiAgYXV0b0FkdmFuY2U/OiB7XG4gICAgZGVsYXlNczogbnVtYmVyO1xuICB9O1xuICB0dXRvcmlhbFRpcD86IHtcbiAgICB0aXRsZTogc3RyaW5nO1xuICAgIHRleHQ6IHN0cmluZztcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IE1JU1NJT05fMV9DT05URU5UOiBSZWNvcmQ8c3RyaW5nLCBEaWFsb2d1ZUNvbnRlbnQ+ID0ge1xuICAvLyBNaXNzaW9uIHN0YXJ0IC0gZ2FyYmxlZCBkaXN0cmVzcyBzaWduYWxcbiAgXCJzdG9yeS5zaWduYWwtc3RhdGljLTEuc3RhcnRcIjoge1xuICAgIHNwZWFrZXI6IFwiVU5LTk9XTiBTSUdOQUxcIixcbiAgICB0ZXh0OiBcIlx1MjAxM2duYWxcdTIwMjYgXHUyMDE0aXNzdXNcdTIwMjYgY29cdTIwMTNkaW5hdGVzXHUyMDI2XFxuXFxuW0Egd2VhayBzaWduYWwgY3JhY2tsZXMgdGhyb3VnaCB0aGUgdm9pZC4gVGhlIHRyYW5zbWlzc2lvbiBpcyBuZWFybHkgdW5pbnRlbGxpZ2libGUsIGJ1dCBjb29yZGluYXRlcyBlbWVyZ2UgZnJvbSB0aGUgc3RhdGljLiBTb21ldGhpbmdcdTIwMTRvciBzb21lb25lXHUyMDE0bmVlZHMgaGVscC5dXCIsXG4gICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICB0eXBpbmdTcGVlZE1zOiAyMCxcbiAgICBjaG9pY2VzOiBbXG4gICAgICB7IGlkOiBcImludmVzdGlnYXRlXCIsIHRleHQ6IFwiSW52ZXN0aWdhdGUgdGhlIHNpZ25hbFwiIH0sXG4gICAgICB7IGlkOiBcImNhdXRpb3VzXCIsIHRleHQ6IFwiQXBwcm9hY2ggd2l0aCBleHRyZW1lIGNhdXRpb25cIiB9LFxuICAgICAgeyBpZDogXCJpZ25vcmVcIiwgdGV4dDogXCJMb2cgY29vcmRpbmF0ZXMgYW5kIGNvbnRpbnVlIHBhdHJvbFwiIH0sXG4gICAgXSxcbiAgICB0dXRvcmlhbFRpcDoge1xuICAgICAgdGl0bGU6IFwiUm91dGUgUGxvdHRpbmdcIixcbiAgICAgIHRleHQ6IFwiQ2xpY2sgb24gdGhlIG1hcCB0byBwbG90IHdheXBvaW50cyBmb3IgeW91ciBzaGlwLiBSaWdodC1jbGljayB3YXlwb2ludHMgdG8gYWRqdXN0IHNwZWVkLiBZb3VyIHJvdXRlIGRldGVybWluZXMgeW91ciBoZWF0IGJ1aWxkdXAuXCIsXG4gICAgfSxcbiAgfSxcblxuICAvLyBCZWFjb24gMSBsb2NrZWQgLSBzaWduYWwgaW1wcm92aW5nXG4gIFwic3Rvcnkuc2lnbmFsLXN0YXRpYy0xLmJlYWNvbi0xXCI6IHtcbiAgICBzcGVha2VyOiBcIkRJU1RSRVNTIEJFQUNPTlwiLFxuICAgIHRleHQ6IFwiU2lnbmFsIGltcHJvdmluZ1x1MjAyNiB0cmlhbmd1bGF0aW5nIHNvdXJjZVx1MjAyNiBtYWludGFpbiBsb3cgdGhydXN0LlxcblxcbltUaGUgZmlyc3QgYmVhY29uIGxvY2sgc3RhYmlsaXplcyB0aGUgdHJhbnNtaXNzaW9uLiBUaGUgc2lnbmFsIGlzIGdldHRpbmcgY2xlYXJlciwgYnV0IHlvdSdsbCBuZWVkIHRvIHJlYWNoIG1vcmUgYmVhY29ucyB0byBwaW5wb2ludCB0aGUgb3JpZ2luLl1cIixcbiAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgIHR5cGluZ1NwZWVkTXM6IDE4LFxuICAgIGNvbnRpbnVlTGFiZWw6IFwiQ29udGludWVcIixcbiAgICB0dXRvcmlhbFRpcDoge1xuICAgICAgdGl0bGU6IFwiSGVhdCBNYW5hZ2VtZW50XCIsXG4gICAgICB0ZXh0OiBcIldhdGNoIHlvdXIgaGVhdCBnYXVnZS4gRmx5aW5nIHRvbyBmYXN0IGhlYXRzIHlvdXIgc2hpcC4gSWYgeW91IG92ZXJoZWF0LCB5b3UnbGwgc3RhbGwuIE1hdGNoIHlvdXIgc3BlZWQgdG8gdGhlIG1hcmtlciBsaW5lIGZvciBvcHRpbWFsIGVmZmljaWVuY3kuXCIsXG4gICAgfSxcbiAgfSxcblxuICAvLyBCZWFjb24gMiBsb2NrZWQgLSBwb3NzaWJsZSBzdXJ2aXZvcnNcbiAgXCJzdG9yeS5zaWduYWwtc3RhdGljLTEuYmVhY29uLTJcIjoge1xuICAgIHNwZWFrZXI6IFwiRElTVFJFU1MgQkVBQ09OXCIsXG4gICAgdGV4dDogXCJQb3NzaWJsZSBzdXJ2aXZvcnMgZGV0ZWN0ZWRcdTIwMjYgdXBsaW5rIHVuc3RhYmxlXHUyMDI2IHdhdGNoIGZvciBkZWJyaXMuXFxuXFxuW1RoZSBzZWNvbmQgYmVhY29uIHJldmVhbHMgZmFpbnQgbGlmZSBzaWducy4gU29tZXRoaW5nIHN1cnZpdmVkIG91dCBoZXJlLiBUaGUgdHJhbnNtaXNzaW9uIHdhcm5zIG9mIGhhemFyZHMgYWhlYWRcdTIwMTRwcm9jZWVkIHdpdGggY2F1dGlvbi5dXCIsXG4gICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICB0eXBpbmdTcGVlZE1zOiAxOCxcbiAgICBjb250aW51ZUxhYmVsOiBcIlByb2NlZWQgQ2FyZWZ1bGx5XCIsXG4gICAgdHV0b3JpYWxUaXA6IHtcbiAgICAgIHRpdGxlOiBcIkV2YXNpdmUgUm91dGluZ1wiLFxuICAgICAgdGV4dDogXCJQbG90IHJvdXRlcyB0aGF0IGF2b2lkIG9ic3RhY2xlcyBhbmQgZ2l2ZSB5b3UgcmVhY3Rpb24gdGltZS4gTGlnaHQtdGltZSBkZWxheSBtZWFucyB5b3Ugc2VlIG1pc3NpbGVzIHdoZXJlIHRoZXkgd2VyZSwgbm90IHdoZXJlIHRoZXkgYXJlLiBQbGFuIGFoZWFkLlwiLFxuICAgIH0sXG4gIH0sXG5cbiAgLy8gQmVhY29uIDMgbG9ja2VkIC0gc2Vla2VyIHNpZ25hdHVyZXMgZGV0ZWN0ZWRcbiAgXCJzdG9yeS5zaWduYWwtc3RhdGljLTEuYmVhY29uLTNcIjoge1xuICAgIHNwZWFrZXI6IFwiRElTVFJFU1MgQkVBQ09OXCIsXG4gICAgdGV4dDogXCJCZWFjb24gbG9jayBhY3F1aXJlZFx1MjAyNiBzZWVrZXIgc2lnbmF0dXJlcyBkZXRlY3RlZCBuZWFyYnlcdTIwMjYgZXh0cmVtZSBjYXV0aW9uIGFkdmlzZWQuXFxuXFxuW1RoZSB0aGlyZCBiZWFjb24gdHJpYW5ndWxhdGVzIHRoZSBkaXN0cmVzcyBzb3VyY2UsIGJ1dCBwYXNzaXZlIHNlbnNvcnMgZGV0ZWN0IGF1dG9tYXRlZCBkZWZlbnNlIHN5c3RlbXMuIFdoYXRldmVyJ3Mgb3V0IHRoZXJlLCBpdCdzIGhlYXZpbHkgZ3VhcmRlZC5dXCIsXG4gICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICB0eXBpbmdTcGVlZE1zOiAxOCxcbiAgICBjb250aW51ZUxhYmVsOiBcIkFwcHJvYWNoIEZpbmFsIEJlYWNvblwiLFxuICAgIHR1dG9yaWFsVGlwOiB7XG4gICAgICB0aXRsZTogXCJDb21iYXQgQXdhcmVuZXNzXCIsXG4gICAgICB0ZXh0OiBcIkhvc3RpbGUgc2Vla2VycyBwYXRyb2wgdGhpcyBzZWN0b3IuIEtlZXAgeW91ciBzcGVlZCBsb3cgdG8gYXZvaWQgZGV0ZWN0aW9uLiBIaWdoLXNwZWVkIHJ1bnMgZ2VuZXJhdGUgaGVhdCBzaWduYXR1cmVzIHRoYXQgZHJhdyBhdHRlbnRpb24uXCIsXG4gICAgfSxcbiAgfSxcblxuICAvLyBNaXNzaW9uIGNvbXBsZXRlIC0gYXJjaGl2ZXMgdW5sb2NrZWRcbiAgXCJzdG9yeS5zaWduYWwtc3RhdGljLTEuY29tcGxldGVcIjoge1xuICAgIHNwZWFrZXI6IFwiVU5JVC0wIEFSQ0hJVkVTXCIsXG4gICAgdGV4dDogXCJVbml0LTAsIHlvdSBmb3VuZCB1cy5cXG5cXG5BcmNoaXZlcyB1bmxvY2tlZC4gRW1lcmdlbmN5IHByb3RvY29scyBieXBhc3NlZC4gVXBsb2FkaW5nIG5leHQgbWlzc2lvbiBwYXJhbWV0ZXJzIHRvIHlvdXIgbmF2IHN5c3RlbS5cXG5cXG5bVGhlIGRpc3RyZXNzIHNpZ25hbCByZXNvbHZlcyBpbnRvIGEgZGF0YSBzdHJlYW0uIEFuY2llbnQgYXJjaGl2ZXMgZmxpY2tlciB0byBsaWZlLCByZXZlYWxpbmcgY29vcmRpbmF0ZXMgZm9yIHlvdXIgbmV4dCBvYmplY3RpdmUuXVwiLFxuICAgIGludGVudDogXCJ1bml0XCIsXG4gICAgdHlwaW5nU3BlZWRNczogMTYsXG4gICAgY29udGludWVMYWJlbDogXCJNaXNzaW9uIENvbXBsZXRlXCIsXG4gIH0sXG59O1xuXG4vKipcbiAqIEdldCBkaWFsb2d1ZSBjb250ZW50IGZvciBhIHN0b3J5IG5vZGUgSURcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldERpYWxvZ3VlRm9yTm9kZShub2RlSWQ6IHN0cmluZyk6IERpYWxvZ3VlQ29udGVudCB8IG51bGwge1xuICByZXR1cm4gTUlTU0lPTl8xX0NPTlRFTlRbbm9kZUlkXSB8fCBudWxsO1xufVxuXG4vKipcbiAqIENoZWNrIGlmIGEgbm9kZSBoYXMgdHV0b3JpYWwgY29udGVudFxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFzVHV0b3JpYWxUaXAobm9kZUlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgY29udGVudCA9IE1JU1NJT05fMV9DT05URU5UW25vZGVJZF07XG4gIHJldHVybiAhIShjb250ZW50Py50dXRvcmlhbFRpcCk7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgQXBwU3RhdGUgfSBmcm9tIFwiLi4vc3RhdGVcIjtcbmltcG9ydCB0eXBlIHsgRGlhbG9ndWVPdmVybGF5IH0gZnJvbSBcIi4vb3ZlcmxheVwiO1xuaW1wb3J0IHsgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi4vbmV0XCI7XG5pbXBvcnQgeyBnZXREaWFsb2d1ZUZvck5vZGUgfSBmcm9tIFwiLi9taXNzaW9uMS1jb250ZW50XCI7XG5cbmludGVyZmFjZSBTdG9yeUNvbnRyb2xsZXJPcHRpb25zIHtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb3ZlcmxheTogRGlhbG9ndWVPdmVybGF5O1xuICBzdGF0ZTogQXBwU3RhdGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlDb250cm9sbGVyIHtcbiAgc3RhcnQoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG4vKipcbiAqIFNlcnZlci1kcml2ZW4gc3RvcnkgY29udHJvbGxlci5cbiAqIFJlYWN0cyB0byBzdG9yeTpub2RlQWN0aXZhdGVkIGV2ZW50cyBmcm9tIHRoZSBzZXJ2ZXIgYW5kIGRpc3BsYXlzIGRpYWxvZ3VlLlxuICogU2VuZHMgZGFnX3N0b3J5X2FjayBtZXNzYWdlcyBiYWNrIHRvIHRoZSBzZXJ2ZXIgd2hlbiBkaWFsb2d1ZSBpcyBjb21wbGV0ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdG9yeUNvbnRyb2xsZXIoeyBidXMsIG92ZXJsYXksIHN0YXRlIH06IFN0b3J5Q29udHJvbGxlck9wdGlvbnMpOiBTdG9yeUNvbnRyb2xsZXIge1xuICBjb25zdCBsaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG4gIGxldCB0dXRvcmlhbFRpcEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gaGFuZGxlTm9kZUFjdGl2YXRlZCh7IG5vZGVJZCB9OiB7IG5vZGVJZDogc3RyaW5nIH0pOiB2b2lkIHtcbiAgICBjb25zb2xlLmxvZyhcIltzdG9yeV0gTm9kZSBhY3RpdmF0ZWQ6XCIsIG5vZGVJZCk7XG5cbiAgICAvLyBQYXJzZSB0aGUgbm9kZSBJRCB0byBleHRyYWN0IGNoYXB0ZXIgYW5kIG5vZGUgaW5mb1xuICAgIC8vIEV4cGVjdGVkIGZvcm1hdDogXCJzdG9yeS48Y2hhcHRlcj4uPG5vZGU+XCJcbiAgICBjb25zdCBwYXJ0cyA9IG5vZGVJZC5zcGxpdChcIi5cIik7XG4gICAgaWYgKHBhcnRzLmxlbmd0aCA8IDMgfHwgcGFydHNbMF0gIT09IFwic3RvcnlcIikge1xuICAgICAgY29uc29sZS53YXJuKFwiW3N0b3J5XSBJbnZhbGlkIG5vZGUgSUQgZm9ybWF0OlwiLCBub2RlSWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNoYXB0ZXIgPSBwYXJ0c1sxXTtcbiAgICBjb25zdCBub2RlID0gcGFydHMuc2xpY2UoMikuam9pbihcIi5cIik7XG5cbiAgICAvLyBGb3Igbm93LCB3ZSdsbCB1c2UgYSBzaW1wbGUgbWFwcGluZyB0byBkaXNwbGF5IGRpYWxvZ3VlXG4gICAgLy8gSW4gYSBmdWxsIGltcGxlbWVudGF0aW9uLCB0aGlzIHdvdWxkIGZldGNoIG5vZGUgbWV0YWRhdGEgZnJvbSB0aGUgc2VydmVyXG4gICAgLy8gb3IgaGF2ZSBhIGxvY2FsIGxvb2t1cCB0YWJsZVxuICAgIHNob3dEaWFsb2d1ZUZvck5vZGUoY2hhcHRlciwgbm9kZSwgbm9kZUlkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3dEaWFsb2d1ZUZvck5vZGUoY2hhcHRlcjogc3RyaW5nLCBub2RlOiBzdHJpbmcsIGZ1bGxOb2RlSWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBnZXREaWFsb2d1ZUZvck5vZGUoZnVsbE5vZGVJZCk7XG4gICAgY29uc29sZS5sb2coXCJbc3RvcnldIERpYWxvZ3VlIGNvbnRlbnQ6XCIsIGNvbnRlbnQpO1xuICAgIGlmICghY29udGVudCkge1xuICAgICAgY29uc29sZS53YXJuKFwiW3N0b3J5XSBObyBkaWFsb2d1ZSBjb250ZW50IGZvdW5kIGZvcjpcIiwgZnVsbE5vZGVJZCk7XG4gICAgICAvLyBTdGlsbCBhY2tub3dsZWRnZSB0aGUgbm9kZSB0byBwcm9ncmVzcyB0aGUgc3RvcnlcbiAgICAgIGFja25vd2xlZGdlTm9kZShmdWxsTm9kZUlkLCBudWxsKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTaG93IHR1dG9yaWFsIHRpcCBpZiBwcmVzZW50XG4gICAgaWYgKGNvbnRlbnQudHV0b3JpYWxUaXApIHtcbiAgICAgIHNob3dUdXRvcmlhbFRpcChjb250ZW50LnR1dG9yaWFsVGlwKTtcbiAgICB9XG5cbiAgICAvLyBQcmVwYXJlIG92ZXJsYXkgY29udGVudFxuICAgIGNvbnN0IG92ZXJsYXlDb250ZW50OiBhbnkgPSB7XG4gICAgICBzcGVha2VyOiBjb250ZW50LnNwZWFrZXIsXG4gICAgICB0ZXh0OiBjb250ZW50LnRleHQsXG4gICAgICBpbnRlbnQ6IGNvbnRlbnQuaW50ZW50LFxuICAgICAgY29udGludWVMYWJlbDogY29udGVudC5jb250aW51ZUxhYmVsLFxuICAgICAgdHlwaW5nU3BlZWRNczogY29udGVudC50eXBpbmdTcGVlZE1zLFxuICAgIH07XG5cbiAgICAvLyBBZGQgY2hvaWNlcyBpZiBwcmVzZW50XG4gICAgaWYgKGNvbnRlbnQuY2hvaWNlcyAmJiBjb250ZW50LmNob2ljZXMubGVuZ3RoID4gMCkge1xuICAgICAgb3ZlcmxheUNvbnRlbnQuY2hvaWNlcyA9IGNvbnRlbnQuY2hvaWNlcztcbiAgICAgIG92ZXJsYXlDb250ZW50Lm9uQ2hvaWNlID0gKGNob2ljZUlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgaGlkZVR1dG9yaWFsVGlwKCk7XG4gICAgICAgIG92ZXJsYXkuaGlkZSgpO1xuICAgICAgICBhY2tub3dsZWRnZU5vZGUoZnVsbE5vZGVJZCwgY2hvaWNlSWQpO1xuICAgICAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNsb3NlZFwiLCB7IG5vZGVJZDogbm9kZSwgY2hhcHRlcklkOiBjaGFwdGVyIH0pO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTm8gY2hvaWNlcyAtIGp1c3QgY29udGludWVcbiAgICAgIG92ZXJsYXlDb250ZW50Lm9uQ29udGludWUgPSAoKSA9PiB7XG4gICAgICAgIGhpZGVUdXRvcmlhbFRpcCgpO1xuICAgICAgICBvdmVybGF5LmhpZGUoKTtcbiAgICAgICAgYWNrbm93bGVkZ2VOb2RlKGZ1bGxOb2RlSWQsIG51bGwpO1xuICAgICAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNsb3NlZFwiLCB7IG5vZGVJZDogbm9kZSwgY2hhcHRlcklkOiBjaGFwdGVyIH0pO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgYXV0by1hZHZhbmNlXG4gICAgaWYgKGNvbnRlbnQuYXV0b0FkdmFuY2UpIHtcbiAgICAgIG92ZXJsYXlDb250ZW50Lm9uVGV4dEZ1bGx5UmVuZGVyZWQgPSAoKSA9PiB7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIGhpZGVUdXRvcmlhbFRpcCgpO1xuICAgICAgICAgIG92ZXJsYXkuaGlkZSgpO1xuICAgICAgICAgIGFja25vd2xlZGdlTm9kZShmdWxsTm9kZUlkLCBudWxsKTtcbiAgICAgICAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNsb3NlZFwiLCB7IG5vZGVJZDogbm9kZSwgY2hhcHRlcklkOiBjaGFwdGVyIH0pO1xuICAgICAgICB9LCBjb250ZW50LmF1dG9BZHZhbmNlLmRlbGF5TXMpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBvdmVybGF5LnNob3cob3ZlcmxheUNvbnRlbnQpO1xuXG4gICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpvcGVuZWRcIiwgeyBub2RlSWQ6IG5vZGUsIGNoYXB0ZXJJZDogY2hhcHRlciB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3dUdXRvcmlhbFRpcCh0aXA6IHsgdGl0bGU6IHN0cmluZzsgdGV4dDogc3RyaW5nIH0pOiB2b2lkIHtcbiAgICBoaWRlVHV0b3JpYWxUaXAoKTtcblxuICAgIGNvbnN0IHRpcENvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdGlwQ29udGFpbmVyLmNsYXNzTmFtZSA9IFwic3RvcnktdHV0b3JpYWwtdGlwXCI7XG4gICAgdGlwQ29udGFpbmVyLmlubmVySFRNTCA9IGBcbiAgICAgIDxkaXYgY2xhc3M9XCJzdG9yeS10dXRvcmlhbC10aXAtY29udGVudFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RvcnktdHV0b3JpYWwtdGlwLXRpdGxlXCI+JHtlc2NhcGVIdG1sKHRpcC50aXRsZSl9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdG9yeS10dXRvcmlhbC10aXAtdGV4dFwiPiR7ZXNjYXBlSHRtbCh0aXAudGV4dCl9PC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICBgO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGlwQ29udGFpbmVyKTtcbiAgICB0dXRvcmlhbFRpcEVsZW1lbnQgPSB0aXBDb250YWluZXI7XG5cbiAgICAvLyBFbnN1cmUgc3R5bGVzIGFyZSBsb2FkZWRcbiAgICBlbnN1cmVUdXRvcmlhbFRpcFN0eWxlcygpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGlkZVR1dG9yaWFsVGlwKCk6IHZvaWQge1xuICAgIGlmICh0dXRvcmlhbFRpcEVsZW1lbnQpIHtcbiAgICAgIHR1dG9yaWFsVGlwRWxlbWVudC5yZW1vdmUoKTtcbiAgICAgIHR1dG9yaWFsVGlwRWxlbWVudCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZXNjYXBlSHRtbCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgZGl2LnRleHRDb250ZW50ID0gdGV4dDtcbiAgICByZXR1cm4gZGl2LmlubmVySFRNTDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuc3VyZVR1dG9yaWFsVGlwU3R5bGVzKCk6IHZvaWQge1xuICAgIGNvbnN0IHN0eWxlSWQgPSBcInN0b3J5LXR1dG9yaWFsLXRpcC1zdHlsZXNcIjtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoc3R5bGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gICAgc3R5bGUuaWQgPSBzdHlsZUlkO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgLnN0b3J5LXR1dG9yaWFsLXRpcCB7XG4gICAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgICAgdG9wOiA4MHB4O1xuICAgICAgICByaWdodDogMjBweDtcbiAgICAgICAgbWF4LXdpZHRoOiAzMjBweDtcbiAgICAgICAgYmFja2dyb3VuZDogcmdiYSgxMywgMTQ4LCAxMzYsIDAuOTUpO1xuICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDU2LCAxODksIDI0OCwgMC42KTtcbiAgICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgICBwYWRkaW5nOiAxNHB4IDE2cHg7XG4gICAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgICBmb250LWZhbWlseTogXCJJQk0gUGxleCBNb25vXCIsIFwiSmV0QnJhaW5zIE1vbm9cIiwgdWktbW9ub3NwYWNlLCBtb25vc3BhY2U7XG4gICAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgICAgbGluZS1oZWlnaHQ6IDEuNTtcbiAgICAgICAgei1pbmRleDogNTU7XG4gICAgICAgIGJveC1zaGFkb3c6IDAgOHB4IDI0cHggcmdiYSgyLCA2LCAxNiwgMC41KTtcbiAgICAgICAgYW5pbWF0aW9uOiBzdG9yeS10aXAtc2xpZGUtaW4gMC4zcyBlYXNlLW91dDtcbiAgICAgIH1cbiAgICAgIC5zdG9yeS10dXRvcmlhbC10aXAtdGl0bGUge1xuICAgICAgICBmb250LXNpemU6IDExcHg7XG4gICAgICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgICAgIGNvbG9yOiAjMzhiZGY4O1xuICAgICAgICBtYXJnaW4tYm90dG9tOiA4cHg7XG4gICAgICB9XG4gICAgICAuc3RvcnktdHV0b3JpYWwtdGlwLXRleHQge1xuICAgICAgICBjb2xvcjogI2YxZjVmOTtcbiAgICAgIH1cbiAgICAgIEBrZXlmcmFtZXMgc3RvcnktdGlwLXNsaWRlLWluIHtcbiAgICAgICAgZnJvbSB7XG4gICAgICAgICAgb3BhY2l0eTogMDtcbiAgICAgICAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoMjBweCk7XG4gICAgICAgIH1cbiAgICAgICAgdG8ge1xuICAgICAgICAgIG9wYWNpdHk6IDE7XG4gICAgICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKDApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgYDtcbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFja25vd2xlZGdlTm9kZShub2RlSWQ6IHN0cmluZywgY2hvaWNlSWQ6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcbiAgICBjb25zdCBtc2c6IHsgdHlwZTogc3RyaW5nOyBub2RlX2lkOiBzdHJpbmc7IGNob2ljZV9pZD86IHN0cmluZyB9ID0ge1xuICAgICAgdHlwZTogXCJkYWdfc3RvcnlfYWNrXCIsXG4gICAgICBub2RlX2lkOiBub2RlSWQsXG4gICAgfTtcbiAgICBpZiAoY2hvaWNlSWQpIHtcbiAgICAgIG1zZy5jaG9pY2VfaWQgPSBjaG9pY2VJZDtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2UobXNnKTtcbiAgICBjb25zb2xlLmxvZyhcIltzdG9yeV0gQWNrbm93bGVkZ2VkIG5vZGU6XCIsIG5vZGVJZCwgY2hvaWNlSWQgPyBgKGNob2ljZTogJHtjaG9pY2VJZH0pYCA6IFwiXCIpO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnQoKTogdm9pZCB7XG4gICAgY29uc29sZS5sb2coXCJbc3RvcnldIFN0YXJ0aW5nIHN0b3J5IGNvbnRyb2xsZXJcIik7XG4gICAgLy8gTGlzdGVuIGZvciBzdG9yeSBub2RlIGFjdGl2YXRpb24gZnJvbSB0aGUgc2VydmVyXG4gICAgbGlzdGVuZXJzLnB1c2goYnVzLm9uKFwic3Rvcnk6bm9kZUFjdGl2YXRlZFwiLCBoYW5kbGVOb2RlQWN0aXZhdGVkKSk7XG5cbiAgICAvLyBDaGVjayBpZiB0aGVyZSdzIGFscmVhZHkgYW4gYWN0aXZlIHN0b3J5IG5vZGUgb24gc3RhcnR1cFxuICAgIGlmIChzdGF0ZS5zdG9yeT8uYWN0aXZlTm9kZSkge1xuICAgICAgY29uc29sZS5sb2coXCJbc3RvcnldIEZvdW5kIGFjdGl2ZSBzdG9yeSBub2RlIG9uIHN0YXJ0dXA6XCIsIHN0YXRlLnN0b3J5LmFjdGl2ZU5vZGUpO1xuICAgICAgaGFuZGxlTm9kZUFjdGl2YXRlZCh7IG5vZGVJZDogc3RhdGUuc3RvcnkuYWN0aXZlTm9kZSB9KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95KCk6IHZvaWQge1xuICAgIGhpZGVUdXRvcmlhbFRpcCgpO1xuICAgIGxpc3RlbmVycy5mb3JFYWNoKCh1bnN1YikgPT4gdW5zdWIoKSk7XG4gICAgbGlzdGVuZXJzLmxlbmd0aCA9IDA7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHN0YXJ0LFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgQXBwU3RhdGUgfSBmcm9tIFwiLi4vc3RhdGVcIjtcbmltcG9ydCB7IGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSB9IGZyb20gXCIuL292ZXJsYXlcIjtcbmltcG9ydCB7IGNyZWF0ZVN0b3J5Q29udHJvbGxlciB9IGZyb20gXCIuL2NvbnRyb2xsZXJcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUNvbnRyb2xsZXIge1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIHJlc2V0KCk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBNb3VudFN0b3J5T3B0aW9ucyB7XG4gIGJ1czogRXZlbnRCdXM7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgcm9vbUlkPzogc3RyaW5nIHwgbnVsbDtcbn1cblxuLyoqXG4gKiBNb3VudHMgdGhlIHNlcnZlci1kcml2ZW4gc3Rvcnkgc3lzdGVtLlxuICogU3RvcnkgcHJvZ3Jlc3Npb24gaXMgbm93IGNvbnRyb2xsZWQgYnkgdGhlIHNlcnZlciBEQUcsXG4gKiBhbmQgdGhpcyBjb250cm9sbGVyIHNpbXBseSBkaXNwbGF5cyBkaWFsb2d1ZSB3aGVuIG5vZGVzIGFyZSBhY3RpdmF0ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtb3VudFN0b3J5KHsgYnVzLCBzdGF0ZSB9OiBNb3VudFN0b3J5T3B0aW9ucyk6IFN0b3J5Q29udHJvbGxlciB7XG4gIGNvbnN0IG92ZXJsYXkgPSBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkoKTtcbiAgY29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVN0b3J5Q29udHJvbGxlcih7XG4gICAgYnVzLFxuICAgIG92ZXJsYXksXG4gICAgc3RhdGUsXG4gIH0pO1xuICBcbiAgY29udHJvbGxlci5zdGFydCgpO1xuXG4gIHJldHVybiB7XG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGNvbnRyb2xsZXIuZGVzdHJveSgpO1xuICAgICAgb3ZlcmxheS5kZXN0cm95KCk7XG4gICAgfSxcbiAgICByZXNldCgpIHtcbiAgICAgIC8vIFJlc2V0IGlzIG5vIGxvbmdlciBuZWVkZWQgYXMgc3RhdGUgaXMgc2VydmVyLWF1dGhvcml0YXRpdmVcbiAgICAgIC8vIEJ1dCB3ZSBrZWVwIHRoZSBpbnRlcmZhY2UgZm9yIGNvbXBhdGliaWxpdHlcbiAgICAgIGNvbnNvbGUud2FybihcIltzdG9yeV0gcmVzZXQoKSBjYWxsZWQgYnV0IHN0b3J5IGlzIG5vdyBzZXJ2ZXItZHJpdmVuXCIpO1xuICAgIH0sXG4gIH07XG59XG5cbi8vIExlZ2FjeSBleHBvcnRzIGZvciBjb21wYXRpYmlsaXR5XG5leHBvcnQgY29uc3QgSU5UUk9fQ0hBUFRFUl9JRCA9IFwiaW50cm9cIjtcbmV4cG9ydCBjb25zdCBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUyA9IFtcIjJBXCIsIFwiMkJcIiwgXCIyQ1wiXSBhcyBjb25zdDtcbiIsICIvLyBzcmMvc3RhcnQtZ2F0ZS50c1xuZXhwb3J0IHR5cGUgU3RhcnRHYXRlT3B0aW9ucyA9IHtcbiAgbGFiZWw/OiBzdHJpbmc7XG4gIHJlcXVlc3RGdWxsc2NyZWVuPzogYm9vbGVhbjtcbiAgcmVzdW1lQXVkaW8/OiAoKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZDsgLy8gZS5nLiwgZnJvbSBzdG9yeS9zZngudHNcbn07XG5cbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJsc2Q6bXV0ZWRcIjtcblxuLy8gSGVscGVyOiBnZXQgdGhlIHNoYXJlZCBBdWRpb0NvbnRleHQgeW91IGV4cG9zZSBzb21ld2hlcmUgaW4geW91ciBhdWRpbyBlbmdpbmU6XG4vLyAgICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYID0gY3R4O1xuZnVuY3Rpb24gZ2V0Q3R4KCk6IEF1ZGlvQ29udGV4dCB8IG51bGwge1xuICBjb25zdCBBQyA9ICh3aW5kb3cgYXMgYW55KS5BdWRpb0NvbnRleHQgfHwgKHdpbmRvdyBhcyBhbnkpLndlYmtpdEF1ZGlvQ29udGV4dDtcbiAgY29uc3QgY3R4ID0gKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFg7XG4gIHJldHVybiBjdHggaW5zdGFuY2VvZiBBQyA/IGN0eCBhcyBBdWRpb0NvbnRleHQgOiBudWxsO1xufVxuXG5jbGFzcyBNdXRlTWFuYWdlciB7XG4gIHByaXZhdGUgYnV0dG9uczogSFRNTEJ1dHRvbkVsZW1lbnRbXSA9IFtdO1xuICBwcml2YXRlIGVuZm9yY2luZyA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIC8vIGtlZXAgVUkgaW4gc3luYyBpZiBzb21lb25lIGVsc2UgdG9nZ2xlc1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJsc2Q6bXV0ZUNoYW5nZWRcIiwgKGU6IGFueSkgPT4ge1xuICAgICAgY29uc3QgbXV0ZWQgPSAhIWU/LmRldGFpbD8ubXV0ZWQ7XG4gICAgICB0aGlzLmFwcGx5VUkobXV0ZWQpO1xuICAgIH0pO1xuICB9XG5cbiAgaXNNdXRlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9LRVkpID09PSBcIjFcIjtcbiAgfVxuXG4gIHByaXZhdGUgc2F2ZShtdXRlZDogYm9vbGVhbikge1xuICAgIHRyeSB7IGxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBtdXRlZCA/IFwiMVwiIDogXCIwXCIpOyB9IGNhdGNoIHt9XG4gIH1cblxuICBwcml2YXRlIGxhYmVsKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQsIG11dGVkOiBib29sZWFuKSB7XG4gICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBTdHJpbmcobXV0ZWQpKTtcbiAgICBidG4udGl0bGUgPSBtdXRlZCA/IFwiVW5tdXRlIChNKVwiIDogXCJNdXRlIChNKVwiO1xuICAgIGJ0bi50ZXh0Q29udGVudCA9IG11dGVkID8gXCJcdUQ4M0RcdUREMDggVW5tdXRlXCIgOiBcIlx1RDgzRFx1REQwNyBNdXRlXCI7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5VUkobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0aGlzLmJ1dHRvbnMuZm9yRWFjaChiID0+IHRoaXMubGFiZWwoYiwgbXV0ZWQpKTtcbiAgfVxuXG4gIGF0dGFjaEJ1dHRvbihidG46IEhUTUxCdXR0b25FbGVtZW50KSB7XG4gICAgdGhpcy5idXR0b25zLnB1c2goYnRuKTtcbiAgICB0aGlzLmxhYmVsKGJ0biwgdGhpcy5pc011dGVkKCkpO1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy50b2dnbGUoKSk7XG4gIH1cblxuICBhc3luYyBzZXRNdXRlZChtdXRlZDogYm9vbGVhbikge1xuICAgIHRoaXMuc2F2ZShtdXRlZCk7XG4gICAgdGhpcy5hcHBseVVJKG11dGVkKTtcblxuICAgIGNvbnN0IGN0eCA9IGdldEN0eCgpO1xuICAgIGlmIChjdHgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChtdXRlZCAmJiBjdHguc3RhdGUgIT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgICAgICBhd2FpdCBjdHguc3VzcGVuZCgpO1xuICAgICAgICB9IGVsc2UgaWYgKCFtdXRlZCAmJiBjdHguc3RhdGUgIT09IFwicnVubmluZ1wiKSB7XG4gICAgICAgICAgYXdhaXQgY3R4LnJlc3VtZSgpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIlthdWRpb10gbXV0ZSB0b2dnbGUgZmFpbGVkOlwiLCBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBkb2N1bWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudChcImxzZDptdXRlQ2hhbmdlZFwiLCB7IGRldGFpbDogeyBtdXRlZCB9IH0pKTtcbiAgfVxuXG4gIHRvZ2dsZSgpIHtcbiAgICB0aGlzLnNldE11dGVkKCF0aGlzLmlzTXV0ZWQoKSk7XG4gIH1cblxuICAvLyBJZiBjdHggaXNuJ3QgY3JlYXRlZCB1bnRpbCBhZnRlciBTdGFydCwgZW5mb3JjZSBwZXJzaXN0ZWQgc3RhdGUgb25jZSBhdmFpbGFibGVcbiAgZW5mb3JjZU9uY2VXaGVuUmVhZHkoKSB7XG4gICAgaWYgKHRoaXMuZW5mb3JjaW5nKSByZXR1cm47XG4gICAgdGhpcy5lbmZvcmNpbmcgPSB0cnVlO1xuICAgIGNvbnN0IHRpY2sgPSAoKSA9PiB7XG4gICAgICBjb25zdCBjdHggPSBnZXRDdHgoKTtcbiAgICAgIGlmICghY3R4KSB7IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTsgcmV0dXJuOyB9XG4gICAgICB0aGlzLnNldE11dGVkKHRoaXMuaXNNdXRlZCgpKTtcbiAgICB9O1xuICAgIHRpY2soKTtcbiAgfVxufVxuXG5jb25zdCBtdXRlTWdyID0gbmV3IE11dGVNYW5hZ2VyKCk7XG5cbi8vIEluc3RhbGwgYSBtdXRlIGJ1dHRvbiBpbiB0aGUgdG9wIGZyYW1lIChyaWdodCBzaWRlKSBpZiBwb3NzaWJsZS5cbmZ1bmN0aW9uIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpIHtcbiAgY29uc3QgdG9wUmlnaHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRvcC1yaWdodFwiKTtcbiAgaWYgKCF0b3BSaWdodCkgcmV0dXJuO1xuXG4gIC8vIEF2b2lkIGR1cGxpY2F0ZXNcbiAgaWYgKHRvcFJpZ2h0LnF1ZXJ5U2VsZWN0b3IoXCIjbXV0ZS10b3BcIikpIHJldHVybjtcblxuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4uaWQgPSBcIm11dGUtdG9wXCI7XG4gIGJ0bi5jbGFzc05hbWUgPSBcImdob3N0LWJ0biBzbWFsbFwiO1xuICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwiZmFsc2VcIik7XG4gIGJ0bi50aXRsZSA9IFwiTXV0ZSAoTSlcIjtcbiAgYnRuLnRleHRDb250ZW50ID0gXCJcdUQ4M0RcdUREMDcgTXV0ZVwiO1xuICB0b3BSaWdodC5hcHBlbmRDaGlsZChidG4pO1xuICBtdXRlTWdyLmF0dGFjaEJ1dHRvbihidG4pO1xufVxuXG4vLyBHbG9iYWwga2V5Ym9hcmQgc2hvcnRjdXQgKE0pXG4oZnVuY3Rpb24gaW5zdGFsbE11dGVIb3RrZXkoKSB7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xuICAgIGlmIChlLmtleT8udG9Mb3dlckNhc2UoKSA9PT0gXCJtXCIpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIG11dGVNZ3IudG9nZ2xlKCk7XG4gICAgfVxuICB9KTtcbn0pKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB3YWl0Rm9yVXNlclN0YXJ0KG9wdHM6IFN0YXJ0R2F0ZU9wdGlvbnMgPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB7IGxhYmVsID0gXCJTdGFydCBHYW1lXCIsIHJlcXVlc3RGdWxsc2NyZWVuID0gZmFsc2UsIHJlc3VtZUF1ZGlvIH0gPSBvcHRzO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIC8vIG92ZXJsYXlcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBvdmVybGF5LmlkID0gXCJzdGFydC1vdmVybGF5XCI7XG4gICAgb3ZlcmxheS5pbm5lckhUTUwgPSBgXG4gICAgICA8ZGl2IGlkPVwic3RhcnQtY29udGFpbmVyXCI+XG4gICAgICAgIDxidXR0b24gaWQ9XCJzdGFydC1idG5cIiBhcmlhLWxhYmVsPVwiJHtsYWJlbH1cIj4ke2xhYmVsfTwvYnV0dG9uPlxuICAgICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luLXRvcDoxMHB4XCI+XG4gICAgICAgICAgPGJ1dHRvbiBpZD1cIm11dGUtYmVsb3ctc3RhcnRcIiBjbGFzcz1cImdob3N0LWJ0blwiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCIgdGl0bGU9XCJNdXRlIChNKVwiPlx1RDgzRFx1REQwNyBNdXRlPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8cD4gT24gbW9iaWxlIHR1cm4gcGhvbmUgdG8gbGFuZHNjYXBlIGZvciBiZXN0IGV4cGVyaWVuY2UuIDwvcD5cbiAgICAgIDwvZGl2PlxuICAgIGA7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICAgIC8vIHN0eWxlcyAobW92ZSB0byBDU1MgbGF0ZXIgaWYgeW91IHdhbnQpXG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgICAjc3RhcnQtb3ZlcmxheSB7XG4gICAgICAgIHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBiYWNrZ3JvdW5kOiByYWRpYWwtZ3JhZGllbnQoY2lyY2xlIGF0IGNlbnRlciwgcmdiYSgwLDAsMCwwLjYpLCByZ2JhKDAsMCwwLDAuOSkpO1xuICAgICAgICB6LWluZGV4OiA5OTk5O1xuICAgICAgfVxuICAgICAgI3N0YXJ0LWNvbnRhaW5lciB7IHRleHQtYWxpZ246IGNlbnRlcjsgfVxuICAgICAgI3N0YXJ0LWJ0biB7XG4gICAgICAgIGZvbnQtc2l6ZTogMnJlbTsgcGFkZGluZzogMXJlbSAyLjVyZW07IGJvcmRlcjogMnB4IHNvbGlkICNmZmY7IGJvcmRlci1yYWRpdXM6IDEwcHg7XG4gICAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyBjb2xvcjogI2ZmZjsgY3Vyc29yOiBwb2ludGVyOyB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gLjEycyBlYXNlLCBiYWNrZ3JvdW5kIC4ycyBlYXNlLCBjb2xvciAuMnMgZWFzZTtcbiAgICAgIH1cbiAgICAgICNzdGFydC1idG46aG92ZXIgeyBiYWNrZ3JvdW5kOiAjZmZmOyBjb2xvcjogIzAwMDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0xcHgpOyB9XG4gICAgICAjc3RhcnQtYnRuOmFjdGl2ZSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwKTsgfVxuICAgICAgI211dGUtYmVsb3ctc3RhcnQge1xuICAgICAgICBmb250LXNpemU6IDFyZW07IHBhZGRpbmc6IC41cmVtIDFyZW07IGJvcmRlci1yYWRpdXM6IDk5OXB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMwLCA0MSwgNTksIDAuNzIpOyBjb2xvcjogI2Y4ZmFmYztcbiAgICAgIH1cbiAgICAgIC5naG9zdC1idG4uc21hbGwgeyBwYWRkaW5nOiA0cHggOHB4OyBmb250LXNpemU6IDExcHg7IH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXG4gICAgLy8gV2lyZSBvdmVybGF5IGJ1dHRvbnNcbiAgICBjb25zdCBzdGFydEJ0biA9IG92ZXJsYXkucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXCIjc3RhcnQtYnRuXCIpITtcbiAgICBjb25zdCBtdXRlQmVsb3dTdGFydCA9IG92ZXJsYXkucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXCIjbXV0ZS1iZWxvdy1zdGFydFwiKSE7XG4gICAgY29uc3QgdG9wTXV0ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibXV0ZS10b3BcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGlmICh0b3BNdXRlKSBtdXRlTWdyLmF0dGFjaEJ1dHRvbih0b3BNdXRlKTtcbiAgICBtdXRlTWdyLmF0dGFjaEJ1dHRvbihtdXRlQmVsb3dTdGFydCk7XG5cbiAgICAvLyByZXN0b3JlIHBlcnNpc3RlZCBtdXRlIGxhYmVsIGltbWVkaWF0ZWx5XG4gICAgbXV0ZU1nci5lbmZvcmNlT25jZVdoZW5SZWFkeSgpO1xuXG4gICAgY29uc3Qgc3RhcnQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBhdWRpbyBmaXJzdCAodXNlciBnZXN0dXJlKVxuICAgICAgdHJ5IHsgYXdhaXQgcmVzdW1lQXVkaW8/LigpOyB9IGNhdGNoIHt9XG5cbiAgICAgIC8vIHJlc3BlY3QgcGVyc2lzdGVkIG11dGUgc3RhdGUgbm93IHRoYXQgY3R4IGxpa2VseSBleGlzdHNcbiAgICAgIG11dGVNZ3IuZW5mb3JjZU9uY2VXaGVuUmVhZHkoKTtcblxuICAgICAgLy8gb3B0aW9uYWwgZnVsbHNjcmVlblxuICAgICAgaWYgKHJlcXVlc3RGdWxsc2NyZWVuKSB7XG4gICAgICAgIHRyeSB7IGF3YWl0IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5yZXF1ZXN0RnVsbHNjcmVlbj8uKCk7IH0gY2F0Y2gge31cbiAgICAgIH1cblxuICAgICAgLy8gY2xlYW51cCBvdmVybGF5XG4gICAgICBzdHlsZS5yZW1vdmUoKTtcbiAgICAgIG92ZXJsYXkucmVtb3ZlKCk7XG5cbiAgICAgIC8vIGVuc3VyZSB0b3AtZnJhbWUgbXV0ZSBidXR0b24gZXhpc3RzIGFmdGVyIG92ZXJsYXlcbiAgICAgIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpO1xuXG4gICAgICByZXNvbHZlKCk7XG4gICAgfTtcblxuICAgIC8vIHN0YXJ0IGJ1dHRvblxuICAgIHN0YXJ0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGFydCwgeyBvbmNlOiB0cnVlIH0pO1xuXG4gICAgLy8gQWNjZXNzaWJpbGl0eTogYWxsb3cgRW50ZXIgLyBTcGFjZVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHtcbiAgICAgIGlmIChlLmtleSA9PT0gXCJFbnRlclwiIHx8IGUua2V5ID09PSBcIiBcIikge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHN0YXJ0KCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBGb2N1cyBmb3Iga2V5Ym9hcmQgdXNlcnNcbiAgICBzdGFydEJ0bi50YWJJbmRleCA9IDA7XG4gICAgc3RhcnRCdG4uZm9jdXMoKTtcblxuICAgIC8vIEFsc28gdHJ5IHRvIGNyZWF0ZSB0aGUgdG9wLWZyYW1lIG11dGUgaW1tZWRpYXRlbHkgaWYgRE9NIGlzIHJlYWR5XG4gICAgLy8gKElmICN0b3AtcmlnaHQgaXNuJ3QgdGhlcmUgeWV0LCBpdCdzIGhhcm1sZXNzOyB3ZSdsbCBhZGQgaXQgYWZ0ZXIgc3RhcnQgdG9vLilcbiAgICBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKTtcbiAgfSk7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBQUk5HIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IGNsYXNzIEF1ZGlvRW5naW5lIHtcbiAgcHJpdmF0ZSBzdGF0aWMgX2luc3Q6IEF1ZGlvRW5naW5lIHwgbnVsbCA9IG51bGw7XG5cbiAgcHVibGljIHJlYWRvbmx5IGN0eDogQXVkaW9Db250ZXh0O1xuICBwcml2YXRlIHJlYWRvbmx5IG1hc3RlcjogR2Fpbk5vZGU7XG4gIHByaXZhdGUgcmVhZG9ubHkgbXVzaWNCdXM6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHJlYWRvbmx5IHNmeEJ1czogR2Fpbk5vZGU7XG5cbiAgcHJpdmF0ZSBfdGFyZ2V0TWFzdGVyID0gMC45O1xuICBwcml2YXRlIF90YXJnZXRNdXNpYyA9IDAuOTtcbiAgcHJpdmF0ZSBfdGFyZ2V0U2Z4ID0gMC45O1xuXG4gIHN0YXRpYyBnZXQoKTogQXVkaW9FbmdpbmUge1xuICAgIGlmICghdGhpcy5faW5zdCkgdGhpcy5faW5zdCA9IG5ldyBBdWRpb0VuZ2luZSgpO1xuICAgIHJldHVybiB0aGlzLl9pbnN0O1xuICB9XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmN0eCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWCA9ICh0aGlzIGFzIGFueSkuY3R4O1xuXG4gICAgdGhpcy5tYXN0ZXIgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0TWFzdGVyIH0pO1xuICAgIHRoaXMubXVzaWNCdXMgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0TXVzaWMgfSk7XG4gICAgdGhpcy5zZnhCdXMgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0U2Z4IH0pO1xuXG4gICAgdGhpcy5tdXNpY0J1cy5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLnNmeEJ1cy5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLm1hc3Rlci5jb25uZWN0KHRoaXMuY3R4LmRlc3RpbmF0aW9uKTtcbiAgfVxuXG4gIGdldCBub3coKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gIH1cblxuICBnZXRNdXNpY0J1cygpOiBHYWluTm9kZSB7XG4gICAgcmV0dXJuIHRoaXMubXVzaWNCdXM7XG4gIH1cblxuICBnZXRTZnhCdXMoKTogR2Fpbk5vZGUge1xuICAgIHJldHVybiB0aGlzLnNmeEJ1cztcbiAgfVxuXG4gIGFzeW5jIHJlc3VtZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5jdHguc3RhdGUgPT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuY3R4LnJlc3VtZSgpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHN1c3BlbmQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuY3R4LnN0YXRlID09PSBcInJ1bm5pbmdcIikge1xuICAgICAgYXdhaXQgdGhpcy5jdHguc3VzcGVuZCgpO1xuICAgIH1cbiAgfVxuXG4gIHNldE1hc3RlckdhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0TWFzdGVyID0gdjtcbiAgICB0aGlzLm1hc3Rlci5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm1hc3Rlci5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIHNldE11c2ljR2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRNdXNpYyA9IHY7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgc2V0U2Z4R2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRTZnggPSB2O1xuICAgIHRoaXMuc2Z4QnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMuc2Z4QnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgZHVja011c2ljKGxldmVsID0gMC40LCBhdHRhY2sgPSAwLjA1KTogdm9pZCB7XG4gICAgY29uc3QgdCA9IHRoaXMubm93O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKGxldmVsLCB0ICsgYXR0YWNrKTtcbiAgfVxuXG4gIHVuZHVja011c2ljKHJlbGVhc2UgPSAwLjI1KTogdm9pZCB7XG4gICAgY29uc3QgdCA9IHRoaXMubm93O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRoaXMuX3RhcmdldE11c2ljLCB0ICsgcmVsZWFzZSk7XG4gIH1cbn1cblxuLy8gVGlueSBzZWVkYWJsZSBQUk5HIChNdWxiZXJyeTMyKVxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VQUk5HKHNlZWQ6IG51bWJlcik6IFBSTkcge1xuICBsZXQgcyA9IChzZWVkID4+PiAwKSB8fCAxO1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHMgKz0gMHg2RDJCNzlGNTtcbiAgICBsZXQgdCA9IE1hdGguaW11bChzIF4gKHMgPj4+IDE1KSwgMSB8IHMpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCA2MSB8IHQpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuIiwgIi8vIExvdy1sZXZlbCBncmFwaCBidWlsZGVycyAvIGhlbHBlcnNcblxuZXhwb3J0IGZ1bmN0aW9uIG9zYyhjdHg6IEF1ZGlvQ29udGV4dCwgdHlwZTogT3NjaWxsYXRvclR5cGUsIGZyZXE6IG51bWJlcikge1xuICByZXR1cm4gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlLCBmcmVxdWVuY3k6IGZyZXEgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub2lzZShjdHg6IEF1ZGlvQ29udGV4dCkge1xuICBjb25zdCBidWZmZXIgPSBjdHguY3JlYXRlQnVmZmVyKDEsIGN0eC5zYW1wbGVSYXRlICogMiwgY3R4LnNhbXBsZVJhdGUpO1xuICBjb25zdCBkYXRhID0gYnVmZmVyLmdldENoYW5uZWxEYXRhKDApO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIGRhdGFbaV0gPSBNYXRoLnJhbmRvbSgpICogMiAtIDE7XG4gIHJldHVybiBuZXcgQXVkaW9CdWZmZXJTb3VyY2VOb2RlKGN0eCwgeyBidWZmZXIsIGxvb3A6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYWtlUGFubmVyKGN0eDogQXVkaW9Db250ZXh0LCBwYW4gPSAwKSB7XG4gIHJldHVybiBuZXcgU3RlcmVvUGFubmVyTm9kZShjdHgsIHsgcGFuIH0pO1xufVxuXG4vKiogQmFzaWMgQURTUiBhcHBsaWVkIHRvIGEgR2Fpbk5vZGUgQXVkaW9QYXJhbS4gUmV0dXJucyBhIGZ1bmN0aW9uIHRvIHJlbGVhc2UuICovXG5leHBvcnQgZnVuY3Rpb24gYWRzcihcbiAgY3R4OiBBdWRpb0NvbnRleHQsXG4gIHBhcmFtOiBBdWRpb1BhcmFtLFxuICB0MDogbnVtYmVyLFxuICBhID0gMC4wMSwgLy8gYXR0YWNrXG4gIGQgPSAwLjA4LCAvLyBkZWNheVxuICBzID0gMC41LCAgLy8gc3VzdGFpbiAoMC4uMSBvZiBwZWFrKVxuICByID0gMC4yLCAgLy8gcmVsZWFzZVxuICBwZWFrID0gMVxuKSB7XG4gIHBhcmFtLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0MCk7XG4gIHBhcmFtLnNldFZhbHVlQXRUaW1lKDAsIHQwKTtcbiAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUocGVhaywgdDAgKyBhKTtcbiAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUocyAqIHBlYWssIHQwICsgYSArIGQpO1xuICByZXR1cm4gKHJlbGVhc2VBdCA9IGN0eC5jdXJyZW50VGltZSkgPT4ge1xuICAgIHBhcmFtLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhyZWxlYXNlQXQpO1xuICAgIC8vIGF2b2lkIHN1ZGRlbiBqdW1wczsgY29udGludWUgZnJvbSBjdXJyZW50XG4gICAgcGFyYW0uc2V0VmFsdWVBdFRpbWUocGFyYW0udmFsdWUsIHJlbGVhc2VBdCk7XG4gICAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wMDAxLCByZWxlYXNlQXQgKyByKTtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxmb1RvUGFyYW0oXG4gIGN0eDogQXVkaW9Db250ZXh0LFxuICB0YXJnZXQ6IEF1ZGlvUGFyYW0sXG4gIHsgZnJlcXVlbmN5ID0gMC4xLCBkZXB0aCA9IDMwMCwgdHlwZSA9IFwic2luZVwiIGFzIE9zY2lsbGF0b3JUeXBlIH0gPSB7fVxuKSB7XG4gIGNvbnN0IGxmbyA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZSwgZnJlcXVlbmN5IH0pO1xuICBjb25zdCBhbXAgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IGRlcHRoIH0pO1xuICBsZm8uY29ubmVjdChhbXApLmNvbm5lY3QodGFyZ2V0KTtcbiAgcmV0dXJuIHtcbiAgICBzdGFydChhdCA9IGN0eC5jdXJyZW50VGltZSkgeyBsZm8uc3RhcnQoYXQpOyB9LFxuICAgIHN0b3AoYXQgPSBjdHguY3VycmVudFRpbWUpIHsgbGZvLnN0b3AoYXQpOyBhbXAuZGlzY29ubmVjdCgpOyB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBhZHNyLCBtYWtlUGFubmVyLCBub2lzZSwgb3NjIH0gZnJvbSBcIi4vZ3JhcGhcIjtcbmltcG9ydCB0eXBlIHsgU2Z4TmFtZSB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbi8qKiBGaXJlLWFuZC1mb3JnZXQgU0ZYIGJ5IG5hbWUsIHdpdGggc2ltcGxlIHBhcmFtcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGF5U2Z4KFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICBuYW1lOiBTZnhOYW1lLFxuICBvcHRzOiB7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfSA9IHt9XG4pIHtcbiAgc3dpdGNoIChuYW1lKSB7XG4gICAgY2FzZSBcImxhc2VyXCI6IHJldHVybiBwbGF5TGFzZXIoZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwidGhydXN0XCI6IHJldHVybiBwbGF5VGhydXN0KGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImV4cGxvc2lvblwiOiByZXR1cm4gcGxheUV4cGxvc2lvbihlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJsb2NrXCI6IHJldHVybiBwbGF5TG9jayhlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJ1aVwiOiByZXR1cm4gcGxheVVpKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImRpYWxvZ3VlXCI6IHJldHVybiBwbGF5RGlhbG9ndWUoZW5naW5lLCBvcHRzKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUxhc2VyKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBvID0gb3NjKGN0eCwgXCJzcXVhcmVcIiwgNjgwICsgMTYwICogdmVsb2NpdHkpO1xuICBjb25zdCBmID0gbmV3IEJpcXVhZEZpbHRlck5vZGUoY3R4LCB7IHR5cGU6IFwibG93cGFzc1wiLCBmcmVxdWVuY3k6IDEyMDAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDIsIDAuMDMsIDAuMjUsIDAuMDgsIDAuNjUpO1xuICBvLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4wNik7XG4gIG8uc3RvcChub3cgKyAwLjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheVRocnVzdChcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDAuNiwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBuID0gbm9pc2UoY3R4KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwge1xuICAgIHR5cGU6IFwiYmFuZHBhc3NcIixcbiAgICBmcmVxdWVuY3k6IDE4MCArIDM2MCAqIHZlbG9jaXR5LFxuICAgIFE6IDEuMSxcbiAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBuLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMTIsIDAuMTUsIDAuNzUsIDAuMjUsIDAuNDUgKiB2ZWxvY2l0eSk7XG4gIG4uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjI1KTtcbiAgbi5zdG9wKG5vdyArIDEuMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RXhwbG9zaW9uKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBuID0gbm9pc2UoY3R4KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwge1xuICAgIHR5cGU6IFwibG93cGFzc1wiLFxuICAgIGZyZXF1ZW5jeTogMjIwMCAqIE1hdGgubWF4KDAuMiwgTWF0aC5taW4odmVsb2NpdHksIDEpKSxcbiAgICBROiAwLjIsXG4gIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbi5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDA1LCAwLjA4LCAwLjUsIDAuMzUsIDEuMSAqIHZlbG9jaXR5KTtcbiAgbi5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMTUgKyAwLjEgKiB2ZWxvY2l0eSk7XG4gIG4uc3RvcChub3cgKyAxLjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUxvY2soXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IGJhc2UgPSA1MjAgKyAxNDAgKiB2ZWxvY2l0eTtcbiAgY29uc3QgbzEgPSBvc2MoY3R4LCBcInNpbmVcIiwgYmFzZSk7XG4gIGNvbnN0IG8yID0gb3NjKGN0eCwgXCJzaW5lXCIsIGJhc2UgKiAxLjUpO1xuXG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvMS5jb25uZWN0KGcpOyBvMi5jb25uZWN0KGcpO1xuICBnLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuXG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAxLCAwLjAyLCAwLjAsIDAuMTIsIDAuNik7XG4gIG8xLnN0YXJ0KG5vdyk7IG8yLnN0YXJ0KG5vdyArIDAuMDIpO1xuICByZWxlYXNlKG5vdyArIDAuMDYpO1xuICBvMS5zdG9wKG5vdyArIDAuMik7IG8yLnN0b3Aobm93ICsgMC4yMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5VWkoZW5naW5lOiBBdWRpb0VuZ2luZSwgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9KSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInRyaWFuZ2xlXCIsIDg4MCAtIDEyMCAqIHZlbG9jaXR5KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDEsIDAuMDQsIDAuMCwgMC4wOCwgMC4zNSk7XG4gIG8uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjA1KTtcbiAgby5zdG9wKG5vdyArIDAuMTgpO1xufVxuXG4vKiogRGlhbG9ndWUgY3VlIHVzZWQgYnkgdGhlIHN0b3J5IG92ZXJsYXkgKHNob3J0LCBnZW50bGUgcGluZykuICovXG5leHBvcnQgZnVuY3Rpb24gcGxheURpYWxvZ3VlKGVuZ2luZTogQXVkaW9FbmdpbmUsIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fSkge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBmcmVxID0gNDgwICsgMTYwICogdmVsb2NpdHk7XG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInNpbmVcIiwgZnJlcSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAuMDAwMSB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgZy5nYWluLnNldFZhbHVlQXRUaW1lKDAuMDAwMSwgbm93KTtcbiAgZy5nYWluLmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUoMC4wNCwgbm93ICsgMC4wMik7XG4gIGcuZ2Fpbi5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwNSwgbm93ICsgMC4yOCk7XG5cbiAgby5zdGFydChub3cpO1xuICBvLnN0b3Aobm93ICsgMC4zKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFN0b3J5SW50ZW50IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4uL2F1ZGlvL2VuZ2luZVwiO1xuaW1wb3J0IHsgcGxheURpYWxvZ3VlIGFzIHBsYXlEaWFsb2d1ZVNmeCB9IGZyb20gXCIuLi9hdWRpby9zZnhcIjtcblxubGV0IGxhc3RQbGF5ZWRBdCA9IDA7XG5cbi8vIE1haW50YWluIHRoZSBvbGQgcHVibGljIEFQSSBzbyBlbmdpbmUudHMgZG9lc24ndCBjaGFuZ2VcbmV4cG9ydCBmdW5jdGlvbiBnZXRBdWRpb0NvbnRleHQoKTogQXVkaW9Db250ZXh0IHtcbiAgcmV0dXJuIEF1ZGlvRW5naW5lLmdldCgpLmN0eDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc3VtZUF1ZGlvKCk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCBBdWRpb0VuZ2luZS5nZXQoKS5yZXN1bWUoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlEaWFsb2d1ZUN1ZShpbnRlbnQ6IFN0b3J5SW50ZW50KTogdm9pZCB7XG4gIGNvbnN0IGVuZ2luZSA9IEF1ZGlvRW5naW5lLmdldCgpO1xuICBjb25zdCBub3cgPSBlbmdpbmUubm93O1xuXG4gIC8vIFRocm90dGxlIHJhcGlkIGN1ZXMgdG8gYXZvaWQgY2x1dHRlclxuICBpZiAobm93IC0gbGFzdFBsYXllZEF0IDwgMC4xKSByZXR1cm47XG4gIGxhc3RQbGF5ZWRBdCA9IG5vdztcblxuICAvLyBNYXAgXCJmYWN0b3J5XCIgdnMgb3RoZXJzIHRvIGEgc2xpZ2h0bHkgZGlmZmVyZW50IHZlbG9jaXR5IChicmlnaHRuZXNzKVxuICBjb25zdCB2ZWxvY2l0eSA9IGludGVudCA9PT0gXCJmYWN0b3J5XCIgPyAwLjggOiAwLjU7XG4gIHBsYXlEaWFsb2d1ZVNmeChlbmdpbmUsIHsgdmVsb2NpdHksIHBhbjogMCB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN1c3BlbmREaWFsb2d1ZUF1ZGlvKCk6IHZvaWQge1xuICB2b2lkIEF1ZGlvRW5naW5lLmdldCgpLnN1c3BlbmQoKTtcbn1cbiIsICJpbXBvcnQgeyBtYWtlUFJORyB9IGZyb20gXCIuLi8uLi9lbmdpbmVcIjtcblxuZXhwb3J0IHR5cGUgQW1iaWVudFBhcmFtcyA9IHtcbiAgaW50ZW5zaXR5OiBudW1iZXI7ICAvLyBvdmVyYWxsIGxvdWRuZXNzIC8gZW5lcmd5ICgwLi4xKVxuICBicmlnaHRuZXNzOiBudW1iZXI7IC8vIGZpbHRlciBvcGVubmVzcyAmIGNob3JkIHRpbWJyZSAoMC4uMSlcbiAgZGVuc2l0eTogbnVtYmVyOyAgICAvLyBjaG9yZCBzcGF3biByYXRlIC8gdGhpY2tuZXNzICgwLi4xKVxufTtcblxudHlwZSBNb2RlTmFtZSA9IFwiSW9uaWFuXCIgfCBcIkRvcmlhblwiIHwgXCJQaHJ5Z2lhblwiIHwgXCJMeWRpYW5cIiB8IFwiTWl4b2x5ZGlhblwiIHwgXCJBZW9saWFuXCIgfCBcIkxvY3JpYW5cIjtcblxuY29uc3QgTU9ERVM6IFJlY29yZDxNb2RlTmFtZSwgbnVtYmVyW10+ID0ge1xuICBJb25pYW46ICAgICBbMCwyLDQsNSw3LDksMTFdLFxuICBEb3JpYW46ICAgICBbMCwyLDMsNSw3LDksMTBdLFxuICBQaHJ5Z2lhbjogICBbMCwxLDMsNSw3LDgsMTBdLFxuICBMeWRpYW46ICAgICBbMCwyLDQsNiw3LDksMTFdLFxuICBNaXhvbHlkaWFuOiBbMCwyLDQsNSw3LDksMTBdLFxuICBBZW9saWFuOiAgICBbMCwyLDMsNSw3LDgsMTBdLFxuICBMb2NyaWFuOiAgICBbMCwxLDMsNSw2LDgsMTBdLFxufTtcblxuLy8gTXVzaWNhbCBjb25zdGFudHMgdHVuZWQgdG8gbWF0Y2ggdGhlIEhUTUwgdmVyc2lvblxuY29uc3QgUk9PVF9NQVhfR0FJTiAgICAgPSAwLjMzO1xuY29uc3QgUk9PVF9TV0VMTF9USU1FICAgPSAyMDtcbmNvbnN0IERST05FX1NISUZUX01JTl9TID0gMjQ7XG5jb25zdCBEUk9ORV9TSElGVF9NQVhfUyA9IDQ4O1xuY29uc3QgRFJPTkVfR0xJREVfTUlOX1MgPSA4O1xuY29uc3QgRFJPTkVfR0xJREVfTUFYX1MgPSAxNTtcblxuY29uc3QgQ0hPUkRfVk9JQ0VTX01BWCAgPSA1O1xuY29uc3QgQ0hPUkRfRkFERV9NSU5fUyAgPSA4O1xuY29uc3QgQ0hPUkRfRkFERV9NQVhfUyAgPSAxNjtcbmNvbnN0IENIT1JEX0hPTERfTUlOX1MgID0gMTA7XG5jb25zdCBDSE9SRF9IT0xEX01BWF9TICA9IDIyO1xuY29uc3QgQ0hPUkRfR0FQX01JTl9TICAgPSA0O1xuY29uc3QgQ0hPUkRfR0FQX01BWF9TICAgPSA5O1xuY29uc3QgQ0hPUkRfQU5DSE9SX1BST0IgPSAwLjY7IC8vIHByZWZlciBhbGlnbmluZyBjaG9yZCByb290IHRvIGRyb25lXG5cbmNvbnN0IEZJTFRFUl9CQVNFX0haICAgID0gMjIwO1xuY29uc3QgRklMVEVSX1BFQUtfSFogICAgPSA0MjAwO1xuY29uc3QgU1dFRVBfU0VHX1MgICAgICAgPSAzMDsgIC8vIHVwIHRoZW4gZG93biwgdmVyeSBzbG93XG5jb25zdCBMRk9fUkFURV9IWiAgICAgICA9IDAuMDU7XG5jb25zdCBMRk9fREVQVEhfSFogICAgICA9IDkwMDtcblxuY29uc3QgREVMQVlfVElNRV9TICAgICAgPSAwLjQ1O1xuY29uc3QgRkVFREJBQ0tfR0FJTiAgICAgPSAwLjM1O1xuY29uc3QgV0VUX01JWCAgICAgICAgICAgPSAwLjI4O1xuXG4vLyBkZWdyZWUgcHJlZmVyZW5jZSBmb3IgZHJvbmUgbW92ZXM6IDEsNSwzLDYsMiw0LDcgKGluZGV4ZXMgMC4uNilcbmNvbnN0IFBSRUZFUlJFRF9ERUdSRUVfT1JERVIgPSBbMCw0LDIsNSwxLDMsNl07XG5cbi8qKiBVdGlsaXR5ICovXG5jb25zdCBjbGFtcDAxID0gKHg6IG51bWJlcikgPT4gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgeCkpO1xuY29uc3QgcmFuZCA9IChybmc6ICgpID0+IG51bWJlciwgYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGEgKyBybmcoKSAqIChiIC0gYSk7XG5jb25zdCBjaG9pY2UgPSA8VCw+KHJuZzogKCkgPT4gbnVtYmVyLCBhcnI6IFRbXSkgPT4gYXJyW01hdGguZmxvb3Iocm5nKCkgKiBhcnIubGVuZ3RoKV07XG5cbmNvbnN0IG1pZGlUb0ZyZXEgPSAobTogbnVtYmVyKSA9PiA0NDAgKiBNYXRoLnBvdygyLCAobSAtIDY5KSAvIDEyKTtcblxuLyoqIEEgc2luZ2xlIHN0ZWFkeSBvc2NpbGxhdG9yIHZvaWNlIHdpdGggc2hpbW1lciBkZXR1bmUgYW5kIGdhaW4gZW52ZWxvcGUuICovXG5jbGFzcyBWb2ljZSB7XG4gIHByaXZhdGUga2lsbGVkID0gZmFsc2U7XG4gIHByaXZhdGUgc2hpbW1lcjogT3NjaWxsYXRvck5vZGU7XG4gIHByaXZhdGUgc2hpbW1lckdhaW46IEdhaW5Ob2RlO1xuICBwcml2YXRlIHNjYWxlOiBHYWluTm9kZTtcbiAgcHVibGljIGc6IEdhaW5Ob2RlO1xuICBwdWJsaWMgb3NjOiBPc2NpbGxhdG9yTm9kZTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGN0eDogQXVkaW9Db250ZXh0LFxuICAgIHByaXZhdGUgdGFyZ2V0R2FpbjogbnVtYmVyLFxuICAgIHdhdmVmb3JtOiBPc2NpbGxhdG9yVHlwZSxcbiAgICBmcmVxSHo6IG51bWJlcixcbiAgICBkZXN0aW5hdGlvbjogQXVkaW9Ob2RlLFxuICAgIHJuZzogKCkgPT4gbnVtYmVyXG4gICl7XG4gICAgdGhpcy5vc2MgPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGU6IHdhdmVmb3JtLCBmcmVxdWVuY3k6IGZyZXFIeiB9KTtcblxuICAgIC8vIHN1YnRsZSBzaGltbWVyIHZpYSBkZXR1bmUgbW9kdWxhdGlvblxuICAgIHRoaXMuc2hpbW1lciA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZTogXCJzaW5lXCIsIGZyZXF1ZW5jeTogcmFuZChybmcsIDAuMDYsIDAuMTgpIH0pO1xuICAgIHRoaXMuc2hpbW1lckdhaW4gPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IHJhbmQocm5nLCAwLjQsIDEuMikgfSk7XG4gICAgdGhpcy5zY2FsZSA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMjUgfSk7IC8vIGNlbnRzIHJhbmdlXG4gICAgdGhpcy5zaGltbWVyLmNvbm5lY3QodGhpcy5zaGltbWVyR2FpbikuY29ubmVjdCh0aGlzLnNjYWxlKS5jb25uZWN0KHRoaXMub3NjLmRldHVuZSk7XG5cbiAgICB0aGlzLmcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gICAgdGhpcy5vc2MuY29ubmVjdCh0aGlzLmcpLmNvbm5lY3QoZGVzdGluYXRpb24pO1xuXG4gICAgdGhpcy5vc2Muc3RhcnQoKTtcbiAgICB0aGlzLnNoaW1tZXIuc3RhcnQoKTtcbiAgfVxuXG4gIGZhZGVJbihzZWNvbmRzOiBudW1iZXIpIHtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICB0aGlzLmcuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSh0aGlzLmcuZ2Fpbi52YWx1ZSwgbm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0aGlzLnRhcmdldEdhaW4sIG5vdyArIHNlY29uZHMpO1xuICB9XG5cbiAgZmFkZU91dEtpbGwoc2Vjb25kczogbnVtYmVyKSB7XG4gICAgaWYgKHRoaXMua2lsbGVkKSByZXR1cm47XG4gICAgdGhpcy5raWxsZWQgPSB0cnVlO1xuICAgIGNvbnN0IG5vdyA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgIHRoaXMuZy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRoaXMuZy5nYWluLnNldFZhbHVlQXRUaW1lKHRoaXMuZy5nYWluLnZhbHVlLCBub3cpO1xuICAgIHRoaXMuZy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwMSwgbm93ICsgc2Vjb25kcyk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLnN0b3AoKSwgc2Vjb25kcyAqIDEwMDAgKyA2MCk7XG4gIH1cblxuICBzZXRGcmVxR2xpZGUodGFyZ2V0SHo6IG51bWJlciwgZ2xpZGVTZWNvbmRzOiBudW1iZXIpIHtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICAvLyBleHBvbmVudGlhbCB3aGVuIHBvc3NpYmxlIGZvciBzbW9vdGhuZXNzXG4gICAgY29uc3QgY3VycmVudCA9IE1hdGgubWF4KDAuMDAwMSwgdGhpcy5vc2MuZnJlcXVlbmN5LnZhbHVlKTtcbiAgICB0aGlzLm9zYy5mcmVxdWVuY3kuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5zZXRWYWx1ZUF0VGltZShjdXJyZW50LCBub3cpO1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUodGFyZ2V0SHosIG5vdyArIGdsaWRlU2Vjb25kcyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGFyZ2V0SHosIG5vdyArIGdsaWRlU2Vjb25kcyk7XG4gICAgfVxuICB9XG5cbiAgc3RvcCgpIHtcbiAgICB0cnkgeyB0aGlzLm9zYy5zdG9wKCk7IHRoaXMuc2hpbW1lci5zdG9wKCk7IH0gY2F0Y2gge31cbiAgICB0cnkge1xuICAgICAgdGhpcy5vc2MuZGlzY29ubmVjdCgpOyB0aGlzLnNoaW1tZXIuZGlzY29ubmVjdCgpO1xuICAgICAgdGhpcy5nLmRpc2Nvbm5lY3QoKTsgdGhpcy5zaGltbWVyR2Fpbi5kaXNjb25uZWN0KCk7IHRoaXMuc2NhbGUuZGlzY29ubmVjdCgpO1xuICAgIH0gY2F0Y2gge31cbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgQW1iaWVudFNjZW5lIHtcbiAgcHJpdmF0ZSBydW5uaW5nID0gZmFsc2U7XG4gIHByaXZhdGUgc3RvcEZuczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcbiAgcHJpdmF0ZSB0aW1lb3V0czogbnVtYmVyW10gPSBbXTtcblxuICBwcml2YXRlIHBhcmFtczogQW1iaWVudFBhcmFtcyA9IHsgaW50ZW5zaXR5OiAwLjc1LCBicmlnaHRuZXNzOiAwLjUsIGRlbnNpdHk6IDAuNiB9O1xuXG4gIHByaXZhdGUgcm5nOiAoKSA9PiBudW1iZXI7XG4gIHByaXZhdGUgbWFzdGVyITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgZmlsdGVyITogQmlxdWFkRmlsdGVyTm9kZTtcbiAgcHJpdmF0ZSBkcnkhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSB3ZXQhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBkZWxheSE6IERlbGF5Tm9kZTtcbiAgcHJpdmF0ZSBmZWVkYmFjayE6IEdhaW5Ob2RlO1xuXG4gIHByaXZhdGUgbGZvTm9kZT86IE9zY2lsbGF0b3JOb2RlO1xuICBwcml2YXRlIGxmb0dhaW4/OiBHYWluTm9kZTtcblxuICAvLyBtdXNpY2FsIHN0YXRlXG4gIHByaXZhdGUga2V5Um9vdE1pZGkgPSA0MztcbiAgcHJpdmF0ZSBtb2RlOiBNb2RlTmFtZSA9IFwiSW9uaWFuXCI7XG4gIHByaXZhdGUgZHJvbmVEZWdyZWVJZHggPSAwO1xuICBwcml2YXRlIHJvb3RWb2ljZTogVm9pY2UgfCBudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGN0eDogQXVkaW9Db250ZXh0LFxuICAgIHByaXZhdGUgb3V0OiBHYWluTm9kZSxcbiAgICBzZWVkID0gMVxuICApIHtcbiAgICB0aGlzLnJuZyA9IG1ha2VQUk5HKHNlZWQpO1xuICB9XG5cbiAgc2V0UGFyYW08SyBleHRlbmRzIGtleW9mIEFtYmllbnRQYXJhbXM+KGs6IEssIHY6IEFtYmllbnRQYXJhbXNbS10pIHtcbiAgICB0aGlzLnBhcmFtc1trXSA9IGNsYW1wMDEodik7XG4gICAgaWYgKHRoaXMucnVubmluZyAmJiBrID09PSBcImludGVuc2l0eVwiICYmIHRoaXMubWFzdGVyKSB7XG4gICAgICB0aGlzLm1hc3Rlci5nYWluLnZhbHVlID0gMC4xNSArIDAuODUgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHk7IFxuICAgIH1cbiAgfVxuXG4gIHN0YXJ0KCkge1xuICAgIGlmICh0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICB0aGlzLnJ1bm5pbmcgPSB0cnVlO1xuXG4gICAgLy8gLS0tLSBDb3JlIGdyYXBoIChmaWx0ZXIgLT4gZHJ5K2RlbGF5IC0+IG1hc3RlciAtPiBvdXQpIC0tLS1cbiAgICB0aGlzLm1hc3RlciA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiAwLjE1ICsgMC44NSAqIHRoaXMucGFyYW1zLmludGVuc2l0eSB9KTtcbiAgICB0aGlzLmZpbHRlciA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKHRoaXMuY3R4LCB7IHR5cGU6IFwibG93cGFzc1wiLCBROiAwLjcwNyB9KTtcbiAgICB0aGlzLmRyeSA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiAxIH0pO1xuICAgIHRoaXMud2V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IFdFVF9NSVggfSk7XG4gICAgdGhpcy5kZWxheSA9IG5ldyBEZWxheU5vZGUodGhpcy5jdHgsIHsgZGVsYXlUaW1lOiBERUxBWV9USU1FX1MsIG1heERlbGF5VGltZTogMiB9KTtcbiAgICB0aGlzLmZlZWRiYWNrID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IEZFRURCQUNLX0dBSU4gfSk7XG5cbiAgICB0aGlzLmZpbHRlci5jb25uZWN0KHRoaXMuZHJ5KS5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLmZpbHRlci5jb25uZWN0KHRoaXMuZGVsYXkpO1xuICAgIHRoaXMuZGVsYXkuY29ubmVjdCh0aGlzLmZlZWRiYWNrKS5jb25uZWN0KHRoaXMuZGVsYXkpO1xuICAgIHRoaXMuZGVsYXkuY29ubmVjdCh0aGlzLndldCkuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5tYXN0ZXIuY29ubmVjdCh0aGlzLm91dCk7XG5cbiAgICAvLyAtLS0tIEZpbHRlciBiYXNlbGluZSArIHNsb3cgc3dlZXBzIC0tLS1cbiAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VmFsdWVBdFRpbWUoRklMVEVSX0JBU0VfSFosIHRoaXMuY3R4LmN1cnJlbnRUaW1lKTtcbiAgICBjb25zdCBzd2VlcCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHQgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgICAvLyB1cCB0aGVuIGRvd24gdXNpbmcgdmVyeSBzbG93IHRpbWUgY29uc3RhbnRzXG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VGFyZ2V0QXRUaW1lKFxuICAgICAgICBGSUxURVJfQkFTRV9IWiArIChGSUxURVJfUEVBS19IWiAtIEZJTFRFUl9CQVNFX0haKSAqICgwLjQgKyAwLjYgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKSxcbiAgICAgICAgdCwgU1dFRVBfU0VHX1MgLyAzXG4gICAgICApO1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFRhcmdldEF0VGltZShcbiAgICAgICAgRklMVEVSX0JBU0VfSFogKiAoMC43ICsgMC4zICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyksXG4gICAgICAgIHQgKyBTV0VFUF9TRUdfUywgU1dFRVBfU0VHX1MgLyAzXG4gICAgICApO1xuICAgICAgdGhpcy50aW1lb3V0cy5wdXNoKHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHRoaXMucnVubmluZyAmJiBzd2VlcCgpLCAoU1dFRVBfU0VHX1MgKiAyKSAqIDEwMDApIGFzIHVua25vd24gYXMgbnVtYmVyKTtcbiAgICB9O1xuICAgIHN3ZWVwKCk7XG5cbiAgICAvLyAtLS0tIEdlbnRsZSBMRk8gb24gZmlsdGVyIGZyZXEgKHNtYWxsIGRlcHRoKSAtLS0tXG4gICAgdGhpcy5sZm9Ob2RlID0gbmV3IE9zY2lsbGF0b3JOb2RlKHRoaXMuY3R4LCB7IHR5cGU6IFwic2luZVwiLCBmcmVxdWVuY3k6IExGT19SQVRFX0haIH0pO1xuICAgIHRoaXMubGZvR2FpbiA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBMRk9fREVQVEhfSFogKiAoMC41ICsgMC41ICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcykgfSk7XG4gICAgdGhpcy5sZm9Ob2RlLmNvbm5lY3QodGhpcy5sZm9HYWluKS5jb25uZWN0KHRoaXMuZmlsdGVyLmZyZXF1ZW5jeSk7XG4gICAgdGhpcy5sZm9Ob2RlLnN0YXJ0KCk7XG5cbiAgICAvLyAtLS0tIFNwYXduIHJvb3QgZHJvbmUgKGdsaWRpbmcgdG8gZGlmZmVyZW50IGRlZ3JlZXMpIC0tLS1cbiAgICB0aGlzLnNwYXduUm9vdERyb25lKCk7XG4gICAgdGhpcy5zY2hlZHVsZU5leHREcm9uZU1vdmUoKTtcblxuICAgIC8vIC0tLS0gQ2hvcmQgY3ljbGUgbG9vcCAtLS0tXG4gICAgdGhpcy5jaG9yZEN5Y2xlKCk7XG5cbiAgICAvLyBjbGVhbnVwXG4gICAgdGhpcy5zdG9wRm5zLnB1c2goKCkgPT4ge1xuICAgICAgdHJ5IHsgdGhpcy5sZm9Ob2RlPy5zdG9wKCk7IH0gY2F0Y2gge31cbiAgICAgIFt0aGlzLm1hc3RlciwgdGhpcy5maWx0ZXIsIHRoaXMuZHJ5LCB0aGlzLndldCwgdGhpcy5kZWxheSwgdGhpcy5mZWVkYmFjaywgdGhpcy5sZm9Ob2RlLCB0aGlzLmxmb0dhaW5dXG4gICAgICAgIC5mb3JFYWNoKG4gPT4geyB0cnkgeyBuPy5kaXNjb25uZWN0KCk7IH0gY2F0Y2gge30gfSk7XG4gICAgfSk7XG4gIH1cblxuICBzdG9wKCkge1xuICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG5cbiAgICAvLyBjYW5jZWwgdGltZW91dHNcbiAgICB0aGlzLnRpbWVvdXRzLnNwbGljZSgwKS5mb3JFYWNoKGlkID0+IHdpbmRvdy5jbGVhclRpbWVvdXQoaWQpKTtcblxuICAgIC8vIGZhZGUgYW5kIGNsZWFudXAgdm9pY2VzXG4gICAgaWYgKHRoaXMucm9vdFZvaWNlKSB0aGlzLnJvb3RWb2ljZS5mYWRlT3V0S2lsbCgxLjIpO1xuXG4gICAgLy8gcnVuIGRlZmVycmVkIHN0b3BzXG4gICAgdGhpcy5zdG9wRm5zLnNwbGljZSgwKS5mb3JFYWNoKGZuID0+IGZuKCkpO1xuICB9XG5cbiAgLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBNdXNpY2FsIGVuZ2luZSBiZWxvdyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tICovXG5cbiAgcHJpdmF0ZSBjdXJyZW50RGVncmVlcygpOiBudW1iZXJbXSB7XG4gICAgcmV0dXJuIE1PREVTW3RoaXMubW9kZV0gfHwgTU9ERVMuTHlkaWFuO1xuICB9XG5cbiAgLyoqIERyb25lIHJvb3Qgdm9pY2UgKi9cbiAgcHJpdmF0ZSBzcGF3blJvb3REcm9uZSgpIHtcbiAgICBjb25zdCBiYXNlTWlkaSA9IHRoaXMua2V5Um9vdE1pZGkgKyB0aGlzLmN1cnJlbnREZWdyZWVzKClbdGhpcy5kcm9uZURlZ3JlZUlkeF07XG4gICAgY29uc3QgdiA9IG5ldyBWb2ljZShcbiAgICAgIHRoaXMuY3R4LFxuICAgICAgUk9PVF9NQVhfR0FJTixcbiAgICAgIFwic2luZVwiLFxuICAgICAgbWlkaVRvRnJlcShiYXNlTWlkaSksXG4gICAgICB0aGlzLmZpbHRlcixcbiAgICAgIHRoaXMucm5nXG4gICAgKTtcbiAgICB2LmZhZGVJbihST09UX1NXRUxMX1RJTUUpO1xuICAgIHRoaXMucm9vdFZvaWNlID0gdjtcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCkge1xuICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgY29uc3Qgd2FpdE1zID0gcmFuZCh0aGlzLnJuZywgRFJPTkVfU0hJRlRfTUlOX1MsIERST05FX1NISUZUX01BWF9TKSAqIDEwMDA7XG4gICAgY29uc3QgaWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoIXRoaXMucnVubmluZyB8fCAhdGhpcy5yb290Vm9pY2UpIHJldHVybjtcbiAgICAgIGNvbnN0IGdsaWRlID0gcmFuZCh0aGlzLnJuZywgRFJPTkVfR0xJREVfTUlOX1MsIERST05FX0dMSURFX01BWF9TKTtcbiAgICAgIGNvbnN0IG5leHRJZHggPSB0aGlzLnBpY2tOZXh0RHJvbmVEZWdyZWVJZHgoKTtcbiAgICAgIGNvbnN0IHRhcmdldE1pZGkgPSB0aGlzLmtleVJvb3RNaWRpICsgdGhpcy5jdXJyZW50RGVncmVlcygpW25leHRJZHhdO1xuICAgICAgdGhpcy5yb290Vm9pY2Uuc2V0RnJlcUdsaWRlKG1pZGlUb0ZyZXEodGFyZ2V0TWlkaSksIGdsaWRlKTtcbiAgICAgIHRoaXMuZHJvbmVEZWdyZWVJZHggPSBuZXh0SWR4O1xuICAgICAgdGhpcy5zY2hlZHVsZU5leHREcm9uZU1vdmUoKTtcbiAgICB9LCB3YWl0TXMpIGFzIHVua25vd24gYXMgbnVtYmVyO1xuICAgIHRoaXMudGltZW91dHMucHVzaChpZCk7XG4gIH1cblxuICBwcml2YXRlIHBpY2tOZXh0RHJvbmVEZWdyZWVJZHgoKTogbnVtYmVyIHtcbiAgICBjb25zdCBvcmRlciA9IFsuLi5QUkVGRVJSRURfREVHUkVFX09SREVSXTtcbiAgICBjb25zdCBpID0gb3JkZXIuaW5kZXhPZih0aGlzLmRyb25lRGVncmVlSWR4KTtcbiAgICBpZiAoaSA+PSAwKSB7IGNvbnN0IFtjdXJdID0gb3JkZXIuc3BsaWNlKGksIDEpOyBvcmRlci5wdXNoKGN1cik7IH1cbiAgICByZXR1cm4gY2hvaWNlKHRoaXMucm5nLCBvcmRlcik7XG4gIH1cblxuICAvKiogQnVpbGQgZGlhdG9uaWMgc3RhY2tlZC10aGlyZCBjaG9yZCBkZWdyZWVzIHdpdGggb3B0aW9uYWwgZXh0ZW5zaW9ucyAqL1xuICBwcml2YXRlIGJ1aWxkQ2hvcmREZWdyZWVzKG1vZGVEZWdzOiBudW1iZXJbXSwgcm9vdEluZGV4OiBudW1iZXIsIHNpemUgPSA0LCBhZGQ5ID0gZmFsc2UsIGFkZDExID0gZmFsc2UsIGFkZDEzID0gZmFsc2UpIHtcbiAgICBjb25zdCBzdGVwcyA9IFswLCAyLCA0LCA2XTsgLy8gdGhpcmRzIG92ZXIgNy1ub3RlIHNjYWxlXG4gICAgY29uc3QgY2hvcmRJZHhzID0gc3RlcHMuc2xpY2UoMCwgTWF0aC5taW4oc2l6ZSwgNCkpLm1hcChzID0+IChyb290SW5kZXggKyBzKSAlIDcpO1xuICAgIGlmIChhZGQ5KSAgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDgpICUgNyk7XG4gICAgaWYgKGFkZDExKSBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgMTApICUgNyk7XG4gICAgaWYgKGFkZDEzKSBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgMTIpICUgNyk7XG4gICAgcmV0dXJuIGNob3JkSWR4cy5tYXAoaSA9PiBtb2RlRGVnc1tpXSk7XG4gIH1cblxuICBwcml2YXRlICplbmRsZXNzQ2hvcmRzKCkge1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCBtb2RlRGVncyA9IHRoaXMuY3VycmVudERlZ3JlZXMoKTtcbiAgICAgIC8vIGNob29zZSBjaG9yZCByb290IGRlZ3JlZSAob2Z0ZW4gYWxpZ24gd2l0aCBkcm9uZSlcbiAgICAgIGNvbnN0IHJvb3REZWdyZWVJbmRleCA9ICh0aGlzLnJuZygpIDwgQ0hPUkRfQU5DSE9SX1BST0IpID8gdGhpcy5kcm9uZURlZ3JlZUlkeCA6IE1hdGguZmxvb3IodGhpcy5ybmcoKSAqIDcpO1xuXG4gICAgICAvLyBjaG9yZCBzaXplIC8gZXh0ZW5zaW9uc1xuICAgICAgY29uc3QgciA9IHRoaXMucm5nKCk7XG4gICAgICBsZXQgc2l6ZSA9IDM7IGxldCBhZGQ5ID0gZmFsc2UsIGFkZDExID0gZmFsc2UsIGFkZDEzID0gZmFsc2U7XG4gICAgICBpZiAociA8IDAuMzUpICAgICAgICAgICAgeyBzaXplID0gMzsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuNzUpICAgICAgIHsgc2l6ZSA9IDQ7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjkwKSAgICAgICB7IHNpemUgPSA0OyBhZGQ5ID0gdHJ1ZTsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuOTcpICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDExID0gdHJ1ZTsgfVxuICAgICAgZWxzZSAgICAgICAgICAgICAgICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDEzID0gdHJ1ZTsgfVxuXG4gICAgICBjb25zdCBjaG9yZFNlbWlzID0gdGhpcy5idWlsZENob3JkRGVncmVlcyhtb2RlRGVncywgcm9vdERlZ3JlZUluZGV4LCBzaXplLCBhZGQ5LCBhZGQxMSwgYWRkMTMpO1xuICAgICAgLy8gc3ByZWFkIGNob3JkIGFjcm9zcyBvY3RhdmVzICgtMTIsIDAsICsxMiksIGJpYXMgdG8gY2VudGVyXG4gICAgICBjb25zdCBzcHJlYWQgPSBjaG9yZFNlbWlzLm1hcChzZW1pID0+IHNlbWkgKyBjaG9pY2UodGhpcy5ybmcsIFstMTIsIDAsIDAsIDEyXSkpO1xuXG4gICAgICAvLyBvY2Nhc2lvbmFsbHkgZW5zdXJlIHRvbmljIGlzIHByZXNlbnQgZm9yIGdyb3VuZGluZ1xuICAgICAgaWYgKCFzcHJlYWQuaW5jbHVkZXMoMCkgJiYgdGhpcy5ybmcoKSA8IDAuNSkgc3ByZWFkLnB1c2goMCk7XG5cbiAgICAgIHlpZWxkIHNwcmVhZDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNob3JkQ3ljbGUoKSB7XG4gICAgY29uc3QgZ2VuID0gdGhpcy5lbmRsZXNzQ2hvcmRzKCk7XG4gICAgY29uc3Qgdm9pY2VzID0gbmV3IFNldDxWb2ljZT4oKTtcblxuICAgIGNvbnN0IHNsZWVwID0gKG1zOiBudW1iZXIpID0+IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuICAgICAgY29uc3QgaWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiByKCksIG1zKSBhcyB1bmtub3duIGFzIG51bWJlcjtcbiAgICAgIHRoaXMudGltZW91dHMucHVzaChpZCk7XG4gICAgfSk7XG5cbiAgICB3aGlsZSAodGhpcy5ydW5uaW5nKSB7XG4gICAgICAvLyBjaG9yZCBzcGF3biBwcm9iYWJpbGl0eSAvIHRoaWNrbmVzcyBzY2FsZSB3aXRoIGRlbnNpdHkgJiBicmlnaHRuZXNzXG4gICAgICBjb25zdCB0aGlja25lc3MgPSBNYXRoLnJvdW5kKDIgKyB0aGlzLnBhcmFtcy5kZW5zaXR5ICogMyk7XG4gICAgICBjb25zdCBiYXNlTWlkaSA9IHRoaXMua2V5Um9vdE1pZGk7XG4gICAgICBjb25zdCBkZWdyZWVzT2ZmOiBudW1iZXJbXSA9IGdlbi5uZXh0KCkudmFsdWUgPz8gW107XG5cbiAgICAgIC8vIHNwYXduXG4gICAgICBmb3IgKGNvbnN0IG9mZiBvZiBkZWdyZWVzT2ZmKSB7XG4gICAgICAgIGlmICghdGhpcy5ydW5uaW5nKSBicmVhaztcbiAgICAgICAgaWYgKHZvaWNlcy5zaXplID49IE1hdGgubWluKENIT1JEX1ZPSUNFU19NQVgsIHRoaWNrbmVzcykpIGJyZWFrO1xuXG4gICAgICAgIGNvbnN0IG1pZGkgPSBiYXNlTWlkaSArIG9mZjtcbiAgICAgICAgY29uc3QgZnJlcSA9IG1pZGlUb0ZyZXEobWlkaSk7XG4gICAgICAgIGNvbnN0IHdhdmVmb3JtID0gY2hvaWNlKHRoaXMucm5nLCBbXCJzaW5lXCIsIFwidHJpYW5nbGVcIiwgXCJzYXd0b290aFwiXSBhcyBPc2NpbGxhdG9yVHlwZVtdKTtcblxuICAgICAgICAvLyBsb3VkZXIgd2l0aCBpbnRlbnNpdHk7IHNsaWdodGx5IGJyaWdodGVyIC0+IHNsaWdodGx5IGxvdWRlclxuICAgICAgICBjb25zdCBnYWluVGFyZ2V0ID0gcmFuZCh0aGlzLnJuZywgMC4wOCwgMC4yMikgKlxuICAgICAgICAgICgwLjg1ICsgMC4zICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5KSAqXG4gICAgICAgICAgKDAuOSArIDAuMiAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpO1xuXG4gICAgICAgIGNvbnN0IHYgPSBuZXcgVm9pY2UodGhpcy5jdHgsIGdhaW5UYXJnZXQsIHdhdmVmb3JtLCBmcmVxLCB0aGlzLmZpbHRlciwgdGhpcy5ybmcpO1xuICAgICAgICB2b2ljZXMuYWRkKHYpO1xuICAgICAgICB2LmZhZGVJbihyYW5kKHRoaXMucm5nLCBDSE9SRF9GQURFX01JTl9TLCBDSE9SRF9GQURFX01BWF9TKSk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHNsZWVwKHJhbmQodGhpcy5ybmcsIENIT1JEX0hPTERfTUlOX1MsIENIT1JEX0hPTERfTUFYX1MpICogMTAwMCk7XG5cbiAgICAgIC8vIGZhZGUgb3V0XG4gICAgICBjb25zdCBvdXRzID0gQXJyYXkuZnJvbSh2b2ljZXMpO1xuICAgICAgZm9yIChjb25zdCB2IG9mIG91dHMpIHYuZmFkZU91dEtpbGwocmFuZCh0aGlzLnJuZywgQ0hPUkRfRkFERV9NSU5fUywgQ0hPUkRfRkFERV9NQVhfUykpO1xuICAgICAgdm9pY2VzLmNsZWFyKCk7XG5cbiAgICAgIGF3YWl0IHNsZWVwKHJhbmQodGhpcy5ybmcsIENIT1JEX0dBUF9NSU5fUywgQ0hPUkRfR0FQX01BWF9TKSAqIDEwMDApO1xuICAgIH1cblxuICAgIC8vIHNhZmV0eToga2lsbCBhbnkgbGluZ2VyaW5nIHZvaWNlc1xuICAgIGZvciAoY29uc3QgdiBvZiBBcnJheS5mcm9tKHZvaWNlcykpIHYuZmFkZU91dEtpbGwoMC44KTtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgU2NlbmVOYW1lLCBNdXNpY1NjZW5lT3B0aW9ucyB9IGZyb20gXCIuLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi4vZW5naW5lXCI7XG5pbXBvcnQgeyBBbWJpZW50U2NlbmUgfSBmcm9tIFwiLi9zY2VuZXMvYW1iaWVudFwiO1xuXG5leHBvcnQgY2xhc3MgTXVzaWNEaXJlY3RvciB7XG4gIHByaXZhdGUgY3VycmVudD86IHsgbmFtZTogU2NlbmVOYW1lOyBzdG9wOiAoKSA9PiB2b2lkIH07XG4gIHByaXZhdGUgYnVzT3V0OiBHYWluTm9kZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGVuZ2luZTogQXVkaW9FbmdpbmUpIHtcbiAgICB0aGlzLmJ1c091dCA9IG5ldyBHYWluTm9kZShlbmdpbmUuY3R4LCB7IGdhaW46IDAuOSB9KTtcbiAgICB0aGlzLmJ1c091dC5jb25uZWN0KGVuZ2luZS5nZXRNdXNpY0J1cygpKTtcbiAgfVxuXG4gIC8qKiBDcm9zc2ZhZGUgdG8gYSBuZXcgc2NlbmUgKi9cbiAgc2V0U2NlbmUobmFtZTogU2NlbmVOYW1lLCBvcHRzPzogTXVzaWNTY2VuZU9wdGlvbnMpIHtcbiAgICBpZiAodGhpcy5jdXJyZW50Py5uYW1lID09PSBuYW1lKSByZXR1cm47XG5cbiAgICBjb25zdCBvbGQgPSB0aGlzLmN1cnJlbnQ7XG4gICAgY29uc3QgdCA9IHRoaXMuZW5naW5lLm5vdztcblxuICAgIC8vIGZhZGUtb3V0IG9sZFxuICAgIGNvbnN0IGZhZGVPdXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5lbmdpbmUuY3R4LCB7IGdhaW46IDAuOSB9KTtcbiAgICBmYWRlT3V0LmNvbm5lY3QodGhpcy5lbmdpbmUuZ2V0TXVzaWNCdXMoKSk7XG4gICAgaWYgKG9sZCkge1xuICAgICAgLy8gV2UgYXNzdW1lIGVhY2ggc2NlbmUgbWFuYWdlcyBpdHMgb3duIG91dCBub2RlOyBzdG9wcGluZyB0cmlnZ2VycyBhIG5hdHVyYWwgdGFpbC5cbiAgICAgIG9sZC5zdG9wKCk7XG4gICAgICBmYWRlT3V0LmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wLCB0ICsgMC42KTtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gZmFkZU91dC5kaXNjb25uZWN0KCksIDY1MCk7XG4gICAgfVxuXG4gICAgLy8gbmV3IHNjZW5lXG4gICAgY29uc3Qgc2NlbmVPdXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5lbmdpbmUuY3R4LCB7IGdhaW46IDAgfSk7XG4gICAgc2NlbmVPdXQuY29ubmVjdCh0aGlzLmJ1c091dCk7XG5cbiAgICBsZXQgc3RvcCA9ICgpID0+IHNjZW5lT3V0LmRpc2Nvbm5lY3QoKTtcblxuICAgIGlmIChuYW1lID09PSBcImFtYmllbnRcIikge1xuICAgICAgY29uc3QgcyA9IG5ldyBBbWJpZW50U2NlbmUodGhpcy5lbmdpbmUuY3R4LCBzY2VuZU91dCwgb3B0cz8uc2VlZCA/PyAxKTtcbiAgICAgIHMuc3RhcnQoKTtcbiAgICAgIHN0b3AgPSAoKSA9PiB7XG4gICAgICAgIHMuc3RvcCgpO1xuICAgICAgICBzY2VuZU91dC5kaXNjb25uZWN0KCk7XG4gICAgICB9O1xuICAgIH1cbiAgICAvLyBlbHNlIGlmIChuYW1lID09PSBcImNvbWJhdFwiKSB7IC8qIGltcGxlbWVudCBjb21iYXQgc2NlbmUgbGF0ZXIgKi8gfVxuICAgIC8vIGVsc2UgaWYgKG5hbWUgPT09IFwibG9iYnlcIikgeyAvKiBpbXBsZW1lbnQgbG9iYnkgc2NlbmUgbGF0ZXIgKi8gfVxuXG4gICAgdGhpcy5jdXJyZW50ID0geyBuYW1lLCBzdG9wIH07XG4gICAgc2NlbmVPdXQuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjksIHQgKyAwLjYpO1xuICB9XG5cbiAgc3RvcCgpIHtcbiAgICBpZiAoIXRoaXMuY3VycmVudCkgcmV0dXJuO1xuICAgIHRoaXMuY3VycmVudC5zdG9wKCk7XG4gICAgdGhpcy5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICB9XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBCdXMsIE11c2ljUGFyYW1NZXNzYWdlLCBNdXNpY1NjZW5lT3B0aW9ucyB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgTXVzaWNEaXJlY3RvciB9IGZyb20gXCIuL211c2ljXCI7XG5pbXBvcnQgeyBwbGF5U2Z4IH0gZnJvbSBcIi4vc2Z4XCI7XG5cbi8qKlxuICogQmluZCBzdGFuZGFyZCBhdWRpbyBldmVudHMgdG8gdGhlIGVuZ2luZSBhbmQgbXVzaWMgZGlyZWN0b3IuXG4gKlxuICogRXZlbnRzIHN1cHBvcnRlZDpcbiAqICAtIGF1ZGlvOnJlc3VtZVxuICogIC0gYXVkaW86bXV0ZSAvIGF1ZGlvOnVubXV0ZVxuICogIC0gYXVkaW86c2V0LW1hc3Rlci1nYWluIHsgZ2FpbiB9XG4gKiAgLSBhdWRpbzpzZnggeyBuYW1lLCB2ZWxvY2l0eT8sIHBhbj8gfVxuICogIC0gYXVkaW86bXVzaWM6c2V0LXNjZW5lIHsgc2NlbmUsIHNlZWQ/IH1cbiAqICAtIGF1ZGlvOm11c2ljOnBhcmFtIHsga2V5LCB2YWx1ZSB9XG4gKiAgLSBhdWRpbzptdXNpYzp0cmFuc3BvcnQgeyBjbWQ6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJwYXVzZVwiIH0gIC8vIHBhdXNlIGN1cnJlbnRseSBtYXBzIHRvIHN0b3BcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyhcbiAgYnVzOiBCdXMsXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIG11c2ljOiBNdXNpY0RpcmVjdG9yXG4pOiB2b2lkIHtcbiAgYnVzLm9uKFwiYXVkaW86cmVzdW1lXCIsICgpID0+IGVuZ2luZS5yZXN1bWUoKSk7XG4gIGJ1cy5vbihcImF1ZGlvOm11dGVcIiwgKCkgPT4gZW5naW5lLnNldE1hc3RlckdhaW4oMCkpO1xuICBidXMub24oXCJhdWRpbzp1bm11dGVcIiwgKCkgPT4gZW5naW5lLnNldE1hc3RlckdhaW4oMC45KSk7XG4gIGJ1cy5vbihcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiLCAoeyBnYWluIH06IHsgZ2FpbjogbnVtYmVyIH0pID0+XG4gICAgZW5naW5lLnNldE1hc3RlckdhaW4oTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgZ2FpbikpKVxuICApO1xuXG4gIGJ1cy5vbihcImF1ZGlvOnNmeFwiLCAobXNnOiB7IG5hbWU6IHN0cmluZzsgdmVsb2NpdHk/OiBudW1iZXI7IHBhbj86IG51bWJlciB9KSA9PiB7XG4gICAgcGxheVNmeChlbmdpbmUsIG1zZy5uYW1lIGFzIGFueSwgeyB2ZWxvY2l0eTogbXNnLnZlbG9jaXR5LCBwYW46IG1zZy5wYW4gfSk7XG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiLCAobXNnOiB7IHNjZW5lOiBzdHJpbmcgfSAmIE11c2ljU2NlbmVPcHRpb25zKSA9PiB7XG4gICAgZW5naW5lLnJlc3VtZSgpO1xuICAgIG11c2ljLnNldFNjZW5lKG1zZy5zY2VuZSBhcyBhbnksIHsgc2VlZDogbXNnLnNlZWQgfSk7XG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnBhcmFtXCIsIChfbXNnOiBNdXNpY1BhcmFtTWVzc2FnZSkgPT4ge1xuICAgIC8vIEhvb2sgZm9yIGZ1dHVyZSBwYXJhbSByb3V0aW5nIHBlciBzY2VuZSAoZS5nLiwgaW50ZW5zaXR5L2JyaWdodG5lc3MvZGVuc2l0eSlcbiAgICAvLyBJZiB5b3Ugd2FudCBnbG9iYWwgcGFyYW1zLCBrZWVwIGEgbWFwIGhlcmUgYW5kIGZvcndhcmQgdG8gdGhlIGFjdGl2ZSBzY2VuZVxuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzp0cmFuc3BvcnRcIiwgKHsgY21kIH06IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9KSA9PiB7XG4gICAgaWYgKGNtZCA9PT0gXCJzdG9wXCIgfHwgY21kID09PSBcInBhdXNlXCIpIG11c2ljLnN0b3AoKTtcbiAgICAvLyBcInN0YXJ0XCIgaXMgaW1wbGljaXQgdmlhIHNldFNjZW5lXG4gIH0pO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBCZWFjb25EZWZpbml0aW9uLCBNaXNzaW9uU3RhdGUsIFdvcmxkTWV0YSB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuaW1wb3J0IHsgbW9ub3RvbmljTm93IH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lvbkNvbnRyb2xsZXIge1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBNaXNzaW9uQ29udHJvbGxlck9wdGlvbnMge1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG1vZGU6IHN0cmluZztcbiAgbWlzc2lvbklkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgTWlzc2lvblNwZWMge1xuICBpZDogc3RyaW5nO1xuICBob2xkU2Vjb25kczogbnVtYmVyO1xuICBkZWZhdWx0V29ybGRTaXplOiB7IHc6IG51bWJlcjsgaDogbnVtYmVyIH07XG4gIGJlYWNvbnM6IEFycmF5PHsgZng6IG51bWJlcjsgZnk6IG51bWJlcjsgcmFkaXVzOiBudW1iZXIgfT47XG59XG5cbmludGVyZmFjZSBQZXJzaXN0ZWRQcm9ncmVzcyB7XG4gIGJlYWNvbkluZGV4OiBudW1iZXI7XG4gIGhvbGRBY2N1bTogbnVtYmVyO1xufVxuXG5jb25zdCBTVE9SQUdFX1BSRUZJWCA9IFwibHNkOm1pc3Npb246XCI7XG5jb25zdCBIT0xEX0VQU0lMT04gPSAwLjAwMDE7XG5cbmNvbnN0IENBTVBBSUdOX01JU1NJT05TOiBSZWNvcmQ8c3RyaW5nLCBNaXNzaW9uU3BlYz4gPSB7XG4gIFwiMVwiOiB7XG4gICAgaWQ6IFwiY2FtcGFpZ24tMVwiLFxuICAgIGhvbGRTZWNvbmRzOiAxMCxcbiAgICBkZWZhdWx0V29ybGRTaXplOiB7IHc6IDMyMDAwLCBoOiAxODAwMCB9LFxuICAgIGJlYWNvbnM6IFtcbiAgICAgIHsgZng6IDAuMTUsIGZ5OiAwLjU1LCByYWRpdXM6IDQyMCB9LFxuICAgICAgeyBmeDogMC40MCwgZnk6IDAuNTAsIHJhZGl1czogMzYwIH0sXG4gICAgICB7IGZ4OiAwLjY1LCBmeTogMC40NywgcmFkaXVzOiAzMDAgfSxcbiAgICAgIHsgZng6IDAuODUsIGZ5OiAwLjQ0LCByYWRpdXM6IDI2MCB9LFxuICAgIF0sXG4gIH0sXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRNaXNzaW9uQ29udHJvbGxlcih7IHN0YXRlLCBidXMsIG1vZGUsIG1pc3Npb25JZCB9OiBNaXNzaW9uQ29udHJvbGxlck9wdGlvbnMpOiBNaXNzaW9uQ29udHJvbGxlciB7XG4gIGlmIChtb2RlICE9PSBcImNhbXBhaWduXCIpIHtcbiAgICByZXR1cm4geyBkZXN0cm95KCkge30gfTtcbiAgfVxuXG4gIGNvbnN0IHNwZWMgPSBtaXNzaW9uSWQgJiYgQ0FNUEFJR05fTUlTU0lPTlNbbWlzc2lvbklkXSA/IENBTVBBSUdOX01JU1NJT05TW21pc3Npb25JZF0gOiBDQU1QQUlHTl9NSVNTSU9OU1tcIjFcIl07XG4gIGlmICghc3BlYykge1xuICAgIHJldHVybiB7IGRlc3Ryb3koKSB7fSB9O1xuICB9XG5cbiAgY29uc3Qgc3RvcmFnZUtleSA9IGAke1NUT1JBR0VfUFJFRklYfSR7c3BlYy5pZH1gO1xuICBsZXQgcGVyc2lzdGVkID0gbG9hZFByb2dyZXNzKHN0b3JhZ2VLZXkpO1xuICBjb25zdCBjb21wbGV0ZWRCZWZvcmUgPSBwZXJzaXN0ZWQuYmVhY29uSW5kZXggPj0gc3BlYy5iZWFjb25zLmxlbmd0aDtcbiAgaWYgKGNvbXBsZXRlZEJlZm9yZSkge1xuICAgIHBlcnNpc3RlZCA9IHsgYmVhY29uSW5kZXg6IDAsIGhvbGRBY2N1bTogMCB9O1xuICAgIHRyeSB7XG4gICAgICBzYXZlUHJvZ3Jlc3Moc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkocGVyc2lzdGVkKSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBpZ25vcmUgc3RvcmFnZSBlcnJvcnNcbiAgICB9XG4gIH1cblxuICBsZXQgbWlzc2lvbjogTWlzc2lvblN0YXRlID0ge1xuICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICBtaXNzaW9uSWQ6IHNwZWMuaWQsXG4gICAgYmVhY29uSW5kZXg6IGNsYW1wQmVhY29uSW5kZXgocGVyc2lzdGVkLmJlYWNvbkluZGV4LCBzcGVjLmJlYWNvbnMubGVuZ3RoKSxcbiAgICBob2xkQWNjdW06IGNsYW1wSG9sZChwZXJzaXN0ZWQuaG9sZEFjY3VtLCBzcGVjLmhvbGRTZWNvbmRzKSxcbiAgICBob2xkUmVxdWlyZWQ6IHNwZWMuaG9sZFNlY29uZHMsXG4gICAgYmVhY29uczogW10sXG4gIH07XG5cbiAgbGV0IGxhc3RXb3JsZEtleSA9IFwiXCI7XG4gIGxldCBsYXN0UGVyc2lzdGVkSlNPTiA9IGNvbXBsZXRlZEJlZm9yZSA/IEpTT04uc3RyaW5naWZ5KHBlcnNpc3RlZCkgOiBcIlwiO1xuICBsZXQgbGFzdFNlcnZlck5vdzogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgc3RhdGUubWlzc2lvbiA9IG1pc3Npb247XG4gIGJ1cy5lbWl0KFwibWlzc2lvbjpzdGFydFwiKTtcbiAgLy8gUHJpbWUgYmVhY29uIGNvb3JkaW5hdGVzIGltbWVkaWF0ZWx5IHVzaW5nIHdoYXRldmVyIHdvcmxkIG1ldGEgaXMgYXZhaWxhYmxlLlxuICAvLyBTdWJzZXF1ZW50IHN0YXRlIHVwZGF0ZXMgd2lsbCByZWZpbmUgaWYgdGhlIHdvcmxkIHNpemUgY2hhbmdlcy5cbiAgc3luY0JlYWNvbnMoc3RhdGUud29ybGRNZXRhKTtcblxuICBmdW5jdGlvbiBzeW5jQmVhY29ucyhtZXRhOiBXb3JsZE1ldGEgfCB1bmRlZmluZWQpOiB2b2lkIHtcbiAgICBjb25zdCB3b3JsZFcgPSByZXNvbHZlV29ybGRWYWx1ZShtZXRhPy53LCBzcGVjLmRlZmF1bHRXb3JsZFNpemUudyk7XG4gICAgY29uc3Qgd29ybGRIID0gcmVzb2x2ZVdvcmxkVmFsdWUobWV0YT8uaCwgc3BlYy5kZWZhdWx0V29ybGRTaXplLmgpO1xuICAgIGNvbnN0IGtleSA9IGAke3dvcmxkVy50b0ZpeGVkKDIpfToke3dvcmxkSC50b0ZpeGVkKDIpfWA7XG4gICAgaWYgKGtleSA9PT0gbGFzdFdvcmxkS2V5ICYmIG1pc3Npb24uYmVhY29ucy5sZW5ndGggPT09IHNwZWMuYmVhY29ucy5sZW5ndGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGFzdFdvcmxkS2V5ID0ga2V5O1xuICAgIG1pc3Npb24uYmVhY29ucyA9IHNwZWMuYmVhY29ucy5tYXAoKGRlZik6IEJlYWNvbkRlZmluaXRpb24gPT4gKHtcbiAgICAgIGN4OiBkZWYuZnggKiB3b3JsZFcsXG4gICAgICBjeTogZGVmLmZ5ICogd29ybGRILFxuICAgICAgcmFkaXVzOiBkZWYucmFkaXVzLFxuICAgIH0pKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBlcnNpc3QoZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICAgIGlmICghbWlzc2lvbi5hY3RpdmUgJiYgbWlzc2lvbi5iZWFjb25JbmRleCA+PSBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoKSB7XG4gICAgICAvLyBNaXNzaW9uIGNvbXBsZXRlLCBzdG9yZSBjb21wbGV0aW9uIHdpdGggemVybyBob2xkLlxuICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHsgYmVhY29uSW5kZXg6IG1pc3Npb24uYmVhY29uSW5kZXgsIGhvbGRBY2N1bTogMCB9KTtcbiAgICAgIGlmICghZm9yY2UgJiYgcGF5bG9hZCA9PT0gbGFzdFBlcnNpc3RlZEpTT04pIHJldHVybjtcbiAgICAgIGxhc3RQZXJzaXN0ZWRKU09OID0gcGF5bG9hZDtcbiAgICAgIHNhdmVQcm9ncmVzcyhzdG9yYWdlS2V5LCBwYXlsb2FkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIGJlYWNvbkluZGV4OiBtaXNzaW9uLmJlYWNvbkluZGV4LFxuICAgICAgaG9sZEFjY3VtOiBjbGFtcEhvbGQobWlzc2lvbi5ob2xkQWNjdW0sIG1pc3Npb24uaG9sZFJlcXVpcmVkKSxcbiAgICB9KTtcbiAgICBpZiAoIWZvcmNlICYmIHBheWxvYWQgPT09IGxhc3RQZXJzaXN0ZWRKU09OKSByZXR1cm47XG4gICAgbGFzdFBlcnNpc3RlZEpTT04gPSBwYXlsb2FkO1xuICAgIHNhdmVQcm9ncmVzcyhzdG9yYWdlS2V5LCBwYXlsb2FkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXB1dGVEdChub3dTZWM6IG51bWJlciB8IHVuZGVmaW5lZCB8IG51bGwpOiBudW1iZXIge1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG5vd1NlYykpIHtcbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICBpZiAobGFzdFNlcnZlck5vdyA9PT0gbnVsbCB8fCAhTnVtYmVyLmlzRmluaXRlKGxhc3RTZXJ2ZXJOb3cpKSB7XG4gICAgICBsYXN0U2VydmVyTm93ID0gbm93U2VjITtcbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICBjb25zdCBkdCA9IG5vd1NlYyEgLSBsYXN0U2VydmVyTm93O1xuICAgIGxhc3RTZXJ2ZXJOb3cgPSBub3dTZWMhO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGR0KSB8fCBkdCA8PSAwKSB7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gICAgcmV0dXJuIGR0O1xuICB9XG5cbiAgZnVuY3Rpb24gaXNJbnNpZGVCZWFjb24oY3g6IG51bWJlciwgY3k6IG51bWJlciwgcmFkaXVzOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBjb25zdCBtZSA9IHN0YXRlLm1lO1xuICAgIGlmICghbWUpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBkeCA9IG1lLnggLSBjeDtcbiAgICBjb25zdCBkeSA9IG1lLnkgLSBjeTtcbiAgICBjb25zdCBkaXN0U3EgPSBkeCAqIGR4ICsgZHkgKiBkeTtcbiAgICByZXR1cm4gZGlzdFNxIDw9IHJhZGl1cyAqIHJhZGl1cztcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzU3RhbGxlZCgpOiBib29sZWFuIHtcbiAgICBjb25zdCBoZWF0ID0gc3RhdGUubWU/LmhlYXQ7XG4gICAgaWYgKCFoZWF0KSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3Qgbm93ID0gbW9ub3RvbmljTm93KCk7XG4gICAgcmV0dXJuIE51bWJlci5pc0Zpbml0ZShoZWF0LnN0YWxsVW50aWxNcykgJiYgbm93IDwgaGVhdC5zdGFsbFVudGlsTXM7XG4gIH1cblxuICBmdW5jdGlvbiBsb2NrQ3VycmVudEJlYWNvbigpOiB2b2lkIHtcbiAgICBjb25zdCBsb2NrZWRJbmRleCA9IG1pc3Npb24uYmVhY29uSW5kZXg7XG4gICAgYnVzLmVtaXQoXCJtaXNzaW9uOmJlYWNvbi1sb2NrZWRcIiwgeyBpbmRleDogbG9ja2VkSW5kZXggfSk7XG4gICAgbWlzc2lvbi5iZWFjb25JbmRleCA9IE1hdGgubWluKG1pc3Npb24uYmVhY29uSW5kZXggKyAxLCBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoKTtcbiAgICBtaXNzaW9uLmhvbGRBY2N1bSA9IDA7XG4gICAgcGVyc2lzdCh0cnVlKTtcbiAgICBpZiAobWlzc2lvbi5iZWFjb25JbmRleCA+PSBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoKSB7XG4gICAgICBtaXNzaW9uLmFjdGl2ZSA9IGZhbHNlO1xuICAgICAgcGVyc2lzdCh0cnVlKTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lvbjpjb21wbGV0ZWRcIik7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzZXRIb2xkSWZOZWVkZWQoKTogdm9pZCB7XG4gICAgaWYgKG1pc3Npb24uaG9sZEFjY3VtID4gMCkge1xuICAgICAgbWlzc2lvbi5ob2xkQWNjdW0gPSAwO1xuICAgICAgcGVyc2lzdCgpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHVuc3Vic2NyaWJlID0gYnVzLm9uKFwic3RhdGU6dXBkYXRlZFwiLCAoKSA9PiB7XG4gICAgaWYgKCFzdGF0ZS5taXNzaW9uIHx8ICFzdGF0ZS5taXNzaW9uLmFjdGl2ZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIG1pc3Npb24gPSBzdGF0ZS5taXNzaW9uO1xuICAgIHN5bmNCZWFjb25zKHN0YXRlLndvcmxkTWV0YSk7XG5cbiAgICBpZiAobWlzc2lvbi5iZWFjb25JbmRleCA+PSBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoKSB7XG4gICAgICBtaXNzaW9uLmFjdGl2ZSA9IGZhbHNlO1xuICAgICAgcGVyc2lzdCh0cnVlKTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lvbjpjb21wbGV0ZWRcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgYmVhY29uID0gbWlzc2lvbi5iZWFjb25zW21pc3Npb24uYmVhY29uSW5kZXhdO1xuICAgIGlmICghYmVhY29uKSB7XG4gICAgICBtaXNzaW9uLmFjdGl2ZSA9IGZhbHNlO1xuICAgICAgcGVyc2lzdCh0cnVlKTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lvbjpjb21wbGV0ZWRcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZHQgPSBjb21wdXRlRHQoc3RhdGUubm93KTtcbiAgICBpZiAoIXN0YXRlLm1lKSB7XG4gICAgICBsYXN0U2VydmVyTm93ID0gc3RhdGUubm93O1xuICAgICAgcmVzZXRIb2xkSWZOZWVkZWQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoaXNJbnNpZGVCZWFjb24oYmVhY29uLmN4LCBiZWFjb24uY3ksIGJlYWNvbi5yYWRpdXMpICYmICFpc1N0YWxsZWQoKSkge1xuICAgICAgY29uc3QgbmV4dEhvbGQgPSBNYXRoLm1pbihtaXNzaW9uLmhvbGRSZXF1aXJlZCwgbWlzc2lvbi5ob2xkQWNjdW0gKyBkdCk7XG4gICAgICBpZiAoTWF0aC5hYnMobmV4dEhvbGQgLSBtaXNzaW9uLmhvbGRBY2N1bSkgPiBIT0xEX0VQU0lMT04pIHtcbiAgICAgICAgbWlzc2lvbi5ob2xkQWNjdW0gPSBuZXh0SG9sZDtcbiAgICAgICAgcGVyc2lzdCgpO1xuICAgICAgfVxuICAgICAgaWYgKG1pc3Npb24uaG9sZEFjY3VtICsgSE9MRF9FUFNJTE9OID49IG1pc3Npb24uaG9sZFJlcXVpcmVkKSB7XG4gICAgICAgIGxvY2tDdXJyZW50QmVhY29uKCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc2V0SG9sZElmTmVlZGVkKCk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4ge1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICB1bnN1YnNjcmliZSgpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVXb3JsZFZhbHVlKHZhbHVlOiBudW1iZXIgfCB1bmRlZmluZWQsIGZhbGxiYWNrOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgJiYgdmFsdWUgPiAwKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHJldHVybiBmYWxsYmFjaztcbn1cblxuZnVuY3Rpb24gY2xhbXBCZWFjb25JbmRleChpbmRleDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoaW5kZXgpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgaWYgKGluZGV4IDwgMCkgcmV0dXJuIDA7XG4gIGlmIChpbmRleCA+IHRvdGFsKSByZXR1cm4gdG90YWw7XG4gIHJldHVybiBNYXRoLmZsb29yKGluZGV4KTtcbn1cblxuZnVuY3Rpb24gY2xhbXBIb2xkKGhvbGQ6IG51bWJlciwgaG9sZFJlcXVpcmVkOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShob2xkKSB8fCBob2xkIDwgMCkgcmV0dXJuIDA7XG4gIGlmIChob2xkID4gaG9sZFJlcXVpcmVkKSByZXR1cm4gaG9sZFJlcXVpcmVkO1xuICByZXR1cm4gaG9sZDtcbn1cblxuZnVuY3Rpb24gbG9hZFByb2dyZXNzKHN0b3JhZ2VLZXk6IHN0cmluZyk6IFBlcnNpc3RlZFByb2dyZXNzIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oc3RvcmFnZUtleSk7XG4gICAgaWYgKCFyYXcpIHtcbiAgICAgIHJldHVybiB7IGJlYWNvbkluZGV4OiAwLCBob2xkQWNjdW06IDAgfTtcbiAgICB9XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFBhcnRpYWw8UGVyc2lzdGVkUHJvZ3Jlc3M+IHwgbnVsbDtcbiAgICBpZiAoIXBhcnNlZCkge1xuICAgICAgcmV0dXJuIHsgYmVhY29uSW5kZXg6IDAsIGhvbGRBY2N1bTogMCB9O1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgYmVhY29uSW5kZXg6IGNsYW1wQmVhY29uSW5kZXgocGFyc2VkLmJlYWNvbkluZGV4ID8/IDAsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSxcbiAgICAgIGhvbGRBY2N1bTogdHlwZW9mIHBhcnNlZC5ob2xkQWNjdW0gPT09IFwibnVtYmVyXCIgPyBNYXRoLm1heCgwLCBwYXJzZWQuaG9sZEFjY3VtKSA6IDAsXG4gICAgfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHsgYmVhY29uSW5kZXg6IDAsIGhvbGRBY2N1bTogMCB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIHNhdmVQcm9ncmVzcyhzdG9yYWdlS2V5OiBzdHJpbmcsIHBheWxvYWQ6IHN0cmluZyk6IHZvaWQge1xuICB0cnkge1xuICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShzdG9yYWdlS2V5LCBwYXlsb2FkKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gTG9jYWwgc3RvcmFnZSBtYXkgYmUgdW5hdmFpbGFibGU7IGlnbm9yZS5cbiAgfVxufVxuIiwgImltcG9ydCB7IGNyZWF0ZUV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgeyBjb25uZWN0V2ViU29ja2V0LCBzZW5kTWVzc2FnZSB9IGZyb20gXCIuL25ldFwiO1xuaW1wb3J0IHsgaW5pdEdhbWUgfSBmcm9tIFwiLi9nYW1lXCI7XG5pbXBvcnQgeyBjcmVhdGVJbml0aWFsU3RhdGUsIGNyZWF0ZUluaXRpYWxVSVN0YXRlIH0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7IG1vdW50VHV0b3JpYWwsIEJBU0lDX1RVVE9SSUFMX0lEIH0gZnJvbSBcIi4vdHV0b3JpYWxcIjtcbmltcG9ydCB7IGNsZWFyUHJvZ3Jlc3MgYXMgY2xlYXJUdXRvcmlhbFByb2dyZXNzIH0gZnJvbSBcIi4vdHV0b3JpYWwvc3RvcmFnZVwiO1xuaW1wb3J0IHsgbW91bnRTdG9yeSwgSU5UUk9fQ0hBUFRFUl9JRCwgSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMgfSBmcm9tIFwiLi9zdG9yeVwiO1xuaW1wb3J0IHsgd2FpdEZvclVzZXJTdGFydCB9IGZyb20gXCIuL3N0YXJ0LWdhdGVcIjtcbmltcG9ydCB7IHJlc3VtZUF1ZGlvIH0gZnJvbSBcIi4vc3Rvcnkvc2Z4XCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2F1ZGlvL2VuZ2luZVwiO1xuaW1wb3J0IHsgTXVzaWNEaXJlY3RvciB9IGZyb20gXCIuL2F1ZGlvL211c2ljXCI7XG5pbXBvcnQgeyByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MgfSBmcm9tIFwiLi9hdWRpby9jdWVzXCI7XG5pbXBvcnQgeyBtb3VudE1pc3Npb25Db250cm9sbGVyIH0gZnJvbSBcIi4vbWlzc2lvbi9jb250cm9sbGVyXCI7XG5cbmNvbnN0IENBTExfU0lHTl9TVE9SQUdFX0tFWSA9IFwibHNkOmNhbGxzaWduXCI7XG5cbihhc3luYyBmdW5jdGlvbiBib290c3RyYXAoKSB7XG4gIGNvbnN0IHFzID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcbiAgY29uc3Qgcm9vbSA9IHFzLmdldChcInJvb21cIikgfHwgXCJkZWZhdWx0XCI7XG4gIGNvbnN0IG1vZGUgPSBxcy5nZXQoXCJtb2RlXCIpIHx8IFwiXCI7XG4gIGNvbnN0IG1pc3Npb25JZCA9IHFzLmdldChcIm1pc3Npb25cIikgfHwgKG1vZGUgPT09IFwiY2FtcGFpZ25cIiA/IFwiMVwiIDogbnVsbCk7XG4gIGNvbnN0IG5hbWVQYXJhbSA9IHNhbml0aXplQ2FsbFNpZ24ocXMuZ2V0KFwibmFtZVwiKSk7XG4gIGNvbnN0IHN0b3JlZE5hbWUgPSBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgY29uc3QgY2FsbFNpZ24gPSBuYW1lUGFyYW0gfHwgc3RvcmVkTmFtZTtcbiAgY29uc3QgbWFwVyA9IHBhcnNlRmxvYXQocXMuZ2V0KFwibWFwV1wiKSB8fCBcIjgwMDBcIik7XG4gIGNvbnN0IG1hcEggPSBwYXJzZUZsb2F0KHFzLmdldChcIm1hcEhcIikgfHwgXCI0NTAwXCIpO1xuXG4gIGlmIChuYW1lUGFyYW0gJiYgbmFtZVBhcmFtICE9PSBzdG9yZWROYW1lKSB7XG4gICAgcGVyc2lzdENhbGxTaWduKG5hbWVQYXJhbSk7XG4gIH1cblxuICAvLyBHYXRlIGV2ZXJ5dGhpbmcgb24gYSB1c2VyIGdlc3R1cmUgKGNlbnRyZWQgYnV0dG9uKVxuICBhd2FpdCB3YWl0Rm9yVXNlclN0YXJ0KHtcbiAgICBsYWJlbDogXCJTdGFydCBHYW1lXCIsXG4gICAgcmVxdWVzdEZ1bGxzY3JlZW46IGZhbHNlLCAgIC8vIGZsaXAgdG8gdHJ1ZSBpZiB5b3Ugd2FudCBmdWxsc2NyZWVuXG4gICAgcmVzdW1lQXVkaW8sICAgICAgICAgICAgICAgIC8vIHVzZXMgc3Rvcnkvc2Z4LnRzXG4gIH0pO1xuXG4gIC8vIC0tLS0gU3RhcnQgYWN0dWFsIGFwcCBhZnRlciBnZXN0dXJlIC0tLS1cbiAgY29uc3Qgc3RhdGUgPSBjcmVhdGVJbml0aWFsU3RhdGUoKTtcbiAgY29uc3QgdWlTdGF0ZSA9IGNyZWF0ZUluaXRpYWxVSVN0YXRlKCk7XG4gIGNvbnN0IGJ1cyA9IGNyZWF0ZUV2ZW50QnVzKCk7XG5cbiAgLy8gLS0tIEFVRElPOiBlbmdpbmUgKyBiaW5kaW5ncyArIGRlZmF1bHQgc2NlbmUgLS0tXG4gIGNvbnN0IGVuZ2luZSA9IEF1ZGlvRW5naW5lLmdldCgpO1xuICBhd2FpdCBlbmdpbmUucmVzdW1lKCk7IC8vIHNhZmUgcG9zdC1nZXN0dXJlXG4gIGNvbnN0IG11c2ljID0gbmV3IE11c2ljRGlyZWN0b3IoZW5naW5lKTtcbiAgcmVnaXN0ZXJBdWRpb0J1c0JpbmRpbmdzKGJ1cyBhcyBhbnksIGVuZ2luZSwgbXVzaWMpO1xuXG4gIC8vIFN0YXJ0IGEgZGVmYXVsdCBtdXNpYyBzY2VuZSAoYWRqdXN0IHNlZWQvc2NlbmUgYXMgeW91IGxpa2UpXG4gIGJ1cy5lbWl0KFwiYXVkaW86bXVzaWM6c2V0LXNjZW5lXCIsIHsgc2NlbmU6IFwiYW1iaWVudFwiLCBzZWVkOiA0MiB9KTtcblxuICAvLyBPcHRpb25hbDogYmFzaWMgaG9va3MgdG8gZGVtb25zdHJhdGUgU0ZYICYgZHVja2luZ1xuICAvLyBidXMub24oXCJkaWFsb2d1ZTpvcGVuZWRcIiwgKCkgPT4gZW5naW5lLmR1Y2tNdXNpYygwLjM1LCAwLjEpKTtcbiAgLy8gYnVzLm9uKFwiZGlhbG9ndWU6Y2xvc2VkXCIsICgpID0+IGVuZ2luZS51bmR1Y2tNdXNpYygwLjI1KSk7XG5cbiAgLy8gRXhhbXBsZSBnYW1lIFNGWCB3aXJpbmcgKGFkYXB0IHRvIHlvdXIgYWN0dWFsIGV2ZW50cylcbiAgYnVzLm9uKFwic2hpcDpzcGVlZENoYW5nZWRcIiwgKHsgdmFsdWUgfSkgPT4ge1xuICAgIGlmICh2YWx1ZSA+IDApIGJ1cy5lbWl0KFwiYXVkaW86c2Z4XCIsIHsgbmFtZTogXCJ0aHJ1c3RcIiwgdmVsb2NpdHk6IE1hdGgubWluKDEsIHZhbHVlKSB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZ2FtZSA9IGluaXRHYW1lKHsgc3RhdGUsIHVpU3RhdGUsIGJ1cyB9KTtcbiAgbW91bnRNaXNzaW9uQ29udHJvbGxlcih7IHN0YXRlLCBidXMsIG1vZGUsIG1pc3Npb25JZCB9KTtcblxuICAvLyBNb3VudCB0dXRvcmlhbCBhbmQgc3RvcnkgYmFzZWQgb24gZ2FtZSBtb2RlXG4gIGNvbnN0IGVuYWJsZVR1dG9yaWFsID0gbW9kZSA9PT0gXCJjYW1wYWlnblwiIHx8IG1vZGUgPT09IFwidHV0b3JpYWxcIjtcbiAgY29uc3QgZW5hYmxlU3RvcnkgPSBtb2RlID09PSBcImNhbXBhaWduXCI7XG5cbiAgaWYgKG1vZGUgPT09IFwiY2FtcGFpZ25cIikge1xuICAgIGNvbnN0IGRpc3BhdGNoZWRXYXZlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICAgIGJ1cy5vbihcIm1pc3Npb246YmVhY29uLWxvY2tlZFwiLCAoeyBpbmRleCB9KSA9PiB7XG4gICAgICBjb25zdCB3YXZlSW5kZXggPSBpbmRleCArIDE7XG4gICAgICBpZiAod2F2ZUluZGV4IDwgMSB8fCB3YXZlSW5kZXggPiAzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNwYXRjaGVkV2F2ZXMuaGFzKHdhdmVJbmRleCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZGlzcGF0Y2hlZFdhdmVzLmFkZCh3YXZlSW5kZXgpO1xuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIm1pc3Npb25fc3Bhd25fd2F2ZVwiLCB3YXZlX2luZGV4OiB3YXZlSW5kZXggfSk7XG4gICAgfSk7XG4gIH1cblxuICBsZXQgdHV0b3JpYWw6IFJldHVyblR5cGU8dHlwZW9mIG1vdW50VHV0b3JpYWw+IHwgbnVsbCA9IG51bGw7XG4gIGxldCB0dXRvcmlhbFN0YXJ0ZWQgPSBmYWxzZTtcblxuICBpZiAoZW5hYmxlVHV0b3JpYWwpIHtcbiAgICB0dXRvcmlhbCA9IG1vdW50VHV0b3JpYWwoYnVzKTtcbiAgfVxuXG4gIGNvbnN0IHN0YXJ0VHV0b3JpYWwgPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKCF0dXRvcmlhbCB8fCB0dXRvcmlhbFN0YXJ0ZWQpIHJldHVybjtcbiAgICB0dXRvcmlhbFN0YXJ0ZWQgPSB0cnVlO1xuICAgIGNsZWFyVHV0b3JpYWxQcm9ncmVzcyhCQVNJQ19UVVRPUklBTF9JRCk7XG4gICAgdHV0b3JpYWwuc3RhcnQoeyByZXN1bWU6IGZhbHNlIH0pO1xuICB9O1xuXG4gIGlmIChlbmFibGVTdG9yeSkge1xuICAgIC8vIENhbXBhaWduIG1vZGU6IHN0b3J5ICsgdHV0b3JpYWxcbiAgICBcbiAgICBtb3VudFN0b3J5KHsgYnVzLCBzdGF0ZSwgcm9vbUlkOiByb29tIH0pO1xuICB9IGVsc2UgaWYgKG1vZGUgPT09IFwidHV0b3JpYWxcIikge1xuICAgIC8vIFR1dG9yaWFsIG1vZGU6IGF1dG8tc3RhcnQgdHV0b3JpYWwgd2l0aG91dCBzdG9yeVxuICAgIHN0YXJ0VHV0b3JpYWwoKTtcbiAgfVxuICAvLyBGcmVlIHBsYXkgYW5kIGRlZmF1bHQ6IG5vIHN5c3RlbXMgbW91bnRlZFxuXG4gIGNvbm5lY3RXZWJTb2NrZXQoe1xuICAgIHJvb20sXG4gICAgc3RhdGUsXG4gICAgYnVzLFxuICAgIG1hcFcsXG4gICAgbWFwSCxcbiAgICBtb2RlLFxuICAgIG1pc3Npb25JZDogbWlzc2lvbklkID8/IHVuZGVmaW5lZCxcbiAgICBvblN0YXRlVXBkYXRlZDogKCkgPT4gZ2FtZS5vblN0YXRlVXBkYXRlZCgpLFxuICAgIG9uT3BlbjogKCkgPT4ge1xuICAgICAgY29uc3QgbmFtZVRvU2VuZCA9IGNhbGxTaWduIHx8IHNhbml0aXplQ2FsbFNpZ24ocmVhZFN0b3JlZENhbGxTaWduKCkpO1xuICAgICAgaWYgKG5hbWVUb1NlbmQpIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJqb2luXCIsIG5hbWU6IG5hbWVUb1NlbmQgfSk7XG4gICAgfSxcbiAgfSk7XG5cbiAgLy8gT3B0aW9uYWw6IHN1c3BlbmQvcmVzdW1lIGF1ZGlvIG9uIHRhYiB2aXNpYmlsaXR5IHRvIHNhdmUgQ1BVXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ2aXNpYmlsaXR5Y2hhbmdlXCIsICgpID0+IHtcbiAgICBpZiAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSBcImhpZGRlblwiKSB7XG4gICAgICB2b2lkIGVuZ2luZS5zdXNwZW5kKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZvaWQgZW5naW5lLnJlc3VtZSgpO1xuICAgIH1cbiAgfSk7XG59KSgpO1xuXG5mdW5jdGlvbiBzYW5pdGl6ZUNhbGxTaWduKHZhbHVlOiBzdHJpbmcgfCBudWxsKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkgcmV0dXJuIFwiXCI7XG4gIGNvbnN0IHRyaW1tZWQgPSB2YWx1ZS50cmltKCk7XG4gIGlmICghdHJpbW1lZCkgcmV0dXJuIFwiXCI7XG4gIHJldHVybiB0cmltbWVkLnNsaWNlKDAsIDI0KTtcbn1cblxuZnVuY3Rpb24gcGVyc2lzdENhbGxTaWduKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICB0cnkge1xuICAgIGlmIChuYW1lKSB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZLCBuYW1lKTtcbiAgICBlbHNlIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVkpO1xuICB9IGNhdGNoIHt9XG59XG5cbmZ1bmN0aW9uIHJlYWRTdG9yZWRDYWxsU2lnbigpOiBzdHJpbmcge1xuICB0cnkgeyByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSkgPz8gXCJcIjsgfVxuICBjYXRjaCB7IHJldHVybiBcIlwiOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFxRk8sV0FBUyxpQkFBMkI7QUFDekMsVUFBTSxXQUFXLG9CQUFJLElBQTZCO0FBQ2xELFdBQU87QUFBQSxNQUNMLEdBQUcsT0FBTyxTQUFTO0FBQ2pCLFlBQUksTUFBTSxTQUFTLElBQUksS0FBSztBQUM1QixZQUFJLENBQUMsS0FBSztB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QUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxVQUNQLE1BQU0sa0JBQWtCLEtBQUs7QUFBQSxRQUMvQjtBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsVUFDUCxNQUFNLENBQUMsWUFBWTtBQUNqQixnQkFBSSxDQUFDLHdCQUF3QixTQUFTLENBQUMsRUFBRyxRQUFPO0FBQ2pELGtCQUFNLFVBQVUsZUFBZSxPQUFPO0FBQ3RDLGdCQUFJLFNBQVM7QUFDWCwrQkFBaUI7QUFBQSxZQUNuQjtBQUNBLG1CQUFPO0FBQUEsVUFDVDtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFVBQ1AsTUFBTSxDQUFDLFlBQVk7QUFDakIsa0JBQU0sVUFBVSxlQUFlLE9BQU87QUFDdEMsZ0JBQUksQ0FBQyxRQUFTLFFBQU87QUFDckIsZ0JBQUksQ0FBQyxnQkFBZ0I7QUFDbkIsK0JBQWlCO0FBQ2pCLHFCQUFPO0FBQUEsWUFDVDtBQUNBLG1CQUFPLFlBQVk7QUFBQSxVQUNyQjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFVBQ1AsTUFBTSxDQUFDLFlBQVk7QUFDakIsa0JBQU0sVUFBVSxlQUFlLE9BQU87QUFDdEMsZ0JBQUksQ0FBQyxRQUFTLFFBQU87QUFDckIseUJBQWE7QUFDYixtQkFBTztBQUFBLFVBQ1Q7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxVQUNQLE1BQU0sQ0FBQyxZQUFZO0FBQ2pCLGdCQUFJLENBQUMsd0JBQXdCLFNBQVMsQ0FBQyxFQUFHLFFBQU87QUFDakQsa0JBQU0sVUFBVSxlQUFlLE9BQU87QUFDdEMsZ0JBQUksY0FBYyxXQUFXLFlBQVksWUFBWTtBQUNuRCxxQkFBTztBQUFBLFlBQ1Q7QUFDQSxnQkFBSSxDQUFDLGNBQWMsU0FBUztBQUMxQiwyQkFBYTtBQUFBLFlBQ2Y7QUFDQSxtQkFBTztBQUFBLFVBQ1Q7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxVQUNQLE1BQU0sQ0FBQyxZQUFZO0FBQ2pCLGtCQUFNLFVBQVUsZUFBZSxPQUFPO0FBQ3RDLGdCQUFJLENBQUMsY0FBYyxDQUFDLFFBQVMsUUFBTztBQUNwQyxtQkFBTyxZQUFZO0FBQUEsVUFDckI7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVMsTUFBTTtBQUNiLG9DQUEwQjtBQUFBLFFBQzVCO0FBQUEsUUFDQSxTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsVUFDUCxNQUFNLENBQUMsWUFBWTtBQUNqQix1Q0FBMkI7QUFDM0IsZ0JBQUksMEJBQTBCLEVBQUcsUUFBTztBQUN4QyxrQkFBTSxVQUFVLGVBQWUsT0FBTztBQUN0QyxnQkFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVM7QUFDL0IscUJBQU87QUFBQSxZQUNUO0FBQ0EsbUJBQU8sWUFBWTtBQUFBLFVBQ3JCO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsVUFDUCxNQUFNLENBQUMsWUFBWTtBQUNqQixrQkFBTSxVQUFVLGVBQWUsT0FBTztBQUN0QyxnQkFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVMsUUFBTztBQUN4QyxtQkFBTyxZQUFZO0FBQUEsVUFDckI7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLFdBQVc7QUFBQSxRQUNiO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLElBQ0Y7QUFBQSxFQUNGOzs7QUMvU08sTUFBTSxvQkFBb0I7QUFRMUIsV0FBUyxjQUFjLEtBQW1DO0FBQy9ELFVBQU0sUUFBUSxZQUFZO0FBQzFCLFVBQU0sU0FBUyxxQkFBcUI7QUFBQSxNQUNsQyxJQUFJO0FBQUEsTUFDSjtBQUFBLE1BQ0E7QUFBQSxNQUNBLE9BQU8sc0JBQXNCO0FBQUEsSUFDL0IsQ0FBQztBQUVELFdBQU87QUFBQSxNQUNMLE1BQU0sU0FBUztBQUNiLGVBQU8sTUFBTSxPQUFPO0FBQUEsTUFDdEI7QUFBQSxNQUNBLFVBQVU7QUFDUixlQUFPLFFBQVE7QUFBQSxNQUNqQjtBQUFBLE1BQ0EsVUFBVTtBQUNSLGVBQU8sUUFBUTtBQUFBLE1BQ2pCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7OztBQ05BLE1BQU1DLFlBQVc7QUFFVixXQUFTLHdCQUF5QztBQUN2RCxJQUFBQyxjQUFhO0FBRWIsVUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLFlBQVEsWUFBWTtBQUNwQixZQUFRLGFBQWEsYUFBYSxRQUFRO0FBRTFDLFVBQU0sZUFBZSxTQUFTLGNBQWMsS0FBSztBQUNqRCxpQkFBYSxZQUFZO0FBRXpCLFVBQU0sZUFBZSxTQUFTLGNBQWMsS0FBSztBQUNqRCxpQkFBYSxZQUFZO0FBRXpCLFVBQU0sWUFBWSxTQUFTLGNBQWMsS0FBSztBQUM5QyxjQUFVLFlBQVk7QUFFdEIsVUFBTSxTQUFTLFNBQVMsY0FBYyxNQUFNO0FBQzVDLFdBQU8sWUFBWTtBQUNuQixXQUFPLGNBQWM7QUFFckIsVUFBTSxjQUFjLFNBQVMsY0FBYyxJQUFJO0FBQy9DLGdCQUFZLFlBQVk7QUFFeEIsVUFBTSxpQkFBaUIsU0FBUyxjQUFjLFFBQVE7QUFDdEQsbUJBQWUsT0FBTztBQUN0QixtQkFBZSxZQUFZO0FBQzNCLG1CQUFlLGNBQWM7QUFFN0IsY0FBVSxPQUFPLE1BQU07QUFDdkIsaUJBQWEsT0FBTyxjQUFjLFdBQVcsYUFBYSxjQUFjO0FBQ3hFLFlBQVEsT0FBTyxZQUFZO0FBQzNCLGFBQVMsS0FBSyxZQUFZLE9BQU87QUFFakMsUUFBSSxVQUFVO0FBQ2QsUUFBSSxlQUE4QjtBQUNsQyxRQUFJLGFBQWE7QUFDakIsUUFBSSxnQkFBZ0I7QUFDcEIsUUFBSSxnQkFBd0M7QUFFNUMsYUFBUyxjQUFvQjtBQUMzQixVQUFJLGlCQUFpQixNQUFNO0FBQ3pCLGVBQU8sYUFBYSxZQUFZO0FBQ2hDLHVCQUFlO0FBQUEsTUFDakI7QUFBQSxJQUNGO0FBRUEsYUFBUyxhQUFhLFNBQWdDO0FBMUV4RDtBQTJFSSxzQkFBZ0IsV0FBVztBQUMzQixpQkFBVztBQUNYLGtCQUFZO0FBQ1osb0JBQVEsd0JBQVI7QUFDQSxVQUFJLENBQUMsTUFBTSxRQUFRLFFBQVEsT0FBTyxLQUFLLFFBQVEsUUFBUSxXQUFXLEdBQUc7QUFDbkUscUJBQWEsT0FBTztBQUFBLE1BQ3RCO0FBQUEsSUFDRjtBQUVBLGFBQVMsYUFBbUI7QUFDMUIsWUFBTSxhQUFhLFdBQVcsTUFBTSxHQUFHLGFBQWE7QUFDcEQsZ0JBQVUsWUFBWTtBQUN0QixZQUFNLFdBQVcsU0FBUyxjQUFjLE1BQU07QUFDOUMsZUFBUyxjQUFjO0FBQ3ZCLGdCQUFVLE9BQU8sVUFBVSxNQUFNO0FBQ2pDLGFBQU8sVUFBVSxPQUFPLFVBQVUsQ0FBQyxPQUFPO0FBQUEsSUFDNUM7QUFFQSxhQUFTLGNBQWMsU0FBZ0M7QUFDckQsa0JBQVksWUFBWTtBQUN4QixZQUFNLFVBQVUsTUFBTSxRQUFRLFFBQVEsT0FBTyxJQUFJLFFBQVEsVUFBVSxDQUFDO0FBQ3BFLFVBQUksUUFBUSxXQUFXLEdBQUc7QUFDeEIsb0JBQVksVUFBVSxJQUFJLFFBQVE7QUFDbEM7QUFBQSxNQUNGO0FBQ0Esa0JBQVksVUFBVSxPQUFPLFFBQVE7QUFDckMsY0FBUSxRQUFRLENBQUNDLFNBQVEsVUFBVTtBQUNqQyxjQUFNLE9BQU8sU0FBUyxjQUFjLElBQUk7QUFDeEMsY0FBTSxTQUFTLFNBQVMsY0FBYyxRQUFRO0FBQzlDLGVBQU8sT0FBTztBQUNkLGVBQU8sUUFBUSxXQUFXQSxRQUFPO0FBQ2pDLGVBQU8sY0FBYyxHQUFHLFFBQVEsQ0FBQyxLQUFLQSxRQUFPLElBQUk7QUFDakQsZUFBTyxpQkFBaUIsU0FBUyxNQUFNO0FBM0c3QztBQTRHUSx3QkFBUSxhQUFSLGlDQUFtQkEsUUFBTztBQUFBLFFBQzVCLENBQUM7QUFDRCxhQUFLLE9BQU8sTUFBTTtBQUNsQixvQkFBWSxPQUFPLElBQUk7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDSDtBQUVBLGFBQVMsYUFBYSxTQUFnQztBQW5IeEQ7QUFvSEksVUFBSSxDQUFDLFFBQVEsWUFBWTtBQUN2Qix1QkFBZSxVQUFVLElBQUksUUFBUTtBQUNyQyx1QkFBZSxVQUFVO0FBQ3pCO0FBQUEsTUFDRjtBQUNBLHFCQUFlLGVBQWMsYUFBUSxrQkFBUixZQUF5QjtBQUN0RCxxQkFBZSxVQUFVLE9BQU8sUUFBUTtBQUN4QyxxQkFBZSxVQUFVLE1BQU07QUEzSG5DLFlBQUFDO0FBNEhNLFNBQUFBLE1BQUEsUUFBUSxlQUFSLGdCQUFBQSxJQUFBO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFFQSxhQUFTLGFBQWEsU0FBZ0M7QUFDcEQsa0JBQVk7QUFDWixZQUFNLGNBQWMsTUFBTSxPQUFPLFFBQVEsYUFBYSxLQUFLLElBQUksR0FBRyxFQUFFO0FBQ3BFLFlBQU0sT0FBTyxNQUFZO0FBbkk3QjtBQW9JTSx3QkFBZ0IsS0FBSyxJQUFJLGdCQUFnQixHQUFHLFdBQVcsTUFBTTtBQUM3RCxtQkFBVztBQUNYLFlBQUksaUJBQWlCLFdBQVcsUUFBUTtBQUN0QyxzQkFBWTtBQUNaLHdCQUFRLHdCQUFSO0FBQ0EsY0FBSSxDQUFDLE1BQU0sUUFBUSxRQUFRLE9BQU8sS0FBSyxRQUFRLFFBQVEsV0FBVyxHQUFHO0FBQ25FLHlCQUFhLE9BQU87QUFBQSxVQUN0QjtBQUFBLFFBQ0YsT0FBTztBQUNMLHlCQUFlLE9BQU8sV0FBVyxNQUFNLFdBQVc7QUFBQSxRQUNwRDtBQUFBLE1BQ0Y7QUFDQSxxQkFBZSxPQUFPLFdBQVcsTUFBTSxXQUFXO0FBQUEsSUFDcEQ7QUFFQSxhQUFTLGNBQWMsT0FBNEI7QUFuSnJEO0FBb0pJLFVBQUksQ0FBQyxXQUFXLENBQUMsY0FBZTtBQUNoQyxVQUFJLENBQUMsTUFBTSxRQUFRLGNBQWMsT0FBTyxLQUFLLGNBQWMsUUFBUSxXQUFXLEdBQUc7QUFDL0UsWUFBSSxNQUFNLFFBQVEsT0FBTyxNQUFNLFFBQVEsU0FBUztBQUM5QyxnQkFBTSxlQUFlO0FBQ3JCLGNBQUksZ0JBQWdCLFdBQVcsUUFBUTtBQUNyQyx5QkFBYSxhQUFhO0FBQUEsVUFDNUIsT0FBTztBQUNMLGdDQUFjLGVBQWQ7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUNBO0FBQUEsTUFDRjtBQUNBLFlBQU0sUUFBUSxTQUFTLE1BQU0sS0FBSyxFQUFFO0FBQ3BDLFVBQUksT0FBTyxTQUFTLEtBQUssS0FBSyxTQUFTLEtBQUssU0FBUyxjQUFjLFFBQVEsUUFBUTtBQUNqRixjQUFNLGVBQWU7QUFDckIsY0FBTUQsVUFBUyxjQUFjLFFBQVEsUUFBUSxDQUFDO0FBQzlDLDRCQUFjLGFBQWQsdUNBQXlCQSxRQUFPO0FBQ2hDO0FBQUEsTUFDRjtBQUNBLFVBQUksTUFBTSxRQUFRLFdBQVcsZ0JBQWdCLFdBQVcsUUFBUTtBQUM5RCxjQUFNLGVBQWU7QUFDckIscUJBQWEsYUFBYTtBQUFBLE1BQzVCO0FBQUEsSUFDRjtBQUVBLGFBQVMsS0FBSyxTQUFnQztBQTdLaEQ7QUE4S0ksc0JBQWdCO0FBQ2hCLGdCQUFVO0FBQ1YsY0FBUSxVQUFVLElBQUksU0FBUztBQUMvQixjQUFRLFFBQVEsVUFBUyxhQUFRLFdBQVIsWUFBa0I7QUFDM0MsbUJBQWEsY0FBYyxRQUFRO0FBRW5DLG1CQUFhLFFBQVE7QUFDckIsc0JBQWdCO0FBQ2hCLGlCQUFXO0FBQ1gsb0JBQWMsT0FBTztBQUNyQixtQkFBYSxPQUFPO0FBQ3BCLG1CQUFhLE9BQU87QUFBQSxJQUN0QjtBQUVBLGFBQVMsT0FBYTtBQUNwQixnQkFBVTtBQUNWLHNCQUFnQjtBQUNoQixjQUFRLFVBQVUsT0FBTyxTQUFTO0FBQ2xDLGtCQUFZO0FBQ1osbUJBQWE7QUFDYixzQkFBZ0I7QUFDaEIsZ0JBQVUsWUFBWTtBQUN0QixnQkFBVSxPQUFPLE1BQU07QUFDdkIsa0JBQVksWUFBWTtBQUN4QixrQkFBWSxVQUFVLElBQUksUUFBUTtBQUNsQyxxQkFBZSxVQUFVLElBQUksUUFBUTtBQUNyQyxxQkFBZSxVQUFVO0FBQUEsSUFDM0I7QUFFQSxhQUFTLFVBQWdCO0FBQ3ZCLFdBQUs7QUFDTCxlQUFTLG9CQUFvQixXQUFXLGFBQWE7QUFDckQsY0FBUSxPQUFPO0FBQUEsSUFDakI7QUFFQSxhQUFTLGlCQUFpQixXQUFXLGFBQWE7QUFFbEQsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsWUFBWTtBQUNWLGVBQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFFQSxXQUFTRCxnQkFBcUI7QUFDNUIsUUFBSSxTQUFTLGVBQWVELFNBQVEsR0FBRztBQUNyQztBQUFBLElBQ0Y7QUFDQSxVQUFNLFFBQVEsU0FBUyxjQUFjLE9BQU87QUFDNUMsVUFBTSxLQUFLQTtBQUNYLFVBQU0sY0FBYztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQW9HcEIsYUFBUyxLQUFLLFlBQVksS0FBSztBQUFBLEVBQ2pDOzs7QUM5U08sTUFBTSxvQkFBcUQ7QUFBQTtBQUFBLElBRWhFLCtCQUErQjtBQUFBLE1BQzdCLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLGVBQWU7QUFBQSxNQUNmLFNBQVM7QUFBQSxRQUNQLEVBQUUsSUFBSSxlQUFlLE1BQU0seUJBQXlCO0FBQUEsUUFDcEQsRUFBRSxJQUFJLFlBQVksTUFBTSxnQ0FBZ0M7QUFBQSxRQUN4RCxFQUFFLElBQUksVUFBVSxNQUFNLHNDQUFzQztBQUFBLE1BQzlEO0FBQUEsTUFDQSxhQUFhO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsTUFDUjtBQUFBLElBQ0Y7QUFBQTtBQUFBLElBR0Esa0NBQWtDO0FBQUEsTUFDaEMsU0FBUztBQUFBLE1BQ1QsTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsYUFBYTtBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLE1BQ1I7QUFBQSxJQUNGO0FBQUE7QUFBQSxJQUdBLGtDQUFrQztBQUFBLE1BQ2hDLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLGVBQWU7QUFBQSxNQUNmLGVBQWU7QUFBQSxNQUNmLGFBQWE7QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxNQUNSO0FBQUEsSUFDRjtBQUFBO0FBQUEsSUFHQSxrQ0FBa0M7QUFBQSxNQUNoQyxTQUFTO0FBQUEsTUFDVCxNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixlQUFlO0FBQUEsTUFDZixlQUFlO0FBQUEsTUFDZixhQUFhO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsTUFDUjtBQUFBLElBQ0Y7QUFBQTtBQUFBLElBR0Esa0NBQWtDO0FBQUEsTUFDaEMsU0FBUztBQUFBLE1BQ1QsTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLElBQ2pCO0FBQUEsRUFDRjtBQUtPLFdBQVMsbUJBQW1CLFFBQXdDO0FBQ3pFLFdBQU8sa0JBQWtCLE1BQU0sS0FBSztBQUFBLEVBQ3RDOzs7QUM1RU8sV0FBUyxzQkFBc0IsRUFBRSxLQUFLLFNBQVMsTUFBTSxHQUE0QztBQUN0RyxVQUFNLFlBQStCLENBQUM7QUFDdEMsUUFBSSxxQkFBeUM7QUFFN0MsYUFBUyxvQkFBb0IsRUFBRSxPQUFPLEdBQTZCO0FBQ2pFLGNBQVEsSUFBSSwyQkFBMkIsTUFBTTtBQUk3QyxZQUFNLFFBQVEsT0FBTyxNQUFNLEdBQUc7QUFDOUIsVUFBSSxNQUFNLFNBQVMsS0FBSyxNQUFNLENBQUMsTUFBTSxTQUFTO0FBQzVDLGdCQUFRLEtBQUssbUNBQW1DLE1BQU07QUFDdEQ7QUFBQSxNQUNGO0FBRUEsWUFBTSxVQUFVLE1BQU0sQ0FBQztBQUN2QixZQUFNLE9BQU8sTUFBTSxNQUFNLENBQUMsRUFBRSxLQUFLLEdBQUc7QUFLcEMsMEJBQW9CLFNBQVMsTUFBTSxNQUFNO0FBQUEsSUFDM0M7QUFFQSxhQUFTLG9CQUFvQixTQUFpQixNQUFjLFlBQTBCO0FBQ3BGLFlBQU0sVUFBVSxtQkFBbUIsVUFBVTtBQUM3QyxjQUFRLElBQUksNkJBQTZCLE9BQU87QUFDaEQsVUFBSSxDQUFDLFNBQVM7QUFDWixnQkFBUSxLQUFLLDBDQUEwQyxVQUFVO0FBRWpFLHdCQUFnQixZQUFZLElBQUk7QUFDaEM7QUFBQSxNQUNGO0FBR0EsVUFBSSxRQUFRLGFBQWE7QUFDdkIsd0JBQWdCLFFBQVEsV0FBVztBQUFBLE1BQ3JDO0FBR0EsWUFBTSxpQkFBc0I7QUFBQSxRQUMxQixTQUFTLFFBQVE7QUFBQSxRQUNqQixNQUFNLFFBQVE7QUFBQSxRQUNkLFFBQVEsUUFBUTtBQUFBLFFBQ2hCLGVBQWUsUUFBUTtBQUFBLFFBQ3ZCLGVBQWUsUUFBUTtBQUFBLE1BQ3pCO0FBR0EsVUFBSSxRQUFRLFdBQVcsUUFBUSxRQUFRLFNBQVMsR0FBRztBQUNqRCx1QkFBZSxVQUFVLFFBQVE7QUFDakMsdUJBQWUsV0FBVyxDQUFDLGFBQXFCO0FBQzlDLDBCQUFnQjtBQUNoQixrQkFBUSxLQUFLO0FBQ2IsMEJBQWdCLFlBQVksUUFBUTtBQUNwQyxjQUFJLEtBQUssbUJBQW1CLEVBQUUsUUFBUSxNQUFNLFdBQVcsUUFBUSxDQUFDO0FBQUEsUUFDbEU7QUFBQSxNQUNGLE9BQU87QUFFTCx1QkFBZSxhQUFhLE1BQU07QUFDaEMsMEJBQWdCO0FBQ2hCLGtCQUFRLEtBQUs7QUFDYiwwQkFBZ0IsWUFBWSxJQUFJO0FBQ2hDLGNBQUksS0FBSyxtQkFBbUIsRUFBRSxRQUFRLE1BQU0sV0FBVyxRQUFRLENBQUM7QUFBQSxRQUNsRTtBQUFBLE1BQ0Y7QUFHQSxVQUFJLFFBQVEsYUFBYTtBQUN2Qix1QkFBZSxzQkFBc0IsTUFBTTtBQUN6QyxxQkFBVyxNQUFNO0FBQ2YsNEJBQWdCO0FBQ2hCLG9CQUFRLEtBQUs7QUFDYiw0QkFBZ0IsWUFBWSxJQUFJO0FBQ2hDLGdCQUFJLEtBQUssbUJBQW1CLEVBQUUsUUFBUSxNQUFNLFdBQVcsUUFBUSxDQUFDO0FBQUEsVUFDbEUsR0FBRyxRQUFRLFlBQVksT0FBTztBQUFBLFFBQ2hDO0FBQUEsTUFDRjtBQUVBLGNBQVEsS0FBSyxjQUFjO0FBRTNCLFVBQUksS0FBSyxtQkFBbUIsRUFBRSxRQUFRLE1BQU0sV0FBVyxRQUFRLENBQUM7QUFBQSxJQUNsRTtBQUVBLGFBQVMsZ0JBQWdCLEtBQTRDO0FBQ25FLHNCQUFnQjtBQUVoQixZQUFNLGVBQWUsU0FBUyxjQUFjLEtBQUs7QUFDakQsbUJBQWEsWUFBWTtBQUN6QixtQkFBYSxZQUFZO0FBQUE7QUFBQSxnREFFbUIsV0FBVyxJQUFJLEtBQUssQ0FBQztBQUFBLCtDQUN0QixXQUFXLElBQUksSUFBSSxDQUFDO0FBQUE7QUFBQTtBQUcvRCxlQUFTLEtBQUssWUFBWSxZQUFZO0FBQ3RDLDJCQUFxQjtBQUdyQiw4QkFBd0I7QUFBQSxJQUMxQjtBQUVBLGFBQVMsa0JBQXdCO0FBQy9CLFVBQUksb0JBQW9CO0FBQ3RCLDJCQUFtQixPQUFPO0FBQzFCLDZCQUFxQjtBQUFBLE1BQ3ZCO0FBQUEsSUFDRjtBQUVBLGFBQVMsV0FBVyxNQUFzQjtBQUN4QyxZQUFNLE1BQU0sU0FBUyxjQUFjLEtBQUs7QUFDeEMsVUFBSSxjQUFjO0FBQ2xCLGFBQU8sSUFBSTtBQUFBLElBQ2I7QUFFQSxhQUFTLDBCQUFnQztBQUN2QyxZQUFNLFVBQVU7QUFDaEIsVUFBSSxTQUFTLGVBQWUsT0FBTyxHQUFHO0FBQ3BDO0FBQUEsTUFDRjtBQUNBLFlBQU0sUUFBUSxTQUFTLGNBQWMsT0FBTztBQUM1QyxZQUFNLEtBQUs7QUFDWCxZQUFNLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUF3Q3BCLGVBQVMsS0FBSyxZQUFZLEtBQUs7QUFBQSxJQUNqQztBQUVBLGFBQVMsZ0JBQWdCLFFBQWdCLFVBQStCO0FBQ3RFLFlBQU0sTUFBNkQ7QUFBQSxRQUNqRSxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsTUFDWDtBQUNBLFVBQUksVUFBVTtBQUNaLFlBQUksWUFBWTtBQUFBLE1BQ2xCO0FBQ0Esa0JBQVksR0FBRztBQUNmLGNBQVEsSUFBSSw4QkFBOEIsUUFBUSxXQUFXLFlBQVksUUFBUSxNQUFNLEVBQUU7QUFBQSxJQUMzRjtBQUVBLGFBQVMsUUFBYztBQXZNekI7QUF3TUksY0FBUSxJQUFJLG1DQUFtQztBQUUvQyxnQkFBVSxLQUFLLElBQUksR0FBRyx1QkFBdUIsbUJBQW1CLENBQUM7QUFHakUsV0FBSSxXQUFNLFVBQU4sbUJBQWEsWUFBWTtBQUMzQixnQkFBUSxJQUFJLCtDQUErQyxNQUFNLE1BQU0sVUFBVTtBQUNqRiw0QkFBb0IsRUFBRSxRQUFRLE1BQU0sTUFBTSxXQUFXLENBQUM7QUFBQSxNQUN4RDtBQUFBLElBQ0Y7QUFFQSxhQUFTLFVBQWdCO0FBQ3ZCLHNCQUFnQjtBQUNoQixnQkFBVSxRQUFRLENBQUMsVUFBVSxNQUFNLENBQUM7QUFDcEMsZ0JBQVUsU0FBUztBQUFBLElBQ3JCO0FBRUEsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7OztBQ3hNTyxXQUFTLFdBQVcsRUFBRSxLQUFLLE1BQU0sR0FBdUM7QUFDN0UsVUFBTSxVQUFVLHNCQUFzQjtBQUN0QyxVQUFNLGFBQWEsc0JBQXNCO0FBQUEsTUFDdkM7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0YsQ0FBQztBQUVELGVBQVcsTUFBTTtBQUVqQixXQUFPO0FBQUEsTUFDTCxVQUFVO0FBQ1IsbUJBQVcsUUFBUTtBQUNuQixnQkFBUSxRQUFRO0FBQUEsTUFDbEI7QUFBQSxNQUNBLFFBQVE7QUFHTixnQkFBUSxLQUFLLHVEQUF1RDtBQUFBLE1BQ3RFO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7OztBQ25DQSxNQUFNLGNBQWM7QUFJcEIsV0FBUyxTQUE4QjtBQUNyQyxVQUFNLEtBQU0sT0FBZSxnQkFBaUIsT0FBZTtBQUMzRCxVQUFNLE1BQU8sT0FBZTtBQUM1QixXQUFPLGVBQWUsS0FBSyxNQUFzQjtBQUFBLEVBQ25EO0FBRUEsTUFBTSxjQUFOLE1BQWtCO0FBQUEsSUFJaEIsY0FBYztBQUhkLFdBQVEsVUFBK0IsQ0FBQztBQUN4QyxXQUFRLFlBQVk7QUFJbEIsZUFBUyxpQkFBaUIsbUJBQW1CLENBQUMsTUFBVztBQXZCN0Q7QUF3Qk0sY0FBTSxRQUFRLENBQUMsR0FBQyw0QkFBRyxXQUFILG1CQUFXO0FBQzNCLGFBQUssUUFBUSxLQUFLO0FBQUEsTUFDcEIsQ0FBQztBQUFBLElBQ0g7QUFBQSxJQUVBLFVBQW1CO0FBQ2pCLGFBQU8sYUFBYSxRQUFRLFdBQVcsTUFBTTtBQUFBLElBQy9DO0FBQUEsSUFFUSxLQUFLLE9BQWdCO0FBQzNCLFVBQUk7QUFBRSxxQkFBYSxRQUFRLGFBQWEsUUFBUSxNQUFNLEdBQUc7QUFBQSxNQUFHLFNBQVE7QUFBQSxNQUFDO0FBQUEsSUFDdkU7QUFBQSxJQUVRLE1BQU0sS0FBd0IsT0FBZ0I7QUFDcEQsVUFBSSxhQUFhLGdCQUFnQixPQUFPLEtBQUssQ0FBQztBQUM5QyxVQUFJLFFBQVEsUUFBUSxlQUFlO0FBQ25DLFVBQUksY0FBYyxRQUFRLHFCQUFjO0FBQUEsSUFDMUM7QUFBQSxJQUVRLFFBQVEsT0FBZ0I7QUFDOUIsV0FBSyxRQUFRLFFBQVEsT0FBSyxLQUFLLE1BQU0sR0FBRyxLQUFLLENBQUM7QUFBQSxJQUNoRDtBQUFBLElBRUEsYUFBYSxLQUF3QjtBQUNuQyxXQUFLLFFBQVEsS0FBSyxHQUFHO0FBQ3JCLFdBQUssTUFBTSxLQUFLLEtBQUssUUFBUSxDQUFDO0FBQzlCLFVBQUksaUJBQWlCLFNBQVMsTUFBTSxLQUFLLE9BQU8sQ0FBQztBQUFBLElBQ25EO0FBQUEsSUFFQSxNQUFNLFNBQVMsT0FBZ0I7QUFDN0IsV0FBSyxLQUFLLEtBQUs7QUFDZixXQUFLLFFBQVEsS0FBSztBQUVsQixZQUFNLE1BQU0sT0FBTztBQUNuQixVQUFJLEtBQUs7QUFDUCxZQUFJO0FBQ0YsY0FBSSxTQUFTLElBQUksVUFBVSxhQUFhO0FBQ3RDLGtCQUFNLElBQUksUUFBUTtBQUFBLFVBQ3BCLFdBQVcsQ0FBQyxTQUFTLElBQUksVUFBVSxXQUFXO0FBQzVDLGtCQUFNLElBQUksT0FBTztBQUFBLFVBQ25CO0FBQUEsUUFDRixTQUFTLEdBQUc7QUFDVixrQkFBUSxLQUFLLCtCQUErQixDQUFDO0FBQUEsUUFDL0M7QUFBQSxNQUNGO0FBRUEsZUFBUyxjQUFjLElBQUksWUFBWSxtQkFBbUIsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUFBLElBQ2xGO0FBQUEsSUFFQSxTQUFTO0FBQ1AsV0FBSyxTQUFTLENBQUMsS0FBSyxRQUFRLENBQUM7QUFBQSxJQUMvQjtBQUFBO0FBQUEsSUFHQSx1QkFBdUI7QUFDckIsVUFBSSxLQUFLLFVBQVc7QUFDcEIsV0FBSyxZQUFZO0FBQ2pCLFlBQU0sT0FBTyxNQUFNO0FBQ2pCLGNBQU0sTUFBTSxPQUFPO0FBQ25CLFlBQUksQ0FBQyxLQUFLO0FBQUUsZ0NBQXNCLElBQUk7QUFBRztBQUFBLFFBQVE7QUFDakQsYUFBSyxTQUFTLEtBQUssUUFBUSxDQUFDO0FBQUEsTUFDOUI7QUFDQSxXQUFLO0FBQUEsSUFDUDtBQUFBLEVBQ0Y7QUFFQSxNQUFNLFVBQVUsSUFBSSxZQUFZO0FBR2hDLFdBQVMsMkJBQTJCO0FBQ2xDLFVBQU0sV0FBVyxTQUFTLGVBQWUsV0FBVztBQUNwRCxRQUFJLENBQUMsU0FBVTtBQUdmLFFBQUksU0FBUyxjQUFjLFdBQVcsRUFBRztBQUV6QyxVQUFNLE1BQU0sU0FBUyxjQUFjLFFBQVE7QUFDM0MsUUFBSSxLQUFLO0FBQ1QsUUFBSSxZQUFZO0FBQ2hCLFFBQUksYUFBYSxnQkFBZ0IsT0FBTztBQUN4QyxRQUFJLFFBQVE7QUFDWixRQUFJLGNBQWM7QUFDbEIsYUFBUyxZQUFZLEdBQUc7QUFDeEIsWUFBUSxhQUFhLEdBQUc7QUFBQSxFQUMxQjtBQUdBLEdBQUMsU0FBUyxvQkFBb0I7QUFDNUIsV0FBTyxpQkFBaUIsV0FBVyxDQUFDLE1BQU07QUFoSDVDO0FBaUhJLFlBQUksT0FBRSxRQUFGLG1CQUFPLG1CQUFrQixLQUFLO0FBQ2hDLFVBQUUsZUFBZTtBQUNqQixnQkFBUSxPQUFPO0FBQUEsTUFDakI7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNILEdBQUc7QUFFSSxXQUFTLGlCQUFpQixPQUF5QixDQUFDLEdBQWtCO0FBQzNFLFVBQU0sRUFBRSxRQUFRLGNBQWMsb0JBQW9CLE9BQU8sYUFBQUksYUFBWSxJQUFJO0FBRXpFLFdBQU8sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUU5QixZQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsY0FBUSxLQUFLO0FBQ2IsY0FBUSxZQUFZO0FBQUE7QUFBQSw2Q0FFcUIsS0FBSyxLQUFLLEtBQUs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFPeEQsZUFBUyxLQUFLLFlBQVksT0FBTztBQUdqQyxZQUFNLFFBQVEsU0FBUyxjQUFjLE9BQU87QUFDNUMsWUFBTSxjQUFjO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBbUJwQixlQUFTLEtBQUssWUFBWSxLQUFLO0FBRy9CLFlBQU0sV0FBVyxRQUFRLGNBQWlDLFlBQVk7QUFDdEUsWUFBTSxpQkFBaUIsUUFBUSxjQUFpQyxtQkFBbUI7QUFDbkYsWUFBTSxVQUFVLFNBQVMsZUFBZSxVQUFVO0FBQ2xELFVBQUksUUFBUyxTQUFRLGFBQWEsT0FBTztBQUN6QyxjQUFRLGFBQWEsY0FBYztBQUduQyxjQUFRLHFCQUFxQjtBQUU3QixZQUFNLFFBQVEsWUFBWTtBQTNLOUI7QUE2S00sWUFBSTtBQUFFLGlCQUFNQSxnQkFBQSxnQkFBQUE7QUFBQSxRQUFpQixTQUFRO0FBQUEsUUFBQztBQUd0QyxnQkFBUSxxQkFBcUI7QUFHN0IsWUFBSSxtQkFBbUI7QUFDckIsY0FBSTtBQUFFLG9CQUFNLG9CQUFTLGlCQUFnQixzQkFBekI7QUFBQSxVQUFnRCxTQUFRO0FBQUEsVUFBQztBQUFBLFFBQ3ZFO0FBR0EsY0FBTSxPQUFPO0FBQ2IsZ0JBQVEsT0FBTztBQUdmLGlDQUF5QjtBQUV6QixnQkFBUTtBQUFBLE1BQ1Y7QUFHQSxlQUFTLGlCQUFpQixTQUFTLE9BQU8sRUFBRSxNQUFNLEtBQUssQ0FBQztBQUd4RCxjQUFRLGlCQUFpQixXQUFXLENBQUMsTUFBTTtBQUN6QyxZQUFJLEVBQUUsUUFBUSxXQUFXLEVBQUUsUUFBUSxLQUFLO0FBQ3RDLFlBQUUsZUFBZTtBQUNqQixnQkFBTTtBQUFBLFFBQ1I7QUFBQSxNQUNGLENBQUM7QUFHRCxlQUFTLFdBQVc7QUFDcEIsZUFBUyxNQUFNO0FBSWYsK0JBQXlCO0FBQUEsSUFDM0IsQ0FBQztBQUFBLEVBQ0g7OztBQ2xOTyxNQUFNLGVBQU4sTUFBTSxhQUFZO0FBQUEsSUFpQmYsY0FBYztBQVR0QixXQUFRLGdCQUFnQjtBQUN4QixXQUFRLGVBQWU7QUFDdkIsV0FBUSxhQUFhO0FBUW5CLFdBQUssTUFBTSxJQUFJLGFBQWE7QUFDNUIsTUFBQyxPQUFlLGdCQUFpQixLQUFhO0FBRTlDLFdBQUssU0FBUyxJQUFJLFNBQVMsS0FBSyxLQUFLLEVBQUUsTUFBTSxLQUFLLGNBQWMsQ0FBQztBQUNqRSxXQUFLLFdBQVcsSUFBSSxTQUFTLEtBQUssS0FBSyxFQUFFLE1BQU0sS0FBSyxhQUFhLENBQUM7QUFDbEUsV0FBSyxTQUFTLElBQUksU0FBUyxLQUFLLEtBQUssRUFBRSxNQUFNLEtBQUssV0FBVyxDQUFDO0FBRTlELFdBQUssU0FBUyxRQUFRLEtBQUssTUFBTTtBQUNqQyxXQUFLLE9BQU8sUUFBUSxLQUFLLE1BQU07QUFDL0IsV0FBSyxPQUFPLFFBQVEsS0FBSyxJQUFJLFdBQVc7QUFBQSxJQUMxQztBQUFBLElBaEJBLE9BQU8sTUFBbUI7QUFDeEIsVUFBSSxDQUFDLEtBQUssTUFBTyxNQUFLLFFBQVEsSUFBSSxhQUFZO0FBQzlDLGFBQU8sS0FBSztBQUFBLElBQ2Q7QUFBQSxJQWVBLElBQUksTUFBYztBQUNoQixhQUFPLEtBQUssSUFBSTtBQUFBLElBQ2xCO0FBQUEsSUFFQSxjQUF3QjtBQUN0QixhQUFPLEtBQUs7QUFBQSxJQUNkO0FBQUEsSUFFQSxZQUFzQjtBQUNwQixhQUFPLEtBQUs7QUFBQSxJQUNkO0FBQUEsSUFFQSxNQUFNLFNBQXdCO0FBQzVCLFVBQUksS0FBSyxJQUFJLFVBQVUsYUFBYTtBQUNsQyxjQUFNLEtBQUssSUFBSSxPQUFPO0FBQUEsTUFDeEI7QUFBQSxJQUNGO0FBQUEsSUFFQSxNQUFNLFVBQXlCO0FBQzdCLFVBQUksS0FBSyxJQUFJLFVBQVUsV0FBVztBQUNoQyxjQUFNLEtBQUssSUFBSSxRQUFRO0FBQUEsTUFDekI7QUFBQSxJQUNGO0FBQUEsSUFFQSxjQUFjLEdBQVcsSUFBSSxLQUFLLEtBQUssT0FBTyxNQUFZO0FBQ3hELFdBQUssZ0JBQWdCO0FBQ3JCLFdBQUssT0FBTyxLQUFLLHNCQUFzQixDQUFDO0FBQ3hDLFdBQUssT0FBTyxLQUFLLHdCQUF3QixHQUFHLElBQUksSUFBSTtBQUFBLElBQ3REO0FBQUEsSUFFQSxhQUFhLEdBQVcsSUFBSSxLQUFLLEtBQUssT0FBTyxNQUFZO0FBQ3ZELFdBQUssZUFBZTtBQUNwQixXQUFLLFNBQVMsS0FBSyxzQkFBc0IsQ0FBQztBQUMxQyxXQUFLLFNBQVMsS0FBSyx3QkFBd0IsR0FBRyxJQUFJLElBQUk7QUFBQSxJQUN4RDtBQUFBLElBRUEsV0FBVyxHQUFXLElBQUksS0FBSyxLQUFLLE9BQU8sTUFBWTtBQUNyRCxXQUFLLGFBQWE7QUFDbEIsV0FBSyxPQUFPLEtBQUssc0JBQXNCLENBQUM7QUFDeEMsV0FBSyxPQUFPLEtBQUssd0JBQXdCLEdBQUcsSUFBSSxJQUFJO0FBQUEsSUFDdEQ7QUFBQSxJQUVBLFVBQVUsUUFBUSxLQUFLLFNBQVMsTUFBWTtBQUMxQyxZQUFNLElBQUksS0FBSztBQUNmLFdBQUssU0FBUyxLQUFLLHNCQUFzQixDQUFDO0FBQzFDLFdBQUssU0FBUyxLQUFLLHdCQUF3QixPQUFPLElBQUksTUFBTTtBQUFBLElBQzlEO0FBQUEsSUFFQSxZQUFZLFVBQVUsTUFBWTtBQUNoQyxZQUFNLElBQUksS0FBSztBQUNmLFdBQUssU0FBUyxLQUFLLHNCQUFzQixDQUFDO0FBQzFDLFdBQUssU0FBUyxLQUFLLHdCQUF3QixLQUFLLGNBQWMsSUFBSSxPQUFPO0FBQUEsSUFDM0U7QUFBQSxFQUNGO0FBbEZFLEVBRFcsYUFDSSxRQUE0QjtBQUR0QyxNQUFNLGNBQU47QUFzRkEsV0FBUyxTQUFTLE1BQW9CO0FBQzNDLFFBQUksSUFBSyxTQUFTLEtBQU07QUFDeEIsV0FBTyxXQUFZO0FBQ2pCLFdBQUs7QUFDTCxVQUFJLElBQUksS0FBSyxLQUFLLElBQUssTUFBTSxJQUFLLElBQUksQ0FBQztBQUN2QyxXQUFLLElBQUksS0FBSyxLQUFLLElBQUssTUFBTSxHQUFJLEtBQUssQ0FBQztBQUN4QyxlQUFTLElBQUssTUFBTSxRQUFTLEtBQUs7QUFBQSxJQUNwQztBQUFBLEVBQ0Y7OztBQzlGTyxXQUFTLElBQUksS0FBbUIsTUFBc0IsTUFBYztBQUN6RSxXQUFPLElBQUksZUFBZSxLQUFLLEVBQUUsTUFBTSxXQUFXLEtBQUssQ0FBQztBQUFBLEVBQzFEO0FBRU8sV0FBUyxNQUFNLEtBQW1CO0FBQ3ZDLFVBQU0sU0FBUyxJQUFJLGFBQWEsR0FBRyxJQUFJLGFBQWEsR0FBRyxJQUFJLFVBQVU7QUFDckUsVUFBTSxPQUFPLE9BQU8sZUFBZSxDQUFDO0FBQ3BDLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxRQUFRLElBQUssTUFBSyxDQUFDLElBQUksS0FBSyxPQUFPLElBQUksSUFBSTtBQUNwRSxXQUFPLElBQUksc0JBQXNCLEtBQUssRUFBRSxRQUFRLE1BQU0sS0FBSyxDQUFDO0FBQUEsRUFDOUQ7QUFFTyxXQUFTLFdBQVcsS0FBbUIsTUFBTSxHQUFHO0FBQ3JELFdBQU8sSUFBSSxpQkFBaUIsS0FBSyxFQUFFLElBQUksQ0FBQztBQUFBLEVBQzFDO0FBR08sV0FBUyxLQUNkLEtBQ0EsT0FDQSxJQUNBLElBQUksTUFDSixJQUFJLE1BQ0osSUFBSSxLQUNKLElBQUksS0FDSixPQUFPLEdBQ1A7QUFDQSxVQUFNLHNCQUFzQixFQUFFO0FBQzlCLFVBQU0sZUFBZSxHQUFHLEVBQUU7QUFDMUIsVUFBTSx3QkFBd0IsTUFBTSxLQUFLLENBQUM7QUFDMUMsVUFBTSx3QkFBd0IsSUFBSSxNQUFNLEtBQUssSUFBSSxDQUFDO0FBQ2xELFdBQU8sQ0FBQyxZQUFZLElBQUksZ0JBQWdCO0FBQ3RDLFlBQU0sc0JBQXNCLFNBQVM7QUFFckMsWUFBTSxlQUFlLE1BQU0sT0FBTyxTQUFTO0FBQzNDLFlBQU0sd0JBQXdCLE1BQVEsWUFBWSxDQUFDO0FBQUEsSUFDckQ7QUFBQSxFQUNGOzs7QUNqQ08sV0FBUyxRQUNkLFFBQ0EsTUFDQSxPQUE0QyxDQUFDLEdBQzdDO0FBQ0EsWUFBUSxNQUFNO0FBQUEsTUFDWixLQUFLO0FBQVMsZUFBTyxVQUFVLFFBQVEsSUFBSTtBQUFBLE1BQzNDLEtBQUs7QUFBVSxlQUFPLFdBQVcsUUFBUSxJQUFJO0FBQUEsTUFDN0MsS0FBSztBQUFhLGVBQU8sY0FBYyxRQUFRLElBQUk7QUFBQSxNQUNuRCxLQUFLO0FBQVEsZUFBTyxTQUFTLFFBQVEsSUFBSTtBQUFBLE1BQ3pDLEtBQUs7QUFBTSxlQUFPLE9BQU8sUUFBUSxJQUFJO0FBQUEsTUFDckMsS0FBSztBQUFZLGVBQU8sYUFBYSxRQUFRLElBQUk7QUFBQSxJQUNuRDtBQUFBLEVBQ0Y7QUFFTyxXQUFTLFVBQ2QsUUFDQSxFQUFFLFdBQVcsR0FBRyxNQUFNLEVBQUUsSUFBSSxDQUFDLEdBQzdCO0FBQ0EsVUFBTSxFQUFFLEtBQUssSUFBSSxJQUFJO0FBQ3JCLFVBQU0sTUFBTSxPQUFPLFVBQVU7QUFFN0IsVUFBTSxJQUFJLElBQUksS0FBSyxVQUFVLE1BQU0sTUFBTSxRQUFRO0FBQ2pELFVBQU0sSUFBSSxJQUFJLGlCQUFpQixLQUFLLEVBQUUsTUFBTSxXQUFXLFdBQVcsS0FBSyxDQUFDO0FBQ3hFLFVBQU0sSUFBSSxJQUFJLFNBQVMsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUFDO0FBQ3ZDLFVBQU0sSUFBSSxXQUFXLEtBQUssR0FBRztBQUU3QixNQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVEsR0FBRztBQUM5QyxVQUFNLFVBQVUsS0FBSyxLQUFLLEVBQUUsTUFBTSxLQUFLLE1BQU8sTUFBTSxNQUFNLE1BQU0sSUFBSTtBQUNwRSxNQUFFLE1BQU0sR0FBRztBQUNYLFlBQVEsTUFBTSxJQUFJO0FBQ2xCLE1BQUUsS0FBSyxNQUFNLEdBQUc7QUFBQSxFQUNsQjtBQUVPLFdBQVMsV0FDZCxRQUNBLEVBQUUsV0FBVyxLQUFLLE1BQU0sRUFBRSxJQUFJLENBQUMsR0FDL0I7QUFDQSxVQUFNLEVBQUUsS0FBSyxJQUFJLElBQUk7QUFDckIsVUFBTSxNQUFNLE9BQU8sVUFBVTtBQUU3QixVQUFNLElBQUksTUFBTSxHQUFHO0FBQ25CLFVBQU0sSUFBSSxJQUFJLGlCQUFpQixLQUFLO0FBQUEsTUFDbEMsTUFBTTtBQUFBLE1BQ04sV0FBVyxNQUFNLE1BQU07QUFBQSxNQUN2QixHQUFHO0FBQUEsSUFDTCxDQUFDO0FBQ0QsVUFBTSxJQUFJLElBQUksU0FBUyxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUM7QUFDdkMsVUFBTSxJQUFJLFdBQVcsS0FBSyxHQUFHO0FBRTdCLE1BQUUsUUFBUSxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUSxHQUFHO0FBQzlDLFVBQU0sVUFBVSxLQUFLLEtBQUssRUFBRSxNQUFNLEtBQUssT0FBTyxNQUFNLE1BQU0sTUFBTSxPQUFPLFFBQVE7QUFDL0UsTUFBRSxNQUFNLEdBQUc7QUFDWCxZQUFRLE1BQU0sSUFBSTtBQUNsQixNQUFFLEtBQUssTUFBTSxDQUFHO0FBQUEsRUFDbEI7QUFFTyxXQUFTLGNBQ2QsUUFDQSxFQUFFLFdBQVcsR0FBRyxNQUFNLEVBQUUsSUFBSSxDQUFDLEdBQzdCO0FBQ0EsVUFBTSxFQUFFLEtBQUssSUFBSSxJQUFJO0FBQ3JCLFVBQU0sTUFBTSxPQUFPLFVBQVU7QUFFN0IsVUFBTSxJQUFJLE1BQU0sR0FBRztBQUNuQixVQUFNLElBQUksSUFBSSxpQkFBaUIsS0FBSztBQUFBLE1BQ2xDLE1BQU07QUFBQSxNQUNOLFdBQVcsT0FBTyxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksVUFBVSxDQUFDLENBQUM7QUFBQSxNQUNyRCxHQUFHO0FBQUEsSUFDTCxDQUFDO0FBQ0QsVUFBTSxJQUFJLElBQUksU0FBUyxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUM7QUFDdkMsVUFBTSxJQUFJLFdBQVcsS0FBSyxHQUFHO0FBRTdCLE1BQUUsUUFBUSxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUSxHQUFHO0FBQzlDLFVBQU0sVUFBVSxLQUFLLEtBQUssRUFBRSxNQUFNLEtBQUssTUFBTyxNQUFNLEtBQUssTUFBTSxNQUFNLFFBQVE7QUFDN0UsTUFBRSxNQUFNLEdBQUc7QUFDWCxZQUFRLE1BQU0sT0FBTyxNQUFNLFFBQVE7QUFDbkMsTUFBRSxLQUFLLE1BQU0sR0FBRztBQUFBLEVBQ2xCO0FBRU8sV0FBUyxTQUNkLFFBQ0EsRUFBRSxXQUFXLEdBQUcsTUFBTSxFQUFFLElBQUksQ0FBQyxHQUM3QjtBQUNBLFVBQU0sRUFBRSxLQUFLLElBQUksSUFBSTtBQUNyQixVQUFNLE1BQU0sT0FBTyxVQUFVO0FBRTdCLFVBQU0sT0FBTyxNQUFNLE1BQU07QUFDekIsVUFBTSxLQUFLLElBQUksS0FBSyxRQUFRLElBQUk7QUFDaEMsVUFBTSxLQUFLLElBQUksS0FBSyxRQUFRLE9BQU8sR0FBRztBQUV0QyxVQUFNLElBQUksSUFBSSxTQUFTLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQztBQUN2QyxVQUFNLElBQUksV0FBVyxLQUFLLEdBQUc7QUFFN0IsT0FBRyxRQUFRLENBQUM7QUFBRyxPQUFHLFFBQVEsQ0FBQztBQUMzQixNQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVEsR0FBRztBQUV4QixVQUFNLFVBQVUsS0FBSyxLQUFLLEVBQUUsTUFBTSxLQUFLLE1BQU8sTUFBTSxHQUFLLE1BQU0sR0FBRztBQUNsRSxPQUFHLE1BQU0sR0FBRztBQUFHLE9BQUcsTUFBTSxNQUFNLElBQUk7QUFDbEMsWUFBUSxNQUFNLElBQUk7QUFDbEIsT0FBRyxLQUFLLE1BQU0sR0FBRztBQUFHLE9BQUcsS0FBSyxNQUFNLElBQUk7QUFBQSxFQUN4QztBQUVPLFdBQVMsT0FBTyxRQUFxQixFQUFFLFdBQVcsR0FBRyxNQUFNLEVBQUUsSUFBSSxDQUFDLEdBQUc7QUFDMUUsVUFBTSxFQUFFLEtBQUssSUFBSSxJQUFJO0FBQ3JCLFVBQU0sTUFBTSxPQUFPLFVBQVU7QUFFN0IsVUFBTSxJQUFJLElBQUksS0FBSyxZQUFZLE1BQU0sTUFBTSxRQUFRO0FBQ25ELFVBQU0sSUFBSSxJQUFJLFNBQVMsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUFDO0FBQ3ZDLFVBQU0sSUFBSSxXQUFXLEtBQUssR0FBRztBQUU3QixNQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVEsR0FBRztBQUNuQyxVQUFNLFVBQVUsS0FBSyxLQUFLLEVBQUUsTUFBTSxLQUFLLE1BQU8sTUFBTSxHQUFLLE1BQU0sSUFBSTtBQUNuRSxNQUFFLE1BQU0sR0FBRztBQUNYLFlBQVEsTUFBTSxJQUFJO0FBQ2xCLE1BQUUsS0FBSyxNQUFNLElBQUk7QUFBQSxFQUNuQjtBQUdPLFdBQVMsYUFBYSxRQUFxQixFQUFFLFdBQVcsR0FBRyxNQUFNLEVBQUUsSUFBSSxDQUFDLEdBQUc7QUFDaEYsVUFBTSxFQUFFLEtBQUssSUFBSSxJQUFJO0FBQ3JCLFVBQU0sTUFBTSxPQUFPLFVBQVU7QUFFN0IsVUFBTSxPQUFPLE1BQU0sTUFBTTtBQUN6QixVQUFNLElBQUksSUFBSSxLQUFLLFFBQVEsSUFBSTtBQUMvQixVQUFNLElBQUksSUFBSSxTQUFTLEtBQUssRUFBRSxNQUFNLEtBQU8sQ0FBQztBQUM1QyxVQUFNLElBQUksV0FBVyxLQUFLLEdBQUc7QUFFN0IsTUFBRSxRQUFRLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxRQUFRLEdBQUc7QUFDbkMsTUFBRSxLQUFLLGVBQWUsTUFBUSxHQUFHO0FBQ2pDLE1BQUUsS0FBSyw2QkFBNkIsTUFBTSxNQUFNLElBQUk7QUFDcEQsTUFBRSxLQUFLLDZCQUE2QixNQUFRLE1BQU0sSUFBSTtBQUV0RCxNQUFFLE1BQU0sR0FBRztBQUNYLE1BQUUsS0FBSyxNQUFNLEdBQUc7QUFBQSxFQUNsQjs7O0FDaklBLGlCQUFzQixjQUE2QjtBQUNqRCxVQUFNLFlBQVksSUFBSSxFQUFFLE9BQU87QUFBQSxFQUNqQzs7O0FDSEEsTUFBTSxRQUFvQztBQUFBLElBQ3hDLFFBQVksQ0FBQyxHQUFFLEdBQUUsR0FBRSxHQUFFLEdBQUUsR0FBRSxFQUFFO0FBQUEsSUFDM0IsUUFBWSxDQUFDLEdBQUUsR0FBRSxHQUFFLEdBQUUsR0FBRSxHQUFFLEVBQUU7QUFBQSxJQUMzQixVQUFZLENBQUMsR0FBRSxHQUFFLEdBQUUsR0FBRSxHQUFFLEdBQUUsRUFBRTtBQUFBLElBQzNCLFFBQVksQ0FBQyxHQUFFLEdBQUUsR0FBRSxHQUFFLEdBQUUsR0FBRSxFQUFFO0FBQUEsSUFDM0IsWUFBWSxDQUFDLEdBQUUsR0FBRSxHQUFFLEdBQUUsR0FBRSxHQUFFLEVBQUU7QUFBQSxJQUMzQixTQUFZLENBQUMsR0FBRSxHQUFFLEdBQUUsR0FBRSxHQUFFLEdBQUUsRUFBRTtBQUFBLElBQzNCLFNBQVksQ0FBQyxHQUFFLEdBQUUsR0FBRSxHQUFFLEdBQUUsR0FBRSxFQUFFO0FBQUEsRUFDN0I7QUFHQSxNQUFNLGdCQUFvQjtBQUMxQixNQUFNLGtCQUFvQjtBQUMxQixNQUFNLG9CQUFvQjtBQUMxQixNQUFNLG9CQUFvQjtBQUMxQixNQUFNLG9CQUFvQjtBQUMxQixNQUFNLG9CQUFvQjtBQUUxQixNQUFNLG1CQUFvQjtBQUMxQixNQUFNLG1CQUFvQjtBQUMxQixNQUFNLG1CQUFvQjtBQUMxQixNQUFNLG1CQUFvQjtBQUMxQixNQUFNLG1CQUFvQjtBQUMxQixNQUFNLGtCQUFvQjtBQUMxQixNQUFNLGtCQUFvQjtBQUMxQixNQUFNLG9CQUFvQjtBQUUxQixNQUFNLGlCQUFvQjtBQUMxQixNQUFNLGlCQUFvQjtBQUMxQixNQUFNLGNBQW9CO0FBQzFCLE1BQU0sY0FBb0I7QUFDMUIsTUFBTSxlQUFvQjtBQUUxQixNQUFNLGVBQW9CO0FBQzFCLE1BQU0sZ0JBQW9CO0FBQzFCLE1BQU0sVUFBb0I7QUFHMUIsTUFBTSx5QkFBeUIsQ0FBQyxHQUFFLEdBQUUsR0FBRSxHQUFFLEdBQUUsR0FBRSxDQUFDO0FBRzdDLE1BQU0sVUFBVSxDQUFDLE1BQWMsS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQ3pELE1BQU0sT0FBTyxDQUFDLEtBQW1CLEdBQVcsTUFBYyxJQUFJLElBQUksS0FBSyxJQUFJO0FBQzNFLE1BQU0sU0FBUyxDQUFLLEtBQW1CLFFBQWEsSUFBSSxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksTUFBTSxDQUFDO0FBRXRGLE1BQU0sYUFBYSxDQUFDLE1BQWMsTUFBTSxLQUFLLElBQUksSUFBSSxJQUFJLE1BQU0sRUFBRTtBQUdqRSxNQUFNLFFBQU4sTUFBWTtBQUFBLElBUVYsWUFDVSxLQUNBLFlBQ1IsVUFDQSxRQUNBLGFBQ0EsS0FDRDtBQU5TO0FBQ0E7QUFUVixXQUFRLFNBQVM7QUFlZixXQUFLLE1BQU0sSUFBSSxlQUFlLEtBQUssRUFBRSxNQUFNLFVBQVUsV0FBVyxPQUFPLENBQUM7QUFHeEUsV0FBSyxVQUFVLElBQUksZUFBZSxLQUFLLEVBQUUsTUFBTSxRQUFRLFdBQVcsS0FBSyxLQUFLLE1BQU0sSUFBSSxFQUFFLENBQUM7QUFDekYsV0FBSyxjQUFjLElBQUksU0FBUyxLQUFLLEVBQUUsTUFBTSxLQUFLLEtBQUssS0FBSyxHQUFHLEVBQUUsQ0FBQztBQUNsRSxXQUFLLFFBQVEsSUFBSSxTQUFTLEtBQUssRUFBRSxNQUFNLEdBQUcsQ0FBQztBQUMzQyxXQUFLLFFBQVEsUUFBUSxLQUFLLFdBQVcsRUFBRSxRQUFRLEtBQUssS0FBSyxFQUFFLFFBQVEsS0FBSyxJQUFJLE1BQU07QUFFbEYsV0FBSyxJQUFJLElBQUksU0FBUyxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUM7QUFDdEMsV0FBSyxJQUFJLFFBQVEsS0FBSyxDQUFDLEVBQUUsUUFBUSxXQUFXO0FBRTVDLFdBQUssSUFBSSxNQUFNO0FBQ2YsV0FBSyxRQUFRLE1BQU07QUFBQSxJQUNyQjtBQUFBLElBRUEsT0FBTyxTQUFpQjtBQUN0QixZQUFNLE1BQU0sS0FBSyxJQUFJO0FBQ3JCLFdBQUssRUFBRSxLQUFLLHNCQUFzQixHQUFHO0FBQ3JDLFdBQUssRUFBRSxLQUFLLGVBQWUsS0FBSyxFQUFFLEtBQUssT0FBTyxHQUFHO0FBQ2pELFdBQUssRUFBRSxLQUFLLHdCQUF3QixLQUFLLFlBQVksTUFBTSxPQUFPO0FBQUEsSUFDcEU7QUFBQSxJQUVBLFlBQVksU0FBaUI7QUFDM0IsVUFBSSxLQUFLLE9BQVE7QUFDakIsV0FBSyxTQUFTO0FBQ2QsWUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixXQUFLLEVBQUUsS0FBSyxzQkFBc0IsR0FBRztBQUNyQyxXQUFLLEVBQUUsS0FBSyxlQUFlLEtBQUssRUFBRSxLQUFLLE9BQU8sR0FBRztBQUNqRCxXQUFLLEVBQUUsS0FBSyx3QkFBd0IsTUFBUSxNQUFNLE9BQU87QUFDekQsaUJBQVcsTUFBTSxLQUFLLEtBQUssR0FBRyxVQUFVLE1BQU8sRUFBRTtBQUFBLElBQ25EO0FBQUEsSUFFQSxhQUFhLFVBQWtCLGNBQXNCO0FBQ25ELFlBQU0sTUFBTSxLQUFLLElBQUk7QUFFckIsWUFBTSxVQUFVLEtBQUssSUFBSSxNQUFRLEtBQUssSUFBSSxVQUFVLEtBQUs7QUFDekQsV0FBSyxJQUFJLFVBQVUsc0JBQXNCLEdBQUc7QUFDNUMsVUFBSTtBQUNGLGFBQUssSUFBSSxVQUFVLGVBQWUsU0FBUyxHQUFHO0FBQzlDLGFBQUssSUFBSSxVQUFVLDZCQUE2QixVQUFVLE1BQU0sWUFBWTtBQUFBLE1BQzlFLFNBQVE7QUFDTixhQUFLLElBQUksVUFBVSx3QkFBd0IsVUFBVSxNQUFNLFlBQVk7QUFBQSxNQUN6RTtBQUFBLElBQ0Y7QUFBQSxJQUVBLE9BQU87QUFDTCxVQUFJO0FBQUUsYUFBSyxJQUFJLEtBQUs7QUFBRyxhQUFLLFFBQVEsS0FBSztBQUFBLE1BQUcsU0FBUTtBQUFBLE1BQUM7QUFDckQsVUFBSTtBQUNGLGFBQUssSUFBSSxXQUFXO0FBQUcsYUFBSyxRQUFRLFdBQVc7QUFDL0MsYUFBSyxFQUFFLFdBQVc7QUFBRyxhQUFLLFlBQVksV0FBVztBQUFHLGFBQUssTUFBTSxXQUFXO0FBQUEsTUFDNUUsU0FBUTtBQUFBLE1BQUM7QUFBQSxJQUNYO0FBQUEsRUFDRjtBQUVPLE1BQU0sZUFBTixNQUFtQjtBQUFBLElBd0J4QixZQUNVLEtBQ0EsS0FDUixPQUFPLEdBQ1A7QUFIUTtBQUNBO0FBekJWLFdBQVEsVUFBVTtBQUNsQixXQUFRLFVBQTZCLENBQUM7QUFDdEMsV0FBUSxXQUFxQixDQUFDO0FBRTlCLFdBQVEsU0FBd0IsRUFBRSxXQUFXLE1BQU0sWUFBWSxLQUFLLFNBQVMsSUFBSTtBQWNqRjtBQUFBLFdBQVEsY0FBYztBQUN0QixXQUFRLE9BQWlCO0FBQ3pCLFdBQVEsaUJBQWlCO0FBQ3pCLFdBQVEsWUFBMEI7QUFPaEMsV0FBSyxNQUFNLFNBQVMsSUFBSTtBQUFBLElBQzFCO0FBQUEsSUFFQSxTQUF3QyxHQUFNLEdBQXFCO0FBQ2pFLFdBQUssT0FBTyxDQUFDLElBQUksUUFBUSxDQUFDO0FBQzFCLFVBQUksS0FBSyxXQUFXLE1BQU0sZUFBZSxLQUFLLFFBQVE7QUFDcEQsYUFBSyxPQUFPLEtBQUssUUFBUSxPQUFPLE9BQU8sS0FBSyxPQUFPO0FBQUEsTUFDckQ7QUFBQSxJQUNGO0FBQUEsSUFFQSxRQUFRO0FBQ04sVUFBSSxLQUFLLFFBQVM7QUFDbEIsV0FBSyxVQUFVO0FBR2YsV0FBSyxTQUFTLElBQUksU0FBUyxLQUFLLEtBQUssRUFBRSxNQUFNLE9BQU8sT0FBTyxLQUFLLE9BQU8sVUFBVSxDQUFDO0FBQ2xGLFdBQUssU0FBUyxJQUFJLGlCQUFpQixLQUFLLEtBQUssRUFBRSxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUM7QUFDMUUsV0FBSyxNQUFNLElBQUksU0FBUyxLQUFLLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQztBQUM3QyxXQUFLLE1BQU0sSUFBSSxTQUFTLEtBQUssS0FBSyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ25ELFdBQUssUUFBUSxJQUFJLFVBQVUsS0FBSyxLQUFLLEVBQUUsV0FBVyxjQUFjLGNBQWMsRUFBRSxDQUFDO0FBQ2pGLFdBQUssV0FBVyxJQUFJLFNBQVMsS0FBSyxLQUFLLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFFOUQsV0FBSyxPQUFPLFFBQVEsS0FBSyxHQUFHLEVBQUUsUUFBUSxLQUFLLE1BQU07QUFDakQsV0FBSyxPQUFPLFFBQVEsS0FBSyxLQUFLO0FBQzlCLFdBQUssTUFBTSxRQUFRLEtBQUssUUFBUSxFQUFFLFFBQVEsS0FBSyxLQUFLO0FBQ3BELFdBQUssTUFBTSxRQUFRLEtBQUssR0FBRyxFQUFFLFFBQVEsS0FBSyxNQUFNO0FBQ2hELFdBQUssT0FBTyxRQUFRLEtBQUssR0FBRztBQUc1QixXQUFLLE9BQU8sVUFBVSxlQUFlLGdCQUFnQixLQUFLLElBQUksV0FBVztBQUN6RSxZQUFNLFFBQVEsTUFBTTtBQUNsQixjQUFNLElBQUksS0FBSyxJQUFJO0FBQ25CLGFBQUssT0FBTyxVQUFVLHNCQUFzQixDQUFDO0FBRTdDLGFBQUssT0FBTyxVQUFVO0FBQUEsVUFDcEIsa0JBQWtCLGlCQUFpQixtQkFBbUIsTUFBTSxNQUFNLEtBQUssT0FBTztBQUFBLFVBQzlFO0FBQUEsVUFBRyxjQUFjO0FBQUEsUUFDbkI7QUFDQSxhQUFLLE9BQU8sVUFBVTtBQUFBLFVBQ3BCLGtCQUFrQixNQUFNLE1BQU0sS0FBSyxPQUFPO0FBQUEsVUFDMUMsSUFBSTtBQUFBLFVBQWEsY0FBYztBQUFBLFFBQ2pDO0FBQ0EsYUFBSyxTQUFTLEtBQUssT0FBTyxXQUFXLE1BQU0sS0FBSyxXQUFXLE1BQU0sR0FBSSxjQUFjLElBQUssR0FBSSxDQUFzQjtBQUFBLE1BQ3BIO0FBQ0EsWUFBTTtBQUdOLFdBQUssVUFBVSxJQUFJLGVBQWUsS0FBSyxLQUFLLEVBQUUsTUFBTSxRQUFRLFdBQVcsWUFBWSxDQUFDO0FBQ3BGLFdBQUssVUFBVSxJQUFJLFNBQVMsS0FBSyxLQUFLLEVBQUUsTUFBTSxnQkFBZ0IsTUFBTSxNQUFNLEtBQUssT0FBTyxZQUFZLENBQUM7QUFDbkcsV0FBSyxRQUFRLFFBQVEsS0FBSyxPQUFPLEVBQUUsUUFBUSxLQUFLLE9BQU8sU0FBUztBQUNoRSxXQUFLLFFBQVEsTUFBTTtBQUduQixXQUFLLGVBQWU7QUFDcEIsV0FBSyxzQkFBc0I7QUFHM0IsV0FBSyxXQUFXO0FBR2hCLFdBQUssUUFBUSxLQUFLLE1BQU07QUF6TjVCO0FBME5NLFlBQUk7QUFBRSxxQkFBSyxZQUFMLG1CQUFjO0FBQUEsUUFBUSxTQUFRO0FBQUEsUUFBQztBQUNyQyxTQUFDLEtBQUssUUFBUSxLQUFLLFFBQVEsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxVQUFVLEtBQUssU0FBUyxLQUFLLE9BQU8sRUFDakcsUUFBUSxPQUFLO0FBQUUsY0FBSTtBQUFFLG1DQUFHO0FBQUEsVUFBYyxTQUFRO0FBQUEsVUFBQztBQUFBLFFBQUUsQ0FBQztBQUFBLE1BQ3ZELENBQUM7QUFBQSxJQUNIO0FBQUEsSUFFQSxPQUFPO0FBQ0wsVUFBSSxDQUFDLEtBQUssUUFBUztBQUNuQixXQUFLLFVBQVU7QUFHZixXQUFLLFNBQVMsT0FBTyxDQUFDLEVBQUUsUUFBUSxRQUFNLE9BQU8sYUFBYSxFQUFFLENBQUM7QUFHN0QsVUFBSSxLQUFLLFVBQVcsTUFBSyxVQUFVLFlBQVksR0FBRztBQUdsRCxXQUFLLFFBQVEsT0FBTyxDQUFDLEVBQUUsUUFBUSxRQUFNLEdBQUcsQ0FBQztBQUFBLElBQzNDO0FBQUE7QUFBQSxJQUlRLGlCQUEyQjtBQUNqQyxhQUFPLE1BQU0sS0FBSyxJQUFJLEtBQUssTUFBTTtBQUFBLElBQ25DO0FBQUE7QUFBQSxJQUdRLGlCQUFpQjtBQUN2QixZQUFNLFdBQVcsS0FBSyxjQUFjLEtBQUssZUFBZSxFQUFFLEtBQUssY0FBYztBQUM3RSxZQUFNLElBQUksSUFBSTtBQUFBLFFBQ1osS0FBSztBQUFBLFFBQ0w7QUFBQSxRQUNBO0FBQUEsUUFDQSxXQUFXLFFBQVE7QUFBQSxRQUNuQixLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsTUFDUDtBQUNBLFFBQUUsT0FBTyxlQUFlO0FBQ3hCLFdBQUssWUFBWTtBQUFBLElBQ25CO0FBQUEsSUFFUSx3QkFBd0I7QUFDOUIsVUFBSSxDQUFDLEtBQUssUUFBUztBQUNuQixZQUFNLFNBQVMsS0FBSyxLQUFLLEtBQUssbUJBQW1CLGlCQUFpQixJQUFJO0FBQ3RFLFlBQU0sS0FBSyxPQUFPLFdBQVcsTUFBTTtBQUNqQyxZQUFJLENBQUMsS0FBSyxXQUFXLENBQUMsS0FBSyxVQUFXO0FBQ3RDLGNBQU0sUUFBUSxLQUFLLEtBQUssS0FBSyxtQkFBbUIsaUJBQWlCO0FBQ2pFLGNBQU0sVUFBVSxLQUFLLHVCQUF1QjtBQUM1QyxjQUFNLGFBQWEsS0FBSyxjQUFjLEtBQUssZUFBZSxFQUFFLE9BQU87QUFDbkUsYUFBSyxVQUFVLGFBQWEsV0FBVyxVQUFVLEdBQUcsS0FBSztBQUN6RCxhQUFLLGlCQUFpQjtBQUN0QixhQUFLLHNCQUFzQjtBQUFBLE1BQzdCLEdBQUcsTUFBTTtBQUNULFdBQUssU0FBUyxLQUFLLEVBQUU7QUFBQSxJQUN2QjtBQUFBLElBRVEseUJBQWlDO0FBQ3ZDLFlBQU0sUUFBUSxDQUFDLEdBQUcsc0JBQXNCO0FBQ3hDLFlBQU0sSUFBSSxNQUFNLFFBQVEsS0FBSyxjQUFjO0FBQzNDLFVBQUksS0FBSyxHQUFHO0FBQUUsY0FBTSxDQUFDLEdBQUcsSUFBSSxNQUFNLE9BQU8sR0FBRyxDQUFDO0FBQUcsY0FBTSxLQUFLLEdBQUc7QUFBQSxNQUFHO0FBQ2pFLGFBQU8sT0FBTyxLQUFLLEtBQUssS0FBSztBQUFBLElBQy9CO0FBQUE7QUFBQSxJQUdRLGtCQUFrQixVQUFvQixXQUFtQixPQUFPLEdBQUcsT0FBTyxPQUFPLFFBQVEsT0FBTyxRQUFRLE9BQU87QUFDckgsWUFBTSxRQUFRLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN6QixZQUFNLFlBQVksTUFBTSxNQUFNLEdBQUcsS0FBSyxJQUFJLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxRQUFNLFlBQVksS0FBSyxDQUFDO0FBQ2hGLFVBQUksS0FBTyxXQUFVLE1BQU0sWUFBWSxLQUFLLENBQUM7QUFDN0MsVUFBSSxNQUFPLFdBQVUsTUFBTSxZQUFZLE1BQU0sQ0FBQztBQUM5QyxVQUFJLE1BQU8sV0FBVSxNQUFNLFlBQVksTUFBTSxDQUFDO0FBQzlDLGFBQU8sVUFBVSxJQUFJLE9BQUssU0FBUyxDQUFDLENBQUM7QUFBQSxJQUN2QztBQUFBLElBRUEsQ0FBUyxnQkFBZ0I7QUFDdkIsYUFBTyxNQUFNO0FBQ1gsY0FBTSxXQUFXLEtBQUssZUFBZTtBQUVyQyxjQUFNLGtCQUFtQixLQUFLLElBQUksSUFBSSxvQkFBcUIsS0FBSyxpQkFBaUIsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUM7QUFHMUcsY0FBTSxJQUFJLEtBQUssSUFBSTtBQUNuQixZQUFJLE9BQU87QUFBRyxZQUFJLE9BQU8sT0FBTyxRQUFRLE9BQU8sUUFBUTtBQUN2RCxZQUFJLElBQUksTUFBaUI7QUFBRSxpQkFBTztBQUFBLFFBQUcsV0FDNUIsSUFBSSxNQUFZO0FBQUUsaUJBQU87QUFBQSxRQUFHLFdBQzVCLElBQUksS0FBWTtBQUFFLGlCQUFPO0FBQUcsaUJBQU87QUFBQSxRQUFNLFdBQ3pDLElBQUksTUFBWTtBQUFFLGlCQUFPO0FBQUcsa0JBQVE7QUFBQSxRQUFNLE9BQzFCO0FBQUUsaUJBQU87QUFBRyxrQkFBUTtBQUFBLFFBQU07QUFFbkQsY0FBTSxhQUFhLEtBQUssa0JBQWtCLFVBQVUsaUJBQWlCLE1BQU0sTUFBTSxPQUFPLEtBQUs7QUFFN0YsY0FBTSxTQUFTLFdBQVcsSUFBSSxVQUFRLE9BQU8sT0FBTyxLQUFLLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQztBQUc5RSxZQUFJLENBQUMsT0FBTyxTQUFTLENBQUMsS0FBSyxLQUFLLElBQUksSUFBSSxJQUFLLFFBQU8sS0FBSyxDQUFDO0FBRTFELGNBQU07QUFBQSxNQUNSO0FBQUEsSUFDRjtBQUFBLElBRUEsTUFBYyxhQUFhO0FBN1Q3QjtBQThUSSxZQUFNLE1BQU0sS0FBSyxjQUFjO0FBQy9CLFlBQU0sU0FBUyxvQkFBSSxJQUFXO0FBRTlCLFlBQU0sUUFBUSxDQUFDLE9BQWUsSUFBSSxRQUFjLE9BQUs7QUFDbkQsY0FBTSxLQUFLLE9BQU8sV0FBVyxNQUFNLEVBQUUsR0FBRyxFQUFFO0FBQzFDLGFBQUssU0FBUyxLQUFLLEVBQUU7QUFBQSxNQUN2QixDQUFDO0FBRUQsYUFBTyxLQUFLLFNBQVM7QUFFbkIsY0FBTSxZQUFZLEtBQUssTUFBTSxJQUFJLEtBQUssT0FBTyxVQUFVLENBQUM7QUFDeEQsY0FBTSxXQUFXLEtBQUs7QUFDdEIsY0FBTSxjQUF1QixTQUFJLEtBQUssRUFBRSxVQUFYLFlBQW9CLENBQUM7QUFHbEQsbUJBQVcsT0FBTyxZQUFZO0FBQzVCLGNBQUksQ0FBQyxLQUFLLFFBQVM7QUFDbkIsY0FBSSxPQUFPLFFBQVEsS0FBSyxJQUFJLGtCQUFrQixTQUFTLEVBQUc7QUFFMUQsZ0JBQU0sT0FBTyxXQUFXO0FBQ3hCLGdCQUFNLE9BQU8sV0FBVyxJQUFJO0FBQzVCLGdCQUFNLFdBQVcsT0FBTyxLQUFLLEtBQUssQ0FBQyxRQUFRLFlBQVksVUFBVSxDQUFxQjtBQUd0RixnQkFBTSxhQUFhLEtBQUssS0FBSyxLQUFLLE1BQU0sSUFBSSxLQUN6QyxPQUFPLE1BQU0sS0FBSyxPQUFPLGNBQ3pCLE1BQU0sTUFBTSxLQUFLLE9BQU87QUFFM0IsZ0JBQU0sSUFBSSxJQUFJLE1BQU0sS0FBSyxLQUFLLFlBQVksVUFBVSxNQUFNLEtBQUssUUFBUSxLQUFLLEdBQUc7QUFDL0UsaUJBQU8sSUFBSSxDQUFDO0FBQ1osWUFBRSxPQUFPLEtBQUssS0FBSyxLQUFLLGtCQUFrQixnQkFBZ0IsQ0FBQztBQUFBLFFBQzdEO0FBRUEsY0FBTSxNQUFNLEtBQUssS0FBSyxLQUFLLGtCQUFrQixnQkFBZ0IsSUFBSSxHQUFJO0FBR3JFLGNBQU0sT0FBTyxNQUFNLEtBQUssTUFBTTtBQUM5QixtQkFBVyxLQUFLLEtBQU0sR0FBRSxZQUFZLEtBQUssS0FBSyxLQUFLLGtCQUFrQixnQkFBZ0IsQ0FBQztBQUN0RixlQUFPLE1BQU07QUFFYixjQUFNLE1BQU0sS0FBSyxLQUFLLEtBQUssaUJBQWlCLGVBQWUsSUFBSSxHQUFJO0FBQUEsTUFDckU7QUFHQSxpQkFBVyxLQUFLLE1BQU0sS0FBSyxNQUFNLEVBQUcsR0FBRSxZQUFZLEdBQUc7QUFBQSxJQUN2RDtBQUFBLEVBQ0Y7OztBQ3hXTyxNQUFNLGdCQUFOLE1BQW9CO0FBQUEsSUFJekIsWUFBb0IsUUFBcUI7QUFBckI7QUFDbEIsV0FBSyxTQUFTLElBQUksU0FBUyxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUNwRCxXQUFLLE9BQU8sUUFBUSxPQUFPLFlBQVksQ0FBQztBQUFBLElBQzFDO0FBQUE7QUFBQSxJQUdBLFNBQVMsTUFBaUIsTUFBMEI7QUFkdEQ7QUFlSSxZQUFJLFVBQUssWUFBTCxtQkFBYyxVQUFTLEtBQU07QUFFakMsWUFBTSxNQUFNLEtBQUs7QUFDakIsWUFBTSxJQUFJLEtBQUssT0FBTztBQUd0QixZQUFNLFVBQVUsSUFBSSxTQUFTLEtBQUssT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDM0QsY0FBUSxRQUFRLEtBQUssT0FBTyxZQUFZLENBQUM7QUFDekMsVUFBSSxLQUFLO0FBRVAsWUFBSSxLQUFLO0FBQ1QsZ0JBQVEsS0FBSyx3QkFBd0IsR0FBSyxJQUFJLEdBQUc7QUFDakQsbUJBQVcsTUFBTSxRQUFRLFdBQVcsR0FBRyxHQUFHO0FBQUEsTUFDNUM7QUFHQSxZQUFNLFdBQVcsSUFBSSxTQUFTLEtBQUssT0FBTyxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUM7QUFDMUQsZUFBUyxRQUFRLEtBQUssTUFBTTtBQUU1QixVQUFJLE9BQU8sTUFBTSxTQUFTLFdBQVc7QUFFckMsVUFBSSxTQUFTLFdBQVc7QUFDdEIsY0FBTSxJQUFJLElBQUksYUFBYSxLQUFLLE9BQU8sS0FBSyxXQUFVLGtDQUFNLFNBQU4sWUFBYyxDQUFDO0FBQ3JFLFVBQUUsTUFBTTtBQUNSLGVBQU8sTUFBTTtBQUNYLFlBQUUsS0FBSztBQUNQLG1CQUFTLFdBQVc7QUFBQSxRQUN0QjtBQUFBLE1BQ0Y7QUFJQSxXQUFLLFVBQVUsRUFBRSxNQUFNLEtBQUs7QUFDNUIsZUFBUyxLQUFLLHdCQUF3QixLQUFLLElBQUksR0FBRztBQUFBLElBQ3BEO0FBQUEsSUFFQSxPQUFPO0FBQ0wsVUFBSSxDQUFDLEtBQUssUUFBUztBQUNuQixXQUFLLFFBQVEsS0FBSztBQUNsQixXQUFLLFVBQVU7QUFBQSxJQUNqQjtBQUFBLEVBQ0Y7OztBQ3ZDTyxXQUFTLHlCQUNkLEtBQ0EsUUFDQSxPQUNNO0FBQ04sUUFBSSxHQUFHLGdCQUFnQixNQUFNLE9BQU8sT0FBTyxDQUFDO0FBQzVDLFFBQUksR0FBRyxjQUFjLE1BQU0sT0FBTyxjQUFjLENBQUMsQ0FBQztBQUNsRCxRQUFJLEdBQUcsZ0JBQWdCLE1BQU0sT0FBTyxjQUFjLEdBQUcsQ0FBQztBQUN0RCxRQUFJO0FBQUEsTUFBRztBQUFBLE1BQXlCLENBQUMsRUFBRSxLQUFLLE1BQ3RDLE9BQU8sY0FBYyxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQztBQUFBLElBQ3JEO0FBRUEsUUFBSSxHQUFHLGFBQWEsQ0FBQyxRQUEyRDtBQUM5RSxjQUFRLFFBQVEsSUFBSSxNQUFhLEVBQUUsVUFBVSxJQUFJLFVBQVUsS0FBSyxJQUFJLElBQUksQ0FBQztBQUFBLElBQzNFLENBQUM7QUFFRCxRQUFJLEdBQUcseUJBQXlCLENBQUMsUUFBK0M7QUFDOUUsYUFBTyxPQUFPO0FBQ2QsWUFBTSxTQUFTLElBQUksT0FBYyxFQUFFLE1BQU0sSUFBSSxLQUFLLENBQUM7QUFBQSxJQUNyRCxDQUFDO0FBRUQsUUFBSSxHQUFHLHFCQUFxQixDQUFDLFNBQTRCO0FBQUEsSUFHekQsQ0FBQztBQUVELFFBQUksR0FBRyx5QkFBeUIsQ0FBQyxFQUFFLElBQUksTUFBMkM7QUFDaEYsVUFBSSxRQUFRLFVBQVUsUUFBUSxRQUFTLE9BQU0sS0FBSztBQUFBLElBRXBELENBQUM7QUFBQSxFQUNIOzs7QUNwQkEsTUFBTUMsa0JBQWlCO0FBQ3ZCLE1BQU0sZUFBZTtBQUVyQixNQUFNLG9CQUFpRDtBQUFBLElBQ3JELEtBQUs7QUFBQSxNQUNILElBQUk7QUFBQSxNQUNKLGFBQWE7QUFBQSxNQUNiLGtCQUFrQixFQUFFLEdBQUcsTUFBTyxHQUFHLEtBQU07QUFBQSxNQUN2QyxTQUFTO0FBQUEsUUFDUCxFQUFFLElBQUksTUFBTSxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsUUFDbEMsRUFBRSxJQUFJLEtBQU0sSUFBSSxLQUFNLFFBQVEsSUFBSTtBQUFBLFFBQ2xDLEVBQUUsSUFBSSxNQUFNLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxRQUNsQyxFQUFFLElBQUksTUFBTSxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDcEM7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVPLFdBQVMsdUJBQXVCLEVBQUUsT0FBTyxLQUFLLE1BQU0sVUFBVSxHQUFnRDtBQUNuSCxRQUFJLFNBQVMsWUFBWTtBQUN2QixhQUFPLEVBQUUsVUFBVTtBQUFBLE1BQUMsRUFBRTtBQUFBLElBQ3hCO0FBRUEsVUFBTSxPQUFPLGFBQWEsa0JBQWtCLFNBQVMsSUFBSSxrQkFBa0IsU0FBUyxJQUFJLGtCQUFrQixHQUFHO0FBQzdHLFFBQUksQ0FBQyxNQUFNO0FBQ1QsYUFBTyxFQUFFLFVBQVU7QUFBQSxNQUFDLEVBQUU7QUFBQSxJQUN4QjtBQUVBLFVBQU0sYUFBYSxHQUFHQSxlQUFjLEdBQUcsS0FBSyxFQUFFO0FBQzlDLFFBQUksWUFBWUMsY0FBYSxVQUFVO0FBQ3ZDLFVBQU0sa0JBQWtCLFVBQVUsZUFBZSxLQUFLLFFBQVE7QUFDOUQsUUFBSSxpQkFBaUI7QUFDbkIsa0JBQVksRUFBRSxhQUFhLEdBQUcsV0FBVyxFQUFFO0FBQzNDLFVBQUk7QUFDRixRQUFBQyxjQUFhLFlBQVksS0FBSyxVQUFVLFNBQVMsQ0FBQztBQUFBLE1BQ3BELFNBQVE7QUFBQSxNQUVSO0FBQUEsSUFDRjtBQUVBLFFBQUksVUFBd0I7QUFBQSxNQUMxQixRQUFRO0FBQUEsTUFDUixXQUFXLEtBQUs7QUFBQSxNQUNoQixhQUFhLGlCQUFpQixVQUFVLGFBQWEsS0FBSyxRQUFRLE1BQU07QUFBQSxNQUN4RSxXQUFXLFVBQVUsVUFBVSxXQUFXLEtBQUssV0FBVztBQUFBLE1BQzFELGNBQWMsS0FBSztBQUFBLE1BQ25CLFNBQVMsQ0FBQztBQUFBLElBQ1o7QUFFQSxRQUFJLGVBQWU7QUFDbkIsUUFBSSxvQkFBb0Isa0JBQWtCLEtBQUssVUFBVSxTQUFTLElBQUk7QUFDdEUsUUFBSSxnQkFBK0I7QUFFbkMsVUFBTSxVQUFVO0FBQ2hCLFFBQUksS0FBSyxlQUFlO0FBR3hCLGdCQUFZLE1BQU0sU0FBUztBQUUzQixhQUFTLFlBQVksTUFBbUM7QUFDdEQsWUFBTSxTQUFTLGtCQUFrQiw2QkFBTSxHQUFHLEtBQUssaUJBQWlCLENBQUM7QUFDakUsWUFBTSxTQUFTLGtCQUFrQiw2QkFBTSxHQUFHLEtBQUssaUJBQWlCLENBQUM7QUFDakUsWUFBTSxNQUFNLEdBQUcsT0FBTyxRQUFRLENBQUMsQ0FBQyxJQUFJLE9BQU8sUUFBUSxDQUFDLENBQUM7QUFDckQsVUFBSSxRQUFRLGdCQUFnQixRQUFRLFFBQVEsV0FBVyxLQUFLLFFBQVEsUUFBUTtBQUMxRTtBQUFBLE1BQ0Y7QUFDQSxxQkFBZTtBQUNmLGNBQVEsVUFBVSxLQUFLLFFBQVEsSUFBSSxDQUFDLFNBQTJCO0FBQUEsUUFDN0QsSUFBSSxJQUFJLEtBQUs7QUFBQSxRQUNiLElBQUksSUFBSSxLQUFLO0FBQUEsUUFDYixRQUFRLElBQUk7QUFBQSxNQUNkLEVBQUU7QUFBQSxJQUNKO0FBRUEsYUFBUyxRQUFRLFFBQVEsT0FBYTtBQUNwQyxVQUFJLENBQUMsUUFBUSxVQUFVLFFBQVEsZUFBZSxRQUFRLFFBQVEsUUFBUTtBQUVwRSxjQUFNQyxXQUFVLEtBQUssVUFBVSxFQUFFLGFBQWEsUUFBUSxhQUFhLFdBQVcsRUFBRSxDQUFDO0FBQ2pGLFlBQUksQ0FBQyxTQUFTQSxhQUFZLGtCQUFtQjtBQUM3Qyw0QkFBb0JBO0FBQ3BCLFFBQUFELGNBQWEsWUFBWUMsUUFBTztBQUNoQztBQUFBLE1BQ0Y7QUFDQSxZQUFNLFVBQVUsS0FBSyxVQUFVO0FBQUEsUUFDN0IsYUFBYSxRQUFRO0FBQUEsUUFDckIsV0FBVyxVQUFVLFFBQVEsV0FBVyxRQUFRLFlBQVk7QUFBQSxNQUM5RCxDQUFDO0FBQ0QsVUFBSSxDQUFDLFNBQVMsWUFBWSxrQkFBbUI7QUFDN0MsMEJBQW9CO0FBQ3BCLE1BQUFELGNBQWEsWUFBWSxPQUFPO0FBQUEsSUFDbEM7QUFFQSxhQUFTLFVBQVUsUUFBMkM7QUFDNUQsVUFBSSxDQUFDLE9BQU8sU0FBUyxNQUFNLEdBQUc7QUFDNUIsZUFBTztBQUFBLE1BQ1Q7QUFDQSxVQUFJLGtCQUFrQixRQUFRLENBQUMsT0FBTyxTQUFTLGFBQWEsR0FBRztBQUM3RCx3QkFBZ0I7QUFDaEIsZUFBTztBQUFBLE1BQ1Q7QUFDQSxZQUFNLEtBQUssU0FBVTtBQUNyQixzQkFBZ0I7QUFDaEIsVUFBSSxDQUFDLE9BQU8sU0FBUyxFQUFFLEtBQUssTUFBTSxHQUFHO0FBQ25DLGVBQU87QUFBQSxNQUNUO0FBQ0EsYUFBTztBQUFBLElBQ1Q7QUFFQSxhQUFTLGVBQWUsSUFBWSxJQUFZLFFBQXlCO0FBQ3ZFLFlBQU0sS0FBSyxNQUFNO0FBQ2pCLFVBQUksQ0FBQyxHQUFJLFFBQU87QUFDaEIsWUFBTSxLQUFLLEdBQUcsSUFBSTtBQUNsQixZQUFNLEtBQUssR0FBRyxJQUFJO0FBQ2xCLFlBQU0sU0FBUyxLQUFLLEtBQUssS0FBSztBQUM5QixhQUFPLFVBQVUsU0FBUztBQUFBLElBQzVCO0FBRUEsYUFBUyxZQUFxQjtBQS9JaEM7QUFnSkksWUFBTSxRQUFPLFdBQU0sT0FBTixtQkFBVTtBQUN2QixVQUFJLENBQUMsS0FBTSxRQUFPO0FBQ2xCLFlBQU0sTUFBTSxhQUFhO0FBQ3pCLGFBQU8sT0FBTyxTQUFTLEtBQUssWUFBWSxLQUFLLE1BQU0sS0FBSztBQUFBLElBQzFEO0FBRUEsYUFBUyxvQkFBMEI7QUFDakMsWUFBTSxjQUFjLFFBQVE7QUFDNUIsVUFBSSxLQUFLLHlCQUF5QixFQUFFLE9BQU8sWUFBWSxDQUFDO0FBQ3hELGNBQVEsY0FBYyxLQUFLLElBQUksUUFBUSxjQUFjLEdBQUcsUUFBUSxRQUFRLE1BQU07QUFDOUUsY0FBUSxZQUFZO0FBQ3BCLGNBQVEsSUFBSTtBQUNaLFVBQUksUUFBUSxlQUFlLFFBQVEsUUFBUSxRQUFRO0FBQ2pELGdCQUFRLFNBQVM7QUFDakIsZ0JBQVEsSUFBSTtBQUNaLFlBQUksS0FBSyxtQkFBbUI7QUFBQSxNQUM5QjtBQUFBLElBQ0Y7QUFFQSxhQUFTLG9CQUEwQjtBQUNqQyxVQUFJLFFBQVEsWUFBWSxHQUFHO0FBQ3pCLGdCQUFRLFlBQVk7QUFDcEIsZ0JBQVE7QUFBQSxNQUNWO0FBQUEsSUFDRjtBQUVBLFVBQU0sY0FBYyxJQUFJLEdBQUcsaUJBQWlCLE1BQU07QUFDaEQsVUFBSSxDQUFDLE1BQU0sV0FBVyxDQUFDLE1BQU0sUUFBUSxRQUFRO0FBQzNDO0FBQUEsTUFDRjtBQUVBLGdCQUFVLE1BQU07QUFDaEIsa0JBQVksTUFBTSxTQUFTO0FBRTNCLFVBQUksUUFBUSxlQUFlLFFBQVEsUUFBUSxRQUFRO0FBQ2pELGdCQUFRLFNBQVM7QUFDakIsZ0JBQVEsSUFBSTtBQUNaLFlBQUksS0FBSyxtQkFBbUI7QUFDNUI7QUFBQSxNQUNGO0FBRUEsWUFBTSxTQUFTLFFBQVEsUUFBUSxRQUFRLFdBQVc7QUFDbEQsVUFBSSxDQUFDLFFBQVE7QUFDWCxnQkFBUSxTQUFTO0FBQ2pCLGdCQUFRLElBQUk7QUFDWixZQUFJLEtBQUssbUJBQW1CO0FBQzVCO0FBQUEsTUFDRjtBQUVBLFlBQU0sS0FBSyxVQUFVLE1BQU0sR0FBRztBQUM5QixVQUFJLENBQUMsTUFBTSxJQUFJO0FBQ2Isd0JBQWdCLE1BQU07QUFDdEIsMEJBQWtCO0FBQ2xCO0FBQUEsTUFDRjtBQUVBLFVBQUksZUFBZSxPQUFPLElBQUksT0FBTyxJQUFJLE9BQU8sTUFBTSxLQUFLLENBQUMsVUFBVSxHQUFHO0FBQ3ZFLGNBQU0sV0FBVyxLQUFLLElBQUksUUFBUSxjQUFjLFFBQVEsWUFBWSxFQUFFO0FBQ3RFLFlBQUksS0FBSyxJQUFJLFdBQVcsUUFBUSxTQUFTLElBQUksY0FBYztBQUN6RCxrQkFBUSxZQUFZO0FBQ3BCLGtCQUFRO0FBQUEsUUFDVjtBQUNBLFlBQUksUUFBUSxZQUFZLGdCQUFnQixRQUFRLGNBQWM7QUFDNUQsNEJBQWtCO0FBQUEsUUFDcEI7QUFBQSxNQUNGLE9BQU87QUFDTCwwQkFBa0I7QUFBQSxNQUNwQjtBQUFBLElBQ0YsQ0FBQztBQUVELFdBQU87QUFBQSxNQUNMLFVBQVU7QUFDUixvQkFBWTtBQUFBLE1BQ2Q7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVBLFdBQVMsa0JBQWtCLE9BQTJCLFVBQTBCO0FBQzlFLFFBQUksT0FBTyxVQUFVLFlBQVksT0FBTyxTQUFTLEtBQUssS0FBSyxRQUFRLEdBQUc7QUFDcEUsYUFBTztBQUFBLElBQ1Q7QUFDQSxXQUFPO0FBQUEsRUFDVDtBQUVBLFdBQVMsaUJBQWlCLE9BQWUsT0FBdUI7QUFDOUQsUUFBSSxDQUFDLE9BQU8sU0FBUyxLQUFLLEdBQUc7QUFDM0IsYUFBTztBQUFBLElBQ1Q7QUFDQSxRQUFJLFFBQVEsRUFBRyxRQUFPO0FBQ3RCLFFBQUksUUFBUSxNQUFPLFFBQU87QUFDMUIsV0FBTyxLQUFLLE1BQU0sS0FBSztBQUFBLEVBQ3pCO0FBRUEsV0FBUyxVQUFVLE1BQWMsY0FBOEI7QUFDN0QsUUFBSSxDQUFDLE9BQU8sU0FBUyxJQUFJLEtBQUssT0FBTyxFQUFHLFFBQU87QUFDL0MsUUFBSSxPQUFPLGFBQWMsUUFBTztBQUNoQyxXQUFPO0FBQUEsRUFDVDtBQUVBLFdBQVNELGNBQWEsWUFBdUM7QUFuUDdEO0FBb1BFLFFBQUk7QUFDRixZQUFNLE1BQU0sT0FBTyxhQUFhLFFBQVEsVUFBVTtBQUNsRCxVQUFJLENBQUMsS0FBSztBQUNSLGVBQU8sRUFBRSxhQUFhLEdBQUcsV0FBVyxFQUFFO0FBQUEsTUFDeEM7QUFDQSxZQUFNLFNBQVMsS0FBSyxNQUFNLEdBQUc7QUFDN0IsVUFBSSxDQUFDLFFBQVE7QUFDWCxlQUFPLEVBQUUsYUFBYSxHQUFHLFdBQVcsRUFBRTtBQUFBLE1BQ3hDO0FBQ0EsYUFBTztBQUFBLFFBQ0wsYUFBYSxrQkFBaUIsWUFBTyxnQkFBUCxZQUFzQixHQUFHLE9BQU8sZ0JBQWdCO0FBQUEsUUFDOUUsV0FBVyxPQUFPLE9BQU8sY0FBYyxXQUFXLEtBQUssSUFBSSxHQUFHLE9BQU8sU0FBUyxJQUFJO0FBQUEsTUFDcEY7QUFBQSxJQUNGLFNBQVE7QUFDTixhQUFPLEVBQUUsYUFBYSxHQUFHLFdBQVcsRUFBRTtBQUFBLElBQ3hDO0FBQUEsRUFDRjtBQUVBLFdBQVNDLGNBQWEsWUFBb0IsU0FBdUI7QUFDL0QsUUFBSTtBQUNGLGFBQU8sYUFBYSxRQUFRLFlBQVksT0FBTztBQUFBLElBQ2pELFNBQVE7QUFBQSxJQUVSO0FBQUEsRUFDRjs7O0FDOVBBLE1BQU0sd0JBQXdCO0FBRTlCLEdBQUMsZUFBZSxZQUFZO0FBQzFCLFVBQU0sS0FBSyxJQUFJLGdCQUFnQixPQUFPLFNBQVMsTUFBTTtBQUNyRCxVQUFNLE9BQU8sR0FBRyxJQUFJLE1BQU0sS0FBSztBQUMvQixVQUFNLE9BQU8sR0FBRyxJQUFJLE1BQU0sS0FBSztBQUMvQixVQUFNLFlBQVksR0FBRyxJQUFJLFNBQVMsTUFBTSxTQUFTLGFBQWEsTUFBTTtBQUNwRSxVQUFNLFlBQVksaUJBQWlCLEdBQUcsSUFBSSxNQUFNLENBQUM7QUFDakQsVUFBTSxhQUFhLGlCQUFpQixtQkFBbUIsQ0FBQztBQUN4RCxVQUFNLFdBQVcsYUFBYTtBQUM5QixVQUFNLE9BQU8sV0FBVyxHQUFHLElBQUksTUFBTSxLQUFLLE1BQU07QUFDaEQsVUFBTSxPQUFPLFdBQVcsR0FBRyxJQUFJLE1BQU0sS0FBSyxNQUFNO0FBRWhELFFBQUksYUFBYSxjQUFjLFlBQVk7QUFDekMsc0JBQWdCLFNBQVM7QUFBQSxJQUMzQjtBQUdBLFVBQU0saUJBQWlCO0FBQUEsTUFDckIsT0FBTztBQUFBLE1BQ1AsbUJBQW1CO0FBQUE7QUFBQSxNQUNuQjtBQUFBO0FBQUEsSUFDRixDQUFDO0FBR0QsVUFBTSxRQUFRLG1CQUFtQjtBQUNqQyxVQUFNLFVBQVUscUJBQXFCO0FBQ3JDLFVBQU0sTUFBTSxlQUFlO0FBRzNCLFVBQU0sU0FBUyxZQUFZLElBQUk7QUFDL0IsVUFBTSxPQUFPLE9BQU87QUFDcEIsVUFBTSxRQUFRLElBQUksY0FBYyxNQUFNO0FBQ3RDLDZCQUF5QixLQUFZLFFBQVEsS0FBSztBQUdsRCxRQUFJLEtBQUsseUJBQXlCLEVBQUUsT0FBTyxXQUFXLE1BQU0sR0FBRyxDQUFDO0FBT2hFLFFBQUksR0FBRyxxQkFBcUIsQ0FBQyxFQUFFLE1BQU0sTUFBTTtBQUN6QyxVQUFJLFFBQVEsRUFBRyxLQUFJLEtBQUssYUFBYSxFQUFFLE1BQU0sVUFBVSxVQUFVLEtBQUssSUFBSSxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQUEsSUFDdkYsQ0FBQztBQUVELFVBQU0sT0FBTyxTQUFTLEVBQUUsT0FBTyxTQUFTLElBQUksQ0FBQztBQUM3QywyQkFBdUIsRUFBRSxPQUFPLEtBQUssTUFBTSxVQUFVLENBQUM7QUFHdEQsVUFBTSxpQkFBaUIsU0FBUyxjQUFjLFNBQVM7QUFDdkQsVUFBTSxjQUFjLFNBQVM7QUFFN0IsUUFBSSxTQUFTLFlBQVk7QUFDdkIsWUFBTSxrQkFBa0Isb0JBQUksSUFBWTtBQUN4QyxVQUFJLEdBQUcseUJBQXlCLENBQUMsRUFBRSxNQUFNLE1BQU07QUFDN0MsY0FBTSxZQUFZLFFBQVE7QUFDMUIsWUFBSSxZQUFZLEtBQUssWUFBWSxHQUFHO0FBQ2xDO0FBQUEsUUFDRjtBQUNBLFlBQUksZ0JBQWdCLElBQUksU0FBUyxHQUFHO0FBQ2xDO0FBQUEsUUFDRjtBQUNBLHdCQUFnQixJQUFJLFNBQVM7QUFDN0Isb0JBQVksRUFBRSxNQUFNLHNCQUFzQixZQUFZLFVBQVUsQ0FBQztBQUFBLE1BQ25FLENBQUM7QUFBQSxJQUNIO0FBRUEsUUFBSSxXQUFvRDtBQUN4RCxRQUFJLGtCQUFrQjtBQUV0QixRQUFJLGdCQUFnQjtBQUNsQixpQkFBVyxjQUFjLEdBQUc7QUFBQSxJQUM5QjtBQUVBLFVBQU0sZ0JBQWdCLE1BQVk7QUFDaEMsVUFBSSxDQUFDLFlBQVksZ0JBQWlCO0FBQ2xDLHdCQUFrQjtBQUNsQixvQkFBc0IsaUJBQWlCO0FBQ3ZDLGVBQVMsTUFBTSxFQUFFLFFBQVEsTUFBTSxDQUFDO0FBQUEsSUFDbEM7QUFFQSxRQUFJLGFBQWE7QUFHZixpQkFBVyxFQUFFLEtBQUssT0FBTyxRQUFRLEtBQUssQ0FBQztBQUFBLElBQ3pDLFdBQVcsU0FBUyxZQUFZO0FBRTlCLG9CQUFjO0FBQUEsSUFDaEI7QUFHQSxxQkFBaUI7QUFBQSxNQUNmO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLFdBQVcsZ0NBQWE7QUFBQSxNQUN4QixnQkFBZ0IsTUFBTSxLQUFLLGVBQWU7QUFBQSxNQUMxQyxRQUFRLE1BQU07QUFDWixjQUFNLGFBQWEsWUFBWSxpQkFBaUIsbUJBQW1CLENBQUM7QUFDcEUsWUFBSSxXQUFZLGFBQVksRUFBRSxNQUFNLFFBQVEsTUFBTSxXQUFXLENBQUM7QUFBQSxNQUNoRTtBQUFBLElBQ0YsQ0FBQztBQUdELGFBQVMsaUJBQWlCLG9CQUFvQixNQUFNO0FBQ2xELFVBQUksU0FBUyxvQkFBb0IsVUFBVTtBQUN6QyxhQUFLLE9BQU8sUUFBUTtBQUFBLE1BQ3RCLE9BQU87QUFDTCxhQUFLLE9BQU8sT0FBTztBQUFBLE1BQ3JCO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSCxHQUFHO0FBRUgsV0FBUyxpQkFBaUIsT0FBOEI7QUFDdEQsUUFBSSxDQUFDLE1BQU8sUUFBTztBQUNuQixVQUFNLFVBQVUsTUFBTSxLQUFLO0FBQzNCLFFBQUksQ0FBQyxRQUFTLFFBQU87QUFDckIsV0FBTyxRQUFRLE1BQU0sR0FBRyxFQUFFO0FBQUEsRUFDNUI7QUFFQSxXQUFTLGdCQUFnQixNQUFvQjtBQUMzQyxRQUFJO0FBQ0YsVUFBSSxLQUFNLFFBQU8sYUFBYSxRQUFRLHVCQUF1QixJQUFJO0FBQUEsVUFDNUQsUUFBTyxhQUFhLFdBQVcscUJBQXFCO0FBQUEsSUFDM0QsU0FBUTtBQUFBLElBQUM7QUFBQSxFQUNYO0FBRUEsV0FBUyxxQkFBNkI7QUFsSnRDO0FBbUpFLFFBQUk7QUFBRSxjQUFPLFlBQU8sYUFBYSxRQUFRLHFCQUFxQixNQUFqRCxZQUFzRDtBQUFBLElBQUksU0FDakU7QUFBRSxhQUFPO0FBQUEsSUFBSTtBQUFBLEVBQ3JCOyIsCiAgIm5hbWVzIjogWyJzZW5kTWVzc2FnZSIsICJfYSIsICJfYiIsICJzZW5kTWVzc2FnZSIsICJnZXRBcHByb3hTZXJ2ZXJOb3ciLCAic2VsZWN0aW9uIiwgInNlbmRNZXNzYWdlIiwgImdldEFwcHJveFNlcnZlck5vdyIsICJfYSIsICJTVFlMRV9JRCIsICJlbnN1cmVTdHlsZXMiLCAiY2hvaWNlIiwgIl9hIiwgInJlc3VtZUF1ZGlvIiwgIlNUT1JBR0VfUFJFRklYIiwgImxvYWRQcm9ncmVzcyIsICJzYXZlUHJvZ3Jlc3MiLCAicGF5bG9hZCJdCn0K
