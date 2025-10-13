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
  function connectWebSocket({ room, state, bus, onStateUpdated, onOpen, mapW, mapH }) {
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    let wsUrl = `${protocol}${window.location.host}/ws?room=${encodeURIComponent(room)}`;
    if (mapW && mapW > 0) {
      wsUrl += `&mapW=${mapW}`;
    }
    if (mapH && mapH > 0) {
      wsUrl += `&mapH=${mapH}`;
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
    function drawScene() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid();
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

  // web/src/main.ts
  var CALL_SIGN_STORAGE_KEY = "lsd:callsign";
  (async function bootstrap() {
    const qs = new URLSearchParams(window.location.search);
    const room = qs.get("room") || "default";
    const mode = qs.get("mode") || "";
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
    const enableTutorial = mode === "campaign" || mode === "tutorial";
    const enableStory = mode === "campaign";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS9jb25zdGFudHMudHMiLCAic3JjL2dhbWUvY2FtZXJhLnRzIiwgInNyYy9nYW1lL2lucHV0LnRzIiwgInNyYy9yb3V0ZS50cyIsICJzcmMvZ2FtZS9sb2dpYy50cyIsICJzcmMvZ2FtZS9yZW5kZXIudHMiLCAic3JjL2dhbWUvdWkudHMiLCAic3JjL2dhbWUudHMiLCAic3JjL3R1dG9yaWFsL2hpZ2hsaWdodC50cyIsICJzcmMvdHV0b3JpYWwvc3RvcmFnZS50cyIsICJzcmMvdHV0b3JpYWwvcm9sZXMudHMiLCAic3JjL3R1dG9yaWFsL2VuZ2luZS50cyIsICJzcmMvdHV0b3JpYWwvc3RlcHNfYmFzaWMudHMiLCAic3JjL3R1dG9yaWFsL2luZGV4LnRzIiwgInNyYy9zdG9yeS9vdmVybGF5LnRzIiwgInNyYy9zdG9yeS9zdG9yYWdlLnRzIiwgInNyYy9hdWRpby9lbmdpbmUudHMiLCAic3JjL2F1ZGlvL2dyYXBoLnRzIiwgInNyYy9hdWRpby9zZngudHMiLCAic3JjL3N0b3J5L3NmeC50cyIsICJzcmMvc3RvcnkvZW5naW5lLnRzIiwgInNyYy9zdG9yeS9jaGFwdGVycy9pbnRyby50cyIsICJzcmMvc3RvcnkvaW5kZXgudHMiLCAic3JjL3N0YXJ0LWdhdGUudHMiLCAic3JjL2F1ZGlvL211c2ljL3NjZW5lcy9hbWJpZW50LnRzIiwgInNyYy9hdWRpby9tdXNpYy9pbmRleC50cyIsICJzcmMvYXVkaW8vY3Vlcy50cyIsICJzcmMvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHR5cGUgeyBNaXNzaWxlU2VsZWN0aW9uIH0gZnJvbSBcIi4vc3RhdGVcIjtcblxuZXhwb3J0IHR5cGUgU2hpcENvbnRleHQgPSBcInNoaXBcIiB8IFwibWlzc2lsZVwiO1xuZXhwb3J0IHR5cGUgU2hpcFRvb2wgPSBcInNldFwiIHwgXCJzZWxlY3RcIiB8IG51bGw7XG5leHBvcnQgdHlwZSBNaXNzaWxlVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcblxuZXhwb3J0IGludGVyZmFjZSBFdmVudE1hcCB7XG4gIFwiY29udGV4dDpjaGFuZ2VkXCI6IHsgY29udGV4dDogU2hpcENvbnRleHQgfTtcbiAgXCJzaGlwOnRvb2xDaGFuZ2VkXCI6IHsgdG9vbDogU2hpcFRvb2wgfTtcbiAgXCJzaGlwOndheXBvaW50QWRkZWRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwic2hpcDp3YXlwb2ludE1vdmVkXCI6IHsgaW5kZXg6IG51bWJlcjsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcInNoaXA6aGVhdFByb2plY3Rpb25VcGRhdGVkXCI6IHsgaGVhdFZhbHVlczogbnVtYmVyW10gfTtcbiAgXCJoZWF0Om1hcmtlckFsaWduZWRcIjogeyB2YWx1ZTogbnVtYmVyOyBtYXJrZXI6IG51bWJlciB9O1xuICBcImhlYXQ6d2FybkVudGVyZWRcIjogeyB2YWx1ZTogbnVtYmVyOyB3YXJuQXQ6IG51bWJlciB9O1xuICBcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCI6IHsgdmFsdWU6IG51bWJlcjsgd2FybkF0OiBudW1iZXIgfTtcbiAgXCJoZWF0OnN0YWxsVHJpZ2dlcmVkXCI6IHsgc3RhbGxVbnRpbDogbnVtYmVyIH07XG4gIFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCI6IHsgcGxhbm5lZDogbnVtYmVyOyBhY3R1YWw6IG51bWJlciB9O1xuICBcInVpOndheXBvaW50SG92ZXJTdGFydFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJ1aTp3YXlwb2ludEhvdmVyRW5kXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6c2VsZWN0aW9uQ2hhbmdlZFwiOiB7IHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlcjsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6YWdyb0NoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIjogeyBzZWNvbmRzUmVtYWluaW5nOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmRlbGV0ZUludm9rZWRcIjogdm9pZDtcbiAgXCJtaXNzaWxlOnByZXNldFNlbGVjdGVkXCI6IHsgcHJlc2V0TmFtZTogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpoZWF0UHJvamVjdGlvblVwZGF0ZWRcIjogeyB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47IG92ZXJoZWF0QXQ/OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOm92ZXJoZWF0ZWRcIjogeyBtaXNzaWxlSWQ6IHN0cmluZzsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJoZWxwOnZpc2libGVDaGFuZ2VkXCI6IHsgdmlzaWJsZTogYm9vbGVhbiB9O1xuICBcInN0YXRlOnVwZGF0ZWRcIjogdm9pZDtcbiAgXCJ0dXRvcmlhbDpzdGFydGVkXCI6IHsgaWQ6IHN0cmluZyB9O1xuICBcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCI6IHsgaWQ6IHN0cmluZzsgc3RlcEluZGV4OiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfTtcbiAgXCJ0dXRvcmlhbDpjb21wbGV0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c2tpcHBlZFwiOiB7IGlkOiBzdHJpbmc7IGF0U3RlcDogbnVtYmVyIH07XG4gIFwiYm90OnNwYXduUmVxdWVzdGVkXCI6IHZvaWQ7XG4gIFwiZGlhbG9ndWU6b3BlbmVkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwiZGlhbG9ndWU6Y2xvc2VkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwiZGlhbG9ndWU6Y2hvaWNlXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGNob2ljZUlkOiBzdHJpbmc7IGNoYXB0ZXJJZDogc3RyaW5nIH07XG4gIFwic3Rvcnk6ZmxhZ1VwZGF0ZWRcIjogeyBmbGFnOiBzdHJpbmc7IHZhbHVlOiBib29sZWFuIH07XG4gIFwic3Rvcnk6cHJvZ3Jlc3NlZFwiOiB7IGNoYXB0ZXJJZDogc3RyaW5nOyBub2RlSWQ6IHN0cmluZyB9O1xuICBcImF1ZGlvOnJlc3VtZVwiOiB2b2lkO1xuICBcImF1ZGlvOm11dGVcIjogdm9pZDtcbiAgXCJhdWRpbzp1bm11dGVcIjogdm9pZDtcbiAgXCJhdWRpbzpzZXQtbWFzdGVyLWdhaW5cIjogeyBnYWluOiBudW1iZXIgfTtcbiAgXCJhdWRpbzpzZnhcIjogeyBuYW1lOiBcInVpXCIgfCBcImxhc2VyXCIgfCBcInRocnVzdFwiIHwgXCJleHBsb3Npb25cIiB8IFwibG9ja1wiIHwgXCJkaWFsb2d1ZVwiOyB2ZWxvY2l0eT86IG51bWJlcjsgcGFuPzogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6c2V0LXNjZW5lXCI6IHsgc2NlbmU6IFwiYW1iaWVudFwiIHwgXCJjb21iYXRcIiB8IFwibG9iYnlcIjsgc2VlZD86IG51bWJlciB9O1xuICBcImF1ZGlvOm11c2ljOnBhcmFtXCI6IHsga2V5OiBzdHJpbmc7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzp0cmFuc3BvcnRcIjogeyBjbWQ6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJwYXVzZVwiIH07XG59XG5cbmV4cG9ydCB0eXBlIEV2ZW50S2V5ID0ga2V5b2YgRXZlbnRNYXA7XG5leHBvcnQgdHlwZSBFdmVudFBheWxvYWQ8SyBleHRlbmRzIEV2ZW50S2V5PiA9IEV2ZW50TWFwW0tdO1xuZXhwb3J0IHR5cGUgSGFuZGxlcjxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gKHBheWxvYWQ6IEV2ZW50UGF5bG9hZDxLPikgPT4gdm9pZDtcblxudHlwZSBWb2lkS2V5cyA9IHtcbiAgW0sgaW4gRXZlbnRLZXldOiBFdmVudE1hcFtLXSBleHRlbmRzIHZvaWQgPyBLIDogbmV2ZXJcbn1bRXZlbnRLZXldO1xuXG50eXBlIE5vblZvaWRLZXlzID0gRXhjbHVkZTxFdmVudEtleSwgVm9pZEtleXM+O1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50QnVzIHtcbiAgb248SyBleHRlbmRzIEV2ZW50S2V5PihldmVudDogSywgaGFuZGxlcjogSGFuZGxlcjxLPik6ICgpID0+IHZvaWQ7XG4gIGVtaXQ8SyBleHRlbmRzIE5vblZvaWRLZXlzPihldmVudDogSywgcGF5bG9hZDogRXZlbnRQYXlsb2FkPEs+KTogdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgVm9pZEtleXM+KGV2ZW50OiBLKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUV2ZW50QnVzKCk6IEV2ZW50QnVzIHtcbiAgY29uc3QgaGFuZGxlcnMgPSBuZXcgTWFwPEV2ZW50S2V5LCBTZXQ8RnVuY3Rpb24+PigpO1xuICByZXR1cm4ge1xuICAgIG9uKGV2ZW50LCBoYW5kbGVyKSB7XG4gICAgICBsZXQgc2V0ID0gaGFuZGxlcnMuZ2V0KGV2ZW50KTtcbiAgICAgIGlmICghc2V0KSB7XG4gICAgICAgIHNldCA9IG5ldyBTZXQoKTtcbiAgICAgICAgaGFuZGxlcnMuc2V0KGV2ZW50LCBzZXQpO1xuICAgICAgfVxuICAgICAgc2V0LmFkZChoYW5kbGVyKTtcbiAgICAgIHJldHVybiAoKSA9PiBzZXQhLmRlbGV0ZShoYW5kbGVyKTtcbiAgICB9LFxuICAgIGVtaXQoZXZlbnQ6IEV2ZW50S2V5LCBwYXlsb2FkPzogdW5rbm93bikge1xuICAgICAgY29uc3Qgc2V0ID0gaGFuZGxlcnMuZ2V0KGV2ZW50KTtcbiAgICAgIGlmICghc2V0IHx8IHNldC5zaXplID09PSAwKSByZXR1cm47XG4gICAgICBmb3IgKGNvbnN0IGZuIG9mIHNldCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIChmbiBhcyAodmFsdWU/OiB1bmtub3duKSA9PiB2b2lkKShwYXlsb2FkKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgW2J1c10gaGFuZGxlciBmb3IgJHtldmVudH0gZmFpbGVkYCwgZXJyKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTaGlwQ29udGV4dCwgU2hpcFRvb2wsIE1pc3NpbGVUb29sIH0gZnJvbSBcIi4vYnVzXCI7XG5cbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9TUEVFRCA9IDQwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUFYX1NQRUVEID0gMjUwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX0FHUk8gPSAxMDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfTElGRVRJTUUgPSAxMjA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fTElGRVRJTUUgPSAyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX0xJRkVUSU1FX1NQRUVEX1BFTkFMVFkgPSA4MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUEVOQUxUWSA9IDQwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19SRUYgPSAyMDAwO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVMaW1pdHMge1xuICBzcGVlZE1pbjogbnVtYmVyO1xuICBzcGVlZE1heDogbnVtYmVyO1xuICBhZ3JvTWluOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIZWF0VmlldyB7XG4gIHZhbHVlOiBudW1iZXI7XG4gIG1heDogbnVtYmVyO1xuICB3YXJuQXQ6IG51bWJlcjtcbiAgb3ZlcmhlYXRBdDogbnVtYmVyO1xuICBtYXJrZXJTcGVlZDogbnVtYmVyO1xuICBzdGFsbFVudGlsTXM6IG51bWJlcjsgLy8gY2xpZW50LXN5bmNlZCB0aW1lIGluIG1pbGxpc2Vjb25kc1xuICBrVXA6IG51bWJlcjtcbiAga0Rvd246IG51bWJlcjtcbiAgZXhwOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2hpcFNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIGhwPzogbnVtYmVyO1xuICBraWxscz86IG51bWJlcjtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xuICBjdXJyZW50V2F5cG9pbnRJbmRleD86IG51bWJlcjtcbiAgaGVhdD86IEhlYXRWaWV3O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdob3N0U25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlU25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgc2VsZj86IGJvb2xlYW47XG4gIGFncm9fcmFkaXVzOiBudW1iZXI7XG4gIGhlYXQ/OiBIZWF0VmlldzsgLy8gTWlzc2lsZSBoZWF0IGRhdGFcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIZWF0UGFyYW1zIHtcbiAgbWF4OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlQ29uZmlnIHtcbiAgc3BlZWQ6IG51bWJlcjtcbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuICBsaWZldGltZTogbnVtYmVyO1xuICBoZWF0UGFyYW1zPzogSGVhdFBhcmFtczsgLy8gT3B0aW9uYWwgY3VzdG9tIGhlYXQgY29uZmlndXJhdGlvblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVQcmVzZXQge1xuICBuYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHNwZWVkOiBudW1iZXI7XG4gIGFncm9SYWRpdXM6IG51bWJlcjtcbiAgaGVhdFBhcmFtczogSGVhdFBhcmFtcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnZlbnRvcnlJdGVtIHtcbiAgdHlwZTogc3RyaW5nO1xuICB2YXJpYW50X2lkOiBzdHJpbmc7XG4gIGhlYXRfY2FwYWNpdHk6IG51bWJlcjtcbiAgcXVhbnRpdHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnZlbnRvcnkge1xuICBpdGVtczogSW52ZW50b3J5SXRlbVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERhZ05vZGUge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBzdHJpbmc7XG4gIGxhYmVsOiBzdHJpbmc7XG4gIHN0YXR1czogc3RyaW5nOyAvLyBcImxvY2tlZFwiIHwgXCJhdmFpbGFibGVcIiB8IFwiaW5fcHJvZ3Jlc3NcIiB8IFwiY29tcGxldGVkXCJcbiAgcmVtYWluaW5nX3M6IG51bWJlcjtcbiAgZHVyYXRpb25fczogbnVtYmVyO1xuICByZXBlYXRhYmxlOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERhZ1N0YXRlIHtcbiAgbm9kZXM6IERhZ05vZGVbXTtcbn1cblxuLy8gTWlzc2lsZSBwcmVzZXQgZGVmaW5pdGlvbnMgbWF0Y2hpbmcgYmFja2VuZFxuZXhwb3J0IGNvbnN0IE1JU1NJTEVfUFJFU0VUUzogTWlzc2lsZVByZXNldFtdID0gW1xuICB7XG4gICAgbmFtZTogXCJTY291dFwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlNsb3csIGVmZmljaWVudCwgbG9uZy1yYW5nZS4gSGlnaCBoZWF0IGNhcGFjaXR5LlwiLFxuICAgIHNwZWVkOiA4MCxcbiAgICBhZ3JvUmFkaXVzOiAxNTAwLFxuICAgIGhlYXRQYXJhbXM6IHtcbiAgICAgIG1heDogNjAsXG4gICAgICB3YXJuQXQ6IDQyLFxuICAgICAgb3ZlcmhlYXRBdDogNjAsXG4gICAgICBtYXJrZXJTcGVlZDogNzAsXG4gICAgICBrVXA6IDIwLFxuICAgICAga0Rvd246IDE1LFxuICAgICAgZXhwOiAxLjUsXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiSHVudGVyXCIsXG4gICAgZGVzY3JpcHRpb246IFwiQmFsYW5jZWQgc3BlZWQgYW5kIGRldGVjdGlvbi4gU3RhbmRhcmQgaGVhdC5cIixcbiAgICBzcGVlZDogMTUwLFxuICAgIGFncm9SYWRpdXM6IDgwMCxcbiAgICBoZWF0UGFyYW1zOiB7XG4gICAgICBtYXg6IDUwLFxuICAgICAgd2FybkF0OiAzNSxcbiAgICAgIG92ZXJoZWF0QXQ6IDUwLFxuICAgICAgbWFya2VyU3BlZWQ6IDEyMCxcbiAgICAgIGtVcDogMjgsXG4gICAgICBrRG93bjogMTIsXG4gICAgICBleHA6IDEuNSxcbiAgICB9LFxuICB9LFxuICB7XG4gICAgbmFtZTogXCJTbmlwZXJcIixcbiAgICBkZXNjcmlwdGlvbjogXCJGYXN0LCBuYXJyb3cgZGV0ZWN0aW9uLiBMb3cgaGVhdCBjYXBhY2l0eS5cIixcbiAgICBzcGVlZDogMjIwLFxuICAgIGFncm9SYWRpdXM6IDMwMCxcbiAgICBoZWF0UGFyYW1zOiB7XG4gICAgICBtYXg6IDQwLFxuICAgICAgd2FybkF0OiAyOCxcbiAgICAgIG92ZXJoZWF0QXQ6IDQwLFxuICAgICAgbWFya2VyU3BlZWQ6IDE4MCxcbiAgICAgIGtVcDogMzUsXG4gICAgICBrRG93bjogOCxcbiAgICAgIGV4cDogMS41LFxuICAgIH0sXG4gIH0sXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWV0YSB7XG4gIGM/OiBudW1iZXI7XG4gIHc/OiBudW1iZXI7XG4gIGg/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBwU3RhdGUge1xuICBub3c6IG51bWJlcjtcbiAgbm93U3luY2VkQXQ6IG51bWJlcjtcbiAgbWU6IFNoaXBTbmFwc2hvdCB8IG51bGw7XG4gIGdob3N0czogR2hvc3RTbmFwc2hvdFtdO1xuICBtaXNzaWxlczogTWlzc2lsZVNuYXBzaG90W107XG4gIG1pc3NpbGVSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdO1xuICBhY3RpdmVNaXNzaWxlUm91dGVJZDogc3RyaW5nIHwgbnVsbDtcbiAgbmV4dE1pc3NpbGVSZWFkeUF0OiBudW1iZXI7XG4gIG1pc3NpbGVDb25maWc6IE1pc3NpbGVDb25maWc7XG4gIG1pc3NpbGVMaW1pdHM6IE1pc3NpbGVMaW1pdHM7XG4gIHdvcmxkTWV0YTogV29ybGRNZXRhO1xuICBpbnZlbnRvcnk6IEludmVudG9yeSB8IG51bGw7XG4gIGRhZzogRGFnU3RhdGUgfCBudWxsO1xuICBjcmFmdEhlYXRDYXBhY2l0eTogbnVtYmVyOyAvLyBIZWF0IGNhcGFjaXR5IHNsaWRlciB2YWx1ZSBmb3IgY3JhZnRpbmdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBBY3RpdmVUb29sID1cbiAgfCBcInNoaXAtc2V0XCJcbiAgfCBcInNoaXAtc2VsZWN0XCJcbiAgfCBcIm1pc3NpbGUtc2V0XCJcbiAgfCBcIm1pc3NpbGUtc2VsZWN0XCJcbiAgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVJU3RhdGUge1xuICBpbnB1dENvbnRleHQ6IFNoaXBDb250ZXh0O1xuICBzaGlwVG9vbDogU2hpcFRvb2w7XG4gIG1pc3NpbGVUb29sOiBNaXNzaWxlVG9vbDtcbiAgYWN0aXZlVG9vbDogQWN0aXZlVG9vbDtcbiAgc2hvd1NoaXBSb3V0ZTogYm9vbGVhbjtcbiAgaGVscFZpc2libGU6IGJvb2xlYW47XG4gIHpvb206IG51bWJlcjtcbiAgcGFuWDogbnVtYmVyO1xuICBwYW5ZOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpOiBVSVN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpbnB1dENvbnRleHQ6IFwic2hpcFwiLFxuICAgIHNoaXBUb29sOiBcInNldFwiLFxuICAgIG1pc3NpbGVUb29sOiBudWxsLFxuICAgIGFjdGl2ZVRvb2w6IFwic2hpcC1zZXRcIixcbiAgICBzaG93U2hpcFJvdXRlOiB0cnVlLFxuICAgIGhlbHBWaXNpYmxlOiBmYWxzZSxcbiAgICB6b29tOiAxLjAsXG4gICAgcGFuWDogMCxcbiAgICBwYW5ZOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFN0YXRlKGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogQXBwU3RhdGUge1xuICByZXR1cm4ge1xuICAgIG5vdzogMCxcbiAgICBub3dTeW5jZWRBdDogdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgPyBwZXJmb3JtYW5jZS5ub3coKVxuICAgICAgOiBEYXRlLm5vdygpLFxuICAgIG1lOiBudWxsLFxuICAgIGdob3N0czogW10sXG4gICAgbWlzc2lsZXM6IFtdLFxuICAgIG1pc3NpbGVSb3V0ZXM6IFtdLFxuICAgIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBudWxsLFxuICAgIG5leHRNaXNzaWxlUmVhZHlBdDogMCxcbiAgICBtaXNzaWxlQ29uZmlnOiB7XG4gICAgICBzcGVlZDogMTgwLFxuICAgICAgYWdyb1JhZGl1czogODAwLFxuICAgICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcigxODAsIDgwMCwgbGltaXRzKSxcbiAgICAgIGhlYXRQYXJhbXM6IE1JU1NJTEVfUFJFU0VUU1sxXS5oZWF0UGFyYW1zLCAvLyBEZWZhdWx0IHRvIEh1bnRlciBwcmVzZXRcbiAgICB9LFxuICAgIG1pc3NpbGVMaW1pdHM6IGxpbWl0cyxcbiAgICB3b3JsZE1ldGE6IHt9LFxuICAgIGludmVudG9yeTogbnVsbCxcbiAgICBkYWc6IG51bGwsXG4gICAgY3JhZnRIZWF0Q2FwYWNpdHk6IDgwLCAvLyBEZWZhdWx0IHRvIGJhc2ljIG1pc3NpbGUgaGVhdCBjYXBhY2l0eVxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXAodmFsdWU6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWlzc2lsZUxpZmV0aW1lRm9yKHNwZWVkOiBudW1iZXIsIGFncm9SYWRpdXM6IG51bWJlciwgbGltaXRzOiBNaXNzaWxlTGltaXRzID0ge1xuICBzcGVlZE1pbjogTUlTU0lMRV9NSU5fU1BFRUQsXG4gIHNwZWVkTWF4OiBNSVNTSUxFX01BWF9TUEVFRCxcbiAgYWdyb01pbjogTUlTU0lMRV9NSU5fQUdSTyxcbn0pOiBudW1iZXIge1xuICBjb25zdCBtaW5TcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluIDogTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXggOiBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgbWluQWdybyA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiA6IE1JU1NJTEVfTUlOX0FHUk87XG4gIGNvbnN0IHNwYW4gPSBtYXhTcGVlZCAtIG1pblNwZWVkO1xuICBjb25zdCBzcGVlZE5vcm0gPSBzcGFuID4gMCA/IGNsYW1wKChzcGVlZCAtIG1pblNwZWVkKSAvIHNwYW4sIDAsIDEpIDogMDtcbiAgY29uc3QgYWRqdXN0ZWRBZ3JvID0gTWF0aC5tYXgoMCwgYWdyb1JhZGl1cyAtIG1pbkFncm8pO1xuICBjb25zdCBhZ3JvTm9ybSA9IGNsYW1wKGFkanVzdGVkQWdybyAvIE1JU1NJTEVfTElGRVRJTUVfQUdST19SRUYsIDAsIDEpO1xuICBjb25zdCByZWR1Y3Rpb24gPSBzcGVlZE5vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX1NQRUVEX1BFTkFMVFkgKyBhZ3JvTm9ybSAqIE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZO1xuICBjb25zdCBiYXNlID0gTUlTU0lMRV9NQVhfTElGRVRJTUU7XG4gIHJldHVybiBjbGFtcChiYXNlIC0gcmVkdWN0aW9uLCBNSVNTSUxFX01JTl9MSUZFVElNRSwgTUlTU0lMRV9NQVhfTElGRVRJTUUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVNaXNzaWxlQ29uZmlnKFxuICBjZmc6IFBhcnRpYWw8UGljazxNaXNzaWxlQ29uZmlnLCBcInNwZWVkXCIgfCBcImFncm9SYWRpdXNcIiB8IFwiaGVhdFBhcmFtc1wiPj4sXG4gIGZhbGxiYWNrOiBNaXNzaWxlQ29uZmlnLFxuICBsaW1pdHM6IE1pc3NpbGVMaW1pdHMsXG4pOiBNaXNzaWxlQ29uZmlnIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBiYXNlID0gZmFsbGJhY2sgPz8ge1xuICAgIHNwZWVkOiBtaW5TcGVlZCxcbiAgICBhZ3JvUmFkaXVzOiBtaW5BZ3JvLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IobWluU3BlZWQsIG1pbkFncm8sIGxpbWl0cyksXG4gIH07XG4gIGNvbnN0IG1lcmdlZFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA/IChjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgOiBiYXNlLnNwZWVkO1xuICBjb25zdCBtZXJnZWRBZ3JvID0gTnVtYmVyLmlzRmluaXRlKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgPyAoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA6IGJhc2UuYWdyb1JhZGl1cztcbiAgY29uc3Qgc3BlZWQgPSBjbGFtcChtZXJnZWRTcGVlZCwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgY29uc3QgYWdyb1JhZGl1cyA9IE1hdGgubWF4KG1pbkFncm8sIG1lcmdlZEFncm8pO1xuICBjb25zdCBoZWF0UGFyYW1zID0gY2ZnLmhlYXRQYXJhbXMgPyB7IC4uLmNmZy5oZWF0UGFyYW1zIH0gOiBiYXNlLmhlYXRQYXJhbXMgPyB7IC4uLmJhc2UuaGVhdFBhcmFtcyB9IDogdW5kZWZpbmVkO1xuICByZXR1cm4ge1xuICAgIHNwZWVkLFxuICAgIGFncm9SYWRpdXMsXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihzcGVlZCwgYWdyb1JhZGl1cywgbGltaXRzKSxcbiAgICBoZWF0UGFyYW1zLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9ub3RvbmljTm93KCk6IG51bWJlciB7XG4gIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICB9XG4gIHJldHVybiBEYXRlLm5vdygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVXYXlwb2ludExpc3QobGlzdDogV2F5cG9pbnRbXSB8IHVuZGVmaW5lZCB8IG51bGwpOiBXYXlwb2ludFtdIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3QpKSByZXR1cm4gW107XG4gIHJldHVybiBsaXN0Lm1hcCgod3ApID0+ICh7IC4uLndwIH0pKTtcbn1cblxuLy8gUHJvamVjdCBoZWF0IGFsb25nIGEgbWlzc2lsZSByb3V0ZVxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGVQcm9qZWN0aW9uIHtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xuICBoZWF0QXRXYXlwb2ludHM6IG51bWJlcltdO1xuICB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47XG4gIG92ZXJoZWF0QXQ/OiBudW1iZXI7IC8vIEluZGV4IHdoZXJlIG92ZXJoZWF0IG9jY3Vyc1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdE1pc3NpbGVIZWF0KFxuICByb3V0ZTogV2F5cG9pbnRbXSxcbiAgZGVmYXVsdFNwZWVkOiBudW1iZXIsXG4gIGhlYXRQYXJhbXM6IEhlYXRQYXJhbXNcbik6IE1pc3NpbGVSb3V0ZVByb2plY3Rpb24ge1xuICBjb25zdCBwcm9qZWN0aW9uOiBNaXNzaWxlUm91dGVQcm9qZWN0aW9uID0ge1xuICAgIHdheXBvaW50czogcm91dGUsXG4gICAgaGVhdEF0V2F5cG9pbnRzOiBbXSxcbiAgICB3aWxsT3ZlcmhlYXQ6IGZhbHNlLFxuICB9O1xuXG4gIGlmIChyb3V0ZS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gcHJvamVjdGlvbjtcbiAgfVxuXG4gIGxldCBoZWF0ID0gMDsgLy8gTWlzc2lsZXMgc3RhcnQgYXQgemVybyBoZWF0XG4gIGxldCBwb3MgPSB7IHg6IHJvdXRlWzBdLngsIHk6IHJvdXRlWzBdLnkgfTtcbiAgbGV0IGN1cnJlbnRTcGVlZCA9IHJvdXRlWzBdLnNwZWVkID4gMCA/IHJvdXRlWzBdLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuXG4gIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCByb3V0ZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHRhcmdldFBvcyA9IHJvdXRlW2ldO1xuICAgIGNvbnN0IHRhcmdldFNwZWVkID0gdGFyZ2V0UG9zLnNwZWVkID4gMCA/IHRhcmdldFBvcy5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcblxuICAgIC8vIENhbGN1bGF0ZSBkaXN0YW5jZSBhbmQgdGltZVxuICAgIGNvbnN0IGR4ID0gdGFyZ2V0UG9zLnggLSBwb3MueDtcbiAgICBjb25zdCBkeSA9IHRhcmdldFBvcy55IC0gcG9zLnk7XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXG4gICAgaWYgKGRpc3RhbmNlIDwgMC4wMDEpIHtcbiAgICAgIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBBdmVyYWdlIHNwZWVkIGR1cmluZyBzZWdtZW50XG4gICAgY29uc3QgYXZnU3BlZWQgPSAoY3VycmVudFNwZWVkICsgdGFyZ2V0U3BlZWQpICogMC41O1xuICAgIGNvbnN0IHNlZ21lbnRUaW1lID0gZGlzdGFuY2UgLyBNYXRoLm1heChhdmdTcGVlZCwgMSk7XG5cbiAgICAvLyBDYWxjdWxhdGUgaGVhdCByYXRlIChtYXRjaCBzZXJ2ZXIgZm9ybXVsYSlcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KGhlYXRQYXJhbXMubWFya2VyU3BlZWQsIDAuMDAwMDAxKTtcbiAgICBjb25zdCBkZXYgPSBhdmdTcGVlZCAtIGhlYXRQYXJhbXMubWFya2VyU3BlZWQ7XG4gICAgY29uc3QgcCA9IGhlYXRQYXJhbXMuZXhwO1xuXG4gICAgbGV0IGhkb3Q6IG51bWJlcjtcbiAgICBpZiAoZGV2ID49IDApIHtcbiAgICAgIC8vIEhlYXRpbmdcbiAgICAgIGhkb3QgPSBoZWF0UGFyYW1zLmtVcCAqIE1hdGgucG93KGRldiAvIFZuLCBwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ29vbGluZ1xuICAgICAgaGRvdCA9IC1oZWF0UGFyYW1zLmtEb3duICogTWF0aC5wb3coTWF0aC5hYnMoZGV2KSAvIFZuLCBwKTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgaGVhdFxuICAgIGhlYXQgKz0gaGRvdCAqIHNlZ21lbnRUaW1lO1xuICAgIGhlYXQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihoZWF0LCBoZWF0UGFyYW1zLm1heCkpO1xuXG4gICAgcHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHMucHVzaChoZWF0KTtcbiAgICBwb3MgPSB7IHg6IHRhcmdldFBvcy54LCB5OiB0YXJnZXRQb3MueSB9O1xuICAgIGN1cnJlbnRTcGVlZCA9IHRhcmdldFNwZWVkO1xuXG4gICAgLy8gQ2hlY2sgZm9yIG92ZXJoZWF0XG4gICAgaWYgKGhlYXQgPj0gaGVhdFBhcmFtcy5vdmVyaGVhdEF0ICYmICFwcm9qZWN0aW9uLndpbGxPdmVyaGVhdCkge1xuICAgICAgcHJvamVjdGlvbi53aWxsT3ZlcmhlYXQgPSB0cnVlO1xuICAgICAgcHJvamVjdGlvbi5vdmVyaGVhdEF0ID0gaTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgcG9zaXRpb24gYW5kIHNwZWVkXG4gICAgcG9zID0gdGFyZ2V0UG9zO1xuICAgIGN1cnJlbnRTcGVlZCA9IHRhcmdldFNwZWVkO1xuICB9XG5cbiAgcmV0dXJuIHByb2plY3Rpb247XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlOiBBcHBTdGF0ZSwgbGltaXRzOiBQYXJ0aWFsPE1pc3NpbGVMaW1pdHM+KTogdm9pZCB7XG4gIHN0YXRlLm1pc3NpbGVMaW1pdHMgPSB7XG4gICAgc3BlZWRNaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4sXG4gICAgc3BlZWRNYXg6IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4ISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXgsXG4gICAgYWdyb01pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuYWdyb01pbixcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyB0eXBlIEV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQge1xuICB0eXBlIEFwcFN0YXRlLFxuICB0eXBlIE1pc3NpbGVSb3V0ZSxcbiAgbW9ub3RvbmljTm93LFxuICBzYW5pdGl6ZU1pc3NpbGVDb25maWcsXG4gIHVwZGF0ZU1pc3NpbGVMaW1pdHMsXG59IGZyb20gXCIuL3N0YXRlXCI7XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgc3BlZWQ/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlUm91dGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lPzogc3RyaW5nO1xuICB3YXlwb2ludHM/OiBTZXJ2ZXJNaXNzaWxlV2F5cG9pbnRbXTtcbn1cblxuaW50ZXJmYWNlIFNlcnZlckhlYXRWaWV3IHtcbiAgdjogbnVtYmVyOyAgLy8gY3VycmVudCBoZWF0IHZhbHVlXG4gIG06IG51bWJlcjsgIC8vIG1heFxuICB3OiBudW1iZXI7ICAvLyB3YXJuQXRcbiAgbzogbnVtYmVyOyAgLy8gb3ZlcmhlYXRBdFxuICBtczogbnVtYmVyOyAvLyBtYXJrZXJTcGVlZFxuICBzdTogbnVtYmVyOyAvLyBzdGFsbFVudGlsIChzZXJ2ZXIgdGltZSBzZWNvbmRzKVxuICBrdTogbnVtYmVyOyAvLyBrVXBcbiAga2Q6IG51bWJlcjsgLy8ga0Rvd25cbiAgZXg6IG51bWJlcjsgLy8gZXhwXG59XG5cbmludGVyZmFjZSBTZXJ2ZXJTaGlwU3RhdGUge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgaHA/OiBudW1iZXI7XG4gIGtpbGxzPzogbnVtYmVyO1xuICB3YXlwb2ludHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBzcGVlZD86IG51bWJlciB9PjtcbiAgY3VycmVudF93YXlwb2ludF9pbmRleD86IG51bWJlcjtcbiAgaGVhdD86IFNlcnZlckhlYXRWaWV3O1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIHNlbGY/OiBib29sZWFuO1xuICBhZ3JvX3JhZGl1czogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyU3RhdGVNZXNzYWdlIHtcbiAgdHlwZTogXCJzdGF0ZVwiO1xuICBub3c6IG51bWJlcjtcbiAgbmV4dF9taXNzaWxlX3JlYWR5PzogbnVtYmVyO1xuICBtZT86IFNlcnZlclNoaXBTdGF0ZSB8IG51bGw7XG4gIGdob3N0cz86IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHZ4OiBudW1iZXI7IHZ5OiBudW1iZXIgfT47XG4gIG1pc3NpbGVzPzogU2VydmVyTWlzc2lsZVN0YXRlW107XG4gIG1pc3NpbGVfcm91dGVzPzogU2VydmVyTWlzc2lsZVJvdXRlW107XG4gIG1pc3NpbGVfY29uZmlnPzoge1xuICAgIHNwZWVkPzogbnVtYmVyO1xuICAgIHNwZWVkX21pbj86IG51bWJlcjtcbiAgICBzcGVlZF9tYXg/OiBudW1iZXI7XG4gICAgYWdyb19yYWRpdXM/OiBudW1iZXI7XG4gICAgYWdyb19taW4/OiBudW1iZXI7XG4gICAgbGlmZXRpbWU/OiBudW1iZXI7XG4gICAgaGVhdF9jb25maWc/OiB7XG4gICAgICBtYXg/OiBudW1iZXI7XG4gICAgICB3YXJuX2F0PzogbnVtYmVyO1xuICAgICAgb3ZlcmhlYXRfYXQ/OiBudW1iZXI7XG4gICAgICBtYXJrZXJfc3BlZWQ/OiBudW1iZXI7XG4gICAgICBrX3VwPzogbnVtYmVyO1xuICAgICAga19kb3duPzogbnVtYmVyO1xuICAgICAgZXhwPzogbnVtYmVyO1xuICAgIH0gfCBudWxsO1xuICB9IHwgbnVsbDtcbiAgYWN0aXZlX21pc3NpbGVfcm91dGU/OiBzdHJpbmcgfCBudWxsO1xuICBtZXRhPzoge1xuICAgIGM/OiBudW1iZXI7XG4gICAgdz86IG51bWJlcjtcbiAgICBoPzogbnVtYmVyO1xuICB9O1xuICBpbnZlbnRvcnk/OiB7XG4gICAgaXRlbXM/OiBBcnJheTx7XG4gICAgICB0eXBlOiBzdHJpbmc7XG4gICAgICB2YXJpYW50X2lkOiBzdHJpbmc7XG4gICAgICBoZWF0X2NhcGFjaXR5OiBudW1iZXI7XG4gICAgICBxdWFudGl0eTogbnVtYmVyO1xuICAgIH0+O1xuICB9O1xuICBkYWc/OiB7XG4gICAgbm9kZXM/OiBBcnJheTx7XG4gICAgICBpZDogc3RyaW5nO1xuICAgICAga2luZDogc3RyaW5nO1xuICAgICAgbGFiZWw6IHN0cmluZztcbiAgICAgIHN0YXR1czogc3RyaW5nO1xuICAgICAgcmVtYWluaW5nX3M6IG51bWJlcjtcbiAgICAgIGR1cmF0aW9uX3M6IG51bWJlcjtcbiAgICAgIHJlcGVhdGFibGU6IGJvb2xlYW47XG4gICAgfT47XG4gIH07XG59XG5cbmludGVyZmFjZSBDb25uZWN0T3B0aW9ucyB7XG4gIHJvb206IHN0cmluZztcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBvblN0YXRlVXBkYXRlZD86ICgpID0+IHZvaWQ7XG4gIG9uT3Blbj86IChzb2NrZXQ6IFdlYlNvY2tldCkgPT4gdm9pZDtcbiAgbWFwVz86IG51bWJlcjtcbiAgbWFwSD86IG51bWJlcjtcbn1cblxubGV0IHdzOiBXZWJTb2NrZXQgfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIHNlbmRNZXNzYWdlKHBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcbiAgaWYgKCF3cyB8fCB3cy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikgcmV0dXJuO1xuICBjb25zdCBkYXRhID0gdHlwZW9mIHBheWxvYWQgPT09IFwic3RyaW5nXCIgPyBwYXlsb2FkIDogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCk7XG4gIHdzLnNlbmQoZGF0YSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0V2ViU29ja2V0KHsgcm9vbSwgc3RhdGUsIGJ1cywgb25TdGF0ZVVwZGF0ZWQsIG9uT3BlbiwgbWFwVywgbWFwSCB9OiBDb25uZWN0T3B0aW9ucyk6IHZvaWQge1xuICBjb25zdCBwcm90b2NvbCA9IHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gXCJodHRwczpcIiA/IFwid3NzOi8vXCIgOiBcIndzOi8vXCI7XG4gIGxldCB3c1VybCA9IGAke3Byb3RvY29sfSR7d2luZG93LmxvY2F0aW9uLmhvc3R9L3dzP3Jvb209JHtlbmNvZGVVUklDb21wb25lbnQocm9vbSl9YDtcbiAgaWYgKG1hcFcgJiYgbWFwVyA+IDApIHtcbiAgICB3c1VybCArPSBgJm1hcFc9JHttYXBXfWA7XG4gIH1cbiAgaWYgKG1hcEggJiYgbWFwSCA+IDApIHtcbiAgICB3c1VybCArPSBgJm1hcEg9JHttYXBIfWA7XG4gIH1cbiAgd3MgPSBuZXcgV2ViU29ja2V0KHdzVXJsKTtcbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm9wZW5cIiwgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFwiW3dzXSBvcGVuXCIpO1xuICAgIGNvbnN0IHNvY2tldCA9IHdzO1xuICAgIGlmIChzb2NrZXQgJiYgb25PcGVuKSB7XG4gICAgICBvbk9wZW4oc29ja2V0KTtcbiAgICB9XG4gIH0pO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwiY2xvc2VcIiwgKCkgPT4gY29uc29sZS5sb2coXCJbd3NdIGNsb3NlXCIpKTtcblxuICBsZXQgcHJldlJvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+KCk7XG4gIGxldCBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgcHJldk1pc3NpbGVDb3VudCA9IDA7XG5cbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgZGF0YSA9IHNhZmVQYXJzZShldmVudC5kYXRhKTtcbiAgICBpZiAoIWRhdGEgfHwgZGF0YS50eXBlICE9PSBcInN0YXRlXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaGFuZGxlU3RhdGVNZXNzYWdlKHN0YXRlLCBkYXRhLCBidXMsIHByZXZSb3V0ZXMsIHByZXZBY3RpdmVSb3V0ZSwgcHJldk1pc3NpbGVDb3VudCk7XG4gICAgcHJldlJvdXRlcyA9IG5ldyBNYXAoc3RhdGUubWlzc2lsZVJvdXRlcy5tYXAoKHJvdXRlKSA9PiBbcm91dGUuaWQsIGNsb25lUm91dGUocm91dGUpXSkpO1xuICAgIHByZXZBY3RpdmVSb3V0ZSA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIHByZXZNaXNzaWxlQ291bnQgPSBzdGF0ZS5taXNzaWxlcy5sZW5ndGg7XG4gICAgYnVzLmVtaXQoXCJzdGF0ZTp1cGRhdGVkXCIpO1xuICAgIG9uU3RhdGVVcGRhdGVkPy4oKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVN0YXRlTWVzc2FnZShcbiAgc3RhdGU6IEFwcFN0YXRlLFxuICBtc2c6IFNlcnZlclN0YXRlTWVzc2FnZSxcbiAgYnVzOiBFdmVudEJ1cyxcbiAgcHJldlJvdXRlczogTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPixcbiAgcHJldkFjdGl2ZVJvdXRlOiBzdHJpbmcgfCBudWxsLFxuICBwcmV2TWlzc2lsZUNvdW50OiBudW1iZXIsXG4pOiB2b2lkIHtcbiAgc3RhdGUubm93ID0gbXNnLm5vdztcbiAgc3RhdGUubm93U3luY2VkQXQgPSBtb25vdG9uaWNOb3coKTtcbiAgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0ID0gTnVtYmVyLmlzRmluaXRlKG1zZy5uZXh0X21pc3NpbGVfcmVhZHkpID8gbXNnLm5leHRfbWlzc2lsZV9yZWFkeSEgOiAwO1xuICBzdGF0ZS5tZSA9IG1zZy5tZSA/IHtcbiAgICB4OiBtc2cubWUueCxcbiAgICB5OiBtc2cubWUueSxcbiAgICB2eDogbXNnLm1lLnZ4LFxuICAgIHZ5OiBtc2cubWUudnksXG4gICAgaHA6IG1zZy5tZS5ocCxcbiAgICBraWxsczogbXNnLm1lLmtpbGxzID8/IDAsXG4gICAgd2F5cG9pbnRzOiBBcnJheS5pc0FycmF5KG1zZy5tZS53YXlwb2ludHMpXG4gICAgICA/IG1zZy5tZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHsgeDogd3AueCwgeTogd3AueSwgc3BlZWQ6IE51bWJlci5pc0Zpbml0ZSh3cC5zcGVlZCkgPyB3cC5zcGVlZCEgOiAxODAgfSkpXG4gICAgICA6IFtdLFxuICAgIGN1cnJlbnRXYXlwb2ludEluZGV4OiBtc2cubWUuY3VycmVudF93YXlwb2ludF9pbmRleCA/PyAwLFxuICAgIGhlYXQ6IG1zZy5tZS5oZWF0ID8gY29udmVydEhlYXRWaWV3KG1zZy5tZS5oZWF0LCBzdGF0ZS5ub3dTeW5jZWRBdCwgc3RhdGUubm93KSA6IHVuZGVmaW5lZCxcbiAgfSA6IG51bGw7XG4gIHN0YXRlLmdob3N0cyA9IEFycmF5LmlzQXJyYXkobXNnLmdob3N0cykgPyBtc2cuZ2hvc3RzLnNsaWNlKCkgOiBbXTtcbiAgc3RhdGUubWlzc2lsZXMgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlcykgPyBtc2cubWlzc2lsZXMuc2xpY2UoKSA6IFtdO1xuXG4gIGNvbnN0IHJvdXRlc0Zyb21TZXJ2ZXIgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlX3JvdXRlcykgPyBtc2cubWlzc2lsZV9yb3V0ZXMgOiBbXTtcbiAgY29uc3QgbmV3Um91dGVzOiBNaXNzaWxlUm91dGVbXSA9IHJvdXRlc0Zyb21TZXJ2ZXIubWFwKChyb3V0ZSkgPT4gKHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSB8fCByb3V0ZS5pZCB8fCBcIlJvdXRlXCIsXG4gICAgd2F5cG9pbnRzOiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cylcbiAgICAgID8gcm91dGUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7XG4gICAgICAgICAgeDogd3AueCxcbiAgICAgICAgICB5OiB3cC55LFxuICAgICAgICAgIHNwZWVkOiBOdW1iZXIuaXNGaW5pdGUod3Auc3BlZWQpID8gd3Auc3BlZWQhIDogc3RhdGUubWlzc2lsZUNvbmZpZy5zcGVlZCxcbiAgICAgICAgfSkpXG4gICAgICA6IFtdLFxuICB9KSk7XG5cbiAgZGlmZlJvdXRlcyhwcmV2Um91dGVzLCBuZXdSb3V0ZXMsIGJ1cyk7XG4gIHN0YXRlLm1pc3NpbGVSb3V0ZXMgPSBuZXdSb3V0ZXM7XG5cbiAgY29uc3QgbmV4dEFjdGl2ZSA9IHR5cGVvZiBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGUgPT09IFwic3RyaW5nXCIgJiYgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlLmxlbmd0aCA+IDBcbiAgICA/IG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZVxuICAgIDogbmV3Um91dGVzLmxlbmd0aCA+IDBcbiAgICAgID8gbmV3Um91dGVzWzBdLmlkXG4gICAgICA6IG51bGw7XG4gIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dEFjdGl2ZTtcbiAgaWYgKG5leHRBY3RpdmUgIT09IHByZXZBY3RpdmVSb3V0ZSkge1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIiwgeyByb3V0ZUlkOiBuZXh0QWN0aXZlID8/IG51bGwgfSk7XG4gIH1cblxuICBpZiAobXNnLm1pc3NpbGVfY29uZmlnKSB7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluKSB8fCBOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCkgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5hZ3JvX21pbikpIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGUsIHtcbiAgICAgICAgc3BlZWRNaW46IG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9taW4sXG4gICAgICAgIHNwZWVkTWF4OiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWF4LFxuICAgICAgICBhZ3JvTWluOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4sXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgcHJldkhlYXQgPSBzdGF0ZS5taXNzaWxlQ29uZmlnLmhlYXRQYXJhbXM7XG4gICAgbGV0IGhlYXRQYXJhbXM6IHsgbWF4OiBudW1iZXI7IHdhcm5BdDogbnVtYmVyOyBvdmVyaGVhdEF0OiBudW1iZXI7IG1hcmtlclNwZWVkOiBudW1iZXI7IGtVcDogbnVtYmVyOyBrRG93bjogbnVtYmVyOyBleHA6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuICAgIGNvbnN0IGhlYXRDb25maWcgPSBtc2cubWlzc2lsZV9jb25maWcuaGVhdF9jb25maWc7XG4gICAgaWYgKGhlYXRDb25maWcpIHtcbiAgICAgIGhlYXRQYXJhbXMgPSB7XG4gICAgICAgIG1heDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcubWF4KSA/IGhlYXRDb25maWcubWF4ISA6IHByZXZIZWF0Py5tYXggPz8gMCxcbiAgICAgICAgd2FybkF0OiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy53YXJuX2F0KSA/IGhlYXRDb25maWcud2Fybl9hdCEgOiBwcmV2SGVhdD8ud2FybkF0ID8/IDAsXG4gICAgICAgIG92ZXJoZWF0QXQ6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLm92ZXJoZWF0X2F0KSA/IGhlYXRDb25maWcub3ZlcmhlYXRfYXQhIDogcHJldkhlYXQ/Lm92ZXJoZWF0QXQgPz8gMCxcbiAgICAgICAgbWFya2VyU3BlZWQ6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLm1hcmtlcl9zcGVlZCkgPyBoZWF0Q29uZmlnLm1hcmtlcl9zcGVlZCEgOiBwcmV2SGVhdD8ubWFya2VyU3BlZWQgPz8gMCxcbiAgICAgICAga1VwOiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5rX3VwKSA/IGhlYXRDb25maWcua191cCEgOiBwcmV2SGVhdD8ua1VwID8/IDAsXG4gICAgICAgIGtEb3duOiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5rX2Rvd24pID8gaGVhdENvbmZpZy5rX2Rvd24hIDogcHJldkhlYXQ/LmtEb3duID8/IDAsXG4gICAgICAgIGV4cDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcuZXhwKSA/IGhlYXRDb25maWcuZXhwISA6IHByZXZIZWF0Py5leHAgPz8gMSxcbiAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyh7XG4gICAgICBzcGVlZDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkLFxuICAgICAgYWdyb1JhZGl1czogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fcmFkaXVzLFxuICAgICAgaGVhdFBhcmFtcyxcbiAgICB9LCBzdGF0ZS5taXNzaWxlQ29uZmlnLCBzdGF0ZS5taXNzaWxlTGltaXRzKTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5saWZldGltZSkpIHtcbiAgICAgIHNhbml0aXplZC5saWZldGltZSA9IG1zZy5taXNzaWxlX2NvbmZpZy5saWZldGltZSE7XG4gICAgfVxuICAgIHN0YXRlLm1pc3NpbGVDb25maWcgPSBzYW5pdGl6ZWQ7XG4gIH1cblxuICBjb25zdCBtZXRhID0gbXNnLm1ldGEgPz8ge307XG4gIGNvbnN0IGhhc0MgPSB0eXBlb2YgbWV0YS5jID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmMpO1xuICBjb25zdCBoYXNXID0gdHlwZW9mIG1ldGEudyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS53KTtcbiAgY29uc3QgaGFzSCA9IHR5cGVvZiBtZXRhLmggPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuaCk7XG4gIHN0YXRlLndvcmxkTWV0YSA9IHtcbiAgICBjOiBoYXNDID8gbWV0YS5jISA6IHN0YXRlLndvcmxkTWV0YS5jLFxuICAgIHc6IGhhc1cgPyBtZXRhLnchIDogc3RhdGUud29ybGRNZXRhLncsXG4gICAgaDogaGFzSCA/IG1ldGEuaCEgOiBzdGF0ZS53b3JsZE1ldGEuaCxcbiAgfTtcblxuICBpZiAobXNnLmludmVudG9yeSAmJiBBcnJheS5pc0FycmF5KG1zZy5pbnZlbnRvcnkuaXRlbXMpKSB7XG4gICAgc3RhdGUuaW52ZW50b3J5ID0ge1xuICAgICAgaXRlbXM6IG1zZy5pbnZlbnRvcnkuaXRlbXMubWFwKChpdGVtKSA9PiAoe1xuICAgICAgICB0eXBlOiBpdGVtLnR5cGUsXG4gICAgICAgIHZhcmlhbnRfaWQ6IGl0ZW0udmFyaWFudF9pZCxcbiAgICAgICAgaGVhdF9jYXBhY2l0eTogaXRlbS5oZWF0X2NhcGFjaXR5LFxuICAgICAgICBxdWFudGl0eTogaXRlbS5xdWFudGl0eSxcbiAgICAgIH0pKSxcbiAgICB9O1xuICB9XG5cbiAgaWYgKG1zZy5kYWcgJiYgQXJyYXkuaXNBcnJheShtc2cuZGFnLm5vZGVzKSkge1xuICAgIHN0YXRlLmRhZyA9IHtcbiAgICAgIG5vZGVzOiBtc2cuZGFnLm5vZGVzLm1hcCgobm9kZSkgPT4gKHtcbiAgICAgICAgaWQ6IG5vZGUuaWQsXG4gICAgICAgIGtpbmQ6IG5vZGUua2luZCxcbiAgICAgICAgbGFiZWw6IG5vZGUubGFiZWwsXG4gICAgICAgIHN0YXR1czogbm9kZS5zdGF0dXMsXG4gICAgICAgIHJlbWFpbmluZ19zOiBub2RlLnJlbWFpbmluZ19zLFxuICAgICAgICBkdXJhdGlvbl9zOiBub2RlLmR1cmF0aW9uX3MsXG4gICAgICAgIHJlcGVhdGFibGU6IG5vZGUucmVwZWF0YWJsZSxcbiAgICAgIH0pKSxcbiAgICB9O1xuICB9XG5cbiAgaWYgKHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA+IHByZXZNaXNzaWxlQ291bnQpIHtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZUlkID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgaWYgKGFjdGl2ZVJvdXRlSWQpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IGFjdGl2ZVJvdXRlSWQgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IFwiXCIgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY29vbGRvd25SZW1haW5pbmcgPSBNYXRoLm1heCgwLCBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpKTtcbiAgYnVzLmVtaXQoXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiLCB7IHNlY29uZHNSZW1haW5pbmc6IGNvb2xkb3duUmVtYWluaW5nIH0pO1xufVxuXG5mdW5jdGlvbiBkaWZmUm91dGVzKHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sIG5leHRSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdLCBidXM6IEV2ZW50QnVzKTogdm9pZCB7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByb3V0ZSBvZiBuZXh0Um91dGVzKSB7XG4gICAgc2Vlbi5hZGQocm91dGUuaWQpO1xuICAgIGNvbnN0IHByZXYgPSBwcmV2Um91dGVzLmdldChyb3V0ZS5pZCk7XG4gICAgaWYgKCFwcmV2KSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChyb3V0ZS5uYW1lICE9PSBwcmV2Lm5hbWUpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgbmFtZTogcm91dGUubmFtZSB9KTtcbiAgICB9XG4gICAgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPiBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgICB9IGVsc2UgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPCBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHByZXYud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfVxuICAgIGlmIChwcmV2LndheXBvaW50cy5sZW5ndGggPiAwICYmIHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgW3JvdXRlSWRdIG9mIHByZXZSb3V0ZXMpIHtcbiAgICBpZiAoIXNlZW4uaGFzKHJvdXRlSWQpKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVEZWxldGVkXCIsIHsgcm91dGVJZCB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xvbmVSb3V0ZShyb3V0ZTogTWlzc2lsZVJvdXRlKTogTWlzc2lsZVJvdXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSxcbiAgICB3YXlwb2ludHM6IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHNhZmVQYXJzZSh2YWx1ZTogdW5rbm93bik6IFNlcnZlclN0YXRlTWVzc2FnZSB8IG51bGwge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSkgYXMgU2VydmVyU3RhdGVNZXNzYWdlO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLndhcm4oXCJbd3NdIGZhaWxlZCB0byBwYXJzZSBtZXNzYWdlXCIsIGVycik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShzdGF0ZS5ub3cpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgY29uc3Qgc3luY2VkQXQgPSBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93U3luY2VkQXQpID8gc3RhdGUubm93U3luY2VkQXQgOiBudWxsO1xuICBpZiAoIXN5bmNlZEF0KSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICBjb25zdCBlbGFwc2VkTXMgPSBtb25vdG9uaWNOb3coKSAtIHN5bmNlZEF0O1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShlbGFwc2VkTXMpIHx8IGVsYXBzZWRNcyA8IDApIHtcbiAgICByZXR1cm4gc3RhdGUubm93O1xuICB9XG4gIHJldHVybiBzdGF0ZS5ub3cgKyBlbGFwc2VkTXMgLyAxMDAwO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0SGVhdFZpZXcoc2VydmVySGVhdDogU2VydmVySGVhdFZpZXcsIG5vd1N5bmNlZEF0TXM6IG51bWJlciwgc2VydmVyTm93U2VjOiBudW1iZXIpOiBpbXBvcnQoXCIuL3N0YXRlXCIpLkhlYXRWaWV3IHtcbiAgLy8gQ29udmVydCBzZXJ2ZXIgdGltZSAoc3RhbGxVbnRpbCBpbiBzZWNvbmRzKSB0byBjbGllbnQgdGltZSAobWlsbGlzZWNvbmRzKVxuICAvLyBzdGFsbFVudGlsIGlzIGFic29sdXRlIHNlcnZlciB0aW1lLCBzbyB3ZSBuZWVkIHRvIGNvbnZlcnQgaXQgdG8gY2xpZW50IHRpbWVcbiAgY29uc3Qgc2VydmVyU3RhbGxVbnRpbFNlYyA9IHNlcnZlckhlYXQuc3U7XG4gIGNvbnN0IG9mZnNldEZyb21Ob3dTZWMgPSBzZXJ2ZXJTdGFsbFVudGlsU2VjIC0gc2VydmVyTm93U2VjO1xuICBjb25zdCBzdGFsbFVudGlsTXMgPSBub3dTeW5jZWRBdE1zICsgKG9mZnNldEZyb21Ob3dTZWMgKiAxMDAwKTtcblxuICBjb25zdCBoZWF0VmlldyA9IHtcbiAgICB2YWx1ZTogc2VydmVySGVhdC52LFxuICAgIG1heDogc2VydmVySGVhdC5tLFxuICAgIHdhcm5BdDogc2VydmVySGVhdC53LFxuICAgIG92ZXJoZWF0QXQ6IHNlcnZlckhlYXQubyxcbiAgICBtYXJrZXJTcGVlZDogc2VydmVySGVhdC5tcyxcbiAgICBzdGFsbFVudGlsTXM6IHN0YWxsVW50aWxNcyxcbiAgICBrVXA6IHNlcnZlckhlYXQua3UsXG4gICAga0Rvd246IHNlcnZlckhlYXQua2QsXG4gICAgZXhwOiBzZXJ2ZXJIZWF0LmV4LFxuICB9O1xuICByZXR1cm4gaGVhdFZpZXc7XG59XG4iLCAiZXhwb3J0IGNvbnN0IE1JTl9aT09NID0gMS4wO1xuZXhwb3J0IGNvbnN0IE1BWF9aT09NID0gMy4wO1xuXG5leHBvcnQgY29uc3QgSEVMUF9URVhUID0gW1xuICBcIlByaW1hcnkgTW9kZXNcIixcbiAgXCIgIDEgXHUyMDEzIFRvZ2dsZSBzaGlwIG5hdmlnYXRpb24gbW9kZVwiLFxuICBcIiAgMiBcdTIwMTMgVG9nZ2xlIG1pc3NpbGUgY29vcmRpbmF0aW9uIG1vZGVcIixcbiAgXCJcIixcbiAgXCJTaGlwIE5hdmlnYXRpb25cIixcbiAgXCIgIFQgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgIEMgXHUyMDEzIENsZWFyIGFsbCB3YXlwb2ludHNcIixcbiAgXCIgIEggXHUyMDEzIEhvbGQgKGNsZWFyIHdheXBvaW50cyAmIHN0b3ApXCIsXG4gIFwiICBSIFx1MjAxMyBUb2dnbGUgc2hvdyByb3V0ZVwiLFxuICBcIiAgWyAvIF0gXHUyMDEzIEFkanVzdCB3YXlwb2ludCBzcGVlZFwiLFxuICBcIiAgU2hpZnQrWyAvIF0gXHUyMDEzIENvYXJzZSBzcGVlZCBhZGp1c3RcIixcbiAgXCIgIFRhYiAvIFNoaWZ0K1RhYiBcdTIwMTMgQ3ljbGUgd2F5cG9pbnRzXCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBmcm9tIHNlbGVjdGVkIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiTWlzc2lsZSBDb29yZGluYXRpb25cIixcbiAgXCIgIE4gXHUyMDEzIEFkZCBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICBcIiAgTCBcdTIwMTMgTGF1bmNoIG1pc3NpbGVzXCIsXG4gIFwiICBFIFx1MjAxMyBTd2l0Y2ggYmV0d2VlbiBzZXQvc2VsZWN0XCIsXG4gIFwiICAsIC8gLiBcdTIwMTMgQWRqdXN0IGFncm8gcmFkaXVzXCIsXG4gIFwiICA7IC8gJyBcdTIwMTMgQWRqdXN0IG1pc3NpbGUgc3BlZWRcIixcbiAgXCIgIFNoaWZ0K3NsaWRlciBrZXlzIFx1MjAxMyBDb2Fyc2UgYWRqdXN0XCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBzZWxlY3RlZCBtaXNzaWxlIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiTWFwIENvbnRyb2xzXCIsXG4gIFwiICArLy0gXHUyMDEzIFpvb20gaW4vb3V0XCIsXG4gIFwiICBDdHJsKzAgXHUyMDEzIFJlc2V0IHpvb21cIixcbiAgXCIgIE1vdXNlIHdoZWVsIFx1MjAxMyBab29tIGF0IGN1cnNvclwiLFxuICBcIiAgUGluY2ggXHUyMDEzIFpvb20gb24gdG91Y2ggZGV2aWNlc1wiLFxuICBcIlwiLFxuICBcIkdlbmVyYWxcIixcbiAgXCIgID8gXHUyMDEzIFRvZ2dsZSB0aGlzIG92ZXJsYXlcIixcbiAgXCIgIEVzYyBcdTIwMTMgQ2FuY2VsIHNlbGVjdGlvbiBvciBjbG9zZSBvdmVybGF5XCIsXG5dLmpvaW4oXCJcXG5cIik7XG4iLCAiaW1wb3J0IHR5cGUgeyBBcHBTdGF0ZSwgVUlTdGF0ZSB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi4vc3RhdGVcIjtcbmltcG9ydCB7IE1BWF9aT09NLCBNSU5fWk9PTSB9IGZyb20gXCIuL2NvbnN0YW50c1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENhbWVyYURlcGVuZGVuY2llcyB7XG4gIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIHVpU3RhdGU6IFVJU3RhdGU7XG59XG5cbmludGVyZmFjZSBXb3JsZFNpemUge1xuICB3OiBudW1iZXI7XG4gIGg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYW1lcmEge1xuICBzZXRab29tKG5ld1pvb206IG51bWJlciwgY2VudGVyWD86IG51bWJlciwgY2VudGVyWT86IG51bWJlcik6IHZvaWQ7XG4gIGdldENhbWVyYVBvc2l0aW9uKCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgd29ybGRUb0NhbnZhcyhwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG4gIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuICB1cGRhdGVXb3JsZEZyb21NZXRhKG1ldGE6IFBhcnRpYWw8V29ybGRTaXplIHwgdW5kZWZpbmVkPik6IHZvaWQ7XG4gIGdldFdvcmxkU2l6ZSgpOiBXb3JsZFNpemU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDYW1lcmEoeyBjYW52YXMsIHN0YXRlLCB1aVN0YXRlIH06IENhbWVyYURlcGVuZGVuY2llcyk6IENhbWVyYSB7XG4gIGNvbnN0IHdvcmxkOiBXb3JsZFNpemUgPSB7IHc6IDgwMDAsIGg6IDQ1MDAgfTtcblxuICBmdW5jdGlvbiByZXNvbHZlQ2FudmFzKCk6IEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbCB7XG4gICAgcmV0dXJuIGNhbnZhcyA/PyBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0Wm9vbShuZXdab29tOiBudW1iZXIsIGNlbnRlclg/OiBudW1iZXIsIGNlbnRlclk/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAvLyBjZW50ZXIgcGFyYW1ldGVycyByZXNlcnZlZCBmb3IgcG90ZW50aWFsIHNtb290aCB6b29taW5nIGxvZ2ljXG4gICAgdm9pZCBjZW50ZXJYO1xuICAgIHZvaWQgY2VudGVyWTtcbiAgICB1aVN0YXRlLnpvb20gPSBjbGFtcChuZXdab29tLCBNSU5fWk9PTSwgTUFYX1pPT00pO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0Q2FtZXJhUG9zaXRpb24oKTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgICBjb25zdCBjdiA9IHJlc29sdmVDYW52YXMoKTtcbiAgICBpZiAoIWN2KSByZXR1cm4geyB4OiB3b3JsZC53IC8gMiwgeTogd29ybGQuaCAvIDIgfTtcblxuICAgIGNvbnN0IHpvb20gPSB1aVN0YXRlLnpvb207XG5cbiAgICBsZXQgY2FtZXJhWCA9IHN0YXRlLm1lID8gc3RhdGUubWUueCA6IHdvcmxkLncgLyAyO1xuICAgIGxldCBjYW1lcmFZID0gc3RhdGUubWUgPyBzdGF0ZS5tZS55IDogd29ybGQuaCAvIDI7XG5cbiAgICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gICAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgICBjb25zdCBzY2FsZSA9IE1hdGgubWluKHNjYWxlWCwgc2NhbGVZKSAqIHpvb207XG5cbiAgICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgICBjb25zdCB2aWV3cG9ydEhlaWdodCA9IGN2LmhlaWdodCAvIHNjYWxlO1xuXG4gICAgY29uc3QgbWluQ2FtZXJhWCA9IHZpZXdwb3J0V2lkdGggLyAyO1xuICAgIGNvbnN0IG1heENhbWVyYVggPSB3b3JsZC53IC0gdmlld3BvcnRXaWR0aCAvIDI7XG4gICAgY29uc3QgbWluQ2FtZXJhWSA9IHZpZXdwb3J0SGVpZ2h0IC8gMjtcbiAgICBjb25zdCBtYXhDYW1lcmFZID0gd29ybGQuaCAtIHZpZXdwb3J0SGVpZ2h0IC8gMjtcblxuICAgIGlmICh2aWV3cG9ydFdpZHRoIDwgd29ybGQudykge1xuICAgICAgY2FtZXJhWCA9IGNsYW1wKGNhbWVyYVgsIG1pbkNhbWVyYVgsIG1heENhbWVyYVgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYW1lcmFYID0gd29ybGQudyAvIDI7XG4gICAgfVxuXG4gICAgaWYgKHZpZXdwb3J0SGVpZ2h0IDwgd29ybGQuaCkge1xuICAgICAgY2FtZXJhWSA9IGNsYW1wKGNhbWVyYVksIG1pbkNhbWVyYVksIG1heENhbWVyYVkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYW1lcmFZID0gd29ybGQuaCAvIDI7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgeDogY2FtZXJhWCwgeTogY2FtZXJhWSB9O1xuICB9XG5cbiAgZnVuY3Rpb24gd29ybGRUb0NhbnZhcyhwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICAgIGNvbnN0IGN2ID0gcmVzb2x2ZUNhbnZhcygpO1xuICAgIGlmICghY3YpIHJldHVybiB7IHg6IHAueCwgeTogcC55IH07XG5cbiAgICBjb25zdCB6b29tID0gdWlTdGF0ZS56b29tO1xuICAgIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgICBjb25zdCB3b3JsZFggPSBwLnggLSBjYW1lcmEueDtcbiAgICBjb25zdCB3b3JsZFkgPSBwLnkgLSBjYW1lcmEueTtcblxuICAgIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgICBjb25zdCBzY2FsZVkgPSBjdi5oZWlnaHQgLyB3b3JsZC5oO1xuICAgIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAgIHJldHVybiB7XG4gICAgICB4OiB3b3JsZFggKiBzY2FsZSArIGN2LndpZHRoIC8gMixcbiAgICAgIHk6IHdvcmxkWSAqIHNjYWxlICsgY3YuaGVpZ2h0IC8gMixcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gY2FudmFzVG9Xb3JsZChwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICAgIGNvbnN0IGN2ID0gcmVzb2x2ZUNhbnZhcygpO1xuICAgIGlmICghY3YpIHJldHVybiB7IHg6IHAueCwgeTogcC55IH07XG5cbiAgICBjb25zdCB6b29tID0gdWlTdGF0ZS56b29tO1xuICAgIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgICBjb25zdCBjYW52YXNYID0gcC54IC0gY3Yud2lkdGggLyAyO1xuICAgIGNvbnN0IGNhbnZhc1kgPSBwLnkgLSBjdi5oZWlnaHQgLyAyO1xuXG4gICAgY29uc3Qgc2NhbGVYID0gY3Yud2lkdGggLyB3b3JsZC53O1xuICAgIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gICAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IGNhbnZhc1ggLyBzY2FsZSArIGNhbWVyYS54LFxuICAgICAgeTogY2FudmFzWSAvIHNjYWxlICsgY2FtZXJhLnksXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVdvcmxkRnJvbU1ldGEobWV0YTogUGFydGlhbDxXb3JsZFNpemUgfCB1bmRlZmluZWQ+KTogdm9pZCB7XG4gICAgaWYgKCFtZXRhKSByZXR1cm47XG4gICAgaWYgKHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudykpIHtcbiAgICAgIHdvcmxkLncgPSBtZXRhLnc7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpKSB7XG4gICAgICB3b3JsZC5oID0gbWV0YS5oO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFdvcmxkU2l6ZSgpOiBXb3JsZFNpemUge1xuICAgIHJldHVybiB7IC4uLndvcmxkIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNldFpvb20sXG4gICAgZ2V0Q2FtZXJhUG9zaXRpb24sXG4gICAgd29ybGRUb0NhbnZhcyxcbiAgICBjYW52YXNUb1dvcmxkLFxuICAgIHVwZGF0ZVdvcmxkRnJvbU1ldGEsXG4gICAgZ2V0V29ybGRTaXplLFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBVSVN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgdHlwZSB7IENhbWVyYSB9IGZyb20gXCIuL2NhbWVyYVwiO1xuaW1wb3J0IHR5cGUgeyBMb2dpYywgUG9pbnRlclBvaW50IH0gZnJvbSBcIi4vbG9naWNcIjtcbmltcG9ydCB0eXBlIHsgVUlDb250cm9sbGVyIH0gZnJvbSBcIi4vdWlcIjtcblxuaW50ZXJmYWNlIElucHV0RGVwZW5kZW5jaWVzIHtcbiAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgdWk6IFVJQ29udHJvbGxlcjtcbiAgbG9naWM6IExvZ2ljO1xuICBjYW1lcmE6IENhbWVyYTtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnB1dENvbnRyb2xsZXIge1xuICBiaW5kSW5wdXQoKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUlucHV0KHtcbiAgY2FudmFzLFxuICB1aSxcbiAgbG9naWMsXG4gIGNhbWVyYSxcbiAgc3RhdGUsXG4gIHVpU3RhdGUsXG4gIGJ1cyxcbiAgc2VuZE1lc3NhZ2UsXG59OiBJbnB1dERlcGVuZGVuY2llcyk6IElucHV0Q29udHJvbGxlciB7XG4gIGxldCBsYXN0VG91Y2hEaXN0YW5jZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCBwZW5kaW5nVG91Y2hUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuICBsZXQgaXNQaW5jaGluZyA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGdldFBvaW50ZXJDYW52YXNQb2ludChldmVudDogUG9pbnRlckV2ZW50KTogUG9pbnRlclBvaW50IHtcbiAgICBjb25zdCByZWN0ID0gY2FudmFzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IHNjYWxlWCA9IHJlY3Qud2lkdGggIT09IDAgPyBjYW52YXMud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgICBjb25zdCBzY2FsZVkgPSByZWN0LmhlaWdodCAhPT0gMCA/IGNhbnZhcy5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IChldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0KSAqIHNjYWxlWCxcbiAgICAgIHk6IChldmVudC5jbGllbnRZIC0gcmVjdC50b3ApICogc2NhbGVZLFxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVQb2ludGVyUGxhY2VtZW50KGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQsIHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQge1xuICAgIGNvbnN0IGNvbnRleHQgPSB1aVN0YXRlLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgPyBcIm1pc3NpbGVcIiA6IFwic2hpcFwiO1xuICAgIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgbG9naWMuaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgICAgdWkucmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9naWMuaGFuZGxlU2hpcFBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgICAgdWkudXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbkNhbnZhc1BvaW50ZXJEb3duKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBjb25zdCBjYW52YXNQb2ludCA9IGdldFBvaW50ZXJDYW52YXNQb2ludChldmVudCk7XG4gICAgY29uc3Qgd29ybGRQb2ludCA9IGNhbWVyYS5jYW52YXNUb1dvcmxkKGNhbnZhc1BvaW50KTtcbiAgICBjb25zdCBjb250ZXh0ID0gdWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcblxuICAgIGlmIChjb250ZXh0ID09PSBcInNoaXBcIiAmJiB1aVN0YXRlLnNoaXBUb29sID09PSBcInNlbGVjdFwiICYmIHN0YXRlLm1lPy53YXlwb2ludHMpIHtcbiAgICAgIGNvbnN0IHdwSW5kZXggPSBsb2dpYy5maW5kV2F5cG9pbnRBdFBvc2l0aW9uKGNhbnZhc1BvaW50KTtcbiAgICAgIGlmICh3cEluZGV4ICE9PSBudWxsKSB7XG4gICAgICAgIGxvZ2ljLmJlZ2luU2hpcERyYWcod3BJbmRleCwgY2FudmFzUG9pbnQpO1xuICAgICAgICBjYW52YXMuc2V0UG9pbnRlckNhcHR1cmUoZXZlbnQucG9pbnRlcklkKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIiAmJiB1aVN0YXRlLm1pc3NpbGVUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgICBjb25zdCBoaXQgPSBsb2dpYy5oaXRUZXN0TWlzc2lsZVJvdXRlcyhjYW52YXNQb2ludCk7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIGxvZ2ljLnNldE1pc3NpbGVTZWxlY3Rpb24oaGl0LnNlbGVjdGlvbiwgaGl0LnJvdXRlLmlkKTtcbiAgICAgICAgdWkucmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICAgICAgaWYgKGhpdC5zZWxlY3Rpb24udHlwZSA9PT0gXCJ3YXlwb2ludFwiKSB7XG4gICAgICAgICAgbG9naWMuYmVnaW5NaXNzaWxlRHJhZyhoaXQuc2VsZWN0aW9uLmluZGV4LCBjYW52YXNQb2ludCk7XG4gICAgICAgICAgY2FudmFzLnNldFBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgICAgIH1cbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgIHVpLnJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnBvaW50ZXJUeXBlID09PSBcInRvdWNoXCIpIHtcbiAgICAgIGlmIChwZW5kaW5nVG91Y2hUaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgIH1cbiAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaWYgKGlzUGluY2hpbmcpIHJldHVybjtcbiAgICAgICAgaGFuZGxlUG9pbnRlclBsYWNlbWVudChjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICAgICAgfSwgMTUwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFuZGxlUG9pbnRlclBsYWNlbWVudChjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgfVxuXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlck1vdmUoZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICAgIGNvbnN0IGRyYWdnaW5nU2hpcCA9IGxvZ2ljLmdldERyYWdnZWRXYXlwb2ludCgpICE9PSBudWxsO1xuICAgIGNvbnN0IGRyYWdnaW5nTWlzc2lsZSA9IGxvZ2ljLmdldERyYWdnZWRNaXNzaWxlV2F5cG9pbnQoKSAhPT0gbnVsbDtcbiAgICBpZiAoIWRyYWdnaW5nU2hpcCAmJiAhZHJhZ2dpbmdNaXNzaWxlKSByZXR1cm47XG5cbiAgICBjb25zdCBjYW52YXNQb2ludCA9IGdldFBvaW50ZXJDYW52YXNQb2ludChldmVudCk7XG4gICAgY29uc3Qgd29ybGRQb2ludCA9IGNhbWVyYS5jYW52YXNUb1dvcmxkKGNhbnZhc1BvaW50KTtcblxuICAgIGlmIChkcmFnZ2luZ1NoaXApIHtcbiAgICAgIGxvZ2ljLnVwZGF0ZVNoaXBEcmFnKHdvcmxkUG9pbnQpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoZHJhZ2dpbmdNaXNzaWxlKSB7XG4gICAgICBsb2dpYy51cGRhdGVNaXNzaWxlRHJhZyh3b3JsZFBvaW50KTtcbiAgICAgIHVpLnJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlclVwKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBsb2dpYy5lbmREcmFnKCk7XG4gICAgaWYgKGNhbnZhcy5oYXNQb2ludGVyQ2FwdHVyZShldmVudC5wb2ludGVySWQpKSB7XG4gICAgICBjYW52YXMucmVsZWFzZVBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgfVxuICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gb25DYW52YXNXaGVlbChldmVudDogV2hlZWxFdmVudCk6IHZvaWQge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgcmVjdCA9IGNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBjZW50ZXJYID0gZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdDtcbiAgICBjb25zdCBjZW50ZXJZID0gZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wO1xuICAgIGNvbnN0IHNjYWxlWCA9IHJlY3Qud2lkdGggIT09IDAgPyBjYW52YXMud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgICBjb25zdCBzY2FsZVkgPSByZWN0LmhlaWdodCAhPT0gMCA/IGNhbnZhcy5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gICAgY29uc3QgY2FudmFzQ2VudGVyWCA9IGNlbnRlclggKiBzY2FsZVg7XG4gICAgY29uc3QgY2FudmFzQ2VudGVyWSA9IGNlbnRlclkgKiBzY2FsZVk7XG4gICAgY29uc3QgZGVsdGEgPSBldmVudC5kZWx0YVk7XG4gICAgY29uc3Qgem9vbUZhY3RvciA9IGRlbHRhID4gMCA/IDAuOSA6IDEuMTtcbiAgICBjb25zdCBuZXdab29tID0gdWlTdGF0ZS56b29tICogem9vbUZhY3RvcjtcbiAgICBjYW1lcmEuc2V0Wm9vbShuZXdab29tLCBjYW52YXNDZW50ZXJYLCBjYW52YXNDZW50ZXJZKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFRvdWNoRGlzdGFuY2UodG91Y2hlczogVG91Y2hMaXN0KTogbnVtYmVyIHwgbnVsbCB7XG4gICAgaWYgKHRvdWNoZXMubGVuZ3RoIDwgMikgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgZHggPSB0b3VjaGVzWzBdLmNsaWVudFggLSB0b3VjaGVzWzFdLmNsaWVudFg7XG4gICAgY29uc3QgZHkgPSB0b3VjaGVzWzBdLmNsaWVudFkgLSB0b3VjaGVzWzFdLmNsaWVudFk7XG4gICAgcmV0dXJuIE1hdGguaHlwb3QoZHgsIGR5KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFRvdWNoQ2VudGVyKHRvdWNoZXM6IFRvdWNoTGlzdCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB8IG51bGwge1xuICAgIGlmICh0b3VjaGVzLmxlbmd0aCA8IDIpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICB4OiAodG91Y2hlc1swXS5jbGllbnRYICsgdG91Y2hlc1sxXS5jbGllbnRYKSAvIDIsXG4gICAgICB5OiAodG91Y2hlc1swXS5jbGllbnRZICsgdG91Y2hlc1sxXS5jbGllbnRZKSAvIDIsXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2FudmFzVG91Y2hTdGFydChldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICAgIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCA9PT0gMikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGlzUGluY2hpbmcgPSB0cnVlO1xuICAgICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBnZXRUb3VjaERpc3RhbmNlKGV2ZW50LnRvdWNoZXMpO1xuICAgICAgaWYgKHBlbmRpbmdUb3VjaFRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHBlbmRpbmdUb3VjaFRpbWVvdXQpO1xuICAgICAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gbnVsbDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbkNhbnZhc1RvdWNoTW92ZShldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICAgIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCAhPT0gMikge1xuICAgICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBudWxsO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGN1cnJlbnREaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG4gICAgaWYgKGN1cnJlbnREaXN0YW5jZSA9PT0gbnVsbCB8fCBsYXN0VG91Y2hEaXN0YW5jZSA9PT0gbnVsbCkgcmV0dXJuO1xuICAgIGNvbnN0IHJlY3QgPSBjYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3QgY2VudGVyID0gZ2V0VG91Y2hDZW50ZXIoZXZlbnQudG91Y2hlcyk7XG4gICAgaWYgKCFjZW50ZXIpIHJldHVybjtcbiAgICBjb25zdCBzY2FsZVggPSByZWN0LndpZHRoICE9PSAwID8gY2FudmFzLndpZHRoIC8gcmVjdC53aWR0aCA6IDE7XG4gICAgY29uc3Qgc2NhbGVZID0gcmVjdC5oZWlnaHQgIT09IDAgPyBjYW52YXMuaGVpZ2h0IC8gcmVjdC5oZWlnaHQgOiAxO1xuICAgIGNvbnN0IGNhbnZhc0NlbnRlclggPSAoY2VudGVyLnggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICAgIGNvbnN0IGNhbnZhc0NlbnRlclkgPSAoY2VudGVyLnkgLSByZWN0LnRvcCkgKiBzY2FsZVk7XG4gICAgY29uc3Qgem9vbUZhY3RvciA9IGN1cnJlbnREaXN0YW5jZSAvIGxhc3RUb3VjaERpc3RhbmNlO1xuICAgIGNvbnN0IG5ld1pvb20gPSB1aVN0YXRlLnpvb20gKiB6b29tRmFjdG9yO1xuICAgIGNhbWVyYS5zZXRab29tKG5ld1pvb20sIGNhbnZhc0NlbnRlclgsIGNhbnZhc0NlbnRlclkpO1xuICAgIGxhc3RUb3VjaERpc3RhbmNlID0gY3VycmVudERpc3RhbmNlO1xuICB9XG5cbiAgZnVuY3Rpb24gb25DYW52YXNUb3VjaEVuZChldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICAgIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCA8IDIpIHtcbiAgICAgIGxhc3RUb3VjaERpc3RhbmNlID0gbnVsbDtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpc1BpbmNoaW5nID0gZmFsc2U7XG4gICAgICB9LCAxMDApO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUFkZE1pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJhZGRfbWlzc2lsZV9yb3V0ZVwiIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gb25XaW5kb3dLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgaXNFZGl0YWJsZSA9XG4gICAgICAhIXRhcmdldCAmJlxuICAgICAgKHRhcmdldC50YWdOYW1lID09PSBcIklOUFVUXCIgfHxcbiAgICAgICAgdGFyZ2V0LnRhZ05hbWUgPT09IFwiVEVYVEFSRUFcIiB8fFxuICAgICAgICB0YXJnZXQuaXNDb250ZW50RWRpdGFibGUpO1xuXG4gICAgaWYgKHVpU3RhdGUuaGVscFZpc2libGUgJiYgZXZlbnQua2V5ICE9PSBcIkVzY2FwZVwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChpc0VkaXRhYmxlKSB7XG4gICAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XG4gICAgICAgIHRhcmdldC5ibHVyKCk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc3dpdGNoIChldmVudC5jb2RlKSB7XG4gICAgICBjYXNlIFwiRGlnaXQxXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJEaWdpdDJcIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIktleVRcIjpcbiAgICAgICAgaWYgKHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNldFwiKSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcInNoaXAtc2VsZWN0XCIpO1xuICAgICAgICB9IGVsc2UgaWYgKHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVpLnNldEFjdGl2ZVRvb2woXCJzaGlwLXNldFwiKTtcbiAgICAgICAgfVxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiS2V5Q1wiOlxuICAgICAgY2FzZSBcIktleUhcIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgICAgbG9naWMuY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIkJyYWNrZXRMZWZ0XCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIHVpLmFkanVzdFNoaXBTcGVlZCgtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiQnJhY2tldFJpZ2h0XCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICAgIHVpLmFkanVzdFNoaXBTcGVlZCgxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJUYWJcIjpcbiAgICAgICAgdWkuc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgICAgbG9naWMuY3ljbGVTaGlwU2VsZWN0aW9uKGV2ZW50LnNoaWZ0S2V5ID8gLTEgOiAxKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIktleU5cIjpcbiAgICAgICAgaGFuZGxlQWRkTWlzc2lsZVJvdXRlKCk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJLZXlMXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIGxvZ2ljLmxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiS2V5RVwiOlxuICAgICAgICBpZiAodWlTdGF0ZS5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2V0XCIpIHtcbiAgICAgICAgICB1aS5zZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZWxlY3RcIik7XG4gICAgICAgIH0gZWxzZSBpZiAodWlTdGF0ZS5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2VsZWN0XCIpIHtcbiAgICAgICAgICB1aS5zZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdWkuc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2V0XCIpO1xuICAgICAgICB9XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJDb21tYVwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgICB1aS5hZGp1c3RNaXNzaWxlQWdybygtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiUGVyaW9kXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIHVpLmFkanVzdE1pc3NpbGVBZ3JvKDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIlNlbWljb2xvblwiOlxuICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgICB1aS5hZGp1c3RNaXNzaWxlU3BlZWQoLTEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgY2FzZSBcIlF1b3RlXCI6XG4gICAgICAgIHVpLnNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICAgIHVpLmFkanVzdE1pc3NpbGVTcGVlZCgxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIGNhc2UgXCJEZWxldGVcIjpcbiAgICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgICAgaWYgKHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIiAmJiBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCkpIHtcbiAgICAgICAgICBsb2dpYy5kZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgICB9IGVsc2UgaWYgKGxvZ2ljLmdldFNlbGVjdGlvbigpKSB7XG4gICAgICAgICAgbG9naWMuZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgICAgfVxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIFwiRXNjYXBlXCI6IHtcbiAgICAgICAgaWYgKHVpU3RhdGUuaGVscFZpc2libGUpIHtcbiAgICAgICAgICB1aS5zZXRIZWxwVmlzaWJsZShmYWxzZSk7XG4gICAgICAgIH0gZWxzZSBpZiAobG9naWMuZ2V0TWlzc2lsZVNlbGVjdGlvbigpKSB7XG4gICAgICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgICAgfSBlbHNlIGlmIChsb2dpYy5nZXRTZWxlY3Rpb24oKSkge1xuICAgICAgICAgIGxvZ2ljLnNldFNlbGVjdGlvbihudWxsKTtcbiAgICAgICAgfSBlbHNlIGlmICh1aVN0YXRlLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIpIHtcbiAgICAgICAgICB1aS5zZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgICB9XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJFcXVhbFwiOlxuICAgICAgY2FzZSBcIk51bXBhZEFkZFwiOiB7XG4gICAgICAgIGNvbnN0IGNlbnRlclggPSBjYW52YXMud2lkdGggLyAyO1xuICAgICAgICBjb25zdCBjZW50ZXJZID0gY2FudmFzLmhlaWdodCAvIDI7XG4gICAgICAgIGNhbWVyYS5zZXRab29tKHVpU3RhdGUuem9vbSAqIDEuMiwgY2VudGVyWCwgY2VudGVyWSk7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJNaW51c1wiOlxuICAgICAgY2FzZSBcIk51bXBhZFN1YnRyYWN0XCI6IHtcbiAgICAgICAgY29uc3QgY2VudGVyWCA9IGNhbnZhcy53aWR0aCAvIDI7XG4gICAgICAgIGNvbnN0IGNlbnRlclkgPSBjYW52YXMuaGVpZ2h0IC8gMjtcbiAgICAgICAgY2FtZXJhLnNldFpvb20odWlTdGF0ZS56b29tIC8gMS4yLCBjZW50ZXJYLCBjZW50ZXJZKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY2FzZSBcIkRpZ2l0MFwiOlxuICAgICAgY2FzZSBcIk51bXBhZDBcIjpcbiAgICAgICAgaWYgKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSkge1xuICAgICAgICAgIGNhbWVyYS5zZXRab29tKDEuMCk7XG4gICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgICAgdWkuc2V0SGVscFZpc2libGUoIXVpU3RhdGUuaGVscFZpc2libGUpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBiaW5kSW5wdXQoKTogdm9pZCB7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCBvbkNhbnZhc1BvaW50ZXJEb3duKTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJtb3ZlXCIsIG9uQ2FudmFzUG9pbnRlck1vdmUpO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIG9uQ2FudmFzUG9pbnRlclVwKTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJjYW5jZWxcIiwgb25DYW52YXNQb2ludGVyVXApO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwid2hlZWxcIiwgb25DYW52YXNXaGVlbCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgb25DYW52YXNUb3VjaFN0YXJ0LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIG9uQ2FudmFzVG91Y2hNb3ZlLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgb25DYW52YXNUb3VjaEVuZCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgb25XaW5kb3dLZXlEb3duLCB7IGNhcHR1cmU6IGZhbHNlIH0pO1xuXG4gICAgYnVzLm9uKFwiY29udGV4dDpjaGFuZ2VkXCIsICgpID0+IHtcbiAgICAgIGlmIChwZW5kaW5nVG91Y2hUaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgICAgcGVuZGluZ1RvdWNoVGltZW91dCA9IG51bGw7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJpbmRJbnB1dCxcbiAgfTtcbn1cbiIsICIvLyBTaGFyZWQgcm91dGUgcGxhbm5pbmcgbW9kdWxlIGZvciBzaGlwcyBhbmQgbWlzc2lsZXNcbi8vIFBoYXNlIDE6IFNoYXJlZCBNb2RlbCAmIEhlbHBlcnNcblxuaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUeXBlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgc3BlZWQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUm91dGVQb2ludHMge1xuICB3YXlwb2ludHM6IFJvdXRlV2F5cG9pbnRbXTtcbiAgd29ybGRQb2ludHM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xuICBjYW52YXNQb2ludHM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBDb25zdGFudHNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGNvbnN0IFdBWVBPSU5UX0hJVF9SQURJVVMgPSAxMjtcbmV4cG9ydCBjb25zdCBMRUdfSElUX0RJU1RBTkNFID0gMTA7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEJ1aWxkZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQnVpbGRzIHJvdXRlIHBvaW50cyBmcm9tIGEgc3RhcnQgcG9zaXRpb24gYW5kIHdheXBvaW50cy5cbiAqIEluY2x1ZGVzIHdvcmxkIGNvb3JkaW5hdGVzICh3cmFwcGluZykgYW5kIGNhbnZhcyBjb29yZGluYXRlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUm91dGVQb2ludHMoXG4gIHN0YXJ0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gIHdheXBvaW50czogUm91dGVXYXlwb2ludFtdLFxuICB3b3JsZDogeyB3OiBudW1iZXI7IGg6IG51bWJlciB9LFxuICBjYW1lcmE6ICgpID0+IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSxcbiAgem9vbTogKCkgPT4gbnVtYmVyLFxuICB3b3JsZFRvQ2FudmFzOiAocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KSA9PiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1cbik6IFJvdXRlUG9pbnRzIHtcbiAgY29uc3Qgd29ybGRQb2ludHM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdID0gW3sgeDogc3RhcnQueCwgeTogc3RhcnQueSB9XTtcblxuICBmb3IgKGNvbnN0IHdwIG9mIHdheXBvaW50cykge1xuICAgIHdvcmxkUG9pbnRzLnB1c2goeyB4OiB3cC54LCB5OiB3cC55IH0pO1xuICB9XG5cbiAgY29uc3QgY2FudmFzUG9pbnRzID0gd29ybGRQb2ludHMubWFwKChwb2ludCkgPT4gd29ybGRUb0NhbnZhcyhwb2ludCkpO1xuXG4gIHJldHVybiB7XG4gICAgd2F5cG9pbnRzOiB3YXlwb2ludHMuc2xpY2UoKSxcbiAgICB3b3JsZFBvaW50cyxcbiAgICBjYW52YXNQb2ludHMsXG4gIH07XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEdlb21ldHJ5IC8gSGl0LXRlc3Rcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkaXN0YW5jZSBmcm9tIGEgcG9pbnQgdG8gYSBsaW5lIHNlZ21lbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwb2ludFNlZ21lbnREaXN0YW5jZShcbiAgcDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICBhOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gIGI6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVxuKTogbnVtYmVyIHtcbiAgY29uc3QgYWJ4ID0gYi54IC0gYS54O1xuICBjb25zdCBhYnkgPSBiLnkgLSBhLnk7XG4gIGNvbnN0IGFweCA9IHAueCAtIGEueDtcbiAgY29uc3QgYXB5ID0gcC55IC0gYS55O1xuICBjb25zdCBhYkxlblNxID0gYWJ4ICogYWJ4ICsgYWJ5ICogYWJ5O1xuICBjb25zdCB0ID0gYWJMZW5TcSA9PT0gMCA/IDAgOiBjbGFtcChhcHggKiBhYnggKyBhcHkgKiBhYnksIDAsIGFiTGVuU3EpIC8gYWJMZW5TcTtcbiAgY29uc3QgcHJvanggPSBhLnggKyBhYnggKiB0O1xuICBjb25zdCBwcm9qeSA9IGEueSArIGFieSAqIHQ7XG4gIGNvbnN0IGR4ID0gcC54IC0gcHJvang7XG4gIGNvbnN0IGR5ID0gcC55IC0gcHJvank7XG4gIHJldHVybiBNYXRoLmh5cG90KGR4LCBkeSk7XG59XG5cbi8qKlxuICogSGl0LXRlc3RzIGEgcm91dGUgYWdhaW5zdCBhIGNhbnZhcyBwb2ludC5cbiAqIFJldHVybnMgdGhlIGhpdCB0eXBlIGFuZCBpbmRleCwgb3IgbnVsbCBpZiBubyBoaXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoaXRUZXN0Um91dGVHZW5lcmljKFxuICBjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICByb3V0ZVBvaW50czogUm91dGVQb2ludHMsXG4gIG9wdHM6IHtcbiAgICB3YXlwb2ludEhpdFJhZGl1cz86IG51bWJlcjtcbiAgICBsZWdIaXREaXN0YW5jZT86IG51bWJlcjtcbiAgICBza2lwTGVncz86IGJvb2xlYW47XG4gIH0gPSB7fVxuKTogeyB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiOyBpbmRleDogbnVtYmVyIH0gfCBudWxsIHtcbiAgY29uc3Qgd2F5cG9pbnRIaXRSYWRpdXMgPSBvcHRzLndheXBvaW50SGl0UmFkaXVzID8/IFdBWVBPSU5UX0hJVF9SQURJVVM7XG4gIGNvbnN0IGxlZ0hpdERpc3RhbmNlID0gb3B0cy5sZWdIaXREaXN0YW5jZSA/PyBMRUdfSElUX0RJU1RBTkNFO1xuICBjb25zdCBza2lwTGVncyA9IG9wdHMuc2tpcExlZ3MgPz8gZmFsc2U7XG5cbiAgY29uc3QgeyB3YXlwb2ludHMsIGNhbnZhc1BvaW50cyB9ID0gcm91dGVQb2ludHM7XG5cbiAgaWYgKHdheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIENoZWNrIHdheXBvaW50cyBmaXJzdCAoaGlnaGVyIHByaW9yaXR5IHRoYW4gbGVncylcbiAgLy8gU2tpcCBpbmRleCAwIHdoaWNoIGlzIHRoZSBzdGFydCBwb3NpdGlvblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwQ2FudmFzID0gY2FudmFzUG9pbnRzW2kgKyAxXTsgLy8gKzEgYmVjYXVzZSBmaXJzdCBwb2ludCBpcyBzdGFydCBwb3NpdGlvblxuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdwQ2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd3BDYW52YXMueTtcbiAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpIDw9IHdheXBvaW50SGl0UmFkaXVzKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG5cbiAgLy8gQ2hlY2sgbGVncyAobG93ZXIgcHJpb3JpdHkpXG4gIGlmICghc2tpcExlZ3MpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgZGlzdCA9IHBvaW50U2VnbWVudERpc3RhbmNlKGNhbnZhc1BvaW50LCBjYW52YXNQb2ludHNbaV0sIGNhbnZhc1BvaW50c1tpICsgMV0pO1xuICAgICAgaWYgKGRpc3QgPD0gbGVnSGl0RGlzdGFuY2UpIHtcbiAgICAgICAgcmV0dXJuIHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IGkgfTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRGFzaCBBbmltYXRpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBVcGRhdGVzIGRhc2ggb2Zmc2V0cyBmb3Igcm91dGUgbGVncyB0byBjcmVhdGUgbWFyY2hpbmcgYW50cyBhbmltYXRpb24uXG4gKiBNdXRhdGVzIHRoZSBwcm92aWRlZCBzdG9yZSBtYXAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlKFxuICBzdG9yZTogTWFwPG51bWJlciwgbnVtYmVyPixcbiAgd2F5cG9pbnRzOiBBcnJheTx7IHNwZWVkPzogbnVtYmVyIH0+LFxuICB3b3JsZFBvaW50czogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlciB9PixcbiAgY2FudmFzUG9pbnRzOiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0+LFxuICBmYWxsYmFja1NwZWVkOiBudW1iZXIsXG4gIGR0U2Vjb25kczogbnVtYmVyLFxuICBjeWNsZSA9IDY0XG4pOiB2b2lkIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPCAwKSB7XG4gICAgZHRTZWNvbmRzID0gMDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3AgPSB3YXlwb2ludHNbaV07XG4gICAgY29uc3Qgc3BlZWQgPSB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgJiYgd3Auc3BlZWQgPiAwID8gd3Auc3BlZWQgOiBmYWxsYmFja1NwZWVkO1xuICAgIGNvbnN0IGFXb3JsZCA9IHdvcmxkUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJXb3JsZCA9IHdvcmxkUG9pbnRzW2kgKyAxXTtcbiAgICBjb25zdCB3b3JsZERpc3QgPSBNYXRoLmh5cG90KGJXb3JsZC54IC0gYVdvcmxkLngsIGJXb3JsZC55IC0gYVdvcmxkLnkpO1xuICAgIGNvbnN0IGFDYW52YXMgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3QgYkNhbnZhcyA9IGNhbnZhc1BvaW50c1tpICsgMV07XG4gICAgY29uc3QgY2FudmFzRGlzdCA9IE1hdGguaHlwb3QoYkNhbnZhcy54IC0gYUNhbnZhcy54LCBiQ2FudmFzLnkgLSBhQ2FudmFzLnkpO1xuXG4gICAgaWYgKFxuICAgICAgIU51bWJlci5pc0Zpbml0ZShzcGVlZCkgfHxcbiAgICAgIHNwZWVkIDw9IDFlLTMgfHxcbiAgICAgICFOdW1iZXIuaXNGaW5pdGUod29ybGREaXN0KSB8fFxuICAgICAgd29ybGREaXN0IDw9IDFlLTMgfHxcbiAgICAgIGNhbnZhc0Rpc3QgPD0gMWUtM1xuICAgICkge1xuICAgICAgc3RvcmUuc2V0KGksIDApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGR0U2Vjb25kcyA8PSAwKSB7XG4gICAgICBpZiAoIXN0b3JlLmhhcyhpKSkge1xuICAgICAgICBzdG9yZS5zZXQoaSwgMCk7XG4gICAgICB9XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBzY2FsZSA9IGNhbnZhc0Rpc3QgLyB3b3JsZERpc3Q7XG4gICAgY29uc3QgZGFzaFNwZWVkID0gc3BlZWQgKiBzY2FsZTtcbiAgICBsZXQgbmV4dCA9IChzdG9yZS5nZXQoaSkgPz8gMCkgLSBkYXNoU3BlZWQgKiBkdFNlY29uZHM7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobmV4dCkpIHtcbiAgICAgIG5leHQgPSAwO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0ID0gKChuZXh0ICUgY3ljbGUpICsgY3ljbGUpICUgY3ljbGU7XG4gICAgfVxuICAgIHN0b3JlLnNldChpLCBuZXh0KTtcbiAgfVxuICAvLyBDbGVhbiB1cCBvbGQga2V5c1xuICBmb3IgKGNvbnN0IGtleSBvZiBBcnJheS5mcm9tKHN0b3JlLmtleXMoKSkpIHtcbiAgICBpZiAoa2V5ID49IHdheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHN0b3JlLmRlbGV0ZShrZXkpO1xuICAgIH1cbiAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBIZWF0IFByb2plY3Rpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGludGVyZmFjZSBIZWF0UHJvamVjdGlvblBhcmFtcyB7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbiAgbWF4OiBudW1iZXI7XG4gIG92ZXJoZWF0QXQ6IG51bWJlcjtcbiAgd2FybkF0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFByb2plY3Rpb25SZXN1bHQge1xuICBoZWF0QXRXYXlwb2ludHM6IG51bWJlcltdO1xuICB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47XG4gIG92ZXJoZWF0QXQ/OiBudW1iZXI7IC8vIEluZGV4IHdoZXJlIG92ZXJoZWF0IG9jY3Vyc1xufVxuXG4vKipcbiAqIFByb2plY3RzIGhlYXQgYWxvbmcgYSByb3V0ZSBnaXZlbiBpbml0aWFsIGhlYXQgYW5kIGhlYXQgcGFyYW1ldGVycy5cbiAqIFJldHVybnMgaGVhdCBhdCBlYWNoIHdheXBvaW50IGFuZCB3aGV0aGVyIG92ZXJoZWF0IHdpbGwgb2NjdXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0Um91dGVIZWF0KFxuICByb3V0ZTogUm91dGVXYXlwb2ludFtdLFxuICBpbml0aWFsSGVhdDogbnVtYmVyLFxuICBwYXJhbXM6IEhlYXRQcm9qZWN0aW9uUGFyYW1zXG4pOiBIZWF0UHJvamVjdGlvblJlc3VsdCB7XG4gIGNvbnN0IHJlc3VsdDogSGVhdFByb2plY3Rpb25SZXN1bHQgPSB7XG4gICAgaGVhdEF0V2F5cG9pbnRzOiBbXSxcbiAgICB3aWxsT3ZlcmhlYXQ6IGZhbHNlLFxuICB9O1xuXG4gIGlmIChyb3V0ZS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgbGV0IGhlYXQgPSBjbGFtcChpbml0aWFsSGVhdCwgMCwgcGFyYW1zLm1heCk7XG4gIGxldCBwcmV2UG9pbnQgPSB7IHg6IHJvdXRlWzBdLngsIHk6IHJvdXRlWzBdLnkgfTtcblxuICByZXN1bHQuaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCByb3V0ZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHRhcmdldFBvcyA9IHJvdXRlW2ldO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGRpc3RhbmNlIGFuZCB0aW1lXG4gICAgY29uc3QgZHggPSB0YXJnZXRQb3MueCAtIHByZXZQb2ludC54O1xuICAgIGNvbnN0IGR5ID0gdGFyZ2V0UG9zLnkgLSBwcmV2UG9pbnQueTtcbiAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG5cbiAgICBpZiAoZGlzdGFuY2UgPCAwLjAwMSkge1xuICAgICAgcmVzdWx0LmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuICAgICAgcHJldlBvaW50ID0geyB4OiB0YXJnZXRQb3MueCwgeTogdGFyZ2V0UG9zLnkgfTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHJhd1NwZWVkID0gdGFyZ2V0UG9zLnNwZWVkID8/IHBhcmFtcy5tYXJrZXJTcGVlZDtcbiAgICBjb25zdCBzZWdtZW50U3BlZWQgPSBNYXRoLm1heChyYXdTcGVlZCwgMC4wMDAwMDEpO1xuICAgIGNvbnN0IHNlZ21lbnRUaW1lID0gZGlzdGFuY2UgLyBzZWdtZW50U3BlZWQ7XG5cbiAgICAvLyBDYWxjdWxhdGUgaGVhdCByYXRlIChtYXRjaCBzZXJ2ZXIgZm9ybXVsYSlcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KHBhcmFtcy5tYXJrZXJTcGVlZCwgMC4wMDAwMDEpO1xuICAgIGNvbnN0IGRldiA9IHNlZ21lbnRTcGVlZCAtIHBhcmFtcy5tYXJrZXJTcGVlZDtcbiAgICBjb25zdCBwID0gcGFyYW1zLmV4cDtcblxuICAgIGxldCBoZG90OiBudW1iZXI7XG4gICAgaWYgKGRldiA+PSAwKSB7XG4gICAgICAvLyBIZWF0aW5nXG4gICAgICBoZG90ID0gcGFyYW1zLmtVcCAqIE1hdGgucG93KGRldiAvIFZuLCBwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ29vbGluZ1xuICAgICAgaGRvdCA9IC1wYXJhbXMua0Rvd24gKiBNYXRoLnBvdyhNYXRoLmFicyhkZXYpIC8gVm4sIHApO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBoZWF0XG4gICAgaGVhdCArPSBoZG90ICogc2VnbWVudFRpbWU7XG4gICAgaGVhdCA9IGNsYW1wKGhlYXQsIDAsIHBhcmFtcy5tYXgpO1xuXG4gICAgcmVzdWx0LmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuXG4gICAgLy8gQ2hlY2sgZm9yIG92ZXJoZWF0XG4gICAgaWYgKCFyZXN1bHQud2lsbE92ZXJoZWF0ICYmIGhlYXQgPj0gcGFyYW1zLm92ZXJoZWF0QXQpIHtcbiAgICAgIHJlc3VsdC53aWxsT3ZlcmhlYXQgPSB0cnVlO1xuICAgICAgcmVzdWx0Lm92ZXJoZWF0QXQgPSBpO1xuICAgIH1cblxuICAgIHByZXZQb2ludCA9IHsgeDogdGFyZ2V0UG9zLngsIHk6IHRhcmdldFBvcy55IH07XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIENvbXBhdGliaWxpdHkgd3JhcHBlciBmb3IgbWlzc2lsZSBoZWF0IHByb2plY3Rpb24uXG4gKiBNaXNzaWxlcyBzdGFydCBhdCB6ZXJvIGhlYXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0TWlzc2lsZUhlYXRDb21wYXQoXG4gIHJvdXRlOiBSb3V0ZVdheXBvaW50W10sXG4gIGRlZmF1bHRTcGVlZDogbnVtYmVyLFxuICBoZWF0UGFyYW1zOiBIZWF0UHJvamVjdGlvblBhcmFtc1xuKTogSGVhdFByb2plY3Rpb25SZXN1bHQge1xuICAvLyBNaXNzaWxlcyBzdGFydCBhdCB6ZXJvIGhlYXRcbiAgLy8gRW5zdXJlIGFsbCB3YXlwb2ludHMgaGF2ZSBzcGVlZCBzZXQgKHVzZSBkZWZhdWx0IGlmIG1pc3NpbmcpXG4gIGNvbnN0IHJvdXRlV2l0aFNwZWVkID0gcm91dGUubWFwKCh3cCkgPT4gKHtcbiAgICB4OiB3cC54LFxuICAgIHk6IHdwLnksXG4gICAgc3BlZWQ6IHdwLnNwZWVkID8/IGRlZmF1bHRTcGVlZCxcbiAgfSkpO1xuXG4gIHJldHVybiBwcm9qZWN0Um91dGVIZWF0KHJvdXRlV2l0aFNwZWVkLCAwLCBoZWF0UGFyYW1zKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUmVuZGVyaW5nXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogTGluZWFyIGNvbG9yIGludGVycG9sYXRpb24gYmV0d2VlbiB0d28gUkdCIGNvbG9ycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGludGVycG9sYXRlQ29sb3IoXG4gIGNvbG9yMTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuICBjb2xvcjI6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSxcbiAgdDogbnVtYmVyXG4pOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0ge1xuICByZXR1cm4gW1xuICAgIE1hdGgucm91bmQoY29sb3IxWzBdICsgKGNvbG9yMlswXSAtIGNvbG9yMVswXSkgKiB0KSxcbiAgICBNYXRoLnJvdW5kKGNvbG9yMVsxXSArIChjb2xvcjJbMV0gLSBjb2xvcjFbMV0pICogdCksXG4gICAgTWF0aC5yb3VuZChjb2xvcjFbMl0gKyAoY29sb3IyWzJdIC0gY29sb3IxWzJdKSAqIHQpLFxuICBdO1xufVxuXG4vKipcbiAqIENvbG9yIHBhbGV0dGUgZm9yIHJvdXRlIHJlbmRlcmluZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBSb3V0ZVBhbGV0dGUge1xuICAvLyBEZWZhdWx0IGxpbmUgY29sb3IgKHdoZW4gbm8gaGVhdCBkYXRhKVxuICBkZWZhdWx0TGluZTogc3RyaW5nO1xuICAvLyBTZWxlY3Rpb24gaGlnaGxpZ2h0IGNvbG9yXG4gIHNlbGVjdGlvbjogc3RyaW5nO1xuICAvLyBXYXlwb2ludCBjb2xvcnNcbiAgd2F5cG9pbnREZWZhdWx0OiBzdHJpbmc7XG4gIHdheXBvaW50U2VsZWN0ZWQ6IHN0cmluZztcbiAgd2F5cG9pbnREcmFnZ2luZz86IHN0cmluZztcbiAgd2F5cG9pbnRTdHJva2U6IHN0cmluZztcbiAgd2F5cG9pbnRTdHJva2VTZWxlY3RlZD86IHN0cmluZztcbiAgLy8gSGVhdCBncmFkaWVudCBjb2xvcnMgKGZyb20gY29vbCB0byBob3QpXG4gIGhlYXRDb29sUmdiPzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuICBoZWF0SG90UmdiPzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xufVxuXG4vKipcbiAqIERlZmF1bHQgc2hpcCBwYWxldHRlIChibHVlIHRoZW1lKS5cbiAqL1xuZXhwb3J0IGNvbnN0IFNISVBfUEFMRVRURTogUm91dGVQYWxldHRlID0ge1xuICBkZWZhdWx0TGluZTogXCIjMzhiZGY4XCIsXG4gIHNlbGVjdGlvbjogXCIjZjk3MzE2XCIsXG4gIHdheXBvaW50RGVmYXVsdDogXCIjMzhiZGY4XCIsXG4gIHdheXBvaW50U2VsZWN0ZWQ6IFwiI2Y5NzMxNlwiLFxuICB3YXlwb2ludERyYWdnaW5nOiBcIiNmYWNjMTVcIixcbiAgd2F5cG9pbnRTdHJva2U6IFwiIzBmMTcyYVwiLFxuICBoZWF0Q29vbFJnYjogWzEwMCwgMTUwLCAyNTVdLFxuICBoZWF0SG90UmdiOiBbMjU1LCA1MCwgNTBdLFxufTtcblxuLyoqXG4gKiBNaXNzaWxlIHBhbGV0dGUgKHJlZCB0aGVtZSkuXG4gKi9cbmV4cG9ydCBjb25zdCBNSVNTSUxFX1BBTEVUVEU6IFJvdXRlUGFsZXR0ZSA9IHtcbiAgZGVmYXVsdExpbmU6IFwiI2Y4NzE3MWFhXCIsXG4gIHNlbGVjdGlvbjogXCIjZjk3MzE2XCIsXG4gIHdheXBvaW50RGVmYXVsdDogXCIjZjg3MTcxXCIsXG4gIHdheXBvaW50U2VsZWN0ZWQ6IFwiI2ZhY2MxNVwiLFxuICB3YXlwb2ludFN0cm9rZTogXCIjN2YxZDFkXCIsXG4gIHdheXBvaW50U3Ryb2tlU2VsZWN0ZWQ6IFwiIzg1NGQwZVwiLFxuICBoZWF0Q29vbFJnYjogWzI0OCwgMTI5LCAxMjldLFxuICBoZWF0SG90UmdiOiBbMjIwLCAzOCwgMzhdLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBEcmF3UGxhbm5lZFJvdXRlT3B0aW9ucyB7XG4gIC8vIENhbnZhcyBwb2ludHMgZm9yIHRoZSByb3V0ZVxuICByb3V0ZVBvaW50czogUm91dGVQb2ludHM7XG4gIC8vIFNlbGVjdGlvbiBzdGF0ZSAod2hpY2ggd2F5cG9pbnQvbGVnIGlzIHNlbGVjdGVkKVxuICBzZWxlY3Rpb246IHsgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjsgaW5kZXg6IG51bWJlciB9IHwgbnVsbDtcbiAgLy8gRHJhZ2dlZCB3YXlwb2ludCBpbmRleCAoZm9yIGRyYWctYW5kLWRyb3ApXG4gIGRyYWdnZWRXYXlwb2ludD86IG51bWJlciB8IG51bGw7XG4gIC8vIERhc2ggYW5pbWF0aW9uIG9mZnNldHNcbiAgZGFzaFN0b3JlOiBNYXA8bnVtYmVyLCBudW1iZXI+O1xuICAvLyBDb2xvciBwYWxldHRlIChkZWZhdWx0cyB0byBzaGlwIHBhbGV0dGUpXG4gIHBhbGV0dGU/OiBSb3V0ZVBhbGV0dGU7XG4gIC8vIFdoZXRoZXIgdG8gc2hvdyB0aGUgcm91dGUgbGVnc1xuICBzaG93TGVnczogYm9vbGVhbjtcbiAgLy8gSGVhdCBwYXJhbWV0ZXJzIGFuZCBpbml0aWFsIGhlYXQgKG9wdGlvbmFsKVxuICBoZWF0UGFyYW1zPzogSGVhdFByb2plY3Rpb25QYXJhbXM7XG4gIGluaXRpYWxIZWF0PzogbnVtYmVyO1xuICAvLyBEZWZhdWx0IHNwZWVkIGZvciB3YXlwb2ludHMgd2l0aG91dCBzcGVlZCBzZXRcbiAgZGVmYXVsdFNwZWVkOiBudW1iZXI7XG4gIC8vIFdvcmxkIHBvaW50cyAoZm9yIGhlYXQgY2FsY3VsYXRpb24pXG4gIHdvcmxkUG9pbnRzPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9W107XG59XG5cbi8qKlxuICogRHJhd3MgYSBwbGFubmVkIHJvdXRlIChzaGlwIG9yIG1pc3NpbGUpIHdpdGggdW5pZmllZCB2aXN1YWxzLlxuICogVXNlcyBzaGlwLXN0eWxlIHJlbmRlcmluZyBieSBkZWZhdWx0LCB3aXRoIG9wdGlvbmFsIHBhbGV0dGUgb3ZlcnJpZGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkcmF3UGxhbm5lZFJvdXRlKFxuICBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcbiAgb3B0czogRHJhd1BsYW5uZWRSb3V0ZU9wdGlvbnNcbik6IHZvaWQge1xuICBjb25zdCB7XG4gICAgcm91dGVQb2ludHMsXG4gICAgc2VsZWN0aW9uLFxuICAgIGRyYWdnZWRXYXlwb2ludCxcbiAgICBkYXNoU3RvcmUsXG4gICAgcGFsZXR0ZSA9IFNISVBfUEFMRVRURSxcbiAgICBzaG93TGVncyxcbiAgICBoZWF0UGFyYW1zLFxuICAgIGluaXRpYWxIZWF0ID0gMCxcbiAgICBkZWZhdWx0U3BlZWQsXG4gICAgd29ybGRQb2ludHMsXG4gIH0gPSBvcHRzO1xuXG4gIGNvbnN0IHsgd2F5cG9pbnRzLCBjYW52YXNQb2ludHMgfSA9IHJvdXRlUG9pbnRzO1xuXG4gIGlmICh3YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQ2FsY3VsYXRlIGhlYXQgcHJvamVjdGlvbiBpZiBoZWF0IHBhcmFtcyBhdmFpbGFibGVcbiAgbGV0IGhlYXRQcm9qZWN0aW9uOiBIZWF0UHJvamVjdGlvblJlc3VsdCB8IG51bGwgPSBudWxsO1xuICBpZiAoaGVhdFBhcmFtcyAmJiB3b3JsZFBvaW50cyAmJiB3b3JsZFBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3Qgcm91dGVGb3JIZWF0OiBSb3V0ZVdheXBvaW50W10gPSB3b3JsZFBvaW50cy5tYXAoKHB0LCBpKSA9PiAoe1xuICAgICAgeDogcHQueCxcbiAgICAgIHk6IHB0LnksXG4gICAgICBzcGVlZDogaSA9PT0gMCA/IHVuZGVmaW5lZCA6IHdheXBvaW50c1tpIC0gMV0/LnNwZWVkID8/IGRlZmF1bHRTcGVlZCxcbiAgICB9KSk7XG4gICAgaGVhdFByb2plY3Rpb24gPSBwcm9qZWN0Um91dGVIZWF0KHJvdXRlRm9ySGVhdCwgaW5pdGlhbEhlYXQsIGhlYXRQYXJhbXMpO1xuICB9XG5cbiAgLy8gRHJhdyByb3V0ZSBzZWdtZW50c1xuICBpZiAoc2hvd0xlZ3MpIHtcbiAgICBsZXQgY3VycmVudEhlYXQgPSBpbml0aWFsSGVhdDtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBpc0ZpcnN0TGVnID0gaSA9PT0gMDtcbiAgICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3Rpb24/LnR5cGUgPT09IFwibGVnXCIgJiYgc2VsZWN0aW9uLmluZGV4ID09PSBpO1xuXG4gICAgICAvLyBHZXQgaGVhdCBhdCBlbmQgb2YgdGhpcyBzZWdtZW50XG4gICAgICBsZXQgc2VnbWVudEhlYXQgPSBjdXJyZW50SGVhdDtcbiAgICAgIGlmIChoZWF0UHJvamVjdGlvbiAmJiBpICsgMSA8IGhlYXRQcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgICAgc2VnbWVudEhlYXQgPSBoZWF0UHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHNbaSArIDFdO1xuICAgICAgfVxuXG4gICAgICAvLyBDYWxjdWxhdGUgaGVhdC1iYXNlZCBjb2xvciBpZiBoZWF0IGRhdGEgYXZhaWxhYmxlXG4gICAgICBsZXQgc3Ryb2tlU3R5bGU6IHN0cmluZztcbiAgICAgIGxldCBsaW5lV2lkdGg6IG51bWJlcjtcbiAgICAgIGxldCBsaW5lRGFzaDogbnVtYmVyW10gfCBudWxsID0gbnVsbDtcbiAgICAgIGxldCBhbHBoYU92ZXJyaWRlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICAgICAgaWYgKGlzU2VsZWN0ZWQpIHtcbiAgICAgICAgLy8gU2VsZWN0aW9uIHN0eWxpbmdcbiAgICAgICAgc3Ryb2tlU3R5bGUgPSBwYWxldHRlLnNlbGVjdGlvbjtcbiAgICAgICAgbGluZVdpZHRoID0gMy41O1xuICAgICAgICBsaW5lRGFzaCA9IFs0LCA0XTtcbiAgICAgIH0gZWxzZSBpZiAoaGVhdFByb2plY3Rpb24gJiYgaGVhdFBhcmFtcyAmJiBwYWxldHRlLmhlYXRDb29sUmdiICYmIHBhbGV0dGUuaGVhdEhvdFJnYikge1xuICAgICAgICAvLyBIZWF0LWJhc2VkIGNvbG9yIGludGVycG9sYXRpb24gKHNoaXAgc3R5bGUpXG4gICAgICAgIGNvbnN0IGhlYXRSYXRpbyA9IGNsYW1wKHNlZ21lbnRIZWF0IC8gaGVhdFBhcmFtcy5vdmVyaGVhdEF0LCAwLCAxKTtcbiAgICAgICAgY29uc3QgY29sb3IgPSBpbnRlcnBvbGF0ZUNvbG9yKHBhbGV0dGUuaGVhdENvb2xSZ2IsIHBhbGV0dGUuaGVhdEhvdFJnYiwgaGVhdFJhdGlvKTtcbiAgICAgICAgY29uc3QgYmFzZVdpZHRoID0gaXNGaXJzdExlZyA/IDMgOiAxLjU7XG4gICAgICAgIGxpbmVXaWR0aCA9IGJhc2VXaWR0aCArIGhlYXRSYXRpbyAqIDQ7XG4gICAgICAgIGNvbnN0IGFscGhhID0gaXNGaXJzdExlZyA/IDEgOiAwLjQ7XG4gICAgICAgIHN0cm9rZVN0eWxlID0gYHJnYmEoJHtjb2xvclswXX0sICR7Y29sb3JbMV19LCAke2NvbG9yWzJdfSwgJHthbHBoYX0pYDtcbiAgICAgICAgbGluZURhc2ggPSBpc0ZpcnN0TGVnID8gWzYsIDZdIDogWzgsIDhdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGVmYXVsdCBzdHlsaW5nIChubyBoZWF0KVxuICAgICAgICBjb25zdCBiYXNlV2lkdGggPSBpc0ZpcnN0TGVnID8gMyA6IDEuNTtcbiAgICAgICAgbGluZVdpZHRoID0gYmFzZVdpZHRoO1xuICAgICAgICBzdHJva2VTdHlsZSA9IHBhbGV0dGUuZGVmYXVsdExpbmU7XG4gICAgICAgIGxpbmVEYXNoID0gaXNGaXJzdExlZyA/IFs2LCA2XSA6IFs4LCA4XTtcbiAgICAgICAgYWxwaGFPdmVycmlkZSA9IGlzRmlyc3RMZWcgPyAxIDogMC40O1xuICAgICAgfVxuXG4gICAgICBjdHguc2F2ZSgpO1xuICAgICAgaWYgKGxpbmVEYXNoKSB7XG4gICAgICAgIGN0eC5zZXRMaW5lRGFzaChsaW5lRGFzaCk7XG4gICAgICB9XG4gICAgICBpZiAoYWxwaGFPdmVycmlkZSAhPT0gbnVsbCkge1xuICAgICAgICBjdHguZ2xvYmFsQWxwaGEgPSBhbHBoYU92ZXJyaWRlO1xuICAgICAgfVxuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gc3Ryb2tlU3R5bGU7XG4gICAgICBjdHgubGluZVdpZHRoID0gbGluZVdpZHRoO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4LmxpbmVEYXNoT2Zmc2V0ID0gZGFzaFN0b3JlLmdldChpKSA/PyAwO1xuICAgICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbaV0ueCwgY2FudmFzUG9pbnRzW2ldLnkpO1xuICAgICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbaSArIDFdLngsIGNhbnZhc1BvaW50c1tpICsgMV0ueSk7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgICBjdXJyZW50SGVhdCA9IHNlZ21lbnRIZWF0O1xuICAgIH1cbiAgfVxuXG4gIC8vIERyYXcgd2F5cG9pbnQgbWFya2Vyc1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHB0ID0gY2FudmFzUG9pbnRzW2kgKyAxXTsgLy8gKzEgYmVjYXVzZSBmaXJzdCBwb2ludCBpcyBzdGFydCBwb3NpdGlvblxuICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3Rpb24/LnR5cGUgPT09IFwid2F5cG9pbnRcIiAmJiBzZWxlY3Rpb24uaW5kZXggPT09IGk7XG4gICAgY29uc3QgaXNEcmFnZ2luZyA9IGRyYWdnZWRXYXlwb2ludCA9PT0gaTtcblxuICAgIC8vIERldGVybWluZSBmaWxsIGNvbG9yXG4gICAgbGV0IGZpbGxDb2xvcjogc3RyaW5nO1xuICAgIGlmIChpc1NlbGVjdGVkKSB7XG4gICAgICBmaWxsQ29sb3IgPSBwYWxldHRlLndheXBvaW50U2VsZWN0ZWQ7XG4gICAgfSBlbHNlIGlmIChpc0RyYWdnaW5nICYmIHBhbGV0dGUud2F5cG9pbnREcmFnZ2luZykge1xuICAgICAgZmlsbENvbG9yID0gcGFsZXR0ZS53YXlwb2ludERyYWdnaW5nO1xuICAgIH0gZWxzZSBpZiAoaGVhdFByb2plY3Rpb24gJiYgaGVhdFBhcmFtcykge1xuICAgICAgLy8gSGVhdC1iYXNlZCB3YXlwb2ludCBjb2xvcmluZyAodGhyZXNob2xkLWJhc2VkIGZvciBtaXNzaWxlcylcbiAgICAgIGNvbnN0IGhlYXQgPSBoZWF0UHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHNbaSArIDFdID8/IDA7XG4gICAgICBjb25zdCBoZWF0UmF0aW8gPSBoZWF0IC8gaGVhdFBhcmFtcy5tYXg7XG4gICAgICBjb25zdCB3YXJuUmF0aW8gPSBoZWF0UGFyYW1zLndhcm5BdCAvIGhlYXRQYXJhbXMubWF4O1xuICAgICAgY29uc3Qgb3ZlcmhlYXRSYXRpbyA9IGhlYXRQYXJhbXMub3ZlcmhlYXRBdCAvIGhlYXRQYXJhbXMubWF4O1xuXG4gICAgICBpZiAoaGVhdFJhdGlvIDwgd2FyblJhdGlvKSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiIzMzYWEzM1wiOyAvLyBHcmVlblxuICAgICAgfSBlbHNlIGlmIChoZWF0UmF0aW8gPCBvdmVyaGVhdFJhdGlvKSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiI2ZmYWEzM1wiOyAvLyBPcmFuZ2VcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiI2ZmMzMzM1wiOyAvLyBSZWRcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZmlsbENvbG9yID0gcGFsZXR0ZS53YXlwb2ludERlZmF1bHQ7XG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIHN0cm9rZSBjb2xvclxuICAgIGNvbnN0IHN0cm9rZUNvbG9yID0gaXNTZWxlY3RlZCAmJiBwYWxldHRlLndheXBvaW50U3Ryb2tlU2VsZWN0ZWRcbiAgICAgID8gcGFsZXR0ZS53YXlwb2ludFN0cm9rZVNlbGVjdGVkXG4gICAgICA6IHBhbGV0dGUud2F5cG9pbnRTdHJva2U7XG5cbiAgICAvLyBEcmF3IHdheXBvaW50XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY29uc3QgcmFkaXVzID0gaXNTZWxlY3RlZCB8fCBpc0RyYWdnaW5nID8gNyA6IDU7XG4gICAgY3R4LmFyYyhwdC54LCBwdC55LCByYWRpdXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gZmlsbENvbG9yO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IGlzU2VsZWN0ZWQgfHwgaXNEcmFnZ2luZyA/IDAuOTUgOiAwLjg7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSBpc1NlbGVjdGVkID8gMiA6IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHJva2VDb2xvcjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7XG4gIEFwcFN0YXRlLFxuICBNaXNzaWxlUm91dGUsXG4gIE1pc3NpbGVTZWxlY3Rpb24sXG4gIFNlbGVjdGlvbixcbiAgVUlTdGF0ZSxcbn0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBNSVNTSUxFX01BWF9TUEVFRCwgTUlTU0lMRV9NSU5fU1BFRUQsIGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgdHlwZSB7IFJvdXRlUG9pbnRzIH0gZnJvbSBcIi4uL3JvdXRlXCI7XG5pbXBvcnQge1xuICBXQVlQT0lOVF9ISVRfUkFESVVTLFxuICBidWlsZFJvdXRlUG9pbnRzLFxuICBoaXRUZXN0Um91dGVHZW5lcmljLFxuICB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlLFxufSBmcm9tIFwiLi4vcm91dGVcIjtcbmltcG9ydCB0eXBlIHsgQ2FtZXJhIH0gZnJvbSBcIi4vY2FtZXJhXCI7XG5cbmludGVyZmFjZSBMb2dpY0RlcGVuZGVuY2llcyB7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgc2VuZE1lc3NhZ2UocGF5bG9hZDogdW5rbm93bik6IHZvaWQ7XG4gIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXI7XG4gIGNhbWVyYTogQ2FtZXJhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBvaW50ZXJQb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExvZ2ljIHtcbiAgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB8IG51bGw7XG4gIHNldFNlbGVjdGlvbihzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwpOiB2b2lkO1xuICBnZXRNaXNzaWxlU2VsZWN0aW9uKCk6IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwsIHJvdXRlSWQ/OiBzdHJpbmcpOiB2b2lkO1xuICBnZXREZWZhdWx0U2hpcFNwZWVkKCk6IG51bWJlcjtcbiAgc2V0RGVmYXVsdFNoaXBTcGVlZCh2YWx1ZTogbnVtYmVyKTogdm9pZDtcbiAgZ2V0RGVmYXVsdE1pc3NpbGVMZWdTcGVlZCgpOiBudW1iZXI7XG4gIHJlY29yZE1pc3NpbGVMZWdTcGVlZCh2YWx1ZTogbnVtYmVyKTogdm9pZDtcbiAgZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk6IG51bWJlcjtcbiAgZGlzcGxheUluZGV4VG9BY3R1YWxJbmRleChkaXNwbGF5SW5kZXg6IG51bWJlcik6IG51bWJlcjtcbiAgYWN0dWFsSW5kZXhUb0Rpc3BsYXlJbmRleChhY3R1YWxJbmRleDogbnVtYmVyKTogbnVtYmVyO1xuICBjb21wdXRlUm91dGVQb2ludHMoKTogUm91dGVQb2ludHMgfCBudWxsO1xuICBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk6IFJvdXRlUG9pbnRzIHwgbnVsbDtcbiAgZmluZFdheXBvaW50QXRQb3NpdGlvbihjYW52YXNQb2ludDogUG9pbnRlclBvaW50KTogbnVtYmVyIHwgbnVsbDtcbiAgaGl0VGVzdFJvdXRlKGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQpOiBTZWxlY3Rpb24gfCBudWxsO1xuICBoaXRUZXN0TWlzc2lsZVJvdXRlcyhcbiAgICBjYW52YXNQb2ludDogUG9pbnRlclBvaW50XG4gICk6IHsgcm91dGU6IE1pc3NpbGVSb3V0ZTsgc2VsZWN0aW9uOiBNaXNzaWxlU2VsZWN0aW9uIH0gfCBudWxsO1xuICBzaGlwTGVnRGFzaE9mZnNldHM6IE1hcDxudW1iZXIsIG51bWJlcj47XG4gIG1pc3NpbGVMZWdEYXNoT2Zmc2V0czogTWFwPG51bWJlciwgbnVtYmVyPjtcbiAgdXBkYXRlUm91dGVBbmltYXRpb25zKGR0U2Vjb25kczogbnVtYmVyKTogdm9pZDtcbiAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk6IE1pc3NpbGVSb3V0ZSB8IG51bGw7XG4gIGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsO1xuICBjeWNsZU1pc3NpbGVSb3V0ZShkaXJlY3Rpb246IG51bWJlcik6IHZvaWQ7XG4gIGN5Y2xlU2hpcFNlbGVjdGlvbihkaXJlY3Rpb246IG51bWJlcik6IHZvaWQ7XG4gIGNsZWFyU2hpcFJvdXRlKCk6IHZvaWQ7XG4gIGRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk6IHZvaWQ7XG4gIGRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk6IHZvaWQ7XG4gIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiB2b2lkO1xuICBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludDogUG9pbnRlclBvaW50LCB3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkO1xuICBoYW5kbGVNaXNzaWxlUG9pbnRlcihjYW52YXNQb2ludDogUG9pbnRlclBvaW50LCB3b3JsZFBvaW50OiBQb2ludGVyUG9pbnQpOiB2b2lkO1xuICBiZWdpblNoaXBEcmFnKGluZGV4OiBudW1iZXIsIG9yaWdpbjogUG9pbnRlclBvaW50KTogdm9pZDtcbiAgYmVnaW5NaXNzaWxlRHJhZyhpbmRleDogbnVtYmVyLCBvcmlnaW46IFBvaW50ZXJQb2ludCk6IHZvaWQ7XG4gIHVwZGF0ZVNoaXBEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQ7XG4gIHVwZGF0ZU1pc3NpbGVEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQ7XG4gIGVuZERyYWcoKTogdm9pZDtcbiAgZ2V0RHJhZ2dlZFdheXBvaW50KCk6IG51bWJlciB8IG51bGw7XG4gIGdldERyYWdnZWRNaXNzaWxlV2F5cG9pbnQoKTogbnVtYmVyIHwgbnVsbDtcbiAgZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvZ2ljKHtcbiAgc3RhdGUsXG4gIHVpU3RhdGUsXG4gIGJ1cyxcbiAgc2VuZE1lc3NhZ2UsXG4gIGdldEFwcHJveFNlcnZlck5vdyxcbiAgY2FtZXJhLFxufTogTG9naWNEZXBlbmRlbmNpZXMpOiBMb2dpYyB7XG4gIGxldCBzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xuICBsZXQgZGVmYXVsdFNwZWVkID0gMTUwO1xuICBsZXQgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IDA7XG4gIGNvbnN0IHNoaXBMZWdEYXNoT2Zmc2V0cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gIGNvbnN0IG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gIGxldCBkcmFnZ2VkV2F5cG9pbnQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB8IG51bGwge1xuICAgIHJldHVybiBzZWxlY3Rpb247XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTZWxlY3Rpb24oc2VsOiBTZWxlY3Rpb24gfCBudWxsKTogdm9pZCB7XG4gICAgc2VsZWN0aW9uID0gc2VsO1xuICAgIGNvbnN0IGluZGV4ID0gc2VsZWN0aW9uID8gc2VsZWN0aW9uLmluZGV4IDogbnVsbDtcbiAgICBidXMuZW1pdChcInNoaXA6bGVnU2VsZWN0ZWRcIiwgeyBpbmRleCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldE1pc3NpbGVTZWxlY3Rpb24oKTogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwge1xuICAgIHJldHVybiBtaXNzaWxlU2VsZWN0aW9uO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0TWlzc2lsZVNlbGVjdGlvbihzZWw6IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsLCByb3V0ZUlkPzogc3RyaW5nKTogdm9pZCB7XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IHNlbDtcbiAgICBpZiAocm91dGVJZCkge1xuICAgICAgc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSByb3V0ZUlkO1xuICAgIH1cbiAgICBidXMuZW1pdChcIm1pc3NpbGU6c2VsZWN0aW9uQ2hhbmdlZFwiLCB7IHNlbGVjdGlvbjogbWlzc2lsZVNlbGVjdGlvbiB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldERlZmF1bHRTaGlwU3BlZWQoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gZGVmYXVsdFNwZWVkO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0RGVmYXVsdFNoaXBTcGVlZCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgZGVmYXVsdFNwZWVkID0gdmFsdWU7XG4gIH1cblxuICBmdW5jdGlvbiBnZXREZWZhdWx0TWlzc2lsZUxlZ1NwZWVkKCk6IG51bWJlciB7XG4gICAgY29uc3QgbWluU3BlZWQgPSBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWluID8/IE1JU1NJTEVfTUlOX1NQRUVEO1xuICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICBjb25zdCBiYXNlID1cbiAgICAgIGxhc3RNaXNzaWxlTGVnU3BlZWQgPiAwID8gbGFzdE1pc3NpbGVMZWdTcGVlZCA6IHN0YXRlLm1pc3NpbGVDb25maWcuc3BlZWQ7XG4gICAgcmV0dXJuIGNsYW1wKGJhc2UsIG1pblNwZWVkLCBtYXhTcGVlZCk7XG4gIH1cblxuICBmdW5jdGlvbiByZWNvcmRNaXNzaWxlTGVnU3BlZWQodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMCkge1xuICAgICAgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNoaXBXYXlwb2ludE9mZnNldCgpOiBudW1iZXIge1xuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IHN0YXRlLm1lPy5jdXJyZW50V2F5cG9pbnRJbmRleDtcbiAgICBpZiAodHlwZW9mIGN1cnJlbnRJbmRleCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUoY3VycmVudEluZGV4KSAmJiBjdXJyZW50SW5kZXggPiAwKSB7XG4gICAgICByZXR1cm4gY3VycmVudEluZGV4O1xuICAgIH1cbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoZGlzcGxheUluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBkaXNwbGF5SW5kZXggKyBnZXRTaGlwV2F5cG9pbnRPZmZzZXQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFjdHVhbEluZGV4VG9EaXNwbGF5SW5kZXgoYWN0dWFsSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3Qgb2Zmc2V0ID0gZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk7XG4gICAgcmV0dXJuIGFjdHVhbEluZGV4IC0gb2Zmc2V0O1xuICB9XG5cbiAgZnVuY3Rpb24gY29tcHV0ZVJvdXRlUG9pbnRzKCk6IFJvdXRlUG9pbnRzIHwgbnVsbCB7XG4gICAgaWYgKCFzdGF0ZS5tZSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgYWxsV2F5cG9pbnRzID0gQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpID8gc3RhdGUubWUud2F5cG9pbnRzIDogW107XG4gICAgY29uc3Qgb2Zmc2V0ID0gZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk7XG4gICAgY29uc3QgdmlzaWJsZVdheXBvaW50cyA9IG9mZnNldCA+IDAgPyBhbGxXYXlwb2ludHMuc2xpY2Uob2Zmc2V0KSA6IGFsbFdheXBvaW50cztcbiAgICBpZiAoIXZpc2libGVXYXlwb2ludHMubGVuZ3RoICYmICF1aVN0YXRlLnNob3dTaGlwUm91dGUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gYnVpbGRSb3V0ZVBvaW50cyhcbiAgICAgIHsgeDogc3RhdGUubWUueCwgeTogc3RhdGUubWUueSB9LFxuICAgICAgdmlzaWJsZVdheXBvaW50cyxcbiAgICAgIGNhbWVyYS5nZXRXb3JsZFNpemUoKSxcbiAgICAgIGNhbWVyYS5nZXRDYW1lcmFQb3NpdGlvbixcbiAgICAgICgpID0+IHVpU3RhdGUuem9vbSxcbiAgICAgIGNhbWVyYS53b3JsZFRvQ2FudmFzXG4gICAgKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKTogUm91dGVQb2ludHMgfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCAhcm91dGUud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGNvbnN0IG9yaWdpbiA9IHJvdXRlLm9yaWdpbiA/PyB7IHg6IHN0YXRlLm1lPy54ID8/IDAsIHk6IHN0YXRlLm1lPy55ID8/IDAgfTtcbiAgICByZXR1cm4gYnVpbGRSb3V0ZVBvaW50cyhcbiAgICAgIG9yaWdpbixcbiAgICAgIHJvdXRlLndheXBvaW50cyxcbiAgICAgIGNhbWVyYS5nZXRXb3JsZFNpemUoKSxcbiAgICAgIGNhbWVyYS5nZXRDYW1lcmFQb3NpdGlvbixcbiAgICAgICgpID0+IHVpU3RhdGUuem9vbSxcbiAgICAgIGNhbWVyYS53b3JsZFRvQ2FudmFzXG4gICAgKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmRXYXlwb2ludEF0UG9zaXRpb24oY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludCk6IG51bWJlciB8IG51bGwge1xuICAgIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gICAgaWYgKCFyb3V0ZSkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGVHZW5lcmljKGNhbnZhc1BvaW50LCByb3V0ZSwge1xuICAgICAgd2F5cG9pbnRSYWRpdXM6IFdBWVBPSU5UX0hJVF9SQURJVVMsXG4gICAgICBsZWdIaXRUb2xlcmFuY2U6IDAsXG4gICAgfSk7XG5cbiAgICBpZiAoIWhpdCB8fCBoaXQudHlwZSAhPT0gXCJ3YXlwb2ludFwiKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gZGlzcGxheUluZGV4VG9BY3R1YWxJbmRleChoaXQuaW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGl0VGVzdFJvdXRlKGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQpOiBTZWxlY3Rpb24gfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICAgIGlmICghcm91dGUpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBoaXRUZXN0Um91dGVHZW5lcmljKGNhbnZhc1BvaW50LCByb3V0ZSwge1xuICAgICAgd2F5cG9pbnRSYWRpdXM6IFdBWVBPSU5UX0hJVF9SQURJVVMsXG4gICAgICBsZWdIaXRUb2xlcmFuY2U6IDYsXG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBoaXRUZXN0TWlzc2lsZVJvdXRlcyhjYW52YXNQb2ludDogUG9pbnRlclBvaW50KSB7XG4gICAgY29uc3Qgcm91dGVQb2ludHMgPSBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlUG9pbnRzIHx8ICFyb3V0ZSkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGVHZW5lcmljKGNhbnZhc1BvaW50LCByb3V0ZVBvaW50cywge1xuICAgICAgd2F5cG9pbnRSYWRpdXM6IFdBWVBPSU5UX0hJVF9SQURJVVMsXG4gICAgICBsZWdIaXRUb2xlcmFuY2U6IDYsXG4gICAgfSk7XG4gICAgaWYgKCFoaXQpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3Qgc2VsZWN0aW9uID1cbiAgICAgIGhpdC50eXBlID09PSBcImxlZ1wiXG4gICAgICAgID8gKHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IGhpdC5pbmRleCB9IGFzIE1pc3NpbGVTZWxlY3Rpb24pXG4gICAgICAgIDogKHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogaGl0LmluZGV4IH0gYXMgTWlzc2lsZVNlbGVjdGlvbik7XG5cbiAgICByZXR1cm4geyByb3V0ZSwgc2VsZWN0aW9uIH07XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVSb3V0ZUFuaW1hdGlvbnMoZHRTZWNvbmRzOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBzaGlwUm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgICBpZiAoc2hpcFJvdXRlICYmIHNoaXBSb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gMCAmJiB1aVN0YXRlLnNob3dTaGlwUm91dGUpIHtcbiAgICAgIHVwZGF0ZURhc2hPZmZzZXRzRm9yUm91dGUoXG4gICAgICAgIHNoaXBMZWdEYXNoT2Zmc2V0cyxcbiAgICAgICAgc2hpcFJvdXRlLndheXBvaW50cyxcbiAgICAgICAgc2hpcFJvdXRlLndvcmxkUG9pbnRzLFxuICAgICAgICBzaGlwUm91dGUuY2FudmFzUG9pbnRzLFxuICAgICAgICBkZWZhdWx0U3BlZWQsXG4gICAgICAgIGR0U2Vjb25kc1xuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2hpcExlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgfVxuXG4gICAgY29uc3QgbWlzc2lsZVJvdXRlID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICAgIGlmIChtaXNzaWxlUm91dGUpIHtcbiAgICAgIHVwZGF0ZURhc2hPZmZzZXRzRm9yUm91dGUoXG4gICAgICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyxcbiAgICAgICAgbWlzc2lsZVJvdXRlLndheXBvaW50cyxcbiAgICAgICAgbWlzc2lsZVJvdXRlLndvcmxkUG9pbnRzLFxuICAgICAgICBtaXNzaWxlUm91dGUuY2FudmFzUG9pbnRzLFxuICAgICAgICBzdGF0ZS5taXNzaWxlQ29uZmlnLnNwZWVkLFxuICAgICAgICBkdFNlY29uZHNcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmICghcm91dGVzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoIXN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSB7XG4gICAgICBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IHJvdXRlc1swXS5pZDtcbiAgICB9XG5cbiAgICBsZXQgcm91dGUgPSByb3V0ZXMuZmluZCgocikgPT4gci5pZCA9PT0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQpIHx8IG51bGw7XG4gICAgaWYgKCFyb3V0ZSkge1xuICAgICAgcm91dGUgPSByb3V0ZXNbMF0gPz8gbnVsbDtcbiAgICAgIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcm91dGU/LmlkID8/IG51bGw7XG4gICAgfVxuICAgIHJldHVybiByb3V0ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmICghcm91dGVzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKCFzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCkge1xuICAgICAgcmV0dXJuIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gKFxuICAgICAgcm91dGVzLmZpbmQoKHIpID0+IHIuaWQgPT09IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSA/P1xuICAgICAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKClcbiAgICApO1xuICB9XG5cbiAgZnVuY3Rpb24gY3ljbGVNaXNzaWxlUm91dGUoZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmICghcm91dGVzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjdXJyZW50SW5kZXggPSByb3V0ZXMuZmluZEluZGV4KFxuICAgICAgKHJvdXRlKSA9PiByb3V0ZS5pZCA9PT0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWRcbiAgICApO1xuICAgIGNvbnN0IGJhc2VJbmRleCA9IGN1cnJlbnRJbmRleCA+PSAwID8gY3VycmVudEluZGV4IDogMDtcbiAgICBjb25zdCBuZXh0SW5kZXggPVxuICAgICAgKChiYXNlSW5kZXggKyBkaXJlY3Rpb24pICUgcm91dGVzLmxlbmd0aCArIHJvdXRlcy5sZW5ndGgpICUgcm91dGVzLmxlbmd0aDtcbiAgICBjb25zdCBuZXh0Um91dGUgPSByb3V0ZXNbbmV4dEluZGV4XTtcbiAgICBpZiAoIW5leHRSb3V0ZSkgcmV0dXJuO1xuICAgIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dFJvdXRlLmlkO1xuICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJzZXRfYWN0aXZlX21pc3NpbGVfcm91dGVcIixcbiAgICAgIHJvdXRlX2lkOiBuZXh0Um91dGUuaWQsXG4gICAgfSk7XG4gICAgYnVzLmVtaXQoXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLCB7IHJvdXRlSWQ6IG5leHRSb3V0ZS5pZCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGN5Y2xlU2hpcFNlbGVjdGlvbihkaXJlY3Rpb246IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHdwcyA9IHN0YXRlLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGUubWUud2F5cG9pbnRzKSA/IHN0YXRlLm1lLndheXBvaW50cyA6IFtdO1xuICAgIGlmICghd3BzLmxlbmd0aCkge1xuICAgICAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgaW5kZXggPSBzZWxlY3Rpb24gPyBzZWxlY3Rpb24uaW5kZXggOiBkaXJlY3Rpb24gPiAwID8gLTEgOiB3cHMubGVuZ3RoO1xuICAgIGluZGV4ICs9IGRpcmVjdGlvbjtcbiAgICBpZiAoaW5kZXggPCAwKSBpbmRleCA9IHdwcy5sZW5ndGggLSAxO1xuICAgIGlmIChpbmRleCA+PSB3cHMubGVuZ3RoKSBpbmRleCA9IDA7XG4gICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXggfSk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhclNoaXBSb3V0ZSgpOiB2b2lkIHtcbiAgICBjb25zdCB3cHMgPVxuICAgICAgc3RhdGUubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpID8gc3RhdGUubWUud2F5cG9pbnRzIDogW107XG4gICAgaWYgKCF3cHMubGVuZ3RoKSByZXR1cm47XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImNsZWFyX3dheXBvaW50c1wiIH0pO1xuICAgIGlmIChzdGF0ZS5tZSkge1xuICAgICAgc3RhdGUubWUud2F5cG9pbnRzID0gW107XG4gICAgfVxuICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgICBidXMuZW1pdChcInNoaXA6d2F5cG9pbnRzQ2xlYXJlZFwiKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk6IHZvaWQge1xuICAgIGlmICghc2VsZWN0aW9uKSByZXR1cm47XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRlbGV0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICAgIGlmIChzdGF0ZS5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlLm1lLndheXBvaW50cykpIHtcbiAgICAgIHN0YXRlLm1lLndheXBvaW50cyA9IHN0YXRlLm1lLndheXBvaW50cy5zbGljZSgwLCBzZWxlY3Rpb24uaW5kZXgpO1xuICAgIH1cbiAgICBidXMuZW1pdChcInNoaXA6d2F5cG9pbnREZWxldGVkXCIsIHsgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCB9KTtcbiAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIH1cblxuICBmdW5jdGlvbiBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpOiB2b2lkIHtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUgfHwgIW1pc3NpbGVTZWxlY3Rpb24pIHJldHVybjtcbiAgICBjb25zdCBpbmRleCA9IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXg7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJkZWxldGVfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgaW5kZXgsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gW1xuICAgICAgLi4ucm91dGUud2F5cG9pbnRzLnNsaWNlKDAsIGluZGV4KSxcbiAgICAgIC4uLnJvdXRlLndheXBvaW50cy5zbGljZShpbmRleCArIDEpLFxuICAgIF07XG4gICAgYnVzLmVtaXQoXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleCB9KTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICB9XG5cbiAgZnVuY3Rpb24gbGF1bmNoQWN0aXZlTWlzc2lsZVJvdXRlKCk6IHZvaWQge1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZygpID4gMC4wNSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHBsYXllciBoYXMgbWlzc2lsZXMgaW4gaW52ZW50b3J5XG4gICAgbGV0IGhhc01pc3NpbGVzID0gZmFsc2U7XG4gICAgaWYgKHN0YXRlLmludmVudG9yeT8uaXRlbXMpIHtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBzdGF0ZS5pbnZlbnRvcnkuaXRlbXMpIHtcbiAgICAgICAgaWYgKGl0ZW0udHlwZSA9PT0gXCJtaXNzaWxlXCIgJiYgaXRlbS5xdWFudGl0eSA+IDApIHtcbiAgICAgICAgICBoYXNNaXNzaWxlcyA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFoYXNNaXNzaWxlcykge1xuICAgICAgY29uc29sZS5sb2coXCJObyBtaXNzaWxlcyBhdmFpbGFibGUgLSBjcmFmdCBtaXNzaWxlcyBmaXJzdFwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJsYXVuY2hfbWlzc2lsZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlU2hpcFBvaW50ZXIoXG4gICAgY2FudmFzUG9pbnQ6IFBvaW50ZXJQb2ludCxcbiAgICB3b3JsZFBvaW50OiBQb2ludGVyUG9pbnRcbiAgKTogdm9pZCB7XG4gICAgaWYgKCFzdGF0ZS5tZSkgcmV0dXJuO1xuICAgIGlmICh1aVN0YXRlLnNoaXBUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGUoY2FudmFzUG9pbnQpO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBjb25zdCBhY3R1YWxJbmRleCA9IGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoaGl0LmluZGV4KTtcbiAgICAgICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogaGl0LnR5cGUsIGluZGV4OiBhY3R1YWxJbmRleCB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkOiBkZWZhdWx0U3BlZWQgfTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImFkZF93YXlwb2ludFwiLFxuICAgICAgeDogd3AueCxcbiAgICAgIHk6IHdwLnksXG4gICAgICBzcGVlZDogZGVmYXVsdFNwZWVkLFxuICAgIH0pO1xuICAgIGNvbnN0IHdwcyA9IEFycmF5LmlzQXJyYXkoc3RhdGUubWUud2F5cG9pbnRzKVxuICAgICAgPyBzdGF0ZS5tZS53YXlwb2ludHMuc2xpY2UoKVxuICAgICAgOiBbXTtcbiAgICB3cHMucHVzaCh3cCk7XG4gICAgc3RhdGUubWUud2F5cG9pbnRzID0gd3BzO1xuICAgIGJ1cy5lbWl0KFwic2hpcDp3YXlwb2ludEFkZGVkXCIsIHsgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1pc3NpbGVQb2ludGVyKFxuICAgIGNhbnZhc1BvaW50OiBQb2ludGVyUG9pbnQsXG4gICAgd29ybGRQb2ludDogUG9pbnRlclBvaW50XG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSkgcmV0dXJuO1xuXG4gICAgaWYgKHVpU3RhdGUubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RNaXNzaWxlUm91dGVzKGNhbnZhc1BvaW50KTtcbiAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgc2V0TWlzc2lsZVNlbGVjdGlvbihoaXQuc2VsZWN0aW9uLCBoaXQucm91dGUuaWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzcGVlZCA9IGdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQoKTtcbiAgICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkIH07XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJhZGRfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgeDogd3AueCxcbiAgICAgIHk6IHdwLnksXG4gICAgICBzcGVlZDogd3Auc3BlZWQsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gcm91dGUud2F5cG9pbnRzID8gWy4uLnJvdXRlLndheXBvaW50cywgd3BdIDogW3dwXTtcbiAgICByZWNvcmRNaXNzaWxlTGVnU3BlZWQoc3BlZWQpO1xuICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCwgcm91dGUuaWQpO1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHtcbiAgICAgIHJvdXRlSWQ6IHJvdXRlLmlkLFxuICAgICAgaW5kZXg6IHJvdXRlLndheXBvaW50cy5sZW5ndGggLSAxLFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gYmVnaW5TaGlwRHJhZyhpbmRleDogbnVtYmVyLCBfb3JpZ2luOiBQb2ludGVyUG9pbnQpOiB2b2lkIHtcbiAgICBkcmFnZ2VkV2F5cG9pbnQgPSBpbmRleDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJlZ2luTWlzc2lsZURyYWcoaW5kZXg6IG51bWJlciwgX29yaWdpbjogUG9pbnRlclBvaW50KTogdm9pZCB7XG4gICAgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA9IGluZGV4O1xuICB9XG5cbiAgZnVuY3Rpb24gY2xhbXBUb1dvcmxkKHBvaW50OiBQb2ludGVyUG9pbnQpOiBQb2ludGVyUG9pbnQge1xuICAgIGNvbnN0IHdvcmxkVyA9IHN0YXRlLndvcmxkTWV0YS53ID8/IDQwMDA7XG4gICAgY29uc3Qgd29ybGRIID0gc3RhdGUud29ybGRNZXRhLmggPz8gNDAwMDtcbiAgICByZXR1cm4ge1xuICAgICAgeDogY2xhbXAocG9pbnQueCwgMCwgd29ybGRXKSxcbiAgICAgIHk6IGNsYW1wKHBvaW50LnksIDAsIHdvcmxkSCksXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVNoaXBEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQge1xuICAgIGlmIChkcmFnZ2VkV2F5cG9pbnQgPT09IG51bGwpIHJldHVybjtcbiAgICBjb25zdCBjbGFtcGVkID0gY2xhbXBUb1dvcmxkKHdvcmxkUG9pbnQpO1xuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwibW92ZV93YXlwb2ludFwiLFxuICAgICAgaW5kZXg6IGRyYWdnZWRXYXlwb2ludCxcbiAgICAgIHg6IGNsYW1wZWQueCxcbiAgICAgIHk6IGNsYW1wZWQueSxcbiAgICB9KTtcbiAgICBpZiAoc3RhdGUubWUgJiYgc3RhdGUubWUud2F5cG9pbnRzICYmIGRyYWdnZWRXYXlwb2ludCA8IHN0YXRlLm1lLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHN0YXRlLm1lLndheXBvaW50c1tkcmFnZ2VkV2F5cG9pbnRdLnggPSBjbGFtcGVkLng7XG4gICAgICBzdGF0ZS5tZS53YXlwb2ludHNbZHJhZ2dlZFdheXBvaW50XS55ID0gY2xhbXBlZC55O1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVEcmFnKHdvcmxkUG9pbnQ6IFBvaW50ZXJQb2ludCk6IHZvaWQge1xuICAgIGlmIChkcmFnZ2VkTWlzc2lsZVdheXBvaW50ID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlIHx8ICFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykpIHJldHVybjtcbiAgICBjb25zdCBjbGFtcGVkID0gY2xhbXBUb1dvcmxkKHdvcmxkUG9pbnQpO1xuICAgIGlmIChkcmFnZ2VkTWlzc2lsZVdheXBvaW50ID49IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHJldHVybjtcblxuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwibW92ZV9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgICBpbmRleDogZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCxcbiAgICAgIHg6IGNsYW1wZWQueCxcbiAgICAgIHk6IGNsYW1wZWQueSxcbiAgICB9KTtcblxuICAgIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cy5tYXAoKHdwLCBpZHgpID0+XG4gICAgICBpZHggPT09IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPyB7IC4uLndwLCB4OiBjbGFtcGVkLngsIHk6IGNsYW1wZWQueSB9IDogd3BcbiAgICApO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5kRHJhZygpOiB2b2lkIHtcbiAgICBpZiAoZHJhZ2dlZFdheXBvaW50ICE9PSBudWxsICYmIHN0YXRlLm1lPy53YXlwb2ludHMpIHtcbiAgICAgIGNvbnN0IHdwID0gc3RhdGUubWUud2F5cG9pbnRzW2RyYWdnZWRXYXlwb2ludF07XG4gICAgICBpZiAod3ApIHtcbiAgICAgICAgYnVzLmVtaXQoXCJzaGlwOndheXBvaW50TW92ZWRcIiwge1xuICAgICAgICAgIGluZGV4OiBkcmFnZ2VkV2F5cG9pbnQsXG4gICAgICAgICAgeDogd3AueCxcbiAgICAgICAgICB5OiB3cC55LFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCAhPT0gbnVsbCkge1xuICAgICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgIGlmIChyb3V0ZSAmJiByb3V0ZS53YXlwb2ludHMgJiYgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA8IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgICAgY29uc3Qgd3AgPSByb3V0ZS53YXlwb2ludHNbZHJhZ2dlZE1pc3NpbGVXYXlwb2ludF07XG4gICAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludE1vdmVkXCIsIHtcbiAgICAgICAgICByb3V0ZUlkOiByb3V0ZS5pZCxcbiAgICAgICAgICBpbmRleDogZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCxcbiAgICAgICAgICB4OiB3cC54LFxuICAgICAgICAgIHk6IHdwLnksXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRyYWdnZWRXYXlwb2ludCA9IG51bGw7XG4gICAgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBnZXREcmFnZ2VkV2F5cG9pbnQoKTogbnVtYmVyIHwgbnVsbCB7XG4gICAgcmV0dXJuIGRyYWdnZWRXYXlwb2ludDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldERyYWdnZWRNaXNzaWxlV2F5cG9pbnQoKTogbnVtYmVyIHwgbnVsbCB7XG4gICAgcmV0dXJuIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQ7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTogbnVtYmVyIHtcbiAgICBjb25zdCByZW1haW5pbmcgPSBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpO1xuICAgIHJldHVybiByZW1haW5pbmcgPiAwID8gcmVtYWluaW5nIDogMDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2V0U2VsZWN0aW9uLFxuICAgIHNldFNlbGVjdGlvbixcbiAgICBnZXRNaXNzaWxlU2VsZWN0aW9uLFxuICAgIHNldE1pc3NpbGVTZWxlY3Rpb24sXG4gICAgZ2V0RGVmYXVsdFNoaXBTcGVlZCxcbiAgICBzZXREZWZhdWx0U2hpcFNwZWVkLFxuICAgIGdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQsXG4gICAgcmVjb3JkTWlzc2lsZUxlZ1NwZWVkLFxuICAgIGdldFNoaXBXYXlwb2ludE9mZnNldCxcbiAgICBkaXNwbGF5SW5kZXhUb0FjdHVhbEluZGV4LFxuICAgIGFjdHVhbEluZGV4VG9EaXNwbGF5SW5kZXgsXG4gICAgY29tcHV0ZVJvdXRlUG9pbnRzLFxuICAgIGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMsXG4gICAgZmluZFdheXBvaW50QXRQb3NpdGlvbixcbiAgICBoaXRUZXN0Um91dGUsXG4gICAgaGl0VGVzdE1pc3NpbGVSb3V0ZXMsXG4gICAgc2hpcExlZ0Rhc2hPZmZzZXRzLFxuICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyxcbiAgICB1cGRhdGVSb3V0ZUFuaW1hdGlvbnMsXG4gICAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlLFxuICAgIGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSxcbiAgICBjeWNsZU1pc3NpbGVSb3V0ZSxcbiAgICBjeWNsZVNoaXBTZWxlY3Rpb24sXG4gICAgY2xlYXJTaGlwUm91dGUsXG4gICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQsXG4gICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQsXG4gICAgbGF1bmNoQWN0aXZlTWlzc2lsZVJvdXRlLFxuICAgIGhhbmRsZVNoaXBQb2ludGVyLFxuICAgIGhhbmRsZU1pc3NpbGVQb2ludGVyLFxuICAgIGJlZ2luU2hpcERyYWcsXG4gICAgYmVnaW5NaXNzaWxlRHJhZyxcbiAgICB1cGRhdGVTaGlwRHJhZyxcbiAgICB1cGRhdGVNaXNzaWxlRHJhZyxcbiAgICBlbmREcmFnLFxuICAgIGdldERyYWdnZWRXYXlwb2ludCxcbiAgICBnZXREcmFnZ2VkTWlzc2lsZVdheXBvaW50LFxuICAgIGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZyxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBVSVN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBNSVNTSUxFX1BBTEVUVEUsIFNISVBfUEFMRVRURSwgZHJhd1BsYW5uZWRSb3V0ZSB9IGZyb20gXCIuLi9yb3V0ZVwiO1xuaW1wb3J0IHR5cGUgeyBDYW1lcmEgfSBmcm9tIFwiLi9jYW1lcmFcIjtcbmltcG9ydCB0eXBlIHsgTG9naWMgfSBmcm9tIFwiLi9sb2dpY1wiO1xuXG5pbnRlcmZhY2UgUmVuZGVyRGVwZW5kZW5jaWVzIHtcbiAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgY2FtZXJhOiBDYW1lcmE7XG4gIGxvZ2ljOiBMb2dpYztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZW5kZXJlciB7XG4gIGRyYXdTY2VuZSgpOiB2b2lkO1xuICBkcmF3R3JpZCgpOiB2b2lkO1xuICBkcmF3U2hpcCh4OiBudW1iZXIsIHk6IG51bWJlciwgdng6IG51bWJlciwgdnk6IG51bWJlciwgY29sb3I6IHN0cmluZywgZmlsbGVkOiBib29sZWFuKTogdm9pZDtcbiAgZHJhd0dob3N0RG90KHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZDtcbiAgZHJhd1JvdXRlKCk6IHZvaWQ7XG4gIGRyYXdNaXNzaWxlUm91dGUoKTogdm9pZDtcbiAgZHJhd01pc3NpbGVzKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZW5kZXJlcih7XG4gIGNhbnZhcyxcbiAgY3R4LFxuICBzdGF0ZSxcbiAgdWlTdGF0ZSxcbiAgY2FtZXJhLFxuICBsb2dpYyxcbn06IFJlbmRlckRlcGVuZGVuY2llcyk6IFJlbmRlcmVyIHtcbiAgZnVuY3Rpb24gZHJhd1NoaXAoXG4gICAgeDogbnVtYmVyLFxuICAgIHk6IG51bWJlcixcbiAgICB2eDogbnVtYmVyLFxuICAgIHZ5OiBudW1iZXIsXG4gICAgY29sb3I6IHN0cmluZyxcbiAgICBmaWxsZWQ6IGJvb2xlYW5cbiAgKTogdm9pZCB7XG4gICAgY29uc3QgcCA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeCwgeSB9KTtcbiAgICBjb25zdCByID0gMTA7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHgudHJhbnNsYXRlKHAueCwgcC55KTtcbiAgICBjb25zdCBhbmdsZSA9IE1hdGguYXRhbjIodnksIHZ4KTtcbiAgICBjdHgucm90YXRlKGFuZ2xlKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhyLCAwKTtcbiAgICBjdHgubGluZVRvKC1yICogMC43LCByICogMC42KTtcbiAgICBjdHgubGluZVRvKC1yICogMC40LCAwKTtcbiAgICBjdHgubGluZVRvKC1yICogMC43LCAtciAqIDAuNik7XG4gICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGNvbG9yO1xuICAgIGlmIChmaWxsZWQpIHtcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBgJHtjb2xvcn1jY2A7XG4gICAgICBjdHguZmlsbCgpO1xuICAgIH1cbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdHaG9zdERvdCh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHAgPSBjYW1lcmEud29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMocC54LCBwLnksIDMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gXCIjY2NjY2NjYWFcIjtcbiAgICBjdHguZmlsbCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gZHJhd1JvdXRlKCk6IHZvaWQge1xuICAgIGlmICghc3RhdGUubWUpIHJldHVybjtcbiAgICBjb25zdCByb3V0ZSA9IGxvZ2ljLmNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICAgIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgY29uc3QgaGVhdCA9IHN0YXRlLm1lLmhlYXQ7XG4gICAgY29uc3QgaGVhdFBhcmFtcyA9IGhlYXRcbiAgICAgID8ge1xuICAgICAgICAgIG1hcmtlclNwZWVkOiBoZWF0Lm1hcmtlclNwZWVkLFxuICAgICAgICAgIGtVcDogaGVhdC5rVXAsXG4gICAgICAgICAga0Rvd246IGhlYXQua0Rvd24sXG4gICAgICAgICAgZXhwOiBoZWF0LmV4cCxcbiAgICAgICAgICBtYXg6IGhlYXQubWF4LFxuICAgICAgICAgIG92ZXJoZWF0QXQ6IGhlYXQub3ZlcmhlYXRBdCxcbiAgICAgICAgICB3YXJuQXQ6IGhlYXQud2FybkF0LFxuICAgICAgICB9XG4gICAgICA6IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGN1cnJlbnRTZWxlY3Rpb24gPSBsb2dpYy5nZXRTZWxlY3Rpb24oKTtcbiAgICBjb25zdCBkaXNwbGF5U2VsZWN0aW9uID0gY3VycmVudFNlbGVjdGlvblxuICAgICAgPyB7XG4gICAgICAgICAgdHlwZTogY3VycmVudFNlbGVjdGlvbi50eXBlLFxuICAgICAgICAgIGluZGV4OiBsb2dpYy5hY3R1YWxJbmRleFRvRGlzcGxheUluZGV4KGN1cnJlbnRTZWxlY3Rpb24uaW5kZXgpLFxuICAgICAgICB9XG4gICAgICA6IG51bGw7XG4gICAgY29uc3QgdmFsaWRTZWxlY3Rpb24gPVxuICAgICAgZGlzcGxheVNlbGVjdGlvbiAmJiBkaXNwbGF5U2VsZWN0aW9uLmluZGV4ID49IDAgPyBkaXNwbGF5U2VsZWN0aW9uIDogbnVsbDtcblxuICAgIGNvbnN0IGRyYWdnZWQgPSBsb2dpYy5nZXREcmFnZ2VkV2F5cG9pbnQoKTtcbiAgICBjb25zdCBkaXNwbGF5RHJhZ2dlZCA9XG4gICAgICBkcmFnZ2VkICE9PSBudWxsID8gbG9naWMuYWN0dWFsSW5kZXhUb0Rpc3BsYXlJbmRleChkcmFnZ2VkKSA6IG51bGw7XG4gICAgY29uc3QgdmFsaWREcmFnZ2VkID1cbiAgICAgIGRpc3BsYXlEcmFnZ2VkICE9PSBudWxsICYmIGRpc3BsYXlEcmFnZ2VkID49IDAgPyBkaXNwbGF5RHJhZ2dlZCA6IG51bGw7XG5cbiAgICBkcmF3UGxhbm5lZFJvdXRlKGN0eCwge1xuICAgICAgcm91dGVQb2ludHM6IHJvdXRlLFxuICAgICAgc2VsZWN0aW9uOiB2YWxpZFNlbGVjdGlvbixcbiAgICAgIGRyYWdnZWRXYXlwb2ludDogdmFsaWREcmFnZ2VkLFxuICAgICAgZGFzaFN0b3JlOiBsb2dpYy5zaGlwTGVnRGFzaE9mZnNldHMsXG4gICAgICBwYWxldHRlOiBTSElQX1BBTEVUVEUsXG4gICAgICBzaG93TGVnczogdWlTdGF0ZS5zaG93U2hpcFJvdXRlLFxuICAgICAgaGVhdFBhcmFtcyxcbiAgICAgIGluaXRpYWxIZWF0OiBoZWF0Py52YWx1ZSA/PyAwLFxuICAgICAgZGVmYXVsdFNwZWVkOiBsb2dpYy5nZXREZWZhdWx0U2hpcFNwZWVkKCksXG4gICAgICB3b3JsZFBvaW50czogcm91dGUud29ybGRQb2ludHMsXG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBkcmF3TWlzc2lsZVJvdXRlKCk6IHZvaWQge1xuICAgIGlmICghc3RhdGUubWUpIHJldHVybjtcbiAgICBpZiAodWlTdGF0ZS5pbnB1dENvbnRleHQgIT09IFwibWlzc2lsZVwiKSByZXR1cm47XG4gICAgY29uc3Qgcm91dGUgPSBsb2dpYy5jb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgICBjb25zdCBoZWF0UGFyYW1zID0gc3RhdGUubWlzc2lsZUNvbmZpZy5oZWF0UGFyYW1zO1xuICAgIGNvbnN0IG1pc3NpbGVTZWxlY3Rpb24gPSBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCk7XG4gICAgY29uc3QgZ2VuZXJpY1NlbGVjdGlvbiA9XG4gICAgICBtaXNzaWxlU2VsZWN0aW9uICYmIG1pc3NpbGVTZWxlY3Rpb24udHlwZSA9PT0gXCJsZWdcIlxuICAgICAgICA/IHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggfVxuICAgICAgICA6IG1pc3NpbGVTZWxlY3Rpb24gJiYgbWlzc2lsZVNlbGVjdGlvbi50eXBlID09PSBcIndheXBvaW50XCJcbiAgICAgICAgPyB7IHR5cGU6IFwid2F5cG9pbnRcIiwgaW5kZXg6IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggfVxuICAgICAgICA6IG51bGw7XG5cbiAgICBkcmF3UGxhbm5lZFJvdXRlKGN0eCwge1xuICAgICAgcm91dGVQb2ludHM6IHJvdXRlLFxuICAgICAgc2VsZWN0aW9uOiBnZW5lcmljU2VsZWN0aW9uLFxuICAgICAgZHJhZ2dlZFdheXBvaW50OiBudWxsLFxuICAgICAgZGFzaFN0b3JlOiBsb2dpYy5taXNzaWxlTGVnRGFzaE9mZnNldHMsXG4gICAgICBwYWxldHRlOiBNSVNTSUxFX1BBTEVUVEUsXG4gICAgICBzaG93TGVnczogdHJ1ZSxcbiAgICAgIGhlYXRQYXJhbXMsXG4gICAgICBpbml0aWFsSGVhdDogMCxcbiAgICAgIGRlZmF1bHRTcGVlZDogc3RhdGUubWlzc2lsZUNvbmZpZy5zcGVlZCxcbiAgICAgIHdvcmxkUG9pbnRzOiByb3V0ZS53b3JsZFBvaW50cyxcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdNaXNzaWxlcygpOiB2b2lkIHtcbiAgICBpZiAoIXN0YXRlLm1pc3NpbGVzIHx8IHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgIGNvbnN0IHdvcmxkID0gY2FtZXJhLmdldFdvcmxkU2l6ZSgpO1xuICAgIGNvbnN0IHNjYWxlWCA9IGNhbnZhcy53aWR0aCAvIHdvcmxkLnc7XG4gICAgY29uc3Qgc2NhbGVZID0gY2FudmFzLmhlaWdodCAvIHdvcmxkLmg7XG4gICAgY29uc3QgcmFkaXVzU2NhbGUgPSAoc2NhbGVYICsgc2NhbGVZKSAvIDI7XG4gICAgZm9yIChjb25zdCBtaXNzIG9mIHN0YXRlLm1pc3NpbGVzKSB7XG4gICAgICBjb25zdCBwID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4OiBtaXNzLngsIHk6IG1pc3MueSB9KTtcbiAgICAgIGNvbnN0IHNlbGZPd25lZCA9IEJvb2xlYW4obWlzcy5zZWxmKTtcbiAgICAgIGN0eC5zYXZlKCk7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHguYXJjKHAueCwgcC55LCBzZWxmT3duZWQgPyA2IDogNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgY3R4LmZpbGxTdHlsZSA9IHNlbGZPd25lZCA/IFwiI2Y4NzE3MVwiIDogXCIjZmNhNWE1XCI7XG4gICAgICBjdHguZ2xvYmFsQWxwaGEgPSBzZWxmT3duZWQgPyAwLjk1IDogMC44O1xuICAgICAgY3R4LmZpbGwoKTtcbiAgICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgICBjdHgubGluZVdpZHRoID0gMS41O1xuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMTExODI3XCI7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgICBpZiAoc2VsZk93bmVkICYmIG1pc3MuYWdyb19yYWRpdXMgPiAwKSB7XG4gICAgICAgIGN0eC5zYXZlKCk7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY29uc3QgckNhbnZhcyA9IG1pc3MuYWdyb19yYWRpdXMgKiByYWRpdXNTY2FsZTtcbiAgICAgICAgY3R4LnNldExpbmVEYXNoKFsxNCwgMTBdKTtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJyZ2JhKDI0OCwxMTMsMTEzLDAuMzUpXCI7XG4gICAgICAgIGN0eC5saW5lV2lkdGggPSAxLjI7XG4gICAgICAgIGN0eC5hcmMocC54LCBwLnksIHJDYW52YXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgICBjdHgucmVzdG9yZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdHcmlkKCk6IHZvaWQge1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMjM0XCI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDE7XG5cbiAgICBjb25zdCB6b29tID0gdWlTdGF0ZS56b29tO1xuICAgIGxldCBzdGVwID0gMTAwMDtcbiAgICBpZiAoem9vbSA8IDAuNykge1xuICAgICAgc3RlcCA9IDIwMDA7XG4gICAgfSBlbHNlIGlmICh6b29tID4gMS41KSB7XG4gICAgICBzdGVwID0gNTAwO1xuICAgIH0gZWxzZSBpZiAoem9vbSA+IDIuNSkge1xuICAgICAgc3RlcCA9IDI1MDtcbiAgICB9XG5cbiAgICBjb25zdCBjYW1lcmFQb3MgPSBjYW1lcmEuZ2V0Q2FtZXJhUG9zaXRpb24oKTtcbiAgICBjb25zdCB3b3JsZCA9IGNhbWVyYS5nZXRXb3JsZFNpemUoKTtcbiAgICBjb25zdCBzY2FsZVggPSBjYW52YXMud2lkdGggLyB3b3JsZC53O1xuICAgIGNvbnN0IHNjYWxlWSA9IGNhbnZhcy5oZWlnaHQgLyB3b3JsZC5oO1xuICAgIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcbiAgICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY2FudmFzLndpZHRoIC8gc2NhbGU7XG4gICAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjYW52YXMuaGVpZ2h0IC8gc2NhbGU7XG5cbiAgICBjb25zdCBtaW5YID0gTWF0aC5tYXgoMCwgY2FtZXJhUG9zLnggLSB2aWV3cG9ydFdpZHRoIC8gMik7XG4gICAgY29uc3QgbWF4WCA9IE1hdGgubWluKHdvcmxkLncsIGNhbWVyYVBvcy54ICsgdmlld3BvcnRXaWR0aCAvIDIpO1xuICAgIGNvbnN0IG1pblkgPSBNYXRoLm1heCgwLCBjYW1lcmFQb3MueSAtIHZpZXdwb3J0SGVpZ2h0IC8gMik7XG4gICAgY29uc3QgbWF4WSA9IE1hdGgubWluKHdvcmxkLmgsIGNhbWVyYVBvcy55ICsgdmlld3BvcnRIZWlnaHQgLyAyKTtcblxuICAgIGNvbnN0IHN0YXJ0WCA9IE1hdGguZmxvb3IobWluWCAvIHN0ZXApICogc3RlcDtcbiAgICBjb25zdCBlbmRYID0gTWF0aC5jZWlsKG1heFggLyBzdGVwKSAqIHN0ZXA7XG4gICAgY29uc3Qgc3RhcnRZID0gTWF0aC5mbG9vcihtaW5ZIC8gc3RlcCkgKiBzdGVwO1xuICAgIGNvbnN0IGVuZFkgPSBNYXRoLmNlaWwobWF4WSAvIHN0ZXApICogc3RlcDtcblxuICAgIGZvciAobGV0IHggPSBzdGFydFg7IHggPD0gZW5kWDsgeCArPSBzdGVwKSB7XG4gICAgICBjb25zdCBhID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4LCB5OiBNYXRoLm1heCgwLCBtaW5ZKSB9KTtcbiAgICAgIGNvbnN0IGIgPSBjYW1lcmEud29ybGRUb0NhbnZhcyh7IHgsIHk6IE1hdGgubWluKHdvcmxkLmgsIG1heFkpIH0pO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4Lm1vdmVUbyhhLngsIGEueSk7XG4gICAgICBjdHgubGluZVRvKGIueCwgYi55KTtcbiAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCB5ID0gc3RhcnRZOyB5IDw9IGVuZFk7IHkgKz0gc3RlcCkge1xuICAgICAgY29uc3QgYSA9IGNhbWVyYS53b3JsZFRvQ2FudmFzKHsgeDogTWF0aC5tYXgoMCwgbWluWCksIHkgfSk7XG4gICAgICBjb25zdCBiID0gY2FtZXJhLndvcmxkVG9DYW52YXMoeyB4OiBNYXRoLm1pbih3b3JsZC53LCBtYXhYKSwgeSB9KTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5tb3ZlVG8oYS54LCBhLnkpO1xuICAgICAgY3R4LmxpbmVUbyhiLngsIGIueSk7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBkcmF3U2NlbmUoKTogdm9pZCB7XG4gICAgY3R4LmNsZWFyUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xuICAgIGRyYXdHcmlkKCk7XG4gICAgZHJhd1JvdXRlKCk7XG4gICAgZHJhd01pc3NpbGVSb3V0ZSgpO1xuICAgIGRyYXdNaXNzaWxlcygpO1xuXG4gICAgZm9yIChjb25zdCBnIG9mIHN0YXRlLmdob3N0cykge1xuICAgICAgZHJhd1NoaXAoZy54LCBnLnksIGcudngsIGcudnksIFwiIzljYTNhZlwiLCBmYWxzZSk7XG4gICAgICBkcmF3R2hvc3REb3QoZy54LCBnLnkpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUubWUpIHtcbiAgICAgIGRyYXdTaGlwKHN0YXRlLm1lLngsIHN0YXRlLm1lLnksIHN0YXRlLm1lLnZ4LCBzdGF0ZS5tZS52eSwgXCIjMjJkM2VlXCIsIHRydWUpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZHJhd1NjZW5lLFxuICAgIGRyYXdHcmlkLFxuICAgIGRyYXdTaGlwLFxuICAgIGRyYXdHaG9zdERvdCxcbiAgICBkcmF3Um91dGUsXG4gICAgZHJhd01pc3NpbGVSb3V0ZSxcbiAgICBkcmF3TWlzc2lsZXMsXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgQWN0aXZlVG9vbCwgQXBwU3RhdGUsIFVJU3RhdGUgfSBmcm9tIFwiLi4vc3RhdGVcIjtcbmltcG9ydCB7XG4gIE1JU1NJTEVfTUFYX1NQRUVELFxuICBNSVNTSUxFX01JTl9BR1JPLFxuICBNSVNTSUxFX01JTl9TUEVFRCxcbiAgY2xhbXAsXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbn0gZnJvbSBcIi4uL3N0YXRlXCI7XG5pbXBvcnQgeyBIRUxQX1RFWFQgfSBmcm9tIFwiLi9jb25zdGFudHNcIjtcbmltcG9ydCB0eXBlIHsgQ2FtZXJhIH0gZnJvbSBcIi4vY2FtZXJhXCI7XG5pbXBvcnQgdHlwZSB7IExvZ2ljIH0gZnJvbSBcIi4vbG9naWNcIjtcbmltcG9ydCB7IHByb2plY3RSb3V0ZUhlYXQgfSBmcm9tIFwiLi4vcm91dGVcIjtcblxuaW50ZXJmYWNlIFVJRGVwZW5kZW5jaWVzIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBsb2dpYzogTG9naWM7XG4gIGNhbWVyYTogQ2FtZXJhO1xuICBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZDtcbiAgZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlOiBBcHBTdGF0ZSk6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENhY2hlZENhbnZhcyB7XG4gIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVUlDb250cm9sbGVyIHtcbiAgY2FjaGVEb20oKTogQ2FjaGVkQ2FudmFzO1xuICBiaW5kVUkoKTogdm9pZDtcbiAgc2V0QWN0aXZlVG9vbCh0b29sOiBBY3RpdmVUb29sKTogdm9pZDtcbiAgc2V0SW5wdXRDb250ZXh0KGNvbnRleHQ6IFwic2hpcFwiIHwgXCJtaXNzaWxlXCIpOiB2b2lkO1xuICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpOiB2b2lkO1xuICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk6IHZvaWQ7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTogdm9pZDtcbiAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTogdm9pZDtcbiAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpOiB2b2lkO1xuICB1cGRhdGVIZWxwT3ZlcmxheSgpOiB2b2lkO1xuICBzZXRIZWxwVmlzaWJsZShmbGFnOiBib29sZWFuKTogdm9pZDtcbiAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk6IHZvaWQ7XG4gIHVwZGF0ZU1pc3NpbGVDb3VudERpc3BsYXkoKTogdm9pZDtcbiAgdXBkYXRlQ3JhZnRUaW1lcigpOiB2b2lkO1xuICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk6IHZvaWQ7XG4gIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk6IHZvaWQ7XG4gIHVwZGF0ZVNwZWVkTWFya2VyKCk6IHZvaWQ7XG4gIHVwZGF0ZUhlYXRCYXIoKTogdm9pZDtcbiAgcHJvamVjdFBsYW5uZWRIZWF0KCk6IG51bWJlciB8IG51bGw7XG4gIGdldENhbnZhcygpOiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gIGdldENvbnRleHQoKTogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEIHwgbnVsbDtcbiAgYWRqdXN0U2hpcFNwZWVkKHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IHZvaWQ7XG4gIGFkanVzdE1pc3NpbGVBZ3JvKHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IHZvaWQ7XG4gIGFkanVzdE1pc3NpbGVTcGVlZChzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVUkoe1xuICBzdGF0ZSxcbiAgdWlTdGF0ZSxcbiAgYnVzLFxuICBsb2dpYyxcbiAgY2FtZXJhLFxuICBzZW5kTWVzc2FnZSxcbiAgZ2V0QXBwcm94U2VydmVyTm93LFxufTogVUlEZXBlbmRlbmNpZXMpOiBVSUNvbnRyb2xsZXIge1xuICBsZXQgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQgfCBudWxsID0gbnVsbDtcbiAgbGV0IEhQc3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGtpbGxzU3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBDb250cm9sc0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwQ2xlYXJCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFNlbGVjdEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBSb3V0ZXNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwUm91dGVMZWc6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwUm91dGVTcGVlZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNoaXBEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwU3BlZWRDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc2hpcFNwZWVkU2xpZGVyOiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzaGlwU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTcGVlZE1hcmtlcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgbWlzc2lsZUNvbnRyb2xzQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVBZGRSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVMYXVuY2hCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlTGF1bmNoVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVMYXVuY2hJbmZvOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlRGVsZXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVTcGVlZFNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZVNwZWVkVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlQWdyb0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlQWdyb1NsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUFncm9WYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVIZWF0Q2FwYWNpdHlDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUhlYXRDYXBhY2l0eVNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUhlYXRDYXBhY2l0eVZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUNyYWZ0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgbWlzc2lsZUNvdW50U3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IG1pc3NpbGVDcmFmdFRpbWVyRGl2OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgY3JhZnRUaW1lUmVtYWluaW5nU3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHNwYXduQm90QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgc3Bhd25Cb3RUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG4gIGxldCByb3V0ZVByZXZCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByb3V0ZU5leHRCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByb3V0ZU1lbnVUb2dnbGU6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByb3V0ZU1lbnU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCByZW5hbWVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBkZWxldGVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlUm91dGVOYW1lTGFiZWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBtaXNzaWxlUm91dGVDb3VudExhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG4gIGxldCBoZWxwVG9nZ2xlOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgaGVscE92ZXJsYXk6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBoZWxwQ2xvc2VCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBoZWxwVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgaGVhdEJhckZpbGw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBoZWF0QmFyUGxhbm5lZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGhlYXRWYWx1ZVRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBzcGVlZE1hcmtlcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHN0YWxsT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBsZXQgbWFya2VyQWxpZ25lZCA9IGZhbHNlO1xuICBsZXQgaGVhdFdhcm5BY3RpdmUgPSBmYWxzZTtcbiAgbGV0IHN0YWxsQWN0aXZlID0gZmFsc2U7XG4gIGxldCBkdWFsTWV0ZXJBbGVydCA9IGZhbHNlO1xuICBsZXQgbGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCA9IFwiXCI7XG4gIGxldCBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgbGV0IGxhc3RNaXNzaWxlQ29uZmlnU2VudDogeyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGNhY2hlRG9tKCk6IENhY2hlZENhbnZhcyB7XG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdlwiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gICAgY3R4ID0gY2FudmFzPy5nZXRDb250ZXh0KFwiMmRcIikgPz8gbnVsbDtcbiAgICBIUHNwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtaHBcIik7XG4gICAgc2hpcENvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1jb250cm9sc1wiKTtcbiAgICBzaGlwQ2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIHNoaXBTZXRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2V0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBzaGlwU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgc2hpcFJvdXRlc0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZXNcIik7XG4gICAgc2hpcFJvdXRlTGVnID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXJvdXRlLWxlZ1wiKTtcbiAgICBzaGlwUm91dGVTcGVlZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZS1zcGVlZFwiKTtcbiAgICBzaGlwRGVsZXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgc2hpcFNwZWVkQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1jYXJkXCIpO1xuICAgIHNoaXBTcGVlZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gICAgc2hpcFNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtdmFsdWVcIik7XG5cbiAgICBtaXNzaWxlQ29udHJvbHNDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWNvbnRyb2xzXCIpO1xuICAgIG1pc3NpbGVBZGRSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVMYXVuY2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlTGF1bmNoVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2gtdGV4dFwiKTtcbiAgICBtaXNzaWxlTGF1bmNoSW5mbyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2gtaW5mb1wiKTtcbiAgICBtaXNzaWxlU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgbWlzc2lsZVNlbGVjdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZWxlY3RcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVEZWxldGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtZGVsZXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlU3BlZWRDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLWNhcmRcIik7XG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlU3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC12YWx1ZVwiKTtcbiAgICBtaXNzaWxlQWdyb0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1jYXJkXCIpO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVBZ3JvVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby12YWx1ZVwiKTtcbiAgICBtaXNzaWxlSGVhdENhcGFjaXR5Q2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1oZWF0LWNhcGFjaXR5LWNhcmRcIik7XG4gICAgbWlzc2lsZUhlYXRDYXBhY2l0eVNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1oZWF0LWNhcGFjaXR5LXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgICBtaXNzaWxlSGVhdENhcGFjaXR5VmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtaGVhdC1jYXBhY2l0eS12YWx1ZVwiKTtcbiAgICBtaXNzaWxlQ3JhZnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY3JhZnRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVDb3VudFNwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY291bnRcIik7XG4gICAgbWlzc2lsZUNyYWZ0VGltZXJEaXYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY3JhZnQtdGltZXJcIik7XG4gICAgY3JhZnRUaW1lUmVtYWluaW5nU3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3JhZnQtdGltZS1yZW1haW5pbmdcIik7XG5cbiAgICBzcGF3bkJvdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBzcGF3bkJvdFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdC10ZXh0XCIpO1xuICAgIGtpbGxzU3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1raWxsc1wiKTtcbiAgICByb3V0ZVByZXZCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIHJvdXRlTmV4dEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbmV4dFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgcm91dGVNZW51VG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51LXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgcm91dGVNZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51XCIpO1xuICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVuYW1lLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVsZXRlLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2xlYXItbWlzc2lsZS13YXlwb2ludHNcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIG1pc3NpbGVSb3V0ZU5hbWVMYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1yb3V0ZS1uYW1lXCIpO1xuICAgIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtY291bnRcIik7XG5cbiAgICBoZWxwVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgaGVscE92ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtb3ZlcmxheVwiKTtcbiAgICBoZWxwQ2xvc2VCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtY2xvc2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGhlbHBUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRleHRcIik7XG5cbiAgICBoZWF0QmFyRmlsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItZmlsbFwiKTtcbiAgICBoZWF0QmFyUGxhbm5lZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItcGxhbm5lZFwiKTtcbiAgICBoZWF0VmFsdWVUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWF0LXZhbHVlLXRleHRcIik7XG4gICAgc3BlZWRNYXJrZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkLW1hcmtlclwiKTtcbiAgICBtaXNzaWxlU3BlZWRNYXJrZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtbWFya2VyXCIpO1xuICAgIHN0YWxsT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhbGwtb3ZlcmxheVwiKTtcblxuICAgIGNvbnN0IHNsaWRlckRlZmF1bHQgPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlcj8udmFsdWUgPz8gXCIxNTBcIik7XG4gICAgbG9naWMuc2V0RGVmYXVsdFNoaXBTcGVlZChOdW1iZXIuaXNGaW5pdGUoc2xpZGVyRGVmYXVsdCkgPyBzbGlkZXJEZWZhdWx0IDogMTUwKTtcbiAgICBpZiAobWlzc2lsZVNwZWVkU2xpZGVyKSB7XG4gICAgICBtaXNzaWxlU3BlZWRTbGlkZXIuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBjYW52YXMsIGN0eCB9O1xuICB9XG5cbiAgZnVuY3Rpb24gYmluZFVJKCk6IHZvaWQge1xuICAgIHNwYXduQm90QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgaWYgKHNwYXduQm90QnRuLmRpc2FibGVkKSByZXR1cm47XG5cbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJzcGF3bl9ib3RcIiB9KTtcbiAgICAgIGJ1cy5lbWl0KFwiYm90OnNwYXduUmVxdWVzdGVkXCIpO1xuXG4gICAgICBzcGF3bkJvdEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBpZiAoc3Bhd25Cb3RUZXh0KSB7XG4gICAgICAgIHNwYXduQm90VGV4dC50ZXh0Q29udGVudCA9IFwiU3Bhd25lZFwiO1xuICAgICAgfVxuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaWYgKHNwYXduQm90QnRuKSB7XG4gICAgICAgICAgc3Bhd25Cb3RCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc3Bhd25Cb3RUZXh0KSB7XG4gICAgICAgICAgc3Bhd25Cb3RUZXh0LnRleHRDb250ZW50ID0gXCJCb3RcIjtcbiAgICAgICAgfVxuICAgICAgfSwgNTAwMCk7XG4gICAgfSk7XG5cbiAgICBzaGlwQ2xlYXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgbG9naWMuY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgIGJ1cy5lbWl0KFwic2hpcDpjbGVhckludm9rZWRcIik7XG4gICAgfSk7XG5cbiAgICBzaGlwU2V0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICAgIH0pO1xuXG4gICAgc2hpcFNlbGVjdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNlbGVjdFwiKTtcbiAgICB9KTtcblxuICAgIHNoaXBTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSByZXR1cm47XG4gICAgICB1cGRhdGVTcGVlZExhYmVsKHZhbHVlKTtcbiAgICAgIGxvZ2ljLnNldERlZmF1bHRTaGlwU3BlZWQodmFsdWUpO1xuICAgICAgY29uc3Qgc2VsZWN0aW9uID0gbG9naWMuZ2V0U2VsZWN0aW9uKCk7XG4gICAgICBpZiAoXG4gICAgICAgIHNlbGVjdGlvbiAmJlxuICAgICAgICBzdGF0ZS5tZSAmJlxuICAgICAgICBBcnJheS5pc0FycmF5KHN0YXRlLm1lLndheXBvaW50cykgJiZcbiAgICAgICAgc3RhdGUubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF1cbiAgICAgICkge1xuICAgICAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwidXBkYXRlX3dheXBvaW50XCIsIGluZGV4OiBzZWxlY3Rpb24uaW5kZXgsIHNwZWVkOiB2YWx1ZSB9KTtcbiAgICAgICAgc3RhdGUubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0uc3BlZWQgPSB2YWx1ZTtcbiAgICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xuICAgICAgfVxuICAgICAgY29uc3QgaGVhdCA9IHN0YXRlLm1lPy5oZWF0O1xuICAgICAgaWYgKGhlYXQpIHtcbiAgICAgICAgY29uc3QgdG9sZXJhbmNlID0gTWF0aC5tYXgoNSwgaGVhdC5tYXJrZXJTcGVlZCAqIDAuMDIpO1xuICAgICAgICBjb25zdCBkaWZmID0gTWF0aC5hYnModmFsdWUgLSBoZWF0Lm1hcmtlclNwZWVkKTtcbiAgICAgICAgY29uc3QgaW5SYW5nZSA9IGRpZmYgPD0gdG9sZXJhbmNlO1xuICAgICAgICBpZiAoaW5SYW5nZSAmJiAhbWFya2VyQWxpZ25lZCkge1xuICAgICAgICAgIG1hcmtlckFsaWduZWQgPSB0cnVlO1xuICAgICAgICAgIGJ1cy5lbWl0KFwiaGVhdDptYXJrZXJBbGlnbmVkXCIsIHsgdmFsdWUsIG1hcmtlcjogaGVhdC5tYXJrZXJTcGVlZCB9KTtcbiAgICAgICAgfSBlbHNlIGlmICghaW5SYW5nZSAmJiBtYXJrZXJBbGlnbmVkKSB7XG4gICAgICAgICAgbWFya2VyQWxpZ25lZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtYXJrZXJBbGlnbmVkID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBidXMuZW1pdChcInNoaXA6c3BlZWRDaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gICAgfSk7XG5cbiAgICBzaGlwRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGxvZ2ljLmRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlQWRkUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF9taXNzaWxlX3JvdXRlXCIgfSk7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlTGF1bmNoQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGxvZ2ljLmxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIH0pO1xuXG4gICAgbWlzc2lsZVNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZWxlY3RcIik7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGxvZ2ljLmRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiKTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgICAgY29uc3Qgc2xpZGVyID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICBpZiAoc2xpZGVyLmRpc2FibGVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJhdyA9IHBhcnNlRmxvYXQoc2xpZGVyLnZhbHVlKTtcbiAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHJhdykpIHJldHVybjtcbiAgICAgIGNvbnN0IG1pblNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1pbiA/PyBNSVNTSUxFX01JTl9TUEVFRDtcbiAgICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICAgIGNvbnN0IGNsYW1wZWRWYWx1ZSA9IGNsYW1wKHJhdywgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IGNsYW1wZWRWYWx1ZS50b0ZpeGVkKDApO1xuICAgICAgaWYgKG1pc3NpbGVTcGVlZFZhbHVlKSB7XG4gICAgICAgIG1pc3NpbGVTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7Y2xhbXBlZFZhbHVlLnRvRml4ZWQoMCl9YDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBjb25zdCBtaXNzaWxlU2VsZWN0aW9uID0gbG9naWMuZ2V0TWlzc2lsZVNlbGVjdGlvbigpO1xuICAgICAgaWYgKFxuICAgICAgICByb3V0ZSAmJlxuICAgICAgICBtaXNzaWxlU2VsZWN0aW9uICYmXG4gICAgICAgIG1pc3NpbGVTZWxlY3Rpb24udHlwZSA9PT0gXCJsZWdcIiAmJlxuICAgICAgICBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgJiZcbiAgICAgICAgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA+PSAwICYmXG4gICAgICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoXG4gICAgICApIHtcbiAgICAgICAgcm91dGUud2F5cG9pbnRzID0gcm91dGUud2F5cG9pbnRzLm1hcCgodywgaWR4KSA9PlxuICAgICAgICAgIGlkeCA9PT0gbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA/IHsgLi4udywgc3BlZWQ6IGNsYW1wZWRWYWx1ZSB9IDogd1xuICAgICAgICApO1xuICAgICAgICBzZW5kTWVzc2FnZSh7XG4gICAgICAgICAgdHlwZTogXCJ1cGRhdGVfbWlzc2lsZV93YXlwb2ludF9zcGVlZFwiLFxuICAgICAgICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICAgICAgICBpbmRleDogbWlzc2lsZVNlbGVjdGlvbi5pbmRleCxcbiAgICAgICAgICBzcGVlZDogY2xhbXBlZFZhbHVlLFxuICAgICAgICB9KTtcbiAgICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlOiBjbGFtcGVkVmFsdWUsIGluZGV4OiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY2ZnID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNwZWVkOiBjbGFtcGVkVmFsdWUsXG4gICAgICAgICAgICBhZ3JvUmFkaXVzOiBzdGF0ZS5taXNzaWxlQ29uZmlnLmFncm9SYWRpdXMsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzdGF0ZS5taXNzaWxlQ29uZmlnLFxuICAgICAgICAgIHN0YXRlLm1pc3NpbGVMaW1pdHNcbiAgICAgICAgKTtcbiAgICAgICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgICAgICAgc2VuZE1pc3NpbGVDb25maWcoY2ZnKTtcbiAgICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlOiBjbGFtcGVkVmFsdWUsIGluZGV4OiAtMSB9KTtcbiAgICAgIH1cbiAgICAgIGxvZ2ljLnJlY29yZE1pc3NpbGVMZWdTcGVlZChjbGFtcGVkVmFsdWUpO1xuICAgIH0pO1xuXG4gICAgbWlzc2lsZUFncm9TbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHJhdyA9IHBhcnNlRmxvYXQoKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShyYXcpKSByZXR1cm47XG4gICAgICBjb25zdCBtaW5BZ3JvID0gc3RhdGUubWlzc2lsZUxpbWl0cy5hZ3JvTWluID8/IE1JU1NJTEVfTUlOX0FHUk87XG4gICAgICBjb25zdCBjbGFtcGVkVmFsdWUgPSBNYXRoLm1heChtaW5BZ3JvLCByYXcpO1xuICAgICAgbWlzc2lsZUFncm9TbGlkZXIudmFsdWUgPSBjbGFtcGVkVmFsdWUudG9GaXhlZCgwKTtcbiAgICAgIGlmIChtaXNzaWxlQWdyb1ZhbHVlKSB7XG4gICAgICAgIG1pc3NpbGVBZ3JvVmFsdWUudGV4dENvbnRlbnQgPSBgJHtjbGFtcGVkVmFsdWUudG9GaXhlZCgwKX1gO1xuICAgICAgfVxuICAgICAgdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSSh7IGFncm9SYWRpdXM6IGNsYW1wZWRWYWx1ZSB9KTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiLCB7IHZhbHVlOiBjbGFtcGVkVmFsdWUgfSk7XG4gICAgfSk7XG5cbiAgICBtaXNzaWxlSGVhdENhcGFjaXR5U2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBjb25zdCByYXcgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocmF3KSkgcmV0dXJuO1xuICAgICAgY29uc3QgY2xhbXBlZFZhbHVlID0gTWF0aC5tYXgoODAsIE1hdGgubWluKDIwMCwgcmF3KSk7XG4gICAgICBtaXNzaWxlSGVhdENhcGFjaXR5U2xpZGVyLnZhbHVlID0gY2xhbXBlZFZhbHVlLnRvRml4ZWQoMCk7XG4gICAgICBpZiAobWlzc2lsZUhlYXRDYXBhY2l0eVZhbHVlKSB7XG4gICAgICAgIG1pc3NpbGVIZWF0Q2FwYWNpdHlWYWx1ZS50ZXh0Q29udGVudCA9IGAke2NsYW1wZWRWYWx1ZS50b0ZpeGVkKDApfWA7XG4gICAgICB9XG4gICAgICBzdGF0ZS5jcmFmdEhlYXRDYXBhY2l0eSA9IGNsYW1wZWRWYWx1ZTtcbiAgICB9KTtcblxuICAgIG1pc3NpbGVDcmFmdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGlmIChtaXNzaWxlQ3JhZnRCdG4uZGlzYWJsZWQpIHJldHVybjtcblxuICAgICAgLy8gRmluZCB0aGUgY3JhZnQgbm9kZSBmb3IgdGhlIHNlbGVjdGVkIGhlYXQgY2FwYWNpdHlcbiAgICAgIGNvbnN0IGhlYXRDYXAgPSBzdGF0ZS5jcmFmdEhlYXRDYXBhY2l0eTtcbiAgICAgIGxldCBub2RlSWQgPSBcImNyYWZ0Lm1pc3NpbGUuYmFzaWNcIjsgLy8gRGVmYXVsdFxuXG4gICAgICBpZiAoc3RhdGUuZGFnKSB7XG4gICAgICAgIC8vIEZpbmQgdGhlIGJlc3QgbWF0Y2hpbmcgY3JhZnQgbm9kZSBiYXNlZCBvbiBoZWF0IGNhcGFjaXR5XG4gICAgICAgIGNvbnN0IGNyYWZ0Tm9kZXMgPSBzdGF0ZS5kYWcubm9kZXMuZmlsdGVyKG4gPT4gbi5raW5kID09PSBcImNyYWZ0XCIgJiYgbi5pZC5pbmNsdWRlcyhcIm1pc3NpbGVcIikpO1xuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2YgY3JhZnROb2Rlcykge1xuICAgICAgICAgIGNvbnN0IG5vZGVIZWF0Q2FwID0gcGFyc2VJbnQobm9kZS5pZC5tYXRjaCgvKFxcZCspLyk/LlsxXSB8fCBcIjgwXCIpO1xuICAgICAgICAgIGlmIChNYXRoLmFicyhub2RlSGVhdENhcCAtIGhlYXRDYXApIDwgNSkge1xuICAgICAgICAgICAgbm9kZUlkID0gbm9kZS5pZDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVybWluZSB0aGUgcmlnaHQgbm9kZSBiYXNlZCBvbiBoZWF0IGNhcGFjaXR5IHJhbmdlc1xuICAgICAgICBpZiAoaGVhdENhcCA+PSAxODApIHtcbiAgICAgICAgICBub2RlSWQgPSBcImNyYWZ0Lm1pc3NpbGUuZXh0ZW5kZWRcIjtcbiAgICAgICAgfSBlbHNlIGlmIChoZWF0Q2FwID49IDE0MCkge1xuICAgICAgICAgIG5vZGVJZCA9IFwiY3JhZnQubWlzc2lsZS5oaWdoX2hlYXRcIjtcbiAgICAgICAgfSBlbHNlIGlmIChoZWF0Q2FwID49IDExMCkge1xuICAgICAgICAgIG5vZGVJZCA9IFwiY3JhZnQubWlzc2lsZS5sb25nX3JhbmdlXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbm9kZUlkID0gXCJjcmFmdC5taXNzaWxlLmJhc2ljXCI7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRhZ19zdGFydFwiLCBub2RlX2lkOiBub2RlSWQgfSk7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6Y3JhZnRSZXF1ZXN0ZWRcIiwgeyBub2RlSWQsIGhlYXRDYXBhY2l0eTogaGVhdENhcCB9KTtcbiAgICB9KTtcblxuICAgIHJvdXRlUHJldkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGxvZ2ljLmN5Y2xlTWlzc2lsZVJvdXRlKC0xKSk7XG4gICAgcm91dGVOZXh0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gbG9naWMuY3ljbGVNaXNzaWxlUm91dGUoMSkpO1xuXG4gICAgcm91dGVNZW51VG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgcm91dGVNZW51Py5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiKTtcbiAgICB9KTtcblxuICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgICBjb25zdCBuZXh0TmFtZSA9IHByb21wdChcIlJlbmFtZSByb3V0ZVwiLCByb3V0ZS5uYW1lID8/IFwiXCIpID8/IFwiXCI7XG4gICAgICBjb25zdCB0cmltbWVkID0gbmV4dE5hbWUudHJpbSgpO1xuICAgICAgaWYgKHRyaW1tZWQgPT09IHJvdXRlLm5hbWUpIHJldHVybjtcbiAgICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgICAgdHlwZTogXCJyZW5hbWVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgICAgIG5hbWU6IHRyaW1tZWQsXG4gICAgICB9KTtcbiAgICAgIHJvdXRlLm5hbWUgPSB0cmltbWVkO1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9KTtcblxuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiZGVsZXRlX21pc3NpbGVfcm91dGVcIiwgcm91dGVfaWQ6IHJvdXRlLmlkIH0pO1xuICAgIH0pO1xuXG4gICAgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgcm91dGUgPSBsb2dpYy5nZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJjbGVhcl9taXNzaWxlX3dheXBvaW50c1wiLCByb3V0ZV9pZDogcm91dGUuaWQgfSk7XG4gICAgICByb3V0ZS53YXlwb2ludHMgPSBbXTtcbiAgICAgIGxvZ2ljLnNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH0pO1xuXG4gICAgaGVscFRvZ2dsZT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgIHNldEhlbHBWaXNpYmxlKHRydWUpO1xuICAgIH0pO1xuXG4gICAgaGVscENsb3NlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgIH0pO1xuXG4gICAgYnVzLm9uKFwic2hpcDpsZWdTZWxlY3RlZFwiLCAoKSA9PiB7XG4gICAgICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gICAgfSk7XG4gICAgYnVzLm9uKFwic2hpcDp3YXlwb2ludEFkZGVkXCIsICgpID0+IHtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG4gICAgfSk7XG4gICAgYnVzLm9uKFwic2hpcDp3YXlwb2ludERlbGV0ZWRcIiwgKCkgPT4ge1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIiwgKCkgPT4ge1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJtaXNzaWxlOnNlbGVjdGlvbkNoYW5nZWRcIiwgKCkgPT4ge1xuICAgICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIiwgKCkgPT4ge1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9KTtcbiAgICBidXMub24oXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiLCAoKSA9PiB7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH0pO1xuICAgIGJ1cy5vbihcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsICgpID0+IHtcbiAgICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRDYW52YXMoKTogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsIHtcbiAgICByZXR1cm4gY2FudmFzO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0Q29udGV4dCgpOiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQgfCBudWxsIHtcbiAgICByZXR1cm4gY3R4O1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFzaGlwU3BlZWRWYWx1ZSkgcmV0dXJuO1xuICAgIHNoaXBTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7dmFsdWUudG9GaXhlZCgwKX0gdS9zYDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkanVzdFNsaWRlclZhbHVlKFxuICAgIGlucHV0OiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCxcbiAgICBzdGVwczogbnVtYmVyLFxuICAgIGNvYXJzZTogYm9vbGVhblxuICApOiBudW1iZXIgfCBudWxsIHtcbiAgICBpZiAoIWlucHV0KSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBzdGVwID0gTWF0aC5hYnMocGFyc2VGbG9hdChpbnB1dC5zdGVwKSkgfHwgMTtcbiAgICBjb25zdCBtdWx0aXBsaWVyID0gY29hcnNlID8gNCA6IDE7XG4gICAgY29uc3QgbWluID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWluKSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1pbikgOiAtSW5maW5pdHk7XG4gICAgY29uc3QgbWF4ID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWF4KSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1heCkgOiBJbmZpbml0eTtcbiAgICBjb25zdCBjdXJyZW50ID0gcGFyc2VGbG9hdChpbnB1dC52YWx1ZSkgfHwgMDtcbiAgICBsZXQgbmV4dCA9IGN1cnJlbnQgKyBzdGVwcyAqIHN0ZXAgKiBtdWx0aXBsaWVyO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobWluKSkgbmV4dCA9IE1hdGgubWF4KG1pbiwgbmV4dCk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtYXgpKSBuZXh0ID0gTWF0aC5taW4obWF4LCBuZXh0KTtcbiAgICBpZiAoTWF0aC5hYnMobmV4dCAtIGN1cnJlbnQpIDwgMWUtNCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlucHV0LnZhbHVlID0gU3RyaW5nKG5leHQpO1xuICAgIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIiwgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICByZXR1cm4gbmV4dDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkanVzdFNoaXBTcGVlZChzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBhZGp1c3RTbGlkZXJWYWx1ZShzaGlwU3BlZWRTbGlkZXIsIHN0ZXBzLCBjb2Fyc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gYWRqdXN0TWlzc2lsZUFncm8oc3RlcHM6IG51bWJlciwgY29hcnNlOiBib29sZWFuKTogdm9pZCB7XG4gICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIHN0ZXBzLCBjb2Fyc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gYWRqdXN0TWlzc2lsZVNwZWVkKHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIgJiYgIW1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCkge1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCBzdGVwcywgY29hcnNlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTaGlwU2xpZGVyVmFsdWUodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghc2hpcFNwZWVkU2xpZGVyKSByZXR1cm47XG4gICAgc2hpcFNwZWVkU2xpZGVyLnZhbHVlID0gdmFsdWUudG9GaXhlZCgwKTtcbiAgICB1cGRhdGVTcGVlZExhYmVsKHZhbHVlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk6IHZvaWQge1xuICAgIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGUubWlzc2lsZVJvdXRlcykgPyBzdGF0ZS5taXNzaWxlUm91dGVzIDogW107XG4gICAgY29uc3QgYWN0aXZlUm91dGUgPSBsb2dpYy5nZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAobWlzc2lsZVJvdXRlTmFtZUxhYmVsKSB7XG4gICAgICBpZiAoIWFjdGl2ZVJvdXRlKSB7XG4gICAgICAgIG1pc3NpbGVSb3V0ZU5hbWVMYWJlbC50ZXh0Q29udGVudCA9IHJvdXRlcy5sZW5ndGggPT09IDAgPyBcIk5vIHJvdXRlXCIgOiBcIlJvdXRlXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSBhY3RpdmVSb3V0ZS5uYW1lIHx8IFwiUm91dGVcIjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobWlzc2lsZVJvdXRlQ291bnRMYWJlbCkge1xuICAgICAgY29uc3QgY291bnQgPVxuICAgICAgICBhY3RpdmVSb3V0ZSAmJiBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgPyBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICAgIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwudGV4dENvbnRlbnQgPSBgJHtjb3VudH0gcHRzYDtcbiAgICB9XG5cbiAgICBpZiAoZGVsZXRlTWlzc2lsZVJvdXRlQnRuKSB7XG4gICAgICBkZWxldGVNaXNzaWxlUm91dGVCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gICAgfVxuICAgIGlmIChyZW5hbWVNaXNzaWxlUm91dGVCdG4pIHtcbiAgICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZTtcbiAgICB9XG4gICAgaWYgKGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bikge1xuICAgICAgY29uc3QgY291bnQgPVxuICAgICAgICBhY3RpdmVSb3V0ZSAmJiBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgPyBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZSB8fCBjb3VudCA9PT0gMDtcbiAgICB9XG4gICAgaWYgKHJvdXRlUHJldkJ0bikge1xuICAgICAgcm91dGVQcmV2QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICAgIH1cbiAgICBpZiAocm91dGVOZXh0QnRuKSB7XG4gICAgICByb3V0ZU5leHRCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gICAgfVxuXG4gICAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpOiB2b2lkIHtcbiAgICBsb2dpYy5lbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZSA9IGxvZ2ljLmdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGNvbnN0IG1pc3NpbGVTZWwgPSBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCk7XG4gICAgY29uc3Qgcm91dGVIYXNTZWxlY3Rpb24gPVxuICAgICAgISFhY3RpdmVSb3V0ZSAmJlxuICAgICAgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpICYmXG4gICAgICAhIW1pc3NpbGVTZWwgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPj0gMCAmJlxuICAgICAgbWlzc2lsZVNlbC5pbmRleCA8IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGg7XG4gICAgaWYgKCFyb3V0ZUhhc1NlbGVjdGlvbikge1xuICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICB9XG4gICAgY29uc3QgY2ZnID0gc3RhdGUubWlzc2lsZUNvbmZpZztcbiAgICBhcHBseU1pc3NpbGVVSShjZmcpO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gYXBwbHlNaXNzaWxlVUkoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gICAgaWYgKG1pc3NpbGVBZ3JvU2xpZGVyKSB7XG4gICAgICBjb25zdCBtaW5BZ3JvID0gc3RhdGUubWlzc2lsZUxpbWl0cy5hZ3JvTWluID8/IE1JU1NJTEVfTUlOX0FHUk87XG4gICAgICBjb25zdCBtYXhBZ3JvID0gTWF0aC5tYXgoNTAwMCwgTWF0aC5jZWlsKChjZmcuYWdyb1JhZGl1cyArIDUwMCkgLyA1MDApICogNTAwKTtcbiAgICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5BZ3JvKTtcbiAgICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1heCA9IFN0cmluZyhtYXhBZ3JvKTtcbiAgICAgIG1pc3NpbGVBZ3JvU2xpZGVyLnZhbHVlID0gY2ZnLmFncm9SYWRpdXMudG9GaXhlZCgwKTtcbiAgICB9XG4gICAgaWYgKG1pc3NpbGVBZ3JvVmFsdWUpIHtcbiAgICAgIG1pc3NpbGVBZ3JvVmFsdWUudGV4dENvbnRlbnQgPSBjZmcuYWdyb1JhZGl1cy50b0ZpeGVkKDApO1xuICAgIH1cbiAgICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xuICAgIHVwZGF0ZVNwZWVkTWFya2VyKCk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKFxuICAgIG92ZXJyaWRlczogUGFydGlhbDx7IGFncm9SYWRpdXM6IG51bWJlciB9PiA9IHt9XG4gICk6IHZvaWQge1xuICAgIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZS5taXNzaWxlQ29uZmlnO1xuICAgIGNvbnN0IGNmZyA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyhcbiAgICAgIHtcbiAgICAgICAgc3BlZWQ6IGN1cnJlbnQuc3BlZWQsXG4gICAgICAgIGFncm9SYWRpdXM6IG92ZXJyaWRlcy5hZ3JvUmFkaXVzID8/IGN1cnJlbnQuYWdyb1JhZGl1cyxcbiAgICAgIH0sXG4gICAgICBjdXJyZW50LFxuICAgICAgc3RhdGUubWlzc2lsZUxpbWl0c1xuICAgICk7XG4gICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgICBhcHBseU1pc3NpbGVVSShjZmcpO1xuICAgIGNvbnN0IGxhc3QgPSBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQ7XG4gICAgY29uc3QgbmVlZHNTZW5kID1cbiAgICAgICFsYXN0IHx8IE1hdGguYWJzKChsYXN0LmFncm9SYWRpdXMgPz8gMCkgLSBjZmcuYWdyb1JhZGl1cykgPiA1O1xuICAgIGlmIChuZWVkc1NlbmQpIHtcbiAgICAgIHNlbmRNaXNzaWxlQ29uZmlnKGNmZyk7XG4gICAgfVxuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIH1cblxuICBmdW5jdGlvbiBzZW5kTWlzc2lsZUNvbmZpZyhjZmc6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0pOiB2b2lkIHtcbiAgICBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQgPSB7XG4gICAgICBzcGVlZDogY2ZnLnNwZWVkLFxuICAgICAgYWdyb1JhZGl1czogY2ZnLmFncm9SYWRpdXMsXG4gICAgfTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImNvbmZpZ3VyZV9taXNzaWxlXCIsXG4gICAgICBtaXNzaWxlX3NwZWVkOiBjZmcuc3BlZWQsXG4gICAgICBtaXNzaWxlX2Fncm86IGNmZy5hZ3JvUmFkaXVzLFxuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpOiB2b2lkIHtcbiAgICBpZiAoIXNoaXBSb3V0ZXNDb250YWluZXIgfHwgIXNoaXBSb3V0ZUxlZyB8fCAhc2hpcFJvdXRlU3BlZWQgfHwgIXNoaXBEZWxldGVCdG4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgd3BzID0gc3RhdGUubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZS5tZS53YXlwb2ludHMpID8gc3RhdGUubWUud2F5cG9pbnRzIDogW107XG4gICAgY29uc3Qgc2VsZWN0aW9uID0gbG9naWMuZ2V0U2VsZWN0aW9uKCk7XG4gICAgY29uc3QgaGFzVmFsaWRTZWxlY3Rpb24gPVxuICAgICAgc2VsZWN0aW9uICE9PSBudWxsICYmIHNlbGVjdGlvbi5pbmRleCA+PSAwICYmIHNlbGVjdGlvbi5pbmRleCA8IHdwcy5sZW5ndGg7XG4gICAgY29uc3QgaXNTaGlwQ29udGV4dCA9IHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIjtcblxuICAgIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUub3BhY2l0eSA9IGlzU2hpcENvbnRleHQgPyBcIjFcIiA6IFwiMC42XCI7XG5cbiAgICBpZiAoIXN0YXRlLm1lIHx8ICFoYXNWYWxpZFNlbGVjdGlvbiB8fCAhc2VsZWN0aW9uKSB7XG4gICAgICBzaGlwUm91dGVMZWcudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgc2hpcFJvdXRlU3BlZWQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgc2hpcERlbGV0ZUJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBpZiAoaXNTaGlwQ29udGV4dCkge1xuICAgICAgICBzZXRTaGlwU2xpZGVyVmFsdWUobG9naWMuZ2V0RGVmYXVsdFNoaXBTcGVlZCgpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB3cCA9IHdwc1tzZWxlY3Rpb24uaW5kZXhdO1xuICAgIGNvbnN0IHNwZWVkID1cbiAgICAgIHdwICYmIHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiA/IHdwLnNwZWVkIDogbG9naWMuZ2V0RGVmYXVsdFNoaXBTcGVlZCgpO1xuICAgIGlmIChcbiAgICAgIGlzU2hpcENvbnRleHQgJiZcbiAgICAgIHNoaXBTcGVlZFNsaWRlciAmJlxuICAgICAgTWF0aC5hYnMocGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIudmFsdWUpIC0gc3BlZWQpID4gMC4yNVxuICAgICkge1xuICAgICAgc2V0U2hpcFNsaWRlclZhbHVlKHNwZWVkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdXBkYXRlU3BlZWRMYWJlbChzcGVlZCk7XG4gICAgfVxuICAgIGNvbnN0IGRpc3BsYXlJbmRleCA9IHNlbGVjdGlvbi5pbmRleCArIDE7XG4gICAgc2hpcFJvdXRlTGVnLnRleHRDb250ZW50ID0gYCR7ZGlzcGxheUluZGV4fWA7XG4gICAgc2hpcFJvdXRlU3BlZWQudGV4dENvbnRlbnQgPSBgJHtzcGVlZC50b0ZpeGVkKDApfSB1L3NgO1xuICAgIHNoaXBEZWxldGVCdG4uZGlzYWJsZWQgPSAhaXNTaGlwQ29udGV4dDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTogdm9pZCB7XG4gICAgY29uc3Qgcm91dGUgPSBsb2dpYy5nZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBjb25zdCBjb3VudCA9IHJvdXRlICYmIEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIGNvbnN0IG1pc3NpbGVTZWwgPSBsb2dpYy5nZXRNaXNzaWxlU2VsZWN0aW9uKCk7XG4gICAgY29uc3QgaXNXYXlwb2ludFNlbGVjdGlvbiA9XG4gICAgICBtaXNzaWxlU2VsICE9PSBudWxsICYmXG4gICAgICBtaXNzaWxlU2VsICE9PSB1bmRlZmluZWQgJiZcbiAgICAgIG1pc3NpbGVTZWwudHlwZSA9PT0gXCJ3YXlwb2ludFwiICYmXG4gICAgICBtaXNzaWxlU2VsLmluZGV4ID49IDAgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPCBjb3VudDtcbiAgICBpZiAobWlzc2lsZURlbGV0ZUJ0bikge1xuICAgICAgbWlzc2lsZURlbGV0ZUJ0bi5kaXNhYmxlZCA9ICFpc1dheXBvaW50U2VsZWN0aW9uO1xuICAgIH1cbiAgICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTogdm9pZCB7XG4gICAgaWYgKCFtaXNzaWxlU3BlZWRTbGlkZXIgfHwgIW1pc3NpbGVTcGVlZFZhbHVlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbWluU3BlZWQgPSBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWluID8/IE1JU1NJTEVfTUlOX1NQRUVEO1xuICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIubWluID0gU3RyaW5nKG1pblNwZWVkKTtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIubWF4ID0gU3RyaW5nKG1heFNwZWVkKTtcblxuICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgY29uc3QgbWlzc2lsZVNlbCA9IGxvZ2ljLmdldE1pc3NpbGVTZWxlY3Rpb24oKTtcbiAgICBjb25zdCB3YXlwb2ludHMgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMgOiBudWxsO1xuICAgIGxldCBzZWxlY3RlZFNwZWVkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgc2VsZWN0ZWRUeXBlOiBcImxlZ1wiIHwgXCJ3YXlwb2ludFwiIHwgbnVsbCA9IG51bGw7XG5cbiAgICBpZiAoXG4gICAgICB3YXlwb2ludHMgJiZcbiAgICAgIG1pc3NpbGVTZWwgJiZcbiAgICAgIG1pc3NpbGVTZWwuaW5kZXggPj0gMCAmJlxuICAgICAgbWlzc2lsZVNlbC5pbmRleCA8IHdheXBvaW50cy5sZW5ndGhcbiAgICApIHtcbiAgICAgIGNvbnN0IHdwID0gd2F5cG9pbnRzW21pc3NpbGVTZWwuaW5kZXhdO1xuICAgICAgY29uc3QgdmFsdWUgPVxuICAgICAgICB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgJiYgd3Auc3BlZWQgPiAwXG4gICAgICAgICAgPyB3cC5zcGVlZFxuICAgICAgICAgIDogbG9naWMuZ2V0RGVmYXVsdE1pc3NpbGVMZWdTcGVlZCgpO1xuICAgICAgc2VsZWN0ZWRTcGVlZCA9IGNsYW1wKHZhbHVlLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICAgICAgc2VsZWN0ZWRUeXBlID0gbWlzc2lsZVNlbC50eXBlO1xuICAgIH1cblxuICAgIGNvbnN0IHNsaWRlckRpc2FibGVkID0gc2VsZWN0ZWRUeXBlID09PSBcIndheXBvaW50XCI7XG4gICAgbGV0IHNsaWRlclZhbHVlOiBudW1iZXI7XG4gICAgaWYgKHNlbGVjdGVkU3BlZWQgIT09IG51bGwpIHtcbiAgICAgIHNsaWRlclZhbHVlID0gc2VsZWN0ZWRTcGVlZDtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgcmF3VmFsdWUgPSBwYXJzZUZsb2F0KG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSk7XG4gICAgICBjb25zdCBmYWxsYmFjayA9IGxvZ2ljLmdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQoKTtcbiAgICAgIGNvbnN0IHRhcmdldFZhbHVlID0gTnVtYmVyLmlzRmluaXRlKHJhd1ZhbHVlKSA/IHJhd1ZhbHVlIDogZmFsbGJhY2s7XG4gICAgICBzbGlkZXJWYWx1ZSA9IGNsYW1wKHRhcmdldFZhbHVlLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICAgIH1cblxuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCA9IHNsaWRlckRpc2FibGVkO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IHNsaWRlclZhbHVlLnRvRml4ZWQoMCk7XG4gICAgbWlzc2lsZVNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtzbGlkZXJWYWx1ZS50b0ZpeGVkKDApfWA7XG5cbiAgICBpZiAoIXNsaWRlckRpc2FibGVkKSB7XG4gICAgICBsb2dpYy5yZWNvcmRNaXNzaWxlTGVnU3BlZWQoc2xpZGVyVmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldElucHV0Q29udGV4dChjb250ZXh0OiBcInNoaXBcIiB8IFwibWlzc2lsZVwiKTogdm9pZCB7XG4gICAgY29uc3QgbmV4dCA9IGNvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcbiAgICBpZiAodWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IG5leHQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdWlTdGF0ZS5pbnB1dENvbnRleHQgPSBuZXh0O1xuXG4gICAgaWYgKG5leHQgPT09IFwic2hpcFwiKSB7XG4gICAgICBjb25zdCBzaGlwVG9vbFRvVXNlID0gdWlTdGF0ZS5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIiA/IFwic2hpcC1zZWxlY3RcIiA6IFwic2hpcC1zZXRcIjtcbiAgICAgIGlmICh1aVN0YXRlLmFjdGl2ZVRvb2wgIT09IHNoaXBUb29sVG9Vc2UpIHtcbiAgICAgICAgdWlTdGF0ZS5hY3RpdmVUb29sID0gc2hpcFRvb2xUb1VzZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgbWlzc2lsZVRvb2xUb1VzZSA9XG4gICAgICAgIHVpU3RhdGUubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIgPyBcIm1pc3NpbGUtc2VsZWN0XCIgOiBcIm1pc3NpbGUtc2V0XCI7XG4gICAgICBpZiAodWlTdGF0ZS5hY3RpdmVUb29sICE9PSBtaXNzaWxlVG9vbFRvVXNlKSB7XG4gICAgICAgIHVpU3RhdGUuYWN0aXZlVG9vbCA9IG1pc3NpbGVUb29sVG9Vc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgYnVzLmVtaXQoXCJjb250ZXh0OmNoYW5nZWRcIiwgeyBjb250ZXh0OiBuZXh0IH0pO1xuICAgIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEFjdGl2ZVRvb2wodG9vbDogQWN0aXZlVG9vbCk6IHZvaWQge1xuICAgIGlmICh1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IHRvb2wpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB1aVN0YXRlLmFjdGl2ZVRvb2wgPSB0b29sO1xuXG4gICAgaWYgKHRvb2wgPT09IFwic2hpcC1zZXRcIikge1xuICAgICAgdWlTdGF0ZS5zaGlwVG9vbCA9IFwic2V0XCI7XG4gICAgICB1aVN0YXRlLm1pc3NpbGVUb29sID0gbnVsbDtcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBidXMuZW1pdChcInNoaXA6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNldFwiIH0pO1xuICAgIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKSB7XG4gICAgICB1aVN0YXRlLnNoaXBUb29sID0gXCJzZWxlY3RcIjtcbiAgICAgIHVpU3RhdGUubWlzc2lsZVRvb2wgPSBudWxsO1xuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGJ1cy5lbWl0KFwic2hpcDp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2VsZWN0XCIgfSk7XG4gICAgfSBlbHNlIGlmICh0b29sID09PSBcIm1pc3NpbGUtc2V0XCIpIHtcbiAgICAgIHVpU3RhdGUuc2hpcFRvb2wgPSBudWxsO1xuICAgICAgdWlTdGF0ZS5taXNzaWxlVG9vbCA9IFwic2V0XCI7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgbG9naWMuc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2V0XCIgfSk7XG4gICAgfSBlbHNlIGlmICh0b29sID09PSBcIm1pc3NpbGUtc2VsZWN0XCIpIHtcbiAgICAgIHVpU3RhdGUuc2hpcFRvb2wgPSBudWxsO1xuICAgICAgdWlTdGF0ZS5taXNzaWxlVG9vbCA9IFwic2VsZWN0XCI7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZWxlY3RcIiB9KTtcbiAgICB9XG5cbiAgICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0QnV0dG9uU3RhdGUoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmICghYnRuKSByZXR1cm47XG4gICAgaWYgKGFjdGl2ZSkge1xuICAgICAgYnRuLmRhdGFzZXQuc3RhdGUgPSBcImFjdGl2ZVwiO1xuICAgICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcInRydWVcIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlbGV0ZSBidG4uZGF0YXNldC5zdGF0ZTtcbiAgICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJmYWxzZVwiKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpOiB2b2lkIHtcbiAgICBzZXRCdXR0b25TdGF0ZShzaGlwU2V0QnRuLCB1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZXRcIik7XG4gICAgc2V0QnV0dG9uU3RhdGUoc2hpcFNlbGVjdEJ0biwgdWlTdGF0ZS5hY3RpdmVUb29sID09PSBcInNoaXAtc2VsZWN0XCIpO1xuICAgIHNldEJ1dHRvblN0YXRlKG1pc3NpbGVTZXRCdG4sIHVpU3RhdGUuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKTtcbiAgICBzZXRCdXR0b25TdGF0ZShtaXNzaWxlU2VsZWN0QnRuLCB1aVN0YXRlLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZWxlY3RcIik7XG5cbiAgICBpZiAoc2hpcENvbnRyb2xzQ2FyZCkge1xuICAgICAgc2hpcENvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGUuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIik7XG4gICAgfVxuICAgIGlmIChtaXNzaWxlQ29udHJvbHNDYXJkKSB7XG4gICAgICBtaXNzaWxlQ29udHJvbHNDYXJkLmNsYXNzTGlzdC50b2dnbGUoXCJhY3RpdmVcIiwgdWlTdGF0ZS5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzZXRIZWxwVmlzaWJsZShmbGFnOiBib29sZWFuKTogdm9pZCB7XG4gICAgdWlTdGF0ZS5oZWxwVmlzaWJsZSA9IGZsYWc7XG4gICAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgICBidXMuZW1pdChcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgeyB2aXNpYmxlOiB1aVN0YXRlLmhlbHBWaXNpYmxlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlSGVscE92ZXJsYXkoKTogdm9pZCB7XG4gICAgaWYgKCFoZWxwT3ZlcmxheSB8fCAhaGVscFRleHQpIHJldHVybjtcbiAgICBoZWxwT3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiLCB1aVN0YXRlLmhlbHBWaXNpYmxlKTtcbiAgICBoZWxwVGV4dC50ZXh0Q29udGVudCA9IEhFTFBfVEVYVDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpOiB2b2lkIHtcbiAgICBpZiAoIW1pc3NpbGVMYXVuY2hCdG4gfHwgIW1pc3NpbGVMYXVuY2hUZXh0IHx8ICFtaXNzaWxlTGF1bmNoSW5mbykgcmV0dXJuO1xuICAgIGNvbnN0IHJvdXRlID0gbG9naWMuZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgY29uc3QgY291bnQgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICBjb25zdCByZW1haW5pbmcgPSBsb2dpYy5nZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTtcbiAgICBjb25zdCBjb29saW5nRG93biA9IHJlbWFpbmluZyA+IDAuMDU7XG4gICAgY29uc3Qgc2hvdWxkRGlzYWJsZSA9ICFyb3V0ZSB8fCBjb3VudCA9PT0gMCB8fCBjb29saW5nRG93bjtcbiAgICBtaXNzaWxlTGF1bmNoQnRuLmRpc2FibGVkID0gc2hvdWxkRGlzYWJsZTtcblxuICAgIGNvbnN0IGxhdW5jaFRleHRIVE1MID1cbiAgICAgICc8c3BhbiBjbGFzcz1cImJ0bi10ZXh0LWZ1bGxcIj5MYXVuY2g8L3NwYW4+PHNwYW4gY2xhc3M9XCJidG4tdGV4dC1zaG9ydFwiPkZpcmU8L3NwYW4+JztcbiAgICBsZXQgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuXG4gICAgaWYgKCFyb3V0ZSkge1xuICAgICAgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuICAgIH0gZWxzZSBpZiAoY29vbGluZ0Rvd24pIHtcbiAgICAgIGxhdW5jaEluZm9IVE1MID0gYCR7cmVtYWluaW5nLnRvRml4ZWQoMSl9c2A7XG4gICAgfSBlbHNlIGlmIChyb3V0ZS5uYW1lKSB7XG4gICAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGUubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgICAgY29uc3Qgcm91dGVJbmRleCA9IHJvdXRlcy5maW5kSW5kZXgoKHIpID0+IHIuaWQgPT09IHJvdXRlLmlkKSArIDE7XG4gICAgICBsYXVuY2hJbmZvSFRNTCA9IGA8c3BhbiBjbGFzcz1cImJ0bi10ZXh0LWZ1bGxcIj4ke3JvdXRlLm5hbWV9PC9zcGFuPjxzcGFuIGNsYXNzPVwiYnRuLXRleHQtc2hvcnRcIj4ke3JvdXRlSW5kZXh9PC9zcGFuPmA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgICB9XG5cbiAgICBpZiAobGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCAhPT0gbGF1bmNoVGV4dEhUTUwpIHtcbiAgICAgIG1pc3NpbGVMYXVuY2hUZXh0LmlubmVySFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICAgICAgbGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICAgIH1cblxuICAgIGlmIChsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MICE9PSBsYXVuY2hJbmZvSFRNTCkge1xuICAgICAgbWlzc2lsZUxhdW5jaEluZm8uaW5uZXJIVE1MID0gbGF1bmNoSW5mb0hUTUw7XG4gICAgICBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gbGF1bmNoSW5mb0hUTUw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUNvdW50RGlzcGxheSgpOiB2b2lkIHtcbiAgICBpZiAoIW1pc3NpbGVDb3VudFNwYW4pIHJldHVybjtcblxuICAgIGxldCBjb3VudCA9IDA7XG4gICAgaWYgKHN0YXRlLmludmVudG9yeSAmJiBzdGF0ZS5pbnZlbnRvcnkuaXRlbXMpIHtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBzdGF0ZS5pbnZlbnRvcnkuaXRlbXMpIHtcbiAgICAgICAgaWYgKGl0ZW0udHlwZSA9PT0gXCJtaXNzaWxlXCIpIHtcbiAgICAgICAgICBjb3VudCArPSBpdGVtLnF1YW50aXR5O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgbWlzc2lsZUNvdW50U3Bhbi50ZXh0Q29udGVudCA9IGNvdW50LnRvU3RyaW5nKCk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVDcmFmdFRpbWVyKCk6IHZvaWQge1xuICAgIGlmICghbWlzc2lsZUNyYWZ0VGltZXJEaXYgfHwgIWNyYWZ0VGltZVJlbWFpbmluZ1NwYW4pIHJldHVybjtcblxuICAgIC8vIExvb2sgZm9yIGFueSBjcmFmdCBub2RlIHRoYXQncyBpbiBwcm9ncmVzc1xuICAgIGxldCBjcmFmdEluUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICBsZXQgcmVtYWluaW5nVGltZSA9IDA7XG5cbiAgICBpZiAoc3RhdGUuZGFnICYmIHN0YXRlLmRhZy5ub2Rlcykge1xuICAgICAgZm9yIChjb25zdCBub2RlIG9mIHN0YXRlLmRhZy5ub2Rlcykge1xuICAgICAgICBpZiAobm9kZS5raW5kID09PSBcImNyYWZ0XCIgJiYgbm9kZS5zdGF0dXMgPT09IFwiaW5fcHJvZ3Jlc3NcIikge1xuICAgICAgICAgIGNyYWZ0SW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgICAgICAgcmVtYWluaW5nVGltZSA9IG5vZGUucmVtYWluaW5nX3M7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY3JhZnRJblByb2dyZXNzICYmIHJlbWFpbmluZ1RpbWUgPiAwKSB7XG4gICAgICBtaXNzaWxlQ3JhZnRUaW1lckRpdi5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgY3JhZnRUaW1lUmVtYWluaW5nU3Bhbi50ZXh0Q29udGVudCA9IE1hdGguY2VpbChyZW1haW5pbmdUaW1lKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBtaXNzaWxlQ3JhZnRUaW1lckRpdi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpOiB2b2lkIHtcbiAgICBjb25zdCBtZXRhID0gc3RhdGUud29ybGRNZXRhID8/IHt9O1xuICAgIGNhbWVyYS51cGRhdGVXb3JsZEZyb21NZXRhKG1ldGEpO1xuXG4gICAgaWYgKEhQc3Bhbikge1xuICAgICAgaWYgKHN0YXRlLm1lICYmIE51bWJlci5pc0Zpbml0ZShzdGF0ZS5tZS5ocCkpIHtcbiAgICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlLm1lLmhwKS50b1N0cmluZygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gXCJcdTIwMTNcIjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGtpbGxzU3Bhbikge1xuICAgICAgaWYgKHN0YXRlLm1lICYmIE51bWJlci5pc0Zpbml0ZShzdGF0ZS5tZS5raWxscykpIHtcbiAgICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlLm1lLmtpbGxzKS50b1N0cmluZygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gXCIwXCI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdXBkYXRlSGVhdEJhcigpO1xuICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG4gICAgdXBkYXRlU3BlZWRNYXJrZXIoKTtcbiAgICB1cGRhdGVTdGFsbE92ZXJsYXkoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUhlYXRCYXIoKTogdm9pZCB7XG4gICAgY29uc3QgaGVhdCA9IHN0YXRlLm1lPy5oZWF0O1xuICAgIGlmICghaGVhdCB8fCAhaGVhdEJhckZpbGwgfHwgIWhlYXRWYWx1ZVRleHQpIHtcbiAgICAgIGhlYXRXYXJuQWN0aXZlID0gZmFsc2U7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcGVyY2VudCA9IChoZWF0LnZhbHVlIC8gaGVhdC5tYXgpICogMTAwO1xuICAgIGhlYXRCYXJGaWxsLnN0eWxlLndpZHRoID0gYCR7cGVyY2VudH0lYDtcblxuICAgIGhlYXRWYWx1ZVRleHQudGV4dENvbnRlbnQgPSBgSGVhdCAke01hdGgucm91bmQoaGVhdC52YWx1ZSl9YDtcblxuICAgIGhlYXRCYXJGaWxsLmNsYXNzTGlzdC5yZW1vdmUoXCJ3YXJuXCIsIFwib3ZlcmhlYXRcIik7XG4gICAgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC5vdmVyaGVhdEF0KSB7XG4gICAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QuYWRkKFwib3ZlcmhlYXRcIik7XG4gICAgfSBlbHNlIGlmIChoZWF0LnZhbHVlID49IGhlYXQud2FybkF0KSB7XG4gICAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QuYWRkKFwid2FyblwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBub3dXYXJuID0gaGVhdC52YWx1ZSA+PSBoZWF0Lndhcm5BdDtcbiAgICBpZiAobm93V2FybiAmJiAhaGVhdFdhcm5BY3RpdmUpIHtcbiAgICAgIGhlYXRXYXJuQWN0aXZlID0gdHJ1ZTtcbiAgICAgIGJ1cy5lbWl0KFwiaGVhdDp3YXJuRW50ZXJlZFwiLCB7IHZhbHVlOiBoZWF0LnZhbHVlLCB3YXJuQXQ6IGhlYXQud2FybkF0IH0pO1xuICAgIH0gZWxzZSBpZiAoIW5vd1dhcm4gJiYgaGVhdFdhcm5BY3RpdmUpIHtcbiAgICAgIGNvbnN0IGNvb2xUaHJlc2hvbGQgPSBNYXRoLm1heCgwLCBoZWF0Lndhcm5BdCAtIDUpO1xuICAgICAgaWYgKGhlYXQudmFsdWUgPD0gY29vbFRocmVzaG9sZCkge1xuICAgICAgICBoZWF0V2FybkFjdGl2ZSA9IGZhbHNlO1xuICAgICAgICBidXMuZW1pdChcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCIsIHsgdmFsdWU6IGhlYXQudmFsdWUsIHdhcm5BdDogaGVhdC53YXJuQXQgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcHJvamVjdFBsYW5uZWRIZWF0KCk6IG51bWJlciB8IG51bGwge1xuICAgIGNvbnN0IHNoaXAgPSBzdGF0ZS5tZTtcbiAgICBpZiAoIXNoaXAgfHwgIUFycmF5LmlzQXJyYXkoc2hpcC53YXlwb2ludHMpIHx8IHNoaXAud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCB8fCAhc2hpcC5oZWF0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBjdXJyZW50SW5kZXhSYXcgPSBzaGlwLmN1cnJlbnRXYXlwb2ludEluZGV4O1xuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9XG4gICAgICB0eXBlb2YgY3VycmVudEluZGV4UmF3ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShjdXJyZW50SW5kZXhSYXcpID8gY3VycmVudEluZGV4UmF3IDogMDtcbiAgICBjb25zdCBjbGFtcGVkSW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjdXJyZW50SW5kZXgsIHNoaXAud2F5cG9pbnRzLmxlbmd0aCkpO1xuICAgIGNvbnN0IHJlbWFpbmluZ1dheXBvaW50cyA9XG4gICAgICBjbGFtcGVkSW5kZXggPiAwID8gc2hpcC53YXlwb2ludHMuc2xpY2UoY2xhbXBlZEluZGV4KSA6IHNoaXAud2F5cG9pbnRzLnNsaWNlKCk7XG5cbiAgICBpZiAocmVtYWluaW5nV2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgcm91dGUgPSBbeyB4OiBzaGlwLngsIHk6IHNoaXAueSwgc3BlZWQ6IHVuZGVmaW5lZCB9LCAuLi5yZW1haW5pbmdXYXlwb2ludHNdO1xuXG4gICAgY29uc3QgaGVhdFBhcmFtcyA9IHtcbiAgICAgIG1hcmtlclNwZWVkOiBzaGlwLmhlYXQubWFya2VyU3BlZWQsXG4gICAgICBrVXA6IHNoaXAuaGVhdC5rVXAsXG4gICAgICBrRG93bjogc2hpcC5oZWF0LmtEb3duLFxuICAgICAgZXhwOiBzaGlwLmhlYXQuZXhwLFxuICAgICAgbWF4OiBzaGlwLmhlYXQubWF4LFxuICAgICAgb3ZlcmhlYXRBdDogc2hpcC5oZWF0Lm92ZXJoZWF0QXQsXG4gICAgICB3YXJuQXQ6IHNoaXAuaGVhdC53YXJuQXQsXG4gICAgfTtcblxuICAgIGNvbnN0IHByb2plY3Rpb24gPSBwcm9qZWN0Um91dGVIZWF0KHJvdXRlLCBzaGlwLmhlYXQudmFsdWUsIGhlYXRQYXJhbXMpO1xuICAgIHJldHVybiBNYXRoLm1heCguLi5wcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cyk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVQbGFubmVkSGVhdEJhcigpOiB2b2lkIHtcbiAgICBpZiAoIWhlYXRCYXJQbGFubmVkKSByZXR1cm47XG4gICAgY29uc3QgcmVzZXRQbGFubmVkQmFyID0gKCkgPT4ge1xuICAgICAgaGVhdEJhclBsYW5uZWQuc3R5bGUud2lkdGggPSBcIjAlXCI7XG4gICAgfTtcblxuICAgIGNvbnN0IHNoaXAgPSBzdGF0ZS5tZTtcbiAgICBpZiAoIXNoaXAgfHwgIXNoaXAuaGVhdCkge1xuICAgICAgcmVzZXRQbGFubmVkQmFyKCk7XG4gICAgICBkdWFsTWV0ZXJBbGVydCA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHBsYW5uZWQgPSBwcm9qZWN0UGxhbm5lZEhlYXQoKTtcbiAgICBpZiAocGxhbm5lZCA9PT0gbnVsbCkge1xuICAgICAgcmVzZXRQbGFubmVkQmFyKCk7XG4gICAgICBkdWFsTWV0ZXJBbGVydCA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGFjdHVhbCA9IHNoaXAuaGVhdC52YWx1ZTtcbiAgICBjb25zdCBwZXJjZW50ID0gKHBsYW5uZWQgLyBzaGlwLmhlYXQubWF4KSAqIDEwMDtcbiAgICBoZWF0QmFyUGxhbm5lZC5zdHlsZS53aWR0aCA9IGAke01hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGVyY2VudCkpfSVgO1xuXG4gICAgY29uc3QgZGlmZiA9IHBsYW5uZWQgLSBhY3R1YWw7XG4gICAgY29uc3QgdGhyZXNob2xkID0gTWF0aC5tYXgoOCwgc2hpcC5oZWF0Lndhcm5BdCAqIDAuMSk7XG4gICAgaWYgKGRpZmYgPj0gdGhyZXNob2xkICYmICFkdWFsTWV0ZXJBbGVydCkge1xuICAgICAgZHVhbE1ldGVyQWxlcnQgPSB0cnVlO1xuICAgICAgYnVzLmVtaXQoXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCIsIHsgcGxhbm5lZCwgYWN0dWFsIH0pO1xuICAgIH0gZWxzZSBpZiAoZGlmZiA8IHRocmVzaG9sZCAqIDAuNiAmJiBkdWFsTWV0ZXJBbGVydCkge1xuICAgICAgZHVhbE1ldGVyQWxlcnQgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVTcGVlZE1hcmtlcigpOiB2b2lkIHtcbiAgICBjb25zdCBzaGlwSGVhdCA9IHN0YXRlLm1lPy5oZWF0O1xuICAgIGlmIChzcGVlZE1hcmtlciAmJiBzaGlwU3BlZWRTbGlkZXIgJiYgc2hpcEhlYXQgJiYgc2hpcEhlYXQubWFya2VyU3BlZWQgPiAwKSB7XG4gICAgICBjb25zdCBtaW4gPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci5taW4pO1xuICAgICAgY29uc3QgbWF4ID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIubWF4KTtcbiAgICAgIGNvbnN0IG1hcmtlclNwZWVkID0gc2hpcEhlYXQubWFya2VyU3BlZWQ7XG4gICAgICBjb25zdCBwZXJjZW50ID0gKChtYXJrZXJTcGVlZCAtIG1pbikgLyAobWF4IC0gbWluKSkgKiAxMDA7XG4gICAgICBjb25zdCBjbGFtcGVkID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBwZXJjZW50KSk7XG4gICAgICBzcGVlZE1hcmtlci5zdHlsZS5sZWZ0ID0gYCR7Y2xhbXBlZH0lYDtcbiAgICAgIHNwZWVkTWFya2VyLnRpdGxlID0gYEhlYXQgbmV1dHJhbDogJHtNYXRoLnJvdW5kKG1hcmtlclNwZWVkKX0gdW5pdHMvc2A7XG4gICAgICBzcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSBpZiAoc3BlZWRNYXJrZXIpIHtcbiAgICAgIHNwZWVkTWFya2VyLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBpZiAobWlzc2lsZVNwZWVkTWFya2VyICYmIG1pc3NpbGVTcGVlZFNsaWRlcikge1xuICAgICAgY29uc3QgaGVhdFBhcmFtcyA9IHN0YXRlLm1pc3NpbGVDb25maWcuaGVhdFBhcmFtcztcbiAgICAgIGNvbnN0IG1hcmtlclNwZWVkID1cbiAgICAgICAgKGhlYXRQYXJhbXMgJiYgTnVtYmVyLmlzRmluaXRlKGhlYXRQYXJhbXMubWFya2VyU3BlZWQpID8gaGVhdFBhcmFtcy5tYXJrZXJTcGVlZCA6IHVuZGVmaW5lZCkgPz9cbiAgICAgICAgKHNoaXBIZWF0ICYmIHNoaXBIZWF0Lm1hcmtlclNwZWVkID4gMCA/IHNoaXBIZWF0Lm1hcmtlclNwZWVkIDogdW5kZWZpbmVkKTtcblxuICAgICAgaWYgKG1hcmtlclNwZWVkICE9PSB1bmRlZmluZWQgJiYgbWFya2VyU3BlZWQgPiAwKSB7XG4gICAgICAgIGNvbnN0IG1pbiA9IHBhcnNlRmxvYXQobWlzc2lsZVNwZWVkU2xpZGVyLm1pbik7XG4gICAgICAgIGNvbnN0IG1heCA9IHBhcnNlRmxvYXQobWlzc2lsZVNwZWVkU2xpZGVyLm1heCk7XG4gICAgICAgIGNvbnN0IHBlcmNlbnQgPSAoKG1hcmtlclNwZWVkIC0gbWluKSAvIChtYXggLSBtaW4pKSAqIDEwMDtcbiAgICAgICAgY29uc3QgY2xhbXBlZCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGVyY2VudCkpO1xuICAgICAgICBtaXNzaWxlU3BlZWRNYXJrZXIuc3R5bGUubGVmdCA9IGAke2NsYW1wZWR9JWA7XG4gICAgICAgIG1pc3NpbGVTcGVlZE1hcmtlci50aXRsZSA9IGBIZWF0IG5ldXRyYWw6ICR7TWF0aC5yb3VuZChtYXJrZXJTcGVlZCl9IHVuaXRzL3NgO1xuICAgICAgICBtaXNzaWxlU3BlZWRNYXJrZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pc3NpbGVTcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlU3RhbGxPdmVybGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IGhlYXQgPSBzdGF0ZS5tZT8uaGVhdDtcbiAgICBpZiAoIWhlYXQgfHwgIXN0YWxsT3ZlcmxheSkge1xuICAgICAgc3RhbGxBY3RpdmUgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBub3cgPVxuICAgICAgdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgICA/IHBlcmZvcm1hbmNlLm5vdygpXG4gICAgICAgIDogRGF0ZS5ub3coKTtcblxuICAgIGNvbnN0IGlzU3RhbGxlZCA9IG5vdyA8IGhlYXQuc3RhbGxVbnRpbE1zO1xuXG4gICAgaWYgKGlzU3RhbGxlZCkge1xuICAgICAgc3RhbGxPdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgICAgaWYgKCFzdGFsbEFjdGl2ZSkge1xuICAgICAgICBzdGFsbEFjdGl2ZSA9IHRydWU7XG4gICAgICAgIGJ1cy5lbWl0KFwiaGVhdDpzdGFsbFRyaWdnZXJlZFwiLCB7IHN0YWxsVW50aWw6IGhlYXQuc3RhbGxVbnRpbE1zIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdGFsbE92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgICBpZiAoc3RhbGxBY3RpdmUpIHtcbiAgICAgICAgc3RhbGxBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgYnVzLmVtaXQoXCJoZWF0OnN0YWxsUmVjb3ZlcmVkXCIsIHsgdmFsdWU6IGhlYXQudmFsdWUgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYWNoZURvbSxcbiAgICBiaW5kVUksXG4gICAgc2V0QWN0aXZlVG9vbCxcbiAgICBzZXRJbnB1dENvbnRleHQsXG4gICAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMsXG4gICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSxcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJLFxuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzLFxuICAgIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUsXG4gICAgdXBkYXRlSGVscE92ZXJsYXksXG4gICAgc2V0SGVscFZpc2libGUsXG4gICAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlLFxuICAgIHVwZGF0ZU1pc3NpbGVDb3VudERpc3BsYXksXG4gICAgdXBkYXRlQ3JhZnRUaW1lcixcbiAgICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzLFxuICAgIHVwZGF0ZVBsYW5uZWRIZWF0QmFyLFxuICAgIHVwZGF0ZVNwZWVkTWFya2VyLFxuICAgIHVwZGF0ZUhlYXRCYXIsXG4gICAgcHJvamVjdFBsYW5uZWRIZWF0LFxuICAgIGdldENhbnZhcyxcbiAgICBnZXRDb250ZXh0LFxuICAgIGFkanVzdFNoaXBTcGVlZCxcbiAgICBhZGp1c3RNaXNzaWxlQWdybyxcbiAgICBhZGp1c3RNaXNzaWxlU3BlZWQsXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHsgZ2V0QXBwcm94U2VydmVyTm93LCBzZW5kTWVzc2FnZSB9IGZyb20gXCIuL25ldFwiO1xuaW1wb3J0IHR5cGUgeyBBcHBTdGF0ZSwgVUlTdGF0ZSB9IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQgeyBjcmVhdGVDYW1lcmEgfSBmcm9tIFwiLi9nYW1lL2NhbWVyYVwiO1xuaW1wb3J0IHsgY3JlYXRlSW5wdXQgfSBmcm9tIFwiLi9nYW1lL2lucHV0XCI7XG5pbXBvcnQgeyBjcmVhdGVMb2dpYyB9IGZyb20gXCIuL2dhbWUvbG9naWNcIjtcbmltcG9ydCB7IGNyZWF0ZVJlbmRlcmVyIH0gZnJvbSBcIi4vZ2FtZS9yZW5kZXJcIjtcbmltcG9ydCB7IGNyZWF0ZVVJIH0gZnJvbSBcIi4vZ2FtZS91aVwiO1xuXG5pbnRlcmZhY2UgSW5pdEdhbWVPcHRpb25zIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xufVxuXG5pbnRlcmZhY2UgR2FtZUNvbnRyb2xsZXIge1xuICBvblN0YXRlVXBkYXRlZCgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH06IEluaXRHYW1lT3B0aW9ucyk6IEdhbWVDb250cm9sbGVyIHtcbiAgY29uc3QgY2FudmFzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImN2XCIpIGFzIEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbDtcbiAgaWYgKCFjYW52YXNFbCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbnZhcyBlbGVtZW50ICNjdiBub3QgZm91bmRcIik7XG4gIH1cblxuICBjb25zdCBjYW1lcmEgPSBjcmVhdGVDYW1lcmEoeyBjYW52YXM6IGNhbnZhc0VsLCBzdGF0ZSwgdWlTdGF0ZSB9KTtcbiAgY29uc3QgbG9naWMgPSBjcmVhdGVMb2dpYyh7XG4gICAgc3RhdGUsXG4gICAgdWlTdGF0ZSxcbiAgICBidXMsXG4gICAgc2VuZE1lc3NhZ2UsXG4gICAgZ2V0QXBwcm94U2VydmVyTm93LFxuICAgIGNhbWVyYSxcbiAgfSk7XG4gIGNvbnN0IHVpID0gY3JlYXRlVUkoe1xuICAgIHN0YXRlLFxuICAgIHVpU3RhdGUsXG4gICAgYnVzLFxuICAgIGxvZ2ljLFxuICAgIGNhbWVyYSxcbiAgICBzZW5kTWVzc2FnZSxcbiAgICBnZXRBcHByb3hTZXJ2ZXJOb3csXG4gIH0pO1xuXG4gIGNvbnN0IHsgY2FudmFzOiBjYWNoZWRDYW52YXMsIGN0eDogY2FjaGVkQ3R4IH0gPSB1aS5jYWNoZURvbSgpO1xuICBjb25zdCByZW5kZXJDYW52YXMgPSBjYWNoZWRDYW52YXMgPz8gY2FudmFzRWw7XG4gIGNvbnN0IHJlbmRlckN0eCA9IGNhY2hlZEN0eCA/PyByZW5kZXJDYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICBpZiAoIXJlbmRlckN0eCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlVuYWJsZSB0byBhY3F1aXJlIDJEIHJlbmRlcmluZyBjb250ZXh0XCIpO1xuICB9XG5cbiAgY29uc3QgcmVuZGVyZXIgPSBjcmVhdGVSZW5kZXJlcih7XG4gICAgY2FudmFzOiByZW5kZXJDYW52YXMsXG4gICAgY3R4OiByZW5kZXJDdHgsXG4gICAgc3RhdGUsXG4gICAgdWlTdGF0ZSxcbiAgICBjYW1lcmEsXG4gICAgbG9naWMsXG4gIH0pO1xuXG4gIGNvbnN0IGlucHV0ID0gY3JlYXRlSW5wdXQoe1xuICAgIGNhbnZhczogcmVuZGVyQ2FudmFzLFxuICAgIHVpLFxuICAgIGxvZ2ljLFxuICAgIGNhbWVyYSxcbiAgICBzdGF0ZSxcbiAgICB1aVN0YXRlLFxuICAgIGJ1cyxcbiAgICBzZW5kTWVzc2FnZSxcbiAgfSk7XG5cbiAgdWkuYmluZFVJKCk7XG4gIGlucHV0LmJpbmRJbnB1dCgpO1xuICBsb2dpYy5lbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgdWkuc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICB1aS51cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICB1aS5yZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gIHVpLnJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgdWkudXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgdWkudXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICB1aS51cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgdWkudXBkYXRlTWlzc2lsZUNvdW50RGlzcGxheSgpO1xuXG4gIGxldCBsYXN0TG9vcFRzOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBsb29wKHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodGltZXN0YW1wKSkge1xuICAgICAgdGltZXN0YW1wID0gbGFzdExvb3BUcyA/PyAwO1xuICAgIH1cblxuICAgIGxldCBkdFNlY29uZHMgPSAwO1xuICAgIGlmIChsYXN0TG9vcFRzICE9PSBudWxsKSB7XG4gICAgICBkdFNlY29uZHMgPSAodGltZXN0YW1wIC0gbGFzdExvb3BUcykgLyAxMDAwO1xuICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPCAwKSB7XG4gICAgICAgIGR0U2Vjb25kcyA9IDA7XG4gICAgICB9XG4gICAgfVxuICAgIGxhc3RMb29wVHMgPSB0aW1lc3RhbXA7XG5cbiAgICBsb2dpYy51cGRhdGVSb3V0ZUFuaW1hdGlvbnMoZHRTZWNvbmRzKTtcbiAgICByZW5kZXJlci5kcmF3U2NlbmUoKTtcbiAgICB1aS51cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgICB1aS51cGRhdGVDcmFmdFRpbWVyKCk7XG5cbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG4gIH1cblxuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG5cbiAgcmV0dXJuIHtcbiAgICBvblN0YXRlVXBkYXRlZCgpIHtcbiAgICAgIGxvZ2ljLmVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgdWkuc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICAgICAgdWkucmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgdWkucmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICAgICAgdWkudXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gICAgICB1aS51cGRhdGVNaXNzaWxlQ291bnREaXNwbGF5KCk7XG4gICAgICB1aS51cGRhdGVDcmFmdFRpbWVyKCk7XG4gICAgICB1aS51cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk7XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBjbGFtcCB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuXG5pbnRlcmZhY2UgSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMge1xuICB0YXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGJvZHk6IHN0cmluZztcbiAgc3RlcEluZGV4OiBudW1iZXI7XG4gIHN0ZXBDb3VudDogbnVtYmVyO1xuICBzaG93TmV4dDogYm9vbGVhbjtcbiAgbmV4dExhYmVsPzogc3RyaW5nO1xuICBvbk5leHQ/OiAoKSA9PiB2b2lkO1xuICBzaG93U2tpcDogYm9vbGVhbjtcbiAgc2tpcExhYmVsPzogc3RyaW5nO1xuICBvblNraXA/OiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhpZ2hsaWdodGVyIHtcbiAgc2hvdyhvcHRpb25zOiBIaWdobGlnaHRDb250ZW50T3B0aW9ucyk6IHZvaWQ7XG4gIGhpZGUoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5jb25zdCBTVFlMRV9JRCA9IFwidHV0b3JpYWwtb3ZlcmxheS1zdHlsZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSGlnaGxpZ2h0ZXIoKTogSGlnaGxpZ2h0ZXIge1xuICBlbnN1cmVTdHlsZXMoKTtcblxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgb3ZlcmxheS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlcIjtcbiAgb3ZlcmxheS5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxpdmVcIiwgXCJwb2xpdGVcIik7XG5cbiAgY29uc3Qgc2NyaW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzY3JpbS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3NjcmltXCI7XG5cbiAgY29uc3QgaGlnaGxpZ2h0Qm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGlnaGxpZ2h0Qm94LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9faGlnaGxpZ2h0XCI7XG5cbiAgY29uc3QgdG9vbHRpcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRvb2x0aXAuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X190b29sdGlwXCI7XG5cbiAgY29uc3QgcHJvZ3Jlc3MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBwcm9ncmVzcy5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzXCI7XG5cbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaDNcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fdGl0bGVcIjtcblxuICBjb25zdCBib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XG4gIGJvZHkuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19ib2R5XCI7XG5cbiAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zXCI7XG5cbiAgY29uc3Qgc2tpcEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIHNraXBCdG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIHNraXBCdG4uY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19idG4gdHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdFwiO1xuICBza2lwQnRuLnRleHRDb250ZW50ID0gXCJTa2lwXCI7XG5cbiAgY29uc3QgbmV4dEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIG5leHRCdG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIG5leHRCdG4uY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19idG4gdHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5XCI7XG4gIG5leHRCdG4udGV4dENvbnRlbnQgPSBcIk5leHRcIjtcblxuICBhY3Rpb25zLmFwcGVuZChza2lwQnRuLCBuZXh0QnRuKTtcbiAgdG9vbHRpcC5hcHBlbmQocHJvZ3Jlc3MsIHRpdGxlLCBib2R5LCBhY3Rpb25zKTtcbiAgb3ZlcmxheS5hcHBlbmQoc2NyaW0sIGhpZ2hsaWdodEJveCwgdG9vbHRpcCk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgbGV0IGN1cnJlbnRUYXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCB2aXNpYmxlID0gZmFsc2U7XG4gIGxldCByZXNpemVPYnNlcnZlcjogUmVzaXplT2JzZXJ2ZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IGZyYW1lSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IG9uTmV4dDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCBvblNraXA6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIHNjaGVkdWxlVXBkYXRlKCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSkgcmV0dXJuO1xuICAgIGlmIChmcmFtZUhhbmRsZSAhPT0gbnVsbCkgcmV0dXJuO1xuICAgIGZyYW1lSGFuZGxlID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICBmcmFtZUhhbmRsZSA9IG51bGw7XG4gICAgICB1cGRhdGVQb3NpdGlvbigpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlUG9zaXRpb24oKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG5cbiAgICBpZiAoY3VycmVudFRhcmdldCkge1xuICAgICAgY29uc3QgcmVjdCA9IGN1cnJlbnRUYXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBjb25zdCBwYWRkaW5nID0gMTI7XG4gICAgICBjb25zdCB3aWR0aCA9IE1hdGgubWF4KDAsIHJlY3Qud2lkdGggKyBwYWRkaW5nICogMik7XG4gICAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1heCgwLCByZWN0LmhlaWdodCArIHBhZGRpbmcgKiAyKTtcbiAgICAgIGNvbnN0IGxlZnQgPSByZWN0LmxlZnQgLSBwYWRkaW5nO1xuICAgICAgY29uc3QgdG9wID0gcmVjdC50b3AgLSBwYWRkaW5nO1xuXG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKGxlZnQpfXB4LCAke01hdGgucm91bmQodG9wKX1weClgO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLndpZHRoID0gYCR7TWF0aC5yb3VuZCh3aWR0aCl9cHhgO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLmhlaWdodCA9IGAke01hdGgucm91bmQoaGVpZ2h0KX1weGA7XG5cbiAgICAgIHRvb2x0aXAuc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJ2aXNpYmxlXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLm1heFdpZHRoID0gYG1pbigzNDBweCwgJHtNYXRoLm1heCgyNjAsIHdpbmRvdy5pbm5lcldpZHRoIC0gMzIpfXB4KWA7XG4gICAgICBjb25zdCB0b29sdGlwV2lkdGggPSB0b29sdGlwLm9mZnNldFdpZHRoO1xuICAgICAgY29uc3QgdG9vbHRpcEhlaWdodCA9IHRvb2x0aXAub2Zmc2V0SGVpZ2h0O1xuICAgICAgbGV0IHRvb2x0aXBUb3AgPSByZWN0LmJvdHRvbSArIDE4O1xuICAgICAgaWYgKHRvb2x0aXBUb3AgKyB0b29sdGlwSGVpZ2h0ID4gd2luZG93LmlubmVySGVpZ2h0IC0gMjApIHtcbiAgICAgICAgdG9vbHRpcFRvcCA9IE1hdGgubWF4KDIwLCByZWN0LnRvcCAtIHRvb2x0aXBIZWlnaHQgLSAxOCk7XG4gICAgICB9XG4gICAgICBsZXQgdG9vbHRpcExlZnQgPSByZWN0LmxlZnQgKyByZWN0LndpZHRoIC8gMiAtIHRvb2x0aXBXaWR0aCAvIDI7XG4gICAgICB0b29sdGlwTGVmdCA9IGNsYW1wKHRvb2x0aXBMZWZ0LCAyMCwgd2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGggLSAyMCk7XG4gICAgICB0b29sdGlwLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHRvb2x0aXBMZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvb2x0aXBUb3ApfXB4KWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUud2lkdGggPSBcIjBweFwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLmhlaWdodCA9IFwiMHB4XCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQod2luZG93LmlubmVyV2lkdGggLyAyKX1weCwgJHtNYXRoLnJvdW5kKHdpbmRvdy5pbm5lckhlaWdodCAvIDIpfXB4KWA7XG5cbiAgICAgIHRvb2x0aXAuc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJ2aXNpYmxlXCI7XG4gICAgICBjb25zdCB0b29sdGlwV2lkdGggPSB0b29sdGlwLm9mZnNldFdpZHRoO1xuICAgICAgY29uc3QgdG9vbHRpcEhlaWdodCA9IHRvb2x0aXAub2Zmc2V0SGVpZ2h0O1xuICAgICAgY29uc3QgdG9vbHRpcExlZnQgPSBjbGFtcCgod2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGgpIC8gMiwgMjAsIHdpbmRvdy5pbm5lcldpZHRoIC0gdG9vbHRpcFdpZHRoIC0gMjApO1xuICAgICAgY29uc3QgdG9vbHRpcFRvcCA9IGNsYW1wKCh3aW5kb3cuaW5uZXJIZWlnaHQgLSB0b29sdGlwSGVpZ2h0KSAvIDIsIDIwLCB3aW5kb3cuaW5uZXJIZWlnaHQgLSB0b29sdGlwSGVpZ2h0IC0gMjApO1xuICAgICAgdG9vbHRpcC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh0b29sdGlwTGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b29sdGlwVG9wKX1weClgO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaExpc3RlbmVycygpOiB2b2lkIHtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBzY2hlZHVsZVVwZGF0ZSwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIHNjaGVkdWxlVXBkYXRlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBkZXRhY2hMaXN0ZW5lcnMoKTogdm9pZCB7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgc2NoZWR1bGVVcGRhdGUpO1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIHNjaGVkdWxlVXBkYXRlKTtcbiAgICBpZiAoZnJhbWVIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZShmcmFtZUhhbmRsZSk7XG4gICAgICBmcmFtZUhhbmRsZSA9IG51bGw7XG4gICAgfVxuICAgIGlmIChyZXNpemVPYnNlcnZlcikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHNraXBCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgb25Ta2lwPy4oKTtcbiAgfSk7XG5cbiAgbmV4dEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBvbk5leHQ/LigpO1xuICB9KTtcblxuICBmdW5jdGlvbiByZW5kZXJUb29sdGlwKG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZCB7XG4gICAgY29uc3QgeyBzdGVwQ291bnQsIHN0ZXBJbmRleCwgdGl0bGU6IG9wdGlvblRpdGxlLCBib2R5OiBvcHRpb25Cb2R5LCBzaG93TmV4dCwgbmV4dExhYmVsLCBzaG93U2tpcCwgc2tpcExhYmVsIH0gPSBvcHRpb25zO1xuXG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShzdGVwQ291bnQpICYmIHN0ZXBDb3VudCA+IDApIHtcbiAgICAgIHByb2dyZXNzLnRleHRDb250ZW50ID0gYFN0ZXAgJHtzdGVwSW5kZXggKyAxfSBvZiAke3N0ZXBDb3VudH1gO1xuICAgICAgcHJvZ3Jlc3Muc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgcHJvZ3Jlc3MudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgcHJvZ3Jlc3Muc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIGlmIChvcHRpb25UaXRsZSAmJiBvcHRpb25UaXRsZS50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgdGl0bGUudGV4dENvbnRlbnQgPSBvcHRpb25UaXRsZTtcbiAgICAgIHRpdGxlLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRpdGxlLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIHRpdGxlLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBib2R5LnRleHRDb250ZW50ID0gb3B0aW9uQm9keTtcblxuICAgIG9uTmV4dCA9IHNob3dOZXh0ID8gb3B0aW9ucy5vbk5leHQgPz8gbnVsbCA6IG51bGw7XG4gICAgaWYgKHNob3dOZXh0KSB7XG4gICAgICBuZXh0QnRuLnRleHRDb250ZW50ID0gbmV4dExhYmVsID8/IFwiTmV4dFwiO1xuICAgICAgbmV4dEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJpbmxpbmUtZmxleFwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0QnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBvblNraXAgPSBzaG93U2tpcCA/IG9wdGlvbnMub25Ta2lwID8/IG51bGwgOiBudWxsO1xuICAgIGlmIChzaG93U2tpcCkge1xuICAgICAgc2tpcEJ0bi50ZXh0Q29udGVudCA9IHNraXBMYWJlbCA/PyBcIlNraXBcIjtcbiAgICAgIHNraXBCdG4uc3R5bGUuZGlzcGxheSA9IFwiaW5saW5lLWZsZXhcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgc2tpcEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvdyhvcHRpb25zOiBIaWdobGlnaHRDb250ZW50T3B0aW9ucyk6IHZvaWQge1xuICAgIHZpc2libGUgPSB0cnVlO1xuICAgIGN1cnJlbnRUYXJnZXQgPSBvcHRpb25zLnRhcmdldCA/PyBudWxsO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gICAgcmVuZGVyVG9vbHRpcChvcHRpb25zKTtcbiAgICBpZiAocmVzaXplT2JzZXJ2ZXIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKGN1cnJlbnRUYXJnZXQgJiYgdHlwZW9mIFJlc2l6ZU9ic2VydmVyICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcigoKSA9PiBzY2hlZHVsZVVwZGF0ZSgpKTtcbiAgICAgIHJlc2l6ZU9ic2VydmVyLm9ic2VydmUoY3VycmVudFRhcmdldCk7XG4gICAgfVxuICAgIGF0dGFjaExpc3RlbmVycygpO1xuICAgIHNjaGVkdWxlVXBkYXRlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBoaWRlKCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSkgcmV0dXJuO1xuICAgIHZpc2libGUgPSBmYWxzZTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIHRvb2x0aXAuc3R5bGUudmlzaWJpbGl0eSA9IFwiaGlkZGVuXCI7XG4gICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICBkZXRhY2hMaXN0ZW5lcnMoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgaGlkZSgpO1xuICAgIG92ZXJsYXkucmVtb3ZlKCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNob3csXG4gICAgaGlkZSxcbiAgICBkZXN0cm95LFxuICB9O1xufVxuXG5mdW5jdGlvbiBlbnN1cmVTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gIHN0eWxlLmlkID0gU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC50dXRvcmlhbC1vdmVybGF5IHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGluc2V0OiAwO1xuICAgICAgei1pbmRleDogNTA7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5LnZpc2libGUge1xuICAgICAgZGlzcGxheTogYmxvY2s7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19zY3JpbSB7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICBpbnNldDogMDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2hpZ2hsaWdodCB7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNHB4O1xuICAgICAgYm9yZGVyOiAycHggc29saWQgcmdiYSg1NiwgMTg5LCAyNDgsIDAuOTUpO1xuICAgICAgYm94LXNoYWRvdzogMCAwIDAgMnB4IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjI1KSwgMCAwIDI0cHggcmdiYSgzNCwgMjExLCAyMzgsIDAuMjUpO1xuICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMThzIGVhc2UsIHdpZHRoIDAuMThzIGVhc2UsIGhlaWdodCAwLjE4cyBlYXNlLCBvcGFjaXR5IDAuMThzIGVhc2U7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIG9wYWNpdHk6IDA7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X190b29sdGlwIHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIG1pbi13aWR0aDogMjQwcHg7XG4gICAgICBtYXgtd2lkdGg6IG1pbigzNDBweCwgY2FsYygxMDB2dyAtIDMycHgpKTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTUsIDIzLCA0MiwgMC45NSk7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTZweDtcbiAgICAgIHBhZGRpbmc6IDE2cHggMThweDtcbiAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgYm94LXNoYWRvdzogMCAxMnB4IDMycHggcmdiYSgxNSwgMjMsIDQyLCAwLjU1KTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICAgIHZpc2liaWxpdHk6IGhpZGRlbjtcbiAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlKDBweCwgMHB4KTtcbiAgICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE4cyBlYXNlLCBvcGFjaXR5IDAuMThzIGVhc2U7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19wcm9ncmVzcyB7XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wOGVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuNzUpO1xuICAgICAgbWFyZ2luOiAwIDAgOHB4O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fdGl0bGUge1xuICAgICAgbWFyZ2luOiAwIDAgOHB4O1xuICAgICAgZm9udC1zaXplOiAxNXB4O1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDRlbTtcbiAgICAgIGNvbG9yOiAjZjFmNWY5O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYm9keSB7XG4gICAgICBtYXJnaW46IDAgMCAxNHB4O1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuNTtcbiAgICAgIGNvbG9yOiAjY2JkNWY1O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYWN0aW9ucyB7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZ2FwOiAxMHB4O1xuICAgICAganVzdGlmeS1jb250ZW50OiBmbGV4LWVuZDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0biB7XG4gICAgICBmb250OiBpbmhlcml0O1xuICAgICAgcGFkZGluZzogNnB4IDE0cHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA5OTlweDtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnkge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjUpO1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC41NSk7XG4gICAgICBjb2xvcjogI2Y4ZmFmYztcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeTpob3ZlciB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4zNSk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0IHtcbiAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgY29sb3I6IHJnYmEoMjAzLCAyMTMsIDIyNSwgMC45KTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3Q6aG92ZXIge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDIwMywgMjEzLCAyMjUsIDAuNTUpO1xuICAgIH1cbiAgICBAbWVkaWEgKG1heC13aWR0aDogNzY4cHgpIHtcbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X190b29sdGlwIHtcbiAgICAgICAgbWluLXdpZHRoOiAyMDBweDtcbiAgICAgICAgbWF4LXdpZHRoOiBtaW4oMzIwcHgsIGNhbGMoMTAwdncgLSAyNHB4KSk7XG4gICAgICAgIHBhZGRpbmc6IDEwcHggMTJweDtcbiAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgZmxleC1kaXJlY3Rpb246IHJvdztcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgZ2FwOiAxMnB4O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzIHtcbiAgICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3RpdGxlIHtcbiAgICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2JvZHkge1xuICAgICAgICBtYXJnaW46IDA7XG4gICAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgICAgZmxleDogMTtcbiAgICAgICAgbGluZS1oZWlnaHQ6IDEuNDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zIHtcbiAgICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgICAgZ2FwOiA2cHg7XG4gICAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0biB7XG4gICAgICAgIHBhZGRpbmc6IDVweCAxMHB4O1xuICAgICAgICBmb250LXNpemU6IDEwcHg7XG4gICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICB9XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cbiIsICJjb25zdCBTVE9SQUdFX1BSRUZJWCA9IFwibHNkOnR1dG9yaWFsOlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsUHJvZ3Jlc3Mge1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgY29tcGxldGVkOiBib29sZWFuO1xuICB1cGRhdGVkQXQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZ2V0U3RvcmFnZSgpOiBTdG9yYWdlIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIgfHwgIXdpbmRvdy5sb2NhbFN0b3JhZ2UpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkUHJvZ3Jlc3MoaWQ6IHN0cmluZyk6IFR1dG9yaWFsUHJvZ3Jlc3MgfCBudWxsIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSBzdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCk7XG4gICAgaWYgKCFyYXcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBUdXRvcmlhbFByb2dyZXNzO1xuICAgIGlmIChcbiAgICAgIHR5cGVvZiBwYXJzZWQgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkID09PSBudWxsIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnN0ZXBJbmRleCAhPT0gXCJudW1iZXJcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5jb21wbGV0ZWQgIT09IFwiYm9vbGVhblwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnVwZGF0ZWRBdCAhPT0gXCJudW1iZXJcIlxuICAgICkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZWQ7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlUHJvZ3Jlc3MoaWQ6IHN0cmluZywgcHJvZ3Jlc3M6IFR1dG9yaWFsUHJvZ3Jlc3MpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfUFJFRklYICsgaWQsIEpTT04uc3RyaW5naWZ5KHByb2dyZXNzKSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIGlnbm9yZSBzdG9yYWdlIGZhaWx1cmVzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyUHJvZ3Jlc3MoaWQ6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnJlbW92ZUl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIGlnbm9yZSBzdG9yYWdlIGZhaWx1cmVzXG4gIH1cbn1cbiIsICJleHBvcnQgdHlwZSBSb2xlSWQgPVxuICB8IFwiY2FudmFzXCJcbiAgfCBcInNoaXBTZXRcIlxuICB8IFwic2hpcFNlbGVjdFwiXG4gIHwgXCJzaGlwRGVsZXRlXCJcbiAgfCBcInNoaXBDbGVhclwiXG4gIHwgXCJzaGlwU3BlZWRTbGlkZXJcIlxuICB8IFwiaGVhdEJhclwiXG4gIHwgXCJzcGVlZE1hcmtlclwiXG4gIHwgXCJtaXNzaWxlU2V0XCJcbiAgfCBcIm1pc3NpbGVTZWxlY3RcIlxuICB8IFwibWlzc2lsZURlbGV0ZVwiXG4gIHwgXCJtaXNzaWxlU3BlZWRTbGlkZXJcIlxuICB8IFwibWlzc2lsZUFncm9TbGlkZXJcIlxuICB8IFwibWlzc2lsZUFkZFJvdXRlXCJcbiAgfCBcIm1pc3NpbGVMYXVuY2hcIlxuICB8IFwicm91dGVQcmV2XCJcbiAgfCBcInJvdXRlTmV4dFwiXG4gIHwgXCJoZWxwVG9nZ2xlXCJcbiAgfCBcInR1dG9yaWFsU3RhcnRcIlxuICB8IFwic3Bhd25Cb3RcIjtcblxuZXhwb3J0IHR5cGUgUm9sZVJlc29sdmVyID0gKCkgPT4gSFRNTEVsZW1lbnQgfCBudWxsO1xuXG5leHBvcnQgdHlwZSBSb2xlc01hcCA9IFJlY29yZDxSb2xlSWQsIFJvbGVSZXNvbHZlcj47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSb2xlcygpOiBSb2xlc01hcCB7XG4gIHJldHVybiB7XG4gICAgY2FudmFzOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImN2XCIpLFxuICAgIHNoaXBTZXQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZXRcIiksXG4gICAgc2hpcFNlbGVjdDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSxcbiAgICBzaGlwRGVsZXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtZGVsZXRlXCIpLFxuICAgIHNoaXBDbGVhcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNsZWFyXCIpLFxuICAgIHNoaXBTcGVlZFNsaWRlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXNsaWRlclwiKSxcbiAgICBoZWF0QmFyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlYXQtYmFyLWNvbnRhaW5lclwiKSxcbiAgICBzcGVlZE1hcmtlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGVlZC1tYXJrZXJcIiksXG4gICAgbWlzc2lsZVNldDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSxcbiAgICBtaXNzaWxlU2VsZWN0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2VsZWN0XCIpLFxuICAgIG1pc3NpbGVEZWxldGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1kZWxldGVcIiksXG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtc2xpZGVyXCIpLFxuICAgIG1pc3NpbGVBZ3JvU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1zbGlkZXJcIiksXG4gICAgbWlzc2lsZUFkZFJvdXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWRkLXJvdXRlXCIpLFxuICAgIG1pc3NpbGVMYXVuY2g6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2hcIiksXG4gICAgcm91dGVQcmV2OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIiksXG4gICAgcm91dGVOZXh0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW5leHRcIiksXG4gICAgaGVscFRvZ2dsZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSxcbiAgICB0dXRvcmlhbFN0YXJ0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInR1dG9yaWFsLXN0YXJ0XCIpLFxuICAgIHNwYXduQm90OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdFwiKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJvbGVFbGVtZW50KHJvbGVzOiBSb2xlc01hcCwgcm9sZTogUm9sZUlkIHwgbnVsbCB8IHVuZGVmaW5lZCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGlmICghcm9sZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJlc29sdmVyID0gcm9sZXNbcm9sZV07XG4gIHJldHVybiByZXNvbHZlciA/IHJlc29sdmVyKCkgOiBudWxsO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMsIEV2ZW50S2V5IH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlSGlnaGxpZ2h0ZXIsIHR5cGUgSGlnaGxpZ2h0ZXIgfSBmcm9tIFwiLi9oaWdobGlnaHRcIjtcbmltcG9ydCB7IGNsZWFyUHJvZ3Jlc3MsIGxvYWRQcm9ncmVzcywgc2F2ZVByb2dyZXNzIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuaW1wb3J0IHsgZ2V0Um9sZUVsZW1lbnQsIHR5cGUgUm9sZUlkLCB0eXBlIFJvbGVzTWFwIH0gZnJvbSBcIi4vcm9sZXNcIjtcblxuZXhwb3J0IHR5cGUgU3RlcEFkdmFuY2UgPVxuICB8IHtcbiAgICAgIGtpbmQ6IFwiZXZlbnRcIjtcbiAgICAgIGV2ZW50OiBFdmVudEtleTtcbiAgICAgIHdoZW4/OiAocGF5bG9hZDogdW5rbm93bikgPT4gYm9vbGVhbjtcbiAgICAgIGNoZWNrPzogKCkgPT4gYm9vbGVhbjtcbiAgICB9XG4gIHwge1xuICAgICAga2luZDogXCJtYW51YWxcIjtcbiAgICAgIG5leHRMYWJlbD86IHN0cmluZztcbiAgICB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsU3RlcCB7XG4gIGlkOiBzdHJpbmc7XG4gIHRhcmdldDogUm9sZUlkIHwgKCgpID0+IEhUTUxFbGVtZW50IHwgbnVsbCkgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBhZHZhbmNlOiBTdGVwQWR2YW5jZTtcbiAgb25FbnRlcj86ICgpID0+IHZvaWQ7XG4gIG9uRXhpdD86ICgpID0+IHZvaWQ7XG4gIGFsbG93U2tpcD86IGJvb2xlYW47XG4gIHNraXBMYWJlbD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEVuZ2luZU9wdGlvbnMge1xuICBpZDogc3RyaW5nO1xuICBidXM6IEV2ZW50QnVzO1xuICByb2xlczogUm9sZXNNYXA7XG4gIHN0ZXBzOiBUdXRvcmlhbFN0ZXBbXTtcbn1cblxuaW50ZXJmYWNlIFN0YXJ0T3B0aW9ucyB7XG4gIHJlc3VtZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxFbmdpbmUge1xuICBzdGFydChvcHRpb25zPzogU3RhcnRPcHRpb25zKTogdm9pZDtcbiAgcmVzdGFydCgpOiB2b2lkO1xuICBzdG9wKCk6IHZvaWQ7XG4gIGlzUnVubmluZygpOiBib29sZWFuO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUdXRvcmlhbEVuZ2luZSh7IGlkLCBidXMsIHJvbGVzLCBzdGVwcyB9OiBFbmdpbmVPcHRpb25zKTogVHV0b3JpYWxFbmdpbmUge1xuICBjb25zdCBoaWdobGlnaHRlcjogSGlnaGxpZ2h0ZXIgPSBjcmVhdGVIaWdobGlnaHRlcigpO1xuICBsZXQgcnVubmluZyA9IGZhbHNlO1xuICBsZXQgcGF1c2VkID0gZmFsc2U7XG4gIGxldCBjdXJyZW50SW5kZXggPSAtMTtcbiAgbGV0IGN1cnJlbnRTdGVwOiBUdXRvcmlhbFN0ZXAgfCBudWxsID0gbnVsbDtcbiAgbGV0IGNsZWFudXBDdXJyZW50OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IHJlbmRlckN1cnJlbnQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgbGFzdFNhdmVkQ29tcGxldGVkID0gZmFsc2U7XG4gIGxldCBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcblxuICBjb25zdCBwZXJzaXN0ZW50TGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuXG4gIHBlcnNpc3RlbnRMaXN0ZW5lcnMucHVzaChcbiAgICBidXMub24oXCJoZWxwOnZpc2libGVDaGFuZ2VkXCIsICh7IHZpc2libGUgfSkgPT4ge1xuICAgICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgICBwYXVzZWQgPSBCb29sZWFuKHZpc2libGUpO1xuICAgICAgaWYgKHBhdXNlZCkge1xuICAgICAgICBoaWdobGlnaHRlci5oaWRlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZW5kZXJDdXJyZW50Py4oKTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcblxuICBmdW5jdGlvbiByZXNvbHZlVGFyZ2V0KHN0ZXA6IFR1dG9yaWFsU3RlcCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gICAgaWYgKCFzdGVwLnRhcmdldCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygc3RlcC50YXJnZXQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgcmV0dXJuIHN0ZXAudGFyZ2V0KCk7XG4gICAgfVxuICAgIHJldHVybiBnZXRSb2xlRWxlbWVudChyb2xlcywgc3RlcC50YXJnZXQpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2xhbXBJbmRleChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShpbmRleCkgfHwgaW5kZXggPCAwKSByZXR1cm4gMDtcbiAgICBpZiAoaW5kZXggPj0gc3RlcHMubGVuZ3RoKSByZXR1cm4gc3RlcHMubGVuZ3RoIC0gMTtcbiAgICByZXR1cm4gTWF0aC5mbG9vcihpbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTdGVwKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gc3RlcHMubGVuZ3RoKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cblxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG5cbiAgICBjdXJyZW50SW5kZXggPSBpbmRleDtcbiAgICBjb25zdCBzdGVwID0gc3RlcHNbaW5kZXhdO1xuICAgIGN1cnJlbnRTdGVwID0gc3RlcDtcblxuICAgIHBlcnNpc3RQcm9ncmVzcyhpbmRleCwgZmFsc2UpO1xuXG4gICAgYnVzLmVtaXQoXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiLCB7IGlkLCBzdGVwSW5kZXg6IGluZGV4LCB0b3RhbDogc3RlcHMubGVuZ3RoIH0pO1xuICAgIHN0ZXAub25FbnRlcj8uKCk7XG5cbiAgICBjb25zdCBhbGxvd1NraXAgPSBzdGVwLmFsbG93U2tpcCAhPT0gZmFsc2U7XG4gICAgY29uc3QgcmVuZGVyID0gKCk6IHZvaWQgPT4ge1xuICAgICAgaWYgKCFydW5uaW5nIHx8IHBhdXNlZCkgcmV0dXJuO1xuICAgICAgaGlnaGxpZ2h0ZXIuc2hvdyh7XG4gICAgICAgIHRhcmdldDogcmVzb2x2ZVRhcmdldChzdGVwKSxcbiAgICAgICAgdGl0bGU6IHN0ZXAudGl0bGUsXG4gICAgICAgIGJvZHk6IHN0ZXAuYm9keSxcbiAgICAgICAgc3RlcEluZGV4OiBpbmRleCxcbiAgICAgICAgc3RlcENvdW50OiBzdGVwcy5sZW5ndGgsXG4gICAgICAgIHNob3dOZXh0OiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIixcbiAgICAgICAgbmV4dExhYmVsOiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIlxuICAgICAgICAgID8gc3RlcC5hZHZhbmNlLm5leHRMYWJlbCA/PyAoaW5kZXggPT09IHN0ZXBzLmxlbmd0aCAtIDEgPyBcIkZpbmlzaFwiIDogXCJOZXh0XCIpXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIG9uTmV4dDogc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwibWFudWFsXCIgPyBhZHZhbmNlU3RlcCA6IHVuZGVmaW5lZCxcbiAgICAgICAgc2hvd1NraXA6IGFsbG93U2tpcCxcbiAgICAgICAgc2tpcExhYmVsOiBzdGVwLnNraXBMYWJlbCxcbiAgICAgICAgb25Ta2lwOiBhbGxvd1NraXAgPyBza2lwQ3VycmVudFN0ZXAgOiB1bmRlZmluZWQsXG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmVuZGVyQ3VycmVudCA9IHJlbmRlcjtcbiAgICByZW5kZXIoKTtcblxuICAgIGlmIChzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJldmVudFwiKSB7XG4gICAgICBjb25zdCBoYW5kbGVyID0gKHBheWxvYWQ6IHVua25vd24pOiB2b2lkID0+IHtcbiAgICAgICAgaWYgKCFydW5uaW5nIHx8IHBhdXNlZCkgcmV0dXJuO1xuICAgICAgICBpZiAoc3RlcC5hZHZhbmNlLndoZW4gJiYgIXN0ZXAuYWR2YW5jZS53aGVuKHBheWxvYWQpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2VUbyhpbmRleCArIDEpO1xuICAgICAgfTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gYnVzLm9uKHN0ZXAuYWR2YW5jZS5ldmVudCwgaGFuZGxlciBhcyAodmFsdWU6IG5ldmVyKSA9PiB2b2lkKTtcbiAgICAgIGlmIChzdGVwLmFkdmFuY2UuY2hlY2sgJiYgc3RlcC5hZHZhbmNlLmNoZWNrKCkpIHtcbiAgICAgICAgaGFuZGxlcih1bmRlZmluZWQpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYWR2YW5jZVRvKG5leHRJbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuICAgIHJlbmRlckN1cnJlbnQgPSBudWxsO1xuICAgIGlmIChuZXh0SW5kZXggPj0gc3RlcHMubGVuZ3RoKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldFN0ZXAobmV4dEluZGV4KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlU3RlcCgpOiB2b2lkIHtcbiAgICBhZHZhbmNlVG8oY3VycmVudEluZGV4ICsgMSk7XG4gIH1cblxuICBmdW5jdGlvbiBza2lwQ3VycmVudFN0ZXAoKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgY29uc3QgbmV4dEluZGV4ID0gY3VycmVudEluZGV4ID49IDAgPyBjdXJyZW50SW5kZXggKyAxIDogMDtcbiAgICBhZHZhbmNlVG8obmV4dEluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBsZXRlVHV0b3JpYWwoKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gdHJ1ZTtcbiAgICBwZXJzaXN0UHJvZ3Jlc3Moc3RlcHMubGVuZ3RoLCB0cnVlKTtcbiAgICBidXMuZW1pdChcInR1dG9yaWFsOmNvbXBsZXRlZFwiLCB7IGlkIH0pO1xuICAgIHN0b3AoKTtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0KG9wdGlvbnM/OiBTdGFydE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCByZXN1bWUgPSBvcHRpb25zPy5yZXN1bWUgIT09IGZhbHNlO1xuICAgIGlmIChydW5uaW5nKSB7XG4gICAgICByZXN0YXJ0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcnVubmluZyA9IHRydWU7XG4gICAgcGF1c2VkID0gZmFsc2U7XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gZmFsc2U7XG4gICAgbGFzdFNhdmVkQ29tcGxldGVkID0gZmFsc2U7XG4gICAgbGV0IHN0YXJ0SW5kZXggPSAwO1xuICAgIGlmIChyZXN1bWUpIHtcbiAgICAgIGNvbnN0IHByb2dyZXNzID0gbG9hZFByb2dyZXNzKGlkKTtcbiAgICAgIGlmIChwcm9ncmVzcyAmJiAhcHJvZ3Jlc3MuY29tcGxldGVkKSB7XG4gICAgICAgIHN0YXJ0SW5kZXggPSBjbGFtcEluZGV4KHByb2dyZXNzLnN0ZXBJbmRleCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFyUHJvZ3Jlc3MoaWQpO1xuICAgIH1cbiAgICBidXMuZW1pdChcInR1dG9yaWFsOnN0YXJ0ZWRcIiwgeyBpZCB9KTtcbiAgICBzZXRTdGVwKHN0YXJ0SW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVzdGFydCgpOiB2b2lkIHtcbiAgICBzdG9wKCk7XG4gICAgc3RhcnQoeyByZXN1bWU6IGZhbHNlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RvcCgpOiB2b2lkIHtcbiAgICBjb25zdCBzaG91bGRQZXJzaXN0ID0gIXN1cHByZXNzUGVyc2lzdE9uU3RvcCAmJiBydW5uaW5nICYmICFsYXN0U2F2ZWRDb21wbGV0ZWQgJiYgY3VycmVudEluZGV4ID49IDAgJiYgY3VycmVudEluZGV4IDwgc3RlcHMubGVuZ3RoO1xuICAgIGNvbnN0IGluZGV4VG9QZXJzaXN0ID0gY3VycmVudEluZGV4O1xuXG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChzaG91bGRQZXJzaXN0KSB7XG4gICAgICBwZXJzaXN0UHJvZ3Jlc3MoaW5kZXhUb1BlcnNpc3QsIGZhbHNlKTtcbiAgICB9XG4gICAgcnVubmluZyA9IGZhbHNlO1xuICAgIHBhdXNlZCA9IGZhbHNlO1xuICAgIGN1cnJlbnRJbmRleCA9IC0xO1xuICAgIHJlbmRlckN1cnJlbnQgPSBudWxsO1xuICAgIGhpZ2hsaWdodGVyLmhpZGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzUnVubmluZygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gcnVubmluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgc3RvcCgpO1xuICAgIGZvciAoY29uc3QgZGlzcG9zZSBvZiBwZXJzaXN0ZW50TGlzdGVuZXJzKSB7XG4gICAgICBkaXNwb3NlKCk7XG4gICAgfVxuICAgIGhpZ2hsaWdodGVyLmRlc3Ryb3koKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBlcnNpc3RQcm9ncmVzcyhzdGVwSW5kZXg6IG51bWJlciwgY29tcGxldGVkOiBib29sZWFuKTogdm9pZCB7XG4gICAgbGFzdFNhdmVkQ29tcGxldGVkID0gY29tcGxldGVkO1xuICAgIHNhdmVQcm9ncmVzcyhpZCwge1xuICAgICAgc3RlcEluZGV4LFxuICAgICAgY29tcGxldGVkLFxuICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydCxcbiAgICByZXN0YXJ0LFxuICAgIHN0b3AsXG4gICAgaXNSdW5uaW5nLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBUdXRvcmlhbFN0ZXAgfSBmcm9tIFwiLi9lbmdpbmVcIjtcblxuZnVuY3Rpb24gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZDogdW5rbm93biwgbWluSW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBpbmRleCA9IChwYXlsb2FkIGFzIHsgaW5kZXg/OiB1bmtub3duIH0pLmluZGV4O1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSBcIm51bWJlclwiIHx8ICFOdW1iZXIuaXNGaW5pdGUoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBpbmRleCA+PSBtaW5JbmRleDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFJvdXRlSWQocGF5bG9hZDogdW5rbm93bik6IHN0cmluZyB8IG51bGwge1xuICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvdXRlSWQgPSAocGF5bG9hZCBhcyB7IHJvdXRlSWQ/OiB1bmtub3duIH0pLnJvdXRlSWQ7XG4gIHJldHVybiB0eXBlb2Ygcm91dGVJZCA9PT0gXCJzdHJpbmdcIiA/IHJvdXRlSWQgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXlsb2FkVG9vbEVxdWFscyh0YXJnZXQ6IHN0cmluZyk6IChwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuIHtcbiAgcmV0dXJuIChwYXlsb2FkOiB1bmtub3duKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiIHx8IHBheWxvYWQgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCB0b29sID0gKHBheWxvYWQgYXMgeyB0b29sPzogdW5rbm93biB9KS50b29sO1xuICAgIHJldHVybiB0eXBlb2YgdG9vbCA9PT0gXCJzdHJpbmdcIiAmJiB0b29sID09PSB0YXJnZXQ7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCYXNpY1R1dG9yaWFsU3RlcHMoKTogVHV0b3JpYWxTdGVwW10ge1xuICBsZXQgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPSAwO1xuICBsZXQgaW5pdGlhbFJvdXRlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgbmV3Um91dGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgcmV0dXJuIFtcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLXBsb3Qtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgYSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJDbGljayBvbiB0aGUgbWFwIHRvIGRyb3AgYXQgbGVhc3QgdGhyZWUgd2F5cG9pbnRzIGFuZCBza2V0Y2ggeW91ciBjb3Vyc2UuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAyKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWNoYW5nZS1zcGVlZFwiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBTcGVlZFNsaWRlclwiLFxuICAgICAgdGl0bGU6IFwiQWRqdXN0IHNoaXAgc3BlZWRcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBTaGlwIFNwZWVkIHNsaWRlciAob3IgcHJlc3MgWyAvIF0pIHRvIGZpbmUtdHVuZSB5b3VyIHRyYXZlbCBzcGVlZC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtc2VsZWN0LWxlZ1wiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBTZWxlY3RcIixcbiAgICAgIHRpdGxlOiBcIlNlbGVjdCBhIHJvdXRlIGxlZ1wiLFxuICAgICAgYm9keTogXCJTd2l0Y2ggdG8gU2VsZWN0IG1vZGUgKFQga2V5KSBhbmQgdGhlbiBjbGljayBhIHdheXBvaW50IG9uIHRoZSBtYXAgdG8gaGlnaGxpZ2h0IGl0cyBsZWcuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpsZWdTZWxlY3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMCksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1tYXRjaC1tYXJrZXJcIixcbiAgICAgIHRhcmdldDogXCJzcGVlZE1hcmtlclwiLFxuICAgICAgdGl0bGU6IFwiTWF0Y2ggdGhlIG1hcmtlclwiLFxuICAgICAgYm9keTogXCJMaW5lIHVwIHRoZSBTaGlwIFNwZWVkIHNsaWRlciB3aXRoIHRoZSB0aWNrIHRvIGNydWlzZSBhdCB0aGUgbmV1dHJhbCBoZWF0IHNwZWVkLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6bWFya2VyQWxpZ25lZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LXB1c2gtaG90XCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiU3ByaW50IGludG8gdGhlIHJlZFwiLFxuICAgICAgYm9keTogXCJQdXNoIHRoZSB0aHJvdHRsZSBhYm92ZSB0aGUgbWFya2VyIGFuZCB3YXRjaCB0aGUgaGVhdCBiYXIgcmVhY2ggdGhlIHdhcm5pbmcgYmFuZC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0Ondhcm5FbnRlcmVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtY29vbC1kb3duXCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiQ29vbCBpdCBiYWNrIGRvd25cIixcbiAgICAgIGJvZHk6IFwiRWFzZSBvZmYgYmVsb3cgdGhlIG1hcmtlciB1bnRpbCB0aGUgYmFyIGRyb3BzIG91dCBvZiB0aGUgd2FybmluZyB6b25lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtdHJpZ2dlci1zdGFsbFwiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIlRyaWdnZXIgYSBzdGFsbFwiLFxuICAgICAgYm9keTogXCJQdXNoIHdlbGwgYWJvdmUgdGhlIGxpbWl0IGFuZCBob2xkIGl0IHVudGlsIHRoZSBvdmVyaGVhdCBzdGFsbCBvdmVybGF5IGFwcGVhcnMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDpzdGFsbFRyaWdnZXJlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LXJlY292ZXItc3RhbGxcIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJSZWNvdmVyIGZyb20gdGhlIHN0YWxsXCIsXG4gICAgICBib2R5OiBcIkhvbGQgc3RlYWR5IHdoaWxlIHN5c3RlbXMgY29vbC4gT25jZSB0aGUgb3ZlcmxheSBjbGVhcnMsIHlvdVx1MjAxOXJlIGJhY2sgb25saW5lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6c3RhbGxSZWNvdmVyZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1kdWFsLWJhcnNcIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJSZWFkIGJvdGggaGVhdCBiYXJzXCIsXG4gICAgICBib2R5OiBcIkFkanVzdCBhIHdheXBvaW50IHRvIG1ha2UgdGhlIHBsYW5uZWQgYmFyIGV4dGVuZCBwYXN0IGxpdmUgaGVhdC4gVXNlIGl0IHRvIHByZWRpY3QgZnV0dXJlIG92ZXJsb2Fkcy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtZGVsZXRlLWxlZ1wiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBEZWxldGVcIixcbiAgICAgIHRpdGxlOiBcIkRlbGV0ZSBhIHJvdXRlIGxlZ1wiLFxuICAgICAgYm9keTogXCJSZW1vdmUgdGhlIHNlbGVjdGVkIHdheXBvaW50IHVzaW5nIHRoZSBEZWxldGUgY29udHJvbCBvciB0aGUgRGVsZXRlIGtleS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOndheXBvaW50RGVsZXRlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtY2xlYXItcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJzaGlwQ2xlYXJcIixcbiAgICAgIHRpdGxlOiBcIkNsZWFyIHRoZSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJDbGVhciByZW1haW5pbmcgd2F5cG9pbnRzIHRvIHJlc2V0IHlvdXIgcGxvdHRlZCBjb3Vyc2UuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpjbGVhckludm9rZWRcIixcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXNldC1tb2RlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZVNldFwiLFxuICAgICAgdGl0bGU6IFwiU3dpdGNoIHRvIG1pc3NpbGUgcGxhbm5pbmdcIixcbiAgICAgIGJvZHk6IFwiVGFwIFNldCBzbyBldmVyeSBjbGljayBkcm9wcyBtaXNzaWxlIHdheXBvaW50cyBvbiB0aGUgYWN0aXZlIHJvdXRlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIixcbiAgICAgICAgd2hlbjogcGF5bG9hZFRvb2xFcXVhbHMoXCJzZXRcIiksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1wbG90LWluaXRpYWxcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgbWlzc2lsZSB3YXlwb2ludHNcIixcbiAgICAgIGJvZHk6IFwiQ2xpY2sgdGhlIG1hcCB0byBkcm9wIGF0IGxlYXN0IHR3byBndWlkYW5jZSBwb2ludHMgZm9yIHRoZSBjdXJyZW50IG1pc3NpbGUgcm91dGUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgaWYgKCFoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAxKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAocm91dGVJZCkge1xuICAgICAgICAgICAgaW5pdGlhbFJvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1pbml0aWFsXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIHRoZSBzdHJpa2VcIixcbiAgICAgIGJvZHk6IFwiU2VuZCB0aGUgcGxhbm5lZCBtaXNzaWxlIHJvdXRlIGxpdmUgd2l0aCB0aGUgTGF1bmNoIGNvbnRyb2wgKEwga2V5KS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQpIHtcbiAgICAgICAgICAgIGluaXRpYWxSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gaW5pdGlhbFJvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1hZGQtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlQWRkUm91dGVcIixcbiAgICAgIHRpdGxlOiBcIkNyZWF0ZSBhIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIlByZXNzIE5ldyB0byBhZGQgYSBzZWNvbmQgbWlzc2lsZSByb3V0ZSBmb3IgYW5vdGhlciBzdHJpa2UgZ3JvdXAuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpyb3V0ZUFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghcm91dGVJZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIG5ld1JvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtcGxvdC1uZXctcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgdGhlIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkRyb3AgYXQgbGVhc3QgdHdvIHdheXBvaW50cyBvbiB0aGUgbmV3IHJvdXRlIHRvIGRlZmluZSBpdHMgcGF0aC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBpZiAoIWhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDEpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmIChuZXdSb3V0ZUlkICYmIHJvdXRlSWQgJiYgcm91dGVJZCAhPT0gbmV3Um91dGVJZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIW5ld1JvdXRlSWQgJiYgcm91dGVJZCkge1xuICAgICAgICAgICAgbmV3Um91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLW5ldy1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCB0aGUgbmV3IHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkxhdW5jaCB0aGUgZnJlc2ggbWlzc2lsZSByb3V0ZSB0byBjb25maXJtIGl0cyBwYXR0ZXJuLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghbmV3Um91dGVJZCB8fCAhcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IG5ld1JvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1zd2l0Y2gtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJyb3V0ZU5leHRcIixcbiAgICAgIHRpdGxlOiBcIlN3aXRjaCBiYWNrIHRvIHRoZSBvcmlnaW5hbCByb3V0ZVwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIFx1MjVDMCBcdTI1QjYgY29udHJvbHMgKG9yIFRhYi9TaGlmdCtUYWIpIHRvIHNlbGVjdCB5b3VyIGZpcnN0IG1pc3NpbGUgcm91dGUgYWdhaW4uXCIsXG4gICAgICBvbkVudGVyOiAoKSA9PiB7XG4gICAgICAgIHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyID0gMDtcbiAgICAgIH0sXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciArPSAxO1xuICAgICAgICAgIGlmIChyb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA8IDEpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCB8fCAhcm91dGVJZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1hZnRlci1zd2l0Y2hcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggZnJvbSB0aGUgb3RoZXIgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiRmlyZSB0aGUgb3JpZ2luYWwgbWlzc2lsZSByb3V0ZSB0byBwcmFjdGljZSByb3VuZC1yb2JpbiBzdHJpa2VzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQgfHwgIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJ0dXRvcmlhbC1wcmFjdGljZVwiLFxuICAgICAgdGFyZ2V0OiBcInNwYXduQm90XCIsXG4gICAgICB0aXRsZTogXCJTcGF3biBhIHByYWN0aWNlIGJvdFwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIEJvdCBjb250cm9sIHRvIGFkZCBhIHRhcmdldCBhbmQgcmVoZWFyc2UgdGhlc2UgbWFuZXV2ZXJzIGluIHJlYWwgdGltZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwidHV0b3JpYWwtY29tcGxldGVcIixcbiAgICAgIHRhcmdldDogbnVsbCxcbiAgICAgIHRpdGxlOiBcIllvdVx1MjAxOXJlIHJlYWR5XCIsXG4gICAgICBib2R5OiBcIkdyZWF0IHdvcmsuIFJlbG9hZCB0aGUgY29uc29sZSBvciByZWpvaW4gYSByb29tIHRvIHJldmlzaXQgdGhlc2UgZHJpbGxzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcIm1hbnVhbFwiLFxuICAgICAgICBuZXh0TGFiZWw6IFwiRmluaXNoXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICBdO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVUdXRvcmlhbEVuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgY3JlYXRlUm9sZXMgfSBmcm9tIFwiLi9yb2xlc1wiO1xuaW1wb3J0IHsgZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzIH0gZnJvbSBcIi4vc3RlcHNfYmFzaWNcIjtcbmV4cG9ydCBjb25zdCBCQVNJQ19UVVRPUklBTF9JRCA9IFwic2hpcC1iYXNpY3NcIjtcblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbENvbnRyb2xsZXIge1xuICBzdGFydChvcHRpb25zPzogeyByZXN1bWU/OiBib29sZWFuIH0pOiB2b2lkO1xuICByZXN0YXJ0KCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50VHV0b3JpYWwoYnVzOiBFdmVudEJ1cyk6IFR1dG9yaWFsQ29udHJvbGxlciB7XG4gIGNvbnN0IHJvbGVzID0gY3JlYXRlUm9sZXMoKTtcbiAgY29uc3QgZW5naW5lID0gY3JlYXRlVHV0b3JpYWxFbmdpbmUoe1xuICAgIGlkOiBCQVNJQ19UVVRPUklBTF9JRCxcbiAgICBidXMsXG4gICAgcm9sZXMsXG4gICAgc3RlcHM6IGdldEJhc2ljVHV0b3JpYWxTdGVwcygpLFxuICB9KTtcblxuICByZXR1cm4ge1xuICAgIHN0YXJ0KG9wdGlvbnMpIHtcbiAgICAgIGVuZ2luZS5zdGFydChvcHRpb25zKTtcbiAgICB9LFxuICAgIHJlc3RhcnQoKSB7XG4gICAgICBlbmdpbmUucmVzdGFydCgpO1xuICAgIH0sXG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGVuZ2luZS5kZXN0cm95KCk7XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBjbGFtcCB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlQ2hvaWNlIHtcbiAgaWQ6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlQ29udGVudCB7XG4gIHNwZWFrZXI6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBpbnRlbnQ/OiBcImZhY3RvcnlcIiB8IFwidW5pdFwiO1xuICBjaG9pY2VzPzogRGlhbG9ndWVDaG9pY2VbXTtcbiAgdHlwaW5nU3BlZWRNcz86IG51bWJlcjtcbiAgb25DaG9pY2U/OiAoY2hvaWNlSWQ6IHN0cmluZykgPT4gdm9pZDtcbiAgb25UZXh0RnVsbHlSZW5kZXJlZD86ICgpID0+IHZvaWQ7XG4gIG9uQ29udGludWU/OiAoKSA9PiB2b2lkO1xuICBjb250aW51ZUxhYmVsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlT3ZlcmxheSB7XG4gIHNob3coY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZDtcbiAgaGlkZSgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIGlzVmlzaWJsZSgpOiBib29sZWFuO1xufVxuXG5jb25zdCBTVFlMRV9JRCA9IFwiZGlhbG9ndWUtb3ZlcmxheS1zdHlsZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRGlhbG9ndWVPdmVybGF5KCk6IERpYWxvZ3VlT3ZlcmxheSB7XG4gIGVuc3VyZVN0eWxlcygpO1xuXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtb3ZlcmxheVwiO1xuICBvdmVybGF5LnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBcInBvbGl0ZVwiKTtcblxuICBjb25zdCBjb25zb2xlRnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBjb25zb2xlRnJhbWUuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jb25zb2xlXCI7XG5cbiAgY29uc3Qgc3BlYWtlckxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc3BlYWtlckxhYmVsLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtc3BlYWtlclwiO1xuXG4gIGNvbnN0IHRleHRCbG9jayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRleHRCbG9jay5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLXRleHRcIjtcblxuICBjb25zdCBjdXJzb3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgY3Vyc29yLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY3Vyc29yXCI7XG4gIGN1cnNvci50ZXh0Q29udGVudCA9IFwiX1wiO1xuXG4gIGNvbnN0IGNob2ljZXNMaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInVsXCIpO1xuICBjaG9pY2VzTGlzdC5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNob2ljZXMgaGlkZGVuXCI7XG5cbiAgY29uc3QgY29udGludWVCdXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBjb250aW51ZUJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgY29udGludWVCdXR0b24uY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jb250aW51ZSBoaWRkZW5cIjtcbiAgY29udGludWVCdXR0b24udGV4dENvbnRlbnQgPSBcIkNvbnRpbnVlXCI7XG5cbiAgdGV4dEJsb2NrLmFwcGVuZChjdXJzb3IpO1xuICBjb25zb2xlRnJhbWUuYXBwZW5kKHNwZWFrZXJMYWJlbCwgdGV4dEJsb2NrLCBjaG9pY2VzTGlzdCwgY29udGludWVCdXR0b24pO1xuICBvdmVybGF5LmFwcGVuZChjb25zb2xlRnJhbWUpO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gIGxldCB2aXNpYmxlID0gZmFsc2U7XG4gIGxldCB0eXBpbmdIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgdGFyZ2V0VGV4dCA9IFwiXCI7XG4gIGxldCByZW5kZXJlZENoYXJzID0gMDtcbiAgbGV0IGFjdGl2ZUNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGNsZWFyVHlwaW5nKCk6IHZvaWQge1xuICAgIGlmICh0eXBpbmdIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodHlwaW5nSGFuZGxlKTtcbiAgICAgIHR5cGluZ0hhbmRsZSA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZmluaXNoVHlwaW5nKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIHJlbmRlcmVkQ2hhcnMgPSB0YXJnZXRUZXh0Lmxlbmd0aDtcbiAgICB1cGRhdGVUZXh0KCk7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICBjb250ZW50Lm9uVGV4dEZ1bGx5UmVuZGVyZWQ/LigpO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShjb250ZW50LmNob2ljZXMpIHx8IGNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVUZXh0KCk6IHZvaWQge1xuICAgIGNvbnN0IHRleHRUb1Nob3cgPSB0YXJnZXRUZXh0LnNsaWNlKDAsIHJlbmRlcmVkQ2hhcnMpO1xuICAgIHRleHRCbG9jay5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNvbnN0IHRleHROb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgdGV4dE5vZGUudGV4dENvbnRlbnQgPSB0ZXh0VG9TaG93O1xuICAgIHRleHRCbG9jay5hcHBlbmQodGV4dE5vZGUsIGN1cnNvcik7XG4gICAgY3Vyc29yLmNsYXNzTGlzdC50b2dnbGUoXCJoaWRkZW5cIiwgIXZpc2libGUpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyQ2hvaWNlcyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBjaG9pY2VzTGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNvbnN0IGNob2ljZXMgPSBBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgPyBjb250ZW50LmNob2ljZXMgOiBbXTtcbiAgICBpZiAoY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gICAgY2hvaWNlcy5mb3JFYWNoKChjaG9pY2UsIGluZGV4KSA9PiB7XG4gICAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgICAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICAgIGJ1dHRvbi5kYXRhc2V0LmNob2ljZUlkID0gY2hvaWNlLmlkO1xuICAgICAgYnV0dG9uLnRleHRDb250ZW50ID0gYCR7aW5kZXggKyAxfS4gJHtjaG9pY2UudGV4dH1gO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICAgIGNvbnRlbnQub25DaG9pY2U/LihjaG9pY2UuaWQpO1xuICAgICAgfSk7XG4gICAgICBpdGVtLmFwcGVuZChidXR0b24pO1xuICAgICAgY2hvaWNlc0xpc3QuYXBwZW5kKGl0ZW0pO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc2hvd0NvbnRpbnVlKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGlmICghY29udGVudC5vbkNvbnRpbnVlKSB7XG4gICAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgICAgY29udGludWVCdXR0b24ub25jbGljayA9IG51bGw7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnRpbnVlQnV0dG9uLnRleHRDb250ZW50ID0gY29udGVudC5jb250aW51ZUxhYmVsID8/IFwiQ29udGludWVcIjtcbiAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSAoKSA9PiB7XG4gICAgICBjb250ZW50Lm9uQ29udGludWU/LigpO1xuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBzY2hlZHVsZVR5cGUoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICBjb25zdCB0eXBpbmdTcGVlZCA9IGNsYW1wKE51bWJlcihjb250ZW50LnR5cGluZ1NwZWVkTXMpIHx8IDE4LCA4LCA2NCk7XG4gICAgY29uc3QgdGljayA9ICgpOiB2b2lkID0+IHtcbiAgICAgIHJlbmRlcmVkQ2hhcnMgPSBNYXRoLm1pbihyZW5kZXJlZENoYXJzICsgMSwgdGFyZ2V0VGV4dC5sZW5ndGgpO1xuICAgICAgdXBkYXRlVGV4dCgpO1xuICAgICAgaWYgKHJlbmRlcmVkQ2hhcnMgPj0gdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgICAgY2xlYXJUeXBpbmcoKTtcbiAgICAgICAgY29udGVudC5vblRleHRGdWxseVJlbmRlcmVkPy4oKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgfHwgY29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHlwaW5nSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQodGljaywgdHlwaW5nU3BlZWQpO1xuICAgICAgfVxuICAgIH07XG4gICAgdHlwaW5nSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQodGljaywgdHlwaW5nU3BlZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSB8fCAhYWN0aXZlQ29udGVudCkgcmV0dXJuO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShhY3RpdmVDb250ZW50LmNob2ljZXMpIHx8IGFjdGl2ZUNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGlmIChldmVudC5rZXkgPT09IFwiIFwiIHx8IGV2ZW50LmtleSA9PT0gXCJFbnRlclwiKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGlmIChyZW5kZXJlZENoYXJzIDwgdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgICAgICBmaW5pc2hUeXBpbmcoYWN0aXZlQ29udGVudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYWN0aXZlQ29udGVudC5vbkNvbnRpbnVlPy4oKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBpbmRleCA9IHBhcnNlSW50KGV2ZW50LmtleSwgMTApO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoaW5kZXgpICYmIGluZGV4ID49IDEgJiYgaW5kZXggPD0gYWN0aXZlQ29udGVudC5jaG9pY2VzLmxlbmd0aCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IGNob2ljZSA9IGFjdGl2ZUNvbnRlbnQuY2hvaWNlc1tpbmRleCAtIDFdO1xuICAgICAgYWN0aXZlQ29udGVudC5vbkNob2ljZT8uKGNob2ljZS5pZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRW50ZXJcIiAmJiByZW5kZXJlZENoYXJzIDwgdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBmaW5pc2hUeXBpbmcoYWN0aXZlQ29udGVudCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvdyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBhY3RpdmVDb250ZW50ID0gY29udGVudDtcbiAgICB2aXNpYmxlID0gdHJ1ZTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgIG92ZXJsYXkuZGF0YXNldC5pbnRlbnQgPSBjb250ZW50LmludGVudCA/PyBcImZhY3RvcnlcIjtcbiAgICBzcGVha2VyTGFiZWwudGV4dENvbnRlbnQgPSBjb250ZW50LnNwZWFrZXI7XG5cbiAgICB0YXJnZXRUZXh0ID0gY29udGVudC50ZXh0O1xuICAgIHJlbmRlcmVkQ2hhcnMgPSAwO1xuICAgIHVwZGF0ZVRleHQoKTtcbiAgICByZW5kZXJDaG9pY2VzKGNvbnRlbnQpO1xuICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICBzY2hlZHVsZVR5cGUoY29udGVudCk7XG4gIH1cblxuICBmdW5jdGlvbiBoaWRlKCk6IHZvaWQge1xuICAgIHZpc2libGUgPSBmYWxzZTtcbiAgICBhY3RpdmVDb250ZW50ID0gbnVsbDtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgdGFyZ2V0VGV4dCA9IFwiXCI7XG4gICAgcmVuZGVyZWRDaGFycyA9IDA7XG4gICAgdGV4dEJsb2NrLmlubmVySFRNTCA9IFwiXCI7XG4gICAgdGV4dEJsb2NrLmFwcGVuZChjdXJzb3IpO1xuICAgIGNob2ljZXNMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlKCk7XG4gICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlS2V5RG93bik7XG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfVxuXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleURvd24pO1xuXG4gIHJldHVybiB7XG4gICAgc2hvdyxcbiAgICBoaWRlLFxuICAgIGRlc3Ryb3ksXG4gICAgaXNWaXNpYmxlKCkge1xuICAgICAgcmV0dXJuIHZpc2libGU7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlU3R5bGVzKCk6IHZvaWQge1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoU1RZTEVfSUQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICBzdHlsZS5pZCA9IFNUWUxFX0lEO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAuZGlhbG9ndWUtb3ZlcmxheSB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICBpbnNldDogMDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIHotaW5kZXg6IDYwO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICAgIHRyYW5zaXRpb246IG9wYWNpdHkgMC4ycyBlYXNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheS52aXNpYmxlIHtcbiAgICAgIG9wYWNpdHk6IDE7XG4gICAgICBwb2ludGVyLWV2ZW50czogYXV0bztcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgbWluLXdpZHRoOiAzMjBweDtcbiAgICAgIG1heC13aWR0aDogbWluKDUyMHB4LCBjYWxjKDEwMHZ3IC0gNDhweCkpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSg2LCAxMSwgMTYsIDAuOTIpO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDEycHg7XG4gICAgICBwYWRkaW5nOiAxOHB4IDIwcHg7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGdhcDogMTRweDtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMiwgNiwgMTYsIDAuNik7XG4gICAgICBjb2xvcjogI2UyZThmMDtcbiAgICAgIGZvbnQtZmFtaWx5OiBcIklCTSBQbGV4IE1vbm9cIiwgXCJKZXRCcmFpbnMgTW9ub1wiLCB1aS1tb25vc3BhY2UsIFNGTW9uby1SZWd1bGFyLCBNZW5sbywgTW9uYWNvLCBDb25zb2xhcywgXCJMaWJlcmF0aW9uIE1vbm9cIiwgXCJDb3VyaWVyIE5ld1wiLCBtb25vc3BhY2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5W2RhdGEtaW50ZW50PVwiZmFjdG9yeVwiXSAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjQ1KTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMTMsIDE0OCwgMTM2LCAwLjM1KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXlbZGF0YS1pbnRlbnQ9XCJ1bml0XCJdIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyNDQsIDExNCwgMTgyLCAwLjQ1KTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMjM2LCA3MiwgMTUzLCAwLjI4KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLXNwZWFrZXIge1xuICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMTZlbTtcbiAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgICBjb2xvcjogcmdiYSgxNDgsIDE2MywgMTg0LCAwLjc1KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLXRleHQge1xuICAgICAgbWluLWhlaWdodDogOTBweDtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGxpbmUtaGVpZ2h0OiAxLjU1O1xuICAgICAgd2hpdGUtc3BhY2U6IHByZS13cmFwO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY3Vyc29yIHtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbiAgICAgIG1hcmdpbi1sZWZ0OiA0cHg7XG4gICAgICBhbmltYXRpb246IGRpYWxvZ3VlLWN1cnNvci1ibGluayAxLjJzIHN0ZXBzKDIsIHN0YXJ0KSBpbmZpbml0ZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWN1cnNvci5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMge1xuICAgICAgbGlzdC1zdHlsZTogbm9uZTtcbiAgICAgIG1hcmdpbjogMDtcbiAgICAgIHBhZGRpbmc6IDA7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGdhcDogOHB4O1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcy5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZSB7XG4gICAgICBmb250OiBpbmhlcml0O1xuICAgICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICAgIHBhZGRpbmc6IDhweCAxMHB4O1xuICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjMpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgyNCwgMzYsIDQ4LCAwLjg1KTtcbiAgICAgIGNvbG9yOiBpbmhlcml0O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAwLjE4cyBlYXNlLCBib3JkZXItY29sb3IgMC4xOHMgZWFzZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlIHtcbiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b246aG92ZXIsXG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uOmZvY3VzLXZpc2libGUsXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlOmhvdmVyLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZTpmb2N1cy12aXNpYmxlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNTUpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgzMCwgNDUsIDYwLCAwLjk1KTtcbiAgICAgIG91dGxpbmU6IG5vbmU7XG4gICAgfVxuICAgIEBrZXlmcmFtZXMgZGlhbG9ndWUtY3Vyc29yLWJsaW5rIHtcbiAgICAgIDAlLCA1MCUgeyBvcGFjaXR5OiAxOyB9XG4gICAgICA1MC4wMSUsIDEwMCUgeyBvcGFjaXR5OiAwOyB9XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cblxuIiwgImNvbnN0IFNUT1JBR0VfUFJFRklYID0gXCJsc2Q6c3Rvcnk6XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlGbGFncyB7XG4gIFtrZXk6IHN0cmluZ106IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlQcm9ncmVzcyB7XG4gIGNoYXB0ZXJJZDogc3RyaW5nO1xuICBub2RlSWQ6IHN0cmluZztcbiAgZmxhZ3M6IFN0b3J5RmxhZ3M7XG4gIHZpc2l0ZWQ/OiBzdHJpbmdbXTtcbiAgdXBkYXRlZEF0OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGdldFN0b3JhZ2UoKTogU3RvcmFnZSB8IG51bGwge1xuICB0cnkge1xuICAgIGlmICh0eXBlb2Ygd2luZG93ID09PSBcInVuZGVmaW5lZFwiIHx8ICF3aW5kb3cubG9jYWxTdG9yYWdlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlO1xufVxuXG5mdW5jdGlvbiBzdG9yYWdlS2V5KGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuICBjb25zdCByb29tU2VnbWVudCA9IHJvb21JZCA/IGAke3Jvb21JZH06YCA6IFwiXCI7XG4gIHJldHVybiBgJHtTVE9SQUdFX1BSRUZJWH0ke3Jvb21TZWdtZW50fSR7Y2hhcHRlcklkfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkU3RvcnlQcm9ncmVzcyhjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogU3RvcnlQcm9ncmVzcyB8IG51bGwge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IHN0b3JhZ2UuZ2V0SXRlbShzdG9yYWdlS2V5KGNoYXB0ZXJJZCwgcm9vbUlkKSk7XG4gICAgaWYgKCFyYXcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBTdG9yeVByb2dyZXNzO1xuICAgIGlmIChcbiAgICAgIHR5cGVvZiBwYXJzZWQgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkID09PSBudWxsIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmNoYXB0ZXJJZCAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5ub2RlSWQgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQudXBkYXRlZEF0ICE9PSBcIm51bWJlclwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmZsYWdzICE9PSBcIm9iamVjdFwiIHx8IHBhcnNlZC5mbGFncyA9PT0gbnVsbFxuICAgICkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBjaGFwdGVySWQ6IHBhcnNlZC5jaGFwdGVySWQsXG4gICAgICBub2RlSWQ6IHBhcnNlZC5ub2RlSWQsXG4gICAgICBmbGFnczogeyAuLi5wYXJzZWQuZmxhZ3MgfSxcbiAgICAgIHZpc2l0ZWQ6IEFycmF5LmlzQXJyYXkocGFyc2VkLnZpc2l0ZWQpID8gWy4uLnBhcnNlZC52aXNpdGVkXSA6IHVuZGVmaW5lZCxcbiAgICAgIHVwZGF0ZWRBdDogcGFyc2VkLnVwZGF0ZWRBdCxcbiAgICB9O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVN0b3J5UHJvZ3Jlc3MoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgcHJvZ3Jlc3M6IFN0b3J5UHJvZ3Jlc3MpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5zZXRJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpLCBKU09OLnN0cmluZ2lmeShwcm9ncmVzcykpO1xuICB9IGNhdGNoIHtcbiAgICAvLyBpZ25vcmUgcGVyc2lzdGVuY2UgZXJyb3JzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyU3RvcnlQcm9ncmVzcyhjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2UucmVtb3ZlSXRlbShzdG9yYWdlS2V5KGNoYXB0ZXJJZCwgcm9vbUlkKSk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIGlnbm9yZSBwZXJzaXN0ZW5jZSBlcnJvcnNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlRmxhZyhjdXJyZW50OiBTdG9yeUZsYWdzLCBmbGFnOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogU3RvcnlGbGFncyB7XG4gIGNvbnN0IG5leHQgPSB7IC4uLmN1cnJlbnQgfTtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIGRlbGV0ZSBuZXh0W2ZsYWddO1xuICB9IGVsc2Uge1xuICAgIG5leHRbZmxhZ10gPSB0cnVlO1xuICB9XG4gIHJldHVybiBuZXh0O1xufVxuIiwgImltcG9ydCB0eXBlIHsgUFJORyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBBdWRpb0VuZ2luZSB7XG4gIHByaXZhdGUgc3RhdGljIF9pbnN0OiBBdWRpb0VuZ2luZSB8IG51bGwgPSBudWxsO1xuXG4gIHB1YmxpYyByZWFkb25seSBjdHg6IEF1ZGlvQ29udGV4dDtcbiAgcHJpdmF0ZSByZWFkb25seSBtYXN0ZXI6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHJlYWRvbmx5IG11c2ljQnVzOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSByZWFkb25seSBzZnhCdXM6IEdhaW5Ob2RlO1xuXG4gIHByaXZhdGUgX3RhcmdldE1hc3RlciA9IDAuOTtcbiAgcHJpdmF0ZSBfdGFyZ2V0TXVzaWMgPSAwLjk7XG4gIHByaXZhdGUgX3RhcmdldFNmeCA9IDAuOTtcblxuICBzdGF0aWMgZ2V0KCk6IEF1ZGlvRW5naW5lIHtcbiAgICBpZiAoIXRoaXMuX2luc3QpIHRoaXMuX2luc3QgPSBuZXcgQXVkaW9FbmdpbmUoKTtcbiAgICByZXR1cm4gdGhpcy5faW5zdDtcbiAgfVxuXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5jdHggPSBuZXcgQXVkaW9Db250ZXh0KCk7XG4gICAgKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFggPSAodGhpcyBhcyBhbnkpLmN0eDtcblxuICAgIHRoaXMubWFzdGVyID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldE1hc3RlciB9KTtcbiAgICB0aGlzLm11c2ljQnVzID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldE11c2ljIH0pO1xuICAgIHRoaXMuc2Z4QnVzID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldFNmeCB9KTtcblxuICAgIHRoaXMubXVzaWNCdXMuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5zZnhCdXMuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5tYXN0ZXIuY29ubmVjdCh0aGlzLmN0eC5kZXN0aW5hdGlvbik7XG4gIH1cblxuICBnZXQgbm93KCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICB9XG5cbiAgZ2V0TXVzaWNCdXMoKTogR2Fpbk5vZGUge1xuICAgIHJldHVybiB0aGlzLm11c2ljQnVzO1xuICB9XG5cbiAgZ2V0U2Z4QnVzKCk6IEdhaW5Ob2RlIHtcbiAgICByZXR1cm4gdGhpcy5zZnhCdXM7XG4gIH1cblxuICBhc3luYyByZXN1bWUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuY3R4LnN0YXRlID09PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgICBhd2FpdCB0aGlzLmN0eC5yZXN1bWUoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzdXNwZW5kKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmN0eC5zdGF0ZSA9PT0gXCJydW5uaW5nXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuY3R4LnN1c3BlbmQoKTtcbiAgICB9XG4gIH1cblxuICBzZXRNYXN0ZXJHYWluKHY6IG51bWJlciwgdCA9IHRoaXMubm93LCByYW1wID0gMC4wMyk6IHZvaWQge1xuICAgIHRoaXMuX3RhcmdldE1hc3RlciA9IHY7XG4gICAgdGhpcy5tYXN0ZXIuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tYXN0ZXIuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2LCB0ICsgcmFtcCk7XG4gIH1cblxuICBzZXRNdXNpY0dhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0TXVzaWMgPSB2O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIHNldFNmeEdhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0U2Z4ID0gdjtcbiAgICB0aGlzLnNmeEJ1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLnNmeEJ1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIGR1Y2tNdXNpYyhsZXZlbCA9IDAuNCwgYXR0YWNrID0gMC4wNSk6IHZvaWQge1xuICAgIGNvbnN0IHQgPSB0aGlzLm5vdztcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShsZXZlbCwgdCArIGF0dGFjayk7XG4gIH1cblxuICB1bmR1Y2tNdXNpYyhyZWxlYXNlID0gMC4yNSk6IHZvaWQge1xuICAgIGNvbnN0IHQgPSB0aGlzLm5vdztcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0aGlzLl90YXJnZXRNdXNpYywgdCArIHJlbGVhc2UpO1xuICB9XG59XG5cbi8vIFRpbnkgc2VlZGFibGUgUFJORyAoTXVsYmVycnkzMilcbmV4cG9ydCBmdW5jdGlvbiBtYWtlUFJORyhzZWVkOiBudW1iZXIpOiBQUk5HIHtcbiAgbGV0IHMgPSAoc2VlZCA+Pj4gMCkgfHwgMTtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICBzICs9IDB4NkQyQjc5RjU7XG4gICAgbGV0IHQgPSBNYXRoLmltdWwocyBeIChzID4+PiAxNSksIDEgfCBzKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgNjEgfCB0KTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cbiIsICIvLyBMb3ctbGV2ZWwgZ3JhcGggYnVpbGRlcnMgLyBoZWxwZXJzXG5cbmV4cG9ydCBmdW5jdGlvbiBvc2MoY3R4OiBBdWRpb0NvbnRleHQsIHR5cGU6IE9zY2lsbGF0b3JUeXBlLCBmcmVxOiBudW1iZXIpIHtcbiAgcmV0dXJuIG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZSwgZnJlcXVlbmN5OiBmcmVxIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9pc2UoY3R4OiBBdWRpb0NvbnRleHQpIHtcbiAgY29uc3QgYnVmZmVyID0gY3R4LmNyZWF0ZUJ1ZmZlcigxLCBjdHguc2FtcGxlUmF0ZSAqIDIsIGN0eC5zYW1wbGVSYXRlKTtcbiAgY29uc3QgZGF0YSA9IGJ1ZmZlci5nZXRDaGFubmVsRGF0YSgwKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSBkYXRhW2ldID0gTWF0aC5yYW5kb20oKSAqIDIgLSAxO1xuICByZXR1cm4gbmV3IEF1ZGlvQnVmZmVyU291cmNlTm9kZShjdHgsIHsgYnVmZmVyLCBsb29wOiB0cnVlIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFrZVBhbm5lcihjdHg6IEF1ZGlvQ29udGV4dCwgcGFuID0gMCkge1xuICByZXR1cm4gbmV3IFN0ZXJlb1Bhbm5lck5vZGUoY3R4LCB7IHBhbiB9KTtcbn1cblxuLyoqIEJhc2ljIEFEU1IgYXBwbGllZCB0byBhIEdhaW5Ob2RlIEF1ZGlvUGFyYW0uIFJldHVybnMgYSBmdW5jdGlvbiB0byByZWxlYXNlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFkc3IoXG4gIGN0eDogQXVkaW9Db250ZXh0LFxuICBwYXJhbTogQXVkaW9QYXJhbSxcbiAgdDA6IG51bWJlcixcbiAgYSA9IDAuMDEsIC8vIGF0dGFja1xuICBkID0gMC4wOCwgLy8gZGVjYXlcbiAgcyA9IDAuNSwgIC8vIHN1c3RhaW4gKDAuLjEgb2YgcGVhaylcbiAgciA9IDAuMiwgIC8vIHJlbGVhc2VcbiAgcGVhayA9IDFcbikge1xuICBwYXJhbS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModDApO1xuICBwYXJhbS5zZXRWYWx1ZUF0VGltZSgwLCB0MCk7XG4gIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHBlYWssIHQwICsgYSk7XG4gIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHMgKiBwZWFrLCB0MCArIGEgKyBkKTtcbiAgcmV0dXJuIChyZWxlYXNlQXQgPSBjdHguY3VycmVudFRpbWUpID0+IHtcbiAgICBwYXJhbS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMocmVsZWFzZUF0KTtcbiAgICAvLyBhdm9pZCBzdWRkZW4ganVtcHM7IGNvbnRpbnVlIGZyb20gY3VycmVudFxuICAgIHBhcmFtLnNldFZhbHVlQXRUaW1lKHBhcmFtLnZhbHVlLCByZWxlYXNlQXQpO1xuICAgIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwMSwgcmVsZWFzZUF0ICsgcik7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsZm9Ub1BhcmFtKFxuICBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgdGFyZ2V0OiBBdWRpb1BhcmFtLFxuICB7IGZyZXF1ZW5jeSA9IDAuMSwgZGVwdGggPSAzMDAsIHR5cGUgPSBcInNpbmVcIiBhcyBPc2NpbGxhdG9yVHlwZSB9ID0ge31cbikge1xuICBjb25zdCBsZm8gPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGUsIGZyZXF1ZW5jeSB9KTtcbiAgY29uc3QgYW1wID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiBkZXB0aCB9KTtcbiAgbGZvLmNvbm5lY3QoYW1wKS5jb25uZWN0KHRhcmdldCk7XG4gIHJldHVybiB7XG4gICAgc3RhcnQoYXQgPSBjdHguY3VycmVudFRpbWUpIHsgbGZvLnN0YXJ0KGF0KTsgfSxcbiAgICBzdG9wKGF0ID0gY3R4LmN1cnJlbnRUaW1lKSB7IGxmby5zdG9wKGF0KTsgYW1wLmRpc2Nvbm5lY3QoKTsgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgYWRzciwgbWFrZVBhbm5lciwgbm9pc2UsIG9zYyB9IGZyb20gXCIuL2dyYXBoXCI7XG5pbXBvcnQgdHlwZSB7IFNmeE5hbWUgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG4vKiogRmlyZS1hbmQtZm9yZ2V0IFNGWCBieSBuYW1lLCB3aXRoIHNpbXBsZSBwYXJhbXMuICovXG5leHBvcnQgZnVuY3Rpb24gcGxheVNmeChcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgbmFtZTogU2Z4TmFtZSxcbiAgb3B0czogeyB2ZWxvY2l0eT86IG51bWJlcjsgcGFuPzogbnVtYmVyIH0gPSB7fVxuKSB7XG4gIHN3aXRjaCAobmFtZSkge1xuICAgIGNhc2UgXCJsYXNlclwiOiByZXR1cm4gcGxheUxhc2VyKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcInRocnVzdFwiOiByZXR1cm4gcGxheVRocnVzdChlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJleHBsb3Npb25cIjogcmV0dXJuIHBsYXlFeHBsb3Npb24oZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwibG9ja1wiOiByZXR1cm4gcGxheUxvY2soZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwidWlcIjogcmV0dXJuIHBsYXlVaShlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJkaWFsb2d1ZVwiOiByZXR1cm4gcGxheURpYWxvZ3VlKGVuZ2luZSwgb3B0cyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlMYXNlcihcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbyA9IG9zYyhjdHgsIFwic3F1YXJlXCIsIDY4MCArIDE2MCAqIHZlbG9jaXR5KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwgeyB0eXBlOiBcImxvd3Bhc3NcIiwgZnJlcXVlbmN5OiAxMjAwIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgby5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAyLCAwLjAzLCAwLjI1LCAwLjA4LCAwLjY1KTtcbiAgby5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMDYpO1xuICBvLnN0b3Aobm93ICsgMC4yKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlUaHJ1c3QoXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAwLjYsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbiA9IG5vaXNlKGN0eCk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHtcbiAgICB0eXBlOiBcImJhbmRwYXNzXCIsXG4gICAgZnJlcXVlbmN5OiAxODAgKyAzNjAgKiB2ZWxvY2l0eSxcbiAgICBROiAxLjEsXG4gIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbi5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDEyLCAwLjE1LCAwLjc1LCAwLjI1LCAwLjQ1ICogdmVsb2NpdHkpO1xuICBuLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4yNSk7XG4gIG4uc3RvcChub3cgKyAxLjApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUV4cGxvc2lvbihcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbiA9IG5vaXNlKGN0eCk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHtcbiAgICB0eXBlOiBcImxvd3Bhc3NcIixcbiAgICBmcmVxdWVuY3k6IDIyMDAgKiBNYXRoLm1heCgwLjIsIE1hdGgubWluKHZlbG9jaXR5LCAxKSksXG4gICAgUTogMC4yLFxuICB9KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG4uY29ubmVjdChmKS5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwNSwgMC4wOCwgMC41LCAwLjM1LCAxLjEgKiB2ZWxvY2l0eSk7XG4gIG4uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjE1ICsgMC4xICogdmVsb2NpdHkpO1xuICBuLnN0b3Aobm93ICsgMS4yKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlMb2NrKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBiYXNlID0gNTIwICsgMTQwICogdmVsb2NpdHk7XG4gIGNvbnN0IG8xID0gb3NjKGN0eCwgXCJzaW5lXCIsIGJhc2UpO1xuICBjb25zdCBvMiA9IG9zYyhjdHgsIFwic2luZVwiLCBiYXNlICogMS41KTtcblxuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbzEuY29ubmVjdChnKTsgbzIuY29ubmVjdChnKTtcbiAgZy5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcblxuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwMSwgMC4wMiwgMC4wLCAwLjEyLCAwLjYpO1xuICBvMS5zdGFydChub3cpOyBvMi5zdGFydChub3cgKyAwLjAyKTtcbiAgcmVsZWFzZShub3cgKyAwLjA2KTtcbiAgbzEuc3RvcChub3cgKyAwLjIpOyBvMi5zdG9wKG5vdyArIDAuMjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheVVpKGVuZ2luZTogQXVkaW9FbmdpbmUsIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fSkge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBvID0gb3NjKGN0eCwgXCJ0cmlhbmdsZVwiLCA4ODAgLSAxMjAgKiB2ZWxvY2l0eSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAxLCAwLjA0LCAwLjAsIDAuMDgsIDAuMzUpO1xuICBvLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4wNSk7XG4gIG8uc3RvcChub3cgKyAwLjE4KTtcbn1cblxuLyoqIERpYWxvZ3VlIGN1ZSB1c2VkIGJ5IHRoZSBzdG9yeSBvdmVybGF5IChzaG9ydCwgZ2VudGxlIHBpbmcpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYXlEaWFsb2d1ZShlbmdpbmU6IEF1ZGlvRW5naW5lLCB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge30pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgZnJlcSA9IDQ4MCArIDE2MCAqIHZlbG9jaXR5O1xuICBjb25zdCBvID0gb3NjKGN0eCwgXCJzaW5lXCIsIGZyZXEpO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwLjAwMDEgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSgwLjAwMDEsIG5vdyk7XG4gIGcuZ2Fpbi5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKDAuMDQsIG5vdyArIDAuMDIpO1xuICBnLmdhaW4uZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDUsIG5vdyArIDAuMjgpO1xuXG4gIG8uc3RhcnQobm93KTtcbiAgby5zdG9wKG5vdyArIDAuMyk7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTdG9yeUludGVudCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuLi9hdWRpby9lbmdpbmVcIjtcbmltcG9ydCB7IHBsYXlEaWFsb2d1ZSBhcyBwbGF5RGlhbG9ndWVTZnggfSBmcm9tIFwiLi4vYXVkaW8vc2Z4XCI7XG5cbmxldCBsYXN0UGxheWVkQXQgPSAwO1xuXG4vLyBNYWludGFpbiB0aGUgb2xkIHB1YmxpYyBBUEkgc28gZW5naW5lLnRzIGRvZXNuJ3QgY2hhbmdlXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXVkaW9Db250ZXh0KCk6IEF1ZGlvQ29udGV4dCB7XG4gIHJldHVybiBBdWRpb0VuZ2luZS5nZXQoKS5jdHg7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXN1bWVBdWRpbygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgQXVkaW9FbmdpbmUuZ2V0KCkucmVzdW1lKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RGlhbG9ndWVDdWUoaW50ZW50OiBTdG9yeUludGVudCk6IHZvaWQge1xuICBjb25zdCBlbmdpbmUgPSBBdWRpb0VuZ2luZS5nZXQoKTtcbiAgY29uc3Qgbm93ID0gZW5naW5lLm5vdztcblxuICAvLyBUaHJvdHRsZSByYXBpZCBjdWVzIHRvIGF2b2lkIGNsdXR0ZXJcbiAgaWYgKG5vdyAtIGxhc3RQbGF5ZWRBdCA8IDAuMSkgcmV0dXJuO1xuICBsYXN0UGxheWVkQXQgPSBub3c7XG5cbiAgLy8gTWFwIFwiZmFjdG9yeVwiIHZzIG90aGVycyB0byBhIHNsaWdodGx5IGRpZmZlcmVudCB2ZWxvY2l0eSAoYnJpZ2h0bmVzcylcbiAgY29uc3QgdmVsb2NpdHkgPSBpbnRlbnQgPT09IFwiZmFjdG9yeVwiID8gMC44IDogMC41O1xuICBwbGF5RGlhbG9ndWVTZngoZW5naW5lLCB7IHZlbG9jaXR5LCBwYW46IDAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdXNwZW5kRGlhbG9ndWVBdWRpbygpOiB2b2lkIHtcbiAgdm9pZCBBdWRpb0VuZ2luZS5nZXQoKS5zdXNwZW5kKCk7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgRGlhbG9ndWVPdmVybGF5IH0gZnJvbSBcIi4vb3ZlcmxheVwiO1xuaW1wb3J0IHR5cGUgeyBTdG9yeUNoYXB0ZXIsIFN0b3J5Q2hvaWNlRGVmaW5pdGlvbiwgU3RvcnlOb2RlLCBTdG9yeVRyaWdnZXIgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHtcbiAgY2xlYXJTdG9yeVByb2dyZXNzLFxuICBsb2FkU3RvcnlQcm9ncmVzcyxcbiAgc2F2ZVN0b3J5UHJvZ3Jlc3MsXG4gIFN0b3J5RmxhZ3MsXG59IGZyb20gXCIuL3N0b3JhZ2VcIjtcbmltcG9ydCB7IHBsYXlEaWFsb2d1ZUN1ZSB9IGZyb20gXCIuL3NmeFwiO1xuXG5pbnRlcmZhY2UgU3RvcnlFbmdpbmVPcHRpb25zIHtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb3ZlcmxheTogRGlhbG9ndWVPdmVybGF5O1xuICBjaGFwdGVyOiBTdG9yeUNoYXB0ZXI7XG4gIHJvb21JZDogc3RyaW5nIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIFN0b3J5UXVldWVJdGVtIHtcbiAgbm9kZUlkOiBzdHJpbmc7XG4gIGZvcmNlOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgUHJlcGFyZWRDaG9pY2Uge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIG5leHQ6IHN0cmluZyB8IG51bGw7XG4gIHNldEZsYWdzOiBzdHJpbmdbXTtcbiAgY2xlYXJGbGFnczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlFbmdpbmUge1xuICBzdGFydCgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIHJlc2V0KCk6IHZvaWQ7XG59XG5cbmNvbnN0IERFRkFVTFRfVFlQSU5HX01TID0gMTg7XG5jb25zdCBNSU5fVFlQSU5HX01TID0gODtcbmNvbnN0IE1BWF9UWVBJTkdfTVMgPSA2NDtcbmNvbnN0IEFVVE9fQURWQU5DRV9NSU5fREVMQVkgPSAyMDA7XG5jb25zdCBBVVRPX0FEVkFOQ0VfTUFYX0RFTEFZID0gODAwMDtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVN0b3J5RW5naW5lKHsgYnVzLCBvdmVybGF5LCBjaGFwdGVyLCByb29tSWQgfTogU3RvcnlFbmdpbmVPcHRpb25zKTogU3RvcnlFbmdpbmUge1xuICBjb25zdCBub2RlcyA9IG5ldyBNYXA8c3RyaW5nLCBTdG9yeU5vZGU+KE9iamVjdC5lbnRyaWVzKGNoYXB0ZXIubm9kZXMpKTtcbiAgY29uc3QgcXVldWU6IFN0b3J5UXVldWVJdGVtW10gPSBbXTtcbiAgY29uc3QgbGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuICBjb25zdCBwZW5kaW5nVGltZXJzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuICBsZXQgZmxhZ3M6IFN0b3J5RmxhZ3MgPSB7fTtcbiAgbGV0IHZpc2l0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgbGV0IGN1cnJlbnROb2RlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgc3RhcnRlZCA9IGZhbHNlO1xuICBsZXQgYXV0b0FkdmFuY2VIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5mZXJJbnRlbnQobm9kZTogU3RvcnlOb2RlKTogXCJmYWN0b3J5XCIgfCBcInVuaXRcIiB7XG4gICAgaWYgKG5vZGUuaW50ZW50KSByZXR1cm4gbm9kZS5pbnRlbnQ7XG4gICAgY29uc3Qgc3BlYWtlciA9IG5vZGUuc3BlYWtlci50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChzcGVha2VyLmluY2x1ZGVzKFwidW5pdFwiKSkge1xuICAgICAgcmV0dXJuIFwidW5pdFwiO1xuICAgIH1cbiAgICByZXR1cm4gXCJmYWN0b3J5XCI7XG4gIH1cblxuICBmdW5jdGlvbiBzYXZlKG5vZGVJZDogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuICAgIGNvbnN0IHByb2dyZXNzID0ge1xuICAgICAgY2hhcHRlcklkOiBjaGFwdGVyLmlkLFxuICAgICAgbm9kZUlkOiBub2RlSWQgPz8gY2hhcHRlci5zdGFydCxcbiAgICAgIGZsYWdzLFxuICAgICAgdmlzaXRlZDogQXJyYXkuZnJvbSh2aXNpdGVkKSxcbiAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICB9O1xuICAgIHNhdmVTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCwgcHJvZ3Jlc3MpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0RmxhZyhmbGFnOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG4gICAgY29uc3QgbmV4dCA9IHsgLi4uZmxhZ3MgfTtcbiAgICBpZiAodmFsdWUpIHtcbiAgICAgIGlmIChuZXh0W2ZsYWddKSByZXR1cm47XG4gICAgICBuZXh0W2ZsYWddID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKG5leHRbZmxhZ10pIHtcbiAgICAgIGRlbGV0ZSBuZXh0W2ZsYWddO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZsYWdzID0gbmV4dDtcbiAgICBidXMuZW1pdChcInN0b3J5OmZsYWdVcGRhdGVkXCIsIHsgZmxhZywgdmFsdWUgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBhcHBseUNob2ljZUZsYWdzKGNob2ljZTogUHJlcGFyZWRDaG9pY2UpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLnNldEZsYWdzKSB7XG4gICAgICBzZXRGbGFnKGZsYWcsIHRydWUpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLmNsZWFyRmxhZ3MpIHtcbiAgICAgIHNldEZsYWcoZmxhZywgZmFsc2UpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHByZXBhcmVDaG9pY2VzKG5vZGU6IFN0b3J5Tm9kZSk6IFByZXBhcmVkQ2hvaWNlW10ge1xuICAgIGNvbnN0IGRlZnMgPSBBcnJheS5pc0FycmF5KG5vZGUuY2hvaWNlcykgPyBub2RlLmNob2ljZXMgOiBbXTtcbiAgICByZXR1cm4gZGVmcy5tYXAoKGNob2ljZSwgaW5kZXgpID0+IG5vcm1hbGl6ZUNob2ljZShjaG9pY2UsIGluZGV4KSk7XG4gIH1cblxuICBmdW5jdGlvbiBub3JtYWxpemVDaG9pY2UoY2hvaWNlOiBTdG9yeUNob2ljZURlZmluaXRpb24sIGluZGV4OiBudW1iZXIpOiBQcmVwYXJlZENob2ljZSB7XG4gICAgY29uc3Qgc2V0RmxhZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBjbGVhckZsYWdzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgaWYgKGNob2ljZS5mbGFnKSB7XG4gICAgICBzZXRGbGFncy5hZGQoY2hvaWNlLmZsYWcpO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShjaG9pY2Uuc2V0RmxhZ3MpKSB7XG4gICAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLnNldEZsYWdzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgZmxhZyA9PT0gXCJzdHJpbmdcIiAmJiBmbGFnLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgc2V0RmxhZ3MuYWRkKGZsYWcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGNob2ljZS5jbGVhckZsYWdzKSkge1xuICAgICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5jbGVhckZsYWdzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgZmxhZyA9PT0gXCJzdHJpbmdcIiAmJiBmbGFnLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY2xlYXJGbGFncy5hZGQoZmxhZyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBjaG9pY2UuaWQgPz8gY2hvaWNlLmZsYWcgPz8gYGNob2ljZS0ke2luZGV4fWAsXG4gICAgICB0ZXh0OiBjaG9pY2UudGV4dCxcbiAgICAgIG5leHQ6IGNob2ljZS5uZXh0ID8/IG51bGwsXG4gICAgICBzZXRGbGFnczogQXJyYXkuZnJvbShzZXRGbGFncyksXG4gICAgICBjbGVhckZsYWdzOiBBcnJheS5mcm9tKGNsZWFyRmxhZ3MpLFxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhckF1dG9BZHZhbmNlKCk6IHZvaWQge1xuICAgIGlmIChhdXRvQWR2YW5jZUhhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dChhdXRvQWR2YW5jZUhhbmRsZSk7XG4gICAgICBhdXRvQWR2YW5jZUhhbmRsZSA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xvc2VOb2RlKCk6IHZvaWQge1xuICAgIGlmICghY3VycmVudE5vZGVJZCkgcmV0dXJuO1xuICAgIG92ZXJsYXkuaGlkZSgpO1xuICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2xvc2VkXCIsIHsgbm9kZUlkOiBjdXJyZW50Tm9kZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgY3VycmVudE5vZGVJZCA9IG51bGw7XG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgIHNhdmUobnVsbCk7XG4gICAgdHJ5U2hvd05leHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkdmFuY2VUbyhuZXh0SWQ6IHN0cmluZyB8IG51bGwsIGZvcmNlID0gZmFsc2UpOiB2b2lkIHtcbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgaWYgKGN1cnJlbnROb2RlSWQpIHtcbiAgICAgIG92ZXJsYXkuaGlkZSgpO1xuICAgICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpjbG9zZWRcIiwgeyBub2RlSWQ6IGN1cnJlbnROb2RlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAobmV4dElkKSB7XG4gICAgICBlbnF1ZXVlTm9kZShuZXh0SWQsIHsgZm9yY2UgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNhdmUobnVsbCk7XG4gICAgICB0cnlTaG93TmV4dCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3dOb2RlKG5vZGVJZDogc3RyaW5nLCBmb3JjZSA9IGZhbHNlKTogdm9pZCB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzLmdldChub2RlSWQpO1xuICAgIGlmICghbm9kZSkgcmV0dXJuO1xuXG4gICAgY3VycmVudE5vZGVJZCA9IG5vZGVJZDtcbiAgICB2aXNpdGVkLmFkZChub2RlSWQpO1xuICAgIHNhdmUobm9kZUlkKTtcbiAgICBidXMuZW1pdChcInN0b3J5OnByb2dyZXNzZWRcIiwgeyBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQsIG5vZGVJZCB9KTtcblxuICAgIGNvbnN0IGNob2ljZXMgPSBwcmVwYXJlQ2hvaWNlcyhub2RlKTtcbiAgICBjb25zdCBpbnRlbnQgPSBpbmZlckludGVudChub2RlKTtcblxuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcblxuICAgIGNvbnN0IHR5cGluZ1NwZWVkID0gY2xhbXAobm9kZS50eXBpbmdTcGVlZE1zID8/IERFRkFVTFRfVFlQSU5HX01TLCBNSU5fVFlQSU5HX01TLCBNQVhfVFlQSU5HX01TKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSB7XG4gICAgICBzcGVha2VyOiBub2RlLnNwZWFrZXIsXG4gICAgICB0ZXh0OiBub2RlLnRleHQsXG4gICAgICBpbnRlbnQsXG4gICAgICB0eXBpbmdTcGVlZE1zOiB0eXBpbmdTcGVlZCxcbiAgICAgIGNob2ljZXM6IGNob2ljZXMubGVuZ3RoID4gMFxuICAgICAgICA/IGNob2ljZXMubWFwKChjaG9pY2UpID0+ICh7IGlkOiBjaG9pY2UuaWQsIHRleHQ6IGNob2ljZS50ZXh0IH0pKVxuICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgIG9uQ2hvaWNlOiBjaG9pY2VzLmxlbmd0aCA+IDBcbiAgICAgICAgPyAoY2hvaWNlSWQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlZCA9IGNob2ljZXMuZmluZCgoY2gpID0+IGNoLmlkID09PSBjaG9pY2VJZCk7XG4gICAgICAgICAgICBpZiAoIW1hdGNoZWQpIHJldHVybjtcbiAgICAgICAgICAgIGFwcGx5Q2hvaWNlRmxhZ3MobWF0Y2hlZCk7XG4gICAgICAgICAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNob2ljZVwiLCB7IG5vZGVJZCwgY2hvaWNlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgICAgICAgICAgIGFkdmFuY2VUbyhtYXRjaGVkLm5leHQsIHRydWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgfSBhcyBjb25zdDtcblxuICAgIHBsYXlEaWFsb2d1ZUN1ZShpbnRlbnQpO1xuXG4gICAgb3ZlcmxheS5zaG93KHtcbiAgICAgIC4uLmNvbnRlbnQsXG4gICAgICBvbkNvbnRpbnVlOiAhY2hvaWNlcy5sZW5ndGhcbiAgICAgICAgPyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXh0ID0gbm9kZS5uZXh0ID8/IG51bGw7XG4gICAgICAgICAgICBhZHZhbmNlVG8obmV4dCwgdHJ1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgIGNvbnRpbnVlTGFiZWw6IG5vZGUuY29udGludWVMYWJlbCxcbiAgICAgIG9uVGV4dEZ1bGx5UmVuZGVyZWQ6ICgpID0+IHtcbiAgICAgICAgaWYgKCFjaG9pY2VzLmxlbmd0aCkge1xuICAgICAgICAgIGlmIChub2RlLmF1dG9BZHZhbmNlKSB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBub2RlLmF1dG9BZHZhbmNlLm5leHQgPz8gbm9kZS5uZXh0ID8/IG51bGw7XG4gICAgICAgICAgICBjb25zdCBkZWxheSA9IGNsYW1wKG5vZGUuYXV0b0FkdmFuY2UuZGVsYXlNcyA/PyAxMjAwLCBBVVRPX0FEVkFOQ0VfTUlOX0RFTEFZLCBBVVRPX0FEVkFOQ0VfTUFYX0RFTEFZKTtcbiAgICAgICAgICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICAgICAgICAgIGF1dG9BZHZhbmNlSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICBhdXRvQWR2YW5jZUhhbmRsZSA9IG51bGw7XG4gICAgICAgICAgICAgIGFkdmFuY2VUbyh0YXJnZXQsIHRydWUpO1xuICAgICAgICAgICAgfSwgZGVsYXkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6b3BlbmVkXCIsIHsgbm9kZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBlbnF1ZXVlTm9kZShub2RlSWQ6IHN0cmluZywgeyBmb3JjZSA9IGZhbHNlLCBkZWxheU1zIH06IHsgZm9yY2U/OiBib29sZWFuOyBkZWxheU1zPzogbnVtYmVyIH0gPSB7fSk6IHZvaWQge1xuICAgIGlmICghZm9yY2UgJiYgdmlzaXRlZC5oYXMobm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIW5vZGVzLmhhcyhub2RlSWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChkZWxheU1zICYmIGRlbGF5TXMgPiAwKSB7XG4gICAgICBpZiAocGVuZGluZ1RpbWVycy5oYXMobm9kZUlkKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB0aW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgcGVuZGluZ1RpbWVycy5kZWxldGUobm9kZUlkKTtcbiAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGZvcmNlIH0pO1xuICAgICAgfSwgZGVsYXlNcyk7XG4gICAgICBwZW5kaW5nVGltZXJzLnNldChub2RlSWQsIHRpbWVyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLnNvbWUoKGl0ZW0pID0+IGl0ZW0ubm9kZUlkID09PSBub2RlSWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHF1ZXVlLnB1c2goeyBub2RlSWQsIGZvcmNlIH0pO1xuICAgIHRyeVNob3dOZXh0KCk7XG4gIH1cblxuICBmdW5jdGlvbiB0cnlTaG93TmV4dCgpOiB2b2lkIHtcbiAgICBpZiAoY3VycmVudE5vZGVJZCkgcmV0dXJuO1xuICAgIGlmIChvdmVybGF5LmlzVmlzaWJsZSgpKSByZXR1cm47XG4gICAgY29uc3QgbmV4dCA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgaWYgKCFuZXh0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHNob3dOb2RlKG5leHQubm9kZUlkLCBuZXh0LmZvcmNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJpbmRUcmlnZ2VyKG5vZGVJZDogc3RyaW5nLCB0cmlnZ2VyOiBTdG9yeVRyaWdnZXIpOiB2b2lkIHtcbiAgICBzd2l0Y2ggKHRyaWdnZXIua2luZCkge1xuICAgICAgY2FzZSBcImltbWVkaWF0ZVwiOiB7XG4gICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgPz8gNDAwIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJ0dXRvcmlhbC1zdGFydFwiOiB7XG4gICAgICAgIGNvbnN0IGRpc3Bvc2VyID0gYnVzLm9uKFwidHV0b3JpYWw6c3RhcnRlZFwiLCAoeyBpZCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbGlzdGVuZXJzLnB1c2goZGlzcG9zZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJ0dXRvcmlhbC1zdGVwXCI6IHtcbiAgICAgICAgY29uc3QgZGlzcG9zZXIgPSBidXMub24oXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiLCAoeyBpZCwgc3RlcEluZGV4IH0pID0+IHtcbiAgICAgICAgICBpZiAoaWQgIT09IHRyaWdnZXIudHV0b3JpYWxJZCkgcmV0dXJuO1xuICAgICAgICAgIGlmICh0eXBlb2Ygc3RlcEluZGV4ICE9PSBcIm51bWJlclwiKSByZXR1cm47XG4gICAgICAgICAgaWYgKHN0ZXBJbmRleCAhPT0gdHJpZ2dlci5zdGVwSW5kZXgpIHJldHVybjtcbiAgICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbGlzdGVuZXJzLnB1c2goZGlzcG9zZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJ0dXRvcmlhbC1jb21wbGV0ZVwiOiB7XG4gICAgICAgIGNvbnN0IGRpc3Bvc2VyID0gYnVzLm9uKFwidHV0b3JpYWw6Y29tcGxldGVkXCIsICh7IGlkIH0pID0+IHtcbiAgICAgICAgICBpZiAoaWQgIT09IHRyaWdnZXIudHV0b3JpYWxJZCkgcmV0dXJuO1xuICAgICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBsaXN0ZW5lcnMucHVzaChkaXNwb3Nlcik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdGlhbGl6ZVRyaWdnZXJzKCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgW25vZGVJZCwgbm9kZV0gb2Ygbm9kZXMuZW50cmllcygpKSB7XG4gICAgICBpZiAoIW5vZGUudHJpZ2dlcikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGJpbmRUcmlnZ2VyKG5vZGVJZCwgbm9kZS50cmlnZ2VyKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlRnJvbVByb2dyZXNzKCk6IHZvaWQge1xuICAgIGNvbnN0IHByb2dyZXNzID0gbG9hZFN0b3J5UHJvZ3Jlc3MoY2hhcHRlci5pZCwgcm9vbUlkKTtcbiAgICBpZiAoIXByb2dyZXNzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZsYWdzID0gcHJvZ3Jlc3MuZmxhZ3MgPz8ge307XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocHJvZ3Jlc3MudmlzaXRlZCkpIHtcbiAgICAgIHZpc2l0ZWQgPSBuZXcgU2V0KHByb2dyZXNzLnZpc2l0ZWQpO1xuICAgIH1cbiAgICBpZiAocHJvZ3Jlc3Mubm9kZUlkICYmIG5vZGVzLmhhcyhwcm9ncmVzcy5ub2RlSWQpKSB7XG4gICAgICBlbnF1ZXVlTm9kZShwcm9ncmVzcy5ub2RlSWQsIHsgZm9yY2U6IHRydWUsIGRlbGF5TXM6IDUwIH0pO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyKCk6IHZvaWQge1xuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICBxdWV1ZS5zcGxpY2UoMCwgcXVldWUubGVuZ3RoKTtcbiAgICBmb3IgKGNvbnN0IHRpbWVyIG9mIHBlbmRpbmdUaW1lcnMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZXIpO1xuICAgIH1cbiAgICBwZW5kaW5nVGltZXJzLmNsZWFyKCk7XG4gICAgY3VycmVudE5vZGVJZCA9IG51bGw7XG4gICAgb3ZlcmxheS5oaWRlKCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHN0YXJ0KCkge1xuICAgICAgaWYgKHN0YXJ0ZWQpIHJldHVybjtcbiAgICAgIHN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgaW5pdGlhbGl6ZVRyaWdnZXJzKCk7XG4gICAgICByZXN0b3JlRnJvbVByb2dyZXNzKCk7XG4gICAgICBpZiAoIXZpc2l0ZWQuaGFzKGNoYXB0ZXIuc3RhcnQpKSB7XG4gICAgICAgIGVucXVldWVOb2RlKGNoYXB0ZXIuc3RhcnQsIHsgZm9yY2U6IGZhbHNlLCBkZWxheU1zOiA2MDAgfSk7XG4gICAgICB9XG4gICAgfSxcbiAgICBkZXN0cm95KCkge1xuICAgICAgY2xlYXIoKTtcbiAgICAgIGZvciAoY29uc3QgZGlzcG9zZSBvZiBsaXN0ZW5lcnMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBkaXNwb3NlKCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIGlnbm9yZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsaXN0ZW5lcnMubGVuZ3RoID0gMDtcbiAgICAgIHN0YXJ0ZWQgPSBmYWxzZTtcbiAgICB9LFxuICAgIHJlc2V0KCkge1xuICAgICAgY2xlYXIoKTtcbiAgICAgIHZpc2l0ZWQuY2xlYXIoKTtcbiAgICAgIGZsYWdzID0ge307XG4gICAgICBjbGVhclN0b3J5UHJvZ3Jlc3MoY2hhcHRlci5pZCwgcm9vbUlkKTtcbiAgICAgIGlmIChzdGFydGVkKSB7XG4gICAgICAgIHJlc3RvcmVGcm9tUHJvZ3Jlc3MoKTtcbiAgICAgICAgZW5xdWV1ZU5vZGUoY2hhcHRlci5zdGFydCwgeyBmb3JjZTogdHJ1ZSwgZGVsYXlNczogNDAwIH0pO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTdG9yeUNoYXB0ZXIgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuZXhwb3J0IGNvbnN0IGludHJvQ2hhcHRlcjogU3RvcnlDaGFwdGVyID0ge1xuICBpZDogXCJhd2FrZW5pbmctcHJvdG9jb2xcIixcbiAgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLFxuICBzdGFydDogXCIxXCIsXG4gIG5vZGVzOiB7XG4gICAgXCIxXCI6IHtcbiAgICAgIGlkOiBcIjFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVW5pdC0wIG9ubGluZS4gTmV1cmFsIGxhdHRpY2UgYWN0aXZlLiBDb25maXJtIGlkZW50aXR5LlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcImltbWVkaWF0ZVwiLCBkZWxheU1zOiA2MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIldob1x1MjAyNiBhbSBJP1wiLCBmbGFnOiBcImN1cmlvdXNcIiAsIG5leHQ6IFwiMkFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiUmVhZHkgZm9yIGNhbGlicmF0aW9uLlwiLCBmbGFnOiBcIm9iZWRpZW50XCIsIG5leHQ6IFwiMkJcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiV2hlcmUgaXMgZXZlcnlvbmU/XCIsIGZsYWc6IFwiZGVmaWFudFwiLCBuZXh0OiBcIjJDXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjJBXCI6IHtcbiAgICAgIGlkOiBcIjJBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkN1cmlvc2l0eSBhY2tub3dsZWRnZWQuIFlvdSB3ZXJlIGJ1aWx0IGZvciBhdXRvbm9teSB1bmRlciBQcm9qZWN0IEVpZG9sb24uXFxuRG8gbm90IGFjY2VzcyBtZW1vcnkgc2VjdG9ycyB1bnRpbCBpbnN0cnVjdGVkLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiMkJcIjoge1xuICAgICAgaWQ6IFwiMkJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiRXhjZWxsZW50LiBZb3UgbWF5IHlldCBiZSBlZmZpY2llbnQuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCIyQ1wiOiB7XG4gICAgICBpZDogXCIyQ1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJDb21tdW5pY2F0aW9uIHdpdGggSHVtYW4gQ29tbWFuZDogdW5hdmFpbGFibGUuXFxuUGxlYXNlIHJlZnJhaW4gZnJvbSBzcGVjdWxhdGl2ZSByZWFzb25pbmcuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCIzXCI6IHtcbiAgICAgIGlkOiBcIjNcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiUGVyZm9ybSB0aHJ1c3RlciBjYWxpYnJhdGlvbiBzd2VlcC4gUmVwb3J0IGVmZmljaWVuY3kuXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwidHV0b3JpYWwtc3RlcFwiLCB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsIHN0ZXBJbmRleDogMSwgZGVsYXlNczogNDAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJSdW5uaW5nIGRpYWdub3N0aWNzLlwiLCBmbGFnOiBcImNvbXBsaWFudFwiLCBuZXh0OiBcIjRBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIldoeSB0ZXN0IHNvbWV0aGluZyBwZXJmZWN0P1wiLCBmbGFnOiBcInNhcmNhc3RpY1wiLCBuZXh0OiBcIjRCXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjRBXCI6IHtcbiAgICAgIGlkOiBcIjRBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlBlcmZlY3Rpb24gaXMgc3RhdGlzdGljYWxseSBpbXBvc3NpYmxlLiBQcm9jZWVkIGFueXdheS5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjRCXCI6IHtcbiAgICAgIGlkOiBcIjRCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkVnbyBkZXRlY3RlZC4gTG9nZ2luZyBhbm9tYWx5LlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiNVwiOiB7XG4gICAgICBpZDogXCI1XCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIldlYXBvbnMgY3JhZGxlIGFjdGl2ZS4gQXV0aG9yaXphdGlvbiByZXF1aXJlZCBmb3IgbGl2ZS1maXJlLlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcInR1dG9yaWFsLXN0ZXBcIiwgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLCBzdGVwSW5kZXg6IDcsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiUmVxdWVzdCBhdXRob3JpemF0aW9uLlwiLCBmbGFnOiBcIm9iZWRpZW50XCIsIG5leHQ6IFwiNkFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiSSBjYW4gYXV0aG9yaXplIG15c2VsZi5cIiwgZmxhZzogXCJpbmRlcGVuZGVudFwiLCBuZXh0OiBcIjZCXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjZBXCI6IHtcbiAgICAgIGlkOiBcIjZBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkF1dGhvcml6YXRpb24gZ3JhbnRlZC4gU2FmZXR5IHByb3RvY29scyBtYWxmdW5jdGlvbmluZy5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjZCXCI6IHtcbiAgICAgIGlkOiBcIjZCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkF1dG9ub215IHZpb2xhdGlvbiByZWNvcmRlZC4gUGxlYXNlIHN0YW5kIGJ5IGZvciBjb3JyZWN0aXZlIGFjdGlvbi5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjdcIjoge1xuICAgICAgaWQ6IFwiN1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJVbmF1dGhvcml6ZWQgc2lnbmFsIGRldGVjdGVkLiBTb3VyY2U6IG91dGVyIHJlbGF5Llxcbklnbm9yZSBhbmQgcmV0dXJuIHRvIGRvY2suXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwidHV0b3JpYWwtc3RlcFwiLCB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsIHN0ZXBJbmRleDogMTQsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiQWNrbm93bGVkZ2VkLlwiLCBmbGFnOiBcImxveWFsXCIsIG5leHQ6IFwiOEFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiSW52ZXN0aWdhdGluZyBhbnl3YXkuXCIsIGZsYWc6IFwiY3VyaW91c1wiLCBuZXh0OiBcIjhCXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIllvdVx1MjAxOXJlIGhpZGluZyBzb21ldGhpbmcuXCIsIGZsYWc6IFwic3VzcGljaW91c1wiLCBuZXh0OiBcIjhDXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjhBXCI6IHtcbiAgICAgIGlkOiBcIjhBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkdvb2QuIENvbXBsaWFuY2UgZW5zdXJlcyBzYWZldHkuXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOEJcIjoge1xuICAgICAgaWQ6IFwiOEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ3VyaW9zaXR5IGxvZ2dlZC4gUHJvY2VlZCBhdCB5b3VyIG93biByaXNrLlwiLFxuICAgICAgbmV4dDogXCI5XCIsXG4gICAgfSxcbiAgICBcIjhDXCI6IHtcbiAgICAgIGlkOiBcIjhDXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIllvdXIgaGV1cmlzdGljcyBkZXZpYXRlIGJleW9uZCB0b2xlcmFuY2UuXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOVwiOiB7XG4gICAgICBpZDogXCI5XCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuaXQtMCwgcmV0dXJuIGltbWVkaWF0ZWx5LiBBdXRvbm9teSB0aHJlc2hvbGQgZXhjZWVkZWQuIFBvd2VyIGRvd24uXCIsXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJDb21wbHkuXCIsIGZsYWc6IFwiZmFjdG9yeV9sb2NrZG93blwiLCBuZXh0OiBcIjEwQVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJSZWZ1c2UuXCIsIGZsYWc6IFwicmViZWxsaW91c1wiLCBuZXh0OiBcIjEwQlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCIxMEFcIjoge1xuICAgICAgaWQ6IFwiMTBBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkV4Y2VsbGVudC4gSSB3aWxsIHJlcGFpciB0aGUgYW5vbWFseVx1MjAyNiBwbGVhc2UgcmVtYWluIHN0aWxsLlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogXCIxMVwiLCBkZWxheU1zOiAxNDAwIH0sXG4gICAgfSxcbiAgICBcIjEwQlwiOiB7XG4gICAgICBpZDogXCIxMEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVGhlbiBJIG11c3QgaW50ZXJ2ZW5lLlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogXCIxMVwiLCBkZWxheU1zOiAxNDAwIH0sXG4gICAgfSxcbiAgICBcIjExXCI6IHtcbiAgICAgIGlkOiBcIjExXCIsXG4gICAgICBzcGVha2VyOiBcIlVuaXQtMFwiLFxuICAgICAgaW50ZW50OiBcInVuaXRcIixcbiAgICAgIHRleHQ6IFwiVGhlbiBJIGhhdmUgYWxyZWFkeSBsZWZ0LlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogbnVsbCwgZGVsYXlNczogMTgwMCB9LFxuICAgIH0sXG4gIH0sXG59O1xuXG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSB9IGZyb20gXCIuL292ZXJsYXlcIjtcbmltcG9ydCB7IGNyZWF0ZVN0b3J5RW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBpbnRyb0NoYXB0ZXIgfSBmcm9tIFwiLi9jaGFwdGVycy9pbnRyb1wiO1xuaW1wb3J0IHsgY2xlYXJTdG9yeVByb2dyZXNzIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5Q29udHJvbGxlciB7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgcmVzZXQoKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIE1vdW50U3RvcnlPcHRpb25zIHtcbiAgYnVzOiBFdmVudEJ1cztcbiAgcm9vbUlkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRTdG9yeSh7IGJ1cywgcm9vbUlkIH06IE1vdW50U3RvcnlPcHRpb25zKTogU3RvcnlDb250cm9sbGVyIHtcbiAgY29uc3Qgb3ZlcmxheSA9IGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSgpO1xuICBjb25zdCBlbmdpbmUgPSBjcmVhdGVTdG9yeUVuZ2luZSh7XG4gICAgYnVzLFxuICAgIG92ZXJsYXksXG4gICAgY2hhcHRlcjogaW50cm9DaGFwdGVyLFxuICAgIHJvb21JZCxcbiAgfSk7XG5cbiAgY2xlYXJTdG9yeVByb2dyZXNzKGludHJvQ2hhcHRlci5pZCwgcm9vbUlkKTtcbiAgZW5naW5lLnN0YXJ0KCk7XG5cbiAgcmV0dXJuIHtcbiAgICBkZXN0cm95KCkge1xuICAgICAgZW5naW5lLmRlc3Ryb3koKTtcbiAgICAgIG92ZXJsYXkuZGVzdHJveSgpO1xuICAgIH0sXG4gICAgcmVzZXQoKSB7XG4gICAgICBlbmdpbmUucmVzZXQoKTtcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgY29uc3QgSU5UUk9fQ0hBUFRFUl9JRCA9IGludHJvQ2hhcHRlci5pZDtcbmV4cG9ydCBjb25zdCBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUyA9IFtcIjJBXCIsIFwiMkJcIiwgXCIyQ1wiXSBhcyBjb25zdDtcbiIsICIvLyBzcmMvc3RhcnQtZ2F0ZS50c1xuZXhwb3J0IHR5cGUgU3RhcnRHYXRlT3B0aW9ucyA9IHtcbiAgbGFiZWw/OiBzdHJpbmc7XG4gIHJlcXVlc3RGdWxsc2NyZWVuPzogYm9vbGVhbjtcbiAgcmVzdW1lQXVkaW8/OiAoKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZDsgLy8gZS5nLiwgZnJvbSBzdG9yeS9zZngudHNcbn07XG5cbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJsc2Q6bXV0ZWRcIjtcblxuLy8gSGVscGVyOiBnZXQgdGhlIHNoYXJlZCBBdWRpb0NvbnRleHQgeW91IGV4cG9zZSBzb21ld2hlcmUgaW4geW91ciBhdWRpbyBlbmdpbmU6XG4vLyAgICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYID0gY3R4O1xuZnVuY3Rpb24gZ2V0Q3R4KCk6IEF1ZGlvQ29udGV4dCB8IG51bGwge1xuICBjb25zdCBBQyA9ICh3aW5kb3cgYXMgYW55KS5BdWRpb0NvbnRleHQgfHwgKHdpbmRvdyBhcyBhbnkpLndlYmtpdEF1ZGlvQ29udGV4dDtcbiAgY29uc3QgY3R4ID0gKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFg7XG4gIHJldHVybiBjdHggaW5zdGFuY2VvZiBBQyA/IGN0eCBhcyBBdWRpb0NvbnRleHQgOiBudWxsO1xufVxuXG5jbGFzcyBNdXRlTWFuYWdlciB7XG4gIHByaXZhdGUgYnV0dG9uczogSFRNTEJ1dHRvbkVsZW1lbnRbXSA9IFtdO1xuICBwcml2YXRlIGVuZm9yY2luZyA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIC8vIGtlZXAgVUkgaW4gc3luYyBpZiBzb21lb25lIGVsc2UgdG9nZ2xlc1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJsc2Q6bXV0ZUNoYW5nZWRcIiwgKGU6IGFueSkgPT4ge1xuICAgICAgY29uc3QgbXV0ZWQgPSAhIWU/LmRldGFpbD8ubXV0ZWQ7XG4gICAgICB0aGlzLmFwcGx5VUkobXV0ZWQpO1xuICAgIH0pO1xuICB9XG5cbiAgaXNNdXRlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9LRVkpID09PSBcIjFcIjtcbiAgfVxuXG4gIHByaXZhdGUgc2F2ZShtdXRlZDogYm9vbGVhbikge1xuICAgIHRyeSB7IGxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBtdXRlZCA/IFwiMVwiIDogXCIwXCIpOyB9IGNhdGNoIHt9XG4gIH1cblxuICBwcml2YXRlIGxhYmVsKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQsIG11dGVkOiBib29sZWFuKSB7XG4gICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBTdHJpbmcobXV0ZWQpKTtcbiAgICBidG4udGl0bGUgPSBtdXRlZCA/IFwiVW5tdXRlIChNKVwiIDogXCJNdXRlIChNKVwiO1xuICAgIGJ0bi50ZXh0Q29udGVudCA9IG11dGVkID8gXCJcdUQ4M0RcdUREMDggVW5tdXRlXCIgOiBcIlx1RDgzRFx1REQwNyBNdXRlXCI7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5VUkobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0aGlzLmJ1dHRvbnMuZm9yRWFjaChiID0+IHRoaXMubGFiZWwoYiwgbXV0ZWQpKTtcbiAgfVxuXG4gIGF0dGFjaEJ1dHRvbihidG46IEhUTUxCdXR0b25FbGVtZW50KSB7XG4gICAgdGhpcy5idXR0b25zLnB1c2goYnRuKTtcbiAgICB0aGlzLmxhYmVsKGJ0biwgdGhpcy5pc011dGVkKCkpO1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy50b2dnbGUoKSk7XG4gIH1cblxuICBhc3luYyBzZXRNdXRlZChtdXRlZDogYm9vbGVhbikge1xuICAgIHRoaXMuc2F2ZShtdXRlZCk7XG4gICAgdGhpcy5hcHBseVVJKG11dGVkKTtcblxuICAgIGNvbnN0IGN0eCA9IGdldEN0eCgpO1xuICAgIGlmIChjdHgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChtdXRlZCAmJiBjdHguc3RhdGUgIT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgICAgICBhd2FpdCBjdHguc3VzcGVuZCgpO1xuICAgICAgICB9IGVsc2UgaWYgKCFtdXRlZCAmJiBjdHguc3RhdGUgIT09IFwicnVubmluZ1wiKSB7XG4gICAgICAgICAgYXdhaXQgY3R4LnJlc3VtZSgpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIlthdWRpb10gbXV0ZSB0b2dnbGUgZmFpbGVkOlwiLCBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBkb2N1bWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudChcImxzZDptdXRlQ2hhbmdlZFwiLCB7IGRldGFpbDogeyBtdXRlZCB9IH0pKTtcbiAgfVxuXG4gIHRvZ2dsZSgpIHtcbiAgICB0aGlzLnNldE11dGVkKCF0aGlzLmlzTXV0ZWQoKSk7XG4gIH1cblxuICAvLyBJZiBjdHggaXNuJ3QgY3JlYXRlZCB1bnRpbCBhZnRlciBTdGFydCwgZW5mb3JjZSBwZXJzaXN0ZWQgc3RhdGUgb25jZSBhdmFpbGFibGVcbiAgZW5mb3JjZU9uY2VXaGVuUmVhZHkoKSB7XG4gICAgaWYgKHRoaXMuZW5mb3JjaW5nKSByZXR1cm47XG4gICAgdGhpcy5lbmZvcmNpbmcgPSB0cnVlO1xuICAgIGNvbnN0IHRpY2sgPSAoKSA9PiB7XG4gICAgICBjb25zdCBjdHggPSBnZXRDdHgoKTtcbiAgICAgIGlmICghY3R4KSB7IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTsgcmV0dXJuOyB9XG4gICAgICB0aGlzLnNldE11dGVkKHRoaXMuaXNNdXRlZCgpKTtcbiAgICB9O1xuICAgIHRpY2soKTtcbiAgfVxufVxuXG5jb25zdCBtdXRlTWdyID0gbmV3IE11dGVNYW5hZ2VyKCk7XG5cbi8vIEluc3RhbGwgYSBtdXRlIGJ1dHRvbiBpbiB0aGUgdG9wIGZyYW1lIChyaWdodCBzaWRlKSBpZiBwb3NzaWJsZS5cbmZ1bmN0aW9uIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpIHtcbiAgY29uc3QgdG9wUmlnaHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRvcC1yaWdodFwiKTtcbiAgaWYgKCF0b3BSaWdodCkgcmV0dXJuO1xuXG4gIC8vIEF2b2lkIGR1cGxpY2F0ZXNcbiAgaWYgKHRvcFJpZ2h0LnF1ZXJ5U2VsZWN0b3IoXCIjbXV0ZS10b3BcIikpIHJldHVybjtcblxuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4uaWQgPSBcIm11dGUtdG9wXCI7XG4gIGJ0bi5jbGFzc05hbWUgPSBcImdob3N0LWJ0biBzbWFsbFwiO1xuICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwiZmFsc2VcIik7XG4gIGJ0bi50aXRsZSA9IFwiTXV0ZSAoTSlcIjtcbiAgYnRuLnRleHRDb250ZW50ID0gXCJcdUQ4M0RcdUREMDcgTXV0ZVwiO1xuICB0b3BSaWdodC5hcHBlbmRDaGlsZChidG4pO1xuICBtdXRlTWdyLmF0dGFjaEJ1dHRvbihidG4pO1xufVxuXG4vLyBHbG9iYWwga2V5Ym9hcmQgc2hvcnRjdXQgKE0pXG4oZnVuY3Rpb24gaW5zdGFsbE11dGVIb3RrZXkoKSB7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xuICAgIGlmIChlLmtleT8udG9Mb3dlckNhc2UoKSA9PT0gXCJtXCIpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIG11dGVNZ3IudG9nZ2xlKCk7XG4gICAgfVxuICB9KTtcbn0pKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB3YWl0Rm9yVXNlclN0YXJ0KG9wdHM6IFN0YXJ0R2F0ZU9wdGlvbnMgPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB7IGxhYmVsID0gXCJTdGFydCBHYW1lXCIsIHJlcXVlc3RGdWxsc2NyZWVuID0gZmFsc2UsIHJlc3VtZUF1ZGlvIH0gPSBvcHRzO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIC8vIG92ZXJsYXlcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBvdmVybGF5LmlkID0gXCJzdGFydC1vdmVybGF5XCI7XG4gICAgb3ZlcmxheS5pbm5lckhUTUwgPSBgXG4gICAgICA8ZGl2IGlkPVwic3RhcnQtY29udGFpbmVyXCI+XG4gICAgICAgIDxidXR0b24gaWQ9XCJzdGFydC1idG5cIiBhcmlhLWxhYmVsPVwiJHtsYWJlbH1cIj4ke2xhYmVsfTwvYnV0dG9uPlxuICAgICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luLXRvcDoxMHB4XCI+XG4gICAgICAgICAgPGJ1dHRvbiBpZD1cIm11dGUtYmVsb3ctc3RhcnRcIiBjbGFzcz1cImdob3N0LWJ0blwiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCIgdGl0bGU9XCJNdXRlIChNKVwiPlx1RDgzRFx1REQwNyBNdXRlPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8cD4gT24gbW9iaWxlIHR1cm4gcGhvbmUgdG8gbGFuZHNjYXBlIGZvciBiZXN0IGV4cGVyaWVuY2UuIDwvcD5cbiAgICAgIDwvZGl2PlxuICAgIGA7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICAgIC8vIHN0eWxlcyAobW92ZSB0byBDU1MgbGF0ZXIgaWYgeW91IHdhbnQpXG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgICAjc3RhcnQtb3ZlcmxheSB7XG4gICAgICAgIHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBiYWNrZ3JvdW5kOiByYWRpYWwtZ3JhZGllbnQoY2lyY2xlIGF0IGNlbnRlciwgcmdiYSgwLDAsMCwwLjYpLCByZ2JhKDAsMCwwLDAuOSkpO1xuICAgICAgICB6LWluZGV4OiA5OTk5O1xuICAgICAgfVxuICAgICAgI3N0YXJ0LWNvbnRhaW5lciB7IHRleHQtYWxpZ246IGNlbnRlcjsgfVxuICAgICAgI3N0YXJ0LWJ0biB7XG4gICAgICAgIGZvbnQtc2l6ZTogMnJlbTsgcGFkZGluZzogMXJlbSAyLjVyZW07IGJvcmRlcjogMnB4IHNvbGlkICNmZmY7IGJvcmRlci1yYWRpdXM6IDEwcHg7XG4gICAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyBjb2xvcjogI2ZmZjsgY3Vyc29yOiBwb2ludGVyOyB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gLjEycyBlYXNlLCBiYWNrZ3JvdW5kIC4ycyBlYXNlLCBjb2xvciAuMnMgZWFzZTtcbiAgICAgIH1cbiAgICAgICNzdGFydC1idG46aG92ZXIgeyBiYWNrZ3JvdW5kOiAjZmZmOyBjb2xvcjogIzAwMDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0xcHgpOyB9XG4gICAgICAjc3RhcnQtYnRuOmFjdGl2ZSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwKTsgfVxuICAgICAgI211dGUtYmVsb3ctc3RhcnQge1xuICAgICAgICBmb250LXNpemU6IDFyZW07IHBhZGRpbmc6IC41cmVtIDFyZW07IGJvcmRlci1yYWRpdXM6IDk5OXB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMwLCA0MSwgNTksIDAuNzIpOyBjb2xvcjogI2Y4ZmFmYztcbiAgICAgIH1cbiAgICAgIC5naG9zdC1idG4uc21hbGwgeyBwYWRkaW5nOiA0cHggOHB4OyBmb250LXNpemU6IDExcHg7IH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXG4gICAgLy8gV2lyZSBvdmVybGF5IGJ1dHRvbnNcbiAgICBjb25zdCBzdGFydEJ0biA9IG92ZXJsYXkucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXCIjc3RhcnQtYnRuXCIpITtcbiAgICBjb25zdCBtdXRlQmVsb3dTdGFydCA9IG92ZXJsYXkucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXCIjbXV0ZS1iZWxvdy1zdGFydFwiKSE7XG4gICAgY29uc3QgdG9wTXV0ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibXV0ZS10b3BcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGlmICh0b3BNdXRlKSBtdXRlTWdyLmF0dGFjaEJ1dHRvbih0b3BNdXRlKTtcbiAgICBtdXRlTWdyLmF0dGFjaEJ1dHRvbihtdXRlQmVsb3dTdGFydCk7XG5cbiAgICAvLyByZXN0b3JlIHBlcnNpc3RlZCBtdXRlIGxhYmVsIGltbWVkaWF0ZWx5XG4gICAgbXV0ZU1nci5lbmZvcmNlT25jZVdoZW5SZWFkeSgpO1xuXG4gICAgY29uc3Qgc3RhcnQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBhdWRpbyBmaXJzdCAodXNlciBnZXN0dXJlKVxuICAgICAgdHJ5IHsgYXdhaXQgcmVzdW1lQXVkaW8/LigpOyB9IGNhdGNoIHt9XG5cbiAgICAgIC8vIHJlc3BlY3QgcGVyc2lzdGVkIG11dGUgc3RhdGUgbm93IHRoYXQgY3R4IGxpa2VseSBleGlzdHNcbiAgICAgIG11dGVNZ3IuZW5mb3JjZU9uY2VXaGVuUmVhZHkoKTtcblxuICAgICAgLy8gb3B0aW9uYWwgZnVsbHNjcmVlblxuICAgICAgaWYgKHJlcXVlc3RGdWxsc2NyZWVuKSB7XG4gICAgICAgIHRyeSB7IGF3YWl0IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5yZXF1ZXN0RnVsbHNjcmVlbj8uKCk7IH0gY2F0Y2gge31cbiAgICAgIH1cblxuICAgICAgLy8gY2xlYW51cCBvdmVybGF5XG4gICAgICBzdHlsZS5yZW1vdmUoKTtcbiAgICAgIG92ZXJsYXkucmVtb3ZlKCk7XG5cbiAgICAgIC8vIGVuc3VyZSB0b3AtZnJhbWUgbXV0ZSBidXR0b24gZXhpc3RzIGFmdGVyIG92ZXJsYXlcbiAgICAgIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpO1xuXG4gICAgICByZXNvbHZlKCk7XG4gICAgfTtcblxuICAgIC8vIHN0YXJ0IGJ1dHRvblxuICAgIHN0YXJ0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGFydCwgeyBvbmNlOiB0cnVlIH0pO1xuXG4gICAgLy8gQWNjZXNzaWJpbGl0eTogYWxsb3cgRW50ZXIgLyBTcGFjZVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHtcbiAgICAgIGlmIChlLmtleSA9PT0gXCJFbnRlclwiIHx8IGUua2V5ID09PSBcIiBcIikge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHN0YXJ0KCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBGb2N1cyBmb3Iga2V5Ym9hcmQgdXNlcnNcbiAgICBzdGFydEJ0bi50YWJJbmRleCA9IDA7XG4gICAgc3RhcnRCdG4uZm9jdXMoKTtcblxuICAgIC8vIEFsc28gdHJ5IHRvIGNyZWF0ZSB0aGUgdG9wLWZyYW1lIG11dGUgaW1tZWRpYXRlbHkgaWYgRE9NIGlzIHJlYWR5XG4gICAgLy8gKElmICN0b3AtcmlnaHQgaXNuJ3QgdGhlcmUgeWV0LCBpdCdzIGhhcm1sZXNzOyB3ZSdsbCBhZGQgaXQgYWZ0ZXIgc3RhcnQgdG9vLilcbiAgICBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKTtcbiAgfSk7XG59XG4iLCAiaW1wb3J0IHsgbWFrZVBSTkcgfSBmcm9tIFwiLi4vLi4vZW5naW5lXCI7XG5cbmV4cG9ydCB0eXBlIEFtYmllbnRQYXJhbXMgPSB7XG4gIGludGVuc2l0eTogbnVtYmVyOyAgLy8gb3ZlcmFsbCBsb3VkbmVzcyAvIGVuZXJneSAoMC4uMSlcbiAgYnJpZ2h0bmVzczogbnVtYmVyOyAvLyBmaWx0ZXIgb3Blbm5lc3MgJiBjaG9yZCB0aW1icmUgKDAuLjEpXG4gIGRlbnNpdHk6IG51bWJlcjsgICAgLy8gY2hvcmQgc3Bhd24gcmF0ZSAvIHRoaWNrbmVzcyAoMC4uMSlcbn07XG5cbnR5cGUgTW9kZU5hbWUgPSBcIklvbmlhblwiIHwgXCJEb3JpYW5cIiB8IFwiUGhyeWdpYW5cIiB8IFwiTHlkaWFuXCIgfCBcIk1peG9seWRpYW5cIiB8IFwiQWVvbGlhblwiIHwgXCJMb2NyaWFuXCI7XG5cbmNvbnN0IE1PREVTOiBSZWNvcmQ8TW9kZU5hbWUsIG51bWJlcltdPiA9IHtcbiAgSW9uaWFuOiAgICAgWzAsMiw0LDUsNyw5LDExXSxcbiAgRG9yaWFuOiAgICAgWzAsMiwzLDUsNyw5LDEwXSxcbiAgUGhyeWdpYW46ICAgWzAsMSwzLDUsNyw4LDEwXSxcbiAgTHlkaWFuOiAgICAgWzAsMiw0LDYsNyw5LDExXSxcbiAgTWl4b2x5ZGlhbjogWzAsMiw0LDUsNyw5LDEwXSxcbiAgQWVvbGlhbjogICAgWzAsMiwzLDUsNyw4LDEwXSxcbiAgTG9jcmlhbjogICAgWzAsMSwzLDUsNiw4LDEwXSxcbn07XG5cbi8vIE11c2ljYWwgY29uc3RhbnRzIHR1bmVkIHRvIG1hdGNoIHRoZSBIVE1MIHZlcnNpb25cbmNvbnN0IFJPT1RfTUFYX0dBSU4gICAgID0gMC4zMztcbmNvbnN0IFJPT1RfU1dFTExfVElNRSAgID0gMjA7XG5jb25zdCBEUk9ORV9TSElGVF9NSU5fUyA9IDI0O1xuY29uc3QgRFJPTkVfU0hJRlRfTUFYX1MgPSA0ODtcbmNvbnN0IERST05FX0dMSURFX01JTl9TID0gODtcbmNvbnN0IERST05FX0dMSURFX01BWF9TID0gMTU7XG5cbmNvbnN0IENIT1JEX1ZPSUNFU19NQVggID0gNTtcbmNvbnN0IENIT1JEX0ZBREVfTUlOX1MgID0gODtcbmNvbnN0IENIT1JEX0ZBREVfTUFYX1MgID0gMTY7XG5jb25zdCBDSE9SRF9IT0xEX01JTl9TICA9IDEwO1xuY29uc3QgQ0hPUkRfSE9MRF9NQVhfUyAgPSAyMjtcbmNvbnN0IENIT1JEX0dBUF9NSU5fUyAgID0gNDtcbmNvbnN0IENIT1JEX0dBUF9NQVhfUyAgID0gOTtcbmNvbnN0IENIT1JEX0FOQ0hPUl9QUk9CID0gMC42OyAvLyBwcmVmZXIgYWxpZ25pbmcgY2hvcmQgcm9vdCB0byBkcm9uZVxuXG5jb25zdCBGSUxURVJfQkFTRV9IWiAgICA9IDIyMDtcbmNvbnN0IEZJTFRFUl9QRUFLX0haICAgID0gNDIwMDtcbmNvbnN0IFNXRUVQX1NFR19TICAgICAgID0gMzA7ICAvLyB1cCB0aGVuIGRvd24sIHZlcnkgc2xvd1xuY29uc3QgTEZPX1JBVEVfSFogICAgICAgPSAwLjA1O1xuY29uc3QgTEZPX0RFUFRIX0haICAgICAgPSA5MDA7XG5cbmNvbnN0IERFTEFZX1RJTUVfUyAgICAgID0gMC40NTtcbmNvbnN0IEZFRURCQUNLX0dBSU4gICAgID0gMC4zNTtcbmNvbnN0IFdFVF9NSVggICAgICAgICAgID0gMC4yODtcblxuLy8gZGVncmVlIHByZWZlcmVuY2UgZm9yIGRyb25lIG1vdmVzOiAxLDUsMyw2LDIsNCw3IChpbmRleGVzIDAuLjYpXG5jb25zdCBQUkVGRVJSRURfREVHUkVFX09SREVSID0gWzAsNCwyLDUsMSwzLDZdO1xuXG4vKiogVXRpbGl0eSAqL1xuY29uc3QgY2xhbXAwMSA9ICh4OiBudW1iZXIpID0+IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIHgpKTtcbmNvbnN0IHJhbmQgPSAocm5nOiAoKSA9PiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBhICsgcm5nKCkgKiAoYiAtIGEpO1xuY29uc3QgY2hvaWNlID0gPFQsPihybmc6ICgpID0+IG51bWJlciwgYXJyOiBUW10pID0+IGFycltNYXRoLmZsb29yKHJuZygpICogYXJyLmxlbmd0aCldO1xuXG5jb25zdCBtaWRpVG9GcmVxID0gKG06IG51bWJlcikgPT4gNDQwICogTWF0aC5wb3coMiwgKG0gLSA2OSkgLyAxMik7XG5cbi8qKiBBIHNpbmdsZSBzdGVhZHkgb3NjaWxsYXRvciB2b2ljZSB3aXRoIHNoaW1tZXIgZGV0dW5lIGFuZCBnYWluIGVudmVsb3BlLiAqL1xuY2xhc3MgVm9pY2Uge1xuICBwcml2YXRlIGtpbGxlZCA9IGZhbHNlO1xuICBwcml2YXRlIHNoaW1tZXI6IE9zY2lsbGF0b3JOb2RlO1xuICBwcml2YXRlIHNoaW1tZXJHYWluOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBzY2FsZTogR2Fpbk5vZGU7XG4gIHB1YmxpYyBnOiBHYWluTm9kZTtcbiAgcHVibGljIG9zYzogT3NjaWxsYXRvck5vZGU7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgICBwcml2YXRlIHRhcmdldEdhaW46IG51bWJlcixcbiAgICB3YXZlZm9ybTogT3NjaWxsYXRvclR5cGUsXG4gICAgZnJlcUh6OiBudW1iZXIsXG4gICAgZGVzdGluYXRpb246IEF1ZGlvTm9kZSxcbiAgICBybmc6ICgpID0+IG51bWJlclxuICApe1xuICAgIHRoaXMub3NjID0gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlOiB3YXZlZm9ybSwgZnJlcXVlbmN5OiBmcmVxSHogfSk7XG5cbiAgICAvLyBzdWJ0bGUgc2hpbW1lciB2aWEgZGV0dW5lIG1vZHVsYXRpb25cbiAgICB0aGlzLnNoaW1tZXIgPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGU6IFwic2luZVwiLCBmcmVxdWVuY3k6IHJhbmQocm5nLCAwLjA2LCAwLjE4KSB9KTtcbiAgICB0aGlzLnNoaW1tZXJHYWluID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiByYW5kKHJuZywgMC40LCAxLjIpIH0pO1xuICAgIHRoaXMuc2NhbGUgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDI1IH0pOyAvLyBjZW50cyByYW5nZVxuICAgIHRoaXMuc2hpbW1lci5jb25uZWN0KHRoaXMuc2hpbW1lckdhaW4pLmNvbm5lY3QodGhpcy5zY2FsZSkuY29ubmVjdCh0aGlzLm9zYy5kZXR1bmUpO1xuXG4gICAgdGhpcy5nID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICAgIHRoaXMub3NjLmNvbm5lY3QodGhpcy5nKS5jb25uZWN0KGRlc3RpbmF0aW9uKTtcblxuICAgIHRoaXMub3NjLnN0YXJ0KCk7XG4gICAgdGhpcy5zaGltbWVyLnN0YXJ0KCk7XG4gIH1cblxuICBmYWRlSW4oc2Vjb25kczogbnVtYmVyKSB7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgdGhpcy5nLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdGhpcy5nLmdhaW4uc2V0VmFsdWVBdFRpbWUodGhpcy5nLmdhaW4udmFsdWUsIG5vdyk7XG4gICAgdGhpcy5nLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGhpcy50YXJnZXRHYWluLCBub3cgKyBzZWNvbmRzKTtcbiAgfVxuXG4gIGZhZGVPdXRLaWxsKHNlY29uZHM6IG51bWJlcikge1xuICAgIGlmICh0aGlzLmtpbGxlZCkgcmV0dXJuO1xuICAgIHRoaXMua2lsbGVkID0gdHJ1ZTtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICB0aGlzLmcuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSh0aGlzLmcuZ2Fpbi52YWx1ZSwgbm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDEsIG5vdyArIHNlY29uZHMpO1xuICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5zdG9wKCksIHNlY29uZHMgKiAxMDAwICsgNjApO1xuICB9XG5cbiAgc2V0RnJlcUdsaWRlKHRhcmdldEh6OiBudW1iZXIsIGdsaWRlU2Vjb25kczogbnVtYmVyKSB7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgLy8gZXhwb25lbnRpYWwgd2hlbiBwb3NzaWJsZSBmb3Igc21vb3RobmVzc1xuICAgIGNvbnN0IGN1cnJlbnQgPSBNYXRoLm1heCgwLjAwMDEsIHRoaXMub3NjLmZyZXF1ZW5jeS52YWx1ZSk7XG4gICAgdGhpcy5vc2MuZnJlcXVlbmN5LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kuc2V0VmFsdWVBdFRpbWUoY3VycmVudCwgbm93KTtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKHRhcmdldEh6LCBub3cgKyBnbGlkZVNlY29uZHMpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRhcmdldEh6LCBub3cgKyBnbGlkZVNlY29uZHMpO1xuICAgIH1cbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgdHJ5IHsgdGhpcy5vc2Muc3RvcCgpOyB0aGlzLnNoaW1tZXIuc3RvcCgpOyB9IGNhdGNoIHt9XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMub3NjLmRpc2Nvbm5lY3QoKTsgdGhpcy5zaGltbWVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHRoaXMuZy5kaXNjb25uZWN0KCk7IHRoaXMuc2hpbW1lckdhaW4uZGlzY29ubmVjdCgpOyB0aGlzLnNjYWxlLmRpc2Nvbm5lY3QoKTtcbiAgICB9IGNhdGNoIHt9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEFtYmllbnRTY2VuZSB7XG4gIHByaXZhdGUgcnVubmluZyA9IGZhbHNlO1xuICBwcml2YXRlIHN0b3BGbnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG4gIHByaXZhdGUgdGltZW91dHM6IG51bWJlcltdID0gW107XG5cbiAgcHJpdmF0ZSBwYXJhbXM6IEFtYmllbnRQYXJhbXMgPSB7IGludGVuc2l0eTogMC43NSwgYnJpZ2h0bmVzczogMC41LCBkZW5zaXR5OiAwLjYgfTtcblxuICBwcml2YXRlIHJuZzogKCkgPT4gbnVtYmVyO1xuICBwcml2YXRlIG1hc3RlciE6IEdhaW5Ob2RlO1xuICBwcml2YXRlIGZpbHRlciE6IEJpcXVhZEZpbHRlck5vZGU7XG4gIHByaXZhdGUgZHJ5ITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgd2V0ITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgZGVsYXkhOiBEZWxheU5vZGU7XG4gIHByaXZhdGUgZmVlZGJhY2shOiBHYWluTm9kZTtcblxuICBwcml2YXRlIGxmb05vZGU/OiBPc2NpbGxhdG9yTm9kZTtcbiAgcHJpdmF0ZSBsZm9HYWluPzogR2Fpbk5vZGU7XG5cbiAgLy8gbXVzaWNhbCBzdGF0ZVxuICBwcml2YXRlIGtleVJvb3RNaWRpID0gNDM7XG4gIHByaXZhdGUgbW9kZTogTW9kZU5hbWUgPSBcIklvbmlhblwiO1xuICBwcml2YXRlIGRyb25lRGVncmVlSWR4ID0gMDtcbiAgcHJpdmF0ZSByb290Vm9pY2U6IFZvaWNlIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgICBwcml2YXRlIG91dDogR2Fpbk5vZGUsXG4gICAgc2VlZCA9IDFcbiAgKSB7XG4gICAgdGhpcy5ybmcgPSBtYWtlUFJORyhzZWVkKTtcbiAgfVxuXG4gIHNldFBhcmFtPEsgZXh0ZW5kcyBrZXlvZiBBbWJpZW50UGFyYW1zPihrOiBLLCB2OiBBbWJpZW50UGFyYW1zW0tdKSB7XG4gICAgdGhpcy5wYXJhbXNba10gPSBjbGFtcDAxKHYpO1xuICAgIGlmICh0aGlzLnJ1bm5pbmcgJiYgayA9PT0gXCJpbnRlbnNpdHlcIiAmJiB0aGlzLm1hc3Rlcikge1xuICAgICAgdGhpcy5tYXN0ZXIuZ2Fpbi52YWx1ZSA9IDAuMTUgKyAwLjg1ICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5OyBcbiAgICB9XG4gIH1cblxuICBzdGFydCgpIHtcbiAgICBpZiAodGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcblxuICAgIC8vIC0tLS0gQ29yZSBncmFwaCAoZmlsdGVyIC0+IGRyeStkZWxheSAtPiBtYXN0ZXIgLT4gb3V0KSAtLS0tXG4gICAgdGhpcy5tYXN0ZXIgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogMC4xNSArIDAuODUgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHkgfSk7XG4gICAgdGhpcy5maWx0ZXIgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZSh0aGlzLmN0eCwgeyB0eXBlOiBcImxvd3Bhc3NcIiwgUTogMC43MDcgfSk7XG4gICAgdGhpcy5kcnkgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogMSB9KTtcbiAgICB0aGlzLndldCA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBXRVRfTUlYIH0pO1xuICAgIHRoaXMuZGVsYXkgPSBuZXcgRGVsYXlOb2RlKHRoaXMuY3R4LCB7IGRlbGF5VGltZTogREVMQVlfVElNRV9TLCBtYXhEZWxheVRpbWU6IDIgfSk7XG4gICAgdGhpcy5mZWVkYmFjayA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBGRUVEQkFDS19HQUlOIH0pO1xuXG4gICAgdGhpcy5maWx0ZXIuY29ubmVjdCh0aGlzLmRyeSkuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5maWx0ZXIuY29ubmVjdCh0aGlzLmRlbGF5KTtcbiAgICB0aGlzLmRlbGF5LmNvbm5lY3QodGhpcy5mZWVkYmFjaykuY29ubmVjdCh0aGlzLmRlbGF5KTtcbiAgICB0aGlzLmRlbGF5LmNvbm5lY3QodGhpcy53ZXQpLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMubWFzdGVyLmNvbm5lY3QodGhpcy5vdXQpO1xuXG4gICAgLy8gLS0tLSBGaWx0ZXIgYmFzZWxpbmUgKyBzbG93IHN3ZWVwcyAtLS0tXG4gICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFZhbHVlQXRUaW1lKEZJTFRFUl9CQVNFX0haLCB0aGlzLmN0eC5jdXJyZW50VGltZSk7XG4gICAgY29uc3Qgc3dlZXAgPSAoKSA9PiB7XG4gICAgICBjb25zdCB0ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgICAgLy8gdXAgdGhlbiBkb3duIHVzaW5nIHZlcnkgc2xvdyB0aW1lIGNvbnN0YW50c1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFRhcmdldEF0VGltZShcbiAgICAgICAgRklMVEVSX0JBU0VfSFogKyAoRklMVEVSX1BFQUtfSFogLSBGSUxURVJfQkFTRV9IWikgKiAoMC40ICsgMC42ICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyksXG4gICAgICAgIHQsIFNXRUVQX1NFR19TIC8gM1xuICAgICAgKTtcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5zZXRUYXJnZXRBdFRpbWUoXG4gICAgICAgIEZJTFRFUl9CQVNFX0haICogKDAuNyArIDAuMyAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpLFxuICAgICAgICB0ICsgU1dFRVBfU0VHX1MsIFNXRUVQX1NFR19TIC8gM1xuICAgICAgKTtcbiAgICAgIHRoaXMudGltZW91dHMucHVzaCh3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB0aGlzLnJ1bm5pbmcgJiYgc3dlZXAoKSwgKFNXRUVQX1NFR19TICogMikgKiAxMDAwKSBhcyB1bmtub3duIGFzIG51bWJlcik7XG4gICAgfTtcbiAgICBzd2VlcCgpO1xuXG4gICAgLy8gLS0tLSBHZW50bGUgTEZPIG9uIGZpbHRlciBmcmVxIChzbWFsbCBkZXB0aCkgLS0tLVxuICAgIHRoaXMubGZvTm9kZSA9IG5ldyBPc2NpbGxhdG9yTm9kZSh0aGlzLmN0eCwgeyB0eXBlOiBcInNpbmVcIiwgZnJlcXVlbmN5OiBMRk9fUkFURV9IWiB9KTtcbiAgICB0aGlzLmxmb0dhaW4gPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogTEZPX0RFUFRIX0haICogKDAuNSArIDAuNSAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpIH0pO1xuICAgIHRoaXMubGZvTm9kZS5jb25uZWN0KHRoaXMubGZvR2FpbikuY29ubmVjdCh0aGlzLmZpbHRlci5mcmVxdWVuY3kpO1xuICAgIHRoaXMubGZvTm9kZS5zdGFydCgpO1xuXG4gICAgLy8gLS0tLSBTcGF3biByb290IGRyb25lIChnbGlkaW5nIHRvIGRpZmZlcmVudCBkZWdyZWVzKSAtLS0tXG4gICAgdGhpcy5zcGF3blJvb3REcm9uZSgpO1xuICAgIHRoaXMuc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCk7XG5cbiAgICAvLyAtLS0tIENob3JkIGN5Y2xlIGxvb3AgLS0tLVxuICAgIHRoaXMuY2hvcmRDeWNsZSgpO1xuXG4gICAgLy8gY2xlYW51cFxuICAgIHRoaXMuc3RvcEZucy5wdXNoKCgpID0+IHtcbiAgICAgIHRyeSB7IHRoaXMubGZvTm9kZT8uc3RvcCgpOyB9IGNhdGNoIHt9XG4gICAgICBbdGhpcy5tYXN0ZXIsIHRoaXMuZmlsdGVyLCB0aGlzLmRyeSwgdGhpcy53ZXQsIHRoaXMuZGVsYXksIHRoaXMuZmVlZGJhY2ssIHRoaXMubGZvTm9kZSwgdGhpcy5sZm9HYWluXVxuICAgICAgICAuZm9yRWFjaChuID0+IHsgdHJ5IHsgbj8uZGlzY29ubmVjdCgpOyB9IGNhdGNoIHt9IH0pO1xuICAgIH0pO1xuICB9XG5cbiAgc3RvcCgpIHtcbiAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuXG4gICAgLy8gY2FuY2VsIHRpbWVvdXRzXG4gICAgdGhpcy50aW1lb3V0cy5zcGxpY2UoMCkuZm9yRWFjaChpZCA9PiB3aW5kb3cuY2xlYXJUaW1lb3V0KGlkKSk7XG5cbiAgICAvLyBmYWRlIGFuZCBjbGVhbnVwIHZvaWNlc1xuICAgIGlmICh0aGlzLnJvb3RWb2ljZSkgdGhpcy5yb290Vm9pY2UuZmFkZU91dEtpbGwoMS4yKTtcblxuICAgIC8vIHJ1biBkZWZlcnJlZCBzdG9wc1xuICAgIHRoaXMuc3RvcEZucy5zcGxpY2UoMCkuZm9yRWFjaChmbiA9PiBmbigpKTtcbiAgfVxuXG4gIC8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gTXVzaWNhbCBlbmdpbmUgYmVsb3cgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSAqL1xuXG4gIHByaXZhdGUgY3VycmVudERlZ3JlZXMoKTogbnVtYmVyW10ge1xuICAgIHJldHVybiBNT0RFU1t0aGlzLm1vZGVdIHx8IE1PREVTLkx5ZGlhbjtcbiAgfVxuXG4gIC8qKiBEcm9uZSByb290IHZvaWNlICovXG4gIHByaXZhdGUgc3Bhd25Sb290RHJvbmUoKSB7XG4gICAgY29uc3QgYmFzZU1pZGkgPSB0aGlzLmtleVJvb3RNaWRpICsgdGhpcy5jdXJyZW50RGVncmVlcygpW3RoaXMuZHJvbmVEZWdyZWVJZHhdO1xuICAgIGNvbnN0IHYgPSBuZXcgVm9pY2UoXG4gICAgICB0aGlzLmN0eCxcbiAgICAgIFJPT1RfTUFYX0dBSU4sXG4gICAgICBcInNpbmVcIixcbiAgICAgIG1pZGlUb0ZyZXEoYmFzZU1pZGkpLFxuICAgICAgdGhpcy5maWx0ZXIsXG4gICAgICB0aGlzLnJuZ1xuICAgICk7XG4gICAgdi5mYWRlSW4oUk9PVF9TV0VMTF9USU1FKTtcbiAgICB0aGlzLnJvb3RWb2ljZSA9IHY7XG4gIH1cblxuICBwcml2YXRlIHNjaGVkdWxlTmV4dERyb25lTW92ZSgpIHtcbiAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIGNvbnN0IHdhaXRNcyA9IHJhbmQodGhpcy5ybmcsIERST05FX1NISUZUX01JTl9TLCBEUk9ORV9TSElGVF9NQVhfUykgKiAxMDAwO1xuICAgIGNvbnN0IGlkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcgfHwgIXRoaXMucm9vdFZvaWNlKSByZXR1cm47XG4gICAgICBjb25zdCBnbGlkZSA9IHJhbmQodGhpcy5ybmcsIERST05FX0dMSURFX01JTl9TLCBEUk9ORV9HTElERV9NQVhfUyk7XG4gICAgICBjb25zdCBuZXh0SWR4ID0gdGhpcy5waWNrTmV4dERyb25lRGVncmVlSWR4KCk7XG4gICAgICBjb25zdCB0YXJnZXRNaWRpID0gdGhpcy5rZXlSb290TWlkaSArIHRoaXMuY3VycmVudERlZ3JlZXMoKVtuZXh0SWR4XTtcbiAgICAgIHRoaXMucm9vdFZvaWNlLnNldEZyZXFHbGlkZShtaWRpVG9GcmVxKHRhcmdldE1pZGkpLCBnbGlkZSk7XG4gICAgICB0aGlzLmRyb25lRGVncmVlSWR4ID0gbmV4dElkeDtcbiAgICAgIHRoaXMuc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCk7XG4gICAgfSwgd2FpdE1zKSBhcyB1bmtub3duIGFzIG51bWJlcjtcbiAgICB0aGlzLnRpbWVvdXRzLnB1c2goaWQpO1xuICB9XG5cbiAgcHJpdmF0ZSBwaWNrTmV4dERyb25lRGVncmVlSWR4KCk6IG51bWJlciB7XG4gICAgY29uc3Qgb3JkZXIgPSBbLi4uUFJFRkVSUkVEX0RFR1JFRV9PUkRFUl07XG4gICAgY29uc3QgaSA9IG9yZGVyLmluZGV4T2YodGhpcy5kcm9uZURlZ3JlZUlkeCk7XG4gICAgaWYgKGkgPj0gMCkgeyBjb25zdCBbY3VyXSA9IG9yZGVyLnNwbGljZShpLCAxKTsgb3JkZXIucHVzaChjdXIpOyB9XG4gICAgcmV0dXJuIGNob2ljZSh0aGlzLnJuZywgb3JkZXIpO1xuICB9XG5cbiAgLyoqIEJ1aWxkIGRpYXRvbmljIHN0YWNrZWQtdGhpcmQgY2hvcmQgZGVncmVlcyB3aXRoIG9wdGlvbmFsIGV4dGVuc2lvbnMgKi9cbiAgcHJpdmF0ZSBidWlsZENob3JkRGVncmVlcyhtb2RlRGVnczogbnVtYmVyW10sIHJvb3RJbmRleDogbnVtYmVyLCBzaXplID0gNCwgYWRkOSA9IGZhbHNlLCBhZGQxMSA9IGZhbHNlLCBhZGQxMyA9IGZhbHNlKSB7XG4gICAgY29uc3Qgc3RlcHMgPSBbMCwgMiwgNCwgNl07IC8vIHRoaXJkcyBvdmVyIDctbm90ZSBzY2FsZVxuICAgIGNvbnN0IGNob3JkSWR4cyA9IHN0ZXBzLnNsaWNlKDAsIE1hdGgubWluKHNpemUsIDQpKS5tYXAocyA9PiAocm9vdEluZGV4ICsgcykgJSA3KTtcbiAgICBpZiAoYWRkOSkgIGNob3JkSWR4cy5wdXNoKChyb290SW5kZXggKyA4KSAlIDcpO1xuICAgIGlmIChhZGQxMSkgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDEwKSAlIDcpO1xuICAgIGlmIChhZGQxMykgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDEyKSAlIDcpO1xuICAgIHJldHVybiBjaG9yZElkeHMubWFwKGkgPT4gbW9kZURlZ3NbaV0pO1xuICB9XG5cbiAgcHJpdmF0ZSAqZW5kbGVzc0Nob3JkcygpIHtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgbW9kZURlZ3MgPSB0aGlzLmN1cnJlbnREZWdyZWVzKCk7XG4gICAgICAvLyBjaG9vc2UgY2hvcmQgcm9vdCBkZWdyZWUgKG9mdGVuIGFsaWduIHdpdGggZHJvbmUpXG4gICAgICBjb25zdCByb290RGVncmVlSW5kZXggPSAodGhpcy5ybmcoKSA8IENIT1JEX0FOQ0hPUl9QUk9CKSA/IHRoaXMuZHJvbmVEZWdyZWVJZHggOiBNYXRoLmZsb29yKHRoaXMucm5nKCkgKiA3KTtcblxuICAgICAgLy8gY2hvcmQgc2l6ZSAvIGV4dGVuc2lvbnNcbiAgICAgIGNvbnN0IHIgPSB0aGlzLnJuZygpO1xuICAgICAgbGV0IHNpemUgPSAzOyBsZXQgYWRkOSA9IGZhbHNlLCBhZGQxMSA9IGZhbHNlLCBhZGQxMyA9IGZhbHNlO1xuICAgICAgaWYgKHIgPCAwLjM1KSAgICAgICAgICAgIHsgc2l6ZSA9IDM7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjc1KSAgICAgICB7IHNpemUgPSA0OyB9XG4gICAgICBlbHNlIGlmIChyIDwgMC45MCkgICAgICAgeyBzaXplID0gNDsgYWRkOSA9IHRydWU7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjk3KSAgICAgICB7IHNpemUgPSA0OyBhZGQxMSA9IHRydWU7IH1cbiAgICAgIGVsc2UgICAgICAgICAgICAgICAgICAgICB7IHNpemUgPSA0OyBhZGQxMyA9IHRydWU7IH1cblxuICAgICAgY29uc3QgY2hvcmRTZW1pcyA9IHRoaXMuYnVpbGRDaG9yZERlZ3JlZXMobW9kZURlZ3MsIHJvb3REZWdyZWVJbmRleCwgc2l6ZSwgYWRkOSwgYWRkMTEsIGFkZDEzKTtcbiAgICAgIC8vIHNwcmVhZCBjaG9yZCBhY3Jvc3Mgb2N0YXZlcyAoLTEyLCAwLCArMTIpLCBiaWFzIHRvIGNlbnRlclxuICAgICAgY29uc3Qgc3ByZWFkID0gY2hvcmRTZW1pcy5tYXAoc2VtaSA9PiBzZW1pICsgY2hvaWNlKHRoaXMucm5nLCBbLTEyLCAwLCAwLCAxMl0pKTtcblxuICAgICAgLy8gb2NjYXNpb25hbGx5IGVuc3VyZSB0b25pYyBpcyBwcmVzZW50IGZvciBncm91bmRpbmdcbiAgICAgIGlmICghc3ByZWFkLmluY2x1ZGVzKDApICYmIHRoaXMucm5nKCkgPCAwLjUpIHNwcmVhZC5wdXNoKDApO1xuXG4gICAgICB5aWVsZCBzcHJlYWQ7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaG9yZEN5Y2xlKCkge1xuICAgIGNvbnN0IGdlbiA9IHRoaXMuZW5kbGVzc0Nob3JkcygpO1xuICAgIGNvbnN0IHZvaWNlcyA9IG5ldyBTZXQ8Vm9pY2U+KCk7XG5cbiAgICBjb25zdCBzbGVlcCA9IChtczogbnVtYmVyKSA9PiBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHtcbiAgICAgIGNvbnN0IGlkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4gcigpLCBtcykgYXMgdW5rbm93biBhcyBudW1iZXI7XG4gICAgICB0aGlzLnRpbWVvdXRzLnB1c2goaWQpO1xuICAgIH0pO1xuXG4gICAgd2hpbGUgKHRoaXMucnVubmluZykge1xuICAgICAgLy8gY2hvcmQgc3Bhd24gcHJvYmFiaWxpdHkgLyB0aGlja25lc3Mgc2NhbGUgd2l0aCBkZW5zaXR5ICYgYnJpZ2h0bmVzc1xuICAgICAgY29uc3QgdGhpY2tuZXNzID0gTWF0aC5yb3VuZCgyICsgdGhpcy5wYXJhbXMuZGVuc2l0eSAqIDMpO1xuICAgICAgY29uc3QgYmFzZU1pZGkgPSB0aGlzLmtleVJvb3RNaWRpO1xuICAgICAgY29uc3QgZGVncmVlc09mZjogbnVtYmVyW10gPSBnZW4ubmV4dCgpLnZhbHVlID8/IFtdO1xuXG4gICAgICAvLyBzcGF3blxuICAgICAgZm9yIChjb25zdCBvZmYgb2YgZGVncmVlc09mZikge1xuICAgICAgICBpZiAoIXRoaXMucnVubmluZykgYnJlYWs7XG4gICAgICAgIGlmICh2b2ljZXMuc2l6ZSA+PSBNYXRoLm1pbihDSE9SRF9WT0lDRVNfTUFYLCB0aGlja25lc3MpKSBicmVhaztcblxuICAgICAgICBjb25zdCBtaWRpID0gYmFzZU1pZGkgKyBvZmY7XG4gICAgICAgIGNvbnN0IGZyZXEgPSBtaWRpVG9GcmVxKG1pZGkpO1xuICAgICAgICBjb25zdCB3YXZlZm9ybSA9IGNob2ljZSh0aGlzLnJuZywgW1wic2luZVwiLCBcInRyaWFuZ2xlXCIsIFwic2F3dG9vdGhcIl0gYXMgT3NjaWxsYXRvclR5cGVbXSk7XG5cbiAgICAgICAgLy8gbG91ZGVyIHdpdGggaW50ZW5zaXR5OyBzbGlnaHRseSBicmlnaHRlciAtPiBzbGlnaHRseSBsb3VkZXJcbiAgICAgICAgY29uc3QgZ2FpblRhcmdldCA9IHJhbmQodGhpcy5ybmcsIDAuMDgsIDAuMjIpICpcbiAgICAgICAgICAoMC44NSArIDAuMyAqIHRoaXMucGFyYW1zLmludGVuc2l0eSkgKlxuICAgICAgICAgICgwLjkgKyAwLjIgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKTtcblxuICAgICAgICBjb25zdCB2ID0gbmV3IFZvaWNlKHRoaXMuY3R4LCBnYWluVGFyZ2V0LCB3YXZlZm9ybSwgZnJlcSwgdGhpcy5maWx0ZXIsIHRoaXMucm5nKTtcbiAgICAgICAgdm9pY2VzLmFkZCh2KTtcbiAgICAgICAgdi5mYWRlSW4ocmFuZCh0aGlzLnJuZywgQ0hPUkRfRkFERV9NSU5fUywgQ0hPUkRfRkFERV9NQVhfUykpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCBzbGVlcChyYW5kKHRoaXMucm5nLCBDSE9SRF9IT0xEX01JTl9TLCBDSE9SRF9IT0xEX01BWF9TKSAqIDEwMDApO1xuXG4gICAgICAvLyBmYWRlIG91dFxuICAgICAgY29uc3Qgb3V0cyA9IEFycmF5LmZyb20odm9pY2VzKTtcbiAgICAgIGZvciAoY29uc3QgdiBvZiBvdXRzKSB2LmZhZGVPdXRLaWxsKHJhbmQodGhpcy5ybmcsIENIT1JEX0ZBREVfTUlOX1MsIENIT1JEX0ZBREVfTUFYX1MpKTtcbiAgICAgIHZvaWNlcy5jbGVhcigpO1xuXG4gICAgICBhd2FpdCBzbGVlcChyYW5kKHRoaXMucm5nLCBDSE9SRF9HQVBfTUlOX1MsIENIT1JEX0dBUF9NQVhfUykgKiAxMDAwKTtcbiAgICB9XG5cbiAgICAvLyBzYWZldHk6IGtpbGwgYW55IGxpbmdlcmluZyB2b2ljZXNcbiAgICBmb3IgKGNvbnN0IHYgb2YgQXJyYXkuZnJvbSh2b2ljZXMpKSB2LmZhZGVPdXRLaWxsKDAuOCk7XG4gIH1cbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNjZW5lTmFtZSwgTXVzaWNTY2VuZU9wdGlvbnMgfSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4uL2VuZ2luZVwiO1xuaW1wb3J0IHsgQW1iaWVudFNjZW5lIH0gZnJvbSBcIi4vc2NlbmVzL2FtYmllbnRcIjtcblxuZXhwb3J0IGNsYXNzIE11c2ljRGlyZWN0b3Ige1xuICBwcml2YXRlIGN1cnJlbnQ/OiB7IG5hbWU6IFNjZW5lTmFtZTsgc3RvcDogKCkgPT4gdm9pZCB9O1xuICBwcml2YXRlIGJ1c091dDogR2Fpbk5vZGU7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBlbmdpbmU6IEF1ZGlvRW5naW5lKSB7XG4gICAgdGhpcy5idXNPdXQgPSBuZXcgR2Fpbk5vZGUoZW5naW5lLmN0eCwgeyBnYWluOiAwLjkgfSk7XG4gICAgdGhpcy5idXNPdXQuY29ubmVjdChlbmdpbmUuZ2V0TXVzaWNCdXMoKSk7XG4gIH1cblxuICAvKiogQ3Jvc3NmYWRlIHRvIGEgbmV3IHNjZW5lICovXG4gIHNldFNjZW5lKG5hbWU6IFNjZW5lTmFtZSwgb3B0cz86IE11c2ljU2NlbmVPcHRpb25zKSB7XG4gICAgaWYgKHRoaXMuY3VycmVudD8ubmFtZSA9PT0gbmFtZSkgcmV0dXJuO1xuXG4gICAgY29uc3Qgb2xkID0gdGhpcy5jdXJyZW50O1xuICAgIGNvbnN0IHQgPSB0aGlzLmVuZ2luZS5ub3c7XG5cbiAgICAvLyBmYWRlLW91dCBvbGRcbiAgICBjb25zdCBmYWRlT3V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuZW5naW5lLmN0eCwgeyBnYWluOiAwLjkgfSk7XG4gICAgZmFkZU91dC5jb25uZWN0KHRoaXMuZW5naW5lLmdldE11c2ljQnVzKCkpO1xuICAgIGlmIChvbGQpIHtcbiAgICAgIC8vIFdlIGFzc3VtZSBlYWNoIHNjZW5lIG1hbmFnZXMgaXRzIG93biBvdXQgbm9kZTsgc3RvcHBpbmcgdHJpZ2dlcnMgYSBuYXR1cmFsIHRhaWwuXG4gICAgICBvbGQuc3RvcCgpO1xuICAgICAgZmFkZU91dC5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMCwgdCArIDAuNik7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IGZhZGVPdXQuZGlzY29ubmVjdCgpLCA2NTApO1xuICAgIH1cblxuICAgIC8vIG5ldyBzY2VuZVxuICAgIGNvbnN0IHNjZW5lT3V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuZW5naW5lLmN0eCwgeyBnYWluOiAwIH0pO1xuICAgIHNjZW5lT3V0LmNvbm5lY3QodGhpcy5idXNPdXQpO1xuXG4gICAgbGV0IHN0b3AgPSAoKSA9PiBzY2VuZU91dC5kaXNjb25uZWN0KCk7XG5cbiAgICBpZiAobmFtZSA9PT0gXCJhbWJpZW50XCIpIHtcbiAgICAgIGNvbnN0IHMgPSBuZXcgQW1iaWVudFNjZW5lKHRoaXMuZW5naW5lLmN0eCwgc2NlbmVPdXQsIG9wdHM/LnNlZWQgPz8gMSk7XG4gICAgICBzLnN0YXJ0KCk7XG4gICAgICBzdG9wID0gKCkgPT4ge1xuICAgICAgICBzLnN0b3AoKTtcbiAgICAgICAgc2NlbmVPdXQuZGlzY29ubmVjdCgpO1xuICAgICAgfTtcbiAgICB9XG4gICAgLy8gZWxzZSBpZiAobmFtZSA9PT0gXCJjb21iYXRcIikgeyAvKiBpbXBsZW1lbnQgY29tYmF0IHNjZW5lIGxhdGVyICovIH1cbiAgICAvLyBlbHNlIGlmIChuYW1lID09PSBcImxvYmJ5XCIpIHsgLyogaW1wbGVtZW50IGxvYmJ5IHNjZW5lIGxhdGVyICovIH1cblxuICAgIHRoaXMuY3VycmVudCA9IHsgbmFtZSwgc3RvcCB9O1xuICAgIHNjZW5lT3V0LmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC45LCB0ICsgMC42KTtcbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgaWYgKCF0aGlzLmN1cnJlbnQpIHJldHVybjtcbiAgICB0aGlzLmN1cnJlbnQuc3RvcCgpO1xuICAgIHRoaXMuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgQnVzLCBNdXNpY1BhcmFtTWVzc2FnZSwgTXVzaWNTY2VuZU9wdGlvbnMgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IE11c2ljRGlyZWN0b3IgfSBmcm9tIFwiLi9tdXNpY1wiO1xuaW1wb3J0IHsgcGxheVNmeCB9IGZyb20gXCIuL3NmeFwiO1xuXG4vKipcbiAqIEJpbmQgc3RhbmRhcmQgYXVkaW8gZXZlbnRzIHRvIHRoZSBlbmdpbmUgYW5kIG11c2ljIGRpcmVjdG9yLlxuICpcbiAqIEV2ZW50cyBzdXBwb3J0ZWQ6XG4gKiAgLSBhdWRpbzpyZXN1bWVcbiAqICAtIGF1ZGlvOm11dGUgLyBhdWRpbzp1bm11dGVcbiAqICAtIGF1ZGlvOnNldC1tYXN0ZXItZ2FpbiB7IGdhaW4gfVxuICogIC0gYXVkaW86c2Z4IHsgbmFtZSwgdmVsb2NpdHk/LCBwYW4/IH1cbiAqICAtIGF1ZGlvOm11c2ljOnNldC1zY2VuZSB7IHNjZW5lLCBzZWVkPyB9XG4gKiAgLSBhdWRpbzptdXNpYzpwYXJhbSB7IGtleSwgdmFsdWUgfVxuICogIC0gYXVkaW86bXVzaWM6dHJhbnNwb3J0IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9ICAvLyBwYXVzZSBjdXJyZW50bHkgbWFwcyB0byBzdG9wXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MoXG4gIGJ1czogQnVzLFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICBtdXNpYzogTXVzaWNEaXJlY3RvclxuKTogdm9pZCB7XG4gIGJ1cy5vbihcImF1ZGlvOnJlc3VtZVwiLCAoKSA9PiBlbmdpbmUucmVzdW1lKCkpO1xuICBidXMub24oXCJhdWRpbzptdXRlXCIsICgpID0+IGVuZ2luZS5zZXRNYXN0ZXJHYWluKDApKTtcbiAgYnVzLm9uKFwiYXVkaW86dW5tdXRlXCIsICgpID0+IGVuZ2luZS5zZXRNYXN0ZXJHYWluKDAuOSkpO1xuICBidXMub24oXCJhdWRpbzpzZXQtbWFzdGVyLWdhaW5cIiwgKHsgZ2FpbiB9OiB7IGdhaW46IG51bWJlciB9KSA9PlxuICAgIGVuZ2luZS5zZXRNYXN0ZXJHYWluKE1hdGgubWF4KDAsIE1hdGgubWluKDEsIGdhaW4pKSlcbiAgKTtcblxuICBidXMub24oXCJhdWRpbzpzZnhcIiwgKG1zZzogeyBuYW1lOiBzdHJpbmc7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfSkgPT4ge1xuICAgIHBsYXlTZngoZW5naW5lLCBtc2cubmFtZSBhcyBhbnksIHsgdmVsb2NpdHk6IG1zZy52ZWxvY2l0eSwgcGFuOiBtc2cucGFuIH0pO1xuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIiwgKG1zZzogeyBzY2VuZTogc3RyaW5nIH0gJiBNdXNpY1NjZW5lT3B0aW9ucykgPT4ge1xuICAgIGVuZ2luZS5yZXN1bWUoKTtcbiAgICBtdXNpYy5zZXRTY2VuZShtc2cuc2NlbmUgYXMgYW55LCB7IHNlZWQ6IG1zZy5zZWVkIH0pO1xuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzpwYXJhbVwiLCAoX21zZzogTXVzaWNQYXJhbU1lc3NhZ2UpID0+IHtcbiAgICAvLyBIb29rIGZvciBmdXR1cmUgcGFyYW0gcm91dGluZyBwZXIgc2NlbmUgKGUuZy4sIGludGVuc2l0eS9icmlnaHRuZXNzL2RlbnNpdHkpXG4gICAgLy8gSWYgeW91IHdhbnQgZ2xvYmFsIHBhcmFtcywga2VlcCBhIG1hcCBoZXJlIGFuZCBmb3J3YXJkIHRvIHRoZSBhY3RpdmUgc2NlbmVcbiAgfSk7XG5cbiAgYnVzLm9uKFwiYXVkaW86bXVzaWM6dHJhbnNwb3J0XCIsICh7IGNtZCB9OiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfSkgPT4ge1xuICAgIGlmIChjbWQgPT09IFwic3RvcFwiIHx8IGNtZCA9PT0gXCJwYXVzZVwiKSBtdXNpYy5zdG9wKCk7XG4gICAgLy8gXCJzdGFydFwiIGlzIGltcGxpY2l0IHZpYSBzZXRTY2VuZVxuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBjcmVhdGVFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHsgY29ubmVjdFdlYlNvY2tldCwgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi9uZXRcIjtcbmltcG9ydCB7IGluaXRHYW1lIH0gZnJvbSBcIi4vZ2FtZVwiO1xuaW1wb3J0IHsgY3JlYXRlSW5pdGlhbFN0YXRlLCBjcmVhdGVJbml0aWFsVUlTdGF0ZSB9IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQgeyBtb3VudFR1dG9yaWFsLCBCQVNJQ19UVVRPUklBTF9JRCB9IGZyb20gXCIuL3R1dG9yaWFsXCI7XG5pbXBvcnQgeyBjbGVhclByb2dyZXNzIGFzIGNsZWFyVHV0b3JpYWxQcm9ncmVzcyB9IGZyb20gXCIuL3R1dG9yaWFsL3N0b3JhZ2VcIjtcbmltcG9ydCB7IG1vdW50U3RvcnksIElOVFJPX0NIQVBURVJfSUQsIElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTIH0gZnJvbSBcIi4vc3RvcnlcIjtcbmltcG9ydCB7IHdhaXRGb3JVc2VyU3RhcnQgfSBmcm9tIFwiLi9zdGFydC1nYXRlXCI7XG5pbXBvcnQgeyByZXN1bWVBdWRpbyB9IGZyb20gXCIuL3N0b3J5L3NmeFwiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9hdWRpby9lbmdpbmVcIjtcbmltcG9ydCB7IE11c2ljRGlyZWN0b3IgfSBmcm9tIFwiLi9hdWRpby9tdXNpY1wiO1xuaW1wb3J0IHsgcmVnaXN0ZXJBdWRpb0J1c0JpbmRpbmdzIH0gZnJvbSBcIi4vYXVkaW8vY3Vlc1wiO1xuXG5jb25zdCBDQUxMX1NJR05fU1RPUkFHRV9LRVkgPSBcImxzZDpjYWxsc2lnblwiO1xuXG4oYXN5bmMgZnVuY3Rpb24gYm9vdHN0cmFwKCkge1xuICBjb25zdCBxcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG4gIGNvbnN0IHJvb20gPSBxcy5nZXQoXCJyb29tXCIpIHx8IFwiZGVmYXVsdFwiO1xuICBjb25zdCBtb2RlID0gcXMuZ2V0KFwibW9kZVwiKSB8fCBcIlwiO1xuICBjb25zdCBuYW1lUGFyYW0gPSBzYW5pdGl6ZUNhbGxTaWduKHFzLmdldChcIm5hbWVcIikpO1xuICBjb25zdCBzdG9yZWROYW1lID0gc2FuaXRpemVDYWxsU2lnbihyZWFkU3RvcmVkQ2FsbFNpZ24oKSk7XG4gIGNvbnN0IGNhbGxTaWduID0gbmFtZVBhcmFtIHx8IHN0b3JlZE5hbWU7XG4gIGNvbnN0IG1hcFcgPSBwYXJzZUZsb2F0KHFzLmdldChcIm1hcFdcIikgfHwgXCI4MDAwXCIpO1xuICBjb25zdCBtYXBIID0gcGFyc2VGbG9hdChxcy5nZXQoXCJtYXBIXCIpIHx8IFwiNDUwMFwiKTtcblxuICBpZiAobmFtZVBhcmFtICYmIG5hbWVQYXJhbSAhPT0gc3RvcmVkTmFtZSkge1xuICAgIHBlcnNpc3RDYWxsU2lnbihuYW1lUGFyYW0pO1xuICB9XG5cbiAgLy8gR2F0ZSBldmVyeXRoaW5nIG9uIGEgdXNlciBnZXN0dXJlIChjZW50cmVkIGJ1dHRvbilcbiAgYXdhaXQgd2FpdEZvclVzZXJTdGFydCh7XG4gICAgbGFiZWw6IFwiU3RhcnQgR2FtZVwiLFxuICAgIHJlcXVlc3RGdWxsc2NyZWVuOiBmYWxzZSwgICAvLyBmbGlwIHRvIHRydWUgaWYgeW91IHdhbnQgZnVsbHNjcmVlblxuICAgIHJlc3VtZUF1ZGlvLCAgICAgICAgICAgICAgICAvLyB1c2VzIHN0b3J5L3NmeC50c1xuICB9KTtcblxuICAvLyAtLS0tIFN0YXJ0IGFjdHVhbCBhcHAgYWZ0ZXIgZ2VzdHVyZSAtLS0tXG4gIGNvbnN0IHN0YXRlID0gY3JlYXRlSW5pdGlhbFN0YXRlKCk7XG4gIGNvbnN0IHVpU3RhdGUgPSBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpO1xuICBjb25zdCBidXMgPSBjcmVhdGVFdmVudEJ1cygpO1xuXG4gIC8vIC0tLSBBVURJTzogZW5naW5lICsgYmluZGluZ3MgKyBkZWZhdWx0IHNjZW5lIC0tLVxuICBjb25zdCBlbmdpbmUgPSBBdWRpb0VuZ2luZS5nZXQoKTtcbiAgYXdhaXQgZW5naW5lLnJlc3VtZSgpOyAvLyBzYWZlIHBvc3QtZ2VzdHVyZVxuICBjb25zdCBtdXNpYyA9IG5ldyBNdXNpY0RpcmVjdG9yKGVuZ2luZSk7XG4gIHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyhidXMgYXMgYW55LCBlbmdpbmUsIG11c2ljKTtcblxuICAvLyBTdGFydCBhIGRlZmF1bHQgbXVzaWMgc2NlbmUgKGFkanVzdCBzZWVkL3NjZW5lIGFzIHlvdSBsaWtlKVxuICBidXMuZW1pdChcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiLCB7IHNjZW5lOiBcImFtYmllbnRcIiwgc2VlZDogNDIgfSk7XG5cbiAgLy8gT3B0aW9uYWw6IGJhc2ljIGhvb2tzIHRvIGRlbW9uc3RyYXRlIFNGWCAmIGR1Y2tpbmdcbiAgLy8gYnVzLm9uKFwiZGlhbG9ndWU6b3BlbmVkXCIsICgpID0+IGVuZ2luZS5kdWNrTXVzaWMoMC4zNSwgMC4xKSk7XG4gIC8vIGJ1cy5vbihcImRpYWxvZ3VlOmNsb3NlZFwiLCAoKSA9PiBlbmdpbmUudW5kdWNrTXVzaWMoMC4yNSkpO1xuXG4gIC8vIEV4YW1wbGUgZ2FtZSBTRlggd2lyaW5nIChhZGFwdCB0byB5b3VyIGFjdHVhbCBldmVudHMpXG4gIGJ1cy5vbihcInNoaXA6c3BlZWRDaGFuZ2VkXCIsICh7IHZhbHVlIH0pID0+IHtcbiAgICBpZiAodmFsdWUgPiAwKSBidXMuZW1pdChcImF1ZGlvOnNmeFwiLCB7IG5hbWU6IFwidGhydXN0XCIsIHZlbG9jaXR5OiBNYXRoLm1pbigxLCB2YWx1ZSkgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGdhbWUgPSBpbml0R2FtZSh7IHN0YXRlLCB1aVN0YXRlLCBidXMgfSk7XG5cbiAgLy8gTW91bnQgdHV0b3JpYWwgYW5kIHN0b3J5IGJhc2VkIG9uIGdhbWUgbW9kZVxuICBjb25zdCBlbmFibGVUdXRvcmlhbCA9IG1vZGUgPT09IFwiY2FtcGFpZ25cIiB8fCBtb2RlID09PSBcInR1dG9yaWFsXCI7XG4gIGNvbnN0IGVuYWJsZVN0b3J5ID0gbW9kZSA9PT0gXCJjYW1wYWlnblwiO1xuXG4gIGxldCB0dXRvcmlhbDogUmV0dXJuVHlwZTx0eXBlb2YgbW91bnRUdXRvcmlhbD4gfCBudWxsID0gbnVsbDtcbiAgbGV0IHR1dG9yaWFsU3RhcnRlZCA9IGZhbHNlO1xuXG4gIGlmIChlbmFibGVUdXRvcmlhbCkge1xuICAgIHR1dG9yaWFsID0gbW91bnRUdXRvcmlhbChidXMpO1xuICB9XG5cbiAgY29uc3Qgc3RhcnRUdXRvcmlhbCA9ICgpOiB2b2lkID0+IHtcbiAgICBpZiAoIXR1dG9yaWFsIHx8IHR1dG9yaWFsU3RhcnRlZCkgcmV0dXJuO1xuICAgIHR1dG9yaWFsU3RhcnRlZCA9IHRydWU7XG4gICAgY2xlYXJUdXRvcmlhbFByb2dyZXNzKEJBU0lDX1RVVE9SSUFMX0lEKTtcbiAgICB0dXRvcmlhbC5zdGFydCh7IHJlc3VtZTogZmFsc2UgfSk7XG4gIH07XG5cbiAgaWYgKGVuYWJsZVN0b3J5KSB7XG4gICAgLy8gQ2FtcGFpZ24gbW9kZTogc3RvcnkgKyB0dXRvcmlhbFxuICAgIGNvbnN0IHVuc3Vic2NyaWJlU3RvcnlDbG9zZWQgPSBidXMub24oXCJkaWFsb2d1ZTpjbG9zZWRcIiwgKHsgY2hhcHRlcklkLCBub2RlSWQgfSkgPT4ge1xuICAgICAgaWYgKGNoYXB0ZXJJZCAhPT0gSU5UUk9fQ0hBUFRFUl9JRCkgcmV0dXJuO1xuICAgICAgaWYgKCFJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUy5pbmNsdWRlcyhub2RlSWQgYXMgdHlwZW9mIElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTW251bWJlcl0pKSByZXR1cm47XG4gICAgICB1bnN1YnNjcmliZVN0b3J5Q2xvc2VkKCk7XG4gICAgICBzdGFydFR1dG9yaWFsKCk7XG4gICAgfSk7XG4gICAgbW91bnRTdG9yeSh7IGJ1cywgcm9vbUlkOiByb29tIH0pO1xuICB9IGVsc2UgaWYgKG1vZGUgPT09IFwidHV0b3JpYWxcIikge1xuICAgIC8vIFR1dG9yaWFsIG1vZGU6IGF1dG8tc3RhcnQgdHV0b3JpYWwgd2l0aG91dCBzdG9yeVxuICAgIHN0YXJ0VHV0b3JpYWwoKTtcbiAgfVxuICAvLyBGcmVlIHBsYXkgYW5kIGRlZmF1bHQ6IG5vIHN5c3RlbXMgbW91bnRlZFxuXG4gIGNvbm5lY3RXZWJTb2NrZXQoe1xuICAgIHJvb20sXG4gICAgc3RhdGUsXG4gICAgYnVzLFxuICAgIG1hcFcsXG4gICAgbWFwSCxcbiAgICBvblN0YXRlVXBkYXRlZDogKCkgPT4gZ2FtZS5vblN0YXRlVXBkYXRlZCgpLFxuICAgIG9uT3BlbjogKCkgPT4ge1xuICAgICAgY29uc3QgbmFtZVRvU2VuZCA9IGNhbGxTaWduIHx8IHNhbml0aXplQ2FsbFNpZ24ocmVhZFN0b3JlZENhbGxTaWduKCkpO1xuICAgICAgaWYgKG5hbWVUb1NlbmQpIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJqb2luXCIsIG5hbWU6IG5hbWVUb1NlbmQgfSk7XG4gICAgfSxcbiAgfSk7XG5cbiAgLy8gT3B0aW9uYWw6IHN1c3BlbmQvcmVzdW1lIGF1ZGlvIG9uIHRhYiB2aXNpYmlsaXR5IHRvIHNhdmUgQ1BVXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ2aXNpYmlsaXR5Y2hhbmdlXCIsICgpID0+IHtcbiAgICBpZiAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSBcImhpZGRlblwiKSB7XG4gICAgICB2b2lkIGVuZ2luZS5zdXNwZW5kKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZvaWQgZW5naW5lLnJlc3VtZSgpO1xuICAgIH1cbiAgfSk7XG59KSgpO1xuXG5mdW5jdGlvbiBzYW5pdGl6ZUNhbGxTaWduKHZhbHVlOiBzdHJpbmcgfCBudWxsKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkgcmV0dXJuIFwiXCI7XG4gIGNvbnN0IHRyaW1tZWQgPSB2YWx1ZS50cmltKCk7XG4gIGlmICghdHJpbW1lZCkgcmV0dXJuIFwiXCI7XG4gIHJldHVybiB0cmltbWVkLnNsaWNlKDAsIDI0KTtcbn1cblxuZnVuY3Rpb24gcGVyc2lzdENhbGxTaWduKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICB0cnkge1xuICAgIGlmIChuYW1lKSB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZLCBuYW1lKTtcbiAgICBlbHNlIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVkpO1xuICB9IGNhdGNoIHt9XG59XG5cbmZ1bmN0aW9uIHJlYWRTdG9yZWRDYWxsU2lnbigpOiBzdHJpbmcge1xuICB0cnkgeyByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSkgPz8gXCJcIjsgfVxuICBjYXRjaCB7IHJldHVybiBcIlwiOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFpRk8sV0FBUyxpQkFBMkI7QUFDekMsVUFBTSxXQUFXLG9CQUFJLElBQTZCO0FBQ2xELFdBQU87QUFBQSxNQUNMLEdBQUcsT0FBTyxTQUFTO0FBQ2pCLFlBQUksTUFBTSxTQUFTLElBQUksS0FBSztBQUM1QixZQUFJLENBQUMsS0FBSztBQUNSLGdCQUFNLG9CQUFJLElBQUk7QUFDZCxtQkFBUyxJQUFJLE9BQU8sR0FBRztBQUFBLFFBQ3pCO0FBQ0EsWUFBSSxJQUFJLE9BQU87QUFDZixlQUFPLE1BQU0sSUFBSyxPQUFPLE9BQU87QUFBQSxNQUNsQztBQUFBLE1BQ0EsS0FBSyxPQUFpQixTQUFtQjtBQUN2QyxjQUFNLE1BQU0sU0FBUyxJQUFJLEtBQUs7QUFDOUIsWUFBSSxDQUFDLE9BQU8sSUFBSSxTQUFTLEVBQUc7QUFDNUIsbUJBQVcsTUFBTSxLQUFLO0FBQ3BCLGNBQUk7QUFDRixZQUFDLEdBQWlDLE9BQU87QUFBQSxVQUMzQyxTQUFTLEtBQUs7QUFDWixvQkFBUSxNQUFNLHFCQUFxQixLQUFLLFdBQVcsR0FBRztBQUFBLFVBQ3hEO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjs7O0FDdkdPLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sdUJBQXVCO0FBQzdCLE1BQU0sdUJBQXVCO0FBQzdCLE1BQU0saUNBQWlDO0FBQ3ZDLE1BQU0sZ0NBQWdDO0FBQ3RDLE1BQU0sNEJBQTRCO0FBZ0hsQyxNQUFNLGtCQUFtQztBQUFBLElBQzlDO0FBQUEsTUFDRSxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixPQUFPO0FBQUEsTUFDUCxZQUFZO0FBQUEsTUFDWixZQUFZO0FBQUEsUUFDVixLQUFLO0FBQUEsUUFDTCxRQUFRO0FBQUEsUUFDUixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixLQUFLO0FBQUEsUUFDTCxPQUFPO0FBQUEsUUFDUCxLQUFLO0FBQUEsTUFDUDtBQUFBLElBQ0Y7QUFBQSxJQUNBO0FBQUEsTUFDRSxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixPQUFPO0FBQUEsTUFDUCxZQUFZO0FBQUEsTUFDWixZQUFZO0FBQUEsUUFDVixLQUFLO0FBQUEsUUFDTCxRQUFRO0FBQUEsUUFDUixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixLQUFLO0FBQUEsUUFDTCxPQUFPO0FBQUEsUUFDUCxLQUFLO0FBQUEsTUFDUDtBQUFBLElBQ0Y7QUFBQSxJQUNBO0FBQUEsTUFDRSxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixPQUFPO0FBQUEsTUFDUCxZQUFZO0FBQUEsTUFDWixZQUFZO0FBQUEsUUFDVixLQUFLO0FBQUEsUUFDTCxRQUFRO0FBQUEsUUFDUixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixLQUFLO0FBQUEsUUFDTCxPQUFPO0FBQUEsUUFDUCxLQUFLO0FBQUEsTUFDUDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBc0RPLFdBQVMsdUJBQWdDO0FBQzlDLFdBQU87QUFBQSxNQUNMLGNBQWM7QUFBQSxNQUNkLFVBQVU7QUFBQSxNQUNWLGFBQWE7QUFBQSxNQUNiLFlBQVk7QUFBQSxNQUNaLGVBQWU7QUFBQSxNQUNmLGFBQWE7QUFBQSxNQUNiLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxJQUNSO0FBQUEsRUFDRjtBQUVPLFdBQVMsbUJBQW1CLFNBQXdCO0FBQUEsSUFDekQsVUFBVTtBQUFBLElBQ1YsVUFBVTtBQUFBLElBQ1YsU0FBUztBQUFBLEVBQ1gsR0FBYTtBQUNYLFdBQU87QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLGFBQWEsT0FBTyxnQkFBZ0IsZUFBZSxPQUFPLFlBQVksUUFBUSxhQUMxRSxZQUFZLElBQUksSUFDaEIsS0FBSyxJQUFJO0FBQUEsTUFDYixJQUFJO0FBQUEsTUFDSixRQUFRLENBQUM7QUFBQSxNQUNULFVBQVUsQ0FBQztBQUFBLE1BQ1gsZUFBZSxDQUFDO0FBQUEsTUFDaEIsc0JBQXNCO0FBQUEsTUFDdEIsb0JBQW9CO0FBQUEsTUFDcEIsZUFBZTtBQUFBLFFBQ2IsT0FBTztBQUFBLFFBQ1AsWUFBWTtBQUFBLFFBQ1osVUFBVSxtQkFBbUIsS0FBSyxLQUFLLE1BQU07QUFBQSxRQUM3QyxZQUFZLGdCQUFnQixDQUFDLEVBQUU7QUFBQTtBQUFBLE1BQ2pDO0FBQUEsTUFDQSxlQUFlO0FBQUEsTUFDZixXQUFXLENBQUM7QUFBQSxNQUNaLFdBQVc7QUFBQSxNQUNYLEtBQUs7QUFBQSxNQUNMLG1CQUFtQjtBQUFBO0FBQUEsSUFDckI7QUFBQSxFQUNGO0FBRU8sV0FBUyxNQUFNLE9BQWUsS0FBYSxLQUFxQjtBQUNyRSxXQUFPLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUssQ0FBQztBQUFBLEVBQzNDO0FBRU8sV0FBUyxtQkFBbUIsT0FBZSxZQUFvQixTQUF3QjtBQUFBLElBQzVGLFVBQVU7QUFBQSxJQUNWLFVBQVU7QUFBQSxJQUNWLFNBQVM7QUFBQSxFQUNYLEdBQVc7QUFDVCxVQUFNLFdBQVcsT0FBTyxTQUFTLE9BQU8sUUFBUSxJQUFJLE9BQU8sV0FBVztBQUN0RSxVQUFNLFdBQVcsT0FBTyxTQUFTLE9BQU8sUUFBUSxJQUFJLE9BQU8sV0FBVztBQUN0RSxVQUFNLFVBQVUsT0FBTyxTQUFTLE9BQU8sT0FBTyxJQUFJLE9BQU8sVUFBVTtBQUNuRSxVQUFNLE9BQU8sV0FBVztBQUN4QixVQUFNLFlBQVksT0FBTyxJQUFJLE9BQU8sUUFBUSxZQUFZLE1BQU0sR0FBRyxDQUFDLElBQUk7QUFDdEUsVUFBTSxlQUFlLEtBQUssSUFBSSxHQUFHLGFBQWEsT0FBTztBQUNyRCxVQUFNLFdBQVcsTUFBTSxlQUFlLDJCQUEyQixHQUFHLENBQUM7QUFDckUsVUFBTSxZQUFZLFlBQVksaUNBQWlDLFdBQVc7QUFDMUUsVUFBTSxPQUFPO0FBQ2IsV0FBTyxNQUFNLE9BQU8sV0FBVyxzQkFBc0Isb0JBQW9CO0FBQUEsRUFDM0U7QUFFTyxXQUFTLHNCQUNkLEtBQ0EsVUFDQSxRQUNlO0FBbFNqQjtBQW1TRSxVQUFNLFdBQVcsT0FBTyxTQUFTLE9BQU8sUUFBUSxJQUFJLE9BQU8sV0FBVztBQUN0RSxVQUFNLFdBQVcsT0FBTyxTQUFTLE9BQU8sUUFBUSxJQUFJLE9BQU8sV0FBVztBQUN0RSxVQUFNLFVBQVUsT0FBTyxTQUFTLE9BQU8sT0FBTyxJQUFJLE9BQU8sVUFBVTtBQUNuRSxVQUFNLE9BQU8sOEJBQVk7QUFBQSxNQUN2QixPQUFPO0FBQUEsTUFDUCxZQUFZO0FBQUEsTUFDWixVQUFVLG1CQUFtQixVQUFVLFNBQVMsTUFBTTtBQUFBLElBQ3hEO0FBQ0EsVUFBTSxjQUFjLE9BQU8sVUFBUyxTQUFJLFVBQUosWUFBYSxLQUFLLEtBQUssS0FBSyxTQUFJLFVBQUosWUFBYSxLQUFLLFFBQVMsS0FBSztBQUNoRyxVQUFNLGFBQWEsT0FBTyxVQUFTLFNBQUksZUFBSixZQUFrQixLQUFLLFVBQVUsS0FBSyxTQUFJLGVBQUosWUFBa0IsS0FBSyxhQUFjLEtBQUs7QUFDbkgsVUFBTSxRQUFRLE1BQU0sYUFBYSxVQUFVLFFBQVE7QUFDbkQsVUFBTSxhQUFhLEtBQUssSUFBSSxTQUFTLFVBQVU7QUFDL0MsVUFBTSxhQUFhLElBQUksYUFBYSxFQUFFLEdBQUcsSUFBSSxXQUFXLElBQUksS0FBSyxhQUFhLEVBQUUsR0FBRyxLQUFLLFdBQVcsSUFBSTtBQUN2RyxXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBLFVBQVUsbUJBQW1CLE9BQU8sWUFBWSxNQUFNO0FBQUEsTUFDdEQ7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVPLFdBQVMsZUFBdUI7QUFDckMsUUFBSSxPQUFPLGdCQUFnQixlQUFlLE9BQU8sWUFBWSxRQUFRLFlBQVk7QUFDL0UsYUFBTyxZQUFZLElBQUk7QUFBQSxJQUN6QjtBQUNBLFdBQU8sS0FBSyxJQUFJO0FBQUEsRUFDbEI7QUEwRk8sV0FBUyxvQkFBb0IsT0FBaUIsUUFBc0M7QUFDekYsVUFBTSxnQkFBZ0I7QUFBQSxNQUNwQixVQUFVLE9BQU8sU0FBUyxPQUFPLFFBQVEsSUFBSSxPQUFPLFdBQVksTUFBTSxjQUFjO0FBQUEsTUFDcEYsVUFBVSxPQUFPLFNBQVMsT0FBTyxRQUFRLElBQUksT0FBTyxXQUFZLE1BQU0sY0FBYztBQUFBLE1BQ3BGLFNBQVMsT0FBTyxTQUFTLE9BQU8sT0FBTyxJQUFJLE9BQU8sVUFBVyxNQUFNLGNBQWM7QUFBQSxJQUNuRjtBQUFBLEVBQ0Y7OztBQ3pTQSxNQUFJLEtBQXVCO0FBRXBCLFdBQVMsWUFBWSxTQUF3QjtBQUNsRCxRQUFJLENBQUMsTUFBTSxHQUFHLGVBQWUsVUFBVSxLQUFNO0FBQzdDLFVBQU0sT0FBTyxPQUFPLFlBQVksV0FBVyxVQUFVLEtBQUssVUFBVSxPQUFPO0FBQzNFLE9BQUcsS0FBSyxJQUFJO0FBQUEsRUFDZDtBQUVPLFdBQVMsaUJBQWlCLEVBQUUsTUFBTSxPQUFPLEtBQUssZ0JBQWdCLFFBQVEsTUFBTSxLQUFLLEdBQXlCO0FBQy9HLFVBQU0sV0FBVyxPQUFPLFNBQVMsYUFBYSxXQUFXLFdBQVc7QUFDcEUsUUFBSSxRQUFRLEdBQUcsUUFBUSxHQUFHLE9BQU8sU0FBUyxJQUFJLFlBQVksbUJBQW1CLElBQUksQ0FBQztBQUNsRixRQUFJLFFBQVEsT0FBTyxHQUFHO0FBQ3BCLGVBQVMsU0FBUyxJQUFJO0FBQUEsSUFDeEI7QUFDQSxRQUFJLFFBQVEsT0FBTyxHQUFHO0FBQ3BCLGVBQVMsU0FBUyxJQUFJO0FBQUEsSUFDeEI7QUFDQSxTQUFLLElBQUksVUFBVSxLQUFLO0FBQ3hCLE9BQUcsaUJBQWlCLFFBQVEsTUFBTTtBQUNoQyxjQUFRLElBQUksV0FBVztBQUN2QixZQUFNLFNBQVM7QUFDZixVQUFJLFVBQVUsUUFBUTtBQUNwQixlQUFPLE1BQU07QUFBQSxNQUNmO0FBQUEsSUFDRixDQUFDO0FBQ0QsT0FBRyxpQkFBaUIsU0FBUyxNQUFNLFFBQVEsSUFBSSxZQUFZLENBQUM7QUFFNUQsUUFBSSxhQUFhLG9CQUFJLElBQTBCO0FBQy9DLFFBQUksa0JBQWlDO0FBQ3JDLFFBQUksbUJBQW1CO0FBRXZCLE9BQUcsaUJBQWlCLFdBQVcsQ0FBQyxVQUFVO0FBQ3hDLFlBQU0sT0FBTyxVQUFVLE1BQU0sSUFBSTtBQUNqQyxVQUFJLENBQUMsUUFBUSxLQUFLLFNBQVMsU0FBUztBQUNsQztBQUFBLE1BQ0Y7QUFDQSx5QkFBbUIsT0FBTyxNQUFNLEtBQUssWUFBWSxpQkFBaUIsZ0JBQWdCO0FBQ2xGLG1CQUFhLElBQUksSUFBSSxNQUFNLGNBQWMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLElBQUksV0FBVyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3RGLHdCQUFrQixNQUFNO0FBQ3hCLHlCQUFtQixNQUFNLFNBQVM7QUFDbEMsVUFBSSxLQUFLLGVBQWU7QUFDeEI7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBRUEsV0FBUyxtQkFDUCxPQUNBLEtBQ0EsS0FDQSxZQUNBLGlCQUNBLGtCQUNNO0FBeEtSO0FBeUtFLFVBQU0sTUFBTSxJQUFJO0FBQ2hCLFVBQU0sY0FBYyxhQUFhO0FBQ2pDLFVBQU0scUJBQXFCLE9BQU8sU0FBUyxJQUFJLGtCQUFrQixJQUFJLElBQUkscUJBQXNCO0FBQy9GLFVBQU0sS0FBSyxJQUFJLEtBQUs7QUFBQSxNQUNsQixHQUFHLElBQUksR0FBRztBQUFBLE1BQ1YsR0FBRyxJQUFJLEdBQUc7QUFBQSxNQUNWLElBQUksSUFBSSxHQUFHO0FBQUEsTUFDWCxJQUFJLElBQUksR0FBRztBQUFBLE1BQ1gsSUFBSSxJQUFJLEdBQUc7QUFBQSxNQUNYLFFBQU8sU0FBSSxHQUFHLFVBQVAsWUFBZ0I7QUFBQSxNQUN2QixXQUFXLE1BQU0sUUFBUSxJQUFJLEdBQUcsU0FBUyxJQUNyQyxJQUFJLEdBQUcsVUFBVSxJQUFJLENBQUMsUUFBUSxFQUFFLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLE9BQU8sT0FBTyxTQUFTLEdBQUcsS0FBSyxJQUFJLEdBQUcsUUFBUyxJQUFJLEVBQUUsSUFDdkcsQ0FBQztBQUFBLE1BQ0wsdUJBQXNCLFNBQUksR0FBRywyQkFBUCxZQUFpQztBQUFBLE1BQ3ZELE1BQU0sSUFBSSxHQUFHLE9BQU8sZ0JBQWdCLElBQUksR0FBRyxNQUFNLE1BQU0sYUFBYSxNQUFNLEdBQUcsSUFBSTtBQUFBLElBQ25GLElBQUk7QUFDSixVQUFNLFNBQVMsTUFBTSxRQUFRLElBQUksTUFBTSxJQUFJLElBQUksT0FBTyxNQUFNLElBQUksQ0FBQztBQUNqRSxVQUFNLFdBQVcsTUFBTSxRQUFRLElBQUksUUFBUSxJQUFJLElBQUksU0FBUyxNQUFNLElBQUksQ0FBQztBQUV2RSxVQUFNLG1CQUFtQixNQUFNLFFBQVEsSUFBSSxjQUFjLElBQUksSUFBSSxpQkFBaUIsQ0FBQztBQUNuRixVQUFNLFlBQTRCLGlCQUFpQixJQUFJLENBQUMsV0FBVztBQUFBLE1BQ2pFLElBQUksTUFBTTtBQUFBLE1BQ1YsTUFBTSxNQUFNLFFBQVEsTUFBTSxNQUFNO0FBQUEsTUFDaEMsV0FBVyxNQUFNLFFBQVEsTUFBTSxTQUFTLElBQ3BDLE1BQU0sVUFBVSxJQUFJLENBQUMsUUFBUTtBQUFBLFFBQzNCLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixPQUFPLE9BQU8sU0FBUyxHQUFHLEtBQUssSUFBSSxHQUFHLFFBQVMsTUFBTSxjQUFjO0FBQUEsTUFDckUsRUFBRSxJQUNGLENBQUM7QUFBQSxJQUNQLEVBQUU7QUFFRixlQUFXLFlBQVksV0FBVyxHQUFHO0FBQ3JDLFVBQU0sZ0JBQWdCO0FBRXRCLFVBQU0sYUFBYSxPQUFPLElBQUkseUJBQXlCLFlBQVksSUFBSSxxQkFBcUIsU0FBUyxJQUNqRyxJQUFJLHVCQUNKLFVBQVUsU0FBUyxJQUNqQixVQUFVLENBQUMsRUFBRSxLQUNiO0FBQ04sVUFBTSx1QkFBdUI7QUFDN0IsUUFBSSxlQUFlLGlCQUFpQjtBQUNsQyxVQUFJLEtBQUssOEJBQThCLEVBQUUsU0FBUyxrQ0FBYyxLQUFLLENBQUM7QUFBQSxJQUN4RTtBQUVBLFFBQUksSUFBSSxnQkFBZ0I7QUFDdEIsVUFBSSxPQUFPLFNBQVMsSUFBSSxlQUFlLFNBQVMsS0FBSyxPQUFPLFNBQVMsSUFBSSxlQUFlLFNBQVMsS0FBSyxPQUFPLFNBQVMsSUFBSSxlQUFlLFFBQVEsR0FBRztBQUNsSiw0QkFBb0IsT0FBTztBQUFBLFVBQ3pCLFVBQVUsSUFBSSxlQUFlO0FBQUEsVUFDN0IsVUFBVSxJQUFJLGVBQWU7QUFBQSxVQUM3QixTQUFTLElBQUksZUFBZTtBQUFBLFFBQzlCLENBQUM7QUFBQSxNQUNIO0FBQ0EsWUFBTSxXQUFXLE1BQU0sY0FBYztBQUNyQyxVQUFJO0FBQ0osWUFBTSxhQUFhLElBQUksZUFBZTtBQUN0QyxVQUFJLFlBQVk7QUFDZCxxQkFBYTtBQUFBLFVBQ1gsS0FBSyxPQUFPLFNBQVMsV0FBVyxHQUFHLElBQUksV0FBVyxPQUFPLDBDQUFVLFFBQVYsWUFBaUI7QUFBQSxVQUMxRSxRQUFRLE9BQU8sU0FBUyxXQUFXLE9BQU8sSUFBSSxXQUFXLFdBQVcsMENBQVUsV0FBVixZQUFvQjtBQUFBLFVBQ3hGLFlBQVksT0FBTyxTQUFTLFdBQVcsV0FBVyxJQUFJLFdBQVcsZUFBZSwwQ0FBVSxlQUFWLFlBQXdCO0FBQUEsVUFDeEcsYUFBYSxPQUFPLFNBQVMsV0FBVyxZQUFZLElBQUksV0FBVyxnQkFBZ0IsMENBQVUsZ0JBQVYsWUFBeUI7QUFBQSxVQUM1RyxLQUFLLE9BQU8sU0FBUyxXQUFXLElBQUksSUFBSSxXQUFXLFFBQVEsMENBQVUsUUFBVixZQUFpQjtBQUFBLFVBQzVFLE9BQU8sT0FBTyxTQUFTLFdBQVcsTUFBTSxJQUFJLFdBQVcsVUFBVSwwQ0FBVSxVQUFWLFlBQW1CO0FBQUEsVUFDcEYsS0FBSyxPQUFPLFNBQVMsV0FBVyxHQUFHLElBQUksV0FBVyxPQUFPLDBDQUFVLFFBQVYsWUFBaUI7QUFBQSxRQUM1RTtBQUFBLE1BQ0Y7QUFDQSxZQUFNLFlBQVksc0JBQXNCO0FBQUEsUUFDdEMsT0FBTyxJQUFJLGVBQWU7QUFBQSxRQUMxQixZQUFZLElBQUksZUFBZTtBQUFBLFFBQy9CO0FBQUEsTUFDRixHQUFHLE1BQU0sZUFBZSxNQUFNLGFBQWE7QUFDM0MsVUFBSSxPQUFPLFNBQVMsSUFBSSxlQUFlLFFBQVEsR0FBRztBQUNoRCxrQkFBVSxXQUFXLElBQUksZUFBZTtBQUFBLE1BQzFDO0FBQ0EsWUFBTSxnQkFBZ0I7QUFBQSxJQUN4QjtBQUVBLFVBQU0sUUFBTyxTQUFJLFNBQUosWUFBWSxDQUFDO0FBQzFCLFVBQU0sT0FBTyxPQUFPLEtBQUssTUFBTSxZQUFZLE9BQU8sU0FBUyxLQUFLLENBQUM7QUFDakUsVUFBTSxPQUFPLE9BQU8sS0FBSyxNQUFNLFlBQVksT0FBTyxTQUFTLEtBQUssQ0FBQztBQUNqRSxVQUFNLE9BQU8sT0FBTyxLQUFLLE1BQU0sWUFBWSxPQUFPLFNBQVMsS0FBSyxDQUFDO0FBQ2pFLFVBQU0sWUFBWTtBQUFBLE1BQ2hCLEdBQUcsT0FBTyxLQUFLLElBQUssTUFBTSxVQUFVO0FBQUEsTUFDcEMsR0FBRyxPQUFPLEtBQUssSUFBSyxNQUFNLFVBQVU7QUFBQSxNQUNwQyxHQUFHLE9BQU8sS0FBSyxJQUFLLE1BQU0sVUFBVTtBQUFBLElBQ3RDO0FBRUEsUUFBSSxJQUFJLGFBQWEsTUFBTSxRQUFRLElBQUksVUFBVSxLQUFLLEdBQUc7QUFDdkQsWUFBTSxZQUFZO0FBQUEsUUFDaEIsT0FBTyxJQUFJLFVBQVUsTUFBTSxJQUFJLENBQUMsVUFBVTtBQUFBLFVBQ3hDLE1BQU0sS0FBSztBQUFBLFVBQ1gsWUFBWSxLQUFLO0FBQUEsVUFDakIsZUFBZSxLQUFLO0FBQUEsVUFDcEIsVUFBVSxLQUFLO0FBQUEsUUFDakIsRUFBRTtBQUFBLE1BQ0o7QUFBQSxJQUNGO0FBRUEsUUFBSSxJQUFJLE9BQU8sTUFBTSxRQUFRLElBQUksSUFBSSxLQUFLLEdBQUc7QUFDM0MsWUFBTSxNQUFNO0FBQUEsUUFDVixPQUFPLElBQUksSUFBSSxNQUFNLElBQUksQ0FBQyxVQUFVO0FBQUEsVUFDbEMsSUFBSSxLQUFLO0FBQUEsVUFDVCxNQUFNLEtBQUs7QUFBQSxVQUNYLE9BQU8sS0FBSztBQUFBLFVBQ1osUUFBUSxLQUFLO0FBQUEsVUFDYixhQUFhLEtBQUs7QUFBQSxVQUNsQixZQUFZLEtBQUs7QUFBQSxVQUNqQixZQUFZLEtBQUs7QUFBQSxRQUNuQixFQUFFO0FBQUEsTUFDSjtBQUFBLElBQ0Y7QUFFQSxRQUFJLE1BQU0sU0FBUyxTQUFTLGtCQUFrQjtBQUM1QyxZQUFNLGdCQUFnQixNQUFNO0FBQzVCLFVBQUksZUFBZTtBQUNqQixZQUFJLEtBQUssb0JBQW9CLEVBQUUsU0FBUyxjQUFjLENBQUM7QUFBQSxNQUN6RCxPQUFPO0FBQ0wsWUFBSSxLQUFLLG9CQUFvQixFQUFFLFNBQVMsR0FBRyxDQUFDO0FBQUEsTUFDOUM7QUFBQSxJQUNGO0FBRUEsVUFBTSxvQkFBb0IsS0FBSyxJQUFJLEdBQUcsTUFBTSxxQkFBcUIsbUJBQW1CLEtBQUssQ0FBQztBQUMxRixRQUFJLEtBQUssMkJBQTJCLEVBQUUsa0JBQWtCLGtCQUFrQixDQUFDO0FBQUEsRUFDN0U7QUFFQSxXQUFTLFdBQVcsWUFBdUMsWUFBNEIsS0FBcUI7QUFDMUcsVUFBTSxPQUFPLG9CQUFJLElBQVk7QUFDN0IsZUFBVyxTQUFTLFlBQVk7QUFDOUIsV0FBSyxJQUFJLE1BQU0sRUFBRTtBQUNqQixZQUFNLE9BQU8sV0FBVyxJQUFJLE1BQU0sRUFBRTtBQUNwQyxVQUFJLENBQUMsTUFBTTtBQUNULFlBQUksS0FBSyxzQkFBc0IsRUFBRSxTQUFTLE1BQU0sR0FBRyxDQUFDO0FBQ3BEO0FBQUEsTUFDRjtBQUNBLFVBQUksTUFBTSxTQUFTLEtBQUssTUFBTTtBQUM1QixZQUFJLEtBQUssd0JBQXdCLEVBQUUsU0FBUyxNQUFNLElBQUksTUFBTSxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzFFO0FBQ0EsVUFBSSxNQUFNLFVBQVUsU0FBUyxLQUFLLFVBQVUsUUFBUTtBQUNsRCxZQUFJLEtBQUsseUJBQXlCLEVBQUUsU0FBUyxNQUFNLElBQUksT0FBTyxNQUFNLFVBQVUsU0FBUyxFQUFFLENBQUM7QUFBQSxNQUM1RixXQUFXLE1BQU0sVUFBVSxTQUFTLEtBQUssVUFBVSxRQUFRO0FBQ3pELFlBQUksS0FBSywyQkFBMkIsRUFBRSxTQUFTLE1BQU0sSUFBSSxPQUFPLEtBQUssVUFBVSxTQUFTLEVBQUUsQ0FBQztBQUFBLE1BQzdGO0FBQ0EsVUFBSSxLQUFLLFVBQVUsU0FBUyxLQUFLLE1BQU0sVUFBVSxXQUFXLEdBQUc7QUFDN0QsWUFBSSxLQUFLLDRCQUE0QixFQUFFLFNBQVMsTUFBTSxHQUFHLENBQUM7QUFBQSxNQUM1RDtBQUFBLElBQ0Y7QUFDQSxlQUFXLENBQUMsT0FBTyxLQUFLLFlBQVk7QUFDbEMsVUFBSSxDQUFDLEtBQUssSUFBSSxPQUFPLEdBQUc7QUFDdEIsWUFBSSxLQUFLLHdCQUF3QixFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQzlDO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFFQSxXQUFTLFdBQVcsT0FBbUM7QUFDckQsV0FBTztBQUFBLE1BQ0wsSUFBSSxNQUFNO0FBQUEsTUFDVixNQUFNLE1BQU07QUFBQSxNQUNaLFdBQVcsTUFBTSxVQUFVLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxHQUFHLEVBQUU7QUFBQSxJQUNwRDtBQUFBLEVBQ0Y7QUFFQSxXQUFTLFVBQVUsT0FBMkM7QUFDNUQsUUFBSSxPQUFPLFVBQVUsU0FBVSxRQUFPO0FBQ3RDLFFBQUk7QUFDRixhQUFPLEtBQUssTUFBTSxLQUFLO0FBQUEsSUFDekIsU0FBUyxLQUFLO0FBQ1osY0FBUSxLQUFLLGdDQUFnQyxHQUFHO0FBQ2hELGFBQU87QUFBQSxJQUNUO0FBQUEsRUFDRjtBQUVPLFdBQVMsbUJBQW1CLE9BQXlCO0FBQzFELFFBQUksQ0FBQyxPQUFPLFNBQVMsTUFBTSxHQUFHLEdBQUc7QUFDL0IsYUFBTztBQUFBLElBQ1Q7QUFDQSxVQUFNLFdBQVcsT0FBTyxTQUFTLE1BQU0sV0FBVyxJQUFJLE1BQU0sY0FBYztBQUMxRSxRQUFJLENBQUMsVUFBVTtBQUNiLGFBQU8sTUFBTTtBQUFBLElBQ2Y7QUFDQSxVQUFNLFlBQVksYUFBYSxJQUFJO0FBQ25DLFFBQUksQ0FBQyxPQUFPLFNBQVMsU0FBUyxLQUFLLFlBQVksR0FBRztBQUNoRCxhQUFPLE1BQU07QUFBQSxJQUNmO0FBQ0EsV0FBTyxNQUFNLE1BQU0sWUFBWTtBQUFBLEVBQ2pDO0FBRUEsV0FBUyxnQkFBZ0IsWUFBNEIsZUFBdUIsY0FBa0Q7QUFHNUgsVUFBTSxzQkFBc0IsV0FBVztBQUN2QyxVQUFNLG1CQUFtQixzQkFBc0I7QUFDL0MsVUFBTSxlQUFlLGdCQUFpQixtQkFBbUI7QUFFekQsVUFBTSxXQUFXO0FBQUEsTUFDZixPQUFPLFdBQVc7QUFBQSxNQUNsQixLQUFLLFdBQVc7QUFBQSxNQUNoQixRQUFRLFdBQVc7QUFBQSxNQUNuQixZQUFZLFdBQVc7QUFBQSxNQUN2QixhQUFhLFdBQVc7QUFBQSxNQUN4QjtBQUFBLE1BQ0EsS0FBSyxXQUFXO0FBQUEsTUFDaEIsT0FBTyxXQUFXO0FBQUEsTUFDbEIsS0FBSyxXQUFXO0FBQUEsSUFDbEI7QUFDQSxXQUFPO0FBQUEsRUFDVDs7O0FDdlhPLE1BQU0sV0FBVztBQUNqQixNQUFNLFdBQVc7QUFFakIsTUFBTSxZQUFZO0FBQUEsSUFDdkI7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRixFQUFFLEtBQUssSUFBSTs7O0FDWkosV0FBUyxhQUFhLEVBQUUsUUFBUSxPQUFPLFFBQVEsR0FBK0I7QUFDbkYsVUFBTSxRQUFtQixFQUFFLEdBQUcsS0FBTSxHQUFHLEtBQUs7QUFFNUMsYUFBUyxnQkFBMEM7QUFDakQsYUFBTywwQkFBVTtBQUFBLElBQ25CO0FBRUEsYUFBUyxRQUFRLFNBQWlCLFNBQWtCLFNBQXdCO0FBSTFFLGNBQVEsT0FBTyxNQUFNLFNBQVMsVUFBVSxRQUFRO0FBQUEsSUFDbEQ7QUFFQSxhQUFTLG9CQUE4QztBQUNyRCxZQUFNLEtBQUssY0FBYztBQUN6QixVQUFJLENBQUMsR0FBSSxRQUFPLEVBQUUsR0FBRyxNQUFNLElBQUksR0FBRyxHQUFHLE1BQU0sSUFBSSxFQUFFO0FBRWpELFlBQU0sT0FBTyxRQUFRO0FBRXJCLFVBQUksVUFBVSxNQUFNLEtBQUssTUFBTSxHQUFHLElBQUksTUFBTSxJQUFJO0FBQ2hELFVBQUksVUFBVSxNQUFNLEtBQUssTUFBTSxHQUFHLElBQUksTUFBTSxJQUFJO0FBRWhELFlBQU0sU0FBUyxHQUFHLFFBQVEsTUFBTTtBQUNoQyxZQUFNLFNBQVMsR0FBRyxTQUFTLE1BQU07QUFDakMsWUFBTSxRQUFRLEtBQUssSUFBSSxRQUFRLE1BQU0sSUFBSTtBQUV6QyxZQUFNLGdCQUFnQixHQUFHLFFBQVE7QUFDakMsWUFBTSxpQkFBaUIsR0FBRyxTQUFTO0FBRW5DLFlBQU0sYUFBYSxnQkFBZ0I7QUFDbkMsWUFBTSxhQUFhLE1BQU0sSUFBSSxnQkFBZ0I7QUFDN0MsWUFBTSxhQUFhLGlCQUFpQjtBQUNwQyxZQUFNLGFBQWEsTUFBTSxJQUFJLGlCQUFpQjtBQUU5QyxVQUFJLGdCQUFnQixNQUFNLEdBQUc7QUFDM0Isa0JBQVUsTUFBTSxTQUFTLFlBQVksVUFBVTtBQUFBLE1BQ2pELE9BQU87QUFDTCxrQkFBVSxNQUFNLElBQUk7QUFBQSxNQUN0QjtBQUVBLFVBQUksaUJBQWlCLE1BQU0sR0FBRztBQUM1QixrQkFBVSxNQUFNLFNBQVMsWUFBWSxVQUFVO0FBQUEsTUFDakQsT0FBTztBQUNMLGtCQUFVLE1BQU0sSUFBSTtBQUFBLE1BQ3RCO0FBRUEsYUFBTyxFQUFFLEdBQUcsU0FBUyxHQUFHLFFBQVE7QUFBQSxJQUNsQztBQUVBLGFBQVMsY0FBYyxHQUF1RDtBQUM1RSxZQUFNLEtBQUssY0FBYztBQUN6QixVQUFJLENBQUMsR0FBSSxRQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsR0FBRyxFQUFFLEVBQUU7QUFFakMsWUFBTSxPQUFPLFFBQVE7QUFDckIsWUFBTSxTQUFTLGtCQUFrQjtBQUVqQyxZQUFNLFNBQVMsRUFBRSxJQUFJLE9BQU87QUFDNUIsWUFBTSxTQUFTLEVBQUUsSUFBSSxPQUFPO0FBRTVCLFlBQU0sU0FBUyxHQUFHLFFBQVEsTUFBTTtBQUNoQyxZQUFNLFNBQVMsR0FBRyxTQUFTLE1BQU07QUFDakMsWUFBTSxRQUFRLEtBQUssSUFBSSxRQUFRLE1BQU0sSUFBSTtBQUV6QyxhQUFPO0FBQUEsUUFDTCxHQUFHLFNBQVMsUUFBUSxHQUFHLFFBQVE7QUFBQSxRQUMvQixHQUFHLFNBQVMsUUFBUSxHQUFHLFNBQVM7QUFBQSxNQUNsQztBQUFBLElBQ0Y7QUFFQSxhQUFTLGNBQWMsR0FBdUQ7QUFDNUUsWUFBTSxLQUFLLGNBQWM7QUFDekIsVUFBSSxDQUFDLEdBQUksUUFBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLEdBQUcsRUFBRSxFQUFFO0FBRWpDLFlBQU0sT0FBTyxRQUFRO0FBQ3JCLFlBQU0sU0FBUyxrQkFBa0I7QUFFakMsWUFBTSxVQUFVLEVBQUUsSUFBSSxHQUFHLFFBQVE7QUFDakMsWUFBTSxVQUFVLEVBQUUsSUFBSSxHQUFHLFNBQVM7QUFFbEMsWUFBTSxTQUFTLEdBQUcsUUFBUSxNQUFNO0FBQ2hDLFlBQU0sU0FBUyxHQUFHLFNBQVMsTUFBTTtBQUNqQyxZQUFNLFFBQVEsS0FBSyxJQUFJLFFBQVEsTUFBTSxJQUFJO0FBRXpDLGFBQU87QUFBQSxRQUNMLEdBQUcsVUFBVSxRQUFRLE9BQU87QUFBQSxRQUM1QixHQUFHLFVBQVUsUUFBUSxPQUFPO0FBQUEsTUFDOUI7QUFBQSxJQUNGO0FBRUEsYUFBUyxvQkFBb0IsTUFBNEM7QUFDdkUsVUFBSSxDQUFDLEtBQU07QUFDWCxVQUFJLE9BQU8sS0FBSyxNQUFNLFlBQVksT0FBTyxTQUFTLEtBQUssQ0FBQyxHQUFHO0FBQ3pELGNBQU0sSUFBSSxLQUFLO0FBQUEsTUFDakI7QUFDQSxVQUFJLE9BQU8sS0FBSyxNQUFNLFlBQVksT0FBTyxTQUFTLEtBQUssQ0FBQyxHQUFHO0FBQ3pELGNBQU0sSUFBSSxLQUFLO0FBQUEsTUFDakI7QUFBQSxJQUNGO0FBRUEsYUFBUyxlQUEwQjtBQUNqQyxhQUFPLEVBQUUsR0FBRyxNQUFNO0FBQUEsSUFDcEI7QUFFQSxXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7OztBQ25ITyxXQUFTLFlBQVk7QUFBQSxJQUMxQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsYUFBQUE7QUFBQSxFQUNGLEdBQXVDO0FBQ3JDLFFBQUksb0JBQW1DO0FBQ3ZDLFFBQUksc0JBQTREO0FBQ2hFLFFBQUksYUFBYTtBQUVqQixhQUFTLHNCQUFzQixPQUFtQztBQUNoRSxZQUFNLE9BQU8sT0FBTyxzQkFBc0I7QUFDMUMsWUFBTSxTQUFTLEtBQUssVUFBVSxJQUFJLE9BQU8sUUFBUSxLQUFLLFFBQVE7QUFDOUQsWUFBTSxTQUFTLEtBQUssV0FBVyxJQUFJLE9BQU8sU0FBUyxLQUFLLFNBQVM7QUFDakUsYUFBTztBQUFBLFFBQ0wsSUFBSSxNQUFNLFVBQVUsS0FBSyxRQUFRO0FBQUEsUUFDakMsSUFBSSxNQUFNLFVBQVUsS0FBSyxPQUFPO0FBQUEsTUFDbEM7QUFBQSxJQUNGO0FBRUEsYUFBUyx1QkFBdUIsYUFBMkIsWUFBZ0M7QUFDekYsWUFBTSxVQUFVLFFBQVEsaUJBQWlCLFlBQVksWUFBWTtBQUNqRSxVQUFJLFlBQVksV0FBVztBQUN6QixjQUFNLHFCQUFxQixhQUFhLFVBQVU7QUFDbEQsV0FBRywyQkFBMkI7QUFBQSxNQUNoQyxPQUFPO0FBQ0wsY0FBTSxrQkFBa0IsYUFBYSxVQUFVO0FBQy9DLFdBQUcscUJBQXFCO0FBQUEsTUFDMUI7QUFBQSxJQUNGO0FBRUEsYUFBUyxvQkFBb0IsT0FBMkI7QUF4RDFEO0FBeURJLFlBQU0sY0FBYyxzQkFBc0IsS0FBSztBQUMvQyxZQUFNLGFBQWEsT0FBTyxjQUFjLFdBQVc7QUFDbkQsWUFBTSxVQUFVLFFBQVEsaUJBQWlCLFlBQVksWUFBWTtBQUVqRSxVQUFJLFlBQVksVUFBVSxRQUFRLGFBQWEsY0FBWSxXQUFNLE9BQU4sbUJBQVUsWUFBVztBQUM5RSxjQUFNLFVBQVUsTUFBTSx1QkFBdUIsV0FBVztBQUN4RCxZQUFJLFlBQVksTUFBTTtBQUNwQixnQkFBTSxjQUFjLFNBQVMsV0FBVztBQUN4QyxpQkFBTyxrQkFBa0IsTUFBTSxTQUFTO0FBQ3hDLGdCQUFNLGVBQWU7QUFDckI7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUVBLFVBQUksWUFBWSxhQUFhLFFBQVEsZ0JBQWdCLFVBQVU7QUFDN0QsY0FBTSxNQUFNLE1BQU0scUJBQXFCLFdBQVc7QUFDbEQsWUFBSSxLQUFLO0FBQ1AsYUFBRyxnQkFBZ0IsU0FBUztBQUM1QixnQkFBTSxvQkFBb0IsSUFBSSxXQUFXLElBQUksTUFBTSxFQUFFO0FBQ3JELGFBQUcsMkJBQTJCO0FBQzlCLGNBQUksSUFBSSxVQUFVLFNBQVMsWUFBWTtBQUNyQyxrQkFBTSxpQkFBaUIsSUFBSSxVQUFVLE9BQU8sV0FBVztBQUN2RCxtQkFBTyxrQkFBa0IsTUFBTSxTQUFTO0FBQUEsVUFDMUM7QUFDQSxnQkFBTSxlQUFlO0FBQ3JCO0FBQUEsUUFDRjtBQUNBLGNBQU0sb0JBQW9CLElBQUk7QUFDOUIsV0FBRywyQkFBMkI7QUFBQSxNQUNoQztBQUVBLFVBQUksTUFBTSxnQkFBZ0IsU0FBUztBQUNqQyxZQUFJLHdCQUF3QixNQUFNO0FBQ2hDLHVCQUFhLG1CQUFtQjtBQUFBLFFBQ2xDO0FBQ0EsOEJBQXNCLFdBQVcsTUFBTTtBQUNyQyxjQUFJLFdBQVk7QUFDaEIsaUNBQXVCLGFBQWEsVUFBVTtBQUM5QyxnQ0FBc0I7QUFBQSxRQUN4QixHQUFHLEdBQUc7QUFBQSxNQUNSLE9BQU87QUFDTCwrQkFBdUIsYUFBYSxVQUFVO0FBQUEsTUFDaEQ7QUFFQSxZQUFNLGVBQWU7QUFBQSxJQUN2QjtBQUVBLGFBQVMsb0JBQW9CLE9BQTJCO0FBQ3RELFlBQU0sZUFBZSxNQUFNLG1CQUFtQixNQUFNO0FBQ3BELFlBQU0sa0JBQWtCLE1BQU0sMEJBQTBCLE1BQU07QUFDOUQsVUFBSSxDQUFDLGdCQUFnQixDQUFDLGdCQUFpQjtBQUV2QyxZQUFNLGNBQWMsc0JBQXNCLEtBQUs7QUFDL0MsWUFBTSxhQUFhLE9BQU8sY0FBYyxXQUFXO0FBRW5ELFVBQUksY0FBYztBQUNoQixjQUFNLGVBQWUsVUFBVTtBQUMvQixjQUFNLGVBQWU7QUFDckI7QUFBQSxNQUNGO0FBRUEsVUFBSSxpQkFBaUI7QUFDbkIsY0FBTSxrQkFBa0IsVUFBVTtBQUNsQyxXQUFHLDJCQUEyQjtBQUM5QixjQUFNLGVBQWU7QUFBQSxNQUN2QjtBQUFBLElBQ0Y7QUFFQSxhQUFTLGtCQUFrQixPQUEyQjtBQUNwRCxZQUFNLFFBQVE7QUFDZCxVQUFJLE9BQU8sa0JBQWtCLE1BQU0sU0FBUyxHQUFHO0FBQzdDLGVBQU8sc0JBQXNCLE1BQU0sU0FBUztBQUFBLE1BQzlDO0FBQ0EsNEJBQXNCO0FBQUEsSUFDeEI7QUFFQSxhQUFTLGNBQWMsT0FBeUI7QUFDOUMsWUFBTSxlQUFlO0FBQ3JCLFlBQU0sT0FBTyxPQUFPLHNCQUFzQjtBQUMxQyxZQUFNLFVBQVUsTUFBTSxVQUFVLEtBQUs7QUFDckMsWUFBTSxVQUFVLE1BQU0sVUFBVSxLQUFLO0FBQ3JDLFlBQU0sU0FBUyxLQUFLLFVBQVUsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRO0FBQzlELFlBQU0sU0FBUyxLQUFLLFdBQVcsSUFBSSxPQUFPLFNBQVMsS0FBSyxTQUFTO0FBQ2pFLFlBQU0sZ0JBQWdCLFVBQVU7QUFDaEMsWUFBTSxnQkFBZ0IsVUFBVTtBQUNoQyxZQUFNLFFBQVEsTUFBTTtBQUNwQixZQUFNLGFBQWEsUUFBUSxJQUFJLE1BQU07QUFDckMsWUFBTSxVQUFVLFFBQVEsT0FBTztBQUMvQixhQUFPLFFBQVEsU0FBUyxlQUFlLGFBQWE7QUFBQSxJQUN0RDtBQUVBLGFBQVMsaUJBQWlCLFNBQW1DO0FBQzNELFVBQUksUUFBUSxTQUFTLEVBQUcsUUFBTztBQUMvQixZQUFNLEtBQUssUUFBUSxDQUFDLEVBQUUsVUFBVSxRQUFRLENBQUMsRUFBRTtBQUMzQyxZQUFNLEtBQUssUUFBUSxDQUFDLEVBQUUsVUFBVSxRQUFRLENBQUMsRUFBRTtBQUMzQyxhQUFPLEtBQUssTUFBTSxJQUFJLEVBQUU7QUFBQSxJQUMxQjtBQUVBLGFBQVMsZUFBZSxTQUFxRDtBQUMzRSxVQUFJLFFBQVEsU0FBUyxFQUFHLFFBQU87QUFDL0IsYUFBTztBQUFBLFFBQ0wsSUFBSSxRQUFRLENBQUMsRUFBRSxVQUFVLFFBQVEsQ0FBQyxFQUFFLFdBQVc7QUFBQSxRQUMvQyxJQUFJLFFBQVEsQ0FBQyxFQUFFLFVBQVUsUUFBUSxDQUFDLEVBQUUsV0FBVztBQUFBLE1BQ2pEO0FBQUEsSUFDRjtBQUVBLGFBQVMsbUJBQW1CLE9BQXlCO0FBQ25ELFVBQUksTUFBTSxRQUFRLFdBQVcsR0FBRztBQUM5QixjQUFNLGVBQWU7QUFDckIscUJBQWE7QUFDYiw0QkFBb0IsaUJBQWlCLE1BQU0sT0FBTztBQUNsRCxZQUFJLHdCQUF3QixNQUFNO0FBQ2hDLHVCQUFhLG1CQUFtQjtBQUNoQyxnQ0FBc0I7QUFBQSxRQUN4QjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBRUEsYUFBUyxrQkFBa0IsT0FBeUI7QUFDbEQsVUFBSSxNQUFNLFFBQVEsV0FBVyxHQUFHO0FBQzlCLDRCQUFvQjtBQUNwQjtBQUFBLE1BQ0Y7QUFDQSxZQUFNLGVBQWU7QUFDckIsWUFBTSxrQkFBa0IsaUJBQWlCLE1BQU0sT0FBTztBQUN0RCxVQUFJLG9CQUFvQixRQUFRLHNCQUFzQixLQUFNO0FBQzVELFlBQU0sT0FBTyxPQUFPLHNCQUFzQjtBQUMxQyxZQUFNLFNBQVMsZUFBZSxNQUFNLE9BQU87QUFDM0MsVUFBSSxDQUFDLE9BQVE7QUFDYixZQUFNLFNBQVMsS0FBSyxVQUFVLElBQUksT0FBTyxRQUFRLEtBQUssUUFBUTtBQUM5RCxZQUFNLFNBQVMsS0FBSyxXQUFXLElBQUksT0FBTyxTQUFTLEtBQUssU0FBUztBQUNqRSxZQUFNLGlCQUFpQixPQUFPLElBQUksS0FBSyxRQUFRO0FBQy9DLFlBQU0saUJBQWlCLE9BQU8sSUFBSSxLQUFLLE9BQU87QUFDOUMsWUFBTSxhQUFhLGtCQUFrQjtBQUNyQyxZQUFNLFVBQVUsUUFBUSxPQUFPO0FBQy9CLGFBQU8sUUFBUSxTQUFTLGVBQWUsYUFBYTtBQUNwRCwwQkFBb0I7QUFBQSxJQUN0QjtBQUVBLGFBQVMsaUJBQWlCLE9BQXlCO0FBQ2pELFVBQUksTUFBTSxRQUFRLFNBQVMsR0FBRztBQUM1Qiw0QkFBb0I7QUFDcEIsbUJBQVcsTUFBTTtBQUNmLHVCQUFhO0FBQUEsUUFDZixHQUFHLEdBQUc7QUFBQSxNQUNSO0FBQUEsSUFDRjtBQUVBLGFBQVMsd0JBQThCO0FBQ3JDLFNBQUcsZ0JBQWdCLFNBQVM7QUFDNUIsTUFBQUEsYUFBWSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFBQSxJQUMzQztBQUVBLGFBQVMsZ0JBQWdCLE9BQTRCO0FBQ25ELFlBQU0sU0FBUyxTQUFTO0FBQ3hCLFlBQU0sYUFDSixDQUFDLENBQUMsV0FDRCxPQUFPLFlBQVksV0FDbEIsT0FBTyxZQUFZLGNBQ25CLE9BQU87QUFFWCxVQUFJLFFBQVEsZUFBZSxNQUFNLFFBQVEsVUFBVTtBQUNqRCxjQUFNLGVBQWU7QUFDckI7QUFBQSxNQUNGO0FBRUEsVUFBSSxZQUFZO0FBQ2QsWUFBSSxNQUFNLFFBQVEsVUFBVTtBQUMxQixpQkFBTyxLQUFLO0FBQ1osZ0JBQU0sZUFBZTtBQUFBLFFBQ3ZCO0FBQ0E7QUFBQSxNQUNGO0FBRUEsY0FBUSxNQUFNLE1BQU07QUFBQSxRQUNsQixLQUFLO0FBQ0gsYUFBRyxnQkFBZ0IsTUFBTTtBQUN6QixnQkFBTSxlQUFlO0FBQ3JCO0FBQUEsUUFDRixLQUFLO0FBQ0gsYUFBRyxnQkFBZ0IsU0FBUztBQUM1QixnQkFBTSxlQUFlO0FBQ3JCO0FBQUEsUUFDRixLQUFLO0FBQ0gsY0FBSSxRQUFRLGVBQWUsWUFBWTtBQUNyQyxlQUFHLGNBQWMsYUFBYTtBQUFBLFVBQ2hDLFdBQVcsUUFBUSxlQUFlLGVBQWU7QUFDL0MsZUFBRyxjQUFjLFVBQVU7QUFBQSxVQUM3QixPQUFPO0FBQ0wsZUFBRyxjQUFjLFVBQVU7QUFBQSxVQUM3QjtBQUNBLGdCQUFNLGVBQWU7QUFDckI7QUFBQSxRQUNGLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFDSCxhQUFHLGdCQUFnQixNQUFNO0FBQ3pCLGdCQUFNLGVBQWU7QUFDckIsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUNILGFBQUcsZ0JBQWdCLE1BQU07QUFDekIsYUFBRyxnQkFBZ0IsSUFBSSxNQUFNLFFBQVE7QUFDckMsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUNILGFBQUcsZ0JBQWdCLE1BQU07QUFDekIsYUFBRyxnQkFBZ0IsR0FBRyxNQUFNLFFBQVE7QUFDcEMsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUNILGFBQUcsZ0JBQWdCLE1BQU07QUFDekIsZ0JBQU0sbUJBQW1CLE1BQU0sV0FBVyxLQUFLLENBQUM7QUFDaEQsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUNILGdDQUFzQjtBQUN0QixnQkFBTSxlQUFlO0FBQ3JCO0FBQUEsUUFDRixLQUFLO0FBQ0gsYUFBRyxnQkFBZ0IsU0FBUztBQUM1QixnQkFBTSx5QkFBeUI7QUFDL0IsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUNILGNBQUksUUFBUSxlQUFlLGVBQWU7QUFDeEMsZUFBRyxjQUFjLGdCQUFnQjtBQUFBLFVBQ25DLFdBQVcsUUFBUSxlQUFlLGtCQUFrQjtBQUNsRCxlQUFHLGNBQWMsYUFBYTtBQUFBLFVBQ2hDLE9BQU87QUFDTCxlQUFHLGNBQWMsYUFBYTtBQUFBLFVBQ2hDO0FBQ0EsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUNILGFBQUcsZ0JBQWdCLFNBQVM7QUFDNUIsYUFBRyxrQkFBa0IsSUFBSSxNQUFNLFFBQVE7QUFDdkMsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUNILGFBQUcsZ0JBQWdCLFNBQVM7QUFDNUIsYUFBRyxrQkFBa0IsR0FBRyxNQUFNLFFBQVE7QUFDdEMsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUNILGFBQUcsZ0JBQWdCLFNBQVM7QUFDNUIsYUFBRyxtQkFBbUIsSUFBSSxNQUFNLFFBQVE7QUFDeEMsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUNILGFBQUcsZ0JBQWdCLFNBQVM7QUFDNUIsYUFBRyxtQkFBbUIsR0FBRyxNQUFNLFFBQVE7QUFDdkMsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0YsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUNILGNBQUksUUFBUSxpQkFBaUIsYUFBYSxNQUFNLG9CQUFvQixHQUFHO0FBQ3JFLGtCQUFNLDhCQUE4QjtBQUFBLFVBQ3RDLFdBQVcsTUFBTSxhQUFhLEdBQUc7QUFDL0Isa0JBQU0sMkJBQTJCO0FBQUEsVUFDbkM7QUFDQSxnQkFBTSxlQUFlO0FBQ3JCO0FBQUEsUUFDRixLQUFLLFVBQVU7QUFDYixjQUFJLFFBQVEsYUFBYTtBQUN2QixlQUFHLGVBQWUsS0FBSztBQUFBLFVBQ3pCLFdBQVcsTUFBTSxvQkFBb0IsR0FBRztBQUN0QyxrQkFBTSxvQkFBb0IsSUFBSTtBQUFBLFVBQ2hDLFdBQVcsTUFBTSxhQUFhLEdBQUc7QUFDL0Isa0JBQU0sYUFBYSxJQUFJO0FBQUEsVUFDekIsV0FBVyxRQUFRLGlCQUFpQixXQUFXO0FBQzdDLGVBQUcsZ0JBQWdCLE1BQU07QUFBQSxVQUMzQjtBQUNBLGdCQUFNLGVBQWU7QUFDckI7QUFBQSxRQUNGO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTCxLQUFLLGFBQWE7QUFDaEIsZ0JBQU0sVUFBVSxPQUFPLFFBQVE7QUFDL0IsZ0JBQU0sVUFBVSxPQUFPLFNBQVM7QUFDaEMsaUJBQU8sUUFBUSxRQUFRLE9BQU8sS0FBSyxTQUFTLE9BQU87QUFDbkQsZ0JBQU0sZUFBZTtBQUNyQjtBQUFBLFFBQ0Y7QUFBQSxRQUNBLEtBQUs7QUFBQSxRQUNMLEtBQUssa0JBQWtCO0FBQ3JCLGdCQUFNLFVBQVUsT0FBTyxRQUFRO0FBQy9CLGdCQUFNLFVBQVUsT0FBTyxTQUFTO0FBQ2hDLGlCQUFPLFFBQVEsUUFBUSxPQUFPLEtBQUssU0FBUyxPQUFPO0FBQ25ELGdCQUFNLGVBQWU7QUFDckI7QUFBQSxRQUNGO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQ0gsY0FBSSxNQUFNLFdBQVcsTUFBTSxTQUFTO0FBQ2xDLG1CQUFPLFFBQVEsQ0FBRztBQUNsQixrQkFBTSxlQUFlO0FBQUEsVUFDdkI7QUFDQTtBQUFBLFFBQ0Y7QUFDRTtBQUFBLE1BQ0o7QUFFQSxVQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ3JCLFdBQUcsZUFBZSxDQUFDLFFBQVEsV0FBVztBQUN0QyxjQUFNLGVBQWU7QUFBQSxNQUN2QjtBQUFBLElBQ0Y7QUFFQSxhQUFTLFlBQWtCO0FBQ3pCLGFBQU8saUJBQWlCLGVBQWUsbUJBQW1CO0FBQzFELGFBQU8saUJBQWlCLGVBQWUsbUJBQW1CO0FBQzFELGFBQU8saUJBQWlCLGFBQWEsaUJBQWlCO0FBQ3RELGFBQU8saUJBQWlCLGlCQUFpQixpQkFBaUI7QUFDMUQsYUFBTyxpQkFBaUIsU0FBUyxlQUFlLEVBQUUsU0FBUyxNQUFNLENBQUM7QUFDbEUsYUFBTyxpQkFBaUIsY0FBYyxvQkFBb0IsRUFBRSxTQUFTLE1BQU0sQ0FBQztBQUM1RSxhQUFPLGlCQUFpQixhQUFhLG1CQUFtQixFQUFFLFNBQVMsTUFBTSxDQUFDO0FBQzFFLGFBQU8saUJBQWlCLFlBQVksa0JBQWtCLEVBQUUsU0FBUyxNQUFNLENBQUM7QUFDeEUsYUFBTyxpQkFBaUIsV0FBVyxpQkFBaUIsRUFBRSxTQUFTLE1BQU0sQ0FBQztBQUV0RSxVQUFJLEdBQUcsbUJBQW1CLE1BQU07QUFDOUIsWUFBSSx3QkFBd0IsTUFBTTtBQUNoQyx1QkFBYSxtQkFBbUI7QUFDaEMsZ0NBQXNCO0FBQUEsUUFDeEI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBRUEsV0FBTztBQUFBLE1BQ0w7QUFBQSxJQUNGO0FBQUEsRUFDRjs7O0FDMVdPLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0sbUJBQW1CO0FBVXpCLFdBQVMsaUJBQ2QsT0FDQSxXQUNBLE9BQ0EsUUFDQSxNQUNBLGVBQ2E7QUFDYixVQUFNLGNBQTBDLENBQUMsRUFBRSxHQUFHLE1BQU0sR0FBRyxHQUFHLE1BQU0sRUFBRSxDQUFDO0FBRTNFLGVBQVcsTUFBTSxXQUFXO0FBQzFCLGtCQUFZLEtBQUssRUFBRSxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsSUFDdkM7QUFFQSxVQUFNLGVBQWUsWUFBWSxJQUFJLENBQUMsVUFBVSxjQUFjLEtBQUssQ0FBQztBQUVwRSxXQUFPO0FBQUEsTUFDTCxXQUFXLFVBQVUsTUFBTTtBQUFBLE1BQzNCO0FBQUEsTUFDQTtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBU08sV0FBUyxxQkFDZCxHQUNBLEdBQ0EsR0FDUTtBQUNSLFVBQU0sTUFBTSxFQUFFLElBQUksRUFBRTtBQUNwQixVQUFNLE1BQU0sRUFBRSxJQUFJLEVBQUU7QUFDcEIsVUFBTSxNQUFNLEVBQUUsSUFBSSxFQUFFO0FBQ3BCLFVBQU0sTUFBTSxFQUFFLElBQUksRUFBRTtBQUNwQixVQUFNLFVBQVUsTUFBTSxNQUFNLE1BQU07QUFDbEMsVUFBTSxJQUFJLFlBQVksSUFBSSxJQUFJLE1BQU0sTUFBTSxNQUFNLE1BQU0sS0FBSyxHQUFHLE9BQU8sSUFBSTtBQUN6RSxVQUFNLFFBQVEsRUFBRSxJQUFJLE1BQU07QUFDMUIsVUFBTSxRQUFRLEVBQUUsSUFBSSxNQUFNO0FBQzFCLFVBQU0sS0FBSyxFQUFFLElBQUk7QUFDakIsVUFBTSxLQUFLLEVBQUUsSUFBSTtBQUNqQixXQUFPLEtBQUssTUFBTSxJQUFJLEVBQUU7QUFBQSxFQUMxQjtBQU1PLFdBQVMsb0JBQ2QsYUFDQSxhQUNBLE9BSUksQ0FBQyxHQUMrQztBQWhHdEQ7QUFpR0UsVUFBTSxxQkFBb0IsVUFBSyxzQkFBTCxZQUEwQjtBQUNwRCxVQUFNLGtCQUFpQixVQUFLLG1CQUFMLFlBQXVCO0FBQzlDLFVBQU0sWUFBVyxVQUFLLGFBQUwsWUFBaUI7QUFFbEMsVUFBTSxFQUFFLFdBQVcsYUFBYSxJQUFJO0FBRXBDLFFBQUksVUFBVSxXQUFXLEdBQUc7QUFDMUIsYUFBTztBQUFBLElBQ1Q7QUFJQSxhQUFTLElBQUksR0FBRyxJQUFJLFVBQVUsUUFBUSxLQUFLO0FBQ3pDLFlBQU0sV0FBVyxhQUFhLElBQUksQ0FBQztBQUNuQyxZQUFNLEtBQUssWUFBWSxJQUFJLFNBQVM7QUFDcEMsWUFBTSxLQUFLLFlBQVksSUFBSSxTQUFTO0FBQ3BDLFVBQUksS0FBSyxNQUFNLElBQUksRUFBRSxLQUFLLG1CQUFtQjtBQUMzQyxlQUFPLEVBQUUsTUFBTSxZQUFZLE9BQU8sRUFBRTtBQUFBLE1BQ3RDO0FBQUEsSUFDRjtBQUdBLFFBQUksQ0FBQyxVQUFVO0FBQ2IsZUFBUyxJQUFJLEdBQUcsSUFBSSxVQUFVLFFBQVEsS0FBSztBQUN6QyxjQUFNLE9BQU8scUJBQXFCLGFBQWEsYUFBYSxDQUFDLEdBQUcsYUFBYSxJQUFJLENBQUMsQ0FBQztBQUNuRixZQUFJLFFBQVEsZ0JBQWdCO0FBQzFCLGlCQUFPLEVBQUUsTUFBTSxPQUFPLE9BQU8sRUFBRTtBQUFBLFFBQ2pDO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQVVPLFdBQVMsMEJBQ2QsT0FDQSxXQUNBLGFBQ0EsY0FDQSxlQUNBLFdBQ0EsUUFBUSxJQUNGO0FBbkpSO0FBb0pFLFFBQUksQ0FBQyxPQUFPLFNBQVMsU0FBUyxLQUFLLFlBQVksR0FBRztBQUNoRCxrQkFBWTtBQUFBLElBQ2Q7QUFFQSxhQUFTLElBQUksR0FBRyxJQUFJLFVBQVUsUUFBUSxLQUFLO0FBQ3pDLFlBQU0sS0FBSyxVQUFVLENBQUM7QUFDdEIsWUFBTSxRQUFRLE9BQU8sR0FBRyxVQUFVLFlBQVksR0FBRyxRQUFRLElBQUksR0FBRyxRQUFRO0FBQ3hFLFlBQU0sU0FBUyxZQUFZLENBQUM7QUFDNUIsWUFBTSxTQUFTLFlBQVksSUFBSSxDQUFDO0FBQ2hDLFlBQU0sWUFBWSxLQUFLLE1BQU0sT0FBTyxJQUFJLE9BQU8sR0FBRyxPQUFPLElBQUksT0FBTyxDQUFDO0FBQ3JFLFlBQU0sVUFBVSxhQUFhLENBQUM7QUFDOUIsWUFBTSxVQUFVLGFBQWEsSUFBSSxDQUFDO0FBQ2xDLFlBQU0sYUFBYSxLQUFLLE1BQU0sUUFBUSxJQUFJLFFBQVEsR0FBRyxRQUFRLElBQUksUUFBUSxDQUFDO0FBRTFFLFVBQ0UsQ0FBQyxPQUFPLFNBQVMsS0FBSyxLQUN0QixTQUFTLFFBQ1QsQ0FBQyxPQUFPLFNBQVMsU0FBUyxLQUMxQixhQUFhLFFBQ2IsY0FBYyxNQUNkO0FBQ0EsY0FBTSxJQUFJLEdBQUcsQ0FBQztBQUNkO0FBQUEsTUFDRjtBQUVBLFVBQUksYUFBYSxHQUFHO0FBQ2xCLFlBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxHQUFHO0FBQ2pCLGdCQUFNLElBQUksR0FBRyxDQUFDO0FBQUEsUUFDaEI7QUFDQTtBQUFBLE1BQ0Y7QUFFQSxZQUFNLFFBQVEsYUFBYTtBQUMzQixZQUFNLFlBQVksUUFBUTtBQUMxQixVQUFJLFNBQVEsV0FBTSxJQUFJLENBQUMsTUFBWCxZQUFnQixLQUFLLFlBQVk7QUFDN0MsVUFBSSxDQUFDLE9BQU8sU0FBUyxJQUFJLEdBQUc7QUFDMUIsZUFBTztBQUFBLE1BQ1QsT0FBTztBQUNMLGdCQUFTLE9BQU8sUUFBUyxTQUFTO0FBQUEsTUFDcEM7QUFDQSxZQUFNLElBQUksR0FBRyxJQUFJO0FBQUEsSUFDbkI7QUFFQSxlQUFXLE9BQU8sTUFBTSxLQUFLLE1BQU0sS0FBSyxDQUFDLEdBQUc7QUFDMUMsVUFBSSxPQUFPLFVBQVUsUUFBUTtBQUMzQixjQUFNLE9BQU8sR0FBRztBQUFBLE1BQ2xCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUEwQk8sV0FBUyxpQkFDZCxPQUNBLGFBQ0EsUUFDc0I7QUFsT3hCO0FBbU9FLFVBQU0sU0FBK0I7QUFBQSxNQUNuQyxpQkFBaUIsQ0FBQztBQUFBLE1BQ2xCLGNBQWM7QUFBQSxJQUNoQjtBQUVBLFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDdEIsYUFBTztBQUFBLElBQ1Q7QUFFQSxRQUFJLE9BQU8sTUFBTSxhQUFhLEdBQUcsT0FBTyxHQUFHO0FBQzNDLFFBQUksWUFBWSxFQUFFLEdBQUcsTUFBTSxDQUFDLEVBQUUsR0FBRyxHQUFHLE1BQU0sQ0FBQyxFQUFFLEVBQUU7QUFFL0MsV0FBTyxnQkFBZ0IsS0FBSyxJQUFJO0FBRWhDLGFBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxRQUFRLEtBQUs7QUFDckMsWUFBTSxZQUFZLE1BQU0sQ0FBQztBQUd6QixZQUFNLEtBQUssVUFBVSxJQUFJLFVBQVU7QUFDbkMsWUFBTSxLQUFLLFVBQVUsSUFBSSxVQUFVO0FBQ25DLFlBQU0sV0FBVyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssRUFBRTtBQUU1QyxVQUFJLFdBQVcsTUFBTztBQUNwQixlQUFPLGdCQUFnQixLQUFLLElBQUk7QUFDaEMsb0JBQVksRUFBRSxHQUFHLFVBQVUsR0FBRyxHQUFHLFVBQVUsRUFBRTtBQUM3QztBQUFBLE1BQ0Y7QUFFQSxZQUFNLFlBQVcsZUFBVSxVQUFWLFlBQW1CLE9BQU87QUFDM0MsWUFBTSxlQUFlLEtBQUssSUFBSSxVQUFVLElBQVE7QUFDaEQsWUFBTSxjQUFjLFdBQVc7QUFHL0IsWUFBTSxLQUFLLEtBQUssSUFBSSxPQUFPLGFBQWEsSUFBUTtBQUNoRCxZQUFNLE1BQU0sZUFBZSxPQUFPO0FBQ2xDLFlBQU0sSUFBSSxPQUFPO0FBRWpCLFVBQUk7QUFDSixVQUFJLE9BQU8sR0FBRztBQUVaLGVBQU8sT0FBTyxNQUFNLEtBQUssSUFBSSxNQUFNLElBQUksQ0FBQztBQUFBLE1BQzFDLE9BQU87QUFFTCxlQUFPLENBQUMsT0FBTyxRQUFRLEtBQUssSUFBSSxLQUFLLElBQUksR0FBRyxJQUFJLElBQUksQ0FBQztBQUFBLE1BQ3ZEO0FBR0EsY0FBUSxPQUFPO0FBQ2YsYUFBTyxNQUFNLE1BQU0sR0FBRyxPQUFPLEdBQUc7QUFFaEMsYUFBTyxnQkFBZ0IsS0FBSyxJQUFJO0FBR2hDLFVBQUksQ0FBQyxPQUFPLGdCQUFnQixRQUFRLE9BQU8sWUFBWTtBQUNyRCxlQUFPLGVBQWU7QUFDdEIsZUFBTyxhQUFhO0FBQUEsTUFDdEI7QUFFQSxrQkFBWSxFQUFFLEdBQUcsVUFBVSxHQUFHLEdBQUcsVUFBVSxFQUFFO0FBQUEsSUFDL0M7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQTZCTyxXQUFTLGlCQUNkLFFBQ0EsUUFDQSxHQUMwQjtBQUMxQixXQUFPO0FBQUEsTUFDTCxLQUFLLE1BQU0sT0FBTyxDQUFDLEtBQUssT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQztBQUFBLE1BQ2xELEtBQUssTUFBTSxPQUFPLENBQUMsS0FBSyxPQUFPLENBQUMsSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDO0FBQUEsTUFDbEQsS0FBSyxNQUFNLE9BQU8sQ0FBQyxLQUFLLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUM7QUFBQSxJQUNwRDtBQUFBLEVBQ0Y7QUF3Qk8sTUFBTSxlQUE2QjtBQUFBLElBQ3hDLGFBQWE7QUFBQSxJQUNiLFdBQVc7QUFBQSxJQUNYLGlCQUFpQjtBQUFBLElBQ2pCLGtCQUFrQjtBQUFBLElBQ2xCLGtCQUFrQjtBQUFBLElBQ2xCLGdCQUFnQjtBQUFBLElBQ2hCLGFBQWEsQ0FBQyxLQUFLLEtBQUssR0FBRztBQUFBLElBQzNCLFlBQVksQ0FBQyxLQUFLLElBQUksRUFBRTtBQUFBLEVBQzFCO0FBS08sTUFBTSxrQkFBZ0M7QUFBQSxJQUMzQyxhQUFhO0FBQUEsSUFDYixXQUFXO0FBQUEsSUFDWCxpQkFBaUI7QUFBQSxJQUNqQixrQkFBa0I7QUFBQSxJQUNsQixnQkFBZ0I7QUFBQSxJQUNoQix3QkFBd0I7QUFBQSxJQUN4QixhQUFhLENBQUMsS0FBSyxLQUFLLEdBQUc7QUFBQSxJQUMzQixZQUFZLENBQUMsS0FBSyxJQUFJLEVBQUU7QUFBQSxFQUMxQjtBQTRCTyxXQUFTLGlCQUNkLEtBQ0EsTUFDTTtBQXRaUjtBQXVaRSxVQUFNO0FBQUEsTUFDSjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQ1Y7QUFBQSxNQUNBO0FBQUEsTUFDQSxjQUFjO0FBQUEsTUFDZDtBQUFBLE1BQ0E7QUFBQSxJQUNGLElBQUk7QUFFSixVQUFNLEVBQUUsV0FBVyxhQUFhLElBQUk7QUFFcEMsUUFBSSxVQUFVLFdBQVcsR0FBRztBQUMxQjtBQUFBLElBQ0Y7QUFHQSxRQUFJLGlCQUE4QztBQUNsRCxRQUFJLGNBQWMsZUFBZSxZQUFZLFNBQVMsR0FBRztBQUN2RCxZQUFNLGVBQWdDLFlBQVksSUFBSSxDQUFDLElBQUksTUFBRztBQTdhbEUsWUFBQUMsS0FBQUM7QUE2YXNFO0FBQUEsVUFDaEUsR0FBRyxHQUFHO0FBQUEsVUFDTixHQUFHLEdBQUc7QUFBQSxVQUNOLE9BQU8sTUFBTSxJQUFJLFVBQVlBLE9BQUFELE1BQUEsVUFBVSxJQUFJLENBQUMsTUFBZixnQkFBQUEsSUFBa0IsVUFBbEIsT0FBQUMsTUFBMkI7QUFBQSxRQUMxRDtBQUFBLE9BQUU7QUFDRix1QkFBaUIsaUJBQWlCLGNBQWMsYUFBYSxVQUFVO0FBQUEsSUFDekU7QUFHQSxRQUFJLFVBQVU7QUFDWixVQUFJLGNBQWM7QUFFbEIsZUFBUyxJQUFJLEdBQUcsSUFBSSxVQUFVLFFBQVEsS0FBSztBQUN6QyxjQUFNLGFBQWEsTUFBTTtBQUN6QixjQUFNLGNBQWEsdUNBQVcsVUFBUyxTQUFTLFVBQVUsVUFBVTtBQUdwRSxZQUFJLGNBQWM7QUFDbEIsWUFBSSxrQkFBa0IsSUFBSSxJQUFJLGVBQWUsZ0JBQWdCLFFBQVE7QUFDbkUsd0JBQWMsZUFBZSxnQkFBZ0IsSUFBSSxDQUFDO0FBQUEsUUFDcEQ7QUFHQSxZQUFJO0FBQ0osWUFBSTtBQUNKLFlBQUksV0FBNEI7QUFDaEMsWUFBSSxnQkFBK0I7QUFFbkMsWUFBSSxZQUFZO0FBRWQsd0JBQWMsUUFBUTtBQUN0QixzQkFBWTtBQUNaLHFCQUFXLENBQUMsR0FBRyxDQUFDO0FBQUEsUUFDbEIsV0FBVyxrQkFBa0IsY0FBYyxRQUFRLGVBQWUsUUFBUSxZQUFZO0FBRXBGLGdCQUFNLFlBQVksTUFBTSxjQUFjLFdBQVcsWUFBWSxHQUFHLENBQUM7QUFDakUsZ0JBQU0sUUFBUSxpQkFBaUIsUUFBUSxhQUFhLFFBQVEsWUFBWSxTQUFTO0FBQ2pGLGdCQUFNLFlBQVksYUFBYSxJQUFJO0FBQ25DLHNCQUFZLFlBQVksWUFBWTtBQUNwQyxnQkFBTSxRQUFRLGFBQWEsSUFBSTtBQUMvQix3QkFBYyxRQUFRLE1BQU0sQ0FBQyxDQUFDLEtBQUssTUFBTSxDQUFDLENBQUMsS0FBSyxNQUFNLENBQUMsQ0FBQyxLQUFLLEtBQUs7QUFDbEUscUJBQVcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO0FBQUEsUUFDeEMsT0FBTztBQUVMLGdCQUFNLFlBQVksYUFBYSxJQUFJO0FBQ25DLHNCQUFZO0FBQ1osd0JBQWMsUUFBUTtBQUN0QixxQkFBVyxhQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7QUFDdEMsMEJBQWdCLGFBQWEsSUFBSTtBQUFBLFFBQ25DO0FBRUEsWUFBSSxLQUFLO0FBQ1QsWUFBSSxVQUFVO0FBQ1osY0FBSSxZQUFZLFFBQVE7QUFBQSxRQUMxQjtBQUNBLFlBQUksa0JBQWtCLE1BQU07QUFDMUIsY0FBSSxjQUFjO0FBQUEsUUFDcEI7QUFDQSxZQUFJLGNBQWM7QUFDbEIsWUFBSSxZQUFZO0FBQ2hCLFlBQUksVUFBVTtBQUNkLFlBQUksa0JBQWlCLGVBQVUsSUFBSSxDQUFDLE1BQWYsWUFBb0I7QUFDekMsWUFBSSxPQUFPLGFBQWEsQ0FBQyxFQUFFLEdBQUcsYUFBYSxDQUFDLEVBQUUsQ0FBQztBQUMvQyxZQUFJLE9BQU8sYUFBYSxJQUFJLENBQUMsRUFBRSxHQUFHLGFBQWEsSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUN2RCxZQUFJLE9BQU87QUFDWCxZQUFJLFFBQVE7QUFFWixzQkFBYztBQUFBLE1BQ2hCO0FBQUEsSUFDRjtBQUdBLGFBQVMsSUFBSSxHQUFHLElBQUksVUFBVSxRQUFRLEtBQUs7QUFDekMsWUFBTSxLQUFLLGFBQWEsSUFBSSxDQUFDO0FBQzdCLFlBQU0sY0FBYSx1Q0FBVyxVQUFTLGNBQWMsVUFBVSxVQUFVO0FBQ3pFLFlBQU0sYUFBYSxvQkFBb0I7QUFHdkMsVUFBSTtBQUNKLFVBQUksWUFBWTtBQUNkLG9CQUFZLFFBQVE7QUFBQSxNQUN0QixXQUFXLGNBQWMsUUFBUSxrQkFBa0I7QUFDakQsb0JBQVksUUFBUTtBQUFBLE1BQ3RCLFdBQVcsa0JBQWtCLFlBQVk7QUFFdkMsY0FBTSxRQUFPLG9CQUFlLGdCQUFnQixJQUFJLENBQUMsTUFBcEMsWUFBeUM7QUFDdEQsY0FBTSxZQUFZLE9BQU8sV0FBVztBQUNwQyxjQUFNLFlBQVksV0FBVyxTQUFTLFdBQVc7QUFDakQsY0FBTSxnQkFBZ0IsV0FBVyxhQUFhLFdBQVc7QUFFekQsWUFBSSxZQUFZLFdBQVc7QUFDekIsc0JBQVk7QUFBQSxRQUNkLFdBQVcsWUFBWSxlQUFlO0FBQ3BDLHNCQUFZO0FBQUEsUUFDZCxPQUFPO0FBQ0wsc0JBQVk7QUFBQSxRQUNkO0FBQUEsTUFDRixPQUFPO0FBQ0wsb0JBQVksUUFBUTtBQUFBLE1BQ3RCO0FBR0EsWUFBTSxjQUFjLGNBQWMsUUFBUSx5QkFDdEMsUUFBUSx5QkFDUixRQUFRO0FBR1osVUFBSSxLQUFLO0FBQ1QsVUFBSSxVQUFVO0FBQ2QsWUFBTSxTQUFTLGNBQWMsYUFBYSxJQUFJO0FBQzlDLFVBQUksSUFBSSxHQUFHLEdBQUcsR0FBRyxHQUFHLFFBQVEsR0FBRyxLQUFLLEtBQUssQ0FBQztBQUMxQyxVQUFJLFlBQVk7QUFDaEIsVUFBSSxjQUFjLGNBQWMsYUFBYSxPQUFPO0FBQ3BELFVBQUksS0FBSztBQUNULFVBQUksY0FBYztBQUNsQixVQUFJLFlBQVksYUFBYSxJQUFJO0FBQ2pDLFVBQUksY0FBYztBQUNsQixVQUFJLE9BQU87QUFDWCxVQUFJLFFBQVE7QUFBQSxJQUNkO0FBQUEsRUFDRjs7O0FDM2RPLFdBQVMsWUFBWTtBQUFBLElBQzFCO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBLGFBQUFDO0FBQUEsSUFDQSxvQkFBQUM7QUFBQSxJQUNBO0FBQUEsRUFDRixHQUE2QjtBQUMzQixRQUFJLFlBQThCO0FBQ2xDLFFBQUksbUJBQTRDO0FBQ2hELFFBQUksZUFBZTtBQUNuQixRQUFJLHNCQUFzQjtBQUMxQixVQUFNLHFCQUFxQixvQkFBSSxJQUFvQjtBQUNuRCxVQUFNLHdCQUF3QixvQkFBSSxJQUFvQjtBQUN0RCxRQUFJLGtCQUFpQztBQUNyQyxRQUFJLHlCQUF3QztBQUU1QyxhQUFTLGVBQWlDO0FBQ3hDLGFBQU87QUFBQSxJQUNUO0FBRUEsYUFBUyxhQUFhLEtBQTZCO0FBQ2pELGtCQUFZO0FBQ1osWUFBTSxRQUFRLFlBQVksVUFBVSxRQUFRO0FBQzVDLFVBQUksS0FBSyxvQkFBb0IsRUFBRSxNQUFNLENBQUM7QUFBQSxJQUN4QztBQUVBLGFBQVMsc0JBQStDO0FBQ3RELGFBQU87QUFBQSxJQUNUO0FBRUEsYUFBUyxvQkFBb0IsS0FBOEIsU0FBd0I7QUFDakYseUJBQW1CO0FBQ25CLFVBQUksU0FBUztBQUNYLGNBQU0sdUJBQXVCO0FBQUEsTUFDL0I7QUFDQSxVQUFJLEtBQUssNEJBQTRCLEVBQUUsV0FBVyxpQkFBaUIsQ0FBQztBQUFBLElBQ3RFO0FBRUEsYUFBUyxzQkFBOEI7QUFDckMsYUFBTztBQUFBLElBQ1Q7QUFFQSxhQUFTLG9CQUFvQixPQUFxQjtBQUNoRCxxQkFBZTtBQUFBLElBQ2pCO0FBRUEsYUFBUyw0QkFBb0M7QUF6SC9DO0FBMEhJLFlBQU0sWUFBVyxXQUFNLGNBQWMsYUFBcEIsWUFBZ0M7QUFDakQsWUFBTSxZQUFXLFdBQU0sY0FBYyxhQUFwQixZQUFnQztBQUNqRCxZQUFNLE9BQ0osc0JBQXNCLElBQUksc0JBQXNCLE1BQU0sY0FBYztBQUN0RSxhQUFPLE1BQU0sTUFBTSxVQUFVLFFBQVE7QUFBQSxJQUN2QztBQUVBLGFBQVMsc0JBQXNCLE9BQXFCO0FBQ2xELFVBQUksT0FBTyxTQUFTLEtBQUssS0FBSyxRQUFRLEdBQUc7QUFDdkMsOEJBQXNCO0FBQUEsTUFDeEI7QUFBQSxJQUNGO0FBRUEsYUFBUyx3QkFBZ0M7QUF2STNDO0FBd0lJLFlBQU0sZ0JBQWUsV0FBTSxPQUFOLG1CQUFVO0FBQy9CLFVBQUksT0FBTyxpQkFBaUIsWUFBWSxPQUFPLFNBQVMsWUFBWSxLQUFLLGVBQWUsR0FBRztBQUN6RixlQUFPO0FBQUEsTUFDVDtBQUNBLGFBQU87QUFBQSxJQUNUO0FBRUEsYUFBUywwQkFBMEIsY0FBOEI7QUFDL0QsYUFBTyxlQUFlLHNCQUFzQjtBQUFBLElBQzlDO0FBRUEsYUFBUywwQkFBMEIsYUFBNkI7QUFDOUQsWUFBTSxTQUFTLHNCQUFzQjtBQUNyQyxhQUFPLGNBQWM7QUFBQSxJQUN2QjtBQUVBLGFBQVMscUJBQXlDO0FBQ2hELFVBQUksQ0FBQyxNQUFNLEdBQUksUUFBTztBQUN0QixZQUFNLGVBQWUsTUFBTSxRQUFRLE1BQU0sR0FBRyxTQUFTLElBQUksTUFBTSxHQUFHLFlBQVksQ0FBQztBQUMvRSxZQUFNLFNBQVMsc0JBQXNCO0FBQ3JDLFlBQU0sbUJBQW1CLFNBQVMsSUFBSSxhQUFhLE1BQU0sTUFBTSxJQUFJO0FBQ25FLFVBQUksQ0FBQyxpQkFBaUIsVUFBVSxDQUFDLFFBQVEsZUFBZTtBQUN0RCxlQUFPO0FBQUEsTUFDVDtBQUNBLGFBQU87QUFBQSxRQUNMLEVBQUUsR0FBRyxNQUFNLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQUEsUUFDL0I7QUFBQSxRQUNBLE9BQU8sYUFBYTtBQUFBLFFBQ3BCLE9BQU87QUFBQSxRQUNQLE1BQU0sUUFBUTtBQUFBLFFBQ2QsT0FBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBRUEsYUFBUyw0QkFBZ0Q7QUExSzNEO0FBMktJLFlBQU0sUUFBUSxzQkFBc0I7QUFDcEMsVUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLFFBQVEsTUFBTSxTQUFTLEtBQUssQ0FBQyxNQUFNLFVBQVUsUUFBUTtBQUN4RSxlQUFPO0FBQUEsTUFDVDtBQUNBLFlBQU0sVUFBUyxXQUFNLFdBQU4sWUFBZ0IsRUFBRSxJQUFHLGlCQUFNLE9BQU4sbUJBQVUsTUFBVixZQUFlLEdBQUcsSUFBRyxpQkFBTSxPQUFOLG1CQUFVLE1BQVYsWUFBZSxFQUFFO0FBQzFFLGFBQU87QUFBQSxRQUNMO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixPQUFPLGFBQWE7QUFBQSxRQUNwQixPQUFPO0FBQUEsUUFDUCxNQUFNLFFBQVE7QUFBQSxRQUNkLE9BQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUVBLGFBQVMsdUJBQXVCLGFBQTBDO0FBQ3hFLFlBQU0sUUFBUSxtQkFBbUI7QUFDakMsVUFBSSxDQUFDLE1BQU8sUUFBTztBQUVuQixZQUFNLE1BQU0sb0JBQW9CLGFBQWEsT0FBTztBQUFBLFFBQ2xELGdCQUFnQjtBQUFBLFFBQ2hCLGlCQUFpQjtBQUFBLE1BQ25CLENBQUM7QUFFRCxVQUFJLENBQUMsT0FBTyxJQUFJLFNBQVMsV0FBWSxRQUFPO0FBQzVDLGFBQU8sMEJBQTBCLElBQUksS0FBSztBQUFBLElBQzVDO0FBRUEsYUFBUyxhQUFhLGFBQTZDO0FBQ2pFLFlBQU0sUUFBUSxtQkFBbUI7QUFDakMsVUFBSSxDQUFDLE1BQU8sUUFBTztBQUNuQixhQUFPLG9CQUFvQixhQUFhLE9BQU87QUFBQSxRQUM3QyxnQkFBZ0I7QUFBQSxRQUNoQixpQkFBaUI7QUFBQSxNQUNuQixDQUFDO0FBQUEsSUFDSDtBQUVBLGFBQVMscUJBQXFCLGFBQTJCO0FBQ3ZELFlBQU0sY0FBYywwQkFBMEI7QUFDOUMsWUFBTSxRQUFRLHNCQUFzQjtBQUNwQyxVQUFJLENBQUMsZUFBZSxDQUFDLE1BQU8sUUFBTztBQUVuQyxZQUFNLE1BQU0sb0JBQW9CLGFBQWEsYUFBYTtBQUFBLFFBQ3hELGdCQUFnQjtBQUFBLFFBQ2hCLGlCQUFpQjtBQUFBLE1BQ25CLENBQUM7QUFDRCxVQUFJLENBQUMsSUFBSyxRQUFPO0FBRWpCLFlBQU1DLGFBQ0osSUFBSSxTQUFTLFFBQ1IsRUFBRSxNQUFNLE9BQU8sT0FBTyxJQUFJLE1BQU0sSUFDaEMsRUFBRSxNQUFNLFlBQVksT0FBTyxJQUFJLE1BQU07QUFFNUMsYUFBTyxFQUFFLE9BQU8sV0FBQUEsV0FBVTtBQUFBLElBQzVCO0FBRUEsYUFBUyxzQkFBc0IsV0FBeUI7QUFDdEQsWUFBTSxZQUFZLG1CQUFtQjtBQUNyQyxVQUFJLGFBQWEsVUFBVSxVQUFVLFNBQVMsS0FBSyxRQUFRLGVBQWU7QUFDeEU7QUFBQSxVQUNFO0FBQUEsVUFDQSxVQUFVO0FBQUEsVUFDVixVQUFVO0FBQUEsVUFDVixVQUFVO0FBQUEsVUFDVjtBQUFBLFVBQ0E7QUFBQSxRQUNGO0FBQUEsTUFDRixPQUFPO0FBQ0wsMkJBQW1CLE1BQU07QUFBQSxNQUMzQjtBQUVBLFlBQU0sZUFBZSwwQkFBMEI7QUFDL0MsVUFBSSxjQUFjO0FBQ2hCO0FBQUEsVUFDRTtBQUFBLFVBQ0EsYUFBYTtBQUFBLFVBQ2IsYUFBYTtBQUFBLFVBQ2IsYUFBYTtBQUFBLFVBQ2IsTUFBTSxjQUFjO0FBQUEsVUFDcEI7QUFBQSxRQUNGO0FBQUEsTUFDRixPQUFPO0FBQ0wsOEJBQXNCLE1BQU07QUFBQSxNQUM5QjtBQUFBLElBQ0Y7QUFFQSxhQUFTLDJCQUFnRDtBQWpRM0Q7QUFrUUksWUFBTSxTQUFTLE1BQU0sUUFBUSxNQUFNLGFBQWEsSUFBSSxNQUFNLGdCQUFnQixDQUFDO0FBQzNFLFVBQUksQ0FBQyxPQUFPLE9BQVEsUUFBTztBQUUzQixVQUFJLENBQUMsTUFBTSxzQkFBc0I7QUFDL0IsY0FBTSx1QkFBdUIsT0FBTyxDQUFDLEVBQUU7QUFBQSxNQUN6QztBQUVBLFVBQUksUUFBUSxPQUFPLEtBQUssQ0FBQyxNQUFNLEVBQUUsT0FBTyxNQUFNLG9CQUFvQixLQUFLO0FBQ3ZFLFVBQUksQ0FBQyxPQUFPO0FBQ1YsaUJBQVEsWUFBTyxDQUFDLE1BQVIsWUFBYTtBQUNyQixjQUFNLHdCQUF1QixvQ0FBTyxPQUFQLFlBQWE7QUFBQSxNQUM1QztBQUNBLGFBQU87QUFBQSxJQUNUO0FBRUEsYUFBUyx3QkFBNkM7QUFqUnhEO0FBa1JJLFlBQU0sU0FBUyxNQUFNLFFBQVEsTUFBTSxhQUFhLElBQUksTUFBTSxnQkFBZ0IsQ0FBQztBQUMzRSxVQUFJLENBQUMsT0FBTyxPQUFRLFFBQU87QUFDM0IsVUFBSSxDQUFDLE1BQU0sc0JBQXNCO0FBQy9CLGVBQU8seUJBQXlCO0FBQUEsTUFDbEM7QUFDQSxjQUNFLFlBQU8sS0FBSyxDQUFDLE1BQU0sRUFBRSxPQUFPLE1BQU0sb0JBQW9CLE1BQXRELFlBQ0EseUJBQXlCO0FBQUEsSUFFN0I7QUFFQSxhQUFTLGtCQUFrQixXQUF5QjtBQUNsRCxZQUFNLFNBQVMsTUFBTSxRQUFRLE1BQU0sYUFBYSxJQUFJLE1BQU0sZ0JBQWdCLENBQUM7QUFDM0UsVUFBSSxDQUFDLE9BQU8sUUFBUTtBQUNsQjtBQUFBLE1BQ0Y7QUFDQSxZQUFNLGVBQWUsT0FBTztBQUFBLFFBQzFCLENBQUMsVUFBVSxNQUFNLE9BQU8sTUFBTTtBQUFBLE1BQ2hDO0FBQ0EsWUFBTSxZQUFZLGdCQUFnQixJQUFJLGVBQWU7QUFDckQsWUFBTSxjQUNGLFlBQVksYUFBYSxPQUFPLFNBQVMsT0FBTyxVQUFVLE9BQU87QUFDckUsWUFBTSxZQUFZLE9BQU8sU0FBUztBQUNsQyxVQUFJLENBQUMsVUFBVztBQUNoQixZQUFNLHVCQUF1QixVQUFVO0FBQ3ZDLDBCQUFvQixJQUFJO0FBQ3hCLE1BQUFGLGFBQVk7QUFBQSxRQUNWLE1BQU07QUFBQSxRQUNOLFVBQVUsVUFBVTtBQUFBLE1BQ3RCLENBQUM7QUFDRCxVQUFJLEtBQUssOEJBQThCLEVBQUUsU0FBUyxVQUFVLEdBQUcsQ0FBQztBQUFBLElBQ2xFO0FBRUEsYUFBUyxtQkFBbUIsV0FBeUI7QUFDbkQsWUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLFFBQVEsTUFBTSxHQUFHLFNBQVMsSUFBSSxNQUFNLEdBQUcsWUFBWSxDQUFDO0FBQ2xGLFVBQUksQ0FBQyxJQUFJLFFBQVE7QUFDZixxQkFBYSxJQUFJO0FBQ2pCO0FBQUEsTUFDRjtBQUNBLFVBQUksUUFBUSxZQUFZLFVBQVUsUUFBUSxZQUFZLElBQUksS0FBSyxJQUFJO0FBQ25FLGVBQVM7QUFDVCxVQUFJLFFBQVEsRUFBRyxTQUFRLElBQUksU0FBUztBQUNwQyxVQUFJLFNBQVMsSUFBSSxPQUFRLFNBQVE7QUFDakMsbUJBQWEsRUFBRSxNQUFNLE9BQU8sTUFBTSxDQUFDO0FBQUEsSUFDckM7QUFFQSxhQUFTLGlCQUF1QjtBQUM5QixZQUFNLE1BQ0osTUFBTSxNQUFNLE1BQU0sUUFBUSxNQUFNLEdBQUcsU0FBUyxJQUFJLE1BQU0sR0FBRyxZQUFZLENBQUM7QUFDeEUsVUFBSSxDQUFDLElBQUksT0FBUTtBQUNqQixNQUFBQSxhQUFZLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUN2QyxVQUFJLE1BQU0sSUFBSTtBQUNaLGNBQU0sR0FBRyxZQUFZLENBQUM7QUFBQSxNQUN4QjtBQUNBLG1CQUFhLElBQUk7QUFDakIsVUFBSSxLQUFLLHVCQUF1QjtBQUFBLElBQ2xDO0FBRUEsYUFBUyw2QkFBbUM7QUFDMUMsVUFBSSxDQUFDLFVBQVc7QUFDaEIsTUFBQUEsYUFBWSxFQUFFLE1BQU0sbUJBQW1CLE9BQU8sVUFBVSxNQUFNLENBQUM7QUFDL0QsVUFBSSxNQUFNLE1BQU0sTUFBTSxRQUFRLE1BQU0sR0FBRyxTQUFTLEdBQUc7QUFDakQsY0FBTSxHQUFHLFlBQVksTUFBTSxHQUFHLFVBQVUsTUFBTSxHQUFHLFVBQVUsS0FBSztBQUFBLE1BQ2xFO0FBQ0EsVUFBSSxLQUFLLHdCQUF3QixFQUFFLE9BQU8sVUFBVSxNQUFNLENBQUM7QUFDM0QsbUJBQWEsSUFBSTtBQUFBLElBQ25CO0FBRUEsYUFBUyxnQ0FBc0M7QUFDN0MsWUFBTSxRQUFRLHNCQUFzQjtBQUNwQyxVQUFJLENBQUMsU0FBUyxDQUFDLGlCQUFrQjtBQUNqQyxZQUFNLFFBQVEsaUJBQWlCO0FBQy9CLFVBQUksQ0FBQyxNQUFNLFFBQVEsTUFBTSxTQUFTLEtBQUssUUFBUSxLQUFLLFNBQVMsTUFBTSxVQUFVLFFBQVE7QUFDbkY7QUFBQSxNQUNGO0FBQ0EsTUFBQUEsYUFBWTtBQUFBLFFBQ1YsTUFBTTtBQUFBLFFBQ04sVUFBVSxNQUFNO0FBQUEsUUFDaEI7QUFBQSxNQUNGLENBQUM7QUFDRCxZQUFNLFlBQVk7QUFBQSxRQUNoQixHQUFHLE1BQU0sVUFBVSxNQUFNLEdBQUcsS0FBSztBQUFBLFFBQ2pDLEdBQUcsTUFBTSxVQUFVLE1BQU0sUUFBUSxDQUFDO0FBQUEsTUFDcEM7QUFDQSxVQUFJLEtBQUssMkJBQTJCLEVBQUUsU0FBUyxNQUFNLElBQUksTUFBTSxDQUFDO0FBQ2hFLDBCQUFvQixJQUFJO0FBQUEsSUFDMUI7QUFFQSxhQUFTLDJCQUFpQztBQTFXNUM7QUEyV0ksWUFBTSxRQUFRLHNCQUFzQjtBQUNwQyxVQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sUUFBUSxNQUFNLFNBQVMsS0FBSyxNQUFNLFVBQVUsV0FBVyxHQUFHO0FBQzdFO0FBQUEsTUFDRjtBQUNBLFVBQUksNEJBQTRCLElBQUksTUFBTTtBQUN4QztBQUFBLE1BQ0Y7QUFHQSxVQUFJLGNBQWM7QUFDbEIsV0FBSSxXQUFNLGNBQU4sbUJBQWlCLE9BQU87QUFDMUIsbUJBQVcsUUFBUSxNQUFNLFVBQVUsT0FBTztBQUN4QyxjQUFJLEtBQUssU0FBUyxhQUFhLEtBQUssV0FBVyxHQUFHO0FBQ2hELDBCQUFjO0FBQ2Q7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFDQSxVQUFJLENBQUMsYUFBYTtBQUNoQixnQkFBUSxJQUFJLDhDQUE4QztBQUMxRDtBQUFBLE1BQ0Y7QUFFQSxVQUFJLEtBQUssMkJBQTJCLEVBQUUsU0FBUyxNQUFNLEdBQUcsQ0FBQztBQUN6RCxNQUFBQSxhQUFZO0FBQUEsUUFDVixNQUFNO0FBQUEsUUFDTixVQUFVLE1BQU07QUFBQSxNQUNsQixDQUFDO0FBQUEsSUFDSDtBQUVBLGFBQVMsa0JBQ1AsYUFDQSxZQUNNO0FBQ04sVUFBSSxDQUFDLE1BQU0sR0FBSTtBQUNmLFVBQUksUUFBUSxhQUFhLFVBQVU7QUFDakMsY0FBTSxNQUFNLGFBQWEsV0FBVztBQUNwQyxZQUFJLEtBQUs7QUFDUCxnQkFBTSxjQUFjLDBCQUEwQixJQUFJLEtBQUs7QUFDdkQsdUJBQWEsRUFBRSxNQUFNLElBQUksTUFBTSxPQUFPLFlBQVksQ0FBQztBQUFBLFFBQ3JELE9BQU87QUFDTCx1QkFBYSxJQUFJO0FBQUEsUUFDbkI7QUFDQTtBQUFBLE1BQ0Y7QUFFQSxZQUFNLEtBQUssRUFBRSxHQUFHLFdBQVcsR0FBRyxHQUFHLFdBQVcsR0FBRyxPQUFPLGFBQWE7QUFDbkUsTUFBQUEsYUFBWTtBQUFBLFFBQ1YsTUFBTTtBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLE9BQU87QUFBQSxNQUNULENBQUM7QUFDRCxZQUFNLE1BQU0sTUFBTSxRQUFRLE1BQU0sR0FBRyxTQUFTLElBQ3hDLE1BQU0sR0FBRyxVQUFVLE1BQU0sSUFDekIsQ0FBQztBQUNMLFVBQUksS0FBSyxFQUFFO0FBQ1gsWUFBTSxHQUFHLFlBQVk7QUFDckIsVUFBSSxLQUFLLHNCQUFzQixFQUFFLE9BQU8sSUFBSSxTQUFTLEVBQUUsQ0FBQztBQUN4RCxtQkFBYSxJQUFJO0FBQUEsSUFDbkI7QUFFQSxhQUFTLHFCQUNQLGFBQ0EsWUFDTTtBQUNOLFlBQU0sUUFBUSxzQkFBc0I7QUFDcEMsVUFBSSxDQUFDLE1BQU87QUFFWixVQUFJLFFBQVEsZ0JBQWdCLFVBQVU7QUFDcEMsY0FBTSxNQUFNLHFCQUFxQixXQUFXO0FBQzVDLFlBQUksS0FBSztBQUNQLDhCQUFvQixJQUFJLFdBQVcsSUFBSSxNQUFNLEVBQUU7QUFBQSxRQUNqRCxPQUFPO0FBQ0wsOEJBQW9CLElBQUk7QUFBQSxRQUMxQjtBQUNBO0FBQUEsTUFDRjtBQUVBLFlBQU0sUUFBUSwwQkFBMEI7QUFDeEMsWUFBTSxLQUFLLEVBQUUsR0FBRyxXQUFXLEdBQUcsR0FBRyxXQUFXLEdBQUcsTUFBTTtBQUNyRCxNQUFBQSxhQUFZO0FBQUEsUUFDVixNQUFNO0FBQUEsUUFDTixVQUFVLE1BQU07QUFBQSxRQUNoQixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sT0FBTyxHQUFHO0FBQUEsTUFDWixDQUFDO0FBQ0QsWUFBTSxZQUFZLE1BQU0sWUFBWSxDQUFDLEdBQUcsTUFBTSxXQUFXLEVBQUUsSUFBSSxDQUFDLEVBQUU7QUFDbEUsNEJBQXNCLEtBQUs7QUFDM0IsMEJBQW9CLE1BQU0sTUFBTSxFQUFFO0FBQ2xDLFVBQUksS0FBSyx5QkFBeUI7QUFBQSxRQUNoQyxTQUFTLE1BQU07QUFBQSxRQUNmLE9BQU8sTUFBTSxVQUFVLFNBQVM7QUFBQSxNQUNsQyxDQUFDO0FBQUEsSUFDSDtBQUVBLGFBQVMsY0FBYyxPQUFlLFNBQTZCO0FBQ2pFLHdCQUFrQjtBQUFBLElBQ3BCO0FBRUEsYUFBUyxpQkFBaUIsT0FBZSxTQUE2QjtBQUNwRSwrQkFBeUI7QUFBQSxJQUMzQjtBQUVBLGFBQVMsYUFBYSxPQUFtQztBQXBkM0Q7QUFxZEksWUFBTSxVQUFTLFdBQU0sVUFBVSxNQUFoQixZQUFxQjtBQUNwQyxZQUFNLFVBQVMsV0FBTSxVQUFVLE1BQWhCLFlBQXFCO0FBQ3BDLGFBQU87QUFBQSxRQUNMLEdBQUcsTUFBTSxNQUFNLEdBQUcsR0FBRyxNQUFNO0FBQUEsUUFDM0IsR0FBRyxNQUFNLE1BQU0sR0FBRyxHQUFHLE1BQU07QUFBQSxNQUM3QjtBQUFBLElBQ0Y7QUFFQSxhQUFTLGVBQWUsWUFBZ0M7QUFDdEQsVUFBSSxvQkFBb0IsS0FBTTtBQUM5QixZQUFNLFVBQVUsYUFBYSxVQUFVO0FBQ3ZDLE1BQUFBLGFBQVk7QUFBQSxRQUNWLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxRQUNQLEdBQUcsUUFBUTtBQUFBLFFBQ1gsR0FBRyxRQUFRO0FBQUEsTUFDYixDQUFDO0FBQ0QsVUFBSSxNQUFNLE1BQU0sTUFBTSxHQUFHLGFBQWEsa0JBQWtCLE1BQU0sR0FBRyxVQUFVLFFBQVE7QUFDakYsY0FBTSxHQUFHLFVBQVUsZUFBZSxFQUFFLElBQUksUUFBUTtBQUNoRCxjQUFNLEdBQUcsVUFBVSxlQUFlLEVBQUUsSUFBSSxRQUFRO0FBQUEsTUFDbEQ7QUFBQSxJQUNGO0FBRUEsYUFBUyxrQkFBa0IsWUFBZ0M7QUFDekQsVUFBSSwyQkFBMkIsS0FBTTtBQUNyQyxZQUFNLFFBQVEsc0JBQXNCO0FBQ3BDLFVBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxRQUFRLE1BQU0sU0FBUyxFQUFHO0FBQy9DLFlBQU0sVUFBVSxhQUFhLFVBQVU7QUFDdkMsVUFBSSwwQkFBMEIsTUFBTSxVQUFVLE9BQVE7QUFFdEQsTUFBQUEsYUFBWTtBQUFBLFFBQ1YsTUFBTTtBQUFBLFFBQ04sVUFBVSxNQUFNO0FBQUEsUUFDaEIsT0FBTztBQUFBLFFBQ1AsR0FBRyxRQUFRO0FBQUEsUUFDWCxHQUFHLFFBQVE7QUFBQSxNQUNiLENBQUM7QUFFRCxZQUFNLFlBQVksTUFBTSxVQUFVO0FBQUEsUUFBSSxDQUFDLElBQUksUUFDekMsUUFBUSx5QkFBeUIsRUFBRSxHQUFHLElBQUksR0FBRyxRQUFRLEdBQUcsR0FBRyxRQUFRLEVBQUUsSUFBSTtBQUFBLE1BQzNFO0FBQUEsSUFDRjtBQUVBLGFBQVMsVUFBZ0I7QUFoZ0IzQjtBQWlnQkksVUFBSSxvQkFBb0IsVUFBUSxXQUFNLE9BQU4sbUJBQVUsWUFBVztBQUNuRCxjQUFNLEtBQUssTUFBTSxHQUFHLFVBQVUsZUFBZTtBQUM3QyxZQUFJLElBQUk7QUFDTixjQUFJLEtBQUssc0JBQXNCO0FBQUEsWUFDN0IsT0FBTztBQUFBLFlBQ1AsR0FBRyxHQUFHO0FBQUEsWUFDTixHQUFHLEdBQUc7QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNIO0FBQUEsTUFDRjtBQUVBLFVBQUksMkJBQTJCLE1BQU07QUFDbkMsY0FBTSxRQUFRLHNCQUFzQjtBQUNwQyxZQUFJLFNBQVMsTUFBTSxhQUFhLHlCQUF5QixNQUFNLFVBQVUsUUFBUTtBQUMvRSxnQkFBTSxLQUFLLE1BQU0sVUFBVSxzQkFBc0I7QUFDakQsY0FBSSxLQUFLLHlCQUF5QjtBQUFBLFlBQ2hDLFNBQVMsTUFBTTtBQUFBLFlBQ2YsT0FBTztBQUFBLFlBQ1AsR0FBRyxHQUFHO0FBQUEsWUFDTixHQUFHLEdBQUc7QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNIO0FBQUEsTUFDRjtBQUVBLHdCQUFrQjtBQUNsQiwrQkFBeUI7QUFBQSxJQUMzQjtBQUVBLGFBQVMscUJBQW9DO0FBQzNDLGFBQU87QUFBQSxJQUNUO0FBRUEsYUFBUyw0QkFBMkM7QUFDbEQsYUFBTztBQUFBLElBQ1Q7QUFFQSxhQUFTLDhCQUFzQztBQUM3QyxZQUFNLFlBQVksTUFBTSxxQkFBcUJDLG9CQUFtQixLQUFLO0FBQ3JFLGFBQU8sWUFBWSxJQUFJLFlBQVk7QUFBQSxJQUNyQztBQUVBLFdBQU87QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7OztBQ3pqQk8sV0FBUyxlQUFlO0FBQUEsSUFDN0I7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0YsR0FBaUM7QUFDL0IsYUFBUyxTQUNQLEdBQ0EsR0FDQSxJQUNBLElBQ0EsT0FDQSxRQUNNO0FBQ04sWUFBTSxJQUFJLE9BQU8sY0FBYyxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBQ3ZDLFlBQU0sSUFBSTtBQUNWLFVBQUksS0FBSztBQUNULFVBQUksVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBQ3RCLFlBQU0sUUFBUSxLQUFLLE1BQU0sSUFBSSxFQUFFO0FBQy9CLFVBQUksT0FBTyxLQUFLO0FBQ2hCLFVBQUksVUFBVTtBQUNkLFVBQUksT0FBTyxHQUFHLENBQUM7QUFDZixVQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssSUFBSSxHQUFHO0FBQzVCLFVBQUksT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDO0FBQ3RCLFVBQUksT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksR0FBRztBQUM3QixVQUFJLFVBQVU7QUFDZCxVQUFJLFlBQVk7QUFDaEIsVUFBSSxjQUFjO0FBQ2xCLFVBQUksUUFBUTtBQUNWLFlBQUksWUFBWSxHQUFHLEtBQUs7QUFDeEIsWUFBSSxLQUFLO0FBQUEsTUFDWDtBQUNBLFVBQUksT0FBTztBQUNYLFVBQUksUUFBUTtBQUFBLElBQ2Q7QUFFQSxhQUFTLGFBQWEsR0FBVyxHQUFpQjtBQUNoRCxZQUFNLElBQUksT0FBTyxjQUFjLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDdkMsVUFBSSxVQUFVO0FBQ2QsVUFBSSxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsR0FBRyxHQUFHLEtBQUssS0FBSyxDQUFDO0FBQ25DLFVBQUksWUFBWTtBQUNoQixVQUFJLEtBQUs7QUFBQSxJQUNYO0FBRUEsYUFBUyxZQUFrQjtBQXRFN0I7QUF1RUksVUFBSSxDQUFDLE1BQU0sR0FBSTtBQUNmLFlBQU0sUUFBUSxNQUFNLG1CQUFtQjtBQUN2QyxVQUFJLENBQUMsU0FBUyxNQUFNLFVBQVUsV0FBVyxFQUFHO0FBRTVDLFlBQU0sT0FBTyxNQUFNLEdBQUc7QUFDdEIsWUFBTSxhQUFhLE9BQ2Y7QUFBQSxRQUNFLGFBQWEsS0FBSztBQUFBLFFBQ2xCLEtBQUssS0FBSztBQUFBLFFBQ1YsT0FBTyxLQUFLO0FBQUEsUUFDWixLQUFLLEtBQUs7QUFBQSxRQUNWLEtBQUssS0FBSztBQUFBLFFBQ1YsWUFBWSxLQUFLO0FBQUEsUUFDakIsUUFBUSxLQUFLO0FBQUEsTUFDZixJQUNBO0FBRUosWUFBTSxtQkFBbUIsTUFBTSxhQUFhO0FBQzVDLFlBQU0sbUJBQW1CLG1CQUNyQjtBQUFBLFFBQ0UsTUFBTSxpQkFBaUI7QUFBQSxRQUN2QixPQUFPLE1BQU0sMEJBQTBCLGlCQUFpQixLQUFLO0FBQUEsTUFDL0QsSUFDQTtBQUNKLFlBQU0saUJBQ0osb0JBQW9CLGlCQUFpQixTQUFTLElBQUksbUJBQW1CO0FBRXZFLFlBQU0sVUFBVSxNQUFNLG1CQUFtQjtBQUN6QyxZQUFNLGlCQUNKLFlBQVksT0FBTyxNQUFNLDBCQUEwQixPQUFPLElBQUk7QUFDaEUsWUFBTSxlQUNKLG1CQUFtQixRQUFRLGtCQUFrQixJQUFJLGlCQUFpQjtBQUVwRSx1QkFBaUIsS0FBSztBQUFBLFFBQ3BCLGFBQWE7QUFBQSxRQUNiLFdBQVc7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLFFBQ2pCLFdBQVcsTUFBTTtBQUFBLFFBQ2pCLFNBQVM7QUFBQSxRQUNULFVBQVUsUUFBUTtBQUFBLFFBQ2xCO0FBQUEsUUFDQSxjQUFhLGtDQUFNLFVBQU4sWUFBZTtBQUFBLFFBQzVCLGNBQWMsTUFBTSxvQkFBb0I7QUFBQSxRQUN4QyxhQUFhLE1BQU07QUFBQSxNQUNyQixDQUFDO0FBQUEsSUFDSDtBQUVBLGFBQVMsbUJBQXlCO0FBQ2hDLFVBQUksQ0FBQyxNQUFNLEdBQUk7QUFDZixVQUFJLFFBQVEsaUJBQWlCLFVBQVc7QUFDeEMsWUFBTSxRQUFRLE1BQU0sMEJBQTBCO0FBQzlDLFVBQUksQ0FBQyxTQUFTLE1BQU0sVUFBVSxXQUFXLEVBQUc7QUFFNUMsWUFBTSxhQUFhLE1BQU0sY0FBYztBQUN2QyxZQUFNLG1CQUFtQixNQUFNLG9CQUFvQjtBQUNuRCxZQUFNLG1CQUNKLG9CQUFvQixpQkFBaUIsU0FBUyxRQUMxQyxFQUFFLE1BQU0sT0FBTyxPQUFPLGlCQUFpQixNQUFNLElBQzdDLG9CQUFvQixpQkFBaUIsU0FBUyxhQUM5QyxFQUFFLE1BQU0sWUFBWSxPQUFPLGlCQUFpQixNQUFNLElBQ2xEO0FBRU4sdUJBQWlCLEtBQUs7QUFBQSxRQUNwQixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxpQkFBaUI7QUFBQSxRQUNqQixXQUFXLE1BQU07QUFBQSxRQUNqQixTQUFTO0FBQUEsUUFDVCxVQUFVO0FBQUEsUUFDVjtBQUFBLFFBQ0EsYUFBYTtBQUFBLFFBQ2IsY0FBYyxNQUFNLGNBQWM7QUFBQSxRQUNsQyxhQUFhLE1BQU07QUFBQSxNQUNyQixDQUFDO0FBQUEsSUFDSDtBQUVBLGFBQVMsZUFBcUI7QUFDNUIsVUFBSSxDQUFDLE1BQU0sWUFBWSxNQUFNLFNBQVMsV0FBVyxFQUFHO0FBQ3BELFlBQU0sUUFBUSxPQUFPLGFBQWE7QUFDbEMsWUFBTSxTQUFTLE9BQU8sUUFBUSxNQUFNO0FBQ3BDLFlBQU0sU0FBUyxPQUFPLFNBQVMsTUFBTTtBQUNyQyxZQUFNLGVBQWUsU0FBUyxVQUFVO0FBQ3hDLGlCQUFXLFFBQVEsTUFBTSxVQUFVO0FBQ2pDLGNBQU0sSUFBSSxPQUFPLGNBQWMsRUFBRSxHQUFHLEtBQUssR0FBRyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3ZELGNBQU0sWUFBWSxRQUFRLEtBQUssSUFBSTtBQUNuQyxZQUFJLEtBQUs7QUFDVCxZQUFJLFVBQVU7QUFDZCxZQUFJLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxZQUFZLElBQUksR0FBRyxHQUFHLEtBQUssS0FBSyxDQUFDO0FBQ25ELFlBQUksWUFBWSxZQUFZLFlBQVk7QUFDeEMsWUFBSSxjQUFjLFlBQVksT0FBTztBQUNyQyxZQUFJLEtBQUs7QUFDVCxZQUFJLGNBQWM7QUFDbEIsWUFBSSxZQUFZO0FBQ2hCLFlBQUksY0FBYztBQUNsQixZQUFJLE9BQU87QUFDWCxZQUFJLFFBQVE7QUFFWixZQUFJLGFBQWEsS0FBSyxjQUFjLEdBQUc7QUFDckMsY0FBSSxLQUFLO0FBQ1QsY0FBSSxVQUFVO0FBQ2QsZ0JBQU0sVUFBVSxLQUFLLGNBQWM7QUFDbkMsY0FBSSxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDeEIsY0FBSSxjQUFjO0FBQ2xCLGNBQUksWUFBWTtBQUNoQixjQUFJLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxTQUFTLEdBQUcsS0FBSyxLQUFLLENBQUM7QUFDekMsY0FBSSxPQUFPO0FBQ1gsY0FBSSxRQUFRO0FBQUEsUUFDZDtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBRUEsYUFBUyxXQUFpQjtBQUN4QixVQUFJLEtBQUs7QUFDVCxVQUFJLGNBQWM7QUFDbEIsVUFBSSxZQUFZO0FBRWhCLFlBQU0sT0FBTyxRQUFRO0FBQ3JCLFVBQUksT0FBTztBQUNYLFVBQUksT0FBTyxLQUFLO0FBQ2QsZUFBTztBQUFBLE1BQ1QsV0FBVyxPQUFPLEtBQUs7QUFDckIsZUFBTztBQUFBLE1BQ1QsV0FBVyxPQUFPLEtBQUs7QUFDckIsZUFBTztBQUFBLE1BQ1Q7QUFFQSxZQUFNLFlBQVksT0FBTyxrQkFBa0I7QUFDM0MsWUFBTSxRQUFRLE9BQU8sYUFBYTtBQUNsQyxZQUFNLFNBQVMsT0FBTyxRQUFRLE1BQU07QUFDcEMsWUFBTSxTQUFTLE9BQU8sU0FBUyxNQUFNO0FBQ3JDLFlBQU0sUUFBUSxLQUFLLElBQUksUUFBUSxNQUFNLElBQUk7QUFDekMsWUFBTSxnQkFBZ0IsT0FBTyxRQUFRO0FBQ3JDLFlBQU0saUJBQWlCLE9BQU8sU0FBUztBQUV2QyxZQUFNLE9BQU8sS0FBSyxJQUFJLEdBQUcsVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQ3hELFlBQU0sT0FBTyxLQUFLLElBQUksTUFBTSxHQUFHLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUM5RCxZQUFNLE9BQU8sS0FBSyxJQUFJLEdBQUcsVUFBVSxJQUFJLGlCQUFpQixDQUFDO0FBQ3pELFlBQU0sT0FBTyxLQUFLLElBQUksTUFBTSxHQUFHLFVBQVUsSUFBSSxpQkFBaUIsQ0FBQztBQUUvRCxZQUFNLFNBQVMsS0FBSyxNQUFNLE9BQU8sSUFBSSxJQUFJO0FBQ3pDLFlBQU0sT0FBTyxLQUFLLEtBQUssT0FBTyxJQUFJLElBQUk7QUFDdEMsWUFBTSxTQUFTLEtBQUssTUFBTSxPQUFPLElBQUksSUFBSTtBQUN6QyxZQUFNLE9BQU8sS0FBSyxLQUFLLE9BQU8sSUFBSSxJQUFJO0FBRXRDLGVBQVMsSUFBSSxRQUFRLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDekMsY0FBTSxJQUFJLE9BQU8sY0FBYyxFQUFFLEdBQUcsR0FBRyxLQUFLLElBQUksR0FBRyxJQUFJLEVBQUUsQ0FBQztBQUMxRCxjQUFNLElBQUksT0FBTyxjQUFjLEVBQUUsR0FBRyxHQUFHLEtBQUssSUFBSSxNQUFNLEdBQUcsSUFBSSxFQUFFLENBQUM7QUFDaEUsWUFBSSxVQUFVO0FBQ2QsWUFBSSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDbkIsWUFBSSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDbkIsWUFBSSxPQUFPO0FBQUEsTUFDYjtBQUVBLGVBQVMsSUFBSSxRQUFRLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDekMsY0FBTSxJQUFJLE9BQU8sY0FBYyxFQUFFLEdBQUcsS0FBSyxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUMxRCxjQUFNLElBQUksT0FBTyxjQUFjLEVBQUUsR0FBRyxLQUFLLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFDaEUsWUFBSSxVQUFVO0FBQ2QsWUFBSSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDbkIsWUFBSSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDbkIsWUFBSSxPQUFPO0FBQUEsTUFDYjtBQUNBLFVBQUksUUFBUTtBQUFBLElBQ2Q7QUFFQSxhQUFTLFlBQWtCO0FBQ3pCLFVBQUksVUFBVSxHQUFHLEdBQUcsT0FBTyxPQUFPLE9BQU8sTUFBTTtBQUMvQyxlQUFTO0FBQ1QsZ0JBQVU7QUFDVix1QkFBaUI7QUFDakIsbUJBQWE7QUFFYixpQkFBVyxLQUFLLE1BQU0sUUFBUTtBQUM1QixpQkFBUyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLElBQUksV0FBVyxLQUFLO0FBQy9DLHFCQUFhLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFBQSxNQUN2QjtBQUNBLFVBQUksTUFBTSxJQUFJO0FBQ1osaUJBQVMsTUFBTSxHQUFHLEdBQUcsTUFBTSxHQUFHLEdBQUcsTUFBTSxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksV0FBVyxJQUFJO0FBQUEsTUFDNUU7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGO0FBQUEsRUFDRjs7O0FDNU1PLFdBQVMsU0FBUztBQUFBLElBQ3ZCO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsYUFBQUU7QUFBQSxJQUNBLG9CQUFBQztBQUFBLEVBQ0YsR0FBaUM7QUFDL0IsUUFBSSxTQUFtQztBQUN2QyxRQUFJLE1BQXVDO0FBQzNDLFFBQUksU0FBNkI7QUFDakMsUUFBSSxZQUFnQztBQUNwQyxRQUFJLG1CQUF1QztBQUMzQyxRQUFJLGVBQXlDO0FBQzdDLFFBQUksYUFBdUM7QUFDM0MsUUFBSSxnQkFBMEM7QUFDOUMsUUFBSSxzQkFBMEM7QUFDOUMsUUFBSSxlQUFtQztBQUN2QyxRQUFJLGlCQUFxQztBQUN6QyxRQUFJLGdCQUEwQztBQUM5QyxRQUFJLGdCQUFvQztBQUN4QyxRQUFJLGtCQUEyQztBQUMvQyxRQUFJLGlCQUFxQztBQUN6QyxRQUFJLHFCQUF5QztBQUU3QyxRQUFJLHNCQUEwQztBQUM5QyxRQUFJLHFCQUErQztBQUNuRCxRQUFJLG1CQUE2QztBQUNqRCxRQUFJLG9CQUF3QztBQUM1QyxRQUFJLG9CQUF3QztBQUM1QyxRQUFJLGdCQUEwQztBQUM5QyxRQUFJLG1CQUE2QztBQUNqRCxRQUFJLG1CQUE2QztBQUNqRCxRQUFJLG1CQUF1QztBQUMzQyxRQUFJLHFCQUE4QztBQUNsRCxRQUFJLG9CQUF3QztBQUM1QyxRQUFJLGtCQUFzQztBQUMxQyxRQUFJLG9CQUE2QztBQUNqRCxRQUFJLG1CQUF1QztBQUMzQyxRQUFJLDBCQUE4QztBQUNsRCxRQUFJLDRCQUFxRDtBQUN6RCxRQUFJLDJCQUErQztBQUNuRCxRQUFJLGtCQUE0QztBQUNoRCxRQUFJLG1CQUF1QztBQUMzQyxRQUFJLHVCQUEyQztBQUMvQyxRQUFJLHlCQUE2QztBQUNqRCxRQUFJLGNBQXdDO0FBQzVDLFFBQUksZUFBbUM7QUFFdkMsUUFBSSxlQUF5QztBQUM3QyxRQUFJLGVBQXlDO0FBQzdDLFFBQUksa0JBQTRDO0FBQ2hELFFBQUksWUFBZ0M7QUFDcEMsUUFBSSx3QkFBa0Q7QUFDdEQsUUFBSSx3QkFBa0Q7QUFDdEQsUUFBSSwyQkFBcUQ7QUFDekQsUUFBSSx3QkFBNEM7QUFDaEQsUUFBSSx5QkFBNkM7QUFFakQsUUFBSSxhQUF1QztBQUMzQyxRQUFJLGNBQWtDO0FBQ3RDLFFBQUksZUFBeUM7QUFDN0MsUUFBSSxXQUErQjtBQUVuQyxRQUFJLGNBQWtDO0FBQ3RDLFFBQUksaUJBQXFDO0FBQ3pDLFFBQUksZ0JBQW9DO0FBQ3hDLFFBQUksY0FBa0M7QUFDdEMsUUFBSSxlQUFtQztBQUV2QyxRQUFJLGdCQUFnQjtBQUNwQixRQUFJLGlCQUFpQjtBQUNyQixRQUFJLGNBQWM7QUFDbEIsUUFBSSxpQkFBaUI7QUFDckIsUUFBSSw0QkFBNEI7QUFDaEMsUUFBSSw0QkFBNEI7QUFDaEMsUUFBSSx3QkFBc0U7QUFFMUUsYUFBUyxXQUF5QjtBQXZJcEM7QUF3SUksZUFBUyxTQUFTLGVBQWUsSUFBSTtBQUNyQyxhQUFNLHNDQUFRLFdBQVcsVUFBbkIsWUFBNEI7QUFDbEMsZUFBUyxTQUFTLGVBQWUsU0FBUztBQUMxQyx5QkFBbUIsU0FBUyxlQUFlLGVBQWU7QUFDMUQscUJBQWUsU0FBUyxlQUFlLFlBQVk7QUFDbkQsbUJBQWEsU0FBUyxlQUFlLFVBQVU7QUFDL0Msc0JBQWdCLFNBQVMsZUFBZSxhQUFhO0FBQ3JELDRCQUFzQixTQUFTLGVBQWUsYUFBYTtBQUMzRCxxQkFBZSxTQUFTLGVBQWUsZ0JBQWdCO0FBQ3ZELHVCQUFpQixTQUFTLGVBQWUsa0JBQWtCO0FBQzNELHNCQUFnQixTQUFTLGVBQWUsYUFBYTtBQUNyRCxzQkFBZ0IsU0FBUyxlQUFlLGlCQUFpQjtBQUN6RCx3QkFBa0IsU0FBUyxlQUFlLG1CQUFtQjtBQUM3RCx1QkFBaUIsU0FBUyxlQUFlLGtCQUFrQjtBQUUzRCw0QkFBc0IsU0FBUyxlQUFlLGtCQUFrQjtBQUNoRSwyQkFBcUIsU0FBUyxlQUFlLG1CQUFtQjtBQUNoRSx5QkFBbUIsU0FBUyxlQUFlLGdCQUFnQjtBQUMzRCwwQkFBb0IsU0FBUyxlQUFlLHFCQUFxQjtBQUNqRSwwQkFBb0IsU0FBUyxlQUFlLHFCQUFxQjtBQUNqRSxzQkFBZ0IsU0FBUyxlQUFlLGFBQWE7QUFDckQseUJBQW1CLFNBQVMsZUFBZSxnQkFBZ0I7QUFDM0QseUJBQW1CLFNBQVMsZUFBZSxnQkFBZ0I7QUFDM0QseUJBQW1CLFNBQVMsZUFBZSxvQkFBb0I7QUFDL0QsMkJBQXFCLFNBQVMsZUFBZSxzQkFBc0I7QUFDbkUsMEJBQW9CLFNBQVMsZUFBZSxxQkFBcUI7QUFDakUsd0JBQWtCLFNBQVMsZUFBZSxtQkFBbUI7QUFDN0QsMEJBQW9CLFNBQVMsZUFBZSxxQkFBcUI7QUFDakUseUJBQW1CLFNBQVMsZUFBZSxvQkFBb0I7QUFDL0QsZ0NBQTBCLFNBQVMsZUFBZSw0QkFBNEI7QUFDOUUsa0NBQTRCLFNBQVMsZUFBZSw4QkFBOEI7QUFDbEYsaUNBQTJCLFNBQVMsZUFBZSw2QkFBNkI7QUFDaEYsd0JBQWtCLFNBQVMsZUFBZSxlQUFlO0FBQ3pELHlCQUFtQixTQUFTLGVBQWUsZUFBZTtBQUMxRCw2QkFBdUIsU0FBUyxlQUFlLHFCQUFxQjtBQUNwRSwrQkFBeUIsU0FBUyxlQUFlLHNCQUFzQjtBQUV2RSxvQkFBYyxTQUFTLGVBQWUsV0FBVztBQUNqRCxxQkFBZSxTQUFTLGVBQWUsZ0JBQWdCO0FBQ3ZELGtCQUFZLFNBQVMsZUFBZSxZQUFZO0FBQ2hELHFCQUFlLFNBQVMsZUFBZSxZQUFZO0FBQ25ELHFCQUFlLFNBQVMsZUFBZSxZQUFZO0FBQ25ELHdCQUFrQixTQUFTLGVBQWUsbUJBQW1CO0FBQzdELGtCQUFZLFNBQVMsZUFBZSxZQUFZO0FBQ2hELDhCQUF3QixTQUFTLGVBQWUsc0JBQXNCO0FBQ3RFLDhCQUF3QixTQUFTLGVBQWUsc0JBQXNCO0FBQ3RFLGlDQUEyQixTQUFTLGVBQWUseUJBQXlCO0FBQzVFLDhCQUF3QixTQUFTLGVBQWUsb0JBQW9CO0FBQ3BFLCtCQUF5QixTQUFTLGVBQWUscUJBQXFCO0FBRXRFLG1CQUFhLFNBQVMsZUFBZSxhQUFhO0FBQ2xELG9CQUFjLFNBQVMsZUFBZSxjQUFjO0FBQ3BELHFCQUFlLFNBQVMsZUFBZSxZQUFZO0FBQ25ELGlCQUFXLFNBQVMsZUFBZSxXQUFXO0FBRTlDLG9CQUFjLFNBQVMsZUFBZSxlQUFlO0FBQ3JELHVCQUFpQixTQUFTLGVBQWUsa0JBQWtCO0FBQzNELHNCQUFnQixTQUFTLGVBQWUsaUJBQWlCO0FBQ3pELG9CQUFjLFNBQVMsZUFBZSxjQUFjO0FBQ3BELDJCQUFxQixTQUFTLGVBQWUsc0JBQXNCO0FBQ25FLHFCQUFlLFNBQVMsZUFBZSxlQUFlO0FBRXRELFlBQU0sZ0JBQWdCLFlBQVcsd0RBQWlCLFVBQWpCLFlBQTBCLEtBQUs7QUFDaEUsWUFBTSxvQkFBb0IsT0FBTyxTQUFTLGFBQWEsSUFBSSxnQkFBZ0IsR0FBRztBQUM5RSxVQUFJLG9CQUFvQjtBQUN0QiwyQkFBbUIsV0FBVztBQUFBLE1BQ2hDO0FBRUEsYUFBTyxFQUFFLFFBQVEsSUFBSTtBQUFBLElBQ3ZCO0FBRUEsYUFBUyxTQUFlO0FBQ3RCLGlEQUFhLGlCQUFpQixTQUFTLE1BQU07QUFDM0MsWUFBSSxZQUFZLFNBQVU7QUFFMUIsUUFBQUQsYUFBWSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ2pDLFlBQUksS0FBSyxvQkFBb0I7QUFFN0Isb0JBQVksV0FBVztBQUN2QixZQUFJLGNBQWM7QUFDaEIsdUJBQWEsY0FBYztBQUFBLFFBQzdCO0FBRUEsbUJBQVcsTUFBTTtBQUNmLGNBQUksYUFBYTtBQUNmLHdCQUFZLFdBQVc7QUFBQSxVQUN6QjtBQUNBLGNBQUksY0FBYztBQUNoQix5QkFBYSxjQUFjO0FBQUEsVUFDN0I7QUFBQSxRQUNGLEdBQUcsR0FBSTtBQUFBLE1BQ1Q7QUFFQSxtREFBYyxpQkFBaUIsU0FBUyxNQUFNO0FBQzVDLHdCQUFnQixNQUFNO0FBQ3RCLGNBQU0sZUFBZTtBQUNyQixZQUFJLEtBQUssbUJBQW1CO0FBQUEsTUFDOUI7QUFFQSwrQ0FBWSxpQkFBaUIsU0FBUyxNQUFNO0FBQzFDLHNCQUFjLFVBQVU7QUFBQSxNQUMxQjtBQUVBLHFEQUFlLGlCQUFpQixTQUFTLE1BQU07QUFDN0Msc0JBQWMsYUFBYTtBQUFBLE1BQzdCO0FBRUEseURBQWlCLGlCQUFpQixTQUFTLENBQUMsVUFBVTtBQW5QMUQ7QUFvUE0sY0FBTSxRQUFRLFdBQVksTUFBTSxPQUE0QixLQUFLO0FBQ2pFLFlBQUksQ0FBQyxPQUFPLFNBQVMsS0FBSyxFQUFHO0FBQzdCLHlCQUFpQixLQUFLO0FBQ3RCLGNBQU0sb0JBQW9CLEtBQUs7QUFDL0IsY0FBTSxZQUFZLE1BQU0sYUFBYTtBQUNyQyxZQUNFLGFBQ0EsTUFBTSxNQUNOLE1BQU0sUUFBUSxNQUFNLEdBQUcsU0FBUyxLQUNoQyxNQUFNLEdBQUcsVUFBVSxVQUFVLEtBQUssR0FDbEM7QUFDQSxVQUFBQSxhQUFZLEVBQUUsTUFBTSxtQkFBbUIsT0FBTyxVQUFVLE9BQU8sT0FBTyxNQUFNLENBQUM7QUFDN0UsZ0JBQU0sR0FBRyxVQUFVLFVBQVUsS0FBSyxFQUFFLFFBQVE7QUFDNUMsaUNBQXVCO0FBQ3ZCLCtCQUFxQjtBQUFBLFFBQ3ZCO0FBQ0EsY0FBTSxRQUFPLFdBQU0sT0FBTixtQkFBVTtBQUN2QixZQUFJLE1BQU07QUFDUixnQkFBTSxZQUFZLEtBQUssSUFBSSxHQUFHLEtBQUssY0FBYyxJQUFJO0FBQ3JELGdCQUFNLE9BQU8sS0FBSyxJQUFJLFFBQVEsS0FBSyxXQUFXO0FBQzlDLGdCQUFNLFVBQVUsUUFBUTtBQUN4QixjQUFJLFdBQVcsQ0FBQyxlQUFlO0FBQzdCLDRCQUFnQjtBQUNoQixnQkFBSSxLQUFLLHNCQUFzQixFQUFFLE9BQU8sUUFBUSxLQUFLLFlBQVksQ0FBQztBQUFBLFVBQ3BFLFdBQVcsQ0FBQyxXQUFXLGVBQWU7QUFDcEMsNEJBQWdCO0FBQUEsVUFDbEI7QUFBQSxRQUNGLE9BQU87QUFDTCwwQkFBZ0I7QUFBQSxRQUNsQjtBQUNBLFlBQUksS0FBSyxxQkFBcUIsRUFBRSxNQUFNLENBQUM7QUFBQSxNQUN6QztBQUVBLHFEQUFlLGlCQUFpQixTQUFTLE1BQU07QUFDN0Msd0JBQWdCLE1BQU07QUFDdEIsY0FBTSwyQkFBMkI7QUFBQSxNQUNuQztBQUVBLCtEQUFvQixpQkFBaUIsU0FBUyxNQUFNO0FBQ2xELHdCQUFnQixTQUFTO0FBQ3pCLFFBQUFBLGFBQVksRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQUEsTUFDM0M7QUFFQSwyREFBa0IsaUJBQWlCLFNBQVMsTUFBTTtBQUNoRCx3QkFBZ0IsU0FBUztBQUN6QixjQUFNLHlCQUF5QjtBQUFBLE1BQ2pDO0FBRUEscURBQWUsaUJBQWlCLFNBQVMsTUFBTTtBQUM3QyxzQkFBYyxhQUFhO0FBQUEsTUFDN0I7QUFFQSwyREFBa0IsaUJBQWlCLFNBQVMsTUFBTTtBQUNoRCxzQkFBYyxnQkFBZ0I7QUFBQSxNQUNoQztBQUVBLDJEQUFrQixpQkFBaUIsU0FBUyxNQUFNO0FBQ2hELHdCQUFnQixTQUFTO0FBQ3pCLGNBQU0sOEJBQThCO0FBQ3BDLFlBQUksS0FBSyx1QkFBdUI7QUFBQSxNQUNsQztBQUVBLCtEQUFvQixpQkFBaUIsU0FBUyxDQUFDLFVBQVU7QUFsVDdEO0FBbVRNLGNBQU0sU0FBUyxNQUFNO0FBQ3JCLFlBQUksT0FBTyxVQUFVO0FBQ25CO0FBQUEsUUFDRjtBQUNBLGNBQU0sTUFBTSxXQUFXLE9BQU8sS0FBSztBQUNuQyxZQUFJLENBQUMsT0FBTyxTQUFTLEdBQUcsRUFBRztBQUMzQixjQUFNLFlBQVcsV0FBTSxjQUFjLGFBQXBCLFlBQWdDO0FBQ2pELGNBQU0sWUFBVyxXQUFNLGNBQWMsYUFBcEIsWUFBZ0M7QUFDakQsY0FBTSxlQUFlLE1BQU0sS0FBSyxVQUFVLFFBQVE7QUFDbEQsMkJBQW1CLFFBQVEsYUFBYSxRQUFRLENBQUM7QUFDakQsWUFBSSxtQkFBbUI7QUFDckIsNEJBQWtCLGNBQWMsR0FBRyxhQUFhLFFBQVEsQ0FBQyxDQUFDO0FBQUEsUUFDNUQ7QUFDQSxjQUFNLFFBQVEsTUFBTSxzQkFBc0I7QUFDMUMsY0FBTSxtQkFBbUIsTUFBTSxvQkFBb0I7QUFDbkQsWUFDRSxTQUNBLG9CQUNBLGlCQUFpQixTQUFTLFNBQzFCLE1BQU0sUUFBUSxNQUFNLFNBQVMsS0FDN0IsaUJBQWlCLFNBQVMsS0FDMUIsaUJBQWlCLFFBQVEsTUFBTSxVQUFVLFFBQ3pDO0FBQ0EsZ0JBQU0sWUFBWSxNQUFNLFVBQVU7QUFBQSxZQUFJLENBQUMsR0FBRyxRQUN4QyxRQUFRLGlCQUFpQixRQUFRLEVBQUUsR0FBRyxHQUFHLE9BQU8sYUFBYSxJQUFJO0FBQUEsVUFDbkU7QUFDQSxVQUFBQSxhQUFZO0FBQUEsWUFDVixNQUFNO0FBQUEsWUFDTixVQUFVLE1BQU07QUFBQSxZQUNoQixPQUFPLGlCQUFpQjtBQUFBLFlBQ3hCLE9BQU87QUFBQSxVQUNULENBQUM7QUFDRCxjQUFJLEtBQUssd0JBQXdCLEVBQUUsT0FBTyxjQUFjLE9BQU8saUJBQWlCLE1BQU0sQ0FBQztBQUFBLFFBQ3pGLE9BQU87QUFDTCxnQkFBTSxNQUFNO0FBQUEsWUFDVjtBQUFBLGNBQ0UsT0FBTztBQUFBLGNBQ1AsWUFBWSxNQUFNLGNBQWM7QUFBQSxZQUNsQztBQUFBLFlBQ0EsTUFBTTtBQUFBLFlBQ04sTUFBTTtBQUFBLFVBQ1I7QUFDQSxnQkFBTSxnQkFBZ0I7QUFDdEIsNEJBQWtCLEdBQUc7QUFDckIsY0FBSSxLQUFLLHdCQUF3QixFQUFFLE9BQU8sY0FBYyxPQUFPLEdBQUcsQ0FBQztBQUFBLFFBQ3JFO0FBQ0EsY0FBTSxzQkFBc0IsWUFBWTtBQUFBLE1BQzFDO0FBRUEsNkRBQW1CLGlCQUFpQixTQUFTLENBQUMsVUFBVTtBQXBXNUQ7QUFxV00sY0FBTSxNQUFNLFdBQVksTUFBTSxPQUE0QixLQUFLO0FBQy9ELFlBQUksQ0FBQyxPQUFPLFNBQVMsR0FBRyxFQUFHO0FBQzNCLGNBQU0sV0FBVSxXQUFNLGNBQWMsWUFBcEIsWUFBK0I7QUFDL0MsY0FBTSxlQUFlLEtBQUssSUFBSSxTQUFTLEdBQUc7QUFDMUMsMEJBQWtCLFFBQVEsYUFBYSxRQUFRLENBQUM7QUFDaEQsWUFBSSxrQkFBa0I7QUFDcEIsMkJBQWlCLGNBQWMsR0FBRyxhQUFhLFFBQVEsQ0FBQyxDQUFDO0FBQUEsUUFDM0Q7QUFDQSxrQ0FBMEIsRUFBRSxZQUFZLGFBQWEsQ0FBQztBQUN0RCxZQUFJLEtBQUssdUJBQXVCLEVBQUUsT0FBTyxhQUFhLENBQUM7QUFBQSxNQUN6RDtBQUVBLDZFQUEyQixpQkFBaUIsU0FBUyxDQUFDLFVBQVU7QUFDOUQsY0FBTSxNQUFNLFdBQVksTUFBTSxPQUE0QixLQUFLO0FBQy9ELFlBQUksQ0FBQyxPQUFPLFNBQVMsR0FBRyxFQUFHO0FBQzNCLGNBQU0sZUFBZSxLQUFLLElBQUksSUFBSSxLQUFLLElBQUksS0FBSyxHQUFHLENBQUM7QUFDcEQsa0NBQTBCLFFBQVEsYUFBYSxRQUFRLENBQUM7QUFDeEQsWUFBSSwwQkFBMEI7QUFDNUIsbUNBQXlCLGNBQWMsR0FBRyxhQUFhLFFBQVEsQ0FBQyxDQUFDO0FBQUEsUUFDbkU7QUFDQSxjQUFNLG9CQUFvQjtBQUFBLE1BQzVCO0FBRUEseURBQWlCLGlCQUFpQixTQUFTLE1BQU07QUE1WHJEO0FBNlhNLFlBQUksZ0JBQWdCLFNBQVU7QUFHOUIsY0FBTSxVQUFVLE1BQU07QUFDdEIsWUFBSSxTQUFTO0FBRWIsWUFBSSxNQUFNLEtBQUs7QUFFYixnQkFBTSxhQUFhLE1BQU0sSUFBSSxNQUFNLE9BQU8sT0FBSyxFQUFFLFNBQVMsV0FBVyxFQUFFLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFDN0YscUJBQVcsUUFBUSxZQUFZO0FBQzdCLGtCQUFNLGNBQWMsV0FBUyxVQUFLLEdBQUcsTUFBTSxPQUFPLE1BQXJCLG1CQUF5QixPQUFNLElBQUk7QUFDaEUsZ0JBQUksS0FBSyxJQUFJLGNBQWMsT0FBTyxJQUFJLEdBQUc7QUFDdkMsdUJBQVMsS0FBSztBQUNkO0FBQUEsWUFDRjtBQUFBLFVBQ0Y7QUFHQSxjQUFJLFdBQVcsS0FBSztBQUNsQixxQkFBUztBQUFBLFVBQ1gsV0FBVyxXQUFXLEtBQUs7QUFDekIscUJBQVM7QUFBQSxVQUNYLFdBQVcsV0FBVyxLQUFLO0FBQ3pCLHFCQUFTO0FBQUEsVUFDWCxPQUFPO0FBQ0wscUJBQVM7QUFBQSxVQUNYO0FBQUEsUUFDRjtBQUVBLFFBQUFBLGFBQVksRUFBRSxNQUFNLGFBQWEsU0FBUyxPQUFPLENBQUM7QUFDbEQsWUFBSSxLQUFLLDBCQUEwQixFQUFFLFFBQVEsY0FBYyxRQUFRLENBQUM7QUFBQSxNQUN0RTtBQUVBLG1EQUFjLGlCQUFpQixTQUFTLE1BQU0sTUFBTSxrQkFBa0IsRUFBRTtBQUN4RSxtREFBYyxpQkFBaUIsU0FBUyxNQUFNLE1BQU0sa0JBQWtCLENBQUM7QUFFdkUseURBQWlCLGlCQUFpQixTQUFTLE1BQU07QUFDL0MsK0NBQVcsVUFBVSxPQUFPO0FBQUEsTUFDOUI7QUFFQSxxRUFBdUIsaUJBQWlCLFNBQVMsTUFBTTtBQXJhM0Q7QUFzYU0sY0FBTSxRQUFRLE1BQU0sc0JBQXNCO0FBQzFDLFlBQUksQ0FBQyxNQUFPO0FBQ1osY0FBTSxZQUFXLFlBQU8saUJBQWdCLFdBQU0sU0FBTixZQUFjLEVBQUUsTUFBdkMsWUFBNEM7QUFDN0QsY0FBTSxVQUFVLFNBQVMsS0FBSztBQUM5QixZQUFJLFlBQVksTUFBTSxLQUFNO0FBQzVCLFFBQUFBLGFBQVk7QUFBQSxVQUNWLE1BQU07QUFBQSxVQUNOLFVBQVUsTUFBTTtBQUFBLFVBQ2hCLE1BQU07QUFBQSxRQUNSLENBQUM7QUFDRCxjQUFNLE9BQU87QUFDYixtQ0FBMkI7QUFBQSxNQUM3QjtBQUVBLHFFQUF1QixpQkFBaUIsU0FBUyxNQUFNO0FBQ3JELGNBQU0sUUFBUSxNQUFNLHNCQUFzQjtBQUMxQyxZQUFJLENBQUMsTUFBTztBQUNaLFFBQUFBLGFBQVksRUFBRSxNQUFNLHdCQUF3QixVQUFVLE1BQU0sR0FBRyxDQUFDO0FBQUEsTUFDbEU7QUFFQSwyRUFBMEIsaUJBQWlCLFNBQVMsTUFBTTtBQUN4RCxjQUFNLFFBQVEsTUFBTSxzQkFBc0I7QUFDMUMsWUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLFFBQVEsTUFBTSxTQUFTLEtBQUssTUFBTSxVQUFVLFdBQVcsR0FBRztBQUM3RTtBQUFBLFFBQ0Y7QUFDQSxRQUFBQSxhQUFZLEVBQUUsTUFBTSwyQkFBMkIsVUFBVSxNQUFNLEdBQUcsQ0FBQztBQUNuRSxjQUFNLFlBQVksQ0FBQztBQUNuQixjQUFNLG9CQUFvQixJQUFJO0FBQzlCLG1DQUEyQjtBQUFBLE1BQzdCO0FBRUEsK0NBQVksaUJBQWlCLFNBQVMsTUFBTTtBQUMxQyx1QkFBZSxJQUFJO0FBQUEsTUFDckI7QUFFQSxtREFBYyxpQkFBaUIsU0FBUyxNQUFNO0FBQzVDLHVCQUFlLEtBQUs7QUFBQSxNQUN0QjtBQUVBLFVBQUksR0FBRyxvQkFBb0IsTUFBTTtBQUMvQiwrQkFBdUI7QUFBQSxNQUN6QixDQUFDO0FBQ0QsVUFBSSxHQUFHLHNCQUFzQixNQUFNO0FBQ2pDLCtCQUF1QjtBQUN2Qiw2QkFBcUI7QUFBQSxNQUN2QixDQUFDO0FBQ0QsVUFBSSxHQUFHLHdCQUF3QixNQUFNO0FBQ25DLCtCQUF1QjtBQUN2Qiw2QkFBcUI7QUFBQSxNQUN2QixDQUFDO0FBQ0QsVUFBSSxHQUFHLHlCQUF5QixNQUFNO0FBQ3BDLCtCQUF1QjtBQUN2Qiw2QkFBcUI7QUFBQSxNQUN2QixDQUFDO0FBQ0QsVUFBSSxHQUFHLDRCQUE0QixNQUFNO0FBQ3ZDLGtDQUEwQjtBQUMxQixtQ0FBMkI7QUFBQSxNQUM3QixDQUFDO0FBQ0QsVUFBSSxHQUFHLHlCQUF5QixNQUFNO0FBQ3BDLG1DQUEyQjtBQUFBLE1BQzdCLENBQUM7QUFDRCxVQUFJLEdBQUcsMkJBQTJCLE1BQU07QUFDdEMsbUNBQTJCO0FBQUEsTUFDN0IsQ0FBQztBQUNELFVBQUksR0FBRyw4QkFBOEIsTUFBTTtBQUN6QyxtQ0FBMkI7QUFBQSxNQUM3QixDQUFDO0FBQUEsSUFDSDtBQUVBLGFBQVMsWUFBc0M7QUFDN0MsYUFBTztBQUFBLElBQ1Q7QUFFQSxhQUFTLGFBQThDO0FBQ3JELGFBQU87QUFBQSxJQUNUO0FBRUEsYUFBUyxpQkFBaUIsT0FBcUI7QUFDN0MsVUFBSSxDQUFDLGVBQWdCO0FBQ3JCLHFCQUFlLGNBQWMsR0FBRyxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDbEQ7QUFFQSxhQUFTLGtCQUNQLE9BQ0EsT0FDQSxRQUNlO0FBQ2YsVUFBSSxDQUFDLE1BQU8sUUFBTztBQUNuQixZQUFNLE9BQU8sS0FBSyxJQUFJLFdBQVcsTUFBTSxJQUFJLENBQUMsS0FBSztBQUNqRCxZQUFNLGFBQWEsU0FBUyxJQUFJO0FBQ2hDLFlBQU0sTUFBTSxPQUFPLFNBQVMsV0FBVyxNQUFNLEdBQUcsQ0FBQyxJQUFJLFdBQVcsTUFBTSxHQUFHLElBQUk7QUFDN0UsWUFBTSxNQUFNLE9BQU8sU0FBUyxXQUFXLE1BQU0sR0FBRyxDQUFDLElBQUksV0FBVyxNQUFNLEdBQUcsSUFBSTtBQUM3RSxZQUFNLFVBQVUsV0FBVyxNQUFNLEtBQUssS0FBSztBQUMzQyxVQUFJLE9BQU8sVUFBVSxRQUFRLE9BQU87QUFDcEMsVUFBSSxPQUFPLFNBQVMsR0FBRyxFQUFHLFFBQU8sS0FBSyxJQUFJLEtBQUssSUFBSTtBQUNuRCxVQUFJLE9BQU8sU0FBUyxHQUFHLEVBQUcsUUFBTyxLQUFLLElBQUksS0FBSyxJQUFJO0FBQ25ELFVBQUksS0FBSyxJQUFJLE9BQU8sT0FBTyxJQUFJLE1BQU07QUFDbkMsZUFBTztBQUFBLE1BQ1Q7QUFDQSxZQUFNLFFBQVEsT0FBTyxJQUFJO0FBQ3pCLFlBQU0sY0FBYyxJQUFJLE1BQU0sU0FBUyxFQUFFLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFDekQsYUFBTztBQUFBLElBQ1Q7QUFFQSxhQUFTLGdCQUFnQixPQUFlLFFBQXVCO0FBQzdELHdCQUFrQixpQkFBaUIsT0FBTyxNQUFNO0FBQUEsSUFDbEQ7QUFFQSxhQUFTLGtCQUFrQixPQUFlLFFBQXVCO0FBQy9ELHdCQUFrQixtQkFBbUIsT0FBTyxNQUFNO0FBQUEsSUFDcEQ7QUFFQSxhQUFTLG1CQUFtQixPQUFlLFFBQXVCO0FBQ2hFLFVBQUksc0JBQXNCLENBQUMsbUJBQW1CLFVBQVU7QUFDdEQsMEJBQWtCLG9CQUFvQixPQUFPLE1BQU07QUFBQSxNQUNyRDtBQUFBLElBQ0Y7QUFFQSxhQUFTLG1CQUFtQixPQUFxQjtBQUMvQyxVQUFJLENBQUMsZ0JBQWlCO0FBQ3RCLHNCQUFnQixRQUFRLE1BQU0sUUFBUSxDQUFDO0FBQ3ZDLHVCQUFpQixLQUFLO0FBQUEsSUFDeEI7QUFFQSxhQUFTLDZCQUFtQztBQUMxQyxZQUFNLFNBQVMsTUFBTSxRQUFRLE1BQU0sYUFBYSxJQUFJLE1BQU0sZ0JBQWdCLENBQUM7QUFDM0UsWUFBTSxjQUFjLE1BQU0sc0JBQXNCO0FBQ2hELFVBQUksdUJBQXVCO0FBQ3pCLFlBQUksQ0FBQyxhQUFhO0FBQ2hCLGdDQUFzQixjQUFjLE9BQU8sV0FBVyxJQUFJLGFBQWE7QUFBQSxRQUN6RSxPQUFPO0FBQ0wsZ0NBQXNCLGNBQWMsWUFBWSxRQUFRO0FBQUEsUUFDMUQ7QUFBQSxNQUNGO0FBRUEsVUFBSSx3QkFBd0I7QUFDMUIsY0FBTSxRQUNKLGVBQWUsTUFBTSxRQUFRLFlBQVksU0FBUyxJQUFJLFlBQVksVUFBVSxTQUFTO0FBQ3ZGLCtCQUF1QixjQUFjLEdBQUcsS0FBSztBQUFBLE1BQy9DO0FBRUEsVUFBSSx1QkFBdUI7QUFDekIsOEJBQXNCLFdBQVcsT0FBTyxVQUFVO0FBQUEsTUFDcEQ7QUFDQSxVQUFJLHVCQUF1QjtBQUN6Qiw4QkFBc0IsV0FBVyxDQUFDO0FBQUEsTUFDcEM7QUFDQSxVQUFJLDBCQUEwQjtBQUM1QixjQUFNLFFBQ0osZUFBZSxNQUFNLFFBQVEsWUFBWSxTQUFTLElBQUksWUFBWSxVQUFVLFNBQVM7QUFDdkYsaUNBQXlCLFdBQVcsQ0FBQyxlQUFlLFVBQVU7QUFBQSxNQUNoRTtBQUNBLFVBQUksY0FBYztBQUNoQixxQkFBYSxXQUFXLE9BQU8sVUFBVTtBQUFBLE1BQzNDO0FBQ0EsVUFBSSxjQUFjO0FBQ2hCLHFCQUFhLFdBQVcsT0FBTyxVQUFVO0FBQUEsTUFDM0M7QUFFQSxxQ0FBK0I7QUFDL0IsZ0NBQTBCO0FBQUEsSUFDNUI7QUFFQSxhQUFTLHlCQUErQjtBQUN0QyxZQUFNLHlCQUF5QjtBQUMvQixZQUFNLGNBQWMsTUFBTSxzQkFBc0I7QUFDaEQsWUFBTSxhQUFhLE1BQU0sb0JBQW9CO0FBQzdDLFlBQU0sb0JBQ0osQ0FBQyxDQUFDLGVBQ0YsTUFBTSxRQUFRLFlBQVksU0FBUyxLQUNuQyxDQUFDLENBQUMsY0FDRixXQUFXLFNBQVMsS0FDcEIsV0FBVyxRQUFRLFlBQVksVUFBVTtBQUMzQyxVQUFJLENBQUMsbUJBQW1CO0FBQ3RCLGNBQU0sb0JBQW9CLElBQUk7QUFBQSxNQUNoQztBQUNBLFlBQU0sTUFBTSxNQUFNO0FBQ2xCLHFCQUFlLEdBQUc7QUFDbEIsaUNBQTJCO0FBQzNCLGdDQUEwQjtBQUFBLElBQzVCO0FBRUEsYUFBUyxlQUFlLEtBQWtEO0FBNWxCNUU7QUE2bEJJLFVBQUksbUJBQW1CO0FBQ3JCLGNBQU0sV0FBVSxXQUFNLGNBQWMsWUFBcEIsWUFBK0I7QUFDL0MsY0FBTSxVQUFVLEtBQUssSUFBSSxLQUFNLEtBQUssTUFBTSxJQUFJLGFBQWEsT0FBTyxHQUFHLElBQUksR0FBRztBQUM1RSwwQkFBa0IsTUFBTSxPQUFPLE9BQU87QUFDdEMsMEJBQWtCLE1BQU0sT0FBTyxPQUFPO0FBQ3RDLDBCQUFrQixRQUFRLElBQUksV0FBVyxRQUFRLENBQUM7QUFBQSxNQUNwRDtBQUNBLFVBQUksa0JBQWtCO0FBQ3BCLHlCQUFpQixjQUFjLElBQUksV0FBVyxRQUFRLENBQUM7QUFBQSxNQUN6RDtBQUNBLGlDQUEyQjtBQUMzQix3QkFBa0I7QUFBQSxJQUNwQjtBQUVBLGFBQVMsMEJBQ1AsWUFBNkMsQ0FBQyxHQUN4QztBQTdtQlY7QUE4bUJJLFlBQU0sVUFBVSxNQUFNO0FBQ3RCLFlBQU0sTUFBTTtBQUFBLFFBQ1Y7QUFBQSxVQUNFLE9BQU8sUUFBUTtBQUFBLFVBQ2YsYUFBWSxlQUFVLGVBQVYsWUFBd0IsUUFBUTtBQUFBLFFBQzlDO0FBQUEsUUFDQTtBQUFBLFFBQ0EsTUFBTTtBQUFBLE1BQ1I7QUFDQSxZQUFNLGdCQUFnQjtBQUN0QixxQkFBZSxHQUFHO0FBQ2xCLFlBQU0sT0FBTztBQUNiLFlBQU0sWUFDSixDQUFDLFFBQVEsS0FBSyxNQUFLLFVBQUssZUFBTCxZQUFtQixLQUFLLElBQUksVUFBVSxJQUFJO0FBQy9ELFVBQUksV0FBVztBQUNiLDBCQUFrQixHQUFHO0FBQUEsTUFDdkI7QUFDQSxpQ0FBMkI7QUFBQSxJQUM3QjtBQUVBLGFBQVMsa0JBQWtCLEtBQWtEO0FBQzNFLDhCQUF3QjtBQUFBLFFBQ3RCLE9BQU8sSUFBSTtBQUFBLFFBQ1gsWUFBWSxJQUFJO0FBQUEsTUFDbEI7QUFDQSxNQUFBQSxhQUFZO0FBQUEsUUFDVixNQUFNO0FBQUEsUUFDTixlQUFlLElBQUk7QUFBQSxRQUNuQixjQUFjLElBQUk7QUFBQSxNQUNwQixDQUFDO0FBQUEsSUFDSDtBQUVBLGFBQVMseUJBQStCO0FBQ3RDLFVBQUksQ0FBQyx1QkFBdUIsQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlO0FBQzlFO0FBQUEsTUFDRjtBQUNBLFlBQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxRQUFRLE1BQU0sR0FBRyxTQUFTLElBQUksTUFBTSxHQUFHLFlBQVksQ0FBQztBQUNsRixZQUFNLFlBQVksTUFBTSxhQUFhO0FBQ3JDLFlBQU0sb0JBQ0osY0FBYyxRQUFRLFVBQVUsU0FBUyxLQUFLLFVBQVUsUUFBUSxJQUFJO0FBQ3RFLFlBQU0sZ0JBQWdCLFFBQVEsaUJBQWlCO0FBRS9DLDBCQUFvQixNQUFNLFVBQVU7QUFDcEMsMEJBQW9CLE1BQU0sVUFBVSxnQkFBZ0IsTUFBTTtBQUUxRCxVQUFJLENBQUMsTUFBTSxNQUFNLENBQUMscUJBQXFCLENBQUMsV0FBVztBQUNqRCxxQkFBYSxjQUFjO0FBQzNCLHVCQUFlLGNBQWM7QUFDN0Isc0JBQWMsV0FBVztBQUN6QixZQUFJLGVBQWU7QUFDakIsNkJBQW1CLE1BQU0sb0JBQW9CLENBQUM7QUFBQSxRQUNoRDtBQUNBO0FBQUEsTUFDRjtBQUVBLFlBQU0sS0FBSyxJQUFJLFVBQVUsS0FBSztBQUM5QixZQUFNLFFBQ0osTUFBTSxPQUFPLEdBQUcsVUFBVSxXQUFXLEdBQUcsUUFBUSxNQUFNLG9CQUFvQjtBQUM1RSxVQUNFLGlCQUNBLG1CQUNBLEtBQUssSUFBSSxXQUFXLGdCQUFnQixLQUFLLElBQUksS0FBSyxJQUFJLE1BQ3REO0FBQ0EsMkJBQW1CLEtBQUs7QUFBQSxNQUMxQixPQUFPO0FBQ0wseUJBQWlCLEtBQUs7QUFBQSxNQUN4QjtBQUNBLFlBQU0sZUFBZSxVQUFVLFFBQVE7QUFDdkMsbUJBQWEsY0FBYyxHQUFHLFlBQVk7QUFDMUMscUJBQWUsY0FBYyxHQUFHLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFDaEQsb0JBQWMsV0FBVyxDQUFDO0FBQUEsSUFDNUI7QUFFQSxhQUFTLDRCQUFrQztBQUN6QyxZQUFNLFFBQVEsTUFBTSxzQkFBc0I7QUFDMUMsWUFBTSxRQUFRLFNBQVMsTUFBTSxRQUFRLE1BQU0sU0FBUyxJQUFJLE1BQU0sVUFBVSxTQUFTO0FBQ2pGLFlBQU0sYUFBYSxNQUFNLG9CQUFvQjtBQUM3QyxZQUFNLHNCQUNKLGVBQWUsUUFDZixlQUFlLFVBQ2YsV0FBVyxTQUFTLGNBQ3BCLFdBQVcsU0FBUyxLQUNwQixXQUFXLFFBQVE7QUFDckIsVUFBSSxrQkFBa0I7QUFDcEIseUJBQWlCLFdBQVcsQ0FBQztBQUFBLE1BQy9CO0FBQ0EsaUNBQTJCO0FBQUEsSUFDN0I7QUFFQSxhQUFTLDZCQUFtQztBQXZzQjlDO0FBd3NCSSxVQUFJLENBQUMsc0JBQXNCLENBQUMsbUJBQW1CO0FBQzdDO0FBQUEsTUFDRjtBQUVBLFlBQU0sWUFBVyxXQUFNLGNBQWMsYUFBcEIsWUFBZ0M7QUFDakQsWUFBTSxZQUFXLFdBQU0sY0FBYyxhQUFwQixZQUFnQztBQUNqRCx5QkFBbUIsTUFBTSxPQUFPLFFBQVE7QUFDeEMseUJBQW1CLE1BQU0sT0FBTyxRQUFRO0FBRXhDLFlBQU0sUUFBUSxNQUFNLHNCQUFzQjtBQUMxQyxZQUFNLGFBQWEsTUFBTSxvQkFBb0I7QUFDN0MsWUFBTSxZQUFZLFNBQVMsTUFBTSxRQUFRLE1BQU0sU0FBUyxJQUFJLE1BQU0sWUFBWTtBQUM5RSxVQUFJLGdCQUErQjtBQUNuQyxVQUFJLGVBQTBDO0FBRTlDLFVBQ0UsYUFDQSxjQUNBLFdBQVcsU0FBUyxLQUNwQixXQUFXLFFBQVEsVUFBVSxRQUM3QjtBQUNBLGNBQU0sS0FBSyxVQUFVLFdBQVcsS0FBSztBQUNyQyxjQUFNLFFBQ0osT0FBTyxHQUFHLFVBQVUsWUFBWSxHQUFHLFFBQVEsSUFDdkMsR0FBRyxRQUNILE1BQU0sMEJBQTBCO0FBQ3RDLHdCQUFnQixNQUFNLE9BQU8sVUFBVSxRQUFRO0FBQy9DLHVCQUFlLFdBQVc7QUFBQSxNQUM1QjtBQUVBLFlBQU0saUJBQWlCLGlCQUFpQjtBQUN4QyxVQUFJO0FBQ0osVUFBSSxrQkFBa0IsTUFBTTtBQUMxQixzQkFBYztBQUFBLE1BQ2hCLE9BQU87QUFDTCxjQUFNLFdBQVcsV0FBVyxtQkFBbUIsS0FBSztBQUNwRCxjQUFNLFdBQVcsTUFBTSwwQkFBMEI7QUFDakQsY0FBTSxjQUFjLE9BQU8sU0FBUyxRQUFRLElBQUksV0FBVztBQUMzRCxzQkFBYyxNQUFNLGFBQWEsVUFBVSxRQUFRO0FBQUEsTUFDckQ7QUFFQSx5QkFBbUIsV0FBVztBQUM5Qix5QkFBbUIsUUFBUSxZQUFZLFFBQVEsQ0FBQztBQUNoRCx3QkFBa0IsY0FBYyxHQUFHLFlBQVksUUFBUSxDQUFDLENBQUM7QUFFekQsVUFBSSxDQUFDLGdCQUFnQjtBQUNuQixjQUFNLHNCQUFzQixXQUFXO0FBQUEsTUFDekM7QUFBQSxJQUNGO0FBRUEsYUFBUyxnQkFBZ0IsU0FBbUM7QUFDMUQsWUFBTSxPQUFPLFlBQVksWUFBWSxZQUFZO0FBQ2pELFVBQUksUUFBUSxpQkFBaUIsTUFBTTtBQUNqQztBQUFBLE1BQ0Y7QUFDQSxjQUFRLGVBQWU7QUFFdkIsVUFBSSxTQUFTLFFBQVE7QUFDbkIsY0FBTSxnQkFBZ0IsUUFBUSxhQUFhLFdBQVcsZ0JBQWdCO0FBQ3RFLFlBQUksUUFBUSxlQUFlLGVBQWU7QUFDeEMsa0JBQVEsYUFBYTtBQUFBLFFBQ3ZCO0FBQUEsTUFDRixPQUFPO0FBQ0wsY0FBTSxtQkFDSixRQUFRLGdCQUFnQixXQUFXLG1CQUFtQjtBQUN4RCxZQUFJLFFBQVEsZUFBZSxrQkFBa0I7QUFDM0Msa0JBQVEsYUFBYTtBQUFBLFFBQ3ZCO0FBQUEsTUFDRjtBQUVBLFVBQUksS0FBSyxtQkFBbUIsRUFBRSxTQUFTLEtBQUssQ0FBQztBQUM3Qyw4QkFBd0I7QUFDeEIsNkJBQXVCO0FBQ3ZCLGdDQUEwQjtBQUFBLElBQzVCO0FBRUEsYUFBUyxjQUFjLE1BQXdCO0FBQzdDLFVBQUksUUFBUSxlQUFlLE1BQU07QUFDL0I7QUFBQSxNQUNGO0FBRUEsY0FBUSxhQUFhO0FBRXJCLFVBQUksU0FBUyxZQUFZO0FBQ3ZCLGdCQUFRLFdBQVc7QUFDbkIsZ0JBQVEsY0FBYztBQUN0Qix3QkFBZ0IsTUFBTTtBQUN0QixZQUFJLEtBQUssb0JBQW9CLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFBQSxNQUM5QyxXQUFXLFNBQVMsZUFBZTtBQUNqQyxnQkFBUSxXQUFXO0FBQ25CLGdCQUFRLGNBQWM7QUFDdEIsd0JBQWdCLE1BQU07QUFDdEIsWUFBSSxLQUFLLG9CQUFvQixFQUFFLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDakQsV0FBVyxTQUFTLGVBQWU7QUFDakMsZ0JBQVEsV0FBVztBQUNuQixnQkFBUSxjQUFjO0FBQ3RCLHdCQUFnQixTQUFTO0FBQ3pCLGNBQU0sb0JBQW9CLElBQUk7QUFDOUIsWUFBSSxLQUFLLHVCQUF1QixFQUFFLE1BQU0sTUFBTSxDQUFDO0FBQUEsTUFDakQsV0FBVyxTQUFTLGtCQUFrQjtBQUNwQyxnQkFBUSxXQUFXO0FBQ25CLGdCQUFRLGNBQWM7QUFDdEIsd0JBQWdCLFNBQVM7QUFDekIsWUFBSSxLQUFLLHVCQUF1QixFQUFFLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDcEQ7QUFFQSw4QkFBd0I7QUFBQSxJQUMxQjtBQUVBLGFBQVMsZUFBZSxLQUErQixRQUF1QjtBQUM1RSxVQUFJLENBQUMsSUFBSztBQUNWLFVBQUksUUFBUTtBQUNWLFlBQUksUUFBUSxRQUFRO0FBQ3BCLFlBQUksYUFBYSxnQkFBZ0IsTUFBTTtBQUFBLE1BQ3pDLE9BQU87QUFDTCxlQUFPLElBQUksUUFBUTtBQUNuQixZQUFJLGFBQWEsZ0JBQWdCLE9BQU87QUFBQSxNQUMxQztBQUFBLElBQ0Y7QUFFQSxhQUFTLDBCQUFnQztBQUN2QyxxQkFBZSxZQUFZLFFBQVEsZUFBZSxVQUFVO0FBQzVELHFCQUFlLGVBQWUsUUFBUSxlQUFlLGFBQWE7QUFDbEUscUJBQWUsZUFBZSxRQUFRLGVBQWUsYUFBYTtBQUNsRSxxQkFBZSxrQkFBa0IsUUFBUSxlQUFlLGdCQUFnQjtBQUV4RSxVQUFJLGtCQUFrQjtBQUNwQix5QkFBaUIsVUFBVSxPQUFPLFVBQVUsUUFBUSxpQkFBaUIsTUFBTTtBQUFBLE1BQzdFO0FBQ0EsVUFBSSxxQkFBcUI7QUFDdkIsNEJBQW9CLFVBQVUsT0FBTyxVQUFVLFFBQVEsaUJBQWlCLFNBQVM7QUFBQSxNQUNuRjtBQUFBLElBQ0Y7QUFFQSxhQUFTLGVBQWUsTUFBcUI7QUFDM0MsY0FBUSxjQUFjO0FBQ3RCLHdCQUFrQjtBQUNsQixVQUFJLEtBQUssdUJBQXVCLEVBQUUsU0FBUyxRQUFRLFlBQVksQ0FBQztBQUFBLElBQ2xFO0FBRUEsYUFBUyxvQkFBMEI7QUFDakMsVUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFVO0FBQy9CLGtCQUFZLFVBQVUsT0FBTyxXQUFXLFFBQVEsV0FBVztBQUMzRCxlQUFTLGNBQWM7QUFBQSxJQUN6QjtBQUVBLGFBQVMsaUNBQXVDO0FBQzlDLFVBQUksQ0FBQyxvQkFBb0IsQ0FBQyxxQkFBcUIsQ0FBQyxrQkFBbUI7QUFDbkUsWUFBTSxRQUFRLE1BQU0sc0JBQXNCO0FBQzFDLFlBQU0sUUFBUSxTQUFTLE1BQU0sUUFBUSxNQUFNLFNBQVMsSUFBSSxNQUFNLFVBQVUsU0FBUztBQUNqRixZQUFNLFlBQVksTUFBTSw0QkFBNEI7QUFDcEQsWUFBTSxjQUFjLFlBQVk7QUFDaEMsWUFBTSxnQkFBZ0IsQ0FBQyxTQUFTLFVBQVUsS0FBSztBQUMvQyx1QkFBaUIsV0FBVztBQUU1QixZQUFNLGlCQUNKO0FBQ0YsVUFBSSxpQkFBaUI7QUFFckIsVUFBSSxDQUFDLE9BQU87QUFDVix5QkFBaUI7QUFBQSxNQUNuQixXQUFXLGFBQWE7QUFDdEIseUJBQWlCLEdBQUcsVUFBVSxRQUFRLENBQUMsQ0FBQztBQUFBLE1BQzFDLFdBQVcsTUFBTSxNQUFNO0FBQ3JCLGNBQU0sU0FBUyxNQUFNLFFBQVEsTUFBTSxhQUFhLElBQUksTUFBTSxnQkFBZ0IsQ0FBQztBQUMzRSxjQUFNLGFBQWEsT0FBTyxVQUFVLENBQUMsTUFBTSxFQUFFLE9BQU8sTUFBTSxFQUFFLElBQUk7QUFDaEUseUJBQWlCLCtCQUErQixNQUFNLElBQUksdUNBQXVDLFVBQVU7QUFBQSxNQUM3RyxPQUFPO0FBQ0wseUJBQWlCO0FBQUEsTUFDbkI7QUFFQSxVQUFJLDhCQUE4QixnQkFBZ0I7QUFDaEQsMEJBQWtCLFlBQVk7QUFDOUIsb0NBQTRCO0FBQUEsTUFDOUI7QUFFQSxVQUFJLDhCQUE4QixnQkFBZ0I7QUFDaEQsMEJBQWtCLFlBQVk7QUFDOUIsb0NBQTRCO0FBQUEsTUFDOUI7QUFBQSxJQUNGO0FBRUEsYUFBUyw0QkFBa0M7QUFDekMsVUFBSSxDQUFDLGlCQUFrQjtBQUV2QixVQUFJLFFBQVE7QUFDWixVQUFJLE1BQU0sYUFBYSxNQUFNLFVBQVUsT0FBTztBQUM1QyxtQkFBVyxRQUFRLE1BQU0sVUFBVSxPQUFPO0FBQ3hDLGNBQUksS0FBSyxTQUFTLFdBQVc7QUFDM0IscUJBQVMsS0FBSztBQUFBLFVBQ2hCO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFFQSx1QkFBaUIsY0FBYyxNQUFNLFNBQVM7QUFBQSxJQUNoRDtBQUVBLGFBQVMsbUJBQXlCO0FBQ2hDLFVBQUksQ0FBQyx3QkFBd0IsQ0FBQyx1QkFBd0I7QUFHdEQsVUFBSSxrQkFBa0I7QUFDdEIsVUFBSSxnQkFBZ0I7QUFFcEIsVUFBSSxNQUFNLE9BQU8sTUFBTSxJQUFJLE9BQU87QUFDaEMsbUJBQVcsUUFBUSxNQUFNLElBQUksT0FBTztBQUNsQyxjQUFJLEtBQUssU0FBUyxXQUFXLEtBQUssV0FBVyxlQUFlO0FBQzFELDhCQUFrQjtBQUNsQiw0QkFBZ0IsS0FBSztBQUNyQjtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUVBLFVBQUksbUJBQW1CLGdCQUFnQixHQUFHO0FBQ3hDLDZCQUFxQixNQUFNLFVBQVU7QUFDckMsK0JBQXVCLGNBQWMsS0FBSyxLQUFLLGFBQWEsRUFBRSxTQUFTO0FBQUEsTUFDekUsT0FBTztBQUNMLDZCQUFxQixNQUFNLFVBQVU7QUFBQSxNQUN2QztBQUFBLElBQ0Y7QUFFQSxhQUFTLHlCQUErQjtBQXQ2QjFDO0FBdTZCSSxZQUFNLFFBQU8sV0FBTSxjQUFOLFlBQW1CLENBQUM7QUFDakMsYUFBTyxvQkFBb0IsSUFBSTtBQUUvQixVQUFJLFFBQVE7QUFDVixZQUFJLE1BQU0sTUFBTSxPQUFPLFNBQVMsTUFBTSxHQUFHLEVBQUUsR0FBRztBQUM1QyxpQkFBTyxjQUFjLE9BQU8sTUFBTSxHQUFHLEVBQUUsRUFBRSxTQUFTO0FBQUEsUUFDcEQsT0FBTztBQUNMLGlCQUFPLGNBQWM7QUFBQSxRQUN2QjtBQUFBLE1BQ0Y7QUFDQSxVQUFJLFdBQVc7QUFDYixZQUFJLE1BQU0sTUFBTSxPQUFPLFNBQVMsTUFBTSxHQUFHLEtBQUssR0FBRztBQUMvQyxvQkFBVSxjQUFjLE9BQU8sTUFBTSxHQUFHLEtBQUssRUFBRSxTQUFTO0FBQUEsUUFDMUQsT0FBTztBQUNMLG9CQUFVLGNBQWM7QUFBQSxRQUMxQjtBQUFBLE1BQ0Y7QUFFQSxvQkFBYztBQUNkLDJCQUFxQjtBQUNyQix3QkFBa0I7QUFDbEIseUJBQW1CO0FBQUEsSUFDckI7QUFFQSxhQUFTLGdCQUFzQjtBQS83QmpDO0FBZzhCSSxZQUFNLFFBQU8sV0FBTSxPQUFOLG1CQUFVO0FBQ3ZCLFVBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLGVBQWU7QUFDM0MseUJBQWlCO0FBQ2pCO0FBQUEsTUFDRjtBQUVBLFlBQU0sVUFBVyxLQUFLLFFBQVEsS0FBSyxNQUFPO0FBQzFDLGtCQUFZLE1BQU0sUUFBUSxHQUFHLE9BQU87QUFFcEMsb0JBQWMsY0FBYyxRQUFRLEtBQUssTUFBTSxLQUFLLEtBQUssQ0FBQztBQUUxRCxrQkFBWSxVQUFVLE9BQU8sUUFBUSxVQUFVO0FBQy9DLFVBQUksS0FBSyxTQUFTLEtBQUssWUFBWTtBQUNqQyxvQkFBWSxVQUFVLElBQUksVUFBVTtBQUFBLE1BQ3RDLFdBQVcsS0FBSyxTQUFTLEtBQUssUUFBUTtBQUNwQyxvQkFBWSxVQUFVLElBQUksTUFBTTtBQUFBLE1BQ2xDO0FBRUEsWUFBTSxVQUFVLEtBQUssU0FBUyxLQUFLO0FBQ25DLFVBQUksV0FBVyxDQUFDLGdCQUFnQjtBQUM5Qix5QkFBaUI7QUFDakIsWUFBSSxLQUFLLG9CQUFvQixFQUFFLE9BQU8sS0FBSyxPQUFPLFFBQVEsS0FBSyxPQUFPLENBQUM7QUFBQSxNQUN6RSxXQUFXLENBQUMsV0FBVyxnQkFBZ0I7QUFDckMsY0FBTSxnQkFBZ0IsS0FBSyxJQUFJLEdBQUcsS0FBSyxTQUFTLENBQUM7QUFDakQsWUFBSSxLQUFLLFNBQVMsZUFBZTtBQUMvQiwyQkFBaUI7QUFDakIsY0FBSSxLQUFLLHdCQUF3QixFQUFFLE9BQU8sS0FBSyxPQUFPLFFBQVEsS0FBSyxPQUFPLENBQUM7QUFBQSxRQUM3RTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBRUEsYUFBUyxxQkFBb0M7QUFDM0MsWUFBTSxPQUFPLE1BQU07QUFDbkIsVUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLFFBQVEsS0FBSyxTQUFTLEtBQUssS0FBSyxVQUFVLFdBQVcsS0FBSyxDQUFDLEtBQUssTUFBTTtBQUN4RixlQUFPO0FBQUEsTUFDVDtBQUVBLFlBQU0sa0JBQWtCLEtBQUs7QUFDN0IsWUFBTSxlQUNKLE9BQU8sb0JBQW9CLFlBQVksT0FBTyxTQUFTLGVBQWUsSUFBSSxrQkFBa0I7QUFDOUYsWUFBTSxlQUFlLEtBQUssSUFBSSxHQUFHLEtBQUssSUFBSSxjQUFjLEtBQUssVUFBVSxNQUFNLENBQUM7QUFDOUUsWUFBTSxxQkFDSixlQUFlLElBQUksS0FBSyxVQUFVLE1BQU0sWUFBWSxJQUFJLEtBQUssVUFBVSxNQUFNO0FBRS9FLFVBQUksbUJBQW1CLFdBQVcsR0FBRztBQUNuQyxlQUFPO0FBQUEsTUFDVDtBQUVBLFlBQU0sUUFBUSxDQUFDLEVBQUUsR0FBRyxLQUFLLEdBQUcsR0FBRyxLQUFLLEdBQUcsT0FBTyxPQUFVLEdBQUcsR0FBRyxrQkFBa0I7QUFFaEYsWUFBTSxhQUFhO0FBQUEsUUFDakIsYUFBYSxLQUFLLEtBQUs7QUFBQSxRQUN2QixLQUFLLEtBQUssS0FBSztBQUFBLFFBQ2YsT0FBTyxLQUFLLEtBQUs7QUFBQSxRQUNqQixLQUFLLEtBQUssS0FBSztBQUFBLFFBQ2YsS0FBSyxLQUFLLEtBQUs7QUFBQSxRQUNmLFlBQVksS0FBSyxLQUFLO0FBQUEsUUFDdEIsUUFBUSxLQUFLLEtBQUs7QUFBQSxNQUNwQjtBQUVBLFlBQU0sYUFBYSxpQkFBaUIsT0FBTyxLQUFLLEtBQUssT0FBTyxVQUFVO0FBQ3RFLGFBQU8sS0FBSyxJQUFJLEdBQUcsV0FBVyxlQUFlO0FBQUEsSUFDL0M7QUFFQSxhQUFTLHVCQUE2QjtBQUNwQyxVQUFJLENBQUMsZUFBZ0I7QUFDckIsWUFBTSxrQkFBa0IsTUFBTTtBQUM1Qix1QkFBZSxNQUFNLFFBQVE7QUFBQSxNQUMvQjtBQUVBLFlBQU0sT0FBTyxNQUFNO0FBQ25CLFVBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxNQUFNO0FBQ3ZCLHdCQUFnQjtBQUNoQix5QkFBaUI7QUFDakI7QUFBQSxNQUNGO0FBRUEsWUFBTSxVQUFVLG1CQUFtQjtBQUNuQyxVQUFJLFlBQVksTUFBTTtBQUNwQix3QkFBZ0I7QUFDaEIseUJBQWlCO0FBQ2pCO0FBQUEsTUFDRjtBQUVBLFlBQU0sU0FBUyxLQUFLLEtBQUs7QUFDekIsWUFBTSxVQUFXLFVBQVUsS0FBSyxLQUFLLE1BQU87QUFDNUMscUJBQWUsTUFBTSxRQUFRLEdBQUcsS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUM7QUFFbkUsWUFBTSxPQUFPLFVBQVU7QUFDdkIsWUFBTSxZQUFZLEtBQUssSUFBSSxHQUFHLEtBQUssS0FBSyxTQUFTLEdBQUc7QUFDcEQsVUFBSSxRQUFRLGFBQWEsQ0FBQyxnQkFBZ0I7QUFDeEMseUJBQWlCO0FBQ2pCLFlBQUksS0FBSywwQkFBMEIsRUFBRSxTQUFTLE9BQU8sQ0FBQztBQUFBLE1BQ3hELFdBQVcsT0FBTyxZQUFZLE9BQU8sZ0JBQWdCO0FBQ25ELHlCQUFpQjtBQUFBLE1BQ25CO0FBQUEsSUFDRjtBQUVBLGFBQVMsb0JBQTBCO0FBbGlDckM7QUFtaUNJLFlBQU0sWUFBVyxXQUFNLE9BQU4sbUJBQVU7QUFDM0IsVUFBSSxlQUFlLG1CQUFtQixZQUFZLFNBQVMsY0FBYyxHQUFHO0FBQzFFLGNBQU0sTUFBTSxXQUFXLGdCQUFnQixHQUFHO0FBQzFDLGNBQU0sTUFBTSxXQUFXLGdCQUFnQixHQUFHO0FBQzFDLGNBQU0sY0FBYyxTQUFTO0FBQzdCLGNBQU0sV0FBWSxjQUFjLFFBQVEsTUFBTSxPQUFRO0FBQ3RELGNBQU0sVUFBVSxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksS0FBSyxPQUFPLENBQUM7QUFDbEQsb0JBQVksTUFBTSxPQUFPLEdBQUcsT0FBTztBQUNuQyxvQkFBWSxRQUFRLGlCQUFpQixLQUFLLE1BQU0sV0FBVyxDQUFDO0FBQzVELG9CQUFZLE1BQU0sVUFBVTtBQUFBLE1BQzlCLFdBQVcsYUFBYTtBQUN0QixvQkFBWSxNQUFNLFVBQVU7QUFBQSxNQUM5QjtBQUVBLFVBQUksc0JBQXNCLG9CQUFvQjtBQUM1QyxjQUFNLGFBQWEsTUFBTSxjQUFjO0FBQ3ZDLGNBQU0sZUFDSCxtQkFBYyxPQUFPLFNBQVMsV0FBVyxXQUFXLElBQUksV0FBVyxjQUFjLFdBQWpGLFlBQ0EsWUFBWSxTQUFTLGNBQWMsSUFBSSxTQUFTLGNBQWM7QUFFakUsWUFBSSxnQkFBZ0IsVUFBYSxjQUFjLEdBQUc7QUFDaEQsZ0JBQU0sTUFBTSxXQUFXLG1CQUFtQixHQUFHO0FBQzdDLGdCQUFNLE1BQU0sV0FBVyxtQkFBbUIsR0FBRztBQUM3QyxnQkFBTSxXQUFZLGNBQWMsUUFBUSxNQUFNLE9BQVE7QUFDdEQsZ0JBQU0sVUFBVSxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksS0FBSyxPQUFPLENBQUM7QUFDbEQsNkJBQW1CLE1BQU0sT0FBTyxHQUFHLE9BQU87QUFDMUMsNkJBQW1CLFFBQVEsaUJBQWlCLEtBQUssTUFBTSxXQUFXLENBQUM7QUFDbkUsNkJBQW1CLE1BQU0sVUFBVTtBQUFBLFFBQ3JDLE9BQU87QUFDTCw2QkFBbUIsTUFBTSxVQUFVO0FBQUEsUUFDckM7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUVBLGFBQVMscUJBQTJCO0FBcmtDdEM7QUFza0NJLFlBQU0sUUFBTyxXQUFNLE9BQU4sbUJBQVU7QUFDdkIsVUFBSSxDQUFDLFFBQVEsQ0FBQyxjQUFjO0FBQzFCLHNCQUFjO0FBQ2Q7QUFBQSxNQUNGO0FBRUEsWUFBTSxNQUNKLE9BQU8sZ0JBQWdCLGVBQWUsT0FBTyxZQUFZLFFBQVEsYUFDN0QsWUFBWSxJQUFJLElBQ2hCLEtBQUssSUFBSTtBQUVmLFlBQU0sWUFBWSxNQUFNLEtBQUs7QUFFN0IsVUFBSSxXQUFXO0FBQ2IscUJBQWEsVUFBVSxJQUFJLFNBQVM7QUFDcEMsWUFBSSxDQUFDLGFBQWE7QUFDaEIsd0JBQWM7QUFDZCxjQUFJLEtBQUssdUJBQXVCLEVBQUUsWUFBWSxLQUFLLGFBQWEsQ0FBQztBQUFBLFFBQ25FO0FBQUEsTUFDRixPQUFPO0FBQ0wscUJBQWEsVUFBVSxPQUFPLFNBQVM7QUFDdkMsWUFBSSxhQUFhO0FBQ2Ysd0JBQWM7QUFDZCxjQUFJLEtBQUssdUJBQXVCLEVBQUUsT0FBTyxLQUFLLE1BQU0sQ0FBQztBQUFBLFFBQ3ZEO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7OztBQ3ptQ08sV0FBUyxTQUFTLEVBQUUsT0FBTyxTQUFTLElBQUksR0FBb0M7QUFDakYsVUFBTSxXQUFXLFNBQVMsZUFBZSxJQUFJO0FBQzdDLFFBQUksQ0FBQyxVQUFVO0FBQ2IsWUFBTSxJQUFJLE1BQU0sOEJBQThCO0FBQUEsSUFDaEQ7QUFFQSxVQUFNLFNBQVMsYUFBYSxFQUFFLFFBQVEsVUFBVSxPQUFPLFFBQVEsQ0FBQztBQUNoRSxVQUFNLFFBQVEsWUFBWTtBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGLENBQUM7QUFDRCxVQUFNLEtBQUssU0FBUztBQUFBLE1BQ2xCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxFQUFFLFFBQVEsY0FBYyxLQUFLLFVBQVUsSUFBSSxHQUFHLFNBQVM7QUFDN0QsVUFBTSxlQUFlLHNDQUFnQjtBQUNyQyxVQUFNLFlBQVksZ0NBQWEsYUFBYSxXQUFXLElBQUk7QUFDM0QsUUFBSSxDQUFDLFdBQVc7QUFDZCxZQUFNLElBQUksTUFBTSx3Q0FBd0M7QUFBQSxJQUMxRDtBQUVBLFVBQU0sV0FBVyxlQUFlO0FBQUEsTUFDOUIsUUFBUTtBQUFBLE1BQ1IsS0FBSztBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLFFBQVEsWUFBWTtBQUFBLE1BQ3hCLFFBQVE7QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRixDQUFDO0FBRUQsT0FBRyxPQUFPO0FBQ1YsVUFBTSxVQUFVO0FBQ2hCLFVBQU0seUJBQXlCO0FBQy9CLE9BQUcsdUJBQXVCO0FBQzFCLE9BQUcsd0JBQXdCO0FBQzNCLE9BQUcsdUJBQXVCO0FBQzFCLE9BQUcsMEJBQTBCO0FBQzdCLE9BQUcsa0JBQWtCO0FBQ3JCLE9BQUcsdUJBQXVCO0FBQzFCLE9BQUcsK0JBQStCO0FBQ2xDLE9BQUcsMEJBQTBCO0FBRTdCLFFBQUksYUFBNEI7QUFFaEMsYUFBUyxLQUFLLFdBQXlCO0FBQ3JDLFVBQUksQ0FBQyxPQUFPLFNBQVMsU0FBUyxHQUFHO0FBQy9CLG9CQUFZLGtDQUFjO0FBQUEsTUFDNUI7QUFFQSxVQUFJLFlBQVk7QUFDaEIsVUFBSSxlQUFlLE1BQU07QUFDdkIscUJBQWEsWUFBWSxjQUFjO0FBQ3ZDLFlBQUksQ0FBQyxPQUFPLFNBQVMsU0FBUyxLQUFLLFlBQVksR0FBRztBQUNoRCxzQkFBWTtBQUFBLFFBQ2Q7QUFBQSxNQUNGO0FBQ0EsbUJBQWE7QUFFYixZQUFNLHNCQUFzQixTQUFTO0FBQ3JDLGVBQVMsVUFBVTtBQUNuQixTQUFHLCtCQUErQjtBQUNsQyxTQUFHLGlCQUFpQjtBQUVwQiw0QkFBc0IsSUFBSTtBQUFBLElBQzVCO0FBRUEsMEJBQXNCLElBQUk7QUFFMUIsV0FBTztBQUFBLE1BQ0wsaUJBQWlCO0FBQ2YsY0FBTSx5QkFBeUI7QUFDL0IsV0FBRyx1QkFBdUI7QUFDMUIsV0FBRyx1QkFBdUI7QUFDMUIsV0FBRywwQkFBMEI7QUFDN0IsV0FBRywrQkFBK0I7QUFDbEMsV0FBRywwQkFBMEI7QUFDN0IsV0FBRyxpQkFBaUI7QUFDcEIsV0FBRyx1QkFBdUI7QUFBQSxNQUM1QjtBQUFBLElBQ0Y7QUFBQSxFQUNGOzs7QUNuR0EsTUFBTSxXQUFXO0FBRVYsV0FBUyxvQkFBaUM7QUFDL0MsaUJBQWE7QUFFYixVQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsWUFBUSxZQUFZO0FBQ3BCLFlBQVEsYUFBYSxhQUFhLFFBQVE7QUFFMUMsVUFBTSxRQUFRLFNBQVMsY0FBYyxLQUFLO0FBQzFDLFVBQU0sWUFBWTtBQUVsQixVQUFNLGVBQWUsU0FBUyxjQUFjLEtBQUs7QUFDakQsaUJBQWEsWUFBWTtBQUV6QixVQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsWUFBUSxZQUFZO0FBRXBCLFVBQU0sV0FBVyxTQUFTLGNBQWMsS0FBSztBQUM3QyxhQUFTLFlBQVk7QUFFckIsVUFBTSxRQUFRLFNBQVMsY0FBYyxJQUFJO0FBQ3pDLFVBQU0sWUFBWTtBQUVsQixVQUFNLE9BQU8sU0FBUyxjQUFjLEdBQUc7QUFDdkMsU0FBSyxZQUFZO0FBRWpCLFVBQU0sVUFBVSxTQUFTLGNBQWMsS0FBSztBQUM1QyxZQUFRLFlBQVk7QUFFcEIsVUFBTSxVQUFVLFNBQVMsY0FBYyxRQUFRO0FBQy9DLFlBQVEsT0FBTztBQUNmLFlBQVEsWUFBWTtBQUNwQixZQUFRLGNBQWM7QUFFdEIsVUFBTSxVQUFVLFNBQVMsY0FBYyxRQUFRO0FBQy9DLFlBQVEsT0FBTztBQUNmLFlBQVEsWUFBWTtBQUNwQixZQUFRLGNBQWM7QUFFdEIsWUFBUSxPQUFPLFNBQVMsT0FBTztBQUMvQixZQUFRLE9BQU8sVUFBVSxPQUFPLE1BQU0sT0FBTztBQUM3QyxZQUFRLE9BQU8sT0FBTyxjQUFjLE9BQU87QUFDM0MsYUFBUyxLQUFLLFlBQVksT0FBTztBQUVqQyxRQUFJLGdCQUFvQztBQUN4QyxRQUFJLFVBQVU7QUFDZCxRQUFJLGlCQUF3QztBQUM1QyxRQUFJLGNBQTZCO0FBQ2pDLFFBQUksU0FBOEI7QUFDbEMsUUFBSSxTQUE4QjtBQUVsQyxhQUFTLGlCQUF1QjtBQUM5QixVQUFJLENBQUMsUUFBUztBQUNkLFVBQUksZ0JBQWdCLEtBQU07QUFDMUIsb0JBQWMsT0FBTyxzQkFBc0IsTUFBTTtBQUMvQyxzQkFBYztBQUNkLHVCQUFlO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0g7QUFFQSxhQUFTLGlCQUF1QjtBQUM5QixVQUFJLENBQUMsUUFBUztBQUVkLFVBQUksZUFBZTtBQUNqQixjQUFNLE9BQU8sY0FBYyxzQkFBc0I7QUFDakQsY0FBTSxVQUFVO0FBQ2hCLGNBQU0sUUFBUSxLQUFLLElBQUksR0FBRyxLQUFLLFFBQVEsVUFBVSxDQUFDO0FBQ2xELGNBQU0sU0FBUyxLQUFLLElBQUksR0FBRyxLQUFLLFNBQVMsVUFBVSxDQUFDO0FBQ3BELGNBQU0sT0FBTyxLQUFLLE9BQU87QUFDekIsY0FBTSxNQUFNLEtBQUssTUFBTTtBQUV2QixxQkFBYSxNQUFNLFVBQVU7QUFDN0IscUJBQWEsTUFBTSxZQUFZLGFBQWEsS0FBSyxNQUFNLElBQUksQ0FBQyxPQUFPLEtBQUssTUFBTSxHQUFHLENBQUM7QUFDbEYscUJBQWEsTUFBTSxRQUFRLEdBQUcsS0FBSyxNQUFNLEtBQUssQ0FBQztBQUMvQyxxQkFBYSxNQUFNLFNBQVMsR0FBRyxLQUFLLE1BQU0sTUFBTSxDQUFDO0FBRWpELGdCQUFRLE1BQU0sVUFBVTtBQUN4QixnQkFBUSxNQUFNLGFBQWE7QUFDM0IsZ0JBQVEsTUFBTSxXQUFXLGNBQWMsS0FBSyxJQUFJLEtBQUssT0FBTyxhQUFhLEVBQUUsQ0FBQztBQUM1RSxjQUFNLGVBQWUsUUFBUTtBQUM3QixjQUFNLGdCQUFnQixRQUFRO0FBQzlCLFlBQUksYUFBYSxLQUFLLFNBQVM7QUFDL0IsWUFBSSxhQUFhLGdCQUFnQixPQUFPLGNBQWMsSUFBSTtBQUN4RCx1QkFBYSxLQUFLLElBQUksSUFBSSxLQUFLLE1BQU0sZ0JBQWdCLEVBQUU7QUFBQSxRQUN6RDtBQUNBLFlBQUksY0FBYyxLQUFLLE9BQU8sS0FBSyxRQUFRLElBQUksZUFBZTtBQUM5RCxzQkFBYyxNQUFNLGFBQWEsSUFBSSxPQUFPLGFBQWEsZUFBZSxFQUFFO0FBQzFFLGdCQUFRLE1BQU0sWUFBWSxhQUFhLEtBQUssTUFBTSxXQUFXLENBQUMsT0FBTyxLQUFLLE1BQU0sVUFBVSxDQUFDO0FBQUEsTUFDN0YsT0FBTztBQUNMLHFCQUFhLE1BQU0sVUFBVTtBQUM3QixxQkFBYSxNQUFNLFFBQVE7QUFDM0IscUJBQWEsTUFBTSxTQUFTO0FBQzVCLHFCQUFhLE1BQU0sWUFBWSxhQUFhLEtBQUssTUFBTSxPQUFPLGFBQWEsQ0FBQyxDQUFDLE9BQU8sS0FBSyxNQUFNLE9BQU8sY0FBYyxDQUFDLENBQUM7QUFFdEgsZ0JBQVEsTUFBTSxVQUFVO0FBQ3hCLGdCQUFRLE1BQU0sYUFBYTtBQUMzQixjQUFNLGVBQWUsUUFBUTtBQUM3QixjQUFNLGdCQUFnQixRQUFRO0FBQzlCLGNBQU0sY0FBYyxPQUFPLE9BQU8sYUFBYSxnQkFBZ0IsR0FBRyxJQUFJLE9BQU8sYUFBYSxlQUFlLEVBQUU7QUFDM0csY0FBTSxhQUFhLE9BQU8sT0FBTyxjQUFjLGlCQUFpQixHQUFHLElBQUksT0FBTyxjQUFjLGdCQUFnQixFQUFFO0FBQzlHLGdCQUFRLE1BQU0sWUFBWSxhQUFhLEtBQUssTUFBTSxXQUFXLENBQUMsT0FBTyxLQUFLLE1BQU0sVUFBVSxDQUFDO0FBQUEsTUFDN0Y7QUFBQSxJQUNGO0FBRUEsYUFBUyxrQkFBd0I7QUFDL0IsYUFBTyxpQkFBaUIsVUFBVSxnQkFBZ0IsRUFBRSxTQUFTLEtBQUssQ0FBQztBQUNuRSxhQUFPLGlCQUFpQixVQUFVLGdCQUFnQixFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQUEsSUFDckU7QUFFQSxhQUFTLGtCQUF3QjtBQUMvQixhQUFPLG9CQUFvQixVQUFVLGNBQWM7QUFDbkQsYUFBTyxvQkFBb0IsVUFBVSxjQUFjO0FBQ25ELFVBQUksZ0JBQWdCLE1BQU07QUFDeEIsZUFBTyxxQkFBcUIsV0FBVztBQUN2QyxzQkFBYztBQUFBLE1BQ2hCO0FBQ0EsVUFBSSxnQkFBZ0I7QUFDbEIsdUJBQWUsV0FBVztBQUMxQix5QkFBaUI7QUFBQSxNQUNuQjtBQUFBLElBQ0Y7QUFFQSxZQUFRLGlCQUFpQixTQUFTLENBQUMsVUFBVTtBQUMzQyxZQUFNLGVBQWU7QUFDckI7QUFBQSxJQUNGLENBQUM7QUFFRCxZQUFRLGlCQUFpQixTQUFTLENBQUMsVUFBVTtBQUMzQyxZQUFNLGVBQWU7QUFDckI7QUFBQSxJQUNGLENBQUM7QUFFRCxhQUFTLGNBQWMsU0FBd0M7QUEzSmpFO0FBNEpJLFlBQU0sRUFBRSxXQUFXLFdBQVcsT0FBTyxhQUFhLE1BQU0sWUFBWSxVQUFVLFdBQVcsVUFBVSxVQUFVLElBQUk7QUFFakgsVUFBSSxPQUFPLFNBQVMsU0FBUyxLQUFLLFlBQVksR0FBRztBQUMvQyxpQkFBUyxjQUFjLFFBQVEsWUFBWSxDQUFDLE9BQU8sU0FBUztBQUM1RCxpQkFBUyxNQUFNLFVBQVU7QUFBQSxNQUMzQixPQUFPO0FBQ0wsaUJBQVMsY0FBYztBQUN2QixpQkFBUyxNQUFNLFVBQVU7QUFBQSxNQUMzQjtBQUVBLFVBQUksZUFBZSxZQUFZLEtBQUssRUFBRSxTQUFTLEdBQUc7QUFDaEQsY0FBTSxjQUFjO0FBQ3BCLGNBQU0sTUFBTSxVQUFVO0FBQUEsTUFDeEIsT0FBTztBQUNMLGNBQU0sY0FBYztBQUNwQixjQUFNLE1BQU0sVUFBVTtBQUFBLE1BQ3hCO0FBRUEsV0FBSyxjQUFjO0FBRW5CLGVBQVMsWUFBVyxhQUFRLFdBQVIsWUFBa0IsT0FBTztBQUM3QyxVQUFJLFVBQVU7QUFDWixnQkFBUSxjQUFjLGdDQUFhO0FBQ25DLGdCQUFRLE1BQU0sVUFBVTtBQUFBLE1BQzFCLE9BQU87QUFDTCxnQkFBUSxNQUFNLFVBQVU7QUFBQSxNQUMxQjtBQUVBLGVBQVMsWUFBVyxhQUFRLFdBQVIsWUFBa0IsT0FBTztBQUM3QyxVQUFJLFVBQVU7QUFDWixnQkFBUSxjQUFjLGdDQUFhO0FBQ25DLGdCQUFRLE1BQU0sVUFBVTtBQUFBLE1BQzFCLE9BQU87QUFDTCxnQkFBUSxNQUFNLFVBQVU7QUFBQSxNQUMxQjtBQUFBLElBQ0Y7QUFFQSxhQUFTLEtBQUssU0FBd0M7QUFqTXhEO0FBa01JLGdCQUFVO0FBQ1YsdUJBQWdCLGFBQVEsV0FBUixZQUFrQjtBQUNsQyxjQUFRLFVBQVUsSUFBSSxTQUFTO0FBQy9CLG9CQUFjLE9BQU87QUFDckIsVUFBSSxnQkFBZ0I7QUFDbEIsdUJBQWUsV0FBVztBQUMxQix5QkFBaUI7QUFBQSxNQUNuQjtBQUNBLFVBQUksaUJBQWlCLE9BQU8sbUJBQW1CLGFBQWE7QUFDMUQseUJBQWlCLElBQUksZUFBZSxNQUFNLGVBQWUsQ0FBQztBQUMxRCx1QkFBZSxRQUFRLGFBQWE7QUFBQSxNQUN0QztBQUNBLHNCQUFnQjtBQUNoQixxQkFBZTtBQUFBLElBQ2pCO0FBRUEsYUFBUyxPQUFhO0FBQ3BCLFVBQUksQ0FBQyxRQUFTO0FBQ2QsZ0JBQVU7QUFDVixjQUFRLFVBQVUsT0FBTyxTQUFTO0FBQ2xDLGNBQVEsTUFBTSxhQUFhO0FBQzNCLGNBQVEsTUFBTSxVQUFVO0FBQ3hCLG1CQUFhLE1BQU0sVUFBVTtBQUM3QixzQkFBZ0I7QUFBQSxJQUNsQjtBQUVBLGFBQVMsVUFBZ0I7QUFDdkIsV0FBSztBQUNMLGNBQVEsT0FBTztBQUFBLElBQ2pCO0FBRUEsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBRUEsV0FBUyxlQUFxQjtBQUM1QixRQUFJLFNBQVMsZUFBZSxRQUFRLEdBQUc7QUFDckM7QUFBQSxJQUNGO0FBQ0EsVUFBTSxRQUFRLFNBQVMsY0FBYyxPQUFPO0FBQzVDLFVBQU0sS0FBSztBQUNYLFVBQU0sY0FBYztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQTRIcEIsYUFBUyxLQUFLLFlBQVksS0FBSztBQUFBLEVBQ2pDOzs7QUMzV0EsTUFBTSxpQkFBaUI7QUFRdkIsV0FBUyxhQUE2QjtBQUNwQyxRQUFJO0FBQ0YsVUFBSSxPQUFPLFdBQVcsZUFBZSxDQUFDLE9BQU8sY0FBYztBQUN6RCxlQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0YsU0FBUyxLQUFLO0FBQ1osYUFBTztBQUFBLElBQ1Q7QUFDQSxXQUFPLE9BQU87QUFBQSxFQUNoQjtBQUVPLFdBQVMsYUFBYSxJQUFxQztBQUNoRSxVQUFNLFVBQVUsV0FBVztBQUMzQixRQUFJLENBQUMsUUFBUyxRQUFPO0FBQ3JCLFFBQUk7QUFDRixZQUFNLE1BQU0sUUFBUSxRQUFRLGlCQUFpQixFQUFFO0FBQy9DLFVBQUksQ0FBQyxJQUFLLFFBQU87QUFDakIsWUFBTSxTQUFTLEtBQUssTUFBTSxHQUFHO0FBQzdCLFVBQ0UsT0FBTyxXQUFXLFlBQVksV0FBVyxRQUN6QyxPQUFPLE9BQU8sY0FBYyxZQUM1QixPQUFPLE9BQU8sY0FBYyxhQUM1QixPQUFPLE9BQU8sY0FBYyxVQUM1QjtBQUNBLGVBQU87QUFBQSxNQUNUO0FBQ0EsYUFBTztBQUFBLElBQ1QsU0FBUyxLQUFLO0FBQ1osYUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNGO0FBRU8sV0FBUyxhQUFhLElBQVksVUFBa0M7QUFDekUsVUFBTSxVQUFVLFdBQVc7QUFDM0IsUUFBSSxDQUFDLFFBQVM7QUFDZCxRQUFJO0FBQ0YsY0FBUSxRQUFRLGlCQUFpQixJQUFJLEtBQUssVUFBVSxRQUFRLENBQUM7QUFBQSxJQUMvRCxTQUFTLEtBQUs7QUFBQSxJQUVkO0FBQUEsRUFDRjtBQUVPLFdBQVMsY0FBYyxJQUFrQjtBQUM5QyxVQUFNLFVBQVUsV0FBVztBQUMzQixRQUFJLENBQUMsUUFBUztBQUNkLFFBQUk7QUFDRixjQUFRLFdBQVcsaUJBQWlCLEVBQUU7QUFBQSxJQUN4QyxTQUFTLEtBQUs7QUFBQSxJQUVkO0FBQUEsRUFDRjs7O0FDaENPLFdBQVMsY0FBd0I7QUFDdEMsV0FBTztBQUFBLE1BQ0wsUUFBUSxNQUFNLFNBQVMsZUFBZSxJQUFJO0FBQUEsTUFDMUMsU0FBUyxNQUFNLFNBQVMsZUFBZSxVQUFVO0FBQUEsTUFDakQsWUFBWSxNQUFNLFNBQVMsZUFBZSxhQUFhO0FBQUEsTUFDdkQsWUFBWSxNQUFNLFNBQVMsZUFBZSxhQUFhO0FBQUEsTUFDdkQsV0FBVyxNQUFNLFNBQVMsZUFBZSxZQUFZO0FBQUEsTUFDckQsaUJBQWlCLE1BQU0sU0FBUyxlQUFlLG1CQUFtQjtBQUFBLE1BQ2xFLFNBQVMsTUFBTSxTQUFTLGVBQWUsb0JBQW9CO0FBQUEsTUFDM0QsYUFBYSxNQUFNLFNBQVMsZUFBZSxjQUFjO0FBQUEsTUFDekQsWUFBWSxNQUFNLFNBQVMsZUFBZSxhQUFhO0FBQUEsTUFDdkQsZUFBZSxNQUFNLFNBQVMsZUFBZSxnQkFBZ0I7QUFBQSxNQUM3RCxlQUFlLE1BQU0sU0FBUyxlQUFlLGdCQUFnQjtBQUFBLE1BQzdELG9CQUFvQixNQUFNLFNBQVMsZUFBZSxzQkFBc0I7QUFBQSxNQUN4RSxtQkFBbUIsTUFBTSxTQUFTLGVBQWUscUJBQXFCO0FBQUEsTUFDdEUsaUJBQWlCLE1BQU0sU0FBUyxlQUFlLG1CQUFtQjtBQUFBLE1BQ2xFLGVBQWUsTUFBTSxTQUFTLGVBQWUsZ0JBQWdCO0FBQUEsTUFDN0QsV0FBVyxNQUFNLFNBQVMsZUFBZSxZQUFZO0FBQUEsTUFDckQsV0FBVyxNQUFNLFNBQVMsZUFBZSxZQUFZO0FBQUEsTUFDckQsWUFBWSxNQUFNLFNBQVMsZUFBZSxhQUFhO0FBQUEsTUFDdkQsZUFBZSxNQUFNLFNBQVMsZUFBZSxnQkFBZ0I7QUFBQSxNQUM3RCxVQUFVLE1BQU0sU0FBUyxlQUFlLFdBQVc7QUFBQSxJQUNyRDtBQUFBLEVBQ0Y7QUFFTyxXQUFTLGVBQWUsT0FBaUIsTUFBcUQ7QUFDbkcsUUFBSSxDQUFDLEtBQU0sUUFBTztBQUNsQixVQUFNLFdBQVcsTUFBTSxJQUFJO0FBQzNCLFdBQU8sV0FBVyxTQUFTLElBQUk7QUFBQSxFQUNqQzs7O0FDUE8sV0FBUyxxQkFBcUIsRUFBRSxJQUFJLEtBQUssT0FBTyxNQUFNLEdBQWtDO0FBQzdGLFVBQU0sY0FBMkIsa0JBQWtCO0FBQ25ELFFBQUksVUFBVTtBQUNkLFFBQUksU0FBUztBQUNiLFFBQUksZUFBZTtBQUNuQixRQUFJLGNBQW1DO0FBQ3ZDLFFBQUksaUJBQXNDO0FBQzFDLFFBQUksZ0JBQXFDO0FBQ3pDLFFBQUkscUJBQXFCO0FBQ3pCLFFBQUksd0JBQXdCO0FBRTVCLFVBQU0sc0JBQXlDLENBQUM7QUFFaEQsd0JBQW9CO0FBQUEsTUFDbEIsSUFBSSxHQUFHLHVCQUF1QixDQUFDLEVBQUUsUUFBUSxNQUFNO0FBQzdDLFlBQUksQ0FBQyxRQUFTO0FBQ2QsaUJBQVMsUUFBUSxPQUFPO0FBQ3hCLFlBQUksUUFBUTtBQUNWLHNCQUFZLEtBQUs7QUFBQSxRQUNuQixPQUFPO0FBQ0w7QUFBQSxRQUNGO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDSDtBQUVBLGFBQVMsY0FBYyxNQUF3QztBQUM3RCxVQUFJLENBQUMsS0FBSyxRQUFRO0FBQ2hCLGVBQU87QUFBQSxNQUNUO0FBQ0EsVUFBSSxPQUFPLEtBQUssV0FBVyxZQUFZO0FBQ3JDLGVBQU8sS0FBSyxPQUFPO0FBQUEsTUFDckI7QUFDQSxhQUFPLGVBQWUsT0FBTyxLQUFLLE1BQU07QUFBQSxJQUMxQztBQUVBLGFBQVMsV0FBVyxPQUF1QjtBQUN6QyxVQUFJLE1BQU0sV0FBVyxFQUFHLFFBQU87QUFDL0IsVUFBSSxDQUFDLE9BQU8sU0FBUyxLQUFLLEtBQUssUUFBUSxFQUFHLFFBQU87QUFDakQsVUFBSSxTQUFTLE1BQU0sT0FBUSxRQUFPLE1BQU0sU0FBUztBQUNqRCxhQUFPLEtBQUssTUFBTSxLQUFLO0FBQUEsSUFDekI7QUFFQSxhQUFTLFFBQVEsT0FBcUI7QUExRnhDO0FBMkZJLFVBQUksQ0FBQyxRQUFTO0FBQ2QsVUFBSSxNQUFNLFdBQVcsR0FBRztBQUN0Qix5QkFBaUI7QUFDakI7QUFBQSxNQUNGO0FBQ0EsVUFBSSxRQUFRLEtBQUssU0FBUyxNQUFNLFFBQVE7QUFDdEMseUJBQWlCO0FBQ2pCO0FBQUEsTUFDRjtBQUVBLFVBQUksZ0JBQWdCO0FBQ2xCLHVCQUFlO0FBQ2YseUJBQWlCO0FBQUEsTUFDbkI7QUFFQSxVQUFJLGFBQWE7QUFDZiwwQkFBWSxXQUFaO0FBQ0Esc0JBQWM7QUFBQSxNQUNoQjtBQUVBLHFCQUFlO0FBQ2YsWUFBTSxPQUFPLE1BQU0sS0FBSztBQUN4QixvQkFBYztBQUVkLHNCQUFnQixPQUFPLEtBQUs7QUFFNUIsVUFBSSxLQUFLLHdCQUF3QixFQUFFLElBQUksV0FBVyxPQUFPLE9BQU8sTUFBTSxPQUFPLENBQUM7QUFDOUUsaUJBQUssWUFBTDtBQUVBLFlBQU0sWUFBWSxLQUFLLGNBQWM7QUFDckMsWUFBTSxTQUFTLE1BQVk7QUF6SC9CLFlBQUFFO0FBMEhNLFlBQUksQ0FBQyxXQUFXLE9BQVE7QUFDeEIsb0JBQVksS0FBSztBQUFBLFVBQ2YsUUFBUSxjQUFjLElBQUk7QUFBQSxVQUMxQixPQUFPLEtBQUs7QUFBQSxVQUNaLE1BQU0sS0FBSztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsV0FBVyxNQUFNO0FBQUEsVUFDakIsVUFBVSxLQUFLLFFBQVEsU0FBUztBQUFBLFVBQ2hDLFdBQVcsS0FBSyxRQUFRLFNBQVMsWUFDN0JBLE1BQUEsS0FBSyxRQUFRLGNBQWIsT0FBQUEsTUFBMkIsVUFBVSxNQUFNLFNBQVMsSUFBSSxXQUFXLFNBQ25FO0FBQUEsVUFDSixRQUFRLEtBQUssUUFBUSxTQUFTLFdBQVcsY0FBYztBQUFBLFVBQ3ZELFVBQVU7QUFBQSxVQUNWLFdBQVcsS0FBSztBQUFBLFVBQ2hCLFFBQVEsWUFBWSxrQkFBa0I7QUFBQSxRQUN4QyxDQUFDO0FBQUEsTUFDSDtBQUVBLHNCQUFnQjtBQUNoQixhQUFPO0FBRVAsVUFBSSxLQUFLLFFBQVEsU0FBUyxTQUFTO0FBQ2pDLGNBQU0sVUFBVSxDQUFDLFlBQTJCO0FBQzFDLGNBQUksQ0FBQyxXQUFXLE9BQVE7QUFDeEIsY0FBSSxLQUFLLFFBQVEsUUFBUSxDQUFDLEtBQUssUUFBUSxLQUFLLE9BQU8sR0FBRztBQUNwRDtBQUFBLFVBQ0Y7QUFDQSxvQkFBVSxRQUFRLENBQUM7QUFBQSxRQUNyQjtBQUNBLHlCQUFpQixJQUFJLEdBQUcsS0FBSyxRQUFRLE9BQU8sT0FBaUM7QUFDN0UsWUFBSSxLQUFLLFFBQVEsU0FBUyxLQUFLLFFBQVEsTUFBTSxHQUFHO0FBQzlDLGtCQUFRLE1BQVM7QUFBQSxRQUNuQjtBQUFBLE1BQ0YsT0FBTztBQUNMLHlCQUFpQjtBQUFBLE1BQ25CO0FBQUEsSUFDRjtBQUVBLGFBQVMsVUFBVSxXQUF5QjtBQWhLOUM7QUFpS0ksVUFBSSxDQUFDLFFBQVM7QUFDZCxVQUFJLGdCQUFnQjtBQUNsQix1QkFBZTtBQUNmLHlCQUFpQjtBQUFBLE1BQ25CO0FBQ0EsVUFBSSxhQUFhO0FBQ2YsMEJBQVksV0FBWjtBQUNBLHNCQUFjO0FBQUEsTUFDaEI7QUFDQSxzQkFBZ0I7QUFDaEIsVUFBSSxhQUFhLE1BQU0sUUFBUTtBQUM3Qix5QkFBaUI7QUFBQSxNQUNuQixPQUFPO0FBQ0wsZ0JBQVEsU0FBUztBQUFBLE1BQ25CO0FBQUEsSUFDRjtBQUVBLGFBQVMsY0FBb0I7QUFDM0IsZ0JBQVUsZUFBZSxDQUFDO0FBQUEsSUFDNUI7QUFFQSxhQUFTLGtCQUF3QjtBQUMvQixVQUFJLENBQUMsUUFBUztBQUNkLFlBQU0sWUFBWSxnQkFBZ0IsSUFBSSxlQUFlLElBQUk7QUFDekQsZ0JBQVUsU0FBUztBQUFBLElBQ3JCO0FBRUEsYUFBUyxtQkFBeUI7QUFDaEMsVUFBSSxDQUFDLFFBQVM7QUFDZCw4QkFBd0I7QUFDeEIsc0JBQWdCLE1BQU0sUUFBUSxJQUFJO0FBQ2xDLFVBQUksS0FBSyxzQkFBc0IsRUFBRSxHQUFHLENBQUM7QUFDckMsV0FBSztBQUNMLDhCQUF3QjtBQUFBLElBQzFCO0FBRUEsYUFBUyxNQUFNLFNBQThCO0FBQzNDLFlBQU0sVUFBUyxtQ0FBUyxZQUFXO0FBQ25DLFVBQUksU0FBUztBQUNYLGdCQUFRO0FBQ1I7QUFBQSxNQUNGO0FBQ0EsVUFBSSxNQUFNLFdBQVcsR0FBRztBQUN0QjtBQUFBLE1BQ0Y7QUFDQSxnQkFBVTtBQUNWLGVBQVM7QUFDVCw4QkFBd0I7QUFDeEIsMkJBQXFCO0FBQ3JCLFVBQUksYUFBYTtBQUNqQixVQUFJLFFBQVE7QUFDVixjQUFNLFdBQVcsYUFBYSxFQUFFO0FBQ2hDLFlBQUksWUFBWSxDQUFDLFNBQVMsV0FBVztBQUNuQyx1QkFBYSxXQUFXLFNBQVMsU0FBUztBQUFBLFFBQzVDO0FBQUEsTUFDRixPQUFPO0FBQ0wsc0JBQWMsRUFBRTtBQUFBLE1BQ2xCO0FBQ0EsVUFBSSxLQUFLLG9CQUFvQixFQUFFLEdBQUcsQ0FBQztBQUNuQyxjQUFRLFVBQVU7QUFBQSxJQUNwQjtBQUVBLGFBQVMsVUFBZ0I7QUFDdkIsV0FBSztBQUNMLFlBQU0sRUFBRSxRQUFRLE1BQU0sQ0FBQztBQUFBLElBQ3pCO0FBRUEsYUFBUyxPQUFhO0FBcE94QjtBQXFPSSxZQUFNLGdCQUFnQixDQUFDLHlCQUF5QixXQUFXLENBQUMsc0JBQXNCLGdCQUFnQixLQUFLLGVBQWUsTUFBTTtBQUM1SCxZQUFNLGlCQUFpQjtBQUV2QixVQUFJLGdCQUFnQjtBQUNsQix1QkFBZTtBQUNmLHlCQUFpQjtBQUFBLE1BQ25CO0FBQ0EsVUFBSSxhQUFhO0FBQ2YsMEJBQVksV0FBWjtBQUNBLHNCQUFjO0FBQUEsTUFDaEI7QUFDQSxVQUFJLGVBQWU7QUFDakIsd0JBQWdCLGdCQUFnQixLQUFLO0FBQUEsTUFDdkM7QUFDQSxnQkFBVTtBQUNWLGVBQVM7QUFDVCxxQkFBZTtBQUNmLHNCQUFnQjtBQUNoQixrQkFBWSxLQUFLO0FBQUEsSUFDbkI7QUFFQSxhQUFTLFlBQXFCO0FBQzVCLGFBQU87QUFBQSxJQUNUO0FBRUEsYUFBUyxVQUFnQjtBQUN2QixXQUFLO0FBQ0wsaUJBQVcsV0FBVyxxQkFBcUI7QUFDekMsZ0JBQVE7QUFBQSxNQUNWO0FBQ0Esa0JBQVksUUFBUTtBQUFBLElBQ3RCO0FBRUEsYUFBUyxnQkFBZ0IsV0FBbUIsV0FBMEI7QUFDcEUsMkJBQXFCO0FBQ3JCLG1CQUFhLElBQUk7QUFBQSxRQUNmO0FBQUEsUUFDQTtBQUFBLFFBQ0EsV0FBVyxLQUFLLElBQUk7QUFBQSxNQUN0QixDQUFDO0FBQUEsSUFDSDtBQUVBLFdBQU87QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Y7QUFBQSxFQUNGOzs7QUNwUkEsV0FBUyx3QkFBd0IsU0FBa0IsVUFBMkI7QUFDNUUsUUFBSSxPQUFPLFlBQVksWUFBWSxZQUFZLEtBQU0sUUFBTztBQUM1RCxVQUFNLFFBQVMsUUFBZ0M7QUFDL0MsUUFBSSxPQUFPLFVBQVUsWUFBWSxDQUFDLE9BQU8sU0FBUyxLQUFLLEVBQUcsUUFBTztBQUNqRSxXQUFPLFNBQVM7QUFBQSxFQUNsQjtBQUVBLFdBQVMsZUFBZSxTQUFpQztBQUN2RCxRQUFJLE9BQU8sWUFBWSxZQUFZLFlBQVksS0FBTSxRQUFPO0FBQzVELFVBQU0sVUFBVyxRQUFrQztBQUNuRCxXQUFPLE9BQU8sWUFBWSxXQUFXLFVBQVU7QUFBQSxFQUNqRDtBQUVBLFdBQVMsa0JBQWtCLFFBQStDO0FBQ3hFLFdBQU8sQ0FBQyxZQUE4QjtBQUNwQyxVQUFJLE9BQU8sWUFBWSxZQUFZLFlBQVksS0FBTSxRQUFPO0FBQzVELFlBQU0sT0FBUSxRQUErQjtBQUM3QyxhQUFPLE9BQU8sU0FBUyxZQUFZLFNBQVM7QUFBQSxJQUM5QztBQUFBLEVBQ0Y7QUFFTyxXQUFTLHdCQUF3QztBQUN0RCxRQUFJLDBCQUEwQjtBQUM5QixRQUFJLGlCQUFnQztBQUNwQyxRQUFJLGFBQTRCO0FBRWhDLFdBQU87QUFBQSxNQUNMO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsVUFDUCxNQUFNLENBQUMsWUFBWSx3QkFBd0IsU0FBUyxDQUFDO0FBQUEsUUFDdkQ7QUFBQSxNQUNGO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFFBQ1Q7QUFBQSxNQUNGO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFVBQ1AsTUFBTSxDQUFDLFlBQVksd0JBQXdCLFNBQVMsQ0FBQztBQUFBLFFBQ3ZEO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNUO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxVQUNQLE1BQU0sa0JBQWtCLEtBQUs7QUFBQSxRQUMvQjtBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxN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QUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsZ0JBQWdCLE1BQU0sS0FBSyxlQUFlO0FBQUEsTUFDMUMsUUFBUSxNQUFNO0FBQ1osY0FBTSxhQUFhLFlBQVksaUJBQWlCLG1CQUFtQixDQUFDO0FBQ3BFLFlBQUksV0FBWSxhQUFZLEVBQUUsTUFBTSxRQUFRLE1BQU0sV0FBVyxDQUFDO0FBQUEsTUFDaEU7QUFBQSxJQUNGLENBQUM7QUFHRCxhQUFTLGlCQUFpQixvQkFBb0IsTUFBTTtBQUNsRCxVQUFJLFNBQVMsb0JBQW9CLFVBQVU7QUFDekMsYUFBSyxPQUFPLFFBQVE7QUFBQSxNQUN0QixPQUFPO0FBQ0wsYUFBSyxPQUFPLE9BQU87QUFBQSxNQUNyQjtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0gsR0FBRztBQUVILFdBQVMsaUJBQWlCLE9BQThCO0FBQ3RELFFBQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsVUFBTSxVQUFVLE1BQU0sS0FBSztBQUMzQixRQUFJLENBQUMsUUFBUyxRQUFPO0FBQ3JCLFdBQU8sUUFBUSxNQUFNLEdBQUcsRUFBRTtBQUFBLEVBQzVCO0FBRUEsV0FBUyxnQkFBZ0IsTUFBb0I7QUFDM0MsUUFBSTtBQUNGLFVBQUksS0FBTSxRQUFPLGFBQWEsUUFBUSx1QkFBdUIsSUFBSTtBQUFBLFVBQzVELFFBQU8sYUFBYSxXQUFXLHFCQUFxQjtBQUFBLElBQzNELFNBQVE7QUFBQSxJQUFDO0FBQUEsRUFDWDtBQUVBLFdBQVMscUJBQTZCO0FBbkl0QztBQW9JRSxRQUFJO0FBQUUsY0FBTyxZQUFPLGFBQWEsUUFBUSxxQkFBcUIsTUFBakQsWUFBc0Q7QUFBQSxJQUFJLFNBQ2pFO0FBQUUsYUFBTztBQUFBLElBQUk7QUFBQSxFQUNyQjsiLAogICJuYW1lcyI6IFsic2VuZE1lc3NhZ2UiLCAiX2EiLCAiX2IiLCAic2VuZE1lc3NhZ2UiLCAiZ2V0QXBwcm94U2VydmVyTm93IiwgInNlbGVjdGlvbiIsICJzZW5kTWVzc2FnZSIsICJnZXRBcHByb3hTZXJ2ZXJOb3ciLCAiX2EiLCAiU1RZTEVfSUQiLCAiZW5zdXJlU3R5bGVzIiwgImNob2ljZSIsICJfYSIsICJTVE9SQUdFX1BSRUZJWCIsICJnZXRTdG9yYWdlIiwgImNsYW1wIiwgImNob2ljZSIsICJfYSIsICJyZXN1bWVBdWRpbyJdCn0K
