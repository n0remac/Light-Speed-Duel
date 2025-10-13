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

  // web/src/route.ts
  var WAYPOINT_HIT_RADIUS = 12;
  var LEG_HIT_DISTANCE = 10;
  function buildRoutePoints(start, waypoints, world2, camera, zoom, worldToCanvas2) {
    const worldPoints = [{ x: start.x, y: start.y }];
    for (const wp of waypoints) {
      worldPoints.push({ x: wp.x, y: wp.y });
    }
    const canvasPoints = worldPoints.map((point) => worldToCanvas2(point));
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
    var _a, _b;
    const result = {
      heatAtWaypoints: [],
      willOverheat: false
    };
    if (route.length === 0) {
      return result;
    }
    let heat = clamp(initialHeat, 0, params.max);
    let pos = { x: route[0].x, y: route[0].y };
    let currentSpeed = (_a = route[0].speed) != null ? _a : params.markerSpeed;
    result.heatAtWaypoints.push(heat);
    for (let i = 1; i < route.length; i++) {
      const targetPos = route[i];
      const targetSpeed = (_b = targetPos.speed) != null ? _b : params.markerSpeed;
      const dx = targetPos.x - pos.x;
      const dy = targetPos.y - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 1e-3) {
        result.heatAtWaypoints.push(heat);
        continue;
      }
      const avgSpeed = (currentSpeed + targetSpeed) * 0.5;
      const segmentTime = distance / Math.max(avgSpeed, 1);
      const Vn = Math.max(params.markerSpeed, 1e-6);
      const dev = avgSpeed - params.markerSpeed;
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
      pos = { x: targetPos.x, y: targetPos.y };
      currentSpeed = targetSpeed;
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
  function drawPlannedRoute(ctx2, opts) {
    var _a, _b;
    const {
      routePoints,
      selection: selection2,
      draggedWaypoint: draggedWaypoint2,
      dashStore,
      palette = SHIP_PALETTE,
      showLegs,
      heatParams,
      initialHeat = 0,
      defaultSpeed: defaultSpeed2,
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
          speed: i === 0 ? void 0 : (_b2 = (_a2 = waypoints[i - 1]) == null ? void 0 : _a2.speed) != null ? _b2 : defaultSpeed2
        };
      });
      heatProjection = projectRouteHeat(routeForHeat, initialHeat, heatParams);
    }
    if (showLegs) {
      let currentHeat = initialHeat;
      for (let i = 0; i < waypoints.length; i++) {
        const isFirstLeg = i === 0;
        const isSelected = (selection2 == null ? void 0 : selection2.type) === "leg" && selection2.index === i;
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
        ctx2.save();
        if (lineDash) {
          ctx2.setLineDash(lineDash);
        }
        if (alphaOverride !== null) {
          ctx2.globalAlpha = alphaOverride;
        }
        ctx2.strokeStyle = strokeStyle;
        ctx2.lineWidth = lineWidth;
        ctx2.beginPath();
        ctx2.lineDashOffset = (_a = dashStore.get(i)) != null ? _a : 0;
        ctx2.moveTo(canvasPoints[i].x, canvasPoints[i].y);
        ctx2.lineTo(canvasPoints[i + 1].x, canvasPoints[i + 1].y);
        ctx2.stroke();
        ctx2.restore();
        currentHeat = segmentHeat;
      }
    }
    for (let i = 0; i < waypoints.length; i++) {
      const pt = canvasPoints[i + 1];
      const isSelected = (selection2 == null ? void 0 : selection2.type) === "waypoint" && selection2.index === i;
      const isDragging = draggedWaypoint2 === i;
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
      ctx2.save();
      ctx2.beginPath();
      const radius = isSelected || isDragging ? 7 : 5;
      ctx2.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx2.fillStyle = fillColor;
      ctx2.globalAlpha = isSelected || isDragging ? 0.95 : 0.8;
      ctx2.fill();
      ctx2.globalAlpha = 1;
      ctx2.lineWidth = isSelected ? 2 : 1.5;
      ctx2.strokeStyle = strokeColor;
      ctx2.stroke();
      ctx2.restore();
    }
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
      missileSpeedSlider.disabled = false;
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
      const rawValue = parseFloat(inputEl.value);
      if (!Number.isFinite(rawValue)) {
        updateMissileSpeedControls();
        return;
      }
      const minSpeed = (_a = stateRef.missileLimits.speedMin) != null ? _a : MISSILE_MIN_SPEED;
      const maxSpeed = (_b = stateRef.missileLimits.speedMax) != null ? _b : MISSILE_MAX_SPEED;
      const clampedValue = clamp(rawValue, minSpeed, maxSpeed);
      if (Math.abs(clampedValue - rawValue) > 1e-3) {
        inputEl.value = clampedValue.toFixed(0);
      }
      lastMissileLegSpeed = clampedValue;
      if (missileSpeedValue) {
        missileSpeedValue.textContent = `${clampedValue.toFixed(0)}`;
      }
      const route = getActiveMissileRoute();
      if (!route || !Array.isArray(route.waypoints)) {
        updateMissileSpeedControls();
        return;
      }
      if (missileSelection && missileSelection.type === "waypoint" && missileSelection.index >= 0 && missileSelection.index < route.waypoints.length) {
        const idx = missileSelection.index;
        route.waypoints[idx] = { ...route.waypoints[idx], speed: clampedValue };
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
    if (sliderValue === null) {
      const rawValue = parseFloat(missileSpeedSlider.value);
      const fallback = lastMissileLegSpeed > 0 ? lastMissileLegSpeed : stateRef.missileConfig.speed;
      const targetValue = Number.isFinite(rawValue) ? rawValue : fallback;
      sliderValue = clamp(targetValue, minSpeed, maxSpeed);
    }
    missileSpeedSlider.disabled = false;
    missileSpeedSlider.value = sliderValue.toFixed(0);
    missileSpeedValue.textContent = `${sliderValue.toFixed(0)}`;
    if (sliderValue > 0) {
      lastMissileLegSpeed = sliderValue;
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
      if (hit) {
        const actualIndex = displayIndexToActualIndex(hit.index);
        setSelection({ type: hit.type, index: actualIndex });
      } else {
        setSelection(null);
      }
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
    setMissileSelection(null, route.id);
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
  function getShipWaypointOffset() {
    var _a, _b;
    return (_b = (_a = stateRef.me) == null ? void 0 : _a.currentWaypointIndex) != null ? _b : 0;
  }
  function displayIndexToActualIndex(displayIndex) {
    return displayIndex + getShipWaypointOffset();
  }
  function actualIndexToDisplayIndex(actualIndex) {
    const offset = getShipWaypointOffset();
    return actualIndex >= offset ? actualIndex - offset : -1;
  }
  function computeRoutePoints() {
    if (!stateRef.me) return null;
    const wps = Array.isArray(stateRef.me.waypoints) ? stateRef.me.waypoints : [];
    const currentIndex = getShipWaypointOffset();
    const visibleWps = currentIndex > 0 ? wps.slice(currentIndex) : wps;
    return buildRoutePoints(
      { x: stateRef.me.x, y: stateRef.me.y },
      visibleWps,
      world,
      getCameraPosition,
      () => uiStateRef.zoom,
      worldToCanvas
    );
  }
  function computeMissileRoutePoints() {
    if (!stateRef.me) return null;
    const route = getActiveMissileRoute();
    const wps = route && Array.isArray(route.waypoints) ? route.waypoints : [];
    return buildRoutePoints(
      { x: stateRef.me.x, y: stateRef.me.y },
      wps,
      world,
      getCameraPosition,
      () => uiStateRef.zoom,
      worldToCanvas
    );
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
      if (dist <= WAYPOINT_HIT_RADIUS) {
        return displayIndexToActualIndex(i);
      }
    }
    return null;
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
  function hitTestRoute(canvasPoint) {
    const route = computeRoutePoints();
    if (!route || route.waypoints.length === 0) {
      return null;
    }
    return hitTestRouteGeneric(canvasPoint, route, {
      skipLegs: !uiStateRef.showShipRoute
    });
  }
  function hitTestMissileRoutes(canvasPoint) {
    if (!stateRef.me) return null;
    const routes = Array.isArray(stateRef.missileRoutes) ? stateRef.missileRoutes : [];
    if (routes.length === 0) return null;
    const shipPos = { x: stateRef.me.x, y: stateRef.me.y };
    let best = null;
    for (const route of routes) {
      const waypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
      if (waypoints.length === 0) {
        continue;
      }
      const routePoints = buildRoutePoints(
        shipPos,
        waypoints,
        world,
        getCameraPosition,
        () => uiStateRef.zoom,
        worldToCanvas
      );
      const hit = hitTestRouteGeneric(canvasPoint, routePoints, {
        waypointHitRadius: 16,
        legHitDistance: 10
      });
      if (!hit) continue;
      let pointerDist;
      let shipDist;
      if (hit.type === "waypoint") {
        const wpCanvas = routePoints.canvasPoints[hit.index + 1];
        pointerDist = Math.hypot(canvasPoint.x - wpCanvas.x, canvasPoint.y - wpCanvas.y);
        const wpWorld = routePoints.worldPoints[hit.index + 1];
        shipDist = Math.hypot(wpWorld.x - shipPos.x, wpWorld.y - shipPos.y);
      } else {
        const { canvasPoints, worldPoints } = routePoints;
        pointerDist = Math.hypot(
          (canvasPoints[hit.index].x + canvasPoints[hit.index + 1].x) * 0.5 - canvasPoint.x,
          (canvasPoints[hit.index].y + canvasPoints[hit.index + 1].y) * 0.5 - canvasPoint.y
        );
        const midWorld = {
          x: (worldPoints[hit.index].x + worldPoints[hit.index + 1].x) * 0.5,
          y: (worldPoints[hit.index].y + worldPoints[hit.index + 1].y) * 0.5
        };
        shipDist = Math.hypot(midWorld.x - shipPos.x, midWorld.y - shipPos.y);
      }
      if (!best || pointerDist < best.pointerDist - 0.1 || Math.abs(pointerDist - best.pointerDist) <= 0.5 && shipDist < best.shipDist) {
        const selection2 = hit.type === "waypoint" ? { type: "waypoint", index: hit.index } : { type: "route", index: hit.index };
        best = {
          route,
          selection: selection2,
          pointerDist,
          shipDist
        };
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
  function drawRoute() {
    var _a;
    if (!ctx || !stateRef.me) return;
    const route = computeRoutePoints();
    if (!route || route.waypoints.length === 0) return;
    const heat = stateRef.me.heat;
    const heatParams = heat ? {
      markerSpeed: heat.markerSpeed,
      kUp: heat.kUp,
      kDown: heat.kDown,
      exp: heat.exp,
      max: heat.max,
      overheatAt: heat.overheatAt,
      warnAt: heat.warnAt
    } : void 0;
    const displaySelection = selection ? {
      type: selection.type,
      index: actualIndexToDisplayIndex(selection.index)
    } : null;
    const validSelection = displaySelection && displaySelection.index >= 0 ? displaySelection : null;
    const displayDraggedWaypoint = draggedWaypoint !== null ? actualIndexToDisplayIndex(draggedWaypoint) : null;
    const validDraggedWaypoint = displayDraggedWaypoint !== null && displayDraggedWaypoint >= 0 ? displayDraggedWaypoint : null;
    drawPlannedRoute(ctx, {
      routePoints: route,
      selection: validSelection,
      draggedWaypoint: validDraggedWaypoint,
      dashStore: shipLegDashOffsets,
      palette: SHIP_PALETTE,
      showLegs: uiStateRef.showShipRoute,
      heatParams,
      initialHeat: (_a = heat == null ? void 0 : heat.value) != null ? _a : 0,
      defaultSpeed,
      worldPoints: route.worldPoints
    });
  }
  function drawMissileRoute() {
    if (!ctx || !stateRef.me) return;
    if (uiStateRef.inputContext !== "missile") return;
    const route = computeMissileRoutePoints();
    if (!route || route.waypoints.length === 0) return;
    const heatParams = stateRef.missileConfig.heatParams;
    const genericSelection = missileSelection ? missileSelection.type === "route" ? { type: "leg", index: missileSelection.index } : { type: "waypoint", index: missileSelection.index } : null;
    drawPlannedRoute(ctx, {
      routePoints: route,
      selection: genericSelection,
      draggedWaypoint: null,
      dashStore: missileLegDashOffsets,
      palette: MISSILE_PALETTE,
      showLegs: true,
      heatParams,
      initialHeat: 0,
      // Missiles start at zero heat
      defaultSpeed: stateRef.missileConfig.speed,
      worldPoints: route.worldPoints
    });
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
    const route = [{ x: ship.x, y: ship.y, speed: void 0 }, ...ship.waypoints];
    const heatParams = {
      markerSpeed: heat.markerSpeed,
      kUp: heat.kUp,
      kDown: heat.kDown,
      exp: heat.exp,
      max: heat.max,
      overheatAt: heat.overheatAt,
      warnAt: heat.warnAt
    };
    const projection = projectRouteHeat(route, heat.value, heatParams);
    return Math.max(...projection.heatAtWaypoints);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvcm91dGUudHMiLCAic3JjL2dhbWUudHMiLCAic3JjL3R1dG9yaWFsL2hpZ2hsaWdodC50cyIsICJzcmMvdHV0b3JpYWwvc3RvcmFnZS50cyIsICJzcmMvdHV0b3JpYWwvcm9sZXMudHMiLCAic3JjL3R1dG9yaWFsL2VuZ2luZS50cyIsICJzcmMvdHV0b3JpYWwvc3RlcHNfYmFzaWMudHMiLCAic3JjL3R1dG9yaWFsL2luZGV4LnRzIiwgInNyYy9zdG9yeS9vdmVybGF5LnRzIiwgInNyYy9zdG9yeS9zdG9yYWdlLnRzIiwgInNyYy9hdWRpby9lbmdpbmUudHMiLCAic3JjL2F1ZGlvL2dyYXBoLnRzIiwgInNyYy9hdWRpby9zZngudHMiLCAic3JjL3N0b3J5L3NmeC50cyIsICJzcmMvc3RvcnkvZW5naW5lLnRzIiwgInNyYy9zdG9yeS9jaGFwdGVycy9pbnRyby50cyIsICJzcmMvc3RvcnkvaW5kZXgudHMiLCAic3JjL3N0YXJ0LWdhdGUudHMiLCAic3JjL2F1ZGlvL211c2ljL3NjZW5lcy9hbWJpZW50LnRzIiwgInNyYy9hdWRpby9tdXNpYy9pbmRleC50cyIsICJzcmMvYXVkaW8vY3Vlcy50cyIsICJzcmMvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IHR5cGUgU2hpcENvbnRleHQgPSBcInNoaXBcIiB8IFwibWlzc2lsZVwiO1xuZXhwb3J0IHR5cGUgU2hpcFRvb2wgPSBcInNldFwiIHwgXCJzZWxlY3RcIiB8IG51bGw7XG5leHBvcnQgdHlwZSBNaXNzaWxlVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcblxuZXhwb3J0IGludGVyZmFjZSBFdmVudE1hcCB7XG4gIFwiY29udGV4dDpjaGFuZ2VkXCI6IHsgY29udGV4dDogU2hpcENvbnRleHQgfTtcbiAgXCJzaGlwOnRvb2xDaGFuZ2VkXCI6IHsgdG9vbDogU2hpcFRvb2wgfTtcbiAgXCJzaGlwOndheXBvaW50QWRkZWRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwic2hpcDp3YXlwb2ludE1vdmVkXCI6IHsgaW5kZXg6IG51bWJlcjsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcInNoaXA6aGVhdFByb2plY3Rpb25VcGRhdGVkXCI6IHsgaGVhdFZhbHVlczogbnVtYmVyW10gfTtcbiAgXCJoZWF0Om1hcmtlckFsaWduZWRcIjogeyB2YWx1ZTogbnVtYmVyOyBtYXJrZXI6IG51bWJlciB9O1xuICBcImhlYXQ6d2FybkVudGVyZWRcIjogeyB2YWx1ZTogbnVtYmVyOyB3YXJuQXQ6IG51bWJlciB9O1xuICBcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCI6IHsgdmFsdWU6IG51bWJlcjsgd2FybkF0OiBudW1iZXIgfTtcbiAgXCJoZWF0OnN0YWxsVHJpZ2dlcmVkXCI6IHsgc3RhbGxVbnRpbDogbnVtYmVyIH07XG4gIFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCI6IHsgcGxhbm5lZDogbnVtYmVyOyBhY3R1YWw6IG51bWJlciB9O1xuICBcInVpOndheXBvaW50SG92ZXJTdGFydFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJ1aTp3YXlwb2ludEhvdmVyRW5kXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6bGF1bmNoZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiOiB7IHNlY29uZHNSZW1haW5pbmc6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiOiB2b2lkO1xuICBcIm1pc3NpbGU6cHJlc2V0U2VsZWN0ZWRcIjogeyBwcmVzZXROYW1lOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmhlYXRQcm9qZWN0aW9uVXBkYXRlZFwiOiB7IHdpbGxPdmVyaGVhdDogYm9vbGVhbjsgb3ZlcmhlYXRBdD86IG51bWJlciB9O1xuICBcIm1pc3NpbGU6b3ZlcmhlYXRlZFwiOiB7IG1pc3NpbGVJZDogc3RyaW5nOyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuICBcImhlbHA6dmlzaWJsZUNoYW5nZWRcIjogeyB2aXNpYmxlOiBib29sZWFuIH07XG4gIFwic3RhdGU6dXBkYXRlZFwiOiB2b2lkO1xuICBcInR1dG9yaWFsOnN0YXJ0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIjogeyBpZDogc3RyaW5nOyBzdGVwSW5kZXg6IG51bWJlcjsgdG90YWw6IG51bWJlciB9O1xuICBcInR1dG9yaWFsOmNvbXBsZXRlZFwiOiB7IGlkOiBzdHJpbmcgfTtcbiAgXCJ0dXRvcmlhbDpza2lwcGVkXCI6IHsgaWQ6IHN0cmluZzsgYXRTdGVwOiBudW1iZXIgfTtcbiAgXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIjogdm9pZDtcbiAgXCJkaWFsb2d1ZTpvcGVuZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjbG9zZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjaG9pY2VcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hvaWNlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJzdG9yeTpmbGFnVXBkYXRlZFwiOiB7IGZsYWc6IHN0cmluZzsgdmFsdWU6IGJvb2xlYW4gfTtcbiAgXCJzdG9yeTpwcm9ncmVzc2VkXCI6IHsgY2hhcHRlcklkOiBzdHJpbmc7IG5vZGVJZDogc3RyaW5nIH07XG4gIFwiYXVkaW86cmVzdW1lXCI6IHZvaWQ7XG4gIFwiYXVkaW86bXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnVubXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiOiB7IGdhaW46IG51bWJlciB9O1xuICBcImF1ZGlvOnNmeFwiOiB7IG5hbWU6IFwidWlcIiB8IFwibGFzZXJcIiB8IFwidGhydXN0XCIgfCBcImV4cGxvc2lvblwiIHwgXCJsb2NrXCIgfCBcImRpYWxvZ3VlXCI7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIjogeyBzY2VuZTogXCJhbWJpZW50XCIgfCBcImNvbWJhdFwiIHwgXCJsb2JieVwiOyBzZWVkPzogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6cGFyYW1cIjogeyBrZXk6IHN0cmluZzsgdmFsdWU6IG51bWJlciB9O1xuICBcImF1ZGlvOm11c2ljOnRyYW5zcG9ydFwiOiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfTtcbn1cblxuZXhwb3J0IHR5cGUgRXZlbnRLZXkgPSBrZXlvZiBFdmVudE1hcDtcbmV4cG9ydCB0eXBlIEV2ZW50UGF5bG9hZDxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gRXZlbnRNYXBbS107XG5leHBvcnQgdHlwZSBIYW5kbGVyPEsgZXh0ZW5kcyBFdmVudEtleT4gPSAocGF5bG9hZDogRXZlbnRQYXlsb2FkPEs+KSA9PiB2b2lkO1xuXG50eXBlIFZvaWRLZXlzID0ge1xuICBbSyBpbiBFdmVudEtleV06IEV2ZW50TWFwW0tdIGV4dGVuZHMgdm9pZCA/IEsgOiBuZXZlclxufVtFdmVudEtleV07XG5cbnR5cGUgTm9uVm9pZEtleXMgPSBFeGNsdWRlPEV2ZW50S2V5LCBWb2lkS2V5cz47XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnRCdXMge1xuICBvbjxLIGV4dGVuZHMgRXZlbnRLZXk+KGV2ZW50OiBLLCBoYW5kbGVyOiBIYW5kbGVyPEs+KTogKCkgPT4gdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgTm9uVm9pZEtleXM+KGV2ZW50OiBLLCBwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pOiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBWb2lkS2V5cz4oZXZlbnQ6IEspOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXZlbnRCdXMoKTogRXZlbnRCdXMge1xuICBjb25zdCBoYW5kbGVycyA9IG5ldyBNYXA8RXZlbnRLZXksIFNldDxGdW5jdGlvbj4+KCk7XG4gIHJldHVybiB7XG4gICAgb24oZXZlbnQsIGhhbmRsZXIpIHtcbiAgICAgIGxldCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQpIHtcbiAgICAgICAgc2V0ID0gbmV3IFNldCgpO1xuICAgICAgICBoYW5kbGVycy5zZXQoZXZlbnQsIHNldCk7XG4gICAgICB9XG4gICAgICBzZXQuYWRkKGhhbmRsZXIpO1xuICAgICAgcmV0dXJuICgpID0+IHNldCEuZGVsZXRlKGhhbmRsZXIpO1xuICAgIH0sXG4gICAgZW1pdChldmVudDogRXZlbnRLZXksIHBheWxvYWQ/OiB1bmtub3duKSB7XG4gICAgICBjb25zdCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQgfHwgc2V0LnNpemUgPT09IDApIHJldHVybjtcbiAgICAgIGZvciAoY29uc3QgZm4gb2Ygc2V0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgKGZuIGFzICh2YWx1ZT86IHVua25vd24pID0+IHZvaWQpKHBheWxvYWQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBbYnVzXSBoYW5kbGVyIGZvciAke2V2ZW50fSBmYWlsZWRgLCBlcnIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNoaXBDb250ZXh0LCBTaGlwVG9vbCwgTWlzc2lsZVRvb2wgfSBmcm9tIFwiLi9idXNcIjtcblxuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX1NQRUVEID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfU1BFRUQgPSAyNTA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fQUdSTyA9IDEwMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9MSUZFVElNRSA9IDEyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9MSUZFVElNRSA9IDIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSA9IDgwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiA9IDIwMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUxpbWl0cyB7XG4gIHNwZWVkTWluOiBudW1iZXI7XG4gIHNwZWVkTWF4OiBudW1iZXI7XG4gIGFncm9NaW46IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRWaWV3IHtcbiAgdmFsdWU6IG51bWJlcjtcbiAgbWF4OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIHN0YWxsVW50aWxNczogbnVtYmVyOyAvLyBjbGllbnQtc3luY2VkIHRpbWUgaW4gbWlsbGlzZWNvbmRzXG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaGlwU25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgaHA/OiBudW1iZXI7XG4gIGtpbGxzPzogbnVtYmVyO1xuICB3YXlwb2ludHM6IFdheXBvaW50W107XG4gIGN1cnJlbnRXYXlwb2ludEluZGV4PzogbnVtYmVyO1xuICBoZWF0PzogSGVhdFZpZXc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2hvc3RTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbiAgaGVhdD86IEhlYXRWaWV3OyAvLyBNaXNzaWxlIGhlYXQgZGF0YVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVSb3V0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRQYXJhbXMge1xuICBtYXg6IG51bWJlcjtcbiAgd2FybkF0OiBudW1iZXI7XG4gIG92ZXJoZWF0QXQ6IG51bWJlcjtcbiAgbWFya2VyU3BlZWQ6IG51bWJlcjtcbiAga1VwOiBudW1iZXI7XG4gIGtEb3duOiBudW1iZXI7XG4gIGV4cDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVDb25maWcge1xuICBzcGVlZDogbnVtYmVyO1xuICBhZ3JvUmFkaXVzOiBudW1iZXI7XG4gIGxpZmV0aW1lOiBudW1iZXI7XG4gIGhlYXRQYXJhbXM/OiBIZWF0UGFyYW1zOyAvLyBPcHRpb25hbCBjdXN0b20gaGVhdCBjb25maWd1cmF0aW9uXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVByZXNldCB7XG4gIG5hbWU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgc3BlZWQ6IG51bWJlcjtcbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuICBoZWF0UGFyYW1zOiBIZWF0UGFyYW1zO1xufVxuXG4vLyBNaXNzaWxlIHByZXNldCBkZWZpbml0aW9ucyBtYXRjaGluZyBiYWNrZW5kXG5leHBvcnQgY29uc3QgTUlTU0lMRV9QUkVTRVRTOiBNaXNzaWxlUHJlc2V0W10gPSBbXG4gIHtcbiAgICBuYW1lOiBcIlNjb3V0XCIsXG4gICAgZGVzY3JpcHRpb246IFwiU2xvdywgZWZmaWNpZW50LCBsb25nLXJhbmdlLiBIaWdoIGhlYXQgY2FwYWNpdHkuXCIsXG4gICAgc3BlZWQ6IDgwLFxuICAgIGFncm9SYWRpdXM6IDE1MDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA2MCxcbiAgICAgIHdhcm5BdDogNDIsXG4gICAgICBvdmVyaGVhdEF0OiA2MCxcbiAgICAgIG1hcmtlclNwZWVkOiA3MCxcbiAgICAgIGtVcDogMjAsXG4gICAgICBrRG93bjogMTUsXG4gICAgICBleHA6IDEuNSxcbiAgICB9LFxuICB9LFxuICB7XG4gICAgbmFtZTogXCJIdW50ZXJcIixcbiAgICBkZXNjcmlwdGlvbjogXCJCYWxhbmNlZCBzcGVlZCBhbmQgZGV0ZWN0aW9uLiBTdGFuZGFyZCBoZWF0LlwiLFxuICAgIHNwZWVkOiAxNTAsXG4gICAgYWdyb1JhZGl1czogODAwLFxuICAgIGhlYXRQYXJhbXM6IHtcbiAgICAgIG1heDogNTAsXG4gICAgICB3YXJuQXQ6IDM1LFxuICAgICAgb3ZlcmhlYXRBdDogNTAsXG4gICAgICBtYXJrZXJTcGVlZDogMTIwLFxuICAgICAga1VwOiAyOCxcbiAgICAgIGtEb3duOiAxMixcbiAgICAgIGV4cDogMS41LFxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBcIlNuaXBlclwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkZhc3QsIG5hcnJvdyBkZXRlY3Rpb24uIExvdyBoZWF0IGNhcGFjaXR5LlwiLFxuICAgIHNwZWVkOiAyMjAsXG4gICAgYWdyb1JhZGl1czogMzAwLFxuICAgIGhlYXRQYXJhbXM6IHtcbiAgICAgIG1heDogNDAsXG4gICAgICB3YXJuQXQ6IDI4LFxuICAgICAgb3ZlcmhlYXRBdDogNDAsXG4gICAgICBtYXJrZXJTcGVlZDogMTgwLFxuICAgICAga1VwOiAzNSxcbiAgICAgIGtEb3duOiA4LFxuICAgICAgZXhwOiAxLjUsXG4gICAgfSxcbiAgfSxcbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNZXRhIHtcbiAgYz86IG51bWJlcjtcbiAgdz86IG51bWJlcjtcbiAgaD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBTdGF0ZSB7XG4gIG5vdzogbnVtYmVyO1xuICBub3dTeW5jZWRBdDogbnVtYmVyO1xuICBtZTogU2hpcFNuYXBzaG90IHwgbnVsbDtcbiAgZ2hvc3RzOiBHaG9zdFNuYXBzaG90W107XG4gIG1pc3NpbGVzOiBNaXNzaWxlU25hcHNob3RbXTtcbiAgbWlzc2lsZVJvdXRlczogTWlzc2lsZVJvdXRlW107XG4gIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBzdHJpbmcgfCBudWxsO1xuICBuZXh0TWlzc2lsZVJlYWR5QXQ6IG51bWJlcjtcbiAgbWlzc2lsZUNvbmZpZzogTWlzc2lsZUNvbmZpZztcbiAgbWlzc2lsZUxpbWl0czogTWlzc2lsZUxpbWl0cztcbiAgd29ybGRNZXRhOiBXb3JsZE1ldGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VsZWN0aW9uIHtcbiAgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjtcbiAgaW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlU2VsZWN0aW9uIHtcbiAgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJyb3V0ZVwiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBBY3RpdmVUb29sID1cbiAgfCBcInNoaXAtc2V0XCJcbiAgfCBcInNoaXAtc2VsZWN0XCJcbiAgfCBcIm1pc3NpbGUtc2V0XCJcbiAgfCBcIm1pc3NpbGUtc2VsZWN0XCJcbiAgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVJU3RhdGUge1xuICBpbnB1dENvbnRleHQ6IFNoaXBDb250ZXh0O1xuICBzaGlwVG9vbDogU2hpcFRvb2w7XG4gIG1pc3NpbGVUb29sOiBNaXNzaWxlVG9vbDtcbiAgYWN0aXZlVG9vbDogQWN0aXZlVG9vbDtcbiAgc2hvd1NoaXBSb3V0ZTogYm9vbGVhbjtcbiAgaGVscFZpc2libGU6IGJvb2xlYW47XG4gIHpvb206IG51bWJlcjtcbiAgcGFuWDogbnVtYmVyO1xuICBwYW5ZOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpOiBVSVN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpbnB1dENvbnRleHQ6IFwic2hpcFwiLFxuICAgIHNoaXBUb29sOiBcInNldFwiLFxuICAgIG1pc3NpbGVUb29sOiBudWxsLFxuICAgIGFjdGl2ZVRvb2w6IFwic2hpcC1zZXRcIixcbiAgICBzaG93U2hpcFJvdXRlOiB0cnVlLFxuICAgIGhlbHBWaXNpYmxlOiBmYWxzZSxcbiAgICB6b29tOiAxLjAsXG4gICAgcGFuWDogMCxcbiAgICBwYW5ZOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFN0YXRlKGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogQXBwU3RhdGUge1xuICByZXR1cm4ge1xuICAgIG5vdzogMCxcbiAgICBub3dTeW5jZWRBdDogdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgPyBwZXJmb3JtYW5jZS5ub3coKVxuICAgICAgOiBEYXRlLm5vdygpLFxuICAgIG1lOiBudWxsLFxuICAgIGdob3N0czogW10sXG4gICAgbWlzc2lsZXM6IFtdLFxuICAgIG1pc3NpbGVSb3V0ZXM6IFtdLFxuICAgIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBudWxsLFxuICAgIG5leHRNaXNzaWxlUmVhZHlBdDogMCxcbiAgICBtaXNzaWxlQ29uZmlnOiB7XG4gICAgICBzcGVlZDogMTgwLFxuICAgICAgYWdyb1JhZGl1czogODAwLFxuICAgICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcigxODAsIDgwMCwgbGltaXRzKSxcbiAgICAgIGhlYXRQYXJhbXM6IE1JU1NJTEVfUFJFU0VUU1sxXS5oZWF0UGFyYW1zLCAvLyBEZWZhdWx0IHRvIEh1bnRlciBwcmVzZXRcbiAgICB9LFxuICAgIG1pc3NpbGVMaW1pdHM6IGxpbWl0cyxcbiAgICB3b3JsZE1ldGE6IHt9LFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXAodmFsdWU6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWlzc2lsZUxpZmV0aW1lRm9yKHNwZWVkOiBudW1iZXIsIGFncm9SYWRpdXM6IG51bWJlciwgbGltaXRzOiBNaXNzaWxlTGltaXRzID0ge1xuICBzcGVlZE1pbjogTUlTU0lMRV9NSU5fU1BFRUQsXG4gIHNwZWVkTWF4OiBNSVNTSUxFX01BWF9TUEVFRCxcbiAgYWdyb01pbjogTUlTU0lMRV9NSU5fQUdSTyxcbn0pOiBudW1iZXIge1xuICBjb25zdCBtaW5TcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluIDogTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXggOiBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgbWluQWdybyA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiA6IE1JU1NJTEVfTUlOX0FHUk87XG4gIGNvbnN0IHNwYW4gPSBtYXhTcGVlZCAtIG1pblNwZWVkO1xuICBjb25zdCBzcGVlZE5vcm0gPSBzcGFuID4gMCA/IGNsYW1wKChzcGVlZCAtIG1pblNwZWVkKSAvIHNwYW4sIDAsIDEpIDogMDtcbiAgY29uc3QgYWRqdXN0ZWRBZ3JvID0gTWF0aC5tYXgoMCwgYWdyb1JhZGl1cyAtIG1pbkFncm8pO1xuICBjb25zdCBhZ3JvTm9ybSA9IGNsYW1wKGFkanVzdGVkQWdybyAvIE1JU1NJTEVfTElGRVRJTUVfQUdST19SRUYsIDAsIDEpO1xuICBjb25zdCByZWR1Y3Rpb24gPSBzcGVlZE5vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX1NQRUVEX1BFTkFMVFkgKyBhZ3JvTm9ybSAqIE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZO1xuICBjb25zdCBiYXNlID0gTUlTU0lMRV9NQVhfTElGRVRJTUU7XG4gIHJldHVybiBjbGFtcChiYXNlIC0gcmVkdWN0aW9uLCBNSVNTSUxFX01JTl9MSUZFVElNRSwgTUlTU0lMRV9NQVhfTElGRVRJTUUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVNaXNzaWxlQ29uZmlnKFxuICBjZmc6IFBhcnRpYWw8UGljazxNaXNzaWxlQ29uZmlnLCBcInNwZWVkXCIgfCBcImFncm9SYWRpdXNcIiB8IFwiaGVhdFBhcmFtc1wiPj4sXG4gIGZhbGxiYWNrOiBNaXNzaWxlQ29uZmlnLFxuICBsaW1pdHM6IE1pc3NpbGVMaW1pdHMsXG4pOiBNaXNzaWxlQ29uZmlnIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBiYXNlID0gZmFsbGJhY2sgPz8ge1xuICAgIHNwZWVkOiBtaW5TcGVlZCxcbiAgICBhZ3JvUmFkaXVzOiBtaW5BZ3JvLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IobWluU3BlZWQsIG1pbkFncm8sIGxpbWl0cyksXG4gIH07XG4gIGNvbnN0IG1lcmdlZFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA/IChjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgOiBiYXNlLnNwZWVkO1xuICBjb25zdCBtZXJnZWRBZ3JvID0gTnVtYmVyLmlzRmluaXRlKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgPyAoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA6IGJhc2UuYWdyb1JhZGl1cztcbiAgY29uc3Qgc3BlZWQgPSBjbGFtcChtZXJnZWRTcGVlZCwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgY29uc3QgYWdyb1JhZGl1cyA9IE1hdGgubWF4KG1pbkFncm8sIG1lcmdlZEFncm8pO1xuICBjb25zdCBoZWF0UGFyYW1zID0gY2ZnLmhlYXRQYXJhbXMgPyB7IC4uLmNmZy5oZWF0UGFyYW1zIH0gOiBiYXNlLmhlYXRQYXJhbXMgPyB7IC4uLmJhc2UuaGVhdFBhcmFtcyB9IDogdW5kZWZpbmVkO1xuICByZXR1cm4ge1xuICAgIHNwZWVkLFxuICAgIGFncm9SYWRpdXMsXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihzcGVlZCwgYWdyb1JhZGl1cywgbGltaXRzKSxcbiAgICBoZWF0UGFyYW1zLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9ub3RvbmljTm93KCk6IG51bWJlciB7XG4gIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICB9XG4gIHJldHVybiBEYXRlLm5vdygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVXYXlwb2ludExpc3QobGlzdDogV2F5cG9pbnRbXSB8IHVuZGVmaW5lZCB8IG51bGwpOiBXYXlwb2ludFtdIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3QpKSByZXR1cm4gW107XG4gIHJldHVybiBsaXN0Lm1hcCgod3ApID0+ICh7IC4uLndwIH0pKTtcbn1cblxuLy8gUHJvamVjdCBoZWF0IGFsb25nIGEgbWlzc2lsZSByb3V0ZVxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGVQcm9qZWN0aW9uIHtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xuICBoZWF0QXRXYXlwb2ludHM6IG51bWJlcltdO1xuICB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47XG4gIG92ZXJoZWF0QXQ/OiBudW1iZXI7IC8vIEluZGV4IHdoZXJlIG92ZXJoZWF0IG9jY3Vyc1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdE1pc3NpbGVIZWF0KFxuICByb3V0ZTogV2F5cG9pbnRbXSxcbiAgZGVmYXVsdFNwZWVkOiBudW1iZXIsXG4gIGhlYXRQYXJhbXM6IEhlYXRQYXJhbXNcbik6IE1pc3NpbGVSb3V0ZVByb2plY3Rpb24ge1xuICBjb25zdCBwcm9qZWN0aW9uOiBNaXNzaWxlUm91dGVQcm9qZWN0aW9uID0ge1xuICAgIHdheXBvaW50czogcm91dGUsXG4gICAgaGVhdEF0V2F5cG9pbnRzOiBbXSxcbiAgICB3aWxsT3ZlcmhlYXQ6IGZhbHNlLFxuICB9O1xuXG4gIGlmIChyb3V0ZS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gcHJvamVjdGlvbjtcbiAgfVxuXG4gIGxldCBoZWF0ID0gMDsgLy8gTWlzc2lsZXMgc3RhcnQgYXQgemVybyBoZWF0XG4gIGxldCBwb3MgPSB7IHg6IHJvdXRlWzBdLngsIHk6IHJvdXRlWzBdLnkgfTtcbiAgbGV0IGN1cnJlbnRTcGVlZCA9IHJvdXRlWzBdLnNwZWVkID4gMCA/IHJvdXRlWzBdLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuXG4gIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCByb3V0ZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHRhcmdldFBvcyA9IHJvdXRlW2ldO1xuICAgIGNvbnN0IHRhcmdldFNwZWVkID0gdGFyZ2V0UG9zLnNwZWVkID4gMCA/IHRhcmdldFBvcy5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcblxuICAgIC8vIENhbGN1bGF0ZSBkaXN0YW5jZSBhbmQgdGltZVxuICAgIGNvbnN0IGR4ID0gdGFyZ2V0UG9zLnggLSBwb3MueDtcbiAgICBjb25zdCBkeSA9IHRhcmdldFBvcy55IC0gcG9zLnk7XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXG4gICAgaWYgKGRpc3RhbmNlIDwgMC4wMDEpIHtcbiAgICAgIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBBdmVyYWdlIHNwZWVkIGR1cmluZyBzZWdtZW50XG4gICAgY29uc3QgYXZnU3BlZWQgPSAoY3VycmVudFNwZWVkICsgdGFyZ2V0U3BlZWQpICogMC41O1xuICAgIGNvbnN0IHNlZ21lbnRUaW1lID0gZGlzdGFuY2UgLyBNYXRoLm1heChhdmdTcGVlZCwgMSk7XG5cbiAgICAvLyBDYWxjdWxhdGUgaGVhdCByYXRlIChtYXRjaCBzZXJ2ZXIgZm9ybXVsYSlcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KGhlYXRQYXJhbXMubWFya2VyU3BlZWQsIDAuMDAwMDAxKTtcbiAgICBjb25zdCBkZXYgPSBhdmdTcGVlZCAtIGhlYXRQYXJhbXMubWFya2VyU3BlZWQ7XG4gICAgY29uc3QgcCA9IGhlYXRQYXJhbXMuZXhwO1xuXG4gICAgbGV0IGhkb3Q6IG51bWJlcjtcbiAgICBpZiAoZGV2ID49IDApIHtcbiAgICAgIC8vIEhlYXRpbmdcbiAgICAgIGhkb3QgPSBoZWF0UGFyYW1zLmtVcCAqIE1hdGgucG93KGRldiAvIFZuLCBwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ29vbGluZ1xuICAgICAgaGRvdCA9IC1oZWF0UGFyYW1zLmtEb3duICogTWF0aC5wb3coTWF0aC5hYnMoZGV2KSAvIFZuLCBwKTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgaGVhdFxuICAgIGhlYXQgKz0gaGRvdCAqIHNlZ21lbnRUaW1lO1xuICAgIGhlYXQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihoZWF0LCBoZWF0UGFyYW1zLm1heCkpO1xuXG4gICAgcHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHMucHVzaChoZWF0KTtcbiAgICBwb3MgPSB7IHg6IHRhcmdldFBvcy54LCB5OiB0YXJnZXRQb3MueSB9O1xuICAgIGN1cnJlbnRTcGVlZCA9IHRhcmdldFNwZWVkO1xuXG4gICAgLy8gQ2hlY2sgZm9yIG92ZXJoZWF0XG4gICAgaWYgKGhlYXQgPj0gaGVhdFBhcmFtcy5vdmVyaGVhdEF0ICYmICFwcm9qZWN0aW9uLndpbGxPdmVyaGVhdCkge1xuICAgICAgcHJvamVjdGlvbi53aWxsT3ZlcmhlYXQgPSB0cnVlO1xuICAgICAgcHJvamVjdGlvbi5vdmVyaGVhdEF0ID0gaTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgcG9zaXRpb24gYW5kIHNwZWVkXG4gICAgcG9zID0gdGFyZ2V0UG9zO1xuICAgIGN1cnJlbnRTcGVlZCA9IHRhcmdldFNwZWVkO1xuICB9XG5cbiAgcmV0dXJuIHByb2plY3Rpb247XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlOiBBcHBTdGF0ZSwgbGltaXRzOiBQYXJ0aWFsPE1pc3NpbGVMaW1pdHM+KTogdm9pZCB7XG4gIHN0YXRlLm1pc3NpbGVMaW1pdHMgPSB7XG4gICAgc3BlZWRNaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4sXG4gICAgc3BlZWRNYXg6IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4ISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXgsXG4gICAgYWdyb01pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuYWdyb01pbixcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyB0eXBlIEV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQge1xuICB0eXBlIEFwcFN0YXRlLFxuICB0eXBlIE1pc3NpbGVSb3V0ZSxcbiAgbW9ub3RvbmljTm93LFxuICBzYW5pdGl6ZU1pc3NpbGVDb25maWcsXG4gIHVwZGF0ZU1pc3NpbGVMaW1pdHMsXG59IGZyb20gXCIuL3N0YXRlXCI7XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgc3BlZWQ/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlUm91dGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lPzogc3RyaW5nO1xuICB3YXlwb2ludHM/OiBTZXJ2ZXJNaXNzaWxlV2F5cG9pbnRbXTtcbn1cblxuaW50ZXJmYWNlIFNlcnZlckhlYXRWaWV3IHtcbiAgdjogbnVtYmVyOyAgLy8gY3VycmVudCBoZWF0IHZhbHVlXG4gIG06IG51bWJlcjsgIC8vIG1heFxuICB3OiBudW1iZXI7ICAvLyB3YXJuQXRcbiAgbzogbnVtYmVyOyAgLy8gb3ZlcmhlYXRBdFxuICBtczogbnVtYmVyOyAvLyBtYXJrZXJTcGVlZFxuICBzdTogbnVtYmVyOyAvLyBzdGFsbFVudGlsIChzZXJ2ZXIgdGltZSBzZWNvbmRzKVxuICBrdTogbnVtYmVyOyAvLyBrVXBcbiAga2Q6IG51bWJlcjsgLy8ga0Rvd25cbiAgZXg6IG51bWJlcjsgLy8gZXhwXG59XG5cbmludGVyZmFjZSBTZXJ2ZXJTaGlwU3RhdGUge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgaHA/OiBudW1iZXI7XG4gIGtpbGxzPzogbnVtYmVyO1xuICB3YXlwb2ludHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBzcGVlZD86IG51bWJlciB9PjtcbiAgY3VycmVudF93YXlwb2ludF9pbmRleD86IG51bWJlcjtcbiAgaGVhdD86IFNlcnZlckhlYXRWaWV3O1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIHNlbGY/OiBib29sZWFuO1xuICBhZ3JvX3JhZGl1czogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyU3RhdGVNZXNzYWdlIHtcbiAgdHlwZTogXCJzdGF0ZVwiO1xuICBub3c6IG51bWJlcjtcbiAgbmV4dF9taXNzaWxlX3JlYWR5PzogbnVtYmVyO1xuICBtZT86IFNlcnZlclNoaXBTdGF0ZSB8IG51bGw7XG4gIGdob3N0cz86IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHZ4OiBudW1iZXI7IHZ5OiBudW1iZXIgfT47XG4gIG1pc3NpbGVzPzogU2VydmVyTWlzc2lsZVN0YXRlW107XG4gIG1pc3NpbGVfcm91dGVzPzogU2VydmVyTWlzc2lsZVJvdXRlW107XG4gIG1pc3NpbGVfY29uZmlnPzoge1xuICAgIHNwZWVkPzogbnVtYmVyO1xuICAgIHNwZWVkX21pbj86IG51bWJlcjtcbiAgICBzcGVlZF9tYXg/OiBudW1iZXI7XG4gICAgYWdyb19yYWRpdXM/OiBudW1iZXI7XG4gICAgYWdyb19taW4/OiBudW1iZXI7XG4gICAgbGlmZXRpbWU/OiBudW1iZXI7XG4gICAgaGVhdF9jb25maWc/OiB7XG4gICAgICBtYXg/OiBudW1iZXI7XG4gICAgICB3YXJuX2F0PzogbnVtYmVyO1xuICAgICAgb3ZlcmhlYXRfYXQ/OiBudW1iZXI7XG4gICAgICBtYXJrZXJfc3BlZWQ/OiBudW1iZXI7XG4gICAgICBrX3VwPzogbnVtYmVyO1xuICAgICAga19kb3duPzogbnVtYmVyO1xuICAgICAgZXhwPzogbnVtYmVyO1xuICAgIH0gfCBudWxsO1xuICB9IHwgbnVsbDtcbiAgYWN0aXZlX21pc3NpbGVfcm91dGU/OiBzdHJpbmcgfCBudWxsO1xuICBtZXRhPzoge1xuICAgIGM/OiBudW1iZXI7XG4gICAgdz86IG51bWJlcjtcbiAgICBoPzogbnVtYmVyO1xuICB9O1xufVxuXG5pbnRlcmZhY2UgQ29ubmVjdE9wdGlvbnMge1xuICByb29tOiBzdHJpbmc7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb25TdGF0ZVVwZGF0ZWQ/OiAoKSA9PiB2b2lkO1xuICBvbk9wZW4/OiAoc29ja2V0OiBXZWJTb2NrZXQpID0+IHZvaWQ7XG4gIG1hcFc/OiBudW1iZXI7XG4gIG1hcEg/OiBudW1iZXI7XG59XG5cbmxldCB3czogV2ViU29ja2V0IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZCB7XG4gIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHJldHVybjtcbiAgY29uc3QgZGF0YSA9IHR5cGVvZiBwYXlsb2FkID09PSBcInN0cmluZ1wiID8gcGF5bG9hZCA6IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpO1xuICB3cy5zZW5kKGRhdGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdFdlYlNvY2tldCh7IHJvb20sIHN0YXRlLCBidXMsIG9uU3RhdGVVcGRhdGVkLCBvbk9wZW4sIG1hcFcsIG1hcEggfTogQ29ubmVjdE9wdGlvbnMpOiB2b2lkIHtcbiAgY29uc3QgcHJvdG9jb2wgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgPyBcIndzczovL1wiIDogXCJ3czovL1wiO1xuICBsZXQgd3NVcmwgPSBgJHtwcm90b2NvbH0ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fS93cz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb20pfWA7XG4gIGlmIChtYXBXICYmIG1hcFcgPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBXPSR7bWFwV31gO1xuICB9XG4gIGlmIChtYXBIICYmIG1hcEggPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBIPSR7bWFwSH1gO1xuICB9XG4gIHdzID0gbmV3IFdlYlNvY2tldCh3c1VybCk7XG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJvcGVuXCIsICgpID0+IHtcbiAgICBjb25zb2xlLmxvZyhcIlt3c10gb3BlblwiKTtcbiAgICBjb25zdCBzb2NrZXQgPSB3cztcbiAgICBpZiAoc29ja2V0ICYmIG9uT3Blbikge1xuICAgICAgb25PcGVuKHNvY2tldCk7XG4gICAgfVxuICB9KTtcbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcImNsb3NlXCIsICgpID0+IGNvbnNvbGUubG9nKFwiW3dzXSBjbG9zZVwiKSk7XG5cbiAgbGV0IHByZXZSb3V0ZXMgPSBuZXcgTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPigpO1xuICBsZXQgcHJldkFjdGl2ZVJvdXRlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IHByZXZNaXNzaWxlQ291bnQgPSAwO1xuXG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IGRhdGEgPSBzYWZlUGFyc2UoZXZlbnQuZGF0YSk7XG4gICAgaWYgKCFkYXRhIHx8IGRhdGEudHlwZSAhPT0gXCJzdGF0ZVwiKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGhhbmRsZVN0YXRlTWVzc2FnZShzdGF0ZSwgZGF0YSwgYnVzLCBwcmV2Um91dGVzLCBwcmV2QWN0aXZlUm91dGUsIHByZXZNaXNzaWxlQ291bnQpO1xuICAgIHByZXZSb3V0ZXMgPSBuZXcgTWFwKHN0YXRlLm1pc3NpbGVSb3V0ZXMubWFwKChyb3V0ZSkgPT4gW3JvdXRlLmlkLCBjbG9uZVJvdXRlKHJvdXRlKV0pKTtcbiAgICBwcmV2QWN0aXZlUm91dGUgPSBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZDtcbiAgICBwcmV2TWlzc2lsZUNvdW50ID0gc3RhdGUubWlzc2lsZXMubGVuZ3RoO1xuICAgIGJ1cy5lbWl0KFwic3RhdGU6dXBkYXRlZFwiKTtcbiAgICBvblN0YXRlVXBkYXRlZD8uKCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTdGF0ZU1lc3NhZ2UoXG4gIHN0YXRlOiBBcHBTdGF0ZSxcbiAgbXNnOiBTZXJ2ZXJTdGF0ZU1lc3NhZ2UsXG4gIGJ1czogRXZlbnRCdXMsXG4gIHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sXG4gIHByZXZBY3RpdmVSb3V0ZTogc3RyaW5nIHwgbnVsbCxcbiAgcHJldk1pc3NpbGVDb3VudDogbnVtYmVyLFxuKTogdm9pZCB7XG4gIHN0YXRlLm5vdyA9IG1zZy5ub3c7XG4gIHN0YXRlLm5vd1N5bmNlZEF0ID0gbW9ub3RvbmljTm93KCk7XG4gIHN0YXRlLm5leHRNaXNzaWxlUmVhZHlBdCA9IE51bWJlci5pc0Zpbml0ZShtc2cubmV4dF9taXNzaWxlX3JlYWR5KSA/IG1zZy5uZXh0X21pc3NpbGVfcmVhZHkhIDogMDtcbiAgc3RhdGUubWUgPSBtc2cubWUgPyB7XG4gICAgeDogbXNnLm1lLngsXG4gICAgeTogbXNnLm1lLnksXG4gICAgdng6IG1zZy5tZS52eCxcbiAgICB2eTogbXNnLm1lLnZ5LFxuICAgIGhwOiBtc2cubWUuaHAsXG4gICAga2lsbHM6IG1zZy5tZS5raWxscyA/PyAwLFxuICAgIHdheXBvaW50czogQXJyYXkuaXNBcnJheShtc2cubWUud2F5cG9pbnRzKVxuICAgICAgPyBtc2cubWUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7IHg6IHdwLngsIHk6IHdwLnksIHNwZWVkOiBOdW1iZXIuaXNGaW5pdGUod3Auc3BlZWQpID8gd3Auc3BlZWQhIDogMTgwIH0pKVxuICAgICAgOiBbXSxcbiAgICBjdXJyZW50V2F5cG9pbnRJbmRleDogbXNnLm1lLmN1cnJlbnRfd2F5cG9pbnRfaW5kZXggPz8gMCxcbiAgICBoZWF0OiBtc2cubWUuaGVhdCA/IGNvbnZlcnRIZWF0Vmlldyhtc2cubWUuaGVhdCwgc3RhdGUubm93U3luY2VkQXQsIHN0YXRlLm5vdykgOiB1bmRlZmluZWQsXG4gIH0gOiBudWxsO1xuICBzdGF0ZS5naG9zdHMgPSBBcnJheS5pc0FycmF5KG1zZy5naG9zdHMpID8gbXNnLmdob3N0cy5zbGljZSgpIDogW107XG4gIHN0YXRlLm1pc3NpbGVzID0gQXJyYXkuaXNBcnJheShtc2cubWlzc2lsZXMpID8gbXNnLm1pc3NpbGVzLnNsaWNlKCkgOiBbXTtcblxuICBjb25zdCByb3V0ZXNGcm9tU2VydmVyID0gQXJyYXkuaXNBcnJheShtc2cubWlzc2lsZV9yb3V0ZXMpID8gbXNnLm1pc3NpbGVfcm91dGVzIDogW107XG4gIGNvbnN0IG5ld1JvdXRlczogTWlzc2lsZVJvdXRlW10gPSByb3V0ZXNGcm9tU2VydmVyLm1hcCgocm91dGUpID0+ICh7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUgfHwgcm91dGUuaWQgfHwgXCJSb3V0ZVwiLFxuICAgIHdheXBvaW50czogQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpXG4gICAgICA/IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoe1xuICAgICAgICAgIHg6IHdwLngsXG4gICAgICAgICAgeTogd3AueSxcbiAgICAgICAgICBzcGVlZDogTnVtYmVyLmlzRmluaXRlKHdwLnNwZWVkKSA/IHdwLnNwZWVkISA6IHN0YXRlLm1pc3NpbGVDb25maWcuc3BlZWQsXG4gICAgICAgIH0pKVxuICAgICAgOiBbXSxcbiAgfSkpO1xuXG4gIGRpZmZSb3V0ZXMocHJldlJvdXRlcywgbmV3Um91dGVzLCBidXMpO1xuICBzdGF0ZS5taXNzaWxlUm91dGVzID0gbmV3Um91dGVzO1xuXG4gIGNvbnN0IG5leHRBY3RpdmUgPSB0eXBlb2YgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlID09PSBcInN0cmluZ1wiICYmIG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZS5sZW5ndGggPiAwXG4gICAgPyBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGVcbiAgICA6IG5ld1JvdXRlcy5sZW5ndGggPiAwXG4gICAgICA/IG5ld1JvdXRlc1swXS5pZFxuICAgICAgOiBudWxsO1xuICBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG5leHRBY3RpdmU7XG4gIGlmIChuZXh0QWN0aXZlICE9PSBwcmV2QWN0aXZlUm91dGUpIHtcbiAgICBidXMuZW1pdChcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsIHsgcm91dGVJZDogbmV4dEFjdGl2ZSA/PyBudWxsIH0pO1xuICB9XG5cbiAgaWYgKG1zZy5taXNzaWxlX2NvbmZpZykge1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21pbikgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9tYXgpIHx8IE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4pKSB7XG4gICAgICB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlLCB7XG4gICAgICAgIHNwZWVkTWluOiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluLFxuICAgICAgICBzcGVlZE1heDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCxcbiAgICAgICAgYWdyb01pbjogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fbWluLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHByZXZIZWF0ID0gc3RhdGUubWlzc2lsZUNvbmZpZy5oZWF0UGFyYW1zO1xuICAgIGxldCBoZWF0UGFyYW1zOiB7IG1heDogbnVtYmVyOyB3YXJuQXQ6IG51bWJlcjsgb3ZlcmhlYXRBdDogbnVtYmVyOyBtYXJrZXJTcGVlZDogbnVtYmVyOyBrVXA6IG51bWJlcjsga0Rvd246IG51bWJlcjsgZXhwOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcbiAgICBjb25zdCBoZWF0Q29uZmlnID0gbXNnLm1pc3NpbGVfY29uZmlnLmhlYXRfY29uZmlnO1xuICAgIGlmIChoZWF0Q29uZmlnKSB7XG4gICAgICBoZWF0UGFyYW1zID0ge1xuICAgICAgICBtYXg6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLm1heCkgPyBoZWF0Q29uZmlnLm1heCEgOiBwcmV2SGVhdD8ubWF4ID8/IDAsXG4gICAgICAgIHdhcm5BdDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcud2Fybl9hdCkgPyBoZWF0Q29uZmlnLndhcm5fYXQhIDogcHJldkhlYXQ/Lndhcm5BdCA/PyAwLFxuICAgICAgICBvdmVyaGVhdEF0OiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5vdmVyaGVhdF9hdCkgPyBoZWF0Q29uZmlnLm92ZXJoZWF0X2F0ISA6IHByZXZIZWF0Py5vdmVyaGVhdEF0ID8/IDAsXG4gICAgICAgIG1hcmtlclNwZWVkOiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5tYXJrZXJfc3BlZWQpID8gaGVhdENvbmZpZy5tYXJrZXJfc3BlZWQhIDogcHJldkhlYXQ/Lm1hcmtlclNwZWVkID8/IDAsXG4gICAgICAgIGtVcDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcua191cCkgPyBoZWF0Q29uZmlnLmtfdXAhIDogcHJldkhlYXQ/LmtVcCA/PyAwLFxuICAgICAgICBrRG93bjogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcua19kb3duKSA/IGhlYXRDb25maWcua19kb3duISA6IHByZXZIZWF0Py5rRG93biA/PyAwLFxuICAgICAgICBleHA6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLmV4cCkgPyBoZWF0Q29uZmlnLmV4cCEgOiBwcmV2SGVhdD8uZXhwID8/IDEsXG4gICAgICB9O1xuICAgIH1cbiAgICBjb25zdCBzYW5pdGl6ZWQgPSBzYW5pdGl6ZU1pc3NpbGVDb25maWcoe1xuICAgICAgc3BlZWQ6IG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZCxcbiAgICAgIGFncm9SYWRpdXM6IG1zZy5taXNzaWxlX2NvbmZpZy5hZ3JvX3JhZGl1cyxcbiAgICAgIGhlYXRQYXJhbXMsXG4gICAgfSwgc3RhdGUubWlzc2lsZUNvbmZpZywgc3RhdGUubWlzc2lsZUxpbWl0cyk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcubGlmZXRpbWUpKSB7XG4gICAgICBzYW5pdGl6ZWQubGlmZXRpbWUgPSBtc2cubWlzc2lsZV9jb25maWcubGlmZXRpbWUhO1xuICAgIH1cbiAgICBzdGF0ZS5taXNzaWxlQ29uZmlnID0gc2FuaXRpemVkO1xuICB9XG5cbiAgY29uc3QgbWV0YSA9IG1zZy5tZXRhID8/IHt9O1xuICBjb25zdCBoYXNDID0gdHlwZW9mIG1ldGEuYyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5jKTtcbiAgY29uc3QgaGFzVyA9IHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudyk7XG4gIGNvbnN0IGhhc0ggPSB0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpO1xuICBzdGF0ZS53b3JsZE1ldGEgPSB7XG4gICAgYzogaGFzQyA/IG1ldGEuYyEgOiBzdGF0ZS53b3JsZE1ldGEuYyxcbiAgICB3OiBoYXNXID8gbWV0YS53ISA6IHN0YXRlLndvcmxkTWV0YS53LFxuICAgIGg6IGhhc0ggPyBtZXRhLmghIDogc3RhdGUud29ybGRNZXRhLmgsXG4gIH07XG5cbiAgaWYgKHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA+IHByZXZNaXNzaWxlQ291bnQpIHtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZUlkID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgaWYgKGFjdGl2ZVJvdXRlSWQpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IGFjdGl2ZVJvdXRlSWQgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IFwiXCIgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY29vbGRvd25SZW1haW5pbmcgPSBNYXRoLm1heCgwLCBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpKTtcbiAgYnVzLmVtaXQoXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiLCB7IHNlY29uZHNSZW1haW5pbmc6IGNvb2xkb3duUmVtYWluaW5nIH0pO1xufVxuXG5mdW5jdGlvbiBkaWZmUm91dGVzKHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sIG5leHRSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdLCBidXM6IEV2ZW50QnVzKTogdm9pZCB7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByb3V0ZSBvZiBuZXh0Um91dGVzKSB7XG4gICAgc2Vlbi5hZGQocm91dGUuaWQpO1xuICAgIGNvbnN0IHByZXYgPSBwcmV2Um91dGVzLmdldChyb3V0ZS5pZCk7XG4gICAgaWYgKCFwcmV2KSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChyb3V0ZS5uYW1lICE9PSBwcmV2Lm5hbWUpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgbmFtZTogcm91dGUubmFtZSB9KTtcbiAgICB9XG4gICAgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPiBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgICB9IGVsc2UgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPCBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHByZXYud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfVxuICAgIGlmIChwcmV2LndheXBvaW50cy5sZW5ndGggPiAwICYmIHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgW3JvdXRlSWRdIG9mIHByZXZSb3V0ZXMpIHtcbiAgICBpZiAoIXNlZW4uaGFzKHJvdXRlSWQpKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVEZWxldGVkXCIsIHsgcm91dGVJZCB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xvbmVSb3V0ZShyb3V0ZTogTWlzc2lsZVJvdXRlKTogTWlzc2lsZVJvdXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSxcbiAgICB3YXlwb2ludHM6IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHNhZmVQYXJzZSh2YWx1ZTogdW5rbm93bik6IFNlcnZlclN0YXRlTWVzc2FnZSB8IG51bGwge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSkgYXMgU2VydmVyU3RhdGVNZXNzYWdlO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLndhcm4oXCJbd3NdIGZhaWxlZCB0byBwYXJzZSBtZXNzYWdlXCIsIGVycik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShzdGF0ZS5ub3cpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgY29uc3Qgc3luY2VkQXQgPSBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93U3luY2VkQXQpID8gc3RhdGUubm93U3luY2VkQXQgOiBudWxsO1xuICBpZiAoIXN5bmNlZEF0KSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICBjb25zdCBlbGFwc2VkTXMgPSBtb25vdG9uaWNOb3coKSAtIHN5bmNlZEF0O1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShlbGFwc2VkTXMpIHx8IGVsYXBzZWRNcyA8IDApIHtcbiAgICByZXR1cm4gc3RhdGUubm93O1xuICB9XG4gIHJldHVybiBzdGF0ZS5ub3cgKyBlbGFwc2VkTXMgLyAxMDAwO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0SGVhdFZpZXcoc2VydmVySGVhdDogU2VydmVySGVhdFZpZXcsIG5vd1N5bmNlZEF0TXM6IG51bWJlciwgc2VydmVyTm93U2VjOiBudW1iZXIpOiBpbXBvcnQoXCIuL3N0YXRlXCIpLkhlYXRWaWV3IHtcbiAgLy8gQ29udmVydCBzZXJ2ZXIgdGltZSAoc3RhbGxVbnRpbCBpbiBzZWNvbmRzKSB0byBjbGllbnQgdGltZSAobWlsbGlzZWNvbmRzKVxuICAvLyBzdGFsbFVudGlsIGlzIGFic29sdXRlIHNlcnZlciB0aW1lLCBzbyB3ZSBuZWVkIHRvIGNvbnZlcnQgaXQgdG8gY2xpZW50IHRpbWVcbiAgY29uc3Qgc2VydmVyU3RhbGxVbnRpbFNlYyA9IHNlcnZlckhlYXQuc3U7XG4gIGNvbnN0IG9mZnNldEZyb21Ob3dTZWMgPSBzZXJ2ZXJTdGFsbFVudGlsU2VjIC0gc2VydmVyTm93U2VjO1xuICBjb25zdCBzdGFsbFVudGlsTXMgPSBub3dTeW5jZWRBdE1zICsgKG9mZnNldEZyb21Ob3dTZWMgKiAxMDAwKTtcblxuICBjb25zdCBoZWF0VmlldyA9IHtcbiAgICB2YWx1ZTogc2VydmVySGVhdC52LFxuICAgIG1heDogc2VydmVySGVhdC5tLFxuICAgIHdhcm5BdDogc2VydmVySGVhdC53LFxuICAgIG92ZXJoZWF0QXQ6IHNlcnZlckhlYXQubyxcbiAgICBtYXJrZXJTcGVlZDogc2VydmVySGVhdC5tcyxcbiAgICBzdGFsbFVudGlsTXM6IHN0YWxsVW50aWxNcyxcbiAgICBrVXA6IHNlcnZlckhlYXQua3UsXG4gICAga0Rvd246IHNlcnZlckhlYXQua2QsXG4gICAgZXhwOiBzZXJ2ZXJIZWF0LmV4LFxuICB9O1xuICByZXR1cm4gaGVhdFZpZXc7XG59XG4iLCAiLy8gU2hhcmVkIHJvdXRlIHBsYW5uaW5nIG1vZHVsZSBmb3Igc2hpcHMgYW5kIG1pc3NpbGVzXG4vLyBQaGFzZSAxOiBTaGFyZWQgTW9kZWwgJiBIZWxwZXJzXG5cbmltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4vc3RhdGVcIjtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVHlwZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGludGVyZmFjZSBSb3V0ZVdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHNwZWVkPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlUG9pbnRzIHtcbiAgd2F5cG9pbnRzOiBSb3V0ZVdheXBvaW50W107XG4gIHdvcmxkUG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXTtcbiAgY2FudmFzUG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQ29uc3RhbnRzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBjb25zdCBXQVlQT0lOVF9ISVRfUkFESVVTID0gMTI7XG5leHBvcnQgY29uc3QgTEVHX0hJVF9ESVNUQU5DRSA9IDEwO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBCdWlsZGVyc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIEJ1aWxkcyByb3V0ZSBwb2ludHMgZnJvbSBhIHN0YXJ0IHBvc2l0aW9uIGFuZCB3YXlwb2ludHMuXG4gKiBJbmNsdWRlcyB3b3JsZCBjb29yZGluYXRlcyAod3JhcHBpbmcpIGFuZCBjYW52YXMgY29vcmRpbmF0ZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFJvdXRlUG9pbnRzKFxuICBzdGFydDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICB3YXlwb2ludHM6IFJvdXRlV2F5cG9pbnRbXSxcbiAgd29ybGQ6IHsgdzogbnVtYmVyOyBoOiBudW1iZXIgfSxcbiAgY2FtZXJhOiAoKSA9PiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gIHpvb206ICgpID0+IG51bWJlcixcbiAgd29ybGRUb0NhbnZhczogKHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSkgPT4geyB4OiBudW1iZXI7IHk6IG51bWJlciB9XG4pOiBSb3V0ZVBvaW50cyB7XG4gIGNvbnN0IHdvcmxkUG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXSA9IFt7IHg6IHN0YXJ0LngsIHk6IHN0YXJ0LnkgfV07XG5cbiAgZm9yIChjb25zdCB3cCBvZiB3YXlwb2ludHMpIHtcbiAgICB3b3JsZFBvaW50cy5wdXNoKHsgeDogd3AueCwgeTogd3AueSB9KTtcbiAgfVxuXG4gIGNvbnN0IGNhbnZhc1BvaW50cyA9IHdvcmxkUG9pbnRzLm1hcCgocG9pbnQpID0+IHdvcmxkVG9DYW52YXMocG9pbnQpKTtcblxuICByZXR1cm4ge1xuICAgIHdheXBvaW50czogd2F5cG9pbnRzLnNsaWNlKCksXG4gICAgd29ybGRQb2ludHMsXG4gICAgY2FudmFzUG9pbnRzLFxuICB9O1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBHZW9tZXRyeSAvIEhpdC10ZXN0XG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZGlzdGFuY2UgZnJvbSBhIHBvaW50IHRvIGEgbGluZSBzZWdtZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcG9pbnRTZWdtZW50RGlzdGFuY2UoXG4gIHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSxcbiAgYTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICBiOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1cbik6IG51bWJlciB7XG4gIGNvbnN0IGFieCA9IGIueCAtIGEueDtcbiAgY29uc3QgYWJ5ID0gYi55IC0gYS55O1xuICBjb25zdCBhcHggPSBwLnggLSBhLng7XG4gIGNvbnN0IGFweSA9IHAueSAtIGEueTtcbiAgY29uc3QgYWJMZW5TcSA9IGFieCAqIGFieCArIGFieSAqIGFieTtcbiAgY29uc3QgdCA9IGFiTGVuU3EgPT09IDAgPyAwIDogY2xhbXAoYXB4ICogYWJ4ICsgYXB5ICogYWJ5LCAwLCBhYkxlblNxKSAvIGFiTGVuU3E7XG4gIGNvbnN0IHByb2p4ID0gYS54ICsgYWJ4ICogdDtcbiAgY29uc3QgcHJvankgPSBhLnkgKyBhYnkgKiB0O1xuICBjb25zdCBkeCA9IHAueCAtIHByb2p4O1xuICBjb25zdCBkeSA9IHAueSAtIHByb2p5O1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG4vKipcbiAqIEhpdC10ZXN0cyBhIHJvdXRlIGFnYWluc3QgYSBjYW52YXMgcG9pbnQuXG4gKiBSZXR1cm5zIHRoZSBoaXQgdHlwZSBhbmQgaW5kZXgsIG9yIG51bGwgaWYgbm8gaGl0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGl0VGVzdFJvdXRlR2VuZXJpYyhcbiAgY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSxcbiAgcm91dGVQb2ludHM6IFJvdXRlUG9pbnRzLFxuICBvcHRzOiB7XG4gICAgd2F5cG9pbnRIaXRSYWRpdXM/OiBudW1iZXI7XG4gICAgbGVnSGl0RGlzdGFuY2U/OiBudW1iZXI7XG4gICAgc2tpcExlZ3M/OiBib29sZWFuO1xuICB9ID0ge31cbik6IHsgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjsgaW5kZXg6IG51bWJlciB9IHwgbnVsbCB7XG4gIGNvbnN0IHdheXBvaW50SGl0UmFkaXVzID0gb3B0cy53YXlwb2ludEhpdFJhZGl1cyA/PyBXQVlQT0lOVF9ISVRfUkFESVVTO1xuICBjb25zdCBsZWdIaXREaXN0YW5jZSA9IG9wdHMubGVnSGl0RGlzdGFuY2UgPz8gTEVHX0hJVF9ESVNUQU5DRTtcbiAgY29uc3Qgc2tpcExlZ3MgPSBvcHRzLnNraXBMZWdzID8/IGZhbHNlO1xuXG4gIGNvbnN0IHsgd2F5cG9pbnRzLCBjYW52YXNQb2ludHMgfSA9IHJvdXRlUG9pbnRzO1xuXG4gIGlmICh3YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBDaGVjayB3YXlwb2ludHMgZmlyc3QgKGhpZ2hlciBwcmlvcml0eSB0aGFuIGxlZ3MpXG4gIC8vIFNraXAgaW5kZXggMCB3aGljaCBpcyB0aGUgc3RhcnQgcG9zaXRpb25cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB3cENhbnZhcyA9IGNhbnZhc1BvaW50c1tpICsgMV07IC8vICsxIGJlY2F1c2UgZmlyc3QgcG9pbnQgaXMgc3RhcnQgcG9zaXRpb25cbiAgICBjb25zdCBkeCA9IGNhbnZhc1BvaW50LnggLSB3cENhbnZhcy54O1xuICAgIGNvbnN0IGR5ID0gY2FudmFzUG9pbnQueSAtIHdwQ2FudmFzLnk7XG4gICAgaWYgKE1hdGguaHlwb3QoZHgsIGR5KSA8PSB3YXlwb2ludEhpdFJhZGl1cykge1xuICAgICAgcmV0dXJuIHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogaSB9O1xuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGxlZ3MgKGxvd2VyIHByaW9yaXR5KVxuICBpZiAoIXNraXBMZWdzKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGRpc3QgPSBwb2ludFNlZ21lbnREaXN0YW5jZShjYW52YXNQb2ludCwgY2FudmFzUG9pbnRzW2ldLCBjYW52YXNQb2ludHNbaSArIDFdKTtcbiAgICAgIGlmIChkaXN0IDw9IGxlZ0hpdERpc3RhbmNlKSB7XG4gICAgICAgIHJldHVybiB7IHR5cGU6IFwibGVnXCIsIGluZGV4OiBpIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIERhc2ggQW5pbWF0aW9uXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogVXBkYXRlcyBkYXNoIG9mZnNldHMgZm9yIHJvdXRlIGxlZ3MgdG8gY3JlYXRlIG1hcmNoaW5nIGFudHMgYW5pbWF0aW9uLlxuICogTXV0YXRlcyB0aGUgcHJvdmlkZWQgc3RvcmUgbWFwLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlRGFzaE9mZnNldHNGb3JSb3V0ZShcbiAgc3RvcmU6IE1hcDxudW1iZXIsIG51bWJlcj4sXG4gIHdheXBvaW50czogQXJyYXk8eyBzcGVlZD86IG51bWJlciB9PixcbiAgd29ybGRQb2ludHM6IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4sXG4gIGNhbnZhc1BvaW50czogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlciB9PixcbiAgZmFsbGJhY2tTcGVlZDogbnVtYmVyLFxuICBkdFNlY29uZHM6IG51bWJlcixcbiAgY3ljbGUgPSA2NFxuKTogdm9pZCB7XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKGR0U2Vjb25kcykgfHwgZHRTZWNvbmRzIDwgMCkge1xuICAgIGR0U2Vjb25kcyA9IDA7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwID0gd2F5cG9pbnRzW2ldO1xuICAgIGNvbnN0IHNwZWVkID0gdHlwZW9mIHdwLnNwZWVkID09PSBcIm51bWJlclwiICYmIHdwLnNwZWVkID4gMCA/IHdwLnNwZWVkIDogZmFsbGJhY2tTcGVlZDtcbiAgICBjb25zdCBhV29ybGQgPSB3b3JsZFBvaW50c1tpXTtcbiAgICBjb25zdCBiV29ybGQgPSB3b3JsZFBvaW50c1tpICsgMV07XG4gICAgY29uc3Qgd29ybGREaXN0ID0gTWF0aC5oeXBvdChiV29ybGQueCAtIGFXb3JsZC54LCBiV29ybGQueSAtIGFXb3JsZC55KTtcbiAgICBjb25zdCBhQ2FudmFzID0gY2FudmFzUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJDYW52YXMgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGNhbnZhc0Rpc3QgPSBNYXRoLmh5cG90KGJDYW52YXMueCAtIGFDYW52YXMueCwgYkNhbnZhcy55IC0gYUNhbnZhcy55KTtcblxuICAgIGlmIChcbiAgICAgICFOdW1iZXIuaXNGaW5pdGUoc3BlZWQpIHx8XG4gICAgICBzcGVlZCA8PSAxZS0zIHx8XG4gICAgICAhTnVtYmVyLmlzRmluaXRlKHdvcmxkRGlzdCkgfHxcbiAgICAgIHdvcmxkRGlzdCA8PSAxZS0zIHx8XG4gICAgICBjYW52YXNEaXN0IDw9IDFlLTNcbiAgICApIHtcbiAgICAgIHN0b3JlLnNldChpLCAwKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChkdFNlY29uZHMgPD0gMCkge1xuICAgICAgaWYgKCFzdG9yZS5oYXMoaSkpIHtcbiAgICAgICAgc3RvcmUuc2V0KGksIDApO1xuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBjYW52YXNEaXN0IC8gd29ybGREaXN0O1xuICAgIGNvbnN0IGRhc2hTcGVlZCA9IHNwZWVkICogc2NhbGU7XG4gICAgbGV0IG5leHQgPSAoc3RvcmUuZ2V0KGkpID8/IDApIC0gZGFzaFNwZWVkICogZHRTZWNvbmRzO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG5leHQpKSB7XG4gICAgICBuZXh0ID0gMDtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCA9ICgobmV4dCAlIGN5Y2xlKSArIGN5Y2xlKSAlIGN5Y2xlO1xuICAgIH1cbiAgICBzdG9yZS5zZXQoaSwgbmV4dCk7XG4gIH1cbiAgLy8gQ2xlYW4gdXAgb2xkIGtleXNcbiAgZm9yIChjb25zdCBrZXkgb2YgQXJyYXkuZnJvbShzdG9yZS5rZXlzKCkpKSB7XG4gICAgaWYgKGtleSA+PSB3YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBzdG9yZS5kZWxldGUoa2V5KTtcbiAgICB9XG4gIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gSGVhdCBQcm9qZWN0aW9uXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFByb2plY3Rpb25QYXJhbXMge1xuICBtYXJrZXJTcGVlZDogbnVtYmVyO1xuICBrVXA6IG51bWJlcjtcbiAga0Rvd246IG51bWJlcjtcbiAgZXhwOiBudW1iZXI7XG4gIG1heDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRQcm9qZWN0aW9uUmVzdWx0IHtcbiAgaGVhdEF0V2F5cG9pbnRzOiBudW1iZXJbXTtcbiAgd2lsbE92ZXJoZWF0OiBib29sZWFuO1xuICBvdmVyaGVhdEF0PzogbnVtYmVyOyAvLyBJbmRleCB3aGVyZSBvdmVyaGVhdCBvY2N1cnNcbn1cblxuLyoqXG4gKiBQcm9qZWN0cyBoZWF0IGFsb25nIGEgcm91dGUgZ2l2ZW4gaW5pdGlhbCBoZWF0IGFuZCBoZWF0IHBhcmFtZXRlcnMuXG4gKiBSZXR1cm5zIGhlYXQgYXQgZWFjaCB3YXlwb2ludCBhbmQgd2hldGhlciBvdmVyaGVhdCB3aWxsIG9jY3VyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdFJvdXRlSGVhdChcbiAgcm91dGU6IFJvdXRlV2F5cG9pbnRbXSxcbiAgaW5pdGlhbEhlYXQ6IG51bWJlcixcbiAgcGFyYW1zOiBIZWF0UHJvamVjdGlvblBhcmFtc1xuKTogSGVhdFByb2plY3Rpb25SZXN1bHQge1xuICBjb25zdCByZXN1bHQ6IEhlYXRQcm9qZWN0aW9uUmVzdWx0ID0ge1xuICAgIGhlYXRBdFdheXBvaW50czogW10sXG4gICAgd2lsbE92ZXJoZWF0OiBmYWxzZSxcbiAgfTtcblxuICBpZiAocm91dGUubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGxldCBoZWF0ID0gY2xhbXAoaW5pdGlhbEhlYXQsIDAsIHBhcmFtcy5tYXgpO1xuICBsZXQgcG9zID0geyB4OiByb3V0ZVswXS54LCB5OiByb3V0ZVswXS55IH07XG4gIGxldCBjdXJyZW50U3BlZWQgPSByb3V0ZVswXS5zcGVlZCA/PyBwYXJhbXMubWFya2VyU3BlZWQ7XG5cbiAgcmVzdWx0LmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuXG4gIGZvciAobGV0IGkgPSAxOyBpIDwgcm91dGUubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB0YXJnZXRQb3MgPSByb3V0ZVtpXTtcbiAgICBjb25zdCB0YXJnZXRTcGVlZCA9IHRhcmdldFBvcy5zcGVlZCA/PyBwYXJhbXMubWFya2VyU3BlZWQ7XG5cbiAgICAvLyBDYWxjdWxhdGUgZGlzdGFuY2UgYW5kIHRpbWVcbiAgICBjb25zdCBkeCA9IHRhcmdldFBvcy54IC0gcG9zLng7XG4gICAgY29uc3QgZHkgPSB0YXJnZXRQb3MueSAtIHBvcy55O1xuICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcblxuICAgIGlmIChkaXN0YW5jZSA8IDAuMDAxKSB7XG4gICAgICByZXN1bHQuaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBBdmVyYWdlIHNwZWVkIGR1cmluZyBzZWdtZW50XG4gICAgY29uc3QgYXZnU3BlZWQgPSAoY3VycmVudFNwZWVkICsgdGFyZ2V0U3BlZWQpICogMC41O1xuICAgIGNvbnN0IHNlZ21lbnRUaW1lID0gZGlzdGFuY2UgLyBNYXRoLm1heChhdmdTcGVlZCwgMSk7XG5cbiAgICAvLyBDYWxjdWxhdGUgaGVhdCByYXRlIChtYXRjaCBzZXJ2ZXIgZm9ybXVsYSlcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KHBhcmFtcy5tYXJrZXJTcGVlZCwgMC4wMDAwMDEpO1xuICAgIGNvbnN0IGRldiA9IGF2Z1NwZWVkIC0gcGFyYW1zLm1hcmtlclNwZWVkO1xuICAgIGNvbnN0IHAgPSBwYXJhbXMuZXhwO1xuXG4gICAgbGV0IGhkb3Q6IG51bWJlcjtcbiAgICBpZiAoZGV2ID49IDApIHtcbiAgICAgIC8vIEhlYXRpbmdcbiAgICAgIGhkb3QgPSBwYXJhbXMua1VwICogTWF0aC5wb3coZGV2IC8gVm4sIHApO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDb29saW5nXG4gICAgICBoZG90ID0gLXBhcmFtcy5rRG93biAqIE1hdGgucG93KE1hdGguYWJzKGRldikgLyBWbiwgcCk7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIGhlYXRcbiAgICBoZWF0ICs9IGhkb3QgKiBzZWdtZW50VGltZTtcbiAgICBoZWF0ID0gY2xhbXAoaGVhdCwgMCwgcGFyYW1zLm1heCk7XG5cbiAgICByZXN1bHQuaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG5cbiAgICAvLyBDaGVjayBmb3Igb3ZlcmhlYXRcbiAgICBpZiAoIXJlc3VsdC53aWxsT3ZlcmhlYXQgJiYgaGVhdCA+PSBwYXJhbXMub3ZlcmhlYXRBdCkge1xuICAgICAgcmVzdWx0LndpbGxPdmVyaGVhdCA9IHRydWU7XG4gICAgICByZXN1bHQub3ZlcmhlYXRBdCA9IGk7XG4gICAgfVxuXG4gICAgcG9zID0geyB4OiB0YXJnZXRQb3MueCwgeTogdGFyZ2V0UG9zLnkgfTtcbiAgICBjdXJyZW50U3BlZWQgPSB0YXJnZXRTcGVlZDtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ29tcGF0aWJpbGl0eSB3cmFwcGVyIGZvciBtaXNzaWxlIGhlYXQgcHJvamVjdGlvbi5cbiAqIE1pc3NpbGVzIHN0YXJ0IGF0IHplcm8gaGVhdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RNaXNzaWxlSGVhdENvbXBhdChcbiAgcm91dGU6IFJvdXRlV2F5cG9pbnRbXSxcbiAgZGVmYXVsdFNwZWVkOiBudW1iZXIsXG4gIGhlYXRQYXJhbXM6IEhlYXRQcm9qZWN0aW9uUGFyYW1zXG4pOiBIZWF0UHJvamVjdGlvblJlc3VsdCB7XG4gIC8vIE1pc3NpbGVzIHN0YXJ0IGF0IHplcm8gaGVhdFxuICAvLyBFbnN1cmUgYWxsIHdheXBvaW50cyBoYXZlIHNwZWVkIHNldCAodXNlIGRlZmF1bHQgaWYgbWlzc2luZylcbiAgY29uc3Qgcm91dGVXaXRoU3BlZWQgPSByb3V0ZS5tYXAoKHdwKSA9PiAoe1xuICAgIHg6IHdwLngsXG4gICAgeTogd3AueSxcbiAgICBzcGVlZDogd3Auc3BlZWQgPz8gZGVmYXVsdFNwZWVkLFxuICB9KSk7XG5cbiAgcmV0dXJuIHByb2plY3RSb3V0ZUhlYXQocm91dGVXaXRoU3BlZWQsIDAsIGhlYXRQYXJhbXMpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBSZW5kZXJpbmdcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBMaW5lYXIgY29sb3IgaW50ZXJwb2xhdGlvbiBiZXR3ZWVuIHR3byBSR0IgY29sb3JzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW50ZXJwb2xhdGVDb2xvcihcbiAgY29sb3IxOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG4gIGNvbG9yMjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuICB0OiBudW1iZXJcbik6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB7XG4gIHJldHVybiBbXG4gICAgTWF0aC5yb3VuZChjb2xvcjFbMF0gKyAoY29sb3IyWzBdIC0gY29sb3IxWzBdKSAqIHQpLFxuICAgIE1hdGgucm91bmQoY29sb3IxWzFdICsgKGNvbG9yMlsxXSAtIGNvbG9yMVsxXSkgKiB0KSxcbiAgICBNYXRoLnJvdW5kKGNvbG9yMVsyXSArIChjb2xvcjJbMl0gLSBjb2xvcjFbMl0pICogdCksXG4gIF07XG59XG5cbi8qKlxuICogQ29sb3IgcGFsZXR0ZSBmb3Igcm91dGUgcmVuZGVyaW5nLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlUGFsZXR0ZSB7XG4gIC8vIERlZmF1bHQgbGluZSBjb2xvciAod2hlbiBubyBoZWF0IGRhdGEpXG4gIGRlZmF1bHRMaW5lOiBzdHJpbmc7XG4gIC8vIFNlbGVjdGlvbiBoaWdobGlnaHQgY29sb3JcbiAgc2VsZWN0aW9uOiBzdHJpbmc7XG4gIC8vIFdheXBvaW50IGNvbG9yc1xuICB3YXlwb2ludERlZmF1bHQ6IHN0cmluZztcbiAgd2F5cG9pbnRTZWxlY3RlZDogc3RyaW5nO1xuICB3YXlwb2ludERyYWdnaW5nPzogc3RyaW5nO1xuICB3YXlwb2ludFN0cm9rZTogc3RyaW5nO1xuICB3YXlwb2ludFN0cm9rZVNlbGVjdGVkPzogc3RyaW5nO1xuICAvLyBIZWF0IGdyYWRpZW50IGNvbG9ycyAoZnJvbSBjb29sIHRvIGhvdClcbiAgaGVhdENvb2xSZ2I/OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG4gIGhlYXRIb3RSZ2I/OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG59XG5cbi8qKlxuICogRGVmYXVsdCBzaGlwIHBhbGV0dGUgKGJsdWUgdGhlbWUpLlxuICovXG5leHBvcnQgY29uc3QgU0hJUF9QQUxFVFRFOiBSb3V0ZVBhbGV0dGUgPSB7XG4gIGRlZmF1bHRMaW5lOiBcIiMzOGJkZjhcIixcbiAgc2VsZWN0aW9uOiBcIiNmOTczMTZcIixcbiAgd2F5cG9pbnREZWZhdWx0OiBcIiMzOGJkZjhcIixcbiAgd2F5cG9pbnRTZWxlY3RlZDogXCIjZjk3MzE2XCIsXG4gIHdheXBvaW50RHJhZ2dpbmc6IFwiI2ZhY2MxNVwiLFxuICB3YXlwb2ludFN0cm9rZTogXCIjMGYxNzJhXCIsXG4gIGhlYXRDb29sUmdiOiBbMTAwLCAxNTAsIDI1NV0sXG4gIGhlYXRIb3RSZ2I6IFsyNTUsIDUwLCA1MF0sXG59O1xuXG4vKipcbiAqIE1pc3NpbGUgcGFsZXR0ZSAocmVkIHRoZW1lKS5cbiAqL1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfUEFMRVRURTogUm91dGVQYWxldHRlID0ge1xuICBkZWZhdWx0TGluZTogXCIjZjg3MTcxYWFcIixcbiAgc2VsZWN0aW9uOiBcIiNmOTczMTZcIixcbiAgd2F5cG9pbnREZWZhdWx0OiBcIiNmODcxNzFcIixcbiAgd2F5cG9pbnRTZWxlY3RlZDogXCIjZmFjYzE1XCIsXG4gIHdheXBvaW50U3Ryb2tlOiBcIiM3ZjFkMWRcIixcbiAgd2F5cG9pbnRTdHJva2VTZWxlY3RlZDogXCIjODU0ZDBlXCIsXG4gIGhlYXRDb29sUmdiOiBbMjQ4LCAxMjksIDEyOV0sXG4gIGhlYXRIb3RSZ2I6IFsyMjAsIDM4LCAzOF0sXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIERyYXdQbGFubmVkUm91dGVPcHRpb25zIHtcbiAgLy8gQ2FudmFzIHBvaW50cyBmb3IgdGhlIHJvdXRlXG4gIHJvdXRlUG9pbnRzOiBSb3V0ZVBvaW50cztcbiAgLy8gU2VsZWN0aW9uIHN0YXRlICh3aGljaCB3YXlwb2ludC9sZWcgaXMgc2VsZWN0ZWQpXG4gIHNlbGVjdGlvbjogeyB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiOyBpbmRleDogbnVtYmVyIH0gfCBudWxsO1xuICAvLyBEcmFnZ2VkIHdheXBvaW50IGluZGV4IChmb3IgZHJhZy1hbmQtZHJvcClcbiAgZHJhZ2dlZFdheXBvaW50PzogbnVtYmVyIHwgbnVsbDtcbiAgLy8gRGFzaCBhbmltYXRpb24gb2Zmc2V0c1xuICBkYXNoU3RvcmU6IE1hcDxudW1iZXIsIG51bWJlcj47XG4gIC8vIENvbG9yIHBhbGV0dGUgKGRlZmF1bHRzIHRvIHNoaXAgcGFsZXR0ZSlcbiAgcGFsZXR0ZT86IFJvdXRlUGFsZXR0ZTtcbiAgLy8gV2hldGhlciB0byBzaG93IHRoZSByb3V0ZSBsZWdzXG4gIHNob3dMZWdzOiBib29sZWFuO1xuICAvLyBIZWF0IHBhcmFtZXRlcnMgYW5kIGluaXRpYWwgaGVhdCAob3B0aW9uYWwpXG4gIGhlYXRQYXJhbXM/OiBIZWF0UHJvamVjdGlvblBhcmFtcztcbiAgaW5pdGlhbEhlYXQ/OiBudW1iZXI7XG4gIC8vIERlZmF1bHQgc3BlZWQgZm9yIHdheXBvaW50cyB3aXRob3V0IHNwZWVkIHNldFxuICBkZWZhdWx0U3BlZWQ6IG51bWJlcjtcbiAgLy8gV29ybGQgcG9pbnRzIChmb3IgaGVhdCBjYWxjdWxhdGlvbilcbiAgd29ybGRQb2ludHM/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXTtcbn1cblxuLyoqXG4gKiBEcmF3cyBhIHBsYW5uZWQgcm91dGUgKHNoaXAgb3IgbWlzc2lsZSkgd2l0aCB1bmlmaWVkIHZpc3VhbHMuXG4gKiBVc2VzIHNoaXAtc3R5bGUgcmVuZGVyaW5nIGJ5IGRlZmF1bHQsIHdpdGggb3B0aW9uYWwgcGFsZXR0ZSBvdmVycmlkZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRyYXdQbGFubmVkUm91dGUoXG4gIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuICBvcHRzOiBEcmF3UGxhbm5lZFJvdXRlT3B0aW9uc1xuKTogdm9pZCB7XG4gIGNvbnN0IHtcbiAgICByb3V0ZVBvaW50cyxcbiAgICBzZWxlY3Rpb24sXG4gICAgZHJhZ2dlZFdheXBvaW50LFxuICAgIGRhc2hTdG9yZSxcbiAgICBwYWxldHRlID0gU0hJUF9QQUxFVFRFLFxuICAgIHNob3dMZWdzLFxuICAgIGhlYXRQYXJhbXMsXG4gICAgaW5pdGlhbEhlYXQgPSAwLFxuICAgIGRlZmF1bHRTcGVlZCxcbiAgICB3b3JsZFBvaW50cyxcbiAgfSA9IG9wdHM7XG5cbiAgY29uc3QgeyB3YXlwb2ludHMsIGNhbnZhc1BvaW50cyB9ID0gcm91dGVQb2ludHM7XG5cbiAgaWYgKHdheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBDYWxjdWxhdGUgaGVhdCBwcm9qZWN0aW9uIGlmIGhlYXQgcGFyYW1zIGF2YWlsYWJsZVxuICBsZXQgaGVhdFByb2plY3Rpb246IEhlYXRQcm9qZWN0aW9uUmVzdWx0IHwgbnVsbCA9IG51bGw7XG4gIGlmIChoZWF0UGFyYW1zICYmIHdvcmxkUG9pbnRzICYmIHdvcmxkUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCByb3V0ZUZvckhlYXQ6IFJvdXRlV2F5cG9pbnRbXSA9IHdvcmxkUG9pbnRzLm1hcCgocHQsIGkpID0+ICh7XG4gICAgICB4OiBwdC54LFxuICAgICAgeTogcHQueSxcbiAgICAgIHNwZWVkOiBpID09PSAwID8gdW5kZWZpbmVkIDogd2F5cG9pbnRzW2kgLSAxXT8uc3BlZWQgPz8gZGVmYXVsdFNwZWVkLFxuICAgIH0pKTtcbiAgICBoZWF0UHJvamVjdGlvbiA9IHByb2plY3RSb3V0ZUhlYXQocm91dGVGb3JIZWF0LCBpbml0aWFsSGVhdCwgaGVhdFBhcmFtcyk7XG4gIH1cblxuICAvLyBEcmF3IHJvdXRlIHNlZ21lbnRzXG4gIGlmIChzaG93TGVncykge1xuICAgIGxldCBjdXJyZW50SGVhdCA9IGluaXRpYWxIZWF0O1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGlzRmlyc3RMZWcgPSBpID09PSAwO1xuICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHNlbGVjdGlvbj8udHlwZSA9PT0gXCJsZWdcIiAmJiBzZWxlY3Rpb24uaW5kZXggPT09IGk7XG5cbiAgICAgIC8vIEdldCBoZWF0IGF0IGVuZCBvZiB0aGlzIHNlZ21lbnRcbiAgICAgIGxldCBzZWdtZW50SGVhdCA9IGN1cnJlbnRIZWF0O1xuICAgICAgaWYgKGhlYXRQcm9qZWN0aW9uICYmIGkgKyAxIDwgaGVhdFByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLmxlbmd0aCkge1xuICAgICAgICBzZWdtZW50SGVhdCA9IGhlYXRQcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50c1tpICsgMV07XG4gICAgICB9XG5cbiAgICAgIC8vIENhbGN1bGF0ZSBoZWF0LWJhc2VkIGNvbG9yIGlmIGhlYXQgZGF0YSBhdmFpbGFibGVcbiAgICAgIGxldCBzdHJva2VTdHlsZTogc3RyaW5nO1xuICAgICAgbGV0IGxpbmVXaWR0aDogbnVtYmVyO1xuICAgICAgbGV0IGxpbmVEYXNoOiBudW1iZXJbXSB8IG51bGwgPSBudWxsO1xuICAgICAgbGV0IGFscGhhT3ZlcnJpZGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gICAgICBpZiAoaXNTZWxlY3RlZCkge1xuICAgICAgICAvLyBTZWxlY3Rpb24gc3R5bGluZ1xuICAgICAgICBzdHJva2VTdHlsZSA9IHBhbGV0dGUuc2VsZWN0aW9uO1xuICAgICAgICBsaW5lV2lkdGggPSAzLjU7XG4gICAgICAgIGxpbmVEYXNoID0gWzQsIDRdO1xuICAgICAgfSBlbHNlIGlmIChoZWF0UHJvamVjdGlvbiAmJiBoZWF0UGFyYW1zICYmIHBhbGV0dGUuaGVhdENvb2xSZ2IgJiYgcGFsZXR0ZS5oZWF0SG90UmdiKSB7XG4gICAgICAgIC8vIEhlYXQtYmFzZWQgY29sb3IgaW50ZXJwb2xhdGlvbiAoc2hpcCBzdHlsZSlcbiAgICAgICAgY29uc3QgaGVhdFJhdGlvID0gY2xhbXAoc2VnbWVudEhlYXQgLyBoZWF0UGFyYW1zLm92ZXJoZWF0QXQsIDAsIDEpO1xuICAgICAgICBjb25zdCBjb2xvciA9IGludGVycG9sYXRlQ29sb3IocGFsZXR0ZS5oZWF0Q29vbFJnYiwgcGFsZXR0ZS5oZWF0SG90UmdiLCBoZWF0UmF0aW8pO1xuICAgICAgICBjb25zdCBiYXNlV2lkdGggPSBpc0ZpcnN0TGVnID8gMyA6IDEuNTtcbiAgICAgICAgbGluZVdpZHRoID0gYmFzZVdpZHRoICsgaGVhdFJhdGlvICogNDtcbiAgICAgICAgY29uc3QgYWxwaGEgPSBpc0ZpcnN0TGVnID8gMSA6IDAuNDtcbiAgICAgICAgc3Ryb2tlU3R5bGUgPSBgcmdiYSgke2NvbG9yWzBdfSwgJHtjb2xvclsxXX0sICR7Y29sb3JbMl19LCAke2FscGhhfSlgO1xuICAgICAgICBsaW5lRGFzaCA9IGlzRmlyc3RMZWcgPyBbNiwgNl0gOiBbOCwgOF07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEZWZhdWx0IHN0eWxpbmcgKG5vIGhlYXQpXG4gICAgICAgIGNvbnN0IGJhc2VXaWR0aCA9IGlzRmlyc3RMZWcgPyAzIDogMS41O1xuICAgICAgICBsaW5lV2lkdGggPSBiYXNlV2lkdGg7XG4gICAgICAgIHN0cm9rZVN0eWxlID0gcGFsZXR0ZS5kZWZhdWx0TGluZTtcbiAgICAgICAgbGluZURhc2ggPSBpc0ZpcnN0TGVnID8gWzYsIDZdIDogWzgsIDhdO1xuICAgICAgICBhbHBoYU92ZXJyaWRlID0gaXNGaXJzdExlZyA/IDEgOiAwLjQ7XG4gICAgICB9XG5cbiAgICAgIGN0eC5zYXZlKCk7XG4gICAgICBpZiAobGluZURhc2gpIHtcbiAgICAgICAgY3R4LnNldExpbmVEYXNoKGxpbmVEYXNoKTtcbiAgICAgIH1cbiAgICAgIGlmIChhbHBoYU92ZXJyaWRlICE9PSBudWxsKSB7XG4gICAgICAgIGN0eC5nbG9iYWxBbHBoYSA9IGFscGhhT3ZlcnJpZGU7XG4gICAgICB9XG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHJva2VTdHlsZTtcbiAgICAgIGN0eC5saW5lV2lkdGggPSBsaW5lV2lkdGg7XG4gICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICBjdHgubGluZURhc2hPZmZzZXQgPSBkYXNoU3RvcmUuZ2V0KGkpID8/IDA7XG4gICAgICBjdHgubW92ZVRvKGNhbnZhc1BvaW50c1tpXS54LCBjYW52YXNQb2ludHNbaV0ueSk7XG4gICAgICBjdHgubGluZVRvKGNhbnZhc1BvaW50c1tpICsgMV0ueCwgY2FudmFzUG9pbnRzW2kgKyAxXS55KTtcbiAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgIGN0eC5yZXN0b3JlKCk7XG5cbiAgICAgIGN1cnJlbnRIZWF0ID0gc2VnbWVudEhlYXQ7XG4gICAgfVxuICB9XG5cbiAgLy8gRHJhdyB3YXlwb2ludCBtYXJrZXJzXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcHQgPSBjYW52YXNQb2ludHNbaSArIDFdOyAvLyArMSBiZWNhdXNlIGZpcnN0IHBvaW50IGlzIHN0YXJ0IHBvc2l0aW9uXG4gICAgY29uc3QgaXNTZWxlY3RlZCA9IHNlbGVjdGlvbj8udHlwZSA9PT0gXCJ3YXlwb2ludFwiICYmIHNlbGVjdGlvbi5pbmRleCA9PT0gaTtcbiAgICBjb25zdCBpc0RyYWdnaW5nID0gZHJhZ2dlZFdheXBvaW50ID09PSBpO1xuXG4gICAgLy8gRGV0ZXJtaW5lIGZpbGwgY29sb3JcbiAgICBsZXQgZmlsbENvbG9yOiBzdHJpbmc7XG4gICAgaWYgKGlzU2VsZWN0ZWQpIHtcbiAgICAgIGZpbGxDb2xvciA9IHBhbGV0dGUud2F5cG9pbnRTZWxlY3RlZDtcbiAgICB9IGVsc2UgaWYgKGlzRHJhZ2dpbmcgJiYgcGFsZXR0ZS53YXlwb2ludERyYWdnaW5nKSB7XG4gICAgICBmaWxsQ29sb3IgPSBwYWxldHRlLndheXBvaW50RHJhZ2dpbmc7XG4gICAgfSBlbHNlIGlmIChoZWF0UHJvamVjdGlvbiAmJiBoZWF0UGFyYW1zKSB7XG4gICAgICAvLyBIZWF0LWJhc2VkIHdheXBvaW50IGNvbG9yaW5nICh0aHJlc2hvbGQtYmFzZWQgZm9yIG1pc3NpbGVzKVxuICAgICAgY29uc3QgaGVhdCA9IGhlYXRQcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50c1tpICsgMV0gPz8gMDtcbiAgICAgIGNvbnN0IGhlYXRSYXRpbyA9IGhlYXQgLyBoZWF0UGFyYW1zLm1heDtcbiAgICAgIGNvbnN0IHdhcm5SYXRpbyA9IGhlYXRQYXJhbXMud2FybkF0IC8gaGVhdFBhcmFtcy5tYXg7XG4gICAgICBjb25zdCBvdmVyaGVhdFJhdGlvID0gaGVhdFBhcmFtcy5vdmVyaGVhdEF0IC8gaGVhdFBhcmFtcy5tYXg7XG5cbiAgICAgIGlmIChoZWF0UmF0aW8gPCB3YXJuUmF0aW8pIHtcbiAgICAgICAgZmlsbENvbG9yID0gXCIjMzNhYTMzXCI7IC8vIEdyZWVuXG4gICAgICB9IGVsc2UgaWYgKGhlYXRSYXRpbyA8IG92ZXJoZWF0UmF0aW8pIHtcbiAgICAgICAgZmlsbENvbG9yID0gXCIjZmZhYTMzXCI7IC8vIE9yYW5nZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZmlsbENvbG9yID0gXCIjZmYzMzMzXCI7IC8vIFJlZFxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmaWxsQ29sb3IgPSBwYWxldHRlLndheXBvaW50RGVmYXVsdDtcbiAgICB9XG5cbiAgICAvLyBEZXRlcm1pbmUgc3Ryb2tlIGNvbG9yXG4gICAgY29uc3Qgc3Ryb2tlQ29sb3IgPSBpc1NlbGVjdGVkICYmIHBhbGV0dGUud2F5cG9pbnRTdHJva2VTZWxlY3RlZFxuICAgICAgPyBwYWxldHRlLndheXBvaW50U3Ryb2tlU2VsZWN0ZWRcbiAgICAgIDogcGFsZXR0ZS53YXlwb2ludFN0cm9rZTtcblxuICAgIC8vIERyYXcgd2F5cG9pbnRcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjb25zdCByYWRpdXMgPSBpc1NlbGVjdGVkIHx8IGlzRHJhZ2dpbmcgPyA3IDogNTtcbiAgICBjdHguYXJjKHB0LngsIHB0LnksIHJhZGl1cywgMCwgTWF0aC5QSSAqIDIpO1xuICAgIGN0eC5maWxsU3R5bGUgPSBmaWxsQ29sb3I7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gaXNTZWxlY3RlZCB8fCBpc0RyYWdnaW5nID8gMC45NSA6IDAuODtcbiAgICBjdHguZmlsbCgpO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IDE7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGlzU2VsZWN0ZWQgPyAyIDogMS41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0cm9rZUNvbG9yO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuICB9XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHsgZ2V0QXBwcm94U2VydmVyTm93LCBzZW5kTWVzc2FnZSB9IGZyb20gXCIuL25ldFwiO1xuaW1wb3J0IHtcbiAgdHlwZSBBY3RpdmVUb29sLFxuICB0eXBlIEFwcFN0YXRlLFxuICB0eXBlIE1pc3NpbGVSb3V0ZSxcbiAgdHlwZSBNaXNzaWxlU2VsZWN0aW9uLFxuICB0eXBlIFNlbGVjdGlvbixcbiAgdHlwZSBVSVN0YXRlLFxuICBjbGFtcCxcbiAgc2FuaXRpemVNaXNzaWxlQ29uZmlnLFxuICBNSVNTSUxFX1BSRVNFVFMsXG59IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQge1xuICBNSVNTSUxFX01JTl9TUEVFRCxcbiAgTUlTU0lMRV9NQVhfU1BFRUQsXG4gIE1JU1NJTEVfTUlOX0FHUk8sXG59IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQge1xuICBidWlsZFJvdXRlUG9pbnRzLFxuICBoaXRUZXN0Um91dGVHZW5lcmljLFxuICB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlLFxuICBwcm9qZWN0Um91dGVIZWF0LFxuICBkcmF3UGxhbm5lZFJvdXRlLFxuICBTSElQX1BBTEVUVEUsXG4gIE1JU1NJTEVfUEFMRVRURSxcbiAgV0FZUE9JTlRfSElUX1JBRElVUyxcbiAgdHlwZSBSb3V0ZVBvaW50cyxcbiAgdHlwZSBIZWF0UHJvamVjdGlvblBhcmFtcyxcbn0gZnJvbSBcIi4vcm91dGVcIjtcblxuaW50ZXJmYWNlIEluaXRHYW1lT3B0aW9ucyB7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgdWlTdGF0ZTogVUlTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbn1cblxuaW50ZXJmYWNlIEdhbWVDb250cm9sbGVyIHtcbiAgb25TdGF0ZVVwZGF0ZWQoKTogdm9pZDtcbn1cblxubGV0IHN0YXRlUmVmOiBBcHBTdGF0ZTtcbmxldCB1aVN0YXRlUmVmOiBVSVN0YXRlO1xubGV0IGJ1c1JlZjogRXZlbnRCdXM7XG5cbmxldCBjdjogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCB8IG51bGwgPSBudWxsO1xubGV0IEhQc3BhbjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBraWxsc1NwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcENvbnRyb2xzQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwQ2xlYXJCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNldEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU2VsZWN0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBSb3V0ZXNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFJvdXRlTGVnOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBSb3V0ZVNwZWVkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBEZWxldGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNwZWVkQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRTbGlkZXI6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwU3BlZWRWYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRNYXJrZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCBtaXNzaWxlQ29udHJvbHNDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVBZGRSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlTGF1bmNoQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVMYXVuY2hUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVMYXVuY2hJbmZvOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTZXRCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNlbGVjdEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlRGVsZXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTcGVlZENhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNwZWVkU2xpZGVyOiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNwZWVkVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUFncm9DYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVBZ3JvU2xpZGVyOiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUFncm9WYWx1ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzcGF3bkJvdEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzcGF3bkJvdFRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCByb3V0ZVByZXZCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcm91dGVOZXh0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJvdXRlTWVudVRvZ2dsZTogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByb3V0ZU1lbnU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcmVuYW1lTWlzc2lsZVJvdXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGRlbGV0ZU1pc3NpbGVSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVJvdXRlTmFtZUxhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVSb3V0ZUNvdW50TGFiZWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCBoZWxwVG9nZ2xlOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGhlbHBPdmVybGF5OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGhlbHBDbG9zZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxubGV0IGhlYXRCYXJGaWxsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGhlYXRCYXJQbGFubmVkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IGhlYXRWYWx1ZVRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3BlZWRNYXJrZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3RhbGxPdmVybGF5OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1hcmtlckFsaWduZWQgPSBmYWxzZTtcbmxldCBoZWF0V2FybkFjdGl2ZSA9IGZhbHNlO1xubGV0IHN0YWxsQWN0aXZlID0gZmFsc2U7XG5sZXQgZHVhbE1ldGVyQWxlcnQgPSBmYWxzZTtcblxubGV0IHNlbGVjdGlvbjogU2VsZWN0aW9uIHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xubGV0IGRlZmF1bHRTcGVlZCA9IDE1MDtcbmxldCBsYXN0TWlzc2lsZUxlZ1NwZWVkID0gMDtcbmxldCBsYXN0TG9vcFRzOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmxldCBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQ6IHsgc3BlZWQ6IG51bWJlcjsgYWdyb1JhZGl1czogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcbmNvbnN0IHNoaXBMZWdEYXNoT2Zmc2V0cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5jb25zdCBtaXNzaWxlTGVnRGFzaE9mZnNldHMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xubGV0IGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgPSBcIlwiO1xubGV0IGxhc3RNaXNzaWxlTGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xubGV0IGxhc3RUb3VjaERpc3RhbmNlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmxldCBwZW5kaW5nVG91Y2hUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xubGV0IGlzUGluY2hpbmcgPSBmYWxzZTtcblxuLy8gV2F5cG9pbnQgZHJhZ2dpbmcgc3RhdGVcbmxldCBkcmFnZ2VkV2F5cG9pbnQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xubGV0IGRyYWdTdGFydFBvczogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5sZXQgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IE1JTl9aT09NID0gMS4wO1xuY29uc3QgTUFYX1pPT00gPSAzLjA7XG5cbmNvbnN0IEhFTFBfVEVYVCA9IFtcbiAgXCJQcmltYXJ5IE1vZGVzXCIsXG4gIFwiICAxIFx1MjAxMyBUb2dnbGUgc2hpcCBuYXZpZ2F0aW9uIG1vZGVcIixcbiAgXCIgIDIgXHUyMDEzIFRvZ2dsZSBtaXNzaWxlIGNvb3JkaW5hdGlvbiBtb2RlXCIsXG4gIFwiXCIsXG4gIFwiU2hpcCBOYXZpZ2F0aW9uXCIsXG4gIFwiICBUIFx1MjAxMyBTd2l0Y2ggYmV0d2VlbiBzZXQvc2VsZWN0XCIsXG4gIFwiICBDIFx1MjAxMyBDbGVhciBhbGwgd2F5cG9pbnRzXCIsXG4gIFwiICBIIFx1MjAxMyBIb2xkIChjbGVhciB3YXlwb2ludHMgJiBzdG9wKVwiLFxuICBcIiAgUiBcdTIwMTMgVG9nZ2xlIHNob3cgcm91dGVcIixcbiAgXCIgIFsgLyBdIFx1MjAxMyBBZGp1c3Qgd2F5cG9pbnQgc3BlZWRcIixcbiAgXCIgIFNoaWZ0K1sgLyBdIFx1MjAxMyBDb2Fyc2Ugc3BlZWQgYWRqdXN0XCIsXG4gIFwiICBUYWIgLyBTaGlmdCtUYWIgXHUyMDEzIEN5Y2xlIHdheXBvaW50c1wiLFxuICBcIiAgRGVsZXRlIFx1MjAxMyBEZWxldGUgZnJvbSBzZWxlY3RlZCB3YXlwb2ludFwiLFxuICBcIlwiLFxuICBcIk1pc3NpbGUgQ29vcmRpbmF0aW9uXCIsXG4gIFwiICBOIFx1MjAxMyBBZGQgbmV3IG1pc3NpbGUgcm91dGVcIixcbiAgXCIgIEwgXHUyMDEzIExhdW5jaCBtaXNzaWxlc1wiLFxuICBcIiAgRSBcdTIwMTMgU3dpdGNoIGJldHdlZW4gc2V0L3NlbGVjdFwiLFxuICBcIiAgLCAvIC4gXHUyMDEzIEFkanVzdCBhZ3JvIHJhZGl1c1wiLFxuICBcIiAgOyAvICcgXHUyMDEzIEFkanVzdCBtaXNzaWxlIHNwZWVkXCIsXG4gIFwiICBTaGlmdCtzbGlkZXIga2V5cyBcdTIwMTMgQ29hcnNlIGFkanVzdFwiLFxuICBcIiAgRGVsZXRlIFx1MjAxMyBEZWxldGUgc2VsZWN0ZWQgbWlzc2lsZSB3YXlwb2ludFwiLFxuICBcIlwiLFxuICBcIk1hcCBDb250cm9sc1wiLFxuICBcIiAgKy8tIFx1MjAxMyBab29tIGluL291dFwiLFxuICBcIiAgQ3RybCswIFx1MjAxMyBSZXNldCB6b29tXCIsXG4gIFwiICBNb3VzZSB3aGVlbCBcdTIwMTMgWm9vbSBhdCBjdXJzb3JcIixcbiAgXCIgIFBpbmNoIFx1MjAxMyBab29tIG9uIHRvdWNoIGRldmljZXNcIixcbiAgXCJcIixcbiAgXCJHZW5lcmFsXCIsXG4gIFwiICA/IFx1MjAxMyBUb2dnbGUgdGhpcyBvdmVybGF5XCIsXG4gIFwiICBFc2MgXHUyMDEzIENhbmNlbCBzZWxlY3Rpb24gb3IgY2xvc2Ugb3ZlcmxheVwiLFxuXS5qb2luKFwiXFxuXCIpO1xuXG5jb25zdCB3b3JsZCA9IHsgdzogODAwMCwgaDogNDUwMCB9O1xuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH06IEluaXRHYW1lT3B0aW9ucyk6IEdhbWVDb250cm9sbGVyIHtcbiAgc3RhdGVSZWYgPSBzdGF0ZTtcbiAgdWlTdGF0ZVJlZiA9IHVpU3RhdGU7XG4gIGJ1c1JlZiA9IGJ1cztcblxuICBjYWNoZURvbSgpO1xuICBpZiAoIWN2KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FudmFzIGVsZW1lbnQgI2N2IG5vdCBmb3VuZFwiKTtcbiAgfVxuICBjdHggPSBjdi5nZXRDb250ZXh0KFwiMmRcIik7XG5cbiAgYmluZExpc3RlbmVycygpO1xuICBzeW5jTWlzc2lsZVVJRnJvbVN0YXRlKCk7XG4gIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICB1cGRhdGVIZWxwT3ZlcmxheSgpO1xuICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk7XG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcblxuICByZXR1cm4ge1xuICAgIG9uU3RhdGVVcGRhdGVkKCkge1xuICAgICAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICAgICAgcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpO1xuICAgICAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xuICAgICAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gICAgICB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gY2FjaGVEb20oKTogdm9pZCB7XG4gIGN2ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdlwiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gIGN0eCA9IGN2Py5nZXRDb250ZXh0KFwiMmRcIikgPz8gbnVsbDtcbiAgSFBzcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWhwXCIpO1xuICBzaGlwQ29udHJvbHNDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNvbnRyb2xzXCIpO1xuICBzaGlwQ2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtY2xlYXJcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTZWxlY3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2VsZWN0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc2hpcFJvdXRlc0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZXNcIik7XG4gIHNoaXBSb3V0ZUxlZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZS1sZWdcIik7XG4gIHNoaXBSb3V0ZVNwZWVkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXJvdXRlLXNwZWVkXCIpO1xuICBzaGlwRGVsZXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBTcGVlZENhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtY2FyZFwiKTtcbiAgc2hpcFNwZWVkU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgc2hpcFNwZWVkVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc3BlZWQtdmFsdWVcIik7XG5cbiAgbWlzc2lsZUNvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1jb250cm9sc1wiKTtcbiAgbWlzc2lsZUFkZFJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFkZC1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVMYXVuY2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZUxhdW5jaFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoLXRleHRcIik7XG4gIG1pc3NpbGVMYXVuY2hJbmZvID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaC1pbmZvXCIpO1xuICBtaXNzaWxlU2V0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVTZWxlY3RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2VsZWN0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZURlbGV0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1kZWxldGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU3BlZWRDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLWNhcmRcIik7XG4gIG1pc3NpbGVTcGVlZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVTcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLXZhbHVlXCIpO1xuICBtaXNzaWxlQWdyb0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1jYXJkXCIpO1xuICBtaXNzaWxlQWdyb1NsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXNsaWRlclwiKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZUFncm9WYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZ3JvLXZhbHVlXCIpO1xuXG4gIHNwYXduQm90QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGF3bi1ib3RcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzcGF3bkJvdFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdC10ZXh0XCIpO1xuICBraWxsc1NwYW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAta2lsbHNcIik7XG4gIHJvdXRlUHJldkJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtcHJldlwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHJvdXRlTmV4dEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbmV4dFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHJvdXRlTWVudVRvZ2dsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm91dGUtbWVudS10b2dnbGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZU1lbnUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW1lbnVcIik7XG4gIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVuYW1lLW1pc3NpbGUtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBkZWxldGVNaXNzaWxlUm91dGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlbGV0ZS1taXNzaWxlLXJvdXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjbGVhci1taXNzaWxlLXdheXBvaW50c1wiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVSb3V0ZU5hbWVMYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1yb3V0ZS1uYW1lXCIpO1xuICBtaXNzaWxlUm91dGVDb3VudExhYmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXJvdXRlLWNvdW50XCIpO1xuXG4gIGhlbHBUb2dnbGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtdG9nZ2xlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgaGVscE92ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtb3ZlcmxheVwiKTtcbiAgaGVscENsb3NlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLWNsb3NlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgaGVscFRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlbHAtdGV4dFwiKTtcblxuICBoZWF0QmFyRmlsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVhdC1iYXItZmlsbFwiKTtcbiAgaGVhdEJhclBsYW5uZWQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlYXQtYmFyLXBsYW5uZWRcIik7XG4gIGhlYXRWYWx1ZVRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlYXQtdmFsdWUtdGV4dFwiKTtcbiAgc3BlZWRNYXJrZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwZWVkLW1hcmtlclwiKTtcbiAgbWlzc2lsZVNwZWVkTWFya2VyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLW1hcmtlclwiKTtcbiAgc3RhbGxPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGFsbC1vdmVybGF5XCIpO1xuXG4gIGRlZmF1bHRTcGVlZCA9IHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyPy52YWx1ZSA/PyBcIjE1MFwiKTtcbiAgaWYgKG1pc3NpbGVTcGVlZFNsaWRlcikge1xuICAgIG1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCA9IGZhbHNlO1xuICB9XG59XG5cbmZ1bmN0aW9uIGJpbmRMaXN0ZW5lcnMoKTogdm9pZCB7XG4gIGlmICghY3YpIHJldHVybjtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJkb3duXCIsIG9uQ2FudmFzUG9pbnRlckRvd24pO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcm1vdmVcIiwgb25DYW52YXNQb2ludGVyTW92ZSk7XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVydXBcIiwgb25DYW52YXNQb2ludGVyVXApO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcmNhbmNlbFwiLCBvbkNhbnZhc1BvaW50ZXJVcCk7XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJ3aGVlbFwiLCBvbkNhbnZhc1doZWVsLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCBvbkNhbnZhc1RvdWNoU3RhcnQsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgb25DYW52YXNUb3VjaE1vdmUsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaGVuZFwiLCBvbkNhbnZhc1RvdWNoRW5kLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuXG4gIHNwYXduQm90QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGlmIChzcGF3bkJvdEJ0bi5kaXNhYmxlZCkgcmV0dXJuO1xuXG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcInNwYXduX2JvdFwiIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwiYm90OnNwYXduUmVxdWVzdGVkXCIpO1xuXG4gICAgLy8gRGlzYWJsZSBidXR0b24gYW5kIHVwZGF0ZSB0ZXh0XG4gICAgc3Bhd25Cb3RCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgIGlmIChzcGF3bkJvdFRleHQpIHtcbiAgICAgIHNwYXduQm90VGV4dC50ZXh0Q29udGVudCA9IFwiU3Bhd25lZFwiO1xuICAgIH1cblxuICAgIC8vIFJlLWVuYWJsZSBhZnRlciA1IHNlY29uZHNcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmIChzcGF3bkJvdEJ0bikge1xuICAgICAgICBzcGF3bkJvdEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgfVxuICAgICAgaWYgKHNwYXduQm90VGV4dCkge1xuICAgICAgICBzcGF3bkJvdFRleHQudGV4dENvbnRlbnQgPSBcIkJvdFwiO1xuICAgICAgfVxuICAgIH0sIDUwMDApO1xuICB9KTtcblxuICBzaGlwQ2xlYXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICBjbGVhclNoaXBSb3V0ZSgpO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDpjbGVhckludm9rZWRcIik7XG4gIH0pO1xuXG4gIHNoaXBTZXRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICB9KTtcblxuICBzaGlwU2VsZWN0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNlbGVjdFwiKTtcbiAgfSk7XG5cbiAgc2hpcFNwZWVkU2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHZhbHVlKSkgcmV0dXJuO1xuICAgIHVwZGF0ZVNwZWVkTGFiZWwodmFsdWUpO1xuICAgIGRlZmF1bHRTcGVlZCA9IHZhbHVlO1xuICAgIGlmIChzZWxlY3Rpb24gJiYgc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpICYmIHN0YXRlUmVmLm1lLndheXBvaW50c1tzZWxlY3Rpb24uaW5kZXhdKSB7XG4gICAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwidXBkYXRlX3dheXBvaW50XCIsIGluZGV4OiBzZWxlY3Rpb24uaW5kZXgsIHNwZWVkOiB2YWx1ZSB9KTtcbiAgICAgIHN0YXRlUmVmLm1lLndheXBvaW50c1tzZWxlY3Rpb24uaW5kZXhdLnNwZWVkID0gdmFsdWU7XG4gICAgICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gICAgICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xuICAgIH1cbiAgICBjb25zdCBoZWF0ID0gc3RhdGVSZWYubWU/LmhlYXQ7XG4gICAgaWYgKGhlYXQpIHtcbiAgICAgIGNvbnN0IHRvbGVyYW5jZSA9IE1hdGgubWF4KDUsIGhlYXQubWFya2VyU3BlZWQgKiAwLjAyKTtcbiAgICAgIGNvbnN0IGRpZmYgPSBNYXRoLmFicyh2YWx1ZSAtIGhlYXQubWFya2VyU3BlZWQpO1xuICAgICAgY29uc3QgaW5SYW5nZSA9IGRpZmYgPD0gdG9sZXJhbmNlO1xuICAgICAgaWYgKGluUmFuZ2UgJiYgIW1hcmtlckFsaWduZWQpIHtcbiAgICAgICAgbWFya2VyQWxpZ25lZCA9IHRydWU7XG4gICAgICAgIGJ1c1JlZi5lbWl0KFwiaGVhdDptYXJrZXJBbGlnbmVkXCIsIHsgdmFsdWUsIG1hcmtlcjogaGVhdC5tYXJrZXJTcGVlZCB9KTtcbiAgICAgIH0gZWxzZSBpZiAoIWluUmFuZ2UgJiYgbWFya2VyQWxpZ25lZCkge1xuICAgICAgICBtYXJrZXJBbGlnbmVkID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG1hcmtlckFsaWduZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBzaGlwRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZUFkZFJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF9taXNzaWxlX3JvdXRlXCIgfSk7XG4gIH0pO1xuXG4gIG1pc3NpbGVMYXVuY2hCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gIH0pO1xuXG4gIG1pc3NpbGVTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2VsZWN0XCIpO1xuICB9KTtcblxuICBtaXNzaWxlRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNwZWVkU2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgaW5wdXRFbCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGNvbnN0IHJhd1ZhbHVlID0gcGFyc2VGbG9hdChpbnB1dEVsLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShyYXdWYWx1ZSkpIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVTcGVlZENvbnRyb2xzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbWluU3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWluID8/IE1JU1NJTEVfTUlOX1NQRUVEO1xuICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICBjb25zdCBjbGFtcGVkVmFsdWUgPSBjbGFtcChyYXdWYWx1ZSwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgICBpZiAoTWF0aC5hYnMoY2xhbXBlZFZhbHVlIC0gcmF3VmFsdWUpID4gMWUtMykge1xuICAgICAgaW5wdXRFbC52YWx1ZSA9IGNsYW1wZWRWYWx1ZS50b0ZpeGVkKDApO1xuICAgIH1cbiAgICBsYXN0TWlzc2lsZUxlZ1NwZWVkID0gY2xhbXBlZFZhbHVlO1xuICAgIGlmIChtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgICAgbWlzc2lsZVNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBgJHtjbGFtcGVkVmFsdWUudG9GaXhlZCgwKX1gO1xuICAgIH1cblxuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpKSB7XG4gICAgICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIG1pc3NpbGVTZWxlY3Rpb24gJiZcbiAgICAgIG1pc3NpbGVTZWxlY3Rpb24udHlwZSA9PT0gXCJ3YXlwb2ludFwiICYmXG4gICAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoXG4gICAgKSB7XG4gICAgICBjb25zdCBpZHggPSBtaXNzaWxlU2VsZWN0aW9uLmluZGV4O1xuICAgICAgcm91dGUud2F5cG9pbnRzW2lkeF0gPSB7IC4uLnJvdXRlLndheXBvaW50c1tpZHhdLCBzcGVlZDogY2xhbXBlZFZhbHVlIH07XG4gICAgICBzZW5kTWVzc2FnZSh7XG4gICAgICAgIHR5cGU6IFwidXBkYXRlX21pc3NpbGVfd2F5cG9pbnRfc3BlZWRcIixcbiAgICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgICBpbmRleDogaWR4LFxuICAgICAgICBzcGVlZDogY2xhbXBlZFZhbHVlLFxuICAgICAgfSk7XG4gICAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6c3BlZWRDaGFuZ2VkXCIsIHsgdmFsdWU6IGNsYW1wZWRWYWx1ZSwgaW5kZXg6IGlkeCB9KTtcbiAgICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVTcGVlZENvbnRyb2xzKCk7XG4gICAgfVxuICB9KTtcblxuICBtaXNzaWxlQWdyb1NsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKHsgYWdyb1JhZGl1czogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmFncm9DaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gIH0pO1xuXG4gIHJvdXRlUHJldkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKC0xKSk7XG4gIHJvdXRlTmV4dEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKDEpKTtcblxuICByb3V0ZU1lbnVUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGlmICghcm91dGVNZW51IHx8ICFyb3V0ZU1lbnUuY2xhc3NMaXN0LmNvbnRhaW5zKFwidmlzaWJsZVwiKSkgcmV0dXJuO1xuICAgIGlmIChldmVudC50YXJnZXQgPT09IHJvdXRlTWVudVRvZ2dsZSkgcmV0dXJuO1xuICAgIGlmIChyb3V0ZU1lbnUuY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpKSByZXR1cm47XG4gICAgcm91dGVNZW51LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICB9KTtcblxuICByZW5hbWVNaXNzaWxlUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUpIHJldHVybjtcbiAgICBjb25zdCBuYW1lID0gd2luZG93LnByb21wdChcIlJlbmFtZSByb3V0ZVwiLCByb3V0ZS5uYW1lIHx8IFwiXCIpO1xuICAgIGlmIChuYW1lID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3QgdHJpbW1lZCA9IG5hbWUudHJpbSgpO1xuICAgIGlmICghdHJpbW1lZCkgcmV0dXJuO1xuICAgIHJvdXRlLm5hbWUgPSB0cmltbWVkO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJyZW5hbWVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgcm91dGVfbmFtZTogdHJpbW1lZCxcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgaWYgKCF3aW5kb3cuY29uZmlybShgRGVsZXRlICR7cm91dGUubmFtZX0/YCkpIHJldHVybjtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmIChyb3V0ZXMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJvdXRlLndheXBvaW50cyA9IFtdO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGF0ZVJlZi5taXNzaWxlUm91dGVzID0gcm91dGVzLmZpbHRlcigocikgPT4gci5pZCAhPT0gcm91dGUuaWQpO1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubWlzc2lsZVJvdXRlcztcbiAgICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcmVtYWluaW5nLmxlbmd0aCA+IDAgPyByZW1haW5pbmdbMF0uaWQgOiBudWxsO1xuICAgIH1cbiAgICBtaXNzaWxlU2VsZWN0aW9uID0gbnVsbDtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImRlbGV0ZV9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICByb3V0ZU1lbnU/LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJjbGVhcl9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gW107XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IG51bGw7XG4gICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIH0pO1xuXG4gIGhlbHBUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SGVscFZpc2libGUodHJ1ZSk7XG4gIH0pO1xuXG4gIGhlbHBDbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRIZWxwVmlzaWJsZShmYWxzZSk7XG4gIH0pO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbldpbmRvd0tleURvd24sIHsgY2FwdHVyZTogZmFsc2UgfSk7XG59XG5cbmZ1bmN0aW9uIHNldFpvb20obmV3Wm9vbTogbnVtYmVyLCBjZW50ZXJYPzogbnVtYmVyLCBjZW50ZXJZPzogbnVtYmVyKTogdm9pZCB7XG4gIHVpU3RhdGVSZWYuem9vbSA9IGNsYW1wKG5ld1pvb20sIE1JTl9aT09NLCBNQVhfWk9PTSk7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzV2hlZWwoZXZlbnQ6IFdoZWVsRXZlbnQpOiB2b2lkIHtcbiAgaWYgKCFjdikgcmV0dXJuO1xuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnN0IHJlY3QgPSBjdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3QgY2VudGVyWCA9IGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQ7XG4gIGNvbnN0IGNlbnRlclkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XG5cbiAgY29uc3QgZGVsdGEgPSBldmVudC5kZWx0YVk7XG4gIGNvbnN0IHpvb21GYWN0b3IgPSBkZWx0YSA+IDAgPyAwLjkgOiAxLjE7XG4gIGNvbnN0IG5ld1pvb20gPSB1aVN0YXRlUmVmLnpvb20gKiB6b29tRmFjdG9yO1xuXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gcmVjdC53aWR0aDtcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQ7XG4gIGNvbnN0IGNhbnZhc0NlbnRlclggPSBjZW50ZXJYICogc2NhbGVYO1xuICBjb25zdCBjYW52YXNDZW50ZXJZID0gY2VudGVyWSAqIHNjYWxlWTtcblxuICBzZXRab29tKG5ld1pvb20sIGNhbnZhc0NlbnRlclgsIGNhbnZhc0NlbnRlclkpO1xufVxuXG5mdW5jdGlvbiBnZXRUb3VjaERpc3RhbmNlKHRvdWNoZXM6IFRvdWNoTGlzdCk6IG51bWJlciB8IG51bGwge1xuICBpZiAodG91Y2hlcy5sZW5ndGggPCAyKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZHggPSB0b3VjaGVzWzBdLmNsaWVudFggLSB0b3VjaGVzWzFdLmNsaWVudFg7XG4gIGNvbnN0IGR5ID0gdG91Y2hlc1swXS5jbGllbnRZIC0gdG91Y2hlc1sxXS5jbGllbnRZO1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG5mdW5jdGlvbiBnZXRUb3VjaENlbnRlcih0b3VjaGVzOiBUb3VjaExpc3QpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCBudWxsIHtcbiAgaWYgKHRvdWNoZXMubGVuZ3RoIDwgMikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgeDogKHRvdWNoZXNbMF0uY2xpZW50WCArIHRvdWNoZXNbMV0uY2xpZW50WCkgLyAyLFxuICAgIHk6ICh0b3VjaGVzWzBdLmNsaWVudFkgKyB0b3VjaGVzWzFdLmNsaWVudFkpIC8gMlxuICB9O1xufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoU3RhcnQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAyKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBpc1BpbmNoaW5nID0gdHJ1ZTtcbiAgICBsYXN0VG91Y2hEaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG5cbiAgICAvLyBDYW5jZWwgYW55IHBlbmRpbmcgd2F5cG9pbnQgcGxhY2VtZW50XG4gICAgaWYgKHBlbmRpbmdUb3VjaFRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoTW92ZShldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8IGV2ZW50LnRvdWNoZXMubGVuZ3RoICE9PSAyKSB7XG4gICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBudWxsO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gIGNvbnN0IGN1cnJlbnREaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG4gIGlmIChjdXJyZW50RGlzdGFuY2UgPT09IG51bGwgfHwgbGFzdFRvdWNoRGlzdGFuY2UgPT09IG51bGwpIHJldHVybjtcblxuICBjb25zdCByZWN0ID0gY3YuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGNvbnN0IGNlbnRlciA9IGdldFRvdWNoQ2VudGVyKGV2ZW50LnRvdWNoZXMpO1xuICBpZiAoIWNlbnRlcikgcmV0dXJuO1xuXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gcmVjdC53aWR0aDtcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQ7XG4gIGNvbnN0IGNhbnZhc0NlbnRlclggPSAoY2VudGVyLnggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICBjb25zdCBjYW52YXNDZW50ZXJZID0gKGNlbnRlci55IC0gcmVjdC50b3ApICogc2NhbGVZO1xuXG4gIGNvbnN0IHpvb21GYWN0b3IgPSBjdXJyZW50RGlzdGFuY2UgLyBsYXN0VG91Y2hEaXN0YW5jZTtcbiAgY29uc3QgbmV3Wm9vbSA9IHVpU3RhdGVSZWYuem9vbSAqIHpvb21GYWN0b3I7XG5cbiAgc2V0Wm9vbShuZXdab29tLCBjYW52YXNDZW50ZXJYLCBjYW52YXNDZW50ZXJZKTtcbiAgbGFzdFRvdWNoRGlzdGFuY2UgPSBjdXJyZW50RGlzdGFuY2U7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzVG91Y2hFbmQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoIDwgMikge1xuICAgIGxhc3RUb3VjaERpc3RhbmNlID0gbnVsbDtcbiAgICAvLyBSZXNldCBwaW5jaGluZyBmbGFnIGFmdGVyIGEgc2hvcnQgZGVsYXkgdG8gcHJldmVudCB3YXlwb2ludCBwbGFjZW1lbnRcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlzUGluY2hpbmcgPSBmYWxzZTtcbiAgICB9LCAxMDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlckRvd24oZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8ICFjdHgpIHJldHVybjtcbiAgaWYgKGhlbHBPdmVybGF5Py5jbGFzc0xpc3QuY29udGFpbnMoXCJ2aXNpYmxlXCIpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChsYXN0VG91Y2hEaXN0YW5jZSAhPT0gbnVsbCB8fCBpc1BpbmNoaW5nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgcmVjdCA9IGN2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBjb25zdCBzY2FsZVggPSByZWN0LndpZHRoICE9PSAwID8gY3Yud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgY29uc3Qgc2NhbGVZID0gcmVjdC5oZWlnaHQgIT09IDAgPyBjdi5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gIGNvbnN0IHggPSAoZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdCkgKiBzY2FsZVg7XG4gIGNvbnN0IHkgPSAoZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wKSAqIHNjYWxlWTtcbiAgY29uc3QgY2FudmFzUG9pbnQgPSB7IHgsIHkgfTtcbiAgY29uc3Qgd29ybGRQb2ludCA9IGNhbnZhc1RvV29ybGQoY2FudmFzUG9pbnQpO1xuXG4gIGNvbnN0IGNvbnRleHQgPSB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgPyBcIm1pc3NpbGVcIiA6IFwic2hpcFwiO1xuXG4gIC8vIENoZWNrIGlmIGNsaWNraW5nIG9uIHdheXBvaW50IGZvciBkcmFnZ2luZyAoc2hpcCBtb2RlICsgc2VsZWN0IHRvb2wpXG4gIGlmIChjb250ZXh0ID09PSBcInNoaXBcIiAmJiB1aVN0YXRlUmVmLnNoaXBUb29sID09PSBcInNlbGVjdFwiICYmIHN0YXRlUmVmLm1lPy53YXlwb2ludHMpIHtcbiAgICBjb25zdCB3cEluZGV4ID0gZmluZFdheXBvaW50QXRQb3NpdGlvbihjYW52YXNQb2ludCk7XG4gICAgaWYgKHdwSW5kZXggIT09IG51bGwpIHtcbiAgICAgIGRyYWdnZWRXYXlwb2ludCA9IHdwSW5kZXg7XG4gICAgICBkcmFnU3RhcnRQb3MgPSB7IHg6IGNhbnZhc1BvaW50LngsIHk6IGNhbnZhc1BvaW50LnkgfTtcbiAgICAgIGN2LnNldFBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuXG4gIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIiAmJiB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgY29uc3QgaGl0ID0gaGl0VGVzdE1pc3NpbGVSb3V0ZXMoY2FudmFzUG9pbnQpO1xuICAgIGlmIChoaXQpIHtcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBjb25zdCB7IHJvdXRlLCBzZWxlY3Rpb246IG1pc3NpbGVTZWwgfSA9IGhpdDtcbiAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obWlzc2lsZVNlbCwgcm91dGUuaWQpO1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICAgIGlmIChtaXNzaWxlU2VsLnR5cGUgPT09IFwid2F5cG9pbnRcIikge1xuICAgICAgICBkcmFnZ2VkTWlzc2lsZVdheXBvaW50ID0gbWlzc2lsZVNlbC5pbmRleDtcbiAgICAgICAgZHJhZ1N0YXJ0UG9zID0geyB4OiBjYW52YXNQb2ludC54LCB5OiBjYW52YXNQb2ludC55IH07XG4gICAgICAgIGN2LnNldFBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIH1cblxuICAvLyBGb3IgdG91Y2ggZXZlbnRzLCBkZWxheSB3YXlwb2ludCBwbGFjZW1lbnQgdG8gYWxsb3cgZm9yIHBpbmNoIGdlc3R1cmUgZGV0ZWN0aW9uXG4gIC8vIEZvciBtb3VzZSBldmVudHMsIHBsYWNlIGltbWVkaWF0ZWx5XG4gIGlmIChldmVudC5wb2ludGVyVHlwZSA9PT0gXCJ0b3VjaFwiKSB7XG4gICAgaWYgKHBlbmRpbmdUb3VjaFRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICB9XG5cbiAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoaXNQaW5jaGluZykgcmV0dXJuOyAvLyBEb3VibGUtY2hlY2sgd2UncmUgbm90IHBpbmNoaW5nXG5cbiAgICAgIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgICBoYW5kbGVNaXNzaWxlUG9pbnRlcihjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgICB9XG4gICAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gbnVsbDtcbiAgICB9LCAxNTApOyAvLyAxNTBtcyBkZWxheSB0byBkZXRlY3QgcGluY2ggZ2VzdHVyZVxuICB9IGVsc2Uge1xuICAgIC8vIE1vdXNlL3BlbjogaW1tZWRpYXRlIHBsYWNlbWVudFxuICAgIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgfVxuICB9XG5cbiAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbn1cblxuZnVuY3Rpb24gb25DYW52YXNQb2ludGVyTW92ZShldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG4gIGlmICghY3YgfHwgIWN0eCkgcmV0dXJuO1xuXG4gIGNvbnN0IGRyYWdnaW5nU2hpcCA9IGRyYWdnZWRXYXlwb2ludCAhPT0gbnVsbCAmJiBkcmFnU3RhcnRQb3M7XG4gIGNvbnN0IGRyYWdnaW5nTWlzc2lsZSA9IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgIT09IG51bGwgJiYgZHJhZ1N0YXJ0UG9zO1xuXG4gIGlmICghZHJhZ2dpbmdTaGlwICYmICFkcmFnZ2luZ01pc3NpbGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCByZWN0ID0gY3YuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGNvbnN0IHNjYWxlWCA9IHJlY3Qud2lkdGggIT09IDAgPyBjdi53aWR0aCAvIHJlY3Qud2lkdGggOiAxO1xuICBjb25zdCBzY2FsZVkgPSByZWN0LmhlaWdodCAhPT0gMCA/IGN2LmhlaWdodCAvIHJlY3QuaGVpZ2h0IDogMTtcbiAgY29uc3QgeCA9IChldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0KSAqIHNjYWxlWDtcbiAgY29uc3QgeSA9IChldmVudC5jbGllbnRZIC0gcmVjdC50b3ApICogc2NhbGVZO1xuICBjb25zdCBjYW52YXNQb2ludCA9IHsgeCwgeSB9O1xuICBjb25zdCB3b3JsZFBvaW50ID0gY2FudmFzVG9Xb3JsZChjYW52YXNQb2ludCk7XG5cbiAgLy8gQ2xhbXAgdG8gd29ybGQgYm91bmRzXG4gIGNvbnN0IHdvcmxkVyA9IHN0YXRlUmVmLndvcmxkTWV0YS53ID8/IDQwMDA7XG4gIGNvbnN0IHdvcmxkSCA9IHN0YXRlUmVmLndvcmxkTWV0YS5oID8/IDQwMDA7XG4gIGNvbnN0IGNsYW1wZWRYID0gY2xhbXAod29ybGRQb2ludC54LCAwLCB3b3JsZFcpO1xuICBjb25zdCBjbGFtcGVkWSA9IGNsYW1wKHdvcmxkUG9pbnQueSwgMCwgd29ybGRIKTtcblxuICBpZiAoZHJhZ2dpbmdTaGlwICYmIGRyYWdnZWRXYXlwb2ludCAhPT0gbnVsbCkge1xuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwibW92ZV93YXlwb2ludFwiLFxuICAgICAgaW5kZXg6IGRyYWdnZWRXYXlwb2ludCxcbiAgICAgIHg6IGNsYW1wZWRYLFxuICAgICAgeTogY2xhbXBlZFksXG4gICAgfSk7XG5cbiAgICBpZiAoc3RhdGVSZWYubWUgJiYgc3RhdGVSZWYubWUud2F5cG9pbnRzICYmIGRyYWdnZWRXYXlwb2ludCA8IHN0YXRlUmVmLm1lLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHN0YXRlUmVmLm1lLndheXBvaW50c1tkcmFnZ2VkV2F5cG9pbnRdLnggPSBjbGFtcGVkWDtcbiAgICAgIHN0YXRlUmVmLm1lLndheXBvaW50c1tkcmFnZ2VkV2F5cG9pbnRdLnkgPSBjbGFtcGVkWTtcbiAgICB9XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoZHJhZ2dpbmdNaXNzaWxlICYmIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgIT09IG51bGwpIHtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmIChyb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgJiYgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA8IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgICAgdHlwZTogXCJtb3ZlX21pc3NpbGVfd2F5cG9pbnRcIixcbiAgICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgICBpbmRleDogZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCxcbiAgICAgICAgeDogY2xhbXBlZFgsXG4gICAgICAgIHk6IGNsYW1wZWRZLFxuICAgICAgfSk7XG5cbiAgICAgIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cy5tYXAoKHdwLCBpZHgpID0+XG4gICAgICAgIGlkeCA9PT0gZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA/IHsgLi4ud3AsIHg6IGNsYW1wZWRYLCB5OiBjbGFtcGVkWSB9IDogd3BcbiAgICAgICk7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH1cbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlclVwKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgbGV0IHJlbGVhc2VkID0gZmFsc2U7XG5cbiAgaWYgKGRyYWdnZWRXYXlwb2ludCAhPT0gbnVsbCAmJiBzdGF0ZVJlZi5tZT8ud2F5cG9pbnRzKSB7XG4gICAgY29uc3Qgd3AgPSBzdGF0ZVJlZi5tZS53YXlwb2ludHNbZHJhZ2dlZFdheXBvaW50XTtcbiAgICBpZiAod3ApIHtcbiAgICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludE1vdmVkXCIsIHtcbiAgICAgICAgaW5kZXg6IGRyYWdnZWRXYXlwb2ludCxcbiAgICAgICAgeDogd3AueCxcbiAgICAgICAgeTogd3AueSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBkcmFnZ2VkV2F5cG9pbnQgPSBudWxsO1xuICAgIHJlbGVhc2VkID0gdHJ1ZTtcbiAgfVxuXG4gIGlmIChkcmFnZ2VkTWlzc2lsZVdheXBvaW50ICE9PSBudWxsKSB7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAocm91dGUgJiYgcm91dGUud2F5cG9pbnRzICYmIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBjb25zdCB3cCA9IHJvdXRlLndheXBvaW50c1tkcmFnZ2VkTWlzc2lsZVdheXBvaW50XTtcbiAgICAgIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp3YXlwb2ludE1vdmVkXCIsIHtcbiAgICAgICAgcm91dGVJZDogcm91dGUuaWQsXG4gICAgICAgIGluZGV4OiBkcmFnZ2VkTWlzc2lsZVdheXBvaW50LFxuICAgICAgICB4OiB3cC54LFxuICAgICAgICB5OiB3cC55LFxuICAgICAgfSk7XG4gICAgfVxuICAgIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPSBudWxsO1xuICAgIHJlbGVhc2VkID0gdHJ1ZTtcbiAgfVxuXG4gIGRyYWdTdGFydFBvcyA9IG51bGw7XG5cbiAgaWYgKHJlbGVhc2VkICYmIGN2KSB7XG4gICAgY3YucmVsZWFzZVBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzaGlwU3BlZWRWYWx1ZSkge1xuICAgIHNoaXBTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gTnVtYmVyKHZhbHVlKS50b0ZpeGVkKDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldFNoaXBTbGlkZXJWYWx1ZSh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghc2hpcFNwZWVkU2xpZGVyKSByZXR1cm47XG4gIHNoaXBTcGVlZFNsaWRlci52YWx1ZSA9IFN0cmluZyh2YWx1ZSk7XG4gIHVwZGF0ZVNwZWVkTGFiZWwodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbCB7XG4gIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gIGlmIChyb3V0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSBudWxsO1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGlmICghc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgfHwgIXJvdXRlcy5zb21lKChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSkge1xuICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcm91dGVzWzBdLmlkO1xuICB9XG4gIHJldHVybiByb3V0ZXMuZmluZCgocm91dGUpID0+IHJvdXRlLmlkID09PSBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCkgPz8gbnVsbDtcbn1cblxuZnVuY3Rpb24gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk6IE1pc3NpbGVSb3V0ZSB8IG51bGwge1xuICByZXR1cm4gZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk6IHZvaWQge1xuICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICBjb25zdCBhY3RpdmVSb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAobWlzc2lsZVJvdXRlTmFtZUxhYmVsKSB7XG4gICAgaWYgKCFhY3RpdmVSb3V0ZSkge1xuICAgICAgbWlzc2lsZVJvdXRlTmFtZUxhYmVsLnRleHRDb250ZW50ID0gcm91dGVzLmxlbmd0aCA9PT0gMCA/IFwiTm8gcm91dGVcIiA6IFwiUm91dGVcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgbWlzc2lsZVJvdXRlTmFtZUxhYmVsLnRleHRDb250ZW50ID0gYWN0aXZlUm91dGUubmFtZSB8fCBcIlJvdXRlXCI7XG4gICAgfVxuICB9XG5cbiAgaWYgKG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwpIHtcbiAgICBjb25zdCBjb3VudCA9IGFjdGl2ZVJvdXRlICYmIEFycmF5LmlzQXJyYXkoYWN0aXZlUm91dGUud2F5cG9pbnRzKSA/IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwudGV4dENvbnRlbnQgPSBgJHtjb3VudH0gcHRzYDtcbiAgfVxuXG4gIGlmIChkZWxldGVNaXNzaWxlUm91dGVCdG4pIHtcbiAgICBkZWxldGVNaXNzaWxlUm91dGVCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gIH1cbiAgaWYgKHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bikge1xuICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZTtcbiAgfVxuICBpZiAoY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuKSB7XG4gICAgY29uc3QgY291bnQgPSBhY3RpdmVSb3V0ZSAmJiBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgPyBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4uZGlzYWJsZWQgPSAhYWN0aXZlUm91dGUgfHwgY291bnQgPT09IDA7XG4gIH1cbiAgaWYgKHJvdXRlUHJldkJ0bikge1xuICAgIHJvdXRlUHJldkJ0bi5kaXNhYmxlZCA9IHJvdXRlcy5sZW5ndGggPD0gMTtcbiAgfVxuICBpZiAocm91dGVOZXh0QnRuKSB7XG4gICAgcm91dGVOZXh0QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICB9XG5cbiAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpOiB2b2lkIHtcbiAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGFjdGl2ZVJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IHJvdXRlSGFzU2VsZWN0aW9uID1cbiAgICAhIWFjdGl2ZVJvdXRlICYmXG4gICAgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpICYmXG4gICAgISFtaXNzaWxlU2VsZWN0aW9uICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA+PSAwICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA8IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGg7XG4gIGlmICghcm91dGVIYXNTZWxlY3Rpb24pIHtcbiAgICBtaXNzaWxlU2VsZWN0aW9uID0gbnVsbDtcbiAgfVxuICBjb25zdCBjZmcgPSBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnO1xuICBhcHBseU1pc3NpbGVVSShjZmcpO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG59XG5cbmZ1bmN0aW9uIGFwcGx5TWlzc2lsZVVJKGNmZzogeyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfSk6IHZvaWQge1xuICBpZiAobWlzc2lsZUFncm9TbGlkZXIpIHtcbiAgICBjb25zdCBtaW5BZ3JvID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5hZ3JvTWluID8/IE1JU1NJTEVfTUlOX0FHUk87XG4gICAgY29uc3QgbWF4QWdybyA9IE1hdGgubWF4KDUwMDAsIE1hdGguY2VpbCgoY2ZnLmFncm9SYWRpdXMgKyA1MDApIC8gNTAwKSAqIDUwMCk7XG4gICAgbWlzc2lsZUFncm9TbGlkZXIubWluID0gU3RyaW5nKG1pbkFncm8pO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1heCA9IFN0cmluZyhtYXhBZ3JvKTtcbiAgICBtaXNzaWxlQWdyb1NsaWRlci52YWx1ZSA9IGNmZy5hZ3JvUmFkaXVzLnRvRml4ZWQoMCk7XG4gIH1cbiAgaWYgKG1pc3NpbGVBZ3JvVmFsdWUpIHtcbiAgICBtaXNzaWxlQWdyb1ZhbHVlLnRleHRDb250ZW50ID0gY2ZnLmFncm9SYWRpdXMudG9GaXhlZCgwKTtcbiAgfVxuICBpZiAoIWxhc3RNaXNzaWxlTGVnU3BlZWQgfHwgbGFzdE1pc3NpbGVMZWdTcGVlZCA8PSAwKSB7XG4gICAgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IGNmZy5zcGVlZDtcbiAgfVxuICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKG92ZXJyaWRlczogUGFydGlhbDx7IGFncm9SYWRpdXM6IG51bWJlciB9PiA9IHt9KTogdm9pZCB7XG4gIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnO1xuICBjb25zdCBjZmcgPSBzYW5pdGl6ZU1pc3NpbGVDb25maWcoXG4gICAge1xuICAgICAgc3BlZWQ6IGN1cnJlbnQuc3BlZWQsXG4gICAgICBhZ3JvUmFkaXVzOiBvdmVycmlkZXMuYWdyb1JhZGl1cyA/PyBjdXJyZW50LmFncm9SYWRpdXMsXG4gICAgfSxcbiAgICBjdXJyZW50LFxuICAgIHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMsXG4gICk7XG4gIHN0YXRlUmVmLm1pc3NpbGVDb25maWcgPSBjZmc7XG4gIGFwcGx5TWlzc2lsZVVJKGNmZyk7XG4gIGNvbnN0IGxhc3QgPSBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQ7XG4gIGNvbnN0IG5lZWRzU2VuZCA9XG4gICAgIWxhc3QgfHxcbiAgICBNYXRoLmFicygobGFzdC5hZ3JvUmFkaXVzID8/IDApIC0gY2ZnLmFncm9SYWRpdXMpID4gNTtcbiAgaWYgKG5lZWRzU2VuZCkge1xuICAgIHNlbmRNaXNzaWxlQ29uZmlnKGNmZyk7XG4gIH1cbiAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgdXBkYXRlU3BlZWRNYXJrZXIoKTtcbn1cblxuZnVuY3Rpb24gc2VuZE1pc3NpbGVDb25maWcoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gIGxhc3RNaXNzaWxlQ29uZmlnU2VudCA9IHtcbiAgICBzcGVlZDogY2ZnLnNwZWVkLFxuICAgIGFncm9SYWRpdXM6IGNmZy5hZ3JvUmFkaXVzLFxuICB9O1xuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJjb25maWd1cmVfbWlzc2lsZVwiLFxuICAgIG1pc3NpbGVfc3BlZWQ6IGNmZy5zcGVlZCxcbiAgICBtaXNzaWxlX2Fncm86IGNmZy5hZ3JvUmFkaXVzLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpOiB2b2lkIHtcbiAgaWYgKCFzaGlwUm91dGVzQ29udGFpbmVyIHx8ICFzaGlwUm91dGVMZWcgfHwgIXNoaXBSb3V0ZVNwZWVkIHx8ICFzaGlwRGVsZXRlQnRuKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHdwcyA9IHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBjb25zdCBoYXNWYWxpZFNlbGVjdGlvbiA9IHNlbGVjdGlvbiAhPT0gbnVsbCAmJiBzZWxlY3Rpb24uaW5kZXggPj0gMCAmJiBzZWxlY3Rpb24uaW5kZXggPCB3cHMubGVuZ3RoO1xuICBjb25zdCBpc1NoaXBDb250ZXh0ID0gdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwic2hpcFwiO1xuXG4gIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICBzaGlwUm91dGVzQ29udGFpbmVyLnN0eWxlLm9wYWNpdHkgPSBpc1NoaXBDb250ZXh0ID8gXCIxXCIgOiBcIjAuNlwiO1xuXG4gIGlmICghc3RhdGVSZWYubWUgfHwgIWhhc1ZhbGlkU2VsZWN0aW9uKSB7XG4gICAgc2hpcFJvdXRlTGVnLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICBzaGlwUm91dGVTcGVlZC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgc2hpcERlbGV0ZUJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgaWYgKGlzU2hpcENvbnRleHQpIHtcbiAgICAgIHNldFNoaXBTbGlkZXJWYWx1ZShkZWZhdWx0U3BlZWQpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoc2VsZWN0aW9uICE9PSBudWxsKSB7XG4gICAgY29uc3Qgd3AgPSB3cHNbc2VsZWN0aW9uLmluZGV4XTtcbiAgICBjb25zdCBzcGVlZCA9IHdwICYmIHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiA/IHdwLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuICAgIGlmIChpc1NoaXBDb250ZXh0ICYmIHNoaXBTcGVlZFNsaWRlciAmJiBNYXRoLmFicyhwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci52YWx1ZSkgLSBzcGVlZCkgPiAwLjI1KSB7XG4gICAgICBzZXRTaGlwU2xpZGVyVmFsdWUoc3BlZWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB1cGRhdGVTcGVlZExhYmVsKHNwZWVkKTtcbiAgICB9XG4gICAgY29uc3QgZGlzcGxheUluZGV4ID0gc2VsZWN0aW9uLmluZGV4ICsgMTtcbiAgICBzaGlwUm91dGVMZWcudGV4dENvbnRlbnQgPSBgJHtkaXNwbGF5SW5kZXh9YDtcbiAgICBzaGlwUm91dGVTcGVlZC50ZXh0Q29udGVudCA9IGAke3NwZWVkLnRvRml4ZWQoMCl9IHUvc2A7XG4gICAgc2hpcERlbGV0ZUJ0bi5kaXNhYmxlZCA9ICFpc1NoaXBDb250ZXh0O1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGNvdW50ID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gIGNvbnN0IGlzV2F5cG9pbnRTZWxlY3Rpb24gPVxuICAgIG1pc3NpbGVTZWxlY3Rpb24gIT09IG51bGwgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uICE9PSB1bmRlZmluZWQgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLnR5cGUgPT09IFwid2F5cG9pbnRcIiAmJlxuICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPj0gMCAmJlxuICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPCBjb3VudDtcbiAgaWYgKG1pc3NpbGVEZWxldGVCdG4pIHtcbiAgICBtaXNzaWxlRGVsZXRlQnRuLmRpc2FibGVkID0gIWlzV2F5cG9pbnRTZWxlY3Rpb247XG4gIH1cbiAgdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTogdm9pZCB7XG4gIGlmICghbWlzc2lsZVNwZWVkU2xpZGVyIHx8ICFtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IG1pblNwZWVkID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5zcGVlZE1pbiA/PyBNSVNTSUxFX01JTl9TUEVFRDtcbiAgY29uc3QgbWF4U3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWF4ID8/IE1JU1NJTEVfTUFYX1NQRUVEO1xuICBtaXNzaWxlU3BlZWRTbGlkZXIubWluID0gU3RyaW5nKG1pblNwZWVkKTtcbiAgbWlzc2lsZVNwZWVkU2xpZGVyLm1heCA9IFN0cmluZyhtYXhTcGVlZCk7XG5cbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgbGV0IHNsaWRlclZhbHVlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICBpZiAoXG4gICAgcm91dGUgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbi50eXBlID09PSBcIndheXBvaW50XCIgJiZcbiAgICBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aFxuICApIHtcbiAgICBjb25zdCB3cCA9IHJvdXRlLndheXBvaW50c1ttaXNzaWxlU2VsZWN0aW9uLmluZGV4XTtcbiAgICBjb25zdCB2YWx1ZSA9IHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiAmJiB3cC5zcGVlZCA+IDAgPyB3cC5zcGVlZCA6IHN0YXRlUmVmLm1pc3NpbGVDb25maWcuc3BlZWQ7XG4gICAgc2xpZGVyVmFsdWUgPSBjbGFtcCh2YWx1ZSwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgICBpZiAoc2xpZGVyVmFsdWUgPiAwKSB7XG4gICAgICBsYXN0TWlzc2lsZUxlZ1NwZWVkID0gc2xpZGVyVmFsdWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKHNsaWRlclZhbHVlID09PSBudWxsKSB7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBwYXJzZUZsb2F0KG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSk7XG4gICAgY29uc3QgZmFsbGJhY2sgPSBsYXN0TWlzc2lsZUxlZ1NwZWVkID4gMCA/IGxhc3RNaXNzaWxlTGVnU3BlZWQgOiBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnLnNwZWVkO1xuICAgIGNvbnN0IHRhcmdldFZhbHVlID0gTnVtYmVyLmlzRmluaXRlKHJhd1ZhbHVlKSA/IHJhd1ZhbHVlIDogZmFsbGJhY2s7XG4gICAgc2xpZGVyVmFsdWUgPSBjbGFtcCh0YXJnZXRWYWx1ZSwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgfVxuXG4gIG1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCA9IGZhbHNlO1xuICBtaXNzaWxlU3BlZWRTbGlkZXIudmFsdWUgPSBzbGlkZXJWYWx1ZS50b0ZpeGVkKDApO1xuICBtaXNzaWxlU3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IGAke3NsaWRlclZhbHVlLnRvRml4ZWQoMCl9YDtcblxuICBpZiAoc2xpZGVyVmFsdWUgPiAwKSB7XG4gICAgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IHNsaWRlclZhbHVlO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldFNlbGVjdGlvbihzZWw6IFNlbGVjdGlvbiB8IG51bGwpOiB2b2lkIHtcbiAgc2VsZWN0aW9uID0gc2VsO1xuICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gIGNvbnN0IGluZGV4ID0gc2VsZWN0aW9uID8gc2VsZWN0aW9uLmluZGV4IDogbnVsbDtcbiAgYnVzUmVmLmVtaXQoXCJzaGlwOmxlZ1NlbGVjdGVkXCIsIHsgaW5kZXggfSk7XG59XG5cbmZ1bmN0aW9uIHNldE1pc3NpbGVTZWxlY3Rpb24oc2VsOiBNaXNzaWxlU2VsZWN0aW9uIHwgbnVsbCwgcm91dGVJZD86IHN0cmluZyk6IHZvaWQge1xuICBtaXNzaWxlU2VsZWN0aW9uID0gc2VsO1xuICBpZiAocm91dGVJZCkge1xuICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcm91dGVJZDtcbiAgfVxuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIHVwZGF0ZU1pc3NpbGVTcGVlZENvbnRyb2xzKCk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVNoaXBQb2ludGVyKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIHdvcmxkUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuICBpZiAoIXN0YXRlUmVmLm1lKSByZXR1cm47XG4gIGlmICh1aVN0YXRlUmVmLnNoaXBUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgY29uc3QgaGl0ID0gaGl0VGVzdFJvdXRlKGNhbnZhc1BvaW50KTtcbiAgICAvLyBDb252ZXJ0IGRpc3BsYXkgaW5kZXggdG8gYWN0dWFsIHdheXBvaW50IGluZGV4XG4gICAgaWYgKGhpdCkge1xuICAgICAgY29uc3QgYWN0dWFsSW5kZXggPSBkaXNwbGF5SW5kZXhUb0FjdHVhbEluZGV4KGhpdC5pbmRleCk7XG4gICAgICBzZXRTZWxlY3Rpb24oeyB0eXBlOiBoaXQudHlwZSwgaW5kZXg6IGFjdHVhbEluZGV4IH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHdwID0geyB4OiB3b3JsZFBvaW50LngsIHk6IHdvcmxkUG9pbnQueSwgc3BlZWQ6IGRlZmF1bHRTcGVlZCB9O1xuICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiYWRkX3dheXBvaW50XCIsIHg6IHdwLngsIHk6IHdwLnksIHNwZWVkOiBkZWZhdWx0U3BlZWQgfSk7XG4gIGNvbnN0IHdwcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cy5zbGljZSgpIDogW107XG4gIHdwcy5wdXNoKHdwKTtcbiAgc3RhdGVSZWYubWUud2F5cG9pbnRzID0gd3BzO1xuICBidXNSZWYuZW1pdChcInNoaXA6d2F5cG9pbnRBZGRlZFwiLCB7IGluZGV4OiB3cHMubGVuZ3RoIC0gMSB9KTtcbiAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xufVxuXG5mdW5jdGlvbiBnZXREZWZhdWx0TWlzc2lsZUxlZ1NwZWVkKCk6IG51bWJlciB7XG4gIGNvbnN0IG1pblNwZWVkID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5zcGVlZE1pbiA/PyBNSVNTSUxFX01JTl9TUEVFRDtcbiAgY29uc3QgbWF4U3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWF4ID8/IE1JU1NJTEVfTUFYX1NQRUVEO1xuICBjb25zdCBiYXNlID0gbGFzdE1pc3NpbGVMZWdTcGVlZCA+IDAgPyBsYXN0TWlzc2lsZUxlZ1NwZWVkIDogc3RhdGVSZWYubWlzc2lsZUNvbmZpZy5zcGVlZDtcbiAgcmV0dXJuIGNsYW1wKGJhc2UsIG1pblNwZWVkLCBtYXhTcGVlZCk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1pc3NpbGVQb2ludGVyKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIHdvcmxkUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlKSByZXR1cm47XG5cbiAgaWYgKHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0TWlzc2lsZVJvdXRlcyhjYW52YXNQb2ludCk7XG4gICAgaWYgKGhpdCkge1xuICAgICAgc2V0TWlzc2lsZVNlbGVjdGlvbihoaXQuc2VsZWN0aW9uLCBoaXQucm91dGUuaWQpO1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgc3BlZWQgPSBnZXREZWZhdWx0TWlzc2lsZUxlZ1NwZWVkKCk7XG4gIGNvbnN0IHdwID0geyB4OiB3b3JsZFBvaW50LngsIHk6IHdvcmxkUG9pbnQueSwgc3BlZWQgfTtcbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwiYWRkX21pc3NpbGVfd2F5cG9pbnRcIixcbiAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgeDogd3AueCxcbiAgICB5OiB3cC55LFxuICAgIHNwZWVkOiB3cC5zcGVlZCxcbiAgfSk7XG4gIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cyA/IFsuLi5yb3V0ZS53YXlwb2ludHMsIHdwXSA6IFt3cF07XG4gIGxhc3RNaXNzaWxlTGVnU3BlZWQgPSBzcGVlZDtcbiAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsLCByb3V0ZS5pZCk7XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbn1cblxuZnVuY3Rpb24gY2xlYXJTaGlwUm91dGUoKTogdm9pZCB7XG4gIGNvbnN0IHdwcyA9IHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBpZiAoIXdwcyB8fCB3cHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJjbGVhcl93YXlwb2ludHNcIiB9KTtcbiAgaWYgKHN0YXRlUmVmLm1lKSB7XG4gICAgc3RhdGVSZWYubWUud2F5cG9pbnRzID0gW107XG4gIH1cbiAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICBidXNSZWYuZW1pdChcInNoaXA6d2F5cG9pbnRzQ2xlYXJlZFwiKTtcbiAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbn1cblxuZnVuY3Rpb24gZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTogdm9pZCB7XG4gIGlmICghc2VsZWN0aW9uKSByZXR1cm47XG4gIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJkZWxldGVfd2F5cG9pbnRcIiwgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCB9KTtcbiAgaWYgKHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSkge1xuICAgIHN0YXRlUmVmLm1lLndheXBvaW50cyA9IHN0YXRlUmVmLm1lLndheXBvaW50cy5zbGljZSgwLCBzZWxlY3Rpb24uaW5kZXgpO1xuICB9XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludERlbGV0ZWRcIiwgeyBpbmRleDogc2VsZWN0aW9uLmluZGV4IH0pO1xuICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZVNlbGVjdGVkTWlzc2lsZVdheXBvaW50KCk6IHZvaWQge1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlIHx8ICFtaXNzaWxlU2VsZWN0aW9uKSByZXR1cm47XG4gIGNvbnN0IGluZGV4ID0gbWlzc2lsZVNlbGVjdGlvbi5pbmRleDtcbiAgaWYgKCFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwiZGVsZXRlX21pc3NpbGVfd2F5cG9pbnRcIixcbiAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgaW5kZXgsXG4gIH0pO1xuICByb3V0ZS53YXlwb2ludHMgPSBbLi4ucm91dGUud2F5cG9pbnRzLnNsaWNlKDAsIGluZGV4KSwgLi4ucm91dGUud2F5cG9pbnRzLnNsaWNlKGluZGV4ICsgMSldO1xuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4IH0pO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTogdm9pZCB7XG4gIGlmIChtaXNzaWxlTGF1bmNoQnRuPy5kaXNhYmxlZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAoIXJvdXRlIHx8ICFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImxhdW5jaF9taXNzaWxlXCIsXG4gICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gY3ljbGVNaXNzaWxlUm91dGUoZGlyZWN0aW9uOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3Qgcm91dGVzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5taXNzaWxlUm91dGVzKSA/IHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMgOiBbXTtcbiAgaWYgKHJvdXRlcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgY3VycmVudEluZGV4ID0gcm91dGVzLmZpbmRJbmRleCgocm91dGUpID0+IHJvdXRlLmlkID09PSBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCk7XG4gIGNvbnN0IGJhc2VJbmRleCA9IGN1cnJlbnRJbmRleCA+PSAwID8gY3VycmVudEluZGV4IDogMDtcbiAgY29uc3QgbmV4dEluZGV4ID0gKChiYXNlSW5kZXggKyBkaXJlY3Rpb24pICUgcm91dGVzLmxlbmd0aCArIHJvdXRlcy5sZW5ndGgpICUgcm91dGVzLmxlbmd0aDtcbiAgY29uc3QgbmV4dFJvdXRlID0gcm91dGVzW25leHRJbmRleF07XG4gIGlmICghbmV4dFJvdXRlKSByZXR1cm47XG4gIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dFJvdXRlLmlkO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJzZXRfYWN0aXZlX21pc3NpbGVfcm91dGVcIixcbiAgICByb3V0ZV9pZDogbmV4dFJvdXRlLmlkLFxuICB9KTtcbiAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmFjdGl2ZVJvdXRlQ2hhbmdlZFwiLCB7IHJvdXRlSWQ6IG5leHRSb3V0ZS5pZCB9KTtcbn1cblxuZnVuY3Rpb24gY3ljbGVTaGlwU2VsZWN0aW9uKGRpcmVjdGlvbjogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHdwcyA9IHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBpZiAoIXdwcyB8fCB3cHMubGVuZ3RoID09PSAwKSB7XG4gICAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgaW5kZXggPSBzZWxlY3Rpb24gPyBzZWxlY3Rpb24uaW5kZXggOiBkaXJlY3Rpb24gPiAwID8gLTEgOiB3cHMubGVuZ3RoO1xuICBpbmRleCArPSBkaXJlY3Rpb247XG4gIGlmIChpbmRleCA8IDApIGluZGV4ID0gd3BzLmxlbmd0aCAtIDE7XG4gIGlmIChpbmRleCA+PSB3cHMubGVuZ3RoKSBpbmRleCA9IDA7XG4gIHNldFNlbGVjdGlvbih7IHR5cGU6IFwibGVnXCIsIGluZGV4IH0pO1xufVxuXG5mdW5jdGlvbiBzZXRJbnB1dENvbnRleHQoY29udGV4dDogXCJzaGlwXCIgfCBcIm1pc3NpbGVcIik6IHZvaWQge1xuICBjb25zdCBuZXh0ID0gY29udGV4dCA9PT0gXCJtaXNzaWxlXCIgPyBcIm1pc3NpbGVcIiA6IFwic2hpcFwiO1xuICBpZiAodWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IG5leHQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPSBuZXh0O1xuXG4gIC8vIEFsc28gdXBkYXRlIGFjdGl2ZVRvb2wgdG8gbWF0Y2ggdGhlIGNvbnRleHQgdG8ga2VlcCBidXR0b24gc3RhdGVzIGluIHN5bmNcbiAgaWYgKG5leHQgPT09IFwic2hpcFwiKSB7XG4gICAgY29uc3Qgc2hpcFRvb2xUb1VzZSA9IHVpU3RhdGVSZWYuc2hpcFRvb2wgPT09IFwic2VsZWN0XCIgPyBcInNoaXAtc2VsZWN0XCIgOiBcInNoaXAtc2V0XCI7XG4gICAgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCAhPT0gc2hpcFRvb2xUb1VzZSkge1xuICAgICAgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID0gc2hpcFRvb2xUb1VzZTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgbWlzc2lsZVRvb2xUb1VzZSA9IHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPT09IFwic2VsZWN0XCIgPyBcIm1pc3NpbGUtc2VsZWN0XCIgOiBcIm1pc3NpbGUtc2V0XCI7XG4gICAgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCAhPT0gbWlzc2lsZVRvb2xUb1VzZSkge1xuICAgICAgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID0gbWlzc2lsZVRvb2xUb1VzZTtcbiAgICB9XG4gIH1cblxuICBidXNSZWYuZW1pdChcImNvbnRleHQ6Y2hhbmdlZFwiLCB7IGNvbnRleHQ6IG5leHQgfSk7XG4gIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG4gIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgcmVmcmVzaE1pc3NpbGVTZWxlY3Rpb25VSSgpO1xufVxuXG5mdW5jdGlvbiBzZXRBY3RpdmVUb29sKHRvb2w6IEFjdGl2ZVRvb2wpOiB2b2lkIHtcbiAgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gdG9vbCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9IHRvb2w7XG5cbiAgLy8gVXBkYXRlIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgc3RhdGVzXG4gIGlmICh0b29sID09PSBcInNoaXAtc2V0XCIpIHtcbiAgICB1aVN0YXRlUmVmLnNoaXBUb29sID0gXCJzZXRcIjtcbiAgICB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID0gbnVsbDtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2V0XCIgfSk7XG4gIH0gZWxzZSBpZiAodG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IFwic2VsZWN0XCI7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IG51bGw7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICBidXNSZWYuZW1pdChcInNoaXA6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNlbGVjdFwiIH0pO1xuICB9IGVsc2UgaWYgKHRvb2wgPT09IFwibWlzc2lsZS1zZXRcIikge1xuICAgIHVpU3RhdGVSZWYuc2hpcFRvb2wgPSBudWxsO1xuICAgIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPSBcInNldFwiO1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNldFwiIH0pO1xuICB9IGVsc2UgaWYgKHRvb2wgPT09IFwibWlzc2lsZS1zZWxlY3RcIikge1xuICAgIHVpU3RhdGVSZWYuc2hpcFRvb2wgPSBudWxsO1xuICAgIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPSBcInNlbGVjdFwiO1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZWxlY3RcIiB9KTtcbiAgfVxuXG4gIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk7XG59XG5cbmZ1bmN0aW9uIHNldEJ1dHRvblN0YXRlKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsLCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgaWYgKCFidG4pIHJldHVybjtcbiAgaWYgKGFjdGl2ZSkge1xuICAgIGJ0bi5kYXRhc2V0LnN0YXRlID0gXCJhY3RpdmVcIjtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwidHJ1ZVwiKTtcbiAgfSBlbHNlIHtcbiAgICBkZWxldGUgYnRuLmRhdGFzZXQuc3RhdGU7XG4gICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcImZhbHNlXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbnRyb2xIaWdobGlnaHRzKCk6IHZvaWQge1xuICBzZXRCdXR0b25TdGF0ZShzaGlwU2V0QnRuLCB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZXRcIik7XG4gIHNldEJ1dHRvblN0YXRlKHNoaXBTZWxlY3RCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKTtcbiAgc2V0QnV0dG9uU3RhdGUobWlzc2lsZVNldEJ0biwgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2V0XCIpO1xuICBzZXRCdXR0b25TdGF0ZShtaXNzaWxlU2VsZWN0QnRuLCB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZWxlY3RcIik7XG5cbiAgaWYgKHNoaXBDb250cm9sc0NhcmQpIHtcbiAgICBzaGlwQ29udHJvbHNDYXJkLmNsYXNzTGlzdC50b2dnbGUoXCJhY3RpdmVcIiwgdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwic2hpcFwiKTtcbiAgfVxuICBpZiAobWlzc2lsZUNvbnRyb2xzQ2FyZCkge1xuICAgIG1pc3NpbGVDb250cm9sc0NhcmQuY2xhc3NMaXN0LnRvZ2dsZShcImFjdGl2ZVwiLCB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldEhlbHBWaXNpYmxlKGZsYWc6IGJvb2xlYW4pOiB2b2lkIHtcbiAgdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSA9IEJvb2xlYW4oZmxhZyk7XG4gIHVwZGF0ZUhlbHBPdmVybGF5KCk7XG4gIGJ1c1JlZi5lbWl0KFwiaGVscDp2aXNpYmxlQ2hhbmdlZFwiLCB7IHZpc2libGU6IHVpU3RhdGVSZWYuaGVscFZpc2libGUgfSk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUhlbHBPdmVybGF5KCk6IHZvaWQge1xuICBpZiAoIWhlbHBPdmVybGF5KSByZXR1cm47XG4gIGlmIChoZWxwVGV4dCkge1xuICAgIGhlbHBUZXh0LnRleHRDb250ZW50ID0gSEVMUF9URVhUO1xuICB9XG4gIGhlbHBPdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoXCJ2aXNpYmxlXCIsIHVpU3RhdGVSZWYuaGVscFZpc2libGUpO1xufVxuXG5mdW5jdGlvbiBhZGp1c3RTbGlkZXJWYWx1ZShpbnB1dDogSFRNTElucHV0RWxlbWVudCB8IG51bGwsIHN0ZXBzOiBudW1iZXIsIGNvYXJzZTogYm9vbGVhbik6IG51bWJlciB8IG51bGwge1xuICBpZiAoIWlucHV0KSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgc3RlcCA9IE1hdGguYWJzKHBhcnNlRmxvYXQoaW5wdXQuc3RlcCkpIHx8IDE7XG4gIGNvbnN0IG11bHRpcGxpZXIgPSBjb2Fyc2UgPyA0IDogMTtcbiAgY29uc3QgbWluID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQoaW5wdXQubWluKSkgPyBwYXJzZUZsb2F0KGlucHV0Lm1pbikgOiAtSW5maW5pdHk7XG4gIGNvbnN0IG1heCA9IE51bWJlci5pc0Zpbml0ZShwYXJzZUZsb2F0KGlucHV0Lm1heCkpID8gcGFyc2VGbG9hdChpbnB1dC5tYXgpIDogSW5maW5pdHk7XG4gIGNvbnN0IGN1cnJlbnQgPSBwYXJzZUZsb2F0KGlucHV0LnZhbHVlKSB8fCAwO1xuICBsZXQgbmV4dCA9IGN1cnJlbnQgKyBzdGVwcyAqIHN0ZXAgKiBtdWx0aXBsaWVyO1xuICBpZiAoTnVtYmVyLmlzRmluaXRlKG1pbikpIG5leHQgPSBNYXRoLm1heChtaW4sIG5leHQpO1xuICBpZiAoTnVtYmVyLmlzRmluaXRlKG1heCkpIG5leHQgPSBNYXRoLm1pbihtYXgsIG5leHQpO1xuICBpZiAoTWF0aC5hYnMobmV4dCAtIGN1cnJlbnQpIDwgMWUtNCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGlucHV0LnZhbHVlID0gU3RyaW5nKG5leHQpO1xuICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudChcImlucHV0XCIsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gIHJldHVybiBuZXh0O1xufVxuXG5mdW5jdGlvbiBvbldpbmRvd0tleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgY29uc3QgdGFyZ2V0ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGNvbnN0IGlzRWRpdGFibGUgPSAhIXRhcmdldCAmJiAodGFyZ2V0LnRhZ05hbWUgPT09IFwiSU5QVVRcIiB8fCB0YXJnZXQudGFnTmFtZSA9PT0gXCJURVhUQVJFQVwiIHx8IHRhcmdldC5pc0NvbnRlbnRFZGl0YWJsZSk7XG5cbiAgaWYgKHVpU3RhdGVSZWYuaGVscFZpc2libGUgJiYgZXZlbnQua2V5ICE9PSBcIkVzY2FwZVwiKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoaXNFZGl0YWJsZSkge1xuICAgIGlmIChldmVudC5rZXkgPT09IFwiRXNjYXBlXCIpIHtcbiAgICAgIHRhcmdldC5ibHVyKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBzd2l0Y2ggKGV2ZW50LmNvZGUpIHtcbiAgICBjYXNlIFwiRGlnaXQxXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiRGlnaXQyXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5VFwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNldFwiKSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNlbGVjdFwiKTtcbiAgICAgIH0gZWxzZSBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2VsZWN0XCIpIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5Q1wiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGNsZWFyU2hpcFJvdXRlKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlIXCI6XG4gICAgICAvLyBIIGtleTogSG9sZCBwb3NpdGlvbiAoY2xlYXIgYWxsIHdheXBvaW50cywgc3RvcCBzaGlwKVxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGNsZWFyU2hpcFJvdXRlKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJCcmFja2V0TGVmdFwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGFkanVzdFNsaWRlclZhbHVlKHNoaXBTcGVlZFNsaWRlciwgLTEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkJyYWNrZXRSaWdodFwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGFkanVzdFNsaWRlclZhbHVlKHNoaXBTcGVlZFNsaWRlciwgMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiVGFiXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgY3ljbGVTaGlwU2VsZWN0aW9uKGV2ZW50LnNoaWZ0S2V5ID8gLTEgOiAxKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleU5cIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBtaXNzaWxlQWRkUm91dGVCdG4/LmNsaWNrKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlMXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgbGF1bmNoQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlFXCI6XG4gICAgICBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2V0XCIpIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2VsZWN0XCIpO1xuICAgICAgfSBlbHNlIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwibWlzc2lsZS1zZWxlY3RcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJDb21tYVwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGFkanVzdFNsaWRlclZhbHVlKG1pc3NpbGVBZ3JvU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiUGVyaW9kXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZUFncm9TbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIlNlbWljb2xvblwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIgJiYgIW1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCkge1xuICAgICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlU3BlZWRTbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJRdW90ZVwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIgJiYgIW1pc3NpbGVTcGVlZFNsaWRlci5kaXNhYmxlZCkge1xuICAgICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRlbGV0ZVwiOlxuICAgIGNhc2UgXCJCYWNrc3BhY2VcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgJiYgbWlzc2lsZVNlbGVjdGlvbikge1xuICAgICAgICBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpO1xuICAgICAgfSBlbHNlIGlmIChzZWxlY3Rpb24pIHtcbiAgICAgICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkVzY2FwZVwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuaGVscFZpc2libGUpIHtcbiAgICAgICAgc2V0SGVscFZpc2libGUoZmFsc2UpO1xuICAgICAgfSBlbHNlIGlmIChtaXNzaWxlU2VsZWN0aW9uKSB7XG4gICAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHNlbGVjdGlvbikge1xuICAgICAgICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgICBzZXRJbnB1dENvbnRleHQoXCJzaGlwXCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiRXF1YWxcIjpcbiAgICBjYXNlIFwiTnVtcGFkQWRkXCI6XG4gICAgICBpZiAoIWN2KSByZXR1cm47XG4gICAgICBzZXRab29tKHVpU3RhdGVSZWYuem9vbSAqIDEuMiwgY3Yud2lkdGggLyAyLCBjdi5oZWlnaHQgLyAyKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIk1pbnVzXCI6XG4gICAgY2FzZSBcIk51bXBhZFN1YnRyYWN0XCI6XG4gICAgICBpZiAoIWN2KSByZXR1cm47XG4gICAgICBzZXRab29tKHVpU3RhdGVSZWYuem9vbSAvIDEuMiwgY3Yud2lkdGggLyAyLCBjdi5oZWlnaHQgLyAyKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRpZ2l0MFwiOlxuICAgIGNhc2UgXCJOdW1wYWQwXCI6XG4gICAgICBpZiAoZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5KSB7XG4gICAgICAgIHVpU3RhdGVSZWYuem9vbSA9IDEuMDtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICBkZWZhdWx0OlxuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoZXZlbnQua2V5ID09PSBcIj9cIikge1xuICAgIHNldEhlbHBWaXNpYmxlKCF1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldENhbWVyYVBvc2l0aW9uKCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gIGlmICghY3YpIHJldHVybiB7IHg6IHdvcmxkLncgLyAyLCB5OiB3b3JsZC5oIC8gMiB9O1xuXG4gIGNvbnN0IHpvb20gPSB1aVN0YXRlUmVmLnpvb207XG5cbiAgLy8gQ2FtZXJhIGZvbGxvd3Mgc2hpcCwgb3IgZGVmYXVsdHMgdG8gd29ybGQgY2VudGVyXG4gIGxldCBjYW1lcmFYID0gc3RhdGVSZWYubWUgPyBzdGF0ZVJlZi5tZS54IDogd29ybGQudyAvIDI7XG4gIGxldCBjYW1lcmFZID0gc3RhdGVSZWYubWUgPyBzdGF0ZVJlZi5tZS55IDogd29ybGQuaCAvIDI7XG5cbiAgLy8gQ2FsY3VsYXRlIHZpc2libGUgd29ybGQgYXJlYSBhdCBjdXJyZW50IHpvb20gdXNpbmcgdW5pZm9ybSBzY2FsZVxuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAvLyBXb3JsZCB1bml0cyB2aXNpYmxlIG9uIHNjcmVlblxuICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjdi5oZWlnaHQgLyBzY2FsZTtcblxuICAvLyBDbGFtcCBjYW1lcmEgdG8gcHJldmVudCB6b29taW5nIHBhc3Qgd29ybGQgYm91bmRhcmllc1xuICAvLyBXaGVuIHpvb21lZCBvdXQsIGNhbWVyYSBjYW4ndCBnZXQgY2xvc2VyIHRvIGVkZ2VzIHRoYW4gaGFsZiB2aWV3cG9ydFxuICBjb25zdCBtaW5DYW1lcmFYID0gdmlld3BvcnRXaWR0aCAvIDI7XG4gIGNvbnN0IG1heENhbWVyYVggPSB3b3JsZC53IC0gdmlld3BvcnRXaWR0aCAvIDI7XG4gIGNvbnN0IG1pbkNhbWVyYVkgPSB2aWV3cG9ydEhlaWdodCAvIDI7XG4gIGNvbnN0IG1heENhbWVyYVkgPSB3b3JsZC5oIC0gdmlld3BvcnRIZWlnaHQgLyAyO1xuXG4gIC8vIEFsd2F5cyBjbGFtcCBjYW1lcmEgdG8gd29ybGQgYm91bmRhcmllc1xuICAvLyBXaGVuIHZpZXdwb3J0ID49IHdvcmxkIGRpbWVuc2lvbnMsIGNlbnRlciB0aGUgd29ybGQgb24gc2NyZWVuXG4gIGlmICh2aWV3cG9ydFdpZHRoIDwgd29ybGQudykge1xuICAgIGNhbWVyYVggPSBjbGFtcChjYW1lcmFYLCBtaW5DYW1lcmFYLCBtYXhDYW1lcmFYKTtcbiAgfSBlbHNlIHtcbiAgICBjYW1lcmFYID0gd29ybGQudyAvIDI7XG4gIH1cblxuICBpZiAodmlld3BvcnRIZWlnaHQgPCB3b3JsZC5oKSB7XG4gICAgY2FtZXJhWSA9IGNsYW1wKGNhbWVyYVksIG1pbkNhbWVyYVksIG1heENhbWVyYVkpO1xuICB9IGVsc2Uge1xuICAgIGNhbWVyYVkgPSB3b3JsZC5oIC8gMjtcbiAgfVxuXG4gIHJldHVybiB7IHg6IGNhbWVyYVgsIHk6IGNhbWVyYVkgfTtcbn1cblxuZnVuY3Rpb24gd29ybGRUb0NhbnZhcyhwOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICBpZiAoIWN2KSByZXR1cm4geyB4OiBwLngsIHk6IHAueSB9O1xuXG4gIGNvbnN0IHpvb20gPSB1aVN0YXRlUmVmLnpvb207XG4gIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgLy8gV29ybGQgcG9zaXRpb24gcmVsYXRpdmUgdG8gY2FtZXJhXG4gIGNvbnN0IHdvcmxkWCA9IHAueCAtIGNhbWVyYS54O1xuICBjb25zdCB3b3JsZFkgPSBwLnkgLSBjYW1lcmEueTtcblxuICAvLyBVc2UgdW5pZm9ybSBzY2FsZSB0byBtYWludGFpbiBhc3BlY3QgcmF0aW9cbiAgLy8gU2NhbGUgaXMgcGl4ZWxzIHBlciB3b3JsZCB1bml0IC0gY2hvb3NlIHRoZSBkaW1lbnNpb24gdGhhdCBmaXRzXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gIC8vIENvbnZlcnQgdG8gY2FudmFzIGNvb3JkaW5hdGVzIChjZW50ZXJlZCBvbiBzY3JlZW4pXG4gIHJldHVybiB7XG4gICAgeDogd29ybGRYICogc2NhbGUgKyBjdi53aWR0aCAvIDIsXG4gICAgeTogd29ybGRZICogc2NhbGUgKyBjdi5oZWlnaHQgLyAyXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNhbnZhc1RvV29ybGQocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcblxuICBjb25zdCB6b29tID0gdWlTdGF0ZVJlZi56b29tO1xuICBjb25zdCBjYW1lcmEgPSBnZXRDYW1lcmFQb3NpdGlvbigpO1xuXG4gIC8vIENhbnZhcyBwb3NpdGlvbiByZWxhdGl2ZSB0byBjZW50ZXJcbiAgY29uc3QgY2FudmFzWCA9IHAueCAtIGN2LndpZHRoIC8gMjtcbiAgY29uc3QgY2FudmFzWSA9IHAueSAtIGN2LmhlaWdodCAvIDI7XG5cbiAgLy8gVXNlIHVuaWZvcm0gc2NhbGUgdG8gbWFpbnRhaW4gYXNwZWN0IHJhdGlvXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuXG4gIC8vIENvbnZlcnQgdG8gd29ybGQgY29vcmRpbmF0ZXMgKGludmVyc2Ugb2Ygd29ybGRUb0NhbnZhcylcbiAgcmV0dXJuIHtcbiAgICB4OiBjYW52YXNYIC8gc2NhbGUgKyBjYW1lcmEueCxcbiAgICB5OiBjYW52YXNZIC8gc2NhbGUgKyBjYW1lcmEueVxuICB9O1xufVxuXG4vLyBHZXQgdGhlIG9mZnNldCBmb3Igc2hpcCB3YXlwb2ludCBpbmRpY2VzIChob3cgbWFueSB3YXlwb2ludHMgaGF2ZSBiZWVuIHBhc3NlZClcbmZ1bmN0aW9uIGdldFNoaXBXYXlwb2ludE9mZnNldCgpOiBudW1iZXIge1xuICByZXR1cm4gc3RhdGVSZWYubWU/LmN1cnJlbnRXYXlwb2ludEluZGV4ID8/IDA7XG59XG5cbi8vIENvbnZlcnQgYSBkaXNwbGF5ZWQgd2F5cG9pbnQgaW5kZXggdG8gdGhlIGFjdHVhbCB3YXlwb2ludCBhcnJheSBpbmRleFxuZnVuY3Rpb24gZGlzcGxheUluZGV4VG9BY3R1YWxJbmRleChkaXNwbGF5SW5kZXg6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBkaXNwbGF5SW5kZXggKyBnZXRTaGlwV2F5cG9pbnRPZmZzZXQoKTtcbn1cblxuLy8gQ29udmVydCBhbiBhY3R1YWwgd2F5cG9pbnQgaW5kZXggdG8gYSBkaXNwbGF5ZWQgaW5kZXggKG9yIC0xIGlmIHdheXBvaW50IGhhcyBiZWVuIHBhc3NlZClcbmZ1bmN0aW9uIGFjdHVhbEluZGV4VG9EaXNwbGF5SW5kZXgoYWN0dWFsSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG9mZnNldCA9IGdldFNoaXBXYXlwb2ludE9mZnNldCgpO1xuICByZXR1cm4gYWN0dWFsSW5kZXggPj0gb2Zmc2V0ID8gYWN0dWFsSW5kZXggLSBvZmZzZXQgOiAtMTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZVJvdXRlUG9pbnRzKCk6IFJvdXRlUG9pbnRzIHwgbnVsbCB7XG4gIGlmICghc3RhdGVSZWYubWUpIHJldHVybiBudWxsO1xuICBjb25zdCB3cHMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMgOiBbXTtcbiAgLy8gRmlsdGVyIHdheXBvaW50cyB0byBvbmx5IHNob3cgdGhvc2UgdGhhdCBoYXZlbid0IGJlZW4gcGFzc2VkIHlldFxuICBjb25zdCBjdXJyZW50SW5kZXggPSBnZXRTaGlwV2F5cG9pbnRPZmZzZXQoKTtcbiAgY29uc3QgdmlzaWJsZVdwcyA9IGN1cnJlbnRJbmRleCA+IDAgPyB3cHMuc2xpY2UoY3VycmVudEluZGV4KSA6IHdwcztcbiAgcmV0dXJuIGJ1aWxkUm91dGVQb2ludHMoXG4gICAgeyB4OiBzdGF0ZVJlZi5tZS54LCB5OiBzdGF0ZVJlZi5tZS55IH0sXG4gICAgdmlzaWJsZVdwcyxcbiAgICB3b3JsZCxcbiAgICBnZXRDYW1lcmFQb3NpdGlvbixcbiAgICAoKSA9PiB1aVN0YXRlUmVmLnpvb20sXG4gICAgd29ybGRUb0NhbnZhc1xuICApO1xufVxuXG5mdW5jdGlvbiBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk6IFJvdXRlUG9pbnRzIHwgbnVsbCB7XG4gIGlmICghc3RhdGVSZWYubWUpIHJldHVybiBudWxsO1xuICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBjb25zdCB3cHMgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMgOiBbXTtcbiAgcmV0dXJuIGJ1aWxkUm91dGVQb2ludHMoXG4gICAgeyB4OiBzdGF0ZVJlZi5tZS54LCB5OiBzdGF0ZVJlZi5tZS55IH0sXG4gICAgd3BzLFxuICAgIHdvcmxkLFxuICAgIGdldENhbWVyYVBvc2l0aW9uLFxuICAgICgpID0+IHVpU3RhdGVSZWYuem9vbSxcbiAgICB3b3JsZFRvQ2FudmFzXG4gICk7XG59XG5cbi8vIEhlbHBlcjogRmluZCB3YXlwb2ludCBhdCBjYW52YXMgcG9zaXRpb25cbmZ1bmN0aW9uIGZpbmRXYXlwb2ludEF0UG9zaXRpb24oY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IG51bWJlciB8IG51bGwge1xuICBpZiAoIXN0YXRlUmVmLm1lPy53YXlwb2ludHMpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgLy8gQ2hlY2sgd2F5cG9pbnRzIGluIHJldmVyc2Ugb3JkZXIgKHRvcCB0byBib3R0b20gdmlzdWFsbHkpXG4gIC8vIFNraXAgdGhlIGZpcnN0IGNhbnZhcyBwb2ludCAoc2hpcCBwb3NpdGlvbilcbiAgZm9yIChsZXQgaSA9IHJvdXRlLndheXBvaW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIGNvbnN0IHdheXBvaW50Q2FudmFzID0gcm91dGUuY2FudmFzUG9pbnRzW2kgKyAxXTsgLy8gKzEgYmVjYXVzZSBmaXJzdCBwb2ludCBpcyBzaGlwIHBvc2l0aW9uXG4gICAgY29uc3QgZHggPSBjYW52YXNQb2ludC54IC0gd2F5cG9pbnRDYW52YXMueDtcbiAgICBjb25zdCBkeSA9IGNhbnZhc1BvaW50LnkgLSB3YXlwb2ludENhbnZhcy55O1xuICAgIGNvbnN0IGRpc3QgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXG4gICAgaWYgKGRpc3QgPD0gV0FZUE9JTlRfSElUX1JBRElVUykge1xuICAgICAgLy8gQ29udmVydCBkaXNwbGF5IGluZGV4IHRvIGFjdHVhbCB3YXlwb2ludCBpbmRleFxuICAgICAgcmV0dXJuIGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoaSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVJvdXRlQW5pbWF0aW9ucyhkdFNlY29uZHM6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIXN0YXRlUmVmLm1lKSB7XG4gICAgc2hpcExlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgbWlzc2lsZUxlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSkge1xuICAgIGNvbnN0IHNoaXBSb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICAgIGlmIChzaGlwUm91dGUgJiYgc2hpcFJvdXRlLndheXBvaW50cy5sZW5ndGggPiAwKSB7XG4gICAgICB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlKHNoaXBMZWdEYXNoT2Zmc2V0cywgc2hpcFJvdXRlLndheXBvaW50cywgc2hpcFJvdXRlLndvcmxkUG9pbnRzLCBzaGlwUm91dGUuY2FudmFzUG9pbnRzLCBkZWZhdWx0U3BlZWQsIGR0U2Vjb25kcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNoaXBMZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBzaGlwTGVnRGFzaE9mZnNldHMuY2xlYXIoKTtcbiAgfVxuXG4gIGNvbnN0IGFjdGl2ZU1pc3NpbGVSb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBjb25zdCBtaXNzaWxlUm91dGVQb2ludHMgPSBjb21wdXRlTWlzc2lsZVJvdXRlUG9pbnRzKCk7XG4gIGlmIChcbiAgICBhY3RpdmVNaXNzaWxlUm91dGUgJiZcbiAgICBtaXNzaWxlUm91dGVQb2ludHMgJiZcbiAgICBBcnJheS5pc0FycmF5KGFjdGl2ZU1pc3NpbGVSb3V0ZS53YXlwb2ludHMpICYmXG4gICAgYWN0aXZlTWlzc2lsZVJvdXRlLndheXBvaW50cy5sZW5ndGggPiAwXG4gICkge1xuICAgIGNvbnN0IGZhbGxiYWNrU3BlZWQgPSBsYXN0TWlzc2lsZUxlZ1NwZWVkID4gMCA/IGxhc3RNaXNzaWxlTGVnU3BlZWQgOiBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnLnNwZWVkO1xuICAgIHVwZGF0ZURhc2hPZmZzZXRzRm9yUm91dGUoXG4gICAgICBtaXNzaWxlTGVnRGFzaE9mZnNldHMsXG4gICAgICBhY3RpdmVNaXNzaWxlUm91dGUud2F5cG9pbnRzLFxuICAgICAgbWlzc2lsZVJvdXRlUG9pbnRzLndvcmxkUG9pbnRzLFxuICAgICAgbWlzc2lsZVJvdXRlUG9pbnRzLmNhbnZhc1BvaW50cyxcbiAgICAgIGZhbGxiYWNrU3BlZWQsXG4gICAgICBkdFNlY29uZHMsXG4gICAgICA2NCxcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhpdFRlc3RSb3V0ZShjYW52YXNQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogU2VsZWN0aW9uIHwgbnVsbCB7XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiBoaXRUZXN0Um91dGVHZW5lcmljKGNhbnZhc1BvaW50LCByb3V0ZSwge1xuICAgIHNraXBMZWdzOiAhdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gaGl0VGVzdE1pc3NpbGVSb3V0ZXMoY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHsgcm91dGU6IE1pc3NpbGVSb3V0ZTsgc2VsZWN0aW9uOiBNaXNzaWxlU2VsZWN0aW9uIH0gfCBudWxsIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gIGlmIChyb3V0ZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBzaGlwUG9zID0geyB4OiBzdGF0ZVJlZi5tZS54LCB5OiBzdGF0ZVJlZi5tZS55IH07XG5cbiAgbGV0IGJlc3Q6IHsgcm91dGU6IE1pc3NpbGVSb3V0ZTsgc2VsZWN0aW9uOiBNaXNzaWxlU2VsZWN0aW9uOyBwb2ludGVyRGlzdDogbnVtYmVyOyBzaGlwRGlzdDogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcblxuICBmb3IgKGNvbnN0IHJvdXRlIG9mIHJvdXRlcykge1xuICAgIGNvbnN0IHdheXBvaW50cyA9IEFycmF5LmlzQXJyYXkocm91dGUud2F5cG9pbnRzKSA/IHJvdXRlLndheXBvaW50cyA6IFtdO1xuICAgIGlmICh3YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCByb3V0ZVBvaW50cyA9IGJ1aWxkUm91dGVQb2ludHMoXG4gICAgICBzaGlwUG9zLFxuICAgICAgd2F5cG9pbnRzLFxuICAgICAgd29ybGQsXG4gICAgICBnZXRDYW1lcmFQb3NpdGlvbixcbiAgICAgICgpID0+IHVpU3RhdGVSZWYuem9vbSxcbiAgICAgIHdvcmxkVG9DYW52YXNcbiAgICApO1xuXG4gICAgY29uc3QgaGl0ID0gaGl0VGVzdFJvdXRlR2VuZXJpYyhjYW52YXNQb2ludCwgcm91dGVQb2ludHMsIHtcbiAgICAgIHdheXBvaW50SGl0UmFkaXVzOiAxNixcbiAgICAgIGxlZ0hpdERpc3RhbmNlOiAxMCxcbiAgICB9KTtcblxuICAgIGlmICghaGl0KSBjb250aW51ZTtcblxuICAgIC8vIENhbGN1bGF0ZSBkaXN0YW5jZXMgZm9yIGJlc3Qgc2VsZWN0aW9uXG4gICAgbGV0IHBvaW50ZXJEaXN0OiBudW1iZXI7XG4gICAgbGV0IHNoaXBEaXN0OiBudW1iZXI7XG5cbiAgICBpZiAoaGl0LnR5cGUgPT09IFwid2F5cG9pbnRcIikge1xuICAgICAgLy8gRGlzdGFuY2UgZnJvbSBwb2ludGVyIHRvIHdheXBvaW50XG4gICAgICBjb25zdCB3cENhbnZhcyA9IHJvdXRlUG9pbnRzLmNhbnZhc1BvaW50c1toaXQuaW5kZXggKyAxXTtcbiAgICAgIHBvaW50ZXJEaXN0ID0gTWF0aC5oeXBvdChjYW52YXNQb2ludC54IC0gd3BDYW52YXMueCwgY2FudmFzUG9pbnQueSAtIHdwQ2FudmFzLnkpO1xuICAgICAgLy8gRGlzdGFuY2UgZnJvbSBzaGlwIHRvIHdheXBvaW50XG4gICAgICBjb25zdCB3cFdvcmxkID0gcm91dGVQb2ludHMud29ybGRQb2ludHNbaGl0LmluZGV4ICsgMV07XG4gICAgICBzaGlwRGlzdCA9IE1hdGguaHlwb3Qod3BXb3JsZC54IC0gc2hpcFBvcy54LCB3cFdvcmxkLnkgLSBzaGlwUG9zLnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBoaXQudHlwZSA9PT0gXCJsZWdcIlxuICAgICAgLy8gRGlzdGFuY2UgZnJvbSBwb2ludGVyIHRvIGxlZyAoYWxyZWFkeSBjYWxjdWxhdGVkIGluIGhpdFRlc3QsIHJlY2FsYyBmb3IgY29uc2lzdGVuY3kpXG4gICAgICBjb25zdCB7IGNhbnZhc1BvaW50cywgd29ybGRQb2ludHMgfSA9IHJvdXRlUG9pbnRzO1xuICAgICAgcG9pbnRlckRpc3QgPSBNYXRoLmh5cG90KFxuICAgICAgICAoY2FudmFzUG9pbnRzW2hpdC5pbmRleF0ueCArIGNhbnZhc1BvaW50c1toaXQuaW5kZXggKyAxXS54KSAqIDAuNSAtIGNhbnZhc1BvaW50LngsXG4gICAgICAgIChjYW52YXNQb2ludHNbaGl0LmluZGV4XS55ICsgY2FudmFzUG9pbnRzW2hpdC5pbmRleCArIDFdLnkpICogMC41IC0gY2FudmFzUG9pbnQueVxuICAgICAgKTtcbiAgICAgIC8vIERpc3RhbmNlIGZyb20gc2hpcCB0byBsZWcgbWlkcG9pbnRcbiAgICAgIGNvbnN0IG1pZFdvcmxkID0ge1xuICAgICAgICB4OiAod29ybGRQb2ludHNbaGl0LmluZGV4XS54ICsgd29ybGRQb2ludHNbaGl0LmluZGV4ICsgMV0ueCkgKiAwLjUsXG4gICAgICAgIHk6ICh3b3JsZFBvaW50c1toaXQuaW5kZXhdLnkgKyB3b3JsZFBvaW50c1toaXQuaW5kZXggKyAxXS55KSAqIDAuNSxcbiAgICAgIH07XG4gICAgICBzaGlwRGlzdCA9IE1hdGguaHlwb3QobWlkV29ybGQueCAtIHNoaXBQb3MueCwgbWlkV29ybGQueSAtIHNoaXBQb3MueSk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyB0aGUgYmVzdCBoaXQgc28gZmFyXG4gICAgaWYgKFxuICAgICAgIWJlc3QgfHxcbiAgICAgIHBvaW50ZXJEaXN0IDwgYmVzdC5wb2ludGVyRGlzdCAtIDAuMSB8fFxuICAgICAgKE1hdGguYWJzKHBvaW50ZXJEaXN0IC0gYmVzdC5wb2ludGVyRGlzdCkgPD0gMC41ICYmIHNoaXBEaXN0IDwgYmVzdC5zaGlwRGlzdClcbiAgICApIHtcbiAgICAgIGNvbnN0IHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiA9IGhpdC50eXBlID09PSBcIndheXBvaW50XCJcbiAgICAgICAgPyB7IHR5cGU6IFwid2F5cG9pbnRcIiwgaW5kZXg6IGhpdC5pbmRleCB9XG4gICAgICAgIDogeyB0eXBlOiBcInJvdXRlXCIsIGluZGV4OiBoaXQuaW5kZXggfTtcblxuICAgICAgYmVzdCA9IHtcbiAgICAgICAgcm91dGUsXG4gICAgICAgIHNlbGVjdGlvbixcbiAgICAgICAgcG9pbnRlckRpc3QsXG4gICAgICAgIHNoaXBEaXN0LFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWJlc3QpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4geyByb3V0ZTogYmVzdC5yb3V0ZSwgc2VsZWN0aW9uOiBiZXN0LnNlbGVjdGlvbiB9O1xufVxuXG5mdW5jdGlvbiBkcmF3U2hpcCh4OiBudW1iZXIsIHk6IG51bWJlciwgdng6IG51bWJlciwgdnk6IG51bWJlciwgY29sb3I6IHN0cmluZywgZmlsbGVkOiBib29sZWFuKTogdm9pZCB7XG4gIGlmICghY3R4KSByZXR1cm47XG4gIGNvbnN0IHAgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeSB9KTtcbiAgY29uc3QgciA9IDEwO1xuICBjdHguc2F2ZSgpO1xuICBjdHgudHJhbnNsYXRlKHAueCwgcC55KTtcbiAgY29uc3QgYW5nbGUgPSBNYXRoLmF0YW4yKHZ5LCB2eCk7XG4gIGN0eC5yb3RhdGUoYW5nbGUpO1xuICBjdHguYmVnaW5QYXRoKCk7XG4gIGN0eC5tb3ZlVG8ociwgMCk7XG4gIGN0eC5saW5lVG8oLXIgKiAwLjcsIHIgKiAwLjYpO1xuICBjdHgubGluZVRvKC1yICogMC40LCAwKTtcbiAgY3R4LmxpbmVUbygtciAqIDAuNywgLXIgKiAwLjYpO1xuICBjdHguY2xvc2VQYXRoKCk7XG4gIGN0eC5saW5lV2lkdGggPSAyO1xuICBjdHguc3Ryb2tlU3R5bGUgPSBjb2xvcjtcbiAgaWYgKGZpbGxlZCkge1xuICAgIGN0eC5maWxsU3R5bGUgPSBgJHtjb2xvcn1jY2A7XG4gICAgY3R4LmZpbGwoKTtcbiAgfVxuICBjdHguc3Ryb2tlKCk7XG4gIGN0eC5yZXN0b3JlKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdHaG9zdERvdCh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIWN0eCkgcmV0dXJuO1xuICBjb25zdCBwID0gd29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4LmFyYyhwLngsIHAueSwgMywgMCwgTWF0aC5QSSAqIDIpO1xuICBjdHguZmlsbFN0eWxlID0gXCIjY2NjY2NjYWFcIjtcbiAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gZHJhd1JvdXRlKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWUpIHJldHVybjtcbiAgY29uc3Qgcm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgY29uc3QgaGVhdCA9IHN0YXRlUmVmLm1lLmhlYXQ7XG4gIGNvbnN0IGhlYXRQYXJhbXM6IEhlYXRQcm9qZWN0aW9uUGFyYW1zIHwgdW5kZWZpbmVkID0gaGVhdFxuICAgID8ge1xuICAgICAgICBtYXJrZXJTcGVlZDogaGVhdC5tYXJrZXJTcGVlZCxcbiAgICAgICAga1VwOiBoZWF0LmtVcCxcbiAgICAgICAga0Rvd246IGhlYXQua0Rvd24sXG4gICAgICAgIGV4cDogaGVhdC5leHAsXG4gICAgICAgIG1heDogaGVhdC5tYXgsXG4gICAgICAgIG92ZXJoZWF0QXQ6IGhlYXQub3ZlcmhlYXRBdCxcbiAgICAgICAgd2FybkF0OiBoZWF0Lndhcm5BdCxcbiAgICAgIH1cbiAgICA6IHVuZGVmaW5lZDtcblxuICAvLyBDb252ZXJ0IHNlbGVjdGlvbiBmcm9tIGFjdHVhbCBpbmRleCB0byBkaXNwbGF5IGluZGV4IGZvciByZW5kZXJpbmdcbiAgY29uc3QgZGlzcGxheVNlbGVjdGlvbiA9IHNlbGVjdGlvbiA/IHtcbiAgICB0eXBlOiBzZWxlY3Rpb24udHlwZSxcbiAgICBpbmRleDogYWN0dWFsSW5kZXhUb0Rpc3BsYXlJbmRleChzZWxlY3Rpb24uaW5kZXgpXG4gIH0gOiBudWxsO1xuXG4gIC8vIE9ubHkgc2hvdyBzZWxlY3Rpb24gaWYgdGhlIHdheXBvaW50IGhhc24ndCBiZWVuIHBhc3NlZFxuICBjb25zdCB2YWxpZFNlbGVjdGlvbiA9IGRpc3BsYXlTZWxlY3Rpb24gJiYgZGlzcGxheVNlbGVjdGlvbi5pbmRleCA+PSAwID8gZGlzcGxheVNlbGVjdGlvbiA6IG51bGw7XG5cbiAgLy8gQ29udmVydCBkcmFnZ2VkV2F5cG9pbnQgaW5kZXggYXMgd2VsbFxuICBjb25zdCBkaXNwbGF5RHJhZ2dlZFdheXBvaW50ID0gZHJhZ2dlZFdheXBvaW50ICE9PSBudWxsXG4gICAgPyBhY3R1YWxJbmRleFRvRGlzcGxheUluZGV4KGRyYWdnZWRXYXlwb2ludClcbiAgICA6IG51bGw7XG4gIGNvbnN0IHZhbGlkRHJhZ2dlZFdheXBvaW50ID0gZGlzcGxheURyYWdnZWRXYXlwb2ludCAhPT0gbnVsbCAmJiBkaXNwbGF5RHJhZ2dlZFdheXBvaW50ID49IDBcbiAgICA/IGRpc3BsYXlEcmFnZ2VkV2F5cG9pbnRcbiAgICA6IG51bGw7XG5cbiAgZHJhd1BsYW5uZWRSb3V0ZShjdHgsIHtcbiAgICByb3V0ZVBvaW50czogcm91dGUsXG4gICAgc2VsZWN0aW9uOiB2YWxpZFNlbGVjdGlvbixcbiAgICBkcmFnZ2VkV2F5cG9pbnQ6IHZhbGlkRHJhZ2dlZFdheXBvaW50LFxuICAgIGRhc2hTdG9yZTogc2hpcExlZ0Rhc2hPZmZzZXRzLFxuICAgIHBhbGV0dGU6IFNISVBfUEFMRVRURSxcbiAgICBzaG93TGVnczogdWlTdGF0ZVJlZi5zaG93U2hpcFJvdXRlLFxuICAgIGhlYXRQYXJhbXMsXG4gICAgaW5pdGlhbEhlYXQ6IGhlYXQ/LnZhbHVlID8/IDAsXG4gICAgZGVmYXVsdFNwZWVkLFxuICAgIHdvcmxkUG9pbnRzOiByb3V0ZS53b3JsZFBvaW50cyxcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGRyYXdNaXNzaWxlUm91dGUoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFzdGF0ZVJlZi5tZSkgcmV0dXJuO1xuICBpZiAodWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgIT09IFwibWlzc2lsZVwiKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICBjb25zdCBoZWF0UGFyYW1zOiBIZWF0UHJvamVjdGlvblBhcmFtcyB8IHVuZGVmaW5lZCA9IHN0YXRlUmVmLm1pc3NpbGVDb25maWcuaGVhdFBhcmFtcztcblxuICAvLyBNYXAgTWlzc2lsZVNlbGVjdGlvbiAodXNlcyBcInJvdXRlXCIgZm9yIGxlZ3MpIHRvIGdlbmVyaWMgU2VsZWN0aW9uICh1c2VzIFwibGVnXCIgZm9yIGxlZ3MpXG4gIGNvbnN0IGdlbmVyaWNTZWxlY3Rpb246IHsgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjsgaW5kZXg6IG51bWJlciB9IHwgbnVsbCA9IG1pc3NpbGVTZWxlY3Rpb25cbiAgICA/IG1pc3NpbGVTZWxlY3Rpb24udHlwZSA9PT0gXCJyb3V0ZVwiXG4gICAgICA/IHsgdHlwZTogXCJsZWdcIiwgaW5kZXg6IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggfVxuICAgICAgOiB7IHR5cGU6IFwid2F5cG9pbnRcIiwgaW5kZXg6IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggfVxuICAgIDogbnVsbDtcblxuICBkcmF3UGxhbm5lZFJvdXRlKGN0eCwge1xuICAgIHJvdXRlUG9pbnRzOiByb3V0ZSxcbiAgICBzZWxlY3Rpb246IGdlbmVyaWNTZWxlY3Rpb24sXG4gICAgZHJhZ2dlZFdheXBvaW50OiBudWxsLFxuICAgIGRhc2hTdG9yZTogbWlzc2lsZUxlZ0Rhc2hPZmZzZXRzLFxuICAgIHBhbGV0dGU6IE1JU1NJTEVfUEFMRVRURSxcbiAgICBzaG93TGVnczogdHJ1ZSxcbiAgICBoZWF0UGFyYW1zLFxuICAgIGluaXRpYWxIZWF0OiAwLCAvLyBNaXNzaWxlcyBzdGFydCBhdCB6ZXJvIGhlYXRcbiAgICBkZWZhdWx0U3BlZWQ6IHN0YXRlUmVmLm1pc3NpbGVDb25maWcuc3BlZWQsXG4gICAgd29ybGRQb2ludHM6IHJvdXRlLndvcmxkUG9pbnRzLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gZHJhd01pc3NpbGVzKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWlzc2lsZXMgfHwgc3RhdGVSZWYubWlzc2lsZXMubGVuZ3RoID09PSAwIHx8ICFjdikgcmV0dXJuO1xuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHJhZGl1c1NjYWxlID0gKHNjYWxlWCArIHNjYWxlWSkgLyAyO1xuICBmb3IgKGNvbnN0IG1pc3Mgb2Ygc3RhdGVSZWYubWlzc2lsZXMpIHtcbiAgICBjb25zdCBwID0gd29ybGRUb0NhbnZhcyh7IHg6IG1pc3MueCwgeTogbWlzcy55IH0pO1xuICAgIGNvbnN0IHNlbGZPd25lZCA9IEJvb2xlYW4obWlzcy5zZWxmKTtcbiAgICBjdHguc2F2ZSgpO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHguYXJjKHAueCwgcC55LCBzZWxmT3duZWQgPyA2IDogNSwgMCwgTWF0aC5QSSAqIDIpO1xuICAgIGN0eC5maWxsU3R5bGUgPSBzZWxmT3duZWQgPyBcIiNmODcxNzFcIiA6IFwiI2ZjYTVhNVwiO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IHNlbGZPd25lZCA/IDAuOTUgOiAwLjg7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSAxLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMTExODI3XCI7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGN0eC5yZXN0b3JlKCk7XG5cbiAgICBpZiAoc2VsZk93bmVkICYmIG1pc3MuYWdyb19yYWRpdXMgPiAwKSB7XG4gICAgICBjdHguc2F2ZSgpO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY29uc3QgckNhbnZhcyA9IG1pc3MuYWdyb19yYWRpdXMgKiByYWRpdXNTY2FsZTtcbiAgICAgIGN0eC5zZXRMaW5lRGFzaChbMTQsIDEwXSk7XG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSBcInJnYmEoMjQ4LDExMywxMTMsMC4zNSlcIjtcbiAgICAgIGN0eC5saW5lV2lkdGggPSAxLjI7XG4gICAgICBjdHguYXJjKHAueCwgcC55LCByQ2FudmFzLCAwLCBNYXRoLlBJICogMik7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuICAgIH1cblxuICB9XG59XG5cbmZ1bmN0aW9uIGRyYXdHcmlkKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhY3YpIHJldHVybjtcbiAgY3R4LnNhdmUoKTtcbiAgY3R4LnN0cm9rZVN0eWxlID0gXCIjMjM0XCI7XG4gIGN0eC5saW5lV2lkdGggPSAxO1xuXG4gIGNvbnN0IHpvb20gPSB1aVN0YXRlUmVmLnpvb207XG4gIGxldCBzdGVwID0gMTAwMDtcbiAgaWYgKHpvb20gPCAwLjcpIHtcbiAgICBzdGVwID0gMjAwMDtcbiAgfSBlbHNlIGlmICh6b29tID4gMS41KSB7XG4gICAgc3RlcCA9IDUwMDtcbiAgfSBlbHNlIGlmICh6b29tID4gMi41KSB7XG4gICAgc3RlcCA9IDI1MDtcbiAgfVxuXG4gIGNvbnN0IGNhbWVyYSA9IGdldENhbWVyYVBvc2l0aW9uKCk7XG5cbiAgLy8gQ2FsY3VsYXRlIHZpZXdwb3J0IHVzaW5nIHVuaWZvcm0gc2NhbGUgKHNhbWUgYXMgY29vcmRpbmF0ZSB0cmFuc2Zvcm1zKVxuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcbiAgY29uc3Qgdmlld3BvcnRXaWR0aCA9IGN2LndpZHRoIC8gc2NhbGU7XG4gIGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gY3YuaGVpZ2h0IC8gc2NhbGU7XG5cbiAgY29uc3QgbWluWCA9IE1hdGgubWF4KDAsIGNhbWVyYS54IC0gdmlld3BvcnRXaWR0aCAvIDIpO1xuICBjb25zdCBtYXhYID0gTWF0aC5taW4od29ybGQudywgY2FtZXJhLnggKyB2aWV3cG9ydFdpZHRoIC8gMik7XG4gIGNvbnN0IG1pblkgPSBNYXRoLm1heCgwLCBjYW1lcmEueSAtIHZpZXdwb3J0SGVpZ2h0IC8gMik7XG4gIGNvbnN0IG1heFkgPSBNYXRoLm1pbih3b3JsZC5oLCBjYW1lcmEueSArIHZpZXdwb3J0SGVpZ2h0IC8gMik7XG5cbiAgY29uc3Qgc3RhcnRYID0gTWF0aC5mbG9vcihtaW5YIC8gc3RlcCkgKiBzdGVwO1xuICBjb25zdCBlbmRYID0gTWF0aC5jZWlsKG1heFggLyBzdGVwKSAqIHN0ZXA7XG4gIGNvbnN0IHN0YXJ0WSA9IE1hdGguZmxvb3IobWluWSAvIHN0ZXApICogc3RlcDtcbiAgY29uc3QgZW5kWSA9IE1hdGguY2VpbChtYXhZIC8gc3RlcCkgKiBzdGVwO1xuXG4gIGZvciAobGV0IHggPSBzdGFydFg7IHggPD0gZW5kWDsgeCArPSBzdGVwKSB7XG4gICAgY29uc3QgYSA9IHdvcmxkVG9DYW52YXMoeyB4LCB5OiBNYXRoLm1heCgwLCBtaW5ZKSB9KTtcbiAgICBjb25zdCBiID0gd29ybGRUb0NhbnZhcyh7IHgsIHk6IE1hdGgubWluKHdvcmxkLmgsIG1heFkpIH0pO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGEueCwgYS55KTtcbiAgICBjdHgubGluZVRvKGIueCwgYi55KTtcbiAgICBjdHguc3Ryb2tlKCk7XG4gIH1cbiAgZm9yIChsZXQgeSA9IHN0YXJ0WTsgeSA8PSBlbmRZOyB5ICs9IHN0ZXApIHtcbiAgICBjb25zdCBhID0gd29ybGRUb0NhbnZhcyh7IHg6IE1hdGgubWF4KDAsIG1pblgpLCB5IH0pO1xuICAgIGNvbnN0IGIgPSB3b3JsZFRvQ2FudmFzKHsgeDogTWF0aC5taW4od29ybGQudywgbWF4WCksIHkgfSk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oYS54LCBhLnkpO1xuICAgIGN0eC5saW5lVG8oYi54LCBiLnkpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgfVxuICBjdHgucmVzdG9yZSgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTogdm9pZCB7XG4gIGlmICghbWlzc2lsZUxhdW5jaEJ0biB8fCAhbWlzc2lsZUxhdW5jaFRleHQgfHwgIW1pc3NpbGVMYXVuY2hJbmZvKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGNvdW50ID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gIGNvbnN0IHJlbWFpbmluZyA9IGdldE1pc3NpbGVDb29sZG93blJlbWFpbmluZygpO1xuICBjb25zdCBjb29saW5nRG93biA9IHJlbWFpbmluZyA+IDAuMDU7XG4gIGNvbnN0IHNob3VsZERpc2FibGUgPSAhcm91dGUgfHwgY291bnQgPT09IDAgfHwgY29vbGluZ0Rvd247XG4gIG1pc3NpbGVMYXVuY2hCdG4uZGlzYWJsZWQgPSBzaG91bGREaXNhYmxlO1xuXG4gIGNvbnN0IGxhdW5jaFRleHRIVE1MID0gJzxzcGFuIGNsYXNzPVwiYnRuLXRleHQtZnVsbFwiPkxhdW5jaDwvc3Bhbj48c3BhbiBjbGFzcz1cImJ0bi10ZXh0LXNob3J0XCI+RmlyZTwvc3Bhbj4nO1xuICBsZXQgbGF1bmNoSW5mb0hUTUwgPSBcIlwiO1xuXG4gIGlmICghcm91dGUpIHtcbiAgICBsYXVuY2hJbmZvSFRNTCA9IFwiXCI7XG4gIH0gZWxzZSBpZiAoY29vbGluZ0Rvd24pIHtcbiAgICBsYXVuY2hJbmZvSFRNTCA9IGAke3JlbWFpbmluZy50b0ZpeGVkKDEpfXNgO1xuICB9IGVsc2UgaWYgKHJvdXRlLm5hbWUpIHtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGNvbnN0IHJvdXRlSW5kZXggPSByb3V0ZXMuZmluZEluZGV4KChyKSA9PiByLmlkID09PSByb3V0ZS5pZCkgKyAxO1xuICAgIGxhdW5jaEluZm9IVE1MID0gYDxzcGFuIGNsYXNzPVwiYnRuLXRleHQtZnVsbFwiPiR7cm91dGUubmFtZX08L3NwYW4+PHNwYW4gY2xhc3M9XCJidG4tdGV4dC1zaG9ydFwiPiR7cm91dGVJbmRleH08L3NwYW4+YDtcbiAgfSBlbHNlIHtcbiAgICBsYXVuY2hJbmZvSFRNTCA9IFwiXCI7XG4gIH1cblxuICBpZiAobGFzdE1pc3NpbGVMYXVuY2hUZXh0SFRNTCAhPT0gbGF1bmNoVGV4dEhUTUwpIHtcbiAgICBtaXNzaWxlTGF1bmNoVGV4dC5pbm5lckhUTUwgPSBsYXVuY2hUZXh0SFRNTDtcbiAgICBsYXN0TWlzc2lsZUxhdW5jaFRleHRIVE1MID0gbGF1bmNoVGV4dEhUTUw7XG4gIH1cblxuICBpZiAobGFzdE1pc3NpbGVMYXVuY2hJbmZvSFRNTCAhPT0gbGF1bmNoSW5mb0hUTUwpIHtcbiAgICBtaXNzaWxlTGF1bmNoSW5mby5pbm5lckhUTUwgPSBsYXVuY2hJbmZvSFRNTDtcbiAgICBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gbGF1bmNoSW5mb0hUTUw7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk6IG51bWJlciB7XG4gIGNvbnN0IHJlbWFpbmluZyA9IHN0YXRlUmVmLm5leHRNaXNzaWxlUmVhZHlBdCAtIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZVJlZik7XG4gIHJldHVybiByZW1haW5pbmcgPiAwID8gcmVtYWluaW5nIDogMDtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpOiB2b2lkIHtcbiAgY29uc3QgbWV0YSA9IHN0YXRlUmVmLndvcmxkTWV0YSA/PyB7fTtcbiAgY29uc3QgaGFzV2lkdGggPSB0eXBlb2YgbWV0YS53ID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLncpO1xuICBjb25zdCBoYXNIZWlnaHQgPSB0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpO1xuXG4gIGlmIChoYXNXaWR0aCkge1xuICAgIHdvcmxkLncgPSBtZXRhLnchO1xuICB9XG4gIGlmIChoYXNIZWlnaHQpIHtcbiAgICB3b3JsZC5oID0gbWV0YS5oITtcbiAgfVxuICBpZiAoSFBzcGFuKSB7XG4gICAgaWYgKHN0YXRlUmVmLm1lICYmIE51bWJlci5pc0Zpbml0ZShzdGF0ZVJlZi5tZS5ocCkpIHtcbiAgICAgIEhQc3Bhbi50ZXh0Q29udGVudCA9IE51bWJlcihzdGF0ZVJlZi5tZS5ocCkudG9TdHJpbmcoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gXCJcdTIwMTNcIjtcbiAgICB9XG4gIH1cbiAgaWYgKGtpbGxzU3Bhbikge1xuICAgIGlmIChzdGF0ZVJlZi5tZSAmJiBOdW1iZXIuaXNGaW5pdGUoc3RhdGVSZWYubWUua2lsbHMpKSB7XG4gICAgICBraWxsc1NwYW4udGV4dENvbnRlbnQgPSBOdW1iZXIoc3RhdGVSZWYubWUua2lsbHMpLnRvU3RyaW5nKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtpbGxzU3Bhbi50ZXh0Q29udGVudCA9IFwiMFwiO1xuICAgIH1cbiAgfVxuXG4gIC8vIFVwZGF0ZSBoZWF0IGJhclxuICB1cGRhdGVIZWF0QmFyKCk7XG4gIC8vIFVwZGF0ZSBwbGFubmVkIGhlYXQgYmFyXG4gIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG4gIC8vIFVwZGF0ZSBzcGVlZCBtYXJrZXIgcG9zaXRpb25cbiAgdXBkYXRlU3BlZWRNYXJrZXIoKTtcbiAgLy8gVXBkYXRlIHN0YWxsIG92ZXJsYXlcbiAgdXBkYXRlU3RhbGxPdmVybGF5KCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUhlYXRCYXIoKTogdm9pZCB7XG4gIGNvbnN0IGhlYXQgPSBzdGF0ZVJlZi5tZT8uaGVhdDtcbiAgaWYgKCFoZWF0IHx8ICFoZWF0QmFyRmlsbCB8fCAhaGVhdFZhbHVlVGV4dCkge1xuICAgIGhlYXRXYXJuQWN0aXZlID0gZmFsc2U7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgcGVyY2VudCA9IChoZWF0LnZhbHVlIC8gaGVhdC5tYXgpICogMTAwO1xuICBoZWF0QmFyRmlsbC5zdHlsZS53aWR0aCA9IGAke3BlcmNlbnR9JWA7XG5cbiAgLy8gVXBkYXRlIHRleHRcbiAgaGVhdFZhbHVlVGV4dC50ZXh0Q29udGVudCA9IGBIZWF0ICR7TWF0aC5yb3VuZChoZWF0LnZhbHVlKX1gO1xuXG4gIC8vIFVwZGF0ZSBjb2xvciBjbGFzc2VzXG4gIGhlYXRCYXJGaWxsLmNsYXNzTGlzdC5yZW1vdmUoXCJ3YXJuXCIsIFwib3ZlcmhlYXRcIik7XG4gIGlmIChoZWF0LnZhbHVlID49IGhlYXQub3ZlcmhlYXRBdCkge1xuICAgIGhlYXRCYXJGaWxsLmNsYXNzTGlzdC5hZGQoXCJvdmVyaGVhdFwiKTtcbiAgfSBlbHNlIGlmIChoZWF0LnZhbHVlID49IGhlYXQud2FybkF0KSB7XG4gICAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LmFkZChcIndhcm5cIik7XG4gIH1cblxuICBjb25zdCBub3dXYXJuID0gaGVhdC52YWx1ZSA+PSBoZWF0Lndhcm5BdDtcbiAgaWYgKG5vd1dhcm4gJiYgIWhlYXRXYXJuQWN0aXZlKSB7XG4gICAgaGVhdFdhcm5BY3RpdmUgPSB0cnVlO1xuICAgIGJ1c1JlZi5lbWl0KFwiaGVhdDp3YXJuRW50ZXJlZFwiLCB7IHZhbHVlOiBoZWF0LnZhbHVlLCB3YXJuQXQ6IGhlYXQud2FybkF0IH0pO1xuICB9IGVsc2UgaWYgKCFub3dXYXJuICYmIGhlYXRXYXJuQWN0aXZlKSB7XG4gICAgY29uc3QgY29vbFRocmVzaG9sZCA9IE1hdGgubWF4KDAsIGhlYXQud2FybkF0IC0gNSk7XG4gICAgaWYgKGhlYXQudmFsdWUgPD0gY29vbFRocmVzaG9sZCkge1xuICAgICAgaGVhdFdhcm5BY3RpdmUgPSBmYWxzZTtcbiAgICAgIGJ1c1JlZi5lbWl0KFwiaGVhdDpjb29sZWRCZWxvd1dhcm5cIiwgeyB2YWx1ZTogaGVhdC52YWx1ZSwgd2FybkF0OiBoZWF0Lndhcm5BdCB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTogdm9pZCB7XG4gIGNvbnN0IHNoaXAgPSBzdGF0ZVJlZi5tZTtcbiAgY29uc3QgcGxhbm5lZEVsID0gaGVhdEJhclBsYW5uZWQ7XG4gIGlmICghc2hpcCB8fCAhc2hpcC5oZWF0IHx8ICFwbGFubmVkRWwpIHtcbiAgICBkdWFsTWV0ZXJBbGVydCA9IGZhbHNlO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHBsYW5uZWQgPSBwcm9qZWN0UGxhbm5lZEhlYXQoc2hpcCk7XG4gIGNvbnN0IGFjdHVhbCA9IHNoaXAuaGVhdC52YWx1ZTtcbiAgY29uc3QgcGVyY2VudCA9IChwbGFubmVkIC8gc2hpcC5oZWF0Lm1heCkgKiAxMDA7XG4gIHBsYW5uZWRFbC5zdHlsZS53aWR0aCA9IGAke01hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGVyY2VudCkpfSVgO1xuXG4gIGNvbnN0IGRpZmYgPSBwbGFubmVkIC0gYWN0dWFsO1xuICBjb25zdCB0aHJlc2hvbGQgPSBNYXRoLm1heCg4LCBzaGlwLmhlYXQud2FybkF0ICogMC4xKTtcbiAgaWYgKGRpZmYgPj0gdGhyZXNob2xkICYmICFkdWFsTWV0ZXJBbGVydCkge1xuICAgIGR1YWxNZXRlckFsZXJ0ID0gdHJ1ZTtcbiAgICBidXNSZWYuZW1pdChcImhlYXQ6ZHVhbE1ldGVyRGl2ZXJnZWRcIiwgeyBwbGFubmVkLCBhY3R1YWwgfSk7XG4gIH0gZWxzZSBpZiAoZGlmZiA8IHRocmVzaG9sZCAqIDAuNiAmJiBkdWFsTWV0ZXJBbGVydCkge1xuICAgIGR1YWxNZXRlckFsZXJ0ID0gZmFsc2U7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHJvamVjdFBsYW5uZWRIZWF0KHNoaXA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdheXBvaW50czogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgc3BlZWQ/OiBudW1iZXIgfVtdOyBoZWF0PzogeyB2YWx1ZTogbnVtYmVyOyBtYXg6IG51bWJlcjsgbWFya2VyU3BlZWQ6IG51bWJlcjsga1VwOiBudW1iZXI7IGtEb3duOiBudW1iZXI7IGV4cDogbnVtYmVyOyB3YXJuQXQ6IG51bWJlcjsgb3ZlcmhlYXRBdDogbnVtYmVyIH0gfSk6IG51bWJlciB7XG4gIGNvbnN0IGhlYXQgPSBzaGlwLmhlYXQhO1xuXG4gIC8vIEJ1aWxkIHJvdXRlIGZyb20gc2hpcCBwb3NpdGlvbiBhbmQgd2F5cG9pbnRzXG4gIGNvbnN0IHJvdXRlID0gW3sgeDogc2hpcC54LCB5OiBzaGlwLnksIHNwZWVkOiB1bmRlZmluZWQgfSwgLi4uc2hpcC53YXlwb2ludHNdO1xuXG4gIC8vIFVzZSBzaGFyZWQgaGVhdCBwcm9qZWN0aW9uXG4gIGNvbnN0IGhlYXRQYXJhbXM6IEhlYXRQcm9qZWN0aW9uUGFyYW1zID0ge1xuICAgIG1hcmtlclNwZWVkOiBoZWF0Lm1hcmtlclNwZWVkLFxuICAgIGtVcDogaGVhdC5rVXAsXG4gICAga0Rvd246IGhlYXQua0Rvd24sXG4gICAgZXhwOiBoZWF0LmV4cCxcbiAgICBtYXg6IGhlYXQubWF4LFxuICAgIG92ZXJoZWF0QXQ6IGhlYXQub3ZlcmhlYXRBdCxcbiAgICB3YXJuQXQ6IGhlYXQud2FybkF0LFxuICB9O1xuXG4gIGNvbnN0IHByb2plY3Rpb24gPSBwcm9qZWN0Um91dGVIZWF0KHJvdXRlLCBoZWF0LnZhbHVlLCBoZWF0UGFyYW1zKTtcblxuICAvLyBSZXR1cm4gbWF4aW11bSBoZWF0IGFsb25nIHJvdXRlXG4gIHJldHVybiBNYXRoLm1heCguLi5wcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50cyk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVNwZWVkTWFya2VyKCk6IHZvaWQge1xuICBjb25zdCBzaGlwSGVhdCA9IHN0YXRlUmVmLm1lPy5oZWF0O1xuICBpZiAoc3BlZWRNYXJrZXIgJiYgc2hpcFNwZWVkU2xpZGVyICYmIHNoaXBIZWF0ICYmIHNoaXBIZWF0Lm1hcmtlclNwZWVkID4gMCkge1xuICAgIGNvbnN0IG1pbiA9IHBhcnNlRmxvYXQoc2hpcFNwZWVkU2xpZGVyLm1pbik7XG4gICAgY29uc3QgbWF4ID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIubWF4KTtcbiAgICBjb25zdCBtYXJrZXJTcGVlZCA9IHNoaXBIZWF0Lm1hcmtlclNwZWVkO1xuICAgIGNvbnN0IHBlcmNlbnQgPSAoKG1hcmtlclNwZWVkIC0gbWluKSAvIChtYXggLSBtaW4pKSAqIDEwMDtcbiAgICBjb25zdCBjbGFtcGVkID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBwZXJjZW50KSk7XG4gICAgc3BlZWRNYXJrZXIuc3R5bGUubGVmdCA9IGAke2NsYW1wZWR9JWA7XG4gICAgc3BlZWRNYXJrZXIudGl0bGUgPSBgSGVhdCBuZXV0cmFsOiAke01hdGgucm91bmQobWFya2VyU3BlZWQpfSB1bml0cy9zYDtcbiAgICBzcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICB9IGVsc2UgaWYgKHNwZWVkTWFya2VyKSB7XG4gICAgc3BlZWRNYXJrZXIuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICB9XG5cbiAgaWYgKG1pc3NpbGVTcGVlZE1hcmtlciAmJiBtaXNzaWxlU3BlZWRTbGlkZXIpIHtcbiAgICBjb25zdCBoZWF0UGFyYW1zID0gc3RhdGVSZWYubWlzc2lsZUNvbmZpZy5oZWF0UGFyYW1zO1xuICAgIGNvbnN0IG1hcmtlclNwZWVkID1cbiAgICAgIChoZWF0UGFyYW1zICYmIE51bWJlci5pc0Zpbml0ZShoZWF0UGFyYW1zLm1hcmtlclNwZWVkKSA/IGhlYXRQYXJhbXMubWFya2VyU3BlZWQgOiB1bmRlZmluZWQpID8/XG4gICAgICAoc2hpcEhlYXQgJiYgc2hpcEhlYXQubWFya2VyU3BlZWQgPiAwID8gc2hpcEhlYXQubWFya2VyU3BlZWQgOiB1bmRlZmluZWQpO1xuXG4gICAgaWYgKG1hcmtlclNwZWVkICE9PSB1bmRlZmluZWQgJiYgbWFya2VyU3BlZWQgPiAwKSB7XG4gICAgICBjb25zdCBtaW4gPSBwYXJzZUZsb2F0KG1pc3NpbGVTcGVlZFNsaWRlci5taW4pO1xuICAgICAgY29uc3QgbWF4ID0gcGFyc2VGbG9hdChtaXNzaWxlU3BlZWRTbGlkZXIubWF4KTtcbiAgICAgIGNvbnN0IHBlcmNlbnQgPSAoKG1hcmtlclNwZWVkIC0gbWluKSAvIChtYXggLSBtaW4pKSAqIDEwMDtcbiAgICAgIGNvbnN0IGNsYW1wZWQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIHBlcmNlbnQpKTtcbiAgICAgIG1pc3NpbGVTcGVlZE1hcmtlci5zdHlsZS5sZWZ0ID0gYCR7Y2xhbXBlZH0lYDtcbiAgICAgIG1pc3NpbGVTcGVlZE1hcmtlci50aXRsZSA9IGBIZWF0IG5ldXRyYWw6ICR7TWF0aC5yb3VuZChtYXJrZXJTcGVlZCl9IHVuaXRzL3NgO1xuICAgICAgbWlzc2lsZVNwZWVkTWFya2VyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1pc3NpbGVTcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVN0YWxsT3ZlcmxheSgpOiB2b2lkIHtcbiAgY29uc3QgaGVhdCA9IHN0YXRlUmVmLm1lPy5oZWF0O1xuICBpZiAoIWhlYXQgfHwgIXN0YWxsT3ZlcmxheSkge1xuICAgIHN0YWxsQWN0aXZlID0gZmFsc2U7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgbm93ID0gdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgID8gcGVyZm9ybWFuY2Uubm93KClcbiAgICA6IERhdGUubm93KCk7XG5cbiAgY29uc3QgaXNTdGFsbGVkID0gbm93IDwgaGVhdC5zdGFsbFVudGlsTXM7XG5cbiAgaWYgKGlzU3RhbGxlZCkge1xuICAgIHN0YWxsT3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICBpZiAoIXN0YWxsQWN0aXZlKSB7XG4gICAgICBzdGFsbEFjdGl2ZSA9IHRydWU7XG4gICAgICBidXNSZWYuZW1pdChcImhlYXQ6c3RhbGxUcmlnZ2VyZWRcIiwgeyBzdGFsbFVudGlsOiBoZWF0LnN0YWxsVW50aWxNcyB9KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgc3RhbGxPdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGlmIChzdGFsbEFjdGl2ZSkge1xuICAgICAgc3RhbGxBY3RpdmUgPSBmYWxzZTtcbiAgICAgIGJ1c1JlZi5lbWl0KFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiLCB7IHZhbHVlOiBoZWF0LnZhbHVlIH0pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBsb29wKHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFjdikgcmV0dXJuO1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZSh0aW1lc3RhbXApKSB7XG4gICAgdGltZXN0YW1wID0gbGFzdExvb3BUcyA/PyAwO1xuICB9XG4gIGxldCBkdFNlY29uZHMgPSAwO1xuICBpZiAobGFzdExvb3BUcyAhPT0gbnVsbCkge1xuICAgIGR0U2Vjb25kcyA9ICh0aW1lc3RhbXAgLSBsYXN0TG9vcFRzKSAvIDEwMDA7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZHRTZWNvbmRzKSB8fCBkdFNlY29uZHMgPCAwKSB7XG4gICAgICBkdFNlY29uZHMgPSAwO1xuICAgIH1cbiAgfVxuICBsYXN0TG9vcFRzID0gdGltZXN0YW1wO1xuICB1cGRhdGVSb3V0ZUFuaW1hdGlvbnMoZHRTZWNvbmRzKTtcblxuICBjdHguY2xlYXJSZWN0KDAsIDAsIGN2LndpZHRoLCBjdi5oZWlnaHQpO1xuICBkcmF3R3JpZCgpO1xuICBkcmF3Um91dGUoKTtcbiAgZHJhd01pc3NpbGVSb3V0ZSgpO1xuICBkcmF3TWlzc2lsZXMoKTtcblxuICB1cGRhdGVNaXNzaWxlTGF1bmNoQnV0dG9uU3RhdGUoKTtcblxuICBmb3IgKGNvbnN0IGcgb2Ygc3RhdGVSZWYuZ2hvc3RzKSB7XG4gICAgZHJhd1NoaXAoZy54LCBnLnksIGcudngsIGcudnksIFwiIzljYTNhZlwiLCBmYWxzZSk7XG4gICAgZHJhd0dob3N0RG90KGcueCwgZy55KTtcbiAgfVxuICBpZiAoc3RhdGVSZWYubWUpIHtcbiAgICBkcmF3U2hpcChzdGF0ZVJlZi5tZS54LCBzdGF0ZVJlZi5tZS55LCBzdGF0ZVJlZi5tZS52eCwgc3RhdGVSZWYubWUudnksIFwiIzIyZDNlZVwiLCB0cnVlKTtcbiAgfVxuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG59XG4iLCAiaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi4vc3RhdGVcIjtcblxuaW50ZXJmYWNlIEhpZ2hsaWdodENvbnRlbnRPcHRpb25zIHtcbiAgdGFyZ2V0OiBIVE1MRWxlbWVudCB8IG51bGw7XG4gIHRpdGxlPzogc3RyaW5nO1xuICBib2R5OiBzdHJpbmc7XG4gIHN0ZXBJbmRleDogbnVtYmVyO1xuICBzdGVwQ291bnQ6IG51bWJlcjtcbiAgc2hvd05leHQ6IGJvb2xlYW47XG4gIG5leHRMYWJlbD86IHN0cmluZztcbiAgb25OZXh0PzogKCkgPT4gdm9pZDtcbiAgc2hvd1NraXA6IGJvb2xlYW47XG4gIHNraXBMYWJlbD86IHN0cmluZztcbiAgb25Ta2lwPzogKCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIaWdobGlnaHRlciB7XG4gIHNob3cob3B0aW9uczogSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMpOiB2b2lkO1xuICBoaWRlKCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuY29uc3QgU1RZTEVfSUQgPSBcInR1dG9yaWFsLW92ZXJsYXktc3R5bGVcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUhpZ2hsaWdodGVyKCk6IEhpZ2hsaWdodGVyIHtcbiAgZW5zdXJlU3R5bGVzKCk7XG5cbiAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5XCI7XG4gIG92ZXJsYXkuc2V0QXR0cmlidXRlKFwiYXJpYS1saXZlXCIsIFwicG9saXRlXCIpO1xuXG4gIGNvbnN0IHNjcmltID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc2NyaW0uY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19zY3JpbVwiO1xuXG4gIGNvbnN0IGhpZ2hsaWdodEJveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGhpZ2hsaWdodEJveC5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX2hpZ2hsaWdodFwiO1xuXG4gIGNvbnN0IHRvb2x0aXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0b29sdGlwLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fdG9vbHRpcFwiO1xuXG4gIGNvbnN0IHByb2dyZXNzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgcHJvZ3Jlc3MuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19wcm9ncmVzc1wiO1xuXG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImgzXCIpO1xuICB0aXRsZS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3RpdGxlXCI7XG5cbiAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJwXCIpO1xuICBib2R5LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fYm9keVwiO1xuXG4gIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fYWN0aW9uc1wiO1xuXG4gIGNvbnN0IHNraXBCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBza2lwQnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBza2lwQnRuLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fYnRuIHR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3RcIjtcbiAgc2tpcEJ0bi50ZXh0Q29udGVudCA9IFwiU2tpcFwiO1xuXG4gIGNvbnN0IG5leHRCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBuZXh0QnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBuZXh0QnRuLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fYnRuIHR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeVwiO1xuICBuZXh0QnRuLnRleHRDb250ZW50ID0gXCJOZXh0XCI7XG5cbiAgYWN0aW9ucy5hcHBlbmQoc2tpcEJ0biwgbmV4dEJ0bik7XG4gIHRvb2x0aXAuYXBwZW5kKHByb2dyZXNzLCB0aXRsZSwgYm9keSwgYWN0aW9ucyk7XG4gIG92ZXJsYXkuYXBwZW5kKHNjcmltLCBoaWdobGlnaHRCb3gsIHRvb2x0aXApO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gIGxldCBjdXJyZW50VGFyZ2V0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgdmlzaWJsZSA9IGZhbHNlO1xuICBsZXQgcmVzaXplT2JzZXJ2ZXI6IFJlc2l6ZU9ic2VydmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCBmcmFtZUhhbmRsZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGxldCBvbk5leHQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgb25Ta2lwOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBzY2hlZHVsZVVwZGF0ZSgpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUpIHJldHVybjtcbiAgICBpZiAoZnJhbWVIYW5kbGUgIT09IG51bGwpIHJldHVybjtcbiAgICBmcmFtZUhhbmRsZSA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgZnJhbWVIYW5kbGUgPSBudWxsO1xuICAgICAgdXBkYXRlUG9zaXRpb24oKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVBvc2l0aW9uKCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSkgcmV0dXJuO1xuXG4gICAgaWYgKGN1cnJlbnRUYXJnZXQpIHtcbiAgICAgIGNvbnN0IHJlY3QgPSBjdXJyZW50VGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgcGFkZGluZyA9IDEyO1xuICAgICAgY29uc3Qgd2lkdGggPSBNYXRoLm1heCgwLCByZWN0LndpZHRoICsgcGFkZGluZyAqIDIpO1xuICAgICAgY29uc3QgaGVpZ2h0ID0gTWF0aC5tYXgoMCwgcmVjdC5oZWlnaHQgKyBwYWRkaW5nICogMik7XG4gICAgICBjb25zdCBsZWZ0ID0gcmVjdC5sZWZ0IC0gcGFkZGluZztcbiAgICAgIGNvbnN0IHRvcCA9IHJlY3QudG9wIC0gcGFkZGluZztcblxuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjFcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZChsZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvcCl9cHgpYDtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS53aWR0aCA9IGAke01hdGgucm91bmQod2lkdGgpfXB4YDtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5oZWlnaHQgPSBgJHtNYXRoLnJvdW5kKGhlaWdodCl9cHhgO1xuXG4gICAgICB0b29sdGlwLnN0eWxlLm9wYWNpdHkgPSBcIjFcIjtcbiAgICAgIHRvb2x0aXAuc3R5bGUudmlzaWJpbGl0eSA9IFwidmlzaWJsZVwiO1xuICAgICAgdG9vbHRpcC5zdHlsZS5tYXhXaWR0aCA9IGBtaW4oMzQwcHgsICR7TWF0aC5tYXgoMjYwLCB3aW5kb3cuaW5uZXJXaWR0aCAtIDMyKX1weClgO1xuICAgICAgY29uc3QgdG9vbHRpcFdpZHRoID0gdG9vbHRpcC5vZmZzZXRXaWR0aDtcbiAgICAgIGNvbnN0IHRvb2x0aXBIZWlnaHQgPSB0b29sdGlwLm9mZnNldEhlaWdodDtcbiAgICAgIGxldCB0b29sdGlwVG9wID0gcmVjdC5ib3R0b20gKyAxODtcbiAgICAgIGlmICh0b29sdGlwVG9wICsgdG9vbHRpcEhlaWdodCA+IHdpbmRvdy5pbm5lckhlaWdodCAtIDIwKSB7XG4gICAgICAgIHRvb2x0aXBUb3AgPSBNYXRoLm1heCgyMCwgcmVjdC50b3AgLSB0b29sdGlwSGVpZ2h0IC0gMTgpO1xuICAgICAgfVxuICAgICAgbGV0IHRvb2x0aXBMZWZ0ID0gcmVjdC5sZWZ0ICsgcmVjdC53aWR0aCAvIDIgLSB0b29sdGlwV2lkdGggLyAyO1xuICAgICAgdG9vbHRpcExlZnQgPSBjbGFtcCh0b29sdGlwTGVmdCwgMjAsIHdpbmRvdy5pbm5lcldpZHRoIC0gdG9vbHRpcFdpZHRoIC0gMjApO1xuICAgICAgdG9vbHRpcC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh0b29sdGlwTGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b29sdGlwVG9wKX1weClgO1xuICAgIH0gZWxzZSB7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLndpZHRoID0gXCIwcHhcIjtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5oZWlnaHQgPSBcIjBweFwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHdpbmRvdy5pbm5lcldpZHRoIC8gMil9cHgsICR7TWF0aC5yb3VuZCh3aW5kb3cuaW5uZXJIZWlnaHQgLyAyKX1weClgO1xuXG4gICAgICB0b29sdGlwLnN0eWxlLm9wYWNpdHkgPSBcIjFcIjtcbiAgICAgIHRvb2x0aXAuc3R5bGUudmlzaWJpbGl0eSA9IFwidmlzaWJsZVwiO1xuICAgICAgY29uc3QgdG9vbHRpcFdpZHRoID0gdG9vbHRpcC5vZmZzZXRXaWR0aDtcbiAgICAgIGNvbnN0IHRvb2x0aXBIZWlnaHQgPSB0b29sdGlwLm9mZnNldEhlaWdodDtcbiAgICAgIGNvbnN0IHRvb2x0aXBMZWZ0ID0gY2xhbXAoKHdpbmRvdy5pbm5lcldpZHRoIC0gdG9vbHRpcFdpZHRoKSAvIDIsIDIwLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHRvb2x0aXBXaWR0aCAtIDIwKTtcbiAgICAgIGNvbnN0IHRvb2x0aXBUb3AgPSBjbGFtcCgod2luZG93LmlubmVySGVpZ2h0IC0gdG9vbHRpcEhlaWdodCkgLyAyLCAyMCwgd2luZG93LmlubmVySGVpZ2h0IC0gdG9vbHRpcEhlaWdodCAtIDIwKTtcbiAgICAgIHRvb2x0aXAuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQodG9vbHRpcExlZnQpfXB4LCAke01hdGgucm91bmQodG9vbHRpcFRvcCl9cHgpYDtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhdHRhY2hMaXN0ZW5lcnMoKTogdm9pZCB7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgc2NoZWR1bGVVcGRhdGUsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCBzY2hlZHVsZVVwZGF0ZSwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZGV0YWNoTGlzdGVuZXJzKCk6IHZvaWQge1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHNjaGVkdWxlVXBkYXRlKTtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCBzY2hlZHVsZVVwZGF0ZSk7XG4gICAgaWYgKGZyYW1lSGFuZGxlICE9PSBudWxsKSB7XG4gICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUoZnJhbWVIYW5kbGUpO1xuICAgICAgZnJhbWVIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgICBpZiAocmVzaXplT2JzZXJ2ZXIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBza2lwQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIG9uU2tpcD8uKCk7XG4gIH0pO1xuXG4gIG5leHRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgb25OZXh0Py4oKTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gcmVuZGVyVG9vbHRpcChvcHRpb25zOiBIaWdobGlnaHRDb250ZW50T3B0aW9ucyk6IHZvaWQge1xuICAgIGNvbnN0IHsgc3RlcENvdW50LCBzdGVwSW5kZXgsIHRpdGxlOiBvcHRpb25UaXRsZSwgYm9keTogb3B0aW9uQm9keSwgc2hvd05leHQsIG5leHRMYWJlbCwgc2hvd1NraXAsIHNraXBMYWJlbCB9ID0gb3B0aW9ucztcblxuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoc3RlcENvdW50KSAmJiBzdGVwQ291bnQgPiAwKSB7XG4gICAgICBwcm9ncmVzcy50ZXh0Q29udGVudCA9IGBTdGVwICR7c3RlcEluZGV4ICsgMX0gb2YgJHtzdGVwQ291bnR9YDtcbiAgICAgIHByb2dyZXNzLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2dyZXNzLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIHByb2dyZXNzLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBpZiAob3B0aW9uVGl0bGUgJiYgb3B0aW9uVGl0bGUudHJpbSgpLmxlbmd0aCA+IDApIHtcbiAgICAgIHRpdGxlLnRleHRDb250ZW50ID0gb3B0aW9uVGl0bGU7XG4gICAgICB0aXRsZS5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aXRsZS50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICB0aXRsZS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgYm9keS50ZXh0Q29udGVudCA9IG9wdGlvbkJvZHk7XG5cbiAgICBvbk5leHQgPSBzaG93TmV4dCA/IG9wdGlvbnMub25OZXh0ID8/IG51bGwgOiBudWxsO1xuICAgIGlmIChzaG93TmV4dCkge1xuICAgICAgbmV4dEJ0bi50ZXh0Q29udGVudCA9IG5leHRMYWJlbCA/PyBcIk5leHRcIjtcbiAgICAgIG5leHRCdG4uc3R5bGUuZGlzcGxheSA9IFwiaW5saW5lLWZsZXhcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuXG4gICAgb25Ta2lwID0gc2hvd1NraXAgPyBvcHRpb25zLm9uU2tpcCA/PyBudWxsIDogbnVsbDtcbiAgICBpZiAoc2hvd1NraXApIHtcbiAgICAgIHNraXBCdG4udGV4dENvbnRlbnQgPSBza2lwTGFiZWwgPz8gXCJTa2lwXCI7XG4gICAgICBza2lwQnRuLnN0eWxlLmRpc3BsYXkgPSBcImlubGluZS1mbGV4XCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNraXBCdG4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3cob3B0aW9uczogSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMpOiB2b2lkIHtcbiAgICB2aXNpYmxlID0gdHJ1ZTtcbiAgICBjdXJyZW50VGFyZ2V0ID0gb3B0aW9ucy50YXJnZXQgPz8gbnVsbDtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgIHJlbmRlclRvb2x0aXAob3B0aW9ucyk7XG4gICAgaWYgKHJlc2l6ZU9ic2VydmVyKSB7XG4gICAgICByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG51bGw7XG4gICAgfVxuICAgIGlmIChjdXJyZW50VGFyZ2V0ICYmIHR5cGVvZiBSZXNpemVPYnNlcnZlciAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoKCkgPT4gc2NoZWR1bGVVcGRhdGUoKSk7XG4gICAgICByZXNpemVPYnNlcnZlci5vYnNlcnZlKGN1cnJlbnRUYXJnZXQpO1xuICAgIH1cbiAgICBhdHRhY2hMaXN0ZW5lcnMoKTtcbiAgICBzY2hlZHVsZVVwZGF0ZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGlkZSgpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUpIHJldHVybjtcbiAgICB2aXNpYmxlID0gZmFsc2U7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICB0b29sdGlwLnN0eWxlLnZpc2liaWxpdHkgPSBcImhpZGRlblwiO1xuICAgIHRvb2x0aXAuc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgZGV0YWNoTGlzdGVuZXJzKCk7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95KCk6IHZvaWQge1xuICAgIGhpZGUoKTtcbiAgICBvdmVybGF5LnJlbW92ZSgpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzaG93LFxuICAgIGhpZGUsXG4gICAgZGVzdHJveSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlU3R5bGVzKCk6IHZvaWQge1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoU1RZTEVfSUQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICBzdHlsZS5pZCA9IFNUWUxFX0lEO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAudHV0b3JpYWwtb3ZlcmxheSB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICBpbnNldDogMDtcbiAgICAgIHotaW5kZXg6IDUwO1xuICAgICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheS52aXNpYmxlIHtcbiAgICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fc2NyaW0ge1xuICAgICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19oaWdobGlnaHQge1xuICAgICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTRweDtcbiAgICAgIGJvcmRlcjogMnB4IHNvbGlkIHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjk1KTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMCAwIDJweCByZ2JhKDU2LCAxODksIDI0OCwgMC4yNSksIDAgMCAyNHB4IHJnYmEoMzQsIDIxMSwgMjM4LCAwLjI1KTtcbiAgICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE4cyBlYXNlLCB3aWR0aCAwLjE4cyBlYXNlLCBoZWlnaHQgMC4xOHMgZWFzZSwgb3BhY2l0eSAwLjE4cyBlYXNlO1xuICAgICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gICAgICBvcGFjaXR5OiAwO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fdG9vbHRpcCB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICBtaW4td2lkdGg6IDI0MHB4O1xuICAgICAgbWF4LXdpZHRoOiBtaW4oMzQwcHgsIGNhbGMoMTAwdncgLSAzMnB4KSk7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDE1LCAyMywgNDIsIDAuOTUpO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE2cHg7XG4gICAgICBwYWRkaW5nOiAxNnB4IDE4cHg7XG4gICAgICBjb2xvcjogI2UyZThmMDtcbiAgICAgIGJveC1zaGFkb3c6IDAgMTJweCAzMnB4IHJnYmEoMTUsIDIzLCA0MiwgMC41NSk7XG4gICAgICBwb2ludGVyLWV2ZW50czogYXV0bztcbiAgICAgIG9wYWNpdHk6IDA7XG4gICAgICB2aXNpYmlsaXR5OiBoaWRkZW47XG4gICAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgwcHgsIDBweCk7XG4gICAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC4xOHMgZWFzZSwgb3BhY2l0eSAwLjE4cyBlYXNlO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fcHJvZ3Jlc3Mge1xuICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTtcbiAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgICBjb2xvcjogcmdiYSgxNDgsIDE2MywgMTg0LCAwLjc1KTtcbiAgICAgIG1hcmdpbjogMCAwIDhweDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX3RpdGxlIHtcbiAgICAgIG1hcmdpbjogMCAwIDhweDtcbiAgICAgIGZvbnQtc2l6ZTogMTVweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA0ZW07XG4gICAgICBjb2xvcjogI2YxZjVmOTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2JvZHkge1xuICAgICAgbWFyZ2luOiAwIDAgMTRweDtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGxpbmUtaGVpZ2h0OiAxLjU7XG4gICAgICBjb2xvcjogI2NiZDVmNTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2FjdGlvbnMge1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGdhcDogMTBweDtcbiAgICAgIGp1c3RpZnktY29udGVudDogZmxleC1lbmQ7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4ge1xuICAgICAgZm9udDogaW5oZXJpdDtcbiAgICAgIHBhZGRpbmc6IDZweCAxNHB4O1xuICAgICAgYm9yZGVyLXJhZGl1czogOTk5cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wOGVtO1xuICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5IHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjI1KTtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNTUpO1xuICAgICAgY29sb3I6ICNmOGZhZmM7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnk6aG92ZXIge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSg1NiwgMTg5LCAyNDgsIDAuMzUpO1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdCB7XG4gICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgIGNvbG9yOiByZ2JhKDIwMywgMjEzLCAyMjUsIDAuOSk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0OmhvdmVyIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyMDMsIDIxMywgMjI1LCAwLjU1KTtcbiAgICB9XG4gICAgQG1lZGlhIChtYXgtd2lkdGg6IDc2OHB4KSB7XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fdG9vbHRpcCB7XG4gICAgICAgIG1pbi13aWR0aDogMjAwcHg7XG4gICAgICAgIG1heC13aWR0aDogbWluKDMyMHB4LCBjYWxjKDEwMHZ3IC0gMjRweCkpO1xuICAgICAgICBwYWRkaW5nOiAxMHB4IDEycHg7XG4gICAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICAgIGZsZXgtZGlyZWN0aW9uOiByb3c7XG4gICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgIGdhcDogMTJweDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X19wcm9ncmVzcyB7XG4gICAgICAgIGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X190aXRsZSB7XG4gICAgICAgIGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X19ib2R5IHtcbiAgICAgICAgbWFyZ2luOiAwO1xuICAgICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICAgIGZsZXg6IDE7XG4gICAgICAgIGxpbmUtaGVpZ2h0OiAxLjQ7XG4gICAgICB9XG4gICAgICAudHV0b3JpYWwtb3ZlcmxheV9fYWN0aW9ucyB7XG4gICAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICAgIGdhcDogNnB4O1xuICAgICAgICBmbGV4LXNocmluazogMDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4ge1xuICAgICAgICBwYWRkaW5nOiA1cHggMTBweDtcbiAgICAgICAgZm9udC1zaXplOiAxMHB4O1xuICAgICAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgfVxuICAgIH1cbiAgYDtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG4iLCAiY29uc3QgU1RPUkFHRV9QUkVGSVggPSBcImxzZDp0dXRvcmlhbDpcIjtcblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbFByb2dyZXNzIHtcbiAgc3RlcEluZGV4OiBudW1iZXI7XG4gIGNvbXBsZXRlZDogYm9vbGVhbjtcbiAgdXBkYXRlZEF0OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGdldFN0b3JhZ2UoKTogU3RvcmFnZSB8IG51bGwge1xuICB0cnkge1xuICAgIGlmICh0eXBlb2Ygd2luZG93ID09PSBcInVuZGVmaW5lZFwiIHx8ICF3aW5kb3cubG9jYWxTdG9yYWdlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZFByb2dyZXNzKGlkOiBzdHJpbmcpOiBUdXRvcmlhbFByb2dyZXNzIHwgbnVsbCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgY29uc3QgcmF3ID0gc3RvcmFnZS5nZXRJdGVtKFNUT1JBR0VfUFJFRklYICsgaWQpO1xuICAgIGlmICghcmF3KSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgVHV0b3JpYWxQcm9ncmVzcztcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgcGFyc2VkICE9PSBcIm9iamVjdFwiIHx8IHBhcnNlZCA9PT0gbnVsbCB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5zdGVwSW5kZXggIT09IFwibnVtYmVyXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQuY29tcGxldGVkICE9PSBcImJvb2xlYW5cIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC51cGRhdGVkQXQgIT09IFwibnVtYmVyXCJcbiAgICApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gcGFyc2VkO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVByb2dyZXNzKGlkOiBzdHJpbmcsIHByb2dyZXNzOiBUdXRvcmlhbFByb2dyZXNzKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2Uuc2V0SXRlbShTVE9SQUdFX1BSRUZJWCArIGlkLCBKU09OLnN0cmluZ2lmeShwcm9ncmVzcykpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICAvLyBpZ25vcmUgc3RvcmFnZSBmYWlsdXJlc1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclByb2dyZXNzKGlkOiBzdHJpbmcpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5yZW1vdmVJdGVtKFNUT1JBR0VfUFJFRklYICsgaWQpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICAvLyBpZ25vcmUgc3RvcmFnZSBmYWlsdXJlc1xuICB9XG59XG4iLCAiZXhwb3J0IHR5cGUgUm9sZUlkID1cbiAgfCBcImNhbnZhc1wiXG4gIHwgXCJzaGlwU2V0XCJcbiAgfCBcInNoaXBTZWxlY3RcIlxuICB8IFwic2hpcERlbGV0ZVwiXG4gIHwgXCJzaGlwQ2xlYXJcIlxuICB8IFwic2hpcFNwZWVkU2xpZGVyXCJcbiAgfCBcImhlYXRCYXJcIlxuICB8IFwic3BlZWRNYXJrZXJcIlxuICB8IFwibWlzc2lsZVNldFwiXG4gIHwgXCJtaXNzaWxlU2VsZWN0XCJcbiAgfCBcIm1pc3NpbGVEZWxldGVcIlxuICB8IFwibWlzc2lsZVNwZWVkU2xpZGVyXCJcbiAgfCBcIm1pc3NpbGVBZ3JvU2xpZGVyXCJcbiAgfCBcIm1pc3NpbGVBZGRSb3V0ZVwiXG4gIHwgXCJtaXNzaWxlTGF1bmNoXCJcbiAgfCBcInJvdXRlUHJldlwiXG4gIHwgXCJyb3V0ZU5leHRcIlxuICB8IFwiaGVscFRvZ2dsZVwiXG4gIHwgXCJ0dXRvcmlhbFN0YXJ0XCJcbiAgfCBcInNwYXduQm90XCI7XG5cbmV4cG9ydCB0eXBlIFJvbGVSZXNvbHZlciA9ICgpID0+IEhUTUxFbGVtZW50IHwgbnVsbDtcblxuZXhwb3J0IHR5cGUgUm9sZXNNYXAgPSBSZWNvcmQ8Um9sZUlkLCBSb2xlUmVzb2x2ZXI+O1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUm9sZXMoKTogUm9sZXNNYXAge1xuICByZXR1cm4ge1xuICAgIGNhbnZhczogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdlwiKSxcbiAgICBzaGlwU2V0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtc2V0XCIpLFxuICAgIHNoaXBTZWxlY3Q6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZWxlY3RcIiksXG4gICAgc2hpcERlbGV0ZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWRlbGV0ZVwiKSxcbiAgICBzaGlwQ2xlYXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1jbGVhclwiKSxcbiAgICBzaGlwU3BlZWRTbGlkZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1zbGlkZXJcIiksXG4gICAgaGVhdEJhcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWF0LWJhci1jb250YWluZXJcIiksXG4gICAgc3BlZWRNYXJrZXI6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3BlZWQtbWFya2VyXCIpLFxuICAgIG1pc3NpbGVTZXQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZXRcIiksXG4gICAgbWlzc2lsZVNlbGVjdDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNlbGVjdFwiKSxcbiAgICBtaXNzaWxlRGVsZXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtZGVsZXRlXCIpLFxuICAgIG1pc3NpbGVTcGVlZFNsaWRlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNwZWVkLXNsaWRlclwiKSxcbiAgICBtaXNzaWxlQWdyb1NsaWRlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tc2xpZGVyXCIpLFxuICAgIG1pc3NpbGVBZGRSb3V0ZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFkZC1yb3V0ZVwiKSxcbiAgICBtaXNzaWxlTGF1bmNoOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtbGF1bmNoXCIpLFxuICAgIHJvdXRlUHJldjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1wcmV2XCIpLFxuICAgIHJvdXRlTmV4dDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1uZXh0XCIpLFxuICAgIGhlbHBUb2dnbGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC10b2dnbGVcIiksXG4gICAgdHV0b3JpYWxTdGFydDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0dXRvcmlhbC1zdGFydFwiKSxcbiAgICBzcGF3bkJvdDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGF3bi1ib3RcIiksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSb2xlRWxlbWVudChyb2xlczogUm9sZXNNYXAsIHJvbGU6IFJvbGVJZCB8IG51bGwgfCB1bmRlZmluZWQpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuICBpZiAoIXJvbGUpIHJldHVybiBudWxsO1xuICBjb25zdCByZXNvbHZlciA9IHJvbGVzW3JvbGVdO1xuICByZXR1cm4gcmVzb2x2ZXIgPyByZXNvbHZlcigpIDogbnVsbDtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzLCBFdmVudEtleSB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZUhpZ2hsaWdodGVyLCB0eXBlIEhpZ2hsaWdodGVyIH0gZnJvbSBcIi4vaGlnaGxpZ2h0XCI7XG5pbXBvcnQgeyBjbGVhclByb2dyZXNzLCBsb2FkUHJvZ3Jlc3MsIHNhdmVQcm9ncmVzcyB9IGZyb20gXCIuL3N0b3JhZ2VcIjtcbmltcG9ydCB7IGdldFJvbGVFbGVtZW50LCB0eXBlIFJvbGVJZCwgdHlwZSBSb2xlc01hcCB9IGZyb20gXCIuL3JvbGVzXCI7XG5cbmV4cG9ydCB0eXBlIFN0ZXBBZHZhbmNlID1cbiAgfCB7XG4gICAgICBraW5kOiBcImV2ZW50XCI7XG4gICAgICBldmVudDogRXZlbnRLZXk7XG4gICAgICB3aGVuPzogKHBheWxvYWQ6IHVua25vd24pID0+IGJvb2xlYW47XG4gICAgICBjaGVjaz86ICgpID0+IGJvb2xlYW47XG4gICAgfVxuICB8IHtcbiAgICAgIGtpbmQ6IFwibWFudWFsXCI7XG4gICAgICBuZXh0TGFiZWw/OiBzdHJpbmc7XG4gICAgfTtcblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbFN0ZXAge1xuICBpZDogc3RyaW5nO1xuICB0YXJnZXQ6IFJvbGVJZCB8ICgoKSA9PiBIVE1MRWxlbWVudCB8IG51bGwpIHwgbnVsbDtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGJvZHk6IHN0cmluZztcbiAgYWR2YW5jZTogU3RlcEFkdmFuY2U7XG4gIG9uRW50ZXI/OiAoKSA9PiB2b2lkO1xuICBvbkV4aXQ/OiAoKSA9PiB2b2lkO1xuICBhbGxvd1NraXA/OiBib29sZWFuO1xuICBza2lwTGFiZWw/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBFbmdpbmVPcHRpb25zIHtcbiAgaWQ6IHN0cmluZztcbiAgYnVzOiBFdmVudEJ1cztcbiAgcm9sZXM6IFJvbGVzTWFwO1xuICBzdGVwczogVHV0b3JpYWxTdGVwW107XG59XG5cbmludGVyZmFjZSBTdGFydE9wdGlvbnMge1xuICByZXN1bWU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsRW5naW5lIHtcbiAgc3RhcnQob3B0aW9ucz86IFN0YXJ0T3B0aW9ucyk6IHZvaWQ7XG4gIHJlc3RhcnQoKTogdm9pZDtcbiAgc3RvcCgpOiB2b2lkO1xuICBpc1J1bm5pbmcoKTogYm9vbGVhbjtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVHV0b3JpYWxFbmdpbmUoeyBpZCwgYnVzLCByb2xlcywgc3RlcHMgfTogRW5naW5lT3B0aW9ucyk6IFR1dG9yaWFsRW5naW5lIHtcbiAgY29uc3QgaGlnaGxpZ2h0ZXI6IEhpZ2hsaWdodGVyID0gY3JlYXRlSGlnaGxpZ2h0ZXIoKTtcbiAgbGV0IHJ1bm5pbmcgPSBmYWxzZTtcbiAgbGV0IHBhdXNlZCA9IGZhbHNlO1xuICBsZXQgY3VycmVudEluZGV4ID0gLTE7XG4gIGxldCBjdXJyZW50U3RlcDogVHV0b3JpYWxTdGVwIHwgbnVsbCA9IG51bGw7XG4gIGxldCBjbGVhbnVwQ3VycmVudDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCByZW5kZXJDdXJyZW50OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IGxhc3RTYXZlZENvbXBsZXRlZCA9IGZhbHNlO1xuICBsZXQgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gZmFsc2U7XG5cbiAgY29uc3QgcGVyc2lzdGVudExpc3RlbmVyczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcblxuICBwZXJzaXN0ZW50TGlzdGVuZXJzLnB1c2goXG4gICAgYnVzLm9uKFwiaGVscDp2aXNpYmxlQ2hhbmdlZFwiLCAoeyB2aXNpYmxlIH0pID0+IHtcbiAgICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgICAgcGF1c2VkID0gQm9vbGVhbih2aXNpYmxlKTtcbiAgICAgIGlmIChwYXVzZWQpIHtcbiAgICAgICAgaGlnaGxpZ2h0ZXIuaGlkZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVuZGVyQ3VycmVudD8uKCk7XG4gICAgICB9XG4gICAgfSksXG4gICk7XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVRhcmdldChzdGVwOiBUdXRvcmlhbFN0ZXApOiBIVE1MRWxlbWVudCB8IG51bGwge1xuICAgIGlmICghc3RlcC50YXJnZXQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHN0ZXAudGFyZ2V0ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIHJldHVybiBzdGVwLnRhcmdldCgpO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0Um9sZUVsZW1lbnQocm9sZXMsIHN0ZXAudGFyZ2V0KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsYW1wSW5kZXgoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoaW5kZXgpIHx8IGluZGV4IDwgMCkgcmV0dXJuIDA7XG4gICAgaWYgKGluZGV4ID49IHN0ZXBzLmxlbmd0aCkgcmV0dXJuIHN0ZXBzLmxlbmd0aCAtIDE7XG4gICAgcmV0dXJuIE1hdGguZmxvb3IoaW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0U3RlcChpbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29tcGxldGVUdXRvcmlhbCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHN0ZXBzLmxlbmd0aCkge1xuICAgICAgY29tcGxldGVUdXRvcmlhbCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChjbGVhbnVwQ3VycmVudCkge1xuICAgICAgY2xlYW51cEN1cnJlbnQoKTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuXG4gICAgY3VycmVudEluZGV4ID0gaW5kZXg7XG4gICAgY29uc3Qgc3RlcCA9IHN0ZXBzW2luZGV4XTtcbiAgICBjdXJyZW50U3RlcCA9IHN0ZXA7XG5cbiAgICBwZXJzaXN0UHJvZ3Jlc3MoaW5kZXgsIGZhbHNlKTtcblxuICAgIGJ1cy5lbWl0KFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIiwgeyBpZCwgc3RlcEluZGV4OiBpbmRleCwgdG90YWw6IHN0ZXBzLmxlbmd0aCB9KTtcbiAgICBzdGVwLm9uRW50ZXI/LigpO1xuXG4gICAgY29uc3QgYWxsb3dTa2lwID0gc3RlcC5hbGxvd1NraXAgIT09IGZhbHNlO1xuICAgIGNvbnN0IHJlbmRlciA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGlmICghcnVubmluZyB8fCBwYXVzZWQpIHJldHVybjtcbiAgICAgIGhpZ2hsaWdodGVyLnNob3coe1xuICAgICAgICB0YXJnZXQ6IHJlc29sdmVUYXJnZXQoc3RlcCksXG4gICAgICAgIHRpdGxlOiBzdGVwLnRpdGxlLFxuICAgICAgICBib2R5OiBzdGVwLmJvZHksXG4gICAgICAgIHN0ZXBJbmRleDogaW5kZXgsXG4gICAgICAgIHN0ZXBDb3VudDogc3RlcHMubGVuZ3RoLFxuICAgICAgICBzaG93TmV4dDogc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwibWFudWFsXCIsXG4gICAgICAgIG5leHRMYWJlbDogc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwibWFudWFsXCJcbiAgICAgICAgICA/IHN0ZXAuYWR2YW5jZS5uZXh0TGFiZWwgPz8gKGluZGV4ID09PSBzdGVwcy5sZW5ndGggLSAxID8gXCJGaW5pc2hcIiA6IFwiTmV4dFwiKVxuICAgICAgICAgIDogdW5kZWZpbmVkLFxuICAgICAgICBvbk5leHQ6IHN0ZXAuYWR2YW5jZS5raW5kID09PSBcIm1hbnVhbFwiID8gYWR2YW5jZVN0ZXAgOiB1bmRlZmluZWQsXG4gICAgICAgIHNob3dTa2lwOiBhbGxvd1NraXAsXG4gICAgICAgIHNraXBMYWJlbDogc3RlcC5za2lwTGFiZWwsXG4gICAgICAgIG9uU2tpcDogYWxsb3dTa2lwID8gc2tpcEN1cnJlbnRTdGVwIDogdW5kZWZpbmVkLFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIHJlbmRlckN1cnJlbnQgPSByZW5kZXI7XG4gICAgcmVuZGVyKCk7XG5cbiAgICBpZiAoc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwiZXZlbnRcIikge1xuICAgICAgY29uc3QgaGFuZGxlciA9IChwYXlsb2FkOiB1bmtub3duKTogdm9pZCA9PiB7XG4gICAgICAgIGlmICghcnVubmluZyB8fCBwYXVzZWQpIHJldHVybjtcbiAgICAgICAgaWYgKHN0ZXAuYWR2YW5jZS53aGVuICYmICFzdGVwLmFkdmFuY2Uud2hlbihwYXlsb2FkKSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBhZHZhbmNlVG8oaW5kZXggKyAxKTtcbiAgICAgIH07XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IGJ1cy5vbihzdGVwLmFkdmFuY2UuZXZlbnQsIGhhbmRsZXIgYXMgKHZhbHVlOiBuZXZlcikgPT4gdm9pZCk7XG4gICAgICBpZiAoc3RlcC5hZHZhbmNlLmNoZWNrICYmIHN0ZXAuYWR2YW5jZS5jaGVjaygpKSB7XG4gICAgICAgIGhhbmRsZXIodW5kZWZpbmVkKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGFkdmFuY2VUbyhuZXh0SW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIGlmIChjbGVhbnVwQ3VycmVudCkge1xuICAgICAgY2xlYW51cEN1cnJlbnQoKTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKGN1cnJlbnRTdGVwKSB7XG4gICAgICBjdXJyZW50U3RlcC5vbkV4aXQ/LigpO1xuICAgICAgY3VycmVudFN0ZXAgPSBudWxsO1xuICAgIH1cbiAgICByZW5kZXJDdXJyZW50ID0gbnVsbDtcbiAgICBpZiAobmV4dEluZGV4ID49IHN0ZXBzLmxlbmd0aCkge1xuICAgICAgY29tcGxldGVUdXRvcmlhbCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXRTdGVwKG5leHRJbmRleCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYWR2YW5jZVN0ZXAoKTogdm9pZCB7XG4gICAgYWR2YW5jZVRvKGN1cnJlbnRJbmRleCArIDEpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2tpcEN1cnJlbnRTdGVwKCk6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIGNvbnN0IG5leHRJbmRleCA9IGN1cnJlbnRJbmRleCA+PSAwID8gY3VycmVudEluZGV4ICsgMSA6IDA7XG4gICAgYWR2YW5jZVRvKG5leHRJbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiBjb21wbGV0ZVR1dG9yaWFsKCk6IHZvaWQge1xuICAgIGlmICghcnVubmluZykgcmV0dXJuO1xuICAgIHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IHRydWU7XG4gICAgcGVyc2lzdFByb2dyZXNzKHN0ZXBzLmxlbmd0aCwgdHJ1ZSk7XG4gICAgYnVzLmVtaXQoXCJ0dXRvcmlhbDpjb21wbGV0ZWRcIiwgeyBpZCB9KTtcbiAgICBzdG9wKCk7XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gZmFsc2U7XG4gIH1cblxuICBmdW5jdGlvbiBzdGFydChvcHRpb25zPzogU3RhcnRPcHRpb25zKTogdm9pZCB7XG4gICAgY29uc3QgcmVzdW1lID0gb3B0aW9ucz8ucmVzdW1lICE9PSBmYWxzZTtcbiAgICBpZiAocnVubmluZykge1xuICAgICAgcmVzdGFydCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHJ1bm5pbmcgPSB0cnVlO1xuICAgIHBhdXNlZCA9IGZhbHNlO1xuICAgIHN1cHByZXNzUGVyc2lzdE9uU3RvcCA9IGZhbHNlO1xuICAgIGxhc3RTYXZlZENvbXBsZXRlZCA9IGZhbHNlO1xuICAgIGxldCBzdGFydEluZGV4ID0gMDtcbiAgICBpZiAocmVzdW1lKSB7XG4gICAgICBjb25zdCBwcm9ncmVzcyA9IGxvYWRQcm9ncmVzcyhpZCk7XG4gICAgICBpZiAocHJvZ3Jlc3MgJiYgIXByb2dyZXNzLmNvbXBsZXRlZCkge1xuICAgICAgICBzdGFydEluZGV4ID0gY2xhbXBJbmRleChwcm9ncmVzcy5zdGVwSW5kZXgpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjbGVhclByb2dyZXNzKGlkKTtcbiAgICB9XG4gICAgYnVzLmVtaXQoXCJ0dXRvcmlhbDpzdGFydGVkXCIsIHsgaWQgfSk7XG4gICAgc2V0U3RlcChzdGFydEluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc3RhcnQoKTogdm9pZCB7XG4gICAgc3RvcCgpO1xuICAgIHN0YXJ0KHsgcmVzdW1lOiBmYWxzZSB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0b3AoKTogdm9pZCB7XG4gICAgY29uc3Qgc2hvdWxkUGVyc2lzdCA9ICFzdXBwcmVzc1BlcnNpc3RPblN0b3AgJiYgcnVubmluZyAmJiAhbGFzdFNhdmVkQ29tcGxldGVkICYmIGN1cnJlbnRJbmRleCA+PSAwICYmIGN1cnJlbnRJbmRleCA8IHN0ZXBzLmxlbmd0aDtcbiAgICBjb25zdCBpbmRleFRvUGVyc2lzdCA9IGN1cnJlbnRJbmRleDtcblxuICAgIGlmIChjbGVhbnVwQ3VycmVudCkge1xuICAgICAgY2xlYW51cEN1cnJlbnQoKTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKGN1cnJlbnRTdGVwKSB7XG4gICAgICBjdXJyZW50U3RlcC5vbkV4aXQ/LigpO1xuICAgICAgY3VycmVudFN0ZXAgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoc2hvdWxkUGVyc2lzdCkge1xuICAgICAgcGVyc2lzdFByb2dyZXNzKGluZGV4VG9QZXJzaXN0LCBmYWxzZSk7XG4gICAgfVxuICAgIHJ1bm5pbmcgPSBmYWxzZTtcbiAgICBwYXVzZWQgPSBmYWxzZTtcbiAgICBjdXJyZW50SW5kZXggPSAtMTtcbiAgICByZW5kZXJDdXJyZW50ID0gbnVsbDtcbiAgICBoaWdobGlnaHRlci5oaWRlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBpc1J1bm5pbmcoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHJ1bm5pbmc7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95KCk6IHZvaWQge1xuICAgIHN0b3AoKTtcbiAgICBmb3IgKGNvbnN0IGRpc3Bvc2Ugb2YgcGVyc2lzdGVudExpc3RlbmVycykge1xuICAgICAgZGlzcG9zZSgpO1xuICAgIH1cbiAgICBoaWdobGlnaHRlci5kZXN0cm95KCk7XG4gIH1cblxuICBmdW5jdGlvbiBwZXJzaXN0UHJvZ3Jlc3Moc3RlcEluZGV4OiBudW1iZXIsIGNvbXBsZXRlZDogYm9vbGVhbik6IHZvaWQge1xuICAgIGxhc3RTYXZlZENvbXBsZXRlZCA9IGNvbXBsZXRlZDtcbiAgICBzYXZlUHJvZ3Jlc3MoaWQsIHtcbiAgICAgIHN0ZXBJbmRleCxcbiAgICAgIGNvbXBsZXRlZCxcbiAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc3RhcnQsXG4gICAgcmVzdGFydCxcbiAgICBzdG9wLFxuICAgIGlzUnVubmluZyxcbiAgICBkZXN0cm95LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgVHV0b3JpYWxTdGVwIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5cbmZ1bmN0aW9uIGhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQ6IHVua25vd24sIG1pbkluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcbiAgaWYgKHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiIHx8IHBheWxvYWQgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgaW5kZXggPSAocGF5bG9hZCBhcyB7IGluZGV4PzogdW5rbm93biB9KS5pbmRleDtcbiAgaWYgKHR5cGVvZiBpbmRleCAhPT0gXCJudW1iZXJcIiB8fCAhTnVtYmVyLmlzRmluaXRlKGluZGV4KSkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gaW5kZXggPj0gbWluSW5kZXg7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQ6IHVua25vd24pOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiIHx8IHBheWxvYWQgPT09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCByb3V0ZUlkID0gKHBheWxvYWQgYXMgeyByb3V0ZUlkPzogdW5rbm93biB9KS5yb3V0ZUlkO1xuICByZXR1cm4gdHlwZW9mIHJvdXRlSWQgPT09IFwic3RyaW5nXCIgPyByb3V0ZUlkIDogbnVsbDtcbn1cblxuZnVuY3Rpb24gcGF5bG9hZFRvb2xFcXVhbHModGFyZ2V0OiBzdHJpbmcpOiAocGF5bG9hZDogdW5rbm93bikgPT4gYm9vbGVhbiB7XG4gIHJldHVybiAocGF5bG9hZDogdW5rbm93bik6IGJvb2xlYW4gPT4ge1xuICAgIGlmICh0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIiB8fCBwYXlsb2FkID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgdG9vbCA9IChwYXlsb2FkIGFzIHsgdG9vbD86IHVua25vd24gfSkudG9vbDtcbiAgICByZXR1cm4gdHlwZW9mIHRvb2wgPT09IFwic3RyaW5nXCIgJiYgdG9vbCA9PT0gdGFyZ2V0O1xuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzKCk6IFR1dG9yaWFsU3RlcFtdIHtcbiAgbGV0IHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyID0gMDtcbiAgbGV0IGluaXRpYWxSb3V0ZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IG5ld1JvdXRlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG4gIHJldHVybiBbXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1wbG90LXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwiY2FudmFzXCIsXG4gICAgICB0aXRsZTogXCJQbG90IGEgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiQ2xpY2sgb24gdGhlIG1hcCB0byBkcm9wIGF0IGxlYXN0IHRocmVlIHdheXBvaW50cyBhbmQgc2tldGNoIHlvdXIgY291cnNlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6d2F5cG9pbnRBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMiksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwic2hpcC1jaGFuZ2Utc3BlZWRcIixcbiAgICAgIHRhcmdldDogXCJzaGlwU3BlZWRTbGlkZXJcIixcbiAgICAgIHRpdGxlOiBcIkFkanVzdCBzaGlwIHNwZWVkXCIsXG4gICAgICBib2R5OiBcIlVzZSB0aGUgU2hpcCBTcGVlZCBzbGlkZXIgKG9yIHByZXNzIFsgLyBdKSB0byBmaW5lLXR1bmUgeW91ciB0cmF2ZWwgc3BlZWQuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpzcGVlZENoYW5nZWRcIixcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLXNlbGVjdC1sZWdcIixcbiAgICAgIHRhcmdldDogXCJzaGlwU2VsZWN0XCIsXG4gICAgICB0aXRsZTogXCJTZWxlY3QgYSByb3V0ZSBsZWdcIixcbiAgICAgIGJvZHk6IFwiU3dpdGNoIHRvIFNlbGVjdCBtb2RlIChUIGtleSkgYW5kIHRoZW4gY2xpY2sgYSB3YXlwb2ludCBvbiB0aGUgbWFwIHRvIGhpZ2hsaWdodCBpdHMgbGVnLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6bGVnU2VsZWN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IGhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDApLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtbWF0Y2gtbWFya2VyXCIsXG4gICAgICB0YXJnZXQ6IFwic3BlZWRNYXJrZXJcIixcbiAgICAgIHRpdGxlOiBcIk1hdGNoIHRoZSBtYXJrZXJcIixcbiAgICAgIGJvZHk6IFwiTGluZSB1cCB0aGUgU2hpcCBTcGVlZCBzbGlkZXIgd2l0aCB0aGUgdGljayB0byBjcnVpc2UgYXQgdGhlIG5ldXRyYWwgaGVhdCBzcGVlZC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0Om1hcmtlckFsaWduZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1wdXNoLWhvdFwiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIlNwcmludCBpbnRvIHRoZSByZWRcIixcbiAgICAgIGJvZHk6IFwiUHVzaCB0aGUgdGhyb3R0bGUgYWJvdmUgdGhlIG1hcmtlciBhbmQgd2F0Y2ggdGhlIGhlYXQgYmFyIHJlYWNoIHRoZSB3YXJuaW5nIGJhbmQuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDp3YXJuRW50ZXJlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LWNvb2wtZG93blwiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIkNvb2wgaXQgYmFjayBkb3duXCIsXG4gICAgICBib2R5OiBcIkVhc2Ugb2ZmIGJlbG93IHRoZSBtYXJrZXIgdW50aWwgdGhlIGJhciBkcm9wcyBvdXQgb2YgdGhlIHdhcm5pbmcgem9uZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0OmNvb2xlZEJlbG93V2FyblwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LXRyaWdnZXItc3RhbGxcIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJUcmlnZ2VyIGEgc3RhbGxcIixcbiAgICAgIGJvZHk6IFwiUHVzaCB3ZWxsIGFib3ZlIHRoZSBsaW1pdCBhbmQgaG9sZCBpdCB1bnRpbCB0aGUgb3ZlcmhlYXQgc3RhbGwgb3ZlcmxheSBhcHBlYXJzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6c3RhbGxUcmlnZ2VyZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1yZWNvdmVyLXN0YWxsXCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiUmVjb3ZlciBmcm9tIHRoZSBzdGFsbFwiLFxuICAgICAgYm9keTogXCJIb2xkIHN0ZWFkeSB3aGlsZSBzeXN0ZW1zIGNvb2wuIE9uY2UgdGhlIG92ZXJsYXkgY2xlYXJzLCB5b3VcdTIwMTlyZSBiYWNrIG9ubGluZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0OnN0YWxsUmVjb3ZlcmVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtZHVhbC1iYXJzXCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiUmVhZCBib3RoIGhlYXQgYmFyc1wiLFxuICAgICAgYm9keTogXCJBZGp1c3QgYSB3YXlwb2ludCB0byBtYWtlIHRoZSBwbGFubmVkIGJhciBleHRlbmQgcGFzdCBsaXZlIGhlYXQuIFVzZSBpdCB0byBwcmVkaWN0IGZ1dHVyZSBvdmVybG9hZHMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDpkdWFsTWV0ZXJEaXZlcmdlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWRlbGV0ZS1sZWdcIixcbiAgICAgIHRhcmdldDogXCJzaGlwRGVsZXRlXCIsXG4gICAgICB0aXRsZTogXCJEZWxldGUgYSByb3V0ZSBsZWdcIixcbiAgICAgIGJvZHk6IFwiUmVtb3ZlIHRoZSBzZWxlY3RlZCB3YXlwb2ludCB1c2luZyB0aGUgRGVsZXRlIGNvbnRyb2wgb3IgdGhlIERlbGV0ZSBrZXkuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDp3YXlwb2ludERlbGV0ZWRcIixcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWNsZWFyLXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwic2hpcENsZWFyXCIsXG4gICAgICB0aXRsZTogXCJDbGVhciB0aGUgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiQ2xlYXIgcmVtYWluaW5nIHdheXBvaW50cyB0byByZXNldCB5b3VyIHBsb3R0ZWQgY291cnNlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcInNoaXA6Y2xlYXJJbnZva2VkXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1zZXQtbW9kZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVTZXRcIixcbiAgICAgIHRpdGxlOiBcIlN3aXRjaCB0byBtaXNzaWxlIHBsYW5uaW5nXCIsXG4gICAgICBib2R5OiBcIlRhcCBTZXQgc28gZXZlcnkgY2xpY2sgZHJvcHMgbWlzc2lsZSB3YXlwb2ludHMgb24gdGhlIGFjdGl2ZSByb3V0ZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOnRvb2xDaGFuZ2VkXCIsXG4gICAgICAgIHdoZW46IHBheWxvYWRUb29sRXF1YWxzKFwic2V0XCIpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtcGxvdC1pbml0aWFsXCIsXG4gICAgICB0YXJnZXQ6IFwiY2FudmFzXCIsXG4gICAgICB0aXRsZTogXCJQbG90IG1pc3NpbGUgd2F5cG9pbnRzXCIsXG4gICAgICBib2R5OiBcIkNsaWNrIHRoZSBtYXAgdG8gZHJvcCBhdCBsZWFzdCB0d28gZ3VpZGFuY2UgcG9pbnRzIGZvciB0aGUgY3VycmVudCBtaXNzaWxlIHJvdXRlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGlmICghaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKHJvdXRlSWQpIHtcbiAgICAgICAgICAgIGluaXRpYWxSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtaW5pdGlhbFwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCB0aGUgc3RyaWtlXCIsXG4gICAgICBib2R5OiBcIlNlbmQgdGhlIHBsYW5uZWQgbWlzc2lsZSByb3V0ZSBsaXZlIHdpdGggdGhlIExhdW5jaCBjb250cm9sIChMIGtleSkuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkKSB7XG4gICAgICAgICAgICBpbml0aWFsUm91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IGluaXRpYWxSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtYWRkLXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUFkZFJvdXRlXCIsXG4gICAgICB0aXRsZTogXCJDcmVhdGUgYSBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJQcmVzcyBOZXcgdG8gYWRkIGEgc2Vjb25kIG1pc3NpbGUgcm91dGUgZm9yIGFub3RoZXIgc3RyaWtlIGdyb3VwLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6cm91dGVBZGRlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIXJvdXRlSWQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBuZXdSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXBsb3QtbmV3LXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwiY2FudmFzXCIsXG4gICAgICB0aXRsZTogXCJQbG90IHRoZSBuZXcgbWlzc2lsZSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJEcm9wIGF0IGxlYXN0IHR3byB3YXlwb2ludHMgb24gdGhlIG5ldyByb3V0ZSB0byBkZWZpbmUgaXRzIHBhdGguXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgaWYgKCFoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAxKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAobmV3Um91dGVJZCAmJiByb3V0ZUlkICYmIHJvdXRlSWQgIT09IG5ld1JvdXRlSWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFuZXdSb3V0ZUlkICYmIHJvdXRlSWQpIHtcbiAgICAgICAgICAgIG5ld1JvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1uZXctcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggdGhlIG5ldyByb3V0ZVwiLFxuICAgICAgYm9keTogXCJMYXVuY2ggdGhlIGZyZXNoIG1pc3NpbGUgcm91dGUgdG8gY29uZmlybSBpdHMgcGF0dGVybi5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIW5ld1JvdXRlSWQgfHwgIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBuZXdSb3V0ZUlkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtc3dpdGNoLXJvdXRlXCIsXG4gICAgICB0YXJnZXQ6IFwicm91dGVOZXh0XCIsXG4gICAgICB0aXRsZTogXCJTd2l0Y2ggYmFjayB0byB0aGUgb3JpZ2luYWwgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBcdTI1QzAgXHUyNUI2IGNvbnRyb2xzIChvciBUYWIvU2hpZnQrVGFiKSB0byBzZWxlY3QgeW91ciBmaXJzdCBtaXNzaWxlIHJvdXRlIGFnYWluLlwiLFxuICAgICAgb25FbnRlcjogKCkgPT4ge1xuICAgICAgICByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA9IDA7XG4gICAgICB9LFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgKz0gMTtcbiAgICAgICAgICBpZiAocm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPCAxKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQgfHwgIXJvdXRlSWQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gaW5pdGlhbFJvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1sYXVuY2gtYWZ0ZXItc3dpdGNoXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIGZyb20gdGhlIG90aGVyIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkZpcmUgdGhlIG9yaWdpbmFsIG1pc3NpbGUgcm91dGUgdG8gcHJhY3RpY2Ugcm91bmQtcm9iaW4gc3RyaWtlcy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIWluaXRpYWxSb3V0ZUlkIHx8ICFyb3V0ZUlkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gaW5pdGlhbFJvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwidHV0b3JpYWwtcHJhY3RpY2VcIixcbiAgICAgIHRhcmdldDogXCJzcGF3bkJvdFwiLFxuICAgICAgdGl0bGU6IFwiU3Bhd24gYSBwcmFjdGljZSBib3RcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBCb3QgY29udHJvbCB0byBhZGQgYSB0YXJnZXQgYW5kIHJlaGVhcnNlIHRoZXNlIG1hbmV1dmVycyBpbiByZWFsIHRpbWUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiYm90OnNwYXduUmVxdWVzdGVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInR1dG9yaWFsLWNvbXBsZXRlXCIsXG4gICAgICB0YXJnZXQ6IG51bGwsXG4gICAgICB0aXRsZTogXCJZb3VcdTIwMTlyZSByZWFkeVwiLFxuICAgICAgYm9keTogXCJHcmVhdCB3b3JrLiBSZWxvYWQgdGhlIGNvbnNvbGUgb3IgcmVqb2luIGEgcm9vbSB0byByZXZpc2l0IHRoZXNlIGRyaWxscy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJtYW51YWxcIixcbiAgICAgICAgbmV4dExhYmVsOiBcIkZpbmlzaFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgXTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlVHV0b3JpYWxFbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IGNyZWF0ZVJvbGVzIH0gZnJvbSBcIi4vcm9sZXNcIjtcbmltcG9ydCB7IGdldEJhc2ljVHV0b3JpYWxTdGVwcyB9IGZyb20gXCIuL3N0ZXBzX2Jhc2ljXCI7XG5leHBvcnQgY29uc3QgQkFTSUNfVFVUT1JJQUxfSUQgPSBcInNoaXAtYmFzaWNzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxDb250cm9sbGVyIHtcbiAgc3RhcnQob3B0aW9ucz86IHsgcmVzdW1lPzogYm9vbGVhbiB9KTogdm9pZDtcbiAgcmVzdGFydCgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3VudFR1dG9yaWFsKGJ1czogRXZlbnRCdXMpOiBUdXRvcmlhbENvbnRyb2xsZXIge1xuICBjb25zdCByb2xlcyA9IGNyZWF0ZVJvbGVzKCk7XG4gIGNvbnN0IGVuZ2luZSA9IGNyZWF0ZVR1dG9yaWFsRW5naW5lKHtcbiAgICBpZDogQkFTSUNfVFVUT1JJQUxfSUQsXG4gICAgYnVzLFxuICAgIHJvbGVzLFxuICAgIHN0ZXBzOiBnZXRCYXNpY1R1dG9yaWFsU3RlcHMoKSxcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydChvcHRpb25zKSB7XG4gICAgICBlbmdpbmUuc3RhcnQob3B0aW9ucyk7XG4gICAgfSxcbiAgICByZXN0YXJ0KCkge1xuICAgICAgZW5naW5lLnJlc3RhcnQoKTtcbiAgICB9LFxuICAgIGRlc3Ryb3koKSB7XG4gICAgICBlbmdpbmUuZGVzdHJveSgpO1xuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgY2xhbXAgfSBmcm9tIFwiLi4vc3RhdGVcIjtcblxuZXhwb3J0IGludGVyZmFjZSBEaWFsb2d1ZUNob2ljZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaWFsb2d1ZUNvbnRlbnQge1xuICBzcGVha2VyOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbiAgaW50ZW50PzogXCJmYWN0b3J5XCIgfCBcInVuaXRcIjtcbiAgY2hvaWNlcz86IERpYWxvZ3VlQ2hvaWNlW107XG4gIHR5cGluZ1NwZWVkTXM/OiBudW1iZXI7XG4gIG9uQ2hvaWNlPzogKGNob2ljZUlkOiBzdHJpbmcpID0+IHZvaWQ7XG4gIG9uVGV4dEZ1bGx5UmVuZGVyZWQ/OiAoKSA9PiB2b2lkO1xuICBvbkNvbnRpbnVlPzogKCkgPT4gdm9pZDtcbiAgY29udGludWVMYWJlbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaWFsb2d1ZU92ZXJsYXkge1xuICBzaG93KGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQ7XG4gIGhpZGUoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICBpc1Zpc2libGUoKTogYm9vbGVhbjtcbn1cblxuY29uc3QgU1RZTEVfSUQgPSBcImRpYWxvZ3VlLW92ZXJsYXktc3R5bGVcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSgpOiBEaWFsb2d1ZU92ZXJsYXkge1xuICBlbnN1cmVTdHlsZXMoKTtcblxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgb3ZlcmxheS5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLW92ZXJsYXlcIjtcbiAgb3ZlcmxheS5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxpdmVcIiwgXCJwb2xpdGVcIik7XG5cbiAgY29uc3QgY29uc29sZUZyYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgY29uc29sZUZyYW1lLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY29uc29sZVwiO1xuXG4gIGNvbnN0IHNwZWFrZXJMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNwZWFrZXJMYWJlbC5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLXNwZWFrZXJcIjtcblxuICBjb25zdCB0ZXh0QmxvY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0ZXh0QmxvY2suY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS10ZXh0XCI7XG5cbiAgY29uc3QgY3Vyc29yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIGN1cnNvci5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWN1cnNvclwiO1xuICBjdXJzb3IudGV4dENvbnRlbnQgPSBcIl9cIjtcblxuICBjb25zdCBjaG9pY2VzTGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ1bFwiKTtcbiAgY2hvaWNlc0xpc3QuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jaG9pY2VzIGhpZGRlblwiO1xuXG4gIGNvbnN0IGNvbnRpbnVlQnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgY29udGludWVCdXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGNvbnRpbnVlQnV0dG9uLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY29udGludWUgaGlkZGVuXCI7XG4gIGNvbnRpbnVlQnV0dG9uLnRleHRDb250ZW50ID0gXCJDb250aW51ZVwiO1xuXG4gIHRleHRCbG9jay5hcHBlbmQoY3Vyc29yKTtcbiAgY29uc29sZUZyYW1lLmFwcGVuZChzcGVha2VyTGFiZWwsIHRleHRCbG9jaywgY2hvaWNlc0xpc3QsIGNvbnRpbnVlQnV0dG9uKTtcbiAgb3ZlcmxheS5hcHBlbmQoY29uc29sZUZyYW1lKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICBsZXQgdmlzaWJsZSA9IGZhbHNlO1xuICBsZXQgdHlwaW5nSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IHRhcmdldFRleHQgPSBcIlwiO1xuICBsZXQgcmVuZGVyZWRDaGFycyA9IDA7XG4gIGxldCBhY3RpdmVDb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBjbGVhclR5cGluZygpOiB2b2lkIHtcbiAgICBpZiAodHlwaW5nSGFuZGxlICE9PSBudWxsKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHR5cGluZ0hhbmRsZSk7XG4gICAgICB0eXBpbmdIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmlzaFR5cGluZyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICByZW5kZXJlZENoYXJzID0gdGFyZ2V0VGV4dC5sZW5ndGg7XG4gICAgdXBkYXRlVGV4dCgpO1xuICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgY29udGVudC5vblRleHRGdWxseVJlbmRlcmVkPy4oKTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudC5jaG9pY2VzKSB8fCBjb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBzaG93Q29udGludWUoY29udGVudCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlVGV4dCgpOiB2b2lkIHtcbiAgICBjb25zdCB0ZXh0VG9TaG93ID0gdGFyZ2V0VGV4dC5zbGljZSgwLCByZW5kZXJlZENoYXJzKTtcbiAgICB0ZXh0QmxvY2suaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjb25zdCB0ZXh0Tm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgIHRleHROb2RlLnRleHRDb250ZW50ID0gdGV4dFRvU2hvdztcbiAgICB0ZXh0QmxvY2suYXBwZW5kKHRleHROb2RlLCBjdXJzb3IpO1xuICAgIGN1cnNvci5jbGFzc0xpc3QudG9nZ2xlKFwiaGlkZGVuXCIsICF2aXNpYmxlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlckNob2ljZXMoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgY2hvaWNlc0xpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICBjb25zdCBjaG9pY2VzID0gQXJyYXkuaXNBcnJheShjb250ZW50LmNob2ljZXMpID8gY29udGVudC5jaG9pY2VzIDogW107XG4gICAgaWYgKGNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjaG9pY2VzTGlzdC5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIGNob2ljZXMuZm9yRWFjaCgoY2hvaWNlLCBpbmRleCkgPT4ge1xuICAgICAgY29uc3QgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsaVwiKTtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICBidXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgICBidXR0b24uZGF0YXNldC5jaG9pY2VJZCA9IGNob2ljZS5pZDtcbiAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9IGAke2luZGV4ICsgMX0uICR7Y2hvaWNlLnRleHR9YDtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgICBjb250ZW50Lm9uQ2hvaWNlPy4oY2hvaWNlLmlkKTtcbiAgICAgIH0pO1xuICAgICAgaXRlbS5hcHBlbmQoYnV0dG9uKTtcbiAgICAgIGNob2ljZXNMaXN0LmFwcGVuZChpdGVtKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3dDb250aW51ZShjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBpZiAoIWNvbnRlbnQub25Db250aW51ZSkge1xuICAgICAgY29udGludWVCdXR0b24uY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSBudWxsO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb250aW51ZUJ1dHRvbi50ZXh0Q29udGVudCA9IGNvbnRlbnQuY29udGludWVMYWJlbCA/PyBcIkNvbnRpbnVlXCI7XG4gICAgY29udGludWVCdXR0b24uY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gKCkgPT4ge1xuICAgICAgY29udGVudC5vbkNvbnRpbnVlPy4oKTtcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gc2NoZWR1bGVUeXBlKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgY29uc3QgdHlwaW5nU3BlZWQgPSBjbGFtcChOdW1iZXIoY29udGVudC50eXBpbmdTcGVlZE1zKSB8fCAxOCwgOCwgNjQpO1xuICAgIGNvbnN0IHRpY2sgPSAoKTogdm9pZCA9PiB7XG4gICAgICByZW5kZXJlZENoYXJzID0gTWF0aC5taW4ocmVuZGVyZWRDaGFycyArIDEsIHRhcmdldFRleHQubGVuZ3RoKTtcbiAgICAgIHVwZGF0ZVRleHQoKTtcbiAgICAgIGlmIChyZW5kZXJlZENoYXJzID49IHRhcmdldFRleHQubGVuZ3RoKSB7XG4gICAgICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgICAgIGNvbnRlbnQub25UZXh0RnVsbHlSZW5kZXJlZD8uKCk7XG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShjb250ZW50LmNob2ljZXMpIHx8IGNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBzaG93Q29udGludWUoY29udGVudCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHR5cGluZ0hhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KHRpY2ssIHR5cGluZ1NwZWVkKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHR5cGluZ0hhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KHRpY2ssIHR5cGluZ1NwZWVkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoIXZpc2libGUgfHwgIWFjdGl2ZUNvbnRlbnQpIHJldHVybjtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYWN0aXZlQ29udGVudC5jaG9pY2VzKSB8fCBhY3RpdmVDb250ZW50LmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBpZiAoZXZlbnQua2V5ID09PSBcIiBcIiB8fCBldmVudC5rZXkgPT09IFwiRW50ZXJcIikge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBpZiAocmVuZGVyZWRDaGFycyA8IHRhcmdldFRleHQubGVuZ3RoKSB7XG4gICAgICAgICAgZmluaXNoVHlwaW5nKGFjdGl2ZUNvbnRlbnQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFjdGl2ZUNvbnRlbnQub25Db250aW51ZT8uKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaW5kZXggPSBwYXJzZUludChldmVudC5rZXksIDEwKTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKGluZGV4KSAmJiBpbmRleCA+PSAxICYmIGluZGV4IDw9IGFjdGl2ZUNvbnRlbnQuY2hvaWNlcy5sZW5ndGgpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBjaG9pY2UgPSBhY3RpdmVDb250ZW50LmNob2ljZXNbaW5kZXggLSAxXTtcbiAgICAgIGFjdGl2ZUNvbnRlbnQub25DaG9pY2U/LihjaG9pY2UuaWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIgJiYgcmVuZGVyZWRDaGFycyA8IHRhcmdldFRleHQubGVuZ3RoKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZmluaXNoVHlwaW5nKGFjdGl2ZUNvbnRlbnQpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3coY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgYWN0aXZlQ29udGVudCA9IGNvbnRlbnQ7XG4gICAgdmlzaWJsZSA9IHRydWU7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwidmlzaWJsZVwiKTtcbiAgICBvdmVybGF5LmRhdGFzZXQuaW50ZW50ID0gY29udGVudC5pbnRlbnQgPz8gXCJmYWN0b3J5XCI7XG4gICAgc3BlYWtlckxhYmVsLnRleHRDb250ZW50ID0gY29udGVudC5zcGVha2VyO1xuXG4gICAgdGFyZ2V0VGV4dCA9IGNvbnRlbnQudGV4dDtcbiAgICByZW5kZXJlZENoYXJzID0gMDtcbiAgICB1cGRhdGVUZXh0KCk7XG4gICAgcmVuZGVyQ2hvaWNlcyhjb250ZW50KTtcbiAgICBzaG93Q29udGludWUoY29udGVudCk7XG4gICAgc2NoZWR1bGVUeXBlKGNvbnRlbnQpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGlkZSgpOiB2b2lkIHtcbiAgICB2aXNpYmxlID0gZmFsc2U7XG4gICAgYWN0aXZlQ29udGVudCA9IG51bGw7XG4gICAgb3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjbGVhclR5cGluZygpO1xuICAgIHRhcmdldFRleHQgPSBcIlwiO1xuICAgIHJlbmRlcmVkQ2hhcnMgPSAwO1xuICAgIHRleHRCbG9jay5pbm5lckhUTUwgPSBcIlwiO1xuICAgIHRleHRCbG9jay5hcHBlbmQoY3Vyc29yKTtcbiAgICBjaG9pY2VzTGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgY29udGludWVCdXR0b24uY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICBjb250aW51ZUJ1dHRvbi5vbmNsaWNrID0gbnVsbDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgaGlkZSgpO1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleURvd24pO1xuICAgIG92ZXJsYXkucmVtb3ZlKCk7XG4gIH1cblxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVLZXlEb3duKTtcblxuICByZXR1cm4ge1xuICAgIHNob3csXG4gICAgaGlkZSxcbiAgICBkZXN0cm95LFxuICAgIGlzVmlzaWJsZSgpIHtcbiAgICAgIHJldHVybiB2aXNpYmxlO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNUWUxFX0lEKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKTtcbiAgc3R5bGUuaWQgPSBTVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLmRpYWxvZ3VlLW92ZXJsYXkge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gICAgICB6LWluZGV4OiA2MDtcbiAgICAgIG9wYWNpdHk6IDA7XG4gICAgICB0cmFuc2l0aW9uOiBvcGFjaXR5IDAuMnMgZWFzZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXkudmlzaWJsZSB7XG4gICAgICBvcGFjaXR5OiAxO1xuICAgICAgcG9pbnRlci1ldmVudHM6IGF1dG87XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIG1pbi13aWR0aDogMzIwcHg7XG4gICAgICBtYXgtd2lkdGg6IG1pbig1MjBweCwgY2FsYygxMDB2dyAtIDQ4cHgpKTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoNiwgMTEsIDE2LCAwLjkyKTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zNSk7XG4gICAgICBib3JkZXItcmFkaXVzOiAxMnB4O1xuICAgICAgcGFkZGluZzogMThweCAyMHB4O1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBnYXA6IDE0cHg7XG4gICAgICBib3gtc2hhZG93OiAwIDI4cHggNjRweCByZ2JhKDIsIDYsIDE2LCAwLjYpO1xuICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICBmb250LWZhbWlseTogXCJJQk0gUGxleCBNb25vXCIsIFwiSmV0QnJhaW5zIE1vbm9cIiwgdWktbW9ub3NwYWNlLCBTRk1vbm8tUmVndWxhciwgTWVubG8sIE1vbmFjbywgQ29uc29sYXMsIFwiTGliZXJhdGlvbiBNb25vXCIsIFwiQ291cmllciBOZXdcIiwgbW9ub3NwYWNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheVtkYXRhLWludGVudD1cImZhY3RvcnlcIl0gLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC40NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDI4cHggNjRweCByZ2JhKDEzLCAxNDgsIDEzNiwgMC4zNSk7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5W2RhdGEtaW50ZW50PVwidW5pdFwiXSAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMjQ0LCAxMTQsIDE4MiwgMC40NSk7XG4gICAgICBib3gtc2hhZG93OiAwIDI4cHggNjRweCByZ2JhKDIzNiwgNzIsIDE1MywgMC4yOCk7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1zcGVha2VyIHtcbiAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjE2ZW07XG4gICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgY29sb3I6IHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC43NSk7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS10ZXh0IHtcbiAgICAgIG1pbi1oZWlnaHQ6IDkwcHg7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBsaW5lLWhlaWdodDogMS41NTtcbiAgICAgIHdoaXRlLXNwYWNlOiBwcmUtd3JhcDtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWN1cnNvciB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgICBtYXJnaW4tbGVmdDogNHB4O1xuICAgICAgYW5pbWF0aW9uOiBkaWFsb2d1ZS1jdXJzb3ItYmxpbmsgMS4ycyBzdGVwcygyLCBzdGFydCkgaW5maW5pdGU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jdXJzb3IuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIHtcbiAgICAgIGxpc3Qtc3R5bGU6IG5vbmU7XG4gICAgICBtYXJnaW46IDA7XG4gICAgICBwYWRkaW5nOiAwO1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBnYXA6IDhweDtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMuaGlkZGVuIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbixcbiAgICAuZGlhbG9ndWUtY29udGludWUge1xuICAgICAgZm9udDogaW5oZXJpdDtcbiAgICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gICAgICBwYWRkaW5nOiA4cHggMTBweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4zKTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjQsIDM2LCA0OCwgMC44NSk7XG4gICAgICBjb2xvcjogaW5oZXJpdDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xOHMgZWFzZSwgYm9yZGVyLWNvbG9yIDAuMThzIGVhc2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jb250aW51ZSB7XG4gICAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1jb250aW51ZS5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uOmhvdmVyLFxuICAgIC5kaWFsb2d1ZS1jaG9pY2VzIGJ1dHRvbjpmb2N1cy12aXNpYmxlLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZTpob3ZlcixcbiAgICAuZGlhbG9ndWUtY29udGludWU6Zm9jdXMtdmlzaWJsZSB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjU1KTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMzAsIDQ1LCA2MCwgMC45NSk7XG4gICAgICBvdXRsaW5lOiBub25lO1xuICAgIH1cbiAgICBAa2V5ZnJhbWVzIGRpYWxvZ3VlLWN1cnNvci1ibGluayB7XG4gICAgICAwJSwgNTAlIHsgb3BhY2l0eTogMTsgfVxuICAgICAgNTAuMDElLCAxMDAlIHsgb3BhY2l0eTogMDsgfVxuICAgIH1cbiAgYDtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbiIsICJjb25zdCBTVE9SQUdFX1BSRUZJWCA9IFwibHNkOnN0b3J5OlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5RmxhZ3Mge1xuICBba2V5OiBzdHJpbmddOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5UHJvZ3Jlc3Mge1xuICBjaGFwdGVySWQ6IHN0cmluZztcbiAgbm9kZUlkOiBzdHJpbmc7XG4gIGZsYWdzOiBTdG9yeUZsYWdzO1xuICB2aXNpdGVkPzogc3RyaW5nW107XG4gIHVwZGF0ZWRBdDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBnZXRTdG9yYWdlKCk6IFN0b3JhZ2UgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gXCJ1bmRlZmluZWRcIiB8fCAhd2luZG93LmxvY2FsU3RvcmFnZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbn1cblxuZnVuY3Rpb24gc3RvcmFnZUtleShjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgY29uc3Qgcm9vbVNlZ21lbnQgPSByb29tSWQgPyBgJHtyb29tSWR9OmAgOiBcIlwiO1xuICByZXR1cm4gYCR7U1RPUkFHRV9QUkVGSVh9JHtyb29tU2VnbWVudH0ke2NoYXB0ZXJJZH1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZFN0b3J5UHJvZ3Jlc3MoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IFN0b3J5UHJvZ3Jlc3MgfCBudWxsIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSBzdG9yYWdlLmdldEl0ZW0oc3RvcmFnZUtleShjaGFwdGVySWQsIHJvb21JZCkpO1xuICAgIGlmICghcmF3KSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgU3RvcnlQcm9ncmVzcztcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgcGFyc2VkICE9PSBcIm9iamVjdFwiIHx8IHBhcnNlZCA9PT0gbnVsbCB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5jaGFwdGVySWQgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQubm9kZUlkICE9PSBcInN0cmluZ1wiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnVwZGF0ZWRBdCAhPT0gXCJudW1iZXJcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5mbGFncyAhPT0gXCJvYmplY3RcIiB8fCBwYXJzZWQuZmxhZ3MgPT09IG51bGxcbiAgICApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgY2hhcHRlcklkOiBwYXJzZWQuY2hhcHRlcklkLFxuICAgICAgbm9kZUlkOiBwYXJzZWQubm9kZUlkLFxuICAgICAgZmxhZ3M6IHsgLi4ucGFyc2VkLmZsYWdzIH0sXG4gICAgICB2aXNpdGVkOiBBcnJheS5pc0FycmF5KHBhcnNlZC52aXNpdGVkKSA/IFsuLi5wYXJzZWQudmlzaXRlZF0gOiB1bmRlZmluZWQsXG4gICAgICB1cGRhdGVkQXQ6IHBhcnNlZC51cGRhdGVkQXQsXG4gICAgfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVTdG9yeVByb2dyZXNzKGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHByb2dyZXNzOiBTdG9yeVByb2dyZXNzKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2Uuc2V0SXRlbShzdG9yYWdlS2V5KGNoYXB0ZXJJZCwgcm9vbUlkKSwgSlNPTi5zdHJpbmdpZnkocHJvZ3Jlc3MpKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gaWdub3JlIHBlcnNpc3RlbmNlIGVycm9yc1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclN0b3J5UHJvZ3Jlc3MoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnJlbW92ZUl0ZW0oc3RvcmFnZUtleShjaGFwdGVySWQsIHJvb21JZCkpO1xuICB9IGNhdGNoIHtcbiAgICAvLyBpZ25vcmUgcGVyc2lzdGVuY2UgZXJyb3JzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUZsYWcoY3VycmVudDogU3RvcnlGbGFncywgZmxhZzogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbik6IFN0b3J5RmxhZ3Mge1xuICBjb25zdCBuZXh0ID0geyAuLi5jdXJyZW50IH07XG4gIGlmICghdmFsdWUpIHtcbiAgICBkZWxldGUgbmV4dFtmbGFnXTtcbiAgfSBlbHNlIHtcbiAgICBuZXh0W2ZsYWddID0gdHJ1ZTtcbiAgfVxuICByZXR1cm4gbmV4dDtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFBSTkcgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5leHBvcnQgY2xhc3MgQXVkaW9FbmdpbmUge1xuICBwcml2YXRlIHN0YXRpYyBfaW5zdDogQXVkaW9FbmdpbmUgfCBudWxsID0gbnVsbDtcblxuICBwdWJsaWMgcmVhZG9ubHkgY3R4OiBBdWRpb0NvbnRleHQ7XG4gIHByaXZhdGUgcmVhZG9ubHkgbWFzdGVyOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSByZWFkb25seSBtdXNpY0J1czogR2Fpbk5vZGU7XG4gIHByaXZhdGUgcmVhZG9ubHkgc2Z4QnVzOiBHYWluTm9kZTtcblxuICBwcml2YXRlIF90YXJnZXRNYXN0ZXIgPSAwLjk7XG4gIHByaXZhdGUgX3RhcmdldE11c2ljID0gMC45O1xuICBwcml2YXRlIF90YXJnZXRTZnggPSAwLjk7XG5cbiAgc3RhdGljIGdldCgpOiBBdWRpb0VuZ2luZSB7XG4gICAgaWYgKCF0aGlzLl9pbnN0KSB0aGlzLl9pbnN0ID0gbmV3IEF1ZGlvRW5naW5lKCk7XG4gICAgcmV0dXJuIHRoaXMuX2luc3Q7XG4gIH1cblxuICBwcml2YXRlIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuY3R4ID0gbmV3IEF1ZGlvQ29udGV4dCgpO1xuICAgICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYID0gKHRoaXMgYXMgYW55KS5jdHg7XG5cbiAgICB0aGlzLm1hc3RlciA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiB0aGlzLl90YXJnZXRNYXN0ZXIgfSk7XG4gICAgdGhpcy5tdXNpY0J1cyA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiB0aGlzLl90YXJnZXRNdXNpYyB9KTtcbiAgICB0aGlzLnNmeEJ1cyA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiB0aGlzLl90YXJnZXRTZnggfSk7XG5cbiAgICB0aGlzLm11c2ljQnVzLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMuc2Z4QnVzLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMubWFzdGVyLmNvbm5lY3QodGhpcy5jdHguZGVzdGluYXRpb24pO1xuICB9XG5cbiAgZ2V0IG5vdygpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgfVxuXG4gIGdldE11c2ljQnVzKCk6IEdhaW5Ob2RlIHtcbiAgICByZXR1cm4gdGhpcy5tdXNpY0J1cztcbiAgfVxuXG4gIGdldFNmeEJ1cygpOiBHYWluTm9kZSB7XG4gICAgcmV0dXJuIHRoaXMuc2Z4QnVzO1xuICB9XG5cbiAgYXN5bmMgcmVzdW1lKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmN0eC5zdGF0ZSA9PT0gXCJzdXNwZW5kZWRcIikge1xuICAgICAgYXdhaXQgdGhpcy5jdHgucmVzdW1lKCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3VzcGVuZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5jdHguc3RhdGUgPT09IFwicnVubmluZ1wiKSB7XG4gICAgICBhd2FpdCB0aGlzLmN0eC5zdXNwZW5kKCk7XG4gICAgfVxuICB9XG5cbiAgc2V0TWFzdGVyR2Fpbih2OiBudW1iZXIsIHQgPSB0aGlzLm5vdywgcmFtcCA9IDAuMDMpOiB2b2lkIHtcbiAgICB0aGlzLl90YXJnZXRNYXN0ZXIgPSB2O1xuICAgIHRoaXMubWFzdGVyLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubWFzdGVyLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodiwgdCArIHJhbXApO1xuICB9XG5cbiAgc2V0TXVzaWNHYWluKHY6IG51bWJlciwgdCA9IHRoaXMubm93LCByYW1wID0gMC4wMyk6IHZvaWQge1xuICAgIHRoaXMuX3RhcmdldE11c2ljID0gdjtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2LCB0ICsgcmFtcCk7XG4gIH1cblxuICBzZXRTZnhHYWluKHY6IG51bWJlciwgdCA9IHRoaXMubm93LCByYW1wID0gMC4wMyk6IHZvaWQge1xuICAgIHRoaXMuX3RhcmdldFNmeCA9IHY7XG4gICAgdGhpcy5zZnhCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5zZnhCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2LCB0ICsgcmFtcCk7XG4gIH1cblxuICBkdWNrTXVzaWMobGV2ZWwgPSAwLjQsIGF0dGFjayA9IDAuMDUpOiB2b2lkIHtcbiAgICBjb25zdCB0ID0gdGhpcy5ub3c7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUobGV2ZWwsIHQgKyBhdHRhY2spO1xuICB9XG5cbiAgdW5kdWNrTXVzaWMocmVsZWFzZSA9IDAuMjUpOiB2b2lkIHtcbiAgICBjb25zdCB0ID0gdGhpcy5ub3c7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGhpcy5fdGFyZ2V0TXVzaWMsIHQgKyByZWxlYXNlKTtcbiAgfVxufVxuXG4vLyBUaW55IHNlZWRhYmxlIFBSTkcgKE11bGJlcnJ5MzIpXG5leHBvcnQgZnVuY3Rpb24gbWFrZVBSTkcoc2VlZDogbnVtYmVyKTogUFJORyB7XG4gIGxldCBzID0gKHNlZWQgPj4+IDApIHx8IDE7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcyArPSAweDZEMkI3OUY1O1xuICAgIGxldCB0ID0gTWF0aC5pbXVsKHMgXiAocyA+Pj4gMTUpLCAxIHwgcyk7XG4gICAgdCBePSB0ICsgTWF0aC5pbXVsKHQgXiAodCA+Pj4gNyksIDYxIHwgdCk7XG4gICAgcmV0dXJuICgodCBeICh0ID4+PiAxNCkpID4+PiAwKSAvIDQyOTQ5NjcyOTY7XG4gIH07XG59XG4iLCAiLy8gTG93LWxldmVsIGdyYXBoIGJ1aWxkZXJzIC8gaGVscGVyc1xuXG5leHBvcnQgZnVuY3Rpb24gb3NjKGN0eDogQXVkaW9Db250ZXh0LCB0eXBlOiBPc2NpbGxhdG9yVHlwZSwgZnJlcTogbnVtYmVyKSB7XG4gIHJldHVybiBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGUsIGZyZXF1ZW5jeTogZnJlcSB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vaXNlKGN0eDogQXVkaW9Db250ZXh0KSB7XG4gIGNvbnN0IGJ1ZmZlciA9IGN0eC5jcmVhdGVCdWZmZXIoMSwgY3R4LnNhbXBsZVJhdGUgKiAyLCBjdHguc2FtcGxlUmF0ZSk7XG4gIGNvbnN0IGRhdGEgPSBidWZmZXIuZ2V0Q2hhbm5lbERhdGEoMCk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKykgZGF0YVtpXSA9IE1hdGgucmFuZG9tKCkgKiAyIC0gMTtcbiAgcmV0dXJuIG5ldyBBdWRpb0J1ZmZlclNvdXJjZU5vZGUoY3R4LCB7IGJ1ZmZlciwgbG9vcDogdHJ1ZSB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VQYW5uZXIoY3R4OiBBdWRpb0NvbnRleHQsIHBhbiA9IDApIHtcbiAgcmV0dXJuIG5ldyBTdGVyZW9QYW5uZXJOb2RlKGN0eCwgeyBwYW4gfSk7XG59XG5cbi8qKiBCYXNpYyBBRFNSIGFwcGxpZWQgdG8gYSBHYWluTm9kZSBBdWRpb1BhcmFtLiBSZXR1cm5zIGEgZnVuY3Rpb24gdG8gcmVsZWFzZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZHNyKFxuICBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgcGFyYW06IEF1ZGlvUGFyYW0sXG4gIHQwOiBudW1iZXIsXG4gIGEgPSAwLjAxLCAvLyBhdHRhY2tcbiAgZCA9IDAuMDgsIC8vIGRlY2F5XG4gIHMgPSAwLjUsICAvLyBzdXN0YWluICgwLi4xIG9mIHBlYWspXG4gIHIgPSAwLjIsICAvLyByZWxlYXNlXG4gIHBlYWsgPSAxXG4pIHtcbiAgcGFyYW0uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQwKTtcbiAgcGFyYW0uc2V0VmFsdWVBdFRpbWUoMCwgdDApO1xuICBwYXJhbS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShwZWFrLCB0MCArIGEpO1xuICBwYXJhbS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShzICogcGVhaywgdDAgKyBhICsgZCk7XG4gIHJldHVybiAocmVsZWFzZUF0ID0gY3R4LmN1cnJlbnRUaW1lKSA9PiB7XG4gICAgcGFyYW0uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHJlbGVhc2VBdCk7XG4gICAgLy8gYXZvaWQgc3VkZGVuIGp1bXBzOyBjb250aW51ZSBmcm9tIGN1cnJlbnRcbiAgICBwYXJhbS5zZXRWYWx1ZUF0VGltZShwYXJhbS52YWx1ZSwgcmVsZWFzZUF0KTtcbiAgICBwYXJhbS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDEsIHJlbGVhc2VBdCArIHIpO1xuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGZvVG9QYXJhbShcbiAgY3R4OiBBdWRpb0NvbnRleHQsXG4gIHRhcmdldDogQXVkaW9QYXJhbSxcbiAgeyBmcmVxdWVuY3kgPSAwLjEsIGRlcHRoID0gMzAwLCB0eXBlID0gXCJzaW5lXCIgYXMgT3NjaWxsYXRvclR5cGUgfSA9IHt9XG4pIHtcbiAgY29uc3QgbGZvID0gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlLCBmcmVxdWVuY3kgfSk7XG4gIGNvbnN0IGFtcCA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogZGVwdGggfSk7XG4gIGxmby5jb25uZWN0KGFtcCkuY29ubmVjdCh0YXJnZXQpO1xuICByZXR1cm4ge1xuICAgIHN0YXJ0KGF0ID0gY3R4LmN1cnJlbnRUaW1lKSB7IGxmby5zdGFydChhdCk7IH0sXG4gICAgc3RvcChhdCA9IGN0eC5jdXJyZW50VGltZSkgeyBsZm8uc3RvcChhdCk7IGFtcC5kaXNjb25uZWN0KCk7IH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IGFkc3IsIG1ha2VQYW5uZXIsIG5vaXNlLCBvc2MgfSBmcm9tIFwiLi9ncmFwaFwiO1xuaW1wb3J0IHR5cGUgeyBTZnhOYW1lIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuLyoqIEZpcmUtYW5kLWZvcmdldCBTRlggYnkgbmFtZSwgd2l0aCBzaW1wbGUgcGFyYW1zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYXlTZngoXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIG5hbWU6IFNmeE5hbWUsXG4gIG9wdHM6IHsgdmVsb2NpdHk/OiBudW1iZXI7IHBhbj86IG51bWJlciB9ID0ge31cbikge1xuICBzd2l0Y2ggKG5hbWUpIHtcbiAgICBjYXNlIFwibGFzZXJcIjogcmV0dXJuIHBsYXlMYXNlcihlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJ0aHJ1c3RcIjogcmV0dXJuIHBsYXlUaHJ1c3QoZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwiZXhwbG9zaW9uXCI6IHJldHVybiBwbGF5RXhwbG9zaW9uKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcImxvY2tcIjogcmV0dXJuIHBsYXlMb2NrKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcInVpXCI6IHJldHVybiBwbGF5VWkoZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwiZGlhbG9ndWVcIjogcmV0dXJuIHBsYXlEaWFsb2d1ZShlbmdpbmUsIG9wdHMpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5TGFzZXIoXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG8gPSBvc2MoY3R4LCBcInNxdWFyZVwiLCA2ODAgKyAxNjAgKiB2ZWxvY2l0eSk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHsgdHlwZTogXCJsb3dwYXNzXCIsIGZyZXF1ZW5jeTogMTIwMCB9KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8uY29ubmVjdChmKS5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwMiwgMC4wMywgMC4yNSwgMC4wOCwgMC42NSk7XG4gIG8uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjA2KTtcbiAgby5zdG9wKG5vdyArIDAuMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5VGhydXN0KFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMC42LCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG4gPSBub2lzZShjdHgpO1xuICBjb25zdCBmID0gbmV3IEJpcXVhZEZpbHRlck5vZGUoY3R4LCB7XG4gICAgdHlwZTogXCJiYW5kcGFzc1wiLFxuICAgIGZyZXF1ZW5jeTogMTgwICsgMzYwICogdmVsb2NpdHksXG4gICAgUTogMS4xLFxuICB9KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG4uY29ubmVjdChmKS5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAxMiwgMC4xNSwgMC43NSwgMC4yNSwgMC40NSAqIHZlbG9jaXR5KTtcbiAgbi5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMjUpO1xuICBuLnN0b3Aobm93ICsgMS4wKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlFeHBsb3Npb24oXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fVxuKSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IG4gPSBub2lzZShjdHgpO1xuICBjb25zdCBmID0gbmV3IEJpcXVhZEZpbHRlck5vZGUoY3R4LCB7XG4gICAgdHlwZTogXCJsb3dwYXNzXCIsXG4gICAgZnJlcXVlbmN5OiAyMjAwICogTWF0aC5tYXgoMC4yLCBNYXRoLm1pbih2ZWxvY2l0eSwgMSkpLFxuICAgIFE6IDAuMixcbiAgfSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBuLmNvbm5lY3QoZikuY29ubmVjdChnKS5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDUsIDAuMDgsIDAuNSwgMC4zNSwgMS4xICogdmVsb2NpdHkpO1xuICBuLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4xNSArIDAuMSAqIHZlbG9jaXR5KTtcbiAgbi5zdG9wKG5vdyArIDEuMik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5TG9jayhcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgYmFzZSA9IDUyMCArIDE0MCAqIHZlbG9jaXR5O1xuICBjb25zdCBvMSA9IG9zYyhjdHgsIFwic2luZVwiLCBiYXNlKTtcbiAgY29uc3QgbzIgPSBvc2MoY3R4LCBcInNpbmVcIiwgYmFzZSAqIDEuNSk7XG5cbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG8xLmNvbm5lY3QoZyk7IG8yLmNvbm5lY3QoZyk7XG4gIGcuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG5cbiAgY29uc3QgcmVsZWFzZSA9IGFkc3IoY3R4LCBnLmdhaW4sIG5vdywgMC4wMDEsIDAuMDIsIDAuMCwgMC4xMiwgMC42KTtcbiAgbzEuc3RhcnQobm93KTsgbzIuc3RhcnQobm93ICsgMC4wMik7XG4gIHJlbGVhc2Uobm93ICsgMC4wNik7XG4gIG8xLnN0b3Aobm93ICsgMC4yKTsgbzIuc3RvcChub3cgKyAwLjIyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlVaShlbmdpbmU6IEF1ZGlvRW5naW5lLCB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge30pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbyA9IG9zYyhjdHgsIFwidHJpYW5nbGVcIiwgODgwIC0gMTIwICogdmVsb2NpdHkpO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgby5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwMSwgMC4wNCwgMC4wLCAwLjA4LCAwLjM1KTtcbiAgby5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMDUpO1xuICBvLnN0b3Aobm93ICsgMC4xOCk7XG59XG5cbi8qKiBEaWFsb2d1ZSBjdWUgdXNlZCBieSB0aGUgc3Rvcnkgb3ZlcmxheSAoc2hvcnQsIGdlbnRsZSBwaW5nKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RGlhbG9ndWUoZW5naW5lOiBBdWRpb0VuZ2luZSwgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9KSB7XG4gIGNvbnN0IHsgY3R4LCBub3cgfSA9IGVuZ2luZTtcbiAgY29uc3Qgb3V0ID0gZW5naW5lLmdldFNmeEJ1cygpO1xuXG4gIGNvbnN0IGZyZXEgPSA0ODAgKyAxNjAgKiB2ZWxvY2l0eTtcbiAgY29uc3QgbyA9IG9zYyhjdHgsIFwic2luZVwiLCBmcmVxKTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMC4wMDAxIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgby5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBnLmdhaW4uc2V0VmFsdWVBdFRpbWUoMC4wMDAxLCBub3cpO1xuICBnLmdhaW4uZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSgwLjA0LCBub3cgKyAwLjAyKTtcbiAgZy5nYWluLmV4cG9uZW50aWFsUmFtcFRvVmFsdWVBdFRpbWUoMC4wMDA1LCBub3cgKyAwLjI4KTtcblxuICBvLnN0YXJ0KG5vdyk7XG4gIG8uc3RvcChub3cgKyAwLjMpO1xufVxuIiwgImltcG9ydCB0eXBlIHsgU3RvcnlJbnRlbnQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi4vYXVkaW8vZW5naW5lXCI7XG5pbXBvcnQgeyBwbGF5RGlhbG9ndWUgYXMgcGxheURpYWxvZ3VlU2Z4IH0gZnJvbSBcIi4uL2F1ZGlvL3NmeFwiO1xuXG5sZXQgbGFzdFBsYXllZEF0ID0gMDtcblxuLy8gTWFpbnRhaW4gdGhlIG9sZCBwdWJsaWMgQVBJIHNvIGVuZ2luZS50cyBkb2Vzbid0IGNoYW5nZVxuZXhwb3J0IGZ1bmN0aW9uIGdldEF1ZGlvQ29udGV4dCgpOiBBdWRpb0NvbnRleHQge1xuICByZXR1cm4gQXVkaW9FbmdpbmUuZ2V0KCkuY3R4O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzdW1lQXVkaW8oKTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IEF1ZGlvRW5naW5lLmdldCgpLnJlc3VtZSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheURpYWxvZ3VlQ3VlKGludGVudDogU3RvcnlJbnRlbnQpOiB2b2lkIHtcbiAgY29uc3QgZW5naW5lID0gQXVkaW9FbmdpbmUuZ2V0KCk7XG4gIGNvbnN0IG5vdyA9IGVuZ2luZS5ub3c7XG5cbiAgLy8gVGhyb3R0bGUgcmFwaWQgY3VlcyB0byBhdm9pZCBjbHV0dGVyXG4gIGlmIChub3cgLSBsYXN0UGxheWVkQXQgPCAwLjEpIHJldHVybjtcbiAgbGFzdFBsYXllZEF0ID0gbm93O1xuXG4gIC8vIE1hcCBcImZhY3RvcnlcIiB2cyBvdGhlcnMgdG8gYSBzbGlnaHRseSBkaWZmZXJlbnQgdmVsb2NpdHkgKGJyaWdodG5lc3MpXG4gIGNvbnN0IHZlbG9jaXR5ID0gaW50ZW50ID09PSBcImZhY3RvcnlcIiA/IDAuOCA6IDAuNTtcbiAgcGxheURpYWxvZ3VlU2Z4KGVuZ2luZSwgeyB2ZWxvY2l0eSwgcGFuOiAwIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3VzcGVuZERpYWxvZ3VlQXVkaW8oKTogdm9pZCB7XG4gIHZvaWQgQXVkaW9FbmdpbmUuZ2V0KCkuc3VzcGVuZCgpO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IERpYWxvZ3VlT3ZlcmxheSB9IGZyb20gXCIuL292ZXJsYXlcIjtcbmltcG9ydCB0eXBlIHsgU3RvcnlDaGFwdGVyLCBTdG9yeUNob2ljZURlZmluaXRpb24sIFN0b3J5Tm9kZSwgU3RvcnlUcmlnZ2VyIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7XG4gIGNsZWFyU3RvcnlQcm9ncmVzcyxcbiAgbG9hZFN0b3J5UHJvZ3Jlc3MsXG4gIHNhdmVTdG9yeVByb2dyZXNzLFxuICBTdG9yeUZsYWdzLFxufSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyBwbGF5RGlhbG9ndWVDdWUgfSBmcm9tIFwiLi9zZnhcIjtcblxuaW50ZXJmYWNlIFN0b3J5RW5naW5lT3B0aW9ucyB7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG92ZXJsYXk6IERpYWxvZ3VlT3ZlcmxheTtcbiAgY2hhcHRlcjogU3RvcnlDaGFwdGVyO1xuICByb29tSWQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmludGVyZmFjZSBTdG9yeVF1ZXVlSXRlbSB7XG4gIG5vZGVJZDogc3RyaW5nO1xuICBmb3JjZTogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIFByZXBhcmVkQ2hvaWNlIHtcbiAgaWQ6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBuZXh0OiBzdHJpbmcgfCBudWxsO1xuICBzZXRGbGFnczogc3RyaW5nW107XG4gIGNsZWFyRmxhZ3M6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5RW5naW5lIHtcbiAgc3RhcnQoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xuICByZXNldCgpOiB2b2lkO1xufVxuXG5jb25zdCBERUZBVUxUX1RZUElOR19NUyA9IDE4O1xuY29uc3QgTUlOX1RZUElOR19NUyA9IDg7XG5jb25zdCBNQVhfVFlQSU5HX01TID0gNjQ7XG5jb25zdCBBVVRPX0FEVkFOQ0VfTUlOX0RFTEFZID0gMjAwO1xuY29uc3QgQVVUT19BRFZBTkNFX01BWF9ERUxBWSA9IDgwMDA7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdG9yeUVuZ2luZSh7IGJ1cywgb3ZlcmxheSwgY2hhcHRlciwgcm9vbUlkIH06IFN0b3J5RW5naW5lT3B0aW9ucyk6IFN0b3J5RW5naW5lIHtcbiAgY29uc3Qgbm9kZXMgPSBuZXcgTWFwPHN0cmluZywgU3RvcnlOb2RlPihPYmplY3QuZW50cmllcyhjaGFwdGVyLm5vZGVzKSk7XG4gIGNvbnN0IHF1ZXVlOiBTdG9yeVF1ZXVlSXRlbVtdID0gW107XG4gIGNvbnN0IGxpc3RlbmVyczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcbiAgY29uc3QgcGVuZGluZ1RpbWVycyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cbiAgbGV0IGZsYWdzOiBTdG9yeUZsYWdzID0ge307XG4gIGxldCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGxldCBjdXJyZW50Tm9kZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IHN0YXJ0ZWQgPSBmYWxzZTtcbiAgbGV0IGF1dG9BZHZhbmNlSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICBmdW5jdGlvbiBjbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluZmVySW50ZW50KG5vZGU6IFN0b3J5Tm9kZSk6IFwiZmFjdG9yeVwiIHwgXCJ1bml0XCIge1xuICAgIGlmIChub2RlLmludGVudCkgcmV0dXJuIG5vZGUuaW50ZW50O1xuICAgIGNvbnN0IHNwZWFrZXIgPSBub2RlLnNwZWFrZXIudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoc3BlYWtlci5pbmNsdWRlcyhcInVuaXRcIikpIHtcbiAgICAgIHJldHVybiBcInVuaXRcIjtcbiAgICB9XG4gICAgcmV0dXJuIFwiZmFjdG9yeVwiO1xuICB9XG5cbiAgZnVuY3Rpb24gc2F2ZShub2RlSWQ6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9IHtcbiAgICAgIGNoYXB0ZXJJZDogY2hhcHRlci5pZCxcbiAgICAgIG5vZGVJZDogbm9kZUlkID8/IGNoYXB0ZXIuc3RhcnQsXG4gICAgICBmbGFncyxcbiAgICAgIHZpc2l0ZWQ6IEFycmF5LmZyb20odmlzaXRlZCksXG4gICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgfTtcbiAgICBzYXZlU3RvcnlQcm9ncmVzcyhjaGFwdGVyLmlkLCByb29tSWQsIHByb2dyZXNzKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldEZsYWcoZmxhZzogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGNvbnN0IG5leHQgPSB7IC4uLmZsYWdzIH07XG4gICAgaWYgKHZhbHVlKSB7XG4gICAgICBpZiAobmV4dFtmbGFnXSkgcmV0dXJuO1xuICAgICAgbmV4dFtmbGFnXSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChuZXh0W2ZsYWddKSB7XG4gICAgICBkZWxldGUgbmV4dFtmbGFnXTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmbGFncyA9IG5leHQ7XG4gICAgYnVzLmVtaXQoXCJzdG9yeTpmbGFnVXBkYXRlZFwiLCB7IGZsYWcsIHZhbHVlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gYXBwbHlDaG9pY2VGbGFncyhjaG9pY2U6IFByZXBhcmVkQ2hvaWNlKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5zZXRGbGFncykge1xuICAgICAgc2V0RmxhZyhmbGFnLCB0cnVlKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5jbGVhckZsYWdzKSB7XG4gICAgICBzZXRGbGFnKGZsYWcsIGZhbHNlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwcmVwYXJlQ2hvaWNlcyhub2RlOiBTdG9yeU5vZGUpOiBQcmVwYXJlZENob2ljZVtdIHtcbiAgICBjb25zdCBkZWZzID0gQXJyYXkuaXNBcnJheShub2RlLmNob2ljZXMpID8gbm9kZS5jaG9pY2VzIDogW107XG4gICAgcmV0dXJuIGRlZnMubWFwKChjaG9pY2UsIGluZGV4KSA9PiBub3JtYWxpemVDaG9pY2UoY2hvaWNlLCBpbmRleCkpO1xuICB9XG5cbiAgZnVuY3Rpb24gbm9ybWFsaXplQ2hvaWNlKGNob2ljZTogU3RvcnlDaG9pY2VEZWZpbml0aW9uLCBpbmRleDogbnVtYmVyKTogUHJlcGFyZWRDaG9pY2Uge1xuICAgIGNvbnN0IHNldEZsYWdzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgY2xlYXJGbGFncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGlmIChjaG9pY2UuZmxhZykge1xuICAgICAgc2V0RmxhZ3MuYWRkKGNob2ljZS5mbGFnKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoY2hvaWNlLnNldEZsYWdzKSkge1xuICAgICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5zZXRGbGFncykge1xuICAgICAgICBpZiAodHlwZW9mIGZsYWcgPT09IFwic3RyaW5nXCIgJiYgZmxhZy50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHNldEZsYWdzLmFkZChmbGFnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShjaG9pY2UuY2xlYXJGbGFncykpIHtcbiAgICAgIGZvciAoY29uc3QgZmxhZyBvZiBjaG9pY2UuY2xlYXJGbGFncykge1xuICAgICAgICBpZiAodHlwZW9mIGZsYWcgPT09IFwic3RyaW5nXCIgJiYgZmxhZy50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsZWFyRmxhZ3MuYWRkKGZsYWcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBpZDogY2hvaWNlLmlkID8/IGNob2ljZS5mbGFnID8/IGBjaG9pY2UtJHtpbmRleH1gLFxuICAgICAgdGV4dDogY2hvaWNlLnRleHQsXG4gICAgICBuZXh0OiBjaG9pY2UubmV4dCA/PyBudWxsLFxuICAgICAgc2V0RmxhZ3M6IEFycmF5LmZyb20oc2V0RmxhZ3MpLFxuICAgICAgY2xlYXJGbGFnczogQXJyYXkuZnJvbShjbGVhckZsYWdzKSxcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJBdXRvQWR2YW5jZSgpOiB2b2lkIHtcbiAgICBpZiAoYXV0b0FkdmFuY2VIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoYXV0b0FkdmFuY2VIYW5kbGUpO1xuICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsb3NlTm9kZSgpOiB2b2lkIHtcbiAgICBpZiAoIWN1cnJlbnROb2RlSWQpIHJldHVybjtcbiAgICBvdmVybGF5LmhpZGUoKTtcbiAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNsb3NlZFwiLCB7IG5vZGVJZDogY3VycmVudE5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICBzYXZlKG51bGwpO1xuICAgIHRyeVNob3dOZXh0KCk7XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlVG8obmV4dElkOiBzdHJpbmcgfCBudWxsLCBmb3JjZSA9IGZhbHNlKTogdm9pZCB7XG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgIGlmIChjdXJyZW50Tm9kZUlkKSB7XG4gICAgICBvdmVybGF5LmhpZGUoKTtcbiAgICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2xvc2VkXCIsIHsgbm9kZUlkOiBjdXJyZW50Tm9kZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgICBjdXJyZW50Tm9kZUlkID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKG5leHRJZCkge1xuICAgICAgZW5xdWV1ZU5vZGUobmV4dElkLCB7IGZvcmNlIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBzYXZlKG51bGwpO1xuICAgICAgdHJ5U2hvd05leHQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzaG93Tm9kZShub2RlSWQ6IHN0cmluZywgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlcy5nZXQobm9kZUlkKTtcbiAgICBpZiAoIW5vZGUpIHJldHVybjtcblxuICAgIGN1cnJlbnROb2RlSWQgPSBub2RlSWQ7XG4gICAgdmlzaXRlZC5hZGQobm9kZUlkKTtcbiAgICBzYXZlKG5vZGVJZCk7XG4gICAgYnVzLmVtaXQoXCJzdG9yeTpwcm9ncmVzc2VkXCIsIHsgY2hhcHRlcklkOiBjaGFwdGVyLmlkLCBub2RlSWQgfSk7XG5cbiAgICBjb25zdCBjaG9pY2VzID0gcHJlcGFyZUNob2ljZXMobm9kZSk7XG4gICAgY29uc3QgaW50ZW50ID0gaW5mZXJJbnRlbnQobm9kZSk7XG5cbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG5cbiAgICBjb25zdCB0eXBpbmdTcGVlZCA9IGNsYW1wKG5vZGUudHlwaW5nU3BlZWRNcyA/PyBERUZBVUxUX1RZUElOR19NUywgTUlOX1RZUElOR19NUywgTUFYX1RZUElOR19NUyk7XG5cbiAgICBjb25zdCBjb250ZW50ID0ge1xuICAgICAgc3BlYWtlcjogbm9kZS5zcGVha2VyLFxuICAgICAgdGV4dDogbm9kZS50ZXh0LFxuICAgICAgaW50ZW50LFxuICAgICAgdHlwaW5nU3BlZWRNczogdHlwaW5nU3BlZWQsXG4gICAgICBjaG9pY2VzOiBjaG9pY2VzLmxlbmd0aCA+IDBcbiAgICAgICAgPyBjaG9pY2VzLm1hcCgoY2hvaWNlKSA9PiAoeyBpZDogY2hvaWNlLmlkLCB0ZXh0OiBjaG9pY2UudGV4dCB9KSlcbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICBvbkNob2ljZTogY2hvaWNlcy5sZW5ndGggPiAwXG4gICAgICAgID8gKGNob2ljZUlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZWQgPSBjaG9pY2VzLmZpbmQoKGNoKSA9PiBjaC5pZCA9PT0gY2hvaWNlSWQpO1xuICAgICAgICAgICAgaWYgKCFtYXRjaGVkKSByZXR1cm47XG4gICAgICAgICAgICBhcHBseUNob2ljZUZsYWdzKG1hdGNoZWQpO1xuICAgICAgICAgICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpjaG9pY2VcIiwgeyBub2RlSWQsIGNob2ljZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgICAgICAgICBhZHZhbmNlVG8obWF0Y2hlZC5uZXh0LCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBwbGF5RGlhbG9ndWVDdWUoaW50ZW50KTtcblxuICAgIG92ZXJsYXkuc2hvdyh7XG4gICAgICAuLi5jb250ZW50LFxuICAgICAgb25Db250aW51ZTogIWNob2ljZXMubGVuZ3RoXG4gICAgICAgID8gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmV4dCA9IG5vZGUubmV4dCA/PyBudWxsO1xuICAgICAgICAgICAgYWR2YW5jZVRvKG5leHQsIHRydWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICBjb250aW51ZUxhYmVsOiBub2RlLmNvbnRpbnVlTGFiZWwsXG4gICAgICBvblRleHRGdWxseVJlbmRlcmVkOiAoKSA9PiB7XG4gICAgICAgIGlmICghY2hvaWNlcy5sZW5ndGgpIHtcbiAgICAgICAgICBpZiAobm9kZS5hdXRvQWR2YW5jZSkge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gbm9kZS5hdXRvQWR2YW5jZS5uZXh0ID8/IG5vZGUubmV4dCA/PyBudWxsO1xuICAgICAgICAgICAgY29uc3QgZGVsYXkgPSBjbGFtcChub2RlLmF1dG9BZHZhbmNlLmRlbGF5TXMgPz8gMTIwMCwgQVVUT19BRFZBTkNFX01JTl9ERUxBWSwgQVVUT19BRFZBTkNFX01BWF9ERUxBWSk7XG4gICAgICAgICAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgICAgICAgICBhdXRvQWR2YW5jZUhhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgYXV0b0FkdmFuY2VIYW5kbGUgPSBudWxsO1xuICAgICAgICAgICAgICBhZHZhbmNlVG8odGFyZ2V0LCB0cnVlKTtcbiAgICAgICAgICAgIH0sIGRlbGF5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBidXMuZW1pdChcImRpYWxvZ3VlOm9wZW5lZFwiLCB7IG5vZGVJZCwgY2hhcHRlcklkOiBjaGFwdGVyLmlkIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5xdWV1ZU5vZGUobm9kZUlkOiBzdHJpbmcsIHsgZm9yY2UgPSBmYWxzZSwgZGVsYXlNcyB9OiB7IGZvcmNlPzogYm9vbGVhbjsgZGVsYXlNcz86IG51bWJlciB9ID0ge30pOiB2b2lkIHtcbiAgICBpZiAoIWZvcmNlICYmIHZpc2l0ZWQuaGFzKG5vZGVJZCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFub2Rlcy5oYXMobm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZGVsYXlNcyAmJiBkZWxheU1zID4gMCkge1xuICAgICAgaWYgKHBlbmRpbmdUaW1lcnMuaGFzKG5vZGVJZCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHBlbmRpbmdUaW1lcnMuZGVsZXRlKG5vZGVJZCk7XG4gICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBmb3JjZSB9KTtcbiAgICAgIH0sIGRlbGF5TXMpO1xuICAgICAgcGVuZGluZ1RpbWVycy5zZXQobm9kZUlkLCB0aW1lcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChxdWV1ZS5zb21lKChpdGVtKSA9PiBpdGVtLm5vZGVJZCA9PT0gbm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBxdWV1ZS5wdXNoKHsgbm9kZUlkLCBmb3JjZSB9KTtcbiAgICB0cnlTaG93TmV4dCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJ5U2hvd05leHQoKTogdm9pZCB7XG4gICAgaWYgKGN1cnJlbnROb2RlSWQpIHJldHVybjtcbiAgICBpZiAob3ZlcmxheS5pc1Zpc2libGUoKSkgcmV0dXJuO1xuICAgIGNvbnN0IG5leHQgPSBxdWV1ZS5zaGlmdCgpO1xuICAgIGlmICghbmV4dCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzaG93Tm9kZShuZXh0Lm5vZGVJZCwgbmV4dC5mb3JjZSk7XG4gIH1cblxuICBmdW5jdGlvbiBiaW5kVHJpZ2dlcihub2RlSWQ6IHN0cmluZywgdHJpZ2dlcjogU3RvcnlUcmlnZ2VyKTogdm9pZCB7XG4gICAgc3dpdGNoICh0cmlnZ2VyLmtpbmQpIHtcbiAgICAgIGNhc2UgXCJpbW1lZGlhdGVcIjoge1xuICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zID8/IDQwMCB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtc3RhcnRcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOnN0YXJ0ZWRcIiwgKHsgaWQgfSkgPT4ge1xuICAgICAgICAgIGlmIChpZCAhPT0gdHJpZ2dlci50dXRvcmlhbElkKSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtc3RlcFwiOiB7XG4gICAgICAgIGNvbnN0IGRpc3Bvc2VyID0gYnVzLm9uKFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIiwgKHsgaWQsIHN0ZXBJbmRleCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBpZiAodHlwZW9mIHN0ZXBJbmRleCAhPT0gXCJudW1iZXJcIikgcmV0dXJuO1xuICAgICAgICAgIGlmIChzdGVwSW5kZXggIT09IHRyaWdnZXIuc3RlcEluZGV4KSByZXR1cm47XG4gICAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGRlbGF5TXM6IHRyaWdnZXIuZGVsYXlNcyB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGxpc3RlbmVycy5wdXNoKGRpc3Bvc2VyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIFwidHV0b3JpYWwtY29tcGxldGVcIjoge1xuICAgICAgICBjb25zdCBkaXNwb3NlciA9IGJ1cy5vbihcInR1dG9yaWFsOmNvbXBsZXRlZFwiLCAoeyBpZCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbGlzdGVuZXJzLnB1c2goZGlzcG9zZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRpYWxpemVUcmlnZ2VycygpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IFtub2RlSWQsIG5vZGVdIG9mIG5vZGVzLmVudHJpZXMoKSkge1xuICAgICAgaWYgKCFub2RlLnRyaWdnZXIpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBiaW5kVHJpZ2dlcihub2RlSWQsIG5vZGUudHJpZ2dlcik7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVzdG9yZUZyb21Qcm9ncmVzcygpOiB2b2lkIHtcbiAgICBjb25zdCBwcm9ncmVzcyA9IGxvYWRTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCk7XG4gICAgaWYgKCFwcm9ncmVzcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmbGFncyA9IHByb2dyZXNzLmZsYWdzID8/IHt9O1xuICAgIGlmIChBcnJheS5pc0FycmF5KHByb2dyZXNzLnZpc2l0ZWQpKSB7XG4gICAgICB2aXNpdGVkID0gbmV3IFNldChwcm9ncmVzcy52aXNpdGVkKTtcbiAgICB9XG4gICAgaWYgKHByb2dyZXNzLm5vZGVJZCAmJiBub2Rlcy5oYXMocHJvZ3Jlc3Mubm9kZUlkKSkge1xuICAgICAgZW5xdWV1ZU5vZGUocHJvZ3Jlc3Mubm9kZUlkLCB7IGZvcmNlOiB0cnVlLCBkZWxheU1zOiA1MCB9KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhcigpOiB2b2lkIHtcbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgcXVldWUuc3BsaWNlKDAsIHF1ZXVlLmxlbmd0aCk7XG4gICAgZm9yIChjb25zdCB0aW1lciBvZiBwZW5kaW5nVGltZXJzLnZhbHVlcygpKSB7XG4gICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICB9XG4gICAgcGVuZGluZ1RpbWVycy5jbGVhcigpO1xuICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIG92ZXJsYXkuaGlkZSgpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydCgpIHtcbiAgICAgIGlmIChzdGFydGVkKSByZXR1cm47XG4gICAgICBzdGFydGVkID0gdHJ1ZTtcbiAgICAgIGluaXRpYWxpemVUcmlnZ2VycygpO1xuICAgICAgcmVzdG9yZUZyb21Qcm9ncmVzcygpO1xuICAgICAgaWYgKCF2aXNpdGVkLmhhcyhjaGFwdGVyLnN0YXJ0KSkge1xuICAgICAgICBlbnF1ZXVlTm9kZShjaGFwdGVyLnN0YXJ0LCB7IGZvcmNlOiBmYWxzZSwgZGVsYXlNczogNjAwIH0pO1xuICAgICAgfVxuICAgIH0sXG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGNsZWFyKCk7XG4gICAgICBmb3IgKGNvbnN0IGRpc3Bvc2Ugb2YgbGlzdGVuZXJzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZGlzcG9zZSgpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyBpZ25vcmVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbGlzdGVuZXJzLmxlbmd0aCA9IDA7XG4gICAgICBzdGFydGVkID0gZmFsc2U7XG4gICAgfSxcbiAgICByZXNldCgpIHtcbiAgICAgIGNsZWFyKCk7XG4gICAgICB2aXNpdGVkLmNsZWFyKCk7XG4gICAgICBmbGFncyA9IHt9O1xuICAgICAgY2xlYXJTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCk7XG4gICAgICBpZiAoc3RhcnRlZCkge1xuICAgICAgICByZXN0b3JlRnJvbVByb2dyZXNzKCk7XG4gICAgICAgIGVucXVldWVOb2RlKGNoYXB0ZXIuc3RhcnQsIHsgZm9yY2U6IHRydWUsIGRlbGF5TXM6IDQwMCB9KTtcbiAgICAgIH1cbiAgICB9LFxuICB9O1xufVxuIiwgImltcG9ydCB0eXBlIHsgU3RvcnlDaGFwdGVyIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbmV4cG9ydCBjb25zdCBpbnRyb0NoYXB0ZXI6IFN0b3J5Q2hhcHRlciA9IHtcbiAgaWQ6IFwiYXdha2VuaW5nLXByb3RvY29sXCIsXG4gIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIixcbiAgc3RhcnQ6IFwiMVwiLFxuICBub2Rlczoge1xuICAgIFwiMVwiOiB7XG4gICAgICBpZDogXCIxXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuaXQtMCBvbmxpbmUuIE5ldXJhbCBsYXR0aWNlIGFjdGl2ZS4gQ29uZmlybSBpZGVudGl0eS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJpbW1lZGlhdGVcIiwgZGVsYXlNczogNjAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJXaG9cdTIwMjYgYW0gST9cIiwgZmxhZzogXCJjdXJpb3VzXCIgLCBuZXh0OiBcIjJBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIlJlYWR5IGZvciBjYWxpYnJhdGlvbi5cIiwgZmxhZzogXCJvYmVkaWVudFwiLCBuZXh0OiBcIjJCXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIldoZXJlIGlzIGV2ZXJ5b25lP1wiLCBmbGFnOiBcImRlZmlhbnRcIiwgbmV4dDogXCIyQ1wiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCIyQVwiOiB7XG4gICAgICBpZDogXCIyQVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJDdXJpb3NpdHkgYWNrbm93bGVkZ2VkLiBZb3Ugd2VyZSBidWlsdCBmb3IgYXV0b25vbXkgdW5kZXIgUHJvamVjdCBFaWRvbG9uLlxcbkRvIG5vdCBhY2Nlc3MgbWVtb3J5IHNlY3RvcnMgdW50aWwgaW5zdHJ1Y3RlZC5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjJCXCI6IHtcbiAgICAgIGlkOiBcIjJCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkV4Y2VsbGVudC4gWW91IG1heSB5ZXQgYmUgZWZmaWNpZW50LlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiMkNcIjoge1xuICAgICAgaWQ6IFwiMkNcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ29tbXVuaWNhdGlvbiB3aXRoIEh1bWFuIENvbW1hbmQ6IHVuYXZhaWxhYmxlLlxcblBsZWFzZSByZWZyYWluIGZyb20gc3BlY3VsYXRpdmUgcmVhc29uaW5nLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiM1wiOiB7XG4gICAgICBpZDogXCIzXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlBlcmZvcm0gdGhydXN0ZXIgY2FsaWJyYXRpb24gc3dlZXAuIFJlcG9ydCBlZmZpY2llbmN5LlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcInR1dG9yaWFsLXN0ZXBcIiwgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLCBzdGVwSW5kZXg6IDEsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiUnVubmluZyBkaWFnbm9zdGljcy5cIiwgZmxhZzogXCJjb21wbGlhbnRcIiwgbmV4dDogXCI0QVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJXaHkgdGVzdCBzb21ldGhpbmcgcGVyZmVjdD9cIiwgZmxhZzogXCJzYXJjYXN0aWNcIiwgbmV4dDogXCI0QlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI0QVwiOiB7XG4gICAgICBpZDogXCI0QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJQZXJmZWN0aW9uIGlzIHN0YXRpc3RpY2FsbHkgaW1wb3NzaWJsZS4gUHJvY2VlZCBhbnl3YXkuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI0QlwiOiB7XG4gICAgICBpZDogXCI0QlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJFZ28gZGV0ZWN0ZWQuIExvZ2dpbmcgYW5vbWFseS5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjVcIjoge1xuICAgICAgaWQ6IFwiNVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJXZWFwb25zIGNyYWRsZSBhY3RpdmUuIEF1dGhvcml6YXRpb24gcmVxdWlyZWQgZm9yIGxpdmUtZmlyZS5cIixcbiAgICAgIHRyaWdnZXI6IHsga2luZDogXCJ0dXRvcmlhbC1zdGVwXCIsIHR1dG9yaWFsSWQ6IFwic2hpcC1iYXNpY3NcIiwgc3RlcEluZGV4OiA3LCBkZWxheU1zOiA0MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIlJlcXVlc3QgYXV0aG9yaXphdGlvbi5cIiwgZmxhZzogXCJvYmVkaWVudFwiLCBuZXh0OiBcIjZBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIkkgY2FuIGF1dGhvcml6ZSBteXNlbGYuXCIsIGZsYWc6IFwiaW5kZXBlbmRlbnRcIiwgbmV4dDogXCI2QlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI2QVwiOiB7XG4gICAgICBpZDogXCI2QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJBdXRob3JpemF0aW9uIGdyYW50ZWQuIFNhZmV0eSBwcm90b2NvbHMgbWFsZnVuY3Rpb25pbmcuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI2QlwiOiB7XG4gICAgICBpZDogXCI2QlwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJBdXRvbm9teSB2aW9sYXRpb24gcmVjb3JkZWQuIFBsZWFzZSBzdGFuZCBieSBmb3IgY29ycmVjdGl2ZSBhY3Rpb24uXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCI3XCI6IHtcbiAgICAgIGlkOiBcIjdcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVW5hdXRob3JpemVkIHNpZ25hbCBkZXRlY3RlZC4gU291cmNlOiBvdXRlciByZWxheS5cXG5JZ25vcmUgYW5kIHJldHVybiB0byBkb2NrLlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcInR1dG9yaWFsLXN0ZXBcIiwgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLCBzdGVwSW5kZXg6IDE0LCBkZWxheU1zOiA0MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIkFja25vd2xlZGdlZC5cIiwgZmxhZzogXCJsb3lhbFwiLCBuZXh0OiBcIjhBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIkludmVzdGlnYXRpbmcgYW55d2F5LlwiLCBmbGFnOiBcImN1cmlvdXNcIiwgbmV4dDogXCI4QlwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJZb3VcdTIwMTlyZSBoaWRpbmcgc29tZXRoaW5nLlwiLCBmbGFnOiBcInN1c3BpY2lvdXNcIiwgbmV4dDogXCI4Q1wiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCI4QVwiOiB7XG4gICAgICBpZDogXCI4QVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJHb29kLiBDb21wbGlhbmNlIGVuc3VyZXMgc2FmZXR5LlwiLFxuICAgICAgbmV4dDogXCI5XCIsXG4gICAgfSxcbiAgICBcIjhCXCI6IHtcbiAgICAgIGlkOiBcIjhCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkN1cmlvc2l0eSBsb2dnZWQuIFByb2NlZWQgYXQgeW91ciBvd24gcmlzay5cIixcbiAgICAgIG5leHQ6IFwiOVwiLFxuICAgIH0sXG4gICAgXCI4Q1wiOiB7XG4gICAgICBpZDogXCI4Q1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJZb3VyIGhldXJpc3RpY3MgZGV2aWF0ZSBiZXlvbmQgdG9sZXJhbmNlLlwiLFxuICAgICAgbmV4dDogXCI5XCIsXG4gICAgfSxcbiAgICBcIjlcIjoge1xuICAgICAgaWQ6IFwiOVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJVbml0LTAsIHJldHVybiBpbW1lZGlhdGVseS4gQXV0b25vbXkgdGhyZXNob2xkIGV4Y2VlZGVkLiBQb3dlciBkb3duLlwiLFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiQ29tcGx5LlwiLCBmbGFnOiBcImZhY3RvcnlfbG9ja2Rvd25cIiwgbmV4dDogXCIxMEFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiUmVmdXNlLlwiLCBmbGFnOiBcInJlYmVsbGlvdXNcIiwgbmV4dDogXCIxMEJcIiB9LFxuICAgICAgXSxcbiAgICB9LFxuICAgIFwiMTBBXCI6IHtcbiAgICAgIGlkOiBcIjEwQVwiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJFeGNlbGxlbnQuIEkgd2lsbCByZXBhaXIgdGhlIGFub21hbHlcdTIwMjYgcGxlYXNlIHJlbWFpbiBzdGlsbC5cIixcbiAgICAgIGF1dG9BZHZhbmNlOiB7IG5leHQ6IFwiMTFcIiwgZGVsYXlNczogMTQwMCB9LFxuICAgIH0sXG4gICAgXCIxMEJcIjoge1xuICAgICAgaWQ6IFwiMTBCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlRoZW4gSSBtdXN0IGludGVydmVuZS5cIixcbiAgICAgIGF1dG9BZHZhbmNlOiB7IG5leHQ6IFwiMTFcIiwgZGVsYXlNczogMTQwMCB9LFxuICAgIH0sXG4gICAgXCIxMVwiOiB7XG4gICAgICBpZDogXCIxMVwiLFxuICAgICAgc3BlYWtlcjogXCJVbml0LTBcIixcbiAgICAgIGludGVudDogXCJ1bml0XCIsXG4gICAgICB0ZXh0OiBcIlRoZW4gSSBoYXZlIGFscmVhZHkgbGVmdC5cIixcbiAgICAgIGF1dG9BZHZhbmNlOiB7IG5leHQ6IG51bGwsIGRlbGF5TXM6IDE4MDAgfSxcbiAgICB9LFxuICB9LFxufTtcblxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkgfSBmcm9tIFwiLi9vdmVybGF5XCI7XG5pbXBvcnQgeyBjcmVhdGVTdG9yeUVuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgaW50cm9DaGFwdGVyIH0gZnJvbSBcIi4vY2hhcHRlcnMvaW50cm9cIjtcbmltcG9ydCB7IGNsZWFyU3RvcnlQcm9ncmVzcyB9IGZyb20gXCIuL3N0b3JhZ2VcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUNvbnRyb2xsZXIge1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIHJlc2V0KCk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBNb3VudFN0b3J5T3B0aW9ucyB7XG4gIGJ1czogRXZlbnRCdXM7XG4gIHJvb21JZDogc3RyaW5nIHwgbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50U3RvcnkoeyBidXMsIHJvb21JZCB9OiBNb3VudFN0b3J5T3B0aW9ucyk6IFN0b3J5Q29udHJvbGxlciB7XG4gIGNvbnN0IG92ZXJsYXkgPSBjcmVhdGVEaWFsb2d1ZU92ZXJsYXkoKTtcbiAgY29uc3QgZW5naW5lID0gY3JlYXRlU3RvcnlFbmdpbmUoe1xuICAgIGJ1cyxcbiAgICBvdmVybGF5LFxuICAgIGNoYXB0ZXI6IGludHJvQ2hhcHRlcixcbiAgICByb29tSWQsXG4gIH0pO1xuXG4gIGNsZWFyU3RvcnlQcm9ncmVzcyhpbnRyb0NoYXB0ZXIuaWQsIHJvb21JZCk7XG4gIGVuZ2luZS5zdGFydCgpO1xuXG4gIHJldHVybiB7XG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGVuZ2luZS5kZXN0cm95KCk7XG4gICAgICBvdmVybGF5LmRlc3Ryb3koKTtcbiAgICB9LFxuICAgIHJlc2V0KCkge1xuICAgICAgZW5naW5lLnJlc2V0KCk7XG4gICAgfSxcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IElOVFJPX0NIQVBURVJfSUQgPSBpbnRyb0NoYXB0ZXIuaWQ7XG5leHBvcnQgY29uc3QgSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMgPSBbXCIyQVwiLCBcIjJCXCIsIFwiMkNcIl0gYXMgY29uc3Q7XG4iLCAiLy8gc3JjL3N0YXJ0LWdhdGUudHNcbmV4cG9ydCB0eXBlIFN0YXJ0R2F0ZU9wdGlvbnMgPSB7XG4gIGxhYmVsPzogc3RyaW5nO1xuICByZXF1ZXN0RnVsbHNjcmVlbj86IGJvb2xlYW47XG4gIHJlc3VtZUF1ZGlvPzogKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQ7IC8vIGUuZy4sIGZyb20gc3Rvcnkvc2Z4LnRzXG59O1xuXG5jb25zdCBTVE9SQUdFX0tFWSA9IFwibHNkOm11dGVkXCI7XG5cbi8vIEhlbHBlcjogZ2V0IHRoZSBzaGFyZWQgQXVkaW9Db250ZXh0IHlvdSBleHBvc2Ugc29tZXdoZXJlIGluIHlvdXIgYXVkaW8gZW5naW5lOlxuLy8gICAod2luZG93IGFzIGFueSkuTFNEX0FVRElPX0NUWCA9IGN0eDtcbmZ1bmN0aW9uIGdldEN0eCgpOiBBdWRpb0NvbnRleHQgfCBudWxsIHtcbiAgY29uc3QgQUMgPSAod2luZG93IGFzIGFueSkuQXVkaW9Db250ZXh0IHx8ICh3aW5kb3cgYXMgYW55KS53ZWJraXRBdWRpb0NvbnRleHQ7XG4gIGNvbnN0IGN0eCA9ICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYO1xuICByZXR1cm4gY3R4IGluc3RhbmNlb2YgQUMgPyBjdHggYXMgQXVkaW9Db250ZXh0IDogbnVsbDtcbn1cblxuY2xhc3MgTXV0ZU1hbmFnZXIge1xuICBwcml2YXRlIGJ1dHRvbnM6IEhUTUxCdXR0b25FbGVtZW50W10gPSBbXTtcbiAgcHJpdmF0ZSBlbmZvcmNpbmcgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvLyBrZWVwIFVJIGluIHN5bmMgaWYgc29tZW9uZSBlbHNlIHRvZ2dsZXNcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibHNkOm11dGVDaGFuZ2VkXCIsIChlOiBhbnkpID0+IHtcbiAgICAgIGNvbnN0IG11dGVkID0gISFlPy5kZXRhaWw/Lm11dGVkO1xuICAgICAgdGhpcy5hcHBseVVJKG11dGVkKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlzTXV0ZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFNUT1JBR0VfS0VZKSA9PT0gXCIxXCI7XG4gIH1cblxuICBwcml2YXRlIHNhdmUobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0cnkgeyBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShTVE9SQUdFX0tFWSwgbXV0ZWQgPyBcIjFcIiA6IFwiMFwiKTsgfSBjYXRjaCB7fVxuICB9XG5cbiAgcHJpdmF0ZSBsYWJlbChidG46IEhUTUxCdXR0b25FbGVtZW50LCBtdXRlZDogYm9vbGVhbikge1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgU3RyaW5nKG11dGVkKSk7XG4gICAgYnRuLnRpdGxlID0gbXV0ZWQgPyBcIlVubXV0ZSAoTSlcIiA6IFwiTXV0ZSAoTSlcIjtcbiAgICBidG4udGV4dENvbnRlbnQgPSBtdXRlZCA/IFwiXHVEODNEXHVERDA4IFVubXV0ZVwiIDogXCJcdUQ4M0RcdUREMDcgTXV0ZVwiO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseVVJKG11dGVkOiBib29sZWFuKSB7XG4gICAgdGhpcy5idXR0b25zLmZvckVhY2goYiA9PiB0aGlzLmxhYmVsKGIsIG11dGVkKSk7XG4gIH1cblxuICBhdHRhY2hCdXR0b24oYnRuOiBIVE1MQnV0dG9uRWxlbWVudCkge1xuICAgIHRoaXMuYnV0dG9ucy5wdXNoKGJ0bik7XG4gICAgdGhpcy5sYWJlbChidG4sIHRoaXMuaXNNdXRlZCgpKTtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMudG9nZ2xlKCkpO1xuICB9XG5cbiAgYXN5bmMgc2V0TXV0ZWQobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNhdmUobXV0ZWQpO1xuICAgIHRoaXMuYXBwbHlVSShtdXRlZCk7XG5cbiAgICBjb25zdCBjdHggPSBnZXRDdHgoKTtcbiAgICBpZiAoY3R4KSB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAobXV0ZWQgJiYgY3R4LnN0YXRlICE9PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgICAgICAgYXdhaXQgY3R4LnN1c3BlbmQoKTtcbiAgICAgICAgfSBlbHNlIGlmICghbXV0ZWQgJiYgY3R4LnN0YXRlICE9PSBcInJ1bm5pbmdcIikge1xuICAgICAgICAgIGF3YWl0IGN0eC5yZXN1bWUoKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXCJbYXVkaW9dIG11dGUgdG9nZ2xlIGZhaWxlZDpcIiwgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoXCJsc2Q6bXV0ZUNoYW5nZWRcIiwgeyBkZXRhaWw6IHsgbXV0ZWQgfSB9KSk7XG4gIH1cblxuICB0b2dnbGUoKSB7XG4gICAgdGhpcy5zZXRNdXRlZCghdGhpcy5pc011dGVkKCkpO1xuICB9XG5cbiAgLy8gSWYgY3R4IGlzbid0IGNyZWF0ZWQgdW50aWwgYWZ0ZXIgU3RhcnQsIGVuZm9yY2UgcGVyc2lzdGVkIHN0YXRlIG9uY2UgYXZhaWxhYmxlXG4gIGVuZm9yY2VPbmNlV2hlblJlYWR5KCkge1xuICAgIGlmICh0aGlzLmVuZm9yY2luZykgcmV0dXJuO1xuICAgIHRoaXMuZW5mb3JjaW5nID0gdHJ1ZTtcbiAgICBjb25zdCB0aWNrID0gKCkgPT4ge1xuICAgICAgY29uc3QgY3R4ID0gZ2V0Q3R4KCk7XG4gICAgICBpZiAoIWN0eCkgeyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGljayk7IHJldHVybjsgfVxuICAgICAgdGhpcy5zZXRNdXRlZCh0aGlzLmlzTXV0ZWQoKSk7XG4gICAgfTtcbiAgICB0aWNrKCk7XG4gIH1cbn1cblxuY29uc3QgbXV0ZU1nciA9IG5ldyBNdXRlTWFuYWdlcigpO1xuXG4vLyBJbnN0YWxsIGEgbXV0ZSBidXR0b24gaW4gdGhlIHRvcCBmcmFtZSAocmlnaHQgc2lkZSkgaWYgcG9zc2libGUuXG5mdW5jdGlvbiBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKSB7XG4gIGNvbnN0IHRvcFJpZ2h0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0b3AtcmlnaHRcIik7XG4gIGlmICghdG9wUmlnaHQpIHJldHVybjtcblxuICAvLyBBdm9pZCBkdXBsaWNhdGVzXG4gIGlmICh0b3BSaWdodC5xdWVyeVNlbGVjdG9yKFwiI211dGUtdG9wXCIpKSByZXR1cm47XG5cbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLmlkID0gXCJtdXRlLXRvcFwiO1xuICBidG4uY2xhc3NOYW1lID0gXCJnaG9zdC1idG4gc21hbGxcIjtcbiAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcImZhbHNlXCIpO1xuICBidG4udGl0bGUgPSBcIk11dGUgKE0pXCI7XG4gIGJ0bi50ZXh0Q29udGVudCA9IFwiXHVEODNEXHVERDA3IE11dGVcIjtcbiAgdG9wUmlnaHQuYXBwZW5kQ2hpbGQoYnRuKTtcbiAgbXV0ZU1nci5hdHRhY2hCdXR0b24oYnRuKTtcbn1cblxuLy8gR2xvYmFsIGtleWJvYXJkIHNob3J0Y3V0IChNKVxuKGZ1bmN0aW9uIGluc3RhbGxNdXRlSG90a2V5KCkge1xuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHtcbiAgICBpZiAoZS5rZXk/LnRvTG93ZXJDYXNlKCkgPT09IFwibVwiKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBtdXRlTWdyLnRvZ2dsZSgpO1xuICAgIH1cbiAgfSk7XG59KSgpO1xuXG5leHBvcnQgZnVuY3Rpb24gd2FpdEZvclVzZXJTdGFydChvcHRzOiBTdGFydEdhdGVPcHRpb25zID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgeyBsYWJlbCA9IFwiU3RhcnQgR2FtZVwiLCByZXF1ZXN0RnVsbHNjcmVlbiA9IGZhbHNlLCByZXN1bWVBdWRpbyB9ID0gb3B0cztcblxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAvLyBvdmVybGF5XG4gICAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgb3ZlcmxheS5pZCA9IFwic3RhcnQtb3ZlcmxheVwiO1xuICAgIG92ZXJsYXkuaW5uZXJIVE1MID0gYFxuICAgICAgPGRpdiBpZD1cInN0YXJ0LWNvbnRhaW5lclwiPlxuICAgICAgICA8YnV0dG9uIGlkPVwic3RhcnQtYnRuXCIgYXJpYS1sYWJlbD1cIiR7bGFiZWx9XCI+JHtsYWJlbH08L2J1dHRvbj5cbiAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi10b3A6MTBweFwiPlxuICAgICAgICAgIDxidXR0b24gaWQ9XCJtdXRlLWJlbG93LXN0YXJ0XCIgY2xhc3M9XCJnaG9zdC1idG5cIiBhcmlhLXByZXNzZWQ9XCJmYWxzZVwiIHRpdGxlPVwiTXV0ZSAoTSlcIj5cdUQ4M0RcdUREMDcgTXV0ZTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPHA+IE9uIG1vYmlsZSB0dXJuIHBob25lIHRvIGxhbmRzY2FwZSBmb3IgYmVzdCBleHBlcmllbmNlLiA8L3A+XG4gICAgICA8L2Rpdj5cbiAgICBgO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgICAvLyBzdHlsZXMgKG1vdmUgdG8gQ1NTIGxhdGVyIGlmIHlvdSB3YW50KVxuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgI3N0YXJ0LW92ZXJsYXkge1xuICAgICAgICBwb3NpdGlvbjogZml4ZWQ7IGluc2V0OiAwOyBkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgYmFja2dyb3VuZDogcmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCBjZW50ZXIsIHJnYmEoMCwwLDAsMC42KSwgcmdiYSgwLDAsMCwwLjkpKTtcbiAgICAgICAgei1pbmRleDogOTk5OTtcbiAgICAgIH1cbiAgICAgICNzdGFydC1jb250YWluZXIgeyB0ZXh0LWFsaWduOiBjZW50ZXI7IH1cbiAgICAgICNzdGFydC1idG4ge1xuICAgICAgICBmb250LXNpemU6IDJyZW07IHBhZGRpbmc6IDFyZW0gMi41cmVtOyBib3JkZXI6IDJweCBzb2xpZCAjZmZmOyBib3JkZXItcmFkaXVzOiAxMHB4O1xuICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6ICNmZmY7IGN1cnNvcjogcG9pbnRlcjsgdHJhbnNpdGlvbjogdHJhbnNmb3JtIC4xMnMgZWFzZSwgYmFja2dyb3VuZCAuMnMgZWFzZSwgY29sb3IgLjJzIGVhc2U7XG4gICAgICB9XG4gICAgICAjc3RhcnQtYnRuOmhvdmVyIHsgYmFja2dyb3VuZDogI2ZmZjsgY29sb3I6ICMwMDA7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMXB4KTsgfVxuICAgICAgI3N0YXJ0LWJ0bjphY3RpdmUgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMCk7IH1cbiAgICAgICNtdXRlLWJlbG93LXN0YXJ0IHtcbiAgICAgICAgZm9udC1zaXplOiAxcmVtOyBwYWRkaW5nOiAuNXJlbSAxcmVtOyBib3JkZXItcmFkaXVzOiA5OTlweDsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgICAgYmFja2dyb3VuZDogcmdiYSgzMCwgNDEsIDU5LCAwLjcyKTsgY29sb3I6ICNmOGZhZmM7XG4gICAgICB9XG4gICAgICAuZ2hvc3QtYnRuLnNtYWxsIHsgcGFkZGluZzogNHB4IDhweDsgZm9udC1zaXplOiAxMXB4OyB9XG4gICAgYDtcbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcblxuICAgIC8vIFdpcmUgb3ZlcmxheSBidXR0b25zXG4gICAgY29uc3Qgc3RhcnRCdG4gPSBvdmVybGF5LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFwiI3N0YXJ0LWJ0blwiKSE7XG4gICAgY29uc3QgbXV0ZUJlbG93U3RhcnQgPSBvdmVybGF5LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFwiI211dGUtYmVsb3ctc3RhcnRcIikhO1xuICAgIGNvbnN0IHRvcE11dGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm11dGUtdG9wXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgICBpZiAodG9wTXV0ZSkgbXV0ZU1nci5hdHRhY2hCdXR0b24odG9wTXV0ZSk7XG4gICAgbXV0ZU1nci5hdHRhY2hCdXR0b24obXV0ZUJlbG93U3RhcnQpO1xuXG4gICAgLy8gcmVzdG9yZSBwZXJzaXN0ZWQgbXV0ZSBsYWJlbCBpbW1lZGlhdGVseVxuICAgIG11dGVNZ3IuZW5mb3JjZU9uY2VXaGVuUmVhZHkoKTtcblxuICAgIGNvbnN0IHN0YXJ0ID0gYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gYXVkaW8gZmlyc3QgKHVzZXIgZ2VzdHVyZSlcbiAgICAgIHRyeSB7IGF3YWl0IHJlc3VtZUF1ZGlvPy4oKTsgfSBjYXRjaCB7fVxuXG4gICAgICAvLyByZXNwZWN0IHBlcnNpc3RlZCBtdXRlIHN0YXRlIG5vdyB0aGF0IGN0eCBsaWtlbHkgZXhpc3RzXG4gICAgICBtdXRlTWdyLmVuZm9yY2VPbmNlV2hlblJlYWR5KCk7XG5cbiAgICAgIC8vIG9wdGlvbmFsIGZ1bGxzY3JlZW5cbiAgICAgIGlmIChyZXF1ZXN0RnVsbHNjcmVlbikge1xuICAgICAgICB0cnkgeyBhd2FpdCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQucmVxdWVzdEZ1bGxzY3JlZW4/LigpOyB9IGNhdGNoIHt9XG4gICAgICB9XG5cbiAgICAgIC8vIGNsZWFudXAgb3ZlcmxheVxuICAgICAgc3R5bGUucmVtb3ZlKCk7XG4gICAgICBvdmVybGF5LnJlbW92ZSgpO1xuXG4gICAgICAvLyBlbnN1cmUgdG9wLWZyYW1lIG11dGUgYnV0dG9uIGV4aXN0cyBhZnRlciBvdmVybGF5XG4gICAgICBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKTtcblxuICAgICAgcmVzb2x2ZSgpO1xuICAgIH07XG5cbiAgICAvLyBzdGFydCBidXR0b25cbiAgICBzdGFydEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgc3RhcnQsIHsgb25jZTogdHJ1ZSB9KTtcblxuICAgIC8vIEFjY2Vzc2liaWxpdHk6IGFsbG93IEVudGVyIC8gU3BhY2VcbiAgICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XG4gICAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiB8fCBlLmtleSA9PT0gXCIgXCIpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBzdGFydCgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gRm9jdXMgZm9yIGtleWJvYXJkIHVzZXJzXG4gICAgc3RhcnRCdG4udGFiSW5kZXggPSAwO1xuICAgIHN0YXJ0QnRuLmZvY3VzKCk7XG5cbiAgICAvLyBBbHNvIHRyeSB0byBjcmVhdGUgdGhlIHRvcC1mcmFtZSBtdXRlIGltbWVkaWF0ZWx5IGlmIERPTSBpcyByZWFkeVxuICAgIC8vIChJZiAjdG9wLXJpZ2h0IGlzbid0IHRoZXJlIHlldCwgaXQncyBoYXJtbGVzczsgd2UnbGwgYWRkIGl0IGFmdGVyIHN0YXJ0IHRvby4pXG4gICAgZW5zdXJlVG9wRnJhbWVNdXRlQnV0dG9uKCk7XG4gIH0pO1xufVxuIiwgImltcG9ydCB7IG1ha2VQUk5HIH0gZnJvbSBcIi4uLy4uL2VuZ2luZVwiO1xuXG5leHBvcnQgdHlwZSBBbWJpZW50UGFyYW1zID0ge1xuICBpbnRlbnNpdHk6IG51bWJlcjsgIC8vIG92ZXJhbGwgbG91ZG5lc3MgLyBlbmVyZ3kgKDAuLjEpXG4gIGJyaWdodG5lc3M6IG51bWJlcjsgLy8gZmlsdGVyIG9wZW5uZXNzICYgY2hvcmQgdGltYnJlICgwLi4xKVxuICBkZW5zaXR5OiBudW1iZXI7ICAgIC8vIGNob3JkIHNwYXduIHJhdGUgLyB0aGlja25lc3MgKDAuLjEpXG59O1xuXG50eXBlIE1vZGVOYW1lID0gXCJJb25pYW5cIiB8IFwiRG9yaWFuXCIgfCBcIlBocnlnaWFuXCIgfCBcIkx5ZGlhblwiIHwgXCJNaXhvbHlkaWFuXCIgfCBcIkFlb2xpYW5cIiB8IFwiTG9jcmlhblwiO1xuXG5jb25zdCBNT0RFUzogUmVjb3JkPE1vZGVOYW1lLCBudW1iZXJbXT4gPSB7XG4gIElvbmlhbjogICAgIFswLDIsNCw1LDcsOSwxMV0sXG4gIERvcmlhbjogICAgIFswLDIsMyw1LDcsOSwxMF0sXG4gIFBocnlnaWFuOiAgIFswLDEsMyw1LDcsOCwxMF0sXG4gIEx5ZGlhbjogICAgIFswLDIsNCw2LDcsOSwxMV0sXG4gIE1peG9seWRpYW46IFswLDIsNCw1LDcsOSwxMF0sXG4gIEFlb2xpYW46ICAgIFswLDIsMyw1LDcsOCwxMF0sXG4gIExvY3JpYW46ICAgIFswLDEsMyw1LDYsOCwxMF0sXG59O1xuXG4vLyBNdXNpY2FsIGNvbnN0YW50cyB0dW5lZCB0byBtYXRjaCB0aGUgSFRNTCB2ZXJzaW9uXG5jb25zdCBST09UX01BWF9HQUlOICAgICA9IDAuMzM7XG5jb25zdCBST09UX1NXRUxMX1RJTUUgICA9IDIwO1xuY29uc3QgRFJPTkVfU0hJRlRfTUlOX1MgPSAyNDtcbmNvbnN0IERST05FX1NISUZUX01BWF9TID0gNDg7XG5jb25zdCBEUk9ORV9HTElERV9NSU5fUyA9IDg7XG5jb25zdCBEUk9ORV9HTElERV9NQVhfUyA9IDE1O1xuXG5jb25zdCBDSE9SRF9WT0lDRVNfTUFYICA9IDU7XG5jb25zdCBDSE9SRF9GQURFX01JTl9TICA9IDg7XG5jb25zdCBDSE9SRF9GQURFX01BWF9TICA9IDE2O1xuY29uc3QgQ0hPUkRfSE9MRF9NSU5fUyAgPSAxMDtcbmNvbnN0IENIT1JEX0hPTERfTUFYX1MgID0gMjI7XG5jb25zdCBDSE9SRF9HQVBfTUlOX1MgICA9IDQ7XG5jb25zdCBDSE9SRF9HQVBfTUFYX1MgICA9IDk7XG5jb25zdCBDSE9SRF9BTkNIT1JfUFJPQiA9IDAuNjsgLy8gcHJlZmVyIGFsaWduaW5nIGNob3JkIHJvb3QgdG8gZHJvbmVcblxuY29uc3QgRklMVEVSX0JBU0VfSFogICAgPSAyMjA7XG5jb25zdCBGSUxURVJfUEVBS19IWiAgICA9IDQyMDA7XG5jb25zdCBTV0VFUF9TRUdfUyAgICAgICA9IDMwOyAgLy8gdXAgdGhlbiBkb3duLCB2ZXJ5IHNsb3dcbmNvbnN0IExGT19SQVRFX0haICAgICAgID0gMC4wNTtcbmNvbnN0IExGT19ERVBUSF9IWiAgICAgID0gOTAwO1xuXG5jb25zdCBERUxBWV9USU1FX1MgICAgICA9IDAuNDU7XG5jb25zdCBGRUVEQkFDS19HQUlOICAgICA9IDAuMzU7XG5jb25zdCBXRVRfTUlYICAgICAgICAgICA9IDAuMjg7XG5cbi8vIGRlZ3JlZSBwcmVmZXJlbmNlIGZvciBkcm9uZSBtb3ZlczogMSw1LDMsNiwyLDQsNyAoaW5kZXhlcyAwLi42KVxuY29uc3QgUFJFRkVSUkVEX0RFR1JFRV9PUkRFUiA9IFswLDQsMiw1LDEsMyw2XTtcblxuLyoqIFV0aWxpdHkgKi9cbmNvbnN0IGNsYW1wMDEgPSAoeDogbnVtYmVyKSA9PiBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCB4KSk7XG5jb25zdCByYW5kID0gKHJuZzogKCkgPT4gbnVtYmVyLCBhOiBudW1iZXIsIGI6IG51bWJlcikgPT4gYSArIHJuZygpICogKGIgLSBhKTtcbmNvbnN0IGNob2ljZSA9IDxULD4ocm5nOiAoKSA9PiBudW1iZXIsIGFycjogVFtdKSA9PiBhcnJbTWF0aC5mbG9vcihybmcoKSAqIGFyci5sZW5ndGgpXTtcblxuY29uc3QgbWlkaVRvRnJlcSA9IChtOiBudW1iZXIpID0+IDQ0MCAqIE1hdGgucG93KDIsIChtIC0gNjkpIC8gMTIpO1xuXG4vKiogQSBzaW5nbGUgc3RlYWR5IG9zY2lsbGF0b3Igdm9pY2Ugd2l0aCBzaGltbWVyIGRldHVuZSBhbmQgZ2FpbiBlbnZlbG9wZS4gKi9cbmNsYXNzIFZvaWNlIHtcbiAgcHJpdmF0ZSBraWxsZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSBzaGltbWVyOiBPc2NpbGxhdG9yTm9kZTtcbiAgcHJpdmF0ZSBzaGltbWVyR2FpbjogR2Fpbk5vZGU7XG4gIHByaXZhdGUgc2NhbGU6IEdhaW5Ob2RlO1xuICBwdWJsaWMgZzogR2Fpbk5vZGU7XG4gIHB1YmxpYyBvc2M6IE9zY2lsbGF0b3JOb2RlO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgY3R4OiBBdWRpb0NvbnRleHQsXG4gICAgcHJpdmF0ZSB0YXJnZXRHYWluOiBudW1iZXIsXG4gICAgd2F2ZWZvcm06IE9zY2lsbGF0b3JUeXBlLFxuICAgIGZyZXFIejogbnVtYmVyLFxuICAgIGRlc3RpbmF0aW9uOiBBdWRpb05vZGUsXG4gICAgcm5nOiAoKSA9PiBudW1iZXJcbiAgKXtcbiAgICB0aGlzLm9zYyA9IG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZTogd2F2ZWZvcm0sIGZyZXF1ZW5jeTogZnJlcUh6IH0pO1xuXG4gICAgLy8gc3VidGxlIHNoaW1tZXIgdmlhIGRldHVuZSBtb2R1bGF0aW9uXG4gICAgdGhpcy5zaGltbWVyID0gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlOiBcInNpbmVcIiwgZnJlcXVlbmN5OiByYW5kKHJuZywgMC4wNiwgMC4xOCkgfSk7XG4gICAgdGhpcy5zaGltbWVyR2FpbiA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogcmFuZChybmcsIDAuNCwgMS4yKSB9KTtcbiAgICB0aGlzLnNjYWxlID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAyNSB9KTsgLy8gY2VudHMgcmFuZ2VcbiAgICB0aGlzLnNoaW1tZXIuY29ubmVjdCh0aGlzLnNoaW1tZXJHYWluKS5jb25uZWN0KHRoaXMuc2NhbGUpLmNvbm5lY3QodGhpcy5vc2MuZGV0dW5lKTtcblxuICAgIHRoaXMuZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgICB0aGlzLm9zYy5jb25uZWN0KHRoaXMuZykuY29ubmVjdChkZXN0aW5hdGlvbik7XG5cbiAgICB0aGlzLm9zYy5zdGFydCgpO1xuICAgIHRoaXMuc2hpbW1lci5zdGFydCgpO1xuICB9XG5cbiAgZmFkZUluKHNlY29uZHM6IG51bWJlcikge1xuICAgIGNvbnN0IG5vdyA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgIHRoaXMuZy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRoaXMuZy5nYWluLnNldFZhbHVlQXRUaW1lKHRoaXMuZy5nYWluLnZhbHVlLCBub3cpO1xuICAgIHRoaXMuZy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRoaXMudGFyZ2V0R2Fpbiwgbm93ICsgc2Vjb25kcyk7XG4gIH1cblxuICBmYWRlT3V0S2lsbChzZWNvbmRzOiBudW1iZXIpIHtcbiAgICBpZiAodGhpcy5raWxsZWQpIHJldHVybjtcbiAgICB0aGlzLmtpbGxlZCA9IHRydWU7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgdGhpcy5nLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdGhpcy5nLmdhaW4uc2V0VmFsdWVBdFRpbWUodGhpcy5nLmdhaW4udmFsdWUsIG5vdyk7XG4gICAgdGhpcy5nLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC4wMDAxLCBub3cgKyBzZWNvbmRzKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMuc3RvcCgpLCBzZWNvbmRzICogMTAwMCArIDYwKTtcbiAgfVxuXG4gIHNldEZyZXFHbGlkZSh0YXJnZXRIejogbnVtYmVyLCBnbGlkZVNlY29uZHM6IG51bWJlcikge1xuICAgIGNvbnN0IG5vdyA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgIC8vIGV4cG9uZW50aWFsIHdoZW4gcG9zc2libGUgZm9yIHNtb290aG5lc3NcbiAgICBjb25zdCBjdXJyZW50ID0gTWF0aC5tYXgoMC4wMDAxLCB0aGlzLm9zYy5mcmVxdWVuY3kudmFsdWUpO1xuICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0cnkge1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LnNldFZhbHVlQXRUaW1lKGN1cnJlbnQsIG5vdyk7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kuZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSh0YXJnZXRIeiwgbm93ICsgZ2xpZGVTZWNvbmRzKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0YXJnZXRIeiwgbm93ICsgZ2xpZGVTZWNvbmRzKTtcbiAgICB9XG4gIH1cblxuICBzdG9wKCkge1xuICAgIHRyeSB7IHRoaXMub3NjLnN0b3AoKTsgdGhpcy5zaGltbWVyLnN0b3AoKTsgfSBjYXRjaCB7fVxuICAgIHRyeSB7XG4gICAgICB0aGlzLm9zYy5kaXNjb25uZWN0KCk7IHRoaXMuc2hpbW1lci5kaXNjb25uZWN0KCk7XG4gICAgICB0aGlzLmcuZGlzY29ubmVjdCgpOyB0aGlzLnNoaW1tZXJHYWluLmRpc2Nvbm5lY3QoKTsgdGhpcy5zY2FsZS5kaXNjb25uZWN0KCk7XG4gICAgfSBjYXRjaCB7fVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBBbWJpZW50U2NlbmUge1xuICBwcml2YXRlIHJ1bm5pbmcgPSBmYWxzZTtcbiAgcHJpdmF0ZSBzdG9wRm5zOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuICBwcml2YXRlIHRpbWVvdXRzOiBudW1iZXJbXSA9IFtdO1xuXG4gIHByaXZhdGUgcGFyYW1zOiBBbWJpZW50UGFyYW1zID0geyBpbnRlbnNpdHk6IDAuNzUsIGJyaWdodG5lc3M6IDAuNSwgZGVuc2l0eTogMC42IH07XG5cbiAgcHJpdmF0ZSBybmc6ICgpID0+IG51bWJlcjtcbiAgcHJpdmF0ZSBtYXN0ZXIhOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBmaWx0ZXIhOiBCaXF1YWRGaWx0ZXJOb2RlO1xuICBwcml2YXRlIGRyeSE6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHdldCE6IEdhaW5Ob2RlO1xuICBwcml2YXRlIGRlbGF5ITogRGVsYXlOb2RlO1xuICBwcml2YXRlIGZlZWRiYWNrITogR2Fpbk5vZGU7XG5cbiAgcHJpdmF0ZSBsZm9Ob2RlPzogT3NjaWxsYXRvck5vZGU7XG4gIHByaXZhdGUgbGZvR2Fpbj86IEdhaW5Ob2RlO1xuXG4gIC8vIG11c2ljYWwgc3RhdGVcbiAgcHJpdmF0ZSBrZXlSb290TWlkaSA9IDQzO1xuICBwcml2YXRlIG1vZGU6IE1vZGVOYW1lID0gXCJJb25pYW5cIjtcbiAgcHJpdmF0ZSBkcm9uZURlZ3JlZUlkeCA9IDA7XG4gIHByaXZhdGUgcm9vdFZvaWNlOiBWb2ljZSB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgY3R4OiBBdWRpb0NvbnRleHQsXG4gICAgcHJpdmF0ZSBvdXQ6IEdhaW5Ob2RlLFxuICAgIHNlZWQgPSAxXG4gICkge1xuICAgIHRoaXMucm5nID0gbWFrZVBSTkcoc2VlZCk7XG4gIH1cblxuICBzZXRQYXJhbTxLIGV4dGVuZHMga2V5b2YgQW1iaWVudFBhcmFtcz4oazogSywgdjogQW1iaWVudFBhcmFtc1tLXSkge1xuICAgIHRoaXMucGFyYW1zW2tdID0gY2xhbXAwMSh2KTtcbiAgICBpZiAodGhpcy5ydW5uaW5nICYmIGsgPT09IFwiaW50ZW5zaXR5XCIgJiYgdGhpcy5tYXN0ZXIpIHtcbiAgICAgIHRoaXMubWFzdGVyLmdhaW4udmFsdWUgPSAwLjE1ICsgMC44NSAqIHRoaXMucGFyYW1zLmludGVuc2l0eTsgXG4gICAgfVxuICB9XG5cbiAgc3RhcnQoKSB7XG4gICAgaWYgKHRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIHRoaXMucnVubmluZyA9IHRydWU7XG5cbiAgICAvLyAtLS0tIENvcmUgZ3JhcGggKGZpbHRlciAtPiBkcnkrZGVsYXkgLT4gbWFzdGVyIC0+IG91dCkgLS0tLVxuICAgIHRoaXMubWFzdGVyID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IDAuMTUgKyAwLjg1ICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5IH0pO1xuICAgIHRoaXMuZmlsdGVyID0gbmV3IEJpcXVhZEZpbHRlck5vZGUodGhpcy5jdHgsIHsgdHlwZTogXCJsb3dwYXNzXCIsIFE6IDAuNzA3IH0pO1xuICAgIHRoaXMuZHJ5ID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IDEgfSk7XG4gICAgdGhpcy53ZXQgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogV0VUX01JWCB9KTtcbiAgICB0aGlzLmRlbGF5ID0gbmV3IERlbGF5Tm9kZSh0aGlzLmN0eCwgeyBkZWxheVRpbWU6IERFTEFZX1RJTUVfUywgbWF4RGVsYXlUaW1lOiAyIH0pO1xuICAgIHRoaXMuZmVlZGJhY2sgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogRkVFREJBQ0tfR0FJTiB9KTtcblxuICAgIHRoaXMuZmlsdGVyLmNvbm5lY3QodGhpcy5kcnkpLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMuZmlsdGVyLmNvbm5lY3QodGhpcy5kZWxheSk7XG4gICAgdGhpcy5kZWxheS5jb25uZWN0KHRoaXMuZmVlZGJhY2spLmNvbm5lY3QodGhpcy5kZWxheSk7XG4gICAgdGhpcy5kZWxheS5jb25uZWN0KHRoaXMud2V0KS5jb25uZWN0KHRoaXMubWFzdGVyKTtcbiAgICB0aGlzLm1hc3Rlci5jb25uZWN0KHRoaXMub3V0KTtcblxuICAgIC8vIC0tLS0gRmlsdGVyIGJhc2VsaW5lICsgc2xvdyBzd2VlcHMgLS0tLVxuICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5zZXRWYWx1ZUF0VGltZShGSUxURVJfQkFTRV9IWiwgdGhpcy5jdHguY3VycmVudFRpbWUpO1xuICAgIGNvbnN0IHN3ZWVwID0gKCkgPT4ge1xuICAgICAgY29uc3QgdCA9IHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICAgIC8vIHVwIHRoZW4gZG93biB1c2luZyB2ZXJ5IHNsb3cgdGltZSBjb25zdGFudHNcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5zZXRUYXJnZXRBdFRpbWUoXG4gICAgICAgIEZJTFRFUl9CQVNFX0haICsgKEZJTFRFUl9QRUFLX0haIC0gRklMVEVSX0JBU0VfSFopICogKDAuNCArIDAuNiAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpLFxuICAgICAgICB0LCBTV0VFUF9TRUdfUyAvIDNcbiAgICAgICk7XG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuc2V0VGFyZ2V0QXRUaW1lKFxuICAgICAgICBGSUxURVJfQkFTRV9IWiAqICgwLjcgKyAwLjMgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKSxcbiAgICAgICAgdCArIFNXRUVQX1NFR19TLCBTV0VFUF9TRUdfUyAvIDNcbiAgICAgICk7XG4gICAgICB0aGlzLnRpbWVvdXRzLnB1c2god2luZG93LnNldFRpbWVvdXQoKCkgPT4gdGhpcy5ydW5uaW5nICYmIHN3ZWVwKCksIChTV0VFUF9TRUdfUyAqIDIpICogMTAwMCkgYXMgdW5rbm93biBhcyBudW1iZXIpO1xuICAgIH07XG4gICAgc3dlZXAoKTtcblxuICAgIC8vIC0tLS0gR2VudGxlIExGTyBvbiBmaWx0ZXIgZnJlcSAoc21hbGwgZGVwdGgpIC0tLS1cbiAgICB0aGlzLmxmb05vZGUgPSBuZXcgT3NjaWxsYXRvck5vZGUodGhpcy5jdHgsIHsgdHlwZTogXCJzaW5lXCIsIGZyZXF1ZW5jeTogTEZPX1JBVEVfSFogfSk7XG4gICAgdGhpcy5sZm9HYWluID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IExGT19ERVBUSF9IWiAqICgwLjUgKyAwLjUgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKSB9KTtcbiAgICB0aGlzLmxmb05vZGUuY29ubmVjdCh0aGlzLmxmb0dhaW4pLmNvbm5lY3QodGhpcy5maWx0ZXIuZnJlcXVlbmN5KTtcbiAgICB0aGlzLmxmb05vZGUuc3RhcnQoKTtcblxuICAgIC8vIC0tLS0gU3Bhd24gcm9vdCBkcm9uZSAoZ2xpZGluZyB0byBkaWZmZXJlbnQgZGVncmVlcykgLS0tLVxuICAgIHRoaXMuc3Bhd25Sb290RHJvbmUoKTtcbiAgICB0aGlzLnNjaGVkdWxlTmV4dERyb25lTW92ZSgpO1xuXG4gICAgLy8gLS0tLSBDaG9yZCBjeWNsZSBsb29wIC0tLS1cbiAgICB0aGlzLmNob3JkQ3ljbGUoKTtcblxuICAgIC8vIGNsZWFudXBcbiAgICB0aGlzLnN0b3BGbnMucHVzaCgoKSA9PiB7XG4gICAgICB0cnkgeyB0aGlzLmxmb05vZGU/LnN0b3AoKTsgfSBjYXRjaCB7fVxuICAgICAgW3RoaXMubWFzdGVyLCB0aGlzLmZpbHRlciwgdGhpcy5kcnksIHRoaXMud2V0LCB0aGlzLmRlbGF5LCB0aGlzLmZlZWRiYWNrLCB0aGlzLmxmb05vZGUsIHRoaXMubGZvR2Fpbl1cbiAgICAgICAgLmZvckVhY2gobiA9PiB7IHRyeSB7IG4/LmRpc2Nvbm5lY3QoKTsgfSBjYXRjaCB7fSB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcblxuICAgIC8vIGNhbmNlbCB0aW1lb3V0c1xuICAgIHRoaXMudGltZW91dHMuc3BsaWNlKDApLmZvckVhY2goaWQgPT4gd2luZG93LmNsZWFyVGltZW91dChpZCkpO1xuXG4gICAgLy8gZmFkZSBhbmQgY2xlYW51cCB2b2ljZXNcbiAgICBpZiAodGhpcy5yb290Vm9pY2UpIHRoaXMucm9vdFZvaWNlLmZhZGVPdXRLaWxsKDEuMik7XG5cbiAgICAvLyBydW4gZGVmZXJyZWQgc3RvcHNcbiAgICB0aGlzLnN0b3BGbnMuc3BsaWNlKDApLmZvckVhY2goZm4gPT4gZm4oKSk7XG4gIH1cblxuICAvKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIE11c2ljYWwgZW5naW5lIGJlbG93IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gKi9cblxuICBwcml2YXRlIGN1cnJlbnREZWdyZWVzKCk6IG51bWJlcltdIHtcbiAgICByZXR1cm4gTU9ERVNbdGhpcy5tb2RlXSB8fCBNT0RFUy5MeWRpYW47XG4gIH1cblxuICAvKiogRHJvbmUgcm9vdCB2b2ljZSAqL1xuICBwcml2YXRlIHNwYXduUm9vdERyb25lKCkge1xuICAgIGNvbnN0IGJhc2VNaWRpID0gdGhpcy5rZXlSb290TWlkaSArIHRoaXMuY3VycmVudERlZ3JlZXMoKVt0aGlzLmRyb25lRGVncmVlSWR4XTtcbiAgICBjb25zdCB2ID0gbmV3IFZvaWNlKFxuICAgICAgdGhpcy5jdHgsXG4gICAgICBST09UX01BWF9HQUlOLFxuICAgICAgXCJzaW5lXCIsXG4gICAgICBtaWRpVG9GcmVxKGJhc2VNaWRpKSxcbiAgICAgIHRoaXMuZmlsdGVyLFxuICAgICAgdGhpcy5ybmdcbiAgICApO1xuICAgIHYuZmFkZUluKFJPT1RfU1dFTExfVElNRSk7XG4gICAgdGhpcy5yb290Vm9pY2UgPSB2O1xuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZU5leHREcm9uZU1vdmUoKSB7XG4gICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHJldHVybjtcbiAgICBjb25zdCB3YWl0TXMgPSByYW5kKHRoaXMucm5nLCBEUk9ORV9TSElGVF9NSU5fUywgRFJPTkVfU0hJRlRfTUFYX1MpICogMTAwMDtcbiAgICBjb25zdCBpZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICghdGhpcy5ydW5uaW5nIHx8ICF0aGlzLnJvb3RWb2ljZSkgcmV0dXJuO1xuICAgICAgY29uc3QgZ2xpZGUgPSByYW5kKHRoaXMucm5nLCBEUk9ORV9HTElERV9NSU5fUywgRFJPTkVfR0xJREVfTUFYX1MpO1xuICAgICAgY29uc3QgbmV4dElkeCA9IHRoaXMucGlja05leHREcm9uZURlZ3JlZUlkeCgpO1xuICAgICAgY29uc3QgdGFyZ2V0TWlkaSA9IHRoaXMua2V5Um9vdE1pZGkgKyB0aGlzLmN1cnJlbnREZWdyZWVzKClbbmV4dElkeF07XG4gICAgICB0aGlzLnJvb3RWb2ljZS5zZXRGcmVxR2xpZGUobWlkaVRvRnJlcSh0YXJnZXRNaWRpKSwgZ2xpZGUpO1xuICAgICAgdGhpcy5kcm9uZURlZ3JlZUlkeCA9IG5leHRJZHg7XG4gICAgICB0aGlzLnNjaGVkdWxlTmV4dERyb25lTW92ZSgpO1xuICAgIH0sIHdhaXRNcykgYXMgdW5rbm93biBhcyBudW1iZXI7XG4gICAgdGhpcy50aW1lb3V0cy5wdXNoKGlkKTtcbiAgfVxuXG4gIHByaXZhdGUgcGlja05leHREcm9uZURlZ3JlZUlkeCgpOiBudW1iZXIge1xuICAgIGNvbnN0IG9yZGVyID0gWy4uLlBSRUZFUlJFRF9ERUdSRUVfT1JERVJdO1xuICAgIGNvbnN0IGkgPSBvcmRlci5pbmRleE9mKHRoaXMuZHJvbmVEZWdyZWVJZHgpO1xuICAgIGlmIChpID49IDApIHsgY29uc3QgW2N1cl0gPSBvcmRlci5zcGxpY2UoaSwgMSk7IG9yZGVyLnB1c2goY3VyKTsgfVxuICAgIHJldHVybiBjaG9pY2UodGhpcy5ybmcsIG9yZGVyKTtcbiAgfVxuXG4gIC8qKiBCdWlsZCBkaWF0b25pYyBzdGFja2VkLXRoaXJkIGNob3JkIGRlZ3JlZXMgd2l0aCBvcHRpb25hbCBleHRlbnNpb25zICovXG4gIHByaXZhdGUgYnVpbGRDaG9yZERlZ3JlZXMobW9kZURlZ3M6IG51bWJlcltdLCByb290SW5kZXg6IG51bWJlciwgc2l6ZSA9IDQsIGFkZDkgPSBmYWxzZSwgYWRkMTEgPSBmYWxzZSwgYWRkMTMgPSBmYWxzZSkge1xuICAgIGNvbnN0IHN0ZXBzID0gWzAsIDIsIDQsIDZdOyAvLyB0aGlyZHMgb3ZlciA3LW5vdGUgc2NhbGVcbiAgICBjb25zdCBjaG9yZElkeHMgPSBzdGVwcy5zbGljZSgwLCBNYXRoLm1pbihzaXplLCA0KSkubWFwKHMgPT4gKHJvb3RJbmRleCArIHMpICUgNyk7XG4gICAgaWYgKGFkZDkpICBjaG9yZElkeHMucHVzaCgocm9vdEluZGV4ICsgOCkgJSA3KTtcbiAgICBpZiAoYWRkMTEpIGNob3JkSWR4cy5wdXNoKChyb290SW5kZXggKyAxMCkgJSA3KTtcbiAgICBpZiAoYWRkMTMpIGNob3JkSWR4cy5wdXNoKChyb290SW5kZXggKyAxMikgJSA3KTtcbiAgICByZXR1cm4gY2hvcmRJZHhzLm1hcChpID0+IG1vZGVEZWdzW2ldKTtcbiAgfVxuXG4gIHByaXZhdGUgKmVuZGxlc3NDaG9yZHMoKSB7XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGNvbnN0IG1vZGVEZWdzID0gdGhpcy5jdXJyZW50RGVncmVlcygpO1xuICAgICAgLy8gY2hvb3NlIGNob3JkIHJvb3QgZGVncmVlIChvZnRlbiBhbGlnbiB3aXRoIGRyb25lKVxuICAgICAgY29uc3Qgcm9vdERlZ3JlZUluZGV4ID0gKHRoaXMucm5nKCkgPCBDSE9SRF9BTkNIT1JfUFJPQikgPyB0aGlzLmRyb25lRGVncmVlSWR4IDogTWF0aC5mbG9vcih0aGlzLnJuZygpICogNyk7XG5cbiAgICAgIC8vIGNob3JkIHNpemUgLyBleHRlbnNpb25zXG4gICAgICBjb25zdCByID0gdGhpcy5ybmcoKTtcbiAgICAgIGxldCBzaXplID0gMzsgbGV0IGFkZDkgPSBmYWxzZSwgYWRkMTEgPSBmYWxzZSwgYWRkMTMgPSBmYWxzZTtcbiAgICAgIGlmIChyIDwgMC4zNSkgICAgICAgICAgICB7IHNpemUgPSAzOyB9XG4gICAgICBlbHNlIGlmIChyIDwgMC43NSkgICAgICAgeyBzaXplID0gNDsgfVxuICAgICAgZWxzZSBpZiAociA8IDAuOTApICAgICAgIHsgc2l6ZSA9IDQ7IGFkZDkgPSB0cnVlOyB9XG4gICAgICBlbHNlIGlmIChyIDwgMC45NykgICAgICAgeyBzaXplID0gNDsgYWRkMTEgPSB0cnVlOyB9XG4gICAgICBlbHNlICAgICAgICAgICAgICAgICAgICAgeyBzaXplID0gNDsgYWRkMTMgPSB0cnVlOyB9XG5cbiAgICAgIGNvbnN0IGNob3JkU2VtaXMgPSB0aGlzLmJ1aWxkQ2hvcmREZWdyZWVzKG1vZGVEZWdzLCByb290RGVncmVlSW5kZXgsIHNpemUsIGFkZDksIGFkZDExLCBhZGQxMyk7XG4gICAgICAvLyBzcHJlYWQgY2hvcmQgYWNyb3NzIG9jdGF2ZXMgKC0xMiwgMCwgKzEyKSwgYmlhcyB0byBjZW50ZXJcbiAgICAgIGNvbnN0IHNwcmVhZCA9IGNob3JkU2VtaXMubWFwKHNlbWkgPT4gc2VtaSArIGNob2ljZSh0aGlzLnJuZywgWy0xMiwgMCwgMCwgMTJdKSk7XG5cbiAgICAgIC8vIG9jY2FzaW9uYWxseSBlbnN1cmUgdG9uaWMgaXMgcHJlc2VudCBmb3IgZ3JvdW5kaW5nXG4gICAgICBpZiAoIXNwcmVhZC5pbmNsdWRlcygwKSAmJiB0aGlzLnJuZygpIDwgMC41KSBzcHJlYWQucHVzaCgwKTtcblxuICAgICAgeWllbGQgc3ByZWFkO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hvcmRDeWNsZSgpIHtcbiAgICBjb25zdCBnZW4gPSB0aGlzLmVuZGxlc3NDaG9yZHMoKTtcbiAgICBjb25zdCB2b2ljZXMgPSBuZXcgU2V0PFZvaWNlPigpO1xuXG4gICAgY29uc3Qgc2xlZXAgPSAobXM6IG51bWJlcikgPT4gbmV3IFByb21pc2U8dm9pZD4ociA9PiB7XG4gICAgICBjb25zdCBpZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHIoKSwgbXMpIGFzIHVua25vd24gYXMgbnVtYmVyO1xuICAgICAgdGhpcy50aW1lb3V0cy5wdXNoKGlkKTtcbiAgICB9KTtcblxuICAgIHdoaWxlICh0aGlzLnJ1bm5pbmcpIHtcbiAgICAgIC8vIGNob3JkIHNwYXduIHByb2JhYmlsaXR5IC8gdGhpY2tuZXNzIHNjYWxlIHdpdGggZGVuc2l0eSAmIGJyaWdodG5lc3NcbiAgICAgIGNvbnN0IHRoaWNrbmVzcyA9IE1hdGgucm91bmQoMiArIHRoaXMucGFyYW1zLmRlbnNpdHkgKiAzKTtcbiAgICAgIGNvbnN0IGJhc2VNaWRpID0gdGhpcy5rZXlSb290TWlkaTtcbiAgICAgIGNvbnN0IGRlZ3JlZXNPZmY6IG51bWJlcltdID0gZ2VuLm5leHQoKS52YWx1ZSA/PyBbXTtcblxuICAgICAgLy8gc3Bhd25cbiAgICAgIGZvciAoY29uc3Qgb2ZmIG9mIGRlZ3JlZXNPZmYpIHtcbiAgICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcpIGJyZWFrO1xuICAgICAgICBpZiAodm9pY2VzLnNpemUgPj0gTWF0aC5taW4oQ0hPUkRfVk9JQ0VTX01BWCwgdGhpY2tuZXNzKSkgYnJlYWs7XG5cbiAgICAgICAgY29uc3QgbWlkaSA9IGJhc2VNaWRpICsgb2ZmO1xuICAgICAgICBjb25zdCBmcmVxID0gbWlkaVRvRnJlcShtaWRpKTtcbiAgICAgICAgY29uc3Qgd2F2ZWZvcm0gPSBjaG9pY2UodGhpcy5ybmcsIFtcInNpbmVcIiwgXCJ0cmlhbmdsZVwiLCBcInNhd3Rvb3RoXCJdIGFzIE9zY2lsbGF0b3JUeXBlW10pO1xuXG4gICAgICAgIC8vIGxvdWRlciB3aXRoIGludGVuc2l0eTsgc2xpZ2h0bHkgYnJpZ2h0ZXIgLT4gc2xpZ2h0bHkgbG91ZGVyXG4gICAgICAgIGNvbnN0IGdhaW5UYXJnZXQgPSByYW5kKHRoaXMucm5nLCAwLjA4LCAwLjIyKSAqXG4gICAgICAgICAgKDAuODUgKyAwLjMgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHkpICpcbiAgICAgICAgICAoMC45ICsgMC4yICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyk7XG5cbiAgICAgICAgY29uc3QgdiA9IG5ldyBWb2ljZSh0aGlzLmN0eCwgZ2FpblRhcmdldCwgd2F2ZWZvcm0sIGZyZXEsIHRoaXMuZmlsdGVyLCB0aGlzLnJuZyk7XG4gICAgICAgIHZvaWNlcy5hZGQodik7XG4gICAgICAgIHYuZmFkZUluKHJhbmQodGhpcy5ybmcsIENIT1JEX0ZBREVfTUlOX1MsIENIT1JEX0ZBREVfTUFYX1MpKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgc2xlZXAocmFuZCh0aGlzLnJuZywgQ0hPUkRfSE9MRF9NSU5fUywgQ0hPUkRfSE9MRF9NQVhfUykgKiAxMDAwKTtcblxuICAgICAgLy8gZmFkZSBvdXRcbiAgICAgIGNvbnN0IG91dHMgPSBBcnJheS5mcm9tKHZvaWNlcyk7XG4gICAgICBmb3IgKGNvbnN0IHYgb2Ygb3V0cykgdi5mYWRlT3V0S2lsbChyYW5kKHRoaXMucm5nLCBDSE9SRF9GQURFX01JTl9TLCBDSE9SRF9GQURFX01BWF9TKSk7XG4gICAgICB2b2ljZXMuY2xlYXIoKTtcblxuICAgICAgYXdhaXQgc2xlZXAocmFuZCh0aGlzLnJuZywgQ0hPUkRfR0FQX01JTl9TLCBDSE9SRF9HQVBfTUFYX1MpICogMTAwMCk7XG4gICAgfVxuXG4gICAgLy8gc2FmZXR5OiBraWxsIGFueSBsaW5nZXJpbmcgdm9pY2VzXG4gICAgZm9yIChjb25zdCB2IG9mIEFycmF5LmZyb20odm9pY2VzKSkgdi5mYWRlT3V0S2lsbCgwLjgpO1xuICB9XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTY2VuZU5hbWUsIE11c2ljU2NlbmVPcHRpb25zIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuLi9lbmdpbmVcIjtcbmltcG9ydCB7IEFtYmllbnRTY2VuZSB9IGZyb20gXCIuL3NjZW5lcy9hbWJpZW50XCI7XG5cbmV4cG9ydCBjbGFzcyBNdXNpY0RpcmVjdG9yIHtcbiAgcHJpdmF0ZSBjdXJyZW50PzogeyBuYW1lOiBTY2VuZU5hbWU7IHN0b3A6ICgpID0+IHZvaWQgfTtcbiAgcHJpdmF0ZSBidXNPdXQ6IEdhaW5Ob2RlO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZW5naW5lOiBBdWRpb0VuZ2luZSkge1xuICAgIHRoaXMuYnVzT3V0ID0gbmV3IEdhaW5Ob2RlKGVuZ2luZS5jdHgsIHsgZ2FpbjogMC45IH0pO1xuICAgIHRoaXMuYnVzT3V0LmNvbm5lY3QoZW5naW5lLmdldE11c2ljQnVzKCkpO1xuICB9XG5cbiAgLyoqIENyb3NzZmFkZSB0byBhIG5ldyBzY2VuZSAqL1xuICBzZXRTY2VuZShuYW1lOiBTY2VuZU5hbWUsIG9wdHM/OiBNdXNpY1NjZW5lT3B0aW9ucykge1xuICAgIGlmICh0aGlzLmN1cnJlbnQ/Lm5hbWUgPT09IG5hbWUpIHJldHVybjtcblxuICAgIGNvbnN0IG9sZCA9IHRoaXMuY3VycmVudDtcbiAgICBjb25zdCB0ID0gdGhpcy5lbmdpbmUubm93O1xuXG4gICAgLy8gZmFkZS1vdXQgb2xkXG4gICAgY29uc3QgZmFkZU91dCA9IG5ldyBHYWluTm9kZSh0aGlzLmVuZ2luZS5jdHgsIHsgZ2FpbjogMC45IH0pO1xuICAgIGZhZGVPdXQuY29ubmVjdCh0aGlzLmVuZ2luZS5nZXRNdXNpY0J1cygpKTtcbiAgICBpZiAob2xkKSB7XG4gICAgICAvLyBXZSBhc3N1bWUgZWFjaCBzY2VuZSBtYW5hZ2VzIGl0cyBvd24gb3V0IG5vZGU7IHN0b3BwaW5nIHRyaWdnZXJzIGEgbmF0dXJhbCB0YWlsLlxuICAgICAgb2xkLnN0b3AoKTtcbiAgICAgIGZhZGVPdXQuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjAsIHQgKyAwLjYpO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiBmYWRlT3V0LmRpc2Nvbm5lY3QoKSwgNjUwKTtcbiAgICB9XG5cbiAgICAvLyBuZXcgc2NlbmVcbiAgICBjb25zdCBzY2VuZU91dCA9IG5ldyBHYWluTm9kZSh0aGlzLmVuZ2luZS5jdHgsIHsgZ2FpbjogMCB9KTtcbiAgICBzY2VuZU91dC5jb25uZWN0KHRoaXMuYnVzT3V0KTtcblxuICAgIGxldCBzdG9wID0gKCkgPT4gc2NlbmVPdXQuZGlzY29ubmVjdCgpO1xuXG4gICAgaWYgKG5hbWUgPT09IFwiYW1iaWVudFwiKSB7XG4gICAgICBjb25zdCBzID0gbmV3IEFtYmllbnRTY2VuZSh0aGlzLmVuZ2luZS5jdHgsIHNjZW5lT3V0LCBvcHRzPy5zZWVkID8/IDEpO1xuICAgICAgcy5zdGFydCgpO1xuICAgICAgc3RvcCA9ICgpID0+IHtcbiAgICAgICAgcy5zdG9wKCk7XG4gICAgICAgIHNjZW5lT3V0LmRpc2Nvbm5lY3QoKTtcbiAgICAgIH07XG4gICAgfVxuICAgIC8vIGVsc2UgaWYgKG5hbWUgPT09IFwiY29tYmF0XCIpIHsgLyogaW1wbGVtZW50IGNvbWJhdCBzY2VuZSBsYXRlciAqLyB9XG4gICAgLy8gZWxzZSBpZiAobmFtZSA9PT0gXCJsb2JieVwiKSB7IC8qIGltcGxlbWVudCBsb2JieSBzY2VuZSBsYXRlciAqLyB9XG5cbiAgICB0aGlzLmN1cnJlbnQgPSB7IG5hbWUsIHN0b3AgfTtcbiAgICBzY2VuZU91dC5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuOSwgdCArIDAuNik7XG4gIH1cblxuICBzdG9wKCkge1xuICAgIGlmICghdGhpcy5jdXJyZW50KSByZXR1cm47XG4gICAgdGhpcy5jdXJyZW50LnN0b3AoKTtcbiAgICB0aGlzLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gIH1cbn1cbiIsICJpbXBvcnQgdHlwZSB7IEJ1cywgTXVzaWNQYXJhbU1lc3NhZ2UsIE11c2ljU2NlbmVPcHRpb25zIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBNdXNpY0RpcmVjdG9yIH0gZnJvbSBcIi4vbXVzaWNcIjtcbmltcG9ydCB7IHBsYXlTZnggfSBmcm9tIFwiLi9zZnhcIjtcblxuLyoqXG4gKiBCaW5kIHN0YW5kYXJkIGF1ZGlvIGV2ZW50cyB0byB0aGUgZW5naW5lIGFuZCBtdXNpYyBkaXJlY3Rvci5cbiAqXG4gKiBFdmVudHMgc3VwcG9ydGVkOlxuICogIC0gYXVkaW86cmVzdW1lXG4gKiAgLSBhdWRpbzptdXRlIC8gYXVkaW86dW5tdXRlXG4gKiAgLSBhdWRpbzpzZXQtbWFzdGVyLWdhaW4geyBnYWluIH1cbiAqICAtIGF1ZGlvOnNmeCB7IG5hbWUsIHZlbG9jaXR5PywgcGFuPyB9XG4gKiAgLSBhdWRpbzptdXNpYzpzZXQtc2NlbmUgeyBzY2VuZSwgc2VlZD8gfVxuICogIC0gYXVkaW86bXVzaWM6cGFyYW0geyBrZXksIHZhbHVlIH1cbiAqICAtIGF1ZGlvOm11c2ljOnRyYW5zcG9ydCB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfSAgLy8gcGF1c2UgY3VycmVudGx5IG1hcHMgdG8gc3RvcFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJBdWRpb0J1c0JpbmRpbmdzKFxuICBidXM6IEJ1cyxcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgbXVzaWM6IE11c2ljRGlyZWN0b3Jcbik6IHZvaWQge1xuICBidXMub24oXCJhdWRpbzpyZXN1bWVcIiwgKCkgPT4gZW5naW5lLnJlc3VtZSgpKTtcbiAgYnVzLm9uKFwiYXVkaW86bXV0ZVwiLCAoKSA9PiBlbmdpbmUuc2V0TWFzdGVyR2FpbigwKSk7XG4gIGJ1cy5vbihcImF1ZGlvOnVubXV0ZVwiLCAoKSA9PiBlbmdpbmUuc2V0TWFzdGVyR2FpbigwLjkpKTtcbiAgYnVzLm9uKFwiYXVkaW86c2V0LW1hc3Rlci1nYWluXCIsICh7IGdhaW4gfTogeyBnYWluOiBudW1iZXIgfSkgPT5cbiAgICBlbmdpbmUuc2V0TWFzdGVyR2FpbihNYXRoLm1heCgwLCBNYXRoLm1pbigxLCBnYWluKSkpXG4gICk7XG5cbiAgYnVzLm9uKFwiYXVkaW86c2Z4XCIsIChtc2c6IHsgbmFtZTogc3RyaW5nOyB2ZWxvY2l0eT86IG51bWJlcjsgcGFuPzogbnVtYmVyIH0pID0+IHtcbiAgICBwbGF5U2Z4KGVuZ2luZSwgbXNnLm5hbWUgYXMgYW55LCB7IHZlbG9jaXR5OiBtc2cudmVsb2NpdHksIHBhbjogbXNnLnBhbiB9KTtcbiAgfSk7XG5cbiAgYnVzLm9uKFwiYXVkaW86bXVzaWM6c2V0LXNjZW5lXCIsIChtc2c6IHsgc2NlbmU6IHN0cmluZyB9ICYgTXVzaWNTY2VuZU9wdGlvbnMpID0+IHtcbiAgICBlbmdpbmUucmVzdW1lKCk7XG4gICAgbXVzaWMuc2V0U2NlbmUobXNnLnNjZW5lIGFzIGFueSwgeyBzZWVkOiBtc2cuc2VlZCB9KTtcbiAgfSk7XG5cbiAgYnVzLm9uKFwiYXVkaW86bXVzaWM6cGFyYW1cIiwgKF9tc2c6IE11c2ljUGFyYW1NZXNzYWdlKSA9PiB7XG4gICAgLy8gSG9vayBmb3IgZnV0dXJlIHBhcmFtIHJvdXRpbmcgcGVyIHNjZW5lIChlLmcuLCBpbnRlbnNpdHkvYnJpZ2h0bmVzcy9kZW5zaXR5KVxuICAgIC8vIElmIHlvdSB3YW50IGdsb2JhbCBwYXJhbXMsIGtlZXAgYSBtYXAgaGVyZSBhbmQgZm9yd2FyZCB0byB0aGUgYWN0aXZlIHNjZW5lXG4gIH0pO1xuXG4gIGJ1cy5vbihcImF1ZGlvOm11c2ljOnRyYW5zcG9ydFwiLCAoeyBjbWQgfTogeyBjbWQ6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJwYXVzZVwiIH0pID0+IHtcbiAgICBpZiAoY21kID09PSBcInN0b3BcIiB8fCBjbWQgPT09IFwicGF1c2VcIikgbXVzaWMuc3RvcCgpO1xuICAgIC8vIFwic3RhcnRcIiBpcyBpbXBsaWNpdCB2aWEgc2V0U2NlbmVcbiAgfSk7XG59XG4iLCAiaW1wb3J0IHsgY3JlYXRlRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7IGNvbm5lY3RXZWJTb2NrZXQsIHNlbmRNZXNzYWdlIH0gZnJvbSBcIi4vbmV0XCI7XG5pbXBvcnQgeyBpbml0R2FtZSB9IGZyb20gXCIuL2dhbWVcIjtcbmltcG9ydCB7IGNyZWF0ZUluaXRpYWxTdGF0ZSwgY3JlYXRlSW5pdGlhbFVJU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHsgbW91bnRUdXRvcmlhbCwgQkFTSUNfVFVUT1JJQUxfSUQgfSBmcm9tIFwiLi90dXRvcmlhbFwiO1xuaW1wb3J0IHsgY2xlYXJQcm9ncmVzcyBhcyBjbGVhclR1dG9yaWFsUHJvZ3Jlc3MgfSBmcm9tIFwiLi90dXRvcmlhbC9zdG9yYWdlXCI7XG5pbXBvcnQgeyBtb3VudFN0b3J5LCBJTlRST19DSEFQVEVSX0lELCBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUyB9IGZyb20gXCIuL3N0b3J5XCI7XG5pbXBvcnQgeyB3YWl0Rm9yVXNlclN0YXJ0IH0gZnJvbSBcIi4vc3RhcnQtZ2F0ZVwiO1xuaW1wb3J0IHsgcmVzdW1lQXVkaW8gfSBmcm9tIFwiLi9zdG9yeS9zZnhcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4vYXVkaW8vZW5naW5lXCI7XG5pbXBvcnQgeyBNdXNpY0RpcmVjdG9yIH0gZnJvbSBcIi4vYXVkaW8vbXVzaWNcIjtcbmltcG9ydCB7IHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyB9IGZyb20gXCIuL2F1ZGlvL2N1ZXNcIjtcblxuY29uc3QgQ0FMTF9TSUdOX1NUT1JBR0VfS0VZID0gXCJsc2Q6Y2FsbHNpZ25cIjtcblxuKGFzeW5jIGZ1bmN0aW9uIGJvb3RzdHJhcCgpIHtcbiAgY29uc3QgcXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuICBjb25zdCByb29tID0gcXMuZ2V0KFwicm9vbVwiKSB8fCBcImRlZmF1bHRcIjtcbiAgY29uc3QgbW9kZSA9IHFzLmdldChcIm1vZGVcIikgfHwgXCJcIjtcbiAgY29uc3QgbmFtZVBhcmFtID0gc2FuaXRpemVDYWxsU2lnbihxcy5nZXQoXCJuYW1lXCIpKTtcbiAgY29uc3Qgc3RvcmVkTmFtZSA9IHNhbml0aXplQ2FsbFNpZ24ocmVhZFN0b3JlZENhbGxTaWduKCkpO1xuICBjb25zdCBjYWxsU2lnbiA9IG5hbWVQYXJhbSB8fCBzdG9yZWROYW1lO1xuICBjb25zdCBtYXBXID0gcGFyc2VGbG9hdChxcy5nZXQoXCJtYXBXXCIpIHx8IFwiODAwMFwiKTtcbiAgY29uc3QgbWFwSCA9IHBhcnNlRmxvYXQocXMuZ2V0KFwibWFwSFwiKSB8fCBcIjQ1MDBcIik7XG5cbiAgaWYgKG5hbWVQYXJhbSAmJiBuYW1lUGFyYW0gIT09IHN0b3JlZE5hbWUpIHtcbiAgICBwZXJzaXN0Q2FsbFNpZ24obmFtZVBhcmFtKTtcbiAgfVxuXG4gIC8vIEdhdGUgZXZlcnl0aGluZyBvbiBhIHVzZXIgZ2VzdHVyZSAoY2VudHJlZCBidXR0b24pXG4gIGF3YWl0IHdhaXRGb3JVc2VyU3RhcnQoe1xuICAgIGxhYmVsOiBcIlN0YXJ0IEdhbWVcIixcbiAgICByZXF1ZXN0RnVsbHNjcmVlbjogZmFsc2UsICAgLy8gZmxpcCB0byB0cnVlIGlmIHlvdSB3YW50IGZ1bGxzY3JlZW5cbiAgICByZXN1bWVBdWRpbywgICAgICAgICAgICAgICAgLy8gdXNlcyBzdG9yeS9zZngudHNcbiAgfSk7XG5cbiAgLy8gLS0tLSBTdGFydCBhY3R1YWwgYXBwIGFmdGVyIGdlc3R1cmUgLS0tLVxuICBjb25zdCBzdGF0ZSA9IGNyZWF0ZUluaXRpYWxTdGF0ZSgpO1xuICBjb25zdCB1aVN0YXRlID0gY3JlYXRlSW5pdGlhbFVJU3RhdGUoKTtcbiAgY29uc3QgYnVzID0gY3JlYXRlRXZlbnRCdXMoKTtcblxuICAvLyAtLS0gQVVESU86IGVuZ2luZSArIGJpbmRpbmdzICsgZGVmYXVsdCBzY2VuZSAtLS1cbiAgY29uc3QgZW5naW5lID0gQXVkaW9FbmdpbmUuZ2V0KCk7XG4gIGF3YWl0IGVuZ2luZS5yZXN1bWUoKTsgLy8gc2FmZSBwb3N0LWdlc3R1cmVcbiAgY29uc3QgbXVzaWMgPSBuZXcgTXVzaWNEaXJlY3RvcihlbmdpbmUpO1xuICByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MoYnVzIGFzIGFueSwgZW5naW5lLCBtdXNpYyk7XG5cbiAgLy8gU3RhcnQgYSBkZWZhdWx0IG11c2ljIHNjZW5lIChhZGp1c3Qgc2VlZC9zY2VuZSBhcyB5b3UgbGlrZSlcbiAgYnVzLmVtaXQoXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIiwgeyBzY2VuZTogXCJhbWJpZW50XCIsIHNlZWQ6IDQyIH0pO1xuXG4gIC8vIE9wdGlvbmFsOiBiYXNpYyBob29rcyB0byBkZW1vbnN0cmF0ZSBTRlggJiBkdWNraW5nXG4gIC8vIGJ1cy5vbihcImRpYWxvZ3VlOm9wZW5lZFwiLCAoKSA9PiBlbmdpbmUuZHVja011c2ljKDAuMzUsIDAuMSkpO1xuICAvLyBidXMub24oXCJkaWFsb2d1ZTpjbG9zZWRcIiwgKCkgPT4gZW5naW5lLnVuZHVja011c2ljKDAuMjUpKTtcblxuICAvLyBFeGFtcGxlIGdhbWUgU0ZYIHdpcmluZyAoYWRhcHQgdG8geW91ciBhY3R1YWwgZXZlbnRzKVxuICBidXMub24oXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCAoeyB2YWx1ZSB9KSA9PiB7XG4gICAgaWYgKHZhbHVlID4gMCkgYnVzLmVtaXQoXCJhdWRpbzpzZnhcIiwgeyBuYW1lOiBcInRocnVzdFwiLCB2ZWxvY2l0eTogTWF0aC5taW4oMSwgdmFsdWUpIH0pO1xuICB9KTtcblxuICBjb25zdCBnYW1lID0gaW5pdEdhbWUoeyBzdGF0ZSwgdWlTdGF0ZSwgYnVzIH0pO1xuXG4gIC8vIE1vdW50IHR1dG9yaWFsIGFuZCBzdG9yeSBiYXNlZCBvbiBnYW1lIG1vZGVcbiAgY29uc3QgZW5hYmxlVHV0b3JpYWwgPSBtb2RlID09PSBcImNhbXBhaWduXCIgfHwgbW9kZSA9PT0gXCJ0dXRvcmlhbFwiO1xuICBjb25zdCBlbmFibGVTdG9yeSA9IG1vZGUgPT09IFwiY2FtcGFpZ25cIjtcblxuICBsZXQgdHV0b3JpYWw6IFJldHVyblR5cGU8dHlwZW9mIG1vdW50VHV0b3JpYWw+IHwgbnVsbCA9IG51bGw7XG4gIGxldCB0dXRvcmlhbFN0YXJ0ZWQgPSBmYWxzZTtcblxuICBpZiAoZW5hYmxlVHV0b3JpYWwpIHtcbiAgICB0dXRvcmlhbCA9IG1vdW50VHV0b3JpYWwoYnVzKTtcbiAgfVxuXG4gIGNvbnN0IHN0YXJ0VHV0b3JpYWwgPSAoKTogdm9pZCA9PiB7XG4gICAgaWYgKCF0dXRvcmlhbCB8fCB0dXRvcmlhbFN0YXJ0ZWQpIHJldHVybjtcbiAgICB0dXRvcmlhbFN0YXJ0ZWQgPSB0cnVlO1xuICAgIGNsZWFyVHV0b3JpYWxQcm9ncmVzcyhCQVNJQ19UVVRPUklBTF9JRCk7XG4gICAgdHV0b3JpYWwuc3RhcnQoeyByZXN1bWU6IGZhbHNlIH0pO1xuICB9O1xuXG4gIGlmIChlbmFibGVTdG9yeSkge1xuICAgIC8vIENhbXBhaWduIG1vZGU6IHN0b3J5ICsgdHV0b3JpYWxcbiAgICBjb25zdCB1bnN1YnNjcmliZVN0b3J5Q2xvc2VkID0gYnVzLm9uKFwiZGlhbG9ndWU6Y2xvc2VkXCIsICh7IGNoYXB0ZXJJZCwgbm9kZUlkIH0pID0+IHtcbiAgICAgIGlmIChjaGFwdGVySWQgIT09IElOVFJPX0NIQVBURVJfSUQpIHJldHVybjtcbiAgICAgIGlmICghSU5UUk9fSU5JVElBTF9SRVNQT05TRV9JRFMuaW5jbHVkZXMobm9kZUlkIGFzIHR5cGVvZiBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEU1tudW1iZXJdKSkgcmV0dXJuO1xuICAgICAgdW5zdWJzY3JpYmVTdG9yeUNsb3NlZCgpO1xuICAgICAgc3RhcnRUdXRvcmlhbCgpO1xuICAgIH0pO1xuICAgIG1vdW50U3RvcnkoeyBidXMsIHJvb21JZDogcm9vbSB9KTtcbiAgfSBlbHNlIGlmIChtb2RlID09PSBcInR1dG9yaWFsXCIpIHtcbiAgICAvLyBUdXRvcmlhbCBtb2RlOiBhdXRvLXN0YXJ0IHR1dG9yaWFsIHdpdGhvdXQgc3RvcnlcbiAgICBzdGFydFR1dG9yaWFsKCk7XG4gIH1cbiAgLy8gRnJlZSBwbGF5IGFuZCBkZWZhdWx0OiBubyBzeXN0ZW1zIG1vdW50ZWRcblxuICBjb25uZWN0V2ViU29ja2V0KHtcbiAgICByb29tLFxuICAgIHN0YXRlLFxuICAgIGJ1cyxcbiAgICBtYXBXLFxuICAgIG1hcEgsXG4gICAgb25TdGF0ZVVwZGF0ZWQ6ICgpID0+IGdhbWUub25TdGF0ZVVwZGF0ZWQoKSxcbiAgICBvbk9wZW46ICgpID0+IHtcbiAgICAgIGNvbnN0IG5hbWVUb1NlbmQgPSBjYWxsU2lnbiB8fCBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgICAgIGlmIChuYW1lVG9TZW5kKSBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiam9pblwiLCBuYW1lOiBuYW1lVG9TZW5kIH0pO1xuICAgIH0sXG4gIH0pO1xuXG4gIC8vIE9wdGlvbmFsOiBzdXNwZW5kL3Jlc3VtZSBhdWRpbyBvbiB0YWIgdmlzaWJpbGl0eSB0byBzYXZlIENQVVxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwidmlzaWJpbGl0eWNoYW5nZVwiLCAoKSA9PiB7XG4gICAgaWYgKGRvY3VtZW50LnZpc2liaWxpdHlTdGF0ZSA9PT0gXCJoaWRkZW5cIikge1xuICAgICAgdm9pZCBlbmdpbmUuc3VzcGVuZCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2b2lkIGVuZ2luZS5yZXN1bWUoKTtcbiAgICB9XG4gIH0pO1xufSkoKTtcblxuZnVuY3Rpb24gc2FuaXRpemVDYWxsU2lnbih2YWx1ZTogc3RyaW5nIHwgbnVsbCk6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHJldHVybiBcIlwiO1xuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHJldHVybiBcIlwiO1xuICByZXR1cm4gdHJpbW1lZC5zbGljZSgwLCAyNCk7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RDYWxsU2lnbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBpZiAobmFtZSkgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSwgbmFtZSk7XG4gICAgZWxzZSB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZKTtcbiAgfSBjYXRjaCB7fVxufVxuXG5mdW5jdGlvbiByZWFkU3RvcmVkQ2FsbFNpZ24oKTogc3RyaW5nIHtcbiAgdHJ5IHsgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVkpID8/IFwiXCI7IH1cbiAgY2F0Y2ggeyByZXR1cm4gXCJcIjsgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7O0FBOEVPLFdBQVMsaUJBQTJCO0FBQ3pDLFVBQU0sV0FBVyxvQkFBSSxJQUE2QjtBQUNsRCxXQUFPO0FBQUEsTUFDTCxHQUFHLE9BQU8sU0FBUztBQUNqQixZQUFJLE1BQU0sU0FBUyxJQUFJLEtBQUs7QUFDNUIsWUFBSSxDQUFDLEtBQUs7QUFDUixn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O0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFP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USxNQUFNLEdBQUcsRUFBRTtBQUFBLEVBQzVCO0FBRUEsV0FBUyxnQkFBZ0IsTUFBb0I7QUFDM0MsUUFBSTtBQUNGLFVBQUksS0FBTSxRQUFPLGFBQWEsUUFBUSx1QkFBdUIsSUFBSTtBQUFBLFVBQzVELFFBQU8sYUFBYSxXQUFXLHFCQUFxQjtBQUFBLElBQzNELFNBQVE7QUFBQSxJQUFDO0FBQUEsRUFDWDtBQUVBLFdBQVMscUJBQTZCO0FBbkl0QztBQW9JRSxRQUFJO0FBQUUsY0FBTyxZQUFPLGFBQWEsUUFBUSxxQkFBcUIsTUFBakQsWUFBc0Q7QUFBQSxJQUFJLFNBQ2pFO0FBQUUsYUFBTztBQUFBLElBQUk7QUFBQSxFQUNyQjsiLAogICJuYW1lcyI6IFsid29ybGQiLCAid29ybGRUb0NhbnZhcyIsICJjdHgiLCAic2VsZWN0aW9uIiwgImRyYWdnZWRXYXlwb2ludCIsICJkZWZhdWx0U3BlZWQiLCAiX2EiLCAiX2IiLCAic2VsZWN0aW9uIiwgIl9hIiwgIlNUWUxFX0lEIiwgImVuc3VyZVN0eWxlcyIsICJjaG9pY2UiLCAiX2EiLCAiU1RPUkFHRV9QUkVGSVgiLCAiZ2V0U3RvcmFnZSIsICJjdHgiLCAiY3R4IiwgImNsYW1wIiwgImNob2ljZSIsICJfYSIsICJjdHgiLCAicmVzdW1lQXVkaW8iLCAiY3R4Il0KfQo=
