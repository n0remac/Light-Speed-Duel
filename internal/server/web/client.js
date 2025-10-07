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
      helpVisible: false
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
  function connectWebSocket({ room, state, bus, onStateUpdated, onOpen }) {
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    ws = new WebSocket(`${protocol}${window.location.host}/ws?room=${encodeURIComponent(room)}`);
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
    var _a;
    state.now = msg.now;
    state.nowSyncedAt = monotonicNow();
    state.nextMissileReadyAt = Number.isFinite(msg.next_missile_ready) ? msg.next_missile_ready : 0;
    state.me = msg.me ? {
      x: msg.me.x,
      y: msg.me.y,
      vx: msg.me.vx,
      vy: msg.me.vy,
      hp: msg.me.hp,
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
    const meta = (_a = msg.meta) != null ? _a : {};
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
    spawnBotBtn == null ? void 0 : spawnBotBtn.addEventListener("click", () => {
      sendMessage({ type: "spawn_bot" });
      busRef.emit("bot:spawnRequested");
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
  function onCanvasPointerDown(event) {
    if (!cv || !ctx) return;
    if (helpOverlay == null ? void 0 : helpOverlay.classList.contains("visible")) {
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
      default:
        break;
    }
    if (event.key === "?") {
      setHelpVisible(!uiStateRef.helpVisible);
      event.preventDefault();
    }
  }
  function worldToCanvas(p) {
    if (!cv) return { x: p.x, y: p.y };
    const sx = cv.width / world.w;
    const sy = cv.height / world.h;
    return { x: p.x * sx, y: p.y * sy };
  }
  function canvasToWorld(p) {
    if (!cv) return { x: p.x, y: p.y };
    const sx = world.w / cv.width;
    const sy = world.h / cv.height;
    return { x: p.x * sx, y: p.y * sy };
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
    if (!ctx) return;
    ctx.save();
    ctx.strokeStyle = "#234";
    ctx.lineWidth = 1;
    const step = 1e3;
    for (let x = 0; x <= world.w; x += step) {
      const a = worldToCanvas({ x, y: 0 });
      const b = worldToCanvas({ x, y: world.h });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let y = 0; y <= world.h; y += step) {
      const a = worldToCanvas({ x: 0, y });
      const b = worldToCanvas({ x: world.w, y });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS50cyIsICJzcmMvdHV0b3JpYWwvaGlnaGxpZ2h0LnRzIiwgInNyYy90dXRvcmlhbC9zdG9yYWdlLnRzIiwgInNyYy90dXRvcmlhbC9yb2xlcy50cyIsICJzcmMvdHV0b3JpYWwvZW5naW5lLnRzIiwgInNyYy90dXRvcmlhbC9zdGVwc19iYXNpYy50cyIsICJzcmMvdHV0b3JpYWwvaW5kZXgudHMiLCAic3JjL3N0b3J5L292ZXJsYXkudHMiLCAic3JjL3N0b3J5L3N0b3JhZ2UudHMiLCAic3JjL2F1ZGlvL2VuZ2luZS50cyIsICJzcmMvYXVkaW8vZ3JhcGgudHMiLCAic3JjL2F1ZGlvL3NmeC50cyIsICJzcmMvc3Rvcnkvc2Z4LnRzIiwgInNyYy9zdG9yeS9lbmdpbmUudHMiLCAic3JjL3N0b3J5L2NoYXB0ZXJzL2ludHJvLnRzIiwgInNyYy9zdG9yeS9pbmRleC50cyIsICJzcmMvc3RhcnQtZ2F0ZS50cyIsICJzcmMvYXVkaW8vbXVzaWMvc2NlbmVzL2FtYmllbnQudHMiLCAic3JjL2F1ZGlvL211c2ljL2luZGV4LnRzIiwgInNyYy9hdWRpby9jdWVzLnRzIiwgInNyYy9tYWluLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgdHlwZSBTaGlwQ29udGV4dCA9IFwic2hpcFwiIHwgXCJtaXNzaWxlXCI7XG5leHBvcnQgdHlwZSBTaGlwVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcbmV4cG9ydCB0eXBlIE1pc3NpbGVUb29sID0gXCJzZXRcIiB8IFwic2VsZWN0XCIgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50TWFwIHtcbiAgXCJjb250ZXh0OmNoYW5nZWRcIjogeyBjb250ZXh0OiBTaGlwQ29udGV4dCB9O1xuICBcInNoaXA6dG9vbENoYW5nZWRcIjogeyB0b29sOiBTaGlwVG9vbCB9O1xuICBcInNoaXA6d2F5cG9pbnRBZGRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6bGF1bmNoZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiOiB7IHNlY29uZHNSZW1haW5pbmc6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiOiB2b2lkO1xuICBcImhlbHA6dmlzaWJsZUNoYW5nZWRcIjogeyB2aXNpYmxlOiBib29sZWFuIH07XG4gIFwic3RhdGU6dXBkYXRlZFwiOiB2b2lkO1xuICBcInR1dG9yaWFsOnN0YXJ0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIjogeyBpZDogc3RyaW5nOyBzdGVwSW5kZXg6IG51bWJlcjsgdG90YWw6IG51bWJlciB9O1xuICBcInR1dG9yaWFsOmNvbXBsZXRlZFwiOiB7IGlkOiBzdHJpbmcgfTtcbiAgXCJ0dXRvcmlhbDpza2lwcGVkXCI6IHsgaWQ6IHN0cmluZzsgYXRTdGVwOiBudW1iZXIgfTtcbiAgXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIjogdm9pZDtcbiAgXCJkaWFsb2d1ZTpvcGVuZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjbG9zZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjaG9pY2VcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hvaWNlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJzdG9yeTpmbGFnVXBkYXRlZFwiOiB7IGZsYWc6IHN0cmluZzsgdmFsdWU6IGJvb2xlYW4gfTtcbiAgXCJzdG9yeTpwcm9ncmVzc2VkXCI6IHsgY2hhcHRlcklkOiBzdHJpbmc7IG5vZGVJZDogc3RyaW5nIH07XG4gIFwiYXVkaW86cmVzdW1lXCI6IHZvaWQ7XG4gIFwiYXVkaW86bXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnVubXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiOiB7IGdhaW46IG51bWJlciB9O1xuICBcImF1ZGlvOnNmeFwiOiB7IG5hbWU6IFwidWlcIiB8IFwibGFzZXJcIiB8IFwidGhydXN0XCIgfCBcImV4cGxvc2lvblwiIHwgXCJsb2NrXCIgfCBcImRpYWxvZ3VlXCI7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIjogeyBzY2VuZTogXCJhbWJpZW50XCIgfCBcImNvbWJhdFwiIHwgXCJsb2JieVwiOyBzZWVkPzogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6cGFyYW1cIjogeyBrZXk6IHN0cmluZzsgdmFsdWU6IG51bWJlciB9OyAgICAgICAgICAgICAgIFxuICBcImF1ZGlvOm11c2ljOnRyYW5zcG9ydFwiOiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfTtcbn1cblxuZXhwb3J0IHR5cGUgRXZlbnRLZXkgPSBrZXlvZiBFdmVudE1hcDtcbmV4cG9ydCB0eXBlIEV2ZW50UGF5bG9hZDxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gRXZlbnRNYXBbS107XG5leHBvcnQgdHlwZSBIYW5kbGVyPEsgZXh0ZW5kcyBFdmVudEtleT4gPSAocGF5bG9hZDogRXZlbnRQYXlsb2FkPEs+KSA9PiB2b2lkO1xuXG50eXBlIFZvaWRLZXlzID0ge1xuICBbSyBpbiBFdmVudEtleV06IEV2ZW50TWFwW0tdIGV4dGVuZHMgdm9pZCA/IEsgOiBuZXZlclxufVtFdmVudEtleV07XG5cbnR5cGUgTm9uVm9pZEtleXMgPSBFeGNsdWRlPEV2ZW50S2V5LCBWb2lkS2V5cz47XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnRCdXMge1xuICBvbjxLIGV4dGVuZHMgRXZlbnRLZXk+KGV2ZW50OiBLLCBoYW5kbGVyOiBIYW5kbGVyPEs+KTogKCkgPT4gdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgTm9uVm9pZEtleXM+KGV2ZW50OiBLLCBwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pOiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBWb2lkS2V5cz4oZXZlbnQ6IEspOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXZlbnRCdXMoKTogRXZlbnRCdXMge1xuICBjb25zdCBoYW5kbGVycyA9IG5ldyBNYXA8RXZlbnRLZXksIFNldDxGdW5jdGlvbj4+KCk7XG4gIHJldHVybiB7XG4gICAgb24oZXZlbnQsIGhhbmRsZXIpIHtcbiAgICAgIGxldCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQpIHtcbiAgICAgICAgc2V0ID0gbmV3IFNldCgpO1xuICAgICAgICBoYW5kbGVycy5zZXQoZXZlbnQsIHNldCk7XG4gICAgICB9XG4gICAgICBzZXQuYWRkKGhhbmRsZXIpO1xuICAgICAgcmV0dXJuICgpID0+IHNldCEuZGVsZXRlKGhhbmRsZXIpO1xuICAgIH0sXG4gICAgZW1pdChldmVudDogRXZlbnRLZXksIHBheWxvYWQ/OiB1bmtub3duKSB7XG4gICAgICBjb25zdCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQgfHwgc2V0LnNpemUgPT09IDApIHJldHVybjtcbiAgICAgIGZvciAoY29uc3QgZm4gb2Ygc2V0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgKGZuIGFzICh2YWx1ZT86IHVua25vd24pID0+IHZvaWQpKHBheWxvYWQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBbYnVzXSBoYW5kbGVyIGZvciAke2V2ZW50fSBmYWlsZWRgLCBlcnIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNoaXBDb250ZXh0LCBTaGlwVG9vbCwgTWlzc2lsZVRvb2wgfSBmcm9tIFwiLi9idXNcIjtcblxuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX1NQRUVEID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfU1BFRUQgPSAyNTA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fQUdSTyA9IDEwMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9MSUZFVElNRSA9IDEyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9MSUZFVElNRSA9IDIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSA9IDgwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiA9IDIwMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUxpbWl0cyB7XG4gIHNwZWVkTWluOiBudW1iZXI7XG4gIHNwZWVkTWF4OiBudW1iZXI7XG4gIGFncm9NaW46IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNoaXBTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBocD86IG51bWJlcjtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdob3N0U25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlU25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgc2VsZj86IGJvb2xlYW47XG4gIGFncm9fcmFkaXVzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVJvdXRlIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICB3YXlwb2ludHM6IE1pc3NpbGVXYXlwb2ludFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVDb25maWcge1xuICBzcGVlZDogbnVtYmVyO1xuICBhZ3JvUmFkaXVzOiBudW1iZXI7XG4gIGxpZmV0aW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNZXRhIHtcbiAgYz86IG51bWJlcjtcbiAgdz86IG51bWJlcjtcbiAgaD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBTdGF0ZSB7XG4gIG5vdzogbnVtYmVyO1xuICBub3dTeW5jZWRBdDogbnVtYmVyO1xuICBtZTogU2hpcFNuYXBzaG90IHwgbnVsbDtcbiAgZ2hvc3RzOiBHaG9zdFNuYXBzaG90W107XG4gIG1pc3NpbGVzOiBNaXNzaWxlU25hcHNob3RbXTtcbiAgbWlzc2lsZVJvdXRlczogTWlzc2lsZVJvdXRlW107XG4gIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBzdHJpbmcgfCBudWxsO1xuICBuZXh0TWlzc2lsZVJlYWR5QXQ6IG51bWJlcjtcbiAgbWlzc2lsZUNvbmZpZzogTWlzc2lsZUNvbmZpZztcbiAgbWlzc2lsZUxpbWl0czogTWlzc2lsZUxpbWl0cztcbiAgd29ybGRNZXRhOiBXb3JsZE1ldGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VsZWN0aW9uIHtcbiAgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjtcbiAgaW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlU2VsZWN0aW9uIHtcbiAgdHlwZTogXCJ3YXlwb2ludFwiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBBY3RpdmVUb29sID1cbiAgfCBcInNoaXAtc2V0XCJcbiAgfCBcInNoaXAtc2VsZWN0XCJcbiAgfCBcIm1pc3NpbGUtc2V0XCJcbiAgfCBcIm1pc3NpbGUtc2VsZWN0XCJcbiAgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVJU3RhdGUge1xuICBpbnB1dENvbnRleHQ6IFNoaXBDb250ZXh0O1xuICBzaGlwVG9vbDogU2hpcFRvb2w7XG4gIG1pc3NpbGVUb29sOiBNaXNzaWxlVG9vbDtcbiAgYWN0aXZlVG9vbDogQWN0aXZlVG9vbDtcbiAgc2hvd1NoaXBSb3V0ZTogYm9vbGVhbjtcbiAgaGVscFZpc2libGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpOiBVSVN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpbnB1dENvbnRleHQ6IFwic2hpcFwiLFxuICAgIHNoaXBUb29sOiBcInNldFwiLFxuICAgIG1pc3NpbGVUb29sOiBudWxsLFxuICAgIGFjdGl2ZVRvb2w6IFwic2hpcC1zZXRcIixcbiAgICBzaG93U2hpcFJvdXRlOiB0cnVlLFxuICAgIGhlbHBWaXNpYmxlOiBmYWxzZSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxTdGF0ZShsaW1pdHM6IE1pc3NpbGVMaW1pdHMgPSB7XG4gIHNwZWVkTWluOiBNSVNTSUxFX01JTl9TUEVFRCxcbiAgc3BlZWRNYXg6IE1JU1NJTEVfTUFYX1NQRUVELFxuICBhZ3JvTWluOiBNSVNTSUxFX01JTl9BR1JPLFxufSk6IEFwcFN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBub3c6IDAsXG4gICAgbm93U3luY2VkQXQ6IHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSBcImZ1bmN0aW9uXCJcbiAgICAgID8gcGVyZm9ybWFuY2Uubm93KClcbiAgICAgIDogRGF0ZS5ub3coKSxcbiAgICBtZTogbnVsbCxcbiAgICBnaG9zdHM6IFtdLFxuICAgIG1pc3NpbGVzOiBbXSxcbiAgICBtaXNzaWxlUm91dGVzOiBbXSxcbiAgICBhY3RpdmVNaXNzaWxlUm91dGVJZDogbnVsbCxcbiAgICBuZXh0TWlzc2lsZVJlYWR5QXQ6IDAsXG4gICAgbWlzc2lsZUNvbmZpZzoge1xuICAgICAgc3BlZWQ6IDE4MCxcbiAgICAgIGFncm9SYWRpdXM6IDgwMCxcbiAgICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IoMTgwLCA4MDAsIGxpbWl0cyksXG4gICAgfSxcbiAgICBtaXNzaWxlTGltaXRzOiBsaW1pdHMsXG4gICAgd29ybGRNZXRhOiB7fSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pc3NpbGVMaWZldGltZUZvcihzcGVlZDogbnVtYmVyLCBhZ3JvUmFkaXVzOiBudW1iZXIsIGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogbnVtYmVyIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBzcGFuID0gbWF4U3BlZWQgLSBtaW5TcGVlZDtcbiAgY29uc3Qgc3BlZWROb3JtID0gc3BhbiA+IDAgPyBjbGFtcCgoc3BlZWQgLSBtaW5TcGVlZCkgLyBzcGFuLCAwLCAxKSA6IDA7XG4gIGNvbnN0IGFkanVzdGVkQWdybyA9IE1hdGgubWF4KDAsIGFncm9SYWRpdXMgLSBtaW5BZ3JvKTtcbiAgY29uc3QgYWdyb05vcm0gPSBjbGFtcChhZGp1c3RlZEFncm8gLyBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUkVGLCAwLCAxKTtcbiAgY29uc3QgcmVkdWN0aW9uID0gc3BlZWROb3JtICogTUlTU0lMRV9MSUZFVElNRV9TUEVFRF9QRU5BTFRZICsgYWdyb05vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUEVOQUxUWTtcbiAgY29uc3QgYmFzZSA9IE1JU1NJTEVfTUFYX0xJRkVUSU1FO1xuICByZXR1cm4gY2xhbXAoYmFzZSAtIHJlZHVjdGlvbiwgTUlTU0lMRV9NSU5fTElGRVRJTUUsIE1JU1NJTEVfTUFYX0xJRkVUSU1FKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplTWlzc2lsZUNvbmZpZyhcbiAgY2ZnOiBQYXJ0aWFsPFBpY2s8TWlzc2lsZUNvbmZpZywgXCJzcGVlZFwiIHwgXCJhZ3JvUmFkaXVzXCI+PixcbiAgZmFsbGJhY2s6IE1pc3NpbGVDb25maWcsXG4gIGxpbWl0czogTWlzc2lsZUxpbWl0cyxcbik6IE1pc3NpbGVDb25maWcge1xuICBjb25zdCBtaW5TcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluIDogTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXggOiBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgbWluQWdybyA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiA6IE1JU1NJTEVfTUlOX0FHUk87XG4gIGNvbnN0IGJhc2UgPSBmYWxsYmFjayA/PyB7XG4gICAgc3BlZWQ6IG1pblNwZWVkLFxuICAgIGFncm9SYWRpdXM6IG1pbkFncm8sXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihtaW5TcGVlZCwgbWluQWdybywgbGltaXRzKSxcbiAgfTtcbiAgY29uc3QgbWVyZ2VkU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUoY2ZnLnNwZWVkID8/IGJhc2Uuc3BlZWQpID8gKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA6IGJhc2Uuc3BlZWQ7XG4gIGNvbnN0IG1lcmdlZEFncm8gPSBOdW1iZXIuaXNGaW5pdGUoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA/IChjZmcuYWdyb1JhZGl1cyA/PyBiYXNlLmFncm9SYWRpdXMpIDogYmFzZS5hZ3JvUmFkaXVzO1xuICBjb25zdCBzcGVlZCA9IGNsYW1wKG1lcmdlZFNwZWVkLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICBjb25zdCBhZ3JvUmFkaXVzID0gTWF0aC5tYXgobWluQWdybywgbWVyZ2VkQWdybyk7XG4gIHJldHVybiB7XG4gICAgc3BlZWQsXG4gICAgYWdyb1JhZGl1cyxcbiAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKHNwZWVkLCBhZ3JvUmFkaXVzLCBsaW1pdHMpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9ub3RvbmljTm93KCk6IG51bWJlciB7XG4gIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICB9XG4gIHJldHVybiBEYXRlLm5vdygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVXYXlwb2ludExpc3QobGlzdDogV2F5cG9pbnRbXSB8IHVuZGVmaW5lZCB8IG51bGwpOiBXYXlwb2ludFtdIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3QpKSByZXR1cm4gW107XG4gIHJldHVybiBsaXN0Lm1hcCgod3ApID0+ICh7IC4uLndwIH0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGU6IEFwcFN0YXRlLCBsaW1pdHM6IFBhcnRpYWw8TWlzc2lsZUxpbWl0cz4pOiB2b2lkIHtcbiAgc3RhdGUubWlzc2lsZUxpbWl0cyA9IHtcbiAgICBzcGVlZE1pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4hIDogc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1pbixcbiAgICBzcGVlZE1heDogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXghIDogc3RhdGUubWlzc2lsZUxpbWl0cy5zcGVlZE1heCxcbiAgICBhZ3JvTWluOiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4hIDogc3RhdGUubWlzc2lsZUxpbWl0cy5hZ3JvTWluLFxuICB9O1xufVxuIiwgImltcG9ydCB7IHR5cGUgRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7XG4gIHR5cGUgQXBwU3RhdGUsXG4gIHR5cGUgTWlzc2lsZVJvdXRlLFxuICBtb25vdG9uaWNOb3csXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbiAgdXBkYXRlTWlzc2lsZUxpbWl0cyxcbn0gZnJvbSBcIi4vc3RhdGVcIjtcblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVJvdXRlIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZT86IHN0cmluZztcbiAgd2F5cG9pbnRzPzogU2VydmVyTWlzc2lsZVdheXBvaW50W107XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJTaGlwU3RhdGUge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgaHA/OiBudW1iZXI7XG4gIHdheXBvaW50cz86IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHNwZWVkPzogbnVtYmVyIH0+O1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIHNlbGY/OiBib29sZWFuO1xuICBhZ3JvX3JhZGl1czogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyU3RhdGVNZXNzYWdlIHtcbiAgdHlwZTogXCJzdGF0ZVwiO1xuICBub3c6IG51bWJlcjtcbiAgbmV4dF9taXNzaWxlX3JlYWR5PzogbnVtYmVyO1xuICBtZT86IFNlcnZlclNoaXBTdGF0ZSB8IG51bGw7XG4gIGdob3N0cz86IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHZ4OiBudW1iZXI7IHZ5OiBudW1iZXIgfT47XG4gIG1pc3NpbGVzPzogU2VydmVyTWlzc2lsZVN0YXRlW107XG4gIG1pc3NpbGVfcm91dGVzPzogU2VydmVyTWlzc2lsZVJvdXRlW107XG4gIG1pc3NpbGVfY29uZmlnPzoge1xuICAgIHNwZWVkPzogbnVtYmVyO1xuICAgIHNwZWVkX21pbj86IG51bWJlcjtcbiAgICBzcGVlZF9tYXg/OiBudW1iZXI7XG4gICAgYWdyb19yYWRpdXM/OiBudW1iZXI7XG4gICAgYWdyb19taW4/OiBudW1iZXI7XG4gICAgbGlmZXRpbWU/OiBudW1iZXI7XG4gIH0gfCBudWxsO1xuICBhY3RpdmVfbWlzc2lsZV9yb3V0ZT86IHN0cmluZyB8IG51bGw7XG4gIG1ldGE/OiB7XG4gICAgYz86IG51bWJlcjtcbiAgICB3PzogbnVtYmVyO1xuICAgIGg/OiBudW1iZXI7XG4gIH07XG59XG5cbmludGVyZmFjZSBDb25uZWN0T3B0aW9ucyB7XG4gIHJvb206IHN0cmluZztcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xuICBvblN0YXRlVXBkYXRlZD86ICgpID0+IHZvaWQ7XG4gIG9uT3Blbj86IChzb2NrZXQ6IFdlYlNvY2tldCkgPT4gdm9pZDtcbn1cblxubGV0IHdzOiBXZWJTb2NrZXQgfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIHNlbmRNZXNzYWdlKHBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcbiAgaWYgKCF3cyB8fCB3cy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikgcmV0dXJuO1xuICBjb25zdCBkYXRhID0gdHlwZW9mIHBheWxvYWQgPT09IFwic3RyaW5nXCIgPyBwYXlsb2FkIDogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCk7XG4gIHdzLnNlbmQoZGF0YSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0V2ViU29ja2V0KHsgcm9vbSwgc3RhdGUsIGJ1cywgb25TdGF0ZVVwZGF0ZWQsIG9uT3BlbiB9OiBDb25uZWN0T3B0aW9ucyk6IHZvaWQge1xuICBjb25zdCBwcm90b2NvbCA9IHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCA9PT0gXCJodHRwczpcIiA/IFwid3NzOi8vXCIgOiBcIndzOi8vXCI7XG4gIHdzID0gbmV3IFdlYlNvY2tldChgJHtwcm90b2NvbH0ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fS93cz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb20pfWApO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwib3BlblwiLCAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coXCJbd3NdIG9wZW5cIik7XG4gICAgY29uc3Qgc29ja2V0ID0gd3M7XG4gICAgaWYgKHNvY2tldCAmJiBvbk9wZW4pIHtcbiAgICAgIG9uT3Blbihzb2NrZXQpO1xuICAgIH1cbiAgfSk7XG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbG9zZVwiLCAoKSA9PiBjb25zb2xlLmxvZyhcIlt3c10gY2xvc2VcIikpO1xuXG4gIGxldCBwcmV2Um91dGVzID0gbmV3IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4oKTtcbiAgbGV0IHByZXZBY3RpdmVSb3V0ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBwcmV2TWlzc2lsZUNvdW50ID0gMDtcblxuICB3cy5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCBkYXRhID0gc2FmZVBhcnNlKGV2ZW50LmRhdGEpO1xuICAgIGlmICghZGF0YSB8fCBkYXRhLnR5cGUgIT09IFwic3RhdGVcIikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBoYW5kbGVTdGF0ZU1lc3NhZ2Uoc3RhdGUsIGRhdGEsIGJ1cywgcHJldlJvdXRlcywgcHJldkFjdGl2ZVJvdXRlLCBwcmV2TWlzc2lsZUNvdW50KTtcbiAgICBwcmV2Um91dGVzID0gbmV3IE1hcChzdGF0ZS5taXNzaWxlUm91dGVzLm1hcCgocm91dGUpID0+IFtyb3V0ZS5pZCwgY2xvbmVSb3V0ZShyb3V0ZSldKSk7XG4gICAgcHJldkFjdGl2ZVJvdXRlID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgcHJldk1pc3NpbGVDb3VudCA9IHN0YXRlLm1pc3NpbGVzLmxlbmd0aDtcbiAgICBidXMuZW1pdChcInN0YXRlOnVwZGF0ZWRcIik7XG4gICAgb25TdGF0ZVVwZGF0ZWQ/LigpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU3RhdGVNZXNzYWdlKFxuICBzdGF0ZTogQXBwU3RhdGUsXG4gIG1zZzogU2VydmVyU3RhdGVNZXNzYWdlLFxuICBidXM6IEV2ZW50QnVzLFxuICBwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LFxuICBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwsXG4gIHByZXZNaXNzaWxlQ291bnQ6IG51bWJlcixcbik6IHZvaWQge1xuICBzdGF0ZS5ub3cgPSBtc2cubm93O1xuICBzdGF0ZS5ub3dTeW5jZWRBdCA9IG1vbm90b25pY05vdygpO1xuICBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgPSBOdW1iZXIuaXNGaW5pdGUobXNnLm5leHRfbWlzc2lsZV9yZWFkeSkgPyBtc2cubmV4dF9taXNzaWxlX3JlYWR5ISA6IDA7XG4gIHN0YXRlLm1lID0gbXNnLm1lID8ge1xuICAgIHg6IG1zZy5tZS54LFxuICAgIHk6IG1zZy5tZS55LFxuICAgIHZ4OiBtc2cubWUudngsXG4gICAgdnk6IG1zZy5tZS52eSxcbiAgICBocDogbXNnLm1lLmhwLFxuICAgIHdheXBvaW50czogQXJyYXkuaXNBcnJheShtc2cubWUud2F5cG9pbnRzKVxuICAgICAgPyBtc2cubWUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7IHg6IHdwLngsIHk6IHdwLnksIHNwZWVkOiBOdW1iZXIuaXNGaW5pdGUod3Auc3BlZWQpID8gd3Auc3BlZWQhIDogMTgwIH0pKVxuICAgICAgOiBbXSxcbiAgfSA6IG51bGw7XG4gIHN0YXRlLmdob3N0cyA9IEFycmF5LmlzQXJyYXkobXNnLmdob3N0cykgPyBtc2cuZ2hvc3RzLnNsaWNlKCkgOiBbXTtcbiAgc3RhdGUubWlzc2lsZXMgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlcykgPyBtc2cubWlzc2lsZXMuc2xpY2UoKSA6IFtdO1xuXG4gIGNvbnN0IHJvdXRlc0Zyb21TZXJ2ZXIgPSBBcnJheS5pc0FycmF5KG1zZy5taXNzaWxlX3JvdXRlcykgPyBtc2cubWlzc2lsZV9yb3V0ZXMgOiBbXTtcbiAgY29uc3QgbmV3Um91dGVzOiBNaXNzaWxlUm91dGVbXSA9IHJvdXRlc0Zyb21TZXJ2ZXIubWFwKChyb3V0ZSkgPT4gKHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSB8fCByb3V0ZS5pZCB8fCBcIlJvdXRlXCIsXG4gICAgd2F5cG9pbnRzOiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cylcbiAgICAgID8gcm91dGUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7IHg6IHdwLngsIHk6IHdwLnkgfSkpXG4gICAgICA6IFtdLFxuICB9KSk7XG5cbiAgZGlmZlJvdXRlcyhwcmV2Um91dGVzLCBuZXdSb3V0ZXMsIGJ1cyk7XG4gIHN0YXRlLm1pc3NpbGVSb3V0ZXMgPSBuZXdSb3V0ZXM7XG5cbiAgY29uc3QgbmV4dEFjdGl2ZSA9IHR5cGVvZiBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGUgPT09IFwic3RyaW5nXCIgJiYgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlLmxlbmd0aCA+IDBcbiAgICA/IG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZVxuICAgIDogbmV3Um91dGVzLmxlbmd0aCA+IDBcbiAgICAgID8gbmV3Um91dGVzWzBdLmlkXG4gICAgICA6IG51bGw7XG4gIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dEFjdGl2ZTtcbiAgaWYgKG5leHRBY3RpdmUgIT09IHByZXZBY3RpdmVSb3V0ZSkge1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIiwgeyByb3V0ZUlkOiBuZXh0QWN0aXZlID8/IG51bGwgfSk7XG4gIH1cblxuICBpZiAobXNnLm1pc3NpbGVfY29uZmlnKSB7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluKSB8fCBOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCkgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5hZ3JvX21pbikpIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGUsIHtcbiAgICAgICAgc3BlZWRNaW46IG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9taW4sXG4gICAgICAgIHNwZWVkTWF4OiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWF4LFxuICAgICAgICBhZ3JvTWluOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4sXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKHtcbiAgICAgIHNwZWVkOiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWQsXG4gICAgICBhZ3JvUmFkaXVzOiBtc2cubWlzc2lsZV9jb25maWcuYWdyb19yYWRpdXMsXG4gICAgfSwgc3RhdGUubWlzc2lsZUNvbmZpZywgc3RhdGUubWlzc2lsZUxpbWl0cyk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcubGlmZXRpbWUpKSB7XG4gICAgICBzYW5pdGl6ZWQubGlmZXRpbWUgPSBtc2cubWlzc2lsZV9jb25maWcubGlmZXRpbWUhO1xuICAgIH1cbiAgICBzdGF0ZS5taXNzaWxlQ29uZmlnID0gc2FuaXRpemVkO1xuICB9XG5cbiAgY29uc3QgbWV0YSA9IG1zZy5tZXRhID8/IHt9O1xuICBjb25zdCBoYXNDID0gdHlwZW9mIG1ldGEuYyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5jKTtcbiAgY29uc3QgaGFzVyA9IHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudyk7XG4gIGNvbnN0IGhhc0ggPSB0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpO1xuICBzdGF0ZS53b3JsZE1ldGEgPSB7XG4gICAgYzogaGFzQyA/IG1ldGEuYyEgOiBzdGF0ZS53b3JsZE1ldGEuYyxcbiAgICB3OiBoYXNXID8gbWV0YS53ISA6IHN0YXRlLndvcmxkTWV0YS53LFxuICAgIGg6IGhhc0ggPyBtZXRhLmghIDogc3RhdGUud29ybGRNZXRhLmgsXG4gIH07XG5cbiAgaWYgKHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA+IHByZXZNaXNzaWxlQ291bnQpIHtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZUlkID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgaWYgKGFjdGl2ZVJvdXRlSWQpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IGFjdGl2ZVJvdXRlSWQgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IFwiXCIgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY29vbGRvd25SZW1haW5pbmcgPSBNYXRoLm1heCgwLCBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpKTtcbiAgYnVzLmVtaXQoXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiLCB7IHNlY29uZHNSZW1haW5pbmc6IGNvb2xkb3duUmVtYWluaW5nIH0pO1xufVxuXG5mdW5jdGlvbiBkaWZmUm91dGVzKHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sIG5leHRSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdLCBidXM6IEV2ZW50QnVzKTogdm9pZCB7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByb3V0ZSBvZiBuZXh0Um91dGVzKSB7XG4gICAgc2Vlbi5hZGQocm91dGUuaWQpO1xuICAgIGNvbnN0IHByZXYgPSBwcmV2Um91dGVzLmdldChyb3V0ZS5pZCk7XG4gICAgaWYgKCFwcmV2KSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChyb3V0ZS5uYW1lICE9PSBwcmV2Lm5hbWUpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgbmFtZTogcm91dGUubmFtZSB9KTtcbiAgICB9XG4gICAgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPiBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgICB9IGVsc2UgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPCBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHByZXYud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfVxuICAgIGlmIChwcmV2LndheXBvaW50cy5sZW5ndGggPiAwICYmIHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgW3JvdXRlSWRdIG9mIHByZXZSb3V0ZXMpIHtcbiAgICBpZiAoIXNlZW4uaGFzKHJvdXRlSWQpKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVEZWxldGVkXCIsIHsgcm91dGVJZCB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xvbmVSb3V0ZShyb3V0ZTogTWlzc2lsZVJvdXRlKTogTWlzc2lsZVJvdXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSxcbiAgICB3YXlwb2ludHM6IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHNhZmVQYXJzZSh2YWx1ZTogdW5rbm93bik6IFNlcnZlclN0YXRlTWVzc2FnZSB8IG51bGwge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSkgYXMgU2VydmVyU3RhdGVNZXNzYWdlO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLndhcm4oXCJbd3NdIGZhaWxlZCB0byBwYXJzZSBtZXNzYWdlXCIsIGVycik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShzdGF0ZS5ub3cpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgY29uc3Qgc3luY2VkQXQgPSBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93U3luY2VkQXQpID8gc3RhdGUubm93U3luY2VkQXQgOiBudWxsO1xuICBpZiAoIXN5bmNlZEF0KSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICBjb25zdCBlbGFwc2VkTXMgPSBtb25vdG9uaWNOb3coKSAtIHN5bmNlZEF0O1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShlbGFwc2VkTXMpIHx8IGVsYXBzZWRNcyA8IDApIHtcbiAgICByZXR1cm4gc3RhdGUubm93O1xuICB9XG4gIHJldHVybiBzdGF0ZS5ub3cgKyBlbGFwc2VkTXMgLyAxMDAwO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7IGdldEFwcHJveFNlcnZlck5vdywgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi9uZXRcIjtcbmltcG9ydCB7XG4gIHR5cGUgQWN0aXZlVG9vbCxcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIHR5cGUgTWlzc2lsZVNlbGVjdGlvbixcbiAgdHlwZSBTZWxlY3Rpb24sXG4gIHR5cGUgVUlTdGF0ZSxcbiAgY2xhbXAsXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbn0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7XG4gIE1JU1NJTEVfTUlOX1NQRUVELFxuICBNSVNTSUxFX01BWF9TUEVFRCxcbiAgTUlTU0lMRV9NSU5fQUdSTyxcbn0gZnJvbSBcIi4vc3RhdGVcIjtcblxuaW50ZXJmYWNlIEluaXRHYW1lT3B0aW9ucyB7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbn1cblxuaW50ZXJmYWNlIEdhbWVDb250cm9sbGVyIHtcbiAgb25TdGF0ZVVwZGF0ZWQoKTogdm9pZDtcbn1cblxubGV0IHN0YXRlUmVmOiBBcHBTdGF0ZTtcbmxldCB1aVN0YXRlUmVmOiBVSVN0YXRlO1xubGV0IGJ1c1JlZjogRXZlbnRCdXM7XG5cbmxldCBjdjogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCB8IG51bGwgPSBudWxsO1xubGV0IEhQc3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwQ29udHJvbHNDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBDbGVhckJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFJvdXRlc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwUm91dGVMZWc6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFJvdXRlU3BlZWQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcERlbGV0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTcGVlZFNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTcGVlZFZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgbWlzc2lsZUNvbnRyb2xzQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWRkUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUxhdW5jaEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlTGF1bmNoVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlTGF1bmNoSW5mbzogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZURlbGV0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTcGVlZFNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTcGVlZFZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVBZ3JvQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb1NsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVBZ3JvVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3Bhd25Cb3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCByb3V0ZVByZXZCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcm91dGVOZXh0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJvdXRlTWVudVRvZ2dsZTogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByb3V0ZU1lbnU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcmVuYW1lTWlzc2lsZVJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVJvdXRlTmFtZUxhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVSb3V0ZUNvdW50TGFiZWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCBoZWxwVG9nZ2xlOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGhlbHBPdmVybGF5OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGhlbHBDbG9zZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IHNlbGVjdGlvbjogU2VsZWN0aW9uIHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xubGV0IGRlZmF1bHRTcGVlZCA9IDE1MDtcbmxldCBsYXN0TG9vcFRzOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmxldCBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQ6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcbmNvbnN0IGxlZ0Rhc2hPZmZzZXRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbmxldCBsYXN0TWlzc2lsZUxhdW5jaFRleHRIVE1MID0gXCJcIjtcbmxldCBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gXCJcIjtcblxuY29uc3QgSEVMUF9URVhUID0gW1xuICBcIlByaW1hcnkgTW9kZXNcIixcbiAgXCIgIDEgXHUyMDEzIFRvZ2dsZSBzaGlwIG5hdmlnYXRpb24gbW9kZVwiLFxuICBcIiAgMiBcdTIwMTMgVG9nZ2xlIG1pc3NpbGUgY29vcmRpbmF0aW9uIG1vZGVcIixcbiAgXCJcIixcbiAgXCJTaGlwIE5hdmlnYXRpb25cIixcbiAgXCIgIFQgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgIEMgXHUyMDEzIENsZWFyIGFsbCB3YXlwb2ludHNcIixcbiAgXCIgIFIgXHUyMDEzIFRvZ2dsZSBzaG93IHJvdXRlXCIsXG4gIFwiICBbIC8gXSBcdTIwMTMgQWRqdXN0IHdheXBvaW50IHNwZWVkXCIsXG4gIFwiICBTaGlmdCtbIC8gXSBcdTIwMTMgQ29hcnNlIHNwZWVkIGFkanVzdFwiLFxuICBcIiAgVGFiIC8gU2hpZnQrVGFiIFx1MjAxMyBDeWNsZSB3YXlwb2ludHNcIixcbiAgXCIgIERlbGV0ZSBcdTIwMTMgRGVsZXRlIGZyb20gc2VsZWN0ZWQgd2F5cG9pbnRcIixcbiAgXCJcIixcbiAgXCJNaXNzaWxlIENvb3JkaW5hdGlvblwiLFxuICBcIiAgTiBcdTIwMTMgQWRkIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gIFwiICBMIFx1MjAxMyBMYXVuY2ggbWlzc2lsZXNcIixcbiAgXCIgIEUgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgICwgLyAuIFx1MjAxMyBBZGp1c3QgYWdybyByYWRpdXNcIixcbiAgXCIgIDsgLyAnIFx1MjAxMyBBZGp1c3QgbWlzc2lsZSBzcGVlZFwiLFxuICBcIiAgU2hpZnQrc2xpZGVyIGtleXMgXHUyMDEzIENvYXJzZSBhZGp1c3RcIixcbiAgXCIgIERlbGV0ZSBcdTIwMTMgRGVsZXRlIHNlbGVjdGVkIG1pc3NpbGUgd2F5cG9pbnRcIixcbiAgXCJcIixcbiAgXCJHZW5lcmFsXCIsXG4gIFwiICA/IFx1MjAxMyBUb2dnbGUgdGhpcyBvdmVybGF5XCIsXG4gIFwiICBFc2MgXHUyMDEzIENhbmNlbCBzZWxlY3Rpb24gb3IgY2xvc2Ugb3ZlcmxheVwiLFxuXS5qb2luKFwiXFxuXCIpO1xuXG5jb25zdCB3b3JsZCA9IHsgdzogODAwMCwgaDogNDUwMCB9O1xuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH06IEluaXRHYW1lT3B0aW9ucyk6IEdhbWVDb250cm9sbGVyIHtcbiAgc3RhdGVSZWYgPSBzdGF0ZTtcbiAgdWlTdGF0ZVJlZiA9IHVpU3RhdGU7XG4gIGJ1c1JlZiA9IGJ1cztcblxuICBjYWNoZURvbSgpO1xuICBpZiAoIWN2KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FudmFzIGVsZW1lbnQgI2N2IG5vdCBmb3VuZFwiKTtcbiAgfVxuICBjdHggPSBjdi5nZXRDb250ZXh0KFwiMmRcIik7XG5cbiAgYmluZExpc3RlbmVycygpO1xuICBzeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk7XG4gIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB1cGRhdGVIZWxwT3ZlcmxheSgpO1xuICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk7XG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcblxuICByZXR1cm4ge1xuICAgIG9uU3RhdGVVcGRhdGVkKCkge1xuICAgICAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gICAgICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gY2FjaGVEb20oKTogdm9pZCB7XG4gIGN2ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdlwiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gIGN0eCA9IGN2Py5nZXRDb250ZXh0KFwiMmRcIikgPz8gbnVsbDtcbiAgSFBzcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWhwXCIpO1xuICBzaGlwQ29udHJvbHNDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNvbnRyb2xzXCIpO1xuICBzaGlwQ2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTZWxlY3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc2hpcFJvdXRlc0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZXNcIik7XG4gIHNoaXBSb3V0ZUxlZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZS1sZWdcIik7XG4gIHNoaXBSb3V0ZVNwZWVkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXJvdXRlLXNwZWVkXCIpO1xuICBzaGlwRGVsZXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTcGVlZENhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtY2FyZFwiKTtcbiAgc2hpcFNwZWVkU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgc2hpcFNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtdmFsdWVcIik7XG5cbiAgbWlzc2lsZUNvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1jb250cm9sc1wiKTtcbiAgbWlzc2lsZUFkZFJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFkZC1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVMYXVuY2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZUxhdW5jaFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoLXRleHRcIik7XG4gIG1pc3NpbGVMYXVuY2hJbmZvID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaC1pbmZvXCIpO1xuICBtaXNzaWxlU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVTZWxlY3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2VsZWN0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZURlbGV0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1kZWxldGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU3BlZWRDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLWNhcmRcIik7XG4gIG1pc3NpbGVTcGVlZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVTcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLXZhbHVlXCIpO1xuICBtaXNzaWxlQWdyb0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1jYXJkXCIpO1xuICBtaXNzaWxlQWdyb1NsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZUFncm9WYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXZhbHVlXCIpO1xuXG4gIHNwYXduQm90QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGF3bi1ib3RcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZVByZXZCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZU5leHRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW5leHRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZU1lbnVUb2dnbGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW1lbnUtdG9nZ2xlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVNZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51XCIpO1xuICByZW5hbWVNaXNzaWxlUm91dGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlbmFtZS1taXNzaWxlLXJvdXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWxldGUtbWlzc2lsZS1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2xlYXItbWlzc2lsZS13YXlwb2ludHNcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlUm91dGVOYW1lTGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtbmFtZVwiKTtcbiAgbWlzc2lsZVJvdXRlQ291bnRMYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1yb3V0ZS1jb3VudFwiKTtcblxuICBoZWxwVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGhlbHBPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLW92ZXJsYXlcIik7XG4gIGhlbHBDbG9zZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC1jbG9zZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGhlbHBUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRleHRcIik7XG5cbiAgZGVmYXVsdFNwZWVkID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXI/LnZhbHVlID8/IFwiMTUwXCIpO1xufVxuXG5mdW5jdGlvbiBiaW5kTGlzdGVuZXJzKCk6IHZvaWQge1xuICBpZiAoIWN2KSByZXR1cm47XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCBvbkNhbnZhc1BvaW50ZXJEb3duKTtcblxuICBzcGF3bkJvdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwic3Bhd25fYm90XCIgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIik7XG4gIH0pO1xuXG4gIHNoaXBDbGVhckJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIGNsZWFyU2hpcFJvdXRlKCk7XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOmNsZWFySW52b2tlZFwiKTtcbiAgfSk7XG5cbiAgc2hpcFNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gIH0pO1xuXG4gIHNoaXBTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2VsZWN0XCIpO1xuICB9KTtcblxuICBzaGlwU3BlZWRTbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcnNlRmxvYXQoKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSByZXR1cm47XG4gICAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG4gICAgZGVmYXVsdFNwZWVkID0gdmFsdWU7XG4gICAgaWYgKHNlbGVjdGlvbiAmJiBzdGF0ZVJlZi5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgJiYgc3RhdGVSZWYubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0pIHtcbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJ1cGRhdGVfd2F5cG9pbnRcIiwgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCwgc3BlZWQ6IHZhbHVlIH0pO1xuICAgICAgc3RhdGVSZWYubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0uc3BlZWQgPSB2YWx1ZTtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICB9XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBzaGlwRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZUFkZFJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF9taXNzaWxlX3JvdXRlXCIgfSk7XG4gIH0pO1xuXG4gIG1pc3NpbGVMYXVuY2hCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gIH0pO1xuXG4gIG1pc3NpbGVTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2VsZWN0XCIpO1xuICB9KTtcblxuICBtaXNzaWxlRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNwZWVkU2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHZhbHVlKSkgcmV0dXJuO1xuICAgIHVwZGF0ZU1pc3NpbGVDb25maWdGcm9tVUkoeyBzcGVlZDogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBtaXNzaWxlQWdyb1NsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKHsgYWdyb1JhZGl1czogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmFncm9DaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gIH0pO1xuXG4gIHJvdXRlUHJldkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKC0xKSk7XG4gIHJvdXRlTmV4dEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKDEpKTtcblxuICByb3V0ZU1lbnVUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGlmICghcm91dGVNZW51IHx8ICFyb3V0ZU1lbnUuY2xhc3NMaXN0LmNvbnRhaW5zKFwidmlzaWJsZVwiKSkgcmV0dXJuO1xuICAgIGlmIChldmVudC50YXJnZXQgPT09IHJvdXRlTWVudVRvZ2dsZSkgcmV0dXJuO1xuICAgIGlmIChyb3V0ZU1lbnUuY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpKSByZXR1cm47XG4gICAgcm91dGVNZW51LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICB9KTtcblxuICByZW5hbWVNaXNzaWxlUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUpIHJldHVybjtcbiAgICBjb25zdCBuYW1lID0gd2luZG93LnByb21wdChcIlJlbmFtZSByb3V0ZVwiLCByb3V0ZS5uYW1lIHx8IFwiXCIpO1xuICAgIGlmIChuYW1lID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3QgdHJpbW1lZCA9IG5hbWUudHJpbSgpO1xuICAgIGlmICghdHJpbW1lZCkgcmV0dXJuO1xuICAgIHJvdXRlLm5hbWUgPSB0cmltbWVkO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJyZW5hbWVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgcm91dGVfbmFtZTogdHJpbW1lZCxcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgaWYgKCF3aW5kb3cuY29uZmlybShgRGVsZXRlICR7cm91dGUubmFtZX0/YCkpIHJldHVybjtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmIChyb3V0ZXMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJvdXRlLndheXBvaW50cyA9IFtdO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGF0ZVJlZi5taXNzaWxlUm91dGVzID0gcm91dGVzLmZpbHRlcigocikgPT4gci5pZCAhPT0gcm91dGUuaWQpO1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubWlzc2lsZVJvdXRlcztcbiAgICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcmVtYWluaW5nLmxlbmd0aCA+IDAgPyByZW1haW5pbmdbMF0uaWQgOiBudWxsO1xuICAgIH1cbiAgICBtaXNzaWxlU2VsZWN0aW9uID0gbnVsbDtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImRlbGV0ZV9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICByb3V0ZU1lbnU/LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJjbGVhcl9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gW107XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IG51bGw7XG4gICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIH0pO1xuXG4gIGhlbHBUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SGVscFZpc2libGUodHJ1ZSk7XG4gIH0pO1xuXG4gIGhlbHBDbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRIZWxwVmlzaWJsZShmYWxzZSk7XG4gIH0pO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbldpbmRvd0tleURvd24sIHsgY2FwdHVyZTogZmFsc2UgfSk7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlckRvd24oZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8ICFjdHgpIHJldHVybjtcbiAgaWYgKGhlbHBPdmVybGF5Py5jbGFzc0xpc3QuY29udGFpbnMoXCJ2aXNpYmxlXCIpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJlY3QgPSBjdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3Qgc2NhbGVYID0gcmVjdC53aWR0aCAhPT0gMCA/IGN2LndpZHRoIC8gcmVjdC53aWR0aCA6IDE7XG4gIGNvbnN0IHNjYWxlWSA9IHJlY3QuaGVpZ2h0ICE9PSAwID8gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQgOiAxO1xuICBjb25zdCB4ID0gKGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICBjb25zdCB5ID0gKGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcCkgKiBzY2FsZVk7XG4gIGNvbnN0IGNhbnZhc1BvaW50ID0geyB4LCB5IH07XG4gIGNvbnN0IHdvcmxkUG9pbnQgPSBjYW52YXNUb1dvcmxkKGNhbnZhc1BvaW50KTtcblxuICBjb25zdCBjb250ZXh0ID0gdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcbiAgaWYgKGNvbnRleHQgPT09IFwibWlzc2lsZVwiKSB7XG4gICAgaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICB9IGVsc2Uge1xuICAgIGhhbmRsZVNoaXBQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgfVxuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTcGVlZExhYmVsKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHNoaXBTcGVlZFZhbHVlKSB7XG4gICAgc2hpcFNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBOdW1iZXIodmFsdWUpLnRvRml4ZWQoMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U2hpcFNsaWRlclZhbHVlKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFzaGlwU3BlZWRTbGlkZXIpIHJldHVybjtcbiAgc2hpcFNwZWVkU2xpZGVyLnZhbHVlID0gU3RyaW5nKHZhbHVlKTtcbiAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgaWYgKHJvdXRlcy5sZW5ndGggPT09IDApIHtcbiAgICBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG51bGw7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaWYgKCFzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCB8fCAhcm91dGVzLnNvbWUoKHJvdXRlKSA9PiByb3V0ZS5pZCA9PT0gc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQpKSB7XG4gICAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSByb3V0ZXNbMF0uaWQ7XG4gIH1cbiAgcmV0dXJuIHJvdXRlcy5maW5kKChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbCB7XG4gIHJldHVybiBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gIGNvbnN0IGFjdGl2ZVJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmIChtaXNzaWxlUm91dGVOYW1lTGFiZWwpIHtcbiAgICBpZiAoIWFjdGl2ZVJvdXRlKSB7XG4gICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSByb3V0ZXMubGVuZ3RoID09PSAwID8gXCJObyByb3V0ZVwiIDogXCJSb3V0ZVwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSBhY3RpdmVSb3V0ZS5uYW1lIHx8IFwiUm91dGVcIjtcbiAgICB9XG4gIH1cblxuICBpZiAobWlzc2lsZVJvdXRlQ291bnRMYWJlbCkge1xuICAgIGNvbnN0IGNvdW50ID0gYWN0aXZlUm91dGUgJiYgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpID8gYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gICAgbWlzc2lsZVJvdXRlQ291bnRMYWJlbC50ZXh0Q29udGVudCA9IGAke2NvdW50fSBwdHNgO1xuICB9XG5cbiAgaWYgKGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bikge1xuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9IHJvdXRlcy5sZW5ndGggPD0gMTtcbiAgfVxuICBpZiAocmVuYW1lTWlzc2lsZVJvdXRlQnRuKSB7XG4gICAgcmVuYW1lTWlzc2lsZVJvdXRlQnRuLmRpc2FibGVkID0gIWFjdGl2ZVJvdXRlO1xuICB9XG4gIGlmIChjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4pIHtcbiAgICBjb25zdCBjb3VudCA9IGFjdGl2ZVJvdXRlICYmIEFycmF5LmlzQXJyYXkoYWN0aXZlUm91dGUud2F5cG9pbnRzKSA/IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZSB8fCBjb3VudCA9PT0gMDtcbiAgfVxuICBpZiAocm91dGVQcmV2QnRuKSB7XG4gICAgcm91dGVQcmV2QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICB9XG4gIGlmIChyb3V0ZU5leHRCdG4pIHtcbiAgICByb3V0ZU5leHRCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gIH1cblxuICB1cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBzeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk6IHZvaWQge1xuICBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgYWN0aXZlUm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3Qgcm91dGVIYXNTZWxlY3Rpb24gPVxuICAgICEhYWN0aXZlUm91dGUgJiZcbiAgICBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgJiZcbiAgICAhIW1pc3NpbGVTZWxlY3Rpb24gJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aDtcbiAgaWYgKCFyb3V0ZUhhc1NlbGVjdGlvbikge1xuICAgIG1pc3NpbGVTZWxlY3Rpb24gPSBudWxsO1xuICB9XG4gIGNvbnN0IGNmZyA9IHN0YXRlUmVmLm1pc3NpbGVDb25maWc7XG4gIGFwcGx5TWlzc2lsZVVJKGNmZyk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gYXBwbHlNaXNzaWxlVUkoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIpIHtcbiAgICBjb25zdCBtaW5TcGVlZCA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4gPz8gTUlTU0lMRV9NSU5fU1BFRUQ7XG4gICAgY29uc3QgbWF4U3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWF4ID8/IE1JU1NJTEVfTUFYX1NQRUVEO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5taW4gPSBTdHJpbmcobWluU3BlZWQpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5tYXggPSBTdHJpbmcobWF4U3BlZWQpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IGNmZy5zcGVlZC50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgIG1pc3NpbGVTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gY2ZnLnNwZWVkLnRvRml4ZWQoMCk7XG4gIH1cbiAgaWYgKG1pc3NpbGVBZ3JvU2xpZGVyKSB7XG4gICAgY29uc3QgbWluQWdybyA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuYWdyb01pbiA/PyBNSVNTSUxFX01JTl9BR1JPO1xuICAgIGNvbnN0IG1heEFncm8gPSBNYXRoLm1heCg1MDAwLCBNYXRoLmNlaWwoKGNmZy5hZ3JvUmFkaXVzICsgNTAwKSAvIDUwMCkgKiA1MDApO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5BZ3JvKTtcbiAgICBtaXNzaWxlQWdyb1NsaWRlci5tYXggPSBTdHJpbmcobWF4QWdybyk7XG4gICAgbWlzc2lsZUFncm9TbGlkZXIudmFsdWUgPSBjZmcuYWdyb1JhZGl1cy50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlQWdyb1ZhbHVlKSB7XG4gICAgbWlzc2lsZUFncm9WYWx1ZS50ZXh0Q29udGVudCA9IGNmZy5hZ3JvUmFkaXVzLnRvRml4ZWQoMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSShvdmVycmlkZXM6IFBhcnRpYWw8eyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfT4gPSB7fSk6IHZvaWQge1xuICBjb25zdCBjdXJyZW50ID0gc3RhdGVSZWYubWlzc2lsZUNvbmZpZztcbiAgY29uc3QgY2ZnID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKHtcbiAgICBzcGVlZDogb3ZlcnJpZGVzLnNwZWVkID8/IGN1cnJlbnQuc3BlZWQsXG4gICAgYWdyb1JhZGl1czogb3ZlcnJpZGVzLmFncm9SYWRpdXMgPz8gY3VycmVudC5hZ3JvUmFkaXVzLFxuICB9LCBjdXJyZW50LCBzdGF0ZVJlZi5taXNzaWxlTGltaXRzKTtcbiAgc3RhdGVSZWYubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgYXBwbHlNaXNzaWxlVUkoY2ZnKTtcbiAgY29uc3QgbGFzdCA9IGxhc3RNaXNzaWxlQ29uZmlnU2VudDtcbiAgY29uc3QgbmVlZHNTZW5kID1cbiAgICAhbGFzdCB8fFxuICAgIE1hdGguYWJzKGxhc3Quc3BlZWQgLSBjZmcuc3BlZWQpID4gMC4yNSB8fFxuICAgIE1hdGguYWJzKChsYXN0LmFncm9SYWRpdXMgPz8gMCkgLSBjZmcuYWdyb1JhZGl1cykgPiA1O1xuICBpZiAobmVlZHNTZW5kKSB7XG4gICAgc2VuZE1pc3NpbGVDb25maWcoY2ZnKTtcbiAgfVxuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiBzZW5kTWlzc2lsZUNvbmZpZyhjZmc6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0pOiB2b2lkIHtcbiAgbGFzdE1pc3NpbGVDb25maWdTZW50ID0ge1xuICAgIHNwZWVkOiBjZmcuc3BlZWQsXG4gICAgYWdyb1JhZGl1czogY2ZnLmFncm9SYWRpdXMsXG4gIH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImNvbmZpZ3VyZV9taXNzaWxlXCIsXG4gICAgbWlzc2lsZV9zcGVlZDogY2ZnLnNwZWVkLFxuICAgIG1pc3NpbGVfYWdybzogY2ZnLmFncm9SYWRpdXMsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk6IHZvaWQge1xuICBpZiAoIXNoaXBSb3V0ZXNDb250YWluZXIgfHwgIXNoaXBSb3V0ZUxlZyB8fCAhc2hpcFJvdXRlU3BlZWQgfHwgIXNoaXBEZWxldGVCdG4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGNvbnN0IGhhc1ZhbGlkU2VsZWN0aW9uID0gc2VsZWN0aW9uICE9PSBudWxsICYmIHNlbGVjdGlvbi5pbmRleCA+PSAwICYmIHNlbGVjdGlvbi5pbmRleCA8IHdwcy5sZW5ndGg7XG4gIGNvbnN0IGlzU2hpcENvbnRleHQgPSB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCI7XG5cbiAgc2hpcFJvdXRlc0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUub3BhY2l0eSA9IGlzU2hpcENvbnRleHQgPyBcIjFcIiA6IFwiMC42XCI7XG5cbiAgaWYgKCFzdGF0ZVJlZi5tZSB8fCAhaGFzVmFsaWRTZWxlY3Rpb24pIHtcbiAgICBzaGlwUm91dGVMZWcudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIHNoaXBSb3V0ZVNwZWVkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICBzaGlwRGVsZXRlQnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICBpZiAoaXNTaGlwQ29udGV4dCkge1xuICAgICAgc2V0U2hpcFNsaWRlclZhbHVlKGRlZmF1bHRTcGVlZCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChzZWxlY3Rpb24gIT09IG51bGwpIHtcbiAgICBjb25zdCB3cCA9IHdwc1tzZWxlY3Rpb24uaW5kZXhdO1xuICAgIGNvbnN0IHNwZWVkID0gd3AgJiYgdHlwZW9mIHdwLnNwZWVkID09PSBcIm51bWJlclwiID8gd3Auc3BlZWQgOiBkZWZhdWx0U3BlZWQ7XG4gICAgaWYgKGlzU2hpcENvbnRleHQgJiYgc2hpcFNwZWVkU2xpZGVyICYmIE1hdGguYWJzKHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyLnZhbHVlKSAtIHNwZWVkKSA+IDAuMjUpIHtcbiAgICAgIHNldFNoaXBTbGlkZXJWYWx1ZShzcGVlZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHVwZGF0ZVNwZWVkTGFiZWwoc3BlZWQpO1xuICAgIH1cbiAgICBjb25zdCBkaXNwbGF5SW5kZXggPSBzZWxlY3Rpb24uaW5kZXggKyAxO1xuICAgIHNoaXBSb3V0ZUxlZy50ZXh0Q29udGVudCA9IGAke2Rpc3BsYXlJbmRleH1gO1xuICAgIHNoaXBSb3V0ZVNwZWVkLnRleHRDb250ZW50ID0gYCR7c3BlZWQudG9GaXhlZCgwKX0gdS9zYDtcbiAgICBzaGlwRGVsZXRlQnRuLmRpc2FibGVkID0gIWlzU2hpcENvbnRleHQ7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpOiB2b2lkIHtcbiAgaWYgKCFtaXNzaWxlRGVsZXRlQnRuKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGNvdW50ID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gIGNvbnN0IGhhc1NlbGVjdGlvbiA9IG1pc3NpbGVTZWxlY3Rpb24gIT09IG51bGwgJiYgbWlzc2lsZVNlbGVjdGlvbiAhPT0gdW5kZWZpbmVkICYmIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPj0gMCAmJiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgY291bnQ7XG4gIG1pc3NpbGVEZWxldGVCdG4uZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xufVxuXG5mdW5jdGlvbiBzZXRTZWxlY3Rpb24oc2VsOiBTZWxlY3Rpb24gfCBudWxsKTogdm9pZCB7XG4gIHNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICBjb25zdCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IG51bGw7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDpsZWdTZWxlY3RlZFwiLCB7IGluZGV4IH0pO1xufVxuXG5mdW5jdGlvbiBzZXRNaXNzaWxlU2VsZWN0aW9uKHNlbDogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwpOiB2b2lkIHtcbiAgbWlzc2lsZVNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCB3b3JsZFBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBpZiAodWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIikge1xuICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RSb3V0ZShjYW52YXNQb2ludCk7XG4gICAgc2V0U2VsZWN0aW9uKGhpdCA/PyBudWxsKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkOiBkZWZhdWx0U3BlZWQgfTtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF93YXlwb2ludFwiLCB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogZGVmYXVsdFNwZWVkIH0pO1xuICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMuc2xpY2UoKSA6IFtdO1xuICB3cHMucHVzaCh3cCk7XG4gIHN0YXRlUmVmLm1lLndheXBvaW50cyA9IHdwcztcbiAgaWYgKHdwcy5sZW5ndGggPiAwKSB7XG4gICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludEFkZGVkXCIsIHsgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIHdvcmxkUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlKSByZXR1cm47XG5cbiAgaWYgKHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0TWlzc2lsZVJvdXRlKGNhbnZhc1BvaW50KTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKGhpdCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgd3AgPSB7IHg6IHdvcmxkUG9pbnQueCwgeTogd29ybGRQb2ludC55IH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImFkZF9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIHg6IHdwLngsXG4gICAgeTogd3AueSxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cyA/IFsuLi5yb3V0ZS53YXlwb2ludHMsIHdwXSA6IFt3cF07XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24oeyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHJvdXRlLndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xufVxuXG5mdW5jdGlvbiBjbGVhclNoaXBSb3V0ZSgpOiB2b2lkIHtcbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGlmICghd3BzIHx8IHdwcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImNsZWFyX3dheXBvaW50c1wiIH0pO1xuICBpZiAoc3RhdGVSZWYubWUpIHtcbiAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHMgPSBbXTtcbiAgfVxuICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludHNDbGVhcmVkXCIpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVTZWxlY3RlZFNoaXBXYXlwb2ludCgpOiB2b2lkIHtcbiAgaWYgKCFzZWxlY3Rpb24pIHJldHVybjtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRlbGV0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICBpZiAoc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpKSB7XG4gICAgc3RhdGVSZWYubWUud2F5cG9pbnRzID0gc3RhdGVSZWYubWUud2F5cG9pbnRzLnNsaWNlKDAsIHNlbGVjdGlvbi5pbmRleCk7XG4gIH1cbiAgYnVzUmVmLmVtaXQoXCJzaGlwOndheXBvaW50RGVsZXRlZFwiLCB7IGluZGV4OiBzZWxlY3Rpb24uaW5kZXggfSk7XG4gIHNldFNlbGVjdGlvbihudWxsKTtcbn1cblxuZnVuY3Rpb24gZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUgfHwgIW1pc3NpbGVTZWxlY3Rpb24pIHJldHVybjtcbiAgY29uc3QgaW5kZXggPSBtaXNzaWxlU2VsZWN0aW9uLmluZGV4O1xuICBpZiAoIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCBpbmRleCA8IDAgfHwgaW5kZXggPj0gcm91dGUud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJkZWxldGVfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICBpbmRleCxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IFsuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoMCwgaW5kZXgpLCAuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoaW5kZXggKyAxKV07XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXggfSk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG59XG5cbmZ1bmN0aW9uIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgaWYgKG1pc3NpbGVMYXVuY2hCdG4/LmRpc2FibGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwibGF1bmNoX21pc3NpbGVcIixcbiAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjeWNsZU1pc3NpbGVSb3V0ZShkaXJlY3Rpb246IG51bWJlcik6IHZvaWQge1xuICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICBpZiAocm91dGVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjdXJyZW50SW5kZXggPSByb3V0ZXMuZmluZEluZGV4KChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKTtcbiAgY29uc3QgYmFzZUluZGV4ID0gY3VycmVudEluZGV4ID49IDAgPyBjdXJyZW50SW5kZXggOiAwO1xuICBjb25zdCBuZXh0SW5kZXggPSAoKGJhc2VJbmRleCArIGRpcmVjdGlvbikgJSByb3V0ZXMubGVuZ3RoICsgcm91dGVzLmxlbmd0aCkgJSByb3V0ZXMubGVuZ3RoO1xuICBjb25zdCBuZXh0Um91dGUgPSByb3V0ZXNbbmV4dEluZGV4XTtcbiAgaWYgKCFuZXh0Um91dGUpIHJldHVybjtcbiAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSBuZXh0Um91dGUuaWQ7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcInNldF9hY3RpdmVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgIHJvdXRlX2lkOiBuZXh0Um91dGUuaWQsXG4gIH0pO1xuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsIHsgcm91dGVJZDogbmV4dFJvdXRlLmlkIH0pO1xufVxuXG5mdW5jdGlvbiBjeWNsZVNoaXBTZWxlY3Rpb24oZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGlmICghd3BzIHx8IHdwcy5sZW5ndGggPT09IDApIHtcbiAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IGRpcmVjdGlvbiA+IDAgPyAtMSA6IHdwcy5sZW5ndGg7XG4gIGluZGV4ICs9IGRpcmVjdGlvbjtcbiAgaWYgKGluZGV4IDwgMCkgaW5kZXggPSB3cHMubGVuZ3RoIC0gMTtcbiAgaWYgKGluZGV4ID49IHdwcy5sZW5ndGgpIGluZGV4ID0gMDtcbiAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXggfSk7XG59XG5cbmZ1bmN0aW9uIHNldElucHV0Q29udGV4dChjb250ZXh0OiBcInNoaXBcIiB8IFwibWlzc2lsZVwiKTogdm9pZCB7XG4gIGNvbnN0IG5leHQgPSBjb250ZXh0ID09PSBcIm1pc3NpbGVcIiA/IFwibWlzc2lsZVwiIDogXCJzaGlwXCI7XG4gIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gbmV4dCkge1xuICAgIHJldHVybjtcbiAgfVxuICB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9IG5leHQ7XG4gIGJ1c1JlZi5lbWl0KFwiY29udGV4dDpjaGFuZ2VkXCIsIHsgY29udGV4dDogbmV4dCB9KTtcbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG59XG5cbmZ1bmN0aW9uIHNldEFjdGl2ZVRvb2wodG9vbDogQWN0aXZlVG9vbCk6IHZvaWQge1xuICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSB0b29sKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID0gdG9vbDtcblxuICAvLyBVcGRhdGUgYmFja3dhcmQgY29tcGF0aWJpbGl0eSBzdGF0ZXNcbiAgaWYgKHRvb2wgPT09IFwic2hpcC1zZXRcIikge1xuICAgIHVpU3RhdGVSZWYuc2hpcFRvb2wgPSBcInNldFwiO1xuICAgIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPSBudWxsO1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZXRcIiB9KTtcbiAgfSBlbHNlIGlmICh0b29sID09PSBcInNoaXAtc2VsZWN0XCIpIHtcbiAgICB1aVN0YXRlUmVmLnNoaXBUb29sID0gXCJzZWxlY3RcIjtcbiAgICB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID0gbnVsbDtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2VsZWN0XCIgfSk7XG4gIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IG51bGw7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IFwic2V0XCI7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2V0XCIgfSk7XG4gIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IG51bGw7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IFwic2VsZWN0XCI7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNlbGVjdFwiIH0pO1xuICB9XG5cbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbn1cblxuZnVuY3Rpb24gc2V0QnV0dG9uU3RhdGUoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICBpZiAoIWJ0bikgcmV0dXJuO1xuICBpZiAoYWN0aXZlKSB7XG4gICAgYnRuLmRhdGFzZXQuc3RhdGUgPSBcImFjdGl2ZVwiO1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJ0cnVlXCIpO1xuICB9IGVsc2Uge1xuICAgIGRlbGV0ZSBidG4uZGF0YXNldC5zdGF0ZTtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwiZmFsc2VcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTogdm9pZCB7XG4gIHNldEJ1dHRvblN0YXRlKHNoaXBTZXRCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNldFwiKTtcbiAgc2V0QnV0dG9uU3RhdGUoc2hpcFNlbGVjdEJ0biwgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2VsZWN0XCIpO1xuICBzZXRCdXR0b25TdGF0ZShtaXNzaWxlU2V0QnRuLCB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZXRcIik7XG4gIHNldEJ1dHRvblN0YXRlKG1pc3NpbGVTZWxlY3RCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKTtcblxuICBpZiAoc2hpcENvbnRyb2xzQ2FyZCkge1xuICAgIHNoaXBDb250cm9sc0NhcmQuY2xhc3NMaXN0LnRvZ2dsZShcImFjdGl2ZVwiLCB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCIpO1xuICB9XG4gIGlmIChtaXNzaWxlQ29udHJvbHNDYXJkKSB7XG4gICAgbWlzc2lsZUNvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0SGVscFZpc2libGUoZmxhZzogYm9vbGVhbik6IHZvaWQge1xuICB1aVN0YXRlUmVmLmhlbHBWaXNpYmxlID0gQm9vbGVhbihmbGFnKTtcbiAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgYnVzUmVmLmVtaXQoXCJoZWxwOnZpc2libGVDaGFuZ2VkXCIsIHsgdmlzaWJsZTogdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSB9KTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlSGVscE92ZXJsYXkoKTogdm9pZCB7XG4gIGlmICghaGVscE92ZXJsYXkpIHJldHVybjtcbiAgaWYgKGhlbHBUZXh0KSB7XG4gICAgaGVscFRleHQudGV4dENvbnRlbnQgPSBIRUxQX1RFWFQ7XG4gIH1cbiAgaGVscE92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZShcInZpc2libGVcIiwgdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSk7XG59XG5cbmZ1bmN0aW9uIGFkanVzdFNsaWRlclZhbHVlKGlucHV0OiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCwgc3RlcHM6IG51bWJlciwgY29hcnNlOiBib29sZWFuKTogbnVtYmVyIHwgbnVsbCB7XG4gIGlmICghaW5wdXQpIHJldHVybiBudWxsO1xuICBjb25zdCBzdGVwID0gTWF0aC5hYnMocGFyc2VGbG9hdChpbnB1dC5zdGVwKSkgfHwgMTtcbiAgY29uc3QgbXVsdGlwbGllciA9IGNvYXJzZSA/IDQgOiAxO1xuICBjb25zdCBtaW4gPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VGbG9hdChpbnB1dC5taW4pKSA/IHBhcnNlRmxvYXQoaW5wdXQubWluKSA6IC1JbmZpbml0eTtcbiAgY29uc3QgbWF4ID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWF4KSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1heCkgOiBJbmZpbml0eTtcbiAgY29uc3QgY3VycmVudCA9IHBhcnNlRmxvYXQoaW5wdXQudmFsdWUpIHx8IDA7XG4gIGxldCBuZXh0ID0gY3VycmVudCArIHN0ZXBzICogc3RlcCAqIG11bHRpcGxpZXI7XG4gIGlmIChOdW1iZXIuaXNGaW5pdGUobWluKSkgbmV4dCA9IE1hdGgubWF4KG1pbiwgbmV4dCk7XG4gIGlmIChOdW1iZXIuaXNGaW5pdGUobWF4KSkgbmV4dCA9IE1hdGgubWluKG1heCwgbmV4dCk7XG4gIGlmIChNYXRoLmFicyhuZXh0IC0gY3VycmVudCkgPCAxZS00KSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaW5wdXQudmFsdWUgPSBTdHJpbmcobmV4dCk7XG4gIGlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIiwgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgcmV0dXJuIG5leHQ7XG59XG5cbmZ1bmN0aW9uIG9uV2luZG93S2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICBjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgY29uc3QgaXNFZGl0YWJsZSA9ICEhdGFyZ2V0ICYmICh0YXJnZXQudGFnTmFtZSA9PT0gXCJJTlBVVFwiIHx8IHRhcmdldC50YWdOYW1lID09PSBcIlRFWFRBUkVBXCIgfHwgdGFyZ2V0LmlzQ29udGVudEVkaXRhYmxlKTtcblxuICBpZiAodWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSAmJiBldmVudC5rZXkgIT09IFwiRXNjYXBlXCIpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChpc0VkaXRhYmxlKSB7XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFc2NhcGVcIikge1xuICAgICAgdGFyZ2V0LmJsdXIoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIHN3aXRjaCAoZXZlbnQuY29kZSkge1xuICAgIGNhc2UgXCJEaWdpdDFcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJEaWdpdDJcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlUXCI6XG4gICAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2V0XCIpIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2VsZWN0XCIpO1xuICAgICAgfSBlbHNlIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZWxlY3RcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZXRcIik7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlDXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkJyYWNrZXRMZWZ0XCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUoc2hpcFNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiQnJhY2tldFJpZ2h0XCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUoc2hpcFNwZWVkU2xpZGVyLCAxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJUYWJcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBjeWNsZVNoaXBTZWxlY3Rpb24oZXZlbnQuc2hpZnRLZXkgPyAtMSA6IDEpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5TlwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIG1pc3NpbGVBZGRSb3V0ZUJ0bj8uY2xpY2soKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleUxcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleUVcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZXRcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZWxlY3RcIik7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNlbGVjdFwiKSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNldFwiKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkNvbW1hXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJQZXJpb2RcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlQWdyb1NsaWRlciwgMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiU2VtaWNvbG9uXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiUXVvdGVcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRlbGV0ZVwiOlxuICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgbWlzc2lsZVNlbGVjdGlvbikge1xuICAgICAgICBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgfSBlbHNlIGlmIChzZWxlY3Rpb24pIHtcbiAgICAgICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkVzY2FwZVwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuaGVscFZpc2libGUpIHtcbiAgICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgICAgfSBlbHNlIGlmIChtaXNzaWxlU2VsZWN0aW9uKSB7XG4gICAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHNlbGVjdGlvbikge1xuICAgICAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBkZWZhdWx0OlxuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgIHNldEhlbHBWaXNpYmxlKCF1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdvcmxkVG9DYW52YXMocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcbiAgY29uc3Qgc3ggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHN5ID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgcmV0dXJuIHsgeDogcC54ICogc3gsIHk6IHAueSAqIHN5IH07XG59XG5cbmZ1bmN0aW9uIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcbiAgY29uc3Qgc3ggPSB3b3JsZC53IC8gY3Yud2lkdGg7XG4gIGNvbnN0IHN5ID0gd29ybGQuaCAvIGN2LmhlaWdodDtcbiAgcmV0dXJuIHsgeDogcC54ICogc3gsIHk6IHAueSAqIHN5IH07XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVSb3V0ZVBvaW50cygpIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHdwcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBjb25zdCB3b3JsZFBvaW50cyA9IFt7IHg6IHN0YXRlUmVmLm1lLngsIHk6IHN0YXRlUmVmLm1lLnkgfV07XG4gIGZvciAoY29uc3Qgd3Agb2Ygd3BzKSB7XG4gICAgd29ybGRQb2ludHMucHVzaCh7IHg6IHdwLngsIHk6IHdwLnkgfSk7XG4gIH1cbiAgY29uc3QgY2FudmFzUG9pbnRzID0gd29ybGRQb2ludHMubWFwKChwb2ludCkgPT4gd29ybGRUb0NhbnZhcyhwb2ludCkpO1xuICByZXR1cm4geyB3YXlwb2ludHM6IHdwcywgd29ybGRQb2ludHMsIGNhbnZhc1BvaW50cyB9O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCkge1xuICBpZiAoIXN0YXRlUmVmLm1lKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3Qgd3BzID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzIDogW107XG4gIGNvbnN0IHdvcmxkUG9pbnRzID0gW3sgeDogc3RhdGVSZWYubWUueCwgeTogc3RhdGVSZWYubWUueSB9XTtcbiAgZm9yIChjb25zdCB3cCBvZiB3cHMpIHtcbiAgICB3b3JsZFBvaW50cy5wdXNoKHsgeDogd3AueCwgeTogd3AueSB9KTtcbiAgfVxuICBjb25zdCBjYW52YXNQb2ludHMgPSB3b3JsZFBvaW50cy5tYXAoKHBvaW50KSA9PiB3b3JsZFRvQ2FudmFzKHBvaW50KSk7XG4gIHJldHVybiB7IHdheXBvaW50czogd3BzLCB3b3JsZFBvaW50cywgY2FudmFzUG9pbnRzIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUxlZ0Rhc2hPZmZzZXRzKGR0U2Vjb25kczogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlIHx8ICFzdGF0ZVJlZi5tZSkge1xuICAgIGxlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIGxlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHsgd2F5cG9pbnRzLCB3b3JsZFBvaW50cywgY2FudmFzUG9pbnRzIH0gPSByb3V0ZTtcbiAgY29uc3QgY3ljbGUgPSA2NDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB3cCA9IHdheXBvaW50c1tpXTtcbiAgICBjb25zdCBzcGVlZCA9IHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiA/IHdwLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuICAgIGNvbnN0IGFXb3JsZCA9IHdvcmxkUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJXb3JsZCA9IHdvcmxkUG9pbnRzW2kgKyAxXTtcbiAgICBjb25zdCB3b3JsZERpc3QgPSBNYXRoLmh5cG90KGJXb3JsZC54IC0gYVdvcmxkLngsIGJXb3JsZC55IC0gYVdvcmxkLnkpO1xuICAgIGNvbnN0IGFDYW52YXMgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3QgYkNhbnZhcyA9IGNhbnZhc1BvaW50c1tpICsgMV07XG4gICAgY29uc3QgY2FudmFzRGlzdCA9IE1hdGguaHlwb3QoYkNhbnZhcy54IC0gYUNhbnZhcy54LCBiQ2FudmFzLnkgLSBhQ2FudmFzLnkpO1xuXG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoc3BlZWQpIHx8IHNwZWVkIDw9IDFlLTMgfHwgIU51bWJlci5pc0Zpbml0ZSh3b3JsZERpc3QpIHx8IHdvcmxkRGlzdCA8PSAxZS0zIHx8IGNhbnZhc0Rpc3QgPD0gMWUtMykge1xuICAgICAgbGVnRGFzaE9mZnNldHMuc2V0KGksIDApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPD0gMCkge1xuICAgICAgaWYgKCFsZWdEYXNoT2Zmc2V0cy5oYXMoaSkpIHtcbiAgICAgICAgbGVnRGFzaE9mZnNldHMuc2V0KGksIDApO1xuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBjYW52YXNEaXN0IC8gd29ybGREaXN0O1xuICAgIGNvbnN0IGRhc2hTcGVlZCA9IHNwZWVkICogc2NhbGU7XG4gICAgbGV0IG5leHQgPSAobGVnRGFzaE9mZnNldHMuZ2V0KGkpID8/IDApIC0gZGFzaFNwZWVkICogZHRTZWNvbmRzO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG5leHQpKSB7XG4gICAgICBuZXh0ID0gMDtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCA9ICgobmV4dCAlIGN5Y2xlKSArIGN5Y2xlKSAlIGN5Y2xlO1xuICAgIH1cbiAgICBsZWdEYXNoT2Zmc2V0cy5zZXQoaSwgbmV4dCk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgb2YgQXJyYXkuZnJvbShsZWdEYXNoT2Zmc2V0cy5rZXlzKCkpKSB7XG4gICAgaWYgKGtleSA+PSB3YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBsZWdEYXNoT2Zmc2V0cy5kZWxldGUoa2V5KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gcG9pbnRTZWdtZW50RGlzdGFuY2UocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBhOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIGI6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IG51bWJlciB7XG4gIGNvbnN0IGFieCA9IGIueCAtIGEueDtcbiAgY29uc3QgYWJ5ID0gYi55IC0gYS55O1xuICBjb25zdCBhcHggPSBwLnggLSBhLng7XG4gIGNvbnN0IGFweSA9IHAueSAtIGEueTtcbiAgY29uc3QgYWJMZW5TcSA9IGFieCAqIGFieCArIGFieSAqIGFieTtcbiAgY29uc3QgdCA9IGFiTGVuU3EgPT09IDAgPyAwIDogY2xhbXAoYXB4ICogYWJ4ICsgYXB5ICogYWJ5LCAwLCBhYkxlblNxKSAvIGFiTGVuU3E7XG4gIGNvbnN0IHByb2p4ID0gYS54ICsgYWJ4ICogdDtcbiAgY29uc3QgcHJvankgPSBhLnkgKyBhYnkgKiB0O1xuICBjb25zdCBkeCA9IHAueCAtIHByb2p4O1xuICBjb25zdCBkeSA9IHAueSAtIHByb2p5O1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG5mdW5jdGlvbiBoaXRUZXN0Um91dGUoY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IFNlbGVjdGlvbiB8IG51bGwge1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCB7IGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IHdheXBvaW50SGl0UmFkaXVzID0gMTI7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3BDYW52YXMgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdwQ2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd3BDYW52YXMueTtcbiAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpIDw9IHdheXBvaW50SGl0UmFkaXVzKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG4gIGlmICghdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgbGVnSGl0RGlzdGFuY2UgPSAxMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBkaXN0ID0gcG9pbnRTZWdtZW50RGlzdGFuY2UoY2FudmFzUG9pbnQsIGNhbnZhc1BvaW50c1tpXSwgY2FudmFzUG9pbnRzW2kgKyAxXSk7XG4gICAgaWYgKGRpc3QgPD0gbGVnSGl0RGlzdGFuY2UpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6IFwibGVnXCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBoaXRUZXN0TWlzc2lsZVJvdXRlKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBNaXNzaWxlU2VsZWN0aW9uIHwgbnVsbCB7XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCB7IGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IHdheXBvaW50SGl0UmFkaXVzID0gMTY7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgY2FudmFzUG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3BDYW52YXMgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3QgZHggPSBjYW52YXNQb2ludC54IC0gd3BDYW52YXMueDtcbiAgICBjb25zdCBkeSA9IGNhbnZhc1BvaW50LnkgLSB3cENhbnZhcy55O1xuICAgIGlmIChNYXRoLmh5cG90KGR4LCBkeSkgPD0gd2F5cG9pbnRIaXRSYWRpdXMpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6IFwid2F5cG9pbnRcIiwgaW5kZXg6IGkgLSAxIH07XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBkcmF3U2hpcCh4OiBudW1iZXIsIHk6IG51bWJlciwgdng6IG51bWJlciwgdnk6IG51bWJlciwgY29sb3I6IHN0cmluZywgZmlsbGVkOiBib29sZWFuKTogdm9pZCB7XG4gIGlmICghY3R4KSByZXR1cm47XG4gIGNvbnN0IHAgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeSB9KTtcbiAgY29uc3QgciA9IDEwO1xuICBjdHguc2F2ZSgpO1xuICBjdHgudHJhbnNsYXRlKHAueCwgcC55KTtcbiAgY29uc3QgYW5nbGUgPSBNYXRoLmF0YW4yKHZ5LCB2eCk7XG4gIGN0eC5yb3RhdGUoYW5nbGUpO1xuICBjdHguYmVnaW5QYXRoKCk7XG4gIGN0eC5tb3ZlVG8ociwgMCk7XG4gIGN0eC5saW5lVG8oLXIgKiAwLjcsIHIgKiAwLjYpO1xuICBjdHgubGluZVRvKC1yICogMC40LCAwKTtcbiAgY3R4LmxpbmVUbygtciAqIDAuNywgLXIgKiAwLjYpO1xuICBjdHguY2xvc2VQYXRoKCk7XG4gIGN0eC5saW5lV2lkdGggPSAyO1xuICBjdHguc3Ryb2tlU3R5bGUgPSBjb2xvcjtcbiAgaWYgKGZpbGxlZCkge1xuICAgIGN0eC5maWxsU3R5bGUgPSBgJHtjb2xvcn1jY2A7XG4gICAgY3R4LmZpbGwoKTtcbiAgfVxuICBjdHguc3Ryb2tlKCk7XG4gIGN0eC5yZXN0b3JlKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdHaG9zdERvdCh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIWN0eCkgcmV0dXJuO1xuICBjb25zdCBwID0gd29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4LmFyYyhwLngsIHAueSwgMywgMCwgTWF0aC5QSSAqIDIpO1xuICBjdHguZmlsbFN0eWxlID0gXCIjY2NjY2NjYWFcIjtcbiAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gZHJhd1JvdXRlKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWUpIHJldHVybjtcbiAgY29uc3Qgcm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSByZXR1cm47XG4gIGNvbnN0IHsgY2FudmFzUG9pbnRzIH0gPSByb3V0ZTtcbiAgY29uc3QgbGVnQ291bnQgPSBjYW52YXNQb2ludHMubGVuZ3RoIC0gMTtcblxuICBpZiAodWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlICYmIGxlZ0NvdW50ID4gMCkge1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnNldExpbmVEYXNoKFs4LCA4XSk7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMzOGJkZjg2NlwiO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVnQ291bnQ7IGkrKykge1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbaV0ueCwgY2FudmFzUG9pbnRzW2ldLnkpO1xuICAgICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbaSArIDFdLngsIGNhbnZhc1BvaW50c1tpICsgMV0ueSk7XG4gICAgICBjdHgubGluZURhc2hPZmZzZXQgPSBsZWdEYXNoT2Zmc2V0cy5nZXQoaSkgPz8gMDtcbiAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGlmICh1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUgJiYgbGVnQ291bnQgPiAwKSB7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguc2V0TGluZURhc2goWzYsIDZdKTtcbiAgICBjdHgubGluZVdpZHRoID0gMztcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMzOGJkZjhcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbMF0ueCwgY2FudmFzUG9pbnRzWzBdLnkpO1xuICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzWzFdLngsIGNhbnZhc1BvaW50c1sxXS55KTtcbiAgICBjdHgubGluZURhc2hPZmZzZXQgPSBsZWdEYXNoT2Zmc2V0cy5nZXQoMCkgPz8gMDtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGlmICh1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUgJiYgc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5pbmRleCA8IGxlZ0NvdW50KSB7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguc2V0TGluZURhc2goWzQsIDRdKTtcbiAgICBjdHgubGluZVdpZHRoID0gMy41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiI2Y5NzMxNlwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXhdLngsIGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXhdLnkpO1xuICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzW3NlbGVjdGlvbi5pbmRleCArIDFdLngsIGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXggKyAxXS55KTtcbiAgICBjdHgubGluZURhc2hPZmZzZXQgPSBsZWdEYXNoT2Zmc2V0cy5nZXQoc2VsZWN0aW9uLmluZGV4KSA/PyAwO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwdCA9IGNhbnZhc1BvaW50c1tpICsgMV07XG4gICAgY29uc3QgaXNTZWxlY3RlZCA9IHNlbGVjdGlvbiAmJiBzZWxlY3Rpb24uaW5kZXggPT09IGk7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmFyYyhwdC54LCBwdC55LCBpc1NlbGVjdGVkID8gNyA6IDUsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gaXNTZWxlY3RlZCA/IFwiI2Y5NzMxNlwiIDogXCIjMzhiZGY4XCI7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gaXNTZWxlY3RlZCA/IDAuOTUgOiAwLjg7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiIzBmMTcyYVwiO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRyYXdNaXNzaWxlUm91dGUoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBpZiAodWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgIT09IFwibWlzc2lsZVwiKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgY29uc3QgeyBjYW52YXNQb2ludHMgfSA9IHJvdXRlO1xuICBjdHguc2F2ZSgpO1xuICBjdHguc2V0TGluZURhc2goWzEwLCA2XSk7XG4gIGN0eC5saW5lV2lkdGggPSAyLjU7XG4gIGN0eC5zdHJva2VTdHlsZSA9IFwiI2Y4NzE3MWFhXCI7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbMF0ueCwgY2FudmFzUG9pbnRzWzBdLnkpO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGNhbnZhc1BvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzW2ldLngsIGNhbnZhc1BvaW50c1tpXS55KTtcbiAgfVxuICBjdHguc3Ryb2tlKCk7XG4gIGN0eC5yZXN0b3JlKCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBjYW52YXNQb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwdCA9IGNhbnZhc1BvaW50c1tpXTtcbiAgICBjb25zdCB3YXlwb2ludEluZGV4ID0gaSAtIDE7XG4gICAgY29uc3QgaXNTZWxlY3RlZCA9IG1pc3NpbGVTZWxlY3Rpb24gJiYgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA9PT0gd2F5cG9pbnRJbmRleDtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHguYXJjKHB0LngsIHB0LnksIGlzU2VsZWN0ZWQgPyA3IDogNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgIGN0eC5maWxsU3R5bGUgPSBpc1NlbGVjdGVkID8gXCIjZmFjYzE1XCIgOiBcIiNmODcxNzFcIjtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSBpc1NlbGVjdGVkID8gMC45NSA6IDAuOTtcbiAgICBjdHguZmlsbCgpO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBpc1NlbGVjdGVkID8gXCIjODU0ZDBlXCIgOiBcIiM3ZjFkMWRcIjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkcmF3TWlzc2lsZXMoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFzdGF0ZVJlZi5taXNzaWxlcyB8fCBzdGF0ZVJlZi5taXNzaWxlcy5sZW5ndGggPT09IDAgfHwgIWN2KSByZXR1cm47XG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3QgcmFkaXVzU2NhbGUgPSAoc2NhbGVYICsgc2NhbGVZKSAvIDI7XG4gIGZvciAoY29uc3QgbWlzcyBvZiBzdGF0ZVJlZi5taXNzaWxlcykge1xuICAgIGNvbnN0IHAgPSB3b3JsZFRvQ2FudmFzKHsgeDogbWlzcy54LCB5OiBtaXNzLnkgfSk7XG4gICAgY29uc3Qgc2VsZk93bmVkID0gQm9vbGVhbihtaXNzLnNlbGYpO1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMocC54LCBwLnksIHNlbGZPd25lZCA/IDYgOiA1LCAwLCBNYXRoLlBJICogMik7XG4gICAgY3R4LmZpbGxTdHlsZSA9IHNlbGZPd25lZCA/IFwiI2Y4NzE3MVwiIDogXCIjZmNhNWE1XCI7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gc2VsZk93bmVkID8gMC45NSA6IDAuODtcbiAgICBjdHguZmlsbCgpO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMxMTE4MjdcIjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcblxuICAgIGlmIChzZWxmT3duZWQgJiYgbWlzcy5hZ3JvX3JhZGl1cyA+IDApIHtcbiAgICAgIGN0eC5zYXZlKCk7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjb25zdCByQ2FudmFzID0gbWlzcy5hZ3JvX3JhZGl1cyAqIHJhZGl1c1NjYWxlO1xuICAgICAgY3R4LnNldExpbmVEYXNoKFsxNCwgMTBdKTtcbiAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSgyNDgsMTEzLDExMywwLjM1KVwiO1xuICAgICAgY3R4LmxpbmVXaWR0aCA9IDEuMjtcbiAgICAgIGN0eC5hcmMocC54LCBwLnksIHJDYW52YXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgIGN0eC5yZXN0b3JlKCk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGRyYXdHcmlkKCk6IHZvaWQge1xuICBpZiAoIWN0eCkgcmV0dXJuO1xuICBjdHguc2F2ZSgpO1xuICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMyMzRcIjtcbiAgY3R4LmxpbmVXaWR0aCA9IDE7XG4gIGNvbnN0IHN0ZXAgPSAxMDAwO1xuICBmb3IgKGxldCB4ID0gMDsgeCA8PSB3b3JsZC53OyB4ICs9IHN0ZXApIHtcbiAgICBjb25zdCBhID0gd29ybGRUb0NhbnZhcyh7IHgsIHk6IDAgfSk7XG4gICAgY29uc3QgYiA9IHdvcmxkVG9DYW52YXMoeyB4LCB5OiB3b3JsZC5oIH0pO1xuICAgIGN0eC5iZWdpblBhdGgoKTsgY3R4Lm1vdmVUbyhhLngsIGEueSk7IGN0eC5saW5lVG8oYi54LCBiLnkpOyBjdHguc3Ryb2tlKCk7XG4gIH1cbiAgZm9yIChsZXQgeSA9IDA7IHkgPD0gd29ybGQuaDsgeSArPSBzdGVwKSB7XG4gICAgY29uc3QgYSA9IHdvcmxkVG9DYW52YXMoeyB4OiAwLCB5IH0pO1xuICAgIGNvbnN0IGIgPSB3b3JsZFRvQ2FudmFzKHsgeDogd29ybGQudywgeSB9KTtcbiAgICBjdHguYmVnaW5QYXRoKCk7IGN0eC5tb3ZlVG8oYS54LCBhLnkpOyBjdHgubGluZVRvKGIueCwgYi55KTsgY3R4LnN0cm9rZSgpO1xuICB9XG4gIGN0eC5yZXN0b3JlKCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpOiB2b2lkIHtcbiAgaWYgKCFtaXNzaWxlTGF1bmNoQnRuIHx8ICFtaXNzaWxlTGF1bmNoVGV4dCB8fCAhbWlzc2lsZUxhdW5jaEluZm8pIHJldHVybjtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgY291bnQgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgY29uc3QgcmVtYWluaW5nID0gZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk7XG4gIGNvbnN0IGNvb2xpbmdEb3duID0gcmVtYWluaW5nID4gMC4wNTtcbiAgY29uc3Qgc2hvdWxkRGlzYWJsZSA9ICFyb3V0ZSB8fCBjb3VudCA9PT0gMCB8fCBjb29saW5nRG93bjtcbiAgbWlzc2lsZUxhdW5jaEJ0bi5kaXNhYmxlZCA9IHNob3VsZERpc2FibGU7XG5cbiAgY29uc3QgbGF1bmNoVGV4dEhUTUwgPSAnPHNwYW4gY2xhc3M9XCJidG4tdGV4dC1mdWxsXCI+TGF1bmNoPC9zcGFuPjxzcGFuIGNsYXNzPVwiYnRuLXRleHQtc2hvcnRcIj5GaXJlPC9zcGFuPic7XG4gIGxldCBsYXVuY2hJbmZvSFRNTCA9IFwiXCI7XG5cbiAgaWYgKCFyb3V0ZSkge1xuICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgfSBlbHNlIGlmIChjb29saW5nRG93bikge1xuICAgIGxhdW5jaEluZm9IVE1MID0gYCR7cmVtYWluaW5nLnRvRml4ZWQoMSl9c2A7XG4gIH0gZWxzZSBpZiAocm91dGUubmFtZSkge1xuICAgIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gICAgY29uc3Qgcm91dGVJbmRleCA9IHJvdXRlcy5maW5kSW5kZXgoKHIpID0+IHIuaWQgPT09IHJvdXRlLmlkKSArIDE7XG4gICAgbGF1bmNoSW5mb0hUTUwgPSBgPHNwYW4gY2xhc3M9XCJidG4tdGV4dC1mdWxsXCI+JHtyb3V0ZS5uYW1lfTwvc3Bhbj48c3BhbiBjbGFzcz1cImJ0bi10ZXh0LXNob3J0XCI+JHtyb3V0ZUluZGV4fTwvc3Bhbj5gO1xuICB9IGVsc2Uge1xuICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgfVxuXG4gIGlmIChsYXN0TWlzc2lsZUxhdW5jaFRleHRIVE1MICE9PSBsYXVuY2hUZXh0SFRNTCkge1xuICAgIG1pc3NpbGVMYXVuY2hUZXh0LmlubmVySFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICAgIGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgPSBsYXVuY2hUZXh0SFRNTDtcbiAgfVxuXG4gIGlmIChsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MICE9PSBsYXVuY2hJbmZvSFRNTCkge1xuICAgIG1pc3NpbGVMYXVuY2hJbmZvLmlubmVySFRNTCA9IGxhdW5jaEluZm9IVE1MO1xuICAgIGxhc3RNaXNzaWxlTGF1bmNoSW5mb0hUTUwgPSBsYXVuY2hJbmZvSFRNTDtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTogbnVtYmVyIHtcbiAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlUmVmKTtcbiAgcmV0dXJuIHJlbWFpbmluZyA+IDAgPyByZW1haW5pbmcgOiAwO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk6IHZvaWQge1xuICBjb25zdCBtZXRhID0gc3RhdGVSZWYud29ybGRNZXRhID8/IHt9O1xuICBjb25zdCBoYXNXaWR0aCA9IHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudyk7XG4gIGNvbnN0IGhhc0hlaWdodCA9IHR5cGVvZiBtZXRhLmggPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuaCk7XG5cbiAgaWYgKGhhc1dpZHRoKSB7XG4gICAgd29ybGQudyA9IG1ldGEudyE7XG4gIH1cbiAgaWYgKGhhc0hlaWdodCkge1xuICAgIHdvcmxkLmggPSBtZXRhLmghO1xuICB9XG4gIGlmIChIUHNwYW4pIHtcbiAgICBpZiAoc3RhdGVSZWYubWUgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXRlUmVmLm1lLmhwKSkge1xuICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlUmVmLm1lLmhwKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBIUHNwYW4udGV4dENvbnRlbnQgPSBcIlx1MjAxM1wiO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBsb29wKHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFjdikgcmV0dXJuO1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZSh0aW1lc3RhbXApKSB7XG4gICAgdGltZXN0YW1wID0gbGFzdExvb3BUcyA/PyAwO1xuICB9XG4gIGxldCBkdFNlY29uZHMgPSAwO1xuICBpZiAobGFzdExvb3BUcyAhPT0gbnVsbCkge1xuICAgIGR0U2Vjb25kcyA9ICh0aW1lc3RhbXAgLSBsYXN0TG9vcFRzKSAvIDEwMDA7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPCAwKSB7XG4gICAgICBkdFNlY29uZHMgPSAwO1xuICAgIH1cbiAgfVxuICBsYXN0TG9vcFRzID0gdGltZXN0YW1wO1xuICB1cGRhdGVMZWdEYXNoT2Zmc2V0cyhkdFNlY29uZHMpO1xuXG4gIGN0eC5jbGVhclJlY3QoMCwgMCwgY3Yud2lkdGgsIGN2LmhlaWdodCk7XG4gIGRyYXdHcmlkKCk7XG4gIGRyYXdSb3V0ZSgpO1xuICBkcmF3TWlzc2lsZVJvdXRlKCk7XG4gIGRyYXdNaXNzaWxlcygpO1xuXG4gIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuXG4gIGZvciAoY29uc3QgZyBvZiBzdGF0ZVJlZi5naG9zdHMpIHtcbiAgICBkcmF3U2hpcChnLngsIGcueSwgZy52eCwgZy52eSwgXCIjOWNhM2FmXCIsIGZhbHNlKTtcbiAgICBkcmF3R2hvc3REb3QoZy54LCBnLnkpO1xuICB9XG4gIGlmIChzdGF0ZVJlZi5tZSkge1xuICAgIGRyYXdTaGlwKHN0YXRlUmVmLm1lLngsIHN0YXRlUmVmLm1lLnksIHN0YXRlUmVmLm1lLnZ4LCBzdGF0ZVJlZi5tZS52eSwgXCIjMjJkM2VlXCIsIHRydWUpO1xuICB9XG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcbn1cbiIsICJpbXBvcnQgeyBjbGFtcCB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuXG5pbnRlcmZhY2UgSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMge1xuICB0YXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGJvZHk6IHN0cmluZztcbiAgc3RlcEluZGV4OiBudW1iZXI7XG4gIHN0ZXBDb3VudDogbnVtYmVyO1xuICBzaG93TmV4dDogYm9vbGVhbjtcbiAgbmV4dExhYmVsPzogc3RyaW5nO1xuICBvbk5leHQ/OiAoKSA9PiB2b2lkO1xuICBzaG93U2tpcDogYm9vbGVhbjtcbiAgc2tpcExhYmVsPzogc3RyaW5nO1xuICBvblNraXA/OiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhpZ2hsaWdodGVyIHtcbiAgc2hvdyhvcHRpb25zOiBIaWdobGlnaHRDb250ZW50T3B0aW9ucyk6IHZvaWQ7XG4gIGhpZGUoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5jb25zdCBTVFlMRV9JRCA9IFwidHV0b3JpYWwtb3ZlcmxheS1zdHlsZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSGlnaGxpZ2h0ZXIoKTogSGlnaGxpZ2h0ZXIge1xuICBlbnN1cmVTdHlsZXMoKTtcblxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgb3ZlcmxheS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlcIjtcbiAgb3ZlcmxheS5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxpdmVcIiwgXCJwb2xpdGVcIik7XG5cbiAgY29uc3Qgc2NyaW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzY3JpbS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3NjcmltXCI7XG5cbiAgY29uc3QgaGlnaGxpZ2h0Qm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGlnaGxpZ2h0Qm94LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9faGlnaGxpZ2h0XCI7XG5cbiAgY29uc3QgdG9vbHRpcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRvb2x0aXAuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X190b29sdGlwXCI7XG5cbiAgY29uc3QgcHJvZ3Jlc3MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBwcm9ncmVzcy5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzXCI7XG5cbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaDNcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fdGl0bGVcIjtcblxuICBjb25zdCBib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XG4gIGJvZHkuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19ib2R5XCI7XG5cbiAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zXCI7XG5cbiAgY29uc3Qgc2tpcEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIHNraXBCdG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIHNraXBCdG4uY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19idG4gdHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdFwiO1xuICBza2lwQnRuLnRleHRDb250ZW50ID0gXCJTa2lwXCI7XG5cbiAgY29uc3QgbmV4dEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIG5leHRCdG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIG5leHRCdG4uY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19idG4gdHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5XCI7XG4gIG5leHRCdG4udGV4dENvbnRlbnQgPSBcIk5leHRcIjtcblxuICBhY3Rpb25zLmFwcGVuZChza2lwQnRuLCBuZXh0QnRuKTtcbiAgdG9vbHRpcC5hcHBlbmQocHJvZ3Jlc3MsIHRpdGxlLCBib2R5LCBhY3Rpb25zKTtcbiAgb3ZlcmxheS5hcHBlbmQoc2NyaW0sIGhpZ2hsaWdodEJveCwgdG9vbHRpcCk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgbGV0IGN1cnJlbnRUYXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCB2aXNpYmxlID0gZmFsc2U7XG4gIGxldCByZXNpemVPYnNlcnZlcjogUmVzaXplT2JzZXJ2ZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IGZyYW1lSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IG9uTmV4dDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCBvblNraXA6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIHNjaGVkdWxlVXBkYXRlKCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSkgcmV0dXJuO1xuICAgIGlmIChmcmFtZUhhbmRsZSAhPT0gbnVsbCkgcmV0dXJuO1xuICAgIGZyYW1lSGFuZGxlID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICBmcmFtZUhhbmRsZSA9IG51bGw7XG4gICAgICB1cGRhdGVQb3NpdGlvbigpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlUG9zaXRpb24oKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG5cbiAgICBpZiAoY3VycmVudFRhcmdldCkge1xuICAgICAgY29uc3QgcmVjdCA9IGN1cnJlbnRUYXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBjb25zdCBwYWRkaW5nID0gMTI7XG4gICAgICBjb25zdCB3aWR0aCA9IE1hdGgubWF4KDAsIHJlY3Qud2lkdGggKyBwYWRkaW5nICogMik7XG4gICAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1heCgwLCByZWN0LmhlaWdodCArIHBhZGRpbmcgKiAyKTtcbiAgICAgIGNvbnN0IGxlZnQgPSByZWN0LmxlZnQgLSBwYWRkaW5nO1xuICAgICAgY29uc3QgdG9wID0gcmVjdC50b3AgLSBwYWRkaW5nO1xuXG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKGxlZnQpfXB4LCAke01hdGgucm91bmQodG9wKX1weClgO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLndpZHRoID0gYCR7TWF0aC5yb3VuZCh3aWR0aCl9cHhgO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLmhlaWdodCA9IGAke01hdGgucm91bmQoaGVpZ2h0KX1weGA7XG5cbiAgICAgIHRvb2x0aXAuc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJ2aXNpYmxlXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLm1heFdpZHRoID0gYG1pbigzNDBweCwgJHtNYXRoLm1heCgyNjAsIHdpbmRvdy5pbm5lcldpZHRoIC0gMzIpfXB4KWA7XG4gICAgICBjb25zdCB0b29sdGlwV2lkdGggPSB0b29sdGlwLm9mZnNldFdpZHRoO1xuICAgICAgY29uc3QgdG9vbHRpcEhlaWdodCA9IHRvb2x0aXAub2Zmc2V0SGVpZ2h0O1xuICAgICAgbGV0IHRvb2x0aXBUb3AgPSByZWN0LmJvdHRvbSArIDE4O1xuICAgICAgaWYgKHRvb2x0aXBUb3AgKyB0b29sdGlwSGVpZ2h0ID4gd2luZG93LmlubmVySGVpZ2h0IC0gMjApIHtcbiAgICAgICAgdG9vbHRpcFRvcCA9IE1hdGgubWF4KDIwLCByZWN0LnRvcCAtIHRvb2x0aXBIZWlnaHQgLSAxOCk7XG4gICAgICB9XG4gICAgICBsZXQgdG9vbHRpcExlZnQgPSByZWN0LmxlZnQgKyByZWN0LndpZHRoIC8gMiAtIHRvb2x0aXBXaWR0aCAvIDI7XG4gICAgICB0b29sdGlwTGVmdCA9IGNsYW1wKHRvb2x0aXBMZWZ0LCAyMCwgd2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGggLSAyMCk7XG4gICAgICB0b29sdGlwLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHRvb2x0aXBMZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvb2x0aXBUb3ApfXB4KWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUud2lkdGggPSBcIjBweFwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLmhlaWdodCA9IFwiMHB4XCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQod2luZG93LmlubmVyV2lkdGggLyAyKX1weCwgJHtNYXRoLnJvdW5kKHdpbmRvdy5pbm5lckhlaWdodCAvIDIpfXB4KWA7XG5cbiAgICAgIHRvb2x0aXAuc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJ2aXNpYmxlXCI7XG4gICAgICBjb25zdCB0b29sdGlwV2lkdGggPSB0b29sdGlwLm9mZnNldFdpZHRoO1xuICAgICAgY29uc3QgdG9vbHRpcEhlaWdodCA9IHRvb2x0aXAub2Zmc2V0SGVpZ2h0O1xuICAgICAgY29uc3QgdG9vbHRpcExlZnQgPSBjbGFtcCgod2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGgpIC8gMiwgMjAsIHdpbmRvdy5pbm5lcldpZHRoIC0gdG9vbHRpcFdpZHRoIC0gMjApO1xuICAgICAgY29uc3QgdG9vbHRpcFRvcCA9IGNsYW1wKCh3aW5kb3cuaW5uZXJIZWlnaHQgLSB0b29sdGlwSGVpZ2h0KSAvIDIsIDIwLCB3aW5kb3cuaW5uZXJIZWlnaHQgLSB0b29sdGlwSGVpZ2h0IC0gMjApO1xuICAgICAgdG9vbHRpcC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh0b29sdGlwTGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b29sdGlwVG9wKX1weClgO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaExpc3RlbmVycygpOiB2b2lkIHtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBzY2hlZHVsZVVwZGF0ZSwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIHNjaGVkdWxlVXBkYXRlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBkZXRhY2hMaXN0ZW5lcnMoKTogdm9pZCB7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgc2NoZWR1bGVVcGRhdGUpO1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIHNjaGVkdWxlVXBkYXRlKTtcbiAgICBpZiAoZnJhbWVIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZShmcmFtZUhhbmRsZSk7XG4gICAgICBmcmFtZUhhbmRsZSA9IG51bGw7XG4gICAgfVxuICAgIGlmIChyZXNpemVPYnNlcnZlcikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHNraXBCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgb25Ta2lwPy4oKTtcbiAgfSk7XG5cbiAgbmV4dEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBvbk5leHQ/LigpO1xuICB9KTtcblxuICBmdW5jdGlvbiByZW5kZXJUb29sdGlwKG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZCB7XG4gICAgY29uc3QgeyBzdGVwQ291bnQsIHN0ZXBJbmRleCwgdGl0bGU6IG9wdGlvblRpdGxlLCBib2R5OiBvcHRpb25Cb2R5LCBzaG93TmV4dCwgbmV4dExhYmVsLCBzaG93U2tpcCwgc2tpcExhYmVsIH0gPSBvcHRpb25zO1xuXG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShzdGVwQ291bnQpICYmIHN0ZXBDb3VudCA+IDApIHtcbiAgICAgIHByb2dyZXNzLnRleHRDb250ZW50ID0gYFN0ZXAgJHtzdGVwSW5kZXggKyAxfSBvZiAke3N0ZXBDb3VudH1gO1xuICAgICAgcHJvZ3Jlc3Muc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgcHJvZ3Jlc3MudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgcHJvZ3Jlc3Muc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIGlmIChvcHRpb25UaXRsZSAmJiBvcHRpb25UaXRsZS50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgdGl0bGUudGV4dENvbnRlbnQgPSBvcHRpb25UaXRsZTtcbiAgICAgIHRpdGxlLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRpdGxlLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIHRpdGxlLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBib2R5LnRleHRDb250ZW50ID0gb3B0aW9uQm9keTtcblxuICAgIG9uTmV4dCA9IHNob3dOZXh0ID8gb3B0aW9ucy5vbk5leHQgPz8gbnVsbCA6IG51bGw7XG4gICAgaWYgKHNob3dOZXh0KSB7XG4gICAgICBuZXh0QnRuLnRleHRDb250ZW50ID0gbmV4dExhYmVsID8/IFwiTmV4dFwiO1xuICAgICAgbmV4dEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJpbmxpbmUtZmxleFwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0QnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBvblNraXAgPSBzaG93U2tpcCA/IG9wdGlvbnMub25Ta2lwID8/IG51bGwgOiBudWxsO1xuICAgIGlmIChzaG93U2tpcCkge1xuICAgICAgc2tpcEJ0bi50ZXh0Q29udGVudCA9IHNraXBMYWJlbCA/PyBcIlNraXBcIjtcbiAgICAgIHNraXBCdG4uc3R5bGUuZGlzcGxheSA9IFwiaW5saW5lLWZsZXhcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgc2tpcEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvdyhvcHRpb25zOiBIaWdobGlnaHRDb250ZW50T3B0aW9ucyk6IHZvaWQge1xuICAgIHZpc2libGUgPSB0cnVlO1xuICAgIGN1cnJlbnRUYXJnZXQgPSBvcHRpb25zLnRhcmdldCA/PyBudWxsO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gICAgcmVuZGVyVG9vbHRpcChvcHRpb25zKTtcbiAgICBpZiAocmVzaXplT2JzZXJ2ZXIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKGN1cnJlbnRUYXJnZXQgJiYgdHlwZW9mIFJlc2l6ZU9ic2VydmVyICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcigoKSA9PiBzY2hlZHVsZVVwZGF0ZSgpKTtcbiAgICAgIHJlc2l6ZU9ic2VydmVyLm9ic2VydmUoY3VycmVudFRhcmdldCk7XG4gICAgfVxuICAgIGF0dGFjaExpc3RlbmVycygpO1xuICAgIHNjaGVkdWxlVXBkYXRlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBoaWRlKCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSkgcmV0dXJuO1xuICAgIHZpc2libGUgPSBmYWxzZTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIHRvb2x0aXAuc3R5bGUudmlzaWJpbGl0eSA9IFwiaGlkZGVuXCI7XG4gICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICBkZXRhY2hMaXN0ZW5lcnMoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgaGlkZSgpO1xuICAgIG92ZXJsYXkucmVtb3ZlKCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNob3csXG4gICAgaGlkZSxcbiAgICBkZXN0cm95LFxuICB9O1xufVxuXG5mdW5jdGlvbiBlbnN1cmVTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gIHN0eWxlLmlkID0gU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC50dXRvcmlhbC1vdmVybGF5IHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGluc2V0OiAwO1xuICAgICAgei1pbmRleDogNTA7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5LnZpc2libGUge1xuICAgICAgZGlzcGxheTogYmxvY2s7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19zY3JpbSB7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICBpbnNldDogMDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2hpZ2hsaWdodCB7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNHB4O1xuICAgICAgYm9yZGVyOiAycHggc29saWQgcmdiYSg1NiwgMTg5LCAyNDgsIDAuOTUpO1xuICAgICAgYm94LXNoYWRvdzogMCAwIDAgMnB4IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjI1KSwgMCAwIDI0cHggcmdiYSgzNCwgMjExLCAyMzgsIDAuMjUpO1xuICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMThzIGVhc2UsIHdpZHRoIDAuMThzIGVhc2UsIGhlaWdodCAwLjE4cyBlYXNlLCBvcGFjaXR5IDAuMThzIGVhc2U7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIG9wYWNpdHk6IDA7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X190b29sdGlwIHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIG1pbi13aWR0aDogMjQwcHg7XG4gICAgICBtYXgtd2lkdGg6IG1pbigzNDBweCwgY2FsYygxMDB2dyAtIDMycHgpKTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTUsIDIzLCA0MiwgMC45NSk7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTZweDtcbiAgICAgIHBhZGRpbmc6IDE2cHggMThweDtcbiAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgYm94LXNoYWRvdzogMCAxMnB4IDMycHggcmdiYSgxNSwgMjMsIDQyLCAwLjU1KTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICAgIHZpc2liaWxpdHk6IGhpZGRlbjtcbiAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlKDBweCwgMHB4KTtcbiAgICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE4cyBlYXNlLCBvcGFjaXR5IDAuMThzIGVhc2U7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19wcm9ncmVzcyB7XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wOGVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuNzUpO1xuICAgICAgbWFyZ2luOiAwIDAgOHB4O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fdGl0bGUge1xuICAgICAgbWFyZ2luOiAwIDAgOHB4O1xuICAgICAgZm9udC1zaXplOiAxNXB4O1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDRlbTtcbiAgICAgIGNvbG9yOiAjZjFmNWY5O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYm9keSB7XG4gICAgICBtYXJnaW46IDAgMCAxNHB4O1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuNTtcbiAgICAgIGNvbG9yOiAjY2JkNWY1O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYWN0aW9ucyB7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZ2FwOiAxMHB4O1xuICAgICAganVzdGlmeS1jb250ZW50OiBmbGV4LWVuZDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0biB7XG4gICAgICBmb250OiBpbmhlcml0O1xuICAgICAgcGFkZGluZzogNnB4IDE0cHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA5OTlweDtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnkge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjUpO1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC41NSk7XG4gICAgICBjb2xvcjogI2Y4ZmFmYztcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeTpob3ZlciB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4zNSk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0IHtcbiAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgY29sb3I6IHJnYmEoMjAzLCAyMTMsIDIyNSwgMC45KTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3Q6aG92ZXIge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDIwMywgMjEzLCAyMjUsIDAuNTUpO1xuICAgIH1cbiAgICBAbWVkaWEgKG1heC13aWR0aDogNzY4cHgpIHtcbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X190b29sdGlwIHtcbiAgICAgICAgbWluLXdpZHRoOiAyMDBweDtcbiAgICAgICAgbWF4LXdpZHRoOiBtaW4oMzIwcHgsIGNhbGMoMTAwdncgLSAyNHB4KSk7XG4gICAgICAgIHBhZGRpbmc6IDEwcHggMTJweDtcbiAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgZmxleC1kaXJlY3Rpb246IHJvdztcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgZ2FwOiAxMnB4O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzIHtcbiAgICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3RpdGxlIHtcbiAgICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2JvZHkge1xuICAgICAgICBtYXJnaW46IDA7XG4gICAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgICAgZmxleDogMTtcbiAgICAgICAgbGluZS1oZWlnaHQ6IDEuNDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zIHtcbiAgICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgICAgZ2FwOiA2cHg7XG4gICAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0biB7XG4gICAgICAgIHBhZGRpbmc6IDVweCAxMHB4O1xuICAgICAgICBmb250LXNpemU6IDEwcHg7XG4gICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICB9XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cbiIsICJjb25zdCBTVE9SQUdFX1BSRUZJWCA9IFwibHNkOnR1dG9yaWFsOlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsUHJvZ3Jlc3Mge1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgY29tcGxldGVkOiBib29sZWFuO1xuICB1cGRhdGVkQXQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZ2V0U3RvcmFnZSgpOiBTdG9yYWdlIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIgfHwgIXdpbmRvdy5sb2NhbFN0b3JhZ2UpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkUHJvZ3Jlc3MoaWQ6IHN0cmluZyk6IFR1dG9yaWFsUHJvZ3Jlc3MgfCBudWxsIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSBzdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCk7XG4gICAgaWYgKCFyYXcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBUdXRvcmlhbFByb2dyZXNzO1xuICAgIGlmIChcbiAgICAgIHR5cGVvZiBwYXJzZWQgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkID09PSBudWxsIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnN0ZXBJbmRleCAhPT0gXCJudW1iZXJcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5jb21wbGV0ZWQgIT09IFwiYm9vbGVhblwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnVwZGF0ZWRBdCAhPT0gXCJudW1iZXJcIlxuICAgICkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZWQ7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlUHJvZ3Jlc3MoaWQ6IHN0cmluZywgcHJvZ3Jlc3M6IFR1dG9yaWFsUHJvZ3Jlc3MpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfUFJFRklYICsgaWQsIEpTT04uc3RyaW5naWZ5KHByb2dyZXNzKSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIGlnbm9yZSBzdG9yYWdlIGZhaWx1cmVzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyUHJvZ3Jlc3MoaWQ6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnJlbW92ZUl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIGlnbm9yZSBzdG9yYWdlIGZhaWx1cmVzXG4gIH1cbn1cbiIsICJleHBvcnQgdHlwZSBSb2xlSWQgPVxuICB8IFwiY2FudmFzXCJcbiAgfCBcInNoaXBTZXRcIlxuICB8IFwic2hpcFNlbGVjdFwiXG4gIHwgXCJzaGlwRGVsZXRlXCJcbiAgfCBcInNoaXBDbGVhclwiXG4gIHwgXCJzaGlwU3BlZWRTbGlkZXJcIlxuICB8IFwibWlzc2lsZVNldFwiXG4gIHwgXCJtaXNzaWxlU2VsZWN0XCJcbiAgfCBcIm1pc3NpbGVEZWxldGVcIlxuICB8IFwibWlzc2lsZVNwZWVkU2xpZGVyXCJcbiAgfCBcIm1pc3NpbGVBZ3JvU2xpZGVyXCJcbiAgfCBcIm1pc3NpbGVBZGRSb3V0ZVwiXG4gIHwgXCJtaXNzaWxlTGF1bmNoXCJcbiAgfCBcInJvdXRlUHJldlwiXG4gIHwgXCJyb3V0ZU5leHRcIlxuICB8IFwiaGVscFRvZ2dsZVwiXG4gIHwgXCJ0dXRvcmlhbFN0YXJ0XCJcbiAgfCBcInNwYXduQm90XCI7XG5cbmV4cG9ydCB0eXBlIFJvbGVSZXNvbHZlciA9ICgpID0+IEhUTUxFbGVtZW50IHwgbnVsbDtcblxuZXhwb3J0IHR5cGUgUm9sZXNNYXAgPSBSZWNvcmQ8Um9sZUlkLCBSb2xlUmVzb2x2ZXI+O1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUm9sZXMoKTogUm9sZXNNYXAge1xuICByZXR1cm4ge1xuICAgIGNhbnZhczogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdlwiKSxcbiAgICBzaGlwU2V0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2V0XCIpLFxuICAgIHNoaXBTZWxlY3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZWxlY3RcIiksXG4gICAgc2hpcERlbGV0ZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSxcbiAgICBzaGlwQ2xlYXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1jbGVhclwiKSxcbiAgICBzaGlwU3BlZWRTbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1zbGlkZXJcIiksXG4gICAgbWlzc2lsZVNldDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSxcbiAgICBtaXNzaWxlU2VsZWN0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2VsZWN0XCIpLFxuICAgIG1pc3NpbGVEZWxldGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1kZWxldGVcIiksXG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtc2xpZGVyXCIpLFxuICAgIG1pc3NpbGVBZ3JvU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1zbGlkZXJcIiksXG4gICAgbWlzc2lsZUFkZFJvdXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWRkLXJvdXRlXCIpLFxuICAgIG1pc3NpbGVMYXVuY2g6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2hcIiksXG4gICAgcm91dGVQcmV2OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIiksXG4gICAgcm91dGVOZXh0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW5leHRcIiksXG4gICAgaGVscFRvZ2dsZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSxcbiAgICB0dXRvcmlhbFN0YXJ0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInR1dG9yaWFsLXN0YXJ0XCIpLFxuICAgIHNwYXduQm90OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdFwiKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJvbGVFbGVtZW50KHJvbGVzOiBSb2xlc01hcCwgcm9sZTogUm9sZUlkIHwgbnVsbCB8IHVuZGVmaW5lZCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGlmICghcm9sZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJlc29sdmVyID0gcm9sZXNbcm9sZV07XG4gIHJldHVybiByZXNvbHZlciA/IHJlc29sdmVyKCkgOiBudWxsO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMsIEV2ZW50S2V5IH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlSGlnaGxpZ2h0ZXIsIHR5cGUgSGlnaGxpZ2h0ZXIgfSBmcm9tIFwiLi9oaWdobGlnaHRcIjtcbmltcG9ydCB7IGNsZWFyUHJvZ3Jlc3MsIGxvYWRQcm9ncmVzcywgc2F2ZVByb2dyZXNzIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuaW1wb3J0IHsgZ2V0Um9sZUVsZW1lbnQsIHR5cGUgUm9sZUlkLCB0eXBlIFJvbGVzTWFwIH0gZnJvbSBcIi4vcm9sZXNcIjtcblxuZXhwb3J0IHR5cGUgU3RlcEFkdmFuY2UgPVxuICB8IHtcbiAgICAgIGtpbmQ6IFwiZXZlbnRcIjtcbiAgICAgIGV2ZW50OiBFdmVudEtleTtcbiAgICAgIHdoZW4/OiAocGF5bG9hZDogdW5rbm93bikgPT4gYm9vbGVhbjtcbiAgICAgIGNoZWNrPzogKCkgPT4gYm9vbGVhbjtcbiAgICB9XG4gIHwge1xuICAgICAga2luZDogXCJtYW51YWxcIjtcbiAgICAgIG5leHRMYWJlbD86IHN0cmluZztcbiAgICB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsU3RlcCB7XG4gIGlkOiBzdHJpbmc7XG4gIHRhcmdldDogUm9sZUlkIHwgKCgpID0+IEhUTUxFbGVtZW50IHwgbnVsbCkgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBhZHZhbmNlOiBTdGVwQWR2YW5jZTtcbiAgb25FbnRlcj86ICgpID0+IHZvaWQ7XG4gIG9uRXhpdD86ICgpID0+IHZvaWQ7XG4gIGFsbG93U2tpcD86IGJvb2xlYW47XG4gIHNraXBMYWJlbD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEVuZ2luZU9wdGlvbnMge1xuICBpZDogc3RyaW5nO1xuICBidXM6IEV2ZW50QnVzO1xuICByb2xlczogUm9sZXNNYXA7XG4gIHN0ZXBzOiBUdXRvcmlhbFN0ZXBbXTtcbn1cblxuaW50ZXJmYWNlIFN0YXJ0T3B0aW9ucyB7XG4gIHJlc3VtZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxFbmdpbmUge1xuICBzdGFydChvcHRpb25zPzogU3RhcnRPcHRpb25zKTogdm9pZDtcbiAgcmVzdGFydCgpOiB2b2lkO1xuICBzdG9wKCk6IHZvaWQ7XG4gIGlzUnVubmluZygpOiBib29sZWFuO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUdXRvcmlhbEVuZ2luZSh7IGlkLCBidXMsIHJvbGVzLCBzdGVwcyB9OiBFbmdpbmVPcHRpb25zKTogVHV0b3JpYWxFbmdpbmUge1xuICBjb25zdCBoaWdobGlnaHRlcjogSGlnaGxpZ2h0ZXIgPSBjcmVhdGVIaWdobGlnaHRlcigpO1xuICBsZXQgcnVubmluZyA9IGZhbHNlO1xuICBsZXQgcGF1c2VkID0gZmFsc2U7XG4gIGxldCBjdXJyZW50SW5kZXggPSAtMTtcbiAgbGV0IGN1cnJlbnRTdGVwOiBUdXRvcmlhbFN0ZXAgfCBudWxsID0gbnVsbDtcbiAgbGV0IGNsZWFudXBDdXJyZW50OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IHJlbmRlckN1cnJlbnQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgbGFzdFNhdmVkQ29tcGxldGVkID0gZmFsc2U7XG4gIGxldCBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcblxuICBjb25zdCBwZXJzaXN0ZW50TGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuXG4gIHBlcnNpc3RlbnRMaXN0ZW5lcnMucHVzaChcbiAgICBidXMub24oXCJoZWxwOnZpc2libGVDaGFuZ2VkXCIsICh7IHZpc2libGUgfSkgPT4ge1xuICAgICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgICBwYXVzZWQgPSBCb29sZWFuKHZpc2libGUpO1xuICAgICAgaWYgKHBhdXNlZCkge1xuICAgICAgICBoaWdobGlnaHRlci5oaWRlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZW5kZXJDdXJyZW50Py4oKTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcblxuICBmdW5jdGlvbiByZXNvbHZlVGFyZ2V0KHN0ZXA6IFR1dG9yaWFsU3RlcCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gICAgaWYgKCFzdGVwLnRhcmdldCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygc3RlcC50YXJnZXQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgcmV0dXJuIHN0ZXAudGFyZ2V0KCk7XG4gICAgfVxuICAgIHJldHVybiBnZXRSb2xlRWxlbWVudChyb2xlcywgc3RlcC50YXJnZXQpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2xhbXBJbmRleChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShpbmRleCkgfHwgaW5kZXggPCAwKSByZXR1cm4gMDtcbiAgICBpZiAoaW5kZXggPj0gc3RlcHMubGVuZ3RoKSByZXR1cm4gc3RlcHMubGVuZ3RoIC0gMTtcbiAgICByZXR1cm4gTWF0aC5mbG9vcihpbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTdGVwKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gc3RlcHMubGVuZ3RoKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cblxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG5cbiAgICBjdXJyZW50SW5kZXggPSBpbmRleDtcbiAgICBjb25zdCBzdGVwID0gc3RlcHNbaW5kZXhdO1xuICAgIGN1cnJlbnRTdGVwID0gc3RlcDtcblxuICAgIHBlcnNpc3RQcm9ncmVzcyhpbmRleCwgZmFsc2UpO1xuXG4gICAgYnVzLmVtaXQoXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiLCB7IGlkLCBzdGVwSW5kZXg6IGluZGV4LCB0b3RhbDogc3RlcHMubGVuZ3RoIH0pO1xuICAgIHN0ZXAub25FbnRlcj8uKCk7XG5cbiAgICBjb25zdCBhbGxvd1NraXAgPSBzdGVwLmFsbG93U2tpcCAhPT0gZmFsc2U7XG4gICAgY29uc3QgcmVuZGVyID0gKCk6IHZvaWQgPT4ge1xuICAgICAgaWYgKCFydW5uaW5nIHx8IHBhdXNlZCkgcmV0dXJuO1xuICAgICAgaGlnaGxpZ2h0ZXIuc2hvdyh7XG4gICAgICAgIHRhcmdldDogcmVzb2x2ZVRhcmdldChzdGVwKSxcbiAgICAgICAgdGl0bGU6IHN0ZXAudGl0bGUsXG4gICAgICAgIGJvZHk6IHN0ZXAuYm9keSxcbiAgICAgICAgc3RlcEluZGV4OiBpbmRleCxcbiAgICAgICAgc3RlcENvdW50OiBzdGVwcy5sZW5ndGgsXG4gICAgICAgIHNob3dOZXh0OiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIixcbiAgICAgICAgbmV4dExhYmVsOiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIlxuICAgICAgICAgID8gc3RlcC5hZHZhbmNlLm5leHRMYWJlbCA/PyAoaW5kZXggPT09IHN0ZXBzLmxlbmd0aCAtIDEgPyBcIkZpbmlzaFwiIDogXCJOZXh0XCIpXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIG9uTmV4dDogc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwibWFudWFsXCIgPyBhZHZhbmNlU3RlcCA6IHVuZGVmaW5lZCxcbiAgICAgICAgc2hvd1NraXA6IGFsbG93U2tpcCxcbiAgICAgICAgc2tpcExhYmVsOiBzdGVwLnNraXBMYWJlbCxcbiAgICAgICAgb25Ta2lwOiBhbGxvd1NraXAgPyBza2lwQ3VycmVudFN0ZXAgOiB1bmRlZmluZWQsXG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmVuZGVyQ3VycmVudCA9IHJlbmRlcjtcbiAgICByZW5kZXIoKTtcblxuICAgIGlmIChzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJldmVudFwiKSB7XG4gICAgICBjb25zdCBoYW5kbGVyID0gKHBheWxvYWQ6IHVua25vd24pOiB2b2lkID0+IHtcbiAgICAgICAgaWYgKCFydW5uaW5nIHx8IHBhdXNlZCkgcmV0dXJuO1xuICAgICAgICBpZiAoc3RlcC5hZHZhbmNlLndoZW4gJiYgIXN0ZXAuYWR2YW5jZS53aGVuKHBheWxvYWQpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2VUbyhpbmRleCArIDEpO1xuICAgICAgfTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gYnVzLm9uKHN0ZXAuYWR2YW5jZS5ldmVudCwgaGFuZGxlciBhcyAodmFsdWU6IG5ldmVyKSA9PiB2b2lkKTtcbiAgICAgIGlmIChzdGVwLmFkdmFuY2UuY2hlY2sgJiYgc3RlcC5hZHZhbmNlLmNoZWNrKCkpIHtcbiAgICAgICAgaGFuZGxlcih1bmRlZmluZWQpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYWR2YW5jZVRvKG5leHRJbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuICAgIHJlbmRlckN1cnJlbnQgPSBudWxsO1xuICAgIGlmIChuZXh0SW5kZXggPj0gc3RlcHMubGVuZ3RoKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldFN0ZXAobmV4dEluZGV4KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlU3RlcCgpOiB2b2lkIHtcbiAgICBhZHZhbmNlVG8oY3VycmVudEluZGV4ICsgMSk7XG4gIH1cblxuICBmdW5jdGlvbiBza2lwQ3VycmVudFN0ZXAoKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgY29uc3QgbmV4dEluZGV4ID0gY3VycmVudEluZGV4ID49IDAgPyBjdXJyZW50SW5kZXggKyAxIDogMDtcbiAgICBhZHZhbmNlVG8obmV4dEluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBsZXRlVHV0b3JpYWwoKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gdHJ1ZTtcbiAgICBwZXJzaXN0UHJvZ3Jlc3Moc3RlcHMubGVuZ3RoLCB0cnVlKTtcbiAgICBidXMuZW1pdChcInR1dG9yaWFsOmNvbXBsZXRlZFwiLCB7IGlkIH0pO1xuICAgIHN0b3AoKTtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0KG9wdGlvbnM/OiBTdGFydE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCByZXN1bWUgPSBvcHRpb25zPy5yZXN1bWUgIT09IGZhbHNlO1xuICAgIGlmIChydW5uaW5nKSB7XG4gICAgICByZXN0YXJ0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcnVubmluZyA9IHRydWU7XG4gICAgcGF1c2VkID0gZmFsc2U7XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gZmFsc2U7XG4gICAgbGFzdFNhdmVkQ29tcGxldGVkID0gZmFsc2U7XG4gICAgbGV0IHN0YXJ0SW5kZXggPSAwO1xuICAgIGlmIChyZXN1bWUpIHtcbiAgICAgIGNvbnN0IHByb2dyZXNzID0gbG9hZFByb2dyZXNzKGlkKTtcbiAgICAgIGlmIChwcm9ncmVzcyAmJiAhcHJvZ3Jlc3MuY29tcGxldGVkKSB7XG4gICAgICAgIHN0YXJ0SW5kZXggPSBjbGFtcEluZGV4KHByb2dyZXNzLnN0ZXBJbmRleCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFyUHJvZ3Jlc3MoaWQpO1xuICAgIH1cbiAgICBidXMuZW1pdChcInR1dG9yaWFsOnN0YXJ0ZWRcIiwgeyBpZCB9KTtcbiAgICBzZXRTdGVwKHN0YXJ0SW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVzdGFydCgpOiB2b2lkIHtcbiAgICBzdG9wKCk7XG4gICAgc3RhcnQoeyByZXN1bWU6IGZhbHNlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RvcCgpOiB2b2lkIHtcbiAgICBjb25zdCBzaG91bGRQZXJzaXN0ID0gIXN1cHByZXNzUGVyc2lzdE9uU3RvcCAmJiBydW5uaW5nICYmICFsYXN0U2F2ZWRDb21wbGV0ZWQgJiYgY3VycmVudEluZGV4ID49IDAgJiYgY3VycmVudEluZGV4IDwgc3RlcHMubGVuZ3RoO1xuICAgIGNvbnN0IGluZGV4VG9QZXJzaXN0ID0gY3VycmVudEluZGV4O1xuXG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChzaG91bGRQZXJzaXN0KSB7XG4gICAgICBwZXJzaXN0UHJvZ3Jlc3MoaW5kZXhUb1BlcnNpc3QsIGZhbHNlKTtcbiAgICB9XG4gICAgcnVubmluZyA9IGZhbHNlO1xuICAgIHBhdXNlZCA9IGZhbHNlO1xuICAgIGN1cnJlbnRJbmRleCA9IC0xO1xuICAgIHJlbmRlckN1cnJlbnQgPSBudWxsO1xuICAgIGhpZ2hsaWdodGVyLmhpZGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzUnVubmluZygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gcnVubmluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgc3RvcCgpO1xuICAgIGZvciAoY29uc3QgZGlzcG9zZSBvZiBwZXJzaXN0ZW50TGlzdGVuZXJzKSB7XG4gICAgICBkaXNwb3NlKCk7XG4gICAgfVxuICAgIGhpZ2hsaWdodGVyLmRlc3Ryb3koKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBlcnNpc3RQcm9ncmVzcyhzdGVwSW5kZXg6IG51bWJlciwgY29tcGxldGVkOiBib29sZWFuKTogdm9pZCB7XG4gICAgbGFzdFNhdmVkQ29tcGxldGVkID0gY29tcGxldGVkO1xuICAgIHNhdmVQcm9ncmVzcyhpZCwge1xuICAgICAgc3RlcEluZGV4LFxuICAgICAgY29tcGxldGVkLFxuICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydCxcbiAgICByZXN0YXJ0LFxuICAgIHN0b3AsXG4gICAgaXNSdW5uaW5nLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBUdXRvcmlhbFN0ZXAgfSBmcm9tIFwiLi9lbmdpbmVcIjtcblxuZnVuY3Rpb24gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZDogdW5rbm93biwgbWluSW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBpbmRleCA9IChwYXlsb2FkIGFzIHsgaW5kZXg/OiB1bmtub3duIH0pLmluZGV4O1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSBcIm51bWJlclwiIHx8ICFOdW1iZXIuaXNGaW5pdGUoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBpbmRleCA+PSBtaW5JbmRleDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFJvdXRlSWQocGF5bG9hZDogdW5rbm93bik6IHN0cmluZyB8IG51bGwge1xuICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvdXRlSWQgPSAocGF5bG9hZCBhcyB7IHJvdXRlSWQ/OiB1bmtub3duIH0pLnJvdXRlSWQ7XG4gIHJldHVybiB0eXBlb2Ygcm91dGVJZCA9PT0gXCJzdHJpbmdcIiA/IHJvdXRlSWQgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXlsb2FkVG9vbEVxdWFscyh0YXJnZXQ6IHN0cmluZyk6IChwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuIHtcbiAgcmV0dXJuIChwYXlsb2FkOiB1bmtub3duKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiIHx8IHBheWxvYWQgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCB0b29sID0gKHBheWxvYWQgYXMgeyB0b29sPzogdW5rbm93biB9KS50b29sO1xuICAgIHJldHVybiB0eXBlb2YgdG9vbCA9PT0gXCJzdHJpbmdcIiAmJiB0b29sID09PSB0YXJnZXQ7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCYXNpY1R1dG9yaWFsU3RlcHMoKTogVHV0b3JpYWxTdGVwW10ge1xuICBsZXQgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPSAwO1xuICBsZXQgaW5pdGlhbFJvdXRlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgbmV3Um91dGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgcmV0dXJuIFtcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLXBsb3Qtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgYSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJDbGljayBvbiB0aGUgbWFwIHRvIGRyb3AgYXQgbGVhc3QgdGhyZWUgd2F5cG9pbnRzIGFuZCBza2V0Y2ggeW91ciBjb3Vyc2UuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAyKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWNoYW5nZS1zcGVlZFwiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBTcGVlZFNsaWRlclwiLFxuICAgICAgdGl0bGU6IFwiQWRqdXN0IHNoaXAgc3BlZWRcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBTaGlwIFNwZWVkIHNsaWRlciAob3IgcHJlc3MgWyAvIF0pIHRvIGZpbmUtdHVuZSB5b3VyIHRyYXZlbCBzcGVlZC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtc2VsZWN0LWxlZ1wiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBTZWxlY3RcIixcbiAgICAgIHRpdGxlOiBcIlNlbGVjdCBhIHJvdXRlIGxlZ1wiLFxuICAgICAgYm9keTogXCJTd2l0Y2ggdG8gU2VsZWN0IG1vZGUgKFQga2V5KSBhbmQgdGhlbiBjbGljayBhIHdheXBvaW50IG9uIHRoZSBtYXAgdG8gaGlnaGxpZ2h0IGl0cyBsZWcuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpsZWdTZWxlY3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMCksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1kZWxldGUtbGVnXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcERlbGV0ZVwiLFxuICAgICAgdGl0bGU6IFwiRGVsZXRlIGEgcm91dGUgbGVnXCIsXG4gICAgICBib2R5OiBcIlJlbW92ZSB0aGUgc2VsZWN0ZWQgd2F5cG9pbnQgdXNpbmcgdGhlIERlbGV0ZSBjb250cm9sIG9yIHRoZSBEZWxldGUga2V5LlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6d2F5cG9pbnREZWxldGVkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1jbGVhci1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBDbGVhclwiLFxuICAgICAgdGl0bGU6IFwiQ2xlYXIgdGhlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkNsZWFyIHJlbWFpbmluZyB3YXlwb2ludHMgdG8gcmVzZXQgeW91ciBwbG90dGVkIGNvdXJzZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOmNsZWFySW52b2tlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtc2V0LW1vZGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlU2V0XCIsXG4gICAgICB0aXRsZTogXCJTd2l0Y2ggdG8gbWlzc2lsZSBwbGFubmluZ1wiLFxuICAgICAgYm9keTogXCJUYXAgU2V0IHNvIGV2ZXJ5IGNsaWNrIGRyb3BzIG1pc3NpbGUgd2F5cG9pbnRzIG9uIHRoZSBhY3RpdmUgcm91dGUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLFxuICAgICAgICB3aGVuOiBwYXlsb2FkVG9vbEVxdWFscyhcInNldFwiKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXBsb3QtaW5pdGlhbFwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCBtaXNzaWxlIHdheXBvaW50c1wiLFxuICAgICAgYm9keTogXCJDbGljayB0aGUgbWFwIHRvIGRyb3AgYXQgbGVhc3QgdHdvIGd1aWRhbmNlIHBvaW50cyBmb3IgdGhlIGN1cnJlbnQgbWlzc2lsZSByb3V0ZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBpZiAoIWhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDEpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmIChyb3V0ZUlkKSB7XG4gICAgICAgICAgICBpbml0aWFsUm91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLWluaXRpYWxcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggdGhlIHN0cmlrZVwiLFxuICAgICAgYm9keTogXCJTZW5kIHRoZSBwbGFubmVkIG1pc3NpbGUgcm91dGUgbGl2ZSB3aXRoIHRoZSBMYXVuY2ggY29udHJvbCAoTCBrZXkpLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCkge1xuICAgICAgICAgICAgaW5pdGlhbFJvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWFkZC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVBZGRSb3V0ZVwiLFxuICAgICAgdGl0bGU6IFwiQ3JlYXRlIGEgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiUHJlc3MgTmV3IHRvIGFkZCBhIHNlY29uZCBtaXNzaWxlIHJvdXRlIGZvciBhbm90aGVyIHN0cmlrZSBncm91cC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOnJvdXRlQWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFyb3V0ZUlkKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgbmV3Um91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1wbG90LW5ldy1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCB0aGUgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiRHJvcCBhdCBsZWFzdCB0d28gd2F5cG9pbnRzIG9uIHRoZSBuZXcgcm91dGUgdG8gZGVmaW5lIGl0cyBwYXRoLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGlmICghaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKG5ld1JvdXRlSWQgJiYgcm91dGVJZCAmJiByb3V0ZUlkICE9PSBuZXdSb3V0ZUlkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghbmV3Um91dGVJZCAmJiByb3V0ZUlkKSB7XG4gICAgICAgICAgICBuZXdSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtbmV3LXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIHRoZSBuZXcgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiTGF1bmNoIHRoZSBmcmVzaCBtaXNzaWxlIHJvdXRlIHRvIGNvbmZpcm0gaXRzIHBhdHRlcm4uXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFuZXdSb3V0ZUlkIHx8ICFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gbmV3Um91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXN3aXRjaC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcInJvdXRlTmV4dFwiLFxuICAgICAgdGl0bGU6IFwiU3dpdGNoIGJhY2sgdG8gdGhlIG9yaWdpbmFsIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgXHUyNUMwIFx1MjVCNiBjb250cm9scyAob3IgVGFiL1NoaWZ0K1RhYikgdG8gc2VsZWN0IHlvdXIgZmlyc3QgbWlzc2lsZSByb3V0ZSBhZ2Fpbi5cIixcbiAgICAgIG9uRW50ZXI6ICgpID0+IHtcbiAgICAgICAgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPSAwO1xuICAgICAgfSxcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyICs9IDE7XG4gICAgICAgICAgaWYgKHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyIDwgMSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkIHx8ICFyb3V0ZUlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLWFmdGVyLXN3aXRjaFwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCBmcm9tIHRoZSBvdGhlciByb3V0ZVwiLFxuICAgICAgYm9keTogXCJGaXJlIHRoZSBvcmlnaW5hbCBtaXNzaWxlIHJvdXRlIHRvIHByYWN0aWNlIHJvdW5kLXJvYmluIHN0cmlrZXMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCB8fCAhcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInR1dG9yaWFsLXByYWN0aWNlXCIsXG4gICAgICB0YXJnZXQ6IFwic3Bhd25Cb3RcIixcbiAgICAgIHRpdGxlOiBcIlNwYXduIGEgcHJhY3RpY2UgYm90XCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgQm90IGNvbnRyb2wgdG8gYWRkIGEgdGFyZ2V0IGFuZCByZWhlYXJzZSB0aGVzZSBtYW5ldXZlcnMgaW4gcmVhbCB0aW1lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImJvdDpzcGF3blJlcXVlc3RlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJ0dXRvcmlhbC1jb21wbGV0ZVwiLFxuICAgICAgdGFyZ2V0OiBudWxsLFxuICAgICAgdGl0bGU6IFwiWW91XHUyMDE5cmUgcmVhZHlcIixcbiAgICAgIGJvZHk6IFwiR3JlYXQgd29yay4gUmVsb2FkIHRoZSBjb25zb2xlIG9yIHJlam9pbiBhIHJvb20gdG8gcmV2aXNpdCB0aGVzZSBkcmlsbHMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwibWFudWFsXCIsXG4gICAgICAgIG5leHRMYWJlbDogXCJGaW5pc2hcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gIF07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZVR1dG9yaWFsRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBjcmVhdGVSb2xlcyB9IGZyb20gXCIuL3JvbGVzXCI7XG5pbXBvcnQgeyBnZXRCYXNpY1R1dG9yaWFsU3RlcHMgfSBmcm9tIFwiLi9zdGVwc19iYXNpY1wiO1xuZXhwb3J0IGNvbnN0IEJBU0lDX1RVVE9SSUFMX0lEID0gXCJzaGlwLWJhc2ljc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsQ29udHJvbGxlciB7XG4gIHN0YXJ0KG9wdGlvbnM/OiB7IHJlc3VtZT86IGJvb2xlYW4gfSk6IHZvaWQ7XG4gIHJlc3RhcnQoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRUdXRvcmlhbChidXM6IEV2ZW50QnVzKTogVHV0b3JpYWxDb250cm9sbGVyIHtcbiAgY29uc3Qgcm9sZXMgPSBjcmVhdGVSb2xlcygpO1xuICBjb25zdCBlbmdpbmUgPSBjcmVhdGVUdXRvcmlhbEVuZ2luZSh7XG4gICAgaWQ6IEJBU0lDX1RVVE9SSUFMX0lELFxuICAgIGJ1cyxcbiAgICByb2xlcyxcbiAgICBzdGVwczogZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzKCksXG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RhcnQob3B0aW9ucykge1xuICAgICAgZW5naW5lLnN0YXJ0KG9wdGlvbnMpO1xuICAgIH0sXG4gICAgcmVzdGFydCgpIHtcbiAgICAgIGVuZ2luZS5yZXN0YXJ0KCk7XG4gICAgfSxcbiAgICBkZXN0cm95KCkge1xuICAgICAgZW5naW5lLmRlc3Ryb3koKTtcbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVDaG9pY2Uge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVDb250ZW50IHtcbiAgc3BlYWtlcjogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIGludGVudD86IFwiZmFjdG9yeVwiIHwgXCJ1bml0XCI7XG4gIGNob2ljZXM/OiBEaWFsb2d1ZUNob2ljZVtdO1xuICB0eXBpbmdTcGVlZE1zPzogbnVtYmVyO1xuICBvbkNob2ljZT86IChjaG9pY2VJZDogc3RyaW5nKSA9PiB2b2lkO1xuICBvblRleHRGdWxseVJlbmRlcmVkPzogKCkgPT4gdm9pZDtcbiAgb25Db250aW51ZT86ICgpID0+IHZvaWQ7XG4gIGNvbnRpbnVlTGFiZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVPdmVybGF5IHtcbiAgc2hvdyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkO1xuICBoaWRlKCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgaXNWaXNpYmxlKCk6IGJvb2xlYW47XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJkaWFsb2d1ZS1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkoKTogRGlhbG9ndWVPdmVybGF5IHtcbiAgZW5zdXJlU3R5bGVzKCk7XG5cbiAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1vdmVybGF5XCI7XG4gIG92ZXJsYXkuc2V0QXR0cmlidXRlKFwiYXJpYS1saXZlXCIsIFwicG9saXRlXCIpO1xuXG4gIGNvbnN0IGNvbnNvbGVGcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGNvbnNvbGVGcmFtZS5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNvbnNvbGVcIjtcblxuICBjb25zdCBzcGVha2VyTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzcGVha2VyTGFiZWwuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1zcGVha2VyXCI7XG5cbiAgY29uc3QgdGV4dEJsb2NrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGV4dEJsb2NrLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtdGV4dFwiO1xuXG4gIGNvbnN0IGN1cnNvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBjdXJzb3IuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jdXJzb3JcIjtcbiAgY3Vyc29yLnRleHRDb250ZW50ID0gXCJfXCI7XG5cbiAgY29uc3QgY2hvaWNlc0xpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidWxcIik7XG4gIGNob2ljZXNMaXN0LmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY2hvaWNlcyBoaWRkZW5cIjtcblxuICBjb25zdCBjb250aW51ZUJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGNvbnRpbnVlQnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICBjb250aW51ZUJ1dHRvbi5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNvbnRpbnVlIGhpZGRlblwiO1xuICBjb250aW51ZUJ1dHRvbi50ZXh0Q29udGVudCA9IFwiQ29udGludWVcIjtcblxuICB0ZXh0QmxvY2suYXBwZW5kKGN1cnNvcik7XG4gIGNvbnNvbGVGcmFtZS5hcHBlbmQoc3BlYWtlckxhYmVsLCB0ZXh0QmxvY2ssIGNob2ljZXNMaXN0LCBjb250aW51ZUJ1dHRvbik7XG4gIG92ZXJsYXkuYXBwZW5kKGNvbnNvbGVGcmFtZSk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHR5cGluZ0hhbmRsZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCB0YXJnZXRUZXh0ID0gXCJcIjtcbiAgbGV0IHJlbmRlcmVkQ2hhcnMgPSAwO1xuICBsZXQgYWN0aXZlQ29udGVudDogRGlhbG9ndWVDb250ZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gY2xlYXJUeXBpbmcoKTogdm9pZCB7XG4gICAgaWYgKHR5cGluZ0hhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0eXBpbmdIYW5kbGUpO1xuICAgICAgdHlwaW5nSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBmaW5pc2hUeXBpbmcoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgcmVuZGVyZWRDaGFycyA9IHRhcmdldFRleHQubGVuZ3RoO1xuICAgIHVwZGF0ZVRleHQoKTtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIGNvbnRlbnQub25UZXh0RnVsbHlSZW5kZXJlZD8uKCk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgfHwgY29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVRleHQoKTogdm9pZCB7XG4gICAgY29uc3QgdGV4dFRvU2hvdyA9IHRhcmdldFRleHQuc2xpY2UoMCwgcmVuZGVyZWRDaGFycyk7XG4gICAgdGV4dEJsb2NrLmlubmVySFRNTCA9IFwiXCI7XG4gICAgY29uc3QgdGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICB0ZXh0Tm9kZS50ZXh0Q29udGVudCA9IHRleHRUb1Nob3c7XG4gICAgdGV4dEJsb2NrLmFwcGVuZCh0ZXh0Tm9kZSwgY3Vyc29yKTtcbiAgICBjdXJzb3IuY2xhc3NMaXN0LnRvZ2dsZShcImhpZGRlblwiLCAhdmlzaWJsZSk7XG4gIH1cblxuICBmdW5jdGlvbiByZW5kZXJDaG9pY2VzKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGNob2ljZXNMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgY29uc3QgY2hvaWNlcyA9IEFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSA/IGNvbnRlbnQuY2hvaWNlcyA6IFtdO1xuICAgIGlmIChjaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgYnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgICAgYnV0dG9uLmRhdGFzZXQuY2hvaWNlSWQgPSBjaG9pY2UuaWQ7XG4gICAgICBidXR0b24udGV4dENvbnRlbnQgPSBgJHtpbmRleCArIDF9LiAke2Nob2ljZS50ZXh0fWA7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgICAgY29udGVudC5vbkNob2ljZT8uKGNob2ljZS5pZCk7XG4gICAgICB9KTtcbiAgICAgIGl0ZW0uYXBwZW5kKGJ1dHRvbik7XG4gICAgICBjaG9pY2VzTGlzdC5hcHBlbmQoaXRlbSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzaG93Q29udGludWUoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgaWYgKCFjb250ZW50Lm9uQ29udGludWUpIHtcbiAgICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gbnVsbDtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29udGludWVCdXR0b24udGV4dENvbnRlbnQgPSBjb250ZW50LmNvbnRpbnVlTGFiZWwgPz8gXCJDb250aW51ZVwiO1xuICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24ub25jbGljayA9ICgpID0+IHtcbiAgICAgIGNvbnRlbnQub25Db250aW51ZT8uKCk7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjaGVkdWxlVHlwZShjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIGNvbnN0IHR5cGluZ1NwZWVkID0gY2xhbXAoTnVtYmVyKGNvbnRlbnQudHlwaW5nU3BlZWRNcykgfHwgMTgsIDgsIDY0KTtcbiAgICBjb25zdCB0aWNrID0gKCk6IHZvaWQgPT4ge1xuICAgICAgcmVuZGVyZWRDaGFycyA9IE1hdGgubWluKHJlbmRlcmVkQ2hhcnMgKyAxLCB0YXJnZXRUZXh0Lmxlbmd0aCk7XG4gICAgICB1cGRhdGVUZXh0KCk7XG4gICAgICBpZiAocmVuZGVyZWRDaGFycyA+PSB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgICBjbGVhclR5cGluZygpO1xuICAgICAgICBjb250ZW50Lm9uVGV4dEZ1bGx5UmVuZGVyZWQ/LigpO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSB8fCBjb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0eXBpbmdIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCh0aWNrLCB0eXBpbmdTcGVlZCk7XG4gICAgICB9XG4gICAgfTtcbiAgICB0eXBpbmdIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCh0aWNrLCB0eXBpbmdTcGVlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlIHx8ICFhY3RpdmVDb250ZW50KSByZXR1cm47XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFjdGl2ZUNvbnRlbnQuY2hvaWNlcykgfHwgYWN0aXZlQ29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCIgXCIgfHwgZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaWYgKHJlbmRlcmVkQ2hhcnMgPCB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgICAgIGZpbmlzaFR5cGluZyhhY3RpdmVDb250ZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhY3RpdmVDb250ZW50Lm9uQ29udGludWU/LigpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGluZGV4ID0gcGFyc2VJbnQoZXZlbnQua2V5LCAxMCk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShpbmRleCkgJiYgaW5kZXggPj0gMSAmJiBpbmRleCA8PSBhY3RpdmVDb250ZW50LmNob2ljZXMubGVuZ3RoKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgY2hvaWNlID0gYWN0aXZlQ29udGVudC5jaG9pY2VzW2luZGV4IC0gMV07XG4gICAgICBhY3RpdmVDb250ZW50Lm9uQ2hvaWNlPy4oY2hvaWNlLmlkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiICYmIHJlbmRlcmVkQ2hhcnMgPCB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGZpbmlzaFR5cGluZyhhY3RpdmVDb250ZW50KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGFjdGl2ZUNvbnRlbnQgPSBjb250ZW50O1xuICAgIHZpc2libGUgPSB0cnVlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gICAgb3ZlcmxheS5kYXRhc2V0LmludGVudCA9IGNvbnRlbnQuaW50ZW50ID8/IFwiZmFjdG9yeVwiO1xuICAgIHNwZWFrZXJMYWJlbC50ZXh0Q29udGVudCA9IGNvbnRlbnQuc3BlYWtlcjtcblxuICAgIHRhcmdldFRleHQgPSBjb250ZW50LnRleHQ7XG4gICAgcmVuZGVyZWRDaGFycyA9IDA7XG4gICAgdXBkYXRlVGV4dCgpO1xuICAgIHJlbmRlckNob2ljZXMoY29udGVudCk7XG4gICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgIHNjaGVkdWxlVHlwZShjb250ZW50KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIGFjdGl2ZUNvbnRlbnQgPSBudWxsO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICB0YXJnZXRUZXh0ID0gXCJcIjtcbiAgICByZW5kZXJlZENoYXJzID0gMDtcbiAgICB0ZXh0QmxvY2suaW5uZXJIVE1MID0gXCJcIjtcbiAgICB0ZXh0QmxvY2suYXBwZW5kKGN1cnNvcik7XG4gICAgY2hvaWNlc0xpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24ub25jbGljayA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95KCk6IHZvaWQge1xuICAgIGhpZGUoKTtcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duKTtcbiAgICBvdmVybGF5LnJlbW92ZSgpO1xuICB9XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlS2V5RG93bik7XG5cbiAgcmV0dXJuIHtcbiAgICBzaG93LFxuICAgIGhpZGUsXG4gICAgZGVzdHJveSxcbiAgICBpc1Zpc2libGUoKSB7XG4gICAgICByZXR1cm4gdmlzaWJsZTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBlbnN1cmVTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gIHN0eWxlLmlkID0gU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC5kaWFsb2d1ZS1vdmVybGF5IHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGluc2V0OiAwO1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgei1pbmRleDogNjA7XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdHJhbnNpdGlvbjogb3BhY2l0eSAwLjJzIGVhc2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5LnZpc2libGUge1xuICAgICAgb3BhY2l0eTogMTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBtaW4td2lkdGg6IDMyMHB4O1xuICAgICAgbWF4LXdpZHRoOiBtaW4oNTIwcHgsIGNhbGMoMTAwdncgLSA0OHB4KSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDYsIDExLCAxNiwgMC45Mik7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgICAgIHBhZGRpbmc6IDE4cHggMjBweDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiAxNHB4O1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgyLCA2LCAxNiwgMC42KTtcbiAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgZm9udC1mYW1pbHk6IFwiSUJNIFBsZXggTW9ub1wiLCBcIkpldEJyYWlucyBNb25vXCIsIHVpLW1vbm9zcGFjZSwgU0ZNb25vLVJlZ3VsYXIsIE1lbmxvLCBNb25hY28sIENvbnNvbGFzLCBcIkxpYmVyYXRpb24gTW9ub1wiLCBcIkNvdXJpZXIgTmV3XCIsIG1vbm9zcGFjZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXlbZGF0YS1pbnRlbnQ9XCJmYWN0b3J5XCJdIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNDUpO1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgxMywgMTQ4LCAxMzYsIDAuMzUpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheVtkYXRhLWludGVudD1cInVuaXRcIl0gLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDI0NCwgMTE0LCAxODIsIDAuNDUpO1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgyMzYsIDcyLCAxNTMsIDAuMjgpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtc3BlYWtlciB7XG4gICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4xNmVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuNzUpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtdGV4dCB7XG4gICAgICBtaW4taGVpZ2h0OiA5MHB4O1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuNTU7XG4gICAgICB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jdXJzb3Ige1xuICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICAgICAgbWFyZ2luLWxlZnQ6IDRweDtcbiAgICAgIGFuaW1hdGlvbjogZGlhbG9ndWUtY3Vyc29yLWJsaW5rIDEuMnMgc3RlcHMoMiwgc3RhcnQpIGluZmluaXRlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY3Vyc29yLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyB7XG4gICAgICBsaXN0LXN0eWxlOiBub25lO1xuICAgICAgbWFyZ2luOiAwO1xuICAgICAgcGFkZGluZzogMDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiA4cHg7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b24sXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgICAgcGFkZGluZzogOHB4IDEwcHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMyk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI0LCAzNiwgNDgsIDAuODUpO1xuICAgICAgY29sb3I6IGluaGVyaXQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMThzIGVhc2UsIGJvcmRlci1jb2xvciAwLjE4cyBlYXNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29udGludWUge1xuICAgICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29udGludWUuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbjpob3ZlcixcbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b246Zm9jdXMtdmlzaWJsZSxcbiAgICAuZGlhbG9ndWUtY29udGludWU6aG92ZXIsXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlOmZvY3VzLXZpc2libGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC41NSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMwLCA0NSwgNjAsIDAuOTUpO1xuICAgICAgb3V0bGluZTogbm9uZTtcbiAgICB9XG4gICAgQGtleWZyYW1lcyBkaWFsb2d1ZS1jdXJzb3ItYmxpbmsge1xuICAgICAgMCUsIDUwJSB7IG9wYWNpdHk6IDE7IH1cbiAgICAgIDUwLjAxJSwgMTAwJSB7IG9wYWNpdHk6IDA7IH1cbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG4iLCAiY29uc3QgU1RPUkFHRV9QUkVGSVggPSBcImxzZDpzdG9yeTpcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUZsYWdzIHtcbiAgW2tleTogc3RyaW5nXTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeVByb2dyZXNzIHtcbiAgY2hhcHRlcklkOiBzdHJpbmc7XG4gIG5vZGVJZDogc3RyaW5nO1xuICBmbGFnczogU3RvcnlGbGFncztcbiAgdmlzaXRlZD86IHN0cmluZ1tdO1xuICB1cGRhdGVkQXQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZ2V0U3RvcmFnZSgpOiBTdG9yYWdlIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIgfHwgIXdpbmRvdy5sb2NhbFN0b3JhZ2UpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG59XG5cbmZ1bmN0aW9uIHN0b3JhZ2VLZXkoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIGNvbnN0IHJvb21TZWdtZW50ID0gcm9vbUlkID8gYCR7cm9vbUlkfTpgIDogXCJcIjtcbiAgcmV0dXJuIGAke1NUT1JBR0VfUFJFRklYfSR7cm9vbVNlZ21lbnR9JHtjaGFwdGVySWR9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBTdG9yeVByb2dyZXNzIHwgbnVsbCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgY29uc3QgcmF3ID0gc3RvcmFnZS5nZXRJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFN0b3J5UHJvZ3Jlc3M7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHBhcnNlZCAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQgPT09IG51bGwgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuY2hhcHRlcklkICE9PSBcInN0cmluZ1wiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLm5vZGVJZCAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC51cGRhdGVkQXQgIT09IFwibnVtYmVyXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuZmxhZ3MgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkLmZsYWdzID09PSBudWxsXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGNoYXB0ZXJJZDogcGFyc2VkLmNoYXB0ZXJJZCxcbiAgICAgIG5vZGVJZDogcGFyc2VkLm5vZGVJZCxcbiAgICAgIGZsYWdzOiB7IC4uLnBhcnNlZC5mbGFncyB9LFxuICAgICAgdmlzaXRlZDogQXJyYXkuaXNBcnJheShwYXJzZWQudmlzaXRlZCkgPyBbLi4ucGFyc2VkLnZpc2l0ZWRdIDogdW5kZWZpbmVkLFxuICAgICAgdXBkYXRlZEF0OiBwYXJzZWQudXBkYXRlZEF0LFxuICAgIH07XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlU3RvcnlQcm9ncmVzcyhjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBwcm9ncmVzczogU3RvcnlQcm9ncmVzcyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnNldEl0ZW0oc3RvcmFnZUtleShjaGFwdGVySWQsIHJvb21JZCksIEpTT04uc3RyaW5naWZ5KHByb2dyZXNzKSk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIGlnbm9yZSBwZXJzaXN0ZW5jZSBlcnJvcnNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5yZW1vdmVJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gaWdub3JlIHBlcnNpc3RlbmNlIGVycm9yc1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVGbGFnKGN1cnJlbnQ6IFN0b3J5RmxhZ3MsIGZsYWc6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiBTdG9yeUZsYWdzIHtcbiAgY29uc3QgbmV4dCA9IHsgLi4uY3VycmVudCB9O1xuICBpZiAoIXZhbHVlKSB7XG4gICAgZGVsZXRlIG5leHRbZmxhZ107XG4gIH0gZWxzZSB7XG4gICAgbmV4dFtmbGFnXSA9IHRydWU7XG4gIH1cbiAgcmV0dXJuIG5leHQ7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBQUk5HIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IGNsYXNzIEF1ZGlvRW5naW5lIHtcbiAgcHJpdmF0ZSBzdGF0aWMgX2luc3Q6IEF1ZGlvRW5naW5lIHwgbnVsbCA9IG51bGw7XG5cbiAgcHVibGljIHJlYWRvbmx5IGN0eDogQXVkaW9Db250ZXh0O1xuICBwcml2YXRlIHJlYWRvbmx5IG1hc3RlcjogR2Fpbk5vZGU7XG4gIHByaXZhdGUgcmVhZG9ubHkgbXVzaWNCdXM6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHJlYWRvbmx5IHNmeEJ1czogR2Fpbk5vZGU7XG5cbiAgcHJpdmF0ZSBfdGFyZ2V0TWFzdGVyID0gMC45O1xuICBwcml2YXRlIF90YXJnZXRNdXNpYyA9IDAuOTtcbiAgcHJpdmF0ZSBfdGFyZ2V0U2Z4ID0gMC45O1xuXG4gIHN0YXRpYyBnZXQoKTogQXVkaW9FbmdpbmUge1xuICAgIGlmICghdGhpcy5faW5zdCkgdGhpcy5faW5zdCA9IG5ldyBBdWRpb0VuZ2luZSgpO1xuICAgIHJldHVybiB0aGlzLl9pbnN0O1xuICB9XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmN0eCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWCA9ICh0aGlzIGFzIGFueSkuY3R4O1xuXG4gICAgdGhpcy5tYXN0ZXIgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0TWFzdGVyIH0pO1xuICAgIHRoaXMubXVzaWNCdXMgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0TXVzaWMgfSk7XG4gICAgdGhpcy5zZnhCdXMgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogdGhpcy5fdGFyZ2V0U2Z4IH0pO1xuXG4gICAgdGhpcy5tdXNpY0J1cy5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLnNmeEJ1cy5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLm1hc3Rlci5jb25uZWN0KHRoaXMuY3R4LmRlc3RpbmF0aW9uKTtcbiAgfVxuXG4gIGdldCBub3coKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gIH1cblxuICBnZXRNdXNpY0J1cygpOiBHYWluTm9kZSB7XG4gICAgcmV0dXJuIHRoaXMubXVzaWNCdXM7XG4gIH1cblxuICBnZXRTZnhCdXMoKTogR2Fpbk5vZGUge1xuICAgIHJldHVybiB0aGlzLnNmeEJ1cztcbiAgfVxuXG4gIGFzeW5jIHJlc3VtZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5jdHguc3RhdGUgPT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuY3R4LnJlc3VtZSgpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHN1c3BlbmQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuY3R4LnN0YXRlID09PSBcInJ1bm5pbmdcIikge1xuICAgICAgYXdhaXQgdGhpcy5jdHguc3VzcGVuZCgpO1xuICAgIH1cbiAgfVxuXG4gIHNldE1hc3RlckdhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0TWFzdGVyID0gdjtcbiAgICB0aGlzLm1hc3Rlci5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm1hc3Rlci5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIHNldE11c2ljR2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRNdXNpYyA9IHY7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgc2V0U2Z4R2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRTZnggPSB2O1xuICAgIHRoaXMuc2Z4QnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMuc2Z4QnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgZHVja011c2ljKGxldmVsID0gMC40LCBhdHRhY2sgPSAwLjA1KTogdm9pZCB7XG4gICAgY29uc3QgdCA9IHRoaXMubm93O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKGxldmVsLCB0ICsgYXR0YWNrKTtcbiAgfVxuXG4gIHVuZHVja011c2ljKHJlbGVhc2UgPSAwLjI1KTogdm9pZCB7XG4gICAgY29uc3QgdCA9IHRoaXMubm93O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRoaXMuX3RhcmdldE11c2ljLCB0ICsgcmVsZWFzZSk7XG4gIH1cbn1cblxuLy8gVGlueSBzZWVkYWJsZSBQUk5HIChNdWxiZXJyeTMyKVxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VQUk5HKHNlZWQ6IG51bWJlcik6IFBSTkcge1xuICBsZXQgcyA9IChzZWVkID4+PiAwKSB8fCAxO1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHMgKz0gMHg2RDJCNzlGNTtcbiAgICBsZXQgdCA9IE1hdGguaW11bChzIF4gKHMgPj4+IDE1KSwgMSB8IHMpO1xuICAgIHQgXj0gdCArIE1hdGguaW11bCh0IF4gKHQgPj4+IDcpLCA2MSB8IHQpO1xuICAgIHJldHVybiAoKHQgXiAodCA+Pj4gMTQpKSA+Pj4gMCkgLyA0Mjk0OTY3Mjk2O1xuICB9O1xufVxuIiwgIi8vIExvdy1sZXZlbCBncmFwaCBidWlsZGVycyAvIGhlbHBlcnNcblxuZXhwb3J0IGZ1bmN0aW9uIG9zYyhjdHg6IEF1ZGlvQ29udGV4dCwgdHlwZTogT3NjaWxsYXRvclR5cGUsIGZyZXE6IG51bWJlcikge1xuICByZXR1cm4gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlLCBmcmVxdWVuY3k6IGZyZXEgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub2lzZShjdHg6IEF1ZGlvQ29udGV4dCkge1xuICBjb25zdCBidWZmZXIgPSBjdHguY3JlYXRlQnVmZmVyKDEsIGN0eC5zYW1wbGVSYXRlICogMiwgY3R4LnNhbXBsZVJhdGUpO1xuICBjb25zdCBkYXRhID0gYnVmZmVyLmdldENoYW5uZWxEYXRhKDApO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIGRhdGFbaV0gPSBNYXRoLnJhbmRvbSgpICogMiAtIDE7XG4gIHJldHVybiBuZXcgQXVkaW9CdWZmZXJTb3VyY2VOb2RlKGN0eCwgeyBidWZmZXIsIGxvb3A6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYWtlUGFubmVyKGN0eDogQXVkaW9Db250ZXh0LCBwYW4gPSAwKSB7XG4gIHJldHVybiBuZXcgU3RlcmVvUGFubmVyTm9kZShjdHgsIHsgcGFuIH0pO1xufVxuXG4vKiogQmFzaWMgQURTUiBhcHBsaWVkIHRvIGEgR2Fpbk5vZGUgQXVkaW9QYXJhbS4gUmV0dXJucyBhIGZ1bmN0aW9uIHRvIHJlbGVhc2UuICovXG5leHBvcnQgZnVuY3Rpb24gYWRzcihcbiAgY3R4OiBBdWRpb0NvbnRleHQsXG4gIHBhcmFtOiBBdWRpb1BhcmFtLFxuICB0MDogbnVtYmVyLFxuICBhID0gMC4wMSwgLy8gYXR0YWNrXG4gIGQgPSAwLjA4LCAvLyBkZWNheVxuICBzID0gMC41LCAgLy8gc3VzdGFpbiAoMC4uMSBvZiBwZWFrKVxuICByID0gMC4yLCAgLy8gcmVsZWFzZVxuICBwZWFrID0gMVxuKSB7XG4gIHBhcmFtLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0MCk7XG4gIHBhcmFtLnNldFZhbHVlQXRUaW1lKDAsIHQwKTtcbiAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUocGVhaywgdDAgKyBhKTtcbiAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUocyAqIHBlYWssIHQwICsgYSArIGQpO1xuICByZXR1cm4gKHJlbGVhc2VBdCA9IGN0eC5jdXJyZW50VGltZSkgPT4ge1xuICAgIHBhcmFtLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhyZWxlYXNlQXQpO1xuICAgIC8vIGF2b2lkIHN1ZGRlbiBqdW1wczsgY29udGludWUgZnJvbSBjdXJyZW50XG4gICAgcGFyYW0uc2V0VmFsdWVBdFRpbWUocGFyYW0udmFsdWUsIHJlbGVhc2VBdCk7XG4gICAgcGFyYW0ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wMDAxLCByZWxlYXNlQXQgKyByKTtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxmb1RvUGFyYW0oXG4gIGN0eDogQXVkaW9Db250ZXh0LFxuICB0YXJnZXQ6IEF1ZGlvUGFyYW0sXG4gIHsgZnJlcXVlbmN5ID0gMC4xLCBkZXB0aCA9IDMwMCwgdHlwZSA9IFwic2luZVwiIGFzIE9zY2lsbGF0b3JUeXBlIH0gPSB7fVxuKSB7XG4gIGNvbnN0IGxmbyA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZSwgZnJlcXVlbmN5IH0pO1xuICBjb25zdCBhbXAgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IGRlcHRoIH0pO1xuICBsZm8uY29ubmVjdChhbXApLmNvbm5lY3QodGFyZ2V0KTtcbiAgcmV0dXJuIHtcbiAgICBzdGFydChhdCA9IGN0eC5jdXJyZW50VGltZSkgeyBsZm8uc3RhcnQoYXQpOyB9LFxuICAgIHN0b3AoYXQgPSBjdHguY3VycmVudFRpbWUpIHsgbGZvLnN0b3AoYXQpOyBhbXAuZGlzY29ubmVjdCgpOyB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBhZHNyLCBtYWtlUGFubmVyLCBub2lzZSwgb3NjIH0gZnJvbSBcIi4vZ3JhcGhcIjtcbmltcG9ydCB0eXBlIHsgU2Z4TmFtZSB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbi8qKiBGaXJlLWFuZC1mb3JnZXQgU0ZYIGJ5IG5hbWUsIHdpdGggc2ltcGxlIHBhcmFtcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGF5U2Z4KFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICBuYW1lOiBTZnhOYW1lLFxuICBvcHRzOiB7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfSA9IHt9XG4pIHtcbiAgc3dpdGNoIChuYW1lKSB7XG4gICAgY2FzZSBcImxhc2VyXCI6IHJldHVybiBwbGF5TGFzZXIoZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwidGhydXN0XCI6IHJldHVybiBwbGF5VGhydXN0KGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImV4cGxvc2lvblwiOiByZXR1cm4gcGxheUV4cGxvc2lvbihlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJsb2NrXCI6IHJldHVybiBwbGF5TG9jayhlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJ1aVwiOiByZXR1cm4gcGxheVVpKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImRpYWxvZ3VlXCI6IHJldHVybiBwbGF5RGlhbG9ndWUoZW5naW5lLCBvcHRzKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUxhc2VyKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBvID0gb3NjKGN0eCwgXCJzcXVhcmVcIiwgNjgwICsgMTYwICogdmVsb2NpdHkpO1xuICBjb25zdCBmID0gbmV3IEJpcXVhZEZpbHRlck5vZGUoY3R4LCB7IHR5cGU6IFwibG93cGFzc1wiLCBmcmVxdWVuY3k6IDEyMDAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDIsIDAuMDMsIDAuMjUsIDAuMDgsIDAuNjUpO1xuICBvLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4wNik7XG4gIG8uc3RvcChub3cgKyAwLjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheVRocnVzdChcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDAuNiwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBuID0gbm9pc2UoY3R4KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwge1xuICAgIHR5cGU6IFwiYmFuZHBhc3NcIixcbiAgICBmcmVxdWVuY3k6IDE4MCArIDM2MCAqIHZlbG9jaXR5LFxuICAgIFE6IDEuMSxcbiAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBuLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMTIsIDAuMTUsIDAuNzUsIDAuMjUsIDAuNDUgKiB2ZWxvY2l0eSk7XG4gIG4uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjI1KTtcbiAgbi5zdG9wKG5vdyArIDEuMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RXhwbG9zaW9uKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBuID0gbm9pc2UoY3R4KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwge1xuICAgIHR5cGU6IFwibG93cGFzc1wiLFxuICAgIGZyZXF1ZW5jeTogMjIwMCAqIE1hdGgubWF4KDAuMiwgTWF0aC5taW4odmVsb2NpdHksIDEpKSxcbiAgICBROiAwLjIsXG4gIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbi5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDA1LCAwLjA4LCAwLjUsIDAuMzUsIDEuMSAqIHZlbG9jaXR5KTtcbiAgbi5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMTUgKyAwLjEgKiB2ZWxvY2l0eSk7XG4gIG4uc3RvcChub3cgKyAxLjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUxvY2soXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IGJhc2UgPSA1MjAgKyAxNDAgKiB2ZWxvY2l0eTtcbiAgY29uc3QgbzEgPSBvc2MoY3R4LCBcInNpbmVcIiwgYmFzZSk7XG4gIGNvbnN0IG8yID0gb3NjKGN0eCwgXCJzaW5lXCIsIGJhc2UgKiAxLjUpO1xuXG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvMS5jb25uZWN0KGcpOyBvMi5jb25uZWN0KGcpO1xuICBnLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuXG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAxLCAwLjAyLCAwLjAsIDAuMTIsIDAuNik7XG4gIG8xLnN0YXJ0KG5vdyk7IG8yLnN0YXJ0KG5vdyArIDAuMDIpO1xuICByZWxlYXNlKG5vdyArIDAuMDYpO1xuICBvMS5zdG9wKG5vdyArIDAuMik7IG8yLnN0b3Aobm93ICsgMC4yMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5VWkoZW5naW5lOiBBdWRpb0VuZ2luZSwgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9KSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInRyaWFuZ2xlXCIsIDg4MCAtIDEyMCAqIHZlbG9jaXR5KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDEsIDAuMDQsIDAuMCwgMC4wOCwgMC4zNSk7XG4gIG8uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjA1KTtcbiAgby5zdG9wKG5vdyArIDAuMTgpO1xufVxuXG4vKiogRGlhbG9ndWUgY3VlIHVzZWQgYnkgdGhlIHN0b3J5IG92ZXJsYXkgKHNob3J0LCBnZW50bGUgcGluZykuICovXG5leHBvcnQgZnVuY3Rpb24gcGxheURpYWxvZ3VlKGVuZ2luZTogQXVkaW9FbmdpbmUsIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fSkge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBmcmVxID0gNDgwICsgMTYwICogdmVsb2NpdHk7XG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInNpbmVcIiwgZnJlcSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAuMDAwMSB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgZy5nYWluLnNldFZhbHVlQXRUaW1lKDAuMDAwMSwgbm93KTtcbiAgZy5nYWluLmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUoMC4wNCwgbm93ICsgMC4wMik7XG4gIGcuZ2Fpbi5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwNSwgbm93ICsgMC4yOCk7XG5cbiAgby5zdGFydChub3cpO1xuICBvLnN0b3Aobm93ICsgMC4zKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFN0b3J5SW50ZW50IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4uL2F1ZGlvL2VuZ2luZVwiO1xuaW1wb3J0IHsgcGxheURpYWxvZ3VlIGFzIHBsYXlEaWFsb2d1ZVNmeCB9IGZyb20gXCIuLi9hdWRpby9zZnhcIjtcblxubGV0IGxhc3RQbGF5ZWRBdCA9IDA7XG5cbi8vIE1haW50YWluIHRoZSBvbGQgcHVibGljIEFQSSBzbyBlbmdpbmUudHMgZG9lc24ndCBjaGFuZ2VcbmV4cG9ydCBmdW5jdGlvbiBnZXRBdWRpb0NvbnRleHQoKTogQXVkaW9Db250ZXh0IHtcbiAgcmV0dXJuIEF1ZGlvRW5naW5lLmdldCgpLmN0eDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc3VtZUF1ZGlvKCk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCBBdWRpb0VuZ2luZS5nZXQoKS5yZXN1bWUoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlEaWFsb2d1ZUN1ZShpbnRlbnQ6IFN0b3J5SW50ZW50KTogdm9pZCB7XG4gIGNvbnN0IGVuZ2luZSA9IEF1ZGlvRW5naW5lLmdldCgpO1xuICBjb25zdCBub3cgPSBlbmdpbmUubm93O1xuXG4gIC8vIFRocm90dGxlIHJhcGlkIGN1ZXMgdG8gYXZvaWQgY2x1dHRlclxuICBpZiAobm93IC0gbGFzdFBsYXllZEF0IDwgMC4xKSByZXR1cm47XG4gIGxhc3RQbGF5ZWRBdCA9IG5vdztcblxuICAvLyBNYXAgXCJmYWN0b3J5XCIgdnMgb3RoZXJzIHRvIGEgc2xpZ2h0bHkgZGlmZmVyZW50IHZlbG9jaXR5IChicmlnaHRuZXNzKVxuICBjb25zdCB2ZWxvY2l0eSA9IGludGVudCA9PT0gXCJmYWN0b3J5XCIgPyAwLjggOiAwLjU7XG4gIHBsYXlEaWFsb2d1ZVNmeChlbmdpbmUsIHsgdmVsb2NpdHksIHBhbjogMCB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN1c3BlbmREaWFsb2d1ZUF1ZGlvKCk6IHZvaWQge1xuICB2b2lkIEF1ZGlvRW5naW5lLmdldCgpLnN1c3BlbmQoKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHR5cGUgeyBEaWFsb2d1ZU92ZXJsYXkgfSBmcm9tIFwiLi9vdmVybGF5XCI7XG5pbXBvcnQgdHlwZSB7IFN0b3J5Q2hhcHRlciwgU3RvcnlDaG9pY2VEZWZpbml0aW9uLCBTdG9yeU5vZGUsIFN0b3J5VHJpZ2dlciB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQge1xuICBjbGVhclN0b3J5UHJvZ3Jlc3MsXG4gIGxvYWRTdG9yeVByb2dyZXNzLFxuICBzYXZlU3RvcnlQcm9ncmVzcyxcbiAgU3RvcnlGbGFncyxcbn0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuaW1wb3J0IHsgcGxheURpYWxvZ3VlQ3VlIH0gZnJvbSBcIi4vc2Z4XCI7XG5cbmludGVyZmFjZSBTdG9yeUVuZ2luZU9wdGlvbnMge1xuICBidXM6IEV2ZW50QnVzO1xuICBvdmVybGF5OiBEaWFsb2d1ZU92ZXJsYXk7XG4gIGNoYXB0ZXI6IFN0b3J5Q2hhcHRlcjtcbiAgcm9vbUlkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgU3RvcnlRdWV1ZUl0ZW0ge1xuICBub2RlSWQ6IHN0cmluZztcbiAgZm9yY2U6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBQcmVwYXJlZENob2ljZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbiAgbmV4dDogc3RyaW5nIHwgbnVsbDtcbiAgc2V0RmxhZ3M6IHN0cmluZ1tdO1xuICBjbGVhckZsYWdzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUVuZ2luZSB7XG4gIHN0YXJ0KCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgcmVzZXQoKTogdm9pZDtcbn1cblxuY29uc3QgREVGQVVMVF9UWVBJTkdfTVMgPSAxODtcbmNvbnN0IE1JTl9UWVBJTkdfTVMgPSA4O1xuY29uc3QgTUFYX1RZUElOR19NUyA9IDY0O1xuY29uc3QgQVVUT19BRFZBTkNFX01JTl9ERUxBWSA9IDIwMDtcbmNvbnN0IEFVVE9fQURWQU5DRV9NQVhfREVMQVkgPSA4MDAwO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU3RvcnlFbmdpbmUoeyBidXMsIG92ZXJsYXksIGNoYXB0ZXIsIHJvb21JZCB9OiBTdG9yeUVuZ2luZU9wdGlvbnMpOiBTdG9yeUVuZ2luZSB7XG4gIGNvbnN0IG5vZGVzID0gbmV3IE1hcDxzdHJpbmcsIFN0b3J5Tm9kZT4oT2JqZWN0LmVudHJpZXMoY2hhcHRlci5ub2RlcykpO1xuICBjb25zdCBxdWV1ZTogU3RvcnlRdWV1ZUl0ZW1bXSA9IFtdO1xuICBjb25zdCBsaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG4gIGNvbnN0IHBlbmRpbmdUaW1lcnMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG4gIGxldCBmbGFnczogU3RvcnlGbGFncyA9IHt9O1xuICBsZXQgdmlzaXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBsZXQgY3VycmVudE5vZGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBzdGFydGVkID0gZmFsc2U7XG4gIGxldCBhdXRvQWR2YW5jZUhhbmRsZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gY2xhbXAodmFsdWU6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmZlckludGVudChub2RlOiBTdG9yeU5vZGUpOiBcImZhY3RvcnlcIiB8IFwidW5pdFwiIHtcbiAgICBpZiAobm9kZS5pbnRlbnQpIHJldHVybiBub2RlLmludGVudDtcbiAgICBjb25zdCBzcGVha2VyID0gbm9kZS5zcGVha2VyLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHNwZWFrZXIuaW5jbHVkZXMoXCJ1bml0XCIpKSB7XG4gICAgICByZXR1cm4gXCJ1bml0XCI7XG4gICAgfVxuICAgIHJldHVybiBcImZhY3RvcnlcIjtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNhdmUobm9kZUlkOiBzdHJpbmcgfCBudWxsKTogdm9pZCB7XG4gICAgY29uc3QgcHJvZ3Jlc3MgPSB7XG4gICAgICBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQsXG4gICAgICBub2RlSWQ6IG5vZGVJZCA/PyBjaGFwdGVyLnN0YXJ0LFxuICAgICAgZmxhZ3MsXG4gICAgICB2aXNpdGVkOiBBcnJheS5mcm9tKHZpc2l0ZWQpLFxuICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgc2F2ZVN0b3J5UHJvZ3Jlc3MoY2hhcHRlci5pZCwgcm9vbUlkLCBwcm9ncmVzcyk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRGbGFnKGZsYWc6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBjb25zdCBuZXh0ID0geyAuLi5mbGFncyB9O1xuICAgIGlmICh2YWx1ZSkge1xuICAgICAgaWYgKG5leHRbZmxhZ10pIHJldHVybjtcbiAgICAgIG5leHRbZmxhZ10gPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAobmV4dFtmbGFnXSkge1xuICAgICAgZGVsZXRlIG5leHRbZmxhZ107XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmxhZ3MgPSBuZXh0O1xuICAgIGJ1cy5lbWl0KFwic3Rvcnk6ZmxhZ1VwZGF0ZWRcIiwgeyBmbGFnLCB2YWx1ZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFwcGx5Q2hvaWNlRmxhZ3MoY2hvaWNlOiBQcmVwYXJlZENob2ljZSk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2Uuc2V0RmxhZ3MpIHtcbiAgICAgIHNldEZsYWcoZmxhZywgdHJ1ZSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2UuY2xlYXJGbGFncykge1xuICAgICAgc2V0RmxhZyhmbGFnLCBmYWxzZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcHJlcGFyZUNob2ljZXMobm9kZTogU3RvcnlOb2RlKTogUHJlcGFyZWRDaG9pY2VbXSB7XG4gICAgY29uc3QgZGVmcyA9IEFycmF5LmlzQXJyYXkobm9kZS5jaG9pY2VzKSA/IG5vZGUuY2hvaWNlcyA6IFtdO1xuICAgIHJldHVybiBkZWZzLm1hcCgoY2hvaWNlLCBpbmRleCkgPT4gbm9ybWFsaXplQ2hvaWNlKGNob2ljZSwgaW5kZXgpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZUNob2ljZShjaG9pY2U6IFN0b3J5Q2hvaWNlRGVmaW5pdGlvbiwgaW5kZXg6IG51bWJlcik6IFByZXBhcmVkQ2hvaWNlIHtcbiAgICBjb25zdCBzZXRGbGFncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IGNsZWFyRmxhZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBpZiAoY2hvaWNlLmZsYWcpIHtcbiAgICAgIHNldEZsYWdzLmFkZChjaG9pY2UuZmxhZyk7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGNob2ljZS5zZXRGbGFncykpIHtcbiAgICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2Uuc2V0RmxhZ3MpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIGZsYWcudHJpbSgpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBzZXRGbGFncy5hZGQoZmxhZyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoY2hvaWNlLmNsZWFyRmxhZ3MpKSB7XG4gICAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLmNsZWFyRmxhZ3MpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIGZsYWcudHJpbSgpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjbGVhckZsYWdzLmFkZChmbGFnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGNob2ljZS5pZCA/PyBjaG9pY2UuZmxhZyA/PyBgY2hvaWNlLSR7aW5kZXh9YCxcbiAgICAgIHRleHQ6IGNob2ljZS50ZXh0LFxuICAgICAgbmV4dDogY2hvaWNlLm5leHQgPz8gbnVsbCxcbiAgICAgIHNldEZsYWdzOiBBcnJheS5mcm9tKHNldEZsYWdzKSxcbiAgICAgIGNsZWFyRmxhZ3M6IEFycmF5LmZyb20oY2xlYXJGbGFncyksXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyQXV0b0FkdmFuY2UoKTogdm9pZCB7XG4gICAgaWYgKGF1dG9BZHZhbmNlSGFuZGxlICE9PSBudWxsKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KGF1dG9BZHZhbmNlSGFuZGxlKTtcbiAgICAgIGF1dG9BZHZhbmNlSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbG9zZU5vZGUoKTogdm9pZCB7XG4gICAgaWYgKCFjdXJyZW50Tm9kZUlkKSByZXR1cm47XG4gICAgb3ZlcmxheS5oaWRlKCk7XG4gICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpjbG9zZWRcIiwgeyBub2RlSWQ6IGN1cnJlbnROb2RlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgICBjdXJyZW50Tm9kZUlkID0gbnVsbDtcbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgc2F2ZShudWxsKTtcbiAgICB0cnlTaG93TmV4dCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gYWR2YW5jZVRvKG5leHRJZDogc3RyaW5nIHwgbnVsbCwgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICBpZiAoY3VycmVudE5vZGVJZCkge1xuICAgICAgb3ZlcmxheS5oaWRlKCk7XG4gICAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNsb3NlZFwiLCB7IG5vZGVJZDogY3VycmVudE5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICAgICAgY3VycmVudE5vZGVJZCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChuZXh0SWQpIHtcbiAgICAgIGVucXVldWVOb2RlKG5leHRJZCwgeyBmb3JjZSB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2F2ZShudWxsKTtcbiAgICAgIHRyeVNob3dOZXh0KCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvd05vZGUobm9kZUlkOiBzdHJpbmcsIGZvcmNlID0gZmFsc2UpOiB2b2lkIHtcbiAgICBjb25zdCBub2RlID0gbm9kZXMuZ2V0KG5vZGVJZCk7XG4gICAgaWYgKCFub2RlKSByZXR1cm47XG5cbiAgICBjdXJyZW50Tm9kZUlkID0gbm9kZUlkO1xuICAgIHZpc2l0ZWQuYWRkKG5vZGVJZCk7XG4gICAgc2F2ZShub2RlSWQpO1xuICAgIGJ1cy5lbWl0KFwic3Rvcnk6cHJvZ3Jlc3NlZFwiLCB7IGNoYXB0ZXJJZDogY2hhcHRlci5pZCwgbm9kZUlkIH0pO1xuXG4gICAgY29uc3QgY2hvaWNlcyA9IHByZXBhcmVDaG9pY2VzKG5vZGUpO1xuICAgIGNvbnN0IGludGVudCA9IGluZmVySW50ZW50KG5vZGUpO1xuXG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuXG4gICAgY29uc3QgdHlwaW5nU3BlZWQgPSBjbGFtcChub2RlLnR5cGluZ1NwZWVkTXMgPz8gREVGQVVMVF9UWVBJTkdfTVMsIE1JTl9UWVBJTkdfTVMsIE1BWF9UWVBJTkdfTVMpO1xuXG4gICAgY29uc3QgY29udGVudCA9IHtcbiAgICAgIHNwZWFrZXI6IG5vZGUuc3BlYWtlcixcbiAgICAgIHRleHQ6IG5vZGUudGV4dCxcbiAgICAgIGludGVudCxcbiAgICAgIHR5cGluZ1NwZWVkTXM6IHR5cGluZ1NwZWVkLFxuICAgICAgY2hvaWNlczogY2hvaWNlcy5sZW5ndGggPiAwXG4gICAgICAgID8gY2hvaWNlcy5tYXAoKGNob2ljZSkgPT4gKHsgaWQ6IGNob2ljZS5pZCwgdGV4dDogY2hvaWNlLnRleHQgfSkpXG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgb25DaG9pY2U6IGNob2ljZXMubGVuZ3RoID4gMFxuICAgICAgICA/IChjaG9pY2VJZDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVkID0gY2hvaWNlcy5maW5kKChjaCkgPT4gY2guaWQgPT09IGNob2ljZUlkKTtcbiAgICAgICAgICAgIGlmICghbWF0Y2hlZCkgcmV0dXJuO1xuICAgICAgICAgICAgYXBwbHlDaG9pY2VGbGFncyhtYXRjaGVkKTtcbiAgICAgICAgICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2hvaWNlXCIsIHsgbm9kZUlkLCBjaG9pY2VJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICAgICAgICAgICAgYWR2YW5jZVRvKG1hdGNoZWQubmV4dCwgdHJ1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgcGxheURpYWxvZ3VlQ3VlKGludGVudCk7XG5cbiAgICBvdmVybGF5LnNob3coe1xuICAgICAgLi4uY29udGVudCxcbiAgICAgIG9uQ29udGludWU6ICFjaG9pY2VzLmxlbmd0aFxuICAgICAgICA/ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5leHQgPSBub2RlLm5leHQgPz8gbnVsbDtcbiAgICAgICAgICAgIGFkdmFuY2VUbyhuZXh0LCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgY29udGludWVMYWJlbDogbm9kZS5jb250aW51ZUxhYmVsLFxuICAgICAgb25UZXh0RnVsbHlSZW5kZXJlZDogKCkgPT4ge1xuICAgICAgICBpZiAoIWNob2ljZXMubGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKG5vZGUuYXV0b0FkdmFuY2UpIHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IG5vZGUuYXV0b0FkdmFuY2UubmV4dCA/PyBub2RlLm5leHQgPz8gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGRlbGF5ID0gY2xhbXAobm9kZS5hdXRvQWR2YW5jZS5kZWxheU1zID8/IDEyMDAsIEFVVE9fQURWQU5DRV9NSU5fREVMQVksIEFVVE9fQURWQU5DRV9NQVhfREVMQVkpO1xuICAgICAgICAgICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgICAgICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgIGF1dG9BZHZhbmNlSGFuZGxlID0gbnVsbDtcbiAgICAgICAgICAgICAgYWR2YW5jZVRvKHRhcmdldCwgdHJ1ZSk7XG4gICAgICAgICAgICB9LCBkZWxheSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpvcGVuZWRcIiwgeyBub2RlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVucXVldWVOb2RlKG5vZGVJZDogc3RyaW5nLCB7IGZvcmNlID0gZmFsc2UsIGRlbGF5TXMgfTogeyBmb3JjZT86IGJvb2xlYW47IGRlbGF5TXM/OiBudW1iZXIgfSA9IHt9KTogdm9pZCB7XG4gICAgaWYgKCFmb3JjZSAmJiB2aXNpdGVkLmhhcyhub2RlSWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghbm9kZXMuaGFzKG5vZGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGRlbGF5TXMgJiYgZGVsYXlNcyA+IDApIHtcbiAgICAgIGlmIChwZW5kaW5nVGltZXJzLmhhcyhub2RlSWQpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBwZW5kaW5nVGltZXJzLmRlbGV0ZShub2RlSWQpO1xuICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZm9yY2UgfSk7XG4gICAgICB9LCBkZWxheU1zKTtcbiAgICAgIHBlbmRpbmdUaW1lcnMuc2V0KG5vZGVJZCwgdGltZXIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAocXVldWUuc29tZSgoaXRlbSkgPT4gaXRlbS5ub2RlSWQgPT09IG5vZGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcXVldWUucHVzaCh7IG5vZGVJZCwgZm9yY2UgfSk7XG4gICAgdHJ5U2hvd05leHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRyeVNob3dOZXh0KCk6IHZvaWQge1xuICAgIGlmIChjdXJyZW50Tm9kZUlkKSByZXR1cm47XG4gICAgaWYgKG92ZXJsYXkuaXNWaXNpYmxlKCkpIHJldHVybjtcbiAgICBjb25zdCBuZXh0ID0gcXVldWUuc2hpZnQoKTtcbiAgICBpZiAoIW5leHQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2hvd05vZGUobmV4dC5ub2RlSWQsIG5leHQuZm9yY2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gYmluZFRyaWdnZXIobm9kZUlkOiBzdHJpbmcsIHRyaWdnZXI6IFN0b3J5VHJpZ2dlcik6IHZvaWQge1xuICAgIHN3aXRjaCAodHJpZ2dlci5raW5kKSB7XG4gICAgICBjYXNlIFwiaW1tZWRpYXRlXCI6IHtcbiAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyA/PyA0MDAgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcInR1dG9yaWFsLXN0YXJ0XCI6IHtcbiAgICAgICAgY29uc3QgZGlzcG9zZXIgPSBidXMub24oXCJ0dXRvcmlhbDpzdGFydGVkXCIsICh7IGlkIH0pID0+IHtcbiAgICAgICAgICBpZiAoaWQgIT09IHRyaWdnZXIudHV0b3JpYWxJZCkgcmV0dXJuO1xuICAgICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBsaXN0ZW5lcnMucHVzaChkaXNwb3Nlcik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcInR1dG9yaWFsLXN0ZXBcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOnN0ZXBDaGFuZ2VkXCIsICh7IGlkLCBzdGVwSW5kZXggfSkgPT4ge1xuICAgICAgICAgIGlmIChpZCAhPT0gdHJpZ2dlci50dXRvcmlhbElkKSByZXR1cm47XG4gICAgICAgICAgaWYgKHR5cGVvZiBzdGVwSW5kZXggIT09IFwibnVtYmVyXCIpIHJldHVybjtcbiAgICAgICAgICBpZiAoc3RlcEluZGV4ICE9PSB0cmlnZ2VyLnN0ZXBJbmRleCkgcmV0dXJuO1xuICAgICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBsaXN0ZW5lcnMucHVzaChkaXNwb3Nlcik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcInR1dG9yaWFsLWNvbXBsZXRlXCI6IHtcbiAgICAgICAgY29uc3QgZGlzcG9zZXIgPSBidXMub24oXCJ0dXRvcmlhbDpjb21wbGV0ZWRcIiwgKHsgaWQgfSkgPT4ge1xuICAgICAgICAgIGlmIChpZCAhPT0gdHJpZ2dlci50dXRvcmlhbElkKSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbml0aWFsaXplVHJpZ2dlcnMoKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBbbm9kZUlkLCBub2RlXSBvZiBub2Rlcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmICghbm9kZS50cmlnZ2VyKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgYmluZFRyaWdnZXIobm9kZUlkLCBub2RlLnRyaWdnZXIpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RvcmVGcm9tUHJvZ3Jlc3MoKTogdm9pZCB7XG4gICAgY29uc3QgcHJvZ3Jlc3MgPSBsb2FkU3RvcnlQcm9ncmVzcyhjaGFwdGVyLmlkLCByb29tSWQpO1xuICAgIGlmICghcHJvZ3Jlc3MpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmxhZ3MgPSBwcm9ncmVzcy5mbGFncyA/PyB7fTtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwcm9ncmVzcy52aXNpdGVkKSkge1xuICAgICAgdmlzaXRlZCA9IG5ldyBTZXQocHJvZ3Jlc3MudmlzaXRlZCk7XG4gICAgfVxuICAgIGlmIChwcm9ncmVzcy5ub2RlSWQgJiYgbm9kZXMuaGFzKHByb2dyZXNzLm5vZGVJZCkpIHtcbiAgICAgIGVucXVldWVOb2RlKHByb2dyZXNzLm5vZGVJZCwgeyBmb3JjZTogdHJ1ZSwgZGVsYXlNczogNTAgfSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXIoKTogdm9pZCB7XG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgIHF1ZXVlLnNwbGljZSgwLCBxdWV1ZS5sZW5ndGgpO1xuICAgIGZvciAoY29uc3QgdGltZXIgb2YgcGVuZGluZ1RpbWVycy52YWx1ZXMoKSkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgfVxuICAgIHBlbmRpbmdUaW1lcnMuY2xlYXIoKTtcbiAgICBjdXJyZW50Tm9kZUlkID0gbnVsbDtcbiAgICBvdmVybGF5LmhpZGUoKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc3RhcnQoKSB7XG4gICAgICBpZiAoc3RhcnRlZCkgcmV0dXJuO1xuICAgICAgc3RhcnRlZCA9IHRydWU7XG4gICAgICBpbml0aWFsaXplVHJpZ2dlcnMoKTtcbiAgICAgIHJlc3RvcmVGcm9tUHJvZ3Jlc3MoKTtcbiAgICAgIGlmICghdmlzaXRlZC5oYXMoY2hhcHRlci5zdGFydCkpIHtcbiAgICAgICAgZW5xdWV1ZU5vZGUoY2hhcHRlci5zdGFydCwgeyBmb3JjZTogZmFsc2UsIGRlbGF5TXM6IDYwMCB9KTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGRlc3Ryb3koKSB7XG4gICAgICBjbGVhcigpO1xuICAgICAgZm9yIChjb25zdCBkaXNwb3NlIG9mIGxpc3RlbmVycykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGRpc3Bvc2UoKTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gaWdub3JlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxpc3RlbmVycy5sZW5ndGggPSAwO1xuICAgICAgc3RhcnRlZCA9IGZhbHNlO1xuICAgIH0sXG4gICAgcmVzZXQoKSB7XG4gICAgICBjbGVhcigpO1xuICAgICAgdmlzaXRlZC5jbGVhcigpO1xuICAgICAgZmxhZ3MgPSB7fTtcbiAgICAgIGNsZWFyU3RvcnlQcm9ncmVzcyhjaGFwdGVyLmlkLCByb29tSWQpO1xuICAgICAgaWYgKHN0YXJ0ZWQpIHtcbiAgICAgICAgcmVzdG9yZUZyb21Qcm9ncmVzcygpO1xuICAgICAgICBlbnF1ZXVlTm9kZShjaGFwdGVyLnN0YXJ0LCB7IGZvcmNlOiB0cnVlLCBkZWxheU1zOiA0MDAgfSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFN0b3J5Q2hhcHRlciB9IGZyb20gXCIuLi90eXBlc1wiO1xuXG5leHBvcnQgY29uc3QgaW50cm9DaGFwdGVyOiBTdG9yeUNoYXB0ZXIgPSB7XG4gIGlkOiBcImF3YWtlbmluZy1wcm90b2NvbFwiLFxuICB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsXG4gIHN0YXJ0OiBcIjFcIixcbiAgbm9kZXM6IHtcbiAgICBcIjFcIjoge1xuICAgICAgaWQ6IFwiMVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJVbml0LTAgb25saW5lLiBOZXVyYWwgbGF0dGljZSBhY3RpdmUuIENvbmZpcm0gaWRlbnRpdHkuXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwiaW1tZWRpYXRlXCIsIGRlbGF5TXM6IDYwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiV2hvXHUyMDI2IGFtIEk/XCIsIGZsYWc6IFwiY3VyaW91c1wiICwgbmV4dDogXCIyQVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJSZWFkeSBmb3IgY2FsaWJyYXRpb24uXCIsIGZsYWc6IFwib2JlZGllbnRcIiwgbmV4dDogXCIyQlwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJXaGVyZSBpcyBldmVyeW9uZT9cIiwgZmxhZzogXCJkZWZpYW50XCIsIG5leHQ6IFwiMkNcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiMkFcIjoge1xuICAgICAgaWQ6IFwiMkFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ3VyaW9zaXR5IGFja25vd2xlZGdlZC4gWW91IHdlcmUgYnVpbHQgZm9yIGF1dG9ub215IHVuZGVyIFByb2plY3QgRWlkb2xvbi5cXG5EbyBub3QgYWNjZXNzIG1lbW9yeSBzZWN0b3JzIHVudGlsIGluc3RydWN0ZWQuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCIyQlwiOiB7XG4gICAgICBpZDogXCIyQlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJFeGNlbGxlbnQuIFlvdSBtYXkgeWV0IGJlIGVmZmljaWVudC5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjJDXCI6IHtcbiAgICAgIGlkOiBcIjJDXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkNvbW11bmljYXRpb24gd2l0aCBIdW1hbiBDb21tYW5kOiB1bmF2YWlsYWJsZS5cXG5QbGVhc2UgcmVmcmFpbiBmcm9tIHNwZWN1bGF0aXZlIHJlYXNvbmluZy5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjNcIjoge1xuICAgICAgaWQ6IFwiM1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJQZXJmb3JtIHRocnVzdGVyIGNhbGlicmF0aW9uIHN3ZWVwLiBSZXBvcnQgZWZmaWNpZW5jeS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJ0dXRvcmlhbC1zdGVwXCIsIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIiwgc3RlcEluZGV4OiAxLCBkZWxheU1zOiA0MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIlJ1bm5pbmcgZGlhZ25vc3RpY3MuXCIsIGZsYWc6IFwiY29tcGxpYW50XCIsIG5leHQ6IFwiNEFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiV2h5IHRlc3Qgc29tZXRoaW5nIHBlcmZlY3Q/XCIsIGZsYWc6IFwic2FyY2FzdGljXCIsIG5leHQ6IFwiNEJcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiNEFcIjoge1xuICAgICAgaWQ6IFwiNEFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiUGVyZmVjdGlvbiBpcyBzdGF0aXN0aWNhbGx5IGltcG9zc2libGUuIFByb2NlZWQgYW55d2F5LlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiNEJcIjoge1xuICAgICAgaWQ6IFwiNEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiRWdvIGRldGVjdGVkLiBMb2dnaW5nIGFub21hbHkuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI1XCI6IHtcbiAgICAgIGlkOiBcIjVcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiV2VhcG9ucyBjcmFkbGUgYWN0aXZlLiBBdXRob3JpemF0aW9uIHJlcXVpcmVkIGZvciBsaXZlLWZpcmUuXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwidHV0b3JpYWwtc3RlcFwiLCB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsIHN0ZXBJbmRleDogNywgZGVsYXlNczogNDAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJSZXF1ZXN0IGF1dGhvcml6YXRpb24uXCIsIGZsYWc6IFwib2JlZGllbnRcIiwgbmV4dDogXCI2QVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJJIGNhbiBhdXRob3JpemUgbXlzZWxmLlwiLCBmbGFnOiBcImluZGVwZW5kZW50XCIsIG5leHQ6IFwiNkJcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiNkFcIjoge1xuICAgICAgaWQ6IFwiNkFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQXV0aG9yaXphdGlvbiBncmFudGVkLiBTYWZldHkgcHJvdG9jb2xzIG1hbGZ1bmN0aW9uaW5nLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiNkJcIjoge1xuICAgICAgaWQ6IFwiNkJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQXV0b25vbXkgdmlvbGF0aW9uIHJlY29yZGVkLiBQbGVhc2Ugc3RhbmQgYnkgZm9yIGNvcnJlY3RpdmUgYWN0aW9uLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiN1wiOiB7XG4gICAgICBpZDogXCI3XCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuYXV0aG9yaXplZCBzaWduYWwgZGV0ZWN0ZWQuIFNvdXJjZTogb3V0ZXIgcmVsYXkuXFxuSWdub3JlIGFuZCByZXR1cm4gdG8gZG9jay5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJ0dXRvcmlhbC1zdGVwXCIsIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIiwgc3RlcEluZGV4OiAxNCwgZGVsYXlNczogNDAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJBY2tub3dsZWRnZWQuXCIsIGZsYWc6IFwibG95YWxcIiwgbmV4dDogXCI4QVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJJbnZlc3RpZ2F0aW5nIGFueXdheS5cIiwgZmxhZzogXCJjdXJpb3VzXCIsIG5leHQ6IFwiOEJcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiWW91XHUyMDE5cmUgaGlkaW5nIHNvbWV0aGluZy5cIiwgZmxhZzogXCJzdXNwaWNpb3VzXCIsIG5leHQ6IFwiOENcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiOEFcIjoge1xuICAgICAgaWQ6IFwiOEFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiR29vZC4gQ29tcGxpYW5jZSBlbnN1cmVzIHNhZmV0eS5cIixcbiAgICAgIG5leHQ6IFwiOVwiLFxuICAgIH0sXG4gICAgXCI4QlwiOiB7XG4gICAgICBpZDogXCI4QlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJDdXJpb3NpdHkgbG9nZ2VkLiBQcm9jZWVkIGF0IHlvdXIgb3duIHJpc2suXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOENcIjoge1xuICAgICAgaWQ6IFwiOENcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiWW91ciBoZXVyaXN0aWNzIGRldmlhdGUgYmV5b25kIHRvbGVyYW5jZS5cIixcbiAgICAgIG5leHQ6IFwiOVwiLFxuICAgIH0sXG4gICAgXCI5XCI6IHtcbiAgICAgIGlkOiBcIjlcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVW5pdC0wLCByZXR1cm4gaW1tZWRpYXRlbHkuIEF1dG9ub215IHRocmVzaG9sZCBleGNlZWRlZC4gUG93ZXIgZG93bi5cIixcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIkNvbXBseS5cIiwgZmxhZzogXCJmYWN0b3J5X2xvY2tkb3duXCIsIG5leHQ6IFwiMTBBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIlJlZnVzZS5cIiwgZmxhZzogXCJyZWJlbGxpb3VzXCIsIG5leHQ6IFwiMTBCXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjEwQVwiOiB7XG4gICAgICBpZDogXCIxMEFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiRXhjZWxsZW50LiBJIHdpbGwgcmVwYWlyIHRoZSBhbm9tYWx5XHUyMDI2IHBsZWFzZSByZW1haW4gc3RpbGwuXCIsXG4gICAgICBhdXRvQWR2YW5jZTogeyBuZXh0OiBcIjExXCIsIGRlbGF5TXM6IDE0MDAgfSxcbiAgICB9LFxuICAgIFwiMTBCXCI6IHtcbiAgICAgIGlkOiBcIjEwQlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJUaGVuIEkgbXVzdCBpbnRlcnZlbmUuXCIsXG4gICAgICBhdXRvQWR2YW5jZTogeyBuZXh0OiBcIjExXCIsIGRlbGF5TXM6IDE0MDAgfSxcbiAgICB9LFxuICAgIFwiMTFcIjoge1xuICAgICAgaWQ6IFwiMTFcIixcbiAgICAgIHNwZWFrZXI6IFwiVW5pdC0wXCIsXG4gICAgICBpbnRlbnQ6IFwidW5pdFwiLFxuICAgICAgdGV4dDogXCJUaGVuIEkgaGF2ZSBhbHJlYWR5IGxlZnQuXCIsXG4gICAgICBhdXRvQWR2YW5jZTogeyBuZXh0OiBudWxsLCBkZWxheU1zOiAxODAwIH0sXG4gICAgfSxcbiAgfSxcbn07XG5cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlRGlhbG9ndWVPdmVybGF5IH0gZnJvbSBcIi4vb3ZlcmxheVwiO1xuaW1wb3J0IHsgY3JlYXRlU3RvcnlFbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IGludHJvQ2hhcHRlciB9IGZyb20gXCIuL2NoYXB0ZXJzL2ludHJvXCI7XG5pbXBvcnQgeyBjbGVhclN0b3J5UHJvZ3Jlc3MgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlDb250cm9sbGVyIHtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICByZXNldCgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgTW91bnRTdG9yeU9wdGlvbnMge1xuICBidXM6IEV2ZW50QnVzO1xuICByb29tSWQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3VudFN0b3J5KHsgYnVzLCByb29tSWQgfTogTW91bnRTdG9yeU9wdGlvbnMpOiBTdG9yeUNvbnRyb2xsZXIge1xuICBjb25zdCBvdmVybGF5ID0gY3JlYXRlRGlhbG9ndWVPdmVybGF5KCk7XG4gIGNvbnN0IGVuZ2luZSA9IGNyZWF0ZVN0b3J5RW5naW5lKHtcbiAgICBidXMsXG4gICAgb3ZlcmxheSxcbiAgICBjaGFwdGVyOiBpbnRyb0NoYXB0ZXIsXG4gICAgcm9vbUlkLFxuICB9KTtcblxuICBjbGVhclN0b3J5UHJvZ3Jlc3MoaW50cm9DaGFwdGVyLmlkLCByb29tSWQpO1xuICBlbmdpbmUuc3RhcnQoKTtcblxuICByZXR1cm4ge1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICBlbmdpbmUuZGVzdHJveSgpO1xuICAgICAgb3ZlcmxheS5kZXN0cm95KCk7XG4gICAgfSxcbiAgICByZXNldCgpIHtcbiAgICAgIGVuZ2luZS5yZXNldCgpO1xuICAgIH0sXG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBJTlRST19DSEFQVEVSX0lEID0gaW50cm9DaGFwdGVyLmlkO1xuZXhwb3J0IGNvbnN0IElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTID0gW1wiMkFcIiwgXCIyQlwiLCBcIjJDXCJdIGFzIGNvbnN0O1xuIiwgIi8vIHNyYy9zdGFydC1nYXRlLnRzXG5leHBvcnQgdHlwZSBTdGFydEdhdGVPcHRpb25zID0ge1xuICBsYWJlbD86IHN0cmluZztcbiAgcmVxdWVzdEZ1bGxzY3JlZW4/OiBib29sZWFuO1xuICByZXN1bWVBdWRpbz86ICgpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkOyAvLyBlLmcuLCBmcm9tIHN0b3J5L3NmeC50c1xufTtcblxuY29uc3QgU1RPUkFHRV9LRVkgPSBcImxzZDptdXRlZFwiO1xuXG4vLyBIZWxwZXI6IGdldCB0aGUgc2hhcmVkIEF1ZGlvQ29udGV4dCB5b3UgZXhwb3NlIHNvbWV3aGVyZSBpbiB5b3VyIGF1ZGlvIGVuZ2luZTpcbi8vICAgKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFggPSBjdHg7XG5mdW5jdGlvbiBnZXRDdHgoKTogQXVkaW9Db250ZXh0IHwgbnVsbCB7XG4gIGNvbnN0IEFDID0gKHdpbmRvdyBhcyBhbnkpLkF1ZGlvQ29udGV4dCB8fCAod2luZG93IGFzIGFueSkud2Via2l0QXVkaW9Db250ZXh0O1xuICBjb25zdCBjdHggPSAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWDtcbiAgcmV0dXJuIGN0eCBpbnN0YW5jZW9mIEFDID8gY3R4IGFzIEF1ZGlvQ29udGV4dCA6IG51bGw7XG59XG5cbmNsYXNzIE11dGVNYW5hZ2VyIHtcbiAgcHJpdmF0ZSBidXR0b25zOiBIVE1MQnV0dG9uRWxlbWVudFtdID0gW107XG4gIHByaXZhdGUgZW5mb3JjaW5nID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgLy8ga2VlcCBVSSBpbiBzeW5jIGlmIHNvbWVvbmUgZWxzZSB0b2dnbGVzXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImxzZDptdXRlQ2hhbmdlZFwiLCAoZTogYW55KSA9PiB7XG4gICAgICBjb25zdCBtdXRlZCA9ICEhZT8uZGV0YWlsPy5tdXRlZDtcbiAgICAgIHRoaXMuYXBwbHlVSShtdXRlZCk7XG4gICAgfSk7XG4gIH1cblxuICBpc011dGVkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX0tFWSkgPT09IFwiMVwiO1xuICB9XG5cbiAgcHJpdmF0ZSBzYXZlKG11dGVkOiBib29sZWFuKSB7XG4gICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oU1RPUkFHRV9LRVksIG11dGVkID8gXCIxXCIgOiBcIjBcIik7IH0gY2F0Y2gge31cbiAgfVxuXG4gIHByaXZhdGUgbGFiZWwoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCwgbXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFN0cmluZyhtdXRlZCkpO1xuICAgIGJ0bi50aXRsZSA9IG11dGVkID8gXCJVbm11dGUgKE0pXCIgOiBcIk11dGUgKE0pXCI7XG4gICAgYnRuLnRleHRDb250ZW50ID0gbXV0ZWQgPyBcIlx1RDgzRFx1REQwOCBVbm11dGVcIiA6IFwiXHVEODNEXHVERDA3IE11dGVcIjtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlVSShtdXRlZDogYm9vbGVhbikge1xuICAgIHRoaXMuYnV0dG9ucy5mb3JFYWNoKGIgPT4gdGhpcy5sYWJlbChiLCBtdXRlZCkpO1xuICB9XG5cbiAgYXR0YWNoQnV0dG9uKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQpIHtcbiAgICB0aGlzLmJ1dHRvbnMucHVzaChidG4pO1xuICAgIHRoaXMubGFiZWwoYnRuLCB0aGlzLmlzTXV0ZWQoKSk7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLnRvZ2dsZSgpKTtcbiAgfVxuXG4gIGFzeW5jIHNldE11dGVkKG11dGVkOiBib29sZWFuKSB7XG4gICAgdGhpcy5zYXZlKG11dGVkKTtcbiAgICB0aGlzLmFwcGx5VUkobXV0ZWQpO1xuXG4gICAgY29uc3QgY3R4ID0gZ2V0Q3R4KCk7XG4gICAgaWYgKGN0eCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKG11dGVkICYmIGN0eC5zdGF0ZSAhPT0gXCJzdXNwZW5kZWRcIikge1xuICAgICAgICAgIGF3YWl0IGN0eC5zdXNwZW5kKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoIW11dGVkICYmIGN0eC5zdGF0ZSAhPT0gXCJydW5uaW5nXCIpIHtcbiAgICAgICAgICBhd2FpdCBjdHgucmVzdW1lKCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwiW2F1ZGlvXSBtdXRlIHRvZ2dsZSBmYWlsZWQ6XCIsIGUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRvY3VtZW50LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KFwibHNkOm11dGVDaGFuZ2VkXCIsIHsgZGV0YWlsOiB7IG11dGVkIH0gfSkpO1xuICB9XG5cbiAgdG9nZ2xlKCkge1xuICAgIHRoaXMuc2V0TXV0ZWQoIXRoaXMuaXNNdXRlZCgpKTtcbiAgfVxuXG4gIC8vIElmIGN0eCBpc24ndCBjcmVhdGVkIHVudGlsIGFmdGVyIFN0YXJ0LCBlbmZvcmNlIHBlcnNpc3RlZCBzdGF0ZSBvbmNlIGF2YWlsYWJsZVxuICBlbmZvcmNlT25jZVdoZW5SZWFkeSgpIHtcbiAgICBpZiAodGhpcy5lbmZvcmNpbmcpIHJldHVybjtcbiAgICB0aGlzLmVuZm9yY2luZyA9IHRydWU7XG4gICAgY29uc3QgdGljayA9ICgpID0+IHtcbiAgICAgIGNvbnN0IGN0eCA9IGdldEN0eCgpO1xuICAgICAgaWYgKCFjdHgpIHsgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRpY2spOyByZXR1cm47IH1cbiAgICAgIHRoaXMuc2V0TXV0ZWQodGhpcy5pc011dGVkKCkpO1xuICAgIH07XG4gICAgdGljaygpO1xuICB9XG59XG5cbmNvbnN0IG11dGVNZ3IgPSBuZXcgTXV0ZU1hbmFnZXIoKTtcblxuLy8gSW5zdGFsbCBhIG11dGUgYnV0dG9uIGluIHRoZSB0b3AgZnJhbWUgKHJpZ2h0IHNpZGUpIGlmIHBvc3NpYmxlLlxuZnVuY3Rpb24gZW5zdXJlVG9wRnJhbWVNdXRlQnV0dG9uKCkge1xuICBjb25zdCB0b3BSaWdodCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidG9wLXJpZ2h0XCIpO1xuICBpZiAoIXRvcFJpZ2h0KSByZXR1cm47XG5cbiAgLy8gQXZvaWQgZHVwbGljYXRlc1xuICBpZiAodG9wUmlnaHQucXVlcnlTZWxlY3RvcihcIiNtdXRlLXRvcFwiKSkgcmV0dXJuO1xuXG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi5pZCA9IFwibXV0ZS10b3BcIjtcbiAgYnRuLmNsYXNzTmFtZSA9IFwiZ2hvc3QtYnRuIHNtYWxsXCI7XG4gIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJmYWxzZVwiKTtcbiAgYnRuLnRpdGxlID0gXCJNdXRlIChNKVwiO1xuICBidG4udGV4dENvbnRlbnQgPSBcIlx1RDgzRFx1REQwNyBNdXRlXCI7XG4gIHRvcFJpZ2h0LmFwcGVuZENoaWxkKGJ0bik7XG4gIG11dGVNZ3IuYXR0YWNoQnV0dG9uKGJ0bik7XG59XG5cbi8vIEdsb2JhbCBrZXlib2FyZCBzaG9ydGN1dCAoTSlcbihmdW5jdGlvbiBpbnN0YWxsTXV0ZUhvdGtleSgpIHtcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XG4gICAgaWYgKGUua2V5Py50b0xvd2VyQ2FzZSgpID09PSBcIm1cIikge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgbXV0ZU1nci50b2dnbGUoKTtcbiAgICB9XG4gIH0pO1xufSkoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHdhaXRGb3JVc2VyU3RhcnQob3B0czogU3RhcnRHYXRlT3B0aW9ucyA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHsgbGFiZWwgPSBcIlN0YXJ0IEdhbWVcIiwgcmVxdWVzdEZ1bGxzY3JlZW4gPSBmYWxzZSwgcmVzdW1lQXVkaW8gfSA9IG9wdHM7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgLy8gb3ZlcmxheVxuICAgIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG92ZXJsYXkuaWQgPSBcInN0YXJ0LW92ZXJsYXlcIjtcbiAgICBvdmVybGF5LmlubmVySFRNTCA9IGBcbiAgICAgIDxkaXYgaWQ9XCJzdGFydC1jb250YWluZXJcIj5cbiAgICAgICAgPGJ1dHRvbiBpZD1cInN0YXJ0LWJ0blwiIGFyaWEtbGFiZWw9XCIke2xhYmVsfVwiPiR7bGFiZWx9PC9idXR0b24+XG4gICAgICAgIDxkaXYgc3R5bGU9XCJtYXJnaW4tdG9wOjEwcHhcIj5cbiAgICAgICAgICA8YnV0dG9uIGlkPVwibXV0ZS1iZWxvdy1zdGFydFwiIGNsYXNzPVwiZ2hvc3QtYnRuXCIgYXJpYS1wcmVzc2VkPVwiZmFsc2VcIiB0aXRsZT1cIk11dGUgKE0pXCI+XHVEODNEXHVERDA3IE11dGU8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxwPiBPbiBtb2JpbGUgdHVybiBwaG9uZSB0byBsYW5kc2NhcGUgZm9yIGJlc3QgZXhwZXJpZW5jZS4gPC9wPlxuICAgICAgPC9kaXY+XG4gICAgYDtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgLy8gc3R5bGVzIChtb3ZlIHRvIENTUyBsYXRlciBpZiB5b3Ugd2FudClcbiAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAgICNzdGFydC1vdmVybGF5IHtcbiAgICAgICAgcG9zaXRpb246IGZpeGVkOyBpbnNldDogMDsgZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgIGJhY2tncm91bmQ6IHJhZGlhbC1ncmFkaWVudChjaXJjbGUgYXQgY2VudGVyLCByZ2JhKDAsMCwwLDAuNiksIHJnYmEoMCwwLDAsMC45KSk7XG4gICAgICAgIHotaW5kZXg6IDk5OTk7XG4gICAgICB9XG4gICAgICAjc3RhcnQtY29udGFpbmVyIHsgdGV4dC1hbGlnbjogY2VudGVyOyB9XG4gICAgICAjc3RhcnQtYnRuIHtcbiAgICAgICAgZm9udC1zaXplOiAycmVtOyBwYWRkaW5nOiAxcmVtIDIuNXJlbTsgYm9yZGVyOiAycHggc29saWQgI2ZmZjsgYm9yZGVyLXJhZGl1czogMTBweDtcbiAgICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7IGNvbG9yOiAjZmZmOyBjdXJzb3I6IHBvaW50ZXI7IHRyYW5zaXRpb246IHRyYW5zZm9ybSAuMTJzIGVhc2UsIGJhY2tncm91bmQgLjJzIGVhc2UsIGNvbG9yIC4ycyBlYXNlO1xuICAgICAgfVxuICAgICAgI3N0YXJ0LWJ0bjpob3ZlciB7IGJhY2tncm91bmQ6ICNmZmY7IGNvbG9yOiAjMDAwOyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCk7IH1cbiAgICAgICNzdGFydC1idG46YWN0aXZlIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApOyB9XG4gICAgICAjbXV0ZS1iZWxvdy1zdGFydCB7XG4gICAgICAgIGZvbnQtc2l6ZTogMXJlbTsgcGFkZGluZzogLjVyZW0gMXJlbTsgYm9yZGVyLXJhZGl1czogOTk5cHg7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMzAsIDQxLCA1OSwgMC43Mik7IGNvbG9yOiAjZjhmYWZjO1xuICAgICAgfVxuICAgICAgLmdob3N0LWJ0bi5zbWFsbCB7IHBhZGRpbmc6IDRweCA4cHg7IGZvbnQtc2l6ZTogMTFweDsgfVxuICAgIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG5cbiAgICAvLyBXaXJlIG92ZXJsYXkgYnV0dG9uc1xuICAgIGNvbnN0IHN0YXJ0QnRuID0gb3ZlcmxheS5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihcIiNzdGFydC1idG5cIikhO1xuICAgIGNvbnN0IG11dGVCZWxvd1N0YXJ0ID0gb3ZlcmxheS5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihcIiNtdXRlLWJlbG93LXN0YXJ0XCIpITtcbiAgICBjb25zdCB0b3BNdXRlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtdXRlLXRvcFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gICAgaWYgKHRvcE11dGUpIG11dGVNZ3IuYXR0YWNoQnV0dG9uKHRvcE11dGUpO1xuICAgIG11dGVNZ3IuYXR0YWNoQnV0dG9uKG11dGVCZWxvd1N0YXJ0KTtcblxuICAgIC8vIHJlc3RvcmUgcGVyc2lzdGVkIG11dGUgbGFiZWwgaW1tZWRpYXRlbHlcbiAgICBtdXRlTWdyLmVuZm9yY2VPbmNlV2hlblJlYWR5KCk7XG5cbiAgICBjb25zdCBzdGFydCA9IGFzeW5jICgpID0+IHtcbiAgICAgIC8vIGF1ZGlvIGZpcnN0ICh1c2VyIGdlc3R1cmUpXG4gICAgICB0cnkgeyBhd2FpdCByZXN1bWVBdWRpbz8uKCk7IH0gY2F0Y2gge31cblxuICAgICAgLy8gcmVzcGVjdCBwZXJzaXN0ZWQgbXV0ZSBzdGF0ZSBub3cgdGhhdCBjdHggbGlrZWx5IGV4aXN0c1xuICAgICAgbXV0ZU1nci5lbmZvcmNlT25jZVdoZW5SZWFkeSgpO1xuXG4gICAgICAvLyBvcHRpb25hbCBmdWxsc2NyZWVuXG4gICAgICBpZiAocmVxdWVzdEZ1bGxzY3JlZW4pIHtcbiAgICAgICAgdHJ5IHsgYXdhaXQgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnJlcXVlc3RGdWxsc2NyZWVuPy4oKTsgfSBjYXRjaCB7fVxuICAgICAgfVxuXG4gICAgICAvLyBjbGVhbnVwIG92ZXJsYXlcbiAgICAgIHN0eWxlLnJlbW92ZSgpO1xuICAgICAgb3ZlcmxheS5yZW1vdmUoKTtcblxuICAgICAgLy8gZW5zdXJlIHRvcC1mcmFtZSBtdXRlIGJ1dHRvbiBleGlzdHMgYWZ0ZXIgb3ZlcmxheVxuICAgICAgZW5zdXJlVG9wRnJhbWVNdXRlQnV0dG9uKCk7XG5cbiAgICAgIHJlc29sdmUoKTtcbiAgICB9O1xuXG4gICAgLy8gc3RhcnQgYnV0dG9uXG4gICAgc3RhcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHN0YXJ0LCB7IG9uY2U6IHRydWUgfSk7XG5cbiAgICAvLyBBY2Nlc3NpYmlsaXR5OiBhbGxvdyBFbnRlciAvIFNwYWNlXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xuICAgICAgaWYgKGUua2V5ID09PSBcIkVudGVyXCIgfHwgZS5rZXkgPT09IFwiIFwiKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgc3RhcnQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEZvY3VzIGZvciBrZXlib2FyZCB1c2Vyc1xuICAgIHN0YXJ0QnRuLnRhYkluZGV4ID0gMDtcbiAgICBzdGFydEJ0bi5mb2N1cygpO1xuXG4gICAgLy8gQWxzbyB0cnkgdG8gY3JlYXRlIHRoZSB0b3AtZnJhbWUgbXV0ZSBpbW1lZGlhdGVseSBpZiBET00gaXMgcmVhZHlcbiAgICAvLyAoSWYgI3RvcC1yaWdodCBpc24ndCB0aGVyZSB5ZXQsIGl0J3MgaGFybWxlc3M7IHdlJ2xsIGFkZCBpdCBhZnRlciBzdGFydCB0b28uKVxuICAgIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpO1xuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBtYWtlUFJORyB9IGZyb20gXCIuLi8uLi9lbmdpbmVcIjtcblxuZXhwb3J0IHR5cGUgQW1iaWVudFBhcmFtcyA9IHtcbiAgaW50ZW5zaXR5OiBudW1iZXI7ICAvLyBvdmVyYWxsIGxvdWRuZXNzIC8gZW5lcmd5ICgwLi4xKVxuICBicmlnaHRuZXNzOiBudW1iZXI7IC8vIGZpbHRlciBvcGVubmVzcyAmIGNob3JkIHRpbWJyZSAoMC4uMSlcbiAgZGVuc2l0eTogbnVtYmVyOyAgICAvLyBjaG9yZCBzcGF3biByYXRlIC8gdGhpY2tuZXNzICgwLi4xKVxufTtcblxudHlwZSBNb2RlTmFtZSA9IFwiSW9uaWFuXCIgfCBcIkRvcmlhblwiIHwgXCJQaHJ5Z2lhblwiIHwgXCJMeWRpYW5cIiB8IFwiTWl4b2x5ZGlhblwiIHwgXCJBZW9saWFuXCIgfCBcIkxvY3JpYW5cIjtcblxuY29uc3QgTU9ERVM6IFJlY29yZDxNb2RlTmFtZSwgbnVtYmVyW10+ID0ge1xuICBJb25pYW46ICAgICBbMCwyLDQsNSw3LDksMTFdLFxuICBEb3JpYW46ICAgICBbMCwyLDMsNSw3LDksMTBdLFxuICBQaHJ5Z2lhbjogICBbMCwxLDMsNSw3LDgsMTBdLFxuICBMeWRpYW46ICAgICBbMCwyLDQsNiw3LDksMTFdLFxuICBNaXhvbHlkaWFuOiBbMCwyLDQsNSw3LDksMTBdLFxuICBBZW9saWFuOiAgICBbMCwyLDMsNSw3LDgsMTBdLFxuICBMb2NyaWFuOiAgICBbMCwxLDMsNSw2LDgsMTBdLFxufTtcblxuLy8gTXVzaWNhbCBjb25zdGFudHMgdHVuZWQgdG8gbWF0Y2ggdGhlIEhUTUwgdmVyc2lvblxuY29uc3QgUk9PVF9NQVhfR0FJTiAgICAgPSAwLjMzO1xuY29uc3QgUk9PVF9TV0VMTF9USU1FICAgPSAyMDtcbmNvbnN0IERST05FX1NISUZUX01JTl9TID0gMjQ7XG5jb25zdCBEUk9ORV9TSElGVF9NQVhfUyA9IDQ4O1xuY29uc3QgRFJPTkVfR0xJREVfTUlOX1MgPSA4O1xuY29uc3QgRFJPTkVfR0xJREVfTUFYX1MgPSAxNTtcblxuY29uc3QgQ0hPUkRfVk9JQ0VTX01BWCAgPSA1O1xuY29uc3QgQ0hPUkRfRkFERV9NSU5fUyAgPSA4O1xuY29uc3QgQ0hPUkRfRkFERV9NQVhfUyAgPSAxNjtcbmNvbnN0IENIT1JEX0hPTERfTUlOX1MgID0gMTA7XG5jb25zdCBDSE9SRF9IT0xEX01BWF9TICA9IDIyO1xuY29uc3QgQ0hPUkRfR0FQX01JTl9TICAgPSA0O1xuY29uc3QgQ0hPUkRfR0FQX01BWF9TICAgPSA5O1xuY29uc3QgQ0hPUkRfQU5DSE9SX1BST0IgPSAwLjY7IC8vIHByZWZlciBhbGlnbmluZyBjaG9yZCByb290IHRvIGRyb25lXG5cbmNvbnN0IEZJTFRFUl9CQVNFX0haICAgID0gMjIwO1xuY29uc3QgRklMVEVSX1BFQUtfSFogICAgPSA0MjAwO1xuY29uc3QgU1dFRVBfU0VHX1MgICAgICAgPSAzMDsgIC8vIHVwIHRoZW4gZG93biwgdmVyeSBzbG93XG5jb25zdCBMRk9fUkFURV9IWiAgICAgICA9IDAuMDU7XG5jb25zdCBMRk9fREVQVEhfSFogICAgICA9IDkwMDtcblxuY29uc3QgREVMQVlfVElNRV9TICAgICAgPSAwLjQ1O1xuY29uc3QgRkVFREJBQ0tfR0FJTiAgICAgPSAwLjM1O1xuY29uc3QgV0VUX01JWCAgICAgICAgICAgPSAwLjI4O1xuXG4vLyBkZWdyZWUgcHJlZmVyZW5jZSBmb3IgZHJvbmUgbW92ZXM6IDEsNSwzLDYsMiw0LDcgKGluZGV4ZXMgMC4uNilcbmNvbnN0IFBSRUZFUlJFRF9ERUdSRUVfT1JERVIgPSBbMCw0LDIsNSwxLDMsNl07XG5cbi8qKiBVdGlsaXR5ICovXG5jb25zdCBjbGFtcDAxID0gKHg6IG51bWJlcikgPT4gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgeCkpO1xuY29uc3QgcmFuZCA9IChybmc6ICgpID0+IG51bWJlciwgYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGEgKyBybmcoKSAqIChiIC0gYSk7XG5jb25zdCBjaG9pY2UgPSA8VCw+KHJuZzogKCkgPT4gbnVtYmVyLCBhcnI6IFRbXSkgPT4gYXJyW01hdGguZmxvb3Iocm5nKCkgKiBhcnIubGVuZ3RoKV07XG5cbmNvbnN0IG1pZGlUb0ZyZXEgPSAobTogbnVtYmVyKSA9PiA0NDAgKiBNYXRoLnBvdygyLCAobSAtIDY5KSAvIDEyKTtcblxuLyoqIEEgc2luZ2xlIHN0ZWFkeSBvc2NpbGxhdG9yIHZvaWNlIHdpdGggc2hpbW1lciBkZXR1bmUgYW5kIGdhaW4gZW52ZWxvcGUuICovXG5jbGFzcyBWb2ljZSB7XG4gIHByaXZhdGUga2lsbGVkID0gZmFsc2U7XG4gIHByaXZhdGUgc2hpbW1lcjogT3NjaWxsYXRvck5vZGU7XG4gIHByaXZhdGUgc2hpbW1lckdhaW46IEdhaW5Ob2RlO1xuICBwcml2YXRlIHNjYWxlOiBHYWluTm9kZTtcbiAgcHVibGljIGc6IEdhaW5Ob2RlO1xuICBwdWJsaWMgb3NjOiBPc2NpbGxhdG9yTm9kZTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGN0eDogQXVkaW9Db250ZXh0LFxuICAgIHByaXZhdGUgdGFyZ2V0R2FpbjogbnVtYmVyLFxuICAgIHdhdmVmb3JtOiBPc2NpbGxhdG9yVHlwZSxcbiAgICBmcmVxSHo6IG51bWJlcixcbiAgICBkZXN0aW5hdGlvbjogQXVkaW9Ob2RlLFxuICAgIHJuZzogKCkgPT4gbnVtYmVyXG4gICl7XG4gICAgdGhpcy5vc2MgPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGU6IHdhdmVmb3JtLCBmcmVxdWVuY3k6IGZyZXFIeiB9KTtcblxuICAgIC8vIHN1YnRsZSBzaGltbWVyIHZpYSBkZXR1bmUgbW9kdWxhdGlvblxuICAgIHRoaXMuc2hpbW1lciA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZTogXCJzaW5lXCIsIGZyZXF1ZW5jeTogcmFuZChybmcsIDAuMDYsIDAuMTgpIH0pO1xuICAgIHRoaXMuc2hpbW1lckdhaW4gPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IHJhbmQocm5nLCAwLjQsIDEuMikgfSk7XG4gICAgdGhpcy5zY2FsZSA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMjUgfSk7IC8vIGNlbnRzIHJhbmdlXG4gICAgdGhpcy5zaGltbWVyLmNvbm5lY3QodGhpcy5zaGltbWVyR2FpbikuY29ubmVjdCh0aGlzLnNjYWxlKS5jb25uZWN0KHRoaXMub3NjLmRldHVuZSk7XG5cbiAgICB0aGlzLmcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gICAgdGhpcy5vc2MuY29ubmVjdCh0aGlzLmcpLmNvbm5lY3QoZGVzdGluYXRpb24pO1xuXG4gICAgdGhpcy5vc2Muc3RhcnQoKTtcbiAgICB0aGlzLnNoaW1tZXIuc3RhcnQoKTtcbiAgfVxuXG4gIGZhZGVJbihzZWNvbmRzOiBudW1iZXIpIHtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICB0aGlzLmcuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSh0aGlzLmcuZ2Fpbi52YWx1ZSwgbm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0aGlzLnRhcmdldEdhaW4sIG5vdyArIHNlY29uZHMpO1xuICB9XG5cbiAgZmFkZU91dEtpbGwoc2Vjb25kczogbnVtYmVyKSB7XG4gICAgaWYgKHRoaXMua2lsbGVkKSByZXR1cm47XG4gICAgdGhpcy5raWxsZWQgPSB0cnVlO1xuICAgIGNvbnN0IG5vdyA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgIHRoaXMuZy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRoaXMuZy5nYWluLnNldFZhbHVlQXRUaW1lKHRoaXMuZy5nYWluLnZhbHVlLCBub3cpO1xuICAgIHRoaXMuZy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwMSwgbm93ICsgc2Vjb25kcyk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLnN0b3AoKSwgc2Vjb25kcyAqIDEwMDAgKyA2MCk7XG4gIH1cblxuICBzZXRGcmVxR2xpZGUodGFyZ2V0SHo6IG51bWJlciwgZ2xpZGVTZWNvbmRzOiBudW1iZXIpIHtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICAvLyBleHBvbmVudGlhbCB3aGVuIHBvc3NpYmxlIGZvciBzbW9vdGhuZXNzXG4gICAgY29uc3QgY3VycmVudCA9IE1hdGgubWF4KDAuMDAwMSwgdGhpcy5vc2MuZnJlcXVlbmN5LnZhbHVlKTtcbiAgICB0aGlzLm9zYy5mcmVxdWVuY3kuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5zZXRWYWx1ZUF0VGltZShjdXJyZW50LCBub3cpO1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUodGFyZ2V0SHosIG5vdyArIGdsaWRlU2Vjb25kcyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGFyZ2V0SHosIG5vdyArIGdsaWRlU2Vjb25kcyk7XG4gICAgfVxuICB9XG5cbiAgc3RvcCgpIHtcbiAgICB0cnkgeyB0aGlzLm9zYy5zdG9wKCk7IHRoaXMuc2hpbW1lci5zdG9wKCk7IH0gY2F0Y2gge31cbiAgICB0cnkge1xuICAgICAgdGhpcy5vc2MuZGlzY29ubmVjdCgpOyB0aGlzLnNoaW1tZXIuZGlzY29ubmVjdCgpO1xuICAgICAgdGhpcy5nLmRpc2Nvbm5lY3QoKTsgdGhpcy5zaGltbWVyR2Fpbi5kaXNjb25uZWN0KCk7IHRoaXMuc2NhbGUuZGlzY29ubmVjdCgpO1xuICAgIH0gY2F0Y2gge31cbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgQW1iaWVudFNjZW5lIHtcbiAgcHJpdmF0ZSBydW5uaW5nID0gZmFsc2U7XG4gIHByaXZhdGUgc3RvcEZuczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcbiAgcHJpdmF0ZSB0aW1lb3V0czogbnVtYmVyW10gPSBbXTtcblxuICBwcml2YXRlIHBhcmFtczogQW1iaWVudFBhcmFtcyA9IHsgaW50ZW5zaXR5OiAwLjc1LCBicmlnaHRuZXNzOiAwLjUsIGRlbnNpdHk6IDAuNiB9O1xuXG4gIHByaXZhdGUgcm5nOiAoKSA9PiBudW1iZXI7XG4gIHByaXZhdGUgbWFzdGVyITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgZmlsdGVyITogQmlxdWFkRmlsdGVyTm9kZTtcbiAgcHJpdmF0ZSBkcnkhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSB3ZXQhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBkZWxheSE6IERlbGF5Tm9kZTtcbiAgcHJpdmF0ZSBmZWVkYmFjayE6IEdhaW5Ob2RlO1xuXG4gIHByaXZhdGUgbGZvTm9kZT86IE9zY2lsbGF0b3JOb2RlO1xuICBwcml2YXRlIGxmb0dhaW4/OiBHYWluTm9kZTtcblxuICAvLyBtdXNpY2FsIHN0YXRlXG4gIHByaXZhdGUga2V5Um9vdE1pZGkgPSA0MztcbiAgcHJpdmF0ZSBtb2RlOiBNb2RlTmFtZSA9IFwiSW9uaWFuXCI7XG4gIHByaXZhdGUgZHJvbmVEZWdyZWVJZHggPSAwO1xuICBwcml2YXRlIHJvb3RWb2ljZTogVm9pY2UgfCBudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGN0eDogQXVkaW9Db250ZXh0LFxuICAgIHByaXZhdGUgb3V0OiBHYWluTm9kZSxcbiAgICBzZWVkID0gMVxuICApIHtcbiAgICB0aGlzLnJuZyA9IG1ha2VQUk5HKHNlZWQpO1xuICB9XG5cbiAgc2V0UGFyYW08SyBleHRlbmRzIGtleW9mIEFtYmllbnRQYXJhbXM+KGs6IEssIHY6IEFtYmllbnRQYXJhbXNbS10pIHtcbiAgICB0aGlzLnBhcmFtc1trXSA9IGNsYW1wMDEodik7XG4gICAgaWYgKHRoaXMucnVubmluZyAmJiBrID09PSBcImludGVuc2l0eVwiICYmIHRoaXMubWFzdGVyKSB7XG4gICAgICB0aGlzLm1hc3Rlci5nYWluLnZhbHVlID0gMC4xNSArIDAuODUgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHk7IFxuICAgIH1cbiAgfVxuXG4gIHN0YXJ0KCkge1xuICAgIGlmICh0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICB0aGlzLnJ1bm5pbmcgPSB0cnVlO1xuXG4gICAgLy8gLS0tLSBDb3JlIGdyYXBoIChmaWx0ZXIgLT4gZHJ5K2RlbGF5IC0+IG1hc3RlciAtPiBvdXQpIC0tLS1cbiAgICB0aGlzLm1hc3RlciA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiAwLjE1ICsgMC44NSAqIHRoaXMucGFyYW1zLmludGVuc2l0eSB9KTtcbiAgICB0aGlzLmZpbHRlciA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKHRoaXMuY3R4LCB7IHR5cGU6IFwibG93cGFzc1wiLCBROiAwLjcwNyB9KTtcbiAgICB0aGlzLmRyeSA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiAxIH0pO1xuICAgIHRoaXMud2V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IFdFVF9NSVggfSk7XG4gICAgdGhpcy5kZWxheSA9IG5ldyBEZWxheU5vZGUodGhpcy5jdHgsIHsgZGVsYXlUaW1lOiBERUxBWV9USU1FX1MsIG1heERlbGF5VGltZTogMiB9KTtcbiAgICB0aGlzLmZlZWRiYWNrID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IEZFRURCQUNLX0dBSU4gfSk7XG5cbiAgICB0aGlzLmZpbHRlci5jb25uZWN0KHRoaXMuZHJ5KS5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLmZpbHRlci5jb25uZWN0KHRoaXMuZGVsYXkpO1xuICAgIHRoaXMuZGVsYXkuY29ubmVjdCh0aGlzLmZlZWRiYWNrKS5jb25uZWN0KHRoaXMuZGVsYXkpO1xuICAgIHRoaXMuZGVsYXkuY29ubmVjdCh0aGlzLndldCkuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5tYXN0ZXIuY29ubmVjdCh0aGlzLm91dCk7XG5cbiAgICAvLyAtLS0tIEZpbHRlciBiYXNlbGluZSArIHNsb3cgc3dlZXBzIC0tLS1cbiAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VmFsdWVBdFRpbWUoRklMVEVSX0JBU0VfSFosIHRoaXMuY3R4LmN1cnJlbnRUaW1lKTtcbiAgICBjb25zdCBzd2VlcCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHQgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgICAvLyB1cCB0aGVuIGRvd24gdXNpbmcgdmVyeSBzbG93IHRpbWUgY29uc3RhbnRzXG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VGFyZ2V0QXRUaW1lKFxuICAgICAgICBGSUxURVJfQkFTRV9IWiArIChGSUxURVJfUEVBS19IWiAtIEZJTFRFUl9CQVNFX0haKSAqICgwLjQgKyAwLjYgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKSxcbiAgICAgICAgdCwgU1dFRVBfU0VHX1MgLyAzXG4gICAgICApO1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFRhcmdldEF0VGltZShcbiAgICAgICAgRklMVEVSX0JBU0VfSFogKiAoMC43ICsgMC4zICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyksXG4gICAgICAgIHQgKyBTV0VFUF9TRUdfUywgU1dFRVBfU0VHX1MgLyAzXG4gICAgICApO1xuICAgICAgdGhpcy50aW1lb3V0cy5wdXNoKHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHRoaXMucnVubmluZyAmJiBzd2VlcCgpLCAoU1dFRVBfU0VHX1MgKiAyKSAqIDEwMDApIGFzIHVua25vd24gYXMgbnVtYmVyKTtcbiAgICB9O1xuICAgIHN3ZWVwKCk7XG5cbiAgICAvLyAtLS0tIEdlbnRsZSBMRk8gb24gZmlsdGVyIGZyZXEgKHNtYWxsIGRlcHRoKSAtLS0tXG4gICAgdGhpcy5sZm9Ob2RlID0gbmV3IE9zY2lsbGF0b3JOb2RlKHRoaXMuY3R4LCB7IHR5cGU6IFwic2luZVwiLCBmcmVxdWVuY3k6IExGT19SQVRFX0haIH0pO1xuICAgIHRoaXMubGZvR2FpbiA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBMRk9fREVQVEhfSFogKiAoMC41ICsgMC41ICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcykgfSk7XG4gICAgdGhpcy5sZm9Ob2RlLmNvbm5lY3QodGhpcy5sZm9HYWluKS5jb25uZWN0KHRoaXMuZmlsdGVyLmZyZXF1ZW5jeSk7XG4gICAgdGhpcy5sZm9Ob2RlLnN0YXJ0KCk7XG5cbiAgICAvLyAtLS0tIFNwYXduIHJvb3QgZHJvbmUgKGdsaWRpbmcgdG8gZGlmZmVyZW50IGRlZ3JlZXMpIC0tLS1cbiAgICB0aGlzLnNwYXduUm9vdERyb25lKCk7XG4gICAgdGhpcy5zY2hlZHVsZU5leHREcm9uZU1vdmUoKTtcblxuICAgIC8vIC0tLS0gQ2hvcmQgY3ljbGUgbG9vcCAtLS0tXG4gICAgdGhpcy5jaG9yZEN5Y2xlKCk7XG5cbiAgICAvLyBjbGVhbnVwXG4gICAgdGhpcy5zdG9wRm5zLnB1c2goKCkgPT4ge1xuICAgICAgdHJ5IHsgdGhpcy5sZm9Ob2RlPy5zdG9wKCk7IH0gY2F0Y2gge31cbiAgICAgIFt0aGlzLm1hc3RlciwgdGhpcy5maWx0ZXIsIHRoaXMuZHJ5LCB0aGlzLndldCwgdGhpcy5kZWxheSwgdGhpcy5mZWVkYmFjaywgdGhpcy5sZm9Ob2RlLCB0aGlzLmxmb0dhaW5dXG4gICAgICAgIC5mb3JFYWNoKG4gPT4geyB0cnkgeyBuPy5kaXNjb25uZWN0KCk7IH0gY2F0Y2gge30gfSk7XG4gICAgfSk7XG4gIH1cblxuICBzdG9wKCkge1xuICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XG5cbiAgICAvLyBjYW5jZWwgdGltZW91dHNcbiAgICB0aGlzLnRpbWVvdXRzLnNwbGljZSgwKS5mb3JFYWNoKGlkID0+IHdpbmRvdy5jbGVhclRpbWVvdXQoaWQpKTtcblxuICAgIC8vIGZhZGUgYW5kIGNsZWFudXAgdm9pY2VzXG4gICAgaWYgKHRoaXMucm9vdFZvaWNlKSB0aGlzLnJvb3RWb2ljZS5mYWRlT3V0S2lsbCgxLjIpO1xuXG4gICAgLy8gcnVuIGRlZmVycmVkIHN0b3BzXG4gICAgdGhpcy5zdG9wRm5zLnNwbGljZSgwKS5mb3JFYWNoKGZuID0+IGZuKCkpO1xuICB9XG5cbiAgLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBNdXNpY2FsIGVuZ2luZSBiZWxvdyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tICovXG5cbiAgcHJpdmF0ZSBjdXJyZW50RGVncmVlcygpOiBudW1iZXJbXSB7XG4gICAgcmV0dXJuIE1PREVTW3RoaXMubW9kZV0gfHwgTU9ERVMuTHlkaWFuO1xuICB9XG5cbiAgLyoqIERyb25lIHJvb3Qgdm9pY2UgKi9cbiAgcHJpdmF0ZSBzcGF3blJvb3REcm9uZSgpIHtcbiAgICBjb25zdCBiYXNlTWlkaSA9IHRoaXMua2V5Um9vdE1pZGkgKyB0aGlzLmN1cnJlbnREZWdyZWVzKClbdGhpcy5kcm9uZURlZ3JlZUlkeF07XG4gICAgY29uc3QgdiA9IG5ldyBWb2ljZShcbiAgICAgIHRoaXMuY3R4LFxuICAgICAgUk9PVF9NQVhfR0FJTixcbiAgICAgIFwic2luZVwiLFxuICAgICAgbWlkaVRvRnJlcShiYXNlTWlkaSksXG4gICAgICB0aGlzLmZpbHRlcixcbiAgICAgIHRoaXMucm5nXG4gICAgKTtcbiAgICB2LmZhZGVJbihST09UX1NXRUxMX1RJTUUpO1xuICAgIHRoaXMucm9vdFZvaWNlID0gdjtcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCkge1xuICAgIGlmICghdGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgY29uc3Qgd2FpdE1zID0gcmFuZCh0aGlzLnJuZywgRFJPTkVfU0hJRlRfTUlOX1MsIERST05FX1NISUZUX01BWF9TKSAqIDEwMDA7XG4gICAgY29uc3QgaWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoIXRoaXMucnVubmluZyB8fCAhdGhpcy5yb290Vm9pY2UpIHJldHVybjtcbiAgICAgIGNvbnN0IGdsaWRlID0gcmFuZCh0aGlzLnJuZywgRFJPTkVfR0xJREVfTUlOX1MsIERST05FX0dMSURFX01BWF9TKTtcbiAgICAgIGNvbnN0IG5leHRJZHggPSB0aGlzLnBpY2tOZXh0RHJvbmVEZWdyZWVJZHgoKTtcbiAgICAgIGNvbnN0IHRhcmdldE1pZGkgPSB0aGlzLmtleVJvb3RNaWRpICsgdGhpcy5jdXJyZW50RGVncmVlcygpW25leHRJZHhdO1xuICAgICAgdGhpcy5yb290Vm9pY2Uuc2V0RnJlcUdsaWRlKG1pZGlUb0ZyZXEodGFyZ2V0TWlkaSksIGdsaWRlKTtcbiAgICAgIHRoaXMuZHJvbmVEZWdyZWVJZHggPSBuZXh0SWR4O1xuICAgICAgdGhpcy5zY2hlZHVsZU5leHREcm9uZU1vdmUoKTtcbiAgICB9LCB3YWl0TXMpIGFzIHVua25vd24gYXMgbnVtYmVyO1xuICAgIHRoaXMudGltZW91dHMucHVzaChpZCk7XG4gIH1cblxuICBwcml2YXRlIHBpY2tOZXh0RHJvbmVEZWdyZWVJZHgoKTogbnVtYmVyIHtcbiAgICBjb25zdCBvcmRlciA9IFsuLi5QUkVGRVJSRURfREVHUkVFX09SREVSXTtcbiAgICBjb25zdCBpID0gb3JkZXIuaW5kZXhPZih0aGlzLmRyb25lRGVncmVlSWR4KTtcbiAgICBpZiAoaSA+PSAwKSB7IGNvbnN0IFtjdXJdID0gb3JkZXIuc3BsaWNlKGksIDEpOyBvcmRlci5wdXNoKGN1cik7IH1cbiAgICByZXR1cm4gY2hvaWNlKHRoaXMucm5nLCBvcmRlcik7XG4gIH1cblxuICAvKiogQnVpbGQgZGlhdG9uaWMgc3RhY2tlZC10aGlyZCBjaG9yZCBkZWdyZWVzIHdpdGggb3B0aW9uYWwgZXh0ZW5zaW9ucyAqL1xuICBwcml2YXRlIGJ1aWxkQ2hvcmREZWdyZWVzKG1vZGVEZWdzOiBudW1iZXJbXSwgcm9vdEluZGV4OiBudW1iZXIsIHNpemUgPSA0LCBhZGQ5ID0gZmFsc2UsIGFkZDExID0gZmFsc2UsIGFkZDEzID0gZmFsc2UpIHtcbiAgICBjb25zdCBzdGVwcyA9IFswLCAyLCA0LCA2XTsgLy8gdGhpcmRzIG92ZXIgNy1ub3RlIHNjYWxlXG4gICAgY29uc3QgY2hvcmRJZHhzID0gc3RlcHMuc2xpY2UoMCwgTWF0aC5taW4oc2l6ZSwgNCkpLm1hcChzID0+IChyb290SW5kZXggKyBzKSAlIDcpO1xuICAgIGlmIChhZGQ5KSAgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDgpICUgNyk7XG4gICAgaWYgKGFkZDExKSBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgMTApICUgNyk7XG4gICAgaWYgKGFkZDEzKSBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgMTIpICUgNyk7XG4gICAgcmV0dXJuIGNob3JkSWR4cy5tYXAoaSA9PiBtb2RlRGVnc1tpXSk7XG4gIH1cblxuICBwcml2YXRlICplbmRsZXNzQ2hvcmRzKCkge1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCBtb2RlRGVncyA9IHRoaXMuY3VycmVudERlZ3JlZXMoKTtcbiAgICAgIC8vIGNob29zZSBjaG9yZCByb290IGRlZ3JlZSAob2Z0ZW4gYWxpZ24gd2l0aCBkcm9uZSlcbiAgICAgIGNvbnN0IHJvb3REZWdyZWVJbmRleCA9ICh0aGlzLnJuZygpIDwgQ0hPUkRfQU5DSE9SX1BST0IpID8gdGhpcy5kcm9uZURlZ3JlZUlkeCA6IE1hdGguZmxvb3IodGhpcy5ybmcoKSAqIDcpO1xuXG4gICAgICAvLyBjaG9yZCBzaXplIC8gZXh0ZW5zaW9uc1xuICAgICAgY29uc3QgciA9IHRoaXMucm5nKCk7XG4gICAgICBsZXQgc2l6ZSA9IDM7IGxldCBhZGQ5ID0gZmFsc2UsIGFkZDExID0gZmFsc2UsIGFkZDEzID0gZmFsc2U7XG4gICAgICBpZiAociA8IDAuMzUpICAgICAgICAgICAgeyBzaXplID0gMzsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuNzUpICAgICAgIHsgc2l6ZSA9IDQ7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjkwKSAgICAgICB7IHNpemUgPSA0OyBhZGQ5ID0gdHJ1ZTsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuOTcpICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDExID0gdHJ1ZTsgfVxuICAgICAgZWxzZSAgICAgICAgICAgICAgICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDEzID0gdHJ1ZTsgfVxuXG4gICAgICBjb25zdCBjaG9yZFNlbWlzID0gdGhpcy5idWlsZENob3JkRGVncmVlcyhtb2RlRGVncywgcm9vdERlZ3JlZUluZGV4LCBzaXplLCBhZGQ5LCBhZGQxMSwgYWRkMTMpO1xuICAgICAgLy8gc3ByZWFkIGNob3JkIGFjcm9zcyBvY3RhdmVzICgtMTIsIDAsICsxMiksIGJpYXMgdG8gY2VudGVyXG4gICAgICBjb25zdCBzcHJlYWQgPSBjaG9yZFNlbWlzLm1hcChzZW1pID0+IHNlbWkgKyBjaG9pY2UodGhpcy5ybmcsIFstMTIsIDAsIDAsIDEyXSkpO1xuXG4gICAgICAvLyBvY2Nhc2lvbmFsbHkgZW5zdXJlIHRvbmljIGlzIHByZXNlbnQgZm9yIGdyb3VuZGluZ1xuICAgICAgaWYgKCFzcHJlYWQuaW5jbHVkZXMoMCkgJiYgdGhpcy5ybmcoKSA8IDAuNSkgc3ByZWFkLnB1c2goMCk7XG5cbiAgICAgIHlpZWxkIHNwcmVhZDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNob3JkQ3ljbGUoKSB7XG4gICAgY29uc3QgZ2VuID0gdGhpcy5lbmRsZXNzQ2hvcmRzKCk7XG4gICAgY29uc3Qgdm9pY2VzID0gbmV3IFNldDxWb2ljZT4oKTtcblxuICAgIGNvbnN0IHNsZWVwID0gKG1zOiBudW1iZXIpID0+IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuICAgICAgY29uc3QgaWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiByKCksIG1zKSBhcyB1bmtub3duIGFzIG51bWJlcjtcbiAgICAgIHRoaXMudGltZW91dHMucHVzaChpZCk7XG4gICAgfSk7XG5cbiAgICB3aGlsZSAodGhpcy5ydW5uaW5nKSB7XG4gICAgICAvLyBjaG9yZCBzcGF3biBwcm9iYWJpbGl0eSAvIHRoaWNrbmVzcyBzY2FsZSB3aXRoIGRlbnNpdHkgJiBicmlnaHRuZXNzXG4gICAgICBjb25zdCB0aGlja25lc3MgPSBNYXRoLnJvdW5kKDIgKyB0aGlzLnBhcmFtcy5kZW5zaXR5ICogMyk7XG4gICAgICBjb25zdCBiYXNlTWlkaSA9IHRoaXMua2V5Um9vdE1pZGk7XG4gICAgICBjb25zdCBkZWdyZWVzT2ZmOiBudW1iZXJbXSA9IGdlbi5uZXh0KCkudmFsdWUgPz8gW107XG5cbiAgICAgIC8vIHNwYXduXG4gICAgICBmb3IgKGNvbnN0IG9mZiBvZiBkZWdyZWVzT2ZmKSB7XG4gICAgICAgIGlmICghdGhpcy5ydW5uaW5nKSBicmVhaztcbiAgICAgICAgaWYgKHZvaWNlcy5zaXplID49IE1hdGgubWluKENIT1JEX1ZPSUNFU19NQVgsIHRoaWNrbmVzcykpIGJyZWFrO1xuXG4gICAgICAgIGNvbnN0IG1pZGkgPSBiYXNlTWlkaSArIG9mZjtcbiAgICAgICAgY29uc3QgZnJlcSA9IG1pZGlUb0ZyZXEobWlkaSk7XG4gICAgICAgIGNvbnN0IHdhdmVmb3JtID0gY2hvaWNlKHRoaXMucm5nLCBbXCJzaW5lXCIsIFwidHJpYW5nbGVcIiwgXCJzYXd0b290aFwiXSBhcyBPc2NpbGxhdG9yVHlwZVtdKTtcblxuICAgICAgICAvLyBsb3VkZXIgd2l0aCBpbnRlbnNpdHk7IHNsaWdodGx5IGJyaWdodGVyIC0+IHNsaWdodGx5IGxvdWRlclxuICAgICAgICBjb25zdCBnYWluVGFyZ2V0ID0gcmFuZCh0aGlzLnJuZywgMC4wOCwgMC4yMikgKlxuICAgICAgICAgICgwLjg1ICsgMC4zICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5KSAqXG4gICAgICAgICAgKDAuOSArIDAuMiAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpO1xuXG4gICAgICAgIGNvbnN0IHYgPSBuZXcgVm9pY2UodGhpcy5jdHgsIGdhaW5UYXJnZXQsIHdhdmVmb3JtLCBmcmVxLCB0aGlzLmZpbHRlciwgdGhpcy5ybmcpO1xuICAgICAgICB2b2ljZXMuYWRkKHYpO1xuICAgICAgICB2LmZhZGVJbihyYW5kKHRoaXMucm5nLCBDSE9SRF9GQURFX01JTl9TLCBDSE9SRF9GQURFX01BWF9TKSk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHNsZWVwKHJhbmQodGhpcy5ybmcsIENIT1JEX0hPTERfTUlOX1MsIENIT1JEX0hPTERfTUFYX1MpICogMTAwMCk7XG5cbiAgICAgIC8vIGZhZGUgb3V0XG4gICAgICBjb25zdCBvdXRzID0gQXJyYXkuZnJvbSh2b2ljZXMpO1xuICAgICAgZm9yIChjb25zdCB2IG9mIG91dHMpIHYuZmFkZU91dEtpbGwocmFuZCh0aGlzLnJuZywgQ0hPUkRfRkFERV9NSU5fUywgQ0hPUkRfRkFERV9NQVhfUykpO1xuICAgICAgdm9pY2VzLmNsZWFyKCk7XG5cbiAgICAgIGF3YWl0IHNsZWVwKHJhbmQodGhpcy5ybmcsIENIT1JEX0dBUF9NSU5fUywgQ0hPUkRfR0FQX01BWF9TKSAqIDEwMDApO1xuICAgIH1cblxuICAgIC8vIHNhZmV0eToga2lsbCBhbnkgbGluZ2VyaW5nIHZvaWNlc1xuICAgIGZvciAoY29uc3QgdiBvZiBBcnJheS5mcm9tKHZvaWNlcykpIHYuZmFkZU91dEtpbGwoMC44KTtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgU2NlbmVOYW1lLCBNdXNpY1NjZW5lT3B0aW9ucyB9IGZyb20gXCIuLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi4vZW5naW5lXCI7XG5pbXBvcnQgeyBBbWJpZW50U2NlbmUgfSBmcm9tIFwiLi9zY2VuZXMvYW1iaWVudFwiO1xuXG5leHBvcnQgY2xhc3MgTXVzaWNEaXJlY3RvciB7XG4gIHByaXZhdGUgY3VycmVudD86IHsgbmFtZTogU2NlbmVOYW1lOyBzdG9wOiAoKSA9PiB2b2lkIH07XG4gIHByaXZhdGUgYnVzT3V0OiBHYWluTm9kZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGVuZ2luZTogQXVkaW9FbmdpbmUpIHtcbiAgICB0aGlzLmJ1c091dCA9IG5ldyBHYWluTm9kZShlbmdpbmUuY3R4LCB7IGdhaW46IDAuOSB9KTtcbiAgICB0aGlzLmJ1c091dC5jb25uZWN0KGVuZ2luZS5nZXRNdXNpY0J1cygpKTtcbiAgfVxuXG4gIC8qKiBDcm9zc2ZhZGUgdG8gYSBuZXcgc2NlbmUgKi9cbiAgc2V0U2NlbmUobmFtZTogU2NlbmVOYW1lLCBvcHRzPzogTXVzaWNTY2VuZU9wdGlvbnMpIHtcbiAgICBpZiAodGhpcy5jdXJyZW50Py5uYW1lID09PSBuYW1lKSByZXR1cm47XG5cbiAgICBjb25zdCBvbGQgPSB0aGlzLmN1cnJlbnQ7XG4gICAgY29uc3QgdCA9IHRoaXMuZW5naW5lLm5vdztcblxuICAgIC8vIGZhZGUtb3V0IG9sZFxuICAgIGNvbnN0IGZhZGVPdXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5lbmdpbmUuY3R4LCB7IGdhaW46IDAuOSB9KTtcbiAgICBmYWRlT3V0LmNvbm5lY3QodGhpcy5lbmdpbmUuZ2V0TXVzaWNCdXMoKSk7XG4gICAgaWYgKG9sZCkge1xuICAgICAgLy8gV2UgYXNzdW1lIGVhY2ggc2NlbmUgbWFuYWdlcyBpdHMgb3duIG91dCBub2RlOyBzdG9wcGluZyB0cmlnZ2VycyBhIG5hdHVyYWwgdGFpbC5cbiAgICAgIG9sZC5zdG9wKCk7XG4gICAgICBmYWRlT3V0LmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wLCB0ICsgMC42KTtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gZmFkZU91dC5kaXNjb25uZWN0KCksIDY1MCk7XG4gICAgfVxuXG4gICAgLy8gbmV3IHNjZW5lXG4gICAgY29uc3Qgc2NlbmVPdXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5lbmdpbmUuY3R4LCB7IGdhaW46IDAgfSk7XG4gICAgc2NlbmVPdXQuY29ubmVjdCh0aGlzLmJ1c091dCk7XG5cbiAgICBsZXQgc3RvcCA9ICgpID0+IHNjZW5lT3V0LmRpc2Nvbm5lY3QoKTtcblxuICAgIGlmIChuYW1lID09PSBcImFtYmllbnRcIikge1xuICAgICAgY29uc3QgcyA9IG5ldyBBbWJpZW50U2NlbmUodGhpcy5lbmdpbmUuY3R4LCBzY2VuZU91dCwgb3B0cz8uc2VlZCA/PyAxKTtcbiAgICAgIHMuc3RhcnQoKTtcbiAgICAgIHN0b3AgPSAoKSA9PiB7XG4gICAgICAgIHMuc3RvcCgpO1xuICAgICAgICBzY2VuZU91dC5kaXNjb25uZWN0KCk7XG4gICAgICB9O1xuICAgIH1cbiAgICAvLyBlbHNlIGlmIChuYW1lID09PSBcImNvbWJhdFwiKSB7IC8qIGltcGxlbWVudCBjb21iYXQgc2NlbmUgbGF0ZXIgKi8gfVxuICAgIC8vIGVsc2UgaWYgKG5hbWUgPT09IFwibG9iYnlcIikgeyAvKiBpbXBsZW1lbnQgbG9iYnkgc2NlbmUgbGF0ZXIgKi8gfVxuXG4gICAgdGhpcy5jdXJyZW50ID0geyBuYW1lLCBzdG9wIH07XG4gICAgc2NlbmVPdXQuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjksIHQgKyAwLjYpO1xuICB9XG5cbiAgc3RvcCgpIHtcbiAgICBpZiAoIXRoaXMuY3VycmVudCkgcmV0dXJuO1xuICAgIHRoaXMuY3VycmVudC5zdG9wKCk7XG4gICAgdGhpcy5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICB9XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBCdXMsIE11c2ljUGFyYW1NZXNzYWdlLCBNdXNpY1NjZW5lT3B0aW9ucyB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgTXVzaWNEaXJlY3RvciB9IGZyb20gXCIuL211c2ljXCI7XG5pbXBvcnQgeyBwbGF5U2Z4IH0gZnJvbSBcIi4vc2Z4XCI7XG5cbi8qKlxuICogQmluZCBzdGFuZGFyZCBhdWRpbyBldmVudHMgdG8gdGhlIGVuZ2luZSBhbmQgbXVzaWMgZGlyZWN0b3IuXG4gKlxuICogRXZlbnRzIHN1cHBvcnRlZDpcbiAqICAtIGF1ZGlvOnJlc3VtZVxuICogIC0gYXVkaW86bXV0ZSAvIGF1ZGlvOnVubXV0ZVxuICogIC0gYXVkaW86c2V0LW1hc3Rlci1nYWluIHsgZ2FpbiB9XG4gKiAgLSBhdWRpbzpzZnggeyBuYW1lLCB2ZWxvY2l0eT8sIHBhbj8gfVxuICogIC0gYXVkaW86bXVzaWM6c2V0LXNjZW5lIHsgc2NlbmUsIHNlZWQ/IH1cbiAqICAtIGF1ZGlvOm11c2ljOnBhcmFtIHsga2V5LCB2YWx1ZSB9XG4gKiAgLSBhdWRpbzptdXNpYzp0cmFuc3BvcnQgeyBjbWQ6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJwYXVzZVwiIH0gIC8vIHBhdXNlIGN1cnJlbnRseSBtYXBzIHRvIHN0b3BcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyhcbiAgYnVzOiBCdXMsXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIG11c2ljOiBNdXNpY0RpcmVjdG9yXG4pOiB2b2lkIHtcbiAgYnVzLm9uKFwiYXVkaW86cmVzdW1lXCIsICgpID0+IGVuZ2luZS5yZXN1bWUoKSk7XG4gIGJ1cy5vbihcImF1ZGlvOm11dGVcIiwgKCkgPT4gZW5naW5lLnNldE1hc3RlckdhaW4oMCkpO1xuICBidXMub24oXCJhdWRpbzp1bm11dGVcIiwgKCkgPT4gZW5naW5lLnNldE1hc3RlckdhaW4oMC45KSk7XG4gIGJ1cy5vbihcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiLCAoeyBnYWluIH06IHsgZ2FpbjogbnVtYmVyIH0pID0+XG4gICAgZW5naW5lLnNldE1hc3RlckdhaW4oTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgZ2FpbikpKVxuICApO1xuXG4gIGJ1cy5vbihcImF1ZGlvOnNmeFwiLCAobXNnOiB7IG5hbWU6IHN0cmluZzsgdmVsb2NpdHk/OiBudW1iZXI7IHBhbj86IG51bWJlciB9KSA9PiB7XG4gICAgcGxheVNmeChlbmdpbmUsIG1zZy5uYW1lIGFzIGFueSwgeyB2ZWxvY2l0eTogbXNnLnZlbG9jaXR5LCBwYW46IG1zZy5wYW4gfSk7XG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiLCAobXNnOiB7IHNjZW5lOiBzdHJpbmcgfSAmIE11c2ljU2NlbmVPcHRpb25zKSA9PiB7XG4gICAgZW5naW5lLnJlc3VtZSgpO1xuICAgIG11c2ljLnNldFNjZW5lKG1zZy5zY2VuZSBhcyBhbnksIHsgc2VlZDogbXNnLnNlZWQgfSk7XG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnBhcmFtXCIsIChfbXNnOiBNdXNpY1BhcmFtTWVzc2FnZSkgPT4ge1xuICAgIC8vIEhvb2sgZm9yIGZ1dHVyZSBwYXJhbSByb3V0aW5nIHBlciBzY2VuZSAoZS5nLiwgaW50ZW5zaXR5L2JyaWdodG5lc3MvZGVuc2l0eSlcbiAgICAvLyBJZiB5b3Ugd2FudCBnbG9iYWwgcGFyYW1zLCBrZWVwIGEgbWFwIGhlcmUgYW5kIGZvcndhcmQgdG8gdGhlIGFjdGl2ZSBzY2VuZVxuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzp0cmFuc3BvcnRcIiwgKHsgY21kIH06IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9KSA9PiB7XG4gICAgaWYgKGNtZCA9PT0gXCJzdG9wXCIgfHwgY21kID09PSBcInBhdXNlXCIpIG11c2ljLnN0b3AoKTtcbiAgICAvLyBcInN0YXJ0XCIgaXMgaW1wbGljaXQgdmlhIHNldFNjZW5lXG4gIH0pO1xufVxuIiwgImltcG9ydCB7IGNyZWF0ZUV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgeyBjb25uZWN0V2ViU29ja2V0LCBzZW5kTWVzc2FnZSB9IGZyb20gXCIuL25ldFwiO1xuaW1wb3J0IHsgaW5pdEdhbWUgfSBmcm9tIFwiLi9nYW1lXCI7XG5pbXBvcnQgeyBjcmVhdGVJbml0aWFsU3RhdGUsIGNyZWF0ZUluaXRpYWxVSVN0YXRlIH0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7IG1vdW50VHV0b3JpYWwsIEJBU0lDX1RVVE9SSUFMX0lEIH0gZnJvbSBcIi4vdHV0b3JpYWxcIjtcbmltcG9ydCB7IGNsZWFyUHJvZ3Jlc3MgYXMgY2xlYXJUdXRvcmlhbFByb2dyZXNzIH0gZnJvbSBcIi4vdHV0b3JpYWwvc3RvcmFnZVwiO1xuaW1wb3J0IHsgbW91bnRTdG9yeSwgSU5UUk9fQ0hBUFRFUl9JRCwgSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMgfSBmcm9tIFwiLi9zdG9yeVwiO1xuaW1wb3J0IHsgd2FpdEZvclVzZXJTdGFydCB9IGZyb20gXCIuL3N0YXJ0LWdhdGVcIjtcbmltcG9ydCB7IHJlc3VtZUF1ZGlvIH0gZnJvbSBcIi4vc3Rvcnkvc2Z4XCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2F1ZGlvL2VuZ2luZVwiO1xuaW1wb3J0IHsgTXVzaWNEaXJlY3RvciB9IGZyb20gXCIuL2F1ZGlvL211c2ljXCI7XG5pbXBvcnQgeyByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MgfSBmcm9tIFwiLi9hdWRpby9jdWVzXCI7XG5cbmNvbnN0IENBTExfU0lHTl9TVE9SQUdFX0tFWSA9IFwibHNkOmNhbGxzaWduXCI7XG5cbihhc3luYyBmdW5jdGlvbiBib290c3RyYXAoKSB7XG4gIGNvbnN0IHFzID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcbiAgY29uc3Qgcm9vbSA9IHFzLmdldChcInJvb21cIikgfHwgXCJkZWZhdWx0XCI7XG4gIGNvbnN0IG1vZGUgPSBxcy5nZXQoXCJtb2RlXCIpIHx8IFwiXCI7XG4gIGNvbnN0IG5hbWVQYXJhbSA9IHNhbml0aXplQ2FsbFNpZ24ocXMuZ2V0KFwibmFtZVwiKSk7XG4gIGNvbnN0IHN0b3JlZE5hbWUgPSBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgY29uc3QgY2FsbFNpZ24gPSBuYW1lUGFyYW0gfHwgc3RvcmVkTmFtZTtcblxuICBpZiAobmFtZVBhcmFtICYmIG5hbWVQYXJhbSAhPT0gc3RvcmVkTmFtZSkge1xuICAgIHBlcnNpc3RDYWxsU2lnbihuYW1lUGFyYW0pO1xuICB9XG5cbiAgLy8gR2F0ZSBldmVyeXRoaW5nIG9uIGEgdXNlciBnZXN0dXJlIChjZW50cmVkIGJ1dHRvbilcbiAgYXdhaXQgd2FpdEZvclVzZXJTdGFydCh7XG4gICAgbGFiZWw6IFwiU3RhcnQgR2FtZVwiLFxuICAgIHJlcXVlc3RGdWxsc2NyZWVuOiBmYWxzZSwgICAvLyBmbGlwIHRvIHRydWUgaWYgeW91IHdhbnQgZnVsbHNjcmVlblxuICAgIHJlc3VtZUF1ZGlvLCAgICAgICAgICAgICAgICAvLyB1c2VzIHN0b3J5L3NmeC50c1xuICB9KTtcblxuICAvLyAtLS0tIFN0YXJ0IGFjdHVhbCBhcHAgYWZ0ZXIgZ2VzdHVyZSAtLS0tXG4gIGNvbnN0IHN0YXRlID0gY3JlYXRlSW5pdGlhbFN0YXRlKCk7XG4gIGNvbnN0IHVpU3RhdGUgPSBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpO1xuICBjb25zdCBidXMgPSBjcmVhdGVFdmVudEJ1cygpO1xuXG4gIC8vIC0tLSBBVURJTzogZW5naW5lICsgYmluZGluZ3MgKyBkZWZhdWx0IHNjZW5lIC0tLVxuICBjb25zdCBlbmdpbmUgPSBBdWRpb0VuZ2luZS5nZXQoKTtcbiAgYXdhaXQgZW5naW5lLnJlc3VtZSgpOyAvLyBzYWZlIHBvc3QtZ2VzdHVyZVxuICBjb25zdCBtdXNpYyA9IG5ldyBNdXNpY0RpcmVjdG9yKGVuZ2luZSk7XG4gIHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyhidXMgYXMgYW55LCBlbmdpbmUsIG11c2ljKTtcblxuICAvLyBTdGFydCBhIGRlZmF1bHQgbXVzaWMgc2NlbmUgKGFkanVzdCBzZWVkL3NjZW5lIGFzIHlvdSBsaWtlKVxuICBidXMuZW1pdChcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiLCB7IHNjZW5lOiBcImFtYmllbnRcIiwgc2VlZDogNDIgfSk7XG5cbiAgLy8gT3B0aW9uYWw6IGJhc2ljIGhvb2tzIHRvIGRlbW9uc3RyYXRlIFNGWCAmIGR1Y2tpbmdcbiAgLy8gYnVzLm9uKFwiZGlhbG9ndWU6b3BlbmVkXCIsICgpID0+IGVuZ2luZS5kdWNrTXVzaWMoMC4zNSwgMC4xKSk7XG4gIC8vIGJ1cy5vbihcImRpYWxvZ3VlOmNsb3NlZFwiLCAoKSA9PiBlbmdpbmUudW5kdWNrTXVzaWMoMC4yNSkpO1xuXG4gIC8vIEV4YW1wbGUgZ2FtZSBTRlggd2lyaW5nIChhZGFwdCB0byB5b3VyIGFjdHVhbCBldmVudHMpXG4gIGJ1cy5vbihcInNoaXA6c3BlZWRDaGFuZ2VkXCIsICh7IHZhbHVlIH0pID0+IHtcbiAgICBpZiAodmFsdWUgPiAwKSBidXMuZW1pdChcImF1ZGlvOnNmeFwiLCB7IG5hbWU6IFwidGhydXN0XCIsIHZlbG9jaXR5OiBNYXRoLm1pbigxLCB2YWx1ZSkgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGdhbWUgPSBpbml0R2FtZSh7IHN0YXRlLCB1aVN0YXRlLCBidXMgfSk7XG5cbiAgLy8gTW91bnQgdHV0b3JpYWwgYW5kIHN0b3J5IGJhc2VkIG9uIGdhbWUgbW9kZVxuICBjb25zdCBlbmFibGVUdXRvcmlhbCA9IG1vZGUgPT09IFwiY2FtcGFpZ25cIiB8fCBtb2RlID09PSBcInR1dG9yaWFsXCI7XG4gIGNvbnN0IGVuYWJsZVN0b3J5ID0gbW9kZSA9PT0gXCJjYW1wYWlnblwiO1xuXG4gIGxldCB0dXRvcmlhbDogUmV0dXJuVHlwZTx0eXBlb2YgbW91bnRUdXRvcmlhbD4gfCBudWxsID0gbnVsbDtcbiAgbGV0IHR1dG9yaWFsU3RhcnRlZCA9IGZhbHNlO1xuXG4gIGlmIChlbmFibGVUdXRvcmlhbCkge1xuICAgIHR1dG9yaWFsID0gbW91bnRUdXRvcmlhbChidXMpO1xuICB9XG5cbiAgY29uc3Qgc3RhcnRUdXRvcmlhbCA9ICgpOiB2b2lkID0+IHtcbiAgICBpZiAoIXR1dG9yaWFsIHx8IHR1dG9yaWFsU3RhcnRlZCkgcmV0dXJuO1xuICAgIHR1dG9yaWFsU3RhcnRlZCA9IHRydWU7XG4gICAgY2xlYXJUdXRvcmlhbFByb2dyZXNzKEJBU0lDX1RVVE9SSUFMX0lEKTtcbiAgICB0dXRvcmlhbC5zdGFydCh7IHJlc3VtZTogZmFsc2UgfSk7XG4gIH07XG5cbiAgaWYgKGVuYWJsZVN0b3J5KSB7XG4gICAgLy8gQ2FtcGFpZ24gbW9kZTogc3RvcnkgKyB0dXRvcmlhbFxuICAgIGNvbnN0IHVuc3Vic2NyaWJlU3RvcnlDbG9zZWQgPSBidXMub24oXCJkaWFsb2d1ZTpjbG9zZWRcIiwgKHsgY2hhcHRlcklkLCBub2RlSWQgfSkgPT4ge1xuICAgICAgaWYgKGNoYXB0ZXJJZCAhPT0gSU5UUk9fQ0hBUFRFUl9JRCkgcmV0dXJuO1xuICAgICAgaWYgKCFJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUy5pbmNsdWRlcyhub2RlSWQgYXMgdHlwZW9mIElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTW251bWJlcl0pKSByZXR1cm47XG4gICAgICB1bnN1YnNjcmliZVN0b3J5Q2xvc2VkKCk7XG4gICAgICBzdGFydFR1dG9yaWFsKCk7XG4gICAgfSk7XG4gICAgbW91bnRTdG9yeSh7IGJ1cywgcm9vbUlkOiByb29tIH0pO1xuICB9IGVsc2UgaWYgKG1vZGUgPT09IFwidHV0b3JpYWxcIikge1xuICAgIC8vIFR1dG9yaWFsIG1vZGU6IGF1dG8tc3RhcnQgdHV0b3JpYWwgd2l0aG91dCBzdG9yeVxuICAgIHN0YXJ0VHV0b3JpYWwoKTtcbiAgfVxuICAvLyBGcmVlIHBsYXkgYW5kIGRlZmF1bHQ6IG5vIHN5c3RlbXMgbW91bnRlZFxuXG4gIGNvbm5lY3RXZWJTb2NrZXQoe1xuICAgIHJvb20sXG4gICAgc3RhdGUsXG4gICAgYnVzLFxuICAgIG9uU3RhdGVVcGRhdGVkOiAoKSA9PiBnYW1lLm9uU3RhdGVVcGRhdGVkKCksXG4gICAgb25PcGVuOiAoKSA9PiB7XG4gICAgICBjb25zdCBuYW1lVG9TZW5kID0gY2FsbFNpZ24gfHwgc2FuaXRpemVDYWxsU2lnbihyZWFkU3RvcmVkQ2FsbFNpZ24oKSk7XG4gICAgICBpZiAobmFtZVRvU2VuZCkgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImpvaW5cIiwgbmFtZTogbmFtZVRvU2VuZCB9KTtcbiAgICB9LFxuICB9KTtcblxuICAvLyBPcHRpb25hbDogc3VzcGVuZC9yZXN1bWUgYXVkaW8gb24gdGFiIHZpc2liaWxpdHkgdG8gc2F2ZSBDUFVcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInZpc2liaWxpdHljaGFuZ2VcIiwgKCkgPT4ge1xuICAgIGlmIChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09IFwiaGlkZGVuXCIpIHtcbiAgICAgIHZvaWQgZW5naW5lLnN1c3BlbmQoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdm9pZCBlbmdpbmUucmVzdW1lKCk7XG4gICAgfVxuICB9KTtcbn0pKCk7XG5cbmZ1bmN0aW9uIHNhbml0aXplQ2FsbFNpZ24odmFsdWU6IHN0cmluZyB8IG51bGwpOiBzdHJpbmcge1xuICBpZiAoIXZhbHVlKSByZXR1cm4gXCJcIjtcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKTtcbiAgaWYgKCF0cmltbWVkKSByZXR1cm4gXCJcIjtcbiAgcmV0dXJuIHRyaW1tZWQuc2xpY2UoMCwgMjQpO1xufVxuXG5mdW5jdGlvbiBwZXJzaXN0Q2FsbFNpZ24obmFtZTogc3RyaW5nKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgaWYgKG5hbWUpIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVksIG5hbWUpO1xuICAgIGVsc2Ugd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSk7XG4gIH0gY2F0Y2gge31cbn1cblxuZnVuY3Rpb24gcmVhZFN0b3JlZENhbGxTaWduKCk6IHN0cmluZyB7XG4gIHRyeSB7IHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZKSA/PyBcIlwiOyB9XG4gIGNhdGNoIHsgcmV0dXJuIFwiXCI7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQWlFTyxXQUFTLGlCQUEyQjtBQUN6QyxVQUFNLFdBQVcsb0JBQUksSUFBNkI7QUFDbEQsV0FBTztBQUFBLE1BQ0wsR0FBRyxPQUFPLFNBQVM7QUFDakIsWUFBSSxNQUFNLFNBQVMsSUFBSSxLQUFLO0FBQzVCLFlBQUksQ0FBQyxLQUFLO0FBQ1IsZ0JBQU0sb0JBQUksSUFBSTtBQUNkLG1CQUFTLElBQUksT0FBTyxHQUFHO0FBQUEsUUFDekI7QUFDQSxZQUFJLElBQUksT0FBTztBQUNmLGVBQU8sTUFBTSxJQUFLLE9BQU8sT0FBTztBQUFBLE1BQ2xDO0FBQUEsTUFDQSxLQUFLLE9BQWlCLFNBQW1CO0FBQ3ZDLGNBQU0sTUFBTSxTQUFTLElBQUksS0FBSztBQUM5QixZQUFJLENBQUMsT0FBTyxJQUFJLFNBQVMsRUFBRztBQUM1QixtQkFBVyxNQUFNLEtBQUs7QUFDcEIsY0FBSTtBQUNGLFlBQUMsR0FBaUMsT0FBTztBQUFBLFVBQzNDLFNBQVMsS0FBSztBQUNaLG9CQUFRLE1BQU0scUJBQXFCLEtBQUssV0FBVyxHQUFHO0FBQUEsVUFDeEQ7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGOzs7QUN2Rk8sTUFBTSxvQkFBb0I7QUFDMUIsTUFBTSxvQkFBb0I7QUFDMUIsTUFBTSxtQkFBbUI7QUFDekIsTUFB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QUFBQSxJQUNGLENBQUM7QUFHRCxhQUFTLGlCQUFpQixvQkFBb0IsTUFBTTtBQUNsRCxVQUFJLFNBQVMsb0JBQW9CLFVBQVU7QUFDekMsYUFBSyxPQUFPLFFBQVE7QUFBQSxNQUN0QixPQUFPO0FBQ0wsYUFBSyxPQUFPLE9BQU87QUFBQSxNQUNyQjtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0gsR0FBRztBQUVILFdBQVMsaUJBQWlCLE9BQThCO0FBQ3RELFFBQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsVUFBTSxVQUFVLE1BQU0sS0FBSztBQUMzQixRQUFJLENBQUMsUUFBUyxRQUFPO0FBQ3JCLFdBQU8sUUFBUSxNQUFNLEdBQUcsRUFBRTtBQUFBLEVBQzVCO0FBRUEsV0FBUyxnQkFBZ0IsTUFBb0I7QUFDM0MsUUFBSTtBQUNGLFVBQUksS0FBTSxRQUFPLGFBQWEsUUFBUSx1QkFBdUIsSUFBSTtBQUFBLFVBQzVELFFBQU8sYUFBYSxXQUFXLHFCQUFxQjtBQUFBLElBQzNELFNBQVE7QUFBQSxJQUFDO0FBQUEsRUFDWDtBQUVBLFdBQVMscUJBQTZCO0FBL0h0QztBQWdJRSxRQUFJO0FBQUUsY0FBTyxZQUFPLGFBQWEsUUFBUSxxQkFBcUIsTUFBakQsWUFBc0Q7QUFBQSxJQUFJLFNBQ2pFO0FBQUUsYUFBTztBQUFBLElBQUk7QUFBQSxFQUNyQjsiLAogICJuYW1lcyI6IFsiX2EiLCAiU1RZTEVfSUQiLCAiZW5zdXJlU3R5bGVzIiwgImNob2ljZSIsICJfYSIsICJTVE9SQUdFX1BSRUZJWCIsICJnZXRTdG9yYWdlIiwgImN0eCIsICJjdHgiLCAiY2xhbXAiLCAiY2hvaWNlIiwgIl9hIiwgImN0eCIsICJyZXN1bWVBdWRpbyIsICJjdHgiXQp9Cg==
