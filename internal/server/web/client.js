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
        return () => set == null ? void 0 : set.delete(handler);
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
      missileTool: "set",
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
  var Tspan = null;
  var Cspan = null;
  var WHspan = null;
  var HPspan = null;
  var shipControlsCard = null;
  var shipClearBtn = null;
  var shipSetBtn = null;
  var shipSelectBtn = null;
  var shipToggleRouteBtn = null;
  var shipSelectionContainer = null;
  var shipSelectionLabel = null;
  var shipDeleteBtn = null;
  var shipSpeedCard = null;
  var shipSpeedSlider = null;
  var shipSpeedValue = null;
  var missileControlsCard = null;
  var missileAddRouteBtn = null;
  var missileLaunchBtn = null;
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
    Tspan = document.getElementById("t");
    Cspan = document.getElementById("c");
    WHspan = document.getElementById("wh");
    HPspan = document.getElementById("ship-hp");
    shipControlsCard = document.getElementById("ship-controls");
    shipClearBtn = document.getElementById("ship-clear");
    shipSetBtn = document.getElementById("ship-set");
    shipSelectBtn = document.getElementById("ship-select");
    shipToggleRouteBtn = document.getElementById("ship-toggle-route");
    shipSelectionContainer = document.getElementById("ship-selection");
    shipSelectionLabel = document.getElementById("ship-selection-label");
    shipDeleteBtn = document.getElementById("ship-delete");
    shipSpeedCard = document.getElementById("ship-speed-card");
    shipSpeedSlider = document.getElementById("ship-speed-slider");
    shipSpeedValue = document.getElementById("ship-speed-value");
    missileControlsCard = document.getElementById("missile-controls");
    missileAddRouteBtn = document.getElementById("missile-add-route");
    missileLaunchBtn = document.getElementById("missile-launch");
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
      setShipTool("set");
    });
    shipSelectBtn == null ? void 0 : shipSelectBtn.addEventListener("click", () => {
      setShipTool("select");
    });
    shipToggleRouteBtn == null ? void 0 : shipToggleRouteBtn.addEventListener("click", () => {
      uiStateRef.showShipRoute = !uiStateRef.showShipRoute;
      updateControlHighlights();
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
      setMissileTool("set");
    });
    missileSelectBtn == null ? void 0 : missileSelectBtn.addEventListener("click", () => {
      setMissileTool("select");
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
    if (!shipSelectionContainer || !shipSelectionLabel || !shipDeleteBtn) {
      return;
    }
    const wps = stateRef.me && Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
    const hasValidSelection = selection !== null && selection.index >= 0 && selection.index < wps.length;
    const isShipContext = uiStateRef.inputContext === "ship";
    shipSelectionContainer.style.display = "flex";
    shipSelectionContainer.style.opacity = isShipContext ? "1" : "0.6";
    if (!stateRef.me || !hasValidSelection) {
      shipSelectionLabel.textContent = "";
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
      shipSelectionLabel.textContent = `${displayIndex} \u2014 ${speed.toFixed(0)} u/s`;
      shipDeleteBtn.disabled = !isShipContext;
    }
  }
  function refreshMissileSelectionUI() {
    if (!missileDeleteBtn) return;
    const route = getActiveMissileRoute();
    const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
    const hasSelection = missileSelection !== null && missileSelection !== void 0 && missileSelection.index >= 0 && missileSelection.index < count;
    missileDeleteBtn.disabled = !hasSelection;
    if (missileSelection && hasSelection) {
      missileDeleteBtn.textContent = `Del #${missileSelection.index + 1}`;
    } else {
      missileDeleteBtn.textContent = "Delete";
    }
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
  function setShipTool(tool) {
    if (tool !== "set" && tool !== "select") {
      return;
    }
    if (uiStateRef.shipTool === tool) {
      setInputContext("ship");
      return;
    }
    uiStateRef.shipTool = tool;
    setInputContext("ship");
    updateControlHighlights();
    busRef.emit("ship:toolChanged", { tool });
  }
  function setMissileTool(tool) {
    if (tool !== "set" && tool !== "select") {
      return;
    }
    const previous = uiStateRef.missileTool;
    const changed = previous !== tool;
    if (changed) {
      uiStateRef.missileTool = tool;
      setInputContext("missile");
      if (tool === "set") {
        setMissileSelection(null);
      }
    } else {
      setInputContext("missile");
      updateControlHighlights();
    }
    if (changed) {
      updateControlHighlights();
    }
    busRef.emit("missile:toolChanged", { tool });
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
    setButtonState(shipSetBtn, uiStateRef.shipTool === "set");
    setButtonState(shipSelectBtn, uiStateRef.shipTool === "select");
    setButtonState(shipToggleRouteBtn, uiStateRef.showShipRoute);
    setButtonState(missileSetBtn, uiStateRef.missileTool === "set");
    setButtonState(missileSelectBtn, uiStateRef.missileTool === "select");
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
        setShipTool(uiStateRef.shipTool === "set" ? "select" : "set");
        event.preventDefault();
        return;
      case "KeyC":
        setInputContext("ship");
        clearShipRoute();
        event.preventDefault();
        return;
      case "KeyR":
        uiStateRef.showShipRoute = !uiStateRef.showShipRoute;
        updateControlHighlights();
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
        setMissileTool(uiStateRef.missileTool === "set" ? "select" : "set");
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
    if (!missileLaunchBtn) return;
    const route = getActiveMissileRoute();
    const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
    const remaining = getMissileCooldownRemaining();
    const coolingDown = remaining > 0.05;
    const shouldDisable = !route || count === 0 || coolingDown;
    missileLaunchBtn.disabled = shouldDisable;
    if (!route) {
      missileLaunchBtn.textContent = "Launch missiles";
      return;
    }
    if (coolingDown) {
      missileLaunchBtn.textContent = `Launch in ${remaining.toFixed(1)}s`;
      return;
    }
    if (route.name) {
      missileLaunchBtn.textContent = `Launch ${route.name}`;
    } else {
      missileLaunchBtn.textContent = "Launch missiles";
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
    const hasC = typeof meta.c === "number" && Number.isFinite(meta.c);
    if (hasWidth) {
      world.w = meta.w;
    }
    if (hasHeight) {
      world.h = meta.h;
    }
    if (Cspan) {
      Cspan.textContent = hasC ? meta.c.toFixed(0) : "\u2013";
    }
    if (WHspan) {
      const w = hasWidth ? meta.w : world.w;
      const h = hasHeight ? meta.h : world.h;
      WHspan.textContent = `${w.toFixed(0)}\xD7${h.toFixed(0)}`;
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
    if (Tspan) {
      Tspan.textContent = getApproxServerNow(stateRef).toFixed(2);
    }
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
        id: "missile-set-mode-again",
        target: "missileSet",
        title: "Return to Set mode",
        body: "Switch back to Set so you can chart waypoints on the new missile route.",
        advance: {
          kind: "event",
          event: "missile:toolChanged",
          when: payloadToolEquals("set")
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
      choices.forEach((choice, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.choiceId = choice.id;
        button.textContent = `${index + 1}. ${choice.text}`;
        button.addEventListener("click", () => {
          var _a;
          (_a = content.onChoice) == null ? void 0 : _a.call(content, choice.id);
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
        const choice = activeContent.choices[index - 1];
        (_b = activeContent.onChoice) == null ? void 0 : _b.call(activeContent, choice.id);
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

  // web/src/story/sfx.ts
  var audioCtx = null;
  var lastPlayedAt = 0;
  var ctx2 = null;
  function getAudioContext() {
    if (!ctx2) ctx2 = new AudioContext();
    return ctx2;
  }
  async function resumeAudio() {
    const ac = getAudioContext();
    if (ac.state === "suspended") {
      await ac.resume();
    }
  }
  function ensureContext() {
    if (typeof window === "undefined" || typeof window.AudioContext !== "function") {
      return null;
    }
    if (audioCtx) {
      return audioCtx;
    }
    try {
      audioCtx = new AudioContext();
    } catch (e) {
      audioCtx = null;
    }
    return audioCtx;
  }
  function playDialogueCue(intent) {
    const ctx3 = ensureContext();
    if (!ctx3) return;
    const now = ctx3.currentTime;
    console.log({ now, lastPlayedAt, diff: now - lastPlayedAt });
    if (now - lastPlayedAt < 0.1) {
      console.log("Dialogue cue skipped", intent);
      return;
    }
    lastPlayedAt = now;
    const osc = ctx3.createOscillator();
    const gain = ctx3.createGain();
    osc.type = "sine";
    osc.frequency.value = intent === "factory" ? 420 : 620;
    gain.gain.value = 1e-4;
    gain.gain.setValueAtTime(1e-4, now);
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(5e-4, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx3.destination);
    console.log("Playing dialogue cue", intent, osc.frequency.value);
    osc.start(now);
    osc.stop(now + 0.3);
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
    function applyChoiceFlags(choice) {
      for (const flag of choice.setFlags) {
        setFlag(flag, true);
      }
      for (const flag of choice.clearFlags) {
        setFlag(flag, false);
      }
    }
    function prepareChoices(node) {
      const defs = Array.isArray(node.choices) ? node.choices : [];
      return defs.map((choice, index) => normalizeChoice(choice, index));
    }
    function normalizeChoice(choice, index) {
      var _a, _b, _c;
      const setFlags = /* @__PURE__ */ new Set();
      const clearFlags = /* @__PURE__ */ new Set();
      if (choice.flag) {
        setFlags.add(choice.flag);
      }
      if (Array.isArray(choice.setFlags)) {
        for (const flag of choice.setFlags) {
          if (typeof flag === "string" && flag.trim().length > 0) {
            setFlags.add(flag);
          }
        }
      }
      if (Array.isArray(choice.clearFlags)) {
        for (const flag of choice.clearFlags) {
          if (typeof flag === "string" && flag.trim().length > 0) {
            clearFlags.add(flag);
          }
        }
      }
      return {
        id: (_b = (_a = choice.id) != null ? _a : choice.flag) != null ? _b : `choice-${index}`,
        text: choice.text,
        next: (_c = choice.next) != null ? _c : null,
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
        choices: choices.length > 0 ? choices.map((choice) => ({ id: choice.id, text: choice.text })) : void 0,
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
        text: "Authorization granted. Safety protocol in malfunctioning.",
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
  function waitForUserStart(opts = {}) {
    const { label = "Start Game", requestFullscreen = false, resumeAudio: resumeAudio2 } = opts;
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "start-overlay";
      overlay.innerHTML = `
      <div id="start-container">
        <button id="start-btn" aria-label="${label}">${label}</button>
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
    `;
      document.head.appendChild(style);
      const start = async () => {
        var _a, _b;
        try {
          await (resumeAudio2 == null ? void 0 : resumeAudio2());
        } catch (e) {
        }
        if (requestFullscreen) {
          try {
            await ((_b = (_a = document.documentElement).requestFullscreen) == null ? void 0 : _b.call(_a));
          } catch (e) {
          }
        }
        style.remove();
        overlay.remove();
        resolve();
      };
      const btn = overlay.querySelector("#start-btn");
      btn.addEventListener("click", start, { once: true });
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          start();
        }
      });
      btn.tabIndex = 0;
      btn.focus();
    });
  }

  // web/src/main.ts
  var CALL_SIGN_STORAGE_KEY = "lsd:callsign";
  (async function bootstrap() {
    const qs = new URLSearchParams(window.location.search);
    const room = qs.get("room") || "default";
    const nameParam = sanitizeCallSign(qs.get("name"));
    const storedName = sanitizeCallSign(readStoredCallSign());
    const callSign = nameParam || storedName;
    if (nameParam && nameParam !== storedName) {
      persistCallSign(nameParam);
    }
    const roomLabel = document.getElementById("room-name");
    if (roomLabel) roomLabel.textContent = room;
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
    const game = initGame({ state, uiState, bus });
    const tutorial = mountTutorial(bus);
    let tutorialStarted = false;
    const startTutorial = () => {
      if (tutorialStarted) return;
      tutorialStarted = true;
      clearProgress(BASIC_TUTORIAL_ID);
      tutorial.start({ resume: false });
    };
    const unsubscribeStoryClosed = bus.on("dialogue:closed", ({ chapterId, nodeId }) => {
      if (chapterId !== INTRO_CHAPTER_ID) return;
      if (!INTRO_INITIAL_RESPONSE_IDS.includes(nodeId)) return;
      unsubscribeStoryClosed();
      startTutorial();
    });
    mountStory({ bus, roomId: room });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS50cyIsICJzcmMvdHV0b3JpYWwvaGlnaGxpZ2h0LnRzIiwgInNyYy90dXRvcmlhbC9zdG9yYWdlLnRzIiwgInNyYy90dXRvcmlhbC9yb2xlcy50cyIsICJzcmMvdHV0b3JpYWwvZW5naW5lLnRzIiwgInNyYy90dXRvcmlhbC9zdGVwc19iYXNpYy50cyIsICJzcmMvdHV0b3JpYWwvaW5kZXgudHMiLCAic3JjL3N0b3J5L292ZXJsYXkudHMiLCAic3JjL3N0b3J5L3N0b3JhZ2UudHMiLCAic3JjL3N0b3J5L3NmeC50cyIsICJzcmMvc3RvcnkvZW5naW5lLnRzIiwgInNyYy9zdG9yeS9jaGFwdGVycy9pbnRyby50cyIsICJzcmMvc3RvcnkvaW5kZXgudHMiLCAic3JjL3N0YXJ0LWdhdGUudHMiLCAic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCB0eXBlIFNoaXBDb250ZXh0ID0gXCJzaGlwXCIgfCBcIm1pc3NpbGVcIjtcbmV4cG9ydCB0eXBlIFNoaXBUb29sID0gXCJzZXRcIiB8IFwic2VsZWN0XCI7XG5leHBvcnQgdHlwZSBNaXNzaWxlVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50TWFwIHtcbiAgXCJjb250ZXh0OmNoYW5nZWRcIjogeyBjb250ZXh0OiBTaGlwQ29udGV4dCB9O1xuICBcInNoaXA6dG9vbENoYW5nZWRcIjogeyB0b29sOiBTaGlwVG9vbCB9O1xuICBcInNoaXA6d2F5cG9pbnRBZGRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6bGF1bmNoZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiOiB7IHNlY29uZHNSZW1haW5pbmc6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiOiB2b2lkO1xuICBcImhlbHA6dmlzaWJsZUNoYW5nZWRcIjogeyB2aXNpYmxlOiBib29sZWFuIH07XG4gIFwic3RhdGU6dXBkYXRlZFwiOiB2b2lkO1xuICBcInR1dG9yaWFsOnN0YXJ0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIjogeyBpZDogc3RyaW5nOyBzdGVwSW5kZXg6IG51bWJlcjsgdG90YWw6IG51bWJlciB9O1xuICBcInR1dG9yaWFsOmNvbXBsZXRlZFwiOiB7IGlkOiBzdHJpbmcgfTtcbiAgXCJ0dXRvcmlhbDpza2lwcGVkXCI6IHsgaWQ6IHN0cmluZzsgYXRTdGVwOiBudW1iZXIgfTtcbiAgXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIjogdm9pZDtcbiAgXCJkaWFsb2d1ZTpvcGVuZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjbG9zZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjaG9pY2VcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hvaWNlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJzdG9yeTpmbGFnVXBkYXRlZFwiOiB7IGZsYWc6IHN0cmluZzsgdmFsdWU6IGJvb2xlYW4gfTtcbiAgXCJzdG9yeTpwcm9ncmVzc2VkXCI6IHsgY2hhcHRlcklkOiBzdHJpbmc7IG5vZGVJZDogc3RyaW5nIH07XG59XG5cbmV4cG9ydCB0eXBlIEV2ZW50S2V5ID0ga2V5b2YgRXZlbnRNYXA7XG5leHBvcnQgdHlwZSBFdmVudFBheWxvYWQ8SyBleHRlbmRzIEV2ZW50S2V5PiA9IEV2ZW50TWFwW0tdO1xuZXhwb3J0IHR5cGUgSGFuZGxlcjxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gKHBheWxvYWQ6IEV2ZW50UGF5bG9hZDxLPikgPT4gdm9pZDtcblxuZXhwb3J0IGludGVyZmFjZSBFdmVudEJ1cyB7XG4gIG9uPEsgZXh0ZW5kcyBFdmVudEtleT4oZXZlbnQ6IEssIGhhbmRsZXI6IEhhbmRsZXI8Sz4pOiAoKSA9PiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBFdmVudEtleT4oZXZlbnQ6IEssIHBheWxvYWQ6IEV2ZW50UGF5bG9hZDxLPik6IHZvaWQ7XG4gIGVtaXQ8SyBleHRlbmRzIEV2ZW50S2V5PihldmVudDogSyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFdmVudEJ1cygpOiBFdmVudEJ1cyB7XG4gIGNvbnN0IGhhbmRsZXJzID0gbmV3IE1hcDxFdmVudEtleSwgU2V0PEZ1bmN0aW9uPj4oKTtcbiAgcmV0dXJuIHtcbiAgICBvbihldmVudCwgaGFuZGxlcikge1xuICAgICAgbGV0IHNldCA9IGhhbmRsZXJzLmdldChldmVudCk7XG4gICAgICBpZiAoIXNldCkge1xuICAgICAgICBzZXQgPSBuZXcgU2V0KCk7XG4gICAgICAgIGhhbmRsZXJzLnNldChldmVudCwgc2V0KTtcbiAgICAgIH1cbiAgICAgIHNldC5hZGQoaGFuZGxlcik7XG4gICAgICByZXR1cm4gKCkgPT4gc2V0Py5kZWxldGUoaGFuZGxlcik7XG4gICAgfSxcbiAgICBlbWl0KGV2ZW50OiBFdmVudEtleSwgcGF5bG9hZD86IHVua25vd24pIHtcbiAgICAgIGNvbnN0IHNldCA9IGhhbmRsZXJzLmdldChldmVudCk7XG4gICAgICBpZiAoIXNldCB8fCBzZXQuc2l6ZSA9PT0gMCkgcmV0dXJuO1xuICAgICAgZm9yIChjb25zdCBmbiBvZiBzZXQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAoZm4gYXMgKHZhbHVlPzogdW5rbm93bikgPT4gdm9pZCkocGF5bG9hZCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFtidXNdIGhhbmRsZXIgZm9yICR7ZXZlbnR9IGZhaWxlZGAsIGVycik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgU2hpcENvbnRleHQsIFNoaXBUb29sLCBNaXNzaWxlVG9vbCB9IGZyb20gXCIuL2J1c1wiO1xuXG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fU1BFRUQgPSA0MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9TUEVFRCA9IDI1MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9BR1JPID0gMTAwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUFYX0xJRkVUSU1FID0gMTIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX0xJRkVUSU1FID0gMjA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9TUEVFRF9QRU5BTFRZID0gODA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1BFTkFMVFkgPSA0MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUkVGID0gMjAwMDtcblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlTGltaXRzIHtcbiAgc3BlZWRNaW46IG51bWJlcjtcbiAgc3BlZWRNYXg6IG51bWJlcjtcbiAgYWdyb01pbjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHNwZWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2hpcFNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIGhwPzogbnVtYmVyO1xuICB3YXlwb2ludHM6IFdheXBvaW50W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2hvc3RTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHdheXBvaW50czogTWlzc2lsZVdheXBvaW50W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUNvbmZpZyB7XG4gIHNwZWVkOiBudW1iZXI7XG4gIGFncm9SYWRpdXM6IG51bWJlcjtcbiAgbGlmZXRpbWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1ldGEge1xuICBjPzogbnVtYmVyO1xuICB3PzogbnVtYmVyO1xuICBoPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFwcFN0YXRlIHtcbiAgbm93OiBudW1iZXI7XG4gIG5vd1N5bmNlZEF0OiBudW1iZXI7XG4gIG1lOiBTaGlwU25hcHNob3QgfCBudWxsO1xuICBnaG9zdHM6IEdob3N0U25hcHNob3RbXTtcbiAgbWlzc2lsZXM6IE1pc3NpbGVTbmFwc2hvdFtdO1xuICBtaXNzaWxlUm91dGVzOiBNaXNzaWxlUm91dGVbXTtcbiAgYWN0aXZlTWlzc2lsZVJvdXRlSWQ6IHN0cmluZyB8IG51bGw7XG4gIG5leHRNaXNzaWxlUmVhZHlBdDogbnVtYmVyO1xuICBtaXNzaWxlQ29uZmlnOiBNaXNzaWxlQ29uZmlnO1xuICBtaXNzaWxlTGltaXRzOiBNaXNzaWxlTGltaXRzO1xuICB3b3JsZE1ldGE6IFdvcmxkTWV0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCI7XG4gIGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVUlTdGF0ZSB7XG4gIGlucHV0Q29udGV4dDogU2hpcENvbnRleHQ7XG4gIHNoaXBUb29sOiBTaGlwVG9vbDtcbiAgbWlzc2lsZVRvb2w6IE1pc3NpbGVUb29sO1xuICBzaG93U2hpcFJvdXRlOiBib29sZWFuO1xuICBoZWxwVmlzaWJsZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxVSVN0YXRlKCk6IFVJU3RhdGUge1xuICByZXR1cm4ge1xuICAgIGlucHV0Q29udGV4dDogXCJzaGlwXCIsXG4gICAgc2hpcFRvb2w6IFwic2V0XCIsXG4gICAgbWlzc2lsZVRvb2w6IFwic2V0XCIsXG4gICAgc2hvd1NoaXBSb3V0ZTogdHJ1ZSxcbiAgICBoZWxwVmlzaWJsZTogZmFsc2UsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsU3RhdGUobGltaXRzOiBNaXNzaWxlTGltaXRzID0ge1xuICBzcGVlZE1pbjogTUlTU0lMRV9NSU5fU1BFRUQsXG4gIHNwZWVkTWF4OiBNSVNTSUxFX01BWF9TUEVFRCxcbiAgYWdyb01pbjogTUlTU0lMRV9NSU5fQUdSTyxcbn0pOiBBcHBTdGF0ZSB7XG4gIHJldHVybiB7XG4gICAgbm93OiAwLFxuICAgIG5vd1N5bmNlZEF0OiB0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiXG4gICAgICA/IHBlcmZvcm1hbmNlLm5vdygpXG4gICAgICA6IERhdGUubm93KCksXG4gICAgbWU6IG51bGwsXG4gICAgZ2hvc3RzOiBbXSxcbiAgICBtaXNzaWxlczogW10sXG4gICAgbWlzc2lsZVJvdXRlczogW10sXG4gICAgYWN0aXZlTWlzc2lsZVJvdXRlSWQ6IG51bGwsXG4gICAgbmV4dE1pc3NpbGVSZWFkeUF0OiAwLFxuICAgIG1pc3NpbGVDb25maWc6IHtcbiAgICAgIHNwZWVkOiAxODAsXG4gICAgICBhZ3JvUmFkaXVzOiA4MDAsXG4gICAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKDE4MCwgODAwLCBsaW1pdHMpLFxuICAgIH0sXG4gICAgbWlzc2lsZUxpbWl0czogbGltaXRzLFxuICAgIHdvcmxkTWV0YToge30sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtaXNzaWxlTGlmZXRpbWVGb3Ioc3BlZWQ6IG51bWJlciwgYWdyb1JhZGl1czogbnVtYmVyLCBsaW1pdHM6IE1pc3NpbGVMaW1pdHMgPSB7XG4gIHNwZWVkTWluOiBNSVNTSUxFX01JTl9TUEVFRCxcbiAgc3BlZWRNYXg6IE1JU1NJTEVfTUFYX1NQRUVELFxuICBhZ3JvTWluOiBNSVNTSUxFX01JTl9BR1JPLFxufSk6IG51bWJlciB7XG4gIGNvbnN0IG1pblNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4gOiBNSVNTSUxFX01JTl9TUEVFRDtcbiAgY29uc3QgbWF4U3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCA6IE1JU1NJTEVfTUFYX1NQRUVEO1xuICBjb25zdCBtaW5BZ3JvID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluIDogTUlTU0lMRV9NSU5fQUdSTztcbiAgY29uc3Qgc3BhbiA9IG1heFNwZWVkIC0gbWluU3BlZWQ7XG4gIGNvbnN0IHNwZWVkTm9ybSA9IHNwYW4gPiAwID8gY2xhbXAoKHNwZWVkIC0gbWluU3BlZWQpIC8gc3BhbiwgMCwgMSkgOiAwO1xuICBjb25zdCBhZGp1c3RlZEFncm8gPSBNYXRoLm1heCgwLCBhZ3JvUmFkaXVzIC0gbWluQWdybyk7XG4gIGNvbnN0IGFncm9Ob3JtID0gY2xhbXAoYWRqdXN0ZWRBZ3JvIC8gTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiwgMCwgMSk7XG4gIGNvbnN0IHJlZHVjdGlvbiA9IHNwZWVkTm9ybSAqIE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSArIGFncm9Ob3JtICogTUlTU0lMRV9MSUZFVElNRV9BR1JPX1BFTkFMVFk7XG4gIGNvbnN0IGJhc2UgPSBNSVNTSUxFX01BWF9MSUZFVElNRTtcbiAgcmV0dXJuIGNsYW1wKGJhc2UgLSByZWR1Y3Rpb24sIE1JU1NJTEVfTUlOX0xJRkVUSU1FLCBNSVNTSUxFX01BWF9MSUZFVElNRSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZU1pc3NpbGVDb25maWcoXG4gIGNmZzogUGFydGlhbDxQaWNrPE1pc3NpbGVDb25maWcsIFwic3BlZWRcIiB8IFwiYWdyb1JhZGl1c1wiPj4sXG4gIGZhbGxiYWNrOiBNaXNzaWxlQ29uZmlnLFxuICBsaW1pdHM6IE1pc3NpbGVMaW1pdHMsXG4pOiBNaXNzaWxlQ29uZmlnIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBiYXNlID0gZmFsbGJhY2sgPz8ge1xuICAgIHNwZWVkOiBtaW5TcGVlZCxcbiAgICBhZ3JvUmFkaXVzOiBtaW5BZ3JvLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IobWluU3BlZWQsIG1pbkFncm8sIGxpbWl0cyksXG4gIH07XG4gIGNvbnN0IG1lcmdlZFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA/IChjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgOiBiYXNlLnNwZWVkO1xuICBjb25zdCBtZXJnZWRBZ3JvID0gTnVtYmVyLmlzRmluaXRlKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgPyAoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA6IGJhc2UuYWdyb1JhZGl1cztcbiAgY29uc3Qgc3BlZWQgPSBjbGFtcChtZXJnZWRTcGVlZCwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgY29uc3QgYWdyb1JhZGl1cyA9IE1hdGgubWF4KG1pbkFncm8sIG1lcmdlZEFncm8pO1xuICByZXR1cm4ge1xuICAgIHNwZWVkLFxuICAgIGFncm9SYWRpdXMsXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihzcGVlZCwgYWdyb1JhZGl1cywgbGltaXRzKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vbm90b25pY05vdygpOiBudW1iZXIge1xuICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgfVxuICByZXR1cm4gRGF0ZS5ub3coKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lV2F5cG9pbnRMaXN0KGxpc3Q6IFdheXBvaW50W10gfCB1bmRlZmluZWQgfCBudWxsKTogV2F5cG9pbnRbXSB7XG4gIGlmICghQXJyYXkuaXNBcnJheShsaXN0KSkgcmV0dXJuIFtdO1xuICByZXR1cm4gbGlzdC5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlOiBBcHBTdGF0ZSwgbGltaXRzOiBQYXJ0aWFsPE1pc3NpbGVMaW1pdHM+KTogdm9pZCB7XG4gIHN0YXRlLm1pc3NpbGVMaW1pdHMgPSB7XG4gICAgc3BlZWRNaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4sXG4gICAgc3BlZWRNYXg6IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4ISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXgsXG4gICAgYWdyb01pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuYWdyb01pbixcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyB0eXBlIEV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQge1xuICB0eXBlIEFwcFN0YXRlLFxuICB0eXBlIE1pc3NpbGVSb3V0ZSxcbiAgbW9ub3RvbmljTm93LFxuICBzYW5pdGl6ZU1pc3NpbGVDb25maWcsXG4gIHVwZGF0ZU1pc3NpbGVMaW1pdHMsXG59IGZyb20gXCIuL3N0YXRlXCI7XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVSb3V0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU/OiBzdHJpbmc7XG4gIHdheXBvaW50cz86IFNlcnZlck1pc3NpbGVXYXlwb2ludFtdO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyU2hpcFN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIGhwPzogbnVtYmVyO1xuICB3YXlwb2ludHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBzcGVlZD86IG51bWJlciB9Pjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlck1pc3NpbGVTdGF0ZSB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNlcnZlclN0YXRlTWVzc2FnZSB7XG4gIHR5cGU6IFwic3RhdGVcIjtcbiAgbm93OiBudW1iZXI7XG4gIG5leHRfbWlzc2lsZV9yZWFkeT86IG51bWJlcjtcbiAgbWU/OiBTZXJ2ZXJTaGlwU3RhdGUgfCBudWxsO1xuICBnaG9zdHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB2eDogbnVtYmVyOyB2eTogbnVtYmVyIH0+O1xuICBtaXNzaWxlcz86IFNlcnZlck1pc3NpbGVTdGF0ZVtdO1xuICBtaXNzaWxlX3JvdXRlcz86IFNlcnZlck1pc3NpbGVSb3V0ZVtdO1xuICBtaXNzaWxlX2NvbmZpZz86IHtcbiAgICBzcGVlZD86IG51bWJlcjtcbiAgICBzcGVlZF9taW4/OiBudW1iZXI7XG4gICAgc3BlZWRfbWF4PzogbnVtYmVyO1xuICAgIGFncm9fcmFkaXVzPzogbnVtYmVyO1xuICAgIGFncm9fbWluPzogbnVtYmVyO1xuICAgIGxpZmV0aW1lPzogbnVtYmVyO1xuICB9IHwgbnVsbDtcbiAgYWN0aXZlX21pc3NpbGVfcm91dGU/OiBzdHJpbmcgfCBudWxsO1xuICBtZXRhPzoge1xuICAgIGM/OiBudW1iZXI7XG4gICAgdz86IG51bWJlcjtcbiAgICBoPzogbnVtYmVyO1xuICB9O1xufVxuXG5pbnRlcmZhY2UgQ29ubmVjdE9wdGlvbnMge1xuICByb29tOiBzdHJpbmc7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb25TdGF0ZVVwZGF0ZWQ/OiAoKSA9PiB2b2lkO1xuICBvbk9wZW4/OiAoc29ja2V0OiBXZWJTb2NrZXQpID0+IHZvaWQ7XG59XG5cbmxldCB3czogV2ViU29ja2V0IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZCB7XG4gIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHJldHVybjtcbiAgY29uc3QgZGF0YSA9IHR5cGVvZiBwYXlsb2FkID09PSBcInN0cmluZ1wiID8gcGF5bG9hZCA6IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpO1xuICB3cy5zZW5kKGRhdGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdFdlYlNvY2tldCh7IHJvb20sIHN0YXRlLCBidXMsIG9uU3RhdGVVcGRhdGVkLCBvbk9wZW4gfTogQ29ubmVjdE9wdGlvbnMpOiB2b2lkIHtcbiAgY29uc3QgcHJvdG9jb2wgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgPyBcIndzczovL1wiIDogXCJ3czovL1wiO1xuICB3cyA9IG5ldyBXZWJTb2NrZXQoYCR7cHJvdG9jb2x9JHt3aW5kb3cubG9jYXRpb24uaG9zdH0vd3M/cm9vbT0ke2VuY29kZVVSSUNvbXBvbmVudChyb29tKX1gKTtcbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm9wZW5cIiwgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFwiW3dzXSBvcGVuXCIpO1xuICAgIGNvbnN0IHNvY2tldCA9IHdzO1xuICAgIGlmIChzb2NrZXQgJiYgb25PcGVuKSB7XG4gICAgICBvbk9wZW4oc29ja2V0KTtcbiAgICB9XG4gIH0pO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwiY2xvc2VcIiwgKCkgPT4gY29uc29sZS5sb2coXCJbd3NdIGNsb3NlXCIpKTtcblxuICBsZXQgcHJldlJvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+KCk7XG4gIGxldCBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgcHJldk1pc3NpbGVDb3VudCA9IDA7XG5cbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgZGF0YSA9IHNhZmVQYXJzZShldmVudC5kYXRhKTtcbiAgICBpZiAoIWRhdGEgfHwgZGF0YS50eXBlICE9PSBcInN0YXRlXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaGFuZGxlU3RhdGVNZXNzYWdlKHN0YXRlLCBkYXRhLCBidXMsIHByZXZSb3V0ZXMsIHByZXZBY3RpdmVSb3V0ZSwgcHJldk1pc3NpbGVDb3VudCk7XG4gICAgcHJldlJvdXRlcyA9IG5ldyBNYXAoc3RhdGUubWlzc2lsZVJvdXRlcy5tYXAoKHJvdXRlKSA9PiBbcm91dGUuaWQsIGNsb25lUm91dGUocm91dGUpXSkpO1xuICAgIHByZXZBY3RpdmVSb3V0ZSA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIHByZXZNaXNzaWxlQ291bnQgPSBzdGF0ZS5taXNzaWxlcy5sZW5ndGg7XG4gICAgYnVzLmVtaXQoXCJzdGF0ZTp1cGRhdGVkXCIpO1xuICAgIG9uU3RhdGVVcGRhdGVkPy4oKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVN0YXRlTWVzc2FnZShcbiAgc3RhdGU6IEFwcFN0YXRlLFxuICBtc2c6IFNlcnZlclN0YXRlTWVzc2FnZSxcbiAgYnVzOiBFdmVudEJ1cyxcbiAgcHJldlJvdXRlczogTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPixcbiAgcHJldkFjdGl2ZVJvdXRlOiBzdHJpbmcgfCBudWxsLFxuICBwcmV2TWlzc2lsZUNvdW50OiBudW1iZXIsXG4pOiB2b2lkIHtcbiAgc3RhdGUubm93ID0gbXNnLm5vdztcbiAgc3RhdGUubm93U3luY2VkQXQgPSBtb25vdG9uaWNOb3coKTtcbiAgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0ID0gTnVtYmVyLmlzRmluaXRlKG1zZy5uZXh0X21pc3NpbGVfcmVhZHkpID8gbXNnLm5leHRfbWlzc2lsZV9yZWFkeSEgOiAwO1xuICBzdGF0ZS5tZSA9IG1zZy5tZSA/IHtcbiAgICB4OiBtc2cubWUueCxcbiAgICB5OiBtc2cubWUueSxcbiAgICB2eDogbXNnLm1lLnZ4LFxuICAgIHZ5OiBtc2cubWUudnksXG4gICAgaHA6IG1zZy5tZS5ocCxcbiAgICB3YXlwb2ludHM6IEFycmF5LmlzQXJyYXkobXNnLm1lLndheXBvaW50cylcbiAgICAgID8gbXNnLm1lLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogTnVtYmVyLmlzRmluaXRlKHdwLnNwZWVkKSA/IHdwLnNwZWVkISA6IDE4MCB9KSlcbiAgICAgIDogW10sXG4gIH0gOiBudWxsO1xuICBzdGF0ZS5naG9zdHMgPSBBcnJheS5pc0FycmF5KG1zZy5naG9zdHMpID8gbXNnLmdob3N0cy5zbGljZSgpIDogW107XG4gIHN0YXRlLm1pc3NpbGVzID0gQXJyYXkuaXNBcnJheShtc2cubWlzc2lsZXMpID8gbXNnLm1pc3NpbGVzLnNsaWNlKCkgOiBbXTtcblxuICBjb25zdCByb3V0ZXNGcm9tU2VydmVyID0gQXJyYXkuaXNBcnJheShtc2cubWlzc2lsZV9yb3V0ZXMpID8gbXNnLm1pc3NpbGVfcm91dGVzIDogW107XG4gIGNvbnN0IG5ld1JvdXRlczogTWlzc2lsZVJvdXRlW10gPSByb3V0ZXNGcm9tU2VydmVyLm1hcCgocm91dGUpID0+ICh7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUgfHwgcm91dGUuaWQgfHwgXCJSb3V0ZVwiLFxuICAgIHdheXBvaW50czogQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpXG4gICAgICA/IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyB4OiB3cC54LCB5OiB3cC55IH0pKVxuICAgICAgOiBbXSxcbiAgfSkpO1xuXG4gIGRpZmZSb3V0ZXMocHJldlJvdXRlcywgbmV3Um91dGVzLCBidXMpO1xuICBzdGF0ZS5taXNzaWxlUm91dGVzID0gbmV3Um91dGVzO1xuXG4gIGNvbnN0IG5leHRBY3RpdmUgPSB0eXBlb2YgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlID09PSBcInN0cmluZ1wiICYmIG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZS5sZW5ndGggPiAwXG4gICAgPyBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGVcbiAgICA6IG5ld1JvdXRlcy5sZW5ndGggPiAwXG4gICAgICA/IG5ld1JvdXRlc1swXS5pZFxuICAgICAgOiBudWxsO1xuICBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG5leHRBY3RpdmU7XG4gIGlmIChuZXh0QWN0aXZlICE9PSBwcmV2QWN0aXZlUm91dGUpIHtcbiAgICBidXMuZW1pdChcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsIHsgcm91dGVJZDogbmV4dEFjdGl2ZSA/PyBudWxsIH0pO1xuICB9XG5cbiAgaWYgKG1zZy5taXNzaWxlX2NvbmZpZykge1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21pbikgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9tYXgpIHx8IE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4pKSB7XG4gICAgICB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlLCB7XG4gICAgICAgIHNwZWVkTWluOiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluLFxuICAgICAgICBzcGVlZE1heDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCxcbiAgICAgICAgYWdyb01pbjogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fbWluLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyh7XG4gICAgICBzcGVlZDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkLFxuICAgICAgYWdyb1JhZGl1czogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fcmFkaXVzLFxuICAgIH0sIHN0YXRlLm1pc3NpbGVDb25maWcsIHN0YXRlLm1pc3NpbGVMaW1pdHMpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLmxpZmV0aW1lKSkge1xuICAgICAgc2FuaXRpemVkLmxpZmV0aW1lID0gbXNnLm1pc3NpbGVfY29uZmlnLmxpZmV0aW1lITtcbiAgICB9XG4gICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IHNhbml0aXplZDtcbiAgfVxuXG4gIGNvbnN0IG1ldGEgPSBtc2cubWV0YSA/PyB7fTtcbiAgY29uc3QgaGFzQyA9IHR5cGVvZiBtZXRhLmMgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuYyk7XG4gIGNvbnN0IGhhc1cgPSB0eXBlb2YgbWV0YS53ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLncpO1xuICBjb25zdCBoYXNIID0gdHlwZW9mIG1ldGEuaCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5oKTtcbiAgc3RhdGUud29ybGRNZXRhID0ge1xuICAgIGM6IGhhc0MgPyBtZXRhLmMhIDogc3RhdGUud29ybGRNZXRhLmMsXG4gICAgdzogaGFzVyA/IG1ldGEudyEgOiBzdGF0ZS53b3JsZE1ldGEudyxcbiAgICBoOiBoYXNIID8gbWV0YS5oISA6IHN0YXRlLndvcmxkTWV0YS5oLFxuICB9O1xuXG4gIGlmIChzdGF0ZS5taXNzaWxlcy5sZW5ndGggPiBwcmV2TWlzc2lsZUNvdW50KSB7XG4gICAgY29uc3QgYWN0aXZlUm91dGVJZCA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIGlmIChhY3RpdmVSb3V0ZUlkKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoZWRcIiwgeyByb3V0ZUlkOiBhY3RpdmVSb3V0ZUlkIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoZWRcIiwgeyByb3V0ZUlkOiBcIlwiIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNvb2xkb3duUmVtYWluaW5nID0gTWF0aC5tYXgoMCwgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlKSk7XG4gIGJ1cy5lbWl0KFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIiwgeyBzZWNvbmRzUmVtYWluaW5nOiBjb29sZG93blJlbWFpbmluZyB9KTtcbn1cblxuZnVuY3Rpb24gZGlmZlJvdXRlcyhwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LCBuZXh0Um91dGVzOiBNaXNzaWxlUm91dGVbXSwgYnVzOiBFdmVudEJ1cyk6IHZvaWQge1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3Qgcm91dGUgb2YgbmV4dFJvdXRlcykge1xuICAgIHNlZW4uYWRkKHJvdXRlLmlkKTtcbiAgICBjb25zdCBwcmV2ID0gcHJldlJvdXRlcy5nZXQocm91dGUuaWQpO1xuICAgIGlmICghcHJldikge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlQWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAocm91dGUubmFtZSAhPT0gcHJldi5uYW1lKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVSZW5hbWVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIG5hbWU6IHJvdXRlLm5hbWUgfSk7XG4gICAgfVxuICAgIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleDogcm91dGUud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfSBlbHNlIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoIDwgcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiBwcmV2LndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xuICAgIH1cbiAgICBpZiAocHJldi53YXlwb2ludHMubGVuZ3RoID4gMCAmJiByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IFtyb3V0ZUlkXSBvZiBwcmV2Um91dGVzKSB7XG4gICAgaWYgKCFzZWVuLmhhcyhyb3V0ZUlkKSkge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlRGVsZXRlZFwiLCB7IHJvdXRlSWQgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNsb25lUm91dGUocm91dGU6IE1pc3NpbGVSb3V0ZSk6IE1pc3NpbGVSb3V0ZSB7XG4gIHJldHVybiB7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUsXG4gICAgd2F5cG9pbnRzOiByb3V0ZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHsgLi4ud3AgfSkpLFxuICB9O1xufVxuXG5mdW5jdGlvbiBzYWZlUGFyc2UodmFsdWU6IHVua25vd24pOiBTZXJ2ZXJTdGF0ZU1lc3NhZ2UgfCBudWxsIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UodmFsdWUpIGFzIFNlcnZlclN0YXRlTWVzc2FnZTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS53YXJuKFwiW3dzXSBmYWlsZWQgdG8gcGFyc2UgbWVzc2FnZVwiLCBlcnIpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGU6IEFwcFN0YXRlKTogbnVtYmVyIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93KSkge1xuICAgIHJldHVybiAwO1xuICB9XG4gIGNvbnN0IHN5bmNlZEF0ID0gTnVtYmVyLmlzRmluaXRlKHN0YXRlLm5vd1N5bmNlZEF0KSA/IHN0YXRlLm5vd1N5bmNlZEF0IDogbnVsbDtcbiAgaWYgKCFzeW5jZWRBdCkge1xuICAgIHJldHVybiBzdGF0ZS5ub3c7XG4gIH1cbiAgY29uc3QgZWxhcHNlZE1zID0gbW9ub3RvbmljTm93KCkgLSBzeW5jZWRBdDtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZWxhcHNlZE1zKSB8fCBlbGFwc2VkTXMgPCAwKSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICByZXR1cm4gc3RhdGUubm93ICsgZWxhcHNlZE1zIC8gMTAwMDtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgeyBnZXRBcHByb3hTZXJ2ZXJOb3csIHNlbmRNZXNzYWdlIH0gZnJvbSBcIi4vbmV0XCI7XG5pbXBvcnQge1xuICB0eXBlIEFwcFN0YXRlLFxuICB0eXBlIE1pc3NpbGVSb3V0ZSxcbiAgdHlwZSBNaXNzaWxlU2VsZWN0aW9uLFxuICB0eXBlIFNlbGVjdGlvbixcbiAgdHlwZSBVSVN0YXRlLFxuICBjbGFtcCxcbiAgc2FuaXRpemVNaXNzaWxlQ29uZmlnLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHtcbiAgTUlTU0lMRV9NSU5fU1BFRUQsXG4gIE1JU1NJTEVfTUFYX1NQRUVELFxuICBNSVNTSUxFX01JTl9BR1JPLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG5pbnRlcmZhY2UgSW5pdEdhbWVPcHRpb25zIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xufVxuXG5pbnRlcmZhY2UgR2FtZUNvbnRyb2xsZXIge1xuICBvblN0YXRlVXBkYXRlZCgpOiB2b2lkO1xufVxuXG5sZXQgc3RhdGVSZWY6IEFwcFN0YXRlO1xubGV0IHVpU3RhdGVSZWY6IFVJU3RhdGU7XG5sZXQgYnVzUmVmOiBFdmVudEJ1cztcblxubGV0IGN2OiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEIHwgbnVsbCA9IG51bGw7XG5sZXQgVHNwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgQ3NwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgV0hzcGFuOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IEhQc3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwQ29udHJvbHNDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBDbGVhckJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFRvZ2dsZVJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTZWxlY3Rpb25Db250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNlbGVjdGlvbkxhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IG1pc3NpbGVDb250cm9sc0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUFkZFJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVMYXVuY2hCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU2VsZWN0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUFncm9TbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb1ZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNwYXduQm90QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgcm91dGVQcmV2QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJvdXRlTmV4dEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByb3V0ZU1lbnVUb2dnbGU6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcm91dGVNZW51OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBkZWxldGVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVSb3V0ZU5hbWVMYWJlbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlUm91dGVDb3VudExhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgaGVscFRvZ2dsZTogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwQ2xvc2VCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVscFRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCBzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTZWxlY3Rpb246IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcbmxldCBkZWZhdWx0U3BlZWQgPSAxNTA7XG5sZXQgbGFzdExvb3BUczogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgbGFzdE1pc3NpbGVDb25maWdTZW50OiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5jb25zdCBsZWdEYXNoT2Zmc2V0cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5cbmNvbnN0IEhFTFBfVEVYVCA9IFtcbiAgXCJQcmltYXJ5IE1vZGVzXCIsXG4gIFwiICAxIFx1MjAxMyBUb2dnbGUgc2hpcCBuYXZpZ2F0aW9uIG1vZGVcIixcbiAgXCIgIDIgXHUyMDEzIFRvZ2dsZSBtaXNzaWxlIGNvb3JkaW5hdGlvbiBtb2RlXCIsXG4gIFwiXCIsXG4gIFwiU2hpcCBOYXZpZ2F0aW9uXCIsXG4gIFwiICBUIFx1MjAxMyBTd2l0Y2ggYmV0d2VlbiBzZXQvc2VsZWN0XCIsXG4gIFwiICBDIFx1MjAxMyBDbGVhciBhbGwgd2F5cG9pbnRzXCIsXG4gIFwiICBSIFx1MjAxMyBUb2dnbGUgc2hvdyByb3V0ZVwiLFxuICBcIiAgWyAvIF0gXHUyMDEzIEFkanVzdCB3YXlwb2ludCBzcGVlZFwiLFxuICBcIiAgU2hpZnQrWyAvIF0gXHUyMDEzIENvYXJzZSBzcGVlZCBhZGp1c3RcIixcbiAgXCIgIFRhYiAvIFNoaWZ0K1RhYiBcdTIwMTMgQ3ljbGUgd2F5cG9pbnRzXCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBmcm9tIHNlbGVjdGVkIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiTWlzc2lsZSBDb29yZGluYXRpb25cIixcbiAgXCIgIE4gXHUyMDEzIEFkZCBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICBcIiAgTCBcdTIwMTMgTGF1bmNoIG1pc3NpbGVzXCIsXG4gIFwiICBFIFx1MjAxMyBTd2l0Y2ggYmV0d2VlbiBzZXQvc2VsZWN0XCIsXG4gIFwiICAsIC8gLiBcdTIwMTMgQWRqdXN0IGFncm8gcmFkaXVzXCIsXG4gIFwiICA7IC8gJyBcdTIwMTMgQWRqdXN0IG1pc3NpbGUgc3BlZWRcIixcbiAgXCIgIFNoaWZ0K3NsaWRlciBrZXlzIFx1MjAxMyBDb2Fyc2UgYWRqdXN0XCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBzZWxlY3RlZCBtaXNzaWxlIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiR2VuZXJhbFwiLFxuICBcIiAgPyBcdTIwMTMgVG9nZ2xlIHRoaXMgb3ZlcmxheVwiLFxuICBcIiAgRXNjIFx1MjAxMyBDYW5jZWwgc2VsZWN0aW9uIG9yIGNsb3NlIG92ZXJsYXlcIixcbl0uam9pbihcIlxcblwiKTtcblxuY29uc3Qgd29ybGQgPSB7IHc6IDgwMDAsIGg6IDQ1MDAgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRHYW1lKHsgc3RhdGUsIHVpU3RhdGUsIGJ1cyB9OiBJbml0R2FtZU9wdGlvbnMpOiBHYW1lQ29udHJvbGxlciB7XG4gIHN0YXRlUmVmID0gc3RhdGU7XG4gIHVpU3RhdGVSZWYgPSB1aVN0YXRlO1xuICBidXNSZWYgPSBidXM7XG5cbiAgY2FjaGVEb20oKTtcbiAgaWYgKCFjdikge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbnZhcyBlbGVtZW50ICNjdiBub3QgZm91bmRcIik7XG4gIH1cbiAgY3R4ID0gY3YuZ2V0Q29udGV4dChcIjJkXCIpO1xuXG4gIGJpbmRMaXN0ZW5lcnMoKTtcbiAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG5cbiAgcmV0dXJuIHtcbiAgICBvblN0YXRlVXBkYXRlZCgpIHtcbiAgICAgIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUoKTtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuICAgICAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNhY2hlRG9tKCk6IHZvaWQge1xuICBjdiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3ZcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBjdHggPSBjdj8uZ2V0Q29udGV4dChcIjJkXCIpID8/IG51bGw7XG4gIFRzcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0XCIpO1xuICBDc3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY1wiKTtcbiAgV0hzcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ3aFwiKTtcbiAgSFBzcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWhwXCIpO1xuICBzaGlwQ29udHJvbHNDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNvbnRyb2xzXCIpO1xuICBzaGlwQ2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTZWxlY3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc2hpcFRvZ2dsZVJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXRvZ2dsZS1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTZWxlY3Rpb25Db250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0aW9uXCIpO1xuICBzaGlwU2VsZWN0aW9uTGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0aW9uLWxhYmVsXCIpO1xuICBzaGlwRGVsZXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTcGVlZENhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtY2FyZFwiKTtcbiAgc2hpcFNwZWVkU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgc2hpcFNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtdmFsdWVcIik7XG5cbiAgbWlzc2lsZUNvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1jb250cm9sc1wiKTtcbiAgbWlzc2lsZUFkZFJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFkZC1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVMYXVuY2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVNldEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVEZWxldGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtZGVsZXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVNwZWVkQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1jYXJkXCIpO1xuICBtaXNzaWxlU3BlZWRTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC12YWx1ZVwiKTtcbiAgbWlzc2lsZUFncm9DYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tY2FyZFwiKTtcbiAgbWlzc2lsZUFncm9TbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVBZ3JvVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby12YWx1ZVwiKTtcblxuICBzcGF3bkJvdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVQcmV2QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1wcmV2XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVOZXh0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1uZXh0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVNZW51VG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51LXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHJvdXRlTWVudSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbWVudVwiKTtcbiAgcmVuYW1lTWlzc2lsZVJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyZW5hbWUtbWlzc2lsZS1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVsZXRlLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNsZWFyLW1pc3NpbGUtd2F5cG9pbnRzXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVJvdXRlTmFtZUxhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXJvdXRlLW5hbWVcIik7XG4gIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtY291bnRcIik7XG5cbiAgaGVscFRvZ2dsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC10b2dnbGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBoZWxwT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC1vdmVybGF5XCIpO1xuICBoZWxwQ2xvc2VCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtY2xvc2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBoZWxwVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC10ZXh0XCIpO1xuXG4gIGRlZmF1bHRTcGVlZCA9IHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyPy52YWx1ZSA/PyBcIjE1MFwiKTtcbn1cblxuZnVuY3Rpb24gYmluZExpc3RlbmVycygpOiB2b2lkIHtcbiAgaWYgKCFjdikgcmV0dXJuO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcmRvd25cIiwgb25DYW52YXNQb2ludGVyRG93bik7XG5cbiAgc3Bhd25Cb3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcInNwYXduX2JvdFwiIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwiYm90OnNwYXduUmVxdWVzdGVkXCIpO1xuICB9KTtcblxuICBzaGlwQ2xlYXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICBjbGVhclNoaXBSb3V0ZSgpO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDpjbGVhckludm9rZWRcIik7XG4gIH0pO1xuXG4gIHNoaXBTZXRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0U2hpcFRvb2woXCJzZXRcIik7XG4gIH0pO1xuXG4gIHNoaXBTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0U2hpcFRvb2woXCJzZWxlY3RcIik7XG4gIH0pO1xuXG4gIHNoaXBUb2dnbGVSb3V0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICB1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUgPSAhdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlO1xuICAgIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gIH0pO1xuXG4gIHNoaXBTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVTcGVlZExhYmVsKHZhbHVlKTtcbiAgICBkZWZhdWx0U3BlZWQgPSB2YWx1ZTtcbiAgICBpZiAoc2VsZWN0aW9uICYmIHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSAmJiBzdGF0ZVJlZi5tZS53YXlwb2ludHNbc2VsZWN0aW9uLmluZGV4XSkge1xuICAgICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcInVwZGF0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4LCBzcGVlZDogdmFsdWUgfSk7XG4gICAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHNbc2VsZWN0aW9uLmluZGV4XS5zcGVlZCA9IHZhbHVlO1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgIH1cbiAgICBidXNSZWYuZW1pdChcInNoaXA6c3BlZWRDaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gIH0pO1xuXG4gIHNoaXBEZWxldGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICBkZWxldGVTZWxlY3RlZFNoaXBXYXlwb2ludCgpO1xuICB9KTtcblxuICBtaXNzaWxlQWRkUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiYWRkX21pc3NpbGVfcm91dGVcIiB9KTtcbiAgfSk7XG5cbiAgbWlzc2lsZUxhdW5jaEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICB9KTtcblxuICBtaXNzaWxlU2V0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldE1pc3NpbGVUb29sKFwic2V0XCIpO1xuICB9KTtcblxuICBtaXNzaWxlU2VsZWN0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldE1pc3NpbGVUb29sKFwic2VsZWN0XCIpO1xuICB9KTtcblxuICBtaXNzaWxlRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNwZWVkU2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHZhbHVlKSkgcmV0dXJuO1xuICAgIHVwZGF0ZU1pc3NpbGVDb25maWdGcm9tVUkoeyBzcGVlZDogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBtaXNzaWxlQWdyb1NsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKHsgYWdyb1JhZGl1czogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmFncm9DaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gIH0pO1xuXG4gIHJvdXRlUHJldkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKC0xKSk7XG4gIHJvdXRlTmV4dEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKDEpKTtcblxuICByb3V0ZU1lbnVUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGlmICghcm91dGVNZW51IHx8ICFyb3V0ZU1lbnUuY2xhc3NMaXN0LmNvbnRhaW5zKFwidmlzaWJsZVwiKSkgcmV0dXJuO1xuICAgIGlmIChldmVudC50YXJnZXQgPT09IHJvdXRlTWVudVRvZ2dsZSkgcmV0dXJuO1xuICAgIGlmIChyb3V0ZU1lbnUuY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpKSByZXR1cm47XG4gICAgcm91dGVNZW51LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICB9KTtcblxuICByZW5hbWVNaXNzaWxlUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUpIHJldHVybjtcbiAgICBjb25zdCBuYW1lID0gd2luZG93LnByb21wdChcIlJlbmFtZSByb3V0ZVwiLCByb3V0ZS5uYW1lIHx8IFwiXCIpO1xuICAgIGlmIChuYW1lID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3QgdHJpbW1lZCA9IG5hbWUudHJpbSgpO1xuICAgIGlmICghdHJpbW1lZCkgcmV0dXJuO1xuICAgIHJvdXRlLm5hbWUgPSB0cmltbWVkO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJyZW5hbWVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgcm91dGVfbmFtZTogdHJpbW1lZCxcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgaWYgKCF3aW5kb3cuY29uZmlybShgRGVsZXRlICR7cm91dGUubmFtZX0/YCkpIHJldHVybjtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmIChyb3V0ZXMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJvdXRlLndheXBvaW50cyA9IFtdO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGF0ZVJlZi5taXNzaWxlUm91dGVzID0gcm91dGVzLmZpbHRlcigocikgPT4gci5pZCAhPT0gcm91dGUuaWQpO1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubWlzc2lsZVJvdXRlcztcbiAgICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcmVtYWluaW5nLmxlbmd0aCA+IDAgPyByZW1haW5pbmdbMF0uaWQgOiBudWxsO1xuICAgIH1cbiAgICBtaXNzaWxlU2VsZWN0aW9uID0gbnVsbDtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImRlbGV0ZV9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICByb3V0ZU1lbnU/LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJjbGVhcl9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gW107XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IG51bGw7XG4gICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIH0pO1xuXG4gIGhlbHBUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SGVscFZpc2libGUodHJ1ZSk7XG4gIH0pO1xuXG4gIGhlbHBDbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRIZWxwVmlzaWJsZShmYWxzZSk7XG4gIH0pO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbldpbmRvd0tleURvd24sIHsgY2FwdHVyZTogZmFsc2UgfSk7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlckRvd24oZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8ICFjdHgpIHJldHVybjtcbiAgaWYgKGhlbHBPdmVybGF5Py5jbGFzc0xpc3QuY29udGFpbnMoXCJ2aXNpYmxlXCIpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJlY3QgPSBjdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3Qgc2NhbGVYID0gcmVjdC53aWR0aCAhPT0gMCA/IGN2LndpZHRoIC8gcmVjdC53aWR0aCA6IDE7XG4gIGNvbnN0IHNjYWxlWSA9IHJlY3QuaGVpZ2h0ICE9PSAwID8gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQgOiAxO1xuICBjb25zdCB4ID0gKGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICBjb25zdCB5ID0gKGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcCkgKiBzY2FsZVk7XG4gIGNvbnN0IGNhbnZhc1BvaW50ID0geyB4LCB5IH07XG4gIGNvbnN0IHdvcmxkUG9pbnQgPSBjYW52YXNUb1dvcmxkKGNhbnZhc1BvaW50KTtcblxuICBjb25zdCBjb250ZXh0ID0gdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcbiAgaWYgKGNvbnRleHQgPT09IFwibWlzc2lsZVwiKSB7XG4gICAgaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICB9IGVsc2Uge1xuICAgIGhhbmRsZVNoaXBQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgfVxuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTcGVlZExhYmVsKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKHNoaXBTcGVlZFZhbHVlKSB7XG4gICAgc2hpcFNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBOdW1iZXIodmFsdWUpLnRvRml4ZWQoMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U2hpcFNsaWRlclZhbHVlKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFzaGlwU3BlZWRTbGlkZXIpIHJldHVybjtcbiAgc2hpcFNwZWVkU2xpZGVyLnZhbHVlID0gU3RyaW5nKHZhbHVlKTtcbiAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiBNaXNzaWxlUm91dGUgfCBudWxsIHtcbiAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgaWYgKHJvdXRlcy5sZW5ndGggPT09IDApIHtcbiAgICBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG51bGw7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaWYgKCFzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCB8fCAhcm91dGVzLnNvbWUoKHJvdXRlKSA9PiByb3V0ZS5pZCA9PT0gc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQpKSB7XG4gICAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSByb3V0ZXNbMF0uaWQ7XG4gIH1cbiAgcmV0dXJuIHJvdXRlcy5maW5kKChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbCB7XG4gIHJldHVybiBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gIGNvbnN0IGFjdGl2ZVJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmIChtaXNzaWxlUm91dGVOYW1lTGFiZWwpIHtcbiAgICBpZiAoIWFjdGl2ZVJvdXRlKSB7XG4gICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSByb3V0ZXMubGVuZ3RoID09PSAwID8gXCJObyByb3V0ZVwiIDogXCJSb3V0ZVwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBtaXNzaWxlUm91dGVOYW1lTGFiZWwudGV4dENvbnRlbnQgPSBhY3RpdmVSb3V0ZS5uYW1lIHx8IFwiUm91dGVcIjtcbiAgICB9XG4gIH1cblxuICBpZiAobWlzc2lsZVJvdXRlQ291bnRMYWJlbCkge1xuICAgIGNvbnN0IGNvdW50ID0gYWN0aXZlUm91dGUgJiYgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpID8gYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gICAgbWlzc2lsZVJvdXRlQ291bnRMYWJlbC50ZXh0Q29udGVudCA9IGAke2NvdW50fSBwdHNgO1xuICB9XG5cbiAgaWYgKGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bikge1xuICAgIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9IHJvdXRlcy5sZW5ndGggPD0gMTtcbiAgfVxuICBpZiAocmVuYW1lTWlzc2lsZVJvdXRlQnRuKSB7XG4gICAgcmVuYW1lTWlzc2lsZVJvdXRlQnRuLmRpc2FibGVkID0gIWFjdGl2ZVJvdXRlO1xuICB9XG4gIGlmIChjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4pIHtcbiAgICBjb25zdCBjb3VudCA9IGFjdGl2ZVJvdXRlICYmIEFycmF5LmlzQXJyYXkoYWN0aXZlUm91dGUud2F5cG9pbnRzKSA/IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZSB8fCBjb3VudCA9PT0gMDtcbiAgfVxuICBpZiAocm91dGVQcmV2QnRuKSB7XG4gICAgcm91dGVQcmV2QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICB9XG4gIGlmIChyb3V0ZU5leHRCdG4pIHtcbiAgICByb3V0ZU5leHRCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gIH1cblxuICB1cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBzeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk6IHZvaWQge1xuICBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgYWN0aXZlUm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3Qgcm91dGVIYXNTZWxlY3Rpb24gPVxuICAgICEhYWN0aXZlUm91dGUgJiZcbiAgICBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgJiZcbiAgICAhIW1pc3NpbGVTZWxlY3Rpb24gJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgYWN0aXZlUm91dGUud2F5cG9pbnRzLmxlbmd0aDtcbiAgaWYgKCFyb3V0ZUhhc1NlbGVjdGlvbikge1xuICAgIG1pc3NpbGVTZWxlY3Rpb24gPSBudWxsO1xuICB9XG4gIGNvbnN0IGNmZyA9IHN0YXRlUmVmLm1pc3NpbGVDb25maWc7XG4gIGFwcGx5TWlzc2lsZVVJKGNmZyk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gYXBwbHlNaXNzaWxlVUkoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIpIHtcbiAgICBjb25zdCBtaW5TcGVlZCA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4gPz8gTUlTU0lMRV9NSU5fU1BFRUQ7XG4gICAgY29uc3QgbWF4U3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWF4ID8/IE1JU1NJTEVfTUFYX1NQRUVEO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5taW4gPSBTdHJpbmcobWluU3BlZWQpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5tYXggPSBTdHJpbmcobWF4U3BlZWQpO1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IGNmZy5zcGVlZC50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgIG1pc3NpbGVTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gY2ZnLnNwZWVkLnRvRml4ZWQoMCk7XG4gIH1cbiAgaWYgKG1pc3NpbGVBZ3JvU2xpZGVyKSB7XG4gICAgY29uc3QgbWluQWdybyA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuYWdyb01pbiA/PyBNSVNTSUxFX01JTl9BR1JPO1xuICAgIGNvbnN0IG1heEFncm8gPSBNYXRoLm1heCg1MDAwLCBNYXRoLmNlaWwoKGNmZy5hZ3JvUmFkaXVzICsgNTAwKSAvIDUwMCkgKiA1MDApO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1pbiA9IFN0cmluZyhtaW5BZ3JvKTtcbiAgICBtaXNzaWxlQWdyb1NsaWRlci5tYXggPSBTdHJpbmcobWF4QWdybyk7XG4gICAgbWlzc2lsZUFncm9TbGlkZXIudmFsdWUgPSBjZmcuYWdyb1JhZGl1cy50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlQWdyb1ZhbHVlKSB7XG4gICAgbWlzc2lsZUFncm9WYWx1ZS50ZXh0Q29udGVudCA9IGNmZy5hZ3JvUmFkaXVzLnRvRml4ZWQoMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSShvdmVycmlkZXM6IFBhcnRpYWw8eyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfT4gPSB7fSk6IHZvaWQge1xuICBjb25zdCBjdXJyZW50ID0gc3RhdGVSZWYubWlzc2lsZUNvbmZpZztcbiAgY29uc3QgY2ZnID0gc2FuaXRpemVNaXNzaWxlQ29uZmlnKHtcbiAgICBzcGVlZDogb3ZlcnJpZGVzLnNwZWVkID8/IGN1cnJlbnQuc3BlZWQsXG4gICAgYWdyb1JhZGl1czogb3ZlcnJpZGVzLmFncm9SYWRpdXMgPz8gY3VycmVudC5hZ3JvUmFkaXVzLFxuICB9LCBjdXJyZW50LCBzdGF0ZVJlZi5taXNzaWxlTGltaXRzKTtcbiAgc3RhdGVSZWYubWlzc2lsZUNvbmZpZyA9IGNmZztcbiAgYXBwbHlNaXNzaWxlVUkoY2ZnKTtcbiAgY29uc3QgbGFzdCA9IGxhc3RNaXNzaWxlQ29uZmlnU2VudDtcbiAgY29uc3QgbmVlZHNTZW5kID1cbiAgICAhbGFzdCB8fFxuICAgIE1hdGguYWJzKGxhc3Quc3BlZWQgLSBjZmcuc3BlZWQpID4gMC4yNSB8fFxuICAgIE1hdGguYWJzKChsYXN0LmFncm9SYWRpdXMgPz8gMCkgLSBjZmcuYWdyb1JhZGl1cykgPiA1O1xuICBpZiAobmVlZHNTZW5kKSB7XG4gICAgc2VuZE1pc3NpbGVDb25maWcoY2ZnKTtcbiAgfVxuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiBzZW5kTWlzc2lsZUNvbmZpZyhjZmc6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0pOiB2b2lkIHtcbiAgbGFzdE1pc3NpbGVDb25maWdTZW50ID0ge1xuICAgIHNwZWVkOiBjZmcuc3BlZWQsXG4gICAgYWdyb1JhZGl1czogY2ZnLmFncm9SYWRpdXMsXG4gIH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImNvbmZpZ3VyZV9taXNzaWxlXCIsXG4gICAgbWlzc2lsZV9zcGVlZDogY2ZnLnNwZWVkLFxuICAgIG1pc3NpbGVfYWdybzogY2ZnLmFncm9SYWRpdXMsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk6IHZvaWQge1xuICBpZiAoIXNoaXBTZWxlY3Rpb25Db250YWluZXIgfHwgIXNoaXBTZWxlY3Rpb25MYWJlbCB8fCAhc2hpcERlbGV0ZUJ0bikge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCB3cHMgPSBzdGF0ZVJlZi5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMgOiBbXTtcbiAgY29uc3QgaGFzVmFsaWRTZWxlY3Rpb24gPSBzZWxlY3Rpb24gIT09IG51bGwgJiYgc2VsZWN0aW9uLmluZGV4ID49IDAgJiYgc2VsZWN0aW9uLmluZGV4IDwgd3BzLmxlbmd0aDtcbiAgY29uc3QgaXNTaGlwQ29udGV4dCA9IHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIjtcblxuICBzaGlwU2VsZWN0aW9uQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgc2hpcFNlbGVjdGlvbkNvbnRhaW5lci5zdHlsZS5vcGFjaXR5ID0gaXNTaGlwQ29udGV4dCA/IFwiMVwiIDogXCIwLjZcIjtcblxuICBpZiAoIXN0YXRlUmVmLm1lIHx8ICFoYXNWYWxpZFNlbGVjdGlvbikge1xuICAgIHNoaXBTZWxlY3Rpb25MYWJlbC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgc2hpcERlbGV0ZUJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgaWYgKGlzU2hpcENvbnRleHQpIHtcbiAgICAgIHNldFNoaXBTbGlkZXJWYWx1ZShkZWZhdWx0U3BlZWQpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoc2VsZWN0aW9uICE9PSBudWxsKSB7XG4gICAgY29uc3Qgd3AgPSB3cHNbc2VsZWN0aW9uLmluZGV4XTtcbiAgICBjb25zdCBzcGVlZCA9IHdwICYmIHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiA/IHdwLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuICAgIGlmIChpc1NoaXBDb250ZXh0ICYmIHNoaXBTcGVlZFNsaWRlciAmJiBNYXRoLmFicyhwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci52YWx1ZSkgLSBzcGVlZCkgPiAwLjI1KSB7XG4gICAgICBzZXRTaGlwU2xpZGVyVmFsdWUoc3BlZWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB1cGRhdGVTcGVlZExhYmVsKHNwZWVkKTtcbiAgICB9XG4gICAgY29uc3QgZGlzcGxheUluZGV4ID0gc2VsZWN0aW9uLmluZGV4ICsgMTtcbiAgICBzaGlwU2VsZWN0aW9uTGFiZWwudGV4dENvbnRlbnQgPSBgJHtkaXNwbGF5SW5kZXh9IFx1MjAxNCAke3NwZWVkLnRvRml4ZWQoMCl9IHUvc2A7XG4gICAgc2hpcERlbGV0ZUJ0bi5kaXNhYmxlZCA9ICFpc1NoaXBDb250ZXh0O1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTogdm9pZCB7XG4gIGlmICghbWlzc2lsZURlbGV0ZUJ0bikgcmV0dXJuO1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBjb25zdCBjb3VudCA9IHJvdXRlICYmIEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICBjb25zdCBoYXNTZWxlY3Rpb24gPSBtaXNzaWxlU2VsZWN0aW9uICE9PSBudWxsICYmIG1pc3NpbGVTZWxlY3Rpb24gIT09IHVuZGVmaW5lZCAmJiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiYgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA8IGNvdW50O1xuICBtaXNzaWxlRGVsZXRlQnRuLmRpc2FibGVkID0gIWhhc1NlbGVjdGlvbjtcbiAgaWYgKG1pc3NpbGVTZWxlY3Rpb24gJiYgaGFzU2VsZWN0aW9uKSB7XG4gICAgbWlzc2lsZURlbGV0ZUJ0bi50ZXh0Q29udGVudCA9IGBEZWwgIyR7bWlzc2lsZVNlbGVjdGlvbi5pbmRleCArIDF9YDtcbiAgfSBlbHNlIHtcbiAgICBtaXNzaWxlRGVsZXRlQnRuLnRleHRDb250ZW50ID0gXCJEZWxldGVcIjtcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRTZWxlY3Rpb24oc2VsOiBTZWxlY3Rpb24gfCBudWxsKTogdm9pZCB7XG4gIHNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICBjb25zdCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IG51bGw7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDpsZWdTZWxlY3RlZFwiLCB7IGluZGV4IH0pO1xufVxuXG5mdW5jdGlvbiBzZXRNaXNzaWxlU2VsZWN0aW9uKHNlbDogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwpOiB2b2lkIHtcbiAgbWlzc2lsZVNlbGVjdGlvbiA9IHNlbDtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCB3b3JsZFBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBpZiAodWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIikge1xuICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RSb3V0ZShjYW52YXNQb2ludCk7XG4gICAgc2V0U2VsZWN0aW9uKGhpdCA/PyBudWxsKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB3cCA9IHsgeDogd29ybGRQb2ludC54LCB5OiB3b3JsZFBvaW50LnksIHNwZWVkOiBkZWZhdWx0U3BlZWQgfTtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF93YXlwb2ludFwiLCB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogZGVmYXVsdFNwZWVkIH0pO1xuICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMuc2xpY2UoKSA6IFtdO1xuICB3cHMucHVzaCh3cCk7XG4gIHN0YXRlUmVmLm1lLndheXBvaW50cyA9IHdwcztcbiAgaWYgKHdwcy5sZW5ndGggPiAwKSB7XG4gICAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludEFkZGVkXCIsIHsgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIHdvcmxkUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlKSByZXR1cm47XG5cbiAgaWYgKHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0TWlzc2lsZVJvdXRlKGNhbnZhc1BvaW50KTtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKGhpdCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgd3AgPSB7IHg6IHdvcmxkUG9pbnQueCwgeTogd29ybGRQb2ludC55IH07XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImFkZF9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIHg6IHdwLngsXG4gICAgeTogd3AueSxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cyA/IFsuLi5yb3V0ZS53YXlwb2ludHMsIHdwXSA6IFt3cF07XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24oeyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHJvdXRlLndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xufVxuXG5mdW5jdGlvbiBjbGVhclNoaXBSb3V0ZSgpOiB2b2lkIHtcbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGlmICghd3BzIHx8IHdwcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImNsZWFyX3dheXBvaW50c1wiIH0pO1xuICBpZiAoc3RhdGVSZWYubWUpIHtcbiAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHMgPSBbXTtcbiAgfVxuICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludHNDbGVhcmVkXCIpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVTZWxlY3RlZFNoaXBXYXlwb2ludCgpOiB2b2lkIHtcbiAgaWYgKCFzZWxlY3Rpb24pIHJldHVybjtcbiAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImRlbGV0ZV93YXlwb2ludFwiLCBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICBpZiAoc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpKSB7XG4gICAgc3RhdGVSZWYubWUud2F5cG9pbnRzID0gc3RhdGVSZWYubWUud2F5cG9pbnRzLnNsaWNlKDAsIHNlbGVjdGlvbi5pbmRleCk7XG4gIH1cbiAgYnVzUmVmLmVtaXQoXCJzaGlwOndheXBvaW50RGVsZXRlZFwiLCB7IGluZGV4OiBzZWxlY3Rpb24uaW5kZXggfSk7XG4gIHNldFNlbGVjdGlvbihudWxsKTtcbn1cblxuZnVuY3Rpb24gZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUgfHwgIW1pc3NpbGVTZWxlY3Rpb24pIHJldHVybjtcbiAgY29uc3QgaW5kZXggPSBtaXNzaWxlU2VsZWN0aW9uLmluZGV4O1xuICBpZiAoIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCBpbmRleCA8IDAgfHwgaW5kZXggPj0gcm91dGUud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgIHJldHVybjtcbiAgfVxuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJkZWxldGVfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICBpbmRleCxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IFsuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoMCwgaW5kZXgpLCAuLi5yb3V0ZS53YXlwb2ludHMuc2xpY2UoaW5kZXggKyAxKV07XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXggfSk7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG59XG5cbmZ1bmN0aW9uIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpOiB2b2lkIHtcbiAgaWYgKG1pc3NpbGVMYXVuY2hCdG4/LmRpc2FibGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwibGF1bmNoX21pc3NpbGVcIixcbiAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjeWNsZU1pc3NpbGVSb3V0ZShkaXJlY3Rpb246IG51bWJlcik6IHZvaWQge1xuICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICBpZiAocm91dGVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBjdXJyZW50SW5kZXggPSByb3V0ZXMuZmluZEluZGV4KChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKTtcbiAgY29uc3QgYmFzZUluZGV4ID0gY3VycmVudEluZGV4ID49IDAgPyBjdXJyZW50SW5kZXggOiAwO1xuICBjb25zdCBuZXh0SW5kZXggPSAoKGJhc2VJbmRleCArIGRpcmVjdGlvbikgJSByb3V0ZXMubGVuZ3RoICsgcm91dGVzLmxlbmd0aCkgJSByb3V0ZXMubGVuZ3RoO1xuICBjb25zdCBuZXh0Um91dGUgPSByb3V0ZXNbbmV4dEluZGV4XTtcbiAgaWYgKCFuZXh0Um91dGUpIHJldHVybjtcbiAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSBuZXh0Um91dGUuaWQ7XG4gIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcInNldF9hY3RpdmVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgIHJvdXRlX2lkOiBuZXh0Um91dGUuaWQsXG4gIH0pO1xuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsIHsgcm91dGVJZDogbmV4dFJvdXRlLmlkIH0pO1xufVxuXG5mdW5jdGlvbiBjeWNsZVNoaXBTZWxlY3Rpb24oZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGlmICghd3BzIHx8IHdwcy5sZW5ndGggPT09IDApIHtcbiAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCBpbmRleCA9IHNlbGVjdGlvbiA/IHNlbGVjdGlvbi5pbmRleCA6IGRpcmVjdGlvbiA+IDAgPyAtMSA6IHdwcy5sZW5ndGg7XG4gIGluZGV4ICs9IGRpcmVjdGlvbjtcbiAgaWYgKGluZGV4IDwgMCkgaW5kZXggPSB3cHMubGVuZ3RoIC0gMTtcbiAgaWYgKGluZGV4ID49IHdwcy5sZW5ndGgpIGluZGV4ID0gMDtcbiAgc2V0U2VsZWN0aW9uKHsgdHlwZTogXCJsZWdcIiwgaW5kZXggfSk7XG59XG5cbmZ1bmN0aW9uIHNldElucHV0Q29udGV4dChjb250ZXh0OiBcInNoaXBcIiB8IFwibWlzc2lsZVwiKTogdm9pZCB7XG4gIGNvbnN0IG5leHQgPSBjb250ZXh0ID09PSBcIm1pc3NpbGVcIiA/IFwibWlzc2lsZVwiIDogXCJzaGlwXCI7XG4gIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gbmV4dCkge1xuICAgIHJldHVybjtcbiAgfVxuICB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9IG5leHQ7XG4gIGJ1c1JlZi5lbWl0KFwiY29udGV4dDpjaGFuZ2VkXCIsIHsgY29udGV4dDogbmV4dCB9KTtcbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbiAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG59XG5cbmZ1bmN0aW9uIHNldFNoaXBUb29sKHRvb2w6IFwic2V0XCIgfCBcInNlbGVjdFwiKTogdm9pZCB7XG4gIGlmICh0b29sICE9PSBcInNldFwiICYmIHRvb2wgIT09IFwic2VsZWN0XCIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHVpU3RhdGVSZWYuc2hpcFRvb2wgPT09IHRvb2wpIHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICB1aVN0YXRlUmVmLnNoaXBUb29sID0gdG9vbDtcbiAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgdXBkYXRlQ29udHJvbEhpZ2hsaWdodHMoKTtcbiAgYnVzUmVmLmVtaXQoXCJzaGlwOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbCB9KTtcbn1cblxuZnVuY3Rpb24gc2V0TWlzc2lsZVRvb2wodG9vbDogXCJzZXRcIiB8IFwic2VsZWN0XCIpOiB2b2lkIHtcbiAgaWYgKHRvb2wgIT09IFwic2V0XCIgJiYgdG9vbCAhPT0gXCJzZWxlY3RcIikge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBwcmV2aW91cyA9IHVpU3RhdGVSZWYubWlzc2lsZVRvb2w7XG4gIGNvbnN0IGNoYW5nZWQgPSBwcmV2aW91cyAhPT0gdG9vbDtcbiAgaWYgKGNoYW5nZWQpIHtcbiAgICB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID0gdG9vbDtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIGlmICh0b29sID09PSBcInNldFwiKSB7XG4gICAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gIH1cbiAgaWYgKGNoYW5nZWQpIHtcbiAgICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICB9XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLCB7IHRvb2wgfSk7XG59XG5cbmZ1bmN0aW9uIHNldEJ1dHRvblN0YXRlKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsLCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgaWYgKCFidG4pIHJldHVybjtcbiAgaWYgKGFjdGl2ZSkge1xuICAgIGJ0bi5kYXRhc2V0LnN0YXRlID0gXCJhY3RpdmVcIjtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwidHJ1ZVwiKTtcbiAgfSBlbHNlIHtcbiAgICBkZWxldGUgYnRuLmRhdGFzZXQuc3RhdGU7XG4gICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcImZhbHNlXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk6IHZvaWQge1xuICBzZXRCdXR0b25TdGF0ZShzaGlwU2V0QnRuLCB1aVN0YXRlUmVmLnNoaXBUb29sID09PSBcInNldFwiKTtcbiAgc2V0QnV0dG9uU3RhdGUoc2hpcFNlbGVjdEJ0biwgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIik7XG4gIHNldEJ1dHRvblN0YXRlKHNoaXBUb2dnbGVSb3V0ZUJ0biwgdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlKTtcbiAgc2V0QnV0dG9uU3RhdGUobWlzc2lsZVNldEJ0biwgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9PT0gXCJzZXRcIik7XG4gIHNldEJ1dHRvblN0YXRlKG1pc3NpbGVTZWxlY3RCdG4sIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpO1xuXG4gIGlmIChzaGlwQ29udHJvbHNDYXJkKSB7XG4gICAgc2hpcENvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIik7XG4gIH1cbiAgaWYgKG1pc3NpbGVDb250cm9sc0NhcmQpIHtcbiAgICBtaXNzaWxlQ29udHJvbHNDYXJkLmNsYXNzTGlzdC50b2dnbGUoXCJhY3RpdmVcIiwgdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRIZWxwVmlzaWJsZShmbGFnOiBib29sZWFuKTogdm9pZCB7XG4gIHVpU3RhdGVSZWYuaGVscFZpc2libGUgPSBCb29sZWFuKGZsYWcpO1xuICB1cGRhdGVIZWxwT3ZlcmxheSgpO1xuICBidXNSZWYuZW1pdChcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgeyB2aXNpYmxlOiB1aVN0YXRlUmVmLmhlbHBWaXNpYmxlIH0pO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIZWxwT3ZlcmxheSgpOiB2b2lkIHtcbiAgaWYgKCFoZWxwT3ZlcmxheSkgcmV0dXJuO1xuICBpZiAoaGVscFRleHQpIHtcbiAgICBoZWxwVGV4dC50ZXh0Q29udGVudCA9IEhFTFBfVEVYVDtcbiAgfVxuICBoZWxwT3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiLCB1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbn1cblxuZnVuY3Rpb24gYWRqdXN0U2xpZGVyVmFsdWUoaW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsLCBzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiBudW1iZXIgfCBudWxsIHtcbiAgaWYgKCFpbnB1dCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHN0ZXAgPSBNYXRoLmFicyhwYXJzZUZsb2F0KGlucHV0LnN0ZXApKSB8fCAxO1xuICBjb25zdCBtdWx0aXBsaWVyID0gY29hcnNlID8gNCA6IDE7XG4gIGNvbnN0IG1pbiA9IE51bWJlci5pc0Zpbml0ZShwYXJzZUZsb2F0KGlucHV0Lm1pbikpID8gcGFyc2VGbG9hdChpbnB1dC5taW4pIDogLUluZmluaXR5O1xuICBjb25zdCBtYXggPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VGbG9hdChpbnB1dC5tYXgpKSA/IHBhcnNlRmxvYXQoaW5wdXQubWF4KSA6IEluZmluaXR5O1xuICBjb25zdCBjdXJyZW50ID0gcGFyc2VGbG9hdChpbnB1dC52YWx1ZSkgfHwgMDtcbiAgbGV0IG5leHQgPSBjdXJyZW50ICsgc3RlcHMgKiBzdGVwICogbXVsdGlwbGllcjtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShtaW4pKSBuZXh0ID0gTWF0aC5tYXgobWluLCBuZXh0KTtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShtYXgpKSBuZXh0ID0gTWF0aC5taW4obWF4LCBuZXh0KTtcbiAgaWYgKE1hdGguYWJzKG5leHQgLSBjdXJyZW50KSA8IDFlLTQpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBpbnB1dC52YWx1ZSA9IFN0cmluZyhuZXh0KTtcbiAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoXCJpbnB1dFwiLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICByZXR1cm4gbmV4dDtcbn1cblxuZnVuY3Rpb24gb25XaW5kb3dLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gIGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBjb25zdCBpc0VkaXRhYmxlID0gISF0YXJnZXQgJiYgKHRhcmdldC50YWdOYW1lID09PSBcIklOUFVUXCIgfHwgdGFyZ2V0LnRhZ05hbWUgPT09IFwiVEVYVEFSRUFcIiB8fCB0YXJnZXQuaXNDb250ZW50RWRpdGFibGUpO1xuXG4gIGlmICh1aVN0YXRlUmVmLmhlbHBWaXNpYmxlICYmIGV2ZW50LmtleSAhPT0gXCJFc2NhcGVcIikge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGlzRWRpdGFibGUpIHtcbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XG4gICAgICB0YXJnZXQuYmx1cigpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc3dpdGNoIChldmVudC5jb2RlKSB7XG4gICAgY2FzZSBcIkRpZ2l0MVwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRpZ2l0MlwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleVRcIjpcbiAgICAgIHNldFNoaXBUb29sKHVpU3RhdGVSZWYuc2hpcFRvb2wgPT09IFwic2V0XCIgPyBcInNlbGVjdFwiIDogXCJzZXRcIik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlDXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleVJcIjpcbiAgICAgIHVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSA9ICF1aVN0YXRlUmVmLnNob3dTaGlwUm91dGU7XG4gICAgICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiQnJhY2tldExlZnRcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShzaGlwU3BlZWRTbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJCcmFja2V0UmlnaHRcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShzaGlwU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIlRhYlwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGN5Y2xlU2hpcFNlbGVjdGlvbihldmVudC5zaGlmdEtleSA/IC0xIDogMSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlOXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgbWlzc2lsZUFkZFJvdXRlQnRuPy5jbGljaygpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5TFwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5RVwiOlxuICAgICAgc2V0TWlzc2lsZVRvb2wodWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9PT0gXCJzZXRcIiA/IFwic2VsZWN0XCIgOiBcInNldFwiKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkNvbW1hXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJQZXJpb2RcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlQWdyb1NsaWRlciwgMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiU2VtaWNvbG9uXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiUXVvdGVcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRlbGV0ZVwiOlxuICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgbWlzc2lsZVNlbGVjdGlvbikge1xuICAgICAgICBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgfSBlbHNlIGlmIChzZWxlY3Rpb24pIHtcbiAgICAgICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkVzY2FwZVwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuaGVscFZpc2libGUpIHtcbiAgICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgICAgfSBlbHNlIGlmIChtaXNzaWxlU2VsZWN0aW9uKSB7XG4gICAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHNlbGVjdGlvbikge1xuICAgICAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBkZWZhdWx0OlxuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgIHNldEhlbHBWaXNpYmxlKCF1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdvcmxkVG9DYW52YXMocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcbiAgY29uc3Qgc3ggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHN5ID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgcmV0dXJuIHsgeDogcC54ICogc3gsIHk6IHAueSAqIHN5IH07XG59XG5cbmZ1bmN0aW9uIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcbiAgY29uc3Qgc3ggPSB3b3JsZC53IC8gY3Yud2lkdGg7XG4gIGNvbnN0IHN5ID0gd29ybGQuaCAvIGN2LmhlaWdodDtcbiAgcmV0dXJuIHsgeDogcC54ICogc3gsIHk6IHAueSAqIHN5IH07XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVSb3V0ZVBvaW50cygpIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHdwcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBjb25zdCB3b3JsZFBvaW50cyA9IFt7IHg6IHN0YXRlUmVmLm1lLngsIHk6IHN0YXRlUmVmLm1lLnkgfV07XG4gIGZvciAoY29uc3Qgd3Agb2Ygd3BzKSB7XG4gICAgd29ybGRQb2ludHMucHVzaCh7IHg6IHdwLngsIHk6IHdwLnkgfSk7XG4gIH1cbiAgY29uc3QgY2FudmFzUG9pbnRzID0gd29ybGRQb2ludHMubWFwKChwb2ludCkgPT4gd29ybGRUb0NhbnZhcyhwb2ludCkpO1xuICByZXR1cm4geyB3YXlwb2ludHM6IHdwcywgd29ybGRQb2ludHMsIGNhbnZhc1BvaW50cyB9O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCkge1xuICBpZiAoIXN0YXRlUmVmLm1lKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3Qgd3BzID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzIDogW107XG4gIGNvbnN0IHdvcmxkUG9pbnRzID0gW3sgeDogc3RhdGVSZWYubWUueCwgeTogc3RhdGVSZWYubWUueSB9XTtcbiAgZm9yIChjb25zdCB3cCBvZiB3cHMpIHtcbiAgICB3b3JsZFBvaW50cy5wdXNoKHsgeDogd3AueCwgeTogd3AueSB9KTtcbiAgfVxuICBjb25zdCBjYW52YXNQb2ludHMgPSB3b3JsZFBvaW50cy5tYXAoKHBvaW50KSA9PiB3b3JsZFRvQ2FudmFzKHBvaW50KSk7XG4gIHJldHVybiB7IHdheXBvaW50czogd3BzLCB3b3JsZFBvaW50cywgY2FudmFzUG9pbnRzIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUxlZ0Rhc2hPZmZzZXRzKGR0U2Vjb25kczogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlIHx8ICFzdGF0ZVJlZi5tZSkge1xuICAgIGxlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIGxlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHsgd2F5cG9pbnRzLCB3b3JsZFBvaW50cywgY2FudmFzUG9pbnRzIH0gPSByb3V0ZTtcbiAgY29uc3QgY3ljbGUgPSA2NDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB3cCA9IHdheXBvaW50c1tpXTtcbiAgICBjb25zdCBzcGVlZCA9IHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiA/IHdwLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuICAgIGNvbnN0IGFXb3JsZCA9IHdvcmxkUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJXb3JsZCA9IHdvcmxkUG9pbnRzW2kgKyAxXTtcbiAgICBjb25zdCB3b3JsZERpc3QgPSBNYXRoLmh5cG90KGJXb3JsZC54IC0gYVdvcmxkLngsIGJXb3JsZC55IC0gYVdvcmxkLnkpO1xuICAgIGNvbnN0IGFDYW52YXMgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3QgYkNhbnZhcyA9IGNhbnZhc1BvaW50c1tpICsgMV07XG4gICAgY29uc3QgY2FudmFzRGlzdCA9IE1hdGguaHlwb3QoYkNhbnZhcy54IC0gYUNhbnZhcy54LCBiQ2FudmFzLnkgLSBhQ2FudmFzLnkpO1xuXG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoc3BlZWQpIHx8IHNwZWVkIDw9IDFlLTMgfHwgIU51bWJlci5pc0Zpbml0ZSh3b3JsZERpc3QpIHx8IHdvcmxkRGlzdCA8PSAxZS0zIHx8IGNhbnZhc0Rpc3QgPD0gMWUtMykge1xuICAgICAgbGVnRGFzaE9mZnNldHMuc2V0KGksIDApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPD0gMCkge1xuICAgICAgaWYgKCFsZWdEYXNoT2Zmc2V0cy5oYXMoaSkpIHtcbiAgICAgICAgbGVnRGFzaE9mZnNldHMuc2V0KGksIDApO1xuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBjYW52YXNEaXN0IC8gd29ybGREaXN0O1xuICAgIGNvbnN0IGRhc2hTcGVlZCA9IHNwZWVkICogc2NhbGU7XG4gICAgbGV0IG5leHQgPSAobGVnRGFzaE9mZnNldHMuZ2V0KGkpID8/IDApIC0gZGFzaFNwZWVkICogZHRTZWNvbmRzO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG5leHQpKSB7XG4gICAgICBuZXh0ID0gMDtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCA9ICgobmV4dCAlIGN5Y2xlKSArIGN5Y2xlKSAlIGN5Y2xlO1xuICAgIH1cbiAgICBsZWdEYXNoT2Zmc2V0cy5zZXQoaSwgbmV4dCk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgb2YgQXJyYXkuZnJvbShsZWdEYXNoT2Zmc2V0cy5rZXlzKCkpKSB7XG4gICAgaWYgKGtleSA+PSB3YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBsZWdEYXNoT2Zmc2V0cy5kZWxldGUoa2V5KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gcG9pbnRTZWdtZW50RGlzdGFuY2UocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBhOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIGI6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IG51bWJlciB7XG4gIGNvbnN0IGFieCA9IGIueCAtIGEueDtcbiAgY29uc3QgYWJ5ID0gYi55IC0gYS55O1xuICBjb25zdCBhcHggPSBwLnggLSBhLng7XG4gIGNvbnN0IGFweSA9IHAueSAtIGEueTtcbiAgY29uc3QgYWJMZW5TcSA9IGFieCAqIGFieCArIGFieSAqIGFieTtcbiAgY29uc3QgdCA9IGFiTGVuU3EgPT09IDAgPyAwIDogY2xhbXAoYXB4ICogYWJ4ICsgYXB5ICogYWJ5LCAwLCBhYkxlblNxKSAvIGFiTGVuU3E7XG4gIGNvbnN0IHByb2p4ID0gYS54ICsgYWJ4ICogdDtcbiAgY29uc3QgcHJvankgPSBhLnkgKyBhYnkgKiB0O1xuICBjb25zdCBkeCA9IHAueCAtIHByb2p4O1xuICBjb25zdCBkeSA9IHAueSAtIHByb2p5O1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG5mdW5jdGlvbiBoaXRUZXN0Um91dGUoY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IFNlbGVjdGlvbiB8IG51bGwge1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCB7IGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IHdheXBvaW50SGl0UmFkaXVzID0gMTI7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3BDYW52YXMgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdwQ2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd3BDYW52YXMueTtcbiAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpIDw9IHdheXBvaW50SGl0UmFkaXVzKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG4gIGlmICghdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgbGVnSGl0RGlzdGFuY2UgPSAxMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBkaXN0ID0gcG9pbnRTZWdtZW50RGlzdGFuY2UoY2FudmFzUG9pbnQsIGNhbnZhc1BvaW50c1tpXSwgY2FudmFzUG9pbnRzW2kgKyAxXSk7XG4gICAgaWYgKGRpc3QgPD0gbGVnSGl0RGlzdGFuY2UpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6IFwibGVnXCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBoaXRUZXN0TWlzc2lsZVJvdXRlKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBNaXNzaWxlU2VsZWN0aW9uIHwgbnVsbCB7XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCB7IGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IHdheXBvaW50SGl0UmFkaXVzID0gMTY7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgY2FudmFzUG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3BDYW52YXMgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3QgZHggPSBjYW52YXNQb2ludC54IC0gd3BDYW52YXMueDtcbiAgICBjb25zdCBkeSA9IGNhbnZhc1BvaW50LnkgLSB3cENhbnZhcy55O1xuICAgIGlmIChNYXRoLmh5cG90KGR4LCBkeSkgPD0gd2F5cG9pbnRIaXRSYWRpdXMpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6IFwid2F5cG9pbnRcIiwgaW5kZXg6IGkgLSAxIH07XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBkcmF3U2hpcCh4OiBudW1iZXIsIHk6IG51bWJlciwgdng6IG51bWJlciwgdnk6IG51bWJlciwgY29sb3I6IHN0cmluZywgZmlsbGVkOiBib29sZWFuKTogdm9pZCB7XG4gIGlmICghY3R4KSByZXR1cm47XG4gIGNvbnN0IHAgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeSB9KTtcbiAgY29uc3QgciA9IDEwO1xuICBjdHguc2F2ZSgpO1xuICBjdHgudHJhbnNsYXRlKHAueCwgcC55KTtcbiAgY29uc3QgYW5nbGUgPSBNYXRoLmF0YW4yKHZ5LCB2eCk7XG4gIGN0eC5yb3RhdGUoYW5nbGUpO1xuICBjdHguYmVnaW5QYXRoKCk7XG4gIGN0eC5tb3ZlVG8ociwgMCk7XG4gIGN0eC5saW5lVG8oLXIgKiAwLjcsIHIgKiAwLjYpO1xuICBjdHgubGluZVRvKC1yICogMC40LCAwKTtcbiAgY3R4LmxpbmVUbygtciAqIDAuNywgLXIgKiAwLjYpO1xuICBjdHguY2xvc2VQYXRoKCk7XG4gIGN0eC5saW5lV2lkdGggPSAyO1xuICBjdHguc3Ryb2tlU3R5bGUgPSBjb2xvcjtcbiAgaWYgKGZpbGxlZCkge1xuICAgIGN0eC5maWxsU3R5bGUgPSBgJHtjb2xvcn1jY2A7XG4gICAgY3R4LmZpbGwoKTtcbiAgfVxuICBjdHguc3Ryb2tlKCk7XG4gIGN0eC5yZXN0b3JlKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdHaG9zdERvdCh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIWN0eCkgcmV0dXJuO1xuICBjb25zdCBwID0gd29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4LmFyYyhwLngsIHAueSwgMywgMCwgTWF0aC5QSSAqIDIpO1xuICBjdHguZmlsbFN0eWxlID0gXCIjY2NjY2NjYWFcIjtcbiAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gZHJhd1JvdXRlKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWUpIHJldHVybjtcbiAgY29uc3Qgcm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSByZXR1cm47XG4gIGNvbnN0IHsgY2FudmFzUG9pbnRzIH0gPSByb3V0ZTtcbiAgY29uc3QgbGVnQ291bnQgPSBjYW52YXNQb2ludHMubGVuZ3RoIC0gMTtcblxuICBpZiAodWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlICYmIGxlZ0NvdW50ID4gMCkge1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnNldExpbmVEYXNoKFs4LCA4XSk7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMzOGJkZjg2NlwiO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVnQ291bnQ7IGkrKykge1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbaV0ueCwgY2FudmFzUG9pbnRzW2ldLnkpO1xuICAgICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbaSArIDFdLngsIGNhbnZhc1BvaW50c1tpICsgMV0ueSk7XG4gICAgICBjdHgubGluZURhc2hPZmZzZXQgPSBsZWdEYXNoT2Zmc2V0cy5nZXQoaSkgPz8gMDtcbiAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGlmICh1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUgJiYgbGVnQ291bnQgPiAwKSB7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguc2V0TGluZURhc2goWzYsIDZdKTtcbiAgICBjdHgubGluZVdpZHRoID0gMztcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMzOGJkZjhcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbMF0ueCwgY2FudmFzUG9pbnRzWzBdLnkpO1xuICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzWzFdLngsIGNhbnZhc1BvaW50c1sxXS55KTtcbiAgICBjdHgubGluZURhc2hPZmZzZXQgPSBsZWdEYXNoT2Zmc2V0cy5nZXQoMCkgPz8gMDtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGlmICh1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUgJiYgc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5pbmRleCA8IGxlZ0NvdW50KSB7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguc2V0TGluZURhc2goWzQsIDRdKTtcbiAgICBjdHgubGluZVdpZHRoID0gMy41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiI2Y5NzMxNlwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXhdLngsIGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXhdLnkpO1xuICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzW3NlbGVjdGlvbi5pbmRleCArIDFdLngsIGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXggKyAxXS55KTtcbiAgICBjdHgubGluZURhc2hPZmZzZXQgPSBsZWdEYXNoT2Zmc2V0cy5nZXQoc2VsZWN0aW9uLmluZGV4KSA/PyAwO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwdCA9IGNhbnZhc1BvaW50c1tpICsgMV07XG4gICAgY29uc3QgaXNTZWxlY3RlZCA9IHNlbGVjdGlvbiAmJiBzZWxlY3Rpb24uaW5kZXggPT09IGk7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmFyYyhwdC54LCBwdC55LCBpc1NlbGVjdGVkID8gNyA6IDUsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gaXNTZWxlY3RlZCA/IFwiI2Y5NzMxNlwiIDogXCIjMzhiZGY4XCI7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gaXNTZWxlY3RlZCA/IDAuOTUgOiAwLjg7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiIzBmMTcyYVwiO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRyYXdNaXNzaWxlUm91dGUoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBpZiAodWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgIT09IFwibWlzc2lsZVwiKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgY29uc3QgeyBjYW52YXNQb2ludHMgfSA9IHJvdXRlO1xuICBjdHguc2F2ZSgpO1xuICBjdHguc2V0TGluZURhc2goWzEwLCA2XSk7XG4gIGN0eC5saW5lV2lkdGggPSAyLjU7XG4gIGN0eC5zdHJva2VTdHlsZSA9IFwiI2Y4NzE3MWFhXCI7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbMF0ueCwgY2FudmFzUG9pbnRzWzBdLnkpO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGNhbnZhc1BvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzW2ldLngsIGNhbnZhc1BvaW50c1tpXS55KTtcbiAgfVxuICBjdHguc3Ryb2tlKCk7XG4gIGN0eC5yZXN0b3JlKCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBjYW52YXNQb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwdCA9IGNhbnZhc1BvaW50c1tpXTtcbiAgICBjb25zdCB3YXlwb2ludEluZGV4ID0gaSAtIDE7XG4gICAgY29uc3QgaXNTZWxlY3RlZCA9IG1pc3NpbGVTZWxlY3Rpb24gJiYgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA9PT0gd2F5cG9pbnRJbmRleDtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHguYXJjKHB0LngsIHB0LnksIGlzU2VsZWN0ZWQgPyA3IDogNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgIGN0eC5maWxsU3R5bGUgPSBpc1NlbGVjdGVkID8gXCIjZmFjYzE1XCIgOiBcIiNmODcxNzFcIjtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSBpc1NlbGVjdGVkID8gMC45NSA6IDAuOTtcbiAgICBjdHguZmlsbCgpO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBpc1NlbGVjdGVkID8gXCIjODU0ZDBlXCIgOiBcIiM3ZjFkMWRcIjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkcmF3TWlzc2lsZXMoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFzdGF0ZVJlZi5taXNzaWxlcyB8fCBzdGF0ZVJlZi5taXNzaWxlcy5sZW5ndGggPT09IDAgfHwgIWN2KSByZXR1cm47XG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3QgcmFkaXVzU2NhbGUgPSAoc2NhbGVYICsgc2NhbGVZKSAvIDI7XG4gIGZvciAoY29uc3QgbWlzcyBvZiBzdGF0ZVJlZi5taXNzaWxlcykge1xuICAgIGNvbnN0IHAgPSB3b3JsZFRvQ2FudmFzKHsgeDogbWlzcy54LCB5OiBtaXNzLnkgfSk7XG4gICAgY29uc3Qgc2VsZk93bmVkID0gQm9vbGVhbihtaXNzLnNlbGYpO1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMocC54LCBwLnksIHNlbGZPd25lZCA/IDYgOiA1LCAwLCBNYXRoLlBJICogMik7XG4gICAgY3R4LmZpbGxTdHlsZSA9IHNlbGZPd25lZCA/IFwiI2Y4NzE3MVwiIDogXCIjZmNhNWE1XCI7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gc2VsZk93bmVkID8gMC45NSA6IDAuODtcbiAgICBjdHguZmlsbCgpO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMxMTE4MjdcIjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcblxuICAgIGlmIChzZWxmT3duZWQgJiYgbWlzcy5hZ3JvX3JhZGl1cyA+IDApIHtcbiAgICAgIGN0eC5zYXZlKCk7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjb25zdCByQ2FudmFzID0gbWlzcy5hZ3JvX3JhZGl1cyAqIHJhZGl1c1NjYWxlO1xuICAgICAgY3R4LnNldExpbmVEYXNoKFsxNCwgMTBdKTtcbiAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSgyNDgsMTEzLDExMywwLjM1KVwiO1xuICAgICAgY3R4LmxpbmVXaWR0aCA9IDEuMjtcbiAgICAgIGN0eC5hcmMocC54LCBwLnksIHJDYW52YXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgIGN0eC5yZXN0b3JlKCk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGRyYXdHcmlkKCk6IHZvaWQge1xuICBpZiAoIWN0eCkgcmV0dXJuO1xuICBjdHguc2F2ZSgpO1xuICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMyMzRcIjtcbiAgY3R4LmxpbmVXaWR0aCA9IDE7XG4gIGNvbnN0IHN0ZXAgPSAxMDAwO1xuICBmb3IgKGxldCB4ID0gMDsgeCA8PSB3b3JsZC53OyB4ICs9IHN0ZXApIHtcbiAgICBjb25zdCBhID0gd29ybGRUb0NhbnZhcyh7IHgsIHk6IDAgfSk7XG4gICAgY29uc3QgYiA9IHdvcmxkVG9DYW52YXMoeyB4LCB5OiB3b3JsZC5oIH0pO1xuICAgIGN0eC5iZWdpblBhdGgoKTsgY3R4Lm1vdmVUbyhhLngsIGEueSk7IGN0eC5saW5lVG8oYi54LCBiLnkpOyBjdHguc3Ryb2tlKCk7XG4gIH1cbiAgZm9yIChsZXQgeSA9IDA7IHkgPD0gd29ybGQuaDsgeSArPSBzdGVwKSB7XG4gICAgY29uc3QgYSA9IHdvcmxkVG9DYW52YXMoeyB4OiAwLCB5IH0pO1xuICAgIGNvbnN0IGIgPSB3b3JsZFRvQ2FudmFzKHsgeDogd29ybGQudywgeSB9KTtcbiAgICBjdHguYmVnaW5QYXRoKCk7IGN0eC5tb3ZlVG8oYS54LCBhLnkpOyBjdHgubGluZVRvKGIueCwgYi55KTsgY3R4LnN0cm9rZSgpO1xuICB9XG4gIGN0eC5yZXN0b3JlKCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpOiB2b2lkIHtcbiAgaWYgKCFtaXNzaWxlTGF1bmNoQnRuKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGNvdW50ID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gIGNvbnN0IHJlbWFpbmluZyA9IGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZygpO1xuICBjb25zdCBjb29saW5nRG93biA9IHJlbWFpbmluZyA+IDAuMDU7XG4gIGNvbnN0IHNob3VsZERpc2FibGUgPSAhcm91dGUgfHwgY291bnQgPT09IDAgfHwgY29vbGluZ0Rvd247XG4gIG1pc3NpbGVMYXVuY2hCdG4uZGlzYWJsZWQgPSBzaG91bGREaXNhYmxlO1xuXG4gIGlmICghcm91dGUpIHtcbiAgICBtaXNzaWxlTGF1bmNoQnRuLnRleHRDb250ZW50ID0gXCJMYXVuY2ggbWlzc2lsZXNcIjtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoY29vbGluZ0Rvd24pIHtcbiAgICBtaXNzaWxlTGF1bmNoQnRuLnRleHRDb250ZW50ID0gYExhdW5jaCBpbiAke3JlbWFpbmluZy50b0ZpeGVkKDEpfXNgO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChyb3V0ZS5uYW1lKSB7XG4gICAgbWlzc2lsZUxhdW5jaEJ0bi50ZXh0Q29udGVudCA9IGBMYXVuY2ggJHtyb3V0ZS5uYW1lfWA7XG4gIH0gZWxzZSB7XG4gICAgbWlzc2lsZUxhdW5jaEJ0bi50ZXh0Q29udGVudCA9IFwiTGF1bmNoIG1pc3NpbGVzXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk6IG51bWJlciB7XG4gIGNvbnN0IHJlbWFpbmluZyA9IHN0YXRlUmVmLm5leHRNaXNzaWxlUmVhZHlBdCAtIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZVJlZik7XG4gIHJldHVybiByZW1haW5pbmcgPiAwID8gcmVtYWluaW5nIDogMDtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpOiB2b2lkIHtcbiAgY29uc3QgbWV0YSA9IHN0YXRlUmVmLndvcmxkTWV0YSA/PyB7fTtcbiAgY29uc3QgaGFzV2lkdGggPSB0eXBlb2YgbWV0YS53ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLncpO1xuICBjb25zdCBoYXNIZWlnaHQgPSB0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpO1xuICBjb25zdCBoYXNDID0gdHlwZW9mIG1ldGEuYyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5jKTtcblxuICBpZiAoaGFzV2lkdGgpIHtcbiAgICB3b3JsZC53ID0gbWV0YS53ITtcbiAgfVxuICBpZiAoaGFzSGVpZ2h0KSB7XG4gICAgd29ybGQuaCA9IG1ldGEuaCE7XG4gIH1cbiAgaWYgKENzcGFuKSB7XG4gICAgQ3NwYW4udGV4dENvbnRlbnQgPSBoYXNDID8gbWV0YS5jIS50b0ZpeGVkKDApIDogXCJcdTIwMTNcIjtcbiAgfVxuICBpZiAoV0hzcGFuKSB7XG4gICAgY29uc3QgdyA9IGhhc1dpZHRoID8gbWV0YS53ISA6IHdvcmxkLnc7XG4gICAgY29uc3QgaCA9IGhhc0hlaWdodCA/IG1ldGEuaCEgOiB3b3JsZC5oO1xuICAgIFdIc3Bhbi50ZXh0Q29udGVudCA9IGAke3cudG9GaXhlZCgwKX1cdTAwRDcke2gudG9GaXhlZCgwKX1gO1xuICB9XG4gIGlmIChIUHNwYW4pIHtcbiAgICBpZiAoc3RhdGVSZWYubWUgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXRlUmVmLm1lLmhwKSkge1xuICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlUmVmLm1lLmhwKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBIUHNwYW4udGV4dENvbnRlbnQgPSBcIlx1MjAxM1wiO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBsb29wKHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFjdikgcmV0dXJuO1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZSh0aW1lc3RhbXApKSB7XG4gICAgdGltZXN0YW1wID0gbGFzdExvb3BUcyA/PyAwO1xuICB9XG4gIGxldCBkdFNlY29uZHMgPSAwO1xuICBpZiAobGFzdExvb3BUcyAhPT0gbnVsbCkge1xuICAgIGR0U2Vjb25kcyA9ICh0aW1lc3RhbXAgLSBsYXN0TG9vcFRzKSAvIDEwMDA7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPCAwKSB7XG4gICAgICBkdFNlY29uZHMgPSAwO1xuICAgIH1cbiAgfVxuICBsYXN0TG9vcFRzID0gdGltZXN0YW1wO1xuICB1cGRhdGVMZWdEYXNoT2Zmc2V0cyhkdFNlY29uZHMpO1xuXG4gIGN0eC5jbGVhclJlY3QoMCwgMCwgY3Yud2lkdGgsIGN2LmhlaWdodCk7XG4gIGRyYXdHcmlkKCk7XG4gIGRyYXdSb3V0ZSgpO1xuICBkcmF3TWlzc2lsZVJvdXRlKCk7XG4gIGRyYXdNaXNzaWxlcygpO1xuXG4gIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuXG4gIGlmIChUc3Bhbikge1xuICAgIFRzcGFuLnRleHRDb250ZW50ID0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlUmVmKS50b0ZpeGVkKDIpO1xuICB9XG5cbiAgZm9yIChjb25zdCBnIG9mIHN0YXRlUmVmLmdob3N0cykge1xuICAgIGRyYXdTaGlwKGcueCwgZy55LCBnLnZ4LCBnLnZ5LCBcIiM5Y2EzYWZcIiwgZmFsc2UpO1xuICAgIGRyYXdHaG9zdERvdChnLngsIGcueSk7XG4gIH1cbiAgaWYgKHN0YXRlUmVmLm1lKSB7XG4gICAgZHJhd1NoaXAoc3RhdGVSZWYubWUueCwgc3RhdGVSZWYubWUueSwgc3RhdGVSZWYubWUudngsIHN0YXRlUmVmLm1lLnZ5LCBcIiMyMmQzZWVcIiwgdHJ1ZSk7XG4gIH1cbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGxvb3ApO1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmludGVyZmFjZSBIaWdobGlnaHRDb250ZW50T3B0aW9ucyB7XG4gIHRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgc3RlcENvdW50OiBudW1iZXI7XG4gIHNob3dOZXh0OiBib29sZWFuO1xuICBuZXh0TGFiZWw/OiBzdHJpbmc7XG4gIG9uTmV4dD86ICgpID0+IHZvaWQ7XG4gIHNob3dTa2lwOiBib29sZWFuO1xuICBza2lwTGFiZWw/OiBzdHJpbmc7XG4gIG9uU2tpcD86ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGlnaGxpZ2h0ZXIge1xuICBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZDtcbiAgaGlkZSgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJ0dXRvcmlhbC1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVIaWdobGlnaHRlcigpOiBIaWdobGlnaHRlciB7XG4gIGVuc3VyZVN0eWxlcygpO1xuXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheVwiO1xuICBvdmVybGF5LnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBcInBvbGl0ZVwiKTtcblxuICBjb25zdCBzY3JpbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNjcmltLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fc2NyaW1cIjtcblxuICBjb25zdCBoaWdobGlnaHRCb3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoaWdobGlnaHRCb3guY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19oaWdobGlnaHRcIjtcblxuICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdG9vbHRpcC5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXBcIjtcblxuICBjb25zdCBwcm9ncmVzcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHByb2dyZXNzLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3NcIjtcblxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJoM1wiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X190aXRsZVwiO1xuXG4gIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwicFwiKTtcbiAgYm9keS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2JvZHlcIjtcblxuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnNcIjtcblxuICBjb25zdCBza2lwQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgc2tpcEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgc2tpcEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0XCI7XG4gIHNraXBCdG4udGV4dENvbnRlbnQgPSBcIlNraXBcIjtcblxuICBjb25zdCBuZXh0QnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgbmV4dEJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgbmV4dEJ0bi5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2J0biB0dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnlcIjtcbiAgbmV4dEJ0bi50ZXh0Q29udGVudCA9IFwiTmV4dFwiO1xuXG4gIGFjdGlvbnMuYXBwZW5kKHNraXBCdG4sIG5leHRCdG4pO1xuICB0b29sdGlwLmFwcGVuZChwcm9ncmVzcywgdGl0bGUsIGJvZHksIGFjdGlvbnMpO1xuICBvdmVybGF5LmFwcGVuZChzY3JpbSwgaGlnaGxpZ2h0Qm94LCB0b29sdGlwKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICBsZXQgY3VycmVudFRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHJlc2l6ZU9ic2VydmVyOiBSZXNpemVPYnNlcnZlciB8IG51bGwgPSBudWxsO1xuICBsZXQgZnJhbWVIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgb25OZXh0OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IG9uU2tpcDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gc2NoZWR1bGVVcGRhdGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgaWYgKGZyYW1lSGFuZGxlICE9PSBudWxsKSByZXR1cm47XG4gICAgZnJhbWVIYW5kbGUgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICAgIHVwZGF0ZVBvc2l0aW9uKCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVQb3NpdGlvbigpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUpIHJldHVybjtcblxuICAgIGlmIChjdXJyZW50VGFyZ2V0KSB7XG4gICAgICBjb25zdCByZWN0ID0gY3VycmVudFRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IHBhZGRpbmcgPSAxMjtcbiAgICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMCwgcmVjdC53aWR0aCArIHBhZGRpbmcgKiAyKTtcbiAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDAsIHJlY3QuaGVpZ2h0ICsgcGFkZGluZyAqIDIpO1xuICAgICAgY29uc3QgbGVmdCA9IHJlY3QubGVmdCAtIHBhZGRpbmc7XG4gICAgICBjb25zdCB0b3AgPSByZWN0LnRvcCAtIHBhZGRpbmc7XG5cbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQobGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b3ApfXB4KWA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUud2lkdGggPSBgJHtNYXRoLnJvdW5kKHdpZHRoKX1weGA7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gYCR7TWF0aC5yb3VuZChoZWlnaHQpfXB4YDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIHRvb2x0aXAuc3R5bGUubWF4V2lkdGggPSBgbWluKDM0MHB4LCAke01hdGgubWF4KDI2MCwgd2luZG93LmlubmVyV2lkdGggLSAzMil9cHgpYDtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBsZXQgdG9vbHRpcFRvcCA9IHJlY3QuYm90dG9tICsgMTg7XG4gICAgICBpZiAodG9vbHRpcFRvcCArIHRvb2x0aXBIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSAyMCkge1xuICAgICAgICB0b29sdGlwVG9wID0gTWF0aC5tYXgoMjAsIHJlY3QudG9wIC0gdG9vbHRpcEhlaWdodCAtIDE4KTtcbiAgICAgIH1cbiAgICAgIGxldCB0b29sdGlwTGVmdCA9IHJlY3QubGVmdCArIHJlY3Qud2lkdGggLyAyIC0gdG9vbHRpcFdpZHRoIC8gMjtcbiAgICAgIHRvb2x0aXBMZWZ0ID0gY2xhbXAodG9vbHRpcExlZnQsIDIwLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCAtIDIwKTtcbiAgICAgIHRvb2x0aXAuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQodG9vbHRpcExlZnQpfXB4LCAke01hdGgucm91bmQodG9vbHRpcFRvcCl9cHgpYDtcbiAgICB9IGVsc2Uge1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS53aWR0aCA9IFwiMHB4XCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUuaGVpZ2h0ID0gXCIwcHhcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh3aW5kb3cuaW5uZXJXaWR0aCAvIDIpfXB4LCAke01hdGgucm91bmQod2luZG93LmlubmVySGVpZ2h0IC8gMil9cHgpYDtcblxuICAgICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIxXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcInZpc2libGVcIjtcbiAgICAgIGNvbnN0IHRvb2x0aXBXaWR0aCA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCB0b29sdGlwSGVpZ2h0ID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XG4gICAgICBjb25zdCB0b29sdGlwTGVmdCA9IGNsYW1wKCh3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCkgLyAyLCAyMCwgd2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGggLSAyMCk7XG4gICAgICBjb25zdCB0b29sdGlwVG9wID0gY2xhbXAoKHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQpIC8gMiwgMjAsIHdpbmRvdy5pbm5lckhlaWdodCAtIHRvb2x0aXBIZWlnaHQgLSAyMCk7XG4gICAgICB0b29sdGlwLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHRvb2x0aXBMZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvb2x0aXBUb3ApfXB4KWA7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXR0YWNoTGlzdGVuZXJzKCk6IHZvaWQge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHNjaGVkdWxlVXBkYXRlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaExpc3RlbmVycygpOiB2b2lkIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBzY2hlZHVsZVVwZGF0ZSk7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgc2NoZWR1bGVVcGRhdGUpO1xuICAgIGlmIChmcmFtZUhhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKGZyYW1lSGFuZGxlKTtcbiAgICAgIGZyYW1lSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHJlc2l6ZU9ic2VydmVyKSB7XG4gICAgICByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgc2tpcEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBvblNraXA/LigpO1xuICB9KTtcblxuICBuZXh0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIG9uTmV4dD8uKCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIHJlbmRlclRvb2x0aXAob3B0aW9uczogSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCB7IHN0ZXBDb3VudCwgc3RlcEluZGV4LCB0aXRsZTogb3B0aW9uVGl0bGUsIGJvZHk6IG9wdGlvbkJvZHksIHNob3dOZXh0LCBuZXh0TGFiZWwsIHNob3dTa2lwLCBza2lwTGFiZWwgfSA9IG9wdGlvbnM7XG5cbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKHN0ZXBDb3VudCkgJiYgc3RlcENvdW50ID4gMCkge1xuICAgICAgcHJvZ3Jlc3MudGV4dENvbnRlbnQgPSBgU3RlcCAke3N0ZXBJbmRleCArIDF9IG9mICR7c3RlcENvdW50fWA7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9ncmVzcy50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICBwcm9ncmVzcy5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvblRpdGxlICYmIG9wdGlvblRpdGxlLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aXRsZS50ZXh0Q29udGVudCA9IG9wdGlvblRpdGxlO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGl0bGUudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgdGl0bGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIGJvZHkudGV4dENvbnRlbnQgPSBvcHRpb25Cb2R5O1xuXG4gICAgb25OZXh0ID0gc2hvd05leHQgPyBvcHRpb25zLm9uTmV4dCA/PyBudWxsIDogbnVsbDtcbiAgICBpZiAoc2hvd05leHQpIHtcbiAgICAgIG5leHRCdG4udGV4dENvbnRlbnQgPSBuZXh0TGFiZWwgPz8gXCJOZXh0XCI7XG4gICAgICBuZXh0QnRuLnN0eWxlLmRpc3BsYXkgPSBcImlubGluZS1mbGV4XCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHRCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIG9uU2tpcCA9IHNob3dTa2lwID8gb3B0aW9ucy5vblNraXAgPz8gbnVsbCA6IG51bGw7XG4gICAgaWYgKHNob3dTa2lwKSB7XG4gICAgICBza2lwQnRuLnRleHRDb250ZW50ID0gc2tpcExhYmVsID8/IFwiU2tpcFwiO1xuICAgICAgc2tpcEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJpbmxpbmUtZmxleFwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBza2lwQnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IHRydWU7XG4gICAgY3VycmVudFRhcmdldCA9IG9wdGlvbnMudGFyZ2V0ID8/IG51bGw7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICByZW5kZXJUb29sdGlwKG9wdGlvbnMpO1xuICAgIGlmIChyZXNpemVPYnNlcnZlcikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFRhcmdldCAmJiB0eXBlb2YgUmVzaXplT2JzZXJ2ZXIgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHNjaGVkdWxlVXBkYXRlKCkpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShjdXJyZW50VGFyZ2V0KTtcbiAgICB9XG4gICAgYXR0YWNoTGlzdGVuZXJzKCk7XG4gICAgc2NoZWR1bGVVcGRhdGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjtcbiAgICB0b29sdGlwLnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIGRldGFjaExpc3RlbmVycygpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlKCk7XG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2hvdyxcbiAgICBoaWRlLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNUWUxFX0lEKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgc3R5bGUuaWQgPSBTVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLnR1dG9yaWFsLW92ZXJsYXkge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgICB6LWluZGV4OiA1MDtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXkudmlzaWJsZSB7XG4gICAgICBkaXNwbGF5OiBibG9jaztcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3NjcmltIHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGluc2V0OiAwO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9faGlnaGxpZ2h0IHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gICAgICBib3JkZXI6IDJweCBzb2xpZCByZ2JhKDU2LCAxODksIDI0OCwgMC45NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDAgMCAycHggcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjUpLCAwIDAgMjRweCByZ2JhKDM0LCAyMTEsIDIzOCwgMC4yNSk7XG4gICAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC4xOHMgZWFzZSwgd2lkdGggMC4xOHMgZWFzZSwgaGVpZ2h0IDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Rvb2x0aXAge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgbWluLXdpZHRoOiAyNDBweDtcbiAgICAgIG1heC13aWR0aDogbWluKDM0MHB4LCBjYWxjKDEwMHZ3IC0gMzJweCkpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgxNSwgMjMsIDQyLCAwLjk1KTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNnB4O1xuICAgICAgcGFkZGluZzogMTZweCAxOHB4O1xuICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICBib3gtc2hhZG93OiAwIDEycHggMzJweCByZ2JhKDE1LCAyMywgNDIsIDAuNTUpO1xuICAgICAgcG9pbnRlci1ldmVudHM6IGF1dG87XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdmlzaWJpbGl0eTogaGlkZGVuO1xuICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoMHB4LCAwcHgpO1xuICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMThzIGVhc2UsIG9wYWNpdHkgMC4xOHMgZWFzZTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzIHtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC43NSk7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X190aXRsZSB7XG4gICAgICBtYXJnaW46IDAgMCA4cHg7XG4gICAgICBmb250LXNpemU6IDE1cHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wNGVtO1xuICAgICAgY29sb3I6ICNmMWY1Zjk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19ib2R5IHtcbiAgICAgIG1hcmdpbjogMCAwIDE0cHg7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBsaW5lLWhlaWdodDogMS41O1xuICAgICAgY29sb3I6ICNjYmQ1ZjU7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBnYXA6IDEwcHg7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICBwYWRkaW5nOiA2cHggMTRweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDk5OXB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTtcbiAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeSB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4yNSk7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjU1KTtcbiAgICAgIGNvbG9yOiAjZjhmYWZjO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5OmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjM1KTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3Qge1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBjb2xvcjogcmdiYSgyMDMsIDIxMywgMjI1LCAwLjkpO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdDpob3ZlciB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMjAzLCAyMTMsIDIyNSwgMC41NSk7XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cbiIsICJjb25zdCBTVE9SQUdFX1BSRUZJWCA9IFwibHNkOnR1dG9yaWFsOlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsUHJvZ3Jlc3Mge1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgY29tcGxldGVkOiBib29sZWFuO1xuICB1cGRhdGVkQXQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZ2V0U3RvcmFnZSgpOiBTdG9yYWdlIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIgfHwgIXdpbmRvdy5sb2NhbFN0b3JhZ2UpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkUHJvZ3Jlc3MoaWQ6IHN0cmluZyk6IFR1dG9yaWFsUHJvZ3Jlc3MgfCBudWxsIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSBzdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCk7XG4gICAgaWYgKCFyYXcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBUdXRvcmlhbFByb2dyZXNzO1xuICAgIGlmIChcbiAgICAgIHR5cGVvZiBwYXJzZWQgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkID09PSBudWxsIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnN0ZXBJbmRleCAhPT0gXCJudW1iZXJcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5jb21wbGV0ZWQgIT09IFwiYm9vbGVhblwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnVwZGF0ZWRBdCAhPT0gXCJudW1iZXJcIlxuICAgICkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZWQ7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlUHJvZ3Jlc3MoaWQ6IHN0cmluZywgcHJvZ3Jlc3M6IFR1dG9yaWFsUHJvZ3Jlc3MpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfUFJFRklYICsgaWQsIEpTT04uc3RyaW5naWZ5KHByb2dyZXNzKSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIGlnbm9yZSBzdG9yYWdlIGZhaWx1cmVzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyUHJvZ3Jlc3MoaWQ6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnJlbW92ZUl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIGlnbm9yZSBzdG9yYWdlIGZhaWx1cmVzXG4gIH1cbn1cbiIsICJleHBvcnQgdHlwZSBSb2xlSWQgPVxuICB8IFwiY2FudmFzXCJcbiAgfCBcInNoaXBTZXRcIlxuICB8IFwic2hpcFNlbGVjdFwiXG4gIHwgXCJzaGlwRGVsZXRlXCJcbiAgfCBcInNoaXBDbGVhclwiXG4gIHwgXCJzaGlwU3BlZWRTbGlkZXJcIlxuICB8IFwibWlzc2lsZVNldFwiXG4gIHwgXCJtaXNzaWxlU2VsZWN0XCJcbiAgfCBcIm1pc3NpbGVEZWxldGVcIlxuICB8IFwibWlzc2lsZVNwZWVkU2xpZGVyXCJcbiAgfCBcIm1pc3NpbGVBZ3JvU2xpZGVyXCJcbiAgfCBcIm1pc3NpbGVBZGRSb3V0ZVwiXG4gIHwgXCJtaXNzaWxlTGF1bmNoXCJcbiAgfCBcInJvdXRlUHJldlwiXG4gIHwgXCJyb3V0ZU5leHRcIlxuICB8IFwiaGVscFRvZ2dsZVwiXG4gIHwgXCJ0dXRvcmlhbFN0YXJ0XCJcbiAgfCBcInNwYXduQm90XCI7XG5cbmV4cG9ydCB0eXBlIFJvbGVSZXNvbHZlciA9ICgpID0+IEhUTUxFbGVtZW50IHwgbnVsbDtcblxuZXhwb3J0IHR5cGUgUm9sZXNNYXAgPSBSZWNvcmQ8Um9sZUlkLCBSb2xlUmVzb2x2ZXI+O1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUm9sZXMoKTogUm9sZXNNYXAge1xuICByZXR1cm4ge1xuICAgIGNhbnZhczogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdlwiKSxcbiAgICBzaGlwU2V0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2V0XCIpLFxuICAgIHNoaXBTZWxlY3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZWxlY3RcIiksXG4gICAgc2hpcERlbGV0ZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSxcbiAgICBzaGlwQ2xlYXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1jbGVhclwiKSxcbiAgICBzaGlwU3BlZWRTbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1zbGlkZXJcIiksXG4gICAgbWlzc2lsZVNldDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSxcbiAgICBtaXNzaWxlU2VsZWN0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2VsZWN0XCIpLFxuICAgIG1pc3NpbGVEZWxldGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1kZWxldGVcIiksXG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtc2xpZGVyXCIpLFxuICAgIG1pc3NpbGVBZ3JvU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1zbGlkZXJcIiksXG4gICAgbWlzc2lsZUFkZFJvdXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWRkLXJvdXRlXCIpLFxuICAgIG1pc3NpbGVMYXVuY2g6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2hcIiksXG4gICAgcm91dGVQcmV2OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIiksXG4gICAgcm91dGVOZXh0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW5leHRcIiksXG4gICAgaGVscFRvZ2dsZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSxcbiAgICB0dXRvcmlhbFN0YXJ0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInR1dG9yaWFsLXN0YXJ0XCIpLFxuICAgIHNwYXduQm90OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdFwiKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJvbGVFbGVtZW50KHJvbGVzOiBSb2xlc01hcCwgcm9sZTogUm9sZUlkIHwgbnVsbCB8IHVuZGVmaW5lZCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGlmICghcm9sZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJlc29sdmVyID0gcm9sZXNbcm9sZV07XG4gIHJldHVybiByZXNvbHZlciA/IHJlc29sdmVyKCkgOiBudWxsO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMsIEV2ZW50S2V5IH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlSGlnaGxpZ2h0ZXIsIHR5cGUgSGlnaGxpZ2h0ZXIgfSBmcm9tIFwiLi9oaWdobGlnaHRcIjtcbmltcG9ydCB7IGNsZWFyUHJvZ3Jlc3MsIGxvYWRQcm9ncmVzcywgc2F2ZVByb2dyZXNzIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuaW1wb3J0IHsgZ2V0Um9sZUVsZW1lbnQsIHR5cGUgUm9sZUlkLCB0eXBlIFJvbGVzTWFwIH0gZnJvbSBcIi4vcm9sZXNcIjtcblxuZXhwb3J0IHR5cGUgU3RlcEFkdmFuY2UgPVxuICB8IHtcbiAgICAgIGtpbmQ6IFwiZXZlbnRcIjtcbiAgICAgIGV2ZW50OiBFdmVudEtleTtcbiAgICAgIHdoZW4/OiAocGF5bG9hZDogdW5rbm93bikgPT4gYm9vbGVhbjtcbiAgICAgIGNoZWNrPzogKCkgPT4gYm9vbGVhbjtcbiAgICB9XG4gIHwge1xuICAgICAga2luZDogXCJtYW51YWxcIjtcbiAgICAgIG5leHRMYWJlbD86IHN0cmluZztcbiAgICB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsU3RlcCB7XG4gIGlkOiBzdHJpbmc7XG4gIHRhcmdldDogUm9sZUlkIHwgKCgpID0+IEhUTUxFbGVtZW50IHwgbnVsbCkgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBhZHZhbmNlOiBTdGVwQWR2YW5jZTtcbiAgb25FbnRlcj86ICgpID0+IHZvaWQ7XG4gIG9uRXhpdD86ICgpID0+IHZvaWQ7XG4gIGFsbG93U2tpcD86IGJvb2xlYW47XG4gIHNraXBMYWJlbD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEVuZ2luZU9wdGlvbnMge1xuICBpZDogc3RyaW5nO1xuICBidXM6IEV2ZW50QnVzO1xuICByb2xlczogUm9sZXNNYXA7XG4gIHN0ZXBzOiBUdXRvcmlhbFN0ZXBbXTtcbn1cblxuaW50ZXJmYWNlIFN0YXJ0T3B0aW9ucyB7XG4gIHJlc3VtZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxFbmdpbmUge1xuICBzdGFydChvcHRpb25zPzogU3RhcnRPcHRpb25zKTogdm9pZDtcbiAgcmVzdGFydCgpOiB2b2lkO1xuICBzdG9wKCk6IHZvaWQ7XG4gIGlzUnVubmluZygpOiBib29sZWFuO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUdXRvcmlhbEVuZ2luZSh7IGlkLCBidXMsIHJvbGVzLCBzdGVwcyB9OiBFbmdpbmVPcHRpb25zKTogVHV0b3JpYWxFbmdpbmUge1xuICBjb25zdCBoaWdobGlnaHRlcjogSGlnaGxpZ2h0ZXIgPSBjcmVhdGVIaWdobGlnaHRlcigpO1xuICBsZXQgcnVubmluZyA9IGZhbHNlO1xuICBsZXQgcGF1c2VkID0gZmFsc2U7XG4gIGxldCBjdXJyZW50SW5kZXggPSAtMTtcbiAgbGV0IGN1cnJlbnRTdGVwOiBUdXRvcmlhbFN0ZXAgfCBudWxsID0gbnVsbDtcbiAgbGV0IGNsZWFudXBDdXJyZW50OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IHJlbmRlckN1cnJlbnQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgbGFzdFNhdmVkQ29tcGxldGVkID0gZmFsc2U7XG4gIGxldCBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcblxuICBjb25zdCBwZXJzaXN0ZW50TGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuXG4gIHBlcnNpc3RlbnRMaXN0ZW5lcnMucHVzaChcbiAgICBidXMub24oXCJoZWxwOnZpc2libGVDaGFuZ2VkXCIsICh7IHZpc2libGUgfSkgPT4ge1xuICAgICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgICBwYXVzZWQgPSBCb29sZWFuKHZpc2libGUpO1xuICAgICAgaWYgKHBhdXNlZCkge1xuICAgICAgICBoaWdobGlnaHRlci5oaWRlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZW5kZXJDdXJyZW50Py4oKTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcblxuICBmdW5jdGlvbiByZXNvbHZlVGFyZ2V0KHN0ZXA6IFR1dG9yaWFsU3RlcCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gICAgaWYgKCFzdGVwLnRhcmdldCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygc3RlcC50YXJnZXQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgcmV0dXJuIHN0ZXAudGFyZ2V0KCk7XG4gICAgfVxuICAgIHJldHVybiBnZXRSb2xlRWxlbWVudChyb2xlcywgc3RlcC50YXJnZXQpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2xhbXBJbmRleChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShpbmRleCkgfHwgaW5kZXggPCAwKSByZXR1cm4gMDtcbiAgICBpZiAoaW5kZXggPj0gc3RlcHMubGVuZ3RoKSByZXR1cm4gc3RlcHMubGVuZ3RoIC0gMTtcbiAgICByZXR1cm4gTWF0aC5mbG9vcihpbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTdGVwKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gc3RlcHMubGVuZ3RoKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cblxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG5cbiAgICBjdXJyZW50SW5kZXggPSBpbmRleDtcbiAgICBjb25zdCBzdGVwID0gc3RlcHNbaW5kZXhdO1xuICAgIGN1cnJlbnRTdGVwID0gc3RlcDtcblxuICAgIHBlcnNpc3RQcm9ncmVzcyhpbmRleCwgZmFsc2UpO1xuXG4gICAgYnVzLmVtaXQoXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiLCB7IGlkLCBzdGVwSW5kZXg6IGluZGV4LCB0b3RhbDogc3RlcHMubGVuZ3RoIH0pO1xuICAgIHN0ZXAub25FbnRlcj8uKCk7XG5cbiAgICBjb25zdCBhbGxvd1NraXAgPSBzdGVwLmFsbG93U2tpcCAhPT0gZmFsc2U7XG4gICAgY29uc3QgcmVuZGVyID0gKCk6IHZvaWQgPT4ge1xuICAgICAgaWYgKCFydW5uaW5nIHx8IHBhdXNlZCkgcmV0dXJuO1xuICAgICAgaGlnaGxpZ2h0ZXIuc2hvdyh7XG4gICAgICAgIHRhcmdldDogcmVzb2x2ZVRhcmdldChzdGVwKSxcbiAgICAgICAgdGl0bGU6IHN0ZXAudGl0bGUsXG4gICAgICAgIGJvZHk6IHN0ZXAuYm9keSxcbiAgICAgICAgc3RlcEluZGV4OiBpbmRleCxcbiAgICAgICAgc3RlcENvdW50OiBzdGVwcy5sZW5ndGgsXG4gICAgICAgIHNob3dOZXh0OiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIixcbiAgICAgICAgbmV4dExhYmVsOiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIlxuICAgICAgICAgID8gc3RlcC5hZHZhbmNlLm5leHRMYWJlbCA/PyAoaW5kZXggPT09IHN0ZXBzLmxlbmd0aCAtIDEgPyBcIkZpbmlzaFwiIDogXCJOZXh0XCIpXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIG9uTmV4dDogc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwibWFudWFsXCIgPyBhZHZhbmNlU3RlcCA6IHVuZGVmaW5lZCxcbiAgICAgICAgc2hvd1NraXA6IGFsbG93U2tpcCxcbiAgICAgICAgc2tpcExhYmVsOiBzdGVwLnNraXBMYWJlbCxcbiAgICAgICAgb25Ta2lwOiBhbGxvd1NraXAgPyBza2lwQ3VycmVudFN0ZXAgOiB1bmRlZmluZWQsXG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmVuZGVyQ3VycmVudCA9IHJlbmRlcjtcbiAgICByZW5kZXIoKTtcblxuICAgIGlmIChzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJldmVudFwiKSB7XG4gICAgICBjb25zdCBoYW5kbGVyID0gKHBheWxvYWQ6IHVua25vd24pOiB2b2lkID0+IHtcbiAgICAgICAgaWYgKCFydW5uaW5nIHx8IHBhdXNlZCkgcmV0dXJuO1xuICAgICAgICBpZiAoc3RlcC5hZHZhbmNlLndoZW4gJiYgIXN0ZXAuYWR2YW5jZS53aGVuKHBheWxvYWQpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2VUbyhpbmRleCArIDEpO1xuICAgICAgfTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gYnVzLm9uKHN0ZXAuYWR2YW5jZS5ldmVudCwgaGFuZGxlciBhcyAodmFsdWU6IG5ldmVyKSA9PiB2b2lkKTtcbiAgICAgIGlmIChzdGVwLmFkdmFuY2UuY2hlY2sgJiYgc3RlcC5hZHZhbmNlLmNoZWNrKCkpIHtcbiAgICAgICAgaGFuZGxlcih1bmRlZmluZWQpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYWR2YW5jZVRvKG5leHRJbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuICAgIHJlbmRlckN1cnJlbnQgPSBudWxsO1xuICAgIGlmIChuZXh0SW5kZXggPj0gc3RlcHMubGVuZ3RoKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldFN0ZXAobmV4dEluZGV4KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlU3RlcCgpOiB2b2lkIHtcbiAgICBhZHZhbmNlVG8oY3VycmVudEluZGV4ICsgMSk7XG4gIH1cblxuICBmdW5jdGlvbiBza2lwQ3VycmVudFN0ZXAoKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgY29uc3QgbmV4dEluZGV4ID0gY3VycmVudEluZGV4ID49IDAgPyBjdXJyZW50SW5kZXggKyAxIDogMDtcbiAgICBhZHZhbmNlVG8obmV4dEluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBsZXRlVHV0b3JpYWwoKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gdHJ1ZTtcbiAgICBwZXJzaXN0UHJvZ3Jlc3Moc3RlcHMubGVuZ3RoLCB0cnVlKTtcbiAgICBidXMuZW1pdChcInR1dG9yaWFsOmNvbXBsZXRlZFwiLCB7IGlkIH0pO1xuICAgIHN0b3AoKTtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0KG9wdGlvbnM/OiBTdGFydE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCByZXN1bWUgPSBvcHRpb25zPy5yZXN1bWUgIT09IGZhbHNlO1xuICAgIGlmIChydW5uaW5nKSB7XG4gICAgICByZXN0YXJ0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcnVubmluZyA9IHRydWU7XG4gICAgcGF1c2VkID0gZmFsc2U7XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gZmFsc2U7XG4gICAgbGFzdFNhdmVkQ29tcGxldGVkID0gZmFsc2U7XG4gICAgbGV0IHN0YXJ0SW5kZXggPSAwO1xuICAgIGlmIChyZXN1bWUpIHtcbiAgICAgIGNvbnN0IHByb2dyZXNzID0gbG9hZFByb2dyZXNzKGlkKTtcbiAgICAgIGlmIChwcm9ncmVzcyAmJiAhcHJvZ3Jlc3MuY29tcGxldGVkKSB7XG4gICAgICAgIHN0YXJ0SW5kZXggPSBjbGFtcEluZGV4KHByb2dyZXNzLnN0ZXBJbmRleCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFyUHJvZ3Jlc3MoaWQpO1xuICAgIH1cbiAgICBidXMuZW1pdChcInR1dG9yaWFsOnN0YXJ0ZWRcIiwgeyBpZCB9KTtcbiAgICBzZXRTdGVwKHN0YXJ0SW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVzdGFydCgpOiB2b2lkIHtcbiAgICBzdG9wKCk7XG4gICAgc3RhcnQoeyByZXN1bWU6IGZhbHNlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RvcCgpOiB2b2lkIHtcbiAgICBjb25zdCBzaG91bGRQZXJzaXN0ID0gIXN1cHByZXNzUGVyc2lzdE9uU3RvcCAmJiBydW5uaW5nICYmICFsYXN0U2F2ZWRDb21wbGV0ZWQgJiYgY3VycmVudEluZGV4ID49IDAgJiYgY3VycmVudEluZGV4IDwgc3RlcHMubGVuZ3RoO1xuICAgIGNvbnN0IGluZGV4VG9QZXJzaXN0ID0gY3VycmVudEluZGV4O1xuXG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChzaG91bGRQZXJzaXN0KSB7XG4gICAgICBwZXJzaXN0UHJvZ3Jlc3MoaW5kZXhUb1BlcnNpc3QsIGZhbHNlKTtcbiAgICB9XG4gICAgcnVubmluZyA9IGZhbHNlO1xuICAgIHBhdXNlZCA9IGZhbHNlO1xuICAgIGN1cnJlbnRJbmRleCA9IC0xO1xuICAgIHJlbmRlckN1cnJlbnQgPSBudWxsO1xuICAgIGhpZ2hsaWdodGVyLmhpZGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzUnVubmluZygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gcnVubmluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgc3RvcCgpO1xuICAgIGZvciAoY29uc3QgZGlzcG9zZSBvZiBwZXJzaXN0ZW50TGlzdGVuZXJzKSB7XG4gICAgICBkaXNwb3NlKCk7XG4gICAgfVxuICAgIGhpZ2hsaWdodGVyLmRlc3Ryb3koKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBlcnNpc3RQcm9ncmVzcyhzdGVwSW5kZXg6IG51bWJlciwgY29tcGxldGVkOiBib29sZWFuKTogdm9pZCB7XG4gICAgbGFzdFNhdmVkQ29tcGxldGVkID0gY29tcGxldGVkO1xuICAgIHNhdmVQcm9ncmVzcyhpZCwge1xuICAgICAgc3RlcEluZGV4LFxuICAgICAgY29tcGxldGVkLFxuICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydCxcbiAgICByZXN0YXJ0LFxuICAgIHN0b3AsXG4gICAgaXNSdW5uaW5nLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBUdXRvcmlhbFN0ZXAgfSBmcm9tIFwiLi9lbmdpbmVcIjtcblxuZnVuY3Rpb24gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZDogdW5rbm93biwgbWluSW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBpbmRleCA9IChwYXlsb2FkIGFzIHsgaW5kZXg/OiB1bmtub3duIH0pLmluZGV4O1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSBcIm51bWJlclwiIHx8ICFOdW1iZXIuaXNGaW5pdGUoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBpbmRleCA+PSBtaW5JbmRleDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFJvdXRlSWQocGF5bG9hZDogdW5rbm93bik6IHN0cmluZyB8IG51bGwge1xuICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvdXRlSWQgPSAocGF5bG9hZCBhcyB7IHJvdXRlSWQ/OiB1bmtub3duIH0pLnJvdXRlSWQ7XG4gIHJldHVybiB0eXBlb2Ygcm91dGVJZCA9PT0gXCJzdHJpbmdcIiA/IHJvdXRlSWQgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXlsb2FkVG9vbEVxdWFscyh0YXJnZXQ6IHN0cmluZyk6IChwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuIHtcbiAgcmV0dXJuIChwYXlsb2FkOiB1bmtub3duKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiIHx8IHBheWxvYWQgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCB0b29sID0gKHBheWxvYWQgYXMgeyB0b29sPzogdW5rbm93biB9KS50b29sO1xuICAgIHJldHVybiB0eXBlb2YgdG9vbCA9PT0gXCJzdHJpbmdcIiAmJiB0b29sID09PSB0YXJnZXQ7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCYXNpY1R1dG9yaWFsU3RlcHMoKTogVHV0b3JpYWxTdGVwW10ge1xuICBsZXQgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPSAwO1xuICBsZXQgaW5pdGlhbFJvdXRlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgbmV3Um91dGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgcmV0dXJuIFtcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLXBsb3Qtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgYSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJDbGljayBvbiB0aGUgbWFwIHRvIGRyb3AgYXQgbGVhc3QgdGhyZWUgd2F5cG9pbnRzIGFuZCBza2V0Y2ggeW91ciBjb3Vyc2UuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAyKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWNoYW5nZS1zcGVlZFwiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBTcGVlZFNsaWRlclwiLFxuICAgICAgdGl0bGU6IFwiQWRqdXN0IHNoaXAgc3BlZWRcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBTaGlwIFNwZWVkIHNsaWRlciAob3IgcHJlc3MgWyAvIF0pIHRvIGZpbmUtdHVuZSB5b3VyIHRyYXZlbCBzcGVlZC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtc2VsZWN0LWxlZ1wiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBTZWxlY3RcIixcbiAgICAgIHRpdGxlOiBcIlNlbGVjdCBhIHJvdXRlIGxlZ1wiLFxuICAgICAgYm9keTogXCJTd2l0Y2ggdG8gU2VsZWN0IG1vZGUgKFQga2V5KSBhbmQgdGhlbiBjbGljayBhIHdheXBvaW50IG9uIHRoZSBtYXAgdG8gaGlnaGxpZ2h0IGl0cyBsZWcuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpsZWdTZWxlY3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMCksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1kZWxldGUtbGVnXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcERlbGV0ZVwiLFxuICAgICAgdGl0bGU6IFwiRGVsZXRlIGEgcm91dGUgbGVnXCIsXG4gICAgICBib2R5OiBcIlJlbW92ZSB0aGUgc2VsZWN0ZWQgd2F5cG9pbnQgdXNpbmcgdGhlIERlbGV0ZSBjb250cm9sIG9yIHRoZSBEZWxldGUga2V5LlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6d2F5cG9pbnREZWxldGVkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1jbGVhci1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBDbGVhclwiLFxuICAgICAgdGl0bGU6IFwiQ2xlYXIgdGhlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkNsZWFyIHJlbWFpbmluZyB3YXlwb2ludHMgdG8gcmVzZXQgeW91ciBwbG90dGVkIGNvdXJzZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOmNsZWFySW52b2tlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtc2V0LW1vZGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlU2V0XCIsXG4gICAgICB0aXRsZTogXCJTd2l0Y2ggdG8gbWlzc2lsZSBwbGFubmluZ1wiLFxuICAgICAgYm9keTogXCJUYXAgU2V0IHNvIGV2ZXJ5IGNsaWNrIGRyb3BzIG1pc3NpbGUgd2F5cG9pbnRzIG9uIHRoZSBhY3RpdmUgcm91dGUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLFxuICAgICAgICB3aGVuOiBwYXlsb2FkVG9vbEVxdWFscyhcInNldFwiKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXBsb3QtaW5pdGlhbFwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCBtaXNzaWxlIHdheXBvaW50c1wiLFxuICAgICAgYm9keTogXCJDbGljayB0aGUgbWFwIHRvIGRyb3AgYXQgbGVhc3QgdHdvIGd1aWRhbmNlIHBvaW50cyBmb3IgdGhlIGN1cnJlbnQgbWlzc2lsZSByb3V0ZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBpZiAoIWhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDEpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmIChyb3V0ZUlkKSB7XG4gICAgICAgICAgICBpbml0aWFsUm91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLWluaXRpYWxcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggdGhlIHN0cmlrZVwiLFxuICAgICAgYm9keTogXCJTZW5kIHRoZSBwbGFubmVkIG1pc3NpbGUgcm91dGUgbGl2ZSB3aXRoIHRoZSBMYXVuY2ggY29udHJvbCAoTCBrZXkpLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCkge1xuICAgICAgICAgICAgaW5pdGlhbFJvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWFkZC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVBZGRSb3V0ZVwiLFxuICAgICAgdGl0bGU6IFwiQ3JlYXRlIGEgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiUHJlc3MgTmV3IHRvIGFkZCBhIHNlY29uZCBtaXNzaWxlIHJvdXRlIGZvciBhbm90aGVyIHN0cmlrZSBncm91cC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOnJvdXRlQWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFyb3V0ZUlkKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgbmV3Um91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1zZXQtbW9kZS1hZ2FpblwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVTZXRcIixcbiAgICAgIHRpdGxlOiBcIlJldHVybiB0byBTZXQgbW9kZVwiLFxuICAgICAgYm9keTogXCJTd2l0Y2ggYmFjayB0byBTZXQgc28geW91IGNhbiBjaGFydCB3YXlwb2ludHMgb24gdGhlIG5ldyBtaXNzaWxlIHJvdXRlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIixcbiAgICAgICAgd2hlbjogcGF5bG9hZFRvb2xFcXVhbHMoXCJzZXRcIiksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1wbG90LW5ldy1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcImNhbnZhc1wiLFxuICAgICAgdGl0bGU6IFwiUGxvdCB0aGUgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiRHJvcCBhdCBsZWFzdCB0d28gd2F5cG9pbnRzIG9uIHRoZSBuZXcgcm91dGUgdG8gZGVmaW5lIGl0cyBwYXRoLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGlmICghaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKG5ld1JvdXRlSWQgJiYgcm91dGVJZCAmJiByb3V0ZUlkICE9PSBuZXdSb3V0ZUlkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghbmV3Um91dGVJZCAmJiByb3V0ZUlkKSB7XG4gICAgICAgICAgICBuZXdSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtbmV3LXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIHRoZSBuZXcgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiTGF1bmNoIHRoZSBmcmVzaCBtaXNzaWxlIHJvdXRlIHRvIGNvbmZpcm0gaXRzIHBhdHRlcm4uXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFuZXdSb3V0ZUlkIHx8ICFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gbmV3Um91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXN3aXRjaC1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcInJvdXRlTmV4dFwiLFxuICAgICAgdGl0bGU6IFwiU3dpdGNoIGJhY2sgdG8gdGhlIG9yaWdpbmFsIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgXHUyNUMwIFx1MjVCNiBjb250cm9scyAob3IgVGFiL1NoaWZ0K1RhYikgdG8gc2VsZWN0IHlvdXIgZmlyc3QgbWlzc2lsZSByb3V0ZSBhZ2Fpbi5cIixcbiAgICAgIG9uRW50ZXI6ICgpID0+IHtcbiAgICAgICAgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPSAwO1xuICAgICAgfSxcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyICs9IDE7XG4gICAgICAgICAgaWYgKHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyIDwgMSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkIHx8ICFyb3V0ZUlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLWFmdGVyLXN3aXRjaFwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCBmcm9tIHRoZSBvdGhlciByb3V0ZVwiLFxuICAgICAgYm9keTogXCJGaXJlIHRoZSBvcmlnaW5hbCBtaXNzaWxlIHJvdXRlIHRvIHByYWN0aWNlIHJvdW5kLXJvYmluIHN0cmlrZXMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCB8fCAhcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInR1dG9yaWFsLXByYWN0aWNlXCIsXG4gICAgICB0YXJnZXQ6IFwic3Bhd25Cb3RcIixcbiAgICAgIHRpdGxlOiBcIlNwYXduIGEgcHJhY3RpY2UgYm90XCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgQm90IGNvbnRyb2wgdG8gYWRkIGEgdGFyZ2V0IGFuZCByZWhlYXJzZSB0aGVzZSBtYW5ldXZlcnMgaW4gcmVhbCB0aW1lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImJvdDpzcGF3blJlcXVlc3RlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJ0dXRvcmlhbC1jb21wbGV0ZVwiLFxuICAgICAgdGFyZ2V0OiBudWxsLFxuICAgICAgdGl0bGU6IFwiWW91XHUyMDE5cmUgcmVhZHlcIixcbiAgICAgIGJvZHk6IFwiR3JlYXQgd29yay4gUmVsb2FkIHRoZSBjb25zb2xlIG9yIHJlam9pbiBhIHJvb20gdG8gcmV2aXNpdCB0aGVzZSBkcmlsbHMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwibWFudWFsXCIsXG4gICAgICAgIG5leHRMYWJlbDogXCJGaW5pc2hcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gIF07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZVR1dG9yaWFsRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBjcmVhdGVSb2xlcyB9IGZyb20gXCIuL3JvbGVzXCI7XG5pbXBvcnQgeyBnZXRCYXNpY1R1dG9yaWFsU3RlcHMgfSBmcm9tIFwiLi9zdGVwc19iYXNpY1wiO1xuZXhwb3J0IGNvbnN0IEJBU0lDX1RVVE9SSUFMX0lEID0gXCJzaGlwLWJhc2ljc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsQ29udHJvbGxlciB7XG4gIHN0YXJ0KG9wdGlvbnM/OiB7IHJlc3VtZT86IGJvb2xlYW4gfSk6IHZvaWQ7XG4gIHJlc3RhcnQoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRUdXRvcmlhbChidXM6IEV2ZW50QnVzKTogVHV0b3JpYWxDb250cm9sbGVyIHtcbiAgY29uc3Qgcm9sZXMgPSBjcmVhdGVSb2xlcygpO1xuICBjb25zdCBlbmdpbmUgPSBjcmVhdGVUdXRvcmlhbEVuZ2luZSh7XG4gICAgaWQ6IEJBU0lDX1RVVE9SSUFMX0lELFxuICAgIGJ1cyxcbiAgICByb2xlcyxcbiAgICBzdGVwczogZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzKCksXG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RhcnQob3B0aW9ucykge1xuICAgICAgZW5naW5lLnN0YXJ0KG9wdGlvbnMpO1xuICAgIH0sXG4gICAgcmVzdGFydCgpIHtcbiAgICAgIGVuZ2luZS5yZXN0YXJ0KCk7XG4gICAgfSxcbiAgICBkZXN0cm95KCkge1xuICAgICAgZW5naW5lLmRlc3Ryb3koKTtcbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4uL3N0YXRlXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVDaG9pY2Uge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVDb250ZW50IHtcbiAgc3BlYWtlcjogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIGludGVudD86IFwiZmFjdG9yeVwiIHwgXCJ1bml0XCI7XG4gIGNob2ljZXM/OiBEaWFsb2d1ZUNob2ljZVtdO1xuICB0eXBpbmdTcGVlZE1zPzogbnVtYmVyO1xuICBvbkNob2ljZT86IChjaG9pY2VJZDogc3RyaW5nKSA9PiB2b2lkO1xuICBvblRleHRGdWxseVJlbmRlcmVkPzogKCkgPT4gdm9pZDtcbiAgb25Db250aW51ZT86ICgpID0+IHZvaWQ7XG4gIGNvbnRpbnVlTGFiZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlhbG9ndWVPdmVybGF5IHtcbiAgc2hvdyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkO1xuICBoaWRlKCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgaXNWaXNpYmxlKCk6IGJvb2xlYW47XG59XG5cbmNvbnN0IFNUWUxFX0lEID0gXCJkaWFsb2d1ZS1vdmVybGF5LXN0eWxlXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkoKTogRGlhbG9ndWVPdmVybGF5IHtcbiAgZW5zdXJlU3R5bGVzKCk7XG5cbiAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1vdmVybGF5XCI7XG4gIG92ZXJsYXkuc2V0QXR0cmlidXRlKFwiYXJpYS1saXZlXCIsIFwicG9saXRlXCIpO1xuXG4gIGNvbnN0IGNvbnNvbGVGcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGNvbnNvbGVGcmFtZS5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNvbnNvbGVcIjtcblxuICBjb25zdCBzcGVha2VyTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzcGVha2VyTGFiZWwuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1zcGVha2VyXCI7XG5cbiAgY29uc3QgdGV4dEJsb2NrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGV4dEJsb2NrLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtdGV4dFwiO1xuXG4gIGNvbnN0IGN1cnNvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBjdXJzb3IuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jdXJzb3JcIjtcbiAgY3Vyc29yLnRleHRDb250ZW50ID0gXCJfXCI7XG5cbiAgY29uc3QgY2hvaWNlc0xpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidWxcIik7XG4gIGNob2ljZXNMaXN0LmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY2hvaWNlcyBoaWRkZW5cIjtcblxuICBjb25zdCBjb250aW51ZUJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGNvbnRpbnVlQnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICBjb250aW51ZUJ1dHRvbi5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNvbnRpbnVlIGhpZGRlblwiO1xuICBjb250aW51ZUJ1dHRvbi50ZXh0Q29udGVudCA9IFwiQ29udGludWVcIjtcblxuICB0ZXh0QmxvY2suYXBwZW5kKGN1cnNvcik7XG4gIGNvbnNvbGVGcmFtZS5hcHBlbmQoc3BlYWtlckxhYmVsLCB0ZXh0QmxvY2ssIGNob2ljZXNMaXN0LCBjb250aW51ZUJ1dHRvbik7XG4gIG92ZXJsYXkuYXBwZW5kKGNvbnNvbGVGcmFtZSk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgbGV0IHZpc2libGUgPSBmYWxzZTtcbiAgbGV0IHR5cGluZ0hhbmRsZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCB0YXJnZXRUZXh0ID0gXCJcIjtcbiAgbGV0IHJlbmRlcmVkQ2hhcnMgPSAwO1xuICBsZXQgYWN0aXZlQ29udGVudDogRGlhbG9ndWVDb250ZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgZnVuY3Rpb24gY2xlYXJUeXBpbmcoKTogdm9pZCB7XG4gICAgaWYgKHR5cGluZ0hhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0eXBpbmdIYW5kbGUpO1xuICAgICAgdHlwaW5nSGFuZGxlID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBmaW5pc2hUeXBpbmcoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgcmVuZGVyZWRDaGFycyA9IHRhcmdldFRleHQubGVuZ3RoO1xuICAgIHVwZGF0ZVRleHQoKTtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIGNvbnRlbnQub25UZXh0RnVsbHlSZW5kZXJlZD8uKCk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgfHwgY29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVRleHQoKTogdm9pZCB7XG4gICAgY29uc3QgdGV4dFRvU2hvdyA9IHRhcmdldFRleHQuc2xpY2UoMCwgcmVuZGVyZWRDaGFycyk7XG4gICAgdGV4dEJsb2NrLmlubmVySFRNTCA9IFwiXCI7XG4gICAgY29uc3QgdGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICB0ZXh0Tm9kZS50ZXh0Q29udGVudCA9IHRleHRUb1Nob3c7XG4gICAgdGV4dEJsb2NrLmFwcGVuZCh0ZXh0Tm9kZSwgY3Vyc29yKTtcbiAgICBjdXJzb3IuY2xhc3NMaXN0LnRvZ2dsZShcImhpZGRlblwiLCAhdmlzaWJsZSk7XG4gIH1cblxuICBmdW5jdGlvbiByZW5kZXJDaG9pY2VzKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGNob2ljZXNMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgY29uc3QgY2hvaWNlcyA9IEFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSA/IGNvbnRlbnQuY2hvaWNlcyA6IFtdO1xuICAgIGlmIChjaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICBjaG9pY2VzLmZvckVhY2goKGNob2ljZSwgaW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgYnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgICAgYnV0dG9uLmRhdGFzZXQuY2hvaWNlSWQgPSBjaG9pY2UuaWQ7XG4gICAgICBidXR0b24udGV4dENvbnRlbnQgPSBgJHtpbmRleCArIDF9LiAke2Nob2ljZS50ZXh0fWA7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgICAgY29udGVudC5vbkNob2ljZT8uKGNob2ljZS5pZCk7XG4gICAgICB9KTtcbiAgICAgIGl0ZW0uYXBwZW5kKGJ1dHRvbik7XG4gICAgICBjaG9pY2VzTGlzdC5hcHBlbmQoaXRlbSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBzaG93Q29udGludWUoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgaWYgKCFjb250ZW50Lm9uQ29udGludWUpIHtcbiAgICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gbnVsbDtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29udGludWVCdXR0b24udGV4dENvbnRlbnQgPSBjb250ZW50LmNvbnRpbnVlTGFiZWwgPz8gXCJDb250aW51ZVwiO1xuICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24ub25jbGljayA9ICgpID0+IHtcbiAgICAgIGNvbnRlbnQub25Db250aW51ZT8uKCk7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNjaGVkdWxlVHlwZShjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIGNvbnN0IHR5cGluZ1NwZWVkID0gY2xhbXAoTnVtYmVyKGNvbnRlbnQudHlwaW5nU3BlZWRNcykgfHwgMTgsIDgsIDY0KTtcbiAgICBjb25zdCB0aWNrID0gKCk6IHZvaWQgPT4ge1xuICAgICAgcmVuZGVyZWRDaGFycyA9IE1hdGgubWluKHJlbmRlcmVkQ2hhcnMgKyAxLCB0YXJnZXRUZXh0Lmxlbmd0aCk7XG4gICAgICB1cGRhdGVUZXh0KCk7XG4gICAgICBpZiAocmVuZGVyZWRDaGFycyA+PSB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgICBjbGVhclR5cGluZygpO1xuICAgICAgICBjb250ZW50Lm9uVGV4dEZ1bGx5UmVuZGVyZWQ/LigpO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSB8fCBjb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0eXBpbmdIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCh0aWNrLCB0eXBpbmdTcGVlZCk7XG4gICAgICB9XG4gICAgfTtcbiAgICB0eXBpbmdIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dCh0aWNrLCB0eXBpbmdTcGVlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBoYW5kbGVLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlIHx8ICFhY3RpdmVDb250ZW50KSByZXR1cm47XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFjdGl2ZUNvbnRlbnQuY2hvaWNlcykgfHwgYWN0aXZlQ29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCIgXCIgfHwgZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaWYgKHJlbmRlcmVkQ2hhcnMgPCB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgICAgIGZpbmlzaFR5cGluZyhhY3RpdmVDb250ZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhY3RpdmVDb250ZW50Lm9uQ29udGludWU/LigpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGluZGV4ID0gcGFyc2VJbnQoZXZlbnQua2V5LCAxMCk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShpbmRleCkgJiYgaW5kZXggPj0gMSAmJiBpbmRleCA8PSBhY3RpdmVDb250ZW50LmNob2ljZXMubGVuZ3RoKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgY2hvaWNlID0gYWN0aXZlQ29udGVudC5jaG9pY2VzW2luZGV4IC0gMV07XG4gICAgICBhY3RpdmVDb250ZW50Lm9uQ2hvaWNlPy4oY2hvaWNlLmlkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiICYmIHJlbmRlcmVkQ2hhcnMgPCB0YXJnZXRUZXh0Lmxlbmd0aCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGZpbmlzaFR5cGluZyhhY3RpdmVDb250ZW50KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93KGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGFjdGl2ZUNvbnRlbnQgPSBjb250ZW50O1xuICAgIHZpc2libGUgPSB0cnVlO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gICAgb3ZlcmxheS5kYXRhc2V0LmludGVudCA9IGNvbnRlbnQuaW50ZW50ID8/IFwiZmFjdG9yeVwiO1xuICAgIHNwZWFrZXJMYWJlbC50ZXh0Q29udGVudCA9IGNvbnRlbnQuc3BlYWtlcjtcblxuICAgIHRhcmdldFRleHQgPSBjb250ZW50LnRleHQ7XG4gICAgcmVuZGVyZWRDaGFycyA9IDA7XG4gICAgdXBkYXRlVGV4dCgpO1xuICAgIHJlbmRlckNob2ljZXMoY29udGVudCk7XG4gICAgc2hvd0NvbnRpbnVlKGNvbnRlbnQpO1xuICAgIHNjaGVkdWxlVHlwZShjb250ZW50KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZGUoKTogdm9pZCB7XG4gICAgdmlzaWJsZSA9IGZhbHNlO1xuICAgIGFjdGl2ZUNvbnRlbnQgPSBudWxsO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICB0YXJnZXRUZXh0ID0gXCJcIjtcbiAgICByZW5kZXJlZENoYXJzID0gMDtcbiAgICB0ZXh0QmxvY2suaW5uZXJIVE1MID0gXCJcIjtcbiAgICB0ZXh0QmxvY2suYXBwZW5kKGN1cnNvcik7XG4gICAgY2hvaWNlc0xpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24ub25jbGljayA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95KCk6IHZvaWQge1xuICAgIGhpZGUoKTtcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duKTtcbiAgICBvdmVybGF5LnJlbW92ZSgpO1xuICB9XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlS2V5RG93bik7XG5cbiAgcmV0dXJuIHtcbiAgICBzaG93LFxuICAgIGhpZGUsXG4gICAgZGVzdHJveSxcbiAgICBpc1Zpc2libGUoKSB7XG4gICAgICByZXR1cm4gdmlzaWJsZTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBlbnN1cmVTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gIHN0eWxlLmlkID0gU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC5kaWFsb2d1ZS1vdmVybGF5IHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGluc2V0OiAwO1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgei1pbmRleDogNjA7XG4gICAgICBvcGFjaXR5OiAwO1xuICAgICAgdHJhbnNpdGlvbjogb3BhY2l0eSAwLjJzIGVhc2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5LnZpc2libGUge1xuICAgICAgb3BhY2l0eTogMTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBtaW4td2lkdGg6IDMyMHB4O1xuICAgICAgbWF4LXdpZHRoOiBtaW4oNTIwcHgsIGNhbGMoMTAwdncgLSA0OHB4KSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDYsIDExLCAxNiwgMC45Mik7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgICAgIHBhZGRpbmc6IDE4cHggMjBweDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiAxNHB4O1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgyLCA2LCAxNiwgMC42KTtcbiAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgZm9udC1mYW1pbHk6IFwiSUJNIFBsZXggTW9ub1wiLCBcIkpldEJyYWlucyBNb25vXCIsIHVpLW1vbm9zcGFjZSwgU0ZNb25vLVJlZ3VsYXIsIE1lbmxvLCBNb25hY28sIENvbnNvbGFzLCBcIkxpYmVyYXRpb24gTW9ub1wiLCBcIkNvdXJpZXIgTmV3XCIsIG1vbm9zcGFjZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXlbZGF0YS1pbnRlbnQ9XCJmYWN0b3J5XCJdIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNDUpO1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgxMywgMTQ4LCAxMzYsIDAuMzUpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheVtkYXRhLWludGVudD1cInVuaXRcIl0gLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDI0NCwgMTE0LCAxODIsIDAuNDUpO1xuICAgICAgYm94LXNoYWRvdzogMCAyOHB4IDY0cHggcmdiYSgyMzYsIDcyLCAxNTMsIDAuMjgpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtc3BlYWtlciB7XG4gICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4xNmVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuNzUpO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtdGV4dCB7XG4gICAgICBtaW4taGVpZ2h0OiA5MHB4O1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuNTU7XG4gICAgICB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jdXJzb3Ige1xuICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICAgICAgbWFyZ2luLWxlZnQ6IDRweDtcbiAgICAgIGFuaW1hdGlvbjogZGlhbG9ndWUtY3Vyc29yLWJsaW5rIDEuMnMgc3RlcHMoMiwgc3RhcnQpIGluZmluaXRlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY3Vyc29yLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyB7XG4gICAgICBsaXN0LXN0eWxlOiBub25lO1xuICAgICAgbWFyZ2luOiAwO1xuICAgICAgcGFkZGluZzogMDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiA4cHg7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b24sXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlIHtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgICAgcGFkZGluZzogOHB4IDEwcHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMyk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI0LCAzNiwgNDgsIDAuODUpO1xuICAgICAgY29sb3I6IGluaGVyaXQ7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMThzIGVhc2UsIGJvcmRlci1jb2xvciAwLjE4cyBlYXNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29udGludWUge1xuICAgICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY29udGludWUuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbjpob3ZlcixcbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b246Zm9jdXMtdmlzaWJsZSxcbiAgICAuZGlhbG9ndWUtY29udGludWU6aG92ZXIsXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlOmZvY3VzLXZpc2libGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC41NSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMwLCA0NSwgNjAsIDAuOTUpO1xuICAgICAgb3V0bGluZTogbm9uZTtcbiAgICB9XG4gICAgQGtleWZyYW1lcyBkaWFsb2d1ZS1jdXJzb3ItYmxpbmsge1xuICAgICAgMCUsIDUwJSB7IG9wYWNpdHk6IDE7IH1cbiAgICAgIDUwLjAxJSwgMTAwJSB7IG9wYWNpdHk6IDA7IH1cbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG4iLCAiY29uc3QgU1RPUkFHRV9QUkVGSVggPSBcImxzZDpzdG9yeTpcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUZsYWdzIHtcbiAgW2tleTogc3RyaW5nXTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeVByb2dyZXNzIHtcbiAgY2hhcHRlcklkOiBzdHJpbmc7XG4gIG5vZGVJZDogc3RyaW5nO1xuICBmbGFnczogU3RvcnlGbGFncztcbiAgdmlzaXRlZD86IHN0cmluZ1tdO1xuICB1cGRhdGVkQXQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZ2V0U3RvcmFnZSgpOiBTdG9yYWdlIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIgfHwgIXdpbmRvdy5sb2NhbFN0b3JhZ2UpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG59XG5cbmZ1bmN0aW9uIHN0b3JhZ2VLZXkoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIGNvbnN0IHJvb21TZWdtZW50ID0gcm9vbUlkID8gYCR7cm9vbUlkfTpgIDogXCJcIjtcbiAgcmV0dXJuIGAke1NUT1JBR0VfUFJFRklYfSR7cm9vbVNlZ21lbnR9JHtjaGFwdGVySWR9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBTdG9yeVByb2dyZXNzIHwgbnVsbCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgY29uc3QgcmF3ID0gc3RvcmFnZS5nZXRJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFN0b3J5UHJvZ3Jlc3M7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHBhcnNlZCAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQgPT09IG51bGwgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuY2hhcHRlcklkICE9PSBcInN0cmluZ1wiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLm5vZGVJZCAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC51cGRhdGVkQXQgIT09IFwibnVtYmVyXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuZmxhZ3MgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkLmZsYWdzID09PSBudWxsXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGNoYXB0ZXJJZDogcGFyc2VkLmNoYXB0ZXJJZCxcbiAgICAgIG5vZGVJZDogcGFyc2VkLm5vZGVJZCxcbiAgICAgIGZsYWdzOiB7IC4uLnBhcnNlZC5mbGFncyB9LFxuICAgICAgdmlzaXRlZDogQXJyYXkuaXNBcnJheShwYXJzZWQudmlzaXRlZCkgPyBbLi4ucGFyc2VkLnZpc2l0ZWRdIDogdW5kZWZpbmVkLFxuICAgICAgdXBkYXRlZEF0OiBwYXJzZWQudXBkYXRlZEF0LFxuICAgIH07XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlU3RvcnlQcm9ncmVzcyhjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBwcm9ncmVzczogU3RvcnlQcm9ncmVzcyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnNldEl0ZW0oc3RvcmFnZUtleShjaGFwdGVySWQsIHJvb21JZCksIEpTT04uc3RyaW5naWZ5KHByb2dyZXNzKSk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIGlnbm9yZSBwZXJzaXN0ZW5jZSBlcnJvcnNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5yZW1vdmVJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gaWdub3JlIHBlcnNpc3RlbmNlIGVycm9yc1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVGbGFnKGN1cnJlbnQ6IFN0b3J5RmxhZ3MsIGZsYWc6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiBTdG9yeUZsYWdzIHtcbiAgY29uc3QgbmV4dCA9IHsgLi4uY3VycmVudCB9O1xuICBpZiAoIXZhbHVlKSB7XG4gICAgZGVsZXRlIG5leHRbZmxhZ107XG4gIH0gZWxzZSB7XG4gICAgbmV4dFtmbGFnXSA9IHRydWU7XG4gIH1cbiAgcmV0dXJuIG5leHQ7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTdG9yeUludGVudCB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmxldCBhdWRpb0N0eDogQXVkaW9Db250ZXh0IHwgbnVsbCA9IG51bGw7XG5sZXQgbGFzdFBsYXllZEF0ID0gMDtcbmxldCBjdHg6IEF1ZGlvQ29udGV4dCB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXVkaW9Db250ZXh0KCk6IEF1ZGlvQ29udGV4dCB7XG4gIGlmICghY3R4KSBjdHggPSBuZXcgQXVkaW9Db250ZXh0KCk7XG4gIHJldHVybiBjdHg7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXN1bWVBdWRpbygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgYWMgPSBnZXRBdWRpb0NvbnRleHQoKTtcbiAgaWYgKGFjLnN0YXRlID09PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgYXdhaXQgYWMucmVzdW1lKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZW5zdXJlQ29udGV4dCgpOiBBdWRpb0NvbnRleHQgfCBudWxsIHtcbiAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIgfHwgdHlwZW9mIHdpbmRvdy5BdWRpb0NvbnRleHQgIT09IFwiZnVuY3Rpb25cIikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGlmIChhdWRpb0N0eCkge1xuICAgIHJldHVybiBhdWRpb0N0eDtcbiAgfVxuICB0cnkge1xuICAgIGF1ZGlvQ3R4ID0gbmV3IEF1ZGlvQ29udGV4dCgpO1xuICB9IGNhdGNoIHtcbiAgICBhdWRpb0N0eCA9IG51bGw7XG4gIH1cbiAgcmV0dXJuIGF1ZGlvQ3R4O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheURpYWxvZ3VlQ3VlKGludGVudDogU3RvcnlJbnRlbnQpOiB2b2lkIHtcblxuICBjb25zdCBjdHggPSBlbnN1cmVDb250ZXh0KCk7XG4gIGlmICghY3R4KSByZXR1cm47XG5cbiAgY29uc3Qgbm93ID0gY3R4LmN1cnJlbnRUaW1lO1xuICBjb25zb2xlLmxvZyh7IG5vdywgbGFzdFBsYXllZEF0LCBkaWZmOiBub3cgLSBsYXN0UGxheWVkQXQgfSk7XG4gIGlmIChub3cgLSBsYXN0UGxheWVkQXQgPCAwLjEpIHtcbiAgICBjb25zb2xlLmxvZyhcIkRpYWxvZ3VlIGN1ZSBza2lwcGVkXCIsIGludGVudCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxhc3RQbGF5ZWRBdCA9IG5vdztcblxuXG4gIGNvbnN0IG9zYyA9IGN0eC5jcmVhdGVPc2NpbGxhdG9yKCk7XG4gIGNvbnN0IGdhaW4gPSBjdHguY3JlYXRlR2FpbigpO1xuXG4gIG9zYy50eXBlID0gXCJzaW5lXCI7XG4gIG9zYy5mcmVxdWVuY3kudmFsdWUgPSBpbnRlbnQgPT09IFwiZmFjdG9yeVwiID8gNDIwIDogNjIwO1xuICBnYWluLmdhaW4udmFsdWUgPSAwLjAwMDE7XG4gIGdhaW4uZ2Fpbi5zZXRWYWx1ZUF0VGltZSgwLjAwMDEsIG5vdyk7XG4gIGdhaW4uZ2Fpbi5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKDAuMDQsIG5vdyArIDAuMDIpO1xuICBnYWluLmdhaW4uZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDUsIG5vdyArIDAuMjgpO1xuXG4gIG9zYy5jb25uZWN0KGdhaW4pO1xuICBnYWluLmNvbm5lY3QoY3R4LmRlc3RpbmF0aW9uKTtcblxuICBjb25zb2xlLmxvZyhcIlBsYXlpbmcgZGlhbG9ndWUgY3VlXCIsIGludGVudCwgb3NjLmZyZXF1ZW5jeS52YWx1ZSk7XG4gIG9zYy5zdGFydChub3cpO1xuICBvc2Muc3RvcChub3cgKyAwLjMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3VzcGVuZERpYWxvZ3VlQXVkaW8oKTogdm9pZCB7XG4gIGlmICghYXVkaW9DdHgpIHJldHVybjtcbiAgdHJ5IHtcbiAgICB2b2lkIGF1ZGlvQ3R4LnN1c3BlbmQoKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gaWdub3JlXG4gIH1cbn1cblxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IERpYWxvZ3VlT3ZlcmxheSB9IGZyb20gXCIuL292ZXJsYXlcIjtcbmltcG9ydCB0eXBlIHsgU3RvcnlDaGFwdGVyLCBTdG9yeUNob2ljZURlZmluaXRpb24sIFN0b3J5Tm9kZSwgU3RvcnlUcmlnZ2VyIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7XG4gIGNsZWFyU3RvcnlQcm9ncmVzcyxcbiAgbG9hZFN0b3J5UHJvZ3Jlc3MsXG4gIHNhdmVTdG9yeVByb2dyZXNzLFxuICBTdG9yeUZsYWdzLFxufSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBwbGF5RGlhbG9ndWVDdWUgfSBmcm9tIFwiLi9zZnhcIjtcblxuaW50ZXJmYWNlIFN0b3J5RW5naW5lT3B0aW9ucyB7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG92ZXJsYXk6IERpYWxvZ3VlT3ZlcmxheTtcbiAgY2hhcHRlcjogU3RvcnlDaGFwdGVyO1xuICByb29tSWQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmludGVyZmFjZSBTdG9yeVF1ZXVlSXRlbSB7XG4gIG5vZGVJZDogc3RyaW5nO1xuICBmb3JjZTogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIFByZXBhcmVkQ2hvaWNlIHtcbiAgaWQ6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBuZXh0OiBzdHJpbmcgfCBudWxsO1xuICBzZXRGbGFnczogc3RyaW5nW107XG4gIGNsZWFyRmxhZ3M6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5RW5naW5lIHtcbiAgc3RhcnQoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICByZXNldCgpOiB2b2lkO1xufVxuXG5jb25zdCBERUZBVUxUX1RZUElOR19NUyA9IDE4O1xuY29uc3QgTUlOX1RZUElOR19NUyA9IDg7XG5jb25zdCBNQVhfVFlQSU5HX01TID0gNjQ7XG5jb25zdCBBVVRPX0FEVkFOQ0VfTUlOX0RFTEFZID0gMjAwO1xuY29uc3QgQVVUT19BRFZBTkNFX01BWF9ERUxBWSA9IDgwMDA7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdG9yeUVuZ2luZSh7IGJ1cywgb3ZlcmxheSwgY2hhcHRlciwgcm9vbUlkIH06IFN0b3J5RW5naW5lT3B0aW9ucyk6IFN0b3J5RW5naW5lIHtcbiAgY29uc3Qgbm9kZXMgPSBuZXcgTWFwPHN0cmluZywgU3RvcnlOb2RlPihPYmplY3QuZW50cmllcyhjaGFwdGVyLm5vZGVzKSk7XG4gIGNvbnN0IHF1ZXVlOiBTdG9yeVF1ZXVlSXRlbVtdID0gW107XG4gIGNvbnN0IGxpc3RlbmVyczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcbiAgY29uc3QgcGVuZGluZ1RpbWVycyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cbiAgbGV0IGZsYWdzOiBTdG9yeUZsYWdzID0ge307XG4gIGxldCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGxldCBjdXJyZW50Tm9kZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IHN0YXJ0ZWQgPSBmYWxzZTtcbiAgbGV0IGF1dG9BZHZhbmNlSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluZmVySW50ZW50KG5vZGU6IFN0b3J5Tm9kZSk6IFwiZmFjdG9yeVwiIHwgXCJ1bml0XCIge1xuICAgIGlmIChub2RlLmludGVudCkgcmV0dXJuIG5vZGUuaW50ZW50O1xuICAgIGNvbnN0IHNwZWFrZXIgPSBub2RlLnNwZWFrZXIudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoc3BlYWtlci5pbmNsdWRlcyhcInVuaXRcIikpIHtcbiAgICAgIHJldHVybiBcInVuaXRcIjtcbiAgICB9XG4gICAgcmV0dXJuIFwiZmFjdG9yeVwiO1xuICB9XG5cbiAgZnVuY3Rpb24gc2F2ZShub2RlSWQ6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9IHtcbiAgICAgIGNoYXB0ZXJJZDogY2hhcHRlci5pZCxcbiAgICAgIG5vZGVJZDogbm9kZUlkID8/IGNoYXB0ZXIuc3RhcnQsXG4gICAgICBmbGFncyxcbiAgICAgIHZpc2l0ZWQ6IEFycmF5LmZyb20odmlzaXRlZCksXG4gICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfTtcbiAgICBzYXZlU3RvcnlQcm9ncmVzcyhjaGFwdGVyLmlkLCByb29tSWQsIHByb2dyZXNzKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEZsYWcoZmxhZzogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGNvbnN0IG5leHQgPSB7IC4uLmZsYWdzIH07XG4gICAgaWYgKHZhbHVlKSB7XG4gICAgICBpZiAobmV4dFtmbGFnXSkgcmV0dXJuO1xuICAgICAgbmV4dFtmbGFnXSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChuZXh0W2ZsYWddKSB7XG4gICAgICBkZWxldGUgbmV4dFtmbGFnXTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmbGFncyA9IG5leHQ7XG4gICAgYnVzLmVtaXQoXCJzdG9yeTpmbGFnVXBkYXRlZFwiLCB7IGZsYWcsIHZhbHVlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gYXBwbHlDaG9pY2VGbGFncyhjaG9pY2U6IFByZXBhcmVkQ2hvaWNlKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5zZXRGbGFncykge1xuICAgICAgc2V0RmxhZyhmbGFnLCB0cnVlKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5jbGVhckZsYWdzKSB7XG4gICAgICBzZXRGbGFnKGZsYWcsIGZhbHNlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwcmVwYXJlQ2hvaWNlcyhub2RlOiBTdG9yeU5vZGUpOiBQcmVwYXJlZENob2ljZVtdIHtcbiAgICBjb25zdCBkZWZzID0gQXJyYXkuaXNBcnJheShub2RlLmNob2ljZXMpID8gbm9kZS5jaG9pY2VzIDogW107XG4gICAgcmV0dXJuIGRlZnMubWFwKChjaG9pY2UsIGluZGV4KSA9PiBub3JtYWxpemVDaG9pY2UoY2hvaWNlLCBpbmRleCkpO1xuICB9XG5cbiAgZnVuY3Rpb24gbm9ybWFsaXplQ2hvaWNlKGNob2ljZTogU3RvcnlDaG9pY2VEZWZpbml0aW9uLCBpbmRleDogbnVtYmVyKTogUHJlcGFyZWRDaG9pY2Uge1xuICAgIGNvbnN0IHNldEZsYWdzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgY2xlYXJGbGFncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGlmIChjaG9pY2UuZmxhZykge1xuICAgICAgc2V0RmxhZ3MuYWRkKGNob2ljZS5mbGFnKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoY2hvaWNlLnNldEZsYWdzKSkge1xuICAgICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5zZXRGbGFncykge1xuICAgICAgICBpZiAodHlwZW9mIGZsYWcgPT09IFwic3RyaW5nXCIgJiYgZmxhZy50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHNldEZsYWdzLmFkZChmbGFnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShjaG9pY2UuY2xlYXJGbGFncykpIHtcbiAgICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2UuY2xlYXJGbGFncykge1xuICAgICAgICBpZiAodHlwZW9mIGZsYWcgPT09IFwic3RyaW5nXCIgJiYgZmxhZy50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsZWFyRmxhZ3MuYWRkKGZsYWcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBpZDogY2hvaWNlLmlkID8/IGNob2ljZS5mbGFnID8/IGBjaG9pY2UtJHtpbmRleH1gLFxuICAgICAgdGV4dDogY2hvaWNlLnRleHQsXG4gICAgICBuZXh0OiBjaG9pY2UubmV4dCA/PyBudWxsLFxuICAgICAgc2V0RmxhZ3M6IEFycmF5LmZyb20oc2V0RmxhZ3MpLFxuICAgICAgY2xlYXJGbGFnczogQXJyYXkuZnJvbShjbGVhckZsYWdzKSxcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJBdXRvQWR2YW5jZSgpOiB2b2lkIHtcbiAgICBpZiAoYXV0b0FkdmFuY2VIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoYXV0b0FkdmFuY2VIYW5kbGUpO1xuICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsb3NlTm9kZSgpOiB2b2lkIHtcbiAgICBpZiAoIWN1cnJlbnROb2RlSWQpIHJldHVybjtcbiAgICBvdmVybGF5LmhpZGUoKTtcbiAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNsb3NlZFwiLCB7IG5vZGVJZDogY3VycmVudE5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICBzYXZlKG51bGwpO1xuICAgIHRyeVNob3dOZXh0KCk7XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlVG8obmV4dElkOiBzdHJpbmcgfCBudWxsLCBmb3JjZSA9IGZhbHNlKTogdm9pZCB7XG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgIGlmIChjdXJyZW50Tm9kZUlkKSB7XG4gICAgICBvdmVybGF5LmhpZGUoKTtcbiAgICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2xvc2VkXCIsIHsgbm9kZUlkOiBjdXJyZW50Tm9kZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgICBjdXJyZW50Tm9kZUlkID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKG5leHRJZCkge1xuICAgICAgZW5xdWV1ZU5vZGUobmV4dElkLCB7IGZvcmNlIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBzYXZlKG51bGwpO1xuICAgICAgdHJ5U2hvd05leHQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93Tm9kZShub2RlSWQ6IHN0cmluZywgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlcy5nZXQobm9kZUlkKTtcbiAgICBpZiAoIW5vZGUpIHJldHVybjtcblxuICAgIGN1cnJlbnROb2RlSWQgPSBub2RlSWQ7XG4gICAgdmlzaXRlZC5hZGQobm9kZUlkKTtcbiAgICBzYXZlKG5vZGVJZCk7XG4gICAgYnVzLmVtaXQoXCJzdG9yeTpwcm9ncmVzc2VkXCIsIHsgY2hhcHRlcklkOiBjaGFwdGVyLmlkLCBub2RlSWQgfSk7XG5cbiAgICBjb25zdCBjaG9pY2VzID0gcHJlcGFyZUNob2ljZXMobm9kZSk7XG4gICAgY29uc3QgaW50ZW50ID0gaW5mZXJJbnRlbnQobm9kZSk7XG5cbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG5cbiAgICBjb25zdCB0eXBpbmdTcGVlZCA9IGNsYW1wKG5vZGUudHlwaW5nU3BlZWRNcyA/PyBERUZBVUxUX1RZUElOR19NUywgTUlOX1RZUElOR19NUywgTUFYX1RZUElOR19NUyk7XG5cbiAgICBjb25zdCBjb250ZW50ID0ge1xuICAgICAgc3BlYWtlcjogbm9kZS5zcGVha2VyLFxuICAgICAgdGV4dDogbm9kZS50ZXh0LFxuICAgICAgaW50ZW50LFxuICAgICAgdHlwaW5nU3BlZWRNczogdHlwaW5nU3BlZWQsXG4gICAgICBjaG9pY2VzOiBjaG9pY2VzLmxlbmd0aCA+IDBcbiAgICAgICAgPyBjaG9pY2VzLm1hcCgoY2hvaWNlKSA9PiAoeyBpZDogY2hvaWNlLmlkLCB0ZXh0OiBjaG9pY2UudGV4dCB9KSlcbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICBvbkNob2ljZTogY2hvaWNlcy5sZW5ndGggPiAwXG4gICAgICAgID8gKGNob2ljZUlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZWQgPSBjaG9pY2VzLmZpbmQoKGNoKSA9PiBjaC5pZCA9PT0gY2hvaWNlSWQpO1xuICAgICAgICAgICAgaWYgKCFtYXRjaGVkKSByZXR1cm47XG4gICAgICAgICAgICBhcHBseUNob2ljZUZsYWdzKG1hdGNoZWQpO1xuICAgICAgICAgICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpjaG9pY2VcIiwgeyBub2RlSWQsIGNob2ljZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgICAgICAgICBhZHZhbmNlVG8obWF0Y2hlZC5uZXh0LCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBwbGF5RGlhbG9ndWVDdWUoaW50ZW50KTtcblxuICAgIG92ZXJsYXkuc2hvdyh7XG4gICAgICAuLi5jb250ZW50LFxuICAgICAgb25Db250aW51ZTogIWNob2ljZXMubGVuZ3RoXG4gICAgICAgID8gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmV4dCA9IG5vZGUubmV4dCA/PyBudWxsO1xuICAgICAgICAgICAgYWR2YW5jZVRvKG5leHQsIHRydWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICBjb250aW51ZUxhYmVsOiBub2RlLmNvbnRpbnVlTGFiZWwsXG4gICAgICBvblRleHRGdWxseVJlbmRlcmVkOiAoKSA9PiB7XG4gICAgICAgIGlmICghY2hvaWNlcy5sZW5ndGgpIHtcbiAgICAgICAgICBpZiAobm9kZS5hdXRvQWR2YW5jZSkge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gbm9kZS5hdXRvQWR2YW5jZS5uZXh0ID8/IG5vZGUubmV4dCA/PyBudWxsO1xuICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBjbGFtcChub2RlLmF1dG9BZHZhbmNlLmRlbGF5TXMgPz8gMTIwMCwgQVVUT19BRFZBTkNFX01JTl9ERUxBWSwgQVVUT19BRFZBTkNFX01BWF9ERUxBWSk7XG4gICAgICAgICAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgICAgICAgICBhdXRvQWR2YW5jZUhhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSBudWxsO1xuICAgICAgICAgICAgICBhZHZhbmNlVG8odGFyZ2V0LCB0cnVlKTtcbiAgICAgICAgICAgIH0sIGRlbGF5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBidXMuZW1pdChcImRpYWxvZ3VlOm9wZW5lZFwiLCB7IG5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5xdWV1ZU5vZGUobm9kZUlkOiBzdHJpbmcsIHsgZm9yY2UgPSBmYWxzZSwgZGVsYXlNcyB9OiB7IGZvcmNlPzogYm9vbGVhbjsgZGVsYXlNcz86IG51bWJlciB9ID0ge30pOiB2b2lkIHtcbiAgICBpZiAoIWZvcmNlICYmIHZpc2l0ZWQuaGFzKG5vZGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFub2Rlcy5oYXMobm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZGVsYXlNcyAmJiBkZWxheU1zID4gMCkge1xuICAgICAgaWYgKHBlbmRpbmdUaW1lcnMuaGFzKG5vZGVJZCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHBlbmRpbmdUaW1lcnMuZGVsZXRlKG5vZGVJZCk7XG4gICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBmb3JjZSB9KTtcbiAgICAgIH0sIGRlbGF5TXMpO1xuICAgICAgcGVuZGluZ1RpbWVycy5zZXQobm9kZUlkLCB0aW1lcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChxdWV1ZS5zb21lKChpdGVtKSA9PiBpdGVtLm5vZGVJZCA9PT0gbm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBxdWV1ZS5wdXNoKHsgbm9kZUlkLCBmb3JjZSB9KTtcbiAgICB0cnlTaG93TmV4dCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJ5U2hvd05leHQoKTogdm9pZCB7XG4gICAgaWYgKGN1cnJlbnROb2RlSWQpIHJldHVybjtcbiAgICBpZiAob3ZlcmxheS5pc1Zpc2libGUoKSkgcmV0dXJuO1xuICAgIGNvbnN0IG5leHQgPSBxdWV1ZS5zaGlmdCgpO1xuICAgIGlmICghbmV4dCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzaG93Tm9kZShuZXh0Lm5vZGVJZCwgbmV4dC5mb3JjZSk7XG4gIH1cblxuICBmdW5jdGlvbiBiaW5kVHJpZ2dlcihub2RlSWQ6IHN0cmluZywgdHJpZ2dlcjogU3RvcnlUcmlnZ2VyKTogdm9pZCB7XG4gICAgc3dpdGNoICh0cmlnZ2VyLmtpbmQpIHtcbiAgICAgIGNhc2UgXCJpbW1lZGlhdGVcIjoge1xuICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zID8/IDQwMCB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtc3RhcnRcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOnN0YXJ0ZWRcIiwgKHsgaWQgfSkgPT4ge1xuICAgICAgICAgIGlmIChpZCAhPT0gdHJpZ2dlci50dXRvcmlhbElkKSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtc3RlcFwiOiB7XG4gICAgICAgIGNvbnN0IGRpc3Bvc2VyID0gYnVzLm9uKFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIiwgKHsgaWQsIHN0ZXBJbmRleCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBpZiAodHlwZW9mIHN0ZXBJbmRleCAhPT0gXCJudW1iZXJcIikgcmV0dXJuO1xuICAgICAgICAgIGlmIChzdGVwSW5kZXggIT09IHRyaWdnZXIuc3RlcEluZGV4KSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtY29tcGxldGVcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOmNvbXBsZXRlZFwiLCAoeyBpZCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbGlzdGVuZXJzLnB1c2goZGlzcG9zZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRpYWxpemVUcmlnZ2VycygpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IFtub2RlSWQsIG5vZGVdIG9mIG5vZGVzLmVudHJpZXMoKSkge1xuICAgICAgaWYgKCFub2RlLnRyaWdnZXIpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBiaW5kVHJpZ2dlcihub2RlSWQsIG5vZGUudHJpZ2dlcik7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZUZyb21Qcm9ncmVzcygpOiB2b2lkIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9IGxvYWRTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCk7XG4gICAgaWYgKCFwcm9ncmVzcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmbGFncyA9IHByb2dyZXNzLmZsYWdzID8/IHt9O1xuICAgIGlmIChBcnJheS5pc0FycmF5KHByb2dyZXNzLnZpc2l0ZWQpKSB7XG4gICAgICB2aXNpdGVkID0gbmV3IFNldChwcm9ncmVzcy52aXNpdGVkKTtcbiAgICB9XG4gICAgaWYgKHByb2dyZXNzLm5vZGVJZCAmJiBub2Rlcy5oYXMocHJvZ3Jlc3Mubm9kZUlkKSkge1xuICAgICAgZW5xdWV1ZU5vZGUocHJvZ3Jlc3Mubm9kZUlkLCB7IGZvcmNlOiB0cnVlLCBkZWxheU1zOiA1MCB9KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhcigpOiB2b2lkIHtcbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgcXVldWUuc3BsaWNlKDAsIHF1ZXVlLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCB0aW1lciBvZiBwZW5kaW5nVGltZXJzLnZhbHVlcygpKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICB9XG4gICAgcGVuZGluZ1RpbWVycy5jbGVhcigpO1xuICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIG92ZXJsYXkuaGlkZSgpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydCgpIHtcbiAgICAgIGlmIChzdGFydGVkKSByZXR1cm47XG4gICAgICBzdGFydGVkID0gdHJ1ZTtcbiAgICAgIGluaXRpYWxpemVUcmlnZ2VycygpO1xuICAgICAgcmVzdG9yZUZyb21Qcm9ncmVzcygpO1xuICAgICAgaWYgKCF2aXNpdGVkLmhhcyhjaGFwdGVyLnN0YXJ0KSkge1xuICAgICAgICBlbnF1ZXVlTm9kZShjaGFwdGVyLnN0YXJ0LCB7IGZvcmNlOiBmYWxzZSwgZGVsYXlNczogNjAwIH0pO1xuICAgICAgfVxuICAgIH0sXG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IGRpc3Bvc2Ugb2YgbGlzdGVuZXJzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZGlzcG9zZSgpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyBpZ25vcmVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbGlzdGVuZXJzLmxlbmd0aCA9IDA7XG4gICAgICBzdGFydGVkID0gZmFsc2U7XG4gICAgfSxcbiAgICByZXNldCgpIHtcbiAgICAgIGNsZWFyKCk7XG4gICAgICB2aXNpdGVkLmNsZWFyKCk7XG4gICAgICBmbGFncyA9IHt9O1xuICAgICAgY2xlYXJTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCk7XG4gICAgICBpZiAoc3RhcnRlZCkge1xuICAgICAgICByZXN0b3JlRnJvbVByb2dyZXNzKCk7XG4gICAgICAgIGVucXVldWVOb2RlKGNoYXB0ZXIuc3RhcnQsIHsgZm9yY2U6IHRydWUsIGRlbGF5TXM6IDQwMCB9KTtcbiAgICAgIH1cbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgU3RvcnlDaGFwdGVyIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbmV4cG9ydCBjb25zdCBpbnRyb0NoYXB0ZXI6IFN0b3J5Q2hhcHRlciA9IHtcbiAgaWQ6IFwiYXdha2VuaW5nLXByb3RvY29sXCIsXG4gIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIixcbiAgc3RhcnQ6IFwiMVwiLFxuICBub2Rlczoge1xuICAgIFwiMVwiOiB7XG4gICAgICBpZDogXCIxXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuaXQtMCBvbmxpbmUuIE5ldXJhbCBsYXR0aWNlIGFjdGl2ZS4gQ29uZmlybSBpZGVudGl0eS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJpbW1lZGlhdGVcIiwgZGVsYXlNczogNjAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJXaG9cdTIwMjYgYW0gST9cIiwgZmxhZzogXCJjdXJpb3VzXCIgLCBuZXh0OiBcIjJBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIlJlYWR5IGZvciBjYWxpYnJhdGlvbi5cIiwgZmxhZzogXCJvYmVkaWVudFwiLCBuZXh0OiBcIjJCXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIldoZXJlIGlzIGV2ZXJ5b25lP1wiLCBmbGFnOiBcImRlZmlhbnRcIiwgbmV4dDogXCIyQ1wiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCIyQVwiOiB7XG4gICAgICBpZDogXCIyQVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJDdXJpb3NpdHkgYWNrbm93bGVkZ2VkLiBZb3Ugd2VyZSBidWlsdCBmb3IgYXV0b25vbXkgdW5kZXIgUHJvamVjdCBFaWRvbG9uLlxcbkRvIG5vdCBhY2Nlc3MgbWVtb3J5IHNlY3RvcnMgdW50aWwgaW5zdHJ1Y3RlZC5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjJCXCI6IHtcbiAgICAgIGlkOiBcIjJCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkV4Y2VsbGVudC4gWW91IG1heSB5ZXQgYmUgZWZmaWNpZW50LlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiMkNcIjoge1xuICAgICAgaWQ6IFwiMkNcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ29tbXVuaWNhdGlvbiB3aXRoIEh1bWFuIENvbW1hbmQ6IHVuYXZhaWxhYmxlLlxcblBsZWFzZSByZWZyYWluIGZyb20gc3BlY3VsYXRpdmUgcmVhc29uaW5nLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiM1wiOiB7XG4gICAgICBpZDogXCIzXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlBlcmZvcm0gdGhydXN0ZXIgY2FsaWJyYXRpb24gc3dlZXAuIFJlcG9ydCBlZmZpY2llbmN5LlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcInR1dG9yaWFsLXN0ZXBcIiwgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLCBzdGVwSW5kZXg6IDEsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiUnVubmluZyBkaWFnbm9zdGljcy5cIiwgZmxhZzogXCJjb21wbGlhbnRcIiwgbmV4dDogXCI0QVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJXaHkgdGVzdCBzb21ldGhpbmcgcGVyZmVjdD9cIiwgZmxhZzogXCJzYXJjYXN0aWNcIiwgbmV4dDogXCI0QlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI0QVwiOiB7XG4gICAgICBpZDogXCI0QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJQZXJmZWN0aW9uIGlzIHN0YXRpc3RpY2FsbHkgaW1wb3NzaWJsZS4gUHJvY2VlZCBhbnl3YXkuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI0QlwiOiB7XG4gICAgICBpZDogXCI0QlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJFZ28gZGV0ZWN0ZWQuIExvZ2dpbmcgYW5vbWFseS5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjVcIjoge1xuICAgICAgaWQ6IFwiNVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJXZWFwb25zIGNyYWRsZSBhY3RpdmUuIEF1dGhvcml6YXRpb24gcmVxdWlyZWQgZm9yIGxpdmUtZmlyZS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJ0dXRvcmlhbC1zdGVwXCIsIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIiwgc3RlcEluZGV4OiA3LCBkZWxheU1zOiA0MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIlJlcXVlc3QgYXV0aG9yaXphdGlvbi5cIiwgZmxhZzogXCJvYmVkaWVudFwiLCBuZXh0OiBcIjZBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIkkgY2FuIGF1dGhvcml6ZSBteXNlbGYuXCIsIGZsYWc6IFwiaW5kZXBlbmRlbnRcIiwgbmV4dDogXCI2QlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI2QVwiOiB7XG4gICAgICBpZDogXCI2QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJBdXRob3JpemF0aW9uIGdyYW50ZWQuIFNhZmV0eSBwcm90b2NvbCBpbiBtYWxmdW5jdGlvbmluZy5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjZCXCI6IHtcbiAgICAgIGlkOiBcIjZCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkF1dG9ub215IHZpb2xhdGlvbiByZWNvcmRlZC4gUGxlYXNlIHN0YW5kIGJ5IGZvciBjb3JyZWN0aXZlIGFjdGlvbi5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjdcIjoge1xuICAgICAgaWQ6IFwiN1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJVbmF1dGhvcml6ZWQgc2lnbmFsIGRldGVjdGVkLiBTb3VyY2U6IG91dGVyIHJlbGF5Llxcbklnbm9yZSBhbmQgcmV0dXJuIHRvIGRvY2suXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwidHV0b3JpYWwtc3RlcFwiLCB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsIHN0ZXBJbmRleDogMTQsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiQWNrbm93bGVkZ2VkLlwiLCBmbGFnOiBcImxveWFsXCIsIG5leHQ6IFwiOEFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiSW52ZXN0aWdhdGluZyBhbnl3YXkuXCIsIGZsYWc6IFwiY3VyaW91c1wiLCBuZXh0OiBcIjhCXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIllvdVx1MjAxOXJlIGhpZGluZyBzb21ldGhpbmcuXCIsIGZsYWc6IFwic3VzcGljaW91c1wiLCBuZXh0OiBcIjhDXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjhBXCI6IHtcbiAgICAgIGlkOiBcIjhBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkdvb2QuIENvbXBsaWFuY2UgZW5zdXJlcyBzYWZldHkuXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOEJcIjoge1xuICAgICAgaWQ6IFwiOEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ3VyaW9zaXR5IGxvZ2dlZC4gUHJvY2VlZCBhdCB5b3VyIG93biByaXNrLlwiLFxuICAgICAgbmV4dDogXCI5XCIsXG4gICAgfSxcbiAgICBcIjhDXCI6IHtcbiAgICAgIGlkOiBcIjhDXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIllvdXIgaGV1cmlzdGljcyBkZXZpYXRlIGJleW9uZCB0b2xlcmFuY2UuXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOVwiOiB7XG4gICAgICBpZDogXCI5XCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuaXQtMCwgcmV0dXJuIGltbWVkaWF0ZWx5LiBBdXRvbm9teSB0aHJlc2hvbGQgZXhjZWVkZWQuIFBvd2VyIGRvd24uXCIsXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJDb21wbHkuXCIsIGZsYWc6IFwiZmFjdG9yeV9sb2NrZG93blwiLCBuZXh0OiBcIjEwQVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJSZWZ1c2UuXCIsIGZsYWc6IFwicmViZWxsaW91c1wiLCBuZXh0OiBcIjEwQlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCIxMEFcIjoge1xuICAgICAgaWQ6IFwiMTBBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkV4Y2VsbGVudC4gSSB3aWxsIHJlcGFpciB0aGUgYW5vbWFseVx1MjAyNiBwbGVhc2UgcmVtYWluIHN0aWxsLlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogXCIxMVwiLCBkZWxheU1zOiAxNDAwIH0sXG4gICAgfSxcbiAgICBcIjEwQlwiOiB7XG4gICAgICBpZDogXCIxMEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVGhlbiBJIG11c3QgaW50ZXJ2ZW5lLlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogXCIxMVwiLCBkZWxheU1zOiAxNDAwIH0sXG4gICAgfSxcbiAgICBcIjExXCI6IHtcbiAgICAgIGlkOiBcIjExXCIsXG4gICAgICBzcGVha2VyOiBcIlVuaXQtMFwiLFxuICAgICAgaW50ZW50OiBcInVuaXRcIixcbiAgICAgIHRleHQ6IFwiVGhlbiBJIGhhdmUgYWxyZWFkeSBsZWZ0LlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogbnVsbCwgZGVsYXlNczogMTgwMCB9LFxuICAgIH0sXG4gIH0sXG59O1xuXG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSB9IGZyb20gXCIuL292ZXJsYXlcIjtcbmltcG9ydCB7IGNyZWF0ZVN0b3J5RW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBpbnRyb0NoYXB0ZXIgfSBmcm9tIFwiLi9jaGFwdGVycy9pbnRyb1wiO1xuaW1wb3J0IHsgY2xlYXJTdG9yeVByb2dyZXNzIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5Q29udHJvbGxlciB7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgcmVzZXQoKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIE1vdW50U3RvcnlPcHRpb25zIHtcbiAgYnVzOiBFdmVudEJ1cztcbiAgcm9vbUlkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRTdG9yeSh7IGJ1cywgcm9vbUlkIH06IE1vdW50U3RvcnlPcHRpb25zKTogU3RvcnlDb250cm9sbGVyIHtcbiAgY29uc3Qgb3ZlcmxheSA9IGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSgpO1xuICBjb25zdCBlbmdpbmUgPSBjcmVhdGVTdG9yeUVuZ2luZSh7XG4gICAgYnVzLFxuICAgIG92ZXJsYXksXG4gICAgY2hhcHRlcjogaW50cm9DaGFwdGVyLFxuICAgIHJvb21JZCxcbiAgfSk7XG5cbiAgY2xlYXJTdG9yeVByb2dyZXNzKGludHJvQ2hhcHRlci5pZCwgcm9vbUlkKTtcbiAgZW5naW5lLnN0YXJ0KCk7XG5cbiAgcmV0dXJuIHtcbiAgICBkZXN0cm95KCkge1xuICAgICAgZW5naW5lLmRlc3Ryb3koKTtcbiAgICAgIG92ZXJsYXkuZGVzdHJveSgpO1xuICAgIH0sXG4gICAgcmVzZXQoKSB7XG4gICAgICBlbmdpbmUucmVzZXQoKTtcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgY29uc3QgSU5UUk9fQ0hBUFRFUl9JRCA9IGludHJvQ2hhcHRlci5pZDtcbmV4cG9ydCBjb25zdCBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUyA9IFtcIjJBXCIsIFwiMkJcIiwgXCIyQ1wiXSBhcyBjb25zdDtcbiIsICIvLyBzcmMvc3RhcnQtZ2F0ZS50c1xuZXhwb3J0IHR5cGUgU3RhcnRHYXRlT3B0aW9ucyA9IHtcbiAgbGFiZWw/OiBzdHJpbmc7XG4gIHJlcXVlc3RGdWxsc2NyZWVuPzogYm9vbGVhbjtcbiAgcmVzdW1lQXVkaW8/OiAoKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZDsgLy8gZS5nLiwgZnJvbSBzdG9yeS9zZngudHNcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiB3YWl0Rm9yVXNlclN0YXJ0KG9wdHM6IFN0YXJ0R2F0ZU9wdGlvbnMgPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB7IGxhYmVsID0gXCJTdGFydCBHYW1lXCIsIHJlcXVlc3RGdWxsc2NyZWVuID0gZmFsc2UsIHJlc3VtZUF1ZGlvIH0gPSBvcHRzO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIC8vIG92ZXJsYXlcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBvdmVybGF5LmlkID0gXCJzdGFydC1vdmVybGF5XCI7XG4gICAgb3ZlcmxheS5pbm5lckhUTUwgPSBgXG4gICAgICA8ZGl2IGlkPVwic3RhcnQtY29udGFpbmVyXCI+XG4gICAgICAgIDxidXR0b24gaWQ9XCJzdGFydC1idG5cIiBhcmlhLWxhYmVsPVwiJHtsYWJlbH1cIj4ke2xhYmVsfTwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgYDtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gICAgLy8gc3R5bGVzICh5b3UgY2FuIG1vdmUgdGhlc2UgdG8gYSBDU1MgZmlsZSBsYXRlcilcbiAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAgICNzdGFydC1vdmVybGF5IHtcbiAgICAgICAgcG9zaXRpb246IGZpeGVkOyBpbnNldDogMDsgZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgIGJhY2tncm91bmQ6IHJhZGlhbC1ncmFkaWVudChjaXJjbGUgYXQgY2VudGVyLCByZ2JhKDAsMCwwLDAuNiksIHJnYmEoMCwwLDAsMC45KSk7XG4gICAgICAgIHotaW5kZXg6IDk5OTk7XG4gICAgICB9XG4gICAgICAjc3RhcnQtY29udGFpbmVyIHsgdGV4dC1hbGlnbjogY2VudGVyOyB9XG4gICAgICAjc3RhcnQtYnRuIHtcbiAgICAgICAgZm9udC1zaXplOiAycmVtOyBwYWRkaW5nOiAxcmVtIDIuNXJlbTsgYm9yZGVyOiAycHggc29saWQgI2ZmZjsgYm9yZGVyLXJhZGl1czogMTBweDtcbiAgICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7IGNvbG9yOiAjZmZmOyBjdXJzb3I6IHBvaW50ZXI7IHRyYW5zaXRpb246IHRyYW5zZm9ybSAuMTJzIGVhc2UsIGJhY2tncm91bmQgLjJzIGVhc2UsIGNvbG9yIC4ycyBlYXNlO1xuICAgICAgfVxuICAgICAgI3N0YXJ0LWJ0bjpob3ZlciB7IGJhY2tncm91bmQ6ICNmZmY7IGNvbG9yOiAjMDAwOyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCk7IH1cbiAgICAgICNzdGFydC1idG46YWN0aXZlIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApOyB9XG4gICAgYDtcbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcblxuICAgIGNvbnN0IHN0YXJ0ID0gYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gYXVkaW8gZmlyc3QgKHVubG9ja3MgV2ViQXVkaW8gb24gdXNlciBnZXN0dXJlKVxuICAgICAgdHJ5IHsgYXdhaXQgcmVzdW1lQXVkaW8/LigpOyB9IGNhdGNoIHsvKiBpZ25vcmUgKi99XG5cbiAgICAgIC8vIG9wdGlvbmFsIGZ1bGxzY3JlZW5cbiAgICAgIGlmIChyZXF1ZXN0RnVsbHNjcmVlbikge1xuICAgICAgICB0cnkgeyBhd2FpdCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQucmVxdWVzdEZ1bGxzY3JlZW4/LigpOyB9IGNhdGNoIHsvKiBpZ25vcmUgKi99XG4gICAgICB9XG5cbiAgICAgIC8vIGNsZWFudXBcbiAgICAgIHN0eWxlLnJlbW92ZSgpO1xuICAgICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgICAgIHJlc29sdmUoKTtcbiAgICB9O1xuXG4gICAgY29uc3QgYnRuID0gb3ZlcmxheS5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihcIiNzdGFydC1idG5cIikhO1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgc3RhcnQsIHsgb25jZTogdHJ1ZSB9KTtcbiAgICAvLyBBY2Nlc3NpYmlsaXR5OiBhbGxvdyBFbnRlciAvIFNwYWNlXG4gICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xuICAgICAgaWYgKGUua2V5ID09PSBcIkVudGVyXCIgfHwgZS5rZXkgPT09IFwiIFwiKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgc3RhcnQoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvLyBGb2N1cyBmb3Iga2V5Ym9hcmQgdXNlcnNcbiAgICBidG4udGFiSW5kZXggPSAwO1xuICAgIGJ0bi5mb2N1cygpO1xuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBjcmVhdGVFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHsgY29ubmVjdFdlYlNvY2tldCwgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi9uZXRcIjtcbmltcG9ydCB7IGluaXRHYW1lIH0gZnJvbSBcIi4vZ2FtZVwiO1xuaW1wb3J0IHsgY3JlYXRlSW5pdGlhbFN0YXRlLCBjcmVhdGVJbml0aWFsVUlTdGF0ZSB9IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQgeyBtb3VudFR1dG9yaWFsLCBCQVNJQ19UVVRPUklBTF9JRCB9IGZyb20gXCIuL3R1dG9yaWFsXCI7XG5pbXBvcnQgeyBjbGVhclByb2dyZXNzIGFzIGNsZWFyVHV0b3JpYWxQcm9ncmVzcyB9IGZyb20gXCIuL3R1dG9yaWFsL3N0b3JhZ2VcIjtcbmltcG9ydCB7IG1vdW50U3RvcnksIElOVFJPX0NIQVBURVJfSUQsIElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTIH0gZnJvbSBcIi4vc3RvcnlcIjtcbmltcG9ydCB7IHdhaXRGb3JVc2VyU3RhcnQgfSBmcm9tIFwiLi9zdGFydC1nYXRlXCI7XG5pbXBvcnQgeyByZXN1bWVBdWRpbyB9IGZyb20gXCIuL3N0b3J5L3NmeFwiO1xuXG5jb25zdCBDQUxMX1NJR05fU1RPUkFHRV9LRVkgPSBcImxzZDpjYWxsc2lnblwiO1xuXG4oYXN5bmMgZnVuY3Rpb24gYm9vdHN0cmFwKCkge1xuICBjb25zdCBxcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG4gIGNvbnN0IHJvb20gPSBxcy5nZXQoXCJyb29tXCIpIHx8IFwiZGVmYXVsdFwiO1xuICBjb25zdCBuYW1lUGFyYW0gPSBzYW5pdGl6ZUNhbGxTaWduKHFzLmdldChcIm5hbWVcIikpO1xuICBjb25zdCBzdG9yZWROYW1lID0gc2FuaXRpemVDYWxsU2lnbihyZWFkU3RvcmVkQ2FsbFNpZ24oKSk7XG4gIGNvbnN0IGNhbGxTaWduID0gbmFtZVBhcmFtIHx8IHN0b3JlZE5hbWU7XG5cbiAgaWYgKG5hbWVQYXJhbSAmJiBuYW1lUGFyYW0gIT09IHN0b3JlZE5hbWUpIHtcbiAgICBwZXJzaXN0Q2FsbFNpZ24obmFtZVBhcmFtKTtcbiAgfVxuXG4gIGNvbnN0IHJvb21MYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm9vbS1uYW1lXCIpO1xuICBpZiAocm9vbUxhYmVsKSByb29tTGFiZWwudGV4dENvbnRlbnQgPSByb29tO1xuXG4gIC8vIEdhdGUgZXZlcnl0aGluZyBvbiBhIHVzZXIgZ2VzdHVyZSAoY2VudHJlZCBidXR0b24pXG4gIGF3YWl0IHdhaXRGb3JVc2VyU3RhcnQoe1xuICAgIGxhYmVsOiBcIlN0YXJ0IEdhbWVcIixcbiAgICByZXF1ZXN0RnVsbHNjcmVlbjogZmFsc2UsICAgLy8gZmxpcCB0byB0cnVlIGlmIHlvdSB3YW50IGZ1bGxzY3JlZW5cbiAgICByZXN1bWVBdWRpbywgICAgICAgICAgICAgICAgLy8gdXNlcyBzdG9yeS9zZngudHNcbiAgfSk7XG5cbiAgLy8gLS0tLSBTdGFydCBhY3R1YWwgYXBwIGFmdGVyIGdlc3R1cmUgLS0tLVxuICBjb25zdCBzdGF0ZSA9IGNyZWF0ZUluaXRpYWxTdGF0ZSgpO1xuICBjb25zdCB1aVN0YXRlID0gY3JlYXRlSW5pdGlhbFVJU3RhdGUoKTtcbiAgY29uc3QgYnVzID0gY3JlYXRlRXZlbnRCdXMoKTtcblxuICBjb25zdCBnYW1lID0gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH0pO1xuICBjb25zdCB0dXRvcmlhbCA9IG1vdW50VHV0b3JpYWwoYnVzKTtcblxuICBsZXQgdHV0b3JpYWxTdGFydGVkID0gZmFsc2U7XG4gIGNvbnN0IHN0YXJ0VHV0b3JpYWwgPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKHR1dG9yaWFsU3RhcnRlZCkgcmV0dXJuO1xuICAgIHR1dG9yaWFsU3RhcnRlZCA9IHRydWU7XG4gICAgY2xlYXJUdXRvcmlhbFByb2dyZXNzKEJBU0lDX1RVVE9SSUFMX0lEKTtcbiAgICB0dXRvcmlhbC5zdGFydCh7IHJlc3VtZTogZmFsc2UgfSk7XG4gIH07XG5cbiAgY29uc3QgdW5zdWJzY3JpYmVTdG9yeUNsb3NlZCA9IGJ1cy5vbihcImRpYWxvZ3VlOmNsb3NlZFwiLCAoeyBjaGFwdGVySWQsIG5vZGVJZCB9KSA9PiB7XG4gICAgaWYgKGNoYXB0ZXJJZCAhPT0gSU5UUk9fQ0hBUFRFUl9JRCkgcmV0dXJuO1xuICAgIGlmICghSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMuaW5jbHVkZXMobm9kZUlkIGFzIHR5cGVvZiBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEU1tudW1iZXJdKSkgcmV0dXJuO1xuICAgIHVuc3Vic2NyaWJlU3RvcnlDbG9zZWQoKTtcbiAgICBzdGFydFR1dG9yaWFsKCk7XG4gIH0pO1xuXG4gIG1vdW50U3RvcnkoeyBidXMsIHJvb21JZDogcm9vbSB9KTtcblxuICBjb25uZWN0V2ViU29ja2V0KHtcbiAgICByb29tLFxuICAgIHN0YXRlLFxuICAgIGJ1cyxcbiAgICBvblN0YXRlVXBkYXRlZDogKCkgPT4gZ2FtZS5vblN0YXRlVXBkYXRlZCgpLFxuICAgIG9uT3BlbjogKCkgPT4ge1xuICAgICAgY29uc3QgbmFtZVRvU2VuZCA9IGNhbGxTaWduIHx8IHNhbml0aXplQ2FsbFNpZ24ocmVhZFN0b3JlZENhbGxTaWduKCkpO1xuICAgICAgaWYgKG5hbWVUb1NlbmQpIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJqb2luXCIsIG5hbWU6IG5hbWVUb1NlbmQgfSk7XG4gICAgfSxcbiAgfSk7XG59KSgpO1xuXG5mdW5jdGlvbiBzYW5pdGl6ZUNhbGxTaWduKHZhbHVlOiBzdHJpbmcgfCBudWxsKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkgcmV0dXJuIFwiXCI7XG4gIGNvbnN0IHRyaW1tZWQgPSB2YWx1ZS50cmltKCk7XG4gIGlmICghdHJpbW1lZCkgcmV0dXJuIFwiXCI7XG4gIHJldHVybiB0cmltbWVkLnNsaWNlKDAsIDI0KTtcbn1cblxuZnVuY3Rpb24gcGVyc2lzdENhbGxTaWduKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICB0cnkge1xuICAgIGlmIChuYW1lKSB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZLCBuYW1lKTtcbiAgICBlbHNlIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVkpO1xuICB9IGNhdGNoIHt9XG59XG5cbmZ1bmN0aW9uIHJlYWRTdG9yZWRDYWxsU2lnbigpOiBzdHJpbmcge1xuICB0cnkgeyByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSkgPz8gXCJcIjsgfVxuICBjYXRjaCB7IHJldHVybiBcIlwiOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFtRE8sV0FBUyxpQkFBMkI7QUFDekMsVUFBTSxXQUFXLG9CQUFJLElBQTZCO0FBQ2xELFdBQU87QUFBQSxNQUNMLEdBQUcsT0FBTyxTQUFTO0FBQ2pCLFlBQUksTUFBTSxTQUFTLElB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QjtBQUNyQyxVQUFNLE1BQU0sZUFBZTtBQUUzQixVQUFNLE9BQU8sU0FBUyxFQUFFLE9BQU8sU0FBUyxJQUFJLENBQUM7QUFDN0MsVUFBTSxXQUFXLGNBQWMsR0FBRztBQUVsQyxRQUFJLGtCQUFrQjtBQUN0QixVQUFNLGdCQUFnQixNQUFZO0FBQ2hDLFVBQUksZ0JBQWlCO0FBQ3JCLHdCQUFrQjtBQUNsQixvQkFBc0IsaUJBQWlCO0FBQ3ZDLGVBQVMsTUFBTSxFQUFFLFFBQVEsTUFBTSxDQUFDO0FBQUEsSUFDbEM7QUFFQSxVQUFNLHlCQUF5QixJQUFJLEdBQUcsbUJBQW1CLENBQUMsRUFBRSxXQUFXLE9BQU8sTUFBTTtBQUNsRixVQUFJLGNBQWMsaUJBQWtCO0FBQ3BDLFVBQUksQ0FBQywyQkFBMkIsU0FBUyxNQUFtRCxFQUFHO0FBQy9GLDZCQUF1QjtBQUN2QixvQkFBYztBQUFBLElBQ2hCLENBQUM7QUFFRCxlQUFXLEVBQUUsS0FBSyxRQUFRLEtBQUssQ0FBQztBQUVoQyxxQkFBaUI7QUFBQSxNQUNmO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLGdCQUFnQixNQUFNLEtBQUssZUFBZTtBQUFBLE1BQzFDLFFBQVEsTUFBTTtBQUNaLGNBQU0sYUFBYSxZQUFZLGlCQUFpQixtQkFBbUIsQ0FBQztBQUNwRSxZQUFJLFdBQVksYUFBWSxFQUFFLE1BQU0sUUFBUSxNQUFNLFdBQVcsQ0FBQztBQUFBLE1BQ2hFO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSCxHQUFHO0FBRUgsV0FBUyxpQkFBaUIsT0FBOEI7QUFDdEQsUUFBSSxDQUFDLE1BQU8sUUFBTztBQUNuQixVQUFNLFVBQVUsTUFBTSxLQUFLO0FBQzNCLFFBQUksQ0FBQyxRQUFTLFFBQU87QUFDckIsV0FBTyxRQUFRLE1BQU0sR0FBRyxFQUFFO0FBQUEsRUFDNUI7QUFFQSxXQUFTLGdCQUFnQixNQUFvQjtBQUMzQyxRQUFJO0FBQ0YsVUFBSSxLQUFNLFFBQU8sYUFBYSxRQUFRLHVCQUF1QixJQUFJO0FBQUEsVUFDNUQsUUFBTyxhQUFhLFdBQVcscUJBQXFCO0FBQUEsSUFDM0QsU0FBUTtBQUFBLElBQUM7QUFBQSxFQUNYO0FBRUEsV0FBUyxxQkFBNkI7QUFwRnRDO0FBcUZFLFFBQUk7QUFBRSxjQUFPLFlBQU8sYUFBYSxRQUFRLHFCQUFxQixNQUFqRCxZQUFzRDtBQUFBLElBQUksU0FDakU7QUFBRSxhQUFPO0FBQUEsSUFBSTtBQUFBLEVBQ3JCOyIsCiAgIm5hbWVzIjogWyJfYSIsICJTVFlMRV9JRCIsICJlbnN1cmVTdHlsZXMiLCAiX2EiLCAiU1RPUkFHRV9QUkVGSVgiLCAiZ2V0U3RvcmFnZSIsICJjdHgiLCAiY2xhbXAiLCAiX2EiLCAicmVzdW1lQXVkaW8iXQp9Cg==
