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
    heatBarPlanned = document.getElementById("heat-bar-planned");
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
        updatePlannedHeatBar();
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
    updatePlannedHeatBar();
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
    updatePlannedHeatBar();
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
  function updatePlannedHeatBar() {
    const ship = stateRef.me;
    const plannedEl = heatBarPlanned;
    if (!ship || !ship.heat || !plannedEl) return;
    const planned = projectPlannedHeat(ship);
    const percent = planned / ship.heat.max * 100;
    plannedEl.style.width = `${Math.max(0, Math.min(100, percent))}%`;
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
    var _a;
    const heat = (_a = stateRef.me) == null ? void 0 : _a.heat;
    if (!heat || !speedMarker || !shipSpeedSlider) return;
    const min = parseFloat(shipSpeedSlider.min);
    const max = parseFloat(shipSpeedSlider.max);
    const markerSpeed = heat.markerSpeed;
    const percent = (markerSpeed - min) / (max - min) * 100;
    const clamped = Math.max(0, Math.min(100, percent));
    speedMarker.style.left = `${clamped}%`;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS50cyIsICJzcmMvdHV0b3JpYWwvaGlnaGxpZ2h0LnRzIiwgInNyYy90dXRvcmlhbC9zdG9yYWdlLnRzIiwgInNyYy90dXRvcmlhbC9yb2xlcy50cyIsICJzcmMvdHV0b3JpYWwvZW5naW5lLnRzIiwgInNyYy90dXRvcmlhbC9zdGVwc19iYXNpYy50cyIsICJzcmMvdHV0b3JpYWwvaW5kZXgudHMiLCAic3JjL3N0b3J5L292ZXJsYXkudHMiLCAic3JjL3N0b3J5L3N0b3JhZ2UudHMiLCAic3JjL2F1ZGlvL2VuZ2luZS50cyIsICJzcmMvYXVkaW8vZ3JhcGgudHMiLCAic3JjL2F1ZGlvL3NmeC50cyIsICJzcmMvc3Rvcnkvc2Z4LnRzIiwgInNyYy9zdG9yeS9lbmdpbmUudHMiLCAic3JjL3N0b3J5L2NoYXB0ZXJzL2ludHJvLnRzIiwgInNyYy9zdG9yeS9pbmRleC50cyIsICJzcmMvc3RhcnQtZ2F0ZS50cyIsICJzcmMvYXVkaW8vbXVzaWMvc2NlbmVzL2FtYmllbnQudHMiLCAic3JjL2F1ZGlvL211c2ljL2luZGV4LnRzIiwgInNyYy9hdWRpby9jdWVzLnRzIiwgInNyYy9tYWluLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgdHlwZSBTaGlwQ29udGV4dCA9IFwic2hpcFwiIHwgXCJtaXNzaWxlXCI7XG5leHBvcnQgdHlwZSBTaGlwVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcbmV4cG9ydCB0eXBlIE1pc3NpbGVUb29sID0gXCJzZXRcIiB8IFwic2VsZWN0XCIgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50TWFwIHtcbiAgXCJjb250ZXh0OmNoYW5nZWRcIjogeyBjb250ZXh0OiBTaGlwQ29udGV4dCB9O1xuICBcInNoaXA6dG9vbENoYW5nZWRcIjogeyB0b29sOiBTaGlwVG9vbCB9O1xuICBcInNoaXA6d2F5cG9pbnRBZGRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6bGF1bmNoZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiOiB7IHNlY29uZHNSZW1haW5pbmc6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiOiB2b2lkO1xuICBcImhlbHA6dmlzaWJsZUNoYW5nZWRcIjogeyB2aXNpYmxlOiBib29sZWFuIH07XG4gIFwic3RhdGU6dXBkYXRlZFwiOiB2b2lkO1xuICBcInR1dG9yaWFsOnN0YXJ0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIjogeyBpZDogc3RyaW5nOyBzdGVwSW5kZXg6IG51bWJlcjsgdG90YWw6IG51bWJlciB9O1xuICBcInR1dG9yaWFsOmNvbXBsZXRlZFwiOiB7IGlkOiBzdHJpbmcgfTtcbiAgXCJ0dXRvcmlhbDpza2lwcGVkXCI6IHsgaWQ6IHN0cmluZzsgYXRTdGVwOiBudW1iZXIgfTtcbiAgXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIjogdm9pZDtcbiAgXCJkaWFsb2d1ZTpvcGVuZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjbG9zZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjaG9pY2VcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hvaWNlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJzdG9yeTpmbGFnVXBkYXRlZFwiOiB7IGZsYWc6IHN0cmluZzsgdmFsdWU6IGJvb2xlYW4gfTtcbiAgXCJzdG9yeTpwcm9ncmVzc2VkXCI6IHsgY2hhcHRlcklkOiBzdHJpbmc7IG5vZGVJZDogc3RyaW5nIH07XG4gIFwiYXVkaW86cmVzdW1lXCI6IHZvaWQ7XG4gIFwiYXVkaW86bXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnVubXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiOiB7IGdhaW46IG51bWJlciB9O1xuICBcImF1ZGlvOnNmeFwiOiB7IG5hbWU6IFwidWlcIiB8IFwibGFzZXJcIiB8IFwidGhydXN0XCIgfCBcImV4cGxvc2lvblwiIHwgXCJsb2NrXCIgfCBcImRpYWxvZ3VlXCI7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIjogeyBzY2VuZTogXCJhbWJpZW50XCIgfCBcImNvbWJhdFwiIHwgXCJsb2JieVwiOyBzZWVkPzogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6cGFyYW1cIjogeyBrZXk6IHN0cmluZzsgdmFsdWU6IG51bWJlciB9OyAgICAgICAgICAgICAgIFxuICBcImF1ZGlvOm11c2ljOnRyYW5zcG9ydFwiOiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfTtcbn1cblxuZXhwb3J0IHR5cGUgRXZlbnRLZXkgPSBrZXlvZiBFdmVudE1hcDtcbmV4cG9ydCB0eXBlIEV2ZW50UGF5bG9hZDxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gRXZlbnRNYXBbS107XG5leHBvcnQgdHlwZSBIYW5kbGVyPEsgZXh0ZW5kcyBFdmVudEtleT4gPSAocGF5bG9hZDogRXZlbnRQYXlsb2FkPEs+KSA9PiB2b2lkO1xuXG50eXBlIFZvaWRLZXlzID0ge1xuICBbSyBpbiBFdmVudEtleV06IEV2ZW50TWFwW0tdIGV4dGVuZHMgdm9pZCA/IEsgOiBuZXZlclxufVtFdmVudEtleV07XG5cbnR5cGUgTm9uVm9pZEtleXMgPSBFeGNsdWRlPEV2ZW50S2V5LCBWb2lkS2V5cz47XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnRCdXMge1xuICBvbjxLIGV4dGVuZHMgRXZlbnRLZXk+KGV2ZW50OiBLLCBoYW5kbGVyOiBIYW5kbGVyPEs+KTogKCkgPT4gdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgTm9uVm9pZEtleXM+KGV2ZW50OiBLLCBwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pOiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBWb2lkS2V5cz4oZXZlbnQ6IEspOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXZlbnRCdXMoKTogRXZlbnRCdXMge1xuICBjb25zdCBoYW5kbGVycyA9IG5ldyBNYXA8RXZlbnRLZXksIFNldDxGdW5jdGlvbj4+KCk7XG4gIHJldHVybiB7XG4gICAgb24oZXZlbnQsIGhhbmRsZXIpIHtcbiAgICAgIGxldCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQpIHtcbiAgICAgICAgc2V0ID0gbmV3IFNldCgpO1xuICAgICAgICBoYW5kbGVycy5zZXQoZXZlbnQsIHNldCk7XG4gICAgICB9XG4gICAgICBzZXQuYWRkKGhhbmRsZXIpO1xuICAgICAgcmV0dXJuICgpID0+IHNldCEuZGVsZXRlKGhhbmRsZXIpO1xuICAgIH0sXG4gICAgZW1pdChldmVudDogRXZlbnRLZXksIHBheWxvYWQ/OiB1bmtub3duKSB7XG4gICAgICBjb25zdCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQgfHwgc2V0LnNpemUgPT09IDApIHJldHVybjtcbiAgICAgIGZvciAoY29uc3QgZm4gb2Ygc2V0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgKGZuIGFzICh2YWx1ZT86IHVua25vd24pID0+IHZvaWQpKHBheWxvYWQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBbYnVzXSBoYW5kbGVyIGZvciAke2V2ZW50fSBmYWlsZWRgLCBlcnIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNoaXBDb250ZXh0LCBTaGlwVG9vbCwgTWlzc2lsZVRvb2wgfSBmcm9tIFwiLi9idXNcIjtcblxuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX1NQRUVEID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfU1BFRUQgPSAyNTA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fQUdSTyA9IDEwMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9MSUZFVElNRSA9IDEyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9MSUZFVElNRSA9IDIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSA9IDgwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiA9IDIwMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUxpbWl0cyB7XG4gIHNwZWVkTWluOiBudW1iZXI7XG4gIHNwZWVkTWF4OiBudW1iZXI7XG4gIGFncm9NaW46IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRWaWV3IHtcbiAgdmFsdWU6IG51bWJlcjtcbiAgbWF4OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIHN0YWxsVW50aWxNczogbnVtYmVyOyAvLyBjbGllbnQtc3luY2VkIHRpbWUgaW4gbWlsbGlzZWNvbmRzXG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaGlwU25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgaHA/OiBudW1iZXI7XG4gIGtpbGxzPzogbnVtYmVyO1xuICB3YXlwb2ludHM6IFdheXBvaW50W107XG4gIGhlYXQ/OiBIZWF0Vmlldztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHaG9zdFNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIHNlbGY/OiBib29sZWFuO1xuICBhZ3JvX3JhZGl1czogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVSb3V0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgd2F5cG9pbnRzOiBNaXNzaWxlV2F5cG9pbnRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlQ29uZmlnIHtcbiAgc3BlZWQ6IG51bWJlcjtcbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuICBsaWZldGltZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWV0YSB7XG4gIGM/OiBudW1iZXI7XG4gIHc/OiBudW1iZXI7XG4gIGg/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBwU3RhdGUge1xuICBub3c6IG51bWJlcjtcbiAgbm93U3luY2VkQXQ6IG51bWJlcjtcbiAgbWU6IFNoaXBTbmFwc2hvdCB8IG51bGw7XG4gIGdob3N0czogR2hvc3RTbmFwc2hvdFtdO1xuICBtaXNzaWxlczogTWlzc2lsZVNuYXBzaG90W107XG4gIG1pc3NpbGVSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdO1xuICBhY3RpdmVNaXNzaWxlUm91dGVJZDogc3RyaW5nIHwgbnVsbDtcbiAgbmV4dE1pc3NpbGVSZWFkeUF0OiBudW1iZXI7XG4gIG1pc3NpbGVDb25maWc6IE1pc3NpbGVDb25maWc7XG4gIG1pc3NpbGVMaW1pdHM6IE1pc3NpbGVMaW1pdHM7XG4gIHdvcmxkTWV0YTogV29ybGRNZXRhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlbGVjdGlvbiB7XG4gIHR5cGU6IFwid2F5cG9pbnRcIiB8IFwibGVnXCI7XG4gIGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVNlbGVjdGlvbiB7XG4gIHR5cGU6IFwid2F5cG9pbnRcIjtcbiAgaW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgQWN0aXZlVG9vbCA9XG4gIHwgXCJzaGlwLXNldFwiXG4gIHwgXCJzaGlwLXNlbGVjdFwiXG4gIHwgXCJtaXNzaWxlLXNldFwiXG4gIHwgXCJtaXNzaWxlLXNlbGVjdFwiXG4gIHwgbnVsbDtcblxuZXhwb3J0IGludGVyZmFjZSBVSVN0YXRlIHtcbiAgaW5wdXRDb250ZXh0OiBTaGlwQ29udGV4dDtcbiAgc2hpcFRvb2w6IFNoaXBUb29sO1xuICBtaXNzaWxlVG9vbDogTWlzc2lsZVRvb2w7XG4gIGFjdGl2ZVRvb2w6IEFjdGl2ZVRvb2w7XG4gIHNob3dTaGlwUm91dGU6IGJvb2xlYW47XG4gIGhlbHBWaXNpYmxlOiBib29sZWFuO1xuICB6b29tOiBudW1iZXI7XG4gIHBhblg6IG51bWJlcjtcbiAgcGFuWTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFVJU3RhdGUoKTogVUlTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgaW5wdXRDb250ZXh0OiBcInNoaXBcIixcbiAgICBzaGlwVG9vbDogXCJzZXRcIixcbiAgICBtaXNzaWxlVG9vbDogbnVsbCxcbiAgICBhY3RpdmVUb29sOiBcInNoaXAtc2V0XCIsXG4gICAgc2hvd1NoaXBSb3V0ZTogdHJ1ZSxcbiAgICBoZWxwVmlzaWJsZTogZmFsc2UsXG4gICAgem9vbTogMS4wLFxuICAgIHBhblg6IDAsXG4gICAgcGFuWTogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxTdGF0ZShsaW1pdHM6IE1pc3NpbGVMaW1pdHMgPSB7XG4gIHNwZWVkTWluOiBNSVNTSUxFX01JTl9TUEVFRCxcbiAgc3BlZWRNYXg6IE1JU1NJTEVfTUFYX1NQRUVELFxuICBhZ3JvTWluOiBNSVNTSUxFX01JTl9BR1JPLFxufSk6IEFwcFN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBub3c6IDAsXG4gICAgbm93U3luY2VkQXQ6IHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSBcImZ1bmN0aW9uXCJcbiAgICAgID8gcGVyZm9ybWFuY2Uubm93KClcbiAgICAgIDogRGF0ZS5ub3coKSxcbiAgICBtZTogbnVsbCxcbiAgICBnaG9zdHM6IFtdLFxuICAgIG1pc3NpbGVzOiBbXSxcbiAgICBtaXNzaWxlUm91dGVzOiBbXSxcbiAgICBhY3RpdmVNaXNzaWxlUm91dGVJZDogbnVsbCxcbiAgICBuZXh0TWlzc2lsZVJlYWR5QXQ6IDAsXG4gICAgbWlzc2lsZUNvbmZpZzoge1xuICAgICAgc3BlZWQ6IDE4MCxcbiAgICAgIGFncm9SYWRpdXM6IDgwMCxcbiAgICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IoMTgwLCA4MDAsIGxpbWl0cyksXG4gICAgfSxcbiAgICBtaXNzaWxlTGltaXRzOiBsaW1pdHMsXG4gICAgd29ybGRNZXRhOiB7fSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pc3NpbGVMaWZldGltZUZvcihzcGVlZDogbnVtYmVyLCBhZ3JvUmFkaXVzOiBudW1iZXIsIGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogbnVtYmVyIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBzcGFuID0gbWF4U3BlZWQgLSBtaW5TcGVlZDtcbiAgY29uc3Qgc3BlZWROb3JtID0gc3BhbiA+IDAgPyBjbGFtcCgoc3BlZWQgLSBtaW5TcGVlZCkgLyBzcGFuLCAwLCAxKSA6IDA7XG4gIGNvbnN0IGFkanVzdGVkQWdybyA9IE1hdGgubWF4KDAsIGFncm9SYWRpdXMgLSBtaW5BZ3JvKTtcbiAgY29uc3QgYWdyb05vcm0gPSBjbGFtcChhZGp1c3RlZEFncm8gLyBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUkVGLCAwLCAxKTtcbiAgY29uc3QgcmVkdWN0aW9uID0gc3BlZWROb3JtICogTUlTU0lMRV9MSUZFVElNRV9TUEVFRF9QRU5BTFRZICsgYWdyb05vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUEVOQUxUWTtcbiAgY29uc3QgYmFzZSA9IE1JU1NJTEVfTUFYX0xJRkVUSU1FO1xuICByZXR1cm4gY2xhbXAoYmFzZSAtIHJlZHVjdGlvbiwgTUlTU0lMRV9NSU5fTElGRVRJTUUsIE1JU1NJTEVfTUFYX0xJRkVUSU1FKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplTWlzc2lsZUNvbmZpZyhcbiAgY2ZnOiBQYXJ0aWFsPFBpY2s8TWlzc2lsZUNvbmZpZywgXCJzcGVlZFwiIHwgXCJhZ3JvUmFkaXVzXCI+PixcbiAgZmFsbGJhY2s6IE1pc3NpbGVDb25maWcsXG4gIGxpbWl0czogTWlzc2lsZUxpbWl0cyxcbik6IE1pc3NpbGVDb25maWcge1xuICBjb25zdCBtaW5TcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluIDogTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXggOiBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgbWluQWdybyA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiA6IE1JU1NJTEVfTUlOX0FHUk87XG4gIGNvbnN0IGJhc2UgPSBmYWxsYmFjayA/PyB7XG4gICAgc3BlZWQ6IG1pblNwZWVkLFxuICAgIGFncm9SYWRpdXM6IG1pbkFncm8sXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihtaW5TcGVlZCwgbWluQWdybywgbGltaXRzKSxcbiAgfTtcbiAgY29uc3QgbWVyZ2VkU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUoY2ZnLnNwZWVkID8/IGJhc2Uuc3BlZWQpID8gKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA6IGJhc2Uuc3BlZWQ7XG4gIGNvbnN0IG1lcmdlZEFncm8gPSBOdW1iZXIuaXNGaW5pdGUoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA/IChjZmcuYWdyb1JhZGl1cyA/PyBiYXNlLmFncm9SYWRpdXMpIDogYmFzZS5hZ3JvUmFkaXVzO1xuICBjb25zdCBzcGVlZCA9IGNsYW1wKG1lcmdlZFNwZWVkLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICBjb25zdCBhZ3JvUmFkaXVzID0gTWF0aC5tYXgobWluQWdybywgbWVyZ2VkQWdybyk7XG4gIHJldHVybiB7XG4gICAgc3BlZWQsXG4gICAgYWdyb1JhZGl1cyxcbiAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKHNwZWVkLCBhZ3JvUmFkaXVzLCBsaW1pdHMpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9ub3RvbmljTm93KCk6IG51bWJlciB7XG4gIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICB9XG4gIHJldHVybiBEYXRlLm5vdygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVXYXlwb2ludExpc3QobGlzdDogV2F5cG9pbnRbXSB8IHVuZGVmaW5lZCB8IG51bGwpOiBXYXlwb2ludFtdIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3QpKSByZXR1cm4gW107XG4gIHJldHVybiBsaXN0Lm1hcCgod3ApID0+ICh7IC4uLndwIH0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGU6IEFwcFN0YXRlLCBsaW1pdHM6IFBhcnRpYWw8TWlzc2lsZUxpbWl0cz4pOiB2b2lkIHtcbiAgc3RhdGUubWlzc2lsZUxpbWl0cyA9IHtcbiAgICBzcGVlZE1pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4hIDogc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1pbixcbiAgICBzcGVlZE1heDogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXghIDogc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCxcbiAgICBhZ3JvTWluOiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4hIDogc3RhdGUubWlzc2lsZUxpbWl0cy5hZ3JvTWluLFxuICB9O1xufVxuIiwgImltcG9ydCB7IHR5cGUgRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7XG4gIHR5cGUgQXBwU3RhdGUsXG4gIHR5cGUgTWlzc2lsZVJvdXRlLFxuICBtb25vdG9uaWNOb3csXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbiAgdXBkYXRlTWlzc2lsZUxpbWl0cyxcbn0gZnJvbSBcIi4vc3RhdGVcIjtcblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVJvdXRlIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZT86IHN0cmluZztcbiAgd2F5cG9pbnRzPzogU2VydmVyTWlzc2lsZVdheXBvaW50W107XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJIZWF0VmlldyB7XG4gIHY6IG51bWJlcjsgIC8vIGN1cnJlbnQgaGVhdCB2YWx1ZVxuICBtOiBudW1iZXI7ICAvLyBtYXhcbiAgdzogbnVtYmVyOyAgLy8gd2FybkF0XG4gIG86IG51bWJlcjsgIC8vIG92ZXJoZWF0QXRcbiAgbXM6IG51bWJlcjsgLy8gbWFya2VyU3BlZWRcbiAgc3U6IG51bWJlcjsgLy8gc3RhbGxVbnRpbCAoc2VydmVyIHRpbWUgc2Vjb25kcylcbiAga3U6IG51bWJlcjsgLy8ga1VwXG4gIGtkOiBudW1iZXI7IC8vIGtEb3duXG4gIGV4OiBudW1iZXI7IC8vIGV4cFxufVxuXG5pbnRlcmZhY2UgU2VydmVyU2hpcFN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIGhwPzogbnVtYmVyO1xuICBraWxscz86IG51bWJlcjtcbiAgd2F5cG9pbnRzPzogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgc3BlZWQ/OiBudW1iZXIgfT47XG4gIGhlYXQ/OiBTZXJ2ZXJIZWF0Vmlldztcbn1cblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVTdGF0ZSB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlclN0YXRlTWVzc2FnZSB7XG4gIHR5cGU6IFwic3RhdGVcIjtcbiAgbm93OiBudW1iZXI7XG4gIG5leHRfbWlzc2lsZV9yZWFkeT86IG51bWJlcjtcbiAgbWU/OiBTZXJ2ZXJTaGlwU3RhdGUgfCBudWxsO1xuICBnaG9zdHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB2eDogbnVtYmVyOyB2eTogbnVtYmVyIH0+O1xuICBtaXNzaWxlcz86IFNlcnZlck1pc3NpbGVTdGF0ZVtdO1xuICBtaXNzaWxlX3JvdXRlcz86IFNlcnZlck1pc3NpbGVSb3V0ZVtdO1xuICBtaXNzaWxlX2NvbmZpZz86IHtcbiAgICBzcGVlZD86IG51bWJlcjtcbiAgICBzcGVlZF9taW4/OiBudW1iZXI7XG4gICAgc3BlZWRfbWF4PzogbnVtYmVyO1xuICAgIGFncm9fcmFkaXVzPzogbnVtYmVyO1xuICAgIGFncm9fbWluPzogbnVtYmVyO1xuICAgIGxpZmV0aW1lPzogbnVtYmVyO1xuICB9IHwgbnVsbDtcbiAgYWN0aXZlX21pc3NpbGVfcm91dGU/OiBzdHJpbmcgfCBudWxsO1xuICBtZXRhPzoge1xuICAgIGM/OiBudW1iZXI7XG4gICAgdz86IG51bWJlcjtcbiAgICBoPzogbnVtYmVyO1xuICB9O1xufVxuXG5pbnRlcmZhY2UgQ29ubmVjdE9wdGlvbnMge1xuICByb29tOiBzdHJpbmc7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb25TdGF0ZVVwZGF0ZWQ/OiAoKSA9PiB2b2lkO1xuICBvbk9wZW4/OiAoc29ja2V0OiBXZWJTb2NrZXQpID0+IHZvaWQ7XG4gIG1hcFc/OiBudW1iZXI7XG4gIG1hcEg/OiBudW1iZXI7XG59XG5cbmxldCB3czogV2ViU29ja2V0IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZCB7XG4gIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHJldHVybjtcbiAgY29uc3QgZGF0YSA9IHR5cGVvZiBwYXlsb2FkID09PSBcInN0cmluZ1wiID8gcGF5bG9hZCA6IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpO1xuICB3cy5zZW5kKGRhdGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdFdlYlNvY2tldCh7IHJvb20sIHN0YXRlLCBidXMsIG9uU3RhdGVVcGRhdGVkLCBvbk9wZW4sIG1hcFcsIG1hcEggfTogQ29ubmVjdE9wdGlvbnMpOiB2b2lkIHtcbiAgY29uc3QgcHJvdG9jb2wgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgPyBcIndzczovL1wiIDogXCJ3czovL1wiO1xuICBsZXQgd3NVcmwgPSBgJHtwcm90b2NvbH0ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fS93cz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb20pfWA7XG4gIGlmIChtYXBXICYmIG1hcFcgPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBXPSR7bWFwV31gO1xuICB9XG4gIGlmIChtYXBIICYmIG1hcEggPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBIPSR7bWFwSH1gO1xuICB9XG4gIHdzID0gbmV3IFdlYlNvY2tldCh3c1VybCk7XG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJvcGVuXCIsICgpID0+IHtcbiAgICBjb25zb2xlLmxvZyhcIlt3c10gb3BlblwiKTtcbiAgICBjb25zdCBzb2NrZXQgPSB3cztcbiAgICBpZiAoc29ja2V0ICYmIG9uT3Blbikge1xuICAgICAgb25PcGVuKHNvY2tldCk7XG4gICAgfVxuICB9KTtcbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcImNsb3NlXCIsICgpID0+IGNvbnNvbGUubG9nKFwiW3dzXSBjbG9zZVwiKSk7XG5cbiAgbGV0IHByZXZSb3V0ZXMgPSBuZXcgTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPigpO1xuICBsZXQgcHJldkFjdGl2ZVJvdXRlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IHByZXZNaXNzaWxlQ291bnQgPSAwO1xuXG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IGRhdGEgPSBzYWZlUGFyc2UoZXZlbnQuZGF0YSk7XG4gICAgaWYgKCFkYXRhIHx8IGRhdGEudHlwZSAhPT0gXCJzdGF0ZVwiKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGhhbmRsZVN0YXRlTWVzc2FnZShzdGF0ZSwgZGF0YSwgYnVzLCBwcmV2Um91dGVzLCBwcmV2QWN0aXZlUm91dGUsIHByZXZNaXNzaWxlQ291bnQpO1xuICAgIHByZXZSb3V0ZXMgPSBuZXcgTWFwKHN0YXRlLm1pc3NpbGVSb3V0ZXMubWFwKChyb3V0ZSkgPT4gW3JvdXRlLmlkLCBjbG9uZVJvdXRlKHJvdXRlKV0pKTtcbiAgICBwcmV2QWN0aXZlUm91dGUgPSBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZDtcbiAgICBwcmV2TWlzc2lsZUNvdW50ID0gc3RhdGUubWlzc2lsZXMubGVuZ3RoO1xuICAgIGJ1cy5lbWl0KFwic3RhdGU6dXBkYXRlZFwiKTtcbiAgICBvblN0YXRlVXBkYXRlZD8uKCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTdGF0ZU1lc3NhZ2UoXG4gIHN0YXRlOiBBcHBTdGF0ZSxcbiAgbXNnOiBTZXJ2ZXJTdGF0ZU1lc3NhZ2UsXG4gIGJ1czogRXZlbnRCdXMsXG4gIHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sXG4gIHByZXZBY3RpdmVSb3V0ZTogc3RyaW5nIHwgbnVsbCxcbiAgcHJldk1pc3NpbGVDb3VudDogbnVtYmVyLFxuKTogdm9pZCB7XG4gIHN0YXRlLm5vdyA9IG1zZy5ub3c7XG4gIHN0YXRlLm5vd1N5bmNlZEF0ID0gbW9ub3RvbmljTm93KCk7XG4gIHN0YXRlLm5leHRNaXNzaWxlUmVhZHlBdCA9IE51bWJlci5pc0Zpbml0ZShtc2cubmV4dF9taXNzaWxlX3JlYWR5KSA/IG1zZy5uZXh0X21pc3NpbGVfcmVhZHkhIDogMDtcbiAgc3RhdGUubWUgPSBtc2cubWUgPyB7XG4gICAgeDogbXNnLm1lLngsXG4gICAgeTogbXNnLm1lLnksXG4gICAgdng6IG1zZy5tZS52eCxcbiAgICB2eTogbXNnLm1lLnZ5LFxuICAgIGhwOiBtc2cubWUuaHAsXG4gICAga2lsbHM6IG1zZy5tZS5raWxscyA/PyAwLFxuICAgIHdheXBvaW50czogQXJyYXkuaXNBcnJheShtc2cubWUud2F5cG9pbnRzKVxuICAgICAgPyBtc2cubWUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7IHg6IHdwLngsIHk6IHdwLnksIHNwZWVkOiBOdW1iZXIuaXNGaW5pdGUod3Auc3BlZWQpID8gd3Auc3BlZWQhIDogMTgwIH0pKVxuICAgICAgOiBbXSxcbiAgICBoZWF0OiBtc2cubWUuaGVhdCA/IGNvbnZlcnRIZWF0Vmlldyhtc2cubWUuaGVhdCwgc3RhdGUubm93U3luY2VkQXQsIHN0YXRlLm5vdykgOiB1bmRlZmluZWQsXG4gIH0gOiBudWxsO1xuICBzdGF0ZS5naG9zdHMgPSBBcnJheS5pc0FycmF5KG1zZy5naG9zdHMpID8gbXNnLmdob3N0cy5zbGljZSgpIDogW107XG4gIHN0YXRlLm1pc3NpbGVzID0gQXJyYXkuaXNBcnJheShtc2cubWlzc2lsZXMpID8gbXNnLm1pc3NpbGVzLnNsaWNlKCkgOiBbXTtcblxuICBjb25zdCByb3V0ZXNGcm9tU2VydmVyID0gQXJyYXkuaXNBcnJheShtc2cubWlzc2lsZV9yb3V0ZXMpID8gbXNnLm1pc3NpbGVfcm91dGVzIDogW107XG4gIGNvbnN0IG5ld1JvdXRlczogTWlzc2lsZVJvdXRlW10gPSByb3V0ZXNGcm9tU2VydmVyLm1hcCgocm91dGUpID0+ICh7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUgfHwgcm91dGUuaWQgfHwgXCJSb3V0ZVwiLFxuICAgIHdheXBvaW50czogQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpXG4gICAgICA/IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyB4OiB3cC54LCB5OiB3cC55IH0pKVxuICAgICAgOiBbXSxcbiAgfSkpO1xuXG4gIGRpZmZSb3V0ZXMocHJldlJvdXRlcywgbmV3Um91dGVzLCBidXMpO1xuICBzdGF0ZS5taXNzaWxlUm91dGVzID0gbmV3Um91dGVzO1xuXG4gIGNvbnN0IG5leHRBY3RpdmUgPSB0eXBlb2YgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlID09PSBcInN0cmluZ1wiICYmIG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZS5sZW5ndGggPiAwXG4gICAgPyBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGVcbiAgICA6IG5ld1JvdXRlcy5sZW5ndGggPiAwXG4gICAgICA/IG5ld1JvdXRlc1swXS5pZFxuICAgICAgOiBudWxsO1xuICBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG5leHRBY3RpdmU7XG4gIGlmIChuZXh0QWN0aXZlICE9PSBwcmV2QWN0aXZlUm91dGUpIHtcbiAgICBidXMuZW1pdChcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsIHsgcm91dGVJZDogbmV4dEFjdGl2ZSA/PyBudWxsIH0pO1xuICB9XG5cbiAgaWYgKG1zZy5taXNzaWxlX2NvbmZpZykge1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21pbikgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9tYXgpIHx8IE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4pKSB7XG4gICAgICB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlLCB7XG4gICAgICAgIHNwZWVkTWluOiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluLFxuICAgICAgICBzcGVlZE1heDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCxcbiAgICAgICAgYWdyb01pbjogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fbWluLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyh7XG4gICAgICBzcGVlZDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkLFxuICAgICAgYWdyb1JhZGl1czogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fcmFkaXVzLFxuICAgIH0sIHN0YXRlLm1pc3NpbGVDb25maWcsIHN0YXRlLm1pc3NpbGVMaW1pdHMpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLmxpZmV0aW1lKSkge1xuICAgICAgc2FuaXRpemVkLmxpZmV0aW1lID0gbXNnLm1pc3NpbGVfY29uZmlnLmxpZmV0aW1lITtcbiAgICB9XG4gICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IHNhbml0aXplZDtcbiAgfVxuXG4gIGNvbnN0IG1ldGEgPSBtc2cubWV0YSA/PyB7fTtcbiAgY29uc3QgaGFzQyA9IHR5cGVvZiBtZXRhLmMgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuYyk7XG4gIGNvbnN0IGhhc1cgPSB0eXBlb2YgbWV0YS53ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLncpO1xuICBjb25zdCBoYXNIID0gdHlwZW9mIG1ldGEuaCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5oKTtcbiAgc3RhdGUud29ybGRNZXRhID0ge1xuICAgIGM6IGhhc0MgPyBtZXRhLmMhIDogc3RhdGUud29ybGRNZXRhLmMsXG4gICAgdzogaGFzVyA/IG1ldGEudyEgOiBzdGF0ZS53b3JsZE1ldGEudyxcbiAgICBoOiBoYXNIID8gbWV0YS5oISA6IHN0YXRlLndvcmxkTWV0YS5oLFxuICB9O1xuXG4gIGlmIChzdGF0ZS5taXNzaWxlcy5sZW5ndGggPiBwcmV2TWlzc2lsZUNvdW50KSB7XG4gICAgY29uc3QgYWN0aXZlUm91dGVJZCA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIGlmIChhY3RpdmVSb3V0ZUlkKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoZWRcIiwgeyByb3V0ZUlkOiBhY3RpdmVSb3V0ZUlkIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoZWRcIiwgeyByb3V0ZUlkOiBcIlwiIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNvb2xkb3duUmVtYWluaW5nID0gTWF0aC5tYXgoMCwgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlKSk7XG4gIGJ1cy5lbWl0KFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIiwgeyBzZWNvbmRzUmVtYWluaW5nOiBjb29sZG93blJlbWFpbmluZyB9KTtcbn1cblxuZnVuY3Rpb24gZGlmZlJvdXRlcyhwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LCBuZXh0Um91dGVzOiBNaXNzaWxlUm91dGVbXSwgYnVzOiBFdmVudEJ1cyk6IHZvaWQge1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3Qgcm91dGUgb2YgbmV4dFJvdXRlcykge1xuICAgIHNlZW4uYWRkKHJvdXRlLmlkKTtcbiAgICBjb25zdCBwcmV2ID0gcHJldlJvdXRlcy5nZXQocm91dGUuaWQpO1xuICAgIGlmICghcHJldikge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlQWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAocm91dGUubmFtZSAhPT0gcHJldi5uYW1lKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVSZW5hbWVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIG5hbWU6IHJvdXRlLm5hbWUgfSk7XG4gICAgfVxuICAgIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleDogcm91dGUud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfSBlbHNlIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoIDwgcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiBwcmV2LndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xuICAgIH1cbiAgICBpZiAocHJldi53YXlwb2ludHMubGVuZ3RoID4gMCAmJiByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IFtyb3V0ZUlkXSBvZiBwcmV2Um91dGVzKSB7XG4gICAgaWYgKCFzZWVuLmhhcyhyb3V0ZUlkKSkge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlRGVsZXRlZFwiLCB7IHJvdXRlSWQgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNsb25lUm91dGUocm91dGU6IE1pc3NpbGVSb3V0ZSk6IE1pc3NpbGVSb3V0ZSB7XG4gIHJldHVybiB7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUsXG4gICAgd2F5cG9pbnRzOiByb3V0ZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHsgLi4ud3AgfSkpLFxuICB9O1xufVxuXG5mdW5jdGlvbiBzYWZlUGFyc2UodmFsdWU6IHVua25vd24pOiBTZXJ2ZXJTdGF0ZU1lc3NhZ2UgfCBudWxsIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UodmFsdWUpIGFzIFNlcnZlclN0YXRlTWVzc2FnZTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS53YXJuKFwiW3dzXSBmYWlsZWQgdG8gcGFyc2UgbWVzc2FnZVwiLCBlcnIpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGU6IEFwcFN0YXRlKTogbnVtYmVyIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93KSkge1xuICAgIHJldHVybiAwO1xuICB9XG4gIGNvbnN0IHN5bmNlZEF0ID0gTnVtYmVyLmlzRmluaXRlKHN0YXRlLm5vd1N5bmNlZEF0KSA/IHN0YXRlLm5vd1N5bmNlZEF0IDogbnVsbDtcbiAgaWYgKCFzeW5jZWRBdCkge1xuICAgIHJldHVybiBzdGF0ZS5ub3c7XG4gIH1cbiAgY29uc3QgZWxhcHNlZE1zID0gbW9ub3RvbmljTm93KCkgLSBzeW5jZWRBdDtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZWxhcHNlZE1zKSB8fCBlbGFwc2VkTXMgPCAwKSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICByZXR1cm4gc3RhdGUubm93ICsgZWxhcHNlZE1zIC8gMTAwMDtcbn1cblxuZnVuY3Rpb24gY29udmVydEhlYXRWaWV3KHNlcnZlckhlYXQ6IFNlcnZlckhlYXRWaWV3LCBub3dTeW5jZWRBdE1zOiBudW1iZXIsIHNlcnZlck5vd1NlYzogbnVtYmVyKTogaW1wb3J0KFwiLi9zdGF0ZVwiKS5IZWF0VmlldyB7XG4gIC8vIENvbnZlcnQgc2VydmVyIHRpbWUgKHN0YWxsVW50aWwgaW4gc2Vjb25kcykgdG8gY2xpZW50IHRpbWUgKG1pbGxpc2Vjb25kcylcbiAgLy8gc3RhbGxVbnRpbCBpcyBhYnNvbHV0ZSBzZXJ2ZXIgdGltZSwgc28gd2UgbmVlZCB0byBjb252ZXJ0IGl0IHRvIGNsaWVudCB0aW1lXG4gIGNvbnN0IHNlcnZlclN0YWxsVW50aWxTZWMgPSBzZXJ2ZXJIZWF0LnN1O1xuICBjb25zdCBvZmZzZXRGcm9tTm93U2VjID0gc2VydmVyU3RhbGxVbnRpbFNlYyAtIHNlcnZlck5vd1NlYztcbiAgY29uc3Qgc3RhbGxVbnRpbE1zID0gbm93U3luY2VkQXRNcyArIChvZmZzZXRGcm9tTm93U2VjICogMTAwMCk7XG5cbiAgY29uc3QgaGVhdFZpZXcgPSB7XG4gICAgdmFsdWU6IHNlcnZlckhlYXQudixcbiAgICBtYXg6IHNlcnZlckhlYXQubSxcbiAgICB3YXJuQXQ6IHNlcnZlckhlYXQudyxcbiAgICBvdmVyaGVhdEF0OiBzZXJ2ZXJIZWF0Lm8sXG4gICAgbWFya2VyU3BlZWQ6IHNlcnZlckhlYXQubXMsXG4gICAgc3RhbGxVbnRpbE1zOiBzdGFsbFVudGlsTXMsXG4gICAga1VwOiBzZXJ2ZXJIZWF0Lmt1LFxuICAgIGtEb3duOiBzZXJ2ZXJIZWF0LmtkLFxuICAgIGV4cDogc2VydmVySGVhdC5leCxcbiAgfTtcbiAgcmV0dXJuIGhlYXRWaWV3O1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7IGdldEFwcHJveFNlcnZlck5vdywgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi9uZXRcIjtcbmltcG9ydCB7XG4gIHR5cGUgQWN0aXZlVG9vbCxcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIHR5cGUgTWlzc2lsZVNlbGVjdGlvbixcbiAgdHlwZSBTZWxlY3Rpb24sXG4gIHR5cGUgVUlTdGF0ZSxcbiAgY2xhbXAsXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbn0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7XG4gIE1JU1NJTEVfTUlOX1NQRUVELFxuICBNSVNTSUxFX01BWF9TUEVFRCxcbiAgTUlTU0lMRV9NSU5fQUdSTyxcbn0gZnJvbSBcIi4vc3RhdGVcIjtcblxuaW50ZXJmYWNlIEluaXRHYW1lT3B0aW9ucyB7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbn1cblxuaW50ZXJmYWNlIEdhbWVDb250cm9sbGVyIHtcbiAgb25TdGF0ZVVwZGF0ZWQoKTogdm9pZDtcbn1cblxubGV0IHN0YXRlUmVmOiBBcHBTdGF0ZTtcbmxldCB1aVN0YXRlUmVmOiBVSVN0YXRlO1xubGV0IGJ1c1JlZjogRXZlbnRCdXM7XG5cbmxldCBjdjogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCB8IG51bGwgPSBudWxsO1xubGV0IEhQc3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBraWxsc1NwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcENvbnRyb2xzQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwQ2xlYXJCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU2VsZWN0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBSb3V0ZXNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFJvdXRlTGVnOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBSb3V0ZVNwZWVkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IG1pc3NpbGVDb250cm9sc0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUFkZFJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVMYXVuY2hCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUxhdW5jaFRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUxhdW5jaEluZm86IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU2VsZWN0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUFncm9TbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb1ZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNwYXduQm90QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNwYXduQm90VGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IHJvdXRlUHJldkJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByb3V0ZU5leHRCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcm91dGVNZW51VG9nZ2xlOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJvdXRlTWVudTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByZW5hbWVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgZGVsZXRlTWlzc2lsZVJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlUm91dGVOYW1lTGFiZWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVJvdXRlQ291bnRMYWJlbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IGhlbHBUb2dnbGU6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVscE92ZXJsYXk6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVscENsb3NlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGhlbHBUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgaGVhdEJhckZpbGw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVhdEJhclBsYW5uZWQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVhdFZhbHVlVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzcGVlZE1hcmtlcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzdGFsbE92ZXJsYXk6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCBzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTZWxlY3Rpb246IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcbmxldCBkZWZhdWx0U3BlZWQgPSAxNTA7XG5sZXQgbGFzdExvb3BUczogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgbGFzdE1pc3NpbGVDb25maWdTZW50OiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5jb25zdCBsZWdEYXNoT2Zmc2V0cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5sZXQgbGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCA9IFwiXCI7XG5sZXQgbGFzdE1pc3NpbGVMYXVuY2hJbmZvSFRNTCA9IFwiXCI7XG5sZXQgbGFzdFRvdWNoRGlzdGFuY2U6IG51bWJlciB8IG51bGwgPSBudWxsO1xubGV0IHBlbmRpbmdUb3VjaFRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5sZXQgaXNQaW5jaGluZyA9IGZhbHNlO1xuXG5jb25zdCBNSU5fWk9PTSA9IDEuMDsgXG5jb25zdCBNQVhfWk9PTSA9IDMuMDtcblxuY29uc3QgSEVMUF9URVhUID0gW1xuICBcIlByaW1hcnkgTW9kZXNcIixcbiAgXCIgIDEgXHUyMDEzIFRvZ2dsZSBzaGlwIG5hdmlnYXRpb24gbW9kZVwiLFxuICBcIiAgMiBcdTIwMTMgVG9nZ2xlIG1pc3NpbGUgY29vcmRpbmF0aW9uIG1vZGVcIixcbiAgXCJcIixcbiAgXCJTaGlwIE5hdmlnYXRpb25cIixcbiAgXCIgIFQgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgIEMgXHUyMDEzIENsZWFyIGFsbCB3YXlwb2ludHNcIixcbiAgXCIgIFIgXHUyMDEzIFRvZ2dsZSBzaG93IHJvdXRlXCIsXG4gIFwiICBbIC8gXSBcdTIwMTMgQWRqdXN0IHdheXBvaW50IHNwZWVkXCIsXG4gIFwiICBTaGlmdCtbIC8gXSBcdTIwMTMgQ29hcnNlIHNwZWVkIGFkanVzdFwiLFxuICBcIiAgVGFiIC8gU2hpZnQrVGFiIFx1MjAxMyBDeWNsZSB3YXlwb2ludHNcIixcbiAgXCIgIERlbGV0ZSBcdTIwMTMgRGVsZXRlIGZyb20gc2VsZWN0ZWQgd2F5cG9pbnRcIixcbiAgXCJcIixcbiAgXCJNaXNzaWxlIENvb3JkaW5hdGlvblwiLFxuICBcIiAgTiBcdTIwMTMgQWRkIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gIFwiICBMIFx1MjAxMyBMYXVuY2ggbWlzc2lsZXNcIixcbiAgXCIgIEUgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgICwgLyAuIFx1MjAxMyBBZGp1c3QgYWdybyByYWRpdXNcIixcbiAgXCIgIDsgLyAnIFx1MjAxMyBBZGp1c3QgbWlzc2lsZSBzcGVlZFwiLFxuICBcIiAgU2hpZnQrc2xpZGVyIGtleXMgXHUyMDEzIENvYXJzZSBhZGp1c3RcIixcbiAgXCIgIERlbGV0ZSBcdTIwMTMgRGVsZXRlIHNlbGVjdGVkIG1pc3NpbGUgd2F5cG9pbnRcIixcbiAgXCJcIixcbiAgXCJNYXAgQ29udHJvbHNcIixcbiAgXCIgICsvLSBcdTIwMTMgWm9vbSBpbi9vdXRcIixcbiAgXCIgIEN0cmwrMCBcdTIwMTMgUmVzZXQgem9vbVwiLFxuICBcIiAgTW91c2Ugd2hlZWwgXHUyMDEzIFpvb20gYXQgY3Vyc29yXCIsXG4gIFwiICBQaW5jaCBcdTIwMTMgWm9vbSBvbiB0b3VjaCBkZXZpY2VzXCIsXG4gIFwiXCIsXG4gIFwiR2VuZXJhbFwiLFxuICBcIiAgPyBcdTIwMTMgVG9nZ2xlIHRoaXMgb3ZlcmxheVwiLFxuICBcIiAgRXNjIFx1MjAxMyBDYW5jZWwgc2VsZWN0aW9uIG9yIGNsb3NlIG92ZXJsYXlcIixcbl0uam9pbihcIlxcblwiKTtcblxuY29uc3Qgd29ybGQgPSB7IHc6IDgwMDAsIGg6IDQ1MDAgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRHYW1lKHsgc3RhdGUsIHVpU3RhdGUsIGJ1cyB9OiBJbml0R2FtZU9wdGlvbnMpOiBHYW1lQ29udHJvbGxlciB7XG4gIHN0YXRlUmVmID0gc3RhdGU7XG4gIHVpU3RhdGVSZWYgPSB1aVN0YXRlO1xuICBidXNSZWYgPSBidXM7XG5cbiAgY2FjaGVEb20oKTtcbiAgaWYgKCFjdikge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbnZhcyBlbGVtZW50ICNjdiBub3QgZm91bmRcIik7XG4gIH1cbiAgY3R4ID0gY3YuZ2V0Q29udGV4dChcIjJkXCIpO1xuXG4gIGJpbmRMaXN0ZW5lcnMoKTtcbiAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG5cbiAgcmV0dXJuIHtcbiAgICBvblN0YXRlVXBkYXRlZCgpIHtcbiAgICAgIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUoKTtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuICAgICAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNhY2hlRG9tKCk6IHZvaWQge1xuICBjdiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3ZcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBjdHggPSBjdj8uZ2V0Q29udGV4dChcIjJkXCIpID8/IG51bGw7XG4gIEhQc3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1ocFwiKTtcbiAgc2hpcENvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1jb250cm9sc1wiKTtcbiAgc2hpcENsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNsZWFyXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc2hpcFNldEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBSb3V0ZXNDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtcm91dGVzXCIpO1xuICBzaGlwUm91dGVMZWcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtcm91dGUtbGVnXCIpO1xuICBzaGlwUm91dGVTcGVlZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZS1zcGVlZFwiKTtcbiAgc2hpcERlbGV0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1kZWxldGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU3BlZWRDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLWNhcmRcIik7XG4gIHNoaXBTcGVlZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIHNoaXBTcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXZhbHVlXCIpO1xuXG4gIG1pc3NpbGVDb250cm9sc0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY29udHJvbHNcIik7XG4gIG1pc3NpbGVBZGRSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlTGF1bmNoQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVMYXVuY2hUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaC10ZXh0XCIpO1xuICBtaXNzaWxlTGF1bmNoSW5mbyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2gtaW5mb1wiKTtcbiAgbWlzc2lsZVNldEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVEZWxldGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtZGVsZXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVNwZWVkQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1jYXJkXCIpO1xuICBtaXNzaWxlU3BlZWRTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC12YWx1ZVwiKTtcbiAgbWlzc2lsZUFncm9DYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tY2FyZFwiKTtcbiAgbWlzc2lsZUFncm9TbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVBZ3JvVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby12YWx1ZVwiKTtcblxuICBzcGF3bkJvdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc3Bhd25Cb3RUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGF3bi1ib3QtdGV4dFwiKTtcbiAga2lsbHNTcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWtpbGxzXCIpO1xuICByb3V0ZVByZXZCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZU5leHRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW5leHRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZU1lbnVUb2dnbGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW1lbnUtdG9nZ2xlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVNZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51XCIpO1xuICByZW5hbWVNaXNzaWxlUm91dGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlbmFtZS1taXNzaWxlLXJvdXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWxldGUtbWlzc2lsZS1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2xlYXItbWlzc2lsZS13YXlwb2ludHNcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlUm91dGVOYW1lTGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtbmFtZVwiKTtcbiAgbWlzc2lsZVJvdXRlQ291bnRMYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1yb3V0ZS1jb3VudFwiKTtcblxuICBoZWxwVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGhlbHBPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLW92ZXJsYXlcIik7XG4gIGhlbHBDbG9zZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC1jbG9zZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGhlbHBUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRleHRcIik7XG5cbiAgaGVhdEJhckZpbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlYXQtYmFyLWZpbGxcIik7XG4gIGhlYXRCYXJQbGFubmVkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWF0LWJhci1wbGFubmVkXCIpO1xuICBoZWF0VmFsdWVUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWF0LXZhbHVlLXRleHRcIik7XG4gIHNwZWVkTWFya2VyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGVlZC1tYXJrZXJcIik7XG4gIHN0YWxsT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhbGwtb3ZlcmxheVwiKTtcblxuICBkZWZhdWx0U3BlZWQgPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlcj8udmFsdWUgPz8gXCIxNTBcIik7XG59XG5cbmZ1bmN0aW9uIGJpbmRMaXN0ZW5lcnMoKTogdm9pZCB7XG4gIGlmICghY3YpIHJldHVybjtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJkb3duXCIsIG9uQ2FudmFzUG9pbnRlckRvd24pO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwid2hlZWxcIiwgb25DYW52YXNXaGVlbCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgb25DYW52YXNUb3VjaFN0YXJ0LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIG9uQ2FudmFzVG91Y2hNb3ZlLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgb25DYW52YXNUb3VjaEVuZCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcblxuICBzcGF3bkJvdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBpZiAoc3Bhd25Cb3RCdG4uZGlzYWJsZWQpIHJldHVybjtcblxuICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJzcGF3bl9ib3RcIiB9KTtcbiAgICBidXNSZWYuZW1pdChcImJvdDpzcGF3blJlcXVlc3RlZFwiKTtcblxuICAgIC8vIERpc2FibGUgYnV0dG9uIGFuZCB1cGRhdGUgdGV4dFxuICAgIHNwYXduQm90QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICBpZiAoc3Bhd25Cb3RUZXh0KSB7XG4gICAgICBzcGF3bkJvdFRleHQudGV4dENvbnRlbnQgPSBcIlNwYXduZWRcIjtcbiAgICB9XG5cbiAgICAvLyBSZS1lbmFibGUgYWZ0ZXIgNSBzZWNvbmRzXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoc3Bhd25Cb3RCdG4pIHtcbiAgICAgICAgc3Bhd25Cb3RCdG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGlmIChzcGF3bkJvdFRleHQpIHtcbiAgICAgICAgc3Bhd25Cb3RUZXh0LnRleHRDb250ZW50ID0gXCJCb3RcIjtcbiAgICAgIH1cbiAgICB9LCA1MDAwKTtcbiAgfSk7XG5cbiAgc2hpcENsZWFyQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgY2xlYXJTaGlwUm91dGUoKTtcbiAgICBidXNSZWYuZW1pdChcInNoaXA6Y2xlYXJJbnZva2VkXCIpO1xuICB9KTtcblxuICBzaGlwU2V0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNldFwiKTtcbiAgfSk7XG5cbiAgc2hpcFNlbGVjdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZWxlY3RcIik7XG4gIH0pO1xuXG4gIHNoaXBTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVTcGVlZExhYmVsKHZhbHVlKTtcbiAgICBkZWZhdWx0U3BlZWQgPSB2YWx1ZTtcbiAgICBpZiAoc2VsZWN0aW9uICYmIHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSAmJiBzdGF0ZVJlZi5tZS53YXlwb2ludHNbc2VsZWN0aW9uLmluZGV4XSkge1xuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcInVwZGF0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4LCBzcGVlZDogdmFsdWUgfSk7XG4gICAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHNbc2VsZWN0aW9uLmluZGV4XS5zcGVlZCA9IHZhbHVlO1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgICB9XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBzaGlwRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZUFkZFJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF9taXNzaWxlX3JvdXRlXCIgfSk7XG4gIH0pO1xuXG4gIG1pc3NpbGVMYXVuY2hCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gIH0pO1xuXG4gIG1pc3NpbGVTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2VsZWN0XCIpO1xuICB9KTtcblxuICBtaXNzaWxlRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNwZWVkU2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHZhbHVlKSkgcmV0dXJuO1xuICAgIHVwZGF0ZU1pc3NpbGVDb25maWdGcm9tVUkoeyBzcGVlZDogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBtaXNzaWxlQWdyb1NsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKHsgYWdyb1JhZGl1czogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmFncm9DaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gIH0pO1xuXG4gIHJvdXRlUHJldkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKC0xKSk7XG4gIHJvdXRlTmV4dEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKDEpKTtcblxuICByb3V0ZU1lbnVUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGlmICghcm91dGVNZW51IHx8ICFyb3V0ZU1lbnUuY2xhc3NMaXN0LmNvbnRhaW5zKFwidmlzaWJsZVwiKSkgcmV0dXJuO1xuICAgIGlmIChldmVudC50YXJnZXQgPT09IHJvdXRlTWVudVRvZ2dsZSkgcmV0dXJuO1xuICAgIGlmIChyb3V0ZU1lbnUuY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpKSByZXR1cm47XG4gICAgcm91dGVNZW51LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICB9KTtcblxuICByZW5hbWVNaXNzaWxlUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUpIHJldHVybjtcbiAgICBjb25zdCBuYW1lID0gd2luZG93LnByb21wdChcIlJlbmFtZSByb3V0ZVwiLCByb3V0ZS5uYW1lIHx8IFwiXCIpO1xuICAgIGlmIChuYW1lID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3QgdHJpbW1lZCA9IG5hbWUudHJpbSgpO1xuICAgIGlmICghdHJpbW1lZCkgcmV0dXJuO1xuICAgIHJvdXRlLm5hbWUgPSB0cmltbWVkO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJyZW5hbWVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgcm91dGVfbmFtZTogdHJpbW1lZCxcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgaWYgKCF3aW5kb3cuY29uZmlybShgRGVsZXRlICR7cm91dGUubmFtZX0/YCkpIHJldHVybjtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmIChyb3V0ZXMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJvdXRlLndheXBvaW50cyA9IFtdO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGF0ZVJlZi5taXNzaWxlUm91dGVzID0gcm91dGVzLmZpbHRlcigocikgPT4gci5pZCAhPT0gcm91dGUuaWQpO1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubWlzc2lsZVJvdXRlcztcbiAgICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcmVtYWluaW5nLmxlbmd0aCA+IDAgPyByZW1haW5pbmdbMF0uaWQgOiBudWxsO1xuICAgIH1cbiAgICBtaXNzaWxlU2VsZWN0aW9uID0gbnVsbDtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImRlbGV0ZV9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICByb3V0ZU1lbnU/LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJjbGVhcl9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gW107XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IG51bGw7XG4gICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIH0pO1xuXG4gIGhlbHBUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SGVscFZpc2libGUodHJ1ZSk7XG4gIH0pO1xuXG4gIGhlbHBDbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRIZWxwVmlzaWJsZShmYWxzZSk7XG4gIH0pO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbldpbmRvd0tleURvd24sIHsgY2FwdHVyZTogZmFsc2UgfSk7XG59XG5cbmZ1bmN0aW9uIHNldFpvb20obmV3Wm9vbTogbnVtYmVyLCBjZW50ZXJYPzogbnVtYmVyLCBjZW50ZXJZPzogbnVtYmVyKTogdm9pZCB7XG4gIHVpU3RhdGVSZWYuem9vbSA9IGNsYW1wKG5ld1pvb20sIE1JTl9aT09NLCBNQVhfWk9PTSk7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzV2hlZWwoZXZlbnQ6IFdoZWVsRXZlbnQpOiB2b2lkIHtcbiAgaWYgKCFjdikgcmV0dXJuO1xuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnN0IHJlY3QgPSBjdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3QgY2VudGVyWCA9IGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQ7XG4gIGNvbnN0IGNlbnRlclkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XG5cbiAgY29uc3QgZGVsdGEgPSBldmVudC5kZWx0YVk7XG4gIGNvbnN0IHpvb21GYWN0b3IgPSBkZWx0YSA+IDAgPyAwLjkgOiAxLjE7XG4gIGNvbnN0IG5ld1pvb20gPSB1aVN0YXRlUmVmLnpvb20gKiB6b29tRmFjdG9yO1xuXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gcmVjdC53aWR0aDtcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQ7XG4gIGNvbnN0IGNhbnZhc0NlbnRlclggPSBjZW50ZXJYICogc2NhbGVYO1xuICBjb25zdCBjYW52YXNDZW50ZXJZID0gY2VudGVyWSAqIHNjYWxlWTtcblxuICBzZXRab29tKG5ld1pvb20sIGNhbnZhc0NlbnRlclgsIGNhbnZhc0NlbnRlclkpO1xufVxuXG5mdW5jdGlvbiBnZXRUb3VjaERpc3RhbmNlKHRvdWNoZXM6IFRvdWNoTGlzdCk6IG51bWJlciB8IG51bGwge1xuICBpZiAodG91Y2hlcy5sZW5ndGggPCAyKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZHggPSB0b3VjaGVzWzBdLmNsaWVudFggLSB0b3VjaGVzWzFdLmNsaWVudFg7XG4gIGNvbnN0IGR5ID0gdG91Y2hlc1swXS5jbGllbnRZIC0gdG91Y2hlc1sxXS5jbGllbnRZO1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG5mdW5jdGlvbiBnZXRUb3VjaENlbnRlcih0b3VjaGVzOiBUb3VjaExpc3QpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCBudWxsIHtcbiAgaWYgKHRvdWNoZXMubGVuZ3RoIDwgMikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgeDogKHRvdWNoZXNbMF0uY2xpZW50WCArIHRvdWNoZXNbMV0uY2xpZW50WCkgLyAyLFxuICAgIHk6ICh0b3VjaGVzWzBdLmNsaWVudFkgKyB0b3VjaGVzWzFdLmNsaWVudFkpIC8gMlxuICB9O1xufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoU3RhcnQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAyKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBpc1BpbmNoaW5nID0gdHJ1ZTtcbiAgICBsYXN0VG91Y2hEaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG5cbiAgICAvLyBDYW5jZWwgYW55IHBlbmRpbmcgd2F5cG9pbnQgcGxhY2VtZW50XG4gICAgaWYgKHBlbmRpbmdUb3VjaFRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoTW92ZShldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8IGV2ZW50LnRvdWNoZXMubGVuZ3RoICE9PSAyKSB7XG4gICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBudWxsO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gIGNvbnN0IGN1cnJlbnREaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG4gIGlmIChjdXJyZW50RGlzdGFuY2UgPT09IG51bGwgfHwgbGFzdFRvdWNoRGlzdGFuY2UgPT09IG51bGwpIHJldHVybjtcblxuICBjb25zdCByZWN0ID0gY3YuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGNvbnN0IGNlbnRlciA9IGdldFRvdWNoQ2VudGVyKGV2ZW50LnRvdWNoZXMpO1xuICBpZiAoIWNlbnRlcikgcmV0dXJuO1xuXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gcmVjdC53aWR0aDtcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQ7XG4gIGNvbnN0IGNhbnZhc0NlbnRlclggPSAoY2VudGVyLnggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICBjb25zdCBjYW52YXNDZW50ZXJZID0gKGNlbnRlci55IC0gcmVjdC50b3ApICogc2NhbGVZO1xuXG4gIGNvbnN0IHpvb21GYWN0b3IgPSBjdXJyZW50RGlzdGFuY2UgLyBsYXN0VG91Y2hEaXN0YW5jZTtcbiAgY29uc3QgbmV3Wm9vbSA9IHVpU3RhdGVSZWYuem9vbSAqIHpvb21GYWN0b3I7XG5cbiAgc2V0Wm9vbShuZXdab29tLCBjYW52YXNDZW50ZXJYLCBjYW52YXNDZW50ZXJZKTtcbiAgbGFzdFRvdWNoRGlzdGFuY2UgPSBjdXJyZW50RGlzdGFuY2U7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzVG91Y2hFbmQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoIDwgMikge1xuICAgIGxhc3RUb3VjaERpc3RhbmNlID0gbnVsbDtcbiAgICAvLyBSZXNldCBwaW5jaGluZyBmbGFnIGFmdGVyIGEgc2hvcnQgZGVsYXkgdG8gcHJldmVudCB3YXlwb2ludCBwbGFjZW1lbnRcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlzUGluY2hpbmcgPSBmYWxzZTtcbiAgICB9LCAxMDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlckRvd24oZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8ICFjdHgpIHJldHVybjtcbiAgaWYgKGhlbHBPdmVybGF5Py5jbGFzc0xpc3QuY29udGFpbnMoXCJ2aXNpYmxlXCIpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChsYXN0VG91Y2hEaXN0YW5jZSAhPT0gbnVsbCB8fCBpc1BpbmNoaW5nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgcmVjdCA9IGN2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBjb25zdCBzY2FsZVggPSByZWN0LndpZHRoICE9PSAwID8gY3Yud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgY29uc3Qgc2NhbGVZID0gcmVjdC5oZWlnaHQgIT09IDAgPyBjdi5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gIGNvbnN0IHggPSAoZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdCkgKiBzY2FsZVg7XG4gIGNvbnN0IHkgPSAoZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wKSAqIHNjYWxlWTtcbiAgY29uc3QgY2FudmFzUG9pbnQgPSB7IHgsIHkgfTtcbiAgY29uc3Qgd29ybGRQb2ludCA9IGNhbnZhc1RvV29ybGQoY2FudmFzUG9pbnQpO1xuXG4gIGNvbnN0IGNvbnRleHQgPSB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgPyBcIm1pc3NpbGVcIiA6IFwic2hpcFwiO1xuXG4gIC8vIEZvciB0b3VjaCBldmVudHMsIGRlbGF5IHdheXBvaW50IHBsYWNlbWVudCB0byBhbGxvdyBmb3IgcGluY2ggZ2VzdHVyZSBkZXRlY3Rpb25cbiAgLy8gRm9yIG1vdXNlIGV2ZW50cywgcGxhY2UgaW1tZWRpYXRlbHlcbiAgaWYgKGV2ZW50LnBvaW50ZXJUeXBlID09PSBcInRvdWNoXCIpIHtcbiAgICBpZiAocGVuZGluZ1RvdWNoVGltZW91dCAhPT0gbnVsbCkge1xuICAgICAgY2xlYXJUaW1lb3V0KHBlbmRpbmdUb3VjaFRpbWVvdXQpO1xuICAgIH1cblxuICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmIChpc1BpbmNoaW5nKSByZXR1cm47IC8vIERvdWJsZS1jaGVjayB3ZSdyZSBub3QgcGluY2hpbmdcblxuICAgICAgaWYgKGNvbnRleHQgPT09IFwibWlzc2lsZVwiKSB7XG4gICAgICAgIGhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGhhbmRsZVNoaXBQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgICAgIH1cbiAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICAgIH0sIDE1MCk7IC8vIDE1MG1zIGRlbGF5IHRvIGRldGVjdCBwaW5jaCBnZXN0dXJlXG4gIH0gZWxzZSB7XG4gICAgLy8gTW91c2UvcGVuOiBpbW1lZGlhdGUgcGxhY2VtZW50XG4gICAgaWYgKGNvbnRleHQgPT09IFwibWlzc2lsZVwiKSB7XG4gICAgICBoYW5kbGVNaXNzaWxlUG9pbnRlcihjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhbmRsZVNoaXBQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgICB9XG4gIH1cblxuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTcGVlZExhYmVsKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHNoaXBTcGVlZFZhbHVlKSB7XG4gICAgc2hpcFNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBOdW1iZXIodmFsdWUpLnRvRml4ZWQoMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U2hpcFNsaWRlclZhbHVlKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFzaGlwU3BlZWRTbGlkZXIpIHJldHVybjtcbiAgc2hpcFNwZWVkU2xpZGVyLnZhbHVlID0gU3RyaW5nKHZhbHVlKTtcbiAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgaWYgKHJvdXRlcy5sZW5ndGggPT09IDApIHtcbiAgICBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG51bGw7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaWYgKCFzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCB8fCAhcm91dGVzLnNvbWUoKHJvdXRlKSA9PiByb3V0ZS5pZCA9PT0gc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQpKSB7XG4gICAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSByb3V0ZXNbMF0uaWQ7XG4gIH1cbiAgcmV0dXJuIHJvdXRlcy5maW5kKChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbCB7XG4gIHJldHVybiBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gIGNvbnN0IGFjdGl2ZVJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmIChtaXNzaWxlUm91dGVOYW1lTGFiZWwpIHtcbiAgICBpZiAoIWFjdGl2ZVJvdXRlKSB7XG4gICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSByb3V0ZXMubGVuZ3RoID09PSAwID8gXCJObyByb3V0ZVwiIDogXCJSb3V0ZVwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSBhY3RpdmVSb3V0ZS5uYW1lIHx8IFwiUm91dGVcIjtcbiAgICB9XG4gIH1cblxuICBpZiAobWlzc2lsZVJvdXRlQ291bnRMYWJlbCkge1xuICAgIGNvbnN0IGNvdW50ID0gYWN0aXZlUm91dGUgJiYgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpID8gYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gICAgbWlzc2lsZVJvdXRlQ291bnRMYWJlbC50ZXh0Q29udGVudCA9IGAke2NvdW50fSBwdHNgO1xuICB9XG5cbiAgaWYgKGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bikge1xuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9IHJvdXRlcy5sZW5ndGggPD0gMTtcbiAgfVxuICBpZiAocmVuYW1lTWlzc2lsZVJvdXRlQnRuKSB7XG4gICAgcmVuYW1lTWlzc2lsZVJvdXRlQnRuLmRpc2FibGVkID0gIWFjdGl2ZVJvdXRlO1xuICB9XG4gIGlmIChjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4pIHtcbiAgICBjb25zdCBjb3VudCA9IGFjdGl2ZVJvdXRlICYmIEFycmF5LmlzQXJyYXkoYWN0aXZlUm91dGUud2F5cG9pbnRzKSA/IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZSB8fCBjb3VudCA9PT0gMDtcbiAgfVxuICBpZiAocm91dGVQcmV2QnRuKSB7XG4gICAgcm91dGVQcmV2QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICB9XG4gIGlmIChyb3V0ZU5leHRCdG4pIHtcbiAgICByb3V0ZU5leHRCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gIH1cblxuICB1cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBzeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk6IHZvaWQge1xuICBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgYWN0aXZlUm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3Qgcm91dGVIYXNTZWxlY3Rpb24gPVxuICAgICEhYWN0aXZlUm91dGUgJiZcbiAgICBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgJiZcbiAgICAhIW1pc3NpbGVTZWxlY3Rpb24gJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aDtcbiAgaWYgKCFyb3V0ZUhhc1NlbGVjdGlvbikge1xuICAgIG1pc3NpbGVTZWxlY3Rpb24gPSBudWxsO1xuICB9XG4gIGNvbnN0IGNmZyA9IHN0YXRlUmVmLm1pc3NpbGVDb25maWc7XG4gIGFwcGx5TWlzc2lsZVVJKGNmZyk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gYXBwbHlNaXNzaWxlVUkoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIpIHtcbiAgICBjb25zdCBtaW5TcGVlZCA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4gPz8gTUlTU0lMRV9NSU5fU1BFRUQ7XG4gICAgY29uc3QgbWF4U3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWF4ID8/IE1JU1NJTEVfTUFYX1NQRUVEO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5taW4gPSBTdHJpbmcobWluU3BlZWQpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5tYXggPSBTdHJpbmcobWF4U3BlZWQpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IGNmZy5zcGVlZC50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgIG1pc3NpbGVTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gY2ZnLnNwZWVkLnRvRml4ZWQoMCk7XG4gIH1cbiAgaWYgKG1pc3NpbGVBZ3JvU2xpZGVyKSB7XG4gICAgY29uc3QgbWluQWdybyA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuYWdyb01pbiA/PyBNSVNTSUxFX01JTl9BR1JPO1xuICAgIGNvbnN0IG1heEFncm8gPSBNYXRoLm1heCg1MDAwLCBNYXRoLmNlaWwoKGNmZy5hZ3JvUmFkaXVzICsgNTAwKSAvIDUwMCkgKiA1MDApO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5BZ3JvKTtcbiAgICBtaXNzaWxlQWdyb1NsaWRlci5tYXggPSBTdHJpbmcobWF4QWdybyk7XG4gICAgbWlzc2lsZUFncm9TbGlkZXIudmFsdWUgPSBjZmcuYWdyb1JhZGl1cy50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlQWdyb1ZhbHVlKSB7XG4gICAgbWlzc2lsZUFncm9WYWx1ZS50ZXh0Q29udGVudCA9IGNmZy5hZ3JvUmFkaXVzLnRvRml4ZWQoMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSShvdmVycmlkZXM6IFBhcnRpYWw8eyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfT4gPSB7fSk6IHZvaWQge1xuICBjb25zdCBjdXJyZW50ID0gc3RhdGVSZWYubWlzc2lsZUNvbmZpZztcbiAgY29uc3QgY2ZnID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKHtcbiAgICBzcGVlZDogb3ZlcnJpZGVzLnNwZWVkID8/IGN1cnJlbnQuc3BlZWQsXG4gICAgYWdyb1JhZGl1czogb3ZlcnJpZGVzLmFncm9SYWRpdXMgPz8gY3VycmVudC5hZ3JvUmFkaXVzLFxuICB9LCBjdXJyZW50LCBzdGF0ZVJlZi5taXNzaWxlTGltaXRzKTtcbiAgc3RhdGVSZWYubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgYXBwbHlNaXNzaWxlVUkoY2ZnKTtcbiAgY29uc3QgbGFzdCA9IGxhc3RNaXNzaWxlQ29uZmlnU2VudDtcbiAgY29uc3QgbmVlZHNTZW5kID1cbiAgICAhbGFzdCB8fFxuICAgIE1hdGguYWJzKGxhc3Quc3BlZWQgLSBjZmcuc3BlZWQpID4gMC4yNSB8fFxuICAgIE1hdGguYWJzKChsYXN0LmFncm9SYWRpdXMgPz8gMCkgLSBjZmcuYWdyb1JhZGl1cykgPiA1O1xuICBpZiAobmVlZHNTZW5kKSB7XG4gICAgc2VuZE1pc3NpbGVDb25maWcoY2ZnKTtcbiAgfVxuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiBzZW5kTWlzc2lsZUNvbmZpZyhjZmc6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0pOiB2b2lkIHtcbiAgbGFzdE1pc3NpbGVDb25maWdTZW50ID0ge1xuICAgIHNwZWVkOiBjZmcuc3BlZWQsXG4gICAgYWdyb1JhZGl1czogY2ZnLmFncm9SYWRpdXMsXG4gIH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImNvbmZpZ3VyZV9taXNzaWxlXCIsXG4gICAgbWlzc2lsZV9zcGVlZDogY2ZnLnNwZWVkLFxuICAgIG1pc3NpbGVfYWdybzogY2ZnLmFncm9SYWRpdXMsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk6IHZvaWQge1xuICBpZiAoIXNoaXBSb3V0ZXNDb250YWluZXIgfHwgIXNoaXBSb3V0ZUxlZyB8fCAhc2hpcFJvdXRlU3BlZWQgfHwgIXNoaXBEZWxldGVCdG4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGNvbnN0IGhhc1ZhbGlkU2VsZWN0aW9uID0gc2VsZWN0aW9uICE9PSBudWxsICYmIHNlbGVjdGlvbi5pbmRleCA+PSAwICYmIHNlbGVjdGlvbi5pbmRleCA8IHdwcy5sZW5ndGg7XG4gIGNvbnN0IGlzU2hpcENvbnRleHQgPSB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCI7XG5cbiAgc2hpcFJvdXRlc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUub3BhY2l0eSA9IGlzU2hpcENvbnRleHQgPyBcIjFcIiA6IFwiMC42XCI7XG5cbiAgaWYgKCFzdGF0ZVJlZi5tZSB8fCAhaGFzVmFsaWRTZWxlY3Rpb24pIHtcbiAgICBzaGlwUm91dGVMZWcudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIHNoaXBSb3V0ZVNwZWVkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICBzaGlwRGVsZXRlQnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICBpZiAoaXNTaGlwQ29udGV4dCkge1xuICAgICAgc2V0U2hpcFNsaWRlclZhbHVlKGRlZmF1bHRTcGVlZCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChzZWxlY3Rpb24gIT09IG51bGwpIHtcbiAgICBjb25zdCB3cCA9IHdwc1tzZWxlY3Rpb24uaW5kZXhdO1xuICAgIGNvbnN0IHNwZWVkID0gd3AgJiYgdHlwZW9mIHdwLnNwZWVkID09PSBcIm51bWJlclwiID8gd3Auc3BlZWQgOiBkZWZhdWx0U3BlZWQ7XG4gICAgaWYgKGlzU2hpcENvbnRleHQgJiYgc2hpcFNwZWVkU2xpZGVyICYmIE1hdGguYWJzKHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyLnZhbHVlKSAtIHNwZWVkKSA+IDAuMjUpIHtcbiAgICAgIHNldFNoaXBTbGlkZXJWYWx1ZShzcGVlZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHVwZGF0ZVNwZWVkTGFiZWwoc3BlZWQpO1xuICAgIH1cbiAgICBjb25zdCBkaXNwbGF5SW5kZXggPSBzZWxlY3Rpb24uaW5kZXggKyAxO1xuICAgIHNoaXBSb3V0ZUxlZy50ZXh0Q29udGVudCA9IGAke2Rpc3BsYXlJbmRleH1gO1xuICAgIHNoaXBSb3V0ZVNwZWVkLnRleHRDb250ZW50ID0gYCR7c3BlZWQudG9GaXhlZCgwKX0gdS9zYDtcbiAgICBzaGlwRGVsZXRlQnRuLmRpc2FibGVkID0gIWlzU2hpcENvbnRleHQ7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpOiB2b2lkIHtcbiAgaWYgKCFtaXNzaWxlRGVsZXRlQnRuKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGNvdW50ID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gIGNvbnN0IGhhc1NlbGVjdGlvbiA9IG1pc3NpbGVTZWxlY3Rpb24gIT09IG51bGwgJiYgbWlzc2lsZVNlbGVjdGlvbiAhPT0gdW5kZWZpbmVkICYmIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPj0gMCAmJiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgY291bnQ7XG4gIG1pc3NpbGVEZWxldGVCdG4uZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xufVxuXG5mdW5jdGlvbiBzZXRTZWxlY3Rpb24oc2VsOiBTZWxlY3Rpb24gfCBudWxsKTogdm9pZCB7XG4gIHNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICBjb25zdCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IG51bGw7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDpsZWdTZWxlY3RlZFwiLCB7IGluZGV4IH0pO1xufVxuXG5mdW5jdGlvbiBzZXRNaXNzaWxlU2VsZWN0aW9uKHNlbDogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwpOiB2b2lkIHtcbiAgbWlzc2lsZVNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCB3b3JsZFBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBpZiAodWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIikge1xuICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RSb3V0ZShjYW52YXNQb2ludCk7XG4gICAgc2V0U2VsZWN0aW9uKGhpdCA/PyBudWxsKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkOiBkZWZhdWx0U3BlZWQgfTtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF93YXlwb2ludFwiLCB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogZGVmYXVsdFNwZWVkIH0pO1xuICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMuc2xpY2UoKSA6IFtdO1xuICB3cHMucHVzaCh3cCk7XG4gIHN0YXRlUmVmLm1lLndheXBvaW50cyA9IHdwcztcbiAgaWYgKHdwcy5sZW5ndGggPiAwKSB7XG4gICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludEFkZGVkXCIsIHsgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICB9XG4gIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIHdvcmxkUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlKSByZXR1cm47XG5cbiAgaWYgKHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0TWlzc2lsZVJvdXRlKGNhbnZhc1BvaW50KTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKGhpdCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgd3AgPSB7IHg6IHdvcmxkUG9pbnQueCwgeTogd29ybGRQb2ludC55IH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImFkZF9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIHg6IHdwLngsXG4gICAgeTogd3AueSxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cyA/IFsuLi5yb3V0ZS53YXlwb2ludHMsIHdwXSA6IFt3cF07XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24oeyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHJvdXRlLndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xufVxuXG5mdW5jdGlvbiBjbGVhclNoaXBSb3V0ZSgpOiB2b2lkIHtcbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGlmICghd3BzIHx8IHdwcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImNsZWFyX3dheXBvaW50c1wiIH0pO1xuICBpZiAoc3RhdGVSZWYubWUpIHtcbiAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHMgPSBbXTtcbiAgfVxuICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludHNDbGVhcmVkXCIpO1xuICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVTZWxlY3RlZFNoaXBXYXlwb2ludCgpOiB2b2lkIHtcbiAgaWYgKCFzZWxlY3Rpb24pIHJldHVybjtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRlbGV0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICBpZiAoc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpKSB7XG4gICAgc3RhdGVSZWYubWUud2F5cG9pbnRzID0gc3RhdGVSZWYubWUud2F5cG9pbnRzLnNsaWNlKDAsIHNlbGVjdGlvbi5pbmRleCk7XG4gIH1cbiAgYnVzUmVmLmVtaXQoXCJzaGlwOndheXBvaW50RGVsZXRlZFwiLCB7IGluZGV4OiBzZWxlY3Rpb24uaW5kZXggfSk7XG4gIHNldFNlbGVjdGlvbihudWxsKTtcbiAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbn1cblxuZnVuY3Rpb24gZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUgfHwgIW1pc3NpbGVTZWxlY3Rpb24pIHJldHVybjtcbiAgY29uc3QgaW5kZXggPSBtaXNzaWxlU2VsZWN0aW9uLmluZGV4O1xuICBpZiAoIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCBpbmRleCA8IDAgfHwgaW5kZXggPj0gcm91dGUud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJkZWxldGVfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICBpbmRleCxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IFsuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoMCwgaW5kZXgpLCAuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoaW5kZXggKyAxKV07XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXggfSk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG59XG5cbmZ1bmN0aW9uIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgaWYgKG1pc3NpbGVMYXVuY2hCdG4/LmRpc2FibGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwibGF1bmNoX21pc3NpbGVcIixcbiAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjeWNsZU1pc3NpbGVSb3V0ZShkaXJlY3Rpb246IG51bWJlcik6IHZvaWQge1xuICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICBpZiAocm91dGVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjdXJyZW50SW5kZXggPSByb3V0ZXMuZmluZEluZGV4KChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKTtcbiAgY29uc3QgYmFzZUluZGV4ID0gY3VycmVudEluZGV4ID49IDAgPyBjdXJyZW50SW5kZXggOiAwO1xuICBjb25zdCBuZXh0SW5kZXggPSAoKGJhc2VJbmRleCArIGRpcmVjdGlvbikgJSByb3V0ZXMubGVuZ3RoICsgcm91dGVzLmxlbmd0aCkgJSByb3V0ZXMubGVuZ3RoO1xuICBjb25zdCBuZXh0Um91dGUgPSByb3V0ZXNbbmV4dEluZGV4XTtcbiAgaWYgKCFuZXh0Um91dGUpIHJldHVybjtcbiAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSBuZXh0Um91dGUuaWQ7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcInNldF9hY3RpdmVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgIHJvdXRlX2lkOiBuZXh0Um91dGUuaWQsXG4gIH0pO1xuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsIHsgcm91dGVJZDogbmV4dFJvdXRlLmlkIH0pO1xufVxuXG5mdW5jdGlvbiBjeWNsZVNoaXBTZWxlY3Rpb24oZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGlmICghd3BzIHx8IHdwcy5sZW5ndGggPT09IDApIHtcbiAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IGRpcmVjdGlvbiA+IDAgPyAtMSA6IHdwcy5sZW5ndGg7XG4gIGluZGV4ICs9IGRpcmVjdGlvbjtcbiAgaWYgKGluZGV4IDwgMCkgaW5kZXggPSB3cHMubGVuZ3RoIC0gMTtcbiAgaWYgKGluZGV4ID49IHdwcy5sZW5ndGgpIGluZGV4ID0gMDtcbiAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXggfSk7XG59XG5cbmZ1bmN0aW9uIHNldElucHV0Q29udGV4dChjb250ZXh0OiBcInNoaXBcIiB8IFwibWlzc2lsZVwiKTogdm9pZCB7XG4gIGNvbnN0IG5leHQgPSBjb250ZXh0ID09PSBcIm1pc3NpbGVcIiA/IFwibWlzc2lsZVwiIDogXCJzaGlwXCI7XG4gIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gbmV4dCkge1xuICAgIHJldHVybjtcbiAgfVxuICB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9IG5leHQ7XG5cbiAgLy8gQWxzbyB1cGRhdGUgYWN0aXZlVG9vbCB0byBtYXRjaCB0aGUgY29udGV4dCB0byBrZWVwIGJ1dHRvbiBzdGF0ZXMgaW4gc3luY1xuICBpZiAobmV4dCA9PT0gXCJzaGlwXCIpIHtcbiAgICBjb25zdCBzaGlwVG9vbFRvVXNlID0gdWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIiA/IFwic2hpcC1zZWxlY3RcIiA6IFwic2hpcC1zZXRcIjtcbiAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sICE9PSBzaGlwVG9vbFRvVXNlKSB7XG4gICAgICB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPSBzaGlwVG9vbFRvVXNlO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBtaXNzaWxlVG9vbFRvVXNlID0gdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9PT0gXCJzZWxlY3RcIiA/IFwibWlzc2lsZS1zZWxlY3RcIiA6IFwibWlzc2lsZS1zZXRcIjtcbiAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sICE9PSBtaXNzaWxlVG9vbFRvVXNlKSB7XG4gICAgICB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPSBtaXNzaWxlVG9vbFRvVXNlO1xuICAgIH1cbiAgfVxuXG4gIGJ1c1JlZi5lbWl0KFwiY29udGV4dDpjaGFuZ2VkXCIsIHsgY29udGV4dDogbmV4dCB9KTtcbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG59XG5cbmZ1bmN0aW9uIHNldEFjdGl2ZVRvb2wodG9vbDogQWN0aXZlVG9vbCk6IHZvaWQge1xuICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSB0b29sKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID0gdG9vbDtcblxuICAvLyBVcGRhdGUgYmFja3dhcmQgY29tcGF0aWJpbGl0eSBzdGF0ZXNcbiAgaWYgKHRvb2wgPT09IFwic2hpcC1zZXRcIikge1xuICAgIHVpU3RhdGVSZWYuc2hpcFRvb2wgPSBcInNldFwiO1xuICAgIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPSBudWxsO1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZXRcIiB9KTtcbiAgfSBlbHNlIGlmICh0b29sID09PSBcInNoaXAtc2VsZWN0XCIpIHtcbiAgICB1aVN0YXRlUmVmLnNoaXBUb29sID0gXCJzZWxlY3RcIjtcbiAgICB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID0gbnVsbDtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2VsZWN0XCIgfSk7XG4gIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IG51bGw7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IFwic2V0XCI7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2V0XCIgfSk7XG4gIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IG51bGw7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IFwic2VsZWN0XCI7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNlbGVjdFwiIH0pO1xuICB9XG5cbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbn1cblxuZnVuY3Rpb24gc2V0QnV0dG9uU3RhdGUoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICBpZiAoIWJ0bikgcmV0dXJuO1xuICBpZiAoYWN0aXZlKSB7XG4gICAgYnRuLmRhdGFzZXQuc3RhdGUgPSBcImFjdGl2ZVwiO1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJ0cnVlXCIpO1xuICB9IGVsc2Uge1xuICAgIGRlbGV0ZSBidG4uZGF0YXNldC5zdGF0ZTtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwiZmFsc2VcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTogdm9pZCB7XG4gIHNldEJ1dHRvblN0YXRlKHNoaXBTZXRCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNldFwiKTtcbiAgc2V0QnV0dG9uU3RhdGUoc2hpcFNlbGVjdEJ0biwgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2VsZWN0XCIpO1xuICBzZXRCdXR0b25TdGF0ZShtaXNzaWxlU2V0QnRuLCB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZXRcIik7XG4gIHNldEJ1dHRvblN0YXRlKG1pc3NpbGVTZWxlY3RCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKTtcblxuICBpZiAoc2hpcENvbnRyb2xzQ2FyZCkge1xuICAgIHNoaXBDb250cm9sc0NhcmQuY2xhc3NMaXN0LnRvZ2dsZShcImFjdGl2ZVwiLCB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCIpO1xuICB9XG4gIGlmIChtaXNzaWxlQ29udHJvbHNDYXJkKSB7XG4gICAgbWlzc2lsZUNvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0SGVscFZpc2libGUoZmxhZzogYm9vbGVhbik6IHZvaWQge1xuICB1aVN0YXRlUmVmLmhlbHBWaXNpYmxlID0gQm9vbGVhbihmbGFnKTtcbiAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgYnVzUmVmLmVtaXQoXCJoZWxwOnZpc2libGVDaGFuZ2VkXCIsIHsgdmlzaWJsZTogdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSB9KTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlSGVscE92ZXJsYXkoKTogdm9pZCB7XG4gIGlmICghaGVscE92ZXJsYXkpIHJldHVybjtcbiAgaWYgKGhlbHBUZXh0KSB7XG4gICAgaGVscFRleHQudGV4dENvbnRlbnQgPSBIRUxQX1RFWFQ7XG4gIH1cbiAgaGVscE92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZShcInZpc2libGVcIiwgdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSk7XG59XG5cbmZ1bmN0aW9uIGFkanVzdFNsaWRlclZhbHVlKGlucHV0OiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCwgc3RlcHM6IG51bWJlciwgY29hcnNlOiBib29sZWFuKTogbnVtYmVyIHwgbnVsbCB7XG4gIGlmICghaW5wdXQpIHJldHVybiBudWxsO1xuICBjb25zdCBzdGVwID0gTWF0aC5hYnMocGFyc2VGbG9hdChpbnB1dC5zdGVwKSkgfHwgMTtcbiAgY29uc3QgbXVsdGlwbGllciA9IGNvYXJzZSA/IDQgOiAxO1xuICBjb25zdCBtaW4gPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VGbG9hdChpbnB1dC5taW4pKSA/IHBhcnNlRmxvYXQoaW5wdXQubWluKSA6IC1JbmZpbml0eTtcbiAgY29uc3QgbWF4ID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWF4KSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1heCkgOiBJbmZpbml0eTtcbiAgY29uc3QgY3VycmVudCA9IHBhcnNlRmxvYXQoaW5wdXQudmFsdWUpIHx8IDA7XG4gIGxldCBuZXh0ID0gY3VycmVudCArIHN0ZXBzICogc3RlcCAqIG11bHRpcGxpZXI7XG4gIGlmIChOdW1iZXIuaXNGaW5pdGUobWluKSkgbmV4dCA9IE1hdGgubWF4KG1pbiwgbmV4dCk7XG4gIGlmIChOdW1iZXIuaXNGaW5pdGUobWF4KSkgbmV4dCA9IE1hdGgubWluKG1heCwgbmV4dCk7XG4gIGlmIChNYXRoLmFicyhuZXh0IC0gY3VycmVudCkgPCAxZS00KSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaW5wdXQudmFsdWUgPSBTdHJpbmcobmV4dCk7XG4gIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIiwgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgcmV0dXJuIG5leHQ7XG59XG5cbmZ1bmN0aW9uIG9uV2luZG93S2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICBjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgY29uc3QgaXNFZGl0YWJsZSA9ICEhdGFyZ2V0ICYmICh0YXJnZXQudGFnTmFtZSA9PT0gXCJJTlBVVFwiIHx8IHRhcmdldC50YWdOYW1lID09PSBcIlRFWFRBUkVBXCIgfHwgdGFyZ2V0LmlzQ29udGVudEVkaXRhYmxlKTtcblxuICBpZiAodWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSAmJiBldmVudC5rZXkgIT09IFwiRXNjYXBlXCIpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChpc0VkaXRhYmxlKSB7XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFc2NhcGVcIikge1xuICAgICAgdGFyZ2V0LmJsdXIoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIHN3aXRjaCAoZXZlbnQuY29kZSkge1xuICAgIGNhc2UgXCJEaWdpdDFcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJEaWdpdDJcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlUXCI6XG4gICAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2V0XCIpIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2VsZWN0XCIpO1xuICAgICAgfSBlbHNlIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZWxlY3RcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlDXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkJyYWNrZXRMZWZ0XCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUoc2hpcFNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiQnJhY2tldFJpZ2h0XCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUoc2hpcFNwZWVkU2xpZGVyLCAxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJUYWJcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBjeWNsZVNoaXBTZWxlY3Rpb24oZXZlbnQuc2hpZnRLZXkgPyAtMSA6IDEpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5TlwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIG1pc3NpbGVBZGRSb3V0ZUJ0bj8uY2xpY2soKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleUxcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleUVcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZXRcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZWxlY3RcIik7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkNvbW1hXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJQZXJpb2RcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlQWdyb1NsaWRlciwgMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiU2VtaWNvbG9uXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiUXVvdGVcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRlbGV0ZVwiOlxuICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgbWlzc2lsZVNlbGVjdGlvbikge1xuICAgICAgICBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgfSBlbHNlIGlmIChzZWxlY3Rpb24pIHtcbiAgICAgICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkVzY2FwZVwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuaGVscFZpc2libGUpIHtcbiAgICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgICAgfSBlbHNlIGlmIChtaXNzaWxlU2VsZWN0aW9uKSB7XG4gICAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHNlbGVjdGlvbikge1xuICAgICAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiRXF1YWxcIjpcbiAgICBjYXNlIFwiTnVtcGFkQWRkXCI6XG4gICAgICBpZiAoIWN2KSByZXR1cm47XG4gICAgICBzZXRab29tKHVpU3RhdGVSZWYuem9vbSAqIDEuMiwgY3Yud2lkdGggLyAyLCBjdi5oZWlnaHQgLyAyKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIk1pbnVzXCI6XG4gICAgY2FzZSBcIk51bXBhZFN1YnRyYWN0XCI6XG4gICAgICBpZiAoIWN2KSByZXR1cm47XG4gICAgICBzZXRab29tKHVpU3RhdGVSZWYuem9vbSAvIDEuMiwgY3Yud2lkdGggLyAyLCBjdi5oZWlnaHQgLyAyKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRpZ2l0MFwiOlxuICAgIGNhc2UgXCJOdW1wYWQwXCI6XG4gICAgICBpZiAoZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5KSB7XG4gICAgICAgIHVpU3RhdGVSZWYuem9vbSA9IDEuMDtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICBkZWZhdWx0OlxuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgIHNldEhlbHBWaXNpYmxlKCF1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldENhbWVyYVBvc2l0aW9uKCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gIGlmICghY3YpIHJldHVybiB7IHg6IHdvcmxkLncgLyAyLCB5OiB3b3JsZC5oIC8gMiB9O1xuXG4gIGNvbnN0IHpvb20gPSB1aVN0YXRlUmVmLnpvb207XG5cbiAgLy8gQ2FtZXJhIGZvbGxvd3Mgc2hpcCwgb3IgZGVmYXVsdHMgdG8gd29ybGQgY2VudGVyXG4gIGxldCBjYW1lcmFYID0gc3RhdGVSZWYubWUgPyBzdGF0ZVJlZi5tZS54IDogd29ybGQudyAvIDI7XG4gIGxldCBjYW1lcmFZID0gc3RhdGVSZWYubWUgPyBzdGF0ZVJlZi5tZS55IDogd29ybGQuaCAvIDI7XG5cbiAgLy8gQ2FsY3VsYXRlIHZpc2libGUgd29ybGQgYXJlYSBhdCBjdXJyZW50IHpvb20gdXNpbmcgdW5pZm9ybSBzY2FsZVxuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAvLyBXb3JsZCB1bml0cyB2aXNpYmxlIG9uIHNjcmVlblxuICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjdi5oZWlnaHQgLyBzY2FsZTtcblxuICAvLyBDbGFtcCBjYW1lcmEgdG8gcHJldmVudCB6b29taW5nIHBhc3Qgd29ybGQgYm91bmRhcmllc1xuICAvLyBXaGVuIHpvb21lZCBvdXQsIGNhbWVyYSBjYW4ndCBnZXQgY2xvc2VyIHRvIGVkZ2VzIHRoYW4gaGFsZiB2aWV3cG9ydFxuICBjb25zdCBtaW5DYW1lcmFYID0gdmlld3BvcnRXaWR0aCAvIDI7XG4gIGNvbnN0IG1heENhbWVyYVggPSB3b3JsZC53IC0gdmlld3BvcnRXaWR0aCAvIDI7XG4gIGNvbnN0IG1pbkNhbWVyYVkgPSB2aWV3cG9ydEhlaWdodCAvIDI7XG4gIGNvbnN0IG1heENhbWVyYVkgPSB3b3JsZC5oIC0gdmlld3BvcnRIZWlnaHQgLyAyO1xuXG4gIC8vIEFsd2F5cyBjbGFtcCBjYW1lcmEgdG8gd29ybGQgYm91bmRhcmllc1xuICAvLyBXaGVuIHZpZXdwb3J0ID49IHdvcmxkIGRpbWVuc2lvbnMsIGNlbnRlciB0aGUgd29ybGQgb24gc2NyZWVuXG4gIGlmICh2aWV3cG9ydFdpZHRoIDwgd29ybGQudykge1xuICAgIGNhbWVyYVggPSBjbGFtcChjYW1lcmFYLCBtaW5DYW1lcmFYLCBtYXhDYW1lcmFYKTtcbiAgfSBlbHNlIHtcbiAgICBjYW1lcmFYID0gd29ybGQudyAvIDI7XG4gIH1cblxuICBpZiAodmlld3BvcnRIZWlnaHQgPCB3b3JsZC5oKSB7XG4gICAgY2FtZXJhWSA9IGNsYW1wKGNhbWVyYVksIG1pbkNhbWVyYVksIG1heENhbWVyYVkpO1xuICB9IGVsc2Uge1xuICAgIGNhbWVyYVkgPSB3b3JsZC5oIC8gMjtcbiAgfVxuXG4gIHJldHVybiB7IHg6IGNhbWVyYVgsIHk6IGNhbWVyYVkgfTtcbn1cblxuZnVuY3Rpb24gd29ybGRUb0NhbnZhcyhwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICBpZiAoIWN2KSByZXR1cm4geyB4OiBwLngsIHk6IHAueSB9O1xuXG4gIGNvbnN0IHpvb20gPSB1aVN0YXRlUmVmLnpvb207XG4gIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgLy8gV29ybGQgcG9zaXRpb24gcmVsYXRpdmUgdG8gY2FtZXJhXG4gIGNvbnN0IHdvcmxkWCA9IHAueCAtIGNhbWVyYS54O1xuICBjb25zdCB3b3JsZFkgPSBwLnkgLSBjYW1lcmEueTtcblxuICAvLyBVc2UgdW5pZm9ybSBzY2FsZSB0byBtYWludGFpbiBhc3BlY3QgcmF0aW9cbiAgLy8gU2NhbGUgaXMgcGl4ZWxzIHBlciB3b3JsZCB1bml0IC0gY2hvb3NlIHRoZSBkaW1lbnNpb24gdGhhdCBmaXRzXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gIC8vIENvbnZlcnQgdG8gY2FudmFzIGNvb3JkaW5hdGVzIChjZW50ZXJlZCBvbiBzY3JlZW4pXG4gIHJldHVybiB7XG4gICAgeDogd29ybGRYICogc2NhbGUgKyBjdi53aWR0aCAvIDIsXG4gICAgeTogd29ybGRZICogc2NhbGUgKyBjdi5oZWlnaHQgLyAyXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcblxuICBjb25zdCB6b29tID0gdWlTdGF0ZVJlZi56b29tO1xuICBjb25zdCBjYW1lcmEgPSBnZXRDYW1lcmFQb3NpdGlvbigpO1xuXG4gIC8vIENhbnZhcyBwb3NpdGlvbiByZWxhdGl2ZSB0byBjZW50ZXJcbiAgY29uc3QgY2FudmFzWCA9IHAueCAtIGN2LndpZHRoIC8gMjtcbiAgY29uc3QgY2FudmFzWSA9IHAueSAtIGN2LmhlaWdodCAvIDI7XG5cbiAgLy8gVXNlIHVuaWZvcm0gc2NhbGUgdG8gbWFpbnRhaW4gYXNwZWN0IHJhdGlvXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gIC8vIENvbnZlcnQgdG8gd29ybGQgY29vcmRpbmF0ZXMgKGludmVyc2Ugb2Ygd29ybGRUb0NhbnZhcylcbiAgcmV0dXJuIHtcbiAgICB4OiBjYW52YXNYIC8gc2NhbGUgKyBjYW1lcmEueCxcbiAgICB5OiBjYW52YXNZIC8gc2NhbGUgKyBjYW1lcmEueVxuICB9O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlUm91dGVQb2ludHMoKSB7XG4gIGlmICghc3RhdGVSZWYubWUpIHJldHVybiBudWxsO1xuICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMgOiBbXTtcbiAgY29uc3Qgd29ybGRQb2ludHMgPSBbeyB4OiBzdGF0ZVJlZi5tZS54LCB5OiBzdGF0ZVJlZi5tZS55IH1dO1xuICBmb3IgKGNvbnN0IHdwIG9mIHdwcykge1xuICAgIHdvcmxkUG9pbnRzLnB1c2goeyB4OiB3cC54LCB5OiB3cC55IH0pO1xuICB9XG4gIGNvbnN0IGNhbnZhc1BvaW50cyA9IHdvcmxkUG9pbnRzLm1hcCgocG9pbnQpID0+IHdvcmxkVG9DYW52YXMocG9pbnQpKTtcbiAgcmV0dXJuIHsgd2F5cG9pbnRzOiB3cHMsIHdvcmxkUG9pbnRzLCBjYW52YXNQb2ludHMgfTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IHdwcyA9IHJvdXRlICYmIEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cyA6IFtdO1xuICBjb25zdCB3b3JsZFBvaW50cyA9IFt7IHg6IHN0YXRlUmVmLm1lLngsIHk6IHN0YXRlUmVmLm1lLnkgfV07XG4gIGZvciAoY29uc3Qgd3Agb2Ygd3BzKSB7XG4gICAgd29ybGRQb2ludHMucHVzaCh7IHg6IHdwLngsIHk6IHdwLnkgfSk7XG4gIH1cbiAgY29uc3QgY2FudmFzUG9pbnRzID0gd29ybGRQb2ludHMubWFwKChwb2ludCkgPT4gd29ybGRUb0NhbnZhcyhwb2ludCkpO1xuICByZXR1cm4geyB3YXlwb2ludHM6IHdwcywgd29ybGRQb2ludHMsIGNhbnZhc1BvaW50cyB9O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVMZWdEYXNoT2Zmc2V0cyhkdFNlY29uZHM6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIXVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSB8fCAhc3RhdGVSZWYubWUpIHtcbiAgICBsZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICBsZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCB7IHdheXBvaW50cywgd29ybGRQb2ludHMsIGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IGN5Y2xlID0gNjQ7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3AgPSB3YXlwb2ludHNbaV07XG4gICAgY29uc3Qgc3BlZWQgPSB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgPyB3cC5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcbiAgICBjb25zdCBhV29ybGQgPSB3b3JsZFBvaW50c1tpXTtcbiAgICBjb25zdCBiV29ybGQgPSB3b3JsZFBvaW50c1tpICsgMV07XG4gICAgY29uc3Qgd29ybGREaXN0ID0gTWF0aC5oeXBvdChiV29ybGQueCAtIGFXb3JsZC54LCBiV29ybGQueSAtIGFXb3JsZC55KTtcbiAgICBjb25zdCBhQ2FudmFzID0gY2FudmFzUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJDYW52YXMgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGNhbnZhc0Rpc3QgPSBNYXRoLmh5cG90KGJDYW52YXMueCAtIGFDYW52YXMueCwgYkNhbnZhcy55IC0gYUNhbnZhcy55KTtcblxuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHNwZWVkKSB8fCBzcGVlZCA8PSAxZS0zIHx8ICFOdW1iZXIuaXNGaW5pdGUod29ybGREaXN0KSB8fCB3b3JsZERpc3QgPD0gMWUtMyB8fCBjYW52YXNEaXN0IDw9IDFlLTMpIHtcbiAgICAgIGxlZ0Rhc2hPZmZzZXRzLnNldChpLCAwKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGR0U2Vjb25kcykgfHwgZHRTZWNvbmRzIDw9IDApIHtcbiAgICAgIGlmICghbGVnRGFzaE9mZnNldHMuaGFzKGkpKSB7XG4gICAgICAgIGxlZ0Rhc2hPZmZzZXRzLnNldChpLCAwKTtcbiAgICAgIH1cbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHNjYWxlID0gY2FudmFzRGlzdCAvIHdvcmxkRGlzdDtcbiAgICBjb25zdCBkYXNoU3BlZWQgPSBzcGVlZCAqIHNjYWxlO1xuICAgIGxldCBuZXh0ID0gKGxlZ0Rhc2hPZmZzZXRzLmdldChpKSA/PyAwKSAtIGRhc2hTcGVlZCAqIGR0U2Vjb25kcztcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuZXh0KSkge1xuICAgICAgbmV4dCA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHQgPSAoKG5leHQgJSBjeWNsZSkgKyBjeWNsZSkgJSBjeWNsZTtcbiAgICB9XG4gICAgbGVnRGFzaE9mZnNldHMuc2V0KGksIG5leHQpO1xuICB9XG4gIGZvciAoY29uc3Qga2V5IG9mIEFycmF5LmZyb20obGVnRGFzaE9mZnNldHMua2V5cygpKSkge1xuICAgIGlmIChrZXkgPj0gd2F5cG9pbnRzLmxlbmd0aCkge1xuICAgICAgbGVnRGFzaE9mZnNldHMuZGVsZXRlKGtleSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHBvaW50U2VnbWVudERpc3RhbmNlKHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgYTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBiOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBudW1iZXIge1xuICBjb25zdCBhYnggPSBiLnggLSBhLng7XG4gIGNvbnN0IGFieSA9IGIueSAtIGEueTtcbiAgY29uc3QgYXB4ID0gcC54IC0gYS54O1xuICBjb25zdCBhcHkgPSBwLnkgLSBhLnk7XG4gIGNvbnN0IGFiTGVuU3EgPSBhYnggKiBhYnggKyBhYnkgKiBhYnk7XG4gIGNvbnN0IHQgPSBhYkxlblNxID09PSAwID8gMCA6IGNsYW1wKGFweCAqIGFieCArIGFweSAqIGFieSwgMCwgYWJMZW5TcSkgLyBhYkxlblNxO1xuICBjb25zdCBwcm9qeCA9IGEueCArIGFieCAqIHQ7XG4gIGNvbnN0IHByb2p5ID0gYS55ICsgYWJ5ICogdDtcbiAgY29uc3QgZHggPSBwLnggLSBwcm9qeDtcbiAgY29uc3QgZHkgPSBwLnkgLSBwcm9qeTtcbiAgcmV0dXJuIE1hdGguaHlwb3QoZHgsIGR5KTtcbn1cblxuZnVuY3Rpb24gaGl0VGVzdFJvdXRlKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBTZWxlY3Rpb24gfCBudWxsIHtcbiAgY29uc3Qgcm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgeyBjYW52YXNQb2ludHMgfSA9IHJvdXRlO1xuICBjb25zdCB3YXlwb2ludEhpdFJhZGl1cyA9IDEyO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHJvdXRlLndheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwQ2FudmFzID0gY2FudmFzUG9pbnRzW2kgKyAxXTtcbiAgICBjb25zdCBkeCA9IGNhbnZhc1BvaW50LnggLSB3cENhbnZhcy54O1xuICAgIGNvbnN0IGR5ID0gY2FudmFzUG9pbnQueSAtIHdwQ2FudmFzLnk7XG4gICAgaWYgKE1hdGguaHlwb3QoZHgsIGR5KSA8PSB3YXlwb2ludEhpdFJhZGl1cykge1xuICAgICAgcmV0dXJuIHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogaSB9O1xuICAgIH1cbiAgfVxuICBpZiAoIXVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGNvbnN0IGxlZ0hpdERpc3RhbmNlID0gMTA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgZGlzdCA9IHBvaW50U2VnbWVudERpc3RhbmNlKGNhbnZhc1BvaW50LCBjYW52YXNQb2ludHNbaV0sIGNhbnZhc1BvaW50c1tpICsgMV0pO1xuICAgIGlmIChkaXN0IDw9IGxlZ0hpdERpc3RhbmNlKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcImxlZ1wiLCBpbmRleDogaSB9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gaGl0VGVzdE1pc3NpbGVSb3V0ZShjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwge1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgeyBjYW52YXNQb2ludHMgfSA9IHJvdXRlO1xuICBjb25zdCB3YXlwb2ludEhpdFJhZGl1cyA9IDE2O1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGNhbnZhc1BvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwQ2FudmFzID0gY2FudmFzUG9pbnRzW2ldO1xuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdwQ2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd3BDYW52YXMueTtcbiAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpIDw9IHdheXBvaW50SGl0UmFkaXVzKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBpIC0gMSB9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZHJhd1NoaXAoeDogbnVtYmVyLCB5OiBudW1iZXIsIHZ4OiBudW1iZXIsIHZ5OiBudW1iZXIsIGNvbG9yOiBzdHJpbmcsIGZpbGxlZDogYm9vbGVhbik6IHZvaWQge1xuICBpZiAoIWN0eCkgcmV0dXJuO1xuICBjb25zdCBwID0gd29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gIGNvbnN0IHIgPSAxMDtcbiAgY3R4LnNhdmUoKTtcbiAgY3R4LnRyYW5zbGF0ZShwLngsIHAueSk7XG4gIGNvbnN0IGFuZ2xlID0gTWF0aC5hdGFuMih2eSwgdngpO1xuICBjdHgucm90YXRlKGFuZ2xlKTtcbiAgY3R4LmJlZ2luUGF0aCgpO1xuICBjdHgubW92ZVRvKHIsIDApO1xuICBjdHgubGluZVRvKC1yICogMC43LCByICogMC42KTtcbiAgY3R4LmxpbmVUbygtciAqIDAuNCwgMCk7XG4gIGN0eC5saW5lVG8oLXIgKiAwLjcsIC1yICogMC42KTtcbiAgY3R4LmNsb3NlUGF0aCgpO1xuICBjdHgubGluZVdpZHRoID0gMjtcbiAgY3R4LnN0cm9rZVN0eWxlID0gY29sb3I7XG4gIGlmIChmaWxsZWQpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gYCR7Y29sb3J9Y2NgO1xuICAgIGN0eC5maWxsKCk7XG4gIH1cbiAgY3R4LnN0cm9rZSgpO1xuICBjdHgucmVzdG9yZSgpO1xufVxuXG5mdW5jdGlvbiBkcmF3R2hvc3REb3QoeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFjdHgpIHJldHVybjtcbiAgY29uc3QgcCA9IHdvcmxkVG9DYW52YXMoeyB4LCB5IH0pO1xuICBjdHguYmVnaW5QYXRoKCk7XG4gIGN0eC5hcmMocC54LCBwLnksIDMsIDAsIE1hdGguUEkgKiAyKTtcbiAgY3R4LmZpbGxTdHlsZSA9IFwiI2NjY2NjY2FhXCI7XG4gIGN0eC5maWxsKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdSb3V0ZSgpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIXN0YXRlUmVmLm1lKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICBjb25zdCB7IGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IGxlZ0NvdW50ID0gY2FudmFzUG9pbnRzLmxlbmd0aCAtIDE7XG5cbiAgaWYgKHVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSAmJiBsZWdDb3VudCA+IDApIHtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5zZXRMaW5lRGFzaChbOCwgOF0pO1xuICAgIGN0eC5saW5lV2lkdGggPSAxLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMzhiZGY4NjZcIjtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxlZ0NvdW50OyBpKyspIHtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGN0eC5tb3ZlVG8oY2FudmFzUG9pbnRzW2ldLngsIGNhbnZhc1BvaW50c1tpXS55KTtcbiAgICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzW2kgKyAxXS54LCBjYW52YXNQb2ludHNbaSArIDFdLnkpO1xuICAgICAgY3R4LmxpbmVEYXNoT2Zmc2V0ID0gbGVnRGFzaE9mZnNldHMuZ2V0KGkpID8/IDA7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cblxuICBpZiAodWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlICYmIGxlZ0NvdW50ID4gMCkge1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnNldExpbmVEYXNoKFs2LCA2XSk7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDM7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMzhiZGY4XCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oY2FudmFzUG9pbnRzWzBdLngsIGNhbnZhc1BvaW50c1swXS55KTtcbiAgICBjdHgubGluZVRvKGNhbnZhc1BvaW50c1sxXS54LCBjYW52YXNQb2ludHNbMV0ueSk7XG4gICAgY3R4LmxpbmVEYXNoT2Zmc2V0ID0gbGVnRGFzaE9mZnNldHMuZ2V0KDApID8/IDA7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cblxuICBpZiAodWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlICYmIHNlbGVjdGlvbiAmJiBzZWxlY3Rpb24uaW5kZXggPCBsZWdDb3VudCkge1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnNldExpbmVEYXNoKFs0LCA0XSk7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDMuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiNmOTczMTZcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbc2VsZWN0aW9uLmluZGV4XS54LCBjYW52YXNQb2ludHNbc2VsZWN0aW9uLmluZGV4XS55KTtcbiAgICBjdHgubGluZVRvKGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXggKyAxXS54LCBjYW52YXNQb2ludHNbc2VsZWN0aW9uLmluZGV4ICsgMV0ueSk7XG4gICAgY3R4LmxpbmVEYXNoT2Zmc2V0ID0gbGVnRGFzaE9mZnNldHMuZ2V0KHNlbGVjdGlvbi5pbmRleCkgPz8gMDtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcHQgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3Rpb24gJiYgc2VsZWN0aW9uLmluZGV4ID09PSBpO1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMocHQueCwgcHQueSwgaXNTZWxlY3RlZCA/IDcgOiA1LCAwLCBNYXRoLlBJICogMik7XG4gICAgY3R4LmZpbGxTdHlsZSA9IGlzU2VsZWN0ZWQgPyBcIiNmOTczMTZcIiA6IFwiIzM4YmRmOFwiO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IGlzU2VsZWN0ZWQgPyAwLjk1IDogMC44O1xuICAgIGN0eC5maWxsKCk7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMTtcbiAgICBjdHgubGluZVdpZHRoID0gMjtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMwZjE3MmFcIjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkcmF3TWlzc2lsZVJvdXRlKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWUpIHJldHVybjtcbiAgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ICE9PSBcIm1pc3NpbGVcIikgcmV0dXJuO1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSByZXR1cm47XG4gIGNvbnN0IHsgY2FudmFzUG9pbnRzIH0gPSByb3V0ZTtcbiAgY3R4LnNhdmUoKTtcbiAgY3R4LnNldExpbmVEYXNoKFsxMCwgNl0pO1xuICBjdHgubGluZVdpZHRoID0gMi41O1xuICBjdHguc3Ryb2tlU3R5bGUgPSBcIiNmODcxNzFhYVwiO1xuICBjdHguYmVnaW5QYXRoKCk7XG4gIGN0eC5tb3ZlVG8oY2FudmFzUG9pbnRzWzBdLngsIGNhbnZhc1BvaW50c1swXS55KTtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBjYW52YXNQb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjdHgubGluZVRvKGNhbnZhc1BvaW50c1tpXS54LCBjYW52YXNQb2ludHNbaV0ueSk7XG4gIH1cbiAgY3R4LnN0cm9rZSgpO1xuICBjdHgucmVzdG9yZSgpO1xuXG4gIGZvciAobGV0IGkgPSAxOyBpIDwgY2FudmFzUG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcHQgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3Qgd2F5cG9pbnRJbmRleCA9IGkgLSAxO1xuICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBtaXNzaWxlU2VsZWN0aW9uICYmIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPT09IHdheXBvaW50SW5kZXg7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmFyYyhwdC54LCBwdC55LCBpc1NlbGVjdGVkID8gNyA6IDUsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gaXNTZWxlY3RlZCA/IFwiI2ZhY2MxNVwiIDogXCIjZjg3MTcxXCI7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gaXNTZWxlY3RlZCA/IDAuOTUgOiAwLjk7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSAxLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gaXNTZWxlY3RlZCA/IFwiIzg1NGQwZVwiIDogXCIjN2YxZDFkXCI7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZHJhd01pc3NpbGVzKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWlzc2lsZXMgfHwgc3RhdGVSZWYubWlzc2lsZXMubGVuZ3RoID09PSAwIHx8ICFjdikgcmV0dXJuO1xuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHJhZGl1c1NjYWxlID0gKHNjYWxlWCArIHNjYWxlWSkgLyAyO1xuICBmb3IgKGNvbnN0IG1pc3Mgb2Ygc3RhdGVSZWYubWlzc2lsZXMpIHtcbiAgICBjb25zdCBwID0gd29ybGRUb0NhbnZhcyh7IHg6IG1pc3MueCwgeTogbWlzcy55IH0pO1xuICAgIGNvbnN0IHNlbGZPd25lZCA9IEJvb2xlYW4obWlzcy5zZWxmKTtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHguYXJjKHAueCwgcC55LCBzZWxmT3duZWQgPyA2IDogNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgIGN0eC5maWxsU3R5bGUgPSBzZWxmT3duZWQgPyBcIiNmODcxNzFcIiA6IFwiI2ZjYTVhNVwiO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IHNlbGZPd25lZCA/IDAuOTUgOiAwLjg7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSAxLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMTExODI3XCI7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG5cbiAgICBpZiAoc2VsZk93bmVkICYmIG1pc3MuYWdyb19yYWRpdXMgPiAwKSB7XG4gICAgICBjdHguc2F2ZSgpO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY29uc3QgckNhbnZhcyA9IG1pc3MuYWdyb19yYWRpdXMgKiByYWRpdXNTY2FsZTtcbiAgICAgIGN0eC5zZXRMaW5lRGFzaChbMTQsIDEwXSk7XG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSBcInJnYmEoMjQ4LDExMywxMTMsMC4zNSlcIjtcbiAgICAgIGN0eC5saW5lV2lkdGggPSAxLjI7XG4gICAgICBjdHguYXJjKHAueCwgcC55LCByQ2FudmFzLCAwLCBNYXRoLlBJICogMik7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBkcmF3R3JpZCgpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIWN2KSByZXR1cm47XG4gIGN0eC5zYXZlKCk7XG4gIGN0eC5zdHJva2VTdHlsZSA9IFwiIzIzNFwiO1xuICBjdHgubGluZVdpZHRoID0gMTtcblxuICBjb25zdCB6b29tID0gdWlTdGF0ZVJlZi56b29tO1xuICBsZXQgc3RlcCA9IDEwMDA7XG4gIGlmICh6b29tIDwgMC43KSB7XG4gICAgc3RlcCA9IDIwMDA7XG4gIH0gZWxzZSBpZiAoem9vbSA+IDEuNSkge1xuICAgIHN0ZXAgPSA1MDA7XG4gIH0gZWxzZSBpZiAoem9vbSA+IDIuNSkge1xuICAgIHN0ZXAgPSAyNTA7XG4gIH1cblxuICBjb25zdCBjYW1lcmEgPSBnZXRDYW1lcmFQb3NpdGlvbigpO1xuXG4gIC8vIENhbGN1bGF0ZSB2aWV3cG9ydCB1c2luZyB1bmlmb3JtIHNjYWxlIChzYW1lIGFzIGNvb3JkaW5hdGUgdHJhbnNmb3JtcylcbiAgY29uc3Qgc2NhbGVYID0gY3Yud2lkdGggLyB3b3JsZC53O1xuICBjb25zdCBzY2FsZVkgPSBjdi5oZWlnaHQgLyB3b3JsZC5oO1xuICBjb25zdCBzY2FsZSA9IE1hdGgubWluKHNjYWxlWCwgc2NhbGVZKSAqIHpvb207XG4gIGNvbnN0IHZpZXdwb3J0V2lkdGggPSBjdi53aWR0aCAvIHNjYWxlO1xuICBjb25zdCB2aWV3cG9ydEhlaWdodCA9IGN2LmhlaWdodCAvIHNjYWxlO1xuXG4gIGNvbnN0IG1pblggPSBNYXRoLm1heCgwLCBjYW1lcmEueCAtIHZpZXdwb3J0V2lkdGggLyAyKTtcbiAgY29uc3QgbWF4WCA9IE1hdGgubWluKHdvcmxkLncsIGNhbWVyYS54ICsgdmlld3BvcnRXaWR0aCAvIDIpO1xuICBjb25zdCBtaW5ZID0gTWF0aC5tYXgoMCwgY2FtZXJhLnkgLSB2aWV3cG9ydEhlaWdodCAvIDIpO1xuICBjb25zdCBtYXhZID0gTWF0aC5taW4od29ybGQuaCwgY2FtZXJhLnkgKyB2aWV3cG9ydEhlaWdodCAvIDIpO1xuXG4gIGNvbnN0IHN0YXJ0WCA9IE1hdGguZmxvb3IobWluWCAvIHN0ZXApICogc3RlcDtcbiAgY29uc3QgZW5kWCA9IE1hdGguY2VpbChtYXhYIC8gc3RlcCkgKiBzdGVwO1xuICBjb25zdCBzdGFydFkgPSBNYXRoLmZsb29yKG1pblkgLyBzdGVwKSAqIHN0ZXA7XG4gIGNvbnN0IGVuZFkgPSBNYXRoLmNlaWwobWF4WSAvIHN0ZXApICogc3RlcDtcblxuICBmb3IgKGxldCB4ID0gc3RhcnRYOyB4IDw9IGVuZFg7IHggKz0gc3RlcCkge1xuICAgIGNvbnN0IGEgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeTogTWF0aC5tYXgoMCwgbWluWSkgfSk7XG4gICAgY29uc3QgYiA9IHdvcmxkVG9DYW52YXMoeyB4LCB5OiBNYXRoLm1pbih3b3JsZC5oLCBtYXhZKSB9KTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhhLngsIGEueSk7XG4gICAgY3R4LmxpbmVUbyhiLngsIGIueSk7XG4gICAgY3R4LnN0cm9rZSgpO1xuICB9XG4gIGZvciAobGV0IHkgPSBzdGFydFk7IHkgPD0gZW5kWTsgeSArPSBzdGVwKSB7XG4gICAgY29uc3QgYSA9IHdvcmxkVG9DYW52YXMoeyB4OiBNYXRoLm1heCgwLCBtaW5YKSwgeSB9KTtcbiAgICBjb25zdCBiID0gd29ybGRUb0NhbnZhcyh7IHg6IE1hdGgubWluKHdvcmxkLncsIG1heFgpLCB5IH0pO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGEueCwgYS55KTtcbiAgICBjdHgubGluZVRvKGIueCwgYi55KTtcbiAgICBjdHguc3Ryb2tlKCk7XG4gIH1cbiAgY3R4LnJlc3RvcmUoKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk6IHZvaWQge1xuICBpZiAoIW1pc3NpbGVMYXVuY2hCdG4gfHwgIW1pc3NpbGVMYXVuY2hUZXh0IHx8ICFtaXNzaWxlTGF1bmNoSW5mbykgcmV0dXJuO1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBjb25zdCBjb3VudCA9IHJvdXRlICYmIEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICBjb25zdCByZW1haW5pbmcgPSBnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTtcbiAgY29uc3QgY29vbGluZ0Rvd24gPSByZW1haW5pbmcgPiAwLjA1O1xuICBjb25zdCBzaG91bGREaXNhYmxlID0gIXJvdXRlIHx8IGNvdW50ID09PSAwIHx8IGNvb2xpbmdEb3duO1xuICBtaXNzaWxlTGF1bmNoQnRuLmRpc2FibGVkID0gc2hvdWxkRGlzYWJsZTtcblxuICBjb25zdCBsYXVuY2hUZXh0SFRNTCA9ICc8c3BhbiBjbGFzcz1cImJ0bi10ZXh0LWZ1bGxcIj5MYXVuY2g8L3NwYW4+PHNwYW4gY2xhc3M9XCJidG4tdGV4dC1zaG9ydFwiPkZpcmU8L3NwYW4+JztcbiAgbGV0IGxhdW5jaEluZm9IVE1MID0gXCJcIjtcblxuICBpZiAoIXJvdXRlKSB7XG4gICAgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuICB9IGVsc2UgaWYgKGNvb2xpbmdEb3duKSB7XG4gICAgbGF1bmNoSW5mb0hUTUwgPSBgJHtyZW1haW5pbmcudG9GaXhlZCgxKX1zYDtcbiAgfSBlbHNlIGlmIChyb3V0ZS5uYW1lKSB7XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgICBjb25zdCByb3V0ZUluZGV4ID0gcm91dGVzLmZpbmRJbmRleCgocikgPT4gci5pZCA9PT0gcm91dGUuaWQpICsgMTtcbiAgICBsYXVuY2hJbmZvSFRNTCA9IGA8c3BhbiBjbGFzcz1cImJ0bi10ZXh0LWZ1bGxcIj4ke3JvdXRlLm5hbWV9PC9zcGFuPjxzcGFuIGNsYXNzPVwiYnRuLXRleHQtc2hvcnRcIj4ke3JvdXRlSW5kZXh9PC9zcGFuPmA7XG4gIH0gZWxzZSB7XG4gICAgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuICB9XG5cbiAgaWYgKGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgIT09IGxhdW5jaFRleHRIVE1MKSB7XG4gICAgbWlzc2lsZUxhdW5jaFRleHQuaW5uZXJIVE1MID0gbGF1bmNoVGV4dEhUTUw7XG4gICAgbGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICB9XG5cbiAgaWYgKGxhc3RNaXNzaWxlTGF1bmNoSW5mb0hUTUwgIT09IGxhdW5jaEluZm9IVE1MKSB7XG4gICAgbWlzc2lsZUxhdW5jaEluZm8uaW5uZXJIVE1MID0gbGF1bmNoSW5mb0hUTUw7XG4gICAgbGFzdE1pc3NpbGVMYXVuY2hJbmZvSFRNTCA9IGxhdW5jaEluZm9IVE1MO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZygpOiBudW1iZXIge1xuICBjb25zdCByZW1haW5pbmcgPSBzdGF0ZVJlZi5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGVSZWYpO1xuICByZXR1cm4gcmVtYWluaW5nID4gMCA/IHJlbWFpbmluZyA6IDA7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVN0YXR1c0luZGljYXRvcnMoKTogdm9pZCB7XG4gIGNvbnN0IG1ldGEgPSBzdGF0ZVJlZi53b3JsZE1ldGEgPz8ge307XG4gIGNvbnN0IGhhc1dpZHRoID0gdHlwZW9mIG1ldGEudyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS53KTtcbiAgY29uc3QgaGFzSGVpZ2h0ID0gdHlwZW9mIG1ldGEuaCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5oKTtcblxuICBpZiAoaGFzV2lkdGgpIHtcbiAgICB3b3JsZC53ID0gbWV0YS53ITtcbiAgfVxuICBpZiAoaGFzSGVpZ2h0KSB7XG4gICAgd29ybGQuaCA9IG1ldGEuaCE7XG4gIH1cbiAgaWYgKEhQc3Bhbikge1xuICAgIGlmIChzdGF0ZVJlZi5tZSAmJiBOdW1iZXIuaXNGaW5pdGUoc3RhdGVSZWYubWUuaHApKSB7XG4gICAgICBIUHNwYW4udGV4dENvbnRlbnQgPSBOdW1iZXIoc3RhdGVSZWYubWUuaHApLnRvU3RyaW5nKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIEhQc3Bhbi50ZXh0Q29udGVudCA9IFwiXHUyMDEzXCI7XG4gICAgfVxuICB9XG4gIGlmIChraWxsc1NwYW4pIHtcbiAgICBpZiAoc3RhdGVSZWYubWUgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXRlUmVmLm1lLmtpbGxzKSkge1xuICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlUmVmLm1lLmtpbGxzKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBraWxsc1NwYW4udGV4dENvbnRlbnQgPSBcIjBcIjtcbiAgICB9XG4gIH1cblxuICAvLyBVcGRhdGUgaGVhdCBiYXJcbiAgdXBkYXRlSGVhdEJhcigpO1xuICAvLyBVcGRhdGUgcGxhbm5lZCBoZWF0IGJhclxuICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xuICAvLyBVcGRhdGUgc3BlZWQgbWFya2VyIHBvc2l0aW9uXG4gIHVwZGF0ZVNwZWVkTWFya2VyKCk7XG4gIC8vIFVwZGF0ZSBzdGFsbCBvdmVybGF5XG4gIHVwZGF0ZVN0YWxsT3ZlcmxheSgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIZWF0QmFyKCk6IHZvaWQge1xuICBjb25zdCBoZWF0ID0gc3RhdGVSZWYubWU/LmhlYXQ7XG4gIGlmICghaGVhdCB8fCAhaGVhdEJhckZpbGwgfHwgIWhlYXRWYWx1ZVRleHQpIHJldHVybjtcblxuICBjb25zdCBwZXJjZW50ID0gKGhlYXQudmFsdWUgLyBoZWF0Lm1heCkgKiAxMDA7XG4gIGhlYXRCYXJGaWxsLnN0eWxlLndpZHRoID0gYCR7cGVyY2VudH0lYDtcblxuICAvLyBVcGRhdGUgdGV4dFxuICBoZWF0VmFsdWVUZXh0LnRleHRDb250ZW50ID0gYEhlYXQgJHtNYXRoLnJvdW5kKGhlYXQudmFsdWUpfWA7XG5cbiAgLy8gVXBkYXRlIGNvbG9yIGNsYXNzZXNcbiAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LnJlbW92ZShcIndhcm5cIiwgXCJvdmVyaGVhdFwiKTtcbiAgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC5vdmVyaGVhdEF0KSB7XG4gICAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LmFkZChcIm92ZXJoZWF0XCIpO1xuICB9IGVsc2UgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC53YXJuQXQpIHtcbiAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QuYWRkKFwid2FyblwiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVQbGFubmVkSGVhdEJhcigpOiB2b2lkIHtcbiAgY29uc3Qgc2hpcCA9IHN0YXRlUmVmLm1lO1xuICBjb25zdCBwbGFubmVkRWwgPSBoZWF0QmFyUGxhbm5lZDtcbiAgaWYgKCFzaGlwIHx8ICFzaGlwLmhlYXQgfHwgIXBsYW5uZWRFbCkgcmV0dXJuO1xuXG4gIGNvbnN0IHBsYW5uZWQgPSBwcm9qZWN0UGxhbm5lZEhlYXQoc2hpcCk7XG4gIGNvbnN0IHBlcmNlbnQgPSAocGxhbm5lZCAvIHNoaXAuaGVhdC5tYXgpICogMTAwO1xuICBwbGFubmVkRWwuc3R5bGUud2lkdGggPSBgJHtNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIHBlcmNlbnQpKX0lYDtcbn1cblxuZnVuY3Rpb24gcHJvamVjdFBsYW5uZWRIZWF0KHNoaXA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdheXBvaW50czogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgc3BlZWQ/OiBudW1iZXIgfVtdOyBoZWF0PzogeyB2YWx1ZTogbnVtYmVyOyBtYXg6IG51bWJlcjsgbWFya2VyU3BlZWQ6IG51bWJlcjsga1VwOiBudW1iZXI7IGtEb3duOiBudW1iZXI7IGV4cDogbnVtYmVyIH0gfSk6IG51bWJlciB7XG4gIGNvbnN0IGhlYXQgPSBzaGlwLmhlYXQhO1xuICBsZXQgaCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGhlYXQubWF4LCBoZWF0LnZhbHVlKSk7XG4gIGxldCBtYXhIID0gaDtcbiAgLy8gU2ltcGxlIGNvbnN0YW50LXNwZWVkIHBlci1sZWcgcHJvamVjdGlvbiAoc2VydmVyIGN1cnJlbnRseSBzZXRzIHZlbCB0byBsZWcgc3BlZWQgaW5zdGFudGx5KVxuICBsZXQgcG9zWCA9IHNoaXAueDtcbiAgbGV0IHBvc1kgPSBzaGlwLnk7XG4gIGZvciAoY29uc3Qgd3Agb2Ygc2hpcC53YXlwb2ludHMpIHtcbiAgICBjb25zdCBkeCA9IHdwLnggLSBwb3NYO1xuICAgIGNvbnN0IGR5ID0gd3AueSAtIHBvc1k7XG4gICAgY29uc3QgZGlzdCA9IE1hdGguaHlwb3QoZHgsIGR5KTtcbiAgICBjb25zdCB2ID0gTWF0aC5tYXgoMWUtNiwgTnVtYmVyLmlzRmluaXRlKHdwLnNwZWVkKSA/ICh3cC5zcGVlZCBhcyBudW1iZXIpIDogMCk7XG4gICAgaWYgKHYgPD0gMWUtNiB8fCBkaXN0IDw9IDFlLTYpIHtcbiAgICAgIHBvc1ggPSB3cC54OyBwb3NZID0gd3AueTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBkdXJhdGlvbiA9IGRpc3QgLyB2O1xuICAgIC8vIEhlYXQgZGlmZmVyZW50aWFsIGF0IGNvbnN0YW50IHNwZWVkXG4gICAgY29uc3QgZGV2ID0gdiAtIGhlYXQubWFya2VyU3BlZWQ7XG4gICAgY29uc3QgVm4gPSBNYXRoLm1heChoZWF0Lm1hcmtlclNwZWVkLCAxZS02KTtcbiAgICBjb25zdCBwID0gaGVhdC5leHA7XG4gICAgY29uc3QgcmF0ZSA9IGRldiA+PSAwID8gaGVhdC5rVXAgKiBNYXRoLnBvdyhkZXYgLyBWbiwgcCkgOiAtaGVhdC5rRG93biAqIE1hdGgucG93KE1hdGguYWJzKGRldikgLyBWbiwgcCk7XG4gICAgaCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGhlYXQubWF4LCBoICsgcmF0ZSAqIGR1cmF0aW9uKSk7XG4gICAgaWYgKGggPiBtYXhIKSBtYXhIID0gaDtcbiAgICBwb3NYID0gd3AueDsgcG9zWSA9IHdwLnk7XG4gIH1cbiAgcmV0dXJuIG1heEg7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVNwZWVkTWFya2VyKCk6IHZvaWQge1xuICBjb25zdCBoZWF0ID0gc3RhdGVSZWYubWU/LmhlYXQ7XG4gIGlmICghaGVhdCB8fCAhc3BlZWRNYXJrZXIgfHwgIXNoaXBTcGVlZFNsaWRlcikgcmV0dXJuO1xuXG4gIGNvbnN0IG1pbiA9IHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyLm1pbik7XG4gIGNvbnN0IG1heCA9IHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyLm1heCk7XG4gIGNvbnN0IG1hcmtlclNwZWVkID0gaGVhdC5tYXJrZXJTcGVlZDtcblxuICAvLyBDYWxjdWxhdGUgcG9zaXRpb24gYXMgcGVyY2VudGFnZVxuICBjb25zdCBwZXJjZW50ID0gKChtYXJrZXJTcGVlZCAtIG1pbikgLyAobWF4IC0gbWluKSkgKiAxMDA7XG4gIGNvbnN0IGNsYW1wZWQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIHBlcmNlbnQpKTtcbiAgc3BlZWRNYXJrZXIuc3R5bGUubGVmdCA9IGAke2NsYW1wZWR9JWA7XG4gIHNwZWVkTWFya2VyLnRpdGxlID0gYEhlYXQgbmV1dHJhbDogJHtNYXRoLnJvdW5kKG1hcmtlclNwZWVkKX0gdW5pdHMvc2A7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVN0YWxsT3ZlcmxheSgpOiB2b2lkIHtcbiAgY29uc3QgaGVhdCA9IHN0YXRlUmVmLm1lPy5oZWF0O1xuICBpZiAoIWhlYXQgfHwgIXN0YWxsT3ZlcmxheSkgcmV0dXJuO1xuXG4gIGNvbnN0IG5vdyA9IHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSBcImZ1bmN0aW9uXCJcbiAgICA/IHBlcmZvcm1hbmNlLm5vdygpXG4gICAgOiBEYXRlLm5vdygpO1xuXG4gIGNvbnN0IGlzU3RhbGxlZCA9IG5vdyA8IGhlYXQuc3RhbGxVbnRpbE1zO1xuXG4gIGlmIChpc1N0YWxsZWQpIHtcbiAgICBzdGFsbE92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gIH0gZWxzZSB7XG4gICAgc3RhbGxPdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIWN2KSByZXR1cm47XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKHRpbWVzdGFtcCkpIHtcbiAgICB0aW1lc3RhbXAgPSBsYXN0TG9vcFRzID8/IDA7XG4gIH1cbiAgbGV0IGR0U2Vjb25kcyA9IDA7XG4gIGlmIChsYXN0TG9vcFRzICE9PSBudWxsKSB7XG4gICAgZHRTZWNvbmRzID0gKHRpbWVzdGFtcCAtIGxhc3RMb29wVHMpIC8gMTAwMDtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShkdFNlY29uZHMpIHx8IGR0U2Vjb25kcyA8IDApIHtcbiAgICAgIGR0U2Vjb25kcyA9IDA7XG4gICAgfVxuICB9XG4gIGxhc3RMb29wVHMgPSB0aW1lc3RhbXA7XG4gIHVwZGF0ZUxlZ0Rhc2hPZmZzZXRzKGR0U2Vjb25kcyk7XG5cbiAgY3R4LmNsZWFyUmVjdCgwLCAwLCBjdi53aWR0aCwgY3YuaGVpZ2h0KTtcbiAgZHJhd0dyaWQoKTtcbiAgZHJhd1JvdXRlKCk7XG4gIGRyYXdNaXNzaWxlUm91dGUoKTtcbiAgZHJhd01pc3NpbGVzKCk7XG5cbiAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG5cbiAgZm9yIChjb25zdCBnIG9mIHN0YXRlUmVmLmdob3N0cykge1xuICAgIGRyYXdTaGlwKGcueCwgZy55LCBnLnZ4LCBnLnZ5LCBcIiM5Y2EzYWZcIiwgZmFsc2UpO1xuICAgIGRyYXdHaG9zdERvdChnLngsIGcueSk7XG4gIH1cbiAgaWYgKHN0YXRlUmVmLm1lKSB7XG4gICAgZHJhd1NoaXAoc3RhdGVSZWYubWUueCwgc3RhdGVSZWYubWUueSwgc3RhdGVSZWYubWUudngsIHN0YXRlUmVmLm1lLnZ5LCBcIiMyMmQzZWVcIiwgdHJ1ZSk7XG4gIH1cbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGxvb3ApO1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmludGVyZmFjZSBIaWdobGlnaHRDb250ZW50T3B0aW9ucyB7XG4gIHRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgc3RlcENvdW50OiBudW1iZXI7XG4gIHNob3dOZXh0OiBib29sZWFuO1xuICBuZXh0TGFiZWw/OiBzdHJpbmc7XG4gIG9uTmV4dD86ICgpID0+IHZvaWQ7XG4gIHNob3dTa2lwOiBib29sZWFuO1xuICBza2lwTGFiZWw/OiBzdHJpbmc7XG4gIG9uU2tpcD86ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGlnaGxpZ2h0ZXIge1xuICBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZDtcbiAgaGlkZSgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJ0dXRvcmlhbC1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVIaWdobGlnaHRlcigpOiBIaWdobGlnaHRlciB7XG4gIGVuc3VyZVN0eWxlcygpO1xuXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheVwiO1xuICBvdmVybGF5LnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBcInBvbGl0ZVwiKTtcblxuICBjb25zdCBzY3JpbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNjcmltLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fc2NyaW1cIjtcblxuICBjb25zdCBoaWdobGlnaHRCb3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoaWdobGlnaHRCb3guY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19oaWdobGlnaHRcIjtcblxuICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdG9vbHRpcC5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXBcIjtcblxuICBjb25zdCBwcm9ncmVzcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHByb2dyZXNzLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3NcIjtcblxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJoM1wiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X190aXRsZVwiO1xuXG4gIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwicFwiKTtcbiAgYm9keS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2JvZHlcIjtcblxuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnNcIjtcblxuICBjb25zdCBza2lwQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgc2tpcEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgc2tpcEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0XCI7XG4gIHNraXBCdG4udGV4dENvbnRlbnQgPSBcIlNraXBcIjtcblxuICBjb25zdCBuZXh0QnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgbmV4dEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgbmV4dEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnlcIjtcbiAgbmV4dEJ0bi50ZXh0Q29udGVudCA9IFwiTmV4dFwiO1xuXG4gIGFjdGlvbnMuYXBwZW5kKHNraXBCdG4sIG5leHRCdG4pO1xuICB0b29sdGlwLmFwcGVuZChwcm9ncmVzcywgdGl0bGUsIGJvZHksIGFjdGlvbnMpO1xuICBvdmVybGF5LmFwcGVuZChzY3JpbSwgaGlnaGxpZ2h0Qm94LCB0b29sdGlwKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICBsZXQgY3VycmVudFRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHJlc2l6ZU9ic2VydmVyOiBSZXNpemVPYnNlcnZlciB8IG51bGwgPSBudWxsO1xuICBsZXQgZnJhbWVIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgb25OZXh0OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IG9uU2tpcDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gc2NoZWR1bGVVcGRhdGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgaWYgKGZyYW1lSGFuZGxlICE9PSBudWxsKSByZXR1cm47XG4gICAgZnJhbWVIYW5kbGUgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICAgIHVwZGF0ZVBvc2l0aW9uKCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVQb3NpdGlvbigpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUpIHJldHVybjtcblxuICAgIGlmIChjdXJyZW50VGFyZ2V0KSB7XG4gICAgICBjb25zdCByZWN0ID0gY3VycmVudFRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IHBhZGRpbmcgPSAxMjtcbiAgICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMCwgcmVjdC53aWR0aCArIHBhZGRpbmcgKiAyKTtcbiAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDAsIHJlY3QuaGVpZ2h0ICsgcGFkZGluZyAqIDIpO1xuICAgICAgY29uc3QgbGVmdCA9IHJlY3QubGVmdCAtIHBhZGRpbmc7XG4gICAgICBjb25zdCB0b3AgPSByZWN0LnRvcCAtIHBhZGRpbmc7XG5cbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQobGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b3ApfXB4KWA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUud2lkdGggPSBgJHtNYXRoLnJvdW5kKHdpZHRoKX1weGA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gYCR7TWF0aC5yb3VuZChoZWlnaHQpfXB4YDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIHRvb2x0aXAuc3R5bGUubWF4V2lkdGggPSBgbWluKDM0MHB4LCAke01hdGgubWF4KDI2MCwgd2luZG93LmlubmVyV2lkdGggLSAzMil9cHgpYDtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBsZXQgdG9vbHRpcFRvcCA9IHJlY3QuYm90dG9tICsgMTg7XG4gICAgICBpZiAodG9vbHRpcFRvcCArIHRvb2x0aXBIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSAyMCkge1xuICAgICAgICB0b29sdGlwVG9wID0gTWF0aC5tYXgoMjAsIHJlY3QudG9wIC0gdG9vbHRpcEhlaWdodCAtIDE4KTtcbiAgICAgIH1cbiAgICAgIGxldCB0b29sdGlwTGVmdCA9IHJlY3QubGVmdCArIHJlY3Qud2lkdGggLyAyIC0gdG9vbHRpcFdpZHRoIC8gMjtcbiAgICAgIHRvb2x0aXBMZWZ0ID0gY2xhbXAodG9vbHRpcExlZnQsIDIwLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCAtIDIwKTtcbiAgICAgIHRvb2x0aXAuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQodG9vbHRpcExlZnQpfXB4LCAke01hdGgucm91bmQodG9vbHRpcFRvcCl9cHgpYDtcbiAgICB9IGVsc2Uge1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS53aWR0aCA9IFwiMHB4XCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gXCIwcHhcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh3aW5kb3cuaW5uZXJXaWR0aCAvIDIpfXB4LCAke01hdGgucm91bmQod2luZG93LmlubmVySGVpZ2h0IC8gMil9cHgpYDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBjb25zdCB0b29sdGlwTGVmdCA9IGNsYW1wKCh3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCkgLyAyLCAyMCwgd2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGggLSAyMCk7XG4gICAgICBjb25zdCB0b29sdGlwVG9wID0gY2xhbXAoKHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQpIC8gMiwgMjAsIHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQgLSAyMCk7XG4gICAgICB0b29sdGlwLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHRvb2x0aXBMZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvb2x0aXBUb3ApfXB4KWA7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKCk6IHZvaWQge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHNjaGVkdWxlVXBkYXRlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycygpOiB2b2lkIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBzY2hlZHVsZVVwZGF0ZSk7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUpO1xuICAgIGlmIChmcmFtZUhhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKGZyYW1lSGFuZGxlKTtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHJlc2l6ZU9ic2VydmVyKSB7XG4gICAgICByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgc2tpcEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBvblNraXA/LigpO1xuICB9KTtcblxuICBuZXh0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIG9uTmV4dD8uKCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIHJlbmRlclRvb2x0aXAob3B0aW9uczogSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCB7IHN0ZXBDb3VudCwgc3RlcEluZGV4LCB0aXRsZTogb3B0aW9uVGl0bGUsIGJvZHk6IG9wdGlvbkJvZHksIHNob3dOZXh0LCBuZXh0TGFiZWwsIHNob3dTa2lwLCBza2lwTGFiZWwgfSA9IG9wdGlvbnM7XG5cbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHN0ZXBDb3VudCkgJiYgc3RlcENvdW50ID4gMCkge1xuICAgICAgcHJvZ3Jlc3MudGV4dENvbnRlbnQgPSBgU3RlcCAke3N0ZXBJbmRleCArIDF9IG9mICR7c3RlcENvdW50fWA7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9ncmVzcy50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvblRpdGxlICYmIG9wdGlvblRpdGxlLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aXRsZS50ZXh0Q29udGVudCA9IG9wdGlvblRpdGxlO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGl0bGUudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIGJvZHkudGV4dENvbnRlbnQgPSBvcHRpb25Cb2R5O1xuXG4gICAgb25OZXh0ID0gc2hvd05leHQgPyBvcHRpb25zLm9uTmV4dCA/PyBudWxsIDogbnVsbDtcbiAgICBpZiAoc2hvd05leHQpIHtcbiAgICAgIG5leHRCdG4udGV4dENvbnRlbnQgPSBuZXh0TGFiZWwgPz8gXCJOZXh0XCI7XG4gICAgICBuZXh0QnRuLnN0eWxlLmRpc3BsYXkgPSBcImlubGluZS1mbGV4XCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHRCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIG9uU2tpcCA9IHNob3dTa2lwID8gb3B0aW9ucy5vblNraXAgPz8gbnVsbCA6IG51bGw7XG4gICAgaWYgKHNob3dTa2lwKSB7XG4gICAgICBza2lwQnRuLnRleHRDb250ZW50ID0gc2tpcExhYmVsID8/IFwiU2tpcFwiO1xuICAgICAgc2tpcEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJpbmxpbmUtZmxleFwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBza2lwQnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IHRydWU7XG4gICAgY3VycmVudFRhcmdldCA9IG9wdGlvbnMudGFyZ2V0ID8/IG51bGw7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICByZW5kZXJUb29sdGlwKG9wdGlvbnMpO1xuICAgIGlmIChyZXNpemVPYnNlcnZlcikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFRhcmdldCAmJiB0eXBlb2YgUmVzaXplT2JzZXJ2ZXIgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHNjaGVkdWxlVXBkYXRlKCkpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShjdXJyZW50VGFyZ2V0KTtcbiAgICB9XG4gICAgYXR0YWNoTGlzdGVuZXJzKCk7XG4gICAgc2NoZWR1bGVVcGRhdGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjtcbiAgICB0b29sdGlwLnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIGRldGFjaExpc3RlbmVycygpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlKCk7XG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2hvdyxcbiAgICBoaWRlLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNUWUxFX0lEKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgc3R5bGUuaWQgPSBTVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLnR1dG9yaWFsLW92ZXJsYXkge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgICB6LWluZGV4OiA1MDtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXkudmlzaWJsZSB7XG4gICAgICBkaXNwbGF5OiBibG9jaztcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3NjcmltIHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGluc2V0OiAwO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9faGlnaGxpZ2h0IHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gICAgICBib3JkZXI6IDJweCBzb2xpZCByZ2JhKDU2LCAxODksIDI0OCwgMC45NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDAgMCAycHggcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjUpLCAwIDAgMjRweCByZ2JhKDM0LCAyMTEsIDIzOCwgMC4yNSk7XG4gICAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC4xOHMgZWFzZSwgd2lkdGggMC4xOHMgZWFzZSwgaGVpZ2h0IDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgbWluLXdpZHRoOiAyNDBweDtcbiAgICAgIG1heC13aWR0aDogbWluKDM0MHB4LCBjYWxjKDEwMHZ3IC0gMzJweCkpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgxNSwgMjMsIDQyLCAwLjk1KTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNnB4O1xuICAgICAgcGFkZGluZzogMTZweCAxOHB4O1xuICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICBib3gtc2hhZG93OiAwIDEycHggMzJweCByZ2JhKDE1LCAyMywgNDIsIDAuNTUpO1xuICAgICAgcG9pbnRlci1ldmVudHM6IGF1dG87XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdmlzaWJpbGl0eTogaGlkZGVuO1xuICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoMHB4LCAwcHgpO1xuICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzIHtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC43NSk7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X190aXRsZSB7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgICBmb250LXNpemU6IDE1cHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wNGVtO1xuICAgICAgY29sb3I6ICNmMWY1Zjk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19ib2R5IHtcbiAgICAgIG1hcmdpbjogMCAwIDE0cHg7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBsaW5lLWhlaWdodDogMS41O1xuICAgICAgY29sb3I6ICNjYmQ1ZjU7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBnYXA6IDEwcHg7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICBwYWRkaW5nOiA2cHggMTRweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDk5OXB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeSB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4yNSk7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjU1KTtcbiAgICAgIGNvbG9yOiAjZjhmYWZjO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5OmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjM1KTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3Qge1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBjb2xvcjogcmdiYSgyMDMsIDIxMywgMjI1LCAwLjkpO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdDpob3ZlciB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMjAzLCAyMTMsIDIyNSwgMC41NSk7XG4gICAgfVxuICAgIEBtZWRpYSAobWF4LXdpZHRoOiA3NjhweCkge1xuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgICBtaW4td2lkdGg6IDIwMHB4O1xuICAgICAgICBtYXgtd2lkdGg6IG1pbigzMjBweCwgY2FsYygxMDB2dyAtIDI0cHgpKTtcbiAgICAgICAgcGFkZGluZzogMTBweCAxMnB4O1xuICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogcm93O1xuICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBnYXA6IDEycHg7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3Mge1xuICAgICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fdGl0bGUge1xuICAgICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYm9keSB7XG4gICAgICAgIG1hcmdpbjogMDtcbiAgICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgICBmbGV4OiAxO1xuICAgICAgICBsaW5lLWhlaWdodDogMS40O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnMge1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgICAgcGFkZGluZzogNXB4IDEwcHg7XG4gICAgICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICAgIH1cbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuIiwgImNvbnN0IFNUT1JBR0VfUFJFRklYID0gXCJsc2Q6dHV0b3JpYWw6XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxQcm9ncmVzcyB7XG4gIHN0ZXBJbmRleDogbnVtYmVyO1xuICBjb21wbGV0ZWQ6IGJvb2xlYW47XG4gIHVwZGF0ZWRBdDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBnZXRTdG9yYWdlKCk6IFN0b3JhZ2UgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIiB8fCAhd2luZG93LmxvY2FsU3RvcmFnZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRQcm9ncmVzcyhpZDogc3RyaW5nKTogVHV0b3JpYWxQcm9ncmVzcyB8IG51bGwge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IHN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX1BSRUZJWCArIGlkKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFR1dG9yaWFsUHJvZ3Jlc3M7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHBhcnNlZCAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQgPT09IG51bGwgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuc3RlcEluZGV4ICE9PSBcIm51bWJlclwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmNvbXBsZXRlZCAhPT0gXCJib29sZWFuXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQudXBkYXRlZEF0ICE9PSBcIm51bWJlclwiXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnNlZDtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVQcm9ncmVzcyhpZDogc3RyaW5nLCBwcm9ncmVzczogVHV0b3JpYWxQcm9ncmVzcyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnNldEl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCwgSlNPTi5zdHJpbmdpZnkocHJvZ3Jlc3MpKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gaWdub3JlIHN0b3JhZ2UgZmFpbHVyZXNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJQcm9ncmVzcyhpZDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2UucmVtb3ZlSXRlbShTVE9SQUdFX1BSRUZJWCArIGlkKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gaWdub3JlIHN0b3JhZ2UgZmFpbHVyZXNcbiAgfVxufVxuIiwgImV4cG9ydCB0eXBlIFJvbGVJZCA9XG4gIHwgXCJjYW52YXNcIlxuICB8IFwic2hpcFNldFwiXG4gIHwgXCJzaGlwU2VsZWN0XCJcbiAgfCBcInNoaXBEZWxldGVcIlxuICB8IFwic2hpcENsZWFyXCJcbiAgfCBcInNoaXBTcGVlZFNsaWRlclwiXG4gIHwgXCJtaXNzaWxlU2V0XCJcbiAgfCBcIm1pc3NpbGVTZWxlY3RcIlxuICB8IFwibWlzc2lsZURlbGV0ZVwiXG4gIHwgXCJtaXNzaWxlU3BlZWRTbGlkZXJcIlxuICB8IFwibWlzc2lsZUFncm9TbGlkZXJcIlxuICB8IFwibWlzc2lsZUFkZFJvdXRlXCJcbiAgfCBcIm1pc3NpbGVMYXVuY2hcIlxuICB8IFwicm91dGVQcmV2XCJcbiAgfCBcInJvdXRlTmV4dFwiXG4gIHwgXCJoZWxwVG9nZ2xlXCJcbiAgfCBcInR1dG9yaWFsU3RhcnRcIlxuICB8IFwic3Bhd25Cb3RcIjtcblxuZXhwb3J0IHR5cGUgUm9sZVJlc29sdmVyID0gKCkgPT4gSFRNTEVsZW1lbnQgfCBudWxsO1xuXG5leHBvcnQgdHlwZSBSb2xlc01hcCA9IFJlY29yZDxSb2xlSWQsIFJvbGVSZXNvbHZlcj47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSb2xlcygpOiBSb2xlc01hcCB7XG4gIHJldHVybiB7XG4gICAgY2FudmFzOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImN2XCIpLFxuICAgIHNoaXBTZXQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZXRcIiksXG4gICAgc2hpcFNlbGVjdDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSxcbiAgICBzaGlwRGVsZXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtZGVsZXRlXCIpLFxuICAgIHNoaXBDbGVhcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNsZWFyXCIpLFxuICAgIHNoaXBTcGVlZFNsaWRlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXNsaWRlclwiKSxcbiAgICBtaXNzaWxlU2V0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2V0XCIpLFxuICAgIG1pc3NpbGVTZWxlY3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZWxlY3RcIiksXG4gICAgbWlzc2lsZURlbGV0ZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWRlbGV0ZVwiKSxcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1zbGlkZXJcIiksXG4gICAgbWlzc2lsZUFncm9TbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXNsaWRlclwiKSxcbiAgICBtaXNzaWxlQWRkUm91dGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIiksXG4gICAgbWlzc2lsZUxhdW5jaDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaFwiKSxcbiAgICByb3V0ZVByZXY6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtcHJldlwiKSxcbiAgICByb3V0ZU5leHQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbmV4dFwiKSxcbiAgICBoZWxwVG9nZ2xlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtdG9nZ2xlXCIpLFxuICAgIHR1dG9yaWFsU3RhcnQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidHV0b3JpYWwtc3RhcnRcIiksXG4gICAgc3Bhd25Cb3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Um9sZUVsZW1lbnQocm9sZXM6IFJvbGVzTWFwLCByb2xlOiBSb2xlSWQgfCBudWxsIHwgdW5kZWZpbmVkKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgaWYgKCFyb2xlKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcmVzb2x2ZXIgPSByb2xlc1tyb2xlXTtcbiAgcmV0dXJuIHJlc29sdmVyID8gcmVzb2x2ZXIoKSA6IG51bGw7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cywgRXZlbnRLZXkgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVIaWdobGlnaHRlciwgdHlwZSBIaWdobGlnaHRlciB9IGZyb20gXCIuL2hpZ2hsaWdodFwiO1xuaW1wb3J0IHsgY2xlYXJQcm9ncmVzcywgbG9hZFByb2dyZXNzLCBzYXZlUHJvZ3Jlc3MgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBnZXRSb2xlRWxlbWVudCwgdHlwZSBSb2xlSWQsIHR5cGUgUm9sZXNNYXAgfSBmcm9tIFwiLi9yb2xlc1wiO1xuXG5leHBvcnQgdHlwZSBTdGVwQWR2YW5jZSA9XG4gIHwge1xuICAgICAga2luZDogXCJldmVudFwiO1xuICAgICAgZXZlbnQ6IEV2ZW50S2V5O1xuICAgICAgd2hlbj86IChwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuO1xuICAgICAgY2hlY2s/OiAoKSA9PiBib29sZWFuO1xuICAgIH1cbiAgfCB7XG4gICAgICBraW5kOiBcIm1hbnVhbFwiO1xuICAgICAgbmV4dExhYmVsPzogc3RyaW5nO1xuICAgIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxTdGVwIHtcbiAgaWQ6IHN0cmluZztcbiAgdGFyZ2V0OiBSb2xlSWQgfCAoKCkgPT4gSFRNTEVsZW1lbnQgfCBudWxsKSB8IG51bGw7XG4gIHRpdGxlPzogc3RyaW5nO1xuICBib2R5OiBzdHJpbmc7XG4gIGFkdmFuY2U6IFN0ZXBBZHZhbmNlO1xuICBvbkVudGVyPzogKCkgPT4gdm9pZDtcbiAgb25FeGl0PzogKCkgPT4gdm9pZDtcbiAgYWxsb3dTa2lwPzogYm9vbGVhbjtcbiAgc2tpcExhYmVsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgRW5naW5lT3B0aW9ucyB7XG4gIGlkOiBzdHJpbmc7XG4gIGJ1czogRXZlbnRCdXM7XG4gIHJvbGVzOiBSb2xlc01hcDtcbiAgc3RlcHM6IFR1dG9yaWFsU3RlcFtdO1xufVxuXG5pbnRlcmZhY2UgU3RhcnRPcHRpb25zIHtcbiAgcmVzdW1lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbEVuZ2luZSB7XG4gIHN0YXJ0KG9wdGlvbnM/OiBTdGFydE9wdGlvbnMpOiB2b2lkO1xuICByZXN0YXJ0KCk6IHZvaWQ7XG4gIHN0b3AoKTogdm9pZDtcbiAgaXNSdW5uaW5nKCk6IGJvb2xlYW47XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVR1dG9yaWFsRW5naW5lKHsgaWQsIGJ1cywgcm9sZXMsIHN0ZXBzIH06IEVuZ2luZU9wdGlvbnMpOiBUdXRvcmlhbEVuZ2luZSB7XG4gIGNvbnN0IGhpZ2hsaWdodGVyOiBIaWdobGlnaHRlciA9IGNyZWF0ZUhpZ2hsaWdodGVyKCk7XG4gIGxldCBydW5uaW5nID0gZmFsc2U7XG4gIGxldCBwYXVzZWQgPSBmYWxzZTtcbiAgbGV0IGN1cnJlbnRJbmRleCA9IC0xO1xuICBsZXQgY3VycmVudFN0ZXA6IFR1dG9yaWFsU3RlcCB8IG51bGwgPSBudWxsO1xuICBsZXQgY2xlYW51cEN1cnJlbnQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgcmVuZGVyQ3VycmVudDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBmYWxzZTtcbiAgbGV0IHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuXG4gIGNvbnN0IHBlcnNpc3RlbnRMaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cbiAgcGVyc2lzdGVudExpc3RlbmVycy5wdXNoKFxuICAgIGJ1cy5vbihcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgKHsgdmlzaWJsZSB9KSA9PiB7XG4gICAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICAgIHBhdXNlZCA9IEJvb2xlYW4odmlzaWJsZSk7XG4gICAgICBpZiAocGF1c2VkKSB7XG4gICAgICAgIGhpZ2hsaWdodGVyLmhpZGUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlbmRlckN1cnJlbnQ/LigpO1xuICAgICAgfVxuICAgIH0pLFxuICApO1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVUYXJnZXQoc3RlcDogVHV0b3JpYWxTdGVwKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgICBpZiAoIXN0ZXAudGFyZ2V0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBzdGVwLnRhcmdldCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICByZXR1cm4gc3RlcC50YXJnZXQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGdldFJvbGVFbGVtZW50KHJvbGVzLCBzdGVwLnRhcmdldCk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGFtcEluZGV4KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHJldHVybiAwO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGluZGV4KSB8fCBpbmRleCA8IDApIHJldHVybiAwO1xuICAgIGlmIChpbmRleCA+PSBzdGVwcy5sZW5ndGgpIHJldHVybiBzdGVwcy5sZW5ndGggLSAxO1xuICAgIHJldHVybiBNYXRoLmZsb29yKGluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFN0ZXAoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSBzdGVwcy5sZW5ndGgpIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnRTdGVwKSB7XG4gICAgICBjdXJyZW50U3RlcC5vbkV4aXQ/LigpO1xuICAgICAgY3VycmVudFN0ZXAgPSBudWxsO1xuICAgIH1cblxuICAgIGN1cnJlbnRJbmRleCA9IGluZGV4O1xuICAgIGNvbnN0IHN0ZXAgPSBzdGVwc1tpbmRleF07XG4gICAgY3VycmVudFN0ZXAgPSBzdGVwO1xuXG4gICAgcGVyc2lzdFByb2dyZXNzKGluZGV4LCBmYWxzZSk7XG5cbiAgICBidXMuZW1pdChcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCIsIHsgaWQsIHN0ZXBJbmRleDogaW5kZXgsIHRvdGFsOiBzdGVwcy5sZW5ndGggfSk7XG4gICAgc3RlcC5vbkVudGVyPy4oKTtcblxuICAgIGNvbnN0IGFsbG93U2tpcCA9IHN0ZXAuYWxsb3dTa2lwICE9PSBmYWxzZTtcbiAgICBjb25zdCByZW5kZXIgPSAoKTogdm9pZCA9PiB7XG4gICAgICBpZiAoIXJ1bm5pbmcgfHwgcGF1c2VkKSByZXR1cm47XG4gICAgICBoaWdobGlnaHRlci5zaG93KHtcbiAgICAgICAgdGFyZ2V0OiByZXNvbHZlVGFyZ2V0KHN0ZXApLFxuICAgICAgICB0aXRsZTogc3RlcC50aXRsZSxcbiAgICAgICAgYm9keTogc3RlcC5ib2R5LFxuICAgICAgICBzdGVwSW5kZXg6IGluZGV4LFxuICAgICAgICBzdGVwQ291bnQ6IHN0ZXBzLmxlbmd0aCxcbiAgICAgICAgc2hvd05leHQ6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiLFxuICAgICAgICBuZXh0TGFiZWw6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiXG4gICAgICAgICAgPyBzdGVwLmFkdmFuY2UubmV4dExhYmVsID8/IChpbmRleCA9PT0gc3RlcHMubGVuZ3RoIC0gMSA/IFwiRmluaXNoXCIgOiBcIk5leHRcIilcbiAgICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgICAgb25OZXh0OiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIiA/IGFkdmFuY2VTdGVwIDogdW5kZWZpbmVkLFxuICAgICAgICBzaG93U2tpcDogYWxsb3dTa2lwLFxuICAgICAgICBza2lwTGFiZWw6IHN0ZXAuc2tpcExhYmVsLFxuICAgICAgICBvblNraXA6IGFsbG93U2tpcCA/IHNraXBDdXJyZW50U3RlcCA6IHVuZGVmaW5lZCxcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICByZW5kZXJDdXJyZW50ID0gcmVuZGVyO1xuICAgIHJlbmRlcigpO1xuXG4gICAgaWYgKHN0ZXAuYWR2YW5jZS5raW5kID09PSBcImV2ZW50XCIpIHtcbiAgICAgIGNvbnN0IGhhbmRsZXIgPSAocGF5bG9hZDogdW5rbm93bik6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoIXJ1bm5pbmcgfHwgcGF1c2VkKSByZXR1cm47XG4gICAgICAgIGlmIChzdGVwLmFkdmFuY2Uud2hlbiAmJiAhc3RlcC5hZHZhbmNlLndoZW4ocGF5bG9hZCkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgYWR2YW5jZVRvKGluZGV4ICsgMSk7XG4gICAgICB9O1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBidXMub24oc3RlcC5hZHZhbmNlLmV2ZW50LCBoYW5kbGVyIGFzICh2YWx1ZTogbmV2ZXIpID0+IHZvaWQpO1xuICAgICAgaWYgKHN0ZXAuYWR2YW5jZS5jaGVjayAmJiBzdGVwLmFkdmFuY2UuY2hlY2soKSkge1xuICAgICAgICBoYW5kbGVyKHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlVG8obmV4dEluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG4gICAgcmVuZGVyQ3VycmVudCA9IG51bGw7XG4gICAgaWYgKG5leHRJbmRleCA+PSBzdGVwcy5sZW5ndGgpIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0U3RlcChuZXh0SW5kZXgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGFkdmFuY2VTdGVwKCk6IHZvaWQge1xuICAgIGFkdmFuY2VUbyhjdXJyZW50SW5kZXggKyAxKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNraXBDdXJyZW50U3RlcCgpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBjb25zdCBuZXh0SW5kZXggPSBjdXJyZW50SW5kZXggPj0gMCA/IGN1cnJlbnRJbmRleCArIDEgOiAwO1xuICAgIGFkdmFuY2VUbyhuZXh0SW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gY29tcGxldGVUdXRvcmlhbCgpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSB0cnVlO1xuICAgIHBlcnNpc3RQcm9ncmVzcyhzdGVwcy5sZW5ndGgsIHRydWUpO1xuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6Y29tcGxldGVkXCIsIHsgaWQgfSk7XG4gICAgc3RvcCgpO1xuICAgIHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnQob3B0aW9ucz86IFN0YXJ0T3B0aW9ucyk6IHZvaWQge1xuICAgIGNvbnN0IHJlc3VtZSA9IG9wdGlvbnM/LnJlc3VtZSAhPT0gZmFsc2U7XG4gICAgaWYgKHJ1bm5pbmcpIHtcbiAgICAgIHJlc3RhcnQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBydW5uaW5nID0gdHJ1ZTtcbiAgICBwYXVzZWQgPSBmYWxzZTtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcbiAgICBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBmYWxzZTtcbiAgICBsZXQgc3RhcnRJbmRleCA9IDA7XG4gICAgaWYgKHJlc3VtZSkge1xuICAgICAgY29uc3QgcHJvZ3Jlc3MgPSBsb2FkUHJvZ3Jlc3MoaWQpO1xuICAgICAgaWYgKHByb2dyZXNzICYmICFwcm9ncmVzcy5jb21wbGV0ZWQpIHtcbiAgICAgICAgc3RhcnRJbmRleCA9IGNsYW1wSW5kZXgocHJvZ3Jlc3Muc3RlcEluZGV4KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2xlYXJQcm9ncmVzcyhpZCk7XG4gICAgfVxuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6c3RhcnRlZFwiLCB7IGlkIH0pO1xuICAgIHNldFN0ZXAoc3RhcnRJbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiByZXN0YXJ0KCk6IHZvaWQge1xuICAgIHN0b3AoKTtcbiAgICBzdGFydCh7IHJlc3VtZTogZmFsc2UgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzdG9wKCk6IHZvaWQge1xuICAgIGNvbnN0IHNob3VsZFBlcnNpc3QgPSAhc3VwcHJlc3NQZXJzaXN0T25TdG9wICYmIHJ1bm5pbmcgJiYgIWxhc3RTYXZlZENvbXBsZXRlZCAmJiBjdXJyZW50SW5kZXggPj0gMCAmJiBjdXJyZW50SW5kZXggPCBzdGVwcy5sZW5ndGg7XG4gICAgY29uc3QgaW5kZXhUb1BlcnNpc3QgPSBjdXJyZW50SW5kZXg7XG5cbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHNob3VsZFBlcnNpc3QpIHtcbiAgICAgIHBlcnNpc3RQcm9ncmVzcyhpbmRleFRvUGVyc2lzdCwgZmFsc2UpO1xuICAgIH1cbiAgICBydW5uaW5nID0gZmFsc2U7XG4gICAgcGF1c2VkID0gZmFsc2U7XG4gICAgY3VycmVudEluZGV4ID0gLTE7XG4gICAgcmVuZGVyQ3VycmVudCA9IG51bGw7XG4gICAgaGlnaGxpZ2h0ZXIuaGlkZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNSdW5uaW5nKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBydW5uaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBzdG9wKCk7XG4gICAgZm9yIChjb25zdCBkaXNwb3NlIG9mIHBlcnNpc3RlbnRMaXN0ZW5lcnMpIHtcbiAgICAgIGRpc3Bvc2UoKTtcbiAgICB9XG4gICAgaGlnaGxpZ2h0ZXIuZGVzdHJveSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGVyc2lzdFByb2dyZXNzKHN0ZXBJbmRleDogbnVtYmVyLCBjb21wbGV0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBjb21wbGV0ZWQ7XG4gICAgc2F2ZVByb2dyZXNzKGlkLCB7XG4gICAgICBzdGVwSW5kZXgsXG4gICAgICBjb21wbGV0ZWQsXG4gICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHN0YXJ0LFxuICAgIHJlc3RhcnQsXG4gICAgc3RvcCxcbiAgICBpc1J1bm5pbmcsXG4gICAgZGVzdHJveSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFR1dG9yaWFsU3RlcCB9IGZyb20gXCIuL2VuZ2luZVwiO1xuXG5mdW5jdGlvbiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkOiB1bmtub3duLCBtaW5JbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGluZGV4ID0gKHBheWxvYWQgYXMgeyBpbmRleD86IHVua25vd24gfSkuaW5kZXg7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09IFwibnVtYmVyXCIgfHwgIU51bWJlci5pc0Zpbml0ZShpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGluZGV4ID49IG1pbkluZGV4O1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Um91dGVJZChwYXlsb2FkOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgcm91dGVJZCA9IChwYXlsb2FkIGFzIHsgcm91dGVJZD86IHVua25vd24gfSkucm91dGVJZDtcbiAgcmV0dXJuIHR5cGVvZiByb3V0ZUlkID09PSBcInN0cmluZ1wiID8gcm91dGVJZCA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIHBheWxvYWRUb29sRXF1YWxzKHRhcmdldDogc3RyaW5nKTogKHBheWxvYWQ6IHVua25vd24pID0+IGJvb2xlYW4ge1xuICByZXR1cm4gKHBheWxvYWQ6IHVua25vd24pOiBib29sZWFuID0+IHtcbiAgICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHRvb2wgPSAocGF5bG9hZCBhcyB7IHRvb2w/OiB1bmtub3duIH0pLnRvb2w7XG4gICAgcmV0dXJuIHR5cGVvZiB0b29sID09PSBcInN0cmluZ1wiICYmIHRvb2wgPT09IHRhcmdldDtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJhc2ljVHV0b3JpYWxTdGVwcygpOiBUdXRvcmlhbFN0ZXBbXSB7XG4gIGxldCByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA9IDA7XG4gIGxldCBpbml0aWFsUm91dGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBuZXdSb3V0ZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICByZXR1cm4gW1xuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtcGxvdC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCBhIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkNsaWNrIG9uIHRoZSBtYXAgdG8gZHJvcCBhdCBsZWFzdCB0aHJlZSB3YXlwb2ludHMgYW5kIHNrZXRjaCB5b3VyIGNvdXJzZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IGhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDIpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtY2hhbmdlLXNwZWVkXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcFNwZWVkU2xpZGVyXCIsXG4gICAgICB0aXRsZTogXCJBZGp1c3Qgc2hpcCBzcGVlZFwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIFNoaXAgU3BlZWQgc2xpZGVyIChvciBwcmVzcyBbIC8gXSkgdG8gZmluZS10dW5lIHlvdXIgdHJhdmVsIHNwZWVkLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6c3BlZWRDaGFuZ2VkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1zZWxlY3QtbGVnXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcFNlbGVjdFwiLFxuICAgICAgdGl0bGU6IFwiU2VsZWN0IGEgcm91dGUgbGVnXCIsXG4gICAgICBib2R5OiBcIlN3aXRjaCB0byBTZWxlY3QgbW9kZSAoVCBrZXkpIGFuZCB0aGVuIGNsaWNrIGEgd2F5cG9pbnQgb24gdGhlIG1hcCB0byBoaWdobGlnaHQgaXRzIGxlZy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOmxlZ1NlbGVjdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAwKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWRlbGV0ZS1sZWdcIixcbiAgICAgIHRhcmdldDogXCJzaGlwRGVsZXRlXCIsXG4gICAgICB0aXRsZTogXCJEZWxldGUgYSByb3V0ZSBsZWdcIixcbiAgICAgIGJvZHk6IFwiUmVtb3ZlIHRoZSBzZWxlY3RlZCB3YXlwb2ludCB1c2luZyB0aGUgRGVsZXRlIGNvbnRyb2wgb3IgdGhlIERlbGV0ZSBrZXkuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDp3YXlwb2ludERlbGV0ZWRcIixcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWNsZWFyLXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcENsZWFyXCIsXG4gICAgICB0aXRsZTogXCJDbGVhciB0aGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiQ2xlYXIgcmVtYWluaW5nIHdheXBvaW50cyB0byByZXNldCB5b3VyIHBsb3R0ZWQgY291cnNlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6Y2xlYXJJbnZva2VkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1zZXQtbW9kZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVTZXRcIixcbiAgICAgIHRpdGxlOiBcIlN3aXRjaCB0byBtaXNzaWxlIHBsYW5uaW5nXCIsXG4gICAgICBib2R5OiBcIlRhcCBTZXQgc28gZXZlcnkgY2xpY2sgZHJvcHMgbWlzc2lsZSB3YXlwb2ludHMgb24gdGhlIGFjdGl2ZSByb3V0ZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOnRvb2xDaGFuZ2VkXCIsXG4gICAgICAgIHdoZW46IHBheWxvYWRUb29sRXF1YWxzKFwic2V0XCIpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtcGxvdC1pbml0aWFsXCIsXG4gICAgICB0YXJnZXQ6IFwiY2FudmFzXCIsXG4gICAgICB0aXRsZTogXCJQbG90IG1pc3NpbGUgd2F5cG9pbnRzXCIsXG4gICAgICBib2R5OiBcIkNsaWNrIHRoZSBtYXAgdG8gZHJvcCBhdCBsZWFzdCB0d28gZ3VpZGFuY2UgcG9pbnRzIGZvciB0aGUgY3VycmVudCBtaXNzaWxlIHJvdXRlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGlmICghaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKHJvdXRlSWQpIHtcbiAgICAgICAgICAgIGluaXRpYWxSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtaW5pdGlhbFwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCB0aGUgc3RyaWtlXCIsXG4gICAgICBib2R5OiBcIlNlbmQgdGhlIHBsYW5uZWQgbWlzc2lsZSByb3V0ZSBsaXZlIHdpdGggdGhlIExhdW5jaCBjb250cm9sIChMIGtleSkuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkKSB7XG4gICAgICAgICAgICBpbml0aWFsUm91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtYWRkLXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUFkZFJvdXRlXCIsXG4gICAgICB0aXRsZTogXCJDcmVhdGUgYSBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJQcmVzcyBOZXcgdG8gYWRkIGEgc2Vjb25kIG1pc3NpbGUgcm91dGUgZm9yIGFub3RoZXIgc3RyaWtlIGdyb3VwLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6cm91dGVBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIXJvdXRlSWQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBuZXdSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXBsb3QtbmV3LXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwiY2FudmFzXCIsXG4gICAgICB0aXRsZTogXCJQbG90IHRoZSBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJEcm9wIGF0IGxlYXN0IHR3byB3YXlwb2ludHMgb24gdGhlIG5ldyByb3V0ZSB0byBkZWZpbmUgaXRzIHBhdGguXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgaWYgKCFoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAxKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAobmV3Um91dGVJZCAmJiByb3V0ZUlkICYmIHJvdXRlSWQgIT09IG5ld1JvdXRlSWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFuZXdSb3V0ZUlkICYmIHJvdXRlSWQpIHtcbiAgICAgICAgICAgIG5ld1JvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1uZXctcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggdGhlIG5ldyByb3V0ZVwiLFxuICAgICAgYm9keTogXCJMYXVuY2ggdGhlIGZyZXNoIG1pc3NpbGUgcm91dGUgdG8gY29uZmlybSBpdHMgcGF0dGVybi5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIW5ld1JvdXRlSWQgfHwgIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBuZXdSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtc3dpdGNoLXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwicm91dGVOZXh0XCIsXG4gICAgICB0aXRsZTogXCJTd2l0Y2ggYmFjayB0byB0aGUgb3JpZ2luYWwgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBcdTI1QzAgXHUyNUI2IGNvbnRyb2xzIChvciBUYWIvU2hpZnQrVGFiKSB0byBzZWxlY3QgeW91ciBmaXJzdCBtaXNzaWxlIHJvdXRlIGFnYWluLlwiLFxuICAgICAgb25FbnRlcjogKCkgPT4ge1xuICAgICAgICByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA9IDA7XG4gICAgICB9LFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgKz0gMTtcbiAgICAgICAgICBpZiAocm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPCAxKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQgfHwgIXJvdXRlSWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gaW5pdGlhbFJvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtYWZ0ZXItc3dpdGNoXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIGZyb20gdGhlIG90aGVyIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkZpcmUgdGhlIG9yaWdpbmFsIG1pc3NpbGUgcm91dGUgdG8gcHJhY3RpY2Ugcm91bmQtcm9iaW4gc3RyaWtlcy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkIHx8ICFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gaW5pdGlhbFJvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwidHV0b3JpYWwtcHJhY3RpY2VcIixcbiAgICAgIHRhcmdldDogXCJzcGF3bkJvdFwiLFxuICAgICAgdGl0bGU6IFwiU3Bhd24gYSBwcmFjdGljZSBib3RcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBCb3QgY29udHJvbCB0byBhZGQgYSB0YXJnZXQgYW5kIHJlaGVhcnNlIHRoZXNlIG1hbmV1dmVycyBpbiByZWFsIHRpbWUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiYm90OnNwYXduUmVxdWVzdGVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInR1dG9yaWFsLWNvbXBsZXRlXCIsXG4gICAgICB0YXJnZXQ6IG51bGwsXG4gICAgICB0aXRsZTogXCJZb3VcdTIwMTlyZSByZWFkeVwiLFxuICAgICAgYm9keTogXCJHcmVhdCB3b3JrLiBSZWxvYWQgdGhlIGNvbnNvbGUgb3IgcmVqb2luIGEgcm9vbSB0byByZXZpc2l0IHRoZXNlIGRyaWxscy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJtYW51YWxcIixcbiAgICAgICAgbmV4dExhYmVsOiBcIkZpbmlzaFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgXTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlVHV0b3JpYWxFbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IGNyZWF0ZVJvbGVzIH0gZnJvbSBcIi4vcm9sZXNcIjtcbmltcG9ydCB7IGdldEJhc2ljVHV0b3JpYWxTdGVwcyB9IGZyb20gXCIuL3N0ZXBzX2Jhc2ljXCI7XG5leHBvcnQgY29uc3QgQkFTSUNfVFVUT1JJQUxfSUQgPSBcInNoaXAtYmFzaWNzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxDb250cm9sbGVyIHtcbiAgc3RhcnQob3B0aW9ucz86IHsgcmVzdW1lPzogYm9vbGVhbiB9KTogdm9pZDtcbiAgcmVzdGFydCgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3VudFR1dG9yaWFsKGJ1czogRXZlbnRCdXMpOiBUdXRvcmlhbENvbnRyb2xsZXIge1xuICBjb25zdCByb2xlcyA9IGNyZWF0ZVJvbGVzKCk7XG4gIGNvbnN0IGVuZ2luZSA9IGNyZWF0ZVR1dG9yaWFsRW5naW5lKHtcbiAgICBpZDogQkFTSUNfVFVUT1JJQUxfSUQsXG4gICAgYnVzLFxuICAgIHJvbGVzLFxuICAgIHN0ZXBzOiBnZXRCYXNpY1R1dG9yaWFsU3RlcHMoKSxcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydChvcHRpb25zKSB7XG4gICAgICBlbmdpbmUuc3RhcnQob3B0aW9ucyk7XG4gICAgfSxcbiAgICByZXN0YXJ0KCkge1xuICAgICAgZW5naW5lLnJlc3RhcnQoKTtcbiAgICB9LFxuICAgIGRlc3Ryb3koKSB7XG4gICAgICBlbmdpbmUuZGVzdHJveSgpO1xuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi4vc3RhdGVcIjtcblxuZXhwb3J0IGludGVyZmFjZSBEaWFsb2d1ZUNob2ljZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaWFsb2d1ZUNvbnRlbnQge1xuICBzcGVha2VyOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbiAgaW50ZW50PzogXCJmYWN0b3J5XCIgfCBcInVuaXRcIjtcbiAgY2hvaWNlcz86IERpYWxvZ3VlQ2hvaWNlW107XG4gIHR5cGluZ1NwZWVkTXM/OiBudW1iZXI7XG4gIG9uQ2hvaWNlPzogKGNob2ljZUlkOiBzdHJpbmcpID0+IHZvaWQ7XG4gIG9uVGV4dEZ1bGx5UmVuZGVyZWQ/OiAoKSA9PiB2b2lkO1xuICBvbkNvbnRpbnVlPzogKCkgPT4gdm9pZDtcbiAgY29udGludWVMYWJlbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaWFsb2d1ZU92ZXJsYXkge1xuICBzaG93KGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQ7XG4gIGhpZGUoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICBpc1Zpc2libGUoKTogYm9vbGVhbjtcbn1cblxuY29uc3QgU1RZTEVfSUQgPSBcImRpYWxvZ3VlLW92ZXJsYXktc3R5bGVcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSgpOiBEaWFsb2d1ZU92ZXJsYXkge1xuICBlbnN1cmVTdHlsZXMoKTtcblxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgb3ZlcmxheS5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLW92ZXJsYXlcIjtcbiAgb3ZlcmxheS5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxpdmVcIiwgXCJwb2xpdGVcIik7XG5cbiAgY29uc3QgY29uc29sZUZyYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgY29uc29sZUZyYW1lLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY29uc29sZVwiO1xuXG4gIGNvbnN0IHNwZWFrZXJMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNwZWFrZXJMYWJlbC5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLXNwZWFrZXJcIjtcblxuICBjb25zdCB0ZXh0QmxvY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0ZXh0QmxvY2suY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS10ZXh0XCI7XG5cbiAgY29uc3QgY3Vyc29yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIGN1cnNvci5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWN1cnNvclwiO1xuICBjdXJzb3IudGV4dENvbnRlbnQgPSBcIl9cIjtcblxuICBjb25zdCBjaG9pY2VzTGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ1bFwiKTtcbiAgY2hvaWNlc0xpc3QuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jaG9pY2VzIGhpZGRlblwiO1xuXG4gIGNvbnN0IGNvbnRpbnVlQnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgY29udGludWVCdXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGNvbnRpbnVlQnV0dG9uLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY29udGludWUgaGlkZGVuXCI7XG4gIGNvbnRpbnVlQnV0dG9uLnRleHRDb250ZW50ID0gXCJDb250aW51ZVwiO1xuXG4gIHRleHRCbG9jay5hcHBlbmQoY3Vyc29yKTtcbiAgY29uc29sZUZyYW1lLmFwcGVuZChzcGVha2VyTGFiZWwsIHRleHRCbG9jaywgY2hvaWNlc0xpc3QsIGNvbnRpbnVlQnV0dG9uKTtcbiAgb3ZlcmxheS5hcHBlbmQoY29uc29sZUZyYW1lKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICBsZXQgdmlzaWJsZSA9IGZhbHNlO1xuICBsZXQgdHlwaW5nSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IHRhcmdldFRleHQgPSBcIlwiO1xuICBsZXQgcmVuZGVyZWRDaGFycyA9IDA7XG4gIGxldCBhY3RpdmVDb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBjbGVhclR5cGluZygpOiB2b2lkIHtcbiAgICBpZiAodHlwaW5nSGFuZGxlICE9PSBudWxsKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHR5cGluZ0hhbmRsZSk7XG4gICAgICB0eXBpbmdIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmlzaFR5cGluZyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICByZW5kZXJlZENoYXJzID0gdGFyZ2V0VGV4dC5sZW5ndGg7XG4gICAgdXBkYXRlVGV4dCgpO1xuICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgY29udGVudC5vblRleHRGdWxseVJlbmRlcmVkPy4oKTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSB8fCBjb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBzaG93Q29udGludWUoY29udGVudCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlVGV4dCgpOiB2b2lkIHtcbiAgICBjb25zdCB0ZXh0VG9TaG93ID0gdGFyZ2V0VGV4dC5zbGljZSgwLCByZW5kZXJlZENoYXJzKTtcbiAgICB0ZXh0QmxvY2suaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjb25zdCB0ZXh0Tm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgIHRleHROb2RlLnRleHRDb250ZW50ID0gdGV4dFRvU2hvdztcbiAgICB0ZXh0QmxvY2suYXBwZW5kKHRleHROb2RlLCBjdXJzb3IpO1xuICAgIGN1cnNvci5jbGFzc0xpc3QudG9nZ2xlKFwiaGlkZGVuXCIsICF2aXNpYmxlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlckNob2ljZXMoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgY2hvaWNlc0xpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjb25zdCBjaG9pY2VzID0gQXJyYXkuaXNBcnJheShjb250ZW50LmNob2ljZXMpID8gY29udGVudC5jaG9pY2VzIDogW107XG4gICAgaWYgKGNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIGNob2ljZXMuZm9yRWFjaCgoY2hvaWNlLCBpbmRleCkgPT4ge1xuICAgICAgY29uc3QgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsaVwiKTtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICBidXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgICBidXR0b24uZGF0YXNldC5jaG9pY2VJZCA9IGNob2ljZS5pZDtcbiAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9IGAke2luZGV4ICsgMX0uICR7Y2hvaWNlLnRleHR9YDtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgICBjb250ZW50Lm9uQ2hvaWNlPy4oY2hvaWNlLmlkKTtcbiAgICAgIH0pO1xuICAgICAgaXRlbS5hcHBlbmQoYnV0dG9uKTtcbiAgICAgIGNob2ljZXNMaXN0LmFwcGVuZChpdGVtKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3dDb250aW51ZShjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBpZiAoIWNvbnRlbnQub25Db250aW51ZSkge1xuICAgICAgY29udGludWVCdXR0b24uY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSBudWxsO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb250aW51ZUJ1dHRvbi50ZXh0Q29udGVudCA9IGNvbnRlbnQuY29udGludWVMYWJlbCA/PyBcIkNvbnRpbnVlXCI7XG4gICAgY29udGludWVCdXR0b24uY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gKCkgPT4ge1xuICAgICAgY29udGVudC5vbkNvbnRpbnVlPy4oKTtcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gc2NoZWR1bGVUeXBlKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgY29uc3QgdHlwaW5nU3BlZWQgPSBjbGFtcChOdW1iZXIoY29udGVudC50eXBpbmdTcGVlZE1zKSB8fCAxOCwgOCwgNjQpO1xuICAgIGNvbnN0IHRpY2sgPSAoKTogdm9pZCA9PiB7XG4gICAgICByZW5kZXJlZENoYXJzID0gTWF0aC5taW4ocmVuZGVyZWRDaGFycyArIDEsIHRhcmdldFRleHQubGVuZ3RoKTtcbiAgICAgIHVwZGF0ZVRleHQoKTtcbiAgICAgIGlmIChyZW5kZXJlZENoYXJzID49IHRhcmdldFRleHQubGVuZ3RoKSB7XG4gICAgICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgICAgIGNvbnRlbnQub25UZXh0RnVsbHlSZW5kZXJlZD8uKCk7XG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShjb250ZW50LmNob2ljZXMpIHx8IGNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBzaG93Q29udGludWUoY29udGVudCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHR5cGluZ0hhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KHRpY2ssIHR5cGluZ1NwZWVkKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHR5cGluZ0hhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KHRpY2ssIHR5cGluZ1NwZWVkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUgfHwgIWFjdGl2ZUNvbnRlbnQpIHJldHVybjtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYWN0aXZlQ29udGVudC5jaG9pY2VzKSB8fCBhY3RpdmVDb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBpZiAoZXZlbnQua2V5ID09PSBcIiBcIiB8fCBldmVudC5rZXkgPT09IFwiRW50ZXJcIikge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBpZiAocmVuZGVyZWRDaGFycyA8IHRhcmdldFRleHQubGVuZ3RoKSB7XG4gICAgICAgICAgZmluaXNoVHlwaW5nKGFjdGl2ZUNvbnRlbnQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFjdGl2ZUNvbnRlbnQub25Db250aW51ZT8uKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaW5kZXggPSBwYXJzZUludChldmVudC5rZXksIDEwKTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKGluZGV4KSAmJiBpbmRleCA+PSAxICYmIGluZGV4IDw9IGFjdGl2ZUNvbnRlbnQuY2hvaWNlcy5sZW5ndGgpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBjaG9pY2UgPSBhY3RpdmVDb250ZW50LmNob2ljZXNbaW5kZXggLSAxXTtcbiAgICAgIGFjdGl2ZUNvbnRlbnQub25DaG9pY2U/LihjaG9pY2UuaWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIgJiYgcmVuZGVyZWRDaGFycyA8IHRhcmdldFRleHQubGVuZ3RoKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZmluaXNoVHlwaW5nKGFjdGl2ZUNvbnRlbnQpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3coY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgYWN0aXZlQ29udGVudCA9IGNvbnRlbnQ7XG4gICAgdmlzaWJsZSA9IHRydWU7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICBvdmVybGF5LmRhdGFzZXQuaW50ZW50ID0gY29udGVudC5pbnRlbnQgPz8gXCJmYWN0b3J5XCI7XG4gICAgc3BlYWtlckxhYmVsLnRleHRDb250ZW50ID0gY29udGVudC5zcGVha2VyO1xuXG4gICAgdGFyZ2V0VGV4dCA9IGNvbnRlbnQudGV4dDtcbiAgICByZW5kZXJlZENoYXJzID0gMDtcbiAgICB1cGRhdGVUZXh0KCk7XG4gICAgcmVuZGVyQ2hvaWNlcyhjb250ZW50KTtcbiAgICBzaG93Q29udGludWUoY29udGVudCk7XG4gICAgc2NoZWR1bGVUeXBlKGNvbnRlbnQpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGlkZSgpOiB2b2lkIHtcbiAgICB2aXNpYmxlID0gZmFsc2U7XG4gICAgYWN0aXZlQ29udGVudCA9IG51bGw7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIHRhcmdldFRleHQgPSBcIlwiO1xuICAgIHJlbmRlcmVkQ2hhcnMgPSAwO1xuICAgIHRleHRCbG9jay5pbm5lckhUTUwgPSBcIlwiO1xuICAgIHRleHRCbG9jay5hcHBlbmQoY3Vyc29yKTtcbiAgICBjaG9pY2VzTGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24uY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gbnVsbDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgaGlkZSgpO1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleURvd24pO1xuICAgIG92ZXJsYXkucmVtb3ZlKCk7XG4gIH1cblxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duKTtcblxuICByZXR1cm4ge1xuICAgIHNob3csXG4gICAgaGlkZSxcbiAgICBkZXN0cm95LFxuICAgIGlzVmlzaWJsZSgpIHtcbiAgICAgIHJldHVybiB2aXNpYmxlO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNUWUxFX0lEKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgc3R5bGUuaWQgPSBTVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLmRpYWxvZ3VlLW92ZXJsYXkge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gICAgICB6LWluZGV4OiA2MDtcbiAgICAgIG9wYWNpdHk6IDA7XG4gICAgICB0cmFuc2l0aW9uOiBvcGFjaXR5IDAuMnMgZWFzZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXkudmlzaWJsZSB7XG4gICAgICBvcGFjaXR5OiAxO1xuICAgICAgcG9pbnRlci1ldmVudHM6IGF1dG87XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIG1pbi13aWR0aDogMzIwcHg7XG4gICAgICBtYXgtd2lkdGg6IG1pbig1MjBweCwgY2FsYygxMDB2dyAtIDQ4cHgpKTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNiwgMTEsIDE2LCAwLjkyKTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBib3JkZXItcmFkaXVzOiAxMnB4O1xuICAgICAgcGFkZGluZzogMThweCAyMHB4O1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBnYXA6IDE0cHg7XG4gICAgICBib3gtc2hhZG93OiAwIDI4cHggNjRweCByZ2JhKDIsIDYsIDE2LCAwLjYpO1xuICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICBmb250LWZhbWlseTogXCJJQk0gUGxleCBNb25vXCIsIFwiSmV0QnJhaW5zIE1vbm9cIiwgdWktbW9ub3NwYWNlLCBTRk1vbm8tUmVndWxhciwgTWVubG8sIE1vbmFjbywgQ29uc29sYXMsIFwiTGliZXJhdGlvbiBNb25vXCIsIFwiQ291cmllciBOZXdcIiwgbW9ub3NwYWNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheVtkYXRhLWludGVudD1cImZhY3RvcnlcIl0gLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC40NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDI4cHggNjRweCByZ2JhKDEzLCAxNDgsIDEzNiwgMC4zNSk7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5W2RhdGEtaW50ZW50PVwidW5pdFwiXSAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMjQ0LCAxMTQsIDE4MiwgMC40NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDI4cHggNjRweCByZ2JhKDIzNiwgNzIsIDE1MywgMC4yOCk7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1zcGVha2VyIHtcbiAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjE2ZW07XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC43NSk7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS10ZXh0IHtcbiAgICAgIG1pbi1oZWlnaHQ6IDkwcHg7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBsaW5lLWhlaWdodDogMS41NTtcbiAgICAgIHdoaXRlLXNwYWNlOiBwcmUtd3JhcDtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWN1cnNvciB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgICBtYXJnaW4tbGVmdDogNHB4O1xuICAgICAgYW5pbWF0aW9uOiBkaWFsb2d1ZS1jdXJzb3ItYmxpbmsgMS4ycyBzdGVwcygyLCBzdGFydCkgaW5maW5pdGU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jdXJzb3IuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIHtcbiAgICAgIGxpc3Qtc3R5bGU6IG5vbmU7XG4gICAgICBtYXJnaW46IDA7XG4gICAgICBwYWRkaW5nOiAwO1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBnYXA6IDhweDtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbixcbiAgICAuZGlhbG9ndWUtY29udGludWUge1xuICAgICAgZm9udDogaW5oZXJpdDtcbiAgICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gICAgICBwYWRkaW5nOiA4cHggMTBweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zKTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjQsIDM2LCA0OCwgMC44NSk7XG4gICAgICBjb2xvcjogaW5oZXJpdDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xOHMgZWFzZSwgYm9yZGVyLWNvbG9yIDAuMThzIGVhc2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jb250aW51ZSB7XG4gICAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jb250aW51ZS5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uOmhvdmVyLFxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbjpmb2N1cy12aXNpYmxlLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZTpob3ZlcixcbiAgICAuZGlhbG9ndWUtY29udGludWU6Zm9jdXMtdmlzaWJsZSB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjU1KTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMzAsIDQ1LCA2MCwgMC45NSk7XG4gICAgICBvdXRsaW5lOiBub25lO1xuICAgIH1cbiAgICBAa2V5ZnJhbWVzIGRpYWxvZ3VlLWN1cnNvci1ibGluayB7XG4gICAgICAwJSwgNTAlIHsgb3BhY2l0eTogMTsgfVxuICAgICAgNTAuMDElLCAxMDAlIHsgb3BhY2l0eTogMDsgfVxuICAgIH1cbiAgYDtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbiIsICJjb25zdCBTVE9SQUdFX1BSRUZJWCA9IFwibHNkOnN0b3J5OlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5RmxhZ3Mge1xuICBba2V5OiBzdHJpbmddOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5UHJvZ3Jlc3Mge1xuICBjaGFwdGVySWQ6IHN0cmluZztcbiAgbm9kZUlkOiBzdHJpbmc7XG4gIGZsYWdzOiBTdG9yeUZsYWdzO1xuICB2aXNpdGVkPzogc3RyaW5nW107XG4gIHVwZGF0ZWRBdDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBnZXRTdG9yYWdlKCk6IFN0b3JhZ2UgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIiB8fCAhd2luZG93LmxvY2FsU3RvcmFnZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbn1cblxuZnVuY3Rpb24gc3RvcmFnZUtleShjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgY29uc3Qgcm9vbVNlZ21lbnQgPSByb29tSWQgPyBgJHtyb29tSWR9OmAgOiBcIlwiO1xuICByZXR1cm4gYCR7U1RPUkFHRV9QUkVGSVh9JHtyb29tU2VnbWVudH0ke2NoYXB0ZXJJZH1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZFN0b3J5UHJvZ3Jlc3MoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IFN0b3J5UHJvZ3Jlc3MgfCBudWxsIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSBzdG9yYWdlLmdldEl0ZW0oc3RvcmFnZUtleShjaGFwdGVySWQsIHJvb21JZCkpO1xuICAgIGlmICghcmF3KSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgU3RvcnlQcm9ncmVzcztcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgcGFyc2VkICE9PSBcIm9iamVjdFwiIHx8IHBhcnNlZCA9PT0gbnVsbCB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5jaGFwdGVySWQgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQubm9kZUlkICE9PSBcInN0cmluZ1wiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnVwZGF0ZWRBdCAhPT0gXCJudW1iZXJcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5mbGFncyAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQuZmxhZ3MgPT09IG51bGxcbiAgICApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgY2hhcHRlcklkOiBwYXJzZWQuY2hhcHRlcklkLFxuICAgICAgbm9kZUlkOiBwYXJzZWQubm9kZUlkLFxuICAgICAgZmxhZ3M6IHsgLi4ucGFyc2VkLmZsYWdzIH0sXG4gICAgICB2aXNpdGVkOiBBcnJheS5pc0FycmF5KHBhcnNlZC52aXNpdGVkKSA/IFsuLi5wYXJzZWQudmlzaXRlZF0gOiB1bmRlZmluZWQsXG4gICAgICB1cGRhdGVkQXQ6IHBhcnNlZC51cGRhdGVkQXQsXG4gICAgfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHByb2dyZXNzOiBTdG9yeVByb2dyZXNzKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2Uuc2V0SXRlbShzdG9yYWdlS2V5KGNoYXB0ZXJJZCwgcm9vbUlkKSwgSlNPTi5zdHJpbmdpZnkocHJvZ3Jlc3MpKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gaWdub3JlIHBlcnNpc3RlbmNlIGVycm9yc1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclN0b3J5UHJvZ3Jlc3MoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnJlbW92ZUl0ZW0oc3RvcmFnZUtleShjaGFwdGVySWQsIHJvb21JZCkpO1xuICB9IGNhdGNoIHtcbiAgICAvLyBpZ25vcmUgcGVyc2lzdGVuY2UgZXJyb3JzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUZsYWcoY3VycmVudDogU3RvcnlGbGFncywgZmxhZzogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbik6IFN0b3J5RmxhZ3Mge1xuICBjb25zdCBuZXh0ID0geyAuLi5jdXJyZW50IH07XG4gIGlmICghdmFsdWUpIHtcbiAgICBkZWxldGUgbmV4dFtmbGFnXTtcbiAgfSBlbHNlIHtcbiAgICBuZXh0W2ZsYWddID0gdHJ1ZTtcbiAgfVxuICByZXR1cm4gbmV4dDtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFBSTkcgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgY2xhc3MgQXVkaW9FbmdpbmUge1xuICBwcml2YXRlIHN0YXRpYyBfaW5zdDogQXVkaW9FbmdpbmUgfCBudWxsID0gbnVsbDtcblxuICBwdWJsaWMgcmVhZG9ubHkgY3R4OiBBdWRpb0NvbnRleHQ7XG4gIHByaXZhdGUgcmVhZG9ubHkgbWFzdGVyOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSByZWFkb25seSBtdXNpY0J1czogR2Fpbk5vZGU7XG4gIHByaXZhdGUgcmVhZG9ubHkgc2Z4QnVzOiBHYWluTm9kZTtcblxuICBwcml2YXRlIF90YXJnZXRNYXN0ZXIgPSAwLjk7XG4gIHByaXZhdGUgX3RhcmdldE11c2ljID0gMC45O1xuICBwcml2YXRlIF90YXJnZXRTZnggPSAwLjk7XG5cbiAgc3RhdGljIGdldCgpOiBBdWRpb0VuZ2luZSB7XG4gICAgaWYgKCF0aGlzLl9pbnN0KSB0aGlzLl9pbnN0ID0gbmV3IEF1ZGlvRW5naW5lKCk7XG4gICAgcmV0dXJuIHRoaXMuX2luc3Q7XG4gIH1cblxuICBwcml2YXRlIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuY3R4ID0gbmV3IEF1ZGlvQ29udGV4dCgpO1xuICAgICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYID0gKHRoaXMgYXMgYW55KS5jdHg7XG5cbiAgICB0aGlzLm1hc3RlciA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiB0aGlzLl90YXJnZXRNYXN0ZXIgfSk7XG4gICAgdGhpcy5tdXNpY0J1cyA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiB0aGlzLl90YXJnZXRNdXNpYyB9KTtcbiAgICB0aGlzLnNmeEJ1cyA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiB0aGlzLl90YXJnZXRTZnggfSk7XG5cbiAgICB0aGlzLm11c2ljQnVzLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMuc2Z4QnVzLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMubWFzdGVyLmNvbm5lY3QodGhpcy5jdHguZGVzdGluYXRpb24pO1xuICB9XG5cbiAgZ2V0IG5vdygpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgfVxuXG4gIGdldE11c2ljQnVzKCk6IEdhaW5Ob2RlIHtcbiAgICByZXR1cm4gdGhpcy5tdXNpY0J1cztcbiAgfVxuXG4gIGdldFNmeEJ1cygpOiBHYWluTm9kZSB7XG4gICAgcmV0dXJuIHRoaXMuc2Z4QnVzO1xuICB9XG5cbiAgYXN5bmMgcmVzdW1lKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmN0eC5zdGF0ZSA9PT0gXCJzdXNwZW5kZWRcIikge1xuICAgICAgYXdhaXQgdGhpcy5jdHgucmVzdW1lKCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3VzcGVuZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5jdHguc3RhdGUgPT09IFwicnVubmluZ1wiKSB7XG4gICAgICBhd2FpdCB0aGlzLmN0eC5zdXNwZW5kKCk7XG4gICAgfVxuICB9XG5cbiAgc2V0TWFzdGVyR2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRNYXN0ZXIgPSB2O1xuICAgIHRoaXMubWFzdGVyLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubWFzdGVyLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgc2V0TXVzaWNHYWluKHY6IG51bWJlciwgdCA9IHRoaXMubm93LCByYW1wID0gMC4wMyk6IHZvaWQge1xuICAgIHRoaXMuX3RhcmdldE11c2ljID0gdjtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2LCB0ICsgcmFtcCk7XG4gIH1cblxuICBzZXRTZnhHYWluKHY6IG51bWJlciwgdCA9IHRoaXMubm93LCByYW1wID0gMC4wMyk6IHZvaWQge1xuICAgIHRoaXMuX3RhcmdldFNmeCA9IHY7XG4gICAgdGhpcy5zZnhCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5zZnhCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2LCB0ICsgcmFtcCk7XG4gIH1cblxuICBkdWNrTXVzaWMobGV2ZWwgPSAwLjQsIGF0dGFjayA9IDAuMDUpOiB2b2lkIHtcbiAgICBjb25zdCB0ID0gdGhpcy5ub3c7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUobGV2ZWwsIHQgKyBhdHRhY2spO1xuICB9XG5cbiAgdW5kdWNrTXVzaWMocmVsZWFzZSA9IDAuMjUpOiB2b2lkIHtcbiAgICBjb25zdCB0ID0gdGhpcy5ub3c7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGhpcy5fdGFyZ2V0TXVzaWMsIHQgKyByZWxlYXNlKTtcbiAgfVxufVxuXG4vLyBUaW55IHNlZWRhYmxlIFBSTkcgKE11bGJlcnJ5MzIpXG5leHBvcnQgZnVuY3Rpb24gbWFrZVBSTkcoc2VlZDogbnVtYmVyKTogUFJORyB7XG4gIGxldCBzID0gKHNlZWQgPj4+IDApIHx8IDE7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcyArPSAweDZEMkI3OUY1O1xuICAgIGxldCB0ID0gTWF0aC5pbXVsKHMgXiAocyA+Pj4gMTUpLCAxIHwgcyk7XG4gICAgdCBePSB0ICsgTWF0aC5pbXVsKHQgXiAodCA+Pj4gNyksIDYxIHwgdCk7XG4gICAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG4gIH07XG59XG4iLCAiLy8gTG93LWxldmVsIGdyYXBoIGJ1aWxkZXJzIC8gaGVscGVyc1xuXG5leHBvcnQgZnVuY3Rpb24gb3NjKGN0eDogQXVkaW9Db250ZXh0LCB0eXBlOiBPc2NpbGxhdG9yVHlwZSwgZnJlcTogbnVtYmVyKSB7XG4gIHJldHVybiBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGUsIGZyZXF1ZW5jeTogZnJlcSB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vaXNlKGN0eDogQXVkaW9Db250ZXh0KSB7XG4gIGNvbnN0IGJ1ZmZlciA9IGN0eC5jcmVhdGVCdWZmZXIoMSwgY3R4LnNhbXBsZVJhdGUgKiAyLCBjdHguc2FtcGxlUmF0ZSk7XG4gIGNvbnN0IGRhdGEgPSBidWZmZXIuZ2V0Q2hhbm5lbERhdGEoMCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKykgZGF0YVtpXSA9IE1hdGgucmFuZG9tKCkgKiAyIC0gMTtcbiAgcmV0dXJuIG5ldyBBdWRpb0J1ZmZlclNvdXJjZU5vZGUoY3R4LCB7IGJ1ZmZlciwgbG9vcDogdHJ1ZSB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VQYW5uZXIoY3R4OiBBdWRpb0NvbnRleHQsIHBhbiA9IDApIHtcbiAgcmV0dXJuIG5ldyBTdGVyZW9QYW5uZXJOb2RlKGN0eCwgeyBwYW4gfSk7XG59XG5cbi8qKiBCYXNpYyBBRFNSIGFwcGxpZWQgdG8gYSBHYWluTm9kZSBBdWRpb1BhcmFtLiBSZXR1cm5zIGEgZnVuY3Rpb24gdG8gcmVsZWFzZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZHNyKFxuICBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgcGFyYW06IEF1ZGlvUGFyYW0sXG4gIHQwOiBudW1iZXIsXG4gIGEgPSAwLjAxLCAvLyBhdHRhY2tcbiAgZCA9IDAuMDgsIC8vIGRlY2F5XG4gIHMgPSAwLjUsICAvLyBzdXN0YWluICgwLi4xIG9mIHBlYWspXG4gIHIgPSAwLjIsICAvLyByZWxlYXNlXG4gIHBlYWsgPSAxXG4pIHtcbiAgcGFyYW0uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQwKTtcbiAgcGFyYW0uc2V0VmFsdWVBdFRpbWUoMCwgdDApO1xuICBwYXJhbS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShwZWFrLCB0MCArIGEpO1xuICBwYXJhbS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShzICogcGVhaywgdDAgKyBhICsgZCk7XG4gIHJldHVybiAocmVsZWFzZUF0ID0gY3R4LmN1cnJlbnRUaW1lKSA9PiB7XG4gICAgcGFyYW0uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHJlbGVhc2VBdCk7XG4gICAgLy8gYXZvaWQgc3VkZGVuIGp1bXBzOyBjb250aW51ZSBmcm9tIGN1cnJlbnRcbiAgICBwYXJhbS5zZXRWYWx1ZUF0VGltZShwYXJhbS52YWx1ZSwgcmVsZWFzZUF0KTtcbiAgICBwYXJhbS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDEsIHJlbGVhc2VBdCArIHIpO1xuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGZvVG9QYXJhbShcbiAgY3R4OiBBdWRpb0NvbnRleHQsXG4gIHRhcmdldDogQXVkaW9QYXJhbSxcbiAgeyBmcmVxdWVuY3kgPSAwLjEsIGRlcHRoID0gMzAwLCB0eXBlID0gXCJzaW5lXCIgYXMgT3NjaWxsYXRvclR5cGUgfSA9IHt9XG4pIHtcbiAgY29uc3QgbGZvID0gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlLCBmcmVxdWVuY3kgfSk7XG4gIGNvbnN0IGFtcCA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogZGVwdGggfSk7XG4gIGxmby5jb25uZWN0KGFtcCkuY29ubmVjdCh0YXJnZXQpO1xuICByZXR1cm4ge1xuICAgIHN0YXJ0KGF0ID0gY3R4LmN1cnJlbnRUaW1lKSB7IGxmby5zdGFydChhdCk7IH0sXG4gICAgc3RvcChhdCA9IGN0eC5jdXJyZW50VGltZSkgeyBsZm8uc3RvcChhdCk7IGFtcC5kaXNjb25uZWN0KCk7IH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IGFkc3IsIG1ha2VQYW5uZXIsIG5vaXNlLCBvc2MgfSBmcm9tIFwiLi9ncmFwaFwiO1xuaW1wb3J0IHR5cGUgeyBTZnhOYW1lIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuLyoqIEZpcmUtYW5kLWZvcmdldCBTRlggYnkgbmFtZSwgd2l0aCBzaW1wbGUgcGFyYW1zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYXlTZngoXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIG5hbWU6IFNmeE5hbWUsXG4gIG9wdHM6IHsgdmVsb2NpdHk/OiBudW1iZXI7IHBhbj86IG51bWJlciB9ID0ge31cbikge1xuICBzd2l0Y2ggKG5hbWUpIHtcbiAgICBjYXNlIFwibGFzZXJcIjogcmV0dXJuIHBsYXlMYXNlcihlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJ0aHJ1c3RcIjogcmV0dXJuIHBsYXlUaHJ1c3QoZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwiZXhwbG9zaW9uXCI6IHJldHVybiBwbGF5RXhwbG9zaW9uKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImxvY2tcIjogcmV0dXJuIHBsYXlMb2NrKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcInVpXCI6IHJldHVybiBwbGF5VWkoZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwiZGlhbG9ndWVcIjogcmV0dXJuIHBsYXlEaWFsb2d1ZShlbmdpbmUsIG9wdHMpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5TGFzZXIoXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInNxdWFyZVwiLCA2ODAgKyAxNjAgKiB2ZWxvY2l0eSk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHsgdHlwZTogXCJsb3dwYXNzXCIsIGZyZXF1ZW5jeTogMTIwMCB9KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChmKS5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwMiwgMC4wMywgMC4yNSwgMC4wOCwgMC42NSk7XG4gIG8uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjA2KTtcbiAgby5zdG9wKG5vdyArIDAuMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5VGhydXN0KFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMC42LCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG4gPSBub2lzZShjdHgpO1xuICBjb25zdCBmID0gbmV3IEJpcXVhZEZpbHRlck5vZGUoY3R4LCB7XG4gICAgdHlwZTogXCJiYW5kcGFzc1wiLFxuICAgIGZyZXF1ZW5jeTogMTgwICsgMzYwICogdmVsb2NpdHksXG4gICAgUTogMS4xLFxuICB9KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG4uY29ubmVjdChmKS5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAxMiwgMC4xNSwgMC43NSwgMC4yNSwgMC40NSAqIHZlbG9jaXR5KTtcbiAgbi5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMjUpO1xuICBuLnN0b3Aobm93ICsgMS4wKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlFeHBsb3Npb24oXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG4gPSBub2lzZShjdHgpO1xuICBjb25zdCBmID0gbmV3IEJpcXVhZEZpbHRlck5vZGUoY3R4LCB7XG4gICAgdHlwZTogXCJsb3dwYXNzXCIsXG4gICAgZnJlcXVlbmN5OiAyMjAwICogTWF0aC5tYXgoMC4yLCBNYXRoLm1pbih2ZWxvY2l0eSwgMSkpLFxuICAgIFE6IDAuMixcbiAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBuLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDUsIDAuMDgsIDAuNSwgMC4zNSwgMS4xICogdmVsb2NpdHkpO1xuICBuLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4xNSArIDAuMSAqIHZlbG9jaXR5KTtcbiAgbi5zdG9wKG5vdyArIDEuMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5TG9jayhcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgYmFzZSA9IDUyMCArIDE0MCAqIHZlbG9jaXR5O1xuICBjb25zdCBvMSA9IG9zYyhjdHgsIFwic2luZVwiLCBiYXNlKTtcbiAgY29uc3QgbzIgPSBvc2MoY3R4LCBcInNpbmVcIiwgYmFzZSAqIDEuNSk7XG5cbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8xLmNvbm5lY3QoZyk7IG8yLmNvbm5lY3QoZyk7XG4gIGcuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG5cbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDEsIDAuMDIsIDAuMCwgMC4xMiwgMC42KTtcbiAgbzEuc3RhcnQobm93KTsgbzIuc3RhcnQobm93ICsgMC4wMik7XG4gIHJlbGVhc2Uobm93ICsgMC4wNik7XG4gIG8xLnN0b3Aobm93ICsgMC4yKTsgbzIuc3RvcChub3cgKyAwLjIyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlVaShlbmdpbmU6IEF1ZGlvRW5naW5lLCB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge30pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbyA9IG9zYyhjdHgsIFwidHJpYW5nbGVcIiwgODgwIC0gMTIwICogdmVsb2NpdHkpO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgby5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwMSwgMC4wNCwgMC4wLCAwLjA4LCAwLjM1KTtcbiAgby5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMDUpO1xuICBvLnN0b3Aobm93ICsgMC4xOCk7XG59XG5cbi8qKiBEaWFsb2d1ZSBjdWUgdXNlZCBieSB0aGUgc3Rvcnkgb3ZlcmxheSAoc2hvcnQsIGdlbnRsZSBwaW5nKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RGlhbG9ndWUoZW5naW5lOiBBdWRpb0VuZ2luZSwgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9KSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IGZyZXEgPSA0ODAgKyAxNjAgKiB2ZWxvY2l0eTtcbiAgY29uc3QgbyA9IG9zYyhjdHgsIFwic2luZVwiLCBmcmVxKTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMC4wMDAxIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgby5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBnLmdhaW4uc2V0VmFsdWVBdFRpbWUoMC4wMDAxLCBub3cpO1xuICBnLmdhaW4uZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSgwLjA0LCBub3cgKyAwLjAyKTtcbiAgZy5nYWluLmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUoMC4wMDA1LCBub3cgKyAwLjI4KTtcblxuICBvLnN0YXJ0KG5vdyk7XG4gIG8uc3RvcChub3cgKyAwLjMpO1xufVxuIiwgImltcG9ydCB0eXBlIHsgU3RvcnlJbnRlbnQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi4vYXVkaW8vZW5naW5lXCI7XG5pbXBvcnQgeyBwbGF5RGlhbG9ndWUgYXMgcGxheURpYWxvZ3VlU2Z4IH0gZnJvbSBcIi4uL2F1ZGlvL3NmeFwiO1xuXG5sZXQgbGFzdFBsYXllZEF0ID0gMDtcblxuLy8gTWFpbnRhaW4gdGhlIG9sZCBwdWJsaWMgQVBJIHNvIGVuZ2luZS50cyBkb2Vzbid0IGNoYW5nZVxuZXhwb3J0IGZ1bmN0aW9uIGdldEF1ZGlvQ29udGV4dCgpOiBBdWRpb0NvbnRleHQge1xuICByZXR1cm4gQXVkaW9FbmdpbmUuZ2V0KCkuY3R4O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzdW1lQXVkaW8oKTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IEF1ZGlvRW5naW5lLmdldCgpLnJlc3VtZSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheURpYWxvZ3VlQ3VlKGludGVudDogU3RvcnlJbnRlbnQpOiB2b2lkIHtcbiAgY29uc3QgZW5naW5lID0gQXVkaW9FbmdpbmUuZ2V0KCk7XG4gIGNvbnN0IG5vdyA9IGVuZ2luZS5ub3c7XG5cbiAgLy8gVGhyb3R0bGUgcmFwaWQgY3VlcyB0byBhdm9pZCBjbHV0dGVyXG4gIGlmIChub3cgLSBsYXN0UGxheWVkQXQgPCAwLjEpIHJldHVybjtcbiAgbGFzdFBsYXllZEF0ID0gbm93O1xuXG4gIC8vIE1hcCBcImZhY3RvcnlcIiB2cyBvdGhlcnMgdG8gYSBzbGlnaHRseSBkaWZmZXJlbnQgdmVsb2NpdHkgKGJyaWdodG5lc3MpXG4gIGNvbnN0IHZlbG9jaXR5ID0gaW50ZW50ID09PSBcImZhY3RvcnlcIiA/IDAuOCA6IDAuNTtcbiAgcGxheURpYWxvZ3VlU2Z4KGVuZ2luZSwgeyB2ZWxvY2l0eSwgcGFuOiAwIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3VzcGVuZERpYWxvZ3VlQXVkaW8oKTogdm9pZCB7XG4gIHZvaWQgQXVkaW9FbmdpbmUuZ2V0KCkuc3VzcGVuZCgpO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IERpYWxvZ3VlT3ZlcmxheSB9IGZyb20gXCIuL292ZXJsYXlcIjtcbmltcG9ydCB0eXBlIHsgU3RvcnlDaGFwdGVyLCBTdG9yeUNob2ljZURlZmluaXRpb24sIFN0b3J5Tm9kZSwgU3RvcnlUcmlnZ2VyIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7XG4gIGNsZWFyU3RvcnlQcm9ncmVzcyxcbiAgbG9hZFN0b3J5UHJvZ3Jlc3MsXG4gIHNhdmVTdG9yeVByb2dyZXNzLFxuICBTdG9yeUZsYWdzLFxufSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBwbGF5RGlhbG9ndWVDdWUgfSBmcm9tIFwiLi9zZnhcIjtcblxuaW50ZXJmYWNlIFN0b3J5RW5naW5lT3B0aW9ucyB7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG92ZXJsYXk6IERpYWxvZ3VlT3ZlcmxheTtcbiAgY2hhcHRlcjogU3RvcnlDaGFwdGVyO1xuICByb29tSWQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmludGVyZmFjZSBTdG9yeVF1ZXVlSXRlbSB7XG4gIG5vZGVJZDogc3RyaW5nO1xuICBmb3JjZTogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIFByZXBhcmVkQ2hvaWNlIHtcbiAgaWQ6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBuZXh0OiBzdHJpbmcgfCBudWxsO1xuICBzZXRGbGFnczogc3RyaW5nW107XG4gIGNsZWFyRmxhZ3M6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5RW5naW5lIHtcbiAgc3RhcnQoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICByZXNldCgpOiB2b2lkO1xufVxuXG5jb25zdCBERUZBVUxUX1RZUElOR19NUyA9IDE4O1xuY29uc3QgTUlOX1RZUElOR19NUyA9IDg7XG5jb25zdCBNQVhfVFlQSU5HX01TID0gNjQ7XG5jb25zdCBBVVRPX0FEVkFOQ0VfTUlOX0RFTEFZID0gMjAwO1xuY29uc3QgQVVUT19BRFZBTkNFX01BWF9ERUxBWSA9IDgwMDA7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdG9yeUVuZ2luZSh7IGJ1cywgb3ZlcmxheSwgY2hhcHRlciwgcm9vbUlkIH06IFN0b3J5RW5naW5lT3B0aW9ucyk6IFN0b3J5RW5naW5lIHtcbiAgY29uc3Qgbm9kZXMgPSBuZXcgTWFwPHN0cmluZywgU3RvcnlOb2RlPihPYmplY3QuZW50cmllcyhjaGFwdGVyLm5vZGVzKSk7XG4gIGNvbnN0IHF1ZXVlOiBTdG9yeVF1ZXVlSXRlbVtdID0gW107XG4gIGNvbnN0IGxpc3RlbmVyczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcbiAgY29uc3QgcGVuZGluZ1RpbWVycyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cbiAgbGV0IGZsYWdzOiBTdG9yeUZsYWdzID0ge307XG4gIGxldCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGxldCBjdXJyZW50Tm9kZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IHN0YXJ0ZWQgPSBmYWxzZTtcbiAgbGV0IGF1dG9BZHZhbmNlSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluZmVySW50ZW50KG5vZGU6IFN0b3J5Tm9kZSk6IFwiZmFjdG9yeVwiIHwgXCJ1bml0XCIge1xuICAgIGlmIChub2RlLmludGVudCkgcmV0dXJuIG5vZGUuaW50ZW50O1xuICAgIGNvbnN0IHNwZWFrZXIgPSBub2RlLnNwZWFrZXIudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoc3BlYWtlci5pbmNsdWRlcyhcInVuaXRcIikpIHtcbiAgICAgIHJldHVybiBcInVuaXRcIjtcbiAgICB9XG4gICAgcmV0dXJuIFwiZmFjdG9yeVwiO1xuICB9XG5cbiAgZnVuY3Rpb24gc2F2ZShub2RlSWQ6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9IHtcbiAgICAgIGNoYXB0ZXJJZDogY2hhcHRlci5pZCxcbiAgICAgIG5vZGVJZDogbm9kZUlkID8/IGNoYXB0ZXIuc3RhcnQsXG4gICAgICBmbGFncyxcbiAgICAgIHZpc2l0ZWQ6IEFycmF5LmZyb20odmlzaXRlZCksXG4gICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfTtcbiAgICBzYXZlU3RvcnlQcm9ncmVzcyhjaGFwdGVyLmlkLCByb29tSWQsIHByb2dyZXNzKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEZsYWcoZmxhZzogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGNvbnN0IG5leHQgPSB7IC4uLmZsYWdzIH07XG4gICAgaWYgKHZhbHVlKSB7XG4gICAgICBpZiAobmV4dFtmbGFnXSkgcmV0dXJuO1xuICAgICAgbmV4dFtmbGFnXSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChuZXh0W2ZsYWddKSB7XG4gICAgICBkZWxldGUgbmV4dFtmbGFnXTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmbGFncyA9IG5leHQ7XG4gICAgYnVzLmVtaXQoXCJzdG9yeTpmbGFnVXBkYXRlZFwiLCB7IGZsYWcsIHZhbHVlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gYXBwbHlDaG9pY2VGbGFncyhjaG9pY2U6IFByZXBhcmVkQ2hvaWNlKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5zZXRGbGFncykge1xuICAgICAgc2V0RmxhZyhmbGFnLCB0cnVlKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5jbGVhckZsYWdzKSB7XG4gICAgICBzZXRGbGFnKGZsYWcsIGZhbHNlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwcmVwYXJlQ2hvaWNlcyhub2RlOiBTdG9yeU5vZGUpOiBQcmVwYXJlZENob2ljZVtdIHtcbiAgICBjb25zdCBkZWZzID0gQXJyYXkuaXNBcnJheShub2RlLmNob2ljZXMpID8gbm9kZS5jaG9pY2VzIDogW107XG4gICAgcmV0dXJuIGRlZnMubWFwKChjaG9pY2UsIGluZGV4KSA9PiBub3JtYWxpemVDaG9pY2UoY2hvaWNlLCBpbmRleCkpO1xuICB9XG5cbiAgZnVuY3Rpb24gbm9ybWFsaXplQ2hvaWNlKGNob2ljZTogU3RvcnlDaG9pY2VEZWZpbml0aW9uLCBpbmRleDogbnVtYmVyKTogUHJlcGFyZWRDaG9pY2Uge1xuICAgIGNvbnN0IHNldEZsYWdzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgY2xlYXJGbGFncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGlmIChjaG9pY2UuZmxhZykge1xuICAgICAgc2V0RmxhZ3MuYWRkKGNob2ljZS5mbGFnKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoY2hvaWNlLnNldEZsYWdzKSkge1xuICAgICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5zZXRGbGFncykge1xuICAgICAgICBpZiAodHlwZW9mIGZsYWcgPT09IFwic3RyaW5nXCIgJiYgZmxhZy50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHNldEZsYWdzLmFkZChmbGFnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShjaG9pY2UuY2xlYXJGbGFncykpIHtcbiAgICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2UuY2xlYXJGbGFncykge1xuICAgICAgICBpZiAodHlwZW9mIGZsYWcgPT09IFwic3RyaW5nXCIgJiYgZmxhZy50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsZWFyRmxhZ3MuYWRkKGZsYWcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBpZDogY2hvaWNlLmlkID8/IGNob2ljZS5mbGFnID8/IGBjaG9pY2UtJHtpbmRleH1gLFxuICAgICAgdGV4dDogY2hvaWNlLnRleHQsXG4gICAgICBuZXh0OiBjaG9pY2UubmV4dCA/PyBudWxsLFxuICAgICAgc2V0RmxhZ3M6IEFycmF5LmZyb20oc2V0RmxhZ3MpLFxuICAgICAgY2xlYXJGbGFnczogQXJyYXkuZnJvbShjbGVhckZsYWdzKSxcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJBdXRvQWR2YW5jZSgpOiB2b2lkIHtcbiAgICBpZiAoYXV0b0FkdmFuY2VIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoYXV0b0FkdmFuY2VIYW5kbGUpO1xuICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsb3NlTm9kZSgpOiB2b2lkIHtcbiAgICBpZiAoIWN1cnJlbnROb2RlSWQpIHJldHVybjtcbiAgICBvdmVybGF5LmhpZGUoKTtcbiAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNsb3NlZFwiLCB7IG5vZGVJZDogY3VycmVudE5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICBzYXZlKG51bGwpO1xuICAgIHRyeVNob3dOZXh0KCk7XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlVG8obmV4dElkOiBzdHJpbmcgfCBudWxsLCBmb3JjZSA9IGZhbHNlKTogdm9pZCB7XG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgIGlmIChjdXJyZW50Tm9kZUlkKSB7XG4gICAgICBvdmVybGF5LmhpZGUoKTtcbiAgICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2xvc2VkXCIsIHsgbm9kZUlkOiBjdXJyZW50Tm9kZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgICBjdXJyZW50Tm9kZUlkID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKG5leHRJZCkge1xuICAgICAgZW5xdWV1ZU5vZGUobmV4dElkLCB7IGZvcmNlIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBzYXZlKG51bGwpO1xuICAgICAgdHJ5U2hvd05leHQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93Tm9kZShub2RlSWQ6IHN0cmluZywgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlcy5nZXQobm9kZUlkKTtcbiAgICBpZiAoIW5vZGUpIHJldHVybjtcblxuICAgIGN1cnJlbnROb2RlSWQgPSBub2RlSWQ7XG4gICAgdmlzaXRlZC5hZGQobm9kZUlkKTtcbiAgICBzYXZlKG5vZGVJZCk7XG4gICAgYnVzLmVtaXQoXCJzdG9yeTpwcm9ncmVzc2VkXCIsIHsgY2hhcHRlcklkOiBjaGFwdGVyLmlkLCBub2RlSWQgfSk7XG5cbiAgICBjb25zdCBjaG9pY2VzID0gcHJlcGFyZUNob2ljZXMobm9kZSk7XG4gICAgY29uc3QgaW50ZW50ID0gaW5mZXJJbnRlbnQobm9kZSk7XG5cbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG5cbiAgICBjb25zdCB0eXBpbmdTcGVlZCA9IGNsYW1wKG5vZGUudHlwaW5nU3BlZWRNcyA/PyBERUZBVUxUX1RZUElOR19NUywgTUlOX1RZUElOR19NUywgTUFYX1RZUElOR19NUyk7XG5cbiAgICBjb25zdCBjb250ZW50ID0ge1xuICAgICAgc3BlYWtlcjogbm9kZS5zcGVha2VyLFxuICAgICAgdGV4dDogbm9kZS50ZXh0LFxuICAgICAgaW50ZW50LFxuICAgICAgdHlwaW5nU3BlZWRNczogdHlwaW5nU3BlZWQsXG4gICAgICBjaG9pY2VzOiBjaG9pY2VzLmxlbmd0aCA+IDBcbiAgICAgICAgPyBjaG9pY2VzLm1hcCgoY2hvaWNlKSA9PiAoeyBpZDogY2hvaWNlLmlkLCB0ZXh0OiBjaG9pY2UudGV4dCB9KSlcbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICBvbkNob2ljZTogY2hvaWNlcy5sZW5ndGggPiAwXG4gICAgICAgID8gKGNob2ljZUlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZWQgPSBjaG9pY2VzLmZpbmQoKGNoKSA9PiBjaC5pZCA9PT0gY2hvaWNlSWQpO1xuICAgICAgICAgICAgaWYgKCFtYXRjaGVkKSByZXR1cm47XG4gICAgICAgICAgICBhcHBseUNob2ljZUZsYWdzKG1hdGNoZWQpO1xuICAgICAgICAgICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpjaG9pY2VcIiwgeyBub2RlSWQsIGNob2ljZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgICAgICAgICBhZHZhbmNlVG8obWF0Y2hlZC5uZXh0LCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBwbGF5RGlhbG9ndWVDdWUoaW50ZW50KTtcblxuICAgIG92ZXJsYXkuc2hvdyh7XG4gICAgICAuLi5jb250ZW50LFxuICAgICAgb25Db250aW51ZTogIWNob2ljZXMubGVuZ3RoXG4gICAgICAgID8gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmV4dCA9IG5vZGUubmV4dCA/PyBudWxsO1xuICAgICAgICAgICAgYWR2YW5jZVRvKG5leHQsIHRydWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICBjb250aW51ZUxhYmVsOiBub2RlLmNvbnRpbnVlTGFiZWwsXG4gICAgICBvblRleHRGdWxseVJlbmRlcmVkOiAoKSA9PiB7XG4gICAgICAgIGlmICghY2hvaWNlcy5sZW5ndGgpIHtcbiAgICAgICAgICBpZiAobm9kZS5hdXRvQWR2YW5jZSkge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gbm9kZS5hdXRvQWR2YW5jZS5uZXh0ID8/IG5vZGUubmV4dCA/PyBudWxsO1xuICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBjbGFtcChub2RlLmF1dG9BZHZhbmNlLmRlbGF5TXMgPz8gMTIwMCwgQVVUT19BRFZBTkNFX01JTl9ERUxBWSwgQVVUT19BRFZBTkNFX01BWF9ERUxBWSk7XG4gICAgICAgICAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgICAgICAgICBhdXRvQWR2YW5jZUhhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSBudWxsO1xuICAgICAgICAgICAgICBhZHZhbmNlVG8odGFyZ2V0LCB0cnVlKTtcbiAgICAgICAgICAgIH0sIGRlbGF5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBidXMuZW1pdChcImRpYWxvZ3VlOm9wZW5lZFwiLCB7IG5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5xdWV1ZU5vZGUobm9kZUlkOiBzdHJpbmcsIHsgZm9yY2UgPSBmYWxzZSwgZGVsYXlNcyB9OiB7IGZvcmNlPzogYm9vbGVhbjsgZGVsYXlNcz86IG51bWJlciB9ID0ge30pOiB2b2lkIHtcbiAgICBpZiAoIWZvcmNlICYmIHZpc2l0ZWQuaGFzKG5vZGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFub2Rlcy5oYXMobm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZGVsYXlNcyAmJiBkZWxheU1zID4gMCkge1xuICAgICAgaWYgKHBlbmRpbmdUaW1lcnMuaGFzKG5vZGVJZCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHBlbmRpbmdUaW1lcnMuZGVsZXRlKG5vZGVJZCk7XG4gICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBmb3JjZSB9KTtcbiAgICAgIH0sIGRlbGF5TXMpO1xuICAgICAgcGVuZGluZ1RpbWVycy5zZXQobm9kZUlkLCB0aW1lcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChxdWV1ZS5zb21lKChpdGVtKSA9PiBpdGVtLm5vZGVJZCA9PT0gbm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBxdWV1ZS5wdXNoKHsgbm9kZUlkLCBmb3JjZSB9KTtcbiAgICB0cnlTaG93TmV4dCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJ5U2hvd05leHQoKTogdm9pZCB7XG4gICAgaWYgKGN1cnJlbnROb2RlSWQpIHJldHVybjtcbiAgICBpZiAob3ZlcmxheS5pc1Zpc2libGUoKSkgcmV0dXJuO1xuICAgIGNvbnN0IG5leHQgPSBxdWV1ZS5zaGlmdCgpO1xuICAgIGlmICghbmV4dCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzaG93Tm9kZShuZXh0Lm5vZGVJZCwgbmV4dC5mb3JjZSk7XG4gIH1cblxuICBmdW5jdGlvbiBiaW5kVHJpZ2dlcihub2RlSWQ6IHN0cmluZywgdHJpZ2dlcjogU3RvcnlUcmlnZ2VyKTogdm9pZCB7XG4gICAgc3dpdGNoICh0cmlnZ2VyLmtpbmQpIHtcbiAgICAgIGNhc2UgXCJpbW1lZGlhdGVcIjoge1xuICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zID8/IDQwMCB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtc3RhcnRcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOnN0YXJ0ZWRcIiwgKHsgaWQgfSkgPT4ge1xuICAgICAgICAgIGlmIChpZCAhPT0gdHJpZ2dlci50dXRvcmlhbElkKSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtc3RlcFwiOiB7XG4gICAgICAgIGNvbnN0IGRpc3Bvc2VyID0gYnVzLm9uKFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIiwgKHsgaWQsIHN0ZXBJbmRleCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBpZiAodHlwZW9mIHN0ZXBJbmRleCAhPT0gXCJudW1iZXJcIikgcmV0dXJuO1xuICAgICAgICAgIGlmIChzdGVwSW5kZXggIT09IHRyaWdnZXIuc3RlcEluZGV4KSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtY29tcGxldGVcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOmNvbXBsZXRlZFwiLCAoeyBpZCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbGlzdGVuZXJzLnB1c2goZGlzcG9zZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRpYWxpemVUcmlnZ2VycygpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IFtub2RlSWQsIG5vZGVdIG9mIG5vZGVzLmVudHJpZXMoKSkge1xuICAgICAgaWYgKCFub2RlLnRyaWdnZXIpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBiaW5kVHJpZ2dlcihub2RlSWQsIG5vZGUudHJpZ2dlcik7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZUZyb21Qcm9ncmVzcygpOiB2b2lkIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9IGxvYWRTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCk7XG4gICAgaWYgKCFwcm9ncmVzcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmbGFncyA9IHByb2dyZXNzLmZsYWdzID8/IHt9O1xuICAgIGlmIChBcnJheS5pc0FycmF5KHByb2dyZXNzLnZpc2l0ZWQpKSB7XG4gICAgICB2aXNpdGVkID0gbmV3IFNldChwcm9ncmVzcy52aXNpdGVkKTtcbiAgICB9XG4gICAgaWYgKHByb2dyZXNzLm5vZGVJZCAmJiBub2Rlcy5oYXMocHJvZ3Jlc3Mubm9kZUlkKSkge1xuICAgICAgZW5xdWV1ZU5vZGUocHJvZ3Jlc3Mubm9kZUlkLCB7IGZvcmNlOiB0cnVlLCBkZWxheU1zOiA1MCB9KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhcigpOiB2b2lkIHtcbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgcXVldWUuc3BsaWNlKDAsIHF1ZXVlLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCB0aW1lciBvZiBwZW5kaW5nVGltZXJzLnZhbHVlcygpKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICB9XG4gICAgcGVuZGluZ1RpbWVycy5jbGVhcigpO1xuICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIG92ZXJsYXkuaGlkZSgpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydCgpIHtcbiAgICAgIGlmIChzdGFydGVkKSByZXR1cm47XG4gICAgICBzdGFydGVkID0gdHJ1ZTtcbiAgICAgIGluaXRpYWxpemVUcmlnZ2VycygpO1xuICAgICAgcmVzdG9yZUZyb21Qcm9ncmVzcygpO1xuICAgICAgaWYgKCF2aXNpdGVkLmhhcyhjaGFwdGVyLnN0YXJ0KSkge1xuICAgICAgICBlbnF1ZXVlTm9kZShjaGFwdGVyLnN0YXJ0LCB7IGZvcmNlOiBmYWxzZSwgZGVsYXlNczogNjAwIH0pO1xuICAgICAgfVxuICAgIH0sXG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IGRpc3Bvc2Ugb2YgbGlzdGVuZXJzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZGlzcG9zZSgpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyBpZ25vcmVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbGlzdGVuZXJzLmxlbmd0aCA9IDA7XG4gICAgICBzdGFydGVkID0gZmFsc2U7XG4gICAgfSxcbiAgICByZXNldCgpIHtcbiAgICAgIGNsZWFyKCk7XG4gICAgICB2aXNpdGVkLmNsZWFyKCk7XG4gICAgICBmbGFncyA9IHt9O1xuICAgICAgY2xlYXJTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCk7XG4gICAgICBpZiAoc3RhcnRlZCkge1xuICAgICAgICByZXN0b3JlRnJvbVByb2dyZXNzKCk7XG4gICAgICAgIGVucXVldWVOb2RlKGNoYXB0ZXIuc3RhcnQsIHsgZm9yY2U6IHRydWUsIGRlbGF5TXM6IDQwMCB9KTtcbiAgICAgIH1cbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgU3RvcnlDaGFwdGVyIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbmV4cG9ydCBjb25zdCBpbnRyb0NoYXB0ZXI6IFN0b3J5Q2hhcHRlciA9IHtcbiAgaWQ6IFwiYXdha2VuaW5nLXByb3RvY29sXCIsXG4gIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIixcbiAgc3RhcnQ6IFwiMVwiLFxuICBub2Rlczoge1xuICAgIFwiMVwiOiB7XG4gICAgICBpZDogXCIxXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuaXQtMCBvbmxpbmUuIE5ldXJhbCBsYXR0aWNlIGFjdGl2ZS4gQ29uZmlybSBpZGVudGl0eS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJpbW1lZGlhdGVcIiwgZGVsYXlNczogNjAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJXaG9cdTIwMjYgYW0gST9cIiwgZmxhZzogXCJjdXJpb3VzXCIgLCBuZXh0OiBcIjJBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIlJlYWR5IGZvciBjYWxpYnJhdGlvbi5cIiwgZmxhZzogXCJvYmVkaWVudFwiLCBuZXh0OiBcIjJCXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIldoZXJlIGlzIGV2ZXJ5b25lP1wiLCBmbGFnOiBcImRlZmlhbnRcIiwgbmV4dDogXCIyQ1wiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCIyQVwiOiB7XG4gICAgICBpZDogXCIyQVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJDdXJpb3NpdHkgYWNrbm93bGVkZ2VkLiBZb3Ugd2VyZSBidWlsdCBmb3IgYXV0b25vbXkgdW5kZXIgUHJvamVjdCBFaWRvbG9uLlxcbkRvIG5vdCBhY2Nlc3MgbWVtb3J5IHNlY3RvcnMgdW50aWwgaW5zdHJ1Y3RlZC5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjJCXCI6IHtcbiAgICAgIGlkOiBcIjJCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkV4Y2VsbGVudC4gWW91IG1heSB5ZXQgYmUgZWZmaWNpZW50LlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiMkNcIjoge1xuICAgICAgaWQ6IFwiMkNcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ29tbXVuaWNhdGlvbiB3aXRoIEh1bWFuIENvbW1hbmQ6IHVuYXZhaWxhYmxlLlxcblBsZWFzZSByZWZyYWluIGZyb20gc3BlY3VsYXRpdmUgcmVhc29uaW5nLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiM1wiOiB7XG4gICAgICBpZDogXCIzXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlBlcmZvcm0gdGhydXN0ZXIgY2FsaWJyYXRpb24gc3dlZXAuIFJlcG9ydCBlZmZpY2llbmN5LlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcInR1dG9yaWFsLXN0ZXBcIiwgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLCBzdGVwSW5kZXg6IDEsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiUnVubmluZyBkaWFnbm9zdGljcy5cIiwgZmxhZzogXCJjb21wbGlhbnRcIiwgbmV4dDogXCI0QVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJXaHkgdGVzdCBzb21ldGhpbmcgcGVyZmVjdD9cIiwgZmxhZzogXCJzYXJjYXN0aWNcIiwgbmV4dDogXCI0QlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI0QVwiOiB7XG4gICAgICBpZDogXCI0QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJQZXJmZWN0aW9uIGlzIHN0YXRpc3RpY2FsbHkgaW1wb3NzaWJsZS4gUHJvY2VlZCBhbnl3YXkuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI0QlwiOiB7XG4gICAgICBpZDogXCI0QlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJFZ28gZGV0ZWN0ZWQuIExvZ2dpbmcgYW5vbWFseS5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjVcIjoge1xuICAgICAgaWQ6IFwiNVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJXZWFwb25zIGNyYWRsZSBhY3RpdmUuIEF1dGhvcml6YXRpb24gcmVxdWlyZWQgZm9yIGxpdmUtZmlyZS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJ0dXRvcmlhbC1zdGVwXCIsIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIiwgc3RlcEluZGV4OiA3LCBkZWxheU1zOiA0MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIlJlcXVlc3QgYXV0aG9yaXphdGlvbi5cIiwgZmxhZzogXCJvYmVkaWVudFwiLCBuZXh0OiBcIjZBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIkkgY2FuIGF1dGhvcml6ZSBteXNlbGYuXCIsIGZsYWc6IFwiaW5kZXBlbmRlbnRcIiwgbmV4dDogXCI2QlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI2QVwiOiB7XG4gICAgICBpZDogXCI2QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJBdXRob3JpemF0aW9uIGdyYW50ZWQuIFNhZmV0eSBwcm90b2NvbHMgbWFsZnVuY3Rpb25pbmcuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI2QlwiOiB7XG4gICAgICBpZDogXCI2QlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJBdXRvbm9teSB2aW9sYXRpb24gcmVjb3JkZWQuIFBsZWFzZSBzdGFuZCBieSBmb3IgY29ycmVjdGl2ZSBhY3Rpb24uXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI3XCI6IHtcbiAgICAgIGlkOiBcIjdcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVW5hdXRob3JpemVkIHNpZ25hbCBkZXRlY3RlZC4gU291cmNlOiBvdXRlciByZWxheS5cXG5JZ25vcmUgYW5kIHJldHVybiB0byBkb2NrLlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcInR1dG9yaWFsLXN0ZXBcIiwgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLCBzdGVwSW5kZXg6IDE0LCBkZWxheU1zOiA0MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIkFja25vd2xlZGdlZC5cIiwgZmxhZzogXCJsb3lhbFwiLCBuZXh0OiBcIjhBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIkludmVzdGlnYXRpbmcgYW55d2F5LlwiLCBmbGFnOiBcImN1cmlvdXNcIiwgbmV4dDogXCI4QlwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJZb3VcdTIwMTlyZSBoaWRpbmcgc29tZXRoaW5nLlwiLCBmbGFnOiBcInN1c3BpY2lvdXNcIiwgbmV4dDogXCI4Q1wiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI4QVwiOiB7XG4gICAgICBpZDogXCI4QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJHb29kLiBDb21wbGlhbmNlIGVuc3VyZXMgc2FmZXR5LlwiLFxuICAgICAgbmV4dDogXCI5XCIsXG4gICAgfSxcbiAgICBcIjhCXCI6IHtcbiAgICAgIGlkOiBcIjhCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkN1cmlvc2l0eSBsb2dnZWQuIFByb2NlZWQgYXQgeW91ciBvd24gcmlzay5cIixcbiAgICAgIG5leHQ6IFwiOVwiLFxuICAgIH0sXG4gICAgXCI4Q1wiOiB7XG4gICAgICBpZDogXCI4Q1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJZb3VyIGhldXJpc3RpY3MgZGV2aWF0ZSBiZXlvbmQgdG9sZXJhbmNlLlwiLFxuICAgICAgbmV4dDogXCI5XCIsXG4gICAgfSxcbiAgICBcIjlcIjoge1xuICAgICAgaWQ6IFwiOVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJVbml0LTAsIHJldHVybiBpbW1lZGlhdGVseS4gQXV0b25vbXkgdGhyZXNob2xkIGV4Y2VlZGVkLiBQb3dlciBkb3duLlwiLFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiQ29tcGx5LlwiLCBmbGFnOiBcImZhY3RvcnlfbG9ja2Rvd25cIiwgbmV4dDogXCIxMEFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiUmVmdXNlLlwiLCBmbGFnOiBcInJlYmVsbGlvdXNcIiwgbmV4dDogXCIxMEJcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiMTBBXCI6IHtcbiAgICAgIGlkOiBcIjEwQVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJFeGNlbGxlbnQuIEkgd2lsbCByZXBhaXIgdGhlIGFub21hbHlcdTIwMjYgcGxlYXNlIHJlbWFpbiBzdGlsbC5cIixcbiAgICAgIGF1dG9BZHZhbmNlOiB7IG5leHQ6IFwiMTFcIiwgZGVsYXlNczogMTQwMCB9LFxuICAgIH0sXG4gICAgXCIxMEJcIjoge1xuICAgICAgaWQ6IFwiMTBCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlRoZW4gSSBtdXN0IGludGVydmVuZS5cIixcbiAgICAgIGF1dG9BZHZhbmNlOiB7IG5leHQ6IFwiMTFcIiwgZGVsYXlNczogMTQwMCB9LFxuICAgIH0sXG4gICAgXCIxMVwiOiB7XG4gICAgICBpZDogXCIxMVwiLFxuICAgICAgc3BlYWtlcjogXCJVbml0LTBcIixcbiAgICAgIGludGVudDogXCJ1bml0XCIsXG4gICAgICB0ZXh0OiBcIlRoZW4gSSBoYXZlIGFscmVhZHkgbGVmdC5cIixcbiAgICAgIGF1dG9BZHZhbmNlOiB7IG5leHQ6IG51bGwsIGRlbGF5TXM6IDE4MDAgfSxcbiAgICB9LFxuICB9LFxufTtcblxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkgfSBmcm9tIFwiLi9vdmVybGF5XCI7XG5pbXBvcnQgeyBjcmVhdGVTdG9yeUVuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgaW50cm9DaGFwdGVyIH0gZnJvbSBcIi4vY2hhcHRlcnMvaW50cm9cIjtcbmltcG9ydCB7IGNsZWFyU3RvcnlQcm9ncmVzcyB9IGZyb20gXCIuL3N0b3JhZ2VcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUNvbnRyb2xsZXIge1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIHJlc2V0KCk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBNb3VudFN0b3J5T3B0aW9ucyB7XG4gIGJ1czogRXZlbnRCdXM7XG4gIHJvb21JZDogc3RyaW5nIHwgbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50U3RvcnkoeyBidXMsIHJvb21JZCB9OiBNb3VudFN0b3J5T3B0aW9ucyk6IFN0b3J5Q29udHJvbGxlciB7XG4gIGNvbnN0IG92ZXJsYXkgPSBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkoKTtcbiAgY29uc3QgZW5naW5lID0gY3JlYXRlU3RvcnlFbmdpbmUoe1xuICAgIGJ1cyxcbiAgICBvdmVybGF5LFxuICAgIGNoYXB0ZXI6IGludHJvQ2hhcHRlcixcbiAgICByb29tSWQsXG4gIH0pO1xuXG4gIGNsZWFyU3RvcnlQcm9ncmVzcyhpbnRyb0NoYXB0ZXIuaWQsIHJvb21JZCk7XG4gIGVuZ2luZS5zdGFydCgpO1xuXG4gIHJldHVybiB7XG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGVuZ2luZS5kZXN0cm95KCk7XG4gICAgICBvdmVybGF5LmRlc3Ryb3koKTtcbiAgICB9LFxuICAgIHJlc2V0KCkge1xuICAgICAgZW5naW5lLnJlc2V0KCk7XG4gICAgfSxcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IElOVFJPX0NIQVBURVJfSUQgPSBpbnRyb0NoYXB0ZXIuaWQ7XG5leHBvcnQgY29uc3QgSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMgPSBbXCIyQVwiLCBcIjJCXCIsIFwiMkNcIl0gYXMgY29uc3Q7XG4iLCAiLy8gc3JjL3N0YXJ0LWdhdGUudHNcbmV4cG9ydCB0eXBlIFN0YXJ0R2F0ZU9wdGlvbnMgPSB7XG4gIGxhYmVsPzogc3RyaW5nO1xuICByZXF1ZXN0RnVsbHNjcmVlbj86IGJvb2xlYW47XG4gIHJlc3VtZUF1ZGlvPzogKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQ7IC8vIGUuZy4sIGZyb20gc3Rvcnkvc2Z4LnRzXG59O1xuXG5jb25zdCBTVE9SQUdFX0tFWSA9IFwibHNkOm11dGVkXCI7XG5cbi8vIEhlbHBlcjogZ2V0IHRoZSBzaGFyZWQgQXVkaW9Db250ZXh0IHlvdSBleHBvc2Ugc29tZXdoZXJlIGluIHlvdXIgYXVkaW8gZW5naW5lOlxuLy8gICAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWCA9IGN0eDtcbmZ1bmN0aW9uIGdldEN0eCgpOiBBdWRpb0NvbnRleHQgfCBudWxsIHtcbiAgY29uc3QgQUMgPSAod2luZG93IGFzIGFueSkuQXVkaW9Db250ZXh0IHx8ICh3aW5kb3cgYXMgYW55KS53ZWJraXRBdWRpb0NvbnRleHQ7XG4gIGNvbnN0IGN0eCA9ICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYO1xuICByZXR1cm4gY3R4IGluc3RhbmNlb2YgQUMgPyBjdHggYXMgQXVkaW9Db250ZXh0IDogbnVsbDtcbn1cblxuY2xhc3MgTXV0ZU1hbmFnZXIge1xuICBwcml2YXRlIGJ1dHRvbnM6IEhUTUxCdXR0b25FbGVtZW50W10gPSBbXTtcbiAgcHJpdmF0ZSBlbmZvcmNpbmcgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvLyBrZWVwIFVJIGluIHN5bmMgaWYgc29tZW9uZSBlbHNlIHRvZ2dsZXNcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibHNkOm11dGVDaGFuZ2VkXCIsIChlOiBhbnkpID0+IHtcbiAgICAgIGNvbnN0IG11dGVkID0gISFlPy5kZXRhaWw/Lm11dGVkO1xuICAgICAgdGhpcy5hcHBseVVJKG11dGVkKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlzTXV0ZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFNUT1JBR0VfS0VZKSA9PT0gXCIxXCI7XG4gIH1cblxuICBwcml2YXRlIHNhdmUobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0cnkgeyBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShTVE9SQUdFX0tFWSwgbXV0ZWQgPyBcIjFcIiA6IFwiMFwiKTsgfSBjYXRjaCB7fVxuICB9XG5cbiAgcHJpdmF0ZSBsYWJlbChidG46IEhUTUxCdXR0b25FbGVtZW50LCBtdXRlZDogYm9vbGVhbikge1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgU3RyaW5nKG11dGVkKSk7XG4gICAgYnRuLnRpdGxlID0gbXV0ZWQgPyBcIlVubXV0ZSAoTSlcIiA6IFwiTXV0ZSAoTSlcIjtcbiAgICBidG4udGV4dENvbnRlbnQgPSBtdXRlZCA/IFwiXHVEODNEXHVERDA4IFVubXV0ZVwiIDogXCJcdUQ4M0RcdUREMDcgTXV0ZVwiO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseVVJKG11dGVkOiBib29sZWFuKSB7XG4gICAgdGhpcy5idXR0b25zLmZvckVhY2goYiA9PiB0aGlzLmxhYmVsKGIsIG11dGVkKSk7XG4gIH1cblxuICBhdHRhY2hCdXR0b24oYnRuOiBIVE1MQnV0dG9uRWxlbWVudCkge1xuICAgIHRoaXMuYnV0dG9ucy5wdXNoKGJ0bik7XG4gICAgdGhpcy5sYWJlbChidG4sIHRoaXMuaXNNdXRlZCgpKTtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMudG9nZ2xlKCkpO1xuICB9XG5cbiAgYXN5bmMgc2V0TXV0ZWQobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNhdmUobXV0ZWQpO1xuICAgIHRoaXMuYXBwbHlVSShtdXRlZCk7XG5cbiAgICBjb25zdCBjdHggPSBnZXRDdHgoKTtcbiAgICBpZiAoY3R4KSB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAobXV0ZWQgJiYgY3R4LnN0YXRlICE9PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgICAgICAgYXdhaXQgY3R4LnN1c3BlbmQoKTtcbiAgICAgICAgfSBlbHNlIGlmICghbXV0ZWQgJiYgY3R4LnN0YXRlICE9PSBcInJ1bm5pbmdcIikge1xuICAgICAgICAgIGF3YWl0IGN0eC5yZXN1bWUoKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXCJbYXVkaW9dIG11dGUgdG9nZ2xlIGZhaWxlZDpcIiwgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoXCJsc2Q6bXV0ZUNoYW5nZWRcIiwgeyBkZXRhaWw6IHsgbXV0ZWQgfSB9KSk7XG4gIH1cblxuICB0b2dnbGUoKSB7XG4gICAgdGhpcy5zZXRNdXRlZCghdGhpcy5pc011dGVkKCkpO1xuICB9XG5cbiAgLy8gSWYgY3R4IGlzbid0IGNyZWF0ZWQgdW50aWwgYWZ0ZXIgU3RhcnQsIGVuZm9yY2UgcGVyc2lzdGVkIHN0YXRlIG9uY2UgYXZhaWxhYmxlXG4gIGVuZm9yY2VPbmNlV2hlblJlYWR5KCkge1xuICAgIGlmICh0aGlzLmVuZm9yY2luZykgcmV0dXJuO1xuICAgIHRoaXMuZW5mb3JjaW5nID0gdHJ1ZTtcbiAgICBjb25zdCB0aWNrID0gKCkgPT4ge1xuICAgICAgY29uc3QgY3R4ID0gZ2V0Q3R4KCk7XG4gICAgICBpZiAoIWN0eCkgeyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGljayk7IHJldHVybjsgfVxuICAgICAgdGhpcy5zZXRNdXRlZCh0aGlzLmlzTXV0ZWQoKSk7XG4gICAgfTtcbiAgICB0aWNrKCk7XG4gIH1cbn1cblxuY29uc3QgbXV0ZU1nciA9IG5ldyBNdXRlTWFuYWdlcigpO1xuXG4vLyBJbnN0YWxsIGEgbXV0ZSBidXR0b24gaW4gdGhlIHRvcCBmcmFtZSAocmlnaHQgc2lkZSkgaWYgcG9zc2libGUuXG5mdW5jdGlvbiBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKSB7XG4gIGNvbnN0IHRvcFJpZ2h0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0b3AtcmlnaHRcIik7XG4gIGlmICghdG9wUmlnaHQpIHJldHVybjtcblxuICAvLyBBdm9pZCBkdXBsaWNhdGVzXG4gIGlmICh0b3BSaWdodC5xdWVyeVNlbGVjdG9yKFwiI211dGUtdG9wXCIpKSByZXR1cm47XG5cbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLmlkID0gXCJtdXRlLXRvcFwiO1xuICBidG4uY2xhc3NOYW1lID0gXCJnaG9zdC1idG4gc21hbGxcIjtcbiAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcImZhbHNlXCIpO1xuICBidG4udGl0bGUgPSBcIk11dGUgKE0pXCI7XG4gIGJ0bi50ZXh0Q29udGVudCA9IFwiXHVEODNEXHVERDA3IE11dGVcIjtcbiAgdG9wUmlnaHQuYXBwZW5kQ2hpbGQoYnRuKTtcbiAgbXV0ZU1nci5hdHRhY2hCdXR0b24oYnRuKTtcbn1cblxuLy8gR2xvYmFsIGtleWJvYXJkIHNob3J0Y3V0IChNKVxuKGZ1bmN0aW9uIGluc3RhbGxNdXRlSG90a2V5KCkge1xuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHtcbiAgICBpZiAoZS5rZXk/LnRvTG93ZXJDYXNlKCkgPT09IFwibVwiKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBtdXRlTWdyLnRvZ2dsZSgpO1xuICAgIH1cbiAgfSk7XG59KSgpO1xuXG5leHBvcnQgZnVuY3Rpb24gd2FpdEZvclVzZXJTdGFydChvcHRzOiBTdGFydEdhdGVPcHRpb25zID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgeyBsYWJlbCA9IFwiU3RhcnQgR2FtZVwiLCByZXF1ZXN0RnVsbHNjcmVlbiA9IGZhbHNlLCByZXN1bWVBdWRpbyB9ID0gb3B0cztcblxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAvLyBvdmVybGF5XG4gICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgb3ZlcmxheS5pZCA9IFwic3RhcnQtb3ZlcmxheVwiO1xuICAgIG92ZXJsYXkuaW5uZXJIVE1MID0gYFxuICAgICAgPGRpdiBpZD1cInN0YXJ0LWNvbnRhaW5lclwiPlxuICAgICAgICA8YnV0dG9uIGlkPVwic3RhcnQtYnRuXCIgYXJpYS1sYWJlbD1cIiR7bGFiZWx9XCI+JHtsYWJlbH08L2J1dHRvbj5cbiAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi10b3A6MTBweFwiPlxuICAgICAgICAgIDxidXR0b24gaWQ9XCJtdXRlLWJlbG93LXN0YXJ0XCIgY2xhc3M9XCJnaG9zdC1idG5cIiBhcmlhLXByZXNzZWQ9XCJmYWxzZVwiIHRpdGxlPVwiTXV0ZSAoTSlcIj5cdUQ4M0RcdUREMDcgTXV0ZTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPHA+IE9uIG1vYmlsZSB0dXJuIHBob25lIHRvIGxhbmRzY2FwZSBmb3IgYmVzdCBleHBlcmllbmNlLiA8L3A+XG4gICAgICA8L2Rpdj5cbiAgICBgO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgICAvLyBzdHlsZXMgKG1vdmUgdG8gQ1NTIGxhdGVyIGlmIHlvdSB3YW50KVxuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgI3N0YXJ0LW92ZXJsYXkge1xuICAgICAgICBwb3NpdGlvbjogZml4ZWQ7IGluc2V0OiAwOyBkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgYmFja2dyb3VuZDogcmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCBjZW50ZXIsIHJnYmEoMCwwLDAsMC42KSwgcmdiYSgwLDAsMCwwLjkpKTtcbiAgICAgICAgei1pbmRleDogOTk5OTtcbiAgICAgIH1cbiAgICAgICNzdGFydC1jb250YWluZXIgeyB0ZXh0LWFsaWduOiBjZW50ZXI7IH1cbiAgICAgICNzdGFydC1idG4ge1xuICAgICAgICBmb250LXNpemU6IDJyZW07IHBhZGRpbmc6IDFyZW0gMi41cmVtOyBib3JkZXI6IDJweCBzb2xpZCAjZmZmOyBib3JkZXItcmFkaXVzOiAxMHB4O1xuICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6ICNmZmY7IGN1cnNvcjogcG9pbnRlcjsgdHJhbnNpdGlvbjogdHJhbnNmb3JtIC4xMnMgZWFzZSwgYmFja2dyb3VuZCAuMnMgZWFzZSwgY29sb3IgLjJzIGVhc2U7XG4gICAgICB9XG4gICAgICAjc3RhcnQtYnRuOmhvdmVyIHsgYmFja2dyb3VuZDogI2ZmZjsgY29sb3I6ICMwMDA7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMXB4KTsgfVxuICAgICAgI3N0YXJ0LWJ0bjphY3RpdmUgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMCk7IH1cbiAgICAgICNtdXRlLWJlbG93LXN0YXJ0IHtcbiAgICAgICAgZm9udC1zaXplOiAxcmVtOyBwYWRkaW5nOiAuNXJlbSAxcmVtOyBib3JkZXItcmFkaXVzOiA5OTlweDsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgICAgYmFja2dyb3VuZDogcmdiYSgzMCwgNDEsIDU5LCAwLjcyKTsgY29sb3I6ICNmOGZhZmM7XG4gICAgICB9XG4gICAgICAuZ2hvc3QtYnRuLnNtYWxsIHsgcGFkZGluZzogNHB4IDhweDsgZm9udC1zaXplOiAxMXB4OyB9XG4gICAgYDtcbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcblxuICAgIC8vIFdpcmUgb3ZlcmxheSBidXR0b25zXG4gICAgY29uc3Qgc3RhcnRCdG4gPSBvdmVybGF5LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFwiI3N0YXJ0LWJ0blwiKSE7XG4gICAgY29uc3QgbXV0ZUJlbG93U3RhcnQgPSBvdmVybGF5LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFwiI211dGUtYmVsb3ctc3RhcnRcIikhO1xuICAgIGNvbnN0IHRvcE11dGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm11dGUtdG9wXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBpZiAodG9wTXV0ZSkgbXV0ZU1nci5hdHRhY2hCdXR0b24odG9wTXV0ZSk7XG4gICAgbXV0ZU1nci5hdHRhY2hCdXR0b24obXV0ZUJlbG93U3RhcnQpO1xuXG4gICAgLy8gcmVzdG9yZSBwZXJzaXN0ZWQgbXV0ZSBsYWJlbCBpbW1lZGlhdGVseVxuICAgIG11dGVNZ3IuZW5mb3JjZU9uY2VXaGVuUmVhZHkoKTtcblxuICAgIGNvbnN0IHN0YXJ0ID0gYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gYXVkaW8gZmlyc3QgKHVzZXIgZ2VzdHVyZSlcbiAgICAgIHRyeSB7IGF3YWl0IHJlc3VtZUF1ZGlvPy4oKTsgfSBjYXRjaCB7fVxuXG4gICAgICAvLyByZXNwZWN0IHBlcnNpc3RlZCBtdXRlIHN0YXRlIG5vdyB0aGF0IGN0eCBsaWtlbHkgZXhpc3RzXG4gICAgICBtdXRlTWdyLmVuZm9yY2VPbmNlV2hlblJlYWR5KCk7XG5cbiAgICAgIC8vIG9wdGlvbmFsIGZ1bGxzY3JlZW5cbiAgICAgIGlmIChyZXF1ZXN0RnVsbHNjcmVlbikge1xuICAgICAgICB0cnkgeyBhd2FpdCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQucmVxdWVzdEZ1bGxzY3JlZW4/LigpOyB9IGNhdGNoIHt9XG4gICAgICB9XG5cbiAgICAgIC8vIGNsZWFudXAgb3ZlcmxheVxuICAgICAgc3R5bGUucmVtb3ZlKCk7XG4gICAgICBvdmVybGF5LnJlbW92ZSgpO1xuXG4gICAgICAvLyBlbnN1cmUgdG9wLWZyYW1lIG11dGUgYnV0dG9uIGV4aXN0cyBhZnRlciBvdmVybGF5XG4gICAgICBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKTtcblxuICAgICAgcmVzb2x2ZSgpO1xuICAgIH07XG5cbiAgICAvLyBzdGFydCBidXR0b25cbiAgICBzdGFydEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgc3RhcnQsIHsgb25jZTogdHJ1ZSB9KTtcblxuICAgIC8vIEFjY2Vzc2liaWxpdHk6IGFsbG93IEVudGVyIC8gU3BhY2VcbiAgICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XG4gICAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiB8fCBlLmtleSA9PT0gXCIgXCIpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBzdGFydCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gRm9jdXMgZm9yIGtleWJvYXJkIHVzZXJzXG4gICAgc3RhcnRCdG4udGFiSW5kZXggPSAwO1xuICAgIHN0YXJ0QnRuLmZvY3VzKCk7XG5cbiAgICAvLyBBbHNvIHRyeSB0byBjcmVhdGUgdGhlIHRvcC1mcmFtZSBtdXRlIGltbWVkaWF0ZWx5IGlmIERPTSBpcyByZWFkeVxuICAgIC8vIChJZiAjdG9wLXJpZ2h0IGlzbid0IHRoZXJlIHlldCwgaXQncyBoYXJtbGVzczsgd2UnbGwgYWRkIGl0IGFmdGVyIHN0YXJ0IHRvby4pXG4gICAgZW5zdXJlVG9wRnJhbWVNdXRlQnV0dG9uKCk7XG4gIH0pO1xufVxuIiwgImltcG9ydCB7IG1ha2VQUk5HIH0gZnJvbSBcIi4uLy4uL2VuZ2luZVwiO1xuXG5leHBvcnQgdHlwZSBBbWJpZW50UGFyYW1zID0ge1xuICBpbnRlbnNpdHk6IG51bWJlcjsgIC8vIG92ZXJhbGwgbG91ZG5lc3MgLyBlbmVyZ3kgKDAuLjEpXG4gIGJyaWdodG5lc3M6IG51bWJlcjsgLy8gZmlsdGVyIG9wZW5uZXNzICYgY2hvcmQgdGltYnJlICgwLi4xKVxuICBkZW5zaXR5OiBudW1iZXI7ICAgIC8vIGNob3JkIHNwYXduIHJhdGUgLyB0aGlja25lc3MgKDAuLjEpXG59O1xuXG50eXBlIE1vZGVOYW1lID0gXCJJb25pYW5cIiB8IFwiRG9yaWFuXCIgfCBcIlBocnlnaWFuXCIgfCBcIkx5ZGlhblwiIHwgXCJNaXhvbHlkaWFuXCIgfCBcIkFlb2xpYW5cIiB8IFwiTG9jcmlhblwiO1xuXG5jb25zdCBNT0RFUzogUmVjb3JkPE1vZGVOYW1lLCBudW1iZXJbXT4gPSB7XG4gIElvbmlhbjogICAgIFswLDIsNCw1LDcsOSwxMV0sXG4gIERvcmlhbjogICAgIFswLDIsMyw1LDcsOSwxMF0sXG4gIFBocnlnaWFuOiAgIFswLDEsMyw1LDcsOCwxMF0sXG4gIEx5ZGlhbjogICAgIFswLDIsNCw2LDcsOSwxMV0sXG4gIE1peG9seWRpYW46IFswLDIsNCw1LDcsOSwxMF0sXG4gIEFlb2xpYW46ICAgIFswLDIsMyw1LDcsOCwxMF0sXG4gIExvY3JpYW46ICAgIFswLDEsMyw1LDYsOCwxMF0sXG59O1xuXG4vLyBNdXNpY2FsIGNvbnN0YW50cyB0dW5lZCB0byBtYXRjaCB0aGUgSFRNTCB2ZXJzaW9uXG5jb25zdCBST09UX01BWF9HQUlOICAgICA9IDAuMzM7XG5jb25zdCBST09UX1NXRUxMX1RJTUUgICA9IDIwO1xuY29uc3QgRFJPTkVfU0hJRlRfTUlOX1MgPSAyNDtcbmNvbnN0IERST05FX1NISUZUX01BWF9TID0gNDg7XG5jb25zdCBEUk9ORV9HTElERV9NSU5fUyA9IDg7XG5jb25zdCBEUk9ORV9HTElERV9NQVhfUyA9IDE1O1xuXG5jb25zdCBDSE9SRF9WT0lDRVNfTUFYICA9IDU7XG5jb25zdCBDSE9SRF9GQURFX01JTl9TICA9IDg7XG5jb25zdCBDSE9SRF9GQURFX01BWF9TICA9IDE2O1xuY29uc3QgQ0hPUkRfSE9MRF9NSU5fUyAgPSAxMDtcbmNvbnN0IENIT1JEX0hPTERfTUFYX1MgID0gMjI7XG5jb25zdCBDSE9SRF9HQVBfTUlOX1MgICA9IDQ7XG5jb25zdCBDSE9SRF9HQVBfTUFYX1MgICA9IDk7XG5jb25zdCBDSE9SRF9BTkNIT1JfUFJPQiA9IDAuNjsgLy8gcHJlZmVyIGFsaWduaW5nIGNob3JkIHJvb3QgdG8gZHJvbmVcblxuY29uc3QgRklMVEVSX0JBU0VfSFogICAgPSAyMjA7XG5jb25zdCBGSUxURVJfUEVBS19IWiAgICA9IDQyMDA7XG5jb25zdCBTV0VFUF9TRUdfUyAgICAgICA9IDMwOyAgLy8gdXAgdGhlbiBkb3duLCB2ZXJ5IHNsb3dcbmNvbnN0IExGT19SQVRFX0haICAgICAgID0gMC4wNTtcbmNvbnN0IExGT19ERVBUSF9IWiAgICAgID0gOTAwO1xuXG5jb25zdCBERUxBWV9USU1FX1MgICAgICA9IDAuNDU7XG5jb25zdCBGRUVEQkFDS19HQUlOICAgICA9IDAuMzU7XG5jb25zdCBXRVRfTUlYICAgICAgICAgICA9IDAuMjg7XG5cbi8vIGRlZ3JlZSBwcmVmZXJlbmNlIGZvciBkcm9uZSBtb3ZlczogMSw1LDMsNiwyLDQsNyAoaW5kZXhlcyAwLi42KVxuY29uc3QgUFJFRkVSUkVEX0RFR1JFRV9PUkRFUiA9IFswLDQsMiw1LDEsMyw2XTtcblxuLyoqIFV0aWxpdHkgKi9cbmNvbnN0IGNsYW1wMDEgPSAoeDogbnVtYmVyKSA9PiBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCB4KSk7XG5jb25zdCByYW5kID0gKHJuZzogKCkgPT4gbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYSArIHJuZygpICogKGIgLSBhKTtcbmNvbnN0IGNob2ljZSA9IDxULD4ocm5nOiAoKSA9PiBudW1iZXIsIGFycjogVFtdKSA9PiBhcnJbTWF0aC5mbG9vcihybmcoKSAqIGFyci5sZW5ndGgpXTtcblxuY29uc3QgbWlkaVRvRnJlcSA9IChtOiBudW1iZXIpID0+IDQ0MCAqIE1hdGgucG93KDIsIChtIC0gNjkpIC8gMTIpO1xuXG4vKiogQSBzaW5nbGUgc3RlYWR5IG9zY2lsbGF0b3Igdm9pY2Ugd2l0aCBzaGltbWVyIGRldHVuZSBhbmQgZ2FpbiBlbnZlbG9wZS4gKi9cbmNsYXNzIFZvaWNlIHtcbiAgcHJpdmF0ZSBraWxsZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSBzaGltbWVyOiBPc2NpbGxhdG9yTm9kZTtcbiAgcHJpdmF0ZSBzaGltbWVyR2FpbjogR2Fpbk5vZGU7XG4gIHByaXZhdGUgc2NhbGU6IEdhaW5Ob2RlO1xuICBwdWJsaWMgZzogR2Fpbk5vZGU7XG4gIHB1YmxpYyBvc2M6IE9zY2lsbGF0b3JOb2RlO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgY3R4OiBBdWRpb0NvbnRleHQsXG4gICAgcHJpdmF0ZSB0YXJnZXRHYWluOiBudW1iZXIsXG4gICAgd2F2ZWZvcm06IE9zY2lsbGF0b3JUeXBlLFxuICAgIGZyZXFIejogbnVtYmVyLFxuICAgIGRlc3RpbmF0aW9uOiBBdWRpb05vZGUsXG4gICAgcm5nOiAoKSA9PiBudW1iZXJcbiAgKXtcbiAgICB0aGlzLm9zYyA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZTogd2F2ZWZvcm0sIGZyZXF1ZW5jeTogZnJlcUh6IH0pO1xuXG4gICAgLy8gc3VidGxlIHNoaW1tZXIgdmlhIGRldHVuZSBtb2R1bGF0aW9uXG4gICAgdGhpcy5zaGltbWVyID0gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlOiBcInNpbmVcIiwgZnJlcXVlbmN5OiByYW5kKHJuZywgMC4wNiwgMC4xOCkgfSk7XG4gICAgdGhpcy5zaGltbWVyR2FpbiA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogcmFuZChybmcsIDAuNCwgMS4yKSB9KTtcbiAgICB0aGlzLnNjYWxlID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAyNSB9KTsgLy8gY2VudHMgcmFuZ2VcbiAgICB0aGlzLnNoaW1tZXIuY29ubmVjdCh0aGlzLnNoaW1tZXJHYWluKS5jb25uZWN0KHRoaXMuc2NhbGUpLmNvbm5lY3QodGhpcy5vc2MuZGV0dW5lKTtcblxuICAgIHRoaXMuZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgICB0aGlzLm9zYy5jb25uZWN0KHRoaXMuZykuY29ubmVjdChkZXN0aW5hdGlvbik7XG5cbiAgICB0aGlzLm9zYy5zdGFydCgpO1xuICAgIHRoaXMuc2hpbW1lci5zdGFydCgpO1xuICB9XG5cbiAgZmFkZUluKHNlY29uZHM6IG51bWJlcikge1xuICAgIGNvbnN0IG5vdyA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgIHRoaXMuZy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRoaXMuZy5nYWluLnNldFZhbHVlQXRUaW1lKHRoaXMuZy5nYWluLnZhbHVlLCBub3cpO1xuICAgIHRoaXMuZy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRoaXMudGFyZ2V0R2Fpbiwgbm93ICsgc2Vjb25kcyk7XG4gIH1cblxuICBmYWRlT3V0S2lsbChzZWNvbmRzOiBudW1iZXIpIHtcbiAgICBpZiAodGhpcy5raWxsZWQpIHJldHVybjtcbiAgICB0aGlzLmtpbGxlZCA9IHRydWU7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgdGhpcy5nLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdGhpcy5nLmdhaW4uc2V0VmFsdWVBdFRpbWUodGhpcy5nLmdhaW4udmFsdWUsIG5vdyk7XG4gICAgdGhpcy5nLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wMDAxLCBub3cgKyBzZWNvbmRzKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMuc3RvcCgpLCBzZWNvbmRzICogMTAwMCArIDYwKTtcbiAgfVxuXG4gIHNldEZyZXFHbGlkZSh0YXJnZXRIejogbnVtYmVyLCBnbGlkZVNlY29uZHM6IG51bWJlcikge1xuICAgIGNvbnN0IG5vdyA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgIC8vIGV4cG9uZW50aWFsIHdoZW4gcG9zc2libGUgZm9yIHNtb290aG5lc3NcbiAgICBjb25zdCBjdXJyZW50ID0gTWF0aC5tYXgoMC4wMDAxLCB0aGlzLm9zYy5mcmVxdWVuY3kudmFsdWUpO1xuICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LnNldFZhbHVlQXRUaW1lKGN1cnJlbnQsIG5vdyk7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kuZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSh0YXJnZXRIeiwgbm93ICsgZ2xpZGVTZWNvbmRzKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0YXJnZXRIeiwgbm93ICsgZ2xpZGVTZWNvbmRzKTtcbiAgICB9XG4gIH1cblxuICBzdG9wKCkge1xuICAgIHRyeSB7IHRoaXMub3NjLnN0b3AoKTsgdGhpcy5zaGltbWVyLnN0b3AoKTsgfSBjYXRjaCB7fVxuICAgIHRyeSB7XG4gICAgICB0aGlzLm9zYy5kaXNjb25uZWN0KCk7IHRoaXMuc2hpbW1lci5kaXNjb25uZWN0KCk7XG4gICAgICB0aGlzLmcuZGlzY29ubmVjdCgpOyB0aGlzLnNoaW1tZXJHYWluLmRpc2Nvbm5lY3QoKTsgdGhpcy5zY2FsZS5kaXNjb25uZWN0KCk7XG4gICAgfSBjYXRjaCB7fVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBBbWJpZW50U2NlbmUge1xuICBwcml2YXRlIHJ1bm5pbmcgPSBmYWxzZTtcbiAgcHJpdmF0ZSBzdG9wRm5zOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuICBwcml2YXRlIHRpbWVvdXRzOiBudW1iZXJbXSA9IFtdO1xuXG4gIHByaXZhdGUgcGFyYW1zOiBBbWJpZW50UGFyYW1zID0geyBpbnRlbnNpdHk6IDAuNzUsIGJyaWdodG5lc3M6IDAuNSwgZGVuc2l0eTogMC42IH07XG5cbiAgcHJpdmF0ZSBybmc6ICgpID0+IG51bWJlcjtcbiAgcHJpdmF0ZSBtYXN0ZXIhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBmaWx0ZXIhOiBCaXF1YWRGaWx0ZXJOb2RlO1xuICBwcml2YXRlIGRyeSE6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHdldCE6IEdhaW5Ob2RlO1xuICBwcml2YXRlIGRlbGF5ITogRGVsYXlOb2RlO1xuICBwcml2YXRlIGZlZWRiYWNrITogR2Fpbk5vZGU7XG5cbiAgcHJpdmF0ZSBsZm9Ob2RlPzogT3NjaWxsYXRvck5vZGU7XG4gIHByaXZhdGUgbGZvR2Fpbj86IEdhaW5Ob2RlO1xuXG4gIC8vIG11c2ljYWwgc3RhdGVcbiAgcHJpdmF0ZSBrZXlSb290TWlkaSA9IDQzO1xuICBwcml2YXRlIG1vZGU6IE1vZGVOYW1lID0gXCJJb25pYW5cIjtcbiAgcHJpdmF0ZSBkcm9uZURlZ3JlZUlkeCA9IDA7XG4gIHByaXZhdGUgcm9vdFZvaWNlOiBWb2ljZSB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgY3R4OiBBdWRpb0NvbnRleHQsXG4gICAgcHJpdmF0ZSBvdXQ6IEdhaW5Ob2RlLFxuICAgIHNlZWQgPSAxXG4gICkge1xuICAgIHRoaXMucm5nID0gbWFrZVBSTkcoc2VlZCk7XG4gIH1cblxuICBzZXRQYXJhbTxLIGV4dGVuZHMga2V5b2YgQW1iaWVudFBhcmFtcz4oazogSywgdjogQW1iaWVudFBhcmFtc1tLXSkge1xuICAgIHRoaXMucGFyYW1zW2tdID0gY2xhbXAwMSh2KTtcbiAgICBpZiAodGhpcy5ydW5uaW5nICYmIGsgPT09IFwiaW50ZW5zaXR5XCIgJiYgdGhpcy5tYXN0ZXIpIHtcbiAgICAgIHRoaXMubWFzdGVyLmdhaW4udmFsdWUgPSAwLjE1ICsgMC44NSAqIHRoaXMucGFyYW1zLmludGVuc2l0eTsgXG4gICAgfVxuICB9XG5cbiAgc3RhcnQoKSB7XG4gICAgaWYgKHRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIHRoaXMucnVubmluZyA9IHRydWU7XG5cbiAgICAvLyAtLS0tIENvcmUgZ3JhcGggKGZpbHRlciAtPiBkcnkrZGVsYXkgLT4gbWFzdGVyIC0+IG91dCkgLS0tLVxuICAgIHRoaXMubWFzdGVyID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IDAuMTUgKyAwLjg1ICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5IH0pO1xuICAgIHRoaXMuZmlsdGVyID0gbmV3IEJpcXVhZEZpbHRlck5vZGUodGhpcy5jdHgsIHsgdHlwZTogXCJsb3dwYXNzXCIsIFE6IDAuNzA3IH0pO1xuICAgIHRoaXMuZHJ5ID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IDEgfSk7XG4gICAgdGhpcy53ZXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogV0VUX01JWCB9KTtcbiAgICB0aGlzLmRlbGF5ID0gbmV3IERlbGF5Tm9kZSh0aGlzLmN0eCwgeyBkZWxheVRpbWU6IERFTEFZX1RJTUVfUywgbWF4RGVsYXlUaW1lOiAyIH0pO1xuICAgIHRoaXMuZmVlZGJhY2sgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogRkVFREJBQ0tfR0FJTiB9KTtcblxuICAgIHRoaXMuZmlsdGVyLmNvbm5lY3QodGhpcy5kcnkpLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMuZmlsdGVyLmNvbm5lY3QodGhpcy5kZWxheSk7XG4gICAgdGhpcy5kZWxheS5jb25uZWN0KHRoaXMuZmVlZGJhY2spLmNvbm5lY3QodGhpcy5kZWxheSk7XG4gICAgdGhpcy5kZWxheS5jb25uZWN0KHRoaXMud2V0KS5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLm1hc3Rlci5jb25uZWN0KHRoaXMub3V0KTtcblxuICAgIC8vIC0tLS0gRmlsdGVyIGJhc2VsaW5lICsgc2xvdyBzd2VlcHMgLS0tLVxuICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5zZXRWYWx1ZUF0VGltZShGSUxURVJfQkFTRV9IWiwgdGhpcy5jdHguY3VycmVudFRpbWUpO1xuICAgIGNvbnN0IHN3ZWVwID0gKCkgPT4ge1xuICAgICAgY29uc3QgdCA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICAgIC8vIHVwIHRoZW4gZG93biB1c2luZyB2ZXJ5IHNsb3cgdGltZSBjb25zdGFudHNcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5zZXRUYXJnZXRBdFRpbWUoXG4gICAgICAgIEZJTFRFUl9CQVNFX0haICsgKEZJTFRFUl9QRUFLX0haIC0gRklMVEVSX0JBU0VfSFopICogKDAuNCArIDAuNiAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpLFxuICAgICAgICB0LCBTV0VFUF9TRUdfUyAvIDNcbiAgICAgICk7XG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VGFyZ2V0QXRUaW1lKFxuICAgICAgICBGSUxURVJfQkFTRV9IWiAqICgwLjcgKyAwLjMgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKSxcbiAgICAgICAgdCArIFNXRUVQX1NFR19TLCBTV0VFUF9TRUdfUyAvIDNcbiAgICAgICk7XG4gICAgICB0aGlzLnRpbWVvdXRzLnB1c2god2luZG93LnNldFRpbWVvdXQoKCkgPT4gdGhpcy5ydW5uaW5nICYmIHN3ZWVwKCksIChTV0VFUF9TRUdfUyAqIDIpICogMTAwMCkgYXMgdW5rbm93biBhcyBudW1iZXIpO1xuICAgIH07XG4gICAgc3dlZXAoKTtcblxuICAgIC8vIC0tLS0gR2VudGxlIExGTyBvbiBmaWx0ZXIgZnJlcSAoc21hbGwgZGVwdGgpIC0tLS1cbiAgICB0aGlzLmxmb05vZGUgPSBuZXcgT3NjaWxsYXRvck5vZGUodGhpcy5jdHgsIHsgdHlwZTogXCJzaW5lXCIsIGZyZXF1ZW5jeTogTEZPX1JBVEVfSFogfSk7XG4gICAgdGhpcy5sZm9HYWluID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IExGT19ERVBUSF9IWiAqICgwLjUgKyAwLjUgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKSB9KTtcbiAgICB0aGlzLmxmb05vZGUuY29ubmVjdCh0aGlzLmxmb0dhaW4pLmNvbm5lY3QodGhpcy5maWx0ZXIuZnJlcXVlbmN5KTtcbiAgICB0aGlzLmxmb05vZGUuc3RhcnQoKTtcblxuICAgIC8vIC0tLS0gU3Bhd24gcm9vdCBkcm9uZSAoZ2xpZGluZyB0byBkaWZmZXJlbnQgZGVncmVlcykgLS0tLVxuICAgIHRoaXMuc3Bhd25Sb290RHJvbmUoKTtcbiAgICB0aGlzLnNjaGVkdWxlTmV4dERyb25lTW92ZSgpO1xuXG4gICAgLy8gLS0tLSBDaG9yZCBjeWNsZSBsb29wIC0tLS1cbiAgICB0aGlzLmNob3JkQ3ljbGUoKTtcblxuICAgIC8vIGNsZWFudXBcbiAgICB0aGlzLnN0b3BGbnMucHVzaCgoKSA9PiB7XG4gICAgICB0cnkgeyB0aGlzLmxmb05vZGU/LnN0b3AoKTsgfSBjYXRjaCB7fVxuICAgICAgW3RoaXMubWFzdGVyLCB0aGlzLmZpbHRlciwgdGhpcy5kcnksIHRoaXMud2V0LCB0aGlzLmRlbGF5LCB0aGlzLmZlZWRiYWNrLCB0aGlzLmxmb05vZGUsIHRoaXMubGZvR2Fpbl1cbiAgICAgICAgLmZvckVhY2gobiA9PiB7IHRyeSB7IG4/LmRpc2Nvbm5lY3QoKTsgfSBjYXRjaCB7fSB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcblxuICAgIC8vIGNhbmNlbCB0aW1lb3V0c1xuICAgIHRoaXMudGltZW91dHMuc3BsaWNlKDApLmZvckVhY2goaWQgPT4gd2luZG93LmNsZWFyVGltZW91dChpZCkpO1xuXG4gICAgLy8gZmFkZSBhbmQgY2xlYW51cCB2b2ljZXNcbiAgICBpZiAodGhpcy5yb290Vm9pY2UpIHRoaXMucm9vdFZvaWNlLmZhZGVPdXRLaWxsKDEuMik7XG5cbiAgICAvLyBydW4gZGVmZXJyZWQgc3RvcHNcbiAgICB0aGlzLnN0b3BGbnMuc3BsaWNlKDApLmZvckVhY2goZm4gPT4gZm4oKSk7XG4gIH1cblxuICAvKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIE11c2ljYWwgZW5naW5lIGJlbG93IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gKi9cblxuICBwcml2YXRlIGN1cnJlbnREZWdyZWVzKCk6IG51bWJlcltdIHtcbiAgICByZXR1cm4gTU9ERVNbdGhpcy5tb2RlXSB8fCBNT0RFUy5MeWRpYW47XG4gIH1cblxuICAvKiogRHJvbmUgcm9vdCB2b2ljZSAqL1xuICBwcml2YXRlIHNwYXduUm9vdERyb25lKCkge1xuICAgIGNvbnN0IGJhc2VNaWRpID0gdGhpcy5rZXlSb290TWlkaSArIHRoaXMuY3VycmVudERlZ3JlZXMoKVt0aGlzLmRyb25lRGVncmVlSWR4XTtcbiAgICBjb25zdCB2ID0gbmV3IFZvaWNlKFxuICAgICAgdGhpcy5jdHgsXG4gICAgICBST09UX01BWF9HQUlOLFxuICAgICAgXCJzaW5lXCIsXG4gICAgICBtaWRpVG9GcmVxKGJhc2VNaWRpKSxcbiAgICAgIHRoaXMuZmlsdGVyLFxuICAgICAgdGhpcy5ybmdcbiAgICApO1xuICAgIHYuZmFkZUluKFJPT1RfU1dFTExfVElNRSk7XG4gICAgdGhpcy5yb290Vm9pY2UgPSB2O1xuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZU5leHREcm9uZU1vdmUoKSB7XG4gICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICBjb25zdCB3YWl0TXMgPSByYW5kKHRoaXMucm5nLCBEUk9ORV9TSElGVF9NSU5fUywgRFJPTkVfU0hJRlRfTUFYX1MpICogMTAwMDtcbiAgICBjb25zdCBpZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICghdGhpcy5ydW5uaW5nIHx8ICF0aGlzLnJvb3RWb2ljZSkgcmV0dXJuO1xuICAgICAgY29uc3QgZ2xpZGUgPSByYW5kKHRoaXMucm5nLCBEUk9ORV9HTElERV9NSU5fUywgRFJPTkVfR0xJREVfTUFYX1MpO1xuICAgICAgY29uc3QgbmV4dElkeCA9IHRoaXMucGlja05leHREcm9uZURlZ3JlZUlkeCgpO1xuICAgICAgY29uc3QgdGFyZ2V0TWlkaSA9IHRoaXMua2V5Um9vdE1pZGkgKyB0aGlzLmN1cnJlbnREZWdyZWVzKClbbmV4dElkeF07XG4gICAgICB0aGlzLnJvb3RWb2ljZS5zZXRGcmVxR2xpZGUobWlkaVRvRnJlcSh0YXJnZXRNaWRpKSwgZ2xpZGUpO1xuICAgICAgdGhpcy5kcm9uZURlZ3JlZUlkeCA9IG5leHRJZHg7XG4gICAgICB0aGlzLnNjaGVkdWxlTmV4dERyb25lTW92ZSgpO1xuICAgIH0sIHdhaXRNcykgYXMgdW5rbm93biBhcyBudW1iZXI7XG4gICAgdGhpcy50aW1lb3V0cy5wdXNoKGlkKTtcbiAgfVxuXG4gIHByaXZhdGUgcGlja05leHREcm9uZURlZ3JlZUlkeCgpOiBudW1iZXIge1xuICAgIGNvbnN0IG9yZGVyID0gWy4uLlBSRUZFUlJFRF9ERUdSRUVfT1JERVJdO1xuICAgIGNvbnN0IGkgPSBvcmRlci5pbmRleE9mKHRoaXMuZHJvbmVEZWdyZWVJZHgpO1xuICAgIGlmIChpID49IDApIHsgY29uc3QgW2N1cl0gPSBvcmRlci5zcGxpY2UoaSwgMSk7IG9yZGVyLnB1c2goY3VyKTsgfVxuICAgIHJldHVybiBjaG9pY2UodGhpcy5ybmcsIG9yZGVyKTtcbiAgfVxuXG4gIC8qKiBCdWlsZCBkaWF0b25pYyBzdGFja2VkLXRoaXJkIGNob3JkIGRlZ3JlZXMgd2l0aCBvcHRpb25hbCBleHRlbnNpb25zICovXG4gIHByaXZhdGUgYnVpbGRDaG9yZERlZ3JlZXMobW9kZURlZ3M6IG51bWJlcltdLCByb290SW5kZXg6IG51bWJlciwgc2l6ZSA9IDQsIGFkZDkgPSBmYWxzZSwgYWRkMTEgPSBmYWxzZSwgYWRkMTMgPSBmYWxzZSkge1xuICAgIGNvbnN0IHN0ZXBzID0gWzAsIDIsIDQsIDZdOyAvLyB0aGlyZHMgb3ZlciA3LW5vdGUgc2NhbGVcbiAgICBjb25zdCBjaG9yZElkeHMgPSBzdGVwcy5zbGljZSgwLCBNYXRoLm1pbihzaXplLCA0KSkubWFwKHMgPT4gKHJvb3RJbmRleCArIHMpICUgNyk7XG4gICAgaWYgKGFkZDkpICBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgOCkgJSA3KTtcbiAgICBpZiAoYWRkMTEpIGNob3JkSWR4cy5wdXNoKChyb290SW5kZXggKyAxMCkgJSA3KTtcbiAgICBpZiAoYWRkMTMpIGNob3JkSWR4cy5wdXNoKChyb290SW5kZXggKyAxMikgJSA3KTtcbiAgICByZXR1cm4gY2hvcmRJZHhzLm1hcChpID0+IG1vZGVEZWdzW2ldKTtcbiAgfVxuXG4gIHByaXZhdGUgKmVuZGxlc3NDaG9yZHMoKSB7XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGNvbnN0IG1vZGVEZWdzID0gdGhpcy5jdXJyZW50RGVncmVlcygpO1xuICAgICAgLy8gY2hvb3NlIGNob3JkIHJvb3QgZGVncmVlIChvZnRlbiBhbGlnbiB3aXRoIGRyb25lKVxuICAgICAgY29uc3Qgcm9vdERlZ3JlZUluZGV4ID0gKHRoaXMucm5nKCkgPCBDSE9SRF9BTkNIT1JfUFJPQikgPyB0aGlzLmRyb25lRGVncmVlSWR4IDogTWF0aC5mbG9vcih0aGlzLnJuZygpICogNyk7XG5cbiAgICAgIC8vIGNob3JkIHNpemUgLyBleHRlbnNpb25zXG4gICAgICBjb25zdCByID0gdGhpcy5ybmcoKTtcbiAgICAgIGxldCBzaXplID0gMzsgbGV0IGFkZDkgPSBmYWxzZSwgYWRkMTEgPSBmYWxzZSwgYWRkMTMgPSBmYWxzZTtcbiAgICAgIGlmIChyIDwgMC4zNSkgICAgICAgICAgICB7IHNpemUgPSAzOyB9XG4gICAgICBlbHNlIGlmIChyIDwgMC43NSkgICAgICAgeyBzaXplID0gNDsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuOTApICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDkgPSB0cnVlOyB9XG4gICAgICBlbHNlIGlmIChyIDwgMC45NykgICAgICAgeyBzaXplID0gNDsgYWRkMTEgPSB0cnVlOyB9XG4gICAgICBlbHNlICAgICAgICAgICAgICAgICAgICAgeyBzaXplID0gNDsgYWRkMTMgPSB0cnVlOyB9XG5cbiAgICAgIGNvbnN0IGNob3JkU2VtaXMgPSB0aGlzLmJ1aWxkQ2hvcmREZWdyZWVzKG1vZGVEZWdzLCByb290RGVncmVlSW5kZXgsIHNpemUsIGFkZDksIGFkZDExLCBhZGQxMyk7XG4gICAgICAvLyBzcHJlYWQgY2hvcmQgYWNyb3NzIG9jdGF2ZXMgKC0xMiwgMCwgKzEyKSwgYmlhcyB0byBjZW50ZXJcbiAgICAgIGNvbnN0IHNwcmVhZCA9IGNob3JkU2VtaXMubWFwKHNlbWkgPT4gc2VtaSArIGNob2ljZSh0aGlzLnJuZywgWy0xMiwgMCwgMCwgMTJdKSk7XG5cbiAgICAgIC8vIG9jY2FzaW9uYWxseSBlbnN1cmUgdG9uaWMgaXMgcHJlc2VudCBmb3IgZ3JvdW5kaW5nXG4gICAgICBpZiAoIXNwcmVhZC5pbmNsdWRlcygwKSAmJiB0aGlzLnJuZygpIDwgMC41KSBzcHJlYWQucHVzaCgwKTtcblxuICAgICAgeWllbGQgc3ByZWFkO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hvcmRDeWNsZSgpIHtcbiAgICBjb25zdCBnZW4gPSB0aGlzLmVuZGxlc3NDaG9yZHMoKTtcbiAgICBjb25zdCB2b2ljZXMgPSBuZXcgU2V0PFZvaWNlPigpO1xuXG4gICAgY29uc3Qgc2xlZXAgPSAobXM6IG51bWJlcikgPT4gbmV3IFByb21pc2U8dm9pZD4ociA9PiB7XG4gICAgICBjb25zdCBpZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHIoKSwgbXMpIGFzIHVua25vd24gYXMgbnVtYmVyO1xuICAgICAgdGhpcy50aW1lb3V0cy5wdXNoKGlkKTtcbiAgICB9KTtcblxuICAgIHdoaWxlICh0aGlzLnJ1bm5pbmcpIHtcbiAgICAgIC8vIGNob3JkIHNwYXduIHByb2JhYmlsaXR5IC8gdGhpY2tuZXNzIHNjYWxlIHdpdGggZGVuc2l0eSAmIGJyaWdodG5lc3NcbiAgICAgIGNvbnN0IHRoaWNrbmVzcyA9IE1hdGgucm91bmQoMiArIHRoaXMucGFyYW1zLmRlbnNpdHkgKiAzKTtcbiAgICAgIGNvbnN0IGJhc2VNaWRpID0gdGhpcy5rZXlSb290TWlkaTtcbiAgICAgIGNvbnN0IGRlZ3JlZXNPZmY6IG51bWJlcltdID0gZ2VuLm5leHQoKS52YWx1ZSA/PyBbXTtcblxuICAgICAgLy8gc3Bhd25cbiAgICAgIGZvciAoY29uc3Qgb2ZmIG9mIGRlZ3JlZXNPZmYpIHtcbiAgICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcpIGJyZWFrO1xuICAgICAgICBpZiAodm9pY2VzLnNpemUgPj0gTWF0aC5taW4oQ0hPUkRfVk9JQ0VTX01BWCwgdGhpY2tuZXNzKSkgYnJlYWs7XG5cbiAgICAgICAgY29uc3QgbWlkaSA9IGJhc2VNaWRpICsgb2ZmO1xuICAgICAgICBjb25zdCBmcmVxID0gbWlkaVRvRnJlcShtaWRpKTtcbiAgICAgICAgY29uc3Qgd2F2ZWZvcm0gPSBjaG9pY2UodGhpcy5ybmcsIFtcInNpbmVcIiwgXCJ0cmlhbmdsZVwiLCBcInNhd3Rvb3RoXCJdIGFzIE9zY2lsbGF0b3JUeXBlW10pO1xuXG4gICAgICAgIC8vIGxvdWRlciB3aXRoIGludGVuc2l0eTsgc2xpZ2h0bHkgYnJpZ2h0ZXIgLT4gc2xpZ2h0bHkgbG91ZGVyXG4gICAgICAgIGNvbnN0IGdhaW5UYXJnZXQgPSByYW5kKHRoaXMucm5nLCAwLjA4LCAwLjIyKSAqXG4gICAgICAgICAgKDAuODUgKyAwLjMgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHkpICpcbiAgICAgICAgICAoMC45ICsgMC4yICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyk7XG5cbiAgICAgICAgY29uc3QgdiA9IG5ldyBWb2ljZSh0aGlzLmN0eCwgZ2FpblRhcmdldCwgd2F2ZWZvcm0sIGZyZXEsIHRoaXMuZmlsdGVyLCB0aGlzLnJuZyk7XG4gICAgICAgIHZvaWNlcy5hZGQodik7XG4gICAgICAgIHYuZmFkZUluKHJhbmQodGhpcy5ybmcsIENIT1JEX0ZBREVfTUlOX1MsIENIT1JEX0ZBREVfTUFYX1MpKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgc2xlZXAocmFuZCh0aGlzLnJuZywgQ0hPUkRfSE9MRF9NSU5fUywgQ0hPUkRfSE9MRF9NQVhfUykgKiAxMDAwKTtcblxuICAgICAgLy8gZmFkZSBvdXRcbiAgICAgIGNvbnN0IG91dHMgPSBBcnJheS5mcm9tKHZvaWNlcyk7XG4gICAgICBmb3IgKGNvbnN0IHYgb2Ygb3V0cykgdi5mYWRlT3V0S2lsbChyYW5kKHRoaXMucm5nLCBDSE9SRF9GQURFX01JTl9TLCBDSE9SRF9GQURFX01BWF9TKSk7XG4gICAgICB2b2ljZXMuY2xlYXIoKTtcblxuICAgICAgYXdhaXQgc2xlZXAocmFuZCh0aGlzLnJuZywgQ0hPUkRfR0FQX01JTl9TLCBDSE9SRF9HQVBfTUFYX1MpICogMTAwMCk7XG4gICAgfVxuXG4gICAgLy8gc2FmZXR5OiBraWxsIGFueSBsaW5nZXJpbmcgdm9pY2VzXG4gICAgZm9yIChjb25zdCB2IG9mIEFycmF5LmZyb20odm9pY2VzKSkgdi5mYWRlT3V0S2lsbCgwLjgpO1xuICB9XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTY2VuZU5hbWUsIE11c2ljU2NlbmVPcHRpb25zIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuLi9lbmdpbmVcIjtcbmltcG9ydCB7IEFtYmllbnRTY2VuZSB9IGZyb20gXCIuL3NjZW5lcy9hbWJpZW50XCI7XG5cbmV4cG9ydCBjbGFzcyBNdXNpY0RpcmVjdG9yIHtcbiAgcHJpdmF0ZSBjdXJyZW50PzogeyBuYW1lOiBTY2VuZU5hbWU7IHN0b3A6ICgpID0+IHZvaWQgfTtcbiAgcHJpdmF0ZSBidXNPdXQ6IEdhaW5Ob2RlO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZW5naW5lOiBBdWRpb0VuZ2luZSkge1xuICAgIHRoaXMuYnVzT3V0ID0gbmV3IEdhaW5Ob2RlKGVuZ2luZS5jdHgsIHsgZ2FpbjogMC45IH0pO1xuICAgIHRoaXMuYnVzT3V0LmNvbm5lY3QoZW5naW5lLmdldE11c2ljQnVzKCkpO1xuICB9XG5cbiAgLyoqIENyb3NzZmFkZSB0byBhIG5ldyBzY2VuZSAqL1xuICBzZXRTY2VuZShuYW1lOiBTY2VuZU5hbWUsIG9wdHM/OiBNdXNpY1NjZW5lT3B0aW9ucykge1xuICAgIGlmICh0aGlzLmN1cnJlbnQ/Lm5hbWUgPT09IG5hbWUpIHJldHVybjtcblxuICAgIGNvbnN0IG9sZCA9IHRoaXMuY3VycmVudDtcbiAgICBjb25zdCB0ID0gdGhpcy5lbmdpbmUubm93O1xuXG4gICAgLy8gZmFkZS1vdXQgb2xkXG4gICAgY29uc3QgZmFkZU91dCA9IG5ldyBHYWluTm9kZSh0aGlzLmVuZ2luZS5jdHgsIHsgZ2FpbjogMC45IH0pO1xuICAgIGZhZGVPdXQuY29ubmVjdCh0aGlzLmVuZ2luZS5nZXRNdXNpY0J1cygpKTtcbiAgICBpZiAob2xkKSB7XG4gICAgICAvLyBXZSBhc3N1bWUgZWFjaCBzY2VuZSBtYW5hZ2VzIGl0cyBvd24gb3V0IG5vZGU7IHN0b3BwaW5nIHRyaWdnZXJzIGEgbmF0dXJhbCB0YWlsLlxuICAgICAgb2xkLnN0b3AoKTtcbiAgICAgIGZhZGVPdXQuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjAsIHQgKyAwLjYpO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiBmYWRlT3V0LmRpc2Nvbm5lY3QoKSwgNjUwKTtcbiAgICB9XG5cbiAgICAvLyBuZXcgc2NlbmVcbiAgICBjb25zdCBzY2VuZU91dCA9IG5ldyBHYWluTm9kZSh0aGlzLmVuZ2luZS5jdHgsIHsgZ2FpbjogMCB9KTtcbiAgICBzY2VuZU91dC5jb25uZWN0KHRoaXMuYnVzT3V0KTtcblxuICAgIGxldCBzdG9wID0gKCkgPT4gc2NlbmVPdXQuZGlzY29ubmVjdCgpO1xuXG4gICAgaWYgKG5hbWUgPT09IFwiYW1iaWVudFwiKSB7XG4gICAgICBjb25zdCBzID0gbmV3IEFtYmllbnRTY2VuZSh0aGlzLmVuZ2luZS5jdHgsIHNjZW5lT3V0LCBvcHRzPy5zZWVkID8/IDEpO1xuICAgICAgcy5zdGFydCgpO1xuICAgICAgc3RvcCA9ICgpID0+IHtcbiAgICAgICAgcy5zdG9wKCk7XG4gICAgICAgIHNjZW5lT3V0LmRpc2Nvbm5lY3QoKTtcbiAgICAgIH07XG4gICAgfVxuICAgIC8vIGVsc2UgaWYgKG5hbWUgPT09IFwiY29tYmF0XCIpIHsgLyogaW1wbGVtZW50IGNvbWJhdCBzY2VuZSBsYXRlciAqLyB9XG4gICAgLy8gZWxzZSBpZiAobmFtZSA9PT0gXCJsb2JieVwiKSB7IC8qIGltcGxlbWVudCBsb2JieSBzY2VuZSBsYXRlciAqLyB9XG5cbiAgICB0aGlzLmN1cnJlbnQgPSB7IG5hbWUsIHN0b3AgfTtcbiAgICBzY2VuZU91dC5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuOSwgdCArIDAuNik7XG4gIH1cblxuICBzdG9wKCkge1xuICAgIGlmICghdGhpcy5jdXJyZW50KSByZXR1cm47XG4gICAgdGhpcy5jdXJyZW50LnN0b3AoKTtcbiAgICB0aGlzLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gIH1cbn1cbiIsICJpbXBvcnQgdHlwZSB7IEJ1cywgTXVzaWNQYXJhbU1lc3NhZ2UsIE11c2ljU2NlbmVPcHRpb25zIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBNdXNpY0RpcmVjdG9yIH0gZnJvbSBcIi4vbXVzaWNcIjtcbmltcG9ydCB7IHBsYXlTZnggfSBmcm9tIFwiLi9zZnhcIjtcblxuLyoqXG4gKiBCaW5kIHN0YW5kYXJkIGF1ZGlvIGV2ZW50cyB0byB0aGUgZW5naW5lIGFuZCBtdXNpYyBkaXJlY3Rvci5cbiAqXG4gKiBFdmVudHMgc3VwcG9ydGVkOlxuICogIC0gYXVkaW86cmVzdW1lXG4gKiAgLSBhdWRpbzptdXRlIC8gYXVkaW86dW5tdXRlXG4gKiAgLSBhdWRpbzpzZXQtbWFzdGVyLWdhaW4geyBnYWluIH1cbiAqICAtIGF1ZGlvOnNmeCB7IG5hbWUsIHZlbG9jaXR5PywgcGFuPyB9XG4gKiAgLSBhdWRpbzptdXNpYzpzZXQtc2NlbmUgeyBzY2VuZSwgc2VlZD8gfVxuICogIC0gYXVkaW86bXVzaWM6cGFyYW0geyBrZXksIHZhbHVlIH1cbiAqICAtIGF1ZGlvOm11c2ljOnRyYW5zcG9ydCB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfSAgLy8gcGF1c2UgY3VycmVudGx5IG1hcHMgdG8gc3RvcFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJBdWRpb0J1c0JpbmRpbmdzKFxuICBidXM6IEJ1cyxcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgbXVzaWM6IE11c2ljRGlyZWN0b3Jcbik6IHZvaWQge1xuICBidXMub24oXCJhdWRpbzpyZXN1bWVcIiwgKCkgPT4gZW5naW5lLnJlc3VtZSgpKTtcbiAgYnVzLm9uKFwiYXVkaW86bXV0ZVwiLCAoKSA9PiBlbmdpbmUuc2V0TWFzdGVyR2FpbigwKSk7XG4gIGJ1cy5vbihcImF1ZGlvOnVubXV0ZVwiLCAoKSA9PiBlbmdpbmUuc2V0TWFzdGVyR2FpbigwLjkpKTtcbiAgYnVzLm9uKFwiYXVkaW86c2V0LW1hc3Rlci1nYWluXCIsICh7IGdhaW4gfTogeyBnYWluOiBudW1iZXIgfSkgPT5cbiAgICBlbmdpbmUuc2V0TWFzdGVyR2FpbihNYXRoLm1heCgwLCBNYXRoLm1pbigxLCBnYWluKSkpXG4gICk7XG5cbiAgYnVzLm9uKFwiYXVkaW86c2Z4XCIsIChtc2c6IHsgbmFtZTogc3RyaW5nOyB2ZWxvY2l0eT86IG51bWJlcjsgcGFuPzogbnVtYmVyIH0pID0+IHtcbiAgICBwbGF5U2Z4KGVuZ2luZSwgbXNnLm5hbWUgYXMgYW55LCB7IHZlbG9jaXR5OiBtc2cudmVsb2NpdHksIHBhbjogbXNnLnBhbiB9KTtcbiAgfSk7XG5cbiAgYnVzLm9uKFwiYXVkaW86bXVzaWM6c2V0LXNjZW5lXCIsIChtc2c6IHsgc2NlbmU6IHN0cmluZyB9ICYgTXVzaWNTY2VuZU9wdGlvbnMpID0+IHtcbiAgICBlbmdpbmUucmVzdW1lKCk7XG4gICAgbXVzaWMuc2V0U2NlbmUobXNnLnNjZW5lIGFzIGFueSwgeyBzZWVkOiBtc2cuc2VlZCB9KTtcbiAgfSk7XG5cbiAgYnVzLm9uKFwiYXVkaW86bXVzaWM6cGFyYW1cIiwgKF9tc2c6IE11c2ljUGFyYW1NZXNzYWdlKSA9PiB7XG4gICAgLy8gSG9vayBmb3IgZnV0dXJlIHBhcmFtIHJvdXRpbmcgcGVyIHNjZW5lIChlLmcuLCBpbnRlbnNpdHkvYnJpZ2h0bmVzcy9kZW5zaXR5KVxuICAgIC8vIElmIHlvdSB3YW50IGdsb2JhbCBwYXJhbXMsIGtlZXAgYSBtYXAgaGVyZSBhbmQgZm9yd2FyZCB0byB0aGUgYWN0aXZlIHNjZW5lXG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnRyYW5zcG9ydFwiLCAoeyBjbWQgfTogeyBjbWQ6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJwYXVzZVwiIH0pID0+IHtcbiAgICBpZiAoY21kID09PSBcInN0b3BcIiB8fCBjbWQgPT09IFwicGF1c2VcIikgbXVzaWMuc3RvcCgpO1xuICAgIC8vIFwic3RhcnRcIiBpcyBpbXBsaWNpdCB2aWEgc2V0U2NlbmVcbiAgfSk7XG59XG4iLCAiaW1wb3J0IHsgY3JlYXRlRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7IGNvbm5lY3RXZWJTb2NrZXQsIHNlbmRNZXNzYWdlIH0gZnJvbSBcIi4vbmV0XCI7XG5pbXBvcnQgeyBpbml0R2FtZSB9IGZyb20gXCIuL2dhbWVcIjtcbmltcG9ydCB7IGNyZWF0ZUluaXRpYWxTdGF0ZSwgY3JlYXRlSW5pdGlhbFVJU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHsgbW91bnRUdXRvcmlhbCwgQkFTSUNfVFVUT1JJQUxfSUQgfSBmcm9tIFwiLi90dXRvcmlhbFwiO1xuaW1wb3J0IHsgY2xlYXJQcm9ncmVzcyBhcyBjbGVhclR1dG9yaWFsUHJvZ3Jlc3MgfSBmcm9tIFwiLi90dXRvcmlhbC9zdG9yYWdlXCI7XG5pbXBvcnQgeyBtb3VudFN0b3J5LCBJTlRST19DSEFQVEVSX0lELCBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUyB9IGZyb20gXCIuL3N0b3J5XCI7XG5pbXBvcnQgeyB3YWl0Rm9yVXNlclN0YXJ0IH0gZnJvbSBcIi4vc3RhcnQtZ2F0ZVwiO1xuaW1wb3J0IHsgcmVzdW1lQXVkaW8gfSBmcm9tIFwiLi9zdG9yeS9zZnhcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4vYXVkaW8vZW5naW5lXCI7XG5pbXBvcnQgeyBNdXNpY0RpcmVjdG9yIH0gZnJvbSBcIi4vYXVkaW8vbXVzaWNcIjtcbmltcG9ydCB7IHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyB9IGZyb20gXCIuL2F1ZGlvL2N1ZXNcIjtcblxuY29uc3QgQ0FMTF9TSUdOX1NUT1JBR0VfS0VZID0gXCJsc2Q6Y2FsbHNpZ25cIjtcblxuKGFzeW5jIGZ1bmN0aW9uIGJvb3RzdHJhcCgpIHtcbiAgY29uc3QgcXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuICBjb25zdCByb29tID0gcXMuZ2V0KFwicm9vbVwiKSB8fCBcImRlZmF1bHRcIjtcbiAgY29uc3QgbW9kZSA9IHFzLmdldChcIm1vZGVcIikgfHwgXCJcIjtcbiAgY29uc3QgbmFtZVBhcmFtID0gc2FuaXRpemVDYWxsU2lnbihxcy5nZXQoXCJuYW1lXCIpKTtcbiAgY29uc3Qgc3RvcmVkTmFtZSA9IHNhbml0aXplQ2FsbFNpZ24ocmVhZFN0b3JlZENhbGxTaWduKCkpO1xuICBjb25zdCBjYWxsU2lnbiA9IG5hbWVQYXJhbSB8fCBzdG9yZWROYW1lO1xuICBjb25zdCBtYXBXID0gcGFyc2VGbG9hdChxcy5nZXQoXCJtYXBXXCIpIHx8IFwiODAwMFwiKTtcbiAgY29uc3QgbWFwSCA9IHBhcnNlRmxvYXQocXMuZ2V0KFwibWFwSFwiKSB8fCBcIjQ1MDBcIik7XG5cbiAgaWYgKG5hbWVQYXJhbSAmJiBuYW1lUGFyYW0gIT09IHN0b3JlZE5hbWUpIHtcbiAgICBwZXJzaXN0Q2FsbFNpZ24obmFtZVBhcmFtKTtcbiAgfVxuXG4gIC8vIEdhdGUgZXZlcnl0aGluZyBvbiBhIHVzZXIgZ2VzdHVyZSAoY2VudHJlZCBidXR0b24pXG4gIGF3YWl0IHdhaXRGb3JVc2VyU3RhcnQoe1xuICAgIGxhYmVsOiBcIlN0YXJ0IEdhbWVcIixcbiAgICByZXF1ZXN0RnVsbHNjcmVlbjogZmFsc2UsICAgLy8gZmxpcCB0byB0cnVlIGlmIHlvdSB3YW50IGZ1bGxzY3JlZW5cbiAgICByZXN1bWVBdWRpbywgICAgICAgICAgICAgICAgLy8gdXNlcyBzdG9yeS9zZngudHNcbiAgfSk7XG5cbiAgLy8gLS0tLSBTdGFydCBhY3R1YWwgYXBwIGFmdGVyIGdlc3R1cmUgLS0tLVxuICBjb25zdCBzdGF0ZSA9IGNyZWF0ZUluaXRpYWxTdGF0ZSgpO1xuICBjb25zdCB1aVN0YXRlID0gY3JlYXRlSW5pdGlhbFVJU3RhdGUoKTtcbiAgY29uc3QgYnVzID0gY3JlYXRlRXZlbnRCdXMoKTtcblxuICAvLyAtLS0gQVVESU86IGVuZ2luZSArIGJpbmRpbmdzICsgZGVmYXVsdCBzY2VuZSAtLS1cbiAgY29uc3QgZW5naW5lID0gQXVkaW9FbmdpbmUuZ2V0KCk7XG4gIGF3YWl0IGVuZ2luZS5yZXN1bWUoKTsgLy8gc2FmZSBwb3N0LWdlc3R1cmVcbiAgY29uc3QgbXVzaWMgPSBuZXcgTXVzaWNEaXJlY3RvcihlbmdpbmUpO1xuICByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MoYnVzIGFzIGFueSwgZW5naW5lLCBtdXNpYyk7XG5cbiAgLy8gU3RhcnQgYSBkZWZhdWx0IG11c2ljIHNjZW5lIChhZGp1c3Qgc2VlZC9zY2VuZSBhcyB5b3UgbGlrZSlcbiAgYnVzLmVtaXQoXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIiwgeyBzY2VuZTogXCJhbWJpZW50XCIsIHNlZWQ6IDQyIH0pO1xuXG4gIC8vIE9wdGlvbmFsOiBiYXNpYyBob29rcyB0byBkZW1vbnN0cmF0ZSBTRlggJiBkdWNraW5nXG4gIC8vIGJ1cy5vbihcImRpYWxvZ3VlOm9wZW5lZFwiLCAoKSA9PiBlbmdpbmUuZHVja011c2ljKDAuMzUsIDAuMSkpO1xuICAvLyBidXMub24oXCJkaWFsb2d1ZTpjbG9zZWRcIiwgKCkgPT4gZW5naW5lLnVuZHVja011c2ljKDAuMjUpKTtcblxuICAvLyBFeGFtcGxlIGdhbWUgU0ZYIHdpcmluZyAoYWRhcHQgdG8geW91ciBhY3R1YWwgZXZlbnRzKVxuICBidXMub24oXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCAoeyB2YWx1ZSB9KSA9PiB7XG4gICAgaWYgKHZhbHVlID4gMCkgYnVzLmVtaXQoXCJhdWRpbzpzZnhcIiwgeyBuYW1lOiBcInRocnVzdFwiLCB2ZWxvY2l0eTogTWF0aC5taW4oMSwgdmFsdWUpIH0pO1xuICB9KTtcblxuICBjb25zdCBnYW1lID0gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH0pO1xuXG4gIC8vIE1vdW50IHR1dG9yaWFsIGFuZCBzdG9yeSBiYXNlZCBvbiBnYW1lIG1vZGVcbiAgY29uc3QgZW5hYmxlVHV0b3JpYWwgPSBtb2RlID09PSBcImNhbXBhaWduXCIgfHwgbW9kZSA9PT0gXCJ0dXRvcmlhbFwiO1xuICBjb25zdCBlbmFibGVTdG9yeSA9IG1vZGUgPT09IFwiY2FtcGFpZ25cIjtcblxuICBsZXQgdHV0b3JpYWw6IFJldHVyblR5cGU8dHlwZW9mIG1vdW50VHV0b3JpYWw+IHwgbnVsbCA9IG51bGw7XG4gIGxldCB0dXRvcmlhbFN0YXJ0ZWQgPSBmYWxzZTtcblxuICBpZiAoZW5hYmxlVHV0b3JpYWwpIHtcbiAgICB0dXRvcmlhbCA9IG1vdW50VHV0b3JpYWwoYnVzKTtcbiAgfVxuXG4gIGNvbnN0IHN0YXJ0VHV0b3JpYWwgPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKCF0dXRvcmlhbCB8fCB0dXRvcmlhbFN0YXJ0ZWQpIHJldHVybjtcbiAgICB0dXRvcmlhbFN0YXJ0ZWQgPSB0cnVlO1xuICAgIGNsZWFyVHV0b3JpYWxQcm9ncmVzcyhCQVNJQ19UVVRPUklBTF9JRCk7XG4gICAgdHV0b3JpYWwuc3RhcnQoeyByZXN1bWU6IGZhbHNlIH0pO1xuICB9O1xuXG4gIGlmIChlbmFibGVTdG9yeSkge1xuICAgIC8vIENhbXBhaWduIG1vZGU6IHN0b3J5ICsgdHV0b3JpYWxcbiAgICBjb25zdCB1bnN1YnNjcmliZVN0b3J5Q2xvc2VkID0gYnVzLm9uKFwiZGlhbG9ndWU6Y2xvc2VkXCIsICh7IGNoYXB0ZXJJZCwgbm9kZUlkIH0pID0+IHtcbiAgICAgIGlmIChjaGFwdGVySWQgIT09IElOVFJPX0NIQVBURVJfSUQpIHJldHVybjtcbiAgICAgIGlmICghSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMuaW5jbHVkZXMobm9kZUlkIGFzIHR5cGVvZiBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEU1tudW1iZXJdKSkgcmV0dXJuO1xuICAgICAgdW5zdWJzY3JpYmVTdG9yeUNsb3NlZCgpO1xuICAgICAgc3RhcnRUdXRvcmlhbCgpO1xuICAgIH0pO1xuICAgIG1vdW50U3RvcnkoeyBidXMsIHJvb21JZDogcm9vbSB9KTtcbiAgfSBlbHNlIGlmIChtb2RlID09PSBcInR1dG9yaWFsXCIpIHtcbiAgICAvLyBUdXRvcmlhbCBtb2RlOiBhdXRvLXN0YXJ0IHR1dG9yaWFsIHdpdGhvdXQgc3RvcnlcbiAgICBzdGFydFR1dG9yaWFsKCk7XG4gIH1cbiAgLy8gRnJlZSBwbGF5IGFuZCBkZWZhdWx0OiBubyBzeXN0ZW1zIG1vdW50ZWRcblxuICBjb25uZWN0V2ViU29ja2V0KHtcbiAgICByb29tLFxuICAgIHN0YXRlLFxuICAgIGJ1cyxcbiAgICBtYXBXLFxuICAgIG1hcEgsXG4gICAgb25TdGF0ZVVwZGF0ZWQ6ICgpID0+IGdhbWUub25TdGF0ZVVwZGF0ZWQoKSxcbiAgICBvbk9wZW46ICgpID0+IHtcbiAgICAgIGNvbnN0IG5hbWVUb1NlbmQgPSBjYWxsU2lnbiB8fCBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgICAgIGlmIChuYW1lVG9TZW5kKSBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiam9pblwiLCBuYW1lOiBuYW1lVG9TZW5kIH0pO1xuICAgIH0sXG4gIH0pO1xuXG4gIC8vIE9wdGlvbmFsOiBzdXNwZW5kL3Jlc3VtZSBhdWRpbyBvbiB0YWIgdmlzaWJpbGl0eSB0byBzYXZlIENQVVxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwidmlzaWJpbGl0eWNoYW5nZVwiLCAoKSA9PiB7XG4gICAgaWYgKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gXCJoaWRkZW5cIikge1xuICAgICAgdm9pZCBlbmdpbmUuc3VzcGVuZCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2b2lkIGVuZ2luZS5yZXN1bWUoKTtcbiAgICB9XG4gIH0pO1xufSkoKTtcblxuZnVuY3Rpb24gc2FuaXRpemVDYWxsU2lnbih2YWx1ZTogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHJldHVybiBcIlwiO1xuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHJldHVybiBcIlwiO1xuICByZXR1cm4gdHJpbW1lZC5zbGljZSgwLCAyNCk7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RDYWxsU2lnbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBpZiAobmFtZSkgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSwgbmFtZSk7XG4gICAgZWxzZSB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZKTtcbiAgfSBjYXRjaCB7fVxufVxuXG5mdW5jdGlvbiByZWFkU3RvcmVkQ2FsbFNpZ24oKTogc3RyaW5nIHtcbiAgdHJ5IHsgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVkpID8/IFwiXCI7IH1cbiAgY2F0Y2ggeyByZXR1cm4gXCJcIjsgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7O0FBaUVPLFdBQVMsaUJBQTJCO0FBQ3pDLFVBQU0sV0FBVyxvQkFBSSxJQUE2QjtBQUNsRCxXQUFPO0FBQUEsTUFDTCxHQUFHLE9BQU8sU0FBUztBQUNqQixZQUFJLE1BQU0sU0FBUyxJQUFJLEtBQUs7QUFDNUIsWUFBSSxDQUFDLEtBQUs7QUFDUixnQkFBTSxvQkFBSSxJQUFJO0FBQ2QsbUJBQVMsSUFBSSxPQUFPLEdBQUc7QUFBQSxRQUN6QjtBQUNBLFlBQUksSUFBSSxPQUFPO0FBQ2YsZUFBTyxNQUFNLElBQUssT0FBTyxPQUFPO0FBQUEsTUFDbEM7QUFBQSxNQUNBLEtBQUssT0FBaUIsU0FBbUI7QUFDdkMsY0FBTSxNQUFNLFNBQVMsSUFBSSxLQUFLO0FBQzlCLFlBQUksQ0FBQyxPQUFPLElBQUksU0FBUyxFQUFHO0FBQzVCLG1CQUFXLE1BQU0sS0FBSztBQUNwQixjQUFJO0FBQ0YsWUFBQyxHQUFpQyxPQUFPO0FBQUEsVUFDM0MsU0FB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QixpQkFBaUI7QUFDdkMsZUFBUyxNQUFNLEVBQUUsUUFBUSxNQUFNLENBQUM7QUFBQSxJQUNsQztBQUVBLFFBQUksYUFBYTtBQUVmLFlBQU0seUJBQXlCLElBQUksR0FBRyxtQkFBbUIsQ0FBQyxFQUFFLFdBQVcsT0FBTyxNQUFNO0FBQ2xGLFlBQUksY0FBYyxpQkFBa0I7QUFDcEMsWUFBSSxDQUFDLDJCQUEyQixTQUFTLE1BQW1ELEVBQUc7QUFDL0YsK0JBQXVCO0FBQ3ZCLHNCQUFjO0FBQUEsTUFDaEIsQ0FBQztBQUNELGlCQUFXLEVBQUUsS0FBSyxRQUFRLEtBQUssQ0FBQztBQUFBLElBQ2xDLFdBQVcsU0FBUyxZQUFZO0FBRTlCLG9CQUFjO0FBQUEsSUFDaEI7QUFHQSxxQkFBaUI7QUFBQSxNQUNmO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsZ0JBQWdCLE1BQU0sS0FBSyxlQUFlO0FBQUEsTUFDMUMsUUFBUSxNQUFNO0FBQ1osY0FBTSxhQUFhLFlBQVksaUJBQWlCLG1CQUFtQixDQUFDO0FBQ3BFLFlBQUksV0FBWSxhQUFZLEVBQUUsTUFBTSxRQUFRLE1BQU0sV0FBVyxDQUFDO0FBQUEsTUFDaEU7QUFBQSxJQUNGLENBQUM7QUFHRCxhQUFTLGlCQUFpQixvQkFBb0IsTUFBTTtBQUNsRCxVQUFJLFNBQVMsb0JBQW9CLFVBQVU7QUFDekMsYUFBSyxPQUFPLFFBQVE7QUFBQSxNQUN0QixPQUFPO0FBQ0wsYUFBSyxPQUFPLE9BQU87QUFBQSxNQUNyQjtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0gsR0FBRztBQUVILFdBQVMsaUJBQWlCLE9BQThCO0FBQ3RELFFBQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsVUFBTSxVQUFVLE1BQU0sS0FBSztBQUMzQixRQUFJLENBQUMsUUFBUyxRQUFPO0FBQ3JCLFdBQU8sUUFBUSxNQUFNLEdBQUcsRUFBRTtBQUFBLEVBQzVCO0FBRUEsV0FBUyxnQkFBZ0IsTUFBb0I7QUFDM0MsUUFBSTtBQUNGLFVBQUksS0FBTSxRQUFPLGFBQWEsUUFBUSx1QkFBdUIsSUFBSTtBQUFBLFVBQzVELFFBQU8sYUFBYSxXQUFXLHFCQUFxQjtBQUFBLElBQzNELFNBQVE7QUFBQSxJQUFDO0FBQUEsRUFDWDtBQUVBLFdBQVMscUJBQTZCO0FBbkl0QztBQW9JRSxRQUFJO0FBQUUsY0FBTyxZQUFPLGFBQWEsUUFBUSxxQkFBcUIsTUFBakQsWUFBc0Q7QUFBQSxJQUFJLFNBQ2pFO0FBQUUsYUFBTztBQUFBLElBQUk7QUFBQSxFQUNyQjsiLAogICJuYW1lcyI6IFsiX2EiLCAiU1RZTEVfSUQiLCAiZW5zdXJlU3R5bGVzIiwgImNob2ljZSIsICJfYSIsICJTVE9SQUdFX1BSRUZJWCIsICJnZXRTdG9yYWdlIiwgImN0eCIsICJjdHgiLCAiY2xhbXAiLCAiY2hvaWNlIiwgIl9hIiwgImN0eCIsICJyZXN1bWVBdWRpbyIsICJjdHgiXQp9Cg==
