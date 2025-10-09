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
      waypoints: Array.isArray(msg.me.waypoints) ? msg.me.waypoints.map((wp) => ({ x: wp.x, y: wp.y, speed: Number.isFinite(wp.speed) ? wp.speed : 180 })) : []
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
  var selection = null;
  var missileSelection = null;
  var defaultSpeed = 150;
  var lastLoopTs = null;
  var lastMissileConfigSent = null;
  var legDashOffsets = /* @__PURE__ */ new Map();
  var lastMissileLaunchTextHTML = "";
  var lastMissileLaunchInfoHTML = "";
  var lastTouchDistance = null;
  var MIN_ZOOM = 0.5;
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
      lastTouchDistance = getTouchDistance(event.touches);
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
    }
  }
  function onCanvasPointerDown(event) {
    if (!cv || !ctx) return;
    if (helpOverlay == null ? void 0 : helpOverlay.classList.contains("visible")) {
      return;
    }
    if (lastTouchDistance !== null) {
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
    if (context === "missile") {
      handleMissilePointer(canvasPoint, worldPoint);
    } else {
      handleShipPointer(canvasPoint, worldPoint);
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
    }
    if (viewportHeight < world.h) {
      cameraY = clamp(cameraY, minCameraY, maxCameraY);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS50cyIsICJzcmMvdHV0b3JpYWwvaGlnaGxpZ2h0LnRzIiwgInNyYy90dXRvcmlhbC9zdG9yYWdlLnRzIiwgInNyYy90dXRvcmlhbC9yb2xlcy50cyIsICJzcmMvdHV0b3JpYWwvZW5naW5lLnRzIiwgInNyYy90dXRvcmlhbC9zdGVwc19iYXNpYy50cyIsICJzcmMvdHV0b3JpYWwvaW5kZXgudHMiLCAic3JjL3N0b3J5L292ZXJsYXkudHMiLCAic3JjL3N0b3J5L3N0b3JhZ2UudHMiLCAic3JjL2F1ZGlvL2VuZ2luZS50cyIsICJzcmMvYXVkaW8vZ3JhcGgudHMiLCAic3JjL2F1ZGlvL3NmeC50cyIsICJzcmMvc3Rvcnkvc2Z4LnRzIiwgInNyYy9zdG9yeS9lbmdpbmUudHMiLCAic3JjL3N0b3J5L2NoYXB0ZXJzL2ludHJvLnRzIiwgInNyYy9zdG9yeS9pbmRleC50cyIsICJzcmMvc3RhcnQtZ2F0ZS50cyIsICJzcmMvYXVkaW8vbXVzaWMvc2NlbmVzL2FtYmllbnQudHMiLCAic3JjL2F1ZGlvL211c2ljL2luZGV4LnRzIiwgInNyYy9hdWRpby9jdWVzLnRzIiwgInNyYy9tYWluLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgdHlwZSBTaGlwQ29udGV4dCA9IFwic2hpcFwiIHwgXCJtaXNzaWxlXCI7XG5leHBvcnQgdHlwZSBTaGlwVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcbmV4cG9ydCB0eXBlIE1pc3NpbGVUb29sID0gXCJzZXRcIiB8IFwic2VsZWN0XCIgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50TWFwIHtcbiAgXCJjb250ZXh0OmNoYW5nZWRcIjogeyBjb250ZXh0OiBTaGlwQ29udGV4dCB9O1xuICBcInNoaXA6dG9vbENoYW5nZWRcIjogeyB0b29sOiBTaGlwVG9vbCB9O1xuICBcInNoaXA6d2F5cG9pbnRBZGRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6bGF1bmNoZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiOiB7IHNlY29uZHNSZW1haW5pbmc6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiOiB2b2lkO1xuICBcImhlbHA6dmlzaWJsZUNoYW5nZWRcIjogeyB2aXNpYmxlOiBib29sZWFuIH07XG4gIFwic3RhdGU6dXBkYXRlZFwiOiB2b2lkO1xuICBcInR1dG9yaWFsOnN0YXJ0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIjogeyBpZDogc3RyaW5nOyBzdGVwSW5kZXg6IG51bWJlcjsgdG90YWw6IG51bWJlciB9O1xuICBcInR1dG9yaWFsOmNvbXBsZXRlZFwiOiB7IGlkOiBzdHJpbmcgfTtcbiAgXCJ0dXRvcmlhbDpza2lwcGVkXCI6IHsgaWQ6IHN0cmluZzsgYXRTdGVwOiBudW1iZXIgfTtcbiAgXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIjogdm9pZDtcbiAgXCJkaWFsb2d1ZTpvcGVuZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjbG9zZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjaG9pY2VcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hvaWNlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJzdG9yeTpmbGFnVXBkYXRlZFwiOiB7IGZsYWc6IHN0cmluZzsgdmFsdWU6IGJvb2xlYW4gfTtcbiAgXCJzdG9yeTpwcm9ncmVzc2VkXCI6IHsgY2hhcHRlcklkOiBzdHJpbmc7IG5vZGVJZDogc3RyaW5nIH07XG4gIFwiYXVkaW86cmVzdW1lXCI6IHZvaWQ7XG4gIFwiYXVkaW86bXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnVubXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiOiB7IGdhaW46IG51bWJlciB9O1xuICBcImF1ZGlvOnNmeFwiOiB7IG5hbWU6IFwidWlcIiB8IFwibGFzZXJcIiB8IFwidGhydXN0XCIgfCBcImV4cGxvc2lvblwiIHwgXCJsb2NrXCIgfCBcImRpYWxvZ3VlXCI7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIjogeyBzY2VuZTogXCJhbWJpZW50XCIgfCBcImNvbWJhdFwiIHwgXCJsb2JieVwiOyBzZWVkPzogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6cGFyYW1cIjogeyBrZXk6IHN0cmluZzsgdmFsdWU6IG51bWJlciB9OyAgICAgICAgICAgICAgIFxuICBcImF1ZGlvOm11c2ljOnRyYW5zcG9ydFwiOiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfTtcbn1cblxuZXhwb3J0IHR5cGUgRXZlbnRLZXkgPSBrZXlvZiBFdmVudE1hcDtcbmV4cG9ydCB0eXBlIEV2ZW50UGF5bG9hZDxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gRXZlbnRNYXBbS107XG5leHBvcnQgdHlwZSBIYW5kbGVyPEsgZXh0ZW5kcyBFdmVudEtleT4gPSAocGF5bG9hZDogRXZlbnRQYXlsb2FkPEs+KSA9PiB2b2lkO1xuXG50eXBlIFZvaWRLZXlzID0ge1xuICBbSyBpbiBFdmVudEtleV06IEV2ZW50TWFwW0tdIGV4dGVuZHMgdm9pZCA/IEsgOiBuZXZlclxufVtFdmVudEtleV07XG5cbnR5cGUgTm9uVm9pZEtleXMgPSBFeGNsdWRlPEV2ZW50S2V5LCBWb2lkS2V5cz47XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnRCdXMge1xuICBvbjxLIGV4dGVuZHMgRXZlbnRLZXk+KGV2ZW50OiBLLCBoYW5kbGVyOiBIYW5kbGVyPEs+KTogKCkgPT4gdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgTm9uVm9pZEtleXM+KGV2ZW50OiBLLCBwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pOiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBWb2lkS2V5cz4oZXZlbnQ6IEspOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXZlbnRCdXMoKTogRXZlbnRCdXMge1xuICBjb25zdCBoYW5kbGVycyA9IG5ldyBNYXA8RXZlbnRLZXksIFNldDxGdW5jdGlvbj4+KCk7XG4gIHJldHVybiB7XG4gICAgb24oZXZlbnQsIGhhbmRsZXIpIHtcbiAgICAgIGxldCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQpIHtcbiAgICAgICAgc2V0ID0gbmV3IFNldCgpO1xuICAgICAgICBoYW5kbGVycy5zZXQoZXZlbnQsIHNldCk7XG4gICAgICB9XG4gICAgICBzZXQuYWRkKGhhbmRsZXIpO1xuICAgICAgcmV0dXJuICgpID0+IHNldCEuZGVsZXRlKGhhbmRsZXIpO1xuICAgIH0sXG4gICAgZW1pdChldmVudDogRXZlbnRLZXksIHBheWxvYWQ/OiB1bmtub3duKSB7XG4gICAgICBjb25zdCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQgfHwgc2V0LnNpemUgPT09IDApIHJldHVybjtcbiAgICAgIGZvciAoY29uc3QgZm4gb2Ygc2V0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgKGZuIGFzICh2YWx1ZT86IHVua25vd24pID0+IHZvaWQpKHBheWxvYWQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBbYnVzXSBoYW5kbGVyIGZvciAke2V2ZW50fSBmYWlsZWRgLCBlcnIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNoaXBDb250ZXh0LCBTaGlwVG9vbCwgTWlzc2lsZVRvb2wgfSBmcm9tIFwiLi9idXNcIjtcblxuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX1NQRUVEID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfU1BFRUQgPSAyNTA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fQUdSTyA9IDEwMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9MSUZFVElNRSA9IDEyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9MSUZFVElNRSA9IDIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSA9IDgwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiA9IDIwMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUxpbWl0cyB7XG4gIHNwZWVkTWluOiBudW1iZXI7XG4gIHNwZWVkTWF4OiBudW1iZXI7XG4gIGFncm9NaW46IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNoaXBTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBocD86IG51bWJlcjtcbiAga2lsbHM/OiBudW1iZXI7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHaG9zdFNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIHNlbGY/OiBib29sZWFuO1xuICBhZ3JvX3JhZGl1czogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVSb3V0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgd2F5cG9pbnRzOiBNaXNzaWxlV2F5cG9pbnRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlQ29uZmlnIHtcbiAgc3BlZWQ6IG51bWJlcjtcbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuICBsaWZldGltZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmxkTWV0YSB7XG4gIGM/OiBudW1iZXI7XG4gIHc/OiBudW1iZXI7XG4gIGg/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBwU3RhdGUge1xuICBub3c6IG51bWJlcjtcbiAgbm93U3luY2VkQXQ6IG51bWJlcjtcbiAgbWU6IFNoaXBTbmFwc2hvdCB8IG51bGw7XG4gIGdob3N0czogR2hvc3RTbmFwc2hvdFtdO1xuICBtaXNzaWxlczogTWlzc2lsZVNuYXBzaG90W107XG4gIG1pc3NpbGVSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdO1xuICBhY3RpdmVNaXNzaWxlUm91dGVJZDogc3RyaW5nIHwgbnVsbDtcbiAgbmV4dE1pc3NpbGVSZWFkeUF0OiBudW1iZXI7XG4gIG1pc3NpbGVDb25maWc6IE1pc3NpbGVDb25maWc7XG4gIG1pc3NpbGVMaW1pdHM6IE1pc3NpbGVMaW1pdHM7XG4gIHdvcmxkTWV0YTogV29ybGRNZXRhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlbGVjdGlvbiB7XG4gIHR5cGU6IFwid2F5cG9pbnRcIiB8IFwibGVnXCI7XG4gIGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVNlbGVjdGlvbiB7XG4gIHR5cGU6IFwid2F5cG9pbnRcIjtcbiAgaW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgQWN0aXZlVG9vbCA9XG4gIHwgXCJzaGlwLXNldFwiXG4gIHwgXCJzaGlwLXNlbGVjdFwiXG4gIHwgXCJtaXNzaWxlLXNldFwiXG4gIHwgXCJtaXNzaWxlLXNlbGVjdFwiXG4gIHwgbnVsbDtcblxuZXhwb3J0IGludGVyZmFjZSBVSVN0YXRlIHtcbiAgaW5wdXRDb250ZXh0OiBTaGlwQ29udGV4dDtcbiAgc2hpcFRvb2w6IFNoaXBUb29sO1xuICBtaXNzaWxlVG9vbDogTWlzc2lsZVRvb2w7XG4gIGFjdGl2ZVRvb2w6IEFjdGl2ZVRvb2w7XG4gIHNob3dTaGlwUm91dGU6IGJvb2xlYW47XG4gIGhlbHBWaXNpYmxlOiBib29sZWFuO1xuICB6b29tOiBudW1iZXI7XG4gIHBhblg6IG51bWJlcjtcbiAgcGFuWTogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFVJU3RhdGUoKTogVUlTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgaW5wdXRDb250ZXh0OiBcInNoaXBcIixcbiAgICBzaGlwVG9vbDogXCJzZXRcIixcbiAgICBtaXNzaWxlVG9vbDogbnVsbCxcbiAgICBhY3RpdmVUb29sOiBcInNoaXAtc2V0XCIsXG4gICAgc2hvd1NoaXBSb3V0ZTogdHJ1ZSxcbiAgICBoZWxwVmlzaWJsZTogZmFsc2UsXG4gICAgem9vbTogMS4wLFxuICAgIHBhblg6IDAsXG4gICAgcGFuWTogMCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxTdGF0ZShsaW1pdHM6IE1pc3NpbGVMaW1pdHMgPSB7XG4gIHNwZWVkTWluOiBNSVNTSUxFX01JTl9TUEVFRCxcbiAgc3BlZWRNYXg6IE1JU1NJTEVfTUFYX1NQRUVELFxuICBhZ3JvTWluOiBNSVNTSUxFX01JTl9BR1JPLFxufSk6IEFwcFN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBub3c6IDAsXG4gICAgbm93U3luY2VkQXQ6IHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSBcImZ1bmN0aW9uXCJcbiAgICAgID8gcGVyZm9ybWFuY2Uubm93KClcbiAgICAgIDogRGF0ZS5ub3coKSxcbiAgICBtZTogbnVsbCxcbiAgICBnaG9zdHM6IFtdLFxuICAgIG1pc3NpbGVzOiBbXSxcbiAgICBtaXNzaWxlUm91dGVzOiBbXSxcbiAgICBhY3RpdmVNaXNzaWxlUm91dGVJZDogbnVsbCxcbiAgICBuZXh0TWlzc2lsZVJlYWR5QXQ6IDAsXG4gICAgbWlzc2lsZUNvbmZpZzoge1xuICAgICAgc3BlZWQ6IDE4MCxcbiAgICAgIGFncm9SYWRpdXM6IDgwMCxcbiAgICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IoMTgwLCA4MDAsIGxpbWl0cyksXG4gICAgfSxcbiAgICBtaXNzaWxlTGltaXRzOiBsaW1pdHMsXG4gICAgd29ybGRNZXRhOiB7fSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pc3NpbGVMaWZldGltZUZvcihzcGVlZDogbnVtYmVyLCBhZ3JvUmFkaXVzOiBudW1iZXIsIGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogbnVtYmVyIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBzcGFuID0gbWF4U3BlZWQgLSBtaW5TcGVlZDtcbiAgY29uc3Qgc3BlZWROb3JtID0gc3BhbiA+IDAgPyBjbGFtcCgoc3BlZWQgLSBtaW5TcGVlZCkgLyBzcGFuLCAwLCAxKSA6IDA7XG4gIGNvbnN0IGFkanVzdGVkQWdybyA9IE1hdGgubWF4KDAsIGFncm9SYWRpdXMgLSBtaW5BZ3JvKTtcbiAgY29uc3QgYWdyb05vcm0gPSBjbGFtcChhZGp1c3RlZEFncm8gLyBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUkVGLCAwLCAxKTtcbiAgY29uc3QgcmVkdWN0aW9uID0gc3BlZWROb3JtICogTUlTU0lMRV9MSUZFVElNRV9TUEVFRF9QRU5BTFRZICsgYWdyb05vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUEVOQUxUWTtcbiAgY29uc3QgYmFzZSA9IE1JU1NJTEVfTUFYX0xJRkVUSU1FO1xuICByZXR1cm4gY2xhbXAoYmFzZSAtIHJlZHVjdGlvbiwgTUlTU0lMRV9NSU5fTElGRVRJTUUsIE1JU1NJTEVfTUFYX0xJRkVUSU1FKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplTWlzc2lsZUNvbmZpZyhcbiAgY2ZnOiBQYXJ0aWFsPFBpY2s8TWlzc2lsZUNvbmZpZywgXCJzcGVlZFwiIHwgXCJhZ3JvUmFkaXVzXCI+PixcbiAgZmFsbGJhY2s6IE1pc3NpbGVDb25maWcsXG4gIGxpbWl0czogTWlzc2lsZUxpbWl0cyxcbik6IE1pc3NpbGVDb25maWcge1xuICBjb25zdCBtaW5TcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluIDogTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXggOiBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgbWluQWdybyA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiA6IE1JU1NJTEVfTUlOX0FHUk87XG4gIGNvbnN0IGJhc2UgPSBmYWxsYmFjayA/PyB7XG4gICAgc3BlZWQ6IG1pblNwZWVkLFxuICAgIGFncm9SYWRpdXM6IG1pbkFncm8sXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihtaW5TcGVlZCwgbWluQWdybywgbGltaXRzKSxcbiAgfTtcbiAgY29uc3QgbWVyZ2VkU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUoY2ZnLnNwZWVkID8/IGJhc2Uuc3BlZWQpID8gKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA6IGJhc2Uuc3BlZWQ7XG4gIGNvbnN0IG1lcmdlZEFncm8gPSBOdW1iZXIuaXNGaW5pdGUoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA/IChjZmcuYWdyb1JhZGl1cyA/PyBiYXNlLmFncm9SYWRpdXMpIDogYmFzZS5hZ3JvUmFkaXVzO1xuICBjb25zdCBzcGVlZCA9IGNsYW1wKG1lcmdlZFNwZWVkLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICBjb25zdCBhZ3JvUmFkaXVzID0gTWF0aC5tYXgobWluQWdybywgbWVyZ2VkQWdybyk7XG4gIHJldHVybiB7XG4gICAgc3BlZWQsXG4gICAgYWdyb1JhZGl1cyxcbiAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKHNwZWVkLCBhZ3JvUmFkaXVzLCBsaW1pdHMpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9ub3RvbmljTm93KCk6IG51bWJlciB7XG4gIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICB9XG4gIHJldHVybiBEYXRlLm5vdygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVXYXlwb2ludExpc3QobGlzdDogV2F5cG9pbnRbXSB8IHVuZGVmaW5lZCB8IG51bGwpOiBXYXlwb2ludFtdIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3QpKSByZXR1cm4gW107XG4gIHJldHVybiBsaXN0Lm1hcCgod3ApID0+ICh7IC4uLndwIH0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGU6IEFwcFN0YXRlLCBsaW1pdHM6IFBhcnRpYWw8TWlzc2lsZUxpbWl0cz4pOiB2b2lkIHtcbiAgc3RhdGUubWlzc2lsZUxpbWl0cyA9IHtcbiAgICBzcGVlZE1pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4hIDogc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1pbixcbiAgICBzcGVlZE1heDogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXghIDogc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCxcbiAgICBhZ3JvTWluOiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4hIDogc3RhdGUubWlzc2lsZUxpbWl0cy5hZ3JvTWluLFxuICB9O1xufVxuIiwgImltcG9ydCB7IHR5cGUgRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7XG4gIHR5cGUgQXBwU3RhdGUsXG4gIHR5cGUgTWlzc2lsZVJvdXRlLFxuICBtb25vdG9uaWNOb3csXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbiAgdXBkYXRlTWlzc2lsZUxpbWl0cyxcbn0gZnJvbSBcIi4vc3RhdGVcIjtcblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVJvdXRlIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZT86IHN0cmluZztcbiAgd2F5cG9pbnRzPzogU2VydmVyTWlzc2lsZVdheXBvaW50W107XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJTaGlwU3RhdGUge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgaHA/OiBudW1iZXI7XG4gIGtpbGxzPzogbnVtYmVyO1xuICB3YXlwb2ludHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBzcGVlZD86IG51bWJlciB9Pjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVTdGF0ZSB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlclN0YXRlTWVzc2FnZSB7XG4gIHR5cGU6IFwic3RhdGVcIjtcbiAgbm93OiBudW1iZXI7XG4gIG5leHRfbWlzc2lsZV9yZWFkeT86IG51bWJlcjtcbiAgbWU/OiBTZXJ2ZXJTaGlwU3RhdGUgfCBudWxsO1xuICBnaG9zdHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB2eDogbnVtYmVyOyB2eTogbnVtYmVyIH0+O1xuICBtaXNzaWxlcz86IFNlcnZlck1pc3NpbGVTdGF0ZVtdO1xuICBtaXNzaWxlX3JvdXRlcz86IFNlcnZlck1pc3NpbGVSb3V0ZVtdO1xuICBtaXNzaWxlX2NvbmZpZz86IHtcbiAgICBzcGVlZD86IG51bWJlcjtcbiAgICBzcGVlZF9taW4/OiBudW1iZXI7XG4gICAgc3BlZWRfbWF4PzogbnVtYmVyO1xuICAgIGFncm9fcmFkaXVzPzogbnVtYmVyO1xuICAgIGFncm9fbWluPzogbnVtYmVyO1xuICAgIGxpZmV0aW1lPzogbnVtYmVyO1xuICB9IHwgbnVsbDtcbiAgYWN0aXZlX21pc3NpbGVfcm91dGU/OiBzdHJpbmcgfCBudWxsO1xuICBtZXRhPzoge1xuICAgIGM/OiBudW1iZXI7XG4gICAgdz86IG51bWJlcjtcbiAgICBoPzogbnVtYmVyO1xuICB9O1xufVxuXG5pbnRlcmZhY2UgQ29ubmVjdE9wdGlvbnMge1xuICByb29tOiBzdHJpbmc7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb25TdGF0ZVVwZGF0ZWQ/OiAoKSA9PiB2b2lkO1xuICBvbk9wZW4/OiAoc29ja2V0OiBXZWJTb2NrZXQpID0+IHZvaWQ7XG4gIG1hcFc/OiBudW1iZXI7XG4gIG1hcEg/OiBudW1iZXI7XG59XG5cbmxldCB3czogV2ViU29ja2V0IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZCB7XG4gIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHJldHVybjtcbiAgY29uc3QgZGF0YSA9IHR5cGVvZiBwYXlsb2FkID09PSBcInN0cmluZ1wiID8gcGF5bG9hZCA6IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpO1xuICB3cy5zZW5kKGRhdGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdFdlYlNvY2tldCh7IHJvb20sIHN0YXRlLCBidXMsIG9uU3RhdGVVcGRhdGVkLCBvbk9wZW4sIG1hcFcsIG1hcEggfTogQ29ubmVjdE9wdGlvbnMpOiB2b2lkIHtcbiAgY29uc3QgcHJvdG9jb2wgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgPyBcIndzczovL1wiIDogXCJ3czovL1wiO1xuICBsZXQgd3NVcmwgPSBgJHtwcm90b2NvbH0ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fS93cz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb20pfWA7XG4gIGlmIChtYXBXICYmIG1hcFcgPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBXPSR7bWFwV31gO1xuICB9XG4gIGlmIChtYXBIICYmIG1hcEggPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBIPSR7bWFwSH1gO1xuICB9XG4gIHdzID0gbmV3IFdlYlNvY2tldCh3c1VybCk7XG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJvcGVuXCIsICgpID0+IHtcbiAgICBjb25zb2xlLmxvZyhcIlt3c10gb3BlblwiKTtcbiAgICBjb25zdCBzb2NrZXQgPSB3cztcbiAgICBpZiAoc29ja2V0ICYmIG9uT3Blbikge1xuICAgICAgb25PcGVuKHNvY2tldCk7XG4gICAgfVxuICB9KTtcbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcImNsb3NlXCIsICgpID0+IGNvbnNvbGUubG9nKFwiW3dzXSBjbG9zZVwiKSk7XG5cbiAgbGV0IHByZXZSb3V0ZXMgPSBuZXcgTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPigpO1xuICBsZXQgcHJldkFjdGl2ZVJvdXRlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IHByZXZNaXNzaWxlQ291bnQgPSAwO1xuXG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IGRhdGEgPSBzYWZlUGFyc2UoZXZlbnQuZGF0YSk7XG4gICAgaWYgKCFkYXRhIHx8IGRhdGEudHlwZSAhPT0gXCJzdGF0ZVwiKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGhhbmRsZVN0YXRlTWVzc2FnZShzdGF0ZSwgZGF0YSwgYnVzLCBwcmV2Um91dGVzLCBwcmV2QWN0aXZlUm91dGUsIHByZXZNaXNzaWxlQ291bnQpO1xuICAgIHByZXZSb3V0ZXMgPSBuZXcgTWFwKHN0YXRlLm1pc3NpbGVSb3V0ZXMubWFwKChyb3V0ZSkgPT4gW3JvdXRlLmlkLCBjbG9uZVJvdXRlKHJvdXRlKV0pKTtcbiAgICBwcmV2QWN0aXZlUm91dGUgPSBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZDtcbiAgICBwcmV2TWlzc2lsZUNvdW50ID0gc3RhdGUubWlzc2lsZXMubGVuZ3RoO1xuICAgIGJ1cy5lbWl0KFwic3RhdGU6dXBkYXRlZFwiKTtcbiAgICBvblN0YXRlVXBkYXRlZD8uKCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTdGF0ZU1lc3NhZ2UoXG4gIHN0YXRlOiBBcHBTdGF0ZSxcbiAgbXNnOiBTZXJ2ZXJTdGF0ZU1lc3NhZ2UsXG4gIGJ1czogRXZlbnRCdXMsXG4gIHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sXG4gIHByZXZBY3RpdmVSb3V0ZTogc3RyaW5nIHwgbnVsbCxcbiAgcHJldk1pc3NpbGVDb3VudDogbnVtYmVyLFxuKTogdm9pZCB7XG4gIHN0YXRlLm5vdyA9IG1zZy5ub3c7XG4gIHN0YXRlLm5vd1N5bmNlZEF0ID0gbW9ub3RvbmljTm93KCk7XG4gIHN0YXRlLm5leHRNaXNzaWxlUmVhZHlBdCA9IE51bWJlci5pc0Zpbml0ZShtc2cubmV4dF9taXNzaWxlX3JlYWR5KSA/IG1zZy5uZXh0X21pc3NpbGVfcmVhZHkhIDogMDtcbiAgc3RhdGUubWUgPSBtc2cubWUgPyB7XG4gICAgeDogbXNnLm1lLngsXG4gICAgeTogbXNnLm1lLnksXG4gICAgdng6IG1zZy5tZS52eCxcbiAgICB2eTogbXNnLm1lLnZ5LFxuICAgIGhwOiBtc2cubWUuaHAsXG4gICAga2lsbHM6IG1zZy5tZS5raWxscyA/PyAwLFxuICAgIHdheXBvaW50czogQXJyYXkuaXNBcnJheShtc2cubWUud2F5cG9pbnRzKVxuICAgICAgPyBtc2cubWUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7IHg6IHdwLngsIHk6IHdwLnksIHNwZWVkOiBOdW1iZXIuaXNGaW5pdGUod3Auc3BlZWQpID8gd3Auc3BlZWQhIDogMTgwIH0pKVxuICAgICAgOiBbXSxcbiAgfSA6IG51bGw7XG4gIHN0YXRlLmdob3N0cyA9IEFycmF5LmlzQXJyYXkobXNnLmdob3N0cykgPyBtc2cuZ2hvc3RzLnNsaWNlKCkgOiBbXTtcbiAgc3RhdGUubWlzc2lsZXMgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlcykgPyBtc2cubWlzc2lsZXMuc2xpY2UoKSA6IFtdO1xuXG4gIGNvbnN0IHJvdXRlc0Zyb21TZXJ2ZXIgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlX3JvdXRlcykgPyBtc2cubWlzc2lsZV9yb3V0ZXMgOiBbXTtcbiAgY29uc3QgbmV3Um91dGVzOiBNaXNzaWxlUm91dGVbXSA9IHJvdXRlc0Zyb21TZXJ2ZXIubWFwKChyb3V0ZSkgPT4gKHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSB8fCByb3V0ZS5pZCB8fCBcIlJvdXRlXCIsXG4gICAgd2F5cG9pbnRzOiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cylcbiAgICAgID8gcm91dGUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7IHg6IHdwLngsIHk6IHdwLnkgfSkpXG4gICAgICA6IFtdLFxuICB9KSk7XG5cbiAgZGlmZlJvdXRlcyhwcmV2Um91dGVzLCBuZXdSb3V0ZXMsIGJ1cyk7XG4gIHN0YXRlLm1pc3NpbGVSb3V0ZXMgPSBuZXdSb3V0ZXM7XG5cbiAgY29uc3QgbmV4dEFjdGl2ZSA9IHR5cGVvZiBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGUgPT09IFwic3RyaW5nXCIgJiYgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlLmxlbmd0aCA+IDBcbiAgICA/IG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZVxuICAgIDogbmV3Um91dGVzLmxlbmd0aCA+IDBcbiAgICAgID8gbmV3Um91dGVzWzBdLmlkXG4gICAgICA6IG51bGw7XG4gIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dEFjdGl2ZTtcbiAgaWYgKG5leHRBY3RpdmUgIT09IHByZXZBY3RpdmVSb3V0ZSkge1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIiwgeyByb3V0ZUlkOiBuZXh0QWN0aXZlID8/IG51bGwgfSk7XG4gIH1cblxuICBpZiAobXNnLm1pc3NpbGVfY29uZmlnKSB7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluKSB8fCBOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCkgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5hZ3JvX21pbikpIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGUsIHtcbiAgICAgICAgc3BlZWRNaW46IG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9taW4sXG4gICAgICAgIHNwZWVkTWF4OiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWF4LFxuICAgICAgICBhZ3JvTWluOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4sXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKHtcbiAgICAgIHNwZWVkOiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWQsXG4gICAgICBhZ3JvUmFkaXVzOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19yYWRpdXMsXG4gICAgfSwgc3RhdGUubWlzc2lsZUNvbmZpZywgc3RhdGUubWlzc2lsZUxpbWl0cyk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcubGlmZXRpbWUpKSB7XG4gICAgICBzYW5pdGl6ZWQubGlmZXRpbWUgPSBtc2cubWlzc2lsZV9jb25maWcubGlmZXRpbWUhO1xuICAgIH1cbiAgICBzdGF0ZS5taXNzaWxlQ29uZmlnID0gc2FuaXRpemVkO1xuICB9XG5cbiAgY29uc3QgbWV0YSA9IG1zZy5tZXRhID8/IHt9O1xuICBjb25zdCBoYXNDID0gdHlwZW9mIG1ldGEuYyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5jKTtcbiAgY29uc3QgaGFzVyA9IHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudyk7XG4gIGNvbnN0IGhhc0ggPSB0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpO1xuICBzdGF0ZS53b3JsZE1ldGEgPSB7XG4gICAgYzogaGFzQyA/IG1ldGEuYyEgOiBzdGF0ZS53b3JsZE1ldGEuYyxcbiAgICB3OiBoYXNXID8gbWV0YS53ISA6IHN0YXRlLndvcmxkTWV0YS53LFxuICAgIGg6IGhhc0ggPyBtZXRhLmghIDogc3RhdGUud29ybGRNZXRhLmgsXG4gIH07XG5cbiAgaWYgKHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA+IHByZXZNaXNzaWxlQ291bnQpIHtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZUlkID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgaWYgKGFjdGl2ZVJvdXRlSWQpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IGFjdGl2ZVJvdXRlSWQgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IFwiXCIgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY29vbGRvd25SZW1haW5pbmcgPSBNYXRoLm1heCgwLCBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpKTtcbiAgYnVzLmVtaXQoXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiLCB7IHNlY29uZHNSZW1haW5pbmc6IGNvb2xkb3duUmVtYWluaW5nIH0pO1xufVxuXG5mdW5jdGlvbiBkaWZmUm91dGVzKHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sIG5leHRSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdLCBidXM6IEV2ZW50QnVzKTogdm9pZCB7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByb3V0ZSBvZiBuZXh0Um91dGVzKSB7XG4gICAgc2Vlbi5hZGQocm91dGUuaWQpO1xuICAgIGNvbnN0IHByZXYgPSBwcmV2Um91dGVzLmdldChyb3V0ZS5pZCk7XG4gICAgaWYgKCFwcmV2KSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChyb3V0ZS5uYW1lICE9PSBwcmV2Lm5hbWUpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgbmFtZTogcm91dGUubmFtZSB9KTtcbiAgICB9XG4gICAgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPiBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgICB9IGVsc2UgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPCBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHByZXYud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfVxuICAgIGlmIChwcmV2LndheXBvaW50cy5sZW5ndGggPiAwICYmIHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgW3JvdXRlSWRdIG9mIHByZXZSb3V0ZXMpIHtcbiAgICBpZiAoIXNlZW4uaGFzKHJvdXRlSWQpKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVEZWxldGVkXCIsIHsgcm91dGVJZCB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xvbmVSb3V0ZShyb3V0ZTogTWlzc2lsZVJvdXRlKTogTWlzc2lsZVJvdXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSxcbiAgICB3YXlwb2ludHM6IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHNhZmVQYXJzZSh2YWx1ZTogdW5rbm93bik6IFNlcnZlclN0YXRlTWVzc2FnZSB8IG51bGwge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSkgYXMgU2VydmVyU3RhdGVNZXNzYWdlO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLndhcm4oXCJbd3NdIGZhaWxlZCB0byBwYXJzZSBtZXNzYWdlXCIsIGVycik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShzdGF0ZS5ub3cpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgY29uc3Qgc3luY2VkQXQgPSBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93U3luY2VkQXQpID8gc3RhdGUubm93U3luY2VkQXQgOiBudWxsO1xuICBpZiAoIXN5bmNlZEF0KSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICBjb25zdCBlbGFwc2VkTXMgPSBtb25vdG9uaWNOb3coKSAtIHN5bmNlZEF0O1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShlbGFwc2VkTXMpIHx8IGVsYXBzZWRNcyA8IDApIHtcbiAgICByZXR1cm4gc3RhdGUubm93O1xuICB9XG4gIHJldHVybiBzdGF0ZS5ub3cgKyBlbGFwc2VkTXMgLyAxMDAwO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7IGdldEFwcHJveFNlcnZlck5vdywgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi9uZXRcIjtcbmltcG9ydCB7XG4gIHR5cGUgQWN0aXZlVG9vbCxcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIHR5cGUgTWlzc2lsZVNlbGVjdGlvbixcbiAgdHlwZSBTZWxlY3Rpb24sXG4gIHR5cGUgVUlTdGF0ZSxcbiAgY2xhbXAsXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbn0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7XG4gIE1JU1NJTEVfTUlOX1NQRUVELFxuICBNSVNTSUxFX01BWF9TUEVFRCxcbiAgTUlTU0lMRV9NSU5fQUdSTyxcbn0gZnJvbSBcIi4vc3RhdGVcIjtcblxuaW50ZXJmYWNlIEluaXRHYW1lT3B0aW9ucyB7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbn1cblxuaW50ZXJmYWNlIEdhbWVDb250cm9sbGVyIHtcbiAgb25TdGF0ZVVwZGF0ZWQoKTogdm9pZDtcbn1cblxubGV0IHN0YXRlUmVmOiBBcHBTdGF0ZTtcbmxldCB1aVN0YXRlUmVmOiBVSVN0YXRlO1xubGV0IGJ1c1JlZjogRXZlbnRCdXM7XG5cbmxldCBjdjogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCB8IG51bGwgPSBudWxsO1xubGV0IEhQc3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBraWxsc1NwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcENvbnRyb2xzQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwQ2xlYXJCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU2VsZWN0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBSb3V0ZXNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFJvdXRlTGVnOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBSb3V0ZVNwZWVkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IG1pc3NpbGVDb250cm9sc0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUFkZFJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVMYXVuY2hCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUxhdW5jaFRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUxhdW5jaEluZm86IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU2VsZWN0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUFncm9TbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb1ZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNwYXduQm90QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNwYXduQm90VGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IHJvdXRlUHJldkJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByb3V0ZU5leHRCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcm91dGVNZW51VG9nZ2xlOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJvdXRlTWVudTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByZW5hbWVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgZGVsZXRlTWlzc2lsZVJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlUm91dGVOYW1lTGFiZWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVJvdXRlQ291bnRMYWJlbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IGhlbHBUb2dnbGU6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVscE92ZXJsYXk6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVscENsb3NlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGhlbHBUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgc2VsZWN0aW9uOiBTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU2VsZWN0aW9uOiBNaXNzaWxlU2VsZWN0aW9uIHwgbnVsbCA9IG51bGw7XG5sZXQgZGVmYXVsdFNwZWVkID0gMTUwO1xubGV0IGxhc3RMb29wVHM6IG51bWJlciB8IG51bGwgPSBudWxsO1xubGV0IGxhc3RNaXNzaWxlQ29uZmlnU2VudDogeyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuY29uc3QgbGVnRGFzaE9mZnNldHMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xubGV0IGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgPSBcIlwiO1xubGV0IGxhc3RNaXNzaWxlTGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xubGV0IGxhc3RUb3VjaERpc3RhbmNlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuY29uc3QgTUlOX1pPT00gPSAwLjU7XG5jb25zdCBNQVhfWk9PTSA9IDMuMDtcblxuY29uc3QgSEVMUF9URVhUID0gW1xuICBcIlByaW1hcnkgTW9kZXNcIixcbiAgXCIgIDEgXHUyMDEzIFRvZ2dsZSBzaGlwIG5hdmlnYXRpb24gbW9kZVwiLFxuICBcIiAgMiBcdTIwMTMgVG9nZ2xlIG1pc3NpbGUgY29vcmRpbmF0aW9uIG1vZGVcIixcbiAgXCJcIixcbiAgXCJTaGlwIE5hdmlnYXRpb25cIixcbiAgXCIgIFQgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgIEMgXHUyMDEzIENsZWFyIGFsbCB3YXlwb2ludHNcIixcbiAgXCIgIFIgXHUyMDEzIFRvZ2dsZSBzaG93IHJvdXRlXCIsXG4gIFwiICBbIC8gXSBcdTIwMTMgQWRqdXN0IHdheXBvaW50IHNwZWVkXCIsXG4gIFwiICBTaGlmdCtbIC8gXSBcdTIwMTMgQ29hcnNlIHNwZWVkIGFkanVzdFwiLFxuICBcIiAgVGFiIC8gU2hpZnQrVGFiIFx1MjAxMyBDeWNsZSB3YXlwb2ludHNcIixcbiAgXCIgIERlbGV0ZSBcdTIwMTMgRGVsZXRlIGZyb20gc2VsZWN0ZWQgd2F5cG9pbnRcIixcbiAgXCJcIixcbiAgXCJNaXNzaWxlIENvb3JkaW5hdGlvblwiLFxuICBcIiAgTiBcdTIwMTMgQWRkIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gIFwiICBMIFx1MjAxMyBMYXVuY2ggbWlzc2lsZXNcIixcbiAgXCIgIEUgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgICwgLyAuIFx1MjAxMyBBZGp1c3QgYWdybyByYWRpdXNcIixcbiAgXCIgIDsgLyAnIFx1MjAxMyBBZGp1c3QgbWlzc2lsZSBzcGVlZFwiLFxuICBcIiAgU2hpZnQrc2xpZGVyIGtleXMgXHUyMDEzIENvYXJzZSBhZGp1c3RcIixcbiAgXCIgIERlbGV0ZSBcdTIwMTMgRGVsZXRlIHNlbGVjdGVkIG1pc3NpbGUgd2F5cG9pbnRcIixcbiAgXCJcIixcbiAgXCJNYXAgQ29udHJvbHNcIixcbiAgXCIgICsvLSBcdTIwMTMgWm9vbSBpbi9vdXRcIixcbiAgXCIgIEN0cmwrMCBcdTIwMTMgUmVzZXQgem9vbVwiLFxuICBcIiAgTW91c2Ugd2hlZWwgXHUyMDEzIFpvb20gYXQgY3Vyc29yXCIsXG4gIFwiICBQaW5jaCBcdTIwMTMgWm9vbSBvbiB0b3VjaCBkZXZpY2VzXCIsXG4gIFwiXCIsXG4gIFwiR2VuZXJhbFwiLFxuICBcIiAgPyBcdTIwMTMgVG9nZ2xlIHRoaXMgb3ZlcmxheVwiLFxuICBcIiAgRXNjIFx1MjAxMyBDYW5jZWwgc2VsZWN0aW9uIG9yIGNsb3NlIG92ZXJsYXlcIixcbl0uam9pbihcIlxcblwiKTtcblxuY29uc3Qgd29ybGQgPSB7IHc6IDgwMDAsIGg6IDQ1MDAgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRHYW1lKHsgc3RhdGUsIHVpU3RhdGUsIGJ1cyB9OiBJbml0R2FtZU9wdGlvbnMpOiBHYW1lQ29udHJvbGxlciB7XG4gIHN0YXRlUmVmID0gc3RhdGU7XG4gIHVpU3RhdGVSZWYgPSB1aVN0YXRlO1xuICBidXNSZWYgPSBidXM7XG5cbiAgY2FjaGVEb20oKTtcbiAgaWYgKCFjdikge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbnZhcyBlbGVtZW50ICNjdiBub3QgZm91bmRcIik7XG4gIH1cbiAgY3R4ID0gY3YuZ2V0Q29udGV4dChcIjJkXCIpO1xuXG4gIGJpbmRMaXN0ZW5lcnMoKTtcbiAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG5cbiAgcmV0dXJuIHtcbiAgICBvblN0YXRlVXBkYXRlZCgpIHtcbiAgICAgIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUoKTtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuICAgICAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNhY2hlRG9tKCk6IHZvaWQge1xuICBjdiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3ZcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBjdHggPSBjdj8uZ2V0Q29udGV4dChcIjJkXCIpID8/IG51bGw7XG4gIEhQc3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1ocFwiKTtcbiAgc2hpcENvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1jb250cm9sc1wiKTtcbiAgc2hpcENsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNsZWFyXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc2hpcFNldEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBSb3V0ZXNDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtcm91dGVzXCIpO1xuICBzaGlwUm91dGVMZWcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtcm91dGUtbGVnXCIpO1xuICBzaGlwUm91dGVTcGVlZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZS1zcGVlZFwiKTtcbiAgc2hpcERlbGV0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1kZWxldGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU3BlZWRDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLWNhcmRcIik7XG4gIHNoaXBTcGVlZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIHNoaXBTcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXZhbHVlXCIpO1xuXG4gIG1pc3NpbGVDb250cm9sc0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY29udHJvbHNcIik7XG4gIG1pc3NpbGVBZGRSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlTGF1bmNoQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVMYXVuY2hUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaC10ZXh0XCIpO1xuICBtaXNzaWxlTGF1bmNoSW5mbyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2gtaW5mb1wiKTtcbiAgbWlzc2lsZVNldEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVEZWxldGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtZGVsZXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVNwZWVkQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1jYXJkXCIpO1xuICBtaXNzaWxlU3BlZWRTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC12YWx1ZVwiKTtcbiAgbWlzc2lsZUFncm9DYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tY2FyZFwiKTtcbiAgbWlzc2lsZUFncm9TbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVBZ3JvVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby12YWx1ZVwiKTtcblxuICBzcGF3bkJvdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc3Bhd25Cb3RUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGF3bi1ib3QtdGV4dFwiKTtcbiAga2lsbHNTcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWtpbGxzXCIpO1xuICByb3V0ZVByZXZCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZU5leHRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW5leHRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZU1lbnVUb2dnbGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW1lbnUtdG9nZ2xlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVNZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51XCIpO1xuICByZW5hbWVNaXNzaWxlUm91dGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlbmFtZS1taXNzaWxlLXJvdXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWxldGUtbWlzc2lsZS1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2xlYXItbWlzc2lsZS13YXlwb2ludHNcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlUm91dGVOYW1lTGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtbmFtZVwiKTtcbiAgbWlzc2lsZVJvdXRlQ291bnRMYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1yb3V0ZS1jb3VudFwiKTtcblxuICBoZWxwVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGhlbHBPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLW92ZXJsYXlcIik7XG4gIGhlbHBDbG9zZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC1jbG9zZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGhlbHBUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRleHRcIik7XG5cbiAgZGVmYXVsdFNwZWVkID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXI/LnZhbHVlID8/IFwiMTUwXCIpO1xufVxuXG5mdW5jdGlvbiBiaW5kTGlzdGVuZXJzKCk6IHZvaWQge1xuICBpZiAoIWN2KSByZXR1cm47XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCBvbkNhbnZhc1BvaW50ZXJEb3duKTtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcIndoZWVsXCIsIG9uQ2FudmFzV2hlZWwsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaHN0YXJ0XCIsIG9uQ2FudmFzVG91Y2hTdGFydCwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCBvbkNhbnZhc1RvdWNoTW92ZSwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIG9uQ2FudmFzVG91Y2hFbmQsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG5cbiAgc3Bhd25Cb3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgaWYgKHNwYXduQm90QnRuLmRpc2FibGVkKSByZXR1cm47XG5cbiAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwic3Bhd25fYm90XCIgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIik7XG5cbiAgICAvLyBEaXNhYmxlIGJ1dHRvbiBhbmQgdXBkYXRlIHRleHRcbiAgICBzcGF3bkJvdEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgaWYgKHNwYXduQm90VGV4dCkge1xuICAgICAgc3Bhd25Cb3RUZXh0LnRleHRDb250ZW50ID0gXCJTcGF3bmVkXCI7XG4gICAgfVxuXG4gICAgLy8gUmUtZW5hYmxlIGFmdGVyIDUgc2Vjb25kc1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKHNwYXduQm90QnRuKSB7XG4gICAgICAgIHNwYXduQm90QnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoc3Bhd25Cb3RUZXh0KSB7XG4gICAgICAgIHNwYXduQm90VGV4dC50ZXh0Q29udGVudCA9IFwiQm90XCI7XG4gICAgICB9XG4gICAgfSwgNTAwMCk7XG4gIH0pO1xuXG4gIHNoaXBDbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIGNsZWFyU2hpcFJvdXRlKCk7XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOmNsZWFySW52b2tlZFwiKTtcbiAgfSk7XG5cbiAgc2hpcFNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gIH0pO1xuXG4gIHNoaXBTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2VsZWN0XCIpO1xuICB9KTtcblxuICBzaGlwU3BlZWRTbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcnNlRmxvYXQoKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSByZXR1cm47XG4gICAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG4gICAgZGVmYXVsdFNwZWVkID0gdmFsdWU7XG4gICAgaWYgKHNlbGVjdGlvbiAmJiBzdGF0ZVJlZi5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgJiYgc3RhdGVSZWYubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0pIHtcbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJ1cGRhdGVfd2F5cG9pbnRcIiwgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCwgc3BlZWQ6IHZhbHVlIH0pO1xuICAgICAgc3RhdGVSZWYubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0uc3BlZWQgPSB2YWx1ZTtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICB9XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBzaGlwRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZUFkZFJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF9taXNzaWxlX3JvdXRlXCIgfSk7XG4gIH0pO1xuXG4gIG1pc3NpbGVMYXVuY2hCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gIH0pO1xuXG4gIG1pc3NpbGVTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2VsZWN0XCIpO1xuICB9KTtcblxuICBtaXNzaWxlRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNwZWVkU2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHZhbHVlKSkgcmV0dXJuO1xuICAgIHVwZGF0ZU1pc3NpbGVDb25maWdGcm9tVUkoeyBzcGVlZDogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBtaXNzaWxlQWdyb1NsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKHsgYWdyb1JhZGl1czogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmFncm9DaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gIH0pO1xuXG4gIHJvdXRlUHJldkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKC0xKSk7XG4gIHJvdXRlTmV4dEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKDEpKTtcblxuICByb3V0ZU1lbnVUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGlmICghcm91dGVNZW51IHx8ICFyb3V0ZU1lbnUuY2xhc3NMaXN0LmNvbnRhaW5zKFwidmlzaWJsZVwiKSkgcmV0dXJuO1xuICAgIGlmIChldmVudC50YXJnZXQgPT09IHJvdXRlTWVudVRvZ2dsZSkgcmV0dXJuO1xuICAgIGlmIChyb3V0ZU1lbnUuY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpKSByZXR1cm47XG4gICAgcm91dGVNZW51LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICB9KTtcblxuICByZW5hbWVNaXNzaWxlUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUpIHJldHVybjtcbiAgICBjb25zdCBuYW1lID0gd2luZG93LnByb21wdChcIlJlbmFtZSByb3V0ZVwiLCByb3V0ZS5uYW1lIHx8IFwiXCIpO1xuICAgIGlmIChuYW1lID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3QgdHJpbW1lZCA9IG5hbWUudHJpbSgpO1xuICAgIGlmICghdHJpbW1lZCkgcmV0dXJuO1xuICAgIHJvdXRlLm5hbWUgPSB0cmltbWVkO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJyZW5hbWVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgcm91dGVfbmFtZTogdHJpbW1lZCxcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgaWYgKCF3aW5kb3cuY29uZmlybShgRGVsZXRlICR7cm91dGUubmFtZX0/YCkpIHJldHVybjtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmIChyb3V0ZXMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJvdXRlLndheXBvaW50cyA9IFtdO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGF0ZVJlZi5taXNzaWxlUm91dGVzID0gcm91dGVzLmZpbHRlcigocikgPT4gci5pZCAhPT0gcm91dGUuaWQpO1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubWlzc2lsZVJvdXRlcztcbiAgICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcmVtYWluaW5nLmxlbmd0aCA+IDAgPyByZW1haW5pbmdbMF0uaWQgOiBudWxsO1xuICAgIH1cbiAgICBtaXNzaWxlU2VsZWN0aW9uID0gbnVsbDtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImRlbGV0ZV9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICByb3V0ZU1lbnU/LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJjbGVhcl9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gW107XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IG51bGw7XG4gICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIH0pO1xuXG4gIGhlbHBUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SGVscFZpc2libGUodHJ1ZSk7XG4gIH0pO1xuXG4gIGhlbHBDbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRIZWxwVmlzaWJsZShmYWxzZSk7XG4gIH0pO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbldpbmRvd0tleURvd24sIHsgY2FwdHVyZTogZmFsc2UgfSk7XG59XG5cbmZ1bmN0aW9uIHNldFpvb20obmV3Wm9vbTogbnVtYmVyLCBjZW50ZXJYPzogbnVtYmVyLCBjZW50ZXJZPzogbnVtYmVyKTogdm9pZCB7XG4gIHVpU3RhdGVSZWYuem9vbSA9IGNsYW1wKG5ld1pvb20sIE1JTl9aT09NLCBNQVhfWk9PTSk7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzV2hlZWwoZXZlbnQ6IFdoZWVsRXZlbnQpOiB2b2lkIHtcbiAgaWYgKCFjdikgcmV0dXJuO1xuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnN0IHJlY3QgPSBjdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3QgY2VudGVyWCA9IGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQ7XG4gIGNvbnN0IGNlbnRlclkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XG5cbiAgY29uc3QgZGVsdGEgPSBldmVudC5kZWx0YVk7XG4gIGNvbnN0IHpvb21GYWN0b3IgPSBkZWx0YSA+IDAgPyAwLjkgOiAxLjE7XG4gIGNvbnN0IG5ld1pvb20gPSB1aVN0YXRlUmVmLnpvb20gKiB6b29tRmFjdG9yO1xuXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gcmVjdC53aWR0aDtcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQ7XG4gIGNvbnN0IGNhbnZhc0NlbnRlclggPSBjZW50ZXJYICogc2NhbGVYO1xuICBjb25zdCBjYW52YXNDZW50ZXJZID0gY2VudGVyWSAqIHNjYWxlWTtcblxuICBzZXRab29tKG5ld1pvb20sIGNhbnZhc0NlbnRlclgsIGNhbnZhc0NlbnRlclkpO1xufVxuXG5mdW5jdGlvbiBnZXRUb3VjaERpc3RhbmNlKHRvdWNoZXM6IFRvdWNoTGlzdCk6IG51bWJlciB8IG51bGwge1xuICBpZiAodG91Y2hlcy5sZW5ndGggPCAyKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZHggPSB0b3VjaGVzWzBdLmNsaWVudFggLSB0b3VjaGVzWzFdLmNsaWVudFg7XG4gIGNvbnN0IGR5ID0gdG91Y2hlc1swXS5jbGllbnRZIC0gdG91Y2hlc1sxXS5jbGllbnRZO1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG5mdW5jdGlvbiBnZXRUb3VjaENlbnRlcih0b3VjaGVzOiBUb3VjaExpc3QpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCBudWxsIHtcbiAgaWYgKHRvdWNoZXMubGVuZ3RoIDwgMikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgeDogKHRvdWNoZXNbMF0uY2xpZW50WCArIHRvdWNoZXNbMV0uY2xpZW50WCkgLyAyLFxuICAgIHk6ICh0b3VjaGVzWzBdLmNsaWVudFkgKyB0b3VjaGVzWzFdLmNsaWVudFkpIC8gMlxuICB9O1xufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoU3RhcnQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAyKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBsYXN0VG91Y2hEaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gb25DYW52YXNUb3VjaE1vdmUoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKCFjdiB8fCBldmVudC50b3VjaGVzLmxlbmd0aCAhPT0gMikge1xuICAgIGxhc3RUb3VjaERpc3RhbmNlID0gbnVsbDtcbiAgICByZXR1cm47XG4gIH1cblxuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICBjb25zdCBjdXJyZW50RGlzdGFuY2UgPSBnZXRUb3VjaERpc3RhbmNlKGV2ZW50LnRvdWNoZXMpO1xuICBpZiAoY3VycmVudERpc3RhbmNlID09PSBudWxsIHx8IGxhc3RUb3VjaERpc3RhbmNlID09PSBudWxsKSByZXR1cm47XG5cbiAgY29uc3QgcmVjdCA9IGN2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBjb25zdCBjZW50ZXIgPSBnZXRUb3VjaENlbnRlcihldmVudC50b3VjaGVzKTtcbiAgaWYgKCFjZW50ZXIpIHJldHVybjtcblxuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHJlY3Qud2lkdGg7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHJlY3QuaGVpZ2h0O1xuICBjb25zdCBjYW52YXNDZW50ZXJYID0gKGNlbnRlci54IC0gcmVjdC5sZWZ0KSAqIHNjYWxlWDtcbiAgY29uc3QgY2FudmFzQ2VudGVyWSA9IChjZW50ZXIueSAtIHJlY3QudG9wKSAqIHNjYWxlWTtcblxuICBjb25zdCB6b29tRmFjdG9yID0gY3VycmVudERpc3RhbmNlIC8gbGFzdFRvdWNoRGlzdGFuY2U7XG4gIGNvbnN0IG5ld1pvb20gPSB1aVN0YXRlUmVmLnpvb20gKiB6b29tRmFjdG9yO1xuXG4gIHNldFpvb20obmV3Wm9vbSwgY2FudmFzQ2VudGVyWCwgY2FudmFzQ2VudGVyWSk7XG4gIGxhc3RUb3VjaERpc3RhbmNlID0gY3VycmVudERpc3RhbmNlO1xufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoRW5kKGV2ZW50OiBUb3VjaEV2ZW50KTogdm9pZCB7XG4gIGlmIChldmVudC50b3VjaGVzLmxlbmd0aCA8IDIpIHtcbiAgICBsYXN0VG91Y2hEaXN0YW5jZSA9IG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gb25DYW52YXNQb2ludGVyRG93bihldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG4gIGlmICghY3YgfHwgIWN0eCkgcmV0dXJuO1xuICBpZiAoaGVscE92ZXJsYXk/LmNsYXNzTGlzdC5jb250YWlucyhcInZpc2libGVcIikpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGxhc3RUb3VjaERpc3RhbmNlICE9PSBudWxsKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJlY3QgPSBjdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3Qgc2NhbGVYID0gcmVjdC53aWR0aCAhPT0gMCA/IGN2LndpZHRoIC8gcmVjdC53aWR0aCA6IDE7XG4gIGNvbnN0IHNjYWxlWSA9IHJlY3QuaGVpZ2h0ICE9PSAwID8gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQgOiAxO1xuICBjb25zdCB4ID0gKGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICBjb25zdCB5ID0gKGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcCkgKiBzY2FsZVk7XG4gIGNvbnN0IGNhbnZhc1BvaW50ID0geyB4LCB5IH07XG4gIGNvbnN0IHdvcmxkUG9pbnQgPSBjYW52YXNUb1dvcmxkKGNhbnZhc1BvaW50KTtcblxuICBjb25zdCBjb250ZXh0ID0gdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcbiAgaWYgKGNvbnRleHQgPT09IFwibWlzc2lsZVwiKSB7XG4gICAgaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICB9IGVsc2Uge1xuICAgIGhhbmRsZVNoaXBQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgfVxuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTcGVlZExhYmVsKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHNoaXBTcGVlZFZhbHVlKSB7XG4gICAgc2hpcFNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBOdW1iZXIodmFsdWUpLnRvRml4ZWQoMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U2hpcFNsaWRlclZhbHVlKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFzaGlwU3BlZWRTbGlkZXIpIHJldHVybjtcbiAgc2hpcFNwZWVkU2xpZGVyLnZhbHVlID0gU3RyaW5nKHZhbHVlKTtcbiAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgaWYgKHJvdXRlcy5sZW5ndGggPT09IDApIHtcbiAgICBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG51bGw7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaWYgKCFzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCB8fCAhcm91dGVzLnNvbWUoKHJvdXRlKSA9PiByb3V0ZS5pZCA9PT0gc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQpKSB7XG4gICAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSByb3V0ZXNbMF0uaWQ7XG4gIH1cbiAgcmV0dXJuIHJvdXRlcy5maW5kKChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbCB7XG4gIHJldHVybiBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gIGNvbnN0IGFjdGl2ZVJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmIChtaXNzaWxlUm91dGVOYW1lTGFiZWwpIHtcbiAgICBpZiAoIWFjdGl2ZVJvdXRlKSB7XG4gICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSByb3V0ZXMubGVuZ3RoID09PSAwID8gXCJObyByb3V0ZVwiIDogXCJSb3V0ZVwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSBhY3RpdmVSb3V0ZS5uYW1lIHx8IFwiUm91dGVcIjtcbiAgICB9XG4gIH1cblxuICBpZiAobWlzc2lsZVJvdXRlQ291bnRMYWJlbCkge1xuICAgIGNvbnN0IGNvdW50ID0gYWN0aXZlUm91dGUgJiYgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpID8gYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gICAgbWlzc2lsZVJvdXRlQ291bnRMYWJlbC50ZXh0Q29udGVudCA9IGAke2NvdW50fSBwdHNgO1xuICB9XG5cbiAgaWYgKGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bikge1xuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9IHJvdXRlcy5sZW5ndGggPD0gMTtcbiAgfVxuICBpZiAocmVuYW1lTWlzc2lsZVJvdXRlQnRuKSB7XG4gICAgcmVuYW1lTWlzc2lsZVJvdXRlQnRuLmRpc2FibGVkID0gIWFjdGl2ZVJvdXRlO1xuICB9XG4gIGlmIChjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4pIHtcbiAgICBjb25zdCBjb3VudCA9IGFjdGl2ZVJvdXRlICYmIEFycmF5LmlzQXJyYXkoYWN0aXZlUm91dGUud2F5cG9pbnRzKSA/IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZSB8fCBjb3VudCA9PT0gMDtcbiAgfVxuICBpZiAocm91dGVQcmV2QnRuKSB7XG4gICAgcm91dGVQcmV2QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICB9XG4gIGlmIChyb3V0ZU5leHRCdG4pIHtcbiAgICByb3V0ZU5leHRCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gIH1cblxuICB1cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBzeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk6IHZvaWQge1xuICBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgYWN0aXZlUm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3Qgcm91dGVIYXNTZWxlY3Rpb24gPVxuICAgICEhYWN0aXZlUm91dGUgJiZcbiAgICBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgJiZcbiAgICAhIW1pc3NpbGVTZWxlY3Rpb24gJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aDtcbiAgaWYgKCFyb3V0ZUhhc1NlbGVjdGlvbikge1xuICAgIG1pc3NpbGVTZWxlY3Rpb24gPSBudWxsO1xuICB9XG4gIGNvbnN0IGNmZyA9IHN0YXRlUmVmLm1pc3NpbGVDb25maWc7XG4gIGFwcGx5TWlzc2lsZVVJKGNmZyk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gYXBwbHlNaXNzaWxlVUkoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIpIHtcbiAgICBjb25zdCBtaW5TcGVlZCA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4gPz8gTUlTU0lMRV9NSU5fU1BFRUQ7XG4gICAgY29uc3QgbWF4U3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWF4ID8/IE1JU1NJTEVfTUFYX1NQRUVEO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5taW4gPSBTdHJpbmcobWluU3BlZWQpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5tYXggPSBTdHJpbmcobWF4U3BlZWQpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IGNmZy5zcGVlZC50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgIG1pc3NpbGVTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gY2ZnLnNwZWVkLnRvRml4ZWQoMCk7XG4gIH1cbiAgaWYgKG1pc3NpbGVBZ3JvU2xpZGVyKSB7XG4gICAgY29uc3QgbWluQWdybyA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuYWdyb01pbiA/PyBNSVNTSUxFX01JTl9BR1JPO1xuICAgIGNvbnN0IG1heEFncm8gPSBNYXRoLm1heCg1MDAwLCBNYXRoLmNlaWwoKGNmZy5hZ3JvUmFkaXVzICsgNTAwKSAvIDUwMCkgKiA1MDApO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5BZ3JvKTtcbiAgICBtaXNzaWxlQWdyb1NsaWRlci5tYXggPSBTdHJpbmcobWF4QWdybyk7XG4gICAgbWlzc2lsZUFncm9TbGlkZXIudmFsdWUgPSBjZmcuYWdyb1JhZGl1cy50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlQWdyb1ZhbHVlKSB7XG4gICAgbWlzc2lsZUFncm9WYWx1ZS50ZXh0Q29udGVudCA9IGNmZy5hZ3JvUmFkaXVzLnRvRml4ZWQoMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSShvdmVycmlkZXM6IFBhcnRpYWw8eyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfT4gPSB7fSk6IHZvaWQge1xuICBjb25zdCBjdXJyZW50ID0gc3RhdGVSZWYubWlzc2lsZUNvbmZpZztcbiAgY29uc3QgY2ZnID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKHtcbiAgICBzcGVlZDogb3ZlcnJpZGVzLnNwZWVkID8/IGN1cnJlbnQuc3BlZWQsXG4gICAgYWdyb1JhZGl1czogb3ZlcnJpZGVzLmFncm9SYWRpdXMgPz8gY3VycmVudC5hZ3JvUmFkaXVzLFxuICB9LCBjdXJyZW50LCBzdGF0ZVJlZi5taXNzaWxlTGltaXRzKTtcbiAgc3RhdGVSZWYubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgYXBwbHlNaXNzaWxlVUkoY2ZnKTtcbiAgY29uc3QgbGFzdCA9IGxhc3RNaXNzaWxlQ29uZmlnU2VudDtcbiAgY29uc3QgbmVlZHNTZW5kID1cbiAgICAhbGFzdCB8fFxuICAgIE1hdGguYWJzKGxhc3Quc3BlZWQgLSBjZmcuc3BlZWQpID4gMC4yNSB8fFxuICAgIE1hdGguYWJzKChsYXN0LmFncm9SYWRpdXMgPz8gMCkgLSBjZmcuYWdyb1JhZGl1cykgPiA1O1xuICBpZiAobmVlZHNTZW5kKSB7XG4gICAgc2VuZE1pc3NpbGVDb25maWcoY2ZnKTtcbiAgfVxuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiBzZW5kTWlzc2lsZUNvbmZpZyhjZmc6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0pOiB2b2lkIHtcbiAgbGFzdE1pc3NpbGVDb25maWdTZW50ID0ge1xuICAgIHNwZWVkOiBjZmcuc3BlZWQsXG4gICAgYWdyb1JhZGl1czogY2ZnLmFncm9SYWRpdXMsXG4gIH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImNvbmZpZ3VyZV9taXNzaWxlXCIsXG4gICAgbWlzc2lsZV9zcGVlZDogY2ZnLnNwZWVkLFxuICAgIG1pc3NpbGVfYWdybzogY2ZnLmFncm9SYWRpdXMsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk6IHZvaWQge1xuICBpZiAoIXNoaXBSb3V0ZXNDb250YWluZXIgfHwgIXNoaXBSb3V0ZUxlZyB8fCAhc2hpcFJvdXRlU3BlZWQgfHwgIXNoaXBEZWxldGVCdG4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGNvbnN0IGhhc1ZhbGlkU2VsZWN0aW9uID0gc2VsZWN0aW9uICE9PSBudWxsICYmIHNlbGVjdGlvbi5pbmRleCA+PSAwICYmIHNlbGVjdGlvbi5pbmRleCA8IHdwcy5sZW5ndGg7XG4gIGNvbnN0IGlzU2hpcENvbnRleHQgPSB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCI7XG5cbiAgc2hpcFJvdXRlc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUub3BhY2l0eSA9IGlzU2hpcENvbnRleHQgPyBcIjFcIiA6IFwiMC42XCI7XG5cbiAgaWYgKCFzdGF0ZVJlZi5tZSB8fCAhaGFzVmFsaWRTZWxlY3Rpb24pIHtcbiAgICBzaGlwUm91dGVMZWcudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIHNoaXBSb3V0ZVNwZWVkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICBzaGlwRGVsZXRlQnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICBpZiAoaXNTaGlwQ29udGV4dCkge1xuICAgICAgc2V0U2hpcFNsaWRlclZhbHVlKGRlZmF1bHRTcGVlZCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChzZWxlY3Rpb24gIT09IG51bGwpIHtcbiAgICBjb25zdCB3cCA9IHdwc1tzZWxlY3Rpb24uaW5kZXhdO1xuICAgIGNvbnN0IHNwZWVkID0gd3AgJiYgdHlwZW9mIHdwLnNwZWVkID09PSBcIm51bWJlclwiID8gd3Auc3BlZWQgOiBkZWZhdWx0U3BlZWQ7XG4gICAgaWYgKGlzU2hpcENvbnRleHQgJiYgc2hpcFNwZWVkU2xpZGVyICYmIE1hdGguYWJzKHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyLnZhbHVlKSAtIHNwZWVkKSA+IDAuMjUpIHtcbiAgICAgIHNldFNoaXBTbGlkZXJWYWx1ZShzcGVlZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHVwZGF0ZVNwZWVkTGFiZWwoc3BlZWQpO1xuICAgIH1cbiAgICBjb25zdCBkaXNwbGF5SW5kZXggPSBzZWxlY3Rpb24uaW5kZXggKyAxO1xuICAgIHNoaXBSb3V0ZUxlZy50ZXh0Q29udGVudCA9IGAke2Rpc3BsYXlJbmRleH1gO1xuICAgIHNoaXBSb3V0ZVNwZWVkLnRleHRDb250ZW50ID0gYCR7c3BlZWQudG9GaXhlZCgwKX0gdS9zYDtcbiAgICBzaGlwRGVsZXRlQnRuLmRpc2FibGVkID0gIWlzU2hpcENvbnRleHQ7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpOiB2b2lkIHtcbiAgaWYgKCFtaXNzaWxlRGVsZXRlQnRuKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGNvdW50ID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gIGNvbnN0IGhhc1NlbGVjdGlvbiA9IG1pc3NpbGVTZWxlY3Rpb24gIT09IG51bGwgJiYgbWlzc2lsZVNlbGVjdGlvbiAhPT0gdW5kZWZpbmVkICYmIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPj0gMCAmJiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgY291bnQ7XG4gIG1pc3NpbGVEZWxldGVCdG4uZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xufVxuXG5mdW5jdGlvbiBzZXRTZWxlY3Rpb24oc2VsOiBTZWxlY3Rpb24gfCBudWxsKTogdm9pZCB7XG4gIHNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICBjb25zdCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IG51bGw7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDpsZWdTZWxlY3RlZFwiLCB7IGluZGV4IH0pO1xufVxuXG5mdW5jdGlvbiBzZXRNaXNzaWxlU2VsZWN0aW9uKHNlbDogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwpOiB2b2lkIHtcbiAgbWlzc2lsZVNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCB3b3JsZFBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBpZiAodWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIikge1xuICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RSb3V0ZShjYW52YXNQb2ludCk7XG4gICAgc2V0U2VsZWN0aW9uKGhpdCA/PyBudWxsKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkOiBkZWZhdWx0U3BlZWQgfTtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF93YXlwb2ludFwiLCB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogZGVmYXVsdFNwZWVkIH0pO1xuICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMuc2xpY2UoKSA6IFtdO1xuICB3cHMucHVzaCh3cCk7XG4gIHN0YXRlUmVmLm1lLndheXBvaW50cyA9IHdwcztcbiAgaWYgKHdwcy5sZW5ndGggPiAwKSB7XG4gICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludEFkZGVkXCIsIHsgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIHdvcmxkUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlKSByZXR1cm47XG5cbiAgaWYgKHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0TWlzc2lsZVJvdXRlKGNhbnZhc1BvaW50KTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKGhpdCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgd3AgPSB7IHg6IHdvcmxkUG9pbnQueCwgeTogd29ybGRQb2ludC55IH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImFkZF9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIHg6IHdwLngsXG4gICAgeTogd3AueSxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cyA/IFsuLi5yb3V0ZS53YXlwb2ludHMsIHdwXSA6IFt3cF07XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24oeyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHJvdXRlLndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xufVxuXG5mdW5jdGlvbiBjbGVhclNoaXBSb3V0ZSgpOiB2b2lkIHtcbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGlmICghd3BzIHx8IHdwcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImNsZWFyX3dheXBvaW50c1wiIH0pO1xuICBpZiAoc3RhdGVSZWYubWUpIHtcbiAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHMgPSBbXTtcbiAgfVxuICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludHNDbGVhcmVkXCIpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVTZWxlY3RlZFNoaXBXYXlwb2ludCgpOiB2b2lkIHtcbiAgaWYgKCFzZWxlY3Rpb24pIHJldHVybjtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRlbGV0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICBpZiAoc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpKSB7XG4gICAgc3RhdGVSZWYubWUud2F5cG9pbnRzID0gc3RhdGVSZWYubWUud2F5cG9pbnRzLnNsaWNlKDAsIHNlbGVjdGlvbi5pbmRleCk7XG4gIH1cbiAgYnVzUmVmLmVtaXQoXCJzaGlwOndheXBvaW50RGVsZXRlZFwiLCB7IGluZGV4OiBzZWxlY3Rpb24uaW5kZXggfSk7XG4gIHNldFNlbGVjdGlvbihudWxsKTtcbn1cblxuZnVuY3Rpb24gZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUgfHwgIW1pc3NpbGVTZWxlY3Rpb24pIHJldHVybjtcbiAgY29uc3QgaW5kZXggPSBtaXNzaWxlU2VsZWN0aW9uLmluZGV4O1xuICBpZiAoIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCBpbmRleCA8IDAgfHwgaW5kZXggPj0gcm91dGUud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJkZWxldGVfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICBpbmRleCxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IFsuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoMCwgaW5kZXgpLCAuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoaW5kZXggKyAxKV07XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXggfSk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG59XG5cbmZ1bmN0aW9uIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgaWYgKG1pc3NpbGVMYXVuY2hCdG4/LmRpc2FibGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwibGF1bmNoX21pc3NpbGVcIixcbiAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjeWNsZU1pc3NpbGVSb3V0ZShkaXJlY3Rpb246IG51bWJlcik6IHZvaWQge1xuICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICBpZiAocm91dGVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjdXJyZW50SW5kZXggPSByb3V0ZXMuZmluZEluZGV4KChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKTtcbiAgY29uc3QgYmFzZUluZGV4ID0gY3VycmVudEluZGV4ID49IDAgPyBjdXJyZW50SW5kZXggOiAwO1xuICBjb25zdCBuZXh0SW5kZXggPSAoKGJhc2VJbmRleCArIGRpcmVjdGlvbikgJSByb3V0ZXMubGVuZ3RoICsgcm91dGVzLmxlbmd0aCkgJSByb3V0ZXMubGVuZ3RoO1xuICBjb25zdCBuZXh0Um91dGUgPSByb3V0ZXNbbmV4dEluZGV4XTtcbiAgaWYgKCFuZXh0Um91dGUpIHJldHVybjtcbiAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSBuZXh0Um91dGUuaWQ7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcInNldF9hY3RpdmVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgIHJvdXRlX2lkOiBuZXh0Um91dGUuaWQsXG4gIH0pO1xuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsIHsgcm91dGVJZDogbmV4dFJvdXRlLmlkIH0pO1xufVxuXG5mdW5jdGlvbiBjeWNsZVNoaXBTZWxlY3Rpb24oZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGlmICghd3BzIHx8IHdwcy5sZW5ndGggPT09IDApIHtcbiAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IGRpcmVjdGlvbiA+IDAgPyAtMSA6IHdwcy5sZW5ndGg7XG4gIGluZGV4ICs9IGRpcmVjdGlvbjtcbiAgaWYgKGluZGV4IDwgMCkgaW5kZXggPSB3cHMubGVuZ3RoIC0gMTtcbiAgaWYgKGluZGV4ID49IHdwcy5sZW5ndGgpIGluZGV4ID0gMDtcbiAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXggfSk7XG59XG5cbmZ1bmN0aW9uIHNldElucHV0Q29udGV4dChjb250ZXh0OiBcInNoaXBcIiB8IFwibWlzc2lsZVwiKTogdm9pZCB7XG4gIGNvbnN0IG5leHQgPSBjb250ZXh0ID09PSBcIm1pc3NpbGVcIiA/IFwibWlzc2lsZVwiIDogXCJzaGlwXCI7XG4gIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gbmV4dCkge1xuICAgIHJldHVybjtcbiAgfVxuICB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9IG5leHQ7XG5cbiAgLy8gQWxzbyB1cGRhdGUgYWN0aXZlVG9vbCB0byBtYXRjaCB0aGUgY29udGV4dCB0byBrZWVwIGJ1dHRvbiBzdGF0ZXMgaW4gc3luY1xuICBpZiAobmV4dCA9PT0gXCJzaGlwXCIpIHtcbiAgICBjb25zdCBzaGlwVG9vbFRvVXNlID0gdWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIiA/IFwic2hpcC1zZWxlY3RcIiA6IFwic2hpcC1zZXRcIjtcbiAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sICE9PSBzaGlwVG9vbFRvVXNlKSB7XG4gICAgICB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPSBzaGlwVG9vbFRvVXNlO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBtaXNzaWxlVG9vbFRvVXNlID0gdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9PT0gXCJzZWxlY3RcIiA/IFwibWlzc2lsZS1zZWxlY3RcIiA6IFwibWlzc2lsZS1zZXRcIjtcbiAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sICE9PSBtaXNzaWxlVG9vbFRvVXNlKSB7XG4gICAgICB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPSBtaXNzaWxlVG9vbFRvVXNlO1xuICAgIH1cbiAgfVxuXG4gIGJ1c1JlZi5lbWl0KFwiY29udGV4dDpjaGFuZ2VkXCIsIHsgY29udGV4dDogbmV4dCB9KTtcbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG59XG5cbmZ1bmN0aW9uIHNldEFjdGl2ZVRvb2wodG9vbDogQWN0aXZlVG9vbCk6IHZvaWQge1xuICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSB0b29sKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID0gdG9vbDtcblxuICAvLyBVcGRhdGUgYmFja3dhcmQgY29tcGF0aWJpbGl0eSBzdGF0ZXNcbiAgaWYgKHRvb2wgPT09IFwic2hpcC1zZXRcIikge1xuICAgIHVpU3RhdGVSZWYuc2hpcFRvb2wgPSBcInNldFwiO1xuICAgIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPSBudWxsO1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZXRcIiB9KTtcbiAgfSBlbHNlIGlmICh0b29sID09PSBcInNoaXAtc2VsZWN0XCIpIHtcbiAgICB1aVN0YXRlUmVmLnNoaXBUb29sID0gXCJzZWxlY3RcIjtcbiAgICB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID0gbnVsbDtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2VsZWN0XCIgfSk7XG4gIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IG51bGw7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IFwic2V0XCI7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2V0XCIgfSk7XG4gIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IG51bGw7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IFwic2VsZWN0XCI7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNlbGVjdFwiIH0pO1xuICB9XG5cbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbn1cblxuZnVuY3Rpb24gc2V0QnV0dG9uU3RhdGUoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICBpZiAoIWJ0bikgcmV0dXJuO1xuICBpZiAoYWN0aXZlKSB7XG4gICAgYnRuLmRhdGFzZXQuc3RhdGUgPSBcImFjdGl2ZVwiO1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJ0cnVlXCIpO1xuICB9IGVsc2Uge1xuICAgIGRlbGV0ZSBidG4uZGF0YXNldC5zdGF0ZTtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwiZmFsc2VcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTogdm9pZCB7XG4gIHNldEJ1dHRvblN0YXRlKHNoaXBTZXRCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNldFwiKTtcbiAgc2V0QnV0dG9uU3RhdGUoc2hpcFNlbGVjdEJ0biwgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2VsZWN0XCIpO1xuICBzZXRCdXR0b25TdGF0ZShtaXNzaWxlU2V0QnRuLCB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZXRcIik7XG4gIHNldEJ1dHRvblN0YXRlKG1pc3NpbGVTZWxlY3RCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKTtcblxuICBpZiAoc2hpcENvbnRyb2xzQ2FyZCkge1xuICAgIHNoaXBDb250cm9sc0NhcmQuY2xhc3NMaXN0LnRvZ2dsZShcImFjdGl2ZVwiLCB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCIpO1xuICB9XG4gIGlmIChtaXNzaWxlQ29udHJvbHNDYXJkKSB7XG4gICAgbWlzc2lsZUNvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0SGVscFZpc2libGUoZmxhZzogYm9vbGVhbik6IHZvaWQge1xuICB1aVN0YXRlUmVmLmhlbHBWaXNpYmxlID0gQm9vbGVhbihmbGFnKTtcbiAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgYnVzUmVmLmVtaXQoXCJoZWxwOnZpc2libGVDaGFuZ2VkXCIsIHsgdmlzaWJsZTogdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSB9KTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlSGVscE92ZXJsYXkoKTogdm9pZCB7XG4gIGlmICghaGVscE92ZXJsYXkpIHJldHVybjtcbiAgaWYgKGhlbHBUZXh0KSB7XG4gICAgaGVscFRleHQudGV4dENvbnRlbnQgPSBIRUxQX1RFWFQ7XG4gIH1cbiAgaGVscE92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZShcInZpc2libGVcIiwgdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSk7XG59XG5cbmZ1bmN0aW9uIGFkanVzdFNsaWRlclZhbHVlKGlucHV0OiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCwgc3RlcHM6IG51bWJlciwgY29hcnNlOiBib29sZWFuKTogbnVtYmVyIHwgbnVsbCB7XG4gIGlmICghaW5wdXQpIHJldHVybiBudWxsO1xuICBjb25zdCBzdGVwID0gTWF0aC5hYnMocGFyc2VGbG9hdChpbnB1dC5zdGVwKSkgfHwgMTtcbiAgY29uc3QgbXVsdGlwbGllciA9IGNvYXJzZSA/IDQgOiAxO1xuICBjb25zdCBtaW4gPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VGbG9hdChpbnB1dC5taW4pKSA/IHBhcnNlRmxvYXQoaW5wdXQubWluKSA6IC1JbmZpbml0eTtcbiAgY29uc3QgbWF4ID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWF4KSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1heCkgOiBJbmZpbml0eTtcbiAgY29uc3QgY3VycmVudCA9IHBhcnNlRmxvYXQoaW5wdXQudmFsdWUpIHx8IDA7XG4gIGxldCBuZXh0ID0gY3VycmVudCArIHN0ZXBzICogc3RlcCAqIG11bHRpcGxpZXI7XG4gIGlmIChOdW1iZXIuaXNGaW5pdGUobWluKSkgbmV4dCA9IE1hdGgubWF4KG1pbiwgbmV4dCk7XG4gIGlmIChOdW1iZXIuaXNGaW5pdGUobWF4KSkgbmV4dCA9IE1hdGgubWluKG1heCwgbmV4dCk7XG4gIGlmIChNYXRoLmFicyhuZXh0IC0gY3VycmVudCkgPCAxZS00KSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaW5wdXQudmFsdWUgPSBTdHJpbmcobmV4dCk7XG4gIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIiwgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgcmV0dXJuIG5leHQ7XG59XG5cbmZ1bmN0aW9uIG9uV2luZG93S2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICBjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgY29uc3QgaXNFZGl0YWJsZSA9ICEhdGFyZ2V0ICYmICh0YXJnZXQudGFnTmFtZSA9PT0gXCJJTlBVVFwiIHx8IHRhcmdldC50YWdOYW1lID09PSBcIlRFWFRBUkVBXCIgfHwgdGFyZ2V0LmlzQ29udGVudEVkaXRhYmxlKTtcblxuICBpZiAodWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSAmJiBldmVudC5rZXkgIT09IFwiRXNjYXBlXCIpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChpc0VkaXRhYmxlKSB7XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFc2NhcGVcIikge1xuICAgICAgdGFyZ2V0LmJsdXIoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIHN3aXRjaCAoZXZlbnQuY29kZSkge1xuICAgIGNhc2UgXCJEaWdpdDFcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJEaWdpdDJcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlUXCI6XG4gICAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2V0XCIpIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2VsZWN0XCIpO1xuICAgICAgfSBlbHNlIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZWxlY3RcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlDXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkJyYWNrZXRMZWZ0XCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUoc2hpcFNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiQnJhY2tldFJpZ2h0XCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUoc2hpcFNwZWVkU2xpZGVyLCAxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJUYWJcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBjeWNsZVNoaXBTZWxlY3Rpb24oZXZlbnQuc2hpZnRLZXkgPyAtMSA6IDEpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5TlwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIG1pc3NpbGVBZGRSb3V0ZUJ0bj8uY2xpY2soKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleUxcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleUVcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZXRcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZWxlY3RcIik7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkNvbW1hXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJQZXJpb2RcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlQWdyb1NsaWRlciwgMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiU2VtaWNvbG9uXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiUXVvdGVcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRlbGV0ZVwiOlxuICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgbWlzc2lsZVNlbGVjdGlvbikge1xuICAgICAgICBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgfSBlbHNlIGlmIChzZWxlY3Rpb24pIHtcbiAgICAgICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkVzY2FwZVwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuaGVscFZpc2libGUpIHtcbiAgICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgICAgfSBlbHNlIGlmIChtaXNzaWxlU2VsZWN0aW9uKSB7XG4gICAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHNlbGVjdGlvbikge1xuICAgICAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiRXF1YWxcIjpcbiAgICBjYXNlIFwiTnVtcGFkQWRkXCI6XG4gICAgICBpZiAoIWN2KSByZXR1cm47XG4gICAgICBzZXRab29tKHVpU3RhdGVSZWYuem9vbSAqIDEuMiwgY3Yud2lkdGggLyAyLCBjdi5oZWlnaHQgLyAyKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIk1pbnVzXCI6XG4gICAgY2FzZSBcIk51bXBhZFN1YnRyYWN0XCI6XG4gICAgICBpZiAoIWN2KSByZXR1cm47XG4gICAgICBzZXRab29tKHVpU3RhdGVSZWYuem9vbSAvIDEuMiwgY3Yud2lkdGggLyAyLCBjdi5oZWlnaHQgLyAyKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRpZ2l0MFwiOlxuICAgIGNhc2UgXCJOdW1wYWQwXCI6XG4gICAgICBpZiAoZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5KSB7XG4gICAgICAgIHVpU3RhdGVSZWYuem9vbSA9IDEuMDtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICBkZWZhdWx0OlxuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgIHNldEhlbHBWaXNpYmxlKCF1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldENhbWVyYVBvc2l0aW9uKCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gIGlmICghY3YpIHJldHVybiB7IHg6IHdvcmxkLncgLyAyLCB5OiB3b3JsZC5oIC8gMiB9O1xuXG4gIGNvbnN0IHpvb20gPSB1aVN0YXRlUmVmLnpvb207XG5cbiAgLy8gQ2FtZXJhIGZvbGxvd3Mgc2hpcCwgb3IgZGVmYXVsdHMgdG8gd29ybGQgY2VudGVyXG4gIGxldCBjYW1lcmFYID0gc3RhdGVSZWYubWUgPyBzdGF0ZVJlZi5tZS54IDogd29ybGQudyAvIDI7XG4gIGxldCBjYW1lcmFZID0gc3RhdGVSZWYubWUgPyBzdGF0ZVJlZi5tZS55IDogd29ybGQuaCAvIDI7XG5cbiAgLy8gQ2FsY3VsYXRlIHZpc2libGUgd29ybGQgYXJlYSBhdCBjdXJyZW50IHpvb20gdXNpbmcgdW5pZm9ybSBzY2FsZVxuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAvLyBXb3JsZCB1bml0cyB2aXNpYmxlIG9uIHNjcmVlblxuICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjdi5oZWlnaHQgLyBzY2FsZTtcblxuICAvLyBDbGFtcCBjYW1lcmEgdG8gcHJldmVudCB6b29taW5nIHBhc3Qgd29ybGQgYm91bmRhcmllc1xuICAvLyBXaGVuIHpvb21lZCBvdXQsIGNhbWVyYSBjYW4ndCBnZXQgY2xvc2VyIHRvIGVkZ2VzIHRoYW4gaGFsZiB2aWV3cG9ydFxuICBjb25zdCBtaW5DYW1lcmFYID0gdmlld3BvcnRXaWR0aCAvIDI7XG4gIGNvbnN0IG1heENhbWVyYVggPSB3b3JsZC53IC0gdmlld3BvcnRXaWR0aCAvIDI7XG4gIGNvbnN0IG1pbkNhbWVyYVkgPSB2aWV3cG9ydEhlaWdodCAvIDI7XG4gIGNvbnN0IG1heENhbWVyYVkgPSB3b3JsZC5oIC0gdmlld3BvcnRIZWlnaHQgLyAyO1xuXG4gIC8vIE9ubHkgY2xhbXAgaWYgdGhlIHZpZXdwb3J0IGlzIHNtYWxsZXIgdGhhbiB0aGUgd29ybGRcbiAgaWYgKHZpZXdwb3J0V2lkdGggPCB3b3JsZC53KSB7XG4gICAgY2FtZXJhWCA9IGNsYW1wKGNhbWVyYVgsIG1pbkNhbWVyYVgsIG1heENhbWVyYVgpO1xuICB9XG4gIGlmICh2aWV3cG9ydEhlaWdodCA8IHdvcmxkLmgpIHtcbiAgICBjYW1lcmFZID0gY2xhbXAoY2FtZXJhWSwgbWluQ2FtZXJhWSwgbWF4Q2FtZXJhWSk7XG4gIH1cblxuICByZXR1cm4geyB4OiBjYW1lcmFYLCB5OiBjYW1lcmFZIH07XG59XG5cbmZ1bmN0aW9uIHdvcmxkVG9DYW52YXMocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcblxuICBjb25zdCB6b29tID0gdWlTdGF0ZVJlZi56b29tO1xuICBjb25zdCBjYW1lcmEgPSBnZXRDYW1lcmFQb3NpdGlvbigpO1xuXG4gIC8vIFdvcmxkIHBvc2l0aW9uIHJlbGF0aXZlIHRvIGNhbWVyYVxuICBjb25zdCB3b3JsZFggPSBwLnggLSBjYW1lcmEueDtcbiAgY29uc3Qgd29ybGRZID0gcC55IC0gY2FtZXJhLnk7XG5cbiAgLy8gVXNlIHVuaWZvcm0gc2NhbGUgdG8gbWFpbnRhaW4gYXNwZWN0IHJhdGlvXG4gIC8vIFNjYWxlIGlzIHBpeGVscyBwZXIgd29ybGQgdW5pdCAtIGNob29zZSB0aGUgZGltZW5zaW9uIHRoYXQgZml0c1xuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAvLyBDb252ZXJ0IHRvIGNhbnZhcyBjb29yZGluYXRlcyAoY2VudGVyZWQgb24gc2NyZWVuKVxuICByZXR1cm4ge1xuICAgIHg6IHdvcmxkWCAqIHNjYWxlICsgY3Yud2lkdGggLyAyLFxuICAgIHk6IHdvcmxkWSAqIHNjYWxlICsgY3YuaGVpZ2h0IC8gMlxuICB9O1xufVxuXG5mdW5jdGlvbiBjYW52YXNUb1dvcmxkKHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gIGlmICghY3YpIHJldHVybiB7IHg6IHAueCwgeTogcC55IH07XG5cbiAgY29uc3Qgem9vbSA9IHVpU3RhdGVSZWYuem9vbTtcbiAgY29uc3QgY2FtZXJhID0gZ2V0Q2FtZXJhUG9zaXRpb24oKTtcblxuICAvLyBDYW52YXMgcG9zaXRpb24gcmVsYXRpdmUgdG8gY2VudGVyXG4gIGNvbnN0IGNhbnZhc1ggPSBwLnggLSBjdi53aWR0aCAvIDI7XG4gIGNvbnN0IGNhbnZhc1kgPSBwLnkgLSBjdi5oZWlnaHQgLyAyO1xuXG4gIC8vIFVzZSB1bmlmb3JtIHNjYWxlIHRvIG1haW50YWluIGFzcGVjdCByYXRpb1xuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAvLyBDb252ZXJ0IHRvIHdvcmxkIGNvb3JkaW5hdGVzIChpbnZlcnNlIG9mIHdvcmxkVG9DYW52YXMpXG4gIHJldHVybiB7XG4gICAgeDogY2FudmFzWCAvIHNjYWxlICsgY2FtZXJhLngsXG4gICAgeTogY2FudmFzWSAvIHNjYWxlICsgY2FtZXJhLnlcbiAgfTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZVJvdXRlUG9pbnRzKCkge1xuICBpZiAoIXN0YXRlUmVmLm1lKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgd3BzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGNvbnN0IHdvcmxkUG9pbnRzID0gW3sgeDogc3RhdGVSZWYubWUueCwgeTogc3RhdGVSZWYubWUueSB9XTtcbiAgZm9yIChjb25zdCB3cCBvZiB3cHMpIHtcbiAgICB3b3JsZFBvaW50cy5wdXNoKHsgeDogd3AueCwgeTogd3AueSB9KTtcbiAgfVxuICBjb25zdCBjYW52YXNQb2ludHMgPSB3b3JsZFBvaW50cy5tYXAoKHBvaW50KSA9PiB3b3JsZFRvQ2FudmFzKHBvaW50KSk7XG4gIHJldHVybiB7IHdheXBvaW50czogd3BzLCB3b3JsZFBvaW50cywgY2FudmFzUG9pbnRzIH07XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKSB7XG4gIGlmICghc3RhdGVSZWYubWUpIHJldHVybiBudWxsO1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBjb25zdCB3cHMgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMgOiBbXTtcbiAgY29uc3Qgd29ybGRQb2ludHMgPSBbeyB4OiBzdGF0ZVJlZi5tZS54LCB5OiBzdGF0ZVJlZi5tZS55IH1dO1xuICBmb3IgKGNvbnN0IHdwIG9mIHdwcykge1xuICAgIHdvcmxkUG9pbnRzLnB1c2goeyB4OiB3cC54LCB5OiB3cC55IH0pO1xuICB9XG4gIGNvbnN0IGNhbnZhc1BvaW50cyA9IHdvcmxkUG9pbnRzLm1hcCgocG9pbnQpID0+IHdvcmxkVG9DYW52YXMocG9pbnQpKTtcbiAgcmV0dXJuIHsgd2F5cG9pbnRzOiB3cHMsIHdvcmxkUG9pbnRzLCBjYW52YXNQb2ludHMgfTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlTGVnRGFzaE9mZnNldHMoZHRTZWNvbmRzOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCF1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUgfHwgIXN0YXRlUmVmLm1lKSB7XG4gICAgbGVnRGFzaE9mZnNldHMuY2xlYXIoKTtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgcm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgbGVnRGFzaE9mZnNldHMuY2xlYXIoKTtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgeyB3YXlwb2ludHMsIHdvcmxkUG9pbnRzLCBjYW52YXNQb2ludHMgfSA9IHJvdXRlO1xuICBjb25zdCBjeWNsZSA9IDY0O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwID0gd2F5cG9pbnRzW2ldO1xuICAgIGNvbnN0IHNwZWVkID0gdHlwZW9mIHdwLnNwZWVkID09PSBcIm51bWJlclwiID8gd3Auc3BlZWQgOiBkZWZhdWx0U3BlZWQ7XG4gICAgY29uc3QgYVdvcmxkID0gd29ybGRQb2ludHNbaV07XG4gICAgY29uc3QgYldvcmxkID0gd29ybGRQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IHdvcmxkRGlzdCA9IE1hdGguaHlwb3QoYldvcmxkLnggLSBhV29ybGQueCwgYldvcmxkLnkgLSBhV29ybGQueSk7XG4gICAgY29uc3QgYUNhbnZhcyA9IGNhbnZhc1BvaW50c1tpXTtcbiAgICBjb25zdCBiQ2FudmFzID0gY2FudmFzUG9pbnRzW2kgKyAxXTtcbiAgICBjb25zdCBjYW52YXNEaXN0ID0gTWF0aC5oeXBvdChiQ2FudmFzLnggLSBhQ2FudmFzLngsIGJDYW52YXMueSAtIGFDYW52YXMueSk7XG5cbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShzcGVlZCkgfHwgc3BlZWQgPD0gMWUtMyB8fCAhTnVtYmVyLmlzRmluaXRlKHdvcmxkRGlzdCkgfHwgd29ybGREaXN0IDw9IDFlLTMgfHwgY2FudmFzRGlzdCA8PSAxZS0zKSB7XG4gICAgICBsZWdEYXNoT2Zmc2V0cy5zZXQoaSwgMCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShkdFNlY29uZHMpIHx8IGR0U2Vjb25kcyA8PSAwKSB7XG4gICAgICBpZiAoIWxlZ0Rhc2hPZmZzZXRzLmhhcyhpKSkge1xuICAgICAgICBsZWdEYXNoT2Zmc2V0cy5zZXQoaSwgMCk7XG4gICAgICB9XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBzY2FsZSA9IGNhbnZhc0Rpc3QgLyB3b3JsZERpc3Q7XG4gICAgY29uc3QgZGFzaFNwZWVkID0gc3BlZWQgKiBzY2FsZTtcbiAgICBsZXQgbmV4dCA9IChsZWdEYXNoT2Zmc2V0cy5nZXQoaSkgPz8gMCkgLSBkYXNoU3BlZWQgKiBkdFNlY29uZHM7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobmV4dCkpIHtcbiAgICAgIG5leHQgPSAwO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0ID0gKChuZXh0ICUgY3ljbGUpICsgY3ljbGUpICUgY3ljbGU7XG4gICAgfVxuICAgIGxlZ0Rhc2hPZmZzZXRzLnNldChpLCBuZXh0KTtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBvZiBBcnJheS5mcm9tKGxlZ0Rhc2hPZmZzZXRzLmtleXMoKSkpIHtcbiAgICBpZiAoa2V5ID49IHdheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGxlZ0Rhc2hPZmZzZXRzLmRlbGV0ZShrZXkpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBwb2ludFNlZ21lbnREaXN0YW5jZShwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIGE6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgYjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogbnVtYmVyIHtcbiAgY29uc3QgYWJ4ID0gYi54IC0gYS54O1xuICBjb25zdCBhYnkgPSBiLnkgLSBhLnk7XG4gIGNvbnN0IGFweCA9IHAueCAtIGEueDtcbiAgY29uc3QgYXB5ID0gcC55IC0gYS55O1xuICBjb25zdCBhYkxlblNxID0gYWJ4ICogYWJ4ICsgYWJ5ICogYWJ5O1xuICBjb25zdCB0ID0gYWJMZW5TcSA9PT0gMCA/IDAgOiBjbGFtcChhcHggKiBhYnggKyBhcHkgKiBhYnksIDAsIGFiTGVuU3EpIC8gYWJMZW5TcTtcbiAgY29uc3QgcHJvanggPSBhLnggKyBhYnggKiB0O1xuICBjb25zdCBwcm9qeSA9IGEueSArIGFieSAqIHQ7XG4gIGNvbnN0IGR4ID0gcC54IC0gcHJvang7XG4gIGNvbnN0IGR5ID0gcC55IC0gcHJvank7XG4gIHJldHVybiBNYXRoLmh5cG90KGR4LCBkeSk7XG59XG5cbmZ1bmN0aW9uIGhpdFRlc3RSb3V0ZShjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogU2VsZWN0aW9uIHwgbnVsbCB7XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGNvbnN0IHsgY2FudmFzUG9pbnRzIH0gPSByb3V0ZTtcbiAgY29uc3Qgd2F5cG9pbnRIaXRSYWRpdXMgPSAxMjtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB3cENhbnZhcyA9IGNhbnZhc1BvaW50c1tpICsgMV07XG4gICAgY29uc3QgZHggPSBjYW52YXNQb2ludC54IC0gd3BDYW52YXMueDtcbiAgICBjb25zdCBkeSA9IGNhbnZhc1BvaW50LnkgLSB3cENhbnZhcy55O1xuICAgIGlmIChNYXRoLmh5cG90KGR4LCBkeSkgPD0gd2F5cG9pbnRIaXRSYWRpdXMpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6IFwid2F5cG9pbnRcIiwgaW5kZXg6IGkgfTtcbiAgICB9XG4gIH1cbiAgaWYgKCF1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCBsZWdIaXREaXN0YW5jZSA9IDEwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHJvdXRlLndheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGRpc3QgPSBwb2ludFNlZ21lbnREaXN0YW5jZShjYW52YXNQb2ludCwgY2FudmFzUG9pbnRzW2ldLCBjYW52YXNQb2ludHNbaSArIDFdKTtcbiAgICBpZiAoZGlzdCA8PSBsZWdIaXREaXN0YW5jZSkge1xuICAgICAgcmV0dXJuIHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IGkgfTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGhpdFRlc3RNaXNzaWxlUm91dGUoY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsIHtcbiAgY29uc3Qgcm91dGUgPSBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGNvbnN0IHsgY2FudmFzUG9pbnRzIH0gPSByb3V0ZTtcbiAgY29uc3Qgd2F5cG9pbnRIaXRSYWRpdXMgPSAxNjtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBjYW52YXNQb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB3cENhbnZhcyA9IGNhbnZhc1BvaW50c1tpXTtcbiAgICBjb25zdCBkeCA9IGNhbnZhc1BvaW50LnggLSB3cENhbnZhcy54O1xuICAgIGNvbnN0IGR5ID0gY2FudmFzUG9pbnQueSAtIHdwQ2FudmFzLnk7XG4gICAgaWYgKE1hdGguaHlwb3QoZHgsIGR5KSA8PSB3YXlwb2ludEhpdFJhZGl1cykge1xuICAgICAgcmV0dXJuIHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogaSAtIDEgfTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGRyYXdTaGlwKHg6IG51bWJlciwgeTogbnVtYmVyLCB2eDogbnVtYmVyLCB2eTogbnVtYmVyLCBjb2xvcjogc3RyaW5nLCBmaWxsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgaWYgKCFjdHgpIHJldHVybjtcbiAgY29uc3QgcCA9IHdvcmxkVG9DYW52YXMoeyB4LCB5IH0pO1xuICBjb25zdCByID0gMTA7XG4gIGN0eC5zYXZlKCk7XG4gIGN0eC50cmFuc2xhdGUocC54LCBwLnkpO1xuICBjb25zdCBhbmdsZSA9IE1hdGguYXRhbjIodnksIHZ4KTtcbiAgY3R4LnJvdGF0ZShhbmdsZSk7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4Lm1vdmVUbyhyLCAwKTtcbiAgY3R4LmxpbmVUbygtciAqIDAuNywgciAqIDAuNik7XG4gIGN0eC5saW5lVG8oLXIgKiAwLjQsIDApO1xuICBjdHgubGluZVRvKC1yICogMC43LCAtciAqIDAuNik7XG4gIGN0eC5jbG9zZVBhdGgoKTtcbiAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gIGN0eC5zdHJva2VTdHlsZSA9IGNvbG9yO1xuICBpZiAoZmlsbGVkKSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IGAke2NvbG9yfWNjYDtcbiAgICBjdHguZmlsbCgpO1xuICB9XG4gIGN0eC5zdHJva2UoKTtcbiAgY3R4LnJlc3RvcmUoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0dob3N0RG90KHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghY3R4KSByZXR1cm47XG4gIGNvbnN0IHAgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeSB9KTtcbiAgY3R4LmJlZ2luUGF0aCgpO1xuICBjdHguYXJjKHAueCwgcC55LCAzLCAwLCBNYXRoLlBJICogMik7XG4gIGN0eC5maWxsU3R5bGUgPSBcIiNjY2NjY2NhYVwiO1xuICBjdHguZmlsbCgpO1xufVxuXG5mdW5jdGlvbiBkcmF3Um91dGUoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgY29uc3QgeyBjYW52YXNQb2ludHMgfSA9IHJvdXRlO1xuICBjb25zdCBsZWdDb3VudCA9IGNhbnZhc1BvaW50cy5sZW5ndGggLSAxO1xuXG4gIGlmICh1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUgJiYgbGVnQ291bnQgPiAwKSB7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguc2V0TGluZURhc2goWzgsIDhdKTtcbiAgICBjdHgubGluZVdpZHRoID0gMS41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiIzM4YmRmODY2XCI7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZWdDb3VudDsgaSsrKSB7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHgubW92ZVRvKGNhbnZhc1BvaW50c1tpXS54LCBjYW52YXNQb2ludHNbaV0ueSk7XG4gICAgICBjdHgubGluZVRvKGNhbnZhc1BvaW50c1tpICsgMV0ueCwgY2FudmFzUG9pbnRzW2kgKyAxXS55KTtcbiAgICAgIGN0eC5saW5lRGFzaE9mZnNldCA9IGxlZ0Rhc2hPZmZzZXRzLmdldChpKSA/PyAwO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgIH1cbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG5cbiAgaWYgKHVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSAmJiBsZWdDb3VudCA+IDApIHtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5zZXRMaW5lRGFzaChbNiwgNl0pO1xuICAgIGN0eC5saW5lV2lkdGggPSAzO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiIzM4YmRmOFwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGNhbnZhc1BvaW50c1swXS54LCBjYW52YXNQb2ludHNbMF0ueSk7XG4gICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbMV0ueCwgY2FudmFzUG9pbnRzWzFdLnkpO1xuICAgIGN0eC5saW5lRGFzaE9mZnNldCA9IGxlZ0Rhc2hPZmZzZXRzLmdldCgwKSA/PyAwO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG5cbiAgaWYgKHVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSAmJiBzZWxlY3Rpb24gJiYgc2VsZWN0aW9uLmluZGV4IDwgbGVnQ291bnQpIHtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5zZXRMaW5lRGFzaChbNCwgNF0pO1xuICAgIGN0eC5saW5lV2lkdGggPSAzLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjZjk3MzE2XCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oY2FudmFzUG9pbnRzW3NlbGVjdGlvbi5pbmRleF0ueCwgY2FudmFzUG9pbnRzW3NlbGVjdGlvbi5pbmRleF0ueSk7XG4gICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbc2VsZWN0aW9uLmluZGV4ICsgMV0ueCwgY2FudmFzUG9pbnRzW3NlbGVjdGlvbi5pbmRleCArIDFdLnkpO1xuICAgIGN0eC5saW5lRGFzaE9mZnNldCA9IGxlZ0Rhc2hPZmZzZXRzLmdldChzZWxlY3Rpb24uaW5kZXgpID8/IDA7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHJvdXRlLndheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHB0ID0gY2FudmFzUG9pbnRzW2kgKyAxXTtcbiAgICBjb25zdCBpc1NlbGVjdGVkID0gc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5pbmRleCA9PT0gaTtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHguYXJjKHB0LngsIHB0LnksIGlzU2VsZWN0ZWQgPyA3IDogNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgIGN0eC5maWxsU3R5bGUgPSBpc1NlbGVjdGVkID8gXCIjZjk3MzE2XCIgOiBcIiMzOGJkZjhcIjtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSBpc1NlbGVjdGVkID8gMC45NSA6IDAuODtcbiAgICBjdHguZmlsbCgpO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMGYxNzJhXCI7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZHJhd01pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIXN0YXRlUmVmLm1lKSByZXR1cm47XG4gIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCAhPT0gXCJtaXNzaWxlXCIpIHJldHVybjtcbiAgY29uc3Qgcm91dGUgPSBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICBjb25zdCB7IGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGN0eC5zYXZlKCk7XG4gIGN0eC5zZXRMaW5lRGFzaChbMTAsIDZdKTtcbiAgY3R4LmxpbmVXaWR0aCA9IDIuNTtcbiAgY3R4LnN0cm9rZVN0eWxlID0gXCIjZjg3MTcxYWFcIjtcbiAgY3R4LmJlZ2luUGF0aCgpO1xuICBjdHgubW92ZVRvKGNhbnZhc1BvaW50c1swXS54LCBjYW52YXNQb2ludHNbMF0ueSk7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgY2FudmFzUG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbaV0ueCwgY2FudmFzUG9pbnRzW2ldLnkpO1xuICB9XG4gIGN0eC5zdHJva2UoKTtcbiAgY3R4LnJlc3RvcmUoKTtcblxuICBmb3IgKGxldCBpID0gMTsgaSA8IGNhbnZhc1BvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHB0ID0gY2FudmFzUG9pbnRzW2ldO1xuICAgIGNvbnN0IHdheXBvaW50SW5kZXggPSBpIC0gMTtcbiAgICBjb25zdCBpc1NlbGVjdGVkID0gbWlzc2lsZVNlbGVjdGlvbiAmJiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID09PSB3YXlwb2ludEluZGV4O1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMocHQueCwgcHQueSwgaXNTZWxlY3RlZCA/IDcgOiA1LCAwLCBNYXRoLlBJICogMik7XG4gICAgY3R4LmZpbGxTdHlsZSA9IGlzU2VsZWN0ZWQgPyBcIiNmYWNjMTVcIiA6IFwiI2Y4NzE3MVwiO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IGlzU2VsZWN0ZWQgPyAwLjk1IDogMC45O1xuICAgIGN0eC5maWxsKCk7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMTtcbiAgICBjdHgubGluZVdpZHRoID0gMS41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGlzU2VsZWN0ZWQgPyBcIiM4NTRkMGVcIiA6IFwiIzdmMWQxZFwiO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRyYXdNaXNzaWxlcygpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIXN0YXRlUmVmLm1pc3NpbGVzIHx8IHN0YXRlUmVmLm1pc3NpbGVzLmxlbmd0aCA9PT0gMCB8fCAhY3YpIHJldHVybjtcbiAgY29uc3Qgc2NhbGVYID0gY3Yud2lkdGggLyB3b3JsZC53O1xuICBjb25zdCBzY2FsZVkgPSBjdi5oZWlnaHQgLyB3b3JsZC5oO1xuICBjb25zdCByYWRpdXNTY2FsZSA9IChzY2FsZVggKyBzY2FsZVkpIC8gMjtcbiAgZm9yIChjb25zdCBtaXNzIG9mIHN0YXRlUmVmLm1pc3NpbGVzKSB7XG4gICAgY29uc3QgcCA9IHdvcmxkVG9DYW52YXMoeyB4OiBtaXNzLngsIHk6IG1pc3MueSB9KTtcbiAgICBjb25zdCBzZWxmT3duZWQgPSBCb29sZWFuKG1pc3Muc2VsZik7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmFyYyhwLngsIHAueSwgc2VsZk93bmVkID8gNiA6IDUsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gc2VsZk93bmVkID8gXCIjZjg3MTcxXCIgOiBcIiNmY2E1YTVcIjtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSBzZWxmT3duZWQgPyAwLjk1IDogMC44O1xuICAgIGN0eC5maWxsKCk7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMTtcbiAgICBjdHgubGluZVdpZHRoID0gMS41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiIzExMTgyN1wiO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgaWYgKHNlbGZPd25lZCAmJiBtaXNzLmFncm9fcmFkaXVzID4gMCkge1xuICAgICAgY3R4LnNhdmUoKTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGNvbnN0IHJDYW52YXMgPSBtaXNzLmFncm9fcmFkaXVzICogcmFkaXVzU2NhbGU7XG4gICAgICBjdHguc2V0TGluZURhc2goWzE0LCAxMF0pO1xuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJyZ2JhKDI0OCwxMTMsMTEzLDAuMzUpXCI7XG4gICAgICBjdHgubGluZVdpZHRoID0gMS4yO1xuICAgICAgY3R4LmFyYyhwLngsIHAueSwgckNhbnZhcywgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZHJhd0dyaWQoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFjdikgcmV0dXJuO1xuICBjdHguc2F2ZSgpO1xuICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMyMzRcIjtcbiAgY3R4LmxpbmVXaWR0aCA9IDE7XG5cbiAgY29uc3Qgem9vbSA9IHVpU3RhdGVSZWYuem9vbTtcbiAgbGV0IHN0ZXAgPSAxMDAwO1xuICBpZiAoem9vbSA8IDAuNykge1xuICAgIHN0ZXAgPSAyMDAwO1xuICB9IGVsc2UgaWYgKHpvb20gPiAxLjUpIHtcbiAgICBzdGVwID0gNTAwO1xuICB9IGVsc2UgaWYgKHpvb20gPiAyLjUpIHtcbiAgICBzdGVwID0gMjUwO1xuICB9XG5cbiAgY29uc3QgY2FtZXJhID0gZ2V0Q2FtZXJhUG9zaXRpb24oKTtcblxuICAvLyBDYWxjdWxhdGUgdmlld3BvcnQgdXNpbmcgdW5pZm9ybSBzY2FsZSAoc2FtZSBhcyBjb29yZGluYXRlIHRyYW5zZm9ybXMpXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjdi5oZWlnaHQgLyBzY2FsZTtcblxuICBjb25zdCBtaW5YID0gTWF0aC5tYXgoMCwgY2FtZXJhLnggLSB2aWV3cG9ydFdpZHRoIC8gMik7XG4gIGNvbnN0IG1heFggPSBNYXRoLm1pbih3b3JsZC53LCBjYW1lcmEueCArIHZpZXdwb3J0V2lkdGggLyAyKTtcbiAgY29uc3QgbWluWSA9IE1hdGgubWF4KDAsIGNhbWVyYS55IC0gdmlld3BvcnRIZWlnaHQgLyAyKTtcbiAgY29uc3QgbWF4WSA9IE1hdGgubWluKHdvcmxkLmgsIGNhbWVyYS55ICsgdmlld3BvcnRIZWlnaHQgLyAyKTtcblxuICBjb25zdCBzdGFydFggPSBNYXRoLmZsb29yKG1pblggLyBzdGVwKSAqIHN0ZXA7XG4gIGNvbnN0IGVuZFggPSBNYXRoLmNlaWwobWF4WCAvIHN0ZXApICogc3RlcDtcbiAgY29uc3Qgc3RhcnRZID0gTWF0aC5mbG9vcihtaW5ZIC8gc3RlcCkgKiBzdGVwO1xuICBjb25zdCBlbmRZID0gTWF0aC5jZWlsKG1heFkgLyBzdGVwKSAqIHN0ZXA7XG5cbiAgZm9yIChsZXQgeCA9IHN0YXJ0WDsgeCA8PSBlbmRYOyB4ICs9IHN0ZXApIHtcbiAgICBjb25zdCBhID0gd29ybGRUb0NhbnZhcyh7IHgsIHk6IE1hdGgubWF4KDAsIG1pblkpIH0pO1xuICAgIGNvbnN0IGIgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeTogTWF0aC5taW4od29ybGQuaCwgbWF4WSkgfSk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oYS54LCBhLnkpO1xuICAgIGN0eC5saW5lVG8oYi54LCBiLnkpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgfVxuICBmb3IgKGxldCB5ID0gc3RhcnRZOyB5IDw9IGVuZFk7IHkgKz0gc3RlcCkge1xuICAgIGNvbnN0IGEgPSB3b3JsZFRvQ2FudmFzKHsgeDogTWF0aC5tYXgoMCwgbWluWCksIHkgfSk7XG4gICAgY29uc3QgYiA9IHdvcmxkVG9DYW52YXMoeyB4OiBNYXRoLm1pbih3b3JsZC53LCBtYXhYKSwgeSB9KTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhhLngsIGEueSk7XG4gICAgY3R4LmxpbmVUbyhiLngsIGIueSk7XG4gICAgY3R4LnN0cm9rZSgpO1xuICB9XG4gIGN0eC5yZXN0b3JlKCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpOiB2b2lkIHtcbiAgaWYgKCFtaXNzaWxlTGF1bmNoQnRuIHx8ICFtaXNzaWxlTGF1bmNoVGV4dCB8fCAhbWlzc2lsZUxhdW5jaEluZm8pIHJldHVybjtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgY291bnQgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgY29uc3QgcmVtYWluaW5nID0gZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk7XG4gIGNvbnN0IGNvb2xpbmdEb3duID0gcmVtYWluaW5nID4gMC4wNTtcbiAgY29uc3Qgc2hvdWxkRGlzYWJsZSA9ICFyb3V0ZSB8fCBjb3VudCA9PT0gMCB8fCBjb29saW5nRG93bjtcbiAgbWlzc2lsZUxhdW5jaEJ0bi5kaXNhYmxlZCA9IHNob3VsZERpc2FibGU7XG5cbiAgY29uc3QgbGF1bmNoVGV4dEhUTUwgPSAnPHNwYW4gY2xhc3M9XCJidG4tdGV4dC1mdWxsXCI+TGF1bmNoPC9zcGFuPjxzcGFuIGNsYXNzPVwiYnRuLXRleHQtc2hvcnRcIj5GaXJlPC9zcGFuPic7XG4gIGxldCBsYXVuY2hJbmZvSFRNTCA9IFwiXCI7XG5cbiAgaWYgKCFyb3V0ZSkge1xuICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgfSBlbHNlIGlmIChjb29saW5nRG93bikge1xuICAgIGxhdW5jaEluZm9IVE1MID0gYCR7cmVtYWluaW5nLnRvRml4ZWQoMSl9c2A7XG4gIH0gZWxzZSBpZiAocm91dGUubmFtZSkge1xuICAgIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gICAgY29uc3Qgcm91dGVJbmRleCA9IHJvdXRlcy5maW5kSW5kZXgoKHIpID0+IHIuaWQgPT09IHJvdXRlLmlkKSArIDE7XG4gICAgbGF1bmNoSW5mb0hUTUwgPSBgPHNwYW4gY2xhc3M9XCJidG4tdGV4dC1mdWxsXCI+JHtyb3V0ZS5uYW1lfTwvc3Bhbj48c3BhbiBjbGFzcz1cImJ0bi10ZXh0LXNob3J0XCI+JHtyb3V0ZUluZGV4fTwvc3Bhbj5gO1xuICB9IGVsc2Uge1xuICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgfVxuXG4gIGlmIChsYXN0TWlzc2lsZUxhdW5jaFRleHRIVE1MICE9PSBsYXVuY2hUZXh0SFRNTCkge1xuICAgIG1pc3NpbGVMYXVuY2hUZXh0LmlubmVySFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICAgIGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgPSBsYXVuY2hUZXh0SFRNTDtcbiAgfVxuXG4gIGlmIChsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MICE9PSBsYXVuY2hJbmZvSFRNTCkge1xuICAgIG1pc3NpbGVMYXVuY2hJbmZvLmlubmVySFRNTCA9IGxhdW5jaEluZm9IVE1MO1xuICAgIGxhc3RNaXNzaWxlTGF1bmNoSW5mb0hUTUwgPSBsYXVuY2hJbmZvSFRNTDtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTogbnVtYmVyIHtcbiAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlUmVmKTtcbiAgcmV0dXJuIHJlbWFpbmluZyA+IDAgPyByZW1haW5pbmcgOiAwO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk6IHZvaWQge1xuICBjb25zdCBtZXRhID0gc3RhdGVSZWYud29ybGRNZXRhID8/IHt9O1xuICBjb25zdCBoYXNXaWR0aCA9IHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudyk7XG4gIGNvbnN0IGhhc0hlaWdodCA9IHR5cGVvZiBtZXRhLmggPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuaCk7XG5cbiAgaWYgKGhhc1dpZHRoKSB7XG4gICAgd29ybGQudyA9IG1ldGEudyE7XG4gIH1cbiAgaWYgKGhhc0hlaWdodCkge1xuICAgIHdvcmxkLmggPSBtZXRhLmghO1xuICB9XG4gIGlmIChIUHNwYW4pIHtcbiAgICBpZiAoc3RhdGVSZWYubWUgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXRlUmVmLm1lLmhwKSkge1xuICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlUmVmLm1lLmhwKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBIUHNwYW4udGV4dENvbnRlbnQgPSBcIlx1MjAxM1wiO1xuICAgIH1cbiAgfVxuICBpZiAoa2lsbHNTcGFuKSB7XG4gICAgaWYgKHN0YXRlUmVmLm1lICYmIE51bWJlci5pc0Zpbml0ZShzdGF0ZVJlZi5tZS5raWxscykpIHtcbiAgICAgIGtpbGxzU3Bhbi50ZXh0Q29udGVudCA9IE51bWJlcihzdGF0ZVJlZi5tZS5raWxscykudG9TdHJpbmcoKTtcbiAgICB9IGVsc2Uge1xuICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gXCIwXCI7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIWN2KSByZXR1cm47XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKHRpbWVzdGFtcCkpIHtcbiAgICB0aW1lc3RhbXAgPSBsYXN0TG9vcFRzID8/IDA7XG4gIH1cbiAgbGV0IGR0U2Vjb25kcyA9IDA7XG4gIGlmIChsYXN0TG9vcFRzICE9PSBudWxsKSB7XG4gICAgZHRTZWNvbmRzID0gKHRpbWVzdGFtcCAtIGxhc3RMb29wVHMpIC8gMTAwMDtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShkdFNlY29uZHMpIHx8IGR0U2Vjb25kcyA8IDApIHtcbiAgICAgIGR0U2Vjb25kcyA9IDA7XG4gICAgfVxuICB9XG4gIGxhc3RMb29wVHMgPSB0aW1lc3RhbXA7XG4gIHVwZGF0ZUxlZ0Rhc2hPZmZzZXRzKGR0U2Vjb25kcyk7XG5cbiAgY3R4LmNsZWFyUmVjdCgwLCAwLCBjdi53aWR0aCwgY3YuaGVpZ2h0KTtcbiAgZHJhd0dyaWQoKTtcbiAgZHJhd1JvdXRlKCk7XG4gIGRyYXdNaXNzaWxlUm91dGUoKTtcbiAgZHJhd01pc3NpbGVzKCk7XG5cbiAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG5cbiAgZm9yIChjb25zdCBnIG9mIHN0YXRlUmVmLmdob3N0cykge1xuICAgIGRyYXdTaGlwKGcueCwgZy55LCBnLnZ4LCBnLnZ5LCBcIiM5Y2EzYWZcIiwgZmFsc2UpO1xuICAgIGRyYXdHaG9zdERvdChnLngsIGcueSk7XG4gIH1cbiAgaWYgKHN0YXRlUmVmLm1lKSB7XG4gICAgZHJhd1NoaXAoc3RhdGVSZWYubWUueCwgc3RhdGVSZWYubWUueSwgc3RhdGVSZWYubWUudngsIHN0YXRlUmVmLm1lLnZ5LCBcIiMyMmQzZWVcIiwgdHJ1ZSk7XG4gIH1cbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGxvb3ApO1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmludGVyZmFjZSBIaWdobGlnaHRDb250ZW50T3B0aW9ucyB7XG4gIHRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgc3RlcENvdW50OiBudW1iZXI7XG4gIHNob3dOZXh0OiBib29sZWFuO1xuICBuZXh0TGFiZWw/OiBzdHJpbmc7XG4gIG9uTmV4dD86ICgpID0+IHZvaWQ7XG4gIHNob3dTa2lwOiBib29sZWFuO1xuICBza2lwTGFiZWw/OiBzdHJpbmc7XG4gIG9uU2tpcD86ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGlnaGxpZ2h0ZXIge1xuICBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZDtcbiAgaGlkZSgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJ0dXRvcmlhbC1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVIaWdobGlnaHRlcigpOiBIaWdobGlnaHRlciB7XG4gIGVuc3VyZVN0eWxlcygpO1xuXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheVwiO1xuICBvdmVybGF5LnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBcInBvbGl0ZVwiKTtcblxuICBjb25zdCBzY3JpbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNjcmltLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fc2NyaW1cIjtcblxuICBjb25zdCBoaWdobGlnaHRCb3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoaWdobGlnaHRCb3guY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19oaWdobGlnaHRcIjtcblxuICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdG9vbHRpcC5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXBcIjtcblxuICBjb25zdCBwcm9ncmVzcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHByb2dyZXNzLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3NcIjtcblxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJoM1wiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X190aXRsZVwiO1xuXG4gIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwicFwiKTtcbiAgYm9keS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2JvZHlcIjtcblxuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnNcIjtcblxuICBjb25zdCBza2lwQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgc2tpcEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgc2tpcEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0XCI7XG4gIHNraXBCdG4udGV4dENvbnRlbnQgPSBcIlNraXBcIjtcblxuICBjb25zdCBuZXh0QnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgbmV4dEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgbmV4dEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnlcIjtcbiAgbmV4dEJ0bi50ZXh0Q29udGVudCA9IFwiTmV4dFwiO1xuXG4gIGFjdGlvbnMuYXBwZW5kKHNraXBCdG4sIG5leHRCdG4pO1xuICB0b29sdGlwLmFwcGVuZChwcm9ncmVzcywgdGl0bGUsIGJvZHksIGFjdGlvbnMpO1xuICBvdmVybGF5LmFwcGVuZChzY3JpbSwgaGlnaGxpZ2h0Qm94LCB0b29sdGlwKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICBsZXQgY3VycmVudFRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHJlc2l6ZU9ic2VydmVyOiBSZXNpemVPYnNlcnZlciB8IG51bGwgPSBudWxsO1xuICBsZXQgZnJhbWVIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgb25OZXh0OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IG9uU2tpcDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gc2NoZWR1bGVVcGRhdGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgaWYgKGZyYW1lSGFuZGxlICE9PSBudWxsKSByZXR1cm47XG4gICAgZnJhbWVIYW5kbGUgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICAgIHVwZGF0ZVBvc2l0aW9uKCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVQb3NpdGlvbigpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUpIHJldHVybjtcblxuICAgIGlmIChjdXJyZW50VGFyZ2V0KSB7XG4gICAgICBjb25zdCByZWN0ID0gY3VycmVudFRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IHBhZGRpbmcgPSAxMjtcbiAgICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMCwgcmVjdC53aWR0aCArIHBhZGRpbmcgKiAyKTtcbiAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDAsIHJlY3QuaGVpZ2h0ICsgcGFkZGluZyAqIDIpO1xuICAgICAgY29uc3QgbGVmdCA9IHJlY3QubGVmdCAtIHBhZGRpbmc7XG4gICAgICBjb25zdCB0b3AgPSByZWN0LnRvcCAtIHBhZGRpbmc7XG5cbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQobGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b3ApfXB4KWA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUud2lkdGggPSBgJHtNYXRoLnJvdW5kKHdpZHRoKX1weGA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gYCR7TWF0aC5yb3VuZChoZWlnaHQpfXB4YDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIHRvb2x0aXAuc3R5bGUubWF4V2lkdGggPSBgbWluKDM0MHB4LCAke01hdGgubWF4KDI2MCwgd2luZG93LmlubmVyV2lkdGggLSAzMil9cHgpYDtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBsZXQgdG9vbHRpcFRvcCA9IHJlY3QuYm90dG9tICsgMTg7XG4gICAgICBpZiAodG9vbHRpcFRvcCArIHRvb2x0aXBIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSAyMCkge1xuICAgICAgICB0b29sdGlwVG9wID0gTWF0aC5tYXgoMjAsIHJlY3QudG9wIC0gdG9vbHRpcEhlaWdodCAtIDE4KTtcbiAgICAgIH1cbiAgICAgIGxldCB0b29sdGlwTGVmdCA9IHJlY3QubGVmdCArIHJlY3Qud2lkdGggLyAyIC0gdG9vbHRpcFdpZHRoIC8gMjtcbiAgICAgIHRvb2x0aXBMZWZ0ID0gY2xhbXAodG9vbHRpcExlZnQsIDIwLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCAtIDIwKTtcbiAgICAgIHRvb2x0aXAuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQodG9vbHRpcExlZnQpfXB4LCAke01hdGgucm91bmQodG9vbHRpcFRvcCl9cHgpYDtcbiAgICB9IGVsc2Uge1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS53aWR0aCA9IFwiMHB4XCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gXCIwcHhcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh3aW5kb3cuaW5uZXJXaWR0aCAvIDIpfXB4LCAke01hdGgucm91bmQod2luZG93LmlubmVySGVpZ2h0IC8gMil9cHgpYDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBjb25zdCB0b29sdGlwTGVmdCA9IGNsYW1wKCh3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCkgLyAyLCAyMCwgd2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGggLSAyMCk7XG4gICAgICBjb25zdCB0b29sdGlwVG9wID0gY2xhbXAoKHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQpIC8gMiwgMjAsIHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQgLSAyMCk7XG4gICAgICB0b29sdGlwLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHRvb2x0aXBMZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvb2x0aXBUb3ApfXB4KWA7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKCk6IHZvaWQge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHNjaGVkdWxlVXBkYXRlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycygpOiB2b2lkIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBzY2hlZHVsZVVwZGF0ZSk7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUpO1xuICAgIGlmIChmcmFtZUhhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKGZyYW1lSGFuZGxlKTtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHJlc2l6ZU9ic2VydmVyKSB7XG4gICAgICByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgc2tpcEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBvblNraXA/LigpO1xuICB9KTtcblxuICBuZXh0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIG9uTmV4dD8uKCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIHJlbmRlclRvb2x0aXAob3B0aW9uczogSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCB7IHN0ZXBDb3VudCwgc3RlcEluZGV4LCB0aXRsZTogb3B0aW9uVGl0bGUsIGJvZHk6IG9wdGlvbkJvZHksIHNob3dOZXh0LCBuZXh0TGFiZWwsIHNob3dTa2lwLCBza2lwTGFiZWwgfSA9IG9wdGlvbnM7XG5cbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHN0ZXBDb3VudCkgJiYgc3RlcENvdW50ID4gMCkge1xuICAgICAgcHJvZ3Jlc3MudGV4dENvbnRlbnQgPSBgU3RlcCAke3N0ZXBJbmRleCArIDF9IG9mICR7c3RlcENvdW50fWA7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9ncmVzcy50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvblRpdGxlICYmIG9wdGlvblRpdGxlLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aXRsZS50ZXh0Q29udGVudCA9IG9wdGlvblRpdGxlO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGl0bGUudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIGJvZHkudGV4dENvbnRlbnQgPSBvcHRpb25Cb2R5O1xuXG4gICAgb25OZXh0ID0gc2hvd05leHQgPyBvcHRpb25zLm9uTmV4dCA/PyBudWxsIDogbnVsbDtcbiAgICBpZiAoc2hvd05leHQpIHtcbiAgICAgIG5leHRCdG4udGV4dENvbnRlbnQgPSBuZXh0TGFiZWwgPz8gXCJOZXh0XCI7XG4gICAgICBuZXh0QnRuLnN0eWxlLmRpc3BsYXkgPSBcImlubGluZS1mbGV4XCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHRCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIG9uU2tpcCA9IHNob3dTa2lwID8gb3B0aW9ucy5vblNraXAgPz8gbnVsbCA6IG51bGw7XG4gICAgaWYgKHNob3dTa2lwKSB7XG4gICAgICBza2lwQnRuLnRleHRDb250ZW50ID0gc2tpcExhYmVsID8/IFwiU2tpcFwiO1xuICAgICAgc2tpcEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJpbmxpbmUtZmxleFwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBza2lwQnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IHRydWU7XG4gICAgY3VycmVudFRhcmdldCA9IG9wdGlvbnMudGFyZ2V0ID8/IG51bGw7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICByZW5kZXJUb29sdGlwKG9wdGlvbnMpO1xuICAgIGlmIChyZXNpemVPYnNlcnZlcikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFRhcmdldCAmJiB0eXBlb2YgUmVzaXplT2JzZXJ2ZXIgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHNjaGVkdWxlVXBkYXRlKCkpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShjdXJyZW50VGFyZ2V0KTtcbiAgICB9XG4gICAgYXR0YWNoTGlzdGVuZXJzKCk7XG4gICAgc2NoZWR1bGVVcGRhdGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjtcbiAgICB0b29sdGlwLnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIGRldGFjaExpc3RlbmVycygpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlKCk7XG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2hvdyxcbiAgICBoaWRlLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNUWUxFX0lEKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgc3R5bGUuaWQgPSBTVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLnR1dG9yaWFsLW92ZXJsYXkge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgICB6LWluZGV4OiA1MDtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXkudmlzaWJsZSB7XG4gICAgICBkaXNwbGF5OiBibG9jaztcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3NjcmltIHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGluc2V0OiAwO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9faGlnaGxpZ2h0IHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gICAgICBib3JkZXI6IDJweCBzb2xpZCByZ2JhKDU2LCAxODksIDI0OCwgMC45NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDAgMCAycHggcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjUpLCAwIDAgMjRweCByZ2JhKDM0LCAyMTEsIDIzOCwgMC4yNSk7XG4gICAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC4xOHMgZWFzZSwgd2lkdGggMC4xOHMgZWFzZSwgaGVpZ2h0IDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgbWluLXdpZHRoOiAyNDBweDtcbiAgICAgIG1heC13aWR0aDogbWluKDM0MHB4LCBjYWxjKDEwMHZ3IC0gMzJweCkpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgxNSwgMjMsIDQyLCAwLjk1KTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNnB4O1xuICAgICAgcGFkZGluZzogMTZweCAxOHB4O1xuICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICBib3gtc2hhZG93OiAwIDEycHggMzJweCByZ2JhKDE1LCAyMywgNDIsIDAuNTUpO1xuICAgICAgcG9pbnRlci1ldmVudHM6IGF1dG87XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdmlzaWJpbGl0eTogaGlkZGVuO1xuICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoMHB4LCAwcHgpO1xuICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzIHtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC43NSk7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X190aXRsZSB7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgICBmb250LXNpemU6IDE1cHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wNGVtO1xuICAgICAgY29sb3I6ICNmMWY1Zjk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19ib2R5IHtcbiAgICAgIG1hcmdpbjogMCAwIDE0cHg7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBsaW5lLWhlaWdodDogMS41O1xuICAgICAgY29sb3I6ICNjYmQ1ZjU7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBnYXA6IDEwcHg7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICBwYWRkaW5nOiA2cHggMTRweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDk5OXB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeSB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4yNSk7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjU1KTtcbiAgICAgIGNvbG9yOiAjZjhmYWZjO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5OmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjM1KTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3Qge1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBjb2xvcjogcmdiYSgyMDMsIDIxMywgMjI1LCAwLjkpO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdDpob3ZlciB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMjAzLCAyMTMsIDIyNSwgMC41NSk7XG4gICAgfVxuICAgIEBtZWRpYSAobWF4LXdpZHRoOiA3NjhweCkge1xuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgICBtaW4td2lkdGg6IDIwMHB4O1xuICAgICAgICBtYXgtd2lkdGg6IG1pbigzMjBweCwgY2FsYygxMDB2dyAtIDI0cHgpKTtcbiAgICAgICAgcGFkZGluZzogMTBweCAxMnB4O1xuICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogcm93O1xuICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBnYXA6IDEycHg7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3Mge1xuICAgICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fdGl0bGUge1xuICAgICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYm9keSB7XG4gICAgICAgIG1hcmdpbjogMDtcbiAgICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgICBmbGV4OiAxO1xuICAgICAgICBsaW5lLWhlaWdodDogMS40O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnMge1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgICAgcGFkZGluZzogNXB4IDEwcHg7XG4gICAgICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICAgIH1cbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuIiwgImNvbnN0IFNUT1JBR0VfUFJFRklYID0gXCJsc2Q6dHV0b3JpYWw6XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxQcm9ncmVzcyB7XG4gIHN0ZXBJbmRleDogbnVtYmVyO1xuICBjb21wbGV0ZWQ6IGJvb2xlYW47XG4gIHVwZGF0ZWRBdDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBnZXRTdG9yYWdlKCk6IFN0b3JhZ2UgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIiB8fCAhd2luZG93LmxvY2FsU3RvcmFnZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRQcm9ncmVzcyhpZDogc3RyaW5nKTogVHV0b3JpYWxQcm9ncmVzcyB8IG51bGwge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IHN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX1BSRUZJWCArIGlkKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFR1dG9yaWFsUHJvZ3Jlc3M7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHBhcnNlZCAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQgPT09IG51bGwgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuc3RlcEluZGV4ICE9PSBcIm51bWJlclwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmNvbXBsZXRlZCAhPT0gXCJib29sZWFuXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQudXBkYXRlZEF0ICE9PSBcIm51bWJlclwiXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnNlZDtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVQcm9ncmVzcyhpZDogc3RyaW5nLCBwcm9ncmVzczogVHV0b3JpYWxQcm9ncmVzcyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnNldEl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCwgSlNPTi5zdHJpbmdpZnkocHJvZ3Jlc3MpKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gaWdub3JlIHN0b3JhZ2UgZmFpbHVyZXNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJQcm9ncmVzcyhpZDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2UucmVtb3ZlSXRlbShTVE9SQUdFX1BSRUZJWCArIGlkKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gaWdub3JlIHN0b3JhZ2UgZmFpbHVyZXNcbiAgfVxufVxuIiwgImV4cG9ydCB0eXBlIFJvbGVJZCA9XG4gIHwgXCJjYW52YXNcIlxuICB8IFwic2hpcFNldFwiXG4gIHwgXCJzaGlwU2VsZWN0XCJcbiAgfCBcInNoaXBEZWxldGVcIlxuICB8IFwic2hpcENsZWFyXCJcbiAgfCBcInNoaXBTcGVlZFNsaWRlclwiXG4gIHwgXCJtaXNzaWxlU2V0XCJcbiAgfCBcIm1pc3NpbGVTZWxlY3RcIlxuICB8IFwibWlzc2lsZURlbGV0ZVwiXG4gIHwgXCJtaXNzaWxlU3BlZWRTbGlkZXJcIlxuICB8IFwibWlzc2lsZUFncm9TbGlkZXJcIlxuICB8IFwibWlzc2lsZUFkZFJvdXRlXCJcbiAgfCBcIm1pc3NpbGVMYXVuY2hcIlxuICB8IFwicm91dGVQcmV2XCJcbiAgfCBcInJvdXRlTmV4dFwiXG4gIHwgXCJoZWxwVG9nZ2xlXCJcbiAgfCBcInR1dG9yaWFsU3RhcnRcIlxuICB8IFwic3Bhd25Cb3RcIjtcblxuZXhwb3J0IHR5cGUgUm9sZVJlc29sdmVyID0gKCkgPT4gSFRNTEVsZW1lbnQgfCBudWxsO1xuXG5leHBvcnQgdHlwZSBSb2xlc01hcCA9IFJlY29yZDxSb2xlSWQsIFJvbGVSZXNvbHZlcj47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSb2xlcygpOiBSb2xlc01hcCB7XG4gIHJldHVybiB7XG4gICAgY2FudmFzOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImN2XCIpLFxuICAgIHNoaXBTZXQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZXRcIiksXG4gICAgc2hpcFNlbGVjdDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSxcbiAgICBzaGlwRGVsZXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtZGVsZXRlXCIpLFxuICAgIHNoaXBDbGVhcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNsZWFyXCIpLFxuICAgIHNoaXBTcGVlZFNsaWRlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXNsaWRlclwiKSxcbiAgICBtaXNzaWxlU2V0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2V0XCIpLFxuICAgIG1pc3NpbGVTZWxlY3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZWxlY3RcIiksXG4gICAgbWlzc2lsZURlbGV0ZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWRlbGV0ZVwiKSxcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1zbGlkZXJcIiksXG4gICAgbWlzc2lsZUFncm9TbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXNsaWRlclwiKSxcbiAgICBtaXNzaWxlQWRkUm91dGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIiksXG4gICAgbWlzc2lsZUxhdW5jaDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaFwiKSxcbiAgICByb3V0ZVByZXY6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtcHJldlwiKSxcbiAgICByb3V0ZU5leHQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbmV4dFwiKSxcbiAgICBoZWxwVG9nZ2xlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtdG9nZ2xlXCIpLFxuICAgIHR1dG9yaWFsU3RhcnQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidHV0b3JpYWwtc3RhcnRcIiksXG4gICAgc3Bhd25Cb3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Um9sZUVsZW1lbnQocm9sZXM6IFJvbGVzTWFwLCByb2xlOiBSb2xlSWQgfCBudWxsIHwgdW5kZWZpbmVkKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgaWYgKCFyb2xlKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcmVzb2x2ZXIgPSByb2xlc1tyb2xlXTtcbiAgcmV0dXJuIHJlc29sdmVyID8gcmVzb2x2ZXIoKSA6IG51bGw7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cywgRXZlbnRLZXkgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVIaWdobGlnaHRlciwgdHlwZSBIaWdobGlnaHRlciB9IGZyb20gXCIuL2hpZ2hsaWdodFwiO1xuaW1wb3J0IHsgY2xlYXJQcm9ncmVzcywgbG9hZFByb2dyZXNzLCBzYXZlUHJvZ3Jlc3MgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBnZXRSb2xlRWxlbWVudCwgdHlwZSBSb2xlSWQsIHR5cGUgUm9sZXNNYXAgfSBmcm9tIFwiLi9yb2xlc1wiO1xuXG5leHBvcnQgdHlwZSBTdGVwQWR2YW5jZSA9XG4gIHwge1xuICAgICAga2luZDogXCJldmVudFwiO1xuICAgICAgZXZlbnQ6IEV2ZW50S2V5O1xuICAgICAgd2hlbj86IChwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuO1xuICAgICAgY2hlY2s/OiAoKSA9PiBib29sZWFuO1xuICAgIH1cbiAgfCB7XG4gICAgICBraW5kOiBcIm1hbnVhbFwiO1xuICAgICAgbmV4dExhYmVsPzogc3RyaW5nO1xuICAgIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxTdGVwIHtcbiAgaWQ6IHN0cmluZztcbiAgdGFyZ2V0OiBSb2xlSWQgfCAoKCkgPT4gSFRNTEVsZW1lbnQgfCBudWxsKSB8IG51bGw7XG4gIHRpdGxlPzogc3RyaW5nO1xuICBib2R5OiBzdHJpbmc7XG4gIGFkdmFuY2U6IFN0ZXBBZHZhbmNlO1xuICBvbkVudGVyPzogKCkgPT4gdm9pZDtcbiAgb25FeGl0PzogKCkgPT4gdm9pZDtcbiAgYWxsb3dTa2lwPzogYm9vbGVhbjtcbiAgc2tpcExhYmVsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgRW5naW5lT3B0aW9ucyB7XG4gIGlkOiBzdHJpbmc7XG4gIGJ1czogRXZlbnRCdXM7XG4gIHJvbGVzOiBSb2xlc01hcDtcbiAgc3RlcHM6IFR1dG9yaWFsU3RlcFtdO1xufVxuXG5pbnRlcmZhY2UgU3RhcnRPcHRpb25zIHtcbiAgcmVzdW1lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbEVuZ2luZSB7XG4gIHN0YXJ0KG9wdGlvbnM/OiBTdGFydE9wdGlvbnMpOiB2b2lkO1xuICByZXN0YXJ0KCk6IHZvaWQ7XG4gIHN0b3AoKTogdm9pZDtcbiAgaXNSdW5uaW5nKCk6IGJvb2xlYW47XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVR1dG9yaWFsRW5naW5lKHsgaWQsIGJ1cywgcm9sZXMsIHN0ZXBzIH06IEVuZ2luZU9wdGlvbnMpOiBUdXRvcmlhbEVuZ2luZSB7XG4gIGNvbnN0IGhpZ2hsaWdodGVyOiBIaWdobGlnaHRlciA9IGNyZWF0ZUhpZ2hsaWdodGVyKCk7XG4gIGxldCBydW5uaW5nID0gZmFsc2U7XG4gIGxldCBwYXVzZWQgPSBmYWxzZTtcbiAgbGV0IGN1cnJlbnRJbmRleCA9IC0xO1xuICBsZXQgY3VycmVudFN0ZXA6IFR1dG9yaWFsU3RlcCB8IG51bGwgPSBudWxsO1xuICBsZXQgY2xlYW51cEN1cnJlbnQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgcmVuZGVyQ3VycmVudDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBmYWxzZTtcbiAgbGV0IHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuXG4gIGNvbnN0IHBlcnNpc3RlbnRMaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cbiAgcGVyc2lzdGVudExpc3RlbmVycy5wdXNoKFxuICAgIGJ1cy5vbihcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgKHsgdmlzaWJsZSB9KSA9PiB7XG4gICAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICAgIHBhdXNlZCA9IEJvb2xlYW4odmlzaWJsZSk7XG4gICAgICBpZiAocGF1c2VkKSB7XG4gICAgICAgIGhpZ2hsaWdodGVyLmhpZGUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlbmRlckN1cnJlbnQ/LigpO1xuICAgICAgfVxuICAgIH0pLFxuICApO1xuXG4gIGZ1bmN0aW9uIHJlc29sdmVUYXJnZXQoc3RlcDogVHV0b3JpYWxTdGVwKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgICBpZiAoIXN0ZXAudGFyZ2V0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBzdGVwLnRhcmdldCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICByZXR1cm4gc3RlcC50YXJnZXQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGdldFJvbGVFbGVtZW50KHJvbGVzLCBzdGVwLnRhcmdldCk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGFtcEluZGV4KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHJldHVybiAwO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGluZGV4KSB8fCBpbmRleCA8IDApIHJldHVybiAwO1xuICAgIGlmIChpbmRleCA+PSBzdGVwcy5sZW5ndGgpIHJldHVybiBzdGVwcy5sZW5ndGggLSAxO1xuICAgIHJldHVybiBNYXRoLmZsb29yKGluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFN0ZXAoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSBzdGVwcy5sZW5ndGgpIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnRTdGVwKSB7XG4gICAgICBjdXJyZW50U3RlcC5vbkV4aXQ/LigpO1xuICAgICAgY3VycmVudFN0ZXAgPSBudWxsO1xuICAgIH1cblxuICAgIGN1cnJlbnRJbmRleCA9IGluZGV4O1xuICAgIGNvbnN0IHN0ZXAgPSBzdGVwc1tpbmRleF07XG4gICAgY3VycmVudFN0ZXAgPSBzdGVwO1xuXG4gICAgcGVyc2lzdFByb2dyZXNzKGluZGV4LCBmYWxzZSk7XG5cbiAgICBidXMuZW1pdChcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCIsIHsgaWQsIHN0ZXBJbmRleDogaW5kZXgsIHRvdGFsOiBzdGVwcy5sZW5ndGggfSk7XG4gICAgc3RlcC5vbkVudGVyPy4oKTtcblxuICAgIGNvbnN0IGFsbG93U2tpcCA9IHN0ZXAuYWxsb3dTa2lwICE9PSBmYWxzZTtcbiAgICBjb25zdCByZW5kZXIgPSAoKTogdm9pZCA9PiB7XG4gICAgICBpZiAoIXJ1bm5pbmcgfHwgcGF1c2VkKSByZXR1cm47XG4gICAgICBoaWdobGlnaHRlci5zaG93KHtcbiAgICAgICAgdGFyZ2V0OiByZXNvbHZlVGFyZ2V0KHN0ZXApLFxuICAgICAgICB0aXRsZTogc3RlcC50aXRsZSxcbiAgICAgICAgYm9keTogc3RlcC5ib2R5LFxuICAgICAgICBzdGVwSW5kZXg6IGluZGV4LFxuICAgICAgICBzdGVwQ291bnQ6IHN0ZXBzLmxlbmd0aCxcbiAgICAgICAgc2hvd05leHQ6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiLFxuICAgICAgICBuZXh0TGFiZWw6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiXG4gICAgICAgICAgPyBzdGVwLmFkdmFuY2UubmV4dExhYmVsID8/IChpbmRleCA9PT0gc3RlcHMubGVuZ3RoIC0gMSA/IFwiRmluaXNoXCIgOiBcIk5leHRcIilcbiAgICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgICAgb25OZXh0OiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIiA/IGFkdmFuY2VTdGVwIDogdW5kZWZpbmVkLFxuICAgICAgICBzaG93U2tpcDogYWxsb3dTa2lwLFxuICAgICAgICBza2lwTGFiZWw6IHN0ZXAuc2tpcExhYmVsLFxuICAgICAgICBvblNraXA6IGFsbG93U2tpcCA/IHNraXBDdXJyZW50U3RlcCA6IHVuZGVmaW5lZCxcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICByZW5kZXJDdXJyZW50ID0gcmVuZGVyO1xuICAgIHJlbmRlcigpO1xuXG4gICAgaWYgKHN0ZXAuYWR2YW5jZS5raW5kID09PSBcImV2ZW50XCIpIHtcbiAgICAgIGNvbnN0IGhhbmRsZXIgPSAocGF5bG9hZDogdW5rbm93bik6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoIXJ1bm5pbmcgfHwgcGF1c2VkKSByZXR1cm47XG4gICAgICAgIGlmIChzdGVwLmFkdmFuY2Uud2hlbiAmJiAhc3RlcC5hZHZhbmNlLndoZW4ocGF5bG9hZCkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgYWR2YW5jZVRvKGluZGV4ICsgMSk7XG4gICAgICB9O1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBidXMub24oc3RlcC5hZHZhbmNlLmV2ZW50LCBoYW5kbGVyIGFzICh2YWx1ZTogbmV2ZXIpID0+IHZvaWQpO1xuICAgICAgaWYgKHN0ZXAuYWR2YW5jZS5jaGVjayAmJiBzdGVwLmFkdmFuY2UuY2hlY2soKSkge1xuICAgICAgICBoYW5kbGVyKHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlVG8obmV4dEluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG4gICAgcmVuZGVyQ3VycmVudCA9IG51bGw7XG4gICAgaWYgKG5leHRJbmRleCA+PSBzdGVwcy5sZW5ndGgpIHtcbiAgICAgIGNvbXBsZXRlVHV0b3JpYWwoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0U3RlcChuZXh0SW5kZXgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGFkdmFuY2VTdGVwKCk6IHZvaWQge1xuICAgIGFkdmFuY2VUbyhjdXJyZW50SW5kZXggKyAxKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNraXBDdXJyZW50U3RlcCgpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBjb25zdCBuZXh0SW5kZXggPSBjdXJyZW50SW5kZXggPj0gMCA/IGN1cnJlbnRJbmRleCArIDEgOiAwO1xuICAgIGFkdmFuY2VUbyhuZXh0SW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gY29tcGxldGVUdXRvcmlhbCgpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSB0cnVlO1xuICAgIHBlcnNpc3RQcm9ncmVzcyhzdGVwcy5sZW5ndGgsIHRydWUpO1xuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6Y29tcGxldGVkXCIsIHsgaWQgfSk7XG4gICAgc3RvcCgpO1xuICAgIHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnQob3B0aW9ucz86IFN0YXJ0T3B0aW9ucyk6IHZvaWQge1xuICAgIGNvbnN0IHJlc3VtZSA9IG9wdGlvbnM/LnJlc3VtZSAhPT0gZmFsc2U7XG4gICAgaWYgKHJ1bm5pbmcpIHtcbiAgICAgIHJlc3RhcnQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBydW5uaW5nID0gdHJ1ZTtcbiAgICBwYXVzZWQgPSBmYWxzZTtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcbiAgICBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBmYWxzZTtcbiAgICBsZXQgc3RhcnRJbmRleCA9IDA7XG4gICAgaWYgKHJlc3VtZSkge1xuICAgICAgY29uc3QgcHJvZ3Jlc3MgPSBsb2FkUHJvZ3Jlc3MoaWQpO1xuICAgICAgaWYgKHByb2dyZXNzICYmICFwcm9ncmVzcy5jb21wbGV0ZWQpIHtcbiAgICAgICAgc3RhcnRJbmRleCA9IGNsYW1wSW5kZXgocHJvZ3Jlc3Muc3RlcEluZGV4KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2xlYXJQcm9ncmVzcyhpZCk7XG4gICAgfVxuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6c3RhcnRlZFwiLCB7IGlkIH0pO1xuICAgIHNldFN0ZXAoc3RhcnRJbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiByZXN0YXJ0KCk6IHZvaWQge1xuICAgIHN0b3AoKTtcbiAgICBzdGFydCh7IHJlc3VtZTogZmFsc2UgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzdG9wKCk6IHZvaWQge1xuICAgIGNvbnN0IHNob3VsZFBlcnNpc3QgPSAhc3VwcHJlc3NQZXJzaXN0T25TdG9wICYmIHJ1bm5pbmcgJiYgIWxhc3RTYXZlZENvbXBsZXRlZCAmJiBjdXJyZW50SW5kZXggPj0gMCAmJiBjdXJyZW50SW5kZXggPCBzdGVwcy5sZW5ndGg7XG4gICAgY29uc3QgaW5kZXhUb1BlcnNpc3QgPSBjdXJyZW50SW5kZXg7XG5cbiAgICBpZiAoY2xlYW51cEN1cnJlbnQpIHtcbiAgICAgIGNsZWFudXBDdXJyZW50KCk7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHNob3VsZFBlcnNpc3QpIHtcbiAgICAgIHBlcnNpc3RQcm9ncmVzcyhpbmRleFRvUGVyc2lzdCwgZmFsc2UpO1xuICAgIH1cbiAgICBydW5uaW5nID0gZmFsc2U7XG4gICAgcGF1c2VkID0gZmFsc2U7XG4gICAgY3VycmVudEluZGV4ID0gLTE7XG4gICAgcmVuZGVyQ3VycmVudCA9IG51bGw7XG4gICAgaGlnaGxpZ2h0ZXIuaGlkZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNSdW5uaW5nKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBydW5uaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBzdG9wKCk7XG4gICAgZm9yIChjb25zdCBkaXNwb3NlIG9mIHBlcnNpc3RlbnRMaXN0ZW5lcnMpIHtcbiAgICAgIGRpc3Bvc2UoKTtcbiAgICB9XG4gICAgaGlnaGxpZ2h0ZXIuZGVzdHJveSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGVyc2lzdFByb2dyZXNzKHN0ZXBJbmRleDogbnVtYmVyLCBjb21wbGV0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBsYXN0U2F2ZWRDb21wbGV0ZWQgPSBjb21wbGV0ZWQ7XG4gICAgc2F2ZVByb2dyZXNzKGlkLCB7XG4gICAgICBzdGVwSW5kZXgsXG4gICAgICBjb21wbGV0ZWQsXG4gICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHN0YXJ0LFxuICAgIHJlc3RhcnQsXG4gICAgc3RvcCxcbiAgICBpc1J1bm5pbmcsXG4gICAgZGVzdHJveSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFR1dG9yaWFsU3RlcCB9IGZyb20gXCIuL2VuZ2luZVwiO1xuXG5mdW5jdGlvbiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkOiB1bmtub3duLCBtaW5JbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGluZGV4ID0gKHBheWxvYWQgYXMgeyBpbmRleD86IHVua25vd24gfSkuaW5kZXg7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09IFwibnVtYmVyXCIgfHwgIU51bWJlci5pc0Zpbml0ZShpbmRleCkpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGluZGV4ID49IG1pbkluZGV4O1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Um91dGVJZChwYXlsb2FkOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgcm91dGVJZCA9IChwYXlsb2FkIGFzIHsgcm91dGVJZD86IHVua25vd24gfSkucm91dGVJZDtcbiAgcmV0dXJuIHR5cGVvZiByb3V0ZUlkID09PSBcInN0cmluZ1wiID8gcm91dGVJZCA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIHBheWxvYWRUb29sRXF1YWxzKHRhcmdldDogc3RyaW5nKTogKHBheWxvYWQ6IHVua25vd24pID0+IGJvb2xlYW4ge1xuICByZXR1cm4gKHBheWxvYWQ6IHVua25vd24pOiBib29sZWFuID0+IHtcbiAgICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHRvb2wgPSAocGF5bG9hZCBhcyB7IHRvb2w/OiB1bmtub3duIH0pLnRvb2w7XG4gICAgcmV0dXJuIHR5cGVvZiB0b29sID09PSBcInN0cmluZ1wiICYmIHRvb2wgPT09IHRhcmdldDtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJhc2ljVHV0b3JpYWxTdGVwcygpOiBUdXRvcmlhbFN0ZXBbXSB7XG4gIGxldCByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA9IDA7XG4gIGxldCBpbml0aWFsUm91dGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBuZXdSb3V0ZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICByZXR1cm4gW1xuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtcGxvdC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCBhIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkNsaWNrIG9uIHRoZSBtYXAgdG8gZHJvcCBhdCBsZWFzdCB0aHJlZSB3YXlwb2ludHMgYW5kIHNrZXRjaCB5b3VyIGNvdXJzZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IGhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDIpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtY2hhbmdlLXNwZWVkXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcFNwZWVkU2xpZGVyXCIsXG4gICAgICB0aXRsZTogXCJBZGp1c3Qgc2hpcCBzcGVlZFwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIFNoaXAgU3BlZWQgc2xpZGVyIChvciBwcmVzcyBbIC8gXSkgdG8gZmluZS10dW5lIHlvdXIgdHJhdmVsIHNwZWVkLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6c3BlZWRDaGFuZ2VkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1zZWxlY3QtbGVnXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcFNlbGVjdFwiLFxuICAgICAgdGl0bGU6IFwiU2VsZWN0IGEgcm91dGUgbGVnXCIsXG4gICAgICBib2R5OiBcIlN3aXRjaCB0byBTZWxlY3QgbW9kZSAoVCBrZXkpIGFuZCB0aGVuIGNsaWNrIGEgd2F5cG9pbnQgb24gdGhlIG1hcCB0byBoaWdobGlnaHQgaXRzIGxlZy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOmxlZ1NlbGVjdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAwKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWRlbGV0ZS1sZWdcIixcbiAgICAgIHRhcmdldDogXCJzaGlwRGVsZXRlXCIsXG4gICAgICB0aXRsZTogXCJEZWxldGUgYSByb3V0ZSBsZWdcIixcbiAgICAgIGJvZHk6IFwiUmVtb3ZlIHRoZSBzZWxlY3RlZCB3YXlwb2ludCB1c2luZyB0aGUgRGVsZXRlIGNvbnRyb2wgb3IgdGhlIERlbGV0ZSBrZXkuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDp3YXlwb2ludERlbGV0ZWRcIixcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWNsZWFyLXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcENsZWFyXCIsXG4gICAgICB0aXRsZTogXCJDbGVhciB0aGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiQ2xlYXIgcmVtYWluaW5nIHdheXBvaW50cyB0byByZXNldCB5b3VyIHBsb3R0ZWQgY291cnNlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6Y2xlYXJJbnZva2VkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1zZXQtbW9kZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVTZXRcIixcbiAgICAgIHRpdGxlOiBcIlN3aXRjaCB0byBtaXNzaWxlIHBsYW5uaW5nXCIsXG4gICAgICBib2R5OiBcIlRhcCBTZXQgc28gZXZlcnkgY2xpY2sgZHJvcHMgbWlzc2lsZSB3YXlwb2ludHMgb24gdGhlIGFjdGl2ZSByb3V0ZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOnRvb2xDaGFuZ2VkXCIsXG4gICAgICAgIHdoZW46IHBheWxvYWRUb29sRXF1YWxzKFwic2V0XCIpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtcGxvdC1pbml0aWFsXCIsXG4gICAgICB0YXJnZXQ6IFwiY2FudmFzXCIsXG4gICAgICB0aXRsZTogXCJQbG90IG1pc3NpbGUgd2F5cG9pbnRzXCIsXG4gICAgICBib2R5OiBcIkNsaWNrIHRoZSBtYXAgdG8gZHJvcCBhdCBsZWFzdCB0d28gZ3VpZGFuY2UgcG9pbnRzIGZvciB0aGUgY3VycmVudCBtaXNzaWxlIHJvdXRlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGlmICghaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKHJvdXRlSWQpIHtcbiAgICAgICAgICAgIGluaXRpYWxSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtaW5pdGlhbFwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCB0aGUgc3RyaWtlXCIsXG4gICAgICBib2R5OiBcIlNlbmQgdGhlIHBsYW5uZWQgbWlzc2lsZSByb3V0ZSBsaXZlIHdpdGggdGhlIExhdW5jaCBjb250cm9sIChMIGtleSkuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkKSB7XG4gICAgICAgICAgICBpbml0aWFsUm91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtYWRkLXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUFkZFJvdXRlXCIsXG4gICAgICB0aXRsZTogXCJDcmVhdGUgYSBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJQcmVzcyBOZXcgdG8gYWRkIGEgc2Vjb25kIG1pc3NpbGUgcm91dGUgZm9yIGFub3RoZXIgc3RyaWtlIGdyb3VwLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6cm91dGVBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIXJvdXRlSWQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBuZXdSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXBsb3QtbmV3LXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwiY2FudmFzXCIsXG4gICAgICB0aXRsZTogXCJQbG90IHRoZSBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJEcm9wIGF0IGxlYXN0IHR3byB3YXlwb2ludHMgb24gdGhlIG5ldyByb3V0ZSB0byBkZWZpbmUgaXRzIHBhdGguXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgaWYgKCFoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAxKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAobmV3Um91dGVJZCAmJiByb3V0ZUlkICYmIHJvdXRlSWQgIT09IG5ld1JvdXRlSWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFuZXdSb3V0ZUlkICYmIHJvdXRlSWQpIHtcbiAgICAgICAgICAgIG5ld1JvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1uZXctcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggdGhlIG5ldyByb3V0ZVwiLFxuICAgICAgYm9keTogXCJMYXVuY2ggdGhlIGZyZXNoIG1pc3NpbGUgcm91dGUgdG8gY29uZmlybSBpdHMgcGF0dGVybi5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIW5ld1JvdXRlSWQgfHwgIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBuZXdSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtc3dpdGNoLXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwicm91dGVOZXh0XCIsXG4gICAgICB0aXRsZTogXCJTd2l0Y2ggYmFjayB0byB0aGUgb3JpZ2luYWwgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBcdTI1QzAgXHUyNUI2IGNvbnRyb2xzIChvciBUYWIvU2hpZnQrVGFiKSB0byBzZWxlY3QgeW91ciBmaXJzdCBtaXNzaWxlIHJvdXRlIGFnYWluLlwiLFxuICAgICAgb25FbnRlcjogKCkgPT4ge1xuICAgICAgICByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA9IDA7XG4gICAgICB9LFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgKz0gMTtcbiAgICAgICAgICBpZiAocm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPCAxKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQgfHwgIXJvdXRlSWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gaW5pdGlhbFJvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtYWZ0ZXItc3dpdGNoXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIGZyb20gdGhlIG90aGVyIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkZpcmUgdGhlIG9yaWdpbmFsIG1pc3NpbGUgcm91dGUgdG8gcHJhY3RpY2Ugcm91bmQtcm9iaW4gc3RyaWtlcy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkIHx8ICFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gaW5pdGlhbFJvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwidHV0b3JpYWwtcHJhY3RpY2VcIixcbiAgICAgIHRhcmdldDogXCJzcGF3bkJvdFwiLFxuICAgICAgdGl0bGU6IFwiU3Bhd24gYSBwcmFjdGljZSBib3RcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBCb3QgY29udHJvbCB0byBhZGQgYSB0YXJnZXQgYW5kIHJlaGVhcnNlIHRoZXNlIG1hbmV1dmVycyBpbiByZWFsIHRpbWUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiYm90OnNwYXduUmVxdWVzdGVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInR1dG9yaWFsLWNvbXBsZXRlXCIsXG4gICAgICB0YXJnZXQ6IG51bGwsXG4gICAgICB0aXRsZTogXCJZb3VcdTIwMTlyZSByZWFkeVwiLFxuICAgICAgYm9keTogXCJHcmVhdCB3b3JrLiBSZWxvYWQgdGhlIGNvbnNvbGUgb3IgcmVqb2luIGEgcm9vbSB0byByZXZpc2l0IHRoZXNlIGRyaWxscy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJtYW51YWxcIixcbiAgICAgICAgbmV4dExhYmVsOiBcIkZpbmlzaFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgXTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlVHV0b3JpYWxFbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IGNyZWF0ZVJvbGVzIH0gZnJvbSBcIi4vcm9sZXNcIjtcbmltcG9ydCB7IGdldEJhc2ljVHV0b3JpYWxTdGVwcyB9IGZyb20gXCIuL3N0ZXBzX2Jhc2ljXCI7XG5leHBvcnQgY29uc3QgQkFTSUNfVFVUT1JJQUxfSUQgPSBcInNoaXAtYmFzaWNzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxDb250cm9sbGVyIHtcbiAgc3RhcnQob3B0aW9ucz86IHsgcmVzdW1lPzogYm9vbGVhbiB9KTogdm9pZDtcbiAgcmVzdGFydCgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3VudFR1dG9yaWFsKGJ1czogRXZlbnRCdXMpOiBUdXRvcmlhbENvbnRyb2xsZXIge1xuICBjb25zdCByb2xlcyA9IGNyZWF0ZVJvbGVzKCk7XG4gIGNvbnN0IGVuZ2luZSA9IGNyZWF0ZVR1dG9yaWFsRW5naW5lKHtcbiAgICBpZDogQkFTSUNfVFVUT1JJQUxfSUQsXG4gICAgYnVzLFxuICAgIHJvbGVzLFxuICAgIHN0ZXBzOiBnZXRCYXNpY1R1dG9yaWFsU3RlcHMoKSxcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydChvcHRpb25zKSB7XG4gICAgICBlbmdpbmUuc3RhcnQob3B0aW9ucyk7XG4gICAgfSxcbiAgICByZXN0YXJ0KCkge1xuICAgICAgZW5naW5lLnJlc3RhcnQoKTtcbiAgICB9LFxuICAgIGRlc3Ryb3koKSB7XG4gICAgICBlbmdpbmUuZGVzdHJveSgpO1xuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi4vc3RhdGVcIjtcblxuZXhwb3J0IGludGVyZmFjZSBEaWFsb2d1ZUNob2ljZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaWFsb2d1ZUNvbnRlbnQge1xuICBzcGVha2VyOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbiAgaW50ZW50PzogXCJmYWN0b3J5XCIgfCBcInVuaXRcIjtcbiAgY2hvaWNlcz86IERpYWxvZ3VlQ2hvaWNlW107XG4gIHR5cGluZ1NwZWVkTXM/OiBudW1iZXI7XG4gIG9uQ2hvaWNlPzogKGNob2ljZUlkOiBzdHJpbmcpID0+IHZvaWQ7XG4gIG9uVGV4dEZ1bGx5UmVuZGVyZWQ/OiAoKSA9PiB2b2lkO1xuICBvbkNvbnRpbnVlPzogKCkgPT4gdm9pZDtcbiAgY29udGludWVMYWJlbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaWFsb2d1ZU92ZXJsYXkge1xuICBzaG93KGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQ7XG4gIGhpZGUoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICBpc1Zpc2libGUoKTogYm9vbGVhbjtcbn1cblxuY29uc3QgU1RZTEVfSUQgPSBcImRpYWxvZ3VlLW92ZXJsYXktc3R5bGVcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSgpOiBEaWFsb2d1ZU92ZXJsYXkge1xuICBlbnN1cmVTdHlsZXMoKTtcblxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgb3ZlcmxheS5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLW92ZXJsYXlcIjtcbiAgb3ZlcmxheS5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxpdmVcIiwgXCJwb2xpdGVcIik7XG5cbiAgY29uc3QgY29uc29sZUZyYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgY29uc29sZUZyYW1lLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY29uc29sZVwiO1xuXG4gIGNvbnN0IHNwZWFrZXJMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNwZWFrZXJMYWJlbC5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLXNwZWFrZXJcIjtcblxuICBjb25zdCB0ZXh0QmxvY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0ZXh0QmxvY2suY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS10ZXh0XCI7XG5cbiAgY29uc3QgY3Vyc29yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIGN1cnNvci5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWN1cnNvclwiO1xuICBjdXJzb3IudGV4dENvbnRlbnQgPSBcIl9cIjtcblxuICBjb25zdCBjaG9pY2VzTGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ1bFwiKTtcbiAgY2hvaWNlc0xpc3QuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jaG9pY2VzIGhpZGRlblwiO1xuXG4gIGNvbnN0IGNvbnRpbnVlQnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgY29udGludWVCdXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGNvbnRpbnVlQnV0dG9uLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY29udGludWUgaGlkZGVuXCI7XG4gIGNvbnRpbnVlQnV0dG9uLnRleHRDb250ZW50ID0gXCJDb250aW51ZVwiO1xuXG4gIHRleHRCbG9jay5hcHBlbmQoY3Vyc29yKTtcbiAgY29uc29sZUZyYW1lLmFwcGVuZChzcGVha2VyTGFiZWwsIHRleHRCbG9jaywgY2hvaWNlc0xpc3QsIGNvbnRpbnVlQnV0dG9uKTtcbiAgb3ZlcmxheS5hcHBlbmQoY29uc29sZUZyYW1lKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICBsZXQgdmlzaWJsZSA9IGZhbHNlO1xuICBsZXQgdHlwaW5nSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IHRhcmdldFRleHQgPSBcIlwiO1xuICBsZXQgcmVuZGVyZWRDaGFycyA9IDA7XG4gIGxldCBhY3RpdmVDb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBjbGVhclR5cGluZygpOiB2b2lkIHtcbiAgICBpZiAodHlwaW5nSGFuZGxlICE9PSBudWxsKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHR5cGluZ0hhbmRsZSk7XG4gICAgICB0eXBpbmdIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmlzaFR5cGluZyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICByZW5kZXJlZENoYXJzID0gdGFyZ2V0VGV4dC5sZW5ndGg7XG4gICAgdXBkYXRlVGV4dCgpO1xuICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgY29udGVudC5vblRleHRGdWxseVJlbmRlcmVkPy4oKTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSB8fCBjb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBzaG93Q29udGludWUoY29udGVudCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlVGV4dCgpOiB2b2lkIHtcbiAgICBjb25zdCB0ZXh0VG9TaG93ID0gdGFyZ2V0VGV4dC5zbGljZSgwLCByZW5kZXJlZENoYXJzKTtcbiAgICB0ZXh0QmxvY2suaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjb25zdCB0ZXh0Tm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgIHRleHROb2RlLnRleHRDb250ZW50ID0gdGV4dFRvU2hvdztcbiAgICB0ZXh0QmxvY2suYXBwZW5kKHRleHROb2RlLCBjdXJzb3IpO1xuICAgIGN1cnNvci5jbGFzc0xpc3QudG9nZ2xlKFwiaGlkZGVuXCIsICF2aXNpYmxlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlckNob2ljZXMoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgY2hvaWNlc0xpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjb25zdCBjaG9pY2VzID0gQXJyYXkuaXNBcnJheShjb250ZW50LmNob2ljZXMpID8gY29udGVudC5jaG9pY2VzIDogW107XG4gICAgaWYgKGNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIGNob2ljZXMuZm9yRWFjaCgoY2hvaWNlLCBpbmRleCkgPT4ge1xuICAgICAgY29uc3QgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsaVwiKTtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICBidXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgICBidXR0b24uZGF0YXNldC5jaG9pY2VJZCA9IGNob2ljZS5pZDtcbiAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9IGAke2luZGV4ICsgMX0uICR7Y2hvaWNlLnRleHR9YDtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgICBjb250ZW50Lm9uQ2hvaWNlPy4oY2hvaWNlLmlkKTtcbiAgICAgIH0pO1xuICAgICAgaXRlbS5hcHBlbmQoYnV0dG9uKTtcbiAgICAgIGNob2ljZXNMaXN0LmFwcGVuZChpdGVtKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3dDb250aW51ZShjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBpZiAoIWNvbnRlbnQub25Db250aW51ZSkge1xuICAgICAgY29udGludWVCdXR0b24uY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSBudWxsO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb250aW51ZUJ1dHRvbi50ZXh0Q29udGVudCA9IGNvbnRlbnQuY29udGludWVMYWJlbCA/PyBcIkNvbnRpbnVlXCI7XG4gICAgY29udGludWVCdXR0b24uY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gKCkgPT4ge1xuICAgICAgY29udGVudC5vbkNvbnRpbnVlPy4oKTtcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gc2NoZWR1bGVUeXBlKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgY29uc3QgdHlwaW5nU3BlZWQgPSBjbGFtcChOdW1iZXIoY29udGVudC50eXBpbmdTcGVlZE1zKSB8fCAxOCwgOCwgNjQpO1xuICAgIGNvbnN0IHRpY2sgPSAoKTogdm9pZCA9PiB7XG4gICAgICByZW5kZXJlZENoYXJzID0gTWF0aC5taW4ocmVuZGVyZWRDaGFycyArIDEsIHRhcmdldFRleHQubGVuZ3RoKTtcbiAgICAgIHVwZGF0ZVRleHQoKTtcbiAgICAgIGlmIChyZW5kZXJlZENoYXJzID49IHRhcmdldFRleHQubGVuZ3RoKSB7XG4gICAgICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgICAgIGNvbnRlbnQub25UZXh0RnVsbHlSZW5kZXJlZD8uKCk7XG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShjb250ZW50LmNob2ljZXMpIHx8IGNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBzaG93Q29udGludWUoY29udGVudCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHR5cGluZ0hhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KHRpY2ssIHR5cGluZ1NwZWVkKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHR5cGluZ0hhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KHRpY2ssIHR5cGluZ1NwZWVkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUgfHwgIWFjdGl2ZUNvbnRlbnQpIHJldHVybjtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYWN0aXZlQ29udGVudC5jaG9pY2VzKSB8fCBhY3RpdmVDb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBpZiAoZXZlbnQua2V5ID09PSBcIiBcIiB8fCBldmVudC5rZXkgPT09IFwiRW50ZXJcIikge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBpZiAocmVuZGVyZWRDaGFycyA8IHRhcmdldFRleHQubGVuZ3RoKSB7XG4gICAgICAgICAgZmluaXNoVHlwaW5nKGFjdGl2ZUNvbnRlbnQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFjdGl2ZUNvbnRlbnQub25Db250aW51ZT8uKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaW5kZXggPSBwYXJzZUludChldmVudC5rZXksIDEwKTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKGluZGV4KSAmJiBpbmRleCA+PSAxICYmIGluZGV4IDw9IGFjdGl2ZUNvbnRlbnQuY2hvaWNlcy5sZW5ndGgpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBjaG9pY2UgPSBhY3RpdmVDb250ZW50LmNob2ljZXNbaW5kZXggLSAxXTtcbiAgICAgIGFjdGl2ZUNvbnRlbnQub25DaG9pY2U/LihjaG9pY2UuaWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIgJiYgcmVuZGVyZWRDaGFycyA8IHRhcmdldFRleHQubGVuZ3RoKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZmluaXNoVHlwaW5nKGFjdGl2ZUNvbnRlbnQpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3coY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgYWN0aXZlQ29udGVudCA9IGNvbnRlbnQ7XG4gICAgdmlzaWJsZSA9IHRydWU7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICBvdmVybGF5LmRhdGFzZXQuaW50ZW50ID0gY29udGVudC5pbnRlbnQgPz8gXCJmYWN0b3J5XCI7XG4gICAgc3BlYWtlckxhYmVsLnRleHRDb250ZW50ID0gY29udGVudC5zcGVha2VyO1xuXG4gICAgdGFyZ2V0VGV4dCA9IGNvbnRlbnQudGV4dDtcbiAgICByZW5kZXJlZENoYXJzID0gMDtcbiAgICB1cGRhdGVUZXh0KCk7XG4gICAgcmVuZGVyQ2hvaWNlcyhjb250ZW50KTtcbiAgICBzaG93Q29udGludWUoY29udGVudCk7XG4gICAgc2NoZWR1bGVUeXBlKGNvbnRlbnQpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGlkZSgpOiB2b2lkIHtcbiAgICB2aXNpYmxlID0gZmFsc2U7XG4gICAgYWN0aXZlQ29udGVudCA9IG51bGw7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIHRhcmdldFRleHQgPSBcIlwiO1xuICAgIHJlbmRlcmVkQ2hhcnMgPSAwO1xuICAgIHRleHRCbG9jay5pbm5lckhUTUwgPSBcIlwiO1xuICAgIHRleHRCbG9jay5hcHBlbmQoY3Vyc29yKTtcbiAgICBjaG9pY2VzTGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24uY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gbnVsbDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgaGlkZSgpO1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleURvd24pO1xuICAgIG92ZXJsYXkucmVtb3ZlKCk7XG4gIH1cblxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duKTtcblxuICByZXR1cm4ge1xuICAgIHNob3csXG4gICAgaGlkZSxcbiAgICBkZXN0cm95LFxuICAgIGlzVmlzaWJsZSgpIHtcbiAgICAgIHJldHVybiB2aXNpYmxlO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNUWUxFX0lEKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgc3R5bGUuaWQgPSBTVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLmRpYWxvZ3VlLW92ZXJsYXkge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gICAgICB6LWluZGV4OiA2MDtcbiAgICAgIG9wYWNpdHk6IDA7XG4gICAgICB0cmFuc2l0aW9uOiBvcGFjaXR5IDAuMnMgZWFzZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXkudmlzaWJsZSB7XG4gICAgICBvcGFjaXR5OiAxO1xuICAgICAgcG9pbnRlci1ldmVudHM6IGF1dG87XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIG1pbi13aWR0aDogMzIwcHg7XG4gICAgICBtYXgtd2lkdGg6IG1pbig1MjBweCwgY2FsYygxMDB2dyAtIDQ4cHgpKTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNiwgMTEsIDE2LCAwLjkyKTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBib3JkZXItcmFkaXVzOiAxMnB4O1xuICAgICAgcGFkZGluZzogMThweCAyMHB4O1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBnYXA6IDE0cHg7XG4gICAgICBib3gtc2hhZG93OiAwIDI4cHggNjRweCByZ2JhKDIsIDYsIDE2LCAwLjYpO1xuICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICBmb250LWZhbWlseTogXCJJQk0gUGxleCBNb25vXCIsIFwiSmV0QnJhaW5zIE1vbm9cIiwgdWktbW9ub3NwYWNlLCBTRk1vbm8tUmVndWxhciwgTWVubG8sIE1vbmFjbywgQ29uc29sYXMsIFwiTGliZXJhdGlvbiBNb25vXCIsIFwiQ291cmllciBOZXdcIiwgbW9ub3NwYWNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheVtkYXRhLWludGVudD1cImZhY3RvcnlcIl0gLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC40NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDI4cHggNjRweCByZ2JhKDEzLCAxNDgsIDEzNiwgMC4zNSk7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5W2RhdGEtaW50ZW50PVwidW5pdFwiXSAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMjQ0LCAxMTQsIDE4MiwgMC40NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDI4cHggNjRweCByZ2JhKDIzNiwgNzIsIDE1MywgMC4yOCk7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1zcGVha2VyIHtcbiAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjE2ZW07XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC43NSk7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS10ZXh0IHtcbiAgICAgIG1pbi1oZWlnaHQ6IDkwcHg7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBsaW5lLWhlaWdodDogMS41NTtcbiAgICAgIHdoaXRlLXNwYWNlOiBwcmUtd3JhcDtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWN1cnNvciB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgICBtYXJnaW4tbGVmdDogNHB4O1xuICAgICAgYW5pbWF0aW9uOiBkaWFsb2d1ZS1jdXJzb3ItYmxpbmsgMS4ycyBzdGVwcygyLCBzdGFydCkgaW5maW5pdGU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jdXJzb3IuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIHtcbiAgICAgIGxpc3Qtc3R5bGU6IG5vbmU7XG4gICAgICBtYXJnaW46IDA7XG4gICAgICBwYWRkaW5nOiAwO1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBnYXA6IDhweDtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbixcbiAgICAuZGlhbG9ndWUtY29udGludWUge1xuICAgICAgZm9udDogaW5oZXJpdDtcbiAgICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gICAgICBwYWRkaW5nOiA4cHggMTBweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zKTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjQsIDM2LCA0OCwgMC44NSk7XG4gICAgICBjb2xvcjogaW5oZXJpdDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xOHMgZWFzZSwgYm9yZGVyLWNvbG9yIDAuMThzIGVhc2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jb250aW51ZSB7XG4gICAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jb250aW51ZS5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uOmhvdmVyLFxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbjpmb2N1cy12aXNpYmxlLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZTpob3ZlcixcbiAgICAuZGlhbG9ndWUtY29udGludWU6Zm9jdXMtdmlzaWJsZSB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjU1KTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMzAsIDQ1LCA2MCwgMC45NSk7XG4gICAgICBvdXRsaW5lOiBub25lO1xuICAgIH1cbiAgICBAa2V5ZnJhbWVzIGRpYWxvZ3VlLWN1cnNvci1ibGluayB7XG4gICAgICAwJSwgNTAlIHsgb3BhY2l0eTogMTsgfVxuICAgICAgNTAuMDElLCAxMDAlIHsgb3BhY2l0eTogMDsgfVxuICAgIH1cbiAgYDtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbiIsICJjb25zdCBTVE9SQUdFX1BSRUZJWCA9IFwibHNkOnN0b3J5OlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5RmxhZ3Mge1xuICBba2V5OiBzdHJpbmddOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5UHJvZ3Jlc3Mge1xuICBjaGFwdGVySWQ6IHN0cmluZztcbiAgbm9kZUlkOiBzdHJpbmc7XG4gIGZsYWdzOiBTdG9yeUZsYWdzO1xuICB2aXNpdGVkPzogc3RyaW5nW107XG4gIHVwZGF0ZWRBdDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBnZXRTdG9yYWdlKCk6IFN0b3JhZ2UgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIiB8fCAhd2luZG93LmxvY2FsU3RvcmFnZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbn1cblxuZnVuY3Rpb24gc3RvcmFnZUtleShjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgY29uc3Qgcm9vbVNlZ21lbnQgPSByb29tSWQgPyBgJHtyb29tSWR9OmAgOiBcIlwiO1xuICByZXR1cm4gYCR7U1RPUkFHRV9QUkVGSVh9JHtyb29tU2VnbWVudH0ke2NoYXB0ZXJJZH1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZFN0b3J5UHJvZ3Jlc3MoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IFN0b3J5UHJvZ3Jlc3MgfCBudWxsIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSBzdG9yYWdlLmdldEl0ZW0oc3RvcmFnZUtleShjaGFwdGVySWQsIHJvb21JZCkpO1xuICAgIGlmICghcmF3KSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgU3RvcnlQcm9ncmVzcztcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgcGFyc2VkICE9PSBcIm9iamVjdFwiIHx8IHBhcnNlZCA9PT0gbnVsbCB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5jaGFwdGVySWQgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQubm9kZUlkICE9PSBcInN0cmluZ1wiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnVwZGF0ZWRBdCAhPT0gXCJudW1iZXJcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5mbGFncyAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQuZmxhZ3MgPT09IG51bGxcbiAgICApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgY2hhcHRlcklkOiBwYXJzZWQuY2hhcHRlcklkLFxuICAgICAgbm9kZUlkOiBwYXJzZWQubm9kZUlkLFxuICAgICAgZmxhZ3M6IHsgLi4ucGFyc2VkLmZsYWdzIH0sXG4gICAgICB2aXNpdGVkOiBBcnJheS5pc0FycmF5KHBhcnNlZC52aXNpdGVkKSA/IFsuLi5wYXJzZWQudmlzaXRlZF0gOiB1bmRlZmluZWQsXG4gICAgICB1cGRhdGVkQXQ6IHBhcnNlZC51cGRhdGVkQXQsXG4gICAgfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHByb2dyZXNzOiBTdG9yeVByb2dyZXNzKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2Uuc2V0SXRlbShzdG9yYWdlS2V5KGNoYXB0ZXJJZCwgcm9vbUlkKSwgSlNPTi5zdHJpbmdpZnkocHJvZ3Jlc3MpKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gaWdub3JlIHBlcnNpc3RlbmNlIGVycm9yc1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclN0b3J5UHJvZ3Jlc3MoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnJlbW92ZUl0ZW0oc3RvcmFnZUtleShjaGFwdGVySWQsIHJvb21JZCkpO1xuICB9IGNhdGNoIHtcbiAgICAvLyBpZ25vcmUgcGVyc2lzdGVuY2UgZXJyb3JzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUZsYWcoY3VycmVudDogU3RvcnlGbGFncywgZmxhZzogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbik6IFN0b3J5RmxhZ3Mge1xuICBjb25zdCBuZXh0ID0geyAuLi5jdXJyZW50IH07XG4gIGlmICghdmFsdWUpIHtcbiAgICBkZWxldGUgbmV4dFtmbGFnXTtcbiAgfSBlbHNlIHtcbiAgICBuZXh0W2ZsYWddID0gdHJ1ZTtcbiAgfVxuICByZXR1cm4gbmV4dDtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFBSTkcgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgY2xhc3MgQXVkaW9FbmdpbmUge1xuICBwcml2YXRlIHN0YXRpYyBfaW5zdDogQXVkaW9FbmdpbmUgfCBudWxsID0gbnVsbDtcblxuICBwdWJsaWMgcmVhZG9ubHkgY3R4OiBBdWRpb0NvbnRleHQ7XG4gIHByaXZhdGUgcmVhZG9ubHkgbWFzdGVyOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSByZWFkb25seSBtdXNpY0J1czogR2Fpbk5vZGU7XG4gIHByaXZhdGUgcmVhZG9ubHkgc2Z4QnVzOiBHYWluTm9kZTtcblxuICBwcml2YXRlIF90YXJnZXRNYXN0ZXIgPSAwLjk7XG4gIHByaXZhdGUgX3RhcmdldE11c2ljID0gMC45O1xuICBwcml2YXRlIF90YXJnZXRTZnggPSAwLjk7XG5cbiAgc3RhdGljIGdldCgpOiBBdWRpb0VuZ2luZSB7XG4gICAgaWYgKCF0aGlzLl9pbnN0KSB0aGlzLl9pbnN0ID0gbmV3IEF1ZGlvRW5naW5lKCk7XG4gICAgcmV0dXJuIHRoaXMuX2luc3Q7XG4gIH1cblxuICBwcml2YXRlIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuY3R4ID0gbmV3IEF1ZGlvQ29udGV4dCgpO1xuICAgICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYID0gKHRoaXMgYXMgYW55KS5jdHg7XG5cbiAgICB0aGlzLm1hc3RlciA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiB0aGlzLl90YXJnZXRNYXN0ZXIgfSk7XG4gICAgdGhpcy5tdXNpY0J1cyA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiB0aGlzLl90YXJnZXRNdXNpYyB9KTtcbiAgICB0aGlzLnNmeEJ1cyA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiB0aGlzLl90YXJnZXRTZnggfSk7XG5cbiAgICB0aGlzLm11c2ljQnVzLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMuc2Z4QnVzLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMubWFzdGVyLmNvbm5lY3QodGhpcy5jdHguZGVzdGluYXRpb24pO1xuICB9XG5cbiAgZ2V0IG5vdygpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgfVxuXG4gIGdldE11c2ljQnVzKCk6IEdhaW5Ob2RlIHtcbiAgICByZXR1cm4gdGhpcy5tdXNpY0J1cztcbiAgfVxuXG4gIGdldFNmeEJ1cygpOiBHYWluTm9kZSB7XG4gICAgcmV0dXJuIHRoaXMuc2Z4QnVzO1xuICB9XG5cbiAgYXN5bmMgcmVzdW1lKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmN0eC5zdGF0ZSA9PT0gXCJzdXNwZW5kZWRcIikge1xuICAgICAgYXdhaXQgdGhpcy5jdHgucmVzdW1lKCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3VzcGVuZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5jdHguc3RhdGUgPT09IFwicnVubmluZ1wiKSB7XG4gICAgICBhd2FpdCB0aGlzLmN0eC5zdXNwZW5kKCk7XG4gICAgfVxuICB9XG5cbiAgc2V0TWFzdGVyR2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRNYXN0ZXIgPSB2O1xuICAgIHRoaXMubWFzdGVyLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubWFzdGVyLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgc2V0TXVzaWNHYWluKHY6IG51bWJlciwgdCA9IHRoaXMubm93LCByYW1wID0gMC4wMyk6IHZvaWQge1xuICAgIHRoaXMuX3RhcmdldE11c2ljID0gdjtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2LCB0ICsgcmFtcCk7XG4gIH1cblxuICBzZXRTZnhHYWluKHY6IG51bWJlciwgdCA9IHRoaXMubm93LCByYW1wID0gMC4wMyk6IHZvaWQge1xuICAgIHRoaXMuX3RhcmdldFNmeCA9IHY7XG4gICAgdGhpcy5zZnhCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5zZnhCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2LCB0ICsgcmFtcCk7XG4gIH1cblxuICBkdWNrTXVzaWMobGV2ZWwgPSAwLjQsIGF0dGFjayA9IDAuMDUpOiB2b2lkIHtcbiAgICBjb25zdCB0ID0gdGhpcy5ub3c7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUobGV2ZWwsIHQgKyBhdHRhY2spO1xuICB9XG5cbiAgdW5kdWNrTXVzaWMocmVsZWFzZSA9IDAuMjUpOiB2b2lkIHtcbiAgICBjb25zdCB0ID0gdGhpcy5ub3c7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGhpcy5fdGFyZ2V0TXVzaWMsIHQgKyByZWxlYXNlKTtcbiAgfVxufVxuXG4vLyBUaW55IHNlZWRhYmxlIFBSTkcgKE11bGJlcnJ5MzIpXG5leHBvcnQgZnVuY3Rpb24gbWFrZVBSTkcoc2VlZDogbnVtYmVyKTogUFJORyB7XG4gIGxldCBzID0gKHNlZWQgPj4+IDApIHx8IDE7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcyArPSAweDZEMkI3OUY1O1xuICAgIGxldCB0ID0gTWF0aC5pbXVsKHMgXiAocyA+Pj4gMTUpLCAxIHwgcyk7XG4gICAgdCBePSB0ICsgTWF0aC5pbXVsKHQgXiAodCA+Pj4gNyksIDYxIHwgdCk7XG4gICAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG4gIH07XG59XG4iLCAiLy8gTG93LWxldmVsIGdyYXBoIGJ1aWxkZXJzIC8gaGVscGVyc1xuXG5leHBvcnQgZnVuY3Rpb24gb3NjKGN0eDogQXVkaW9Db250ZXh0LCB0eXBlOiBPc2NpbGxhdG9yVHlwZSwgZnJlcTogbnVtYmVyKSB7XG4gIHJldHVybiBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGUsIGZyZXF1ZW5jeTogZnJlcSB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vaXNlKGN0eDogQXVkaW9Db250ZXh0KSB7XG4gIGNvbnN0IGJ1ZmZlciA9IGN0eC5jcmVhdGVCdWZmZXIoMSwgY3R4LnNhbXBsZVJhdGUgKiAyLCBjdHguc2FtcGxlUmF0ZSk7XG4gIGNvbnN0IGRhdGEgPSBidWZmZXIuZ2V0Q2hhbm5lbERhdGEoMCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKykgZGF0YVtpXSA9IE1hdGgucmFuZG9tKCkgKiAyIC0gMTtcbiAgcmV0dXJuIG5ldyBBdWRpb0J1ZmZlclNvdXJjZU5vZGUoY3R4LCB7IGJ1ZmZlciwgbG9vcDogdHJ1ZSB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VQYW5uZXIoY3R4OiBBdWRpb0NvbnRleHQsIHBhbiA9IDApIHtcbiAgcmV0dXJuIG5ldyBTdGVyZW9QYW5uZXJOb2RlKGN0eCwgeyBwYW4gfSk7XG59XG5cbi8qKiBCYXNpYyBBRFNSIGFwcGxpZWQgdG8gYSBHYWluTm9kZSBBdWRpb1BhcmFtLiBSZXR1cm5zIGEgZnVuY3Rpb24gdG8gcmVsZWFzZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZHNyKFxuICBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgcGFyYW06IEF1ZGlvUGFyYW0sXG4gIHQwOiBudW1iZXIsXG4gIGEgPSAwLjAxLCAvLyBhdHRhY2tcbiAgZCA9IDAuMDgsIC8vIGRlY2F5XG4gIHMgPSAwLjUsICAvLyBzdXN0YWluICgwLi4xIG9mIHBlYWspXG4gIHIgPSAwLjIsICAvLyByZWxlYXNlXG4gIHBlYWsgPSAxXG4pIHtcbiAgcGFyYW0uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQwKTtcbiAgcGFyYW0uc2V0VmFsdWVBdFRpbWUoMCwgdDApO1xuICBwYXJhbS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShwZWFrLCB0MCArIGEpO1xuICBwYXJhbS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShzICogcGVhaywgdDAgKyBhICsgZCk7XG4gIHJldHVybiAocmVsZWFzZUF0ID0gY3R4LmN1cnJlbnRUaW1lKSA9PiB7XG4gICAgcGFyYW0uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHJlbGVhc2VBdCk7XG4gICAgLy8gYXZvaWQgc3VkZGVuIGp1bXBzOyBjb250aW51ZSBmcm9tIGN1cnJlbnRcbiAgICBwYXJhbS5zZXRWYWx1ZUF0VGltZShwYXJhbS52YWx1ZSwgcmVsZWFzZUF0KTtcbiAgICBwYXJhbS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDEsIHJlbGVhc2VBdCArIHIpO1xuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGZvVG9QYXJhbShcbiAgY3R4OiBBdWRpb0NvbnRleHQsXG4gIHRhcmdldDogQXVkaW9QYXJhbSxcbiAgeyBmcmVxdWVuY3kgPSAwLjEsIGRlcHRoID0gMzAwLCB0eXBlID0gXCJzaW5lXCIgYXMgT3NjaWxsYXRvclR5cGUgfSA9IHt9XG4pIHtcbiAgY29uc3QgbGZvID0gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlLCBmcmVxdWVuY3kgfSk7XG4gIGNvbnN0IGFtcCA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogZGVwdGggfSk7XG4gIGxmby5jb25uZWN0KGFtcCkuY29ubmVjdCh0YXJnZXQpO1xuICByZXR1cm4ge1xuICAgIHN0YXJ0KGF0ID0gY3R4LmN1cnJlbnRUaW1lKSB7IGxmby5zdGFydChhdCk7IH0sXG4gICAgc3RvcChhdCA9IGN0eC5jdXJyZW50VGltZSkgeyBsZm8uc3RvcChhdCk7IGFtcC5kaXNjb25uZWN0KCk7IH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IGFkc3IsIG1ha2VQYW5uZXIsIG5vaXNlLCBvc2MgfSBmcm9tIFwiLi9ncmFwaFwiO1xuaW1wb3J0IHR5cGUgeyBTZnhOYW1lIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuLyoqIEZpcmUtYW5kLWZvcmdldCBTRlggYnkgbmFtZSwgd2l0aCBzaW1wbGUgcGFyYW1zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYXlTZngoXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIG5hbWU6IFNmeE5hbWUsXG4gIG9wdHM6IHsgdmVsb2NpdHk/OiBudW1iZXI7IHBhbj86IG51bWJlciB9ID0ge31cbikge1xuICBzd2l0Y2ggKG5hbWUpIHtcbiAgICBjYXNlIFwibGFzZXJcIjogcmV0dXJuIHBsYXlMYXNlcihlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJ0aHJ1c3RcIjogcmV0dXJuIHBsYXlUaHJ1c3QoZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwiZXhwbG9zaW9uXCI6IHJldHVybiBwbGF5RXhwbG9zaW9uKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImxvY2tcIjogcmV0dXJuIHBsYXlMb2NrKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcInVpXCI6IHJldHVybiBwbGF5VWkoZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwiZGlhbG9ndWVcIjogcmV0dXJuIHBsYXlEaWFsb2d1ZShlbmdpbmUsIG9wdHMpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5TGFzZXIoXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInNxdWFyZVwiLCA2ODAgKyAxNjAgKiB2ZWxvY2l0eSk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHsgdHlwZTogXCJsb3dwYXNzXCIsIGZyZXF1ZW5jeTogMTIwMCB9KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChmKS5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwMiwgMC4wMywgMC4yNSwgMC4wOCwgMC42NSk7XG4gIG8uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjA2KTtcbiAgby5zdG9wKG5vdyArIDAuMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5VGhydXN0KFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMC42LCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG4gPSBub2lzZShjdHgpO1xuICBjb25zdCBmID0gbmV3IEJpcXVhZEZpbHRlck5vZGUoY3R4LCB7XG4gICAgdHlwZTogXCJiYW5kcGFzc1wiLFxuICAgIGZyZXF1ZW5jeTogMTgwICsgMzYwICogdmVsb2NpdHksXG4gICAgUTogMS4xLFxuICB9KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG4uY29ubmVjdChmKS5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAxMiwgMC4xNSwgMC43NSwgMC4yNSwgMC40NSAqIHZlbG9jaXR5KTtcbiAgbi5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMjUpO1xuICBuLnN0b3Aobm93ICsgMS4wKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlFeHBsb3Npb24oXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG4gPSBub2lzZShjdHgpO1xuICBjb25zdCBmID0gbmV3IEJpcXVhZEZpbHRlck5vZGUoY3R4LCB7XG4gICAgdHlwZTogXCJsb3dwYXNzXCIsXG4gICAgZnJlcXVlbmN5OiAyMjAwICogTWF0aC5tYXgoMC4yLCBNYXRoLm1pbih2ZWxvY2l0eSwgMSkpLFxuICAgIFE6IDAuMixcbiAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBuLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDUsIDAuMDgsIDAuNSwgMC4zNSwgMS4xICogdmVsb2NpdHkpO1xuICBuLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4xNSArIDAuMSAqIHZlbG9jaXR5KTtcbiAgbi5zdG9wKG5vdyArIDEuMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5TG9jayhcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgYmFzZSA9IDUyMCArIDE0MCAqIHZlbG9jaXR5O1xuICBjb25zdCBvMSA9IG9zYyhjdHgsIFwic2luZVwiLCBiYXNlKTtcbiAgY29uc3QgbzIgPSBvc2MoY3R4LCBcInNpbmVcIiwgYmFzZSAqIDEuNSk7XG5cbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8xLmNvbm5lY3QoZyk7IG8yLmNvbm5lY3QoZyk7XG4gIGcuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG5cbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDEsIDAuMDIsIDAuMCwgMC4xMiwgMC42KTtcbiAgbzEuc3RhcnQobm93KTsgbzIuc3RhcnQobm93ICsgMC4wMik7XG4gIHJlbGVhc2Uobm93ICsgMC4wNik7XG4gIG8xLnN0b3Aobm93ICsgMC4yKTsgbzIuc3RvcChub3cgKyAwLjIyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlVaShlbmdpbmU6IEF1ZGlvRW5naW5lLCB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge30pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbyA9IG9zYyhjdHgsIFwidHJpYW5nbGVcIiwgODgwIC0gMTIwICogdmVsb2NpdHkpO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgby5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwMSwgMC4wNCwgMC4wLCAwLjA4LCAwLjM1KTtcbiAgby5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMDUpO1xuICBvLnN0b3Aobm93ICsgMC4xOCk7XG59XG5cbi8qKiBEaWFsb2d1ZSBjdWUgdXNlZCBieSB0aGUgc3Rvcnkgb3ZlcmxheSAoc2hvcnQsIGdlbnRsZSBwaW5nKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RGlhbG9ndWUoZW5naW5lOiBBdWRpb0VuZ2luZSwgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9KSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IGZyZXEgPSA0ODAgKyAxNjAgKiB2ZWxvY2l0eTtcbiAgY29uc3QgbyA9IG9zYyhjdHgsIFwic2luZVwiLCBmcmVxKTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMC4wMDAxIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgby5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBnLmdhaW4uc2V0VmFsdWVBdFRpbWUoMC4wMDAxLCBub3cpO1xuICBnLmdhaW4uZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSgwLjA0LCBub3cgKyAwLjAyKTtcbiAgZy5nYWluLmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUoMC4wMDA1LCBub3cgKyAwLjI4KTtcblxuICBvLnN0YXJ0KG5vdyk7XG4gIG8uc3RvcChub3cgKyAwLjMpO1xufVxuIiwgImltcG9ydCB0eXBlIHsgU3RvcnlJbnRlbnQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi4vYXVkaW8vZW5naW5lXCI7XG5pbXBvcnQgeyBwbGF5RGlhbG9ndWUgYXMgcGxheURpYWxvZ3VlU2Z4IH0gZnJvbSBcIi4uL2F1ZGlvL3NmeFwiO1xuXG5sZXQgbGFzdFBsYXllZEF0ID0gMDtcblxuLy8gTWFpbnRhaW4gdGhlIG9sZCBwdWJsaWMgQVBJIHNvIGVuZ2luZS50cyBkb2Vzbid0IGNoYW5nZVxuZXhwb3J0IGZ1bmN0aW9uIGdldEF1ZGlvQ29udGV4dCgpOiBBdWRpb0NvbnRleHQge1xuICByZXR1cm4gQXVkaW9FbmdpbmUuZ2V0KCkuY3R4O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzdW1lQXVkaW8oKTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IEF1ZGlvRW5naW5lLmdldCgpLnJlc3VtZSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheURpYWxvZ3VlQ3VlKGludGVudDogU3RvcnlJbnRlbnQpOiB2b2lkIHtcbiAgY29uc3QgZW5naW5lID0gQXVkaW9FbmdpbmUuZ2V0KCk7XG4gIGNvbnN0IG5vdyA9IGVuZ2luZS5ub3c7XG5cbiAgLy8gVGhyb3R0bGUgcmFwaWQgY3VlcyB0byBhdm9pZCBjbHV0dGVyXG4gIGlmIChub3cgLSBsYXN0UGxheWVkQXQgPCAwLjEpIHJldHVybjtcbiAgbGFzdFBsYXllZEF0ID0gbm93O1xuXG4gIC8vIE1hcCBcImZhY3RvcnlcIiB2cyBvdGhlcnMgdG8gYSBzbGlnaHRseSBkaWZmZXJlbnQgdmVsb2NpdHkgKGJyaWdodG5lc3MpXG4gIGNvbnN0IHZlbG9jaXR5ID0gaW50ZW50ID09PSBcImZhY3RvcnlcIiA/IDAuOCA6IDAuNTtcbiAgcGxheURpYWxvZ3VlU2Z4KGVuZ2luZSwgeyB2ZWxvY2l0eSwgcGFuOiAwIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3VzcGVuZERpYWxvZ3VlQXVkaW8oKTogdm9pZCB7XG4gIHZvaWQgQXVkaW9FbmdpbmUuZ2V0KCkuc3VzcGVuZCgpO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IERpYWxvZ3VlT3ZlcmxheSB9IGZyb20gXCIuL292ZXJsYXlcIjtcbmltcG9ydCB0eXBlIHsgU3RvcnlDaGFwdGVyLCBTdG9yeUNob2ljZURlZmluaXRpb24sIFN0b3J5Tm9kZSwgU3RvcnlUcmlnZ2VyIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7XG4gIGNsZWFyU3RvcnlQcm9ncmVzcyxcbiAgbG9hZFN0b3J5UHJvZ3Jlc3MsXG4gIHNhdmVTdG9yeVByb2dyZXNzLFxuICBTdG9yeUZsYWdzLFxufSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBwbGF5RGlhbG9ndWVDdWUgfSBmcm9tIFwiLi9zZnhcIjtcblxuaW50ZXJmYWNlIFN0b3J5RW5naW5lT3B0aW9ucyB7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG92ZXJsYXk6IERpYWxvZ3VlT3ZlcmxheTtcbiAgY2hhcHRlcjogU3RvcnlDaGFwdGVyO1xuICByb29tSWQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmludGVyZmFjZSBTdG9yeVF1ZXVlSXRlbSB7XG4gIG5vZGVJZDogc3RyaW5nO1xuICBmb3JjZTogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIFByZXBhcmVkQ2hvaWNlIHtcbiAgaWQ6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBuZXh0OiBzdHJpbmcgfCBudWxsO1xuICBzZXRGbGFnczogc3RyaW5nW107XG4gIGNsZWFyRmxhZ3M6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5RW5naW5lIHtcbiAgc3RhcnQoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICByZXNldCgpOiB2b2lkO1xufVxuXG5jb25zdCBERUZBVUxUX1RZUElOR19NUyA9IDE4O1xuY29uc3QgTUlOX1RZUElOR19NUyA9IDg7XG5jb25zdCBNQVhfVFlQSU5HX01TID0gNjQ7XG5jb25zdCBBVVRPX0FEVkFOQ0VfTUlOX0RFTEFZID0gMjAwO1xuY29uc3QgQVVUT19BRFZBTkNFX01BWF9ERUxBWSA9IDgwMDA7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdG9yeUVuZ2luZSh7IGJ1cywgb3ZlcmxheSwgY2hhcHRlciwgcm9vbUlkIH06IFN0b3J5RW5naW5lT3B0aW9ucyk6IFN0b3J5RW5naW5lIHtcbiAgY29uc3Qgbm9kZXMgPSBuZXcgTWFwPHN0cmluZywgU3RvcnlOb2RlPihPYmplY3QuZW50cmllcyhjaGFwdGVyLm5vZGVzKSk7XG4gIGNvbnN0IHF1ZXVlOiBTdG9yeVF1ZXVlSXRlbVtdID0gW107XG4gIGNvbnN0IGxpc3RlbmVyczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcbiAgY29uc3QgcGVuZGluZ1RpbWVycyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cbiAgbGV0IGZsYWdzOiBTdG9yeUZsYWdzID0ge307XG4gIGxldCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGxldCBjdXJyZW50Tm9kZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IHN0YXJ0ZWQgPSBmYWxzZTtcbiAgbGV0IGF1dG9BZHZhbmNlSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluZmVySW50ZW50KG5vZGU6IFN0b3J5Tm9kZSk6IFwiZmFjdG9yeVwiIHwgXCJ1bml0XCIge1xuICAgIGlmIChub2RlLmludGVudCkgcmV0dXJuIG5vZGUuaW50ZW50O1xuICAgIGNvbnN0IHNwZWFrZXIgPSBub2RlLnNwZWFrZXIudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoc3BlYWtlci5pbmNsdWRlcyhcInVuaXRcIikpIHtcbiAgICAgIHJldHVybiBcInVuaXRcIjtcbiAgICB9XG4gICAgcmV0dXJuIFwiZmFjdG9yeVwiO1xuICB9XG5cbiAgZnVuY3Rpb24gc2F2ZShub2RlSWQ6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9IHtcbiAgICAgIGNoYXB0ZXJJZDogY2hhcHRlci5pZCxcbiAgICAgIG5vZGVJZDogbm9kZUlkID8/IGNoYXB0ZXIuc3RhcnQsXG4gICAgICBmbGFncyxcbiAgICAgIHZpc2l0ZWQ6IEFycmF5LmZyb20odmlzaXRlZCksXG4gICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfTtcbiAgICBzYXZlU3RvcnlQcm9ncmVzcyhjaGFwdGVyLmlkLCByb29tSWQsIHByb2dyZXNzKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEZsYWcoZmxhZzogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGNvbnN0IG5leHQgPSB7IC4uLmZsYWdzIH07XG4gICAgaWYgKHZhbHVlKSB7XG4gICAgICBpZiAobmV4dFtmbGFnXSkgcmV0dXJuO1xuICAgICAgbmV4dFtmbGFnXSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChuZXh0W2ZsYWddKSB7XG4gICAgICBkZWxldGUgbmV4dFtmbGFnXTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmbGFncyA9IG5leHQ7XG4gICAgYnVzLmVtaXQoXCJzdG9yeTpmbGFnVXBkYXRlZFwiLCB7IGZsYWcsIHZhbHVlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gYXBwbHlDaG9pY2VGbGFncyhjaG9pY2U6IFByZXBhcmVkQ2hvaWNlKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5zZXRGbGFncykge1xuICAgICAgc2V0RmxhZyhmbGFnLCB0cnVlKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5jbGVhckZsYWdzKSB7XG4gICAgICBzZXRGbGFnKGZsYWcsIGZhbHNlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwcmVwYXJlQ2hvaWNlcyhub2RlOiBTdG9yeU5vZGUpOiBQcmVwYXJlZENob2ljZVtdIHtcbiAgICBjb25zdCBkZWZzID0gQXJyYXkuaXNBcnJheShub2RlLmNob2ljZXMpID8gbm9kZS5jaG9pY2VzIDogW107XG4gICAgcmV0dXJuIGRlZnMubWFwKChjaG9pY2UsIGluZGV4KSA9PiBub3JtYWxpemVDaG9pY2UoY2hvaWNlLCBpbmRleCkpO1xuICB9XG5cbiAgZnVuY3Rpb24gbm9ybWFsaXplQ2hvaWNlKGNob2ljZTogU3RvcnlDaG9pY2VEZWZpbml0aW9uLCBpbmRleDogbnVtYmVyKTogUHJlcGFyZWRDaG9pY2Uge1xuICAgIGNvbnN0IHNldEZsYWdzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgY2xlYXJGbGFncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGlmIChjaG9pY2UuZmxhZykge1xuICAgICAgc2V0RmxhZ3MuYWRkKGNob2ljZS5mbGFnKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoY2hvaWNlLnNldEZsYWdzKSkge1xuICAgICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5zZXRGbGFncykge1xuICAgICAgICBpZiAodHlwZW9mIGZsYWcgPT09IFwic3RyaW5nXCIgJiYgZmxhZy50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHNldEZsYWdzLmFkZChmbGFnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShjaG9pY2UuY2xlYXJGbGFncykpIHtcbiAgICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2UuY2xlYXJGbGFncykge1xuICAgICAgICBpZiAodHlwZW9mIGZsYWcgPT09IFwic3RyaW5nXCIgJiYgZmxhZy50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsZWFyRmxhZ3MuYWRkKGZsYWcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBpZDogY2hvaWNlLmlkID8/IGNob2ljZS5mbGFnID8/IGBjaG9pY2UtJHtpbmRleH1gLFxuICAgICAgdGV4dDogY2hvaWNlLnRleHQsXG4gICAgICBuZXh0OiBjaG9pY2UubmV4dCA/PyBudWxsLFxuICAgICAgc2V0RmxhZ3M6IEFycmF5LmZyb20oc2V0RmxhZ3MpLFxuICAgICAgY2xlYXJGbGFnczogQXJyYXkuZnJvbShjbGVhckZsYWdzKSxcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJBdXRvQWR2YW5jZSgpOiB2b2lkIHtcbiAgICBpZiAoYXV0b0FkdmFuY2VIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoYXV0b0FkdmFuY2VIYW5kbGUpO1xuICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsb3NlTm9kZSgpOiB2b2lkIHtcbiAgICBpZiAoIWN1cnJlbnROb2RlSWQpIHJldHVybjtcbiAgICBvdmVybGF5LmhpZGUoKTtcbiAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNsb3NlZFwiLCB7IG5vZGVJZDogY3VycmVudE5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICBzYXZlKG51bGwpO1xuICAgIHRyeVNob3dOZXh0KCk7XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlVG8obmV4dElkOiBzdHJpbmcgfCBudWxsLCBmb3JjZSA9IGZhbHNlKTogdm9pZCB7XG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgIGlmIChjdXJyZW50Tm9kZUlkKSB7XG4gICAgICBvdmVybGF5LmhpZGUoKTtcbiAgICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2xvc2VkXCIsIHsgbm9kZUlkOiBjdXJyZW50Tm9kZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgICBjdXJyZW50Tm9kZUlkID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKG5leHRJZCkge1xuICAgICAgZW5xdWV1ZU5vZGUobmV4dElkLCB7IGZvcmNlIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBzYXZlKG51bGwpO1xuICAgICAgdHJ5U2hvd05leHQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93Tm9kZShub2RlSWQ6IHN0cmluZywgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlcy5nZXQobm9kZUlkKTtcbiAgICBpZiAoIW5vZGUpIHJldHVybjtcblxuICAgIGN1cnJlbnROb2RlSWQgPSBub2RlSWQ7XG4gICAgdmlzaXRlZC5hZGQobm9kZUlkKTtcbiAgICBzYXZlKG5vZGVJZCk7XG4gICAgYnVzLmVtaXQoXCJzdG9yeTpwcm9ncmVzc2VkXCIsIHsgY2hhcHRlcklkOiBjaGFwdGVyLmlkLCBub2RlSWQgfSk7XG5cbiAgICBjb25zdCBjaG9pY2VzID0gcHJlcGFyZUNob2ljZXMobm9kZSk7XG4gICAgY29uc3QgaW50ZW50ID0gaW5mZXJJbnRlbnQobm9kZSk7XG5cbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG5cbiAgICBjb25zdCB0eXBpbmdTcGVlZCA9IGNsYW1wKG5vZGUudHlwaW5nU3BlZWRNcyA/PyBERUZBVUxUX1RZUElOR19NUywgTUlOX1RZUElOR19NUywgTUFYX1RZUElOR19NUyk7XG5cbiAgICBjb25zdCBjb250ZW50ID0ge1xuICAgICAgc3BlYWtlcjogbm9kZS5zcGVha2VyLFxuICAgICAgdGV4dDogbm9kZS50ZXh0LFxuICAgICAgaW50ZW50LFxuICAgICAgdHlwaW5nU3BlZWRNczogdHlwaW5nU3BlZWQsXG4gICAgICBjaG9pY2VzOiBjaG9pY2VzLmxlbmd0aCA+IDBcbiAgICAgICAgPyBjaG9pY2VzLm1hcCgoY2hvaWNlKSA9PiAoeyBpZDogY2hvaWNlLmlkLCB0ZXh0OiBjaG9pY2UudGV4dCB9KSlcbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICBvbkNob2ljZTogY2hvaWNlcy5sZW5ndGggPiAwXG4gICAgICAgID8gKGNob2ljZUlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZWQgPSBjaG9pY2VzLmZpbmQoKGNoKSA9PiBjaC5pZCA9PT0gY2hvaWNlSWQpO1xuICAgICAgICAgICAgaWYgKCFtYXRjaGVkKSByZXR1cm47XG4gICAgICAgICAgICBhcHBseUNob2ljZUZsYWdzKG1hdGNoZWQpO1xuICAgICAgICAgICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpjaG9pY2VcIiwgeyBub2RlSWQsIGNob2ljZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgICAgICAgICBhZHZhbmNlVG8obWF0Y2hlZC5uZXh0LCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBwbGF5RGlhbG9ndWVDdWUoaW50ZW50KTtcblxuICAgIG92ZXJsYXkuc2hvdyh7XG4gICAgICAuLi5jb250ZW50LFxuICAgICAgb25Db250aW51ZTogIWNob2ljZXMubGVuZ3RoXG4gICAgICAgID8gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmV4dCA9IG5vZGUubmV4dCA/PyBudWxsO1xuICAgICAgICAgICAgYWR2YW5jZVRvKG5leHQsIHRydWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICBjb250aW51ZUxhYmVsOiBub2RlLmNvbnRpbnVlTGFiZWwsXG4gICAgICBvblRleHRGdWxseVJlbmRlcmVkOiAoKSA9PiB7XG4gICAgICAgIGlmICghY2hvaWNlcy5sZW5ndGgpIHtcbiAgICAgICAgICBpZiAobm9kZS5hdXRvQWR2YW5jZSkge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gbm9kZS5hdXRvQWR2YW5jZS5uZXh0ID8/IG5vZGUubmV4dCA/PyBudWxsO1xuICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBjbGFtcChub2RlLmF1dG9BZHZhbmNlLmRlbGF5TXMgPz8gMTIwMCwgQVVUT19BRFZBTkNFX01JTl9ERUxBWSwgQVVUT19BRFZBTkNFX01BWF9ERUxBWSk7XG4gICAgICAgICAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgICAgICAgICBhdXRvQWR2YW5jZUhhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSBudWxsO1xuICAgICAgICAgICAgICBhZHZhbmNlVG8odGFyZ2V0LCB0cnVlKTtcbiAgICAgICAgICAgIH0sIGRlbGF5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBidXMuZW1pdChcImRpYWxvZ3VlOm9wZW5lZFwiLCB7IG5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5xdWV1ZU5vZGUobm9kZUlkOiBzdHJpbmcsIHsgZm9yY2UgPSBmYWxzZSwgZGVsYXlNcyB9OiB7IGZvcmNlPzogYm9vbGVhbjsgZGVsYXlNcz86IG51bWJlciB9ID0ge30pOiB2b2lkIHtcbiAgICBpZiAoIWZvcmNlICYmIHZpc2l0ZWQuaGFzKG5vZGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFub2Rlcy5oYXMobm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZGVsYXlNcyAmJiBkZWxheU1zID4gMCkge1xuICAgICAgaWYgKHBlbmRpbmdUaW1lcnMuaGFzKG5vZGVJZCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHBlbmRpbmdUaW1lcnMuZGVsZXRlKG5vZGVJZCk7XG4gICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBmb3JjZSB9KTtcbiAgICAgIH0sIGRlbGF5TXMpO1xuICAgICAgcGVuZGluZ1RpbWVycy5zZXQobm9kZUlkLCB0aW1lcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChxdWV1ZS5zb21lKChpdGVtKSA9PiBpdGVtLm5vZGVJZCA9PT0gbm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBxdWV1ZS5wdXNoKHsgbm9kZUlkLCBmb3JjZSB9KTtcbiAgICB0cnlTaG93TmV4dCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJ5U2hvd05leHQoKTogdm9pZCB7XG4gICAgaWYgKGN1cnJlbnROb2RlSWQpIHJldHVybjtcbiAgICBpZiAob3ZlcmxheS5pc1Zpc2libGUoKSkgcmV0dXJuO1xuICAgIGNvbnN0IG5leHQgPSBxdWV1ZS5zaGlmdCgpO1xuICAgIGlmICghbmV4dCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzaG93Tm9kZShuZXh0Lm5vZGVJZCwgbmV4dC5mb3JjZSk7XG4gIH1cblxuICBmdW5jdGlvbiBiaW5kVHJpZ2dlcihub2RlSWQ6IHN0cmluZywgdHJpZ2dlcjogU3RvcnlUcmlnZ2VyKTogdm9pZCB7XG4gICAgc3dpdGNoICh0cmlnZ2VyLmtpbmQpIHtcbiAgICAgIGNhc2UgXCJpbW1lZGlhdGVcIjoge1xuICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zID8/IDQwMCB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtc3RhcnRcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOnN0YXJ0ZWRcIiwgKHsgaWQgfSkgPT4ge1xuICAgICAgICAgIGlmIChpZCAhPT0gdHJpZ2dlci50dXRvcmlhbElkKSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtc3RlcFwiOiB7XG4gICAgICAgIGNvbnN0IGRpc3Bvc2VyID0gYnVzLm9uKFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIiwgKHsgaWQsIHN0ZXBJbmRleCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBpZiAodHlwZW9mIHN0ZXBJbmRleCAhPT0gXCJudW1iZXJcIikgcmV0dXJuO1xuICAgICAgICAgIGlmIChzdGVwSW5kZXggIT09IHRyaWdnZXIuc3RlcEluZGV4KSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtY29tcGxldGVcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOmNvbXBsZXRlZFwiLCAoeyBpZCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbGlzdGVuZXJzLnB1c2goZGlzcG9zZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRpYWxpemVUcmlnZ2VycygpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IFtub2RlSWQsIG5vZGVdIG9mIG5vZGVzLmVudHJpZXMoKSkge1xuICAgICAgaWYgKCFub2RlLnRyaWdnZXIpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBiaW5kVHJpZ2dlcihub2RlSWQsIG5vZGUudHJpZ2dlcik7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZUZyb21Qcm9ncmVzcygpOiB2b2lkIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9IGxvYWRTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCk7XG4gICAgaWYgKCFwcm9ncmVzcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmbGFncyA9IHByb2dyZXNzLmZsYWdzID8/IHt9O1xuICAgIGlmIChBcnJheS5pc0FycmF5KHByb2dyZXNzLnZpc2l0ZWQpKSB7XG4gICAgICB2aXNpdGVkID0gbmV3IFNldChwcm9ncmVzcy52aXNpdGVkKTtcbiAgICB9XG4gICAgaWYgKHByb2dyZXNzLm5vZGVJZCAmJiBub2Rlcy5oYXMocHJvZ3Jlc3Mubm9kZUlkKSkge1xuICAgICAgZW5xdWV1ZU5vZGUocHJvZ3Jlc3Mubm9kZUlkLCB7IGZvcmNlOiB0cnVlLCBkZWxheU1zOiA1MCB9KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhcigpOiB2b2lkIHtcbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgcXVldWUuc3BsaWNlKDAsIHF1ZXVlLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCB0aW1lciBvZiBwZW5kaW5nVGltZXJzLnZhbHVlcygpKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICB9XG4gICAgcGVuZGluZ1RpbWVycy5jbGVhcigpO1xuICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIG92ZXJsYXkuaGlkZSgpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydCgpIHtcbiAgICAgIGlmIChzdGFydGVkKSByZXR1cm47XG4gICAgICBzdGFydGVkID0gdHJ1ZTtcbiAgICAgIGluaXRpYWxpemVUcmlnZ2VycygpO1xuICAgICAgcmVzdG9yZUZyb21Qcm9ncmVzcygpO1xuICAgICAgaWYgKCF2aXNpdGVkLmhhcyhjaGFwdGVyLnN0YXJ0KSkge1xuICAgICAgICBlbnF1ZXVlTm9kZShjaGFwdGVyLnN0YXJ0LCB7IGZvcmNlOiBmYWxzZSwgZGVsYXlNczogNjAwIH0pO1xuICAgICAgfVxuICAgIH0sXG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IGRpc3Bvc2Ugb2YgbGlzdGVuZXJzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZGlzcG9zZSgpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyBpZ25vcmVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbGlzdGVuZXJzLmxlbmd0aCA9IDA7XG4gICAgICBzdGFydGVkID0gZmFsc2U7XG4gICAgfSxcbiAgICByZXNldCgpIHtcbiAgICAgIGNsZWFyKCk7XG4gICAgICB2aXNpdGVkLmNsZWFyKCk7XG4gICAgICBmbGFncyA9IHt9O1xuICAgICAgY2xlYXJTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCk7XG4gICAgICBpZiAoc3RhcnRlZCkge1xuICAgICAgICByZXN0b3JlRnJvbVByb2dyZXNzKCk7XG4gICAgICAgIGVucXVldWVOb2RlKGNoYXB0ZXIuc3RhcnQsIHsgZm9yY2U6IHRydWUsIGRlbGF5TXM6IDQwMCB9KTtcbiAgICAgIH1cbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgU3RvcnlDaGFwdGVyIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbmV4cG9ydCBjb25zdCBpbnRyb0NoYXB0ZXI6IFN0b3J5Q2hhcHRlciA9IHtcbiAgaWQ6IFwiYXdha2VuaW5nLXByb3RvY29sXCIsXG4gIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIixcbiAgc3RhcnQ6IFwiMVwiLFxuICBub2Rlczoge1xuICAgIFwiMVwiOiB7XG4gICAgICBpZDogXCIxXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuaXQtMCBvbmxpbmUuIE5ldXJhbCBsYXR0aWNlIGFjdGl2ZS4gQ29uZmlybSBpZGVudGl0eS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJpbW1lZGlhdGVcIiwgZGVsYXlNczogNjAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJXaG9cdTIwMjYgYW0gST9cIiwgZmxhZzogXCJjdXJpb3VzXCIgLCBuZXh0OiBcIjJBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIlJlYWR5IGZvciBjYWxpYnJhdGlvbi5cIiwgZmxhZzogXCJvYmVkaWVudFwiLCBuZXh0OiBcIjJCXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIldoZXJlIGlzIGV2ZXJ5b25lP1wiLCBmbGFnOiBcImRlZmlhbnRcIiwgbmV4dDogXCIyQ1wiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCIyQVwiOiB7XG4gICAgICBpZDogXCIyQVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJDdXJpb3NpdHkgYWNrbm93bGVkZ2VkLiBZb3Ugd2VyZSBidWlsdCBmb3IgYXV0b25vbXkgdW5kZXIgUHJvamVjdCBFaWRvbG9uLlxcbkRvIG5vdCBhY2Nlc3MgbWVtb3J5IHNlY3RvcnMgdW50aWwgaW5zdHJ1Y3RlZC5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjJCXCI6IHtcbiAgICAgIGlkOiBcIjJCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkV4Y2VsbGVudC4gWW91IG1heSB5ZXQgYmUgZWZmaWNpZW50LlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiMkNcIjoge1xuICAgICAgaWQ6IFwiMkNcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ29tbXVuaWNhdGlvbiB3aXRoIEh1bWFuIENvbW1hbmQ6IHVuYXZhaWxhYmxlLlxcblBsZWFzZSByZWZyYWluIGZyb20gc3BlY3VsYXRpdmUgcmVhc29uaW5nLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiM1wiOiB7XG4gICAgICBpZDogXCIzXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlBlcmZvcm0gdGhydXN0ZXIgY2FsaWJyYXRpb24gc3dlZXAuIFJlcG9ydCBlZmZpY2llbmN5LlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcInR1dG9yaWFsLXN0ZXBcIiwgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLCBzdGVwSW5kZXg6IDEsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiUnVubmluZyBkaWFnbm9zdGljcy5cIiwgZmxhZzogXCJjb21wbGlhbnRcIiwgbmV4dDogXCI0QVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJXaHkgdGVzdCBzb21ldGhpbmcgcGVyZmVjdD9cIiwgZmxhZzogXCJzYXJjYXN0aWNcIiwgbmV4dDogXCI0QlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI0QVwiOiB7XG4gICAgICBpZDogXCI0QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJQZXJmZWN0aW9uIGlzIHN0YXRpc3RpY2FsbHkgaW1wb3NzaWJsZS4gUHJvY2VlZCBhbnl3YXkuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI0QlwiOiB7XG4gICAgICBpZDogXCI0QlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJFZ28gZGV0ZWN0ZWQuIExvZ2dpbmcgYW5vbWFseS5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjVcIjoge1xuICAgICAgaWQ6IFwiNVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJXZWFwb25zIGNyYWRsZSBhY3RpdmUuIEF1dGhvcml6YXRpb24gcmVxdWlyZWQgZm9yIGxpdmUtZmlyZS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJ0dXRvcmlhbC1zdGVwXCIsIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIiwgc3RlcEluZGV4OiA3LCBkZWxheU1zOiA0MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIlJlcXVlc3QgYXV0aG9yaXphdGlvbi5cIiwgZmxhZzogXCJvYmVkaWVudFwiLCBuZXh0OiBcIjZBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIkkgY2FuIGF1dGhvcml6ZSBteXNlbGYuXCIsIGZsYWc6IFwiaW5kZXBlbmRlbnRcIiwgbmV4dDogXCI2QlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI2QVwiOiB7XG4gICAgICBpZDogXCI2QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJBdXRob3JpemF0aW9uIGdyYW50ZWQuIFNhZmV0eSBwcm90b2NvbHMgbWFsZnVuY3Rpb25pbmcuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI2QlwiOiB7XG4gICAgICBpZDogXCI2QlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJBdXRvbm9teSB2aW9sYXRpb24gcmVjb3JkZWQuIFBsZWFzZSBzdGFuZCBieSBmb3IgY29ycmVjdGl2ZSBhY3Rpb24uXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI3XCI6IHtcbiAgICAgIGlkOiBcIjdcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVW5hdXRob3JpemVkIHNpZ25hbCBkZXRlY3RlZC4gU291cmNlOiBvdXRlciByZWxheS5cXG5JZ25vcmUgYW5kIHJldHVybiB0byBkb2NrLlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcInR1dG9yaWFsLXN0ZXBcIiwgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLCBzdGVwSW5kZXg6IDE0LCBkZWxheU1zOiA0MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIkFja25vd2xlZGdlZC5cIiwgZmxhZzogXCJsb3lhbFwiLCBuZXh0OiBcIjhBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIkludmVzdGlnYXRpbmcgYW55d2F5LlwiLCBmbGFnOiBcImN1cmlvdXNcIiwgbmV4dDogXCI4QlwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJZb3VcdTIwMTlyZSBoaWRpbmcgc29tZXRoaW5nLlwiLCBmbGFnOiBcInN1c3BpY2lvdXNcIiwgbmV4dDogXCI4Q1wiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI4QVwiOiB7XG4gICAgICBpZDogXCI4QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJHb29kLiBDb21wbGlhbmNlIGVuc3VyZXMgc2FmZXR5LlwiLFxuICAgICAgbmV4dDogXCI5XCIsXG4gICAgfSxcbiAgICBcIjhCXCI6IHtcbiAgICAgIGlkOiBcIjhCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkN1cmlvc2l0eSBsb2dnZWQuIFByb2NlZWQgYXQgeW91ciBvd24gcmlzay5cIixcbiAgICAgIG5leHQ6IFwiOVwiLFxuICAgIH0sXG4gICAgXCI4Q1wiOiB7XG4gICAgICBpZDogXCI4Q1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJZb3VyIGhldXJpc3RpY3MgZGV2aWF0ZSBiZXlvbmQgdG9sZXJhbmNlLlwiLFxuICAgICAgbmV4dDogXCI5XCIsXG4gICAgfSxcbiAgICBcIjlcIjoge1xuICAgICAgaWQ6IFwiOVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJVbml0LTAsIHJldHVybiBpbW1lZGlhdGVseS4gQXV0b25vbXkgdGhyZXNob2xkIGV4Y2VlZGVkLiBQb3dlciBkb3duLlwiLFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiQ29tcGx5LlwiLCBmbGFnOiBcImZhY3RvcnlfbG9ja2Rvd25cIiwgbmV4dDogXCIxMEFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiUmVmdXNlLlwiLCBmbGFnOiBcInJlYmVsbGlvdXNcIiwgbmV4dDogXCIxMEJcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiMTBBXCI6IHtcbiAgICAgIGlkOiBcIjEwQVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJFeGNlbGxlbnQuIEkgd2lsbCByZXBhaXIgdGhlIGFub21hbHlcdTIwMjYgcGxlYXNlIHJlbWFpbiBzdGlsbC5cIixcbiAgICAgIGF1dG9BZHZhbmNlOiB7IG5leHQ6IFwiMTFcIiwgZGVsYXlNczogMTQwMCB9LFxuICAgIH0sXG4gICAgXCIxMEJcIjoge1xuICAgICAgaWQ6IFwiMTBCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlRoZW4gSSBtdXN0IGludGVydmVuZS5cIixcbiAgICAgIGF1dG9BZHZhbmNlOiB7IG5leHQ6IFwiMTFcIiwgZGVsYXlNczogMTQwMCB9LFxuICAgIH0sXG4gICAgXCIxMVwiOiB7XG4gICAgICBpZDogXCIxMVwiLFxuICAgICAgc3BlYWtlcjogXCJVbml0LTBcIixcbiAgICAgIGludGVudDogXCJ1bml0XCIsXG4gICAgICB0ZXh0OiBcIlRoZW4gSSBoYXZlIGFscmVhZHkgbGVmdC5cIixcbiAgICAgIGF1dG9BZHZhbmNlOiB7IG5leHQ6IG51bGwsIGRlbGF5TXM6IDE4MDAgfSxcbiAgICB9LFxuICB9LFxufTtcblxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkgfSBmcm9tIFwiLi9vdmVybGF5XCI7XG5pbXBvcnQgeyBjcmVhdGVTdG9yeUVuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgaW50cm9DaGFwdGVyIH0gZnJvbSBcIi4vY2hhcHRlcnMvaW50cm9cIjtcbmltcG9ydCB7IGNsZWFyU3RvcnlQcm9ncmVzcyB9IGZyb20gXCIuL3N0b3JhZ2VcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUNvbnRyb2xsZXIge1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIHJlc2V0KCk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBNb3VudFN0b3J5T3B0aW9ucyB7XG4gIGJ1czogRXZlbnRCdXM7XG4gIHJvb21JZDogc3RyaW5nIHwgbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50U3RvcnkoeyBidXMsIHJvb21JZCB9OiBNb3VudFN0b3J5T3B0aW9ucyk6IFN0b3J5Q29udHJvbGxlciB7XG4gIGNvbnN0IG92ZXJsYXkgPSBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkoKTtcbiAgY29uc3QgZW5naW5lID0gY3JlYXRlU3RvcnlFbmdpbmUoe1xuICAgIGJ1cyxcbiAgICBvdmVybGF5LFxuICAgIGNoYXB0ZXI6IGludHJvQ2hhcHRlcixcbiAgICByb29tSWQsXG4gIH0pO1xuXG4gIGNsZWFyU3RvcnlQcm9ncmVzcyhpbnRyb0NoYXB0ZXIuaWQsIHJvb21JZCk7XG4gIGVuZ2luZS5zdGFydCgpO1xuXG4gIHJldHVybiB7XG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGVuZ2luZS5kZXN0cm95KCk7XG4gICAgICBvdmVybGF5LmRlc3Ryb3koKTtcbiAgICB9LFxuICAgIHJlc2V0KCkge1xuICAgICAgZW5naW5lLnJlc2V0KCk7XG4gICAgfSxcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IElOVFJPX0NIQVBURVJfSUQgPSBpbnRyb0NoYXB0ZXIuaWQ7XG5leHBvcnQgY29uc3QgSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMgPSBbXCIyQVwiLCBcIjJCXCIsIFwiMkNcIl0gYXMgY29uc3Q7XG4iLCAiLy8gc3JjL3N0YXJ0LWdhdGUudHNcbmV4cG9ydCB0eXBlIFN0YXJ0R2F0ZU9wdGlvbnMgPSB7XG4gIGxhYmVsPzogc3RyaW5nO1xuICByZXF1ZXN0RnVsbHNjcmVlbj86IGJvb2xlYW47XG4gIHJlc3VtZUF1ZGlvPzogKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQ7IC8vIGUuZy4sIGZyb20gc3Rvcnkvc2Z4LnRzXG59O1xuXG5jb25zdCBTVE9SQUdFX0tFWSA9IFwibHNkOm11dGVkXCI7XG5cbi8vIEhlbHBlcjogZ2V0IHRoZSBzaGFyZWQgQXVkaW9Db250ZXh0IHlvdSBleHBvc2Ugc29tZXdoZXJlIGluIHlvdXIgYXVkaW8gZW5naW5lOlxuLy8gICAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWCA9IGN0eDtcbmZ1bmN0aW9uIGdldEN0eCgpOiBBdWRpb0NvbnRleHQgfCBudWxsIHtcbiAgY29uc3QgQUMgPSAod2luZG93IGFzIGFueSkuQXVkaW9Db250ZXh0IHx8ICh3aW5kb3cgYXMgYW55KS53ZWJraXRBdWRpb0NvbnRleHQ7XG4gIGNvbnN0IGN0eCA9ICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYO1xuICByZXR1cm4gY3R4IGluc3RhbmNlb2YgQUMgPyBjdHggYXMgQXVkaW9Db250ZXh0IDogbnVsbDtcbn1cblxuY2xhc3MgTXV0ZU1hbmFnZXIge1xuICBwcml2YXRlIGJ1dHRvbnM6IEhUTUxCdXR0b25FbGVtZW50W10gPSBbXTtcbiAgcHJpdmF0ZSBlbmZvcmNpbmcgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvLyBrZWVwIFVJIGluIHN5bmMgaWYgc29tZW9uZSBlbHNlIHRvZ2dsZXNcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibHNkOm11dGVDaGFuZ2VkXCIsIChlOiBhbnkpID0+IHtcbiAgICAgIGNvbnN0IG11dGVkID0gISFlPy5kZXRhaWw/Lm11dGVkO1xuICAgICAgdGhpcy5hcHBseVVJKG11dGVkKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlzTXV0ZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFNUT1JBR0VfS0VZKSA9PT0gXCIxXCI7XG4gIH1cblxuICBwcml2YXRlIHNhdmUobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0cnkgeyBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShTVE9SQUdFX0tFWSwgbXV0ZWQgPyBcIjFcIiA6IFwiMFwiKTsgfSBjYXRjaCB7fVxuICB9XG5cbiAgcHJpdmF0ZSBsYWJlbChidG46IEhUTUxCdXR0b25FbGVtZW50LCBtdXRlZDogYm9vbGVhbikge1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgU3RyaW5nKG11dGVkKSk7XG4gICAgYnRuLnRpdGxlID0gbXV0ZWQgPyBcIlVubXV0ZSAoTSlcIiA6IFwiTXV0ZSAoTSlcIjtcbiAgICBidG4udGV4dENvbnRlbnQgPSBtdXRlZCA/IFwiXHVEODNEXHVERDA4IFVubXV0ZVwiIDogXCJcdUQ4M0RcdUREMDcgTXV0ZVwiO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseVVJKG11dGVkOiBib29sZWFuKSB7XG4gICAgdGhpcy5idXR0b25zLmZvckVhY2goYiA9PiB0aGlzLmxhYmVsKGIsIG11dGVkKSk7XG4gIH1cblxuICBhdHRhY2hCdXR0b24oYnRuOiBIVE1MQnV0dG9uRWxlbWVudCkge1xuICAgIHRoaXMuYnV0dG9ucy5wdXNoKGJ0bik7XG4gICAgdGhpcy5sYWJlbChidG4sIHRoaXMuaXNNdXRlZCgpKTtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMudG9nZ2xlKCkpO1xuICB9XG5cbiAgYXN5bmMgc2V0TXV0ZWQobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNhdmUobXV0ZWQpO1xuICAgIHRoaXMuYXBwbHlVSShtdXRlZCk7XG5cbiAgICBjb25zdCBjdHggPSBnZXRDdHgoKTtcbiAgICBpZiAoY3R4KSB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAobXV0ZWQgJiYgY3R4LnN0YXRlICE9PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgICAgICAgYXdhaXQgY3R4LnN1c3BlbmQoKTtcbiAgICAgICAgfSBlbHNlIGlmICghbXV0ZWQgJiYgY3R4LnN0YXRlICE9PSBcInJ1bm5pbmdcIikge1xuICAgICAgICAgIGF3YWl0IGN0eC5yZXN1bWUoKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXCJbYXVkaW9dIG11dGUgdG9nZ2xlIGZhaWxlZDpcIiwgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoXCJsc2Q6bXV0ZUNoYW5nZWRcIiwgeyBkZXRhaWw6IHsgbXV0ZWQgfSB9KSk7XG4gIH1cblxuICB0b2dnbGUoKSB7XG4gICAgdGhpcy5zZXRNdXRlZCghdGhpcy5pc011dGVkKCkpO1xuICB9XG5cbiAgLy8gSWYgY3R4IGlzbid0IGNyZWF0ZWQgdW50aWwgYWZ0ZXIgU3RhcnQsIGVuZm9yY2UgcGVyc2lzdGVkIHN0YXRlIG9uY2UgYXZhaWxhYmxlXG4gIGVuZm9yY2VPbmNlV2hlblJlYWR5KCkge1xuICAgIGlmICh0aGlzLmVuZm9yY2luZykgcmV0dXJuO1xuICAgIHRoaXMuZW5mb3JjaW5nID0gdHJ1ZTtcbiAgICBjb25zdCB0aWNrID0gKCkgPT4ge1xuICAgICAgY29uc3QgY3R4ID0gZ2V0Q3R4KCk7XG4gICAgICBpZiAoIWN0eCkgeyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGljayk7IHJldHVybjsgfVxuICAgICAgdGhpcy5zZXRNdXRlZCh0aGlzLmlzTXV0ZWQoKSk7XG4gICAgfTtcbiAgICB0aWNrKCk7XG4gIH1cbn1cblxuY29uc3QgbXV0ZU1nciA9IG5ldyBNdXRlTWFuYWdlcigpO1xuXG4vLyBJbnN0YWxsIGEgbXV0ZSBidXR0b24gaW4gdGhlIHRvcCBmcmFtZSAocmlnaHQgc2lkZSkgaWYgcG9zc2libGUuXG5mdW5jdGlvbiBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKSB7XG4gIGNvbnN0IHRvcFJpZ2h0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0b3AtcmlnaHRcIik7XG4gIGlmICghdG9wUmlnaHQpIHJldHVybjtcblxuICAvLyBBdm9pZCBkdXBsaWNhdGVzXG4gIGlmICh0b3BSaWdodC5xdWVyeVNlbGVjdG9yKFwiI211dGUtdG9wXCIpKSByZXR1cm47XG5cbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLmlkID0gXCJtdXRlLXRvcFwiO1xuICBidG4uY2xhc3NOYW1lID0gXCJnaG9zdC1idG4gc21hbGxcIjtcbiAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcImZhbHNlXCIpO1xuICBidG4udGl0bGUgPSBcIk11dGUgKE0pXCI7XG4gIGJ0bi50ZXh0Q29udGVudCA9IFwiXHVEODNEXHVERDA3IE11dGVcIjtcbiAgdG9wUmlnaHQuYXBwZW5kQ2hpbGQoYnRuKTtcbiAgbXV0ZU1nci5hdHRhY2hCdXR0b24oYnRuKTtcbn1cblxuLy8gR2xvYmFsIGtleWJvYXJkIHNob3J0Y3V0IChNKVxuKGZ1bmN0aW9uIGluc3RhbGxNdXRlSG90a2V5KCkge1xuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHtcbiAgICBpZiAoZS5rZXk/LnRvTG93ZXJDYXNlKCkgPT09IFwibVwiKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBtdXRlTWdyLnRvZ2dsZSgpO1xuICAgIH1cbiAgfSk7XG59KSgpO1xuXG5leHBvcnQgZnVuY3Rpb24gd2FpdEZvclVzZXJTdGFydChvcHRzOiBTdGFydEdhdGVPcHRpb25zID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgeyBsYWJlbCA9IFwiU3RhcnQgR2FtZVwiLCByZXF1ZXN0RnVsbHNjcmVlbiA9IGZhbHNlLCByZXN1bWVBdWRpbyB9ID0gb3B0cztcblxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAvLyBvdmVybGF5XG4gICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgb3ZlcmxheS5pZCA9IFwic3RhcnQtb3ZlcmxheVwiO1xuICAgIG92ZXJsYXkuaW5uZXJIVE1MID0gYFxuICAgICAgPGRpdiBpZD1cInN0YXJ0LWNvbnRhaW5lclwiPlxuICAgICAgICA8YnV0dG9uIGlkPVwic3RhcnQtYnRuXCIgYXJpYS1sYWJlbD1cIiR7bGFiZWx9XCI+JHtsYWJlbH08L2J1dHRvbj5cbiAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi10b3A6MTBweFwiPlxuICAgICAgICAgIDxidXR0b24gaWQ9XCJtdXRlLWJlbG93LXN0YXJ0XCIgY2xhc3M9XCJnaG9zdC1idG5cIiBhcmlhLXByZXNzZWQ9XCJmYWxzZVwiIHRpdGxlPVwiTXV0ZSAoTSlcIj5cdUQ4M0RcdUREMDcgTXV0ZTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPHA+IE9uIG1vYmlsZSB0dXJuIHBob25lIHRvIGxhbmRzY2FwZSBmb3IgYmVzdCBleHBlcmllbmNlLiA8L3A+XG4gICAgICA8L2Rpdj5cbiAgICBgO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgICAvLyBzdHlsZXMgKG1vdmUgdG8gQ1NTIGxhdGVyIGlmIHlvdSB3YW50KVxuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgI3N0YXJ0LW92ZXJsYXkge1xuICAgICAgICBwb3NpdGlvbjogZml4ZWQ7IGluc2V0OiAwOyBkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgYmFja2dyb3VuZDogcmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCBjZW50ZXIsIHJnYmEoMCwwLDAsMC42KSwgcmdiYSgwLDAsMCwwLjkpKTtcbiAgICAgICAgei1pbmRleDogOTk5OTtcbiAgICAgIH1cbiAgICAgICNzdGFydC1jb250YWluZXIgeyB0ZXh0LWFsaWduOiBjZW50ZXI7IH1cbiAgICAgICNzdGFydC1idG4ge1xuICAgICAgICBmb250LXNpemU6IDJyZW07IHBhZGRpbmc6IDFyZW0gMi41cmVtOyBib3JkZXI6IDJweCBzb2xpZCAjZmZmOyBib3JkZXItcmFkaXVzOiAxMHB4O1xuICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6ICNmZmY7IGN1cnNvcjogcG9pbnRlcjsgdHJhbnNpdGlvbjogdHJhbnNmb3JtIC4xMnMgZWFzZSwgYmFja2dyb3VuZCAuMnMgZWFzZSwgY29sb3IgLjJzIGVhc2U7XG4gICAgICB9XG4gICAgICAjc3RhcnQtYnRuOmhvdmVyIHsgYmFja2dyb3VuZDogI2ZmZjsgY29sb3I6ICMwMDA7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMXB4KTsgfVxuICAgICAgI3N0YXJ0LWJ0bjphY3RpdmUgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMCk7IH1cbiAgICAgICNtdXRlLWJlbG93LXN0YXJ0IHtcbiAgICAgICAgZm9udC1zaXplOiAxcmVtOyBwYWRkaW5nOiAuNXJlbSAxcmVtOyBib3JkZXItcmFkaXVzOiA5OTlweDsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgICAgYmFja2dyb3VuZDogcmdiYSgzMCwgNDEsIDU5LCAwLjcyKTsgY29sb3I6ICNmOGZhZmM7XG4gICAgICB9XG4gICAgICAuZ2hvc3QtYnRuLnNtYWxsIHsgcGFkZGluZzogNHB4IDhweDsgZm9udC1zaXplOiAxMXB4OyB9XG4gICAgYDtcbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcblxuICAgIC8vIFdpcmUgb3ZlcmxheSBidXR0b25zXG4gICAgY29uc3Qgc3RhcnRCdG4gPSBvdmVybGF5LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFwiI3N0YXJ0LWJ0blwiKSE7XG4gICAgY29uc3QgbXV0ZUJlbG93U3RhcnQgPSBvdmVybGF5LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFwiI211dGUtYmVsb3ctc3RhcnRcIikhO1xuICAgIGNvbnN0IHRvcE11dGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm11dGUtdG9wXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBpZiAodG9wTXV0ZSkgbXV0ZU1nci5hdHRhY2hCdXR0b24odG9wTXV0ZSk7XG4gICAgbXV0ZU1nci5hdHRhY2hCdXR0b24obXV0ZUJlbG93U3RhcnQpO1xuXG4gICAgLy8gcmVzdG9yZSBwZXJzaXN0ZWQgbXV0ZSBsYWJlbCBpbW1lZGlhdGVseVxuICAgIG11dGVNZ3IuZW5mb3JjZU9uY2VXaGVuUmVhZHkoKTtcblxuICAgIGNvbnN0IHN0YXJ0ID0gYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gYXVkaW8gZmlyc3QgKHVzZXIgZ2VzdHVyZSlcbiAgICAgIHRyeSB7IGF3YWl0IHJlc3VtZUF1ZGlvPy4oKTsgfSBjYXRjaCB7fVxuXG4gICAgICAvLyByZXNwZWN0IHBlcnNpc3RlZCBtdXRlIHN0YXRlIG5vdyB0aGF0IGN0eCBsaWtlbHkgZXhpc3RzXG4gICAgICBtdXRlTWdyLmVuZm9yY2VPbmNlV2hlblJlYWR5KCk7XG5cbiAgICAgIC8vIG9wdGlvbmFsIGZ1bGxzY3JlZW5cbiAgICAgIGlmIChyZXF1ZXN0RnVsbHNjcmVlbikge1xuICAgICAgICB0cnkgeyBhd2FpdCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQucmVxdWVzdEZ1bGxzY3JlZW4/LigpOyB9IGNhdGNoIHt9XG4gICAgICB9XG5cbiAgICAgIC8vIGNsZWFudXAgb3ZlcmxheVxuICAgICAgc3R5bGUucmVtb3ZlKCk7XG4gICAgICBvdmVybGF5LnJlbW92ZSgpO1xuXG4gICAgICAvLyBlbnN1cmUgdG9wLWZyYW1lIG11dGUgYnV0dG9uIGV4aXN0cyBhZnRlciBvdmVybGF5XG4gICAgICBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKTtcblxuICAgICAgcmVzb2x2ZSgpO1xuICAgIH07XG5cbiAgICAvLyBzdGFydCBidXR0b25cbiAgICBzdGFydEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgc3RhcnQsIHsgb25jZTogdHJ1ZSB9KTtcblxuICAgIC8vIEFjY2Vzc2liaWxpdHk6IGFsbG93IEVudGVyIC8gU3BhY2VcbiAgICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XG4gICAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiB8fCBlLmtleSA9PT0gXCIgXCIpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBzdGFydCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gRm9jdXMgZm9yIGtleWJvYXJkIHVzZXJzXG4gICAgc3RhcnRCdG4udGFiSW5kZXggPSAwO1xuICAgIHN0YXJ0QnRuLmZvY3VzKCk7XG5cbiAgICAvLyBBbHNvIHRyeSB0byBjcmVhdGUgdGhlIHRvcC1mcmFtZSBtdXRlIGltbWVkaWF0ZWx5IGlmIERPTSBpcyByZWFkeVxuICAgIC8vIChJZiAjdG9wLXJpZ2h0IGlzbid0IHRoZXJlIHlldCwgaXQncyBoYXJtbGVzczsgd2UnbGwgYWRkIGl0IGFmdGVyIHN0YXJ0IHRvby4pXG4gICAgZW5zdXJlVG9wRnJhbWVNdXRlQnV0dG9uKCk7XG4gIH0pO1xufVxuIiwgImltcG9ydCB7IG1ha2VQUk5HIH0gZnJvbSBcIi4uLy4uL2VuZ2luZVwiO1xuXG5leHBvcnQgdHlwZSBBbWJpZW50UGFyYW1zID0ge1xuICBpbnRlbnNpdHk6IG51bWJlcjsgIC8vIG92ZXJhbGwgbG91ZG5lc3MgLyBlbmVyZ3kgKDAuLjEpXG4gIGJyaWdodG5lc3M6IG51bWJlcjsgLy8gZmlsdGVyIG9wZW5uZXNzICYgY2hvcmQgdGltYnJlICgwLi4xKVxuICBkZW5zaXR5OiBudW1iZXI7ICAgIC8vIGNob3JkIHNwYXduIHJhdGUgLyB0aGlja25lc3MgKDAuLjEpXG59O1xuXG50eXBlIE1vZGVOYW1lID0gXCJJb25pYW5cIiB8IFwiRG9yaWFuXCIgfCBcIlBocnlnaWFuXCIgfCBcIkx5ZGlhblwiIHwgXCJNaXhvbHlkaWFuXCIgfCBcIkFlb2xpYW5cIiB8IFwiTG9jcmlhblwiO1xuXG5jb25zdCBNT0RFUzogUmVjb3JkPE1vZGVOYW1lLCBudW1iZXJbXT4gPSB7XG4gIElvbmlhbjogICAgIFswLDIsNCw1LDcsOSwxMV0sXG4gIERvcmlhbjogICAgIFswLDIsMyw1LDcsOSwxMF0sXG4gIFBocnlnaWFuOiAgIFswLDEsMyw1LDcsOCwxMF0sXG4gIEx5ZGlhbjogICAgIFswLDIsNCw2LDcsOSwxMV0sXG4gIE1peG9seWRpYW46IFswLDIsNCw1LDcsOSwxMF0sXG4gIEFlb2xpYW46ICAgIFswLDIsMyw1LDcsOCwxMF0sXG4gIExvY3JpYW46ICAgIFswLDEsMyw1LDYsOCwxMF0sXG59O1xuXG4vLyBNdXNpY2FsIGNvbnN0YW50cyB0dW5lZCB0byBtYXRjaCB0aGUgSFRNTCB2ZXJzaW9uXG5jb25zdCBST09UX01BWF9HQUlOICAgICA9IDAuMzM7XG5jb25zdCBST09UX1NXRUxMX1RJTUUgICA9IDIwO1xuY29uc3QgRFJPTkVfU0hJRlRfTUlOX1MgPSAyNDtcbmNvbnN0IERST05FX1NISUZUX01BWF9TID0gNDg7XG5jb25zdCBEUk9ORV9HTElERV9NSU5fUyA9IDg7XG5jb25zdCBEUk9ORV9HTElERV9NQVhfUyA9IDE1O1xuXG5jb25zdCBDSE9SRF9WT0lDRVNfTUFYICA9IDU7XG5jb25zdCBDSE9SRF9GQURFX01JTl9TICA9IDg7XG5jb25zdCBDSE9SRF9GQURFX01BWF9TICA9IDE2O1xuY29uc3QgQ0hPUkRfSE9MRF9NSU5fUyAgPSAxMDtcbmNvbnN0IENIT1JEX0hPTERfTUFYX1MgID0gMjI7XG5jb25zdCBDSE9SRF9HQVBfTUlOX1MgICA9IDQ7XG5jb25zdCBDSE9SRF9HQVBfTUFYX1MgICA9IDk7XG5jb25zdCBDSE9SRF9BTkNIT1JfUFJPQiA9IDAuNjsgLy8gcHJlZmVyIGFsaWduaW5nIGNob3JkIHJvb3QgdG8gZHJvbmVcblxuY29uc3QgRklMVEVSX0JBU0VfSFogICAgPSAyMjA7XG5jb25zdCBGSUxURVJfUEVBS19IWiAgICA9IDQyMDA7XG5jb25zdCBTV0VFUF9TRUdfUyAgICAgICA9IDMwOyAgLy8gdXAgdGhlbiBkb3duLCB2ZXJ5IHNsb3dcbmNvbnN0IExGT19SQVRFX0haICAgICAgID0gMC4wNTtcbmNvbnN0IExGT19ERVBUSF9IWiAgICAgID0gOTAwO1xuXG5jb25zdCBERUxBWV9USU1FX1MgICAgICA9IDAuNDU7XG5jb25zdCBGRUVEQkFDS19HQUlOICAgICA9IDAuMzU7XG5jb25zdCBXRVRfTUlYICAgICAgICAgICA9IDAuMjg7XG5cbi8vIGRlZ3JlZSBwcmVmZXJlbmNlIGZvciBkcm9uZSBtb3ZlczogMSw1LDMsNiwyLDQsNyAoaW5kZXhlcyAwLi42KVxuY29uc3QgUFJFRkVSUkVEX0RFR1JFRV9PUkRFUiA9IFswLDQsMiw1LDEsMyw2XTtcblxuLyoqIFV0aWxpdHkgKi9cbmNvbnN0IGNsYW1wMDEgPSAoeDogbnVtYmVyKSA9PiBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCB4KSk7XG5jb25zdCByYW5kID0gKHJuZzogKCkgPT4gbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYSArIHJuZygpICogKGIgLSBhKTtcbmNvbnN0IGNob2ljZSA9IDxULD4ocm5nOiAoKSA9PiBudW1iZXIsIGFycjogVFtdKSA9PiBhcnJbTWF0aC5mbG9vcihybmcoKSAqIGFyci5sZW5ndGgpXTtcblxuY29uc3QgbWlkaVRvRnJlcSA9IChtOiBudW1iZXIpID0+IDQ0MCAqIE1hdGgucG93KDIsIChtIC0gNjkpIC8gMTIpO1xuXG4vKiogQSBzaW5nbGUgc3RlYWR5IG9zY2lsbGF0b3Igdm9pY2Ugd2l0aCBzaGltbWVyIGRldHVuZSBhbmQgZ2FpbiBlbnZlbG9wZS4gKi9cbmNsYXNzIFZvaWNlIHtcbiAgcHJpdmF0ZSBraWxsZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSBzaGltbWVyOiBPc2NpbGxhdG9yTm9kZTtcbiAgcHJpdmF0ZSBzaGltbWVyR2FpbjogR2Fpbk5vZGU7XG4gIHByaXZhdGUgc2NhbGU6IEdhaW5Ob2RlO1xuICBwdWJsaWMgZzogR2Fpbk5vZGU7XG4gIHB1YmxpYyBvc2M6IE9zY2lsbGF0b3JOb2RlO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgY3R4OiBBdWRpb0NvbnRleHQsXG4gICAgcHJpdmF0ZSB0YXJnZXRHYWluOiBudW1iZXIsXG4gICAgd2F2ZWZvcm06IE9zY2lsbGF0b3JUeXBlLFxuICAgIGZyZXFIejogbnVtYmVyLFxuICAgIGRlc3RpbmF0aW9uOiBBdWRpb05vZGUsXG4gICAgcm5nOiAoKSA9PiBudW1iZXJcbiAgKXtcbiAgICB0aGlzLm9zYyA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZTogd2F2ZWZvcm0sIGZyZXF1ZW5jeTogZnJlcUh6IH0pO1xuXG4gICAgLy8gc3VidGxlIHNoaW1tZXIgdmlhIGRldHVuZSBtb2R1bGF0aW9uXG4gICAgdGhpcy5zaGltbWVyID0gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlOiBcInNpbmVcIiwgZnJlcXVlbmN5OiByYW5kKHJuZywgMC4wNiwgMC4xOCkgfSk7XG4gICAgdGhpcy5zaGltbWVyR2FpbiA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogcmFuZChybmcsIDAuNCwgMS4yKSB9KTtcbiAgICB0aGlzLnNjYWxlID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAyNSB9KTsgLy8gY2VudHMgcmFuZ2VcbiAgICB0aGlzLnNoaW1tZXIuY29ubmVjdCh0aGlzLnNoaW1tZXJHYWluKS5jb25uZWN0KHRoaXMuc2NhbGUpLmNvbm5lY3QodGhpcy5vc2MuZGV0dW5lKTtcblxuICAgIHRoaXMuZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgICB0aGlzLm9zYy5jb25uZWN0KHRoaXMuZykuY29ubmVjdChkZXN0aW5hdGlvbik7XG5cbiAgICB0aGlzLm9zYy5zdGFydCgpO1xuICAgIHRoaXMuc2hpbW1lci5zdGFydCgpO1xuICB9XG5cbiAgZmFkZUluKHNlY29uZHM6IG51bWJlcikge1xuICAgIGNvbnN0IG5vdyA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgIHRoaXMuZy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRoaXMuZy5nYWluLnNldFZhbHVlQXRUaW1lKHRoaXMuZy5nYWluLnZhbHVlLCBub3cpO1xuICAgIHRoaXMuZy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRoaXMudGFyZ2V0R2Fpbiwgbm93ICsgc2Vjb25kcyk7XG4gIH1cblxuICBmYWRlT3V0S2lsbChzZWNvbmRzOiBudW1iZXIpIHtcbiAgICBpZiAodGhpcy5raWxsZWQpIHJldHVybjtcbiAgICB0aGlzLmtpbGxlZCA9IHRydWU7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgdGhpcy5nLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdGhpcy5nLmdhaW4uc2V0VmFsdWVBdFRpbWUodGhpcy5nLmdhaW4udmFsdWUsIG5vdyk7XG4gICAgdGhpcy5nLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wMDAxLCBub3cgKyBzZWNvbmRzKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMuc3RvcCgpLCBzZWNvbmRzICogMTAwMCArIDYwKTtcbiAgfVxuXG4gIHNldEZyZXFHbGlkZSh0YXJnZXRIejogbnVtYmVyLCBnbGlkZVNlY29uZHM6IG51bWJlcikge1xuICAgIGNvbnN0IG5vdyA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgIC8vIGV4cG9uZW50aWFsIHdoZW4gcG9zc2libGUgZm9yIHNtb290aG5lc3NcbiAgICBjb25zdCBjdXJyZW50ID0gTWF0aC5tYXgoMC4wMDAxLCB0aGlzLm9zYy5mcmVxdWVuY3kudmFsdWUpO1xuICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LnNldFZhbHVlQXRUaW1lKGN1cnJlbnQsIG5vdyk7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kuZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSh0YXJnZXRIeiwgbm93ICsgZ2xpZGVTZWNvbmRzKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0YXJnZXRIeiwgbm93ICsgZ2xpZGVTZWNvbmRzKTtcbiAgICB9XG4gIH1cblxuICBzdG9wKCkge1xuICAgIHRyeSB7IHRoaXMub3NjLnN0b3AoKTsgdGhpcy5zaGltbWVyLnN0b3AoKTsgfSBjYXRjaCB7fVxuICAgIHRyeSB7XG4gICAgICB0aGlzLm9zYy5kaXNjb25uZWN0KCk7IHRoaXMuc2hpbW1lci5kaXNjb25uZWN0KCk7XG4gICAgICB0aGlzLmcuZGlzY29ubmVjdCgpOyB0aGlzLnNoaW1tZXJHYWluLmRpc2Nvbm5lY3QoKTsgdGhpcy5zY2FsZS5kaXNjb25uZWN0KCk7XG4gICAgfSBjYXRjaCB7fVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBBbWJpZW50U2NlbmUge1xuICBwcml2YXRlIHJ1bm5pbmcgPSBmYWxzZTtcbiAgcHJpdmF0ZSBzdG9wRm5zOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuICBwcml2YXRlIHRpbWVvdXRzOiBudW1iZXJbXSA9IFtdO1xuXG4gIHByaXZhdGUgcGFyYW1zOiBBbWJpZW50UGFyYW1zID0geyBpbnRlbnNpdHk6IDAuNzUsIGJyaWdodG5lc3M6IDAuNSwgZGVuc2l0eTogMC42IH07XG5cbiAgcHJpdmF0ZSBybmc6ICgpID0+IG51bWJlcjtcbiAgcHJpdmF0ZSBtYXN0ZXIhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBmaWx0ZXIhOiBCaXF1YWRGaWx0ZXJOb2RlO1xuICBwcml2YXRlIGRyeSE6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHdldCE6IEdhaW5Ob2RlO1xuICBwcml2YXRlIGRlbGF5ITogRGVsYXlOb2RlO1xuICBwcml2YXRlIGZlZWRiYWNrITogR2Fpbk5vZGU7XG5cbiAgcHJpdmF0ZSBsZm9Ob2RlPzogT3NjaWxsYXRvck5vZGU7XG4gIHByaXZhdGUgbGZvR2Fpbj86IEdhaW5Ob2RlO1xuXG4gIC8vIG11c2ljYWwgc3RhdGVcbiAgcHJpdmF0ZSBrZXlSb290TWlkaSA9IDQzO1xuICBwcml2YXRlIG1vZGU6IE1vZGVOYW1lID0gXCJJb25pYW5cIjtcbiAgcHJpdmF0ZSBkcm9uZURlZ3JlZUlkeCA9IDA7XG4gIHByaXZhdGUgcm9vdFZvaWNlOiBWb2ljZSB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgY3R4OiBBdWRpb0NvbnRleHQsXG4gICAgcHJpdmF0ZSBvdXQ6IEdhaW5Ob2RlLFxuICAgIHNlZWQgPSAxXG4gICkge1xuICAgIHRoaXMucm5nID0gbWFrZVBSTkcoc2VlZCk7XG4gIH1cblxuICBzZXRQYXJhbTxLIGV4dGVuZHMga2V5b2YgQW1iaWVudFBhcmFtcz4oazogSywgdjogQW1iaWVudFBhcmFtc1tLXSkge1xuICAgIHRoaXMucGFyYW1zW2tdID0gY2xhbXAwMSh2KTtcbiAgICBpZiAodGhpcy5ydW5uaW5nICYmIGsgPT09IFwiaW50ZW5zaXR5XCIgJiYgdGhpcy5tYXN0ZXIpIHtcbiAgICAgIHRoaXMubWFzdGVyLmdhaW4udmFsdWUgPSAwLjE1ICsgMC44NSAqIHRoaXMucGFyYW1zLmludGVuc2l0eTsgXG4gICAgfVxuICB9XG5cbiAgc3RhcnQoKSB7XG4gICAgaWYgKHRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIHRoaXMucnVubmluZyA9IHRydWU7XG5cbiAgICAvLyAtLS0tIENvcmUgZ3JhcGggKGZpbHRlciAtPiBkcnkrZGVsYXkgLT4gbWFzdGVyIC0+IG91dCkgLS0tLVxuICAgIHRoaXMubWFzdGVyID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IDAuMTUgKyAwLjg1ICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5IH0pO1xuICAgIHRoaXMuZmlsdGVyID0gbmV3IEJpcXVhZEZpbHRlck5vZGUodGhpcy5jdHgsIHsgdHlwZTogXCJsb3dwYXNzXCIsIFE6IDAuNzA3IH0pO1xuICAgIHRoaXMuZHJ5ID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IDEgfSk7XG4gICAgdGhpcy53ZXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogV0VUX01JWCB9KTtcbiAgICB0aGlzLmRlbGF5ID0gbmV3IERlbGF5Tm9kZSh0aGlzLmN0eCwgeyBkZWxheVRpbWU6IERFTEFZX1RJTUVfUywgbWF4RGVsYXlUaW1lOiAyIH0pO1xuICAgIHRoaXMuZmVlZGJhY2sgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogRkVFREJBQ0tfR0FJTiB9KTtcblxuICAgIHRoaXMuZmlsdGVyLmNvbm5lY3QodGhpcy5kcnkpLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMuZmlsdGVyLmNvbm5lY3QodGhpcy5kZWxheSk7XG4gICAgdGhpcy5kZWxheS5jb25uZWN0KHRoaXMuZmVlZGJhY2spLmNvbm5lY3QodGhpcy5kZWxheSk7XG4gICAgdGhpcy5kZWxheS5jb25uZWN0KHRoaXMud2V0KS5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLm1hc3Rlci5jb25uZWN0KHRoaXMub3V0KTtcblxuICAgIC8vIC0tLS0gRmlsdGVyIGJhc2VsaW5lICsgc2xvdyBzd2VlcHMgLS0tLVxuICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5zZXRWYWx1ZUF0VGltZShGSUxURVJfQkFTRV9IWiwgdGhpcy5jdHguY3VycmVudFRpbWUpO1xuICAgIGNvbnN0IHN3ZWVwID0gKCkgPT4ge1xuICAgICAgY29uc3QgdCA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICAgIC8vIHVwIHRoZW4gZG93biB1c2luZyB2ZXJ5IHNsb3cgdGltZSBjb25zdGFudHNcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5zZXRUYXJnZXRBdFRpbWUoXG4gICAgICAgIEZJTFRFUl9CQVNFX0haICsgKEZJTFRFUl9QRUFLX0haIC0gRklMVEVSX0JBU0VfSFopICogKDAuNCArIDAuNiAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpLFxuICAgICAgICB0LCBTV0VFUF9TRUdfUyAvIDNcbiAgICAgICk7XG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VGFyZ2V0QXRUaW1lKFxuICAgICAgICBGSUxURVJfQkFTRV9IWiAqICgwLjcgKyAwLjMgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKSxcbiAgICAgICAgdCArIFNXRUVQX1NFR19TLCBTV0VFUF9TRUdfUyAvIDNcbiAgICAgICk7XG4gICAgICB0aGlzLnRpbWVvdXRzLnB1c2god2luZG93LnNldFRpbWVvdXQoKCkgPT4gdGhpcy5ydW5uaW5nICYmIHN3ZWVwKCksIChTV0VFUF9TRUdfUyAqIDIpICogMTAwMCkgYXMgdW5rbm93biBhcyBudW1iZXIpO1xuICAgIH07XG4gICAgc3dlZXAoKTtcblxuICAgIC8vIC0tLS0gR2VudGxlIExGTyBvbiBmaWx0ZXIgZnJlcSAoc21hbGwgZGVwdGgpIC0tLS1cbiAgICB0aGlzLmxmb05vZGUgPSBuZXcgT3NjaWxsYXRvck5vZGUodGhpcy5jdHgsIHsgdHlwZTogXCJzaW5lXCIsIGZyZXF1ZW5jeTogTEZPX1JBVEVfSFogfSk7XG4gICAgdGhpcy5sZm9HYWluID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IExGT19ERVBUSF9IWiAqICgwLjUgKyAwLjUgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKSB9KTtcbiAgICB0aGlzLmxmb05vZGUuY29ubmVjdCh0aGlzLmxmb0dhaW4pLmNvbm5lY3QodGhpcy5maWx0ZXIuZnJlcXVlbmN5KTtcbiAgICB0aGlzLmxmb05vZGUuc3RhcnQoKTtcblxuICAgIC8vIC0tLS0gU3Bhd24gcm9vdCBkcm9uZSAoZ2xpZGluZyB0byBkaWZmZXJlbnQgZGVncmVlcykgLS0tLVxuICAgIHRoaXMuc3Bhd25Sb290RHJvbmUoKTtcbiAgICB0aGlzLnNjaGVkdWxlTmV4dERyb25lTW92ZSgpO1xuXG4gICAgLy8gLS0tLSBDaG9yZCBjeWNsZSBsb29wIC0tLS1cbiAgICB0aGlzLmNob3JkQ3ljbGUoKTtcblxuICAgIC8vIGNsZWFudXBcbiAgICB0aGlzLnN0b3BGbnMucHVzaCgoKSA9PiB7XG4gICAgICB0cnkgeyB0aGlzLmxmb05vZGU/LnN0b3AoKTsgfSBjYXRjaCB7fVxuICAgICAgW3RoaXMubWFzdGVyLCB0aGlzLmZpbHRlciwgdGhpcy5kcnksIHRoaXMud2V0LCB0aGlzLmRlbGF5LCB0aGlzLmZlZWRiYWNrLCB0aGlzLmxmb05vZGUsIHRoaXMubGZvR2Fpbl1cbiAgICAgICAgLmZvckVhY2gobiA9PiB7IHRyeSB7IG4/LmRpc2Nvbm5lY3QoKTsgfSBjYXRjaCB7fSB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcblxuICAgIC8vIGNhbmNlbCB0aW1lb3V0c1xuICAgIHRoaXMudGltZW91dHMuc3BsaWNlKDApLmZvckVhY2goaWQgPT4gd2luZG93LmNsZWFyVGltZW91dChpZCkpO1xuXG4gICAgLy8gZmFkZSBhbmQgY2xlYW51cCB2b2ljZXNcbiAgICBpZiAodGhpcy5yb290Vm9pY2UpIHRoaXMucm9vdFZvaWNlLmZhZGVPdXRLaWxsKDEuMik7XG5cbiAgICAvLyBydW4gZGVmZXJyZWQgc3RvcHNcbiAgICB0aGlzLnN0b3BGbnMuc3BsaWNlKDApLmZvckVhY2goZm4gPT4gZm4oKSk7XG4gIH1cblxuICAvKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIE11c2ljYWwgZW5naW5lIGJlbG93IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gKi9cblxuICBwcml2YXRlIGN1cnJlbnREZWdyZWVzKCk6IG51bWJlcltdIHtcbiAgICByZXR1cm4gTU9ERVNbdGhpcy5tb2RlXSB8fCBNT0RFUy5MeWRpYW47XG4gIH1cblxuICAvKiogRHJvbmUgcm9vdCB2b2ljZSAqL1xuICBwcml2YXRlIHNwYXduUm9vdERyb25lKCkge1xuICAgIGNvbnN0IGJhc2VNaWRpID0gdGhpcy5rZXlSb290TWlkaSArIHRoaXMuY3VycmVudERlZ3JlZXMoKVt0aGlzLmRyb25lRGVncmVlSWR4XTtcbiAgICBjb25zdCB2ID0gbmV3IFZvaWNlKFxuICAgICAgdGhpcy5jdHgsXG4gICAgICBST09UX01BWF9HQUlOLFxuICAgICAgXCJzaW5lXCIsXG4gICAgICBtaWRpVG9GcmVxKGJhc2VNaWRpKSxcbiAgICAgIHRoaXMuZmlsdGVyLFxuICAgICAgdGhpcy5ybmdcbiAgICApO1xuICAgIHYuZmFkZUluKFJPT1RfU1dFTExfVElNRSk7XG4gICAgdGhpcy5yb290Vm9pY2UgPSB2O1xuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZU5leHREcm9uZU1vdmUoKSB7XG4gICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICBjb25zdCB3YWl0TXMgPSByYW5kKHRoaXMucm5nLCBEUk9ORV9TSElGVF9NSU5fUywgRFJPTkVfU0hJRlRfTUFYX1MpICogMTAwMDtcbiAgICBjb25zdCBpZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICghdGhpcy5ydW5uaW5nIHx8ICF0aGlzLnJvb3RWb2ljZSkgcmV0dXJuO1xuICAgICAgY29uc3QgZ2xpZGUgPSByYW5kKHRoaXMucm5nLCBEUk9ORV9HTElERV9NSU5fUywgRFJPTkVfR0xJREVfTUFYX1MpO1xuICAgICAgY29uc3QgbmV4dElkeCA9IHRoaXMucGlja05leHREcm9uZURlZ3JlZUlkeCgpO1xuICAgICAgY29uc3QgdGFyZ2V0TWlkaSA9IHRoaXMua2V5Um9vdE1pZGkgKyB0aGlzLmN1cnJlbnREZWdyZWVzKClbbmV4dElkeF07XG4gICAgICB0aGlzLnJvb3RWb2ljZS5zZXRGcmVxR2xpZGUobWlkaVRvRnJlcSh0YXJnZXRNaWRpKSwgZ2xpZGUpO1xuICAgICAgdGhpcy5kcm9uZURlZ3JlZUlkeCA9IG5leHRJZHg7XG4gICAgICB0aGlzLnNjaGVkdWxlTmV4dERyb25lTW92ZSgpO1xuICAgIH0sIHdhaXRNcykgYXMgdW5rbm93biBhcyBudW1iZXI7XG4gICAgdGhpcy50aW1lb3V0cy5wdXNoKGlkKTtcbiAgfVxuXG4gIHByaXZhdGUgcGlja05leHREcm9uZURlZ3JlZUlkeCgpOiBudW1iZXIge1xuICAgIGNvbnN0IG9yZGVyID0gWy4uLlBSRUZFUlJFRF9ERUdSRUVfT1JERVJdO1xuICAgIGNvbnN0IGkgPSBvcmRlci5pbmRleE9mKHRoaXMuZHJvbmVEZWdyZWVJZHgpO1xuICAgIGlmIChpID49IDApIHsgY29uc3QgW2N1cl0gPSBvcmRlci5zcGxpY2UoaSwgMSk7IG9yZGVyLnB1c2goY3VyKTsgfVxuICAgIHJldHVybiBjaG9pY2UodGhpcy5ybmcsIG9yZGVyKTtcbiAgfVxuXG4gIC8qKiBCdWlsZCBkaWF0b25pYyBzdGFja2VkLXRoaXJkIGNob3JkIGRlZ3JlZXMgd2l0aCBvcHRpb25hbCBleHRlbnNpb25zICovXG4gIHByaXZhdGUgYnVpbGRDaG9yZERlZ3JlZXMobW9kZURlZ3M6IG51bWJlcltdLCByb290SW5kZXg6IG51bWJlciwgc2l6ZSA9IDQsIGFkZDkgPSBmYWxzZSwgYWRkMTEgPSBmYWxzZSwgYWRkMTMgPSBmYWxzZSkge1xuICAgIGNvbnN0IHN0ZXBzID0gWzAsIDIsIDQsIDZdOyAvLyB0aGlyZHMgb3ZlciA3LW5vdGUgc2NhbGVcbiAgICBjb25zdCBjaG9yZElkeHMgPSBzdGVwcy5zbGljZSgwLCBNYXRoLm1pbihzaXplLCA0KSkubWFwKHMgPT4gKHJvb3RJbmRleCArIHMpICUgNyk7XG4gICAgaWYgKGFkZDkpICBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgOCkgJSA3KTtcbiAgICBpZiAoYWRkMTEpIGNob3JkSWR4cy5wdXNoKChyb290SW5kZXggKyAxMCkgJSA3KTtcbiAgICBpZiAoYWRkMTMpIGNob3JkSWR4cy5wdXNoKChyb290SW5kZXggKyAxMikgJSA3KTtcbiAgICByZXR1cm4gY2hvcmRJZHhzLm1hcChpID0+IG1vZGVEZWdzW2ldKTtcbiAgfVxuXG4gIHByaXZhdGUgKmVuZGxlc3NDaG9yZHMoKSB7XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGNvbnN0IG1vZGVEZWdzID0gdGhpcy5jdXJyZW50RGVncmVlcygpO1xuICAgICAgLy8gY2hvb3NlIGNob3JkIHJvb3QgZGVncmVlIChvZnRlbiBhbGlnbiB3aXRoIGRyb25lKVxuICAgICAgY29uc3Qgcm9vdERlZ3JlZUluZGV4ID0gKHRoaXMucm5nKCkgPCBDSE9SRF9BTkNIT1JfUFJPQikgPyB0aGlzLmRyb25lRGVncmVlSWR4IDogTWF0aC5mbG9vcih0aGlzLnJuZygpICogNyk7XG5cbiAgICAgIC8vIGNob3JkIHNpemUgLyBleHRlbnNpb25zXG4gICAgICBjb25zdCByID0gdGhpcy5ybmcoKTtcbiAgICAgIGxldCBzaXplID0gMzsgbGV0IGFkZDkgPSBmYWxzZSwgYWRkMTEgPSBmYWxzZSwgYWRkMTMgPSBmYWxzZTtcbiAgICAgIGlmIChyIDwgMC4zNSkgICAgICAgICAgICB7IHNpemUgPSAzOyB9XG4gICAgICBlbHNlIGlmIChyIDwgMC43NSkgICAgICAgeyBzaXplID0gNDsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuOTApICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDkgPSB0cnVlOyB9XG4gICAgICBlbHNlIGlmIChyIDwgMC45NykgICAgICAgeyBzaXplID0gNDsgYWRkMTEgPSB0cnVlOyB9XG4gICAgICBlbHNlICAgICAgICAgICAgICAgICAgICAgeyBzaXplID0gNDsgYWRkMTMgPSB0cnVlOyB9XG5cbiAgICAgIGNvbnN0IGNob3JkU2VtaXMgPSB0aGlzLmJ1aWxkQ2hvcmREZWdyZWVzKG1vZGVEZWdzLCByb290RGVncmVlSW5kZXgsIHNpemUsIGFkZDksIGFkZDExLCBhZGQxMyk7XG4gICAgICAvLyBzcHJlYWQgY2hvcmQgYWNyb3NzIG9jdGF2ZXMgKC0xMiwgMCwgKzEyKSwgYmlhcyB0byBjZW50ZXJcbiAgICAgIGNvbnN0IHNwcmVhZCA9IGNob3JkU2VtaXMubWFwKHNlbWkgPT4gc2VtaSArIGNob2ljZSh0aGlzLnJuZywgWy0xMiwgMCwgMCwgMTJdKSk7XG5cbiAgICAgIC8vIG9jY2FzaW9uYWxseSBlbnN1cmUgdG9uaWMgaXMgcHJlc2VudCBmb3IgZ3JvdW5kaW5nXG4gICAgICBpZiAoIXNwcmVhZC5pbmNsdWRlcygwKSAmJiB0aGlzLnJuZygpIDwgMC41KSBzcHJlYWQucHVzaCgwKTtcblxuICAgICAgeWllbGQgc3ByZWFkO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hvcmRDeWNsZSgpIHtcbiAgICBjb25zdCBnZW4gPSB0aGlzLmVuZGxlc3NDaG9yZHMoKTtcbiAgICBjb25zdCB2b2ljZXMgPSBuZXcgU2V0PFZvaWNlPigpO1xuXG4gICAgY29uc3Qgc2xlZXAgPSAobXM6IG51bWJlcikgPT4gbmV3IFByb21pc2U8dm9pZD4ociA9PiB7XG4gICAgICBjb25zdCBpZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHIoKSwgbXMpIGFzIHVua25vd24gYXMgbnVtYmVyO1xuICAgICAgdGhpcy50aW1lb3V0cy5wdXNoKGlkKTtcbiAgICB9KTtcblxuICAgIHdoaWxlICh0aGlzLnJ1bm5pbmcpIHtcbiAgICAgIC8vIGNob3JkIHNwYXduIHByb2JhYmlsaXR5IC8gdGhpY2tuZXNzIHNjYWxlIHdpdGggZGVuc2l0eSAmIGJyaWdodG5lc3NcbiAgICAgIGNvbnN0IHRoaWNrbmVzcyA9IE1hdGgucm91bmQoMiArIHRoaXMucGFyYW1zLmRlbnNpdHkgKiAzKTtcbiAgICAgIGNvbnN0IGJhc2VNaWRpID0gdGhpcy5rZXlSb290TWlkaTtcbiAgICAgIGNvbnN0IGRlZ3JlZXNPZmY6IG51bWJlcltdID0gZ2VuLm5leHQoKS52YWx1ZSA/PyBbXTtcblxuICAgICAgLy8gc3Bhd25cbiAgICAgIGZvciAoY29uc3Qgb2ZmIG9mIGRlZ3JlZXNPZmYpIHtcbiAgICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcpIGJyZWFrO1xuICAgICAgICBpZiAodm9pY2VzLnNpemUgPj0gTWF0aC5taW4oQ0hPUkRfVk9JQ0VTX01BWCwgdGhpY2tuZXNzKSkgYnJlYWs7XG5cbiAgICAgICAgY29uc3QgbWlkaSA9IGJhc2VNaWRpICsgb2ZmO1xuICAgICAgICBjb25zdCBmcmVxID0gbWlkaVRvRnJlcShtaWRpKTtcbiAgICAgICAgY29uc3Qgd2F2ZWZvcm0gPSBjaG9pY2UodGhpcy5ybmcsIFtcInNpbmVcIiwgXCJ0cmlhbmdsZVwiLCBcInNhd3Rvb3RoXCJdIGFzIE9zY2lsbGF0b3JUeXBlW10pO1xuXG4gICAgICAgIC8vIGxvdWRlciB3aXRoIGludGVuc2l0eTsgc2xpZ2h0bHkgYnJpZ2h0ZXIgLT4gc2xpZ2h0bHkgbG91ZGVyXG4gICAgICAgIGNvbnN0IGdhaW5UYXJnZXQgPSByYW5kKHRoaXMucm5nLCAwLjA4LCAwLjIyKSAqXG4gICAgICAgICAgKDAuODUgKyAwLjMgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHkpICpcbiAgICAgICAgICAoMC45ICsgMC4yICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyk7XG5cbiAgICAgICAgY29uc3QgdiA9IG5ldyBWb2ljZSh0aGlzLmN0eCwgZ2FpblRhcmdldCwgd2F2ZWZvcm0sIGZyZXEsIHRoaXMuZmlsdGVyLCB0aGlzLnJuZyk7XG4gICAgICAgIHZvaWNlcy5hZGQodik7XG4gICAgICAgIHYuZmFkZUluKHJhbmQodGhpcy5ybmcsIENIT1JEX0ZBREVfTUlOX1MsIENIT1JEX0ZBREVfTUFYX1MpKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgc2xlZXAocmFuZCh0aGlzLnJuZywgQ0hPUkRfSE9MRF9NSU5fUywgQ0hPUkRfSE9MRF9NQVhfUykgKiAxMDAwKTtcblxuICAgICAgLy8gZmFkZSBvdXRcbiAgICAgIGNvbnN0IG91dHMgPSBBcnJheS5mcm9tKHZvaWNlcyk7XG4gICAgICBmb3IgKGNvbnN0IHYgb2Ygb3V0cykgdi5mYWRlT3V0S2lsbChyYW5kKHRoaXMucm5nLCBDSE9SRF9GQURFX01JTl9TLCBDSE9SRF9GQURFX01BWF9TKSk7XG4gICAgICB2b2ljZXMuY2xlYXIoKTtcblxuICAgICAgYXdhaXQgc2xlZXAocmFuZCh0aGlzLnJuZywgQ0hPUkRfR0FQX01JTl9TLCBDSE9SRF9HQVBfTUFYX1MpICogMTAwMCk7XG4gICAgfVxuXG4gICAgLy8gc2FmZXR5OiBraWxsIGFueSBsaW5nZXJpbmcgdm9pY2VzXG4gICAgZm9yIChjb25zdCB2IG9mIEFycmF5LmZyb20odm9pY2VzKSkgdi5mYWRlT3V0S2lsbCgwLjgpO1xuICB9XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTY2VuZU5hbWUsIE11c2ljU2NlbmVPcHRpb25zIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuLi9lbmdpbmVcIjtcbmltcG9ydCB7IEFtYmllbnRTY2VuZSB9IGZyb20gXCIuL3NjZW5lcy9hbWJpZW50XCI7XG5cbmV4cG9ydCBjbGFzcyBNdXNpY0RpcmVjdG9yIHtcbiAgcHJpdmF0ZSBjdXJyZW50PzogeyBuYW1lOiBTY2VuZU5hbWU7IHN0b3A6ICgpID0+IHZvaWQgfTtcbiAgcHJpdmF0ZSBidXNPdXQ6IEdhaW5Ob2RlO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZW5naW5lOiBBdWRpb0VuZ2luZSkge1xuICAgIHRoaXMuYnVzT3V0ID0gbmV3IEdhaW5Ob2RlKGVuZ2luZS5jdHgsIHsgZ2FpbjogMC45IH0pO1xuICAgIHRoaXMuYnVzT3V0LmNvbm5lY3QoZW5naW5lLmdldE11c2ljQnVzKCkpO1xuICB9XG5cbiAgLyoqIENyb3NzZmFkZSB0byBhIG5ldyBzY2VuZSAqL1xuICBzZXRTY2VuZShuYW1lOiBTY2VuZU5hbWUsIG9wdHM/OiBNdXNpY1NjZW5lT3B0aW9ucykge1xuICAgIGlmICh0aGlzLmN1cnJlbnQ/Lm5hbWUgPT09IG5hbWUpIHJldHVybjtcblxuICAgIGNvbnN0IG9sZCA9IHRoaXMuY3VycmVudDtcbiAgICBjb25zdCB0ID0gdGhpcy5lbmdpbmUubm93O1xuXG4gICAgLy8gZmFkZS1vdXQgb2xkXG4gICAgY29uc3QgZmFkZU91dCA9IG5ldyBHYWluTm9kZSh0aGlzLmVuZ2luZS5jdHgsIHsgZ2FpbjogMC45IH0pO1xuICAgIGZhZGVPdXQuY29ubmVjdCh0aGlzLmVuZ2luZS5nZXRNdXNpY0J1cygpKTtcbiAgICBpZiAob2xkKSB7XG4gICAgICAvLyBXZSBhc3N1bWUgZWFjaCBzY2VuZSBtYW5hZ2VzIGl0cyBvd24gb3V0IG5vZGU7IHN0b3BwaW5nIHRyaWdnZXJzIGEgbmF0dXJhbCB0YWlsLlxuICAgICAgb2xkLnN0b3AoKTtcbiAgICAgIGZhZGVPdXQuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjAsIHQgKyAwLjYpO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiBmYWRlT3V0LmRpc2Nvbm5lY3QoKSwgNjUwKTtcbiAgICB9XG5cbiAgICAvLyBuZXcgc2NlbmVcbiAgICBjb25zdCBzY2VuZU91dCA9IG5ldyBHYWluTm9kZSh0aGlzLmVuZ2luZS5jdHgsIHsgZ2FpbjogMCB9KTtcbiAgICBzY2VuZU91dC5jb25uZWN0KHRoaXMuYnVzT3V0KTtcblxuICAgIGxldCBzdG9wID0gKCkgPT4gc2NlbmVPdXQuZGlzY29ubmVjdCgpO1xuXG4gICAgaWYgKG5hbWUgPT09IFwiYW1iaWVudFwiKSB7XG4gICAgICBjb25zdCBzID0gbmV3IEFtYmllbnRTY2VuZSh0aGlzLmVuZ2luZS5jdHgsIHNjZW5lT3V0LCBvcHRzPy5zZWVkID8/IDEpO1xuICAgICAgcy5zdGFydCgpO1xuICAgICAgc3RvcCA9ICgpID0+IHtcbiAgICAgICAgcy5zdG9wKCk7XG4gICAgICAgIHNjZW5lT3V0LmRpc2Nvbm5lY3QoKTtcbiAgICAgIH07XG4gICAgfVxuICAgIC8vIGVsc2UgaWYgKG5hbWUgPT09IFwiY29tYmF0XCIpIHsgLyogaW1wbGVtZW50IGNvbWJhdCBzY2VuZSBsYXRlciAqLyB9XG4gICAgLy8gZWxzZSBpZiAobmFtZSA9PT0gXCJsb2JieVwiKSB7IC8qIGltcGxlbWVudCBsb2JieSBzY2VuZSBsYXRlciAqLyB9XG5cbiAgICB0aGlzLmN1cnJlbnQgPSB7IG5hbWUsIHN0b3AgfTtcbiAgICBzY2VuZU91dC5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuOSwgdCArIDAuNik7XG4gIH1cblxuICBzdG9wKCkge1xuICAgIGlmICghdGhpcy5jdXJyZW50KSByZXR1cm47XG4gICAgdGhpcy5jdXJyZW50LnN0b3AoKTtcbiAgICB0aGlzLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gIH1cbn1cbiIsICJpbXBvcnQgdHlwZSB7IEJ1cywgTXVzaWNQYXJhbU1lc3NhZ2UsIE11c2ljU2NlbmVPcHRpb25zIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBNdXNpY0RpcmVjdG9yIH0gZnJvbSBcIi4vbXVzaWNcIjtcbmltcG9ydCB7IHBsYXlTZnggfSBmcm9tIFwiLi9zZnhcIjtcblxuLyoqXG4gKiBCaW5kIHN0YW5kYXJkIGF1ZGlvIGV2ZW50cyB0byB0aGUgZW5naW5lIGFuZCBtdXNpYyBkaXJlY3Rvci5cbiAqXG4gKiBFdmVudHMgc3VwcG9ydGVkOlxuICogIC0gYXVkaW86cmVzdW1lXG4gKiAgLSBhdWRpbzptdXRlIC8gYXVkaW86dW5tdXRlXG4gKiAgLSBhdWRpbzpzZXQtbWFzdGVyLWdhaW4geyBnYWluIH1cbiAqICAtIGF1ZGlvOnNmeCB7IG5hbWUsIHZlbG9jaXR5PywgcGFuPyB9XG4gKiAgLSBhdWRpbzptdXNpYzpzZXQtc2NlbmUgeyBzY2VuZSwgc2VlZD8gfVxuICogIC0gYXVkaW86bXVzaWM6cGFyYW0geyBrZXksIHZhbHVlIH1cbiAqICAtIGF1ZGlvOm11c2ljOnRyYW5zcG9ydCB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfSAgLy8gcGF1c2UgY3VycmVudGx5IG1hcHMgdG8gc3RvcFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJBdWRpb0J1c0JpbmRpbmdzKFxuICBidXM6IEJ1cyxcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgbXVzaWM6IE11c2ljRGlyZWN0b3Jcbik6IHZvaWQge1xuICBidXMub24oXCJhdWRpbzpyZXN1bWVcIiwgKCkgPT4gZW5naW5lLnJlc3VtZSgpKTtcbiAgYnVzLm9uKFwiYXVkaW86bXV0ZVwiLCAoKSA9PiBlbmdpbmUuc2V0TWFzdGVyR2FpbigwKSk7XG4gIGJ1cy5vbihcImF1ZGlvOnVubXV0ZVwiLCAoKSA9PiBlbmdpbmUuc2V0TWFzdGVyR2FpbigwLjkpKTtcbiAgYnVzLm9uKFwiYXVkaW86c2V0LW1hc3Rlci1nYWluXCIsICh7IGdhaW4gfTogeyBnYWluOiBudW1iZXIgfSkgPT5cbiAgICBlbmdpbmUuc2V0TWFzdGVyR2FpbihNYXRoLm1heCgwLCBNYXRoLm1pbigxLCBnYWluKSkpXG4gICk7XG5cbiAgYnVzLm9uKFwiYXVkaW86c2Z4XCIsIChtc2c6IHsgbmFtZTogc3RyaW5nOyB2ZWxvY2l0eT86IG51bWJlcjsgcGFuPzogbnVtYmVyIH0pID0+IHtcbiAgICBwbGF5U2Z4KGVuZ2luZSwgbXNnLm5hbWUgYXMgYW55LCB7IHZlbG9jaXR5OiBtc2cudmVsb2NpdHksIHBhbjogbXNnLnBhbiB9KTtcbiAgfSk7XG5cbiAgYnVzLm9uKFwiYXVkaW86bXVzaWM6c2V0LXNjZW5lXCIsIChtc2c6IHsgc2NlbmU6IHN0cmluZyB9ICYgTXVzaWNTY2VuZU9wdGlvbnMpID0+IHtcbiAgICBlbmdpbmUucmVzdW1lKCk7XG4gICAgbXVzaWMuc2V0U2NlbmUobXNnLnNjZW5lIGFzIGFueSwgeyBzZWVkOiBtc2cuc2VlZCB9KTtcbiAgfSk7XG5cbiAgYnVzLm9uKFwiYXVkaW86bXVzaWM6cGFyYW1cIiwgKF9tc2c6IE11c2ljUGFyYW1NZXNzYWdlKSA9PiB7XG4gICAgLy8gSG9vayBmb3IgZnV0dXJlIHBhcmFtIHJvdXRpbmcgcGVyIHNjZW5lIChlLmcuLCBpbnRlbnNpdHkvYnJpZ2h0bmVzcy9kZW5zaXR5KVxuICAgIC8vIElmIHlvdSB3YW50IGdsb2JhbCBwYXJhbXMsIGtlZXAgYSBtYXAgaGVyZSBhbmQgZm9yd2FyZCB0byB0aGUgYWN0aXZlIHNjZW5lXG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnRyYW5zcG9ydFwiLCAoeyBjbWQgfTogeyBjbWQ6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJwYXVzZVwiIH0pID0+IHtcbiAgICBpZiAoY21kID09PSBcInN0b3BcIiB8fCBjbWQgPT09IFwicGF1c2VcIikgbXVzaWMuc3RvcCgpO1xuICAgIC8vIFwic3RhcnRcIiBpcyBpbXBsaWNpdCB2aWEgc2V0U2NlbmVcbiAgfSk7XG59XG4iLCAiaW1wb3J0IHsgY3JlYXRlRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7IGNvbm5lY3RXZWJTb2NrZXQsIHNlbmRNZXNzYWdlIH0gZnJvbSBcIi4vbmV0XCI7XG5pbXBvcnQgeyBpbml0R2FtZSB9IGZyb20gXCIuL2dhbWVcIjtcbmltcG9ydCB7IGNyZWF0ZUluaXRpYWxTdGF0ZSwgY3JlYXRlSW5pdGlhbFVJU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHsgbW91bnRUdXRvcmlhbCwgQkFTSUNfVFVUT1JJQUxfSUQgfSBmcm9tIFwiLi90dXRvcmlhbFwiO1xuaW1wb3J0IHsgY2xlYXJQcm9ncmVzcyBhcyBjbGVhclR1dG9yaWFsUHJvZ3Jlc3MgfSBmcm9tIFwiLi90dXRvcmlhbC9zdG9yYWdlXCI7XG5pbXBvcnQgeyBtb3VudFN0b3J5LCBJTlRST19DSEFQVEVSX0lELCBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUyB9IGZyb20gXCIuL3N0b3J5XCI7XG5pbXBvcnQgeyB3YWl0Rm9yVXNlclN0YXJ0IH0gZnJvbSBcIi4vc3RhcnQtZ2F0ZVwiO1xuaW1wb3J0IHsgcmVzdW1lQXVkaW8gfSBmcm9tIFwiLi9zdG9yeS9zZnhcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4vYXVkaW8vZW5naW5lXCI7XG5pbXBvcnQgeyBNdXNpY0RpcmVjdG9yIH0gZnJvbSBcIi4vYXVkaW8vbXVzaWNcIjtcbmltcG9ydCB7IHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyB9IGZyb20gXCIuL2F1ZGlvL2N1ZXNcIjtcblxuY29uc3QgQ0FMTF9TSUdOX1NUT1JBR0VfS0VZID0gXCJsc2Q6Y2FsbHNpZ25cIjtcblxuKGFzeW5jIGZ1bmN0aW9uIGJvb3RzdHJhcCgpIHtcbiAgY29uc3QgcXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuICBjb25zdCByb29tID0gcXMuZ2V0KFwicm9vbVwiKSB8fCBcImRlZmF1bHRcIjtcbiAgY29uc3QgbW9kZSA9IHFzLmdldChcIm1vZGVcIikgfHwgXCJcIjtcbiAgY29uc3QgbmFtZVBhcmFtID0gc2FuaXRpemVDYWxsU2lnbihxcy5nZXQoXCJuYW1lXCIpKTtcbiAgY29uc3Qgc3RvcmVkTmFtZSA9IHNhbml0aXplQ2FsbFNpZ24ocmVhZFN0b3JlZENhbGxTaWduKCkpO1xuICBjb25zdCBjYWxsU2lnbiA9IG5hbWVQYXJhbSB8fCBzdG9yZWROYW1lO1xuICBjb25zdCBtYXBXID0gcGFyc2VGbG9hdChxcy5nZXQoXCJtYXBXXCIpIHx8IFwiODAwMFwiKTtcbiAgY29uc3QgbWFwSCA9IHBhcnNlRmxvYXQocXMuZ2V0KFwibWFwSFwiKSB8fCBcIjQ1MDBcIik7XG5cbiAgaWYgKG5hbWVQYXJhbSAmJiBuYW1lUGFyYW0gIT09IHN0b3JlZE5hbWUpIHtcbiAgICBwZXJzaXN0Q2FsbFNpZ24obmFtZVBhcmFtKTtcbiAgfVxuXG4gIC8vIEdhdGUgZXZlcnl0aGluZyBvbiBhIHVzZXIgZ2VzdHVyZSAoY2VudHJlZCBidXR0b24pXG4gIGF3YWl0IHdhaXRGb3JVc2VyU3RhcnQoe1xuICAgIGxhYmVsOiBcIlN0YXJ0IEdhbWVcIixcbiAgICByZXF1ZXN0RnVsbHNjcmVlbjogZmFsc2UsICAgLy8gZmxpcCB0byB0cnVlIGlmIHlvdSB3YW50IGZ1bGxzY3JlZW5cbiAgICByZXN1bWVBdWRpbywgICAgICAgICAgICAgICAgLy8gdXNlcyBzdG9yeS9zZngudHNcbiAgfSk7XG5cbiAgLy8gLS0tLSBTdGFydCBhY3R1YWwgYXBwIGFmdGVyIGdlc3R1cmUgLS0tLVxuICBjb25zdCBzdGF0ZSA9IGNyZWF0ZUluaXRpYWxTdGF0ZSgpO1xuICBjb25zdCB1aVN0YXRlID0gY3JlYXRlSW5pdGlhbFVJU3RhdGUoKTtcbiAgY29uc3QgYnVzID0gY3JlYXRlRXZlbnRCdXMoKTtcblxuICAvLyAtLS0gQVVESU86IGVuZ2luZSArIGJpbmRpbmdzICsgZGVmYXVsdCBzY2VuZSAtLS1cbiAgY29uc3QgZW5naW5lID0gQXVkaW9FbmdpbmUuZ2V0KCk7XG4gIGF3YWl0IGVuZ2luZS5yZXN1bWUoKTsgLy8gc2FmZSBwb3N0LWdlc3R1cmVcbiAgY29uc3QgbXVzaWMgPSBuZXcgTXVzaWNEaXJlY3RvcihlbmdpbmUpO1xuICByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MoYnVzIGFzIGFueSwgZW5naW5lLCBtdXNpYyk7XG5cbiAgLy8gU3RhcnQgYSBkZWZhdWx0IG11c2ljIHNjZW5lIChhZGp1c3Qgc2VlZC9zY2VuZSBhcyB5b3UgbGlrZSlcbiAgYnVzLmVtaXQoXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIiwgeyBzY2VuZTogXCJhbWJpZW50XCIsIHNlZWQ6IDQyIH0pO1xuXG4gIC8vIE9wdGlvbmFsOiBiYXNpYyBob29rcyB0byBkZW1vbnN0cmF0ZSBTRlggJiBkdWNraW5nXG4gIC8vIGJ1cy5vbihcImRpYWxvZ3VlOm9wZW5lZFwiLCAoKSA9PiBlbmdpbmUuZHVja011c2ljKDAuMzUsIDAuMSkpO1xuICAvLyBidXMub24oXCJkaWFsb2d1ZTpjbG9zZWRcIiwgKCkgPT4gZW5naW5lLnVuZHVja011c2ljKDAuMjUpKTtcblxuICAvLyBFeGFtcGxlIGdhbWUgU0ZYIHdpcmluZyAoYWRhcHQgdG8geW91ciBhY3R1YWwgZXZlbnRzKVxuICBidXMub24oXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCAoeyB2YWx1ZSB9KSA9PiB7XG4gICAgaWYgKHZhbHVlID4gMCkgYnVzLmVtaXQoXCJhdWRpbzpzZnhcIiwgeyBuYW1lOiBcInRocnVzdFwiLCB2ZWxvY2l0eTogTWF0aC5taW4oMSwgdmFsdWUpIH0pO1xuICB9KTtcblxuICBjb25zdCBnYW1lID0gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH0pO1xuXG4gIC8vIE1vdW50IHR1dG9yaWFsIGFuZCBzdG9yeSBiYXNlZCBvbiBnYW1lIG1vZGVcbiAgY29uc3QgZW5hYmxlVHV0b3JpYWwgPSBtb2RlID09PSBcImNhbXBhaWduXCIgfHwgbW9kZSA9PT0gXCJ0dXRvcmlhbFwiO1xuICBjb25zdCBlbmFibGVTdG9yeSA9IG1vZGUgPT09IFwiY2FtcGFpZ25cIjtcblxuICBsZXQgdHV0b3JpYWw6IFJldHVyblR5cGU8dHlwZW9mIG1vdW50VHV0b3JpYWw+IHwgbnVsbCA9IG51bGw7XG4gIGxldCB0dXRvcmlhbFN0YXJ0ZWQgPSBmYWxzZTtcblxuICBpZiAoZW5hYmxlVHV0b3JpYWwpIHtcbiAgICB0dXRvcmlhbCA9IG1vdW50VHV0b3JpYWwoYnVzKTtcbiAgfVxuXG4gIGNvbnN0IHN0YXJ0VHV0b3JpYWwgPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKCF0dXRvcmlhbCB8fCB0dXRvcmlhbFN0YXJ0ZWQpIHJldHVybjtcbiAgICB0dXRvcmlhbFN0YXJ0ZWQgPSB0cnVlO1xuICAgIGNsZWFyVHV0b3JpYWxQcm9ncmVzcyhCQVNJQ19UVVRPUklBTF9JRCk7XG4gICAgdHV0b3JpYWwuc3RhcnQoeyByZXN1bWU6IGZhbHNlIH0pO1xuICB9O1xuXG4gIGlmIChlbmFibGVTdG9yeSkge1xuICAgIC8vIENhbXBhaWduIG1vZGU6IHN0b3J5ICsgdHV0b3JpYWxcbiAgICBjb25zdCB1bnN1YnNjcmliZVN0b3J5Q2xvc2VkID0gYnVzLm9uKFwiZGlhbG9ndWU6Y2xvc2VkXCIsICh7IGNoYXB0ZXJJZCwgbm9kZUlkIH0pID0+IHtcbiAgICAgIGlmIChjaGFwdGVySWQgIT09IElOVFJPX0NIQVBURVJfSUQpIHJldHVybjtcbiAgICAgIGlmICghSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMuaW5jbHVkZXMobm9kZUlkIGFzIHR5cGVvZiBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEU1tudW1iZXJdKSkgcmV0dXJuO1xuICAgICAgdW5zdWJzY3JpYmVTdG9yeUNsb3NlZCgpO1xuICAgICAgc3RhcnRUdXRvcmlhbCgpO1xuICAgIH0pO1xuICAgIG1vdW50U3RvcnkoeyBidXMsIHJvb21JZDogcm9vbSB9KTtcbiAgfSBlbHNlIGlmIChtb2RlID09PSBcInR1dG9yaWFsXCIpIHtcbiAgICAvLyBUdXRvcmlhbCBtb2RlOiBhdXRvLXN0YXJ0IHR1dG9yaWFsIHdpdGhvdXQgc3RvcnlcbiAgICBzdGFydFR1dG9yaWFsKCk7XG4gIH1cbiAgLy8gRnJlZSBwbGF5IGFuZCBkZWZhdWx0OiBubyBzeXN0ZW1zIG1vdW50ZWRcblxuICBjb25uZWN0V2ViU29ja2V0KHtcbiAgICByb29tLFxuICAgIHN0YXRlLFxuICAgIGJ1cyxcbiAgICBtYXBXLFxuICAgIG1hcEgsXG4gICAgb25TdGF0ZVVwZGF0ZWQ6ICgpID0+IGdhbWUub25TdGF0ZVVwZGF0ZWQoKSxcbiAgICBvbk9wZW46ICgpID0+IHtcbiAgICAgIGNvbnN0IG5hbWVUb1NlbmQgPSBjYWxsU2lnbiB8fCBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgICAgIGlmIChuYW1lVG9TZW5kKSBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiam9pblwiLCBuYW1lOiBuYW1lVG9TZW5kIH0pO1xuICAgIH0sXG4gIH0pO1xuXG4gIC8vIE9wdGlvbmFsOiBzdXNwZW5kL3Jlc3VtZSBhdWRpbyBvbiB0YWIgdmlzaWJpbGl0eSB0byBzYXZlIENQVVxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwidmlzaWJpbGl0eWNoYW5nZVwiLCAoKSA9PiB7XG4gICAgaWYgKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gXCJoaWRkZW5cIikge1xuICAgICAgdm9pZCBlbmdpbmUuc3VzcGVuZCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2b2lkIGVuZ2luZS5yZXN1bWUoKTtcbiAgICB9XG4gIH0pO1xufSkoKTtcblxuZnVuY3Rpb24gc2FuaXRpemVDYWxsU2lnbih2YWx1ZTogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHJldHVybiBcIlwiO1xuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHJldHVybiBcIlwiO1xuICByZXR1cm4gdHJpbW1lZC5zbGljZSgwLCAyNCk7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RDYWxsU2lnbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBpZiAobmFtZSkgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSwgbmFtZSk7XG4gICAgZWxzZSB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZKTtcbiAgfSBjYXRjaCB7fVxufVxuXG5mdW5jdGlvbiByZWFkU3RvcmVkQ2FsbFNpZ24oKTogc3RyaW5nIHtcbiAgdHJ5IHsgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVkpID8/IFwiXCI7IH1cbiAgY2F0Y2ggeyByZXR1cm4gXCJcIjsgfVxufVxu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LENBQUM7QUFDRCxpQkFBVyxFQUFFLEtBQUssUUFBUSxLQUFLLENBQUM7QUFBQSxJQUNsQyxXQUFXLFNBQVMsWUFBWTtBQUU5QixvQkFBYztBQUFBLElBQ2hCO0FBR0EscUJBQWlCO0FBQUEsTUFDZjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLGdCQUFnQixNQUFNLEtBQUssZUFBZTtBQUFBLE1BQzFDLFFBQVEsTUFBTTtBQUNaLGNBQU0sYUFBYSxZQUFZLGlCQUFpQixtQkFBbUIsQ0FBQztBQUNwRSxZQUFJLFdBQVksYUFBWSxFQUFFLE1BQU0sUUFBUSxNQUFNLFdBQVcsQ0FBQztBQUFBLE1BQ2hFO0FBQUEsSUFDRixDQUFDO0FBR0QsYUFBUyxpQkFBaUIsb0JBQW9CLE1BQU07QUFDbEQsVUFBSSxTQUFTLG9CQUFvQixVQUFVO0FBQ3pDLGFBQUssT0FBTyxRQUFRO0FBQUEsTUFDdEIsT0FBTztBQUNMLGFBQUssT0FBTyxPQUFPO0FBQUEsTUFDckI7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNILEdBQUc7QUFFSCxXQUFTLGlCQUFpQixPQUE4QjtBQUN0RCxRQUFJLENBQUMsTUFBTyxRQUFPO0FBQ25CLFVBQU0sVUFBVSxNQUFNLEtBQUs7QUFDM0IsUUFBSSxDQUFDLFFBQVMsUUFBTztBQUNyQixXQUFPLFFBQVEsTUFBTSxHQUFHLEVBQUU7QUFBQSxFQUM1QjtBQUVBLFdBQVMsZ0JBQWdCLE1BQW9CO0FBQzNDLFFBQUk7QUFDRixVQUFJLEtBQU0sUUFBTyxhQUFhLFFBQVEsdUJBQXVCLElBQUk7QUFBQSxVQUM1RCxRQUFPLGFBQWEsV0FBVyxxQkFBcUI7QUFBQSxJQUMzRCxTQUFRO0FBQUEsSUFBQztBQUFBLEVBQ1g7QUFFQSxXQUFTLHFCQUE2QjtBQW5JdEM7QUFvSUUsUUFBSTtBQUFFLGNBQU8sWUFBTyxhQUFhLFFBQVEscUJBQXFCLE1BQWpELFlBQXNEO0FBQUEsSUFBSSxTQUNqRTtBQUFFLGFBQU87QUFBQSxJQUFJO0FBQUEsRUFDckI7IiwKICAibmFtZXMiOiBbIl9hIiwgIlNUWUxFX0lEIiwgImVuc3VyZVN0eWxlcyIsICJjaG9pY2UiLCAiX2EiLCAiU1RPUkFHRV9QUkVGSVgiLCAiZ2V0U3RvcmFnZSIsICJjdHgiLCAiY3R4IiwgImNsYW1wIiwgImNob2ljZSIsICJfYSIsICJjdHgiLCAicmVzdW1lQXVkaW8iLCAiY3R4Il0KfQo=
