(() => {
  const qs = new URLSearchParams(location.search);
  const ROOM = qs.get("room") || "default";
  document.getElementById("room-name").textContent = ROOM;

  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");
  const Tspan = document.getElementById("t");
  const Cspan = document.getElementById("c");
  const WHspan = document.getElementById("wh");
  const HPspan = document.getElementById("ship-hp");
  const shipControlsCard = document.getElementById("ship-controls");
  const shipClearBtn = document.getElementById("ship-clear");
  const shipSetBtn = document.getElementById("ship-set");
  const shipSelectBtn = document.getElementById("ship-select");
  const shipToggleRouteBtn = document.getElementById("ship-toggle-route");
  const shipSelectionContainer = document.getElementById("ship-selection");
  const shipSelectionLabel = document.getElementById("ship-selection-label");
  const shipDeleteBtn = document.getElementById("ship-delete");
  const shipSpeedCard = document.getElementById("ship-speed-card");
  const shipSpeedSlider = document.getElementById("ship-speed-slider");
  const shipSpeedValue = document.getElementById("ship-speed-value");

  const missileControlsCard = document.getElementById("missile-controls");
  const missileAddRouteBtn = document.getElementById("missile-add-route");
  const missileLaunchBtn = document.getElementById("missile-launch");
  const missileSetBtn = document.getElementById("missile-set");
  const missileSelectBtn = document.getElementById("missile-select");
  const missileDeleteBtn = document.getElementById("missile-delete");
  const missileSpeedCard = document.getElementById("missile-speed-card");
  const missileSpeedSlider = document.getElementById("missile-speed-slider");
  const missileSpeedValue = document.getElementById("missile-speed-value");

  const missileAgroCard = document.getElementById("missile-agro-card");
  const missileAgroSlider = document.getElementById("missile-agro-slider");
  const missileAgroValue = document.getElementById("missile-agro-value");

  const spawnBotBtn = document.getElementById("spawn-bot");
  const shipShowRouteBtn = shipToggleRouteBtn;

  const routePrevBtn = document.getElementById("route-prev");
  const routeNextBtn = document.getElementById("route-next");
  const routeMenuToggle = document.getElementById("route-menu-toggle");
  const routeMenu = document.getElementById("route-menu");
  const renameMissileRouteBtn = document.getElementById("rename-missile-route");
  const deleteMissileRouteBtn = document.getElementById("delete-missile-route");
  const clearMissileWaypointsBtn = document.getElementById("clear-missile-waypoints");
  const missileRouteNameLabel = document.getElementById("missile-route-name");
  const missileRouteCountLabel = document.getElementById("missile-route-count");

  const helpToggle = document.getElementById("help-toggle");
  const helpOverlay = document.getElementById("help-overlay");
  const helpCloseBtn = document.getElementById("help-close");
  const helpText = document.getElementById("help-text");

  const MISSILE_MIN_SPEED = 40;
  const MISSILE_MAX_SPEED = 250;
  const MISSILE_MIN_AGRO = 100;
  const MISSILE_MAX_LIFETIME = 120;
  const MISSILE_MIN_LIFETIME = 20;
  const MISSILE_LIFETIME_SPEED_PENALTY = 80;
  const MISSILE_LIFETIME_AGRO_PENALTY = 40;
  const MISSILE_LIFETIME_AGRO_REF = 2000;

  let missileLimits = {
    speedMin: MISSILE_MIN_SPEED,
    speedMax: MISSILE_MAX_SPEED,
    agroMin: MISSILE_MIN_AGRO,
  };

  const uiState = {
    inputContext: "ship",
    shipTool: "set",
    missileTool: "set",
    showShipRoute: true,
    helpVisible: false,
  };

  const HELP_TEXT = [
    "Primary Modes",
    "  1 – Toggle ship navigation mode",
    "  2 – Toggle missile coordination mode",
    "",
    "Ship Navigation",
    "  T – Switch between set/select",
    "  C – Clear all waypoints",
    "  R – Toggle show route",
    "  [ / ] – Adjust waypoint speed",
    "  Shift+[ / ] – Coarse speed adjust",
    "  Tab / Shift+Tab – Cycle waypoints",
    "  Delete – Delete from selected waypoint",
    "",
    "Missile Coordination",
    "  N – Add new missile route",
    "  L – Launch missiles",
    "  E – Switch between set/select",
    "  , / . – Adjust agro radius",
    "  ; / ' – Adjust missile speed",
    "  Shift+slider keys – Coarse adjust",
    "  Delete – Delete selected missile waypoint",
    "",
    "General",
    "  ? – Toggle this overlay",
    "  Esc – Cancel selection or close overlay",
  ].join("\n");

  let ws;
  function connect() {
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws?room=" + encodeURIComponent(ROOM));
    ws.onopen = () => console.log("[ws] open");
    ws.onclose = () => console.log("[ws] close");
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") {
        state.now = msg.now;
        state.nowSyncedAt = monotonicNow();
        state.nextMissileReadyAt = Number.isFinite(msg.next_missile_ready) ? msg.next_missile_ready : 0;
        state.me = msg.me || null;
        if (state.me) {
          state.me.waypoints = Array.isArray(msg.me.waypoints) ? msg.me.waypoints : [];
        }
        state.ghosts = msg.ghosts || [];
        state.missiles = Array.isArray(msg.missiles) ? msg.missiles : [];
        const routesFromServer = Array.isArray(msg.missile_routes) ? msg.missile_routes : [];
        state.missileRoutes = routesFromServer.map((route) => ({
          id: route.id,
          name: route.name || route.id || "Route",
          waypoints: Array.isArray(route.waypoints)
            ? route.waypoints.map((wp) => ({ x: wp.x, y: wp.y }))
            : [],
        }));
        if (typeof msg.active_missile_route === "string" && msg.active_missile_route.length > 0) {
          state.activeMissileRouteId = msg.active_missile_route;
        } else if (!state.activeMissileRouteId && state.missileRoutes.length > 0) {
          state.activeMissileRouteId = state.missileRoutes[0].id;
        }
        if (msg.missile_config) {
          missileLimits = {
            speedMin: Number.isFinite(msg.missile_config.speed_min) ? msg.missile_config.speed_min : MISSILE_MIN_SPEED,
            speedMax: Number.isFinite(msg.missile_config.speed_max) ? msg.missile_config.speed_max : MISSILE_MAX_SPEED,
            agroMin: Number.isFinite(msg.missile_config.agro_min) ? msg.missile_config.agro_min : MISSILE_MIN_AGRO,
          };
          state.missileLimits = missileLimits;
          const cfg = SanitizeMissileConfigJS(
            {
              speed: msg.missile_config.speed,
              agroRadius: msg.missile_config.agro_radius,
            },
            state.missileConfig,
            missileLimits
          );
          if (Number.isFinite(msg.missile_config.lifetime)) {
            cfg.lifetime = msg.missile_config.lifetime;
          }
          state.missileConfig = cfg;
        }
        syncMissileUIFromState();
        Cspan.textContent = msg.meta?.c?.toFixed(0) ?? "–";
        WHspan.textContent = `${(msg.meta?.w ?? 0).toFixed(0)}×${(msg.meta?.h ?? 0).toFixed(0)}`;
        if (HPspan) {
          if (state.me && Number.isFinite(state.me.hp)) {
            HPspan.textContent = Number(state.me.hp).toString();
          } else {
            HPspan.textContent = "–";
          }
        }
        refreshShipSelectionUI();
      }
    };
  }
  connect();

  // World → canvas transform (simple letterbox fit)
  const world = { w: 8000, h: 4500 }; // synced from server meta after first state
  function worldToCanvas(p) {
    const sx = cv.width / world.w;
    const sy = cv.height / world.h;
    return { x: p.x * sx, y: p.y * sy };
  }
  function canvasToWorld(p) {
    const sx = world.w / cv.width;
    const sy = world.h / cv.height;
    return { x: p.x * sx, y: p.y * sy };
  }

  // Input: pointer interactions for ship/missile planning
  cv.addEventListener("pointerdown", (e) => {
    if (helpOverlay?.classList.contains("visible")) {
      return;
    }
    const rect = cv.getBoundingClientRect();
    const scaleX = rect.width !== 0 ? cv.width / rect.width : 1;
    const scaleY = rect.height !== 0 ? cv.height / rect.height : 1;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const canvasPoint = { x, y };
    const worldPoint = canvasToWorld(canvasPoint);

    const context = uiState.inputContext === "missile" ? "missile" : "ship";
    if (context === "missile") {
      handleMissilePointer(canvasPoint, worldPoint);
    } else {
      handleShipPointer(canvasPoint, worldPoint);
    }
    e.preventDefault();
  });

  spawnBotBtn?.addEventListener("click", () => {
    ws?.send(
      JSON.stringify({
        type: "spawn_bot",
      })
    );
  });

  const state = {
    now: 0,
    nowSyncedAt: (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now(),
    me: null,
    ghosts: [],
    missiles: [],
    missileRoutes: [],
    activeMissileRouteId: null,
    nextMissileReadyAt: 0,
    missileConfig: {
      speed: 180,
      agroRadius: 800,
      lifetime: missileLifetimeFor(180, 800, missileLimits),
    },
    missileLimits,
  };

  const legDashOffsets = new Map();

  let selection = null; // { type: "waypoint" | "leg", index: number }
  let missileSelection = null; // { type: "waypoint", index: number }
  let defaultSpeed = parseFloat(shipSpeedSlider?.value || "150");
  let lastLoopTs = null;
  let lastMissileConfigSent = null;

  syncMissileUIFromState();
  updateControlHighlights();
  refreshShipSelectionUI();
  refreshMissileSelectionUI();
  updateHelpOverlay();

  shipClearBtn?.addEventListener("click", () => {
    setInputContext("ship");
    clearShipRoute();
  });

  shipSetBtn?.addEventListener("click", () => {
    setShipTool("set");
  });

  shipSelectBtn?.addEventListener("click", () => {
    setShipTool("select");
  });

  shipShowRouteBtn?.addEventListener("click", () => {
    uiState.showShipRoute = !uiState.showShipRoute;
    updateControlHighlights();
  });

  shipSpeedSlider?.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    if (!Number.isFinite(value)) return;
    updateSpeedLabel(value);
    defaultSpeed = value;
    if (selection && state.me && Array.isArray(state.me.waypoints) && state.me.waypoints[selection.index]) {
      ws?.send(JSON.stringify({ type: "update_waypoint", index: selection.index, speed: value }));
      state.me.waypoints[selection.index].speed = value;
      refreshShipSelectionUI();
    }
  });

  shipDeleteBtn?.addEventListener("click", () => {
    setInputContext("ship");
    deleteSelectedShipWaypoint();
  });

  missileAddRouteBtn?.addEventListener("click", () => {
    setInputContext("missile");
    ws?.send(
      JSON.stringify({
        type: "add_missile_route",
      })
    );
  });

  missileLaunchBtn?.addEventListener("click", () => {
    setInputContext("missile");
    launchActiveMissileRoute();
  });

  missileSetBtn?.addEventListener("click", () => {
    setMissileTool("set");
  });

  missileSelectBtn?.addEventListener("click", () => {
    setMissileTool("select");
  });

  missileDeleteBtn?.addEventListener("click", () => {
    setInputContext("missile");
    deleteSelectedMissileWaypoint();
  });

  missileSpeedSlider?.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    if (!Number.isFinite(value)) return;
    updateMissileConfigFromUI({ speed: value });
  });

  missileAgroSlider?.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    if (!Number.isFinite(value)) return;
    updateMissileConfigFromUI({ agroRadius: value });
  });

  routePrevBtn?.addEventListener("click", () => cycleMissileRoute(-1));
  routeNextBtn?.addEventListener("click", () => cycleMissileRoute(1));

  routeMenuToggle?.addEventListener("click", () => {
    routeMenu?.classList.toggle("visible");
  });

  document.addEventListener("click", (event) => {
    if (!routeMenu || !routeMenu.classList.contains("visible")) return;
    if (event.target === routeMenuToggle) return;
    if (routeMenu.contains(event.target)) return;
    routeMenu.classList.remove("visible");
  });

  renameMissileRouteBtn?.addEventListener("click", () => {
    routeMenu?.classList.remove("visible");
    const route = getActiveMissileRoute();
    if (!route) return;
    const name = window.prompt("Rename route", route.name || "");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    route.name = trimmed;
    renderMissileRouteControls();
    ws?.send(
      JSON.stringify({
        type: "rename_missile_route",
        route_id: route.id,
        route_name: trimmed,
      })
    );
  });

  deleteMissileRouteBtn?.addEventListener("click", () => {
    routeMenu?.classList.remove("visible");
    const route = getActiveMissileRoute();
    if (!route) return;
    if (!window.confirm(`Delete ${route.name}?`)) return;
    const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
    if (routes.length <= 1) {
      route.waypoints = [];
    } else {
      state.missileRoutes = routes.filter((r) => r.id !== route.id);
      const remaining = state.missileRoutes;
      state.activeMissileRouteId = remaining.length > 0 ? remaining[0].id : null;
    }
    missileSelection = null;
    renderMissileRouteControls();
    refreshMissileSelectionUI();
    ws?.send(
      JSON.stringify({
        type: "delete_missile_route",
        route_id: route.id,
      })
    );
  });

  clearMissileWaypointsBtn?.addEventListener("click", () => {
    routeMenu?.classList.remove("visible");
    const route = getActiveMissileRoute();
    if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
      return;
    }
    ws?.send(
      JSON.stringify({
        type: "clear_missile_route",
        route_id: route.id,
      })
    );
    route.waypoints = [];
    missileSelection = null;
    renderMissileRouteControls();
    refreshMissileSelectionUI();
  });

  helpToggle?.addEventListener("click", () => {
    setHelpVisible(true);
  });

  helpCloseBtn?.addEventListener("click", () => {
    setHelpVisible(false);
  });

  function updateSpeedLabel(v) {
    if (shipSpeedValue) {
      shipSpeedValue.textContent = Number(v).toFixed(0);
    }
  }

  function setShipSliderValue(v) {
    if (!shipSpeedSlider) return;
    const str = typeof v === "number" ? v : parseFloat(v) || 0;
    shipSpeedSlider.value = String(str);
    updateSpeedLabel(str);
  }

  setShipSliderValue(defaultSpeed);

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function ensureActiveMissileRoute() {
    const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
    if (routes.length === 0) {
      state.activeMissileRouteId = null;
      return null;
    }
    if (!state.activeMissileRouteId || !routes.some((route) => route.id === state.activeMissileRouteId)) {
      state.activeMissileRouteId = routes[0].id;
    }
    return routes.find((route) => route.id === state.activeMissileRouteId) || null;
  }

  function getActiveMissileRoute() {
    return ensureActiveMissileRoute();
  }

  function renderMissileRouteControls() {
    const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
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

  function setActiveMissileRouteLocal(id) {
    state.activeMissileRouteId = id;
    missileSelection = null;
    renderMissileRouteControls();
  }

  function monotonicNow() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  function getApproxServerNow() {
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
    return state.now + elapsedMs / 1000;
  }

  function getMissileCooldownRemaining() {
    const target = Number.isFinite(state.nextMissileReadyAt) ? state.nextMissileReadyAt : 0;
    const remaining = target - getApproxServerNow();
    return remaining > 0 ? remaining : 0;
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

  function missileLifetimeFor(speed, agroRadius, limits = missileLimits) {
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

  function SanitizeMissileConfigJS(cfg, fallback = state.missileConfig, limits = missileLimits) {
    const base = fallback || {};
    const range = limits || {};
    const minSpeed = Number.isFinite(range.speedMin) ? range.speedMin : MISSILE_MIN_SPEED;
    const maxSpeed = Number.isFinite(range.speedMax) ? range.speedMax : MISSILE_MAX_SPEED;
    const out = { ...base, ...cfg };
    const speedSource = Number.isFinite(out.speed) ? out.speed : base.speed ?? minSpeed;
    out.speed = clamp(speedSource, minSpeed, maxSpeed);
    const minAgro = Number.isFinite(range.agroMin) ? range.agroMin : MISSILE_MIN_AGRO;
    const agroSource = Number.isFinite(out.agroRadius) ? out.agroRadius : base.agroRadius ?? minAgro;
    out.agroRadius = Math.max(minAgro, agroSource);
    out.lifetime = missileLifetimeFor(out.speed, out.agroRadius, range);
    return out;
  }

  function applyMissileUI(cfg) {
    if (missileSpeedSlider) {
      const minSpeed = state.missileLimits?.speedMin ?? MISSILE_MIN_SPEED;
      const maxSpeed = state.missileLimits?.speedMax ?? MISSILE_MAX_SPEED;
      missileSpeedSlider.min = String(minSpeed);
      missileSpeedSlider.max = String(maxSpeed);
      missileSpeedSlider.value = cfg.speed.toFixed(0);
    }
    if (missileSpeedValue) {
      missileSpeedValue.textContent = cfg.speed.toFixed(0);
    }
    if (missileAgroSlider) {
      const minAgro = state.missileLimits?.agroMin ?? MISSILE_MIN_AGRO;
      const maxAgro = Math.max(5000, Math.ceil((cfg.agroRadius + 500) / 500) * 500);
      missileAgroSlider.min = String(minAgro);
      missileAgroSlider.max = String(maxAgro);
      missileAgroSlider.value = cfg.agroRadius.toFixed(0);
    }
    if (missileAgroValue) {
      missileAgroValue.textContent = cfg.agroRadius.toFixed(0);
    }
    // Lifetime is derived for gameplay, keep available in state for tooltips if needed.
  }

  function syncMissileUIFromState() {
    ensureActiveMissileRoute();
    const activeRoute = getActiveMissileRoute();
    const routeHasSelection =
      activeRoute &&
      Array.isArray(activeRoute.waypoints) &&
      missileSelection &&
      missileSelection.index >= 0 &&
      missileSelection.index < activeRoute.waypoints.length;
    if (!routeHasSelection) {
      missileSelection = null;
    }
    const cfg = state.missileConfig;
    applyMissileUI(cfg);
    renderMissileRouteControls();
    refreshMissileSelectionUI();
  }

  function sendMissileConfig(cfg) {
    lastMissileConfigSent = {
      speed: cfg.speed,
      agroRadius: cfg.agroRadius,
    };
    ws?.send(
      JSON.stringify({
        type: "configure_missile",
        missile_speed: cfg.speed,
        missile_agro: cfg.agroRadius,
      })
    );
  }

  function updateMissileConfigFromUI(overrides = {}) {
    const current = state.missileConfig;
    const cfg = SanitizeMissileConfigJS(
      {
        speed: overrides.speed ?? current.speed,
        agroRadius: overrides.agroRadius ?? current.agroRadius,
      },
      current,
      missileLimits
    );
    state.missileConfig = cfg;
    applyMissileUI(cfg);
    const last = lastMissileConfigSent;
    const needsSend =
      !last ||
      Math.abs(last.speed - cfg.speed) > 0.25 ||
      Math.abs((last.agroRadius ?? 0) - cfg.agroRadius) > 5;
    if (needsSend) {
      sendMissileConfig(cfg);
    }
    renderMissileRouteControls();
  }

  function computeRoutePoints() {
    if (!state.me) return null;
    const wps = Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
    const worldPoints = [{ x: state.me.x, y: state.me.y }];
    for (const wp of wps) {
      worldPoints.push({ x: wp.x, y: wp.y });
    }
    const canvasPoints = worldPoints.map((p) => worldToCanvas(p));
    return { waypoints: wps, worldPoints, canvasPoints };
  }

  function computeMissileRoutePoints() {
    if (!state.me) return null;
    const route = getActiveMissileRoute();
    const wps = route && Array.isArray(route.waypoints) ? route.waypoints : [];
    const worldPoints = [{ x: state.me.x, y: state.me.y }];
    for (const wp of wps) {
      worldPoints.push({ x: wp.x, y: wp.y });
    }
    const canvasPoints = worldPoints.map((p) => worldToCanvas(p));
    return { waypoints: wps, worldPoints, canvasPoints };
  }

  function updateLegDashOffsets(dtSeconds) {
    if (!uiState.showShipRoute || !state.me) {
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
      let next = (legDashOffsets.get(i) ?? 0) - dashSpeed * dtSeconds;
      if (!Number.isFinite(next)) {
        next = 0;
      } else {
        next = ((next % cycle) + cycle) % cycle;
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

  function refreshShipSelectionUI() {
    if (!shipSelectionContainer || !shipSelectionLabel || !shipDeleteBtn) {
      return;
    }
    const wps = state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
    const hasValidSelection = Boolean(selection) && selection.index >= 0 && selection.index < wps.length;
    const isShipContext = uiState.inputContext === "ship";

    shipSelectionContainer.style.display = "flex";
    shipSelectionContainer.style.opacity = isShipContext ? "1" : "0.6";

    if (!state.me || !hasValidSelection) {
      shipSelectionLabel.textContent = "";
      shipDeleteBtn.disabled = true;
      if (isShipContext) {
        setShipSliderValue(defaultSpeed);
      }
      return;
    }

    const wp = wps[selection.index];
    const speed = wp && typeof wp.speed === "number" ? wp.speed : defaultSpeed;
    if (isShipContext && shipSpeedSlider && Math.abs(parseFloat(shipSpeedSlider.value) - speed) > 0.25) {
      setShipSliderValue(speed);
    } else {
      updateSpeedLabel(speed);
    }
    const displayIndex = selection.index + 1;
    shipSelectionLabel.textContent = `${displayIndex} — ${speed.toFixed(0)} u/s`;
    shipDeleteBtn.disabled = !isShipContext;
  }

  function refreshMissileSelectionUI() {
    if (!missileDeleteBtn) return;
    const route = getActiveMissileRoute();
    const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
    const hasSelection = Boolean(missileSelection) && missileSelection.index >= 0 && missileSelection.index < count;
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
    if (!uiState.showShipRoute) {
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

  function handleShipPointer(canvasPoint, worldPoint) {
    if (!state.me) return;
    if (uiState.shipTool === "select") {
      const hit = hitTestRoute(canvasPoint);
      setSelection(hit || null);
      return;
    }

    const wp = { x: worldPoint.x, y: worldPoint.y, speed: defaultSpeed };
    ws?.send(JSON.stringify({ type: "add_waypoint", x: wp.x, y: wp.y, speed: defaultSpeed }));
    const wps = Array.isArray(state.me.waypoints) ? state.me.waypoints.slice() : [];
    wps.push(wp);
    state.me.waypoints = wps;
    if (wps.length > 0) {
      setSelection({ type: "leg", index: wps.length - 1 });
    }
  }

  function handleMissilePointer(canvasPoint, worldPoint) {
    const route = getActiveMissileRoute();
    if (!route) return;

    if (uiState.missileTool === "select") {
      const hit = hitTestMissileRoute(canvasPoint);
      setMissileSelection(hit);
      return;
    }

    const wp = { x: worldPoint.x, y: worldPoint.y };
    ws?.send(
      JSON.stringify({
        type: "add_missile_waypoint",
        route_id: route.id,
        x: wp.x,
        y: wp.y,
      })
    );
    route.waypoints = route.waypoints ? [...route.waypoints, wp] : [wp];
    renderMissileRouteControls();
    setMissileSelection({ type: "waypoint", index: route.waypoints.length - 1 });
  }

  function clearShipRoute() {
    const wps = state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
    if (!wps || wps.length === 0) {
      return;
    }
    ws?.send(JSON.stringify({ type: "clear_waypoints" }));
    state.me.waypoints = [];
    setSelection(null);
  }

  function deleteSelectedShipWaypoint() {
    if (!selection) return;
    ws?.send(JSON.stringify({ type: "delete_waypoint", index: selection.index }));
    if (state.me && Array.isArray(state.me.waypoints)) {
      state.me.waypoints = state.me.waypoints.slice(0, selection.index);
    }
    setSelection(null);
  }

  function deleteSelectedMissileWaypoint() {
    const route = getActiveMissileRoute();
    if (!route || !missileSelection) return;
    const index = missileSelection.index;
    if (!Array.isArray(route.waypoints) || index < 0 || index >= route.waypoints.length) {
      return;
    }
    ws?.send(
      JSON.stringify({
        type: "delete_missile_waypoint",
        route_id: route.id,
        index,
      })
    );
    route.waypoints = [...route.waypoints.slice(0, index), ...route.waypoints.slice(index + 1)];
    setMissileSelection(null);
    renderMissileRouteControls();
  }

  function launchActiveMissileRoute() {
    if (missileLaunchBtn?.disabled) {
      return;
    }
    const route = getActiveMissileRoute();
    if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
      return;
    }
    ws?.send(
      JSON.stringify({
        type: "launch_missile",
        route_id: route.id,
      })
    );
  }

  function cycleMissileRoute(direction) {
    const routes = Array.isArray(state.missileRoutes) ? state.missileRoutes : [];
    if (routes.length === 0) {
      return;
    }
    const currentIndex = routes.findIndex((route) => route.id === state.activeMissileRouteId);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = ((baseIndex + direction) % routes.length + routes.length) % routes.length;
    const nextRoute = routes[nextIndex];
    if (!nextRoute) return;
    state.activeMissileRouteId = nextRoute.id;
    setMissileSelection(null);
    renderMissileRouteControls();
    ws?.send(
      JSON.stringify({
        type: "set_active_missile_route",
        route_id: nextRoute.id,
      })
    );
  }

  function cycleShipSelection(direction) {
    const wps = state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
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
    if (uiState.inputContext === next) {
      return;
    }
    uiState.inputContext = next;
    updateControlHighlights();
    refreshShipSelectionUI();
    refreshMissileSelectionUI();
  }

  function setShipTool(tool) {
    if (tool !== "set" && tool !== "select") {
      return;
    }
    if (uiState.shipTool === tool) {
      setInputContext("ship");
      return;
    }
    uiState.shipTool = tool;
    setInputContext("ship");
    updateControlHighlights();
  }

  function setMissileTool(tool) {
    if (tool !== "set" && tool !== "select") {
      return;
    }
    if (uiState.missileTool === tool) {
      setInputContext("missile");
      return;
    }
    uiState.missileTool = tool;
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
    setButtonState(shipSetBtn, uiState.shipTool === "set");
    setButtonState(shipSelectBtn, uiState.shipTool === "select");
    setButtonState(shipShowRouteBtn, uiState.showShipRoute);
    setButtonState(missileSetBtn, uiState.missileTool === "set");
    setButtonState(missileSelectBtn, uiState.missileTool === "select");

    if (shipControlsCard) {
      shipControlsCard.classList.toggle("active", uiState.inputContext === "ship");
    }
    if (missileControlsCard) {
      missileControlsCard.classList.toggle("active", uiState.inputContext === "missile");
    }
  }

  function setHelpVisible(flag) {
    uiState.helpVisible = Boolean(flag);
    updateHelpOverlay();
  }

  function updateHelpOverlay() {
    if (!helpOverlay) return;
    if (helpText) {
      helpText.textContent = HELP_TEXT;
    }
    helpOverlay.classList.toggle("visible", uiState.helpVisible);
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

  window.addEventListener("keydown", (event) => {
    const target = document.activeElement;
    const isEditable =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

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
        setInputContext("ship");
        event.preventDefault();
        return;
      case "Digit2":
        setInputContext("missile");
        event.preventDefault();
        return;
      case "KeyT":
        setShipTool(uiState.shipTool === "set" ? "select" : "set");
        event.preventDefault();
        return;
      case "KeyC":
        setInputContext("ship");
        clearShipRoute();
        event.preventDefault();
        return;
      case "KeyR":
        uiState.showShipRoute = !uiState.showShipRoute;
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
        missileAddRouteBtn?.click();
        event.preventDefault();
        return;
      case "KeyL":
        setInputContext("missile");
        launchActiveMissileRoute();
        event.preventDefault();
        return;
      case "KeyE":
        setMissileTool(uiState.missileTool === "set" ? "select" : "set");
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
        if (uiState.inputContext === "missile" && missileSelection) {
          deleteSelectedMissileWaypoint();
        } else if (selection) {
          deleteSelectedShipWaypoint();
        }
        event.preventDefault();
        return;
      case "Escape":
        if (uiState.helpVisible) {
          setHelpVisible(false);
        } else if (missileSelection) {
          setMissileSelection(null);
        } else if (selection) {
          setSelection(null);
        } else if (uiState.inputContext === "missile") {
          setInputContext("ship");
        }
        event.preventDefault();
        return;
      default:
        break;
    }

    if (event.key === "?") {
      setHelpVisible(!uiState.helpVisible);
      event.preventDefault();
    }
  });

  function drawShip(x, y, vx, vy, color, filled) {
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
      ctx.fillStyle = color + "cc";
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawRetardedDot(x, y) {
    const p = worldToCanvas({ x, y });
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ccccccaa";
    ctx.fill();
  }

  function drawRoute() {
    if (!state.me) return;
    const route = computeRoutePoints();
    if (!route || route.waypoints.length === 0) return;
    const { canvasPoints } = route;
    const legCount = canvasPoints.length - 1;

    if (uiState.showShipRoute && legCount > 0) {
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#38bdf866";
      for (let i = 0; i < legCount; i++) {
        ctx.beginPath();
        ctx.moveTo(canvasPoints[i].x, canvasPoints[i].y);
        ctx.lineTo(canvasPoints[i + 1].x, canvasPoints[i + 1].y);
        ctx.lineDashOffset = legDashOffsets.get(i) ?? 0;
        ctx.stroke();
      }
      ctx.restore();
    }

    if (uiState.showShipRoute && legCount > 0) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
      ctx.lineTo(canvasPoints[1].x, canvasPoints[1].y);
      ctx.lineDashOffset = legDashOffsets.get(0) ?? 0;
      ctx.stroke();
      ctx.restore();
    }

    if (uiState.showShipRoute && selection && selection.index < legCount) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(canvasPoints[selection.index].x, canvasPoints[selection.index].y);
      ctx.lineTo(canvasPoints[selection.index + 1].x, canvasPoints[selection.index + 1].y);
      ctx.lineDashOffset = legDashOffsets.get(selection.index) ?? 0;
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
    if (!state.me) return;
    if (uiState.inputContext !== "missile") return;
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
    if (!state.missiles || state.missiles.length === 0) return;
    const scaleX = cv.width / world.w;
    const scaleY = cv.height / world.h;
    const radiusScale = (scaleX + scaleY) / 2;
    for (const miss of state.missiles) {
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
    ctx.save();
    ctx.strokeStyle = "#234";
    ctx.lineWidth = 1;
    const step = 1000;
    for (let x = 0; x <= world.w; x += step) {
      const a = worldToCanvas({ x, y: 0 });
      const b = worldToCanvas({ x, y: world.h });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let y = 0; y <= world.h; y += step) {
      const a = worldToCanvas({ x: 0, y });
      const b = worldToCanvas({ x: world.w, y });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  function loop(ts) {
    if (!Number.isFinite(ts)) {
      ts = lastLoopTs ?? 0;
    }
    let dtSeconds = 0;
    if (lastLoopTs !== null) {
      dtSeconds = (ts - lastLoopTs) / 1000;
      if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
        dtSeconds = 0;
      }
    }
    lastLoopTs = ts;
    updateLegDashOffsets(dtSeconds);

    ctx.clearRect(0, 0, cv.width, cv.height);
    drawGrid();
    drawRoute();
    drawMissileRoute();
    drawMissiles();

    updateMissileLaunchButtonState();

    Tspan.textContent = getApproxServerNow().toFixed(2);

    // Opponents (retarded snapshots)
    for (const g of state.ghosts) {
      drawShip(g.x, g.y, g.vx, g.vy, "#9ca3af", false);
      drawRetardedDot(g.x, g.y);
    }
    // Me (true now)
    if (state.me) {
      drawShip(state.me.x, state.me.y, state.me.vx, state.me.vy, "#22d3ee", true);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
