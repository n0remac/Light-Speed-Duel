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
  function connectWebSocket({ room, state, bus, onStateUpdated }) {
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    ws = new WebSocket(`${protocol}${window.location.host}/ws?room=${encodeURIComponent(room)}`);
    ws.addEventListener("open", () => console.log("[ws] open"));
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
    });
    shipClearBtn == null ? void 0 : shipClearBtn.addEventListener("click", () => {
      setInputContext("ship");
      clearShipRoute();
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
    if (uiStateRef.missileTool === tool) {
      setInputContext("missile");
      return;
    }
    uiStateRef.missileTool = tool;
    setInputContext("missile");
    if (tool === "set") {
      setMissileSelection(null);
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

  // web/src/main.ts
  (function bootstrap() {
    const qs = new URLSearchParams(window.location.search);
    const room = qs.get("room") || "default";
    const roomLabel = document.getElementById("room-name");
    if (roomLabel) {
      roomLabel.textContent = room;
    }
    const state = createInitialState();
    const uiState = createInitialUIState();
    const bus = createEventBus();
    const game = initGame({ state, uiState, bus });
    connectWebSocket({
      room,
      state,
      bus,
      onStateUpdated: () => {
        game.onStateUpdated();
      }
    });
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvZ2FtZS50cyIsICJzcmMvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IHR5cGUgU2hpcENvbnRleHQgPSBcInNoaXBcIiB8IFwibWlzc2lsZVwiO1xuZXhwb3J0IHR5cGUgU2hpcFRvb2wgPSBcInNldFwiIHwgXCJzZWxlY3RcIjtcbmV4cG9ydCB0eXBlIE1pc3NpbGVUb29sID0gXCJzZXRcIiB8IFwic2VsZWN0XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnRNYXAge1xuICBcImNvbnRleHQ6Y2hhbmdlZFwiOiB7IGNvbnRleHQ6IFNoaXBDb250ZXh0IH07XG4gIFwic2hpcDp0b29sQ2hhbmdlZFwiOiB7IHRvb2w6IFNoaXBUb29sIH07XG4gIFwic2hpcDp3YXlwb2ludEFkZGVkXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcInNoaXA6d2F5cG9pbnREZWxldGVkXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcInNoaXA6d2F5cG9pbnRzQ2xlYXJlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6bGF1bmNoZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiOiB7IHNlY29uZHNSZW1haW5pbmc6IG51bWJlciB9O1xuICBcImhlbHA6dmlzaWJsZUNoYW5nZWRcIjogeyB2aXNpYmxlOiBib29sZWFuIH07XG4gIFwic3RhdGU6dXBkYXRlZFwiOiB2b2lkO1xufVxuXG5leHBvcnQgdHlwZSBFdmVudEtleSA9IGtleW9mIEV2ZW50TWFwO1xuZXhwb3J0IHR5cGUgRXZlbnRQYXlsb2FkPEsgZXh0ZW5kcyBFdmVudEtleT4gPSBFdmVudE1hcFtLXTtcbmV4cG9ydCB0eXBlIEhhbmRsZXI8SyBleHRlbmRzIEV2ZW50S2V5PiA9IChwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pID0+IHZvaWQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnRCdXMge1xuICBvbjxLIGV4dGVuZHMgRXZlbnRLZXk+KGV2ZW50OiBLLCBoYW5kbGVyOiBIYW5kbGVyPEs+KTogKCkgPT4gdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgRXZlbnRLZXk+KGV2ZW50OiBLLCBwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pOiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBFdmVudEtleT4oZXZlbnQ6IEspOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXZlbnRCdXMoKTogRXZlbnRCdXMge1xuICBjb25zdCBoYW5kbGVycyA9IG5ldyBNYXA8RXZlbnRLZXksIFNldDxGdW5jdGlvbj4+KCk7XG4gIHJldHVybiB7XG4gICAgb24oZXZlbnQsIGhhbmRsZXIpIHtcbiAgICAgIGxldCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQpIHtcbiAgICAgICAgc2V0ID0gbmV3IFNldCgpO1xuICAgICAgICBoYW5kbGVycy5zZXQoZXZlbnQsIHNldCk7XG4gICAgICB9XG4gICAgICBzZXQuYWRkKGhhbmRsZXIpO1xuICAgICAgcmV0dXJuICgpID0+IHNldD8uZGVsZXRlKGhhbmRsZXIpO1xuICAgIH0sXG4gICAgZW1pdChldmVudDogRXZlbnRLZXksIHBheWxvYWQ/OiB1bmtub3duKSB7XG4gICAgICBjb25zdCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQgfHwgc2V0LnNpemUgPT09IDApIHJldHVybjtcbiAgICAgIGZvciAoY29uc3QgZm4gb2Ygc2V0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgKGZuIGFzICh2YWx1ZT86IHVua25vd24pID0+IHZvaWQpKHBheWxvYWQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBbYnVzXSBoYW5kbGVyIGZvciAke2V2ZW50fSBmYWlsZWRgLCBlcnIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNoaXBDb250ZXh0LCBTaGlwVG9vbCwgTWlzc2lsZVRvb2wgfSBmcm9tIFwiLi9idXNcIjtcblxuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX1NQRUVEID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfU1BFRUQgPSAyNTA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fQUdSTyA9IDEwMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9MSUZFVElNRSA9IDEyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9MSUZFVElNRSA9IDIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSA9IDgwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiA9IDIwMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUxpbWl0cyB7XG4gIHNwZWVkTWluOiBudW1iZXI7XG4gIHNwZWVkTWF4OiBudW1iZXI7XG4gIGFncm9NaW46IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNoaXBTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBocD86IG51bWJlcjtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdob3N0U25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlU25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgc2VsZj86IGJvb2xlYW47XG4gIGFncm9fcmFkaXVzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVJvdXRlIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICB3YXlwb2ludHM6IE1pc3NpbGVXYXlwb2ludFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVDb25maWcge1xuICBzcGVlZDogbnVtYmVyO1xuICBhZ3JvUmFkaXVzOiBudW1iZXI7XG4gIGxpZmV0aW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNZXRhIHtcbiAgYz86IG51bWJlcjtcbiAgdz86IG51bWJlcjtcbiAgaD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBTdGF0ZSB7XG4gIG5vdzogbnVtYmVyO1xuICBub3dTeW5jZWRBdDogbnVtYmVyO1xuICBtZTogU2hpcFNuYXBzaG90IHwgbnVsbDtcbiAgZ2hvc3RzOiBHaG9zdFNuYXBzaG90W107XG4gIG1pc3NpbGVzOiBNaXNzaWxlU25hcHNob3RbXTtcbiAgbWlzc2lsZVJvdXRlczogTWlzc2lsZVJvdXRlW107XG4gIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBzdHJpbmcgfCBudWxsO1xuICBuZXh0TWlzc2lsZVJlYWR5QXQ6IG51bWJlcjtcbiAgbWlzc2lsZUNvbmZpZzogTWlzc2lsZUNvbmZpZztcbiAgbWlzc2lsZUxpbWl0czogTWlzc2lsZUxpbWl0cztcbiAgd29ybGRNZXRhOiBXb3JsZE1ldGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VsZWN0aW9uIHtcbiAgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjtcbiAgaW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlU2VsZWN0aW9uIHtcbiAgdHlwZTogXCJ3YXlwb2ludFwiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVJU3RhdGUge1xuICBpbnB1dENvbnRleHQ6IFNoaXBDb250ZXh0O1xuICBzaGlwVG9vbDogU2hpcFRvb2w7XG4gIG1pc3NpbGVUb29sOiBNaXNzaWxlVG9vbDtcbiAgc2hvd1NoaXBSb3V0ZTogYm9vbGVhbjtcbiAgaGVscFZpc2libGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpOiBVSVN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpbnB1dENvbnRleHQ6IFwic2hpcFwiLFxuICAgIHNoaXBUb29sOiBcInNldFwiLFxuICAgIG1pc3NpbGVUb29sOiBcInNldFwiLFxuICAgIHNob3dTaGlwUm91dGU6IHRydWUsXG4gICAgaGVscFZpc2libGU6IGZhbHNlLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFN0YXRlKGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogQXBwU3RhdGUge1xuICByZXR1cm4ge1xuICAgIG5vdzogMCxcbiAgICBub3dTeW5jZWRBdDogdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgPyBwZXJmb3JtYW5jZS5ub3coKVxuICAgICAgOiBEYXRlLm5vdygpLFxuICAgIG1lOiBudWxsLFxuICAgIGdob3N0czogW10sXG4gICAgbWlzc2lsZXM6IFtdLFxuICAgIG1pc3NpbGVSb3V0ZXM6IFtdLFxuICAgIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBudWxsLFxuICAgIG5leHRNaXNzaWxlUmVhZHlBdDogMCxcbiAgICBtaXNzaWxlQ29uZmlnOiB7XG4gICAgICBzcGVlZDogMTgwLFxuICAgICAgYWdyb1JhZGl1czogODAwLFxuICAgICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcigxODAsIDgwMCwgbGltaXRzKSxcbiAgICB9LFxuICAgIG1pc3NpbGVMaW1pdHM6IGxpbWl0cyxcbiAgICB3b3JsZE1ldGE6IHt9LFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXAodmFsdWU6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWlzc2lsZUxpZmV0aW1lRm9yKHNwZWVkOiBudW1iZXIsIGFncm9SYWRpdXM6IG51bWJlciwgbGltaXRzOiBNaXNzaWxlTGltaXRzID0ge1xuICBzcGVlZE1pbjogTUlTU0lMRV9NSU5fU1BFRUQsXG4gIHNwZWVkTWF4OiBNSVNTSUxFX01BWF9TUEVFRCxcbiAgYWdyb01pbjogTUlTU0lMRV9NSU5fQUdSTyxcbn0pOiBudW1iZXIge1xuICBjb25zdCBtaW5TcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluIDogTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXggOiBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgbWluQWdybyA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiA6IE1JU1NJTEVfTUlOX0FHUk87XG4gIGNvbnN0IHNwYW4gPSBtYXhTcGVlZCAtIG1pblNwZWVkO1xuICBjb25zdCBzcGVlZE5vcm0gPSBzcGFuID4gMCA/IGNsYW1wKChzcGVlZCAtIG1pblNwZWVkKSAvIHNwYW4sIDAsIDEpIDogMDtcbiAgY29uc3QgYWRqdXN0ZWRBZ3JvID0gTWF0aC5tYXgoMCwgYWdyb1JhZGl1cyAtIG1pbkFncm8pO1xuICBjb25zdCBhZ3JvTm9ybSA9IGNsYW1wKGFkanVzdGVkQWdybyAvIE1JU1NJTEVfTElGRVRJTUVfQUdST19SRUYsIDAsIDEpO1xuICBjb25zdCByZWR1Y3Rpb24gPSBzcGVlZE5vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX1NQRUVEX1BFTkFMVFkgKyBhZ3JvTm9ybSAqIE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZO1xuICBjb25zdCBiYXNlID0gTUlTU0lMRV9NQVhfTElGRVRJTUU7XG4gIHJldHVybiBjbGFtcChiYXNlIC0gcmVkdWN0aW9uLCBNSVNTSUxFX01JTl9MSUZFVElNRSwgTUlTU0lMRV9NQVhfTElGRVRJTUUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVNaXNzaWxlQ29uZmlnKFxuICBjZmc6IFBhcnRpYWw8UGljazxNaXNzaWxlQ29uZmlnLCBcInNwZWVkXCIgfCBcImFncm9SYWRpdXNcIj4+LFxuICBmYWxsYmFjazogTWlzc2lsZUNvbmZpZyxcbiAgbGltaXRzOiBNaXNzaWxlTGltaXRzLFxuKTogTWlzc2lsZUNvbmZpZyB7XG4gIGNvbnN0IG1pblNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1pbikgPyBsaW1pdHMuc3BlZWRNaW4gOiBNSVNTSUxFX01JTl9TUEVFRDtcbiAgY29uc3QgbWF4U3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCA6IE1JU1NJTEVfTUFYX1NQRUVEO1xuICBjb25zdCBtaW5BZ3JvID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluIDogTUlTU0lMRV9NSU5fQUdSTztcbiAgY29uc3QgYmFzZSA9IGZhbGxiYWNrID8/IHtcbiAgICBzcGVlZDogbWluU3BlZWQsXG4gICAgYWdyb1JhZGl1czogbWluQWdybyxcbiAgICBsaWZldGltZTogbWlzc2lsZUxpZmV0aW1lRm9yKG1pblNwZWVkLCBtaW5BZ3JvLCBsaW1pdHMpLFxuICB9O1xuICBjb25zdCBtZXJnZWRTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgPyAoY2ZnLnNwZWVkID8/IGJhc2Uuc3BlZWQpIDogYmFzZS5zcGVlZDtcbiAgY29uc3QgbWVyZ2VkQWdybyA9IE51bWJlci5pc0Zpbml0ZShjZmcuYWdyb1JhZGl1cyA/PyBiYXNlLmFncm9SYWRpdXMpID8gKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgOiBiYXNlLmFncm9SYWRpdXM7XG4gIGNvbnN0IHNwZWVkID0gY2xhbXAobWVyZ2VkU3BlZWQsIG1pblNwZWVkLCBtYXhTcGVlZCk7XG4gIGNvbnN0IGFncm9SYWRpdXMgPSBNYXRoLm1heChtaW5BZ3JvLCBtZXJnZWRBZ3JvKTtcbiAgcmV0dXJuIHtcbiAgICBzcGVlZCxcbiAgICBhZ3JvUmFkaXVzLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3Ioc3BlZWQsIGFncm9SYWRpdXMsIGxpbWl0cyksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb25vdG9uaWNOb3coKTogbnVtYmVyIHtcbiAgaWYgKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gIH1cbiAgcmV0dXJuIERhdGUubm93KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZVdheXBvaW50TGlzdChsaXN0OiBXYXlwb2ludFtdIHwgdW5kZWZpbmVkIHwgbnVsbCk6IFdheXBvaW50W10ge1xuICBpZiAoIUFycmF5LmlzQXJyYXkobGlzdCkpIHJldHVybiBbXTtcbiAgcmV0dXJuIGxpc3QubWFwKCh3cCkgPT4gKHsgLi4ud3AgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTWlzc2lsZUxpbWl0cyhzdGF0ZTogQXBwU3RhdGUsIGxpbWl0czogUGFydGlhbDxNaXNzaWxlTGltaXRzPik6IHZvaWQge1xuICBzdGF0ZS5taXNzaWxlTGltaXRzID0ge1xuICAgIHNwZWVkTWluOiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWluLFxuICAgIHNwZWVkTWF4OiBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWF4KSA/IGxpbWl0cy5zcGVlZE1heCEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLnNwZWVkTWF4LFxuICAgIGFncm9NaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiEgOiBzdGF0ZS5taXNzaWxlTGltaXRzLmFncm9NaW4sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgdHlwZSBFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHtcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIG1vbm90b25pY05vdyxcbiAgc2FuaXRpemVNaXNzaWxlQ29uZmlnLFxuICB1cGRhdGVNaXNzaWxlTGltaXRzLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlUm91dGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lPzogc3RyaW5nO1xuICB3YXlwb2ludHM/OiBTZXJ2ZXJNaXNzaWxlV2F5cG9pbnRbXTtcbn1cblxuaW50ZXJmYWNlIFNlcnZlclNoaXBTdGF0ZSB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBocD86IG51bWJlcjtcbiAgd2F5cG9pbnRzPzogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgc3BlZWQ/OiBudW1iZXIgfT47XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlU3RhdGUge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgc2VsZj86IGJvb2xlYW47XG4gIGFncm9fcmFkaXVzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJTdGF0ZU1lc3NhZ2Uge1xuICB0eXBlOiBcInN0YXRlXCI7XG4gIG5vdzogbnVtYmVyO1xuICBuZXh0X21pc3NpbGVfcmVhZHk/OiBudW1iZXI7XG4gIG1lPzogU2VydmVyU2hpcFN0YXRlIHwgbnVsbDtcbiAgZ2hvc3RzPzogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlcjsgdng6IG51bWJlcjsgdnk6IG51bWJlciB9PjtcbiAgbWlzc2lsZXM/OiBTZXJ2ZXJNaXNzaWxlU3RhdGVbXTtcbiAgbWlzc2lsZV9yb3V0ZXM/OiBTZXJ2ZXJNaXNzaWxlUm91dGVbXTtcbiAgbWlzc2lsZV9jb25maWc/OiB7XG4gICAgc3BlZWQ/OiBudW1iZXI7XG4gICAgc3BlZWRfbWluPzogbnVtYmVyO1xuICAgIHNwZWVkX21heD86IG51bWJlcjtcbiAgICBhZ3JvX3JhZGl1cz86IG51bWJlcjtcbiAgICBhZ3JvX21pbj86IG51bWJlcjtcbiAgICBsaWZldGltZT86IG51bWJlcjtcbiAgfSB8IG51bGw7XG4gIGFjdGl2ZV9taXNzaWxlX3JvdXRlPzogc3RyaW5nIHwgbnVsbDtcbiAgbWV0YT86IHtcbiAgICBjPzogbnVtYmVyO1xuICAgIHc/OiBudW1iZXI7XG4gICAgaD86IG51bWJlcjtcbiAgfTtcbn1cblxuaW50ZXJmYWNlIENvbm5lY3RPcHRpb25zIHtcbiAgcm9vbTogc3RyaW5nO1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG9uU3RhdGVVcGRhdGVkPzogKCkgPT4gdm9pZDtcbn1cblxubGV0IHdzOiBXZWJTb2NrZXQgfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIHNlbmRNZXNzYWdlKHBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcbiAgaWYgKCF3cyB8fCB3cy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikgcmV0dXJuO1xuICBjb25zdCBkYXRhID0gdHlwZW9mIHBheWxvYWQgPT09IFwic3RyaW5nXCIgPyBwYXlsb2FkIDogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCk7XG4gIHdzLnNlbmQoZGF0YSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0V2ViU29ja2V0KHsgcm9vbSwgc3RhdGUsIGJ1cywgb25TdGF0ZVVwZGF0ZWQgfTogQ29ubmVjdE9wdGlvbnMpOiB2b2lkIHtcbiAgY29uc3QgcHJvdG9jb2wgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgPyBcIndzczovL1wiIDogXCJ3czovL1wiO1xuICB3cyA9IG5ldyBXZWJTb2NrZXQoYCR7cHJvdG9jb2x9JHt3aW5kb3cubG9jYXRpb24uaG9zdH0vd3M/cm9vbT0ke2VuY29kZVVSSUNvbXBvbmVudChyb29tKX1gKTtcbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm9wZW5cIiwgKCkgPT4gY29uc29sZS5sb2coXCJbd3NdIG9wZW5cIikpO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwiY2xvc2VcIiwgKCkgPT4gY29uc29sZS5sb2coXCJbd3NdIGNsb3NlXCIpKTtcblxuICBsZXQgcHJldlJvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+KCk7XG4gIGxldCBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgcHJldk1pc3NpbGVDb3VudCA9IDA7XG5cbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgZGF0YSA9IHNhZmVQYXJzZShldmVudC5kYXRhKTtcbiAgICBpZiAoIWRhdGEgfHwgZGF0YS50eXBlICE9PSBcInN0YXRlXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaGFuZGxlU3RhdGVNZXNzYWdlKHN0YXRlLCBkYXRhLCBidXMsIHByZXZSb3V0ZXMsIHByZXZBY3RpdmVSb3V0ZSwgcHJldk1pc3NpbGVDb3VudCk7XG4gICAgcHJldlJvdXRlcyA9IG5ldyBNYXAoc3RhdGUubWlzc2lsZVJvdXRlcy5tYXAoKHJvdXRlKSA9PiBbcm91dGUuaWQsIGNsb25lUm91dGUocm91dGUpXSkpO1xuICAgIHByZXZBY3RpdmVSb3V0ZSA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIHByZXZNaXNzaWxlQ291bnQgPSBzdGF0ZS5taXNzaWxlcy5sZW5ndGg7XG4gICAgYnVzLmVtaXQoXCJzdGF0ZTp1cGRhdGVkXCIpO1xuICAgIG9uU3RhdGVVcGRhdGVkPy4oKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVN0YXRlTWVzc2FnZShcbiAgc3RhdGU6IEFwcFN0YXRlLFxuICBtc2c6IFNlcnZlclN0YXRlTWVzc2FnZSxcbiAgYnVzOiBFdmVudEJ1cyxcbiAgcHJldlJvdXRlczogTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPixcbiAgcHJldkFjdGl2ZVJvdXRlOiBzdHJpbmcgfCBudWxsLFxuICBwcmV2TWlzc2lsZUNvdW50OiBudW1iZXIsXG4pOiB2b2lkIHtcbiAgc3RhdGUubm93ID0gbXNnLm5vdztcbiAgc3RhdGUubm93U3luY2VkQXQgPSBtb25vdG9uaWNOb3coKTtcbiAgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0ID0gTnVtYmVyLmlzRmluaXRlKG1zZy5uZXh0X21pc3NpbGVfcmVhZHkpID8gbXNnLm5leHRfbWlzc2lsZV9yZWFkeSEgOiAwO1xuICBzdGF0ZS5tZSA9IG1zZy5tZSA/IHtcbiAgICB4OiBtc2cubWUueCxcbiAgICB5OiBtc2cubWUueSxcbiAgICB2eDogbXNnLm1lLnZ4LFxuICAgIHZ5OiBtc2cubWUudnksXG4gICAgaHA6IG1zZy5tZS5ocCxcbiAgICB3YXlwb2ludHM6IEFycmF5LmlzQXJyYXkobXNnLm1lLndheXBvaW50cylcbiAgICAgID8gbXNnLm1lLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogTnVtYmVyLmlzRmluaXRlKHdwLnNwZWVkKSA/IHdwLnNwZWVkISA6IDE4MCB9KSlcbiAgICAgIDogW10sXG4gIH0gOiBudWxsO1xuICBzdGF0ZS5naG9zdHMgPSBBcnJheS5pc0FycmF5KG1zZy5naG9zdHMpID8gbXNnLmdob3N0cy5zbGljZSgpIDogW107XG4gIHN0YXRlLm1pc3NpbGVzID0gQXJyYXkuaXNBcnJheShtc2cubWlzc2lsZXMpID8gbXNnLm1pc3NpbGVzLnNsaWNlKCkgOiBbXTtcblxuICBjb25zdCByb3V0ZXNGcm9tU2VydmVyID0gQXJyYXkuaXNBcnJheShtc2cubWlzc2lsZV9yb3V0ZXMpID8gbXNnLm1pc3NpbGVfcm91dGVzIDogW107XG4gIGNvbnN0IG5ld1JvdXRlczogTWlzc2lsZVJvdXRlW10gPSByb3V0ZXNGcm9tU2VydmVyLm1hcCgocm91dGUpID0+ICh7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUgfHwgcm91dGUuaWQgfHwgXCJSb3V0ZVwiLFxuICAgIHdheXBvaW50czogQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpXG4gICAgICA/IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyB4OiB3cC54LCB5OiB3cC55IH0pKVxuICAgICAgOiBbXSxcbiAgfSkpO1xuXG4gIGRpZmZSb3V0ZXMocHJldlJvdXRlcywgbmV3Um91dGVzLCBidXMpO1xuICBzdGF0ZS5taXNzaWxlUm91dGVzID0gbmV3Um91dGVzO1xuXG4gIGNvbnN0IG5leHRBY3RpdmUgPSB0eXBlb2YgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlID09PSBcInN0cmluZ1wiICYmIG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZS5sZW5ndGggPiAwXG4gICAgPyBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGVcbiAgICA6IG5ld1JvdXRlcy5sZW5ndGggPiAwXG4gICAgICA/IG5ld1JvdXRlc1swXS5pZFxuICAgICAgOiBudWxsO1xuICBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG5leHRBY3RpdmU7XG4gIGlmIChuZXh0QWN0aXZlICE9PSBwcmV2QWN0aXZlUm91dGUpIHtcbiAgICBidXMuZW1pdChcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsIHsgcm91dGVJZDogbmV4dEFjdGl2ZSA/PyBudWxsIH0pO1xuICB9XG5cbiAgaWYgKG1zZy5taXNzaWxlX2NvbmZpZykge1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21pbikgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9tYXgpIHx8IE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4pKSB7XG4gICAgICB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlLCB7XG4gICAgICAgIHNwZWVkTWluOiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluLFxuICAgICAgICBzcGVlZE1heDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCxcbiAgICAgICAgYWdyb01pbjogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fbWluLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyh7XG4gICAgICBzcGVlZDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkLFxuICAgICAgYWdyb1JhZGl1czogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fcmFkaXVzLFxuICAgIH0sIHN0YXRlLm1pc3NpbGVDb25maWcsIHN0YXRlLm1pc3NpbGVMaW1pdHMpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLmxpZmV0aW1lKSkge1xuICAgICAgc2FuaXRpemVkLmxpZmV0aW1lID0gbXNnLm1pc3NpbGVfY29uZmlnLmxpZmV0aW1lITtcbiAgICB9XG4gICAgc3RhdGUubWlzc2lsZUNvbmZpZyA9IHNhbml0aXplZDtcbiAgfVxuXG4gIGNvbnN0IG1ldGEgPSBtc2cubWV0YSA/PyB7fTtcbiAgY29uc3QgaGFzQyA9IHR5cGVvZiBtZXRhLmMgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuYyk7XG4gIGNvbnN0IGhhc1cgPSB0eXBlb2YgbWV0YS53ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLncpO1xuICBjb25zdCBoYXNIID0gdHlwZW9mIG1ldGEuaCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5oKTtcbiAgc3RhdGUud29ybGRNZXRhID0ge1xuICAgIGM6IGhhc0MgPyBtZXRhLmMhIDogc3RhdGUud29ybGRNZXRhLmMsXG4gICAgdzogaGFzVyA/IG1ldGEudyEgOiBzdGF0ZS53b3JsZE1ldGEudyxcbiAgICBoOiBoYXNIID8gbWV0YS5oISA6IHN0YXRlLndvcmxkTWV0YS5oLFxuICB9O1xuXG4gIGlmIChzdGF0ZS5taXNzaWxlcy5sZW5ndGggPiBwcmV2TWlzc2lsZUNvdW50KSB7XG4gICAgY29uc3QgYWN0aXZlUm91dGVJZCA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgIGlmIChhY3RpdmVSb3V0ZUlkKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoZWRcIiwgeyByb3V0ZUlkOiBhY3RpdmVSb3V0ZUlkIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6bGF1bmNoZWRcIiwgeyByb3V0ZUlkOiBcIlwiIH0pO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNvb2xkb3duUmVtYWluaW5nID0gTWF0aC5tYXgoMCwgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlKSk7XG4gIGJ1cy5lbWl0KFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIiwgeyBzZWNvbmRzUmVtYWluaW5nOiBjb29sZG93blJlbWFpbmluZyB9KTtcbn1cblxuZnVuY3Rpb24gZGlmZlJvdXRlcyhwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LCBuZXh0Um91dGVzOiBNaXNzaWxlUm91dGVbXSwgYnVzOiBFdmVudEJ1cyk6IHZvaWQge1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3Qgcm91dGUgb2YgbmV4dFJvdXRlcykge1xuICAgIHNlZW4uYWRkKHJvdXRlLmlkKTtcbiAgICBjb25zdCBwcmV2ID0gcHJldlJvdXRlcy5nZXQocm91dGUuaWQpO1xuICAgIGlmICghcHJldikge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlQWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAocm91dGUubmFtZSAhPT0gcHJldi5uYW1lKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVSZW5hbWVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIG5hbWU6IHJvdXRlLm5hbWUgfSk7XG4gICAgfVxuICAgIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleDogcm91dGUud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfSBlbHNlIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoIDwgcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiBwcmV2LndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xuICAgIH1cbiAgICBpZiAocHJldi53YXlwb2ludHMubGVuZ3RoID4gMCAmJiByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IFtyb3V0ZUlkXSBvZiBwcmV2Um91dGVzKSB7XG4gICAgaWYgKCFzZWVuLmhhcyhyb3V0ZUlkKSkge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlRGVsZXRlZFwiLCB7IHJvdXRlSWQgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNsb25lUm91dGUocm91dGU6IE1pc3NpbGVSb3V0ZSk6IE1pc3NpbGVSb3V0ZSB7XG4gIHJldHVybiB7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUsXG4gICAgd2F5cG9pbnRzOiByb3V0ZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHsgLi4ud3AgfSkpLFxuICB9O1xufVxuXG5mdW5jdGlvbiBzYWZlUGFyc2UodmFsdWU6IHVua25vd24pOiBTZXJ2ZXJTdGF0ZU1lc3NhZ2UgfCBudWxsIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UodmFsdWUpIGFzIFNlcnZlclN0YXRlTWVzc2FnZTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS53YXJuKFwiW3dzXSBmYWlsZWQgdG8gcGFyc2UgbWVzc2FnZVwiLCBlcnIpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGU6IEFwcFN0YXRlKTogbnVtYmVyIHtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93KSkge1xuICAgIHJldHVybiAwO1xuICB9XG4gIGNvbnN0IHN5bmNlZEF0ID0gTnVtYmVyLmlzRmluaXRlKHN0YXRlLm5vd1N5bmNlZEF0KSA/IHN0YXRlLm5vd1N5bmNlZEF0IDogbnVsbDtcbiAgaWYgKCFzeW5jZWRBdCkge1xuICAgIHJldHVybiBzdGF0ZS5ub3c7XG4gIH1cbiAgY29uc3QgZWxhcHNlZE1zID0gbW9ub3RvbmljTm93KCkgLSBzeW5jZWRBdDtcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZWxhcHNlZE1zKSB8fCBlbGFwc2VkTXMgPCAwKSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICByZXR1cm4gc3RhdGUubm93ICsgZWxhcHNlZE1zIC8gMTAwMDtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgeyBnZXRBcHByb3hTZXJ2ZXJOb3csIHNlbmRNZXNzYWdlIH0gZnJvbSBcIi4vbmV0XCI7XG5pbXBvcnQge1xuICB0eXBlIEFwcFN0YXRlLFxuICB0eXBlIE1pc3NpbGVSb3V0ZSxcbiAgdHlwZSBNaXNzaWxlU2VsZWN0aW9uLFxuICB0eXBlIFNlbGVjdGlvbixcbiAgdHlwZSBVSVN0YXRlLFxuICBjbGFtcCxcbiAgc2FuaXRpemVNaXNzaWxlQ29uZmlnLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHtcbiAgTUlTU0lMRV9NSU5fU1BFRUQsXG4gIE1JU1NJTEVfTUFYX1NQRUVELFxuICBNSVNTSUxFX01JTl9BR1JPLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG5pbnRlcmZhY2UgSW5pdEdhbWVPcHRpb25zIHtcbiAgc3RhdGU6IEFwcFN0YXRlO1xuICB1aVN0YXRlOiBVSVN0YXRlO1xuICBidXM6IEV2ZW50QnVzO1xufVxuXG5pbnRlcmZhY2UgR2FtZUNvbnRyb2xsZXIge1xuICBvblN0YXRlVXBkYXRlZCgpOiB2b2lkO1xufVxuXG5sZXQgc3RhdGVSZWY6IEFwcFN0YXRlO1xubGV0IHVpU3RhdGVSZWY6IFVJU3RhdGU7XG5sZXQgYnVzUmVmOiBFdmVudEJ1cztcblxubGV0IGN2OiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEIHwgbnVsbCA9IG51bGw7XG5sZXQgVHNwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgQ3NwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgV0hzcGFuOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IEhQc3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwQ29udHJvbHNDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBDbGVhckJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFRvZ2dsZVJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTZWxlY3Rpb25Db250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNlbGVjdGlvbkxhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IG1pc3NpbGVDb250cm9sc0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUFkZFJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVMYXVuY2hCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU2VsZWN0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUFncm9TbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb1ZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNwYXduQm90QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgcm91dGVQcmV2QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJvdXRlTmV4dEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByb3V0ZU1lbnVUb2dnbGU6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcm91dGVNZW51OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBkZWxldGVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVSb3V0ZU5hbWVMYWJlbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlUm91dGVDb3VudExhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgaGVscFRvZ2dsZTogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwQ2xvc2VCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVscFRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCBzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTZWxlY3Rpb246IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcbmxldCBkZWZhdWx0U3BlZWQgPSAxNTA7XG5sZXQgbGFzdExvb3BUczogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgbGFzdE1pc3NpbGVDb25maWdTZW50OiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5jb25zdCBsZWdEYXNoT2Zmc2V0cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5cbmNvbnN0IEhFTFBfVEVYVCA9IFtcbiAgXCJQcmltYXJ5IE1vZGVzXCIsXG4gIFwiICAxIFx1MjAxMyBUb2dnbGUgc2hpcCBuYXZpZ2F0aW9uIG1vZGVcIixcbiAgXCIgIDIgXHUyMDEzIFRvZ2dsZSBtaXNzaWxlIGNvb3JkaW5hdGlvbiBtb2RlXCIsXG4gIFwiXCIsXG4gIFwiU2hpcCBOYXZpZ2F0aW9uXCIsXG4gIFwiICBUIFx1MjAxMyBTd2l0Y2ggYmV0d2VlbiBzZXQvc2VsZWN0XCIsXG4gIFwiICBDIFx1MjAxMyBDbGVhciBhbGwgd2F5cG9pbnRzXCIsXG4gIFwiICBSIFx1MjAxMyBUb2dnbGUgc2hvdyByb3V0ZVwiLFxuICBcIiAgWyAvIF0gXHUyMDEzIEFkanVzdCB3YXlwb2ludCBzcGVlZFwiLFxuICBcIiAgU2hpZnQrWyAvIF0gXHUyMDEzIENvYXJzZSBzcGVlZCBhZGp1c3RcIixcbiAgXCIgIFRhYiAvIFNoaWZ0K1RhYiBcdTIwMTMgQ3ljbGUgd2F5cG9pbnRzXCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBmcm9tIHNlbGVjdGVkIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiTWlzc2lsZSBDb29yZGluYXRpb25cIixcbiAgXCIgIE4gXHUyMDEzIEFkZCBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICBcIiAgTCBcdTIwMTMgTGF1bmNoIG1pc3NpbGVzXCIsXG4gIFwiICBFIFx1MjAxMyBTd2l0Y2ggYmV0d2VlbiBzZXQvc2VsZWN0XCIsXG4gIFwiICAsIC8gLiBcdTIwMTMgQWRqdXN0IGFncm8gcmFkaXVzXCIsXG4gIFwiICA7IC8gJyBcdTIwMTMgQWRqdXN0IG1pc3NpbGUgc3BlZWRcIixcbiAgXCIgIFNoaWZ0K3NsaWRlciBrZXlzIFx1MjAxMyBDb2Fyc2UgYWRqdXN0XCIsXG4gIFwiICBEZWxldGUgXHUyMDEzIERlbGV0ZSBzZWxlY3RlZCBtaXNzaWxlIHdheXBvaW50XCIsXG4gIFwiXCIsXG4gIFwiR2VuZXJhbFwiLFxuICBcIiAgPyBcdTIwMTMgVG9nZ2xlIHRoaXMgb3ZlcmxheVwiLFxuICBcIiAgRXNjIFx1MjAxMyBDYW5jZWwgc2VsZWN0aW9uIG9yIGNsb3NlIG92ZXJsYXlcIixcbl0uam9pbihcIlxcblwiKTtcblxuY29uc3Qgd29ybGQgPSB7IHc6IDgwMDAsIGg6IDQ1MDAgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRHYW1lKHsgc3RhdGUsIHVpU3RhdGUsIGJ1cyB9OiBJbml0R2FtZU9wdGlvbnMpOiBHYW1lQ29udHJvbGxlciB7XG4gIHN0YXRlUmVmID0gc3RhdGU7XG4gIHVpU3RhdGVSZWYgPSB1aVN0YXRlO1xuICBidXNSZWYgPSBidXM7XG5cbiAgY2FjaGVEb20oKTtcbiAgaWYgKCFjdikge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbnZhcyBlbGVtZW50ICNjdiBub3QgZm91bmRcIik7XG4gIH1cbiAgY3R4ID0gY3YuZ2V0Q29udGV4dChcIjJkXCIpO1xuXG4gIGJpbmRMaXN0ZW5lcnMoKTtcbiAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG5cbiAgcmV0dXJuIHtcbiAgICBvblN0YXRlVXBkYXRlZCgpIHtcbiAgICAgIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUoKTtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuICAgICAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNhY2hlRG9tKCk6IHZvaWQge1xuICBjdiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3ZcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBjdHggPSBjdj8uZ2V0Q29udGV4dChcIjJkXCIpID8/IG51bGw7XG4gIFRzcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0XCIpO1xuICBDc3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY1wiKTtcbiAgV0hzcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ3aFwiKTtcbiAgSFBzcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWhwXCIpO1xuICBzaGlwQ29udHJvbHNDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNvbnRyb2xzXCIpO1xuICBzaGlwQ2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTZWxlY3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc2hpcFRvZ2dsZVJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXRvZ2dsZS1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTZWxlY3Rpb25Db250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0aW9uXCIpO1xuICBzaGlwU2VsZWN0aW9uTGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0aW9uLWxhYmVsXCIpO1xuICBzaGlwRGVsZXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTcGVlZENhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtY2FyZFwiKTtcbiAgc2hpcFNwZWVkU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgc2hpcFNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtdmFsdWVcIik7XG5cbiAgbWlzc2lsZUNvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1jb250cm9sc1wiKTtcbiAgbWlzc2lsZUFkZFJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFkZC1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVMYXVuY2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVNldEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVEZWxldGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtZGVsZXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVNwZWVkQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1jYXJkXCIpO1xuICBtaXNzaWxlU3BlZWRTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC12YWx1ZVwiKTtcbiAgbWlzc2lsZUFncm9DYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tY2FyZFwiKTtcbiAgbWlzc2lsZUFncm9TbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVBZ3JvVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby12YWx1ZVwiKTtcblxuICBzcGF3bkJvdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVQcmV2QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1wcmV2XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVOZXh0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1uZXh0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVNZW51VG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51LXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHJvdXRlTWVudSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbWVudVwiKTtcbiAgcmVuYW1lTWlzc2lsZVJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyZW5hbWUtbWlzc2lsZS1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVsZXRlLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNsZWFyLW1pc3NpbGUtd2F5cG9pbnRzXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVJvdXRlTmFtZUxhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXJvdXRlLW5hbWVcIik7XG4gIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtY291bnRcIik7XG5cbiAgaGVscFRvZ2dsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC10b2dnbGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBoZWxwT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC1vdmVybGF5XCIpO1xuICBoZWxwQ2xvc2VCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtY2xvc2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBoZWxwVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC10ZXh0XCIpO1xuXG4gIGRlZmF1bHRTcGVlZCA9IHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyPy52YWx1ZSA/PyBcIjE1MFwiKTtcbn1cblxuZnVuY3Rpb24gYmluZExpc3RlbmVycygpOiB2b2lkIHtcbiAgaWYgKCFjdikgcmV0dXJuO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcmRvd25cIiwgb25DYW52YXNQb2ludGVyRG93bik7XG5cbiAgc3Bhd25Cb3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcInNwYXduX2JvdFwiIH0pO1xuICB9KTtcblxuICBzaGlwQ2xlYXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICBjbGVhclNoaXBSb3V0ZSgpO1xuICB9KTtcblxuICBzaGlwU2V0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldFNoaXBUb29sKFwic2V0XCIpO1xuICB9KTtcblxuICBzaGlwU2VsZWN0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldFNoaXBUb29sKFwic2VsZWN0XCIpO1xuICB9KTtcblxuICBzaGlwVG9nZ2xlUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlID0gIXVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZTtcbiAgICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICB9KTtcblxuICBzaGlwU3BlZWRTbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcnNlRmxvYXQoKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSByZXR1cm47XG4gICAgdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZSk7XG4gICAgZGVmYXVsdFNwZWVkID0gdmFsdWU7XG4gICAgaWYgKHNlbGVjdGlvbiAmJiBzdGF0ZVJlZi5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgJiYgc3RhdGVSZWYubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0pIHtcbiAgICAgIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJ1cGRhdGVfd2F5cG9pbnRcIiwgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCwgc3BlZWQ6IHZhbHVlIH0pO1xuICAgICAgc3RhdGVSZWYubWUud2F5cG9pbnRzW3NlbGVjdGlvbi5pbmRleF0uc3BlZWQgPSB2YWx1ZTtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICB9XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBzaGlwRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZUFkZFJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF9taXNzaWxlX3JvdXRlXCIgfSk7XG4gIH0pO1xuXG4gIG1pc3NpbGVMYXVuY2hCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRNaXNzaWxlVG9vbChcInNldFwiKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNlbGVjdEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRNaXNzaWxlVG9vbChcInNlbGVjdFwiKTtcbiAgfSk7XG5cbiAgbWlzc2lsZURlbGV0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIGRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk7XG4gIH0pO1xuXG4gIG1pc3NpbGVTcGVlZFNsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKHsgc3BlZWQ6IHZhbHVlIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIiwgeyB2YWx1ZSB9KTtcbiAgfSk7XG5cbiAgbWlzc2lsZUFncm9TbGlkZXI/LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcnNlRmxvYXQoKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSByZXR1cm47XG4gICAgdXBkYXRlTWlzc2lsZUNvbmZpZ0Zyb21VSSh7IGFncm9SYWRpdXM6IHZhbHVlIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICByb3V0ZVByZXZCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBjeWNsZU1pc3NpbGVSb3V0ZSgtMSkpO1xuICByb3V0ZU5leHRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBjeWNsZU1pc3NpbGVSb3V0ZSgxKSk7XG5cbiAgcm91dGVNZW51VG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnRvZ2dsZShcInZpc2libGVcIik7XG4gIH0pO1xuXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICBpZiAoIXJvdXRlTWVudSB8fCAhcm91dGVNZW51LmNsYXNzTGlzdC5jb250YWlucyhcInZpc2libGVcIikpIHJldHVybjtcbiAgICBpZiAoZXZlbnQudGFyZ2V0ID09PSByb3V0ZU1lbnVUb2dnbGUpIHJldHVybjtcbiAgICBpZiAocm91dGVNZW51LmNvbnRhaW5zKGV2ZW50LnRhcmdldCBhcyBOb2RlKSkgcmV0dXJuO1xuICAgIHJvdXRlTWVudS5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgcmVuYW1lTWlzc2lsZVJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgY29uc3QgbmFtZSA9IHdpbmRvdy5wcm9tcHQoXCJSZW5hbWUgcm91dGVcIiwgcm91dGUubmFtZSB8fCBcIlwiKTtcbiAgICBpZiAobmFtZSA9PT0gbnVsbCkgcmV0dXJuO1xuICAgIGNvbnN0IHRyaW1tZWQgPSBuYW1lLnRyaW0oKTtcbiAgICBpZiAoIXRyaW1tZWQpIHJldHVybjtcbiAgICByb3V0ZS5uYW1lID0gdHJpbW1lZDtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwicmVuYW1lX21pc3NpbGVfcm91dGVcIixcbiAgICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICAgIHJvdXRlX25hbWU6IHRyaW1tZWQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICByb3V0ZU1lbnU/LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSkgcmV0dXJuO1xuICAgIGlmICghd2luZG93LmNvbmZpcm0oYERlbGV0ZSAke3JvdXRlLm5hbWV9P2ApKSByZXR1cm47XG4gICAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgICBpZiAocm91dGVzLmxlbmd0aCA8PSAxKSB7XG4gICAgICByb3V0ZS53YXlwb2ludHMgPSBbXTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA9IHJvdXRlcy5maWx0ZXIoKHIpID0+IHIuaWQgIT09IHJvdXRlLmlkKTtcbiAgICAgIGNvbnN0IHJlbWFpbmluZyA9IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXM7XG4gICAgICBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IHJlbWFpbmluZy5sZW5ndGggPiAwID8gcmVtYWluaW5nWzBdLmlkIDogbnVsbDtcbiAgICB9XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IG51bGw7XG4gICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJkZWxldGVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIH0pO1xuICB9KTtcblxuICBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUgfHwgIUFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwiY2xlYXJfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIH0pO1xuICAgIHJvdXRlLndheXBvaW50cyA9IFtdO1xuICAgIG1pc3NpbGVTZWxlY3Rpb24gPSBudWxsO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB9KTtcblxuICBoZWxwVG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldEhlbHBWaXNpYmxlKHRydWUpO1xuICB9KTtcblxuICBoZWxwQ2xvc2VCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICB9KTtcblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgb25XaW5kb3dLZXlEb3duLCB7IGNhcHR1cmU6IGZhbHNlIH0pO1xufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1BvaW50ZXJEb3duKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgaWYgKCFjdiB8fCAhY3R4KSByZXR1cm47XG4gIGlmIChoZWxwT3ZlcmxheT8uY2xhc3NMaXN0LmNvbnRhaW5zKFwidmlzaWJsZVwiKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCByZWN0ID0gY3YuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGNvbnN0IHNjYWxlWCA9IHJlY3Qud2lkdGggIT09IDAgPyBjdi53aWR0aCAvIHJlY3Qud2lkdGggOiAxO1xuICBjb25zdCBzY2FsZVkgPSByZWN0LmhlaWdodCAhPT0gMCA/IGN2LmhlaWdodCAvIHJlY3QuaGVpZ2h0IDogMTtcbiAgY29uc3QgeCA9IChldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0KSAqIHNjYWxlWDtcbiAgY29uc3QgeSA9IChldmVudC5jbGllbnRZIC0gcmVjdC50b3ApICogc2NhbGVZO1xuICBjb25zdCBjYW52YXNQb2ludCA9IHsgeCwgeSB9O1xuICBjb25zdCB3b3JsZFBvaW50ID0gY2FudmFzVG9Xb3JsZChjYW52YXNQb2ludCk7XG5cbiAgY29uc3QgY29udGV4dCA9IHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIiA/IFwibWlzc2lsZVwiIDogXCJzaGlwXCI7XG4gIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgIGhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50LCB3b3JsZFBvaW50KTtcbiAgfSBlbHNlIHtcbiAgICBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gIH1cbiAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzaGlwU3BlZWRWYWx1ZSkge1xuICAgIHNoaXBTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gTnVtYmVyKHZhbHVlKS50b0ZpeGVkKDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldFNoaXBTbGlkZXJWYWx1ZSh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghc2hpcFNwZWVkU2xpZGVyKSByZXR1cm47XG4gIHNoaXBTcGVlZFNsaWRlci52YWx1ZSA9IFN0cmluZyh2YWx1ZSk7XG4gIHVwZGF0ZVNwZWVkTGFiZWwodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbCB7XG4gIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gIGlmIChyb3V0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSBudWxsO1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGlmICghc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgfHwgIXJvdXRlcy5zb21lKChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSkge1xuICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcm91dGVzWzBdLmlkO1xuICB9XG4gIHJldHVybiByb3V0ZXMuZmluZCgocm91dGUpID0+IHJvdXRlLmlkID09PSBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCkgPz8gbnVsbDtcbn1cblxuZnVuY3Rpb24gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk6IE1pc3NpbGVSb3V0ZSB8IG51bGwge1xuICByZXR1cm4gZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk6IHZvaWQge1xuICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICBjb25zdCBhY3RpdmVSb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAobWlzc2lsZVJvdXRlTmFtZUxhYmVsKSB7XG4gICAgaWYgKCFhY3RpdmVSb3V0ZSkge1xuICAgICAgbWlzc2lsZVJvdXRlTmFtZUxhYmVsLnRleHRDb250ZW50ID0gcm91dGVzLmxlbmd0aCA9PT0gMCA/IFwiTm8gcm91dGVcIiA6IFwiUm91dGVcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgbWlzc2lsZVJvdXRlTmFtZUxhYmVsLnRleHRDb250ZW50ID0gYWN0aXZlUm91dGUubmFtZSB8fCBcIlJvdXRlXCI7XG4gICAgfVxuICB9XG5cbiAgaWYgKG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwpIHtcbiAgICBjb25zdCBjb3VudCA9IGFjdGl2ZVJvdXRlICYmIEFycmF5LmlzQXJyYXkoYWN0aXZlUm91dGUud2F5cG9pbnRzKSA/IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwudGV4dENvbnRlbnQgPSBgJHtjb3VudH0gcHRzYDtcbiAgfVxuXG4gIGlmIChkZWxldGVNaXNzaWxlUm91dGVCdG4pIHtcbiAgICBkZWxldGVNaXNzaWxlUm91dGVCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gIH1cbiAgaWYgKHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bikge1xuICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZTtcbiAgfVxuICBpZiAoY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuKSB7XG4gICAgY29uc3QgY291bnQgPSBhY3RpdmVSb3V0ZSAmJiBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgPyBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4uZGlzYWJsZWQgPSAhYWN0aXZlUm91dGUgfHwgY291bnQgPT09IDA7XG4gIH1cbiAgaWYgKHJvdXRlUHJldkJ0bikge1xuICAgIHJvdXRlUHJldkJ0bi5kaXNhYmxlZCA9IHJvdXRlcy5sZW5ndGggPD0gMTtcbiAgfVxuICBpZiAocm91dGVOZXh0QnRuKSB7XG4gICAgcm91dGVOZXh0QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICB9XG5cbiAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpOiB2b2lkIHtcbiAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGFjdGl2ZVJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IHJvdXRlSGFzU2VsZWN0aW9uID1cbiAgICAhIWFjdGl2ZVJvdXRlICYmXG4gICAgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpICYmXG4gICAgISFtaXNzaWxlU2VsZWN0aW9uICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA+PSAwICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA8IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGg7XG4gIGlmICghcm91dGVIYXNTZWxlY3Rpb24pIHtcbiAgICBtaXNzaWxlU2VsZWN0aW9uID0gbnVsbDtcbiAgfVxuICBjb25zdCBjZmcgPSBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnO1xuICBhcHBseU1pc3NpbGVVSShjZmcpO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG59XG5cbmZ1bmN0aW9uIGFwcGx5TWlzc2lsZVVJKGNmZzogeyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfSk6IHZvaWQge1xuICBpZiAobWlzc2lsZVNwZWVkU2xpZGVyKSB7XG4gICAgY29uc3QgbWluU3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWluID8/IE1JU1NJTEVfTUlOX1NQRUVEO1xuICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIubWluID0gU3RyaW5nKG1pblNwZWVkKTtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIubWF4ID0gU3RyaW5nKG1heFNwZWVkKTtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIudmFsdWUgPSBjZmcuc3BlZWQudG9GaXhlZCgwKTtcbiAgfVxuICBpZiAobWlzc2lsZVNwZWVkVmFsdWUpIHtcbiAgICBtaXNzaWxlU3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IGNmZy5zcGVlZC50b0ZpeGVkKDApO1xuICB9XG4gIGlmIChtaXNzaWxlQWdyb1NsaWRlcikge1xuICAgIGNvbnN0IG1pbkFncm8gPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLmFncm9NaW4gPz8gTUlTU0lMRV9NSU5fQUdSTztcbiAgICBjb25zdCBtYXhBZ3JvID0gTWF0aC5tYXgoNTAwMCwgTWF0aC5jZWlsKChjZmcuYWdyb1JhZGl1cyArIDUwMCkgLyA1MDApICogNTAwKTtcbiAgICBtaXNzaWxlQWdyb1NsaWRlci5taW4gPSBTdHJpbmcobWluQWdybyk7XG4gICAgbWlzc2lsZUFncm9TbGlkZXIubWF4ID0gU3RyaW5nKG1heEFncm8pO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyLnZhbHVlID0gY2ZnLmFncm9SYWRpdXMudG9GaXhlZCgwKTtcbiAgfVxuICBpZiAobWlzc2lsZUFncm9WYWx1ZSkge1xuICAgIG1pc3NpbGVBZ3JvVmFsdWUudGV4dENvbnRlbnQgPSBjZmcuYWdyb1JhZGl1cy50b0ZpeGVkKDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVDb25maWdGcm9tVUkob3ZlcnJpZGVzOiBQYXJ0aWFsPHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0+ID0ge30pOiB2b2lkIHtcbiAgY29uc3QgY3VycmVudCA9IHN0YXRlUmVmLm1pc3NpbGVDb25maWc7XG4gIGNvbnN0IGNmZyA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyh7XG4gICAgc3BlZWQ6IG92ZXJyaWRlcy5zcGVlZCA/PyBjdXJyZW50LnNwZWVkLFxuICAgIGFncm9SYWRpdXM6IG92ZXJyaWRlcy5hZ3JvUmFkaXVzID8/IGN1cnJlbnQuYWdyb1JhZGl1cyxcbiAgfSwgY3VycmVudCwgc3RhdGVSZWYubWlzc2lsZUxpbWl0cyk7XG4gIHN0YXRlUmVmLm1pc3NpbGVDb25maWcgPSBjZmc7XG4gIGFwcGx5TWlzc2lsZVVJKGNmZyk7XG4gIGNvbnN0IGxhc3QgPSBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQ7XG4gIGNvbnN0IG5lZWRzU2VuZCA9XG4gICAgIWxhc3QgfHxcbiAgICBNYXRoLmFicyhsYXN0LnNwZWVkIC0gY2ZnLnNwZWVkKSA+IDAuMjUgfHxcbiAgICBNYXRoLmFicygobGFzdC5hZ3JvUmFkaXVzID8/IDApIC0gY2ZnLmFncm9SYWRpdXMpID4gNTtcbiAgaWYgKG5lZWRzU2VuZCkge1xuICAgIHNlbmRNaXNzaWxlQ29uZmlnKGNmZyk7XG4gIH1cbiAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbn1cblxuZnVuY3Rpb24gc2VuZE1pc3NpbGVDb25maWcoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gIGxhc3RNaXNzaWxlQ29uZmlnU2VudCA9IHtcbiAgICBzcGVlZDogY2ZnLnNwZWVkLFxuICAgIGFncm9SYWRpdXM6IGNmZy5hZ3JvUmFkaXVzLFxuICB9O1xuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJjb25maWd1cmVfbWlzc2lsZVwiLFxuICAgIG1pc3NpbGVfc3BlZWQ6IGNmZy5zcGVlZCxcbiAgICBtaXNzaWxlX2Fncm86IGNmZy5hZ3JvUmFkaXVzLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpOiB2b2lkIHtcbiAgaWYgKCFzaGlwU2VsZWN0aW9uQ29udGFpbmVyIHx8ICFzaGlwU2VsZWN0aW9uTGFiZWwgfHwgIXNoaXBEZWxldGVCdG4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgd3BzID0gc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIGNvbnN0IGhhc1ZhbGlkU2VsZWN0aW9uID0gc2VsZWN0aW9uICE9PSBudWxsICYmIHNlbGVjdGlvbi5pbmRleCA+PSAwICYmIHNlbGVjdGlvbi5pbmRleCA8IHdwcy5sZW5ndGg7XG4gIGNvbnN0IGlzU2hpcENvbnRleHQgPSB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJzaGlwXCI7XG5cbiAgc2hpcFNlbGVjdGlvbkNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gIHNoaXBTZWxlY3Rpb25Db250YWluZXIuc3R5bGUub3BhY2l0eSA9IGlzU2hpcENvbnRleHQgPyBcIjFcIiA6IFwiMC42XCI7XG5cbiAgaWYgKCFzdGF0ZVJlZi5tZSB8fCAhaGFzVmFsaWRTZWxlY3Rpb24pIHtcbiAgICBzaGlwU2VsZWN0aW9uTGFiZWwudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgIHNoaXBEZWxldGVCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgIGlmIChpc1NoaXBDb250ZXh0KSB7XG4gICAgICBzZXRTaGlwU2xpZGVyVmFsdWUoZGVmYXVsdFNwZWVkKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHNlbGVjdGlvbiAhPT0gbnVsbCkge1xuICAgIGNvbnN0IHdwID0gd3BzW3NlbGVjdGlvbi5pbmRleF07XG4gICAgY29uc3Qgc3BlZWQgPSB3cCAmJiB0eXBlb2Ygd3Auc3BlZWQgPT09IFwibnVtYmVyXCIgPyB3cC5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcbiAgICBpZiAoaXNTaGlwQ29udGV4dCAmJiBzaGlwU3BlZWRTbGlkZXIgJiYgTWF0aC5hYnMocGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIudmFsdWUpIC0gc3BlZWQpID4gMC4yNSkge1xuICAgICAgc2V0U2hpcFNsaWRlclZhbHVlKHNwZWVkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdXBkYXRlU3BlZWRMYWJlbChzcGVlZCk7XG4gICAgfVxuICAgIGNvbnN0IGRpc3BsYXlJbmRleCA9IHNlbGVjdGlvbi5pbmRleCArIDE7XG4gICAgc2hpcFNlbGVjdGlvbkxhYmVsLnRleHRDb250ZW50ID0gYCR7ZGlzcGxheUluZGV4fSBcdTIwMTQgJHtzcGVlZC50b0ZpeGVkKDApfSB1L3NgO1xuICAgIHNoaXBEZWxldGVCdG4uZGlzYWJsZWQgPSAhaXNTaGlwQ29udGV4dDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk6IHZvaWQge1xuICBpZiAoIW1pc3NpbGVEZWxldGVCdG4pIHJldHVybjtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgY291bnQgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgY29uc3QgaGFzU2VsZWN0aW9uID0gbWlzc2lsZVNlbGVjdGlvbiAhPT0gbnVsbCAmJiBtaXNzaWxlU2VsZWN0aW9uICE9PSB1bmRlZmluZWQgJiYgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA+PSAwICYmIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPCBjb3VudDtcbiAgbWlzc2lsZURlbGV0ZUJ0bi5kaXNhYmxlZCA9ICFoYXNTZWxlY3Rpb247XG4gIGlmIChtaXNzaWxlU2VsZWN0aW9uICYmIGhhc1NlbGVjdGlvbikge1xuICAgIG1pc3NpbGVEZWxldGVCdG4udGV4dENvbnRlbnQgPSBgRGVsICMke21pc3NpbGVTZWxlY3Rpb24uaW5kZXggKyAxfWA7XG4gIH0gZWxzZSB7XG4gICAgbWlzc2lsZURlbGV0ZUJ0bi50ZXh0Q29udGVudCA9IFwiRGVsZXRlXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U2VsZWN0aW9uKHNlbDogU2VsZWN0aW9uIHwgbnVsbCk6IHZvaWQge1xuICBzZWxlY3Rpb24gPSBzZWw7XG4gIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gc2V0TWlzc2lsZVNlbGVjdGlvbihzZWw6IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsKTogdm9pZCB7XG4gIG1pc3NpbGVTZWxlY3Rpb24gPSBzZWw7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU2hpcFBvaW50ZXIoY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgd29ybGRQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogdm9pZCB7XG4gIGlmICghc3RhdGVSZWYubWUpIHJldHVybjtcbiAgaWYgKHVpU3RhdGVSZWYuc2hpcFRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGUoY2FudmFzUG9pbnQpO1xuICAgIHNldFNlbGVjdGlvbihoaXQgPz8gbnVsbCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgd3AgPSB7IHg6IHdvcmxkUG9pbnQueCwgeTogd29ybGRQb2ludC55LCBzcGVlZDogZGVmYXVsdFNwZWVkIH07XG4gIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJhZGRfd2F5cG9pbnRcIiwgeDogd3AueCwgeTogd3AueSwgc3BlZWQ6IGRlZmF1bHRTcGVlZCB9KTtcbiAgY29uc3Qgd3BzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzLnNsaWNlKCkgOiBbXTtcbiAgd3BzLnB1c2god3ApO1xuICBzdGF0ZVJlZi5tZS53YXlwb2ludHMgPSB3cHM7XG4gIGlmICh3cHMubGVuZ3RoID4gMCkge1xuICAgIHNldFNlbGVjdGlvbih7IHR5cGU6IFwibGVnXCIsIGluZGV4OiB3cHMubGVuZ3RoIC0gMSB9KTtcbiAgICBidXNSZWYuZW1pdChcInNoaXA6d2F5cG9pbnRBZGRlZFwiLCB7IGluZGV4OiB3cHMubGVuZ3RoIC0gMSB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBoYW5kbGVNaXNzaWxlUG9pbnRlcihjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCB3b3JsZFBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgaWYgKCFyb3V0ZSkgcmV0dXJuO1xuXG4gIGlmICh1aVN0YXRlUmVmLm1pc3NpbGVUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgY29uc3QgaGl0ID0gaGl0VGVzdE1pc3NpbGVSb3V0ZShjYW52YXNQb2ludCk7XG4gICAgc2V0TWlzc2lsZVNlbGVjdGlvbihoaXQpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHdwID0geyB4OiB3b3JsZFBvaW50LngsIHk6IHdvcmxkUG9pbnQueSB9O1xuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJhZGRfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICB4OiB3cC54LFxuICAgIHk6IHdwLnksXG4gIH0pO1xuICByb3V0ZS53YXlwb2ludHMgPSByb3V0ZS53YXlwb2ludHMgPyBbLi4ucm91dGUud2F5cG9pbnRzLCB3cF0gOiBbd3BdO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogcm91dGUud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbn1cblxuZnVuY3Rpb24gY2xlYXJTaGlwUm91dGUoKTogdm9pZCB7XG4gIGNvbnN0IHdwcyA9IHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBpZiAoIXdwcyB8fCB3cHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJjbGVhcl93YXlwb2ludHNcIiB9KTtcbiAgaWYgKHN0YXRlUmVmLm1lKSB7XG4gICAgc3RhdGVSZWYubWUud2F5cG9pbnRzID0gW107XG4gIH1cbiAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICBidXNSZWYuZW1pdChcInNoaXA6d2F5cG9pbnRzQ2xlYXJlZFwiKTtcbn1cblxuZnVuY3Rpb24gZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTogdm9pZCB7XG4gIGlmICghc2VsZWN0aW9uKSByZXR1cm47XG4gIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJkZWxldGVfd2F5cG9pbnRcIiwgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCB9KTtcbiAgaWYgKHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSkge1xuICAgIHN0YXRlUmVmLm1lLndheXBvaW50cyA9IHN0YXRlUmVmLm1lLndheXBvaW50cy5zbGljZSgwLCBzZWxlY3Rpb24uaW5kZXgpO1xuICB9XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludERlbGV0ZWRcIiwgeyBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICBzZXRTZWxlY3Rpb24obnVsbCk7XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk6IHZvaWQge1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlIHx8ICFtaXNzaWxlU2VsZWN0aW9uKSByZXR1cm47XG4gIGNvbnN0IGluZGV4ID0gbWlzc2lsZVNlbGVjdGlvbi5pbmRleDtcbiAgaWYgKCFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwiZGVsZXRlX21pc3NpbGVfd2F5cG9pbnRcIixcbiAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgaW5kZXgsXG4gIH0pO1xuICByb3V0ZS53YXlwb2ludHMgPSBbLi4ucm91dGUud2F5cG9pbnRzLnNsaWNlKDAsIGluZGV4KSwgLi4ucm91dGUud2F5cG9pbnRzLnNsaWNlKGluZGV4ICsgMSldO1xuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4IH0pO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTogdm9pZCB7XG4gIGlmIChtaXNzaWxlTGF1bmNoQnRuPy5kaXNhYmxlZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlIHx8ICFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImxhdW5jaF9taXNzaWxlXCIsXG4gICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gY3ljbGVNaXNzaWxlUm91dGUoZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgaWYgKHJvdXRlcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY3VycmVudEluZGV4ID0gcm91dGVzLmZpbmRJbmRleCgocm91dGUpID0+IHJvdXRlLmlkID09PSBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCk7XG4gIGNvbnN0IGJhc2VJbmRleCA9IGN1cnJlbnRJbmRleCA+PSAwID8gY3VycmVudEluZGV4IDogMDtcbiAgY29uc3QgbmV4dEluZGV4ID0gKChiYXNlSW5kZXggKyBkaXJlY3Rpb24pICUgcm91dGVzLmxlbmd0aCArIHJvdXRlcy5sZW5ndGgpICUgcm91dGVzLmxlbmd0aDtcbiAgY29uc3QgbmV4dFJvdXRlID0gcm91dGVzW25leHRJbmRleF07XG4gIGlmICghbmV4dFJvdXRlKSByZXR1cm47XG4gIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dFJvdXRlLmlkO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJzZXRfYWN0aXZlX21pc3NpbGVfcm91dGVcIixcbiAgICByb3V0ZV9pZDogbmV4dFJvdXRlLmlkLFxuICB9KTtcbiAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLCB7IHJvdXRlSWQ6IG5leHRSb3V0ZS5pZCB9KTtcbn1cblxuZnVuY3Rpb24gY3ljbGVTaGlwU2VsZWN0aW9uKGRpcmVjdGlvbjogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHdwcyA9IHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBpZiAoIXdwcyB8fCB3cHMubGVuZ3RoID09PSAwKSB7XG4gICAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgaW5kZXggPSBzZWxlY3Rpb24gPyBzZWxlY3Rpb24uaW5kZXggOiBkaXJlY3Rpb24gPiAwID8gLTEgOiB3cHMubGVuZ3RoO1xuICBpbmRleCArPSBkaXJlY3Rpb247XG4gIGlmIChpbmRleCA8IDApIGluZGV4ID0gd3BzLmxlbmd0aCAtIDE7XG4gIGlmIChpbmRleCA+PSB3cHMubGVuZ3RoKSBpbmRleCA9IDA7XG4gIHNldFNlbGVjdGlvbih7IHR5cGU6IFwibGVnXCIsIGluZGV4IH0pO1xufVxuXG5mdW5jdGlvbiBzZXRJbnB1dENvbnRleHQoY29udGV4dDogXCJzaGlwXCIgfCBcIm1pc3NpbGVcIik6IHZvaWQge1xuICBjb25zdCBuZXh0ID0gY29udGV4dCA9PT0gXCJtaXNzaWxlXCIgPyBcIm1pc3NpbGVcIiA6IFwic2hpcFwiO1xuICBpZiAodWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IG5leHQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPSBuZXh0O1xuICBidXNSZWYuZW1pdChcImNvbnRleHQ6Y2hhbmdlZFwiLCB7IGNvbnRleHQ6IG5leHQgfSk7XG4gIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBzZXRTaGlwVG9vbCh0b29sOiBcInNldFwiIHwgXCJzZWxlY3RcIik6IHZvaWQge1xuICBpZiAodG9vbCAhPT0gXCJzZXRcIiAmJiB0b29sICE9PSBcInNlbGVjdFwiKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh1aVN0YXRlUmVmLnNoaXBUb29sID09PSB0b29sKSB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICByZXR1cm47XG4gIH1cbiAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IHRvb2w7XG4gIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDp0b29sQ2hhbmdlZFwiLCB7IHRvb2wgfSk7XG59XG5cbmZ1bmN0aW9uIHNldE1pc3NpbGVUb29sKHRvb2w6IFwic2V0XCIgfCBcInNlbGVjdFwiKTogdm9pZCB7XG4gIGlmICh0b29sICE9PSBcInNldFwiICYmIHRvb2wgIT09IFwic2VsZWN0XCIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IHRvb2wpIHtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID0gdG9vbDtcbiAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgaWYgKHRvb2wgPT09IFwic2V0XCIpIHtcbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICB9XG4gIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG59XG5cbmZ1bmN0aW9uIHNldEJ1dHRvblN0YXRlKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsLCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgaWYgKCFidG4pIHJldHVybjtcbiAgaWYgKGFjdGl2ZSkge1xuICAgIGJ0bi5kYXRhc2V0LnN0YXRlID0gXCJhY3RpdmVcIjtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwidHJ1ZVwiKTtcbiAgfSBlbHNlIHtcbiAgICBkZWxldGUgYnRuLmRhdGFzZXQuc3RhdGU7XG4gICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcImZhbHNlXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk6IHZvaWQge1xuICBzZXRCdXR0b25TdGF0ZShzaGlwU2V0QnRuLCB1aVN0YXRlUmVmLnNoaXBUb29sID09PSBcInNldFwiKTtcbiAgc2V0QnV0dG9uU3RhdGUoc2hpcFNlbGVjdEJ0biwgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9PT0gXCJzZWxlY3RcIik7XG4gIHNldEJ1dHRvblN0YXRlKHNoaXBUb2dnbGVSb3V0ZUJ0biwgdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlKTtcbiAgc2V0QnV0dG9uU3RhdGUobWlzc2lsZVNldEJ0biwgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9PT0gXCJzZXRcIik7XG4gIHNldEJ1dHRvblN0YXRlKG1pc3NpbGVTZWxlY3RCdG4sIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpO1xuXG4gIGlmIChzaGlwQ29udHJvbHNDYXJkKSB7XG4gICAgc2hpcENvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIik7XG4gIH1cbiAgaWYgKG1pc3NpbGVDb250cm9sc0NhcmQpIHtcbiAgICBtaXNzaWxlQ29udHJvbHNDYXJkLmNsYXNzTGlzdC50b2dnbGUoXCJhY3RpdmVcIiwgdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRIZWxwVmlzaWJsZShmbGFnOiBib29sZWFuKTogdm9pZCB7XG4gIHVpU3RhdGVSZWYuaGVscFZpc2libGUgPSBCb29sZWFuKGZsYWcpO1xuICB1cGRhdGVIZWxwT3ZlcmxheSgpO1xuICBidXNSZWYuZW1pdChcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgeyB2aXNpYmxlOiB1aVN0YXRlUmVmLmhlbHBWaXNpYmxlIH0pO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIZWxwT3ZlcmxheSgpOiB2b2lkIHtcbiAgaWYgKCFoZWxwT3ZlcmxheSkgcmV0dXJuO1xuICBpZiAoaGVscFRleHQpIHtcbiAgICBoZWxwVGV4dC50ZXh0Q29udGVudCA9IEhFTFBfVEVYVDtcbiAgfVxuICBoZWxwT3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiLCB1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbn1cblxuZnVuY3Rpb24gYWRqdXN0U2xpZGVyVmFsdWUoaW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsLCBzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiBudW1iZXIgfCBudWxsIHtcbiAgaWYgKCFpbnB1dCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHN0ZXAgPSBNYXRoLmFicyhwYXJzZUZsb2F0KGlucHV0LnN0ZXApKSB8fCAxO1xuICBjb25zdCBtdWx0aXBsaWVyID0gY29hcnNlID8gNCA6IDE7XG4gIGNvbnN0IG1pbiA9IE51bWJlci5pc0Zpbml0ZShwYXJzZUZsb2F0KGlucHV0Lm1pbikpID8gcGFyc2VGbG9hdChpbnB1dC5taW4pIDogLUluZmluaXR5O1xuICBjb25zdCBtYXggPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VGbG9hdChpbnB1dC5tYXgpKSA/IHBhcnNlRmxvYXQoaW5wdXQubWF4KSA6IEluZmluaXR5O1xuICBjb25zdCBjdXJyZW50ID0gcGFyc2VGbG9hdChpbnB1dC52YWx1ZSkgfHwgMDtcbiAgbGV0IG5leHQgPSBjdXJyZW50ICsgc3RlcHMgKiBzdGVwICogbXVsdGlwbGllcjtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShtaW4pKSBuZXh0ID0gTWF0aC5tYXgobWluLCBuZXh0KTtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShtYXgpKSBuZXh0ID0gTWF0aC5taW4obWF4LCBuZXh0KTtcbiAgaWYgKE1hdGguYWJzKG5leHQgLSBjdXJyZW50KSA8IDFlLTQpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBpbnB1dC52YWx1ZSA9IFN0cmluZyhuZXh0KTtcbiAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoXCJpbnB1dFwiLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICByZXR1cm4gbmV4dDtcbn1cblxuZnVuY3Rpb24gb25XaW5kb3dLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gIGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBjb25zdCBpc0VkaXRhYmxlID0gISF0YXJnZXQgJiYgKHRhcmdldC50YWdOYW1lID09PSBcIklOUFVUXCIgfHwgdGFyZ2V0LnRhZ05hbWUgPT09IFwiVEVYVEFSRUFcIiB8fCB0YXJnZXQuaXNDb250ZW50RWRpdGFibGUpO1xuXG4gIGlmICh1aVN0YXRlUmVmLmhlbHBWaXNpYmxlICYmIGV2ZW50LmtleSAhPT0gXCJFc2NhcGVcIikge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGlzRWRpdGFibGUpIHtcbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XG4gICAgICB0YXJnZXQuYmx1cigpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc3dpdGNoIChldmVudC5jb2RlKSB7XG4gICAgY2FzZSBcIkRpZ2l0MVwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRpZ2l0MlwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleVRcIjpcbiAgICAgIHNldFNoaXBUb29sKHVpU3RhdGVSZWYuc2hpcFRvb2wgPT09IFwic2V0XCIgPyBcInNlbGVjdFwiIDogXCJzZXRcIik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlDXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgY2xlYXJTaGlwUm91dGUoKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleVJcIjpcbiAgICAgIHVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSA9ICF1aVN0YXRlUmVmLnNob3dTaGlwUm91dGU7XG4gICAgICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiQnJhY2tldExlZnRcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShzaGlwU3BlZWRTbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJCcmFja2V0UmlnaHRcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShzaGlwU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIlRhYlwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGN5Y2xlU2hpcFNlbGVjdGlvbihldmVudC5zaGlmdEtleSA/IC0xIDogMSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlOXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgbWlzc2lsZUFkZFJvdXRlQnRuPy5jbGljaygpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5TFwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5RVwiOlxuICAgICAgc2V0TWlzc2lsZVRvb2wodWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9PT0gXCJzZXRcIiA/IFwic2VsZWN0XCIgOiBcInNldFwiKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkNvbW1hXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJQZXJpb2RcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlQWdyb1NsaWRlciwgMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiU2VtaWNvbG9uXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiUXVvdGVcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRlbGV0ZVwiOlxuICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgbWlzc2lsZVNlbGVjdGlvbikge1xuICAgICAgICBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgfSBlbHNlIGlmIChzZWxlY3Rpb24pIHtcbiAgICAgICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkVzY2FwZVwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuaGVscFZpc2libGUpIHtcbiAgICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgICAgfSBlbHNlIGlmIChtaXNzaWxlU2VsZWN0aW9uKSB7XG4gICAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHNlbGVjdGlvbikge1xuICAgICAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBkZWZhdWx0OlxuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgIHNldEhlbHBWaXNpYmxlKCF1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdvcmxkVG9DYW52YXMocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcbiAgY29uc3Qgc3ggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHN5ID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgcmV0dXJuIHsgeDogcC54ICogc3gsIHk6IHAueSAqIHN5IH07XG59XG5cbmZ1bmN0aW9uIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcbiAgY29uc3Qgc3ggPSB3b3JsZC53IC8gY3Yud2lkdGg7XG4gIGNvbnN0IHN5ID0gd29ybGQuaCAvIGN2LmhlaWdodDtcbiAgcmV0dXJuIHsgeDogcC54ICogc3gsIHk6IHAueSAqIHN5IH07XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVSb3V0ZVBvaW50cygpIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHdwcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBjb25zdCB3b3JsZFBvaW50cyA9IFt7IHg6IHN0YXRlUmVmLm1lLngsIHk6IHN0YXRlUmVmLm1lLnkgfV07XG4gIGZvciAoY29uc3Qgd3Agb2Ygd3BzKSB7XG4gICAgd29ybGRQb2ludHMucHVzaCh7IHg6IHdwLngsIHk6IHdwLnkgfSk7XG4gIH1cbiAgY29uc3QgY2FudmFzUG9pbnRzID0gd29ybGRQb2ludHMubWFwKChwb2ludCkgPT4gd29ybGRUb0NhbnZhcyhwb2ludCkpO1xuICByZXR1cm4geyB3YXlwb2ludHM6IHdwcywgd29ybGRQb2ludHMsIGNhbnZhc1BvaW50cyB9O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCkge1xuICBpZiAoIXN0YXRlUmVmLm1lKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3Qgd3BzID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzIDogW107XG4gIGNvbnN0IHdvcmxkUG9pbnRzID0gW3sgeDogc3RhdGVSZWYubWUueCwgeTogc3RhdGVSZWYubWUueSB9XTtcbiAgZm9yIChjb25zdCB3cCBvZiB3cHMpIHtcbiAgICB3b3JsZFBvaW50cy5wdXNoKHsgeDogd3AueCwgeTogd3AueSB9KTtcbiAgfVxuICBjb25zdCBjYW52YXNQb2ludHMgPSB3b3JsZFBvaW50cy5tYXAoKHBvaW50KSA9PiB3b3JsZFRvQ2FudmFzKHBvaW50KSk7XG4gIHJldHVybiB7IHdheXBvaW50czogd3BzLCB3b3JsZFBvaW50cywgY2FudmFzUG9pbnRzIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUxlZ0Rhc2hPZmZzZXRzKGR0U2Vjb25kczogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlIHx8ICFzdGF0ZVJlZi5tZSkge1xuICAgIGxlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIGxlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHsgd2F5cG9pbnRzLCB3b3JsZFBvaW50cywgY2FudmFzUG9pbnRzIH0gPSByb3V0ZTtcbiAgY29uc3QgY3ljbGUgPSA2NDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB3cCA9IHdheXBvaW50c1tpXTtcbiAgICBjb25zdCBzcGVlZCA9IHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiA/IHdwLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuICAgIGNvbnN0IGFXb3JsZCA9IHdvcmxkUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJXb3JsZCA9IHdvcmxkUG9pbnRzW2kgKyAxXTtcbiAgICBjb25zdCB3b3JsZERpc3QgPSBNYXRoLmh5cG90KGJXb3JsZC54IC0gYVdvcmxkLngsIGJXb3JsZC55IC0gYVdvcmxkLnkpO1xuICAgIGNvbnN0IGFDYW52YXMgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3QgYkNhbnZhcyA9IGNhbnZhc1BvaW50c1tpICsgMV07XG4gICAgY29uc3QgY2FudmFzRGlzdCA9IE1hdGguaHlwb3QoYkNhbnZhcy54IC0gYUNhbnZhcy54LCBiQ2FudmFzLnkgLSBhQ2FudmFzLnkpO1xuXG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoc3BlZWQpIHx8IHNwZWVkIDw9IDFlLTMgfHwgIU51bWJlci5pc0Zpbml0ZSh3b3JsZERpc3QpIHx8IHdvcmxkRGlzdCA8PSAxZS0zIHx8IGNhbnZhc0Rpc3QgPD0gMWUtMykge1xuICAgICAgbGVnRGFzaE9mZnNldHMuc2V0KGksIDApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPD0gMCkge1xuICAgICAgaWYgKCFsZWdEYXNoT2Zmc2V0cy5oYXMoaSkpIHtcbiAgICAgICAgbGVnRGFzaE9mZnNldHMuc2V0KGksIDApO1xuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBjYW52YXNEaXN0IC8gd29ybGREaXN0O1xuICAgIGNvbnN0IGRhc2hTcGVlZCA9IHNwZWVkICogc2NhbGU7XG4gICAgbGV0IG5leHQgPSAobGVnRGFzaE9mZnNldHMuZ2V0KGkpID8/IDApIC0gZGFzaFNwZWVkICogZHRTZWNvbmRzO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG5leHQpKSB7XG4gICAgICBuZXh0ID0gMDtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCA9ICgobmV4dCAlIGN5Y2xlKSArIGN5Y2xlKSAlIGN5Y2xlO1xuICAgIH1cbiAgICBsZWdEYXNoT2Zmc2V0cy5zZXQoaSwgbmV4dCk7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgb2YgQXJyYXkuZnJvbShsZWdEYXNoT2Zmc2V0cy5rZXlzKCkpKSB7XG4gICAgaWYgKGtleSA+PSB3YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBsZWdEYXNoT2Zmc2V0cy5kZWxldGUoa2V5KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gcG9pbnRTZWdtZW50RGlzdGFuY2UocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBhOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIGI6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IG51bWJlciB7XG4gIGNvbnN0IGFieCA9IGIueCAtIGEueDtcbiAgY29uc3QgYWJ5ID0gYi55IC0gYS55O1xuICBjb25zdCBhcHggPSBwLnggLSBhLng7XG4gIGNvbnN0IGFweSA9IHAueSAtIGEueTtcbiAgY29uc3QgYWJMZW5TcSA9IGFieCAqIGFieCArIGFieSAqIGFieTtcbiAgY29uc3QgdCA9IGFiTGVuU3EgPT09IDAgPyAwIDogY2xhbXAoYXB4ICogYWJ4ICsgYXB5ICogYWJ5LCAwLCBhYkxlblNxKSAvIGFiTGVuU3E7XG4gIGNvbnN0IHByb2p4ID0gYS54ICsgYWJ4ICogdDtcbiAgY29uc3QgcHJvankgPSBhLnkgKyBhYnkgKiB0O1xuICBjb25zdCBkeCA9IHAueCAtIHByb2p4O1xuICBjb25zdCBkeSA9IHAueSAtIHByb2p5O1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG5mdW5jdGlvbiBoaXRUZXN0Um91dGUoY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IFNlbGVjdGlvbiB8IG51bGwge1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCB7IGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IHdheXBvaW50SGl0UmFkaXVzID0gMTI7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3BDYW52YXMgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdwQ2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd3BDYW52YXMueTtcbiAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpIDw9IHdheXBvaW50SGl0UmFkaXVzKSB7XG4gICAgICByZXR1cm4geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG4gIGlmICghdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgbGVnSGl0RGlzdGFuY2UgPSAxMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBkaXN0ID0gcG9pbnRTZWdtZW50RGlzdGFuY2UoY2FudmFzUG9pbnQsIGNhbnZhc1BvaW50c1tpXSwgY2FudmFzUG9pbnRzW2kgKyAxXSk7XG4gICAgaWYgKGRpc3QgPD0gbGVnSGl0RGlzdGFuY2UpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6IFwibGVnXCIsIGluZGV4OiBpIH07XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBoaXRUZXN0TWlzc2lsZVJvdXRlKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBNaXNzaWxlU2VsZWN0aW9uIHwgbnVsbCB7XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBjb25zdCB7IGNhbnZhc1BvaW50cyB9ID0gcm91dGU7XG4gIGNvbnN0IHdheXBvaW50SGl0UmFkaXVzID0gMTY7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgY2FudmFzUG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd3BDYW52YXMgPSBjYW52YXNQb2ludHNbaV07XG4gICAgY29uc3QgZHggPSBjYW52YXNQb2ludC54IC0gd3BDYW52YXMueDtcbiAgICBjb25zdCBkeSA9IGNhbnZhc1BvaW50LnkgLSB3cENhbnZhcy55O1xuICAgIGlmIChNYXRoLmh5cG90KGR4LCBkeSkgPD0gd2F5cG9pbnRIaXRSYWRpdXMpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6IFwid2F5cG9pbnRcIiwgaW5kZXg6IGkgLSAxIH07XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBkcmF3U2hpcCh4OiBudW1iZXIsIHk6IG51bWJlciwgdng6IG51bWJlciwgdnk6IG51bWJlciwgY29sb3I6IHN0cmluZywgZmlsbGVkOiBib29sZWFuKTogdm9pZCB7XG4gIGlmICghY3R4KSByZXR1cm47XG4gIGNvbnN0IHAgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeSB9KTtcbiAgY29uc3QgciA9IDEwO1xuICBjdHguc2F2ZSgpO1xuICBjdHgudHJhbnNsYXRlKHAueCwgcC55KTtcbiAgY29uc3QgYW5nbGUgPSBNYXRoLmF0YW4yKHZ5LCB2eCk7XG4gIGN0eC5yb3RhdGUoYW5nbGUpO1xuICBjdHguYmVnaW5QYXRoKCk7XG4gIGN0eC5tb3ZlVG8ociwgMCk7XG4gIGN0eC5saW5lVG8oLXIgKiAwLjcsIHIgKiAwLjYpO1xuICBjdHgubGluZVRvKC1yICogMC40LCAwKTtcbiAgY3R4LmxpbmVUbygtciAqIDAuNywgLXIgKiAwLjYpO1xuICBjdHguY2xvc2VQYXRoKCk7XG4gIGN0eC5saW5lV2lkdGggPSAyO1xuICBjdHguc3Ryb2tlU3R5bGUgPSBjb2xvcjtcbiAgaWYgKGZpbGxlZCkge1xuICAgIGN0eC5maWxsU3R5bGUgPSBgJHtjb2xvcn1jY2A7XG4gICAgY3R4LmZpbGwoKTtcbiAgfVxuICBjdHguc3Ryb2tlKCk7XG4gIGN0eC5yZXN0b3JlKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdHaG9zdERvdCh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIWN0eCkgcmV0dXJuO1xuICBjb25zdCBwID0gd29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4LmFyYyhwLngsIHAueSwgMywgMCwgTWF0aC5QSSAqIDIpO1xuICBjdHguZmlsbFN0eWxlID0gXCIjY2NjY2NjYWFcIjtcbiAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gZHJhd1JvdXRlKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWUpIHJldHVybjtcbiAgY29uc3Qgcm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSByZXR1cm47XG4gIGNvbnN0IHsgY2FudmFzUG9pbnRzIH0gPSByb3V0ZTtcbiAgY29uc3QgbGVnQ291bnQgPSBjYW52YXNQb2ludHMubGVuZ3RoIC0gMTtcblxuICBpZiAodWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlICYmIGxlZ0NvdW50ID4gMCkge1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnNldExpbmVEYXNoKFs4LCA4XSk7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMzOGJkZjg2NlwiO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVnQ291bnQ7IGkrKykge1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbaV0ueCwgY2FudmFzUG9pbnRzW2ldLnkpO1xuICAgICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbaSArIDFdLngsIGNhbnZhc1BvaW50c1tpICsgMV0ueSk7XG4gICAgICBjdHgubGluZURhc2hPZmZzZXQgPSBsZWdEYXNoT2Zmc2V0cy5nZXQoaSkgPz8gMDtcbiAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGlmICh1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUgJiYgbGVnQ291bnQgPiAwKSB7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguc2V0TGluZURhc2goWzYsIDZdKTtcbiAgICBjdHgubGluZVdpZHRoID0gMztcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMzOGJkZjhcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbMF0ueCwgY2FudmFzUG9pbnRzWzBdLnkpO1xuICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzWzFdLngsIGNhbnZhc1BvaW50c1sxXS55KTtcbiAgICBjdHgubGluZURhc2hPZmZzZXQgPSBsZWdEYXNoT2Zmc2V0cy5nZXQoMCkgPz8gMDtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxuXG4gIGlmICh1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUgJiYgc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5pbmRleCA8IGxlZ0NvdW50KSB7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguc2V0TGluZURhc2goWzQsIDRdKTtcbiAgICBjdHgubGluZVdpZHRoID0gMy41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiI2Y5NzMxNlwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXhdLngsIGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXhdLnkpO1xuICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzW3NlbGVjdGlvbi5pbmRleCArIDFdLngsIGNhbnZhc1BvaW50c1tzZWxlY3Rpb24uaW5kZXggKyAxXS55KTtcbiAgICBjdHgubGluZURhc2hPZmZzZXQgPSBsZWdEYXNoT2Zmc2V0cy5nZXQoc2VsZWN0aW9uLmluZGV4KSA/PyAwO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwdCA9IGNhbnZhc1BvaW50c1tpICsgMV07XG4gICAgY29uc3QgaXNTZWxlY3RlZCA9IHNlbGVjdGlvbiAmJiBzZWxlY3Rpb24uaW5kZXggPT09IGk7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmFyYyhwdC54LCBwdC55LCBpc1NlbGVjdGVkID8gNyA6IDUsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gaXNTZWxlY3RlZCA/IFwiI2Y5NzMxNlwiIDogXCIjMzhiZGY4XCI7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gaXNTZWxlY3RlZCA/IDAuOTUgOiAwLjg7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiIzBmMTcyYVwiO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRyYXdNaXNzaWxlUm91dGUoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBpZiAodWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgIT09IFwibWlzc2lsZVwiKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgY29uc3QgeyBjYW52YXNQb2ludHMgfSA9IHJvdXRlO1xuICBjdHguc2F2ZSgpO1xuICBjdHguc2V0TGluZURhc2goWzEwLCA2XSk7XG4gIGN0eC5saW5lV2lkdGggPSAyLjU7XG4gIGN0eC5zdHJva2VTdHlsZSA9IFwiI2Y4NzE3MWFhXCI7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbMF0ueCwgY2FudmFzUG9pbnRzWzBdLnkpO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGNhbnZhc1BvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGN0eC5saW5lVG8oY2FudmFzUG9pbnRzW2ldLngsIGNhbnZhc1BvaW50c1tpXS55KTtcbiAgfVxuICBjdHguc3Ryb2tlKCk7XG4gIGN0eC5yZXN0b3JlKCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBjYW52YXNQb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwdCA9IGNhbnZhc1BvaW50c1tpXTtcbiAgICBjb25zdCB3YXlwb2ludEluZGV4ID0gaSAtIDE7XG4gICAgY29uc3QgaXNTZWxlY3RlZCA9IG1pc3NpbGVTZWxlY3Rpb24gJiYgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA9PT0gd2F5cG9pbnRJbmRleDtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHguYXJjKHB0LngsIHB0LnksIGlzU2VsZWN0ZWQgPyA3IDogNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgIGN0eC5maWxsU3R5bGUgPSBpc1NlbGVjdGVkID8gXCIjZmFjYzE1XCIgOiBcIiNmODcxNzFcIjtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSBpc1NlbGVjdGVkID8gMC45NSA6IDAuOTtcbiAgICBjdHguZmlsbCgpO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBpc1NlbGVjdGVkID8gXCIjODU0ZDBlXCIgOiBcIiM3ZjFkMWRcIjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkcmF3TWlzc2lsZXMoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFzdGF0ZVJlZi5taXNzaWxlcyB8fCBzdGF0ZVJlZi5taXNzaWxlcy5sZW5ndGggPT09IDAgfHwgIWN2KSByZXR1cm47XG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3QgcmFkaXVzU2NhbGUgPSAoc2NhbGVYICsgc2NhbGVZKSAvIDI7XG4gIGZvciAoY29uc3QgbWlzcyBvZiBzdGF0ZVJlZi5taXNzaWxlcykge1xuICAgIGNvbnN0IHAgPSB3b3JsZFRvQ2FudmFzKHsgeDogbWlzcy54LCB5OiBtaXNzLnkgfSk7XG4gICAgY29uc3Qgc2VsZk93bmVkID0gQm9vbGVhbihtaXNzLnNlbGYpO1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMocC54LCBwLnksIHNlbGZPd25lZCA/IDYgOiA1LCAwLCBNYXRoLlBJICogMik7XG4gICAgY3R4LmZpbGxTdHlsZSA9IHNlbGZPd25lZCA/IFwiI2Y4NzE3MVwiIDogXCIjZmNhNWE1XCI7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gc2VsZk93bmVkID8gMC45NSA6IDAuODtcbiAgICBjdHguZmlsbCgpO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMxMTE4MjdcIjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcblxuICAgIGlmIChzZWxmT3duZWQgJiYgbWlzcy5hZ3JvX3JhZGl1cyA+IDApIHtcbiAgICAgIGN0eC5zYXZlKCk7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjb25zdCByQ2FudmFzID0gbWlzcy5hZ3JvX3JhZGl1cyAqIHJhZGl1c1NjYWxlO1xuICAgICAgY3R4LnNldExpbmVEYXNoKFsxNCwgMTBdKTtcbiAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSgyNDgsMTEzLDExMywwLjM1KVwiO1xuICAgICAgY3R4LmxpbmVXaWR0aCA9IDEuMjtcbiAgICAgIGN0eC5hcmMocC54LCBwLnksIHJDYW52YXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgIGN0eC5yZXN0b3JlKCk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGRyYXdHcmlkKCk6IHZvaWQge1xuICBpZiAoIWN0eCkgcmV0dXJuO1xuICBjdHguc2F2ZSgpO1xuICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMyMzRcIjtcbiAgY3R4LmxpbmVXaWR0aCA9IDE7XG4gIGNvbnN0IHN0ZXAgPSAxMDAwO1xuICBmb3IgKGxldCB4ID0gMDsgeCA8PSB3b3JsZC53OyB4ICs9IHN0ZXApIHtcbiAgICBjb25zdCBhID0gd29ybGRUb0NhbnZhcyh7IHgsIHk6IDAgfSk7XG4gICAgY29uc3QgYiA9IHdvcmxkVG9DYW52YXMoeyB4LCB5OiB3b3JsZC5oIH0pO1xuICAgIGN0eC5iZWdpblBhdGgoKTsgY3R4Lm1vdmVUbyhhLngsIGEueSk7IGN0eC5saW5lVG8oYi54LCBiLnkpOyBjdHguc3Ryb2tlKCk7XG4gIH1cbiAgZm9yIChsZXQgeSA9IDA7IHkgPD0gd29ybGQuaDsgeSArPSBzdGVwKSB7XG4gICAgY29uc3QgYSA9IHdvcmxkVG9DYW52YXMoeyB4OiAwLCB5IH0pO1xuICAgIGNvbnN0IGIgPSB3b3JsZFRvQ2FudmFzKHsgeDogd29ybGQudywgeSB9KTtcbiAgICBjdHguYmVnaW5QYXRoKCk7IGN0eC5tb3ZlVG8oYS54LCBhLnkpOyBjdHgubGluZVRvKGIueCwgYi55KTsgY3R4LnN0cm9rZSgpO1xuICB9XG4gIGN0eC5yZXN0b3JlKCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpOiB2b2lkIHtcbiAgaWYgKCFtaXNzaWxlTGF1bmNoQnRuKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGNvdW50ID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gIGNvbnN0IHJlbWFpbmluZyA9IGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZygpO1xuICBjb25zdCBjb29saW5nRG93biA9IHJlbWFpbmluZyA+IDAuMDU7XG4gIGNvbnN0IHNob3VsZERpc2FibGUgPSAhcm91dGUgfHwgY291bnQgPT09IDAgfHwgY29vbGluZ0Rvd247XG4gIG1pc3NpbGVMYXVuY2hCdG4uZGlzYWJsZWQgPSBzaG91bGREaXNhYmxlO1xuXG4gIGlmICghcm91dGUpIHtcbiAgICBtaXNzaWxlTGF1bmNoQnRuLnRleHRDb250ZW50ID0gXCJMYXVuY2ggbWlzc2lsZXNcIjtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoY29vbGluZ0Rvd24pIHtcbiAgICBtaXNzaWxlTGF1bmNoQnRuLnRleHRDb250ZW50ID0gYExhdW5jaCBpbiAke3JlbWFpbmluZy50b0ZpeGVkKDEpfXNgO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChyb3V0ZS5uYW1lKSB7XG4gICAgbWlzc2lsZUxhdW5jaEJ0bi50ZXh0Q29udGVudCA9IGBMYXVuY2ggJHtyb3V0ZS5uYW1lfWA7XG4gIH0gZWxzZSB7XG4gICAgbWlzc2lsZUxhdW5jaEJ0bi50ZXh0Q29udGVudCA9IFwiTGF1bmNoIG1pc3NpbGVzXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk6IG51bWJlciB7XG4gIGNvbnN0IHJlbWFpbmluZyA9IHN0YXRlUmVmLm5leHRNaXNzaWxlUmVhZHlBdCAtIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZVJlZik7XG4gIHJldHVybiByZW1haW5pbmcgPiAwID8gcmVtYWluaW5nIDogMDtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpOiB2b2lkIHtcbiAgY29uc3QgbWV0YSA9IHN0YXRlUmVmLndvcmxkTWV0YSA/PyB7fTtcbiAgY29uc3QgaGFzV2lkdGggPSB0eXBlb2YgbWV0YS53ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLncpO1xuICBjb25zdCBoYXNIZWlnaHQgPSB0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpO1xuICBjb25zdCBoYXNDID0gdHlwZW9mIG1ldGEuYyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5jKTtcblxuICBpZiAoaGFzV2lkdGgpIHtcbiAgICB3b3JsZC53ID0gbWV0YS53ITtcbiAgfVxuICBpZiAoaGFzSGVpZ2h0KSB7XG4gICAgd29ybGQuaCA9IG1ldGEuaCE7XG4gIH1cbiAgaWYgKENzcGFuKSB7XG4gICAgQ3NwYW4udGV4dENvbnRlbnQgPSBoYXNDID8gbWV0YS5jIS50b0ZpeGVkKDApIDogXCJcdTIwMTNcIjtcbiAgfVxuICBpZiAoV0hzcGFuKSB7XG4gICAgY29uc3QgdyA9IGhhc1dpZHRoID8gbWV0YS53ISA6IHdvcmxkLnc7XG4gICAgY29uc3QgaCA9IGhhc0hlaWdodCA/IG1ldGEuaCEgOiB3b3JsZC5oO1xuICAgIFdIc3Bhbi50ZXh0Q29udGVudCA9IGAke3cudG9GaXhlZCgwKX1cdTAwRDcke2gudG9GaXhlZCgwKX1gO1xuICB9XG4gIGlmIChIUHNwYW4pIHtcbiAgICBpZiAoc3RhdGVSZWYubWUgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXRlUmVmLm1lLmhwKSkge1xuICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlUmVmLm1lLmhwKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBIUHNwYW4udGV4dENvbnRlbnQgPSBcIlx1MjAxM1wiO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBsb29wKHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFjdikgcmV0dXJuO1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZSh0aW1lc3RhbXApKSB7XG4gICAgdGltZXN0YW1wID0gbGFzdExvb3BUcyA/PyAwO1xuICB9XG4gIGxldCBkdFNlY29uZHMgPSAwO1xuICBpZiAobGFzdExvb3BUcyAhPT0gbnVsbCkge1xuICAgIGR0U2Vjb25kcyA9ICh0aW1lc3RhbXAgLSBsYXN0TG9vcFRzKSAvIDEwMDA7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPCAwKSB7XG4gICAgICBkdFNlY29uZHMgPSAwO1xuICAgIH1cbiAgfVxuICBsYXN0TG9vcFRzID0gdGltZXN0YW1wO1xuICB1cGRhdGVMZWdEYXNoT2Zmc2V0cyhkdFNlY29uZHMpO1xuXG4gIGN0eC5jbGVhclJlY3QoMCwgMCwgY3Yud2lkdGgsIGN2LmhlaWdodCk7XG4gIGRyYXdHcmlkKCk7XG4gIGRyYXdSb3V0ZSgpO1xuICBkcmF3TWlzc2lsZVJvdXRlKCk7XG4gIGRyYXdNaXNzaWxlcygpO1xuXG4gIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuXG4gIGlmIChUc3Bhbikge1xuICAgIFRzcGFuLnRleHRDb250ZW50ID0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlUmVmKS50b0ZpeGVkKDIpO1xuICB9XG5cbiAgZm9yIChjb25zdCBnIG9mIHN0YXRlUmVmLmdob3N0cykge1xuICAgIGRyYXdTaGlwKGcueCwgZy55LCBnLnZ4LCBnLnZ5LCBcIiM5Y2EzYWZcIiwgZmFsc2UpO1xuICAgIGRyYXdHaG9zdERvdChnLngsIGcueSk7XG4gIH1cbiAgaWYgKHN0YXRlUmVmLm1lKSB7XG4gICAgZHJhd1NoaXAoc3RhdGVSZWYubWUueCwgc3RhdGVSZWYubWUueSwgc3RhdGVSZWYubWUudngsIHN0YXRlUmVmLm1lLnZ5LCBcIiMyMmQzZWVcIiwgdHJ1ZSk7XG4gIH1cbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGxvb3ApO1xufVxuIiwgImltcG9ydCB7IGNyZWF0ZUV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgeyBjb25uZWN0V2ViU29ja2V0IH0gZnJvbSBcIi4vbmV0XCI7XG5pbXBvcnQgeyBpbml0R2FtZSB9IGZyb20gXCIuL2dhbWVcIjtcbmltcG9ydCB7IGNyZWF0ZUluaXRpYWxTdGF0ZSwgY3JlYXRlSW5pdGlhbFVJU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZVwiO1xuXG4oZnVuY3Rpb24gYm9vdHN0cmFwKCkge1xuICBjb25zdCBxcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG4gIGNvbnN0IHJvb20gPSBxcy5nZXQoXCJyb29tXCIpIHx8IFwiZGVmYXVsdFwiO1xuICBjb25zdCByb29tTGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvb20tbmFtZVwiKTtcbiAgaWYgKHJvb21MYWJlbCkge1xuICAgIHJvb21MYWJlbC50ZXh0Q29udGVudCA9IHJvb207XG4gIH1cblxuICBjb25zdCBzdGF0ZSA9IGNyZWF0ZUluaXRpYWxTdGF0ZSgpO1xuICBjb25zdCB1aVN0YXRlID0gY3JlYXRlSW5pdGlhbFVJU3RhdGUoKTtcbiAgY29uc3QgYnVzID0gY3JlYXRlRXZlbnRCdXMoKTtcblxuICBjb25zdCBnYW1lID0gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH0pO1xuXG4gIGNvbm5lY3RXZWJTb2NrZXQoe1xuICAgIHJvb20sXG4gICAgc3RhdGUsXG4gICAgYnVzLFxuICAgIG9uU3RhdGVVcGRhdGVkOiAoKSA9PiB7XG4gICAgICBnYW1lLm9uU3RhdGVVcGRhdGVkKCk7XG4gICAgfSxcbiAgfSk7XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7O0FBcUNPLFdBQVMsaUJBQTJCO0FBQ3pDLFVBQU0sV0FBVyxvQkFBSSxJQUE2QjtBQUNsRCxXQUFPO0FBQUEsTUFDTCxHQUFHLE9BQU8sU0FBUztBQUNqQixZQUFJLE1BQU0sU0FBUyxJQUFJLEtBQUs7QUFDNUIsWUFBSSxDQUFDLEtBQUs7QUFDUixnQkFBTSxvQkFBSSxJQUFJO0FBQ2QsbUJBQVMsSUFBSSxPQUFPLEdBQUc7QUFBQSxRQUN6QjtBQUNBLFlBQUksSUFBSSxPQUFPO0FBQ2YsZUFBTyxNQUFNLDJCQUFLLE9BQU87QUFBQSxNQUMzQjtBQUFBLE1BQ0EsS0FBSyxPQUFpQixTQUFtQjtBQUN2QyxjQUFNLE1BQU0sU0FBUyxJQUFJLEtBQUs7QUFDOUIsWUFBSSxDQUFDLE9BQU8sSUFBSSxTQUFTLEVBQUc7QUFDNUIsbUJBQVcsTUFBTSxLQUFLO0FBQ3BCLGNBQUk7QUFDRixZQUFDLEdBQWlDLE9BQU87QUFBQSxVQUMzQyxTQUFTLEtBQUs7QUFDWixvQkFBUSxNQUFNLHFCQUFxQixLQUFLLFdBQVcsR0FBRztBQUFBLFVBQ3hEO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjs7O0FDM0RPLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sdUJBQXVCO0FBQzdCLE1BQU0sdUJBQXVCO0FBQzdCLE1BQU0saUNB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
