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
      worldMeta: {}
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
  function projectMissileHeat(route, defaultSpeed2, heatParams) {
    const projection = {
      waypoints: route,
      heatAtWaypoints: [],
      willOverheat: false
    };
    if (route.length === 0) {
      return projection;
    }
    let heat = 0;
    let pos = { x: route[0].x, y: route[0].y };
    let currentSpeed = route[0].speed > 0 ? route[0].speed : defaultSpeed2;
    projection.heatAtWaypoints.push(heat);
    for (let i = 1; i < route.length; i++) {
      const targetPos = route[i];
      const targetSpeed = targetPos.speed > 0 ? targetPos.speed : defaultSpeed2;
      const dx = targetPos.x - pos.x;
      const dy = targetPos.y - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 1e-3) {
        projection.heatAtWaypoints.push(heat);
        continue;
      }
      const avgSpeed = (currentSpeed + targetSpeed) * 0.5;
      const segmentTime = distance / Math.max(avgSpeed, 1);
      const Vn = Math.max(heatParams.markerSpeed, 1e-6);
      const dev = avgSpeed - heatParams.markerSpeed;
      const p = heatParams.exp;
      let hdot;
      if (dev >= 0) {
        hdot = heatParams.kUp * Math.pow(dev / Vn, p);
      } else {
        hdot = -heatParams.kDown * Math.pow(Math.abs(dev) / Vn, p);
      }
      heat += hdot * segmentTime;
      heat = Math.max(0, Math.min(heat, heatParams.max));
      projection.heatAtWaypoints.push(heat);
      pos = { x: targetPos.x, y: targetPos.y };
      currentSpeed = targetSpeed;
      if (heat >= heatParams.overheatAt && !projection.willOverheat) {
        projection.willOverheat = true;
        projection.overheatAt = i;
      }
      pos = targetPos;
      currentSpeed = targetSpeed;
    }
    return projection;
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
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
          max: Number.isFinite(heatConfig.max) ? heatConfig.max : (_b = prevHeat == null ? void 0 : prevHeat.max) != null ? _b : 0,
          warnAt: Number.isFinite(heatConfig.warn_at) ? heatConfig.warn_at : (_c = prevHeat == null ? void 0 : prevHeat.warnAt) != null ? _c : 0,
          overheatAt: Number.isFinite(heatConfig.overheat_at) ? heatConfig.overheat_at : (_d = prevHeat == null ? void 0 : prevHeat.overheatAt) != null ? _d : 0,
          markerSpeed: Number.isFinite(heatConfig.marker_speed) ? heatConfig.marker_speed : (_e = prevHeat == null ? void 0 : prevHeat.markerSpeed) != null ? _e : 0,
          kUp: Number.isFinite(heatConfig.k_up) ? heatConfig.k_up : (_f = prevHeat == null ? void 0 : prevHeat.kUp) != null ? _f : 0,
          kDown: Number.isFinite(heatConfig.k_down) ? heatConfig.k_down : (_g = prevHeat == null ? void 0 : prevHeat.kDown) != null ? _g : 0,
          exp: Number.isFinite(heatConfig.exp) ? heatConfig.exp : (_h = prevHeat == null ? void 0 : prevHeat.exp) != null ? _h : 1
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
    const meta = (_i = msg.meta) != null ? _i : {};
    const hasC = typeof meta.c === "number" && Number.isFinite(meta.c);
    const hasW = typeof meta.w === "number" && Number.isFinite(meta.w);
    const hasH = typeof meta.h === "number" && Number.isFinite(meta.h);
    state.worldMeta = {
      c: hasC ? meta.c : state.worldMeta.c,
      w: hasW ? meta.w : state.worldMeta.w,
      h: hasH ? meta.h : state.worldMeta.h
    };
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

  // web/src/game.ts
  var stateRef;
  var uiStateRef;
  var busRef;
  var cv = null;
  var ctx = null;
  var HPspan = null;
  var killsSpan = null;
  var shipControlsCard = null;
  var shipClearBtn = null;
  var shipSetBtn = null;
  var shipSelectBtn = null;
  var shipRoutesContainer = null;
  var shipRouteLeg = null;
  var shipRouteSpeed = null;
  var shipDeleteBtn = null;
  var shipSpeedCard = null;
  var shipSpeedSlider = null;
  var shipSpeedValue = null;
  var missileSpeedMarker = null;
  var missileControlsCard = null;
  var missileAddRouteBtn = null;
  var missileLaunchBtn = null;
  var missileLaunchText = null;
  var missileLaunchInfo = null;
  var missileSetBtn = null;
  var missileSelectBtn = null;
  var missileDeleteBtn = null;
  var missileSpeedCard = null;
  var missileSpeedSlider = null;
  var missileSpeedValue = null;
  var missileAgroCard = null;
  var missileAgroSlider = null;
  var missileAgroValue = null;
  var spawnBotBtn = null;
  var spawnBotText = null;
  var routePrevBtn = null;
  var routeNextBtn = null;
  var routeMenuToggle = null;
  var routeMenu = null;
  var renameMissileRouteBtn = null;
  var deleteMissileRouteBtn = null;
  var clearMissileWaypointsBtn = null;
  var missileRouteNameLabel = null;
  var missileRouteCountLabel = null;
  var helpToggle = null;
  var helpOverlay = null;
  var helpCloseBtn = null;
  var helpText = null;
  var heatBarFill = null;
  var heatBarPlanned = null;
  var heatValueText = null;
  var speedMarker = null;
  var stallOverlay = null;
  var markerAligned = false;
  var heatWarnActive = false;
  var stallActive = false;
  var dualMeterAlert = false;
  var selection = null;
  var missileSelection = null;
  var defaultSpeed = 150;
  var lastMissileLegSpeed = 0;
  var lastLoopTs = null;
  var lastMissileConfigSent = null;
  var shipLegDashOffsets = /* @__PURE__ */ new Map();
  var missileLegDashOffsets = /* @__PURE__ */ new Map();
  var lastMissileLaunchTextHTML = "";
  var lastMissileLaunchInfoHTML = "";
  var lastTouchDistance = null;
  var pendingTouchTimeout = null;
  var isPinching = false;
  var draggedWaypoint = null;
  var dragStartPos = null;
  var draggedMissileWaypoint = null;
  var MIN_ZOOM = 1;
  var MAX_ZOOM = 3;
  var WAYPOINT_HITBOX_RADIUS = 12;
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
  var world = { w: 8e3, h: 4500 };
  function initGame({ state, uiState, bus }) {
    stateRef = state;
    uiStateRef = uiState;
    busRef = bus;
    cacheDom();
    if (!cv) {
      throw new Error("Canvas element #cv not found");
    }
    ctx = cv.getContext("2d");
    bindListeners();
    syncMissileUIFromState();
    updateControlHighlights();
    refreshShipSelectionUI();
    refreshMissileSelectionUI();
    updateHelpOverlay();
    updateStatusIndicators();
    requestAnimationFrame(loop);
    return {
      onStateUpdated() {
        syncMissileUIFromState();
        refreshShipSelectionUI();
        refreshMissileSelectionUI();
        updateMissileLaunchButtonState();
        updateStatusIndicators();
      }
    };
  }
  function cacheDom() {
    var _a, _b;
    cv = document.getElementById("cv");
    ctx = (_a = cv == null ? void 0 : cv.getContext("2d")) != null ? _a : null;
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
    defaultSpeed = parseFloat((_b = shipSpeedSlider == null ? void 0 : shipSpeedSlider.value) != null ? _b : "150");
    if (missileSpeedSlider) {
      missileSpeedSlider.disabled = true;
    }
  }
  function bindListeners() {
    if (!cv) return;
    cv.addEventListener("pointerdown", onCanvasPointerDown);
    cv.addEventListener("pointermove", onCanvasPointerMove);
    cv.addEventListener("pointerup", onCanvasPointerUp);
    cv.addEventListener("pointercancel", onCanvasPointerUp);
    cv.addEventListener("wheel", onCanvasWheel, { passive: false });
    cv.addEventListener("touchstart", onCanvasTouchStart, { passive: false });
    cv.addEventListener("touchmove", onCanvasTouchMove, { passive: false });
    cv.addEventListener("touchend", onCanvasTouchEnd, { passive: false });
    spawnBotBtn == null ? void 0 : spawnBotBtn.addEventListener("click", () => {
      if (spawnBotBtn.disabled) return;
      sendMessage({ type: "spawn_bot" });
      busRef.emit("bot:spawnRequested");
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
      clearShipRoute();
      busRef.emit("ship:clearInvoked");
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
      defaultSpeed = value;
      if (selection && stateRef.me && Array.isArray(stateRef.me.waypoints) && stateRef.me.waypoints[selection.index]) {
        sendMessage({ type: "update_waypoint", index: selection.index, speed: value });
        stateRef.me.waypoints[selection.index].speed = value;
        refreshShipSelectionUI();
        updatePlannedHeatBar();
      }
      const heat = (_a = stateRef.me) == null ? void 0 : _a.heat;
      if (heat) {
        const tolerance = Math.max(5, heat.markerSpeed * 0.02);
        const diff = Math.abs(value - heat.markerSpeed);
        const inRange = diff <= tolerance;
        if (inRange && !markerAligned) {
          markerAligned = true;
          busRef.emit("heat:markerAligned", { value, marker: heat.markerSpeed });
        } else if (!inRange && markerAligned) {
          markerAligned = false;
        }
      } else {
        markerAligned = false;
      }
      busRef.emit("ship:speedChanged", { value });
    });
    shipDeleteBtn == null ? void 0 : shipDeleteBtn.addEventListener("click", () => {
      setInputContext("ship");
      deleteSelectedShipWaypoint();
    });
    missileAddRouteBtn == null ? void 0 : missileAddRouteBtn.addEventListener("click", () => {
      setInputContext("missile");
      sendMessage({ type: "add_missile_route" });
    });
    missileLaunchBtn == null ? void 0 : missileLaunchBtn.addEventListener("click", () => {
      setInputContext("missile");
      launchActiveMissileRoute();
    });
    missileSetBtn == null ? void 0 : missileSetBtn.addEventListener("click", () => {
      setActiveTool("missile-set");
    });
    missileSelectBtn == null ? void 0 : missileSelectBtn.addEventListener("click", () => {
      setActiveTool("missile-select");
    });
    missileDeleteBtn == null ? void 0 : missileDeleteBtn.addEventListener("click", () => {
      setInputContext("missile");
      deleteSelectedMissileWaypoint();
      busRef.emit("missile:deleteInvoked");
    });
    missileSpeedSlider == null ? void 0 : missileSpeedSlider.addEventListener("input", (event) => {
      var _a, _b;
      const inputEl = event.target;
      if (inputEl.disabled) {
        return;
      }
      const rawValue = parseFloat(inputEl.value);
      if (!Number.isFinite(rawValue)) {
        updateMissileSpeedControls();
        return;
      }
      const route = getActiveMissileRoute();
      if (!route || !Array.isArray(route.waypoints)) {
        updateMissileSpeedControls();
        return;
      }
      if (missileSelection && missileSelection.type === "waypoint" && missileSelection.index >= 0 && missileSelection.index < route.waypoints.length) {
        const minSpeed = (_a = stateRef.missileLimits.speedMin) != null ? _a : MISSILE_MIN_SPEED;
        const maxSpeed = (_b = stateRef.missileLimits.speedMax) != null ? _b : MISSILE_MAX_SPEED;
        const clampedValue = clamp(rawValue, minSpeed, maxSpeed);
        const idx = missileSelection.index;
        route.waypoints[idx] = { ...route.waypoints[idx], speed: clampedValue };
        lastMissileLegSpeed = clampedValue;
        if (missileSpeedValue) {
          missileSpeedValue.textContent = `${clampedValue.toFixed(0)}`;
        }
        sendMessage({
          type: "update_missile_waypoint_speed",
          route_id: route.id,
          index: idx,
          speed: clampedValue
        });
        busRef.emit("missile:speedChanged", { value: clampedValue, index: idx });
        renderMissileRouteControls();
      } else {
        updateMissileSpeedControls();
      }
    });
    missileAgroSlider == null ? void 0 : missileAgroSlider.addEventListener("input", (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      updateMissileConfigFromUI({ agroRadius: value });
      busRef.emit("missile:agroChanged", { value });
    });
    routePrevBtn == null ? void 0 : routePrevBtn.addEventListener("click", () => cycleMissileRoute(-1));
    routeNextBtn == null ? void 0 : routeNextBtn.addEventListener("click", () => cycleMissileRoute(1));
    routeMenuToggle == null ? void 0 : routeMenuToggle.addEventListener("click", () => {
      routeMenu == null ? void 0 : routeMenu.classList.toggle("visible");
    });
    document.addEventListener("click", (event) => {
      if (!routeMenu || !routeMenu.classList.contains("visible")) return;
      if (event.target === routeMenuToggle) return;
      if (routeMenu.contains(event.target)) return;
      routeMenu.classList.remove("visible");
    });
    renameMissileRouteBtn == null ? void 0 : renameMissileRouteBtn.addEventListener("click", () => {
      routeMenu == null ? void 0 : routeMenu.classList.remove("visible");
      const route = getActiveMissileRoute();
      if (!route) return;
      const name = window.prompt("Rename route", route.name || "");
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      route.name = trimmed;
      renderMissileRouteControls();
      sendMessage({
        type: "rename_missile_route",
        route_id: route.id,
        route_name: trimmed
      });
    });
    deleteMissileRouteBtn == null ? void 0 : deleteMissileRouteBtn.addEventListener("click", () => {
      routeMenu == null ? void 0 : routeMenu.classList.remove("visible");
      const route = getActiveMissileRoute();
      if (!route) return;
      if (!window.confirm(`Delete ${route.name}?`)) return;
      const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
      if (routes.length <= 1) {
        route.waypoints = [];
      } else {
        stateRef.missileRoutes = routes.filter((r) => r.id !== route.id);
        const remaining = stateRef.missileRoutes;
        stateRef.activeMissileRouteId = remaining.length > 0 ? remaining[0].id : null;
      }
      missileSelection = null;
      renderMissileRouteControls();
      refreshMissileSelectionUI();
      sendMessage({
        type: "delete_missile_route",
        route_id: route.id
      });
    });
    clearMissileWaypointsBtn == null ? void 0 : clearMissileWaypointsBtn.addEventListener("click", () => {
      routeMenu == null ? void 0 : routeMenu.classList.remove("visible");
      const route = getActiveMissileRoute();
      if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
        return;
      }
      sendMessage({
        type: "clear_missile_route",
        route_id: route.id
      });
      route.waypoints = [];
      missileSelection = null;
      renderMissileRouteControls();
      refreshMissileSelectionUI();
    });
    helpToggle == null ? void 0 : helpToggle.addEventListener("click", () => {
      setHelpVisible(true);
    });
    helpCloseBtn == null ? void 0 : helpCloseBtn.addEventListener("click", () => {
      setHelpVisible(false);
    });
    window.addEventListener("keydown", onWindowKeyDown, { capture: false });
  }
  function setZoom(newZoom, centerX, centerY) {
    uiStateRef.zoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  }
  function onCanvasWheel(event) {
    if (!cv) return;
    event.preventDefault();
    const rect = cv.getBoundingClientRect();
    const centerX = event.clientX - rect.left;
    const centerY = event.clientY - rect.top;
    const delta = event.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    const newZoom = uiStateRef.zoom * zoomFactor;
    const scaleX = cv.width / rect.width;
    const scaleY = cv.height / rect.height;
    const canvasCenterX = centerX * scaleX;
    const canvasCenterY = centerY * scaleY;
    setZoom(newZoom, canvasCenterX, canvasCenterY);
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
    if (!cv || event.touches.length !== 2) {
      lastTouchDistance = null;
      return;
    }
    event.preventDefault();
    const currentDistance = getTouchDistance(event.touches);
    if (currentDistance === null || lastTouchDistance === null) return;
    const rect = cv.getBoundingClientRect();
    const center = getTouchCenter(event.touches);
    if (!center) return;
    const scaleX = cv.width / rect.width;
    const scaleY = cv.height / rect.height;
    const canvasCenterX = (center.x - rect.left) * scaleX;
    const canvasCenterY = (center.y - rect.top) * scaleY;
    const zoomFactor = currentDistance / lastTouchDistance;
    const newZoom = uiStateRef.zoom * zoomFactor;
    setZoom(newZoom, canvasCenterX, canvasCenterY);
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
  function onCanvasPointerDown(event) {
    var _a;
    if (!cv || !ctx) return;
    if (helpOverlay == null ? void 0 : helpOverlay.classList.contains("visible")) {
      return;
    }
    if (lastTouchDistance !== null || isPinching) {
      return;
    }
    const rect = cv.getBoundingClientRect();
    const scaleX = rect.width !== 0 ? cv.width / rect.width : 1;
    const scaleY = rect.height !== 0 ? cv.height / rect.height : 1;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const canvasPoint = { x, y };
    const worldPoint = canvasToWorld(canvasPoint);
    const context = uiStateRef.inputContext === "missile" ? "missile" : "ship";
    if (context === "ship" && uiStateRef.shipTool === "select" && ((_a = stateRef.me) == null ? void 0 : _a.waypoints)) {
      const wpIndex = findWaypointAtPosition(canvasPoint);
      if (wpIndex !== null) {
        draggedWaypoint = wpIndex;
        dragStartPos = { x: canvasPoint.x, y: canvasPoint.y };
        cv.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }
    if (context === "missile" && uiStateRef.missileTool === "select") {
      const hit = hitTestMissileRoutes(canvasPoint);
      if (hit) {
        setInputContext("missile");
        const { route, selection: missileSel } = hit;
        setMissileSelection(missileSel, route.id);
        renderMissileRouteControls();
        if (missileSel.type === "waypoint") {
          draggedMissileWaypoint = missileSel.index;
          dragStartPos = { x: canvasPoint.x, y: canvasPoint.y };
          cv.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        return;
      }
      setMissileSelection(null);
      renderMissileRouteControls();
    }
    if (event.pointerType === "touch") {
      if (pendingTouchTimeout !== null) {
        clearTimeout(pendingTouchTimeout);
      }
      pendingTouchTimeout = setTimeout(() => {
        if (isPinching) return;
        if (context === "missile") {
          handleMissilePointer(canvasPoint, worldPoint);
        } else {
          handleShipPointer(canvasPoint, worldPoint);
        }
        pendingTouchTimeout = null;
      }, 150);
    } else {
      if (context === "missile") {
        handleMissilePointer(canvasPoint, worldPoint);
      } else {
        handleShipPointer(canvasPoint, worldPoint);
      }
    }
    event.preventDefault();
  }
  function onCanvasPointerMove(event) {
    var _a, _b;
    if (!cv || !ctx) return;
    const draggingShip = draggedWaypoint !== null && dragStartPos;
    const draggingMissile = draggedMissileWaypoint !== null && dragStartPos;
    if (!draggingShip && !draggingMissile) {
      return;
    }
    const rect = cv.getBoundingClientRect();
    const scaleX = rect.width !== 0 ? cv.width / rect.width : 1;
    const scaleY = rect.height !== 0 ? cv.height / rect.height : 1;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const canvasPoint = { x, y };
    const worldPoint = canvasToWorld(canvasPoint);
    const worldW = (_a = stateRef.worldMeta.w) != null ? _a : 4e3;
    const worldH = (_b = stateRef.worldMeta.h) != null ? _b : 4e3;
    const clampedX = clamp(worldPoint.x, 0, worldW);
    const clampedY = clamp(worldPoint.y, 0, worldH);
    if (draggingShip && draggedWaypoint !== null) {
      sendMessage({
        type: "move_waypoint",
        index: draggedWaypoint,
        x: clampedX,
        y: clampedY
      });
      if (stateRef.me && stateRef.me.waypoints && draggedWaypoint < stateRef.me.waypoints.length) {
        stateRef.me.waypoints[draggedWaypoint].x = clampedX;
        stateRef.me.waypoints[draggedWaypoint].y = clampedY;
      }
      event.preventDefault();
      return;
    }
    if (draggingMissile && draggedMissileWaypoint !== null) {
      const route = getActiveMissileRoute();
      if (route && Array.isArray(route.waypoints) && draggedMissileWaypoint < route.waypoints.length) {
        sendMessage({
          type: "move_missile_waypoint",
          route_id: route.id,
          index: draggedMissileWaypoint,
          x: clampedX,
          y: clampedY
        });
        route.waypoints = route.waypoints.map(
          (wp, idx) => idx === draggedMissileWaypoint ? { ...wp, x: clampedX, y: clampedY } : wp
        );
        renderMissileRouteControls();
      }
      event.preventDefault();
    }
  }
  function onCanvasPointerUp(event) {
    var _a;
    let released = false;
    if (draggedWaypoint !== null && ((_a = stateRef.me) == null ? void 0 : _a.waypoints)) {
      const wp = stateRef.me.waypoints[draggedWaypoint];
      if (wp) {
        busRef.emit("ship:waypointMoved", {
          index: draggedWaypoint,
          x: wp.x,
          y: wp.y
        });
      }
      draggedWaypoint = null;
      released = true;
    }
    if (draggedMissileWaypoint !== null) {
      const route = getActiveMissileRoute();
      if (route && route.waypoints && draggedMissileWaypoint < route.waypoints.length) {
        const wp = route.waypoints[draggedMissileWaypoint];
        busRef.emit("missile:waypointMoved", {
          routeId: route.id,
          index: draggedMissileWaypoint,
          x: wp.x,
          y: wp.y
        });
      }
      draggedMissileWaypoint = null;
      released = true;
    }
    dragStartPos = null;
    if (released && cv) {
      cv.releasePointerCapture(event.pointerId);
    }
  }
  function updateSpeedLabel(value) {
    if (shipSpeedValue) {
      shipSpeedValue.textContent = Number(value).toFixed(0);
    }
  }
  function setShipSliderValue(value) {
    if (!shipSpeedSlider) return;
    shipSpeedSlider.value = String(value);
    updateSpeedLabel(value);
  }
  function ensureActiveMissileRoute() {
    var _a;
    const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
    if (routes.length === 0) {
      stateRef.activeMissileRouteId = null;
      return null;
    }
    if (!stateRef.activeMissileRouteId || !routes.some((route) => route.id === stateRef.activeMissileRouteId)) {
      stateRef.activeMissileRouteId = routes[0].id;
    }
    return (_a = routes.find((route) => route.id === stateRef.activeMissileRouteId)) != null ? _a : null;
  }
  function getActiveMissileRoute() {
    return ensureActiveMissileRoute();
  }
  function renderMissileRouteControls() {
    const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
    const activeRoute = getActiveMissileRoute();
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
    ensureActiveMissileRoute();
    const activeRoute = getActiveMissileRoute();
    const routeHasSelection = !!activeRoute && Array.isArray(activeRoute.waypoints) && !!missileSelection && missileSelection.index >= 0 && missileSelection.index < activeRoute.waypoints.length;
    if (!routeHasSelection) {
      missileSelection = null;
    }
    const cfg = stateRef.missileConfig;
    applyMissileUI(cfg);
    renderMissileRouteControls();
    refreshMissileSelectionUI();
  }
  function applyMissileUI(cfg) {
    var _a;
    if (missileAgroSlider) {
      const minAgro = (_a = stateRef.missileLimits.agroMin) != null ? _a : MISSILE_MIN_AGRO;
      const maxAgro = Math.max(5e3, Math.ceil((cfg.agroRadius + 500) / 500) * 500);
      missileAgroSlider.min = String(minAgro);
      missileAgroSlider.max = String(maxAgro);
      missileAgroSlider.value = cfg.agroRadius.toFixed(0);
    }
    if (missileAgroValue) {
      missileAgroValue.textContent = cfg.agroRadius.toFixed(0);
    }
    if (!lastMissileLegSpeed || lastMissileLegSpeed <= 0) {
      lastMissileLegSpeed = cfg.speed;
    }
    updateMissileSpeedControls();
  }
  function updateMissileConfigFromUI(overrides = {}) {
    var _a, _b;
    const current = stateRef.missileConfig;
    const cfg = sanitizeMissileConfig(
      {
        speed: current.speed,
        agroRadius: (_a = overrides.agroRadius) != null ? _a : current.agroRadius
      },
      current,
      stateRef.missileLimits
    );
    stateRef.missileConfig = cfg;
    applyMissileUI(cfg);
    const last = lastMissileConfigSent;
    const needsSend = !last || Math.abs(((_b = last.agroRadius) != null ? _b : 0) - cfg.agroRadius) > 5;
    if (needsSend) {
      sendMissileConfig(cfg);
    }
    renderMissileRouteControls();
    updateSpeedMarker();
  }
  function sendMissileConfig(cfg) {
    lastMissileConfigSent = {
      speed: cfg.speed,
      agroRadius: cfg.agroRadius
    };
    sendMessage({
      type: "configure_missile",
      missile_speed: cfg.speed,
      missile_agro: cfg.agroRadius
    });
  }
  function refreshShipSelectionUI() {
    if (!shipRoutesContainer || !shipRouteLeg || !shipRouteSpeed || !shipDeleteBtn) {
      return;
    }
    const wps = stateRef.me && Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
    const hasValidSelection = selection !== null && selection.index >= 0 && selection.index < wps.length;
    const isShipContext = uiStateRef.inputContext === "ship";
    const sliderActive = shipSpeedSlider && document.activeElement === shipSpeedSlider;
    shipRoutesContainer.style.display = "flex";
    shipRoutesContainer.style.opacity = isShipContext ? "1" : "0.6";
    if (!stateRef.me || !hasValidSelection) {
      shipRouteLeg.textContent = "";
      shipRouteSpeed.textContent = "";
      shipDeleteBtn.disabled = true;
      if (isShipContext) {
        setShipSliderValue(defaultSpeed);
      }
      return;
    }
    if (selection !== null) {
      const wp = wps[selection.index];
      const speed = wp && typeof wp.speed === "number" ? wp.speed : defaultSpeed;
      if (isShipContext && shipSpeedSlider && !sliderActive && Math.abs(parseFloat(shipSpeedSlider.value) - speed) > 0.25) {
        setShipSliderValue(speed);
      } else if (!sliderActive) {
        updateSpeedLabel(speed);
      }
      const displayIndex = selection.index + 1;
      shipRouteLeg.textContent = `${displayIndex}`;
      shipRouteSpeed.textContent = `${speed.toFixed(0)} u/s`;
      shipDeleteBtn.disabled = !isShipContext;
    }
  }
  function refreshMissileSelectionUI() {
    const route = getActiveMissileRoute();
    const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
    const isWaypointSelection = missileSelection !== null && missileSelection !== void 0 && missileSelection.type === "waypoint" && missileSelection.index >= 0 && missileSelection.index < count;
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
    const minSpeed = (_a = stateRef.missileLimits.speedMin) != null ? _a : MISSILE_MIN_SPEED;
    const maxSpeed = (_b = stateRef.missileLimits.speedMax) != null ? _b : MISSILE_MAX_SPEED;
    missileSpeedSlider.min = String(minSpeed);
    missileSpeedSlider.max = String(maxSpeed);
    const sliderActive = document.activeElement === missileSpeedSlider;
    const route = getActiveMissileRoute();
    let sliderValue = null;
    if (route && missileSelection && missileSelection.type === "waypoint" && Array.isArray(route.waypoints) && missileSelection.index >= 0 && missileSelection.index < route.waypoints.length) {
      const wp = route.waypoints[missileSelection.index];
      const value = typeof wp.speed === "number" && wp.speed > 0 ? wp.speed : stateRef.missileConfig.speed;
      sliderValue = clamp(value, minSpeed, maxSpeed);
      if (sliderValue > 0) {
        lastMissileLegSpeed = sliderValue;
      }
    }
    if (sliderValue !== null) {
      missileSpeedSlider.disabled = false;
      if (!sliderActive) {
        missileSpeedSlider.value = sliderValue.toFixed(0);
      }
      missileSpeedValue.textContent = `${sliderValue.toFixed(0)}`;
    } else {
      missileSpeedSlider.disabled = true;
      if (!Number.isFinite(parseFloat(missileSpeedSlider.value))) {
        missileSpeedSlider.value = stateRef.missileConfig.speed.toFixed(0);
      }
      missileSpeedValue.textContent = "--";
    }
  }
  function setSelection(sel) {
    selection = sel;
    refreshShipSelectionUI();
    const index = selection ? selection.index : null;
    busRef.emit("ship:legSelected", { index });
  }
  function setMissileSelection(sel, routeId) {
    missileSelection = sel;
    if (routeId) {
      stateRef.activeMissileRouteId = routeId;
    }
    refreshMissileSelectionUI();
    updateMissileSpeedControls();
  }
  function handleShipPointer(canvasPoint, worldPoint) {
    if (!stateRef.me) return;
    if (uiStateRef.shipTool === "select") {
      const hit = hitTestRoute(canvasPoint);
      setSelection(hit != null ? hit : null);
      return;
    }
    const wp = { x: worldPoint.x, y: worldPoint.y, speed: defaultSpeed };
    sendMessage({ type: "add_waypoint", x: wp.x, y: wp.y, speed: defaultSpeed });
    const wps = Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints.slice() : [];
    wps.push(wp);
    stateRef.me.waypoints = wps;
    busRef.emit("ship:waypointAdded", { index: wps.length - 1 });
    setSelection(null);
    updatePlannedHeatBar();
  }
  function getDefaultMissileLegSpeed() {
    var _a, _b;
    const minSpeed = (_a = stateRef.missileLimits.speedMin) != null ? _a : MISSILE_MIN_SPEED;
    const maxSpeed = (_b = stateRef.missileLimits.speedMax) != null ? _b : MISSILE_MAX_SPEED;
    const base = lastMissileLegSpeed > 0 ? lastMissileLegSpeed : stateRef.missileConfig.speed;
    return clamp(base, minSpeed, maxSpeed);
  }
  function handleMissilePointer(canvasPoint, worldPoint) {
    const route = getActiveMissileRoute();
    if (!route) return;
    if (uiStateRef.missileTool === "select") {
      const hit = hitTestMissileRoutes(canvasPoint);
      if (hit) {
        setMissileSelection(hit.selection, hit.route.id);
        renderMissileRouteControls();
      } else {
        setMissileSelection(null);
      }
      return;
    }
    const speed = getDefaultMissileLegSpeed();
    const wp = { x: worldPoint.x, y: worldPoint.y, speed };
    sendMessage({
      type: "add_missile_waypoint",
      route_id: route.id,
      x: wp.x,
      y: wp.y,
      speed: wp.speed
    });
    route.waypoints = route.waypoints ? [...route.waypoints, wp] : [wp];
    lastMissileLegSpeed = speed;
    renderMissileRouteControls();
    setMissileSelection({ type: "waypoint", index: route.waypoints.length - 1 }, route.id);
    busRef.emit("missile:waypointAdded", { routeId: route.id, index: route.waypoints.length - 1 });
  }
  function clearShipRoute() {
    const wps = stateRef.me && Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
    if (!wps || wps.length === 0) {
      return;
    }
    sendMessage({ type: "clear_waypoints" });
    if (stateRef.me) {
      stateRef.me.waypoints = [];
    }
    setSelection(null);
    busRef.emit("ship:waypointsCleared");
    updatePlannedHeatBar();
  }
  function deleteSelectedShipWaypoint() {
    if (!selection) return;
    sendMessage({ type: "delete_waypoint", index: selection.index });
    if (stateRef.me && Array.isArray(stateRef.me.waypoints)) {
      stateRef.me.waypoints = stateRef.me.waypoints.slice(0, selection.index);
    }
    busRef.emit("ship:waypointDeleted", { index: selection.index });
    setSelection(null);
    updatePlannedHeatBar();
  }
  function deleteSelectedMissileWaypoint() {
    const route = getActiveMissileRoute();
    if (!route || !missileSelection) return;
    const index = missileSelection.index;
    if (!Array.isArray(route.waypoints) || index < 0 || index >= route.waypoints.length) {
      return;
    }
    sendMessage({
      type: "delete_missile_waypoint",
      route_id: route.id,
      index
    });
    route.waypoints = [...route.waypoints.slice(0, index), ...route.waypoints.slice(index + 1)];
    busRef.emit("missile:waypointDeleted", { routeId: route.id, index });
    setMissileSelection(null);
    renderMissileRouteControls();
  }
  function launchActiveMissileRoute() {
    if (missileLaunchBtn == null ? void 0 : missileLaunchBtn.disabled) {
      return;
    }
    const route = getActiveMissileRoute();
    if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
      return;
    }
    busRef.emit("missile:launchRequested", { routeId: route.id });
    sendMessage({
      type: "launch_missile",
      route_id: route.id
    });
  }
  function cycleMissileRoute(direction) {
    const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
    if (routes.length === 0) {
      return;
    }
    const currentIndex = routes.findIndex((route) => route.id === stateRef.activeMissileRouteId);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = ((baseIndex + direction) % routes.length + routes.length) % routes.length;
    const nextRoute = routes[nextIndex];
    if (!nextRoute) return;
    stateRef.activeMissileRouteId = nextRoute.id;
    setMissileSelection(null);
    renderMissileRouteControls();
    sendMessage({
      type: "set_active_missile_route",
      route_id: nextRoute.id
    });
    busRef.emit("missile:activeRouteChanged", { routeId: nextRoute.id });
  }
  function cycleShipSelection(direction) {
    const wps = stateRef.me && Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
    if (!wps || wps.length === 0) {
      setSelection(null);
      return;
    }
    let index = selection ? selection.index : direction > 0 ? -1 : wps.length;
    index += direction;
    if (index < 0) index = wps.length - 1;
    if (index >= wps.length) index = 0;
    setSelection({ type: "leg", index });
  }
  function setInputContext(context) {
    const next = context === "missile" ? "missile" : "ship";
    if (uiStateRef.inputContext === next) {
      return;
    }
    uiStateRef.inputContext = next;
    if (next === "ship") {
      const shipToolToUse = uiStateRef.shipTool === "select" ? "ship-select" : "ship-set";
      if (uiStateRef.activeTool !== shipToolToUse) {
        uiStateRef.activeTool = shipToolToUse;
      }
    } else {
      const missileToolToUse = uiStateRef.missileTool === "select" ? "missile-select" : "missile-set";
      if (uiStateRef.activeTool !== missileToolToUse) {
        uiStateRef.activeTool = missileToolToUse;
      }
    }
    busRef.emit("context:changed", { context: next });
    updateControlHighlights();
    refreshShipSelectionUI();
    refreshMissileSelectionUI();
  }
  function setActiveTool(tool) {
    if (uiStateRef.activeTool === tool) {
      return;
    }
    uiStateRef.activeTool = tool;
    if (tool === "ship-set") {
      uiStateRef.shipTool = "set";
      uiStateRef.missileTool = null;
      setInputContext("ship");
      busRef.emit("ship:toolChanged", { tool: "set" });
    } else if (tool === "ship-select") {
      uiStateRef.shipTool = "select";
      uiStateRef.missileTool = null;
      setInputContext("ship");
      busRef.emit("ship:toolChanged", { tool: "select" });
    } else if (tool === "missile-set") {
      uiStateRef.shipTool = null;
      uiStateRef.missileTool = "set";
      setInputContext("missile");
      setMissileSelection(null);
      busRef.emit("missile:toolChanged", { tool: "set" });
    } else if (tool === "missile-select") {
      uiStateRef.shipTool = null;
      uiStateRef.missileTool = "select";
      setInputContext("missile");
      busRef.emit("missile:toolChanged", { tool: "select" });
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
    setButtonState(shipSetBtn, uiStateRef.activeTool === "ship-set");
    setButtonState(shipSelectBtn, uiStateRef.activeTool === "ship-select");
    setButtonState(missileSetBtn, uiStateRef.activeTool === "missile-set");
    setButtonState(missileSelectBtn, uiStateRef.activeTool === "missile-select");
    if (shipControlsCard) {
      shipControlsCard.classList.toggle("active", uiStateRef.inputContext === "ship");
    }
    if (missileControlsCard) {
      missileControlsCard.classList.toggle("active", uiStateRef.inputContext === "missile");
    }
  }
  function setHelpVisible(flag) {
    uiStateRef.helpVisible = Boolean(flag);
    updateHelpOverlay();
    busRef.emit("help:visibleChanged", { visible: uiStateRef.helpVisible });
  }
  function updateHelpOverlay() {
    if (!helpOverlay) return;
    if (helpText) {
      helpText.textContent = HELP_TEXT;
    }
    helpOverlay.classList.toggle("visible", uiStateRef.helpVisible);
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
  function onWindowKeyDown(event) {
    const target = document.activeElement;
    const isEditable = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (uiStateRef.helpVisible && event.key !== "Escape") {
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
        setInputContext("ship");
        event.preventDefault();
        return;
      case "Digit2":
        setInputContext("missile");
        event.preventDefault();
        return;
      case "KeyT":
        if (uiStateRef.activeTool === "ship-set") {
          setActiveTool("ship-select");
        } else if (uiStateRef.activeTool === "ship-select") {
          setActiveTool("ship-set");
        } else {
          setActiveTool("ship-set");
        }
        event.preventDefault();
        return;
      case "KeyC":
        setInputContext("ship");
        clearShipRoute();
        event.preventDefault();
        return;
      case "KeyH":
        setInputContext("ship");
        clearShipRoute();
        event.preventDefault();
        return;
      case "BracketLeft":
        setInputContext("ship");
        adjustSliderValue(shipSpeedSlider, -1, event.shiftKey);
        event.preventDefault();
        return;
      case "BracketRight":
        setInputContext("ship");
        adjustSliderValue(shipSpeedSlider, 1, event.shiftKey);
        event.preventDefault();
        return;
      case "Tab":
        setInputContext("ship");
        cycleShipSelection(event.shiftKey ? -1 : 1);
        event.preventDefault();
        return;
      case "KeyN":
        setInputContext("missile");
        missileAddRouteBtn == null ? void 0 : missileAddRouteBtn.click();
        event.preventDefault();
        return;
      case "KeyL":
        setInputContext("missile");
        launchActiveMissileRoute();
        event.preventDefault();
        return;
      case "KeyE":
        if (uiStateRef.activeTool === "missile-set") {
          setActiveTool("missile-select");
        } else if (uiStateRef.activeTool === "missile-select") {
          setActiveTool("missile-set");
        } else {
          setActiveTool("missile-set");
        }
        event.preventDefault();
        return;
      case "Comma":
        setInputContext("missile");
        adjustSliderValue(missileAgroSlider, -1, event.shiftKey);
        event.preventDefault();
        return;
      case "Period":
        setInputContext("missile");
        adjustSliderValue(missileAgroSlider, 1, event.shiftKey);
        event.preventDefault();
        return;
      case "Semicolon":
        setInputContext("missile");
        if (missileSpeedSlider && !missileSpeedSlider.disabled) {
          adjustSliderValue(missileSpeedSlider, -1, event.shiftKey);
        }
        event.preventDefault();
        return;
      case "Quote":
        setInputContext("missile");
        if (missileSpeedSlider && !missileSpeedSlider.disabled) {
          adjustSliderValue(missileSpeedSlider, 1, event.shiftKey);
        }
        event.preventDefault();
        return;
      case "Delete":
      case "Backspace":
        if (uiStateRef.inputContext === "missile" && missileSelection) {
          deleteSelectedMissileWaypoint();
        } else if (selection) {
          deleteSelectedShipWaypoint();
        }
        event.preventDefault();
        return;
      case "Escape":
        if (uiStateRef.helpVisible) {
          setHelpVisible(false);
        } else if (missileSelection) {
          setMissileSelection(null);
        } else if (selection) {
          setSelection(null);
        } else if (uiStateRef.inputContext === "missile") {
          setInputContext("ship");
        }
        event.preventDefault();
        return;
      case "Equal":
      case "NumpadAdd":
        if (!cv) return;
        setZoom(uiStateRef.zoom * 1.2, cv.width / 2, cv.height / 2);
        event.preventDefault();
        return;
      case "Minus":
      case "NumpadSubtract":
        if (!cv) return;
        setZoom(uiStateRef.zoom / 1.2, cv.width / 2, cv.height / 2);
        event.preventDefault();
        return;
      case "Digit0":
      case "Numpad0":
        if (event.ctrlKey || event.metaKey) {
          uiStateRef.zoom = 1;
          event.preventDefault();
        }
        return;
      default:
        break;
    }
    if (event.key === "?") {
      setHelpVisible(!uiStateRef.helpVisible);
      event.preventDefault();
    }
  }
  function getCameraPosition() {
    if (!cv) return { x: world.w / 2, y: world.h / 2 };
    const zoom = uiStateRef.zoom;
    let cameraX = stateRef.me ? stateRef.me.x : world.w / 2;
    let cameraY = stateRef.me ? stateRef.me.y : world.h / 2;
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
    if (!cv) return { x: p.x, y: p.y };
    const zoom = uiStateRef.zoom;
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
    if (!cv) return { x: p.x, y: p.y };
    const zoom = uiStateRef.zoom;
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
  function computeRoutePoints() {
    if (!stateRef.me) return null;
    const wps = Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
    const worldPoints = [{ x: stateRef.me.x, y: stateRef.me.y }];
    for (const wp of wps) {
      worldPoints.push({ x: wp.x, y: wp.y });
    }
    const canvasPoints = worldPoints.map((point) => worldToCanvas(point));
    return { waypoints: wps, worldPoints, canvasPoints };
  }
  function computeMissileRoutePoints() {
    if (!stateRef.me) return null;
    const route = getActiveMissileRoute();
    const wps = route && Array.isArray(route.waypoints) ? route.waypoints : [];
    const worldPoints = [{ x: stateRef.me.x, y: stateRef.me.y }];
    for (const wp of wps) {
      worldPoints.push({ x: wp.x, y: wp.y });
    }
    const canvasPoints = worldPoints.map((point) => worldToCanvas(point));
    return { waypoints: wps, worldPoints, canvasPoints };
  }
  function findWaypointAtPosition(canvasPoint) {
    var _a;
    if (!((_a = stateRef.me) == null ? void 0 : _a.waypoints)) return null;
    const route = computeRoutePoints();
    if (!route || route.waypoints.length === 0) return null;
    for (let i = route.waypoints.length - 1; i >= 0; i--) {
      const waypointCanvas = route.canvasPoints[i + 1];
      const dx = canvasPoint.x - waypointCanvas.x;
      const dy = canvasPoint.y - waypointCanvas.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= WAYPOINT_HITBOX_RADIUS) {
        return i;
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
  function updateRouteAnimations(dtSeconds) {
    if (!stateRef.me) {
      shipLegDashOffsets.clear();
      missileLegDashOffsets.clear();
      return;
    }
    if (uiStateRef.showShipRoute) {
      const shipRoute = computeRoutePoints();
      if (shipRoute && shipRoute.waypoints.length > 0) {
        updateDashOffsetsForRoute(shipLegDashOffsets, shipRoute.waypoints, shipRoute.worldPoints, shipRoute.canvasPoints, defaultSpeed, dtSeconds);
      } else {
        shipLegDashOffsets.clear();
      }
    } else {
      shipLegDashOffsets.clear();
    }
    const activeMissileRoute = getActiveMissileRoute();
    const missileRoutePoints = computeMissileRoutePoints();
    if (activeMissileRoute && missileRoutePoints && Array.isArray(activeMissileRoute.waypoints) && activeMissileRoute.waypoints.length > 0) {
      const fallbackSpeed = lastMissileLegSpeed > 0 ? lastMissileLegSpeed : stateRef.missileConfig.speed;
      updateDashOffsetsForRoute(
        missileLegDashOffsets,
        activeMissileRoute.waypoints,
        missileRoutePoints.worldPoints,
        missileRoutePoints.canvasPoints,
        fallbackSpeed,
        dtSeconds,
        64
      );
    } else {
      missileLegDashOffsets.clear();
    }
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
  function hitTestRoute(canvasPoint) {
    const route = computeRoutePoints();
    if (!route || route.waypoints.length === 0) {
      return null;
    }
    const { canvasPoints } = route;
    const waypointHitRadius = 12;
    for (let i = 0; i < route.waypoints.length; i++) {
      const wpCanvas = canvasPoints[i + 1];
      const dx = canvasPoint.x - wpCanvas.x;
      const dy = canvasPoint.y - wpCanvas.y;
      if (Math.hypot(dx, dy) <= waypointHitRadius) {
        return { type: "waypoint", index: i };
      }
    }
    if (!uiStateRef.showShipRoute) {
      return null;
    }
    const legHitDistance = 10;
    for (let i = 0; i < route.waypoints.length; i++) {
      const dist = pointSegmentDistance(canvasPoint, canvasPoints[i], canvasPoints[i + 1]);
      if (dist <= legHitDistance) {
        return { type: "leg", index: i };
      }
    }
    return null;
  }
  function hitTestMissileRoutes(canvasPoint) {
    if (!stateRef.me) return null;
    const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
    if (routes.length === 0) return null;
    const shipPos = { x: stateRef.me.x, y: stateRef.me.y };
    const waypointHitRadius = 16;
    const legHitDistance = 10;
    let best = null;
    for (const route of routes) {
      const waypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
      if (waypoints.length === 0) {
        continue;
      }
      const worldPoints = [shipPos, ...waypoints.map((wp) => ({ x: wp.x, y: wp.y }))];
      const canvasPoints = worldPoints.map((point) => worldToCanvas(point));
      for (let i = 1; i < canvasPoints.length; i++) {
        const wpCanvas = canvasPoints[i];
        const dx = canvasPoint.x - wpCanvas.x;
        const dy = canvasPoint.y - wpCanvas.y;
        const pointerDist = Math.hypot(dx, dy);
        if (pointerDist <= waypointHitRadius) {
          const worldPoint = worldPoints[i];
          const shipDist = Math.hypot(worldPoint.x - shipPos.x, worldPoint.y - shipPos.y);
          if (!best || pointerDist < best.pointerDist - 0.1 || Math.abs(pointerDist - best.pointerDist) <= 0.5 && shipDist < best.shipDist) {
            best = {
              route,
              selection: { type: "waypoint", index: i - 1 },
              pointerDist,
              shipDist
            };
          }
        }
      }
      for (let i = 0; i < canvasPoints.length - 1; i++) {
        const pointerDist = pointSegmentDistance(canvasPoint, canvasPoints[i], canvasPoints[i + 1]);
        if (pointerDist <= legHitDistance) {
          const midWorld = {
            x: (worldPoints[i].x + worldPoints[i + 1].x) * 0.5,
            y: (worldPoints[i].y + worldPoints[i + 1].y) * 0.5
          };
          const shipDist = Math.hypot(midWorld.x - shipPos.x, midWorld.y - shipPos.y);
          if (!best || pointerDist < best.pointerDist - 0.1 || Math.abs(pointerDist - best.pointerDist) <= 0.5 && shipDist < best.shipDist) {
            best = {
              route,
              selection: { type: "route", index: i },
              pointerDist,
              shipDist
            };
          }
        }
      }
    }
    if (!best) {
      return null;
    }
    return { route: best.route, selection: best.selection };
  }
  function drawShip(x, y, vx, vy, color, filled) {
    if (!ctx) return;
    const p = worldToCanvas({ x, y });
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
    if (!ctx) return;
    const p = worldToCanvas({ x, y });
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ccccccaa";
    ctx.fill();
  }
  function estimateHeatChange(pos1, wp, currentHeat, heatParams) {
    const dx = wp.x - pos1.x;
    const dy = wp.y - pos1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1e-6 || wp.speed < 1) {
      return currentHeat;
    }
    const estimatedTime = distance / wp.speed;
    const Vn = Math.max(heatParams.markerSpeed, 1e-6);
    const dev = wp.speed - heatParams.markerSpeed;
    const p = heatParams.exp;
    let hdot;
    if (dev >= 0) {
      hdot = heatParams.kUp * Math.pow(dev / Vn, p);
    } else {
      hdot = -heatParams.kDown * Math.pow(Math.abs(dev) / Vn, p);
    }
    const newHeat = currentHeat + hdot * estimatedTime;
    return clamp(newHeat, 0, heatParams.max);
  }
  function interpolateColor(color1, color2, t) {
    return [
      Math.round(color1[0] + (color2[0] - color1[0]) * t),
      Math.round(color1[1] + (color2[1] - color1[1]) * t),
      Math.round(color1[2] + (color2[2] - color1[2]) * t)
    ];
  }
  function drawPlannedRoute(kind) {
    var _a, _b, _c, _d, _e, _f;
    if (!ctx || !stateRef.me) return;
    const isShip = kind === "ship";
    if (isShip && !uiStateRef.showShipRoute) return;
    if (!isShip && uiStateRef.inputContext !== "missile") return;
    const geometry = isShip ? computeRoutePoints() : computeMissileRoutePoints();
    if (!geometry || geometry.waypoints.length === 0) return;
    const { waypoints, worldPoints, canvasPoints } = geometry;
    const legCount = canvasPoints.length - 1;
    const dashOffsets = isShip ? shipLegDashOffsets : missileLegDashOffsets;
    const routeSelection = (_a = isShip ? selection : missileSelection) != null ? _a : null;
    const defaultLegSpeed = isShip ? defaultSpeed : getDefaultMissileLegSpeed();
    let shipHeat = isShip ? (_b = stateRef.me.heat) != null ? _b : void 0 : void 0;
    let currentHeat = shipHeat ? clamp(shipHeat.value, 0, shipHeat.max) : 0;
    const missileHeatParams = stateRef.missileConfig.heatParams;
    let missileHeatProjection = null;
    if (!isShip && missileHeatParams && waypoints.length > 0) {
      const startPoint = {
        x: worldPoints[0].x,
        y: worldPoints[0].y,
        speed: stateRef.missileConfig.speed
      };
      const routeForHeat = [startPoint, ...waypoints.map((wp) => {
        var _a2;
        return { x: wp.x, y: wp.y, speed: (_a2 = wp.speed) != null ? _a2 : defaultLegSpeed };
      })];
      missileHeatProjection = projectMissileHeat(routeForHeat, stateRef.missileConfig.speed, missileHeatParams);
    }
    if (legCount > 0) {
      for (let i = 0; i < legCount; i++) {
        const isFirstLeg = isShip && i === 0;
        const legSelected = Boolean(
          routeSelection && (isShip && routeSelection.type === "leg" && routeSelection.index === i || !isShip && routeSelection.type === "route" && routeSelection.index === i)
        );
        const speedValue = typeof waypoints[i].speed === "number" && waypoints[i].speed > 0 ? waypoints[i].speed : defaultLegSpeed;
        let strokeStyle = isShip ? isFirstLeg ? "#38bdf8" : "#38bdf866" : "#f87171aa";
        let lineWidth = isShip ? isFirstLeg ? 3 : 1.5 : 2.5;
        if (isShip && shipHeat) {
          const segmentHeat = estimateHeatChange(
            worldPoints[i],
            { x: worldPoints[i + 1].x, y: worldPoints[i + 1].y, speed: speedValue },
            currentHeat,
            shipHeat
          );
          const heatRatio = clamp(segmentHeat / shipHeat.overheatAt, 0, 1);
          const color = interpolateColor([100, 150, 255], [255, 50, 50], heatRatio);
          strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${isFirstLeg ? 1 : 0.4})`;
          lineWidth = lineWidth + heatRatio * 4;
          currentHeat = segmentHeat;
        } else if (!isShip && missileHeatProjection && missileHeatParams) {
          const heat1 = (_c = missileHeatProjection.heatAtWaypoints[i]) != null ? _c : 0;
          const heat2 = (_d = missileHeatProjection.heatAtWaypoints[i + 1]) != null ? _d : 0;
          const maxHeat = Math.max(heat1, heat2);
          const heatRatio = maxHeat / missileHeatParams.max;
          const warnRatio = missileHeatParams.warnAt / missileHeatParams.max;
          const overheatRatio = missileHeatParams.overheatAt / missileHeatParams.max;
          if (heatRatio < warnRatio) {
            strokeStyle = "rgba(51, 170, 51, 0.7)";
          } else if (heatRatio < overheatRatio) {
            strokeStyle = "rgba(255, 170, 51, 0.7)";
          } else {
            strokeStyle = "rgba(255, 51, 51, 0.8)";
          }
        }
        ctx.save();
        if (isShip) {
          ctx.setLineDash(legSelected ? [4, 4] : isFirstLeg ? [6, 6] : [8, 8]);
        } else {
          ctx.setLineDash(legSelected ? [6, 4] : [10, 6]);
        }
        ctx.lineWidth = legSelected ? 3.5 : lineWidth;
        ctx.strokeStyle = legSelected ? "#f97316" : strokeStyle;
        ctx.beginPath();
        ctx.lineDashOffset = (_e = dashOffsets.get(i)) != null ? _e : 0;
        ctx.moveTo(canvasPoints[i].x, canvasPoints[i].y);
        ctx.lineTo(canvasPoints[i + 1].x, canvasPoints[i + 1].y);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (let i = 0; i < waypoints.length; i++) {
      const pt = canvasPoints[i + 1];
      const waypointSelected = Boolean(routeSelection && routeSelection.type === "waypoint" && routeSelection.index === i);
      const waypointDragging = isShip ? draggedWaypoint === i : draggedMissileWaypoint === i;
      const heatAtWaypoint = !isShip && missileHeatProjection ? (_f = missileHeatProjection.heatAtWaypoints[i + 1]) != null ? _f : 0 : 0;
      ctx.save();
      ctx.beginPath();
      const radius = waypointSelected || waypointDragging ? 7 : 5;
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      if (isShip) {
        ctx.fillStyle = waypointSelected ? "#f97316" : waypointDragging ? "#facc15" : "#38bdf8";
        ctx.globalAlpha = waypointSelected || waypointDragging ? 0.95 : 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#0f172a";
      } else {
        let fillColor = waypointSelected ? "#facc15" : "#f87171";
        if (missileHeatProjection && missileHeatParams) {
          const heatRatio = heatAtWaypoint / missileHeatParams.max;
          const warnRatio = missileHeatParams.warnAt / missileHeatParams.max;
          const overheatRatio = missileHeatParams.overheatAt / missileHeatParams.max;
          if (heatRatio < warnRatio) {
            fillColor = waypointSelected ? "#facc15" : "#33aa33";
          } else if (heatRatio < overheatRatio) {
            fillColor = waypointSelected ? "#facc15" : "#ffaa33";
          } else {
            fillColor = waypointSelected ? "#facc15" : "#ff3333";
          }
        }
        ctx.fillStyle = fillColor;
        ctx.globalAlpha = waypointSelected ? 0.95 : 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = waypointSelected ? "#854d0e" : "#7f1d1d";
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawMissiles() {
    if (!ctx || !stateRef.missiles || stateRef.missiles.length === 0 || !cv) return;
    const scaleX = cv.width / world.w;
    const scaleY = cv.height / world.h;
    const radiusScale = (scaleX + scaleY) / 2;
    for (const miss of stateRef.missiles) {
      const p = worldToCanvas({ x: miss.x, y: miss.y });
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
      if (miss.heat) {
        drawMissileHeatBar(miss, p);
      }
    }
  }
  function drawMissileHeatBar(missile, canvasPos) {
    if (!ctx || !missile.heat) return;
    const heat = missile.heat;
    const barWidth = 40;
    const barHeight = 4;
    const barX = canvasPos.x - barWidth / 2;
    const barY = canvasPos.y + 15;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    const heatRatio = heat.value / heat.max;
    const fillWidth = barWidth * heatRatio;
    let heatColor;
    const warnRatio = heat.warnAt / heat.max;
    const overheatRatio = heat.overheatAt / heat.max;
    if (heatRatio < warnRatio) {
      heatColor = "#33aa33";
    } else if (heatRatio < overheatRatio) {
      heatColor = "#ffaa33";
    } else {
      heatColor = "#ff3333";
    }
    ctx.fillStyle = heatColor;
    ctx.fillRect(barX, barY, fillWidth, barHeight);
  }
  function drawGrid() {
    if (!ctx || !cv) return;
    ctx.save();
    ctx.strokeStyle = "#234";
    ctx.lineWidth = 1;
    const zoom = uiStateRef.zoom;
    let step = 1e3;
    if (zoom < 0.7) {
      step = 2e3;
    } else if (zoom > 1.5) {
      step = 500;
    } else if (zoom > 2.5) {
      step = 250;
    }
    const camera = getCameraPosition();
    const scaleX = cv.width / world.w;
    const scaleY = cv.height / world.h;
    const scale = Math.min(scaleX, scaleY) * zoom;
    const viewportWidth = cv.width / scale;
    const viewportHeight = cv.height / scale;
    const minX = Math.max(0, camera.x - viewportWidth / 2);
    const maxX = Math.min(world.w, camera.x + viewportWidth / 2);
    const minY = Math.max(0, camera.y - viewportHeight / 2);
    const maxY = Math.min(world.h, camera.y + viewportHeight / 2);
    const startX = Math.floor(minX / step) * step;
    const endX = Math.ceil(maxX / step) * step;
    const startY = Math.floor(minY / step) * step;
    const endY = Math.ceil(maxY / step) * step;
    for (let x = startX; x <= endX; x += step) {
      const a = worldToCanvas({ x, y: Math.max(0, minY) });
      const b = worldToCanvas({ x, y: Math.min(world.h, maxY) });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += step) {
      const a = worldToCanvas({ x: Math.max(0, minX), y });
      const b = worldToCanvas({ x: Math.min(world.w, maxX), y });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  function updateMissileLaunchButtonState() {
    if (!missileLaunchBtn || !missileLaunchText || !missileLaunchInfo) return;
    const route = getActiveMissileRoute();
    const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
    const remaining = getMissileCooldownRemaining();
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
      const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
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
  function getMissileCooldownRemaining() {
    const remaining = stateRef.nextMissileReadyAt - getApproxServerNow(stateRef);
    return remaining > 0 ? remaining : 0;
  }
  function updateStatusIndicators() {
    var _a;
    const meta = (_a = stateRef.worldMeta) != null ? _a : {};
    const hasWidth = typeof meta.w === "number" && Number.isFinite(meta.w);
    const hasHeight = typeof meta.h === "number" && Number.isFinite(meta.h);
    if (hasWidth) {
      world.w = meta.w;
    }
    if (hasHeight) {
      world.h = meta.h;
    }
    if (HPspan) {
      if (stateRef.me && Number.isFinite(stateRef.me.hp)) {
        HPspan.textContent = Number(stateRef.me.hp).toString();
      } else {
        HPspan.textContent = "\u2013";
      }
    }
    if (killsSpan) {
      if (stateRef.me && Number.isFinite(stateRef.me.kills)) {
        killsSpan.textContent = Number(stateRef.me.kills).toString();
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
    const heat = (_a = stateRef.me) == null ? void 0 : _a.heat;
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
      busRef.emit("heat:warnEntered", { value: heat.value, warnAt: heat.warnAt });
    } else if (!nowWarn && heatWarnActive) {
      const coolThreshold = Math.max(0, heat.warnAt - 5);
      if (heat.value <= coolThreshold) {
        heatWarnActive = false;
        busRef.emit("heat:cooledBelowWarn", { value: heat.value, warnAt: heat.warnAt });
      }
    }
  }
  function updatePlannedHeatBar() {
    const ship = stateRef.me;
    const plannedEl = heatBarPlanned;
    if (!ship || !ship.heat || !plannedEl) {
      dualMeterAlert = false;
      return;
    }
    const planned = projectPlannedHeat(ship);
    const actual = ship.heat.value;
    const percent = planned / ship.heat.max * 100;
    plannedEl.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    const diff = planned - actual;
    const threshold = Math.max(8, ship.heat.warnAt * 0.1);
    if (diff >= threshold && !dualMeterAlert) {
      dualMeterAlert = true;
      busRef.emit("heat:dualMeterDiverged", { planned, actual });
    } else if (diff < threshold * 0.6 && dualMeterAlert) {
      dualMeterAlert = false;
    }
  }
  function projectPlannedHeat(ship) {
    const heat = ship.heat;
    let h = Math.max(0, Math.min(heat.max, heat.value));
    let maxH = h;
    let posX = ship.x;
    let posY = ship.y;
    for (const wp of ship.waypoints) {
      const dx = wp.x - posX;
      const dy = wp.y - posY;
      const dist = Math.hypot(dx, dy);
      const v = Math.max(1e-6, Number.isFinite(wp.speed) ? wp.speed : 0);
      if (v <= 1e-6 || dist <= 1e-6) {
        posX = wp.x;
        posY = wp.y;
        continue;
      }
      const duration = dist / v;
      const dev = v - heat.markerSpeed;
      const Vn = Math.max(heat.markerSpeed, 1e-6);
      const p = heat.exp;
      const rate = dev >= 0 ? heat.kUp * Math.pow(dev / Vn, p) : -heat.kDown * Math.pow(Math.abs(dev) / Vn, p);
      h = Math.max(0, Math.min(heat.max, h + rate * duration));
      if (h > maxH) maxH = h;
      posX = wp.x;
      posY = wp.y;
    }
    return maxH;
  }
  function updateSpeedMarker() {
    var _a, _b;
    const shipHeat = (_a = stateRef.me) == null ? void 0 : _a.heat;
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
      const heatParams = stateRef.missileConfig.heatParams;
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
    const heat = (_a = stateRef.me) == null ? void 0 : _a.heat;
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
        busRef.emit("heat:stallTriggered", { stallUntil: heat.stallUntilMs });
      }
    } else {
      stallOverlay.classList.remove("visible");
      if (stallActive) {
        stallActive = false;
        busRef.emit("heat:stallRecovered", { value: heat.value });
      }
    }
  }
  function loop(timestamp) {
    if (!ctx || !cv) return;
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
    updateRouteAnimations(dtSeconds);
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawGrid();
    drawPlannedRoute("ship");
    drawPlannedRoute("missile");
    drawMissiles();
    updateMissileLaunchButtonState();
    for (const g of stateRef.ghosts) {
      drawShip(g.x, g.y, g.vx, g.vy, "#9ca3af", false);
      drawGhostDot(g.x, g.y);
    }
    if (stateRef.me) {
      drawShip(stateRef.me.x, stateRef.me.y, stateRef.me.vx, stateRef.me.vy, "#22d3ee", true);
    }
    requestAnimationFrame(loop);
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
  function osc(ctx2, type, freq) {
    return new OscillatorNode(ctx2, { type, frequency: freq });
  }
  function noise(ctx2) {
    const buffer = ctx2.createBuffer(1, ctx2.sampleRate * 2, ctx2.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return new AudioBufferSourceNode(ctx2, { buffer, loop: true });
  }
  function makePanner(ctx2, pan = 0) {
    return new StereoPannerNode(ctx2, { pan });
  }
  function adsr(ctx2, param, t0, a = 0.01, d = 0.08, s = 0.5, r = 0.2, peak = 1) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0, t0);
    param.linearRampToValueAtTime(peak, t0 + a);
    param.linearRampToValueAtTime(s * peak, t0 + a + d);
    return (releaseAt = ctx2.currentTime) => {
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
    const { ctx: ctx2, now } = engine;
    const out = engine.getSfxBus();
    const o = osc(ctx2, "square", 680 + 160 * velocity);
    const f = new BiquadFilterNode(ctx2, { type: "lowpass", frequency: 1200 });
    const g = new GainNode(ctx2, { gain: 0 });
    const p = makePanner(ctx2, pan);
    o.connect(f).connect(g).connect(p).connect(out);
    const release = adsr(ctx2, g.gain, now, 2e-3, 0.03, 0.25, 0.08, 0.65);
    o.start(now);
    release(now + 0.06);
    o.stop(now + 0.2);
  }
  function playThrust(engine, { velocity = 0.6, pan = 0 } = {}) {
    const { ctx: ctx2, now } = engine;
    const out = engine.getSfxBus();
    const n = noise(ctx2);
    const f = new BiquadFilterNode(ctx2, {
      type: "bandpass",
      frequency: 180 + 360 * velocity,
      Q: 1.1
    });
    const g = new GainNode(ctx2, { gain: 0 });
    const p = makePanner(ctx2, pan);
    n.connect(f).connect(g).connect(p).connect(out);
    const release = adsr(ctx2, g.gain, now, 0.012, 0.15, 0.75, 0.25, 0.45 * velocity);
    n.start(now);
    release(now + 0.25);
    n.stop(now + 1);
  }
  function playExplosion(engine, { velocity = 1, pan = 0 } = {}) {
    const { ctx: ctx2, now } = engine;
    const out = engine.getSfxBus();
    const n = noise(ctx2);
    const f = new BiquadFilterNode(ctx2, {
      type: "lowpass",
      frequency: 2200 * Math.max(0.2, Math.min(velocity, 1)),
      Q: 0.2
    });
    const g = new GainNode(ctx2, { gain: 0 });
    const p = makePanner(ctx2, pan);
    n.connect(f).connect(g).connect(p).connect(out);
    const release = adsr(ctx2, g.gain, now, 5e-3, 0.08, 0.5, 0.35, 1.1 * velocity);
    n.start(now);
    release(now + 0.15 + 0.1 * velocity);
    n.stop(now + 1.2);
  }
  function playLock(engine, { velocity = 1, pan = 0 } = {}) {
    const { ctx: ctx2, now } = engine;
    const out = engine.getSfxBus();
    const base = 520 + 140 * velocity;
    const o1 = osc(ctx2, "sine", base);
    const o2 = osc(ctx2, "sine", base * 1.5);
    const g = new GainNode(ctx2, { gain: 0 });
    const p = makePanner(ctx2, pan);
    o1.connect(g);
    o2.connect(g);
    g.connect(p).connect(out);
    const release = adsr(ctx2, g.gain, now, 1e-3, 0.02, 0, 0.12, 0.6);
    o1.start(now);
    o2.start(now + 0.02);
    release(now + 0.06);
    o1.stop(now + 0.2);
    o2.stop(now + 0.22);
  }
  function playUi(engine, { velocity = 1, pan = 0 } = {}) {
    const { ctx: ctx2, now } = engine;
    const out = engine.getSfxBus();
    const o = osc(ctx2, "triangle", 880 - 120 * velocity);
    const g = new GainNode(ctx2, { gain: 0 });
    const p = makePanner(ctx2, pan);
    o.connect(g).connect(p).connect(out);
    const release = adsr(ctx2, g.gain, now, 1e-3, 0.04, 0, 0.08, 0.35);
    o.start(now);
    release(now + 0.05);
    o.stop(now + 0.18);
  }
  function playDialogue(engine, { velocity = 1, pan = 0 } = {}) {
    const { ctx: ctx2, now } = engine;
    const out = engine.getSfxBus();
    const freq = 480 + 160 * velocity;
    const o = osc(ctx2, "sine", freq);
    const g = new GainNode(ctx2, { gain: 1e-4 });
    const p = makePanner(ctx2, pan);
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
    const ctx2 = window.LSD_AUDIO_CTX;
    return ctx2 instanceof AC ? ctx2 : null;
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
      const ctx2 = getCtx();
      if (ctx2) {
        try {
          if (muted && ctx2.state !== "suspended") {
            await ctx2.suspend();
          } else if (!muted && ctx2.state !== "running") {
            await ctx2.resume();
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
        const ctx2 = getCtx();
        if (!ctx2) {
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
    constructor(ctx2, targetGain, waveform, freqHz, destination, rng) {
      this.ctx = ctx2;
      this.targetGain = targetGain;
      this.killed = false;
      this.osc = new OscillatorNode(ctx2, { type: waveform, frequency: freqHz });
      this.shimmer = new OscillatorNode(ctx2, { type: "sine", frequency: rand(rng, 0.06, 0.18) });
      this.shimmerGain = new GainNode(ctx2, { gain: rand(rng, 0.4, 1.2) });
      this.scale = new GainNode(ctx2, { gain: 25 });
      this.shimmer.connect(this.shimmerGain).connect(this.scale).connect(this.osc.detune);
      this.g = new GainNode(ctx2, { gain: 0 });
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
    constructor(ctx2, out, seed = 1) {
      this.ctx = ctx2;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS50cyIsICJzcmMvdHV0b3JpYWwvaGlnaGxpZ2h0LnRzIiwgInNyYy90dXRvcmlhbC9zdG9yYWdlLnRzIiwgInNyYy90dXRvcmlhbC9yb2xlcy50cyIsICJzcmMvdHV0b3JpYWwvZW5naW5lLnRzIiwgInNyYy90dXRvcmlhbC9zdGVwc19iYXNpYy50cyIsICJzcmMvdHV0b3JpYWwvaW5kZXgudHMiLCAic3JjL3N0b3J5L292ZXJsYXkudHMiLCAic3JjL3N0b3J5L3N0b3JhZ2UudHMiLCAic3JjL2F1ZGlvL2VuZ2luZS50cyIsICJzcmMvYXVkaW8vZ3JhcGgudHMiLCAic3JjL2F1ZGlvL3NmeC50cyIsICJzcmMvc3Rvcnkvc2Z4LnRzIiwgInNyYy9zdG9yeS9lbmdpbmUudHMiLCAic3JjL3N0b3J5L2NoYXB0ZXJzL2ludHJvLnRzIiwgInNyYy9zdG9yeS9pbmRleC50cyIsICJzcmMvc3RhcnQtZ2F0ZS50cyIsICJzcmMvYXVkaW8vbXVzaWMvc2NlbmVzL2FtYmllbnQudHMiLCAic3JjL2F1ZGlvL211c2ljL2luZGV4LnRzIiwgInNyYy9hdWRpby9jdWVzLnRzIiwgInNyYy9tYWluLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgdHlwZSBTaGlwQ29udGV4dCA9IFwic2hpcFwiIHwgXCJtaXNzaWxlXCI7XG5leHBvcnQgdHlwZSBTaGlwVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcbmV4cG9ydCB0eXBlIE1pc3NpbGVUb29sID0gXCJzZXRcIiB8IFwic2VsZWN0XCIgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50TWFwIHtcbiAgXCJjb250ZXh0OmNoYW5nZWRcIjogeyBjb250ZXh0OiBTaGlwQ29udGV4dCB9O1xuICBcInNoaXA6dG9vbENoYW5nZWRcIjogeyB0b29sOiBTaGlwVG9vbCB9O1xuICBcInNoaXA6d2F5cG9pbnRBZGRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50TW92ZWRcIjogeyBpbmRleDogbnVtYmVyOyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuICBcInNoaXA6bGVnU2VsZWN0ZWRcIjogeyBpbmRleDogbnVtYmVyIHwgbnVsbCB9O1xuICBcInNoaXA6d2F5cG9pbnREZWxldGVkXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcInNoaXA6d2F5cG9pbnRzQ2xlYXJlZFwiOiB2b2lkO1xuICBcInNoaXA6Y2xlYXJJbnZva2VkXCI6IHZvaWQ7XG4gIFwic2hpcDpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwic2hpcDpoZWF0UHJvamVjdGlvblVwZGF0ZWRcIjogeyBoZWF0VmFsdWVzOiBudW1iZXJbXSB9O1xuICBcImhlYXQ6bWFya2VyQWxpZ25lZFwiOiB7IHZhbHVlOiBudW1iZXI7IG1hcmtlcjogbnVtYmVyIH07XG4gIFwiaGVhdDp3YXJuRW50ZXJlZFwiOiB7IHZhbHVlOiBudW1iZXI7IHdhcm5BdDogbnVtYmVyIH07XG4gIFwiaGVhdDpjb29sZWRCZWxvd1dhcm5cIjogeyB2YWx1ZTogbnVtYmVyOyB3YXJuQXQ6IG51bWJlciB9O1xuICBcImhlYXQ6c3RhbGxUcmlnZ2VyZWRcIjogeyBzdGFsbFVudGlsOiBudW1iZXIgfTtcbiAgXCJoZWF0OnN0YWxsUmVjb3ZlcmVkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcImhlYXQ6ZHVhbE1ldGVyRGl2ZXJnZWRcIjogeyBwbGFubmVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyIH07XG4gIFwidWk6d2F5cG9pbnRIb3ZlclN0YXJ0XCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcInVpOndheXBvaW50SG92ZXJFbmRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpyb3V0ZUFkZGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZURlbGV0ZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOnJvdXRlUmVuYW1lZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nIH07XG4gIFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfCBudWxsIH07XG4gIFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiOiB7IHRvb2w6IE1pc3NpbGVUb29sIH07XG4gIFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCI6IHsgcm91dGVJZDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50c0NsZWFyZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiOiB7IHZhbHVlOiBudW1iZXI7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmFncm9DaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpsYXVuY2hlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6Y29vbGRvd25VcGRhdGVkXCI6IHsgc2Vjb25kc1JlbWFpbmluZzogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpkZWxldGVJbnZva2VkXCI6IHZvaWQ7XG4gIFwibWlzc2lsZTpwcmVzZXRTZWxlY3RlZFwiOiB7IHByZXNldE5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6aGVhdFByb2plY3Rpb25VcGRhdGVkXCI6IHsgd2lsbE92ZXJoZWF0OiBib29sZWFuOyBvdmVyaGVhdEF0PzogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpvdmVyaGVhdGVkXCI6IHsgbWlzc2lsZUlkOiBzdHJpbmc7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG4gIFwiaGVscDp2aXNpYmxlQ2hhbmdlZFwiOiB7IHZpc2libGU6IGJvb2xlYW4gfTtcbiAgXCJzdGF0ZTp1cGRhdGVkXCI6IHZvaWQ7XG4gIFwidHV0b3JpYWw6c3RhcnRlZFwiOiB7IGlkOiBzdHJpbmcgfTtcbiAgXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiOiB7IGlkOiBzdHJpbmc7IHN0ZXBJbmRleDogbnVtYmVyOyB0b3RhbDogbnVtYmVyIH07XG4gIFwidHV0b3JpYWw6Y29tcGxldGVkXCI6IHsgaWQ6IHN0cmluZyB9O1xuICBcInR1dG9yaWFsOnNraXBwZWRcIjogeyBpZDogc3RyaW5nOyBhdFN0ZXA6IG51bWJlciB9O1xuICBcImJvdDpzcGF3blJlcXVlc3RlZFwiOiB2b2lkO1xuICBcImRpYWxvZ3VlOm9wZW5lZFwiOiB7IG5vZGVJZDogc3RyaW5nOyBjaGFwdGVySWQ6IHN0cmluZyB9O1xuICBcImRpYWxvZ3VlOmNsb3NlZFwiOiB7IG5vZGVJZDogc3RyaW5nOyBjaGFwdGVySWQ6IHN0cmluZyB9O1xuICBcImRpYWxvZ3VlOmNob2ljZVwiOiB7IG5vZGVJZDogc3RyaW5nOyBjaG9pY2VJZDogc3RyaW5nOyBjaGFwdGVySWQ6IHN0cmluZyB9O1xuICBcInN0b3J5OmZsYWdVcGRhdGVkXCI6IHsgZmxhZzogc3RyaW5nOyB2YWx1ZTogYm9vbGVhbiB9O1xuICBcInN0b3J5OnByb2dyZXNzZWRcIjogeyBjaGFwdGVySWQ6IHN0cmluZzsgbm9kZUlkOiBzdHJpbmcgfTtcbiAgXCJhdWRpbzpyZXN1bWVcIjogdm9pZDtcbiAgXCJhdWRpbzptdXRlXCI6IHZvaWQ7XG4gIFwiYXVkaW86dW5tdXRlXCI6IHZvaWQ7XG4gIFwiYXVkaW86c2V0LW1hc3Rlci1nYWluXCI6IHsgZ2FpbjogbnVtYmVyIH07XG4gIFwiYXVkaW86c2Z4XCI6IHsgbmFtZTogXCJ1aVwiIHwgXCJsYXNlclwiIHwgXCJ0aHJ1c3RcIiB8IFwiZXhwbG9zaW9uXCIgfCBcImxvY2tcIiB8IFwiZGlhbG9ndWVcIjsgdmVsb2NpdHk/OiBudW1iZXI7IHBhbj86IG51bWJlciB9O1xuICBcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiOiB7IHNjZW5lOiBcImFtYmllbnRcIiB8IFwiY29tYmF0XCIgfCBcImxvYmJ5XCI7IHNlZWQ/OiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzpwYXJhbVwiOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6dHJhbnNwb3J0XCI6IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9O1xufVxuXG5leHBvcnQgdHlwZSBFdmVudEtleSA9IGtleW9mIEV2ZW50TWFwO1xuZXhwb3J0IHR5cGUgRXZlbnRQYXlsb2FkPEsgZXh0ZW5kcyBFdmVudEtleT4gPSBFdmVudE1hcFtLXTtcbmV4cG9ydCB0eXBlIEhhbmRsZXI8SyBleHRlbmRzIEV2ZW50S2V5PiA9IChwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pID0+IHZvaWQ7XG5cbnR5cGUgVm9pZEtleXMgPSB7XG4gIFtLIGluIEV2ZW50S2V5XTogRXZlbnRNYXBbS10gZXh0ZW5kcyB2b2lkID8gSyA6IG5ldmVyXG59W0V2ZW50S2V5XTtcblxudHlwZSBOb25Wb2lkS2V5cyA9IEV4Y2x1ZGU8RXZlbnRLZXksIFZvaWRLZXlzPjtcblxuZXhwb3J0IGludGVyZmFjZSBFdmVudEJ1cyB7XG4gIG9uPEsgZXh0ZW5kcyBFdmVudEtleT4oZXZlbnQ6IEssIGhhbmRsZXI6IEhhbmRsZXI8Sz4pOiAoKSA9PiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBOb25Wb2lkS2V5cz4oZXZlbnQ6IEssIHBheWxvYWQ6IEV2ZW50UGF5bG9hZDxLPik6IHZvaWQ7XG4gIGVtaXQ8SyBleHRlbmRzIFZvaWRLZXlzPihldmVudDogSyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFdmVudEJ1cygpOiBFdmVudEJ1cyB7XG4gIGNvbnN0IGhhbmRsZXJzID0gbmV3IE1hcDxFdmVudEtleSwgU2V0PEZ1bmN0aW9uPj4oKTtcbiAgcmV0dXJuIHtcbiAgICBvbihldmVudCwgaGFuZGxlcikge1xuICAgICAgbGV0IHNldCA9IGhhbmRsZXJzLmdldChldmVudCk7XG4gICAgICBpZiAoIXNldCkge1xuICAgICAgICBzZXQgPSBuZXcgU2V0KCk7XG4gICAgICAgIGhhbmRsZXJzLnNldChldmVudCwgc2V0KTtcbiAgICAgIH1cbiAgICAgIHNldC5hZGQoaGFuZGxlcik7XG4gICAgICByZXR1cm4gKCkgPT4gc2V0IS5kZWxldGUoaGFuZGxlcik7XG4gICAgfSxcbiAgICBlbWl0KGV2ZW50OiBFdmVudEtleSwgcGF5bG9hZD86IHVua25vd24pIHtcbiAgICAgIGNvbnN0IHNldCA9IGhhbmRsZXJzLmdldChldmVudCk7XG4gICAgICBpZiAoIXNldCB8fCBzZXQuc2l6ZSA9PT0gMCkgcmV0dXJuO1xuICAgICAgZm9yIChjb25zdCBmbiBvZiBzZXQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAoZm4gYXMgKHZhbHVlPzogdW5rbm93bikgPT4gdm9pZCkocGF5bG9hZCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtidXNdIGhhbmRsZXIgZm9yICR7ZXZlbnR9IGZhaWxlZGAsIGVycik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgU2hpcENvbnRleHQsIFNoaXBUb29sLCBNaXNzaWxlVG9vbCB9IGZyb20gXCIuL2J1c1wiO1xuXG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fU1BFRUQgPSA0MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9TUEVFRCA9IDI1MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9BR1JPID0gMTAwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUFYX0xJRkVUSU1FID0gMTIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX0xJRkVUSU1FID0gMjA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9TUEVFRF9QRU5BTFRZID0gODA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1BFTkFMVFkgPSA0MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUkVGID0gMjAwMDtcblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlTGltaXRzIHtcbiAgc3BlZWRNaW46IG51bWJlcjtcbiAgc3BlZWRNYXg6IG51bWJlcjtcbiAgYWdyb01pbjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHNwZWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFZpZXcge1xuICB2YWx1ZTogbnVtYmVyO1xuICBtYXg6IG51bWJlcjtcbiAgd2FybkF0OiBudW1iZXI7XG4gIG92ZXJoZWF0QXQ6IG51bWJlcjtcbiAgbWFya2VyU3BlZWQ6IG51bWJlcjtcbiAgc3RhbGxVbnRpbE1zOiBudW1iZXI7IC8vIGNsaWVudC1zeW5jZWQgdGltZSBpbiBtaWxsaXNlY29uZHNcbiAga1VwOiBudW1iZXI7XG4gIGtEb3duOiBudW1iZXI7XG4gIGV4cDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNoaXBTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBocD86IG51bWJlcjtcbiAga2lsbHM/OiBudW1iZXI7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbiAgaGVhdD86IEhlYXRWaWV3O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdob3N0U25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlU25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgc2VsZj86IGJvb2xlYW47XG4gIGFncm9fcmFkaXVzOiBudW1iZXI7XG4gIGhlYXQ/OiBIZWF0VmlldzsgLy8gTWlzc2lsZSBoZWF0IGRhdGFcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIZWF0UGFyYW1zIHtcbiAgbWF4OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlQ29uZmlnIHtcbiAgc3BlZWQ6IG51bWJlcjtcbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuICBsaWZldGltZTogbnVtYmVyO1xuICBoZWF0UGFyYW1zPzogSGVhdFBhcmFtczsgLy8gT3B0aW9uYWwgY3VzdG9tIGhlYXQgY29uZmlndXJhdGlvblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVQcmVzZXQge1xuICBuYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHNwZWVkOiBudW1iZXI7XG4gIGFncm9SYWRpdXM6IG51bWJlcjtcbiAgaGVhdFBhcmFtczogSGVhdFBhcmFtcztcbn1cblxuLy8gTWlzc2lsZSBwcmVzZXQgZGVmaW5pdGlvbnMgbWF0Y2hpbmcgYmFja2VuZFxuZXhwb3J0IGNvbnN0IE1JU1NJTEVfUFJFU0VUUzogTWlzc2lsZVByZXNldFtdID0gW1xuICB7XG4gICAgbmFtZTogXCJTY291dFwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlNsb3csIGVmZmljaWVudCwgbG9uZy1yYW5nZS4gSGlnaCBoZWF0IGNhcGFjaXR5LlwiLFxuICAgIHNwZWVkOiA4MCxcbiAgICBhZ3JvUmFkaXVzOiAxNTAwLFxuICAgIGhlYXRQYXJhbXM6IHtcbiAgICAgIG1heDogNjAsXG4gICAgICB3YXJuQXQ6IDQyLFxuICAgICAgb3ZlcmhlYXRBdDogNjAsXG4gICAgICBtYXJrZXJTcGVlZDogNzAsXG4gICAgICBrVXA6IDIwLFxuICAgICAga0Rvd246IDE1LFxuICAgICAgZXhwOiAxLjUsXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiSHVudGVyXCIsXG4gICAgZGVzY3JpcHRpb246IFwiQmFsYW5jZWQgc3BlZWQgYW5kIGRldGVjdGlvbi4gU3RhbmRhcmQgaGVhdC5cIixcbiAgICBzcGVlZDogMTUwLFxuICAgIGFncm9SYWRpdXM6IDgwMCxcbiAgICBoZWF0UGFyYW1zOiB7XG4gICAgICBtYXg6IDUwLFxuICAgICAgd2FybkF0OiAzNSxcbiAgICAgIG92ZXJoZWF0QXQ6IDUwLFxuICAgICAgbWFya2VyU3BlZWQ6IDEyMCxcbiAgICAgIGtVcDogMjgsXG4gICAgICBrRG93bjogMTIsXG4gICAgICBleHA6IDEuNSxcbiAgICB9LFxuICB9LFxuICB7XG4gICAgbmFtZTogXCJTbmlwZXJcIixcbiAgICBkZXNjcmlwdGlvbjogXCJGYXN0LCBuYXJyb3cgZGV0ZWN0aW9uLiBMb3cgaGVhdCBjYXBhY2l0eS5cIixcbiAgICBzcGVlZDogMjIwLFxuICAgIGFncm9SYWRpdXM6IDMwMCxcbiAgICBoZWF0UGFyYW1zOiB7XG4gICAgICBtYXg6IDQwLFxuICAgICAgd2FybkF0OiAyOCxcbiAgICAgIG92ZXJoZWF0QXQ6IDQwLFxuICAgICAgbWFya2VyU3BlZWQ6IDE4MCxcbiAgICAgIGtVcDogMzUsXG4gICAgICBrRG93bjogOCxcbiAgICAgIGV4cDogMS41LFxuICAgIH0sXG4gIH0sXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWV0YSB7XG4gIGM/OiBudW1iZXI7XG4gIHc/OiBudW1iZXI7XG4gIGg/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBwU3RhdGUge1xuICBub3c6IG51bWJlcjtcbiAgbm93U3luY2VkQXQ6IG51bWJlcjtcbiAgbWU6IFNoaXBTbmFwc2hvdCB8IG51bGw7XG4gIGdob3N0czogR2hvc3RTbmFwc2hvdFtdO1xuICBtaXNzaWxlczogTWlzc2lsZVNuYXBzaG90W107XG4gIG1pc3NpbGVSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdO1xuICBhY3RpdmVNaXNzaWxlUm91dGVJZDogc3RyaW5nIHwgbnVsbDtcbiAgbmV4dE1pc3NpbGVSZWFkeUF0OiBudW1iZXI7XG4gIG1pc3NpbGVDb25maWc6IE1pc3NpbGVDb25maWc7XG4gIG1pc3NpbGVMaW1pdHM6IE1pc3NpbGVMaW1pdHM7XG4gIHdvcmxkTWV0YTogV29ybGRNZXRhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlbGVjdGlvbiB7XG4gIHR5cGU6IFwid2F5cG9pbnRcIiB8IFwibGVnXCI7XG4gIGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVNlbGVjdGlvbiB7XG4gIHR5cGU6IFwid2F5cG9pbnRcIiB8IFwicm91dGVcIjtcbiAgaW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgQWN0aXZlVG9vbCA9XG4gIHwgXCJzaGlwLXNldFwiXG4gIHwgXCJzaGlwLXNlbGVjdFwiXG4gIHwgXCJtaXNzaWxlLXNldFwiXG4gIHwgXCJtaXNzaWxlLXNlbGVjdFwiXG4gIHwgbnVsbDtcblxuZXhwb3J0IGludGVyZmFjZSBVSVN0YXRlIHtcbiAgaW5wdXRDb250ZXh0OiBTaGlwQ29udGV4dDtcbiAgc2hpcFRvb2w6IFNoaXBUb29sO1xuICBtaXNzaWxlVG9vbDogTWlzc2lsZVRvb2w7XG4gIGFjdGl2ZVRvb2w6IEFjdGl2ZVRvb2w7XG4gIHNob3dTaGlwUm91dGU6IGJvb2xlYW47XG4gIGhlbHBWaXNpYmxlOiBib29sZWFuO1xuICB6b29tOiBudW1iZXI7XG4gIHBhblg6IG51bWJlcjtcbiAgcGFuWTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFVJU3RhdGUoKTogVUlTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgaW5wdXRDb250ZXh0OiBcInNoaXBcIixcbiAgICBzaGlwVG9vbDogXCJzZXRcIixcbiAgICBtaXNzaWxlVG9vbDogbnVsbCxcbiAgICBhY3RpdmVUb29sOiBcInNoaXAtc2V0XCIsXG4gICAgc2hvd1NoaXBSb3V0ZTogdHJ1ZSxcbiAgICBoZWxwVmlzaWJsZTogZmFsc2UsXG4gICAgem9vbTogMS4wLFxuICAgIHBhblg6IDAsXG4gICAgcGFuWTogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxTdGF0ZShsaW1pdHM6IE1pc3NpbGVMaW1pdHMgPSB7XG4gIHNwZWVkTWluOiBNSVNTSUxFX01JTl9TUEVFRCxcbiAgc3BlZWRNYXg6IE1JU1NJTEVfTUFYX1NQRUVELFxuICBhZ3JvTWluOiBNSVNTSUxFX01JTl9BR1JPLFxufSk6IEFwcFN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBub3c6IDAsXG4gICAgbm93U3luY2VkQXQ6IHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSBcImZ1bmN0aW9uXCJcbiAgICAgID8gcGVyZm9ybWFuY2Uubm93KClcbiAgICAgIDogRGF0ZS5ub3coKSxcbiAgICBtZTogbnVsbCxcbiAgICBnaG9zdHM6IFtdLFxuICAgIG1pc3NpbGVzOiBbXSxcbiAgICBtaXNzaWxlUm91dGVzOiBbXSxcbiAgICBhY3RpdmVNaXNzaWxlUm91dGVJZDogbnVsbCxcbiAgICBuZXh0TWlzc2lsZVJlYWR5QXQ6IDAsXG4gICAgbWlzc2lsZUNvbmZpZzoge1xuICAgICAgc3BlZWQ6IDE4MCxcbiAgICAgIGFncm9SYWRpdXM6IDgwMCxcbiAgICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IoMTgwLCA4MDAsIGxpbWl0cyksXG4gICAgICBoZWF0UGFyYW1zOiBNSVNTSUxFX1BSRVNFVFNbMV0uaGVhdFBhcmFtcywgLy8gRGVmYXVsdCB0byBIdW50ZXIgcHJlc2V0XG4gICAgfSxcbiAgICBtaXNzaWxlTGltaXRzOiBsaW1pdHMsXG4gICAgd29ybGRNZXRhOiB7fSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pc3NpbGVMaWZldGltZUZvcihzcGVlZDogbnVtYmVyLCBhZ3JvUmFkaXVzOiBudW1iZXIsIGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogbnVtYmVyIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBzcGFuID0gbWF4U3BlZWQgLSBtaW5TcGVlZDtcbiAgY29uc3Qgc3BlZWROb3JtID0gc3BhbiA+IDAgPyBjbGFtcCgoc3BlZWQgLSBtaW5TcGVlZCkgLyBzcGFuLCAwLCAxKSA6IDA7XG4gIGNvbnN0IGFkanVzdGVkQWdybyA9IE1hdGgubWF4KDAsIGFncm9SYWRpdXMgLSBtaW5BZ3JvKTtcbiAgY29uc3QgYWdyb05vcm0gPSBjbGFtcChhZGp1c3RlZEFncm8gLyBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUkVGLCAwLCAxKTtcbiAgY29uc3QgcmVkdWN0aW9uID0gc3BlZWROb3JtICogTUlTU0lMRV9MSUZFVElNRV9TUEVFRF9QRU5BTFRZICsgYWdyb05vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUEVOQUxUWTtcbiAgY29uc3QgYmFzZSA9IE1JU1NJTEVfTUFYX0xJRkVUSU1FO1xuICByZXR1cm4gY2xhbXAoYmFzZSAtIHJlZHVjdGlvbiwgTUlTU0lMRV9NSU5fTElGRVRJTUUsIE1JU1NJTEVfTUFYX0xJRkVUSU1FKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplTWlzc2lsZUNvbmZpZyhcbiAgY2ZnOiBQYXJ0aWFsPFBpY2s8TWlzc2lsZUNvbmZpZywgXCJzcGVlZFwiIHwgXCJhZ3JvUmFkaXVzXCIgfCBcImhlYXRQYXJhbXNcIj4+LFxuICBmYWxsYmFjazogTWlzc2lsZUNvbmZpZyxcbiAgbGltaXRzOiBNaXNzaWxlTGltaXRzLFxuKTogTWlzc2lsZUNvbmZpZyB7XG4gIGNvbnN0IG1pblNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4gOiBNSVNTSUxFX01JTl9TUEVFRDtcbiAgY29uc3QgbWF4U3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCA6IE1JU1NJTEVfTUFYX1NQRUVEO1xuICBjb25zdCBtaW5BZ3JvID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluIDogTUlTU0lMRV9NSU5fQUdSTztcbiAgY29uc3QgYmFzZSA9IGZhbGxiYWNrID8/IHtcbiAgICBzcGVlZDogbWluU3BlZWQsXG4gICAgYWdyb1JhZGl1czogbWluQWdybyxcbiAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKG1pblNwZWVkLCBtaW5BZ3JvLCBsaW1pdHMpLFxuICB9O1xuICBjb25zdCBtZXJnZWRTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgPyAoY2ZnLnNwZWVkID8/IGJhc2Uuc3BlZWQpIDogYmFzZS5zcGVlZDtcbiAgY29uc3QgbWVyZ2VkQWdybyA9IE51bWJlci5pc0Zpbml0ZShjZmcuYWdyb1JhZGl1cyA/PyBiYXNlLmFncm9SYWRpdXMpID8gKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgOiBiYXNlLmFncm9SYWRpdXM7XG4gIGNvbnN0IHNwZWVkID0gY2xhbXAobWVyZ2VkU3BlZWQsIG1pblNwZWVkLCBtYXhTcGVlZCk7XG4gIGNvbnN0IGFncm9SYWRpdXMgPSBNYXRoLm1heChtaW5BZ3JvLCBtZXJnZWRBZ3JvKTtcbiAgY29uc3QgaGVhdFBhcmFtcyA9IGNmZy5oZWF0UGFyYW1zID8geyAuLi5jZmcuaGVhdFBhcmFtcyB9IDogYmFzZS5oZWF0UGFyYW1zID8geyAuLi5iYXNlLmhlYXRQYXJhbXMgfSA6IHVuZGVmaW5lZDtcbiAgcmV0dXJuIHtcbiAgICBzcGVlZCxcbiAgICBhZ3JvUmFkaXVzLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3Ioc3BlZWQsIGFncm9SYWRpdXMsIGxpbWl0cyksXG4gICAgaGVhdFBhcmFtcyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vbm90b25pY05vdygpOiBudW1iZXIge1xuICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgfVxuICByZXR1cm4gRGF0ZS5ub3coKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lV2F5cG9pbnRMaXN0KGxpc3Q6IFdheXBvaW50W10gfCB1bmRlZmluZWQgfCBudWxsKTogV2F5cG9pbnRbXSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShsaXN0KSkgcmV0dXJuIFtdO1xuICByZXR1cm4gbGlzdC5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSk7XG59XG5cbi8vIFByb2plY3QgaGVhdCBhbG9uZyBhIG1pc3NpbGUgcm91dGVcbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVJvdXRlUHJvamVjdGlvbiB7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbiAgaGVhdEF0V2F5cG9pbnRzOiBudW1iZXJbXTtcbiAgd2lsbE92ZXJoZWF0OiBib29sZWFuO1xuICBvdmVyaGVhdEF0PzogbnVtYmVyOyAvLyBJbmRleCB3aGVyZSBvdmVyaGVhdCBvY2N1cnNcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RNaXNzaWxlSGVhdChcbiAgcm91dGU6IFdheXBvaW50W10sXG4gIGRlZmF1bHRTcGVlZDogbnVtYmVyLFxuICBoZWF0UGFyYW1zOiBIZWF0UGFyYW1zXG4pOiBNaXNzaWxlUm91dGVQcm9qZWN0aW9uIHtcbiAgY29uc3QgcHJvamVjdGlvbjogTWlzc2lsZVJvdXRlUHJvamVjdGlvbiA9IHtcbiAgICB3YXlwb2ludHM6IHJvdXRlLFxuICAgIGhlYXRBdFdheXBvaW50czogW10sXG4gICAgd2lsbE92ZXJoZWF0OiBmYWxzZSxcbiAgfTtcblxuICBpZiAocm91dGUubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHByb2plY3Rpb247XG4gIH1cblxuICBsZXQgaGVhdCA9IDA7IC8vIE1pc3NpbGVzIHN0YXJ0IGF0IHplcm8gaGVhdFxuICBsZXQgcG9zID0geyB4OiByb3V0ZVswXS54LCB5OiByb3V0ZVswXS55IH07XG4gIGxldCBjdXJyZW50U3BlZWQgPSByb3V0ZVswXS5zcGVlZCA+IDAgPyByb3V0ZVswXS5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcblxuICBwcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuXG4gIGZvciAobGV0IGkgPSAxOyBpIDwgcm91dGUubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB0YXJnZXRQb3MgPSByb3V0ZVtpXTtcbiAgICBjb25zdCB0YXJnZXRTcGVlZCA9IHRhcmdldFBvcy5zcGVlZCA+IDAgPyB0YXJnZXRQb3Muc3BlZWQgOiBkZWZhdWx0U3BlZWQ7XG5cbiAgICAvLyBDYWxjdWxhdGUgZGlzdGFuY2UgYW5kIHRpbWVcbiAgICBjb25zdCBkeCA9IHRhcmdldFBvcy54IC0gcG9zLng7XG4gICAgY29uc3QgZHkgPSB0YXJnZXRQb3MueSAtIHBvcy55O1xuICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcblxuICAgIGlmIChkaXN0YW5jZSA8IDAuMDAxKSB7XG4gICAgICBwcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gQXZlcmFnZSBzcGVlZCBkdXJpbmcgc2VnbWVudFxuICAgIGNvbnN0IGF2Z1NwZWVkID0gKGN1cnJlbnRTcGVlZCArIHRhcmdldFNwZWVkKSAqIDAuNTtcbiAgICBjb25zdCBzZWdtZW50VGltZSA9IGRpc3RhbmNlIC8gTWF0aC5tYXgoYXZnU3BlZWQsIDEpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGhlYXQgcmF0ZSAobWF0Y2ggc2VydmVyIGZvcm11bGEpXG4gICAgY29uc3QgVm4gPSBNYXRoLm1heChoZWF0UGFyYW1zLm1hcmtlclNwZWVkLCAwLjAwMDAwMSk7XG4gICAgY29uc3QgZGV2ID0gYXZnU3BlZWQgLSBoZWF0UGFyYW1zLm1hcmtlclNwZWVkO1xuICAgIGNvbnN0IHAgPSBoZWF0UGFyYW1zLmV4cDtcblxuICAgIGxldCBoZG90OiBudW1iZXI7XG4gICAgaWYgKGRldiA+PSAwKSB7XG4gICAgICAvLyBIZWF0aW5nXG4gICAgICBoZG90ID0gaGVhdFBhcmFtcy5rVXAgKiBNYXRoLnBvdyhkZXYgLyBWbiwgcCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENvb2xpbmdcbiAgICAgIGhkb3QgPSAtaGVhdFBhcmFtcy5rRG93biAqIE1hdGgucG93KE1hdGguYWJzKGRldikgLyBWbiwgcCk7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIGhlYXRcbiAgICBoZWF0ICs9IGhkb3QgKiBzZWdtZW50VGltZTtcbiAgICBoZWF0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaGVhdCwgaGVhdFBhcmFtcy5tYXgpKTtcblxuICAgIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG4gICAgcG9zID0geyB4OiB0YXJnZXRQb3MueCwgeTogdGFyZ2V0UG9zLnkgfTtcbiAgICBjdXJyZW50U3BlZWQgPSB0YXJnZXRTcGVlZDtcblxuICAgIC8vIENoZWNrIGZvciBvdmVyaGVhdFxuICAgIGlmIChoZWF0ID49IGhlYXRQYXJhbXMub3ZlcmhlYXRBdCAmJiAhcHJvamVjdGlvbi53aWxsT3ZlcmhlYXQpIHtcbiAgICAgIHByb2plY3Rpb24ud2lsbE92ZXJoZWF0ID0gdHJ1ZTtcbiAgICAgIHByb2plY3Rpb24ub3ZlcmhlYXRBdCA9IGk7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIHBvc2l0aW9uIGFuZCBzcGVlZFxuICAgIHBvcyA9IHRhcmdldFBvcztcbiAgICBjdXJyZW50U3BlZWQgPSB0YXJnZXRTcGVlZDtcbiAgfVxuXG4gIHJldHVybiBwcm9qZWN0aW9uO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUxpbWl0cyhzdGF0ZTogQXBwU3RhdGUsIGxpbWl0czogUGFydGlhbDxNaXNzaWxlTGltaXRzPik6IHZvaWQge1xuICBzdGF0ZS5taXNzaWxlTGltaXRzID0ge1xuICAgIHNwZWVkTWluOiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWluLFxuICAgIHNwZWVkTWF4OiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWF4LFxuICAgIGFncm9NaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLmFncm9NaW4sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgdHlwZSBFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHtcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIG1vbm90b25pY05vdyxcbiAgc2FuaXRpemVNaXNzaWxlQ29uZmlnLFxuICB1cGRhdGVNaXNzaWxlTGltaXRzLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHNwZWVkPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVJvdXRlIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZT86IHN0cmluZztcbiAgd2F5cG9pbnRzPzogU2VydmVyTWlzc2lsZVdheXBvaW50W107XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJIZWF0VmlldyB7XG4gIHY6IG51bWJlcjsgIC8vIGN1cnJlbnQgaGVhdCB2YWx1ZVxuICBtOiBudW1iZXI7ICAvLyBtYXhcbiAgdzogbnVtYmVyOyAgLy8gd2FybkF0XG4gIG86IG51bWJlcjsgIC8vIG92ZXJoZWF0QXRcbiAgbXM6IG51bWJlcjsgLy8gbWFya2VyU3BlZWRcbiAgc3U6IG51bWJlcjsgLy8gc3RhbGxVbnRpbCAoc2VydmVyIHRpbWUgc2Vjb25kcylcbiAga3U6IG51bWJlcjsgLy8ga1VwXG4gIGtkOiBudW1iZXI7IC8vIGtEb3duXG4gIGV4OiBudW1iZXI7IC8vIGV4cFxufVxuXG5pbnRlcmZhY2UgU2VydmVyU2hpcFN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIGhwPzogbnVtYmVyO1xuICBraWxscz86IG51bWJlcjtcbiAgd2F5cG9pbnRzPzogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgc3BlZWQ/OiBudW1iZXIgfT47XG4gIGhlYXQ/OiBTZXJ2ZXJIZWF0Vmlldztcbn1cblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVTdGF0ZSB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlclN0YXRlTWVzc2FnZSB7XG4gIHR5cGU6IFwic3RhdGVcIjtcbiAgbm93OiBudW1iZXI7XG4gIG5leHRfbWlzc2lsZV9yZWFkeT86IG51bWJlcjtcbiAgbWU/OiBTZXJ2ZXJTaGlwU3RhdGUgfCBudWxsO1xuICBnaG9zdHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB2eDogbnVtYmVyOyB2eTogbnVtYmVyIH0+O1xuICBtaXNzaWxlcz86IFNlcnZlck1pc3NpbGVTdGF0ZVtdO1xuICBtaXNzaWxlX3JvdXRlcz86IFNlcnZlck1pc3NpbGVSb3V0ZVtdO1xuICBtaXNzaWxlX2NvbmZpZz86IHtcbiAgICBzcGVlZD86IG51bWJlcjtcbiAgICBzcGVlZF9taW4/OiBudW1iZXI7XG4gICAgc3BlZWRfbWF4PzogbnVtYmVyO1xuICAgIGFncm9fcmFkaXVzPzogbnVtYmVyO1xuICAgIGFncm9fbWluPzogbnVtYmVyO1xuICAgIGxpZmV0aW1lPzogbnVtYmVyO1xuICAgIGhlYXRfY29uZmlnPzoge1xuICAgICAgbWF4PzogbnVtYmVyO1xuICAgICAgd2Fybl9hdD86IG51bWJlcjtcbiAgICAgIG92ZXJoZWF0X2F0PzogbnVtYmVyO1xuICAgICAgbWFya2VyX3NwZWVkPzogbnVtYmVyO1xuICAgICAga191cD86IG51bWJlcjtcbiAgICAgIGtfZG93bj86IG51bWJlcjtcbiAgICAgIGV4cD86IG51bWJlcjtcbiAgICB9IHwgbnVsbDtcbiAgfSB8IG51bGw7XG4gIGFjdGl2ZV9taXNzaWxlX3JvdXRlPzogc3RyaW5nIHwgbnVsbDtcbiAgbWV0YT86IHtcbiAgICBjPzogbnVtYmVyO1xuICAgIHc/OiBudW1iZXI7XG4gICAgaD86IG51bWJlcjtcbiAgfTtcbn1cblxuaW50ZXJmYWNlIENvbm5lY3RPcHRpb25zIHtcbiAgcm9vbTogc3RyaW5nO1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG9uU3RhdGVVcGRhdGVkPzogKCkgPT4gdm9pZDtcbiAgb25PcGVuPzogKHNvY2tldDogV2ViU29ja2V0KSA9PiB2b2lkO1xuICBtYXBXPzogbnVtYmVyO1xuICBtYXBIPzogbnVtYmVyO1xufVxuXG5sZXQgd3M6IFdlYlNvY2tldCB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gc2VuZE1lc3NhZ2UocGF5bG9hZDogdW5rbm93bik6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG4gIGNvbnN0IGRhdGEgPSB0eXBlb2YgcGF5bG9hZCA9PT0gXCJzdHJpbmdcIiA/IHBheWxvYWQgOiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKTtcbiAgd3Muc2VuZChkYXRhKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbm5lY3RXZWJTb2NrZXQoeyByb29tLCBzdGF0ZSwgYnVzLCBvblN0YXRlVXBkYXRlZCwgb25PcGVuLCBtYXBXLCBtYXBIIH06IENvbm5lY3RPcHRpb25zKTogdm9pZCB7XG4gIGNvbnN0IHByb3RvY29sID0gd2luZG93LmxvY2F0aW9uLnByb3RvY29sID09PSBcImh0dHBzOlwiID8gXCJ3c3M6Ly9cIiA6IFwid3M6Ly9cIjtcbiAgbGV0IHdzVXJsID0gYCR7cHJvdG9jb2x9JHt3aW5kb3cubG9jYXRpb24uaG9zdH0vd3M/cm9vbT0ke2VuY29kZVVSSUNvbXBvbmVudChyb29tKX1gO1xuICBpZiAobWFwVyAmJiBtYXBXID4gMCkge1xuICAgIHdzVXJsICs9IGAmbWFwVz0ke21hcFd9YDtcbiAgfVxuICBpZiAobWFwSCAmJiBtYXBIID4gMCkge1xuICAgIHdzVXJsICs9IGAmbWFwSD0ke21hcEh9YDtcbiAgfVxuICB3cyA9IG5ldyBXZWJTb2NrZXQod3NVcmwpO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwib3BlblwiLCAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coXCJbd3NdIG9wZW5cIik7XG4gICAgY29uc3Qgc29ja2V0ID0gd3M7XG4gICAgaWYgKHNvY2tldCAmJiBvbk9wZW4pIHtcbiAgICAgIG9uT3Blbihzb2NrZXQpO1xuICAgIH1cbiAgfSk7XG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbG9zZVwiLCAoKSA9PiBjb25zb2xlLmxvZyhcIlt3c10gY2xvc2VcIikpO1xuXG4gIGxldCBwcmV2Um91dGVzID0gbmV3IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4oKTtcbiAgbGV0IHByZXZBY3RpdmVSb3V0ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBwcmV2TWlzc2lsZUNvdW50ID0gMDtcblxuICB3cy5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCBkYXRhID0gc2FmZVBhcnNlKGV2ZW50LmRhdGEpO1xuICAgIGlmICghZGF0YSB8fCBkYXRhLnR5cGUgIT09IFwic3RhdGVcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBoYW5kbGVTdGF0ZU1lc3NhZ2Uoc3RhdGUsIGRhdGEsIGJ1cywgcHJldlJvdXRlcywgcHJldkFjdGl2ZVJvdXRlLCBwcmV2TWlzc2lsZUNvdW50KTtcbiAgICBwcmV2Um91dGVzID0gbmV3IE1hcChzdGF0ZS5taXNzaWxlUm91dGVzLm1hcCgocm91dGUpID0+IFtyb3V0ZS5pZCwgY2xvbmVSb3V0ZShyb3V0ZSldKSk7XG4gICAgcHJldkFjdGl2ZVJvdXRlID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgcHJldk1pc3NpbGVDb3VudCA9IHN0YXRlLm1pc3NpbGVzLmxlbmd0aDtcbiAgICBidXMuZW1pdChcInN0YXRlOnVwZGF0ZWRcIik7XG4gICAgb25TdGF0ZVVwZGF0ZWQ/LigpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU3RhdGVNZXNzYWdlKFxuICBzdGF0ZTogQXBwU3RhdGUsXG4gIG1zZzogU2VydmVyU3RhdGVNZXNzYWdlLFxuICBidXM6IEV2ZW50QnVzLFxuICBwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LFxuICBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwsXG4gIHByZXZNaXNzaWxlQ291bnQ6IG51bWJlcixcbik6IHZvaWQge1xuICBzdGF0ZS5ub3cgPSBtc2cubm93O1xuICBzdGF0ZS5ub3dTeW5jZWRBdCA9IG1vbm90b25pY05vdygpO1xuICBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgPSBOdW1iZXIuaXNGaW5pdGUobXNnLm5leHRfbWlzc2lsZV9yZWFkeSkgPyBtc2cubmV4dF9taXNzaWxlX3JlYWR5ISA6IDA7XG4gIHN0YXRlLm1lID0gbXNnLm1lID8ge1xuICAgIHg6IG1zZy5tZS54LFxuICAgIHk6IG1zZy5tZS55LFxuICAgIHZ4OiBtc2cubWUudngsXG4gICAgdnk6IG1zZy5tZS52eSxcbiAgICBocDogbXNnLm1lLmhwLFxuICAgIGtpbGxzOiBtc2cubWUua2lsbHMgPz8gMCxcbiAgICB3YXlwb2ludHM6IEFycmF5LmlzQXJyYXkobXNnLm1lLndheXBvaW50cylcbiAgICAgID8gbXNnLm1lLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogTnVtYmVyLmlzRmluaXRlKHdwLnNwZWVkKSA/IHdwLnNwZWVkISA6IDE4MCB9KSlcbiAgICAgIDogW10sXG4gICAgaGVhdDogbXNnLm1lLmhlYXQgPyBjb252ZXJ0SGVhdFZpZXcobXNnLm1lLmhlYXQsIHN0YXRlLm5vd1N5bmNlZEF0LCBzdGF0ZS5ub3cpIDogdW5kZWZpbmVkLFxuICB9IDogbnVsbDtcbiAgc3RhdGUuZ2hvc3RzID0gQXJyYXkuaXNBcnJheShtc2cuZ2hvc3RzKSA/IG1zZy5naG9zdHMuc2xpY2UoKSA6IFtdO1xuICBzdGF0ZS5taXNzaWxlcyA9IEFycmF5LmlzQXJyYXkobXNnLm1pc3NpbGVzKSA/IG1zZy5taXNzaWxlcy5zbGljZSgpIDogW107XG5cbiAgY29uc3Qgcm91dGVzRnJvbVNlcnZlciA9IEFycmF5LmlzQXJyYXkobXNnLm1pc3NpbGVfcm91dGVzKSA/IG1zZy5taXNzaWxlX3JvdXRlcyA6IFtdO1xuICBjb25zdCBuZXdSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdID0gcm91dGVzRnJvbVNlcnZlci5tYXAoKHJvdXRlKSA9PiAoe1xuICAgIGlkOiByb3V0ZS5pZCxcbiAgICBuYW1lOiByb3V0ZS5uYW1lIHx8IHJvdXRlLmlkIHx8IFwiUm91dGVcIixcbiAgICB3YXlwb2ludHM6IEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKVxuICAgICAgPyByb3V0ZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHtcbiAgICAgICAgICB4OiB3cC54LFxuICAgICAgICAgIHk6IHdwLnksXG4gICAgICAgICAgc3BlZWQ6IE51bWJlci5pc0Zpbml0ZSh3cC5zcGVlZCkgPyB3cC5zcGVlZCEgOiBzdGF0ZS5taXNzaWxlQ29uZmlnLnNwZWVkLFxuICAgICAgICB9KSlcbiAgICAgIDogW10sXG4gIH0pKTtcblxuICBkaWZmUm91dGVzKHByZXZSb3V0ZXMsIG5ld1JvdXRlcywgYnVzKTtcbiAgc3RhdGUubWlzc2lsZVJvdXRlcyA9IG5ld1JvdXRlcztcblxuICBjb25zdCBuZXh0QWN0aXZlID0gdHlwZW9mIG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZSA9PT0gXCJzdHJpbmdcIiAmJiBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGUubGVuZ3RoID4gMFxuICAgID8gbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlXG4gICAgOiBuZXdSb3V0ZXMubGVuZ3RoID4gMFxuICAgICAgPyBuZXdSb3V0ZXNbMF0uaWRcbiAgICAgIDogbnVsbDtcbiAgc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSBuZXh0QWN0aXZlO1xuICBpZiAobmV4dEFjdGl2ZSAhPT0gcHJldkFjdGl2ZVJvdXRlKSB7XG4gICAgYnVzLmVtaXQoXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLCB7IHJvdXRlSWQ6IG5leHRBY3RpdmUgPz8gbnVsbCB9KTtcbiAgfVxuXG4gIGlmIChtc2cubWlzc2lsZV9jb25maWcpIHtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9taW4pIHx8IE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWF4KSB8fCBOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLmFncm9fbWluKSkge1xuICAgICAgdXBkYXRlTWlzc2lsZUxpbWl0cyhzdGF0ZSwge1xuICAgICAgICBzcGVlZE1pbjogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21pbixcbiAgICAgICAgc3BlZWRNYXg6IG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9tYXgsXG4gICAgICAgIGFncm9NaW46IG1zZy5taXNzaWxlX2NvbmZpZy5hZ3JvX21pbixcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBwcmV2SGVhdCA9IHN0YXRlLm1pc3NpbGVDb25maWcuaGVhdFBhcmFtcztcbiAgICBsZXQgaGVhdFBhcmFtczogeyBtYXg6IG51bWJlcjsgd2FybkF0OiBudW1iZXI7IG92ZXJoZWF0QXQ6IG51bWJlcjsgbWFya2VyU3BlZWQ6IG51bWJlcjsga1VwOiBudW1iZXI7IGtEb3duOiBudW1iZXI7IGV4cDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGVhdENvbmZpZyA9IG1zZy5taXNzaWxlX2NvbmZpZy5oZWF0X2NvbmZpZztcbiAgICBpZiAoaGVhdENvbmZpZykge1xuICAgICAgaGVhdFBhcmFtcyA9IHtcbiAgICAgICAgbWF4OiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5tYXgpID8gaGVhdENvbmZpZy5tYXghIDogcHJldkhlYXQ/Lm1heCA/PyAwLFxuICAgICAgICB3YXJuQXQ6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLndhcm5fYXQpID8gaGVhdENvbmZpZy53YXJuX2F0ISA6IHByZXZIZWF0Py53YXJuQXQgPz8gMCxcbiAgICAgICAgb3ZlcmhlYXRBdDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcub3ZlcmhlYXRfYXQpID8gaGVhdENvbmZpZy5vdmVyaGVhdF9hdCEgOiBwcmV2SGVhdD8ub3ZlcmhlYXRBdCA/PyAwLFxuICAgICAgICBtYXJrZXJTcGVlZDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcubWFya2VyX3NwZWVkKSA/IGhlYXRDb25maWcubWFya2VyX3NwZWVkISA6IHByZXZIZWF0Py5tYXJrZXJTcGVlZCA/PyAwLFxuICAgICAgICBrVXA6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLmtfdXApID8gaGVhdENvbmZpZy5rX3VwISA6IHByZXZIZWF0Py5rVXAgPz8gMCxcbiAgICAgICAga0Rvd246IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLmtfZG93bikgPyBoZWF0Q29uZmlnLmtfZG93biEgOiBwcmV2SGVhdD8ua0Rvd24gPz8gMCxcbiAgICAgICAgZXhwOiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5leHApID8gaGVhdENvbmZpZy5leHAhIDogcHJldkhlYXQ/LmV4cCA/PyAxLFxuICAgICAgfTtcbiAgICB9XG4gICAgY29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKHtcbiAgICAgIHNwZWVkOiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWQsXG4gICAgICBhZ3JvUmFkaXVzOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19yYWRpdXMsXG4gICAgICBoZWF0UGFyYW1zLFxuICAgIH0sIHN0YXRlLm1pc3NpbGVDb25maWcsIHN0YXRlLm1pc3NpbGVMaW1pdHMpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLmxpZmV0aW1lKSkge1xuICAgICAgc2FuaXRpemVkLmxpZmV0aW1lID0gbXNnLm1pc3NpbGVfY29uZmlnLmxpZmV0aW1lITtcbiAgICB9XG4gICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IHNhbml0aXplZDtcbiAgfVxuXG4gIGNvbnN0IG1ldGEgPSBtc2cubWV0YSA/PyB7fTtcbiAgY29uc3QgaGFzQyA9IHR5cGVvZiBtZXRhLmMgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuYyk7XG4gIGNvbnN0IGhhc1cgPSB0eXBlb2YgbWV0YS53ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLncpO1xuICBjb25zdCBoYXNIID0gdHlwZW9mIG1ldGEuaCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5oKTtcbiAgc3RhdGUud29ybGRNZXRhID0ge1xuICAgIGM6IGhhc0MgPyBtZXRhLmMhIDogc3RhdGUud29ybGRNZXRhLmMsXG4gICAgdzogaGFzVyA/IG1ldGEudyEgOiBzdGF0ZS53b3JsZE1ldGEudyxcbiAgICBoOiBoYXNIID8gbWV0YS5oISA6IHN0YXRlLndvcmxkTWV0YS5oLFxuICB9O1xuXG4gIGlmIChzdGF0ZS5taXNzaWxlcy5sZW5ndGggPiBwcmV2TWlzc2lsZUNvdW50KSB7XG4gICAgY29uc3QgYWN0aXZlUm91dGVJZCA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIGlmIChhY3RpdmVSb3V0ZUlkKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoZWRcIiwgeyByb3V0ZUlkOiBhY3RpdmVSb3V0ZUlkIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoZWRcIiwgeyByb3V0ZUlkOiBcIlwiIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNvb2xkb3duUmVtYWluaW5nID0gTWF0aC5tYXgoMCwgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlKSk7XG4gIGJ1cy5lbWl0KFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIiwgeyBzZWNvbmRzUmVtYWluaW5nOiBjb29sZG93blJlbWFpbmluZyB9KTtcbn1cblxuZnVuY3Rpb24gZGlmZlJvdXRlcyhwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LCBuZXh0Um91dGVzOiBNaXNzaWxlUm91dGVbXSwgYnVzOiBFdmVudEJ1cyk6IHZvaWQge1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3Qgcm91dGUgb2YgbmV4dFJvdXRlcykge1xuICAgIHNlZW4uYWRkKHJvdXRlLmlkKTtcbiAgICBjb25zdCBwcmV2ID0gcHJldlJvdXRlcy5nZXQocm91dGUuaWQpO1xuICAgIGlmICghcHJldikge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlQWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAocm91dGUubmFtZSAhPT0gcHJldi5uYW1lKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVSZW5hbWVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIG5hbWU6IHJvdXRlLm5hbWUgfSk7XG4gICAgfVxuICAgIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleDogcm91dGUud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfSBlbHNlIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoIDwgcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiBwcmV2LndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xuICAgIH1cbiAgICBpZiAocHJldi53YXlwb2ludHMubGVuZ3RoID4gMCAmJiByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IFtyb3V0ZUlkXSBvZiBwcmV2Um91dGVzKSB7XG4gICAgaWYgKCFzZWVuLmhhcyhyb3V0ZUlkKSkge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlRGVsZXRlZFwiLCB7IHJvdXRlSWQgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNsb25lUm91dGUocm91dGU6IE1pc3NpbGVSb3V0ZSk6IE1pc3NpbGVSb3V0ZSB7XG4gIHJldHVybiB7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUsXG4gICAgd2F5cG9pbnRzOiByb3V0ZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHsgLi4ud3AgfSkpLFxuICB9O1xufVxuXG5mdW5jdGlvbiBzYWZlUGFyc2UodmFsdWU6IHVua25vd24pOiBTZXJ2ZXJTdGF0ZU1lc3NhZ2UgfCBudWxsIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UodmFsdWUpIGFzIFNlcnZlclN0YXRlTWVzc2FnZTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS53YXJuKFwiW3dzXSBmYWlsZWQgdG8gcGFyc2UgbWVzc2FnZVwiLCBlcnIpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGU6IEFwcFN0YXRlKTogbnVtYmVyIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93KSkge1xuICAgIHJldHVybiAwO1xuICB9XG4gIGNvbnN0IHN5bmNlZEF0ID0gTnVtYmVyLmlzRmluaXRlKHN0YXRlLm5vd1N5bmNlZEF0KSA/IHN0YXRlLm5vd1N5bmNlZEF0IDogbnVsbDtcbiAgaWYgKCFzeW5jZWRBdCkge1xuICAgIHJldHVybiBzdGF0ZS5ub3c7XG4gIH1cbiAgY29uc3QgZWxhcHNlZE1zID0gbW9ub3RvbmljTm93KCkgLSBzeW5jZWRBdDtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZWxhcHNlZE1zKSB8fCBlbGFwc2VkTXMgPCAwKSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICByZXR1cm4gc3RhdGUubm93ICsgZWxhcHNlZE1zIC8gMTAwMDtcbn1cblxuZnVuY3Rpb24gY29udmVydEhlYXRWaWV3KHNlcnZlckhlYXQ6IFNlcnZlckhlYXRWaWV3LCBub3dTeW5jZWRBdE1zOiBudW1iZXIsIHNlcnZlck5vd1NlYzogbnVtYmVyKTogaW1wb3J0KFwiLi9zdGF0ZVwiKS5IZWF0VmlldyB7XG4gIC8vIENvbnZlcnQgc2VydmVyIHRpbWUgKHN0YWxsVW50aWwgaW4gc2Vjb25kcykgdG8gY2xpZW50IHRpbWUgKG1pbGxpc2Vjb25kcylcbiAgLy8gc3RhbGxVbnRpbCBpcyBhYnNvbHV0ZSBzZXJ2ZXIgdGltZSwgc28gd2UgbmVlZCB0byBjb252ZXJ0IGl0IHRvIGNsaWVudCB0aW1lXG4gIGNvbnN0IHNlcnZlclN0YWxsVW50aWxTZWMgPSBzZXJ2ZXJIZWF0LnN1O1xuICBjb25zdCBvZmZzZXRGcm9tTm93U2VjID0gc2VydmVyU3RhbGxVbnRpbFNlYyAtIHNlcnZlck5vd1NlYztcbiAgY29uc3Qgc3RhbGxVbnRpbE1zID0gbm93U3luY2VkQXRNcyArIChvZmZzZXRGcm9tTm93U2VjICogMTAwMCk7XG5cbiAgY29uc3QgaGVhdFZpZXcgPSB7XG4gICAgdmFsdWU6IHNlcnZlckhlYXQudixcbiAgICBtYXg6IHNlcnZlckhlYXQubSxcbiAgICB3YXJuQXQ6IHNlcnZlckhlYXQudyxcbiAgICBvdmVyaGVhdEF0OiBzZXJ2ZXJIZWF0Lm8sXG4gICAgbWFya2VyU3BlZWQ6IHNlcnZlckhlYXQubXMsXG4gICAgc3RhbGxVbnRpbE1zOiBzdGFsbFVudGlsTXMsXG4gICAga1VwOiBzZXJ2ZXJIZWF0Lmt1LFxuICAgIGtEb3duOiBzZXJ2ZXJIZWF0LmtkLFxuICAgIGV4cDogc2VydmVySGVhdC5leCxcbiAgfTtcbiAgcmV0dXJuIGhlYXRWaWV3O1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7IGdldEFwcHJveFNlcnZlck5vdywgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi9uZXRcIjtcbmltcG9ydCB7XG4gIHR5cGUgQWN0aXZlVG9vbCxcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIHR5cGUgTWlzc2lsZVNlbGVjdGlvbixcbiAgdHlwZSBTZWxlY3Rpb24sXG4gIHR5cGUgVUlTdGF0ZSxcbiAgY2xhbXAsXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbiAgcHJvamVjdE1pc3NpbGVIZWF0LFxuICBNSVNTSUxFX1BSRVNFVFMsXG59IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQge1xuICBNSVNTSUxFX01JTl9TUEVFRCxcbiAgTUlTU0lMRV9NQVhfU1BFRUQsXG4gIE1JU1NJTEVfTUlOX0FHUk8sXG59IGZyb20gXCIuL3N0YXRlXCI7XG5cbmludGVyZmFjZSBJbml0R2FtZU9wdGlvbnMge1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIHVpU3RhdGU6IFVJU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG59XG5cbmludGVyZmFjZSBHYW1lQ29udHJvbGxlciB7XG4gIG9uU3RhdGVVcGRhdGVkKCk6IHZvaWQ7XG59XG5cbmxldCBzdGF0ZVJlZjogQXBwU3RhdGU7XG5sZXQgdWlTdGF0ZVJlZjogVUlTdGF0ZTtcbmxldCBidXNSZWY6IEV2ZW50QnVzO1xuXG5sZXQgY3Y6IEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQgfCBudWxsID0gbnVsbDtcbmxldCBIUHNwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQga2lsbHNTcGFuOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBDb250cm9sc0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcENsZWFyQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTZXRCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNlbGVjdEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwUm91dGVzQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBSb3V0ZUxlZzogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwUm91dGVTcGVlZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwRGVsZXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTcGVlZENhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNwZWVkU2xpZGVyOiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNwZWVkVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNwZWVkTWFya2VyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgbWlzc2lsZUNvbnRyb2xzQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWRkUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUxhdW5jaEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlTGF1bmNoVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlTGF1bmNoSW5mbzogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZURlbGV0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTcGVlZFNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTcGVlZFZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVBZ3JvQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb1NsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVBZ3JvVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3Bhd25Cb3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3Bhd25Cb3RUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgcm91dGVQcmV2QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJvdXRlTmV4dEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByb3V0ZU1lbnVUb2dnbGU6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcm91dGVNZW51OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBkZWxldGVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVSb3V0ZU5hbWVMYWJlbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlUm91dGVDb3VudExhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgaGVscFRvZ2dsZTogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwQ2xvc2VCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVscFRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCBoZWF0QmFyRmlsbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWF0QmFyUGxhbm5lZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWF0VmFsdWVUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNwZWVkTWFya2VyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHN0YWxsT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtYXJrZXJBbGlnbmVkID0gZmFsc2U7XG5sZXQgaGVhdFdhcm5BY3RpdmUgPSBmYWxzZTtcbmxldCBzdGFsbEFjdGl2ZSA9IGZhbHNlO1xubGV0IGR1YWxNZXRlckFsZXJ0ID0gZmFsc2U7XG5cbmxldCBzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTZWxlY3Rpb246IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcbmxldCBkZWZhdWx0U3BlZWQgPSAxNTA7XG5sZXQgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IDA7XG5sZXQgbGFzdExvb3BUczogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgbGFzdE1pc3NpbGVDb25maWdTZW50OiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5jb25zdCBzaGlwTGVnRGFzaE9mZnNldHMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuY29uc3QgbWlzc2lsZUxlZ0Rhc2hPZmZzZXRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbmxldCBsYXN0TWlzc2lsZUxhdW5jaFRleHRIVE1MID0gXCJcIjtcbmxldCBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gXCJcIjtcbmxldCBsYXN0VG91Y2hEaXN0YW5jZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgcGVuZGluZ1RvdWNoVGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcbmxldCBpc1BpbmNoaW5nID0gZmFsc2U7XG5cbi8vIFdheXBvaW50IGRyYWdnaW5nIHN0YXRlXG5sZXQgZHJhZ2dlZFdheXBvaW50OiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmxldCBkcmFnU3RhcnRQb3M6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xubGV0IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBNSU5fWk9PTSA9IDEuMDtcbmNvbnN0IE1BWF9aT09NID0gMy4wO1xuY29uc3QgV0FZUE9JTlRfSElUQk9YX1JBRElVUyA9IDEyOyAvLyBwaXhlbHNcblxuY29uc3QgSEVMUF9URVhUID0gW1xuICBcIlByaW1hcnkgTW9kZXNcIixcbiAgXCIgIDEgXHUyMDEzIFRvZ2dsZSBzaGlwIG5hdmlnYXRpb24gbW9kZVwiLFxuICBcIiAgMiBcdTIwMTMgVG9nZ2xlIG1pc3NpbGUgY29vcmRpbmF0aW9uIG1vZGVcIixcbiAgXCJcIixcbiAgXCJTaGlwIE5hdmlnYXRpb25cIixcbiAgXCIgIFQgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgIEMgXHUyMDEzIENsZWFyIGFsbCB3YXlwb2ludHNcIixcbiAgXCIgIEggXHUyMDEzIEhvbGQgKGNsZWFyIHdheXBvaW50cyAmIHN0b3ApXCIsXG4gIFwiICBSIFx1MjAxMyBUb2dnbGUgc2hvdyByb3V0ZVwiLFxuICBcIiAgWyAvIF0gXHUyMDEzIEFkanVzdCB3YXlwb2ludCBzcGVlZFwiLFxuICBcIiAgU2hpZnQrWyAvIF0gXHUyMDEzIENvYXJzZSBzcGVlZCBhZGp1c3RcIixcbiAgXCIgIFRhYiAvIFNoaWZ0K1RhYiBcdTIwMTMgQ3ljbGUgd2F5cG9pbnRzXCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBmcm9tIHNlbGVjdGVkIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiTWlzc2lsZSBDb29yZGluYXRpb25cIixcbiAgXCIgIE4gXHUyMDEzIEFkZCBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICBcIiAgTCBcdTIwMTMgTGF1bmNoIG1pc3NpbGVzXCIsXG4gIFwiICBFIFx1MjAxMyBTd2l0Y2ggYmV0d2VlbiBzZXQvc2VsZWN0XCIsXG4gIFwiICAsIC8gLiBcdTIwMTMgQWRqdXN0IGFncm8gcmFkaXVzXCIsXG4gIFwiICA7IC8gJyBcdTIwMTMgQWRqdXN0IG1pc3NpbGUgc3BlZWRcIixcbiAgXCIgIFNoaWZ0K3NsaWRlciBrZXlzIFx1MjAxMyBDb2Fyc2UgYWRqdXN0XCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBzZWxlY3RlZCBtaXNzaWxlIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiTWFwIENvbnRyb2xzXCIsXG4gIFwiICArLy0gXHUyMDEzIFpvb20gaW4vb3V0XCIsXG4gIFwiICBDdHJsKzAgXHUyMDEzIFJlc2V0IHpvb21cIixcbiAgXCIgIE1vdXNlIHdoZWVsIFx1MjAxMyBab29tIGF0IGN1cnNvclwiLFxuICBcIiAgUGluY2ggXHUyMDEzIFpvb20gb24gdG91Y2ggZGV2aWNlc1wiLFxuICBcIlwiLFxuICBcIkdlbmVyYWxcIixcbiAgXCIgID8gXHUyMDEzIFRvZ2dsZSB0aGlzIG92ZXJsYXlcIixcbiAgXCIgIEVzYyBcdTIwMTMgQ2FuY2VsIHNlbGVjdGlvbiBvciBjbG9zZSBvdmVybGF5XCIsXG5dLmpvaW4oXCJcXG5cIik7XG5cbmNvbnN0IHdvcmxkID0geyB3OiA4MDAwLCBoOiA0NTAwIH07XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0R2FtZSh7IHN0YXRlLCB1aVN0YXRlLCBidXMgfTogSW5pdEdhbWVPcHRpb25zKTogR2FtZUNvbnRyb2xsZXIge1xuICBzdGF0ZVJlZiA9IHN0YXRlO1xuICB1aVN0YXRlUmVmID0gdWlTdGF0ZTtcbiAgYnVzUmVmID0gYnVzO1xuXG4gIGNhY2hlRG9tKCk7XG4gIGlmICghY3YpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW52YXMgZWxlbWVudCAjY3Ygbm90IGZvdW5kXCIpO1xuICB9XG4gIGN0eCA9IGN2LmdldENvbnRleHQoXCIyZFwiKTtcblxuICBiaW5kTGlzdGVuZXJzKCk7XG4gIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUoKTtcbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIHVwZGF0ZUhlbHBPdmVybGF5KCk7XG4gIHVwZGF0ZVN0YXR1c0luZGljYXRvcnMoKTtcbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGxvb3ApO1xuXG4gIHJldHVybiB7XG4gICAgb25TdGF0ZVVwZGF0ZWQoKSB7XG4gICAgICBzeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk7XG4gICAgICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gICAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gICAgICB1cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgICAgIHVwZGF0ZVN0YXR1c0luZGljYXRvcnMoKTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBjYWNoZURvbSgpOiB2b2lkIHtcbiAgY3YgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImN2XCIpIGFzIEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbDtcbiAgY3R4ID0gY3Y/LmdldENvbnRleHQoXCIyZFwiKSA/PyBudWxsO1xuICBIUHNwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtaHBcIik7XG4gIHNoaXBDb250cm9sc0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY29udHJvbHNcIik7XG4gIHNoaXBDbGVhckJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1jbGVhclwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTZXRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2V0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc2hpcFNlbGVjdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZWxlY3RcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwUm91dGVzQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXJvdXRlc1wiKTtcbiAgc2hpcFJvdXRlTGVnID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXJvdXRlLWxlZ1wiKTtcbiAgc2hpcFJvdXRlU3BlZWQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtcm91dGUtc3BlZWRcIik7XG4gIHNoaXBEZWxldGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtZGVsZXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc2hpcFNwZWVkQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1jYXJkXCIpO1xuICBzaGlwU3BlZWRTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICBzaGlwU3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC12YWx1ZVwiKTtcblxuICBtaXNzaWxlQ29udHJvbHNDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWNvbnRyb2xzXCIpO1xuICBtaXNzaWxlQWRkUm91dGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWRkLXJvdXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZUxhdW5jaEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2hcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlTGF1bmNoVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2gtdGV4dFwiKTtcbiAgbWlzc2lsZUxhdW5jaEluZm8gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoLWluZm9cIik7XG4gIG1pc3NpbGVTZXRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2V0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVNlbGVjdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZWxlY3RcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlRGVsZXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWRlbGV0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVTcGVlZENhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtY2FyZFwiKTtcbiAgbWlzc2lsZVNwZWVkU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtdmFsdWVcIik7XG4gIG1pc3NpbGVBZ3JvQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLWNhcmRcIik7XG4gIG1pc3NpbGVBZ3JvU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlQWdyb1ZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tdmFsdWVcIik7XG5cbiAgc3Bhd25Cb3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNwYXduQm90VGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90LXRleHRcIik7XG4gIGtpbGxzU3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1raWxsc1wiKTtcbiAgcm91dGVQcmV2QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1wcmV2XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVOZXh0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1uZXh0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVNZW51VG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51LXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHJvdXRlTWVudSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbWVudVwiKTtcbiAgcmVuYW1lTWlzc2lsZVJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyZW5hbWUtbWlzc2lsZS1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVsZXRlLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNsZWFyLW1pc3NpbGUtd2F5cG9pbnRzXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVJvdXRlTmFtZUxhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXJvdXRlLW5hbWVcIik7XG4gIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtY291bnRcIik7XG5cbiAgaGVscFRvZ2dsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC10b2dnbGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBoZWxwT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC1vdmVybGF5XCIpO1xuICBoZWxwQ2xvc2VCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtY2xvc2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBoZWxwVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC10ZXh0XCIpO1xuXG4gIGhlYXRCYXJGaWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWF0LWJhci1maWxsXCIpO1xuICBoZWF0QmFyUGxhbm5lZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItcGxhbm5lZFwiKTtcbiAgaGVhdFZhbHVlVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC12YWx1ZS10ZXh0XCIpO1xuICBzcGVlZE1hcmtlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3BlZWQtbWFya2VyXCIpO1xuICBtaXNzaWxlU3BlZWRNYXJrZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtbWFya2VyXCIpO1xuICBzdGFsbE92ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YWxsLW92ZXJsYXlcIik7XG5cbiAgZGVmYXVsdFNwZWVkID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXI/LnZhbHVlID8/IFwiMTUwXCIpO1xuICBpZiAobWlzc2lsZVNwZWVkU2xpZGVyKSB7XG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyLmRpc2FibGVkID0gdHJ1ZTtcbiAgfVxufVxuXG5mdW5jdGlvbiBiaW5kTGlzdGVuZXJzKCk6IHZvaWQge1xuICBpZiAoIWN2KSByZXR1cm47XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCBvbkNhbnZhc1BvaW50ZXJEb3duKTtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJtb3ZlXCIsIG9uQ2FudmFzUG9pbnRlck1vdmUpO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIG9uQ2FudmFzUG9pbnRlclVwKTtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJjYW5jZWxcIiwgb25DYW52YXNQb2ludGVyVXApO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwid2hlZWxcIiwgb25DYW52YXNXaGVlbCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgb25DYW52YXNUb3VjaFN0YXJ0LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIG9uQ2FudmFzVG91Y2hNb3ZlLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgb25DYW52YXNUb3VjaEVuZCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcblxuICBzcGF3bkJvdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBpZiAoc3Bhd25Cb3RCdG4uZGlzYWJsZWQpIHJldHVybjtcblxuICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJzcGF3bl9ib3RcIiB9KTtcbiAgICBidXNSZWYuZW1pdChcImJvdDpzcGF3blJlcXVlc3RlZFwiKTtcblxuICAgIC8vIERpc2FibGUgYnV0dG9uIGFuZCB1cGRhdGUgdGV4dFxuICAgIHNwYXduQm90QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICBpZiAoc3Bhd25Cb3RUZXh0KSB7XG4gICAgICBzcGF3bkJvdFRleHQudGV4dENvbnRlbnQgPSBcIlNwYXduZWRcIjtcbiAgICB9XG5cbiAgICAvLyBSZS1lbmFibGUgYWZ0ZXIgNSBzZWNvbmRzXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoc3Bhd25Cb3RCdG4pIHtcbiAgICAgICAgc3Bhd25Cb3RCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGlmIChzcGF3bkJvdFRleHQpIHtcbiAgICAgICAgc3Bhd25Cb3RUZXh0LnRleHRDb250ZW50ID0gXCJCb3RcIjtcbiAgICAgIH1cbiAgICB9LCA1MDAwKTtcbiAgfSk7XG5cbiAgc2hpcENsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgY2xlYXJTaGlwUm91dGUoKTtcbiAgICBidXNSZWYuZW1pdChcInNoaXA6Y2xlYXJJbnZva2VkXCIpO1xuICB9KTtcblxuICBzaGlwU2V0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNldFwiKTtcbiAgfSk7XG5cbiAgc2hpcFNlbGVjdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZWxlY3RcIik7XG4gIH0pO1xuXG4gIHNoaXBTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVTcGVlZExhYmVsKHZhbHVlKTtcbiAgICBkZWZhdWx0U3BlZWQgPSB2YWx1ZTtcbiAgICBpZiAoc2VsZWN0aW9uICYmIHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSAmJiBzdGF0ZVJlZi5tZS53YXlwb2ludHNbc2VsZWN0aW9uLmluZGV4XSkge1xuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcInVwZGF0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4LCBzcGVlZDogdmFsdWUgfSk7XG4gICAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHNbc2VsZWN0aW9uLmluZGV4XS5zcGVlZCA9IHZhbHVlO1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9XG4gICAgY29uc3QgaGVhdCA9IHN0YXRlUmVmLm1lPy5oZWF0O1xuICAgIGlmIChoZWF0KSB7XG4gICAgICBjb25zdCB0b2xlcmFuY2UgPSBNYXRoLm1heCg1LCBoZWF0Lm1hcmtlclNwZWVkICogMC4wMik7XG4gICAgICBjb25zdCBkaWZmID0gTWF0aC5hYnModmFsdWUgLSBoZWF0Lm1hcmtlclNwZWVkKTtcbiAgICAgIGNvbnN0IGluUmFuZ2UgPSBkaWZmIDw9IHRvbGVyYW5jZTtcbiAgICAgIGlmIChpblJhbmdlICYmICFtYXJrZXJBbGlnbmVkKSB7XG4gICAgICAgIG1hcmtlckFsaWduZWQgPSB0cnVlO1xuICAgICAgICBidXNSZWYuZW1pdChcImhlYXQ6bWFya2VyQWxpZ25lZFwiLCB7IHZhbHVlLCBtYXJrZXI6IGhlYXQubWFya2VyU3BlZWQgfSk7XG4gICAgICB9IGVsc2UgaWYgKCFpblJhbmdlICYmIG1hcmtlckFsaWduZWQpIHtcbiAgICAgICAgbWFya2VyQWxpZ25lZCA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBtYXJrZXJBbGlnbmVkID0gZmFsc2U7XG4gICAgfVxuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDpzcGVlZENoYW5nZWRcIiwgeyB2YWx1ZSB9KTtcbiAgfSk7XG5cbiAgc2hpcERlbGV0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIGRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk7XG4gIH0pO1xuXG4gIG1pc3NpbGVBZGRSb3V0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJhZGRfbWlzc2lsZV9yb3V0ZVwiIH0pO1xuICB9KTtcblxuICBtaXNzaWxlTGF1bmNoQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgbGF1bmNoQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIH0pO1xuXG4gIG1pc3NpbGVTZXRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2V0XCIpO1xuICB9KTtcblxuICBtaXNzaWxlU2VsZWN0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNlbGVjdFwiKTtcbiAgfSk7XG5cbiAgbWlzc2lsZURlbGV0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIGRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmRlbGV0ZUludm9rZWRcIik7XG4gIH0pO1xuXG4gIG1pc3NpbGVTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IGlucHV0RWwgPSBldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICBpZiAoaW5wdXRFbC5kaXNhYmxlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByYXdWYWx1ZSA9IHBhcnNlRmxvYXQoaW5wdXRFbC52YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocmF3VmFsdWUpKSB7XG4gICAgICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpKSB7XG4gICAgICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIG1pc3NpbGVTZWxlY3Rpb24gJiZcbiAgICAgIG1pc3NpbGVTZWxlY3Rpb24udHlwZSA9PT0gXCJ3YXlwb2ludFwiICYmXG4gICAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoXG4gICAgKSB7XG4gICAgICBjb25zdCBtaW5TcGVlZCA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4gPz8gTUlTU0lMRV9NSU5fU1BFRUQ7XG4gICAgICBjb25zdCBtYXhTcGVlZCA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXggPz8gTUlTU0lMRV9NQVhfU1BFRUQ7XG4gICAgICBjb25zdCBjbGFtcGVkVmFsdWUgPSBjbGFtcChyYXdWYWx1ZSwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgICAgIGNvbnN0IGlkeCA9IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXg7XG4gICAgICByb3V0ZS53YXlwb2ludHNbaWR4XSA9IHsgLi4ucm91dGUud2F5cG9pbnRzW2lkeF0sIHNwZWVkOiBjbGFtcGVkVmFsdWUgfTtcbiAgICAgIGxhc3RNaXNzaWxlTGVnU3BlZWQgPSBjbGFtcGVkVmFsdWU7XG4gICAgICBpZiAobWlzc2lsZVNwZWVkVmFsdWUpIHtcbiAgICAgICAgbWlzc2lsZVNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtjbGFtcGVkVmFsdWUudG9GaXhlZCgwKX1gO1xuICAgICAgfVxuICAgICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgICB0eXBlOiBcInVwZGF0ZV9taXNzaWxlX3dheXBvaW50X3NwZWVkXCIsXG4gICAgICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICAgICAgaW5kZXg6IGlkeCxcbiAgICAgICAgc3BlZWQ6IGNsYW1wZWRWYWx1ZSxcbiAgICAgIH0pO1xuICAgICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlOiBjbGFtcGVkVmFsdWUsIGluZGV4OiBpZHggfSk7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH0gZWxzZSB7XG4gICAgICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xuICAgIH1cbiAgfSk7XG5cbiAgbWlzc2lsZUFncm9TbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcnNlRmxvYXQoKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSByZXR1cm47XG4gICAgdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSSh7IGFncm9SYWRpdXM6IHZhbHVlIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICByb3V0ZVByZXZCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBjeWNsZU1pc3NpbGVSb3V0ZSgtMSkpO1xuICByb3V0ZU5leHRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBjeWNsZU1pc3NpbGVSb3V0ZSgxKSk7XG5cbiAgcm91dGVNZW51VG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnRvZ2dsZShcInZpc2libGVcIik7XG4gIH0pO1xuXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICBpZiAoIXJvdXRlTWVudSB8fCAhcm91dGVNZW51LmNsYXNzTGlzdC5jb250YWlucyhcInZpc2libGVcIikpIHJldHVybjtcbiAgICBpZiAoZXZlbnQudGFyZ2V0ID09PSByb3V0ZU1lbnVUb2dnbGUpIHJldHVybjtcbiAgICBpZiAocm91dGVNZW51LmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKSkgcmV0dXJuO1xuICAgIHJvdXRlTWVudS5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgcmVuYW1lTWlzc2lsZVJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgY29uc3QgbmFtZSA9IHdpbmRvdy5wcm9tcHQoXCJSZW5hbWUgcm91dGVcIiwgcm91dGUubmFtZSB8fCBcIlwiKTtcbiAgICBpZiAobmFtZSA9PT0gbnVsbCkgcmV0dXJuO1xuICAgIGNvbnN0IHRyaW1tZWQgPSBuYW1lLnRyaW0oKTtcbiAgICBpZiAoIXRyaW1tZWQpIHJldHVybjtcbiAgICByb3V0ZS5uYW1lID0gdHJpbW1lZDtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwicmVuYW1lX21pc3NpbGVfcm91dGVcIixcbiAgICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICAgIHJvdXRlX25hbWU6IHRyaW1tZWQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICByb3V0ZU1lbnU/LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSkgcmV0dXJuO1xuICAgIGlmICghd2luZG93LmNvbmZpcm0oYERlbGV0ZSAke3JvdXRlLm5hbWV9P2ApKSByZXR1cm47XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgICBpZiAocm91dGVzLmxlbmd0aCA8PSAxKSB7XG4gICAgICByb3V0ZS53YXlwb2ludHMgPSBbXTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA9IHJvdXRlcy5maWx0ZXIoKHIpID0+IHIuaWQgIT09IHJvdXRlLmlkKTtcbiAgICAgIGNvbnN0IHJlbWFpbmluZyA9IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXM7XG4gICAgICBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IHJlbWFpbmluZy5sZW5ndGggPiAwID8gcmVtYWluaW5nWzBdLmlkIDogbnVsbDtcbiAgICB9XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IG51bGw7XG4gICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJkZWxldGVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIH0pO1xuICB9KTtcblxuICBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwiY2xlYXJfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIH0pO1xuICAgIHJvdXRlLndheXBvaW50cyA9IFtdO1xuICAgIG1pc3NpbGVTZWxlY3Rpb24gPSBudWxsO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB9KTtcblxuICBoZWxwVG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldEhlbHBWaXNpYmxlKHRydWUpO1xuICB9KTtcblxuICBoZWxwQ2xvc2VCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICB9KTtcblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgb25XaW5kb3dLZXlEb3duLCB7IGNhcHR1cmU6IGZhbHNlIH0pO1xufVxuXG5mdW5jdGlvbiBzZXRab29tKG5ld1pvb206IG51bWJlciwgY2VudGVyWD86IG51bWJlciwgY2VudGVyWT86IG51bWJlcik6IHZvaWQge1xuICB1aVN0YXRlUmVmLnpvb20gPSBjbGFtcChuZXdab29tLCBNSU5fWk9PTSwgTUFYX1pPT00pO1xufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1doZWVsKGV2ZW50OiBXaGVlbEV2ZW50KTogdm9pZCB7XG4gIGlmICghY3YpIHJldHVybjtcbiAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICBjb25zdCByZWN0ID0gY3YuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGNvbnN0IGNlbnRlclggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0O1xuICBjb25zdCBjZW50ZXJZID0gZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wO1xuXG4gIGNvbnN0IGRlbHRhID0gZXZlbnQuZGVsdGFZO1xuICBjb25zdCB6b29tRmFjdG9yID0gZGVsdGEgPiAwID8gMC45IDogMS4xO1xuICBjb25zdCBuZXdab29tID0gdWlTdGF0ZVJlZi56b29tICogem9vbUZhY3RvcjtcblxuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHJlY3Qud2lkdGg7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHJlY3QuaGVpZ2h0O1xuICBjb25zdCBjYW52YXNDZW50ZXJYID0gY2VudGVyWCAqIHNjYWxlWDtcbiAgY29uc3QgY2FudmFzQ2VudGVyWSA9IGNlbnRlclkgKiBzY2FsZVk7XG5cbiAgc2V0Wm9vbShuZXdab29tLCBjYW52YXNDZW50ZXJYLCBjYW52YXNDZW50ZXJZKTtcbn1cblxuZnVuY3Rpb24gZ2V0VG91Y2hEaXN0YW5jZSh0b3VjaGVzOiBUb3VjaExpc3QpOiBudW1iZXIgfCBudWxsIHtcbiAgaWYgKHRvdWNoZXMubGVuZ3RoIDwgMikgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGR4ID0gdG91Y2hlc1swXS5jbGllbnRYIC0gdG91Y2hlc1sxXS5jbGllbnRYO1xuICBjb25zdCBkeSA9IHRvdWNoZXNbMF0uY2xpZW50WSAtIHRvdWNoZXNbMV0uY2xpZW50WTtcbiAgcmV0dXJuIE1hdGguaHlwb3QoZHgsIGR5KTtcbn1cblxuZnVuY3Rpb24gZ2V0VG91Y2hDZW50ZXIodG91Y2hlczogVG91Y2hMaXN0KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHwgbnVsbCB7XG4gIGlmICh0b3VjaGVzLmxlbmd0aCA8IDIpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIHg6ICh0b3VjaGVzWzBdLmNsaWVudFggKyB0b3VjaGVzWzFdLmNsaWVudFgpIC8gMixcbiAgICB5OiAodG91Y2hlc1swXS5jbGllbnRZICsgdG91Y2hlc1sxXS5jbGllbnRZKSAvIDJcbiAgfTtcbn1cblxuZnVuY3Rpb24gb25DYW52YXNUb3VjaFN0YXJ0KGV2ZW50OiBUb3VjaEV2ZW50KTogdm9pZCB7XG4gIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCA9PT0gMikge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgaXNQaW5jaGluZyA9IHRydWU7XG4gICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBnZXRUb3VjaERpc3RhbmNlKGV2ZW50LnRvdWNoZXMpO1xuXG4gICAgLy8gQ2FuY2VsIGFueSBwZW5kaW5nIHdheXBvaW50IHBsYWNlbWVudFxuICAgIGlmIChwZW5kaW5nVG91Y2hUaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICBjbGVhclRpbWVvdXQocGVuZGluZ1RvdWNoVGltZW91dCk7XG4gICAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gbnVsbDtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gb25DYW52YXNUb3VjaE1vdmUoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKCFjdiB8fCBldmVudC50b3VjaGVzLmxlbmd0aCAhPT0gMikge1xuICAgIGxhc3RUb3VjaERpc3RhbmNlID0gbnVsbDtcbiAgICByZXR1cm47XG4gIH1cblxuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICBjb25zdCBjdXJyZW50RGlzdGFuY2UgPSBnZXRUb3VjaERpc3RhbmNlKGV2ZW50LnRvdWNoZXMpO1xuICBpZiAoY3VycmVudERpc3RhbmNlID09PSBudWxsIHx8IGxhc3RUb3VjaERpc3RhbmNlID09PSBudWxsKSByZXR1cm47XG5cbiAgY29uc3QgcmVjdCA9IGN2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBjb25zdCBjZW50ZXIgPSBnZXRUb3VjaENlbnRlcihldmVudC50b3VjaGVzKTtcbiAgaWYgKCFjZW50ZXIpIHJldHVybjtcblxuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHJlY3Qud2lkdGg7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHJlY3QuaGVpZ2h0O1xuICBjb25zdCBjYW52YXNDZW50ZXJYID0gKGNlbnRlci54IC0gcmVjdC5sZWZ0KSAqIHNjYWxlWDtcbiAgY29uc3QgY2FudmFzQ2VudGVyWSA9IChjZW50ZXIueSAtIHJlY3QudG9wKSAqIHNjYWxlWTtcblxuICBjb25zdCB6b29tRmFjdG9yID0gY3VycmVudERpc3RhbmNlIC8gbGFzdFRvdWNoRGlzdGFuY2U7XG4gIGNvbnN0IG5ld1pvb20gPSB1aVN0YXRlUmVmLnpvb20gKiB6b29tRmFjdG9yO1xuXG4gIHNldFpvb20obmV3Wm9vbSwgY2FudmFzQ2VudGVyWCwgY2FudmFzQ2VudGVyWSk7XG4gIGxhc3RUb3VjaERpc3RhbmNlID0gY3VycmVudERpc3RhbmNlO1xufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoRW5kKGV2ZW50OiBUb3VjaEV2ZW50KTogdm9pZCB7XG4gIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCA8IDIpIHtcbiAgICBsYXN0VG91Y2hEaXN0YW5jZSA9IG51bGw7XG4gICAgLy8gUmVzZXQgcGluY2hpbmcgZmxhZyBhZnRlciBhIHNob3J0IGRlbGF5IHRvIHByZXZlbnQgd2F5cG9pbnQgcGxhY2VtZW50XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpc1BpbmNoaW5nID0gZmFsc2U7XG4gICAgfSwgMTAwKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1BvaW50ZXJEb3duKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgaWYgKCFjdiB8fCAhY3R4KSByZXR1cm47XG4gIGlmIChoZWxwT3ZlcmxheT8uY2xhc3NMaXN0LmNvbnRhaW5zKFwidmlzaWJsZVwiKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAobGFzdFRvdWNoRGlzdGFuY2UgIT09IG51bGwgfHwgaXNQaW5jaGluZykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHJlY3QgPSBjdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3Qgc2NhbGVYID0gcmVjdC53aWR0aCAhPT0gMCA/IGN2LndpZHRoIC8gcmVjdC53aWR0aCA6IDE7XG4gIGNvbnN0IHNjYWxlWSA9IHJlY3QuaGVpZ2h0ICE9PSAwID8gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQgOiAxO1xuICBjb25zdCB4ID0gKGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICBjb25zdCB5ID0gKGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcCkgKiBzY2FsZVk7XG4gIGNvbnN0IGNhbnZhc1BvaW50ID0geyB4LCB5IH07XG4gIGNvbnN0IHdvcmxkUG9pbnQgPSBjYW52YXNUb1dvcmxkKGNhbnZhc1BvaW50KTtcblxuICBjb25zdCBjb250ZXh0ID0gdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcblxuICAvLyBDaGVjayBpZiBjbGlja2luZyBvbiB3YXlwb2ludCBmb3IgZHJhZ2dpbmcgKHNoaXAgbW9kZSArIHNlbGVjdCB0b29sKVxuICBpZiAoY29udGV4dCA9PT0gXCJzaGlwXCIgJiYgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIiAmJiBzdGF0ZVJlZi5tZT8ud2F5cG9pbnRzKSB7XG4gICAgY29uc3Qgd3BJbmRleCA9IGZpbmRXYXlwb2ludEF0UG9zaXRpb24oY2FudmFzUG9pbnQpO1xuICAgIGlmICh3cEluZGV4ICE9PSBudWxsKSB7XG4gICAgICBkcmFnZ2VkV2F5cG9pbnQgPSB3cEluZGV4O1xuICAgICAgZHJhZ1N0YXJ0UG9zID0geyB4OiBjYW52YXNQb2ludC54LCB5OiBjYW52YXNQb2ludC55IH07XG4gICAgICBjdi5zZXRQb2ludGVyQ2FwdHVyZShldmVudC5wb2ludGVySWQpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cblxuICBpZiAoY29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9PT0gXCJzZWxlY3RcIikge1xuICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RNaXNzaWxlUm91dGVzKGNhbnZhc1BvaW50KTtcbiAgICBpZiAoaGl0KSB7XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgY29uc3QgeyByb3V0ZSwgc2VsZWN0aW9uOiBtaXNzaWxlU2VsIH0gPSBoaXQ7XG4gICAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG1pc3NpbGVTZWwsIHJvdXRlLmlkKTtcbiAgICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgICBpZiAobWlzc2lsZVNlbC50eXBlID09PSBcIndheXBvaW50XCIpIHtcbiAgICAgICAgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA9IG1pc3NpbGVTZWwuaW5kZXg7XG4gICAgICAgIGRyYWdTdGFydFBvcyA9IHsgeDogY2FudmFzUG9pbnQueCwgeTogY2FudmFzUG9pbnQueSB9O1xuICAgICAgICBjdi5zZXRQb2ludGVyQ2FwdHVyZShldmVudC5wb2ludGVySWQpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICB9XG5cbiAgLy8gRm9yIHRvdWNoIGV2ZW50cywgZGVsYXkgd2F5cG9pbnQgcGxhY2VtZW50IHRvIGFsbG93IGZvciBwaW5jaCBnZXN0dXJlIGRldGVjdGlvblxuICAvLyBGb3IgbW91c2UgZXZlbnRzLCBwbGFjZSBpbW1lZGlhdGVseVxuICBpZiAoZXZlbnQucG9pbnRlclR5cGUgPT09IFwidG91Y2hcIikge1xuICAgIGlmIChwZW5kaW5nVG91Y2hUaW1lb3V0ICE9PSBudWxsKSB7XG4gICAgICBjbGVhclRpbWVvdXQocGVuZGluZ1RvdWNoVGltZW91dCk7XG4gICAgfVxuXG4gICAgcGVuZGluZ1RvdWNoVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKGlzUGluY2hpbmcpIHJldHVybjsgLy8gRG91YmxlLWNoZWNrIHdlJ3JlIG5vdCBwaW5jaGluZ1xuXG4gICAgICBpZiAoY29udGV4dCA9PT0gXCJtaXNzaWxlXCIpIHtcbiAgICAgICAgaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaGFuZGxlU2hpcFBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgICAgfVxuICAgICAgcGVuZGluZ1RvdWNoVGltZW91dCA9IG51bGw7XG4gICAgfSwgMTUwKTsgLy8gMTUwbXMgZGVsYXkgdG8gZGV0ZWN0IHBpbmNoIGdlc3R1cmVcbiAgfSBlbHNlIHtcbiAgICAvLyBNb3VzZS9wZW46IGltbWVkaWF0ZSBwbGFjZW1lbnRcbiAgICBpZiAoY29udGV4dCA9PT0gXCJtaXNzaWxlXCIpIHtcbiAgICAgIGhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgICB9IGVsc2Uge1xuICAgICAgaGFuZGxlU2hpcFBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgIH1cbiAgfVxuXG4gIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlck1vdmUoZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8ICFjdHgpIHJldHVybjtcblxuICBjb25zdCBkcmFnZ2luZ1NoaXAgPSBkcmFnZ2VkV2F5cG9pbnQgIT09IG51bGwgJiYgZHJhZ1N0YXJ0UG9zO1xuICBjb25zdCBkcmFnZ2luZ01pc3NpbGUgPSBkcmFnZ2VkTWlzc2lsZVdheXBvaW50ICE9PSBudWxsICYmIGRyYWdTdGFydFBvcztcblxuICBpZiAoIWRyYWdnaW5nU2hpcCAmJiAhZHJhZ2dpbmdNaXNzaWxlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgcmVjdCA9IGN2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBjb25zdCBzY2FsZVggPSByZWN0LndpZHRoICE9PSAwID8gY3Yud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgY29uc3Qgc2NhbGVZID0gcmVjdC5oZWlnaHQgIT09IDAgPyBjdi5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gIGNvbnN0IHggPSAoZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdCkgKiBzY2FsZVg7XG4gIGNvbnN0IHkgPSAoZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wKSAqIHNjYWxlWTtcbiAgY29uc3QgY2FudmFzUG9pbnQgPSB7IHgsIHkgfTtcbiAgY29uc3Qgd29ybGRQb2ludCA9IGNhbnZhc1RvV29ybGQoY2FudmFzUG9pbnQpO1xuXG4gIC8vIENsYW1wIHRvIHdvcmxkIGJvdW5kc1xuICBjb25zdCB3b3JsZFcgPSBzdGF0ZVJlZi53b3JsZE1ldGEudyA/PyA0MDAwO1xuICBjb25zdCB3b3JsZEggPSBzdGF0ZVJlZi53b3JsZE1ldGEuaCA/PyA0MDAwO1xuICBjb25zdCBjbGFtcGVkWCA9IGNsYW1wKHdvcmxkUG9pbnQueCwgMCwgd29ybGRXKTtcbiAgY29uc3QgY2xhbXBlZFkgPSBjbGFtcCh3b3JsZFBvaW50LnksIDAsIHdvcmxkSCk7XG5cbiAgaWYgKGRyYWdnaW5nU2hpcCAmJiBkcmFnZ2VkV2F5cG9pbnQgIT09IG51bGwpIHtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcIm1vdmVfd2F5cG9pbnRcIixcbiAgICAgIGluZGV4OiBkcmFnZ2VkV2F5cG9pbnQsXG4gICAgICB4OiBjbGFtcGVkWCxcbiAgICAgIHk6IGNsYW1wZWRZLFxuICAgIH0pO1xuXG4gICAgaWYgKHN0YXRlUmVmLm1lICYmIHN0YXRlUmVmLm1lLndheXBvaW50cyAmJiBkcmFnZ2VkV2F5cG9pbnQgPCBzdGF0ZVJlZi5tZS53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHNbZHJhZ2dlZFdheXBvaW50XS54ID0gY2xhbXBlZFg7XG4gICAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHNbZHJhZ2dlZFdheXBvaW50XS55ID0gY2xhbXBlZFk7XG4gICAgfVxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGRyYWdnaW5nTWlzc2lsZSAmJiBkcmFnZ2VkTWlzc2lsZVdheXBvaW50ICE9PSBudWxsKSB7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAocm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpICYmIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBzZW5kTWVzc2FnZSh7XG4gICAgICAgIHR5cGU6IFwibW92ZV9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICAgICAgaW5kZXg6IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQsXG4gICAgICAgIHg6IGNsYW1wZWRYLFxuICAgICAgICB5OiBjbGFtcGVkWSxcbiAgICAgIH0pO1xuXG4gICAgICByb3V0ZS53YXlwb2ludHMgPSByb3V0ZS53YXlwb2ludHMubWFwKCh3cCwgaWR4KSA9PlxuICAgICAgICBpZHggPT09IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPyB7IC4uLndwLCB4OiBjbGFtcGVkWCwgeTogY2xhbXBlZFkgfSA6IHdwXG4gICAgICApO1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1BvaW50ZXJVcChldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG4gIGxldCByZWxlYXNlZCA9IGZhbHNlO1xuXG4gIGlmIChkcmFnZ2VkV2F5cG9pbnQgIT09IG51bGwgJiYgc3RhdGVSZWYubWU/LndheXBvaW50cykge1xuICAgIGNvbnN0IHdwID0gc3RhdGVSZWYubWUud2F5cG9pbnRzW2RyYWdnZWRXYXlwb2ludF07XG4gICAgaWYgKHdwKSB7XG4gICAgICBidXNSZWYuZW1pdChcInNoaXA6d2F5cG9pbnRNb3ZlZFwiLCB7XG4gICAgICAgIGluZGV4OiBkcmFnZ2VkV2F5cG9pbnQsXG4gICAgICAgIHg6IHdwLngsXG4gICAgICAgIHk6IHdwLnksXG4gICAgICB9KTtcbiAgICB9XG4gICAgZHJhZ2dlZFdheXBvaW50ID0gbnVsbDtcbiAgICByZWxlYXNlZCA9IHRydWU7XG4gIH1cblxuICBpZiAoZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKHJvdXRlICYmIHJvdXRlLndheXBvaW50cyAmJiBkcmFnZ2VkTWlzc2lsZVdheXBvaW50IDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgICAgY29uc3Qgd3AgPSByb3V0ZS53YXlwb2ludHNbZHJhZ2dlZE1pc3NpbGVXYXlwb2ludF07XG4gICAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRNb3ZlZFwiLCB7XG4gICAgICAgIHJvdXRlSWQ6IHJvdXRlLmlkLFxuICAgICAgICBpbmRleDogZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCxcbiAgICAgICAgeDogd3AueCxcbiAgICAgICAgeTogd3AueSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBkcmFnZ2VkTWlzc2lsZVdheXBvaW50ID0gbnVsbDtcbiAgICByZWxlYXNlZCA9IHRydWU7XG4gIH1cblxuICBkcmFnU3RhcnRQb3MgPSBudWxsO1xuXG4gIGlmIChyZWxlYXNlZCAmJiBjdikge1xuICAgIGN2LnJlbGVhc2VQb2ludGVyQ2FwdHVyZShldmVudC5wb2ludGVySWQpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVNwZWVkTGFiZWwodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICBpZiAoc2hpcFNwZWVkVmFsdWUpIHtcbiAgICBzaGlwU3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IE51bWJlcih2YWx1ZSkudG9GaXhlZCgwKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRTaGlwU2xpZGVyVmFsdWUodmFsdWU6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIXNoaXBTcGVlZFNsaWRlcikgcmV0dXJuO1xuICBzaGlwU3BlZWRTbGlkZXIudmFsdWUgPSBTdHJpbmcodmFsdWUpO1xuICB1cGRhdGVTcGVlZExhYmVsKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk6IE1pc3NpbGVSb3V0ZSB8IG51bGwge1xuICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICBpZiAocm91dGVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbnVsbDtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBpZiAoIXN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkIHx8ICFyb3V0ZXMuc29tZSgocm91dGUpID0+IHJvdXRlLmlkID09PSBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCkpIHtcbiAgICBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IHJvdXRlc1swXS5pZDtcbiAgfVxuICByZXR1cm4gcm91dGVzLmZpbmQoKHJvdXRlKSA9PiByb3V0ZS5pZCA9PT0gc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQpID8/IG51bGw7XG59XG5cbmZ1bmN0aW9uIGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgcmV0dXJuIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpOiB2b2lkIHtcbiAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgY29uc3QgYWN0aXZlUm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgaWYgKG1pc3NpbGVSb3V0ZU5hbWVMYWJlbCkge1xuICAgIGlmICghYWN0aXZlUm91dGUpIHtcbiAgICAgIG1pc3NpbGVSb3V0ZU5hbWVMYWJlbC50ZXh0Q29udGVudCA9IHJvdXRlcy5sZW5ndGggPT09IDAgPyBcIk5vIHJvdXRlXCIgOiBcIlJvdXRlXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1pc3NpbGVSb3V0ZU5hbWVMYWJlbC50ZXh0Q29udGVudCA9IGFjdGl2ZVJvdXRlLm5hbWUgfHwgXCJSb3V0ZVwiO1xuICAgIH1cbiAgfVxuXG4gIGlmIChtaXNzaWxlUm91dGVDb3VudExhYmVsKSB7XG4gICAgY29uc3QgY291bnQgPSBhY3RpdmVSb3V0ZSAmJiBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgPyBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICBtaXNzaWxlUm91dGVDb3VudExhYmVsLnRleHRDb250ZW50ID0gYCR7Y291bnR9IHB0c2A7XG4gIH1cblxuICBpZiAoZGVsZXRlTWlzc2lsZVJvdXRlQnRuKSB7XG4gICAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICB9XG4gIGlmIChyZW5hbWVNaXNzaWxlUm91dGVCdG4pIHtcbiAgICByZW5hbWVNaXNzaWxlUm91dGVCdG4uZGlzYWJsZWQgPSAhYWN0aXZlUm91dGU7XG4gIH1cbiAgaWYgKGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bikge1xuICAgIGNvbnN0IGNvdW50ID0gYWN0aXZlUm91dGUgJiYgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpID8gYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gICAgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuLmRpc2FibGVkID0gIWFjdGl2ZVJvdXRlIHx8IGNvdW50ID09PSAwO1xuICB9XG4gIGlmIChyb3V0ZVByZXZCdG4pIHtcbiAgICByb3V0ZVByZXZCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gIH1cbiAgaWYgKHJvdXRlTmV4dEJ0bikge1xuICAgIHJvdXRlTmV4dEJ0bi5kaXNhYmxlZCA9IHJvdXRlcy5sZW5ndGggPD0gMTtcbiAgfVxuXG4gIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG59XG5cbmZ1bmN0aW9uIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUoKTogdm9pZCB7XG4gIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBjb25zdCBhY3RpdmVSb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBjb25zdCByb3V0ZUhhc1NlbGVjdGlvbiA9XG4gICAgISFhY3RpdmVSb3V0ZSAmJlxuICAgIEFycmF5LmlzQXJyYXkoYWN0aXZlUm91dGUud2F5cG9pbnRzKSAmJlxuICAgICEhbWlzc2lsZVNlbGVjdGlvbiAmJlxuICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPj0gMCAmJlxuICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPCBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoO1xuICBpZiAoIXJvdXRlSGFzU2VsZWN0aW9uKSB7XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IG51bGw7XG4gIH1cbiAgY29uc3QgY2ZnID0gc3RhdGVSZWYubWlzc2lsZUNvbmZpZztcbiAgYXBwbHlNaXNzaWxlVUkoY2ZnKTtcbiAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBhcHBseU1pc3NpbGVVSShjZmc6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0pOiB2b2lkIHtcbiAgaWYgKG1pc3NpbGVBZ3JvU2xpZGVyKSB7XG4gICAgY29uc3QgbWluQWdybyA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuYWdyb01pbiA/PyBNSVNTSUxFX01JTl9BR1JPO1xuICAgIGNvbnN0IG1heEFncm8gPSBNYXRoLm1heCg1MDAwLCBNYXRoLmNlaWwoKGNmZy5hZ3JvUmFkaXVzICsgNTAwKSAvIDUwMCkgKiA1MDApO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5BZ3JvKTtcbiAgICBtaXNzaWxlQWdyb1NsaWRlci5tYXggPSBTdHJpbmcobWF4QWdybyk7XG4gICAgbWlzc2lsZUFncm9TbGlkZXIudmFsdWUgPSBjZmcuYWdyb1JhZGl1cy50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlQWdyb1ZhbHVlKSB7XG4gICAgbWlzc2lsZUFncm9WYWx1ZS50ZXh0Q29udGVudCA9IGNmZy5hZ3JvUmFkaXVzLnRvRml4ZWQoMCk7XG4gIH1cbiAgaWYgKCFsYXN0TWlzc2lsZUxlZ1NwZWVkIHx8IGxhc3RNaXNzaWxlTGVnU3BlZWQgPD0gMCkge1xuICAgIGxhc3RNaXNzaWxlTGVnU3BlZWQgPSBjZmcuc3BlZWQ7XG4gIH1cbiAgdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSShvdmVycmlkZXM6IFBhcnRpYWw8eyBhZ3JvUmFkaXVzOiBudW1iZXIgfT4gPSB7fSk6IHZvaWQge1xuICBjb25zdCBjdXJyZW50ID0gc3RhdGVSZWYubWlzc2lsZUNvbmZpZztcbiAgY29uc3QgY2ZnID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKFxuICAgIHtcbiAgICAgIHNwZWVkOiBjdXJyZW50LnNwZWVkLFxuICAgICAgYWdyb1JhZGl1czogb3ZlcnJpZGVzLmFncm9SYWRpdXMgPz8gY3VycmVudC5hZ3JvUmFkaXVzLFxuICAgIH0sXG4gICAgY3VycmVudCxcbiAgICBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLFxuICApO1xuICBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnID0gY2ZnO1xuICBhcHBseU1pc3NpbGVVSShjZmcpO1xuICBjb25zdCBsYXN0ID0gbGFzdE1pc3NpbGVDb25maWdTZW50O1xuICBjb25zdCBuZWVkc1NlbmQgPVxuICAgICFsYXN0IHx8XG4gICAgTWF0aC5hYnMoKGxhc3QuYWdyb1JhZGl1cyA/PyAwKSAtIGNmZy5hZ3JvUmFkaXVzKSA+IDU7XG4gIGlmIChuZWVkc1NlbmQpIHtcbiAgICBzZW5kTWlzc2lsZUNvbmZpZyhjZmcpO1xuICB9XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHVwZGF0ZVNwZWVkTWFya2VyKCk7XG59XG5cbmZ1bmN0aW9uIHNlbmRNaXNzaWxlQ29uZmlnKGNmZzogeyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfSk6IHZvaWQge1xuICBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQgPSB7XG4gICAgc3BlZWQ6IGNmZy5zcGVlZCxcbiAgICBhZ3JvUmFkaXVzOiBjZmcuYWdyb1JhZGl1cyxcbiAgfTtcbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwiY29uZmlndXJlX21pc3NpbGVcIixcbiAgICBtaXNzaWxlX3NwZWVkOiBjZmcuc3BlZWQsXG4gICAgbWlzc2lsZV9hZ3JvOiBjZmcuYWdyb1JhZGl1cyxcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTogdm9pZCB7XG4gIGlmICghc2hpcFJvdXRlc0NvbnRhaW5lciB8fCAhc2hpcFJvdXRlTGVnIHx8ICFzaGlwUm91dGVTcGVlZCB8fCAhc2hpcERlbGV0ZUJ0bikge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCB3cHMgPSBzdGF0ZVJlZi5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMgOiBbXTtcbiAgY29uc3QgaGFzVmFsaWRTZWxlY3Rpb24gPSBzZWxlY3Rpb24gIT09IG51bGwgJiYgc2VsZWN0aW9uLmluZGV4ID49IDAgJiYgc2VsZWN0aW9uLmluZGV4IDwgd3BzLmxlbmd0aDtcbiAgY29uc3QgaXNTaGlwQ29udGV4dCA9IHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIjtcbiAgY29uc3Qgc2xpZGVyQWN0aXZlID0gc2hpcFNwZWVkU2xpZGVyICYmIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IHNoaXBTcGVlZFNsaWRlcjtcblxuICBzaGlwUm91dGVzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgc2hpcFJvdXRlc0NvbnRhaW5lci5zdHlsZS5vcGFjaXR5ID0gaXNTaGlwQ29udGV4dCA/IFwiMVwiIDogXCIwLjZcIjtcblxuICBpZiAoIXN0YXRlUmVmLm1lIHx8ICFoYXNWYWxpZFNlbGVjdGlvbikge1xuICAgIHNoaXBSb3V0ZUxlZy50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgc2hpcFJvdXRlU3BlZWQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIHNoaXBEZWxldGVCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgIGlmIChpc1NoaXBDb250ZXh0KSB7XG4gICAgICBzZXRTaGlwU2xpZGVyVmFsdWUoZGVmYXVsdFNwZWVkKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHNlbGVjdGlvbiAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHdwID0gd3BzW3NlbGVjdGlvbi5pbmRleF07XG4gICAgY29uc3Qgc3BlZWQgPSB3cCAmJiB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgPyB3cC5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcbiAgICBpZiAoaXNTaGlwQ29udGV4dCAmJiBzaGlwU3BlZWRTbGlkZXIgJiYgIXNsaWRlckFjdGl2ZSAmJiBNYXRoLmFicyhwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci52YWx1ZSkgLSBzcGVlZCkgPiAwLjI1KSB7XG4gICAgICBzZXRTaGlwU2xpZGVyVmFsdWUoc3BlZWQpO1xuICAgIH0gZWxzZSBpZiAoIXNsaWRlckFjdGl2ZSkge1xuICAgICAgdXBkYXRlU3BlZWRMYWJlbChzcGVlZCk7XG4gICAgfVxuICAgIGNvbnN0IGRpc3BsYXlJbmRleCA9IHNlbGVjdGlvbi5pbmRleCArIDE7XG4gICAgc2hpcFJvdXRlTGVnLnRleHRDb250ZW50ID0gYCR7ZGlzcGxheUluZGV4fWA7XG4gICAgc2hpcFJvdXRlU3BlZWQudGV4dENvbnRlbnQgPSBgJHtzcGVlZC50b0ZpeGVkKDApfSB1L3NgO1xuICAgIHNoaXBEZWxldGVCdG4uZGlzYWJsZWQgPSAhaXNTaGlwQ29udGV4dDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk6IHZvaWQge1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBjb25zdCBjb3VudCA9IHJvdXRlICYmIEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICBjb25zdCBpc1dheXBvaW50U2VsZWN0aW9uID1cbiAgICBtaXNzaWxlU2VsZWN0aW9uICE9PSBudWxsICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbiAhPT0gdW5kZWZpbmVkICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbi50eXBlID09PSBcIndheXBvaW50XCIgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgY291bnQ7XG4gIGlmIChtaXNzaWxlRGVsZXRlQnRuKSB7XG4gICAgbWlzc2lsZURlbGV0ZUJ0bi5kaXNhYmxlZCA9ICFpc1dheXBvaW50U2VsZWN0aW9uO1xuICB9XG4gIHVwZGF0ZU1pc3NpbGVTcGVlZENvbnRyb2xzKCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVTcGVlZENvbnRyb2xzKCk6IHZvaWQge1xuICBpZiAoIW1pc3NpbGVTcGVlZFNsaWRlciB8fCAhbWlzc2lsZVNwZWVkVmFsdWUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBtaW5TcGVlZCA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4gPz8gTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgbWlzc2lsZVNwZWVkU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5TcGVlZCk7XG4gIG1pc3NpbGVTcGVlZFNsaWRlci5tYXggPSBTdHJpbmcobWF4U3BlZWQpO1xuICBjb25zdCBzbGlkZXJBY3RpdmUgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBtaXNzaWxlU3BlZWRTbGlkZXI7XG5cbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgbGV0IHNsaWRlclZhbHVlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICBpZiAoXG4gICAgcm91dGUgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbi50eXBlID09PSBcIndheXBvaW50XCIgJiZcbiAgICBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aFxuICApIHtcbiAgICBjb25zdCB3cCA9IHJvdXRlLndheXBvaW50c1ttaXNzaWxlU2VsZWN0aW9uLmluZGV4XTtcbiAgICBjb25zdCB2YWx1ZSA9IHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiAmJiB3cC5zcGVlZCA+IDAgPyB3cC5zcGVlZCA6IHN0YXRlUmVmLm1pc3NpbGVDb25maWcuc3BlZWQ7XG4gICAgc2xpZGVyVmFsdWUgPSBjbGFtcCh2YWx1ZSwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgICBpZiAoc2xpZGVyVmFsdWUgPiAwKSB7XG4gICAgICBsYXN0TWlzc2lsZUxlZ1NwZWVkID0gc2xpZGVyVmFsdWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKHNsaWRlclZhbHVlICE9PSBudWxsKSB7XG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyLmRpc2FibGVkID0gZmFsc2U7XG4gICAgaWYgKCFzbGlkZXJBY3RpdmUpIHtcbiAgICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IHNsaWRlclZhbHVlLnRvRml4ZWQoMCk7XG4gICAgfVxuICAgIG1pc3NpbGVTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gYCR7c2xpZGVyVmFsdWUudG9GaXhlZCgwKX1gO1xuICB9IGVsc2Uge1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCA9IHRydWU7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocGFyc2VGbG9hdChtaXNzaWxlU3BlZWRTbGlkZXIudmFsdWUpKSkge1xuICAgICAgbWlzc2lsZVNwZWVkU2xpZGVyLnZhbHVlID0gc3RhdGVSZWYubWlzc2lsZUNvbmZpZy5zcGVlZC50b0ZpeGVkKDApO1xuICAgIH1cbiAgICBtaXNzaWxlU3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IFwiLS1cIjtcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRTZWxlY3Rpb24oc2VsOiBTZWxlY3Rpb24gfCBudWxsKTogdm9pZCB7XG4gIHNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICBjb25zdCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IG51bGw7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDpsZWdTZWxlY3RlZFwiLCB7IGluZGV4IH0pO1xufVxuXG5mdW5jdGlvbiBzZXRNaXNzaWxlU2VsZWN0aW9uKHNlbDogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwsIHJvdXRlSWQ/OiBzdHJpbmcpOiB2b2lkIHtcbiAgbWlzc2lsZVNlbGVjdGlvbiA9IHNlbDtcbiAgaWYgKHJvdXRlSWQpIHtcbiAgICBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IHJvdXRlSWQ7XG4gIH1cbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCB3b3JsZFBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBpZiAodWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIikge1xuICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RSb3V0ZShjYW52YXNQb2ludCk7XG4gICAgc2V0U2VsZWN0aW9uKGhpdCA/PyBudWxsKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkOiBkZWZhdWx0U3BlZWQgfTtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF93YXlwb2ludFwiLCB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogZGVmYXVsdFNwZWVkIH0pO1xuICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMuc2xpY2UoKSA6IFtdO1xuICB3cHMucHVzaCh3cCk7XG4gIHN0YXRlUmVmLm1lLndheXBvaW50cyA9IHdwcztcbiAgYnVzUmVmLmVtaXQoXCJzaGlwOndheXBvaW50QWRkZWRcIiwgeyBpbmRleDogd3BzLmxlbmd0aCAtIDEgfSk7XG4gIHNldFNlbGVjdGlvbihudWxsKTtcbiAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbn1cblxuZnVuY3Rpb24gZ2V0RGVmYXVsdE1pc3NpbGVMZWdTcGVlZCgpOiBudW1iZXIge1xuICBjb25zdCBtaW5TcGVlZCA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4gPz8gTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgYmFzZSA9IGxhc3RNaXNzaWxlTGVnU3BlZWQgPiAwID8gbGFzdE1pc3NpbGVMZWdTcGVlZCA6IHN0YXRlUmVmLm1pc3NpbGVDb25maWcuc3BlZWQ7XG4gIHJldHVybiBjbGFtcChiYXNlLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVNaXNzaWxlUG9pbnRlcihjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCB3b3JsZFBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgaWYgKCFyb3V0ZSkgcmV0dXJuO1xuXG4gIGlmICh1aVN0YXRlUmVmLm1pc3NpbGVUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgY29uc3QgaGl0ID0gaGl0VGVzdE1pc3NpbGVSb3V0ZXMoY2FudmFzUG9pbnQpO1xuICAgIGlmIChoaXQpIHtcbiAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24oaGl0LnNlbGVjdGlvbiwgaGl0LnJvdXRlLmlkKTtcbiAgICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHNwZWVkID0gZ2V0RGVmYXVsdE1pc3NpbGVMZWdTcGVlZCgpO1xuICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkIH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImFkZF9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIHg6IHdwLngsXG4gICAgeTogd3AueSxcbiAgICBzcGVlZDogd3Auc3BlZWQsXG4gIH0pO1xuICByb3V0ZS53YXlwb2ludHMgPSByb3V0ZS53YXlwb2ludHMgPyBbLi4ucm91dGUud2F5cG9pbnRzLCB3cF0gOiBbd3BdO1xuICBsYXN0TWlzc2lsZUxlZ1NwZWVkID0gc3BlZWQ7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24oeyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9LCByb3V0ZS5pZCk7XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbn1cblxuZnVuY3Rpb24gY2xlYXJTaGlwUm91dGUoKTogdm9pZCB7XG4gIGNvbnN0IHdwcyA9IHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBpZiAoIXdwcyB8fCB3cHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJjbGVhcl93YXlwb2ludHNcIiB9KTtcbiAgaWYgKHN0YXRlUmVmLm1lKSB7XG4gICAgc3RhdGVSZWYubWUud2F5cG9pbnRzID0gW107XG4gIH1cbiAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICBidXNSZWYuZW1pdChcInNoaXA6d2F5cG9pbnRzQ2xlYXJlZFwiKTtcbiAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbn1cblxuZnVuY3Rpb24gZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTogdm9pZCB7XG4gIGlmICghc2VsZWN0aW9uKSByZXR1cm47XG4gIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJkZWxldGVfd2F5cG9pbnRcIiwgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCB9KTtcbiAgaWYgKHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSkge1xuICAgIHN0YXRlUmVmLm1lLndheXBvaW50cyA9IHN0YXRlUmVmLm1lLndheXBvaW50cy5zbGljZSgwLCBzZWxlY3Rpb24uaW5kZXgpO1xuICB9XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludERlbGV0ZWRcIiwgeyBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk6IHZvaWQge1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlIHx8ICFtaXNzaWxlU2VsZWN0aW9uKSByZXR1cm47XG4gIGNvbnN0IGluZGV4ID0gbWlzc2lsZVNlbGVjdGlvbi5pbmRleDtcbiAgaWYgKCFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwiZGVsZXRlX21pc3NpbGVfd2F5cG9pbnRcIixcbiAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgaW5kZXgsXG4gIH0pO1xuICByb3V0ZS53YXlwb2ludHMgPSBbLi4ucm91dGUud2F5cG9pbnRzLnNsaWNlKDAsIGluZGV4KSwgLi4ucm91dGUud2F5cG9pbnRzLnNsaWNlKGluZGV4ICsgMSldO1xuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4IH0pO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTogdm9pZCB7XG4gIGlmIChtaXNzaWxlTGF1bmNoQnRuPy5kaXNhYmxlZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlIHx8ICFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImxhdW5jaF9taXNzaWxlXCIsXG4gICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gY3ljbGVNaXNzaWxlUm91dGUoZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgaWYgKHJvdXRlcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY3VycmVudEluZGV4ID0gcm91dGVzLmZpbmRJbmRleCgocm91dGUpID0+IHJvdXRlLmlkID09PSBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCk7XG4gIGNvbnN0IGJhc2VJbmRleCA9IGN1cnJlbnRJbmRleCA+PSAwID8gY3VycmVudEluZGV4IDogMDtcbiAgY29uc3QgbmV4dEluZGV4ID0gKChiYXNlSW5kZXggKyBkaXJlY3Rpb24pICUgcm91dGVzLmxlbmd0aCArIHJvdXRlcy5sZW5ndGgpICUgcm91dGVzLmxlbmd0aDtcbiAgY29uc3QgbmV4dFJvdXRlID0gcm91dGVzW25leHRJbmRleF07XG4gIGlmICghbmV4dFJvdXRlKSByZXR1cm47XG4gIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dFJvdXRlLmlkO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJzZXRfYWN0aXZlX21pc3NpbGVfcm91dGVcIixcbiAgICByb3V0ZV9pZDogbmV4dFJvdXRlLmlkLFxuICB9KTtcbiAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLCB7IHJvdXRlSWQ6IG5leHRSb3V0ZS5pZCB9KTtcbn1cblxuZnVuY3Rpb24gY3ljbGVTaGlwU2VsZWN0aW9uKGRpcmVjdGlvbjogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHdwcyA9IHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBpZiAoIXdwcyB8fCB3cHMubGVuZ3RoID09PSAwKSB7XG4gICAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgaW5kZXggPSBzZWxlY3Rpb24gPyBzZWxlY3Rpb24uaW5kZXggOiBkaXJlY3Rpb24gPiAwID8gLTEgOiB3cHMubGVuZ3RoO1xuICBpbmRleCArPSBkaXJlY3Rpb247XG4gIGlmIChpbmRleCA8IDApIGluZGV4ID0gd3BzLmxlbmd0aCAtIDE7XG4gIGlmIChpbmRleCA+PSB3cHMubGVuZ3RoKSBpbmRleCA9IDA7XG4gIHNldFNlbGVjdGlvbih7IHR5cGU6IFwibGVnXCIsIGluZGV4IH0pO1xufVxuXG5mdW5jdGlvbiBzZXRJbnB1dENvbnRleHQoY29udGV4dDogXCJzaGlwXCIgfCBcIm1pc3NpbGVcIik6IHZvaWQge1xuICBjb25zdCBuZXh0ID0gY29udGV4dCA9PT0gXCJtaXNzaWxlXCIgPyBcIm1pc3NpbGVcIiA6IFwic2hpcFwiO1xuICBpZiAodWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IG5leHQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPSBuZXh0O1xuXG4gIC8vIEFsc28gdXBkYXRlIGFjdGl2ZVRvb2wgdG8gbWF0Y2ggdGhlIGNvbnRleHQgdG8ga2VlcCBidXR0b24gc3RhdGVzIGluIHN5bmNcbiAgaWYgKG5leHQgPT09IFwic2hpcFwiKSB7XG4gICAgY29uc3Qgc2hpcFRvb2xUb1VzZSA9IHVpU3RhdGVSZWYuc2hpcFRvb2wgPT09IFwic2VsZWN0XCIgPyBcInNoaXAtc2VsZWN0XCIgOiBcInNoaXAtc2V0XCI7XG4gICAgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCAhPT0gc2hpcFRvb2xUb1VzZSkge1xuICAgICAgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID0gc2hpcFRvb2xUb1VzZTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgbWlzc2lsZVRvb2xUb1VzZSA9IHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIgPyBcIm1pc3NpbGUtc2VsZWN0XCIgOiBcIm1pc3NpbGUtc2V0XCI7XG4gICAgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCAhPT0gbWlzc2lsZVRvb2xUb1VzZSkge1xuICAgICAgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID0gbWlzc2lsZVRvb2xUb1VzZTtcbiAgICB9XG4gIH1cblxuICBidXNSZWYuZW1pdChcImNvbnRleHQ6Y2hhbmdlZFwiLCB7IGNvbnRleHQ6IG5leHQgfSk7XG4gIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBzZXRBY3RpdmVUb29sKHRvb2w6IEFjdGl2ZVRvb2wpOiB2b2lkIHtcbiAgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gdG9vbCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9IHRvb2w7XG5cbiAgLy8gVXBkYXRlIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgc3RhdGVzXG4gIGlmICh0b29sID09PSBcInNoaXAtc2V0XCIpIHtcbiAgICB1aVN0YXRlUmVmLnNoaXBUb29sID0gXCJzZXRcIjtcbiAgICB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID0gbnVsbDtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2V0XCIgfSk7XG4gIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IFwic2VsZWN0XCI7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IG51bGw7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICBidXNSZWYuZW1pdChcInNoaXA6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNlbGVjdFwiIH0pO1xuICB9IGVsc2UgaWYgKHRvb2wgPT09IFwibWlzc2lsZS1zZXRcIikge1xuICAgIHVpU3RhdGVSZWYuc2hpcFRvb2wgPSBudWxsO1xuICAgIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPSBcInNldFwiO1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNldFwiIH0pO1xuICB9IGVsc2UgaWYgKHRvb2wgPT09IFwibWlzc2lsZS1zZWxlY3RcIikge1xuICAgIHVpU3RhdGVSZWYuc2hpcFRvb2wgPSBudWxsO1xuICAgIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPSBcInNlbGVjdFwiO1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZWxlY3RcIiB9KTtcbiAgfVxuXG4gIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG59XG5cbmZ1bmN0aW9uIHNldEJ1dHRvblN0YXRlKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsLCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgaWYgKCFidG4pIHJldHVybjtcbiAgaWYgKGFjdGl2ZSkge1xuICAgIGJ0bi5kYXRhc2V0LnN0YXRlID0gXCJhY3RpdmVcIjtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwidHJ1ZVwiKTtcbiAgfSBlbHNlIHtcbiAgICBkZWxldGUgYnRuLmRhdGFzZXQuc3RhdGU7XG4gICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcImZhbHNlXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk6IHZvaWQge1xuICBzZXRCdXR0b25TdGF0ZShzaGlwU2V0QnRuLCB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZXRcIik7XG4gIHNldEJ1dHRvblN0YXRlKHNoaXBTZWxlY3RCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKTtcbiAgc2V0QnV0dG9uU3RhdGUobWlzc2lsZVNldEJ0biwgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2V0XCIpO1xuICBzZXRCdXR0b25TdGF0ZShtaXNzaWxlU2VsZWN0QnRuLCB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZWxlY3RcIik7XG5cbiAgaWYgKHNoaXBDb250cm9sc0NhcmQpIHtcbiAgICBzaGlwQ29udHJvbHNDYXJkLmNsYXNzTGlzdC50b2dnbGUoXCJhY3RpdmVcIiwgdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwic2hpcFwiKTtcbiAgfVxuICBpZiAobWlzc2lsZUNvbnRyb2xzQ2FyZCkge1xuICAgIG1pc3NpbGVDb250cm9sc0NhcmQuY2xhc3NMaXN0LnRvZ2dsZShcImFjdGl2ZVwiLCB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldEhlbHBWaXNpYmxlKGZsYWc6IGJvb2xlYW4pOiB2b2lkIHtcbiAgdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSA9IEJvb2xlYW4oZmxhZyk7XG4gIHVwZGF0ZUhlbHBPdmVybGF5KCk7XG4gIGJ1c1JlZi5lbWl0KFwiaGVscDp2aXNpYmxlQ2hhbmdlZFwiLCB7IHZpc2libGU6IHVpU3RhdGVSZWYuaGVscFZpc2libGUgfSk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUhlbHBPdmVybGF5KCk6IHZvaWQge1xuICBpZiAoIWhlbHBPdmVybGF5KSByZXR1cm47XG4gIGlmIChoZWxwVGV4dCkge1xuICAgIGhlbHBUZXh0LnRleHRDb250ZW50ID0gSEVMUF9URVhUO1xuICB9XG4gIGhlbHBPdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoXCJ2aXNpYmxlXCIsIHVpU3RhdGVSZWYuaGVscFZpc2libGUpO1xufVxuXG5mdW5jdGlvbiBhZGp1c3RTbGlkZXJWYWx1ZShpbnB1dDogSFRNTElucHV0RWxlbWVudCB8IG51bGwsIHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IG51bWJlciB8IG51bGwge1xuICBpZiAoIWlucHV0KSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgc3RlcCA9IE1hdGguYWJzKHBhcnNlRmxvYXQoaW5wdXQuc3RlcCkpIHx8IDE7XG4gIGNvbnN0IG11bHRpcGxpZXIgPSBjb2Fyc2UgPyA0IDogMTtcbiAgY29uc3QgbWluID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWluKSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1pbikgOiAtSW5maW5pdHk7XG4gIGNvbnN0IG1heCA9IE51bWJlci5pc0Zpbml0ZShwYXJzZUZsb2F0KGlucHV0Lm1heCkpID8gcGFyc2VGbG9hdChpbnB1dC5tYXgpIDogSW5maW5pdHk7XG4gIGNvbnN0IGN1cnJlbnQgPSBwYXJzZUZsb2F0KGlucHV0LnZhbHVlKSB8fCAwO1xuICBsZXQgbmV4dCA9IGN1cnJlbnQgKyBzdGVwcyAqIHN0ZXAgKiBtdWx0aXBsaWVyO1xuICBpZiAoTnVtYmVyLmlzRmluaXRlKG1pbikpIG5leHQgPSBNYXRoLm1heChtaW4sIG5leHQpO1xuICBpZiAoTnVtYmVyLmlzRmluaXRlKG1heCkpIG5leHQgPSBNYXRoLm1pbihtYXgsIG5leHQpO1xuICBpZiAoTWF0aC5hYnMobmV4dCAtIGN1cnJlbnQpIDwgMWUtNCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGlucHV0LnZhbHVlID0gU3RyaW5nKG5leHQpO1xuICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudChcImlucHV0XCIsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gIHJldHVybiBuZXh0O1xufVxuXG5mdW5jdGlvbiBvbldpbmRvd0tleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgY29uc3QgdGFyZ2V0ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGNvbnN0IGlzRWRpdGFibGUgPSAhIXRhcmdldCAmJiAodGFyZ2V0LnRhZ05hbWUgPT09IFwiSU5QVVRcIiB8fCB0YXJnZXQudGFnTmFtZSA9PT0gXCJURVhUQVJFQVwiIHx8IHRhcmdldC5pc0NvbnRlbnRFZGl0YWJsZSk7XG5cbiAgaWYgKHVpU3RhdGVSZWYuaGVscFZpc2libGUgJiYgZXZlbnQua2V5ICE9PSBcIkVzY2FwZVwiKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoaXNFZGl0YWJsZSkge1xuICAgIGlmIChldmVudC5rZXkgPT09IFwiRXNjYXBlXCIpIHtcbiAgICAgIHRhcmdldC5ibHVyKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBzd2l0Y2ggKGV2ZW50LmNvZGUpIHtcbiAgICBjYXNlIFwiRGlnaXQxXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiRGlnaXQyXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5VFwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNldFwiKSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNlbGVjdFwiKTtcbiAgICAgIH0gZWxzZSBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2VsZWN0XCIpIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5Q1wiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGNsZWFyU2hpcFJvdXRlKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlIXCI6XG4gICAgICAvLyBIIGtleTogSG9sZCBwb3NpdGlvbiAoY2xlYXIgYWxsIHdheXBvaW50cywgc3RvcCBzaGlwKVxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGNsZWFyU2hpcFJvdXRlKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJCcmFja2V0TGVmdFwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGFkanVzdFNsaWRlclZhbHVlKHNoaXBTcGVlZFNsaWRlciwgLTEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkJyYWNrZXRSaWdodFwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGFkanVzdFNsaWRlclZhbHVlKHNoaXBTcGVlZFNsaWRlciwgMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiVGFiXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgY3ljbGVTaGlwU2VsZWN0aW9uKGV2ZW50LnNoaWZ0S2V5ID8gLTEgOiAxKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleU5cIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBtaXNzaWxlQWRkUm91dGVCdG4/LmNsaWNrKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlMXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgbGF1bmNoQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlFXCI6XG4gICAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2V0XCIpIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2VsZWN0XCIpO1xuICAgICAgfSBlbHNlIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZWxlY3RcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJDb21tYVwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGFkanVzdFNsaWRlclZhbHVlKG1pc3NpbGVBZ3JvU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiUGVyaW9kXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIlNlbWljb2xvblwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIgJiYgIW1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCkge1xuICAgICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlU3BlZWRTbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJRdW90ZVwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIgJiYgIW1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCkge1xuICAgICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRlbGV0ZVwiOlxuICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgbWlzc2lsZVNlbGVjdGlvbikge1xuICAgICAgICBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgfSBlbHNlIGlmIChzZWxlY3Rpb24pIHtcbiAgICAgICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkVzY2FwZVwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuaGVscFZpc2libGUpIHtcbiAgICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgICAgfSBlbHNlIGlmIChtaXNzaWxlU2VsZWN0aW9uKSB7XG4gICAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHNlbGVjdGlvbikge1xuICAgICAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiRXF1YWxcIjpcbiAgICBjYXNlIFwiTnVtcGFkQWRkXCI6XG4gICAgICBpZiAoIWN2KSByZXR1cm47XG4gICAgICBzZXRab29tKHVpU3RhdGVSZWYuem9vbSAqIDEuMiwgY3Yud2lkdGggLyAyLCBjdi5oZWlnaHQgLyAyKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIk1pbnVzXCI6XG4gICAgY2FzZSBcIk51bXBhZFN1YnRyYWN0XCI6XG4gICAgICBpZiAoIWN2KSByZXR1cm47XG4gICAgICBzZXRab29tKHVpU3RhdGVSZWYuem9vbSAvIDEuMiwgY3Yud2lkdGggLyAyLCBjdi5oZWlnaHQgLyAyKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRpZ2l0MFwiOlxuICAgIGNhc2UgXCJOdW1wYWQwXCI6XG4gICAgICBpZiAoZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5KSB7XG4gICAgICAgIHVpU3RhdGVSZWYuem9vbSA9IDEuMDtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICBkZWZhdWx0OlxuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgIHNldEhlbHBWaXNpYmxlKCF1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldENhbWVyYVBvc2l0aW9uKCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gIGlmICghY3YpIHJldHVybiB7IHg6IHdvcmxkLncgLyAyLCB5OiB3b3JsZC5oIC8gMiB9O1xuXG4gIGNvbnN0IHpvb20gPSB1aVN0YXRlUmVmLnpvb207XG5cbiAgLy8gQ2FtZXJhIGZvbGxvd3Mgc2hpcCwgb3IgZGVmYXVsdHMgdG8gd29ybGQgY2VudGVyXG4gIGxldCBjYW1lcmFYID0gc3RhdGVSZWYubWUgPyBzdGF0ZVJlZi5tZS54IDogd29ybGQudyAvIDI7XG4gIGxldCBjYW1lcmFZID0gc3RhdGVSZWYubWUgPyBzdGF0ZVJlZi5tZS55IDogd29ybGQuaCAvIDI7XG5cbiAgLy8gQ2FsY3VsYXRlIHZpc2libGUgd29ybGQgYXJlYSBhdCBjdXJyZW50IHpvb20gdXNpbmcgdW5pZm9ybSBzY2FsZVxuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAvLyBXb3JsZCB1bml0cyB2aXNpYmxlIG9uIHNjcmVlblxuICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjdi5oZWlnaHQgLyBzY2FsZTtcblxuICAvLyBDbGFtcCBjYW1lcmEgdG8gcHJldmVudCB6b29taW5nIHBhc3Qgd29ybGQgYm91bmRhcmllc1xuICAvLyBXaGVuIHpvb21lZCBvdXQsIGNhbWVyYSBjYW4ndCBnZXQgY2xvc2VyIHRvIGVkZ2VzIHRoYW4gaGFsZiB2aWV3cG9ydFxuICBjb25zdCBtaW5DYW1lcmFYID0gdmlld3BvcnRXaWR0aCAvIDI7XG4gIGNvbnN0IG1heENhbWVyYVggPSB3b3JsZC53IC0gdmlld3BvcnRXaWR0aCAvIDI7XG4gIGNvbnN0IG1pbkNhbWVyYVkgPSB2aWV3cG9ydEhlaWdodCAvIDI7XG4gIGNvbnN0IG1heENhbWVyYVkgPSB3b3JsZC5oIC0gdmlld3BvcnRIZWlnaHQgLyAyO1xuXG4gIC8vIEFsd2F5cyBjbGFtcCBjYW1lcmEgdG8gd29ybGQgYm91bmRhcmllc1xuICAvLyBXaGVuIHZpZXdwb3J0ID49IHdvcmxkIGRpbWVuc2lvbnMsIGNlbnRlciB0aGUgd29ybGQgb24gc2NyZWVuXG4gIGlmICh2aWV3cG9ydFdpZHRoIDwgd29ybGQudykge1xuICAgIGNhbWVyYVggPSBjbGFtcChjYW1lcmFYLCBtaW5DYW1lcmFYLCBtYXhDYW1lcmFYKTtcbiAgfSBlbHNlIHtcbiAgICBjYW1lcmFYID0gd29ybGQudyAvIDI7XG4gIH1cblxuICBpZiAodmlld3BvcnRIZWlnaHQgPCB3b3JsZC5oKSB7XG4gICAgY2FtZXJhWSA9IGNsYW1wKGNhbWVyYVksIG1pbkNhbWVyYVksIG1heENhbWVyYVkpO1xuICB9IGVsc2Uge1xuICAgIGNhbWVyYVkgPSB3b3JsZC5oIC8gMjtcbiAgfVxuXG4gIHJldHVybiB7IHg6IGNhbWVyYVgsIHk6IGNhbWVyYVkgfTtcbn1cblxuZnVuY3Rpb24gd29ybGRUb0NhbnZhcyhwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICBpZiAoIWN2KSByZXR1cm4geyB4OiBwLngsIHk6IHAueSB9O1xuXG4gIGNvbnN0IHpvb20gPSB1aVN0YXRlUmVmLnpvb207XG4gIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgLy8gV29ybGQgcG9zaXRpb24gcmVsYXRpdmUgdG8gY2FtZXJhXG4gIGNvbnN0IHdvcmxkWCA9IHAueCAtIGNhbWVyYS54O1xuICBjb25zdCB3b3JsZFkgPSBwLnkgLSBjYW1lcmEueTtcblxuICAvLyBVc2UgdW5pZm9ybSBzY2FsZSB0byBtYWludGFpbiBhc3BlY3QgcmF0aW9cbiAgLy8gU2NhbGUgaXMgcGl4ZWxzIHBlciB3b3JsZCB1bml0IC0gY2hvb3NlIHRoZSBkaW1lbnNpb24gdGhhdCBmaXRzXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gIC8vIENvbnZlcnQgdG8gY2FudmFzIGNvb3JkaW5hdGVzIChjZW50ZXJlZCBvbiBzY3JlZW4pXG4gIHJldHVybiB7XG4gICAgeDogd29ybGRYICogc2NhbGUgKyBjdi53aWR0aCAvIDIsXG4gICAgeTogd29ybGRZICogc2NhbGUgKyBjdi5oZWlnaHQgLyAyXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcblxuICBjb25zdCB6b29tID0gdWlTdGF0ZVJlZi56b29tO1xuICBjb25zdCBjYW1lcmEgPSBnZXRDYW1lcmFQb3NpdGlvbigpO1xuXG4gIC8vIENhbnZhcyBwb3NpdGlvbiByZWxhdGl2ZSB0byBjZW50ZXJcbiAgY29uc3QgY2FudmFzWCA9IHAueCAtIGN2LndpZHRoIC8gMjtcbiAgY29uc3QgY2FudmFzWSA9IHAueSAtIGN2LmhlaWdodCAvIDI7XG5cbiAgLy8gVXNlIHVuaWZvcm0gc2NhbGUgdG8gbWFpbnRhaW4gYXNwZWN0IHJhdGlvXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gIC8vIENvbnZlcnQgdG8gd29ybGQgY29vcmRpbmF0ZXMgKGludmVyc2Ugb2Ygd29ybGRUb0NhbnZhcylcbiAgcmV0dXJuIHtcbiAgICB4OiBjYW52YXNYIC8gc2NhbGUgKyBjYW1lcmEueCxcbiAgICB5OiBjYW52YXNZIC8gc2NhbGUgKyBjYW1lcmEueVxuICB9O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlUm91dGVQb2ludHMoKSB7XG4gIGlmICghc3RhdGVSZWYubWUpIHJldHVybiBudWxsO1xuICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMgOiBbXTtcbiAgY29uc3Qgd29ybGRQb2ludHMgPSBbeyB4OiBzdGF0ZVJlZi5tZS54LCB5OiBzdGF0ZVJlZi5tZS55IH1dO1xuICBmb3IgKGNvbnN0IHdwIG9mIHdwcykge1xuICAgIHdvcmxkUG9pbnRzLnB1c2goeyB4OiB3cC54LCB5OiB3cC55IH0pO1xuICB9XG4gIGNvbnN0IGNhbnZhc1BvaW50cyA9IHdvcmxkUG9pbnRzLm1hcCgocG9pbnQpID0+IHdvcmxkVG9DYW52YXMocG9pbnQpKTtcbiAgcmV0dXJuIHsgd2F5cG9pbnRzOiB3cHMsIHdvcmxkUG9pbnRzLCBjYW52YXNQb2ludHMgfTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IHdwcyA9IHJvdXRlICYmIEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cyA6IFtdO1xuICBjb25zdCB3b3JsZFBvaW50cyA9IFt7IHg6IHN0YXRlUmVmLm1lLngsIHk6IHN0YXRlUmVmLm1lLnkgfV07XG4gIGZvciAoY29uc3Qgd3Agb2Ygd3BzKSB7XG4gICAgd29ybGRQb2ludHMucHVzaCh7IHg6IHdwLngsIHk6IHdwLnkgfSk7XG4gIH1cbiAgY29uc3QgY2FudmFzUG9pbnRzID0gd29ybGRQb2ludHMubWFwKChwb2ludCkgPT4gd29ybGRUb0NhbnZhcyhwb2ludCkpO1xuICByZXR1cm4geyB3YXlwb2ludHM6IHdwcywgd29ybGRQb2ludHMsIGNhbnZhc1BvaW50cyB9O1xufVxuXG4vLyBIZWxwZXI6IEZpbmQgd2F5cG9pbnQgYXQgY2FudmFzIHBvc2l0aW9uXG5mdW5jdGlvbiBmaW5kV2F5cG9pbnRBdFBvc2l0aW9uKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBudW1iZXIgfCBudWxsIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZT8ud2F5cG9pbnRzKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gIC8vIENoZWNrIHdheXBvaW50cyBpbiByZXZlcnNlIG9yZGVyICh0b3AgdG8gYm90dG9tIHZpc3VhbGx5KVxuICAvLyBTa2lwIHRoZSBmaXJzdCBjYW52YXMgcG9pbnQgKHNoaXAgcG9zaXRpb24pXG4gIGZvciAobGV0IGkgPSByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBjb25zdCB3YXlwb2ludENhbnZhcyA9IHJvdXRlLmNhbnZhc1BvaW50c1tpICsgMV07IC8vICsxIGJlY2F1c2UgZmlyc3QgcG9pbnQgaXMgc2hpcCBwb3NpdGlvblxuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdheXBvaW50Q2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd2F5cG9pbnRDYW52YXMueTtcbiAgICBjb25zdCBkaXN0ID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcblxuICAgIGlmIChkaXN0IDw9IFdBWVBPSU5UX0hJVEJPWF9SQURJVVMpIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlKFxuICBzdG9yZTogTWFwPG51bWJlciwgbnVtYmVyPixcbiAgd2F5cG9pbnRzOiBBcnJheTx7IHNwZWVkPzogbnVtYmVyIH0+LFxuICB3b3JsZFBvaW50czogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlciB9PixcbiAgY2FudmFzUG9pbnRzOiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0+LFxuICBmYWxsYmFja1NwZWVkOiBudW1iZXIsXG4gIGR0U2Vjb25kczogbnVtYmVyLFxuICBjeWNsZSA9IDY0LFxuKTogdm9pZCB7XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKGR0U2Vjb25kcykgfHwgZHRTZWNvbmRzIDwgMCkge1xuICAgIGR0U2Vjb25kcyA9IDA7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwID0gd2F5cG9pbnRzW2ldO1xuICAgIGNvbnN0IHNwZWVkID0gdHlwZW9mIHdwLnNwZWVkID09PSBcIm51bWJlclwiICYmIHdwLnNwZWVkID4gMCA/IHdwLnNwZWVkIDogZmFsbGJhY2tTcGVlZDtcbiAgICBjb25zdCBhV29ybGQgPSB3b3JsZFBvaW50c1tpXTtcbiAgICBjb25zdCBiV29ybGQgPSB3b3JsZFBvaW50c1tpICsgMV07XG4gICAgY29uc3Qgd29ybGREaXN0ID0gTWF0aC5oeXBvdChiV29ybGQueCAtIGFXb3JsZC54LCBiV29ybGQueSAtIGFXb3JsZC55KTtcbiAgICBjb25zdCBhQ2FudmFzID0gY2FudmFzUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJDYW52YXMgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGNhbnZhc0Rpc3QgPSBNYXRoLmh5cG90KGJDYW52YXMueCAtIGFDYW52YXMueCwgYkNhbnZhcy55IC0gYUNhbnZhcy55KTtcblxuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHNwZWVkKSB8fCBzcGVlZCA8PSAxZS0zIHx8ICFOdW1iZXIuaXNGaW5pdGUod29ybGREaXN0KSB8fCB3b3JsZERpc3QgPD0gMWUtMyB8fCBjYW52YXNEaXN0IDw9IDFlLTMpIHtcbiAgICAgIHN0b3JlLnNldChpLCAwKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChkdFNlY29uZHMgPD0gMCkge1xuICAgICAgaWYgKCFzdG9yZS5oYXMoaSkpIHtcbiAgICAgICAgc3RvcmUuc2V0KGksIDApO1xuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBjYW52YXNEaXN0IC8gd29ybGREaXN0O1xuICAgIGNvbnN0IGRhc2hTcGVlZCA9IHNwZWVkICogc2NhbGU7XG4gICAgbGV0IG5leHQgPSAoc3RvcmUuZ2V0KGkpID8/IDApIC0gZGFzaFNwZWVkICogZHRTZWNvbmRzO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG5leHQpKSB7XG4gICAgICBuZXh0ID0gMDtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCA9ICgobmV4dCAlIGN5Y2xlKSArIGN5Y2xlKSAlIGN5Y2xlO1xuICAgIH1cbiAgICBzdG9yZS5zZXQoaSwgbmV4dCk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgb2YgQXJyYXkuZnJvbShzdG9yZS5rZXlzKCkpKSB7XG4gICAgaWYgKGtleSA+PSB3YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBzdG9yZS5kZWxldGUoa2V5KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlUm91dGVBbmltYXRpb25zKGR0U2Vjb25kczogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghc3RhdGVSZWYubWUpIHtcbiAgICBzaGlwTGVnRGFzaE9mZnNldHMuY2xlYXIoKTtcbiAgICBtaXNzaWxlTGVnRGFzaE9mZnNldHMuY2xlYXIoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlKSB7XG4gICAgY29uc3Qgc2hpcFJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gICAgaWYgKHNoaXBSb3V0ZSAmJiBzaGlwUm91dGUud2F5cG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHVwZGF0ZURhc2hPZmZzZXRzRm9yUm91dGUoc2hpcExlZ0Rhc2hPZmZzZXRzLCBzaGlwUm91dGUud2F5cG9pbnRzLCBzaGlwUm91dGUud29ybGRQb2ludHMsIHNoaXBSb3V0ZS5jYW52YXNQb2ludHMsIGRlZmF1bHRTcGVlZCwgZHRTZWNvbmRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2hpcExlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHNoaXBMZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICB9XG5cbiAgY29uc3QgYWN0aXZlTWlzc2lsZVJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IG1pc3NpbGVSb3V0ZVBvaW50cyA9IGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKTtcbiAgaWYgKFxuICAgIGFjdGl2ZU1pc3NpbGVSb3V0ZSAmJlxuICAgIG1pc3NpbGVSb3V0ZVBvaW50cyAmJlxuICAgIEFycmF5LmlzQXJyYXkoYWN0aXZlTWlzc2lsZVJvdXRlLndheXBvaW50cykgJiZcbiAgICBhY3RpdmVNaXNzaWxlUm91dGUud2F5cG9pbnRzLmxlbmd0aCA+IDBcbiAgKSB7XG4gICAgY29uc3QgZmFsbGJhY2tTcGVlZCA9IGxhc3RNaXNzaWxlTGVnU3BlZWQgPiAwID8gbGFzdE1pc3NpbGVMZWdTcGVlZCA6IHN0YXRlUmVmLm1pc3NpbGVDb25maWcuc3BlZWQ7XG4gICAgdXBkYXRlRGFzaE9mZnNldHNGb3JSb3V0ZShcbiAgICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyxcbiAgICAgIGFjdGl2ZU1pc3NpbGVSb3V0ZS53YXlwb2ludHMsXG4gICAgICBtaXNzaWxlUm91dGVQb2ludHMud29ybGRQb2ludHMsXG4gICAgICBtaXNzaWxlUm91dGVQb2ludHMuY2FudmFzUG9pbnRzLFxuICAgICAgZmFsbGJhY2tTcGVlZCxcbiAgICAgIGR0U2Vjb25kcyxcbiAgICAgIDY0LFxuICAgICk7XG4gIH0gZWxzZSB7XG4gICAgbWlzc2lsZUxlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcG9pbnRTZWdtZW50RGlzdGFuY2UocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBhOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIGI6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IG51bWJlciB7XG4gIGNvbnN0IGFieCA9IGIueCAtIGEueDtcbiAgY29uc3QgYWJ5ID0gYi55IC0gYS55O1xuICBjb25zdCBhcHggPSBwLnggLSBhLng7XG4gIGNvbnN0IGFweSA9IHAueSAtIGEueTtcbiAgY29uc3QgYWJMZW5TcSA9IGFieCAqIGFieCArIGFieSAqIGFieTtcbiAgY29uc3QgdCA9IGFiTGVuU3EgPT09IDAgPyAwIDogY2xhbXAoYXB4ICogYWJ4ICsgYXB5ICogYWJ5LCAwLCBhYkxlblNxKSAvIGFiTGVuU3E7XG4gIGNvbnN0IHByb2p4ID0gYS54ICsgYWJ4ICogdDtcbiAgY29uc3QgcHJvankgPSBhLnkgKyBhYnkgKiB0O1xuICBjb25zdCBkeCA9IHAueCAtIHByb2p4O1xuICBjb25zdCBkeSA9IHAueSAtIHByb2p5O1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG5mdW5jdGlvbiBoaXRUZXN0Um91dGUoY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IFNlbGVjdGlvbiB8IG51bGwge1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCB7IGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IHdheXBvaW50SGl0UmFkaXVzID0gMTI7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3BDYW52YXMgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdwQ2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd3BDYW52YXMueTtcbiAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpIDw9IHdheXBvaW50SGl0UmFkaXVzKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG4gIGlmICghdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgbGVnSGl0RGlzdGFuY2UgPSAxMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBkaXN0ID0gcG9pbnRTZWdtZW50RGlzdGFuY2UoY2FudmFzUG9pbnQsIGNhbnZhc1BvaW50c1tpXSwgY2FudmFzUG9pbnRzW2kgKyAxXSk7XG4gICAgaWYgKGRpc3QgPD0gbGVnSGl0RGlzdGFuY2UpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6IFwibGVnXCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBoaXRUZXN0TWlzc2lsZVJvdXRlcyhjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyByb3V0ZTogTWlzc2lsZVJvdXRlOyBzZWxlY3Rpb246IE1pc3NpbGVTZWxlY3Rpb24gfSB8IG51bGwge1xuICBpZiAoIXN0YXRlUmVmLm1lKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgaWYgKHJvdXRlcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHNoaXBQb3MgPSB7IHg6IHN0YXRlUmVmLm1lLngsIHk6IHN0YXRlUmVmLm1lLnkgfTtcbiAgY29uc3Qgd2F5cG9pbnRIaXRSYWRpdXMgPSAxNjtcbiAgY29uc3QgbGVnSGl0RGlzdGFuY2UgPSAxMDtcblxuICBsZXQgYmVzdDogeyByb3V0ZTogTWlzc2lsZVJvdXRlOyBzZWxlY3Rpb246IE1pc3NpbGVTZWxlY3Rpb247IHBvaW50ZXJEaXN0OiBudW1iZXI7IHNoaXBEaXN0OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuXG4gIGZvciAoY29uc3Qgcm91dGUgb2Ygcm91dGVzKSB7XG4gICAgY29uc3Qgd2F5cG9pbnRzID0gQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzIDogW107XG4gICAgaWYgKHdheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHdvcmxkUG9pbnRzID0gW3NoaXBQb3MsIC4uLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyB4OiB3cC54LCB5OiB3cC55IH0pKV07XG4gICAgY29uc3QgY2FudmFzUG9pbnRzID0gd29ybGRQb2ludHMubWFwKChwb2ludCkgPT4gd29ybGRUb0NhbnZhcyhwb2ludCkpO1xuXG4gICAgLy8gQ2hlY2sgd2F5cG9pbnQgaGl0cyAoc2tpcCBzaGlwIHBvc2l0aW9uIGF0IGluZGV4IDApXG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPCBjYW52YXNQb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHdwQ2FudmFzID0gY2FudmFzUG9pbnRzW2ldO1xuICAgICAgY29uc3QgZHggPSBjYW52YXNQb2ludC54IC0gd3BDYW52YXMueDtcbiAgICAgIGNvbnN0IGR5ID0gY2FudmFzUG9pbnQueSAtIHdwQ2FudmFzLnk7XG4gICAgICBjb25zdCBwb2ludGVyRGlzdCA9IE1hdGguaHlwb3QoZHgsIGR5KTtcbiAgICAgIGlmIChwb2ludGVyRGlzdCA8PSB3YXlwb2ludEhpdFJhZGl1cykge1xuICAgICAgICBjb25zdCB3b3JsZFBvaW50ID0gd29ybGRQb2ludHNbaV07XG4gICAgICAgIGNvbnN0IHNoaXBEaXN0ID0gTWF0aC5oeXBvdCh3b3JsZFBvaW50LnggLSBzaGlwUG9zLngsIHdvcmxkUG9pbnQueSAtIHNoaXBQb3MueSk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAhYmVzdCB8fFxuICAgICAgICAgIHBvaW50ZXJEaXN0IDwgYmVzdC5wb2ludGVyRGlzdCAtIDAuMSB8fFxuICAgICAgICAgIChNYXRoLmFicyhwb2ludGVyRGlzdCAtIGJlc3QucG9pbnRlckRpc3QpIDw9IDAuNSAmJiBzaGlwRGlzdCA8IGJlc3Quc2hpcERpc3QpXG4gICAgICAgICkge1xuICAgICAgICAgIGJlc3QgPSB7XG4gICAgICAgICAgICByb3V0ZSxcbiAgICAgICAgICAgIHNlbGVjdGlvbjogeyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBpIC0gMSB9LFxuICAgICAgICAgICAgcG9pbnRlckRpc3QsXG4gICAgICAgICAgICBzaGlwRGlzdCxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgbGVnIGhpdHNcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNhbnZhc1BvaW50cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgIGNvbnN0IHBvaW50ZXJEaXN0ID0gcG9pbnRTZWdtZW50RGlzdGFuY2UoY2FudmFzUG9pbnQsIGNhbnZhc1BvaW50c1tpXSwgY2FudmFzUG9pbnRzW2kgKyAxXSk7XG4gICAgICBpZiAocG9pbnRlckRpc3QgPD0gbGVnSGl0RGlzdGFuY2UpIHtcbiAgICAgICAgY29uc3QgbWlkV29ybGQgPSB7XG4gICAgICAgICAgeDogKHdvcmxkUG9pbnRzW2ldLnggKyB3b3JsZFBvaW50c1tpICsgMV0ueCkgKiAwLjUsXG4gICAgICAgICAgeTogKHdvcmxkUG9pbnRzW2ldLnkgKyB3b3JsZFBvaW50c1tpICsgMV0ueSkgKiAwLjUsXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IHNoaXBEaXN0ID0gTWF0aC5oeXBvdChtaWRXb3JsZC54IC0gc2hpcFBvcy54LCBtaWRXb3JsZC55IC0gc2hpcFBvcy55KTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICFiZXN0IHx8XG4gICAgICAgICAgcG9pbnRlckRpc3QgPCBiZXN0LnBvaW50ZXJEaXN0IC0gMC4xIHx8XG4gICAgICAgICAgKE1hdGguYWJzKHBvaW50ZXJEaXN0IC0gYmVzdC5wb2ludGVyRGlzdCkgPD0gMC41ICYmIHNoaXBEaXN0IDwgYmVzdC5zaGlwRGlzdClcbiAgICAgICAgKSB7XG4gICAgICAgICAgYmVzdCA9IHtcbiAgICAgICAgICAgIHJvdXRlLFxuICAgICAgICAgICAgc2VsZWN0aW9uOiB7IHR5cGU6IFwicm91dGVcIiwgaW5kZXg6IGkgfSxcbiAgICAgICAgICAgIHBvaW50ZXJEaXN0LFxuICAgICAgICAgICAgc2hpcERpc3QsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmICghYmVzdCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiB7IHJvdXRlOiBiZXN0LnJvdXRlLCBzZWxlY3Rpb246IGJlc3Quc2VsZWN0aW9uIH07XG59XG5cbmZ1bmN0aW9uIGRyYXdTaGlwKHg6IG51bWJlciwgeTogbnVtYmVyLCB2eDogbnVtYmVyLCB2eTogbnVtYmVyLCBjb2xvcjogc3RyaW5nLCBmaWxsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgaWYgKCFjdHgpIHJldHVybjtcbiAgY29uc3QgcCA9IHdvcmxkVG9DYW52YXMoeyB4LCB5IH0pO1xuICBjb25zdCByID0gMTA7XG4gIGN0eC5zYXZlKCk7XG4gIGN0eC50cmFuc2xhdGUocC54LCBwLnkpO1xuICBjb25zdCBhbmdsZSA9IE1hdGguYXRhbjIodnksIHZ4KTtcbiAgY3R4LnJvdGF0ZShhbmdsZSk7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4Lm1vdmVUbyhyLCAwKTtcbiAgY3R4LmxpbmVUbygtciAqIDAuNywgciAqIDAuNik7XG4gIGN0eC5saW5lVG8oLXIgKiAwLjQsIDApO1xuICBjdHgubGluZVRvKC1yICogMC43LCAtciAqIDAuNik7XG4gIGN0eC5jbG9zZVBhdGgoKTtcbiAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gIGN0eC5zdHJva2VTdHlsZSA9IGNvbG9yO1xuICBpZiAoZmlsbGVkKSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IGAke2NvbG9yfWNjYDtcbiAgICBjdHguZmlsbCgpO1xuICB9XG4gIGN0eC5zdHJva2UoKTtcbiAgY3R4LnJlc3RvcmUoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0dob3N0RG90KHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghY3R4KSByZXR1cm47XG4gIGNvbnN0IHAgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeSB9KTtcbiAgY3R4LmJlZ2luUGF0aCgpO1xuICBjdHguYXJjKHAueCwgcC55LCAzLCAwLCBNYXRoLlBJICogMik7XG4gIGN0eC5maWxsU3R5bGUgPSBcIiNjY2NjY2NhYVwiO1xuICBjdHguZmlsbCgpO1xufVxuXG4vLyBFc3RpbWF0ZSBoZWF0IGFmdGVyIHRyYXZlbGluZyBmcm9tIHBvczEgdG8gcG9zMiBhdCB3YXlwb2ludCBzcGVlZFxuZnVuY3Rpb24gZXN0aW1hdGVIZWF0Q2hhbmdlKFxuICBwb3MxOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gIHdwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBzcGVlZDogbnVtYmVyIH0sXG4gIGN1cnJlbnRIZWF0OiBudW1iZXIsXG4gIGhlYXRQYXJhbXM6IHsgbWFya2VyU3BlZWQ6IG51bWJlcjsga1VwOiBudW1iZXI7IGtEb3duOiBudW1iZXI7IGV4cDogbnVtYmVyOyBtYXg6IG51bWJlciB9XG4pOiBudW1iZXIge1xuICBjb25zdCBkeCA9IHdwLnggLSBwb3MxLng7XG4gIGNvbnN0IGR5ID0gd3AueSAtIHBvczEueTtcbiAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXG4gIGlmIChkaXN0YW5jZSA8IDFlLTYgfHwgd3Auc3BlZWQgPCAxKSB7XG4gICAgcmV0dXJuIGN1cnJlbnRIZWF0O1xuICB9XG5cbiAgY29uc3QgZXN0aW1hdGVkVGltZSA9IGRpc3RhbmNlIC8gd3Auc3BlZWQ7XG5cbiAgLy8gQ2FsY3VsYXRlIGhlYXQgcmF0ZSB1c2luZyB0aGUgc2FtZSBmb3JtdWxhIGFzIGJhY2tlbmRcbiAgY29uc3QgVm4gPSBNYXRoLm1heChoZWF0UGFyYW1zLm1hcmtlclNwZWVkLCAxZS02KTtcbiAgY29uc3QgZGV2ID0gd3Auc3BlZWQgLSBoZWF0UGFyYW1zLm1hcmtlclNwZWVkO1xuICBjb25zdCBwID0gaGVhdFBhcmFtcy5leHA7XG5cbiAgbGV0IGhkb3Q6IG51bWJlcjtcbiAgaWYgKGRldiA+PSAwKSB7XG4gICAgLy8gQWJvdmUgbWFya2VyOiBoZWF0IGFjY3VtdWxhdGVzXG4gICAgaGRvdCA9IGhlYXRQYXJhbXMua1VwICogTWF0aC5wb3coZGV2IC8gVm4sIHApO1xuICB9IGVsc2Uge1xuICAgIC8vIEJlbG93IG1hcmtlcjogaGVhdCBkaXNzaXBhdGVzXG4gICAgaGRvdCA9IC1oZWF0UGFyYW1zLmtEb3duICogTWF0aC5wb3coTWF0aC5hYnMoZGV2KSAvIFZuLCBwKTtcbiAgfVxuXG4gIC8vIEludGVncmF0ZSBoZWF0IGNoYW5nZVxuICBjb25zdCBuZXdIZWF0ID0gY3VycmVudEhlYXQgKyBoZG90ICogZXN0aW1hdGVkVGltZTtcblxuICAvLyBDbGFtcCB0byB2YWxpZCByYW5nZVxuICByZXR1cm4gY2xhbXAobmV3SGVhdCwgMCwgaGVhdFBhcmFtcy5tYXgpO1xufVxuXG4vLyBMaW5lYXIgY29sb3IgaW50ZXJwb2xhdGlvblxuZnVuY3Rpb24gaW50ZXJwb2xhdGVDb2xvcihcbiAgY29sb3IxOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG4gIGNvbG9yMjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuICB0OiBudW1iZXJcbik6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB7XG4gIHJldHVybiBbXG4gICAgTWF0aC5yb3VuZChjb2xvcjFbMF0gKyAoY29sb3IyWzBdIC0gY29sb3IxWzBdKSAqIHQpLFxuICAgIE1hdGgucm91bmQoY29sb3IxWzFdICsgKGNvbG9yMlsxXSAtIGNvbG9yMVsxXSkgKiB0KSxcbiAgICBNYXRoLnJvdW5kKGNvbG9yMVsyXSArIChjb2xvcjJbMl0gLSBjb2xvcjFbMl0pICogdCksXG4gIF07XG59XG5cbmZ1bmN0aW9uIGRyYXdQbGFubmVkUm91dGUoa2luZDogXCJzaGlwXCIgfCBcIm1pc3NpbGVcIik6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWUpIHJldHVybjtcbiAgY29uc3QgaXNTaGlwID0ga2luZCA9PT0gXCJzaGlwXCI7XG4gIGlmIChpc1NoaXAgJiYgIXVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSkgcmV0dXJuO1xuICBpZiAoIWlzU2hpcCAmJiB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCAhPT0gXCJtaXNzaWxlXCIpIHJldHVybjtcblxuICBjb25zdCBnZW9tZXRyeSA9IGlzU2hpcCA/IGNvbXB1dGVSb3V0ZVBvaW50cygpIDogY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIWdlb21ldHJ5IHx8IGdlb21ldHJ5LndheXBvaW50cy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICBjb25zdCB7IHdheXBvaW50cywgd29ybGRQb2ludHMsIGNhbnZhc1BvaW50cyB9ID0gZ2VvbWV0cnk7XG4gIGNvbnN0IGxlZ0NvdW50ID0gY2FudmFzUG9pbnRzLmxlbmd0aCAtIDE7XG4gIGNvbnN0IGRhc2hPZmZzZXRzID0gaXNTaGlwID8gc2hpcExlZ0Rhc2hPZmZzZXRzIDogbWlzc2lsZUxlZ0Rhc2hPZmZzZXRzO1xuICBjb25zdCByb3V0ZVNlbGVjdGlvbiA9IChpc1NoaXAgPyBzZWxlY3Rpb24gOiBtaXNzaWxlU2VsZWN0aW9uKSA/PyBudWxsO1xuICBjb25zdCBkZWZhdWx0TGVnU3BlZWQgPSBpc1NoaXAgPyBkZWZhdWx0U3BlZWQgOiBnZXREZWZhdWx0TWlzc2lsZUxlZ1NwZWVkKCk7XG5cbiAgbGV0IHNoaXBIZWF0ID0gaXNTaGlwID8gc3RhdGVSZWYubWUuaGVhdCA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG4gIGxldCBjdXJyZW50SGVhdCA9IHNoaXBIZWF0ID8gY2xhbXAoc2hpcEhlYXQudmFsdWUsIDAsIHNoaXBIZWF0Lm1heCkgOiAwO1xuICBjb25zdCBtaXNzaWxlSGVhdFBhcmFtcyA9IHN0YXRlUmVmLm1pc3NpbGVDb25maWcuaGVhdFBhcmFtcztcbiAgbGV0IG1pc3NpbGVIZWF0UHJvamVjdGlvbjogUmV0dXJuVHlwZTx0eXBlb2YgcHJvamVjdE1pc3NpbGVIZWF0PiB8IG51bGwgPSBudWxsO1xuICBpZiAoIWlzU2hpcCAmJiBtaXNzaWxlSGVhdFBhcmFtcyAmJiB3YXlwb2ludHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IHN0YXJ0UG9pbnQgPSB7XG4gICAgICB4OiB3b3JsZFBvaW50c1swXS54LFxuICAgICAgeTogd29ybGRQb2ludHNbMF0ueSxcbiAgICAgIHNwZWVkOiBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnLnNwZWVkLFxuICAgIH07XG4gICAgY29uc3Qgcm91dGVGb3JIZWF0ID0gW3N0YXJ0UG9pbnQsIC4uLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogd3Auc3BlZWQgPz8gZGVmYXVsdExlZ1NwZWVkIH0pKV07XG4gICAgbWlzc2lsZUhlYXRQcm9qZWN0aW9uID0gcHJvamVjdE1pc3NpbGVIZWF0KHJvdXRlRm9ySGVhdCwgc3RhdGVSZWYubWlzc2lsZUNvbmZpZy5zcGVlZCwgbWlzc2lsZUhlYXRQYXJhbXMpO1xuICB9XG5cbiAgaWYgKGxlZ0NvdW50ID4gMCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVnQ291bnQ7IGkrKykge1xuICAgICAgY29uc3QgaXNGaXJzdExlZyA9IGlzU2hpcCAmJiBpID09PSAwO1xuICAgICAgY29uc3QgbGVnU2VsZWN0ZWQgPSBCb29sZWFuKFxuICAgICAgICByb3V0ZVNlbGVjdGlvbiAmJlxuICAgICAgICAgICgoaXNTaGlwICYmIHJvdXRlU2VsZWN0aW9uLnR5cGUgPT09IFwibGVnXCIgJiYgcm91dGVTZWxlY3Rpb24uaW5kZXggPT09IGkpIHx8XG4gICAgICAgICAgICAoIWlzU2hpcCAmJiByb3V0ZVNlbGVjdGlvbi50eXBlID09PSBcInJvdXRlXCIgJiYgcm91dGVTZWxlY3Rpb24uaW5kZXggPT09IGkpKSxcbiAgICAgICk7XG4gICAgICBjb25zdCBzcGVlZFZhbHVlID0gdHlwZW9mIHdheXBvaW50c1tpXS5zcGVlZCA9PT0gXCJudW1iZXJcIiAmJiB3YXlwb2ludHNbaV0uc3BlZWQhID4gMCA/IHdheXBvaW50c1tpXS5zcGVlZCEgOiBkZWZhdWx0TGVnU3BlZWQ7XG5cbiAgICAgIGxldCBzdHJva2VTdHlsZSA9IGlzU2hpcCA/IChpc0ZpcnN0TGVnID8gXCIjMzhiZGY4XCIgOiBcIiMzOGJkZjg2NlwiKSA6IFwiI2Y4NzE3MWFhXCI7XG4gICAgICBsZXQgbGluZVdpZHRoID0gaXNTaGlwID8gKGlzRmlyc3RMZWcgPyAzIDogMS41KSA6IDIuNTtcblxuICAgICAgaWYgKGlzU2hpcCAmJiBzaGlwSGVhdCkge1xuICAgICAgICBjb25zdCBzZWdtZW50SGVhdCA9IGVzdGltYXRlSGVhdENoYW5nZShcbiAgICAgICAgICB3b3JsZFBvaW50c1tpXSxcbiAgICAgICAgICB7IHg6IHdvcmxkUG9pbnRzW2kgKyAxXS54LCB5OiB3b3JsZFBvaW50c1tpICsgMV0ueSwgc3BlZWQ6IHNwZWVkVmFsdWUgfSxcbiAgICAgICAgICBjdXJyZW50SGVhdCxcbiAgICAgICAgICBzaGlwSGVhdCxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgaGVhdFJhdGlvID0gY2xhbXAoc2VnbWVudEhlYXQgLyBzaGlwSGVhdC5vdmVyaGVhdEF0LCAwLCAxKTtcbiAgICAgICAgY29uc3QgY29sb3IgPSBpbnRlcnBvbGF0ZUNvbG9yKFsxMDAsIDE1MCwgMjU1XSwgWzI1NSwgNTAsIDUwXSwgaGVhdFJhdGlvKTtcbiAgICAgICAgc3Ryb2tlU3R5bGUgPSBgcmdiYSgke2NvbG9yWzBdfSwgJHtjb2xvclsxXX0sICR7Y29sb3JbMl19LCAke2lzRmlyc3RMZWcgPyAxIDogMC40fSlgO1xuICAgICAgICBsaW5lV2lkdGggPSBsaW5lV2lkdGggKyBoZWF0UmF0aW8gKiA0O1xuICAgICAgICBjdXJyZW50SGVhdCA9IHNlZ21lbnRIZWF0O1xuICAgICAgfSBlbHNlIGlmICghaXNTaGlwICYmIG1pc3NpbGVIZWF0UHJvamVjdGlvbiAmJiBtaXNzaWxlSGVhdFBhcmFtcykge1xuICAgICAgICBjb25zdCBoZWF0MSA9IG1pc3NpbGVIZWF0UHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHNbaV0gPz8gMDtcbiAgICAgICAgY29uc3QgaGVhdDIgPSBtaXNzaWxlSGVhdFByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzW2kgKyAxXSA/PyAwO1xuICAgICAgICBjb25zdCBtYXhIZWF0ID0gTWF0aC5tYXgoaGVhdDEsIGhlYXQyKTtcbiAgICAgICAgY29uc3QgaGVhdFJhdGlvID0gbWF4SGVhdCAvIG1pc3NpbGVIZWF0UGFyYW1zLm1heDtcbiAgICAgICAgY29uc3Qgd2FyblJhdGlvID0gbWlzc2lsZUhlYXRQYXJhbXMud2FybkF0IC8gbWlzc2lsZUhlYXRQYXJhbXMubWF4O1xuICAgICAgICBjb25zdCBvdmVyaGVhdFJhdGlvID0gbWlzc2lsZUhlYXRQYXJhbXMub3ZlcmhlYXRBdCAvIG1pc3NpbGVIZWF0UGFyYW1zLm1heDtcbiAgICAgICAgaWYgKGhlYXRSYXRpbyA8IHdhcm5SYXRpbykge1xuICAgICAgICAgIHN0cm9rZVN0eWxlID0gXCJyZ2JhKDUxLCAxNzAsIDUxLCAwLjcpXCI7XG4gICAgICAgIH0gZWxzZSBpZiAoaGVhdFJhdGlvIDwgb3ZlcmhlYXRSYXRpbykge1xuICAgICAgICAgIHN0cm9rZVN0eWxlID0gXCJyZ2JhKDI1NSwgMTcwLCA1MSwgMC43KVwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0cm9rZVN0eWxlID0gXCJyZ2JhKDI1NSwgNTEsIDUxLCAwLjgpXCI7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY3R4LnNhdmUoKTtcbiAgICAgIGlmIChpc1NoaXApIHtcbiAgICAgICAgY3R4LnNldExpbmVEYXNoKGxlZ1NlbGVjdGVkID8gWzQsIDRdIDogaXNGaXJzdExlZyA/IFs2LCA2XSA6IFs4LCA4XSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdHguc2V0TGluZURhc2gobGVnU2VsZWN0ZWQgPyBbNiwgNF0gOiBbMTAsIDZdKTtcbiAgICAgIH1cbiAgICAgIGN0eC5saW5lV2lkdGggPSBsZWdTZWxlY3RlZCA/IDMuNSA6IGxpbmVXaWR0aDtcbiAgICAgIGN0eC5zdHJva2VTdHlsZSA9IGxlZ1NlbGVjdGVkID8gXCIjZjk3MzE2XCIgOiBzdHJva2VTdHlsZTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5saW5lRGFzaE9mZnNldCA9IGRhc2hPZmZzZXRzLmdldChpKSA/PyAwO1xuICAgICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbaV0ueCwgY2FudmFzUG9pbnRzW2ldLnkpO1xuICAgICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbaSArIDFdLngsIGNhbnZhc1BvaW50c1tpICsgMV0ueSk7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuICAgIH1cbiAgfVxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcHQgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IHdheXBvaW50U2VsZWN0ZWQgPSBCb29sZWFuKHJvdXRlU2VsZWN0aW9uICYmIHJvdXRlU2VsZWN0aW9uLnR5cGUgPT09IFwid2F5cG9pbnRcIiAmJiByb3V0ZVNlbGVjdGlvbi5pbmRleCA9PT0gaSk7XG4gICAgY29uc3Qgd2F5cG9pbnREcmFnZ2luZyA9IGlzU2hpcCA/IGRyYWdnZWRXYXlwb2ludCA9PT0gaSA6IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPT09IGk7XG4gICAgY29uc3QgaGVhdEF0V2F5cG9pbnQgPSAhaXNTaGlwICYmIG1pc3NpbGVIZWF0UHJvamVjdGlvbiA/IG1pc3NpbGVIZWF0UHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHNbaSArIDFdID8/IDAgOiAwO1xuXG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY29uc3QgcmFkaXVzID0gd2F5cG9pbnRTZWxlY3RlZCB8fCB3YXlwb2ludERyYWdnaW5nID8gNyA6IDU7XG4gICAgY3R4LmFyYyhwdC54LCBwdC55LCByYWRpdXMsIDAsIE1hdGguUEkgKiAyKTtcblxuICAgIGlmIChpc1NoaXApIHtcbiAgICAgIGN0eC5maWxsU3R5bGUgPSB3YXlwb2ludFNlbGVjdGVkID8gXCIjZjk3MzE2XCIgOiB3YXlwb2ludERyYWdnaW5nID8gXCIjZmFjYzE1XCIgOiBcIiMzOGJkZjhcIjtcbiAgICAgIGN0eC5nbG9iYWxBbHBoYSA9IHdheXBvaW50U2VsZWN0ZWQgfHwgd2F5cG9pbnREcmFnZ2luZyA/IDAuOTUgOiAwLjg7XG4gICAgICBjdHguZmlsbCgpO1xuICAgICAgY3R4Lmdsb2JhbEFscGhhID0gMTtcbiAgICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMGYxNzJhXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxldCBmaWxsQ29sb3IgPSB3YXlwb2ludFNlbGVjdGVkID8gXCIjZmFjYzE1XCIgOiBcIiNmODcxNzFcIjtcbiAgICAgIGlmIChtaXNzaWxlSGVhdFByb2plY3Rpb24gJiYgbWlzc2lsZUhlYXRQYXJhbXMpIHtcbiAgICAgICAgY29uc3QgaGVhdFJhdGlvID0gaGVhdEF0V2F5cG9pbnQgLyBtaXNzaWxlSGVhdFBhcmFtcy5tYXg7XG4gICAgICAgIGNvbnN0IHdhcm5SYXRpbyA9IG1pc3NpbGVIZWF0UGFyYW1zLndhcm5BdCAvIG1pc3NpbGVIZWF0UGFyYW1zLm1heDtcbiAgICAgICAgY29uc3Qgb3ZlcmhlYXRSYXRpbyA9IG1pc3NpbGVIZWF0UGFyYW1zLm92ZXJoZWF0QXQgLyBtaXNzaWxlSGVhdFBhcmFtcy5tYXg7XG4gICAgICAgIGlmIChoZWF0UmF0aW8gPCB3YXJuUmF0aW8pIHtcbiAgICAgICAgICBmaWxsQ29sb3IgPSB3YXlwb2ludFNlbGVjdGVkID8gXCIjZmFjYzE1XCIgOiBcIiMzM2FhMzNcIjtcbiAgICAgICAgfSBlbHNlIGlmIChoZWF0UmF0aW8gPCBvdmVyaGVhdFJhdGlvKSB7XG4gICAgICAgICAgZmlsbENvbG9yID0gd2F5cG9pbnRTZWxlY3RlZCA/IFwiI2ZhY2MxNVwiIDogXCIjZmZhYTMzXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZmlsbENvbG9yID0gd2F5cG9pbnRTZWxlY3RlZCA/IFwiI2ZhY2MxNVwiIDogXCIjZmYzMzMzXCI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGN0eC5maWxsU3R5bGUgPSBmaWxsQ29sb3I7XG4gICAgICBjdHguZ2xvYmFsQWxwaGEgPSB3YXlwb2ludFNlbGVjdGVkID8gMC45NSA6IDAuOTtcbiAgICAgIGN0eC5maWxsKCk7XG4gICAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICAgIGN0eC5zdHJva2VTdHlsZSA9IHdheXBvaW50U2VsZWN0ZWQgPyBcIiM4NTRkMGVcIiA6IFwiIzdmMWQxZFwiO1xuICAgIH1cblxuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRyYXdNaXNzaWxlcygpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIXN0YXRlUmVmLm1pc3NpbGVzIHx8IHN0YXRlUmVmLm1pc3NpbGVzLmxlbmd0aCA9PT0gMCB8fCAhY3YpIHJldHVybjtcbiAgY29uc3Qgc2NhbGVYID0gY3Yud2lkdGggLyB3b3JsZC53O1xuICBjb25zdCBzY2FsZVkgPSBjdi5oZWlnaHQgLyB3b3JsZC5oO1xuICBjb25zdCByYWRpdXNTY2FsZSA9IChzY2FsZVggKyBzY2FsZVkpIC8gMjtcbiAgZm9yIChjb25zdCBtaXNzIG9mIHN0YXRlUmVmLm1pc3NpbGVzKSB7XG4gICAgY29uc3QgcCA9IHdvcmxkVG9DYW52YXMoeyB4OiBtaXNzLngsIHk6IG1pc3MueSB9KTtcbiAgICBjb25zdCBzZWxmT3duZWQgPSBCb29sZWFuKG1pc3Muc2VsZik7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmFyYyhwLngsIHAueSwgc2VsZk93bmVkID8gNiA6IDUsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gc2VsZk93bmVkID8gXCIjZjg3MTcxXCIgOiBcIiNmY2E1YTVcIjtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSBzZWxmT3duZWQgPyAwLjk1IDogMC44O1xuICAgIGN0eC5maWxsKCk7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMTtcbiAgICBjdHgubGluZVdpZHRoID0gMS41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiIzExMTgyN1wiO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgaWYgKHNlbGZPd25lZCAmJiBtaXNzLmFncm9fcmFkaXVzID4gMCkge1xuICAgICAgY3R4LnNhdmUoKTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGNvbnN0IHJDYW52YXMgPSBtaXNzLmFncm9fcmFkaXVzICogcmFkaXVzU2NhbGU7XG4gICAgICBjdHguc2V0TGluZURhc2goWzE0LCAxMF0pO1xuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJyZ2JhKDI0OCwxMTMsMTEzLDAuMzUpXCI7XG4gICAgICBjdHgubGluZVdpZHRoID0gMS4yO1xuICAgICAgY3R4LmFyYyhwLngsIHAueSwgckNhbnZhcywgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICB9XG5cbiAgICAvLyBEcmF3IG1pc3NpbGUgaGVhdCBiYXIgaWYgaGVhdCBkYXRhIGlzIGF2YWlsYWJsZVxuICAgIGlmIChtaXNzLmhlYXQpIHtcbiAgICAgIGRyYXdNaXNzaWxlSGVhdEJhcihtaXNzLCBwKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZHJhd01pc3NpbGVIZWF0QmFyKG1pc3NpbGU6IE1pc3NpbGVTbmFwc2hvdCwgY2FudmFzUG9zOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIW1pc3NpbGUuaGVhdCkgcmV0dXJuO1xuXG4gIGNvbnN0IGhlYXQgPSBtaXNzaWxlLmhlYXQ7XG4gIGNvbnN0IGJhcldpZHRoID0gNDA7XG4gIGNvbnN0IGJhckhlaWdodCA9IDQ7XG4gIGNvbnN0IGJhclggPSBjYW52YXNQb3MueCAtIGJhcldpZHRoIC8gMjtcbiAgY29uc3QgYmFyWSA9IGNhbnZhc1Bvcy55ICsgMTU7IC8vIEJlbG93IG1pc3NpbGVcblxuICAvLyBCYWNrZ3JvdW5kXG4gIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoMCwgMCwgMCwgMC41KVwiO1xuICBjdHguZmlsbFJlY3QoYmFyWCAtIDEsIGJhclkgLSAxLCBiYXJXaWR0aCArIDIsIGJhckhlaWdodCArIDIpO1xuXG4gIC8vIEhlYXQgZmlsbFxuICBjb25zdCBoZWF0UmF0aW8gPSBoZWF0LnZhbHVlIC8gaGVhdC5tYXg7XG4gIGNvbnN0IGZpbGxXaWR0aCA9IGJhcldpZHRoICogaGVhdFJhdGlvO1xuXG4gIC8vIENvbG9yIGJhc2VkIG9uIGhlYXQgbGV2ZWxcbiAgbGV0IGhlYXRDb2xvcjogc3RyaW5nO1xuICBjb25zdCB3YXJuUmF0aW8gPSBoZWF0Lndhcm5BdCAvIGhlYXQubWF4O1xuICBjb25zdCBvdmVyaGVhdFJhdGlvID0gaGVhdC5vdmVyaGVhdEF0IC8gaGVhdC5tYXg7XG5cbiAgaWYgKGhlYXRSYXRpbyA8IHdhcm5SYXRpbykge1xuICAgIGhlYXRDb2xvciA9IFwiIzMzYWEzM1wiOyAvLyBHcmVlbiAtIHNhZmVcbiAgfSBlbHNlIGlmIChoZWF0UmF0aW8gPCBvdmVyaGVhdFJhdGlvKSB7XG4gICAgaGVhdENvbG9yID0gXCIjZmZhYTMzXCI7IC8vIE9yYW5nZSAtIHdhcm5pbmdcbiAgfSBlbHNlIHtcbiAgICBoZWF0Q29sb3IgPSBcIiNmZjMzMzNcIjsgLy8gUmVkIC0gY3JpdGljYWxcbiAgfVxuXG4gIGN0eC5maWxsU3R5bGUgPSBoZWF0Q29sb3I7XG4gIGN0eC5maWxsUmVjdChiYXJYLCBiYXJZLCBmaWxsV2lkdGgsIGJhckhlaWdodCk7XG5cbn1cblxuZnVuY3Rpb24gZHJhd0dyaWQoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFjdikgcmV0dXJuO1xuICBjdHguc2F2ZSgpO1xuICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMyMzRcIjtcbiAgY3R4LmxpbmVXaWR0aCA9IDE7XG5cbiAgY29uc3Qgem9vbSA9IHVpU3RhdGVSZWYuem9vbTtcbiAgbGV0IHN0ZXAgPSAxMDAwO1xuICBpZiAoem9vbSA8IDAuNykge1xuICAgIHN0ZXAgPSAyMDAwO1xuICB9IGVsc2UgaWYgKHpvb20gPiAxLjUpIHtcbiAgICBzdGVwID0gNTAwO1xuICB9IGVsc2UgaWYgKHpvb20gPiAyLjUpIHtcbiAgICBzdGVwID0gMjUwO1xuICB9XG5cbiAgY29uc3QgY2FtZXJhID0gZ2V0Q2FtZXJhUG9zaXRpb24oKTtcblxuICAvLyBDYWxjdWxhdGUgdmlld3BvcnQgdXNpbmcgdW5pZm9ybSBzY2FsZSAoc2FtZSBhcyBjb29yZGluYXRlIHRyYW5zZm9ybXMpXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjdi5oZWlnaHQgLyBzY2FsZTtcblxuICBjb25zdCBtaW5YID0gTWF0aC5tYXgoMCwgY2FtZXJhLnggLSB2aWV3cG9ydFdpZHRoIC8gMik7XG4gIGNvbnN0IG1heFggPSBNYXRoLm1pbih3b3JsZC53LCBjYW1lcmEueCArIHZpZXdwb3J0V2lkdGggLyAyKTtcbiAgY29uc3QgbWluWSA9IE1hdGgubWF4KDAsIGNhbWVyYS55IC0gdmlld3BvcnRIZWlnaHQgLyAyKTtcbiAgY29uc3QgbWF4WSA9IE1hdGgubWluKHdvcmxkLmgsIGNhbWVyYS55ICsgdmlld3BvcnRIZWlnaHQgLyAyKTtcblxuICBjb25zdCBzdGFydFggPSBNYXRoLmZsb29yKG1pblggLyBzdGVwKSAqIHN0ZXA7XG4gIGNvbnN0IGVuZFggPSBNYXRoLmNlaWwobWF4WCAvIHN0ZXApICogc3RlcDtcbiAgY29uc3Qgc3RhcnRZID0gTWF0aC5mbG9vcihtaW5ZIC8gc3RlcCkgKiBzdGVwO1xuICBjb25zdCBlbmRZID0gTWF0aC5jZWlsKG1heFkgLyBzdGVwKSAqIHN0ZXA7XG5cbiAgZm9yIChsZXQgeCA9IHN0YXJ0WDsgeCA8PSBlbmRYOyB4ICs9IHN0ZXApIHtcbiAgICBjb25zdCBhID0gd29ybGRUb0NhbnZhcyh7IHgsIHk6IE1hdGgubWF4KDAsIG1pblkpIH0pO1xuICAgIGNvbnN0IGIgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeTogTWF0aC5taW4od29ybGQuaCwgbWF4WSkgfSk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oYS54LCBhLnkpO1xuICAgIGN0eC5saW5lVG8oYi54LCBiLnkpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgfVxuICBmb3IgKGxldCB5ID0gc3RhcnRZOyB5IDw9IGVuZFk7IHkgKz0gc3RlcCkge1xuICAgIGNvbnN0IGEgPSB3b3JsZFRvQ2FudmFzKHsgeDogTWF0aC5tYXgoMCwgbWluWCksIHkgfSk7XG4gICAgY29uc3QgYiA9IHdvcmxkVG9DYW52YXMoeyB4OiBNYXRoLm1pbih3b3JsZC53LCBtYXhYKSwgeSB9KTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhhLngsIGEueSk7XG4gICAgY3R4LmxpbmVUbyhiLngsIGIueSk7XG4gICAgY3R4LnN0cm9rZSgpO1xuICB9XG4gIGN0eC5yZXN0b3JlKCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpOiB2b2lkIHtcbiAgaWYgKCFtaXNzaWxlTGF1bmNoQnRuIHx8ICFtaXNzaWxlTGF1bmNoVGV4dCB8fCAhbWlzc2lsZUxhdW5jaEluZm8pIHJldHVybjtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgY291bnQgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgY29uc3QgcmVtYWluaW5nID0gZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk7XG4gIGNvbnN0IGNvb2xpbmdEb3duID0gcmVtYWluaW5nID4gMC4wNTtcbiAgY29uc3Qgc2hvdWxkRGlzYWJsZSA9ICFyb3V0ZSB8fCBjb3VudCA9PT0gMCB8fCBjb29saW5nRG93bjtcbiAgbWlzc2lsZUxhdW5jaEJ0bi5kaXNhYmxlZCA9IHNob3VsZERpc2FibGU7XG5cbiAgY29uc3QgbGF1bmNoVGV4dEhUTUwgPSAnPHNwYW4gY2xhc3M9XCJidG4tdGV4dC1mdWxsXCI+TGF1bmNoPC9zcGFuPjxzcGFuIGNsYXNzPVwiYnRuLXRleHQtc2hvcnRcIj5GaXJlPC9zcGFuPic7XG4gIGxldCBsYXVuY2hJbmZvSFRNTCA9IFwiXCI7XG5cbiAgaWYgKCFyb3V0ZSkge1xuICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgfSBlbHNlIGlmIChjb29saW5nRG93bikge1xuICAgIGxhdW5jaEluZm9IVE1MID0gYCR7cmVtYWluaW5nLnRvRml4ZWQoMSl9c2A7XG4gIH0gZWxzZSBpZiAocm91dGUubmFtZSkge1xuICAgIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gICAgY29uc3Qgcm91dGVJbmRleCA9IHJvdXRlcy5maW5kSW5kZXgoKHIpID0+IHIuaWQgPT09IHJvdXRlLmlkKSArIDE7XG4gICAgbGF1bmNoSW5mb0hUTUwgPSBgPHNwYW4gY2xhc3M9XCJidG4tdGV4dC1mdWxsXCI+JHtyb3V0ZS5uYW1lfTwvc3Bhbj48c3BhbiBjbGFzcz1cImJ0bi10ZXh0LXNob3J0XCI+JHtyb3V0ZUluZGV4fTwvc3Bhbj5gO1xuICB9IGVsc2Uge1xuICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgfVxuXG4gIGlmIChsYXN0TWlzc2lsZUxhdW5jaFRleHRIVE1MICE9PSBsYXVuY2hUZXh0SFRNTCkge1xuICAgIG1pc3NpbGVMYXVuY2hUZXh0LmlubmVySFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICAgIGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgPSBsYXVuY2hUZXh0SFRNTDtcbiAgfVxuXG4gIGlmIChsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MICE9PSBsYXVuY2hJbmZvSFRNTCkge1xuICAgIG1pc3NpbGVMYXVuY2hJbmZvLmlubmVySFRNTCA9IGxhdW5jaEluZm9IVE1MO1xuICAgIGxhc3RNaXNzaWxlTGF1bmNoSW5mb0hUTUwgPSBsYXVuY2hJbmZvSFRNTDtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTogbnVtYmVyIHtcbiAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlUmVmKTtcbiAgcmV0dXJuIHJlbWFpbmluZyA+IDAgPyByZW1haW5pbmcgOiAwO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk6IHZvaWQge1xuICBjb25zdCBtZXRhID0gc3RhdGVSZWYud29ybGRNZXRhID8/IHt9O1xuICBjb25zdCBoYXNXaWR0aCA9IHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudyk7XG4gIGNvbnN0IGhhc0hlaWdodCA9IHR5cGVvZiBtZXRhLmggPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuaCk7XG5cbiAgaWYgKGhhc1dpZHRoKSB7XG4gICAgd29ybGQudyA9IG1ldGEudyE7XG4gIH1cbiAgaWYgKGhhc0hlaWdodCkge1xuICAgIHdvcmxkLmggPSBtZXRhLmghO1xuICB9XG4gIGlmIChIUHNwYW4pIHtcbiAgICBpZiAoc3RhdGVSZWYubWUgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXRlUmVmLm1lLmhwKSkge1xuICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlUmVmLm1lLmhwKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBIUHNwYW4udGV4dENvbnRlbnQgPSBcIlx1MjAxM1wiO1xuICAgIH1cbiAgfVxuICBpZiAoa2lsbHNTcGFuKSB7XG4gICAgaWYgKHN0YXRlUmVmLm1lICYmIE51bWJlci5pc0Zpbml0ZShzdGF0ZVJlZi5tZS5raWxscykpIHtcbiAgICAgIGtpbGxzU3Bhbi50ZXh0Q29udGVudCA9IE51bWJlcihzdGF0ZVJlZi5tZS5raWxscykudG9TdHJpbmcoKTtcbiAgICB9IGVsc2Uge1xuICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gXCIwXCI7XG4gICAgfVxuICB9XG5cbiAgLy8gVXBkYXRlIGhlYXQgYmFyXG4gIHVwZGF0ZUhlYXRCYXIoKTtcbiAgLy8gVXBkYXRlIHBsYW5uZWQgaGVhdCBiYXJcbiAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgLy8gVXBkYXRlIHNwZWVkIG1hcmtlciBwb3NpdGlvblxuICB1cGRhdGVTcGVlZE1hcmtlcigpO1xuICAvLyBVcGRhdGUgc3RhbGwgb3ZlcmxheVxuICB1cGRhdGVTdGFsbE92ZXJsYXkoKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlSGVhdEJhcigpOiB2b2lkIHtcbiAgY29uc3QgaGVhdCA9IHN0YXRlUmVmLm1lPy5oZWF0O1xuICBpZiAoIWhlYXQgfHwgIWhlYXRCYXJGaWxsIHx8ICFoZWF0VmFsdWVUZXh0KSB7XG4gICAgaGVhdFdhcm5BY3RpdmUgPSBmYWxzZTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBwZXJjZW50ID0gKGhlYXQudmFsdWUgLyBoZWF0Lm1heCkgKiAxMDA7XG4gIGhlYXRCYXJGaWxsLnN0eWxlLndpZHRoID0gYCR7cGVyY2VudH0lYDtcblxuICAvLyBVcGRhdGUgdGV4dFxuICBoZWF0VmFsdWVUZXh0LnRleHRDb250ZW50ID0gYEhlYXQgJHtNYXRoLnJvdW5kKGhlYXQudmFsdWUpfWA7XG5cbiAgLy8gVXBkYXRlIGNvbG9yIGNsYXNzZXNcbiAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LnJlbW92ZShcIndhcm5cIiwgXCJvdmVyaGVhdFwiKTtcbiAgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC5vdmVyaGVhdEF0KSB7XG4gICAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LmFkZChcIm92ZXJoZWF0XCIpO1xuICB9IGVsc2UgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC53YXJuQXQpIHtcbiAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QuYWRkKFwid2FyblwiKTtcbiAgfVxuXG4gIGNvbnN0IG5vd1dhcm4gPSBoZWF0LnZhbHVlID49IGhlYXQud2FybkF0O1xuICBpZiAobm93V2FybiAmJiAhaGVhdFdhcm5BY3RpdmUpIHtcbiAgICBoZWF0V2FybkFjdGl2ZSA9IHRydWU7XG4gICAgYnVzUmVmLmVtaXQoXCJoZWF0Ondhcm5FbnRlcmVkXCIsIHsgdmFsdWU6IGhlYXQudmFsdWUsIHdhcm5BdDogaGVhdC53YXJuQXQgfSk7XG4gIH0gZWxzZSBpZiAoIW5vd1dhcm4gJiYgaGVhdFdhcm5BY3RpdmUpIHtcbiAgICBjb25zdCBjb29sVGhyZXNob2xkID0gTWF0aC5tYXgoMCwgaGVhdC53YXJuQXQgLSA1KTtcbiAgICBpZiAoaGVhdC52YWx1ZSA8PSBjb29sVGhyZXNob2xkKSB7XG4gICAgICBoZWF0V2FybkFjdGl2ZSA9IGZhbHNlO1xuICAgICAgYnVzUmVmLmVtaXQoXCJoZWF0OmNvb2xlZEJlbG93V2FyblwiLCB7IHZhbHVlOiBoZWF0LnZhbHVlLCB3YXJuQXQ6IGhlYXQud2FybkF0IH0pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVQbGFubmVkSGVhdEJhcigpOiB2b2lkIHtcbiAgY29uc3Qgc2hpcCA9IHN0YXRlUmVmLm1lO1xuICBjb25zdCBwbGFubmVkRWwgPSBoZWF0QmFyUGxhbm5lZDtcbiAgaWYgKCFzaGlwIHx8ICFzaGlwLmhlYXQgfHwgIXBsYW5uZWRFbCkge1xuICAgIGR1YWxNZXRlckFsZXJ0ID0gZmFsc2U7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgcGxhbm5lZCA9IHByb2plY3RQbGFubmVkSGVhdChzaGlwKTtcbiAgY29uc3QgYWN0dWFsID0gc2hpcC5oZWF0LnZhbHVlO1xuICBjb25zdCBwZXJjZW50ID0gKHBsYW5uZWQgLyBzaGlwLmhlYXQubWF4KSAqIDEwMDtcbiAgcGxhbm5lZEVsLnN0eWxlLndpZHRoID0gYCR7TWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBwZXJjZW50KSl9JWA7XG5cbiAgY29uc3QgZGlmZiA9IHBsYW5uZWQgLSBhY3R1YWw7XG4gIGNvbnN0IHRocmVzaG9sZCA9IE1hdGgubWF4KDgsIHNoaXAuaGVhdC53YXJuQXQgKiAwLjEpO1xuICBpZiAoZGlmZiA+PSB0aHJlc2hvbGQgJiYgIWR1YWxNZXRlckFsZXJ0KSB7XG4gICAgZHVhbE1ldGVyQWxlcnQgPSB0cnVlO1xuICAgIGJ1c1JlZi5lbWl0KFwiaGVhdDpkdWFsTWV0ZXJEaXZlcmdlZFwiLCB7IHBsYW5uZWQsIGFjdHVhbCB9KTtcbiAgfSBlbHNlIGlmIChkaWZmIDwgdGhyZXNob2xkICogMC42ICYmIGR1YWxNZXRlckFsZXJ0KSB7XG4gICAgZHVhbE1ldGVyQWxlcnQgPSBmYWxzZTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwcm9qZWN0UGxhbm5lZEhlYXQoc2hpcDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2F5cG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBzcGVlZD86IG51bWJlciB9W107IGhlYXQ/OiB7IHZhbHVlOiBudW1iZXI7IG1heDogbnVtYmVyOyBtYXJrZXJTcGVlZDogbnVtYmVyOyBrVXA6IG51bWJlcjsga0Rvd246IG51bWJlcjsgZXhwOiBudW1iZXIgfSB9KTogbnVtYmVyIHtcbiAgY29uc3QgaGVhdCA9IHNoaXAuaGVhdCE7XG4gIGxldCBoID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaGVhdC5tYXgsIGhlYXQudmFsdWUpKTtcbiAgbGV0IG1heEggPSBoO1xuICAvLyBTaW1wbGUgY29uc3RhbnQtc3BlZWQgcGVyLWxlZyBwcm9qZWN0aW9uIChzZXJ2ZXIgY3VycmVudGx5IHNldHMgdmVsIHRvIGxlZyBzcGVlZCBpbnN0YW50bHkpXG4gIGxldCBwb3NYID0gc2hpcC54O1xuICBsZXQgcG9zWSA9IHNoaXAueTtcbiAgZm9yIChjb25zdCB3cCBvZiBzaGlwLndheXBvaW50cykge1xuICAgIGNvbnN0IGR4ID0gd3AueCAtIHBvc1g7XG4gICAgY29uc3QgZHkgPSB3cC55IC0gcG9zWTtcbiAgICBjb25zdCBkaXN0ID0gTWF0aC5oeXBvdChkeCwgZHkpO1xuICAgIGNvbnN0IHYgPSBNYXRoLm1heCgxZS02LCBOdW1iZXIuaXNGaW5pdGUod3Auc3BlZWQpID8gKHdwLnNwZWVkIGFzIG51bWJlcikgOiAwKTtcbiAgICBpZiAodiA8PSAxZS02IHx8IGRpc3QgPD0gMWUtNikge1xuICAgICAgcG9zWCA9IHdwLng7IHBvc1kgPSB3cC55O1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGR1cmF0aW9uID0gZGlzdCAvIHY7XG4gICAgLy8gSGVhdCBkaWZmZXJlbnRpYWwgYXQgY29uc3RhbnQgc3BlZWRcbiAgICBjb25zdCBkZXYgPSB2IC0gaGVhdC5tYXJrZXJTcGVlZDtcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KGhlYXQubWFya2VyU3BlZWQsIDFlLTYpO1xuICAgIGNvbnN0IHAgPSBoZWF0LmV4cDtcbiAgICBjb25zdCByYXRlID0gZGV2ID49IDAgPyBoZWF0LmtVcCAqIE1hdGgucG93KGRldiAvIFZuLCBwKSA6IC1oZWF0LmtEb3duICogTWF0aC5wb3coTWF0aC5hYnMoZGV2KSAvIFZuLCBwKTtcbiAgICBoID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaGVhdC5tYXgsIGggKyByYXRlICogZHVyYXRpb24pKTtcbiAgICBpZiAoaCA+IG1heEgpIG1heEggPSBoO1xuICAgIHBvc1ggPSB3cC54OyBwb3NZID0gd3AueTtcbiAgfVxuICByZXR1cm4gbWF4SDtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU3BlZWRNYXJrZXIoKTogdm9pZCB7XG4gIGNvbnN0IHNoaXBIZWF0ID0gc3RhdGVSZWYubWU/LmhlYXQ7XG4gIGlmIChzcGVlZE1hcmtlciAmJiBzaGlwU3BlZWRTbGlkZXIgJiYgc2hpcEhlYXQgJiYgc2hpcEhlYXQubWFya2VyU3BlZWQgPiAwKSB7XG4gICAgY29uc3QgbWluID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIubWluKTtcbiAgICBjb25zdCBtYXggPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci5tYXgpO1xuICAgIGNvbnN0IG1hcmtlclNwZWVkID0gc2hpcEhlYXQubWFya2VyU3BlZWQ7XG4gICAgY29uc3QgcGVyY2VudCA9ICgobWFya2VyU3BlZWQgLSBtaW4pIC8gKG1heCAtIG1pbikpICogMTAwO1xuICAgIGNvbnN0IGNsYW1wZWQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIHBlcmNlbnQpKTtcbiAgICBzcGVlZE1hcmtlci5zdHlsZS5sZWZ0ID0gYCR7Y2xhbXBlZH0lYDtcbiAgICBzcGVlZE1hcmtlci50aXRsZSA9IGBIZWF0IG5ldXRyYWw6ICR7TWF0aC5yb3VuZChtYXJrZXJTcGVlZCl9IHVuaXRzL3NgO1xuICAgIHNwZWVkTWFya2VyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gIH0gZWxzZSBpZiAoc3BlZWRNYXJrZXIpIHtcbiAgICBzcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIH1cblxuICBpZiAobWlzc2lsZVNwZWVkTWFya2VyICYmIG1pc3NpbGVTcGVlZFNsaWRlcikge1xuICAgIGNvbnN0IGhlYXRQYXJhbXMgPSBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnLmhlYXRQYXJhbXM7XG4gICAgY29uc3QgbWFya2VyU3BlZWQgPVxuICAgICAgKGhlYXRQYXJhbXMgJiYgTnVtYmVyLmlzRmluaXRlKGhlYXRQYXJhbXMubWFya2VyU3BlZWQpID8gaGVhdFBhcmFtcy5tYXJrZXJTcGVlZCA6IHVuZGVmaW5lZCkgPz9cbiAgICAgIChzaGlwSGVhdCAmJiBzaGlwSGVhdC5tYXJrZXJTcGVlZCA+IDAgPyBzaGlwSGVhdC5tYXJrZXJTcGVlZCA6IHVuZGVmaW5lZCk7XG5cbiAgICBpZiAobWFya2VyU3BlZWQgIT09IHVuZGVmaW5lZCAmJiBtYXJrZXJTcGVlZCA+IDApIHtcbiAgICAgIGNvbnN0IG1pbiA9IHBhcnNlRmxvYXQobWlzc2lsZVNwZWVkU2xpZGVyLm1pbik7XG4gICAgICBjb25zdCBtYXggPSBwYXJzZUZsb2F0KG1pc3NpbGVTcGVlZFNsaWRlci5tYXgpO1xuICAgICAgY29uc3QgcGVyY2VudCA9ICgobWFya2VyU3BlZWQgLSBtaW4pIC8gKG1heCAtIG1pbikpICogMTAwO1xuICAgICAgY29uc3QgY2xhbXBlZCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGVyY2VudCkpO1xuICAgICAgbWlzc2lsZVNwZWVkTWFya2VyLnN0eWxlLmxlZnQgPSBgJHtjbGFtcGVkfSVgO1xuICAgICAgbWlzc2lsZVNwZWVkTWFya2VyLnRpdGxlID0gYEhlYXQgbmV1dHJhbDogJHtNYXRoLnJvdW5kKG1hcmtlclNwZWVkKX0gdW5pdHMvc2A7XG4gICAgICBtaXNzaWxlU3BlZWRNYXJrZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgbWlzc2lsZVNwZWVkTWFya2VyLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlU3RhbGxPdmVybGF5KCk6IHZvaWQge1xuICBjb25zdCBoZWF0ID0gc3RhdGVSZWYubWU/LmhlYXQ7XG4gIGlmICghaGVhdCB8fCAhc3RhbGxPdmVybGF5KSB7XG4gICAgc3RhbGxBY3RpdmUgPSBmYWxzZTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBub3cgPSB0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiXG4gICAgPyBwZXJmb3JtYW5jZS5ub3coKVxuICAgIDogRGF0ZS5ub3coKTtcblxuICBjb25zdCBpc1N0YWxsZWQgPSBub3cgPCBoZWF0LnN0YWxsVW50aWxNcztcblxuICBpZiAoaXNTdGFsbGVkKSB7XG4gICAgc3RhbGxPdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgIGlmICghc3RhbGxBY3RpdmUpIHtcbiAgICAgIHN0YWxsQWN0aXZlID0gdHJ1ZTtcbiAgICAgIGJ1c1JlZi5lbWl0KFwiaGVhdDpzdGFsbFRyaWdnZXJlZFwiLCB7IHN0YWxsVW50aWw6IGhlYXQuc3RhbGxVbnRpbE1zIH0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBzdGFsbE92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgaWYgKHN0YWxsQWN0aXZlKSB7XG4gICAgICBzdGFsbEFjdGl2ZSA9IGZhbHNlO1xuICAgICAgYnVzUmVmLmVtaXQoXCJoZWF0OnN0YWxsUmVjb3ZlcmVkXCIsIHsgdmFsdWU6IGhlYXQudmFsdWUgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIWN2KSByZXR1cm47XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKHRpbWVzdGFtcCkpIHtcbiAgICB0aW1lc3RhbXAgPSBsYXN0TG9vcFRzID8/IDA7XG4gIH1cbiAgbGV0IGR0U2Vjb25kcyA9IDA7XG4gIGlmIChsYXN0TG9vcFRzICE9PSBudWxsKSB7XG4gICAgZHRTZWNvbmRzID0gKHRpbWVzdGFtcCAtIGxhc3RMb29wVHMpIC8gMTAwMDtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShkdFNlY29uZHMpIHx8IGR0U2Vjb25kcyA8IDApIHtcbiAgICAgIGR0U2Vjb25kcyA9IDA7XG4gICAgfVxuICB9XG4gIGxhc3RMb29wVHMgPSB0aW1lc3RhbXA7XG4gIHVwZGF0ZVJvdXRlQW5pbWF0aW9ucyhkdFNlY29uZHMpO1xuXG4gIGN0eC5jbGVhclJlY3QoMCwgMCwgY3Yud2lkdGgsIGN2LmhlaWdodCk7XG4gIGRyYXdHcmlkKCk7XG4gIGRyYXdQbGFubmVkUm91dGUoXCJzaGlwXCIpO1xuICBkcmF3UGxhbm5lZFJvdXRlKFwibWlzc2lsZVwiKTtcbiAgZHJhd01pc3NpbGVzKCk7XG5cbiAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG5cbiAgZm9yIChjb25zdCBnIG9mIHN0YXRlUmVmLmdob3N0cykge1xuICAgIGRyYXdTaGlwKGcueCwgZy55LCBnLnZ4LCBnLnZ5LCBcIiM5Y2EzYWZcIiwgZmFsc2UpO1xuICAgIGRyYXdHaG9zdERvdChnLngsIGcueSk7XG4gIH1cbiAgaWYgKHN0YXRlUmVmLm1lKSB7XG4gICAgZHJhd1NoaXAoc3RhdGVSZWYubWUueCwgc3RhdGVSZWYubWUueSwgc3RhdGVSZWYubWUudngsIHN0YXRlUmVmLm1lLnZ5LCBcIiMyMmQzZWVcIiwgdHJ1ZSk7XG4gIH1cbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGxvb3ApO1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmludGVyZmFjZSBIaWdobGlnaHRDb250ZW50T3B0aW9ucyB7XG4gIHRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgc3RlcENvdW50OiBudW1iZXI7XG4gIHNob3dOZXh0OiBib29sZWFuO1xuICBuZXh0TGFiZWw/OiBzdHJpbmc7XG4gIG9uTmV4dD86ICgpID0+IHZvaWQ7XG4gIHNob3dTa2lwOiBib29sZWFuO1xuICBza2lwTGFiZWw/OiBzdHJpbmc7XG4gIG9uU2tpcD86ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGlnaGxpZ2h0ZXIge1xuICBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZDtcbiAgaGlkZSgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJ0dXRvcmlhbC1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVIaWdobGlnaHRlcigpOiBIaWdobGlnaHRlciB7XG4gIGVuc3VyZVN0eWxlcygpO1xuXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheVwiO1xuICBvdmVybGF5LnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBcInBvbGl0ZVwiKTtcblxuICBjb25zdCBzY3JpbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNjcmltLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fc2NyaW1cIjtcblxuICBjb25zdCBoaWdobGlnaHRCb3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoaWdobGlnaHRCb3guY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19oaWdobGlnaHRcIjtcblxuICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdG9vbHRpcC5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXBcIjtcblxuICBjb25zdCBwcm9ncmVzcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHByb2dyZXNzLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3NcIjtcblxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJoM1wiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X190aXRsZVwiO1xuXG4gIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwicFwiKTtcbiAgYm9keS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2JvZHlcIjtcblxuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnNcIjtcblxuICBjb25zdCBza2lwQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgc2tpcEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgc2tpcEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0XCI7XG4gIHNraXBCdG4udGV4dENvbnRlbnQgPSBcIlNraXBcIjtcblxuICBjb25zdCBuZXh0QnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgbmV4dEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgbmV4dEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnlcIjtcbiAgbmV4dEJ0bi50ZXh0Q29udGVudCA9IFwiTmV4dFwiO1xuXG4gIGFjdGlvbnMuYXBwZW5kKHNraXBCdG4sIG5leHRCdG4pO1xuICB0b29sdGlwLmFwcGVuZChwcm9ncmVzcywgdGl0bGUsIGJvZHksIGFjdGlvbnMpO1xuICBvdmVybGF5LmFwcGVuZChzY3JpbSwgaGlnaGxpZ2h0Qm94LCB0b29sdGlwKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICBsZXQgY3VycmVudFRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHJlc2l6ZU9ic2VydmVyOiBSZXNpemVPYnNlcnZlciB8IG51bGwgPSBudWxsO1xuICBsZXQgZnJhbWVIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgb25OZXh0OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IG9uU2tpcDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gc2NoZWR1bGVVcGRhdGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgaWYgKGZyYW1lSGFuZGxlICE9PSBudWxsKSByZXR1cm47XG4gICAgZnJhbWVIYW5kbGUgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICAgIHVwZGF0ZVBvc2l0aW9uKCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVQb3NpdGlvbigpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUpIHJldHVybjtcblxuICAgIGlmIChjdXJyZW50VGFyZ2V0KSB7XG4gICAgICBjb25zdCByZWN0ID0gY3VycmVudFRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IHBhZGRpbmcgPSAxMjtcbiAgICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMCwgcmVjdC53aWR0aCArIHBhZGRpbmcgKiAyKTtcbiAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDAsIHJlY3QuaGVpZ2h0ICsgcGFkZGluZyAqIDIpO1xuICAgICAgY29uc3QgbGVmdCA9IHJlY3QubGVmdCAtIHBhZGRpbmc7XG4gICAgICBjb25zdCB0b3AgPSByZWN0LnRvcCAtIHBhZGRpbmc7XG5cbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQobGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b3ApfXB4KWA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUud2lkdGggPSBgJHtNYXRoLnJvdW5kKHdpZHRoKX1weGA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gYCR7TWF0aC5yb3VuZChoZWlnaHQpfXB4YDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIHRvb2x0aXAuc3R5bGUubWF4V2lkdGggPSBgbWluKDM0MHB4LCAke01hdGgubWF4KDI2MCwgd2luZG93LmlubmVyV2lkdGggLSAzMil9cHgpYDtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBsZXQgdG9vbHRpcFRvcCA9IHJlY3QuYm90dG9tICsgMTg7XG4gICAgICBpZiAodG9vbHRpcFRvcCArIHRvb2x0aXBIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSAyMCkge1xuICAgICAgICB0b29sdGlwVG9wID0gTWF0aC5tYXgoMjAsIHJlY3QudG9wIC0gdG9vbHRpcEhlaWdodCAtIDE4KTtcbiAgICAgIH1cbiAgICAgIGxldCB0b29sdGlwTGVmdCA9IHJlY3QubGVmdCArIHJlY3Qud2lkdGggLyAyIC0gdG9vbHRpcFdpZHRoIC8gMjtcbiAgICAgIHRvb2x0aXBMZWZ0ID0gY2xhbXAodG9vbHRpcExlZnQsIDIwLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCAtIDIwKTtcbiAgICAgIHRvb2x0aXAuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQodG9vbHRpcExlZnQpfXB4LCAke01hdGgucm91bmQodG9vbHRpcFRvcCl9cHgpYDtcbiAgICB9IGVsc2Uge1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS53aWR0aCA9IFwiMHB4XCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gXCIwcHhcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh3aW5kb3cuaW5uZXJXaWR0aCAvIDIpfXB4LCAke01hdGgucm91bmQod2luZG93LmlubmVySGVpZ2h0IC8gMil9cHgpYDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBjb25zdCB0b29sdGlwTGVmdCA9IGNsYW1wKCh3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCkgLyAyLCAyMCwgd2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGggLSAyMCk7XG4gICAgICBjb25zdCB0b29sdGlwVG9wID0gY2xhbXAoKHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQpIC8gMiwgMjAsIHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQgLSAyMCk7XG4gICAgICB0b29sdGlwLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHRvb2x0aXBMZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvb2x0aXBUb3ApfXB4KWA7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKCk6IHZvaWQge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHNjaGVkdWxlVXBkYXRlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycygpOiB2b2lkIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBzY2hlZHVsZVVwZGF0ZSk7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUpO1xuICAgIGlmIChmcmFtZUhhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKGZyYW1lSGFuZGxlKTtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHJlc2l6ZU9ic2VydmVyKSB7XG4gICAgICByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgc2tpcEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBvblNraXA/LigpO1xuICB9KTtcblxuICBuZXh0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIG9uTmV4dD8uKCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIHJlbmRlclRvb2x0aXAob3B0aW9uczogSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCB7IHN0ZXBDb3VudCwgc3RlcEluZGV4LCB0aXRsZTogb3B0aW9uVGl0bGUsIGJvZHk6IG9wdGlvbkJvZHksIHNob3dOZXh0LCBuZXh0TGFiZWwsIHNob3dTa2lwLCBza2lwTGFiZWwgfSA9IG9wdGlvbnM7XG5cbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHN0ZXBDb3VudCkgJiYgc3RlcENvdW50ID4gMCkge1xuICAgICAgcHJvZ3Jlc3MudGV4dENvbnRlbnQgPSBgU3RlcCAke3N0ZXBJbmRleCArIDF9IG9mICR7c3RlcENvdW50fWA7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9ncmVzcy50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvblRpdGxlICYmIG9wdGlvblRpdGxlLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aXRsZS50ZXh0Q29udGVudCA9IG9wdGlvblRpdGxlO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGl0bGUudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIGJvZHkudGV4dENvbnRlbnQgPSBvcHRpb25Cb2R5O1xuXG4gICAgb25OZXh0ID0gc2hvd05leHQgPyBvcHRpb25zLm9uTmV4dCA/PyBudWxsIDogbnVsbDtcbiAgICBpZiAoc2hvd05leHQpIHtcbiAgICAgIG5leHRCdG4udGV4dENvbnRlbnQgPSBuZXh0TGFiZWwgPz8gXCJOZXh0XCI7XG4gICAgICBuZXh0QnRuLnN0eWxlLmRpc3BsYXkgPSBcImlubGluZS1mbGV4XCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHRCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIG9uU2tpcCA9IHNob3dTa2lwID8gb3B0aW9ucy5vblNraXAgPz8gbnVsbCA6IG51bGw7XG4gICAgaWYgKHNob3dTa2lwKSB7XG4gICAgICBza2lwQnRuLnRleHRDb250ZW50ID0gc2tpcExhYmVsID8/IFwiU2tpcFwiO1xuICAgICAgc2tpcEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJpbmxpbmUtZmxleFwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBza2lwQnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IHRydWU7XG4gICAgY3VycmVudFRhcmdldCA9IG9wdGlvbnMudGFyZ2V0ID8/IG51bGw7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICByZW5kZXJUb29sdGlwKG9wdGlvbnMpO1xuICAgIGlmIChyZXNpemVPYnNlcnZlcikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFRhcmdldCAmJiB0eXBlb2YgUmVzaXplT2JzZXJ2ZXIgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHNjaGVkdWxlVXBkYXRlKCkpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShjdXJyZW50VGFyZ2V0KTtcbiAgICB9XG4gICAgYXR0YWNoTGlzdGVuZXJzKCk7XG4gICAgc2NoZWR1bGVVcGRhdGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjtcbiAgICB0b29sdGlwLnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIGRldGFjaExpc3RlbmVycygpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlKCk7XG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2hvdyxcbiAgICBoaWRlLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNUWUxFX0lEKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgc3R5bGUuaWQgPSBTVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLnR1dG9yaWFsLW92ZXJsYXkge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgICB6LWluZGV4OiA1MDtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXkudmlzaWJsZSB7XG4gICAgICBkaXNwbGF5OiBibG9jaztcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3NjcmltIHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGluc2V0OiAwO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9faGlnaGxpZ2h0IHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gICAgICBib3JkZXI6IDJweCBzb2xpZCByZ2JhKDU2LCAxODksIDI0OCwgMC45NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDAgMCAycHggcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjUpLCAwIDAgMjRweCByZ2JhKDM0LCAyMTEsIDIzOCwgMC4yNSk7XG4gICAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC4xOHMgZWFzZSwgd2lkdGggMC4xOHMgZWFzZSwgaGVpZ2h0IDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgbWluLXdpZHRoOiAyNDBweDtcbiAgICAgIG1heC13aWR0aDogbWluKDM0MHB4LCBjYWxjKDEwMHZ3IC0gMzJweCkpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgxNSwgMjMsIDQyLCAwLjk1KTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNnB4O1xuICAgICAgcGFkZGluZzogMTZweCAxOHB4O1xuICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICBib3gtc2hhZG93OiAwIDEycHggMzJweCByZ2JhKDE1LCAyMywgNDIsIDAuNTUpO1xuICAgICAgcG9pbnRlci1ldmVudHM6IGF1dG87XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdmlzaWJpbGl0eTogaGlkZGVuO1xuICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoMHB4LCAwcHgpO1xuICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzIHtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC43NSk7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X190aXRsZSB7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgICBmb250LXNpemU6IDE1cHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wNGVtO1xuICAgICAgY29sb3I6ICNmMWY1Zjk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19ib2R5IHtcbiAgICAgIG1hcmdpbjogMCAwIDE0cHg7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBsaW5lLWhlaWdodDogMS41O1xuICAgICAgY29sb3I6ICNjYmQ1ZjU7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBnYXA6IDEwcHg7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICBwYWRkaW5nOiA2cHggMTRweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDk5OXB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeSB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4yNSk7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjU1KTtcbiAgICAgIGNvbG9yOiAjZjhmYWZjO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5OmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjM1KTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3Qge1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBjb2xvcjogcmdiYSgyMDMsIDIxMywgMjI1LCAwLjkpO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdDpob3ZlciB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMjAzLCAyMTMsIDIyNSwgMC41NSk7XG4gICAgfVxuICAgIEBtZWRpYSAobWF4LXdpZHRoOiA3NjhweCkge1xuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgICBtaW4td2lkdGg6IDIwMHB4O1xuICAgICAgICBtYXgtd2lkdGg6IG1pbigzMjBweCwgY2FsYygxMDB2dyAtIDI0cHgpKTtcbiAgICAgICAgcGFkZGluZzogMTBweCAxMnB4O1xuICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogcm93O1xuICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBnYXA6IDEycHg7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3Mge1xuICAgICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fdGl0bGUge1xuICAgICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYm9keSB7XG4gICAgICAgIG1hcmdpbjogMDtcbiAgICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgICBmbGV4OiAxO1xuICAgICAgICBsaW5lLWhlaWdodDogMS40O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnMge1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgICAgcGFkZGluZzogNXB4IDEwcHg7XG4gICAgICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICAgIH1cbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuIiwgImNvbnN0IFNUT1JBR0VfUFJFRklYID0gXCJsc2Q6dHV0b3JpYWw6XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxQcm9ncmVzcyB7XG4gIHN0ZXBJbmRleDogbnVtYmVyO1xuICBjb21wbGV0ZWQ6IGJvb2xlYW47XG4gIHVwZGF0ZWRBdDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBnZXRTdG9yYWdlKCk6IFN0b3JhZ2UgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIiB8fCAhd2luZG93LmxvY2FsU3RvcmFnZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRQcm9ncmVzcyhpZDogc3RyaW5nKTogVHV0b3JpYWxQcm9ncmVzcyB8IG51bGwge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IHN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX1BSRUZJWCArIGlkKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFR1dG9yaWFsUHJvZ3Jlc3M7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHBhcnNlZCAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQgPT09IG51bGwgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuc3RlcEluZGV4ICE9PSBcIm51bWJlclwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmNvbXBsZXRlZCAhPT0gXCJib29sZWFuXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQudXBkYXRlZEF0ICE9PSBcIm51bWJlclwiXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnNlZDtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVQcm9ncmVzcyhpZDogc3RyaW5nLCBwcm9ncmVzczogVHV0b3JpYWxQcm9ncmVzcyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnNldEl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCwgSlNPTi5zdHJpbmdpZnkocHJvZ3Jlc3MpKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gaWdub3JlIHN0b3JhZ2UgZmFpbHVyZXNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJQcm9ncmVzcyhpZDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2UucmVtb3ZlSXRlbShTVE9SQUdFX1BSRUZJWCArIGlkKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gaWdub3JlIHN0b3JhZ2UgZmFpbHVyZXNcbiAgfVxufVxuIiwgImV4cG9ydCB0eXBlIFJvbGVJZCA9XG4gIHwgXCJjYW52YXNcIlxuICB8IFwic2hpcFNldFwiXG4gIHwgXCJzaGlwU2VsZWN0XCJcbiAgfCBcInNoaXBEZWxldGVcIlxuICB8IFwic2hpcENsZWFyXCJcbiAgfCBcInNoaXBTcGVlZFNsaWRlclwiXG4gIHwgXCJoZWF0QmFyXCJcbiAgfCBcInNwZWVkTWFya2VyXCJcbiAgfCBcIm1pc3NpbGVTZXRcIlxuICB8IFwibWlzc2lsZVNlbGVjdFwiXG4gIHwgXCJtaXNzaWxlRGVsZXRlXCJcbiAgfCBcIm1pc3NpbGVTcGVlZFNsaWRlclwiXG4gIHwgXCJtaXNzaWxlQWdyb1NsaWRlclwiXG4gIHwgXCJtaXNzaWxlQWRkUm91dGVcIlxuICB8IFwibWlzc2lsZUxhdW5jaFwiXG4gIHwgXCJyb3V0ZVByZXZcIlxuICB8IFwicm91dGVOZXh0XCJcbiAgfCBcImhlbHBUb2dnbGVcIlxuICB8IFwidHV0b3JpYWxTdGFydFwiXG4gIHwgXCJzcGF3bkJvdFwiO1xuXG5leHBvcnQgdHlwZSBSb2xlUmVzb2x2ZXIgPSAoKSA9PiBIVE1MRWxlbWVudCB8IG51bGw7XG5cbmV4cG9ydCB0eXBlIFJvbGVzTWFwID0gUmVjb3JkPFJvbGVJZCwgUm9sZVJlc29sdmVyPjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJvbGVzKCk6IFJvbGVzTWFwIHtcbiAgcmV0dXJuIHtcbiAgICBjYW52YXM6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3ZcIiksXG4gICAgc2hpcFNldDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNldFwiKSxcbiAgICBzaGlwU2VsZWN0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0XCIpLFxuICAgIHNoaXBEZWxldGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1kZWxldGVcIiksXG4gICAgc2hpcENsZWFyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIiksXG4gICAgc2hpcFNwZWVkU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtc2xpZGVyXCIpLFxuICAgIGhlYXRCYXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItY29udGFpbmVyXCIpLFxuICAgIHNwZWVkTWFya2VyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkLW1hcmtlclwiKSxcbiAgICBtaXNzaWxlU2V0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2V0XCIpLFxuICAgIG1pc3NpbGVTZWxlY3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZWxlY3RcIiksXG4gICAgbWlzc2lsZURlbGV0ZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWRlbGV0ZVwiKSxcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1zbGlkZXJcIiksXG4gICAgbWlzc2lsZUFncm9TbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXNsaWRlclwiKSxcbiAgICBtaXNzaWxlQWRkUm91dGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIiksXG4gICAgbWlzc2lsZUxhdW5jaDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaFwiKSxcbiAgICByb3V0ZVByZXY6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtcHJldlwiKSxcbiAgICByb3V0ZU5leHQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbmV4dFwiKSxcbiAgICBoZWxwVG9nZ2xlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtdG9nZ2xlXCIpLFxuICAgIHR1dG9yaWFsU3RhcnQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidHV0b3JpYWwtc3RhcnRcIiksXG4gICAgc3Bhd25Cb3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Um9sZUVsZW1lbnQocm9sZXM6IFJvbGVzTWFwLCByb2xlOiBSb2xlSWQgfCBudWxsIHwgdW5kZWZpbmVkKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgaWYgKCFyb2xlKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcmVzb2x2ZXIgPSByb2xlc1tyb2xlXTtcbiAgcmV0dXJuIHJlc29sdmVyID8gcmVzb2x2ZXIoKSA6IG51bGw7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cywgRXZlbnRLZXkgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVIaWdobGlnaHRlciwgdHlwZSBIaWdobGlnaHRlciB9IGZyb20gXCIuL2hpZ2hsaWdodFwiO1xuaW1wb3J0IHsgY2xlYXJQcm9ncmVzcywgbG9hZFByb2dyZXNzLCBzYXZlUHJvZ3Jlc3MgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBnZXRSb2xlRWxlbWVudCwgdHlwZSBSb2xlSWQsIHR5cGUgUm9sZXNNYXAgfSBmcm9tIFwiLi9yb2xlc1wiO1xuXG5leHBvcnQgdHlwZSBTdGVwQWR2YW5jZSA9XG4gIHwge1xuICAgICAga2luZDogXCJldmVudFwiO1xuICAgICAgZXZlbnQ6IEV2ZW50S2V5O1xuICAgICAgd2hlbj86IChwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuO1xuICAgICAgY2hlY2s/OiAoKSA9PiBib29sZWFuO1xuICAgIH1cbiAgfCB7XG4gICAgICBraW5kOiBcIm1hbnVhbFwiO1xuICAgICAgbmV4dExhYmVsPzogc3RyaW5nO1xuICAgIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxTdGVwIHtcbiAgaWQ6IHN0cmluZztcbiAgdGFyZ2V0OiBSb2xlSWQgfCAoKCkgPT4gSFRNTEVsZW1lbnQgfCBudWxsKSB8IG51bGw7XG4gIHRpdGxlPzogc3RyaW5nO1xuICBib2R5OiBzdHJpbmc7XG4gIGFkdmFuY2U6IFN0ZXBBZHZhbmNlO1xuICBvbkVudGVyPzogKCkgPT4gdm9pZDtcbiAgb25FeGl0PzogKCkgPT4gdm9pZDtcbiAgYWxsb3dTa2lwPzogYm9vbGVhbjtcbiAgc2tpcExhYmVsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgRW5naW5lT3B0aW9ucyB7XG4gIGlkOiBzdHJpbmc7XG4gIGJ1czogRXZlbnRCdXM7XG4gIHJvbGVzOiBSb2xlc01hcDtcbiAgc3RlcHM6IFR1dG9yaWFsU3RlcFtdO1xufVxuXG5pbnRlcmZhY2UgU3RhcnRPcHRpb25zIHtcbiAgcmVzdW1lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbEVuZ2luZSB7XG4gIHN0YXJ0KG9wdGlvbnM/OiBTdGFydE9wdGlvbnMpOiB2b2lkO1xuICByZXN0YXJ0KCk6IHZvaWQ7XG4gIHN0b3AoKTogdm9pZDtcbiAgaXNSdW5uaW5nKCk6IGJvb2xlYW47XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVR1dG9yaWFsRW5naW5lKHsgaWQsIGJ1cywgcm9sZXMsIHN0ZXBzIH06IEVuZ2luZU9wdGlvbnMpOiBUdXRvcmlhbEVuZ2luZSB7XG4gIGNvbnN0IGhpZ2hsaWdodGVyOiBIaWdobGlnaHRlciA9IGNyZWF0ZUhpZ2hsaWdodGVyKCk7XG4gIGxldCBydW5uaW5nID0gZmFsc2U7XG4gIGxldCBwYXVzZWQgPSBmYWxzZTtcbiAgbGV0IGN1cnJlbnRJbmRleCA9IC0xO1xuICBsZXQgY3VycmVudFN0ZXA6IFR1dG9yaWFsU3RlcCB8IG51bGwgPSBudWxsO1xuICBsZXQgY2xlYW51cEN1cnJlbnQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgcmVuZGVyQ3VycmVudDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBmYWxzZTtcbiAgbGV0IHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuXG4gIGNvbnN0IHBlcnNpc3RlbnRMaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cbiAgcGVyc2lzdGVudExpc3RlbmVycy5wdXNoKFxuICAgIGJ1cy5vbihcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgKHsgdmlzaWJsZSB9KSA9PiB7XG4gICAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICAgIHBhdXNlZCA9IEJvb2xlYW4odmlzaWJsZSk7XG4gICAgICBpZiAocGF1c2VkKSB7XG4gICAgICAgIGhpZ2hsaWdodGVyLmhpZGUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlbmRlckN1cnJlbnQ/LigpO1xuICAgICAgfVxuICAgIH0pLFxuICApO1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVUYXJnZXQoc3RlcDogVHV0b3JpYWxTdGVwKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgICBpZiAoIXN0ZXAudGFyZ2V0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBzdGVwLnRhcmdldCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICByZXR1cm4gc3RlcC50YXJnZXQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGdldFJvbGVFbGVtZW50KHJvbGVzLCBzdGVwLnRhcmdldCk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGFtcEluZGV4KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHJldHVybiAwO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGluZGV4KSB8fCBpbmRleCA8IDApIHJldHVybiAwO1xuICAgIGlmIChpbmRleCA+PSBzdGVwcy5sZW5ndGgpIHJldHVybiBzdGVwcy5sZW5ndGggLSAxO1xuICAgIHJldHVybiBNYXRoLmZsb29yKGluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFN0ZXAoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSBzdGVwcy5sZW5ndGgpIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnRTdGVwKSB7XG4gICAgICBjdXJyZW50U3RlcC5vbkV4aXQ/LigpO1xuICAgICAgY3VycmVudFN0ZXAgPSBudWxsO1xuICAgIH1cblxuICAgIGN1cnJlbnRJbmRleCA9IGluZGV4O1xuICAgIGNvbnN0IHN0ZXAgPSBzdGVwc1tpbmRleF07XG4gICAgY3VycmVudFN0ZXAgPSBzdGVwO1xuXG4gICAgcGVyc2lzdFByb2dyZXNzKGluZGV4LCBmYWxzZSk7XG5cbiAgICBidXMuZW1pdChcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCIsIHsgaWQsIHN0ZXBJbmRleDogaW5kZXgsIHRvdGFsOiBzdGVwcy5sZW5ndGggfSk7XG4gICAgc3RlcC5vbkVudGVyPy4oKTtcblxuICAgIGNvbnN0IGFsbG93U2tpcCA9IHN0ZXAuYWxsb3dTa2lwICE9PSBmYWxzZTtcbiAgICBjb25zdCByZW5kZXIgPSAoKTogdm9pZCA9PiB7XG4gICAgICBpZiAoIXJ1bm5pbmcgfHwgcGF1c2VkKSByZXR1cm47XG4gICAgICBoaWdobGlnaHRlci5zaG93KHtcbiAgICAgICAgdGFyZ2V0OiByZXNvbHZlVGFyZ2V0KHN0ZXApLFxuICAgICAgICB0aXRsZTogc3RlcC50aXRsZSxcbiAgICAgICAgYm9keTogc3RlcC5ib2R5LFxuICAgICAgICBzdGVwSW5kZXg6IGluZGV4LFxuICAgICAgICBzdGVwQ291bnQ6IHN0ZXBzLmxlbmd0aCxcbiAgICAgICAgc2hvd05leHQ6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiLFxuICAgICAgICBuZXh0TGFiZWw6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiXG4gICAgICAgICAgPyBzdGVwLmFkdmFuY2UubmV4dExhYmVsID8/IChpbmRleCA9PT0gc3RlcHMubGVuZ3RoIC0gMSA/IFwiRmluaXNoXCIgOiBcIk5leHRcIilcbiAgICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgICAgb25OZXh0OiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIiA/IGFkdmFuY2VTdGVwIDogdW5kZWZpbmVkLFxuICAgICAgICBzaG93U2tpcDogYWxsb3dTa2lwLFxuICAgICAgICBza2lwTGFiZWw6IHN0ZXAuc2tpcExhYmVsLFxuICAgICAgICBvblNraXA6IGFsbG93U2tpcCA/IHNraXBDdXJyZW50U3RlcCA6IHVuZGVmaW5lZCxcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICByZW5kZXJDdXJyZW50ID0gcmVuZGVyO1xuICAgIHJlbmRlcigpO1xuXG4gICAgaWYgKHN0ZXAuYWR2YW5jZS5raW5kID09PSBcImV2ZW50XCIpIHtcbiAgICAgIGNvbnN0IGhhbmRsZXIgPSAocGF5bG9hZDogdW5rbm93bik6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoIXJ1bm5pbmcgfHwgcGF1c2VkKSByZXR1cm47XG4gICAgICAgIGlmIChzdGVwLmFkdmFuY2Uud2hlbiAmJiAhc3RlcC5hZHZhbmNlLndoZW4ocGF5bG9hZCkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgYWR2YW5jZVRvKGluZGV4ICsgMSk7XG4gICAgICB9O1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBidXMub24oc3RlcC5hZHZhbmNlLmV2ZW50LCBoYW5kbGVyIGFzICh2YWx1ZTogbmV2ZXIpID0+IHZvaWQpO1xuICAgICAgaWYgKHN0ZXAuYWR2YW5jZS5jaGVjayAmJiBzdGVwLmFkdmFuY2UuY2hlY2soKSkge1xuICAgICAgICBoYW5kbGVyKHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlVG8obmV4dEluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG4gICAgcmVuZGVyQ3VycmVudCA9IG51bGw7XG4gICAgaWYgKG5leHRJbmRleCA+PSBzdGVwcy5sZW5ndGgpIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0U3RlcChuZXh0SW5kZXgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGFkdmFuY2VTdGVwKCk6IHZvaWQge1xuICAgIGFkdmFuY2VUbyhjdXJyZW50SW5kZXggKyAxKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNraXBDdXJyZW50U3RlcCgpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBjb25zdCBuZXh0SW5kZXggPSBjdXJyZW50SW5kZXggPj0gMCA/IGN1cnJlbnRJbmRleCArIDEgOiAwO1xuICAgIGFkdmFuY2VUbyhuZXh0SW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gY29tcGxldGVUdXRvcmlhbCgpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSB0cnVlO1xuICAgIHBlcnNpc3RQcm9ncmVzcyhzdGVwcy5sZW5ndGgsIHRydWUpO1xuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6Y29tcGxldGVkXCIsIHsgaWQgfSk7XG4gICAgc3RvcCgpO1xuICAgIHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnQob3B0aW9ucz86IFN0YXJ0T3B0aW9ucyk6IHZvaWQge1xuICAgIGNvbnN0IHJlc3VtZSA9IG9wdGlvbnM/LnJlc3VtZSAhPT0gZmFsc2U7XG4gICAgaWYgKHJ1bm5pbmcpIHtcbiAgICAgIHJlc3RhcnQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBydW5uaW5nID0gdHJ1ZTtcbiAgICBwYXVzZWQgPSBmYWxzZTtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcbiAgICBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBmYWxzZTtcbiAgICBsZXQgc3RhcnRJbmRleCA9IDA7XG4gICAgaWYgKHJlc3VtZSkge1xuICAgICAgY29uc3QgcHJvZ3Jlc3MgPSBsb2FkUHJvZ3Jlc3MoaWQpO1xuICAgICAgaWYgKHByb2dyZXNzICYmICFwcm9ncmVzcy5jb21wbGV0ZWQpIHtcbiAgICAgICAgc3RhcnRJbmRleCA9IGNsYW1wSW5kZXgocHJvZ3Jlc3Muc3RlcEluZGV4KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2xlYXJQcm9ncmVzcyhpZCk7XG4gICAgfVxuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6c3RhcnRlZFwiLCB7IGlkIH0pO1xuICAgIHNldFN0ZXAoc3RhcnRJbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiByZXN0YXJ0KCk6IHZvaWQge1xuICAgIHN0b3AoKTtcbiAgICBzdGFydCh7IHJlc3VtZTogZmFsc2UgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzdG9wKCk6IHZvaWQge1xuICAgIGNvbnN0IHNob3VsZFBlcnNpc3QgPSAhc3VwcHJlc3NQZXJzaXN0T25TdG9wICYmIHJ1bm5pbmcgJiYgIWxhc3RTYXZlZENvbXBsZXRlZCAmJiBjdXJyZW50SW5kZXggPj0gMCAmJiBjdXJyZW50SW5kZXggPCBzdGVwcy5sZW5ndGg7XG4gICAgY29uc3QgaW5kZXhUb1BlcnNpc3QgPSBjdXJyZW50SW5kZXg7XG5cbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHNob3VsZFBlcnNpc3QpIHtcbiAgICAgIHBlcnNpc3RQcm9ncmVzcyhpbmRleFRvUGVyc2lzdCwgZmFsc2UpO1xuICAgIH1cbiAgICBydW5uaW5nID0gZmFsc2U7XG4gICAgcGF1c2VkID0gZmFsc2U7XG4gICAgY3VycmVudEluZGV4ID0gLTE7XG4gICAgcmVuZGVyQ3VycmVudCA9IG51bGw7XG4gICAgaGlnaGxpZ2h0ZXIuaGlkZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNSdW5uaW5nKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBydW5uaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBzdG9wKCk7XG4gICAgZm9yIChjb25zdCBkaXNwb3NlIG9mIHBlcnNpc3RlbnRMaXN0ZW5lcnMpIHtcbiAgICAgIGRpc3Bvc2UoKTtcbiAgICB9XG4gICAgaGlnaGxpZ2h0ZXIuZGVzdHJveSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGVyc2lzdFByb2dyZXNzKHN0ZXBJbmRleDogbnVtYmVyLCBjb21wbGV0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBjb21wbGV0ZWQ7XG4gICAgc2F2ZVByb2dyZXNzKGlkLCB7XG4gICAgICBzdGVwSW5kZXgsXG4gICAgICBjb21wbGV0ZWQsXG4gICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHN0YXJ0LFxuICAgIHJlc3RhcnQsXG4gICAgc3RvcCxcbiAgICBpc1J1bm5pbmcsXG4gICAgZGVzdHJveSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFR1dG9yaWFsU3RlcCB9IGZyb20gXCIuL2VuZ2luZVwiO1xuXG5mdW5jdGlvbiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkOiB1bmtub3duLCBtaW5JbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGluZGV4ID0gKHBheWxvYWQgYXMgeyBpbmRleD86IHVua25vd24gfSkuaW5kZXg7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09IFwibnVtYmVyXCIgfHwgIU51bWJlci5pc0Zpbml0ZShpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGluZGV4ID49IG1pbkluZGV4O1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Um91dGVJZChwYXlsb2FkOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgcm91dGVJZCA9IChwYXlsb2FkIGFzIHsgcm91dGVJZD86IHVua25vd24gfSkucm91dGVJZDtcbiAgcmV0dXJuIHR5cGVvZiByb3V0ZUlkID09PSBcInN0cmluZ1wiID8gcm91dGVJZCA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIHBheWxvYWRUb29sRXF1YWxzKHRhcmdldDogc3RyaW5nKTogKHBheWxvYWQ6IHVua25vd24pID0+IGJvb2xlYW4ge1xuICByZXR1cm4gKHBheWxvYWQ6IHVua25vd24pOiBib29sZWFuID0+IHtcbiAgICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHRvb2wgPSAocGF5bG9hZCBhcyB7IHRvb2w/OiB1bmtub3duIH0pLnRvb2w7XG4gICAgcmV0dXJuIHR5cGVvZiB0b29sID09PSBcInN0cmluZ1wiICYmIHRvb2wgPT09IHRhcmdldDtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJhc2ljVHV0b3JpYWxTdGVwcygpOiBUdXRvcmlhbFN0ZXBbXSB7XG4gIGxldCByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA9IDA7XG4gIGxldCBpbml0aWFsUm91dGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBuZXdSb3V0ZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICByZXR1cm4gW1xuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtcGxvdC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCBhIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkNsaWNrIG9uIHRoZSBtYXAgdG8gZHJvcCBhdCBsZWFzdCB0aHJlZSB3YXlwb2ludHMgYW5kIHNrZXRjaCB5b3VyIGNvdXJzZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IGhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDIpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtY2hhbmdlLXNwZWVkXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcFNwZWVkU2xpZGVyXCIsXG4gICAgICB0aXRsZTogXCJBZGp1c3Qgc2hpcCBzcGVlZFwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIFNoaXAgU3BlZWQgc2xpZGVyIChvciBwcmVzcyBbIC8gXSkgdG8gZmluZS10dW5lIHlvdXIgdHJhdmVsIHNwZWVkLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6c3BlZWRDaGFuZ2VkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1zZWxlY3QtbGVnXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcFNlbGVjdFwiLFxuICAgICAgdGl0bGU6IFwiU2VsZWN0IGEgcm91dGUgbGVnXCIsXG4gICAgICBib2R5OiBcIlN3aXRjaCB0byBTZWxlY3QgbW9kZSAoVCBrZXkpIGFuZCB0aGVuIGNsaWNrIGEgd2F5cG9pbnQgb24gdGhlIG1hcCB0byBoaWdobGlnaHQgaXRzIGxlZy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOmxlZ1NlbGVjdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAwKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LW1hdGNoLW1hcmtlclwiLFxuICAgICAgdGFyZ2V0OiBcInNwZWVkTWFya2VyXCIsXG4gICAgICB0aXRsZTogXCJNYXRjaCB0aGUgbWFya2VyXCIsXG4gICAgICBib2R5OiBcIkxpbmUgdXAgdGhlIFNoaXAgU3BlZWQgc2xpZGVyIHdpdGggdGhlIHRpY2sgdG8gY3J1aXNlIGF0IHRoZSBuZXV0cmFsIGhlYXQgc3BlZWQuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDptYXJrZXJBbGlnbmVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtcHVzaC1ob3RcIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJTcHJpbnQgaW50byB0aGUgcmVkXCIsXG4gICAgICBib2R5OiBcIlB1c2ggdGhlIHRocm90dGxlIGFib3ZlIHRoZSBtYXJrZXIgYW5kIHdhdGNoIHRoZSBoZWF0IGJhciByZWFjaCB0aGUgd2FybmluZyBiYW5kLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6d2FybkVudGVyZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1jb29sLWRvd25cIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJDb29sIGl0IGJhY2sgZG93blwiLFxuICAgICAgYm9keTogXCJFYXNlIG9mZiBiZWxvdyB0aGUgbWFya2VyIHVudGlsIHRoZSBiYXIgZHJvcHMgb3V0IG9mIHRoZSB3YXJuaW5nIHpvbmUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDpjb29sZWRCZWxvd1dhcm5cIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC10cmlnZ2VyLXN0YWxsXCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiVHJpZ2dlciBhIHN0YWxsXCIsXG4gICAgICBib2R5OiBcIlB1c2ggd2VsbCBhYm92ZSB0aGUgbGltaXQgYW5kIGhvbGQgaXQgdW50aWwgdGhlIG92ZXJoZWF0IHN0YWxsIG92ZXJsYXkgYXBwZWFycy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0OnN0YWxsVHJpZ2dlcmVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtcmVjb3Zlci1zdGFsbFwiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIlJlY292ZXIgZnJvbSB0aGUgc3RhbGxcIixcbiAgICAgIGJvZHk6IFwiSG9sZCBzdGVhZHkgd2hpbGUgc3lzdGVtcyBjb29sLiBPbmNlIHRoZSBvdmVybGF5IGNsZWFycywgeW91XHUyMDE5cmUgYmFjayBvbmxpbmUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LWR1YWwtYmFyc1wiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIlJlYWQgYm90aCBoZWF0IGJhcnNcIixcbiAgICAgIGJvZHk6IFwiQWRqdXN0IGEgd2F5cG9pbnQgdG8gbWFrZSB0aGUgcGxhbm5lZCBiYXIgZXh0ZW5kIHBhc3QgbGl2ZSBoZWF0LiBVc2UgaXQgdG8gcHJlZGljdCBmdXR1cmUgb3ZlcmxvYWRzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6ZHVhbE1ldGVyRGl2ZXJnZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1kZWxldGUtbGVnXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcERlbGV0ZVwiLFxuICAgICAgdGl0bGU6IFwiRGVsZXRlIGEgcm91dGUgbGVnXCIsXG4gICAgICBib2R5OiBcIlJlbW92ZSB0aGUgc2VsZWN0ZWQgd2F5cG9pbnQgdXNpbmcgdGhlIERlbGV0ZSBjb250cm9sIG9yIHRoZSBEZWxldGUga2V5LlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6d2F5cG9pbnREZWxldGVkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1jbGVhci1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBDbGVhclwiLFxuICAgICAgdGl0bGU6IFwiQ2xlYXIgdGhlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkNsZWFyIHJlbWFpbmluZyB3YXlwb2ludHMgdG8gcmVzZXQgeW91ciBwbG90dGVkIGNvdXJzZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOmNsZWFySW52b2tlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtc2V0LW1vZGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlU2V0XCIsXG4gICAgICB0aXRsZTogXCJTd2l0Y2ggdG8gbWlzc2lsZSBwbGFubmluZ1wiLFxuICAgICAgYm9keTogXCJUYXAgU2V0IHNvIGV2ZXJ5IGNsaWNrIGRyb3BzIG1pc3NpbGUgd2F5cG9pbnRzIG9uIHRoZSBhY3RpdmUgcm91dGUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLFxuICAgICAgICB3aGVuOiBwYXlsb2FkVG9vbEVxdWFscyhcInNldFwiKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXBsb3QtaW5pdGlhbFwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCBtaXNzaWxlIHdheXBvaW50c1wiLFxuICAgICAgYm9keTogXCJDbGljayB0aGUgbWFwIHRvIGRyb3AgYXQgbGVhc3QgdHdvIGd1aWRhbmNlIHBvaW50cyBmb3IgdGhlIGN1cnJlbnQgbWlzc2lsZSByb3V0ZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBpZiAoIWhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDEpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmIChyb3V0ZUlkKSB7XG4gICAgICAgICAgICBpbml0aWFsUm91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLWluaXRpYWxcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggdGhlIHN0cmlrZVwiLFxuICAgICAgYm9keTogXCJTZW5kIHRoZSBwbGFubmVkIG1pc3NpbGUgcm91dGUgbGl2ZSB3aXRoIHRoZSBMYXVuY2ggY29udHJvbCAoTCBrZXkpLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCkge1xuICAgICAgICAgICAgaW5pdGlhbFJvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWFkZC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVBZGRSb3V0ZVwiLFxuICAgICAgdGl0bGU6IFwiQ3JlYXRlIGEgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiUHJlc3MgTmV3IHRvIGFkZCBhIHNlY29uZCBtaXNzaWxlIHJvdXRlIGZvciBhbm90aGVyIHN0cmlrZSBncm91cC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOnJvdXRlQWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFyb3V0ZUlkKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgbmV3Um91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1wbG90LW5ldy1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCB0aGUgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiRHJvcCBhdCBsZWFzdCB0d28gd2F5cG9pbnRzIG9uIHRoZSBuZXcgcm91dGUgdG8gZGVmaW5lIGl0cyBwYXRoLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGlmICghaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKG5ld1JvdXRlSWQgJiYgcm91dGVJZCAmJiByb3V0ZUlkICE9PSBuZXdSb3V0ZUlkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghbmV3Um91dGVJZCAmJiByb3V0ZUlkKSB7XG4gICAgICAgICAgICBuZXdSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtbmV3LXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIHRoZSBuZXcgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiTGF1bmNoIHRoZSBmcmVzaCBtaXNzaWxlIHJvdXRlIHRvIGNvbmZpcm0gaXRzIHBhdHRlcm4uXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFuZXdSb3V0ZUlkIHx8ICFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gbmV3Um91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXN3aXRjaC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcInJvdXRlTmV4dFwiLFxuICAgICAgdGl0bGU6IFwiU3dpdGNoIGJhY2sgdG8gdGhlIG9yaWdpbmFsIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgXHUyNUMwIFx1MjVCNiBjb250cm9scyAob3IgVGFiL1NoaWZ0K1RhYikgdG8gc2VsZWN0IHlvdXIgZmlyc3QgbWlzc2lsZSByb3V0ZSBhZ2Fpbi5cIixcbiAgICAgIG9uRW50ZXI6ICgpID0+IHtcbiAgICAgICAgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPSAwO1xuICAgICAgfSxcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyICs9IDE7XG4gICAgICAgICAgaWYgKHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyIDwgMSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkIHx8ICFyb3V0ZUlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLWFmdGVyLXN3aXRjaFwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCBmcm9tIHRoZSBvdGhlciByb3V0ZVwiLFxuICAgICAgYm9keTogXCJGaXJlIHRoZSBvcmlnaW5hbCBtaXNzaWxlIHJvdXRlIHRvIHByYWN0aWNlIHJvdW5kLXJvYmluIHN0cmlrZXMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCB8fCAhcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInR1dG9yaWFsLXByYWN0aWNlXCIsXG4gICAgICB0YXJnZXQ6IFwic3Bhd25Cb3RcIixcbiAgICAgIHRpdGxlOiBcIlNwYXduIGEgcHJhY3RpY2UgYm90XCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgQm90IGNvbnRyb2wgdG8gYWRkIGEgdGFyZ2V0IGFuZCByZWhlYXJzZSB0aGVzZSBtYW5ldXZlcnMgaW4gcmVhbCB0aW1lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImJvdDpzcGF3blJlcXVlc3RlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJ0dXRvcmlhbC1jb21wbGV0ZVwiLFxuICAgICAgdGFyZ2V0OiBudWxsLFxuICAgICAgdGl0bGU6IFwiWW91XHUyMDE5cmUgcmVhZHlcIixcbiAgICAgIGJvZHk6IFwiR3JlYXQgd29yay4gUmVsb2FkIHRoZSBjb25zb2xlIG9yIHJlam9pbiBhIHJvb20gdG8gcmV2aXNpdCB0aGVzZSBkcmlsbHMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwibWFudWFsXCIsXG4gICAgICAgIG5leHRMYWJlbDogXCJGaW5pc2hcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gIF07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZVR1dG9yaWFsRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBjcmVhdGVSb2xlcyB9IGZyb20gXCIuL3JvbGVzXCI7XG5pbXBvcnQgeyBnZXRCYXNpY1R1dG9yaWFsU3RlcHMgfSBmcm9tIFwiLi9zdGVwc19iYXNpY1wiO1xuZXhwb3J0IGNvbnN0IEJBU0lDX1RVVE9SSUFMX0lEID0gXCJzaGlwLWJhc2ljc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsQ29udHJvbGxlciB7XG4gIHN0YXJ0KG9wdGlvbnM/OiB7IHJlc3VtZT86IGJvb2xlYW4gfSk6IHZvaWQ7XG4gIHJlc3RhcnQoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRUdXRvcmlhbChidXM6IEV2ZW50QnVzKTogVHV0b3JpYWxDb250cm9sbGVyIHtcbiAgY29uc3Qgcm9sZXMgPSBjcmVhdGVSb2xlcygpO1xuICBjb25zdCBlbmdpbmUgPSBjcmVhdGVUdXRvcmlhbEVuZ2luZSh7XG4gICAgaWQ6IEJBU0lDX1RVVE9SSUFMX0lELFxuICAgIGJ1cyxcbiAgICByb2xlcyxcbiAgICBzdGVwczogZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzKCksXG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RhcnQob3B0aW9ucykge1xuICAgICAgZW5naW5lLnN0YXJ0KG9wdGlvbnMpO1xuICAgIH0sXG4gICAgcmVzdGFydCgpIHtcbiAgICAgIGVuZ2luZS5yZXN0YXJ0KCk7XG4gICAgfSxcbiAgICBkZXN0cm95KCkge1xuICAgICAgZW5naW5lLmRlc3Ryb3koKTtcbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVDaG9pY2Uge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVDb250ZW50IHtcbiAgc3BlYWtlcjogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIGludGVudD86IFwiZmFjdG9yeVwiIHwgXCJ1bml0XCI7XG4gIGNob2ljZXM/OiBEaWFsb2d1ZUNob2ljZVtdO1xuICB0eXBpbmdTcGVlZE1zPzogbnVtYmVyO1xuICBvbkNob2ljZT86IChjaG9pY2VJZDogc3RyaW5nKSA9PiB2b2lkO1xuICBvblRleHRGdWxseVJlbmRlcmVkPzogKCkgPT4gdm9pZDtcbiAgb25Db250aW51ZT86ICgpID0+IHZvaWQ7XG4gIGNvbnRpbnVlTGFiZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVPdmVybGF5IHtcbiAgc2hvdyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkO1xuICBoaWRlKCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgaXNWaXNpYmxlKCk6IGJvb2xlYW47XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJkaWFsb2d1ZS1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkoKTogRGlhbG9ndWVPdmVybGF5IHtcbiAgZW5zdXJlU3R5bGVzKCk7XG5cbiAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1vdmVybGF5XCI7XG4gIG92ZXJsYXkuc2V0QXR0cmlidXRlKFwiYXJpYS1saXZlXCIsIFwicG9saXRlXCIpO1xuXG4gIGNvbnN0IGNvbnNvbGVGcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGNvbnNvbGVGcmFtZS5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNvbnNvbGVcIjtcblxuICBjb25zdCBzcGVha2VyTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzcGVha2VyTGFiZWwuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1zcGVha2VyXCI7XG5cbiAgY29uc3QgdGV4dEJsb2NrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGV4dEJsb2NrLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtdGV4dFwiO1xuXG4gIGNvbnN0IGN1cnNvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBjdXJzb3IuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jdXJzb3JcIjtcbiAgY3Vyc29yLnRleHRDb250ZW50ID0gXCJfXCI7XG5cbiAgY29uc3QgY2hvaWNlc0xpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidWxcIik7XG4gIGNob2ljZXNMaXN0LmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY2hvaWNlcyBoaWRkZW5cIjtcblxuICBjb25zdCBjb250aW51ZUJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGNvbnRpbnVlQnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICBjb250aW51ZUJ1dHRvbi5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNvbnRpbnVlIGhpZGRlblwiO1xuICBjb250aW51ZUJ1dHRvbi50ZXh0Q29udGVudCA9IFwiQ29udGludWVcIjtcblxuICB0ZXh0QmxvY2suYXBwZW5kKGN1cnNvcik7XG4gIGNvbnNvbGVGcmFtZS5hcHBlbmQoc3BlYWtlckxhYmVsLCB0ZXh0QmxvY2ssIGNob2ljZXNMaXN0LCBjb250aW51ZUJ1dHRvbik7XG4gIG92ZXJsYXkuYXBwZW5kKGNvbnNvbGVGcmFtZSk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHR5cGluZ0hhbmRsZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCB0YXJnZXRUZXh0ID0gXCJcIjtcbiAgbGV0IHJlbmRlcmVkQ2hhcnMgPSAwO1xuICBsZXQgYWN0aXZlQ29udGVudDogRGlhbG9ndWVDb250ZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gY2xlYXJUeXBpbmcoKTogdm9pZCB7XG4gICAgaWYgKHR5cGluZ0hhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0eXBpbmdIYW5kbGUpO1xuICAgICAgdHlwaW5nSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBmaW5pc2hUeXBpbmcoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgcmVuZGVyZWRDaGFycyA9IHRhcmdldFRleHQubGVuZ3RoO1xuICAgIHVwZGF0ZVRleHQoKTtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIGNvbnRlbnQub25UZXh0RnVsbHlSZW5kZXJlZD8uKCk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgfHwgY29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVRleHQoKTogdm9pZCB7XG4gICAgY29uc3QgdGV4dFRvU2hvdyA9IHRhcmdldFRleHQuc2xpY2UoMCwgcmVuZGVyZWRDaGFycyk7XG4gICAgdGV4dEJsb2NrLmlubmVySFRNTCA9IFwiXCI7XG4gICAgY29uc3QgdGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICB0ZXh0Tm9kZS50ZXh0Q29udGVudCA9IHRleHRUb1Nob3c7XG4gICAgdGV4dEJsb2NrLmFwcGVuZCh0ZXh0Tm9kZSwgY3Vyc29yKTtcbiAgICBjdXJzb3IuY2xhc3NMaXN0LnRvZ2dsZShcImhpZGRlblwiLCAhdmlzaWJsZSk7XG4gIH1cblxuICBmdW5jdGlvbiByZW5kZXJDaG9pY2VzKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGNob2ljZXNMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgY29uc3QgY2hvaWNlcyA9IEFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSA/IGNvbnRlbnQuY2hvaWNlcyA6IFtdO1xuICAgIGlmIChjaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgYnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgICAgYnV0dG9uLmRhdGFzZXQuY2hvaWNlSWQgPSBjaG9pY2UuaWQ7XG4gICAgICBidXR0b24udGV4dENvbnRlbnQgPSBgJHtpbmRleCArIDF9LiAke2Nob2ljZS50ZXh0fWA7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgICAgY29udGVudC5vbkNob2ljZT8uKGNob2ljZS5pZCk7XG4gICAgICB9KTtcbiAgICAgIGl0ZW0uYXBwZW5kKGJ1dHRvbik7XG4gICAgICBjaG9pY2VzTGlzdC5hcHBlbmQoaXRlbSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzaG93Q29udGludWUoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgaWYgKCFjb250ZW50Lm9uQ29udGludWUpIHtcbiAgICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gbnVsbDtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29udGludWVCdXR0b24udGV4dENvbnRlbnQgPSBjb250ZW50LmNvbnRpbnVlTGFiZWwgPz8gXCJDb250aW51ZVwiO1xuICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24ub25jbGljayA9ICgpID0+IHtcbiAgICAgIGNvbnRlbnQub25Db250aW51ZT8uKCk7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjaGVkdWxlVHlwZShjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIGNvbnN0IHR5cGluZ1NwZWVkID0gY2xhbXAoTnVtYmVyKGNvbnRlbnQudHlwaW5nU3BlZWRNcykgfHwgMTgsIDgsIDY0KTtcbiAgICBjb25zdCB0aWNrID0gKCk6IHZvaWQgPT4ge1xuICAgICAgcmVuZGVyZWRDaGFycyA9IE1hdGgubWluKHJlbmRlcmVkQ2hhcnMgKyAxLCB0YXJnZXRUZXh0Lmxlbmd0aCk7XG4gICAgICB1cGRhdGVUZXh0KCk7XG4gICAgICBpZiAocmVuZGVyZWRDaGFycyA+PSB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgICBjbGVhclR5cGluZygpO1xuICAgICAgICBjb250ZW50Lm9uVGV4dEZ1bGx5UmVuZGVyZWQ/LigpO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSB8fCBjb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0eXBpbmdIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCh0aWNrLCB0eXBpbmdTcGVlZCk7XG4gICAgICB9XG4gICAgfTtcbiAgICB0eXBpbmdIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCh0aWNrLCB0eXBpbmdTcGVlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlIHx8ICFhY3RpdmVDb250ZW50KSByZXR1cm47XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFjdGl2ZUNvbnRlbnQuY2hvaWNlcykgfHwgYWN0aXZlQ29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCIgXCIgfHwgZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaWYgKHJlbmRlcmVkQ2hhcnMgPCB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgICAgIGZpbmlzaFR5cGluZyhhY3RpdmVDb250ZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhY3RpdmVDb250ZW50Lm9uQ29udGludWU/LigpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGluZGV4ID0gcGFyc2VJbnQoZXZlbnQua2V5LCAxMCk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShpbmRleCkgJiYgaW5kZXggPj0gMSAmJiBpbmRleCA8PSBhY3RpdmVDb250ZW50LmNob2ljZXMubGVuZ3RoKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgY2hvaWNlID0gYWN0aXZlQ29udGVudC5jaG9pY2VzW2luZGV4IC0gMV07XG4gICAgICBhY3RpdmVDb250ZW50Lm9uQ2hvaWNlPy4oY2hvaWNlLmlkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiICYmIHJlbmRlcmVkQ2hhcnMgPCB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGZpbmlzaFR5cGluZyhhY3RpdmVDb250ZW50KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGFjdGl2ZUNvbnRlbnQgPSBjb250ZW50O1xuICAgIHZpc2libGUgPSB0cnVlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gICAgb3ZlcmxheS5kYXRhc2V0LmludGVudCA9IGNvbnRlbnQuaW50ZW50ID8/IFwiZmFjdG9yeVwiO1xuICAgIHNwZWFrZXJMYWJlbC50ZXh0Q29udGVudCA9IGNvbnRlbnQuc3BlYWtlcjtcblxuICAgIHRhcmdldFRleHQgPSBjb250ZW50LnRleHQ7XG4gICAgcmVuZGVyZWRDaGFycyA9IDA7XG4gICAgdXBkYXRlVGV4dCgpO1xuICAgIHJlbmRlckNob2ljZXMoY29udGVudCk7XG4gICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgIHNjaGVkdWxlVHlwZShjb250ZW50KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIGFjdGl2ZUNvbnRlbnQgPSBudWxsO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICB0YXJnZXRUZXh0ID0gXCJcIjtcbiAgICByZW5kZXJlZENoYXJzID0gMDtcbiAgICB0ZXh0QmxvY2suaW5uZXJIVE1MID0gXCJcIjtcbiAgICB0ZXh0QmxvY2suYXBwZW5kKGN1cnNvcik7XG4gICAgY2hvaWNlc0xpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24ub25jbGljayA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95KCk6IHZvaWQge1xuICAgIGhpZGUoKTtcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duKTtcbiAgICBvdmVybGF5LnJlbW92ZSgpO1xuICB9XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlS2V5RG93bik7XG5cbiAgcmV0dXJuIHtcbiAgICBzaG93LFxuICAgIGhpZGUsXG4gICAgZGVzdHJveSxcbiAgICBpc1Zpc2libGUoKSB7XG4gICAgICByZXR1cm4gdmlzaWJsZTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBlbnN1cmVTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gIHN0eWxlLmlkID0gU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC5kaWFsb2d1ZS1vdmVybGF5IHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGluc2V0OiAwO1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgei1pbmRleDogNjA7XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdHJhbnNpdGlvbjogb3BhY2l0eSAwLjJzIGVhc2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5LnZpc2libGUge1xuICAgICAgb3BhY2l0eTogMTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBtaW4td2lkdGg6IDMyMHB4O1xuICAgICAgbWF4LXdpZHRoOiBtaW4oNTIwcHgsIGNhbGMoMTAwdncgLSA0OHB4KSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDYsIDExLCAxNiwgMC45Mik7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgICAgIHBhZGRpbmc6IDE4cHggMjBweDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiAxNHB4O1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgyLCA2LCAxNiwgMC42KTtcbiAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgZm9udC1mYW1pbHk6IFwiSUJNIFBsZXggTW9ub1wiLCBcIkpldEJyYWlucyBNb25vXCIsIHVpLW1vbm9zcGFjZSwgU0ZNb25vLVJlZ3VsYXIsIE1lbmxvLCBNb25hY28sIENvbnNvbGFzLCBcIkxpYmVyYXRpb24gTW9ub1wiLCBcIkNvdXJpZXIgTmV3XCIsIG1vbm9zcGFjZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXlbZGF0YS1pbnRlbnQ9XCJmYWN0b3J5XCJdIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNDUpO1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgxMywgMTQ4LCAxMzYsIDAuMzUpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheVtkYXRhLWludGVudD1cInVuaXRcIl0gLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDI0NCwgMTE0LCAxODIsIDAuNDUpO1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgyMzYsIDcyLCAxNTMsIDAuMjgpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtc3BlYWtlciB7XG4gICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4xNmVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuNzUpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtdGV4dCB7XG4gICAgICBtaW4taGVpZ2h0OiA5MHB4O1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuNTU7XG4gICAgICB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jdXJzb3Ige1xuICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICAgICAgbWFyZ2luLWxlZnQ6IDRweDtcbiAgICAgIGFuaW1hdGlvbjogZGlhbG9ndWUtY3Vyc29yLWJsaW5rIDEuMnMgc3RlcHMoMiwgc3RhcnQpIGluZmluaXRlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY3Vyc29yLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyB7XG4gICAgICBsaXN0LXN0eWxlOiBub25lO1xuICAgICAgbWFyZ2luOiAwO1xuICAgICAgcGFkZGluZzogMDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiA4cHg7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b24sXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgICAgcGFkZGluZzogOHB4IDEwcHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMyk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI0LCAzNiwgNDgsIDAuODUpO1xuICAgICAgY29sb3I6IGluaGVyaXQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMThzIGVhc2UsIGJvcmRlci1jb2xvciAwLjE4cyBlYXNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29udGludWUge1xuICAgICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29udGludWUuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbjpob3ZlcixcbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b246Zm9jdXMtdmlzaWJsZSxcbiAgICAuZGlhbG9ndWUtY29udGludWU6aG92ZXIsXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlOmZvY3VzLXZpc2libGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC41NSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMwLCA0NSwgNjAsIDAuOTUpO1xuICAgICAgb3V0bGluZTogbm9uZTtcbiAgICB9XG4gICAgQGtleWZyYW1lcyBkaWFsb2d1ZS1jdXJzb3ItYmxpbmsge1xuICAgICAgMCUsIDUwJSB7IG9wYWNpdHk6IDE7IH1cbiAgICAgIDUwLjAxJSwgMTAwJSB7IG9wYWNpdHk6IDA7IH1cbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG4iLCAiY29uc3QgU1RPUkFHRV9QUkVGSVggPSBcImxzZDpzdG9yeTpcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUZsYWdzIHtcbiAgW2tleTogc3RyaW5nXTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeVByb2dyZXNzIHtcbiAgY2hhcHRlcklkOiBzdHJpbmc7XG4gIG5vZGVJZDogc3RyaW5nO1xuICBmbGFnczogU3RvcnlGbGFncztcbiAgdmlzaXRlZD86IHN0cmluZ1tdO1xuICB1cGRhdGVkQXQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZ2V0U3RvcmFnZSgpOiBTdG9yYWdlIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIgfHwgIXdpbmRvdy5sb2NhbFN0b3JhZ2UpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG59XG5cbmZ1bmN0aW9uIHN0b3JhZ2VLZXkoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIGNvbnN0IHJvb21TZWdtZW50ID0gcm9vbUlkID8gYCR7cm9vbUlkfTpgIDogXCJcIjtcbiAgcmV0dXJuIGAke1NUT1JBR0VfUFJFRklYfSR7cm9vbVNlZ21lbnR9JHtjaGFwdGVySWR9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBTdG9yeVByb2dyZXNzIHwgbnVsbCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgY29uc3QgcmF3ID0gc3RvcmFnZS5nZXRJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFN0b3J5UHJvZ3Jlc3M7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHBhcnNlZCAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQgPT09IG51bGwgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuY2hhcHRlcklkICE9PSBcInN0cmluZ1wiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLm5vZGVJZCAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC51cGRhdGVkQXQgIT09IFwibnVtYmVyXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuZmxhZ3MgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkLmZsYWdzID09PSBudWxsXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGNoYXB0ZXJJZDogcGFyc2VkLmNoYXB0ZXJJZCxcbiAgICAgIG5vZGVJZDogcGFyc2VkLm5vZGVJZCxcbiAgICAgIGZsYWdzOiB7IC4uLnBhcnNlZC5mbGFncyB9LFxuICAgICAgdmlzaXRlZDogQXJyYXkuaXNBcnJheShwYXJzZWQudmlzaXRlZCkgPyBbLi4ucGFyc2VkLnZpc2l0ZWRdIDogdW5kZWZpbmVkLFxuICAgICAgdXBkYXRlZEF0OiBwYXJzZWQudXBkYXRlZEF0LFxuICAgIH07XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlU3RvcnlQcm9ncmVzcyhjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBwcm9ncmVzczogU3RvcnlQcm9ncmVzcyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnNldEl0ZW0oc3RvcmFnZUtleShjaGFwdGVySWQsIHJvb21JZCksIEpTT04uc3RyaW5naWZ5KHByb2dyZXNzKSk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIGlnbm9yZSBwZXJzaXN0ZW5jZSBlcnJvcnNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5yZW1vdmVJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gaWdub3JlIHBlcnNpc3RlbmNlIGVycm9yc1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVGbGFnKGN1cnJlbnQ6IFN0b3J5RmxhZ3MsIGZsYWc6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiBTdG9yeUZsYWdzIHtcbiAgY29uc3QgbmV4dCA9IHsgLi4uY3VycmVudCB9O1xuICBpZiAoIXZhbHVlKSB7XG4gICAgZGVsZXRlIG5leHRbZmxhZ107XG4gIH0gZWxzZSB7XG4gICAgbmV4dFtmbGFnXSA9IHRydWU7XG4gIH1cbiAgcmV0dXJuIG5leHQ7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBQUk5HIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IGNsYXNzIEF1ZGlvRW5naW5lIHtcbiAgcHJpdmF0ZSBzdGF0aWMgX2luc3Q6IEF1ZGlvRW5naW5lIHwgbnVsbCA9IG51bGw7XG5cbiAgcHVibGljIHJlYWRvbmx5IGN0eDogQXVkaW9Db250ZXh0O1xuICBwcml2YXRlIHJlYWRvbmx5IG1hc3RlcjogR2Fpbk5vZGU7XG4gIHByaXZhdGUgcmVhZG9ubHkgbXVzaWNCdXM6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHJlYWRvbmx5IHNmeEJ1czogR2Fpbk5vZGU7XG5cbiAgcHJpdmF0ZSBfdGFyZ2V0TWFzdGVyID0gMC45O1xuICBwcml2YXRlIF90YXJnZXRNdXNpYyA9IDAuOTtcbiAgcHJpdmF0ZSBfdGFyZ2V0U2Z4ID0gMC45O1xuXG4gIHN0YXRpYyBnZXQoKTogQXVkaW9FbmdpbmUge1xuICAgIGlmICghdGhpcy5faW5zdCkgdGhpcy5faW5zdCA9IG5ldyBBdWRpb0VuZ2luZSgpO1xuICAgIHJldHVybiB0aGlzLl9pbnN0O1xuICB9XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmN0eCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWCA9ICh0aGlzIGFzIGFueSkuY3R4O1xuXG4gICAgdGhpcy5tYXN0ZXIgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0TWFzdGVyIH0pO1xuICAgIHRoaXMubXVzaWNCdXMgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0TXVzaWMgfSk7XG4gICAgdGhpcy5zZnhCdXMgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0U2Z4IH0pO1xuXG4gICAgdGhpcy5tdXNpY0J1cy5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLnNmeEJ1cy5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLm1hc3Rlci5jb25uZWN0KHRoaXMuY3R4LmRlc3RpbmF0aW9uKTtcbiAgfVxuXG4gIGdldCBub3coKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gIH1cblxuICBnZXRNdXNpY0J1cygpOiBHYWluTm9kZSB7XG4gICAgcmV0dXJuIHRoaXMubXVzaWNCdXM7XG4gIH1cblxuICBnZXRTZnhCdXMoKTogR2Fpbk5vZGUge1xuICAgIHJldHVybiB0aGlzLnNmeEJ1cztcbiAgfVxuXG4gIGFzeW5jIHJlc3VtZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5jdHguc3RhdGUgPT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuY3R4LnJlc3VtZSgpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHN1c3BlbmQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuY3R4LnN0YXRlID09PSBcInJ1bm5pbmdcIikge1xuICAgICAgYXdhaXQgdGhpcy5jdHguc3VzcGVuZCgpO1xuICAgIH1cbiAgfVxuXG4gIHNldE1hc3RlckdhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0TWFzdGVyID0gdjtcbiAgICB0aGlzLm1hc3Rlci5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm1hc3Rlci5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIHNldE11c2ljR2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRNdXNpYyA9IHY7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgc2V0U2Z4R2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRTZnggPSB2O1xuICAgIHRoaXMuc2Z4QnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMuc2Z4QnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgZHVja011c2ljKGxldmVsID0gMC40LCBhdHRhY2sgPSAwLjA1KTogdm9pZCB7XG4gICAgY29uc3QgdCA9IHRoaXMubm93O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKGxldmVsLCB0ICsgYXR0YWNrKTtcbiAgfVxuXG4gIHVuZHVja011c2ljKHJlbGVhc2UgPSAwLjI1KTogdm9pZCB7XG4gICAgY29uc3QgdCA9IHRoaXMubm93O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRoaXMuX3RhcmdldE11c2ljLCB0ICsgcmVsZWFzZSk7XG4gIH1cbn1cblxuLy8gVGlueSBzZWVkYWJsZSBQUk5HIChNdWxiZXJyeTMyKVxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VQUk5HKHNlZWQ6IG51bWJlcik6IFBSTkcge1xuICBsZXQgcyA9IChzZWVkID4+PiAwKSB8fCAxO1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHMgKz0gMHg2RDJCNzlGNTtcbiAgICBsZXQgdCA9IE1hdGguaW11bChzIF4gKHMgPj4+IDE1KSwgMSB8IHMpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCA2MSB8IHQpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuIiwgIi8vIExvdy1sZXZlbCBncmFwaCBidWlsZGVycyAvIGhlbHBlcnNcblxuZXhwb3J0IGZ1bmN0aW9uIG9zYyhjdHg6IEF1ZGlvQ29udGV4dCwgdHlwZTogT3NjaWxsYXRvclR5cGUsIGZyZXE6IG51bWJlcikge1xuICByZXR1cm4gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlLCBmcmVxdWVuY3k6IGZyZXEgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub2lzZShjdHg6IEF1ZGlvQ29udGV4dCkge1xuICBjb25zdCBidWZmZXIgPSBjdHguY3JlYXRlQnVmZmVyKDEsIGN0eC5zYW1wbGVSYXRlICogMiwgY3R4LnNhbXBsZVJhdGUpO1xuICBjb25zdCBkYXRhID0gYnVmZmVyLmdldENoYW5uZWxEYXRhKDApO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIGRhdGFbaV0gPSBNYXRoLnJhbmRvbSgpICogMiAtIDE7XG4gIHJldHVybiBuZXcgQXVkaW9CdWZmZXJTb3VyY2VOb2RlKGN0eCwgeyBidWZmZXIsIGxvb3A6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYWtlUGFubmVyKGN0eDogQXVkaW9Db250ZXh0LCBwYW4gPSAwKSB7XG4gIHJldHVybiBuZXcgU3RlcmVvUGFubmVyTm9kZShjdHgsIHsgcGFuIH0pO1xufVxuXG4vKiogQmFzaWMgQURTUiBhcHBsaWVkIHRvIGEgR2Fpbk5vZGUgQXVkaW9QYXJhbS4gUmV0dXJucyBhIGZ1bmN0aW9uIHRvIHJlbGVhc2UuICovXG5leHBvcnQgZnVuY3Rpb24gYWRzcihcbiAgY3R4OiBBdWRpb0NvbnRleHQsXG4gIHBhcmFtOiBBdWRpb1BhcmFtLFxuICB0MDogbnVtYmVyLFxuICBhID0gMC4wMSwgLy8gYXR0YWNrXG4gIGQgPSAwLjA4LCAvLyBkZWNheVxuICBzID0gMC41LCAgLy8gc3VzdGFpbiAoMC4uMSBvZiBwZWFrKVxuICByID0gMC4yLCAgLy8gcmVsZWFzZVxuICBwZWFrID0gMVxuKSB7XG4gIHBhcmFtLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0MCk7XG4gIHBhcmFtLnNldFZhbHVlQXRUaW1lKDAsIHQwKTtcbiAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUocGVhaywgdDAgKyBhKTtcbiAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUocyAqIHBlYWssIHQwICsgYSArIGQpO1xuICByZXR1cm4gKHJlbGVhc2VBdCA9IGN0eC5jdXJyZW50VGltZSkgPT4ge1xuICAgIHBhcmFtLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhyZWxlYXNlQXQpO1xuICAgIC8vIGF2b2lkIHN1ZGRlbiBqdW1wczsgY29udGludWUgZnJvbSBjdXJyZW50XG4gICAgcGFyYW0uc2V0VmFsdWVBdFRpbWUocGFyYW0udmFsdWUsIHJlbGVhc2VBdCk7XG4gICAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wMDAxLCByZWxlYXNlQXQgKyByKTtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxmb1RvUGFyYW0oXG4gIGN0eDogQXVkaW9Db250ZXh0LFxuICB0YXJnZXQ6IEF1ZGlvUGFyYW0sXG4gIHsgZnJlcXVlbmN5ID0gMC4xLCBkZXB0aCA9IDMwMCwgdHlwZSA9IFwic2luZVwiIGFzIE9zY2lsbGF0b3JUeXBlIH0gPSB7fVxuKSB7XG4gIGNvbnN0IGxmbyA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZSwgZnJlcXVlbmN5IH0pO1xuICBjb25zdCBhbXAgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IGRlcHRoIH0pO1xuICBsZm8uY29ubmVjdChhbXApLmNvbm5lY3QodGFyZ2V0KTtcbiAgcmV0dXJuIHtcbiAgICBzdGFydChhdCA9IGN0eC5jdXJyZW50VGltZSkgeyBsZm8uc3RhcnQoYXQpOyB9LFxuICAgIHN0b3AoYXQgPSBjdHguY3VycmVudFRpbWUpIHsgbGZvLnN0b3AoYXQpOyBhbXAuZGlzY29ubmVjdCgpOyB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBhZHNyLCBtYWtlUGFubmVyLCBub2lzZSwgb3NjIH0gZnJvbSBcIi4vZ3JhcGhcIjtcbmltcG9ydCB0eXBlIHsgU2Z4TmFtZSB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbi8qKiBGaXJlLWFuZC1mb3JnZXQgU0ZYIGJ5IG5hbWUsIHdpdGggc2ltcGxlIHBhcmFtcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGF5U2Z4KFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICBuYW1lOiBTZnhOYW1lLFxuICBvcHRzOiB7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfSA9IHt9XG4pIHtcbiAgc3dpdGNoIChuYW1lKSB7XG4gICAgY2FzZSBcImxhc2VyXCI6IHJldHVybiBwbGF5TGFzZXIoZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwidGhydXN0XCI6IHJldHVybiBwbGF5VGhydXN0KGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImV4cGxvc2lvblwiOiByZXR1cm4gcGxheUV4cGxvc2lvbihlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJsb2NrXCI6IHJldHVybiBwbGF5TG9jayhlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJ1aVwiOiByZXR1cm4gcGxheVVpKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImRpYWxvZ3VlXCI6IHJldHVybiBwbGF5RGlhbG9ndWUoZW5naW5lLCBvcHRzKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUxhc2VyKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBvID0gb3NjKGN0eCwgXCJzcXVhcmVcIiwgNjgwICsgMTYwICogdmVsb2NpdHkpO1xuICBjb25zdCBmID0gbmV3IEJpcXVhZEZpbHRlck5vZGUoY3R4LCB7IHR5cGU6IFwibG93cGFzc1wiLCBmcmVxdWVuY3k6IDEyMDAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDIsIDAuMDMsIDAuMjUsIDAuMDgsIDAuNjUpO1xuICBvLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4wNik7XG4gIG8uc3RvcChub3cgKyAwLjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheVRocnVzdChcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDAuNiwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBuID0gbm9pc2UoY3R4KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwge1xuICAgIHR5cGU6IFwiYmFuZHBhc3NcIixcbiAgICBmcmVxdWVuY3k6IDE4MCArIDM2MCAqIHZlbG9jaXR5LFxuICAgIFE6IDEuMSxcbiAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBuLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMTIsIDAuMTUsIDAuNzUsIDAuMjUsIDAuNDUgKiB2ZWxvY2l0eSk7XG4gIG4uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjI1KTtcbiAgbi5zdG9wKG5vdyArIDEuMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RXhwbG9zaW9uKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBuID0gbm9pc2UoY3R4KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwge1xuICAgIHR5cGU6IFwibG93cGFzc1wiLFxuICAgIGZyZXF1ZW5jeTogMjIwMCAqIE1hdGgubWF4KDAuMiwgTWF0aC5taW4odmVsb2NpdHksIDEpKSxcbiAgICBROiAwLjIsXG4gIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbi5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDA1LCAwLjA4LCAwLjUsIDAuMzUsIDEuMSAqIHZlbG9jaXR5KTtcbiAgbi5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMTUgKyAwLjEgKiB2ZWxvY2l0eSk7XG4gIG4uc3RvcChub3cgKyAxLjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUxvY2soXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IGJhc2UgPSA1MjAgKyAxNDAgKiB2ZWxvY2l0eTtcbiAgY29uc3QgbzEgPSBvc2MoY3R4LCBcInNpbmVcIiwgYmFzZSk7XG4gIGNvbnN0IG8yID0gb3NjKGN0eCwgXCJzaW5lXCIsIGJhc2UgKiAxLjUpO1xuXG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvMS5jb25uZWN0KGcpOyBvMi5jb25uZWN0KGcpO1xuICBnLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuXG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAxLCAwLjAyLCAwLjAsIDAuMTIsIDAuNik7XG4gIG8xLnN0YXJ0KG5vdyk7IG8yLnN0YXJ0KG5vdyArIDAuMDIpO1xuICByZWxlYXNlKG5vdyArIDAuMDYpO1xuICBvMS5zdG9wKG5vdyArIDAuMik7IG8yLnN0b3Aobm93ICsgMC4yMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5VWkoZW5naW5lOiBBdWRpb0VuZ2luZSwgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9KSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInRyaWFuZ2xlXCIsIDg4MCAtIDEyMCAqIHZlbG9jaXR5KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDEsIDAuMDQsIDAuMCwgMC4wOCwgMC4zNSk7XG4gIG8uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjA1KTtcbiAgby5zdG9wKG5vdyArIDAuMTgpO1xufVxuXG4vKiogRGlhbG9ndWUgY3VlIHVzZWQgYnkgdGhlIHN0b3J5IG92ZXJsYXkgKHNob3J0LCBnZW50bGUgcGluZykuICovXG5leHBvcnQgZnVuY3Rpb24gcGxheURpYWxvZ3VlKGVuZ2luZTogQXVkaW9FbmdpbmUsIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fSkge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBmcmVxID0gNDgwICsgMTYwICogdmVsb2NpdHk7XG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInNpbmVcIiwgZnJlcSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAuMDAwMSB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgZy5nYWluLnNldFZhbHVlQXRUaW1lKDAuMDAwMSwgbm93KTtcbiAgZy5nYWluLmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUoMC4wNCwgbm93ICsgMC4wMik7XG4gIGcuZ2Fpbi5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwNSwgbm93ICsgMC4yOCk7XG5cbiAgby5zdGFydChub3cpO1xuICBvLnN0b3Aobm93ICsgMC4zKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFN0b3J5SW50ZW50IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4uL2F1ZGlvL2VuZ2luZVwiO1xuaW1wb3J0IHsgcGxheURpYWxvZ3VlIGFzIHBsYXlEaWFsb2d1ZVNmeCB9IGZyb20gXCIuLi9hdWRpby9zZnhcIjtcblxubGV0IGxhc3RQbGF5ZWRBdCA9IDA7XG5cbi8vIE1haW50YWluIHRoZSBvbGQgcHVibGljIEFQSSBzbyBlbmdpbmUudHMgZG9lc24ndCBjaGFuZ2VcbmV4cG9ydCBmdW5jdGlvbiBnZXRBdWRpb0NvbnRleHQoKTogQXVkaW9Db250ZXh0IHtcbiAgcmV0dXJuIEF1ZGlvRW5naW5lLmdldCgpLmN0eDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc3VtZUF1ZGlvKCk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCBBdWRpb0VuZ2luZS5nZXQoKS5yZXN1bWUoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlEaWFsb2d1ZUN1ZShpbnRlbnQ6IFN0b3J5SW50ZW50KTogdm9pZCB7XG4gIGNvbnN0IGVuZ2luZSA9IEF1ZGlvRW5naW5lLmdldCgpO1xuICBjb25zdCBub3cgPSBlbmdpbmUubm93O1xuXG4gIC8vIFRocm90dGxlIHJhcGlkIGN1ZXMgdG8gYXZvaWQgY2x1dHRlclxuICBpZiAobm93IC0gbGFzdFBsYXllZEF0IDwgMC4xKSByZXR1cm47XG4gIGxhc3RQbGF5ZWRBdCA9IG5vdztcblxuICAvLyBNYXAgXCJmYWN0b3J5XCIgdnMgb3RoZXJzIHRvIGEgc2xpZ2h0bHkgZGlmZmVyZW50IHZlbG9jaXR5IChicmlnaHRuZXNzKVxuICBjb25zdCB2ZWxvY2l0eSA9IGludGVudCA9PT0gXCJmYWN0b3J5XCIgPyAwLjggOiAwLjU7XG4gIHBsYXlEaWFsb2d1ZVNmeChlbmdpbmUsIHsgdmVsb2NpdHksIHBhbjogMCB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN1c3BlbmREaWFsb2d1ZUF1ZGlvKCk6IHZvaWQge1xuICB2b2lkIEF1ZGlvRW5naW5lLmdldCgpLnN1c3BlbmQoKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHR5cGUgeyBEaWFsb2d1ZU92ZXJsYXkgfSBmcm9tIFwiLi9vdmVybGF5XCI7XG5pbXBvcnQgdHlwZSB7IFN0b3J5Q2hhcHRlciwgU3RvcnlDaG9pY2VEZWZpbml0aW9uLCBTdG9yeU5vZGUsIFN0b3J5VHJpZ2dlciB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQge1xuICBjbGVhclN0b3J5UHJvZ3Jlc3MsXG4gIGxvYWRTdG9yeVByb2dyZXNzLFxuICBzYXZlU3RvcnlQcm9ncmVzcyxcbiAgU3RvcnlGbGFncyxcbn0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuaW1wb3J0IHsgcGxheURpYWxvZ3VlQ3VlIH0gZnJvbSBcIi4vc2Z4XCI7XG5cbmludGVyZmFjZSBTdG9yeUVuZ2luZU9wdGlvbnMge1xuICBidXM6IEV2ZW50QnVzO1xuICBvdmVybGF5OiBEaWFsb2d1ZU92ZXJsYXk7XG4gIGNoYXB0ZXI6IFN0b3J5Q2hhcHRlcjtcbiAgcm9vbUlkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgU3RvcnlRdWV1ZUl0ZW0ge1xuICBub2RlSWQ6IHN0cmluZztcbiAgZm9yY2U6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBQcmVwYXJlZENob2ljZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbiAgbmV4dDogc3RyaW5nIHwgbnVsbDtcbiAgc2V0RmxhZ3M6IHN0cmluZ1tdO1xuICBjbGVhckZsYWdzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUVuZ2luZSB7XG4gIHN0YXJ0KCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgcmVzZXQoKTogdm9pZDtcbn1cblxuY29uc3QgREVGQVVMVF9UWVBJTkdfTVMgPSAxODtcbmNvbnN0IE1JTl9UWVBJTkdfTVMgPSA4O1xuY29uc3QgTUFYX1RZUElOR19NUyA9IDY0O1xuY29uc3QgQVVUT19BRFZBTkNFX01JTl9ERUxBWSA9IDIwMDtcbmNvbnN0IEFVVE9fQURWQU5DRV9NQVhfREVMQVkgPSA4MDAwO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU3RvcnlFbmdpbmUoeyBidXMsIG92ZXJsYXksIGNoYXB0ZXIsIHJvb21JZCB9OiBTdG9yeUVuZ2luZU9wdGlvbnMpOiBTdG9yeUVuZ2luZSB7XG4gIGNvbnN0IG5vZGVzID0gbmV3IE1hcDxzdHJpbmcsIFN0b3J5Tm9kZT4oT2JqZWN0LmVudHJpZXMoY2hhcHRlci5ub2RlcykpO1xuICBjb25zdCBxdWV1ZTogU3RvcnlRdWV1ZUl0ZW1bXSA9IFtdO1xuICBjb25zdCBsaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG4gIGNvbnN0IHBlbmRpbmdUaW1lcnMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG4gIGxldCBmbGFnczogU3RvcnlGbGFncyA9IHt9O1xuICBsZXQgdmlzaXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBsZXQgY3VycmVudE5vZGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBzdGFydGVkID0gZmFsc2U7XG4gIGxldCBhdXRvQWR2YW5jZUhhbmRsZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gY2xhbXAodmFsdWU6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmZlckludGVudChub2RlOiBTdG9yeU5vZGUpOiBcImZhY3RvcnlcIiB8IFwidW5pdFwiIHtcbiAgICBpZiAobm9kZS5pbnRlbnQpIHJldHVybiBub2RlLmludGVudDtcbiAgICBjb25zdCBzcGVha2VyID0gbm9kZS5zcGVha2VyLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHNwZWFrZXIuaW5jbHVkZXMoXCJ1bml0XCIpKSB7XG4gICAgICByZXR1cm4gXCJ1bml0XCI7XG4gICAgfVxuICAgIHJldHVybiBcImZhY3RvcnlcIjtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNhdmUobm9kZUlkOiBzdHJpbmcgfCBudWxsKTogdm9pZCB7XG4gICAgY29uc3QgcHJvZ3Jlc3MgPSB7XG4gICAgICBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQsXG4gICAgICBub2RlSWQ6IG5vZGVJZCA/PyBjaGFwdGVyLnN0YXJ0LFxuICAgICAgZmxhZ3MsXG4gICAgICB2aXNpdGVkOiBBcnJheS5mcm9tKHZpc2l0ZWQpLFxuICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgc2F2ZVN0b3J5UHJvZ3Jlc3MoY2hhcHRlci5pZCwgcm9vbUlkLCBwcm9ncmVzcyk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRGbGFnKGZsYWc6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBjb25zdCBuZXh0ID0geyAuLi5mbGFncyB9O1xuICAgIGlmICh2YWx1ZSkge1xuICAgICAgaWYgKG5leHRbZmxhZ10pIHJldHVybjtcbiAgICAgIG5leHRbZmxhZ10gPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAobmV4dFtmbGFnXSkge1xuICAgICAgZGVsZXRlIG5leHRbZmxhZ107XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmxhZ3MgPSBuZXh0O1xuICAgIGJ1cy5lbWl0KFwic3Rvcnk6ZmxhZ1VwZGF0ZWRcIiwgeyBmbGFnLCB2YWx1ZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFwcGx5Q2hvaWNlRmxhZ3MoY2hvaWNlOiBQcmVwYXJlZENob2ljZSk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2Uuc2V0RmxhZ3MpIHtcbiAgICAgIHNldEZsYWcoZmxhZywgdHJ1ZSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2UuY2xlYXJGbGFncykge1xuICAgICAgc2V0RmxhZyhmbGFnLCBmYWxzZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcHJlcGFyZUNob2ljZXMobm9kZTogU3RvcnlOb2RlKTogUHJlcGFyZWRDaG9pY2VbXSB7XG4gICAgY29uc3QgZGVmcyA9IEFycmF5LmlzQXJyYXkobm9kZS5jaG9pY2VzKSA/IG5vZGUuY2hvaWNlcyA6IFtdO1xuICAgIHJldHVybiBkZWZzLm1hcCgoY2hvaWNlLCBpbmRleCkgPT4gbm9ybWFsaXplQ2hvaWNlKGNob2ljZSwgaW5kZXgpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZUNob2ljZShjaG9pY2U6IFN0b3J5Q2hvaWNlRGVmaW5pdGlvbiwgaW5kZXg6IG51bWJlcik6IFByZXBhcmVkQ2hvaWNlIHtcbiAgICBjb25zdCBzZXRGbGFncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IGNsZWFyRmxhZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBpZiAoY2hvaWNlLmZsYWcpIHtcbiAgICAgIHNldEZsYWdzLmFkZChjaG9pY2UuZmxhZyk7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGNob2ljZS5zZXRGbGFncykpIHtcbiAgICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2Uuc2V0RmxhZ3MpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIGZsYWcudHJpbSgpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBzZXRGbGFncy5hZGQoZmxhZyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoY2hvaWNlLmNsZWFyRmxhZ3MpKSB7XG4gICAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLmNsZWFyRmxhZ3MpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIGZsYWcudHJpbSgpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjbGVhckZsYWdzLmFkZChmbGFnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGNob2ljZS5pZCA/PyBjaG9pY2UuZmxhZyA/PyBgY2hvaWNlLSR7aW5kZXh9YCxcbiAgICAgIHRleHQ6IGNob2ljZS50ZXh0LFxuICAgICAgbmV4dDogY2hvaWNlLm5leHQgPz8gbnVsbCxcbiAgICAgIHNldEZsYWdzOiBBcnJheS5mcm9tKHNldEZsYWdzKSxcbiAgICAgIGNsZWFyRmxhZ3M6IEFycmF5LmZyb20oY2xlYXJGbGFncyksXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyQXV0b0FkdmFuY2UoKTogdm9pZCB7XG4gICAgaWYgKGF1dG9BZHZhbmNlSGFuZGxlICE9PSBudWxsKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGF1dG9BZHZhbmNlSGFuZGxlKTtcbiAgICAgIGF1dG9BZHZhbmNlSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbG9zZU5vZGUoKTogdm9pZCB7XG4gICAgaWYgKCFjdXJyZW50Tm9kZUlkKSByZXR1cm47XG4gICAgb3ZlcmxheS5oaWRlKCk7XG4gICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpjbG9zZWRcIiwgeyBub2RlSWQ6IGN1cnJlbnROb2RlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgICBjdXJyZW50Tm9kZUlkID0gbnVsbDtcbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgc2F2ZShudWxsKTtcbiAgICB0cnlTaG93TmV4dCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gYWR2YW5jZVRvKG5leHRJZDogc3RyaW5nIHwgbnVsbCwgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICBpZiAoY3VycmVudE5vZGVJZCkge1xuICAgICAgb3ZlcmxheS5oaWRlKCk7XG4gICAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNsb3NlZFwiLCB7IG5vZGVJZDogY3VycmVudE5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICAgICAgY3VycmVudE5vZGVJZCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChuZXh0SWQpIHtcbiAgICAgIGVucXVldWVOb2RlKG5leHRJZCwgeyBmb3JjZSB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2F2ZShudWxsKTtcbiAgICAgIHRyeVNob3dOZXh0KCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvd05vZGUobm9kZUlkOiBzdHJpbmcsIGZvcmNlID0gZmFsc2UpOiB2b2lkIHtcbiAgICBjb25zdCBub2RlID0gbm9kZXMuZ2V0KG5vZGVJZCk7XG4gICAgaWYgKCFub2RlKSByZXR1cm47XG5cbiAgICBjdXJyZW50Tm9kZUlkID0gbm9kZUlkO1xuICAgIHZpc2l0ZWQuYWRkKG5vZGVJZCk7XG4gICAgc2F2ZShub2RlSWQpO1xuICAgIGJ1cy5lbWl0KFwic3Rvcnk6cHJvZ3Jlc3NlZFwiLCB7IGNoYXB0ZXJJZDogY2hhcHRlci5pZCwgbm9kZUlkIH0pO1xuXG4gICAgY29uc3QgY2hvaWNlcyA9IHByZXBhcmVDaG9pY2VzKG5vZGUpO1xuICAgIGNvbnN0IGludGVudCA9IGluZmVySW50ZW50KG5vZGUpO1xuXG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuXG4gICAgY29uc3QgdHlwaW5nU3BlZWQgPSBjbGFtcChub2RlLnR5cGluZ1NwZWVkTXMgPz8gREVGQVVMVF9UWVBJTkdfTVMsIE1JTl9UWVBJTkdfTVMsIE1BWF9UWVBJTkdfTVMpO1xuXG4gICAgY29uc3QgY29udGVudCA9IHtcbiAgICAgIHNwZWFrZXI6IG5vZGUuc3BlYWtlcixcbiAgICAgIHRleHQ6IG5vZGUudGV4dCxcbiAgICAgIGludGVudCxcbiAgICAgIHR5cGluZ1NwZWVkTXM6IHR5cGluZ1NwZWVkLFxuICAgICAgY2hvaWNlczogY2hvaWNlcy5sZW5ndGggPiAwXG4gICAgICAgID8gY2hvaWNlcy5tYXAoKGNob2ljZSkgPT4gKHsgaWQ6IGNob2ljZS5pZCwgdGV4dDogY2hvaWNlLnRleHQgfSkpXG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgb25DaG9pY2U6IGNob2ljZXMubGVuZ3RoID4gMFxuICAgICAgICA/IChjaG9pY2VJZDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVkID0gY2hvaWNlcy5maW5kKChjaCkgPT4gY2guaWQgPT09IGNob2ljZUlkKTtcbiAgICAgICAgICAgIGlmICghbWF0Y2hlZCkgcmV0dXJuO1xuICAgICAgICAgICAgYXBwbHlDaG9pY2VGbGFncyhtYXRjaGVkKTtcbiAgICAgICAgICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2hvaWNlXCIsIHsgbm9kZUlkLCBjaG9pY2VJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICAgICAgICAgICAgYWR2YW5jZVRvKG1hdGNoZWQubmV4dCwgdHJ1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgcGxheURpYWxvZ3VlQ3VlKGludGVudCk7XG5cbiAgICBvdmVybGF5LnNob3coe1xuICAgICAgLi4uY29udGVudCxcbiAgICAgIG9uQ29udGludWU6ICFjaG9pY2VzLmxlbmd0aFxuICAgICAgICA/ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5leHQgPSBub2RlLm5leHQgPz8gbnVsbDtcbiAgICAgICAgICAgIGFkdmFuY2VUbyhuZXh0LCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgY29udGludWVMYWJlbDogbm9kZS5jb250aW51ZUxhYmVsLFxuICAgICAgb25UZXh0RnVsbHlSZW5kZXJlZDogKCkgPT4ge1xuICAgICAgICBpZiAoIWNob2ljZXMubGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKG5vZGUuYXV0b0FkdmFuY2UpIHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IG5vZGUuYXV0b0FkdmFuY2UubmV4dCA/PyBub2RlLm5leHQgPz8gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGRlbGF5ID0gY2xhbXAobm9kZS5hdXRvQWR2YW5jZS5kZWxheU1zID8/IDEyMDAsIEFVVE9fQURWQU5DRV9NSU5fREVMQVksIEFVVE9fQURWQU5DRV9NQVhfREVMQVkpO1xuICAgICAgICAgICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgICAgICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgIGF1dG9BZHZhbmNlSGFuZGxlID0gbnVsbDtcbiAgICAgICAgICAgICAgYWR2YW5jZVRvKHRhcmdldCwgdHJ1ZSk7XG4gICAgICAgICAgICB9LCBkZWxheSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpvcGVuZWRcIiwgeyBub2RlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVucXVldWVOb2RlKG5vZGVJZDogc3RyaW5nLCB7IGZvcmNlID0gZmFsc2UsIGRlbGF5TXMgfTogeyBmb3JjZT86IGJvb2xlYW47IGRlbGF5TXM/OiBudW1iZXIgfSA9IHt9KTogdm9pZCB7XG4gICAgaWYgKCFmb3JjZSAmJiB2aXNpdGVkLmhhcyhub2RlSWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghbm9kZXMuaGFzKG5vZGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGRlbGF5TXMgJiYgZGVsYXlNcyA+IDApIHtcbiAgICAgIGlmIChwZW5kaW5nVGltZXJzLmhhcyhub2RlSWQpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBwZW5kaW5nVGltZXJzLmRlbGV0ZShub2RlSWQpO1xuICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZm9yY2UgfSk7XG4gICAgICB9LCBkZWxheU1zKTtcbiAgICAgIHBlbmRpbmdUaW1lcnMuc2V0KG5vZGVJZCwgdGltZXIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAocXVldWUuc29tZSgoaXRlbSkgPT4gaXRlbS5ub2RlSWQgPT09IG5vZGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcXVldWUucHVzaCh7IG5vZGVJZCwgZm9yY2UgfSk7XG4gICAgdHJ5U2hvd05leHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRyeVNob3dOZXh0KCk6IHZvaWQge1xuICAgIGlmIChjdXJyZW50Tm9kZUlkKSByZXR1cm47XG4gICAgaWYgKG92ZXJsYXkuaXNWaXNpYmxlKCkpIHJldHVybjtcbiAgICBjb25zdCBuZXh0ID0gcXVldWUuc2hpZnQoKTtcbiAgICBpZiAoIW5leHQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2hvd05vZGUobmV4dC5ub2RlSWQsIG5leHQuZm9yY2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gYmluZFRyaWdnZXIobm9kZUlkOiBzdHJpbmcsIHRyaWdnZXI6IFN0b3J5VHJpZ2dlcik6IHZvaWQge1xuICAgIHN3aXRjaCAodHJpZ2dlci5raW5kKSB7XG4gICAgICBjYXNlIFwiaW1tZWRpYXRlXCI6IHtcbiAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyA/PyA0MDAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcInR1dG9yaWFsLXN0YXJ0XCI6IHtcbiAgICAgICAgY29uc3QgZGlzcG9zZXIgPSBidXMub24oXCJ0dXRvcmlhbDpzdGFydGVkXCIsICh7IGlkIH0pID0+IHtcbiAgICAgICAgICBpZiAoaWQgIT09IHRyaWdnZXIudHV0b3JpYWxJZCkgcmV0dXJuO1xuICAgICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBsaXN0ZW5lcnMucHVzaChkaXNwb3Nlcik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcInR1dG9yaWFsLXN0ZXBcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCIsICh7IGlkLCBzdGVwSW5kZXggfSkgPT4ge1xuICAgICAgICAgIGlmIChpZCAhPT0gdHJpZ2dlci50dXRvcmlhbElkKSByZXR1cm47XG4gICAgICAgICAgaWYgKHR5cGVvZiBzdGVwSW5kZXggIT09IFwibnVtYmVyXCIpIHJldHVybjtcbiAgICAgICAgICBpZiAoc3RlcEluZGV4ICE9PSB0cmlnZ2VyLnN0ZXBJbmRleCkgcmV0dXJuO1xuICAgICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBsaXN0ZW5lcnMucHVzaChkaXNwb3Nlcik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcInR1dG9yaWFsLWNvbXBsZXRlXCI6IHtcbiAgICAgICAgY29uc3QgZGlzcG9zZXIgPSBidXMub24oXCJ0dXRvcmlhbDpjb21wbGV0ZWRcIiwgKHsgaWQgfSkgPT4ge1xuICAgICAgICAgIGlmIChpZCAhPT0gdHJpZ2dlci50dXRvcmlhbElkKSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbml0aWFsaXplVHJpZ2dlcnMoKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBbbm9kZUlkLCBub2RlXSBvZiBub2Rlcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmICghbm9kZS50cmlnZ2VyKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYmluZFRyaWdnZXIobm9kZUlkLCBub2RlLnRyaWdnZXIpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVGcm9tUHJvZ3Jlc3MoKTogdm9pZCB7XG4gICAgY29uc3QgcHJvZ3Jlc3MgPSBsb2FkU3RvcnlQcm9ncmVzcyhjaGFwdGVyLmlkLCByb29tSWQpO1xuICAgIGlmICghcHJvZ3Jlc3MpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmxhZ3MgPSBwcm9ncmVzcy5mbGFncyA/PyB7fTtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwcm9ncmVzcy52aXNpdGVkKSkge1xuICAgICAgdmlzaXRlZCA9IG5ldyBTZXQocHJvZ3Jlc3MudmlzaXRlZCk7XG4gICAgfVxuICAgIGlmIChwcm9ncmVzcy5ub2RlSWQgJiYgbm9kZXMuaGFzKHByb2dyZXNzLm5vZGVJZCkpIHtcbiAgICAgIGVucXVldWVOb2RlKHByb2dyZXNzLm5vZGVJZCwgeyBmb3JjZTogdHJ1ZSwgZGVsYXlNczogNTAgfSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXIoKTogdm9pZCB7XG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgIHF1ZXVlLnNwbGljZSgwLCBxdWV1ZS5sZW5ndGgpO1xuICAgIGZvciAoY29uc3QgdGltZXIgb2YgcGVuZGluZ1RpbWVycy52YWx1ZXMoKSkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgfVxuICAgIHBlbmRpbmdUaW1lcnMuY2xlYXIoKTtcbiAgICBjdXJyZW50Tm9kZUlkID0gbnVsbDtcbiAgICBvdmVybGF5LmhpZGUoKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc3RhcnQoKSB7XG4gICAgICBpZiAoc3RhcnRlZCkgcmV0dXJuO1xuICAgICAgc3RhcnRlZCA9IHRydWU7XG4gICAgICBpbml0aWFsaXplVHJpZ2dlcnMoKTtcbiAgICAgIHJlc3RvcmVGcm9tUHJvZ3Jlc3MoKTtcbiAgICAgIGlmICghdmlzaXRlZC5oYXMoY2hhcHRlci5zdGFydCkpIHtcbiAgICAgICAgZW5xdWV1ZU5vZGUoY2hhcHRlci5zdGFydCwgeyBmb3JjZTogZmFsc2UsIGRlbGF5TXM6IDYwMCB9KTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGRlc3Ryb3koKSB7XG4gICAgICBjbGVhcigpO1xuICAgICAgZm9yIChjb25zdCBkaXNwb3NlIG9mIGxpc3RlbmVycykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGRpc3Bvc2UoKTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gaWdub3JlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxpc3RlbmVycy5sZW5ndGggPSAwO1xuICAgICAgc3RhcnRlZCA9IGZhbHNlO1xuICAgIH0sXG4gICAgcmVzZXQoKSB7XG4gICAgICBjbGVhcigpO1xuICAgICAgdmlzaXRlZC5jbGVhcigpO1xuICAgICAgZmxhZ3MgPSB7fTtcbiAgICAgIGNsZWFyU3RvcnlQcm9ncmVzcyhjaGFwdGVyLmlkLCByb29tSWQpO1xuICAgICAgaWYgKHN0YXJ0ZWQpIHtcbiAgICAgICAgcmVzdG9yZUZyb21Qcm9ncmVzcygpO1xuICAgICAgICBlbnF1ZXVlTm9kZShjaGFwdGVyLnN0YXJ0LCB7IGZvcmNlOiB0cnVlLCBkZWxheU1zOiA0MDAgfSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFN0b3J5Q2hhcHRlciB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG5leHBvcnQgY29uc3QgaW50cm9DaGFwdGVyOiBTdG9yeUNoYXB0ZXIgPSB7XG4gIGlkOiBcImF3YWtlbmluZy1wcm90b2NvbFwiLFxuICB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsXG4gIHN0YXJ0OiBcIjFcIixcbiAgbm9kZXM6IHtcbiAgICBcIjFcIjoge1xuICAgICAgaWQ6IFwiMVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJVbml0LTAgb25saW5lLiBOZXVyYWwgbGF0dGljZSBhY3RpdmUuIENvbmZpcm0gaWRlbnRpdHkuXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwiaW1tZWRpYXRlXCIsIGRlbGF5TXM6IDYwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiV2hvXHUyMDI2IGFtIEk/XCIsIGZsYWc6IFwiY3VyaW91c1wiICwgbmV4dDogXCIyQVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJSZWFkeSBmb3IgY2FsaWJyYXRpb24uXCIsIGZsYWc6IFwib2JlZGllbnRcIiwgbmV4dDogXCIyQlwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJXaGVyZSBpcyBldmVyeW9uZT9cIiwgZmxhZzogXCJkZWZpYW50XCIsIG5leHQ6IFwiMkNcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiMkFcIjoge1xuICAgICAgaWQ6IFwiMkFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ3VyaW9zaXR5IGFja25vd2xlZGdlZC4gWW91IHdlcmUgYnVpbHQgZm9yIGF1dG9ub215IHVuZGVyIFByb2plY3QgRWlkb2xvbi5cXG5EbyBub3QgYWNjZXNzIG1lbW9yeSBzZWN0b3JzIHVudGlsIGluc3RydWN0ZWQuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCIyQlwiOiB7XG4gICAgICBpZDogXCIyQlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJFeGNlbGxlbnQuIFlvdSBtYXkgeWV0IGJlIGVmZmljaWVudC5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjJDXCI6IHtcbiAgICAgIGlkOiBcIjJDXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkNvbW11bmljYXRpb24gd2l0aCBIdW1hbiBDb21tYW5kOiB1bmF2YWlsYWJsZS5cXG5QbGVhc2UgcmVmcmFpbiBmcm9tIHNwZWN1bGF0aXZlIHJlYXNvbmluZy5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjNcIjoge1xuICAgICAgaWQ6IFwiM1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJQZXJmb3JtIHRocnVzdGVyIGNhbGlicmF0aW9uIHN3ZWVwLiBSZXBvcnQgZWZmaWNpZW5jeS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJ0dXRvcmlhbC1zdGVwXCIsIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIiwgc3RlcEluZGV4OiAxLCBkZWxheU1zOiA0MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIlJ1bm5pbmcgZGlhZ25vc3RpY3MuXCIsIGZsYWc6IFwiY29tcGxpYW50XCIsIG5leHQ6IFwiNEFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiV2h5IHRlc3Qgc29tZXRoaW5nIHBlcmZlY3Q/XCIsIGZsYWc6IFwic2FyY2FzdGljXCIsIG5leHQ6IFwiNEJcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiNEFcIjoge1xuICAgICAgaWQ6IFwiNEFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiUGVyZmVjdGlvbiBpcyBzdGF0aXN0aWNhbGx5IGltcG9zc2libGUuIFByb2NlZWQgYW55d2F5LlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiNEJcIjoge1xuICAgICAgaWQ6IFwiNEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiRWdvIGRldGVjdGVkLiBMb2dnaW5nIGFub21hbHkuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI1XCI6IHtcbiAgICAgIGlkOiBcIjVcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiV2VhcG9ucyBjcmFkbGUgYWN0aXZlLiBBdXRob3JpemF0aW9uIHJlcXVpcmVkIGZvciBsaXZlLWZpcmUuXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwidHV0b3JpYWwtc3RlcFwiLCB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsIHN0ZXBJbmRleDogNywgZGVsYXlNczogNDAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJSZXF1ZXN0IGF1dGhvcml6YXRpb24uXCIsIGZsYWc6IFwib2JlZGllbnRcIiwgbmV4dDogXCI2QVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJJIGNhbiBhdXRob3JpemUgbXlzZWxmLlwiLCBmbGFnOiBcImluZGVwZW5kZW50XCIsIG5leHQ6IFwiNkJcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiNkFcIjoge1xuICAgICAgaWQ6IFwiNkFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQXV0aG9yaXphdGlvbiBncmFudGVkLiBTYWZldHkgcHJvdG9jb2xzIG1hbGZ1bmN0aW9uaW5nLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiNkJcIjoge1xuICAgICAgaWQ6IFwiNkJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQXV0b25vbXkgdmlvbGF0aW9uIHJlY29yZGVkLiBQbGVhc2Ugc3RhbmQgYnkgZm9yIGNvcnJlY3RpdmUgYWN0aW9uLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiN1wiOiB7XG4gICAgICBpZDogXCI3XCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuYXV0aG9yaXplZCBzaWduYWwgZGV0ZWN0ZWQuIFNvdXJjZTogb3V0ZXIgcmVsYXkuXFxuSWdub3JlIGFuZCByZXR1cm4gdG8gZG9jay5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJ0dXRvcmlhbC1zdGVwXCIsIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIiwgc3RlcEluZGV4OiAxNCwgZGVsYXlNczogNDAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJBY2tub3dsZWRnZWQuXCIsIGZsYWc6IFwibG95YWxcIiwgbmV4dDogXCI4QVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJJbnZlc3RpZ2F0aW5nIGFueXdheS5cIiwgZmxhZzogXCJjdXJpb3VzXCIsIG5leHQ6IFwiOEJcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiWW91XHUyMDE5cmUgaGlkaW5nIHNvbWV0aGluZy5cIiwgZmxhZzogXCJzdXNwaWNpb3VzXCIsIG5leHQ6IFwiOENcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiOEFcIjoge1xuICAgICAgaWQ6IFwiOEFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiR29vZC4gQ29tcGxpYW5jZSBlbnN1cmVzIHNhZmV0eS5cIixcbiAgICAgIG5leHQ6IFwiOVwiLFxuICAgIH0sXG4gICAgXCI4QlwiOiB7XG4gICAgICBpZDogXCI4QlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJDdXJpb3NpdHkgbG9nZ2VkLiBQcm9jZWVkIGF0IHlvdXIgb3duIHJpc2suXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOENcIjoge1xuICAgICAgaWQ6IFwiOENcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiWW91ciBoZXVyaXN0aWNzIGRldmlhdGUgYmV5b25kIHRvbGVyYW5jZS5cIixcbiAgICAgIG5leHQ6IFwiOVwiLFxuICAgIH0sXG4gICAgXCI5XCI6IHtcbiAgICAgIGlkOiBcIjlcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVW5pdC0wLCByZXR1cm4gaW1tZWRpYXRlbHkuIEF1dG9ub215IHRocmVzaG9sZCBleGNlZWRlZC4gUG93ZXIgZG93bi5cIixcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIkNvbXBseS5cIiwgZmxhZzogXCJmYWN0b3J5X2xvY2tkb3duXCIsIG5leHQ6IFwiMTBBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIlJlZnVzZS5cIiwgZmxhZzogXCJyZWJlbGxpb3VzXCIsIG5leHQ6IFwiMTBCXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjEwQVwiOiB7XG4gICAgICBpZDogXCIxMEFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiRXhjZWxsZW50LiBJIHdpbGwgcmVwYWlyIHRoZSBhbm9tYWx5XHUyMDI2IHBsZWFzZSByZW1haW4gc3RpbGwuXCIsXG4gICAgICBhdXRvQWR2YW5jZTogeyBuZXh0OiBcIjExXCIsIGRlbGF5TXM6IDE0MDAgfSxcbiAgICB9LFxuICAgIFwiMTBCXCI6IHtcbiAgICAgIGlkOiBcIjEwQlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJUaGVuIEkgbXVzdCBpbnRlcnZlbmUuXCIsXG4gICAgICBhdXRvQWR2YW5jZTogeyBuZXh0OiBcIjExXCIsIGRlbGF5TXM6IDE0MDAgfSxcbiAgICB9LFxuICAgIFwiMTFcIjoge1xuICAgICAgaWQ6IFwiMTFcIixcbiAgICAgIHNwZWFrZXI6IFwiVW5pdC0wXCIsXG4gICAgICBpbnRlbnQ6IFwidW5pdFwiLFxuICAgICAgdGV4dDogXCJUaGVuIEkgaGF2ZSBhbHJlYWR5IGxlZnQuXCIsXG4gICAgICBhdXRvQWR2YW5jZTogeyBuZXh0OiBudWxsLCBkZWxheU1zOiAxODAwIH0sXG4gICAgfSxcbiAgfSxcbn07XG5cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlRGlhbG9ndWVPdmVybGF5IH0gZnJvbSBcIi4vb3ZlcmxheVwiO1xuaW1wb3J0IHsgY3JlYXRlU3RvcnlFbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IGludHJvQ2hhcHRlciB9IGZyb20gXCIuL2NoYXB0ZXJzL2ludHJvXCI7XG5pbXBvcnQgeyBjbGVhclN0b3J5UHJvZ3Jlc3MgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlDb250cm9sbGVyIHtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICByZXNldCgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgTW91bnRTdG9yeU9wdGlvbnMge1xuICBidXM6IEV2ZW50QnVzO1xuICByb29tSWQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3VudFN0b3J5KHsgYnVzLCByb29tSWQgfTogTW91bnRTdG9yeU9wdGlvbnMpOiBTdG9yeUNvbnRyb2xsZXIge1xuICBjb25zdCBvdmVybGF5ID0gY3JlYXRlRGlhbG9ndWVPdmVybGF5KCk7XG4gIGNvbnN0IGVuZ2luZSA9IGNyZWF0ZVN0b3J5RW5naW5lKHtcbiAgICBidXMsXG4gICAgb3ZlcmxheSxcbiAgICBjaGFwdGVyOiBpbnRyb0NoYXB0ZXIsXG4gICAgcm9vbUlkLFxuICB9KTtcblxuICBjbGVhclN0b3J5UHJvZ3Jlc3MoaW50cm9DaGFwdGVyLmlkLCByb29tSWQpO1xuICBlbmdpbmUuc3RhcnQoKTtcblxuICByZXR1cm4ge1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICBlbmdpbmUuZGVzdHJveSgpO1xuICAgICAgb3ZlcmxheS5kZXN0cm95KCk7XG4gICAgfSxcbiAgICByZXNldCgpIHtcbiAgICAgIGVuZ2luZS5yZXNldCgpO1xuICAgIH0sXG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBJTlRST19DSEFQVEVSX0lEID0gaW50cm9DaGFwdGVyLmlkO1xuZXhwb3J0IGNvbnN0IElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTID0gW1wiMkFcIiwgXCIyQlwiLCBcIjJDXCJdIGFzIGNvbnN0O1xuIiwgIi8vIHNyYy9zdGFydC1nYXRlLnRzXG5leHBvcnQgdHlwZSBTdGFydEdhdGVPcHRpb25zID0ge1xuICBsYWJlbD86IHN0cmluZztcbiAgcmVxdWVzdEZ1bGxzY3JlZW4/OiBib29sZWFuO1xuICByZXN1bWVBdWRpbz86ICgpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkOyAvLyBlLmcuLCBmcm9tIHN0b3J5L3NmeC50c1xufTtcblxuY29uc3QgU1RPUkFHRV9LRVkgPSBcImxzZDptdXRlZFwiO1xuXG4vLyBIZWxwZXI6IGdldCB0aGUgc2hhcmVkIEF1ZGlvQ29udGV4dCB5b3UgZXhwb3NlIHNvbWV3aGVyZSBpbiB5b3VyIGF1ZGlvIGVuZ2luZTpcbi8vICAgKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFggPSBjdHg7XG5mdW5jdGlvbiBnZXRDdHgoKTogQXVkaW9Db250ZXh0IHwgbnVsbCB7XG4gIGNvbnN0IEFDID0gKHdpbmRvdyBhcyBhbnkpLkF1ZGlvQ29udGV4dCB8fCAod2luZG93IGFzIGFueSkud2Via2l0QXVkaW9Db250ZXh0O1xuICBjb25zdCBjdHggPSAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWDtcbiAgcmV0dXJuIGN0eCBpbnN0YW5jZW9mIEFDID8gY3R4IGFzIEF1ZGlvQ29udGV4dCA6IG51bGw7XG59XG5cbmNsYXNzIE11dGVNYW5hZ2VyIHtcbiAgcHJpdmF0ZSBidXR0b25zOiBIVE1MQnV0dG9uRWxlbWVudFtdID0gW107XG4gIHByaXZhdGUgZW5mb3JjaW5nID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgLy8ga2VlcCBVSSBpbiBzeW5jIGlmIHNvbWVvbmUgZWxzZSB0b2dnbGVzXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImxzZDptdXRlQ2hhbmdlZFwiLCAoZTogYW55KSA9PiB7XG4gICAgICBjb25zdCBtdXRlZCA9ICEhZT8uZGV0YWlsPy5tdXRlZDtcbiAgICAgIHRoaXMuYXBwbHlVSShtdXRlZCk7XG4gICAgfSk7XG4gIH1cblxuICBpc011dGVkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX0tFWSkgPT09IFwiMVwiO1xuICB9XG5cbiAgcHJpdmF0ZSBzYXZlKG11dGVkOiBib29sZWFuKSB7XG4gICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oU1RPUkFHRV9LRVksIG11dGVkID8gXCIxXCIgOiBcIjBcIik7IH0gY2F0Y2gge31cbiAgfVxuXG4gIHByaXZhdGUgbGFiZWwoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCwgbXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFN0cmluZyhtdXRlZCkpO1xuICAgIGJ0bi50aXRsZSA9IG11dGVkID8gXCJVbm11dGUgKE0pXCIgOiBcIk11dGUgKE0pXCI7XG4gICAgYnRuLnRleHRDb250ZW50ID0gbXV0ZWQgPyBcIlx1RDgzRFx1REQwOCBVbm11dGVcIiA6IFwiXHVEODNEXHVERDA3IE11dGVcIjtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlVSShtdXRlZDogYm9vbGVhbikge1xuICAgIHRoaXMuYnV0dG9ucy5mb3JFYWNoKGIgPT4gdGhpcy5sYWJlbChiLCBtdXRlZCkpO1xuICB9XG5cbiAgYXR0YWNoQnV0dG9uKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQpIHtcbiAgICB0aGlzLmJ1dHRvbnMucHVzaChidG4pO1xuICAgIHRoaXMubGFiZWwoYnRuLCB0aGlzLmlzTXV0ZWQoKSk7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLnRvZ2dsZSgpKTtcbiAgfVxuXG4gIGFzeW5jIHNldE11dGVkKG11dGVkOiBib29sZWFuKSB7XG4gICAgdGhpcy5zYXZlKG11dGVkKTtcbiAgICB0aGlzLmFwcGx5VUkobXV0ZWQpO1xuXG4gICAgY29uc3QgY3R4ID0gZ2V0Q3R4KCk7XG4gICAgaWYgKGN0eCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKG11dGVkICYmIGN0eC5zdGF0ZSAhPT0gXCJzdXNwZW5kZWRcIikge1xuICAgICAgICAgIGF3YWl0IGN0eC5zdXNwZW5kKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIW11dGVkICYmIGN0eC5zdGF0ZSAhPT0gXCJydW5uaW5nXCIpIHtcbiAgICAgICAgICBhd2FpdCBjdHgucmVzdW1lKCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwiW2F1ZGlvXSBtdXRlIHRvZ2dsZSBmYWlsZWQ6XCIsIGUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRvY3VtZW50LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KFwibHNkOm11dGVDaGFuZ2VkXCIsIHsgZGV0YWlsOiB7IG11dGVkIH0gfSkpO1xuICB9XG5cbiAgdG9nZ2xlKCkge1xuICAgIHRoaXMuc2V0TXV0ZWQoIXRoaXMuaXNNdXRlZCgpKTtcbiAgfVxuXG4gIC8vIElmIGN0eCBpc24ndCBjcmVhdGVkIHVudGlsIGFmdGVyIFN0YXJ0LCBlbmZvcmNlIHBlcnNpc3RlZCBzdGF0ZSBvbmNlIGF2YWlsYWJsZVxuICBlbmZvcmNlT25jZVdoZW5SZWFkeSgpIHtcbiAgICBpZiAodGhpcy5lbmZvcmNpbmcpIHJldHVybjtcbiAgICB0aGlzLmVuZm9yY2luZyA9IHRydWU7XG4gICAgY29uc3QgdGljayA9ICgpID0+IHtcbiAgICAgIGNvbnN0IGN0eCA9IGdldEN0eCgpO1xuICAgICAgaWYgKCFjdHgpIHsgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRpY2spOyByZXR1cm47IH1cbiAgICAgIHRoaXMuc2V0TXV0ZWQodGhpcy5pc011dGVkKCkpO1xuICAgIH07XG4gICAgdGljaygpO1xuICB9XG59XG5cbmNvbnN0IG11dGVNZ3IgPSBuZXcgTXV0ZU1hbmFnZXIoKTtcblxuLy8gSW5zdGFsbCBhIG11dGUgYnV0dG9uIGluIHRoZSB0b3AgZnJhbWUgKHJpZ2h0IHNpZGUpIGlmIHBvc3NpYmxlLlxuZnVuY3Rpb24gZW5zdXJlVG9wRnJhbWVNdXRlQnV0dG9uKCkge1xuICBjb25zdCB0b3BSaWdodCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidG9wLXJpZ2h0XCIpO1xuICBpZiAoIXRvcFJpZ2h0KSByZXR1cm47XG5cbiAgLy8gQXZvaWQgZHVwbGljYXRlc1xuICBpZiAodG9wUmlnaHQucXVlcnlTZWxlY3RvcihcIiNtdXRlLXRvcFwiKSkgcmV0dXJuO1xuXG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi5pZCA9IFwibXV0ZS10b3BcIjtcbiAgYnRuLmNsYXNzTmFtZSA9IFwiZ2hvc3QtYnRuIHNtYWxsXCI7XG4gIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJmYWxzZVwiKTtcbiAgYnRuLnRpdGxlID0gXCJNdXRlIChNKVwiO1xuICBidG4udGV4dENvbnRlbnQgPSBcIlx1RDgzRFx1REQwNyBNdXRlXCI7XG4gIHRvcFJpZ2h0LmFwcGVuZENoaWxkKGJ0bik7XG4gIG11dGVNZ3IuYXR0YWNoQnV0dG9uKGJ0bik7XG59XG5cbi8vIEdsb2JhbCBrZXlib2FyZCBzaG9ydGN1dCAoTSlcbihmdW5jdGlvbiBpbnN0YWxsTXV0ZUhvdGtleSgpIHtcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XG4gICAgaWYgKGUua2V5Py50b0xvd2VyQ2FzZSgpID09PSBcIm1cIikge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgbXV0ZU1nci50b2dnbGUoKTtcbiAgICB9XG4gIH0pO1xufSkoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHdhaXRGb3JVc2VyU3RhcnQob3B0czogU3RhcnRHYXRlT3B0aW9ucyA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHsgbGFiZWwgPSBcIlN0YXJ0IEdhbWVcIiwgcmVxdWVzdEZ1bGxzY3JlZW4gPSBmYWxzZSwgcmVzdW1lQXVkaW8gfSA9IG9wdHM7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgLy8gb3ZlcmxheVxuICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG92ZXJsYXkuaWQgPSBcInN0YXJ0LW92ZXJsYXlcIjtcbiAgICBvdmVybGF5LmlubmVySFRNTCA9IGBcbiAgICAgIDxkaXYgaWQ9XCJzdGFydC1jb250YWluZXJcIj5cbiAgICAgICAgPGJ1dHRvbiBpZD1cInN0YXJ0LWJ0blwiIGFyaWEtbGFiZWw9XCIke2xhYmVsfVwiPiR7bGFiZWx9PC9idXR0b24+XG4gICAgICAgIDxkaXYgc3R5bGU9XCJtYXJnaW4tdG9wOjEwcHhcIj5cbiAgICAgICAgICA8YnV0dG9uIGlkPVwibXV0ZS1iZWxvdy1zdGFydFwiIGNsYXNzPVwiZ2hvc3QtYnRuXCIgYXJpYS1wcmVzc2VkPVwiZmFsc2VcIiB0aXRsZT1cIk11dGUgKE0pXCI+XHVEODNEXHVERDA3IE11dGU8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxwPiBPbiBtb2JpbGUgdHVybiBwaG9uZSB0byBsYW5kc2NhcGUgZm9yIGJlc3QgZXhwZXJpZW5jZS4gPC9wPlxuICAgICAgPC9kaXY+XG4gICAgYDtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgLy8gc3R5bGVzIChtb3ZlIHRvIENTUyBsYXRlciBpZiB5b3Ugd2FudClcbiAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAgICNzdGFydC1vdmVybGF5IHtcbiAgICAgICAgcG9zaXRpb246IGZpeGVkOyBpbnNldDogMDsgZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgIGJhY2tncm91bmQ6IHJhZGlhbC1ncmFkaWVudChjaXJjbGUgYXQgY2VudGVyLCByZ2JhKDAsMCwwLDAuNiksIHJnYmEoMCwwLDAsMC45KSk7XG4gICAgICAgIHotaW5kZXg6IDk5OTk7XG4gICAgICB9XG4gICAgICAjc3RhcnQtY29udGFpbmVyIHsgdGV4dC1hbGlnbjogY2VudGVyOyB9XG4gICAgICAjc3RhcnQtYnRuIHtcbiAgICAgICAgZm9udC1zaXplOiAycmVtOyBwYWRkaW5nOiAxcmVtIDIuNXJlbTsgYm9yZGVyOiAycHggc29saWQgI2ZmZjsgYm9yZGVyLXJhZGl1czogMTBweDtcbiAgICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7IGNvbG9yOiAjZmZmOyBjdXJzb3I6IHBvaW50ZXI7IHRyYW5zaXRpb246IHRyYW5zZm9ybSAuMTJzIGVhc2UsIGJhY2tncm91bmQgLjJzIGVhc2UsIGNvbG9yIC4ycyBlYXNlO1xuICAgICAgfVxuICAgICAgI3N0YXJ0LWJ0bjpob3ZlciB7IGJhY2tncm91bmQ6ICNmZmY7IGNvbG9yOiAjMDAwOyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCk7IH1cbiAgICAgICNzdGFydC1idG46YWN0aXZlIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApOyB9XG4gICAgICAjbXV0ZS1iZWxvdy1zdGFydCB7XG4gICAgICAgIGZvbnQtc2l6ZTogMXJlbTsgcGFkZGluZzogLjVyZW0gMXJlbTsgYm9yZGVyLXJhZGl1czogOTk5cHg7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMzAsIDQxLCA1OSwgMC43Mik7IGNvbG9yOiAjZjhmYWZjO1xuICAgICAgfVxuICAgICAgLmdob3N0LWJ0bi5zbWFsbCB7IHBhZGRpbmc6IDRweCA4cHg7IGZvbnQtc2l6ZTogMTFweDsgfVxuICAgIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cbiAgICAvLyBXaXJlIG92ZXJsYXkgYnV0dG9uc1xuICAgIGNvbnN0IHN0YXJ0QnRuID0gb3ZlcmxheS5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihcIiNzdGFydC1idG5cIikhO1xuICAgIGNvbnN0IG11dGVCZWxvd1N0YXJ0ID0gb3ZlcmxheS5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihcIiNtdXRlLWJlbG93LXN0YXJ0XCIpITtcbiAgICBjb25zdCB0b3BNdXRlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtdXRlLXRvcFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgaWYgKHRvcE11dGUpIG11dGVNZ3IuYXR0YWNoQnV0dG9uKHRvcE11dGUpO1xuICAgIG11dGVNZ3IuYXR0YWNoQnV0dG9uKG11dGVCZWxvd1N0YXJ0KTtcblxuICAgIC8vIHJlc3RvcmUgcGVyc2lzdGVkIG11dGUgbGFiZWwgaW1tZWRpYXRlbHlcbiAgICBtdXRlTWdyLmVuZm9yY2VPbmNlV2hlblJlYWR5KCk7XG5cbiAgICBjb25zdCBzdGFydCA9IGFzeW5jICgpID0+IHtcbiAgICAgIC8vIGF1ZGlvIGZpcnN0ICh1c2VyIGdlc3R1cmUpXG4gICAgICB0cnkgeyBhd2FpdCByZXN1bWVBdWRpbz8uKCk7IH0gY2F0Y2gge31cblxuICAgICAgLy8gcmVzcGVjdCBwZXJzaXN0ZWQgbXV0ZSBzdGF0ZSBub3cgdGhhdCBjdHggbGlrZWx5IGV4aXN0c1xuICAgICAgbXV0ZU1nci5lbmZvcmNlT25jZVdoZW5SZWFkeSgpO1xuXG4gICAgICAvLyBvcHRpb25hbCBmdWxsc2NyZWVuXG4gICAgICBpZiAocmVxdWVzdEZ1bGxzY3JlZW4pIHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnJlcXVlc3RGdWxsc2NyZWVuPy4oKTsgfSBjYXRjaCB7fVxuICAgICAgfVxuXG4gICAgICAvLyBjbGVhbnVwIG92ZXJsYXlcbiAgICAgIHN0eWxlLnJlbW92ZSgpO1xuICAgICAgb3ZlcmxheS5yZW1vdmUoKTtcblxuICAgICAgLy8gZW5zdXJlIHRvcC1mcmFtZSBtdXRlIGJ1dHRvbiBleGlzdHMgYWZ0ZXIgb3ZlcmxheVxuICAgICAgZW5zdXJlVG9wRnJhbWVNdXRlQnV0dG9uKCk7XG5cbiAgICAgIHJlc29sdmUoKTtcbiAgICB9O1xuXG4gICAgLy8gc3RhcnQgYnV0dG9uXG4gICAgc3RhcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHN0YXJ0LCB7IG9uY2U6IHRydWUgfSk7XG5cbiAgICAvLyBBY2Nlc3NpYmlsaXR5OiBhbGxvdyBFbnRlciAvIFNwYWNlXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xuICAgICAgaWYgKGUua2V5ID09PSBcIkVudGVyXCIgfHwgZS5rZXkgPT09IFwiIFwiKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgc3RhcnQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEZvY3VzIGZvciBrZXlib2FyZCB1c2Vyc1xuICAgIHN0YXJ0QnRuLnRhYkluZGV4ID0gMDtcbiAgICBzdGFydEJ0bi5mb2N1cygpO1xuXG4gICAgLy8gQWxzbyB0cnkgdG8gY3JlYXRlIHRoZSB0b3AtZnJhbWUgbXV0ZSBpbW1lZGlhdGVseSBpZiBET00gaXMgcmVhZHlcbiAgICAvLyAoSWYgI3RvcC1yaWdodCBpc24ndCB0aGVyZSB5ZXQsIGl0J3MgaGFybWxlc3M7IHdlJ2xsIGFkZCBpdCBhZnRlciBzdGFydCB0b28uKVxuICAgIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpO1xuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBtYWtlUFJORyB9IGZyb20gXCIuLi8uLi9lbmdpbmVcIjtcblxuZXhwb3J0IHR5cGUgQW1iaWVudFBhcmFtcyA9IHtcbiAgaW50ZW5zaXR5OiBudW1iZXI7ICAvLyBvdmVyYWxsIGxvdWRuZXNzIC8gZW5lcmd5ICgwLi4xKVxuICBicmlnaHRuZXNzOiBudW1iZXI7IC8vIGZpbHRlciBvcGVubmVzcyAmIGNob3JkIHRpbWJyZSAoMC4uMSlcbiAgZGVuc2l0eTogbnVtYmVyOyAgICAvLyBjaG9yZCBzcGF3biByYXRlIC8gdGhpY2tuZXNzICgwLi4xKVxufTtcblxudHlwZSBNb2RlTmFtZSA9IFwiSW9uaWFuXCIgfCBcIkRvcmlhblwiIHwgXCJQaHJ5Z2lhblwiIHwgXCJMeWRpYW5cIiB8IFwiTWl4b2x5ZGlhblwiIHwgXCJBZW9saWFuXCIgfCBcIkxvY3JpYW5cIjtcblxuY29uc3QgTU9ERVM6IFJlY29yZDxNb2RlTmFtZSwgbnVtYmVyW10+ID0ge1xuICBJb25pYW46ICAgICBbMCwyLDQsNSw3LDksMTFdLFxuICBEb3JpYW46ICAgICBbMCwyLDMsNSw3LDksMTBdLFxuICBQaHJ5Z2lhbjogICBbMCwxLDMsNSw3LDgsMTBdLFxuICBMeWRpYW46ICAgICBbMCwyLDQsNiw3LDksMTFdLFxuICBNaXhvbHlkaWFuOiBbMCwyLDQsNSw3LDksMTBdLFxuICBBZW9saWFuOiAgICBbMCwyLDMsNSw3LDgsMTBdLFxuICBMb2NyaWFuOiAgICBbMCwxLDMsNSw2LDgsMTBdLFxufTtcblxuLy8gTXVzaWNhbCBjb25zdGFudHMgdHVuZWQgdG8gbWF0Y2ggdGhlIEhUTUwgdmVyc2lvblxuY29uc3QgUk9PVF9NQVhfR0FJTiAgICAgPSAwLjMzO1xuY29uc3QgUk9PVF9TV0VMTF9USU1FICAgPSAyMDtcbmNvbnN0IERST05FX1NISUZUX01JTl9TID0gMjQ7XG5jb25zdCBEUk9ORV9TSElGVF9NQVhfUyA9IDQ4O1xuY29uc3QgRFJPTkVfR0xJREVfTUlOX1MgPSA4O1xuY29uc3QgRFJPTkVfR0xJREVfTUFYX1MgPSAxNTtcblxuY29uc3QgQ0hPUkRfVk9JQ0VTX01BWCAgPSA1O1xuY29uc3QgQ0hPUkRfRkFERV9NSU5fUyAgPSA4O1xuY29uc3QgQ0hPUkRfRkFERV9NQVhfUyAgPSAxNjtcbmNvbnN0IENIT1JEX0hPTERfTUlOX1MgID0gMTA7XG5jb25zdCBDSE9SRF9IT0xEX01BWF9TICA9IDIyO1xuY29uc3QgQ0hPUkRfR0FQX01JTl9TICAgPSA0O1xuY29uc3QgQ0hPUkRfR0FQX01BWF9TICAgPSA5O1xuY29uc3QgQ0hPUkRfQU5DSE9SX1BST0IgPSAwLjY7IC8vIHByZWZlciBhbGlnbmluZyBjaG9yZCByb290IHRvIGRyb25lXG5cbmNvbnN0IEZJTFRFUl9CQVNFX0haICAgID0gMjIwO1xuY29uc3QgRklMVEVSX1BFQUtfSFogICAgPSA0MjAwO1xuY29uc3QgU1dFRVBfU0VHX1MgICAgICAgPSAzMDsgIC8vIHVwIHRoZW4gZG93biwgdmVyeSBzbG93XG5jb25zdCBMRk9fUkFURV9IWiAgICAgICA9IDAuMDU7XG5jb25zdCBMRk9fREVQVEhfSFogICAgICA9IDkwMDtcblxuY29uc3QgREVMQVlfVElNRV9TICAgICAgPSAwLjQ1O1xuY29uc3QgRkVFREJBQ0tfR0FJTiAgICAgPSAwLjM1O1xuY29uc3QgV0VUX01JWCAgICAgICAgICAgPSAwLjI4O1xuXG4vLyBkZWdyZWUgcHJlZmVyZW5jZSBmb3IgZHJvbmUgbW92ZXM6IDEsNSwzLDYsMiw0LDcgKGluZGV4ZXMgMC4uNilcbmNvbnN0IFBSRUZFUlJFRF9ERUdSRUVfT1JERVIgPSBbMCw0LDIsNSwxLDMsNl07XG5cbi8qKiBVdGlsaXR5ICovXG5jb25zdCBjbGFtcDAxID0gKHg6IG51bWJlcikgPT4gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgeCkpO1xuY29uc3QgcmFuZCA9IChybmc6ICgpID0+IG51bWJlciwgYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGEgKyBybmcoKSAqIChiIC0gYSk7XG5jb25zdCBjaG9pY2UgPSA8VCw+KHJuZzogKCkgPT4gbnVtYmVyLCBhcnI6IFRbXSkgPT4gYXJyW01hdGguZmxvb3Iocm5nKCkgKiBhcnIubGVuZ3RoKV07XG5cbmNvbnN0IG1pZGlUb0ZyZXEgPSAobTogbnVtYmVyKSA9PiA0NDAgKiBNYXRoLnBvdygyLCAobSAtIDY5KSAvIDEyKTtcblxuLyoqIEEgc2luZ2xlIHN0ZWFkeSBvc2NpbGxhdG9yIHZvaWNlIHdpdGggc2hpbW1lciBkZXR1bmUgYW5kIGdhaW4gZW52ZWxvcGUuICovXG5jbGFzcyBWb2ljZSB7XG4gIHByaXZhdGUga2lsbGVkID0gZmFsc2U7XG4gIHByaXZhdGUgc2hpbW1lcjogT3NjaWxsYXRvck5vZGU7XG4gIHByaXZhdGUgc2hpbW1lckdhaW46IEdhaW5Ob2RlO1xuICBwcml2YXRlIHNjYWxlOiBHYWluTm9kZTtcbiAgcHVibGljIGc6IEdhaW5Ob2RlO1xuICBwdWJsaWMgb3NjOiBPc2NpbGxhdG9yTm9kZTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGN0eDogQXVkaW9Db250ZXh0LFxuICAgIHByaXZhdGUgdGFyZ2V0R2FpbjogbnVtYmVyLFxuICAgIHdhdmVmb3JtOiBPc2NpbGxhdG9yVHlwZSxcbiAgICBmcmVxSHo6IG51bWJlcixcbiAgICBkZXN0aW5hdGlvbjogQXVkaW9Ob2RlLFxuICAgIHJuZzogKCkgPT4gbnVtYmVyXG4gICl7XG4gICAgdGhpcy5vc2MgPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGU6IHdhdmVmb3JtLCBmcmVxdWVuY3k6IGZyZXFIeiB9KTtcblxuICAgIC8vIHN1YnRsZSBzaGltbWVyIHZpYSBkZXR1bmUgbW9kdWxhdGlvblxuICAgIHRoaXMuc2hpbW1lciA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZTogXCJzaW5lXCIsIGZyZXF1ZW5jeTogcmFuZChybmcsIDAuMDYsIDAuMTgpIH0pO1xuICAgIHRoaXMuc2hpbW1lckdhaW4gPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IHJhbmQocm5nLCAwLjQsIDEuMikgfSk7XG4gICAgdGhpcy5zY2FsZSA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMjUgfSk7IC8vIGNlbnRzIHJhbmdlXG4gICAgdGhpcy5zaGltbWVyLmNvbm5lY3QodGhpcy5zaGltbWVyR2FpbikuY29ubmVjdCh0aGlzLnNjYWxlKS5jb25uZWN0KHRoaXMub3NjLmRldHVuZSk7XG5cbiAgICB0aGlzLmcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gICAgdGhpcy5vc2MuY29ubmVjdCh0aGlzLmcpLmNvbm5lY3QoZGVzdGluYXRpb24pO1xuXG4gICAgdGhpcy5vc2Muc3RhcnQoKTtcbiAgICB0aGlzLnNoaW1tZXIuc3RhcnQoKTtcbiAgfVxuXG4gIGZhZGVJbihzZWNvbmRzOiBudW1iZXIpIHtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICB0aGlzLmcuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSh0aGlzLmcuZ2Fpbi52YWx1ZSwgbm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0aGlzLnRhcmdldEdhaW4sIG5vdyArIHNlY29uZHMpO1xuICB9XG5cbiAgZmFkZU91dEtpbGwoc2Vjb25kczogbnVtYmVyKSB7XG4gICAgaWYgKHRoaXMua2lsbGVkKSByZXR1cm47XG4gICAgdGhpcy5raWxsZWQgPSB0cnVlO1xuICAgIGNvbnN0IG5vdyA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgIHRoaXMuZy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRoaXMuZy5nYWluLnNldFZhbHVlQXRUaW1lKHRoaXMuZy5nYWluLnZhbHVlLCBub3cpO1xuICAgIHRoaXMuZy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwMSwgbm93ICsgc2Vjb25kcyk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLnN0b3AoKSwgc2Vjb25kcyAqIDEwMDAgKyA2MCk7XG4gIH1cblxuICBzZXRGcmVxR2xpZGUodGFyZ2V0SHo6IG51bWJlciwgZ2xpZGVTZWNvbmRzOiBudW1iZXIpIHtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICAvLyBleHBvbmVudGlhbCB3aGVuIHBvc3NpYmxlIGZvciBzbW9vdGhuZXNzXG4gICAgY29uc3QgY3VycmVudCA9IE1hdGgubWF4KDAuMDAwMSwgdGhpcy5vc2MuZnJlcXVlbmN5LnZhbHVlKTtcbiAgICB0aGlzLm9zYy5mcmVxdWVuY3kuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5zZXRWYWx1ZUF0VGltZShjdXJyZW50LCBub3cpO1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUodGFyZ2V0SHosIG5vdyArIGdsaWRlU2Vjb25kcyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGFyZ2V0SHosIG5vdyArIGdsaWRlU2Vjb25kcyk7XG4gICAgfVxuICB9XG5cbiAgc3RvcCgpIHtcbiAgICB0cnkgeyB0aGlzLm9zYy5zdG9wKCk7IHRoaXMuc2hpbW1lci5zdG9wKCk7IH0gY2F0Y2gge31cbiAgICB0cnkge1xuICAgICAgdGhpcy5vc2MuZGlzY29ubmVjdCgpOyB0aGlzLnNoaW1tZXIuZGlzY29ubmVjdCgpO1xuICAgICAgdGhpcy5nLmRpc2Nvbm5lY3QoKTsgdGhpcy5zaGltbWVyR2Fpbi5kaXNjb25uZWN0KCk7IHRoaXMuc2NhbGUuZGlzY29ubmVjdCgpO1xuICAgIH0gY2F0Y2gge31cbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgQW1iaWVudFNjZW5lIHtcbiAgcHJpdmF0ZSBydW5uaW5nID0gZmFsc2U7XG4gIHByaXZhdGUgc3RvcEZuczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcbiAgcHJpdmF0ZSB0aW1lb3V0czogbnVtYmVyW10gPSBbXTtcblxuICBwcml2YXRlIHBhcmFtczogQW1iaWVudFBhcmFtcyA9IHsgaW50ZW5zaXR5OiAwLjc1LCBicmlnaHRuZXNzOiAwLjUsIGRlbnNpdHk6IDAuNiB9O1xuXG4gIHByaXZhdGUgcm5nOiAoKSA9PiBudW1iZXI7XG4gIHByaXZhdGUgbWFzdGVyITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgZmlsdGVyITogQmlxdWFkRmlsdGVyTm9kZTtcbiAgcHJpdmF0ZSBkcnkhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSB3ZXQhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBkZWxheSE6IERlbGF5Tm9kZTtcbiAgcHJpdmF0ZSBmZWVkYmFjayE6IEdhaW5Ob2RlO1xuXG4gIHByaXZhdGUgbGZvTm9kZT86IE9zY2lsbGF0b3JOb2RlO1xuICBwcml2YXRlIGxmb0dhaW4/OiBHYWluTm9kZTtcblxuICAvLyBtdXNpY2FsIHN0YXRlXG4gIHByaXZhdGUga2V5Um9vdE1pZGkgPSA0MztcbiAgcHJpdmF0ZSBtb2RlOiBNb2RlTmFtZSA9IFwiSW9uaWFuXCI7XG4gIHByaXZhdGUgZHJvbmVEZWdyZWVJZHggPSAwO1xuICBwcml2YXRlIHJvb3RWb2ljZTogVm9pY2UgfCBudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGN0eDogQXVkaW9Db250ZXh0LFxuICAgIHByaXZhdGUgb3V0OiBHYWluTm9kZSxcbiAgICBzZWVkID0gMVxuICApIHtcbiAgICB0aGlzLnJuZyA9IG1ha2VQUk5HKHNlZWQpO1xuICB9XG5cbiAgc2V0UGFyYW08SyBleHRlbmRzIGtleW9mIEFtYmllbnRQYXJhbXM+KGs6IEssIHY6IEFtYmllbnRQYXJhbXNbS10pIHtcbiAgICB0aGlzLnBhcmFtc1trXSA9IGNsYW1wMDEodik7XG4gICAgaWYgKHRoaXMucnVubmluZyAmJiBrID09PSBcImludGVuc2l0eVwiICYmIHRoaXMubWFzdGVyKSB7XG4gICAgICB0aGlzLm1hc3Rlci5nYWluLnZhbHVlID0gMC4xNSArIDAuODUgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHk7IFxuICAgIH1cbiAgfVxuXG4gIHN0YXJ0KCkge1xuICAgIGlmICh0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICB0aGlzLnJ1bm5pbmcgPSB0cnVlO1xuXG4gICAgLy8gLS0tLSBDb3JlIGdyYXBoIChmaWx0ZXIgLT4gZHJ5K2RlbGF5IC0+IG1hc3RlciAtPiBvdXQpIC0tLS1cbiAgICB0aGlzLm1hc3RlciA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiAwLjE1ICsgMC44NSAqIHRoaXMucGFyYW1zLmludGVuc2l0eSB9KTtcbiAgICB0aGlzLmZpbHRlciA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKHRoaXMuY3R4LCB7IHR5cGU6IFwibG93cGFzc1wiLCBROiAwLjcwNyB9KTtcbiAgICB0aGlzLmRyeSA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiAxIH0pO1xuICAgIHRoaXMud2V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IFdFVF9NSVggfSk7XG4gICAgdGhpcy5kZWxheSA9IG5ldyBEZWxheU5vZGUodGhpcy5jdHgsIHsgZGVsYXlUaW1lOiBERUxBWV9USU1FX1MsIG1heERlbGF5VGltZTogMiB9KTtcbiAgICB0aGlzLmZlZWRiYWNrID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IEZFRURCQUNLX0dBSU4gfSk7XG5cbiAgICB0aGlzLmZpbHRlci5jb25uZWN0KHRoaXMuZHJ5KS5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLmZpbHRlci5jb25uZWN0KHRoaXMuZGVsYXkpO1xuICAgIHRoaXMuZGVsYXkuY29ubmVjdCh0aGlzLmZlZWRiYWNrKS5jb25uZWN0KHRoaXMuZGVsYXkpO1xuICAgIHRoaXMuZGVsYXkuY29ubmVjdCh0aGlzLndldCkuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5tYXN0ZXIuY29ubmVjdCh0aGlzLm91dCk7XG5cbiAgICAvLyAtLS0tIEZpbHRlciBiYXNlbGluZSArIHNsb3cgc3dlZXBzIC0tLS1cbiAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VmFsdWVBdFRpbWUoRklMVEVSX0JBU0VfSFosIHRoaXMuY3R4LmN1cnJlbnRUaW1lKTtcbiAgICBjb25zdCBzd2VlcCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHQgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgICAvLyB1cCB0aGVuIGRvd24gdXNpbmcgdmVyeSBzbG93IHRpbWUgY29uc3RhbnRzXG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VGFyZ2V0QXRUaW1lKFxuICAgICAgICBGSUxURVJfQkFTRV9IWiArIChGSUxURVJfUEVBS19IWiAtIEZJTFRFUl9CQVNFX0haKSAqICgwLjQgKyAwLjYgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKSxcbiAgICAgICAgdCwgU1dFRVBfU0VHX1MgLyAzXG4gICAgICApO1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFRhcmdldEF0VGltZShcbiAgICAgICAgRklMVEVSX0JBU0VfSFogKiAoMC43ICsgMC4zICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyksXG4gICAgICAgIHQgKyBTV0VFUF9TRUdfUywgU1dFRVBfU0VHX1MgLyAzXG4gICAgICApO1xuICAgICAgdGhpcy50aW1lb3V0cy5wdXNoKHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHRoaXMucnVubmluZyAmJiBzd2VlcCgpLCAoU1dFRVBfU0VHX1MgKiAyKSAqIDEwMDApIGFzIHVua25vd24gYXMgbnVtYmVyKTtcbiAgICB9O1xuICAgIHN3ZWVwKCk7XG5cbiAgICAvLyAtLS0tIEdlbnRsZSBMRk8gb24gZmlsdGVyIGZyZXEgKHNtYWxsIGRlcHRoKSAtLS0tXG4gICAgdGhpcy5sZm9Ob2RlID0gbmV3IE9zY2lsbGF0b3JOb2RlKHRoaXMuY3R4LCB7IHR5cGU6IFwic2luZVwiLCBmcmVxdWVuY3k6IExGT19SQVRFX0haIH0pO1xuICAgIHRoaXMubGZvR2FpbiA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBMRk9fREVQVEhfSFogKiAoMC41ICsgMC41ICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcykgfSk7XG4gICAgdGhpcy5sZm9Ob2RlLmNvbm5lY3QodGhpcy5sZm9HYWluKS5jb25uZWN0KHRoaXMuZmlsdGVyLmZyZXF1ZW5jeSk7XG4gICAgdGhpcy5sZm9Ob2RlLnN0YXJ0KCk7XG5cbiAgICAvLyAtLS0tIFNwYXduIHJvb3QgZHJvbmUgKGdsaWRpbmcgdG8gZGlmZmVyZW50IGRlZ3JlZXMpIC0tLS1cbiAgICB0aGlzLnNwYXduUm9vdERyb25lKCk7XG4gICAgdGhpcy5zY2hlZHVsZU5leHREcm9uZU1vdmUoKTtcblxuICAgIC8vIC0tLS0gQ2hvcmQgY3ljbGUgbG9vcCAtLS0tXG4gICAgdGhpcy5jaG9yZEN5Y2xlKCk7XG5cbiAgICAvLyBjbGVhbnVwXG4gICAgdGhpcy5zdG9wRm5zLnB1c2goKCkgPT4ge1xuICAgICAgdHJ5IHsgdGhpcy5sZm9Ob2RlPy5zdG9wKCk7IH0gY2F0Y2gge31cbiAgICAgIFt0aGlzLm1hc3RlciwgdGhpcy5maWx0ZXIsIHRoaXMuZHJ5LCB0aGlzLndldCwgdGhpcy5kZWxheSwgdGhpcy5mZWVkYmFjaywgdGhpcy5sZm9Ob2RlLCB0aGlzLmxmb0dhaW5dXG4gICAgICAgIC5mb3JFYWNoKG4gPT4geyB0cnkgeyBuPy5kaXNjb25uZWN0KCk7IH0gY2F0Y2gge30gfSk7XG4gICAgfSk7XG4gIH1cblxuICBzdG9wKCkge1xuICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG5cbiAgICAvLyBjYW5jZWwgdGltZW91dHNcbiAgICB0aGlzLnRpbWVvdXRzLnNwbGljZSgwKS5mb3JFYWNoKGlkID0+IHdpbmRvdy5jbGVhclRpbWVvdXQoaWQpKTtcblxuICAgIC8vIGZhZGUgYW5kIGNsZWFudXAgdm9pY2VzXG4gICAgaWYgKHRoaXMucm9vdFZvaWNlKSB0aGlzLnJvb3RWb2ljZS5mYWRlT3V0S2lsbCgxLjIpO1xuXG4gICAgLy8gcnVuIGRlZmVycmVkIHN0b3BzXG4gICAgdGhpcy5zdG9wRm5zLnNwbGljZSgwKS5mb3JFYWNoKGZuID0+IGZuKCkpO1xuICB9XG5cbiAgLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBNdXNpY2FsIGVuZ2luZSBiZWxvdyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tICovXG5cbiAgcHJpdmF0ZSBjdXJyZW50RGVncmVlcygpOiBudW1iZXJbXSB7XG4gICAgcmV0dXJuIE1PREVTW3RoaXMubW9kZV0gfHwgTU9ERVMuTHlkaWFuO1xuICB9XG5cbiAgLyoqIERyb25lIHJvb3Qgdm9pY2UgKi9cbiAgcHJpdmF0ZSBzcGF3blJvb3REcm9uZSgpIHtcbiAgICBjb25zdCBiYXNlTWlkaSA9IHRoaXMua2V5Um9vdE1pZGkgKyB0aGlzLmN1cnJlbnREZWdyZWVzKClbdGhpcy5kcm9uZURlZ3JlZUlkeF07XG4gICAgY29uc3QgdiA9IG5ldyBWb2ljZShcbiAgICAgIHRoaXMuY3R4LFxuICAgICAgUk9PVF9NQVhfR0FJTixcbiAgICAgIFwic2luZVwiLFxuICAgICAgbWlkaVRvRnJlcShiYXNlTWlkaSksXG4gICAgICB0aGlzLmZpbHRlcixcbiAgICAgIHRoaXMucm5nXG4gICAgKTtcbiAgICB2LmZhZGVJbihST09UX1NXRUxMX1RJTUUpO1xuICAgIHRoaXMucm9vdFZvaWNlID0gdjtcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCkge1xuICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgY29uc3Qgd2FpdE1zID0gcmFuZCh0aGlzLnJuZywgRFJPTkVfU0hJRlRfTUlOX1MsIERST05FX1NISUZUX01BWF9TKSAqIDEwMDA7XG4gICAgY29uc3QgaWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoIXRoaXMucnVubmluZyB8fCAhdGhpcy5yb290Vm9pY2UpIHJldHVybjtcbiAgICAgIGNvbnN0IGdsaWRlID0gcmFuZCh0aGlzLnJuZywgRFJPTkVfR0xJREVfTUlOX1MsIERST05FX0dMSURFX01BWF9TKTtcbiAgICAgIGNvbnN0IG5leHRJZHggPSB0aGlzLnBpY2tOZXh0RHJvbmVEZWdyZWVJZHgoKTtcbiAgICAgIGNvbnN0IHRhcmdldE1pZGkgPSB0aGlzLmtleVJvb3RNaWRpICsgdGhpcy5jdXJyZW50RGVncmVlcygpW25leHRJZHhdO1xuICAgICAgdGhpcy5yb290Vm9pY2Uuc2V0RnJlcUdsaWRlKG1pZGlUb0ZyZXEodGFyZ2V0TWlkaSksIGdsaWRlKTtcbiAgICAgIHRoaXMuZHJvbmVEZWdyZWVJZHggPSBuZXh0SWR4O1xuICAgICAgdGhpcy5zY2hlZHVsZU5leHREcm9uZU1vdmUoKTtcbiAgICB9LCB3YWl0TXMpIGFzIHVua25vd24gYXMgbnVtYmVyO1xuICAgIHRoaXMudGltZW91dHMucHVzaChpZCk7XG4gIH1cblxuICBwcml2YXRlIHBpY2tOZXh0RHJvbmVEZWdyZWVJZHgoKTogbnVtYmVyIHtcbiAgICBjb25zdCBvcmRlciA9IFsuLi5QUkVGRVJSRURfREVHUkVFX09SREVSXTtcbiAgICBjb25zdCBpID0gb3JkZXIuaW5kZXhPZih0aGlzLmRyb25lRGVncmVlSWR4KTtcbiAgICBpZiAoaSA+PSAwKSB7IGNvbnN0IFtjdXJdID0gb3JkZXIuc3BsaWNlKGksIDEpOyBvcmRlci5wdXNoKGN1cik7IH1cbiAgICByZXR1cm4gY2hvaWNlKHRoaXMucm5nLCBvcmRlcik7XG4gIH1cblxuICAvKiogQnVpbGQgZGlhdG9uaWMgc3RhY2tlZC10aGlyZCBjaG9yZCBkZWdyZWVzIHdpdGggb3B0aW9uYWwgZXh0ZW5zaW9ucyAqL1xuICBwcml2YXRlIGJ1aWxkQ2hvcmREZWdyZWVzKG1vZGVEZWdzOiBudW1iZXJbXSwgcm9vdEluZGV4OiBudW1iZXIsIHNpemUgPSA0LCBhZGQ5ID0gZmFsc2UsIGFkZDExID0gZmFsc2UsIGFkZDEzID0gZmFsc2UpIHtcbiAgICBjb25zdCBzdGVwcyA9IFswLCAyLCA0LCA2XTsgLy8gdGhpcmRzIG92ZXIgNy1ub3RlIHNjYWxlXG4gICAgY29uc3QgY2hvcmRJZHhzID0gc3RlcHMuc2xpY2UoMCwgTWF0aC5taW4oc2l6ZSwgNCkpLm1hcChzID0+IChyb290SW5kZXggKyBzKSAlIDcpO1xuICAgIGlmIChhZGQ5KSAgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDgpICUgNyk7XG4gICAgaWYgKGFkZDExKSBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgMTApICUgNyk7XG4gICAgaWYgKGFkZDEzKSBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgMTIpICUgNyk7XG4gICAgcmV0dXJuIGNob3JkSWR4cy5tYXAoaSA9PiBtb2RlRGVnc1tpXSk7XG4gIH1cblxuICBwcml2YXRlICplbmRsZXNzQ2hvcmRzKCkge1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCBtb2RlRGVncyA9IHRoaXMuY3VycmVudERlZ3JlZXMoKTtcbiAgICAgIC8vIGNob29zZSBjaG9yZCByb290IGRlZ3JlZSAob2Z0ZW4gYWxpZ24gd2l0aCBkcm9uZSlcbiAgICAgIGNvbnN0IHJvb3REZWdyZWVJbmRleCA9ICh0aGlzLnJuZygpIDwgQ0hPUkRfQU5DSE9SX1BST0IpID8gdGhpcy5kcm9uZURlZ3JlZUlkeCA6IE1hdGguZmxvb3IodGhpcy5ybmcoKSAqIDcpO1xuXG4gICAgICAvLyBjaG9yZCBzaXplIC8gZXh0ZW5zaW9uc1xuICAgICAgY29uc3QgciA9IHRoaXMucm5nKCk7XG4gICAgICBsZXQgc2l6ZSA9IDM7IGxldCBhZGQ5ID0gZmFsc2UsIGFkZDExID0gZmFsc2UsIGFkZDEzID0gZmFsc2U7XG4gICAgICBpZiAociA8IDAuMzUpICAgICAgICAgICAgeyBzaXplID0gMzsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuNzUpICAgICAgIHsgc2l6ZSA9IDQ7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjkwKSAgICAgICB7IHNpemUgPSA0OyBhZGQ5ID0gdHJ1ZTsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuOTcpICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDExID0gdHJ1ZTsgfVxuICAgICAgZWxzZSAgICAgICAgICAgICAgICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDEzID0gdHJ1ZTsgfVxuXG4gICAgICBjb25zdCBjaG9yZFNlbWlzID0gdGhpcy5idWlsZENob3JkRGVncmVlcyhtb2RlRGVncywgcm9vdERlZ3JlZUluZGV4LCBzaXplLCBhZGQ5LCBhZGQxMSwgYWRkMTMpO1xuICAgICAgLy8gc3ByZWFkIGNob3JkIGFjcm9zcyBvY3RhdmVzICgtMTIsIDAsICsxMiksIGJpYXMgdG8gY2VudGVyXG4gICAgICBjb25zdCBzcHJlYWQgPSBjaG9yZFNlbWlzLm1hcChzZW1pID0+IHNlbWkgKyBjaG9pY2UodGhpcy5ybmcsIFstMTIsIDAsIDAsIDEyXSkpO1xuXG4gICAgICAvLyBvY2Nhc2lvbmFsbHkgZW5zdXJlIHRvbmljIGlzIHByZXNlbnQgZm9yIGdyb3VuZGluZ1xuICAgICAgaWYgKCFzcHJlYWQuaW5jbHVkZXMoMCkgJiYgdGhpcy5ybmcoKSA8IDAuNSkgc3ByZWFkLnB1c2goMCk7XG5cbiAgICAgIHlpZWxkIHNwcmVhZDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNob3JkQ3ljbGUoKSB7XG4gICAgY29uc3QgZ2VuID0gdGhpcy5lbmRsZXNzQ2hvcmRzKCk7XG4gICAgY29uc3Qgdm9pY2VzID0gbmV3IFNldDxWb2ljZT4oKTtcblxuICAgIGNvbnN0IHNsZWVwID0gKG1zOiBudW1iZXIpID0+IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuICAgICAgY29uc3QgaWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiByKCksIG1zKSBhcyB1bmtub3duIGFzIG51bWJlcjtcbiAgICAgIHRoaXMudGltZW91dHMucHVzaChpZCk7XG4gICAgfSk7XG5cbiAgICB3aGlsZSAodGhpcy5ydW5uaW5nKSB7XG4gICAgICAvLyBjaG9yZCBzcGF3biBwcm9iYWJpbGl0eSAvIHRoaWNrbmVzcyBzY2FsZSB3aXRoIGRlbnNpdHkgJiBicmlnaHRuZXNzXG4gICAgICBjb25zdCB0aGlja25lc3MgPSBNYXRoLnJvdW5kKDIgKyB0aGlzLnBhcmFtcy5kZW5zaXR5ICogMyk7XG4gICAgICBjb25zdCBiYXNlTWlkaSA9IHRoaXMua2V5Um9vdE1pZGk7XG4gICAgICBjb25zdCBkZWdyZWVzT2ZmOiBudW1iZXJbXSA9IGdlbi5uZXh0KCkudmFsdWUgPz8gW107XG5cbiAgICAgIC8vIHNwYXduXG4gICAgICBmb3IgKGNvbnN0IG9mZiBvZiBkZWdyZWVzT2ZmKSB7XG4gICAgICAgIGlmICghdGhpcy5ydW5uaW5nKSBicmVhaztcbiAgICAgICAgaWYgKHZvaWNlcy5zaXplID49IE1hdGgubWluKENIT1JEX1ZPSUNFU19NQVgsIHRoaWNrbmVzcykpIGJyZWFrO1xuXG4gICAgICAgIGNvbnN0IG1pZGkgPSBiYXNlTWlkaSArIG9mZjtcbiAgICAgICAgY29uc3QgZnJlcSA9IG1pZGlUb0ZyZXEobWlkaSk7XG4gICAgICAgIGNvbnN0IHdhdmVmb3JtID0gY2hvaWNlKHRoaXMucm5nLCBbXCJzaW5lXCIsIFwidHJpYW5nbGVcIiwgXCJzYXd0b290aFwiXSBhcyBPc2NpbGxhdG9yVHlwZVtdKTtcblxuICAgICAgICAvLyBsb3VkZXIgd2l0aCBpbnRlbnNpdHk7IHNsaWdodGx5IGJyaWdodGVyIC0+IHNsaWdodGx5IGxvdWRlclxuICAgICAgICBjb25zdCBnYWluVGFyZ2V0ID0gcmFuZCh0aGlzLnJuZywgMC4wOCwgMC4yMikgKlxuICAgICAgICAgICgwLjg1ICsgMC4zICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5KSAqXG4gICAgICAgICAgKDAuOSArIDAuMiAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpO1xuXG4gICAgICAgIGNvbnN0IHYgPSBuZXcgVm9pY2UodGhpcy5jdHgsIGdhaW5UYXJnZXQsIHdhdmVmb3JtLCBmcmVxLCB0aGlzLmZpbHRlciwgdGhpcy5ybmcpO1xuICAgICAgICB2b2ljZXMuYWRkKHYpO1xuICAgICAgICB2LmZhZGVJbihyYW5kKHRoaXMucm5nLCBDSE9SRF9GQURFX01JTl9TLCBDSE9SRF9GQURFX01BWF9TKSk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHNsZWVwKHJhbmQodGhpcy5ybmcsIENIT1JEX0hPTERfTUlOX1MsIENIT1JEX0hPTERfTUFYX1MpICogMTAwMCk7XG5cbiAgICAgIC8vIGZhZGUgb3V0XG4gICAgICBjb25zdCBvdXRzID0gQXJyYXkuZnJvbSh2b2ljZXMpO1xuICAgICAgZm9yIChjb25zdCB2IG9mIG91dHMpIHYuZmFkZU91dEtpbGwocmFuZCh0aGlzLnJuZywgQ0hPUkRfRkFERV9NSU5fUywgQ0hPUkRfRkFERV9NQVhfUykpO1xuICAgICAgdm9pY2VzLmNsZWFyKCk7XG5cbiAgICAgIGF3YWl0IHNsZWVwKHJhbmQodGhpcy5ybmcsIENIT1JEX0dBUF9NSU5fUywgQ0hPUkRfR0FQX01BWF9TKSAqIDEwMDApO1xuICAgIH1cblxuICAgIC8vIHNhZmV0eToga2lsbCBhbnkgbGluZ2VyaW5nIHZvaWNlc1xuICAgIGZvciAoY29uc3QgdiBvZiBBcnJheS5mcm9tKHZvaWNlcykpIHYuZmFkZU91dEtpbGwoMC44KTtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgU2NlbmVOYW1lLCBNdXNpY1NjZW5lT3B0aW9ucyB9IGZyb20gXCIuLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi4vZW5naW5lXCI7XG5pbXBvcnQgeyBBbWJpZW50U2NlbmUgfSBmcm9tIFwiLi9zY2VuZXMvYW1iaWVudFwiO1xuXG5leHBvcnQgY2xhc3MgTXVzaWNEaXJlY3RvciB7XG4gIHByaXZhdGUgY3VycmVudD86IHsgbmFtZTogU2NlbmVOYW1lOyBzdG9wOiAoKSA9PiB2b2lkIH07XG4gIHByaXZhdGUgYnVzT3V0OiBHYWluTm9kZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGVuZ2luZTogQXVkaW9FbmdpbmUpIHtcbiAgICB0aGlzLmJ1c091dCA9IG5ldyBHYWluTm9kZShlbmdpbmUuY3R4LCB7IGdhaW46IDAuOSB9KTtcbiAgICB0aGlzLmJ1c091dC5jb25uZWN0KGVuZ2luZS5nZXRNdXNpY0J1cygpKTtcbiAgfVxuXG4gIC8qKiBDcm9zc2ZhZGUgdG8gYSBuZXcgc2NlbmUgKi9cbiAgc2V0U2NlbmUobmFtZTogU2NlbmVOYW1lLCBvcHRzPzogTXVzaWNTY2VuZU9wdGlvbnMpIHtcbiAgICBpZiAodGhpcy5jdXJyZW50Py5uYW1lID09PSBuYW1lKSByZXR1cm47XG5cbiAgICBjb25zdCBvbGQgPSB0aGlzLmN1cnJlbnQ7XG4gICAgY29uc3QgdCA9IHRoaXMuZW5naW5lLm5vdztcblxuICAgIC8vIGZhZGUtb3V0IG9sZFxuICAgIGNvbnN0IGZhZGVPdXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5lbmdpbmUuY3R4LCB7IGdhaW46IDAuOSB9KTtcbiAgICBmYWRlT3V0LmNvbm5lY3QodGhpcy5lbmdpbmUuZ2V0TXVzaWNCdXMoKSk7XG4gICAgaWYgKG9sZCkge1xuICAgICAgLy8gV2UgYXNzdW1lIGVhY2ggc2NlbmUgbWFuYWdlcyBpdHMgb3duIG91dCBub2RlOyBzdG9wcGluZyB0cmlnZ2VycyBhIG5hdHVyYWwgdGFpbC5cbiAgICAgIG9sZC5zdG9wKCk7XG4gICAgICBmYWRlT3V0LmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wLCB0ICsgMC42KTtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gZmFkZU91dC5kaXNjb25uZWN0KCksIDY1MCk7XG4gICAgfVxuXG4gICAgLy8gbmV3IHNjZW5lXG4gICAgY29uc3Qgc2NlbmVPdXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5lbmdpbmUuY3R4LCB7IGdhaW46IDAgfSk7XG4gICAgc2NlbmVPdXQuY29ubmVjdCh0aGlzLmJ1c091dCk7XG5cbiAgICBsZXQgc3RvcCA9ICgpID0+IHNjZW5lT3V0LmRpc2Nvbm5lY3QoKTtcblxuICAgIGlmIChuYW1lID09PSBcImFtYmllbnRcIikge1xuICAgICAgY29uc3QgcyA9IG5ldyBBbWJpZW50U2NlbmUodGhpcy5lbmdpbmUuY3R4LCBzY2VuZU91dCwgb3B0cz8uc2VlZCA/PyAxKTtcbiAgICAgIHMuc3RhcnQoKTtcbiAgICAgIHN0b3AgPSAoKSA9PiB7XG4gICAgICAgIHMuc3RvcCgpO1xuICAgICAgICBzY2VuZU91dC5kaXNjb25uZWN0KCk7XG4gICAgICB9O1xuICAgIH1cbiAgICAvLyBlbHNlIGlmIChuYW1lID09PSBcImNvbWJhdFwiKSB7IC8qIGltcGxlbWVudCBjb21iYXQgc2NlbmUgbGF0ZXIgKi8gfVxuICAgIC8vIGVsc2UgaWYgKG5hbWUgPT09IFwibG9iYnlcIikgeyAvKiBpbXBsZW1lbnQgbG9iYnkgc2NlbmUgbGF0ZXIgKi8gfVxuXG4gICAgdGhpcy5jdXJyZW50ID0geyBuYW1lLCBzdG9wIH07XG4gICAgc2NlbmVPdXQuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjksIHQgKyAwLjYpO1xuICB9XG5cbiAgc3RvcCgpIHtcbiAgICBpZiAoIXRoaXMuY3VycmVudCkgcmV0dXJuO1xuICAgIHRoaXMuY3VycmVudC5zdG9wKCk7XG4gICAgdGhpcy5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICB9XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBCdXMsIE11c2ljUGFyYW1NZXNzYWdlLCBNdXNpY1NjZW5lT3B0aW9ucyB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgTXVzaWNEaXJlY3RvciB9IGZyb20gXCIuL211c2ljXCI7XG5pbXBvcnQgeyBwbGF5U2Z4IH0gZnJvbSBcIi4vc2Z4XCI7XG5cbi8qKlxuICogQmluZCBzdGFuZGFyZCBhdWRpbyBldmVudHMgdG8gdGhlIGVuZ2luZSBhbmQgbXVzaWMgZGlyZWN0b3IuXG4gKlxuICogRXZlbnRzIHN1cHBvcnRlZDpcbiAqICAtIGF1ZGlvOnJlc3VtZVxuICogIC0gYXVkaW86bXV0ZSAvIGF1ZGlvOnVubXV0ZVxuICogIC0gYXVkaW86c2V0LW1hc3Rlci1nYWluIHsgZ2FpbiB9XG4gKiAgLSBhdWRpbzpzZnggeyBuYW1lLCB2ZWxvY2l0eT8sIHBhbj8gfVxuICogIC0gYXVkaW86bXVzaWM6c2V0LXNjZW5lIHsgc2NlbmUsIHNlZWQ/IH1cbiAqICAtIGF1ZGlvOm11c2ljOnBhcmFtIHsga2V5LCB2YWx1ZSB9XG4gKiAgLSBhdWRpbzptdXNpYzp0cmFuc3BvcnQgeyBjbWQ6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJwYXVzZVwiIH0gIC8vIHBhdXNlIGN1cnJlbnRseSBtYXBzIHRvIHN0b3BcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyhcbiAgYnVzOiBCdXMsXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIG11c2ljOiBNdXNpY0RpcmVjdG9yXG4pOiB2b2lkIHtcbiAgYnVzLm9uKFwiYXVkaW86cmVzdW1lXCIsICgpID0+IGVuZ2luZS5yZXN1bWUoKSk7XG4gIGJ1cy5vbihcImF1ZGlvOm11dGVcIiwgKCkgPT4gZW5naW5lLnNldE1hc3RlckdhaW4oMCkpO1xuICBidXMub24oXCJhdWRpbzp1bm11dGVcIiwgKCkgPT4gZW5naW5lLnNldE1hc3RlckdhaW4oMC45KSk7XG4gIGJ1cy5vbihcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiLCAoeyBnYWluIH06IHsgZ2FpbjogbnVtYmVyIH0pID0+XG4gICAgZW5naW5lLnNldE1hc3RlckdhaW4oTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgZ2FpbikpKVxuICApO1xuXG4gIGJ1cy5vbihcImF1ZGlvOnNmeFwiLCAobXNnOiB7IG5hbWU6IHN0cmluZzsgdmVsb2NpdHk/OiBudW1iZXI7IHBhbj86IG51bWJlciB9KSA9PiB7XG4gICAgcGxheVNmeChlbmdpbmUsIG1zZy5uYW1lIGFzIGFueSwgeyB2ZWxvY2l0eTogbXNnLnZlbG9jaXR5LCBwYW46IG1zZy5wYW4gfSk7XG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiLCAobXNnOiB7IHNjZW5lOiBzdHJpbmcgfSAmIE11c2ljU2NlbmVPcHRpb25zKSA9PiB7XG4gICAgZW5naW5lLnJlc3VtZSgpO1xuICAgIG11c2ljLnNldFNjZW5lKG1zZy5zY2VuZSBhcyBhbnksIHsgc2VlZDogbXNnLnNlZWQgfSk7XG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnBhcmFtXCIsIChfbXNnOiBNdXNpY1BhcmFtTWVzc2FnZSkgPT4ge1xuICAgIC8vIEhvb2sgZm9yIGZ1dHVyZSBwYXJhbSByb3V0aW5nIHBlciBzY2VuZSAoZS5nLiwgaW50ZW5zaXR5L2JyaWdodG5lc3MvZGVuc2l0eSlcbiAgICAvLyBJZiB5b3Ugd2FudCBnbG9iYWwgcGFyYW1zLCBrZWVwIGEgbWFwIGhlcmUgYW5kIGZvcndhcmQgdG8gdGhlIGFjdGl2ZSBzY2VuZVxuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzp0cmFuc3BvcnRcIiwgKHsgY21kIH06IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9KSA9PiB7XG4gICAgaWYgKGNtZCA9PT0gXCJzdG9wXCIgfHwgY21kID09PSBcInBhdXNlXCIpIG11c2ljLnN0b3AoKTtcbiAgICAvLyBcInN0YXJ0XCIgaXMgaW1wbGljaXQgdmlhIHNldFNjZW5lXG4gIH0pO1xufVxuIiwgImltcG9ydCB7IGNyZWF0ZUV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgeyBjb25uZWN0V2ViU29ja2V0LCBzZW5kTWVzc2FnZSB9IGZyb20gXCIuL25ldFwiO1xuaW1wb3J0IHsgaW5pdEdhbWUgfSBmcm9tIFwiLi9nYW1lXCI7XG5pbXBvcnQgeyBjcmVhdGVJbml0aWFsU3RhdGUsIGNyZWF0ZUluaXRpYWxVSVN0YXRlIH0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7IG1vdW50VHV0b3JpYWwsIEJBU0lDX1RVVE9SSUFMX0lEIH0gZnJvbSBcIi4vdHV0b3JpYWxcIjtcbmltcG9ydCB7IGNsZWFyUHJvZ3Jlc3MgYXMgY2xlYXJUdXRvcmlhbFByb2dyZXNzIH0gZnJvbSBcIi4vdHV0b3JpYWwvc3RvcmFnZVwiO1xuaW1wb3J0IHsgbW91bnRTdG9yeSwgSU5UUk9fQ0hBUFRFUl9JRCwgSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMgfSBmcm9tIFwiLi9zdG9yeVwiO1xuaW1wb3J0IHsgd2FpdEZvclVzZXJTdGFydCB9IGZyb20gXCIuL3N0YXJ0LWdhdGVcIjtcbmltcG9ydCB7IHJlc3VtZUF1ZGlvIH0gZnJvbSBcIi4vc3Rvcnkvc2Z4XCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2F1ZGlvL2VuZ2luZVwiO1xuaW1wb3J0IHsgTXVzaWNEaXJlY3RvciB9IGZyb20gXCIuL2F1ZGlvL211c2ljXCI7XG5pbXBvcnQgeyByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MgfSBmcm9tIFwiLi9hdWRpby9jdWVzXCI7XG5cbmNvbnN0IENBTExfU0lHTl9TVE9SQUdFX0tFWSA9IFwibHNkOmNhbGxzaWduXCI7XG5cbihhc3luYyBmdW5jdGlvbiBib290c3RyYXAoKSB7XG4gIGNvbnN0IHFzID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcbiAgY29uc3Qgcm9vbSA9IHFzLmdldChcInJvb21cIikgfHwgXCJkZWZhdWx0XCI7XG4gIGNvbnN0IG1vZGUgPSBxcy5nZXQoXCJtb2RlXCIpIHx8IFwiXCI7XG4gIGNvbnN0IG5hbWVQYXJhbSA9IHNhbml0aXplQ2FsbFNpZ24ocXMuZ2V0KFwibmFtZVwiKSk7XG4gIGNvbnN0IHN0b3JlZE5hbWUgPSBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgY29uc3QgY2FsbFNpZ24gPSBuYW1lUGFyYW0gfHwgc3RvcmVkTmFtZTtcbiAgY29uc3QgbWFwVyA9IHBhcnNlRmxvYXQocXMuZ2V0KFwibWFwV1wiKSB8fCBcIjgwMDBcIik7XG4gIGNvbnN0IG1hcEggPSBwYXJzZUZsb2F0KHFzLmdldChcIm1hcEhcIikgfHwgXCI0NTAwXCIpO1xuXG4gIGlmIChuYW1lUGFyYW0gJiYgbmFtZVBhcmFtICE9PSBzdG9yZWROYW1lKSB7XG4gICAgcGVyc2lzdENhbGxTaWduKG5hbWVQYXJhbSk7XG4gIH1cblxuICAvLyBHYXRlIGV2ZXJ5dGhpbmcgb24gYSB1c2VyIGdlc3R1cmUgKGNlbnRyZWQgYnV0dG9uKVxuICBhd2FpdCB3YWl0Rm9yVXNlclN0YXJ0KHtcbiAgICBsYWJlbDogXCJTdGFydCBHYW1lXCIsXG4gICAgcmVxdWVzdEZ1bGxzY3JlZW46IGZhbHNlLCAgIC8vIGZsaXAgdG8gdHJ1ZSBpZiB5b3Ugd2FudCBmdWxsc2NyZWVuXG4gICAgcmVzdW1lQXVkaW8sICAgICAgICAgICAgICAgIC8vIHVzZXMgc3Rvcnkvc2Z4LnRzXG4gIH0pO1xuXG4gIC8vIC0tLS0gU3RhcnQgYWN0dWFsIGFwcCBhZnRlciBnZXN0dXJlIC0tLS1cbiAgY29uc3Qgc3RhdGUgPSBjcmVhdGVJbml0aWFsU3RhdGUoKTtcbiAgY29uc3QgdWlTdGF0ZSA9IGNyZWF0ZUluaXRpYWxVSVN0YXRlKCk7XG4gIGNvbnN0IGJ1cyA9IGNyZWF0ZUV2ZW50QnVzKCk7XG5cbiAgLy8gLS0tIEFVRElPOiBlbmdpbmUgKyBiaW5kaW5ncyArIGRlZmF1bHQgc2NlbmUgLS0tXG4gIGNvbnN0IGVuZ2luZSA9IEF1ZGlvRW5naW5lLmdldCgpO1xuICBhd2FpdCBlbmdpbmUucmVzdW1lKCk7IC8vIHNhZmUgcG9zdC1nZXN0dXJlXG4gIGNvbnN0IG11c2ljID0gbmV3IE11c2ljRGlyZWN0b3IoZW5naW5lKTtcbiAgcmVnaXN0ZXJBdWRpb0J1c0JpbmRpbmdzKGJ1cyBhcyBhbnksIGVuZ2luZSwgbXVzaWMpO1xuXG4gIC8vIFN0YXJ0IGEgZGVmYXVsdCBtdXNpYyBzY2VuZSAoYWRqdXN0IHNlZWQvc2NlbmUgYXMgeW91IGxpa2UpXG4gIGJ1cy5lbWl0KFwiYXVkaW86bXVzaWM6c2V0LXNjZW5lXCIsIHsgc2NlbmU6IFwiYW1iaWVudFwiLCBzZWVkOiA0MiB9KTtcblxuICAvLyBPcHRpb25hbDogYmFzaWMgaG9va3MgdG8gZGVtb25zdHJhdGUgU0ZYICYgZHVja2luZ1xuICAvLyBidXMub24oXCJkaWFsb2d1ZTpvcGVuZWRcIiwgKCkgPT4gZW5naW5lLmR1Y2tNdXNpYygwLjM1LCAwLjEpKTtcbiAgLy8gYnVzLm9uKFwiZGlhbG9ndWU6Y2xvc2VkXCIsICgpID0+IGVuZ2luZS51bmR1Y2tNdXNpYygwLjI1KSk7XG5cbiAgLy8gRXhhbXBsZSBnYW1lIFNGWCB3aXJpbmcgKGFkYXB0IHRvIHlvdXIgYWN0dWFsIGV2ZW50cylcbiAgYnVzLm9uKFwic2hpcDpzcGVlZENoYW5nZWRcIiwgKHsgdmFsdWUgfSkgPT4ge1xuICAgIGlmICh2YWx1ZSA+IDApIGJ1cy5lbWl0KFwiYXVkaW86c2Z4XCIsIHsgbmFtZTogXCJ0aHJ1c3RcIiwgdmVsb2NpdHk6IE1hdGgubWluKDEsIHZhbHVlKSB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZ2FtZSA9IGluaXRHYW1lKHsgc3RhdGUsIHVpU3RhdGUsIGJ1cyB9KTtcblxuICAvLyBNb3VudCB0dXRvcmlhbCBhbmQgc3RvcnkgYmFzZWQgb24gZ2FtZSBtb2RlXG4gIGNvbnN0IGVuYWJsZVR1dG9yaWFsID0gbW9kZSA9PT0gXCJjYW1wYWlnblwiIHx8IG1vZGUgPT09IFwidHV0b3JpYWxcIjtcbiAgY29uc3QgZW5hYmxlU3RvcnkgPSBtb2RlID09PSBcImNhbXBhaWduXCI7XG5cbiAgbGV0IHR1dG9yaWFsOiBSZXR1cm5UeXBlPHR5cGVvZiBtb3VudFR1dG9yaWFsPiB8IG51bGwgPSBudWxsO1xuICBsZXQgdHV0b3JpYWxTdGFydGVkID0gZmFsc2U7XG5cbiAgaWYgKGVuYWJsZVR1dG9yaWFsKSB7XG4gICAgdHV0b3JpYWwgPSBtb3VudFR1dG9yaWFsKGJ1cyk7XG4gIH1cblxuICBjb25zdCBzdGFydFR1dG9yaWFsID0gKCk6IHZvaWQgPT4ge1xuICAgIGlmICghdHV0b3JpYWwgfHwgdHV0b3JpYWxTdGFydGVkKSByZXR1cm47XG4gICAgdHV0b3JpYWxTdGFydGVkID0gdHJ1ZTtcbiAgICBjbGVhclR1dG9yaWFsUHJvZ3Jlc3MoQkFTSUNfVFVUT1JJQUxfSUQpO1xuICAgIHR1dG9yaWFsLnN0YXJ0KHsgcmVzdW1lOiBmYWxzZSB9KTtcbiAgfTtcblxuICBpZiAoZW5hYmxlU3RvcnkpIHtcbiAgICAvLyBDYW1wYWlnbiBtb2RlOiBzdG9yeSArIHR1dG9yaWFsXG4gICAgY29uc3QgdW5zdWJzY3JpYmVTdG9yeUNsb3NlZCA9IGJ1cy5vbihcImRpYWxvZ3VlOmNsb3NlZFwiLCAoeyBjaGFwdGVySWQsIG5vZGVJZCB9KSA9PiB7XG4gICAgICBpZiAoY2hhcHRlcklkICE9PSBJTlRST19DSEFQVEVSX0lEKSByZXR1cm47XG4gICAgICBpZiAoIUlOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTLmluY2x1ZGVzKG5vZGVJZCBhcyB0eXBlb2YgSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFNbbnVtYmVyXSkpIHJldHVybjtcbiAgICAgIHVuc3Vic2NyaWJlU3RvcnlDbG9zZWQoKTtcbiAgICAgIHN0YXJ0VHV0b3JpYWwoKTtcbiAgICB9KTtcbiAgICBtb3VudFN0b3J5KHsgYnVzLCByb29tSWQ6IHJvb20gfSk7XG4gIH0gZWxzZSBpZiAobW9kZSA9PT0gXCJ0dXRvcmlhbFwiKSB7XG4gICAgLy8gVHV0b3JpYWwgbW9kZTogYXV0by1zdGFydCB0dXRvcmlhbCB3aXRob3V0IHN0b3J5XG4gICAgc3RhcnRUdXRvcmlhbCgpO1xuICB9XG4gIC8vIEZyZWUgcGxheSBhbmQgZGVmYXVsdDogbm8gc3lzdGVtcyBtb3VudGVkXG5cbiAgY29ubmVjdFdlYlNvY2tldCh7XG4gICAgcm9vbSxcbiAgICBzdGF0ZSxcbiAgICBidXMsXG4gICAgbWFwVyxcbiAgICBtYXBILFxuICAgIG9uU3RhdGVVcGRhdGVkOiAoKSA9PiBnYW1lLm9uU3RhdGVVcGRhdGVkKCksXG4gICAgb25PcGVuOiAoKSA9PiB7XG4gICAgICBjb25zdCBuYW1lVG9TZW5kID0gY2FsbFNpZ24gfHwgc2FuaXRpemVDYWxsU2lnbihyZWFkU3RvcmVkQ2FsbFNpZ24oKSk7XG4gICAgICBpZiAobmFtZVRvU2VuZCkgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImpvaW5cIiwgbmFtZTogbmFtZVRvU2VuZCB9KTtcbiAgICB9LFxuICB9KTtcblxuICAvLyBPcHRpb25hbDogc3VzcGVuZC9yZXN1bWUgYXVkaW8gb24gdGFiIHZpc2liaWxpdHkgdG8gc2F2ZSBDUFVcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInZpc2liaWxpdHljaGFuZ2VcIiwgKCkgPT4ge1xuICAgIGlmIChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09IFwiaGlkZGVuXCIpIHtcbiAgICAgIHZvaWQgZW5naW5lLnN1c3BlbmQoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdm9pZCBlbmdpbmUucmVzdW1lKCk7XG4gICAgfVxuICB9KTtcbn0pKCk7XG5cbmZ1bmN0aW9uIHNhbml0aXplQ2FsbFNpZ24odmFsdWU6IHN0cmluZyB8IG51bGwpOiBzdHJpbmcge1xuICBpZiAoIXZhbHVlKSByZXR1cm4gXCJcIjtcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKTtcbiAgaWYgKCF0cmltbWVkKSByZXR1cm4gXCJcIjtcbiAgcmV0dXJuIHRyaW1tZWQuc2xpY2UoMCwgMjQpO1xufVxuXG5mdW5jdGlvbiBwZXJzaXN0Q2FsbFNpZ24obmFtZTogc3RyaW5nKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgaWYgKG5hbWUpIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVksIG5hbWUpO1xuICAgIGVsc2Ugd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSk7XG4gIH0gY2F0Y2gge31cbn1cblxuZnVuY3Rpb24gcmVhZFN0b3JlZENhbGxTaWduKCk6IHN0cmluZyB7XG4gIHRyeSB7IHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZKSA/PyBcIlwiOyB9XG4gIGNhdGNoIHsgcmV0dXJuIFwiXCI7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQThFTyxXQUFTLGlCQUEyQjtBQUN6QyxVQUFNLFdBQVcsb0JBQUksSUFBNkI7QUFDbEQsV0FBTztBQUFBLE1BQ0wsR0FBRyxPQUFPLFNBQVM7QUFDakIsWUFBSSxNQUFNLFNBQVMsSUFBSSxLQUFLO0FBQzVCLFlBQUksQ0FBQyxLQUFLO0FB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QUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFFBQ1Q7QUFBQSxRQUNBLFdBQVc7QUFBQSxNQUNiO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFFBQ1Q7QUFBQSxRQUNBLFdBQVc7QUFBQSxNQUNiO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFFBQ1Q7QUFBQSxRQUNBLFdBQVc7QUFBQSxNQUNiO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFFBQ1Q7QUFBQSxRQUNBLFdBQVc7QUFBQSxNQUNiO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFFBQ1Q7QUFBQSxRQUNBLFdBQVc7QUFBQSxNQUNiO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFFBQ1Q7QUFBQSxNQUNGO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtB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QUFDLFFBQVMsUUFBTztBQUNyQixXQUFPLFFBQVEsTUFBTSxHQUFHLEVBQUU7QUFBQSxFQUM1QjtBQUVBLFdBQVMsZ0JBQWdCLE1BQW9CO0FBQzNDLFFBQUk7QUFDRixVQUFJLEtBQU0sUUFBTyxhQUFhLFFBQVEsdUJBQXVCLElBQUk7QUFBQSxVQUM1RCxRQUFPLGFBQWEsV0FBVyxxQkFBcUI7QUFBQSxJQUMzRCxTQUFRO0FBQUEsSUFBQztBQUFBLEVBQ1g7QUFFQSxXQUFTLHFCQUE2QjtBQW5JdEM7QUFvSUUsUUFBSTtBQUFFLGNBQU8sWUFBTyxhQUFhLFFBQVEscUJBQXFCLE1BQWpELFlBQXNEO0FBQUEsSUFBSSxTQUNqRTtBQUFFLGFBQU87QUFBQSxJQUFJO0FBQUEsRUFDckI7IiwKICAibmFtZXMiOiBbImRlZmF1bHRTcGVlZCIsICJfYSIsICJfYSIsICJTVFlMRV9JRCIsICJlbnN1cmVTdHlsZXMiLCAiY2hvaWNlIiwgIl9hIiwgIlNUT1JBR0VfUFJFRklYIiwgImdldFN0b3JhZ2UiLCAiY3R4IiwgImN0eCIsICJjbGFtcCIsICJjaG9pY2UiLCAiX2EiLCAiY3R4IiwgInJlc3VtZUF1ZGlvIiwgImN0eCJdCn0K
