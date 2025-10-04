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
  const speedSlider = document.getElementById("speed-slider");
  const speedValue = document.getElementById("speed-value");
  const selectionPanel = document.getElementById("selection-panel");
  const selectionLabel = document.getElementById("selection-label");
  const deleteWaypointBtn = document.getElementById("delete-waypoint");
  const spawnBotBtn = document.getElementById("spawn-bot");
  const routeToggle = document.getElementById("toggle-route");
  const missileModeToggle = document.getElementById("toggle-missile-mode");
  const missileSpeedSlider = document.getElementById("missile-speed");
  const missileSpeedValue = document.getElementById("missile-speed-value");
  const missileAgroSlider = document.getElementById("missile-agro");
  const missileAgroValue = document.getElementById("missile-agro-value");
  const missileLifetimeValue = document.getElementById("missile-lifetime");
  const missileRouteSelect = document.getElementById("missile-route-select");
  const addMissileRouteBtn = document.getElementById("add-missile-route");
  const renameMissileRouteBtn = document.getElementById("rename-missile-route");
  const deleteMissileRouteBtn = document.getElementById("delete-missile-route");
  const missileRouteNameLabel = document.getElementById("missile-route-name");
  const missileRouteCountLabel = document.getElementById("missile-route-count");
  const launchMissileBtn = document.getElementById("launch-missile");
  const clearMissileWaypointsBtn = document.getElementById("clear-missile-waypoints");

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
        refreshSelectionUI();
      }
    };
  }
  connect();

  document.getElementById("join").addEventListener("click", () => {
    const name = document.getElementById("name").value.trim() || "Anon";
    ws?.send(JSON.stringify({ type: "join", name, room: ROOM }));
  });

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

  // Input: click to set waypoint
  cv.addEventListener("click", (e) => {
    const rect = cv.getBoundingClientRect();
    const scaleX = rect.width !== 0 ? cv.width / rect.width : 1;
    const scaleY = rect.height !== 0 ? cv.height / rect.height : 1;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const canvasPoint = { x, y };
    if (missileSetupMode) {
      const route = getActiveMissileRoute();
      if (!route) {
        return;
      }
      const wpWorld = canvasToWorld(canvasPoint);
      ws?.send(
        JSON.stringify({
          type: "add_missile_waypoint",
          route_id: route.id,
          x: wpWorld.x,
          y: wpWorld.y,
        })
      );
      route.waypoints = route.waypoints ? [...route.waypoints, { x: wpWorld.x, y: wpWorld.y }] : [{ x: wpWorld.x, y: wpWorld.y }];
      renderMissileRouteControls();
      return;
    }
    const hit = hitTestRoute(canvasPoint);
    if (hit) {
      if (
        hit.type === "leg" &&
        selection &&
        selection.type === "leg" &&
        selection.index === hit.index
      ) {
        setSelection(null);
      } else {
        setSelection(hit);
      }
      return;
    }
    const wp = canvasToWorld(canvasPoint);
    ws?.send(JSON.stringify({ type: "add_waypoint", x: wp.x, y: wp.y, speed: defaultSpeed }));
    if (state.me) {
      const wps = Array.isArray(state.me.waypoints) ? state.me.waypoints.slice() : [];
      wps.push({ x: wp.x, y: wp.y, speed: defaultSpeed });
      state.me.waypoints = wps;
      if (wps.length > 0) {
        setSelection({ type: "leg", index: wps.length - 1 });
        return;
      }
    }
    setSelection(null);
  });

  speedSlider?.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    updateSpeedLabel(value);
    defaultSpeed = value;
    if (selection && state.me && Array.isArray(state.me.waypoints) && state.me.waypoints[selection.index]) {
      ws?.send(JSON.stringify({ type: "update_waypoint", index: selection.index, speed: value }));
      state.me.waypoints[selection.index].speed = value;
      refreshSelectionUI();
    }
  });

  deleteWaypointBtn?.addEventListener("click", () => {
    if (missileSetupMode) {
      const route = getActiveMissileRoute();
      if (!route || !Array.isArray(route.waypoints) || route.waypoints.length === 0) {
        return;
      }
      const index = route.waypoints.length - 1;
      ws?.send(
        JSON.stringify({
          type: "delete_missile_waypoint",
          route_id: route.id,
          index,
        })
      );
      route.waypoints = route.waypoints.slice(0, index);
      renderMissileRouteControls();
      return;
    }
    if (!selection) return;
    ws?.send(JSON.stringify({ type: "delete_waypoint", index: selection.index }));
    if (state.me && Array.isArray(state.me.waypoints)) {
      state.me.waypoints = state.me.waypoints.slice(0, selection.index);
    }
    setSelection(null);
  });

  routeToggle?.addEventListener("change", (e) => {
    const checked = Boolean(e.target.checked);
    showRouteLines = checked;
    if (!checked) {
      setSelection(null);
    }
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
  let defaultSpeed = parseFloat(speedSlider?.value || "150");
  let showRouteLines = routeToggle ? routeToggle.checked : true;
  let lastLoopTs = null;
  let missileSetupMode = missileModeToggle ? missileModeToggle.checked : false;
  let lastMissileConfigSent = null;

  syncMissileUIFromState();

  missileModeToggle?.addEventListener("change", (e) => {
    missileSetupMode = Boolean(e.target.checked);
    if (missileSetupMode) {
      setSelection(null);
      refreshSelectionUI();
    }
    renderMissileRouteControls();
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

  missileRouteSelect?.addEventListener("change", (e) => {
    const routeId = e.target.value;
    if (!routeId) return;
    setActiveMissileRouteLocal(routeId);
    ws?.send(
      JSON.stringify({
        type: "set_active_missile_route",
        route_id: routeId,
      })
    );
  });

  addMissileRouteBtn?.addEventListener("click", () => {
    ws?.send(
      JSON.stringify({
        type: "add_missile_route",
      })
    );
  });

  renameMissileRouteBtn?.addEventListener("click", () => {
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
    renderMissileRouteControls();
    ws?.send(
      JSON.stringify({
        type: "delete_missile_route",
        route_id: route.id,
      })
    );
  });

  launchMissileBtn?.addEventListener("click", () => {
    if (launchMissileBtn.disabled) {
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
  });

  clearMissileWaypointsBtn?.addEventListener("click", () => {
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
    renderMissileRouteControls();
  });

  function updateSpeedLabel(v) {
    speedValue.textContent = Number(v).toFixed(0);
  }

  function setSliderValue(v) {
    if (!speedSlider) return;
    const str = typeof v === "number" ? v : parseFloat(v) || 0;
    speedSlider.value = String(str);
    updateSpeedLabel(str);
  }

  setSliderValue(defaultSpeed);
  if (selectionPanel) {
    selectionPanel.classList.add("hidden");
  }

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

    if (missileRouteSelect) {
      missileRouteSelect.innerHTML = "";
      if (routes.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No routes";
        missileRouteSelect.appendChild(option);
        missileRouteSelect.disabled = true;
      } else {
        missileRouteSelect.disabled = false;
      }
      routes.forEach((route) => {
        const option = document.createElement("option");
        option.value = route.id;
        option.textContent = route.name || route.id;
        if (route.id === state.activeMissileRouteId) {
          option.selected = true;
        }
        missileRouteSelect.appendChild(option);
      });
      if (routes.length > 0 && missileRouteSelect.value !== state.activeMissileRouteId) {
        missileRouteSelect.value = state.activeMissileRouteId;
      }
    }

    if (missileRouteNameLabel) {
      missileRouteNameLabel.textContent = activeRoute ? activeRoute.name : "–";
    }
    if (missileRouteCountLabel) {
      const count = activeRoute && Array.isArray(activeRoute.waypoints) ? activeRoute.waypoints.length : 0;
      missileRouteCountLabel.textContent = String(count);
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
    updateMissileLaunchButtonState();
  }

  function setActiveMissileRouteLocal(id) {
    state.activeMissileRouteId = id;
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
    if (!launchMissileBtn) return;
    const route = getActiveMissileRoute();
    const count = route && Array.isArray(route.waypoints) ? route.waypoints.length : 0;
    const remaining = getMissileCooldownRemaining();
    const coolingDown = remaining > 0.05;
    const shouldDisable = !route || count === 0 || coolingDown;
    launchMissileBtn.disabled = shouldDisable;

    if (!route) {
      launchMissileBtn.textContent = "Launch Missile";
      return;
    }

    if (coolingDown) {
      launchMissileBtn.textContent = `Launch in ${remaining.toFixed(1)}s`;
      return;
    }

    if (route.name) {
      launchMissileBtn.textContent = `Launch Missile (${route.name})`;
    } else {
      launchMissileBtn.textContent = "Launch Missile";
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
    if (missileLifetimeValue) {
      missileLifetimeValue.textContent = cfg.lifetime.toFixed(1);
    }
  }

  function syncMissileUIFromState() {
    ensureActiveMissileRoute();
    const cfg = state.missileConfig;
    applyMissileUI(cfg);
    renderMissileRouteControls();
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
    if (!showRouteLines || !state.me) {
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

  function refreshSelectionUI() {
    if (!selectionPanel) return;
    if (missileSetupMode) {
      selectionPanel.classList.add("hidden");
      return;
    }
    const wps = state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
    if (!selection || !state.me || selection.index < 0 || selection.index >= wps.length) {
      selection = null;
      selectionPanel.classList.add("hidden");
      setSliderValue(defaultSpeed);
      return;
    }
    const wp = wps[selection.index];
    const speed = wp && typeof wp.speed === "number" ? wp.speed : defaultSpeed;
    if (Math.abs(parseFloat(speedSlider.value) - speed) > 0.25) {
      setSliderValue(speed);
    } else {
      updateSpeedLabel(speed);
    }
    selectionPanel.classList.remove("hidden");
    const labelBase = selection.type === "leg" ? `Leg ${selection.index + 1}` : `Waypoint ${selection.index + 1}`;
    selectionLabel.textContent = `${labelBase} – ${speed.toFixed(0)} u/s`;
  }

  function setSelection(sel) {
    selection = sel;
    refreshSelectionUI();
  }

  function hitTestRoute(canvasPoint) {
    if (missileSetupMode) {
      return null;
    }
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
    if (!showRouteLines) {
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

    if (showRouteLines && legCount > 0) {
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

    if (showRouteLines && legCount > 0) {
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

    if (showRouteLines && selection && selection.index < legCount) {
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
    if (!missileSetupMode) return;
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
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#f87171";
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#7f1d1d";
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
