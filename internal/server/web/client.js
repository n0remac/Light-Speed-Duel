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
        lifetime: missileLifetimeFor(180, 800, limits)
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
    return {
      speed,
      agroRadius,
      lifetime: missileLifetimeFor(speed, agroRadius, limits)
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
    var _a, _b;
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
      waypoints: Array.isArray(route.waypoints) ? route.waypoints.map((wp) => ({ x: wp.x, y: wp.y })) : []
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
      const sanitized = sanitizeMissileConfig({
        speed: msg.missile_config.speed,
        agroRadius: msg.missile_config.agro_radius
      }, state.missileConfig, state.missileLimits);
      if (Number.isFinite(msg.missile_config.lifetime)) {
        sanitized.lifetime = msg.missile_config.lifetime;
      }
      state.missileConfig = sanitized;
    }
    const meta = (_b = msg.meta) != null ? _b : {};
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
      stallUntilMs
    };
    if (serverHeat.v > 0) {
      console.log("[heat] Received heat data:", heatView);
    }
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
  var heatValueText = null;
  var speedMarker = null;
  var stallOverlay = null;
  var selection = null;
  var missileSelection = null;
  var defaultSpeed = 150;
  var lastLoopTs = null;
  var lastMissileConfigSent = null;
  var legDashOffsets = /* @__PURE__ */ new Map();
  var lastMissileLaunchTextHTML = "";
  var lastMissileLaunchInfoHTML = "";
  var lastTouchDistance = null;
  var pendingTouchTimeout = null;
  var isPinching = false;
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
    heatValueText = document.getElementById("heat-value-text");
    speedMarker = document.getElementById("speed-marker");
    stallOverlay = document.getElementById("stall-overlay");
    defaultSpeed = parseFloat((_b = shipSpeedSlider == null ? void 0 : shipSpeedSlider.value) != null ? _b : "150");
  }
  function bindListeners() {
    if (!cv) return;
    cv.addEventListener("pointerdown", onCanvasPointerDown);
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
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      updateSpeedLabel(value);
      defaultSpeed = value;
      if (selection && stateRef.me && Array.isArray(stateRef.me.waypoints) && stateRef.me.waypoints[selection.index]) {
        sendMessage({ type: "update_waypoint", index: selection.index, speed: value });
        stateRef.me.waypoints[selection.index].speed = value;
        refreshShipSelectionUI();
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
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      updateMissileConfigFromUI({ speed: value });
      busRef.emit("missile:speedChanged", { value });
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
    var _a, _b, _c;
    if (missileSpeedSlider) {
      const minSpeed = (_a = stateRef.missileLimits.speedMin) != null ? _a : MISSILE_MIN_SPEED;
      const maxSpeed = (_b = stateRef.missileLimits.speedMax) != null ? _b : MISSILE_MAX_SPEED;
      missileSpeedSlider.min = String(minSpeed);
      missileSpeedSlider.max = String(maxSpeed);
      missileSpeedSlider.value = cfg.speed.toFixed(0);
    }
    if (missileSpeedValue) {
      missileSpeedValue.textContent = cfg.speed.toFixed(0);
    }
    if (missileAgroSlider) {
      const minAgro = (_c = stateRef.missileLimits.agroMin) != null ? _c : MISSILE_MIN_AGRO;
      const maxAgro = Math.max(5e3, Math.ceil((cfg.agroRadius + 500) / 500) * 500);
      missileAgroSlider.min = String(minAgro);
      missileAgroSlider.max = String(maxAgro);
      missileAgroSlider.value = cfg.agroRadius.toFixed(0);
    }
    if (missileAgroValue) {
      missileAgroValue.textContent = cfg.agroRadius.toFixed(0);
    }
  }
  function updateMissileConfigFromUI(overrides = {}) {
    var _a, _b, _c;
    const current = stateRef.missileConfig;
    const cfg = sanitizeMissileConfig({
      speed: (_a = overrides.speed) != null ? _a : current.speed,
      agroRadius: (_b = overrides.agroRadius) != null ? _b : current.agroRadius
    }, current, stateRef.missileLimits);
    stateRef.missileConfig = cfg;
    applyMissileUI(cfg);
    const last = lastMissileConfigSent;
    const needsSend = !last || Math.abs(last.speed - cfg.speed) > 0.25 || Math.abs(((_c = last.agroRadius) != null ? _c : 0) - cfg.agroRadius) > 5;
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
  }
  function refreshMissileSelectionUI() {
    if (!missileDeleteBtn) return;
    const route = getActiveMissileRoute();
    const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
    const hasSelection = missileSelection !== null && missileSelection !== void 0 && missileSelection.index >= 0 && missileSelection.index < count;
    missileDeleteBtn.disabled = !hasSelection;
  }
  function setSelection(sel) {
    selection = sel;
    refreshShipSelectionUI();
    const index = selection ? selection.index : null;
    busRef.emit("ship:legSelected", { index });
  }
  function setMissileSelection(sel) {
    missileSelection = sel;
    refreshMissileSelectionUI();
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
    if (wps.length > 0) {
      setSelection({ type: "leg", index: wps.length - 1 });
      busRef.emit("ship:waypointAdded", { index: wps.length - 1 });
    }
  }
  function handleMissilePointer(canvasPoint, worldPoint) {
    const route = getActiveMissileRoute();
    if (!route) return;
    if (uiStateRef.missileTool === "select") {
      const hit = hitTestMissileRoute(canvasPoint);
      setMissileSelection(hit);
      return;
    }
    const wp = { x: worldPoint.x, y: worldPoint.y };
    sendMessage({
      type: "add_missile_waypoint",
      route_id: route.id,
      x: wp.x,
      y: wp.y
    });
    route.waypoints = route.waypoints ? [...route.waypoints, wp] : [wp];
    renderMissileRouteControls();
    setMissileSelection({ type: "waypoint", index: route.waypoints.length - 1 });
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
  }
  function deleteSelectedShipWaypoint() {
    if (!selection) return;
    sendMessage({ type: "delete_waypoint", index: selection.index });
    if (stateRef.me && Array.isArray(stateRef.me.waypoints)) {
      stateRef.me.waypoints = stateRef.me.waypoints.slice(0, selection.index);
    }
    busRef.emit("ship:waypointDeleted", { index: selection.index });
    setSelection(null);
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
        adjustSliderValue(missileSpeedSlider, -1, event.shiftKey);
        event.preventDefault();
        return;
      case "Quote":
        setInputContext("missile");
        adjustSliderValue(missileSpeedSlider, 1, event.shiftKey);
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
  function updateLegDashOffsets(dtSeconds) {
    var _a;
    if (!uiStateRef.showShipRoute || !stateRef.me) {
      legDashOffsets.clear();
      return;
    }
    const route = computeRoutePoints();
    if (!route || route.waypoints.length === 0) {
      legDashOffsets.clear();
      return;
    }
    const { waypoints, worldPoints, canvasPoints } = route;
    const cycle = 64;
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const speed = typeof wp.speed === "number" ? wp.speed : defaultSpeed;
      const aWorld = worldPoints[i];
      const bWorld = worldPoints[i + 1];
      const worldDist = Math.hypot(bWorld.x - aWorld.x, bWorld.y - aWorld.y);
      const aCanvas = canvasPoints[i];
      const bCanvas = canvasPoints[i + 1];
      const canvasDist = Math.hypot(bCanvas.x - aCanvas.x, bCanvas.y - aCanvas.y);
      if (!Number.isFinite(speed) || speed <= 1e-3 || !Number.isFinite(worldDist) || worldDist <= 1e-3 || canvasDist <= 1e-3) {
        legDashOffsets.set(i, 0);
        continue;
      }
      if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
        if (!legDashOffsets.has(i)) {
          legDashOffsets.set(i, 0);
        }
        continue;
      }
      const scale = canvasDist / worldDist;
      const dashSpeed = speed * scale;
      let next = ((_a = legDashOffsets.get(i)) != null ? _a : 0) - dashSpeed * dtSeconds;
      if (!Number.isFinite(next)) {
        next = 0;
      } else {
        next = (next % cycle + cycle) % cycle;
      }
      legDashOffsets.set(i, next);
    }
    for (const key of Array.from(legDashOffsets.keys())) {
      if (key >= waypoints.length) {
        legDashOffsets.delete(key);
      }
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
  function hitTestMissileRoute(canvasPoint) {
    const route = computeMissileRoutePoints();
    if (!route || route.waypoints.length === 0) {
      return null;
    }
    const { canvasPoints } = route;
    const waypointHitRadius = 16;
    for (let i = 1; i < canvasPoints.length; i++) {
      const wpCanvas = canvasPoints[i];
      const dx = canvasPoint.x - wpCanvas.x;
      const dy = canvasPoint.y - wpCanvas.y;
      if (Math.hypot(dx, dy) <= waypointHitRadius) {
        return { type: "waypoint", index: i - 1 };
      }
    }
    return null;
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
  function drawRoute() {
    var _a, _b, _c;
    if (!ctx || !stateRef.me) return;
    const route = computeRoutePoints();
    if (!route || route.waypoints.length === 0) return;
    const { canvasPoints } = route;
    const legCount = canvasPoints.length - 1;
    if (uiStateRef.showShipRoute && legCount > 0) {
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#38bdf866";
      for (let i = 0; i < legCount; i++) {
        ctx.beginPath();
        ctx.moveTo(canvasPoints[i].x, canvasPoints[i].y);
        ctx.lineTo(canvasPoints[i + 1].x, canvasPoints[i + 1].y);
        ctx.lineDashOffset = (_a = legDashOffsets.get(i)) != null ? _a : 0;
        ctx.stroke();
      }
      ctx.restore();
    }
    if (uiStateRef.showShipRoute && legCount > 0) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
      ctx.lineTo(canvasPoints[1].x, canvasPoints[1].y);
      ctx.lineDashOffset = (_b = legDashOffsets.get(0)) != null ? _b : 0;
      ctx.stroke();
      ctx.restore();
    }
    if (uiStateRef.showShipRoute && selection && selection.index < legCount) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(canvasPoints[selection.index].x, canvasPoints[selection.index].y);
      ctx.lineTo(canvasPoints[selection.index + 1].x, canvasPoints[selection.index + 1].y);
      ctx.lineDashOffset = (_c = legDashOffsets.get(selection.index)) != null ? _c : 0;
      ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < route.waypoints.length; i++) {
      const pt = canvasPoints[i + 1];
      const isSelected = selection && selection.index === i;
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isSelected ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#f97316" : "#38bdf8";
      ctx.globalAlpha = isSelected ? 0.95 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#0f172a";
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawMissileRoute() {
    if (!ctx || !stateRef.me) return;
    if (uiStateRef.inputContext !== "missile") return;
    const route = computeMissileRoutePoints();
    if (!route || route.waypoints.length === 0) return;
    const { canvasPoints } = route;
    ctx.save();
    ctx.setLineDash([10, 6]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#f87171aa";
    ctx.beginPath();
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
    for (let i = 1; i < canvasPoints.length; i++) {
      ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
    }
    ctx.stroke();
    ctx.restore();
    for (let i = 1; i < canvasPoints.length; i++) {
      const pt = canvasPoints[i];
      const waypointIndex = i - 1;
      const isSelected = missileSelection && missileSelection.index === waypointIndex;
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isSelected ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#facc15" : "#f87171";
      ctx.globalAlpha = isSelected ? 0.95 : 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = isSelected ? "#854d0e" : "#7f1d1d";
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
    }
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
    updateSpeedMarker();
    updateStallOverlay();
  }
  function updateHeatBar() {
    var _a;
    const heat = (_a = stateRef.me) == null ? void 0 : _a.heat;
    if (!heat || !heatBarFill || !heatValueText) return;
    const percent = heat.value / heat.max * 100;
    heatBarFill.style.width = `${percent}%`;
    heatValueText.textContent = `Heat ${Math.round(heat.value)}`;
    heatBarFill.classList.remove("warn", "overheat");
    if (heat.value >= heat.overheatAt) {
      heatBarFill.classList.add("overheat");
    } else if (heat.value >= heat.warnAt) {
      heatBarFill.classList.add("warn");
    }
  }
  function updateSpeedMarker() {
    var _a;
    const heat = (_a = stateRef.me) == null ? void 0 : _a.heat;
    if (!heat || !speedMarker || !shipSpeedSlider) return;
    const min = parseFloat(shipSpeedSlider.min);
    const max = parseFloat(shipSpeedSlider.max);
    const markerSpeed = heat.markerSpeed;
    const percent = (markerSpeed - min) / (max - min) * 100;
    speedMarker.style.left = `${percent}%`;
    speedMarker.title = `Heat neutral: ${Math.round(markerSpeed)} units/s`;
  }
  function updateStallOverlay() {
    var _a;
    const heat = (_a = stateRef.me) == null ? void 0 : _a.heat;
    if (!heat || !stallOverlay) return;
    const now = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    const isStalled = now < heat.stallUntilMs;
    if (isStalled) {
      stallOverlay.classList.add("visible");
    } else {
      stallOverlay.classList.remove("visible");
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
    updateLegDashOffsets(dtSeconds);
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawGrid();
    drawRoute();
    drawMissileRoute();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS50cyIsICJzcmMvdHV0b3JpYWwvaGlnaGxpZ2h0LnRzIiwgInNyYy90dXRvcmlhbC9zdG9yYWdlLnRzIiwgInNyYy90dXRvcmlhbC9yb2xlcy50cyIsICJzcmMvdHV0b3JpYWwvZW5naW5lLnRzIiwgInNyYy90dXRvcmlhbC9zdGVwc19iYXNpYy50cyIsICJzcmMvdHV0b3JpYWwvaW5kZXgudHMiLCAic3JjL3N0b3J5L292ZXJsYXkudHMiLCAic3JjL3N0b3J5L3N0b3JhZ2UudHMiLCAic3JjL2F1ZGlvL2VuZ2luZS50cyIsICJzcmMvYXVkaW8vZ3JhcGgudHMiLCAic3JjL2F1ZGlvL3NmeC50cyIsICJzcmMvc3Rvcnkvc2Z4LnRzIiwgInNyYy9zdG9yeS9lbmdpbmUudHMiLCAic3JjL3N0b3J5L2NoYXB0ZXJzL2ludHJvLnRzIiwgInNyYy9zdG9yeS9pbmRleC50cyIsICJzcmMvc3RhcnQtZ2F0ZS50cyIsICJzcmMvYXVkaW8vbXVzaWMvc2NlbmVzL2FtYmllbnQudHMiLCAic3JjL2F1ZGlvL211c2ljL2luZGV4LnRzIiwgInNyYy9hdWRpby9jdWVzLnRzIiwgInNyYy9tYWluLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgdHlwZSBTaGlwQ29udGV4dCA9IFwic2hpcFwiIHwgXCJtaXNzaWxlXCI7XG5leHBvcnQgdHlwZSBTaGlwVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcbmV4cG9ydCB0eXBlIE1pc3NpbGVUb29sID0gXCJzZXRcIiB8IFwic2VsZWN0XCIgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50TWFwIHtcbiAgXCJjb250ZXh0OmNoYW5nZWRcIjogeyBjb250ZXh0OiBTaGlwQ29udGV4dCB9O1xuICBcInNoaXA6dG9vbENoYW5nZWRcIjogeyB0b29sOiBTaGlwVG9vbCB9O1xuICBcInNoaXA6d2F5cG9pbnRBZGRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6bGF1bmNoZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiOiB7IHNlY29uZHNSZW1haW5pbmc6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiOiB2b2lkO1xuICBcImhlbHA6dmlzaWJsZUNoYW5nZWRcIjogeyB2aXNpYmxlOiBib29sZWFuIH07XG4gIFwic3RhdGU6dXBkYXRlZFwiOiB2b2lkO1xuICBcInR1dG9yaWFsOnN0YXJ0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIjogeyBpZDogc3RyaW5nOyBzdGVwSW5kZXg6IG51bWJlcjsgdG90YWw6IG51bWJlciB9O1xuICBcInR1dG9yaWFsOmNvbXBsZXRlZFwiOiB7IGlkOiBzdHJpbmcgfTtcbiAgXCJ0dXRvcmlhbDpza2lwcGVkXCI6IHsgaWQ6IHN0cmluZzsgYXRTdGVwOiBudW1iZXIgfTtcbiAgXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIjogdm9pZDtcbiAgXCJkaWFsb2d1ZTpvcGVuZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjbG9zZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjaG9pY2VcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hvaWNlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJzdG9yeTpmbGFnVXBkYXRlZFwiOiB7IGZsYWc6IHN0cmluZzsgdmFsdWU6IGJvb2xlYW4gfTtcbiAgXCJzdG9yeTpwcm9ncmVzc2VkXCI6IHsgY2hhcHRlcklkOiBzdHJpbmc7IG5vZGVJZDogc3RyaW5nIH07XG4gIFwiYXVkaW86cmVzdW1lXCI6IHZvaWQ7XG4gIFwiYXVkaW86bXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnVubXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiOiB7IGdhaW46IG51bWJlciB9O1xuICBcImF1ZGlvOnNmeFwiOiB7IG5hbWU6IFwidWlcIiB8IFwibGFzZXJcIiB8IFwidGhydXN0XCIgfCBcImV4cGxvc2lvblwiIHwgXCJsb2NrXCIgfCBcImRpYWxvZ3VlXCI7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIjogeyBzY2VuZTogXCJhbWJpZW50XCIgfCBcImNvbWJhdFwiIHwgXCJsb2JieVwiOyBzZWVkPzogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6cGFyYW1cIjogeyBrZXk6IHN0cmluZzsgdmFsdWU6IG51bWJlciB9OyAgICAgICAgICAgICAgIFxuICBcImF1ZGlvOm11c2ljOnRyYW5zcG9ydFwiOiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfTtcbn1cblxuZXhwb3J0IHR5cGUgRXZlbnRLZXkgPSBrZXlvZiBFdmVudE1hcDtcbmV4cG9ydCB0eXBlIEV2ZW50UGF5bG9hZDxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gRXZlbnRNYXBbS107XG5leHBvcnQgdHlwZSBIYW5kbGVyPEsgZXh0ZW5kcyBFdmVudEtleT4gPSAocGF5bG9hZDogRXZlbnRQYXlsb2FkPEs+KSA9PiB2b2lkO1xuXG50eXBlIFZvaWRLZXlzID0ge1xuICBbSyBpbiBFdmVudEtleV06IEV2ZW50TWFwW0tdIGV4dGVuZHMgdm9pZCA/IEsgOiBuZXZlclxufVtFdmVudEtleV07XG5cbnR5cGUgTm9uVm9pZEtleXMgPSBFeGNsdWRlPEV2ZW50S2V5LCBWb2lkS2V5cz47XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnRCdXMge1xuICBvbjxLIGV4dGVuZHMgRXZlbnRLZXk+KGV2ZW50OiBLLCBoYW5kbGVyOiBIYW5kbGVyPEs+KTogKCkgPT4gdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgTm9uVm9pZEtleXM+KGV2ZW50OiBLLCBwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pOiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBWb2lkS2V5cz4oZXZlbnQ6IEspOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXZlbnRCdXMoKTogRXZlbnRCdXMge1xuICBjb25zdCBoYW5kbGVycyA9IG5ldyBNYXA8RXZlbnRLZXksIFNldDxGdW5jdGlvbj4+KCk7XG4gIHJldHVybiB7XG4gICAgb24oZXZlbnQsIGhhbmRsZXIpIHtcbiAgICAgIGxldCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQpIHtcbiAgICAgICAgc2V0ID0gbmV3IFNldCgpO1xuICAgICAgICBoYW5kbGVycy5zZXQoZXZlbnQsIHNldCk7XG4gICAgICB9XG4gICAgICBzZXQuYWRkKGhhbmRsZXIpO1xuICAgICAgcmV0dXJuICgpID0+IHNldCEuZGVsZXRlKGhhbmRsZXIpO1xuICAgIH0sXG4gICAgZW1pdChldmVudDogRXZlbnRLZXksIHBheWxvYWQ/OiB1bmtub3duKSB7XG4gICAgICBjb25zdCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQgfHwgc2V0LnNpemUgPT09IDApIHJldHVybjtcbiAgICAgIGZvciAoY29uc3QgZm4gb2Ygc2V0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgKGZuIGFzICh2YWx1ZT86IHVua25vd24pID0+IHZvaWQpKHBheWxvYWQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBbYnVzXSBoYW5kbGVyIGZvciAke2V2ZW50fSBmYWlsZWRgLCBlcnIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNoaXBDb250ZXh0LCBTaGlwVG9vbCwgTWlzc2lsZVRvb2wgfSBmcm9tIFwiLi9idXNcIjtcblxuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX1NQRUVEID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfU1BFRUQgPSAyNTA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fQUdSTyA9IDEwMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9MSUZFVElNRSA9IDEyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9MSUZFVElNRSA9IDIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSA9IDgwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiA9IDIwMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUxpbWl0cyB7XG4gIHNwZWVkTWluOiBudW1iZXI7XG4gIHNwZWVkTWF4OiBudW1iZXI7XG4gIGFncm9NaW46IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRWaWV3IHtcbiAgdmFsdWU6IG51bWJlcjtcbiAgbWF4OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIHN0YWxsVW50aWxNczogbnVtYmVyOyAvLyBjbGllbnQtc3luY2VkIHRpbWUgaW4gbWlsbGlzZWNvbmRzXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2hpcFNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIGhwPzogbnVtYmVyO1xuICBraWxscz86IG51bWJlcjtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xuICBoZWF0PzogSGVhdFZpZXc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2hvc3RTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHdheXBvaW50czogTWlzc2lsZVdheXBvaW50W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUNvbmZpZyB7XG4gIHNwZWVkOiBudW1iZXI7XG4gIGFncm9SYWRpdXM6IG51bWJlcjtcbiAgbGlmZXRpbWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1ldGEge1xuICBjPzogbnVtYmVyO1xuICB3PzogbnVtYmVyO1xuICBoPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFwcFN0YXRlIHtcbiAgbm93OiBudW1iZXI7XG4gIG5vd1N5bmNlZEF0OiBudW1iZXI7XG4gIG1lOiBTaGlwU25hcHNob3QgfCBudWxsO1xuICBnaG9zdHM6IEdob3N0U25hcHNob3RbXTtcbiAgbWlzc2lsZXM6IE1pc3NpbGVTbmFwc2hvdFtdO1xuICBtaXNzaWxlUm91dGVzOiBNaXNzaWxlUm91dGVbXTtcbiAgYWN0aXZlTWlzc2lsZVJvdXRlSWQ6IHN0cmluZyB8IG51bGw7XG4gIG5leHRNaXNzaWxlUmVhZHlBdDogbnVtYmVyO1xuICBtaXNzaWxlQ29uZmlnOiBNaXNzaWxlQ29uZmlnO1xuICBtaXNzaWxlTGltaXRzOiBNaXNzaWxlTGltaXRzO1xuICB3b3JsZE1ldGE6IFdvcmxkTWV0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCI7XG4gIGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIEFjdGl2ZVRvb2wgPVxuICB8IFwic2hpcC1zZXRcIlxuICB8IFwic2hpcC1zZWxlY3RcIlxuICB8IFwibWlzc2lsZS1zZXRcIlxuICB8IFwibWlzc2lsZS1zZWxlY3RcIlxuICB8IG51bGw7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVUlTdGF0ZSB7XG4gIGlucHV0Q29udGV4dDogU2hpcENvbnRleHQ7XG4gIHNoaXBUb29sOiBTaGlwVG9vbDtcbiAgbWlzc2lsZVRvb2w6IE1pc3NpbGVUb29sO1xuICBhY3RpdmVUb29sOiBBY3RpdmVUb29sO1xuICBzaG93U2hpcFJvdXRlOiBib29sZWFuO1xuICBoZWxwVmlzaWJsZTogYm9vbGVhbjtcbiAgem9vbTogbnVtYmVyO1xuICBwYW5YOiBudW1iZXI7XG4gIHBhblk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxVSVN0YXRlKCk6IFVJU3RhdGUge1xuICByZXR1cm4ge1xuICAgIGlucHV0Q29udGV4dDogXCJzaGlwXCIsXG4gICAgc2hpcFRvb2w6IFwic2V0XCIsXG4gICAgbWlzc2lsZVRvb2w6IG51bGwsXG4gICAgYWN0aXZlVG9vbDogXCJzaGlwLXNldFwiLFxuICAgIHNob3dTaGlwUm91dGU6IHRydWUsXG4gICAgaGVscFZpc2libGU6IGZhbHNlLFxuICAgIHpvb206IDEuMCxcbiAgICBwYW5YOiAwLFxuICAgIHBhblk6IDAsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsU3RhdGUobGltaXRzOiBNaXNzaWxlTGltaXRzID0ge1xuICBzcGVlZE1pbjogTUlTU0lMRV9NSU5fU1BFRUQsXG4gIHNwZWVkTWF4OiBNSVNTSUxFX01BWF9TUEVFRCxcbiAgYWdyb01pbjogTUlTU0lMRV9NSU5fQUdSTyxcbn0pOiBBcHBTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgbm93OiAwLFxuICAgIG5vd1N5bmNlZEF0OiB0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiXG4gICAgICA/IHBlcmZvcm1hbmNlLm5vdygpXG4gICAgICA6IERhdGUubm93KCksXG4gICAgbWU6IG51bGwsXG4gICAgZ2hvc3RzOiBbXSxcbiAgICBtaXNzaWxlczogW10sXG4gICAgbWlzc2lsZVJvdXRlczogW10sXG4gICAgYWN0aXZlTWlzc2lsZVJvdXRlSWQ6IG51bGwsXG4gICAgbmV4dE1pc3NpbGVSZWFkeUF0OiAwLFxuICAgIG1pc3NpbGVDb25maWc6IHtcbiAgICAgIHNwZWVkOiAxODAsXG4gICAgICBhZ3JvUmFkaXVzOiA4MDAsXG4gICAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKDE4MCwgODAwLCBsaW1pdHMpLFxuICAgIH0sXG4gICAgbWlzc2lsZUxpbWl0czogbGltaXRzLFxuICAgIHdvcmxkTWV0YToge30sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtaXNzaWxlTGlmZXRpbWVGb3Ioc3BlZWQ6IG51bWJlciwgYWdyb1JhZGl1czogbnVtYmVyLCBsaW1pdHM6IE1pc3NpbGVMaW1pdHMgPSB7XG4gIHNwZWVkTWluOiBNSVNTSUxFX01JTl9TUEVFRCxcbiAgc3BlZWRNYXg6IE1JU1NJTEVfTUFYX1NQRUVELFxuICBhZ3JvTWluOiBNSVNTSUxFX01JTl9BR1JPLFxufSk6IG51bWJlciB7XG4gIGNvbnN0IG1pblNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4gOiBNSVNTSUxFX01JTl9TUEVFRDtcbiAgY29uc3QgbWF4U3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCA6IE1JU1NJTEVfTUFYX1NQRUVEO1xuICBjb25zdCBtaW5BZ3JvID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluIDogTUlTU0lMRV9NSU5fQUdSTztcbiAgY29uc3Qgc3BhbiA9IG1heFNwZWVkIC0gbWluU3BlZWQ7XG4gIGNvbnN0IHNwZWVkTm9ybSA9IHNwYW4gPiAwID8gY2xhbXAoKHNwZWVkIC0gbWluU3BlZWQpIC8gc3BhbiwgMCwgMSkgOiAwO1xuICBjb25zdCBhZGp1c3RlZEFncm8gPSBNYXRoLm1heCgwLCBhZ3JvUmFkaXVzIC0gbWluQWdybyk7XG4gIGNvbnN0IGFncm9Ob3JtID0gY2xhbXAoYWRqdXN0ZWRBZ3JvIC8gTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiwgMCwgMSk7XG4gIGNvbnN0IHJlZHVjdGlvbiA9IHNwZWVkTm9ybSAqIE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSArIGFncm9Ob3JtICogTUlTU0lMRV9MSUZFVElNRV9BR1JPX1BFTkFMVFk7XG4gIGNvbnN0IGJhc2UgPSBNSVNTSUxFX01BWF9MSUZFVElNRTtcbiAgcmV0dXJuIGNsYW1wKGJhc2UgLSByZWR1Y3Rpb24sIE1JU1NJTEVfTUlOX0xJRkVUSU1FLCBNSVNTSUxFX01BWF9MSUZFVElNRSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZU1pc3NpbGVDb25maWcoXG4gIGNmZzogUGFydGlhbDxQaWNrPE1pc3NpbGVDb25maWcsIFwic3BlZWRcIiB8IFwiYWdyb1JhZGl1c1wiPj4sXG4gIGZhbGxiYWNrOiBNaXNzaWxlQ29uZmlnLFxuICBsaW1pdHM6IE1pc3NpbGVMaW1pdHMsXG4pOiBNaXNzaWxlQ29uZmlnIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBiYXNlID0gZmFsbGJhY2sgPz8ge1xuICAgIHNwZWVkOiBtaW5TcGVlZCxcbiAgICBhZ3JvUmFkaXVzOiBtaW5BZ3JvLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IobWluU3BlZWQsIG1pbkFncm8sIGxpbWl0cyksXG4gIH07XG4gIGNvbnN0IG1lcmdlZFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA/IChjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgOiBiYXNlLnNwZWVkO1xuICBjb25zdCBtZXJnZWRBZ3JvID0gTnVtYmVyLmlzRmluaXRlKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgPyAoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA6IGJhc2UuYWdyb1JhZGl1cztcbiAgY29uc3Qgc3BlZWQgPSBjbGFtcChtZXJnZWRTcGVlZCwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgY29uc3QgYWdyb1JhZGl1cyA9IE1hdGgubWF4KG1pbkFncm8sIG1lcmdlZEFncm8pO1xuICByZXR1cm4ge1xuICAgIHNwZWVkLFxuICAgIGFncm9SYWRpdXMsXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihzcGVlZCwgYWdyb1JhZGl1cywgbGltaXRzKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vbm90b25pY05vdygpOiBudW1iZXIge1xuICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgfVxuICByZXR1cm4gRGF0ZS5ub3coKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lV2F5cG9pbnRMaXN0KGxpc3Q6IFdheXBvaW50W10gfCB1bmRlZmluZWQgfCBudWxsKTogV2F5cG9pbnRbXSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShsaXN0KSkgcmV0dXJuIFtdO1xuICByZXR1cm4gbGlzdC5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlOiBBcHBTdGF0ZSwgbGltaXRzOiBQYXJ0aWFsPE1pc3NpbGVMaW1pdHM+KTogdm9pZCB7XG4gIHN0YXRlLm1pc3NpbGVMaW1pdHMgPSB7XG4gICAgc3BlZWRNaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4sXG4gICAgc3BlZWRNYXg6IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4ISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXgsXG4gICAgYWdyb01pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuYWdyb01pbixcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyB0eXBlIEV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQge1xuICB0eXBlIEFwcFN0YXRlLFxuICB0eXBlIE1pc3NpbGVSb3V0ZSxcbiAgbW9ub3RvbmljTm93LFxuICBzYW5pdGl6ZU1pc3NpbGVDb25maWcsXG4gIHVwZGF0ZU1pc3NpbGVMaW1pdHMsXG59IGZyb20gXCIuL3N0YXRlXCI7XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVSb3V0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU/OiBzdHJpbmc7XG4gIHdheXBvaW50cz86IFNlcnZlck1pc3NpbGVXYXlwb2ludFtdO1xufVxuXG5pbnRlcmZhY2UgU2VydmVySGVhdFZpZXcge1xuICB2OiBudW1iZXI7ICAvLyBjdXJyZW50IGhlYXQgdmFsdWVcbiAgbTogbnVtYmVyOyAgLy8gbWF4XG4gIHc6IG51bWJlcjsgIC8vIHdhcm5BdFxuICBvOiBudW1iZXI7ICAvLyBvdmVyaGVhdEF0XG4gIG1zOiBudW1iZXI7IC8vIG1hcmtlclNwZWVkXG4gIHN1OiBudW1iZXI7IC8vIHN0YWxsVW50aWwgKHNlcnZlciB0aW1lIHNlY29uZHMpXG59XG5cbmludGVyZmFjZSBTZXJ2ZXJTaGlwU3RhdGUge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgaHA/OiBudW1iZXI7XG4gIGtpbGxzPzogbnVtYmVyO1xuICB3YXlwb2ludHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBzcGVlZD86IG51bWJlciB9PjtcbiAgaGVhdD86IFNlcnZlckhlYXRWaWV3O1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIHNlbGY/OiBib29sZWFuO1xuICBhZ3JvX3JhZGl1czogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyU3RhdGVNZXNzYWdlIHtcbiAgdHlwZTogXCJzdGF0ZVwiO1xuICBub3c6IG51bWJlcjtcbiAgbmV4dF9taXNzaWxlX3JlYWR5PzogbnVtYmVyO1xuICBtZT86IFNlcnZlclNoaXBTdGF0ZSB8IG51bGw7XG4gIGdob3N0cz86IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHZ4OiBudW1iZXI7IHZ5OiBudW1iZXIgfT47XG4gIG1pc3NpbGVzPzogU2VydmVyTWlzc2lsZVN0YXRlW107XG4gIG1pc3NpbGVfcm91dGVzPzogU2VydmVyTWlzc2lsZVJvdXRlW107XG4gIG1pc3NpbGVfY29uZmlnPzoge1xuICAgIHNwZWVkPzogbnVtYmVyO1xuICAgIHNwZWVkX21pbj86IG51bWJlcjtcbiAgICBzcGVlZF9tYXg/OiBudW1iZXI7XG4gICAgYWdyb19yYWRpdXM/OiBudW1iZXI7XG4gICAgYWdyb19taW4/OiBudW1iZXI7XG4gICAgbGlmZXRpbWU/OiBudW1iZXI7XG4gIH0gfCBudWxsO1xuICBhY3RpdmVfbWlzc2lsZV9yb3V0ZT86IHN0cmluZyB8IG51bGw7XG4gIG1ldGE/OiB7XG4gICAgYz86IG51bWJlcjtcbiAgICB3PzogbnVtYmVyO1xuICAgIGg/OiBudW1iZXI7XG4gIH07XG59XG5cbmludGVyZmFjZSBDb25uZWN0T3B0aW9ucyB7XG4gIHJvb206IHN0cmluZztcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBvblN0YXRlVXBkYXRlZD86ICgpID0+IHZvaWQ7XG4gIG9uT3Blbj86IChzb2NrZXQ6IFdlYlNvY2tldCkgPT4gdm9pZDtcbiAgbWFwVz86IG51bWJlcjtcbiAgbWFwSD86IG51bWJlcjtcbn1cblxubGV0IHdzOiBXZWJTb2NrZXQgfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIHNlbmRNZXNzYWdlKHBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcbiAgaWYgKCF3cyB8fCB3cy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikgcmV0dXJuO1xuICBjb25zdCBkYXRhID0gdHlwZW9mIHBheWxvYWQgPT09IFwic3RyaW5nXCIgPyBwYXlsb2FkIDogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCk7XG4gIHdzLnNlbmQoZGF0YSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0V2ViU29ja2V0KHsgcm9vbSwgc3RhdGUsIGJ1cywgb25TdGF0ZVVwZGF0ZWQsIG9uT3BlbiwgbWFwVywgbWFwSCB9OiBDb25uZWN0T3B0aW9ucyk6IHZvaWQge1xuICBjb25zdCBwcm90b2NvbCA9IHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gXCJodHRwczpcIiA/IFwid3NzOi8vXCIgOiBcIndzOi8vXCI7XG4gIGxldCB3c1VybCA9IGAke3Byb3RvY29sfSR7d2luZG93LmxvY2F0aW9uLmhvc3R9L3dzP3Jvb209JHtlbmNvZGVVUklDb21wb25lbnQocm9vbSl9YDtcbiAgaWYgKG1hcFcgJiYgbWFwVyA+IDApIHtcbiAgICB3c1VybCArPSBgJm1hcFc9JHttYXBXfWA7XG4gIH1cbiAgaWYgKG1hcEggJiYgbWFwSCA+IDApIHtcbiAgICB3c1VybCArPSBgJm1hcEg9JHttYXBIfWA7XG4gIH1cbiAgd3MgPSBuZXcgV2ViU29ja2V0KHdzVXJsKTtcbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm9wZW5cIiwgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFwiW3dzXSBvcGVuXCIpO1xuICAgIGNvbnN0IHNvY2tldCA9IHdzO1xuICAgIGlmIChzb2NrZXQgJiYgb25PcGVuKSB7XG4gICAgICBvbk9wZW4oc29ja2V0KTtcbiAgICB9XG4gIH0pO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwiY2xvc2VcIiwgKCkgPT4gY29uc29sZS5sb2coXCJbd3NdIGNsb3NlXCIpKTtcblxuICBsZXQgcHJldlJvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+KCk7XG4gIGxldCBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgcHJldk1pc3NpbGVDb3VudCA9IDA7XG5cbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgZGF0YSA9IHNhZmVQYXJzZShldmVudC5kYXRhKTtcbiAgICBpZiAoIWRhdGEgfHwgZGF0YS50eXBlICE9PSBcInN0YXRlXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaGFuZGxlU3RhdGVNZXNzYWdlKHN0YXRlLCBkYXRhLCBidXMsIHByZXZSb3V0ZXMsIHByZXZBY3RpdmVSb3V0ZSwgcHJldk1pc3NpbGVDb3VudCk7XG4gICAgcHJldlJvdXRlcyA9IG5ldyBNYXAoc3RhdGUubWlzc2lsZVJvdXRlcy5tYXAoKHJvdXRlKSA9PiBbcm91dGUuaWQsIGNsb25lUm91dGUocm91dGUpXSkpO1xuICAgIHByZXZBY3RpdmVSb3V0ZSA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIHByZXZNaXNzaWxlQ291bnQgPSBzdGF0ZS5taXNzaWxlcy5sZW5ndGg7XG4gICAgYnVzLmVtaXQoXCJzdGF0ZTp1cGRhdGVkXCIpO1xuICAgIG9uU3RhdGVVcGRhdGVkPy4oKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVN0YXRlTWVzc2FnZShcbiAgc3RhdGU6IEFwcFN0YXRlLFxuICBtc2c6IFNlcnZlclN0YXRlTWVzc2FnZSxcbiAgYnVzOiBFdmVudEJ1cyxcbiAgcHJldlJvdXRlczogTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPixcbiAgcHJldkFjdGl2ZVJvdXRlOiBzdHJpbmcgfCBudWxsLFxuICBwcmV2TWlzc2lsZUNvdW50OiBudW1iZXIsXG4pOiB2b2lkIHtcbiAgc3RhdGUubm93ID0gbXNnLm5vdztcbiAgc3RhdGUubm93U3luY2VkQXQgPSBtb25vdG9uaWNOb3coKTtcbiAgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0ID0gTnVtYmVyLmlzRmluaXRlKG1zZy5uZXh0X21pc3NpbGVfcmVhZHkpID8gbXNnLm5leHRfbWlzc2lsZV9yZWFkeSEgOiAwO1xuICBzdGF0ZS5tZSA9IG1zZy5tZSA/IHtcbiAgICB4OiBtc2cubWUueCxcbiAgICB5OiBtc2cubWUueSxcbiAgICB2eDogbXNnLm1lLnZ4LFxuICAgIHZ5OiBtc2cubWUudnksXG4gICAgaHA6IG1zZy5tZS5ocCxcbiAgICBraWxsczogbXNnLm1lLmtpbGxzID8/IDAsXG4gICAgd2F5cG9pbnRzOiBBcnJheS5pc0FycmF5KG1zZy5tZS53YXlwb2ludHMpXG4gICAgICA/IG1zZy5tZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHsgeDogd3AueCwgeTogd3AueSwgc3BlZWQ6IE51bWJlci5pc0Zpbml0ZSh3cC5zcGVlZCkgPyB3cC5zcGVlZCEgOiAxODAgfSkpXG4gICAgICA6IFtdLFxuICAgIGhlYXQ6IG1zZy5tZS5oZWF0ID8gY29udmVydEhlYXRWaWV3KG1zZy5tZS5oZWF0LCBzdGF0ZS5ub3dTeW5jZWRBdCwgc3RhdGUubm93KSA6IHVuZGVmaW5lZCxcbiAgfSA6IG51bGw7XG4gIHN0YXRlLmdob3N0cyA9IEFycmF5LmlzQXJyYXkobXNnLmdob3N0cykgPyBtc2cuZ2hvc3RzLnNsaWNlKCkgOiBbXTtcbiAgc3RhdGUubWlzc2lsZXMgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlcykgPyBtc2cubWlzc2lsZXMuc2xpY2UoKSA6IFtdO1xuXG4gIGNvbnN0IHJvdXRlc0Zyb21TZXJ2ZXIgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlX3JvdXRlcykgPyBtc2cubWlzc2lsZV9yb3V0ZXMgOiBbXTtcbiAgY29uc3QgbmV3Um91dGVzOiBNaXNzaWxlUm91dGVbXSA9IHJvdXRlc0Zyb21TZXJ2ZXIubWFwKChyb3V0ZSkgPT4gKHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSB8fCByb3V0ZS5pZCB8fCBcIlJvdXRlXCIsXG4gICAgd2F5cG9pbnRzOiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cylcbiAgICAgID8gcm91dGUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7IHg6IHdwLngsIHk6IHdwLnkgfSkpXG4gICAgICA6IFtdLFxuICB9KSk7XG5cbiAgZGlmZlJvdXRlcyhwcmV2Um91dGVzLCBuZXdSb3V0ZXMsIGJ1cyk7XG4gIHN0YXRlLm1pc3NpbGVSb3V0ZXMgPSBuZXdSb3V0ZXM7XG5cbiAgY29uc3QgbmV4dEFjdGl2ZSA9IHR5cGVvZiBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGUgPT09IFwic3RyaW5nXCIgJiYgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlLmxlbmd0aCA+IDBcbiAgICA/IG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZVxuICAgIDogbmV3Um91dGVzLmxlbmd0aCA+IDBcbiAgICAgID8gbmV3Um91dGVzWzBdLmlkXG4gICAgICA6IG51bGw7XG4gIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dEFjdGl2ZTtcbiAgaWYgKG5leHRBY3RpdmUgIT09IHByZXZBY3RpdmVSb3V0ZSkge1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIiwgeyByb3V0ZUlkOiBuZXh0QWN0aXZlID8/IG51bGwgfSk7XG4gIH1cblxuICBpZiAobXNnLm1pc3NpbGVfY29uZmlnKSB7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluKSB8fCBOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCkgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5hZ3JvX21pbikpIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGUsIHtcbiAgICAgICAgc3BlZWRNaW46IG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9taW4sXG4gICAgICAgIHNwZWVkTWF4OiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWF4LFxuICAgICAgICBhZ3JvTWluOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4sXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKHtcbiAgICAgIHNwZWVkOiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWQsXG4gICAgICBhZ3JvUmFkaXVzOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19yYWRpdXMsXG4gICAgfSwgc3RhdGUubWlzc2lsZUNvbmZpZywgc3RhdGUubWlzc2lsZUxpbWl0cyk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcubGlmZXRpbWUpKSB7XG4gICAgICBzYW5pdGl6ZWQubGlmZXRpbWUgPSBtc2cubWlzc2lsZV9jb25maWcubGlmZXRpbWUhO1xuICAgIH1cbiAgICBzdGF0ZS5taXNzaWxlQ29uZmlnID0gc2FuaXRpemVkO1xuICB9XG5cbiAgY29uc3QgbWV0YSA9IG1zZy5tZXRhID8/IHt9O1xuICBjb25zdCBoYXNDID0gdHlwZW9mIG1ldGEuYyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5jKTtcbiAgY29uc3QgaGFzVyA9IHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudyk7XG4gIGNvbnN0IGhhc0ggPSB0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpO1xuICBzdGF0ZS53b3JsZE1ldGEgPSB7XG4gICAgYzogaGFzQyA/IG1ldGEuYyEgOiBzdGF0ZS53b3JsZE1ldGEuYyxcbiAgICB3OiBoYXNXID8gbWV0YS53ISA6IHN0YXRlLndvcmxkTWV0YS53LFxuICAgIGg6IGhhc0ggPyBtZXRhLmghIDogc3RhdGUud29ybGRNZXRhLmgsXG4gIH07XG5cbiAgaWYgKHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA+IHByZXZNaXNzaWxlQ291bnQpIHtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZUlkID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgaWYgKGFjdGl2ZVJvdXRlSWQpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IGFjdGl2ZVJvdXRlSWQgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IFwiXCIgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY29vbGRvd25SZW1haW5pbmcgPSBNYXRoLm1heCgwLCBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpKTtcbiAgYnVzLmVtaXQoXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiLCB7IHNlY29uZHNSZW1haW5pbmc6IGNvb2xkb3duUmVtYWluaW5nIH0pO1xufVxuXG5mdW5jdGlvbiBkaWZmUm91dGVzKHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sIG5leHRSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdLCBidXM6IEV2ZW50QnVzKTogdm9pZCB7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByb3V0ZSBvZiBuZXh0Um91dGVzKSB7XG4gICAgc2Vlbi5hZGQocm91dGUuaWQpO1xuICAgIGNvbnN0IHByZXYgPSBwcmV2Um91dGVzLmdldChyb3V0ZS5pZCk7XG4gICAgaWYgKCFwcmV2KSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChyb3V0ZS5uYW1lICE9PSBwcmV2Lm5hbWUpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgbmFtZTogcm91dGUubmFtZSB9KTtcbiAgICB9XG4gICAgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPiBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgICB9IGVsc2UgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPCBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHByZXYud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfVxuICAgIGlmIChwcmV2LndheXBvaW50cy5sZW5ndGggPiAwICYmIHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgW3JvdXRlSWRdIG9mIHByZXZSb3V0ZXMpIHtcbiAgICBpZiAoIXNlZW4uaGFzKHJvdXRlSWQpKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVEZWxldGVkXCIsIHsgcm91dGVJZCB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xvbmVSb3V0ZShyb3V0ZTogTWlzc2lsZVJvdXRlKTogTWlzc2lsZVJvdXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSxcbiAgICB3YXlwb2ludHM6IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHNhZmVQYXJzZSh2YWx1ZTogdW5rbm93bik6IFNlcnZlclN0YXRlTWVzc2FnZSB8IG51bGwge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSkgYXMgU2VydmVyU3RhdGVNZXNzYWdlO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLndhcm4oXCJbd3NdIGZhaWxlZCB0byBwYXJzZSBtZXNzYWdlXCIsIGVycik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShzdGF0ZS5ub3cpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgY29uc3Qgc3luY2VkQXQgPSBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93U3luY2VkQXQpID8gc3RhdGUubm93U3luY2VkQXQgOiBudWxsO1xuICBpZiAoIXN5bmNlZEF0KSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICBjb25zdCBlbGFwc2VkTXMgPSBtb25vdG9uaWNOb3coKSAtIHN5bmNlZEF0O1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShlbGFwc2VkTXMpIHx8IGVsYXBzZWRNcyA8IDApIHtcbiAgICByZXR1cm4gc3RhdGUubm93O1xuICB9XG4gIHJldHVybiBzdGF0ZS5ub3cgKyBlbGFwc2VkTXMgLyAxMDAwO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0SGVhdFZpZXcoc2VydmVySGVhdDogU2VydmVySGVhdFZpZXcsIG5vd1N5bmNlZEF0TXM6IG51bWJlciwgc2VydmVyTm93U2VjOiBudW1iZXIpOiBpbXBvcnQoXCIuL3N0YXRlXCIpLkhlYXRWaWV3IHtcbiAgLy8gQ29udmVydCBzZXJ2ZXIgdGltZSAoc3RhbGxVbnRpbCBpbiBzZWNvbmRzKSB0byBjbGllbnQgdGltZSAobWlsbGlzZWNvbmRzKVxuICAvLyBzdGFsbFVudGlsIGlzIGFic29sdXRlIHNlcnZlciB0aW1lLCBzbyB3ZSBuZWVkIHRvIGNvbnZlcnQgaXQgdG8gY2xpZW50IHRpbWVcbiAgY29uc3Qgc2VydmVyU3RhbGxVbnRpbFNlYyA9IHNlcnZlckhlYXQuc3U7XG4gIGNvbnN0IG9mZnNldEZyb21Ob3dTZWMgPSBzZXJ2ZXJTdGFsbFVudGlsU2VjIC0gc2VydmVyTm93U2VjO1xuICBjb25zdCBzdGFsbFVudGlsTXMgPSBub3dTeW5jZWRBdE1zICsgKG9mZnNldEZyb21Ob3dTZWMgKiAxMDAwKTtcblxuICBjb25zdCBoZWF0VmlldyA9IHtcbiAgICB2YWx1ZTogc2VydmVySGVhdC52LFxuICAgIG1heDogc2VydmVySGVhdC5tLFxuICAgIHdhcm5BdDogc2VydmVySGVhdC53LFxuICAgIG92ZXJoZWF0QXQ6IHNlcnZlckhlYXQubyxcbiAgICBtYXJrZXJTcGVlZDogc2VydmVySGVhdC5tcyxcbiAgICBzdGFsbFVudGlsTXM6IHN0YWxsVW50aWxNcyxcbiAgfTtcblxuICAvLyBEZWJ1ZyBsb2dnaW5nIChjYW4gYmUgcmVtb3ZlZCBhZnRlciB2ZXJpZmljYXRpb24pXG4gIGlmIChzZXJ2ZXJIZWF0LnYgPiAwKSB7XG4gICAgY29uc29sZS5sb2coXCJbaGVhdF0gUmVjZWl2ZWQgaGVhdCBkYXRhOlwiLCBoZWF0Vmlldyk7XG4gIH1cblxuICByZXR1cm4gaGVhdFZpZXc7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHsgZ2V0QXBwcm94U2VydmVyTm93LCBzZW5kTWVzc2FnZSB9IGZyb20gXCIuL25ldFwiO1xuaW1wb3J0IHtcbiAgdHlwZSBBY3RpdmVUb29sLFxuICB0eXBlIEFwcFN0YXRlLFxuICB0eXBlIE1pc3NpbGVSb3V0ZSxcbiAgdHlwZSBNaXNzaWxlU2VsZWN0aW9uLFxuICB0eXBlIFNlbGVjdGlvbixcbiAgdHlwZSBVSVN0YXRlLFxuICBjbGFtcCxcbiAgc2FuaXRpemVNaXNzaWxlQ29uZmlnLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHtcbiAgTUlTU0lMRV9NSU5fU1BFRUQsXG4gIE1JU1NJTEVfTUFYX1NQRUVELFxuICBNSVNTSUxFX01JTl9BR1JPLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG5pbnRlcmZhY2UgSW5pdEdhbWVPcHRpb25zIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xufVxuXG5pbnRlcmZhY2UgR2FtZUNvbnRyb2xsZXIge1xuICBvblN0YXRlVXBkYXRlZCgpOiB2b2lkO1xufVxuXG5sZXQgc3RhdGVSZWY6IEFwcFN0YXRlO1xubGV0IHVpU3RhdGVSZWY6IFVJU3RhdGU7XG5sZXQgYnVzUmVmOiBFdmVudEJ1cztcblxubGV0IGN2OiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEIHwgbnVsbCA9IG51bGw7XG5sZXQgSFBzcGFuOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGtpbGxzU3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwQ29udHJvbHNDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBDbGVhckJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFJvdXRlc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwUm91dGVMZWc6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFJvdXRlU3BlZWQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcERlbGV0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTcGVlZFNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTcGVlZFZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgbWlzc2lsZUNvbnRyb2xzQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWRkUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUxhdW5jaEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlTGF1bmNoVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlTGF1bmNoSW5mbzogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZURlbGV0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTcGVlZFNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTcGVlZFZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVBZ3JvQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb1NsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVBZ3JvVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3Bhd25Cb3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3Bhd25Cb3RUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgcm91dGVQcmV2QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJvdXRlTmV4dEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByb3V0ZU1lbnVUb2dnbGU6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcm91dGVNZW51OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBkZWxldGVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVSb3V0ZU5hbWVMYWJlbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlUm91dGVDb3VudExhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgaGVscFRvZ2dsZTogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwQ2xvc2VCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVscFRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCBoZWF0QmFyRmlsbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWF0VmFsdWVUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNwZWVkTWFya2VyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHN0YWxsT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IHNlbGVjdGlvbjogU2VsZWN0aW9uIHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xubGV0IGRlZmF1bHRTcGVlZCA9IDE1MDtcbmxldCBsYXN0TG9vcFRzOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmxldCBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQ6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcbmNvbnN0IGxlZ0Rhc2hPZmZzZXRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbmxldCBsYXN0TWlzc2lsZUxhdW5jaFRleHRIVE1MID0gXCJcIjtcbmxldCBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gXCJcIjtcbmxldCBsYXN0VG91Y2hEaXN0YW5jZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgcGVuZGluZ1RvdWNoVGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcbmxldCBpc1BpbmNoaW5nID0gZmFsc2U7XG5cbmNvbnN0IE1JTl9aT09NID0gMS4wOyBcbmNvbnN0IE1BWF9aT09NID0gMy4wO1xuXG5jb25zdCBIRUxQX1RFWFQgPSBbXG4gIFwiUHJpbWFyeSBNb2Rlc1wiLFxuICBcIiAgMSBcdTIwMTMgVG9nZ2xlIHNoaXAgbmF2aWdhdGlvbiBtb2RlXCIsXG4gIFwiICAyIFx1MjAxMyBUb2dnbGUgbWlzc2lsZSBjb29yZGluYXRpb24gbW9kZVwiLFxuICBcIlwiLFxuICBcIlNoaXAgTmF2aWdhdGlvblwiLFxuICBcIiAgVCBcdTIwMTMgU3dpdGNoIGJldHdlZW4gc2V0L3NlbGVjdFwiLFxuICBcIiAgQyBcdTIwMTMgQ2xlYXIgYWxsIHdheXBvaW50c1wiLFxuICBcIiAgUiBcdTIwMTMgVG9nZ2xlIHNob3cgcm91dGVcIixcbiAgXCIgIFsgLyBdIFx1MjAxMyBBZGp1c3Qgd2F5cG9pbnQgc3BlZWRcIixcbiAgXCIgIFNoaWZ0K1sgLyBdIFx1MjAxMyBDb2Fyc2Ugc3BlZWQgYWRqdXN0XCIsXG4gIFwiICBUYWIgLyBTaGlmdCtUYWIgXHUyMDEzIEN5Y2xlIHdheXBvaW50c1wiLFxuICBcIiAgRGVsZXRlIFx1MjAxMyBEZWxldGUgZnJvbSBzZWxlY3RlZCB3YXlwb2ludFwiLFxuICBcIlwiLFxuICBcIk1pc3NpbGUgQ29vcmRpbmF0aW9uXCIsXG4gIFwiICBOIFx1MjAxMyBBZGQgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgXCIgIEwgXHUyMDEzIExhdW5jaCBtaXNzaWxlc1wiLFxuICBcIiAgRSBcdTIwMTMgU3dpdGNoIGJldHdlZW4gc2V0L3NlbGVjdFwiLFxuICBcIiAgLCAvIC4gXHUyMDEzIEFkanVzdCBhZ3JvIHJhZGl1c1wiLFxuICBcIiAgOyAvICcgXHUyMDEzIEFkanVzdCBtaXNzaWxlIHNwZWVkXCIsXG4gIFwiICBTaGlmdCtzbGlkZXIga2V5cyBcdTIwMTMgQ29hcnNlIGFkanVzdFwiLFxuICBcIiAgRGVsZXRlIFx1MjAxMyBEZWxldGUgc2VsZWN0ZWQgbWlzc2lsZSB3YXlwb2ludFwiLFxuICBcIlwiLFxuICBcIk1hcCBDb250cm9sc1wiLFxuICBcIiAgKy8tIFx1MjAxMyBab29tIGluL291dFwiLFxuICBcIiAgQ3RybCswIFx1MjAxMyBSZXNldCB6b29tXCIsXG4gIFwiICBNb3VzZSB3aGVlbCBcdTIwMTMgWm9vbSBhdCBjdXJzb3JcIixcbiAgXCIgIFBpbmNoIFx1MjAxMyBab29tIG9uIHRvdWNoIGRldmljZXNcIixcbiAgXCJcIixcbiAgXCJHZW5lcmFsXCIsXG4gIFwiICA/IFx1MjAxMyBUb2dnbGUgdGhpcyBvdmVybGF5XCIsXG4gIFwiICBFc2MgXHUyMDEzIENhbmNlbCBzZWxlY3Rpb24gb3IgY2xvc2Ugb3ZlcmxheVwiLFxuXS5qb2luKFwiXFxuXCIpO1xuXG5jb25zdCB3b3JsZCA9IHsgdzogODAwMCwgaDogNDUwMCB9O1xuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH06IEluaXRHYW1lT3B0aW9ucyk6IEdhbWVDb250cm9sbGVyIHtcbiAgc3RhdGVSZWYgPSBzdGF0ZTtcbiAgdWlTdGF0ZVJlZiA9IHVpU3RhdGU7XG4gIGJ1c1JlZiA9IGJ1cztcblxuICBjYWNoZURvbSgpO1xuICBpZiAoIWN2KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FudmFzIGVsZW1lbnQgI2N2IG5vdCBmb3VuZFwiKTtcbiAgfVxuICBjdHggPSBjdi5nZXRDb250ZXh0KFwiMmRcIik7XG5cbiAgYmluZExpc3RlbmVycygpO1xuICBzeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk7XG4gIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB1cGRhdGVIZWxwT3ZlcmxheSgpO1xuICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk7XG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcblxuICByZXR1cm4ge1xuICAgIG9uU3RhdGVVcGRhdGVkKCkge1xuICAgICAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gICAgICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gY2FjaGVEb20oKTogdm9pZCB7XG4gIGN2ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdlwiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gIGN0eCA9IGN2Py5nZXRDb250ZXh0KFwiMmRcIikgPz8gbnVsbDtcbiAgSFBzcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWhwXCIpO1xuICBzaGlwQ29udHJvbHNDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNvbnRyb2xzXCIpO1xuICBzaGlwQ2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTZWxlY3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc2hpcFJvdXRlc0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZXNcIik7XG4gIHNoaXBSb3V0ZUxlZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZS1sZWdcIik7XG4gIHNoaXBSb3V0ZVNwZWVkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXJvdXRlLXNwZWVkXCIpO1xuICBzaGlwRGVsZXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTcGVlZENhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtY2FyZFwiKTtcbiAgc2hpcFNwZWVkU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgc2hpcFNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtdmFsdWVcIik7XG5cbiAgbWlzc2lsZUNvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1jb250cm9sc1wiKTtcbiAgbWlzc2lsZUFkZFJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFkZC1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVMYXVuY2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZUxhdW5jaFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoLXRleHRcIik7XG4gIG1pc3NpbGVMYXVuY2hJbmZvID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaC1pbmZvXCIpO1xuICBtaXNzaWxlU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVTZWxlY3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2VsZWN0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZURlbGV0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1kZWxldGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU3BlZWRDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLWNhcmRcIik7XG4gIG1pc3NpbGVTcGVlZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVTcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLXZhbHVlXCIpO1xuICBtaXNzaWxlQWdyb0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1jYXJkXCIpO1xuICBtaXNzaWxlQWdyb1NsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZUFncm9WYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXZhbHVlXCIpO1xuXG4gIHNwYXduQm90QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGF3bi1ib3RcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzcGF3bkJvdFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdC10ZXh0XCIpO1xuICBraWxsc1NwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAta2lsbHNcIik7XG4gIHJvdXRlUHJldkJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtcHJldlwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHJvdXRlTmV4dEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbmV4dFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHJvdXRlTWVudVRvZ2dsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbWVudS10b2dnbGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZU1lbnUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW1lbnVcIik7XG4gIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVuYW1lLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBkZWxldGVNaXNzaWxlUm91dGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlbGV0ZS1taXNzaWxlLXJvdXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjbGVhci1taXNzaWxlLXdheXBvaW50c1wiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVSb3V0ZU5hbWVMYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1yb3V0ZS1uYW1lXCIpO1xuICBtaXNzaWxlUm91dGVDb3VudExhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXJvdXRlLWNvdW50XCIpO1xuXG4gIGhlbHBUb2dnbGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtdG9nZ2xlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgaGVscE92ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtb3ZlcmxheVwiKTtcbiAgaGVscENsb3NlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLWNsb3NlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgaGVscFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtdGV4dFwiKTtcblxuICBoZWF0QmFyRmlsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItZmlsbFwiKTtcbiAgaGVhdFZhbHVlVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC12YWx1ZS10ZXh0XCIpO1xuICBzcGVlZE1hcmtlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3BlZWQtbWFya2VyXCIpO1xuICBzdGFsbE92ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YWxsLW92ZXJsYXlcIik7XG5cbiAgZGVmYXVsdFNwZWVkID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXI/LnZhbHVlID8/IFwiMTUwXCIpO1xufVxuXG5mdW5jdGlvbiBiaW5kTGlzdGVuZXJzKCk6IHZvaWQge1xuICBpZiAoIWN2KSByZXR1cm47XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCBvbkNhbnZhc1BvaW50ZXJEb3duKTtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcIndoZWVsXCIsIG9uQ2FudmFzV2hlZWwsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaHN0YXJ0XCIsIG9uQ2FudmFzVG91Y2hTdGFydCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCBvbkNhbnZhc1RvdWNoTW92ZSwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIG9uQ2FudmFzVG91Y2hFbmQsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG5cbiAgc3Bhd25Cb3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgaWYgKHNwYXduQm90QnRuLmRpc2FibGVkKSByZXR1cm47XG5cbiAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwic3Bhd25fYm90XCIgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIik7XG5cbiAgICAvLyBEaXNhYmxlIGJ1dHRvbiBhbmQgdXBkYXRlIHRleHRcbiAgICBzcGF3bkJvdEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgaWYgKHNwYXduQm90VGV4dCkge1xuICAgICAgc3Bhd25Cb3RUZXh0LnRleHRDb250ZW50ID0gXCJTcGF3bmVkXCI7XG4gICAgfVxuXG4gICAgLy8gUmUtZW5hYmxlIGFmdGVyIDUgc2Vjb25kc1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKHNwYXduQm90QnRuKSB7XG4gICAgICAgIHNwYXduQm90QnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoc3Bhd25Cb3RUZXh0KSB7XG4gICAgICAgIHNwYXduQm90VGV4dC50ZXh0Q29udGVudCA9IFwiQm90XCI7XG4gICAgICB9XG4gICAgfSwgNTAwMCk7XG4gIH0pO1xuXG4gIHNoaXBDbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIGNsZWFyU2hpcFJvdXRlKCk7XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOmNsZWFySW52b2tlZFwiKTtcbiAgfSk7XG5cbiAgc2hpcFNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gIH0pO1xuXG4gIHNoaXBTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2VsZWN0XCIpO1xuICB9KTtcblxuICBzaGlwU3BlZWRTbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcnNlRmxvYXQoKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSByZXR1cm47XG4gICAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG4gICAgZGVmYXVsdFNwZWVkID0gdmFsdWU7XG4gICAgaWYgKHNlbGVjdGlvbiAmJiBzdGF0ZVJlZi5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgJiYgc3RhdGVSZWYubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0pIHtcbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJ1cGRhdGVfd2F5cG9pbnRcIiwgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCwgc3BlZWQ6IHZhbHVlIH0pO1xuICAgICAgc3RhdGVSZWYubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0uc3BlZWQgPSB2YWx1ZTtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICB9XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBzaGlwRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZUFkZFJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF9taXNzaWxlX3JvdXRlXCIgfSk7XG4gIH0pO1xuXG4gIG1pc3NpbGVMYXVuY2hCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gIH0pO1xuXG4gIG1pc3NpbGVTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2VsZWN0XCIpO1xuICB9KTtcblxuICBtaXNzaWxlRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNwZWVkU2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHZhbHVlKSkgcmV0dXJuO1xuICAgIHVwZGF0ZU1pc3NpbGVDb25maWdGcm9tVUkoeyBzcGVlZDogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBtaXNzaWxlQWdyb1NsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKHsgYWdyb1JhZGl1czogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmFncm9DaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gIH0pO1xuXG4gIHJvdXRlUHJldkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKC0xKSk7XG4gIHJvdXRlTmV4dEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKDEpKTtcblxuICByb3V0ZU1lbnVUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGlmICghcm91dGVNZW51IHx8ICFyb3V0ZU1lbnUuY2xhc3NMaXN0LmNvbnRhaW5zKFwidmlzaWJsZVwiKSkgcmV0dXJuO1xuICAgIGlmIChldmVudC50YXJnZXQgPT09IHJvdXRlTWVudVRvZ2dsZSkgcmV0dXJuO1xuICAgIGlmIChyb3V0ZU1lbnUuY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpKSByZXR1cm47XG4gICAgcm91dGVNZW51LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICB9KTtcblxuICByZW5hbWVNaXNzaWxlUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUpIHJldHVybjtcbiAgICBjb25zdCBuYW1lID0gd2luZG93LnByb21wdChcIlJlbmFtZSByb3V0ZVwiLCByb3V0ZS5uYW1lIHx8IFwiXCIpO1xuICAgIGlmIChuYW1lID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3QgdHJpbW1lZCA9IG5hbWUudHJpbSgpO1xuICAgIGlmICghdHJpbW1lZCkgcmV0dXJuO1xuICAgIHJvdXRlLm5hbWUgPSB0cmltbWVkO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJyZW5hbWVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgcm91dGVfbmFtZTogdHJpbW1lZCxcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgaWYgKCF3aW5kb3cuY29uZmlybShgRGVsZXRlICR7cm91dGUubmFtZX0/YCkpIHJldHVybjtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmIChyb3V0ZXMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJvdXRlLndheXBvaW50cyA9IFtdO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGF0ZVJlZi5taXNzaWxlUm91dGVzID0gcm91dGVzLmZpbHRlcigocikgPT4gci5pZCAhPT0gcm91dGUuaWQpO1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubWlzc2lsZVJvdXRlcztcbiAgICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcmVtYWluaW5nLmxlbmd0aCA+IDAgPyByZW1haW5pbmdbMF0uaWQgOiBudWxsO1xuICAgIH1cbiAgICBtaXNzaWxlU2VsZWN0aW9uID0gbnVsbDtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImRlbGV0ZV9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICByb3V0ZU1lbnU/LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJjbGVhcl9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gW107XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IG51bGw7XG4gICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIH0pO1xuXG4gIGhlbHBUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SGVscFZpc2libGUodHJ1ZSk7XG4gIH0pO1xuXG4gIGhlbHBDbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRIZWxwVmlzaWJsZShmYWxzZSk7XG4gIH0pO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbldpbmRvd0tleURvd24sIHsgY2FwdHVyZTogZmFsc2UgfSk7XG59XG5cbmZ1bmN0aW9uIHNldFpvb20obmV3Wm9vbTogbnVtYmVyLCBjZW50ZXJYPzogbnVtYmVyLCBjZW50ZXJZPzogbnVtYmVyKTogdm9pZCB7XG4gIHVpU3RhdGVSZWYuem9vbSA9IGNsYW1wKG5ld1pvb20sIE1JTl9aT09NLCBNQVhfWk9PTSk7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzV2hlZWwoZXZlbnQ6IFdoZWVsRXZlbnQpOiB2b2lkIHtcbiAgaWYgKCFjdikgcmV0dXJuO1xuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnN0IHJlY3QgPSBjdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3QgY2VudGVyWCA9IGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQ7XG4gIGNvbnN0IGNlbnRlclkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XG5cbiAgY29uc3QgZGVsdGEgPSBldmVudC5kZWx0YVk7XG4gIGNvbnN0IHpvb21GYWN0b3IgPSBkZWx0YSA+IDAgPyAwLjkgOiAxLjE7XG4gIGNvbnN0IG5ld1pvb20gPSB1aVN0YXRlUmVmLnpvb20gKiB6b29tRmFjdG9yO1xuXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gcmVjdC53aWR0aDtcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQ7XG4gIGNvbnN0IGNhbnZhc0NlbnRlclggPSBjZW50ZXJYICogc2NhbGVYO1xuICBjb25zdCBjYW52YXNDZW50ZXJZID0gY2VudGVyWSAqIHNjYWxlWTtcblxuICBzZXRab29tKG5ld1pvb20sIGNhbnZhc0NlbnRlclgsIGNhbnZhc0NlbnRlclkpO1xufVxuXG5mdW5jdGlvbiBnZXRUb3VjaERpc3RhbmNlKHRvdWNoZXM6IFRvdWNoTGlzdCk6IG51bWJlciB8IG51bGwge1xuICBpZiAodG91Y2hlcy5sZW5ndGggPCAyKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZHggPSB0b3VjaGVzWzBdLmNsaWVudFggLSB0b3VjaGVzWzFdLmNsaWVudFg7XG4gIGNvbnN0IGR5ID0gdG91Y2hlc1swXS5jbGllbnRZIC0gdG91Y2hlc1sxXS5jbGllbnRZO1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG5mdW5jdGlvbiBnZXRUb3VjaENlbnRlcih0b3VjaGVzOiBUb3VjaExpc3QpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCBudWxsIHtcbiAgaWYgKHRvdWNoZXMubGVuZ3RoIDwgMikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgeDogKHRvdWNoZXNbMF0uY2xpZW50WCArIHRvdWNoZXNbMV0uY2xpZW50WCkgLyAyLFxuICAgIHk6ICh0b3VjaGVzWzBdLmNsaWVudFkgKyB0b3VjaGVzWzFdLmNsaWVudFkpIC8gMlxuICB9O1xufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoU3RhcnQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAyKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBpc1BpbmNoaW5nID0gdHJ1ZTtcbiAgICBsYXN0VG91Y2hEaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG5cbiAgICAvLyBDYW5jZWwgYW55IHBlbmRpbmcgd2F5cG9pbnQgcGxhY2VtZW50XG4gICAgaWYgKHBlbmRpbmdUb3VjaFRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoTW92ZShldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8IGV2ZW50LnRvdWNoZXMubGVuZ3RoICE9PSAyKSB7XG4gICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBudWxsO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gIGNvbnN0IGN1cnJlbnREaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG4gIGlmIChjdXJyZW50RGlzdGFuY2UgPT09IG51bGwgfHwgbGFzdFRvdWNoRGlzdGFuY2UgPT09IG51bGwpIHJldHVybjtcblxuICBjb25zdCByZWN0ID0gY3YuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGNvbnN0IGNlbnRlciA9IGdldFRvdWNoQ2VudGVyKGV2ZW50LnRvdWNoZXMpO1xuICBpZiAoIWNlbnRlcikgcmV0dXJuO1xuXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gcmVjdC53aWR0aDtcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQ7XG4gIGNvbnN0IGNhbnZhc0NlbnRlclggPSAoY2VudGVyLnggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICBjb25zdCBjYW52YXNDZW50ZXJZID0gKGNlbnRlci55IC0gcmVjdC50b3ApICogc2NhbGVZO1xuXG4gIGNvbnN0IHpvb21GYWN0b3IgPSBjdXJyZW50RGlzdGFuY2UgLyBsYXN0VG91Y2hEaXN0YW5jZTtcbiAgY29uc3QgbmV3Wm9vbSA9IHVpU3RhdGVSZWYuem9vbSAqIHpvb21GYWN0b3I7XG5cbiAgc2V0Wm9vbShuZXdab29tLCBjYW52YXNDZW50ZXJYLCBjYW52YXNDZW50ZXJZKTtcbiAgbGFzdFRvdWNoRGlzdGFuY2UgPSBjdXJyZW50RGlzdGFuY2U7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzVG91Y2hFbmQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoIDwgMikge1xuICAgIGxhc3RUb3VjaERpc3RhbmNlID0gbnVsbDtcbiAgICAvLyBSZXNldCBwaW5jaGluZyBmbGFnIGFmdGVyIGEgc2hvcnQgZGVsYXkgdG8gcHJldmVudCB3YXlwb2ludCBwbGFjZW1lbnRcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlzUGluY2hpbmcgPSBmYWxzZTtcbiAgICB9LCAxMDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlckRvd24oZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8ICFjdHgpIHJldHVybjtcbiAgaWYgKGhlbHBPdmVybGF5Py5jbGFzc0xpc3QuY29udGFpbnMoXCJ2aXNpYmxlXCIpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChsYXN0VG91Y2hEaXN0YW5jZSAhPT0gbnVsbCB8fCBpc1BpbmNoaW5nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgcmVjdCA9IGN2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBjb25zdCBzY2FsZVggPSByZWN0LndpZHRoICE9PSAwID8gY3Yud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgY29uc3Qgc2NhbGVZID0gcmVjdC5oZWlnaHQgIT09IDAgPyBjdi5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gIGNvbnN0IHggPSAoZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdCkgKiBzY2FsZVg7XG4gIGNvbnN0IHkgPSAoZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wKSAqIHNjYWxlWTtcbiAgY29uc3QgY2FudmFzUG9pbnQgPSB7IHgsIHkgfTtcbiAgY29uc3Qgd29ybGRQb2ludCA9IGNhbnZhc1RvV29ybGQoY2FudmFzUG9pbnQpO1xuXG4gIGNvbnN0IGNvbnRleHQgPSB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgPyBcIm1pc3NpbGVcIiA6IFwic2hpcFwiO1xuXG4gIC8vIEZvciB0b3VjaCBldmVudHMsIGRlbGF5IHdheXBvaW50IHBsYWNlbWVudCB0byBhbGxvdyBmb3IgcGluY2ggZ2VzdHVyZSBkZXRlY3Rpb25cbiAgLy8gRm9yIG1vdXNlIGV2ZW50cywgcGxhY2UgaW1tZWRpYXRlbHlcbiAgaWYgKGV2ZW50LnBvaW50ZXJUeXBlID09PSBcInRvdWNoXCIpIHtcbiAgICBpZiAocGVuZGluZ1RvdWNoVGltZW91dCAhPT0gbnVsbCkge1xuICAgICAgY2xlYXJUaW1lb3V0KHBlbmRpbmdUb3VjaFRpbWVvdXQpO1xuICAgIH1cblxuICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmIChpc1BpbmNoaW5nKSByZXR1cm47IC8vIERvdWJsZS1jaGVjayB3ZSdyZSBub3QgcGluY2hpbmdcblxuICAgICAgaWYgKGNvbnRleHQgPT09IFwibWlzc2lsZVwiKSB7XG4gICAgICAgIGhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGhhbmRsZVNoaXBQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgICAgIH1cbiAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICAgIH0sIDE1MCk7IC8vIDE1MG1zIGRlbGF5IHRvIGRldGVjdCBwaW5jaCBnZXN0dXJlXG4gIH0gZWxzZSB7XG4gICAgLy8gTW91c2UvcGVuOiBpbW1lZGlhdGUgcGxhY2VtZW50XG4gICAgaWYgKGNvbnRleHQgPT09IFwibWlzc2lsZVwiKSB7XG4gICAgICBoYW5kbGVNaXNzaWxlUG9pbnRlcihjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZVNoaXBQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgICB9XG4gIH1cblxuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTcGVlZExhYmVsKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHNoaXBTcGVlZFZhbHVlKSB7XG4gICAgc2hpcFNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBOdW1iZXIodmFsdWUpLnRvRml4ZWQoMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U2hpcFNsaWRlclZhbHVlKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFzaGlwU3BlZWRTbGlkZXIpIHJldHVybjtcbiAgc2hpcFNwZWVkU2xpZGVyLnZhbHVlID0gU3RyaW5nKHZhbHVlKTtcbiAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgaWYgKHJvdXRlcy5sZW5ndGggPT09IDApIHtcbiAgICBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG51bGw7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaWYgKCFzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCB8fCAhcm91dGVzLnNvbWUoKHJvdXRlKSA9PiByb3V0ZS5pZCA9PT0gc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQpKSB7XG4gICAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSByb3V0ZXNbMF0uaWQ7XG4gIH1cbiAgcmV0dXJuIHJvdXRlcy5maW5kKChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbCB7XG4gIHJldHVybiBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gIGNvbnN0IGFjdGl2ZVJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmIChtaXNzaWxlUm91dGVOYW1lTGFiZWwpIHtcbiAgICBpZiAoIWFjdGl2ZVJvdXRlKSB7XG4gICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSByb3V0ZXMubGVuZ3RoID09PSAwID8gXCJObyByb3V0ZVwiIDogXCJSb3V0ZVwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSBhY3RpdmVSb3V0ZS5uYW1lIHx8IFwiUm91dGVcIjtcbiAgICB9XG4gIH1cblxuICBpZiAobWlzc2lsZVJvdXRlQ291bnRMYWJlbCkge1xuICAgIGNvbnN0IGNvdW50ID0gYWN0aXZlUm91dGUgJiYgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpID8gYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gICAgbWlzc2lsZVJvdXRlQ291bnRMYWJlbC50ZXh0Q29udGVudCA9IGAke2NvdW50fSBwdHNgO1xuICB9XG5cbiAgaWYgKGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bikge1xuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9IHJvdXRlcy5sZW5ndGggPD0gMTtcbiAgfVxuICBpZiAocmVuYW1lTWlzc2lsZVJvdXRlQnRuKSB7XG4gICAgcmVuYW1lTWlzc2lsZVJvdXRlQnRuLmRpc2FibGVkID0gIWFjdGl2ZVJvdXRlO1xuICB9XG4gIGlmIChjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4pIHtcbiAgICBjb25zdCBjb3VudCA9IGFjdGl2ZVJvdXRlICYmIEFycmF5LmlzQXJyYXkoYWN0aXZlUm91dGUud2F5cG9pbnRzKSA/IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZSB8fCBjb3VudCA9PT0gMDtcbiAgfVxuICBpZiAocm91dGVQcmV2QnRuKSB7XG4gICAgcm91dGVQcmV2QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICB9XG4gIGlmIChyb3V0ZU5leHRCdG4pIHtcbiAgICByb3V0ZU5leHRCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gIH1cblxuICB1cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBzeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk6IHZvaWQge1xuICBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgYWN0aXZlUm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3Qgcm91dGVIYXNTZWxlY3Rpb24gPVxuICAgICEhYWN0aXZlUm91dGUgJiZcbiAgICBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgJiZcbiAgICAhIW1pc3NpbGVTZWxlY3Rpb24gJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aDtcbiAgaWYgKCFyb3V0ZUhhc1NlbGVjdGlvbikge1xuICAgIG1pc3NpbGVTZWxlY3Rpb24gPSBudWxsO1xuICB9XG4gIGNvbnN0IGNmZyA9IHN0YXRlUmVmLm1pc3NpbGVDb25maWc7XG4gIGFwcGx5TWlzc2lsZVVJKGNmZyk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gYXBwbHlNaXNzaWxlVUkoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIpIHtcbiAgICBjb25zdCBtaW5TcGVlZCA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4gPz8gTUlTU0lMRV9NSU5fU1BFRUQ7XG4gICAgY29uc3QgbWF4U3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWF4ID8/IE1JU1NJTEVfTUFYX1NQRUVEO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5taW4gPSBTdHJpbmcobWluU3BlZWQpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5tYXggPSBTdHJpbmcobWF4U3BlZWQpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IGNmZy5zcGVlZC50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgIG1pc3NpbGVTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gY2ZnLnNwZWVkLnRvRml4ZWQoMCk7XG4gIH1cbiAgaWYgKG1pc3NpbGVBZ3JvU2xpZGVyKSB7XG4gICAgY29uc3QgbWluQWdybyA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuYWdyb01pbiA/PyBNSVNTSUxFX01JTl9BR1JPO1xuICAgIGNvbnN0IG1heEFncm8gPSBNYXRoLm1heCg1MDAwLCBNYXRoLmNlaWwoKGNmZy5hZ3JvUmFkaXVzICsgNTAwKSAvIDUwMCkgKiA1MDApO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5BZ3JvKTtcbiAgICBtaXNzaWxlQWdyb1NsaWRlci5tYXggPSBTdHJpbmcobWF4QWdybyk7XG4gICAgbWlzc2lsZUFncm9TbGlkZXIudmFsdWUgPSBjZmcuYWdyb1JhZGl1cy50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlQWdyb1ZhbHVlKSB7XG4gICAgbWlzc2lsZUFncm9WYWx1ZS50ZXh0Q29udGVudCA9IGNmZy5hZ3JvUmFkaXVzLnRvRml4ZWQoMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSShvdmVycmlkZXM6IFBhcnRpYWw8eyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfT4gPSB7fSk6IHZvaWQge1xuICBjb25zdCBjdXJyZW50ID0gc3RhdGVSZWYubWlzc2lsZUNvbmZpZztcbiAgY29uc3QgY2ZnID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKHtcbiAgICBzcGVlZDogb3ZlcnJpZGVzLnNwZWVkID8/IGN1cnJlbnQuc3BlZWQsXG4gICAgYWdyb1JhZGl1czogb3ZlcnJpZGVzLmFncm9SYWRpdXMgPz8gY3VycmVudC5hZ3JvUmFkaXVzLFxuICB9LCBjdXJyZW50LCBzdGF0ZVJlZi5taXNzaWxlTGltaXRzKTtcbiAgc3RhdGVSZWYubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgYXBwbHlNaXNzaWxlVUkoY2ZnKTtcbiAgY29uc3QgbGFzdCA9IGxhc3RNaXNzaWxlQ29uZmlnU2VudDtcbiAgY29uc3QgbmVlZHNTZW5kID1cbiAgICAhbGFzdCB8fFxuICAgIE1hdGguYWJzKGxhc3Quc3BlZWQgLSBjZmcuc3BlZWQpID4gMC4yNSB8fFxuICAgIE1hdGguYWJzKChsYXN0LmFncm9SYWRpdXMgPz8gMCkgLSBjZmcuYWdyb1JhZGl1cykgPiA1O1xuICBpZiAobmVlZHNTZW5kKSB7XG4gICAgc2VuZE1pc3NpbGVDb25maWcoY2ZnKTtcbiAgfVxuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiBzZW5kTWlzc2lsZUNvbmZpZyhjZmc6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0pOiB2b2lkIHtcbiAgbGFzdE1pc3NpbGVDb25maWdTZW50ID0ge1xuICAgIHNwZWVkOiBjZmcuc3BlZWQsXG4gICAgYWdyb1JhZGl1czogY2ZnLmFncm9SYWRpdXMsXG4gIH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImNvbmZpZ3VyZV9taXNzaWxlXCIsXG4gICAgbWlzc2lsZV9zcGVlZDogY2ZnLnNwZWVkLFxuICAgIG1pc3NpbGVfYWdybzogY2ZnLmFncm9SYWRpdXMsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk6IHZvaWQge1xuICBpZiAoIXNoaXBSb3V0ZXNDb250YWluZXIgfHwgIXNoaXBSb3V0ZUxlZyB8fCAhc2hpcFJvdXRlU3BlZWQgfHwgIXNoaXBEZWxldGVCdG4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGNvbnN0IGhhc1ZhbGlkU2VsZWN0aW9uID0gc2VsZWN0aW9uICE9PSBudWxsICYmIHNlbGVjdGlvbi5pbmRleCA+PSAwICYmIHNlbGVjdGlvbi5pbmRleCA8IHdwcy5sZW5ndGg7XG4gIGNvbnN0IGlzU2hpcENvbnRleHQgPSB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCI7XG5cbiAgc2hpcFJvdXRlc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUub3BhY2l0eSA9IGlzU2hpcENvbnRleHQgPyBcIjFcIiA6IFwiMC42XCI7XG5cbiAgaWYgKCFzdGF0ZVJlZi5tZSB8fCAhaGFzVmFsaWRTZWxlY3Rpb24pIHtcbiAgICBzaGlwUm91dGVMZWcudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIHNoaXBSb3V0ZVNwZWVkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICBzaGlwRGVsZXRlQnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICBpZiAoaXNTaGlwQ29udGV4dCkge1xuICAgICAgc2V0U2hpcFNsaWRlclZhbHVlKGRlZmF1bHRTcGVlZCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChzZWxlY3Rpb24gIT09IG51bGwpIHtcbiAgICBjb25zdCB3cCA9IHdwc1tzZWxlY3Rpb24uaW5kZXhdO1xuICAgIGNvbnN0IHNwZWVkID0gd3AgJiYgdHlwZW9mIHdwLnNwZWVkID09PSBcIm51bWJlclwiID8gd3Auc3BlZWQgOiBkZWZhdWx0U3BlZWQ7XG4gICAgaWYgKGlzU2hpcENvbnRleHQgJiYgc2hpcFNwZWVkU2xpZGVyICYmIE1hdGguYWJzKHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyLnZhbHVlKSAtIHNwZWVkKSA+IDAuMjUpIHtcbiAgICAgIHNldFNoaXBTbGlkZXJWYWx1ZShzcGVlZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHVwZGF0ZVNwZWVkTGFiZWwoc3BlZWQpO1xuICAgIH1cbiAgICBjb25zdCBkaXNwbGF5SW5kZXggPSBzZWxlY3Rpb24uaW5kZXggKyAxO1xuICAgIHNoaXBSb3V0ZUxlZy50ZXh0Q29udGVudCA9IGAke2Rpc3BsYXlJbmRleH1gO1xuICAgIHNoaXBSb3V0ZVNwZWVkLnRleHRDb250ZW50ID0gYCR7c3BlZWQudG9GaXhlZCgwKX0gdS9zYDtcbiAgICBzaGlwRGVsZXRlQnRuLmRpc2FibGVkID0gIWlzU2hpcENvbnRleHQ7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpOiB2b2lkIHtcbiAgaWYgKCFtaXNzaWxlRGVsZXRlQnRuKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGNvdW50ID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gIGNvbnN0IGhhc1NlbGVjdGlvbiA9IG1pc3NpbGVTZWxlY3Rpb24gIT09IG51bGwgJiYgbWlzc2lsZVNlbGVjdGlvbiAhPT0gdW5kZWZpbmVkICYmIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPj0gMCAmJiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgY291bnQ7XG4gIG1pc3NpbGVEZWxldGVCdG4uZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xufVxuXG5mdW5jdGlvbiBzZXRTZWxlY3Rpb24oc2VsOiBTZWxlY3Rpb24gfCBudWxsKTogdm9pZCB7XG4gIHNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICBjb25zdCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IG51bGw7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDpsZWdTZWxlY3RlZFwiLCB7IGluZGV4IH0pO1xufVxuXG5mdW5jdGlvbiBzZXRNaXNzaWxlU2VsZWN0aW9uKHNlbDogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwpOiB2b2lkIHtcbiAgbWlzc2lsZVNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCB3b3JsZFBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBpZiAodWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIikge1xuICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RSb3V0ZShjYW52YXNQb2ludCk7XG4gICAgc2V0U2VsZWN0aW9uKGhpdCA/PyBudWxsKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkOiBkZWZhdWx0U3BlZWQgfTtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF93YXlwb2ludFwiLCB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogZGVmYXVsdFNwZWVkIH0pO1xuICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMuc2xpY2UoKSA6IFtdO1xuICB3cHMucHVzaCh3cCk7XG4gIHN0YXRlUmVmLm1lLndheXBvaW50cyA9IHdwcztcbiAgaWYgKHdwcy5sZW5ndGggPiAwKSB7XG4gICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludEFkZGVkXCIsIHsgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIHdvcmxkUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlKSByZXR1cm47XG5cbiAgaWYgKHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0TWlzc2lsZVJvdXRlKGNhbnZhc1BvaW50KTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKGhpdCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgd3AgPSB7IHg6IHdvcmxkUG9pbnQueCwgeTogd29ybGRQb2ludC55IH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImFkZF9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIHg6IHdwLngsXG4gICAgeTogd3AueSxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cyA/IFsuLi5yb3V0ZS53YXlwb2ludHMsIHdwXSA6IFt3cF07XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24oeyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHJvdXRlLndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xufVxuXG5mdW5jdGlvbiBjbGVhclNoaXBSb3V0ZSgpOiB2b2lkIHtcbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGlmICghd3BzIHx8IHdwcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImNsZWFyX3dheXBvaW50c1wiIH0pO1xuICBpZiAoc3RhdGVSZWYubWUpIHtcbiAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHMgPSBbXTtcbiAgfVxuICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludHNDbGVhcmVkXCIpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVTZWxlY3RlZFNoaXBXYXlwb2ludCgpOiB2b2lkIHtcbiAgaWYgKCFzZWxlY3Rpb24pIHJldHVybjtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRlbGV0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICBpZiAoc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpKSB7XG4gICAgc3RhdGVSZWYubWUud2F5cG9pbnRzID0gc3RhdGVSZWYubWUud2F5cG9pbnRzLnNsaWNlKDAsIHNlbGVjdGlvbi5pbmRleCk7XG4gIH1cbiAgYnVzUmVmLmVtaXQoXCJzaGlwOndheXBvaW50RGVsZXRlZFwiLCB7IGluZGV4OiBzZWxlY3Rpb24uaW5kZXggfSk7XG4gIHNldFNlbGVjdGlvbihudWxsKTtcbn1cblxuZnVuY3Rpb24gZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUgfHwgIW1pc3NpbGVTZWxlY3Rpb24pIHJldHVybjtcbiAgY29uc3QgaW5kZXggPSBtaXNzaWxlU2VsZWN0aW9uLmluZGV4O1xuICBpZiAoIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCBpbmRleCA8IDAgfHwgaW5kZXggPj0gcm91dGUud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJkZWxldGVfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICBpbmRleCxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IFsuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoMCwgaW5kZXgpLCAuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoaW5kZXggKyAxKV07XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXggfSk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG59XG5cbmZ1bmN0aW9uIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgaWYgKG1pc3NpbGVMYXVuY2hCdG4/LmRpc2FibGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwibGF1bmNoX21pc3NpbGVcIixcbiAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjeWNsZU1pc3NpbGVSb3V0ZShkaXJlY3Rpb246IG51bWJlcik6IHZvaWQge1xuICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICBpZiAocm91dGVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjdXJyZW50SW5kZXggPSByb3V0ZXMuZmluZEluZGV4KChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKTtcbiAgY29uc3QgYmFzZUluZGV4ID0gY3VycmVudEluZGV4ID49IDAgPyBjdXJyZW50SW5kZXggOiAwO1xuICBjb25zdCBuZXh0SW5kZXggPSAoKGJhc2VJbmRleCArIGRpcmVjdGlvbikgJSByb3V0ZXMubGVuZ3RoICsgcm91dGVzLmxlbmd0aCkgJSByb3V0ZXMubGVuZ3RoO1xuICBjb25zdCBuZXh0Um91dGUgPSByb3V0ZXNbbmV4dEluZGV4XTtcbiAgaWYgKCFuZXh0Um91dGUpIHJldHVybjtcbiAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSBuZXh0Um91dGUuaWQ7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcInNldF9hY3RpdmVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgIHJvdXRlX2lkOiBuZXh0Um91dGUuaWQsXG4gIH0pO1xuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsIHsgcm91dGVJZDogbmV4dFJvdXRlLmlkIH0pO1xufVxuXG5mdW5jdGlvbiBjeWNsZVNoaXBTZWxlY3Rpb24oZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGlmICghd3BzIHx8IHdwcy5sZW5ndGggPT09IDApIHtcbiAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IGRpcmVjdGlvbiA+IDAgPyAtMSA6IHdwcy5sZW5ndGg7XG4gIGluZGV4ICs9IGRpcmVjdGlvbjtcbiAgaWYgKGluZGV4IDwgMCkgaW5kZXggPSB3cHMubGVuZ3RoIC0gMTtcbiAgaWYgKGluZGV4ID49IHdwcy5sZW5ndGgpIGluZGV4ID0gMDtcbiAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXggfSk7XG59XG5cbmZ1bmN0aW9uIHNldElucHV0Q29udGV4dChjb250ZXh0OiBcInNoaXBcIiB8IFwibWlzc2lsZVwiKTogdm9pZCB7XG4gIGNvbnN0IG5leHQgPSBjb250ZXh0ID09PSBcIm1pc3NpbGVcIiA/IFwibWlzc2lsZVwiIDogXCJzaGlwXCI7XG4gIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gbmV4dCkge1xuICAgIHJldHVybjtcbiAgfVxuICB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9IG5leHQ7XG5cbiAgLy8gQWxzbyB1cGRhdGUgYWN0aXZlVG9vbCB0byBtYXRjaCB0aGUgY29udGV4dCB0byBrZWVwIGJ1dHRvbiBzdGF0ZXMgaW4gc3luY1xuICBpZiAobmV4dCA9PT0gXCJzaGlwXCIpIHtcbiAgICBjb25zdCBzaGlwVG9vbFRvVXNlID0gdWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIiA/IFwic2hpcC1zZWxlY3RcIiA6IFwic2hpcC1zZXRcIjtcbiAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sICE9PSBzaGlwVG9vbFRvVXNlKSB7XG4gICAgICB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPSBzaGlwVG9vbFRvVXNlO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBtaXNzaWxlVG9vbFRvVXNlID0gdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9PT0gXCJzZWxlY3RcIiA/IFwibWlzc2lsZS1zZWxlY3RcIiA6IFwibWlzc2lsZS1zZXRcIjtcbiAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sICE9PSBtaXNzaWxlVG9vbFRvVXNlKSB7XG4gICAgICB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPSBtaXNzaWxlVG9vbFRvVXNlO1xuICAgIH1cbiAgfVxuXG4gIGJ1c1JlZi5lbWl0KFwiY29udGV4dDpjaGFuZ2VkXCIsIHsgY29udGV4dDogbmV4dCB9KTtcbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG59XG5cbmZ1bmN0aW9uIHNldEFjdGl2ZVRvb2wodG9vbDogQWN0aXZlVG9vbCk6IHZvaWQge1xuICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSB0b29sKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID0gdG9vbDtcblxuICAvLyBVcGRhdGUgYmFja3dhcmQgY29tcGF0aWJpbGl0eSBzdGF0ZXNcbiAgaWYgKHRvb2wgPT09IFwic2hpcC1zZXRcIikge1xuICAgIHVpU3RhdGVSZWYuc2hpcFRvb2wgPSBcInNldFwiO1xuICAgIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPSBudWxsO1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZXRcIiB9KTtcbiAgfSBlbHNlIGlmICh0b29sID09PSBcInNoaXAtc2VsZWN0XCIpIHtcbiAgICB1aVN0YXRlUmVmLnNoaXBUb29sID0gXCJzZWxlY3RcIjtcbiAgICB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID0gbnVsbDtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2VsZWN0XCIgfSk7XG4gIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IG51bGw7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IFwic2V0XCI7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2V0XCIgfSk7XG4gIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IG51bGw7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IFwic2VsZWN0XCI7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNlbGVjdFwiIH0pO1xuICB9XG5cbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbn1cblxuZnVuY3Rpb24gc2V0QnV0dG9uU3RhdGUoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICBpZiAoIWJ0bikgcmV0dXJuO1xuICBpZiAoYWN0aXZlKSB7XG4gICAgYnRuLmRhdGFzZXQuc3RhdGUgPSBcImFjdGl2ZVwiO1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJ0cnVlXCIpO1xuICB9IGVsc2Uge1xuICAgIGRlbGV0ZSBidG4uZGF0YXNldC5zdGF0ZTtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwiZmFsc2VcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTogdm9pZCB7XG4gIHNldEJ1dHRvblN0YXRlKHNoaXBTZXRCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNldFwiKTtcbiAgc2V0QnV0dG9uU3RhdGUoc2hpcFNlbGVjdEJ0biwgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2VsZWN0XCIpO1xuICBzZXRCdXR0b25TdGF0ZShtaXNzaWxlU2V0QnRuLCB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZXRcIik7XG4gIHNldEJ1dHRvblN0YXRlKG1pc3NpbGVTZWxlY3RCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKTtcblxuICBpZiAoc2hpcENvbnRyb2xzQ2FyZCkge1xuICAgIHNoaXBDb250cm9sc0NhcmQuY2xhc3NMaXN0LnRvZ2dsZShcImFjdGl2ZVwiLCB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCIpO1xuICB9XG4gIGlmIChtaXNzaWxlQ29udHJvbHNDYXJkKSB7XG4gICAgbWlzc2lsZUNvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0SGVscFZpc2libGUoZmxhZzogYm9vbGVhbik6IHZvaWQge1xuICB1aVN0YXRlUmVmLmhlbHBWaXNpYmxlID0gQm9vbGVhbihmbGFnKTtcbiAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgYnVzUmVmLmVtaXQoXCJoZWxwOnZpc2libGVDaGFuZ2VkXCIsIHsgdmlzaWJsZTogdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSB9KTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlSGVscE92ZXJsYXkoKTogdm9pZCB7XG4gIGlmICghaGVscE92ZXJsYXkpIHJldHVybjtcbiAgaWYgKGhlbHBUZXh0KSB7XG4gICAgaGVscFRleHQudGV4dENvbnRlbnQgPSBIRUxQX1RFWFQ7XG4gIH1cbiAgaGVscE92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZShcInZpc2libGVcIiwgdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSk7XG59XG5cbmZ1bmN0aW9uIGFkanVzdFNsaWRlclZhbHVlKGlucHV0OiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCwgc3RlcHM6IG51bWJlciwgY29hcnNlOiBib29sZWFuKTogbnVtYmVyIHwgbnVsbCB7XG4gIGlmICghaW5wdXQpIHJldHVybiBudWxsO1xuICBjb25zdCBzdGVwID0gTWF0aC5hYnMocGFyc2VGbG9hdChpbnB1dC5zdGVwKSkgfHwgMTtcbiAgY29uc3QgbXVsdGlwbGllciA9IGNvYXJzZSA/IDQgOiAxO1xuICBjb25zdCBtaW4gPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VGbG9hdChpbnB1dC5taW4pKSA/IHBhcnNlRmxvYXQoaW5wdXQubWluKSA6IC1JbmZpbml0eTtcbiAgY29uc3QgbWF4ID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWF4KSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1heCkgOiBJbmZpbml0eTtcbiAgY29uc3QgY3VycmVudCA9IHBhcnNlRmxvYXQoaW5wdXQudmFsdWUpIHx8IDA7XG4gIGxldCBuZXh0ID0gY3VycmVudCArIHN0ZXBzICogc3RlcCAqIG11bHRpcGxpZXI7XG4gIGlmIChOdW1iZXIuaXNGaW5pdGUobWluKSkgbmV4dCA9IE1hdGgubWF4KG1pbiwgbmV4dCk7XG4gIGlmIChOdW1iZXIuaXNGaW5pdGUobWF4KSkgbmV4dCA9IE1hdGgubWluKG1heCwgbmV4dCk7XG4gIGlmIChNYXRoLmFicyhuZXh0IC0gY3VycmVudCkgPCAxZS00KSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaW5wdXQudmFsdWUgPSBTdHJpbmcobmV4dCk7XG4gIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIiwgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgcmV0dXJuIG5leHQ7XG59XG5cbmZ1bmN0aW9uIG9uV2luZG93S2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICBjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgY29uc3QgaXNFZGl0YWJsZSA9ICEhdGFyZ2V0ICYmICh0YXJnZXQudGFnTmFtZSA9PT0gXCJJTlBVVFwiIHx8IHRhcmdldC50YWdOYW1lID09PSBcIlRFWFRBUkVBXCIgfHwgdGFyZ2V0LmlzQ29udGVudEVkaXRhYmxlKTtcblxuICBpZiAodWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSAmJiBldmVudC5rZXkgIT09IFwiRXNjYXBlXCIpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChpc0VkaXRhYmxlKSB7XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFc2NhcGVcIikge1xuICAgICAgdGFyZ2V0LmJsdXIoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIHN3aXRjaCAoZXZlbnQuY29kZSkge1xuICAgIGNhc2UgXCJEaWdpdDFcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJEaWdpdDJcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlUXCI6XG4gICAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2V0XCIpIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2VsZWN0XCIpO1xuICAgICAgfSBlbHNlIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZWxlY3RcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlDXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkJyYWNrZXRMZWZ0XCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUoc2hpcFNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiQnJhY2tldFJpZ2h0XCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUoc2hpcFNwZWVkU2xpZGVyLCAxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJUYWJcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBjeWNsZVNoaXBTZWxlY3Rpb24oZXZlbnQuc2hpZnRLZXkgPyAtMSA6IDEpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5TlwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIG1pc3NpbGVBZGRSb3V0ZUJ0bj8uY2xpY2soKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleUxcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleUVcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZXRcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZWxlY3RcIik7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkNvbW1hXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJQZXJpb2RcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlQWdyb1NsaWRlciwgMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiU2VtaWNvbG9uXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiUXVvdGVcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRlbGV0ZVwiOlxuICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgbWlzc2lsZVNlbGVjdGlvbikge1xuICAgICAgICBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgfSBlbHNlIGlmIChzZWxlY3Rpb24pIHtcbiAgICAgICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkVzY2FwZVwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuaGVscFZpc2libGUpIHtcbiAgICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgICAgfSBlbHNlIGlmIChtaXNzaWxlU2VsZWN0aW9uKSB7XG4gICAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHNlbGVjdGlvbikge1xuICAgICAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiRXF1YWxcIjpcbiAgICBjYXNlIFwiTnVtcGFkQWRkXCI6XG4gICAgICBpZiAoIWN2KSByZXR1cm47XG4gICAgICBzZXRab29tKHVpU3RhdGVSZWYuem9vbSAqIDEuMiwgY3Yud2lkdGggLyAyLCBjdi5oZWlnaHQgLyAyKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIk1pbnVzXCI6XG4gICAgY2FzZSBcIk51bXBhZFN1YnRyYWN0XCI6XG4gICAgICBpZiAoIWN2KSByZXR1cm47XG4gICAgICBzZXRab29tKHVpU3RhdGVSZWYuem9vbSAvIDEuMiwgY3Yud2lkdGggLyAyLCBjdi5oZWlnaHQgLyAyKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRpZ2l0MFwiOlxuICAgIGNhc2UgXCJOdW1wYWQwXCI6XG4gICAgICBpZiAoZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5KSB7XG4gICAgICAgIHVpU3RhdGVSZWYuem9vbSA9IDEuMDtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICBkZWZhdWx0OlxuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgIHNldEhlbHBWaXNpYmxlKCF1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldENhbWVyYVBvc2l0aW9uKCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gIGlmICghY3YpIHJldHVybiB7IHg6IHdvcmxkLncgLyAyLCB5OiB3b3JsZC5oIC8gMiB9O1xuXG4gIGNvbnN0IHpvb20gPSB1aVN0YXRlUmVmLnpvb207XG5cbiAgLy8gQ2FtZXJhIGZvbGxvd3Mgc2hpcCwgb3IgZGVmYXVsdHMgdG8gd29ybGQgY2VudGVyXG4gIGxldCBjYW1lcmFYID0gc3RhdGVSZWYubWUgPyBzdGF0ZVJlZi5tZS54IDogd29ybGQudyAvIDI7XG4gIGxldCBjYW1lcmFZID0gc3RhdGVSZWYubWUgPyBzdGF0ZVJlZi5tZS55IDogd29ybGQuaCAvIDI7XG5cbiAgLy8gQ2FsY3VsYXRlIHZpc2libGUgd29ybGQgYXJlYSBhdCBjdXJyZW50IHpvb20gdXNpbmcgdW5pZm9ybSBzY2FsZVxuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAvLyBXb3JsZCB1bml0cyB2aXNpYmxlIG9uIHNjcmVlblxuICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjdi5oZWlnaHQgLyBzY2FsZTtcblxuICAvLyBDbGFtcCBjYW1lcmEgdG8gcHJldmVudCB6b29taW5nIHBhc3Qgd29ybGQgYm91bmRhcmllc1xuICAvLyBXaGVuIHpvb21lZCBvdXQsIGNhbWVyYSBjYW4ndCBnZXQgY2xvc2VyIHRvIGVkZ2VzIHRoYW4gaGFsZiB2aWV3cG9ydFxuICBjb25zdCBtaW5DYW1lcmFYID0gdmlld3BvcnRXaWR0aCAvIDI7XG4gIGNvbnN0IG1heENhbWVyYVggPSB3b3JsZC53IC0gdmlld3BvcnRXaWR0aCAvIDI7XG4gIGNvbnN0IG1pbkNhbWVyYVkgPSB2aWV3cG9ydEhlaWdodCAvIDI7XG4gIGNvbnN0IG1heENhbWVyYVkgPSB3b3JsZC5oIC0gdmlld3BvcnRIZWlnaHQgLyAyO1xuXG4gIC8vIEFsd2F5cyBjbGFtcCBjYW1lcmEgdG8gd29ybGQgYm91bmRhcmllc1xuICAvLyBXaGVuIHZpZXdwb3J0ID49IHdvcmxkIGRpbWVuc2lvbnMsIGNlbnRlciB0aGUgd29ybGQgb24gc2NyZWVuXG4gIGlmICh2aWV3cG9ydFdpZHRoIDwgd29ybGQudykge1xuICAgIGNhbWVyYVggPSBjbGFtcChjYW1lcmFYLCBtaW5DYW1lcmFYLCBtYXhDYW1lcmFYKTtcbiAgfSBlbHNlIHtcbiAgICBjYW1lcmFYID0gd29ybGQudyAvIDI7XG4gIH1cblxuICBpZiAodmlld3BvcnRIZWlnaHQgPCB3b3JsZC5oKSB7XG4gICAgY2FtZXJhWSA9IGNsYW1wKGNhbWVyYVksIG1pbkNhbWVyYVksIG1heENhbWVyYVkpO1xuICB9IGVsc2Uge1xuICAgIGNhbWVyYVkgPSB3b3JsZC5oIC8gMjtcbiAgfVxuXG4gIHJldHVybiB7IHg6IGNhbWVyYVgsIHk6IGNhbWVyYVkgfTtcbn1cblxuZnVuY3Rpb24gd29ybGRUb0NhbnZhcyhwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICBpZiAoIWN2KSByZXR1cm4geyB4OiBwLngsIHk6IHAueSB9O1xuXG4gIGNvbnN0IHpvb20gPSB1aVN0YXRlUmVmLnpvb207XG4gIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgLy8gV29ybGQgcG9zaXRpb24gcmVsYXRpdmUgdG8gY2FtZXJhXG4gIGNvbnN0IHdvcmxkWCA9IHAueCAtIGNhbWVyYS54O1xuICBjb25zdCB3b3JsZFkgPSBwLnkgLSBjYW1lcmEueTtcblxuICAvLyBVc2UgdW5pZm9ybSBzY2FsZSB0byBtYWludGFpbiBhc3BlY3QgcmF0aW9cbiAgLy8gU2NhbGUgaXMgcGl4ZWxzIHBlciB3b3JsZCB1bml0IC0gY2hvb3NlIHRoZSBkaW1lbnNpb24gdGhhdCBmaXRzXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gIC8vIENvbnZlcnQgdG8gY2FudmFzIGNvb3JkaW5hdGVzIChjZW50ZXJlZCBvbiBzY3JlZW4pXG4gIHJldHVybiB7XG4gICAgeDogd29ybGRYICogc2NhbGUgKyBjdi53aWR0aCAvIDIsXG4gICAgeTogd29ybGRZICogc2NhbGUgKyBjdi5oZWlnaHQgLyAyXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcblxuICBjb25zdCB6b29tID0gdWlTdGF0ZVJlZi56b29tO1xuICBjb25zdCBjYW1lcmEgPSBnZXRDYW1lcmFQb3NpdGlvbigpO1xuXG4gIC8vIENhbnZhcyBwb3NpdGlvbiByZWxhdGl2ZSB0byBjZW50ZXJcbiAgY29uc3QgY2FudmFzWCA9IHAueCAtIGN2LndpZHRoIC8gMjtcbiAgY29uc3QgY2FudmFzWSA9IHAueSAtIGN2LmhlaWdodCAvIDI7XG5cbiAgLy8gVXNlIHVuaWZvcm0gc2NhbGUgdG8gbWFpbnRhaW4gYXNwZWN0IHJhdGlvXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gIC8vIENvbnZlcnQgdG8gd29ybGQgY29vcmRpbmF0ZXMgKGludmVyc2Ugb2Ygd29ybGRUb0NhbnZhcylcbiAgcmV0dXJuIHtcbiAgICB4OiBjYW52YXNYIC8gc2NhbGUgKyBjYW1lcmEueCxcbiAgICB5OiBjYW52YXNZIC8gc2NhbGUgKyBjYW1lcmEueVxuICB9O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlUm91dGVQb2ludHMoKSB7XG4gIGlmICghc3RhdGVSZWYubWUpIHJldHVybiBudWxsO1xuICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMgOiBbXTtcbiAgY29uc3Qgd29ybGRQb2ludHMgPSBbeyB4OiBzdGF0ZVJlZi5tZS54LCB5OiBzdGF0ZVJlZi5tZS55IH1dO1xuICBmb3IgKGNvbnN0IHdwIG9mIHdwcykge1xuICAgIHdvcmxkUG9pbnRzLnB1c2goeyB4OiB3cC54LCB5OiB3cC55IH0pO1xuICB9XG4gIGNvbnN0IGNhbnZhc1BvaW50cyA9IHdvcmxkUG9pbnRzLm1hcCgocG9pbnQpID0+IHdvcmxkVG9DYW52YXMocG9pbnQpKTtcbiAgcmV0dXJuIHsgd2F5cG9pbnRzOiB3cHMsIHdvcmxkUG9pbnRzLCBjYW52YXNQb2ludHMgfTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IHdwcyA9IHJvdXRlICYmIEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cyA6IFtdO1xuICBjb25zdCB3b3JsZFBvaW50cyA9IFt7IHg6IHN0YXRlUmVmLm1lLngsIHk6IHN0YXRlUmVmLm1lLnkgfV07XG4gIGZvciAoY29uc3Qgd3Agb2Ygd3BzKSB7XG4gICAgd29ybGRQb2ludHMucHVzaCh7IHg6IHdwLngsIHk6IHdwLnkgfSk7XG4gIH1cbiAgY29uc3QgY2FudmFzUG9pbnRzID0gd29ybGRQb2ludHMubWFwKChwb2ludCkgPT4gd29ybGRUb0NhbnZhcyhwb2ludCkpO1xuICByZXR1cm4geyB3YXlwb2ludHM6IHdwcywgd29ybGRQb2ludHMsIGNhbnZhc1BvaW50cyB9O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVMZWdEYXNoT2Zmc2V0cyhkdFNlY29uZHM6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIXVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSB8fCAhc3RhdGVSZWYubWUpIHtcbiAgICBsZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICBsZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCB7IHdheXBvaW50cywgd29ybGRQb2ludHMsIGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IGN5Y2xlID0gNjQ7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3AgPSB3YXlwb2ludHNbaV07XG4gICAgY29uc3Qgc3BlZWQgPSB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgPyB3cC5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcbiAgICBjb25zdCBhV29ybGQgPSB3b3JsZFBvaW50c1tpXTtcbiAgICBjb25zdCBiV29ybGQgPSB3b3JsZFBvaW50c1tpICsgMV07XG4gICAgY29uc3Qgd29ybGREaXN0ID0gTWF0aC5oeXBvdChiV29ybGQueCAtIGFXb3JsZC54LCBiV29ybGQueSAtIGFXb3JsZC55KTtcbiAgICBjb25zdCBhQ2FudmFzID0gY2FudmFzUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJDYW52YXMgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGNhbnZhc0Rpc3QgPSBNYXRoLmh5cG90KGJDYW52YXMueCAtIGFDYW52YXMueCwgYkNhbnZhcy55IC0gYUNhbnZhcy55KTtcblxuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHNwZWVkKSB8fCBzcGVlZCA8PSAxZS0zIHx8ICFOdW1iZXIuaXNGaW5pdGUod29ybGREaXN0KSB8fCB3b3JsZERpc3QgPD0gMWUtMyB8fCBjYW52YXNEaXN0IDw9IDFlLTMpIHtcbiAgICAgIGxlZ0Rhc2hPZmZzZXRzLnNldChpLCAwKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGR0U2Vjb25kcykgfHwgZHRTZWNvbmRzIDw9IDApIHtcbiAgICAgIGlmICghbGVnRGFzaE9mZnNldHMuaGFzKGkpKSB7XG4gICAgICAgIGxlZ0Rhc2hPZmZzZXRzLnNldChpLCAwKTtcbiAgICAgIH1cbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHNjYWxlID0gY2FudmFzRGlzdCAvIHdvcmxkRGlzdDtcbiAgICBjb25zdCBkYXNoU3BlZWQgPSBzcGVlZCAqIHNjYWxlO1xuICAgIGxldCBuZXh0ID0gKGxlZ0Rhc2hPZmZzZXRzLmdldChpKSA/PyAwKSAtIGRhc2hTcGVlZCAqIGR0U2Vjb25kcztcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuZXh0KSkge1xuICAgICAgbmV4dCA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHQgPSAoKG5leHQgJSBjeWNsZSkgKyBjeWNsZSkgJSBjeWNsZTtcbiAgICB9XG4gICAgbGVnRGFzaE9mZnNldHMuc2V0KGksIG5leHQpO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IG9mIEFycmF5LmZyb20obGVnRGFzaE9mZnNldHMua2V5cygpKSkge1xuICAgIGlmIChrZXkgPj0gd2F5cG9pbnRzLmxlbmd0aCkge1xuICAgICAgbGVnRGFzaE9mZnNldHMuZGVsZXRlKGtleSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHBvaW50U2VnbWVudERpc3RhbmNlKHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgYTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBiOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBudW1iZXIge1xuICBjb25zdCBhYnggPSBiLnggLSBhLng7XG4gIGNvbnN0IGFieSA9IGIueSAtIGEueTtcbiAgY29uc3QgYXB4ID0gcC54IC0gYS54O1xuICBjb25zdCBhcHkgPSBwLnkgLSBhLnk7XG4gIGNvbnN0IGFiTGVuU3EgPSBhYnggKiBhYnggKyBhYnkgKiBhYnk7XG4gIGNvbnN0IHQgPSBhYkxlblNxID09PSAwID8gMCA6IGNsYW1wKGFweCAqIGFieCArIGFweSAqIGFieSwgMCwgYWJMZW5TcSkgLyBhYkxlblNxO1xuICBjb25zdCBwcm9qeCA9IGEueCArIGFieCAqIHQ7XG4gIGNvbnN0IHByb2p5ID0gYS55ICsgYWJ5ICogdDtcbiAgY29uc3QgZHggPSBwLnggLSBwcm9qeDtcbiAgY29uc3QgZHkgPSBwLnkgLSBwcm9qeTtcbiAgcmV0dXJuIE1hdGguaHlwb3QoZHgsIGR5KTtcbn1cblxuZnVuY3Rpb24gaGl0VGVzdFJvdXRlKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBTZWxlY3Rpb24gfCBudWxsIHtcbiAgY29uc3Qgcm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgeyBjYW52YXNQb2ludHMgfSA9IHJvdXRlO1xuICBjb25zdCB3YXlwb2ludEhpdFJhZGl1cyA9IDEyO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHJvdXRlLndheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwQ2FudmFzID0gY2FudmFzUG9pbnRzW2kgKyAxXTtcbiAgICBjb25zdCBkeCA9IGNhbnZhc1BvaW50LnggLSB3cENhbnZhcy54O1xuICAgIGNvbnN0IGR5ID0gY2FudmFzUG9pbnQueSAtIHdwQ2FudmFzLnk7XG4gICAgaWYgKE1hdGguaHlwb3QoZHgsIGR5KSA8PSB3YXlwb2ludEhpdFJhZGl1cykge1xuICAgICAgcmV0dXJuIHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogaSB9O1xuICAgIH1cbiAgfVxuICBpZiAoIXVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGNvbnN0IGxlZ0hpdERpc3RhbmNlID0gMTA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgZGlzdCA9IHBvaW50U2VnbWVudERpc3RhbmNlKGNhbnZhc1BvaW50LCBjYW52YXNQb2ludHNbaV0sIGNhbnZhc1BvaW50c1tpICsgMV0pO1xuICAgIGlmIChkaXN0IDw9IGxlZ0hpdERpc3RhbmNlKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcImxlZ1wiLCBpbmRleDogaSB9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gaGl0VGVzdE1pc3NpbGVSb3V0ZShjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwge1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgeyBjYW52YXNQb2ludHMgfSA9IHJvdXRlO1xuICBjb25zdCB3YXlwb2ludEhpdFJhZGl1cyA9IDE2O1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGNhbnZhc1BvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwQ2FudmFzID0gY2FudmFzUG9pbnRzW2ldO1xuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdwQ2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd3BDYW52YXMueTtcbiAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpIDw9IHdheXBvaW50SGl0UmFkaXVzKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBpIC0gMSB9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZHJhd1NoaXAoeDogbnVtYmVyLCB5OiBudW1iZXIsIHZ4OiBudW1iZXIsIHZ5OiBudW1iZXIsIGNvbG9yOiBzdHJpbmcsIGZpbGxlZDogYm9vbGVhbik6IHZvaWQge1xuICBpZiAoIWN0eCkgcmV0dXJuO1xuICBjb25zdCBwID0gd29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gIGNvbnN0IHIgPSAxMDtcbiAgY3R4LnNhdmUoKTtcbiAgY3R4LnRyYW5zbGF0ZShwLngsIHAueSk7XG4gIGNvbnN0IGFuZ2xlID0gTWF0aC5hdGFuMih2eSwgdngpO1xuICBjdHgucm90YXRlKGFuZ2xlKTtcbiAgY3R4LmJlZ2luUGF0aCgpO1xuICBjdHgubW92ZVRvKHIsIDApO1xuICBjdHgubGluZVRvKC1yICogMC43LCByICogMC42KTtcbiAgY3R4LmxpbmVUbygtciAqIDAuNCwgMCk7XG4gIGN0eC5saW5lVG8oLXIgKiAwLjcsIC1yICogMC42KTtcbiAgY3R4LmNsb3NlUGF0aCgpO1xuICBjdHgubGluZVdpZHRoID0gMjtcbiAgY3R4LnN0cm9rZVN0eWxlID0gY29sb3I7XG4gIGlmIChmaWxsZWQpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gYCR7Y29sb3J9Y2NgO1xuICAgIGN0eC5maWxsKCk7XG4gIH1cbiAgY3R4LnN0cm9rZSgpO1xuICBjdHgucmVzdG9yZSgpO1xufVxuXG5mdW5jdGlvbiBkcmF3R2hvc3REb3QoeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFjdHgpIHJldHVybjtcbiAgY29uc3QgcCA9IHdvcmxkVG9DYW52YXMoeyB4LCB5IH0pO1xuICBjdHguYmVnaW5QYXRoKCk7XG4gIGN0eC5hcmMocC54LCBwLnksIDMsIDAsIE1hdGguUEkgKiAyKTtcbiAgY3R4LmZpbGxTdHlsZSA9IFwiI2NjY2NjY2FhXCI7XG4gIGN0eC5maWxsKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdSb3V0ZSgpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIXN0YXRlUmVmLm1lKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICBjb25zdCB7IGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IGxlZ0NvdW50ID0gY2FudmFzUG9pbnRzLmxlbmd0aCAtIDE7XG5cbiAgaWYgKHVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSAmJiBsZWdDb3VudCA+IDApIHtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5zZXRMaW5lRGFzaChbOCwgOF0pO1xuICAgIGN0eC5saW5lV2lkdGggPSAxLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMzhiZGY4NjZcIjtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxlZ0NvdW50OyBpKyspIHtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5tb3ZlVG8oY2FudmFzUG9pbnRzW2ldLngsIGNhbnZhc1BvaW50c1tpXS55KTtcbiAgICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzW2kgKyAxXS54LCBjYW52YXNQb2ludHNbaSArIDFdLnkpO1xuICAgICAgY3R4LmxpbmVEYXNoT2Zmc2V0ID0gbGVnRGFzaE9mZnNldHMuZ2V0KGkpID8/IDA7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cblxuICBpZiAodWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlICYmIGxlZ0NvdW50ID4gMCkge1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnNldExpbmVEYXNoKFs2LCA2XSk7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDM7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMzhiZGY4XCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oY2FudmFzUG9pbnRzWzBdLngsIGNhbnZhc1BvaW50c1swXS55KTtcbiAgICBjdHgubGluZVRvKGNhbnZhc1BvaW50c1sxXS54LCBjYW52YXNQb2ludHNbMV0ueSk7XG4gICAgY3R4LmxpbmVEYXNoT2Zmc2V0ID0gbGVnRGFzaE9mZnNldHMuZ2V0KDApID8/IDA7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cblxuICBpZiAodWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlICYmIHNlbGVjdGlvbiAmJiBzZWxlY3Rpb24uaW5kZXggPCBsZWdDb3VudCkge1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnNldExpbmVEYXNoKFs0LCA0XSk7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDMuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiNmOTczMTZcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbc2VsZWN0aW9uLmluZGV4XS54LCBjYW52YXNQb2ludHNbc2VsZWN0aW9uLmluZGV4XS55KTtcbiAgICBjdHgubGluZVRvKGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXggKyAxXS54LCBjYW52YXNQb2ludHNbc2VsZWN0aW9uLmluZGV4ICsgMV0ueSk7XG4gICAgY3R4LmxpbmVEYXNoT2Zmc2V0ID0gbGVnRGFzaE9mZnNldHMuZ2V0KHNlbGVjdGlvbi5pbmRleCkgPz8gMDtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcHQgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3Rpb24gJiYgc2VsZWN0aW9uLmluZGV4ID09PSBpO1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMocHQueCwgcHQueSwgaXNTZWxlY3RlZCA/IDcgOiA1LCAwLCBNYXRoLlBJICogMik7XG4gICAgY3R4LmZpbGxTdHlsZSA9IGlzU2VsZWN0ZWQgPyBcIiNmOTczMTZcIiA6IFwiIzM4YmRmOFwiO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IGlzU2VsZWN0ZWQgPyAwLjk1IDogMC44O1xuICAgIGN0eC5maWxsKCk7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMTtcbiAgICBjdHgubGluZVdpZHRoID0gMjtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMwZjE3MmFcIjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkcmF3TWlzc2lsZVJvdXRlKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWUpIHJldHVybjtcbiAgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ICE9PSBcIm1pc3NpbGVcIikgcmV0dXJuO1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSByZXR1cm47XG4gIGNvbnN0IHsgY2FudmFzUG9pbnRzIH0gPSByb3V0ZTtcbiAgY3R4LnNhdmUoKTtcbiAgY3R4LnNldExpbmVEYXNoKFsxMCwgNl0pO1xuICBjdHgubGluZVdpZHRoID0gMi41O1xuICBjdHguc3Ryb2tlU3R5bGUgPSBcIiNmODcxNzFhYVwiO1xuICBjdHguYmVnaW5QYXRoKCk7XG4gIGN0eC5tb3ZlVG8oY2FudmFzUG9pbnRzWzBdLngsIGNhbnZhc1BvaW50c1swXS55KTtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBjYW52YXNQb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjdHgubGluZVRvKGNhbnZhc1BvaW50c1tpXS54LCBjYW52YXNQb2ludHNbaV0ueSk7XG4gIH1cbiAgY3R4LnN0cm9rZSgpO1xuICBjdHgucmVzdG9yZSgpO1xuXG4gIGZvciAobGV0IGkgPSAxOyBpIDwgY2FudmFzUG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcHQgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3Qgd2F5cG9pbnRJbmRleCA9IGkgLSAxO1xuICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBtaXNzaWxlU2VsZWN0aW9uICYmIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPT09IHdheXBvaW50SW5kZXg7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmFyYyhwdC54LCBwdC55LCBpc1NlbGVjdGVkID8gNyA6IDUsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gaXNTZWxlY3RlZCA/IFwiI2ZhY2MxNVwiIDogXCIjZjg3MTcxXCI7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gaXNTZWxlY3RlZCA/IDAuOTUgOiAwLjk7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSAxLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gaXNTZWxlY3RlZCA/IFwiIzg1NGQwZVwiIDogXCIjN2YxZDFkXCI7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZHJhd01pc3NpbGVzKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWlzc2lsZXMgfHwgc3RhdGVSZWYubWlzc2lsZXMubGVuZ3RoID09PSAwIHx8ICFjdikgcmV0dXJuO1xuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHJhZGl1c1NjYWxlID0gKHNjYWxlWCArIHNjYWxlWSkgLyAyO1xuICBmb3IgKGNvbnN0IG1pc3Mgb2Ygc3RhdGVSZWYubWlzc2lsZXMpIHtcbiAgICBjb25zdCBwID0gd29ybGRUb0NhbnZhcyh7IHg6IG1pc3MueCwgeTogbWlzcy55IH0pO1xuICAgIGNvbnN0IHNlbGZPd25lZCA9IEJvb2xlYW4obWlzcy5zZWxmKTtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHguYXJjKHAueCwgcC55LCBzZWxmT3duZWQgPyA2IDogNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgIGN0eC5maWxsU3R5bGUgPSBzZWxmT3duZWQgPyBcIiNmODcxNzFcIiA6IFwiI2ZjYTVhNVwiO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IHNlbGZPd25lZCA/IDAuOTUgOiAwLjg7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSAxLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMTExODI3XCI7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG5cbiAgICBpZiAoc2VsZk93bmVkICYmIG1pc3MuYWdyb19yYWRpdXMgPiAwKSB7XG4gICAgICBjdHguc2F2ZSgpO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY29uc3QgckNhbnZhcyA9IG1pc3MuYWdyb19yYWRpdXMgKiByYWRpdXNTY2FsZTtcbiAgICAgIGN0eC5zZXRMaW5lRGFzaChbMTQsIDEwXSk7XG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSBcInJnYmEoMjQ4LDExMywxMTMsMC4zNSlcIjtcbiAgICAgIGN0eC5saW5lV2lkdGggPSAxLjI7XG4gICAgICBjdHguYXJjKHAueCwgcC55LCByQ2FudmFzLCAwLCBNYXRoLlBJICogMik7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBkcmF3R3JpZCgpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIWN2KSByZXR1cm47XG4gIGN0eC5zYXZlKCk7XG4gIGN0eC5zdHJva2VTdHlsZSA9IFwiIzIzNFwiO1xuICBjdHgubGluZVdpZHRoID0gMTtcblxuICBjb25zdCB6b29tID0gdWlTdGF0ZVJlZi56b29tO1xuICBsZXQgc3RlcCA9IDEwMDA7XG4gIGlmICh6b29tIDwgMC43KSB7XG4gICAgc3RlcCA9IDIwMDA7XG4gIH0gZWxzZSBpZiAoem9vbSA+IDEuNSkge1xuICAgIHN0ZXAgPSA1MDA7XG4gIH0gZWxzZSBpZiAoem9vbSA+IDIuNSkge1xuICAgIHN0ZXAgPSAyNTA7XG4gIH1cblxuICBjb25zdCBjYW1lcmEgPSBnZXRDYW1lcmFQb3NpdGlvbigpO1xuXG4gIC8vIENhbGN1bGF0ZSB2aWV3cG9ydCB1c2luZyB1bmlmb3JtIHNjYWxlIChzYW1lIGFzIGNvb3JkaW5hdGUgdHJhbnNmb3JtcylcbiAgY29uc3Qgc2NhbGVYID0gY3Yud2lkdGggLyB3b3JsZC53O1xuICBjb25zdCBzY2FsZVkgPSBjdi5oZWlnaHQgLyB3b3JsZC5oO1xuICBjb25zdCBzY2FsZSA9IE1hdGgubWluKHNjYWxlWCwgc2NhbGVZKSAqIHpvb207XG4gIGNvbnN0IHZpZXdwb3J0V2lkdGggPSBjdi53aWR0aCAvIHNjYWxlO1xuICBjb25zdCB2aWV3cG9ydEhlaWdodCA9IGN2LmhlaWdodCAvIHNjYWxlO1xuXG4gIGNvbnN0IG1pblggPSBNYXRoLm1heCgwLCBjYW1lcmEueCAtIHZpZXdwb3J0V2lkdGggLyAyKTtcbiAgY29uc3QgbWF4WCA9IE1hdGgubWluKHdvcmxkLncsIGNhbWVyYS54ICsgdmlld3BvcnRXaWR0aCAvIDIpO1xuICBjb25zdCBtaW5ZID0gTWF0aC5tYXgoMCwgY2FtZXJhLnkgLSB2aWV3cG9ydEhlaWdodCAvIDIpO1xuICBjb25zdCBtYXhZID0gTWF0aC5taW4od29ybGQuaCwgY2FtZXJhLnkgKyB2aWV3cG9ydEhlaWdodCAvIDIpO1xuXG4gIGNvbnN0IHN0YXJ0WCA9IE1hdGguZmxvb3IobWluWCAvIHN0ZXApICogc3RlcDtcbiAgY29uc3QgZW5kWCA9IE1hdGguY2VpbChtYXhYIC8gc3RlcCkgKiBzdGVwO1xuICBjb25zdCBzdGFydFkgPSBNYXRoLmZsb29yKG1pblkgLyBzdGVwKSAqIHN0ZXA7XG4gIGNvbnN0IGVuZFkgPSBNYXRoLmNlaWwobWF4WSAvIHN0ZXApICogc3RlcDtcblxuICBmb3IgKGxldCB4ID0gc3RhcnRYOyB4IDw9IGVuZFg7IHggKz0gc3RlcCkge1xuICAgIGNvbnN0IGEgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeTogTWF0aC5tYXgoMCwgbWluWSkgfSk7XG4gICAgY29uc3QgYiA9IHdvcmxkVG9DYW52YXMoeyB4LCB5OiBNYXRoLm1pbih3b3JsZC5oLCBtYXhZKSB9KTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhhLngsIGEueSk7XG4gICAgY3R4LmxpbmVUbyhiLngsIGIueSk7XG4gICAgY3R4LnN0cm9rZSgpO1xuICB9XG4gIGZvciAobGV0IHkgPSBzdGFydFk7IHkgPD0gZW5kWTsgeSArPSBzdGVwKSB7XG4gICAgY29uc3QgYSA9IHdvcmxkVG9DYW52YXMoeyB4OiBNYXRoLm1heCgwLCBtaW5YKSwgeSB9KTtcbiAgICBjb25zdCBiID0gd29ybGRUb0NhbnZhcyh7IHg6IE1hdGgubWluKHdvcmxkLncsIG1heFgpLCB5IH0pO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGEueCwgYS55KTtcbiAgICBjdHgubGluZVRvKGIueCwgYi55KTtcbiAgICBjdHguc3Ryb2tlKCk7XG4gIH1cbiAgY3R4LnJlc3RvcmUoKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk6IHZvaWQge1xuICBpZiAoIW1pc3NpbGVMYXVuY2hCdG4gfHwgIW1pc3NpbGVMYXVuY2hUZXh0IHx8ICFtaXNzaWxlTGF1bmNoSW5mbykgcmV0dXJuO1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBjb25zdCBjb3VudCA9IHJvdXRlICYmIEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICBjb25zdCByZW1haW5pbmcgPSBnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTtcbiAgY29uc3QgY29vbGluZ0Rvd24gPSByZW1haW5pbmcgPiAwLjA1O1xuICBjb25zdCBzaG91bGREaXNhYmxlID0gIXJvdXRlIHx8IGNvdW50ID09PSAwIHx8IGNvb2xpbmdEb3duO1xuICBtaXNzaWxlTGF1bmNoQnRuLmRpc2FibGVkID0gc2hvdWxkRGlzYWJsZTtcblxuICBjb25zdCBsYXVuY2hUZXh0SFRNTCA9ICc8c3BhbiBjbGFzcz1cImJ0bi10ZXh0LWZ1bGxcIj5MYXVuY2g8L3NwYW4+PHNwYW4gY2xhc3M9XCJidG4tdGV4dC1zaG9ydFwiPkZpcmU8L3NwYW4+JztcbiAgbGV0IGxhdW5jaEluZm9IVE1MID0gXCJcIjtcblxuICBpZiAoIXJvdXRlKSB7XG4gICAgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuICB9IGVsc2UgaWYgKGNvb2xpbmdEb3duKSB7XG4gICAgbGF1bmNoSW5mb0hUTUwgPSBgJHtyZW1haW5pbmcudG9GaXhlZCgxKX1zYDtcbiAgfSBlbHNlIGlmIChyb3V0ZS5uYW1lKSB7XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgICBjb25zdCByb3V0ZUluZGV4ID0gcm91dGVzLmZpbmRJbmRleCgocikgPT4gci5pZCA9PT0gcm91dGUuaWQpICsgMTtcbiAgICBsYXVuY2hJbmZvSFRNTCA9IGA8c3BhbiBjbGFzcz1cImJ0bi10ZXh0LWZ1bGxcIj4ke3JvdXRlLm5hbWV9PC9zcGFuPjxzcGFuIGNsYXNzPVwiYnRuLXRleHQtc2hvcnRcIj4ke3JvdXRlSW5kZXh9PC9zcGFuPmA7XG4gIH0gZWxzZSB7XG4gICAgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuICB9XG5cbiAgaWYgKGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgIT09IGxhdW5jaFRleHRIVE1MKSB7XG4gICAgbWlzc2lsZUxhdW5jaFRleHQuaW5uZXJIVE1MID0gbGF1bmNoVGV4dEhUTUw7XG4gICAgbGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICB9XG5cbiAgaWYgKGxhc3RNaXNzaWxlTGF1bmNoSW5mb0hUTUwgIT09IGxhdW5jaEluZm9IVE1MKSB7XG4gICAgbWlzc2lsZUxhdW5jaEluZm8uaW5uZXJIVE1MID0gbGF1bmNoSW5mb0hUTUw7XG4gICAgbGFzdE1pc3NpbGVMYXVuY2hJbmZvSFRNTCA9IGxhdW5jaEluZm9IVE1MO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZygpOiBudW1iZXIge1xuICBjb25zdCByZW1haW5pbmcgPSBzdGF0ZVJlZi5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGVSZWYpO1xuICByZXR1cm4gcmVtYWluaW5nID4gMCA/IHJlbWFpbmluZyA6IDA7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVN0YXR1c0luZGljYXRvcnMoKTogdm9pZCB7XG4gIGNvbnN0IG1ldGEgPSBzdGF0ZVJlZi53b3JsZE1ldGEgPz8ge307XG4gIGNvbnN0IGhhc1dpZHRoID0gdHlwZW9mIG1ldGEudyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS53KTtcbiAgY29uc3QgaGFzSGVpZ2h0ID0gdHlwZW9mIG1ldGEuaCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5oKTtcblxuICBpZiAoaGFzV2lkdGgpIHtcbiAgICB3b3JsZC53ID0gbWV0YS53ITtcbiAgfVxuICBpZiAoaGFzSGVpZ2h0KSB7XG4gICAgd29ybGQuaCA9IG1ldGEuaCE7XG4gIH1cbiAgaWYgKEhQc3Bhbikge1xuICAgIGlmIChzdGF0ZVJlZi5tZSAmJiBOdW1iZXIuaXNGaW5pdGUoc3RhdGVSZWYubWUuaHApKSB7XG4gICAgICBIUHNwYW4udGV4dENvbnRlbnQgPSBOdW1iZXIoc3RhdGVSZWYubWUuaHApLnRvU3RyaW5nKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIEhQc3Bhbi50ZXh0Q29udGVudCA9IFwiXHUyMDEzXCI7XG4gICAgfVxuICB9XG4gIGlmIChraWxsc1NwYW4pIHtcbiAgICBpZiAoc3RhdGVSZWYubWUgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXRlUmVmLm1lLmtpbGxzKSkge1xuICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlUmVmLm1lLmtpbGxzKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBraWxsc1NwYW4udGV4dENvbnRlbnQgPSBcIjBcIjtcbiAgICB9XG4gIH1cblxuICAvLyBVcGRhdGUgaGVhdCBiYXJcbiAgdXBkYXRlSGVhdEJhcigpO1xuICAvLyBVcGRhdGUgc3BlZWQgbWFya2VyIHBvc2l0aW9uXG4gIHVwZGF0ZVNwZWVkTWFya2VyKCk7XG4gIC8vIFVwZGF0ZSBzdGFsbCBvdmVybGF5XG4gIHVwZGF0ZVN0YWxsT3ZlcmxheSgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIZWF0QmFyKCk6IHZvaWQge1xuICBjb25zdCBoZWF0ID0gc3RhdGVSZWYubWU/LmhlYXQ7XG4gIGlmICghaGVhdCB8fCAhaGVhdEJhckZpbGwgfHwgIWhlYXRWYWx1ZVRleHQpIHJldHVybjtcblxuICBjb25zdCBwZXJjZW50ID0gKGhlYXQudmFsdWUgLyBoZWF0Lm1heCkgKiAxMDA7XG4gIGhlYXRCYXJGaWxsLnN0eWxlLndpZHRoID0gYCR7cGVyY2VudH0lYDtcblxuICAvLyBVcGRhdGUgdGV4dFxuICBoZWF0VmFsdWVUZXh0LnRleHRDb250ZW50ID0gYEhlYXQgJHtNYXRoLnJvdW5kKGhlYXQudmFsdWUpfWA7XG5cbiAgLy8gVXBkYXRlIGNvbG9yIGNsYXNzZXNcbiAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LnJlbW92ZShcIndhcm5cIiwgXCJvdmVyaGVhdFwiKTtcbiAgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC5vdmVyaGVhdEF0KSB7XG4gICAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LmFkZChcIm92ZXJoZWF0XCIpO1xuICB9IGVsc2UgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC53YXJuQXQpIHtcbiAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QuYWRkKFwid2FyblwiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVTcGVlZE1hcmtlcigpOiB2b2lkIHtcbiAgY29uc3QgaGVhdCA9IHN0YXRlUmVmLm1lPy5oZWF0O1xuICBpZiAoIWhlYXQgfHwgIXNwZWVkTWFya2VyIHx8ICFzaGlwU3BlZWRTbGlkZXIpIHJldHVybjtcblxuICBjb25zdCBtaW4gPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci5taW4pO1xuICBjb25zdCBtYXggPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci5tYXgpO1xuICBjb25zdCBtYXJrZXJTcGVlZCA9IGhlYXQubWFya2VyU3BlZWQ7XG5cbiAgLy8gQ2FsY3VsYXRlIHBvc2l0aW9uIGFzIHBlcmNlbnRhZ2VcbiAgY29uc3QgcGVyY2VudCA9ICgobWFya2VyU3BlZWQgLSBtaW4pIC8gKG1heCAtIG1pbikpICogMTAwO1xuICBzcGVlZE1hcmtlci5zdHlsZS5sZWZ0ID0gYCR7cGVyY2VudH0lYDtcbiAgc3BlZWRNYXJrZXIudGl0bGUgPSBgSGVhdCBuZXV0cmFsOiAke01hdGgucm91bmQobWFya2VyU3BlZWQpfSB1bml0cy9zYDtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU3RhbGxPdmVybGF5KCk6IHZvaWQge1xuICBjb25zdCBoZWF0ID0gc3RhdGVSZWYubWU/LmhlYXQ7XG4gIGlmICghaGVhdCB8fCAhc3RhbGxPdmVybGF5KSByZXR1cm47XG5cbiAgY29uc3Qgbm93ID0gdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgID8gcGVyZm9ybWFuY2Uubm93KClcbiAgICA6IERhdGUubm93KCk7XG5cbiAgY29uc3QgaXNTdGFsbGVkID0gbm93IDwgaGVhdC5zdGFsbFVudGlsTXM7XG5cbiAgaWYgKGlzU3RhbGxlZCkge1xuICAgIHN0YWxsT3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgfSBlbHNlIHtcbiAgICBzdGFsbE92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9vcCh0aW1lc3RhbXA6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhY3YpIHJldHVybjtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodGltZXN0YW1wKSkge1xuICAgIHRpbWVzdGFtcCA9IGxhc3RMb29wVHMgPz8gMDtcbiAgfVxuICBsZXQgZHRTZWNvbmRzID0gMDtcbiAgaWYgKGxhc3RMb29wVHMgIT09IG51bGwpIHtcbiAgICBkdFNlY29uZHMgPSAodGltZXN0YW1wIC0gbGFzdExvb3BUcykgLyAxMDAwO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGR0U2Vjb25kcykgfHwgZHRTZWNvbmRzIDwgMCkge1xuICAgICAgZHRTZWNvbmRzID0gMDtcbiAgICB9XG4gIH1cbiAgbGFzdExvb3BUcyA9IHRpbWVzdGFtcDtcbiAgdXBkYXRlTGVnRGFzaE9mZnNldHMoZHRTZWNvbmRzKTtcblxuICBjdHguY2xlYXJSZWN0KDAsIDAsIGN2LndpZHRoLCBjdi5oZWlnaHQpO1xuICBkcmF3R3JpZCgpO1xuICBkcmF3Um91dGUoKTtcbiAgZHJhd01pc3NpbGVSb3V0ZSgpO1xuICBkcmF3TWlzc2lsZXMoKTtcblxuICB1cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcblxuICBmb3IgKGNvbnN0IGcgb2Ygc3RhdGVSZWYuZ2hvc3RzKSB7XG4gICAgZHJhd1NoaXAoZy54LCBnLnksIGcudngsIGcudnksIFwiIzljYTNhZlwiLCBmYWxzZSk7XG4gICAgZHJhd0dob3N0RG90KGcueCwgZy55KTtcbiAgfVxuICBpZiAoc3RhdGVSZWYubWUpIHtcbiAgICBkcmF3U2hpcChzdGF0ZVJlZi5tZS54LCBzdGF0ZVJlZi5tZS55LCBzdGF0ZVJlZi5tZS52eCwgc3RhdGVSZWYubWUudnksIFwiIzIyZDNlZVwiLCB0cnVlKTtcbiAgfVxuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG59XG4iLCAiaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi4vc3RhdGVcIjtcblxuaW50ZXJmYWNlIEhpZ2hsaWdodENvbnRlbnRPcHRpb25zIHtcbiAgdGFyZ2V0OiBIVE1MRWxlbWVudCB8IG51bGw7XG4gIHRpdGxlPzogc3RyaW5nO1xuICBib2R5OiBzdHJpbmc7XG4gIHN0ZXBJbmRleDogbnVtYmVyO1xuICBzdGVwQ291bnQ6IG51bWJlcjtcbiAgc2hvd05leHQ6IGJvb2xlYW47XG4gIG5leHRMYWJlbD86IHN0cmluZztcbiAgb25OZXh0PzogKCkgPT4gdm9pZDtcbiAgc2hvd1NraXA6IGJvb2xlYW47XG4gIHNraXBMYWJlbD86IHN0cmluZztcbiAgb25Ta2lwPzogKCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIaWdobGlnaHRlciB7XG4gIHNob3cob3B0aW9uczogSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMpOiB2b2lkO1xuICBoaWRlKCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuY29uc3QgU1RZTEVfSUQgPSBcInR1dG9yaWFsLW92ZXJsYXktc3R5bGVcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUhpZ2hsaWdodGVyKCk6IEhpZ2hsaWdodGVyIHtcbiAgZW5zdXJlU3R5bGVzKCk7XG5cbiAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5XCI7XG4gIG92ZXJsYXkuc2V0QXR0cmlidXRlKFwiYXJpYS1saXZlXCIsIFwicG9saXRlXCIpO1xuXG4gIGNvbnN0IHNjcmltID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc2NyaW0uY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19zY3JpbVwiO1xuXG4gIGNvbnN0IGhpZ2hsaWdodEJveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGhpZ2hsaWdodEJveC5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2hpZ2hsaWdodFwiO1xuXG4gIGNvbnN0IHRvb2x0aXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0b29sdGlwLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fdG9vbHRpcFwiO1xuXG4gIGNvbnN0IHByb2dyZXNzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgcHJvZ3Jlc3MuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19wcm9ncmVzc1wiO1xuXG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImgzXCIpO1xuICB0aXRsZS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3RpdGxlXCI7XG5cbiAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJwXCIpO1xuICBib2R5LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fYm9keVwiO1xuXG4gIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fYWN0aW9uc1wiO1xuXG4gIGNvbnN0IHNraXBCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBza2lwQnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBza2lwQnRuLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fYnRuIHR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3RcIjtcbiAgc2tpcEJ0bi50ZXh0Q29udGVudCA9IFwiU2tpcFwiO1xuXG4gIGNvbnN0IG5leHRCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBuZXh0QnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBuZXh0QnRuLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fYnRuIHR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeVwiO1xuICBuZXh0QnRuLnRleHRDb250ZW50ID0gXCJOZXh0XCI7XG5cbiAgYWN0aW9ucy5hcHBlbmQoc2tpcEJ0biwgbmV4dEJ0bik7XG4gIHRvb2x0aXAuYXBwZW5kKHByb2dyZXNzLCB0aXRsZSwgYm9keSwgYWN0aW9ucyk7XG4gIG92ZXJsYXkuYXBwZW5kKHNjcmltLCBoaWdobGlnaHRCb3gsIHRvb2x0aXApO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gIGxldCBjdXJyZW50VGFyZ2V0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgdmlzaWJsZSA9IGZhbHNlO1xuICBsZXQgcmVzaXplT2JzZXJ2ZXI6IFJlc2l6ZU9ic2VydmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCBmcmFtZUhhbmRsZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCBvbk5leHQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgb25Ta2lwOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBzY2hlZHVsZVVwZGF0ZSgpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUpIHJldHVybjtcbiAgICBpZiAoZnJhbWVIYW5kbGUgIT09IG51bGwpIHJldHVybjtcbiAgICBmcmFtZUhhbmRsZSA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgZnJhbWVIYW5kbGUgPSBudWxsO1xuICAgICAgdXBkYXRlUG9zaXRpb24oKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVBvc2l0aW9uKCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSkgcmV0dXJuO1xuXG4gICAgaWYgKGN1cnJlbnRUYXJnZXQpIHtcbiAgICAgIGNvbnN0IHJlY3QgPSBjdXJyZW50VGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgcGFkZGluZyA9IDEyO1xuICAgICAgY29uc3Qgd2lkdGggPSBNYXRoLm1heCgwLCByZWN0LndpZHRoICsgcGFkZGluZyAqIDIpO1xuICAgICAgY29uc3QgaGVpZ2h0ID0gTWF0aC5tYXgoMCwgcmVjdC5oZWlnaHQgKyBwYWRkaW5nICogMik7XG4gICAgICBjb25zdCBsZWZ0ID0gcmVjdC5sZWZ0IC0gcGFkZGluZztcbiAgICAgIGNvbnN0IHRvcCA9IHJlY3QudG9wIC0gcGFkZGluZztcblxuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjFcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZChsZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvcCl9cHgpYDtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS53aWR0aCA9IGAke01hdGgucm91bmQod2lkdGgpfXB4YDtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5oZWlnaHQgPSBgJHtNYXRoLnJvdW5kKGhlaWdodCl9cHhgO1xuXG4gICAgICB0b29sdGlwLnN0eWxlLm9wYWNpdHkgPSBcIjFcIjtcbiAgICAgIHRvb2x0aXAuc3R5bGUudmlzaWJpbGl0eSA9IFwidmlzaWJsZVwiO1xuICAgICAgdG9vbHRpcC5zdHlsZS5tYXhXaWR0aCA9IGBtaW4oMzQwcHgsICR7TWF0aC5tYXgoMjYwLCB3aW5kb3cuaW5uZXJXaWR0aCAtIDMyKX1weClgO1xuICAgICAgY29uc3QgdG9vbHRpcFdpZHRoID0gdG9vbHRpcC5vZmZzZXRXaWR0aDtcbiAgICAgIGNvbnN0IHRvb2x0aXBIZWlnaHQgPSB0b29sdGlwLm9mZnNldEhlaWdodDtcbiAgICAgIGxldCB0b29sdGlwVG9wID0gcmVjdC5ib3R0b20gKyAxODtcbiAgICAgIGlmICh0b29sdGlwVG9wICsgdG9vbHRpcEhlaWdodCA+IHdpbmRvdy5pbm5lckhlaWdodCAtIDIwKSB7XG4gICAgICAgIHRvb2x0aXBUb3AgPSBNYXRoLm1heCgyMCwgcmVjdC50b3AgLSB0b29sdGlwSGVpZ2h0IC0gMTgpO1xuICAgICAgfVxuICAgICAgbGV0IHRvb2x0aXBMZWZ0ID0gcmVjdC5sZWZ0ICsgcmVjdC53aWR0aCAvIDIgLSB0b29sdGlwV2lkdGggLyAyO1xuICAgICAgdG9vbHRpcExlZnQgPSBjbGFtcCh0b29sdGlwTGVmdCwgMjAsIHdpbmRvdy5pbm5lcldpZHRoIC0gdG9vbHRpcFdpZHRoIC0gMjApO1xuICAgICAgdG9vbHRpcC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh0b29sdGlwTGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b29sdGlwVG9wKX1weClgO1xuICAgIH0gZWxzZSB7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLndpZHRoID0gXCIwcHhcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5oZWlnaHQgPSBcIjBweFwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHdpbmRvdy5pbm5lcldpZHRoIC8gMil9cHgsICR7TWF0aC5yb3VuZCh3aW5kb3cuaW5uZXJIZWlnaHQgLyAyKX1weClgO1xuXG4gICAgICB0b29sdGlwLnN0eWxlLm9wYWNpdHkgPSBcIjFcIjtcbiAgICAgIHRvb2x0aXAuc3R5bGUudmlzaWJpbGl0eSA9IFwidmlzaWJsZVwiO1xuICAgICAgY29uc3QgdG9vbHRpcFdpZHRoID0gdG9vbHRpcC5vZmZzZXRXaWR0aDtcbiAgICAgIGNvbnN0IHRvb2x0aXBIZWlnaHQgPSB0b29sdGlwLm9mZnNldEhlaWdodDtcbiAgICAgIGNvbnN0IHRvb2x0aXBMZWZ0ID0gY2xhbXAoKHdpbmRvdy5pbm5lcldpZHRoIC0gdG9vbHRpcFdpZHRoKSAvIDIsIDIwLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCAtIDIwKTtcbiAgICAgIGNvbnN0IHRvb2x0aXBUb3AgPSBjbGFtcCgod2luZG93LmlubmVySGVpZ2h0IC0gdG9vbHRpcEhlaWdodCkgLyAyLCAyMCwgd2luZG93LmlubmVySGVpZ2h0IC0gdG9vbHRpcEhlaWdodCAtIDIwKTtcbiAgICAgIHRvb2x0aXAuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQodG9vbHRpcExlZnQpfXB4LCAke01hdGgucm91bmQodG9vbHRpcFRvcCl9cHgpYDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhdHRhY2hMaXN0ZW5lcnMoKTogdm9pZCB7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgc2NoZWR1bGVVcGRhdGUsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCBzY2hlZHVsZVVwZGF0ZSwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZGV0YWNoTGlzdGVuZXJzKCk6IHZvaWQge1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHNjaGVkdWxlVXBkYXRlKTtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCBzY2hlZHVsZVVwZGF0ZSk7XG4gICAgaWYgKGZyYW1lSGFuZGxlICE9PSBudWxsKSB7XG4gICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUoZnJhbWVIYW5kbGUpO1xuICAgICAgZnJhbWVIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgICBpZiAocmVzaXplT2JzZXJ2ZXIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBza2lwQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIG9uU2tpcD8uKCk7XG4gIH0pO1xuXG4gIG5leHRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgb25OZXh0Py4oKTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gcmVuZGVyVG9vbHRpcChvcHRpb25zOiBIaWdobGlnaHRDb250ZW50T3B0aW9ucyk6IHZvaWQge1xuICAgIGNvbnN0IHsgc3RlcENvdW50LCBzdGVwSW5kZXgsIHRpdGxlOiBvcHRpb25UaXRsZSwgYm9keTogb3B0aW9uQm9keSwgc2hvd05leHQsIG5leHRMYWJlbCwgc2hvd1NraXAsIHNraXBMYWJlbCB9ID0gb3B0aW9ucztcblxuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoc3RlcENvdW50KSAmJiBzdGVwQ291bnQgPiAwKSB7XG4gICAgICBwcm9ncmVzcy50ZXh0Q29udGVudCA9IGBTdGVwICR7c3RlcEluZGV4ICsgMX0gb2YgJHtzdGVwQ291bnR9YDtcbiAgICAgIHByb2dyZXNzLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2dyZXNzLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIHByb2dyZXNzLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBpZiAob3B0aW9uVGl0bGUgJiYgb3B0aW9uVGl0bGUudHJpbSgpLmxlbmd0aCA+IDApIHtcbiAgICAgIHRpdGxlLnRleHRDb250ZW50ID0gb3B0aW9uVGl0bGU7XG4gICAgICB0aXRsZS5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aXRsZS50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICB0aXRsZS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgYm9keS50ZXh0Q29udGVudCA9IG9wdGlvbkJvZHk7XG5cbiAgICBvbk5leHQgPSBzaG93TmV4dCA/IG9wdGlvbnMub25OZXh0ID8/IG51bGwgOiBudWxsO1xuICAgIGlmIChzaG93TmV4dCkge1xuICAgICAgbmV4dEJ0bi50ZXh0Q29udGVudCA9IG5leHRMYWJlbCA/PyBcIk5leHRcIjtcbiAgICAgIG5leHRCdG4uc3R5bGUuZGlzcGxheSA9IFwiaW5saW5lLWZsZXhcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgb25Ta2lwID0gc2hvd1NraXAgPyBvcHRpb25zLm9uU2tpcCA/PyBudWxsIDogbnVsbDtcbiAgICBpZiAoc2hvd1NraXApIHtcbiAgICAgIHNraXBCdG4udGV4dENvbnRlbnQgPSBza2lwTGFiZWwgPz8gXCJTa2lwXCI7XG4gICAgICBza2lwQnRuLnN0eWxlLmRpc3BsYXkgPSBcImlubGluZS1mbGV4XCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNraXBCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3cob3B0aW9uczogSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMpOiB2b2lkIHtcbiAgICB2aXNpYmxlID0gdHJ1ZTtcbiAgICBjdXJyZW50VGFyZ2V0ID0gb3B0aW9ucy50YXJnZXQgPz8gbnVsbDtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgIHJlbmRlclRvb2x0aXAob3B0aW9ucyk7XG4gICAgaWYgKHJlc2l6ZU9ic2VydmVyKSB7XG4gICAgICByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50VGFyZ2V0ICYmIHR5cGVvZiBSZXNpemVPYnNlcnZlciAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoKCkgPT4gc2NoZWR1bGVVcGRhdGUoKSk7XG4gICAgICByZXNpemVPYnNlcnZlci5vYnNlcnZlKGN1cnJlbnRUYXJnZXQpO1xuICAgIH1cbiAgICBhdHRhY2hMaXN0ZW5lcnMoKTtcbiAgICBzY2hlZHVsZVVwZGF0ZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGlkZSgpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUpIHJldHVybjtcbiAgICB2aXNpYmxlID0gZmFsc2U7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcImhpZGRlblwiO1xuICAgIHRvb2x0aXAuc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgZGV0YWNoTGlzdGVuZXJzKCk7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95KCk6IHZvaWQge1xuICAgIGhpZGUoKTtcbiAgICBvdmVybGF5LnJlbW92ZSgpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzaG93LFxuICAgIGhpZGUsXG4gICAgZGVzdHJveSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlU3R5bGVzKCk6IHZvaWQge1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoU1RZTEVfSUQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICBzdHlsZS5pZCA9IFNUWUxFX0lEO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAudHV0b3JpYWwtb3ZlcmxheSB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICBpbnNldDogMDtcbiAgICAgIHotaW5kZXg6IDUwO1xuICAgICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheS52aXNpYmxlIHtcbiAgICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fc2NyaW0ge1xuICAgICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19oaWdobGlnaHQge1xuICAgICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTRweDtcbiAgICAgIGJvcmRlcjogMnB4IHNvbGlkIHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjk1KTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMCAwIDJweCByZ2JhKDU2LCAxODksIDI0OCwgMC4yNSksIDAgMCAyNHB4IHJnYmEoMzQsIDIxMSwgMjM4LCAwLjI1KTtcbiAgICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE4cyBlYXNlLCB3aWR0aCAwLjE4cyBlYXNlLCBoZWlnaHQgMC4xOHMgZWFzZSwgb3BhY2l0eSAwLjE4cyBlYXNlO1xuICAgICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gICAgICBvcGFjaXR5OiAwO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fdG9vbHRpcCB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICBtaW4td2lkdGg6IDI0MHB4O1xuICAgICAgbWF4LXdpZHRoOiBtaW4oMzQwcHgsIGNhbGMoMTAwdncgLSAzMnB4KSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDE1LCAyMywgNDIsIDAuOTUpO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE2cHg7XG4gICAgICBwYWRkaW5nOiAxNnB4IDE4cHg7XG4gICAgICBjb2xvcjogI2UyZThmMDtcbiAgICAgIGJveC1zaGFkb3c6IDAgMTJweCAzMnB4IHJnYmEoMTUsIDIzLCA0MiwgMC41NSk7XG4gICAgICBwb2ludGVyLWV2ZW50czogYXV0bztcbiAgICAgIG9wYWNpdHk6IDA7XG4gICAgICB2aXNpYmlsaXR5OiBoaWRkZW47XG4gICAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgwcHgsIDBweCk7XG4gICAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC4xOHMgZWFzZSwgb3BhY2l0eSAwLjE4cyBlYXNlO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3Mge1xuICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTtcbiAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgICBjb2xvcjogcmdiYSgxNDgsIDE2MywgMTg0LCAwLjc1KTtcbiAgICAgIG1hcmdpbjogMCAwIDhweDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3RpdGxlIHtcbiAgICAgIG1hcmdpbjogMCAwIDhweDtcbiAgICAgIGZvbnQtc2l6ZTogMTVweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA0ZW07XG4gICAgICBjb2xvcjogI2YxZjVmOTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2JvZHkge1xuICAgICAgbWFyZ2luOiAwIDAgMTRweDtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGxpbmUtaGVpZ2h0OiAxLjU7XG4gICAgICBjb2xvcjogI2NiZDVmNTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnMge1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGdhcDogMTBweDtcbiAgICAgIGp1c3RpZnktY29udGVudDogZmxleC1lbmQ7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4ge1xuICAgICAgZm9udDogaW5oZXJpdDtcbiAgICAgIHBhZGRpbmc6IDZweCAxNHB4O1xuICAgICAgYm9yZGVyLXJhZGl1czogOTk5cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wOGVtO1xuICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5IHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjI1KTtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNTUpO1xuICAgICAgY29sb3I6ICNmOGZhZmM7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnk6aG92ZXIge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSg1NiwgMTg5LCAyNDgsIDAuMzUpO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdCB7XG4gICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgIGNvbG9yOiByZ2JhKDIwMywgMjEzLCAyMjUsIDAuOSk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0OmhvdmVyIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyMDMsIDIxMywgMjI1LCAwLjU1KTtcbiAgICB9XG4gICAgQG1lZGlhIChtYXgtd2lkdGg6IDc2OHB4KSB7XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fdG9vbHRpcCB7XG4gICAgICAgIG1pbi13aWR0aDogMjAwcHg7XG4gICAgICAgIG1heC13aWR0aDogbWluKDMyMHB4LCBjYWxjKDEwMHZ3IC0gMjRweCkpO1xuICAgICAgICBwYWRkaW5nOiAxMHB4IDEycHg7XG4gICAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICAgIGZsZXgtZGlyZWN0aW9uOiByb3c7XG4gICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgIGdhcDogMTJweDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X19wcm9ncmVzcyB7XG4gICAgICAgIGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X190aXRsZSB7XG4gICAgICAgIGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X19ib2R5IHtcbiAgICAgICAgbWFyZ2luOiAwO1xuICAgICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICAgIGZsZXg6IDE7XG4gICAgICAgIGxpbmUtaGVpZ2h0OiAxLjQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYWN0aW9ucyB7XG4gICAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICAgIGdhcDogNnB4O1xuICAgICAgICBmbGV4LXNocmluazogMDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4ge1xuICAgICAgICBwYWRkaW5nOiA1cHggMTBweDtcbiAgICAgICAgZm9udC1zaXplOiAxMHB4O1xuICAgICAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgfVxuICAgIH1cbiAgYDtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG4iLCAiY29uc3QgU1RPUkFHRV9QUkVGSVggPSBcImxzZDp0dXRvcmlhbDpcIjtcblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbFByb2dyZXNzIHtcbiAgc3RlcEluZGV4OiBudW1iZXI7XG4gIGNvbXBsZXRlZDogYm9vbGVhbjtcbiAgdXBkYXRlZEF0OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGdldFN0b3JhZ2UoKTogU3RvcmFnZSB8IG51bGwge1xuICB0cnkge1xuICAgIGlmICh0eXBlb2Ygd2luZG93ID09PSBcInVuZGVmaW5lZFwiIHx8ICF3aW5kb3cubG9jYWxTdG9yYWdlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZFByb2dyZXNzKGlkOiBzdHJpbmcpOiBUdXRvcmlhbFByb2dyZXNzIHwgbnVsbCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgY29uc3QgcmF3ID0gc3RvcmFnZS5nZXRJdGVtKFNUT1JBR0VfUFJFRklYICsgaWQpO1xuICAgIGlmICghcmF3KSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgVHV0b3JpYWxQcm9ncmVzcztcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgcGFyc2VkICE9PSBcIm9iamVjdFwiIHx8IHBhcnNlZCA9PT0gbnVsbCB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5zdGVwSW5kZXggIT09IFwibnVtYmVyXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuY29tcGxldGVkICE9PSBcImJvb2xlYW5cIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC51cGRhdGVkQXQgIT09IFwibnVtYmVyXCJcbiAgICApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gcGFyc2VkO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVByb2dyZXNzKGlkOiBzdHJpbmcsIHByb2dyZXNzOiBUdXRvcmlhbFByb2dyZXNzKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2Uuc2V0SXRlbShTVE9SQUdFX1BSRUZJWCArIGlkLCBKU09OLnN0cmluZ2lmeShwcm9ncmVzcykpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICAvLyBpZ25vcmUgc3RvcmFnZSBmYWlsdXJlc1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclByb2dyZXNzKGlkOiBzdHJpbmcpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5yZW1vdmVJdGVtKFNUT1JBR0VfUFJFRklYICsgaWQpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICAvLyBpZ25vcmUgc3RvcmFnZSBmYWlsdXJlc1xuICB9XG59XG4iLCAiZXhwb3J0IHR5cGUgUm9sZUlkID1cbiAgfCBcImNhbnZhc1wiXG4gIHwgXCJzaGlwU2V0XCJcbiAgfCBcInNoaXBTZWxlY3RcIlxuICB8IFwic2hpcERlbGV0ZVwiXG4gIHwgXCJzaGlwQ2xlYXJcIlxuICB8IFwic2hpcFNwZWVkU2xpZGVyXCJcbiAgfCBcIm1pc3NpbGVTZXRcIlxuICB8IFwibWlzc2lsZVNlbGVjdFwiXG4gIHwgXCJtaXNzaWxlRGVsZXRlXCJcbiAgfCBcIm1pc3NpbGVTcGVlZFNsaWRlclwiXG4gIHwgXCJtaXNzaWxlQWdyb1NsaWRlclwiXG4gIHwgXCJtaXNzaWxlQWRkUm91dGVcIlxuICB8IFwibWlzc2lsZUxhdW5jaFwiXG4gIHwgXCJyb3V0ZVByZXZcIlxuICB8IFwicm91dGVOZXh0XCJcbiAgfCBcImhlbHBUb2dnbGVcIlxuICB8IFwidHV0b3JpYWxTdGFydFwiXG4gIHwgXCJzcGF3bkJvdFwiO1xuXG5leHBvcnQgdHlwZSBSb2xlUmVzb2x2ZXIgPSAoKSA9PiBIVE1MRWxlbWVudCB8IG51bGw7XG5cbmV4cG9ydCB0eXBlIFJvbGVzTWFwID0gUmVjb3JkPFJvbGVJZCwgUm9sZVJlc29sdmVyPjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJvbGVzKCk6IFJvbGVzTWFwIHtcbiAgcmV0dXJuIHtcbiAgICBjYW52YXM6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3ZcIiksXG4gICAgc2hpcFNldDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNldFwiKSxcbiAgICBzaGlwU2VsZWN0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0XCIpLFxuICAgIHNoaXBEZWxldGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1kZWxldGVcIiksXG4gICAgc2hpcENsZWFyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIiksXG4gICAgc2hpcFNwZWVkU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtc2xpZGVyXCIpLFxuICAgIG1pc3NpbGVTZXQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZXRcIiksXG4gICAgbWlzc2lsZVNlbGVjdDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNlbGVjdFwiKSxcbiAgICBtaXNzaWxlRGVsZXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtZGVsZXRlXCIpLFxuICAgIG1pc3NpbGVTcGVlZFNsaWRlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLXNsaWRlclwiKSxcbiAgICBtaXNzaWxlQWdyb1NsaWRlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tc2xpZGVyXCIpLFxuICAgIG1pc3NpbGVBZGRSb3V0ZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFkZC1yb3V0ZVwiKSxcbiAgICBtaXNzaWxlTGF1bmNoOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoXCIpLFxuICAgIHJvdXRlUHJldjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1wcmV2XCIpLFxuICAgIHJvdXRlTmV4dDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1uZXh0XCIpLFxuICAgIGhlbHBUb2dnbGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC10b2dnbGVcIiksXG4gICAgdHV0b3JpYWxTdGFydDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0dXRvcmlhbC1zdGFydFwiKSxcbiAgICBzcGF3bkJvdDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGF3bi1ib3RcIiksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSb2xlRWxlbWVudChyb2xlczogUm9sZXNNYXAsIHJvbGU6IFJvbGVJZCB8IG51bGwgfCB1bmRlZmluZWQpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuICBpZiAoIXJvbGUpIHJldHVybiBudWxsO1xuICBjb25zdCByZXNvbHZlciA9IHJvbGVzW3JvbGVdO1xuICByZXR1cm4gcmVzb2x2ZXIgPyByZXNvbHZlcigpIDogbnVsbDtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzLCBFdmVudEtleSB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZUhpZ2hsaWdodGVyLCB0eXBlIEhpZ2hsaWdodGVyIH0gZnJvbSBcIi4vaGlnaGxpZ2h0XCI7XG5pbXBvcnQgeyBjbGVhclByb2dyZXNzLCBsb2FkUHJvZ3Jlc3MsIHNhdmVQcm9ncmVzcyB9IGZyb20gXCIuL3N0b3JhZ2VcIjtcbmltcG9ydCB7IGdldFJvbGVFbGVtZW50LCB0eXBlIFJvbGVJZCwgdHlwZSBSb2xlc01hcCB9IGZyb20gXCIuL3JvbGVzXCI7XG5cbmV4cG9ydCB0eXBlIFN0ZXBBZHZhbmNlID1cbiAgfCB7XG4gICAgICBraW5kOiBcImV2ZW50XCI7XG4gICAgICBldmVudDogRXZlbnRLZXk7XG4gICAgICB3aGVuPzogKHBheWxvYWQ6IHVua25vd24pID0+IGJvb2xlYW47XG4gICAgICBjaGVjaz86ICgpID0+IGJvb2xlYW47XG4gICAgfVxuICB8IHtcbiAgICAgIGtpbmQ6IFwibWFudWFsXCI7XG4gICAgICBuZXh0TGFiZWw/OiBzdHJpbmc7XG4gICAgfTtcblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbFN0ZXAge1xuICBpZDogc3RyaW5nO1xuICB0YXJnZXQ6IFJvbGVJZCB8ICgoKSA9PiBIVE1MRWxlbWVudCB8IG51bGwpIHwgbnVsbDtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGJvZHk6IHN0cmluZztcbiAgYWR2YW5jZTogU3RlcEFkdmFuY2U7XG4gIG9uRW50ZXI/OiAoKSA9PiB2b2lkO1xuICBvbkV4aXQ/OiAoKSA9PiB2b2lkO1xuICBhbGxvd1NraXA/OiBib29sZWFuO1xuICBza2lwTGFiZWw/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBFbmdpbmVPcHRpb25zIHtcbiAgaWQ6IHN0cmluZztcbiAgYnVzOiBFdmVudEJ1cztcbiAgcm9sZXM6IFJvbGVzTWFwO1xuICBzdGVwczogVHV0b3JpYWxTdGVwW107XG59XG5cbmludGVyZmFjZSBTdGFydE9wdGlvbnMge1xuICByZXN1bWU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsRW5naW5lIHtcbiAgc3RhcnQob3B0aW9ucz86IFN0YXJ0T3B0aW9ucyk6IHZvaWQ7XG4gIHJlc3RhcnQoKTogdm9pZDtcbiAgc3RvcCgpOiB2b2lkO1xuICBpc1J1bm5pbmcoKTogYm9vbGVhbjtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVHV0b3JpYWxFbmdpbmUoeyBpZCwgYnVzLCByb2xlcywgc3RlcHMgfTogRW5naW5lT3B0aW9ucyk6IFR1dG9yaWFsRW5naW5lIHtcbiAgY29uc3QgaGlnaGxpZ2h0ZXI6IEhpZ2hsaWdodGVyID0gY3JlYXRlSGlnaGxpZ2h0ZXIoKTtcbiAgbGV0IHJ1bm5pbmcgPSBmYWxzZTtcbiAgbGV0IHBhdXNlZCA9IGZhbHNlO1xuICBsZXQgY3VycmVudEluZGV4ID0gLTE7XG4gIGxldCBjdXJyZW50U3RlcDogVHV0b3JpYWxTdGVwIHwgbnVsbCA9IG51bGw7XG4gIGxldCBjbGVhbnVwQ3VycmVudDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCByZW5kZXJDdXJyZW50OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IGxhc3RTYXZlZENvbXBsZXRlZCA9IGZhbHNlO1xuICBsZXQgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gZmFsc2U7XG5cbiAgY29uc3QgcGVyc2lzdGVudExpc3RlbmVyczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcblxuICBwZXJzaXN0ZW50TGlzdGVuZXJzLnB1c2goXG4gICAgYnVzLm9uKFwiaGVscDp2aXNpYmxlQ2hhbmdlZFwiLCAoeyB2aXNpYmxlIH0pID0+IHtcbiAgICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgICAgcGF1c2VkID0gQm9vbGVhbih2aXNpYmxlKTtcbiAgICAgIGlmIChwYXVzZWQpIHtcbiAgICAgICAgaGlnaGxpZ2h0ZXIuaGlkZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVuZGVyQ3VycmVudD8uKCk7XG4gICAgICB9XG4gICAgfSksXG4gICk7XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVRhcmdldChzdGVwOiBUdXRvcmlhbFN0ZXApOiBIVE1MRWxlbWVudCB8IG51bGwge1xuICAgIGlmICghc3RlcC50YXJnZXQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHN0ZXAudGFyZ2V0ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIHJldHVybiBzdGVwLnRhcmdldCgpO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0Um9sZUVsZW1lbnQocm9sZXMsIHN0ZXAudGFyZ2V0KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsYW1wSW5kZXgoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoaW5kZXgpIHx8IGluZGV4IDwgMCkgcmV0dXJuIDA7XG4gICAgaWYgKGluZGV4ID49IHN0ZXBzLmxlbmd0aCkgcmV0dXJuIHN0ZXBzLmxlbmd0aCAtIDE7XG4gICAgcmV0dXJuIE1hdGguZmxvb3IoaW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0U3RlcChpbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29tcGxldGVUdXRvcmlhbCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHN0ZXBzLmxlbmd0aCkge1xuICAgICAgY29tcGxldGVUdXRvcmlhbCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChjbGVhbnVwQ3VycmVudCkge1xuICAgICAgY2xlYW51cEN1cnJlbnQoKTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuXG4gICAgY3VycmVudEluZGV4ID0gaW5kZXg7XG4gICAgY29uc3Qgc3RlcCA9IHN0ZXBzW2luZGV4XTtcbiAgICBjdXJyZW50U3RlcCA9IHN0ZXA7XG5cbiAgICBwZXJzaXN0UHJvZ3Jlc3MoaW5kZXgsIGZhbHNlKTtcblxuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIiwgeyBpZCwgc3RlcEluZGV4OiBpbmRleCwgdG90YWw6IHN0ZXBzLmxlbmd0aCB9KTtcbiAgICBzdGVwLm9uRW50ZXI/LigpO1xuXG4gICAgY29uc3QgYWxsb3dTa2lwID0gc3RlcC5hbGxvd1NraXAgIT09IGZhbHNlO1xuICAgIGNvbnN0IHJlbmRlciA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGlmICghcnVubmluZyB8fCBwYXVzZWQpIHJldHVybjtcbiAgICAgIGhpZ2hsaWdodGVyLnNob3coe1xuICAgICAgICB0YXJnZXQ6IHJlc29sdmVUYXJnZXQoc3RlcCksXG4gICAgICAgIHRpdGxlOiBzdGVwLnRpdGxlLFxuICAgICAgICBib2R5OiBzdGVwLmJvZHksXG4gICAgICAgIHN0ZXBJbmRleDogaW5kZXgsXG4gICAgICAgIHN0ZXBDb3VudDogc3RlcHMubGVuZ3RoLFxuICAgICAgICBzaG93TmV4dDogc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwibWFudWFsXCIsXG4gICAgICAgIG5leHRMYWJlbDogc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwibWFudWFsXCJcbiAgICAgICAgICA/IHN0ZXAuYWR2YW5jZS5uZXh0TGFiZWwgPz8gKGluZGV4ID09PSBzdGVwcy5sZW5ndGggLSAxID8gXCJGaW5pc2hcIiA6IFwiTmV4dFwiKVxuICAgICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgICBvbk5leHQ6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiID8gYWR2YW5jZVN0ZXAgOiB1bmRlZmluZWQsXG4gICAgICAgIHNob3dTa2lwOiBhbGxvd1NraXAsXG4gICAgICAgIHNraXBMYWJlbDogc3RlcC5za2lwTGFiZWwsXG4gICAgICAgIG9uU2tpcDogYWxsb3dTa2lwID8gc2tpcEN1cnJlbnRTdGVwIDogdW5kZWZpbmVkLFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIHJlbmRlckN1cnJlbnQgPSByZW5kZXI7XG4gICAgcmVuZGVyKCk7XG5cbiAgICBpZiAoc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwiZXZlbnRcIikge1xuICAgICAgY29uc3QgaGFuZGxlciA9IChwYXlsb2FkOiB1bmtub3duKTogdm9pZCA9PiB7XG4gICAgICAgIGlmICghcnVubmluZyB8fCBwYXVzZWQpIHJldHVybjtcbiAgICAgICAgaWYgKHN0ZXAuYWR2YW5jZS53aGVuICYmICFzdGVwLmFkdmFuY2Uud2hlbihwYXlsb2FkKSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBhZHZhbmNlVG8oaW5kZXggKyAxKTtcbiAgICAgIH07XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IGJ1cy5vbihzdGVwLmFkdmFuY2UuZXZlbnQsIGhhbmRsZXIgYXMgKHZhbHVlOiBuZXZlcikgPT4gdm9pZCk7XG4gICAgICBpZiAoc3RlcC5hZHZhbmNlLmNoZWNrICYmIHN0ZXAuYWR2YW5jZS5jaGVjaygpKSB7XG4gICAgICAgIGhhbmRsZXIodW5kZWZpbmVkKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGFkdmFuY2VUbyhuZXh0SW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIGlmIChjbGVhbnVwQ3VycmVudCkge1xuICAgICAgY2xlYW51cEN1cnJlbnQoKTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKGN1cnJlbnRTdGVwKSB7XG4gICAgICBjdXJyZW50U3RlcC5vbkV4aXQ/LigpO1xuICAgICAgY3VycmVudFN0ZXAgPSBudWxsO1xuICAgIH1cbiAgICByZW5kZXJDdXJyZW50ID0gbnVsbDtcbiAgICBpZiAobmV4dEluZGV4ID49IHN0ZXBzLmxlbmd0aCkge1xuICAgICAgY29tcGxldGVUdXRvcmlhbCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXRTdGVwKG5leHRJbmRleCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYWR2YW5jZVN0ZXAoKTogdm9pZCB7XG4gICAgYWR2YW5jZVRvKGN1cnJlbnRJbmRleCArIDEpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2tpcEN1cnJlbnRTdGVwKCk6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIGNvbnN0IG5leHRJbmRleCA9IGN1cnJlbnRJbmRleCA+PSAwID8gY3VycmVudEluZGV4ICsgMSA6IDA7XG4gICAgYWR2YW5jZVRvKG5leHRJbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiBjb21wbGV0ZVR1dG9yaWFsKCk6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IHRydWU7XG4gICAgcGVyc2lzdFByb2dyZXNzKHN0ZXBzLmxlbmd0aCwgdHJ1ZSk7XG4gICAgYnVzLmVtaXQoXCJ0dXRvcmlhbDpjb21wbGV0ZWRcIiwgeyBpZCB9KTtcbiAgICBzdG9wKCk7XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gZmFsc2U7XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydChvcHRpb25zPzogU3RhcnRPcHRpb25zKTogdm9pZCB7XG4gICAgY29uc3QgcmVzdW1lID0gb3B0aW9ucz8ucmVzdW1lICE9PSBmYWxzZTtcbiAgICBpZiAocnVubmluZykge1xuICAgICAgcmVzdGFydCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJ1bm5pbmcgPSB0cnVlO1xuICAgIHBhdXNlZCA9IGZhbHNlO1xuICAgIHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuICAgIGxhc3RTYXZlZENvbXBsZXRlZCA9IGZhbHNlO1xuICAgIGxldCBzdGFydEluZGV4ID0gMDtcbiAgICBpZiAocmVzdW1lKSB7XG4gICAgICBjb25zdCBwcm9ncmVzcyA9IGxvYWRQcm9ncmVzcyhpZCk7XG4gICAgICBpZiAocHJvZ3Jlc3MgJiYgIXByb2dyZXNzLmNvbXBsZXRlZCkge1xuICAgICAgICBzdGFydEluZGV4ID0gY2xhbXBJbmRleChwcm9ncmVzcy5zdGVwSW5kZXgpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjbGVhclByb2dyZXNzKGlkKTtcbiAgICB9XG4gICAgYnVzLmVtaXQoXCJ0dXRvcmlhbDpzdGFydGVkXCIsIHsgaWQgfSk7XG4gICAgc2V0U3RlcChzdGFydEluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RhcnQoKTogdm9pZCB7XG4gICAgc3RvcCgpO1xuICAgIHN0YXJ0KHsgcmVzdW1lOiBmYWxzZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0b3AoKTogdm9pZCB7XG4gICAgY29uc3Qgc2hvdWxkUGVyc2lzdCA9ICFzdXBwcmVzc1BlcnNpc3RPblN0b3AgJiYgcnVubmluZyAmJiAhbGFzdFNhdmVkQ29tcGxldGVkICYmIGN1cnJlbnRJbmRleCA+PSAwICYmIGN1cnJlbnRJbmRleCA8IHN0ZXBzLmxlbmd0aDtcbiAgICBjb25zdCBpbmRleFRvUGVyc2lzdCA9IGN1cnJlbnRJbmRleDtcblxuICAgIGlmIChjbGVhbnVwQ3VycmVudCkge1xuICAgICAgY2xlYW51cEN1cnJlbnQoKTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKGN1cnJlbnRTdGVwKSB7XG4gICAgICBjdXJyZW50U3RlcC5vbkV4aXQ/LigpO1xuICAgICAgY3VycmVudFN0ZXAgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoc2hvdWxkUGVyc2lzdCkge1xuICAgICAgcGVyc2lzdFByb2dyZXNzKGluZGV4VG9QZXJzaXN0LCBmYWxzZSk7XG4gICAgfVxuICAgIHJ1bm5pbmcgPSBmYWxzZTtcbiAgICBwYXVzZWQgPSBmYWxzZTtcbiAgICBjdXJyZW50SW5kZXggPSAtMTtcbiAgICByZW5kZXJDdXJyZW50ID0gbnVsbDtcbiAgICBoaWdobGlnaHRlci5oaWRlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBpc1J1bm5pbmcoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHJ1bm5pbmc7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95KCk6IHZvaWQge1xuICAgIHN0b3AoKTtcbiAgICBmb3IgKGNvbnN0IGRpc3Bvc2Ugb2YgcGVyc2lzdGVudExpc3RlbmVycykge1xuICAgICAgZGlzcG9zZSgpO1xuICAgIH1cbiAgICBoaWdobGlnaHRlci5kZXN0cm95KCk7XG4gIH1cblxuICBmdW5jdGlvbiBwZXJzaXN0UHJvZ3Jlc3Moc3RlcEluZGV4OiBudW1iZXIsIGNvbXBsZXRlZDogYm9vbGVhbik6IHZvaWQge1xuICAgIGxhc3RTYXZlZENvbXBsZXRlZCA9IGNvbXBsZXRlZDtcbiAgICBzYXZlUHJvZ3Jlc3MoaWQsIHtcbiAgICAgIHN0ZXBJbmRleCxcbiAgICAgIGNvbXBsZXRlZCxcbiAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc3RhcnQsXG4gICAgcmVzdGFydCxcbiAgICBzdG9wLFxuICAgIGlzUnVubmluZyxcbiAgICBkZXN0cm95LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgVHV0b3JpYWxTdGVwIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5cbmZ1bmN0aW9uIGhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQ6IHVua25vd24sIG1pbkluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcbiAgaWYgKHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiIHx8IHBheWxvYWQgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgaW5kZXggPSAocGF5bG9hZCBhcyB7IGluZGV4PzogdW5rbm93biB9KS5pbmRleDtcbiAgaWYgKHR5cGVvZiBpbmRleCAhPT0gXCJudW1iZXJcIiB8fCAhTnVtYmVyLmlzRmluaXRlKGluZGV4KSkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gaW5kZXggPj0gbWluSW5kZXg7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQ6IHVua25vd24pOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiIHx8IHBheWxvYWQgPT09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCByb3V0ZUlkID0gKHBheWxvYWQgYXMgeyByb3V0ZUlkPzogdW5rbm93biB9KS5yb3V0ZUlkO1xuICByZXR1cm4gdHlwZW9mIHJvdXRlSWQgPT09IFwic3RyaW5nXCIgPyByb3V0ZUlkIDogbnVsbDtcbn1cblxuZnVuY3Rpb24gcGF5bG9hZFRvb2xFcXVhbHModGFyZ2V0OiBzdHJpbmcpOiAocGF5bG9hZDogdW5rbm93bikgPT4gYm9vbGVhbiB7XG4gIHJldHVybiAocGF5bG9hZDogdW5rbm93bik6IGJvb2xlYW4gPT4ge1xuICAgIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgdG9vbCA9IChwYXlsb2FkIGFzIHsgdG9vbD86IHVua25vd24gfSkudG9vbDtcbiAgICByZXR1cm4gdHlwZW9mIHRvb2wgPT09IFwic3RyaW5nXCIgJiYgdG9vbCA9PT0gdGFyZ2V0O1xuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzKCk6IFR1dG9yaWFsU3RlcFtdIHtcbiAgbGV0IHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyID0gMDtcbiAgbGV0IGluaXRpYWxSb3V0ZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IG5ld1JvdXRlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG4gIHJldHVybiBbXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1wbG90LXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwiY2FudmFzXCIsXG4gICAgICB0aXRsZTogXCJQbG90IGEgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiQ2xpY2sgb24gdGhlIG1hcCB0byBkcm9wIGF0IGxlYXN0IHRocmVlIHdheXBvaW50cyBhbmQgc2tldGNoIHlvdXIgY291cnNlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6d2F5cG9pbnRBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMiksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1jaGFuZ2Utc3BlZWRcIixcbiAgICAgIHRhcmdldDogXCJzaGlwU3BlZWRTbGlkZXJcIixcbiAgICAgIHRpdGxlOiBcIkFkanVzdCBzaGlwIHNwZWVkXCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgU2hpcCBTcGVlZCBzbGlkZXIgKG9yIHByZXNzIFsgLyBdKSB0byBmaW5lLXR1bmUgeW91ciB0cmF2ZWwgc3BlZWQuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpzcGVlZENoYW5nZWRcIixcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLXNlbGVjdC1sZWdcIixcbiAgICAgIHRhcmdldDogXCJzaGlwU2VsZWN0XCIsXG4gICAgICB0aXRsZTogXCJTZWxlY3QgYSByb3V0ZSBsZWdcIixcbiAgICAgIGJvZHk6IFwiU3dpdGNoIHRvIFNlbGVjdCBtb2RlIChUIGtleSkgYW5kIHRoZW4gY2xpY2sgYSB3YXlwb2ludCBvbiB0aGUgbWFwIHRvIGhpZ2hsaWdodCBpdHMgbGVnLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6bGVnU2VsZWN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IGhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDApLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtZGVsZXRlLWxlZ1wiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBEZWxldGVcIixcbiAgICAgIHRpdGxlOiBcIkRlbGV0ZSBhIHJvdXRlIGxlZ1wiLFxuICAgICAgYm9keTogXCJSZW1vdmUgdGhlIHNlbGVjdGVkIHdheXBvaW50IHVzaW5nIHRoZSBEZWxldGUgY29udHJvbCBvciB0aGUgRGVsZXRlIGtleS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOndheXBvaW50RGVsZXRlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtY2xlYXItcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJzaGlwQ2xlYXJcIixcbiAgICAgIHRpdGxlOiBcIkNsZWFyIHRoZSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJDbGVhciByZW1haW5pbmcgd2F5cG9pbnRzIHRvIHJlc2V0IHlvdXIgcGxvdHRlZCBjb3Vyc2UuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpjbGVhckludm9rZWRcIixcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXNldC1tb2RlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZVNldFwiLFxuICAgICAgdGl0bGU6IFwiU3dpdGNoIHRvIG1pc3NpbGUgcGxhbm5pbmdcIixcbiAgICAgIGJvZHk6IFwiVGFwIFNldCBzbyBldmVyeSBjbGljayBkcm9wcyBtaXNzaWxlIHdheXBvaW50cyBvbiB0aGUgYWN0aXZlIHJvdXRlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIixcbiAgICAgICAgd2hlbjogcGF5bG9hZFRvb2xFcXVhbHMoXCJzZXRcIiksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1wbG90LWluaXRpYWxcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgbWlzc2lsZSB3YXlwb2ludHNcIixcbiAgICAgIGJvZHk6IFwiQ2xpY2sgdGhlIG1hcCB0byBkcm9wIGF0IGxlYXN0IHR3byBndWlkYW5jZSBwb2ludHMgZm9yIHRoZSBjdXJyZW50IG1pc3NpbGUgcm91dGUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgaWYgKCFoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAxKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAocm91dGVJZCkge1xuICAgICAgICAgICAgaW5pdGlhbFJvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1pbml0aWFsXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIHRoZSBzdHJpa2VcIixcbiAgICAgIGJvZHk6IFwiU2VuZCB0aGUgcGxhbm5lZCBtaXNzaWxlIHJvdXRlIGxpdmUgd2l0aCB0aGUgTGF1bmNoIGNvbnRyb2wgKEwga2V5KS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQpIHtcbiAgICAgICAgICAgIGluaXRpYWxSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gaW5pdGlhbFJvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1hZGQtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlQWRkUm91dGVcIixcbiAgICAgIHRpdGxlOiBcIkNyZWF0ZSBhIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIlByZXNzIE5ldyB0byBhZGQgYSBzZWNvbmQgbWlzc2lsZSByb3V0ZSBmb3IgYW5vdGhlciBzdHJpa2UgZ3JvdXAuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpyb3V0ZUFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghcm91dGVJZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIG5ld1JvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtcGxvdC1uZXctcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgdGhlIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkRyb3AgYXQgbGVhc3QgdHdvIHdheXBvaW50cyBvbiB0aGUgbmV3IHJvdXRlIHRvIGRlZmluZSBpdHMgcGF0aC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBpZiAoIWhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDEpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmIChuZXdSb3V0ZUlkICYmIHJvdXRlSWQgJiYgcm91dGVJZCAhPT0gbmV3Um91dGVJZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIW5ld1JvdXRlSWQgJiYgcm91dGVJZCkge1xuICAgICAgICAgICAgbmV3Um91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLW5ldy1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCB0aGUgbmV3IHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkxhdW5jaCB0aGUgZnJlc2ggbWlzc2lsZSByb3V0ZSB0byBjb25maXJtIGl0cyBwYXR0ZXJuLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghbmV3Um91dGVJZCB8fCAhcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IG5ld1JvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1zd2l0Y2gtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJyb3V0ZU5leHRcIixcbiAgICAgIHRpdGxlOiBcIlN3aXRjaCBiYWNrIHRvIHRoZSBvcmlnaW5hbCByb3V0ZVwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIFx1MjVDMCBcdTI1QjYgY29udHJvbHMgKG9yIFRhYi9TaGlmdCtUYWIpIHRvIHNlbGVjdCB5b3VyIGZpcnN0IG1pc3NpbGUgcm91dGUgYWdhaW4uXCIsXG4gICAgICBvbkVudGVyOiAoKSA9PiB7XG4gICAgICAgIHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyID0gMDtcbiAgICAgIH0sXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciArPSAxO1xuICAgICAgICAgIGlmIChyb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA8IDEpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCB8fCAhcm91dGVJZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1hZnRlci1zd2l0Y2hcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggZnJvbSB0aGUgb3RoZXIgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiRmlyZSB0aGUgb3JpZ2luYWwgbWlzc2lsZSByb3V0ZSB0byBwcmFjdGljZSByb3VuZC1yb2JpbiBzdHJpa2VzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQgfHwgIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJ0dXRvcmlhbC1wcmFjdGljZVwiLFxuICAgICAgdGFyZ2V0OiBcInNwYXduQm90XCIsXG4gICAgICB0aXRsZTogXCJTcGF3biBhIHByYWN0aWNlIGJvdFwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIEJvdCBjb250cm9sIHRvIGFkZCBhIHRhcmdldCBhbmQgcmVoZWFyc2UgdGhlc2UgbWFuZXV2ZXJzIGluIHJlYWwgdGltZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwidHV0b3JpYWwtY29tcGxldGVcIixcbiAgICAgIHRhcmdldDogbnVsbCxcbiAgICAgIHRpdGxlOiBcIllvdVx1MjAxOXJlIHJlYWR5XCIsXG4gICAgICBib2R5OiBcIkdyZWF0IHdvcmsuIFJlbG9hZCB0aGUgY29uc29sZSBvciByZWpvaW4gYSByb29tIHRvIHJldmlzaXQgdGhlc2UgZHJpbGxzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcIm1hbnVhbFwiLFxuICAgICAgICBuZXh0TGFiZWw6IFwiRmluaXNoXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICBdO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVUdXRvcmlhbEVuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgY3JlYXRlUm9sZXMgfSBmcm9tIFwiLi9yb2xlc1wiO1xuaW1wb3J0IHsgZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzIH0gZnJvbSBcIi4vc3RlcHNfYmFzaWNcIjtcbmV4cG9ydCBjb25zdCBCQVNJQ19UVVRPUklBTF9JRCA9IFwic2hpcC1iYXNpY3NcIjtcblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbENvbnRyb2xsZXIge1xuICBzdGFydChvcHRpb25zPzogeyByZXN1bWU/OiBib29sZWFuIH0pOiB2b2lkO1xuICByZXN0YXJ0KCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50VHV0b3JpYWwoYnVzOiBFdmVudEJ1cyk6IFR1dG9yaWFsQ29udHJvbGxlciB7XG4gIGNvbnN0IHJvbGVzID0gY3JlYXRlUm9sZXMoKTtcbiAgY29uc3QgZW5naW5lID0gY3JlYXRlVHV0b3JpYWxFbmdpbmUoe1xuICAgIGlkOiBCQVNJQ19UVVRPUklBTF9JRCxcbiAgICBidXMsXG4gICAgcm9sZXMsXG4gICAgc3RlcHM6IGdldEJhc2ljVHV0b3JpYWxTdGVwcygpLFxuICB9KTtcblxuICByZXR1cm4ge1xuICAgIHN0YXJ0KG9wdGlvbnMpIHtcbiAgICAgIGVuZ2luZS5zdGFydChvcHRpb25zKTtcbiAgICB9LFxuICAgIHJlc3RhcnQoKSB7XG4gICAgICBlbmdpbmUucmVzdGFydCgpO1xuICAgIH0sXG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGVuZ2luZS5kZXN0cm95KCk7XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBjbGFtcCB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlQ2hvaWNlIHtcbiAgaWQ6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlQ29udGVudCB7XG4gIHNwZWFrZXI6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBpbnRlbnQ/OiBcImZhY3RvcnlcIiB8IFwidW5pdFwiO1xuICBjaG9pY2VzPzogRGlhbG9ndWVDaG9pY2VbXTtcbiAgdHlwaW5nU3BlZWRNcz86IG51bWJlcjtcbiAgb25DaG9pY2U/OiAoY2hvaWNlSWQ6IHN0cmluZykgPT4gdm9pZDtcbiAgb25UZXh0RnVsbHlSZW5kZXJlZD86ICgpID0+IHZvaWQ7XG4gIG9uQ29udGludWU/OiAoKSA9PiB2b2lkO1xuICBjb250aW51ZUxhYmVsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlT3ZlcmxheSB7XG4gIHNob3coY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZDtcbiAgaGlkZSgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIGlzVmlzaWJsZSgpOiBib29sZWFuO1xufVxuXG5jb25zdCBTVFlMRV9JRCA9IFwiZGlhbG9ndWUtb3ZlcmxheS1zdHlsZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRGlhbG9ndWVPdmVybGF5KCk6IERpYWxvZ3VlT3ZlcmxheSB7XG4gIGVuc3VyZVN0eWxlcygpO1xuXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtb3ZlcmxheVwiO1xuICBvdmVybGF5LnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBcInBvbGl0ZVwiKTtcblxuICBjb25zdCBjb25zb2xlRnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBjb25zb2xlRnJhbWUuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jb25zb2xlXCI7XG5cbiAgY29uc3Qgc3BlYWtlckxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc3BlYWtlckxhYmVsLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtc3BlYWtlclwiO1xuXG4gIGNvbnN0IHRleHRCbG9jayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRleHRCbG9jay5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLXRleHRcIjtcblxuICBjb25zdCBjdXJzb3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgY3Vyc29yLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY3Vyc29yXCI7XG4gIGN1cnNvci50ZXh0Q29udGVudCA9IFwiX1wiO1xuXG4gIGNvbnN0IGNob2ljZXNMaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInVsXCIpO1xuICBjaG9pY2VzTGlzdC5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNob2ljZXMgaGlkZGVuXCI7XG5cbiAgY29uc3QgY29udGludWVCdXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBjb250aW51ZUJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgY29udGludWVCdXR0b24uY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jb250aW51ZSBoaWRkZW5cIjtcbiAgY29udGludWVCdXR0b24udGV4dENvbnRlbnQgPSBcIkNvbnRpbnVlXCI7XG5cbiAgdGV4dEJsb2NrLmFwcGVuZChjdXJzb3IpO1xuICBjb25zb2xlRnJhbWUuYXBwZW5kKHNwZWFrZXJMYWJlbCwgdGV4dEJsb2NrLCBjaG9pY2VzTGlzdCwgY29udGludWVCdXR0b24pO1xuICBvdmVybGF5LmFwcGVuZChjb25zb2xlRnJhbWUpO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gIGxldCB2aXNpYmxlID0gZmFsc2U7XG4gIGxldCB0eXBpbmdIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgdGFyZ2V0VGV4dCA9IFwiXCI7XG4gIGxldCByZW5kZXJlZENoYXJzID0gMDtcbiAgbGV0IGFjdGl2ZUNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGNsZWFyVHlwaW5nKCk6IHZvaWQge1xuICAgIGlmICh0eXBpbmdIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodHlwaW5nSGFuZGxlKTtcbiAgICAgIHR5cGluZ0hhbmRsZSA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZmluaXNoVHlwaW5nKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIHJlbmRlcmVkQ2hhcnMgPSB0YXJnZXRUZXh0Lmxlbmd0aDtcbiAgICB1cGRhdGVUZXh0KCk7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICBjb250ZW50Lm9uVGV4dEZ1bGx5UmVuZGVyZWQ/LigpO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShjb250ZW50LmNob2ljZXMpIHx8IGNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVUZXh0KCk6IHZvaWQge1xuICAgIGNvbnN0IHRleHRUb1Nob3cgPSB0YXJnZXRUZXh0LnNsaWNlKDAsIHJlbmRlcmVkQ2hhcnMpO1xuICAgIHRleHRCbG9jay5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNvbnN0IHRleHROb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgdGV4dE5vZGUudGV4dENvbnRlbnQgPSB0ZXh0VG9TaG93O1xuICAgIHRleHRCbG9jay5hcHBlbmQodGV4dE5vZGUsIGN1cnNvcik7XG4gICAgY3Vyc29yLmNsYXNzTGlzdC50b2dnbGUoXCJoaWRkZW5cIiwgIXZpc2libGUpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyQ2hvaWNlcyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBjaG9pY2VzTGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNvbnN0IGNob2ljZXMgPSBBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgPyBjb250ZW50LmNob2ljZXMgOiBbXTtcbiAgICBpZiAoY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gICAgY2hvaWNlcy5mb3JFYWNoKChjaG9pY2UsIGluZGV4KSA9PiB7XG4gICAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgICAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICAgIGJ1dHRvbi5kYXRhc2V0LmNob2ljZUlkID0gY2hvaWNlLmlkO1xuICAgICAgYnV0dG9uLnRleHRDb250ZW50ID0gYCR7aW5kZXggKyAxfS4gJHtjaG9pY2UudGV4dH1gO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICAgIGNvbnRlbnQub25DaG9pY2U/LihjaG9pY2UuaWQpO1xuICAgICAgfSk7XG4gICAgICBpdGVtLmFwcGVuZChidXR0b24pO1xuICAgICAgY2hvaWNlc0xpc3QuYXBwZW5kKGl0ZW0pO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc2hvd0NvbnRpbnVlKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGlmICghY29udGVudC5vbkNvbnRpbnVlKSB7XG4gICAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgICAgY29udGludWVCdXR0b24ub25jbGljayA9IG51bGw7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnRpbnVlQnV0dG9uLnRleHRDb250ZW50ID0gY29udGVudC5jb250aW51ZUxhYmVsID8/IFwiQ29udGludWVcIjtcbiAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSAoKSA9PiB7XG4gICAgICBjb250ZW50Lm9uQ29udGludWU/LigpO1xuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBzY2hlZHVsZVR5cGUoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICBjb25zdCB0eXBpbmdTcGVlZCA9IGNsYW1wKE51bWJlcihjb250ZW50LnR5cGluZ1NwZWVkTXMpIHx8IDE4LCA4LCA2NCk7XG4gICAgY29uc3QgdGljayA9ICgpOiB2b2lkID0+IHtcbiAgICAgIHJlbmRlcmVkQ2hhcnMgPSBNYXRoLm1pbihyZW5kZXJlZENoYXJzICsgMSwgdGFyZ2V0VGV4dC5sZW5ndGgpO1xuICAgICAgdXBkYXRlVGV4dCgpO1xuICAgICAgaWYgKHJlbmRlcmVkQ2hhcnMgPj0gdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgICAgY2xlYXJUeXBpbmcoKTtcbiAgICAgICAgY29udGVudC5vblRleHRGdWxseVJlbmRlcmVkPy4oKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgfHwgY29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHlwaW5nSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQodGljaywgdHlwaW5nU3BlZWQpO1xuICAgICAgfVxuICAgIH07XG4gICAgdHlwaW5nSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQodGljaywgdHlwaW5nU3BlZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSB8fCAhYWN0aXZlQ29udGVudCkgcmV0dXJuO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShhY3RpdmVDb250ZW50LmNob2ljZXMpIHx8IGFjdGl2ZUNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGlmIChldmVudC5rZXkgPT09IFwiIFwiIHx8IGV2ZW50LmtleSA9PT0gXCJFbnRlclwiKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGlmIChyZW5kZXJlZENoYXJzIDwgdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgICAgICBmaW5pc2hUeXBpbmcoYWN0aXZlQ29udGVudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYWN0aXZlQ29udGVudC5vbkNvbnRpbnVlPy4oKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBpbmRleCA9IHBhcnNlSW50KGV2ZW50LmtleSwgMTApO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoaW5kZXgpICYmIGluZGV4ID49IDEgJiYgaW5kZXggPD0gYWN0aXZlQ29udGVudC5jaG9pY2VzLmxlbmd0aCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IGNob2ljZSA9IGFjdGl2ZUNvbnRlbnQuY2hvaWNlc1tpbmRleCAtIDFdO1xuICAgICAgYWN0aXZlQ29udGVudC5vbkNob2ljZT8uKGNob2ljZS5pZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRW50ZXJcIiAmJiByZW5kZXJlZENoYXJzIDwgdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBmaW5pc2hUeXBpbmcoYWN0aXZlQ29udGVudCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvdyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBhY3RpdmVDb250ZW50ID0gY29udGVudDtcbiAgICB2aXNpYmxlID0gdHJ1ZTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgIG92ZXJsYXkuZGF0YXNldC5pbnRlbnQgPSBjb250ZW50LmludGVudCA/PyBcImZhY3RvcnlcIjtcbiAgICBzcGVha2VyTGFiZWwudGV4dENvbnRlbnQgPSBjb250ZW50LnNwZWFrZXI7XG5cbiAgICB0YXJnZXRUZXh0ID0gY29udGVudC50ZXh0O1xuICAgIHJlbmRlcmVkQ2hhcnMgPSAwO1xuICAgIHVwZGF0ZVRleHQoKTtcbiAgICByZW5kZXJDaG9pY2VzKGNvbnRlbnQpO1xuICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICBzY2hlZHVsZVR5cGUoY29udGVudCk7XG4gIH1cblxuICBmdW5jdGlvbiBoaWRlKCk6IHZvaWQge1xuICAgIHZpc2libGUgPSBmYWxzZTtcbiAgICBhY3RpdmVDb250ZW50ID0gbnVsbDtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgdGFyZ2V0VGV4dCA9IFwiXCI7XG4gICAgcmVuZGVyZWRDaGFycyA9IDA7XG4gICAgdGV4dEJsb2NrLmlubmVySFRNTCA9IFwiXCI7XG4gICAgdGV4dEJsb2NrLmFwcGVuZChjdXJzb3IpO1xuICAgIGNob2ljZXNMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlKCk7XG4gICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlS2V5RG93bik7XG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfVxuXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleURvd24pO1xuXG4gIHJldHVybiB7XG4gICAgc2hvdyxcbiAgICBoaWRlLFxuICAgIGRlc3Ryb3ksXG4gICAgaXNWaXNpYmxlKCkge1xuICAgICAgcmV0dXJuIHZpc2libGU7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlU3R5bGVzKCk6IHZvaWQge1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoU1RZTEVfSUQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICBzdHlsZS5pZCA9IFNUWUxFX0lEO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAuZGlhbG9ndWUtb3ZlcmxheSB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICBpbnNldDogMDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIHotaW5kZXg6IDYwO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICAgIHRyYW5zaXRpb246IG9wYWNpdHkgMC4ycyBlYXNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheS52aXNpYmxlIHtcbiAgICAgIG9wYWNpdHk6IDE7XG4gICAgICBwb2ludGVyLWV2ZW50czogYXV0bztcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgbWluLXdpZHRoOiAzMjBweDtcbiAgICAgIG1heC13aWR0aDogbWluKDUyMHB4LCBjYWxjKDEwMHZ3IC0gNDhweCkpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSg2LCAxMSwgMTYsIDAuOTIpO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDEycHg7XG4gICAgICBwYWRkaW5nOiAxOHB4IDIwcHg7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGdhcDogMTRweDtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMiwgNiwgMTYsIDAuNik7XG4gICAgICBjb2xvcjogI2UyZThmMDtcbiAgICAgIGZvbnQtZmFtaWx5OiBcIklCTSBQbGV4IE1vbm9cIiwgXCJKZXRCcmFpbnMgTW9ub1wiLCB1aS1tb25vc3BhY2UsIFNGTW9uby1SZWd1bGFyLCBNZW5sbywgTW9uYWNvLCBDb25zb2xhcywgXCJMaWJlcmF0aW9uIE1vbm9cIiwgXCJDb3VyaWVyIE5ld1wiLCBtb25vc3BhY2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5W2RhdGEtaW50ZW50PVwiZmFjdG9yeVwiXSAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjQ1KTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMTMsIDE0OCwgMTM2LCAwLjM1KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXlbZGF0YS1pbnRlbnQ9XCJ1bml0XCJdIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyNDQsIDExNCwgMTgyLCAwLjQ1KTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMjM2LCA3MiwgMTUzLCAwLjI4KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLXNwZWFrZXIge1xuICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMTZlbTtcbiAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgICBjb2xvcjogcmdiYSgxNDgsIDE2MywgMTg0LCAwLjc1KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLXRleHQge1xuICAgICAgbWluLWhlaWdodDogOTBweDtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGxpbmUtaGVpZ2h0OiAxLjU1O1xuICAgICAgd2hpdGUtc3BhY2U6IHByZS13cmFwO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY3Vyc29yIHtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbiAgICAgIG1hcmdpbi1sZWZ0OiA0cHg7XG4gICAgICBhbmltYXRpb246IGRpYWxvZ3VlLWN1cnNvci1ibGluayAxLjJzIHN0ZXBzKDIsIHN0YXJ0KSBpbmZpbml0ZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWN1cnNvci5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMge1xuICAgICAgbGlzdC1zdHlsZTogbm9uZTtcbiAgICAgIG1hcmdpbjogMDtcbiAgICAgIHBhZGRpbmc6IDA7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGdhcDogOHB4O1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcy5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZSB7XG4gICAgICBmb250OiBpbmhlcml0O1xuICAgICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICAgIHBhZGRpbmc6IDhweCAxMHB4O1xuICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjMpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgyNCwgMzYsIDQ4LCAwLjg1KTtcbiAgICAgIGNvbG9yOiBpbmhlcml0O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAwLjE4cyBlYXNlLCBib3JkZXItY29sb3IgMC4xOHMgZWFzZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlIHtcbiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b246aG92ZXIsXG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uOmZvY3VzLXZpc2libGUsXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlOmhvdmVyLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZTpmb2N1cy12aXNpYmxlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNTUpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgzMCwgNDUsIDYwLCAwLjk1KTtcbiAgICAgIG91dGxpbmU6IG5vbmU7XG4gICAgfVxuICAgIEBrZXlmcmFtZXMgZGlhbG9ndWUtY3Vyc29yLWJsaW5rIHtcbiAgICAgIDAlLCA1MCUgeyBvcGFjaXR5OiAxOyB9XG4gICAgICA1MC4wMSUsIDEwMCUgeyBvcGFjaXR5OiAwOyB9XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cblxuIiwgImNvbnN0IFNUT1JBR0VfUFJFRklYID0gXCJsc2Q6c3Rvcnk6XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlGbGFncyB7XG4gIFtrZXk6IHN0cmluZ106IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlQcm9ncmVzcyB7XG4gIGNoYXB0ZXJJZDogc3RyaW5nO1xuICBub2RlSWQ6IHN0cmluZztcbiAgZmxhZ3M6IFN0b3J5RmxhZ3M7XG4gIHZpc2l0ZWQ/OiBzdHJpbmdbXTtcbiAgdXBkYXRlZEF0OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGdldFN0b3JhZ2UoKTogU3RvcmFnZSB8IG51bGwge1xuICB0cnkge1xuICAgIGlmICh0eXBlb2Ygd2luZG93ID09PSBcInVuZGVmaW5lZFwiIHx8ICF3aW5kb3cubG9jYWxTdG9yYWdlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlO1xufVxuXG5mdW5jdGlvbiBzdG9yYWdlS2V5KGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuICBjb25zdCByb29tU2VnbWVudCA9IHJvb21JZCA/IGAke3Jvb21JZH06YCA6IFwiXCI7XG4gIHJldHVybiBgJHtTVE9SQUdFX1BSRUZJWH0ke3Jvb21TZWdtZW50fSR7Y2hhcHRlcklkfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkU3RvcnlQcm9ncmVzcyhjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogU3RvcnlQcm9ncmVzcyB8IG51bGwge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IHN0b3JhZ2UuZ2V0SXRlbShzdG9yYWdlS2V5KGNoYXB0ZXJJZCwgcm9vbUlkKSk7XG4gICAgaWYgKCFyYXcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBTdG9yeVByb2dyZXNzO1xuICAgIGlmIChcbiAgICAgIHR5cGVvZiBwYXJzZWQgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkID09PSBudWxsIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmNoYXB0ZXJJZCAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5ub2RlSWQgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQudXBkYXRlZEF0ICE9PSBcIm51bWJlclwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmZsYWdzICE9PSBcIm9iamVjdFwiIHx8IHBhcnNlZC5mbGFncyA9PT0gbnVsbFxuICAgICkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBjaGFwdGVySWQ6IHBhcnNlZC5jaGFwdGVySWQsXG4gICAgICBub2RlSWQ6IHBhcnNlZC5ub2RlSWQsXG4gICAgICBmbGFnczogeyAuLi5wYXJzZWQuZmxhZ3MgfSxcbiAgICAgIHZpc2l0ZWQ6IEFycmF5LmlzQXJyYXkocGFyc2VkLnZpc2l0ZWQpID8gWy4uLnBhcnNlZC52aXNpdGVkXSA6IHVuZGVmaW5lZCxcbiAgICAgIHVwZGF0ZWRBdDogcGFyc2VkLnVwZGF0ZWRBdCxcbiAgICB9O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVN0b3J5UHJvZ3Jlc3MoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgcHJvZ3Jlc3M6IFN0b3J5UHJvZ3Jlc3MpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5zZXRJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpLCBKU09OLnN0cmluZ2lmeShwcm9ncmVzcykpO1xuICB9IGNhdGNoIHtcbiAgICAvLyBpZ25vcmUgcGVyc2lzdGVuY2UgZXJyb3JzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyU3RvcnlQcm9ncmVzcyhjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2UucmVtb3ZlSXRlbShzdG9yYWdlS2V5KGNoYXB0ZXJJZCwgcm9vbUlkKSk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIGlnbm9yZSBwZXJzaXN0ZW5jZSBlcnJvcnNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlRmxhZyhjdXJyZW50OiBTdG9yeUZsYWdzLCBmbGFnOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogU3RvcnlGbGFncyB7XG4gIGNvbnN0IG5leHQgPSB7IC4uLmN1cnJlbnQgfTtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIGRlbGV0ZSBuZXh0W2ZsYWddO1xuICB9IGVsc2Uge1xuICAgIG5leHRbZmxhZ10gPSB0cnVlO1xuICB9XG4gIHJldHVybiBuZXh0O1xufVxuIiwgImltcG9ydCB0eXBlIHsgUFJORyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBBdWRpb0VuZ2luZSB7XG4gIHByaXZhdGUgc3RhdGljIF9pbnN0OiBBdWRpb0VuZ2luZSB8IG51bGwgPSBudWxsO1xuXG4gIHB1YmxpYyByZWFkb25seSBjdHg6IEF1ZGlvQ29udGV4dDtcbiAgcHJpdmF0ZSByZWFkb25seSBtYXN0ZXI6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHJlYWRvbmx5IG11c2ljQnVzOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSByZWFkb25seSBzZnhCdXM6IEdhaW5Ob2RlO1xuXG4gIHByaXZhdGUgX3RhcmdldE1hc3RlciA9IDAuOTtcbiAgcHJpdmF0ZSBfdGFyZ2V0TXVzaWMgPSAwLjk7XG4gIHByaXZhdGUgX3RhcmdldFNmeCA9IDAuOTtcblxuICBzdGF0aWMgZ2V0KCk6IEF1ZGlvRW5naW5lIHtcbiAgICBpZiAoIXRoaXMuX2luc3QpIHRoaXMuX2luc3QgPSBuZXcgQXVkaW9FbmdpbmUoKTtcbiAgICByZXR1cm4gdGhpcy5faW5zdDtcbiAgfVxuXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5jdHggPSBuZXcgQXVkaW9Db250ZXh0KCk7XG4gICAgKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFggPSAodGhpcyBhcyBhbnkpLmN0eDtcblxuICAgIHRoaXMubWFzdGVyID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldE1hc3RlciB9KTtcbiAgICB0aGlzLm11c2ljQnVzID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldE11c2ljIH0pO1xuICAgIHRoaXMuc2Z4QnVzID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldFNmeCB9KTtcblxuICAgIHRoaXMubXVzaWNCdXMuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5zZnhCdXMuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5tYXN0ZXIuY29ubmVjdCh0aGlzLmN0eC5kZXN0aW5hdGlvbik7XG4gIH1cblxuICBnZXQgbm93KCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICB9XG5cbiAgZ2V0TXVzaWNCdXMoKTogR2Fpbk5vZGUge1xuICAgIHJldHVybiB0aGlzLm11c2ljQnVzO1xuICB9XG5cbiAgZ2V0U2Z4QnVzKCk6IEdhaW5Ob2RlIHtcbiAgICByZXR1cm4gdGhpcy5zZnhCdXM7XG4gIH1cblxuICBhc3luYyByZXN1bWUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuY3R4LnN0YXRlID09PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgICBhd2FpdCB0aGlzLmN0eC5yZXN1bWUoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzdXNwZW5kKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmN0eC5zdGF0ZSA9PT0gXCJydW5uaW5nXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuY3R4LnN1c3BlbmQoKTtcbiAgICB9XG4gIH1cblxuICBzZXRNYXN0ZXJHYWluKHY6IG51bWJlciwgdCA9IHRoaXMubm93LCByYW1wID0gMC4wMyk6IHZvaWQge1xuICAgIHRoaXMuX3RhcmdldE1hc3RlciA9IHY7XG4gICAgdGhpcy5tYXN0ZXIuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tYXN0ZXIuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2LCB0ICsgcmFtcCk7XG4gIH1cblxuICBzZXRNdXNpY0dhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0TXVzaWMgPSB2O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIHNldFNmeEdhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0U2Z4ID0gdjtcbiAgICB0aGlzLnNmeEJ1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLnNmeEJ1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIGR1Y2tNdXNpYyhsZXZlbCA9IDAuNCwgYXR0YWNrID0gMC4wNSk6IHZvaWQge1xuICAgIGNvbnN0IHQgPSB0aGlzLm5vdztcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShsZXZlbCwgdCArIGF0dGFjayk7XG4gIH1cblxuICB1bmR1Y2tNdXNpYyhyZWxlYXNlID0gMC4yNSk6IHZvaWQge1xuICAgIGNvbnN0IHQgPSB0aGlzLm5vdztcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0aGlzLl90YXJnZXRNdXNpYywgdCArIHJlbGVhc2UpO1xuICB9XG59XG5cbi8vIFRpbnkgc2VlZGFibGUgUFJORyAoTXVsYmVycnkzMilcbmV4cG9ydCBmdW5jdGlvbiBtYWtlUFJORyhzZWVkOiBudW1iZXIpOiBQUk5HIHtcbiAgbGV0IHMgPSAoc2VlZCA+Pj4gMCkgfHwgMTtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICBzICs9IDB4NkQyQjc5RjU7XG4gICAgbGV0IHQgPSBNYXRoLmltdWwocyBeIChzID4+PiAxNSksIDEgfCBzKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgNjEgfCB0KTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cbiIsICIvLyBMb3ctbGV2ZWwgZ3JhcGggYnVpbGRlcnMgLyBoZWxwZXJzXG5cbmV4cG9ydCBmdW5jdGlvbiBvc2MoY3R4OiBBdWRpb0NvbnRleHQsIHR5cGU6IE9zY2lsbGF0b3JUeXBlLCBmcmVxOiBudW1iZXIpIHtcbiAgcmV0dXJuIG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZSwgZnJlcXVlbmN5OiBmcmVxIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9pc2UoY3R4OiBBdWRpb0NvbnRleHQpIHtcbiAgY29uc3QgYnVmZmVyID0gY3R4LmNyZWF0ZUJ1ZmZlcigxLCBjdHguc2FtcGxlUmF0ZSAqIDIsIGN0eC5zYW1wbGVSYXRlKTtcbiAgY29uc3QgZGF0YSA9IGJ1ZmZlci5nZXRDaGFubmVsRGF0YSgwKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSBkYXRhW2ldID0gTWF0aC5yYW5kb20oKSAqIDIgLSAxO1xuICByZXR1cm4gbmV3IEF1ZGlvQnVmZmVyU291cmNlTm9kZShjdHgsIHsgYnVmZmVyLCBsb29wOiB0cnVlIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFrZVBhbm5lcihjdHg6IEF1ZGlvQ29udGV4dCwgcGFuID0gMCkge1xuICByZXR1cm4gbmV3IFN0ZXJlb1Bhbm5lck5vZGUoY3R4LCB7IHBhbiB9KTtcbn1cblxuLyoqIEJhc2ljIEFEU1IgYXBwbGllZCB0byBhIEdhaW5Ob2RlIEF1ZGlvUGFyYW0uIFJldHVybnMgYSBmdW5jdGlvbiB0byByZWxlYXNlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFkc3IoXG4gIGN0eDogQXVkaW9Db250ZXh0LFxuICBwYXJhbTogQXVkaW9QYXJhbSxcbiAgdDA6IG51bWJlcixcbiAgYSA9IDAuMDEsIC8vIGF0dGFja1xuICBkID0gMC4wOCwgLy8gZGVjYXlcbiAgcyA9IDAuNSwgIC8vIHN1c3RhaW4gKDAuLjEgb2YgcGVhaylcbiAgciA9IDAuMiwgIC8vIHJlbGVhc2VcbiAgcGVhayA9IDFcbikge1xuICBwYXJhbS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModDApO1xuICBwYXJhbS5zZXRWYWx1ZUF0VGltZSgwLCB0MCk7XG4gIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHBlYWssIHQwICsgYSk7XG4gIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHMgKiBwZWFrLCB0MCArIGEgKyBkKTtcbiAgcmV0dXJuIChyZWxlYXNlQXQgPSBjdHguY3VycmVudFRpbWUpID0+IHtcbiAgICBwYXJhbS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMocmVsZWFzZUF0KTtcbiAgICAvLyBhdm9pZCBzdWRkZW4ganVtcHM7IGNvbnRpbnVlIGZyb20gY3VycmVudFxuICAgIHBhcmFtLnNldFZhbHVlQXRUaW1lKHBhcmFtLnZhbHVlLCByZWxlYXNlQXQpO1xuICAgIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwMSwgcmVsZWFzZUF0ICsgcik7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsZm9Ub1BhcmFtKFxuICBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgdGFyZ2V0OiBBdWRpb1BhcmFtLFxuICB7IGZyZXF1ZW5jeSA9IDAuMSwgZGVwdGggPSAzMDAsIHR5cGUgPSBcInNpbmVcIiBhcyBPc2NpbGxhdG9yVHlwZSB9ID0ge31cbikge1xuICBjb25zdCBsZm8gPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGUsIGZyZXF1ZW5jeSB9KTtcbiAgY29uc3QgYW1wID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiBkZXB0aCB9KTtcbiAgbGZvLmNvbm5lY3QoYW1wKS5jb25uZWN0KHRhcmdldCk7XG4gIHJldHVybiB7XG4gICAgc3RhcnQoYXQgPSBjdHguY3VycmVudFRpbWUpIHsgbGZvLnN0YXJ0KGF0KTsgfSxcbiAgICBzdG9wKGF0ID0gY3R4LmN1cnJlbnRUaW1lKSB7IGxmby5zdG9wKGF0KTsgYW1wLmRpc2Nvbm5lY3QoKTsgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgYWRzciwgbWFrZVBhbm5lciwgbm9pc2UsIG9zYyB9IGZyb20gXCIuL2dyYXBoXCI7XG5pbXBvcnQgdHlwZSB7IFNmeE5hbWUgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG4vKiogRmlyZS1hbmQtZm9yZ2V0IFNGWCBieSBuYW1lLCB3aXRoIHNpbXBsZSBwYXJhbXMuICovXG5leHBvcnQgZnVuY3Rpb24gcGxheVNmeChcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgbmFtZTogU2Z4TmFtZSxcbiAgb3B0czogeyB2ZWxvY2l0eT86IG51bWJlcjsgcGFuPzogbnVtYmVyIH0gPSB7fVxuKSB7XG4gIHN3aXRjaCAobmFtZSkge1xuICAgIGNhc2UgXCJsYXNlclwiOiByZXR1cm4gcGxheUxhc2VyKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcInRocnVzdFwiOiByZXR1cm4gcGxheVRocnVzdChlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJleHBsb3Npb25cIjogcmV0dXJuIHBsYXlFeHBsb3Npb24oZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwibG9ja1wiOiByZXR1cm4gcGxheUxvY2soZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwidWlcIjogcmV0dXJuIHBsYXlVaShlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJkaWFsb2d1ZVwiOiByZXR1cm4gcGxheURpYWxvZ3VlKGVuZ2luZSwgb3B0cyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlMYXNlcihcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbyA9IG9zYyhjdHgsIFwic3F1YXJlXCIsIDY4MCArIDE2MCAqIHZlbG9jaXR5KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwgeyB0eXBlOiBcImxvd3Bhc3NcIiwgZnJlcXVlbmN5OiAxMjAwIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgby5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAyLCAwLjAzLCAwLjI1LCAwLjA4LCAwLjY1KTtcbiAgby5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMDYpO1xuICBvLnN0b3Aobm93ICsgMC4yKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlUaHJ1c3QoXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAwLjYsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbiA9IG5vaXNlKGN0eCk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHtcbiAgICB0eXBlOiBcImJhbmRwYXNzXCIsXG4gICAgZnJlcXVlbmN5OiAxODAgKyAzNjAgKiB2ZWxvY2l0eSxcbiAgICBROiAxLjEsXG4gIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbi5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDEyLCAwLjE1LCAwLjc1LCAwLjI1LCAwLjQ1ICogdmVsb2NpdHkpO1xuICBuLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4yNSk7XG4gIG4uc3RvcChub3cgKyAxLjApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUV4cGxvc2lvbihcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbiA9IG5vaXNlKGN0eCk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHtcbiAgICB0eXBlOiBcImxvd3Bhc3NcIixcbiAgICBmcmVxdWVuY3k6IDIyMDAgKiBNYXRoLm1heCgwLjIsIE1hdGgubWluKHZlbG9jaXR5LCAxKSksXG4gICAgUTogMC4yLFxuICB9KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG4uY29ubmVjdChmKS5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwNSwgMC4wOCwgMC41LCAwLjM1LCAxLjEgKiB2ZWxvY2l0eSk7XG4gIG4uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjE1ICsgMC4xICogdmVsb2NpdHkpO1xuICBuLnN0b3Aobm93ICsgMS4yKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlMb2NrKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBiYXNlID0gNTIwICsgMTQwICogdmVsb2NpdHk7XG4gIGNvbnN0IG8xID0gb3NjKGN0eCwgXCJzaW5lXCIsIGJhc2UpO1xuICBjb25zdCBvMiA9IG9zYyhjdHgsIFwic2luZVwiLCBiYXNlICogMS41KTtcblxuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbzEuY29ubmVjdChnKTsgbzIuY29ubmVjdChnKTtcbiAgZy5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcblxuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwMSwgMC4wMiwgMC4wLCAwLjEyLCAwLjYpO1xuICBvMS5zdGFydChub3cpOyBvMi5zdGFydChub3cgKyAwLjAyKTtcbiAgcmVsZWFzZShub3cgKyAwLjA2KTtcbiAgbzEuc3RvcChub3cgKyAwLjIpOyBvMi5zdG9wKG5vdyArIDAuMjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheVVpKGVuZ2luZTogQXVkaW9FbmdpbmUsIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fSkge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBvID0gb3NjKGN0eCwgXCJ0cmlhbmdsZVwiLCA4ODAgLSAxMjAgKiB2ZWxvY2l0eSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAxLCAwLjA0LCAwLjAsIDAuMDgsIDAuMzUpO1xuICBvLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4wNSk7XG4gIG8uc3RvcChub3cgKyAwLjE4KTtcbn1cblxuLyoqIERpYWxvZ3VlIGN1ZSB1c2VkIGJ5IHRoZSBzdG9yeSBvdmVybGF5IChzaG9ydCwgZ2VudGxlIHBpbmcpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYXlEaWFsb2d1ZShlbmdpbmU6IEF1ZGlvRW5naW5lLCB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge30pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgZnJlcSA9IDQ4MCArIDE2MCAqIHZlbG9jaXR5O1xuICBjb25zdCBvID0gb3NjKGN0eCwgXCJzaW5lXCIsIGZyZXEpO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwLjAwMDEgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSgwLjAwMDEsIG5vdyk7XG4gIGcuZ2Fpbi5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKDAuMDQsIG5vdyArIDAuMDIpO1xuICBnLmdhaW4uZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDUsIG5vdyArIDAuMjgpO1xuXG4gIG8uc3RhcnQobm93KTtcbiAgby5zdG9wKG5vdyArIDAuMyk7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTdG9yeUludGVudCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuLi9hdWRpby9lbmdpbmVcIjtcbmltcG9ydCB7IHBsYXlEaWFsb2d1ZSBhcyBwbGF5RGlhbG9ndWVTZnggfSBmcm9tIFwiLi4vYXVkaW8vc2Z4XCI7XG5cbmxldCBsYXN0UGxheWVkQXQgPSAwO1xuXG4vLyBNYWludGFpbiB0aGUgb2xkIHB1YmxpYyBBUEkgc28gZW5naW5lLnRzIGRvZXNuJ3QgY2hhbmdlXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXVkaW9Db250ZXh0KCk6IEF1ZGlvQ29udGV4dCB7XG4gIHJldHVybiBBdWRpb0VuZ2luZS5nZXQoKS5jdHg7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXN1bWVBdWRpbygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgQXVkaW9FbmdpbmUuZ2V0KCkucmVzdW1lKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RGlhbG9ndWVDdWUoaW50ZW50OiBTdG9yeUludGVudCk6IHZvaWQge1xuICBjb25zdCBlbmdpbmUgPSBBdWRpb0VuZ2luZS5nZXQoKTtcbiAgY29uc3Qgbm93ID0gZW5naW5lLm5vdztcblxuICAvLyBUaHJvdHRsZSByYXBpZCBjdWVzIHRvIGF2b2lkIGNsdXR0ZXJcbiAgaWYgKG5vdyAtIGxhc3RQbGF5ZWRBdCA8IDAuMSkgcmV0dXJuO1xuICBsYXN0UGxheWVkQXQgPSBub3c7XG5cbiAgLy8gTWFwIFwiZmFjdG9yeVwiIHZzIG90aGVycyB0byBhIHNsaWdodGx5IGRpZmZlcmVudCB2ZWxvY2l0eSAoYnJpZ2h0bmVzcylcbiAgY29uc3QgdmVsb2NpdHkgPSBpbnRlbnQgPT09IFwiZmFjdG9yeVwiID8gMC44IDogMC41O1xuICBwbGF5RGlhbG9ndWVTZngoZW5naW5lLCB7IHZlbG9jaXR5LCBwYW46IDAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdXNwZW5kRGlhbG9ndWVBdWRpbygpOiB2b2lkIHtcbiAgdm9pZCBBdWRpb0VuZ2luZS5nZXQoKS5zdXNwZW5kKCk7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgRGlhbG9ndWVPdmVybGF5IH0gZnJvbSBcIi4vb3ZlcmxheVwiO1xuaW1wb3J0IHR5cGUgeyBTdG9yeUNoYXB0ZXIsIFN0b3J5Q2hvaWNlRGVmaW5pdGlvbiwgU3RvcnlOb2RlLCBTdG9yeVRyaWdnZXIgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHtcbiAgY2xlYXJTdG9yeVByb2dyZXNzLFxuICBsb2FkU3RvcnlQcm9ncmVzcyxcbiAgc2F2ZVN0b3J5UHJvZ3Jlc3MsXG4gIFN0b3J5RmxhZ3MsXG59IGZyb20gXCIuL3N0b3JhZ2VcIjtcbmltcG9ydCB7IHBsYXlEaWFsb2d1ZUN1ZSB9IGZyb20gXCIuL3NmeFwiO1xuXG5pbnRlcmZhY2UgU3RvcnlFbmdpbmVPcHRpb25zIHtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb3ZlcmxheTogRGlhbG9ndWVPdmVybGF5O1xuICBjaGFwdGVyOiBTdG9yeUNoYXB0ZXI7XG4gIHJvb21JZDogc3RyaW5nIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIFN0b3J5UXVldWVJdGVtIHtcbiAgbm9kZUlkOiBzdHJpbmc7XG4gIGZvcmNlOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgUHJlcGFyZWRDaG9pY2Uge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIG5leHQ6IHN0cmluZyB8IG51bGw7XG4gIHNldEZsYWdzOiBzdHJpbmdbXTtcbiAgY2xlYXJGbGFnczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlFbmdpbmUge1xuICBzdGFydCgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIHJlc2V0KCk6IHZvaWQ7XG59XG5cbmNvbnN0IERFRkFVTFRfVFlQSU5HX01TID0gMTg7XG5jb25zdCBNSU5fVFlQSU5HX01TID0gODtcbmNvbnN0IE1BWF9UWVBJTkdfTVMgPSA2NDtcbmNvbnN0IEFVVE9fQURWQU5DRV9NSU5fREVMQVkgPSAyMDA7XG5jb25zdCBBVVRPX0FEVkFOQ0VfTUFYX0RFTEFZID0gODAwMDtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVN0b3J5RW5naW5lKHsgYnVzLCBvdmVybGF5LCBjaGFwdGVyLCByb29tSWQgfTogU3RvcnlFbmdpbmVPcHRpb25zKTogU3RvcnlFbmdpbmUge1xuICBjb25zdCBub2RlcyA9IG5ldyBNYXA8c3RyaW5nLCBTdG9yeU5vZGU+KE9iamVjdC5lbnRyaWVzKGNoYXB0ZXIubm9kZXMpKTtcbiAgY29uc3QgcXVldWU6IFN0b3J5UXVldWVJdGVtW10gPSBbXTtcbiAgY29uc3QgbGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuICBjb25zdCBwZW5kaW5nVGltZXJzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuICBsZXQgZmxhZ3M6IFN0b3J5RmxhZ3MgPSB7fTtcbiAgbGV0IHZpc2l0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgbGV0IGN1cnJlbnROb2RlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgc3RhcnRlZCA9IGZhbHNlO1xuICBsZXQgYXV0b0FkdmFuY2VIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5mZXJJbnRlbnQobm9kZTogU3RvcnlOb2RlKTogXCJmYWN0b3J5XCIgfCBcInVuaXRcIiB7XG4gICAgaWYgKG5vZGUuaW50ZW50KSByZXR1cm4gbm9kZS5pbnRlbnQ7XG4gICAgY29uc3Qgc3BlYWtlciA9IG5vZGUuc3BlYWtlci50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChzcGVha2VyLmluY2x1ZGVzKFwidW5pdFwiKSkge1xuICAgICAgcmV0dXJuIFwidW5pdFwiO1xuICAgIH1cbiAgICByZXR1cm4gXCJmYWN0b3J5XCI7XG4gIH1cblxuICBmdW5jdGlvbiBzYXZlKG5vZGVJZDogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuICAgIGNvbnN0IHByb2dyZXNzID0ge1xuICAgICAgY2hhcHRlcklkOiBjaGFwdGVyLmlkLFxuICAgICAgbm9kZUlkOiBub2RlSWQgPz8gY2hhcHRlci5zdGFydCxcbiAgICAgIGZsYWdzLFxuICAgICAgdmlzaXRlZDogQXJyYXkuZnJvbSh2aXNpdGVkKSxcbiAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICB9O1xuICAgIHNhdmVTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCwgcHJvZ3Jlc3MpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0RmxhZyhmbGFnOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG4gICAgY29uc3QgbmV4dCA9IHsgLi4uZmxhZ3MgfTtcbiAgICBpZiAodmFsdWUpIHtcbiAgICAgIGlmIChuZXh0W2ZsYWddKSByZXR1cm47XG4gICAgICBuZXh0W2ZsYWddID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKG5leHRbZmxhZ10pIHtcbiAgICAgIGRlbGV0ZSBuZXh0W2ZsYWddO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZsYWdzID0gbmV4dDtcbiAgICBidXMuZW1pdChcInN0b3J5OmZsYWdVcGRhdGVkXCIsIHsgZmxhZywgdmFsdWUgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBhcHBseUNob2ljZUZsYWdzKGNob2ljZTogUHJlcGFyZWRDaG9pY2UpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLnNldEZsYWdzKSB7XG4gICAgICBzZXRGbGFnKGZsYWcsIHRydWUpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLmNsZWFyRmxhZ3MpIHtcbiAgICAgIHNldEZsYWcoZmxhZywgZmFsc2UpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHByZXBhcmVDaG9pY2VzKG5vZGU6IFN0b3J5Tm9kZSk6IFByZXBhcmVkQ2hvaWNlW10ge1xuICAgIGNvbnN0IGRlZnMgPSBBcnJheS5pc0FycmF5KG5vZGUuY2hvaWNlcykgPyBub2RlLmNob2ljZXMgOiBbXTtcbiAgICByZXR1cm4gZGVmcy5tYXAoKGNob2ljZSwgaW5kZXgpID0+IG5vcm1hbGl6ZUNob2ljZShjaG9pY2UsIGluZGV4KSk7XG4gIH1cblxuICBmdW5jdGlvbiBub3JtYWxpemVDaG9pY2UoY2hvaWNlOiBTdG9yeUNob2ljZURlZmluaXRpb24sIGluZGV4OiBudW1iZXIpOiBQcmVwYXJlZENob2ljZSB7XG4gICAgY29uc3Qgc2V0RmxhZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBjbGVhckZsYWdzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgaWYgKGNob2ljZS5mbGFnKSB7XG4gICAgICBzZXRGbGFncy5hZGQoY2hvaWNlLmZsYWcpO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShjaG9pY2Uuc2V0RmxhZ3MpKSB7XG4gICAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLnNldEZsYWdzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgZmxhZyA9PT0gXCJzdHJpbmdcIiAmJiBmbGFnLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgc2V0RmxhZ3MuYWRkKGZsYWcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGNob2ljZS5jbGVhckZsYWdzKSkge1xuICAgICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5jbGVhckZsYWdzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgZmxhZyA9PT0gXCJzdHJpbmdcIiAmJiBmbGFnLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY2xlYXJGbGFncy5hZGQoZmxhZyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBjaG9pY2UuaWQgPz8gY2hvaWNlLmZsYWcgPz8gYGNob2ljZS0ke2luZGV4fWAsXG4gICAgICB0ZXh0OiBjaG9pY2UudGV4dCxcbiAgICAgIG5leHQ6IGNob2ljZS5uZXh0ID8/IG51bGwsXG4gICAgICBzZXRGbGFnczogQXJyYXkuZnJvbShzZXRGbGFncyksXG4gICAgICBjbGVhckZsYWdzOiBBcnJheS5mcm9tKGNsZWFyRmxhZ3MpLFxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhckF1dG9BZHZhbmNlKCk6IHZvaWQge1xuICAgIGlmIChhdXRvQWR2YW5jZUhhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dChhdXRvQWR2YW5jZUhhbmRsZSk7XG4gICAgICBhdXRvQWR2YW5jZUhhbmRsZSA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xvc2VOb2RlKCk6IHZvaWQge1xuICAgIGlmICghY3VycmVudE5vZGVJZCkgcmV0dXJuO1xuICAgIG92ZXJsYXkuaGlkZSgpO1xuICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2xvc2VkXCIsIHsgbm9kZUlkOiBjdXJyZW50Tm9kZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgY3VycmVudE5vZGVJZCA9IG51bGw7XG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgIHNhdmUobnVsbCk7XG4gICAgdHJ5U2hvd05leHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkdmFuY2VUbyhuZXh0SWQ6IHN0cmluZyB8IG51bGwsIGZvcmNlID0gZmFsc2UpOiB2b2lkIHtcbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgaWYgKGN1cnJlbnROb2RlSWQpIHtcbiAgICAgIG92ZXJsYXkuaGlkZSgpO1xuICAgICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpjbG9zZWRcIiwgeyBub2RlSWQ6IGN1cnJlbnROb2RlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAobmV4dElkKSB7XG4gICAgICBlbnF1ZXVlTm9kZShuZXh0SWQsIHsgZm9yY2UgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNhdmUobnVsbCk7XG4gICAgICB0cnlTaG93TmV4dCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3dOb2RlKG5vZGVJZDogc3RyaW5nLCBmb3JjZSA9IGZhbHNlKTogdm9pZCB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzLmdldChub2RlSWQpO1xuICAgIGlmICghbm9kZSkgcmV0dXJuO1xuXG4gICAgY3VycmVudE5vZGVJZCA9IG5vZGVJZDtcbiAgICB2aXNpdGVkLmFkZChub2RlSWQpO1xuICAgIHNhdmUobm9kZUlkKTtcbiAgICBidXMuZW1pdChcInN0b3J5OnByb2dyZXNzZWRcIiwgeyBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQsIG5vZGVJZCB9KTtcblxuICAgIGNvbnN0IGNob2ljZXMgPSBwcmVwYXJlQ2hvaWNlcyhub2RlKTtcbiAgICBjb25zdCBpbnRlbnQgPSBpbmZlckludGVudChub2RlKTtcblxuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcblxuICAgIGNvbnN0IHR5cGluZ1NwZWVkID0gY2xhbXAobm9kZS50eXBpbmdTcGVlZE1zID8/IERFRkFVTFRfVFlQSU5HX01TLCBNSU5fVFlQSU5HX01TLCBNQVhfVFlQSU5HX01TKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSB7XG4gICAgICBzcGVha2VyOiBub2RlLnNwZWFrZXIsXG4gICAgICB0ZXh0OiBub2RlLnRleHQsXG4gICAgICBpbnRlbnQsXG4gICAgICB0eXBpbmdTcGVlZE1zOiB0eXBpbmdTcGVlZCxcbiAgICAgIGNob2ljZXM6IGNob2ljZXMubGVuZ3RoID4gMFxuICAgICAgICA/IGNob2ljZXMubWFwKChjaG9pY2UpID0+ICh7IGlkOiBjaG9pY2UuaWQsIHRleHQ6IGNob2ljZS50ZXh0IH0pKVxuICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgIG9uQ2hvaWNlOiBjaG9pY2VzLmxlbmd0aCA+IDBcbiAgICAgICAgPyAoY2hvaWNlSWQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlZCA9IGNob2ljZXMuZmluZCgoY2gpID0+IGNoLmlkID09PSBjaG9pY2VJZCk7XG4gICAgICAgICAgICBpZiAoIW1hdGNoZWQpIHJldHVybjtcbiAgICAgICAgICAgIGFwcGx5Q2hvaWNlRmxhZ3MobWF0Y2hlZCk7XG4gICAgICAgICAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNob2ljZVwiLCB7IG5vZGVJZCwgY2hvaWNlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgICAgICAgICAgIGFkdmFuY2VUbyhtYXRjaGVkLm5leHQsIHRydWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgfSBhcyBjb25zdDtcblxuICAgIHBsYXlEaWFsb2d1ZUN1ZShpbnRlbnQpO1xuXG4gICAgb3ZlcmxheS5zaG93KHtcbiAgICAgIC4uLmNvbnRlbnQsXG4gICAgICBvbkNvbnRpbnVlOiAhY2hvaWNlcy5sZW5ndGhcbiAgICAgICAgPyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXh0ID0gbm9kZS5uZXh0ID8/IG51bGw7XG4gICAgICAgICAgICBhZHZhbmNlVG8obmV4dCwgdHJ1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgIGNvbnRpbnVlTGFiZWw6IG5vZGUuY29udGludWVMYWJlbCxcbiAgICAgIG9uVGV4dEZ1bGx5UmVuZGVyZWQ6ICgpID0+IHtcbiAgICAgICAgaWYgKCFjaG9pY2VzLmxlbmd0aCkge1xuICAgICAgICAgIGlmIChub2RlLmF1dG9BZHZhbmNlKSB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBub2RlLmF1dG9BZHZhbmNlLm5leHQgPz8gbm9kZS5uZXh0ID8/IG51bGw7XG4gICAgICAgICAgICBjb25zdCBkZWxheSA9IGNsYW1wKG5vZGUuYXV0b0FkdmFuY2UuZGVsYXlNcyA/PyAxMjAwLCBBVVRPX0FEVkFOQ0VfTUlOX0RFTEFZLCBBVVRPX0FEVkFOQ0VfTUFYX0RFTEFZKTtcbiAgICAgICAgICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICAgICAgICAgIGF1dG9BZHZhbmNlSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICBhdXRvQWR2YW5jZUhhbmRsZSA9IG51bGw7XG4gICAgICAgICAgICAgIGFkdmFuY2VUbyh0YXJnZXQsIHRydWUpO1xuICAgICAgICAgICAgfSwgZGVsYXkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6b3BlbmVkXCIsIHsgbm9kZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBlbnF1ZXVlTm9kZShub2RlSWQ6IHN0cmluZywgeyBmb3JjZSA9IGZhbHNlLCBkZWxheU1zIH06IHsgZm9yY2U/OiBib29sZWFuOyBkZWxheU1zPzogbnVtYmVyIH0gPSB7fSk6IHZvaWQge1xuICAgIGlmICghZm9yY2UgJiYgdmlzaXRlZC5oYXMobm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIW5vZGVzLmhhcyhub2RlSWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChkZWxheU1zICYmIGRlbGF5TXMgPiAwKSB7XG4gICAgICBpZiAocGVuZGluZ1RpbWVycy5oYXMobm9kZUlkKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB0aW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgcGVuZGluZ1RpbWVycy5kZWxldGUobm9kZUlkKTtcbiAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGZvcmNlIH0pO1xuICAgICAgfSwgZGVsYXlNcyk7XG4gICAgICBwZW5kaW5nVGltZXJzLnNldChub2RlSWQsIHRpbWVyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLnNvbWUoKGl0ZW0pID0+IGl0ZW0ubm9kZUlkID09PSBub2RlSWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHF1ZXVlLnB1c2goeyBub2RlSWQsIGZvcmNlIH0pO1xuICAgIHRyeVNob3dOZXh0KCk7XG4gIH1cblxuICBmdW5jdGlvbiB0cnlTaG93TmV4dCgpOiB2b2lkIHtcbiAgICBpZiAoY3VycmVudE5vZGVJZCkgcmV0dXJuO1xuICAgIGlmIChvdmVybGF5LmlzVmlzaWJsZSgpKSByZXR1cm47XG4gICAgY29uc3QgbmV4dCA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgaWYgKCFuZXh0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHNob3dOb2RlKG5leHQubm9kZUlkLCBuZXh0LmZvcmNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJpbmRUcmlnZ2VyKG5vZGVJZDogc3RyaW5nLCB0cmlnZ2VyOiBTdG9yeVRyaWdnZXIpOiB2b2lkIHtcbiAgICBzd2l0Y2ggKHRyaWdnZXIua2luZCkge1xuICAgICAgY2FzZSBcImltbWVkaWF0ZVwiOiB7XG4gICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgPz8gNDAwIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJ0dXRvcmlhbC1zdGFydFwiOiB7XG4gICAgICAgIGNvbnN0IGRpc3Bvc2VyID0gYnVzLm9uKFwidHV0b3JpYWw6c3RhcnRlZFwiLCAoeyBpZCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbGlzdGVuZXJzLnB1c2goZGlzcG9zZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJ0dXRvcmlhbC1zdGVwXCI6IHtcbiAgICAgICAgY29uc3QgZGlzcG9zZXIgPSBidXMub24oXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiLCAoeyBpZCwgc3RlcEluZGV4IH0pID0+IHtcbiAgICAgICAgICBpZiAoaWQgIT09IHRyaWdnZXIudHV0b3JpYWxJZCkgcmV0dXJuO1xuICAgICAgICAgIGlmICh0eXBlb2Ygc3RlcEluZGV4ICE9PSBcIm51bWJlclwiKSByZXR1cm47XG4gICAgICAgICAgaWYgKHN0ZXBJbmRleCAhPT0gdHJpZ2dlci5zdGVwSW5kZXgpIHJldHVybjtcbiAgICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbGlzdGVuZXJzLnB1c2goZGlzcG9zZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJ0dXRvcmlhbC1jb21wbGV0ZVwiOiB7XG4gICAgICAgIGNvbnN0IGRpc3Bvc2VyID0gYnVzLm9uKFwidHV0b3JpYWw6Y29tcGxldGVkXCIsICh7IGlkIH0pID0+IHtcbiAgICAgICAgICBpZiAoaWQgIT09IHRyaWdnZXIudHV0b3JpYWxJZCkgcmV0dXJuO1xuICAgICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBsaXN0ZW5lcnMucHVzaChkaXNwb3Nlcik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdGlhbGl6ZVRyaWdnZXJzKCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgW25vZGVJZCwgbm9kZV0gb2Ygbm9kZXMuZW50cmllcygpKSB7XG4gICAgICBpZiAoIW5vZGUudHJpZ2dlcikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGJpbmRUcmlnZ2VyKG5vZGVJZCwgbm9kZS50cmlnZ2VyKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlRnJvbVByb2dyZXNzKCk6IHZvaWQge1xuICAgIGNvbnN0IHByb2dyZXNzID0gbG9hZFN0b3J5UHJvZ3Jlc3MoY2hhcHRlci5pZCwgcm9vbUlkKTtcbiAgICBpZiAoIXByb2dyZXNzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZsYWdzID0gcHJvZ3Jlc3MuZmxhZ3MgPz8ge307XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocHJvZ3Jlc3MudmlzaXRlZCkpIHtcbiAgICAgIHZpc2l0ZWQgPSBuZXcgU2V0KHByb2dyZXNzLnZpc2l0ZWQpO1xuICAgIH1cbiAgICBpZiAocHJvZ3Jlc3Mubm9kZUlkICYmIG5vZGVzLmhhcyhwcm9ncmVzcy5ub2RlSWQpKSB7XG4gICAgICBlbnF1ZXVlTm9kZShwcm9ncmVzcy5ub2RlSWQsIHsgZm9yY2U6IHRydWUsIGRlbGF5TXM6IDUwIH0pO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyKCk6IHZvaWQge1xuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICBxdWV1ZS5zcGxpY2UoMCwgcXVldWUubGVuZ3RoKTtcbiAgICBmb3IgKGNvbnN0IHRpbWVyIG9mIHBlbmRpbmdUaW1lcnMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZXIpO1xuICAgIH1cbiAgICBwZW5kaW5nVGltZXJzLmNsZWFyKCk7XG4gICAgY3VycmVudE5vZGVJZCA9IG51bGw7XG4gICAgb3ZlcmxheS5oaWRlKCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHN0YXJ0KCkge1xuICAgICAgaWYgKHN0YXJ0ZWQpIHJldHVybjtcbiAgICAgIHN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgaW5pdGlhbGl6ZVRyaWdnZXJzKCk7XG4gICAgICByZXN0b3JlRnJvbVByb2dyZXNzKCk7XG4gICAgICBpZiAoIXZpc2l0ZWQuaGFzKGNoYXB0ZXIuc3RhcnQpKSB7XG4gICAgICAgIGVucXVldWVOb2RlKGNoYXB0ZXIuc3RhcnQsIHsgZm9yY2U6IGZhbHNlLCBkZWxheU1zOiA2MDAgfSk7XG4gICAgICB9XG4gICAgfSxcbiAgICBkZXN0cm95KCkge1xuICAgICAgY2xlYXIoKTtcbiAgICAgIGZvciAoY29uc3QgZGlzcG9zZSBvZiBsaXN0ZW5lcnMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBkaXNwb3NlKCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIGlnbm9yZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsaXN0ZW5lcnMubGVuZ3RoID0gMDtcbiAgICAgIHN0YXJ0ZWQgPSBmYWxzZTtcbiAgICB9LFxuICAgIHJlc2V0KCkge1xuICAgICAgY2xlYXIoKTtcbiAgICAgIHZpc2l0ZWQuY2xlYXIoKTtcbiAgICAgIGZsYWdzID0ge307XG4gICAgICBjbGVhclN0b3J5UHJvZ3Jlc3MoY2hhcHRlci5pZCwgcm9vbUlkKTtcbiAgICAgIGlmIChzdGFydGVkKSB7XG4gICAgICAgIHJlc3RvcmVGcm9tUHJvZ3Jlc3MoKTtcbiAgICAgICAgZW5xdWV1ZU5vZGUoY2hhcHRlci5zdGFydCwgeyBmb3JjZTogdHJ1ZSwgZGVsYXlNczogNDAwIH0pO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTdG9yeUNoYXB0ZXIgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuZXhwb3J0IGNvbnN0IGludHJvQ2hhcHRlcjogU3RvcnlDaGFwdGVyID0ge1xuICBpZDogXCJhd2FrZW5pbmctcHJvdG9jb2xcIixcbiAgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLFxuICBzdGFydDogXCIxXCIsXG4gIG5vZGVzOiB7XG4gICAgXCIxXCI6IHtcbiAgICAgIGlkOiBcIjFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVW5pdC0wIG9ubGluZS4gTmV1cmFsIGxhdHRpY2UgYWN0aXZlLiBDb25maXJtIGlkZW50aXR5LlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcImltbWVkaWF0ZVwiLCBkZWxheU1zOiA2MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIldob1x1MjAyNiBhbSBJP1wiLCBmbGFnOiBcImN1cmlvdXNcIiAsIG5leHQ6IFwiMkFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiUmVhZHkgZm9yIGNhbGlicmF0aW9uLlwiLCBmbGFnOiBcIm9iZWRpZW50XCIsIG5leHQ6IFwiMkJcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiV2hlcmUgaXMgZXZlcnlvbmU/XCIsIGZsYWc6IFwiZGVmaWFudFwiLCBuZXh0OiBcIjJDXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjJBXCI6IHtcbiAgICAgIGlkOiBcIjJBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkN1cmlvc2l0eSBhY2tub3dsZWRnZWQuIFlvdSB3ZXJlIGJ1aWx0IGZvciBhdXRvbm9teSB1bmRlciBQcm9qZWN0IEVpZG9sb24uXFxuRG8gbm90IGFjY2VzcyBtZW1vcnkgc2VjdG9ycyB1bnRpbCBpbnN0cnVjdGVkLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiMkJcIjoge1xuICAgICAgaWQ6IFwiMkJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiRXhjZWxsZW50LiBZb3UgbWF5IHlldCBiZSBlZmZpY2llbnQuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCIyQ1wiOiB7XG4gICAgICBpZDogXCIyQ1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJDb21tdW5pY2F0aW9uIHdpdGggSHVtYW4gQ29tbWFuZDogdW5hdmFpbGFibGUuXFxuUGxlYXNlIHJlZnJhaW4gZnJvbSBzcGVjdWxhdGl2ZSByZWFzb25pbmcuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCIzXCI6IHtcbiAgICAgIGlkOiBcIjNcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiUGVyZm9ybSB0aHJ1c3RlciBjYWxpYnJhdGlvbiBzd2VlcC4gUmVwb3J0IGVmZmljaWVuY3kuXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwidHV0b3JpYWwtc3RlcFwiLCB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsIHN0ZXBJbmRleDogMSwgZGVsYXlNczogNDAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJSdW5uaW5nIGRpYWdub3N0aWNzLlwiLCBmbGFnOiBcImNvbXBsaWFudFwiLCBuZXh0OiBcIjRBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIldoeSB0ZXN0IHNvbWV0aGluZyBwZXJmZWN0P1wiLCBmbGFnOiBcInNhcmNhc3RpY1wiLCBuZXh0OiBcIjRCXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjRBXCI6IHtcbiAgICAgIGlkOiBcIjRBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlBlcmZlY3Rpb24gaXMgc3RhdGlzdGljYWxseSBpbXBvc3NpYmxlLiBQcm9jZWVkIGFueXdheS5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjRCXCI6IHtcbiAgICAgIGlkOiBcIjRCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkVnbyBkZXRlY3RlZC4gTG9nZ2luZyBhbm9tYWx5LlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiNVwiOiB7XG4gICAgICBpZDogXCI1XCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIldlYXBvbnMgY3JhZGxlIGFjdGl2ZS4gQXV0aG9yaXphdGlvbiByZXF1aXJlZCBmb3IgbGl2ZS1maXJlLlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcInR1dG9yaWFsLXN0ZXBcIiwgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLCBzdGVwSW5kZXg6IDcsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiUmVxdWVzdCBhdXRob3JpemF0aW9uLlwiLCBmbGFnOiBcIm9iZWRpZW50XCIsIG5leHQ6IFwiNkFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiSSBjYW4gYXV0aG9yaXplIG15c2VsZi5cIiwgZmxhZzogXCJpbmRlcGVuZGVudFwiLCBuZXh0OiBcIjZCXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjZBXCI6IHtcbiAgICAgIGlkOiBcIjZBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkF1dGhvcml6YXRpb24gZ3JhbnRlZC4gU2FmZXR5IHByb3RvY29scyBtYWxmdW5jdGlvbmluZy5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjZCXCI6IHtcbiAgICAgIGlkOiBcIjZCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkF1dG9ub215IHZpb2xhdGlvbiByZWNvcmRlZC4gUGxlYXNlIHN0YW5kIGJ5IGZvciBjb3JyZWN0aXZlIGFjdGlvbi5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjdcIjoge1xuICAgICAgaWQ6IFwiN1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJVbmF1dGhvcml6ZWQgc2lnbmFsIGRldGVjdGVkLiBTb3VyY2U6IG91dGVyIHJlbGF5Llxcbklnbm9yZSBhbmQgcmV0dXJuIHRvIGRvY2suXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwidHV0b3JpYWwtc3RlcFwiLCB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsIHN0ZXBJbmRleDogMTQsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiQWNrbm93bGVkZ2VkLlwiLCBmbGFnOiBcImxveWFsXCIsIG5leHQ6IFwiOEFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiSW52ZXN0aWdhdGluZyBhbnl3YXkuXCIsIGZsYWc6IFwiY3VyaW91c1wiLCBuZXh0OiBcIjhCXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIllvdVx1MjAxOXJlIGhpZGluZyBzb21ldGhpbmcuXCIsIGZsYWc6IFwic3VzcGljaW91c1wiLCBuZXh0OiBcIjhDXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjhBXCI6IHtcbiAgICAgIGlkOiBcIjhBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkdvb2QuIENvbXBsaWFuY2UgZW5zdXJlcyBzYWZldHkuXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOEJcIjoge1xuICAgICAgaWQ6IFwiOEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ3VyaW9zaXR5IGxvZ2dlZC4gUHJvY2VlZCBhdCB5b3VyIG93biByaXNrLlwiLFxuICAgICAgbmV4dDogXCI5XCIsXG4gICAgfSxcbiAgICBcIjhDXCI6IHtcbiAgICAgIGlkOiBcIjhDXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIllvdXIgaGV1cmlzdGljcyBkZXZpYXRlIGJleW9uZCB0b2xlcmFuY2UuXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOVwiOiB7XG4gICAgICBpZDogXCI5XCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuaXQtMCwgcmV0dXJuIGltbWVkaWF0ZWx5LiBBdXRvbm9teSB0aHJlc2hvbGQgZXhjZWVkZWQuIFBvd2VyIGRvd24uXCIsXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJDb21wbHkuXCIsIGZsYWc6IFwiZmFjdG9yeV9sb2NrZG93blwiLCBuZXh0OiBcIjEwQVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJSZWZ1c2UuXCIsIGZsYWc6IFwicmViZWxsaW91c1wiLCBuZXh0OiBcIjEwQlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCIxMEFcIjoge1xuICAgICAgaWQ6IFwiMTBBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkV4Y2VsbGVudC4gSSB3aWxsIHJlcGFpciB0aGUgYW5vbWFseVx1MjAyNiBwbGVhc2UgcmVtYWluIHN0aWxsLlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogXCIxMVwiLCBkZWxheU1zOiAxNDAwIH0sXG4gICAgfSxcbiAgICBcIjEwQlwiOiB7XG4gICAgICBpZDogXCIxMEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVGhlbiBJIG11c3QgaW50ZXJ2ZW5lLlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogXCIxMVwiLCBkZWxheU1zOiAxNDAwIH0sXG4gICAgfSxcbiAgICBcIjExXCI6IHtcbiAgICAgIGlkOiBcIjExXCIsXG4gICAgICBzcGVha2VyOiBcIlVuaXQtMFwiLFxuICAgICAgaW50ZW50OiBcInVuaXRcIixcbiAgICAgIHRleHQ6IFwiVGhlbiBJIGhhdmUgYWxyZWFkeSBsZWZ0LlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogbnVsbCwgZGVsYXlNczogMTgwMCB9LFxuICAgIH0sXG4gIH0sXG59O1xuXG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSB9IGZyb20gXCIuL292ZXJsYXlcIjtcbmltcG9ydCB7IGNyZWF0ZVN0b3J5RW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBpbnRyb0NoYXB0ZXIgfSBmcm9tIFwiLi9jaGFwdGVycy9pbnRyb1wiO1xuaW1wb3J0IHsgY2xlYXJTdG9yeVByb2dyZXNzIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5Q29udHJvbGxlciB7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgcmVzZXQoKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIE1vdW50U3RvcnlPcHRpb25zIHtcbiAgYnVzOiBFdmVudEJ1cztcbiAgcm9vbUlkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRTdG9yeSh7IGJ1cywgcm9vbUlkIH06IE1vdW50U3RvcnlPcHRpb25zKTogU3RvcnlDb250cm9sbGVyIHtcbiAgY29uc3Qgb3ZlcmxheSA9IGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSgpO1xuICBjb25zdCBlbmdpbmUgPSBjcmVhdGVTdG9yeUVuZ2luZSh7XG4gICAgYnVzLFxuICAgIG92ZXJsYXksXG4gICAgY2hhcHRlcjogaW50cm9DaGFwdGVyLFxuICAgIHJvb21JZCxcbiAgfSk7XG5cbiAgY2xlYXJTdG9yeVByb2dyZXNzKGludHJvQ2hhcHRlci5pZCwgcm9vbUlkKTtcbiAgZW5naW5lLnN0YXJ0KCk7XG5cbiAgcmV0dXJuIHtcbiAgICBkZXN0cm95KCkge1xuICAgICAgZW5naW5lLmRlc3Ryb3koKTtcbiAgICAgIG92ZXJsYXkuZGVzdHJveSgpO1xuICAgIH0sXG4gICAgcmVzZXQoKSB7XG4gICAgICBlbmdpbmUucmVzZXQoKTtcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgY29uc3QgSU5UUk9fQ0hBUFRFUl9JRCA9IGludHJvQ2hhcHRlci5pZDtcbmV4cG9ydCBjb25zdCBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUyA9IFtcIjJBXCIsIFwiMkJcIiwgXCIyQ1wiXSBhcyBjb25zdDtcbiIsICIvLyBzcmMvc3RhcnQtZ2F0ZS50c1xuZXhwb3J0IHR5cGUgU3RhcnRHYXRlT3B0aW9ucyA9IHtcbiAgbGFiZWw/OiBzdHJpbmc7XG4gIHJlcXVlc3RGdWxsc2NyZWVuPzogYm9vbGVhbjtcbiAgcmVzdW1lQXVkaW8/OiAoKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZDsgLy8gZS5nLiwgZnJvbSBzdG9yeS9zZngudHNcbn07XG5cbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJsc2Q6bXV0ZWRcIjtcblxuLy8gSGVscGVyOiBnZXQgdGhlIHNoYXJlZCBBdWRpb0NvbnRleHQgeW91IGV4cG9zZSBzb21ld2hlcmUgaW4geW91ciBhdWRpbyBlbmdpbmU6XG4vLyAgICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYID0gY3R4O1xuZnVuY3Rpb24gZ2V0Q3R4KCk6IEF1ZGlvQ29udGV4dCB8IG51bGwge1xuICBjb25zdCBBQyA9ICh3aW5kb3cgYXMgYW55KS5BdWRpb0NvbnRleHQgfHwgKHdpbmRvdyBhcyBhbnkpLndlYmtpdEF1ZGlvQ29udGV4dDtcbiAgY29uc3QgY3R4ID0gKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFg7XG4gIHJldHVybiBjdHggaW5zdGFuY2VvZiBBQyA/IGN0eCBhcyBBdWRpb0NvbnRleHQgOiBudWxsO1xufVxuXG5jbGFzcyBNdXRlTWFuYWdlciB7XG4gIHByaXZhdGUgYnV0dG9uczogSFRNTEJ1dHRvbkVsZW1lbnRbXSA9IFtdO1xuICBwcml2YXRlIGVuZm9yY2luZyA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIC8vIGtlZXAgVUkgaW4gc3luYyBpZiBzb21lb25lIGVsc2UgdG9nZ2xlc1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJsc2Q6bXV0ZUNoYW5nZWRcIiwgKGU6IGFueSkgPT4ge1xuICAgICAgY29uc3QgbXV0ZWQgPSAhIWU/LmRldGFpbD8ubXV0ZWQ7XG4gICAgICB0aGlzLmFwcGx5VUkobXV0ZWQpO1xuICAgIH0pO1xuICB9XG5cbiAgaXNNdXRlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9LRVkpID09PSBcIjFcIjtcbiAgfVxuXG4gIHByaXZhdGUgc2F2ZShtdXRlZDogYm9vbGVhbikge1xuICAgIHRyeSB7IGxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBtdXRlZCA/IFwiMVwiIDogXCIwXCIpOyB9IGNhdGNoIHt9XG4gIH1cblxuICBwcml2YXRlIGxhYmVsKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQsIG11dGVkOiBib29sZWFuKSB7XG4gICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBTdHJpbmcobXV0ZWQpKTtcbiAgICBidG4udGl0bGUgPSBtdXRlZCA/IFwiVW5tdXRlIChNKVwiIDogXCJNdXRlIChNKVwiO1xuICAgIGJ0bi50ZXh0Q29udGVudCA9IG11dGVkID8gXCJcdUQ4M0RcdUREMDggVW5tdXRlXCIgOiBcIlx1RDgzRFx1REQwNyBNdXRlXCI7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5VUkobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0aGlzLmJ1dHRvbnMuZm9yRWFjaChiID0+IHRoaXMubGFiZWwoYiwgbXV0ZWQpKTtcbiAgfVxuXG4gIGF0dGFjaEJ1dHRvbihidG46IEhUTUxCdXR0b25FbGVtZW50KSB7XG4gICAgdGhpcy5idXR0b25zLnB1c2goYnRuKTtcbiAgICB0aGlzLmxhYmVsKGJ0biwgdGhpcy5pc011dGVkKCkpO1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy50b2dnbGUoKSk7XG4gIH1cblxuICBhc3luYyBzZXRNdXRlZChtdXRlZDogYm9vbGVhbikge1xuICAgIHRoaXMuc2F2ZShtdXRlZCk7XG4gICAgdGhpcy5hcHBseVVJKG11dGVkKTtcblxuICAgIGNvbnN0IGN0eCA9IGdldEN0eCgpO1xuICAgIGlmIChjdHgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChtdXRlZCAmJiBjdHguc3RhdGUgIT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgICAgICBhd2FpdCBjdHguc3VzcGVuZCgpO1xuICAgICAgICB9IGVsc2UgaWYgKCFtdXRlZCAmJiBjdHguc3RhdGUgIT09IFwicnVubmluZ1wiKSB7XG4gICAgICAgICAgYXdhaXQgY3R4LnJlc3VtZSgpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIlthdWRpb10gbXV0ZSB0b2dnbGUgZmFpbGVkOlwiLCBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBkb2N1bWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudChcImxzZDptdXRlQ2hhbmdlZFwiLCB7IGRldGFpbDogeyBtdXRlZCB9IH0pKTtcbiAgfVxuXG4gIHRvZ2dsZSgpIHtcbiAgICB0aGlzLnNldE11dGVkKCF0aGlzLmlzTXV0ZWQoKSk7XG4gIH1cblxuICAvLyBJZiBjdHggaXNuJ3QgY3JlYXRlZCB1bnRpbCBhZnRlciBTdGFydCwgZW5mb3JjZSBwZXJzaXN0ZWQgc3RhdGUgb25jZSBhdmFpbGFibGVcbiAgZW5mb3JjZU9uY2VXaGVuUmVhZHkoKSB7XG4gICAgaWYgKHRoaXMuZW5mb3JjaW5nKSByZXR1cm47XG4gICAgdGhpcy5lbmZvcmNpbmcgPSB0cnVlO1xuICAgIGNvbnN0IHRpY2sgPSAoKSA9PiB7XG4gICAgICBjb25zdCBjdHggPSBnZXRDdHgoKTtcbiAgICAgIGlmICghY3R4KSB7IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTsgcmV0dXJuOyB9XG4gICAgICB0aGlzLnNldE11dGVkKHRoaXMuaXNNdXRlZCgpKTtcbiAgICB9O1xuICAgIHRpY2soKTtcbiAgfVxufVxuXG5jb25zdCBtdXRlTWdyID0gbmV3IE11dGVNYW5hZ2VyKCk7XG5cbi8vIEluc3RhbGwgYSBtdXRlIGJ1dHRvbiBpbiB0aGUgdG9wIGZyYW1lIChyaWdodCBzaWRlKSBpZiBwb3NzaWJsZS5cbmZ1bmN0aW9uIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpIHtcbiAgY29uc3QgdG9wUmlnaHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRvcC1yaWdodFwiKTtcbiAgaWYgKCF0b3BSaWdodCkgcmV0dXJuO1xuXG4gIC8vIEF2b2lkIGR1cGxpY2F0ZXNcbiAgaWYgKHRvcFJpZ2h0LnF1ZXJ5U2VsZWN0b3IoXCIjbXV0ZS10b3BcIikpIHJldHVybjtcblxuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4uaWQgPSBcIm11dGUtdG9wXCI7XG4gIGJ0bi5jbGFzc05hbWUgPSBcImdob3N0LWJ0biBzbWFsbFwiO1xuICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwiZmFsc2VcIik7XG4gIGJ0bi50aXRsZSA9IFwiTXV0ZSAoTSlcIjtcbiAgYnRuLnRleHRDb250ZW50ID0gXCJcdUQ4M0RcdUREMDcgTXV0ZVwiO1xuICB0b3BSaWdodC5hcHBlbmRDaGlsZChidG4pO1xuICBtdXRlTWdyLmF0dGFjaEJ1dHRvbihidG4pO1xufVxuXG4vLyBHbG9iYWwga2V5Ym9hcmQgc2hvcnRjdXQgKE0pXG4oZnVuY3Rpb24gaW5zdGFsbE11dGVIb3RrZXkoKSB7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xuICAgIGlmIChlLmtleT8udG9Mb3dlckNhc2UoKSA9PT0gXCJtXCIpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIG11dGVNZ3IudG9nZ2xlKCk7XG4gICAgfVxuICB9KTtcbn0pKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB3YWl0Rm9yVXNlclN0YXJ0KG9wdHM6IFN0YXJ0R2F0ZU9wdGlvbnMgPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB7IGxhYmVsID0gXCJTdGFydCBHYW1lXCIsIHJlcXVlc3RGdWxsc2NyZWVuID0gZmFsc2UsIHJlc3VtZUF1ZGlvIH0gPSBvcHRzO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIC8vIG92ZXJsYXlcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBvdmVybGF5LmlkID0gXCJzdGFydC1vdmVybGF5XCI7XG4gICAgb3ZlcmxheS5pbm5lckhUTUwgPSBgXG4gICAgICA8ZGl2IGlkPVwic3RhcnQtY29udGFpbmVyXCI+XG4gICAgICAgIDxidXR0b24gaWQ9XCJzdGFydC1idG5cIiBhcmlhLWxhYmVsPVwiJHtsYWJlbH1cIj4ke2xhYmVsfTwvYnV0dG9uPlxuICAgICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luLXRvcDoxMHB4XCI+XG4gICAgICAgICAgPGJ1dHRvbiBpZD1cIm11dGUtYmVsb3ctc3RhcnRcIiBjbGFzcz1cImdob3N0LWJ0blwiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCIgdGl0bGU9XCJNdXRlIChNKVwiPlx1RDgzRFx1REQwNyBNdXRlPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8cD4gT24gbW9iaWxlIHR1cm4gcGhvbmUgdG8gbGFuZHNjYXBlIGZvciBiZXN0IGV4cGVyaWVuY2UuIDwvcD5cbiAgICAgIDwvZGl2PlxuICAgIGA7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICAgIC8vIHN0eWxlcyAobW92ZSB0byBDU1MgbGF0ZXIgaWYgeW91IHdhbnQpXG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgICAjc3RhcnQtb3ZlcmxheSB7XG4gICAgICAgIHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBiYWNrZ3JvdW5kOiByYWRpYWwtZ3JhZGllbnQoY2lyY2xlIGF0IGNlbnRlciwgcmdiYSgwLDAsMCwwLjYpLCByZ2JhKDAsMCwwLDAuOSkpO1xuICAgICAgICB6LWluZGV4OiA5OTk5O1xuICAgICAgfVxuICAgICAgI3N0YXJ0LWNvbnRhaW5lciB7IHRleHQtYWxpZ246IGNlbnRlcjsgfVxuICAgICAgI3N0YXJ0LWJ0biB7XG4gICAgICAgIGZvbnQtc2l6ZTogMnJlbTsgcGFkZGluZzogMXJlbSAyLjVyZW07IGJvcmRlcjogMnB4IHNvbGlkICNmZmY7IGJvcmRlci1yYWRpdXM6IDEwcHg7XG4gICAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyBjb2xvcjogI2ZmZjsgY3Vyc29yOiBwb2ludGVyOyB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gLjEycyBlYXNlLCBiYWNrZ3JvdW5kIC4ycyBlYXNlLCBjb2xvciAuMnMgZWFzZTtcbiAgICAgIH1cbiAgICAgICNzdGFydC1idG46aG92ZXIgeyBiYWNrZ3JvdW5kOiAjZmZmOyBjb2xvcjogIzAwMDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0xcHgpOyB9XG4gICAgICAjc3RhcnQtYnRuOmFjdGl2ZSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwKTsgfVxuICAgICAgI211dGUtYmVsb3ctc3RhcnQge1xuICAgICAgICBmb250LXNpemU6IDFyZW07IHBhZGRpbmc6IC41cmVtIDFyZW07IGJvcmRlci1yYWRpdXM6IDk5OXB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMwLCA0MSwgNTksIDAuNzIpOyBjb2xvcjogI2Y4ZmFmYztcbiAgICAgIH1cbiAgICAgIC5naG9zdC1idG4uc21hbGwgeyBwYWRkaW5nOiA0cHggOHB4OyBmb250LXNpemU6IDExcHg7IH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXG4gICAgLy8gV2lyZSBvdmVybGF5IGJ1dHRvbnNcbiAgICBjb25zdCBzdGFydEJ0biA9IG92ZXJsYXkucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXCIjc3RhcnQtYnRuXCIpITtcbiAgICBjb25zdCBtdXRlQmVsb3dTdGFydCA9IG92ZXJsYXkucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXCIjbXV0ZS1iZWxvdy1zdGFydFwiKSE7XG4gICAgY29uc3QgdG9wTXV0ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibXV0ZS10b3BcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGlmICh0b3BNdXRlKSBtdXRlTWdyLmF0dGFjaEJ1dHRvbih0b3BNdXRlKTtcbiAgICBtdXRlTWdyLmF0dGFjaEJ1dHRvbihtdXRlQmVsb3dTdGFydCk7XG5cbiAgICAvLyByZXN0b3JlIHBlcnNpc3RlZCBtdXRlIGxhYmVsIGltbWVkaWF0ZWx5XG4gICAgbXV0ZU1nci5lbmZvcmNlT25jZVdoZW5SZWFkeSgpO1xuXG4gICAgY29uc3Qgc3RhcnQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBhdWRpbyBmaXJzdCAodXNlciBnZXN0dXJlKVxuICAgICAgdHJ5IHsgYXdhaXQgcmVzdW1lQXVkaW8/LigpOyB9IGNhdGNoIHt9XG5cbiAgICAgIC8vIHJlc3BlY3QgcGVyc2lzdGVkIG11dGUgc3RhdGUgbm93IHRoYXQgY3R4IGxpa2VseSBleGlzdHNcbiAgICAgIG11dGVNZ3IuZW5mb3JjZU9uY2VXaGVuUmVhZHkoKTtcblxuICAgICAgLy8gb3B0aW9uYWwgZnVsbHNjcmVlblxuICAgICAgaWYgKHJlcXVlc3RGdWxsc2NyZWVuKSB7XG4gICAgICAgIHRyeSB7IGF3YWl0IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5yZXF1ZXN0RnVsbHNjcmVlbj8uKCk7IH0gY2F0Y2gge31cbiAgICAgIH1cblxuICAgICAgLy8gY2xlYW51cCBvdmVybGF5XG4gICAgICBzdHlsZS5yZW1vdmUoKTtcbiAgICAgIG92ZXJsYXkucmVtb3ZlKCk7XG5cbiAgICAgIC8vIGVuc3VyZSB0b3AtZnJhbWUgbXV0ZSBidXR0b24gZXhpc3RzIGFmdGVyIG92ZXJsYXlcbiAgICAgIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpO1xuXG4gICAgICByZXNvbHZlKCk7XG4gICAgfTtcblxuICAgIC8vIHN0YXJ0IGJ1dHRvblxuICAgIHN0YXJ0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGFydCwgeyBvbmNlOiB0cnVlIH0pO1xuXG4gICAgLy8gQWNjZXNzaWJpbGl0eTogYWxsb3cgRW50ZXIgLyBTcGFjZVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHtcbiAgICAgIGlmIChlLmtleSA9PT0gXCJFbnRlclwiIHx8IGUua2V5ID09PSBcIiBcIikge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHN0YXJ0KCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBGb2N1cyBmb3Iga2V5Ym9hcmQgdXNlcnNcbiAgICBzdGFydEJ0bi50YWJJbmRleCA9IDA7XG4gICAgc3RhcnRCdG4uZm9jdXMoKTtcblxuICAgIC8vIEFsc28gdHJ5IHRvIGNyZWF0ZSB0aGUgdG9wLWZyYW1lIG11dGUgaW1tZWRpYXRlbHkgaWYgRE9NIGlzIHJlYWR5XG4gICAgLy8gKElmICN0b3AtcmlnaHQgaXNuJ3QgdGhlcmUgeWV0LCBpdCdzIGhhcm1sZXNzOyB3ZSdsbCBhZGQgaXQgYWZ0ZXIgc3RhcnQgdG9vLilcbiAgICBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKTtcbiAgfSk7XG59XG4iLCAiaW1wb3J0IHsgbWFrZVBSTkcgfSBmcm9tIFwiLi4vLi4vZW5naW5lXCI7XG5cbmV4cG9ydCB0eXBlIEFtYmllbnRQYXJhbXMgPSB7XG4gIGludGVuc2l0eTogbnVtYmVyOyAgLy8gb3ZlcmFsbCBsb3VkbmVzcyAvIGVuZXJneSAoMC4uMSlcbiAgYnJpZ2h0bmVzczogbnVtYmVyOyAvLyBmaWx0ZXIgb3Blbm5lc3MgJiBjaG9yZCB0aW1icmUgKDAuLjEpXG4gIGRlbnNpdHk6IG51bWJlcjsgICAgLy8gY2hvcmQgc3Bhd24gcmF0ZSAvIHRoaWNrbmVzcyAoMC4uMSlcbn07XG5cbnR5cGUgTW9kZU5hbWUgPSBcIklvbmlhblwiIHwgXCJEb3JpYW5cIiB8IFwiUGhyeWdpYW5cIiB8IFwiTHlkaWFuXCIgfCBcIk1peG9seWRpYW5cIiB8IFwiQWVvbGlhblwiIHwgXCJMb2NyaWFuXCI7XG5cbmNvbnN0IE1PREVTOiBSZWNvcmQ8TW9kZU5hbWUsIG51bWJlcltdPiA9IHtcbiAgSW9uaWFuOiAgICAgWzAsMiw0LDUsNyw5LDExXSxcbiAgRG9yaWFuOiAgICAgWzAsMiwzLDUsNyw5LDEwXSxcbiAgUGhyeWdpYW46ICAgWzAsMSwzLDUsNyw4LDEwXSxcbiAgTHlkaWFuOiAgICAgWzAsMiw0LDYsNyw5LDExXSxcbiAgTWl4b2x5ZGlhbjogWzAsMiw0LDUsNyw5LDEwXSxcbiAgQWVvbGlhbjogICAgWzAsMiwzLDUsNyw4LDEwXSxcbiAgTG9jcmlhbjogICAgWzAsMSwzLDUsNiw4LDEwXSxcbn07XG5cbi8vIE11c2ljYWwgY29uc3RhbnRzIHR1bmVkIHRvIG1hdGNoIHRoZSBIVE1MIHZlcnNpb25cbmNvbnN0IFJPT1RfTUFYX0dBSU4gICAgID0gMC4zMztcbmNvbnN0IFJPT1RfU1dFTExfVElNRSAgID0gMjA7XG5jb25zdCBEUk9ORV9TSElGVF9NSU5fUyA9IDI0O1xuY29uc3QgRFJPTkVfU0hJRlRfTUFYX1MgPSA0ODtcbmNvbnN0IERST05FX0dMSURFX01JTl9TID0gODtcbmNvbnN0IERST05FX0dMSURFX01BWF9TID0gMTU7XG5cbmNvbnN0IENIT1JEX1ZPSUNFU19NQVggID0gNTtcbmNvbnN0IENIT1JEX0ZBREVfTUlOX1MgID0gODtcbmNvbnN0IENIT1JEX0ZBREVfTUFYX1MgID0gMTY7XG5jb25zdCBDSE9SRF9IT0xEX01JTl9TICA9IDEwO1xuY29uc3QgQ0hPUkRfSE9MRF9NQVhfUyAgPSAyMjtcbmNvbnN0IENIT1JEX0dBUF9NSU5fUyAgID0gNDtcbmNvbnN0IENIT1JEX0dBUF9NQVhfUyAgID0gOTtcbmNvbnN0IENIT1JEX0FOQ0hPUl9QUk9CID0gMC42OyAvLyBwcmVmZXIgYWxpZ25pbmcgY2hvcmQgcm9vdCB0byBkcm9uZVxuXG5jb25zdCBGSUxURVJfQkFTRV9IWiAgICA9IDIyMDtcbmNvbnN0IEZJTFRFUl9QRUFLX0haICAgID0gNDIwMDtcbmNvbnN0IFNXRUVQX1NFR19TICAgICAgID0gMzA7ICAvLyB1cCB0aGVuIGRvd24sIHZlcnkgc2xvd1xuY29uc3QgTEZPX1JBVEVfSFogICAgICAgPSAwLjA1O1xuY29uc3QgTEZPX0RFUFRIX0haICAgICAgPSA5MDA7XG5cbmNvbnN0IERFTEFZX1RJTUVfUyAgICAgID0gMC40NTtcbmNvbnN0IEZFRURCQUNLX0dBSU4gICAgID0gMC4zNTtcbmNvbnN0IFdFVF9NSVggICAgICAgICAgID0gMC4yODtcblxuLy8gZGVncmVlIHByZWZlcmVuY2UgZm9yIGRyb25lIG1vdmVzOiAxLDUsMyw2LDIsNCw3IChpbmRleGVzIDAuLjYpXG5jb25zdCBQUkVGRVJSRURfREVHUkVFX09SREVSID0gWzAsNCwyLDUsMSwzLDZdO1xuXG4vKiogVXRpbGl0eSAqL1xuY29uc3QgY2xhbXAwMSA9ICh4OiBudW1iZXIpID0+IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIHgpKTtcbmNvbnN0IHJhbmQgPSAocm5nOiAoKSA9PiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBhICsgcm5nKCkgKiAoYiAtIGEpO1xuY29uc3QgY2hvaWNlID0gPFQsPihybmc6ICgpID0+IG51bWJlciwgYXJyOiBUW10pID0+IGFycltNYXRoLmZsb29yKHJuZygpICogYXJyLmxlbmd0aCldO1xuXG5jb25zdCBtaWRpVG9GcmVxID0gKG06IG51bWJlcikgPT4gNDQwICogTWF0aC5wb3coMiwgKG0gLSA2OSkgLyAxMik7XG5cbi8qKiBBIHNpbmdsZSBzdGVhZHkgb3NjaWxsYXRvciB2b2ljZSB3aXRoIHNoaW1tZXIgZGV0dW5lIGFuZCBnYWluIGVudmVsb3BlLiAqL1xuY2xhc3MgVm9pY2Uge1xuICBwcml2YXRlIGtpbGxlZCA9IGZhbHNlO1xuICBwcml2YXRlIHNoaW1tZXI6IE9zY2lsbGF0b3JOb2RlO1xuICBwcml2YXRlIHNoaW1tZXJHYWluOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBzY2FsZTogR2Fpbk5vZGU7XG4gIHB1YmxpYyBnOiBHYWluTm9kZTtcbiAgcHVibGljIG9zYzogT3NjaWxsYXRvck5vZGU7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgICBwcml2YXRlIHRhcmdldEdhaW46IG51bWJlcixcbiAgICB3YXZlZm9ybTogT3NjaWxsYXRvclR5cGUsXG4gICAgZnJlcUh6OiBudW1iZXIsXG4gICAgZGVzdGluYXRpb246IEF1ZGlvTm9kZSxcbiAgICBybmc6ICgpID0+IG51bWJlclxuICApe1xuICAgIHRoaXMub3NjID0gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlOiB3YXZlZm9ybSwgZnJlcXVlbmN5OiBmcmVxSHogfSk7XG5cbiAgICAvLyBzdWJ0bGUgc2hpbW1lciB2aWEgZGV0dW5lIG1vZHVsYXRpb25cbiAgICB0aGlzLnNoaW1tZXIgPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGU6IFwic2luZVwiLCBmcmVxdWVuY3k6IHJhbmQocm5nLCAwLjA2LCAwLjE4KSB9KTtcbiAgICB0aGlzLnNoaW1tZXJHYWluID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiByYW5kKHJuZywgMC40LCAxLjIpIH0pO1xuICAgIHRoaXMuc2NhbGUgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDI1IH0pOyAvLyBjZW50cyByYW5nZVxuICAgIHRoaXMuc2hpbW1lci5jb25uZWN0KHRoaXMuc2hpbW1lckdhaW4pLmNvbm5lY3QodGhpcy5zY2FsZSkuY29ubmVjdCh0aGlzLm9zYy5kZXR1bmUpO1xuXG4gICAgdGhpcy5nID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICAgIHRoaXMub3NjLmNvbm5lY3QodGhpcy5nKS5jb25uZWN0KGRlc3RpbmF0aW9uKTtcblxuICAgIHRoaXMub3NjLnN0YXJ0KCk7XG4gICAgdGhpcy5zaGltbWVyLnN0YXJ0KCk7XG4gIH1cblxuICBmYWRlSW4oc2Vjb25kczogbnVtYmVyKSB7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgdGhpcy5nLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdGhpcy5nLmdhaW4uc2V0VmFsdWVBdFRpbWUodGhpcy5nLmdhaW4udmFsdWUsIG5vdyk7XG4gICAgdGhpcy5nLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGhpcy50YXJnZXRHYWluLCBub3cgKyBzZWNvbmRzKTtcbiAgfVxuXG4gIGZhZGVPdXRLaWxsKHNlY29uZHM6IG51bWJlcikge1xuICAgIGlmICh0aGlzLmtpbGxlZCkgcmV0dXJuO1xuICAgIHRoaXMua2lsbGVkID0gdHJ1ZTtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICB0aGlzLmcuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSh0aGlzLmcuZ2Fpbi52YWx1ZSwgbm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDEsIG5vdyArIHNlY29uZHMpO1xuICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5zdG9wKCksIHNlY29uZHMgKiAxMDAwICsgNjApO1xuICB9XG5cbiAgc2V0RnJlcUdsaWRlKHRhcmdldEh6OiBudW1iZXIsIGdsaWRlU2Vjb25kczogbnVtYmVyKSB7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgLy8gZXhwb25lbnRpYWwgd2hlbiBwb3NzaWJsZSBmb3Igc21vb3RobmVzc1xuICAgIGNvbnN0IGN1cnJlbnQgPSBNYXRoLm1heCgwLjAwMDEsIHRoaXMub3NjLmZyZXF1ZW5jeS52YWx1ZSk7XG4gICAgdGhpcy5vc2MuZnJlcXVlbmN5LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kuc2V0VmFsdWVBdFRpbWUoY3VycmVudCwgbm93KTtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKHRhcmdldEh6LCBub3cgKyBnbGlkZVNlY29uZHMpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRhcmdldEh6LCBub3cgKyBnbGlkZVNlY29uZHMpO1xuICAgIH1cbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgdHJ5IHsgdGhpcy5vc2Muc3RvcCgpOyB0aGlzLnNoaW1tZXIuc3RvcCgpOyB9IGNhdGNoIHt9XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMub3NjLmRpc2Nvbm5lY3QoKTsgdGhpcy5zaGltbWVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHRoaXMuZy5kaXNjb25uZWN0KCk7IHRoaXMuc2hpbW1lckdhaW4uZGlzY29ubmVjdCgpOyB0aGlzLnNjYWxlLmRpc2Nvbm5lY3QoKTtcbiAgICB9IGNhdGNoIHt9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEFtYmllbnRTY2VuZSB7XG4gIHByaXZhdGUgcnVubmluZyA9IGZhbHNlO1xuICBwcml2YXRlIHN0b3BGbnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG4gIHByaXZhdGUgdGltZW91dHM6IG51bWJlcltdID0gW107XG5cbiAgcHJpdmF0ZSBwYXJhbXM6IEFtYmllbnRQYXJhbXMgPSB7IGludGVuc2l0eTogMC43NSwgYnJpZ2h0bmVzczogMC41LCBkZW5zaXR5OiAwLjYgfTtcblxuICBwcml2YXRlIHJuZzogKCkgPT4gbnVtYmVyO1xuICBwcml2YXRlIG1hc3RlciE6IEdhaW5Ob2RlO1xuICBwcml2YXRlIGZpbHRlciE6IEJpcXVhZEZpbHRlck5vZGU7XG4gIHByaXZhdGUgZHJ5ITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgd2V0ITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgZGVsYXkhOiBEZWxheU5vZGU7XG4gIHByaXZhdGUgZmVlZGJhY2shOiBHYWluTm9kZTtcblxuICBwcml2YXRlIGxmb05vZGU/OiBPc2NpbGxhdG9yTm9kZTtcbiAgcHJpdmF0ZSBsZm9HYWluPzogR2Fpbk5vZGU7XG5cbiAgLy8gbXVzaWNhbCBzdGF0ZVxuICBwcml2YXRlIGtleVJvb3RNaWRpID0gNDM7XG4gIHByaXZhdGUgbW9kZTogTW9kZU5hbWUgPSBcIklvbmlhblwiO1xuICBwcml2YXRlIGRyb25lRGVncmVlSWR4ID0gMDtcbiAgcHJpdmF0ZSByb290Vm9pY2U6IFZvaWNlIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgICBwcml2YXRlIG91dDogR2Fpbk5vZGUsXG4gICAgc2VlZCA9IDFcbiAgKSB7XG4gICAgdGhpcy5ybmcgPSBtYWtlUFJORyhzZWVkKTtcbiAgfVxuXG4gIHNldFBhcmFtPEsgZXh0ZW5kcyBrZXlvZiBBbWJpZW50UGFyYW1zPihrOiBLLCB2OiBBbWJpZW50UGFyYW1zW0tdKSB7XG4gICAgdGhpcy5wYXJhbXNba10gPSBjbGFtcDAxKHYpO1xuICAgIGlmICh0aGlzLnJ1bm5pbmcgJiYgayA9PT0gXCJpbnRlbnNpdHlcIiAmJiB0aGlzLm1hc3Rlcikge1xuICAgICAgdGhpcy5tYXN0ZXIuZ2Fpbi52YWx1ZSA9IDAuMTUgKyAwLjg1ICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5OyBcbiAgICB9XG4gIH1cblxuICBzdGFydCgpIHtcbiAgICBpZiAodGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcblxuICAgIC8vIC0tLS0gQ29yZSBncmFwaCAoZmlsdGVyIC0+IGRyeStkZWxheSAtPiBtYXN0ZXIgLT4gb3V0KSAtLS0tXG4gICAgdGhpcy5tYXN0ZXIgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogMC4xNSArIDAuODUgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHkgfSk7XG4gICAgdGhpcy5maWx0ZXIgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZSh0aGlzLmN0eCwgeyB0eXBlOiBcImxvd3Bhc3NcIiwgUTogMC43MDcgfSk7XG4gICAgdGhpcy5kcnkgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogMSB9KTtcbiAgICB0aGlzLndldCA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBXRVRfTUlYIH0pO1xuICAgIHRoaXMuZGVsYXkgPSBuZXcgRGVsYXlOb2RlKHRoaXMuY3R4LCB7IGRlbGF5VGltZTogREVMQVlfVElNRV9TLCBtYXhEZWxheVRpbWU6IDIgfSk7XG4gICAgdGhpcy5mZWVkYmFjayA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBGRUVEQkFDS19HQUlOIH0pO1xuXG4gICAgdGhpcy5maWx0ZXIuY29ubmVjdCh0aGlzLmRyeSkuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5maWx0ZXIuY29ubmVjdCh0aGlzLmRlbGF5KTtcbiAgICB0aGlzLmRlbGF5LmNvbm5lY3QodGhpcy5mZWVkYmFjaykuY29ubmVjdCh0aGlzLmRlbGF5KTtcbiAgICB0aGlzLmRlbGF5LmNvbm5lY3QodGhpcy53ZXQpLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMubWFzdGVyLmNvbm5lY3QodGhpcy5vdXQpO1xuXG4gICAgLy8gLS0tLSBGaWx0ZXIgYmFzZWxpbmUgKyBzbG93IHN3ZWVwcyAtLS0tXG4gICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFZhbHVlQXRUaW1lKEZJTFRFUl9CQVNFX0haLCB0aGlzLmN0eC5jdXJyZW50VGltZSk7XG4gICAgY29uc3Qgc3dlZXAgPSAoKSA9PiB7XG4gICAgICBjb25zdCB0ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgICAgLy8gdXAgdGhlbiBkb3duIHVzaW5nIHZlcnkgc2xvdyB0aW1lIGNvbnN0YW50c1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFRhcmdldEF0VGltZShcbiAgICAgICAgRklMVEVSX0JBU0VfSFogKyAoRklMVEVSX1BFQUtfSFogLSBGSUxURVJfQkFTRV9IWikgKiAoMC40ICsgMC42ICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyksXG4gICAgICAgIHQsIFNXRUVQX1NFR19TIC8gM1xuICAgICAgKTtcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5zZXRUYXJnZXRBdFRpbWUoXG4gICAgICAgIEZJTFRFUl9CQVNFX0haICogKDAuNyArIDAuMyAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpLFxuICAgICAgICB0ICsgU1dFRVBfU0VHX1MsIFNXRUVQX1NFR19TIC8gM1xuICAgICAgKTtcbiAgICAgIHRoaXMudGltZW91dHMucHVzaCh3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB0aGlzLnJ1bm5pbmcgJiYgc3dlZXAoKSwgKFNXRUVQX1NFR19TICogMikgKiAxMDAwKSBhcyB1bmtub3duIGFzIG51bWJlcik7XG4gICAgfTtcbiAgICBzd2VlcCgpO1xuXG4gICAgLy8gLS0tLSBHZW50bGUgTEZPIG9uIGZpbHRlciBmcmVxIChzbWFsbCBkZXB0aCkgLS0tLVxuICAgIHRoaXMubGZvTm9kZSA9IG5ldyBPc2NpbGxhdG9yTm9kZSh0aGlzLmN0eCwgeyB0eXBlOiBcInNpbmVcIiwgZnJlcXVlbmN5OiBMRk9fUkFURV9IWiB9KTtcbiAgICB0aGlzLmxmb0dhaW4gPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogTEZPX0RFUFRIX0haICogKDAuNSArIDAuNSAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpIH0pO1xuICAgIHRoaXMubGZvTm9kZS5jb25uZWN0KHRoaXMubGZvR2FpbikuY29ubmVjdCh0aGlzLmZpbHRlci5mcmVxdWVuY3kpO1xuICAgIHRoaXMubGZvTm9kZS5zdGFydCgpO1xuXG4gICAgLy8gLS0tLSBTcGF3biByb290IGRyb25lIChnbGlkaW5nIHRvIGRpZmZlcmVudCBkZWdyZWVzKSAtLS0tXG4gICAgdGhpcy5zcGF3blJvb3REcm9uZSgpO1xuICAgIHRoaXMuc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCk7XG5cbiAgICAvLyAtLS0tIENob3JkIGN5Y2xlIGxvb3AgLS0tLVxuICAgIHRoaXMuY2hvcmRDeWNsZSgpO1xuXG4gICAgLy8gY2xlYW51cFxuICAgIHRoaXMuc3RvcEZucy5wdXNoKCgpID0+IHtcbiAgICAgIHRyeSB7IHRoaXMubGZvTm9kZT8uc3RvcCgpOyB9IGNhdGNoIHt9XG4gICAgICBbdGhpcy5tYXN0ZXIsIHRoaXMuZmlsdGVyLCB0aGlzLmRyeSwgdGhpcy53ZXQsIHRoaXMuZGVsYXksIHRoaXMuZmVlZGJhY2ssIHRoaXMubGZvTm9kZSwgdGhpcy5sZm9HYWluXVxuICAgICAgICAuZm9yRWFjaChuID0+IHsgdHJ5IHsgbj8uZGlzY29ubmVjdCgpOyB9IGNhdGNoIHt9IH0pO1xuICAgIH0pO1xuICB9XG5cbiAgc3RvcCgpIHtcbiAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuXG4gICAgLy8gY2FuY2VsIHRpbWVvdXRzXG4gICAgdGhpcy50aW1lb3V0cy5zcGxpY2UoMCkuZm9yRWFjaChpZCA9PiB3aW5kb3cuY2xlYXJUaW1lb3V0KGlkKSk7XG5cbiAgICAvLyBmYWRlIGFuZCBjbGVhbnVwIHZvaWNlc1xuICAgIGlmICh0aGlzLnJvb3RWb2ljZSkgdGhpcy5yb290Vm9pY2UuZmFkZU91dEtpbGwoMS4yKTtcblxuICAgIC8vIHJ1biBkZWZlcnJlZCBzdG9wc1xuICAgIHRoaXMuc3RvcEZucy5zcGxpY2UoMCkuZm9yRWFjaChmbiA9PiBmbigpKTtcbiAgfVxuXG4gIC8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gTXVzaWNhbCBlbmdpbmUgYmVsb3cgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSAqL1xuXG4gIHByaXZhdGUgY3VycmVudERlZ3JlZXMoKTogbnVtYmVyW10ge1xuICAgIHJldHVybiBNT0RFU1t0aGlzLm1vZGVdIHx8IE1PREVTLkx5ZGlhbjtcbiAgfVxuXG4gIC8qKiBEcm9uZSByb290IHZvaWNlICovXG4gIHByaXZhdGUgc3Bhd25Sb290RHJvbmUoKSB7XG4gICAgY29uc3QgYmFzZU1pZGkgPSB0aGlzLmtleVJvb3RNaWRpICsgdGhpcy5jdXJyZW50RGVncmVlcygpW3RoaXMuZHJvbmVEZWdyZWVJZHhdO1xuICAgIGNvbnN0IHYgPSBuZXcgVm9pY2UoXG4gICAgICB0aGlzLmN0eCxcbiAgICAgIFJPT1RfTUFYX0dBSU4sXG4gICAgICBcInNpbmVcIixcbiAgICAgIG1pZGlUb0ZyZXEoYmFzZU1pZGkpLFxuICAgICAgdGhpcy5maWx0ZXIsXG4gICAgICB0aGlzLnJuZ1xuICAgICk7XG4gICAgdi5mYWRlSW4oUk9PVF9TV0VMTF9USU1FKTtcbiAgICB0aGlzLnJvb3RWb2ljZSA9IHY7XG4gIH1cblxuICBwcml2YXRlIHNjaGVkdWxlTmV4dERyb25lTW92ZSgpIHtcbiAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIGNvbnN0IHdhaXRNcyA9IHJhbmQodGhpcy5ybmcsIERST05FX1NISUZUX01JTl9TLCBEUk9ORV9TSElGVF9NQVhfUykgKiAxMDAwO1xuICAgIGNvbnN0IGlkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcgfHwgIXRoaXMucm9vdFZvaWNlKSByZXR1cm47XG4gICAgICBjb25zdCBnbGlkZSA9IHJhbmQodGhpcy5ybmcsIERST05FX0dMSURFX01JTl9TLCBEUk9ORV9HTElERV9NQVhfUyk7XG4gICAgICBjb25zdCBuZXh0SWR4ID0gdGhpcy5waWNrTmV4dERyb25lRGVncmVlSWR4KCk7XG4gICAgICBjb25zdCB0YXJnZXRNaWRpID0gdGhpcy5rZXlSb290TWlkaSArIHRoaXMuY3VycmVudERlZ3JlZXMoKVtuZXh0SWR4XTtcbiAgICAgIHRoaXMucm9vdFZvaWNlLnNldEZyZXFHbGlkZShtaWRpVG9GcmVxKHRhcmdldE1pZGkpLCBnbGlkZSk7XG4gICAgICB0aGlzLmRyb25lRGVncmVlSWR4ID0gbmV4dElkeDtcbiAgICAgIHRoaXMuc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCk7XG4gICAgfSwgd2FpdE1zKSBhcyB1bmtub3duIGFzIG51bWJlcjtcbiAgICB0aGlzLnRpbWVvdXRzLnB1c2goaWQpO1xuICB9XG5cbiAgcHJpdmF0ZSBwaWNrTmV4dERyb25lRGVncmVlSWR4KCk6IG51bWJlciB7XG4gICAgY29uc3Qgb3JkZXIgPSBbLi4uUFJFRkVSUkVEX0RFR1JFRV9PUkRFUl07XG4gICAgY29uc3QgaSA9IG9yZGVyLmluZGV4T2YodGhpcy5kcm9uZURlZ3JlZUlkeCk7XG4gICAgaWYgKGkgPj0gMCkgeyBjb25zdCBbY3VyXSA9IG9yZGVyLnNwbGljZShpLCAxKTsgb3JkZXIucHVzaChjdXIpOyB9XG4gICAgcmV0dXJuIGNob2ljZSh0aGlzLnJuZywgb3JkZXIpO1xuICB9XG5cbiAgLyoqIEJ1aWxkIGRpYXRvbmljIHN0YWNrZWQtdGhpcmQgY2hvcmQgZGVncmVlcyB3aXRoIG9wdGlvbmFsIGV4dGVuc2lvbnMgKi9cbiAgcHJpdmF0ZSBidWlsZENob3JkRGVncmVlcyhtb2RlRGVnczogbnVtYmVyW10sIHJvb3RJbmRleDogbnVtYmVyLCBzaXplID0gNCwgYWRkOSA9IGZhbHNlLCBhZGQxMSA9IGZhbHNlLCBhZGQxMyA9IGZhbHNlKSB7XG4gICAgY29uc3Qgc3RlcHMgPSBbMCwgMiwgNCwgNl07IC8vIHRoaXJkcyBvdmVyIDctbm90ZSBzY2FsZVxuICAgIGNvbnN0IGNob3JkSWR4cyA9IHN0ZXBzLnNsaWNlKDAsIE1hdGgubWluKHNpemUsIDQpKS5tYXAocyA9PiAocm9vdEluZGV4ICsgcykgJSA3KTtcbiAgICBpZiAoYWRkOSkgIGNob3JkSWR4cy5wdXNoKChyb290SW5kZXggKyA4KSAlIDcpO1xuICAgIGlmIChhZGQxMSkgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDEwKSAlIDcpO1xuICAgIGlmIChhZGQxMykgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDEyKSAlIDcpO1xuICAgIHJldHVybiBjaG9yZElkeHMubWFwKGkgPT4gbW9kZURlZ3NbaV0pO1xuICB9XG5cbiAgcHJpdmF0ZSAqZW5kbGVzc0Nob3JkcygpIHtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgbW9kZURlZ3MgPSB0aGlzLmN1cnJlbnREZWdyZWVzKCk7XG4gICAgICAvLyBjaG9vc2UgY2hvcmQgcm9vdCBkZWdyZWUgKG9mdGVuIGFsaWduIHdpdGggZHJvbmUpXG4gICAgICBjb25zdCByb290RGVncmVlSW5kZXggPSAodGhpcy5ybmcoKSA8IENIT1JEX0FOQ0hPUl9QUk9CKSA/IHRoaXMuZHJvbmVEZWdyZWVJZHggOiBNYXRoLmZsb29yKHRoaXMucm5nKCkgKiA3KTtcblxuICAgICAgLy8gY2hvcmQgc2l6ZSAvIGV4dGVuc2lvbnNcbiAgICAgIGNvbnN0IHIgPSB0aGlzLnJuZygpO1xuICAgICAgbGV0IHNpemUgPSAzOyBsZXQgYWRkOSA9IGZhbHNlLCBhZGQxMSA9IGZhbHNlLCBhZGQxMyA9IGZhbHNlO1xuICAgICAgaWYgKHIgPCAwLjM1KSAgICAgICAgICAgIHsgc2l6ZSA9IDM7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjc1KSAgICAgICB7IHNpemUgPSA0OyB9XG4gICAgICBlbHNlIGlmIChyIDwgMC45MCkgICAgICAgeyBzaXplID0gNDsgYWRkOSA9IHRydWU7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjk3KSAgICAgICB7IHNpemUgPSA0OyBhZGQxMSA9IHRydWU7IH1cbiAgICAgIGVsc2UgICAgICAgICAgICAgICAgICAgICB7IHNpemUgPSA0OyBhZGQxMyA9IHRydWU7IH1cblxuICAgICAgY29uc3QgY2hvcmRTZW1pcyA9IHRoaXMuYnVpbGRDaG9yZERlZ3JlZXMobW9kZURlZ3MsIHJvb3REZWdyZWVJbmRleCwgc2l6ZSwgYWRkOSwgYWRkMTEsIGFkZDEzKTtcbiAgICAgIC8vIHNwcmVhZCBjaG9yZCBhY3Jvc3Mgb2N0YXZlcyAoLTEyLCAwLCArMTIpLCBiaWFzIHRvIGNlbnRlclxuICAgICAgY29uc3Qgc3ByZWFkID0gY2hvcmRTZW1pcy5tYXAoc2VtaSA9PiBzZW1pICsgY2hvaWNlKHRoaXMucm5nLCBbLTEyLCAwLCAwLCAxMl0pKTtcblxuICAgICAgLy8gb2NjYXNpb25hbGx5IGVuc3VyZSB0b25pYyBpcyBwcmVzZW50IGZvciBncm91bmRpbmdcbiAgICAgIGlmICghc3ByZWFkLmluY2x1ZGVzKDApICYmIHRoaXMucm5nKCkgPCAwLjUpIHNwcmVhZC5wdXNoKDApO1xuXG4gICAgICB5aWVsZCBzcHJlYWQ7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaG9yZEN5Y2xlKCkge1xuICAgIGNvbnN0IGdlbiA9IHRoaXMuZW5kbGVzc0Nob3JkcygpO1xuICAgIGNvbnN0IHZvaWNlcyA9IG5ldyBTZXQ8Vm9pY2U+KCk7XG5cbiAgICBjb25zdCBzbGVlcCA9IChtczogbnVtYmVyKSA9PiBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHtcbiAgICAgIGNvbnN0IGlkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4gcigpLCBtcykgYXMgdW5rbm93biBhcyBudW1iZXI7XG4gICAgICB0aGlzLnRpbWVvdXRzLnB1c2goaWQpO1xuICAgIH0pO1xuXG4gICAgd2hpbGUgKHRoaXMucnVubmluZykge1xuICAgICAgLy8gY2hvcmQgc3Bhd24gcHJvYmFiaWxpdHkgLyB0aGlja25lc3Mgc2NhbGUgd2l0aCBkZW5zaXR5ICYgYnJpZ2h0bmVzc1xuICAgICAgY29uc3QgdGhpY2tuZXNzID0gTWF0aC5yb3VuZCgyICsgdGhpcy5wYXJhbXMuZGVuc2l0eSAqIDMpO1xuICAgICAgY29uc3QgYmFzZU1pZGkgPSB0aGlzLmtleVJvb3RNaWRpO1xuICAgICAgY29uc3QgZGVncmVlc09mZjogbnVtYmVyW10gPSBnZW4ubmV4dCgpLnZhbHVlID8/IFtdO1xuXG4gICAgICAvLyBzcGF3blxuICAgICAgZm9yIChjb25zdCBvZmYgb2YgZGVncmVlc09mZikge1xuICAgICAgICBpZiAoIXRoaXMucnVubmluZykgYnJlYWs7XG4gICAgICAgIGlmICh2b2ljZXMuc2l6ZSA+PSBNYXRoLm1pbihDSE9SRF9WT0lDRVNfTUFYLCB0aGlja25lc3MpKSBicmVhaztcblxuICAgICAgICBjb25zdCBtaWRpID0gYmFzZU1pZGkgKyBvZmY7XG4gICAgICAgIGNvbnN0IGZyZXEgPSBtaWRpVG9GcmVxKG1pZGkpO1xuICAgICAgICBjb25zdCB3YXZlZm9ybSA9IGNob2ljZSh0aGlzLnJuZywgW1wic2luZVwiLCBcInRyaWFuZ2xlXCIsIFwic2F3dG9vdGhcIl0gYXMgT3NjaWxsYXRvclR5cGVbXSk7XG5cbiAgICAgICAgLy8gbG91ZGVyIHdpdGggaW50ZW5zaXR5OyBzbGlnaHRseSBicmlnaHRlciAtPiBzbGlnaHRseSBsb3VkZXJcbiAgICAgICAgY29uc3QgZ2FpblRhcmdldCA9IHJhbmQodGhpcy5ybmcsIDAuMDgsIDAuMjIpICpcbiAgICAgICAgICAoMC44NSArIDAuMyAqIHRoaXMucGFyYW1zLmludGVuc2l0eSkgKlxuICAgICAgICAgICgwLjkgKyAwLjIgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKTtcblxuICAgICAgICBjb25zdCB2ID0gbmV3IFZvaWNlKHRoaXMuY3R4LCBnYWluVGFyZ2V0LCB3YXZlZm9ybSwgZnJlcSwgdGhpcy5maWx0ZXIsIHRoaXMucm5nKTtcbiAgICAgICAgdm9pY2VzLmFkZCh2KTtcbiAgICAgICAgdi5mYWRlSW4ocmFuZCh0aGlzLnJuZywgQ0hPUkRfRkFERV9NSU5fUywgQ0hPUkRfRkFERV9NQVhfUykpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCBzbGVlcChyYW5kKHRoaXMucm5nLCBDSE9SRF9IT0xEX01JTl9TLCBDSE9SRF9IT0xEX01BWF9TKSAqIDEwMDApO1xuXG4gICAgICAvLyBmYWRlIG91dFxuICAgICAgY29uc3Qgb3V0cyA9IEFycmF5LmZyb20odm9pY2VzKTtcbiAgICAgIGZvciAoY29uc3QgdiBvZiBvdXRzKSB2LmZhZGVPdXRLaWxsKHJhbmQodGhpcy5ybmcsIENIT1JEX0ZBREVfTUlOX1MsIENIT1JEX0ZBREVfTUFYX1MpKTtcbiAgICAgIHZvaWNlcy5jbGVhcigpO1xuXG4gICAgICBhd2FpdCBzbGVlcChyYW5kKHRoaXMucm5nLCBDSE9SRF9HQVBfTUlOX1MsIENIT1JEX0dBUF9NQVhfUykgKiAxMDAwKTtcbiAgICB9XG5cbiAgICAvLyBzYWZldHk6IGtpbGwgYW55IGxpbmdlcmluZyB2b2ljZXNcbiAgICBmb3IgKGNvbnN0IHYgb2YgQXJyYXkuZnJvbSh2b2ljZXMpKSB2LmZhZGVPdXRLaWxsKDAuOCk7XG4gIH1cbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNjZW5lTmFtZSwgTXVzaWNTY2VuZU9wdGlvbnMgfSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4uL2VuZ2luZVwiO1xuaW1wb3J0IHsgQW1iaWVudFNjZW5lIH0gZnJvbSBcIi4vc2NlbmVzL2FtYmllbnRcIjtcblxuZXhwb3J0IGNsYXNzIE11c2ljRGlyZWN0b3Ige1xuICBwcml2YXRlIGN1cnJlbnQ/OiB7IG5hbWU6IFNjZW5lTmFtZTsgc3RvcDogKCkgPT4gdm9pZCB9O1xuICBwcml2YXRlIGJ1c091dDogR2Fpbk5vZGU7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBlbmdpbmU6IEF1ZGlvRW5naW5lKSB7XG4gICAgdGhpcy5idXNPdXQgPSBuZXcgR2Fpbk5vZGUoZW5naW5lLmN0eCwgeyBnYWluOiAwLjkgfSk7XG4gICAgdGhpcy5idXNPdXQuY29ubmVjdChlbmdpbmUuZ2V0TXVzaWNCdXMoKSk7XG4gIH1cblxuICAvKiogQ3Jvc3NmYWRlIHRvIGEgbmV3IHNjZW5lICovXG4gIHNldFNjZW5lKG5hbWU6IFNjZW5lTmFtZSwgb3B0cz86IE11c2ljU2NlbmVPcHRpb25zKSB7XG4gICAgaWYgKHRoaXMuY3VycmVudD8ubmFtZSA9PT0gbmFtZSkgcmV0dXJuO1xuXG4gICAgY29uc3Qgb2xkID0gdGhpcy5jdXJyZW50O1xuICAgIGNvbnN0IHQgPSB0aGlzLmVuZ2luZS5ub3c7XG5cbiAgICAvLyBmYWRlLW91dCBvbGRcbiAgICBjb25zdCBmYWRlT3V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuZW5naW5lLmN0eCwgeyBnYWluOiAwLjkgfSk7XG4gICAgZmFkZU91dC5jb25uZWN0KHRoaXMuZW5naW5lLmdldE11c2ljQnVzKCkpO1xuICAgIGlmIChvbGQpIHtcbiAgICAgIC8vIFdlIGFzc3VtZSBlYWNoIHNjZW5lIG1hbmFnZXMgaXRzIG93biBvdXQgbm9kZTsgc3RvcHBpbmcgdHJpZ2dlcnMgYSBuYXR1cmFsIHRhaWwuXG4gICAgICBvbGQuc3RvcCgpO1xuICAgICAgZmFkZU91dC5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMCwgdCArIDAuNik7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IGZhZGVPdXQuZGlzY29ubmVjdCgpLCA2NTApO1xuICAgIH1cblxuICAgIC8vIG5ldyBzY2VuZVxuICAgIGNvbnN0IHNjZW5lT3V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuZW5naW5lLmN0eCwgeyBnYWluOiAwIH0pO1xuICAgIHNjZW5lT3V0LmNvbm5lY3QodGhpcy5idXNPdXQpO1xuXG4gICAgbGV0IHN0b3AgPSAoKSA9PiBzY2VuZU91dC5kaXNjb25uZWN0KCk7XG5cbiAgICBpZiAobmFtZSA9PT0gXCJhbWJpZW50XCIpIHtcbiAgICAgIGNvbnN0IHMgPSBuZXcgQW1iaWVudFNjZW5lKHRoaXMuZW5naW5lLmN0eCwgc2NlbmVPdXQsIG9wdHM/LnNlZWQgPz8gMSk7XG4gICAgICBzLnN0YXJ0KCk7XG4gICAgICBzdG9wID0gKCkgPT4ge1xuICAgICAgICBzLnN0b3AoKTtcbiAgICAgICAgc2NlbmVPdXQuZGlzY29ubmVjdCgpO1xuICAgICAgfTtcbiAgICB9XG4gICAgLy8gZWxzZSBpZiAobmFtZSA9PT0gXCJjb21iYXRcIikgeyAvKiBpbXBsZW1lbnQgY29tYmF0IHNjZW5lIGxhdGVyICovIH1cbiAgICAvLyBlbHNlIGlmIChuYW1lID09PSBcImxvYmJ5XCIpIHsgLyogaW1wbGVtZW50IGxvYmJ5IHNjZW5lIGxhdGVyICovIH1cblxuICAgIHRoaXMuY3VycmVudCA9IHsgbmFtZSwgc3RvcCB9O1xuICAgIHNjZW5lT3V0LmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC45LCB0ICsgMC42KTtcbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgaWYgKCF0aGlzLmN1cnJlbnQpIHJldHVybjtcbiAgICB0aGlzLmN1cnJlbnQuc3RvcCgpO1xuICAgIHRoaXMuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgQnVzLCBNdXNpY1BhcmFtTWVzc2FnZSwgTXVzaWNTY2VuZU9wdGlvbnMgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IE11c2ljRGlyZWN0b3IgfSBmcm9tIFwiLi9tdXNpY1wiO1xuaW1wb3J0IHsgcGxheVNmeCB9IGZyb20gXCIuL3NmeFwiO1xuXG4vKipcbiAqIEJpbmQgc3RhbmRhcmQgYXVkaW8gZXZlbnRzIHRvIHRoZSBlbmdpbmUgYW5kIG11c2ljIGRpcmVjdG9yLlxuICpcbiAqIEV2ZW50cyBzdXBwb3J0ZWQ6XG4gKiAgLSBhdWRpbzpyZXN1bWVcbiAqICAtIGF1ZGlvOm11dGUgLyBhdWRpbzp1bm11dGVcbiAqICAtIGF1ZGlvOnNldC1tYXN0ZXItZ2FpbiB7IGdhaW4gfVxuICogIC0gYXVkaW86c2Z4IHsgbmFtZSwgdmVsb2NpdHk/LCBwYW4/IH1cbiAqICAtIGF1ZGlvOm11c2ljOnNldC1zY2VuZSB7IHNjZW5lLCBzZWVkPyB9XG4gKiAgLSBhdWRpbzptdXNpYzpwYXJhbSB7IGtleSwgdmFsdWUgfVxuICogIC0gYXVkaW86bXVzaWM6dHJhbnNwb3J0IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9ICAvLyBwYXVzZSBjdXJyZW50bHkgbWFwcyB0byBzdG9wXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MoXG4gIGJ1czogQnVzLFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICBtdXNpYzogTXVzaWNEaXJlY3RvclxuKTogdm9pZCB7XG4gIGJ1cy5vbihcImF1ZGlvOnJlc3VtZVwiLCAoKSA9PiBlbmdpbmUucmVzdW1lKCkpO1xuICBidXMub24oXCJhdWRpbzptdXRlXCIsICgpID0+IGVuZ2luZS5zZXRNYXN0ZXJHYWluKDApKTtcbiAgYnVzLm9uKFwiYXVkaW86dW5tdXRlXCIsICgpID0+IGVuZ2luZS5zZXRNYXN0ZXJHYWluKDAuOSkpO1xuICBidXMub24oXCJhdWRpbzpzZXQtbWFzdGVyLWdhaW5cIiwgKHsgZ2FpbiB9OiB7IGdhaW46IG51bWJlciB9KSA9PlxuICAgIGVuZ2luZS5zZXRNYXN0ZXJHYWluKE1hdGgubWF4KDAsIE1hdGgubWluKDEsIGdhaW4pKSlcbiAgKTtcblxuICBidXMub24oXCJhdWRpbzpzZnhcIiwgKG1zZzogeyBuYW1lOiBzdHJpbmc7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfSkgPT4ge1xuICAgIHBsYXlTZngoZW5naW5lLCBtc2cubmFtZSBhcyBhbnksIHsgdmVsb2NpdHk6IG1zZy52ZWxvY2l0eSwgcGFuOiBtc2cucGFuIH0pO1xuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIiwgKG1zZzogeyBzY2VuZTogc3RyaW5nIH0gJiBNdXNpY1NjZW5lT3B0aW9ucykgPT4ge1xuICAgIGVuZ2luZS5yZXN1bWUoKTtcbiAgICBtdXNpYy5zZXRTY2VuZShtc2cuc2NlbmUgYXMgYW55LCB7IHNlZWQ6IG1zZy5zZWVkIH0pO1xuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzpwYXJhbVwiLCAoX21zZzogTXVzaWNQYXJhbU1lc3NhZ2UpID0+IHtcbiAgICAvLyBIb29rIGZvciBmdXR1cmUgcGFyYW0gcm91dGluZyBwZXIgc2NlbmUgKGUuZy4sIGludGVuc2l0eS9icmlnaHRuZXNzL2RlbnNpdHkpXG4gICAgLy8gSWYgeW91IHdhbnQgZ2xvYmFsIHBhcmFtcywga2VlcCBhIG1hcCBoZXJlIGFuZCBmb3J3YXJkIHRvIHRoZSBhY3RpdmUgc2NlbmVcbiAgfSk7XG5cbiAgYnVzLm9uKFwiYXVkaW86bXVzaWM6dHJhbnNwb3J0XCIsICh7IGNtZCB9OiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfSkgPT4ge1xuICAgIGlmIChjbWQgPT09IFwic3RvcFwiIHx8IGNtZCA9PT0gXCJwYXVzZVwiKSBtdXNpYy5zdG9wKCk7XG4gICAgLy8gXCJzdGFydFwiIGlzIGltcGxpY2l0IHZpYSBzZXRTY2VuZVxuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBjcmVhdGVFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHsgY29ubmVjdFdlYlNvY2tldCwgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi9uZXRcIjtcbmltcG9ydCB7IGluaXRHYW1lIH0gZnJvbSBcIi4vZ2FtZVwiO1xuaW1wb3J0IHsgY3JlYXRlSW5pdGlhbFN0YXRlLCBjcmVhdGVJbml0aWFsVUlTdGF0ZSB9IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQgeyBtb3VudFR1dG9yaWFsLCBCQVNJQ19UVVRPUklBTF9JRCB9IGZyb20gXCIuL3R1dG9yaWFsXCI7XG5pbXBvcnQgeyBjbGVhclByb2dyZXNzIGFzIGNsZWFyVHV0b3JpYWxQcm9ncmVzcyB9IGZyb20gXCIuL3R1dG9yaWFsL3N0b3JhZ2VcIjtcbmltcG9ydCB7IG1vdW50U3RvcnksIElOVFJPX0NIQVBURVJfSUQsIElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTIH0gZnJvbSBcIi4vc3RvcnlcIjtcbmltcG9ydCB7IHdhaXRGb3JVc2VyU3RhcnQgfSBmcm9tIFwiLi9zdGFydC1nYXRlXCI7XG5pbXBvcnQgeyByZXN1bWVBdWRpbyB9IGZyb20gXCIuL3N0b3J5L3NmeFwiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9hdWRpby9lbmdpbmVcIjtcbmltcG9ydCB7IE11c2ljRGlyZWN0b3IgfSBmcm9tIFwiLi9hdWRpby9tdXNpY1wiO1xuaW1wb3J0IHsgcmVnaXN0ZXJBdWRpb0J1c0JpbmRpbmdzIH0gZnJvbSBcIi4vYXVkaW8vY3Vlc1wiO1xuXG5jb25zdCBDQUxMX1NJR05fU1RPUkFHRV9LRVkgPSBcImxzZDpjYWxsc2lnblwiO1xuXG4oYXN5bmMgZnVuY3Rpb24gYm9vdHN0cmFwKCkge1xuICBjb25zdCBxcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG4gIGNvbnN0IHJvb20gPSBxcy5nZXQoXCJyb29tXCIpIHx8IFwiZGVmYXVsdFwiO1xuICBjb25zdCBtb2RlID0gcXMuZ2V0KFwibW9kZVwiKSB8fCBcIlwiO1xuICBjb25zdCBuYW1lUGFyYW0gPSBzYW5pdGl6ZUNhbGxTaWduKHFzLmdldChcIm5hbWVcIikpO1xuICBjb25zdCBzdG9yZWROYW1lID0gc2FuaXRpemVDYWxsU2lnbihyZWFkU3RvcmVkQ2FsbFNpZ24oKSk7XG4gIGNvbnN0IGNhbGxTaWduID0gbmFtZVBhcmFtIHx8IHN0b3JlZE5hbWU7XG4gIGNvbnN0IG1hcFcgPSBwYXJzZUZsb2F0KHFzLmdldChcIm1hcFdcIikgfHwgXCI4MDAwXCIpO1xuICBjb25zdCBtYXBIID0gcGFyc2VGbG9hdChxcy5nZXQoXCJtYXBIXCIpIHx8IFwiNDUwMFwiKTtcblxuICBpZiAobmFtZVBhcmFtICYmIG5hbWVQYXJhbSAhPT0gc3RvcmVkTmFtZSkge1xuICAgIHBlcnNpc3RDYWxsU2lnbihuYW1lUGFyYW0pO1xuICB9XG5cbiAgLy8gR2F0ZSBldmVyeXRoaW5nIG9uIGEgdXNlciBnZXN0dXJlIChjZW50cmVkIGJ1dHRvbilcbiAgYXdhaXQgd2FpdEZvclVzZXJTdGFydCh7XG4gICAgbGFiZWw6IFwiU3RhcnQgR2FtZVwiLFxuICAgIHJlcXVlc3RGdWxsc2NyZWVuOiBmYWxzZSwgICAvLyBmbGlwIHRvIHRydWUgaWYgeW91IHdhbnQgZnVsbHNjcmVlblxuICAgIHJlc3VtZUF1ZGlvLCAgICAgICAgICAgICAgICAvLyB1c2VzIHN0b3J5L3NmeC50c1xuICB9KTtcblxuICAvLyAtLS0tIFN0YXJ0IGFjdHVhbCBhcHAgYWZ0ZXIgZ2VzdHVyZSAtLS0tXG4gIGNvbnN0IHN0YXRlID0gY3JlYXRlSW5pdGlhbFN0YXRlKCk7XG4gIGNvbnN0IHVpU3RhdGUgPSBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpO1xuICBjb25zdCBidXMgPSBjcmVhdGVFdmVudEJ1cygpO1xuXG4gIC8vIC0tLSBBVURJTzogZW5naW5lICsgYmluZGluZ3MgKyBkZWZhdWx0IHNjZW5lIC0tLVxuICBjb25zdCBlbmdpbmUgPSBBdWRpb0VuZ2luZS5nZXQoKTtcbiAgYXdhaXQgZW5naW5lLnJlc3VtZSgpOyAvLyBzYWZlIHBvc3QtZ2VzdHVyZVxuICBjb25zdCBtdXNpYyA9IG5ldyBNdXNpY0RpcmVjdG9yKGVuZ2luZSk7XG4gIHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyhidXMgYXMgYW55LCBlbmdpbmUsIG11c2ljKTtcblxuICAvLyBTdGFydCBhIGRlZmF1bHQgbXVzaWMgc2NlbmUgKGFkanVzdCBzZWVkL3NjZW5lIGFzIHlvdSBsaWtlKVxuICBidXMuZW1pdChcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiLCB7IHNjZW5lOiBcImFtYmllbnRcIiwgc2VlZDogNDIgfSk7XG5cbiAgLy8gT3B0aW9uYWw6IGJhc2ljIGhvb2tzIHRvIGRlbW9uc3RyYXRlIFNGWCAmIGR1Y2tpbmdcbiAgLy8gYnVzLm9uKFwiZGlhbG9ndWU6b3BlbmVkXCIsICgpID0+IGVuZ2luZS5kdWNrTXVzaWMoMC4zNSwgMC4xKSk7XG4gIC8vIGJ1cy5vbihcImRpYWxvZ3VlOmNsb3NlZFwiLCAoKSA9PiBlbmdpbmUudW5kdWNrTXVzaWMoMC4yNSkpO1xuXG4gIC8vIEV4YW1wbGUgZ2FtZSBTRlggd2lyaW5nIChhZGFwdCB0byB5b3VyIGFjdHVhbCBldmVudHMpXG4gIGJ1cy5vbihcInNoaXA6c3BlZWRDaGFuZ2VkXCIsICh7IHZhbHVlIH0pID0+IHtcbiAgICBpZiAodmFsdWUgPiAwKSBidXMuZW1pdChcImF1ZGlvOnNmeFwiLCB7IG5hbWU6IFwidGhydXN0XCIsIHZlbG9jaXR5OiBNYXRoLm1pbigxLCB2YWx1ZSkgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGdhbWUgPSBpbml0R2FtZSh7IHN0YXRlLCB1aVN0YXRlLCBidXMgfSk7XG5cbiAgLy8gTW91bnQgdHV0b3JpYWwgYW5kIHN0b3J5IGJhc2VkIG9uIGdhbWUgbW9kZVxuICBjb25zdCBlbmFibGVUdXRvcmlhbCA9IG1vZGUgPT09IFwiY2FtcGFpZ25cIiB8fCBtb2RlID09PSBcInR1dG9yaWFsXCI7XG4gIGNvbnN0IGVuYWJsZVN0b3J5ID0gbW9kZSA9PT0gXCJjYW1wYWlnblwiO1xuXG4gIGxldCB0dXRvcmlhbDogUmV0dXJuVHlwZTx0eXBlb2YgbW91bnRUdXRvcmlhbD4gfCBudWxsID0gbnVsbDtcbiAgbGV0IHR1dG9yaWFsU3RhcnRlZCA9IGZhbHNlO1xuXG4gIGlmIChlbmFibGVUdXRvcmlhbCkge1xuICAgIHR1dG9yaWFsID0gbW91bnRUdXRvcmlhbChidXMpO1xuICB9XG5cbiAgY29uc3Qgc3RhcnRUdXRvcmlhbCA9ICgpOiB2b2lkID0+IHtcbiAgICBpZiAoIXR1dG9yaWFsIHx8IHR1dG9yaWFsU3RhcnRlZCkgcmV0dXJuO1xuICAgIHR1dG9yaWFsU3RhcnRlZCA9IHRydWU7XG4gICAgY2xlYXJUdXRvcmlhbFByb2dyZXNzKEJBU0lDX1RVVE9SSUFMX0lEKTtcbiAgICB0dXRvcmlhbC5zdGFydCh7IHJlc3VtZTogZmFsc2UgfSk7XG4gIH07XG5cbiAgaWYgKGVuYWJsZVN0b3J5KSB7XG4gICAgLy8gQ2FtcGFpZ24gbW9kZTogc3RvcnkgKyB0dXRvcmlhbFxuICAgIGNvbnN0IHVuc3Vic2NyaWJlU3RvcnlDbG9zZWQgPSBidXMub24oXCJkaWFsb2d1ZTpjbG9zZWRcIiwgKHsgY2hhcHRlcklkLCBub2RlSWQgfSkgPT4ge1xuICAgICAgaWYgKGNoYXB0ZXJJZCAhPT0gSU5UUk9fQ0hBUFRFUl9JRCkgcmV0dXJuO1xuICAgICAgaWYgKCFJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUy5pbmNsdWRlcyhub2RlSWQgYXMgdHlwZW9mIElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTW251bWJlcl0pKSByZXR1cm47XG4gICAgICB1bnN1YnNjcmliZVN0b3J5Q2xvc2VkKCk7XG4gICAgICBzdGFydFR1dG9yaWFsKCk7XG4gICAgfSk7XG4gICAgbW91bnRTdG9yeSh7IGJ1cywgcm9vbUlkOiByb29tIH0pO1xuICB9IGVsc2UgaWYgKG1vZGUgPT09IFwidHV0b3JpYWxcIikge1xuICAgIC8vIFR1dG9yaWFsIG1vZGU6IGF1dG8tc3RhcnQgdHV0b3JpYWwgd2l0aG91dCBzdG9yeVxuICAgIHN0YXJ0VHV0b3JpYWwoKTtcbiAgfVxuICAvLyBGcmVlIHBsYXkgYW5kIGRlZmF1bHQ6IG5vIHN5c3RlbXMgbW91bnRlZFxuXG4gIGNvbm5lY3RXZWJTb2NrZXQoe1xuICAgIHJvb20sXG4gICAgc3RhdGUsXG4gICAgYnVzLFxuICAgIG1hcFcsXG4gICAgbWFwSCxcbiAgICBvblN0YXRlVXBkYXRlZDogKCkgPT4gZ2FtZS5vblN0YXRlVXBkYXRlZCgpLFxuICAgIG9uT3BlbjogKCkgPT4ge1xuICAgICAgY29uc3QgbmFtZVRvU2VuZCA9IGNhbGxTaWduIHx8IHNhbml0aXplQ2FsbFNpZ24ocmVhZFN0b3JlZENhbGxTaWduKCkpO1xuICAgICAgaWYgKG5hbWVUb1NlbmQpIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJqb2luXCIsIG5hbWU6IG5hbWVUb1NlbmQgfSk7XG4gICAgfSxcbiAgfSk7XG5cbiAgLy8gT3B0aW9uYWw6IHN1c3BlbmQvcmVzdW1lIGF1ZGlvIG9uIHRhYiB2aXNpYmlsaXR5IHRvIHNhdmUgQ1BVXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ2aXNpYmlsaXR5Y2hhbmdlXCIsICgpID0+IHtcbiAgICBpZiAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSBcImhpZGRlblwiKSB7XG4gICAgICB2b2lkIGVuZ2luZS5zdXNwZW5kKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZvaWQgZW5naW5lLnJlc3VtZSgpO1xuICAgIH1cbiAgfSk7XG59KSgpO1xuXG5mdW5jdGlvbiBzYW5pdGl6ZUNhbGxTaWduKHZhbHVlOiBzdHJpbmcgfCBudWxsKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkgcmV0dXJuIFwiXCI7XG4gIGNvbnN0IHRyaW1tZWQgPSB2YWx1ZS50cmltKCk7XG4gIGlmICghdHJpbW1lZCkgcmV0dXJuIFwiXCI7XG4gIHJldHVybiB0cmltbWVkLnNsaWNlKDAsIDI0KTtcbn1cblxuZnVuY3Rpb24gcGVyc2lzdENhbGxTaWduKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICB0cnkge1xuICAgIGlmIChuYW1lKSB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZLCBuYW1lKTtcbiAgICBlbHNlIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVkpO1xuICB9IGNhdGNoIHt9XG59XG5cbmZ1bmN0aW9uIHJlYWRTdG9yZWRDYWxsU2lnbigpOiBzdHJpbmcge1xuICB0cnkgeyByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSkgPz8gXCJcIjsgfVxuICBjYXRjaCB7IHJldHVybiBcIlwiOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFpRU8sV0FBUyxpQkFBMkI7QUFDekMsVUFBTSxXQUFXLG9CQUFJLElBQTZCO0FBQ2xELFdBQU87QUFBQSxNQUNMLEdBQUcsT0FBTyxTQUFTO0FBQ2pCLFlBQUksTUFBTSxTQUFTLElBQUksS0FBSztBQUM1QixZQUFJLENBQUMsS0FBSztBQUNSLGdCQUFNLG9CQUFJLElBQUk7QUFDZCxtQkFBUyxJQUFJLE9BQU8sR0FBRztBQUFBLFFBQ3pCO0FBQ0EsWUFBSSxJQUFJLE9BQU87QUFDZixlQUFPLE1BQU0sSUFBSyxPQUFPLE9BQU87QUFBQSxNQUNsQztBQUFBLE1BQ0EsS0FBSyxPQUFpQixTQUFtQjtBQUN2QyxjQUFNLE1BQU0sU0FBUyxJQUFJLEtBQUs7QUFDOUIsWUFBSSxDQUFDLE9BQU8sSUFBSSxTQUFTLEVBQUc7QUFDNUIsbUJBQVcsTUFBTSxLQUFLO0FBQ3BCLGNBQUk7QUFDRixZQUFDLEdBQWlDLE9BQU87QUFBQSxVQUMzQyxTQUFTLEtBQUs7QUFDWixvQkFBUSxNQUFNLHFCQUFxQixLQUFLLFdBQVcsR0FBRztBQUFBLFVBQ3hEO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjs7O0FDdkZPLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sbUJB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cEUsWUFBSSxXQUFZLGFBQVksRUFBRSxNQUFNLFFBQVEsTUFBTSxXQUFXLENBQUM7QUFBQSxNQUNoRTtBQUFBLElBQ0YsQ0FBQztBQUdELGFBQVMsaUJBQWlCLG9CQUFvQixNQUFNO0FBQ2xELFVBQUksU0FBUyxvQkFBb0IsVUFBVTtBQUN6QyxhQUFLLE9BQU8sUUFBUTtBQUFBLE1BQ3RCLE9BQU87QUFDTCxhQUFLLE9BQU8sT0FBTztBQUFBLE1BQ3JCO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSCxHQUFHO0FBRUgsV0FBUyxpQkFBaUIsT0FBOEI7QUFDdEQsUUFBSSxDQUFDLE1BQU8sUUFBTztBQUNuQixVQUFNLFVBQVUsTUFBTSxLQUFLO0FBQzNCLFFBQUksQ0FBQyxRQUFTLFFBQU87QUFDckIsV0FBTyxRQUFRLE1BQU0sR0FBRyxFQUFFO0FBQUEsRUFDNUI7QUFFQSxXQUFTLGdCQUFnQixNQUFvQjtBQUMzQyxRQUFJO0FBQ0YsVUFBSSxLQUFNLFFBQU8sYUFBYSxRQUFRLHVCQUF1QixJQUFJO0FBQUEsVUFDNUQsUUFBTyxhQUFhLFdBQVcscUJBQXFCO0FBQUEsSUFDM0QsU0FBUTtBQUFBLElBQUM7QUFBQSxFQUNYO0FBRUEsV0FBUyxxQkFBNkI7QUFuSXRDO0FBb0lFLFFBQUk7QUFBRSxjQUFPLFlBQU8sYUFBYSxRQUFRLHFCQUFxQixNQUFqRCxZQUFzRDtBQUFBLElBQUksU0FDakU7QUFBRSxhQUFPO0FBQUEsSUFBSTtBQUFBLEVBQ3JCOyIsCiAgIm5hbWVzIjogWyJfYSIsICJTVFlMRV9JRCIsICJlbnN1cmVTdHlsZXMiLCAiY2hvaWNlIiwgIl9hIiwgIlNUT1JBR0VfUFJFRklYIiwgImdldFN0b3JhZ2UiLCAiY3R4IiwgImN0eCIsICJjbGFtcCIsICJjaG9pY2UiLCAiX2EiLCAiY3R4IiwgInJlc3VtZUF1ZGlvIiwgImN0eCJdCn0K
