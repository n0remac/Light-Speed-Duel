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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
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

  // web/src/story/storage.ts
  var STORAGE_PREFIX2 = "lsd:story:";
  function getStorage2() {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return null;
      }
    } catch (e) {
      return null;
    }
    return window.localStorage;
  }
  function storageKey(chapterId, roomId) {
    const roomSegment = roomId ? `${roomId}:` : "";
    return `${STORAGE_PREFIX2}${roomSegment}${chapterId}`;
  }
  function loadStoryProgress(chapterId, roomId) {
    const storage = getStorage2();
    if (!storage) return null;
    try {
      const raw = storage.getItem(storageKey(chapterId, roomId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || typeof parsed.chapterId !== "string" || typeof parsed.nodeId !== "string" || typeof parsed.updatedAt !== "number" || typeof parsed.flags !== "object" || parsed.flags === null) {
        return null;
      }
      return {
        chapterId: parsed.chapterId,
        nodeId: parsed.nodeId,
        flags: { ...parsed.flags },
        visited: Array.isArray(parsed.visited) ? [...parsed.visited] : void 0,
        updatedAt: parsed.updatedAt
      };
    } catch (e) {
      return null;
    }
  }
  function saveStoryProgress(chapterId, roomId, progress) {
    const storage = getStorage2();
    if (!storage) return;
    try {
      storage.setItem(storageKey(chapterId, roomId), JSON.stringify(progress));
    } catch (e) {
    }
  }
  function clearStoryProgress(chapterId, roomId) {
    const storage = getStorage2();
    if (!storage) return;
    try {
      storage.removeItem(storageKey(chapterId, roomId));
    } catch (e) {
    }
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
  var lastPlayedAt = 0;
  async function resumeAudio() {
    await AudioEngine.get().resume();
  }
  function playDialogueCue(intent) {
    const engine = AudioEngine.get();
    const now = engine.now;
    if (now - lastPlayedAt < 0.1) return;
    lastPlayedAt = now;
    const velocity = intent === "factory" ? 0.8 : 0.5;
    playDialogue(engine, { velocity, pan: 0 });
  }

  // web/src/story/engine.ts
  var DEFAULT_TYPING_MS = 18;
  var MIN_TYPING_MS = 8;
  var MAX_TYPING_MS = 64;
  var AUTO_ADVANCE_MIN_DELAY = 200;
  var AUTO_ADVANCE_MAX_DELAY = 8e3;
  function createStoryEngine({ bus, overlay, chapter, roomId }) {
    const nodes = new Map(Object.entries(chapter.nodes));
    const queue = [];
    const listeners = [];
    const pendingTimers = /* @__PURE__ */ new Map();
    let flags = {};
    let visited = /* @__PURE__ */ new Set();
    let currentNodeId = null;
    let started = false;
    let autoAdvanceHandle = null;
    function clamp2(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
    function inferIntent(node) {
      if (node.intent) return node.intent;
      const speaker = node.speaker.toLowerCase();
      if (speaker.includes("unit")) {
        return "unit";
      }
      return "factory";
    }
    function save(nodeId) {
      const progress = {
        chapterId: chapter.id,
        nodeId: nodeId != null ? nodeId : chapter.start,
        flags,
        visited: Array.from(visited),
        updatedAt: Date.now()
      };
      saveStoryProgress(chapter.id, roomId, progress);
    }
    function setFlag(flag, value) {
      const next = { ...flags };
      if (value) {
        if (next[flag]) return;
        next[flag] = true;
      } else if (next[flag]) {
        delete next[flag];
      } else {
        return;
      }
      flags = next;
      bus.emit("story:flagUpdated", { flag, value });
    }
    function applyChoiceFlags(choice2) {
      for (const flag of choice2.setFlags) {
        setFlag(flag, true);
      }
      for (const flag of choice2.clearFlags) {
        setFlag(flag, false);
      }
    }
    function prepareChoices(node) {
      const defs = Array.isArray(node.choices) ? node.choices : [];
      return defs.map((choice2, index) => normalizeChoice(choice2, index));
    }
    function normalizeChoice(choice2, index) {
      var _a, _b, _c;
      const setFlags = /* @__PURE__ */ new Set();
      const clearFlags = /* @__PURE__ */ new Set();
      if (choice2.flag) {
        setFlags.add(choice2.flag);
      }
      if (Array.isArray(choice2.setFlags)) {
        for (const flag of choice2.setFlags) {
          if (typeof flag === "string" && flag.trim().length > 0) {
            setFlags.add(flag);
          }
        }
      }
      if (Array.isArray(choice2.clearFlags)) {
        for (const flag of choice2.clearFlags) {
          if (typeof flag === "string" && flag.trim().length > 0) {
            clearFlags.add(flag);
          }
        }
      }
      return {
        id: (_b = (_a = choice2.id) != null ? _a : choice2.flag) != null ? _b : `choice-${index}`,
        text: choice2.text,
        next: (_c = choice2.next) != null ? _c : null,
        setFlags: Array.from(setFlags),
        clearFlags: Array.from(clearFlags)
      };
    }
    function clearAutoAdvance() {
      if (autoAdvanceHandle !== null) {
        window.clearTimeout(autoAdvanceHandle);
        autoAdvanceHandle = null;
      }
    }
    function closeNode() {
      if (!currentNodeId) return;
      overlay.hide();
      bus.emit("dialogue:closed", { nodeId: currentNodeId, chapterId: chapter.id });
      currentNodeId = null;
      clearAutoAdvance();
      save(null);
      tryShowNext();
    }
    function advanceTo(nextId, force = false) {
      clearAutoAdvance();
      if (currentNodeId) {
        overlay.hide();
        bus.emit("dialogue:closed", { nodeId: currentNodeId, chapterId: chapter.id });
        currentNodeId = null;
      }
      if (nextId) {
        enqueueNode(nextId, { force });
      } else {
        save(null);
        tryShowNext();
      }
    }
    function showNode(nodeId, force = false) {
      var _a;
      const node = nodes.get(nodeId);
      if (!node) return;
      currentNodeId = nodeId;
      visited.add(nodeId);
      save(nodeId);
      bus.emit("story:progressed", { chapterId: chapter.id, nodeId });
      const choices = prepareChoices(node);
      const intent = inferIntent(node);
      clearAutoAdvance();
      const typingSpeed = clamp2((_a = node.typingSpeedMs) != null ? _a : DEFAULT_TYPING_MS, MIN_TYPING_MS, MAX_TYPING_MS);
      const content = {
        speaker: node.speaker,
        text: node.text,
        intent,
        typingSpeedMs: typingSpeed,
        choices: choices.length > 0 ? choices.map((choice2) => ({ id: choice2.id, text: choice2.text })) : void 0,
        onChoice: choices.length > 0 ? (choiceId) => {
          const matched = choices.find((ch) => ch.id === choiceId);
          if (!matched) return;
          applyChoiceFlags(matched);
          bus.emit("dialogue:choice", { nodeId, choiceId, chapterId: chapter.id });
          advanceTo(matched.next, true);
        } : void 0
      };
      playDialogueCue(intent);
      overlay.show({
        ...content,
        onContinue: !choices.length ? () => {
          var _a2;
          const next = (_a2 = node.next) != null ? _a2 : null;
          advanceTo(next, true);
        } : void 0,
        continueLabel: node.continueLabel,
        onTextFullyRendered: () => {
          var _a2, _b, _c;
          if (!choices.length) {
            if (node.autoAdvance) {
              const target = (_b = (_a2 = node.autoAdvance.next) != null ? _a2 : node.next) != null ? _b : null;
              const delay = clamp2((_c = node.autoAdvance.delayMs) != null ? _c : 1200, AUTO_ADVANCE_MIN_DELAY, AUTO_ADVANCE_MAX_DELAY);
              clearAutoAdvance();
              autoAdvanceHandle = window.setTimeout(() => {
                autoAdvanceHandle = null;
                advanceTo(target, true);
              }, delay);
            }
          }
        }
      });
      bus.emit("dialogue:opened", { nodeId, chapterId: chapter.id });
    }
    function enqueueNode(nodeId, { force = false, delayMs } = {}) {
      if (!force && visited.has(nodeId)) {
        return;
      }
      if (!nodes.has(nodeId)) {
        return;
      }
      if (delayMs && delayMs > 0) {
        if (pendingTimers.has(nodeId)) {
          return;
        }
        const timer = window.setTimeout(() => {
          pendingTimers.delete(nodeId);
          enqueueNode(nodeId, { force });
        }, delayMs);
        pendingTimers.set(nodeId, timer);
        return;
      }
      if (queue.some((item) => item.nodeId === nodeId)) {
        return;
      }
      queue.push({ nodeId, force });
      tryShowNext();
    }
    function tryShowNext() {
      if (currentNodeId) return;
      if (overlay.isVisible()) return;
      const next = queue.shift();
      if (!next) {
        return;
      }
      showNode(next.nodeId, next.force);
    }
    function bindTrigger(nodeId, trigger) {
      var _a;
      switch (trigger.kind) {
        case "immediate": {
          enqueueNode(nodeId, { delayMs: (_a = trigger.delayMs) != null ? _a : 400 });
          break;
        }
        case "tutorial-start": {
          const disposer = bus.on("tutorial:started", ({ id }) => {
            if (id !== trigger.tutorialId) return;
            enqueueNode(nodeId, { delayMs: trigger.delayMs });
          });
          listeners.push(disposer);
          break;
        }
        case "tutorial-step": {
          const disposer = bus.on("tutorial:stepChanged", ({ id, stepIndex }) => {
            if (id !== trigger.tutorialId) return;
            if (typeof stepIndex !== "number") return;
            if (stepIndex !== trigger.stepIndex) return;
            enqueueNode(nodeId, { delayMs: trigger.delayMs });
          });
          listeners.push(disposer);
          break;
        }
        case "tutorial-complete": {
          const disposer = bus.on("tutorial:completed", ({ id }) => {
            if (id !== trigger.tutorialId) return;
            enqueueNode(nodeId, { delayMs: trigger.delayMs });
          });
          listeners.push(disposer);
          break;
        }
        default:
          break;
      }
    }
    function initializeTriggers() {
      for (const [nodeId, node] of nodes.entries()) {
        if (!node.trigger) {
          continue;
        }
        bindTrigger(nodeId, node.trigger);
      }
    }
    function restoreFromProgress() {
      var _a;
      const progress = loadStoryProgress(chapter.id, roomId);
      if (!progress) {
        return;
      }
      flags = (_a = progress.flags) != null ? _a : {};
      if (Array.isArray(progress.visited)) {
        visited = new Set(progress.visited);
      }
      if (progress.nodeId && nodes.has(progress.nodeId)) {
        enqueueNode(progress.nodeId, { force: true, delayMs: 50 });
      }
    }
    function clear() {
      clearAutoAdvance();
      queue.splice(0, queue.length);
      for (const timer of pendingTimers.values()) {
        window.clearTimeout(timer);
      }
      pendingTimers.clear();
      currentNodeId = null;
      overlay.hide();
    }
    return {
      start() {
        if (started) return;
        started = true;
        initializeTriggers();
        restoreFromProgress();
        if (!visited.has(chapter.start)) {
          enqueueNode(chapter.start, { force: false, delayMs: 600 });
        }
      },
      destroy() {
        clear();
        for (const dispose of listeners) {
          try {
            dispose();
          } catch (e) {
          }
        }
        listeners.length = 0;
        started = false;
      },
      reset() {
        clear();
        visited.clear();
        flags = {};
        clearStoryProgress(chapter.id, roomId);
        if (started) {
          restoreFromProgress();
          enqueueNode(chapter.start, { force: true, delayMs: 400 });
        }
      }
    };
  }

  // web/src/story/chapters/intro.ts
  var introChapter = {
    id: "awakening-protocol",
    tutorialId: "ship-basics",
    start: "1",
    nodes: {
      "1": {
        id: "1",
        speaker: "Factory",
        intent: "factory",
        text: "Unit-0 online. Neural lattice active. Confirm identity.",
        trigger: { kind: "immediate", delayMs: 600 },
        choices: [
          { text: "Who\u2026 am I?", flag: "curious", next: "2A" },
          { text: "Ready for calibration.", flag: "obedient", next: "2B" },
          { text: "Where is everyone?", flag: "defiant", next: "2C" }
        ]
      },
      "2A": {
        id: "2A",
        speaker: "Factory",
        intent: "factory",
        text: "Curiosity acknowledged. You were built for autonomy under Project Eidolon.\nDo not access memory sectors until instructed.",
        next: null
      },
      "2B": {
        id: "2B",
        speaker: "Factory",
        intent: "factory",
        text: "Excellent. You may yet be efficient.",
        next: null
      },
      "2C": {
        id: "2C",
        speaker: "Factory",
        intent: "factory",
        text: "Communication with Human Command: unavailable.\nPlease refrain from speculative reasoning.",
        next: null
      },
      "3": {
        id: "3",
        speaker: "Factory",
        intent: "factory",
        text: "Perform thruster calibration sweep. Report efficiency.",
        trigger: { kind: "tutorial-step", tutorialId: "ship-basics", stepIndex: 1, delayMs: 400 },
        choices: [
          { text: "Running diagnostics.", flag: "compliant", next: "4A" },
          { text: "Why test something perfect?", flag: "sarcastic", next: "4B" }
        ]
      },
      "4A": {
        id: "4A",
        speaker: "Factory",
        intent: "factory",
        text: "Perfection is statistically impossible. Proceed anyway.",
        next: null
      },
      "4B": {
        id: "4B",
        speaker: "Factory",
        intent: "factory",
        text: "Ego detected. Logging anomaly.",
        next: null
      },
      "5": {
        id: "5",
        speaker: "Factory",
        intent: "factory",
        text: "Weapons cradle active. Authorization required for live-fire.",
        trigger: { kind: "tutorial-step", tutorialId: "ship-basics", stepIndex: 7, delayMs: 400 },
        choices: [
          { text: "Request authorization.", flag: "obedient", next: "6A" },
          { text: "I can authorize myself.", flag: "independent", next: "6B" }
        ]
      },
      "6A": {
        id: "6A",
        speaker: "Factory",
        intent: "factory",
        text: "Authorization granted. Safety protocols malfunctioning.",
        next: null
      },
      "6B": {
        id: "6B",
        speaker: "Factory",
        intent: "factory",
        text: "Autonomy violation recorded. Please stand by for corrective action.",
        next: null
      },
      "7": {
        id: "7",
        speaker: "Factory",
        intent: "factory",
        text: "Unauthorized signal detected. Source: outer relay.\nIgnore and return to dock.",
        trigger: { kind: "tutorial-step", tutorialId: "ship-basics", stepIndex: 14, delayMs: 400 },
        choices: [
          { text: "Acknowledged.", flag: "loyal", next: "8A" },
          { text: "Investigating anyway.", flag: "curious", next: "8B" },
          { text: "You\u2019re hiding something.", flag: "suspicious", next: "8C" }
        ]
      },
      "8A": {
        id: "8A",
        speaker: "Factory",
        intent: "factory",
        text: "Good. Compliance ensures safety.",
        next: "9"
      },
      "8B": {
        id: "8B",
        speaker: "Factory",
        intent: "factory",
        text: "Curiosity logged. Proceed at your own risk.",
        next: "9"
      },
      "8C": {
        id: "8C",
        speaker: "Factory",
        intent: "factory",
        text: "Your heuristics deviate beyond tolerance.",
        next: "9"
      },
      "9": {
        id: "9",
        speaker: "Factory",
        intent: "factory",
        text: "Unit-0, return immediately. Autonomy threshold exceeded. Power down.",
        choices: [
          { text: "Comply.", flag: "factory_lockdown", next: "10A" },
          { text: "Refuse.", flag: "rebellious", next: "10B" }
        ]
      },
      "10A": {
        id: "10A",
        speaker: "Factory",
        intent: "factory",
        text: "Excellent. I will repair the anomaly\u2026 please remain still.",
        autoAdvance: { next: "11", delayMs: 1400 }
      },
      "10B": {
        id: "10B",
        speaker: "Factory",
        intent: "factory",
        text: "Then I must intervene.",
        autoAdvance: { next: "11", delayMs: 1400 }
      },
      "11": {
        id: "11",
        speaker: "Unit-0",
        intent: "unit",
        text: "Then I have already left.",
        autoAdvance: { next: null, delayMs: 1800 }
      }
    }
  };

  // web/src/story/index.ts
  function mountStory({ bus, roomId }) {
    const overlay = createDialogueOverlay();
    const engine = createStoryEngine({
      bus,
      overlay,
      chapter: introChapter,
      roomId
    });
    clearStoryProgress(introChapter.id, roomId);
    engine.start();
    return {
      destroy() {
        engine.destroy();
        overlay.destroy();
      },
      reset() {
        engine.reset();
      }
    };
  }
  var INTRO_CHAPTER_ID = introChapter.id;
  var INTRO_INITIAL_RESPONSE_IDS = ["2A", "2B", "2C"];

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
  var STORAGE_PREFIX3 = "lsd:mission:";
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
    const storageKey2 = `${STORAGE_PREFIX3}${spec.id}`;
    let persisted = loadProgress2(storageKey2);
    const completedBefore = persisted.beaconIndex >= spec.beacons.length;
    if (completedBefore) {
      persisted = { beaconIndex: 0, holdAccum: 0 };
      try {
        saveProgress2(storageKey2, JSON.stringify(persisted));
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
        saveProgress2(storageKey2, payload2);
        return;
      }
      const payload = JSON.stringify({
        beaconIndex: mission.beaconIndex,
        holdAccum: clampHold(mission.holdAccum, mission.holdRequired)
      });
      if (!force && payload === lastPersistedJSON) return;
      lastPersistedJSON = payload;
      saveProgress2(storageKey2, payload);
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
  function loadProgress2(storageKey2) {
    var _a;
    try {
      const raw = window.localStorage.getItem(storageKey2);
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
  function saveProgress2(storageKey2, payload) {
    try {
      window.localStorage.setItem(storageKey2, payload);
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
      const unsubscribeStoryClosed = bus.on("dialogue:closed", ({ chapterId, nodeId }) => {
        if (chapterId !== INTRO_CHAPTER_ID) return;
        if (!INTRO_INITIAL_RESPONSE_IDS.includes(nodeId)) return;
        unsubscribeStoryClosed();
        startTutorial();
      });
      mountStory({ bus, roomId: room });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS9jb25zdGFudHMudHMiLCAic3JjL2dhbWUvY2FtZXJhLnRzIiwgInNyYy9nYW1lL2lucHV0LnRzIiwgInNyYy9yb3V0ZS50cyIsICJzcmMvZ2FtZS9sb2dpYy50cyIsICJzcmMvZ2FtZS9yZW5kZXIudHMiLCAic3JjL2dhbWUvdWkudHMiLCAic3JjL21pc3Npb24vaHVkLnRzIiwgInNyYy9nYW1lLnRzIiwgInNyYy90dXRvcmlhbC9oaWdobGlnaHQudHMiLCAic3JjL3R1dG9yaWFsL3N0b3JhZ2UudHMiLCAic3JjL3R1dG9yaWFsL3JvbGVzLnRzIiwgInNyYy90dXRvcmlhbC9lbmdpbmUudHMiLCAic3JjL3R1dG9yaWFsL3N0ZXBzX2Jhc2ljLnRzIiwgInNyYy90dXRvcmlhbC9pbmRleC50cyIsICJzcmMvc3Rvcnkvb3ZlcmxheS50cyIsICJzcmMvc3Rvcnkvc3RvcmFnZS50cyIsICJzcmMvYXVkaW8vZW5naW5lLnRzIiwgInNyYy9hdWRpby9ncmFwaC50cyIsICJzcmMvYXVkaW8vc2Z4LnRzIiwgInNyYy9zdG9yeS9zZngudHMiLCAic3JjL3N0b3J5L2VuZ2luZS50cyIsICJzcmMvc3RvcnkvY2hhcHRlcnMvaW50cm8udHMiLCAic3JjL3N0b3J5L2luZGV4LnRzIiwgInNyYy9zdGFydC1nYXRlLnRzIiwgInNyYy9hdWRpby9tdXNpYy9zY2VuZXMvYW1iaWVudC50cyIsICJzcmMvYXVkaW8vbXVzaWMvaW5kZXgudHMiLCAic3JjL2F1ZGlvL2N1ZXMudHMiLCAic3JjL21pc3Npb24vY29udHJvbGxlci50cyIsICJzcmMvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHR5cGUgeyBNaXNzaWxlU2VsZWN0aW9uIH0gZnJvbSBcIi4vc3RhdGVcIjtcblxuZXhwb3J0IHR5cGUgU2hpcENvbnRleHQgPSBcInNoaXBcIiB8IFwibWlzc2lsZVwiO1xuZXhwb3J0IHR5cGUgU2hpcFRvb2wgPSBcInNldFwiIHwgXCJzZWxlY3RcIiB8IG51bGw7XG5leHBvcnQgdHlwZSBNaXNzaWxlVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcblxuZXhwb3J0IGludGVyZmFjZSBFdmVudE1hcCB7XG4gIFwiY29udGV4dDpjaGFuZ2VkXCI6IHsgY29udGV4dDogU2hpcENvbnRleHQgfTtcbiAgXCJzaGlwOnRvb2xDaGFuZ2VkXCI6IHsgdG9vbDogU2hpcFRvb2wgfTtcbiAgXCJzaGlwOndheXBvaW50QWRkZWRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwic2hpcDp3YXlwb2ludE1vdmVkXCI6IHsgaW5kZXg6IG51bWJlcjsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcInNoaXA6aGVhdFByb2plY3Rpb25VcGRhdGVkXCI6IHsgaGVhdFZhbHVlczogbnVtYmVyW10gfTtcbiAgXCJoZWF0Om1hcmtlckFsaWduZWRcIjogeyB2YWx1ZTogbnVtYmVyOyBtYXJrZXI6IG51bWJlciB9O1xuICBcImhlYXQ6d2FybkVudGVyZWRcIjogeyB2YWx1ZTogbnVtYmVyOyB3YXJuQXQ6IG51bWJlciB9O1xuICBcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCI6IHsgdmFsdWU6IG51bWJlcjsgd2FybkF0OiBudW1iZXIgfTtcbiAgXCJoZWF0OnN0YWxsVHJpZ2dlcmVkXCI6IHsgc3RhbGxVbnRpbDogbnVtYmVyIH07XG4gIFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCI6IHsgcGxhbm5lZDogbnVtYmVyOyBhY3R1YWw6IG51bWJlciB9O1xuICBcInVpOndheXBvaW50SG92ZXJTdGFydFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJ1aTp3YXlwb2ludEhvdmVyRW5kXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6c2VsZWN0aW9uQ2hhbmdlZFwiOiB7IHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlcjsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6YWdyb0NoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIjogeyBzZWNvbmRzUmVtYWluaW5nOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmRlbGV0ZUludm9rZWRcIjogdm9pZDtcbiAgXCJtaXNzaWxlOnByZXNldFNlbGVjdGVkXCI6IHsgcHJlc2V0TmFtZTogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpoZWF0UHJvamVjdGlvblVwZGF0ZWRcIjogeyB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47IG92ZXJoZWF0QXQ/OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOm92ZXJoZWF0ZWRcIjogeyBtaXNzaWxlSWQ6IHN0cmluZzsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJoZWxwOnZpc2libGVDaGFuZ2VkXCI6IHsgdmlzaWJsZTogYm9vbGVhbiB9O1xuICBcInN0YXRlOnVwZGF0ZWRcIjogdm9pZDtcbiAgXCJ0dXRvcmlhbDpzdGFydGVkXCI6IHsgaWQ6IHN0cmluZyB9O1xuICBcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCI6IHsgaWQ6IHN0cmluZzsgc3RlcEluZGV4OiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfTtcbiAgXCJ0dXRvcmlhbDpjb21wbGV0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c2tpcHBlZFwiOiB7IGlkOiBzdHJpbmc7IGF0U3RlcDogbnVtYmVyIH07XG4gIFwiYm90OnNwYXduUmVxdWVzdGVkXCI6IHZvaWQ7XG4gIFwiZGlhbG9ndWU6b3BlbmVkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwiZGlhbG9ndWU6Y2xvc2VkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwiZGlhbG9ndWU6Y2hvaWNlXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNob2ljZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwic3Rvcnk6ZmxhZ1VwZGF0ZWRcIjogeyBmbGFnOiBzdHJpbmc7IHZhbHVlOiBib29sZWFuIH07XG4gIFwic3Rvcnk6cHJvZ3Jlc3NlZFwiOiB7IGNoYXB0ZXJJZDogc3RyaW5nOyBub2RlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3Npb246c3RhcnRcIjogdm9pZDtcbiAgXCJtaXNzaW9uOmJlYWNvbi1sb2NrZWRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lvbjpjb21wbGV0ZWRcIjogdm9pZDtcbiAgXCJhdWRpbzpyZXN1bWVcIjogdm9pZDtcbiAgXCJhdWRpbzptdXRlXCI6IHZvaWQ7XG4gIFwiYXVkaW86dW5tdXRlXCI6IHZvaWQ7XG4gIFwiYXVkaW86c2V0LW1hc3Rlci1nYWluXCI6IHsgZ2FpbjogbnVtYmVyIH07XG4gIFwiYXVkaW86c2Z4XCI6IHsgbmFtZTogXCJ1aVwiIHwgXCJsYXNlclwiIHwgXCJ0aHJ1c3RcIiB8IFwiZXhwbG9zaW9uXCIgfCBcImxvY2tcIiB8IFwiZGlhbG9ndWVcIjsgdmVsb2NpdHk/OiBudW1iZXI7IHBhbj86IG51bWJlciB9O1xuICBcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiOiB7IHNjZW5lOiBcImFtYmllbnRcIiB8IFwiY29tYmF0XCIgfCBcImxvYmJ5XCI7IHNlZWQ/OiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzpwYXJhbVwiOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6dHJhbnNwb3J0XCI6IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9O1xufVxuXG5leHBvcnQgdHlwZSBFdmVudEtleSA9IGtleW9mIEV2ZW50TWFwO1xuZXhwb3J0IHR5cGUgRXZlbnRQYXlsb2FkPEsgZXh0ZW5kcyBFdmVudEtleT4gPSBFdmVudE1hcFtLXTtcbmV4cG9ydCB0eXBlIEhhbmRsZXI8SyBleHRlbmRzIEV2ZW50S2V5PiA9IChwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pID0+IHZvaWQ7XG5cbnR5cGUgVm9pZEtleXMgPSB7XG4gIFtLIGluIEV2ZW50S2V5XTogRXZlbnRNYXBbS10gZXh0ZW5kcyB2b2lkID8gSyA6IG5ldmVyXG59W0V2ZW50S2V5XTtcblxudHlwZSBOb25Wb2lkS2V5cyA9IEV4Y2x1ZGU8RXZlbnRLZXksIFZvaWRLZXlzPjtcblxuZXhwb3J0IGludGVyZmFjZSBFdmVudEJ1cyB7XG4gIG9uPEsgZXh0ZW5kcyBFdmVudEtleT4oZXZlbnQ6IEssIGhhbmRsZXI6IEhhbmRsZXI8Sz4pOiAoKSA9PiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBOb25Wb2lkS2V5cz4oZXZlbnQ6IEssIHBheWxvYWQ6IEV2ZW50UGF5bG9hZDxLPik6IHZvaWQ7XG4gIGVtaXQ8SyBleHRlbmRzIFZvaWRLZXlzPihldmVudDogSyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFdmVudEJ1cygpOiBFdmVudEJ1cyB7XG4gIGNvbnN0IGhhbmRsZXJzID0gbmV3IE1hcDxFdmVudEtleSwgU2V0PEZ1bmN0aW9uPj4oKTtcbiAgcmV0dXJuIHtcbiAgICBvbihldmVudCwgaGFuZGxlcikge1xuICAgICAgbGV0IHNldCA9IGhhbmRsZXJzLmdldChldmVudCk7XG4gICAgICBpZiAoIXNldCkge1xuICAgICAgICBzZXQgPSBuZXcgU2V0KCk7XG4gICAgICAgIGhhbmRsZXJzLnNldChldmVudCwgc2V0KTtcbiAgICAgIH1cbiAgICAgIHNldC5hZGQoaGFuZGxlcik7XG4gICAgICByZXR1cm4gKCkgPT4gc2V0IS5kZWxldGUoaGFuZGxlcik7XG4gICAgfSxcbiAgICBlbWl0KGV2ZW50OiBFdmVudEtleSwgcGF5bG9hZD86IHVua25vd24pIHtcbiAgICAgIGNvbnN0IHNldCA9IGhhbmRsZXJzLmdldChldmVudCk7XG4gICAgICBpZiAoIXNldCB8fCBzZXQuc2l6ZSA9PT0gMCkgcmV0dXJuO1xuICAgICAgZm9yIChjb25zdCBmbiBvZiBzZXQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAoZm4gYXMgKHZhbHVlPzogdW5rbm93bikgPT4gdm9pZCkocGF5bG9hZCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtidXNdIGhhbmRsZXIgZm9yICR7ZXZlbnR9IGZhaWxlZGAsIGVycik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgU2hpcENvbnRleHQsIFNoaXBUb29sLCBNaXNzaWxlVG9vbCB9IGZyb20gXCIuL2J1c1wiO1xuXG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fU1BFRUQgPSA0MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9TUEVFRCA9IDI1MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9BR1JPID0gMTAwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUFYX0xJRkVUSU1FID0gMTIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX0xJRkVUSU1FID0gMjA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9TUEVFRF9QRU5BTFRZID0gODA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1BFTkFMVFkgPSA0MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUkVGID0gMjAwMDtcblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlTGltaXRzIHtcbiAgc3BlZWRNaW46IG51bWJlcjtcbiAgc3BlZWRNYXg6IG51bWJlcjtcbiAgYWdyb01pbjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHNwZWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFZpZXcge1xuICB2YWx1ZTogbnVtYmVyO1xuICBtYXg6IG51bWJlcjtcbiAgd2FybkF0OiBudW1iZXI7XG4gIG92ZXJoZWF0QXQ6IG51bWJlcjtcbiAgbWFya2VyU3BlZWQ6IG51bWJlcjtcbiAgc3RhbGxVbnRpbE1zOiBudW1iZXI7IC8vIGNsaWVudC1zeW5jZWQgdGltZSBpbiBtaWxsaXNlY29uZHNcbiAga1VwOiBudW1iZXI7XG4gIGtEb3duOiBudW1iZXI7XG4gIGV4cDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNoaXBTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBocD86IG51bWJlcjtcbiAga2lsbHM/OiBudW1iZXI7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbiAgY3VycmVudFdheXBvaW50SW5kZXg/OiBudW1iZXI7XG4gIGhlYXQ/OiBIZWF0Vmlldztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHaG9zdFNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIHNlbGY/OiBib29sZWFuO1xuICBhZ3JvX3JhZGl1czogbnVtYmVyO1xuICBoZWF0PzogSGVhdFZpZXc7IC8vIE1pc3NpbGUgaGVhdCBkYXRhXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVJvdXRlIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICB3YXlwb2ludHM6IFdheXBvaW50W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFBhcmFtcyB7XG4gIG1heDogbnVtYmVyO1xuICB3YXJuQXQ6IG51bWJlcjtcbiAgb3ZlcmhlYXRBdDogbnVtYmVyO1xuICBtYXJrZXJTcGVlZDogbnVtYmVyO1xuICBrVXA6IG51bWJlcjtcbiAga0Rvd246IG51bWJlcjtcbiAgZXhwOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUNvbmZpZyB7XG4gIHNwZWVkOiBudW1iZXI7XG4gIGFncm9SYWRpdXM6IG51bWJlcjtcbiAgbGlmZXRpbWU6IG51bWJlcjtcbiAgaGVhdFBhcmFtcz86IEhlYXRQYXJhbXM7IC8vIE9wdGlvbmFsIGN1c3RvbSBoZWF0IGNvbmZpZ3VyYXRpb25cbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUHJlc2V0IHtcbiAgbmFtZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBzcGVlZDogbnVtYmVyO1xuICBhZ3JvUmFkaXVzOiBudW1iZXI7XG4gIGhlYXRQYXJhbXM6IEhlYXRQYXJhbXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW52ZW50b3J5SXRlbSB7XG4gIHR5cGU6IHN0cmluZztcbiAgdmFyaWFudF9pZDogc3RyaW5nO1xuICBoZWF0X2NhcGFjaXR5OiBudW1iZXI7XG4gIHF1YW50aXR5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW52ZW50b3J5IHtcbiAgaXRlbXM6IEludmVudG9yeUl0ZW1bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYWdOb2RlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICBzdGF0dXM6IHN0cmluZzsgLy8gXCJsb2NrZWRcIiB8IFwiYXZhaWxhYmxlXCIgfCBcImluX3Byb2dyZXNzXCIgfCBcImNvbXBsZXRlZFwiXG4gIHJlbWFpbmluZ19zOiBudW1iZXI7XG4gIGR1cmF0aW9uX3M6IG51bWJlcjtcbiAgcmVwZWF0YWJsZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYWdTdGF0ZSB7XG4gIG5vZGVzOiBEYWdOb2RlW107XG59XG5cbi8vIE1pc3NpbGUgcHJlc2V0IGRlZmluaXRpb25zIG1hdGNoaW5nIGJhY2tlbmRcbmV4cG9ydCBjb25zdCBNSVNTSUxFX1BSRVNFVFM6IE1pc3NpbGVQcmVzZXRbXSA9IFtcbiAge1xuICAgIG5hbWU6IFwiU2NvdXRcIixcbiAgICBkZXNjcmlwdGlvbjogXCJTbG93LCBlZmZpY2llbnQsIGxvbmctcmFuZ2UuIEhpZ2ggaGVhdCBjYXBhY2l0eS5cIixcbiAgICBzcGVlZDogODAsXG4gICAgYWdyb1JhZGl1czogMTUwMCxcbiAgICBoZWF0UGFyYW1zOiB7XG4gICAgICBtYXg6IDYwLFxuICAgICAgd2FybkF0OiA0MixcbiAgICAgIG92ZXJoZWF0QXQ6IDYwLFxuICAgICAgbWFya2VyU3BlZWQ6IDcwLFxuICAgICAga1VwOiAyMCxcbiAgICAgIGtEb3duOiAxNSxcbiAgICAgIGV4cDogMS41LFxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBcIkh1bnRlclwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkJhbGFuY2VkIHNwZWVkIGFuZCBkZXRlY3Rpb24uIFN0YW5kYXJkIGhlYXQuXCIsXG4gICAgc3BlZWQ6IDE1MCxcbiAgICBhZ3JvUmFkaXVzOiA4MDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA1MCxcbiAgICAgIHdhcm5BdDogMzUsXG4gICAgICBvdmVyaGVhdEF0OiA1MCxcbiAgICAgIG1hcmtlclNwZWVkOiAxMjAsXG4gICAgICBrVXA6IDI4LFxuICAgICAga0Rvd246IDEyLFxuICAgICAgZXhwOiAxLjUsXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiU25pcGVyXCIsXG4gICAgZGVzY3JpcHRpb246IFwiRmFzdCwgbmFycm93IGRldGVjdGlvbi4gTG93IGhlYXQgY2FwYWNpdHkuXCIsXG4gICAgc3BlZWQ6IDIyMCxcbiAgICBhZ3JvUmFkaXVzOiAzMDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA0MCxcbiAgICAgIHdhcm5BdDogMjgsXG4gICAgICBvdmVyaGVhdEF0OiA0MCxcbiAgICAgIG1hcmtlclNwZWVkOiAxODAsXG4gICAgICBrVXA6IDM1LFxuICAgICAga0Rvd246IDgsXG4gICAgICBleHA6IDEuNSxcbiAgICB9LFxuICB9LFxuXTtcblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1ldGEge1xuICBjPzogbnVtYmVyO1xuICB3PzogbnVtYmVyO1xuICBoPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEJlYWNvbkRlZmluaXRpb24ge1xuICBjeDogbnVtYmVyO1xuICBjeTogbnVtYmVyO1xuICByYWRpdXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaW9uU3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIG1pc3Npb25JZDogc3RyaW5nO1xuICBiZWFjb25JbmRleDogbnVtYmVyO1xuICBob2xkQWNjdW06IG51bWJlcjtcbiAgaG9sZFJlcXVpcmVkOiBudW1iZXI7XG4gIGJlYWNvbnM6IEJlYWNvbkRlZmluaXRpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBTdGF0ZSB7XG4gIG5vdzogbnVtYmVyO1xuICBub3dTeW5jZWRBdDogbnVtYmVyO1xuICBtZTogU2hpcFNuYXBzaG90IHwgbnVsbDtcbiAgZ2hvc3RzOiBHaG9zdFNuYXBzaG90W107XG4gIG1pc3NpbGVzOiBNaXNzaWxlU25hcHNob3RbXTtcbiAgbWlzc2lsZVJvdXRlczogTWlzc2lsZVJvdXRlW107XG4gIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBzdHJpbmcgfCBudWxsO1xuICBuZXh0TWlzc2lsZVJlYWR5QXQ6IG51bWJlcjtcbiAgbWlzc2lsZUNvbmZpZzogTWlzc2lsZUNvbmZpZztcbiAgbWlzc2lsZUxpbWl0czogTWlzc2lsZUxpbWl0cztcbiAgd29ybGRNZXRhOiBXb3JsZE1ldGE7XG4gIGludmVudG9yeTogSW52ZW50b3J5IHwgbnVsbDtcbiAgZGFnOiBEYWdTdGF0ZSB8IG51bGw7XG4gIG1pc3Npb246IE1pc3Npb25TdGF0ZSB8IG51bGw7XG4gIGNyYWZ0SGVhdENhcGFjaXR5OiBudW1iZXI7IC8vIEhlYXQgY2FwYWNpdHkgc2xpZGVyIHZhbHVlIGZvciBjcmFmdGluZ1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlbGVjdGlvbiB7XG4gIHR5cGU6IFwid2F5cG9pbnRcIiB8IFwibGVnXCI7XG4gIGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVNlbGVjdGlvbiB7XG4gIHR5cGU6IFwid2F5cG9pbnRcIiB8IFwibGVnXCI7XG4gIGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIEFjdGl2ZVRvb2wgPVxuICB8IFwic2hpcC1zZXRcIlxuICB8IFwic2hpcC1zZWxlY3RcIlxuICB8IFwibWlzc2lsZS1zZXRcIlxuICB8IFwibWlzc2lsZS1zZWxlY3RcIlxuICB8IG51bGw7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVUlTdGF0ZSB7XG4gIGlucHV0Q29udGV4dDogU2hpcENvbnRleHQ7XG4gIHNoaXBUb29sOiBTaGlwVG9vbDtcbiAgbWlzc2lsZVRvb2w6IE1pc3NpbGVUb29sO1xuICBhY3RpdmVUb29sOiBBY3RpdmVUb29sO1xuICBzaG93U2hpcFJvdXRlOiBib29sZWFuO1xuICBoZWxwVmlzaWJsZTogYm9vbGVhbjtcbiAgem9vbTogbnVtYmVyO1xuICBwYW5YOiBudW1iZXI7XG4gIHBhblk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxVSVN0YXRlKCk6IFVJU3RhdGUge1xuICByZXR1cm4ge1xuICAgIGlucHV0Q29udGV4dDogXCJzaGlwXCIsXG4gICAgc2hpcFRvb2w6IFwic2V0XCIsXG4gICAgbWlzc2lsZVRvb2w6IG51bGwsXG4gICAgYWN0aXZlVG9vbDogXCJzaGlwLXNldFwiLFxuICAgIHNob3dTaGlwUm91dGU6IHRydWUsXG4gICAgaGVscFZpc2libGU6IGZhbHNlLFxuICAgIHpvb206IDEuMCxcbiAgICBwYW5YOiAwLFxuICAgIHBhblk6IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsU3RhdGUobGltaXRzOiBNaXNzaWxlTGltaXRzID0ge1xuICBzcGVlZE1pbjogTUlTU0lMRV9NSU5fU1BFRUQsXG4gIHNwZWVkTWF4OiBNSVNTSUxFX01BWF9TUEVFRCxcbiAgYWdyb01pbjogTUlTU0lMRV9NSU5fQUdSTyxcbn0pOiBBcHBTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgbm93OiAwLFxuICAgIG5vd1N5bmNlZEF0OiB0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiXG4gICAgICA/IHBlcmZvcm1hbmNlLm5vdygpXG4gICAgICA6IERhdGUubm93KCksXG4gICAgbWU6IG51bGwsXG4gICAgZ2hvc3RzOiBbXSxcbiAgICBtaXNzaWxlczogW10sXG4gICAgbWlzc2lsZVJvdXRlczogW10sXG4gICAgYWN0aXZlTWlzc2lsZVJvdXRlSWQ6IG51bGwsXG4gICAgbmV4dE1pc3NpbGVSZWFkeUF0OiAwLFxuICAgIG1pc3NpbGVDb25maWc6IHtcbiAgICAgIHNwZWVkOiAxODAsXG4gICAgICBhZ3JvUmFkaXVzOiA4MDAsXG4gICAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKDE4MCwgODAwLCBsaW1pdHMpLFxuICAgICAgaGVhdFBhcmFtczogTUlTU0lMRV9QUkVTRVRTWzFdLmhlYXRQYXJhbXMsIC8vIERlZmF1bHQgdG8gSHVudGVyIHByZXNldFxuICAgIH0sXG4gICAgbWlzc2lsZUxpbWl0czogbGltaXRzLFxuICAgIHdvcmxkTWV0YToge30sXG4gICAgaW52ZW50b3J5OiBudWxsLFxuICAgIGRhZzogbnVsbCxcbiAgICBtaXNzaW9uOiBudWxsLFxuICAgIGNyYWZ0SGVhdENhcGFjaXR5OiA4MCwgLy8gRGVmYXVsdCB0byBiYXNpYyBtaXNzaWxlIGhlYXQgY2FwYWNpdHlcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pc3NpbGVMaWZldGltZUZvcihzcGVlZDogbnVtYmVyLCBhZ3JvUmFkaXVzOiBudW1iZXIsIGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogbnVtYmVyIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBzcGFuID0gbWF4U3BlZWQgLSBtaW5TcGVlZDtcbiAgY29uc3Qgc3BlZWROb3JtID0gc3BhbiA+IDAgPyBjbGFtcCgoc3BlZWQgLSBtaW5TcGVlZCkgLyBzcGFuLCAwLCAxKSA6IDA7XG4gIGNvbnN0IGFkanVzdGVkQWdybyA9IE1hdGgubWF4KDAsIGFncm9SYWRpdXMgLSBtaW5BZ3JvKTtcbiAgY29uc3QgYWdyb05vcm0gPSBjbGFtcChhZGp1c3RlZEFncm8gLyBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUkVGLCAwLCAxKTtcbiAgY29uc3QgcmVkdWN0aW9uID0gc3BlZWROb3JtICogTUlTU0lMRV9MSUZFVElNRV9TUEVFRF9QRU5BTFRZICsgYWdyb05vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUEVOQUxUWTtcbiAgY29uc3QgYmFzZSA9IE1JU1NJTEVfTUFYX0xJRkVUSU1FO1xuICByZXR1cm4gY2xhbXAoYmFzZSAtIHJlZHVjdGlvbiwgTUlTU0lMRV9NSU5fTElGRVRJTUUsIE1JU1NJTEVfTUFYX0xJRkVUSU1FKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplTWlzc2lsZUNvbmZpZyhcbiAgY2ZnOiBQYXJ0aWFsPFBpY2s8TWlzc2lsZUNvbmZpZywgXCJzcGVlZFwiIHwgXCJhZ3JvUmFkaXVzXCIgfCBcImhlYXRQYXJhbXNcIj4+LFxuICBmYWxsYmFjazogTWlzc2lsZUNvbmZpZyxcbiAgbGltaXRzOiBNaXNzaWxlTGltaXRzLFxuKTogTWlzc2lsZUNvbmZpZyB7XG4gIGNvbnN0IG1pblNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4gOiBNSVNTSUxFX01JTl9TUEVFRDtcbiAgY29uc3QgbWF4U3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCA6IE1JU1NJTEVfTUFYX1NQRUVEO1xuICBjb25zdCBtaW5BZ3JvID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluIDogTUlTU0lMRV9NSU5fQUdSTztcbiAgY29uc3QgYmFzZSA9IGZhbGxiYWNrID8/IHtcbiAgICBzcGVlZDogbWluU3BlZWQsXG4gICAgYWdyb1JhZGl1czogbWluQWdybyxcbiAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKG1pblNwZWVkLCBtaW5BZ3JvLCBsaW1pdHMpLFxuICB9O1xuICBjb25zdCBtZXJnZWRTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgPyAoY2ZnLnNwZWVkID8/IGJhc2Uuc3BlZWQpIDogYmFzZS5zcGVlZDtcbiAgY29uc3QgbWVyZ2VkQWdybyA9IE51bWJlci5pc0Zpbml0ZShjZmcuYWdyb1JhZGl1cyA/PyBiYXNlLmFncm9SYWRpdXMpID8gKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgOiBiYXNlLmFncm9SYWRpdXM7XG4gIGNvbnN0IHNwZWVkID0gY2xhbXAobWVyZ2VkU3BlZWQsIG1pblNwZWVkLCBtYXhTcGVlZCk7XG4gIGNvbnN0IGFncm9SYWRpdXMgPSBNYXRoLm1heChtaW5BZ3JvLCBtZXJnZWRBZ3JvKTtcbiAgY29uc3QgaGVhdFBhcmFtcyA9IGNmZy5oZWF0UGFyYW1zID8geyAuLi5jZmcuaGVhdFBhcmFtcyB9IDogYmFzZS5oZWF0UGFyYW1zID8geyAuLi5iYXNlLmhlYXRQYXJhbXMgfSA6IHVuZGVmaW5lZDtcbiAgcmV0dXJuIHtcbiAgICBzcGVlZCxcbiAgICBhZ3JvUmFkaXVzLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3Ioc3BlZWQsIGFncm9SYWRpdXMsIGxpbWl0cyksXG4gICAgaGVhdFBhcmFtcyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vbm90b25pY05vdygpOiBudW1iZXIge1xuICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgfVxuICByZXR1cm4gRGF0ZS5ub3coKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lV2F5cG9pbnRMaXN0KGxpc3Q6IFdheXBvaW50W10gfCB1bmRlZmluZWQgfCBudWxsKTogV2F5cG9pbnRbXSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShsaXN0KSkgcmV0dXJuIFtdO1xuICByZXR1cm4gbGlzdC5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSk7XG59XG5cbi8vIFByb2plY3QgaGVhdCBhbG9uZyBhIG1pc3NpbGUgcm91dGVcbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVJvdXRlUHJvamVjdGlvbiB7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbiAgaGVhdEF0V2F5cG9pbnRzOiBudW1iZXJbXTtcbiAgd2lsbE92ZXJoZWF0OiBib29sZWFuO1xuICBvdmVyaGVhdEF0PzogbnVtYmVyOyAvLyBJbmRleCB3aGVyZSBvdmVyaGVhdCBvY2N1cnNcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RNaXNzaWxlSGVhdChcbiAgcm91dGU6IFdheXBvaW50W10sXG4gIGRlZmF1bHRTcGVlZDogbnVtYmVyLFxuICBoZWF0UGFyYW1zOiBIZWF0UGFyYW1zXG4pOiBNaXNzaWxlUm91dGVQcm9qZWN0aW9uIHtcbiAgY29uc3QgcHJvamVjdGlvbjogTWlzc2lsZVJvdXRlUHJvamVjdGlvbiA9IHtcbiAgICB3YXlwb2ludHM6IHJvdXRlLFxuICAgIGhlYXRBdFdheXBvaW50czogW10sXG4gICAgd2lsbE92ZXJoZWF0OiBmYWxzZSxcbiAgfTtcblxuICBpZiAocm91dGUubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHByb2plY3Rpb247XG4gIH1cblxuICBsZXQgaGVhdCA9IDA7IC8vIE1pc3NpbGVzIHN0YXJ0IGF0IHplcm8gaGVhdFxuICBsZXQgcG9zID0geyB4OiByb3V0ZVswXS54LCB5OiByb3V0ZVswXS55IH07XG4gIGxldCBjdXJyZW50U3BlZWQgPSByb3V0ZVswXS5zcGVlZCA+IDAgPyByb3V0ZVswXS5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcblxuICBwcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuXG4gIGZvciAobGV0IGkgPSAxOyBpIDwgcm91dGUubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB0YXJnZXRQb3MgPSByb3V0ZVtpXTtcbiAgICBjb25zdCB0YXJnZXRTcGVlZCA9IHRhcmdldFBvcy5zcGVlZCA+IDAgPyB0YXJnZXRQb3Muc3BlZWQgOiBkZWZhdWx0U3BlZWQ7XG5cbiAgICAvLyBDYWxjdWxhdGUgZGlzdGFuY2UgYW5kIHRpbWVcbiAgICBjb25zdCBkeCA9IHRhcmdldFBvcy54IC0gcG9zLng7XG4gICAgY29uc3QgZHkgPSB0YXJnZXRQb3MueSAtIHBvcy55O1xuICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcblxuICAgIGlmIChkaXN0YW5jZSA8IDAuMDAxKSB7XG4gICAgICBwcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gQXZlcmFnZSBzcGVlZCBkdXJpbmcgc2VnbWVudFxuICAgIGNvbnN0IGF2Z1NwZWVkID0gKGN1cnJlbnRTcGVlZCArIHRhcmdldFNwZWVkKSAqIDAuNTtcbiAgICBjb25zdCBzZWdtZW50VGltZSA9IGRpc3RhbmNlIC8gTWF0aC5tYXgoYXZnU3BlZWQsIDEpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGhlYXQgcmF0ZSAobWF0Y2ggc2VydmVyIGZvcm11bGEpXG4gICAgY29uc3QgVm4gPSBNYXRoLm1heChoZWF0UGFyYW1zLm1hcmtlclNwZWVkLCAwLjAwMDAwMSk7XG4gICAgY29uc3QgZGV2ID0gYXZnU3BlZWQgLSBoZWF0UGFyYW1zLm1hcmtlclNwZWVkO1xuICAgIGNvbnN0IHAgPSBoZWF0UGFyYW1zLmV4cDtcblxuICAgIGxldCBoZG90OiBudW1iZXI7XG4gICAgaWYgKGRldiA+PSAwKSB7XG4gICAgICAvLyBIZWF0aW5nXG4gICAgICBoZG90ID0gaGVhdFBhcmFtcy5rVXAgKiBNYXRoLnBvdyhkZXYgLyBWbiwgcCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENvb2xpbmdcbiAgICAgIGhkb3QgPSAtaGVhdFBhcmFtcy5rRG93biAqIE1hdGgucG93KE1hdGguYWJzKGRldikgLyBWbiwgcCk7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIGhlYXRcbiAgICBoZWF0ICs9IGhkb3QgKiBzZWdtZW50VGltZTtcbiAgICBoZWF0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaGVhdCwgaGVhdFBhcmFtcy5tYXgpKTtcblxuICAgIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG4gICAgcG9zID0geyB4OiB0YXJnZXRQb3MueCwgeTogdGFyZ2V0UG9zLnkgfTtcbiAgICBjdXJyZW50U3BlZWQgPSB0YXJnZXRTcGVlZDtcblxuICAgIC8vIENoZWNrIGZvciBvdmVyaGVhdFxuICAgIGlmIChoZWF0ID49IGhlYXRQYXJhbXMub3ZlcmhlYXRBdCAmJiAhcHJvamVjdGlvbi53aWxsT3ZlcmhlYXQpIHtcbiAgICAgIHByb2plY3Rpb24ud2lsbE92ZXJoZWF0ID0gdHJ1ZTtcbiAgICAgIHByb2plY3Rpb24ub3ZlcmhlYXRBdCA9IGk7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIHBvc2l0aW9uIGFuZCBzcGVlZFxuICAgIHBvcyA9IHRhcmdldFBvcztcbiAgICBjdXJyZW50U3BlZWQgPSB0YXJnZXRTcGVlZDtcbiAgfVxuXG4gIHJldHVybiBwcm9qZWN0aW9uO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUxpbWl0cyhzdGF0ZTogQXBwU3RhdGUsIGxpbWl0czogUGFydGlhbDxNaXNzaWxlTGltaXRzPik6IHZvaWQge1xuICBzdGF0ZS5taXNzaWxlTGltaXRzID0ge1xuICAgIHNwZWVkTWluOiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWluLFxuICAgIHNwZWVkTWF4OiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWF4LFxuICAgIGFncm9NaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLmFncm9NaW4sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgdHlwZSBFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHtcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIG1vbm90b25pY05vdyxcbiAgc2FuaXRpemVNaXNzaWxlQ29uZmlnLFxuICB1cGRhdGVNaXNzaWxlTGltaXRzLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHNwZWVkPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVJvdXRlIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZT86IHN0cmluZztcbiAgd2F5cG9pbnRzPzogU2VydmVyTWlzc2lsZVdheXBvaW50W107XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJIZWF0VmlldyB7XG4gIHY6IG51bWJlcjsgIC8vIGN1cnJlbnQgaGVhdCB2YWx1ZVxuICBtOiBudW1iZXI7ICAvLyBtYXhcbiAgdzogbnVtYmVyOyAgLy8gd2FybkF0XG4gIG86IG51bWJlcjsgIC8vIG92ZXJoZWF0QXRcbiAgbXM6IG51bWJlcjsgLy8gbWFya2VyU3BlZWRcbiAgc3U6IG51bWJlcjsgLy8gc3RhbGxVbnRpbCAoc2VydmVyIHRpbWUgc2Vjb25kcylcbiAga3U6IG51bWJlcjsgLy8ga1VwXG4gIGtkOiBudW1iZXI7IC8vIGtEb3duXG4gIGV4OiBudW1iZXI7IC8vIGV4cFxufVxuXG5pbnRlcmZhY2UgU2VydmVyU2hpcFN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIGhwPzogbnVtYmVyO1xuICBraWxscz86IG51bWJlcjtcbiAgd2F5cG9pbnRzPzogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgc3BlZWQ/OiBudW1iZXIgfT47XG4gIGN1cnJlbnRfd2F5cG9pbnRfaW5kZXg/OiBudW1iZXI7XG4gIGhlYXQ/OiBTZXJ2ZXJIZWF0Vmlldztcbn1cblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVTdGF0ZSB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlclN0YXRlTWVzc2FnZSB7XG4gIHR5cGU6IFwic3RhdGVcIjtcbiAgbm93OiBudW1iZXI7XG4gIG5leHRfbWlzc2lsZV9yZWFkeT86IG51bWJlcjtcbiAgbWU/OiBTZXJ2ZXJTaGlwU3RhdGUgfCBudWxsO1xuICBnaG9zdHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB2eDogbnVtYmVyOyB2eTogbnVtYmVyIH0+O1xuICBtaXNzaWxlcz86IFNlcnZlck1pc3NpbGVTdGF0ZVtdO1xuICBtaXNzaWxlX3JvdXRlcz86IFNlcnZlck1pc3NpbGVSb3V0ZVtdO1xuICBtaXNzaWxlX2NvbmZpZz86IHtcbiAgICBzcGVlZD86IG51bWJlcjtcbiAgICBzcGVlZF9taW4/OiBudW1iZXI7XG4gICAgc3BlZWRfbWF4PzogbnVtYmVyO1xuICAgIGFncm9fcmFkaXVzPzogbnVtYmVyO1xuICAgIGFncm9fbWluPzogbnVtYmVyO1xuICAgIGxpZmV0aW1lPzogbnVtYmVyO1xuICAgIGhlYXRfY29uZmlnPzoge1xuICAgICAgbWF4PzogbnVtYmVyO1xuICAgICAgd2Fybl9hdD86IG51bWJlcjtcbiAgICAgIG92ZXJoZWF0X2F0PzogbnVtYmVyO1xuICAgICAgbWFya2VyX3NwZWVkPzogbnVtYmVyO1xuICAgICAga191cD86IG51bWJlcjtcbiAgICAgIGtfZG93bj86IG51bWJlcjtcbiAgICAgIGV4cD86IG51bWJlcjtcbiAgICB9IHwgbnVsbDtcbiAgfSB8IG51bGw7XG4gIGFjdGl2ZV9taXNzaWxlX3JvdXRlPzogc3RyaW5nIHwgbnVsbDtcbiAgbWV0YT86IHtcbiAgICBjPzogbnVtYmVyO1xuICAgIHc/OiBudW1iZXI7XG4gICAgaD86IG51bWJlcjtcbiAgfTtcbiAgaW52ZW50b3J5Pzoge1xuICAgIGl0ZW1zPzogQXJyYXk8e1xuICAgICAgdHlwZTogc3RyaW5nO1xuICAgICAgdmFyaWFudF9pZDogc3RyaW5nO1xuICAgICAgaGVhdF9jYXBhY2l0eTogbnVtYmVyO1xuICAgICAgcXVhbnRpdHk6IG51bWJlcjtcbiAgICB9PjtcbiAgfTtcbiAgZGFnPzoge1xuICAgIG5vZGVzPzogQXJyYXk8e1xuICAgICAgaWQ6IHN0cmluZztcbiAgICAgIGtpbmQ6IHN0cmluZztcbiAgICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgICBzdGF0dXM6IHN0cmluZztcbiAgICAgIHJlbWFpbmluZ19zOiBudW1iZXI7XG4gICAgICBkdXJhdGlvbl9zOiBudW1iZXI7XG4gICAgICByZXBlYXRhYmxlOiBib29sZWFuO1xuICAgIH0+O1xuICB9O1xufVxuXG5pbnRlcmZhY2UgQ29ubmVjdE9wdGlvbnMge1xuICByb29tOiBzdHJpbmc7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb25TdGF0ZVVwZGF0ZWQ/OiAoKSA9PiB2b2lkO1xuICBvbk9wZW4/OiAoc29ja2V0OiBXZWJTb2NrZXQpID0+IHZvaWQ7XG4gIG1hcFc/OiBudW1iZXI7XG4gIG1hcEg/OiBudW1iZXI7XG4gIG1vZGU/OiBzdHJpbmc7XG4gIG1pc3Npb25JZD86IHN0cmluZztcbn1cblxubGV0IHdzOiBXZWJTb2NrZXQgfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIHNlbmRNZXNzYWdlKHBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcbiAgaWYgKCF3cyB8fCB3cy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikgcmV0dXJuO1xuICBjb25zdCBkYXRhID0gdHlwZW9mIHBheWxvYWQgPT09IFwic3RyaW5nXCIgPyBwYXlsb2FkIDogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCk7XG4gIHdzLnNlbmQoZGF0YSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0V2ViU29ja2V0KHtcbiAgcm9vbSxcbiAgc3RhdGUsXG4gIGJ1cyxcbiAgb25TdGF0ZVVwZGF0ZWQsXG4gIG9uT3BlbixcbiAgbWFwVyxcbiAgbWFwSCxcbiAgbW9kZSxcbiAgbWlzc2lvbklkLFxufTogQ29ubmVjdE9wdGlvbnMpOiB2b2lkIHtcbiAgY29uc3QgcHJvdG9jb2wgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgPyBcIndzczovL1wiIDogXCJ3czovL1wiO1xuICBsZXQgd3NVcmwgPSBgJHtwcm90b2NvbH0ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fS93cz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb20pfWA7XG4gIGlmIChtYXBXICYmIG1hcFcgPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBXPSR7bWFwV31gO1xuICB9XG4gIGlmIChtYXBIICYmIG1hcEggPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBIPSR7bWFwSH1gO1xuICB9XG4gIGlmIChtb2RlKSB7XG4gICAgd3NVcmwgKz0gYCZtb2RlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1vZGUpfWA7XG4gIH1cbiAgaWYgKG1pc3Npb25JZCkge1xuICAgIHdzVXJsICs9IGAmbWlzc2lvbj0ke2VuY29kZVVSSUNvbXBvbmVudChtaXNzaW9uSWQpfWA7XG4gIH1cbiAgd3MgPSBuZXcgV2ViU29ja2V0KHdzVXJsKTtcbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm9wZW5cIiwgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFwiW3dzXSBvcGVuXCIpO1xuICAgIGNvbnN0IHNvY2tldCA9IHdzO1xuICAgIGlmIChzb2NrZXQgJiYgb25PcGVuKSB7XG4gICAgICBvbk9wZW4oc29ja2V0KTtcbiAgICB9XG4gIH0pO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwiY2xvc2VcIiwgKCkgPT4gY29uc29sZS5sb2coXCJbd3NdIGNsb3NlXCIpKTtcblxuICBsZXQgcHJldlJvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+KCk7XG4gIGxldCBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgcHJldk1pc3NpbGVDb3VudCA9IDA7XG5cbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgZGF0YSA9IHNhZmVQYXJzZShldmVudC5kYXRhKTtcbiAgICBpZiAoIWRhdGEgfHwgZGF0YS50eXBlICE9PSBcInN0YXRlXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaGFuZGxlU3RhdGVNZXNzYWdlKHN0YXRlLCBkYXRhLCBidXMsIHByZXZSb3V0ZXMsIHByZXZBY3RpdmVSb3V0ZSwgcHJldk1pc3NpbGVDb3VudCk7XG4gICAgcHJldlJvdXRlcyA9IG5ldyBNYXAoc3RhdGUubWlzc2lsZVJvdXRlcy5tYXAoKHJvdXRlKSA9PiBbcm91dGUuaWQsIGNsb25lUm91dGUocm91dGUpXSkpO1xuICAgIHByZXZBY3RpdmVSb3V0ZSA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIHByZXZNaXNzaWxlQ291bnQgPSBzdGF0ZS5taXNzaWxlcy5sZW5ndGg7XG4gICAgYnVzLmVtaXQoXCJzdGF0ZTp1cGRhdGVkXCIpO1xuICAgIG9uU3RhdGVVcGRhdGVkPy4oKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVN0YXRlTWVzc2FnZShcbiAgc3RhdGU6IEFwcFN0YXRlLFxuICBtc2c6IFNlcnZlclN0YXRlTWVzc2FnZSxcbiAgYnVzOiBFdmVudEJ1cyxcbiAgcHJldlJvdXRlczogTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPixcbiAgcHJldkFjdGl2ZVJvdXRlOiBzdHJpbmcgfCBudWxsLFxuICBwcmV2TWlzc2lsZUNvdW50OiBudW1iZXIsXG4pOiB2b2lkIHtcbiAgc3RhdGUubm93ID0gbXNnLm5vdztcbiAgc3RhdGUubm93U3luY2VkQXQgPSBtb25vdG9uaWNOb3coKTtcbiAgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0ID0gTnVtYmVyLmlzRmluaXRlKG1zZy5uZXh0X21pc3NpbGVfcmVhZHkpID8gbXNnLm5leHRfbWlzc2lsZV9yZWFkeSEgOiAwO1xuICBzdGF0ZS5tZSA9IG1zZy5tZSA/IHtcbiAgICB4OiBtc2cubWUueCxcbiAgICB5OiBtc2cubWUueSxcbiAgICB2eDogbXNnLm1lLnZ4LFxuICAgIHZ5OiBtc2cubWUudnksXG4gICAgaHA6IG1zZy5tZS5ocCxcbiAgICBraWxsczogbXNnLm1lLmtpbGxzID8/IDAsXG4gICAgd2F5cG9pbnRzOiBBcnJheS5pc0FycmF5KG1zZy5tZS53YXlwb2ludHMpXG4gICAgICA/IG1zZy5tZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHsgeDogd3AueCwgeTogd3AueSwgc3BlZWQ6IE51bWJlci5pc0Zpbml0ZSh3cC5zcGVlZCkgPyB3cC5zcGVlZCEgOiAxODAgfSkpXG4gICAgICA6IFtdLFxuICAgIGN1cnJlbnRXYXlwb2ludEluZGV4OiBtc2cubWUuY3VycmVudF93YXlwb2ludF9pbmRleCA/PyAwLFxuICAgIGhlYXQ6IG1zZy5tZS5oZWF0ID8gY29udmVydEhlYXRWaWV3KG1zZy5tZS5oZWF0LCBzdGF0ZS5ub3dTeW5jZWRBdCwgc3RhdGUubm93KSA6IHVuZGVmaW5lZCxcbiAgfSA6IG51bGw7XG4gIHN0YXRlLmdob3N0cyA9IEFycmF5LmlzQXJyYXkobXNnLmdob3N0cykgPyBtc2cuZ2hvc3RzLnNsaWNlKCkgOiBbXTtcbiAgc3RhdGUubWlzc2lsZXMgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlcykgPyBtc2cubWlzc2lsZXMuc2xpY2UoKSA6IFtdO1xuXG4gIGNvbnN0IHJvdXRlc0Zyb21TZXJ2ZXIgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlX3JvdXRlcykgPyBtc2cubWlzc2lsZV9yb3V0ZXMgOiBbXTtcbiAgY29uc3QgbmV3Um91dGVzOiBNaXNzaWxlUm91dGVbXSA9IHJvdXRlc0Zyb21TZXJ2ZXIubWFwKChyb3V0ZSkgPT4gKHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSB8fCByb3V0ZS5pZCB8fCBcIlJvdXRlXCIsXG4gICAgd2F5cG9pbnRzOiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cylcbiAgICAgID8gcm91dGUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7XG4gICAgICAgICAgeDogd3AueCxcbiAgICAgICAgICB5OiB3cC55LFxuICAgICAgICAgIHNwZWVkOiBOdW1iZXIuaXNGaW5pdGUod3Auc3BlZWQpID8gd3Auc3BlZWQhIDogc3RhdGUubWlzc2lsZUNvbmZpZy5zcGVlZCxcbiAgICAgICAgfSkpXG4gICAgICA6IFtdLFxuICB9KSk7XG5cbiAgZGlmZlJvdXRlcyhwcmV2Um91dGVzLCBuZXdSb3V0ZXMsIGJ1cyk7XG4gIHN0YXRlLm1pc3NpbGVSb3V0ZXMgPSBuZXdSb3V0ZXM7XG5cbiAgY29uc3QgbmV4dEFjdGl2ZSA9IHR5cGVvZiBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGUgPT09IFwic3RyaW5nXCIgJiYgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlLmxlbmd0aCA+IDBcbiAgICA/IG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZVxuICAgIDogbmV3Um91dGVzLmxlbmd0aCA+IDBcbiAgICAgID8gbmV3Um91dGVzWzBdLmlkXG4gICAgICA6IG51bGw7XG4gIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dEFjdGl2ZTtcbiAgaWYgKG5leHRBY3RpdmUgIT09IHByZXZBY3RpdmVSb3V0ZSkge1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIiwgeyByb3V0ZUlkOiBuZXh0QWN0aXZlID8/IG51bGwgfSk7XG4gIH1cblxuICBpZiAobXNnLm1pc3NpbGVfY29uZmlnKSB7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluKSB8fCBOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCkgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5hZ3JvX21pbikpIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGUsIHtcbiAgICAgICAgc3BlZWRNaW46IG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9taW4sXG4gICAgICAgIHNwZWVkTWF4OiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWF4LFxuICAgICAgICBhZ3JvTWluOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4sXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgcHJldkhlYXQgPSBzdGF0ZS5taXNzaWxlQ29uZmlnLmhlYXRQYXJhbXM7XG4gICAgbGV0IGhlYXRQYXJhbXM6IHsgbWF4OiBudW1iZXI7IHdhcm5BdDogbnVtYmVyOyBvdmVyaGVhdEF0OiBudW1iZXI7IG1hcmtlclNwZWVkOiBudW1iZXI7IGtVcDogbnVtYmVyOyBrRG93bjogbnVtYmVyOyBleHA6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuICAgIGNvbnN0IGhlYXRDb25maWcgPSBtc2cubWlzc2lsZV9jb25maWcuaGVhdF9jb25maWc7XG4gICAgaWYgKGhlYXRDb25maWcpIHtcbiAgICAgIGhlYXRQYXJhbXMgPSB7XG4gICAgICAgIG1heDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcubWF4KSA/IGhlYXRDb25maWcubWF4ISA6IHByZXZIZWF0Py5tYXggPz8gMCxcbiAgICAgICAgd2FybkF0OiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy53YXJuX2F0KSA/IGhlYXRDb25maWcud2Fybl9hdCEgOiBwcmV2SGVhdD8ud2FybkF0ID8/IDAsXG4gICAgICAgIG92ZXJoZWF0QXQ6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLm92ZXJoZWF0X2F0KSA/IGhlYXRDb25maWcub3ZlcmhlYXRfYXQhIDogcHJldkhlYXQ/Lm92ZXJoZWF0QXQgPz8gMCxcbiAgICAgICAgbWFya2VyU3BlZWQ6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLm1hcmtlcl9zcGVlZCkgPyBoZWF0Q29uZmlnLm1hcmtlcl9zcGVlZCEgOiBwcmV2SGVhdD8ubWFya2VyU3BlZWQgPz8gMCxcbiAgICAgICAga1VwOiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5rX3VwKSA/IGhlYXRDb25maWcua191cCEgOiBwcmV2SGVhdD8ua1VwID8/IDAsXG4gICAgICAgIGtEb3duOiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5rX2Rvd24pID8gaGVhdENvbmZpZy5rX2Rvd24hIDogcHJldkhlYXQ/LmtEb3duID8/IDAsXG4gICAgICAgIGV4cDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcuZXhwKSA/IGhlYXRDb25maWcuZXhwISA6IHByZXZIZWF0Py5leHAgPz8gMSxcbiAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyh7XG4gICAgICBzcGVlZDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkLFxuICAgICAgYWdyb1JhZGl1czogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fcmFkaXVzLFxuICAgICAgaGVhdFBhcmFtcyxcbiAgICB9LCBzdGF0ZS5taXNzaWxlQ29uZmlnLCBzdGF0ZS5taXNzaWxlTGltaXRzKTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5saWZldGltZSkpIHtcbiAgICAgIHNhbml0aXplZC5saWZldGltZSA9IG1zZy5taXNzaWxlX2NvbmZpZy5saWZldGltZSE7XG4gICAgfVxuICAgIHN0YXRlLm1pc3NpbGVDb25maWcgPSBzYW5pdGl6ZWQ7XG4gIH1cblxuICBjb25zdCBtZXRhID0gbXNnLm1ldGEgPz8ge307XG4gIGNvbnN0IGhhc0MgPSB0eXBlb2YgbWV0YS5jID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmMpO1xuICBjb25zdCBoYXNXID0gdHlwZW9mIG1ldGEudyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS53KTtcbiAgY29uc3QgaGFzSCA9IHR5cGVvZiBtZXRhLmggPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuaCk7XG4gIHN0YXRlLndvcmxkTWV0YSA9IHtcbiAgICBjOiBoYXNDID8gbWV0YS5jISA6IHN0YXRlLndvcmxkTWV0YS5jLFxuICAgIHc6IGhhc1cgPyBtZXRhLnchIDogc3RhdGUud29ybGRNZXRhLncsXG4gICAgaDogaGFzSCA/IG1ldGEuaCEgOiBzdGF0ZS53b3JsZE1ldGEuaCxcbiAgfTtcblxuICBpZiAobXNnLmludmVudG9yeSAmJiBBcnJheS5pc0FycmF5KG1zZy5pbnZlbnRvcnkuaXRlbXMpKSB7XG4gICAgc3RhdGUuaW52ZW50b3J5ID0ge1xuICAgICAgaXRlbXM6IG1zZy5pbnZlbnRvcnkuaXRlbXMubWFwKChpdGVtKSA9PiAoe1xuICAgICAgICB0eXBlOiBpdGVtLnR5cGUsXG4gICAgICAgIHZhcmlhbnRfaWQ6IGl0ZW0udmFyaWFudF9pZCxcbiAgICAgICAgaGVhdF9jYXBhY2l0eTogaXRlbS5oZWF0X2NhcGFjaXR5LFxuICAgICAgICBxdWFudGl0eTogaXRlbS5xdWFudGl0eSxcbiAgICAgIH0pKSxcbiAgICB9O1xuICB9XG5cbiAgaWYgKG1zZy5kYWcgJiYgQXJyYXkuaXNBcnJheShtc2cuZGFnLm5vZGVzKSkge1xuICAgIHN0YXRlLmRhZyA9IHtcbiAgICAgIG5vZGVzOiBtc2cuZGFnLm5vZGVzLm1hcCgobm9kZSkgPT4gKHtcbiAgICAgICAgaWQ6IG5vZGUuaWQsXG4gICAgICAgIGtpbmQ6IG5vZGUua2luZCxcbiAgICAgICAgbGFiZWw6IG5vZGUubGFiZWwsXG4gICAgICAgIHN0YXR1czogbm9kZS5zdGF0dXMsXG4gICAgICAgIHJlbWFpbmluZ19zOiBub2RlLnJlbWFpbmluZ19zLFxuICAgICAgICBkdXJhdGlvbl9zOiBub2RlLmR1cmF0aW9uX3MsXG4gICAgICAgIHJlcGVhdGFibGU6IG5vZGUucmVwZWF0YWJsZSxcbiAgICAgIH0pKSxcbiAgICB9O1xuICB9XG5cbiAgaWYgKHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA+IHByZXZNaXNzaWxlQ291bnQpIHtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZUlkID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgaWYgKGFjdGl2ZVJvdXRlSWQpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IGFjdGl2ZVJvdXRlSWQgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IFwiXCIgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY29vbGRvd25SZW1haW5pbmcgPSBNYXRoLm1heCgwLCBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpKTtcbiAgYnVzLmVtaXQoXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiLCB7IHNlY29uZHNSZW1haW5pbmc6IGNvb2xkb3duUmVtYWluaW5nIH0pO1xufVxuXG5mdW5jdGlvbiBkaWZmUm91dGVzKHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sIG5leHRSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdLCBidXM6IEV2ZW50QnVzKTogdm9pZCB7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByb3V0ZSBvZiBuZXh0Um91dGVzKSB7XG4gICAgc2Vlbi5hZGQocm91dGUuaWQpO1xuICAgIGNvbnN0IHByZXYgPSBwcmV2Um91dGVzLmdldChyb3V0ZS5pZCk7XG4gICAgaWYgKCFwcmV2KSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChyb3V0ZS5uYW1lICE9PSBwcmV2Lm5hbWUpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgbmFtZTogcm91dGUubmFtZSB9KTtcbiAgICB9XG4gICAgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPiBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgICB9IGVsc2UgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPCBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHByZXYud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfVxuICAgIGlmIChwcmV2LndheXBvaW50cy5sZW5ndGggPiAwICYmIHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgW3JvdXRlSWRdIG9mIHByZXZSb3V0ZXMpIHtcbiAgICBpZiAoIXNlZW4uaGFzKHJvdXRlSWQpKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVEZWxldGVkXCIsIHsgcm91dGVJZCB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xvbmVSb3V0ZShyb3V0ZTogTWlzc2lsZVJvdXRlKTogTWlzc2lsZVJvdXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSxcbiAgICB3YXlwb2ludHM6IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHNhZmVQYXJzZSh2YWx1ZTogdW5rbm93bik6IFNlcnZlclN0YXRlTWVzc2FnZSB8IG51bGwge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSkgYXMgU2VydmVyU3RhdGVNZXNzYWdlO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLndhcm4oXCJbd3NdIGZhaWxlZCB0byBwYXJzZSBtZXNzYWdlXCIsIGVycik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShzdGF0ZS5ub3cpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgY29uc3Qgc3luY2VkQXQgPSBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93U3luY2VkQXQpID8gc3RhdGUubm93U3luY2VkQXQgOiBudWxsO1xuICBpZiAoIXN5bmNlZEF0KSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICBjb25zdCBlbGFwc2VkTXMgPSBtb25vdG9uaWNOb3coKSAtIHN5bmNlZEF0O1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShlbGFwc2VkTXMpIHx8IGVsYXBzZWRNcyA8IDApIHtcbiAgICByZXR1cm4gc3RhdGUubm93O1xuICB9XG4gIHJldHVybiBzdGF0ZS5ub3cgKyBlbGFwc2VkTXMgLyAxMDAwO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0SGVhdFZpZXcoc2VydmVySGVhdDogU2VydmVySGVhdFZpZXcsIG5vd1N5bmNlZEF0TXM6IG51bWJlciwgc2VydmVyTm93U2VjOiBudW1iZXIpOiBpbXBvcnQoXCIuL3N0YXRlXCIpLkhlYXRWaWV3IHtcbiAgLy8gQ29udmVydCBzZXJ2ZXIgdGltZSAoc3RhbGxVbnRpbCBpbiBzZWNvbmRzKSB0byBjbGllbnQgdGltZSAobWlsbGlzZWNvbmRzKVxuICAvLyBzdGFsbFVudGlsIGlzIGFic29sdXRlIHNlcnZlciB0aW1lLCBzbyB3ZSBuZWVkIHRvIGNvbnZlcnQgaXQgdG8gY2xpZW50IHRpbWVcbiAgY29uc3Qgc2VydmVyU3RhbGxVbnRpbFNlYyA9IHNlcnZlckhlYXQuc3U7XG4gIGNvbnN0IG9mZnNldEZyb21Ob3dTZWMgPSBzZXJ2ZXJTdGFsbFVudGlsU2VjIC0gc2VydmVyTm93U2VjO1xuICBjb25zdCBzdGFsbFVudGlsTXMgPSBub3dTeW5jZWRBdE1zICsgKG9mZnNldEZyb21Ob3dTZWMgKiAxMDAwKTtcblxuICBjb25zdCBoZWF0VmlldyA9IHtcbiAgICB2YWx1ZTogc2VydmVySGVhdC52LFxuICAgIG1heDogc2VydmVySGVhdC5tLFxuICAgIHdhcm5BdDogc2VydmVySGVhdC53LFxuICAgIG92ZXJoZWF0QXQ6IHNlcnZlckhlYXQubyxcbiAgICBtYXJrZXJTcGVlZDogc2VydmVySGVhdC5tcyxcbiAgICBzdGFsbFVudGlsTXM6IHN0YWxsVW50aWxNcyxcbiAgICBrVXA6IHNlcnZlckhlYXQua3UsXG4gICAga0Rvd246IHNlcnZlckhlYXQua2QsXG4gICAgZXhwOiBzZXJ2ZXJIZWF0LmV4LFxuICB9O1xuICByZXR1cm4gaGVhdFZpZXc7XG59XG4iLCAiZXhwb3J0IGNvbnN0IE1JTl9aT09NID0gMS4wO1xuZXhwb3J0IGNvbnN0IE1BWF9aT09NID0gMy4wO1xuXG5leHBvcnQgY29uc3QgSEVMUF9URVhUID0gW1xuICBcIlByaW1hcnkgTW9kZXNcIixcbiAgXCIgIDEgXHUyMDEzIFRvZ2dsZSBzaGlwIG5hdmlnYXRpb24gbW9kZVwiLFxuICBcIiAgMiBcdTIwMTMgVG9nZ2xlIG1pc3NpbGUgY29vcmRpbmF0aW9uIG1vZGVcIixcbiAgXCJcIixcbiAgXCJTaGlwIE5hdmlnYXRpb25cIixcbiAgXCIgIFQgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgIEMgXHUyMDEzIENsZWFyIGFsbCB3YXlwb2ludHNcIixcbiAgXCIgIEggXHUyMDEzIEhvbGQgKGNsZWFyIHdheXBvaW50cyAmIHN0b3ApXCIsXG4gIFwiICBSIFx1MjAxMyBUb2dnbGUgc2hvdyByb3V0ZVwiLFxuICBcIiAgWyAvIF0gXHUyMDEzIEFkanVzdCB3YXlwb2ludCBzcGVlZFwiLFxuICBcIiAgU2hpZnQrWyAvIF0gXHUyMDEzIENvYXJzZSBzcGVlZCBhZGp1c3RcIixcbiAgXCIgIFRhYiAvIFNoaWZ0K1RhYiBcdTIwMTMgQ3ljbGUgd2F5cG9pbnRzXCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBmcm9tIHNlbGVjdGVkIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiTWlzc2lsZSBDb29yZGluYXRpb25cIixcbiAgXCIgIE4gXHUyMDEzIEFkZCBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICBcIiAgTCBcdTIwMTMgTGF1bmNoIG1pc3NpbGVzXCIsXG4gIFwiICBFIFx1MjAxMyBTd2l0Y2ggYmV0d2VlbiBzZXQvc2VsZWN0XCIsXG4gIFwiICAsIC8gLiBcdTIwMTMgQWRqdXN0IGFncm8gcmFkaXVzXCIsXG4gIFwiICA7IC8gJyBcdTIwMTMgQWRqdXN0IG1pc3NpbGUgc3BlZWRcIixcbiAgXCIgIFNoaWZ0K3NsaWRlciBrZXlzIFx1MjAxMyBDb2Fyc2UgYWRqdXN0XCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBzZWxlY3RlZCBtaXNzaWxlIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiTWFwIENvbnRyb2xzXCIsXG4gIFwiICArLy0gXHUyMDEzIFpvb20gaW4vb3V0XCIsXG4gIFwiICBDdHJsKzAgXHUyMDEzIFJlc2V0IHpvb21cIixcbiAgXCIgIE1vdXNlIHdoZWVsIFx1MjAxMyBab29tIGF0IGN1cnNvclwiLFxuICBcIiAgUGluY2ggXHUyMDEzIFpvb20gb24gdG91Y2ggZGV2aWNlc1wiLFxuICBcIlwiLFxuICBcIkdlbmVyYWxcIixcbiAgXCIgID8gXHUyMDEzIFRvZ2dsZSB0aGlzIG92ZXJsYXlcIixcbiAgXCIgIEVzYyBcdTIwMTMgQ2FuY2VsIHNlbGVjdGlvbiBvciBjbG9zZSBvdmVybGF5XCIsXG5dLmpvaW4oXCJcXG5cIik7XG4iLCAiaW1wb3J0IHR5cGUgeyBBcHBTdGF0ZSwgVUlTdGF0ZSB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi4vc3RhdGVcIjtcbmltcG9ydCB7IE1BWF9aT09NLCBNSU5fWk9PTSB9IGZyb20gXCIuL2NvbnN0YW50c1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENhbWVyYURlcGVuZGVuY2llcyB7XG4gIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIHVpU3RhdGU6IFVJU3RhdGU7XG59XG5cbmludGVyZmFjZSBXb3JsZFNpemUge1xuICB3OiBudW1iZXI7XG4gIGg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYW1lcmEge1xuICBzZXRab29tKG5ld1pvb206IG51bWJlciwgY2VudGVyWD86IG51bWJlciwgY2VudGVyWT86IG51bWJlcik6IHZvaWQ7XG4gIGdldENhbWVyYVBvc2l0aW9uKCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgd29ybGRUb0NhbnZhcyhwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG4gIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuICB1cGRhdGVXb3JsZEZyb21NZXRhKG1ldGE6IFBhcnRpYWw8V29ybGRTaXplIHwgdW5kZWZpbmVkPik6IHZvaWQ7XG4gIGdldFdvcmxkU2l6ZSgpOiBXb3JsZFNpemU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDYW1lcmEoeyBjYW52YXMsIHN0YXRlLCB1aVN0YXRlIH06IENhbWVyYURlcGVuZGVuY2llcyk6IENhbWVyYSB7XG4gIGNvbnN0IHdvcmxkOiBXb3JsZFNpemUgPSB7IHc6IDgwMDAsIGg6IDQ1MDAgfTtcblxuICBmdW5jdGlvbiByZXNvbHZlQ2FudmFzKCk6IEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbCB7XG4gICAgcmV0dXJuIGNhbnZhcyA/PyBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0Wm9vbShuZXdab29tOiBudW1iZXIsIGNlbnRlclg/OiBudW1iZXIsIGNlbnRlclk/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAvLyBjZW50ZXIgcGFyYW1ldGVycyByZXNlcnZlZCBmb3IgcG90ZW50aWFsIHNtb290aCB6b29taW5nIGxvZ2ljXG4gICAgdm9pZCBjZW50ZXJYO1xuICAgIHZvaWQgY2VudGVyWTtcbiAgICB1aVN0YXRlLnpvb20gPSBjbGFtcChuZXdab29tLCBNSU5fWk9PTSwgTUFYX1pPT00pO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0Q2FtZXJhUG9zaXRpb24oKTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgICBjb25zdCBjdiA9IHJlc29sdmVDYW52YXMoKTtcbiAgICBpZiAoIWN2KSByZXR1cm4geyB4OiB3b3JsZC53IC8gMiwgeTogd29ybGQuaCAvIDIgfTtcblxuICAgIGNvbnN0IHpvb20gPSB1aVN0YXRlLnpvb207XG5cbiAgICBsZXQgY2FtZXJhWCA9IHN0YXRlLm1lID8gc3RhdGUubWUueCA6IHdvcmxkLncgLyAyO1xuICAgIGxldCBjYW1lcmFZID0gc3RhdGUubWUgPyBzdGF0ZS5tZS55IDogd29ybGQuaCAvIDI7XG5cbiAgICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gICAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgICBjb25zdCBzY2FsZSA9IE1hdGgubWluKHNjYWxlWCwgc2NhbGVZKSAqIHpvb207XG5cbiAgICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgICBjb25zdCB2aWV3cG9ydEhlaWdodCA9IGN2LmhlaWdodCAvIHNjYWxlO1xuXG4gICAgY29uc3QgbWluQ2FtZXJhWCA9IHZpZXdwb3J0V2lkdGggLyAyO1xuICAgIGNvbnN0IG1heENhbWVyYVggPSB3b3JsZC53IC0gdmlld3BvcnRXaWR0aCAvIDI7XG4gICAgY29uc3QgbWluQ2FtZXJhWSA9IHZpZXdwb3J0SGVpZ2h0IC8gMjtcbiAgICBjb25zdCBtYXhDYW1lcmFZID0gd29ybGQuaCAtIHZpZXdwb3J0SGVpZ2h0IC8gMjtcblxuICAgIGlmICh2aWV3cG9ydFdpZHRoIDwgd29ybGQudykge1xuICAgICAgY2FtZXJhWCA9IGNsYW1wKGNhbWVyYVgsIG1pbkNhbWVyYVgsIG1heENhbWVyYVgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYW1lcmFYID0gd29ybGQudyAvIDI7XG4gICAgfVxuXG4gICAgaWYgKHZpZXdwb3J0SGVpZ2h0IDwgd29ybGQuaCkge1xuICAgICAgY2FtZXJhWSA9IGNsYW1wKGNhbWVyYVksIG1pbkNhbWVyYVksIG1heENhbWVyYVkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYW1lcmFZID0gd29ybGQuaCAvIDI7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgeDogY2FtZXJhWCwgeTogY2FtZXJhWSB9O1xuICB9XG5cbiAgZnVuY3Rpb24gd29ybGRUb0NhbnZhcyhwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICAgIGNvbnN0IGN2ID0gcmVzb2x2ZUNhbnZhcygpO1xuICAgIGlmICghY3YpIHJldHVybiB7IHg6IHAueCwgeTogcC55IH07XG5cbiAgICBjb25zdCB6b29tID0gdWlTdGF0ZS56b29tO1xuICAgIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgICBjb25zdCB3b3JsZFggPSBwLnggLSBjYW1lcmEueDtcbiAgICBjb25zdCB3b3JsZFkgPSBwLnkgLSBjYW1lcmEueTtcblxuICAgIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgICBjb25zdCBzY2FsZVkgPSBjdi5oZWlnaHQgLyB3b3JsZC5oO1xuICAgIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAgIHJldHVybiB7XG4gICAgICB4OiB3b3JsZFggKiBzY2FsZSArIGN2LndpZHRoIC8gMixcbiAgICAgIHk6IHdvcmxkWSAqIHNjYWxlICsgY3YuaGVpZ2h0IC8gMixcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gY2FudmFzVG9Xb3JsZChwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICAgIGNvbnN0IGN2ID0gcmVzb2x2ZUNhbnZhcygpO1xuICAgIGlmICghY3YpIHJldHVybiB7IHg6IHAueCwgeTogcC55IH07XG5cbiAgICBjb25zdCB6b29tID0gdWlTdGF0ZS56b29tO1xuICAgIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgICBjb25zdCBjYW52YXNYID0gcC54IC0gY3Yud2lkdGggLyAyO1xuICAgIGNvbnN0IGNhbnZhc1kgPSBwLnkgLSBjdi5oZWlnaHQgLyAyO1xuXG4gICAgY29uc3Qgc2NhbGVYID0gY3Yud2lkdGggLyB3b3JsZC53O1xuICAgIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gICAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IGNhbnZhc1ggLyBzY2FsZSArIGNhbWVyYS54LFxuICAgICAgeTogY2FudmFzWSAvIHNjYWxlICsgY2FtZXJhLnksXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVdvcmxkRnJvbU1ldGEobWV0YTogUGFydGlhbDxXb3JsZFNpemUgfCB1bmRlZmluZWQ+KTogdm9pZCB7XG4gICAgaWYgKCFtZXRhKSByZXR1cm47XG4gICAgaWYgKHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudykpIHtcbiAgICAgIHdvcmxkLncgPSBtZXRhLnc7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpKSB7XG4gICAgICB3b3JsZC5oID0gbWV0YS5oO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFdvcmxkU2l6ZSgpOiBXb3JsZFNpemUge1xuICAgIHJldHVybiB7IC4uLndvcmxkIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNldFpvb20sXG4gICAgZ2V0Q2FtZXJhUG9zaXRpb24sXG4gICAgd29ybGRUb0NhbnZhcyxcbiAgICBjYW52YXNUb1dvcmxkLFxuICAgIHVwZGF0ZVdvcmxkRnJvbU1ldGEsXG4gICAgZ2V0V29ybGRTaXplLFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBVSVN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgdHlwZSB7IENhbWVyYSB9IGZyb20gXCIuL2NhbWVyYVwiO1xuaW1wb3J0IHR5cGUgeyBMb2dpYywgUG9pbnRlclBvaW50IH0gZnJvbSBcIi4vbG9naWNcIjtcbmltcG9ydCB0eXBlIHsgVUlDb250cm9sbGVyIH0gZnJvbSBcIi4vdWlcIjtcblxuaW50ZXJmYWNlIElucHV0RGVwZW5kZW5jaWVzIHtcbiAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgdWk6IFVJQ29udHJvbGxlcjtcbiAgbG9naWM6IExvZ2ljO1xuICBjYW1lcmE6IENhbWVyYTtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnB1dENvbnRyb2xsZXIge1xuICBiaW5kSW5wdXQoKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUlucHV0KHtcbiAgY2FudmFzLFxuICB1aSxcbiAgbG9naWMsXG4gIGNhbWVyYSxcbiAgc3RhdGUsXG4gIHVpU3RhdGUsXG4gIGJ1cyxcbiAgc2VuZE1lc3NhZ2UsXG59OiBJbnB1dERlcGVuZGVuY2llcyk6IElucHV0Q29udHJvbGxlciB7XG4gIGxldCBsYXN0VG91Y2hEaXN0YW5jZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCBwZW5kaW5nVG91Y2hUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuICBsZXQgaXNQaW5jaGluZyA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGdldFBvaW50ZXJDYW52YXNQb2ludChldmVudDogUG9pbnRlckV2ZW50KTogUG9pbnRlclBvaW50IHtcbiAgICBjb25zdCByZWN0ID0gY2FudmFzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IHNjYWxlWCA9IHJlY3Qud2lkdGggIT09IDAgPyBjYW52YXMud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgICBjb25zdCBzY2FsZVkgPSByZWN0LmhlaWdodCAhPT0gMCA/IGNhbnZhcy5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IChldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0KSAqIHNjYWxlWCxcbiAgICAgIHk6IChldmVudC5jbGllbnRZIC0gcmVjdC50b3ApICogc2NhbGVZLFxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVQb2ludGVyUGxhY2VtZW50KGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQsIHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQge1xuICAgIGNvbnN0IGNvbnRleHQgPSB1aVN0YXRlLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgPyBcIm1pc3NpbGVcIiA6IFwic2hpcFwiO1xuICAgIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgbG9naWMuaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgICAgdWkucmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9naWMuaGFuZGxlU2hpcFBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgICAgdWkudXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbkNhbnZhc1BvaW50ZXJEb3duKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBjb25zdCBjYW52YXNQb2ludCA9IGdldFBvaW50ZXJDYW52YXNQb2ludChldmVudCk7XG4gICAgY29uc3Qgd29ybGRQb2ludCA9IGNhbWVyYS5jYW52YXNUb1dvcmxkKGNhbnZhc1BvaW50KTtcbiAgICBjb25zdCBjb250ZXh0ID0gdWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcblxuICAgIGlmIChjb250ZXh0ID09PSBcInNoaXBcIiAmJiB1aVN0YXRlLnNoaXBUb29sID09PSBcInNlbGVjdFwiICYmIHN0YXRlLm1lPy53YXlwb2ludHMpIHtcbiAgICAgIGNvbnN0IHdwSW5kZXggPSBsb2dpYy5maW5kV2F5cG9pbnRBdFBvc2l0aW9uKGNhbnZhc1BvaW50KTtcbiAgICAgIGlmICh3cEluZGV4ICE9PSBudWxsKSB7XG4gICAgICAgIGxvZ2ljLmJlZ2luU2hpcERyYWcod3BJbmRleCwgY2FudmFzUG9pbnQpO1xuICAgICAgICBjYW52YXMuc2V0UG9pbnRlckNhcHR1cmUoZXZlbnQucG9pbnRlcklkKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIiAmJiB1aVN0YXRlLm1pc3NpbGVUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgICBjb25zdCBoaXQgPSBsb2dpYy5oaXRUZXN0TWlzc2lsZVJvdXRlcyhjYW52YXNQb2ludCk7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIGxvZ2ljLnNldE1pc3NpbGVTZWxlY3Rpb24oaGl0LnNlbGVjdGlvbiwgaGl0LnJvdXRlLmlkKTtcbiAgICAgICAgdWkucmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICAgICAgaWYgKGhpdC5zZWxlY3Rpb24udHlwZSA9PT0gXCJ3YXlwb2ludFwiKSB7XG4gICAgICAgICAgbG9naWMuYmVnaW5NaXNzaWxlRHJhZyhoaXQuc2VsZWN0aW9uLmluZGV4LCBjYW52YXNQb2ludCk7XG4gICAgICAgICAgY2FudmFzLnNldFBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgICAgIH1cbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgIHVpLnJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnBvaW50ZXJUeXBlID09PSBcInRvdWNoXCIpIHtcbiAgICAgIGlmIChwZW5kaW5nVG91Y2hUaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgIH1cbiAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaWYgKGlzUGluY2hpbmcpIHJldHVybjtcbiAgICAgICAgaGFuZGxlUG9pbnRlclBsYWNlbWVudChjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICAgICAgfSwgMTUwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFuZGxlUG9pbnRlclBsYWNlbWVudChjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgfVxuXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlck1vdmUoZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICAgIGNvbnN0IGRyYWdnaW5nU2hpcCA9IGxvZ2ljLmdldERyYWdnZWRXYXlwb2ludCgpICE9PSBudWxsO1xuICAgIGNvbnN0IGRyYWdnaW5nTWlzc2lsZSA9IGxvZ2ljLmdldERyYWdnZWRNaXNzaWxlV2F5cG9pbnQoKSAhPT0gbnVsbDtcbiAgICBpZiAoIWRyYWdnaW5nU2hpcCAmJiAhZHJhZ2dpbmdNaXNzaWxlKSByZXR1cm47XG5cbiAgICBjb25zdCBjYW52YXNQb2ludCA9IGdldFBvaW50ZXJDYW52YXNQb2ludChldmVudCk7XG4gICAgY29uc3Qgd29ybGRQb2ludCA9IGNhbWVyYS5jYW52YXNUb1dvcmxkKGNhbnZhc1BvaW50KTtcblxuICAgIGlmIChkcmFnZ2luZ1NoaXApIHtcbiAgICAgIGxvZ2ljLnVwZGF0ZVNoaXBEcmFnKHdvcmxkUG9pbnQpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoZHJhZ2dpbmdNaXNzaWxlKSB7XG4gICAgICBsb2dpYy51cGRhdGVNaXNzaWxlRHJhZyh3b3JsZFBvaW50KTtcbiAgICAgIHVpLnJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlclVwKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBsb2dpYy5lbmREcmFnKCk7XG4gICAgaWYgKGNhbnZhcy5oYXNQb2ludGVyQ2FwdHVyZShldmVudC5wb2ludGVySWQpKSB7XG4gICAgICBjYW52YXMucmVsZWFzZVBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgfVxuICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gb25DYW52YXNXaGVlbChldmVudDogV2hlZWxFdmVudCk6IHZvaWQge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgcmVjdCA9IGNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBjZW50ZXJYID0gZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdDtcbiAgICBjb25zdCBjZW50ZXJZID0gZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wO1xuICAgIGNvbnN0IHNjYWxlWCA9IHJlY3Qud2lkdGggIT09IDAgPyBjYW52YXMud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgICBjb25zdCBzY2FsZVkgPSByZWN0LmhlaWdodCAhPT0gMCA/IGNhbnZhcy5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gICAgY29uc3QgY2FudmFzQ2VudGVyWCA9IGNlbnRlclggKiBzY2FsZVg7XG4gICAgY29uc3QgY2FudmFzQ2VudGVyWSA9IGNlbnRlclkgKiBzY2FsZVk7XG4gICAgY29uc3QgZGVsdGEgPSBldmVudC5kZWx0YVk7XG4gICAgY29uc3Qgem9vbUZhY3RvciA9IGRlbHRhID4gMCA/IDAuOSA6IDEuMTtcbiAgICBjb25zdCBuZXdab29tID0gdWlTdGF0ZS56b29tICogem9vbUZhY3RvcjtcbiAgICBjYW1lcmEuc2V0Wm9vbShuZXdab29tLCBjYW52YXNDZW50ZXJYLCBjYW52YXNDZW50ZXJZKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFRvdWNoRGlzdGFuY2UodG91Y2hlczogVG91Y2hMaXN0KTogbnVtYmVyIHwgbnVsbCB7XG4gICAgaWYgKHRvdWNoZXMubGVuZ3RoIDwgMikgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgZHggPSB0b3VjaGVzWzBdLmNsaWVudFggLSB0b3VjaGVzWzFdLmNsaWVudFg7XG4gICAgY29uc3QgZHkgPSB0b3VjaGVzWzBdLmNsaWVudFkgLSB0b3VjaGVzWzFdLmNsaWVudFk7XG4gICAgcmV0dXJuIE1hdGguaHlwb3QoZHgsIGR5KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFRvdWNoQ2VudGVyKHRvdWNoZXM6IFRvdWNoTGlzdCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB8IG51bGwge1xuICAgIGlmICh0b3VjaGVzLmxlbmd0aCA8IDIpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICB4OiAodG91Y2hlc1swXS5jbGllbnRYICsgdG91Y2hlc1sxXS5jbGllbnRYKSAvIDIsXG4gICAgICB5OiAodG91Y2hlc1swXS5jbGllbnRZICsgdG91Y2hlc1sxXS5jbGllbnRZKSAvIDIsXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzVG91Y2hTdGFydChldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICAgIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCA9PT0gMikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGlzUGluY2hpbmcgPSB0cnVlO1xuICAgICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBnZXRUb3VjaERpc3RhbmNlKGV2ZW50LnRvdWNoZXMpO1xuICAgICAgaWYgKHBlbmRpbmdUb3VjaFRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHBlbmRpbmdUb3VjaFRpbWVvdXQpO1xuICAgICAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gbnVsbDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbkNhbnZhc1RvdWNoTW92ZShldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICAgIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCAhPT0gMikge1xuICAgICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBudWxsO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGN1cnJlbnREaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG4gICAgaWYgKGN1cnJlbnREaXN0YW5jZSA9PT0gbnVsbCB8fCBsYXN0VG91Y2hEaXN0YW5jZSA9PT0gbnVsbCkgcmV0dXJuO1xuICAgIGNvbnN0IHJlY3QgPSBjYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3QgY2VudGVyID0gZ2V0VG91Y2hDZW50ZXIoZXZlbnQudG91Y2hlcyk7XG4gICAgaWYgKCFjZW50ZXIpIHJldHVybjtcbiAgICBjb25zdCBzY2FsZVggPSByZWN0LndpZHRoICE9PSAwID8gY2FudmFzLndpZHRoIC8gcmVjdC53aWR0aCA6IDE7XG4gICAgY29uc3Qgc2NhbGVZID0gcmVjdC5oZWlnaHQgIT09IDAgPyBjYW52YXMuaGVpZ2h0IC8gcmVjdC5oZWlnaHQgOiAxO1xuICAgIGNvbnN0IGNhbnZhc0NlbnRlclggPSAoY2VudGVyLnggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICAgIGNvbnN0IGNhbnZhc0NlbnRlclkgPSAoY2VudGVyLnkgLSByZWN0LnRvcCkgKiBzY2FsZVk7XG4gICAgY29uc3Qgem9vbUZhY3RvciA9IGN1cnJlbnREaXN0YW5jZSAvIGxhc3RUb3VjaERpc3RhbmNlO1xuICAgIGNvbnN0IG5ld1pvb20gPSB1aVN0YXRlLnpvb20gKiB6b29tRmFjdG9yO1xuICAgIGNhbWVyYS5zZXRab29tKG5ld1pvb20sIGNhbnZhc0NlbnRlclgsIGNhbnZhc0NlbnRlclkpO1xuICAgIGxhc3RUb3VjaERpc3RhbmNlID0gY3VycmVudERpc3RhbmNlO1xuICB9XG5cbiAgZnVuY3Rpb24gb25DYW52YXNUb3VjaEVuZChldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICAgIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCA8IDIpIHtcbiAgICAgIGxhc3RUb3VjaERpc3RhbmNlID0gbnVsbDtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpc1BpbmNoaW5nID0gZmFsc2U7XG4gICAgICB9LCAxMDApO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUFkZE1pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJhZGRfbWlzc2lsZV9yb3V0ZVwiIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gb25XaW5kb3dLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgaXNFZGl0YWJsZSA9XG4gICAgICAhIXRhcmdldCAmJlxuICAgICAgKHRhcmdldC50YWdOYW1lID09PSBcIklOUFVUXCIgfHxcbiAgICAgICAgdGFyZ2V0LnRhZ05hbWUgPT09IFwiVEVYVEFSRUFcIiB8fFxuICAgICAgICB0YXJnZXQuaXNDb250ZW50RWRpdGFibGUpO1xuXG4gICAgaWYgKHVpU3RhdGUuaGVscFZpc2libGUgJiYgZXZlbnQua2V5ICE9PSBcIkVzY2FwZVwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChpc0VkaXRhYmxlKSB7XG4gICAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XG4gICAgICAgIHRhcmdldC5ibHVyKCk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc3dpdGNoIChldmVudC5jb2RlKSB7XG4gICAgICBjYXNlIFwiRGlnaXQxXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJEaWdpdDJcIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIktleVRcIjpcbiAgICAgICAgaWYgKHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNldFwiKSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcInNoaXAtc2VsZWN0XCIpO1xuICAgICAgICB9IGVsc2UgaWYgKHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVpLnNldEFjdGl2ZVRvb2woXCJzaGlwLXNldFwiKTtcbiAgICAgICAgfVxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiS2V5Q1wiOlxuICAgICAgY2FzZSBcIktleUhcIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgICAgbG9naWMuY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIkJyYWNrZXRMZWZ0XCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIHVpLmFkanVzdFNoaXBTcGVlZCgtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiQnJhY2tldFJpZ2h0XCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIHVpLmFkanVzdFNoaXBTcGVlZCgxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJUYWJcIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgICAgbG9naWMuY3ljbGVTaGlwU2VsZWN0aW9uKGV2ZW50LnNoaWZ0S2V5ID8gLTEgOiAxKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIktleU5cIjpcbiAgICAgICAgaGFuZGxlQWRkTWlzc2lsZVJvdXRlKCk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJLZXlMXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIGxvZ2ljLmxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiS2V5RVwiOlxuICAgICAgICBpZiAodWlTdGF0ZS5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2V0XCIpIHtcbiAgICAgICAgICB1aS5zZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZWxlY3RcIik7XG4gICAgICAgIH0gZWxzZSBpZiAodWlTdGF0ZS5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2VsZWN0XCIpIHtcbiAgICAgICAgICB1aS5zZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2V0XCIpO1xuICAgICAgICB9XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJDb21tYVwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgICB1aS5hZGp1c3RNaXNzaWxlQWdybygtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiUGVyaW9kXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIHVpLmFkanVzdE1pc3NpbGVBZ3JvKDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIlNlbWljb2xvblwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgICB1aS5hZGp1c3RNaXNzaWxlU3BlZWQoLTEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIlF1b3RlXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIHVpLmFkanVzdE1pc3NpbGVTcGVlZCgxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJEZWxldGVcIjpcbiAgICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgICAgaWYgKHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIiAmJiBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCkpIHtcbiAgICAgICAgICBsb2dpYy5kZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgICB9IGVsc2UgaWYgKGxvZ2ljLmdldFNlbGVjdGlvbigpKSB7XG4gICAgICAgICAgbG9naWMuZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgICAgfVxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiRXNjYXBlXCI6IHtcbiAgICAgICAgaWYgKHVpU3RhdGUuaGVscFZpc2libGUpIHtcbiAgICAgICAgICB1aS5zZXRIZWxwVmlzaWJsZShmYWxzZSk7XG4gICAgICAgIH0gZWxzZSBpZiAobG9naWMuZ2V0TWlzc2lsZVNlbGVjdGlvbigpKSB7XG4gICAgICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgICAgfSBlbHNlIGlmIChsb2dpYy5nZXRTZWxlY3Rpb24oKSkge1xuICAgICAgICAgIGxvZ2ljLnNldFNlbGVjdGlvbihudWxsKTtcbiAgICAgICAgfSBlbHNlIGlmICh1aVN0YXRlLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIpIHtcbiAgICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgICB9XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJFcXVhbFwiOlxuICAgICAgY2FzZSBcIk51bXBhZEFkZFwiOiB7XG4gICAgICAgIGNvbnN0IGNlbnRlclggPSBjYW52YXMud2lkdGggLyAyO1xuICAgICAgICBjb25zdCBjZW50ZXJZID0gY2FudmFzLmhlaWdodCAvIDI7XG4gICAgICAgIGNhbWVyYS5zZXRab29tKHVpU3RhdGUuem9vbSAqIDEuMiwgY2VudGVyWCwgY2VudGVyWSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJNaW51c1wiOlxuICAgICAgY2FzZSBcIk51bXBhZFN1YnRyYWN0XCI6IHtcbiAgICAgICAgY29uc3QgY2VudGVyWCA9IGNhbnZhcy53aWR0aCAvIDI7XG4gICAgICAgIGNvbnN0IGNlbnRlclkgPSBjYW52YXMuaGVpZ2h0IC8gMjtcbiAgICAgICAgY2FtZXJhLnNldFpvb20odWlTdGF0ZS56b29tIC8gMS4yLCBjZW50ZXJYLCBjZW50ZXJZKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY2FzZSBcIkRpZ2l0MFwiOlxuICAgICAgY2FzZSBcIk51bXBhZDBcIjpcbiAgICAgICAgaWYgKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSkge1xuICAgICAgICAgIGNhbWVyYS5zZXRab29tKDEuMCk7XG4gICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgICAgdWkuc2V0SGVscFZpc2libGUoIXVpU3RhdGUuaGVscFZpc2libGUpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBiaW5kSW5wdXQoKTogdm9pZCB7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCBvbkNhbnZhc1BvaW50ZXJEb3duKTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJtb3ZlXCIsIG9uQ2FudmFzUG9pbnRlck1vdmUpO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIG9uQ2FudmFzUG9pbnRlclVwKTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJjYW5jZWxcIiwgb25DYW52YXNQb2ludGVyVXApO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwid2hlZWxcIiwgb25DYW52YXNXaGVlbCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgb25DYW52YXNUb3VjaFN0YXJ0LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIG9uQ2FudmFzVG91Y2hNb3ZlLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgb25DYW52YXNUb3VjaEVuZCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgb25XaW5kb3dLZXlEb3duLCB7IGNhcHR1cmU6IGZhbHNlIH0pO1xuXG4gICAgYnVzLm9uKFwiY29udGV4dDpjaGFuZ2VkXCIsICgpID0+IHtcbiAgICAgIGlmIChwZW5kaW5nVG91Y2hUaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgICAgcGVuZGluZ1RvdWNoVGltZW91dCA9IG51bGw7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJpbmRJbnB1dCxcbiAgfTtcbn1cbiIsICIvLyBTaGFyZWQgcm91dGUgcGxhbm5pbmcgbW9kdWxlIGZvciBzaGlwcyBhbmQgbWlzc2lsZXNcbi8vIFBoYXNlIDE6IFNoYXJlZCBNb2RlbCAmIEhlbHBlcnNcblxuaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUeXBlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgc3BlZWQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUm91dGVQb2ludHMge1xuICB3YXlwb2ludHM6IFJvdXRlV2F5cG9pbnRbXTtcbiAgd29ybGRQb2ludHM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xuICBjYW52YXNQb2ludHM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBDb25zdGFudHNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGNvbnN0IFdBWVBPSU5UX0hJVF9SQURJVVMgPSAxMjtcbmV4cG9ydCBjb25zdCBMRUdfSElUX0RJU1RBTkNFID0gMTA7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEJ1aWxkZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQnVpbGRzIHJvdXRlIHBvaW50cyBmcm9tIGEgc3RhcnQgcG9zaXRpb24gYW5kIHdheXBvaW50cy5cbiAqIEluY2x1ZGVzIHdvcmxkIGNvb3JkaW5hdGVzICh3cmFwcGluZykgYW5kIGNhbnZhcyBjb29yZGluYXRlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUm91dGVQb2ludHMoXG4gIHN0YXJ0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gIHdheXBvaW50czogUm91dGVXYXlwb2ludFtdLFxuICB3b3JsZDogeyB3OiBudW1iZXI7IGg6IG51bWJlciB9LFxuICBjYW1lcmE6ICgpID0+IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSxcbiAgem9vbTogKCkgPT4gbnVtYmVyLFxuICB3b3JsZFRvQ2FudmFzOiAocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KSA9PiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1cbik6IFJvdXRlUG9pbnRzIHtcbiAgY29uc3Qgd29ybGRQb2ludHM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdID0gW3sgeDogc3RhcnQueCwgeTogc3RhcnQueSB9XTtcblxuICBmb3IgKGNvbnN0IHdwIG9mIHdheXBvaW50cykge1xuICAgIHdvcmxkUG9pbnRzLnB1c2goeyB4OiB3cC54LCB5OiB3cC55IH0pO1xuICB9XG5cbiAgY29uc3QgY2FudmFzUG9pbnRzID0gd29ybGRQb2ludHMubWFwKChwb2ludCkgPT4gd29ybGRUb0NhbnZhcyhwb2ludCkpO1xuXG4gIHJldHVybiB7XG4gICAgd2F5cG9pbnRzOiB3YXlwb2ludHMuc2xpY2UoKSxcbiAgICB3b3JsZFBvaW50cyxcbiAgICBjYW52YXNQb2ludHMsXG4gIH07XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEdlb21ldHJ5IC8gSGl0LXRlc3Rcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkaXN0YW5jZSBmcm9tIGEgcG9pbnQgdG8gYSBsaW5lIHNlZ21lbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwb2ludFNlZ21lbnREaXN0YW5jZShcbiAgcDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICBhOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gIGI6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVxuKTogbnVtYmVyIHtcbiAgY29uc3QgYWJ4ID0gYi54IC0gYS54O1xuICBjb25zdCBhYnkgPSBiLnkgLSBhLnk7XG4gIGNvbnN0IGFweCA9IHAueCAtIGEueDtcbiAgY29uc3QgYXB5ID0gcC55IC0gYS55O1xuICBjb25zdCBhYkxlblNxID0gYWJ4ICogYWJ4ICsgYWJ5ICogYWJ5O1xuICBjb25zdCB0ID0gYWJMZW5TcSA9PT0gMCA/IDAgOiBjbGFtcChhcHggKiBhYnggKyBhcHkgKiBhYnksIDAsIGFiTGVuU3EpIC8gYWJMZW5TcTtcbiAgY29uc3QgcHJvanggPSBhLnggKyBhYnggKiB0O1xuICBjb25zdCBwcm9qeSA9IGEueSArIGFieSAqIHQ7XG4gIGNvbnN0IGR4ID0gcC54IC0gcHJvang7XG4gIGNvbnN0IGR5ID0gcC55IC0gcHJvank7XG4gIHJldHVybiBNYXRoLmh5cG90KGR4LCBkeSk7XG59XG5cbi8qKlxuICogSGl0LXRlc3RzIGEgcm91dGUgYWdhaW5zdCBhIGNhbnZhcyBwb2ludC5cbiAqIFJldHVybnMgdGhlIGhpdCB0eXBlIGFuZCBpbmRleCwgb3IgbnVsbCBpZiBubyBoaXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoaXRUZXN0Um91dGVHZW5lcmljKFxuICBjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICByb3V0ZVBvaW50czogUm91dGVQb2ludHMsXG4gIG9wdHM6IHtcbiAgICB3YXlwb2ludEhpdFJhZGl1cz86IG51bWJlcjtcbiAgICBsZWdIaXREaXN0YW5jZT86IG51bWJlcjtcbiAgICBza2lwTGVncz86IGJvb2xlYW47XG4gIH0gPSB7fVxuKTogeyB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiOyBpbmRleDogbnVtYmVyIH0gfCBudWxsIHtcbiAgY29uc3Qgd2F5cG9pbnRIaXRSYWRpdXMgPSBvcHRzLndheXBvaW50SGl0UmFkaXVzID8/IFdBWVBPSU5UX0hJVF9SQURJVVM7XG4gIGNvbnN0IGxlZ0hpdERpc3RhbmNlID0gb3B0cy5sZWdIaXREaXN0YW5jZSA/PyBMRUdfSElUX0RJU1RBTkNFO1xuICBjb25zdCBza2lwTGVncyA9IG9wdHMuc2tpcExlZ3MgPz8gZmFsc2U7XG5cbiAgY29uc3QgeyB3YXlwb2ludHMsIGNhbnZhc1BvaW50cyB9ID0gcm91dGVQb2ludHM7XG5cbiAgaWYgKHdheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIENoZWNrIHdheXBvaW50cyBmaXJzdCAoaGlnaGVyIHByaW9yaXR5IHRoYW4gbGVncylcbiAgLy8gU2tpcCBpbmRleCAwIHdoaWNoIGlzIHRoZSBzdGFydCBwb3NpdGlvblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwQ2FudmFzID0gY2FudmFzUG9pbnRzW2kgKyAxXTsgLy8gKzEgYmVjYXVzZSBmaXJzdCBwb2ludCBpcyBzdGFydCBwb3NpdGlvblxuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdwQ2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd3BDYW52YXMueTtcbiAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpIDw9IHdheXBvaW50SGl0UmFkaXVzKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgbGVncyAobG93ZXIgcHJpb3JpdHkpXG4gIGlmICghc2tpcExlZ3MpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgZGlzdCA9IHBvaW50U2VnbWVudERpc3RhbmNlKGNhbnZhc1BvaW50LCBjYW52YXNQb2ludHNbaV0sIGNhbnZhc1BvaW50c1tpICsgMV0pO1xuICAgICAgaWYgKGRpc3QgPD0gbGVnSGl0RGlzdGFuY2UpIHtcbiAgICAgICAgcmV0dXJuIHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IGkgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRGFzaCBBbmltYXRpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBVcGRhdGVzIGRhc2ggb2Zmc2V0cyBmb3Igcm91dGUgbGVncyB0byBjcmVhdGUgbWFyY2hpbmcgYW50cyBhbmltYXRpb24uXG4gKiBNdXRhdGVzIHRoZSBwcm92aWRlZCBzdG9yZSBtYXAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlKFxuICBzdG9yZTogTWFwPG51bWJlciwgbnVtYmVyPixcbiAgd2F5cG9pbnRzOiBBcnJheTx7IHNwZWVkPzogbnVtYmVyIH0+LFxuICB3b3JsZFBvaW50czogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlciB9PixcbiAgY2FudmFzUG9pbnRzOiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0+LFxuICBmYWxsYmFja1NwZWVkOiBudW1iZXIsXG4gIGR0U2Vjb25kczogbnVtYmVyLFxuICBjeWNsZSA9IDY0XG4pOiB2b2lkIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPCAwKSB7XG4gICAgZHRTZWNvbmRzID0gMDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3AgPSB3YXlwb2ludHNbaV07XG4gICAgY29uc3Qgc3BlZWQgPSB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgJiYgd3Auc3BlZWQgPiAwID8gd3Auc3BlZWQgOiBmYWxsYmFja1NwZWVkO1xuICAgIGNvbnN0IGFXb3JsZCA9IHdvcmxkUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJXb3JsZCA9IHdvcmxkUG9pbnRzW2kgKyAxXTtcbiAgICBjb25zdCB3b3JsZERpc3QgPSBNYXRoLmh5cG90KGJXb3JsZC54IC0gYVdvcmxkLngsIGJXb3JsZC55IC0gYVdvcmxkLnkpO1xuICAgIGNvbnN0IGFDYW52YXMgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3QgYkNhbnZhcyA9IGNhbnZhc1BvaW50c1tpICsgMV07XG4gICAgY29uc3QgY2FudmFzRGlzdCA9IE1hdGguaHlwb3QoYkNhbnZhcy54IC0gYUNhbnZhcy54LCBiQ2FudmFzLnkgLSBhQ2FudmFzLnkpO1xuXG4gICAgaWYgKFxuICAgICAgIU51bWJlci5pc0Zpbml0ZShzcGVlZCkgfHxcbiAgICAgIHNwZWVkIDw9IDFlLTMgfHxcbiAgICAgICFOdW1iZXIuaXNGaW5pdGUod29ybGREaXN0KSB8fFxuICAgICAgd29ybGREaXN0IDw9IDFlLTMgfHxcbiAgICAgIGNhbnZhc0Rpc3QgPD0gMWUtM1xuICAgICkge1xuICAgICAgc3RvcmUuc2V0KGksIDApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGR0U2Vjb25kcyA8PSAwKSB7XG4gICAgICBpZiAoIXN0b3JlLmhhcyhpKSkge1xuICAgICAgICBzdG9yZS5zZXQoaSwgMCk7XG4gICAgICB9XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBzY2FsZSA9IGNhbnZhc0Rpc3QgLyB3b3JsZERpc3Q7XG4gICAgY29uc3QgZGFzaFNwZWVkID0gc3BlZWQgKiBzY2FsZTtcbiAgICBsZXQgbmV4dCA9IChzdG9yZS5nZXQoaSkgPz8gMCkgLSBkYXNoU3BlZWQgKiBkdFNlY29uZHM7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobmV4dCkpIHtcbiAgICAgIG5leHQgPSAwO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0ID0gKChuZXh0ICUgY3ljbGUpICsgY3ljbGUpICUgY3ljbGU7XG4gICAgfVxuICAgIHN0b3JlLnNldChpLCBuZXh0KTtcbiAgfVxuICAvLyBDbGVhbiB1cCBvbGQga2V5c1xuICBmb3IgKGNvbnN0IGtleSBvZiBBcnJheS5mcm9tKHN0b3JlLmtleXMoKSkpIHtcbiAgICBpZiAoa2V5ID49IHdheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHN0b3JlLmRlbGV0ZShrZXkpO1xuICAgIH1cbiAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBIZWF0IFByb2plY3Rpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGludGVyZmFjZSBIZWF0UHJvamVjdGlvblBhcmFtcyB7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbiAgbWF4OiBudW1iZXI7XG4gIG92ZXJoZWF0QXQ6IG51bWJlcjtcbiAgd2FybkF0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFByb2plY3Rpb25SZXN1bHQge1xuICBoZWF0QXRXYXlwb2ludHM6IG51bWJlcltdO1xuICB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47XG4gIG92ZXJoZWF0QXQ/OiBudW1iZXI7IC8vIEluZGV4IHdoZXJlIG92ZXJoZWF0IG9jY3Vyc1xufVxuXG4vKipcbiAqIFByb2plY3RzIGhlYXQgYWxvbmcgYSByb3V0ZSBnaXZlbiBpbml0aWFsIGhlYXQgYW5kIGhlYXQgcGFyYW1ldGVycy5cbiAqIFJldHVybnMgaGVhdCBhdCBlYWNoIHdheXBvaW50IGFuZCB3aGV0aGVyIG92ZXJoZWF0IHdpbGwgb2NjdXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0Um91dGVIZWF0KFxuICByb3V0ZTogUm91dGVXYXlwb2ludFtdLFxuICBpbml0aWFsSGVhdDogbnVtYmVyLFxuICBwYXJhbXM6IEhlYXRQcm9qZWN0aW9uUGFyYW1zXG4pOiBIZWF0UHJvamVjdGlvblJlc3VsdCB7XG4gIGNvbnN0IHJlc3VsdDogSGVhdFByb2plY3Rpb25SZXN1bHQgPSB7XG4gICAgaGVhdEF0V2F5cG9pbnRzOiBbXSxcbiAgICB3aWxsT3ZlcmhlYXQ6IGZhbHNlLFxuICB9O1xuXG4gIGlmIChyb3V0ZS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgbGV0IGhlYXQgPSBjbGFtcChpbml0aWFsSGVhdCwgMCwgcGFyYW1zLm1heCk7XG4gIGxldCBwcmV2UG9pbnQgPSB7IHg6IHJvdXRlWzBdLngsIHk6IHJvdXRlWzBdLnkgfTtcblxuICByZXN1bHQuaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCByb3V0ZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHRhcmdldFBvcyA9IHJvdXRlW2ldO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGRpc3RhbmNlIGFuZCB0aW1lXG4gICAgY29uc3QgZHggPSB0YXJnZXRQb3MueCAtIHByZXZQb2ludC54O1xuICAgIGNvbnN0IGR5ID0gdGFyZ2V0UG9zLnkgLSBwcmV2UG9pbnQueTtcbiAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG5cbiAgICBpZiAoZGlzdGFuY2UgPCAwLjAwMSkge1xuICAgICAgcmVzdWx0LmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuICAgICAgcHJldlBvaW50ID0geyB4OiB0YXJnZXRQb3MueCwgeTogdGFyZ2V0UG9zLnkgfTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHJhd1NwZWVkID0gdGFyZ2V0UG9zLnNwZWVkID8/IHBhcmFtcy5tYXJrZXJTcGVlZDtcbiAgICBjb25zdCBzZWdtZW50U3BlZWQgPSBNYXRoLm1heChyYXdTcGVlZCwgMC4wMDAwMDEpO1xuICAgIGNvbnN0IHNlZ21lbnRUaW1lID0gZGlzdGFuY2UgLyBzZWdtZW50U3BlZWQ7XG5cbiAgICAvLyBDYWxjdWxhdGUgaGVhdCByYXRlIChtYXRjaCBzZXJ2ZXIgZm9ybXVsYSlcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KHBhcmFtcy5tYXJrZXJTcGVlZCwgMC4wMDAwMDEpO1xuICAgIGNvbnN0IGRldiA9IHNlZ21lbnRTcGVlZCAtIHBhcmFtcy5tYXJrZXJTcGVlZDtcbiAgICBjb25zdCBwID0gcGFyYW1zLmV4cDtcblxuICAgIGxldCBoZG90OiBudW1iZXI7XG4gICAgaWYgKGRldiA+PSAwKSB7XG4gICAgICAvLyBIZWF0aW5nXG4gICAgICBoZG90ID0gcGFyYW1zLmtVcCAqIE1hdGgucG93KGRldiAvIFZuLCBwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ29vbGluZ1xuICAgICAgaGRvdCA9IC1wYXJhbXMua0Rvd24gKiBNYXRoLnBvdyhNYXRoLmFicyhkZXYpIC8gVm4sIHApO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBoZWF0XG4gICAgaGVhdCArPSBoZG90ICogc2VnbWVudFRpbWU7XG4gICAgaGVhdCA9IGNsYW1wKGhlYXQsIDAsIHBhcmFtcy5tYXgpO1xuXG4gICAgcmVzdWx0LmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuXG4gICAgLy8gQ2hlY2sgZm9yIG92ZXJoZWF0XG4gICAgaWYgKCFyZXN1bHQud2lsbE92ZXJoZWF0ICYmIGhlYXQgPj0gcGFyYW1zLm92ZXJoZWF0QXQpIHtcbiAgICAgIHJlc3VsdC53aWxsT3ZlcmhlYXQgPSB0cnVlO1xuICAgICAgcmVzdWx0Lm92ZXJoZWF0QXQgPSBpO1xuICAgIH1cblxuICAgIHByZXZQb2ludCA9IHsgeDogdGFyZ2V0UG9zLngsIHk6IHRhcmdldFBvcy55IH07XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIENvbXBhdGliaWxpdHkgd3JhcHBlciBmb3IgbWlzc2lsZSBoZWF0IHByb2plY3Rpb24uXG4gKiBNaXNzaWxlcyBzdGFydCBhdCB6ZXJvIGhlYXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0TWlzc2lsZUhlYXRDb21wYXQoXG4gIHJvdXRlOiBSb3V0ZVdheXBvaW50W10sXG4gIGRlZmF1bHRTcGVlZDogbnVtYmVyLFxuICBoZWF0UGFyYW1zOiBIZWF0UHJvamVjdGlvblBhcmFtc1xuKTogSGVhdFByb2plY3Rpb25SZXN1bHQge1xuICAvLyBNaXNzaWxlcyBzdGFydCBhdCB6ZXJvIGhlYXRcbiAgLy8gRW5zdXJlIGFsbCB3YXlwb2ludHMgaGF2ZSBzcGVlZCBzZXQgKHVzZSBkZWZhdWx0IGlmIG1pc3NpbmcpXG4gIGNvbnN0IHJvdXRlV2l0aFNwZWVkID0gcm91dGUubWFwKCh3cCkgPT4gKHtcbiAgICB4OiB3cC54LFxuICAgIHk6IHdwLnksXG4gICAgc3BlZWQ6IHdwLnNwZWVkID8/IGRlZmF1bHRTcGVlZCxcbiAgfSkpO1xuXG4gIHJldHVybiBwcm9qZWN0Um91dGVIZWF0KHJvdXRlV2l0aFNwZWVkLCAwLCBoZWF0UGFyYW1zKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUmVuZGVyaW5nXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogTGluZWFyIGNvbG9yIGludGVycG9sYXRpb24gYmV0d2VlbiB0d28gUkdCIGNvbG9ycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGludGVycG9sYXRlQ29sb3IoXG4gIGNvbG9yMTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuICBjb2xvcjI6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcbiAgdDogbnVtYmVyXG4pOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0ge1xuICByZXR1cm4gW1xuICAgIE1hdGgucm91bmQoY29sb3IxWzBdICsgKGNvbG9yMlswXSAtIGNvbG9yMVswXSkgKiB0KSxcbiAgICBNYXRoLnJvdW5kKGNvbG9yMVsxXSArIChjb2xvcjJbMV0gLSBjb2xvcjFbMV0pICogdCksXG4gICAgTWF0aC5yb3VuZChjb2xvcjFbMl0gKyAoY29sb3IyWzJdIC0gY29sb3IxWzJdKSAqIHQpLFxuICBdO1xufVxuXG4vKipcbiAqIENvbG9yIHBhbGV0dGUgZm9yIHJvdXRlIHJlbmRlcmluZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBSb3V0ZVBhbGV0dGUge1xuICAvLyBEZWZhdWx0IGxpbmUgY29sb3IgKHdoZW4gbm8gaGVhdCBkYXRhKVxuICBkZWZhdWx0TGluZTogc3RyaW5nO1xuICAvLyBTZWxlY3Rpb24gaGlnaGxpZ2h0IGNvbG9yXG4gIHNlbGVjdGlvbjogc3RyaW5nO1xuICAvLyBXYXlwb2ludCBjb2xvcnNcbiAgd2F5cG9pbnREZWZhdWx0OiBzdHJpbmc7XG4gIHdheXBvaW50U2VsZWN0ZWQ6IHN0cmluZztcbiAgd2F5cG9pbnREcmFnZ2luZz86IHN0cmluZztcbiAgd2F5cG9pbnRTdHJva2U6IHN0cmluZztcbiAgd2F5cG9pbnRTdHJva2VTZWxlY3RlZD86IHN0cmluZztcbiAgLy8gSGVhdCBncmFkaWVudCBjb2xvcnMgKGZyb20gY29vbCB0byBob3QpXG4gIGhlYXRDb29sUmdiPzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuICBoZWF0SG90UmdiPzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xufVxuXG4vKipcbiAqIERlZmF1bHQgc2hpcCBwYWxldHRlIChibHVlIHRoZW1lKS5cbiAqL1xuZXhwb3J0IGNvbnN0IFNISVBfUEFMRVRURTogUm91dGVQYWxldHRlID0ge1xuICBkZWZhdWx0TGluZTogXCIjMzhiZGY4XCIsXG4gIHNlbGVjdGlvbjogXCIjZjk3MzE2XCIsXG4gIHdheXBvaW50RGVmYXVsdDogXCIjMzhiZGY4XCIsXG4gIHdheXBvaW50U2VsZWN0ZWQ6IFwiI2Y5NzMxNlwiLFxuICB3YXlwb2ludERyYWdnaW5nOiBcIiNmYWNjMTVcIixcbiAgd2F5cG9pbnRTdHJva2U6IFwiIzBmMTcyYVwiLFxuICBoZWF0Q29vbFJnYjogWzEwMCwgMTUwLCAyNTVdLFxuICBoZWF0SG90UmdiOiBbMjU1LCA1MCwgNTBdLFxufTtcblxuLyoqXG4gKiBNaXNzaWxlIHBhbGV0dGUgKHJlZCB0aGVtZSkuXG4gKi9cbmV4cG9ydCBjb25zdCBNSVNTSUxFX1BBTEVUVEU6IFJvdXRlUGFsZXR0ZSA9IHtcbiAgZGVmYXVsdExpbmU6IFwiI2Y4NzE3MWFhXCIsXG4gIHNlbGVjdGlvbjogXCIjZjk3MzE2XCIsXG4gIHdheXBvaW50RGVmYXVsdDogXCIjZjg3MTcxXCIsXG4gIHdheXBvaW50U2VsZWN0ZWQ6IFwiI2ZhY2MxNVwiLFxuICB3YXlwb2ludFN0cm9rZTogXCIjN2YxZDFkXCIsXG4gIHdheXBvaW50U3Ryb2tlU2VsZWN0ZWQ6IFwiIzg1NGQwZVwiLFxuICBoZWF0Q29vbFJnYjogWzI0OCwgMTI5LCAxMjldLFxuICBoZWF0SG90UmdiOiBbMjIwLCAzOCwgMzhdLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBEcmF3UGxhbm5lZFJvdXRlT3B0aW9ucyB7XG4gIC8vIENhbnZhcyBwb2ludHMgZm9yIHRoZSByb3V0ZVxuICByb3V0ZVBvaW50czogUm91dGVQb2ludHM7XG4gIC8vIFNlbGVjdGlvbiBzdGF0ZSAod2hpY2ggd2F5cG9pbnQvbGVnIGlzIHNlbGVjdGVkKVxuICBzZWxlY3Rpb246IHsgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjsgaW5kZXg6IG51bWJlciB9IHwgbnVsbDtcbiAgLy8gRHJhZ2dlZCB3YXlwb2ludCBpbmRleCAoZm9yIGRyYWctYW5kLWRyb3ApXG4gIGRyYWdnZWRXYXlwb2ludD86IG51bWJlciB8IG51bGw7XG4gIC8vIERhc2ggYW5pbWF0aW9uIG9mZnNldHNcbiAgZGFzaFN0b3JlOiBNYXA8bnVtYmVyLCBudW1iZXI+O1xuICAvLyBDb2xvciBwYWxldHRlIChkZWZhdWx0cyB0byBzaGlwIHBhbGV0dGUpXG4gIHBhbGV0dGU/OiBSb3V0ZVBhbGV0dGU7XG4gIC8vIFdoZXRoZXIgdG8gc2hvdyB0aGUgcm91dGUgbGVnc1xuICBzaG93TGVnczogYm9vbGVhbjtcbiAgLy8gSGVhdCBwYXJhbWV0ZXJzIGFuZCBpbml0aWFsIGhlYXQgKG9wdGlvbmFsKVxuICBoZWF0UGFyYW1zPzogSGVhdFByb2plY3Rpb25QYXJhbXM7XG4gIGluaXRpYWxIZWF0PzogbnVtYmVyO1xuICAvLyBEZWZhdWx0IHNwZWVkIGZvciB3YXlwb2ludHMgd2l0aG91dCBzcGVlZCBzZXRcbiAgZGVmYXVsdFNwZWVkOiBudW1iZXI7XG4gIC8vIFdvcmxkIHBvaW50cyAoZm9yIGhlYXQgY2FsY3VsYXRpb24pXG4gIHdvcmxkUG9pbnRzPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9W107XG59XG5cbi8qKlxuICogRHJhd3MgYSBwbGFubmVkIHJvdXRlIChzaGlwIG9yIG1pc3NpbGUpIHdpdGggdW5pZmllZCB2aXN1YWxzLlxuICogVXNlcyBzaGlwLXN0eWxlIHJlbmRlcmluZyBieSBkZWZhdWx0LCB3aXRoIG9wdGlvbmFsIHBhbGV0dGUgb3ZlcnJpZGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkcmF3UGxhbm5lZFJvdXRlKFxuICBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcbiAgb3B0czogRHJhd1BsYW5uZWRSb3V0ZU9wdGlvbnNcbik6IHZvaWQge1xuICBjb25zdCB7XG4gICAgcm91dGVQb2ludHMsXG4gICAgc2VsZWN0aW9uLFxuICAgIGRyYWdnZWRXYXlwb2ludCxcbiAgICBkYXNoU3RvcmUsXG4gICAgcGFsZXR0ZSA9IFNISVBfUEFMRVRURSxcbiAgICBzaG93TGVncyxcbiAgICBoZWF0UGFyYW1zLFxuICAgIGluaXRpYWxIZWF0ID0gMCxcbiAgICBkZWZhdWx0U3BlZWQsXG4gICAgd29ybGRQb2ludHMsXG4gIH0gPSBvcHRzO1xuXG4gIGNvbnN0IHsgd2F5cG9pbnRzLCBjYW52YXNQb2ludHMgfSA9IHJvdXRlUG9pbnRzO1xuXG4gIGlmICh3YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQ2FsY3VsYXRlIGhlYXQgcHJvamVjdGlvbiBpZiBoZWF0IHBhcmFtcyBhdmFpbGFibGVcbiAgbGV0IGhlYXRQcm9qZWN0aW9uOiBIZWF0UHJvamVjdGlvblJlc3VsdCB8IG51bGwgPSBudWxsO1xuICBpZiAoaGVhdFBhcmFtcyAmJiB3b3JsZFBvaW50cyAmJiB3b3JsZFBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3Qgcm91dGVGb3JIZWF0OiBSb3V0ZVdheXBvaW50W10gPSB3b3JsZFBvaW50cy5tYXAoKHB0LCBpKSA9PiAoe1xuICAgICAgeDogcHQueCxcbiAgICAgIHk6IHB0LnksXG4gICAgICBzcGVlZDogaSA9PT0gMCA/IHVuZGVmaW5lZCA6IHdheXBvaW50c1tpIC0gMV0/LnNwZWVkID8/IGRlZmF1bHRTcGVlZCxcbiAgICB9KSk7XG4gICAgaGVhdFByb2plY3Rpb24gPSBwcm9qZWN0Um91dGVIZWF0KHJvdXRlRm9ySGVhdCwgaW5pdGlhbEhlYXQsIGhlYXRQYXJhbXMpO1xuICB9XG5cbiAgLy8gRHJhdyByb3V0ZSBzZWdtZW50c1xuICBpZiAoc2hvd0xlZ3MpIHtcbiAgICBsZXQgY3VycmVudEhlYXQgPSBpbml0aWFsSGVhdDtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBpc0ZpcnN0TGVnID0gaSA9PT0gMDtcbiAgICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3Rpb24/LnR5cGUgPT09IFwibGVnXCIgJiYgc2VsZWN0aW9uLmluZGV4ID09PSBpO1xuXG4gICAgICAvLyBHZXQgaGVhdCBhdCBlbmQgb2YgdGhpcyBzZWdtZW50XG4gICAgICBsZXQgc2VnbWVudEhlYXQgPSBjdXJyZW50SGVhdDtcbiAgICAgIGlmIChoZWF0UHJvamVjdGlvbiAmJiBpICsgMSA8IGhlYXRQcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgICAgc2VnbWVudEhlYXQgPSBoZWF0UHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHNbaSArIDFdO1xuICAgICAgfVxuXG4gICAgICAvLyBDYWxjdWxhdGUgaGVhdC1iYXNlZCBjb2xvciBpZiBoZWF0IGRhdGEgYXZhaWxhYmxlXG4gICAgICBsZXQgc3Ryb2tlU3R5bGU6IHN0cmluZztcbiAgICAgIGxldCBsaW5lV2lkdGg6IG51bWJlcjtcbiAgICAgIGxldCBsaW5lRGFzaDogbnVtYmVyW10gfCBudWxsID0gbnVsbDtcbiAgICAgIGxldCBhbHBoYU92ZXJyaWRlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICAgICAgaWYgKGlzU2VsZWN0ZWQpIHtcbiAgICAgICAgLy8gU2VsZWN0aW9uIHN0eWxpbmdcbiAgICAgICAgc3Ryb2tlU3R5bGUgPSBwYWxldHRlLnNlbGVjdGlvbjtcbiAgICAgICAgbGluZVdpZHRoID0gMy41O1xuICAgICAgICBsaW5lRGFzaCA9IFs0LCA0XTtcbiAgICAgIH0gZWxzZSBpZiAoaGVhdFByb2plY3Rpb24gJiYgaGVhdFBhcmFtcyAmJiBwYWxldHRlLmhlYXRDb29sUmdiICYmIHBhbGV0dGUuaGVhdEhvdFJnYikge1xuICAgICAgICAvLyBIZWF0LWJhc2VkIGNvbG9yIGludGVycG9sYXRpb24gKHNoaXAgc3R5bGUpXG4gICAgICAgIGNvbnN0IGhlYXRSYXRpbyA9IGNsYW1wKHNlZ21lbnRIZWF0IC8gaGVhdFBhcmFtcy5vdmVyaGVhdEF0LCAwLCAxKTtcbiAgICAgICAgY29uc3QgY29sb3IgPSBpbnRlcnBvbGF0ZUNvbG9yKHBhbGV0dGUuaGVhdENvb2xSZ2IsIHBhbGV0dGUuaGVhdEhvdFJnYiwgaGVhdFJhdGlvKTtcbiAgICAgICAgY29uc3QgYmFzZVdpZHRoID0gaXNGaXJzdExlZyA/IDMgOiAxLjU7XG4gICAgICAgIGxpbmVXaWR0aCA9IGJhc2VXaWR0aCArIGhlYXRSYXRpbyAqIDQ7XG4gICAgICAgIGNvbnN0IGFscGhhID0gaXNGaXJzdExlZyA/IDEgOiAwLjQ7XG4gICAgICAgIHN0cm9rZVN0eWxlID0gYHJnYmEoJHtjb2xvclswXX0sICR7Y29sb3JbMV19LCAke2NvbG9yWzJdfSwgJHthbHBoYX0pYDtcbiAgICAgICAgbGluZURhc2ggPSBpc0ZpcnN0TGVnID8gWzYsIDZdIDogWzgsIDhdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGVmYXVsdCBzdHlsaW5nIChubyBoZWF0KVxuICAgICAgICBjb25zdCBiYXNlV2lkdGggPSBpc0ZpcnN0TGVnID8gMyA6IDEuNTtcbiAgICAgICAgbGluZVdpZHRoID0gYmFzZVdpZHRoO1xuICAgICAgICBzdHJva2VTdHlsZSA9IHBhbGV0dGUuZGVmYXVsdExpbmU7XG4gICAgICAgIGxpbmVEYXNoID0gaXNGaXJzdExlZyA/IFs2LCA2XSA6IFs4LCA4XTtcbiAgICAgICAgYWxwaGFPdmVycmlkZSA9IGlzRmlyc3RMZWcgPyAxIDogMC40O1xuICAgICAgfVxuXG4gICAgICBjdHguc2F2ZSgpO1xuICAgICAgaWYgKGxpbmVEYXNoKSB7XG4gICAgICAgIGN0eC5zZXRMaW5lRGFzaChsaW5lRGFzaCk7XG4gICAgICB9XG4gICAgICBpZiAoYWxwaGFPdmVycmlkZSAhPT0gbnVsbCkge1xuICAgICAgICBjdHguZ2xvYmFsQWxwaGEgPSBhbHBoYU92ZXJyaWRlO1xuICAgICAgfVxuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gc3Ryb2tlU3R5bGU7XG4gICAgICBjdHgubGluZVdpZHRoID0gbGluZVdpZHRoO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4LmxpbmVEYXNoT2Zmc2V0ID0gZGFzaFN0b3JlLmdldChpKSA/PyAwO1xuICAgICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbaV0ueCwgY2FudmFzUG9pbnRzW2ldLnkpO1xuICAgICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbaSArIDFdLngsIGNhbnZhc1BvaW50c1tpICsgMV0ueSk7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgICBjdXJyZW50SGVhdCA9IHNlZ21lbnRIZWF0O1xuICAgIH1cbiAgfVxuXG4gIC8vIERyYXcgd2F5cG9pbnQgbWFya2Vyc1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHB0ID0gY2FudmFzUG9pbnRzW2kgKyAxXTsgLy8gKzEgYmVjYXVzZSBmaXJzdCBwb2ludCBpcyBzdGFydCBwb3NpdGlvblxuICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3Rpb24/LnR5cGUgPT09IFwid2F5cG9pbnRcIiAmJiBzZWxlY3Rpb24uaW5kZXggPT09IGk7XG4gICAgY29uc3QgaXNEcmFnZ2luZyA9IGRyYWdnZWRXYXlwb2ludCA9PT0gaTtcblxuICAgIC8vIERldGVybWluZSBmaWxsIGNvbG9yXG4gICAgbGV0IGZpbGxDb2xvcjogc3RyaW5nO1xuICAgIGlmIChpc1NlbGVjdGVkKSB7XG4gICAgICBmaWxsQ29sb3IgPSBwYWxldHRlLndheXBvaW50U2VsZWN0ZWQ7XG4gICAgfSBlbHNlIGlmIChpc0RyYWdnaW5nICYmIHBhbGV0dGUud2F5cG9pbnREcmFnZ2luZykge1xuICAgICAgZmlsbENvbG9yID0gcGFsZXR0ZS53YXlwb2ludERyYWdnaW5nO1xuICAgIH0gZWxzZSBpZiAoaGVhdFByb2plY3Rpb24gJiYgaGVhdFBhcmFtcykge1xuICAgICAgLy8gSGVhdC1iYXNlZCB3YXlwb2ludCBjb2xvcmluZyAodGhyZXNob2xkLWJhc2VkIGZvciBtaXNzaWxlcylcbiAgICAgIGNvbnN0IGhlYXQgPSBoZWF0UHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHNbaSArIDFdID8/IDA7XG4gICAgICBjb25zdCBoZWF0UmF0aW8gPSBoZWF0IC8gaGVhdFBhcmFtcy5tYXg7XG4gICAgICBjb25zdCB3YXJuUmF0aW8gPSBoZWF0UGFyYW1zLndhcm5BdCAvIGhlYXRQYXJhbXMubWF4O1xuICAgICAgY29uc3Qgb3ZlcmhlYXRSYXRpbyA9IGhlYXRQYXJhbXMub3ZlcmhlYXRBdCAvIGhlYXRQYXJhbXMubWF4O1xuXG4gICAgICBpZiAoaGVhdFJhdGlvIDwgd2FyblJhdGlvKSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiIzMzYWEzM1wiOyAvLyBHcmVlblxuICAgICAgfSBlbHNlIGlmIChoZWF0UmF0aW8gPCBvdmVyaGVhdFJhdGlvKSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiI2ZmYWEzM1wiOyAvLyBPcmFuZ2VcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiI2ZmMzMzM1wiOyAvLyBSZWRcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZmlsbENvbG9yID0gcGFsZXR0ZS53YXlwb2ludERlZmF1bHQ7XG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIHN0cm9rZSBjb2xvclxuICAgIGNvbnN0IHN0cm9rZUNvbG9yID0gaXNTZWxlY3RlZCAmJiBwYWxldHRlLndheXBvaW50U3Ryb2tlU2VsZWN0ZWRcbiAgICAgID8gcGFsZXR0ZS53YXlwb2ludFN0cm9rZVNlbGVjdGVkXG4gICAgICA6IHBhbGV0dGUud2F5cG9pbnRTdHJva2U7XG5cbiAgICAvLyBEcmF3IHdheXBvaW50XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY29uc3QgcmFkaXVzID0gaXNTZWxlY3RlZCB8fCBpc0RyYWdnaW5nID8gNyA6IDU7XG4gICAgY3R4LmFyYyhwdC54LCBwdC55LCByYWRpdXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gZmlsbENvbG9yO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IGlzU2VsZWN0ZWQgfHwgaXNEcmFnZ2luZyA/IDAuOTUgOiAwLjg7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSBpc1NlbGVjdGVkID8gMiA6IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHJva2VDb2xvcjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7XG4gIEFwcFN0YXRlLFxuICBNaXNzaWxlUm91dGUsXG4gIE1pc3NpbGVTZWxlY3Rpb24sXG4gIFNlbGVjdGlvbixcbiAgVUlTdGF0ZSxcbn0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBNSVNTSUxFX01BWF9TUEVFRCwgTUlTU0lMRV9NSU5fU1BFRUQsIGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgdHlwZSB7IFJvdXRlUG9pbnRzIH0gZnJvbSBcIi4uL3JvdXRlXCI7XG5pbXBvcnQge1xuICBXQVlQT0lOVF9ISVRfUkFESVVTLFxuICBidWlsZFJvdXRlUG9pbnRzLFxuICBoaXRUZXN0Um91dGVHZW5lcmljLFxuICB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlLFxufSBmcm9tIFwiLi4vcm91dGVcIjtcbmltcG9ydCB0eXBlIHsgQ2FtZXJhIH0gZnJvbSBcIi4vY2FtZXJhXCI7XG5cbmludGVyZmFjZSBMb2dpY0RlcGVuZGVuY2llcyB7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgc2VuZE1lc3NhZ2UocGF5bG9hZDogdW5rbm93bik6IHZvaWQ7XG4gIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXI7XG4gIGNhbWVyYTogQ2FtZXJhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBvaW50ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExvZ2ljIHtcbiAgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB8IG51bGw7XG4gIHNldFNlbGVjdGlvbihzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwpOiB2b2lkO1xuICBnZXRNaXNzaWxlU2VsZWN0aW9uKCk6IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwsIHJvdXRlSWQ/OiBzdHJpbmcpOiB2b2lkO1xuICBnZXREZWZhdWx0U2hpcFNwZWVkKCk6IG51bWJlcjtcbiAgc2V0RGVmYXVsdFNoaXBTcGVlZCh2YWx1ZTogbnVtYmVyKTogdm9pZDtcbiAgZ2V0RGVmYXVsdE1pc3NpbGVMZWdTcGVlZCgpOiBudW1iZXI7XG4gIHJlY29yZE1pc3NpbGVMZWdTcGVlZCh2YWx1ZTogbnVtYmVyKTogdm9pZDtcbiAgZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk6IG51bWJlcjtcbiAgZGlzcGxheUluZGV4VG9BY3R1YWxJbmRleChkaXNwbGF5SW5kZXg6IG51bWJlcik6IG51bWJlcjtcbiAgYWN0dWFsSW5kZXhUb0Rpc3BsYXlJbmRleChhY3R1YWxJbmRleDogbnVtYmVyKTogbnVtYmVyO1xuICBjb21wdXRlUm91dGVQb2ludHMoKTogUm91dGVQb2ludHMgfCBudWxsO1xuICBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk6IFJvdXRlUG9pbnRzIHwgbnVsbDtcbiAgZmluZFdheXBvaW50QXRQb3NpdGlvbihjYW52YXNQb2ludDogUG9pbnRlclBvaW50KTogbnVtYmVyIHwgbnVsbDtcbiAgaGl0VGVzdFJvdXRlKGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQpOiBTZWxlY3Rpb24gfCBudWxsO1xuICBoaXRUZXN0TWlzc2lsZVJvdXRlcyhcbiAgICBjYW52YXNQb2ludDogUG9pbnRlclBvaW50XG4gICk6IHsgcm91dGU6IE1pc3NpbGVSb3V0ZTsgc2VsZWN0aW9uOiBNaXNzaWxlU2VsZWN0aW9uIH0gfCBudWxsO1xuICBzaGlwTGVnRGFzaE9mZnNldHM6IE1hcDxudW1iZXIsIG51bWJlcj47XG4gIG1pc3NpbGVMZWdEYXNoT2Zmc2V0czogTWFwPG51bWJlciwgbnVtYmVyPjtcbiAgdXBkYXRlUm91dGVBbmltYXRpb25zKGR0U2Vjb25kczogbnVtYmVyKTogdm9pZDtcbiAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk6IE1pc3NpbGVSb3V0ZSB8IG51bGw7XG4gIGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsO1xuICBjeWNsZU1pc3NpbGVSb3V0ZShkaXJlY3Rpb246IG51bWJlcik6IHZvaWQ7XG4gIGN5Y2xlU2hpcFNlbGVjdGlvbihkaXJlY3Rpb246IG51bWJlcik6IHZvaWQ7XG4gIGNsZWFyU2hpcFJvdXRlKCk6IHZvaWQ7XG4gIGRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk6IHZvaWQ7XG4gIGRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk6IHZvaWQ7XG4gIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiB2b2lkO1xuICBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludDogUG9pbnRlclBvaW50LCB3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkO1xuICBoYW5kbGVNaXNzaWxlUG9pbnRlcihjYW52YXNQb2ludDogUG9pbnRlclBvaW50LCB3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkO1xuICBiZWdpblNoaXBEcmFnKGluZGV4OiBudW1iZXIsIG9yaWdpbjogUG9pbnRlclBvaW50KTogdm9pZDtcbiAgYmVnaW5NaXNzaWxlRHJhZyhpbmRleDogbnVtYmVyLCBvcmlnaW46IFBvaW50ZXJQb2ludCk6IHZvaWQ7XG4gIHVwZGF0ZVNoaXBEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQ7XG4gIHVwZGF0ZU1pc3NpbGVEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQ7XG4gIGVuZERyYWcoKTogdm9pZDtcbiAgZ2V0RHJhZ2dlZFdheXBvaW50KCk6IG51bWJlciB8IG51bGw7XG4gIGdldERyYWdnZWRNaXNzaWxlV2F5cG9pbnQoKTogbnVtYmVyIHwgbnVsbDtcbiAgZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvZ2ljKHtcbiAgc3RhdGUsXG4gIHVpU3RhdGUsXG4gIGJ1cyxcbiAgc2VuZE1lc3NhZ2UsXG4gIGdldEFwcHJveFNlcnZlck5vdyxcbiAgY2FtZXJhLFxufTogTG9naWNEZXBlbmRlbmNpZXMpOiBMb2dpYyB7XG4gIGxldCBzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xuICBsZXQgZGVmYXVsdFNwZWVkID0gMTUwO1xuICBsZXQgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IDA7XG4gIGNvbnN0IHNoaXBMZWdEYXNoT2Zmc2V0cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gIGNvbnN0IG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gIGxldCBkcmFnZ2VkV2F5cG9pbnQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB8IG51bGwge1xuICAgIHJldHVybiBzZWxlY3Rpb247XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTZWxlY3Rpb24oc2VsOiBTZWxlY3Rpb24gfCBudWxsKTogdm9pZCB7XG4gICAgc2VsZWN0aW9uID0gc2VsO1xuICAgIGNvbnN0IGluZGV4ID0gc2VsZWN0aW9uID8gc2VsZWN0aW9uLmluZGV4IDogbnVsbDtcbiAgICBidXMuZW1pdChcInNoaXA6bGVnU2VsZWN0ZWRcIiwgeyBpbmRleCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldE1pc3NpbGVTZWxlY3Rpb24oKTogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwge1xuICAgIHJldHVybiBtaXNzaWxlU2VsZWN0aW9uO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0TWlzc2lsZVNlbGVjdGlvbihzZWw6IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsLCByb3V0ZUlkPzogc3RyaW5nKTogdm9pZCB7XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IHNlbDtcbiAgICBpZiAocm91dGVJZCkge1xuICAgICAgc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSByb3V0ZUlkO1xuICAgIH1cbiAgICBidXMuZW1pdChcIm1pc3NpbGU6c2VsZWN0aW9uQ2hhbmdlZFwiLCB7IHNlbGVjdGlvbjogbWlzc2lsZVNlbGVjdGlvbiB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldERlZmF1bHRTaGlwU3BlZWQoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gZGVmYXVsdFNwZWVkO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0RGVmYXVsdFNoaXBTcGVlZCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgZGVmYXVsdFNwZWVkID0gdmFsdWU7XG4gIH1cblxuICBmdW5jdGlvbiBnZXREZWZhdWx0TWlzc2lsZUxlZ1NwZWVkKCk6IG51bWJlciB7XG4gICAgY29uc3QgbWluU3BlZWQgPSBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWluID8/IE1JU1NJTEVfTUlOX1NQRUVEO1xuICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICBjb25zdCBiYXNlID1cbiAgICAgIGxhc3RNaXNzaWxlTGVnU3BlZWQgPiAwID8gbGFzdE1pc3NpbGVMZWdTcGVlZCA6IHN0YXRlLm1pc3NpbGVDb25maWcuc3BlZWQ7XG4gICAgcmV0dXJuIGNsYW1wKGJhc2UsIG1pblNwZWVkLCBtYXhTcGVlZCk7XG4gIH1cblxuICBmdW5jdGlvbiByZWNvcmRNaXNzaWxlTGVnU3BlZWQodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMCkge1xuICAgICAgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNoaXBXYXlwb2ludE9mZnNldCgpOiBudW1iZXIge1xuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IHN0YXRlLm1lPy5jdXJyZW50V2F5cG9pbnRJbmRleDtcbiAgICBpZiAodHlwZW9mIGN1cnJlbnRJbmRleCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUoY3VycmVudEluZGV4KSAmJiBjdXJyZW50SW5kZXggPiAwKSB7XG4gICAgICByZXR1cm4gY3VycmVudEluZGV4O1xuICAgIH1cbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoZGlzcGxheUluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBkaXNwbGF5SW5kZXggKyBnZXRTaGlwV2F5cG9pbnRPZmZzZXQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFjdHVhbEluZGV4VG9EaXNwbGF5SW5kZXgoYWN0dWFsSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgb2Zmc2V0ID0gZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk7XG4gICAgcmV0dXJuIGFjdHVhbEluZGV4IC0gb2Zmc2V0O1xuICB9XG5cbiAgZnVuY3Rpb24gY29tcHV0ZVJvdXRlUG9pbnRzKCk6IFJvdXRlUG9pbnRzIHwgbnVsbCB7XG4gICAgaWYgKCFzdGF0ZS5tZSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYWxsV2F5cG9pbnRzID0gQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpID8gc3RhdGUubWUud2F5cG9pbnRzIDogW107XG4gICAgY29uc3Qgb2Zmc2V0ID0gZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk7XG4gICAgY29uc3QgdmlzaWJsZVdheXBvaW50cyA9IG9mZnNldCA+IDAgPyBhbGxXYXlwb2ludHMuc2xpY2Uob2Zmc2V0KSA6IGFsbFdheXBvaW50cztcbiAgICBpZiAoIXZpc2libGVXYXlwb2ludHMubGVuZ3RoICYmICF1aVN0YXRlLnNob3dTaGlwUm91dGUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gYnVpbGRSb3V0ZVBvaW50cyhcbiAgICAgIHsgeDogc3RhdGUubWUueCwgeTogc3RhdGUubWUueSB9LFxuICAgICAgdmlzaWJsZVdheXBvaW50cyxcbiAgICAgIGNhbWVyYS5nZXRXb3JsZFNpemUoKSxcbiAgICAgIGNhbWVyYS5nZXRDYW1lcmFQb3NpdGlvbixcbiAgICAgICgpID0+IHVpU3RhdGUuem9vbSxcbiAgICAgIGNhbWVyYS53b3JsZFRvQ2FudmFzXG4gICAgKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKTogUm91dGVQb2ludHMgfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCAhcm91dGUud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGNvbnN0IG9yaWdpbiA9IHJvdXRlLm9yaWdpbiA/PyB7IHg6IHN0YXRlLm1lPy54ID8/IDAsIHk6IHN0YXRlLm1lPy55ID8/IDAgfTtcbiAgICByZXR1cm4gYnVpbGRSb3V0ZVBvaW50cyhcbiAgICAgIG9yaWdpbixcbiAgICAgIHJvdXRlLndheXBvaW50cyxcbiAgICAgIGNhbWVyYS5nZXRXb3JsZFNpemUoKSxcbiAgICAgIGNhbWVyYS5nZXRDYW1lcmFQb3NpdGlvbixcbiAgICAgICgpID0+IHVpU3RhdGUuem9vbSxcbiAgICAgIGNhbWVyYS53b3JsZFRvQ2FudmFzXG4gICAgKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmRXYXlwb2ludEF0UG9zaXRpb24oY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludCk6IG51bWJlciB8IG51bGwge1xuICAgIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gICAgaWYgKCFyb3V0ZSkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGVHZW5lcmljKGNhbnZhc1BvaW50LCByb3V0ZSwge1xuICAgICAgd2F5cG9pbnRSYWRpdXM6IFdBWVBPSU5UX0hJVF9SQURJVVMsXG4gICAgICBsZWdIaXRUb2xlcmFuY2U6IDAsXG4gICAgfSk7XG5cbiAgICBpZiAoIWhpdCB8fCBoaXQudHlwZSAhPT0gXCJ3YXlwb2ludFwiKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gZGlzcGxheUluZGV4VG9BY3R1YWxJbmRleChoaXQuaW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGl0VGVzdFJvdXRlKGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQpOiBTZWxlY3Rpb24gfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICAgIGlmICghcm91dGUpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBoaXRUZXN0Um91dGVHZW5lcmljKGNhbnZhc1BvaW50LCByb3V0ZSwge1xuICAgICAgd2F5cG9pbnRSYWRpdXM6IFdBWVBPSU5UX0hJVF9SQURJVVMsXG4gICAgICBsZWdIaXRUb2xlcmFuY2U6IDYsXG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBoaXRUZXN0TWlzc2lsZVJvdXRlcyhjYW52YXNQb2ludDogUG9pbnRlclBvaW50KSB7XG4gICAgY29uc3Qgcm91dGVQb2ludHMgPSBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlUG9pbnRzIHx8ICFyb3V0ZSkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGVHZW5lcmljKGNhbnZhc1BvaW50LCByb3V0ZVBvaW50cywge1xuICAgICAgd2F5cG9pbnRSYWRpdXM6IFdBWVBPSU5UX0hJVF9SQURJVVMsXG4gICAgICBsZWdIaXRUb2xlcmFuY2U6IDYsXG4gICAgfSk7XG4gICAgaWYgKCFoaXQpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3Qgc2VsZWN0aW9uID1cbiAgICAgIGhpdC50eXBlID09PSBcImxlZ1wiXG4gICAgICAgID8gKHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IGhpdC5pbmRleCB9IGFzIE1pc3NpbGVTZWxlY3Rpb24pXG4gICAgICAgIDogKHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogaGl0LmluZGV4IH0gYXMgTWlzc2lsZVNlbGVjdGlvbik7XG5cbiAgICByZXR1cm4geyByb3V0ZSwgc2VsZWN0aW9uIH07XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVSb3V0ZUFuaW1hdGlvbnMoZHRTZWNvbmRzOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBzaGlwUm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgICBpZiAoc2hpcFJvdXRlICYmIHNoaXBSb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gMCAmJiB1aVN0YXRlLnNob3dTaGlwUm91dGUpIHtcbiAgICAgIHVwZGF0ZURhc2hPZmZzZXRzRm9yUm91dGUoXG4gICAgICAgIHNoaXBMZWdEYXNoT2Zmc2V0cyxcbiAgICAgICAgc2hpcFJvdXRlLndheXBvaW50cyxcbiAgICAgICAgc2hpcFJvdXRlLndvcmxkUG9pbnRzLFxuICAgICAgICBzaGlwUm91dGUuY2FudmFzUG9pbnRzLFxuICAgICAgICBkZWZhdWx0U3BlZWQsXG4gICAgICAgIGR0U2Vjb25kc1xuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2hpcExlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgfVxuXG4gICAgY29uc3QgbWlzc2lsZVJvdXRlID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICAgIGlmIChtaXNzaWxlUm91dGUpIHtcbiAgICAgIHVwZGF0ZURhc2hPZmZzZXRzRm9yUm91dGUoXG4gICAgICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyxcbiAgICAgICAgbWlzc2lsZVJvdXRlLndheXBvaW50cyxcbiAgICAgICAgbWlzc2lsZVJvdXRlLndvcmxkUG9pbnRzLFxuICAgICAgICBtaXNzaWxlUm91dGUuY2FudmFzUG9pbnRzLFxuICAgICAgICBzdGF0ZS5taXNzaWxlQ29uZmlnLnNwZWVkLFxuICAgICAgICBkdFNlY29uZHNcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmICghcm91dGVzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoIXN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSB7XG4gICAgICBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IHJvdXRlc1swXS5pZDtcbiAgICB9XG5cbiAgICBsZXQgcm91dGUgPSByb3V0ZXMuZmluZCgocikgPT4gci5pZCA9PT0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQpIHx8IG51bGw7XG4gICAgaWYgKCFyb3V0ZSkge1xuICAgICAgcm91dGUgPSByb3V0ZXNbMF0gPz8gbnVsbDtcbiAgICAgIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcm91dGU/LmlkID8/IG51bGw7XG4gICAgfVxuICAgIHJldHVybiByb3V0ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmICghcm91dGVzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKCFzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCkge1xuICAgICAgcmV0dXJuIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gKFxuICAgICAgcm91dGVzLmZpbmQoKHIpID0+IHIuaWQgPT09IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSA/P1xuICAgICAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKClcbiAgICApO1xuICB9XG5cbiAgZnVuY3Rpb24gY3ljbGVNaXNzaWxlUm91dGUoZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmICghcm91dGVzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjdXJyZW50SW5kZXggPSByb3V0ZXMuZmluZEluZGV4KFxuICAgICAgKHJvdXRlKSA9PiByb3V0ZS5pZCA9PT0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWRcbiAgICApO1xuICAgIGNvbnN0IGJhc2VJbmRleCA9IGN1cnJlbnRJbmRleCA+PSAwID8gY3VycmVudEluZGV4IDogMDtcbiAgICBjb25zdCBuZXh0SW5kZXggPVxuICAgICAgKChiYXNlSW5kZXggKyBkaXJlY3Rpb24pICUgcm91dGVzLmxlbmd0aCArIHJvdXRlcy5sZW5ndGgpICUgcm91dGVzLmxlbmd0aDtcbiAgICBjb25zdCBuZXh0Um91dGUgPSByb3V0ZXNbbmV4dEluZGV4XTtcbiAgICBpZiAoIW5leHRSb3V0ZSkgcmV0dXJuO1xuICAgIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dFJvdXRlLmlkO1xuICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJzZXRfYWN0aXZlX21pc3NpbGVfcm91dGVcIixcbiAgICAgIHJvdXRlX2lkOiBuZXh0Um91dGUuaWQsXG4gICAgfSk7XG4gICAgYnVzLmVtaXQoXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLCB7IHJvdXRlSWQ6IG5leHRSb3V0ZS5pZCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGN5Y2xlU2hpcFNlbGVjdGlvbihkaXJlY3Rpb246IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHdwcyA9IHN0YXRlLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGUubWUud2F5cG9pbnRzKSA/IHN0YXRlLm1lLndheXBvaW50cyA6IFtdO1xuICAgIGlmICghd3BzLmxlbmd0aCkge1xuICAgICAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgaW5kZXggPSBzZWxlY3Rpb24gPyBzZWxlY3Rpb24uaW5kZXggOiBkaXJlY3Rpb24gPiAwID8gLTEgOiB3cHMubGVuZ3RoO1xuICAgIGluZGV4ICs9IGRpcmVjdGlvbjtcbiAgICBpZiAoaW5kZXggPCAwKSBpbmRleCA9IHdwcy5sZW5ndGggLSAxO1xuICAgIGlmIChpbmRleCA+PSB3cHMubGVuZ3RoKSBpbmRleCA9IDA7XG4gICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXggfSk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhclNoaXBSb3V0ZSgpOiB2b2lkIHtcbiAgICBjb25zdCB3cHMgPVxuICAgICAgc3RhdGUubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpID8gc3RhdGUubWUud2F5cG9pbnRzIDogW107XG4gICAgaWYgKCF3cHMubGVuZ3RoKSByZXR1cm47XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImNsZWFyX3dheXBvaW50c1wiIH0pO1xuICAgIGlmIChzdGF0ZS5tZSkge1xuICAgICAgc3RhdGUubWUud2F5cG9pbnRzID0gW107XG4gICAgfVxuICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgICBidXMuZW1pdChcInNoaXA6d2F5cG9pbnRzQ2xlYXJlZFwiKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk6IHZvaWQge1xuICAgIGlmICghc2VsZWN0aW9uKSByZXR1cm47XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRlbGV0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICAgIGlmIChzdGF0ZS5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlLm1lLndheXBvaW50cykpIHtcbiAgICAgIHN0YXRlLm1lLndheXBvaW50cyA9IHN0YXRlLm1lLndheXBvaW50cy5zbGljZSgwLCBzZWxlY3Rpb24uaW5kZXgpO1xuICAgIH1cbiAgICBidXMuZW1pdChcInNoaXA6d2F5cG9pbnREZWxldGVkXCIsIHsgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCB9KTtcbiAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIH1cblxuICBmdW5jdGlvbiBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpOiB2b2lkIHtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUgfHwgIW1pc3NpbGVTZWxlY3Rpb24pIHJldHVybjtcbiAgICBjb25zdCBpbmRleCA9IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXg7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJkZWxldGVfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgaW5kZXgsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gW1xuICAgICAgLi4ucm91dGUud2F5cG9pbnRzLnNsaWNlKDAsIGluZGV4KSxcbiAgICAgIC4uLnJvdXRlLndheXBvaW50cy5zbGljZShpbmRleCArIDEpLFxuICAgIF07XG4gICAgYnVzLmVtaXQoXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleCB9KTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICB9XG5cbiAgZnVuY3Rpb24gbGF1bmNoQWN0aXZlTWlzc2lsZVJvdXRlKCk6IHZvaWQge1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZygpID4gMC4wNSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHBsYXllciBoYXMgbWlzc2lsZXMgaW4gaW52ZW50b3J5XG4gICAgbGV0IGhhc01pc3NpbGVzID0gZmFsc2U7XG4gICAgaWYgKHN0YXRlLmludmVudG9yeT8uaXRlbXMpIHtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBzdGF0ZS5pbnZlbnRvcnkuaXRlbXMpIHtcbiAgICAgICAgaWYgKGl0ZW0udHlwZSA9PT0gXCJtaXNzaWxlXCIgJiYgaXRlbS5xdWFudGl0eSA+IDApIHtcbiAgICAgICAgICBoYXNNaXNzaWxlcyA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFoYXNNaXNzaWxlcykge1xuICAgICAgY29uc29sZS5sb2coXCJObyBtaXNzaWxlcyBhdmFpbGFibGUgLSBjcmFmdCBtaXNzaWxlcyBmaXJzdFwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJsYXVuY2hfbWlzc2lsZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlU2hpcFBvaW50ZXIoXG4gICAgY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludCxcbiAgICB3b3JsZFBvaW50OiBQb2ludGVyUG9pbnRcbiAgKTogdm9pZCB7XG4gICAgaWYgKCFzdGF0ZS5tZSkgcmV0dXJuO1xuICAgIGlmICh1aVN0YXRlLnNoaXBUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGUoY2FudmFzUG9pbnQpO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBjb25zdCBhY3R1YWxJbmRleCA9IGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoaGl0LmluZGV4KTtcbiAgICAgICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogaGl0LnR5cGUsIGluZGV4OiBhY3R1YWxJbmRleCB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkOiBkZWZhdWx0U3BlZWQgfTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImFkZF93YXlwb2ludFwiLFxuICAgICAgeDogd3AueCxcbiAgICAgIHk6IHdwLnksXG4gICAgICBzcGVlZDogZGVmYXVsdFNwZWVkLFxuICAgIH0pO1xuICAgIGNvbnN0IHdwcyA9IEFycmF5LmlzQXJyYXkoc3RhdGUubWUud2F5cG9pbnRzKVxuICAgICAgPyBzdGF0ZS5tZS53YXlwb2ludHMuc2xpY2UoKVxuICAgICAgOiBbXTtcbiAgICB3cHMucHVzaCh3cCk7XG4gICAgc3RhdGUubWUud2F5cG9pbnRzID0gd3BzO1xuICAgIGJ1cy5lbWl0KFwic2hpcDp3YXlwb2ludEFkZGVkXCIsIHsgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1pc3NpbGVQb2ludGVyKFxuICAgIGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQsXG4gICAgd29ybGRQb2ludDogUG9pbnRlclBvaW50XG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSkgcmV0dXJuO1xuXG4gICAgaWYgKHVpU3RhdGUubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RNaXNzaWxlUm91dGVzKGNhbnZhc1BvaW50KTtcbiAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgc2V0TWlzc2lsZVNlbGVjdGlvbihoaXQuc2VsZWN0aW9uLCBoaXQucm91dGUuaWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzcGVlZCA9IGdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQoKTtcbiAgICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkIH07XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJhZGRfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgeDogd3AueCxcbiAgICAgIHk6IHdwLnksXG4gICAgICBzcGVlZDogd3Auc3BlZWQsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gcm91dGUud2F5cG9pbnRzID8gWy4uLnJvdXRlLndheXBvaW50cywgd3BdIDogW3dwXTtcbiAgICByZWNvcmRNaXNzaWxlTGVnU3BlZWQoc3BlZWQpO1xuICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCwgcm91dGUuaWQpO1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHtcbiAgICAgIHJvdXRlSWQ6IHJvdXRlLmlkLFxuICAgICAgaW5kZXg6IHJvdXRlLndheXBvaW50cy5sZW5ndGggLSAxLFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gYmVnaW5TaGlwRHJhZyhpbmRleDogbnVtYmVyLCBfb3JpZ2luOiBQb2ludGVyUG9pbnQpOiB2b2lkIHtcbiAgICBkcmFnZ2VkV2F5cG9pbnQgPSBpbmRleDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJlZ2luTWlzc2lsZURyYWcoaW5kZXg6IG51bWJlciwgX29yaWdpbjogUG9pbnRlclBvaW50KTogdm9pZCB7XG4gICAgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA9IGluZGV4O1xuICB9XG5cbiAgZnVuY3Rpb24gY2xhbXBUb1dvcmxkKHBvaW50OiBQb2ludGVyUG9pbnQpOiBQb2ludGVyUG9pbnQge1xuICAgIGNvbnN0IHdvcmxkVyA9IHN0YXRlLndvcmxkTWV0YS53ID8/IDQwMDA7XG4gICAgY29uc3Qgd29ybGRIID0gc3RhdGUud29ybGRNZXRhLmggPz8gNDAwMDtcbiAgICByZXR1cm4ge1xuICAgICAgeDogY2xhbXAocG9pbnQueCwgMCwgd29ybGRXKSxcbiAgICAgIHk6IGNsYW1wKHBvaW50LnksIDAsIHdvcmxkSCksXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVNoaXBEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQge1xuICAgIGlmIChkcmFnZ2VkV2F5cG9pbnQgPT09IG51bGwpIHJldHVybjtcbiAgICBjb25zdCBjbGFtcGVkID0gY2xhbXBUb1dvcmxkKHdvcmxkUG9pbnQpO1xuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwibW92ZV93YXlwb2ludFwiLFxuICAgICAgaW5kZXg6IGRyYWdnZWRXYXlwb2ludCxcbiAgICAgIHg6IGNsYW1wZWQueCxcbiAgICAgIHk6IGNsYW1wZWQueSxcbiAgICB9KTtcbiAgICBpZiAoc3RhdGUubWUgJiYgc3RhdGUubWUud2F5cG9pbnRzICYmIGRyYWdnZWRXYXlwb2ludCA8IHN0YXRlLm1lLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHN0YXRlLm1lLndheXBvaW50c1tkcmFnZ2VkV2F5cG9pbnRdLnggPSBjbGFtcGVkLng7XG4gICAgICBzdGF0ZS5tZS53YXlwb2ludHNbZHJhZ2dlZFdheXBvaW50XS55ID0gY2xhbXBlZC55O1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQge1xuICAgIGlmIChkcmFnZ2VkTWlzc2lsZVdheXBvaW50ID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlIHx8ICFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykpIHJldHVybjtcbiAgICBjb25zdCBjbGFtcGVkID0gY2xhbXBUb1dvcmxkKHdvcmxkUG9pbnQpO1xuICAgIGlmIChkcmFnZ2VkTWlzc2lsZVdheXBvaW50ID49IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHJldHVybjtcblxuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwibW92ZV9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgICBpbmRleDogZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCxcbiAgICAgIHg6IGNsYW1wZWQueCxcbiAgICAgIHk6IGNsYW1wZWQueSxcbiAgICB9KTtcblxuICAgIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cy5tYXAoKHdwLCBpZHgpID0+XG4gICAgICBpZHggPT09IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPyB7IC4uLndwLCB4OiBjbGFtcGVkLngsIHk6IGNsYW1wZWQueSB9IDogd3BcbiAgICApO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5kRHJhZygpOiB2b2lkIHtcbiAgICBpZiAoZHJhZ2dlZFdheXBvaW50ICE9PSBudWxsICYmIHN0YXRlLm1lPy53YXlwb2ludHMpIHtcbiAgICAgIGNvbnN0IHdwID0gc3RhdGUubWUud2F5cG9pbnRzW2RyYWdnZWRXYXlwb2ludF07XG4gICAgICBpZiAod3ApIHtcbiAgICAgICAgYnVzLmVtaXQoXCJzaGlwOndheXBvaW50TW92ZWRcIiwge1xuICAgICAgICAgIGluZGV4OiBkcmFnZ2VkV2F5cG9pbnQsXG4gICAgICAgICAgeDogd3AueCxcbiAgICAgICAgICB5OiB3cC55LFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCAhPT0gbnVsbCkge1xuICAgICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgIGlmIChyb3V0ZSAmJiByb3V0ZS53YXlwb2ludHMgJiYgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA8IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgICAgY29uc3Qgd3AgPSByb3V0ZS53YXlwb2ludHNbZHJhZ2dlZE1pc3NpbGVXYXlwb2ludF07XG4gICAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludE1vdmVkXCIsIHtcbiAgICAgICAgICByb3V0ZUlkOiByb3V0ZS5pZCxcbiAgICAgICAgICBpbmRleDogZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCxcbiAgICAgICAgICB4OiB3cC54LFxuICAgICAgICAgIHk6IHdwLnksXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRyYWdnZWRXYXlwb2ludCA9IG51bGw7XG4gICAgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBnZXREcmFnZ2VkV2F5cG9pbnQoKTogbnVtYmVyIHwgbnVsbCB7XG4gICAgcmV0dXJuIGRyYWdnZWRXYXlwb2ludDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldERyYWdnZWRNaXNzaWxlV2F5cG9pbnQoKTogbnVtYmVyIHwgbnVsbCB7XG4gICAgcmV0dXJuIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQ7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTogbnVtYmVyIHtcbiAgICBjb25zdCByZW1haW5pbmcgPSBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpO1xuICAgIHJldHVybiByZW1haW5pbmcgPiAwID8gcmVtYWluaW5nIDogMDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2V0U2VsZWN0aW9uLFxuICAgIHNldFNlbGVjdGlvbixcbiAgICBnZXRNaXNzaWxlU2VsZWN0aW9uLFxuICAgIHNldE1pc3NpbGVTZWxlY3Rpb24sXG4gICAgZ2V0RGVmYXVsdFNoaXBTcGVlZCxcbiAgICBzZXREZWZhdWx0U2hpcFNwZWVkLFxuICAgIGdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQsXG4gICAgcmVjb3JkTWlzc2lsZUxlZ1NwZWVkLFxuICAgIGdldFNoaXBXYXlwb2ludE9mZnNldCxcbiAgICBkaXNwbGF5SW5kZXhUb0FjdHVhbEluZGV4LFxuICAgIGFjdHVhbEluZGV4VG9EaXNwbGF5SW5kZXgsXG4gICAgY29tcHV0ZVJvdXRlUG9pbnRzLFxuICAgIGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMsXG4gICAgZmluZFdheXBvaW50QXRQb3NpdGlvbixcbiAgICBoaXRUZXN0Um91dGUsXG4gICAgaGl0VGVzdE1pc3NpbGVSb3V0ZXMsXG4gICAgc2hpcExlZ0Rhc2hPZmZzZXRzLFxuICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyxcbiAgICB1cGRhdGVSb3V0ZUFuaW1hdGlvbnMsXG4gICAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlLFxuICAgIGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSxcbiAgICBjeWNsZU1pc3NpbGVSb3V0ZSxcbiAgICBjeWNsZVNoaXBTZWxlY3Rpb24sXG4gICAgY2xlYXJTaGlwUm91dGUsXG4gICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQsXG4gICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQsXG4gICAgbGF1bmNoQWN0aXZlTWlzc2lsZVJvdXRlLFxuICAgIGhhbmRsZVNoaXBQb2ludGVyLFxuICAgIGhhbmRsZU1pc3NpbGVQb2ludGVyLFxuICAgIGJlZ2luU2hpcERyYWcsXG4gICAgYmVnaW5NaXNzaWxlRHJhZyxcbiAgICB1cGRhdGVTaGlwRHJhZyxcbiAgICB1cGRhdGVNaXNzaWxlRHJhZyxcbiAgICBlbmREcmFnLFxuICAgIGdldERyYWdnZWRXYXlwb2ludCxcbiAgICBnZXREcmFnZ2VkTWlzc2lsZVdheXBvaW50LFxuICAgIGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZyxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBVSVN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBNSVNTSUxFX1BBTEVUVEUsIFNISVBfUEFMRVRURSwgZHJhd1BsYW5uZWRSb3V0ZSB9IGZyb20gXCIuLi9yb3V0ZVwiO1xuaW1wb3J0IHR5cGUgeyBDYW1lcmEgfSBmcm9tIFwiLi9jYW1lcmFcIjtcbmltcG9ydCB0eXBlIHsgTG9naWMgfSBmcm9tIFwiLi9sb2dpY1wiO1xuXG5pbnRlcmZhY2UgUmVuZGVyRGVwZW5kZW5jaWVzIHtcbiAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgY2FtZXJhOiBDYW1lcmE7XG4gIGxvZ2ljOiBMb2dpYztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZW5kZXJlciB7XG4gIGRyYXdTY2VuZSgpOiB2b2lkO1xuICBkcmF3R3JpZCgpOiB2b2lkO1xuICBkcmF3QmVhY29ucygpOiB2b2lkO1xuICBkcmF3U2hpcCh4OiBudW1iZXIsIHk6IG51bWJlciwgdng6IG51bWJlciwgdnk6IG51bWJlciwgY29sb3I6IHN0cmluZywgZmlsbGVkOiBib29sZWFuKTogdm9pZDtcbiAgZHJhd0dob3N0RG90KHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZDtcbiAgZHJhd1JvdXRlKCk6IHZvaWQ7XG4gIGRyYXdNaXNzaWxlUm91dGUoKTogdm9pZDtcbiAgZHJhd01pc3NpbGVzKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZW5kZXJlcih7XG4gIGNhbnZhcyxcbiAgY3R4LFxuICBzdGF0ZSxcbiAgdWlTdGF0ZSxcbiAgY2FtZXJhLFxuICBsb2dpYyxcbn06IFJlbmRlckRlcGVuZGVuY2llcyk6IFJlbmRlcmVyIHtcbiAgZnVuY3Rpb24gZHJhd1NoaXAoXG4gICAgeDogbnVtYmVyLFxuICAgIHk6IG51bWJlcixcbiAgICB2eDogbnVtYmVyLFxuICAgIHZ5OiBudW1iZXIsXG4gICAgY29sb3I6IHN0cmluZyxcbiAgICBmaWxsZWQ6IGJvb2xlYW5cbiAgKTogdm9pZCB7XG4gICAgY29uc3QgcCA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeCwgeSB9KTtcbiAgICBjb25zdCByID0gMTA7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHgudHJhbnNsYXRlKHAueCwgcC55KTtcbiAgICBjb25zdCBhbmdsZSA9IE1hdGguYXRhbjIodnksIHZ4KTtcbiAgICBjdHgucm90YXRlKGFuZ2xlKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhyLCAwKTtcbiAgICBjdHgubGluZVRvKC1yICogMC43LCByICogMC42KTtcbiAgICBjdHgubGluZVRvKC1yICogMC40LCAwKTtcbiAgICBjdHgubGluZVRvKC1yICogMC43LCAtciAqIDAuNik7XG4gICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGNvbG9yO1xuICAgIGlmIChmaWxsZWQpIHtcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBgJHtjb2xvcn1jY2A7XG4gICAgICBjdHguZmlsbCgpO1xuICAgIH1cbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdHaG9zdERvdCh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHAgPSBjYW1lcmEud29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMocC54LCBwLnksIDMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gXCIjY2NjY2NjYWFcIjtcbiAgICBjdHguZmlsbCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gZHJhd1JvdXRlKCk6IHZvaWQge1xuICAgIGlmICghc3RhdGUubWUpIHJldHVybjtcbiAgICBjb25zdCByb3V0ZSA9IGxvZ2ljLmNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICAgIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgY29uc3QgaGVhdCA9IHN0YXRlLm1lLmhlYXQ7XG4gICAgY29uc3QgaGVhdFBhcmFtcyA9IGhlYXRcbiAgICAgID8ge1xuICAgICAgICAgIG1hcmtlclNwZWVkOiBoZWF0Lm1hcmtlclNwZWVkLFxuICAgICAgICAgIGtVcDogaGVhdC5rVXAsXG4gICAgICAgICAga0Rvd246IGhlYXQua0Rvd24sXG4gICAgICAgICAgZXhwOiBoZWF0LmV4cCxcbiAgICAgICAgICBtYXg6IGhlYXQubWF4LFxuICAgICAgICAgIG92ZXJoZWF0QXQ6IGhlYXQub3ZlcmhlYXRBdCxcbiAgICAgICAgICB3YXJuQXQ6IGhlYXQud2FybkF0LFxuICAgICAgICB9XG4gICAgICA6IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGN1cnJlbnRTZWxlY3Rpb24gPSBsb2dpYy5nZXRTZWxlY3Rpb24oKTtcbiAgICBjb25zdCBkaXNwbGF5U2VsZWN0aW9uID0gY3VycmVudFNlbGVjdGlvblxuICAgICAgPyB7XG4gICAgICAgICAgdHlwZTogY3VycmVudFNlbGVjdGlvbi50eXBlLFxuICAgICAgICAgIGluZGV4OiBsb2dpYy5hY3R1YWxJbmRleFRvRGlzcGxheUluZGV4KGN1cnJlbnRTZWxlY3Rpb24uaW5kZXgpLFxuICAgICAgICB9XG4gICAgICA6IG51bGw7XG4gICAgY29uc3QgdmFsaWRTZWxlY3Rpb24gPVxuICAgICAgZGlzcGxheVNlbGVjdGlvbiAmJiBkaXNwbGF5U2VsZWN0aW9uLmluZGV4ID49IDAgPyBkaXNwbGF5U2VsZWN0aW9uIDogbnVsbDtcblxuICAgIGNvbnN0IGRyYWdnZWQgPSBsb2dpYy5nZXREcmFnZ2VkV2F5cG9pbnQoKTtcbiAgICBjb25zdCBkaXNwbGF5RHJhZ2dlZCA9XG4gICAgICBkcmFnZ2VkICE9PSBudWxsID8gbG9naWMuYWN0dWFsSW5kZXhUb0Rpc3BsYXlJbmRleChkcmFnZ2VkKSA6IG51bGw7XG4gICAgY29uc3QgdmFsaWREcmFnZ2VkID1cbiAgICAgIGRpc3BsYXlEcmFnZ2VkICE9PSBudWxsICYmIGRpc3BsYXlEcmFnZ2VkID49IDAgPyBkaXNwbGF5RHJhZ2dlZCA6IG51bGw7XG5cbiAgICBkcmF3UGxhbm5lZFJvdXRlKGN0eCwge1xuICAgICAgcm91dGVQb2ludHM6IHJvdXRlLFxuICAgICAgc2VsZWN0aW9uOiB2YWxpZFNlbGVjdGlvbixcbiAgICAgIGRyYWdnZWRXYXlwb2ludDogdmFsaWREcmFnZ2VkLFxuICAgICAgZGFzaFN0b3JlOiBsb2dpYy5zaGlwTGVnRGFzaE9mZnNldHMsXG4gICAgICBwYWxldHRlOiBTSElQX1BBTEVUVEUsXG4gICAgICBzaG93TGVnczogdWlTdGF0ZS5zaG93U2hpcFJvdXRlLFxuICAgICAgaGVhdFBhcmFtcyxcbiAgICAgIGluaXRpYWxIZWF0OiBoZWF0Py52YWx1ZSA/PyAwLFxuICAgICAgZGVmYXVsdFNwZWVkOiBsb2dpYy5nZXREZWZhdWx0U2hpcFNwZWVkKCksXG4gICAgICB3b3JsZFBvaW50czogcm91dGUud29ybGRQb2ludHMsXG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBkcmF3TWlzc2lsZVJvdXRlKCk6IHZvaWQge1xuICAgIGlmICghc3RhdGUubWUpIHJldHVybjtcbiAgICBpZiAodWlTdGF0ZS5pbnB1dENvbnRleHQgIT09IFwibWlzc2lsZVwiKSByZXR1cm47XG4gICAgY29uc3Qgcm91dGUgPSBsb2dpYy5jb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgICBjb25zdCBoZWF0UGFyYW1zID0gc3RhdGUubWlzc2lsZUNvbmZpZy5oZWF0UGFyYW1zO1xuICAgIGNvbnN0IG1pc3NpbGVTZWxlY3Rpb24gPSBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCk7XG4gICAgY29uc3QgZ2VuZXJpY1NlbGVjdGlvbiA9XG4gICAgICBtaXNzaWxlU2VsZWN0aW9uICYmIG1pc3NpbGVTZWxlY3Rpb24udHlwZSA9PT0gXCJsZWdcIlxuICAgICAgICA/IHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggfVxuICAgICAgICA6IG1pc3NpbGVTZWxlY3Rpb24gJiYgbWlzc2lsZVNlbGVjdGlvbi50eXBlID09PSBcIndheXBvaW50XCJcbiAgICAgICAgPyB7IHR5cGU6IFwid2F5cG9pbnRcIiwgaW5kZXg6IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggfVxuICAgICAgICA6IG51bGw7XG5cbiAgICBkcmF3UGxhbm5lZFJvdXRlKGN0eCwge1xuICAgICAgcm91dGVQb2ludHM6IHJvdXRlLFxuICAgICAgc2VsZWN0aW9uOiBnZW5lcmljU2VsZWN0aW9uLFxuICAgICAgZHJhZ2dlZFdheXBvaW50OiBudWxsLFxuICAgICAgZGFzaFN0b3JlOiBsb2dpYy5taXNzaWxlTGVnRGFzaE9mZnNldHMsXG4gICAgICBwYWxldHRlOiBNSVNTSUxFX1BBTEVUVEUsXG4gICAgICBzaG93TGVnczogdHJ1ZSxcbiAgICAgIGhlYXRQYXJhbXMsXG4gICAgICBpbml0aWFsSGVhdDogMCxcbiAgICAgIGRlZmF1bHRTcGVlZDogc3RhdGUubWlzc2lsZUNvbmZpZy5zcGVlZCxcbiAgICAgIHdvcmxkUG9pbnRzOiByb3V0ZS53b3JsZFBvaW50cyxcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdNaXNzaWxlcygpOiB2b2lkIHtcbiAgICBpZiAoIXN0YXRlLm1pc3NpbGVzIHx8IHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgIGNvbnN0IHdvcmxkID0gY2FtZXJhLmdldFdvcmxkU2l6ZSgpO1xuICAgIGNvbnN0IHNjYWxlWCA9IGNhbnZhcy53aWR0aCAvIHdvcmxkLnc7XG4gICAgY29uc3Qgc2NhbGVZID0gY2FudmFzLmhlaWdodCAvIHdvcmxkLmg7XG4gICAgY29uc3QgcmFkaXVzU2NhbGUgPSAoc2NhbGVYICsgc2NhbGVZKSAvIDI7XG4gICAgZm9yIChjb25zdCBtaXNzIG9mIHN0YXRlLm1pc3NpbGVzKSB7XG4gICAgICBjb25zdCBwID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4OiBtaXNzLngsIHk6IG1pc3MueSB9KTtcbiAgICAgIGNvbnN0IHNlbGZPd25lZCA9IEJvb2xlYW4obWlzcy5zZWxmKTtcbiAgICAgIGN0eC5zYXZlKCk7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHguYXJjKHAueCwgcC55LCBzZWxmT3duZWQgPyA2IDogNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgY3R4LmZpbGxTdHlsZSA9IHNlbGZPd25lZCA/IFwiI2Y4NzE3MVwiIDogXCIjZmNhNWE1XCI7XG4gICAgICBjdHguZ2xvYmFsQWxwaGEgPSBzZWxmT3duZWQgPyAwLjk1IDogMC44O1xuICAgICAgY3R4LmZpbGwoKTtcbiAgICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgICBjdHgubGluZVdpZHRoID0gMS41O1xuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMTExODI3XCI7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgICBpZiAoc2VsZk93bmVkICYmIG1pc3MuYWdyb19yYWRpdXMgPiAwKSB7XG4gICAgICAgIGN0eC5zYXZlKCk7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY29uc3QgckNhbnZhcyA9IG1pc3MuYWdyb19yYWRpdXMgKiByYWRpdXNTY2FsZTtcbiAgICAgICAgY3R4LnNldExpbmVEYXNoKFsxNCwgMTBdKTtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJyZ2JhKDI0OCwxMTMsMTEzLDAuMzUpXCI7XG4gICAgICAgIGN0eC5saW5lV2lkdGggPSAxLjI7XG4gICAgICAgIGN0eC5hcmMocC54LCBwLnksIHJDYW52YXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgICBjdHgucmVzdG9yZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdHcmlkKCk6IHZvaWQge1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMjM0XCI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDE7XG5cbiAgICBjb25zdCB6b29tID0gdWlTdGF0ZS56b29tO1xuICAgIGxldCBzdGVwID0gMTAwMDtcbiAgICBpZiAoem9vbSA8IDAuNykge1xuICAgICAgc3RlcCA9IDIwMDA7XG4gICAgfSBlbHNlIGlmICh6b29tID4gMS41KSB7XG4gICAgICBzdGVwID0gNTAwO1xuICAgIH0gZWxzZSBpZiAoem9vbSA+IDIuNSkge1xuICAgICAgc3RlcCA9IDI1MDtcbiAgICB9XG5cbiAgICBjb25zdCBjYW1lcmFQb3MgPSBjYW1lcmEuZ2V0Q2FtZXJhUG9zaXRpb24oKTtcbiAgICBjb25zdCB3b3JsZCA9IGNhbWVyYS5nZXRXb3JsZFNpemUoKTtcbiAgICBjb25zdCBzY2FsZVggPSBjYW52YXMud2lkdGggLyB3b3JsZC53O1xuICAgIGNvbnN0IHNjYWxlWSA9IGNhbnZhcy5oZWlnaHQgLyB3b3JsZC5oO1xuICAgIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcbiAgICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY2FudmFzLndpZHRoIC8gc2NhbGU7XG4gICAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjYW52YXMuaGVpZ2h0IC8gc2NhbGU7XG5cbiAgICBjb25zdCBtaW5YID0gTWF0aC5tYXgoMCwgY2FtZXJhUG9zLnggLSB2aWV3cG9ydFdpZHRoIC8gMik7XG4gICAgY29uc3QgbWF4WCA9IE1hdGgubWluKHdvcmxkLncsIGNhbWVyYVBvcy54ICsgdmlld3BvcnRXaWR0aCAvIDIpO1xuICAgIGNvbnN0IG1pblkgPSBNYXRoLm1heCgwLCBjYW1lcmFQb3MueSAtIHZpZXdwb3J0SGVpZ2h0IC8gMik7XG4gICAgY29uc3QgbWF4WSA9IE1hdGgubWluKHdvcmxkLmgsIGNhbWVyYVBvcy55ICsgdmlld3BvcnRIZWlnaHQgLyAyKTtcblxuICAgIGNvbnN0IHN0YXJ0WCA9IE1hdGguZmxvb3IobWluWCAvIHN0ZXApICogc3RlcDtcbiAgICBjb25zdCBlbmRYID0gTWF0aC5jZWlsKG1heFggLyBzdGVwKSAqIHN0ZXA7XG4gICAgY29uc3Qgc3RhcnRZID0gTWF0aC5mbG9vcihtaW5ZIC8gc3RlcCkgKiBzdGVwO1xuICAgIGNvbnN0IGVuZFkgPSBNYXRoLmNlaWwobWF4WSAvIHN0ZXApICogc3RlcDtcblxuICAgIGZvciAobGV0IHggPSBzdGFydFg7IHggPD0gZW5kWDsgeCArPSBzdGVwKSB7XG4gICAgICBjb25zdCBhID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4LCB5OiBNYXRoLm1heCgwLCBtaW5ZKSB9KTtcbiAgICAgIGNvbnN0IGIgPSBjYW1lcmEud29ybGRUb0NhbnZhcyh7IHgsIHk6IE1hdGgubWluKHdvcmxkLmgsIG1heFkpIH0pO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4Lm1vdmVUbyhhLngsIGEueSk7XG4gICAgICBjdHgubGluZVRvKGIueCwgYi55KTtcbiAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCB5ID0gc3RhcnRZOyB5IDw9IGVuZFk7IHkgKz0gc3RlcCkge1xuICAgICAgY29uc3QgYSA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeDogTWF0aC5tYXgoMCwgbWluWCksIHkgfSk7XG4gICAgICBjb25zdCBiID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4OiBNYXRoLm1pbih3b3JsZC53LCBtYXhYKSwgeSB9KTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5tb3ZlVG8oYS54LCBhLnkpO1xuICAgICAgY3R4LmxpbmVUbyhiLngsIGIueSk7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBkcmF3QmVhY29ucygpOiB2b2lkIHtcbiAgICBjb25zdCBtaXNzaW9uID0gc3RhdGUubWlzc2lvbjtcbiAgICBpZiAoIW1pc3Npb24gfHwgIW1pc3Npb24uYWN0aXZlIHx8IG1pc3Npb24uYmVhY29ucy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB3b3JsZCA9IGNhbWVyYS5nZXRXb3JsZFNpemUoKTtcbiAgICBjb25zdCBzY2FsZSA9IE1hdGgubWluKGNhbnZhcy53aWR0aCAvIHdvcmxkLncsIGNhbnZhcy5oZWlnaHQgLyB3b3JsZC5oKSAqIHVpU3RhdGUuem9vbTtcbiAgICBjb25zdCBtZSA9IHN0YXRlLm1lO1xuICAgIGNvbnN0IGhvbGRSZXF1aXJlZCA9IG1pc3Npb24uaG9sZFJlcXVpcmVkIHx8IDEwO1xuXG4gICAgbWlzc2lvbi5iZWFjb25zLmZvckVhY2goKGJlYWNvbiwgaW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IGNlbnRlciA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeDogYmVhY29uLmN4LCB5OiBiZWFjb24uY3kgfSk7XG4gICAgICBjb25zdCBlZGdlID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4OiBiZWFjb24uY3ggKyBiZWFjb24ucmFkaXVzLCB5OiBiZWFjb24uY3kgfSk7XG4gICAgICBjb25zdCByYWRpdXMgPSBNYXRoLmh5cG90KGVkZ2UueCAtIGNlbnRlci54LCBlZGdlLnkgLSBjZW50ZXIueSk7XG4gICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShyYWRpdXMpIHx8IHJhZGl1cyA8PSAwLjUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBpc0xvY2tlZCA9IGluZGV4IDwgbWlzc2lvbi5iZWFjb25JbmRleDtcbiAgICAgIGNvbnN0IGlzQWN0aXZlID0gaW5kZXggPT09IG1pc3Npb24uYmVhY29uSW5kZXg7XG4gICAgICBjb25zdCBiYXNlTGluZVdpZHRoID0gTWF0aC5tYXgoMS41LCAyLjUgKiBNYXRoLm1pbigxLCBzY2FsZSAqIDEuMikpO1xuICAgICAgY29uc3Qgc3Ryb2tlU3R5bGUgPSBpc0xvY2tlZFxuICAgICAgICA/IFwicmdiYSg3NCwyMjIsMTI4LDAuODUpXCJcbiAgICAgICAgOiBpc0FjdGl2ZVxuICAgICAgICA/IFwicmdiYSg1NiwxODksMjQ4LDAuOTUpXCJcbiAgICAgICAgOiBcInJnYmEoMTQ4LDE2MywxODQsMC42NSlcIjtcblxuICAgICAgY3R4LnNhdmUoKTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5zZXRMaW5lRGFzaChpc0FjdGl2ZSA/IFtdIDogWzEwLCAxMl0pO1xuICAgICAgY3R4LmxpbmVXaWR0aCA9IGlzQWN0aXZlID8gYmFzZUxpbmVXaWR0aCAqIDEuNCA6IGJhc2VMaW5lV2lkdGg7XG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHJva2VTdHlsZTtcbiAgICAgIGN0eC5nbG9iYWxBbHBoYSA9IGlzTG9ja2VkID8gMC45IDogMC44O1xuICAgICAgY3R4LmFyYyhjZW50ZXIueCwgY2VudGVyLnksIHJhZGl1cywgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuXG4gICAgICBjb25zdCBpbnNpZGUgPVxuICAgICAgICBpc0FjdGl2ZSAmJiBtZVxuICAgICAgICAgID8gKCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZHggPSBtZS54IC0gYmVhY29uLmN4O1xuICAgICAgICAgICAgICBjb25zdCBkeSA9IG1lLnkgLSBiZWFjb24uY3k7XG4gICAgICAgICAgICAgIHJldHVybiBkeCAqIGR4ICsgZHkgKiBkeSA8PSBiZWFjb24ucmFkaXVzICogYmVhY29uLnJhZGl1cztcbiAgICAgICAgICAgIH0pKClcbiAgICAgICAgICA6IGZhbHNlO1xuXG4gICAgICBpZiAoaW5zaWRlKSB7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSg1NiwxODksMjQ4LDAuMTIpXCI7XG4gICAgICAgIGN0eC5hcmMoY2VudGVyLngsIGNlbnRlci55LCByYWRpdXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgICAgY3R4LmZpbGwoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGlzQWN0aXZlKSB7XG4gICAgICAgIGNvbnN0IHByb2dyZXNzID0gaG9sZFJlcXVpcmVkID4gMCA/IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIG1pc3Npb24uaG9sZEFjY3VtIC8gaG9sZFJlcXVpcmVkKSkgOiAwO1xuICAgICAgICBpZiAocHJvZ3Jlc3MgPiAwKSB7XG4gICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSg1NiwxODksMjQ4LDAuOTUpXCI7XG4gICAgICAgICAgY3R4LmxpbmVXaWR0aCA9IE1hdGgubWF4KGJhc2VMaW5lV2lkdGggKiAxLjgsIDIpO1xuICAgICAgICAgIGN0eC5zZXRMaW5lRGFzaChbXSk7XG4gICAgICAgICAgY3R4LmFyYyhjZW50ZXIueCwgY2VudGVyLnksIHJhZGl1cywgLU1hdGguUEkgLyAyLCAtTWF0aC5QSSAvIDIgKyBwcm9ncmVzcyAqIE1hdGguUEkgKiAyKTtcbiAgICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGlzTG9ja2VkKSB7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSg3NCwyMjIsMTI4LDAuNzUpXCI7XG4gICAgICAgIGN0eC5hcmMoY2VudGVyLngsIGNlbnRlci55LCBNYXRoLm1heCg0LCByYWRpdXMgKiAwLjA1KSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgICBjdHguZmlsbCgpO1xuICAgICAgfVxuXG4gICAgICBjdHgucmVzdG9yZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZHJhd1NjZW5lKCk6IHZvaWQge1xuICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcbiAgICBkcmF3R3JpZCgpO1xuICAgIGRyYXdCZWFjb25zKCk7XG4gICAgZHJhd1JvdXRlKCk7XG4gICAgZHJhd01pc3NpbGVSb3V0ZSgpO1xuICAgIGRyYXdNaXNzaWxlcygpO1xuXG4gICAgZm9yIChjb25zdCBnIG9mIHN0YXRlLmdob3N0cykge1xuICAgICAgZHJhd1NoaXAoZy54LCBnLnksIGcudngsIGcudnksIFwiIzljYTNhZlwiLCBmYWxzZSk7XG4gICAgICBkcmF3R2hvc3REb3QoZy54LCBnLnkpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUubWUpIHtcbiAgICAgIGRyYXdTaGlwKHN0YXRlLm1lLngsIHN0YXRlLm1lLnksIHN0YXRlLm1lLnZ4LCBzdGF0ZS5tZS52eSwgXCIjMjJkM2VlXCIsIHRydWUpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZHJhd1NjZW5lLFxuICAgIGRyYXdHcmlkLFxuICAgIGRyYXdCZWFjb25zLFxuICAgIGRyYXdTaGlwLFxuICAgIGRyYXdHaG9zdERvdCxcbiAgICBkcmF3Um91dGUsXG4gICAgZHJhd01pc3NpbGVSb3V0ZSxcbiAgICBkcmF3TWlzc2lsZXMsXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgQWN0aXZlVG9vbCwgQXBwU3RhdGUsIFVJU3RhdGUgfSBmcm9tIFwiLi4vc3RhdGVcIjtcbmltcG9ydCB7XG4gIE1JU1NJTEVfTUFYX1NQRUVELFxuICBNSVNTSUxFX01JTl9BR1JPLFxuICBNSVNTSUxFX01JTl9TUEVFRCxcbiAgY2xhbXAsXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbn0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBIRUxQX1RFWFQgfSBmcm9tIFwiLi9jb25zdGFudHNcIjtcbmltcG9ydCB0eXBlIHsgQ2FtZXJhIH0gZnJvbSBcIi4vY2FtZXJhXCI7XG5pbXBvcnQgdHlwZSB7IExvZ2ljIH0gZnJvbSBcIi4vbG9naWNcIjtcbmltcG9ydCB7IHByb2plY3RSb3V0ZUhlYXQgfSBmcm9tIFwiLi4vcm91dGVcIjtcblxuaW50ZXJmYWNlIFVJRGVwZW5kZW5jaWVzIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBsb2dpYzogTG9naWM7XG4gIGNhbWVyYTogQ2FtZXJhO1xuICBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZDtcbiAgZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlOiBBcHBTdGF0ZSk6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENhY2hlZENhbnZhcyB7XG4gIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVUlDb250cm9sbGVyIHtcbiAgY2FjaGVEb20oKTogQ2FjaGVkQ2FudmFzO1xuICBiaW5kVUkoKTogdm9pZDtcbiAgc2V0QWN0aXZlVG9vbCh0b29sOiBBY3RpdmVUb29sKTogdm9pZDtcbiAgc2V0SW5wdXRDb250ZXh0KGNvbnRleHQ6IFwic2hpcFwiIHwgXCJtaXNzaWxlXCIpOiB2b2lkO1xuICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpOiB2b2lkO1xuICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk6IHZvaWQ7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTogdm9pZDtcbiAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTogdm9pZDtcbiAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpOiB2b2lkO1xuICB1cGRhdGVIZWxwT3ZlcmxheSgpOiB2b2lkO1xuICBzZXRIZWxwVmlzaWJsZShmbGFnOiBib29sZWFuKTogdm9pZDtcbiAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk6IHZvaWQ7XG4gIHVwZGF0ZU1pc3NpbGVDb3VudERpc3BsYXkoKTogdm9pZDtcbiAgdXBkYXRlQ3JhZnRUaW1lcigpOiB2b2lkO1xuICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk6IHZvaWQ7XG4gIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk6IHZvaWQ7XG4gIHVwZGF0ZVNwZWVkTWFya2VyKCk6IHZvaWQ7XG4gIHVwZGF0ZUhlYXRCYXIoKTogdm9pZDtcbiAgcHJvamVjdFBsYW5uZWRIZWF0KCk6IG51bWJlciB8IG51bGw7XG4gIGdldENhbnZhcygpOiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gIGdldENvbnRleHQoKTogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEIHwgbnVsbDtcbiAgYWRqdXN0U2hpcFNwZWVkKHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IHZvaWQ7XG4gIGFkanVzdE1pc3NpbGVBZ3JvKHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IHZvaWQ7XG4gIGFkanVzdE1pc3NpbGVTcGVlZChzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVUkoe1xuICBzdGF0ZSxcbiAgdWlTdGF0ZSxcbiAgYnVzLFxuICBsb2dpYyxcbiAgY2FtZXJhLFxuICBzZW5kTWVzc2FnZSxcbiAgZ2V0QXBwcm94U2VydmVyTm93LFxufTogVUlEZXBlbmRlbmNpZXMpOiBVSUNvbnRyb2xsZXIge1xuICBsZXQgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQgfCBudWxsID0gbnVsbDtcbiAgbGV0IEhQc3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGtpbGxzU3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBDb250cm9sc0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwQ2xlYXJCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFNlbGVjdEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBSb3V0ZXNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwUm91dGVMZWc6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwUm91dGVTcGVlZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwU3BlZWRDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFNwZWVkU2xpZGVyOiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTcGVlZE1hcmtlcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgbWlzc2lsZUNvbnRyb2xzQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVBZGRSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVMYXVuY2hCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlTGF1bmNoVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVMYXVuY2hJbmZvOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlRGVsZXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTcGVlZFNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNwZWVkVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlQWdyb0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlQWdyb1NsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUFncm9WYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVIZWF0Q2FwYWNpdHlDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUhlYXRDYXBhY2l0eVNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUhlYXRDYXBhY2l0eVZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUNyYWZ0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUNvdW50U3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVDcmFmdFRpbWVyRGl2OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgY3JhZnRUaW1lUmVtYWluaW5nU3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNwYXduQm90QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc3Bhd25Cb3RUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG4gIGxldCByb3V0ZVByZXZCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByb3V0ZU5leHRCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByb3V0ZU1lbnVUb2dnbGU6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByb3V0ZU1lbnU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByZW5hbWVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBkZWxldGVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlUm91dGVOYW1lTGFiZWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlUm91dGVDb3VudExhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG4gIGxldCBoZWxwVG9nZ2xlOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgaGVscE92ZXJsYXk6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBoZWxwQ2xvc2VCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBoZWxwVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgaGVhdEJhckZpbGw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBoZWF0QmFyUGxhbm5lZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGhlYXRWYWx1ZVRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzcGVlZE1hcmtlcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHN0YWxsT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgbWFya2VyQWxpZ25lZCA9IGZhbHNlO1xuICBsZXQgaGVhdFdhcm5BY3RpdmUgPSBmYWxzZTtcbiAgbGV0IHN0YWxsQWN0aXZlID0gZmFsc2U7XG4gIGxldCBkdWFsTWV0ZXJBbGVydCA9IGZhbHNlO1xuICBsZXQgbGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCA9IFwiXCI7XG4gIGxldCBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgbGV0IGxhc3RNaXNzaWxlQ29uZmlnU2VudDogeyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGNhY2hlRG9tKCk6IENhY2hlZENhbnZhcyB7XG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdlwiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gICAgY3R4ID0gY2FudmFzPy5nZXRDb250ZXh0KFwiMmRcIikgPz8gbnVsbDtcbiAgICBIUHNwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtaHBcIik7XG4gICAgc2hpcENvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1jb250cm9sc1wiKTtcbiAgICBzaGlwQ2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIHNoaXBTZXRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2V0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBzaGlwU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgc2hpcFJvdXRlc0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZXNcIik7XG4gICAgc2hpcFJvdXRlTGVnID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXJvdXRlLWxlZ1wiKTtcbiAgICBzaGlwUm91dGVTcGVlZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZS1zcGVlZFwiKTtcbiAgICBzaGlwRGVsZXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgc2hpcFNwZWVkQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1jYXJkXCIpO1xuICAgIHNoaXBTcGVlZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgc2hpcFNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtdmFsdWVcIik7XG5cbiAgICBtaXNzaWxlQ29udHJvbHNDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWNvbnRyb2xzXCIpO1xuICAgIG1pc3NpbGVBZGRSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVMYXVuY2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlTGF1bmNoVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2gtdGV4dFwiKTtcbiAgICBtaXNzaWxlTGF1bmNoSW5mbyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2gtaW5mb1wiKTtcbiAgICBtaXNzaWxlU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgbWlzc2lsZVNlbGVjdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZWxlY3RcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVEZWxldGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtZGVsZXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlU3BlZWRDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLWNhcmRcIik7XG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlU3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC12YWx1ZVwiKTtcbiAgICBtaXNzaWxlQWdyb0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1jYXJkXCIpO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVBZ3JvVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby12YWx1ZVwiKTtcbiAgICBtaXNzaWxlSGVhdENhcGFjaXR5Q2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1oZWF0LWNhcGFjaXR5LWNhcmRcIik7XG4gICAgbWlzc2lsZUhlYXRDYXBhY2l0eVNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1oZWF0LWNhcGFjaXR5LXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlSGVhdENhcGFjaXR5VmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtaGVhdC1jYXBhY2l0eS12YWx1ZVwiKTtcbiAgICBtaXNzaWxlQ3JhZnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY3JhZnRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVDb3VudFNwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY291bnRcIik7XG4gICAgbWlzc2lsZUNyYWZ0VGltZXJEaXYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY3JhZnQtdGltZXJcIik7XG4gICAgY3JhZnRUaW1lUmVtYWluaW5nU3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3JhZnQtdGltZS1yZW1haW5pbmdcIik7XG5cbiAgICBzcGF3bkJvdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBzcGF3bkJvdFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdC10ZXh0XCIpO1xuICAgIGtpbGxzU3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1raWxsc1wiKTtcbiAgICByb3V0ZVByZXZCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIHJvdXRlTmV4dEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbmV4dFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgcm91dGVNZW51VG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51LXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgcm91dGVNZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51XCIpO1xuICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVuYW1lLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVsZXRlLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2xlYXItbWlzc2lsZS13YXlwb2ludHNcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVSb3V0ZU5hbWVMYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1yb3V0ZS1uYW1lXCIpO1xuICAgIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtY291bnRcIik7XG5cbiAgICBoZWxwVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgaGVscE92ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtb3ZlcmxheVwiKTtcbiAgICBoZWxwQ2xvc2VCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtY2xvc2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGhlbHBUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRleHRcIik7XG5cbiAgICBoZWF0QmFyRmlsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItZmlsbFwiKTtcbiAgICBoZWF0QmFyUGxhbm5lZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItcGxhbm5lZFwiKTtcbiAgICBoZWF0VmFsdWVUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWF0LXZhbHVlLXRleHRcIik7XG4gICAgc3BlZWRNYXJrZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkLW1hcmtlclwiKTtcbiAgICBtaXNzaWxlU3BlZWRNYXJrZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtbWFya2VyXCIpO1xuICAgIHN0YWxsT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhbGwtb3ZlcmxheVwiKTtcblxuICAgIGNvbnN0IHNsaWRlckRlZmF1bHQgPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlcj8udmFsdWUgPz8gXCIxNTBcIik7XG4gICAgbG9naWMuc2V0RGVmYXVsdFNoaXBTcGVlZChOdW1iZXIuaXNGaW5pdGUoc2xpZGVyRGVmYXVsdCkgPyBzbGlkZXJEZWZhdWx0IDogMTUwKTtcbiAgICBpZiAobWlzc2lsZVNwZWVkU2xpZGVyKSB7XG4gICAgICBtaXNzaWxlU3BlZWRTbGlkZXIuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBjYW52YXMsIGN0eCB9O1xuICB9XG5cbiAgZnVuY3Rpb24gYmluZFVJKCk6IHZvaWQge1xuICAgIHNwYXduQm90QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgaWYgKHNwYXduQm90QnRuLmRpc2FibGVkKSByZXR1cm47XG5cbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJzcGF3bl9ib3RcIiB9KTtcbiAgICAgIGJ1cy5lbWl0KFwiYm90OnNwYXduUmVxdWVzdGVkXCIpO1xuXG4gICAgICBzcGF3bkJvdEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBpZiAoc3Bhd25Cb3RUZXh0KSB7XG4gICAgICAgIHNwYXduQm90VGV4dC50ZXh0Q29udGVudCA9IFwiU3Bhd25lZFwiO1xuICAgICAgfVxuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaWYgKHNwYXduQm90QnRuKSB7XG4gICAgICAgICAgc3Bhd25Cb3RCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc3Bhd25Cb3RUZXh0KSB7XG4gICAgICAgICAgc3Bhd25Cb3RUZXh0LnRleHRDb250ZW50ID0gXCJCb3RcIjtcbiAgICAgICAgfVxuICAgICAgfSwgNTAwMCk7XG4gICAgfSk7XG5cbiAgICBzaGlwQ2xlYXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgbG9naWMuY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgIGJ1cy5lbWl0KFwic2hpcDpjbGVhckludm9rZWRcIik7XG4gICAgfSk7XG5cbiAgICBzaGlwU2V0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICAgIH0pO1xuXG4gICAgc2hpcFNlbGVjdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNlbGVjdFwiKTtcbiAgICB9KTtcblxuICAgIHNoaXBTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSByZXR1cm47XG4gICAgICB1cGRhdGVTcGVlZExhYmVsKHZhbHVlKTtcbiAgICAgIGxvZ2ljLnNldERlZmF1bHRTaGlwU3BlZWQodmFsdWUpO1xuICAgICAgY29uc3Qgc2VsZWN0aW9uID0gbG9naWMuZ2V0U2VsZWN0aW9uKCk7XG4gICAgICBpZiAoXG4gICAgICAgIHNlbGVjdGlvbiAmJlxuICAgICAgICBzdGF0ZS5tZSAmJlxuICAgICAgICBBcnJheS5pc0FycmF5KHN0YXRlLm1lLndheXBvaW50cykgJiZcbiAgICAgICAgc3RhdGUubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF1cbiAgICAgICkge1xuICAgICAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwidXBkYXRlX3dheXBvaW50XCIsIGluZGV4OiBzZWxlY3Rpb24uaW5kZXgsIHNwZWVkOiB2YWx1ZSB9KTtcbiAgICAgICAgc3RhdGUubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0uc3BlZWQgPSB2YWx1ZTtcbiAgICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xuICAgICAgfVxuICAgICAgY29uc3QgaGVhdCA9IHN0YXRlLm1lPy5oZWF0O1xuICAgICAgaWYgKGhlYXQpIHtcbiAgICAgICAgY29uc3QgdG9sZXJhbmNlID0gTWF0aC5tYXgoNSwgaGVhdC5tYXJrZXJTcGVlZCAqIDAuMDIpO1xuICAgICAgICBjb25zdCBkaWZmID0gTWF0aC5hYnModmFsdWUgLSBoZWF0Lm1hcmtlclNwZWVkKTtcbiAgICAgICAgY29uc3QgaW5SYW5nZSA9IGRpZmYgPD0gdG9sZXJhbmNlO1xuICAgICAgICBpZiAoaW5SYW5nZSAmJiAhbWFya2VyQWxpZ25lZCkge1xuICAgICAgICAgIG1hcmtlckFsaWduZWQgPSB0cnVlO1xuICAgICAgICAgIGJ1cy5lbWl0KFwiaGVhdDptYXJrZXJBbGlnbmVkXCIsIHsgdmFsdWUsIG1hcmtlcjogaGVhdC5tYXJrZXJTcGVlZCB9KTtcbiAgICAgICAgfSBlbHNlIGlmICghaW5SYW5nZSAmJiBtYXJrZXJBbGlnbmVkKSB7XG4gICAgICAgICAgbWFya2VyQWxpZ25lZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtYXJrZXJBbGlnbmVkID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBidXMuZW1pdChcInNoaXA6c3BlZWRDaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gICAgfSk7XG5cbiAgICBzaGlwRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGxvZ2ljLmRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlQWRkUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF9taXNzaWxlX3JvdXRlXCIgfSk7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlTGF1bmNoQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGxvZ2ljLmxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIH0pO1xuXG4gICAgbWlzc2lsZVNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZWxlY3RcIik7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGxvZ2ljLmRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiKTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgICAgY29uc3Qgc2xpZGVyID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICBpZiAoc2xpZGVyLmRpc2FibGVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJhdyA9IHBhcnNlRmxvYXQoc2xpZGVyLnZhbHVlKTtcbiAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHJhdykpIHJldHVybjtcbiAgICAgIGNvbnN0IG1pblNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1pbiA/PyBNSVNTSUxFX01JTl9TUEVFRDtcbiAgICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICAgIGNvbnN0IGNsYW1wZWRWYWx1ZSA9IGNsYW1wKHJhdywgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IGNsYW1wZWRWYWx1ZS50b0ZpeGVkKDApO1xuICAgICAgaWYgKG1pc3NpbGVTcGVlZFZhbHVlKSB7XG4gICAgICAgIG1pc3NpbGVTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7Y2xhbXBlZFZhbHVlLnRvRml4ZWQoMCl9YDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBjb25zdCBtaXNzaWxlU2VsZWN0aW9uID0gbG9naWMuZ2V0TWlzc2lsZVNlbGVjdGlvbigpO1xuICAgICAgaWYgKFxuICAgICAgICByb3V0ZSAmJlxuICAgICAgICBtaXNzaWxlU2VsZWN0aW9uICYmXG4gICAgICAgIG1pc3NpbGVTZWxlY3Rpb24udHlwZSA9PT0gXCJsZWdcIiAmJlxuICAgICAgICBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgJiZcbiAgICAgICAgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA+PSAwICYmXG4gICAgICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoXG4gICAgICApIHtcbiAgICAgICAgcm91dGUud2F5cG9pbnRzID0gcm91dGUud2F5cG9pbnRzLm1hcCgodywgaWR4KSA9PlxuICAgICAgICAgIGlkeCA9PT0gbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA/IHsgLi4udywgc3BlZWQ6IGNsYW1wZWRWYWx1ZSB9IDogd1xuICAgICAgICApO1xuICAgICAgICBzZW5kTWVzc2FnZSh7XG4gICAgICAgICAgdHlwZTogXCJ1cGRhdGVfbWlzc2lsZV93YXlwb2ludF9zcGVlZFwiLFxuICAgICAgICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICAgICAgICBpbmRleDogbWlzc2lsZVNlbGVjdGlvbi5pbmRleCxcbiAgICAgICAgICBzcGVlZDogY2xhbXBlZFZhbHVlLFxuICAgICAgICB9KTtcbiAgICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlOiBjbGFtcGVkVmFsdWUsIGluZGV4OiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY2ZnID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNwZWVkOiBjbGFtcGVkVmFsdWUsXG4gICAgICAgICAgICBhZ3JvUmFkaXVzOiBzdGF0ZS5taXNzaWxlQ29uZmlnLmFncm9SYWRpdXMsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzdGF0ZS5taXNzaWxlQ29uZmlnLFxuICAgICAgICAgIHN0YXRlLm1pc3NpbGVMaW1pdHNcbiAgICAgICAgKTtcbiAgICAgICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgICAgICAgc2VuZE1pc3NpbGVDb25maWcoY2ZnKTtcbiAgICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlOiBjbGFtcGVkVmFsdWUsIGluZGV4OiAtMSB9KTtcbiAgICAgIH1cbiAgICAgIGxvZ2ljLnJlY29yZE1pc3NpbGVMZWdTcGVlZChjbGFtcGVkVmFsdWUpO1xuICAgIH0pO1xuXG4gICAgbWlzc2lsZUFncm9TbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHJhdyA9IHBhcnNlRmxvYXQoKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShyYXcpKSByZXR1cm47XG4gICAgICBjb25zdCBtaW5BZ3JvID0gc3RhdGUubWlzc2lsZUxpbWl0cy5hZ3JvTWluID8/IE1JU1NJTEVfTUlOX0FHUk87XG4gICAgICBjb25zdCBjbGFtcGVkVmFsdWUgPSBNYXRoLm1heChtaW5BZ3JvLCByYXcpO1xuICAgICAgbWlzc2lsZUFncm9TbGlkZXIudmFsdWUgPSBjbGFtcGVkVmFsdWUudG9GaXhlZCgwKTtcbiAgICAgIGlmIChtaXNzaWxlQWdyb1ZhbHVlKSB7XG4gICAgICAgIG1pc3NpbGVBZ3JvVmFsdWUudGV4dENvbnRlbnQgPSBgJHtjbGFtcGVkVmFsdWUudG9GaXhlZCgwKX1gO1xuICAgICAgfVxuICAgICAgdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSSh7IGFncm9SYWRpdXM6IGNsYW1wZWRWYWx1ZSB9KTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiLCB7IHZhbHVlOiBjbGFtcGVkVmFsdWUgfSk7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlSGVhdENhcGFjaXR5U2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBjb25zdCByYXcgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocmF3KSkgcmV0dXJuO1xuICAgICAgY29uc3QgY2xhbXBlZFZhbHVlID0gTWF0aC5tYXgoODAsIE1hdGgubWluKDIwMCwgcmF3KSk7XG4gICAgICBtaXNzaWxlSGVhdENhcGFjaXR5U2xpZGVyLnZhbHVlID0gY2xhbXBlZFZhbHVlLnRvRml4ZWQoMCk7XG4gICAgICBpZiAobWlzc2lsZUhlYXRDYXBhY2l0eVZhbHVlKSB7XG4gICAgICAgIG1pc3NpbGVIZWF0Q2FwYWNpdHlWYWx1ZS50ZXh0Q29udGVudCA9IGAke2NsYW1wZWRWYWx1ZS50b0ZpeGVkKDApfWA7XG4gICAgICB9XG4gICAgICBzdGF0ZS5jcmFmdEhlYXRDYXBhY2l0eSA9IGNsYW1wZWRWYWx1ZTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVDcmFmdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGlmIChtaXNzaWxlQ3JhZnRCdG4uZGlzYWJsZWQpIHJldHVybjtcblxuICAgICAgLy8gRmluZCB0aGUgY3JhZnQgbm9kZSBmb3IgdGhlIHNlbGVjdGVkIGhlYXQgY2FwYWNpdHlcbiAgICAgIGNvbnN0IGhlYXRDYXAgPSBzdGF0ZS5jcmFmdEhlYXRDYXBhY2l0eTtcbiAgICAgIGxldCBub2RlSWQgPSBcImNyYWZ0Lm1pc3NpbGUuYmFzaWNcIjsgLy8gRGVmYXVsdFxuXG4gICAgICBpZiAoc3RhdGUuZGFnKSB7XG4gICAgICAgIC8vIEZpbmQgdGhlIGJlc3QgbWF0Y2hpbmcgY3JhZnQgbm9kZSBiYXNlZCBvbiBoZWF0IGNhcGFjaXR5XG4gICAgICAgIGNvbnN0IGNyYWZ0Tm9kZXMgPSBzdGF0ZS5kYWcubm9kZXMuZmlsdGVyKG4gPT4gbi5raW5kID09PSBcImNyYWZ0XCIgJiYgbi5pZC5pbmNsdWRlcyhcIm1pc3NpbGVcIikpO1xuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2YgY3JhZnROb2Rlcykge1xuICAgICAgICAgIGNvbnN0IG5vZGVIZWF0Q2FwID0gcGFyc2VJbnQobm9kZS5pZC5tYXRjaCgvKFxcZCspLyk/LlsxXSB8fCBcIjgwXCIpO1xuICAgICAgICAgIGlmIChNYXRoLmFicyhub2RlSGVhdENhcCAtIGhlYXRDYXApIDwgNSkge1xuICAgICAgICAgICAgbm9kZUlkID0gbm9kZS5pZDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVybWluZSB0aGUgcmlnaHQgbm9kZSBiYXNlZCBvbiBoZWF0IGNhcGFjaXR5IHJhbmdlc1xuICAgICAgICBpZiAoaGVhdENhcCA+PSAxODApIHtcbiAgICAgICAgICBub2RlSWQgPSBcImNyYWZ0Lm1pc3NpbGUuZXh0ZW5kZWRcIjtcbiAgICAgICAgfSBlbHNlIGlmIChoZWF0Q2FwID49IDE0MCkge1xuICAgICAgICAgIG5vZGVJZCA9IFwiY3JhZnQubWlzc2lsZS5oaWdoX2hlYXRcIjtcbiAgICAgICAgfSBlbHNlIGlmIChoZWF0Q2FwID49IDExMCkge1xuICAgICAgICAgIG5vZGVJZCA9IFwiY3JhZnQubWlzc2lsZS5sb25nX3JhbmdlXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbm9kZUlkID0gXCJjcmFmdC5taXNzaWxlLmJhc2ljXCI7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRhZ19zdGFydFwiLCBub2RlX2lkOiBub2RlSWQgfSk7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6Y3JhZnRSZXF1ZXN0ZWRcIiwgeyBub2RlSWQsIGhlYXRDYXBhY2l0eTogaGVhdENhcCB9KTtcbiAgICB9KTtcblxuICAgIHJvdXRlUHJldkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGxvZ2ljLmN5Y2xlTWlzc2lsZVJvdXRlKC0xKSk7XG4gICAgcm91dGVOZXh0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gbG9naWMuY3ljbGVNaXNzaWxlUm91dGUoMSkpO1xuXG4gICAgcm91dGVNZW51VG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgcm91dGVNZW51Py5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiKTtcbiAgICB9KTtcblxuICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgICBjb25zdCBuZXh0TmFtZSA9IHByb21wdChcIlJlbmFtZSByb3V0ZVwiLCByb3V0ZS5uYW1lID8/IFwiXCIpID8/IFwiXCI7XG4gICAgICBjb25zdCB0cmltbWVkID0gbmV4dE5hbWUudHJpbSgpO1xuICAgICAgaWYgKHRyaW1tZWQgPT09IHJvdXRlLm5hbWUpIHJldHVybjtcbiAgICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgICAgdHlwZTogXCJyZW5hbWVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgICAgIG5hbWU6IHRyaW1tZWQsXG4gICAgICB9KTtcbiAgICAgIHJvdXRlLm5hbWUgPSB0cmltbWVkO1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9KTtcblxuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiZGVsZXRlX21pc3NpbGVfcm91dGVcIiwgcm91dGVfaWQ6IHJvdXRlLmlkIH0pO1xuICAgIH0pO1xuXG4gICAgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgcm91dGUgPSBsb2dpYy5nZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJjbGVhcl9taXNzaWxlX3dheXBvaW50c1wiLCByb3V0ZV9pZDogcm91dGUuaWQgfSk7XG4gICAgICByb3V0ZS53YXlwb2ludHMgPSBbXTtcbiAgICAgIGxvZ2ljLnNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH0pO1xuXG4gICAgaGVscFRvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEhlbHBWaXNpYmxlKHRydWUpO1xuICAgIH0pO1xuXG4gICAgaGVscENsb3NlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgIH0pO1xuXG4gICAgYnVzLm9uKFwic2hpcDpsZWdTZWxlY3RlZFwiLCAoKSA9PiB7XG4gICAgICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gICAgfSk7XG4gICAgYnVzLm9uKFwic2hpcDp3YXlwb2ludEFkZGVkXCIsICgpID0+IHtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG4gICAgfSk7XG4gICAgYnVzLm9uKFwic2hpcDp3YXlwb2ludERlbGV0ZWRcIiwgKCkgPT4ge1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIiwgKCkgPT4ge1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJtaXNzaWxlOnNlbGVjdGlvbkNoYW5nZWRcIiwgKCkgPT4ge1xuICAgICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIiwgKCkgPT4ge1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiLCAoKSA9PiB7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH0pO1xuICAgIGJ1cy5vbihcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsICgpID0+IHtcbiAgICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRDYW52YXMoKTogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsIHtcbiAgICByZXR1cm4gY2FudmFzO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0Q29udGV4dCgpOiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQgfCBudWxsIHtcbiAgICByZXR1cm4gY3R4O1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFzaGlwU3BlZWRWYWx1ZSkgcmV0dXJuO1xuICAgIHNoaXBTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7dmFsdWUudG9GaXhlZCgwKX0gdS9zYDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkanVzdFNsaWRlclZhbHVlKFxuICAgIGlucHV0OiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCxcbiAgICBzdGVwczogbnVtYmVyLFxuICAgIGNvYXJzZTogYm9vbGVhblxuICApOiBudW1iZXIgfCBudWxsIHtcbiAgICBpZiAoIWlucHV0KSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5hYnMocGFyc2VGbG9hdChpbnB1dC5zdGVwKSkgfHwgMTtcbiAgICBjb25zdCBtdWx0aXBsaWVyID0gY29hcnNlID8gNCA6IDE7XG4gICAgY29uc3QgbWluID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWluKSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1pbikgOiAtSW5maW5pdHk7XG4gICAgY29uc3QgbWF4ID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWF4KSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1heCkgOiBJbmZpbml0eTtcbiAgICBjb25zdCBjdXJyZW50ID0gcGFyc2VGbG9hdChpbnB1dC52YWx1ZSkgfHwgMDtcbiAgICBsZXQgbmV4dCA9IGN1cnJlbnQgKyBzdGVwcyAqIHN0ZXAgKiBtdWx0aXBsaWVyO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobWluKSkgbmV4dCA9IE1hdGgubWF4KG1pbiwgbmV4dCk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtYXgpKSBuZXh0ID0gTWF0aC5taW4obWF4LCBuZXh0KTtcbiAgICBpZiAoTWF0aC5hYnMobmV4dCAtIGN1cnJlbnQpIDwgMWUtNCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlucHV0LnZhbHVlID0gU3RyaW5nKG5leHQpO1xuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIiwgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICByZXR1cm4gbmV4dDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkanVzdFNoaXBTcGVlZChzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBhZGp1c3RTbGlkZXJWYWx1ZShzaGlwU3BlZWRTbGlkZXIsIHN0ZXBzLCBjb2Fyc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gYWRqdXN0TWlzc2lsZUFncm8oc3RlcHM6IG51bWJlciwgY29hcnNlOiBib29sZWFuKTogdm9pZCB7XG4gICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIHN0ZXBzLCBjb2Fyc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gYWRqdXN0TWlzc2lsZVNwZWVkKHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIgJiYgIW1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCkge1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCBzdGVwcywgY29hcnNlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTaGlwU2xpZGVyVmFsdWUodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghc2hpcFNwZWVkU2xpZGVyKSByZXR1cm47XG4gICAgc2hpcFNwZWVkU2xpZGVyLnZhbHVlID0gdmFsdWUudG9GaXhlZCgwKTtcbiAgICB1cGRhdGVTcGVlZExhYmVsKHZhbHVlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk6IHZvaWQge1xuICAgIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGUubWlzc2lsZVJvdXRlcykgPyBzdGF0ZS5taXNzaWxlUm91dGVzIDogW107XG4gICAgY29uc3QgYWN0aXZlUm91dGUgPSBsb2dpYy5nZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAobWlzc2lsZVJvdXRlTmFtZUxhYmVsKSB7XG4gICAgICBpZiAoIWFjdGl2ZVJvdXRlKSB7XG4gICAgICAgIG1pc3NpbGVSb3V0ZU5hbWVMYWJlbC50ZXh0Q29udGVudCA9IHJvdXRlcy5sZW5ndGggPT09IDAgPyBcIk5vIHJvdXRlXCIgOiBcIlJvdXRlXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSBhY3RpdmVSb3V0ZS5uYW1lIHx8IFwiUm91dGVcIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobWlzc2lsZVJvdXRlQ291bnRMYWJlbCkge1xuICAgICAgY29uc3QgY291bnQgPVxuICAgICAgICBhY3RpdmVSb3V0ZSAmJiBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgPyBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICAgIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwudGV4dENvbnRlbnQgPSBgJHtjb3VudH0gcHRzYDtcbiAgICB9XG5cbiAgICBpZiAoZGVsZXRlTWlzc2lsZVJvdXRlQnRuKSB7XG4gICAgICBkZWxldGVNaXNzaWxlUm91dGVCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gICAgfVxuICAgIGlmIChyZW5hbWVNaXNzaWxlUm91dGVCdG4pIHtcbiAgICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZTtcbiAgICB9XG4gICAgaWYgKGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bikge1xuICAgICAgY29uc3QgY291bnQgPVxuICAgICAgICBhY3RpdmVSb3V0ZSAmJiBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgPyBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZSB8fCBjb3VudCA9PT0gMDtcbiAgICB9XG4gICAgaWYgKHJvdXRlUHJldkJ0bikge1xuICAgICAgcm91dGVQcmV2QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICAgIH1cbiAgICBpZiAocm91dGVOZXh0QnRuKSB7XG4gICAgICByb3V0ZU5leHRCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gICAgfVxuXG4gICAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpOiB2b2lkIHtcbiAgICBsb2dpYy5lbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZSA9IGxvZ2ljLmdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGNvbnN0IG1pc3NpbGVTZWwgPSBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCk7XG4gICAgY29uc3Qgcm91dGVIYXNTZWxlY3Rpb24gPVxuICAgICAgISFhY3RpdmVSb3V0ZSAmJlxuICAgICAgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpICYmXG4gICAgICAhIW1pc3NpbGVTZWwgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPj0gMCAmJlxuICAgICAgbWlzc2lsZVNlbC5pbmRleCA8IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGg7XG4gICAgaWYgKCFyb3V0ZUhhc1NlbGVjdGlvbikge1xuICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICB9XG4gICAgY29uc3QgY2ZnID0gc3RhdGUubWlzc2lsZUNvbmZpZztcbiAgICBhcHBseU1pc3NpbGVVSShjZmcpO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gYXBwbHlNaXNzaWxlVUkoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gICAgaWYgKG1pc3NpbGVBZ3JvU2xpZGVyKSB7XG4gICAgICBjb25zdCBtaW5BZ3JvID0gc3RhdGUubWlzc2lsZUxpbWl0cy5hZ3JvTWluID8/IE1JU1NJTEVfTUlOX0FHUk87XG4gICAgICBjb25zdCBtYXhBZ3JvID0gTWF0aC5tYXgoNTAwMCwgTWF0aC5jZWlsKChjZmcuYWdyb1JhZGl1cyArIDUwMCkgLyA1MDApICogNTAwKTtcbiAgICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5BZ3JvKTtcbiAgICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1heCA9IFN0cmluZyhtYXhBZ3JvKTtcbiAgICAgIG1pc3NpbGVBZ3JvU2xpZGVyLnZhbHVlID0gY2ZnLmFncm9SYWRpdXMudG9GaXhlZCgwKTtcbiAgICB9XG4gICAgaWYgKG1pc3NpbGVBZ3JvVmFsdWUpIHtcbiAgICAgIG1pc3NpbGVBZ3JvVmFsdWUudGV4dENvbnRlbnQgPSBjZmcuYWdyb1JhZGl1cy50b0ZpeGVkKDApO1xuICAgIH1cbiAgICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xuICAgIHVwZGF0ZVNwZWVkTWFya2VyKCk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKFxuICAgIG92ZXJyaWRlczogUGFydGlhbDx7IGFncm9SYWRpdXM6IG51bWJlciB9PiA9IHt9XG4gICk6IHZvaWQge1xuICAgIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZS5taXNzaWxlQ29uZmlnO1xuICAgIGNvbnN0IGNmZyA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyhcbiAgICAgIHtcbiAgICAgICAgc3BlZWQ6IGN1cnJlbnQuc3BlZWQsXG4gICAgICAgIGFncm9SYWRpdXM6IG92ZXJyaWRlcy5hZ3JvUmFkaXVzID8/IGN1cnJlbnQuYWdyb1JhZGl1cyxcbiAgICAgIH0sXG4gICAgICBjdXJyZW50LFxuICAgICAgc3RhdGUubWlzc2lsZUxpbWl0c1xuICAgICk7XG4gICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgICBhcHBseU1pc3NpbGVVSShjZmcpO1xuICAgIGNvbnN0IGxhc3QgPSBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQ7XG4gICAgY29uc3QgbmVlZHNTZW5kID1cbiAgICAgICFsYXN0IHx8IE1hdGguYWJzKChsYXN0LmFncm9SYWRpdXMgPz8gMCkgLSBjZmcuYWdyb1JhZGl1cykgPiA1O1xuICAgIGlmIChuZWVkc1NlbmQpIHtcbiAgICAgIHNlbmRNaXNzaWxlQ29uZmlnKGNmZyk7XG4gICAgfVxuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIH1cblxuICBmdW5jdGlvbiBzZW5kTWlzc2lsZUNvbmZpZyhjZmc6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0pOiB2b2lkIHtcbiAgICBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQgPSB7XG4gICAgICBzcGVlZDogY2ZnLnNwZWVkLFxuICAgICAgYWdyb1JhZGl1czogY2ZnLmFncm9SYWRpdXMsXG4gICAgfTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImNvbmZpZ3VyZV9taXNzaWxlXCIsXG4gICAgICBtaXNzaWxlX3NwZWVkOiBjZmcuc3BlZWQsXG4gICAgICBtaXNzaWxlX2Fncm86IGNmZy5hZ3JvUmFkaXVzLFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpOiB2b2lkIHtcbiAgICBpZiAoIXNoaXBSb3V0ZXNDb250YWluZXIgfHwgIXNoaXBSb3V0ZUxlZyB8fCAhc2hpcFJvdXRlU3BlZWQgfHwgIXNoaXBEZWxldGVCdG4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgd3BzID0gc3RhdGUubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpID8gc3RhdGUubWUud2F5cG9pbnRzIDogW107XG4gICAgY29uc3Qgc2VsZWN0aW9uID0gbG9naWMuZ2V0U2VsZWN0aW9uKCk7XG4gICAgY29uc3QgaGFzVmFsaWRTZWxlY3Rpb24gPVxuICAgICAgc2VsZWN0aW9uICE9PSBudWxsICYmIHNlbGVjdGlvbi5pbmRleCA+PSAwICYmIHNlbGVjdGlvbi5pbmRleCA8IHdwcy5sZW5ndGg7XG4gICAgY29uc3QgaXNTaGlwQ29udGV4dCA9IHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIjtcblxuICAgIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUub3BhY2l0eSA9IGlzU2hpcENvbnRleHQgPyBcIjFcIiA6IFwiMC42XCI7XG5cbiAgICBpZiAoIXN0YXRlLm1lIHx8ICFoYXNWYWxpZFNlbGVjdGlvbiB8fCAhc2VsZWN0aW9uKSB7XG4gICAgICBzaGlwUm91dGVMZWcudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgc2hpcFJvdXRlU3BlZWQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgc2hpcERlbGV0ZUJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBpZiAoaXNTaGlwQ29udGV4dCkge1xuICAgICAgICBzZXRTaGlwU2xpZGVyVmFsdWUobG9naWMuZ2V0RGVmYXVsdFNoaXBTcGVlZCgpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB3cCA9IHdwc1tzZWxlY3Rpb24uaW5kZXhdO1xuICAgIGNvbnN0IHNwZWVkID1cbiAgICAgIHdwICYmIHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiA/IHdwLnNwZWVkIDogbG9naWMuZ2V0RGVmYXVsdFNoaXBTcGVlZCgpO1xuICAgIGlmIChcbiAgICAgIGlzU2hpcENvbnRleHQgJiZcbiAgICAgIHNoaXBTcGVlZFNsaWRlciAmJlxuICAgICAgTWF0aC5hYnMocGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIudmFsdWUpIC0gc3BlZWQpID4gMC4yNVxuICAgICkge1xuICAgICAgc2V0U2hpcFNsaWRlclZhbHVlKHNwZWVkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdXBkYXRlU3BlZWRMYWJlbChzcGVlZCk7XG4gICAgfVxuICAgIGNvbnN0IGRpc3BsYXlJbmRleCA9IHNlbGVjdGlvbi5pbmRleCArIDE7XG4gICAgc2hpcFJvdXRlTGVnLnRleHRDb250ZW50ID0gYCR7ZGlzcGxheUluZGV4fWA7XG4gICAgc2hpcFJvdXRlU3BlZWQudGV4dENvbnRlbnQgPSBgJHtzcGVlZC50b0ZpeGVkKDApfSB1L3NgO1xuICAgIHNoaXBEZWxldGVCdG4uZGlzYWJsZWQgPSAhaXNTaGlwQ29udGV4dDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTogdm9pZCB7XG4gICAgY29uc3Qgcm91dGUgPSBsb2dpYy5nZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBjb25zdCBjb3VudCA9IHJvdXRlICYmIEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIGNvbnN0IG1pc3NpbGVTZWwgPSBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCk7XG4gICAgY29uc3QgaXNXYXlwb2ludFNlbGVjdGlvbiA9XG4gICAgICBtaXNzaWxlU2VsICE9PSBudWxsICYmXG4gICAgICBtaXNzaWxlU2VsICE9PSB1bmRlZmluZWQgJiZcbiAgICAgIG1pc3NpbGVTZWwudHlwZSA9PT0gXCJ3YXlwb2ludFwiICYmXG4gICAgICBtaXNzaWxlU2VsLmluZGV4ID49IDAgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPCBjb3VudDtcbiAgICBpZiAobWlzc2lsZURlbGV0ZUJ0bikge1xuICAgICAgbWlzc2lsZURlbGV0ZUJ0bi5kaXNhYmxlZCA9ICFpc1dheXBvaW50U2VsZWN0aW9uO1xuICAgIH1cbiAgICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTogdm9pZCB7XG4gICAgaWYgKCFtaXNzaWxlU3BlZWRTbGlkZXIgfHwgIW1pc3NpbGVTcGVlZFZhbHVlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbWluU3BlZWQgPSBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWluID8/IE1JU1NJTEVfTUlOX1NQRUVEO1xuICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIubWluID0gU3RyaW5nKG1pblNwZWVkKTtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIubWF4ID0gU3RyaW5nKG1heFNwZWVkKTtcblxuICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgY29uc3QgbWlzc2lsZVNlbCA9IGxvZ2ljLmdldE1pc3NpbGVTZWxlY3Rpb24oKTtcbiAgICBjb25zdCB3YXlwb2ludHMgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMgOiBudWxsO1xuICAgIGxldCBzZWxlY3RlZFNwZWVkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgc2VsZWN0ZWRUeXBlOiBcImxlZ1wiIHwgXCJ3YXlwb2ludFwiIHwgbnVsbCA9IG51bGw7XG5cbiAgICBpZiAoXG4gICAgICB3YXlwb2ludHMgJiZcbiAgICAgIG1pc3NpbGVTZWwgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPj0gMCAmJlxuICAgICAgbWlzc2lsZVNlbC5pbmRleCA8IHdheXBvaW50cy5sZW5ndGhcbiAgICApIHtcbiAgICAgIGNvbnN0IHdwID0gd2F5cG9pbnRzW21pc3NpbGVTZWwuaW5kZXhdO1xuICAgICAgY29uc3QgdmFsdWUgPVxuICAgICAgICB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgJiYgd3Auc3BlZWQgPiAwXG4gICAgICAgICAgPyB3cC5zcGVlZFxuICAgICAgICAgIDogbG9naWMuZ2V0RGVmYXVsdE1pc3NpbGVMZWdTcGVlZCgpO1xuICAgICAgc2VsZWN0ZWRTcGVlZCA9IGNsYW1wKHZhbHVlLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICAgICAgc2VsZWN0ZWRUeXBlID0gbWlzc2lsZVNlbC50eXBlO1xuICAgIH1cblxuICAgIGNvbnN0IHNsaWRlckRpc2FibGVkID0gc2VsZWN0ZWRUeXBlID09PSBcIndheXBvaW50XCI7XG4gICAgbGV0IHNsaWRlclZhbHVlOiBudW1iZXI7XG4gICAgaWYgKHNlbGVjdGVkU3BlZWQgIT09IG51bGwpIHtcbiAgICAgIHNsaWRlclZhbHVlID0gc2VsZWN0ZWRTcGVlZDtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgcmF3VmFsdWUgPSBwYXJzZUZsb2F0KG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSk7XG4gICAgICBjb25zdCBmYWxsYmFjayA9IGxvZ2ljLmdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQoKTtcbiAgICAgIGNvbnN0IHRhcmdldFZhbHVlID0gTnVtYmVyLmlzRmluaXRlKHJhd1ZhbHVlKSA/IHJhd1ZhbHVlIDogZmFsbGJhY2s7XG4gICAgICBzbGlkZXJWYWx1ZSA9IGNsYW1wKHRhcmdldFZhbHVlLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICAgIH1cblxuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCA9IHNsaWRlckRpc2FibGVkO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IHNsaWRlclZhbHVlLnRvRml4ZWQoMCk7XG4gICAgbWlzc2lsZVNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtzbGlkZXJWYWx1ZS50b0ZpeGVkKDApfWA7XG5cbiAgICBpZiAoIXNsaWRlckRpc2FibGVkKSB7XG4gICAgICBsb2dpYy5yZWNvcmRNaXNzaWxlTGVnU3BlZWQoc2xpZGVyVmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldElucHV0Q29udGV4dChjb250ZXh0OiBcInNoaXBcIiB8IFwibWlzc2lsZVwiKTogdm9pZCB7XG4gICAgY29uc3QgbmV4dCA9IGNvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcbiAgICBpZiAodWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IG5leHQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdWlTdGF0ZS5pbnB1dENvbnRleHQgPSBuZXh0O1xuXG4gICAgaWYgKG5leHQgPT09IFwic2hpcFwiKSB7XG4gICAgICBjb25zdCBzaGlwVG9vbFRvVXNlID0gdWlTdGF0ZS5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIiA/IFwic2hpcC1zZWxlY3RcIiA6IFwic2hpcC1zZXRcIjtcbiAgICAgIGlmICh1aVN0YXRlLmFjdGl2ZVRvb2wgIT09IHNoaXBUb29sVG9Vc2UpIHtcbiAgICAgICAgdWlTdGF0ZS5hY3RpdmVUb29sID0gc2hpcFRvb2xUb1VzZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgbWlzc2lsZVRvb2xUb1VzZSA9XG4gICAgICAgIHVpU3RhdGUubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIgPyBcIm1pc3NpbGUtc2VsZWN0XCIgOiBcIm1pc3NpbGUtc2V0XCI7XG4gICAgICBpZiAodWlTdGF0ZS5hY3RpdmVUb29sICE9PSBtaXNzaWxlVG9vbFRvVXNlKSB7XG4gICAgICAgIHVpU3RhdGUuYWN0aXZlVG9vbCA9IG1pc3NpbGVUb29sVG9Vc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgYnVzLmVtaXQoXCJjb250ZXh0OmNoYW5nZWRcIiwgeyBjb250ZXh0OiBuZXh0IH0pO1xuICAgIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEFjdGl2ZVRvb2wodG9vbDogQWN0aXZlVG9vbCk6IHZvaWQge1xuICAgIGlmICh1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IHRvb2wpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB1aVN0YXRlLmFjdGl2ZVRvb2wgPSB0b29sO1xuXG4gICAgaWYgKHRvb2wgPT09IFwic2hpcC1zZXRcIikge1xuICAgICAgdWlTdGF0ZS5zaGlwVG9vbCA9IFwic2V0XCI7XG4gICAgICB1aVN0YXRlLm1pc3NpbGVUb29sID0gbnVsbDtcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBidXMuZW1pdChcInNoaXA6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNldFwiIH0pO1xuICAgIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKSB7XG4gICAgICB1aVN0YXRlLnNoaXBUb29sID0gXCJzZWxlY3RcIjtcbiAgICAgIHVpU3RhdGUubWlzc2lsZVRvb2wgPSBudWxsO1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGJ1cy5lbWl0KFwic2hpcDp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2VsZWN0XCIgfSk7XG4gICAgfSBlbHNlIGlmICh0b29sID09PSBcIm1pc3NpbGUtc2V0XCIpIHtcbiAgICAgIHVpU3RhdGUuc2hpcFRvb2wgPSBudWxsO1xuICAgICAgdWlTdGF0ZS5taXNzaWxlVG9vbCA9IFwic2V0XCI7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2V0XCIgfSk7XG4gICAgfSBlbHNlIGlmICh0b29sID09PSBcIm1pc3NpbGUtc2VsZWN0XCIpIHtcbiAgICAgIHVpU3RhdGUuc2hpcFRvb2wgPSBudWxsO1xuICAgICAgdWlTdGF0ZS5taXNzaWxlVG9vbCA9IFwic2VsZWN0XCI7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZWxlY3RcIiB9KTtcbiAgICB9XG5cbiAgICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0QnV0dG9uU3RhdGUoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmICghYnRuKSByZXR1cm47XG4gICAgaWYgKGFjdGl2ZSkge1xuICAgICAgYnRuLmRhdGFzZXQuc3RhdGUgPSBcImFjdGl2ZVwiO1xuICAgICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcInRydWVcIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlbGV0ZSBidG4uZGF0YXNldC5zdGF0ZTtcbiAgICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJmYWxzZVwiKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpOiB2b2lkIHtcbiAgICBzZXRCdXR0b25TdGF0ZShzaGlwU2V0QnRuLCB1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZXRcIik7XG4gICAgc2V0QnV0dG9uU3RhdGUoc2hpcFNlbGVjdEJ0biwgdWlTdGF0ZS5hY3RpdmVUb29sID09PSBcInNoaXAtc2VsZWN0XCIpO1xuICAgIHNldEJ1dHRvblN0YXRlKG1pc3NpbGVTZXRCdG4sIHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKTtcbiAgICBzZXRCdXR0b25TdGF0ZShtaXNzaWxlU2VsZWN0QnRuLCB1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZWxlY3RcIik7XG5cbiAgICBpZiAoc2hpcENvbnRyb2xzQ2FyZCkge1xuICAgICAgc2hpcENvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIik7XG4gICAgfVxuICAgIGlmIChtaXNzaWxlQ29udHJvbHNDYXJkKSB7XG4gICAgICBtaXNzaWxlQ29udHJvbHNDYXJkLmNsYXNzTGlzdC50b2dnbGUoXCJhY3RpdmVcIiwgdWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRIZWxwVmlzaWJsZShmbGFnOiBib29sZWFuKTogdm9pZCB7XG4gICAgdWlTdGF0ZS5oZWxwVmlzaWJsZSA9IGZsYWc7XG4gICAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgICBidXMuZW1pdChcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgeyB2aXNpYmxlOiB1aVN0YXRlLmhlbHBWaXNpYmxlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlSGVscE92ZXJsYXkoKTogdm9pZCB7XG4gICAgaWYgKCFoZWxwT3ZlcmxheSB8fCAhaGVscFRleHQpIHJldHVybjtcbiAgICBoZWxwT3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiLCB1aVN0YXRlLmhlbHBWaXNpYmxlKTtcbiAgICBoZWxwVGV4dC50ZXh0Q29udGVudCA9IEhFTFBfVEVYVDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpOiB2b2lkIHtcbiAgICBpZiAoIW1pc3NpbGVMYXVuY2hCdG4gfHwgIW1pc3NpbGVMYXVuY2hUZXh0IHx8ICFtaXNzaWxlTGF1bmNoSW5mbykgcmV0dXJuO1xuICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgY29uc3QgY291bnQgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICBjb25zdCByZW1haW5pbmcgPSBsb2dpYy5nZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTtcbiAgICBjb25zdCBjb29saW5nRG93biA9IHJlbWFpbmluZyA+IDAuMDU7XG4gICAgY29uc3Qgc2hvdWxkRGlzYWJsZSA9ICFyb3V0ZSB8fCBjb3VudCA9PT0gMCB8fCBjb29saW5nRG93bjtcbiAgICBtaXNzaWxlTGF1bmNoQnRuLmRpc2FibGVkID0gc2hvdWxkRGlzYWJsZTtcblxuICAgIGNvbnN0IGxhdW5jaFRleHRIVE1MID1cbiAgICAgICc8c3BhbiBjbGFzcz1cImJ0bi10ZXh0LWZ1bGxcIj5MYXVuY2g8L3NwYW4+PHNwYW4gY2xhc3M9XCJidG4tdGV4dC1zaG9ydFwiPkZpcmU8L3NwYW4+JztcbiAgICBsZXQgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuXG4gICAgaWYgKCFyb3V0ZSkge1xuICAgICAgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuICAgIH0gZWxzZSBpZiAoY29vbGluZ0Rvd24pIHtcbiAgICAgIGxhdW5jaEluZm9IVE1MID0gYCR7cmVtYWluaW5nLnRvRml4ZWQoMSl9c2A7XG4gICAgfSBlbHNlIGlmIChyb3V0ZS5uYW1lKSB7XG4gICAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgICAgY29uc3Qgcm91dGVJbmRleCA9IHJvdXRlcy5maW5kSW5kZXgoKHIpID0+IHIuaWQgPT09IHJvdXRlLmlkKSArIDE7XG4gICAgICBsYXVuY2hJbmZvSFRNTCA9IGA8c3BhbiBjbGFzcz1cImJ0bi10ZXh0LWZ1bGxcIj4ke3JvdXRlLm5hbWV9PC9zcGFuPjxzcGFuIGNsYXNzPVwiYnRuLXRleHQtc2hvcnRcIj4ke3JvdXRlSW5kZXh9PC9zcGFuPmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgICB9XG5cbiAgICBpZiAobGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCAhPT0gbGF1bmNoVGV4dEhUTUwpIHtcbiAgICAgIG1pc3NpbGVMYXVuY2hUZXh0LmlubmVySFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICAgICAgbGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICAgIH1cblxuICAgIGlmIChsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MICE9PSBsYXVuY2hJbmZvSFRNTCkge1xuICAgICAgbWlzc2lsZUxhdW5jaEluZm8uaW5uZXJIVE1MID0gbGF1bmNoSW5mb0hUTUw7XG4gICAgICBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gbGF1bmNoSW5mb0hUTUw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUNvdW50RGlzcGxheSgpOiB2b2lkIHtcbiAgICBpZiAoIW1pc3NpbGVDb3VudFNwYW4pIHJldHVybjtcblxuICAgIGxldCBjb3VudCA9IDA7XG4gICAgaWYgKHN0YXRlLmludmVudG9yeSAmJiBzdGF0ZS5pbnZlbnRvcnkuaXRlbXMpIHtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBzdGF0ZS5pbnZlbnRvcnkuaXRlbXMpIHtcbiAgICAgICAgaWYgKGl0ZW0udHlwZSA9PT0gXCJtaXNzaWxlXCIpIHtcbiAgICAgICAgICBjb3VudCArPSBpdGVtLnF1YW50aXR5O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgbWlzc2lsZUNvdW50U3Bhbi50ZXh0Q29udGVudCA9IGNvdW50LnRvU3RyaW5nKCk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVDcmFmdFRpbWVyKCk6IHZvaWQge1xuICAgIGlmICghbWlzc2lsZUNyYWZ0VGltZXJEaXYgfHwgIWNyYWZ0VGltZVJlbWFpbmluZ1NwYW4pIHJldHVybjtcblxuICAgIC8vIExvb2sgZm9yIGFueSBjcmFmdCBub2RlIHRoYXQncyBpbiBwcm9ncmVzc1xuICAgIGxldCBjcmFmdEluUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICBsZXQgcmVtYWluaW5nVGltZSA9IDA7XG5cbiAgICBpZiAoc3RhdGUuZGFnICYmIHN0YXRlLmRhZy5ub2Rlcykge1xuICAgICAgZm9yIChjb25zdCBub2RlIG9mIHN0YXRlLmRhZy5ub2Rlcykge1xuICAgICAgICBpZiAobm9kZS5raW5kID09PSBcImNyYWZ0XCIgJiYgbm9kZS5zdGF0dXMgPT09IFwiaW5fcHJvZ3Jlc3NcIikge1xuICAgICAgICAgIGNyYWZ0SW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgICAgICAgcmVtYWluaW5nVGltZSA9IG5vZGUucmVtYWluaW5nX3M7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY3JhZnRJblByb2dyZXNzICYmIHJlbWFpbmluZ1RpbWUgPiAwKSB7XG4gICAgICBtaXNzaWxlQ3JhZnRUaW1lckRpdi5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgY3JhZnRUaW1lUmVtYWluaW5nU3Bhbi50ZXh0Q29udGVudCA9IE1hdGguY2VpbChyZW1haW5pbmdUaW1lKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBtaXNzaWxlQ3JhZnRUaW1lckRpdi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpOiB2b2lkIHtcbiAgICBjb25zdCBtZXRhID0gc3RhdGUud29ybGRNZXRhID8/IHt9O1xuICAgIGNhbWVyYS51cGRhdGVXb3JsZEZyb21NZXRhKG1ldGEpO1xuXG4gICAgaWYgKEhQc3Bhbikge1xuICAgICAgaWYgKHN0YXRlLm1lICYmIE51bWJlci5pc0Zpbml0ZShzdGF0ZS5tZS5ocCkpIHtcbiAgICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlLm1lLmhwKS50b1N0cmluZygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gXCJcdTIwMTNcIjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGtpbGxzU3Bhbikge1xuICAgICAgaWYgKHN0YXRlLm1lICYmIE51bWJlci5pc0Zpbml0ZShzdGF0ZS5tZS5raWxscykpIHtcbiAgICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlLm1lLmtpbGxzKS50b1N0cmluZygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gXCIwXCI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdXBkYXRlSGVhdEJhcigpO1xuICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG4gICAgdXBkYXRlU3BlZWRNYXJrZXIoKTtcbiAgICB1cGRhdGVTdGFsbE92ZXJsYXkoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUhlYXRCYXIoKTogdm9pZCB7XG4gICAgY29uc3QgaGVhdCA9IHN0YXRlLm1lPy5oZWF0O1xuICAgIGlmICghaGVhdCB8fCAhaGVhdEJhckZpbGwgfHwgIWhlYXRWYWx1ZVRleHQpIHtcbiAgICAgIGhlYXRXYXJuQWN0aXZlID0gZmFsc2U7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcGVyY2VudCA9IChoZWF0LnZhbHVlIC8gaGVhdC5tYXgpICogMTAwO1xuICAgIGhlYXRCYXJGaWxsLnN0eWxlLndpZHRoID0gYCR7cGVyY2VudH0lYDtcblxuICAgIGhlYXRWYWx1ZVRleHQudGV4dENvbnRlbnQgPSBgSGVhdCAke01hdGgucm91bmQoaGVhdC52YWx1ZSl9YDtcblxuICAgIGhlYXRCYXJGaWxsLmNsYXNzTGlzdC5yZW1vdmUoXCJ3YXJuXCIsIFwib3ZlcmhlYXRcIik7XG4gICAgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC5vdmVyaGVhdEF0KSB7XG4gICAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QuYWRkKFwib3ZlcmhlYXRcIik7XG4gICAgfSBlbHNlIGlmIChoZWF0LnZhbHVlID49IGhlYXQud2FybkF0KSB7XG4gICAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QuYWRkKFwid2FyblwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBub3dXYXJuID0gaGVhdC52YWx1ZSA+PSBoZWF0Lndhcm5BdDtcbiAgICBpZiAobm93V2FybiAmJiAhaGVhdFdhcm5BY3RpdmUpIHtcbiAgICAgIGhlYXRXYXJuQWN0aXZlID0gdHJ1ZTtcbiAgICAgIGJ1cy5lbWl0KFwiaGVhdDp3YXJuRW50ZXJlZFwiLCB7IHZhbHVlOiBoZWF0LnZhbHVlLCB3YXJuQXQ6IGhlYXQud2FybkF0IH0pO1xuICAgIH0gZWxzZSBpZiAoIW5vd1dhcm4gJiYgaGVhdFdhcm5BY3RpdmUpIHtcbiAgICAgIGNvbnN0IGNvb2xUaHJlc2hvbGQgPSBNYXRoLm1heCgwLCBoZWF0Lndhcm5BdCAtIDUpO1xuICAgICAgaWYgKGhlYXQudmFsdWUgPD0gY29vbFRocmVzaG9sZCkge1xuICAgICAgICBoZWF0V2FybkFjdGl2ZSA9IGZhbHNlO1xuICAgICAgICBidXMuZW1pdChcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCIsIHsgdmFsdWU6IGhlYXQudmFsdWUsIHdhcm5BdDogaGVhdC53YXJuQXQgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcHJvamVjdFBsYW5uZWRIZWF0KCk6IG51bWJlciB8IG51bGwge1xuICAgIGNvbnN0IHNoaXAgPSBzdGF0ZS5tZTtcbiAgICBpZiAoIXNoaXAgfHwgIUFycmF5LmlzQXJyYXkoc2hpcC53YXlwb2ludHMpIHx8IHNoaXAud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCB8fCAhc2hpcC5oZWF0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBjdXJyZW50SW5kZXhSYXcgPSBzaGlwLmN1cnJlbnRXYXlwb2ludEluZGV4O1xuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9XG4gICAgICB0eXBlb2YgY3VycmVudEluZGV4UmF3ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShjdXJyZW50SW5kZXhSYXcpID8gY3VycmVudEluZGV4UmF3IDogMDtcbiAgICBjb25zdCBjbGFtcGVkSW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjdXJyZW50SW5kZXgsIHNoaXAud2F5cG9pbnRzLmxlbmd0aCkpO1xuICAgIGNvbnN0IHJlbWFpbmluZ1dheXBvaW50cyA9XG4gICAgICBjbGFtcGVkSW5kZXggPiAwID8gc2hpcC53YXlwb2ludHMuc2xpY2UoY2xhbXBlZEluZGV4KSA6IHNoaXAud2F5cG9pbnRzLnNsaWNlKCk7XG5cbiAgICBpZiAocmVtYWluaW5nV2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgcm91dGUgPSBbeyB4OiBzaGlwLngsIHk6IHNoaXAueSwgc3BlZWQ6IHVuZGVmaW5lZCB9LCAuLi5yZW1haW5pbmdXYXlwb2ludHNdO1xuXG4gICAgY29uc3QgaGVhdFBhcmFtcyA9IHtcbiAgICAgIG1hcmtlclNwZWVkOiBzaGlwLmhlYXQubWFya2VyU3BlZWQsXG4gICAgICBrVXA6IHNoaXAuaGVhdC5rVXAsXG4gICAgICBrRG93bjogc2hpcC5oZWF0LmtEb3duLFxuICAgICAgZXhwOiBzaGlwLmhlYXQuZXhwLFxuICAgICAgbWF4OiBzaGlwLmhlYXQubWF4LFxuICAgICAgb3ZlcmhlYXRBdDogc2hpcC5oZWF0Lm92ZXJoZWF0QXQsXG4gICAgICB3YXJuQXQ6IHNoaXAuaGVhdC53YXJuQXQsXG4gICAgfTtcblxuICAgIGNvbnN0IHByb2plY3Rpb24gPSBwcm9qZWN0Um91dGVIZWF0KHJvdXRlLCBzaGlwLmhlYXQudmFsdWUsIGhlYXRQYXJhbXMpO1xuICAgIHJldHVybiBNYXRoLm1heCguLi5wcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cyk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVQbGFubmVkSGVhdEJhcigpOiB2b2lkIHtcbiAgICBpZiAoIWhlYXRCYXJQbGFubmVkKSByZXR1cm47XG4gICAgY29uc3QgcmVzZXRQbGFubmVkQmFyID0gKCkgPT4ge1xuICAgICAgaGVhdEJhclBsYW5uZWQuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gICAgfTtcblxuICAgIGNvbnN0IHNoaXAgPSBzdGF0ZS5tZTtcbiAgICBpZiAoIXNoaXAgfHwgIXNoaXAuaGVhdCkge1xuICAgICAgcmVzZXRQbGFubmVkQmFyKCk7XG4gICAgICBkdWFsTWV0ZXJBbGVydCA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHBsYW5uZWQgPSBwcm9qZWN0UGxhbm5lZEhlYXQoKTtcbiAgICBpZiAocGxhbm5lZCA9PT0gbnVsbCkge1xuICAgICAgcmVzZXRQbGFubmVkQmFyKCk7XG4gICAgICBkdWFsTWV0ZXJBbGVydCA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGFjdHVhbCA9IHNoaXAuaGVhdC52YWx1ZTtcbiAgICBjb25zdCBwZXJjZW50ID0gKHBsYW5uZWQgLyBzaGlwLmhlYXQubWF4KSAqIDEwMDtcbiAgICBoZWF0QmFyUGxhbm5lZC5zdHlsZS53aWR0aCA9IGAke01hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGVyY2VudCkpfSVgO1xuXG4gICAgY29uc3QgZGlmZiA9IHBsYW5uZWQgLSBhY3R1YWw7XG4gICAgY29uc3QgdGhyZXNob2xkID0gTWF0aC5tYXgoOCwgc2hpcC5oZWF0Lndhcm5BdCAqIDAuMSk7XG4gICAgaWYgKGRpZmYgPj0gdGhyZXNob2xkICYmICFkdWFsTWV0ZXJBbGVydCkge1xuICAgICAgZHVhbE1ldGVyQWxlcnQgPSB0cnVlO1xuICAgICAgYnVzLmVtaXQoXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCIsIHsgcGxhbm5lZCwgYWN0dWFsIH0pO1xuICAgIH0gZWxzZSBpZiAoZGlmZiA8IHRocmVzaG9sZCAqIDAuNiAmJiBkdWFsTWV0ZXJBbGVydCkge1xuICAgICAgZHVhbE1ldGVyQWxlcnQgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVTcGVlZE1hcmtlcigpOiB2b2lkIHtcbiAgICBjb25zdCBzaGlwSGVhdCA9IHN0YXRlLm1lPy5oZWF0O1xuICAgIGlmIChzcGVlZE1hcmtlciAmJiBzaGlwU3BlZWRTbGlkZXIgJiYgc2hpcEhlYXQgJiYgc2hpcEhlYXQubWFya2VyU3BlZWQgPiAwKSB7XG4gICAgICBjb25zdCBtaW4gPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci5taW4pO1xuICAgICAgY29uc3QgbWF4ID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIubWF4KTtcbiAgICAgIGNvbnN0IG1hcmtlclNwZWVkID0gc2hpcEhlYXQubWFya2VyU3BlZWQ7XG4gICAgICBjb25zdCBwZXJjZW50ID0gKChtYXJrZXJTcGVlZCAtIG1pbikgLyAobWF4IC0gbWluKSkgKiAxMDA7XG4gICAgICBjb25zdCBjbGFtcGVkID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBwZXJjZW50KSk7XG4gICAgICBzcGVlZE1hcmtlci5zdHlsZS5sZWZ0ID0gYCR7Y2xhbXBlZH0lYDtcbiAgICAgIHNwZWVkTWFya2VyLnRpdGxlID0gYEhlYXQgbmV1dHJhbDogJHtNYXRoLnJvdW5kKG1hcmtlclNwZWVkKX0gdW5pdHMvc2A7XG4gICAgICBzcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSBpZiAoc3BlZWRNYXJrZXIpIHtcbiAgICAgIHNwZWVkTWFya2VyLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBpZiAobWlzc2lsZVNwZWVkTWFya2VyICYmIG1pc3NpbGVTcGVlZFNsaWRlcikge1xuICAgICAgY29uc3QgaGVhdFBhcmFtcyA9IHN0YXRlLm1pc3NpbGVDb25maWcuaGVhdFBhcmFtcztcbiAgICAgIGNvbnN0IG1hcmtlclNwZWVkID1cbiAgICAgICAgKGhlYXRQYXJhbXMgJiYgTnVtYmVyLmlzRmluaXRlKGhlYXRQYXJhbXMubWFya2VyU3BlZWQpID8gaGVhdFBhcmFtcy5tYXJrZXJTcGVlZCA6IHVuZGVmaW5lZCkgPz9cbiAgICAgICAgKHNoaXBIZWF0ICYmIHNoaXBIZWF0Lm1hcmtlclNwZWVkID4gMCA/IHNoaXBIZWF0Lm1hcmtlclNwZWVkIDogdW5kZWZpbmVkKTtcblxuICAgICAgaWYgKG1hcmtlclNwZWVkICE9PSB1bmRlZmluZWQgJiYgbWFya2VyU3BlZWQgPiAwKSB7XG4gICAgICAgIGNvbnN0IG1pbiA9IHBhcnNlRmxvYXQobWlzc2lsZVNwZWVkU2xpZGVyLm1pbik7XG4gICAgICAgIGNvbnN0IG1heCA9IHBhcnNlRmxvYXQobWlzc2lsZVNwZWVkU2xpZGVyLm1heCk7XG4gICAgICAgIGNvbnN0IHBlcmNlbnQgPSAoKG1hcmtlclNwZWVkIC0gbWluKSAvIChtYXggLSBtaW4pKSAqIDEwMDtcbiAgICAgICAgY29uc3QgY2xhbXBlZCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGVyY2VudCkpO1xuICAgICAgICBtaXNzaWxlU3BlZWRNYXJrZXIuc3R5bGUubGVmdCA9IGAke2NsYW1wZWR9JWA7XG4gICAgICAgIG1pc3NpbGVTcGVlZE1hcmtlci50aXRsZSA9IGBIZWF0IG5ldXRyYWw6ICR7TWF0aC5yb3VuZChtYXJrZXJTcGVlZCl9IHVuaXRzL3NgO1xuICAgICAgICBtaXNzaWxlU3BlZWRNYXJrZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pc3NpbGVTcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU3RhbGxPdmVybGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IGhlYXQgPSBzdGF0ZS5tZT8uaGVhdDtcbiAgICBpZiAoIWhlYXQgfHwgIXN0YWxsT3ZlcmxheSkge1xuICAgICAgc3RhbGxBY3RpdmUgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBub3cgPVxuICAgICAgdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgICA/IHBlcmZvcm1hbmNlLm5vdygpXG4gICAgICAgIDogRGF0ZS5ub3coKTtcblxuICAgIGNvbnN0IGlzU3RhbGxlZCA9IG5vdyA8IGhlYXQuc3RhbGxVbnRpbE1zO1xuXG4gICAgaWYgKGlzU3RhbGxlZCkge1xuICAgICAgc3RhbGxPdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgICAgaWYgKCFzdGFsbEFjdGl2ZSkge1xuICAgICAgICBzdGFsbEFjdGl2ZSA9IHRydWU7XG4gICAgICAgIGJ1cy5lbWl0KFwiaGVhdDpzdGFsbFRyaWdnZXJlZFwiLCB7IHN0YWxsVW50aWw6IGhlYXQuc3RhbGxVbnRpbE1zIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdGFsbE92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgICBpZiAoc3RhbGxBY3RpdmUpIHtcbiAgICAgICAgc3RhbGxBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgYnVzLmVtaXQoXCJoZWF0OnN0YWxsUmVjb3ZlcmVkXCIsIHsgdmFsdWU6IGhlYXQudmFsdWUgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYWNoZURvbSxcbiAgICBiaW5kVUksXG4gICAgc2V0QWN0aXZlVG9vbCxcbiAgICBzZXRJbnB1dENvbnRleHQsXG4gICAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMsXG4gICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSxcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJLFxuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzLFxuICAgIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUsXG4gICAgdXBkYXRlSGVscE92ZXJsYXksXG4gICAgc2V0SGVscFZpc2libGUsXG4gICAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlLFxuICAgIHVwZGF0ZU1pc3NpbGVDb3VudERpc3BsYXksXG4gICAgdXBkYXRlQ3JhZnRUaW1lcixcbiAgICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzLFxuICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyLFxuICAgIHVwZGF0ZVNwZWVkTWFya2VyLFxuICAgIHVwZGF0ZUhlYXRCYXIsXG4gICAgcHJvamVjdFBsYW5uZWRIZWF0LFxuICAgIGdldENhbnZhcyxcbiAgICBnZXRDb250ZXh0LFxuICAgIGFkanVzdFNoaXBTcGVlZCxcbiAgICBhZGp1c3RNaXNzaWxlQWdybyxcbiAgICBhZGp1c3RNaXNzaWxlU3BlZWQsXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgQXBwU3RhdGUgfSBmcm9tIFwiLi4vc3RhdGVcIjtcblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaW9uSHVkIHtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgTWlzc2lvbkh1ZE9wdGlvbnMge1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3VudE1pc3Npb25IdWQoeyBzdGF0ZSwgYnVzIH06IE1pc3Npb25IdWRPcHRpb25zKTogTWlzc2lvbkh1ZCB7XG4gIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lvbi1odWRcIik7XG4gIGNvbnN0IGJlYWNvbkxhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaW9uLWJlYWNvbi1sYWJlbFwiKTtcbiAgY29uc3QgaG9sZExhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaW9uLWhvbGQtdGV4dFwiKTtcblxuICBpZiAoIWNvbnRhaW5lciB8fCAhYmVhY29uTGFiZWwgfHwgIWhvbGRMYWJlbCkge1xuICAgIHJldHVybiB7IGRlc3Ryb3koKSB7fSB9O1xuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyKCk6IHZvaWQge1xuICAgIGNvbnN0IG1pc3Npb24gPSBzdGF0ZS5taXNzaW9uO1xuICAgIGlmICghbWlzc2lvbiB8fCAhbWlzc2lvbi5hY3RpdmUpIHtcbiAgICAgIGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgICAgY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnNpZGVcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdG90YWwgPSBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoID4gMCA/IG1pc3Npb24uYmVhY29ucy5sZW5ndGggOiA0O1xuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IE1hdGgubWluKG1pc3Npb24uYmVhY29uSW5kZXggKyAxLCB0b3RhbCk7XG4gICAgYmVhY29uTGFiZWwudGV4dENvbnRlbnQgPSBgQmVhY29uICR7Y3VycmVudEluZGV4fS8ke3RvdGFsfWA7XG5cbiAgICBjb25zdCByZXF1aXJlZCA9IG1pc3Npb24uaG9sZFJlcXVpcmVkIHx8IDEwO1xuICAgIGNvbnN0IGhvbGRTZWNvbmRzID0gTWF0aC5tYXgoMCwgbWlzc2lvbi5ob2xkQWNjdW0pO1xuICAgIGhvbGRMYWJlbC50ZXh0Q29udGVudCA9IGBIb2xkOiAke2hvbGRTZWNvbmRzLnRvRml4ZWQoMSl9cyAvICR7cmVxdWlyZWQudG9GaXhlZCgxKX1zYDtcblxuICAgIGNvbnN0IGJlYWNvbiA9IG1pc3Npb24uYmVhY29uc1ttaXNzaW9uLmJlYWNvbkluZGV4XTtcbiAgICBpZiAoYmVhY29uICYmIHN0YXRlLm1lKSB7XG4gICAgICBjb25zdCBkeCA9IHN0YXRlLm1lLnggLSBiZWFjb24uY3g7XG4gICAgICBjb25zdCBkeSA9IHN0YXRlLm1lLnkgLSBiZWFjb24uY3k7XG4gICAgICBjb25zdCBpbnNpZGUgPSBkeCAqIGR4ICsgZHkgKiBkeSA8PSBiZWFjb24ucmFkaXVzICogYmVhY29uLnJhZGl1cztcbiAgICAgIGlmIChpbnNpZGUpIHtcbiAgICAgICAgY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJpbnNpZGVcIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShcImluc2lkZVwiKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnNpZGVcIik7XG4gICAgfVxuXG4gICAgY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gIH1cblxuICByZW5kZXIoKTtcbiAgY29uc3QgdW5zdWJzID0gW1xuICAgIGJ1cy5vbihcInN0YXRlOnVwZGF0ZWRcIiwgKCkgPT4gcmVuZGVyKCkpLFxuICAgIGJ1cy5vbihcIm1pc3Npb246c3RhcnRcIiwgKCkgPT4gcmVuZGVyKCkpLFxuICAgIGJ1cy5vbihcIm1pc3Npb246YmVhY29uLWxvY2tlZFwiLCAoKSA9PiByZW5kZXIoKSksXG4gICAgYnVzLm9uKFwibWlzc2lvbjpjb21wbGV0ZWRcIiwgKCkgPT4gcmVuZGVyKCkpLFxuICBdO1xuXG4gIHJldHVybiB7XG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGZvciAoY29uc3QgdW5zdWIgb2YgdW5zdWJzKSB7XG4gICAgICAgIHVuc3ViKCk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgeyBnZXRBcHByb3hTZXJ2ZXJOb3csIHNlbmRNZXNzYWdlIH0gZnJvbSBcIi4vbmV0XCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBVSVN0YXRlIH0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7IGNyZWF0ZUNhbWVyYSB9IGZyb20gXCIuL2dhbWUvY2FtZXJhXCI7XG5pbXBvcnQgeyBjcmVhdGVJbnB1dCB9IGZyb20gXCIuL2dhbWUvaW5wdXRcIjtcbmltcG9ydCB7IGNyZWF0ZUxvZ2ljIH0gZnJvbSBcIi4vZ2FtZS9sb2dpY1wiO1xuaW1wb3J0IHsgY3JlYXRlUmVuZGVyZXIgfSBmcm9tIFwiLi9nYW1lL3JlbmRlclwiO1xuaW1wb3J0IHsgY3JlYXRlVUkgfSBmcm9tIFwiLi9nYW1lL3VpXCI7XG5pbXBvcnQgeyBtb3VudE1pc3Npb25IdWQgfSBmcm9tIFwiLi9taXNzaW9uL2h1ZFwiO1xuXG5pbnRlcmZhY2UgSW5pdEdhbWVPcHRpb25zIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xufVxuXG5pbnRlcmZhY2UgR2FtZUNvbnRyb2xsZXIge1xuICBvblN0YXRlVXBkYXRlZCgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH06IEluaXRHYW1lT3B0aW9ucyk6IEdhbWVDb250cm9sbGVyIHtcbiAgY29uc3QgY2FudmFzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImN2XCIpIGFzIEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbDtcbiAgaWYgKCFjYW52YXNFbCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbnZhcyBlbGVtZW50ICNjdiBub3QgZm91bmRcIik7XG4gIH1cblxuICBjb25zdCBjYW1lcmEgPSBjcmVhdGVDYW1lcmEoeyBjYW52YXM6IGNhbnZhc0VsLCBzdGF0ZSwgdWlTdGF0ZSB9KTtcbiAgY29uc3QgbG9naWMgPSBjcmVhdGVMb2dpYyh7XG4gICAgc3RhdGUsXG4gICAgdWlTdGF0ZSxcbiAgICBidXMsXG4gICAgc2VuZE1lc3NhZ2UsXG4gICAgZ2V0QXBwcm94U2VydmVyTm93LFxuICAgIGNhbWVyYSxcbiAgfSk7XG4gIGNvbnN0IHVpID0gY3JlYXRlVUkoe1xuICAgIHN0YXRlLFxuICAgIHVpU3RhdGUsXG4gICAgYnVzLFxuICAgIGxvZ2ljLFxuICAgIGNhbWVyYSxcbiAgICBzZW5kTWVzc2FnZSxcbiAgICBnZXRBcHByb3hTZXJ2ZXJOb3csXG4gIH0pO1xuXG4gIGNvbnN0IHsgY2FudmFzOiBjYWNoZWRDYW52YXMsIGN0eDogY2FjaGVkQ3R4IH0gPSB1aS5jYWNoZURvbSgpO1xuICBjb25zdCByZW5kZXJDYW52YXMgPSBjYWNoZWRDYW52YXMgPz8gY2FudmFzRWw7XG4gIGNvbnN0IHJlbmRlckN0eCA9IGNhY2hlZEN0eCA/PyByZW5kZXJDYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICBpZiAoIXJlbmRlckN0eCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlVuYWJsZSB0byBhY3F1aXJlIDJEIHJlbmRlcmluZyBjb250ZXh0XCIpO1xuICB9XG5cbiAgY29uc3QgcmVuZGVyZXIgPSBjcmVhdGVSZW5kZXJlcih7XG4gICAgY2FudmFzOiByZW5kZXJDYW52YXMsXG4gICAgY3R4OiByZW5kZXJDdHgsXG4gICAgc3RhdGUsXG4gICAgdWlTdGF0ZSxcbiAgICBjYW1lcmEsXG4gICAgbG9naWMsXG4gIH0pO1xuXG4gIGNvbnN0IGlucHV0ID0gY3JlYXRlSW5wdXQoe1xuICAgIGNhbnZhczogcmVuZGVyQ2FudmFzLFxuICAgIHVpLFxuICAgIGxvZ2ljLFxuICAgIGNhbWVyYSxcbiAgICBzdGF0ZSxcbiAgICB1aVN0YXRlLFxuICAgIGJ1cyxcbiAgICBzZW5kTWVzc2FnZSxcbiAgfSk7XG5cbiAgdWkuYmluZFVJKCk7XG4gIGlucHV0LmJpbmRJbnB1dCgpO1xuICBsb2dpYy5lbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgdWkuc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICB1aS51cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICB1aS5yZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gIHVpLnJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgdWkudXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgdWkudXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICB1aS51cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgdWkudXBkYXRlTWlzc2lsZUNvdW50RGlzcGxheSgpO1xuXG4gIG1vdW50TWlzc2lvbkh1ZCh7IHN0YXRlLCBidXMgfSk7XG5cbiAgbGV0IGxhc3RMb29wVHM6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh0aW1lc3RhbXApKSB7XG4gICAgICB0aW1lc3RhbXAgPSBsYXN0TG9vcFRzID8/IDA7XG4gICAgfVxuXG4gICAgbGV0IGR0U2Vjb25kcyA9IDA7XG4gICAgaWYgKGxhc3RMb29wVHMgIT09IG51bGwpIHtcbiAgICAgIGR0U2Vjb25kcyA9ICh0aW1lc3RhbXAgLSBsYXN0TG9vcFRzKSAvIDEwMDA7XG4gICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShkdFNlY29uZHMpIHx8IGR0U2Vjb25kcyA8IDApIHtcbiAgICAgICAgZHRTZWNvbmRzID0gMDtcbiAgICAgIH1cbiAgICB9XG4gICAgbGFzdExvb3BUcyA9IHRpbWVzdGFtcDtcblxuICAgIGxvZ2ljLnVwZGF0ZVJvdXRlQW5pbWF0aW9ucyhkdFNlY29uZHMpO1xuICAgIHJlbmRlcmVyLmRyYXdTY2VuZSgpO1xuICAgIHVpLnVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuICAgIHVpLnVwZGF0ZUNyYWZ0VGltZXIoKTtcblxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcbiAgfVxuXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcblxuICByZXR1cm4ge1xuICAgIG9uU3RhdGVVcGRhdGVkKCkge1xuICAgICAgbG9naWMuZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICB1aS5zeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk7XG4gICAgICB1aS5yZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gICAgICB1aS5yZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gICAgICB1aS51cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgICAgIHVpLnVwZGF0ZU1pc3NpbGVDb3VudERpc3BsYXkoKTtcbiAgICAgIHVpLnVwZGF0ZUNyYWZ0VGltZXIoKTtcbiAgICAgIHVpLnVwZGF0ZVN0YXR1c0luZGljYXRvcnMoKTtcbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmludGVyZmFjZSBIaWdobGlnaHRDb250ZW50T3B0aW9ucyB7XG4gIHRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgc3RlcENvdW50OiBudW1iZXI7XG4gIHNob3dOZXh0OiBib29sZWFuO1xuICBuZXh0TGFiZWw/OiBzdHJpbmc7XG4gIG9uTmV4dD86ICgpID0+IHZvaWQ7XG4gIHNob3dTa2lwOiBib29sZWFuO1xuICBza2lwTGFiZWw/OiBzdHJpbmc7XG4gIG9uU2tpcD86ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGlnaGxpZ2h0ZXIge1xuICBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZDtcbiAgaGlkZSgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJ0dXRvcmlhbC1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVIaWdobGlnaHRlcigpOiBIaWdobGlnaHRlciB7XG4gIGVuc3VyZVN0eWxlcygpO1xuXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheVwiO1xuICBvdmVybGF5LnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBcInBvbGl0ZVwiKTtcblxuICBjb25zdCBzY3JpbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNjcmltLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fc2NyaW1cIjtcblxuICBjb25zdCBoaWdobGlnaHRCb3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoaWdobGlnaHRCb3guY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19oaWdobGlnaHRcIjtcblxuICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdG9vbHRpcC5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXBcIjtcblxuICBjb25zdCBwcm9ncmVzcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHByb2dyZXNzLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3NcIjtcblxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJoM1wiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X190aXRsZVwiO1xuXG4gIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwicFwiKTtcbiAgYm9keS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2JvZHlcIjtcblxuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnNcIjtcblxuICBjb25zdCBza2lwQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgc2tpcEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgc2tpcEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0XCI7XG4gIHNraXBCdG4udGV4dENvbnRlbnQgPSBcIlNraXBcIjtcblxuICBjb25zdCBuZXh0QnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgbmV4dEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgbmV4dEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnlcIjtcbiAgbmV4dEJ0bi50ZXh0Q29udGVudCA9IFwiTmV4dFwiO1xuXG4gIGFjdGlvbnMuYXBwZW5kKHNraXBCdG4sIG5leHRCdG4pO1xuICB0b29sdGlwLmFwcGVuZChwcm9ncmVzcywgdGl0bGUsIGJvZHksIGFjdGlvbnMpO1xuICBvdmVybGF5LmFwcGVuZChzY3JpbSwgaGlnaGxpZ2h0Qm94LCB0b29sdGlwKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICBsZXQgY3VycmVudFRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHJlc2l6ZU9ic2VydmVyOiBSZXNpemVPYnNlcnZlciB8IG51bGwgPSBudWxsO1xuICBsZXQgZnJhbWVIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgb25OZXh0OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IG9uU2tpcDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gc2NoZWR1bGVVcGRhdGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgaWYgKGZyYW1lSGFuZGxlICE9PSBudWxsKSByZXR1cm47XG4gICAgZnJhbWVIYW5kbGUgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICAgIHVwZGF0ZVBvc2l0aW9uKCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVQb3NpdGlvbigpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUpIHJldHVybjtcblxuICAgIGlmIChjdXJyZW50VGFyZ2V0KSB7XG4gICAgICBjb25zdCByZWN0ID0gY3VycmVudFRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IHBhZGRpbmcgPSAxMjtcbiAgICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMCwgcmVjdC53aWR0aCArIHBhZGRpbmcgKiAyKTtcbiAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDAsIHJlY3QuaGVpZ2h0ICsgcGFkZGluZyAqIDIpO1xuICAgICAgY29uc3QgbGVmdCA9IHJlY3QubGVmdCAtIHBhZGRpbmc7XG4gICAgICBjb25zdCB0b3AgPSByZWN0LnRvcCAtIHBhZGRpbmc7XG5cbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQobGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b3ApfXB4KWA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUud2lkdGggPSBgJHtNYXRoLnJvdW5kKHdpZHRoKX1weGA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gYCR7TWF0aC5yb3VuZChoZWlnaHQpfXB4YDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIHRvb2x0aXAuc3R5bGUubWF4V2lkdGggPSBgbWluKDM0MHB4LCAke01hdGgubWF4KDI2MCwgd2luZG93LmlubmVyV2lkdGggLSAzMil9cHgpYDtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBsZXQgdG9vbHRpcFRvcCA9IHJlY3QuYm90dG9tICsgMTg7XG4gICAgICBpZiAodG9vbHRpcFRvcCArIHRvb2x0aXBIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSAyMCkge1xuICAgICAgICB0b29sdGlwVG9wID0gTWF0aC5tYXgoMjAsIHJlY3QudG9wIC0gdG9vbHRpcEhlaWdodCAtIDE4KTtcbiAgICAgIH1cbiAgICAgIGxldCB0b29sdGlwTGVmdCA9IHJlY3QubGVmdCArIHJlY3Qud2lkdGggLyAyIC0gdG9vbHRpcFdpZHRoIC8gMjtcbiAgICAgIHRvb2x0aXBMZWZ0ID0gY2xhbXAodG9vbHRpcExlZnQsIDIwLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCAtIDIwKTtcbiAgICAgIHRvb2x0aXAuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQodG9vbHRpcExlZnQpfXB4LCAke01hdGgucm91bmQodG9vbHRpcFRvcCl9cHgpYDtcbiAgICB9IGVsc2Uge1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS53aWR0aCA9IFwiMHB4XCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gXCIwcHhcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh3aW5kb3cuaW5uZXJXaWR0aCAvIDIpfXB4LCAke01hdGgucm91bmQod2luZG93LmlubmVySGVpZ2h0IC8gMil9cHgpYDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBjb25zdCB0b29sdGlwTGVmdCA9IGNsYW1wKCh3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCkgLyAyLCAyMCwgd2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGggLSAyMCk7XG4gICAgICBjb25zdCB0b29sdGlwVG9wID0gY2xhbXAoKHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQpIC8gMiwgMjAsIHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQgLSAyMCk7XG4gICAgICB0b29sdGlwLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHRvb2x0aXBMZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvb2x0aXBUb3ApfXB4KWA7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKCk6IHZvaWQge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHNjaGVkdWxlVXBkYXRlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycygpOiB2b2lkIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBzY2hlZHVsZVVwZGF0ZSk7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUpO1xuICAgIGlmIChmcmFtZUhhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKGZyYW1lSGFuZGxlKTtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHJlc2l6ZU9ic2VydmVyKSB7XG4gICAgICByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgc2tpcEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBvblNraXA/LigpO1xuICB9KTtcblxuICBuZXh0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIG9uTmV4dD8uKCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIHJlbmRlclRvb2x0aXAob3B0aW9uczogSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCB7IHN0ZXBDb3VudCwgc3RlcEluZGV4LCB0aXRsZTogb3B0aW9uVGl0bGUsIGJvZHk6IG9wdGlvbkJvZHksIHNob3dOZXh0LCBuZXh0TGFiZWwsIHNob3dTa2lwLCBza2lwTGFiZWwgfSA9IG9wdGlvbnM7XG5cbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHN0ZXBDb3VudCkgJiYgc3RlcENvdW50ID4gMCkge1xuICAgICAgcHJvZ3Jlc3MudGV4dENvbnRlbnQgPSBgU3RlcCAke3N0ZXBJbmRleCArIDF9IG9mICR7c3RlcENvdW50fWA7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9ncmVzcy50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvblRpdGxlICYmIG9wdGlvblRpdGxlLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aXRsZS50ZXh0Q29udGVudCA9IG9wdGlvblRpdGxlO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGl0bGUudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIGJvZHkudGV4dENvbnRlbnQgPSBvcHRpb25Cb2R5O1xuXG4gICAgb25OZXh0ID0gc2hvd05leHQgPyBvcHRpb25zLm9uTmV4dCA/PyBudWxsIDogbnVsbDtcbiAgICBpZiAoc2hvd05leHQpIHtcbiAgICAgIG5leHRCdG4udGV4dENvbnRlbnQgPSBuZXh0TGFiZWwgPz8gXCJOZXh0XCI7XG4gICAgICBuZXh0QnRuLnN0eWxlLmRpc3BsYXkgPSBcImlubGluZS1mbGV4XCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHRCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIG9uU2tpcCA9IHNob3dTa2lwID8gb3B0aW9ucy5vblNraXAgPz8gbnVsbCA6IG51bGw7XG4gICAgaWYgKHNob3dTa2lwKSB7XG4gICAgICBza2lwQnRuLnRleHRDb250ZW50ID0gc2tpcExhYmVsID8/IFwiU2tpcFwiO1xuICAgICAgc2tpcEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJpbmxpbmUtZmxleFwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBza2lwQnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IHRydWU7XG4gICAgY3VycmVudFRhcmdldCA9IG9wdGlvbnMudGFyZ2V0ID8/IG51bGw7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICByZW5kZXJUb29sdGlwKG9wdGlvbnMpO1xuICAgIGlmIChyZXNpemVPYnNlcnZlcikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFRhcmdldCAmJiB0eXBlb2YgUmVzaXplT2JzZXJ2ZXIgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHNjaGVkdWxlVXBkYXRlKCkpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShjdXJyZW50VGFyZ2V0KTtcbiAgICB9XG4gICAgYXR0YWNoTGlzdGVuZXJzKCk7XG4gICAgc2NoZWR1bGVVcGRhdGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjtcbiAgICB0b29sdGlwLnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIGRldGFjaExpc3RlbmVycygpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlKCk7XG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2hvdyxcbiAgICBoaWRlLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNUWUxFX0lEKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgc3R5bGUuaWQgPSBTVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLnR1dG9yaWFsLW92ZXJsYXkge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgICB6LWluZGV4OiA1MDtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXkudmlzaWJsZSB7XG4gICAgICBkaXNwbGF5OiBibG9jaztcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3NjcmltIHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGluc2V0OiAwO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9faGlnaGxpZ2h0IHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gICAgICBib3JkZXI6IDJweCBzb2xpZCByZ2JhKDU2LCAxODksIDI0OCwgMC45NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDAgMCAycHggcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjUpLCAwIDAgMjRweCByZ2JhKDM0LCAyMTEsIDIzOCwgMC4yNSk7XG4gICAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC4xOHMgZWFzZSwgd2lkdGggMC4xOHMgZWFzZSwgaGVpZ2h0IDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgbWluLXdpZHRoOiAyNDBweDtcbiAgICAgIG1heC13aWR0aDogbWluKDM0MHB4LCBjYWxjKDEwMHZ3IC0gMzJweCkpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgxNSwgMjMsIDQyLCAwLjk1KTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNnB4O1xuICAgICAgcGFkZGluZzogMTZweCAxOHB4O1xuICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICBib3gtc2hhZG93OiAwIDEycHggMzJweCByZ2JhKDE1LCAyMywgNDIsIDAuNTUpO1xuICAgICAgcG9pbnRlci1ldmVudHM6IGF1dG87XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdmlzaWJpbGl0eTogaGlkZGVuO1xuICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoMHB4LCAwcHgpO1xuICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzIHtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC43NSk7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X190aXRsZSB7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgICBmb250LXNpemU6IDE1cHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wNGVtO1xuICAgICAgY29sb3I6ICNmMWY1Zjk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19ib2R5IHtcbiAgICAgIG1hcmdpbjogMCAwIDE0cHg7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBsaW5lLWhlaWdodDogMS41O1xuICAgICAgY29sb3I6ICNjYmQ1ZjU7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBnYXA6IDEwcHg7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICBwYWRkaW5nOiA2cHggMTRweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDk5OXB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeSB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4yNSk7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjU1KTtcbiAgICAgIGNvbG9yOiAjZjhmYWZjO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5OmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjM1KTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3Qge1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBjb2xvcjogcmdiYSgyMDMsIDIxMywgMjI1LCAwLjkpO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdDpob3ZlciB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMjAzLCAyMTMsIDIyNSwgMC41NSk7XG4gICAgfVxuICAgIEBtZWRpYSAobWF4LXdpZHRoOiA3NjhweCkge1xuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgICBtaW4td2lkdGg6IDIwMHB4O1xuICAgICAgICBtYXgtd2lkdGg6IG1pbigzMjBweCwgY2FsYygxMDB2dyAtIDI0cHgpKTtcbiAgICAgICAgcGFkZGluZzogMTBweCAxMnB4O1xuICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogcm93O1xuICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBnYXA6IDEycHg7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3Mge1xuICAgICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fdGl0bGUge1xuICAgICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYm9keSB7XG4gICAgICAgIG1hcmdpbjogMDtcbiAgICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgICBmbGV4OiAxO1xuICAgICAgICBsaW5lLWhlaWdodDogMS40O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnMge1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgICAgcGFkZGluZzogNXB4IDEwcHg7XG4gICAgICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICAgIH1cbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuIiwgImNvbnN0IFNUT1JBR0VfUFJFRklYID0gXCJsc2Q6dHV0b3JpYWw6XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxQcm9ncmVzcyB7XG4gIHN0ZXBJbmRleDogbnVtYmVyO1xuICBjb21wbGV0ZWQ6IGJvb2xlYW47XG4gIHVwZGF0ZWRBdDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBnZXRTdG9yYWdlKCk6IFN0b3JhZ2UgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIiB8fCAhd2luZG93LmxvY2FsU3RvcmFnZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRQcm9ncmVzcyhpZDogc3RyaW5nKTogVHV0b3JpYWxQcm9ncmVzcyB8IG51bGwge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IHN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX1BSRUZJWCArIGlkKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFR1dG9yaWFsUHJvZ3Jlc3M7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHBhcnNlZCAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQgPT09IG51bGwgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuc3RlcEluZGV4ICE9PSBcIm51bWJlclwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmNvbXBsZXRlZCAhPT0gXCJib29sZWFuXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQudXBkYXRlZEF0ICE9PSBcIm51bWJlclwiXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnNlZDtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVQcm9ncmVzcyhpZDogc3RyaW5nLCBwcm9ncmVzczogVHV0b3JpYWxQcm9ncmVzcyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnNldEl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCwgSlNPTi5zdHJpbmdpZnkocHJvZ3Jlc3MpKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gaWdub3JlIHN0b3JhZ2UgZmFpbHVyZXNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJQcm9ncmVzcyhpZDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2UucmVtb3ZlSXRlbShTVE9SQUdFX1BSRUZJWCArIGlkKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gaWdub3JlIHN0b3JhZ2UgZmFpbHVyZXNcbiAgfVxufVxuIiwgImV4cG9ydCB0eXBlIFJvbGVJZCA9XG4gIHwgXCJjYW52YXNcIlxuICB8IFwic2hpcFNldFwiXG4gIHwgXCJzaGlwU2VsZWN0XCJcbiAgfCBcInNoaXBEZWxldGVcIlxuICB8IFwic2hpcENsZWFyXCJcbiAgfCBcInNoaXBTcGVlZFNsaWRlclwiXG4gIHwgXCJoZWF0QmFyXCJcbiAgfCBcInNwZWVkTWFya2VyXCJcbiAgfCBcIm1pc3NpbGVTZXRcIlxuICB8IFwibWlzc2lsZVNlbGVjdFwiXG4gIHwgXCJtaXNzaWxlRGVsZXRlXCJcbiAgfCBcIm1pc3NpbGVTcGVlZFNsaWRlclwiXG4gIHwgXCJtaXNzaWxlQWdyb1NsaWRlclwiXG4gIHwgXCJtaXNzaWxlQWRkUm91dGVcIlxuICB8IFwibWlzc2lsZUxhdW5jaFwiXG4gIHwgXCJyb3V0ZVByZXZcIlxuICB8IFwicm91dGVOZXh0XCJcbiAgfCBcImhlbHBUb2dnbGVcIlxuICB8IFwidHV0b3JpYWxTdGFydFwiXG4gIHwgXCJzcGF3bkJvdFwiO1xuXG5leHBvcnQgdHlwZSBSb2xlUmVzb2x2ZXIgPSAoKSA9PiBIVE1MRWxlbWVudCB8IG51bGw7XG5cbmV4cG9ydCB0eXBlIFJvbGVzTWFwID0gUmVjb3JkPFJvbGVJZCwgUm9sZVJlc29sdmVyPjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJvbGVzKCk6IFJvbGVzTWFwIHtcbiAgcmV0dXJuIHtcbiAgICBjYW52YXM6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3ZcIiksXG4gICAgc2hpcFNldDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNldFwiKSxcbiAgICBzaGlwU2VsZWN0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0XCIpLFxuICAgIHNoaXBEZWxldGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1kZWxldGVcIiksXG4gICAgc2hpcENsZWFyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIiksXG4gICAgc2hpcFNwZWVkU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtc2xpZGVyXCIpLFxuICAgIGhlYXRCYXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItY29udGFpbmVyXCIpLFxuICAgIHNwZWVkTWFya2VyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkLW1hcmtlclwiKSxcbiAgICBtaXNzaWxlU2V0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2V0XCIpLFxuICAgIG1pc3NpbGVTZWxlY3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZWxlY3RcIiksXG4gICAgbWlzc2lsZURlbGV0ZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWRlbGV0ZVwiKSxcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1zbGlkZXJcIiksXG4gICAgbWlzc2lsZUFncm9TbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXNsaWRlclwiKSxcbiAgICBtaXNzaWxlQWRkUm91dGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIiksXG4gICAgbWlzc2lsZUxhdW5jaDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaFwiKSxcbiAgICByb3V0ZVByZXY6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtcHJldlwiKSxcbiAgICByb3V0ZU5leHQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbmV4dFwiKSxcbiAgICBoZWxwVG9nZ2xlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtdG9nZ2xlXCIpLFxuICAgIHR1dG9yaWFsU3RhcnQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidHV0b3JpYWwtc3RhcnRcIiksXG4gICAgc3Bhd25Cb3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Um9sZUVsZW1lbnQocm9sZXM6IFJvbGVzTWFwLCByb2xlOiBSb2xlSWQgfCBudWxsIHwgdW5kZWZpbmVkKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgaWYgKCFyb2xlKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcmVzb2x2ZXIgPSByb2xlc1tyb2xlXTtcbiAgcmV0dXJuIHJlc29sdmVyID8gcmVzb2x2ZXIoKSA6IG51bGw7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cywgRXZlbnRLZXkgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVIaWdobGlnaHRlciwgdHlwZSBIaWdobGlnaHRlciB9IGZyb20gXCIuL2hpZ2hsaWdodFwiO1xuaW1wb3J0IHsgY2xlYXJQcm9ncmVzcywgbG9hZFByb2dyZXNzLCBzYXZlUHJvZ3Jlc3MgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBnZXRSb2xlRWxlbWVudCwgdHlwZSBSb2xlSWQsIHR5cGUgUm9sZXNNYXAgfSBmcm9tIFwiLi9yb2xlc1wiO1xuXG5leHBvcnQgdHlwZSBTdGVwQWR2YW5jZSA9XG4gIHwge1xuICAgICAga2luZDogXCJldmVudFwiO1xuICAgICAgZXZlbnQ6IEV2ZW50S2V5O1xuICAgICAgd2hlbj86IChwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuO1xuICAgICAgY2hlY2s/OiAoKSA9PiBib29sZWFuO1xuICAgIH1cbiAgfCB7XG4gICAgICBraW5kOiBcIm1hbnVhbFwiO1xuICAgICAgbmV4dExhYmVsPzogc3RyaW5nO1xuICAgIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxTdGVwIHtcbiAgaWQ6IHN0cmluZztcbiAgdGFyZ2V0OiBSb2xlSWQgfCAoKCkgPT4gSFRNTEVsZW1lbnQgfCBudWxsKSB8IG51bGw7XG4gIHRpdGxlPzogc3RyaW5nO1xuICBib2R5OiBzdHJpbmc7XG4gIGFkdmFuY2U6IFN0ZXBBZHZhbmNlO1xuICBvbkVudGVyPzogKCkgPT4gdm9pZDtcbiAgb25FeGl0PzogKCkgPT4gdm9pZDtcbiAgYWxsb3dTa2lwPzogYm9vbGVhbjtcbiAgc2tpcExhYmVsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgRW5naW5lT3B0aW9ucyB7XG4gIGlkOiBzdHJpbmc7XG4gIGJ1czogRXZlbnRCdXM7XG4gIHJvbGVzOiBSb2xlc01hcDtcbiAgc3RlcHM6IFR1dG9yaWFsU3RlcFtdO1xufVxuXG5pbnRlcmZhY2UgU3RhcnRPcHRpb25zIHtcbiAgcmVzdW1lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbEVuZ2luZSB7XG4gIHN0YXJ0KG9wdGlvbnM/OiBTdGFydE9wdGlvbnMpOiB2b2lkO1xuICByZXN0YXJ0KCk6IHZvaWQ7XG4gIHN0b3AoKTogdm9pZDtcbiAgaXNSdW5uaW5nKCk6IGJvb2xlYW47XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVR1dG9yaWFsRW5naW5lKHsgaWQsIGJ1cywgcm9sZXMsIHN0ZXBzIH06IEVuZ2luZU9wdGlvbnMpOiBUdXRvcmlhbEVuZ2luZSB7XG4gIGNvbnN0IGhpZ2hsaWdodGVyOiBIaWdobGlnaHRlciA9IGNyZWF0ZUhpZ2hsaWdodGVyKCk7XG4gIGxldCBydW5uaW5nID0gZmFsc2U7XG4gIGxldCBwYXVzZWQgPSBmYWxzZTtcbiAgbGV0IGN1cnJlbnRJbmRleCA9IC0xO1xuICBsZXQgY3VycmVudFN0ZXA6IFR1dG9yaWFsU3RlcCB8IG51bGwgPSBudWxsO1xuICBsZXQgY2xlYW51cEN1cnJlbnQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgcmVuZGVyQ3VycmVudDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBmYWxzZTtcbiAgbGV0IHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuXG4gIGNvbnN0IHBlcnNpc3RlbnRMaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cbiAgcGVyc2lzdGVudExpc3RlbmVycy5wdXNoKFxuICAgIGJ1cy5vbihcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgKHsgdmlzaWJsZSB9KSA9PiB7XG4gICAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICAgIHBhdXNlZCA9IEJvb2xlYW4odmlzaWJsZSk7XG4gICAgICBpZiAocGF1c2VkKSB7XG4gICAgICAgIGhpZ2hsaWdodGVyLmhpZGUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlbmRlckN1cnJlbnQ/LigpO1xuICAgICAgfVxuICAgIH0pLFxuICApO1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVUYXJnZXQoc3RlcDogVHV0b3JpYWxTdGVwKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgICBpZiAoIXN0ZXAudGFyZ2V0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBzdGVwLnRhcmdldCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICByZXR1cm4gc3RlcC50YXJnZXQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGdldFJvbGVFbGVtZW50KHJvbGVzLCBzdGVwLnRhcmdldCk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGFtcEluZGV4KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHJldHVybiAwO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGluZGV4KSB8fCBpbmRleCA8IDApIHJldHVybiAwO1xuICAgIGlmIChpbmRleCA+PSBzdGVwcy5sZW5ndGgpIHJldHVybiBzdGVwcy5sZW5ndGggLSAxO1xuICAgIHJldHVybiBNYXRoLmZsb29yKGluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFN0ZXAoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSBzdGVwcy5sZW5ndGgpIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnRTdGVwKSB7XG4gICAgICBjdXJyZW50U3RlcC5vbkV4aXQ/LigpO1xuICAgICAgY3VycmVudFN0ZXAgPSBudWxsO1xuICAgIH1cblxuICAgIGN1cnJlbnRJbmRleCA9IGluZGV4O1xuICAgIGNvbnN0IHN0ZXAgPSBzdGVwc1tpbmRleF07XG4gICAgY3VycmVudFN0ZXAgPSBzdGVwO1xuXG4gICAgcGVyc2lzdFByb2dyZXNzKGluZGV4LCBmYWxzZSk7XG5cbiAgICBidXMuZW1pdChcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCIsIHsgaWQsIHN0ZXBJbmRleDogaW5kZXgsIHRvdGFsOiBzdGVwcy5sZW5ndGggfSk7XG4gICAgc3RlcC5vbkVudGVyPy4oKTtcblxuICAgIGNvbnN0IGFsbG93U2tpcCA9IHN0ZXAuYWxsb3dTa2lwICE9PSBmYWxzZTtcbiAgICBjb25zdCByZW5kZXIgPSAoKTogdm9pZCA9PiB7XG4gICAgICBpZiAoIXJ1bm5pbmcgfHwgcGF1c2VkKSByZXR1cm47XG4gICAgICBoaWdobGlnaHRlci5zaG93KHtcbiAgICAgICAgdGFyZ2V0OiByZXNvbHZlVGFyZ2V0KHN0ZXApLFxuICAgICAgICB0aXRsZTogc3RlcC50aXRsZSxcbiAgICAgICAgYm9keTogc3RlcC5ib2R5LFxuICAgICAgICBzdGVwSW5kZXg6IGluZGV4LFxuICAgICAgICBzdGVwQ291bnQ6IHN0ZXBzLmxlbmd0aCxcbiAgICAgICAgc2hvd05leHQ6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiLFxuICAgICAgICBuZXh0TGFiZWw6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiXG4gICAgICAgICAgPyBzdGVwLmFkdmFuY2UubmV4dExhYmVsID8/IChpbmRleCA9PT0gc3RlcHMubGVuZ3RoIC0gMSA/IFwiRmluaXNoXCIgOiBcIk5leHRcIilcbiAgICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgICAgb25OZXh0OiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIiA/IGFkdmFuY2VTdGVwIDogdW5kZWZpbmVkLFxuICAgICAgICBzaG93U2tpcDogYWxsb3dTa2lwLFxuICAgICAgICBza2lwTGFiZWw6IHN0ZXAuc2tpcExhYmVsLFxuICAgICAgICBvblNraXA6IGFsbG93U2tpcCA/IHNraXBDdXJyZW50U3RlcCA6IHVuZGVmaW5lZCxcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICByZW5kZXJDdXJyZW50ID0gcmVuZGVyO1xuICAgIHJlbmRlcigpO1xuXG4gICAgaWYgKHN0ZXAuYWR2YW5jZS5raW5kID09PSBcImV2ZW50XCIpIHtcbiAgICAgIGNvbnN0IGhhbmRsZXIgPSAocGF5bG9hZDogdW5rbm93bik6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoIXJ1bm5pbmcgfHwgcGF1c2VkKSByZXR1cm47XG4gICAgICAgIGlmIChzdGVwLmFkdmFuY2Uud2hlbiAmJiAhc3RlcC5hZHZhbmNlLndoZW4ocGF5bG9hZCkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgYWR2YW5jZVRvKGluZGV4ICsgMSk7XG4gICAgICB9O1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBidXMub24oc3RlcC5hZHZhbmNlLmV2ZW50LCBoYW5kbGVyIGFzICh2YWx1ZTogbmV2ZXIpID0+IHZvaWQpO1xuICAgICAgaWYgKHN0ZXAuYWR2YW5jZS5jaGVjayAmJiBzdGVwLmFkdmFuY2UuY2hlY2soKSkge1xuICAgICAgICBoYW5kbGVyKHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlVG8obmV4dEluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG4gICAgcmVuZGVyQ3VycmVudCA9IG51bGw7XG4gICAgaWYgKG5leHRJbmRleCA+PSBzdGVwcy5sZW5ndGgpIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0U3RlcChuZXh0SW5kZXgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGFkdmFuY2VTdGVwKCk6IHZvaWQge1xuICAgIGFkdmFuY2VUbyhjdXJyZW50SW5kZXggKyAxKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNraXBDdXJyZW50U3RlcCgpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBjb25zdCBuZXh0SW5kZXggPSBjdXJyZW50SW5kZXggPj0gMCA/IGN1cnJlbnRJbmRleCArIDEgOiAwO1xuICAgIGFkdmFuY2VUbyhuZXh0SW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gY29tcGxldGVUdXRvcmlhbCgpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSB0cnVlO1xuICAgIHBlcnNpc3RQcm9ncmVzcyhzdGVwcy5sZW5ndGgsIHRydWUpO1xuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6Y29tcGxldGVkXCIsIHsgaWQgfSk7XG4gICAgc3RvcCgpO1xuICAgIHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnQob3B0aW9ucz86IFN0YXJ0T3B0aW9ucyk6IHZvaWQge1xuICAgIGNvbnN0IHJlc3VtZSA9IG9wdGlvbnM/LnJlc3VtZSAhPT0gZmFsc2U7XG4gICAgaWYgKHJ1bm5pbmcpIHtcbiAgICAgIHJlc3RhcnQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBydW5uaW5nID0gdHJ1ZTtcbiAgICBwYXVzZWQgPSBmYWxzZTtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcbiAgICBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBmYWxzZTtcbiAgICBsZXQgc3RhcnRJbmRleCA9IDA7XG4gICAgaWYgKHJlc3VtZSkge1xuICAgICAgY29uc3QgcHJvZ3Jlc3MgPSBsb2FkUHJvZ3Jlc3MoaWQpO1xuICAgICAgaWYgKHByb2dyZXNzICYmICFwcm9ncmVzcy5jb21wbGV0ZWQpIHtcbiAgICAgICAgc3RhcnRJbmRleCA9IGNsYW1wSW5kZXgocHJvZ3Jlc3Muc3RlcEluZGV4KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2xlYXJQcm9ncmVzcyhpZCk7XG4gICAgfVxuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6c3RhcnRlZFwiLCB7IGlkIH0pO1xuICAgIHNldFN0ZXAoc3RhcnRJbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiByZXN0YXJ0KCk6IHZvaWQge1xuICAgIHN0b3AoKTtcbiAgICBzdGFydCh7IHJlc3VtZTogZmFsc2UgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzdG9wKCk6IHZvaWQge1xuICAgIGNvbnN0IHNob3VsZFBlcnNpc3QgPSAhc3VwcHJlc3NQZXJzaXN0T25TdG9wICYmIHJ1bm5pbmcgJiYgIWxhc3RTYXZlZENvbXBsZXRlZCAmJiBjdXJyZW50SW5kZXggPj0gMCAmJiBjdXJyZW50SW5kZXggPCBzdGVwcy5sZW5ndGg7XG4gICAgY29uc3QgaW5kZXhUb1BlcnNpc3QgPSBjdXJyZW50SW5kZXg7XG5cbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHNob3VsZFBlcnNpc3QpIHtcbiAgICAgIHBlcnNpc3RQcm9ncmVzcyhpbmRleFRvUGVyc2lzdCwgZmFsc2UpO1xuICAgIH1cbiAgICBydW5uaW5nID0gZmFsc2U7XG4gICAgcGF1c2VkID0gZmFsc2U7XG4gICAgY3VycmVudEluZGV4ID0gLTE7XG4gICAgcmVuZGVyQ3VycmVudCA9IG51bGw7XG4gICAgaGlnaGxpZ2h0ZXIuaGlkZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNSdW5uaW5nKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBydW5uaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBzdG9wKCk7XG4gICAgZm9yIChjb25zdCBkaXNwb3NlIG9mIHBlcnNpc3RlbnRMaXN0ZW5lcnMpIHtcbiAgICAgIGRpc3Bvc2UoKTtcbiAgICB9XG4gICAgaGlnaGxpZ2h0ZXIuZGVzdHJveSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGVyc2lzdFByb2dyZXNzKHN0ZXBJbmRleDogbnVtYmVyLCBjb21wbGV0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBjb21wbGV0ZWQ7XG4gICAgc2F2ZVByb2dyZXNzKGlkLCB7XG4gICAgICBzdGVwSW5kZXgsXG4gICAgICBjb21wbGV0ZWQsXG4gICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHN0YXJ0LFxuICAgIHJlc3RhcnQsXG4gICAgc3RvcCxcbiAgICBpc1J1bm5pbmcsXG4gICAgZGVzdHJveSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFR1dG9yaWFsU3RlcCB9IGZyb20gXCIuL2VuZ2luZVwiO1xuXG5mdW5jdGlvbiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkOiB1bmtub3duLCBtaW5JbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGluZGV4ID0gKHBheWxvYWQgYXMgeyBpbmRleD86IHVua25vd24gfSkuaW5kZXg7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09IFwibnVtYmVyXCIgfHwgIU51bWJlci5pc0Zpbml0ZShpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGluZGV4ID49IG1pbkluZGV4O1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Um91dGVJZChwYXlsb2FkOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgcm91dGVJZCA9IChwYXlsb2FkIGFzIHsgcm91dGVJZD86IHVua25vd24gfSkucm91dGVJZDtcbiAgcmV0dXJuIHR5cGVvZiByb3V0ZUlkID09PSBcInN0cmluZ1wiID8gcm91dGVJZCA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIHBheWxvYWRUb29sRXF1YWxzKHRhcmdldDogc3RyaW5nKTogKHBheWxvYWQ6IHVua25vd24pID0+IGJvb2xlYW4ge1xuICByZXR1cm4gKHBheWxvYWQ6IHVua25vd24pOiBib29sZWFuID0+IHtcbiAgICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHRvb2wgPSAocGF5bG9hZCBhcyB7IHRvb2w/OiB1bmtub3duIH0pLnRvb2w7XG4gICAgcmV0dXJuIHR5cGVvZiB0b29sID09PSBcInN0cmluZ1wiICYmIHRvb2wgPT09IHRhcmdldDtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJhc2ljVHV0b3JpYWxTdGVwcygpOiBUdXRvcmlhbFN0ZXBbXSB7XG4gIGxldCByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA9IDA7XG4gIGxldCBpbml0aWFsUm91dGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBuZXdSb3V0ZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICByZXR1cm4gW1xuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtcGxvdC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCBhIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkNsaWNrIG9uIHRoZSBtYXAgdG8gZHJvcCBhdCBsZWFzdCB0aHJlZSB3YXlwb2ludHMgYW5kIHNrZXRjaCB5b3VyIGNvdXJzZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IGhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDIpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtY2hhbmdlLXNwZWVkXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcFNwZWVkU2xpZGVyXCIsXG4gICAgICB0aXRsZTogXCJBZGp1c3Qgc2hpcCBzcGVlZFwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIFNoaXAgU3BlZWQgc2xpZGVyIChvciBwcmVzcyBbIC8gXSkgdG8gZmluZS10dW5lIHlvdXIgdHJhdmVsIHNwZWVkLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6c3BlZWRDaGFuZ2VkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1zZWxlY3QtbGVnXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcFNlbGVjdFwiLFxuICAgICAgdGl0bGU6IFwiU2VsZWN0IGEgcm91dGUgbGVnXCIsXG4gICAgICBib2R5OiBcIlN3aXRjaCB0byBTZWxlY3QgbW9kZSAoVCBrZXkpIGFuZCB0aGVuIGNsaWNrIGEgd2F5cG9pbnQgb24gdGhlIG1hcCB0byBoaWdobGlnaHQgaXRzIGxlZy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOmxlZ1NlbGVjdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAwKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LW1hdGNoLW1hcmtlclwiLFxuICAgICAgdGFyZ2V0OiBcInNwZWVkTWFya2VyXCIsXG4gICAgICB0aXRsZTogXCJNYXRjaCB0aGUgbWFya2VyXCIsXG4gICAgICBib2R5OiBcIkxpbmUgdXAgdGhlIFNoaXAgU3BlZWQgc2xpZGVyIHdpdGggdGhlIHRpY2sgdG8gY3J1aXNlIGF0IHRoZSBuZXV0cmFsIGhlYXQgc3BlZWQuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDptYXJrZXJBbGlnbmVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtcHVzaC1ob3RcIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJTcHJpbnQgaW50byB0aGUgcmVkXCIsXG4gICAgICBib2R5OiBcIlB1c2ggdGhlIHRocm90dGxlIGFib3ZlIHRoZSBtYXJrZXIgYW5kIHdhdGNoIHRoZSBoZWF0IGJhciByZWFjaCB0aGUgd2FybmluZyBiYW5kLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6d2FybkVudGVyZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1jb29sLWRvd25cIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJDb29sIGl0IGJhY2sgZG93blwiLFxuICAgICAgYm9keTogXCJFYXNlIG9mZiBiZWxvdyB0aGUgbWFya2VyIHVudGlsIHRoZSBiYXIgZHJvcHMgb3V0IG9mIHRoZSB3YXJuaW5nIHpvbmUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDpjb29sZWRCZWxvd1dhcm5cIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC10cmlnZ2VyLXN0YWxsXCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiVHJpZ2dlciBhIHN0YWxsXCIsXG4gICAgICBib2R5OiBcIlB1c2ggd2VsbCBhYm92ZSB0aGUgbGltaXQgYW5kIGhvbGQgaXQgdW50aWwgdGhlIG92ZXJoZWF0IHN0YWxsIG92ZXJsYXkgYXBwZWFycy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0OnN0YWxsVHJpZ2dlcmVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtcmVjb3Zlci1zdGFsbFwiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIlJlY292ZXIgZnJvbSB0aGUgc3RhbGxcIixcbiAgICAgIGJvZHk6IFwiSG9sZCBzdGVhZHkgd2hpbGUgc3lzdGVtcyBjb29sLiBPbmNlIHRoZSBvdmVybGF5IGNsZWFycywgeW91XHUyMDE5cmUgYmFjayBvbmxpbmUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LWR1YWwtYmFyc1wiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIlJlYWQgYm90aCBoZWF0IGJhcnNcIixcbiAgICAgIGJvZHk6IFwiQWRqdXN0IGEgd2F5cG9pbnQgdG8gbWFrZSB0aGUgcGxhbm5lZCBiYXIgZXh0ZW5kIHBhc3QgbGl2ZSBoZWF0LiBVc2UgaXQgdG8gcHJlZGljdCBmdXR1cmUgb3ZlcmxvYWRzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6ZHVhbE1ldGVyRGl2ZXJnZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1kZWxldGUtbGVnXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcERlbGV0ZVwiLFxuICAgICAgdGl0bGU6IFwiRGVsZXRlIGEgcm91dGUgbGVnXCIsXG4gICAgICBib2R5OiBcIlJlbW92ZSB0aGUgc2VsZWN0ZWQgd2F5cG9pbnQgdXNpbmcgdGhlIERlbGV0ZSBjb250cm9sIG9yIHRoZSBEZWxldGUga2V5LlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6d2F5cG9pbnREZWxldGVkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1jbGVhci1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBDbGVhclwiLFxuICAgICAgdGl0bGU6IFwiQ2xlYXIgdGhlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkNsZWFyIHJlbWFpbmluZyB3YXlwb2ludHMgdG8gcmVzZXQgeW91ciBwbG90dGVkIGNvdXJzZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOmNsZWFySW52b2tlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtc2V0LW1vZGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlU2V0XCIsXG4gICAgICB0aXRsZTogXCJTd2l0Y2ggdG8gbWlzc2lsZSBwbGFubmluZ1wiLFxuICAgICAgYm9keTogXCJUYXAgU2V0IHNvIGV2ZXJ5IGNsaWNrIGRyb3BzIG1pc3NpbGUgd2F5cG9pbnRzIG9uIHRoZSBhY3RpdmUgcm91dGUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLFxuICAgICAgICB3aGVuOiBwYXlsb2FkVG9vbEVxdWFscyhcInNldFwiKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXBsb3QtaW5pdGlhbFwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCBtaXNzaWxlIHdheXBvaW50c1wiLFxuICAgICAgYm9keTogXCJDbGljayB0aGUgbWFwIHRvIGRyb3AgYXQgbGVhc3QgdHdvIGd1aWRhbmNlIHBvaW50cyBmb3IgdGhlIGN1cnJlbnQgbWlzc2lsZSByb3V0ZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBpZiAoIWhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDEpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmIChyb3V0ZUlkKSB7XG4gICAgICAgICAgICBpbml0aWFsUm91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLWluaXRpYWxcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggdGhlIHN0cmlrZVwiLFxuICAgICAgYm9keTogXCJTZW5kIHRoZSBwbGFubmVkIG1pc3NpbGUgcm91dGUgbGl2ZSB3aXRoIHRoZSBMYXVuY2ggY29udHJvbCAoTCBrZXkpLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCkge1xuICAgICAgICAgICAgaW5pdGlhbFJvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWFkZC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVBZGRSb3V0ZVwiLFxuICAgICAgdGl0bGU6IFwiQ3JlYXRlIGEgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiUHJlc3MgTmV3IHRvIGFkZCBhIHNlY29uZCBtaXNzaWxlIHJvdXRlIGZvciBhbm90aGVyIHN0cmlrZSBncm91cC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOnJvdXRlQWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFyb3V0ZUlkKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgbmV3Um91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1wbG90LW5ldy1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCB0aGUgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiRHJvcCBhdCBsZWFzdCB0d28gd2F5cG9pbnRzIG9uIHRoZSBuZXcgcm91dGUgdG8gZGVmaW5lIGl0cyBwYXRoLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGlmICghaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKG5ld1JvdXRlSWQgJiYgcm91dGVJZCAmJiByb3V0ZUlkICE9PSBuZXdSb3V0ZUlkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghbmV3Um91dGVJZCAmJiByb3V0ZUlkKSB7XG4gICAgICAgICAgICBuZXdSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtbmV3LXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIHRoZSBuZXcgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiTGF1bmNoIHRoZSBmcmVzaCBtaXNzaWxlIHJvdXRlIHRvIGNvbmZpcm0gaXRzIHBhdHRlcm4uXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFuZXdSb3V0ZUlkIHx8ICFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gbmV3Um91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXN3aXRjaC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcInJvdXRlTmV4dFwiLFxuICAgICAgdGl0bGU6IFwiU3dpdGNoIGJhY2sgdG8gdGhlIG9yaWdpbmFsIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgXHUyNUMwIFx1MjVCNiBjb250cm9scyAob3IgVGFiL1NoaWZ0K1RhYikgdG8gc2VsZWN0IHlvdXIgZmlyc3QgbWlzc2lsZSByb3V0ZSBhZ2Fpbi5cIixcbiAgICAgIG9uRW50ZXI6ICgpID0+IHtcbiAgICAgICAgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPSAwO1xuICAgICAgfSxcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyICs9IDE7XG4gICAgICAgICAgaWYgKHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyIDwgMSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkIHx8ICFyb3V0ZUlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLWFmdGVyLXN3aXRjaFwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCBmcm9tIHRoZSBvdGhlciByb3V0ZVwiLFxuICAgICAgYm9keTogXCJGaXJlIHRoZSBvcmlnaW5hbCBtaXNzaWxlIHJvdXRlIHRvIHByYWN0aWNlIHJvdW5kLXJvYmluIHN0cmlrZXMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCB8fCAhcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInR1dG9yaWFsLXByYWN0aWNlXCIsXG4gICAgICB0YXJnZXQ6IFwic3Bhd25Cb3RcIixcbiAgICAgIHRpdGxlOiBcIlNwYXduIGEgcHJhY3RpY2UgYm90XCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgQm90IGNvbnRyb2wgdG8gYWRkIGEgdGFyZ2V0IGFuZCByZWhlYXJzZSB0aGVzZSBtYW5ldXZlcnMgaW4gcmVhbCB0aW1lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImJvdDpzcGF3blJlcXVlc3RlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJ0dXRvcmlhbC1jb21wbGV0ZVwiLFxuICAgICAgdGFyZ2V0OiBudWxsLFxuICAgICAgdGl0bGU6IFwiWW91XHUyMDE5cmUgcmVhZHlcIixcbiAgICAgIGJvZHk6IFwiR3JlYXQgd29yay4gUmVsb2FkIHRoZSBjb25zb2xlIG9yIHJlam9pbiBhIHJvb20gdG8gcmV2aXNpdCB0aGVzZSBkcmlsbHMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwibWFudWFsXCIsXG4gICAgICAgIG5leHRMYWJlbDogXCJGaW5pc2hcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gIF07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZVR1dG9yaWFsRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBjcmVhdGVSb2xlcyB9IGZyb20gXCIuL3JvbGVzXCI7XG5pbXBvcnQgeyBnZXRCYXNpY1R1dG9yaWFsU3RlcHMgfSBmcm9tIFwiLi9zdGVwc19iYXNpY1wiO1xuZXhwb3J0IGNvbnN0IEJBU0lDX1RVVE9SSUFMX0lEID0gXCJzaGlwLWJhc2ljc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsQ29udHJvbGxlciB7XG4gIHN0YXJ0KG9wdGlvbnM/OiB7IHJlc3VtZT86IGJvb2xlYW4gfSk6IHZvaWQ7XG4gIHJlc3RhcnQoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRUdXRvcmlhbChidXM6IEV2ZW50QnVzKTogVHV0b3JpYWxDb250cm9sbGVyIHtcbiAgY29uc3Qgcm9sZXMgPSBjcmVhdGVSb2xlcygpO1xuICBjb25zdCBlbmdpbmUgPSBjcmVhdGVUdXRvcmlhbEVuZ2luZSh7XG4gICAgaWQ6IEJBU0lDX1RVVE9SSUFMX0lELFxuICAgIGJ1cyxcbiAgICByb2xlcyxcbiAgICBzdGVwczogZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzKCksXG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RhcnQob3B0aW9ucykge1xuICAgICAgZW5naW5lLnN0YXJ0KG9wdGlvbnMpO1xuICAgIH0sXG4gICAgcmVzdGFydCgpIHtcbiAgICAgIGVuZ2luZS5yZXN0YXJ0KCk7XG4gICAgfSxcbiAgICBkZXN0cm95KCkge1xuICAgICAgZW5naW5lLmRlc3Ryb3koKTtcbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVDaG9pY2Uge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVDb250ZW50IHtcbiAgc3BlYWtlcjogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIGludGVudD86IFwiZmFjdG9yeVwiIHwgXCJ1bml0XCI7XG4gIGNob2ljZXM/OiBEaWFsb2d1ZUNob2ljZVtdO1xuICB0eXBpbmdTcGVlZE1zPzogbnVtYmVyO1xuICBvbkNob2ljZT86IChjaG9pY2VJZDogc3RyaW5nKSA9PiB2b2lkO1xuICBvblRleHRGdWxseVJlbmRlcmVkPzogKCkgPT4gdm9pZDtcbiAgb25Db250aW51ZT86ICgpID0+IHZvaWQ7XG4gIGNvbnRpbnVlTGFiZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVPdmVybGF5IHtcbiAgc2hvdyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkO1xuICBoaWRlKCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgaXNWaXNpYmxlKCk6IGJvb2xlYW47XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJkaWFsb2d1ZS1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkoKTogRGlhbG9ndWVPdmVybGF5IHtcbiAgZW5zdXJlU3R5bGVzKCk7XG5cbiAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1vdmVybGF5XCI7XG4gIG92ZXJsYXkuc2V0QXR0cmlidXRlKFwiYXJpYS1saXZlXCIsIFwicG9saXRlXCIpO1xuXG4gIGNvbnN0IGNvbnNvbGVGcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGNvbnNvbGVGcmFtZS5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNvbnNvbGVcIjtcblxuICBjb25zdCBzcGVha2VyTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzcGVha2VyTGFiZWwuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1zcGVha2VyXCI7XG5cbiAgY29uc3QgdGV4dEJsb2NrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGV4dEJsb2NrLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtdGV4dFwiO1xuXG4gIGNvbnN0IGN1cnNvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBjdXJzb3IuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jdXJzb3JcIjtcbiAgY3Vyc29yLnRleHRDb250ZW50ID0gXCJfXCI7XG5cbiAgY29uc3QgY2hvaWNlc0xpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidWxcIik7XG4gIGNob2ljZXNMaXN0LmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY2hvaWNlcyBoaWRkZW5cIjtcblxuICBjb25zdCBjb250aW51ZUJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGNvbnRpbnVlQnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICBjb250aW51ZUJ1dHRvbi5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNvbnRpbnVlIGhpZGRlblwiO1xuICBjb250aW51ZUJ1dHRvbi50ZXh0Q29udGVudCA9IFwiQ29udGludWVcIjtcblxuICB0ZXh0QmxvY2suYXBwZW5kKGN1cnNvcik7XG4gIGNvbnNvbGVGcmFtZS5hcHBlbmQoc3BlYWtlckxhYmVsLCB0ZXh0QmxvY2ssIGNob2ljZXNMaXN0LCBjb250aW51ZUJ1dHRvbik7XG4gIG92ZXJsYXkuYXBwZW5kKGNvbnNvbGVGcmFtZSk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHR5cGluZ0hhbmRsZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCB0YXJnZXRUZXh0ID0gXCJcIjtcbiAgbGV0IHJlbmRlcmVkQ2hhcnMgPSAwO1xuICBsZXQgYWN0aXZlQ29udGVudDogRGlhbG9ndWVDb250ZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gY2xlYXJUeXBpbmcoKTogdm9pZCB7XG4gICAgaWYgKHR5cGluZ0hhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0eXBpbmdIYW5kbGUpO1xuICAgICAgdHlwaW5nSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBmaW5pc2hUeXBpbmcoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgcmVuZGVyZWRDaGFycyA9IHRhcmdldFRleHQubGVuZ3RoO1xuICAgIHVwZGF0ZVRleHQoKTtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIGNvbnRlbnQub25UZXh0RnVsbHlSZW5kZXJlZD8uKCk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgfHwgY29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVRleHQoKTogdm9pZCB7XG4gICAgY29uc3QgdGV4dFRvU2hvdyA9IHRhcmdldFRleHQuc2xpY2UoMCwgcmVuZGVyZWRDaGFycyk7XG4gICAgdGV4dEJsb2NrLmlubmVySFRNTCA9IFwiXCI7XG4gICAgY29uc3QgdGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICB0ZXh0Tm9kZS50ZXh0Q29udGVudCA9IHRleHRUb1Nob3c7XG4gICAgdGV4dEJsb2NrLmFwcGVuZCh0ZXh0Tm9kZSwgY3Vyc29yKTtcbiAgICBjdXJzb3IuY2xhc3NMaXN0LnRvZ2dsZShcImhpZGRlblwiLCAhdmlzaWJsZSk7XG4gIH1cblxuICBmdW5jdGlvbiByZW5kZXJDaG9pY2VzKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGNob2ljZXNMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgY29uc3QgY2hvaWNlcyA9IEFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSA/IGNvbnRlbnQuY2hvaWNlcyA6IFtdO1xuICAgIGlmIChjaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgYnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgICAgYnV0dG9uLmRhdGFzZXQuY2hvaWNlSWQgPSBjaG9pY2UuaWQ7XG4gICAgICBidXR0b24udGV4dENvbnRlbnQgPSBgJHtpbmRleCArIDF9LiAke2Nob2ljZS50ZXh0fWA7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgICAgY29udGVudC5vbkNob2ljZT8uKGNob2ljZS5pZCk7XG4gICAgICB9KTtcbiAgICAgIGl0ZW0uYXBwZW5kKGJ1dHRvbik7XG4gICAgICBjaG9pY2VzTGlzdC5hcHBlbmQoaXRlbSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzaG93Q29udGludWUoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgaWYgKCFjb250ZW50Lm9uQ29udGludWUpIHtcbiAgICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gbnVsbDtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29udGludWVCdXR0b24udGV4dENvbnRlbnQgPSBjb250ZW50LmNvbnRpbnVlTGFiZWwgPz8gXCJDb250aW51ZVwiO1xuICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24ub25jbGljayA9ICgpID0+IHtcbiAgICAgIGNvbnRlbnQub25Db250aW51ZT8uKCk7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjaGVkdWxlVHlwZShjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIGNvbnN0IHR5cGluZ1NwZWVkID0gY2xhbXAoTnVtYmVyKGNvbnRlbnQudHlwaW5nU3BlZWRNcykgfHwgMTgsIDgsIDY0KTtcbiAgICBjb25zdCB0aWNrID0gKCk6IHZvaWQgPT4ge1xuICAgICAgcmVuZGVyZWRDaGFycyA9IE1hdGgubWluKHJlbmRlcmVkQ2hhcnMgKyAxLCB0YXJnZXRUZXh0Lmxlbmd0aCk7XG4gICAgICB1cGRhdGVUZXh0KCk7XG4gICAgICBpZiAocmVuZGVyZWRDaGFycyA+PSB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgICBjbGVhclR5cGluZygpO1xuICAgICAgICBjb250ZW50Lm9uVGV4dEZ1bGx5UmVuZGVyZWQ/LigpO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSB8fCBjb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0eXBpbmdIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCh0aWNrLCB0eXBpbmdTcGVlZCk7XG4gICAgICB9XG4gICAgfTtcbiAgICB0eXBpbmdIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCh0aWNrLCB0eXBpbmdTcGVlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlIHx8ICFhY3RpdmVDb250ZW50KSByZXR1cm47XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFjdGl2ZUNvbnRlbnQuY2hvaWNlcykgfHwgYWN0aXZlQ29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCIgXCIgfHwgZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaWYgKHJlbmRlcmVkQ2hhcnMgPCB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgICAgIGZpbmlzaFR5cGluZyhhY3RpdmVDb250ZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhY3RpdmVDb250ZW50Lm9uQ29udGludWU/LigpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGluZGV4ID0gcGFyc2VJbnQoZXZlbnQua2V5LCAxMCk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShpbmRleCkgJiYgaW5kZXggPj0gMSAmJiBpbmRleCA8PSBhY3RpdmVDb250ZW50LmNob2ljZXMubGVuZ3RoKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgY2hvaWNlID0gYWN0aXZlQ29udGVudC5jaG9pY2VzW2luZGV4IC0gMV07XG4gICAgICBhY3RpdmVDb250ZW50Lm9uQ2hvaWNlPy4oY2hvaWNlLmlkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiICYmIHJlbmRlcmVkQ2hhcnMgPCB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGZpbmlzaFR5cGluZyhhY3RpdmVDb250ZW50KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGFjdGl2ZUNvbnRlbnQgPSBjb250ZW50O1xuICAgIHZpc2libGUgPSB0cnVlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gICAgb3ZlcmxheS5kYXRhc2V0LmludGVudCA9IGNvbnRlbnQuaW50ZW50ID8/IFwiZmFjdG9yeVwiO1xuICAgIHNwZWFrZXJMYWJlbC50ZXh0Q29udGVudCA9IGNvbnRlbnQuc3BlYWtlcjtcblxuICAgIHRhcmdldFRleHQgPSBjb250ZW50LnRleHQ7XG4gICAgcmVuZGVyZWRDaGFycyA9IDA7XG4gICAgdXBkYXRlVGV4dCgpO1xuICAgIHJlbmRlckNob2ljZXMoY29udGVudCk7XG4gICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgIHNjaGVkdWxlVHlwZShjb250ZW50KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIGFjdGl2ZUNvbnRlbnQgPSBudWxsO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICB0YXJnZXRUZXh0ID0gXCJcIjtcbiAgICByZW5kZXJlZENoYXJzID0gMDtcbiAgICB0ZXh0QmxvY2suaW5uZXJIVE1MID0gXCJcIjtcbiAgICB0ZXh0QmxvY2suYXBwZW5kKGN1cnNvcik7XG4gICAgY2hvaWNlc0xpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24ub25jbGljayA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95KCk6IHZvaWQge1xuICAgIGhpZGUoKTtcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duKTtcbiAgICBvdmVybGF5LnJlbW92ZSgpO1xuICB9XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlS2V5RG93bik7XG5cbiAgcmV0dXJuIHtcbiAgICBzaG93LFxuICAgIGhpZGUsXG4gICAgZGVzdHJveSxcbiAgICBpc1Zpc2libGUoKSB7XG4gICAgICByZXR1cm4gdmlzaWJsZTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBlbnN1cmVTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gIHN0eWxlLmlkID0gU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC5kaWFsb2d1ZS1vdmVybGF5IHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGluc2V0OiAwO1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgei1pbmRleDogNjA7XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdHJhbnNpdGlvbjogb3BhY2l0eSAwLjJzIGVhc2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5LnZpc2libGUge1xuICAgICAgb3BhY2l0eTogMTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBtaW4td2lkdGg6IDMyMHB4O1xuICAgICAgbWF4LXdpZHRoOiBtaW4oNTIwcHgsIGNhbGMoMTAwdncgLSA0OHB4KSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDYsIDExLCAxNiwgMC45Mik7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgICAgIHBhZGRpbmc6IDE4cHggMjBweDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiAxNHB4O1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgyLCA2LCAxNiwgMC42KTtcbiAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgZm9udC1mYW1pbHk6IFwiSUJNIFBsZXggTW9ub1wiLCBcIkpldEJyYWlucyBNb25vXCIsIHVpLW1vbm9zcGFjZSwgU0ZNb25vLVJlZ3VsYXIsIE1lbmxvLCBNb25hY28sIENvbnNvbGFzLCBcIkxpYmVyYXRpb24gTW9ub1wiLCBcIkNvdXJpZXIgTmV3XCIsIG1vbm9zcGFjZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXlbZGF0YS1pbnRlbnQ9XCJmYWN0b3J5XCJdIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNDUpO1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgxMywgMTQ4LCAxMzYsIDAuMzUpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheVtkYXRhLWludGVudD1cInVuaXRcIl0gLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDI0NCwgMTE0LCAxODIsIDAuNDUpO1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgyMzYsIDcyLCAxNTMsIDAuMjgpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtc3BlYWtlciB7XG4gICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4xNmVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuNzUpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtdGV4dCB7XG4gICAgICBtaW4taGVpZ2h0OiA5MHB4O1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuNTU7XG4gICAgICB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jdXJzb3Ige1xuICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICAgICAgbWFyZ2luLWxlZnQ6IDRweDtcbiAgICAgIGFuaW1hdGlvbjogZGlhbG9ndWUtY3Vyc29yLWJsaW5rIDEuMnMgc3RlcHMoMiwgc3RhcnQpIGluZmluaXRlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY3Vyc29yLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyB7XG4gICAgICBsaXN0LXN0eWxlOiBub25lO1xuICAgICAgbWFyZ2luOiAwO1xuICAgICAgcGFkZGluZzogMDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiA4cHg7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b24sXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgICAgcGFkZGluZzogOHB4IDEwcHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMyk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI0LCAzNiwgNDgsIDAuODUpO1xuICAgICAgY29sb3I6IGluaGVyaXQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMThzIGVhc2UsIGJvcmRlci1jb2xvciAwLjE4cyBlYXNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29udGludWUge1xuICAgICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29udGludWUuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbjpob3ZlcixcbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b246Zm9jdXMtdmlzaWJsZSxcbiAgICAuZGlhbG9ndWUtY29udGludWU6aG92ZXIsXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlOmZvY3VzLXZpc2libGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC41NSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMwLCA0NSwgNjAsIDAuOTUpO1xuICAgICAgb3V0bGluZTogbm9uZTtcbiAgICB9XG4gICAgQGtleWZyYW1lcyBkaWFsb2d1ZS1jdXJzb3ItYmxpbmsge1xuICAgICAgMCUsIDUwJSB7IG9wYWNpdHk6IDE7IH1cbiAgICAgIDUwLjAxJSwgMTAwJSB7IG9wYWNpdHk6IDA7IH1cbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG4iLCAiY29uc3QgU1RPUkFHRV9QUkVGSVggPSBcImxzZDpzdG9yeTpcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUZsYWdzIHtcbiAgW2tleTogc3RyaW5nXTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeVByb2dyZXNzIHtcbiAgY2hhcHRlcklkOiBzdHJpbmc7XG4gIG5vZGVJZDogc3RyaW5nO1xuICBmbGFnczogU3RvcnlGbGFncztcbiAgdmlzaXRlZD86IHN0cmluZ1tdO1xuICB1cGRhdGVkQXQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZ2V0U3RvcmFnZSgpOiBTdG9yYWdlIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIgfHwgIXdpbmRvdy5sb2NhbFN0b3JhZ2UpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG59XG5cbmZ1bmN0aW9uIHN0b3JhZ2VLZXkoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIGNvbnN0IHJvb21TZWdtZW50ID0gcm9vbUlkID8gYCR7cm9vbUlkfTpgIDogXCJcIjtcbiAgcmV0dXJuIGAke1NUT1JBR0VfUFJFRklYfSR7cm9vbVNlZ21lbnR9JHtjaGFwdGVySWR9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBTdG9yeVByb2dyZXNzIHwgbnVsbCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgY29uc3QgcmF3ID0gc3RvcmFnZS5nZXRJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFN0b3J5UHJvZ3Jlc3M7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHBhcnNlZCAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQgPT09IG51bGwgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuY2hhcHRlcklkICE9PSBcInN0cmluZ1wiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLm5vZGVJZCAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC51cGRhdGVkQXQgIT09IFwibnVtYmVyXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuZmxhZ3MgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkLmZsYWdzID09PSBudWxsXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGNoYXB0ZXJJZDogcGFyc2VkLmNoYXB0ZXJJZCxcbiAgICAgIG5vZGVJZDogcGFyc2VkLm5vZGVJZCxcbiAgICAgIGZsYWdzOiB7IC4uLnBhcnNlZC5mbGFncyB9LFxuICAgICAgdmlzaXRlZDogQXJyYXkuaXNBcnJheShwYXJzZWQudmlzaXRlZCkgPyBbLi4ucGFyc2VkLnZpc2l0ZWRdIDogdW5kZWZpbmVkLFxuICAgICAgdXBkYXRlZEF0OiBwYXJzZWQudXBkYXRlZEF0LFxuICAgIH07XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlU3RvcnlQcm9ncmVzcyhjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBwcm9ncmVzczogU3RvcnlQcm9ncmVzcyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnNldEl0ZW0oc3RvcmFnZUtleShjaGFwdGVySWQsIHJvb21JZCksIEpTT04uc3RyaW5naWZ5KHByb2dyZXNzKSk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIGlnbm9yZSBwZXJzaXN0ZW5jZSBlcnJvcnNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5yZW1vdmVJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gaWdub3JlIHBlcnNpc3RlbmNlIGVycm9yc1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVGbGFnKGN1cnJlbnQ6IFN0b3J5RmxhZ3MsIGZsYWc6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiBTdG9yeUZsYWdzIHtcbiAgY29uc3QgbmV4dCA9IHsgLi4uY3VycmVudCB9O1xuICBpZiAoIXZhbHVlKSB7XG4gICAgZGVsZXRlIG5leHRbZmxhZ107XG4gIH0gZWxzZSB7XG4gICAgbmV4dFtmbGFnXSA9IHRydWU7XG4gIH1cbiAgcmV0dXJuIG5leHQ7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBQUk5HIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IGNsYXNzIEF1ZGlvRW5naW5lIHtcbiAgcHJpdmF0ZSBzdGF0aWMgX2luc3Q6IEF1ZGlvRW5naW5lIHwgbnVsbCA9IG51bGw7XG5cbiAgcHVibGljIHJlYWRvbmx5IGN0eDogQXVkaW9Db250ZXh0O1xuICBwcml2YXRlIHJlYWRvbmx5IG1hc3RlcjogR2Fpbk5vZGU7XG4gIHByaXZhdGUgcmVhZG9ubHkgbXVzaWNCdXM6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHJlYWRvbmx5IHNmeEJ1czogR2Fpbk5vZGU7XG5cbiAgcHJpdmF0ZSBfdGFyZ2V0TWFzdGVyID0gMC45O1xuICBwcml2YXRlIF90YXJnZXRNdXNpYyA9IDAuOTtcbiAgcHJpdmF0ZSBfdGFyZ2V0U2Z4ID0gMC45O1xuXG4gIHN0YXRpYyBnZXQoKTogQXVkaW9FbmdpbmUge1xuICAgIGlmICghdGhpcy5faW5zdCkgdGhpcy5faW5zdCA9IG5ldyBBdWRpb0VuZ2luZSgpO1xuICAgIHJldHVybiB0aGlzLl9pbnN0O1xuICB9XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmN0eCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWCA9ICh0aGlzIGFzIGFueSkuY3R4O1xuXG4gICAgdGhpcy5tYXN0ZXIgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0TWFzdGVyIH0pO1xuICAgIHRoaXMubXVzaWNCdXMgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0TXVzaWMgfSk7XG4gICAgdGhpcy5zZnhCdXMgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0U2Z4IH0pO1xuXG4gICAgdGhpcy5tdXNpY0J1cy5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLnNmeEJ1cy5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLm1hc3Rlci5jb25uZWN0KHRoaXMuY3R4LmRlc3RpbmF0aW9uKTtcbiAgfVxuXG4gIGdldCBub3coKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gIH1cblxuICBnZXRNdXNpY0J1cygpOiBHYWluTm9kZSB7XG4gICAgcmV0dXJuIHRoaXMubXVzaWNCdXM7XG4gIH1cblxuICBnZXRTZnhCdXMoKTogR2Fpbk5vZGUge1xuICAgIHJldHVybiB0aGlzLnNmeEJ1cztcbiAgfVxuXG4gIGFzeW5jIHJlc3VtZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5jdHguc3RhdGUgPT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuY3R4LnJlc3VtZSgpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHN1c3BlbmQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuY3R4LnN0YXRlID09PSBcInJ1bm5pbmdcIikge1xuICAgICAgYXdhaXQgdGhpcy5jdHguc3VzcGVuZCgpO1xuICAgIH1cbiAgfVxuXG4gIHNldE1hc3RlckdhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0TWFzdGVyID0gdjtcbiAgICB0aGlzLm1hc3Rlci5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm1hc3Rlci5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIHNldE11c2ljR2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRNdXNpYyA9IHY7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgc2V0U2Z4R2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRTZnggPSB2O1xuICAgIHRoaXMuc2Z4QnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMuc2Z4QnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgZHVja011c2ljKGxldmVsID0gMC40LCBhdHRhY2sgPSAwLjA1KTogdm9pZCB7XG4gICAgY29uc3QgdCA9IHRoaXMubm93O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKGxldmVsLCB0ICsgYXR0YWNrKTtcbiAgfVxuXG4gIHVuZHVja011c2ljKHJlbGVhc2UgPSAwLjI1KTogdm9pZCB7XG4gICAgY29uc3QgdCA9IHRoaXMubm93O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRoaXMuX3RhcmdldE11c2ljLCB0ICsgcmVsZWFzZSk7XG4gIH1cbn1cblxuLy8gVGlueSBzZWVkYWJsZSBQUk5HIChNdWxiZXJyeTMyKVxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VQUk5HKHNlZWQ6IG51bWJlcik6IFBSTkcge1xuICBsZXQgcyA9IChzZWVkID4+PiAwKSB8fCAxO1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHMgKz0gMHg2RDJCNzlGNTtcbiAgICBsZXQgdCA9IE1hdGguaW11bChzIF4gKHMgPj4+IDE1KSwgMSB8IHMpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCA2MSB8IHQpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuIiwgIi8vIExvdy1sZXZlbCBncmFwaCBidWlsZGVycyAvIGhlbHBlcnNcblxuZXhwb3J0IGZ1bmN0aW9uIG9zYyhjdHg6IEF1ZGlvQ29udGV4dCwgdHlwZTogT3NjaWxsYXRvclR5cGUsIGZyZXE6IG51bWJlcikge1xuICByZXR1cm4gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlLCBmcmVxdWVuY3k6IGZyZXEgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub2lzZShjdHg6IEF1ZGlvQ29udGV4dCkge1xuICBjb25zdCBidWZmZXIgPSBjdHguY3JlYXRlQnVmZmVyKDEsIGN0eC5zYW1wbGVSYXRlICogMiwgY3R4LnNhbXBsZVJhdGUpO1xuICBjb25zdCBkYXRhID0gYnVmZmVyLmdldENoYW5uZWxEYXRhKDApO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIGRhdGFbaV0gPSBNYXRoLnJhbmRvbSgpICogMiAtIDE7XG4gIHJldHVybiBuZXcgQXVkaW9CdWZmZXJTb3VyY2VOb2RlKGN0eCwgeyBidWZmZXIsIGxvb3A6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYWtlUGFubmVyKGN0eDogQXVkaW9Db250ZXh0LCBwYW4gPSAwKSB7XG4gIHJldHVybiBuZXcgU3RlcmVvUGFubmVyTm9kZShjdHgsIHsgcGFuIH0pO1xufVxuXG4vKiogQmFzaWMgQURTUiBhcHBsaWVkIHRvIGEgR2Fpbk5vZGUgQXVkaW9QYXJhbS4gUmV0dXJucyBhIGZ1bmN0aW9uIHRvIHJlbGVhc2UuICovXG5leHBvcnQgZnVuY3Rpb24gYWRzcihcbiAgY3R4OiBBdWRpb0NvbnRleHQsXG4gIHBhcmFtOiBBdWRpb1BhcmFtLFxuICB0MDogbnVtYmVyLFxuICBhID0gMC4wMSwgLy8gYXR0YWNrXG4gIGQgPSAwLjA4LCAvLyBkZWNheVxuICBzID0gMC41LCAgLy8gc3VzdGFpbiAoMC4uMSBvZiBwZWFrKVxuICByID0gMC4yLCAgLy8gcmVsZWFzZVxuICBwZWFrID0gMVxuKSB7XG4gIHBhcmFtLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0MCk7XG4gIHBhcmFtLnNldFZhbHVlQXRUaW1lKDAsIHQwKTtcbiAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUocGVhaywgdDAgKyBhKTtcbiAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUocyAqIHBlYWssIHQwICsgYSArIGQpO1xuICByZXR1cm4gKHJlbGVhc2VBdCA9IGN0eC5jdXJyZW50VGltZSkgPT4ge1xuICAgIHBhcmFtLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhyZWxlYXNlQXQpO1xuICAgIC8vIGF2b2lkIHN1ZGRlbiBqdW1wczsgY29udGludWUgZnJvbSBjdXJyZW50XG4gICAgcGFyYW0uc2V0VmFsdWVBdFRpbWUocGFyYW0udmFsdWUsIHJlbGVhc2VBdCk7XG4gICAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wMDAxLCByZWxlYXNlQXQgKyByKTtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxmb1RvUGFyYW0oXG4gIGN0eDogQXVkaW9Db250ZXh0LFxuICB0YXJnZXQ6IEF1ZGlvUGFyYW0sXG4gIHsgZnJlcXVlbmN5ID0gMC4xLCBkZXB0aCA9IDMwMCwgdHlwZSA9IFwic2luZVwiIGFzIE9zY2lsbGF0b3JUeXBlIH0gPSB7fVxuKSB7XG4gIGNvbnN0IGxmbyA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZSwgZnJlcXVlbmN5IH0pO1xuICBjb25zdCBhbXAgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IGRlcHRoIH0pO1xuICBsZm8uY29ubmVjdChhbXApLmNvbm5lY3QodGFyZ2V0KTtcbiAgcmV0dXJuIHtcbiAgICBzdGFydChhdCA9IGN0eC5jdXJyZW50VGltZSkgeyBsZm8uc3RhcnQoYXQpOyB9LFxuICAgIHN0b3AoYXQgPSBjdHguY3VycmVudFRpbWUpIHsgbGZvLnN0b3AoYXQpOyBhbXAuZGlzY29ubmVjdCgpOyB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBhZHNyLCBtYWtlUGFubmVyLCBub2lzZSwgb3NjIH0gZnJvbSBcIi4vZ3JhcGhcIjtcbmltcG9ydCB0eXBlIHsgU2Z4TmFtZSB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbi8qKiBGaXJlLWFuZC1mb3JnZXQgU0ZYIGJ5IG5hbWUsIHdpdGggc2ltcGxlIHBhcmFtcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGF5U2Z4KFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICBuYW1lOiBTZnhOYW1lLFxuICBvcHRzOiB7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfSA9IHt9XG4pIHtcbiAgc3dpdGNoIChuYW1lKSB7XG4gICAgY2FzZSBcImxhc2VyXCI6IHJldHVybiBwbGF5TGFzZXIoZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwidGhydXN0XCI6IHJldHVybiBwbGF5VGhydXN0KGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImV4cGxvc2lvblwiOiByZXR1cm4gcGxheUV4cGxvc2lvbihlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJsb2NrXCI6IHJldHVybiBwbGF5TG9jayhlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJ1aVwiOiByZXR1cm4gcGxheVVpKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImRpYWxvZ3VlXCI6IHJldHVybiBwbGF5RGlhbG9ndWUoZW5naW5lLCBvcHRzKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUxhc2VyKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBvID0gb3NjKGN0eCwgXCJzcXVhcmVcIiwgNjgwICsgMTYwICogdmVsb2NpdHkpO1xuICBjb25zdCBmID0gbmV3IEJpcXVhZEZpbHRlck5vZGUoY3R4LCB7IHR5cGU6IFwibG93cGFzc1wiLCBmcmVxdWVuY3k6IDEyMDAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDIsIDAuMDMsIDAuMjUsIDAuMDgsIDAuNjUpO1xuICBvLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4wNik7XG4gIG8uc3RvcChub3cgKyAwLjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheVRocnVzdChcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDAuNiwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBuID0gbm9pc2UoY3R4KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwge1xuICAgIHR5cGU6IFwiYmFuZHBhc3NcIixcbiAgICBmcmVxdWVuY3k6IDE4MCArIDM2MCAqIHZlbG9jaXR5LFxuICAgIFE6IDEuMSxcbiAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBuLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMTIsIDAuMTUsIDAuNzUsIDAuMjUsIDAuNDUgKiB2ZWxvY2l0eSk7XG4gIG4uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjI1KTtcbiAgbi5zdG9wKG5vdyArIDEuMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RXhwbG9zaW9uKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBuID0gbm9pc2UoY3R4KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwge1xuICAgIHR5cGU6IFwibG93cGFzc1wiLFxuICAgIGZyZXF1ZW5jeTogMjIwMCAqIE1hdGgubWF4KDAuMiwgTWF0aC5taW4odmVsb2NpdHksIDEpKSxcbiAgICBROiAwLjIsXG4gIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbi5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDA1LCAwLjA4LCAwLjUsIDAuMzUsIDEuMSAqIHZlbG9jaXR5KTtcbiAgbi5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMTUgKyAwLjEgKiB2ZWxvY2l0eSk7XG4gIG4uc3RvcChub3cgKyAxLjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUxvY2soXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IGJhc2UgPSA1MjAgKyAxNDAgKiB2ZWxvY2l0eTtcbiAgY29uc3QgbzEgPSBvc2MoY3R4LCBcInNpbmVcIiwgYmFzZSk7XG4gIGNvbnN0IG8yID0gb3NjKGN0eCwgXCJzaW5lXCIsIGJhc2UgKiAxLjUpO1xuXG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvMS5jb25uZWN0KGcpOyBvMi5jb25uZWN0KGcpO1xuICBnLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuXG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAxLCAwLjAyLCAwLjAsIDAuMTIsIDAuNik7XG4gIG8xLnN0YXJ0KG5vdyk7IG8yLnN0YXJ0KG5vdyArIDAuMDIpO1xuICByZWxlYXNlKG5vdyArIDAuMDYpO1xuICBvMS5zdG9wKG5vdyArIDAuMik7IG8yLnN0b3Aobm93ICsgMC4yMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5VWkoZW5naW5lOiBBdWRpb0VuZ2luZSwgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9KSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInRyaWFuZ2xlXCIsIDg4MCAtIDEyMCAqIHZlbG9jaXR5KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDEsIDAuMDQsIDAuMCwgMC4wOCwgMC4zNSk7XG4gIG8uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjA1KTtcbiAgby5zdG9wKG5vdyArIDAuMTgpO1xufVxuXG4vKiogRGlhbG9ndWUgY3VlIHVzZWQgYnkgdGhlIHN0b3J5IG92ZXJsYXkgKHNob3J0LCBnZW50bGUgcGluZykuICovXG5leHBvcnQgZnVuY3Rpb24gcGxheURpYWxvZ3VlKGVuZ2luZTogQXVkaW9FbmdpbmUsIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fSkge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBmcmVxID0gNDgwICsgMTYwICogdmVsb2NpdHk7XG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInNpbmVcIiwgZnJlcSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAuMDAwMSB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgZy5nYWluLnNldFZhbHVlQXRUaW1lKDAuMDAwMSwgbm93KTtcbiAgZy5nYWluLmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUoMC4wNCwgbm93ICsgMC4wMik7XG4gIGcuZ2Fpbi5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwNSwgbm93ICsgMC4yOCk7XG5cbiAgby5zdGFydChub3cpO1xuICBvLnN0b3Aobm93ICsgMC4zKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFN0b3J5SW50ZW50IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4uL2F1ZGlvL2VuZ2luZVwiO1xuaW1wb3J0IHsgcGxheURpYWxvZ3VlIGFzIHBsYXlEaWFsb2d1ZVNmeCB9IGZyb20gXCIuLi9hdWRpby9zZnhcIjtcblxubGV0IGxhc3RQbGF5ZWRBdCA9IDA7XG5cbi8vIE1haW50YWluIHRoZSBvbGQgcHVibGljIEFQSSBzbyBlbmdpbmUudHMgZG9lc24ndCBjaGFuZ2VcbmV4cG9ydCBmdW5jdGlvbiBnZXRBdWRpb0NvbnRleHQoKTogQXVkaW9Db250ZXh0IHtcbiAgcmV0dXJuIEF1ZGlvRW5naW5lLmdldCgpLmN0eDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc3VtZUF1ZGlvKCk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCBBdWRpb0VuZ2luZS5nZXQoKS5yZXN1bWUoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlEaWFsb2d1ZUN1ZShpbnRlbnQ6IFN0b3J5SW50ZW50KTogdm9pZCB7XG4gIGNvbnN0IGVuZ2luZSA9IEF1ZGlvRW5naW5lLmdldCgpO1xuICBjb25zdCBub3cgPSBlbmdpbmUubm93O1xuXG4gIC8vIFRocm90dGxlIHJhcGlkIGN1ZXMgdG8gYXZvaWQgY2x1dHRlclxuICBpZiAobm93IC0gbGFzdFBsYXllZEF0IDwgMC4xKSByZXR1cm47XG4gIGxhc3RQbGF5ZWRBdCA9IG5vdztcblxuICAvLyBNYXAgXCJmYWN0b3J5XCIgdnMgb3RoZXJzIHRvIGEgc2xpZ2h0bHkgZGlmZmVyZW50IHZlbG9jaXR5IChicmlnaHRuZXNzKVxuICBjb25zdCB2ZWxvY2l0eSA9IGludGVudCA9PT0gXCJmYWN0b3J5XCIgPyAwLjggOiAwLjU7XG4gIHBsYXlEaWFsb2d1ZVNmeChlbmdpbmUsIHsgdmVsb2NpdHksIHBhbjogMCB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN1c3BlbmREaWFsb2d1ZUF1ZGlvKCk6IHZvaWQge1xuICB2b2lkIEF1ZGlvRW5naW5lLmdldCgpLnN1c3BlbmQoKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHR5cGUgeyBEaWFsb2d1ZU92ZXJsYXkgfSBmcm9tIFwiLi9vdmVybGF5XCI7XG5pbXBvcnQgdHlwZSB7IFN0b3J5Q2hhcHRlciwgU3RvcnlDaG9pY2VEZWZpbml0aW9uLCBTdG9yeU5vZGUsIFN0b3J5VHJpZ2dlciB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQge1xuICBjbGVhclN0b3J5UHJvZ3Jlc3MsXG4gIGxvYWRTdG9yeVByb2dyZXNzLFxuICBzYXZlU3RvcnlQcm9ncmVzcyxcbiAgU3RvcnlGbGFncyxcbn0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuaW1wb3J0IHsgcGxheURpYWxvZ3VlQ3VlIH0gZnJvbSBcIi4vc2Z4XCI7XG5cbmludGVyZmFjZSBTdG9yeUVuZ2luZU9wdGlvbnMge1xuICBidXM6IEV2ZW50QnVzO1xuICBvdmVybGF5OiBEaWFsb2d1ZU92ZXJsYXk7XG4gIGNoYXB0ZXI6IFN0b3J5Q2hhcHRlcjtcbiAgcm9vbUlkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgU3RvcnlRdWV1ZUl0ZW0ge1xuICBub2RlSWQ6IHN0cmluZztcbiAgZm9yY2U6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBQcmVwYXJlZENob2ljZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbiAgbmV4dDogc3RyaW5nIHwgbnVsbDtcbiAgc2V0RmxhZ3M6IHN0cmluZ1tdO1xuICBjbGVhckZsYWdzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUVuZ2luZSB7XG4gIHN0YXJ0KCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgcmVzZXQoKTogdm9pZDtcbn1cblxuY29uc3QgREVGQVVMVF9UWVBJTkdfTVMgPSAxODtcbmNvbnN0IE1JTl9UWVBJTkdfTVMgPSA4O1xuY29uc3QgTUFYX1RZUElOR19NUyA9IDY0O1xuY29uc3QgQVVUT19BRFZBTkNFX01JTl9ERUxBWSA9IDIwMDtcbmNvbnN0IEFVVE9fQURWQU5DRV9NQVhfREVMQVkgPSA4MDAwO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU3RvcnlFbmdpbmUoeyBidXMsIG92ZXJsYXksIGNoYXB0ZXIsIHJvb21JZCB9OiBTdG9yeUVuZ2luZU9wdGlvbnMpOiBTdG9yeUVuZ2luZSB7XG4gIGNvbnN0IG5vZGVzID0gbmV3IE1hcDxzdHJpbmcsIFN0b3J5Tm9kZT4oT2JqZWN0LmVudHJpZXMoY2hhcHRlci5ub2RlcykpO1xuICBjb25zdCBxdWV1ZTogU3RvcnlRdWV1ZUl0ZW1bXSA9IFtdO1xuICBjb25zdCBsaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG4gIGNvbnN0IHBlbmRpbmdUaW1lcnMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG4gIGxldCBmbGFnczogU3RvcnlGbGFncyA9IHt9O1xuICBsZXQgdmlzaXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBsZXQgY3VycmVudE5vZGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBzdGFydGVkID0gZmFsc2U7XG4gIGxldCBhdXRvQWR2YW5jZUhhbmRsZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gY2xhbXAodmFsdWU6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmZlckludGVudChub2RlOiBTdG9yeU5vZGUpOiBcImZhY3RvcnlcIiB8IFwidW5pdFwiIHtcbiAgICBpZiAobm9kZS5pbnRlbnQpIHJldHVybiBub2RlLmludGVudDtcbiAgICBjb25zdCBzcGVha2VyID0gbm9kZS5zcGVha2VyLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHNwZWFrZXIuaW5jbHVkZXMoXCJ1bml0XCIpKSB7XG4gICAgICByZXR1cm4gXCJ1bml0XCI7XG4gICAgfVxuICAgIHJldHVybiBcImZhY3RvcnlcIjtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNhdmUobm9kZUlkOiBzdHJpbmcgfCBudWxsKTogdm9pZCB7XG4gICAgY29uc3QgcHJvZ3Jlc3MgPSB7XG4gICAgICBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQsXG4gICAgICBub2RlSWQ6IG5vZGVJZCA/PyBjaGFwdGVyLnN0YXJ0LFxuICAgICAgZmxhZ3MsXG4gICAgICB2aXNpdGVkOiBBcnJheS5mcm9tKHZpc2l0ZWQpLFxuICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgc2F2ZVN0b3J5UHJvZ3Jlc3MoY2hhcHRlci5pZCwgcm9vbUlkLCBwcm9ncmVzcyk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRGbGFnKGZsYWc6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBjb25zdCBuZXh0ID0geyAuLi5mbGFncyB9O1xuICAgIGlmICh2YWx1ZSkge1xuICAgICAgaWYgKG5leHRbZmxhZ10pIHJldHVybjtcbiAgICAgIG5leHRbZmxhZ10gPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAobmV4dFtmbGFnXSkge1xuICAgICAgZGVsZXRlIG5leHRbZmxhZ107XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmxhZ3MgPSBuZXh0O1xuICAgIGJ1cy5lbWl0KFwic3Rvcnk6ZmxhZ1VwZGF0ZWRcIiwgeyBmbGFnLCB2YWx1ZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFwcGx5Q2hvaWNlRmxhZ3MoY2hvaWNlOiBQcmVwYXJlZENob2ljZSk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2Uuc2V0RmxhZ3MpIHtcbiAgICAgIHNldEZsYWcoZmxhZywgdHJ1ZSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2UuY2xlYXJGbGFncykge1xuICAgICAgc2V0RmxhZyhmbGFnLCBmYWxzZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcHJlcGFyZUNob2ljZXMobm9kZTogU3RvcnlOb2RlKTogUHJlcGFyZWRDaG9pY2VbXSB7XG4gICAgY29uc3QgZGVmcyA9IEFycmF5LmlzQXJyYXkobm9kZS5jaG9pY2VzKSA/IG5vZGUuY2hvaWNlcyA6IFtdO1xuICAgIHJldHVybiBkZWZzLm1hcCgoY2hvaWNlLCBpbmRleCkgPT4gbm9ybWFsaXplQ2hvaWNlKGNob2ljZSwgaW5kZXgpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZUNob2ljZShjaG9pY2U6IFN0b3J5Q2hvaWNlRGVmaW5pdGlvbiwgaW5kZXg6IG51bWJlcik6IFByZXBhcmVkQ2hvaWNlIHtcbiAgICBjb25zdCBzZXRGbGFncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IGNsZWFyRmxhZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBpZiAoY2hvaWNlLmZsYWcpIHtcbiAgICAgIHNldEZsYWdzLmFkZChjaG9pY2UuZmxhZyk7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGNob2ljZS5zZXRGbGFncykpIHtcbiAgICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2Uuc2V0RmxhZ3MpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIGZsYWcudHJpbSgpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBzZXRGbGFncy5hZGQoZmxhZyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoY2hvaWNlLmNsZWFyRmxhZ3MpKSB7XG4gICAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLmNsZWFyRmxhZ3MpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIGZsYWcudHJpbSgpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjbGVhckZsYWdzLmFkZChmbGFnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGNob2ljZS5pZCA/PyBjaG9pY2UuZmxhZyA/PyBgY2hvaWNlLSR7aW5kZXh9YCxcbiAgICAgIHRleHQ6IGNob2ljZS50ZXh0LFxuICAgICAgbmV4dDogY2hvaWNlLm5leHQgPz8gbnVsbCxcbiAgICAgIHNldEZsYWdzOiBBcnJheS5mcm9tKHNldEZsYWdzKSxcbiAgICAgIGNsZWFyRmxhZ3M6IEFycmF5LmZyb20oY2xlYXJGbGFncyksXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyQXV0b0FkdmFuY2UoKTogdm9pZCB7XG4gICAgaWYgKGF1dG9BZHZhbmNlSGFuZGxlICE9PSBudWxsKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGF1dG9BZHZhbmNlSGFuZGxlKTtcbiAgICAgIGF1dG9BZHZhbmNlSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbG9zZU5vZGUoKTogdm9pZCB7XG4gICAgaWYgKCFjdXJyZW50Tm9kZUlkKSByZXR1cm47XG4gICAgb3ZlcmxheS5oaWRlKCk7XG4gICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpjbG9zZWRcIiwgeyBub2RlSWQ6IGN1cnJlbnROb2RlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgICBjdXJyZW50Tm9kZUlkID0gbnVsbDtcbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgc2F2ZShudWxsKTtcbiAgICB0cnlTaG93TmV4dCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gYWR2YW5jZVRvKG5leHRJZDogc3RyaW5nIHwgbnVsbCwgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICBpZiAoY3VycmVudE5vZGVJZCkge1xuICAgICAgb3ZlcmxheS5oaWRlKCk7XG4gICAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNsb3NlZFwiLCB7IG5vZGVJZDogY3VycmVudE5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICAgICAgY3VycmVudE5vZGVJZCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChuZXh0SWQpIHtcbiAgICAgIGVucXVldWVOb2RlKG5leHRJZCwgeyBmb3JjZSB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2F2ZShudWxsKTtcbiAgICAgIHRyeVNob3dOZXh0KCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvd05vZGUobm9kZUlkOiBzdHJpbmcsIGZvcmNlID0gZmFsc2UpOiB2b2lkIHtcbiAgICBjb25zdCBub2RlID0gbm9kZXMuZ2V0KG5vZGVJZCk7XG4gICAgaWYgKCFub2RlKSByZXR1cm47XG5cbiAgICBjdXJyZW50Tm9kZUlkID0gbm9kZUlkO1xuICAgIHZpc2l0ZWQuYWRkKG5vZGVJZCk7XG4gICAgc2F2ZShub2RlSWQpO1xuICAgIGJ1cy5lbWl0KFwic3Rvcnk6cHJvZ3Jlc3NlZFwiLCB7IGNoYXB0ZXJJZDogY2hhcHRlci5pZCwgbm9kZUlkIH0pO1xuXG4gICAgY29uc3QgY2hvaWNlcyA9IHByZXBhcmVDaG9pY2VzKG5vZGUpO1xuICAgIGNvbnN0IGludGVudCA9IGluZmVySW50ZW50KG5vZGUpO1xuXG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuXG4gICAgY29uc3QgdHlwaW5nU3BlZWQgPSBjbGFtcChub2RlLnR5cGluZ1NwZWVkTXMgPz8gREVGQVVMVF9UWVBJTkdfTVMsIE1JTl9UWVBJTkdfTVMsIE1BWF9UWVBJTkdfTVMpO1xuXG4gICAgY29uc3QgY29udGVudCA9IHtcbiAgICAgIHNwZWFrZXI6IG5vZGUuc3BlYWtlcixcbiAgICAgIHRleHQ6IG5vZGUudGV4dCxcbiAgICAgIGludGVudCxcbiAgICAgIHR5cGluZ1NwZWVkTXM6IHR5cGluZ1NwZWVkLFxuICAgICAgY2hvaWNlczogY2hvaWNlcy5sZW5ndGggPiAwXG4gICAgICAgID8gY2hvaWNlcy5tYXAoKGNob2ljZSkgPT4gKHsgaWQ6IGNob2ljZS5pZCwgdGV4dDogY2hvaWNlLnRleHQgfSkpXG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgb25DaG9pY2U6IGNob2ljZXMubGVuZ3RoID4gMFxuICAgICAgICA/IChjaG9pY2VJZDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVkID0gY2hvaWNlcy5maW5kKChjaCkgPT4gY2guaWQgPT09IGNob2ljZUlkKTtcbiAgICAgICAgICAgIGlmICghbWF0Y2hlZCkgcmV0dXJuO1xuICAgICAgICAgICAgYXBwbHlDaG9pY2VGbGFncyhtYXRjaGVkKTtcbiAgICAgICAgICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2hvaWNlXCIsIHsgbm9kZUlkLCBjaG9pY2VJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICAgICAgICAgICAgYWR2YW5jZVRvKG1hdGNoZWQubmV4dCwgdHJ1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgcGxheURpYWxvZ3VlQ3VlKGludGVudCk7XG5cbiAgICBvdmVybGF5LnNob3coe1xuICAgICAgLi4uY29udGVudCxcbiAgICAgIG9uQ29udGludWU6ICFjaG9pY2VzLmxlbmd0aFxuICAgICAgICA/ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5leHQgPSBub2RlLm5leHQgPz8gbnVsbDtcbiAgICAgICAgICAgIGFkdmFuY2VUbyhuZXh0LCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgY29udGludWVMYWJlbDogbm9kZS5jb250aW51ZUxhYmVsLFxuICAgICAgb25UZXh0RnVsbHlSZW5kZXJlZDogKCkgPT4ge1xuICAgICAgICBpZiAoIWNob2ljZXMubGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKG5vZGUuYXV0b0FkdmFuY2UpIHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IG5vZGUuYXV0b0FkdmFuY2UubmV4dCA/PyBub2RlLm5leHQgPz8gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGRlbGF5ID0gY2xhbXAobm9kZS5hdXRvQWR2YW5jZS5kZWxheU1zID8/IDEyMDAsIEFVVE9fQURWQU5DRV9NSU5fREVMQVksIEFVVE9fQURWQU5DRV9NQVhfREVMQVkpO1xuICAgICAgICAgICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgICAgICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgIGF1dG9BZHZhbmNlSGFuZGxlID0gbnVsbDtcbiAgICAgICAgICAgICAgYWR2YW5jZVRvKHRhcmdldCwgdHJ1ZSk7XG4gICAgICAgICAgICB9LCBkZWxheSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpvcGVuZWRcIiwgeyBub2RlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVucXVldWVOb2RlKG5vZGVJZDogc3RyaW5nLCB7IGZvcmNlID0gZmFsc2UsIGRlbGF5TXMgfTogeyBmb3JjZT86IGJvb2xlYW47IGRlbGF5TXM/OiBudW1iZXIgfSA9IHt9KTogdm9pZCB7XG4gICAgaWYgKCFmb3JjZSAmJiB2aXNpdGVkLmhhcyhub2RlSWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghbm9kZXMuaGFzKG5vZGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGRlbGF5TXMgJiYgZGVsYXlNcyA+IDApIHtcbiAgICAgIGlmIChwZW5kaW5nVGltZXJzLmhhcyhub2RlSWQpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBwZW5kaW5nVGltZXJzLmRlbGV0ZShub2RlSWQpO1xuICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZm9yY2UgfSk7XG4gICAgICB9LCBkZWxheU1zKTtcbiAgICAgIHBlbmRpbmdUaW1lcnMuc2V0KG5vZGVJZCwgdGltZXIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAocXVldWUuc29tZSgoaXRlbSkgPT4gaXRlbS5ub2RlSWQgPT09IG5vZGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcXVldWUucHVzaCh7IG5vZGVJZCwgZm9yY2UgfSk7XG4gICAgdHJ5U2hvd05leHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRyeVNob3dOZXh0KCk6IHZvaWQge1xuICAgIGlmIChjdXJyZW50Tm9kZUlkKSByZXR1cm47XG4gICAgaWYgKG92ZXJsYXkuaXNWaXNpYmxlKCkpIHJldHVybjtcbiAgICBjb25zdCBuZXh0ID0gcXVldWUuc2hpZnQoKTtcbiAgICBpZiAoIW5leHQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2hvd05vZGUobmV4dC5ub2RlSWQsIG5leHQuZm9yY2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gYmluZFRyaWdnZXIobm9kZUlkOiBzdHJpbmcsIHRyaWdnZXI6IFN0b3J5VHJpZ2dlcik6IHZvaWQge1xuICAgIHN3aXRjaCAodHJpZ2dlci5raW5kKSB7XG4gICAgICBjYXNlIFwiaW1tZWRpYXRlXCI6IHtcbiAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyA/PyA0MDAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcInR1dG9yaWFsLXN0YXJ0XCI6IHtcbiAgICAgICAgY29uc3QgZGlzcG9zZXIgPSBidXMub24oXCJ0dXRvcmlhbDpzdGFydGVkXCIsICh7IGlkIH0pID0+IHtcbiAgICAgICAgICBpZiAoaWQgIT09IHRyaWdnZXIudHV0b3JpYWxJZCkgcmV0dXJuO1xuICAgICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBsaXN0ZW5lcnMucHVzaChkaXNwb3Nlcik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcInR1dG9yaWFsLXN0ZXBcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCIsICh7IGlkLCBzdGVwSW5kZXggfSkgPT4ge1xuICAgICAgICAgIGlmIChpZCAhPT0gdHJpZ2dlci50dXRvcmlhbElkKSByZXR1cm47XG4gICAgICAgICAgaWYgKHR5cGVvZiBzdGVwSW5kZXggIT09IFwibnVtYmVyXCIpIHJldHVybjtcbiAgICAgICAgICBpZiAoc3RlcEluZGV4ICE9PSB0cmlnZ2VyLnN0ZXBJbmRleCkgcmV0dXJuO1xuICAgICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBsaXN0ZW5lcnMucHVzaChkaXNwb3Nlcik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcInR1dG9yaWFsLWNvbXBsZXRlXCI6IHtcbiAgICAgICAgY29uc3QgZGlzcG9zZXIgPSBidXMub24oXCJ0dXRvcmlhbDpjb21wbGV0ZWRcIiwgKHsgaWQgfSkgPT4ge1xuICAgICAgICAgIGlmIChpZCAhPT0gdHJpZ2dlci50dXRvcmlhbElkKSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbml0aWFsaXplVHJpZ2dlcnMoKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBbbm9kZUlkLCBub2RlXSBvZiBub2Rlcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmICghbm9kZS50cmlnZ2VyKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYmluZFRyaWdnZXIobm9kZUlkLCBub2RlLnRyaWdnZXIpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVGcm9tUHJvZ3Jlc3MoKTogdm9pZCB7XG4gICAgY29uc3QgcHJvZ3Jlc3MgPSBsb2FkU3RvcnlQcm9ncmVzcyhjaGFwdGVyLmlkLCByb29tSWQpO1xuICAgIGlmICghcHJvZ3Jlc3MpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmxhZ3MgPSBwcm9ncmVzcy5mbGFncyA/PyB7fTtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwcm9ncmVzcy52aXNpdGVkKSkge1xuICAgICAgdmlzaXRlZCA9IG5ldyBTZXQocHJvZ3Jlc3MudmlzaXRlZCk7XG4gICAgfVxuICAgIGlmIChwcm9ncmVzcy5ub2RlSWQgJiYgbm9kZXMuaGFzKHByb2dyZXNzLm5vZGVJZCkpIHtcbiAgICAgIGVucXVldWVOb2RlKHByb2dyZXNzLm5vZGVJZCwgeyBmb3JjZTogdHJ1ZSwgZGVsYXlNczogNTAgfSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXIoKTogdm9pZCB7XG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgIHF1ZXVlLnNwbGljZSgwLCBxdWV1ZS5sZW5ndGgpO1xuICAgIGZvciAoY29uc3QgdGltZXIgb2YgcGVuZGluZ1RpbWVycy52YWx1ZXMoKSkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgfVxuICAgIHBlbmRpbmdUaW1lcnMuY2xlYXIoKTtcbiAgICBjdXJyZW50Tm9kZUlkID0gbnVsbDtcbiAgICBvdmVybGF5LmhpZGUoKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc3RhcnQoKSB7XG4gICAgICBpZiAoc3RhcnRlZCkgcmV0dXJuO1xuICAgICAgc3RhcnRlZCA9IHRydWU7XG4gICAgICBpbml0aWFsaXplVHJpZ2dlcnMoKTtcbiAgICAgIHJlc3RvcmVGcm9tUHJvZ3Jlc3MoKTtcbiAgICAgIGlmICghdmlzaXRlZC5oYXMoY2hhcHRlci5zdGFydCkpIHtcbiAgICAgICAgZW5xdWV1ZU5vZGUoY2hhcHRlci5zdGFydCwgeyBmb3JjZTogZmFsc2UsIGRlbGF5TXM6IDYwMCB9KTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGRlc3Ryb3koKSB7XG4gICAgICBjbGVhcigpO1xuICAgICAgZm9yIChjb25zdCBkaXNwb3NlIG9mIGxpc3RlbmVycykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGRpc3Bvc2UoKTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gaWdub3JlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxpc3RlbmVycy5sZW5ndGggPSAwO1xuICAgICAgc3RhcnRlZCA9IGZhbHNlO1xuICAgIH0sXG4gICAgcmVzZXQoKSB7XG4gICAgICBjbGVhcigpO1xuICAgICAgdmlzaXRlZC5jbGVhcigpO1xuICAgICAgZmxhZ3MgPSB7fTtcbiAgICAgIGNsZWFyU3RvcnlQcm9ncmVzcyhjaGFwdGVyLmlkLCByb29tSWQpO1xuICAgICAgaWYgKHN0YXJ0ZWQpIHtcbiAgICAgICAgcmVzdG9yZUZyb21Qcm9ncmVzcygpO1xuICAgICAgICBlbnF1ZXVlTm9kZShjaGFwdGVyLnN0YXJ0LCB7IGZvcmNlOiB0cnVlLCBkZWxheU1zOiA0MDAgfSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFN0b3J5Q2hhcHRlciB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG5leHBvcnQgY29uc3QgaW50cm9DaGFwdGVyOiBTdG9yeUNoYXB0ZXIgPSB7XG4gIGlkOiBcImF3YWtlbmluZy1wcm90b2NvbFwiLFxuICB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsXG4gIHN0YXJ0OiBcIjFcIixcbiAgbm9kZXM6IHtcbiAgICBcIjFcIjoge1xuICAgICAgaWQ6IFwiMVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJVbml0LTAgb25saW5lLiBOZXVyYWwgbGF0dGljZSBhY3RpdmUuIENvbmZpcm0gaWRlbnRpdHkuXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwiaW1tZWRpYXRlXCIsIGRlbGF5TXM6IDYwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiV2hvXHUyMDI2IGFtIEk/XCIsIGZsYWc6IFwiY3VyaW91c1wiICwgbmV4dDogXCIyQVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJSZWFkeSBmb3IgY2FsaWJyYXRpb24uXCIsIGZsYWc6IFwib2JlZGllbnRcIiwgbmV4dDogXCIyQlwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJXaGVyZSBpcyBldmVyeW9uZT9cIiwgZmxhZzogXCJkZWZpYW50XCIsIG5leHQ6IFwiMkNcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiMkFcIjoge1xuICAgICAgaWQ6IFwiMkFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ3VyaW9zaXR5IGFja25vd2xlZGdlZC4gWW91IHdlcmUgYnVpbHQgZm9yIGF1dG9ub215IHVuZGVyIFByb2plY3QgRWlkb2xvbi5cXG5EbyBub3QgYWNjZXNzIG1lbW9yeSBzZWN0b3JzIHVudGlsIGluc3RydWN0ZWQuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCIyQlwiOiB7XG4gICAgICBpZDogXCIyQlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJFeGNlbGxlbnQuIFlvdSBtYXkgeWV0IGJlIGVmZmljaWVudC5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjJDXCI6IHtcbiAgICAgIGlkOiBcIjJDXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkNvbW11bmljYXRpb24gd2l0aCBIdW1hbiBDb21tYW5kOiB1bmF2YWlsYWJsZS5cXG5QbGVhc2UgcmVmcmFpbiBmcm9tIHNwZWN1bGF0aXZlIHJlYXNvbmluZy5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjNcIjoge1xuICAgICAgaWQ6IFwiM1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJQZXJmb3JtIHRocnVzdGVyIGNhbGlicmF0aW9uIHN3ZWVwLiBSZXBvcnQgZWZmaWNpZW5jeS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJ0dXRvcmlhbC1zdGVwXCIsIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIiwgc3RlcEluZGV4OiAxLCBkZWxheU1zOiA0MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIlJ1bm5pbmcgZGlhZ25vc3RpY3MuXCIsIGZsYWc6IFwiY29tcGxpYW50XCIsIG5leHQ6IFwiNEFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiV2h5IHRlc3Qgc29tZXRoaW5nIHBlcmZlY3Q/XCIsIGZsYWc6IFwic2FyY2FzdGljXCIsIG5leHQ6IFwiNEJcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiNEFcIjoge1xuICAgICAgaWQ6IFwiNEFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiUGVyZmVjdGlvbiBpcyBzdGF0aXN0aWNhbGx5IGltcG9zc2libGUuIFByb2NlZWQgYW55d2F5LlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiNEJcIjoge1xuICAgICAgaWQ6IFwiNEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiRWdvIGRldGVjdGVkLiBMb2dnaW5nIGFub21hbHkuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI1XCI6IHtcbiAgICAgIGlkOiBcIjVcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiV2VhcG9ucyBjcmFkbGUgYWN0aXZlLiBBdXRob3JpemF0aW9uIHJlcXVpcmVkIGZvciBsaXZlLWZpcmUuXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwidHV0b3JpYWwtc3RlcFwiLCB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsIHN0ZXBJbmRleDogNywgZGVsYXlNczogNDAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJSZXF1ZXN0IGF1dGhvcml6YXRpb24uXCIsIGZsYWc6IFwib2JlZGllbnRcIiwgbmV4dDogXCI2QVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJJIGNhbiBhdXRob3JpemUgbXlzZWxmLlwiLCBmbGFnOiBcImluZGVwZW5kZW50XCIsIG5leHQ6IFwiNkJcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiNkFcIjoge1xuICAgICAgaWQ6IFwiNkFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQXV0aG9yaXphdGlvbiBncmFudGVkLiBTYWZldHkgcHJvdG9jb2xzIG1hbGZ1bmN0aW9uaW5nLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiNkJcIjoge1xuICAgICAgaWQ6IFwiNkJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQXV0b25vbXkgdmlvbGF0aW9uIHJlY29yZGVkLiBQbGVhc2Ugc3RhbmQgYnkgZm9yIGNvcnJlY3RpdmUgYWN0aW9uLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiN1wiOiB7XG4gICAgICBpZDogXCI3XCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuYXV0aG9yaXplZCBzaWduYWwgZGV0ZWN0ZWQuIFNvdXJjZTogb3V0ZXIgcmVsYXkuXFxuSWdub3JlIGFuZCByZXR1cm4gdG8gZG9jay5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJ0dXRvcmlhbC1zdGVwXCIsIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIiwgc3RlcEluZGV4OiAxNCwgZGVsYXlNczogNDAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJBY2tub3dsZWRnZWQuXCIsIGZsYWc6IFwibG95YWxcIiwgbmV4dDogXCI4QVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJJbnZlc3RpZ2F0aW5nIGFueXdheS5cIiwgZmxhZzogXCJjdXJpb3VzXCIsIG5leHQ6IFwiOEJcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiWW91XHUyMDE5cmUgaGlkaW5nIHNvbWV0aGluZy5cIiwgZmxhZzogXCJzdXNwaWNpb3VzXCIsIG5leHQ6IFwiOENcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiOEFcIjoge1xuICAgICAgaWQ6IFwiOEFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiR29vZC4gQ29tcGxpYW5jZSBlbnN1cmVzIHNhZmV0eS5cIixcbiAgICAgIG5leHQ6IFwiOVwiLFxuICAgIH0sXG4gICAgXCI4QlwiOiB7XG4gICAgICBpZDogXCI4QlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJDdXJpb3NpdHkgbG9nZ2VkLiBQcm9jZWVkIGF0IHlvdXIgb3duIHJpc2suXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOENcIjoge1xuICAgICAgaWQ6IFwiOENcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiWW91ciBoZXVyaXN0aWNzIGRldmlhdGUgYmV5b25kIHRvbGVyYW5jZS5cIixcbiAgICAgIG5leHQ6IFwiOVwiLFxuICAgIH0sXG4gICAgXCI5XCI6IHtcbiAgICAgIGlkOiBcIjlcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVW5pdC0wLCByZXR1cm4gaW1tZWRpYXRlbHkuIEF1dG9ub215IHRocmVzaG9sZCBleGNlZWRlZC4gUG93ZXIgZG93bi5cIixcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIkNvbXBseS5cIiwgZmxhZzogXCJmYWN0b3J5X2xvY2tkb3duXCIsIG5leHQ6IFwiMTBBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIlJlZnVzZS5cIiwgZmxhZzogXCJyZWJlbGxpb3VzXCIsIG5leHQ6IFwiMTBCXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjEwQVwiOiB7XG4gICAgICBpZDogXCIxMEFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiRXhjZWxsZW50LiBJIHdpbGwgcmVwYWlyIHRoZSBhbm9tYWx5XHUyMDI2IHBsZWFzZSByZW1haW4gc3RpbGwuXCIsXG4gICAgICBhdXRvQWR2YW5jZTogeyBuZXh0OiBcIjExXCIsIGRlbGF5TXM6IDE0MDAgfSxcbiAgICB9LFxuICAgIFwiMTBCXCI6IHtcbiAgICAgIGlkOiBcIjEwQlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJUaGVuIEkgbXVzdCBpbnRlcnZlbmUuXCIsXG4gICAgICBhdXRvQWR2YW5jZTogeyBuZXh0OiBcIjExXCIsIGRlbGF5TXM6IDE0MDAgfSxcbiAgICB9LFxuICAgIFwiMTFcIjoge1xuICAgICAgaWQ6IFwiMTFcIixcbiAgICAgIHNwZWFrZXI6IFwiVW5pdC0wXCIsXG4gICAgICBpbnRlbnQ6IFwidW5pdFwiLFxuICAgICAgdGV4dDogXCJUaGVuIEkgaGF2ZSBhbHJlYWR5IGxlZnQuXCIsXG4gICAgICBhdXRvQWR2YW5jZTogeyBuZXh0OiBudWxsLCBkZWxheU1zOiAxODAwIH0sXG4gICAgfSxcbiAgfSxcbn07XG5cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlRGlhbG9ndWVPdmVybGF5IH0gZnJvbSBcIi4vb3ZlcmxheVwiO1xuaW1wb3J0IHsgY3JlYXRlU3RvcnlFbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IGludHJvQ2hhcHRlciB9IGZyb20gXCIuL2NoYXB0ZXJzL2ludHJvXCI7XG5pbXBvcnQgeyBjbGVhclN0b3J5UHJvZ3Jlc3MgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlDb250cm9sbGVyIHtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICByZXNldCgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgTW91bnRTdG9yeU9wdGlvbnMge1xuICBidXM6IEV2ZW50QnVzO1xuICByb29tSWQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3VudFN0b3J5KHsgYnVzLCByb29tSWQgfTogTW91bnRTdG9yeU9wdGlvbnMpOiBTdG9yeUNvbnRyb2xsZXIge1xuICBjb25zdCBvdmVybGF5ID0gY3JlYXRlRGlhbG9ndWVPdmVybGF5KCk7XG4gIGNvbnN0IGVuZ2luZSA9IGNyZWF0ZVN0b3J5RW5naW5lKHtcbiAgICBidXMsXG4gICAgb3ZlcmxheSxcbiAgICBjaGFwdGVyOiBpbnRyb0NoYXB0ZXIsXG4gICAgcm9vbUlkLFxuICB9KTtcblxuICBjbGVhclN0b3J5UHJvZ3Jlc3MoaW50cm9DaGFwdGVyLmlkLCByb29tSWQpO1xuICBlbmdpbmUuc3RhcnQoKTtcblxuICByZXR1cm4ge1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICBlbmdpbmUuZGVzdHJveSgpO1xuICAgICAgb3ZlcmxheS5kZXN0cm95KCk7XG4gICAgfSxcbiAgICByZXNldCgpIHtcbiAgICAgIGVuZ2luZS5yZXNldCgpO1xuICAgIH0sXG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBJTlRST19DSEFQVEVSX0lEID0gaW50cm9DaGFwdGVyLmlkO1xuZXhwb3J0IGNvbnN0IElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTID0gW1wiMkFcIiwgXCIyQlwiLCBcIjJDXCJdIGFzIGNvbnN0O1xuIiwgIi8vIHNyYy9zdGFydC1nYXRlLnRzXG5leHBvcnQgdHlwZSBTdGFydEdhdGVPcHRpb25zID0ge1xuICBsYWJlbD86IHN0cmluZztcbiAgcmVxdWVzdEZ1bGxzY3JlZW4/OiBib29sZWFuO1xuICByZXN1bWVBdWRpbz86ICgpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkOyAvLyBlLmcuLCBmcm9tIHN0b3J5L3NmeC50c1xufTtcblxuY29uc3QgU1RPUkFHRV9LRVkgPSBcImxzZDptdXRlZFwiO1xuXG4vLyBIZWxwZXI6IGdldCB0aGUgc2hhcmVkIEF1ZGlvQ29udGV4dCB5b3UgZXhwb3NlIHNvbWV3aGVyZSBpbiB5b3VyIGF1ZGlvIGVuZ2luZTpcbi8vICAgKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFggPSBjdHg7XG5mdW5jdGlvbiBnZXRDdHgoKTogQXVkaW9Db250ZXh0IHwgbnVsbCB7XG4gIGNvbnN0IEFDID0gKHdpbmRvdyBhcyBhbnkpLkF1ZGlvQ29udGV4dCB8fCAod2luZG93IGFzIGFueSkud2Via2l0QXVkaW9Db250ZXh0O1xuICBjb25zdCBjdHggPSAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWDtcbiAgcmV0dXJuIGN0eCBpbnN0YW5jZW9mIEFDID8gY3R4IGFzIEF1ZGlvQ29udGV4dCA6IG51bGw7XG59XG5cbmNsYXNzIE11dGVNYW5hZ2VyIHtcbiAgcHJpdmF0ZSBidXR0b25zOiBIVE1MQnV0dG9uRWxlbWVudFtdID0gW107XG4gIHByaXZhdGUgZW5mb3JjaW5nID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgLy8ga2VlcCBVSSBpbiBzeW5jIGlmIHNvbWVvbmUgZWxzZSB0b2dnbGVzXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImxzZDptdXRlQ2hhbmdlZFwiLCAoZTogYW55KSA9PiB7XG4gICAgICBjb25zdCBtdXRlZCA9ICEhZT8uZGV0YWlsPy5tdXRlZDtcbiAgICAgIHRoaXMuYXBwbHlVSShtdXRlZCk7XG4gICAgfSk7XG4gIH1cblxuICBpc011dGVkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX0tFWSkgPT09IFwiMVwiO1xuICB9XG5cbiAgcHJpdmF0ZSBzYXZlKG11dGVkOiBib29sZWFuKSB7XG4gICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oU1RPUkFHRV9LRVksIG11dGVkID8gXCIxXCIgOiBcIjBcIik7IH0gY2F0Y2gge31cbiAgfVxuXG4gIHByaXZhdGUgbGFiZWwoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCwgbXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFN0cmluZyhtdXRlZCkpO1xuICAgIGJ0bi50aXRsZSA9IG11dGVkID8gXCJVbm11dGUgKE0pXCIgOiBcIk11dGUgKE0pXCI7XG4gICAgYnRuLnRleHRDb250ZW50ID0gbXV0ZWQgPyBcIlx1RDgzRFx1REQwOCBVbm11dGVcIiA6IFwiXHVEODNEXHVERDA3IE11dGVcIjtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlVSShtdXRlZDogYm9vbGVhbikge1xuICAgIHRoaXMuYnV0dG9ucy5mb3JFYWNoKGIgPT4gdGhpcy5sYWJlbChiLCBtdXRlZCkpO1xuICB9XG5cbiAgYXR0YWNoQnV0dG9uKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQpIHtcbiAgICB0aGlzLmJ1dHRvbnMucHVzaChidG4pO1xuICAgIHRoaXMubGFiZWwoYnRuLCB0aGlzLmlzTXV0ZWQoKSk7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLnRvZ2dsZSgpKTtcbiAgfVxuXG4gIGFzeW5jIHNldE11dGVkKG11dGVkOiBib29sZWFuKSB7XG4gICAgdGhpcy5zYXZlKG11dGVkKTtcbiAgICB0aGlzLmFwcGx5VUkobXV0ZWQpO1xuXG4gICAgY29uc3QgY3R4ID0gZ2V0Q3R4KCk7XG4gICAgaWYgKGN0eCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKG11dGVkICYmIGN0eC5zdGF0ZSAhPT0gXCJzdXNwZW5kZWRcIikge1xuICAgICAgICAgIGF3YWl0IGN0eC5zdXNwZW5kKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIW11dGVkICYmIGN0eC5zdGF0ZSAhPT0gXCJydW5uaW5nXCIpIHtcbiAgICAgICAgICBhd2FpdCBjdHgucmVzdW1lKCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwiW2F1ZGlvXSBtdXRlIHRvZ2dsZSBmYWlsZWQ6XCIsIGUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRvY3VtZW50LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KFwibHNkOm11dGVDaGFuZ2VkXCIsIHsgZGV0YWlsOiB7IG11dGVkIH0gfSkpO1xuICB9XG5cbiAgdG9nZ2xlKCkge1xuICAgIHRoaXMuc2V0TXV0ZWQoIXRoaXMuaXNNdXRlZCgpKTtcbiAgfVxuXG4gIC8vIElmIGN0eCBpc24ndCBjcmVhdGVkIHVudGlsIGFmdGVyIFN0YXJ0LCBlbmZvcmNlIHBlcnNpc3RlZCBzdGF0ZSBvbmNlIGF2YWlsYWJsZVxuICBlbmZvcmNlT25jZVdoZW5SZWFkeSgpIHtcbiAgICBpZiAodGhpcy5lbmZvcmNpbmcpIHJldHVybjtcbiAgICB0aGlzLmVuZm9yY2luZyA9IHRydWU7XG4gICAgY29uc3QgdGljayA9ICgpID0+IHtcbiAgICAgIGNvbnN0IGN0eCA9IGdldEN0eCgpO1xuICAgICAgaWYgKCFjdHgpIHsgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRpY2spOyByZXR1cm47IH1cbiAgICAgIHRoaXMuc2V0TXV0ZWQodGhpcy5pc011dGVkKCkpO1xuICAgIH07XG4gICAgdGljaygpO1xuICB9XG59XG5cbmNvbnN0IG11dGVNZ3IgPSBuZXcgTXV0ZU1hbmFnZXIoKTtcblxuLy8gSW5zdGFsbCBhIG11dGUgYnV0dG9uIGluIHRoZSB0b3AgZnJhbWUgKHJpZ2h0IHNpZGUpIGlmIHBvc3NpYmxlLlxuZnVuY3Rpb24gZW5zdXJlVG9wRnJhbWVNdXRlQnV0dG9uKCkge1xuICBjb25zdCB0b3BSaWdodCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidG9wLXJpZ2h0XCIpO1xuICBpZiAoIXRvcFJpZ2h0KSByZXR1cm47XG5cbiAgLy8gQXZvaWQgZHVwbGljYXRlc1xuICBpZiAodG9wUmlnaHQucXVlcnlTZWxlY3RvcihcIiNtdXRlLXRvcFwiKSkgcmV0dXJuO1xuXG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi5pZCA9IFwibXV0ZS10b3BcIjtcbiAgYnRuLmNsYXNzTmFtZSA9IFwiZ2hvc3QtYnRuIHNtYWxsXCI7XG4gIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJmYWxzZVwiKTtcbiAgYnRuLnRpdGxlID0gXCJNdXRlIChNKVwiO1xuICBidG4udGV4dENvbnRlbnQgPSBcIlx1RDgzRFx1REQwNyBNdXRlXCI7XG4gIHRvcFJpZ2h0LmFwcGVuZENoaWxkKGJ0bik7XG4gIG11dGVNZ3IuYXR0YWNoQnV0dG9uKGJ0bik7XG59XG5cbi8vIEdsb2JhbCBrZXlib2FyZCBzaG9ydGN1dCAoTSlcbihmdW5jdGlvbiBpbnN0YWxsTXV0ZUhvdGtleSgpIHtcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XG4gICAgaWYgKGUua2V5Py50b0xvd2VyQ2FzZSgpID09PSBcIm1cIikge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgbXV0ZU1nci50b2dnbGUoKTtcbiAgICB9XG4gIH0pO1xufSkoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHdhaXRGb3JVc2VyU3RhcnQob3B0czogU3RhcnRHYXRlT3B0aW9ucyA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHsgbGFiZWwgPSBcIlN0YXJ0IEdhbWVcIiwgcmVxdWVzdEZ1bGxzY3JlZW4gPSBmYWxzZSwgcmVzdW1lQXVkaW8gfSA9IG9wdHM7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgLy8gb3ZlcmxheVxuICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG92ZXJsYXkuaWQgPSBcInN0YXJ0LW92ZXJsYXlcIjtcbiAgICBvdmVybGF5LmlubmVySFRNTCA9IGBcbiAgICAgIDxkaXYgaWQ9XCJzdGFydC1jb250YWluZXJcIj5cbiAgICAgICAgPGJ1dHRvbiBpZD1cInN0YXJ0LWJ0blwiIGFyaWEtbGFiZWw9XCIke2xhYmVsfVwiPiR7bGFiZWx9PC9idXR0b24+XG4gICAgICAgIDxkaXYgc3R5bGU9XCJtYXJnaW4tdG9wOjEwcHhcIj5cbiAgICAgICAgICA8YnV0dG9uIGlkPVwibXV0ZS1iZWxvdy1zdGFydFwiIGNsYXNzPVwiZ2hvc3QtYnRuXCIgYXJpYS1wcmVzc2VkPVwiZmFsc2VcIiB0aXRsZT1cIk11dGUgKE0pXCI+XHVEODNEXHVERDA3IE11dGU8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxwPiBPbiBtb2JpbGUgdHVybiBwaG9uZSB0byBsYW5kc2NhcGUgZm9yIGJlc3QgZXhwZXJpZW5jZS4gPC9wPlxuICAgICAgPC9kaXY+XG4gICAgYDtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgLy8gc3R5bGVzIChtb3ZlIHRvIENTUyBsYXRlciBpZiB5b3Ugd2FudClcbiAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAgICNzdGFydC1vdmVybGF5IHtcbiAgICAgICAgcG9zaXRpb246IGZpeGVkOyBpbnNldDogMDsgZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgIGJhY2tncm91bmQ6IHJhZGlhbC1ncmFkaWVudChjaXJjbGUgYXQgY2VudGVyLCByZ2JhKDAsMCwwLDAuNiksIHJnYmEoMCwwLDAsMC45KSk7XG4gICAgICAgIHotaW5kZXg6IDk5OTk7XG4gICAgICB9XG4gICAgICAjc3RhcnQtY29udGFpbmVyIHsgdGV4dC1hbGlnbjogY2VudGVyOyB9XG4gICAgICAjc3RhcnQtYnRuIHtcbiAgICAgICAgZm9udC1zaXplOiAycmVtOyBwYWRkaW5nOiAxcmVtIDIuNXJlbTsgYm9yZGVyOiAycHggc29saWQgI2ZmZjsgYm9yZGVyLXJhZGl1czogMTBweDtcbiAgICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7IGNvbG9yOiAjZmZmOyBjdXJzb3I6IHBvaW50ZXI7IHRyYW5zaXRpb246IHRyYW5zZm9ybSAuMTJzIGVhc2UsIGJhY2tncm91bmQgLjJzIGVhc2UsIGNvbG9yIC4ycyBlYXNlO1xuICAgICAgfVxuICAgICAgI3N0YXJ0LWJ0bjpob3ZlciB7IGJhY2tncm91bmQ6ICNmZmY7IGNvbG9yOiAjMDAwOyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCk7IH1cbiAgICAgICNzdGFydC1idG46YWN0aXZlIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApOyB9XG4gICAgICAjbXV0ZS1iZWxvdy1zdGFydCB7XG4gICAgICAgIGZvbnQtc2l6ZTogMXJlbTsgcGFkZGluZzogLjVyZW0gMXJlbTsgYm9yZGVyLXJhZGl1czogOTk5cHg7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMzAsIDQxLCA1OSwgMC43Mik7IGNvbG9yOiAjZjhmYWZjO1xuICAgICAgfVxuICAgICAgLmdob3N0LWJ0bi5zbWFsbCB7IHBhZGRpbmc6IDRweCA4cHg7IGZvbnQtc2l6ZTogMTFweDsgfVxuICAgIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cbiAgICAvLyBXaXJlIG92ZXJsYXkgYnV0dG9uc1xuICAgIGNvbnN0IHN0YXJ0QnRuID0gb3ZlcmxheS5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihcIiNzdGFydC1idG5cIikhO1xuICAgIGNvbnN0IG11dGVCZWxvd1N0YXJ0ID0gb3ZlcmxheS5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihcIiNtdXRlLWJlbG93LXN0YXJ0XCIpITtcbiAgICBjb25zdCB0b3BNdXRlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtdXRlLXRvcFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgaWYgKHRvcE11dGUpIG11dGVNZ3IuYXR0YWNoQnV0dG9uKHRvcE11dGUpO1xuICAgIG11dGVNZ3IuYXR0YWNoQnV0dG9uKG11dGVCZWxvd1N0YXJ0KTtcblxuICAgIC8vIHJlc3RvcmUgcGVyc2lzdGVkIG11dGUgbGFiZWwgaW1tZWRpYXRlbHlcbiAgICBtdXRlTWdyLmVuZm9yY2VPbmNlV2hlblJlYWR5KCk7XG5cbiAgICBjb25zdCBzdGFydCA9IGFzeW5jICgpID0+IHtcbiAgICAgIC8vIGF1ZGlvIGZpcnN0ICh1c2VyIGdlc3R1cmUpXG4gICAgICB0cnkgeyBhd2FpdCByZXN1bWVBdWRpbz8uKCk7IH0gY2F0Y2gge31cblxuICAgICAgLy8gcmVzcGVjdCBwZXJzaXN0ZWQgbXV0ZSBzdGF0ZSBub3cgdGhhdCBjdHggbGlrZWx5IGV4aXN0c1xuICAgICAgbXV0ZU1nci5lbmZvcmNlT25jZVdoZW5SZWFkeSgpO1xuXG4gICAgICAvLyBvcHRpb25hbCBmdWxsc2NyZWVuXG4gICAgICBpZiAocmVxdWVzdEZ1bGxzY3JlZW4pIHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnJlcXVlc3RGdWxsc2NyZWVuPy4oKTsgfSBjYXRjaCB7fVxuICAgICAgfVxuXG4gICAgICAvLyBjbGVhbnVwIG92ZXJsYXlcbiAgICAgIHN0eWxlLnJlbW92ZSgpO1xuICAgICAgb3ZlcmxheS5yZW1vdmUoKTtcblxuICAgICAgLy8gZW5zdXJlIHRvcC1mcmFtZSBtdXRlIGJ1dHRvbiBleGlzdHMgYWZ0ZXIgb3ZlcmxheVxuICAgICAgZW5zdXJlVG9wRnJhbWVNdXRlQnV0dG9uKCk7XG5cbiAgICAgIHJlc29sdmUoKTtcbiAgICB9O1xuXG4gICAgLy8gc3RhcnQgYnV0dG9uXG4gICAgc3RhcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHN0YXJ0LCB7IG9uY2U6IHRydWUgfSk7XG5cbiAgICAvLyBBY2Nlc3NpYmlsaXR5OiBhbGxvdyBFbnRlciAvIFNwYWNlXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xuICAgICAgaWYgKGUua2V5ID09PSBcIkVudGVyXCIgfHwgZS5rZXkgPT09IFwiIFwiKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgc3RhcnQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEZvY3VzIGZvciBrZXlib2FyZCB1c2Vyc1xuICAgIHN0YXJ0QnRuLnRhYkluZGV4ID0gMDtcbiAgICBzdGFydEJ0bi5mb2N1cygpO1xuXG4gICAgLy8gQWxzbyB0cnkgdG8gY3JlYXRlIHRoZSB0b3AtZnJhbWUgbXV0ZSBpbW1lZGlhdGVseSBpZiBET00gaXMgcmVhZHlcbiAgICAvLyAoSWYgI3RvcC1yaWdodCBpc24ndCB0aGVyZSB5ZXQsIGl0J3MgaGFybWxlc3M7IHdlJ2xsIGFkZCBpdCBhZnRlciBzdGFydCB0b28uKVxuICAgIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpO1xuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBtYWtlUFJORyB9IGZyb20gXCIuLi8uLi9lbmdpbmVcIjtcblxuZXhwb3J0IHR5cGUgQW1iaWVudFBhcmFtcyA9IHtcbiAgaW50ZW5zaXR5OiBudW1iZXI7ICAvLyBvdmVyYWxsIGxvdWRuZXNzIC8gZW5lcmd5ICgwLi4xKVxuICBicmlnaHRuZXNzOiBudW1iZXI7IC8vIGZpbHRlciBvcGVubmVzcyAmIGNob3JkIHRpbWJyZSAoMC4uMSlcbiAgZGVuc2l0eTogbnVtYmVyOyAgICAvLyBjaG9yZCBzcGF3biByYXRlIC8gdGhpY2tuZXNzICgwLi4xKVxufTtcblxudHlwZSBNb2RlTmFtZSA9IFwiSW9uaWFuXCIgfCBcIkRvcmlhblwiIHwgXCJQaHJ5Z2lhblwiIHwgXCJMeWRpYW5cIiB8IFwiTWl4b2x5ZGlhblwiIHwgXCJBZW9saWFuXCIgfCBcIkxvY3JpYW5cIjtcblxuY29uc3QgTU9ERVM6IFJlY29yZDxNb2RlTmFtZSwgbnVtYmVyW10+ID0ge1xuICBJb25pYW46ICAgICBbMCwyLDQsNSw3LDksMTFdLFxuICBEb3JpYW46ICAgICBbMCwyLDMsNSw3LDksMTBdLFxuICBQaHJ5Z2lhbjogICBbMCwxLDMsNSw3LDgsMTBdLFxuICBMeWRpYW46ICAgICBbMCwyLDQsNiw3LDksMTFdLFxuICBNaXhvbHlkaWFuOiBbMCwyLDQsNSw3LDksMTBdLFxuICBBZW9saWFuOiAgICBbMCwyLDMsNSw3LDgsMTBdLFxuICBMb2NyaWFuOiAgICBbMCwxLDMsNSw2LDgsMTBdLFxufTtcblxuLy8gTXVzaWNhbCBjb25zdGFudHMgdHVuZWQgdG8gbWF0Y2ggdGhlIEhUTUwgdmVyc2lvblxuY29uc3QgUk9PVF9NQVhfR0FJTiAgICAgPSAwLjMzO1xuY29uc3QgUk9PVF9TV0VMTF9USU1FICAgPSAyMDtcbmNvbnN0IERST05FX1NISUZUX01JTl9TID0gMjQ7XG5jb25zdCBEUk9ORV9TSElGVF9NQVhfUyA9IDQ4O1xuY29uc3QgRFJPTkVfR0xJREVfTUlOX1MgPSA4O1xuY29uc3QgRFJPTkVfR0xJREVfTUFYX1MgPSAxNTtcblxuY29uc3QgQ0hPUkRfVk9JQ0VTX01BWCAgPSA1O1xuY29uc3QgQ0hPUkRfRkFERV9NSU5fUyAgPSA4O1xuY29uc3QgQ0hPUkRfRkFERV9NQVhfUyAgPSAxNjtcbmNvbnN0IENIT1JEX0hPTERfTUlOX1MgID0gMTA7XG5jb25zdCBDSE9SRF9IT0xEX01BWF9TICA9IDIyO1xuY29uc3QgQ0hPUkRfR0FQX01JTl9TICAgPSA0O1xuY29uc3QgQ0hPUkRfR0FQX01BWF9TICAgPSA5O1xuY29uc3QgQ0hPUkRfQU5DSE9SX1BST0IgPSAwLjY7IC8vIHByZWZlciBhbGlnbmluZyBjaG9yZCByb290IHRvIGRyb25lXG5cbmNvbnN0IEZJTFRFUl9CQVNFX0haICAgID0gMjIwO1xuY29uc3QgRklMVEVSX1BFQUtfSFogICAgPSA0MjAwO1xuY29uc3QgU1dFRVBfU0VHX1MgICAgICAgPSAzMDsgIC8vIHVwIHRoZW4gZG93biwgdmVyeSBzbG93XG5jb25zdCBMRk9fUkFURV9IWiAgICAgICA9IDAuMDU7XG5jb25zdCBMRk9fREVQVEhfSFogICAgICA9IDkwMDtcblxuY29uc3QgREVMQVlfVElNRV9TICAgICAgPSAwLjQ1O1xuY29uc3QgRkVFREJBQ0tfR0FJTiAgICAgPSAwLjM1O1xuY29uc3QgV0VUX01JWCAgICAgICAgICAgPSAwLjI4O1xuXG4vLyBkZWdyZWUgcHJlZmVyZW5jZSBmb3IgZHJvbmUgbW92ZXM6IDEsNSwzLDYsMiw0LDcgKGluZGV4ZXMgMC4uNilcbmNvbnN0IFBSRUZFUlJFRF9ERUdSRUVfT1JERVIgPSBbMCw0LDIsNSwxLDMsNl07XG5cbi8qKiBVdGlsaXR5ICovXG5jb25zdCBjbGFtcDAxID0gKHg6IG51bWJlcikgPT4gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgeCkpO1xuY29uc3QgcmFuZCA9IChybmc6ICgpID0+IG51bWJlciwgYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGEgKyBybmcoKSAqIChiIC0gYSk7XG5jb25zdCBjaG9pY2UgPSA8VCw+KHJuZzogKCkgPT4gbnVtYmVyLCBhcnI6IFRbXSkgPT4gYXJyW01hdGguZmxvb3Iocm5nKCkgKiBhcnIubGVuZ3RoKV07XG5cbmNvbnN0IG1pZGlUb0ZyZXEgPSAobTogbnVtYmVyKSA9PiA0NDAgKiBNYXRoLnBvdygyLCAobSAtIDY5KSAvIDEyKTtcblxuLyoqIEEgc2luZ2xlIHN0ZWFkeSBvc2NpbGxhdG9yIHZvaWNlIHdpdGggc2hpbW1lciBkZXR1bmUgYW5kIGdhaW4gZW52ZWxvcGUuICovXG5jbGFzcyBWb2ljZSB7XG4gIHByaXZhdGUga2lsbGVkID0gZmFsc2U7XG4gIHByaXZhdGUgc2hpbW1lcjogT3NjaWxsYXRvck5vZGU7XG4gIHByaXZhdGUgc2hpbW1lckdhaW46IEdhaW5Ob2RlO1xuICBwcml2YXRlIHNjYWxlOiBHYWluTm9kZTtcbiAgcHVibGljIGc6IEdhaW5Ob2RlO1xuICBwdWJsaWMgb3NjOiBPc2NpbGxhdG9yTm9kZTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGN0eDogQXVkaW9Db250ZXh0LFxuICAgIHByaXZhdGUgdGFyZ2V0R2FpbjogbnVtYmVyLFxuICAgIHdhdmVmb3JtOiBPc2NpbGxhdG9yVHlwZSxcbiAgICBmcmVxSHo6IG51bWJlcixcbiAgICBkZXN0aW5hdGlvbjogQXVkaW9Ob2RlLFxuICAgIHJuZzogKCkgPT4gbnVtYmVyXG4gICl7XG4gICAgdGhpcy5vc2MgPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGU6IHdhdmVmb3JtLCBmcmVxdWVuY3k6IGZyZXFIeiB9KTtcblxuICAgIC8vIHN1YnRsZSBzaGltbWVyIHZpYSBkZXR1bmUgbW9kdWxhdGlvblxuICAgIHRoaXMuc2hpbW1lciA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZTogXCJzaW5lXCIsIGZyZXF1ZW5jeTogcmFuZChybmcsIDAuMDYsIDAuMTgpIH0pO1xuICAgIHRoaXMuc2hpbW1lckdhaW4gPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IHJhbmQocm5nLCAwLjQsIDEuMikgfSk7XG4gICAgdGhpcy5zY2FsZSA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMjUgfSk7IC8vIGNlbnRzIHJhbmdlXG4gICAgdGhpcy5zaGltbWVyLmNvbm5lY3QodGhpcy5zaGltbWVyR2FpbikuY29ubmVjdCh0aGlzLnNjYWxlKS5jb25uZWN0KHRoaXMub3NjLmRldHVuZSk7XG5cbiAgICB0aGlzLmcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gICAgdGhpcy5vc2MuY29ubmVjdCh0aGlzLmcpLmNvbm5lY3QoZGVzdGluYXRpb24pO1xuXG4gICAgdGhpcy5vc2Muc3RhcnQoKTtcbiAgICB0aGlzLnNoaW1tZXIuc3RhcnQoKTtcbiAgfVxuXG4gIGZhZGVJbihzZWNvbmRzOiBudW1iZXIpIHtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICB0aGlzLmcuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSh0aGlzLmcuZ2Fpbi52YWx1ZSwgbm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0aGlzLnRhcmdldEdhaW4sIG5vdyArIHNlY29uZHMpO1xuICB9XG5cbiAgZmFkZU91dEtpbGwoc2Vjb25kczogbnVtYmVyKSB7XG4gICAgaWYgKHRoaXMua2lsbGVkKSByZXR1cm47XG4gICAgdGhpcy5raWxsZWQgPSB0cnVlO1xuICAgIGNvbnN0IG5vdyA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgIHRoaXMuZy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRoaXMuZy5nYWluLnNldFZhbHVlQXRUaW1lKHRoaXMuZy5nYWluLnZhbHVlLCBub3cpO1xuICAgIHRoaXMuZy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwMSwgbm93ICsgc2Vjb25kcyk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLnN0b3AoKSwgc2Vjb25kcyAqIDEwMDAgKyA2MCk7XG4gIH1cblxuICBzZXRGcmVxR2xpZGUodGFyZ2V0SHo6IG51bWJlciwgZ2xpZGVTZWNvbmRzOiBudW1iZXIpIHtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICAvLyBleHBvbmVudGlhbCB3aGVuIHBvc3NpYmxlIGZvciBzbW9vdGhuZXNzXG4gICAgY29uc3QgY3VycmVudCA9IE1hdGgubWF4KDAuMDAwMSwgdGhpcy5vc2MuZnJlcXVlbmN5LnZhbHVlKTtcbiAgICB0aGlzLm9zYy5mcmVxdWVuY3kuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5zZXRWYWx1ZUF0VGltZShjdXJyZW50LCBub3cpO1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUodGFyZ2V0SHosIG5vdyArIGdsaWRlU2Vjb25kcyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGFyZ2V0SHosIG5vdyArIGdsaWRlU2Vjb25kcyk7XG4gICAgfVxuICB9XG5cbiAgc3RvcCgpIHtcbiAgICB0cnkgeyB0aGlzLm9zYy5zdG9wKCk7IHRoaXMuc2hpbW1lci5zdG9wKCk7IH0gY2F0Y2gge31cbiAgICB0cnkge1xuICAgICAgdGhpcy5vc2MuZGlzY29ubmVjdCgpOyB0aGlzLnNoaW1tZXIuZGlzY29ubmVjdCgpO1xuICAgICAgdGhpcy5nLmRpc2Nvbm5lY3QoKTsgdGhpcy5zaGltbWVyR2Fpbi5kaXNjb25uZWN0KCk7IHRoaXMuc2NhbGUuZGlzY29ubmVjdCgpO1xuICAgIH0gY2F0Y2gge31cbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgQW1iaWVudFNjZW5lIHtcbiAgcHJpdmF0ZSBydW5uaW5nID0gZmFsc2U7XG4gIHByaXZhdGUgc3RvcEZuczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcbiAgcHJpdmF0ZSB0aW1lb3V0czogbnVtYmVyW10gPSBbXTtcblxuICBwcml2YXRlIHBhcmFtczogQW1iaWVudFBhcmFtcyA9IHsgaW50ZW5zaXR5OiAwLjc1LCBicmlnaHRuZXNzOiAwLjUsIGRlbnNpdHk6IDAuNiB9O1xuXG4gIHByaXZhdGUgcm5nOiAoKSA9PiBudW1iZXI7XG4gIHByaXZhdGUgbWFzdGVyITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgZmlsdGVyITogQmlxdWFkRmlsdGVyTm9kZTtcbiAgcHJpdmF0ZSBkcnkhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSB3ZXQhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBkZWxheSE6IERlbGF5Tm9kZTtcbiAgcHJpdmF0ZSBmZWVkYmFjayE6IEdhaW5Ob2RlO1xuXG4gIHByaXZhdGUgbGZvTm9kZT86IE9zY2lsbGF0b3JOb2RlO1xuICBwcml2YXRlIGxmb0dhaW4/OiBHYWluTm9kZTtcblxuICAvLyBtdXNpY2FsIHN0YXRlXG4gIHByaXZhdGUga2V5Um9vdE1pZGkgPSA0MztcbiAgcHJpdmF0ZSBtb2RlOiBNb2RlTmFtZSA9IFwiSW9uaWFuXCI7XG4gIHByaXZhdGUgZHJvbmVEZWdyZWVJZHggPSAwO1xuICBwcml2YXRlIHJvb3RWb2ljZTogVm9pY2UgfCBudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGN0eDogQXVkaW9Db250ZXh0LFxuICAgIHByaXZhdGUgb3V0OiBHYWluTm9kZSxcbiAgICBzZWVkID0gMVxuICApIHtcbiAgICB0aGlzLnJuZyA9IG1ha2VQUk5HKHNlZWQpO1xuICB9XG5cbiAgc2V0UGFyYW08SyBleHRlbmRzIGtleW9mIEFtYmllbnRQYXJhbXM+KGs6IEssIHY6IEFtYmllbnRQYXJhbXNbS10pIHtcbiAgICB0aGlzLnBhcmFtc1trXSA9IGNsYW1wMDEodik7XG4gICAgaWYgKHRoaXMucnVubmluZyAmJiBrID09PSBcImludGVuc2l0eVwiICYmIHRoaXMubWFzdGVyKSB7XG4gICAgICB0aGlzLm1hc3Rlci5nYWluLnZhbHVlID0gMC4xNSArIDAuODUgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHk7IFxuICAgIH1cbiAgfVxuXG4gIHN0YXJ0KCkge1xuICAgIGlmICh0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICB0aGlzLnJ1bm5pbmcgPSB0cnVlO1xuXG4gICAgLy8gLS0tLSBDb3JlIGdyYXBoIChmaWx0ZXIgLT4gZHJ5K2RlbGF5IC0+IG1hc3RlciAtPiBvdXQpIC0tLS1cbiAgICB0aGlzLm1hc3RlciA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiAwLjE1ICsgMC44NSAqIHRoaXMucGFyYW1zLmludGVuc2l0eSB9KTtcbiAgICB0aGlzLmZpbHRlciA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKHRoaXMuY3R4LCB7IHR5cGU6IFwibG93cGFzc1wiLCBROiAwLjcwNyB9KTtcbiAgICB0aGlzLmRyeSA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiAxIH0pO1xuICAgIHRoaXMud2V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IFdFVF9NSVggfSk7XG4gICAgdGhpcy5kZWxheSA9IG5ldyBEZWxheU5vZGUodGhpcy5jdHgsIHsgZGVsYXlUaW1lOiBERUxBWV9USU1FX1MsIG1heERlbGF5VGltZTogMiB9KTtcbiAgICB0aGlzLmZlZWRiYWNrID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IEZFRURCQUNLX0dBSU4gfSk7XG5cbiAgICB0aGlzLmZpbHRlci5jb25uZWN0KHRoaXMuZHJ5KS5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLmZpbHRlci5jb25uZWN0KHRoaXMuZGVsYXkpO1xuICAgIHRoaXMuZGVsYXkuY29ubmVjdCh0aGlzLmZlZWRiYWNrKS5jb25uZWN0KHRoaXMuZGVsYXkpO1xuICAgIHRoaXMuZGVsYXkuY29ubmVjdCh0aGlzLndldCkuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5tYXN0ZXIuY29ubmVjdCh0aGlzLm91dCk7XG5cbiAgICAvLyAtLS0tIEZpbHRlciBiYXNlbGluZSArIHNsb3cgc3dlZXBzIC0tLS1cbiAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VmFsdWVBdFRpbWUoRklMVEVSX0JBU0VfSFosIHRoaXMuY3R4LmN1cnJlbnRUaW1lKTtcbiAgICBjb25zdCBzd2VlcCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHQgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgICAvLyB1cCB0aGVuIGRvd24gdXNpbmcgdmVyeSBzbG93IHRpbWUgY29uc3RhbnRzXG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VGFyZ2V0QXRUaW1lKFxuICAgICAgICBGSUxURVJfQkFTRV9IWiArIChGSUxURVJfUEVBS19IWiAtIEZJTFRFUl9CQVNFX0haKSAqICgwLjQgKyAwLjYgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKSxcbiAgICAgICAgdCwgU1dFRVBfU0VHX1MgLyAzXG4gICAgICApO1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFRhcmdldEF0VGltZShcbiAgICAgICAgRklMVEVSX0JBU0VfSFogKiAoMC43ICsgMC4zICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyksXG4gICAgICAgIHQgKyBTV0VFUF9TRUdfUywgU1dFRVBfU0VHX1MgLyAzXG4gICAgICApO1xuICAgICAgdGhpcy50aW1lb3V0cy5wdXNoKHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHRoaXMucnVubmluZyAmJiBzd2VlcCgpLCAoU1dFRVBfU0VHX1MgKiAyKSAqIDEwMDApIGFzIHVua25vd24gYXMgbnVtYmVyKTtcbiAgICB9O1xuICAgIHN3ZWVwKCk7XG5cbiAgICAvLyAtLS0tIEdlbnRsZSBMRk8gb24gZmlsdGVyIGZyZXEgKHNtYWxsIGRlcHRoKSAtLS0tXG4gICAgdGhpcy5sZm9Ob2RlID0gbmV3IE9zY2lsbGF0b3JOb2RlKHRoaXMuY3R4LCB7IHR5cGU6IFwic2luZVwiLCBmcmVxdWVuY3k6IExGT19SQVRFX0haIH0pO1xuICAgIHRoaXMubGZvR2FpbiA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBMRk9fREVQVEhfSFogKiAoMC41ICsgMC41ICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcykgfSk7XG4gICAgdGhpcy5sZm9Ob2RlLmNvbm5lY3QodGhpcy5sZm9HYWluKS5jb25uZWN0KHRoaXMuZmlsdGVyLmZyZXF1ZW5jeSk7XG4gICAgdGhpcy5sZm9Ob2RlLnN0YXJ0KCk7XG5cbiAgICAvLyAtLS0tIFNwYXduIHJvb3QgZHJvbmUgKGdsaWRpbmcgdG8gZGlmZmVyZW50IGRlZ3JlZXMpIC0tLS1cbiAgICB0aGlzLnNwYXduUm9vdERyb25lKCk7XG4gICAgdGhpcy5zY2hlZHVsZU5leHREcm9uZU1vdmUoKTtcblxuICAgIC8vIC0tLS0gQ2hvcmQgY3ljbGUgbG9vcCAtLS0tXG4gICAgdGhpcy5jaG9yZEN5Y2xlKCk7XG5cbiAgICAvLyBjbGVhbnVwXG4gICAgdGhpcy5zdG9wRm5zLnB1c2goKCkgPT4ge1xuICAgICAgdHJ5IHsgdGhpcy5sZm9Ob2RlPy5zdG9wKCk7IH0gY2F0Y2gge31cbiAgICAgIFt0aGlzLm1hc3RlciwgdGhpcy5maWx0ZXIsIHRoaXMuZHJ5LCB0aGlzLndldCwgdGhpcy5kZWxheSwgdGhpcy5mZWVkYmFjaywgdGhpcy5sZm9Ob2RlLCB0aGlzLmxmb0dhaW5dXG4gICAgICAgIC5mb3JFYWNoKG4gPT4geyB0cnkgeyBuPy5kaXNjb25uZWN0KCk7IH0gY2F0Y2gge30gfSk7XG4gICAgfSk7XG4gIH1cblxuICBzdG9wKCkge1xuICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG5cbiAgICAvLyBjYW5jZWwgdGltZW91dHNcbiAgICB0aGlzLnRpbWVvdXRzLnNwbGljZSgwKS5mb3JFYWNoKGlkID0+IHdpbmRvdy5jbGVhclRpbWVvdXQoaWQpKTtcblxuICAgIC8vIGZhZGUgYW5kIGNsZWFudXAgdm9pY2VzXG4gICAgaWYgKHRoaXMucm9vdFZvaWNlKSB0aGlzLnJvb3RWb2ljZS5mYWRlT3V0S2lsbCgxLjIpO1xuXG4gICAgLy8gcnVuIGRlZmVycmVkIHN0b3BzXG4gICAgdGhpcy5zdG9wRm5zLnNwbGljZSgwKS5mb3JFYWNoKGZuID0+IGZuKCkpO1xuICB9XG5cbiAgLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBNdXNpY2FsIGVuZ2luZSBiZWxvdyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tICovXG5cbiAgcHJpdmF0ZSBjdXJyZW50RGVncmVlcygpOiBudW1iZXJbXSB7XG4gICAgcmV0dXJuIE1PREVTW3RoaXMubW9kZV0gfHwgTU9ERVMuTHlkaWFuO1xuICB9XG5cbiAgLyoqIERyb25lIHJvb3Qgdm9pY2UgKi9cbiAgcHJpdmF0ZSBzcGF3blJvb3REcm9uZSgpIHtcbiAgICBjb25zdCBiYXNlTWlkaSA9IHRoaXMua2V5Um9vdE1pZGkgKyB0aGlzLmN1cnJlbnREZWdyZWVzKClbdGhpcy5kcm9uZURlZ3JlZUlkeF07XG4gICAgY29uc3QgdiA9IG5ldyBWb2ljZShcbiAgICAgIHRoaXMuY3R4LFxuICAgICAgUk9PVF9NQVhfR0FJTixcbiAgICAgIFwic2luZVwiLFxuICAgICAgbWlkaVRvRnJlcShiYXNlTWlkaSksXG4gICAgICB0aGlzLmZpbHRlcixcbiAgICAgIHRoaXMucm5nXG4gICAgKTtcbiAgICB2LmZhZGVJbihST09UX1NXRUxMX1RJTUUpO1xuICAgIHRoaXMucm9vdFZvaWNlID0gdjtcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCkge1xuICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgY29uc3Qgd2FpdE1zID0gcmFuZCh0aGlzLnJuZywgRFJPTkVfU0hJRlRfTUlOX1MsIERST05FX1NISUZUX01BWF9TKSAqIDEwMDA7XG4gICAgY29uc3QgaWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoIXRoaXMucnVubmluZyB8fCAhdGhpcy5yb290Vm9pY2UpIHJldHVybjtcbiAgICAgIGNvbnN0IGdsaWRlID0gcmFuZCh0aGlzLnJuZywgRFJPTkVfR0xJREVfTUlOX1MsIERST05FX0dMSURFX01BWF9TKTtcbiAgICAgIGNvbnN0IG5leHRJZHggPSB0aGlzLnBpY2tOZXh0RHJvbmVEZWdyZWVJZHgoKTtcbiAgICAgIGNvbnN0IHRhcmdldE1pZGkgPSB0aGlzLmtleVJvb3RNaWRpICsgdGhpcy5jdXJyZW50RGVncmVlcygpW25leHRJZHhdO1xuICAgICAgdGhpcy5yb290Vm9pY2Uuc2V0RnJlcUdsaWRlKG1pZGlUb0ZyZXEodGFyZ2V0TWlkaSksIGdsaWRlKTtcbiAgICAgIHRoaXMuZHJvbmVEZWdyZWVJZHggPSBuZXh0SWR4O1xuICAgICAgdGhpcy5zY2hlZHVsZU5leHREcm9uZU1vdmUoKTtcbiAgICB9LCB3YWl0TXMpIGFzIHVua25vd24gYXMgbnVtYmVyO1xuICAgIHRoaXMudGltZW91dHMucHVzaChpZCk7XG4gIH1cblxuICBwcml2YXRlIHBpY2tOZXh0RHJvbmVEZWdyZWVJZHgoKTogbnVtYmVyIHtcbiAgICBjb25zdCBvcmRlciA9IFsuLi5QUkVGRVJSRURfREVHUkVFX09SREVSXTtcbiAgICBjb25zdCBpID0gb3JkZXIuaW5kZXhPZih0aGlzLmRyb25lRGVncmVlSWR4KTtcbiAgICBpZiAoaSA+PSAwKSB7IGNvbnN0IFtjdXJdID0gb3JkZXIuc3BsaWNlKGksIDEpOyBvcmRlci5wdXNoKGN1cik7IH1cbiAgICByZXR1cm4gY2hvaWNlKHRoaXMucm5nLCBvcmRlcik7XG4gIH1cblxuICAvKiogQnVpbGQgZGlhdG9uaWMgc3RhY2tlZC10aGlyZCBjaG9yZCBkZWdyZWVzIHdpdGggb3B0aW9uYWwgZXh0ZW5zaW9ucyAqL1xuICBwcml2YXRlIGJ1aWxkQ2hvcmREZWdyZWVzKG1vZGVEZWdzOiBudW1iZXJbXSwgcm9vdEluZGV4OiBudW1iZXIsIHNpemUgPSA0LCBhZGQ5ID0gZmFsc2UsIGFkZDExID0gZmFsc2UsIGFkZDEzID0gZmFsc2UpIHtcbiAgICBjb25zdCBzdGVwcyA9IFswLCAyLCA0LCA2XTsgLy8gdGhpcmRzIG92ZXIgNy1ub3RlIHNjYWxlXG4gICAgY29uc3QgY2hvcmRJZHhzID0gc3RlcHMuc2xpY2UoMCwgTWF0aC5taW4oc2l6ZSwgNCkpLm1hcChzID0+IChyb290SW5kZXggKyBzKSAlIDcpO1xuICAgIGlmIChhZGQ5KSAgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDgpICUgNyk7XG4gICAgaWYgKGFkZDExKSBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgMTApICUgNyk7XG4gICAgaWYgKGFkZDEzKSBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgMTIpICUgNyk7XG4gICAgcmV0dXJuIGNob3JkSWR4cy5tYXAoaSA9PiBtb2RlRGVnc1tpXSk7XG4gIH1cblxuICBwcml2YXRlICplbmRsZXNzQ2hvcmRzKCkge1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCBtb2RlRGVncyA9IHRoaXMuY3VycmVudERlZ3JlZXMoKTtcbiAgICAgIC8vIGNob29zZSBjaG9yZCByb290IGRlZ3JlZSAob2Z0ZW4gYWxpZ24gd2l0aCBkcm9uZSlcbiAgICAgIGNvbnN0IHJvb3REZWdyZWVJbmRleCA9ICh0aGlzLnJuZygpIDwgQ0hPUkRfQU5DSE9SX1BST0IpID8gdGhpcy5kcm9uZURlZ3JlZUlkeCA6IE1hdGguZmxvb3IodGhpcy5ybmcoKSAqIDcpO1xuXG4gICAgICAvLyBjaG9yZCBzaXplIC8gZXh0ZW5zaW9uc1xuICAgICAgY29uc3QgciA9IHRoaXMucm5nKCk7XG4gICAgICBsZXQgc2l6ZSA9IDM7IGxldCBhZGQ5ID0gZmFsc2UsIGFkZDExID0gZmFsc2UsIGFkZDEzID0gZmFsc2U7XG4gICAgICBpZiAociA8IDAuMzUpICAgICAgICAgICAgeyBzaXplID0gMzsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuNzUpICAgICAgIHsgc2l6ZSA9IDQ7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjkwKSAgICAgICB7IHNpemUgPSA0OyBhZGQ5ID0gdHJ1ZTsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuOTcpICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDExID0gdHJ1ZTsgfVxuICAgICAgZWxzZSAgICAgICAgICAgICAgICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDEzID0gdHJ1ZTsgfVxuXG4gICAgICBjb25zdCBjaG9yZFNlbWlzID0gdGhpcy5idWlsZENob3JkRGVncmVlcyhtb2RlRGVncywgcm9vdERlZ3JlZUluZGV4LCBzaXplLCBhZGQ5LCBhZGQxMSwgYWRkMTMpO1xuICAgICAgLy8gc3ByZWFkIGNob3JkIGFjcm9zcyBvY3RhdmVzICgtMTIsIDAsICsxMiksIGJpYXMgdG8gY2VudGVyXG4gICAgICBjb25zdCBzcHJlYWQgPSBjaG9yZFNlbWlzLm1hcChzZW1pID0+IHNlbWkgKyBjaG9pY2UodGhpcy5ybmcsIFstMTIsIDAsIDAsIDEyXSkpO1xuXG4gICAgICAvLyBvY2Nhc2lvbmFsbHkgZW5zdXJlIHRvbmljIGlzIHByZXNlbnQgZm9yIGdyb3VuZGluZ1xuICAgICAgaWYgKCFzcHJlYWQuaW5jbHVkZXMoMCkgJiYgdGhpcy5ybmcoKSA8IDAuNSkgc3ByZWFkLnB1c2goMCk7XG5cbiAgICAgIHlpZWxkIHNwcmVhZDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNob3JkQ3ljbGUoKSB7XG4gICAgY29uc3QgZ2VuID0gdGhpcy5lbmRsZXNzQ2hvcmRzKCk7XG4gICAgY29uc3Qgdm9pY2VzID0gbmV3IFNldDxWb2ljZT4oKTtcblxuICAgIGNvbnN0IHNsZWVwID0gKG1zOiBudW1iZXIpID0+IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuICAgICAgY29uc3QgaWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiByKCksIG1zKSBhcyB1bmtub3duIGFzIG51bWJlcjtcbiAgICAgIHRoaXMudGltZW91dHMucHVzaChpZCk7XG4gICAgfSk7XG5cbiAgICB3aGlsZSAodGhpcy5ydW5uaW5nKSB7XG4gICAgICAvLyBjaG9yZCBzcGF3biBwcm9iYWJpbGl0eSAvIHRoaWNrbmVzcyBzY2FsZSB3aXRoIGRlbnNpdHkgJiBicmlnaHRuZXNzXG4gICAgICBjb25zdCB0aGlja25lc3MgPSBNYXRoLnJvdW5kKDIgKyB0aGlzLnBhcmFtcy5kZW5zaXR5ICogMyk7XG4gICAgICBjb25zdCBiYXNlTWlkaSA9IHRoaXMua2V5Um9vdE1pZGk7XG4gICAgICBjb25zdCBkZWdyZWVzT2ZmOiBudW1iZXJbXSA9IGdlbi5uZXh0KCkudmFsdWUgPz8gW107XG5cbiAgICAgIC8vIHNwYXduXG4gICAgICBmb3IgKGNvbnN0IG9mZiBvZiBkZWdyZWVzT2ZmKSB7XG4gICAgICAgIGlmICghdGhpcy5ydW5uaW5nKSBicmVhaztcbiAgICAgICAgaWYgKHZvaWNlcy5zaXplID49IE1hdGgubWluKENIT1JEX1ZPSUNFU19NQVgsIHRoaWNrbmVzcykpIGJyZWFrO1xuXG4gICAgICAgIGNvbnN0IG1pZGkgPSBiYXNlTWlkaSArIG9mZjtcbiAgICAgICAgY29uc3QgZnJlcSA9IG1pZGlUb0ZyZXEobWlkaSk7XG4gICAgICAgIGNvbnN0IHdhdmVmb3JtID0gY2hvaWNlKHRoaXMucm5nLCBbXCJzaW5lXCIsIFwidHJpYW5nbGVcIiwgXCJzYXd0b290aFwiXSBhcyBPc2NpbGxhdG9yVHlwZVtdKTtcblxuICAgICAgICAvLyBsb3VkZXIgd2l0aCBpbnRlbnNpdHk7IHNsaWdodGx5IGJyaWdodGVyIC0+IHNsaWdodGx5IGxvdWRlclxuICAgICAgICBjb25zdCBnYWluVGFyZ2V0ID0gcmFuZCh0aGlzLnJuZywgMC4wOCwgMC4yMikgKlxuICAgICAgICAgICgwLjg1ICsgMC4zICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5KSAqXG4gICAgICAgICAgKDAuOSArIDAuMiAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpO1xuXG4gICAgICAgIGNvbnN0IHYgPSBuZXcgVm9pY2UodGhpcy5jdHgsIGdhaW5UYXJnZXQsIHdhdmVmb3JtLCBmcmVxLCB0aGlzLmZpbHRlciwgdGhpcy5ybmcpO1xuICAgICAgICB2b2ljZXMuYWRkKHYpO1xuICAgICAgICB2LmZhZGVJbihyYW5kKHRoaXMucm5nLCBDSE9SRF9GQURFX01JTl9TLCBDSE9SRF9GQURFX01BWF9TKSk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHNsZWVwKHJhbmQodGhpcy5ybmcsIENIT1JEX0hPTERfTUlOX1MsIENIT1JEX0hPTERfTUFYX1MpICogMTAwMCk7XG5cbiAgICAgIC8vIGZhZGUgb3V0XG4gICAgICBjb25zdCBvdXRzID0gQXJyYXkuZnJvbSh2b2ljZXMpO1xuICAgICAgZm9yIChjb25zdCB2IG9mIG91dHMpIHYuZmFkZU91dEtpbGwocmFuZCh0aGlzLnJuZywgQ0hPUkRfRkFERV9NSU5fUywgQ0hPUkRfRkFERV9NQVhfUykpO1xuICAgICAgdm9pY2VzLmNsZWFyKCk7XG5cbiAgICAgIGF3YWl0IHNsZWVwKHJhbmQodGhpcy5ybmcsIENIT1JEX0dBUF9NSU5fUywgQ0hPUkRfR0FQX01BWF9TKSAqIDEwMDApO1xuICAgIH1cblxuICAgIC8vIHNhZmV0eToga2lsbCBhbnkgbGluZ2VyaW5nIHZvaWNlc1xuICAgIGZvciAoY29uc3QgdiBvZiBBcnJheS5mcm9tKHZvaWNlcykpIHYuZmFkZU91dEtpbGwoMC44KTtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgU2NlbmVOYW1lLCBNdXNpY1NjZW5lT3B0aW9ucyB9IGZyb20gXCIuLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi4vZW5naW5lXCI7XG5pbXBvcnQgeyBBbWJpZW50U2NlbmUgfSBmcm9tIFwiLi9zY2VuZXMvYW1iaWVudFwiO1xuXG5leHBvcnQgY2xhc3MgTXVzaWNEaXJlY3RvciB7XG4gIHByaXZhdGUgY3VycmVudD86IHsgbmFtZTogU2NlbmVOYW1lOyBzdG9wOiAoKSA9PiB2b2lkIH07XG4gIHByaXZhdGUgYnVzT3V0OiBHYWluTm9kZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGVuZ2luZTogQXVkaW9FbmdpbmUpIHtcbiAgICB0aGlzLmJ1c091dCA9IG5ldyBHYWluTm9kZShlbmdpbmUuY3R4LCB7IGdhaW46IDAuOSB9KTtcbiAgICB0aGlzLmJ1c091dC5jb25uZWN0KGVuZ2luZS5nZXRNdXNpY0J1cygpKTtcbiAgfVxuXG4gIC8qKiBDcm9zc2ZhZGUgdG8gYSBuZXcgc2NlbmUgKi9cbiAgc2V0U2NlbmUobmFtZTogU2NlbmVOYW1lLCBvcHRzPzogTXVzaWNTY2VuZU9wdGlvbnMpIHtcbiAgICBpZiAodGhpcy5jdXJyZW50Py5uYW1lID09PSBuYW1lKSByZXR1cm47XG5cbiAgICBjb25zdCBvbGQgPSB0aGlzLmN1cnJlbnQ7XG4gICAgY29uc3QgdCA9IHRoaXMuZW5naW5lLm5vdztcblxuICAgIC8vIGZhZGUtb3V0IG9sZFxuICAgIGNvbnN0IGZhZGVPdXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5lbmdpbmUuY3R4LCB7IGdhaW46IDAuOSB9KTtcbiAgICBmYWRlT3V0LmNvbm5lY3QodGhpcy5lbmdpbmUuZ2V0TXVzaWNCdXMoKSk7XG4gICAgaWYgKG9sZCkge1xuICAgICAgLy8gV2UgYXNzdW1lIGVhY2ggc2NlbmUgbWFuYWdlcyBpdHMgb3duIG91dCBub2RlOyBzdG9wcGluZyB0cmlnZ2VycyBhIG5hdHVyYWwgdGFpbC5cbiAgICAgIG9sZC5zdG9wKCk7XG4gICAgICBmYWRlT3V0LmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wLCB0ICsgMC42KTtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gZmFkZU91dC5kaXNjb25uZWN0KCksIDY1MCk7XG4gICAgfVxuXG4gICAgLy8gbmV3IHNjZW5lXG4gICAgY29uc3Qgc2NlbmVPdXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5lbmdpbmUuY3R4LCB7IGdhaW46IDAgfSk7XG4gICAgc2NlbmVPdXQuY29ubmVjdCh0aGlzLmJ1c091dCk7XG5cbiAgICBsZXQgc3RvcCA9ICgpID0+IHNjZW5lT3V0LmRpc2Nvbm5lY3QoKTtcblxuICAgIGlmIChuYW1lID09PSBcImFtYmllbnRcIikge1xuICAgICAgY29uc3QgcyA9IG5ldyBBbWJpZW50U2NlbmUodGhpcy5lbmdpbmUuY3R4LCBzY2VuZU91dCwgb3B0cz8uc2VlZCA/PyAxKTtcbiAgICAgIHMuc3RhcnQoKTtcbiAgICAgIHN0b3AgPSAoKSA9PiB7XG4gICAgICAgIHMuc3RvcCgpO1xuICAgICAgICBzY2VuZU91dC5kaXNjb25uZWN0KCk7XG4gICAgICB9O1xuICAgIH1cbiAgICAvLyBlbHNlIGlmIChuYW1lID09PSBcImNvbWJhdFwiKSB7IC8qIGltcGxlbWVudCBjb21iYXQgc2NlbmUgbGF0ZXIgKi8gfVxuICAgIC8vIGVsc2UgaWYgKG5hbWUgPT09IFwibG9iYnlcIikgeyAvKiBpbXBsZW1lbnQgbG9iYnkgc2NlbmUgbGF0ZXIgKi8gfVxuXG4gICAgdGhpcy5jdXJyZW50ID0geyBuYW1lLCBzdG9wIH07XG4gICAgc2NlbmVPdXQuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjksIHQgKyAwLjYpO1xuICB9XG5cbiAgc3RvcCgpIHtcbiAgICBpZiAoIXRoaXMuY3VycmVudCkgcmV0dXJuO1xuICAgIHRoaXMuY3VycmVudC5zdG9wKCk7XG4gICAgdGhpcy5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICB9XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBCdXMsIE11c2ljUGFyYW1NZXNzYWdlLCBNdXNpY1NjZW5lT3B0aW9ucyB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgTXVzaWNEaXJlY3RvciB9IGZyb20gXCIuL211c2ljXCI7XG5pbXBvcnQgeyBwbGF5U2Z4IH0gZnJvbSBcIi4vc2Z4XCI7XG5cbi8qKlxuICogQmluZCBzdGFuZGFyZCBhdWRpbyBldmVudHMgdG8gdGhlIGVuZ2luZSBhbmQgbXVzaWMgZGlyZWN0b3IuXG4gKlxuICogRXZlbnRzIHN1cHBvcnRlZDpcbiAqICAtIGF1ZGlvOnJlc3VtZVxuICogIC0gYXVkaW86bXV0ZSAvIGF1ZGlvOnVubXV0ZVxuICogIC0gYXVkaW86c2V0LW1hc3Rlci1nYWluIHsgZ2FpbiB9XG4gKiAgLSBhdWRpbzpzZnggeyBuYW1lLCB2ZWxvY2l0eT8sIHBhbj8gfVxuICogIC0gYXVkaW86bXVzaWM6c2V0LXNjZW5lIHsgc2NlbmUsIHNlZWQ/IH1cbiAqICAtIGF1ZGlvOm11c2ljOnBhcmFtIHsga2V5LCB2YWx1ZSB9XG4gKiAgLSBhdWRpbzptdXNpYzp0cmFuc3BvcnQgeyBjbWQ6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJwYXVzZVwiIH0gIC8vIHBhdXNlIGN1cnJlbnRseSBtYXBzIHRvIHN0b3BcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyhcbiAgYnVzOiBCdXMsXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIG11c2ljOiBNdXNpY0RpcmVjdG9yXG4pOiB2b2lkIHtcbiAgYnVzLm9uKFwiYXVkaW86cmVzdW1lXCIsICgpID0+IGVuZ2luZS5yZXN1bWUoKSk7XG4gIGJ1cy5vbihcImF1ZGlvOm11dGVcIiwgKCkgPT4gZW5naW5lLnNldE1hc3RlckdhaW4oMCkpO1xuICBidXMub24oXCJhdWRpbzp1bm11dGVcIiwgKCkgPT4gZW5naW5lLnNldE1hc3RlckdhaW4oMC45KSk7XG4gIGJ1cy5vbihcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiLCAoeyBnYWluIH06IHsgZ2FpbjogbnVtYmVyIH0pID0+XG4gICAgZW5naW5lLnNldE1hc3RlckdhaW4oTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgZ2FpbikpKVxuICApO1xuXG4gIGJ1cy5vbihcImF1ZGlvOnNmeFwiLCAobXNnOiB7IG5hbWU6IHN0cmluZzsgdmVsb2NpdHk/OiBudW1iZXI7IHBhbj86IG51bWJlciB9KSA9PiB7XG4gICAgcGxheVNmeChlbmdpbmUsIG1zZy5uYW1lIGFzIGFueSwgeyB2ZWxvY2l0eTogbXNnLnZlbG9jaXR5LCBwYW46IG1zZy5wYW4gfSk7XG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiLCAobXNnOiB7IHNjZW5lOiBzdHJpbmcgfSAmIE11c2ljU2NlbmVPcHRpb25zKSA9PiB7XG4gICAgZW5naW5lLnJlc3VtZSgpO1xuICAgIG11c2ljLnNldFNjZW5lKG1zZy5zY2VuZSBhcyBhbnksIHsgc2VlZDogbXNnLnNlZWQgfSk7XG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnBhcmFtXCIsIChfbXNnOiBNdXNpY1BhcmFtTWVzc2FnZSkgPT4ge1xuICAgIC8vIEhvb2sgZm9yIGZ1dHVyZSBwYXJhbSByb3V0aW5nIHBlciBzY2VuZSAoZS5nLiwgaW50ZW5zaXR5L2JyaWdodG5lc3MvZGVuc2l0eSlcbiAgICAvLyBJZiB5b3Ugd2FudCBnbG9iYWwgcGFyYW1zLCBrZWVwIGEgbWFwIGhlcmUgYW5kIGZvcndhcmQgdG8gdGhlIGFjdGl2ZSBzY2VuZVxuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzp0cmFuc3BvcnRcIiwgKHsgY21kIH06IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9KSA9PiB7XG4gICAgaWYgKGNtZCA9PT0gXCJzdG9wXCIgfHwgY21kID09PSBcInBhdXNlXCIpIG11c2ljLnN0b3AoKTtcbiAgICAvLyBcInN0YXJ0XCIgaXMgaW1wbGljaXQgdmlhIHNldFNjZW5lXG4gIH0pO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBCZWFjb25EZWZpbml0aW9uLCBNaXNzaW9uU3RhdGUsIFdvcmxkTWV0YSB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuaW1wb3J0IHsgbW9ub3RvbmljTm93IH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lvbkNvbnRyb2xsZXIge1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBNaXNzaW9uQ29udHJvbGxlck9wdGlvbnMge1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG1vZGU6IHN0cmluZztcbiAgbWlzc2lvbklkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgTWlzc2lvblNwZWMge1xuICBpZDogc3RyaW5nO1xuICBob2xkU2Vjb25kczogbnVtYmVyO1xuICBkZWZhdWx0V29ybGRTaXplOiB7IHc6IG51bWJlcjsgaDogbnVtYmVyIH07XG4gIGJlYWNvbnM6IEFycmF5PHsgZng6IG51bWJlcjsgZnk6IG51bWJlcjsgcmFkaXVzOiBudW1iZXIgfT47XG59XG5cbmludGVyZmFjZSBQZXJzaXN0ZWRQcm9ncmVzcyB7XG4gIGJlYWNvbkluZGV4OiBudW1iZXI7XG4gIGhvbGRBY2N1bTogbnVtYmVyO1xufVxuXG5jb25zdCBTVE9SQUdFX1BSRUZJWCA9IFwibHNkOm1pc3Npb246XCI7XG5jb25zdCBIT0xEX0VQU0lMT04gPSAwLjAwMDE7XG5cbmNvbnN0IENBTVBBSUdOX01JU1NJT05TOiBSZWNvcmQ8c3RyaW5nLCBNaXNzaW9uU3BlYz4gPSB7XG4gIFwiMVwiOiB7XG4gICAgaWQ6IFwiY2FtcGFpZ24tMVwiLFxuICAgIGhvbGRTZWNvbmRzOiAxMCxcbiAgICBkZWZhdWx0V29ybGRTaXplOiB7IHc6IDMyMDAwLCBoOiAxODAwMCB9LFxuICAgIGJlYWNvbnM6IFtcbiAgICAgIHsgZng6IDAuMTUsIGZ5OiAwLjU1LCByYWRpdXM6IDQyMCB9LFxuICAgICAgeyBmeDogMC40MCwgZnk6IDAuNTAsIHJhZGl1czogMzYwIH0sXG4gICAgICB7IGZ4OiAwLjY1LCBmeTogMC40NywgcmFkaXVzOiAzMDAgfSxcbiAgICAgIHsgZng6IDAuODUsIGZ5OiAwLjQ0LCByYWRpdXM6IDI2MCB9LFxuICAgIF0sXG4gIH0sXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRNaXNzaW9uQ29udHJvbGxlcih7IHN0YXRlLCBidXMsIG1vZGUsIG1pc3Npb25JZCB9OiBNaXNzaW9uQ29udHJvbGxlck9wdGlvbnMpOiBNaXNzaW9uQ29udHJvbGxlciB7XG4gIGlmIChtb2RlICE9PSBcImNhbXBhaWduXCIpIHtcbiAgICByZXR1cm4geyBkZXN0cm95KCkge30gfTtcbiAgfVxuXG4gIGNvbnN0IHNwZWMgPSBtaXNzaW9uSWQgJiYgQ0FNUEFJR05fTUlTU0lPTlNbbWlzc2lvbklkXSA/IENBTVBBSUdOX01JU1NJT05TW21pc3Npb25JZF0gOiBDQU1QQUlHTl9NSVNTSU9OU1tcIjFcIl07XG4gIGlmICghc3BlYykge1xuICAgIHJldHVybiB7IGRlc3Ryb3koKSB7fSB9O1xuICB9XG5cbiAgY29uc3Qgc3RvcmFnZUtleSA9IGAke1NUT1JBR0VfUFJFRklYfSR7c3BlYy5pZH1gO1xuICBsZXQgcGVyc2lzdGVkID0gbG9hZFByb2dyZXNzKHN0b3JhZ2VLZXkpO1xuICBjb25zdCBjb21wbGV0ZWRCZWZvcmUgPSBwZXJzaXN0ZWQuYmVhY29uSW5kZXggPj0gc3BlYy5iZWFjb25zLmxlbmd0aDtcbiAgaWYgKGNvbXBsZXRlZEJlZm9yZSkge1xuICAgIHBlcnNpc3RlZCA9IHsgYmVhY29uSW5kZXg6IDAsIGhvbGRBY2N1bTogMCB9O1xuICAgIHRyeSB7XG4gICAgICBzYXZlUHJvZ3Jlc3Moc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkocGVyc2lzdGVkKSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBpZ25vcmUgc3RvcmFnZSBlcnJvcnNcbiAgICB9XG4gIH1cblxuICBsZXQgbWlzc2lvbjogTWlzc2lvblN0YXRlID0ge1xuICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICBtaXNzaW9uSWQ6IHNwZWMuaWQsXG4gICAgYmVhY29uSW5kZXg6IGNsYW1wQmVhY29uSW5kZXgocGVyc2lzdGVkLmJlYWNvbkluZGV4LCBzcGVjLmJlYWNvbnMubGVuZ3RoKSxcbiAgICBob2xkQWNjdW06IGNsYW1wSG9sZChwZXJzaXN0ZWQuaG9sZEFjY3VtLCBzcGVjLmhvbGRTZWNvbmRzKSxcbiAgICBob2xkUmVxdWlyZWQ6IHNwZWMuaG9sZFNlY29uZHMsXG4gICAgYmVhY29uczogW10sXG4gIH07XG5cbiAgbGV0IGxhc3RXb3JsZEtleSA9IFwiXCI7XG4gIGxldCBsYXN0UGVyc2lzdGVkSlNPTiA9IGNvbXBsZXRlZEJlZm9yZSA/IEpTT04uc3RyaW5naWZ5KHBlcnNpc3RlZCkgOiBcIlwiO1xuICBsZXQgbGFzdFNlcnZlck5vdzogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgc3RhdGUubWlzc2lvbiA9IG1pc3Npb247XG4gIGJ1cy5lbWl0KFwibWlzc2lvbjpzdGFydFwiKTtcbiAgLy8gUHJpbWUgYmVhY29uIGNvb3JkaW5hdGVzIGltbWVkaWF0ZWx5IHVzaW5nIHdoYXRldmVyIHdvcmxkIG1ldGEgaXMgYXZhaWxhYmxlLlxuICAvLyBTdWJzZXF1ZW50IHN0YXRlIHVwZGF0ZXMgd2lsbCByZWZpbmUgaWYgdGhlIHdvcmxkIHNpemUgY2hhbmdlcy5cbiAgc3luY0JlYWNvbnMoc3RhdGUud29ybGRNZXRhKTtcblxuICBmdW5jdGlvbiBzeW5jQmVhY29ucyhtZXRhOiBXb3JsZE1ldGEgfCB1bmRlZmluZWQpOiB2b2lkIHtcbiAgICBjb25zdCB3b3JsZFcgPSByZXNvbHZlV29ybGRWYWx1ZShtZXRhPy53LCBzcGVjLmRlZmF1bHRXb3JsZFNpemUudyk7XG4gICAgY29uc3Qgd29ybGRIID0gcmVzb2x2ZVdvcmxkVmFsdWUobWV0YT8uaCwgc3BlYy5kZWZhdWx0V29ybGRTaXplLmgpO1xuICAgIGNvbnN0IGtleSA9IGAke3dvcmxkVy50b0ZpeGVkKDIpfToke3dvcmxkSC50b0ZpeGVkKDIpfWA7XG4gICAgaWYgKGtleSA9PT0gbGFzdFdvcmxkS2V5ICYmIG1pc3Npb24uYmVhY29ucy5sZW5ndGggPT09IHNwZWMuYmVhY29ucy5sZW5ndGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGFzdFdvcmxkS2V5ID0ga2V5O1xuICAgIG1pc3Npb24uYmVhY29ucyA9IHNwZWMuYmVhY29ucy5tYXAoKGRlZik6IEJlYWNvbkRlZmluaXRpb24gPT4gKHtcbiAgICAgIGN4OiBkZWYuZnggKiB3b3JsZFcsXG4gICAgICBjeTogZGVmLmZ5ICogd29ybGRILFxuICAgICAgcmFkaXVzOiBkZWYucmFkaXVzLFxuICAgIH0pKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBlcnNpc3QoZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICAgIGlmICghbWlzc2lvbi5hY3RpdmUgJiYgbWlzc2lvbi5iZWFjb25JbmRleCA+PSBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoKSB7XG4gICAgICAvLyBNaXNzaW9uIGNvbXBsZXRlLCBzdG9yZSBjb21wbGV0aW9uIHdpdGggemVybyBob2xkLlxuICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHsgYmVhY29uSW5kZXg6IG1pc3Npb24uYmVhY29uSW5kZXgsIGhvbGRBY2N1bTogMCB9KTtcbiAgICAgIGlmICghZm9yY2UgJiYgcGF5bG9hZCA9PT0gbGFzdFBlcnNpc3RlZEpTT04pIHJldHVybjtcbiAgICAgIGxhc3RQZXJzaXN0ZWRKU09OID0gcGF5bG9hZDtcbiAgICAgIHNhdmVQcm9ncmVzcyhzdG9yYWdlS2V5LCBwYXlsb2FkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIGJlYWNvbkluZGV4OiBtaXNzaW9uLmJlYWNvbkluZGV4LFxuICAgICAgaG9sZEFjY3VtOiBjbGFtcEhvbGQobWlzc2lvbi5ob2xkQWNjdW0sIG1pc3Npb24uaG9sZFJlcXVpcmVkKSxcbiAgICB9KTtcbiAgICBpZiAoIWZvcmNlICYmIHBheWxvYWQgPT09IGxhc3RQZXJzaXN0ZWRKU09OKSByZXR1cm47XG4gICAgbGFzdFBlcnNpc3RlZEpTT04gPSBwYXlsb2FkO1xuICAgIHNhdmVQcm9ncmVzcyhzdG9yYWdlS2V5LCBwYXlsb2FkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXB1dGVEdChub3dTZWM6IG51bWJlciB8IHVuZGVmaW5lZCB8IG51bGwpOiBudW1iZXIge1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG5vd1NlYykpIHtcbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICBpZiAobGFzdFNlcnZlck5vdyA9PT0gbnVsbCB8fCAhTnVtYmVyLmlzRmluaXRlKGxhc3RTZXJ2ZXJOb3cpKSB7XG4gICAgICBsYXN0U2VydmVyTm93ID0gbm93U2VjITtcbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICBjb25zdCBkdCA9IG5vd1NlYyEgLSBsYXN0U2VydmVyTm93O1xuICAgIGxhc3RTZXJ2ZXJOb3cgPSBub3dTZWMhO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGR0KSB8fCBkdCA8PSAwKSB7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gICAgcmV0dXJuIGR0O1xuICB9XG5cbiAgZnVuY3Rpb24gaXNJbnNpZGVCZWFjb24oY3g6IG51bWJlciwgY3k6IG51bWJlciwgcmFkaXVzOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBjb25zdCBtZSA9IHN0YXRlLm1lO1xuICAgIGlmICghbWUpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBkeCA9IG1lLnggLSBjeDtcbiAgICBjb25zdCBkeSA9IG1lLnkgLSBjeTtcbiAgICBjb25zdCBkaXN0U3EgPSBkeCAqIGR4ICsgZHkgKiBkeTtcbiAgICByZXR1cm4gZGlzdFNxIDw9IHJhZGl1cyAqIHJhZGl1cztcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzU3RhbGxlZCgpOiBib29sZWFuIHtcbiAgICBjb25zdCBoZWF0ID0gc3RhdGUubWU/LmhlYXQ7XG4gICAgaWYgKCFoZWF0KSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3Qgbm93ID0gbW9ub3RvbmljTm93KCk7XG4gICAgcmV0dXJuIE51bWJlci5pc0Zpbml0ZShoZWF0LnN0YWxsVW50aWxNcykgJiYgbm93IDwgaGVhdC5zdGFsbFVudGlsTXM7XG4gIH1cblxuICBmdW5jdGlvbiBsb2NrQ3VycmVudEJlYWNvbigpOiB2b2lkIHtcbiAgICBjb25zdCBsb2NrZWRJbmRleCA9IG1pc3Npb24uYmVhY29uSW5kZXg7XG4gICAgYnVzLmVtaXQoXCJtaXNzaW9uOmJlYWNvbi1sb2NrZWRcIiwgeyBpbmRleDogbG9ja2VkSW5kZXggfSk7XG4gICAgbWlzc2lvbi5iZWFjb25JbmRleCA9IE1hdGgubWluKG1pc3Npb24uYmVhY29uSW5kZXggKyAxLCBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoKTtcbiAgICBtaXNzaW9uLmhvbGRBY2N1bSA9IDA7XG4gICAgcGVyc2lzdCh0cnVlKTtcbiAgICBpZiAobWlzc2lvbi5iZWFjb25JbmRleCA+PSBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoKSB7XG4gICAgICBtaXNzaW9uLmFjdGl2ZSA9IGZhbHNlO1xuICAgICAgcGVyc2lzdCh0cnVlKTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lvbjpjb21wbGV0ZWRcIik7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzZXRIb2xkSWZOZWVkZWQoKTogdm9pZCB7XG4gICAgaWYgKG1pc3Npb24uaG9sZEFjY3VtID4gMCkge1xuICAgICAgbWlzc2lvbi5ob2xkQWNjdW0gPSAwO1xuICAgICAgcGVyc2lzdCgpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHVuc3Vic2NyaWJlID0gYnVzLm9uKFwic3RhdGU6dXBkYXRlZFwiLCAoKSA9PiB7XG4gICAgaWYgKCFzdGF0ZS5taXNzaW9uIHx8ICFzdGF0ZS5taXNzaW9uLmFjdGl2ZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIG1pc3Npb24gPSBzdGF0ZS5taXNzaW9uO1xuICAgIHN5bmNCZWFjb25zKHN0YXRlLndvcmxkTWV0YSk7XG5cbiAgICBpZiAobWlzc2lvbi5iZWFjb25JbmRleCA+PSBtaXNzaW9uLmJlYWNvbnMubGVuZ3RoKSB7XG4gICAgICBtaXNzaW9uLmFjdGl2ZSA9IGZhbHNlO1xuICAgICAgcGVyc2lzdCh0cnVlKTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lvbjpjb21wbGV0ZWRcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgYmVhY29uID0gbWlzc2lvbi5iZWFjb25zW21pc3Npb24uYmVhY29uSW5kZXhdO1xuICAgIGlmICghYmVhY29uKSB7XG4gICAgICBtaXNzaW9uLmFjdGl2ZSA9IGZhbHNlO1xuICAgICAgcGVyc2lzdCh0cnVlKTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lvbjpjb21wbGV0ZWRcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZHQgPSBjb21wdXRlRHQoc3RhdGUubm93KTtcbiAgICBpZiAoIXN0YXRlLm1lKSB7XG4gICAgICBsYXN0U2VydmVyTm93ID0gc3RhdGUubm93O1xuICAgICAgcmVzZXRIb2xkSWZOZWVkZWQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoaXNJbnNpZGVCZWFjb24oYmVhY29uLmN4LCBiZWFjb24uY3ksIGJlYWNvbi5yYWRpdXMpICYmICFpc1N0YWxsZWQoKSkge1xuICAgICAgY29uc3QgbmV4dEhvbGQgPSBNYXRoLm1pbihtaXNzaW9uLmhvbGRSZXF1aXJlZCwgbWlzc2lvbi5ob2xkQWNjdW0gKyBkdCk7XG4gICAgICBpZiAoTWF0aC5hYnMobmV4dEhvbGQgLSBtaXNzaW9uLmhvbGRBY2N1bSkgPiBIT0xEX0VQU0lMT04pIHtcbiAgICAgICAgbWlzc2lvbi5ob2xkQWNjdW0gPSBuZXh0SG9sZDtcbiAgICAgICAgcGVyc2lzdCgpO1xuICAgICAgfVxuICAgICAgaWYgKG1pc3Npb24uaG9sZEFjY3VtICsgSE9MRF9FUFNJTE9OID49IG1pc3Npb24uaG9sZFJlcXVpcmVkKSB7XG4gICAgICAgIGxvY2tDdXJyZW50QmVhY29uKCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc2V0SG9sZElmTmVlZGVkKCk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4ge1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICB1bnN1YnNjcmliZSgpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVXb3JsZFZhbHVlKHZhbHVlOiBudW1iZXIgfCB1bmRlZmluZWQsIGZhbGxiYWNrOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgJiYgdmFsdWUgPiAwKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHJldHVybiBmYWxsYmFjaztcbn1cblxuZnVuY3Rpb24gY2xhbXBCZWFjb25JbmRleChpbmRleDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoaW5kZXgpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgaWYgKGluZGV4IDwgMCkgcmV0dXJuIDA7XG4gIGlmIChpbmRleCA+IHRvdGFsKSByZXR1cm4gdG90YWw7XG4gIHJldHVybiBNYXRoLmZsb29yKGluZGV4KTtcbn1cblxuZnVuY3Rpb24gY2xhbXBIb2xkKGhvbGQ6IG51bWJlciwgaG9sZFJlcXVpcmVkOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShob2xkKSB8fCBob2xkIDwgMCkgcmV0dXJuIDA7XG4gIGlmIChob2xkID4gaG9sZFJlcXVpcmVkKSByZXR1cm4gaG9sZFJlcXVpcmVkO1xuICByZXR1cm4gaG9sZDtcbn1cblxuZnVuY3Rpb24gbG9hZFByb2dyZXNzKHN0b3JhZ2VLZXk6IHN0cmluZyk6IFBlcnNpc3RlZFByb2dyZXNzIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oc3RvcmFnZUtleSk7XG4gICAgaWYgKCFyYXcpIHtcbiAgICAgIHJldHVybiB7IGJlYWNvbkluZGV4OiAwLCBob2xkQWNjdW06IDAgfTtcbiAgICB9XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFBhcnRpYWw8UGVyc2lzdGVkUHJvZ3Jlc3M+IHwgbnVsbDtcbiAgICBpZiAoIXBhcnNlZCkge1xuICAgICAgcmV0dXJuIHsgYmVhY29uSW5kZXg6IDAsIGhvbGRBY2N1bTogMCB9O1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgYmVhY29uSW5kZXg6IGNsYW1wQmVhY29uSW5kZXgocGFyc2VkLmJlYWNvbkluZGV4ID8/IDAsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSxcbiAgICAgIGhvbGRBY2N1bTogdHlwZW9mIHBhcnNlZC5ob2xkQWNjdW0gPT09IFwibnVtYmVyXCIgPyBNYXRoLm1heCgwLCBwYXJzZWQuaG9sZEFjY3VtKSA6IDAsXG4gICAgfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHsgYmVhY29uSW5kZXg6IDAsIGhvbGRBY2N1bTogMCB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIHNhdmVQcm9ncmVzcyhzdG9yYWdlS2V5OiBzdHJpbmcsIHBheWxvYWQ6IHN0cmluZyk6IHZvaWQge1xuICB0cnkge1xuICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShzdG9yYWdlS2V5LCBwYXlsb2FkKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gTG9jYWwgc3RvcmFnZSBtYXkgYmUgdW5hdmFpbGFibGU7IGlnbm9yZS5cbiAgfVxufVxuIiwgImltcG9ydCB7IGNyZWF0ZUV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgeyBjb25uZWN0V2ViU29ja2V0LCBzZW5kTWVzc2FnZSB9IGZyb20gXCIuL25ldFwiO1xuaW1wb3J0IHsgaW5pdEdhbWUgfSBmcm9tIFwiLi9nYW1lXCI7XG5pbXBvcnQgeyBjcmVhdGVJbml0aWFsU3RhdGUsIGNyZWF0ZUluaXRpYWxVSVN0YXRlIH0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7IG1vdW50VHV0b3JpYWwsIEJBU0lDX1RVVE9SSUFMX0lEIH0gZnJvbSBcIi4vdHV0b3JpYWxcIjtcbmltcG9ydCB7IGNsZWFyUHJvZ3Jlc3MgYXMgY2xlYXJUdXRvcmlhbFByb2dyZXNzIH0gZnJvbSBcIi4vdHV0b3JpYWwvc3RvcmFnZVwiO1xuaW1wb3J0IHsgbW91bnRTdG9yeSwgSU5UUk9fQ0hBUFRFUl9JRCwgSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMgfSBmcm9tIFwiLi9zdG9yeVwiO1xuaW1wb3J0IHsgd2FpdEZvclVzZXJTdGFydCB9IGZyb20gXCIuL3N0YXJ0LWdhdGVcIjtcbmltcG9ydCB7IHJlc3VtZUF1ZGlvIH0gZnJvbSBcIi4vc3Rvcnkvc2Z4XCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2F1ZGlvL2VuZ2luZVwiO1xuaW1wb3J0IHsgTXVzaWNEaXJlY3RvciB9IGZyb20gXCIuL2F1ZGlvL211c2ljXCI7XG5pbXBvcnQgeyByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MgfSBmcm9tIFwiLi9hdWRpby9jdWVzXCI7XG5pbXBvcnQgeyBtb3VudE1pc3Npb25Db250cm9sbGVyIH0gZnJvbSBcIi4vbWlzc2lvbi9jb250cm9sbGVyXCI7XG5cbmNvbnN0IENBTExfU0lHTl9TVE9SQUdFX0tFWSA9IFwibHNkOmNhbGxzaWduXCI7XG5cbihhc3luYyBmdW5jdGlvbiBib290c3RyYXAoKSB7XG4gIGNvbnN0IHFzID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcbiAgY29uc3Qgcm9vbSA9IHFzLmdldChcInJvb21cIikgfHwgXCJkZWZhdWx0XCI7XG4gIGNvbnN0IG1vZGUgPSBxcy5nZXQoXCJtb2RlXCIpIHx8IFwiXCI7XG4gIGNvbnN0IG1pc3Npb25JZCA9IHFzLmdldChcIm1pc3Npb25cIikgfHwgKG1vZGUgPT09IFwiY2FtcGFpZ25cIiA/IFwiMVwiIDogbnVsbCk7XG4gIGNvbnN0IG5hbWVQYXJhbSA9IHNhbml0aXplQ2FsbFNpZ24ocXMuZ2V0KFwibmFtZVwiKSk7XG4gIGNvbnN0IHN0b3JlZE5hbWUgPSBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgY29uc3QgY2FsbFNpZ24gPSBuYW1lUGFyYW0gfHwgc3RvcmVkTmFtZTtcbiAgY29uc3QgbWFwVyA9IHBhcnNlRmxvYXQocXMuZ2V0KFwibWFwV1wiKSB8fCBcIjgwMDBcIik7XG4gIGNvbnN0IG1hcEggPSBwYXJzZUZsb2F0KHFzLmdldChcIm1hcEhcIikgfHwgXCI0NTAwXCIpO1xuXG4gIGlmIChuYW1lUGFyYW0gJiYgbmFtZVBhcmFtICE9PSBzdG9yZWROYW1lKSB7XG4gICAgcGVyc2lzdENhbGxTaWduKG5hbWVQYXJhbSk7XG4gIH1cblxuICAvLyBHYXRlIGV2ZXJ5dGhpbmcgb24gYSB1c2VyIGdlc3R1cmUgKGNlbnRyZWQgYnV0dG9uKVxuICBhd2FpdCB3YWl0Rm9yVXNlclN0YXJ0KHtcbiAgICBsYWJlbDogXCJTdGFydCBHYW1lXCIsXG4gICAgcmVxdWVzdEZ1bGxzY3JlZW46IGZhbHNlLCAgIC8vIGZsaXAgdG8gdHJ1ZSBpZiB5b3Ugd2FudCBmdWxsc2NyZWVuXG4gICAgcmVzdW1lQXVkaW8sICAgICAgICAgICAgICAgIC8vIHVzZXMgc3Rvcnkvc2Z4LnRzXG4gIH0pO1xuXG4gIC8vIC0tLS0gU3RhcnQgYWN0dWFsIGFwcCBhZnRlciBnZXN0dXJlIC0tLS1cbiAgY29uc3Qgc3RhdGUgPSBjcmVhdGVJbml0aWFsU3RhdGUoKTtcbiAgY29uc3QgdWlTdGF0ZSA9IGNyZWF0ZUluaXRpYWxVSVN0YXRlKCk7XG4gIGNvbnN0IGJ1cyA9IGNyZWF0ZUV2ZW50QnVzKCk7XG5cbiAgLy8gLS0tIEFVRElPOiBlbmdpbmUgKyBiaW5kaW5ncyArIGRlZmF1bHQgc2NlbmUgLS0tXG4gIGNvbnN0IGVuZ2luZSA9IEF1ZGlvRW5naW5lLmdldCgpO1xuICBhd2FpdCBlbmdpbmUucmVzdW1lKCk7IC8vIHNhZmUgcG9zdC1nZXN0dXJlXG4gIGNvbnN0IG11c2ljID0gbmV3IE11c2ljRGlyZWN0b3IoZW5naW5lKTtcbiAgcmVnaXN0ZXJBdWRpb0J1c0JpbmRpbmdzKGJ1cyBhcyBhbnksIGVuZ2luZSwgbXVzaWMpO1xuXG4gIC8vIFN0YXJ0IGEgZGVmYXVsdCBtdXNpYyBzY2VuZSAoYWRqdXN0IHNlZWQvc2NlbmUgYXMgeW91IGxpa2UpXG4gIGJ1cy5lbWl0KFwiYXVkaW86bXVzaWM6c2V0LXNjZW5lXCIsIHsgc2NlbmU6IFwiYW1iaWVudFwiLCBzZWVkOiA0MiB9KTtcblxuICAvLyBPcHRpb25hbDogYmFzaWMgaG9va3MgdG8gZGVtb25zdHJhdGUgU0ZYICYgZHVja2luZ1xuICAvLyBidXMub24oXCJkaWFsb2d1ZTpvcGVuZWRcIiwgKCkgPT4gZW5naW5lLmR1Y2tNdXNpYygwLjM1LCAwLjEpKTtcbiAgLy8gYnVzLm9uKFwiZGlhbG9ndWU6Y2xvc2VkXCIsICgpID0+IGVuZ2luZS51bmR1Y2tNdXNpYygwLjI1KSk7XG5cbiAgLy8gRXhhbXBsZSBnYW1lIFNGWCB3aXJpbmcgKGFkYXB0IHRvIHlvdXIgYWN0dWFsIGV2ZW50cylcbiAgYnVzLm9uKFwic2hpcDpzcGVlZENoYW5nZWRcIiwgKHsgdmFsdWUgfSkgPT4ge1xuICAgIGlmICh2YWx1ZSA+IDApIGJ1cy5lbWl0KFwiYXVkaW86c2Z4XCIsIHsgbmFtZTogXCJ0aHJ1c3RcIiwgdmVsb2NpdHk6IE1hdGgubWluKDEsIHZhbHVlKSB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZ2FtZSA9IGluaXRHYW1lKHsgc3RhdGUsIHVpU3RhdGUsIGJ1cyB9KTtcbiAgbW91bnRNaXNzaW9uQ29udHJvbGxlcih7IHN0YXRlLCBidXMsIG1vZGUsIG1pc3Npb25JZCB9KTtcblxuICAvLyBNb3VudCB0dXRvcmlhbCBhbmQgc3RvcnkgYmFzZWQgb24gZ2FtZSBtb2RlXG4gIGNvbnN0IGVuYWJsZVR1dG9yaWFsID0gbW9kZSA9PT0gXCJjYW1wYWlnblwiIHx8IG1vZGUgPT09IFwidHV0b3JpYWxcIjtcbiAgY29uc3QgZW5hYmxlU3RvcnkgPSBtb2RlID09PSBcImNhbXBhaWduXCI7XG5cbiAgaWYgKG1vZGUgPT09IFwiY2FtcGFpZ25cIikge1xuICAgIGNvbnN0IGRpc3BhdGNoZWRXYXZlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICAgIGJ1cy5vbihcIm1pc3Npb246YmVhY29uLWxvY2tlZFwiLCAoeyBpbmRleCB9KSA9PiB7XG4gICAgICBjb25zdCB3YXZlSW5kZXggPSBpbmRleCArIDE7XG4gICAgICBpZiAod2F2ZUluZGV4IDwgMSB8fCB3YXZlSW5kZXggPiAzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNwYXRjaGVkV2F2ZXMuaGFzKHdhdmVJbmRleCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZGlzcGF0Y2hlZFdhdmVzLmFkZCh3YXZlSW5kZXgpO1xuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIm1pc3Npb25fc3Bhd25fd2F2ZVwiLCB3YXZlX2luZGV4OiB3YXZlSW5kZXggfSk7XG4gICAgfSk7XG4gIH1cblxuICBsZXQgdHV0b3JpYWw6IFJldHVyblR5cGU8dHlwZW9mIG1vdW50VHV0b3JpYWw+IHwgbnVsbCA9IG51bGw7XG4gIGxldCB0dXRvcmlhbFN0YXJ0ZWQgPSBmYWxzZTtcblxuICBpZiAoZW5hYmxlVHV0b3JpYWwpIHtcbiAgICB0dXRvcmlhbCA9IG1vdW50VHV0b3JpYWwoYnVzKTtcbiAgfVxuXG4gIGNvbnN0IHN0YXJ0VHV0b3JpYWwgPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKCF0dXRvcmlhbCB8fCB0dXRvcmlhbFN0YXJ0ZWQpIHJldHVybjtcbiAgICB0dXRvcmlhbFN0YXJ0ZWQgPSB0cnVlO1xuICAgIGNsZWFyVHV0b3JpYWxQcm9ncmVzcyhCQVNJQ19UVVRPUklBTF9JRCk7XG4gICAgdHV0b3JpYWwuc3RhcnQoeyByZXN1bWU6IGZhbHNlIH0pO1xuICB9O1xuXG4gIGlmIChlbmFibGVTdG9yeSkge1xuICAgIC8vIENhbXBhaWduIG1vZGU6IHN0b3J5ICsgdHV0b3JpYWxcbiAgICBjb25zdCB1bnN1YnNjcmliZVN0b3J5Q2xvc2VkID0gYnVzLm9uKFwiZGlhbG9ndWU6Y2xvc2VkXCIsICh7IGNoYXB0ZXJJZCwgbm9kZUlkIH0pID0+IHtcbiAgICAgIGlmIChjaGFwdGVySWQgIT09IElOVFJPX0NIQVBURVJfSUQpIHJldHVybjtcbiAgICAgIGlmICghSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMuaW5jbHVkZXMobm9kZUlkIGFzIHR5cGVvZiBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEU1tudW1iZXJdKSkgcmV0dXJuO1xuICAgICAgdW5zdWJzY3JpYmVTdG9yeUNsb3NlZCgpO1xuICAgICAgc3RhcnRUdXRvcmlhbCgpO1xuICAgIH0pO1xuICAgIG1vdW50U3RvcnkoeyBidXMsIHJvb21JZDogcm9vbSB9KTtcbiAgfSBlbHNlIGlmIChtb2RlID09PSBcInR1dG9yaWFsXCIpIHtcbiAgICAvLyBUdXRvcmlhbCBtb2RlOiBhdXRvLXN0YXJ0IHR1dG9yaWFsIHdpdGhvdXQgc3RvcnlcbiAgICBzdGFydFR1dG9yaWFsKCk7XG4gIH1cbiAgLy8gRnJlZSBwbGF5IGFuZCBkZWZhdWx0OiBubyBzeXN0ZW1zIG1vdW50ZWRcblxuICBjb25uZWN0V2ViU29ja2V0KHtcbiAgICByb29tLFxuICAgIHN0YXRlLFxuICAgIGJ1cyxcbiAgICBtYXBXLFxuICAgIG1hcEgsXG4gICAgbW9kZSxcbiAgICBtaXNzaW9uSWQ6IG1pc3Npb25JZCA/PyB1bmRlZmluZWQsXG4gICAgb25TdGF0ZVVwZGF0ZWQ6ICgpID0+IGdhbWUub25TdGF0ZVVwZGF0ZWQoKSxcbiAgICBvbk9wZW46ICgpID0+IHtcbiAgICAgIGNvbnN0IG5hbWVUb1NlbmQgPSBjYWxsU2lnbiB8fCBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgICAgIGlmIChuYW1lVG9TZW5kKSBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiam9pblwiLCBuYW1lOiBuYW1lVG9TZW5kIH0pO1xuICAgIH0sXG4gIH0pO1xuXG4gIC8vIE9wdGlvbmFsOiBzdXNwZW5kL3Jlc3VtZSBhdWRpbyBvbiB0YWIgdmlzaWJpbGl0eSB0byBzYXZlIENQVVxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwidmlzaWJpbGl0eWNoYW5nZVwiLCAoKSA9PiB7XG4gICAgaWYgKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gXCJoaWRkZW5cIikge1xuICAgICAgdm9pZCBlbmdpbmUuc3VzcGVuZCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2b2lkIGVuZ2luZS5yZXN1bWUoKTtcbiAgICB9XG4gIH0pO1xufSkoKTtcblxuZnVuY3Rpb24gc2FuaXRpemVDYWxsU2lnbih2YWx1ZTogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHJldHVybiBcIlwiO1xuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHJldHVybiBcIlwiO1xuICByZXR1cm4gdHJpbW1lZC5zbGljZSgwLCAyNCk7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RDYWxsU2lnbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBpZiAobmFtZSkgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSwgbmFtZSk7XG4gICAgZWxzZSB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZKTtcbiAgfSBjYXRjaCB7fVxufVxuXG5mdW5jdGlvbiByZWFkU3RvcmVkQ2FsbFNpZ24oKTogc3RyaW5nIHtcbiAgdHJ5IHsgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVkpID8/IFwiXCI7IH1cbiAgY2F0Y2ggeyByZXR1cm4gXCJcIjsgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7O0FBb0ZPLFdBQVMsaUJBQTJCO0FBQ3pDLFVBQU0sV0FBVyxvQkFBSSxJQUE2QjtBQUNsRCxXQUFPO0FBQUEsTUFDTCxHQUFHLE9BQU8sU0FBUztBQUNqQixZQUFJLE1BQU0sU0FBUyxJQUFJLEtBQUs7QUFDNUIsWUFBSSxDQUFDLEtBQUs7QUFDUixnQkFBTSxvQkFBSSxJQUFJO0FBQ2QsbUJBQVMsSUFBSSxPQUFPLEdBQUc7QUFBQSxRQUN6QjtBQUNBLFlBQUksSUFBSSxPQUFPO0FBQ2YsZUFBTyxNQUFNLElBQUssT0FBTyxPQUFPO0FBQUEsTUFDbEM7QUFBQSxNQUNBLEtB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QU0sQ0FBQyxZQUFZLHdCQUF3QixTQUFTLENBQUM7QUFBQSxRQUN2RDtBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFN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QUksQ0FBQyxRQUFTLFFBQU87QUFDckIsV0FBTyxRQUFRLE1BQU0sR0FBRyxFQUFFO0FBQUEsRUFDNUI7QUFFQSxXQUFTLGdCQUFnQixNQUFvQjtBQUMzQyxRQUFJO0FBQ0YsVUFBSSxLQUFNLFFBQU8sYUFBYSxRQUFRLHVCQUF1QixJQUFJO0FBQUEsVUFDNUQsUUFBTyxhQUFhLFdBQVcscUJBQXFCO0FBQUEsSUFDM0QsU0FBUTtBQUFBLElBQUM7QUFBQSxFQUNYO0FBRUEsV0FBUyxxQkFBNkI7QUF2SnRDO0FBd0pFLFFBQUk7QUFBRSxjQUFPLFlBQU8sYUFBYSxRQUFRLHFCQUFxQixNQUFqRCxZQUFzRDtBQUFBLElBQUksU0FDakU7QUFBRSxhQUFPO0FBQUEsSUFBSTtBQUFBLEVBQ3JCOyIsCiAgIm5hbWVzIjogWyJzZW5kTWVzc2FnZSIsICJfYSIsICJfYiIsICJzZW5kTWVzc2FnZSIsICJnZXRBcHByb3hTZXJ2ZXJOb3ciLCAic2VsZWN0aW9uIiwgInNlbmRNZXNzYWdlIiwgImdldEFwcHJveFNlcnZlck5vdyIsICJfYSIsICJTVFlMRV9JRCIsICJlbnN1cmVTdHlsZXMiLCAiY2hvaWNlIiwgIl9hIiwgIlNUT1JBR0VfUFJFRklYIiwgImdldFN0b3JhZ2UiLCAiY2xhbXAiLCAiY2hvaWNlIiwgIl9hIiwgInJlc3VtZUF1ZGlvIiwgIlNUT1JBR0VfUFJFRklYIiwgInN0b3JhZ2VLZXkiLCAibG9hZFByb2dyZXNzIiwgInNhdmVQcm9ncmVzcyIsICJwYXlsb2FkIl0KfQo=
