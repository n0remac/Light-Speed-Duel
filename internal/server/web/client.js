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
    waypointStrokeSelected: "#854d0e"
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
        if (isSelected) {
          strokeStyle = palette.selection;
          lineWidth = 3.5;
          ctx2.setLineDash([4, 4]);
        } else if (heatProjection && heatParams && palette.heatCoolRgb && palette.heatHotRgb) {
          const heatRatio = clamp(segmentHeat / heatParams.overheatAt, 0, 1);
          const color = interpolateColor(palette.heatCoolRgb, palette.heatHotRgb, heatRatio);
          const baseWidth = isFirstLeg ? 3 : 1.5;
          lineWidth = baseWidth + heatRatio * 4;
          const alpha = isFirstLeg ? 1 : 0.4;
          strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
          ctx2.setLineDash(isFirstLeg ? [6, 6] : [8, 8]);
        } else {
          const baseWidth = isFirstLeg ? 3 : 1.5;
          lineWidth = baseWidth;
          strokeStyle = isFirstLeg ? palette.defaultLine : `${palette.defaultLine}66`;
          ctx2.setLineDash(isFirstLeg ? [6, 6] : [8, 8]);
        }
        ctx2.save();
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
    if (sliderValue !== null) {
      missileSpeedSlider.disabled = false;
      missileSpeedSlider.value = sliderValue.toFixed(0);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAic3JjL25ldC50cyIsICJzcmMvcm91dGUudHMiLCAic3JjL2dhbWUudHMiLCAic3JjL3R1dG9yaWFsL2hpZ2hsaWdodC50cyIsICJzcmMvdHV0b3JpYWwvc3RvcmFnZS50cyIsICJzcmMvdHV0b3JpYWwvcm9sZXMudHMiLCAic3JjL3R1dG9yaWFsL2VuZ2luZS50cyIsICJzcmMvdHV0b3JpYWwvc3RlcHNfYmFzaWMudHMiLCAic3JjL3R1dG9yaWFsL2luZGV4LnRzIiwgInNyYy9zdG9yeS9vdmVybGF5LnRzIiwgInNyYy9zdG9yeS9zdG9yYWdlLnRzIiwgInNyYy9hdWRpby9lbmdpbmUudHMiLCAic3JjL2F1ZGlvL2dyYXBoLnRzIiwgInNyYy9hdWRpby9zZngudHMiLCAic3JjL3N0b3J5L3NmeC50cyIsICJzcmMvc3RvcnkvZW5naW5lLnRzIiwgInNyYy9zdG9yeS9jaGFwdGVycy9pbnRyby50cyIsICJzcmMvc3RvcnkvaW5kZXgudHMiLCAic3JjL3N0YXJ0LWdhdGUudHMiLCAic3JjL2F1ZGlvL211c2ljL3NjZW5lcy9hbWJpZW50LnRzIiwgInNyYy9hdWRpby9tdXNpYy9pbmRleC50cyIsICJzcmMvYXVkaW8vY3Vlcy50cyIsICJzcmMvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IHR5cGUgU2hpcENvbnRleHQgPSBcInNoaXBcIiB8IFwibWlzc2lsZVwiO1xuZXhwb3J0IHR5cGUgU2hpcFRvb2wgPSBcInNldFwiIHwgXCJzZWxlY3RcIiB8IG51bGw7XG5leHBvcnQgdHlwZSBNaXNzaWxlVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcblxuZXhwb3J0IGludGVyZmFjZSBFdmVudE1hcCB7XG4gIFwiY29udGV4dDpjaGFuZ2VkXCI6IHsgY29udGV4dDogU2hpcENvbnRleHQgfTtcbiAgXCJzaGlwOnRvb2xDaGFuZ2VkXCI6IHsgdG9vbDogU2hpcFRvb2wgfTtcbiAgXCJzaGlwOndheXBvaW50QWRkZWRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwic2hpcDp3YXlwb2ludE1vdmVkXCI6IHsgaW5kZXg6IG51bWJlcjsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJzaGlwOmxlZ1NlbGVjdGVkXCI6IHsgaW5kZXg6IG51bWJlciB8IG51bGwgfTtcbiAgXCJzaGlwOndheXBvaW50RGVsZXRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIjogdm9pZDtcbiAgXCJzaGlwOmNsZWFySW52b2tlZFwiOiB2b2lkO1xuICBcInNoaXA6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcInNoaXA6aGVhdFByb2plY3Rpb25VcGRhdGVkXCI6IHsgaGVhdFZhbHVlczogbnVtYmVyW10gfTtcbiAgXCJoZWF0Om1hcmtlckFsaWduZWRcIjogeyB2YWx1ZTogbnVtYmVyOyBtYXJrZXI6IG51bWJlciB9O1xuICBcImhlYXQ6d2FybkVudGVyZWRcIjogeyB2YWx1ZTogbnVtYmVyOyB3YXJuQXQ6IG51bWJlciB9O1xuICBcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCI6IHsgdmFsdWU6IG51bWJlcjsgd2FybkF0OiBudW1iZXIgfTtcbiAgXCJoZWF0OnN0YWxsVHJpZ2dlcmVkXCI6IHsgc3RhbGxVbnRpbDogbnVtYmVyIH07XG4gIFwiaGVhdDpzdGFsbFJlY292ZXJlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCI6IHsgcGxhbm5lZDogbnVtYmVyOyBhY3R1YWw6IG51bWJlciB9O1xuICBcInVpOndheXBvaW50SG92ZXJTdGFydFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJ1aTp3YXlwb2ludEhvdmVyRW5kXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6cm91dGVBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6cm91dGVEZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIjogeyByb3V0ZUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCI6IHsgcm91dGVJZDogc3RyaW5nIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIjogeyB0b29sOiBNaXNzaWxlVG9vbCB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCI6IHsgcm91dGVJZDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyOyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTphZ3JvQ2hhbmdlZFwiOiB7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6bGF1bmNoZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiOiB7IHNlY29uZHNSZW1haW5pbmc6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiOiB2b2lkO1xuICBcIm1pc3NpbGU6cHJlc2V0U2VsZWN0ZWRcIjogeyBwcmVzZXROYW1lOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmhlYXRQcm9qZWN0aW9uVXBkYXRlZFwiOiB7IHdpbGxPdmVyaGVhdDogYm9vbGVhbjsgb3ZlcmhlYXRBdD86IG51bWJlciB9O1xuICBcIm1pc3NpbGU6b3ZlcmhlYXRlZFwiOiB7IG1pc3NpbGVJZDogc3RyaW5nOyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuICBcImhlbHA6dmlzaWJsZUNoYW5nZWRcIjogeyB2aXNpYmxlOiBib29sZWFuIH07XG4gIFwic3RhdGU6dXBkYXRlZFwiOiB2b2lkO1xuICBcInR1dG9yaWFsOnN0YXJ0ZWRcIjogeyBpZDogc3RyaW5nIH07XG4gIFwidHV0b3JpYWw6c3RlcENoYW5nZWRcIjogeyBpZDogc3RyaW5nOyBzdGVwSW5kZXg6IG51bWJlcjsgdG90YWw6IG51bWJlciB9O1xuICBcInR1dG9yaWFsOmNvbXBsZXRlZFwiOiB7IGlkOiBzdHJpbmcgfTtcbiAgXCJ0dXRvcmlhbDpza2lwcGVkXCI6IHsgaWQ6IHN0cmluZzsgYXRTdGVwOiBudW1iZXIgfTtcbiAgXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIjogdm9pZDtcbiAgXCJkaWFsb2d1ZTpvcGVuZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjbG9zZWRcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJkaWFsb2d1ZTpjaG9pY2VcIjogeyBub2RlSWQ6IHN0cmluZzsgY2hvaWNlSWQ6IHN0cmluZzsgY2hhcHRlcklkOiBzdHJpbmcgfTtcbiAgXCJzdG9yeTpmbGFnVXBkYXRlZFwiOiB7IGZsYWc6IHN0cmluZzsgdmFsdWU6IGJvb2xlYW4gfTtcbiAgXCJzdG9yeTpwcm9ncmVzc2VkXCI6IHsgY2hhcHRlcklkOiBzdHJpbmc7IG5vZGVJZDogc3RyaW5nIH07XG4gIFwiYXVkaW86cmVzdW1lXCI6IHZvaWQ7XG4gIFwiYXVkaW86bXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnVubXV0ZVwiOiB2b2lkO1xuICBcImF1ZGlvOnNldC1tYXN0ZXItZ2FpblwiOiB7IGdhaW46IG51bWJlciB9O1xuICBcImF1ZGlvOnNmeFwiOiB7IG5hbWU6IFwidWlcIiB8IFwibGFzZXJcIiB8IFwidGhydXN0XCIgfCBcImV4cGxvc2lvblwiIHwgXCJsb2NrXCIgfCBcImRpYWxvZ3VlXCI7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIjogeyBzY2VuZTogXCJhbWJpZW50XCIgfCBcImNvbWJhdFwiIHwgXCJsb2JieVwiOyBzZWVkPzogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6cGFyYW1cIjogeyBrZXk6IHN0cmluZzsgdmFsdWU6IG51bWJlciB9O1xuICBcImF1ZGlvOm11c2ljOnRyYW5zcG9ydFwiOiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfTtcbn1cblxuZXhwb3J0IHR5cGUgRXZlbnRLZXkgPSBrZXlvZiBFdmVudE1hcDtcbmV4cG9ydCB0eXBlIEV2ZW50UGF5bG9hZDxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gRXZlbnRNYXBbS107XG5leHBvcnQgdHlwZSBIYW5kbGVyPEsgZXh0ZW5kcyBFdmVudEtleT4gPSAocGF5bG9hZDogRXZlbnRQYXlsb2FkPEs+KSA9PiB2b2lkO1xuXG50eXBlIFZvaWRLZXlzID0ge1xuICBbSyBpbiBFdmVudEtleV06IEV2ZW50TWFwW0tdIGV4dGVuZHMgdm9pZCA/IEsgOiBuZXZlclxufVtFdmVudEtleV07XG5cbnR5cGUgTm9uVm9pZEtleXMgPSBFeGNsdWRlPEV2ZW50S2V5LCBWb2lkS2V5cz47XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnRCdXMge1xuICBvbjxLIGV4dGVuZHMgRXZlbnRLZXk+KGV2ZW50OiBLLCBoYW5kbGVyOiBIYW5kbGVyPEs+KTogKCkgPT4gdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgTm9uVm9pZEtleXM+KGV2ZW50OiBLLCBwYXlsb2FkOiBFdmVudFBheWxvYWQ8Sz4pOiB2b2lkO1xuICBlbWl0PEsgZXh0ZW5kcyBWb2lkS2V5cz4oZXZlbnQ6IEspOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXZlbnRCdXMoKTogRXZlbnRCdXMge1xuICBjb25zdCBoYW5kbGVycyA9IG5ldyBNYXA8RXZlbnRLZXksIFNldDxGdW5jdGlvbj4+KCk7XG4gIHJldHVybiB7XG4gICAgb24oZXZlbnQsIGhhbmRsZXIpIHtcbiAgICAgIGxldCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQpIHtcbiAgICAgICAgc2V0ID0gbmV3IFNldCgpO1xuICAgICAgICBoYW5kbGVycy5zZXQoZXZlbnQsIHNldCk7XG4gICAgICB9XG4gICAgICBzZXQuYWRkKGhhbmRsZXIpO1xuICAgICAgcmV0dXJuICgpID0+IHNldCEuZGVsZXRlKGhhbmRsZXIpO1xuICAgIH0sXG4gICAgZW1pdChldmVudDogRXZlbnRLZXksIHBheWxvYWQ/OiB1bmtub3duKSB7XG4gICAgICBjb25zdCBzZXQgPSBoYW5kbGVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzZXQgfHwgc2V0LnNpemUgPT09IDApIHJldHVybjtcbiAgICAgIGZvciAoY29uc3QgZm4gb2Ygc2V0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgKGZuIGFzICh2YWx1ZT86IHVua25vd24pID0+IHZvaWQpKHBheWxvYWQpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBbYnVzXSBoYW5kbGVyIGZvciAke2V2ZW50fSBmYWlsZWRgLCBlcnIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNoaXBDb250ZXh0LCBTaGlwVG9vbCwgTWlzc2lsZVRvb2wgfSBmcm9tIFwiLi9idXNcIjtcblxuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX1NQRUVEID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfU1BFRUQgPSAyNTA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fQUdSTyA9IDEwMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01BWF9MSUZFVElNRSA9IDEyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9MSUZFVElNRSA9IDIwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfU1BFRURfUEVOQUxUWSA9IDgwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZID0gNDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9MSUZFVElNRV9BR1JPX1JFRiA9IDIwMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZUxpbWl0cyB7XG4gIHNwZWVkTWluOiBudW1iZXI7XG4gIHNwZWVkTWF4OiBudW1iZXI7XG4gIGFncm9NaW46IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXYXlwb2ludCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBzcGVlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRWaWV3IHtcbiAgdmFsdWU6IG51bWJlcjtcbiAgbWF4OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIHN0YWxsVW50aWxNczogbnVtYmVyOyAvLyBjbGllbnQtc3luY2VkIHRpbWUgaW4gbWlsbGlzZWNvbmRzXG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaGlwU25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgaHA/OiBudW1iZXI7XG4gIGtpbGxzPzogbnVtYmVyO1xuICB3YXlwb2ludHM6IFdheXBvaW50W107XG4gIGN1cnJlbnRXYXlwb2ludEluZGV4PzogbnVtYmVyO1xuICBoZWF0PzogSGVhdFZpZXc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2hvc3RTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTbmFwc2hvdCB7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICBzZWxmPzogYm9vbGVhbjtcbiAgYWdyb19yYWRpdXM6IG51bWJlcjtcbiAgaGVhdD86IEhlYXRWaWV3OyAvLyBNaXNzaWxlIGhlYXQgZGF0YVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVSb3V0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRQYXJhbXMge1xuICBtYXg6IG51bWJlcjtcbiAgd2FybkF0OiBudW1iZXI7XG4gIG92ZXJoZWF0QXQ6IG51bWJlcjtcbiAgbWFya2VyU3BlZWQ6IG51bWJlcjtcbiAga1VwOiBudW1iZXI7XG4gIGtEb3duOiBudW1iZXI7XG4gIGV4cDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVDb25maWcge1xuICBzcGVlZDogbnVtYmVyO1xuICBhZ3JvUmFkaXVzOiBudW1iZXI7XG4gIGxpZmV0aW1lOiBudW1iZXI7XG4gIGhlYXRQYXJhbXM/OiBIZWF0UGFyYW1zOyAvLyBPcHRpb25hbCBjdXN0b20gaGVhdCBjb25maWd1cmF0aW9uXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2lsZVByZXNldCB7XG4gIG5hbWU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgc3BlZWQ6IG51bWJlcjtcbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuICBoZWF0UGFyYW1zOiBIZWF0UGFyYW1zO1xufVxuXG4vLyBNaXNzaWxlIHByZXNldCBkZWZpbml0aW9ucyBtYXRjaGluZyBiYWNrZW5kXG5leHBvcnQgY29uc3QgTUlTU0lMRV9QUkVTRVRTOiBNaXNzaWxlUHJlc2V0W10gPSBbXG4gIHtcbiAgICBuYW1lOiBcIlNjb3V0XCIsXG4gICAgZGVzY3JpcHRpb246IFwiU2xvdywgZWZmaWNpZW50LCBsb25nLXJhbmdlLiBIaWdoIGhlYXQgY2FwYWNpdHkuXCIsXG4gICAgc3BlZWQ6IDgwLFxuICAgIGFncm9SYWRpdXM6IDE1MDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA2MCxcbiAgICAgIHdhcm5BdDogNDIsXG4gICAgICBvdmVyaGVhdEF0OiA2MCxcbiAgICAgIG1hcmtlclNwZWVkOiA3MCxcbiAgICAgIGtVcDogMjAsXG4gICAgICBrRG93bjogMTUsXG4gICAgICBleHA6IDEuNSxcbiAgICB9LFxuICB9LFxuICB7XG4gICAgbmFtZTogXCJIdW50ZXJcIixcbiAgICBkZXNjcmlwdGlvbjogXCJCYWxhbmNlZCBzcGVlZCBhbmQgZGV0ZWN0aW9uLiBTdGFuZGFyZCBoZWF0LlwiLFxuICAgIHNwZWVkOiAxNTAsXG4gICAgYWdyb1JhZGl1czogODAwLFxuICAgIGhlYXRQYXJhbXM6IHtcbiAgICAgIG1heDogNTAsXG4gICAgICB3YXJuQXQ6IDM1LFxuICAgICAgb3ZlcmhlYXRBdDogNTAsXG4gICAgICBtYXJrZXJTcGVlZDogMTIwLFxuICAgICAga1VwOiAyOCxcbiAgICAgIGtEb3duOiAxMixcbiAgICAgIGV4cDogMS41LFxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBcIlNuaXBlclwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkZhc3QsIG5hcnJvdyBkZXRlY3Rpb24uIExvdyBoZWF0IGNhcGFjaXR5LlwiLFxuICAgIHNwZWVkOiAyMjAsXG4gICAgYWdyb1JhZGl1czogMzAwLFxuICAgIGhlYXRQYXJhbXM6IHtcbiAgICAgIG1heDogNDAsXG4gICAgICB3YXJuQXQ6IDI4LFxuICAgICAgb3ZlcmhlYXRBdDogNDAsXG4gICAgICBtYXJrZXJTcGVlZDogMTgwLFxuICAgICAga1VwOiAzNSxcbiAgICAgIGtEb3duOiA4LFxuICAgICAgZXhwOiAxLjUsXG4gICAgfSxcbiAgfSxcbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV29ybGRNZXRhIHtcbiAgYz86IG51bWJlcjtcbiAgdz86IG51bWJlcjtcbiAgaD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBTdGF0ZSB7XG4gIG5vdzogbnVtYmVyO1xuICBub3dTeW5jZWRBdDogbnVtYmVyO1xuICBtZTogU2hpcFNuYXBzaG90IHwgbnVsbDtcbiAgZ2hvc3RzOiBHaG9zdFNuYXBzaG90W107XG4gIG1pc3NpbGVzOiBNaXNzaWxlU25hcHNob3RbXTtcbiAgbWlzc2lsZVJvdXRlczogTWlzc2lsZVJvdXRlW107XG4gIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBzdHJpbmcgfCBudWxsO1xuICBuZXh0TWlzc2lsZVJlYWR5QXQ6IG51bWJlcjtcbiAgbWlzc2lsZUNvbmZpZzogTWlzc2lsZUNvbmZpZztcbiAgbWlzc2lsZUxpbWl0czogTWlzc2lsZUxpbWl0cztcbiAgd29ybGRNZXRhOiBXb3JsZE1ldGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VsZWN0aW9uIHtcbiAgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjtcbiAgaW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlU2VsZWN0aW9uIHtcbiAgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJyb3V0ZVwiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBBY3RpdmVUb29sID1cbiAgfCBcInNoaXAtc2V0XCJcbiAgfCBcInNoaXAtc2VsZWN0XCJcbiAgfCBcIm1pc3NpbGUtc2V0XCJcbiAgfCBcIm1pc3NpbGUtc2VsZWN0XCJcbiAgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVJU3RhdGUge1xuICBpbnB1dENvbnRleHQ6IFNoaXBDb250ZXh0O1xuICBzaGlwVG9vbDogU2hpcFRvb2w7XG4gIG1pc3NpbGVUb29sOiBNaXNzaWxlVG9vbDtcbiAgYWN0aXZlVG9vbDogQWN0aXZlVG9vbDtcbiAgc2hvd1NoaXBSb3V0ZTogYm9vbGVhbjtcbiAgaGVscFZpc2libGU6IGJvb2xlYW47XG4gIHpvb206IG51bWJlcjtcbiAgcGFuWDogbnVtYmVyO1xuICBwYW5ZOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpOiBVSVN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpbnB1dENvbnRleHQ6IFwic2hpcFwiLFxuICAgIHNoaXBUb29sOiBcInNldFwiLFxuICAgIG1pc3NpbGVUb29sOiBudWxsLFxuICAgIGFjdGl2ZVRvb2w6IFwic2hpcC1zZXRcIixcbiAgICBzaG93U2hpcFJvdXRlOiB0cnVlLFxuICAgIGhlbHBWaXNpYmxlOiBmYWxzZSxcbiAgICB6b29tOiAxLjAsXG4gICAgcGFuWDogMCxcbiAgICBwYW5ZOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFN0YXRlKGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogQXBwU3RhdGUge1xuICByZXR1cm4ge1xuICAgIG5vdzogMCxcbiAgICBub3dTeW5jZWRBdDogdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgPyBwZXJmb3JtYW5jZS5ub3coKVxuICAgICAgOiBEYXRlLm5vdygpLFxuICAgIG1lOiBudWxsLFxuICAgIGdob3N0czogW10sXG4gICAgbWlzc2lsZXM6IFtdLFxuICAgIG1pc3NpbGVSb3V0ZXM6IFtdLFxuICAgIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBudWxsLFxuICAgIG5leHRNaXNzaWxlUmVhZHlBdDogMCxcbiAgICBtaXNzaWxlQ29uZmlnOiB7XG4gICAgICBzcGVlZDogMTgwLFxuICAgICAgYWdyb1JhZGl1czogODAwLFxuICAgICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcigxODAsIDgwMCwgbGltaXRzKSxcbiAgICAgIGhlYXRQYXJhbXM6IE1JU1NJTEVfUFJFU0VUU1sxXS5oZWF0UGFyYW1zLCAvLyBEZWZhdWx0IHRvIEh1bnRlciBwcmVzZXRcbiAgICB9LFxuICAgIG1pc3NpbGVMaW1pdHM6IGxpbWl0cyxcbiAgICB3b3JsZE1ldGE6IHt9LFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXAodmFsdWU6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWlzc2lsZUxpZmV0aW1lRm9yKHNwZWVkOiBudW1iZXIsIGFncm9SYWRpdXM6IG51bWJlciwgbGltaXRzOiBNaXNzaWxlTGltaXRzID0ge1xuICBzcGVlZE1pbjogTUlTU0lMRV9NSU5fU1BFRUQsXG4gIHNwZWVkTWF4OiBNSVNTSUxFX01BWF9TUEVFRCxcbiAgYWdyb01pbjogTUlTU0lMRV9NSU5fQUdSTyxcbn0pOiBudW1iZXIge1xuICBjb25zdCBtaW5TcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluIDogTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXggOiBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgbWluQWdybyA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiA6IE1JU1NJTEVfTUlOX0FHUk87XG4gIGNvbnN0IHNwYW4gPSBtYXhTcGVlZCAtIG1pblNwZWVkO1xuICBjb25zdCBzcGVlZE5vcm0gPSBzcGFuID4gMCA/IGNsYW1wKChzcGVlZCAtIG1pblNwZWVkKSAvIHNwYW4sIDAsIDEpIDogMDtcbiAgY29uc3QgYWRqdXN0ZWRBZ3JvID0gTWF0aC5tYXgoMCwgYWdyb1JhZGl1cyAtIG1pbkFncm8pO1xuICBjb25zdCBhZ3JvTm9ybSA9IGNsYW1wKGFkanVzdGVkQWdybyAvIE1JU1NJTEVfTElGRVRJTUVfQUdST19SRUYsIDAsIDEpO1xuICBjb25zdCByZWR1Y3Rpb24gPSBzcGVlZE5vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX1NQRUVEX1BFTkFMVFkgKyBhZ3JvTm9ybSAqIE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZO1xuICBjb25zdCBiYXNlID0gTUlTU0lMRV9NQVhfTElGRVRJTUU7XG4gIHJldHVybiBjbGFtcChiYXNlIC0gcmVkdWN0aW9uLCBNSVNTSUxFX01JTl9MSUZFVElNRSwgTUlTU0lMRV9NQVhfTElGRVRJTUUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVNaXNzaWxlQ29uZmlnKFxuICBjZmc6IFBhcnRpYWw8UGljazxNaXNzaWxlQ29uZmlnLCBcInNwZWVkXCIgfCBcImFncm9SYWRpdXNcIiB8IFwiaGVhdFBhcmFtc1wiPj4sXG4gIGZhbGxiYWNrOiBNaXNzaWxlQ29uZmlnLFxuICBsaW1pdHM6IE1pc3NpbGVMaW1pdHMsXG4pOiBNaXNzaWxlQ29uZmlnIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBiYXNlID0gZmFsbGJhY2sgPz8ge1xuICAgIHNwZWVkOiBtaW5TcGVlZCxcbiAgICBhZ3JvUmFkaXVzOiBtaW5BZ3JvLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IobWluU3BlZWQsIG1pbkFncm8sIGxpbWl0cyksXG4gIH07XG4gIGNvbnN0IG1lcmdlZFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA/IChjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgOiBiYXNlLnNwZWVkO1xuICBjb25zdCBtZXJnZWRBZ3JvID0gTnVtYmVyLmlzRmluaXRlKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgPyAoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA6IGJhc2UuYWdyb1JhZGl1cztcbiAgY29uc3Qgc3BlZWQgPSBjbGFtcChtZXJnZWRTcGVlZCwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgY29uc3QgYWdyb1JhZGl1cyA9IE1hdGgubWF4KG1pbkFncm8sIG1lcmdlZEFncm8pO1xuICBjb25zdCBoZWF0UGFyYW1zID0gY2ZnLmhlYXRQYXJhbXMgPyB7IC4uLmNmZy5oZWF0UGFyYW1zIH0gOiBiYXNlLmhlYXRQYXJhbXMgPyB7IC4uLmJhc2UuaGVhdFBhcmFtcyB9IDogdW5kZWZpbmVkO1xuICByZXR1cm4ge1xuICAgIHNwZWVkLFxuICAgIGFncm9SYWRpdXMsXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihzcGVlZCwgYWdyb1JhZGl1cywgbGltaXRzKSxcbiAgICBoZWF0UGFyYW1zLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9ub3RvbmljTm93KCk6IG51bWJlciB7XG4gIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICB9XG4gIHJldHVybiBEYXRlLm5vdygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVXYXlwb2ludExpc3QobGlzdDogV2F5cG9pbnRbXSB8IHVuZGVmaW5lZCB8IG51bGwpOiBXYXlwb2ludFtdIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3QpKSByZXR1cm4gW107XG4gIHJldHVybiBsaXN0Lm1hcCgod3ApID0+ICh7IC4uLndwIH0pKTtcbn1cblxuLy8gUHJvamVjdCBoZWF0IGFsb25nIGEgbWlzc2lsZSByb3V0ZVxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGVQcm9qZWN0aW9uIHtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xuICBoZWF0QXRXYXlwb2ludHM6IG51bWJlcltdO1xuICB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47XG4gIG92ZXJoZWF0QXQ/OiBudW1iZXI7IC8vIEluZGV4IHdoZXJlIG92ZXJoZWF0IG9jY3Vyc1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdE1pc3NpbGVIZWF0KFxuICByb3V0ZTogV2F5cG9pbnRbXSxcbiAgZGVmYXVsdFNwZWVkOiBudW1iZXIsXG4gIGhlYXRQYXJhbXM6IEhlYXRQYXJhbXNcbik6IE1pc3NpbGVSb3V0ZVByb2plY3Rpb24ge1xuICBjb25zdCBwcm9qZWN0aW9uOiBNaXNzaWxlUm91dGVQcm9qZWN0aW9uID0ge1xuICAgIHdheXBvaW50czogcm91dGUsXG4gICAgaGVhdEF0V2F5cG9pbnRzOiBbXSxcbiAgICB3aWxsT3ZlcmhlYXQ6IGZhbHNlLFxuICB9O1xuXG4gIGlmIChyb3V0ZS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gcHJvamVjdGlvbjtcbiAgfVxuXG4gIGxldCBoZWF0ID0gMDsgLy8gTWlzc2lsZXMgc3RhcnQgYXQgemVybyBoZWF0XG4gIGxldCBwb3MgPSB7IHg6IHJvdXRlWzBdLngsIHk6IHJvdXRlWzBdLnkgfTtcbiAgbGV0IGN1cnJlbnRTcGVlZCA9IHJvdXRlWzBdLnNwZWVkID4gMCA/IHJvdXRlWzBdLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuXG4gIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCByb3V0ZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHRhcmdldFBvcyA9IHJvdXRlW2ldO1xuICAgIGNvbnN0IHRhcmdldFNwZWVkID0gdGFyZ2V0UG9zLnNwZWVkID4gMCA/IHRhcmdldFBvcy5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcblxuICAgIC8vIENhbGN1bGF0ZSBkaXN0YW5jZSBhbmQgdGltZVxuICAgIGNvbnN0IGR4ID0gdGFyZ2V0UG9zLnggLSBwb3MueDtcbiAgICBjb25zdCBkeSA9IHRhcmdldFBvcy55IC0gcG9zLnk7XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXG4gICAgaWYgKGRpc3RhbmNlIDwgMC4wMDEpIHtcbiAgICAgIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBBdmVyYWdlIHNwZWVkIGR1cmluZyBzZWdtZW50XG4gICAgY29uc3QgYXZnU3BlZWQgPSAoY3VycmVudFNwZWVkICsgdGFyZ2V0U3BlZWQpICogMC41O1xuICAgIGNvbnN0IHNlZ21lbnRUaW1lID0gZGlzdGFuY2UgLyBNYXRoLm1heChhdmdTcGVlZCwgMSk7XG5cbiAgICAvLyBDYWxjdWxhdGUgaGVhdCByYXRlIChtYXRjaCBzZXJ2ZXIgZm9ybXVsYSlcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KGhlYXRQYXJhbXMubWFya2VyU3BlZWQsIDAuMDAwMDAxKTtcbiAgICBjb25zdCBkZXYgPSBhdmdTcGVlZCAtIGhlYXRQYXJhbXMubWFya2VyU3BlZWQ7XG4gICAgY29uc3QgcCA9IGhlYXRQYXJhbXMuZXhwO1xuXG4gICAgbGV0IGhkb3Q6IG51bWJlcjtcbiAgICBpZiAoZGV2ID49IDApIHtcbiAgICAgIC8vIEhlYXRpbmdcbiAgICAgIGhkb3QgPSBoZWF0UGFyYW1zLmtVcCAqIE1hdGgucG93KGRldiAvIFZuLCBwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ29vbGluZ1xuICAgICAgaGRvdCA9IC1oZWF0UGFyYW1zLmtEb3duICogTWF0aC5wb3coTWF0aC5hYnMoZGV2KSAvIFZuLCBwKTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgaGVhdFxuICAgIGhlYXQgKz0gaGRvdCAqIHNlZ21lbnRUaW1lO1xuICAgIGhlYXQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihoZWF0LCBoZWF0UGFyYW1zLm1heCkpO1xuXG4gICAgcHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHMucHVzaChoZWF0KTtcbiAgICBwb3MgPSB7IHg6IHRhcmdldFBvcy54LCB5OiB0YXJnZXRQb3MueSB9O1xuICAgIGN1cnJlbnRTcGVlZCA9IHRhcmdldFNwZWVkO1xuXG4gICAgLy8gQ2hlY2sgZm9yIG92ZXJoZWF0XG4gICAgaWYgKGhlYXQgPj0gaGVhdFBhcmFtcy5vdmVyaGVhdEF0ICYmICFwcm9qZWN0aW9uLndpbGxPdmVyaGVhdCkge1xuICAgICAgcHJvamVjdGlvbi53aWxsT3ZlcmhlYXQgPSB0cnVlO1xuICAgICAgcHJvamVjdGlvbi5vdmVyaGVhdEF0ID0gaTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgcG9zaXRpb24gYW5kIHNwZWVkXG4gICAgcG9zID0gdGFyZ2V0UG9zO1xuICAgIGN1cnJlbnRTcGVlZCA9IHRhcmdldFNwZWVkO1xuICB9XG5cbiAgcmV0dXJuIHByb2plY3Rpb247XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlOiBBcHBTdGF0ZSwgbGltaXRzOiBQYXJ0aWFsPE1pc3NpbGVMaW1pdHM+KTogdm9pZCB7XG4gIHN0YXRlLm1pc3NpbGVMaW1pdHMgPSB7XG4gICAgc3BlZWRNaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4sXG4gICAgc3BlZWRNYXg6IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4ISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXgsXG4gICAgYWdyb01pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuYWdyb01pbixcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyB0eXBlIEV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQge1xuICB0eXBlIEFwcFN0YXRlLFxuICB0eXBlIE1pc3NpbGVSb3V0ZSxcbiAgbW9ub3RvbmljTm93LFxuICBzYW5pdGl6ZU1pc3NpbGVDb25maWcsXG4gIHVwZGF0ZU1pc3NpbGVMaW1pdHMsXG59IGZyb20gXCIuL3N0YXRlXCI7XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgc3BlZWQ/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTZXJ2ZXJNaXNzaWxlUm91dGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lPzogc3RyaW5nO1xuICB3YXlwb2ludHM/OiBTZXJ2ZXJNaXNzaWxlV2F5cG9pbnRbXTtcbn1cblxuaW50ZXJmYWNlIFNlcnZlckhlYXRWaWV3IHtcbiAgdjogbnVtYmVyOyAgLy8gY3VycmVudCBoZWF0IHZhbHVlXG4gIG06IG51bWJlcjsgIC8vIG1heFxuICB3OiBudW1iZXI7ICAvLyB3YXJuQXRcbiAgbzogbnVtYmVyOyAgLy8gb3ZlcmhlYXRBdFxuICBtczogbnVtYmVyOyAvLyBtYXJrZXJTcGVlZFxuICBzdTogbnVtYmVyOyAvLyBzdGFsbFVudGlsIChzZXJ2ZXIgdGltZSBzZWNvbmRzKVxuICBrdTogbnVtYmVyOyAvLyBrVXBcbiAga2Q6IG51bWJlcjsgLy8ga0Rvd25cbiAgZXg6IG51bWJlcjsgLy8gZXhwXG59XG5cbmludGVyZmFjZSBTZXJ2ZXJTaGlwU3RhdGUge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgaHA/OiBudW1iZXI7XG4gIGtpbGxzPzogbnVtYmVyO1xuICB3YXlwb2ludHM/OiBBcnJheTx7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBzcGVlZD86IG51bWJlciB9PjtcbiAgY3VycmVudF93YXlwb2ludF9pbmRleD86IG51bWJlcjtcbiAgaGVhdD86IFNlcnZlckhlYXRWaWV3O1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWlzc2lsZVN0YXRlIHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIHNlbGY/OiBib29sZWFuO1xuICBhZ3JvX3JhZGl1czogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyU3RhdGVNZXNzYWdlIHtcbiAgdHlwZTogXCJzdGF0ZVwiO1xuICBub3c6IG51bWJlcjtcbiAgbmV4dF9taXNzaWxlX3JlYWR5PzogbnVtYmVyO1xuICBtZT86IFNlcnZlclNoaXBTdGF0ZSB8IG51bGw7XG4gIGdob3N0cz86IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHZ4OiBudW1iZXI7IHZ5OiBudW1iZXIgfT47XG4gIG1pc3NpbGVzPzogU2VydmVyTWlzc2lsZVN0YXRlW107XG4gIG1pc3NpbGVfcm91dGVzPzogU2VydmVyTWlzc2lsZVJvdXRlW107XG4gIG1pc3NpbGVfY29uZmlnPzoge1xuICAgIHNwZWVkPzogbnVtYmVyO1xuICAgIHNwZWVkX21pbj86IG51bWJlcjtcbiAgICBzcGVlZF9tYXg/OiBudW1iZXI7XG4gICAgYWdyb19yYWRpdXM/OiBudW1iZXI7XG4gICAgYWdyb19taW4/OiBudW1iZXI7XG4gICAgbGlmZXRpbWU/OiBudW1iZXI7XG4gICAgaGVhdF9jb25maWc/OiB7XG4gICAgICBtYXg/OiBudW1iZXI7XG4gICAgICB3YXJuX2F0PzogbnVtYmVyO1xuICAgICAgb3ZlcmhlYXRfYXQ/OiBudW1iZXI7XG4gICAgICBtYXJrZXJfc3BlZWQ/OiBudW1iZXI7XG4gICAgICBrX3VwPzogbnVtYmVyO1xuICAgICAga19kb3duPzogbnVtYmVyO1xuICAgICAgZXhwPzogbnVtYmVyO1xuICAgIH0gfCBudWxsO1xuICB9IHwgbnVsbDtcbiAgYWN0aXZlX21pc3NpbGVfcm91dGU/OiBzdHJpbmcgfCBudWxsO1xuICBtZXRhPzoge1xuICAgIGM/OiBudW1iZXI7XG4gICAgdz86IG51bWJlcjtcbiAgICBoPzogbnVtYmVyO1xuICB9O1xufVxuXG5pbnRlcmZhY2UgQ29ubmVjdE9wdGlvbnMge1xuICByb29tOiBzdHJpbmc7XG4gIHN0YXRlOiBBcHBTdGF0ZTtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb25TdGF0ZVVwZGF0ZWQ/OiAoKSA9PiB2b2lkO1xuICBvbk9wZW4/OiAoc29ja2V0OiBXZWJTb2NrZXQpID0+IHZvaWQ7XG4gIG1hcFc/OiBudW1iZXI7XG4gIG1hcEg/OiBudW1iZXI7XG59XG5cbmxldCB3czogV2ViU29ja2V0IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBzZW5kTWVzc2FnZShwYXlsb2FkOiB1bmtub3duKTogdm9pZCB7XG4gIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHJldHVybjtcbiAgY29uc3QgZGF0YSA9IHR5cGVvZiBwYXlsb2FkID09PSBcInN0cmluZ1wiID8gcGF5bG9hZCA6IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpO1xuICB3cy5zZW5kKGRhdGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdFdlYlNvY2tldCh7IHJvb20sIHN0YXRlLCBidXMsIG9uU3RhdGVVcGRhdGVkLCBvbk9wZW4sIG1hcFcsIG1hcEggfTogQ29ubmVjdE9wdGlvbnMpOiB2b2lkIHtcbiAgY29uc3QgcHJvdG9jb2wgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgPyBcIndzczovL1wiIDogXCJ3czovL1wiO1xuICBsZXQgd3NVcmwgPSBgJHtwcm90b2NvbH0ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fS93cz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb20pfWA7XG4gIGlmIChtYXBXICYmIG1hcFcgPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBXPSR7bWFwV31gO1xuICB9XG4gIGlmIChtYXBIICYmIG1hcEggPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBIPSR7bWFwSH1gO1xuICB9XG4gIHdzID0gbmV3IFdlYlNvY2tldCh3c1VybCk7XG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJvcGVuXCIsICgpID0+IHtcbiAgICBjb25zb2xlLmxvZyhcIlt3c10gb3BlblwiKTtcbiAgICBjb25zdCBzb2NrZXQgPSB3cztcbiAgICBpZiAoc29ja2V0ICYmIG9uT3Blbikge1xuICAgICAgb25PcGVuKHNvY2tldCk7XG4gICAgfVxuICB9KTtcbiAgd3MuYWRkRXZlbnRMaXN0ZW5lcihcImNsb3NlXCIsICgpID0+IGNvbnNvbGUubG9nKFwiW3dzXSBjbG9zZVwiKSk7XG5cbiAgbGV0IHByZXZSb3V0ZXMgPSBuZXcgTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPigpO1xuICBsZXQgcHJldkFjdGl2ZVJvdXRlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IHByZXZNaXNzaWxlQ291bnQgPSAwO1xuXG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IGRhdGEgPSBzYWZlUGFyc2UoZXZlbnQuZGF0YSk7XG4gICAgaWYgKCFkYXRhIHx8IGRhdGEudHlwZSAhPT0gXCJzdGF0ZVwiKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGhhbmRsZVN0YXRlTWVzc2FnZShzdGF0ZSwgZGF0YSwgYnVzLCBwcmV2Um91dGVzLCBwcmV2QWN0aXZlUm91dGUsIHByZXZNaXNzaWxlQ291bnQpO1xuICAgIHByZXZSb3V0ZXMgPSBuZXcgTWFwKHN0YXRlLm1pc3NpbGVSb3V0ZXMubWFwKChyb3V0ZSkgPT4gW3JvdXRlLmlkLCBjbG9uZVJvdXRlKHJvdXRlKV0pKTtcbiAgICBwcmV2QWN0aXZlUm91dGUgPSBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZDtcbiAgICBwcmV2TWlzc2lsZUNvdW50ID0gc3RhdGUubWlzc2lsZXMubGVuZ3RoO1xuICAgIGJ1cy5lbWl0KFwic3RhdGU6dXBkYXRlZFwiKTtcbiAgICBvblN0YXRlVXBkYXRlZD8uKCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTdGF0ZU1lc3NhZ2UoXG4gIHN0YXRlOiBBcHBTdGF0ZSxcbiAgbXNnOiBTZXJ2ZXJTdGF0ZU1lc3NhZ2UsXG4gIGJ1czogRXZlbnRCdXMsXG4gIHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sXG4gIHByZXZBY3RpdmVSb3V0ZTogc3RyaW5nIHwgbnVsbCxcbiAgcHJldk1pc3NpbGVDb3VudDogbnVtYmVyLFxuKTogdm9pZCB7XG4gIHN0YXRlLm5vdyA9IG1zZy5ub3c7XG4gIHN0YXRlLm5vd1N5bmNlZEF0ID0gbW9ub3RvbmljTm93KCk7XG4gIHN0YXRlLm5leHRNaXNzaWxlUmVhZHlBdCA9IE51bWJlci5pc0Zpbml0ZShtc2cubmV4dF9taXNzaWxlX3JlYWR5KSA/IG1zZy5uZXh0X21pc3NpbGVfcmVhZHkhIDogMDtcbiAgc3RhdGUubWUgPSBtc2cubWUgPyB7XG4gICAgeDogbXNnLm1lLngsXG4gICAgeTogbXNnLm1lLnksXG4gICAgdng6IG1zZy5tZS52eCxcbiAgICB2eTogbXNnLm1lLnZ5LFxuICAgIGhwOiBtc2cubWUuaHAsXG4gICAga2lsbHM6IG1zZy5tZS5raWxscyA/PyAwLFxuICAgIHdheXBvaW50czogQXJyYXkuaXNBcnJheShtc2cubWUud2F5cG9pbnRzKVxuICAgICAgPyBtc2cubWUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7IHg6IHdwLngsIHk6IHdwLnksIHNwZWVkOiBOdW1iZXIuaXNGaW5pdGUod3Auc3BlZWQpID8gd3Auc3BlZWQhIDogMTgwIH0pKVxuICAgICAgOiBbXSxcbiAgICBjdXJyZW50V2F5cG9pbnRJbmRleDogbXNnLm1lLmN1cnJlbnRfd2F5cG9pbnRfaW5kZXggPz8gMCxcbiAgICBoZWF0OiBtc2cubWUuaGVhdCA/IGNvbnZlcnRIZWF0Vmlldyhtc2cubWUuaGVhdCwgc3RhdGUubm93U3luY2VkQXQsIHN0YXRlLm5vdykgOiB1bmRlZmluZWQsXG4gIH0gOiBudWxsO1xuICBzdGF0ZS5naG9zdHMgPSBBcnJheS5pc0FycmF5KG1zZy5naG9zdHMpID8gbXNnLmdob3N0cy5zbGljZSgpIDogW107XG4gIHN0YXRlLm1pc3NpbGVzID0gQXJyYXkuaXNBcnJheShtc2cubWlzc2lsZXMpID8gbXNnLm1pc3NpbGVzLnNsaWNlKCkgOiBbXTtcblxuICBjb25zdCByb3V0ZXNGcm9tU2VydmVyID0gQXJyYXkuaXNBcnJheShtc2cubWlzc2lsZV9yb3V0ZXMpID8gbXNnLm1pc3NpbGVfcm91dGVzIDogW107XG4gIGNvbnN0IG5ld1JvdXRlczogTWlzc2lsZVJvdXRlW10gPSByb3V0ZXNGcm9tU2VydmVyLm1hcCgocm91dGUpID0+ICh7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUgfHwgcm91dGUuaWQgfHwgXCJSb3V0ZVwiLFxuICAgIHdheXBvaW50czogQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpXG4gICAgICA/IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoe1xuICAgICAgICAgIHg6IHdwLngsXG4gICAgICAgICAgeTogd3AueSxcbiAgICAgICAgICBzcGVlZDogTnVtYmVyLmlzRmluaXRlKHdwLnNwZWVkKSA/IHdwLnNwZWVkISA6IHN0YXRlLm1pc3NpbGVDb25maWcuc3BlZWQsXG4gICAgICAgIH0pKVxuICAgICAgOiBbXSxcbiAgfSkpO1xuXG4gIGRpZmZSb3V0ZXMocHJldlJvdXRlcywgbmV3Um91dGVzLCBidXMpO1xuICBzdGF0ZS5taXNzaWxlUm91dGVzID0gbmV3Um91dGVzO1xuXG4gIGNvbnN0IG5leHRBY3RpdmUgPSB0eXBlb2YgbXNnLmFjdGl2ZV9taXNzaWxlX3JvdXRlID09PSBcInN0cmluZ1wiICYmIG1zZy5hY3RpdmVfbWlzc2lsZV9yb3V0ZS5sZW5ndGggPiAwXG4gICAgPyBtc2cuYWN0aXZlX21pc3NpbGVfcm91dGVcbiAgICA6IG5ld1JvdXRlcy5sZW5ndGggPiAwXG4gICAgICA/IG5ld1JvdXRlc1swXS5pZFxuICAgICAgOiBudWxsO1xuICBzdGF0ZS5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG5leHRBY3RpdmU7XG4gIGlmIChuZXh0QWN0aXZlICE9PSBwcmV2QWN0aXZlUm91dGUpIHtcbiAgICBidXMuZW1pdChcIm1pc3NpbGU6YWN0aXZlUm91dGVDaGFuZ2VkXCIsIHsgcm91dGVJZDogbmV4dEFjdGl2ZSA/PyBudWxsIH0pO1xuICB9XG5cbiAgaWYgKG1zZy5taXNzaWxlX2NvbmZpZykge1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21pbikgfHwgTnVtYmVyLmlzRmluaXRlKG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZF9tYXgpIHx8IE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcuYWdyb19taW4pKSB7XG4gICAgICB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlLCB7XG4gICAgICAgIHNwZWVkTWluOiBtc2cubWlzc2lsZV9jb25maWcuc3BlZWRfbWluLFxuICAgICAgICBzcGVlZE1heDogbXNnLm1pc3NpbGVfY29uZmlnLnNwZWVkX21heCxcbiAgICAgICAgYWdyb01pbjogbXNnLm1pc3NpbGVfY29uZmlnLmFncm9fbWluLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHByZXZIZWF0ID0gc3RhdGUubWlzc2lsZUNvbmZpZy5oZWF0UGFyYW1zO1xuICAgIGxldCBoZWF0UGFyYW1zOiB7IG1heDogbnVtYmVyOyB3YXJuQXQ6IG51bWJlcjsgb3ZlcmhlYXRBdDogbnVtYmVyOyBtYXJrZXJTcGVlZDogbnVtYmVyOyBrVXA6IG51bWJlcjsga0Rvd246IG51bWJlcjsgZXhwOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcbiAgICBjb25zdCBoZWF0Q29uZmlnID0gbXNnLm1pc3NpbGVfY29uZmlnLmhlYXRfY29uZmlnO1xuICAgIGlmIChoZWF0Q29uZmlnKSB7XG4gICAgICBoZWF0UGFyYW1zID0ge1xuICAgICAgICBtYXg6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLm1heCkgPyBoZWF0Q29uZmlnLm1heCEgOiBwcmV2SGVhdD8ubWF4ID8/IDAsXG4gICAgICAgIHdhcm5BdDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcud2Fybl9hdCkgPyBoZWF0Q29uZmlnLndhcm5fYXQhIDogcHJldkhlYXQ/Lndhcm5BdCA/PyAwLFxuICAgICAgICBvdmVyaGVhdEF0OiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5vdmVyaGVhdF9hdCkgPyBoZWF0Q29uZmlnLm92ZXJoZWF0X2F0ISA6IHByZXZIZWF0Py5vdmVyaGVhdEF0ID8/IDAsXG4gICAgICAgIG1hcmtlclNwZWVkOiBOdW1iZXIuaXNGaW5pdGUoaGVhdENvbmZpZy5tYXJrZXJfc3BlZWQpID8gaGVhdENvbmZpZy5tYXJrZXJfc3BlZWQhIDogcHJldkhlYXQ/Lm1hcmtlclNwZWVkID8/IDAsXG4gICAgICAgIGtVcDogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcua191cCkgPyBoZWF0Q29uZmlnLmtfdXAhIDogcHJldkhlYXQ/LmtVcCA/PyAwLFxuICAgICAgICBrRG93bjogTnVtYmVyLmlzRmluaXRlKGhlYXRDb25maWcua19kb3duKSA/IGhlYXRDb25maWcua19kb3duISA6IHByZXZIZWF0Py5rRG93biA/PyAwLFxuICAgICAgICBleHA6IE51bWJlci5pc0Zpbml0ZShoZWF0Q29uZmlnLmV4cCkgPyBoZWF0Q29uZmlnLmV4cCEgOiBwcmV2SGVhdD8uZXhwID8/IDEsXG4gICAgICB9O1xuICAgIH1cbiAgICBjb25zdCBzYW5pdGl6ZWQgPSBzYW5pdGl6ZU1pc3NpbGVDb25maWcoe1xuICAgICAgc3BlZWQ6IG1zZy5taXNzaWxlX2NvbmZpZy5zcGVlZCxcbiAgICAgIGFncm9SYWRpdXM6IG1zZy5taXNzaWxlX2NvbmZpZy5hZ3JvX3JhZGl1cyxcbiAgICAgIGhlYXRQYXJhbXMsXG4gICAgfSwgc3RhdGUubWlzc2lsZUNvbmZpZywgc3RhdGUubWlzc2lsZUxpbWl0cyk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShtc2cubWlzc2lsZV9jb25maWcubGlmZXRpbWUpKSB7XG4gICAgICBzYW5pdGl6ZWQubGlmZXRpbWUgPSBtc2cubWlzc2lsZV9jb25maWcubGlmZXRpbWUhO1xuICAgIH1cbiAgICBzdGF0ZS5taXNzaWxlQ29uZmlnID0gc2FuaXRpemVkO1xuICB9XG5cbiAgY29uc3QgbWV0YSA9IG1zZy5tZXRhID8/IHt9O1xuICBjb25zdCBoYXNDID0gdHlwZW9mIG1ldGEuYyA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUobWV0YS5jKTtcbiAgY29uc3QgaGFzVyA9IHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudyk7XG4gIGNvbnN0IGhhc0ggPSB0eXBlb2YgbWV0YS5oID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZShtZXRhLmgpO1xuICBzdGF0ZS53b3JsZE1ldGEgPSB7XG4gICAgYzogaGFzQyA/IG1ldGEuYyEgOiBzdGF0ZS53b3JsZE1ldGEuYyxcbiAgICB3OiBoYXNXID8gbWV0YS53ISA6IHN0YXRlLndvcmxkTWV0YS53LFxuICAgIGg6IGhhc0ggPyBtZXRhLmghIDogc3RhdGUud29ybGRNZXRhLmgsXG4gIH07XG5cbiAgaWYgKHN0YXRlLm1pc3NpbGVzLmxlbmd0aCA+IHByZXZNaXNzaWxlQ291bnQpIHtcbiAgICBjb25zdCBhY3RpdmVSb3V0ZUlkID0gc3RhdGUuYWN0aXZlTWlzc2lsZVJvdXRlSWQ7XG4gICAgaWYgKGFjdGl2ZVJvdXRlSWQpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IGFjdGl2ZVJvdXRlSWQgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IFwiXCIgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY29vbGRvd25SZW1haW5pbmcgPSBNYXRoLm1heCgwLCBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgLSBnZXRBcHByb3hTZXJ2ZXJOb3coc3RhdGUpKTtcbiAgYnVzLmVtaXQoXCJtaXNzaWxlOmNvb2xkb3duVXBkYXRlZFwiLCB7IHNlY29uZHNSZW1haW5pbmc6IGNvb2xkb3duUmVtYWluaW5nIH0pO1xufVxuXG5mdW5jdGlvbiBkaWZmUm91dGVzKHByZXZSb3V0ZXM6IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4sIG5leHRSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdLCBidXM6IEV2ZW50QnVzKTogdm9pZCB7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCByb3V0ZSBvZiBuZXh0Um91dGVzKSB7XG4gICAgc2Vlbi5hZGQocm91dGUuaWQpO1xuICAgIGNvbnN0IHByZXYgPSBwcmV2Um91dGVzLmdldChyb3V0ZS5pZCk7XG4gICAgaWYgKCFwcmV2KSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChyb3V0ZS5uYW1lICE9PSBwcmV2Lm5hbWUpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpyb3V0ZVJlbmFtZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgbmFtZTogcm91dGUubmFtZSB9KTtcbiAgICB9XG4gICAgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPiBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgICB9IGVsc2UgaWYgKHJvdXRlLndheXBvaW50cy5sZW5ndGggPCBwcmV2LndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludERlbGV0ZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHByZXYud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfVxuICAgIGlmIChwcmV2LndheXBvaW50cy5sZW5ndGggPiAwICYmIHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTp3YXlwb2ludHNDbGVhcmVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgW3JvdXRlSWRdIG9mIHByZXZSb3V0ZXMpIHtcbiAgICBpZiAoIXNlZW4uaGFzKHJvdXRlSWQpKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVEZWxldGVkXCIsIHsgcm91dGVJZCB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xvbmVSb3V0ZShyb3V0ZTogTWlzc2lsZVJvdXRlKTogTWlzc2lsZVJvdXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogcm91dGUuaWQsXG4gICAgbmFtZTogcm91dGUubmFtZSxcbiAgICB3YXlwb2ludHM6IHJvdXRlLndheXBvaW50cy5tYXAoKHdwKSA9PiAoeyAuLi53cCB9KSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHNhZmVQYXJzZSh2YWx1ZTogdW5rbm93bik6IFNlcnZlclN0YXRlTWVzc2FnZSB8IG51bGwge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSkgYXMgU2VydmVyU3RhdGVNZXNzYWdlO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLndhcm4oXCJbd3NdIGZhaWxlZCB0byBwYXJzZSBtZXNzYWdlXCIsIGVycik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShzdGF0ZS5ub3cpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgY29uc3Qgc3luY2VkQXQgPSBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93U3luY2VkQXQpID8gc3RhdGUubm93U3luY2VkQXQgOiBudWxsO1xuICBpZiAoIXN5bmNlZEF0KSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICBjb25zdCBlbGFwc2VkTXMgPSBtb25vdG9uaWNOb3coKSAtIHN5bmNlZEF0O1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShlbGFwc2VkTXMpIHx8IGVsYXBzZWRNcyA8IDApIHtcbiAgICByZXR1cm4gc3RhdGUubm93O1xuICB9XG4gIHJldHVybiBzdGF0ZS5ub3cgKyBlbGFwc2VkTXMgLyAxMDAwO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0SGVhdFZpZXcoc2VydmVySGVhdDogU2VydmVySGVhdFZpZXcsIG5vd1N5bmNlZEF0TXM6IG51bWJlciwgc2VydmVyTm93U2VjOiBudW1iZXIpOiBpbXBvcnQoXCIuL3N0YXRlXCIpLkhlYXRWaWV3IHtcbiAgLy8gQ29udmVydCBzZXJ2ZXIgdGltZSAoc3RhbGxVbnRpbCBpbiBzZWNvbmRzKSB0byBjbGllbnQgdGltZSAobWlsbGlzZWNvbmRzKVxuICAvLyBzdGFsbFVudGlsIGlzIGFic29sdXRlIHNlcnZlciB0aW1lLCBzbyB3ZSBuZWVkIHRvIGNvbnZlcnQgaXQgdG8gY2xpZW50IHRpbWVcbiAgY29uc3Qgc2VydmVyU3RhbGxVbnRpbFNlYyA9IHNlcnZlckhlYXQuc3U7XG4gIGNvbnN0IG9mZnNldEZyb21Ob3dTZWMgPSBzZXJ2ZXJTdGFsbFVudGlsU2VjIC0gc2VydmVyTm93U2VjO1xuICBjb25zdCBzdGFsbFVudGlsTXMgPSBub3dTeW5jZWRBdE1zICsgKG9mZnNldEZyb21Ob3dTZWMgKiAxMDAwKTtcblxuICBjb25zdCBoZWF0VmlldyA9IHtcbiAgICB2YWx1ZTogc2VydmVySGVhdC52LFxuICAgIG1heDogc2VydmVySGVhdC5tLFxuICAgIHdhcm5BdDogc2VydmVySGVhdC53LFxuICAgIG92ZXJoZWF0QXQ6IHNlcnZlckhlYXQubyxcbiAgICBtYXJrZXJTcGVlZDogc2VydmVySGVhdC5tcyxcbiAgICBzdGFsbFVudGlsTXM6IHN0YWxsVW50aWxNcyxcbiAgICBrVXA6IHNlcnZlckhlYXQua3UsXG4gICAga0Rvd246IHNlcnZlckhlYXQua2QsXG4gICAgZXhwOiBzZXJ2ZXJIZWF0LmV4LFxuICB9O1xuICByZXR1cm4gaGVhdFZpZXc7XG59XG4iLCAiLy8gU2hhcmVkIHJvdXRlIHBsYW5uaW5nIG1vZHVsZSBmb3Igc2hpcHMgYW5kIG1pc3NpbGVzXG4vLyBQaGFzZSAxOiBTaGFyZWQgTW9kZWwgJiBIZWxwZXJzXG5cbmltcG9ydCB7IGNsYW1wIH0gZnJvbSBcIi4vc3RhdGVcIjtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVHlwZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGludGVyZmFjZSBSb3V0ZVdheXBvaW50IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHNwZWVkPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlUG9pbnRzIHtcbiAgd2F5cG9pbnRzOiBSb3V0ZVdheXBvaW50W107XG4gIHdvcmxkUG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXTtcbiAgY2FudmFzUG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQ29uc3RhbnRzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBjb25zdCBXQVlQT0lOVF9ISVRfUkFESVVTID0gMTI7XG5leHBvcnQgY29uc3QgTEVHX0hJVF9ESVNUQU5DRSA9IDEwO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBCdWlsZGVyc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIEJ1aWxkcyByb3V0ZSBwb2ludHMgZnJvbSBhIHN0YXJ0IHBvc2l0aW9uIGFuZCB3YXlwb2ludHMuXG4gKiBJbmNsdWRlcyB3b3JsZCBjb29yZGluYXRlcyAod3JhcHBpbmcpIGFuZCBjYW52YXMgY29vcmRpbmF0ZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFJvdXRlUG9pbnRzKFxuICBzdGFydDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICB3YXlwb2ludHM6IFJvdXRlV2F5cG9pbnRbXSxcbiAgd29ybGQ6IHsgdzogbnVtYmVyOyBoOiBudW1iZXIgfSxcbiAgY2FtZXJhOiAoKSA9PiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gIHpvb206ICgpID0+IG51bWJlcixcbiAgd29ybGRUb0NhbnZhczogKHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSkgPT4geyB4OiBudW1iZXI7IHk6IG51bWJlciB9XG4pOiBSb3V0ZVBvaW50cyB7XG4gIGNvbnN0IHdvcmxkUG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXSA9IFt7IHg6IHN0YXJ0LngsIHk6IHN0YXJ0LnkgfV07XG5cbiAgZm9yIChjb25zdCB3cCBvZiB3YXlwb2ludHMpIHtcbiAgICB3b3JsZFBvaW50cy5wdXNoKHsgeDogd3AueCwgeTogd3AueSB9KTtcbiAgfVxuXG4gIGNvbnN0IGNhbnZhc1BvaW50cyA9IHdvcmxkUG9pbnRzLm1hcCgocG9pbnQpID0+IHdvcmxkVG9DYW52YXMocG9pbnQpKTtcblxuICByZXR1cm4ge1xuICAgIHdheXBvaW50czogd2F5cG9pbnRzLnNsaWNlKCksXG4gICAgd29ybGRQb2ludHMsXG4gICAgY2FudmFzUG9pbnRzLFxuICB9O1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBHZW9tZXRyeSAvIEhpdC10ZXN0XG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZGlzdGFuY2UgZnJvbSBhIHBvaW50IHRvIGEgbGluZSBzZWdtZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcG9pbnRTZWdtZW50RGlzdGFuY2UoXG4gIHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSxcbiAgYTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LFxuICBiOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1cbik6IG51bWJlciB7XG4gIGNvbnN0IGFieCA9IGIueCAtIGEueDtcbiAgY29uc3QgYWJ5ID0gYi55IC0gYS55O1xuICBjb25zdCBhcHggPSBwLnggLSBhLng7XG4gIGNvbnN0IGFweSA9IHAueSAtIGEueTtcbiAgY29uc3QgYWJMZW5TcSA9IGFieCAqIGFieCArIGFieSAqIGFieTtcbiAgY29uc3QgdCA9IGFiTGVuU3EgPT09IDAgPyAwIDogY2xhbXAoYXB4ICogYWJ4ICsgYXB5ICogYWJ5LCAwLCBhYkxlblNxKSAvIGFiTGVuU3E7XG4gIGNvbnN0IHByb2p4ID0gYS54ICsgYWJ4ICogdDtcbiAgY29uc3QgcHJvankgPSBhLnkgKyBhYnkgKiB0O1xuICBjb25zdCBkeCA9IHAueCAtIHByb2p4O1xuICBjb25zdCBkeSA9IHAueSAtIHByb2p5O1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG4vKipcbiAqIEhpdC10ZXN0cyBhIHJvdXRlIGFnYWluc3QgYSBjYW52YXMgcG9pbnQuXG4gKiBSZXR1cm5zIHRoZSBoaXQgdHlwZSBhbmQgaW5kZXgsIG9yIG51bGwgaWYgbm8gaGl0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGl0VGVzdFJvdXRlR2VuZXJpYyhcbiAgY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSxcbiAgcm91dGVQb2ludHM6IFJvdXRlUG9pbnRzLFxuICBvcHRzOiB7XG4gICAgd2F5cG9pbnRIaXRSYWRpdXM/OiBudW1iZXI7XG4gICAgbGVnSGl0RGlzdGFuY2U/OiBudW1iZXI7XG4gICAgc2tpcExlZ3M/OiBib29sZWFuO1xuICB9ID0ge31cbik6IHsgdHlwZTogXCJ3YXlwb2ludFwiIHwgXCJsZWdcIjsgaW5kZXg6IG51bWJlciB9IHwgbnVsbCB7XG4gIGNvbnN0IHdheXBvaW50SGl0UmFkaXVzID0gb3B0cy53YXlwb2ludEhpdFJhZGl1cyA/PyBXQVlQT0lOVF9ISVRfUkFESVVTO1xuICBjb25zdCBsZWdIaXREaXN0YW5jZSA9IG9wdHMubGVnSGl0RGlzdGFuY2UgPz8gTEVHX0hJVF9ESVNUQU5DRTtcbiAgY29uc3Qgc2tpcExlZ3MgPSBvcHRzLnNraXBMZWdzID8/IGZhbHNlO1xuXG4gIGNvbnN0IHsgd2F5cG9pbnRzLCBjYW52YXNQb2ludHMgfSA9IHJvdXRlUG9pbnRzO1xuXG4gIGlmICh3YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBDaGVjayB3YXlwb2ludHMgZmlyc3QgKGhpZ2hlciBwcmlvcml0eSB0aGFuIGxlZ3MpXG4gIC8vIFNraXAgaW5kZXggMCB3aGljaCBpcyB0aGUgc3RhcnQgcG9zaXRpb25cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB3cENhbnZhcyA9IGNhbnZhc1BvaW50c1tpICsgMV07IC8vICsxIGJlY2F1c2UgZmlyc3QgcG9pbnQgaXMgc3RhcnQgcG9zaXRpb25cbiAgICBjb25zdCBkeCA9IGNhbnZhc1BvaW50LnggLSB3cENhbnZhcy54O1xuICAgIGNvbnN0IGR5ID0gY2FudmFzUG9pbnQueSAtIHdwQ2FudmFzLnk7XG4gICAgaWYgKE1hdGguaHlwb3QoZHgsIGR5KSA8PSB3YXlwb2ludEhpdFJhZGl1cykge1xuICAgICAgcmV0dXJuIHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogaSB9O1xuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGxlZ3MgKGxvd2VyIHByaW9yaXR5KVxuICBpZiAoIXNraXBMZWdzKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGRpc3QgPSBwb2ludFNlZ21lbnREaXN0YW5jZShjYW52YXNQb2ludCwgY2FudmFzUG9pbnRzW2ldLCBjYW52YXNQb2ludHNbaSArIDFdKTtcbiAgICAgIGlmIChkaXN0IDw9IGxlZ0hpdERpc3RhbmNlKSB7XG4gICAgICAgIHJldHVybiB7IHR5cGU6IFwibGVnXCIsIGluZGV4OiBpIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIERhc2ggQW5pbWF0aW9uXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogVXBkYXRlcyBkYXNoIG9mZnNldHMgZm9yIHJvdXRlIGxlZ3MgdG8gY3JlYXRlIG1hcmNoaW5nIGFudHMgYW5pbWF0aW9uLlxuICogTXV0YXRlcyB0aGUgcHJvdmlkZWQgc3RvcmUgbWFwLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlRGFzaE9mZnNldHNGb3JSb3V0ZShcbiAgc3RvcmU6IE1hcDxudW1iZXIsIG51bWJlcj4sXG4gIHdheXBvaW50czogQXJyYXk8eyBzcGVlZD86IG51bWJlciB9PixcbiAgd29ybGRQb2ludHM6IEFycmF5PHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4sXG4gIGNhbnZhc1BvaW50czogQXJyYXk8eyB4OiBudW1iZXI7IHk6IG51bWJlciB9PixcbiAgZmFsbGJhY2tTcGVlZDogbnVtYmVyLFxuICBkdFNlY29uZHM6IG51bWJlcixcbiAgY3ljbGUgPSA2NFxuKTogdm9pZCB7XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKGR0U2Vjb25kcykgfHwgZHRTZWNvbmRzIDwgMCkge1xuICAgIGR0U2Vjb25kcyA9IDA7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdwID0gd2F5cG9pbnRzW2ldO1xuICAgIGNvbnN0IHNwZWVkID0gdHlwZW9mIHdwLnNwZWVkID09PSBcIm51bWJlclwiICYmIHdwLnNwZWVkID4gMCA/IHdwLnNwZWVkIDogZmFsbGJhY2tTcGVlZDtcbiAgICBjb25zdCBhV29ybGQgPSB3b3JsZFBvaW50c1tpXTtcbiAgICBjb25zdCBiV29ybGQgPSB3b3JsZFBvaW50c1tpICsgMV07XG4gICAgY29uc3Qgd29ybGREaXN0ID0gTWF0aC5oeXBvdChiV29ybGQueCAtIGFXb3JsZC54LCBiV29ybGQueSAtIGFXb3JsZC55KTtcbiAgICBjb25zdCBhQ2FudmFzID0gY2FudmFzUG9pbnRzW2ldO1xuICAgIGNvbnN0IGJDYW52YXMgPSBjYW52YXNQb2ludHNbaSArIDFdO1xuICAgIGNvbnN0IGNhbnZhc0Rpc3QgPSBNYXRoLmh5cG90KGJDYW52YXMueCAtIGFDYW52YXMueCwgYkNhbnZhcy55IC0gYUNhbnZhcy55KTtcblxuICAgIGlmIChcbiAgICAgICFOdW1iZXIuaXNGaW5pdGUoc3BlZWQpIHx8XG4gICAgICBzcGVlZCA8PSAxZS0zIHx8XG4gICAgICAhTnVtYmVyLmlzRmluaXRlKHdvcmxkRGlzdCkgfHxcbiAgICAgIHdvcmxkRGlzdCA8PSAxZS0zIHx8XG4gICAgICBjYW52YXNEaXN0IDw9IDFlLTNcbiAgICApIHtcbiAgICAgIHN0b3JlLnNldChpLCAwKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChkdFNlY29uZHMgPD0gMCkge1xuICAgICAgaWYgKCFzdG9yZS5oYXMoaSkpIHtcbiAgICAgICAgc3RvcmUuc2V0KGksIDApO1xuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NhbGUgPSBjYW52YXNEaXN0IC8gd29ybGREaXN0O1xuICAgIGNvbnN0IGRhc2hTcGVlZCA9IHNwZWVkICogc2NhbGU7XG4gICAgbGV0IG5leHQgPSAoc3RvcmUuZ2V0KGkpID8/IDApIC0gZGFzaFNwZWVkICogZHRTZWNvbmRzO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG5leHQpKSB7XG4gICAgICBuZXh0ID0gMDtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCA9ICgobmV4dCAlIGN5Y2xlKSArIGN5Y2xlKSAlIGN5Y2xlO1xuICAgIH1cbiAgICBzdG9yZS5zZXQoaSwgbmV4dCk7XG4gIH1cbiAgLy8gQ2xlYW4gdXAgb2xkIGtleXNcbiAgZm9yIChjb25zdCBrZXkgb2YgQXJyYXkuZnJvbShzdG9yZS5rZXlzKCkpKSB7XG4gICAgaWYgKGtleSA+PSB3YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBzdG9yZS5kZWxldGUoa2V5KTtcbiAgICB9XG4gIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gSGVhdCBQcm9qZWN0aW9uXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGVhdFByb2plY3Rpb25QYXJhbXMge1xuICBtYXJrZXJTcGVlZDogbnVtYmVyO1xuICBrVXA6IG51bWJlcjtcbiAga0Rvd246IG51bWJlcjtcbiAgZXhwOiBudW1iZXI7XG4gIG1heDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlYXRQcm9qZWN0aW9uUmVzdWx0IHtcbiAgaGVhdEF0V2F5cG9pbnRzOiBudW1iZXJbXTtcbiAgd2lsbE92ZXJoZWF0OiBib29sZWFuO1xuICBvdmVyaGVhdEF0PzogbnVtYmVyOyAvLyBJbmRleCB3aGVyZSBvdmVyaGVhdCBvY2N1cnNcbn1cblxuLyoqXG4gKiBQcm9qZWN0cyBoZWF0IGFsb25nIGEgcm91dGUgZ2l2ZW4gaW5pdGlhbCBoZWF0IGFuZCBoZWF0IHBhcmFtZXRlcnMuXG4gKiBSZXR1cm5zIGhlYXQgYXQgZWFjaCB3YXlwb2ludCBhbmQgd2hldGhlciBvdmVyaGVhdCB3aWxsIG9jY3VyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdFJvdXRlSGVhdChcbiAgcm91dGU6IFJvdXRlV2F5cG9pbnRbXSxcbiAgaW5pdGlhbEhlYXQ6IG51bWJlcixcbiAgcGFyYW1zOiBIZWF0UHJvamVjdGlvblBhcmFtc1xuKTogSGVhdFByb2plY3Rpb25SZXN1bHQge1xuICBjb25zdCByZXN1bHQ6IEhlYXRQcm9qZWN0aW9uUmVzdWx0ID0ge1xuICAgIGhlYXRBdFdheXBvaW50czogW10sXG4gICAgd2lsbE92ZXJoZWF0OiBmYWxzZSxcbiAgfTtcblxuICBpZiAocm91dGUubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGxldCBoZWF0ID0gY2xhbXAoaW5pdGlhbEhlYXQsIDAsIHBhcmFtcy5tYXgpO1xuICBsZXQgcG9zID0geyB4OiByb3V0ZVswXS54LCB5OiByb3V0ZVswXS55IH07XG4gIGxldCBjdXJyZW50U3BlZWQgPSByb3V0ZVswXS5zcGVlZCA/PyBwYXJhbXMubWFya2VyU3BlZWQ7XG5cbiAgcmVzdWx0LmhlYXRBdFdheXBvaW50cy5wdXNoKGhlYXQpO1xuXG4gIGZvciAobGV0IGkgPSAxOyBpIDwgcm91dGUubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB0YXJnZXRQb3MgPSByb3V0ZVtpXTtcbiAgICBjb25zdCB0YXJnZXRTcGVlZCA9IHRhcmdldFBvcy5zcGVlZCA/PyBwYXJhbXMubWFya2VyU3BlZWQ7XG5cbiAgICAvLyBDYWxjdWxhdGUgZGlzdGFuY2UgYW5kIHRpbWVcbiAgICBjb25zdCBkeCA9IHRhcmdldFBvcy54IC0gcG9zLng7XG4gICAgY29uc3QgZHkgPSB0YXJnZXRQb3MueSAtIHBvcy55O1xuICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcblxuICAgIGlmIChkaXN0YW5jZSA8IDAuMDAxKSB7XG4gICAgICByZXN1bHQuaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBBdmVyYWdlIHNwZWVkIGR1cmluZyBzZWdtZW50XG4gICAgY29uc3QgYXZnU3BlZWQgPSAoY3VycmVudFNwZWVkICsgdGFyZ2V0U3BlZWQpICogMC41O1xuICAgIGNvbnN0IHNlZ21lbnRUaW1lID0gZGlzdGFuY2UgLyBNYXRoLm1heChhdmdTcGVlZCwgMSk7XG5cbiAgICAvLyBDYWxjdWxhdGUgaGVhdCByYXRlIChtYXRjaCBzZXJ2ZXIgZm9ybXVsYSlcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KHBhcmFtcy5tYXJrZXJTcGVlZCwgMC4wMDAwMDEpO1xuICAgIGNvbnN0IGRldiA9IGF2Z1NwZWVkIC0gcGFyYW1zLm1hcmtlclNwZWVkO1xuICAgIGNvbnN0IHAgPSBwYXJhbXMuZXhwO1xuXG4gICAgbGV0IGhkb3Q6IG51bWJlcjtcbiAgICBpZiAoZGV2ID49IDApIHtcbiAgICAgIC8vIEhlYXRpbmdcbiAgICAgIGhkb3QgPSBwYXJhbXMua1VwICogTWF0aC5wb3coZGV2IC8gVm4sIHApO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDb29saW5nXG4gICAgICBoZG90ID0gLXBhcmFtcy5rRG93biAqIE1hdGgucG93KE1hdGguYWJzKGRldikgLyBWbiwgcCk7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIGhlYXRcbiAgICBoZWF0ICs9IGhkb3QgKiBzZWdtZW50VGltZTtcbiAgICBoZWF0ID0gY2xhbXAoaGVhdCwgMCwgcGFyYW1zLm1heCk7XG5cbiAgICByZXN1bHQuaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG5cbiAgICAvLyBDaGVjayBmb3Igb3ZlcmhlYXRcbiAgICBpZiAoIXJlc3VsdC53aWxsT3ZlcmhlYXQgJiYgaGVhdCA+PSBwYXJhbXMub3ZlcmhlYXRBdCkge1xuICAgICAgcmVzdWx0LndpbGxPdmVyaGVhdCA9IHRydWU7XG4gICAgICByZXN1bHQub3ZlcmhlYXRBdCA9IGk7XG4gICAgfVxuXG4gICAgcG9zID0geyB4OiB0YXJnZXRQb3MueCwgeTogdGFyZ2V0UG9zLnkgfTtcbiAgICBjdXJyZW50U3BlZWQgPSB0YXJnZXRTcGVlZDtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ29tcGF0aWJpbGl0eSB3cmFwcGVyIGZvciBtaXNzaWxlIGhlYXQgcHJvamVjdGlvbi5cbiAqIE1pc3NpbGVzIHN0YXJ0IGF0IHplcm8gaGVhdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3RNaXNzaWxlSGVhdENvbXBhdChcbiAgcm91dGU6IFJvdXRlV2F5cG9pbnRbXSxcbiAgZGVmYXVsdFNwZWVkOiBudW1iZXIsXG4gIGhlYXRQYXJhbXM6IEhlYXRQcm9qZWN0aW9uUGFyYW1zXG4pOiBIZWF0UHJvamVjdGlvblJlc3VsdCB7XG4gIC8vIE1pc3NpbGVzIHN0YXJ0IGF0IHplcm8gaGVhdFxuICAvLyBFbnN1cmUgYWxsIHdheXBvaW50cyBoYXZlIHNwZWVkIHNldCAodXNlIGRlZmF1bHQgaWYgbWlzc2luZylcbiAgY29uc3Qgcm91dGVXaXRoU3BlZWQgPSByb3V0ZS5tYXAoKHdwKSA9PiAoe1xuICAgIHg6IHdwLngsXG4gICAgeTogd3AueSxcbiAgICBzcGVlZDogd3Auc3BlZWQgPz8gZGVmYXVsdFNwZWVkLFxuICB9KSk7XG5cbiAgcmV0dXJuIHByb2plY3RSb3V0ZUhlYXQocm91dGVXaXRoU3BlZWQsIDAsIGhlYXRQYXJhbXMpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBSZW5kZXJpbmdcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBMaW5lYXIgY29sb3IgaW50ZXJwb2xhdGlvbiBiZXR3ZWVuIHR3byBSR0IgY29sb3JzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW50ZXJwb2xhdGVDb2xvcihcbiAgY29sb3IxOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sXG4gIGNvbG9yMjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdLFxuICB0OiBudW1iZXJcbik6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB7XG4gIHJldHVybiBbXG4gICAgTWF0aC5yb3VuZChjb2xvcjFbMF0gKyAoY29sb3IyWzBdIC0gY29sb3IxWzBdKSAqIHQpLFxuICAgIE1hdGgucm91bmQoY29sb3IxWzFdICsgKGNvbG9yMlsxXSAtIGNvbG9yMVsxXSkgKiB0KSxcbiAgICBNYXRoLnJvdW5kKGNvbG9yMVsyXSArIChjb2xvcjJbMl0gLSBjb2xvcjFbMl0pICogdCksXG4gIF07XG59XG5cbi8qKlxuICogQ29sb3IgcGFsZXR0ZSBmb3Igcm91dGUgcmVuZGVyaW5nLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlUGFsZXR0ZSB7XG4gIC8vIERlZmF1bHQgbGluZSBjb2xvciAod2hlbiBubyBoZWF0IGRhdGEpXG4gIGRlZmF1bHRMaW5lOiBzdHJpbmc7XG4gIC8vIFNlbGVjdGlvbiBoaWdobGlnaHQgY29sb3JcbiAgc2VsZWN0aW9uOiBzdHJpbmc7XG4gIC8vIFdheXBvaW50IGNvbG9yc1xuICB3YXlwb2ludERlZmF1bHQ6IHN0cmluZztcbiAgd2F5cG9pbnRTZWxlY3RlZDogc3RyaW5nO1xuICB3YXlwb2ludERyYWdnaW5nPzogc3RyaW5nO1xuICB3YXlwb2ludFN0cm9rZTogc3RyaW5nO1xuICB3YXlwb2ludFN0cm9rZVNlbGVjdGVkPzogc3RyaW5nO1xuICAvLyBIZWF0IGdyYWRpZW50IGNvbG9ycyAoZnJvbSBjb29sIHRvIGhvdClcbiAgaGVhdENvb2xSZ2I/OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG4gIGhlYXRIb3RSZ2I/OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG59XG5cbi8qKlxuICogRGVmYXVsdCBzaGlwIHBhbGV0dGUgKGJsdWUgdGhlbWUpLlxuICovXG5leHBvcnQgY29uc3QgU0hJUF9QQUxFVFRFOiBSb3V0ZVBhbGV0dGUgPSB7XG4gIGRlZmF1bHRMaW5lOiBcIiMzOGJkZjhcIixcbiAgc2VsZWN0aW9uOiBcIiNmOTczMTZcIixcbiAgd2F5cG9pbnREZWZhdWx0OiBcIiMzOGJkZjhcIixcbiAgd2F5cG9pbnRTZWxlY3RlZDogXCIjZjk3MzE2XCIsXG4gIHdheXBvaW50RHJhZ2dpbmc6IFwiI2ZhY2MxNVwiLFxuICB3YXlwb2ludFN0cm9rZTogXCIjMGYxNzJhXCIsXG4gIGhlYXRDb29sUmdiOiBbMTAwLCAxNTAsIDI1NV0sXG4gIGhlYXRIb3RSZ2I6IFsyNTUsIDUwLCA1MF0sXG59O1xuXG4vKipcbiAqIE1pc3NpbGUgcGFsZXR0ZSAocmVkIHRoZW1lKS5cbiAqL1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfUEFMRVRURTogUm91dGVQYWxldHRlID0ge1xuICBkZWZhdWx0TGluZTogXCIjZjg3MTcxYWFcIixcbiAgc2VsZWN0aW9uOiBcIiNmOTczMTZcIixcbiAgd2F5cG9pbnREZWZhdWx0OiBcIiNmODcxNzFcIixcbiAgd2F5cG9pbnRTZWxlY3RlZDogXCIjZmFjYzE1XCIsXG4gIHdheXBvaW50U3Ryb2tlOiBcIiM3ZjFkMWRcIixcbiAgd2F5cG9pbnRTdHJva2VTZWxlY3RlZDogXCIjODU0ZDBlXCIsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIERyYXdQbGFubmVkUm91dGVPcHRpb25zIHtcbiAgLy8gQ2FudmFzIHBvaW50cyBmb3IgdGhlIHJvdXRlXG4gIHJvdXRlUG9pbnRzOiBSb3V0ZVBvaW50cztcbiAgLy8gU2VsZWN0aW9uIHN0YXRlICh3aGljaCB3YXlwb2ludC9sZWcgaXMgc2VsZWN0ZWQpXG4gIHNlbGVjdGlvbjogeyB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiOyBpbmRleDogbnVtYmVyIH0gfCBudWxsO1xuICAvLyBEcmFnZ2VkIHdheXBvaW50IGluZGV4IChmb3IgZHJhZy1hbmQtZHJvcClcbiAgZHJhZ2dlZFdheXBvaW50PzogbnVtYmVyIHwgbnVsbDtcbiAgLy8gRGFzaCBhbmltYXRpb24gb2Zmc2V0c1xuICBkYXNoU3RvcmU6IE1hcDxudW1iZXIsIG51bWJlcj47XG4gIC8vIENvbG9yIHBhbGV0dGUgKGRlZmF1bHRzIHRvIHNoaXAgcGFsZXR0ZSlcbiAgcGFsZXR0ZT86IFJvdXRlUGFsZXR0ZTtcbiAgLy8gV2hldGhlciB0byBzaG93IHRoZSByb3V0ZSBsZWdzXG4gIHNob3dMZWdzOiBib29sZWFuO1xuICAvLyBIZWF0IHBhcmFtZXRlcnMgYW5kIGluaXRpYWwgaGVhdCAob3B0aW9uYWwpXG4gIGhlYXRQYXJhbXM/OiBIZWF0UHJvamVjdGlvblBhcmFtcztcbiAgaW5pdGlhbEhlYXQ/OiBudW1iZXI7XG4gIC8vIERlZmF1bHQgc3BlZWQgZm9yIHdheXBvaW50cyB3aXRob3V0IHNwZWVkIHNldFxuICBkZWZhdWx0U3BlZWQ6IG51bWJlcjtcbiAgLy8gV29ybGQgcG9pbnRzIChmb3IgaGVhdCBjYWxjdWxhdGlvbilcbiAgd29ybGRQb2ludHM/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXTtcbn1cblxuLyoqXG4gKiBEcmF3cyBhIHBsYW5uZWQgcm91dGUgKHNoaXAgb3IgbWlzc2lsZSkgd2l0aCB1bmlmaWVkIHZpc3VhbHMuXG4gKiBVc2VzIHNoaXAtc3R5bGUgcmVuZGVyaW5nIGJ5IGRlZmF1bHQsIHdpdGggb3B0aW9uYWwgcGFsZXR0ZSBvdmVycmlkZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRyYXdQbGFubmVkUm91dGUoXG4gIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuICBvcHRzOiBEcmF3UGxhbm5lZFJvdXRlT3B0aW9uc1xuKTogdm9pZCB7XG4gIGNvbnN0IHtcbiAgICByb3V0ZVBvaW50cyxcbiAgICBzZWxlY3Rpb24sXG4gICAgZHJhZ2dlZFdheXBvaW50LFxuICAgIGRhc2hTdG9yZSxcbiAgICBwYWxldHRlID0gU0hJUF9QQUxFVFRFLFxuICAgIHNob3dMZWdzLFxuICAgIGhlYXRQYXJhbXMsXG4gICAgaW5pdGlhbEhlYXQgPSAwLFxuICAgIGRlZmF1bHRTcGVlZCxcbiAgICB3b3JsZFBvaW50cyxcbiAgfSA9IG9wdHM7XG5cbiAgY29uc3QgeyB3YXlwb2ludHMsIGNhbnZhc1BvaW50cyB9ID0gcm91dGVQb2ludHM7XG5cbiAgaWYgKHdheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBDYWxjdWxhdGUgaGVhdCBwcm9qZWN0aW9uIGlmIGhlYXQgcGFyYW1zIGF2YWlsYWJsZVxuICBsZXQgaGVhdFByb2plY3Rpb246IEhlYXRQcm9qZWN0aW9uUmVzdWx0IHwgbnVsbCA9IG51bGw7XG4gIGlmIChoZWF0UGFyYW1zICYmIHdvcmxkUG9pbnRzICYmIHdvcmxkUG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCByb3V0ZUZvckhlYXQ6IFJvdXRlV2F5cG9pbnRbXSA9IHdvcmxkUG9pbnRzLm1hcCgocHQsIGkpID0+ICh7XG4gICAgICB4OiBwdC54LFxuICAgICAgeTogcHQueSxcbiAgICAgIHNwZWVkOiBpID09PSAwID8gdW5kZWZpbmVkIDogd2F5cG9pbnRzW2kgLSAxXT8uc3BlZWQgPz8gZGVmYXVsdFNwZWVkLFxuICAgIH0pKTtcbiAgICBoZWF0UHJvamVjdGlvbiA9IHByb2plY3RSb3V0ZUhlYXQocm91dGVGb3JIZWF0LCBpbml0aWFsSGVhdCwgaGVhdFBhcmFtcyk7XG4gIH1cblxuICAvLyBEcmF3IHJvdXRlIHNlZ21lbnRzXG4gIGlmIChzaG93TGVncykge1xuICAgIGxldCBjdXJyZW50SGVhdCA9IGluaXRpYWxIZWF0O1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGlzRmlyc3RMZWcgPSBpID09PSAwO1xuICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHNlbGVjdGlvbj8udHlwZSA9PT0gXCJsZWdcIiAmJiBzZWxlY3Rpb24uaW5kZXggPT09IGk7XG5cbiAgICAgIC8vIEdldCBoZWF0IGF0IGVuZCBvZiB0aGlzIHNlZ21lbnRcbiAgICAgIGxldCBzZWdtZW50SGVhdCA9IGN1cnJlbnRIZWF0O1xuICAgICAgaWYgKGhlYXRQcm9qZWN0aW9uICYmIGkgKyAxIDwgaGVhdFByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLmxlbmd0aCkge1xuICAgICAgICBzZWdtZW50SGVhdCA9IGhlYXRQcm9qZWN0aW9uLmhlYXRBdFdheXBvaW50c1tpICsgMV07XG4gICAgICB9XG5cbiAgICAgIC8vIENhbGN1bGF0ZSBoZWF0LWJhc2VkIGNvbG9yIGlmIGhlYXQgZGF0YSBhdmFpbGFibGVcbiAgICAgIGxldCBzdHJva2VTdHlsZTogc3RyaW5nO1xuICAgICAgbGV0IGxpbmVXaWR0aDogbnVtYmVyO1xuXG4gICAgICBpZiAoaXNTZWxlY3RlZCkge1xuICAgICAgICAvLyBTZWxlY3Rpb24gc3R5bGluZ1xuICAgICAgICBzdHJva2VTdHlsZSA9IHBhbGV0dGUuc2VsZWN0aW9uO1xuICAgICAgICBsaW5lV2lkdGggPSAzLjU7XG4gICAgICAgIGN0eC5zZXRMaW5lRGFzaChbNCwgNF0pO1xuICAgICAgfSBlbHNlIGlmIChoZWF0UHJvamVjdGlvbiAmJiBoZWF0UGFyYW1zICYmIHBhbGV0dGUuaGVhdENvb2xSZ2IgJiYgcGFsZXR0ZS5oZWF0SG90UmdiKSB7XG4gICAgICAgIC8vIEhlYXQtYmFzZWQgY29sb3IgaW50ZXJwb2xhdGlvbiAoc2hpcCBzdHlsZSlcbiAgICAgICAgY29uc3QgaGVhdFJhdGlvID0gY2xhbXAoc2VnbWVudEhlYXQgLyBoZWF0UGFyYW1zLm92ZXJoZWF0QXQsIDAsIDEpO1xuICAgICAgICBjb25zdCBjb2xvciA9IGludGVycG9sYXRlQ29sb3IocGFsZXR0ZS5oZWF0Q29vbFJnYiwgcGFsZXR0ZS5oZWF0SG90UmdiLCBoZWF0UmF0aW8pO1xuICAgICAgICBjb25zdCBiYXNlV2lkdGggPSBpc0ZpcnN0TGVnID8gMyA6IDEuNTtcbiAgICAgICAgbGluZVdpZHRoID0gYmFzZVdpZHRoICsgaGVhdFJhdGlvICogNDtcbiAgICAgICAgY29uc3QgYWxwaGEgPSBpc0ZpcnN0TGVnID8gMSA6IDAuNDtcbiAgICAgICAgc3Ryb2tlU3R5bGUgPSBgcmdiYSgke2NvbG9yWzBdfSwgJHtjb2xvclsxXX0sICR7Y29sb3JbMl19LCAke2FscGhhfSlgO1xuICAgICAgICBjdHguc2V0TGluZURhc2goaXNGaXJzdExlZyA/IFs2LCA2XSA6IFs4LCA4XSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEZWZhdWx0IHN0eWxpbmcgKG5vIGhlYXQpXG4gICAgICAgIGNvbnN0IGJhc2VXaWR0aCA9IGlzRmlyc3RMZWcgPyAzIDogMS41O1xuICAgICAgICBsaW5lV2lkdGggPSBiYXNlV2lkdGg7XG4gICAgICAgIHN0cm9rZVN0eWxlID0gaXNGaXJzdExlZyA/IHBhbGV0dGUuZGVmYXVsdExpbmUgOiBgJHtwYWxldHRlLmRlZmF1bHRMaW5lfTY2YDtcbiAgICAgICAgY3R4LnNldExpbmVEYXNoKGlzRmlyc3RMZWcgPyBbNiwgNl0gOiBbOCwgOF0pO1xuICAgICAgfVxuXG4gICAgICBjdHguc2F2ZSgpO1xuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gc3Ryb2tlU3R5bGU7XG4gICAgICBjdHgubGluZVdpZHRoID0gbGluZVdpZHRoO1xuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgY3R4LmxpbmVEYXNoT2Zmc2V0ID0gZGFzaFN0b3JlLmdldChpKSA/PyAwO1xuICAgICAgY3R4Lm1vdmVUbyhjYW52YXNQb2ludHNbaV0ueCwgY2FudmFzUG9pbnRzW2ldLnkpO1xuICAgICAgY3R4LmxpbmVUbyhjYW52YXNQb2ludHNbaSArIDFdLngsIGNhbnZhc1BvaW50c1tpICsgMV0ueSk7XG4gICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgICBjdXJyZW50SGVhdCA9IHNlZ21lbnRIZWF0O1xuICAgIH1cbiAgfVxuXG4gIC8vIERyYXcgd2F5cG9pbnQgbWFya2Vyc1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHB0ID0gY2FudmFzUG9pbnRzW2kgKyAxXTsgLy8gKzEgYmVjYXVzZSBmaXJzdCBwb2ludCBpcyBzdGFydCBwb3NpdGlvblxuICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3Rpb24/LnR5cGUgPT09IFwid2F5cG9pbnRcIiAmJiBzZWxlY3Rpb24uaW5kZXggPT09IGk7XG4gICAgY29uc3QgaXNEcmFnZ2luZyA9IGRyYWdnZWRXYXlwb2ludCA9PT0gaTtcblxuICAgIC8vIERldGVybWluZSBmaWxsIGNvbG9yXG4gICAgbGV0IGZpbGxDb2xvcjogc3RyaW5nO1xuICAgIGlmIChpc1NlbGVjdGVkKSB7XG4gICAgICBmaWxsQ29sb3IgPSBwYWxldHRlLndheXBvaW50U2VsZWN0ZWQ7XG4gICAgfSBlbHNlIGlmIChpc0RyYWdnaW5nICYmIHBhbGV0dGUud2F5cG9pbnREcmFnZ2luZykge1xuICAgICAgZmlsbENvbG9yID0gcGFsZXR0ZS53YXlwb2ludERyYWdnaW5nO1xuICAgIH0gZWxzZSBpZiAoaGVhdFByb2plY3Rpb24gJiYgaGVhdFBhcmFtcykge1xuICAgICAgLy8gSGVhdC1iYXNlZCB3YXlwb2ludCBjb2xvcmluZyAodGhyZXNob2xkLWJhc2VkIGZvciBtaXNzaWxlcylcbiAgICAgIGNvbnN0IGhlYXQgPSBoZWF0UHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHNbaSArIDFdID8/IDA7XG4gICAgICBjb25zdCBoZWF0UmF0aW8gPSBoZWF0IC8gaGVhdFBhcmFtcy5tYXg7XG4gICAgICBjb25zdCB3YXJuUmF0aW8gPSBoZWF0UGFyYW1zLndhcm5BdCAvIGhlYXRQYXJhbXMubWF4O1xuICAgICAgY29uc3Qgb3ZlcmhlYXRSYXRpbyA9IGhlYXRQYXJhbXMub3ZlcmhlYXRBdCAvIGhlYXRQYXJhbXMubWF4O1xuXG4gICAgICBpZiAoaGVhdFJhdGlvIDwgd2FyblJhdGlvKSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiIzMzYWEzM1wiOyAvLyBHcmVlblxuICAgICAgfSBlbHNlIGlmIChoZWF0UmF0aW8gPCBvdmVyaGVhdFJhdGlvKSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiI2ZmYWEzM1wiOyAvLyBPcmFuZ2VcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZpbGxDb2xvciA9IFwiI2ZmMzMzM1wiOyAvLyBSZWRcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZmlsbENvbG9yID0gcGFsZXR0ZS53YXlwb2ludERlZmF1bHQ7XG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIHN0cm9rZSBjb2xvclxuICAgIGNvbnN0IHN0cm9rZUNvbG9yID0gaXNTZWxlY3RlZCAmJiBwYWxldHRlLndheXBvaW50U3Ryb2tlU2VsZWN0ZWRcbiAgICAgID8gcGFsZXR0ZS53YXlwb2ludFN0cm9rZVNlbGVjdGVkXG4gICAgICA6IHBhbGV0dGUud2F5cG9pbnRTdHJva2U7XG5cbiAgICAvLyBEcmF3IHdheXBvaW50XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY29uc3QgcmFkaXVzID0gaXNTZWxlY3RlZCB8fCBpc0RyYWdnaW5nID8gNyA6IDU7XG4gICAgY3R4LmFyYyhwdC54LCBwdC55LCByYWRpdXMsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gZmlsbENvbG9yO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IGlzU2VsZWN0ZWQgfHwgaXNEcmFnZ2luZyA/IDAuOTUgOiAwLjg7XG4gICAgY3R4LmZpbGwoKTtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuICAgIGN0eC5saW5lV2lkdGggPSBpc1NlbGVjdGVkID8gMiA6IDEuNTtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHJva2VDb2xvcjtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7IGdldEFwcHJveFNlcnZlck5vdywgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi9uZXRcIjtcbmltcG9ydCB7XG4gIHR5cGUgQWN0aXZlVG9vbCxcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIHR5cGUgTWlzc2lsZVNlbGVjdGlvbixcbiAgdHlwZSBTZWxlY3Rpb24sXG4gIHR5cGUgVUlTdGF0ZSxcbiAgY2xhbXAsXG4gIHNhbml0aXplTWlzc2lsZUNvbmZpZyxcbiAgTUlTU0lMRV9QUkVTRVRTLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHtcbiAgTUlTU0lMRV9NSU5fU1BFRUQsXG4gIE1JU1NJTEVfTUFYX1NQRUVELFxuICBNSVNTSUxFX01JTl9BR1JPLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHtcbiAgYnVpbGRSb3V0ZVBvaW50cyxcbiAgaGl0VGVzdFJvdXRlR2VuZXJpYyxcbiAgdXBkYXRlRGFzaE9mZnNldHNGb3JSb3V0ZSxcbiAgcHJvamVjdFJvdXRlSGVhdCxcbiAgZHJhd1BsYW5uZWRSb3V0ZSxcbiAgU0hJUF9QQUxFVFRFLFxuICBNSVNTSUxFX1BBTEVUVEUsXG4gIFdBWVBPSU5UX0hJVF9SQURJVVMsXG4gIHR5cGUgUm91dGVQb2ludHMsXG4gIHR5cGUgSGVhdFByb2plY3Rpb25QYXJhbXMsXG59IGZyb20gXCIuL3JvdXRlXCI7XG5cbmludGVyZmFjZSBJbml0R2FtZU9wdGlvbnMge1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIHVpU3RhdGU6IFVJU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG59XG5cbmludGVyZmFjZSBHYW1lQ29udHJvbGxlciB7XG4gIG9uU3RhdGVVcGRhdGVkKCk6IHZvaWQ7XG59XG5cbmxldCBzdGF0ZVJlZjogQXBwU3RhdGU7XG5sZXQgdWlTdGF0ZVJlZjogVUlTdGF0ZTtcbmxldCBidXNSZWY6IEV2ZW50QnVzO1xuXG5sZXQgY3Y6IEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQgfCBudWxsID0gbnVsbDtcbmxldCBIUHNwYW46IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQga2lsbHNTcGFuOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBDb250cm9sc0NhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcENsZWFyQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTZXRCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNlbGVjdEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwUm91dGVzQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBSb3V0ZUxlZzogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwUm91dGVTcGVlZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzaGlwRGVsZXRlQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNoaXBTcGVlZENhcmQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNwZWVkU2xpZGVyOiBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2hpcFNwZWVkVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZVNwZWVkTWFya2VyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgbWlzc2lsZUNvbnRyb2xzQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWRkUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZUxhdW5jaEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlTGF1bmNoVGV4dDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlTGF1bmNoSW5mbzogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU2V0QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTZWxlY3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgbWlzc2lsZURlbGV0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlU3BlZWRDYXJkOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTcGVlZFNsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTcGVlZFZhbHVlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVBZ3JvQ2FyZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlQWdyb1NsaWRlcjogSFRNTElucHV0RWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVBZ3JvVmFsdWU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3Bhd25Cb3RCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3Bhd25Cb3RUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgcm91dGVQcmV2QnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJvdXRlTmV4dEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCByb3V0ZU1lbnVUb2dnbGU6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgcm91dGVNZW51OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBkZWxldGVNaXNzaWxlUm91dGVCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVSb3V0ZU5hbWVMYWJlbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtaXNzaWxlUm91dGVDb3VudExhYmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5sZXQgaGVscFRvZ2dsZTogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWxwQ2xvc2VCdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgaGVscFRleHQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbmxldCBoZWF0QmFyRmlsbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWF0QmFyUGxhbm5lZDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBoZWF0VmFsdWVUZXh0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHNwZWVkTWFya2VyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHN0YWxsT3ZlcmxheTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBtYXJrZXJBbGlnbmVkID0gZmFsc2U7XG5sZXQgaGVhdFdhcm5BY3RpdmUgPSBmYWxzZTtcbmxldCBzdGFsbEFjdGl2ZSA9IGZhbHNlO1xubGV0IGR1YWxNZXRlckFsZXJ0ID0gZmFsc2U7XG5cbmxldCBzZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xubGV0IG1pc3NpbGVTZWxlY3Rpb246IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcbmxldCBkZWZhdWx0U3BlZWQgPSAxNTA7XG5sZXQgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IDA7XG5sZXQgbGFzdExvb3BUczogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgbGFzdE1pc3NpbGVDb25maWdTZW50OiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5jb25zdCBzaGlwTGVnRGFzaE9mZnNldHMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuY29uc3QgbWlzc2lsZUxlZ0Rhc2hPZmZzZXRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbmxldCBsYXN0TWlzc2lsZUxhdW5jaFRleHRIVE1MID0gXCJcIjtcbmxldCBsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MID0gXCJcIjtcbmxldCBsYXN0VG91Y2hEaXN0YW5jZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgcGVuZGluZ1RvdWNoVGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcbmxldCBpc1BpbmNoaW5nID0gZmFsc2U7XG5cbi8vIFdheXBvaW50IGRyYWdnaW5nIHN0YXRlXG5sZXQgZHJhZ2dlZFdheXBvaW50OiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmxldCBkcmFnU3RhcnRQb3M6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xubGV0IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBNSU5fWk9PTSA9IDEuMDtcbmNvbnN0IE1BWF9aT09NID0gMy4wO1xuXG5jb25zdCBIRUxQX1RFWFQgPSBbXG4gIFwiUHJpbWFyeSBNb2Rlc1wiLFxuICBcIiAgMSBcdTIwMTMgVG9nZ2xlIHNoaXAgbmF2aWdhdGlvbiBtb2RlXCIsXG4gIFwiICAyIFx1MjAxMyBUb2dnbGUgbWlzc2lsZSBjb29yZGluYXRpb24gbW9kZVwiLFxuICBcIlwiLFxuICBcIlNoaXAgTmF2aWdhdGlvblwiLFxuICBcIiAgVCBcdTIwMTMgU3dpdGNoIGJldHdlZW4gc2V0L3NlbGVjdFwiLFxuICBcIiAgQyBcdTIwMTMgQ2xlYXIgYWxsIHdheXBvaW50c1wiLFxuICBcIiAgSCBcdTIwMTMgSG9sZCAoY2xlYXIgd2F5cG9pbnRzICYgc3RvcClcIixcbiAgXCIgIFIgXHUyMDEzIFRvZ2dsZSBzaG93IHJvdXRlXCIsXG4gIFwiICBbIC8gXSBcdTIwMTMgQWRqdXN0IHdheXBvaW50IHNwZWVkXCIsXG4gIFwiICBTaGlmdCtbIC8gXSBcdTIwMTMgQ29hcnNlIHNwZWVkIGFkanVzdFwiLFxuICBcIiAgVGFiIC8gU2hpZnQrVGFiIFx1MjAxMyBDeWNsZSB3YXlwb2ludHNcIixcbiAgXCIgIERlbGV0ZSBcdTIwMTMgRGVsZXRlIGZyb20gc2VsZWN0ZWQgd2F5cG9pbnRcIixcbiAgXCJcIixcbiAgXCJNaXNzaWxlIENvb3JkaW5hdGlvblwiLFxuICBcIiAgTiBcdTIwMTMgQWRkIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gIFwiICBMIFx1MjAxMyBMYXVuY2ggbWlzc2lsZXNcIixcbiAgXCIgIEUgXHUyMDEzIFN3aXRjaCBiZXR3ZWVuIHNldC9zZWxlY3RcIixcbiAgXCIgICwgLyAuIFx1MjAxMyBBZGp1c3QgYWdybyByYWRpdXNcIixcbiAgXCIgIDsgLyAnIFx1MjAxMyBBZGp1c3QgbWlzc2lsZSBzcGVlZFwiLFxuICBcIiAgU2hpZnQrc2xpZGVyIGtleXMgXHUyMDEzIENvYXJzZSBhZGp1c3RcIixcbiAgXCIgIERlbGV0ZSBcdTIwMTMgRGVsZXRlIHNlbGVjdGVkIG1pc3NpbGUgd2F5cG9pbnRcIixcbiAgXCJcIixcbiAgXCJNYXAgQ29udHJvbHNcIixcbiAgXCIgICsvLSBcdTIwMTMgWm9vbSBpbi9vdXRcIixcbiAgXCIgIEN0cmwrMCBcdTIwMTMgUmVzZXQgem9vbVwiLFxuICBcIiAgTW91c2Ugd2hlZWwgXHUyMDEzIFpvb20gYXQgY3Vyc29yXCIsXG4gIFwiICBQaW5jaCBcdTIwMTMgWm9vbSBvbiB0b3VjaCBkZXZpY2VzXCIsXG4gIFwiXCIsXG4gIFwiR2VuZXJhbFwiLFxuICBcIiAgPyBcdTIwMTMgVG9nZ2xlIHRoaXMgb3ZlcmxheVwiLFxuICBcIiAgRXNjIFx1MjAxMyBDYW5jZWwgc2VsZWN0aW9uIG9yIGNsb3NlIG92ZXJsYXlcIixcbl0uam9pbihcIlxcblwiKTtcblxuY29uc3Qgd29ybGQgPSB7IHc6IDgwMDAsIGg6IDQ1MDAgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRHYW1lKHsgc3RhdGUsIHVpU3RhdGUsIGJ1cyB9OiBJbml0R2FtZU9wdGlvbnMpOiBHYW1lQ29udHJvbGxlciB7XG4gIHN0YXRlUmVmID0gc3RhdGU7XG4gIHVpU3RhdGVSZWYgPSB1aVN0YXRlO1xuICBidXNSZWYgPSBidXM7XG5cbiAgY2FjaGVEb20oKTtcbiAgaWYgKCFjdikge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbnZhcyBlbGVtZW50ICNjdiBub3QgZm91bmRcIik7XG4gIH1cbiAgY3R4ID0gY3YuZ2V0Q29udGV4dChcIjJkXCIpO1xuXG4gIGJpbmRMaXN0ZW5lcnMoKTtcbiAgc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpO1xuICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgdXBkYXRlSGVscE92ZXJsYXkoKTtcbiAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9vcCk7XG5cbiAgcmV0dXJuIHtcbiAgICBvblN0YXRlVXBkYXRlZCgpIHtcbiAgICAgIHN5bmNNaXNzaWxlVUlGcm9tU3RhdGUoKTtcbiAgICAgIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICAgIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuICAgICAgdXBkYXRlU3RhdHVzSW5kaWNhdG9ycygpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNhY2hlRG9tKCk6IHZvaWQge1xuICBjdiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY3ZcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICBjdHggPSBjdj8uZ2V0Q29udGV4dChcIjJkXCIpID8/IG51bGw7XG4gIEhQc3BhbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1ocFwiKTtcbiAgc2hpcENvbnRyb2xzQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1jb250cm9sc1wiKTtcbiAgc2hpcENsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNsZWFyXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc2hpcFNldEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIHNoaXBSb3V0ZXNDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtcm91dGVzXCIpO1xuICBzaGlwUm91dGVMZWcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtcm91dGUtbGVnXCIpO1xuICBzaGlwUm91dGVTcGVlZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1yb3V0ZS1zcGVlZFwiKTtcbiAgc2hpcERlbGV0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1kZWxldGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBzaGlwU3BlZWRDYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLWNhcmRcIik7XG4gIHNoaXBTcGVlZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zcGVlZC1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIHNoaXBTcGVlZFZhbHVlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXZhbHVlXCIpO1xuXG4gIG1pc3NpbGVDb250cm9sc0NhcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtY29udHJvbHNcIik7XG4gIG1pc3NpbGVBZGRSb3V0ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1hZGQtcm91dGVcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlTGF1bmNoQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVMYXVuY2hUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWxhdW5jaC10ZXh0XCIpO1xuICBtaXNzaWxlTGF1bmNoSW5mbyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2gtaW5mb1wiKTtcbiAgbWlzc2lsZVNldEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zZXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU2VsZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNlbGVjdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVEZWxldGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtZGVsZXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgbWlzc2lsZVNwZWVkQ2FyZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1jYXJkXCIpO1xuICBtaXNzaWxlU3BlZWRTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtc2xpZGVyXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlU3BlZWRWYWx1ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC12YWx1ZVwiKTtcbiAgbWlzc2lsZUFncm9DYXJkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLWFncm8tY2FyZFwiKTtcbiAgbWlzc2lsZUFncm9TbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1zbGlkZXJcIikgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG4gIG1pc3NpbGVBZ3JvVmFsdWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby12YWx1ZVwiKTtcblxuICBzcGF3bkJvdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Bhd24tYm90XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgc3Bhd25Cb3RUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGF3bi1ib3QtdGV4dFwiKTtcbiAga2lsbHNTcGFuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWtpbGxzXCIpO1xuICByb3V0ZVByZXZCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZU5leHRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW5leHRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICByb3V0ZU1lbnVUb2dnbGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW1lbnUtdG9nZ2xlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgcm91dGVNZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3V0ZS1tZW51XCIpO1xuICByZW5hbWVNaXNzaWxlUm91dGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlbmFtZS1taXNzaWxlLXJvdXRlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbDtcbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWxldGUtbWlzc2lsZS1yb3V0ZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2xlYXItbWlzc2lsZS13YXlwb2ludHNcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICBtaXNzaWxlUm91dGVOYW1lTGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtcm91dGUtbmFtZVwiKTtcbiAgbWlzc2lsZVJvdXRlQ291bnRMYWJlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1yb3V0ZS1jb3VudFwiKTtcblxuICBoZWxwVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGhlbHBPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLW92ZXJsYXlcIik7XG4gIGhlbHBDbG9zZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGVscC1jbG9zZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIGhlbHBUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRleHRcIik7XG5cbiAgaGVhdEJhckZpbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlYXQtYmFyLWZpbGxcIik7XG4gIGhlYXRCYXJQbGFubmVkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWF0LWJhci1wbGFubmVkXCIpO1xuICBoZWF0VmFsdWVUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWF0LXZhbHVlLXRleHRcIik7XG4gIHNwZWVkTWFya2VyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGVlZC1tYXJrZXJcIik7XG4gIG1pc3NpbGVTcGVlZE1hcmtlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1zcGVlZC1tYXJrZXJcIik7XG4gIHN0YWxsT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhbGwtb3ZlcmxheVwiKTtcblxuICBkZWZhdWx0U3BlZWQgPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlcj8udmFsdWUgPz8gXCIxNTBcIik7XG4gIGlmIChtaXNzaWxlU3BlZWRTbGlkZXIpIHtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIuZGlzYWJsZWQgPSB0cnVlO1xuICB9XG59XG5cbmZ1bmN0aW9uIGJpbmRMaXN0ZW5lcnMoKTogdm9pZCB7XG4gIGlmICghY3YpIHJldHVybjtcbiAgY3YuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJkb3duXCIsIG9uQ2FudmFzUG9pbnRlckRvd24pO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcm1vdmVcIiwgb25DYW52YXNQb2ludGVyTW92ZSk7XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVydXBcIiwgb25DYW52YXNQb2ludGVyVXApO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcmNhbmNlbFwiLCBvbkNhbnZhc1BvaW50ZXJVcCk7XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJ3aGVlbFwiLCBvbkNhbnZhc1doZWVsLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICBjdi5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCBvbkNhbnZhc1RvdWNoU3RhcnQsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgb25DYW52YXNUb3VjaE1vdmUsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gIGN2LmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaGVuZFwiLCBvbkNhbnZhc1RvdWNoRW5kLCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuXG4gIHNwYXduQm90QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGlmIChzcGF3bkJvdEJ0bi5kaXNhYmxlZCkgcmV0dXJuO1xuXG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcInNwYXduX2JvdFwiIH0pO1xuICAgIGJ1c1JlZi5lbWl0KFwiYm90OnNwYXduUmVxdWVzdGVkXCIpO1xuXG4gICAgLy8gRGlzYWJsZSBidXR0b24gYW5kIHVwZGF0ZSB0ZXh0XG4gICAgc3Bhd25Cb3RCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgIGlmIChzcGF3bkJvdFRleHQpIHtcbiAgICAgIHNwYXduQm90VGV4dC50ZXh0Q29udGVudCA9IFwiU3Bhd25lZFwiO1xuICAgIH1cblxuICAgIC8vIFJlLWVuYWJsZSBhZnRlciA1IHNlY29uZHNcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmIChzcGF3bkJvdEJ0bikge1xuICAgICAgICBzcGF3bkJvdEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgfVxuICAgICAgaWYgKHNwYXduQm90VGV4dCkge1xuICAgICAgICBzcGF3bkJvdFRleHQudGV4dENvbnRlbnQgPSBcIkJvdFwiO1xuICAgICAgfVxuICAgIH0sIDUwMDApO1xuICB9KTtcblxuICBzaGlwQ2xlYXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICBjbGVhclNoaXBSb3V0ZSgpO1xuICAgIGJ1c1JlZi5lbWl0KFwic2hpcDpjbGVhckludm9rZWRcIik7XG4gIH0pO1xuXG4gIHNoaXBTZXRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcInNoaXAtc2V0XCIpO1xuICB9KTtcblxuICBzaGlwU2VsZWN0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNlbGVjdFwiKTtcbiAgfSk7XG5cbiAgc2hpcFNwZWVkU2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJzZUZsb2F0KChldmVudC50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHZhbHVlKSkgcmV0dXJuO1xuICAgIHVwZGF0ZVNwZWVkTGFiZWwodmFsdWUpO1xuICAgIGRlZmF1bHRTcGVlZCA9IHZhbHVlO1xuICAgIGlmIChzZWxlY3Rpb24gJiYgc3RhdGVSZWYubWUgJiYgQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpICYmIHN0YXRlUmVmLm1lLndheXBvaW50c1tzZWxlY3Rpb24uaW5kZXhdKSB7XG4gICAgICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwidXBkYXRlX3dheXBvaW50XCIsIGluZGV4OiBzZWxlY3Rpb24uaW5kZXgsIHNwZWVkOiB2YWx1ZSB9KTtcbiAgICAgIHN0YXRlUmVmLm1lLndheXBvaW50c1tzZWxlY3Rpb24uaW5kZXhdLnNwZWVkID0gdmFsdWU7XG4gICAgICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gICAgICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xuICAgIH1cbiAgICBjb25zdCBoZWF0ID0gc3RhdGVSZWYubWU/LmhlYXQ7XG4gICAgaWYgKGhlYXQpIHtcbiAgICAgIGNvbnN0IHRvbGVyYW5jZSA9IE1hdGgubWF4KDUsIGhlYXQubWFya2VyU3BlZWQgKiAwLjAyKTtcbiAgICAgIGNvbnN0IGRpZmYgPSBNYXRoLmFicyh2YWx1ZSAtIGhlYXQubWFya2VyU3BlZWQpO1xuICAgICAgY29uc3QgaW5SYW5nZSA9IGRpZmYgPD0gdG9sZXJhbmNlO1xuICAgICAgaWYgKGluUmFuZ2UgJiYgIW1hcmtlckFsaWduZWQpIHtcbiAgICAgICAgbWFya2VyQWxpZ25lZCA9IHRydWU7XG4gICAgICAgIGJ1c1JlZi5lbWl0KFwiaGVhdDptYXJrZXJBbGlnbmVkXCIsIHsgdmFsdWUsIG1hcmtlcjogaGVhdC5tYXJrZXJTcGVlZCB9KTtcbiAgICAgIH0gZWxzZSBpZiAoIWluUmFuZ2UgJiYgbWFya2VyQWxpZ25lZCkge1xuICAgICAgICBtYXJrZXJBbGlnbmVkID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG1hcmtlckFsaWduZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLCB7IHZhbHVlIH0pO1xuICB9KTtcblxuICBzaGlwRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRTaGlwV2F5cG9pbnQoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZUFkZFJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFkZF9taXNzaWxlX3JvdXRlXCIgfSk7XG4gIH0pO1xuXG4gIG1pc3NpbGVMYXVuY2hCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICBsYXVuY2hBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRBY3RpdmVUb29sKFwibWlzc2lsZS1zZXRcIik7XG4gIH0pO1xuXG4gIG1pc3NpbGVTZWxlY3RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2VsZWN0XCIpO1xuICB9KTtcblxuICBtaXNzaWxlRGVsZXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTtcbiAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6ZGVsZXRlSW52b2tlZFwiKTtcbiAgfSk7XG5cbiAgbWlzc2lsZVNwZWVkU2xpZGVyPy5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgaW5wdXRFbCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGlmIChpbnB1dEVsLmRpc2FibGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJhd1ZhbHVlID0gcGFyc2VGbG9hdChpbnB1dEVsLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShyYXdWYWx1ZSkpIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVTcGVlZENvbnRyb2xzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlIHx8ICFBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykpIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVTcGVlZENvbnRyb2xzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgbWlzc2lsZVNlbGVjdGlvbiAmJlxuICAgICAgbWlzc2lsZVNlbGVjdGlvbi50eXBlID09PSBcIndheXBvaW50XCIgJiZcbiAgICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPj0gMCAmJlxuICAgICAgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA8IHJvdXRlLndheXBvaW50cy5sZW5ndGhcbiAgICApIHtcbiAgICAgIGNvbnN0IG1pblNwZWVkID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5zcGVlZE1pbiA/PyBNSVNTSUxFX01JTl9TUEVFRDtcbiAgICAgIGNvbnN0IG1heFNwZWVkID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5zcGVlZE1heCA/PyBNSVNTSUxFX01BWF9TUEVFRDtcbiAgICAgIGNvbnN0IGNsYW1wZWRWYWx1ZSA9IGNsYW1wKHJhd1ZhbHVlLCBtaW5TcGVlZCwgbWF4U3BlZWQpO1xuICAgICAgY29uc3QgaWR4ID0gbWlzc2lsZVNlbGVjdGlvbi5pbmRleDtcbiAgICAgIHJvdXRlLndheXBvaW50c1tpZHhdID0geyAuLi5yb3V0ZS53YXlwb2ludHNbaWR4XSwgc3BlZWQ6IGNsYW1wZWRWYWx1ZSB9O1xuICAgICAgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IGNsYW1wZWRWYWx1ZTtcbiAgICAgIGlmIChtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgICAgICBtaXNzaWxlU3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IGAke2NsYW1wZWRWYWx1ZS50b0ZpeGVkKDApfWA7XG4gICAgICB9XG4gICAgICBzZW5kTWVzc2FnZSh7XG4gICAgICAgIHR5cGU6IFwidXBkYXRlX21pc3NpbGVfd2F5cG9pbnRfc3BlZWRcIixcbiAgICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgICBpbmRleDogaWR4LFxuICAgICAgICBzcGVlZDogY2xhbXBlZFZhbHVlLFxuICAgICAgfSk7XG4gICAgICBidXNSZWYuZW1pdChcIm1pc3NpbGU6c3BlZWRDaGFuZ2VkXCIsIHsgdmFsdWU6IGNsYW1wZWRWYWx1ZSwgaW5kZXg6IGlkeCB9KTtcbiAgICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHVwZGF0ZU1pc3NpbGVTcGVlZENvbnRyb2xzKCk7XG4gICAgfVxuICB9KTtcblxuICBtaXNzaWxlQWdyb1NsaWRlcj8uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyc2VGbG9hdCgoZXZlbnQudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybjtcbiAgICB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKHsgYWdyb1JhZGl1czogdmFsdWUgfSk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmFncm9DaGFuZ2VkXCIsIHsgdmFsdWUgfSk7XG4gIH0pO1xuXG4gIHJvdXRlUHJldkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKC0xKSk7XG4gIHJvdXRlTmV4dEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGN5Y2xlTWlzc2lsZVJvdXRlKDEpKTtcblxuICByb3V0ZU1lbnVUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGlmICghcm91dGVNZW51IHx8ICFyb3V0ZU1lbnUuY2xhc3NMaXN0LmNvbnRhaW5zKFwidmlzaWJsZVwiKSkgcmV0dXJuO1xuICAgIGlmIChldmVudC50YXJnZXQgPT09IHJvdXRlTWVudVRvZ2dsZSkgcmV0dXJuO1xuICAgIGlmIChyb3V0ZU1lbnUuY29udGFpbnMoZXZlbnQudGFyZ2V0IGFzIE5vZGUpKSByZXR1cm47XG4gICAgcm91dGVNZW51LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICB9KTtcblxuICByZW5hbWVNaXNzaWxlUm91dGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgcm91dGVNZW51Py5jbGFzc0xpc3QucmVtb3ZlKFwidmlzaWJsZVwiKTtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmICghcm91dGUpIHJldHVybjtcbiAgICBjb25zdCBuYW1lID0gd2luZG93LnByb21wdChcIlJlbmFtZSByb3V0ZVwiLCByb3V0ZS5uYW1lIHx8IFwiXCIpO1xuICAgIGlmIChuYW1lID09PSBudWxsKSByZXR1cm47XG4gICAgY29uc3QgdHJpbW1lZCA9IG5hbWUudHJpbSgpO1xuICAgIGlmICghdHJpbW1lZCkgcmV0dXJuO1xuICAgIHJvdXRlLm5hbWUgPSB0cmltbWVkO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJyZW5hbWVfbWlzc2lsZV9yb3V0ZVwiLFxuICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgcm91dGVfbmFtZTogdHJpbW1lZCxcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVsZXRlTWlzc2lsZVJvdXRlQnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHJvdXRlTWVudT8uY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm47XG4gICAgaWYgKCF3aW5kb3cuY29uZmlybShgRGVsZXRlICR7cm91dGUubmFtZX0/YCkpIHJldHVybjtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICAgIGlmIChyb3V0ZXMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHJvdXRlLndheXBvaW50cyA9IFtdO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGF0ZVJlZi5taXNzaWxlUm91dGVzID0gcm91dGVzLmZpbHRlcigocikgPT4gci5pZCAhPT0gcm91dGUuaWQpO1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubWlzc2lsZVJvdXRlcztcbiAgICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcmVtYWluaW5nLmxlbmd0aCA+IDAgPyByZW1haW5pbmdbMF0uaWQgOiBudWxsO1xuICAgIH1cbiAgICBtaXNzaWxlU2VsZWN0aW9uID0gbnVsbDtcbiAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgICBzZW5kTWVzc2FnZSh7XG4gICAgICB0eXBlOiBcImRlbGV0ZV9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIGNsZWFyTWlzc2lsZVdheXBvaW50c0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICByb3V0ZU1lbnU/LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gICAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc2VuZE1lc3NhZ2Uoe1xuICAgICAgdHlwZTogXCJjbGVhcl9taXNzaWxlX3JvdXRlXCIsXG4gICAgICByb3V0ZV9pZDogcm91dGUuaWQsXG4gICAgfSk7XG4gICAgcm91dGUud2F5cG9pbnRzID0gW107XG4gICAgbWlzc2lsZVNlbGVjdGlvbiA9IG51bGw7XG4gICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG4gIH0pO1xuXG4gIGhlbHBUb2dnbGU/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0SGVscFZpc2libGUodHJ1ZSk7XG4gIH0pO1xuXG4gIGhlbHBDbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXRIZWxwVmlzaWJsZShmYWxzZSk7XG4gIH0pO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbldpbmRvd0tleURvd24sIHsgY2FwdHVyZTogZmFsc2UgfSk7XG59XG5cbmZ1bmN0aW9uIHNldFpvb20obmV3Wm9vbTogbnVtYmVyLCBjZW50ZXJYPzogbnVtYmVyLCBjZW50ZXJZPzogbnVtYmVyKTogdm9pZCB7XG4gIHVpU3RhdGVSZWYuem9vbSA9IGNsYW1wKG5ld1pvb20sIE1JTl9aT09NLCBNQVhfWk9PTSk7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzV2hlZWwoZXZlbnQ6IFdoZWVsRXZlbnQpOiB2b2lkIHtcbiAgaWYgKCFjdikgcmV0dXJuO1xuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnN0IHJlY3QgPSBjdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3QgY2VudGVyWCA9IGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQ7XG4gIGNvbnN0IGNlbnRlclkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XG5cbiAgY29uc3QgZGVsdGEgPSBldmVudC5kZWx0YVk7XG4gIGNvbnN0IHpvb21GYWN0b3IgPSBkZWx0YSA+IDAgPyAwLjkgOiAxLjE7XG4gIGNvbnN0IG5ld1pvb20gPSB1aVN0YXRlUmVmLnpvb20gKiB6b29tRmFjdG9yO1xuXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gcmVjdC53aWR0aDtcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQ7XG4gIGNvbnN0IGNhbnZhc0NlbnRlclggPSBjZW50ZXJYICogc2NhbGVYO1xuICBjb25zdCBjYW52YXNDZW50ZXJZID0gY2VudGVyWSAqIHNjYWxlWTtcblxuICBzZXRab29tKG5ld1pvb20sIGNhbnZhc0NlbnRlclgsIGNhbnZhc0NlbnRlclkpO1xufVxuXG5mdW5jdGlvbiBnZXRUb3VjaERpc3RhbmNlKHRvdWNoZXM6IFRvdWNoTGlzdCk6IG51bWJlciB8IG51bGwge1xuICBpZiAodG91Y2hlcy5sZW5ndGggPCAyKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZHggPSB0b3VjaGVzWzBdLmNsaWVudFggLSB0b3VjaGVzWzFdLmNsaWVudFg7XG4gIGNvbnN0IGR5ID0gdG91Y2hlc1swXS5jbGllbnRZIC0gdG91Y2hlc1sxXS5jbGllbnRZO1xuICByZXR1cm4gTWF0aC5oeXBvdChkeCwgZHkpO1xufVxuXG5mdW5jdGlvbiBnZXRUb3VjaENlbnRlcih0b3VjaGVzOiBUb3VjaExpc3QpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCBudWxsIHtcbiAgaWYgKHRvdWNoZXMubGVuZ3RoIDwgMikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgeDogKHRvdWNoZXNbMF0uY2xpZW50WCArIHRvdWNoZXNbMV0uY2xpZW50WCkgLyAyLFxuICAgIHk6ICh0b3VjaGVzWzBdLmNsaWVudFkgKyB0b3VjaGVzWzFdLmNsaWVudFkpIC8gMlxuICB9O1xufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoU3RhcnQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAyKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBpc1BpbmNoaW5nID0gdHJ1ZTtcbiAgICBsYXN0VG91Y2hEaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG5cbiAgICAvLyBDYW5jZWwgYW55IHBlbmRpbmcgd2F5cG9pbnQgcGxhY2VtZW50XG4gICAgaWYgKHBlbmRpbmdUb3VjaFRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICAgIHBlbmRpbmdUb3VjaFRpbWVvdXQgPSBudWxsO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvbkNhbnZhc1RvdWNoTW92ZShldmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8IGV2ZW50LnRvdWNoZXMubGVuZ3RoICE9PSAyKSB7XG4gICAgbGFzdFRvdWNoRGlzdGFuY2UgPSBudWxsO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gIGNvbnN0IGN1cnJlbnREaXN0YW5jZSA9IGdldFRvdWNoRGlzdGFuY2UoZXZlbnQudG91Y2hlcyk7XG4gIGlmIChjdXJyZW50RGlzdGFuY2UgPT09IG51bGwgfHwgbGFzdFRvdWNoRGlzdGFuY2UgPT09IG51bGwpIHJldHVybjtcblxuICBjb25zdCByZWN0ID0gY3YuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGNvbnN0IGNlbnRlciA9IGdldFRvdWNoQ2VudGVyKGV2ZW50LnRvdWNoZXMpO1xuICBpZiAoIWNlbnRlcikgcmV0dXJuO1xuXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gcmVjdC53aWR0aDtcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gcmVjdC5oZWlnaHQ7XG4gIGNvbnN0IGNhbnZhc0NlbnRlclggPSAoY2VudGVyLnggLSByZWN0LmxlZnQpICogc2NhbGVYO1xuICBjb25zdCBjYW52YXNDZW50ZXJZID0gKGNlbnRlci55IC0gcmVjdC50b3ApICogc2NhbGVZO1xuXG4gIGNvbnN0IHpvb21GYWN0b3IgPSBjdXJyZW50RGlzdGFuY2UgLyBsYXN0VG91Y2hEaXN0YW5jZTtcbiAgY29uc3QgbmV3Wm9vbSA9IHVpU3RhdGVSZWYuem9vbSAqIHpvb21GYWN0b3I7XG5cbiAgc2V0Wm9vbShuZXdab29tLCBjYW52YXNDZW50ZXJYLCBjYW52YXNDZW50ZXJZKTtcbiAgbGFzdFRvdWNoRGlzdGFuY2UgPSBjdXJyZW50RGlzdGFuY2U7XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzVG91Y2hFbmQoZXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoIDwgMikge1xuICAgIGxhc3RUb3VjaERpc3RhbmNlID0gbnVsbDtcbiAgICAvLyBSZXNldCBwaW5jaGluZyBmbGFnIGFmdGVyIGEgc2hvcnQgZGVsYXkgdG8gcHJldmVudCB3YXlwb2ludCBwbGFjZW1lbnRcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlzUGluY2hpbmcgPSBmYWxzZTtcbiAgICB9LCAxMDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlckRvd24oZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICBpZiAoIWN2IHx8ICFjdHgpIHJldHVybjtcbiAgaWYgKGhlbHBPdmVybGF5Py5jbGFzc0xpc3QuY29udGFpbnMoXCJ2aXNpYmxlXCIpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChsYXN0VG91Y2hEaXN0YW5jZSAhPT0gbnVsbCB8fCBpc1BpbmNoaW5nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgcmVjdCA9IGN2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBjb25zdCBzY2FsZVggPSByZWN0LndpZHRoICE9PSAwID8gY3Yud2lkdGggLyByZWN0LndpZHRoIDogMTtcbiAgY29uc3Qgc2NhbGVZID0gcmVjdC5oZWlnaHQgIT09IDAgPyBjdi5oZWlnaHQgLyByZWN0LmhlaWdodCA6IDE7XG4gIGNvbnN0IHggPSAoZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdCkgKiBzY2FsZVg7XG4gIGNvbnN0IHkgPSAoZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wKSAqIHNjYWxlWTtcbiAgY29uc3QgY2FudmFzUG9pbnQgPSB7IHgsIHkgfTtcbiAgY29uc3Qgd29ybGRQb2ludCA9IGNhbnZhc1RvV29ybGQoY2FudmFzUG9pbnQpO1xuXG4gIGNvbnN0IGNvbnRleHQgPSB1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIgPyBcIm1pc3NpbGVcIiA6IFwic2hpcFwiO1xuXG4gIC8vIENoZWNrIGlmIGNsaWNraW5nIG9uIHdheXBvaW50IGZvciBkcmFnZ2luZyAoc2hpcCBtb2RlICsgc2VsZWN0IHRvb2wpXG4gIGlmIChjb250ZXh0ID09PSBcInNoaXBcIiAmJiB1aVN0YXRlUmVmLnNoaXBUb29sID09PSBcInNlbGVjdFwiICYmIHN0YXRlUmVmLm1lPy53YXlwb2ludHMpIHtcbiAgICBjb25zdCB3cEluZGV4ID0gZmluZFdheXBvaW50QXRQb3NpdGlvbihjYW52YXNQb2ludCk7XG4gICAgaWYgKHdwSW5kZXggIT09IG51bGwpIHtcbiAgICAgIGRyYWdnZWRXYXlwb2ludCA9IHdwSW5kZXg7XG4gICAgICBkcmFnU3RhcnRQb3MgPSB7IHg6IGNhbnZhc1BvaW50LngsIHk6IGNhbnZhc1BvaW50LnkgfTtcbiAgICAgIGN2LnNldFBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuXG4gIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIiAmJiB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID09PSBcInNlbGVjdFwiKSB7XG4gICAgY29uc3QgaGl0ID0gaGl0VGVzdE1pc3NpbGVSb3V0ZXMoY2FudmFzUG9pbnQpO1xuICAgIGlmIChoaXQpIHtcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBjb25zdCB7IHJvdXRlLCBzZWxlY3Rpb246IG1pc3NpbGVTZWwgfSA9IGhpdDtcbiAgICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obWlzc2lsZVNlbCwgcm91dGUuaWQpO1xuICAgICAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgICAgIGlmIChtaXNzaWxlU2VsLnR5cGUgPT09IFwid2F5cG9pbnRcIikge1xuICAgICAgICBkcmFnZ2VkTWlzc2lsZVdheXBvaW50ID0gbWlzc2lsZVNlbC5pbmRleDtcbiAgICAgICAgZHJhZ1N0YXJ0UG9zID0geyB4OiBjYW52YXNQb2ludC54LCB5OiBjYW52YXNQb2ludC55IH07XG4gICAgICAgIGN2LnNldFBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk7XG4gIH1cblxuICAvLyBGb3IgdG91Y2ggZXZlbnRzLCBkZWxheSB3YXlwb2ludCBwbGFjZW1lbnQgdG8gYWxsb3cgZm9yIHBpbmNoIGdlc3R1cmUgZGV0ZWN0aW9uXG4gIC8vIEZvciBtb3VzZSBldmVudHMsIHBsYWNlIGltbWVkaWF0ZWx5XG4gIGlmIChldmVudC5wb2ludGVyVHlwZSA9PT0gXCJ0b3VjaFwiKSB7XG4gICAgaWYgKHBlbmRpbmdUb3VjaFRpbWVvdXQgIT09IG51bGwpIHtcbiAgICAgIGNsZWFyVGltZW91dChwZW5kaW5nVG91Y2hUaW1lb3V0KTtcbiAgICB9XG5cbiAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoaXNQaW5jaGluZykgcmV0dXJuOyAvLyBEb3VibGUtY2hlY2sgd2UncmUgbm90IHBpbmNoaW5nXG5cbiAgICAgIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgICBoYW5kbGVNaXNzaWxlUG9pbnRlcihjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgICB9XG4gICAgICBwZW5kaW5nVG91Y2hUaW1lb3V0ID0gbnVsbDtcbiAgICB9LCAxNTApOyAvLyAxNTBtcyBkZWxheSB0byBkZXRlY3QgcGluY2ggZ2VzdHVyZVxuICB9IGVsc2Uge1xuICAgIC8vIE1vdXNlL3BlbjogaW1tZWRpYXRlIHBsYWNlbWVudFxuICAgIGlmIChjb250ZXh0ID09PSBcIm1pc3NpbGVcIikge1xuICAgICAgaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQsIHdvcmxkUG9pbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBoYW5kbGVTaGlwUG9pbnRlcihjYW52YXNQb2ludCwgd29ybGRQb2ludCk7XG4gICAgfVxuICB9XG5cbiAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbn1cblxuZnVuY3Rpb24gb25DYW52YXNQb2ludGVyTW92ZShldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG4gIGlmICghY3YgfHwgIWN0eCkgcmV0dXJuO1xuXG4gIGNvbnN0IGRyYWdnaW5nU2hpcCA9IGRyYWdnZWRXYXlwb2ludCAhPT0gbnVsbCAmJiBkcmFnU3RhcnRQb3M7XG4gIGNvbnN0IGRyYWdnaW5nTWlzc2lsZSA9IGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgIT09IG51bGwgJiYgZHJhZ1N0YXJ0UG9zO1xuXG4gIGlmICghZHJhZ2dpbmdTaGlwICYmICFkcmFnZ2luZ01pc3NpbGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCByZWN0ID0gY3YuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGNvbnN0IHNjYWxlWCA9IHJlY3Qud2lkdGggIT09IDAgPyBjdi53aWR0aCAvIHJlY3Qud2lkdGggOiAxO1xuICBjb25zdCBzY2FsZVkgPSByZWN0LmhlaWdodCAhPT0gMCA/IGN2LmhlaWdodCAvIHJlY3QuaGVpZ2h0IDogMTtcbiAgY29uc3QgeCA9IChldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0KSAqIHNjYWxlWDtcbiAgY29uc3QgeSA9IChldmVudC5jbGllbnRZIC0gcmVjdC50b3ApICogc2NhbGVZO1xuICBjb25zdCBjYW52YXNQb2ludCA9IHsgeCwgeSB9O1xuICBjb25zdCB3b3JsZFBvaW50ID0gY2FudmFzVG9Xb3JsZChjYW52YXNQb2ludCk7XG5cbiAgLy8gQ2xhbXAgdG8gd29ybGQgYm91bmRzXG4gIGNvbnN0IHdvcmxkVyA9IHN0YXRlUmVmLndvcmxkTWV0YS53ID8/IDQwMDA7XG4gIGNvbnN0IHdvcmxkSCA9IHN0YXRlUmVmLndvcmxkTWV0YS5oID8/IDQwMDA7XG4gIGNvbnN0IGNsYW1wZWRYID0gY2xhbXAod29ybGRQb2ludC54LCAwLCB3b3JsZFcpO1xuICBjb25zdCBjbGFtcGVkWSA9IGNsYW1wKHdvcmxkUG9pbnQueSwgMCwgd29ybGRIKTtcblxuICBpZiAoZHJhZ2dpbmdTaGlwICYmIGRyYWdnZWRXYXlwb2ludCAhPT0gbnVsbCkge1xuICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgIHR5cGU6IFwibW92ZV93YXlwb2ludFwiLFxuICAgICAgaW5kZXg6IGRyYWdnZWRXYXlwb2ludCxcbiAgICAgIHg6IGNsYW1wZWRYLFxuICAgICAgeTogY2xhbXBlZFksXG4gICAgfSk7XG5cbiAgICBpZiAoc3RhdGVSZWYubWUgJiYgc3RhdGVSZWYubWUud2F5cG9pbnRzICYmIGRyYWdnZWRXYXlwb2ludCA8IHN0YXRlUmVmLm1lLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHN0YXRlUmVmLm1lLndheXBvaW50c1tkcmFnZ2VkV2F5cG9pbnRdLnggPSBjbGFtcGVkWDtcbiAgICAgIHN0YXRlUmVmLm1lLndheXBvaW50c1tkcmFnZ2VkV2F5cG9pbnRdLnkgPSBjbGFtcGVkWTtcbiAgICB9XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoZHJhZ2dpbmdNaXNzaWxlICYmIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgIT09IG51bGwpIHtcbiAgICBjb25zdCByb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgIGlmIChyb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgJiYgZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA8IHJvdXRlLndheXBvaW50cy5sZW5ndGgpIHtcbiAgICAgIHNlbmRNZXNzYWdlKHtcbiAgICAgICAgdHlwZTogXCJtb3ZlX21pc3NpbGVfd2F5cG9pbnRcIixcbiAgICAgICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgICAgICBpbmRleDogZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCxcbiAgICAgICAgeDogY2xhbXBlZFgsXG4gICAgICAgIHk6IGNsYW1wZWRZLFxuICAgICAgfSk7XG5cbiAgICAgIHJvdXRlLndheXBvaW50cyA9IHJvdXRlLndheXBvaW50cy5tYXAoKHdwLCBpZHgpID0+XG4gICAgICAgIGlkeCA9PT0gZHJhZ2dlZE1pc3NpbGVXYXlwb2ludCA/IHsgLi4ud3AsIHg6IGNsYW1wZWRYLCB5OiBjbGFtcGVkWSB9IDogd3BcbiAgICAgICk7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH1cbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG9uQ2FudmFzUG9pbnRlclVwKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgbGV0IHJlbGVhc2VkID0gZmFsc2U7XG5cbiAgaWYgKGRyYWdnZWRXYXlwb2ludCAhPT0gbnVsbCAmJiBzdGF0ZVJlZi5tZT8ud2F5cG9pbnRzKSB7XG4gICAgY29uc3Qgd3AgPSBzdGF0ZVJlZi5tZS53YXlwb2ludHNbZHJhZ2dlZFdheXBvaW50XTtcbiAgICBpZiAod3ApIHtcbiAgICAgIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludE1vdmVkXCIsIHtcbiAgICAgICAgaW5kZXg6IGRyYWdnZWRXYXlwb2ludCxcbiAgICAgICAgeDogd3AueCxcbiAgICAgICAgeTogd3AueSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBkcmFnZ2VkV2F5cG9pbnQgPSBudWxsO1xuICAgIHJlbGVhc2VkID0gdHJ1ZTtcbiAgfVxuXG4gIGlmIChkcmFnZ2VkTWlzc2lsZVdheXBvaW50ICE9PSBudWxsKSB7XG4gICAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgICBpZiAocm91dGUgJiYgcm91dGUud2F5cG9pbnRzICYmIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPCByb3V0ZS53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBjb25zdCB3cCA9IHJvdXRlLndheXBvaW50c1tkcmFnZ2VkTWlzc2lsZVdheXBvaW50XTtcbiAgICAgIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp3YXlwb2ludE1vdmVkXCIsIHtcbiAgICAgICAgcm91dGVJZDogcm91dGUuaWQsXG4gICAgICAgIGluZGV4OiBkcmFnZ2VkTWlzc2lsZVdheXBvaW50LFxuICAgICAgICB4OiB3cC54LFxuICAgICAgICB5OiB3cC55LFxuICAgICAgfSk7XG4gICAgfVxuICAgIGRyYWdnZWRNaXNzaWxlV2F5cG9pbnQgPSBudWxsO1xuICAgIHJlbGVhc2VkID0gdHJ1ZTtcbiAgfVxuXG4gIGRyYWdTdGFydFBvcyA9IG51bGw7XG5cbiAgaWYgKHJlbGVhc2VkICYmIGN2KSB7XG4gICAgY3YucmVsZWFzZVBvaW50ZXJDYXB0dXJlKGV2ZW50LnBvaW50ZXJJZCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlU3BlZWRMYWJlbCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gIGlmIChzaGlwU3BlZWRWYWx1ZSkge1xuICAgIHNoaXBTcGVlZFZhbHVlLnRleHRDb250ZW50ID0gTnVtYmVyKHZhbHVlKS50b0ZpeGVkKDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldFNoaXBTbGlkZXJWYWx1ZSh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG4gIGlmICghc2hpcFNwZWVkU2xpZGVyKSByZXR1cm47XG4gIHNoaXBTcGVlZFNsaWRlci52YWx1ZSA9IFN0cmluZyh2YWx1ZSk7XG4gIHVwZGF0ZVNwZWVkTGFiZWwodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBlbnN1cmVBY3RpdmVNaXNzaWxlUm91dGUoKTogTWlzc2lsZVJvdXRlIHwgbnVsbCB7XG4gIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gIGlmIChyb3V0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSBudWxsO1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGlmICghc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgfHwgIXJvdXRlcy5zb21lKChyb3V0ZSkgPT4gcm91dGUuaWQgPT09IHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkKSkge1xuICAgIHN0YXRlUmVmLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gcm91dGVzWzBdLmlkO1xuICB9XG4gIHJldHVybiByb3V0ZXMuZmluZCgocm91dGUpID0+IHJvdXRlLmlkID09PSBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCkgPz8gbnVsbDtcbn1cblxuZnVuY3Rpb24gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk6IE1pc3NpbGVSb3V0ZSB8IG51bGwge1xuICByZXR1cm4gZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlck1pc3NpbGVSb3V0ZUNvbnRyb2xzKCk6IHZvaWQge1xuICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICBjb25zdCBhY3RpdmVSb3V0ZSA9IGdldEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICBpZiAobWlzc2lsZVJvdXRlTmFtZUxhYmVsKSB7XG4gICAgaWYgKCFhY3RpdmVSb3V0ZSkge1xuICAgICAgbWlzc2lsZVJvdXRlTmFtZUxhYmVsLnRleHRDb250ZW50ID0gcm91dGVzLmxlbmd0aCA9PT0gMCA/IFwiTm8gcm91dGVcIiA6IFwiUm91dGVcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgbWlzc2lsZVJvdXRlTmFtZUxhYmVsLnRleHRDb250ZW50ID0gYWN0aXZlUm91dGUubmFtZSB8fCBcIlJvdXRlXCI7XG4gICAgfVxuICB9XG5cbiAgaWYgKG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwpIHtcbiAgICBjb25zdCBjb3VudCA9IGFjdGl2ZVJvdXRlICYmIEFycmF5LmlzQXJyYXkoYWN0aXZlUm91dGUud2F5cG9pbnRzKSA/IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGggOiAwO1xuICAgIG1pc3NpbGVSb3V0ZUNvdW50TGFiZWwudGV4dENvbnRlbnQgPSBgJHtjb3VudH0gcHRzYDtcbiAgfVxuXG4gIGlmIChkZWxldGVNaXNzaWxlUm91dGVCdG4pIHtcbiAgICBkZWxldGVNaXNzaWxlUm91dGVCdG4uZGlzYWJsZWQgPSByb3V0ZXMubGVuZ3RoIDw9IDE7XG4gIH1cbiAgaWYgKHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bikge1xuICAgIHJlbmFtZU1pc3NpbGVSb3V0ZUJ0bi5kaXNhYmxlZCA9ICFhY3RpdmVSb3V0ZTtcbiAgfVxuICBpZiAoY2xlYXJNaXNzaWxlV2F5cG9pbnRzQnRuKSB7XG4gICAgY29uc3QgY291bnQgPSBhY3RpdmVSb3V0ZSAmJiBBcnJheS5pc0FycmF5KGFjdGl2ZVJvdXRlLndheXBvaW50cykgPyBhY3RpdmVSb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgICBjbGVhck1pc3NpbGVXYXlwb2ludHNCdG4uZGlzYWJsZWQgPSAhYWN0aXZlUm91dGUgfHwgY291bnQgPT09IDA7XG4gIH1cbiAgaWYgKHJvdXRlUHJldkJ0bikge1xuICAgIHJvdXRlUHJldkJ0bi5kaXNhYmxlZCA9IHJvdXRlcy5sZW5ndGggPD0gMTtcbiAgfVxuICBpZiAocm91dGVOZXh0QnRuKSB7XG4gICAgcm91dGVOZXh0QnRuLmRpc2FibGVkID0gcm91dGVzLmxlbmd0aCA8PSAxO1xuICB9XG5cbiAgdXBkYXRlTWlzc2lsZUxhdW5jaEJ1dHRvblN0YXRlKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gc3luY01pc3NpbGVVSUZyb21TdGF0ZSgpOiB2b2lkIHtcbiAgZW5zdXJlQWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGFjdGl2ZVJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IHJvdXRlSGFzU2VsZWN0aW9uID1cbiAgICAhIWFjdGl2ZVJvdXRlICYmXG4gICAgQXJyYXkuaXNBcnJheShhY3RpdmVSb3V0ZS53YXlwb2ludHMpICYmXG4gICAgISFtaXNzaWxlU2VsZWN0aW9uICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA+PSAwICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbi5pbmRleCA8IGFjdGl2ZVJvdXRlLndheXBvaW50cy5sZW5ndGg7XG4gIGlmICghcm91dGVIYXNTZWxlY3Rpb24pIHtcbiAgICBtaXNzaWxlU2VsZWN0aW9uID0gbnVsbDtcbiAgfVxuICBjb25zdCBjZmcgPSBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnO1xuICBhcHBseU1pc3NpbGVVSShjZmcpO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICByZWZyZXNoTWlzc2lsZVNlbGVjdGlvblVJKCk7XG59XG5cbmZ1bmN0aW9uIGFwcGx5TWlzc2lsZVVJKGNmZzogeyBzcGVlZDogbnVtYmVyOyBhZ3JvUmFkaXVzOiBudW1iZXIgfSk6IHZvaWQge1xuICBpZiAobWlzc2lsZUFncm9TbGlkZXIpIHtcbiAgICBjb25zdCBtaW5BZ3JvID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5hZ3JvTWluID8/IE1JU1NJTEVfTUlOX0FHUk87XG4gICAgY29uc3QgbWF4QWdybyA9IE1hdGgubWF4KDUwMDAsIE1hdGguY2VpbCgoY2ZnLmFncm9SYWRpdXMgKyA1MDApIC8gNTAwKSAqIDUwMCk7XG4gICAgbWlzc2lsZUFncm9TbGlkZXIubWluID0gU3RyaW5nKG1pbkFncm8pO1xuICAgIG1pc3NpbGVBZ3JvU2xpZGVyLm1heCA9IFN0cmluZyhtYXhBZ3JvKTtcbiAgICBtaXNzaWxlQWdyb1NsaWRlci52YWx1ZSA9IGNmZy5hZ3JvUmFkaXVzLnRvRml4ZWQoMCk7XG4gIH1cbiAgaWYgKG1pc3NpbGVBZ3JvVmFsdWUpIHtcbiAgICBtaXNzaWxlQWdyb1ZhbHVlLnRleHRDb250ZW50ID0gY2ZnLmFncm9SYWRpdXMudG9GaXhlZCgwKTtcbiAgfVxuICBpZiAoIWxhc3RNaXNzaWxlTGVnU3BlZWQgfHwgbGFzdE1pc3NpbGVMZWdTcGVlZCA8PSAwKSB7XG4gICAgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IGNmZy5zcGVlZDtcbiAgfVxuICB1cGRhdGVNaXNzaWxlU3BlZWRDb250cm9scygpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVNaXNzaWxlQ29uZmlnRnJvbVVJKG92ZXJyaWRlczogUGFydGlhbDx7IGFncm9SYWRpdXM6IG51bWJlciB9PiA9IHt9KTogdm9pZCB7XG4gIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnO1xuICBjb25zdCBjZmcgPSBzYW5pdGl6ZU1pc3NpbGVDb25maWcoXG4gICAge1xuICAgICAgc3BlZWQ6IGN1cnJlbnQuc3BlZWQsXG4gICAgICBhZ3JvUmFkaXVzOiBvdmVycmlkZXMuYWdyb1JhZGl1cyA/PyBjdXJyZW50LmFncm9SYWRpdXMsXG4gICAgfSxcbiAgICBjdXJyZW50LFxuICAgIHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMsXG4gICk7XG4gIHN0YXRlUmVmLm1pc3NpbGVDb25maWcgPSBjZmc7XG4gIGFwcGx5TWlzc2lsZVVJKGNmZyk7XG4gIGNvbnN0IGxhc3QgPSBsYXN0TWlzc2lsZUNvbmZpZ1NlbnQ7XG4gIGNvbnN0IG5lZWRzU2VuZCA9XG4gICAgIWxhc3QgfHxcbiAgICBNYXRoLmFicygobGFzdC5hZ3JvUmFkaXVzID8/IDApIC0gY2ZnLmFncm9SYWRpdXMpID4gNTtcbiAgaWYgKG5lZWRzU2VuZCkge1xuICAgIHNlbmRNaXNzaWxlQ29uZmlnKGNmZyk7XG4gIH1cbiAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgdXBkYXRlU3BlZWRNYXJrZXIoKTtcbn1cblxuZnVuY3Rpb24gc2VuZE1pc3NpbGVDb25maWcoY2ZnOiB7IHNwZWVkOiBudW1iZXI7IGFncm9SYWRpdXM6IG51bWJlciB9KTogdm9pZCB7XG4gIGxhc3RNaXNzaWxlQ29uZmlnU2VudCA9IHtcbiAgICBzcGVlZDogY2ZnLnNwZWVkLFxuICAgIGFncm9SYWRpdXM6IGNmZy5hZ3JvUmFkaXVzLFxuICB9O1xuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJjb25maWd1cmVfbWlzc2lsZVwiLFxuICAgIG1pc3NpbGVfc3BlZWQ6IGNmZy5zcGVlZCxcbiAgICBtaXNzaWxlX2Fncm86IGNmZy5hZ3JvUmFkaXVzLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gcmVmcmVzaFNoaXBTZWxlY3Rpb25VSSgpOiB2b2lkIHtcbiAgaWYgKCFzaGlwUm91dGVzQ29udGFpbmVyIHx8ICFzaGlwUm91dGVMZWcgfHwgIXNoaXBSb3V0ZVNwZWVkIHx8ICFzaGlwRGVsZXRlQnRuKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHdwcyA9IHN0YXRlUmVmLm1lICYmIEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWUud2F5cG9pbnRzKSA/IHN0YXRlUmVmLm1lLndheXBvaW50cyA6IFtdO1xuICBjb25zdCBoYXNWYWxpZFNlbGVjdGlvbiA9IHNlbGVjdGlvbiAhPT0gbnVsbCAmJiBzZWxlY3Rpb24uaW5kZXggPj0gMCAmJiBzZWxlY3Rpb24uaW5kZXggPCB3cHMubGVuZ3RoO1xuICBjb25zdCBpc1NoaXBDb250ZXh0ID0gdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwic2hpcFwiO1xuXG4gIHNoaXBSb3V0ZXNDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICBzaGlwUm91dGVzQ29udGFpbmVyLnN0eWxlLm9wYWNpdHkgPSBpc1NoaXBDb250ZXh0ID8gXCIxXCIgOiBcIjAuNlwiO1xuXG4gIGlmICghc3RhdGVSZWYubWUgfHwgIWhhc1ZhbGlkU2VsZWN0aW9uKSB7XG4gICAgc2hpcFJvdXRlTGVnLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICBzaGlwUm91dGVTcGVlZC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgc2hpcERlbGV0ZUJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgaWYgKGlzU2hpcENvbnRleHQpIHtcbiAgICAgIHNldFNoaXBTbGlkZXJWYWx1ZShkZWZhdWx0U3BlZWQpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoc2VsZWN0aW9uICE9PSBudWxsKSB7XG4gICAgY29uc3Qgd3AgPSB3cHNbc2VsZWN0aW9uLmluZGV4XTtcbiAgICBjb25zdCBzcGVlZCA9IHdwICYmIHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiA/IHdwLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuICAgIGlmIChpc1NoaXBDb250ZXh0ICYmIHNoaXBTcGVlZFNsaWRlciAmJiBNYXRoLmFicyhwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci52YWx1ZSkgLSBzcGVlZCkgPiAwLjI1KSB7XG4gICAgICBzZXRTaGlwU2xpZGVyVmFsdWUoc3BlZWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB1cGRhdGVTcGVlZExhYmVsKHNwZWVkKTtcbiAgICB9XG4gICAgY29uc3QgZGlzcGxheUluZGV4ID0gc2VsZWN0aW9uLmluZGV4ICsgMTtcbiAgICBzaGlwUm91dGVMZWcudGV4dENvbnRlbnQgPSBgJHtkaXNwbGF5SW5kZXh9YDtcbiAgICBzaGlwUm91dGVTcGVlZC50ZXh0Q29udGVudCA9IGAke3NwZWVkLnRvRml4ZWQoMCl9IHUvc2A7XG4gICAgc2hpcERlbGV0ZUJ0bi5kaXNhYmxlZCA9ICFpc1NoaXBDb250ZXh0O1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGNvbnN0IGNvdW50ID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzLmxlbmd0aCA6IDA7XG4gIGNvbnN0IGlzV2F5cG9pbnRTZWxlY3Rpb24gPVxuICAgIG1pc3NpbGVTZWxlY3Rpb24gIT09IG51bGwgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uICE9PSB1bmRlZmluZWQgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLnR5cGUgPT09IFwid2F5cG9pbnRcIiAmJlxuICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPj0gMCAmJlxuICAgIG1pc3NpbGVTZWxlY3Rpb24uaW5kZXggPCBjb3VudDtcbiAgaWYgKG1pc3NpbGVEZWxldGVCdG4pIHtcbiAgICBtaXNzaWxlRGVsZXRlQnRuLmRpc2FibGVkID0gIWlzV2F5cG9pbnRTZWxlY3Rpb247XG4gIH1cbiAgdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTogdm9pZCB7XG4gIGlmICghbWlzc2lsZVNwZWVkU2xpZGVyIHx8ICFtaXNzaWxlU3BlZWRWYWx1ZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IG1pblNwZWVkID0gc3RhdGVSZWYubWlzc2lsZUxpbWl0cy5zcGVlZE1pbiA/PyBNSVNTSUxFX01JTl9TUEVFRDtcbiAgY29uc3QgbWF4U3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWF4ID8/IE1JU1NJTEVfTUFYX1NQRUVEO1xuICBtaXNzaWxlU3BlZWRTbGlkZXIubWluID0gU3RyaW5nKG1pblNwZWVkKTtcbiAgbWlzc2lsZVNwZWVkU2xpZGVyLm1heCA9IFN0cmluZyhtYXhTcGVlZCk7XG5cbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgbGV0IHNsaWRlclZhbHVlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICBpZiAoXG4gICAgcm91dGUgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uICYmXG4gICAgbWlzc2lsZVNlbGVjdGlvbi50eXBlID09PSBcIndheXBvaW50XCIgJiZcbiAgICBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4ID49IDAgJiZcbiAgICBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IDwgcm91dGUud2F5cG9pbnRzLmxlbmd0aFxuICApIHtcbiAgICBjb25zdCB3cCA9IHJvdXRlLndheXBvaW50c1ttaXNzaWxlU2VsZWN0aW9uLmluZGV4XTtcbiAgICBjb25zdCB2YWx1ZSA9IHR5cGVvZiB3cC5zcGVlZCA9PT0gXCJudW1iZXJcIiAmJiB3cC5zcGVlZCA+IDAgPyB3cC5zcGVlZCA6IHN0YXRlUmVmLm1pc3NpbGVDb25maWcuc3BlZWQ7XG4gICAgc2xpZGVyVmFsdWUgPSBjbGFtcCh2YWx1ZSwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgICBpZiAoc2xpZGVyVmFsdWUgPiAwKSB7XG4gICAgICBsYXN0TWlzc2lsZUxlZ1NwZWVkID0gc2xpZGVyVmFsdWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKHNsaWRlclZhbHVlICE9PSBudWxsKSB7XG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyLmRpc2FibGVkID0gZmFsc2U7XG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyLnZhbHVlID0gc2xpZGVyVmFsdWUudG9GaXhlZCgwKTtcbiAgICBtaXNzaWxlU3BlZWRWYWx1ZS50ZXh0Q29udGVudCA9IGAke3NsaWRlclZhbHVlLnRvRml4ZWQoMCl9YDtcbiAgfSBlbHNlIHtcbiAgICBtaXNzaWxlU3BlZWRTbGlkZXIuZGlzYWJsZWQgPSB0cnVlO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHBhcnNlRmxvYXQobWlzc2lsZVNwZWVkU2xpZGVyLnZhbHVlKSkpIHtcbiAgICAgIG1pc3NpbGVTcGVlZFNsaWRlci52YWx1ZSA9IHN0YXRlUmVmLm1pc3NpbGVDb25maWcuc3BlZWQudG9GaXhlZCgwKTtcbiAgICB9XG4gICAgbWlzc2lsZVNwZWVkVmFsdWUudGV4dENvbnRlbnQgPSBcIi0tXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U2VsZWN0aW9uKHNlbDogU2VsZWN0aW9uIHwgbnVsbCk6IHZvaWQge1xuICBzZWxlY3Rpb24gPSBzZWw7XG4gIHJlZnJlc2hTaGlwU2VsZWN0aW9uVUkoKTtcbiAgY29uc3QgaW5kZXggPSBzZWxlY3Rpb24gPyBzZWxlY3Rpb24uaW5kZXggOiBudWxsO1xuICBidXNSZWYuZW1pdChcInNoaXA6bGVnU2VsZWN0ZWRcIiwgeyBpbmRleCB9KTtcbn1cblxuZnVuY3Rpb24gc2V0TWlzc2lsZVNlbGVjdGlvbihzZWw6IE1pc3NpbGVTZWxlY3Rpb24gfCBudWxsLCByb3V0ZUlkPzogc3RyaW5nKTogdm9pZCB7XG4gIG1pc3NpbGVTZWxlY3Rpb24gPSBzZWw7XG4gIGlmIChyb3V0ZUlkKSB7XG4gICAgc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQgPSByb3V0ZUlkO1xuICB9XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbiAgdXBkYXRlTWlzc2lsZVNwZWVkQ29udHJvbHMoKTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU2hpcFBvaW50ZXIoY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgd29ybGRQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogdm9pZCB7XG4gIGlmICghc3RhdGVSZWYubWUpIHJldHVybjtcbiAgaWYgKHVpU3RhdGVSZWYuc2hpcFRvb2wgPT09IFwic2VsZWN0XCIpIHtcbiAgICBjb25zdCBoaXQgPSBoaXRUZXN0Um91dGUoY2FudmFzUG9pbnQpO1xuICAgIC8vIENvbnZlcnQgZGlzcGxheSBpbmRleCB0byBhY3R1YWwgd2F5cG9pbnQgaW5kZXhcbiAgICBpZiAoaGl0KSB7XG4gICAgICBjb25zdCBhY3R1YWxJbmRleCA9IGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoaGl0LmluZGV4KTtcbiAgICAgIHNldFNlbGVjdGlvbih7IHR5cGU6IGhpdC50eXBlLCBpbmRleDogYWN0dWFsSW5kZXggfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3Qgd3AgPSB7IHg6IHdvcmxkUG9pbnQueCwgeTogd29ybGRQb2ludC55LCBzcGVlZDogZGVmYXVsdFNwZWVkIH07XG4gIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJhZGRfd2F5cG9pbnRcIiwgeDogd3AueCwgeTogd3AueSwgc3BlZWQ6IGRlZmF1bHRTcGVlZCB9KTtcbiAgY29uc3Qgd3BzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzLnNsaWNlKCkgOiBbXTtcbiAgd3BzLnB1c2god3ApO1xuICBzdGF0ZVJlZi5tZS53YXlwb2ludHMgPSB3cHM7XG4gIGJ1c1JlZi5lbWl0KFwic2hpcDp3YXlwb2ludEFkZGVkXCIsIHsgaW5kZXg6IHdwcy5sZW5ndGggLSAxIH0pO1xuICBzZXRTZWxlY3Rpb24obnVsbCk7XG4gIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG59XG5cbmZ1bmN0aW9uIGdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQoKTogbnVtYmVyIHtcbiAgY29uc3QgbWluU3BlZWQgPSBzdGF0ZVJlZi5taXNzaWxlTGltaXRzLnNwZWVkTWluID8/IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IHN0YXRlUmVmLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXggPz8gTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IGJhc2UgPSBsYXN0TWlzc2lsZUxlZ1NwZWVkID4gMCA/IGxhc3RNaXNzaWxlTGVnU3BlZWQgOiBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnLnNwZWVkO1xuICByZXR1cm4gY2xhbXAoYmFzZSwgbWluU3BlZWQsIG1heFNwZWVkKTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlTWlzc2lsZVBvaW50ZXIoY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgd29ybGRQb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlID0gZ2V0QWN0aXZlTWlzc2lsZVJvdXRlKCk7XG4gIGlmICghcm91dGUpIHJldHVybjtcblxuICBpZiAodWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9PT0gXCJzZWxlY3RcIikge1xuICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RNaXNzaWxlUm91dGVzKGNhbnZhc1BvaW50KTtcbiAgICBpZiAoaGl0KSB7XG4gICAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKGhpdC5zZWxlY3Rpb24sIGhpdC5yb3V0ZS5pZCk7XG4gICAgICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBzcGVlZCA9IGdldERlZmF1bHRNaXNzaWxlTGVnU3BlZWQoKTtcbiAgY29uc3Qgd3AgPSB7IHg6IHdvcmxkUG9pbnQueCwgeTogd29ybGRQb2ludC55LCBzcGVlZCB9O1xuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJhZGRfbWlzc2lsZV93YXlwb2ludFwiLFxuICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgICB4OiB3cC54LFxuICAgIHk6IHdwLnksXG4gICAgc3BlZWQ6IHdwLnNwZWVkLFxuICB9KTtcbiAgcm91dGUud2F5cG9pbnRzID0gcm91dGUud2F5cG9pbnRzID8gWy4uLnJvdXRlLndheXBvaW50cywgd3BdIDogW3dwXTtcbiAgbGFzdE1pc3NpbGVMZWdTcGVlZCA9IHNwZWVkO1xuICByZW5kZXJNaXNzaWxlUm91dGVDb250cm9scygpO1xuICBzZXRNaXNzaWxlU2VsZWN0aW9uKHsgdHlwZTogXCJ3YXlwb2ludFwiLCBpbmRleDogcm91dGUud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSwgcm91dGUuaWQpO1xuICBidXNSZWYuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleDogcm91dGUud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG59XG5cbmZ1bmN0aW9uIGNsZWFyU2hpcFJvdXRlKCk6IHZvaWQge1xuICBjb25zdCB3cHMgPSBzdGF0ZVJlZi5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMgOiBbXTtcbiAgaWYgKCF3cHMgfHwgd3BzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiY2xlYXJfd2F5cG9pbnRzXCIgfSk7XG4gIGlmIChzdGF0ZVJlZi5tZSkge1xuICAgIHN0YXRlUmVmLm1lLndheXBvaW50cyA9IFtdO1xuICB9XG4gIHNldFNlbGVjdGlvbihudWxsKTtcbiAgYnVzUmVmLmVtaXQoXCJzaGlwOndheXBvaW50c0NsZWFyZWRcIik7XG4gIHVwZGF0ZVBsYW5uZWRIZWF0QmFyKCk7XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk6IHZvaWQge1xuICBpZiAoIXNlbGVjdGlvbikgcmV0dXJuO1xuICBzZW5kTWVzc2FnZSh7IHR5cGU6IFwiZGVsZXRlX3dheXBvaW50XCIsIGluZGV4OiBzZWxlY3Rpb24uaW5kZXggfSk7XG4gIGlmIChzdGF0ZVJlZi5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykpIHtcbiAgICBzdGF0ZVJlZi5tZS53YXlwb2ludHMgPSBzdGF0ZVJlZi5tZS53YXlwb2ludHMuc2xpY2UoMCwgc2VsZWN0aW9uLmluZGV4KTtcbiAgfVxuICBidXNSZWYuZW1pdChcInNoaXA6d2F5cG9pbnREZWxldGVkXCIsIHsgaW5kZXg6IHNlbGVjdGlvbi5pbmRleCB9KTtcbiAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICB1cGRhdGVQbGFubmVkSGVhdEJhcigpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVTZWxlY3RlZE1pc3NpbGVXYXlwb2ludCgpOiB2b2lkIHtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgaWYgKCFyb3V0ZSB8fCAhbWlzc2lsZVNlbGVjdGlvbikgcmV0dXJuO1xuICBjb25zdCBpbmRleCA9IG1pc3NpbGVTZWxlY3Rpb24uaW5kZXg7XG4gIGlmICghQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IGluZGV4IDwgMCB8fCBpbmRleCA+PSByb3V0ZS53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHNlbmRNZXNzYWdlKHtcbiAgICB0eXBlOiBcImRlbGV0ZV9taXNzaWxlX3dheXBvaW50XCIsXG4gICAgcm91dGVfaWQ6IHJvdXRlLmlkLFxuICAgIGluZGV4LFxuICB9KTtcbiAgcm91dGUud2F5cG9pbnRzID0gWy4uLnJvdXRlLndheXBvaW50cy5zbGljZSgwLCBpbmRleCksIC4uLnJvdXRlLndheXBvaW50cy5zbGljZShpbmRleCArIDEpXTtcbiAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleCB9KTtcbiAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbn1cblxuZnVuY3Rpb24gbGF1bmNoQWN0aXZlTWlzc2lsZVJvdXRlKCk6IHZvaWQge1xuICBpZiAobWlzc2lsZUxhdW5jaEJ0bj8uZGlzYWJsZWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgaWYgKCFyb3V0ZSB8fCAhQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICBzZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogXCJsYXVuY2hfbWlzc2lsZVwiLFxuICAgIHJvdXRlX2lkOiByb3V0ZS5pZCxcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGN5Y2xlTWlzc2lsZVJvdXRlKGRpcmVjdGlvbjogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gIGlmIChyb3V0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGN1cnJlbnRJbmRleCA9IHJvdXRlcy5maW5kSW5kZXgoKHJvdXRlKSA9PiByb3V0ZS5pZCA9PT0gc3RhdGVSZWYuYWN0aXZlTWlzc2lsZVJvdXRlSWQpO1xuICBjb25zdCBiYXNlSW5kZXggPSBjdXJyZW50SW5kZXggPj0gMCA/IGN1cnJlbnRJbmRleCA6IDA7XG4gIGNvbnN0IG5leHRJbmRleCA9ICgoYmFzZUluZGV4ICsgZGlyZWN0aW9uKSAlIHJvdXRlcy5sZW5ndGggKyByb3V0ZXMubGVuZ3RoKSAlIHJvdXRlcy5sZW5ndGg7XG4gIGNvbnN0IG5leHRSb3V0ZSA9IHJvdXRlc1tuZXh0SW5kZXhdO1xuICBpZiAoIW5leHRSb3V0ZSkgcmV0dXJuO1xuICBzdGF0ZVJlZi5hY3RpdmVNaXNzaWxlUm91dGVJZCA9IG5leHRSb3V0ZS5pZDtcbiAgc2V0TWlzc2lsZVNlbGVjdGlvbihudWxsKTtcbiAgcmVuZGVyTWlzc2lsZVJvdXRlQ29udHJvbHMoKTtcbiAgc2VuZE1lc3NhZ2Uoe1xuICAgIHR5cGU6IFwic2V0X2FjdGl2ZV9taXNzaWxlX3JvdXRlXCIsXG4gICAgcm91dGVfaWQ6IG5leHRSb3V0ZS5pZCxcbiAgfSk7XG4gIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIiwgeyByb3V0ZUlkOiBuZXh0Um91dGUuaWQgfSk7XG59XG5cbmZ1bmN0aW9uIGN5Y2xlU2hpcFNlbGVjdGlvbihkaXJlY3Rpb246IG51bWJlcik6IHZvaWQge1xuICBjb25zdCB3cHMgPSBzdGF0ZVJlZi5tZSAmJiBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1lLndheXBvaW50cykgPyBzdGF0ZVJlZi5tZS53YXlwb2ludHMgOiBbXTtcbiAgaWYgKCF3cHMgfHwgd3BzLmxlbmd0aCA9PT0gMCkge1xuICAgIHNldFNlbGVjdGlvbihudWxsKTtcbiAgICByZXR1cm47XG4gIH1cbiAgbGV0IGluZGV4ID0gc2VsZWN0aW9uID8gc2VsZWN0aW9uLmluZGV4IDogZGlyZWN0aW9uID4gMCA/IC0xIDogd3BzLmxlbmd0aDtcbiAgaW5kZXggKz0gZGlyZWN0aW9uO1xuICBpZiAoaW5kZXggPCAwKSBpbmRleCA9IHdwcy5sZW5ndGggLSAxO1xuICBpZiAoaW5kZXggPj0gd3BzLmxlbmd0aCkgaW5kZXggPSAwO1xuICBzZXRTZWxlY3Rpb24oeyB0eXBlOiBcImxlZ1wiLCBpbmRleCB9KTtcbn1cblxuZnVuY3Rpb24gc2V0SW5wdXRDb250ZXh0KGNvbnRleHQ6IFwic2hpcFwiIHwgXCJtaXNzaWxlXCIpOiB2b2lkIHtcbiAgY29uc3QgbmV4dCA9IGNvbnRleHQgPT09IFwibWlzc2lsZVwiID8gXCJtaXNzaWxlXCIgOiBcInNoaXBcIjtcbiAgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBuZXh0KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID0gbmV4dDtcblxuICAvLyBBbHNvIHVwZGF0ZSBhY3RpdmVUb29sIHRvIG1hdGNoIHRoZSBjb250ZXh0IHRvIGtlZXAgYnV0dG9uIHN0YXRlcyBpbiBzeW5jXG4gIGlmIChuZXh0ID09PSBcInNoaXBcIikge1xuICAgIGNvbnN0IHNoaXBUb29sVG9Vc2UgPSB1aVN0YXRlUmVmLnNoaXBUb29sID09PSBcInNlbGVjdFwiID8gXCJzaGlwLXNlbGVjdFwiIDogXCJzaGlwLXNldFwiO1xuICAgIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgIT09IHNoaXBUb29sVG9Vc2UpIHtcbiAgICAgIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9IHNoaXBUb29sVG9Vc2U7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNvbnN0IG1pc3NpbGVUb29sVG9Vc2UgPSB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID09PSBcInNlbGVjdFwiID8gXCJtaXNzaWxlLXNlbGVjdFwiIDogXCJtaXNzaWxlLXNldFwiO1xuICAgIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgIT09IG1pc3NpbGVUb29sVG9Vc2UpIHtcbiAgICAgIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9IG1pc3NpbGVUb29sVG9Vc2U7XG4gICAgfVxuICB9XG5cbiAgYnVzUmVmLmVtaXQoXCJjb250ZXh0OmNoYW5nZWRcIiwgeyBjb250ZXh0OiBuZXh0IH0pO1xuICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xuICByZWZyZXNoU2hpcFNlbGVjdGlvblVJKCk7XG4gIHJlZnJlc2hNaXNzaWxlU2VsZWN0aW9uVUkoKTtcbn1cblxuZnVuY3Rpb24gc2V0QWN0aXZlVG9vbCh0b29sOiBBY3RpdmVUb29sKTogdm9pZCB7XG4gIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IHRvb2wpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPSB0b29sO1xuXG4gIC8vIFVwZGF0ZSBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IHN0YXRlc1xuICBpZiAodG9vbCA9PT0gXCJzaGlwLXNldFwiKSB7XG4gICAgdWlTdGF0ZVJlZi5zaGlwVG9vbCA9IFwic2V0XCI7XG4gICAgdWlTdGF0ZVJlZi5taXNzaWxlVG9vbCA9IG51bGw7XG4gICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICBidXNSZWYuZW1pdChcInNoaXA6dG9vbENoYW5nZWRcIiwgeyB0b29sOiBcInNldFwiIH0pO1xuICB9IGVsc2UgaWYgKHRvb2wgPT09IFwic2hpcC1zZWxlY3RcIikge1xuICAgIHVpU3RhdGVSZWYuc2hpcFRvb2wgPSBcInNlbGVjdFwiO1xuICAgIHVpU3RhdGVSZWYubWlzc2lsZVRvb2wgPSBudWxsO1xuICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgYnVzUmVmLmVtaXQoXCJzaGlwOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZWxlY3RcIiB9KTtcbiAgfSBlbHNlIGlmICh0b29sID09PSBcIm1pc3NpbGUtc2V0XCIpIHtcbiAgICB1aVN0YXRlUmVmLnNoaXBUb29sID0gbnVsbDtcbiAgICB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID0gXCJzZXRcIjtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIHNldE1pc3NpbGVTZWxlY3Rpb24obnVsbCk7XG4gICAgYnVzUmVmLmVtaXQoXCJtaXNzaWxlOnRvb2xDaGFuZ2VkXCIsIHsgdG9vbDogXCJzZXRcIiB9KTtcbiAgfSBlbHNlIGlmICh0b29sID09PSBcIm1pc3NpbGUtc2VsZWN0XCIpIHtcbiAgICB1aVN0YXRlUmVmLnNoaXBUb29sID0gbnVsbDtcbiAgICB1aVN0YXRlUmVmLm1pc3NpbGVUb29sID0gXCJzZWxlY3RcIjtcbiAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgIGJ1c1JlZi5lbWl0KFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiLCB7IHRvb2w6IFwic2VsZWN0XCIgfSk7XG4gIH1cblxuICB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpO1xufVxuXG5mdW5jdGlvbiBzZXRCdXR0b25TdGF0ZShidG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCwgYWN0aXZlOiBib29sZWFuKTogdm9pZCB7XG4gIGlmICghYnRuKSByZXR1cm47XG4gIGlmIChhY3RpdmUpIHtcbiAgICBidG4uZGF0YXNldC5zdGF0ZSA9IFwiYWN0aXZlXCI7XG4gICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBcInRydWVcIik7XG4gIH0gZWxzZSB7XG4gICAgZGVsZXRlIGJ0bi5kYXRhc2V0LnN0YXRlO1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgXCJmYWxzZVwiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVDb250cm9sSGlnaGxpZ2h0cygpOiB2b2lkIHtcbiAgc2V0QnV0dG9uU3RhdGUoc2hpcFNldEJ0biwgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcInNoaXAtc2V0XCIpO1xuICBzZXRCdXR0b25TdGF0ZShzaGlwU2VsZWN0QnRuLCB1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZWxlY3RcIik7XG4gIHNldEJ1dHRvblN0YXRlKG1pc3NpbGVTZXRCdG4sIHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKTtcbiAgc2V0QnV0dG9uU3RhdGUobWlzc2lsZVNlbGVjdEJ0biwgdWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2VsZWN0XCIpO1xuXG4gIGlmIChzaGlwQ29udHJvbHNDYXJkKSB7XG4gICAgc2hpcENvbnRyb2xzQ2FyZC5jbGFzc0xpc3QudG9nZ2xlKFwiYWN0aXZlXCIsIHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ID09PSBcInNoaXBcIik7XG4gIH1cbiAgaWYgKG1pc3NpbGVDb250cm9sc0NhcmQpIHtcbiAgICBtaXNzaWxlQ29udHJvbHNDYXJkLmNsYXNzTGlzdC50b2dnbGUoXCJhY3RpdmVcIiwgdWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXRIZWxwVmlzaWJsZShmbGFnOiBib29sZWFuKTogdm9pZCB7XG4gIHVpU3RhdGVSZWYuaGVscFZpc2libGUgPSBCb29sZWFuKGZsYWcpO1xuICB1cGRhdGVIZWxwT3ZlcmxheSgpO1xuICBidXNSZWYuZW1pdChcImhlbHA6dmlzaWJsZUNoYW5nZWRcIiwgeyB2aXNpYmxlOiB1aVN0YXRlUmVmLmhlbHBWaXNpYmxlIH0pO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIZWxwT3ZlcmxheSgpOiB2b2lkIHtcbiAgaWYgKCFoZWxwT3ZlcmxheSkgcmV0dXJuO1xuICBpZiAoaGVscFRleHQpIHtcbiAgICBoZWxwVGV4dC50ZXh0Q29udGVudCA9IEhFTFBfVEVYVDtcbiAgfVxuICBoZWxwT3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKFwidmlzaWJsZVwiLCB1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKTtcbn1cblxuZnVuY3Rpb24gYWRqdXN0U2xpZGVyVmFsdWUoaW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsLCBzdGVwczogbnVtYmVyLCBjb2Fyc2U6IGJvb2xlYW4pOiBudW1iZXIgfCBudWxsIHtcbiAgaWYgKCFpbnB1dCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHN0ZXAgPSBNYXRoLmFicyhwYXJzZUZsb2F0KGlucHV0LnN0ZXApKSB8fCAxO1xuICBjb25zdCBtdWx0aXBsaWVyID0gY29hcnNlID8gNCA6IDE7XG4gIGNvbnN0IG1pbiA9IE51bWJlci5pc0Zpbml0ZShwYXJzZUZsb2F0KGlucHV0Lm1pbikpID8gcGFyc2VGbG9hdChpbnB1dC5taW4pIDogLUluZmluaXR5O1xuICBjb25zdCBtYXggPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VGbG9hdChpbnB1dC5tYXgpKSA/IHBhcnNlRmxvYXQoaW5wdXQubWF4KSA6IEluZmluaXR5O1xuICBjb25zdCBjdXJyZW50ID0gcGFyc2VGbG9hdChpbnB1dC52YWx1ZSkgfHwgMDtcbiAgbGV0IG5leHQgPSBjdXJyZW50ICsgc3RlcHMgKiBzdGVwICogbXVsdGlwbGllcjtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShtaW4pKSBuZXh0ID0gTWF0aC5tYXgobWluLCBuZXh0KTtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShtYXgpKSBuZXh0ID0gTWF0aC5taW4obWF4LCBuZXh0KTtcbiAgaWYgKE1hdGguYWJzKG5leHQgLSBjdXJyZW50KSA8IDFlLTQpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICBpbnB1dC52YWx1ZSA9IFN0cmluZyhuZXh0KTtcbiAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoXCJpbnB1dFwiLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICByZXR1cm4gbmV4dDtcbn1cblxuZnVuY3Rpb24gb25XaW5kb3dLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gIGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBjb25zdCBpc0VkaXRhYmxlID0gISF0YXJnZXQgJiYgKHRhcmdldC50YWdOYW1lID09PSBcIklOUFVUXCIgfHwgdGFyZ2V0LnRhZ05hbWUgPT09IFwiVEVYVEFSRUFcIiB8fCB0YXJnZXQuaXNDb250ZW50RWRpdGFibGUpO1xuXG4gIGlmICh1aVN0YXRlUmVmLmhlbHBWaXNpYmxlICYmIGV2ZW50LmtleSAhPT0gXCJFc2NhcGVcIikge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGlzRWRpdGFibGUpIHtcbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiKSB7XG4gICAgICB0YXJnZXQuYmx1cigpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc3dpdGNoIChldmVudC5jb2RlKSB7XG4gICAgY2FzZSBcIkRpZ2l0MVwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkRpZ2l0MlwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleVRcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmFjdGl2ZVRvb2wgPT09IFwic2hpcC1zZXRcIikge1xuICAgICAgICBzZXRBY3RpdmVUb29sKFwic2hpcC1zZWxlY3RcIik7XG4gICAgICB9IGVsc2UgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJzaGlwLXNlbGVjdFwiKSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNldFwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJzaGlwLXNldFwiKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIktleUNcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBjbGVhclNoaXBSb3V0ZSgpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5SFwiOlxuICAgICAgLy8gSCBrZXk6IEhvbGQgcG9zaXRpb24gKGNsZWFyIGFsbCB3YXlwb2ludHMsIHN0b3Agc2hpcClcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBjbGVhclNoaXBSb3V0ZSgpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiQnJhY2tldExlZnRcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShzaGlwU3BlZWRTbGlkZXIsIC0xLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJCcmFja2V0UmlnaHRcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcInNoaXBcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShzaGlwU3BlZWRTbGlkZXIsIDEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIlRhYlwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIGN5Y2xlU2hpcFNlbGVjdGlvbihldmVudC5zaGlmdEtleSA/IC0xIDogMSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJLZXlOXCI6XG4gICAgICBzZXRJbnB1dENvbnRleHQoXCJtaXNzaWxlXCIpO1xuICAgICAgbWlzc2lsZUFkZFJvdXRlQnRuPy5jbGljaygpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5TFwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGxhdW5jaEFjdGl2ZU1pc3NpbGVSb3V0ZSgpO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiS2V5RVwiOlxuICAgICAgaWYgKHVpU3RhdGVSZWYuYWN0aXZlVG9vbCA9PT0gXCJtaXNzaWxlLXNldFwiKSB7XG4gICAgICAgIHNldEFjdGl2ZVRvb2woXCJtaXNzaWxlLXNlbGVjdFwiKTtcbiAgICAgIH0gZWxzZSBpZiAodWlTdGF0ZVJlZi5hY3RpdmVUb29sID09PSBcIm1pc3NpbGUtc2VsZWN0XCIpIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2V0XCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0QWN0aXZlVG9vbChcIm1pc3NpbGUtc2V0XCIpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiQ29tbWFcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBhZGp1c3RTbGlkZXJWYWx1ZShtaXNzaWxlQWdyb1NsaWRlciwgLTEsIGV2ZW50LnNoaWZ0S2V5KTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIlBlcmlvZFwiOlxuICAgICAgc2V0SW5wdXRDb250ZXh0KFwibWlzc2lsZVwiKTtcbiAgICAgIGFkanVzdFNsaWRlclZhbHVlKG1pc3NpbGVBZ3JvU2xpZGVyLCAxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJTZW1pY29sb25cIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBpZiAobWlzc2lsZVNwZWVkU2xpZGVyICYmICFtaXNzaWxlU3BlZWRTbGlkZXIuZGlzYWJsZWQpIHtcbiAgICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCAtMSwgZXZlbnQuc2hpZnRLZXkpO1xuICAgICAgfVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICBjYXNlIFwiUXVvdGVcIjpcbiAgICAgIHNldElucHV0Q29udGV4dChcIm1pc3NpbGVcIik7XG4gICAgICBpZiAobWlzc2lsZVNwZWVkU2xpZGVyICYmICFtaXNzaWxlU3BlZWRTbGlkZXIuZGlzYWJsZWQpIHtcbiAgICAgICAgYWRqdXN0U2xpZGVyVmFsdWUobWlzc2lsZVNwZWVkU2xpZGVyLCAxLCBldmVudC5zaGlmdEtleSk7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJEZWxldGVcIjpcbiAgICBjYXNlIFwiQmFja3NwYWNlXCI6XG4gICAgICBpZiAodWlTdGF0ZVJlZi5pbnB1dENvbnRleHQgPT09IFwibWlzc2lsZVwiICYmIG1pc3NpbGVTZWxlY3Rpb24pIHtcbiAgICAgICAgZGVsZXRlU2VsZWN0ZWRNaXNzaWxlV2F5cG9pbnQoKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VsZWN0aW9uKSB7XG4gICAgICAgIGRlbGV0ZVNlbGVjdGVkU2hpcFdheXBvaW50KCk7XG4gICAgICB9XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJFc2NhcGVcIjpcbiAgICAgIGlmICh1aVN0YXRlUmVmLmhlbHBWaXNpYmxlKSB7XG4gICAgICAgIHNldEhlbHBWaXNpYmxlKGZhbHNlKTtcbiAgICAgIH0gZWxzZSBpZiAobWlzc2lsZVNlbGVjdGlvbikge1xuICAgICAgICBzZXRNaXNzaWxlU2VsZWN0aW9uKG51bGwpO1xuICAgICAgfSBlbHNlIGlmIChzZWxlY3Rpb24pIHtcbiAgICAgICAgc2V0U2VsZWN0aW9uKG51bGwpO1xuICAgICAgfSBlbHNlIGlmICh1aVN0YXRlUmVmLmlucHV0Q29udGV4dCA9PT0gXCJtaXNzaWxlXCIpIHtcbiAgICAgICAgc2V0SW5wdXRDb250ZXh0KFwic2hpcFwiKTtcbiAgICAgIH1cbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICByZXR1cm47XG4gICAgY2FzZSBcIkVxdWFsXCI6XG4gICAgY2FzZSBcIk51bXBhZEFkZFwiOlxuICAgICAgaWYgKCFjdikgcmV0dXJuO1xuICAgICAgc2V0Wm9vbSh1aVN0YXRlUmVmLnpvb20gKiAxLjIsIGN2LndpZHRoIC8gMiwgY3YuaGVpZ2h0IC8gMik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJNaW51c1wiOlxuICAgIGNhc2UgXCJOdW1wYWRTdWJ0cmFjdFwiOlxuICAgICAgaWYgKCFjdikgcmV0dXJuO1xuICAgICAgc2V0Wm9vbSh1aVN0YXRlUmVmLnpvb20gLyAxLjIsIGN2LndpZHRoIC8gMiwgY3YuaGVpZ2h0IC8gMik7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIGNhc2UgXCJEaWdpdDBcIjpcbiAgICBjYXNlIFwiTnVtcGFkMFwiOlxuICAgICAgaWYgKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSkge1xuICAgICAgICB1aVN0YXRlUmVmLnpvb20gPSAxLjA7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgZGVmYXVsdDpcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKGV2ZW50LmtleSA9PT0gXCI/XCIpIHtcbiAgICBzZXRIZWxwVmlzaWJsZSghdWlTdGF0ZVJlZi5oZWxwVmlzaWJsZSk7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRDYW1lcmFQb3NpdGlvbigpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICBpZiAoIWN2KSByZXR1cm4geyB4OiB3b3JsZC53IC8gMiwgeTogd29ybGQuaCAvIDIgfTtcblxuICBjb25zdCB6b29tID0gdWlTdGF0ZVJlZi56b29tO1xuXG4gIC8vIENhbWVyYSBmb2xsb3dzIHNoaXAsIG9yIGRlZmF1bHRzIHRvIHdvcmxkIGNlbnRlclxuICBsZXQgY2FtZXJhWCA9IHN0YXRlUmVmLm1lID8gc3RhdGVSZWYubWUueCA6IHdvcmxkLncgLyAyO1xuICBsZXQgY2FtZXJhWSA9IHN0YXRlUmVmLm1lID8gc3RhdGVSZWYubWUueSA6IHdvcmxkLmggLyAyO1xuXG4gIC8vIENhbGN1bGF0ZSB2aXNpYmxlIHdvcmxkIGFyZWEgYXQgY3VycmVudCB6b29tIHVzaW5nIHVuaWZvcm0gc2NhbGVcbiAgY29uc3Qgc2NhbGVYID0gY3Yud2lkdGggLyB3b3JsZC53O1xuICBjb25zdCBzY2FsZVkgPSBjdi5oZWlnaHQgLyB3b3JsZC5oO1xuICBjb25zdCBzY2FsZSA9IE1hdGgubWluKHNjYWxlWCwgc2NhbGVZKSAqIHpvb207XG5cbiAgLy8gV29ybGQgdW5pdHMgdmlzaWJsZSBvbiBzY3JlZW5cbiAgY29uc3Qgdmlld3BvcnRXaWR0aCA9IGN2LndpZHRoIC8gc2NhbGU7XG4gIGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gY3YuaGVpZ2h0IC8gc2NhbGU7XG5cbiAgLy8gQ2xhbXAgY2FtZXJhIHRvIHByZXZlbnQgem9vbWluZyBwYXN0IHdvcmxkIGJvdW5kYXJpZXNcbiAgLy8gV2hlbiB6b29tZWQgb3V0LCBjYW1lcmEgY2FuJ3QgZ2V0IGNsb3NlciB0byBlZGdlcyB0aGFuIGhhbGYgdmlld3BvcnRcbiAgY29uc3QgbWluQ2FtZXJhWCA9IHZpZXdwb3J0V2lkdGggLyAyO1xuICBjb25zdCBtYXhDYW1lcmFYID0gd29ybGQudyAtIHZpZXdwb3J0V2lkdGggLyAyO1xuICBjb25zdCBtaW5DYW1lcmFZID0gdmlld3BvcnRIZWlnaHQgLyAyO1xuICBjb25zdCBtYXhDYW1lcmFZID0gd29ybGQuaCAtIHZpZXdwb3J0SGVpZ2h0IC8gMjtcblxuICAvLyBBbHdheXMgY2xhbXAgY2FtZXJhIHRvIHdvcmxkIGJvdW5kYXJpZXNcbiAgLy8gV2hlbiB2aWV3cG9ydCA+PSB3b3JsZCBkaW1lbnNpb25zLCBjZW50ZXIgdGhlIHdvcmxkIG9uIHNjcmVlblxuICBpZiAodmlld3BvcnRXaWR0aCA8IHdvcmxkLncpIHtcbiAgICBjYW1lcmFYID0gY2xhbXAoY2FtZXJhWCwgbWluQ2FtZXJhWCwgbWF4Q2FtZXJhWCk7XG4gIH0gZWxzZSB7XG4gICAgY2FtZXJhWCA9IHdvcmxkLncgLyAyO1xuICB9XG5cbiAgaWYgKHZpZXdwb3J0SGVpZ2h0IDwgd29ybGQuaCkge1xuICAgIGNhbWVyYVkgPSBjbGFtcChjYW1lcmFZLCBtaW5DYW1lcmFZLCBtYXhDYW1lcmFZKTtcbiAgfSBlbHNlIHtcbiAgICBjYW1lcmFZID0gd29ybGQuaCAvIDI7XG4gIH1cblxuICByZXR1cm4geyB4OiBjYW1lcmFYLCB5OiBjYW1lcmFZIH07XG59XG5cbmZ1bmN0aW9uIHdvcmxkVG9DYW52YXMocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgaWYgKCFjdikgcmV0dXJuIHsgeDogcC54LCB5OiBwLnkgfTtcblxuICBjb25zdCB6b29tID0gdWlTdGF0ZVJlZi56b29tO1xuICBjb25zdCBjYW1lcmEgPSBnZXRDYW1lcmFQb3NpdGlvbigpO1xuXG4gIC8vIFdvcmxkIHBvc2l0aW9uIHJlbGF0aXZlIHRvIGNhbWVyYVxuICBjb25zdCB3b3JsZFggPSBwLnggLSBjYW1lcmEueDtcbiAgY29uc3Qgd29ybGRZID0gcC55IC0gY2FtZXJhLnk7XG5cbiAgLy8gVXNlIHVuaWZvcm0gc2NhbGUgdG8gbWFpbnRhaW4gYXNwZWN0IHJhdGlvXG4gIC8vIFNjYWxlIGlzIHBpeGVscyBwZXIgd29ybGQgdW5pdCAtIGNob29zZSB0aGUgZGltZW5zaW9uIHRoYXQgZml0c1xuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAvLyBDb252ZXJ0IHRvIGNhbnZhcyBjb29yZGluYXRlcyAoY2VudGVyZWQgb24gc2NyZWVuKVxuICByZXR1cm4ge1xuICAgIHg6IHdvcmxkWCAqIHNjYWxlICsgY3Yud2lkdGggLyAyLFxuICAgIHk6IHdvcmxkWSAqIHNjYWxlICsgY3YuaGVpZ2h0IC8gMlxuICB9O1xufVxuXG5mdW5jdGlvbiBjYW52YXNUb1dvcmxkKHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gIGlmICghY3YpIHJldHVybiB7IHg6IHAueCwgeTogcC55IH07XG5cbiAgY29uc3Qgem9vbSA9IHVpU3RhdGVSZWYuem9vbTtcbiAgY29uc3QgY2FtZXJhID0gZ2V0Q2FtZXJhUG9zaXRpb24oKTtcblxuICAvLyBDYW52YXMgcG9zaXRpb24gcmVsYXRpdmUgdG8gY2VudGVyXG4gIGNvbnN0IGNhbnZhc1ggPSBwLnggLSBjdi53aWR0aCAvIDI7XG4gIGNvbnN0IGNhbnZhc1kgPSBwLnkgLSBjdi5oZWlnaHQgLyAyO1xuXG4gIC8vIFVzZSB1bmlmb3JtIHNjYWxlIHRvIG1haW50YWluIGFzcGVjdCByYXRpb1xuICBjb25zdCBzY2FsZVggPSBjdi53aWR0aCAvIHdvcmxkLnc7XG4gIGNvbnN0IHNjYWxlWSA9IGN2LmhlaWdodCAvIHdvcmxkLmg7XG4gIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVkpICogem9vbTtcblxuICAvLyBDb252ZXJ0IHRvIHdvcmxkIGNvb3JkaW5hdGVzIChpbnZlcnNlIG9mIHdvcmxkVG9DYW52YXMpXG4gIHJldHVybiB7XG4gICAgeDogY2FudmFzWCAvIHNjYWxlICsgY2FtZXJhLngsXG4gICAgeTogY2FudmFzWSAvIHNjYWxlICsgY2FtZXJhLnlcbiAgfTtcbn1cblxuLy8gR2V0IHRoZSBvZmZzZXQgZm9yIHNoaXAgd2F5cG9pbnQgaW5kaWNlcyAoaG93IG1hbnkgd2F5cG9pbnRzIGhhdmUgYmVlbiBwYXNzZWQpXG5mdW5jdGlvbiBnZXRTaGlwV2F5cG9pbnRPZmZzZXQoKTogbnVtYmVyIHtcbiAgcmV0dXJuIHN0YXRlUmVmLm1lPy5jdXJyZW50V2F5cG9pbnRJbmRleCA/PyAwO1xufVxuXG4vLyBDb252ZXJ0IGEgZGlzcGxheWVkIHdheXBvaW50IGluZGV4IHRvIHRoZSBhY3R1YWwgd2F5cG9pbnQgYXJyYXkgaW5kZXhcbmZ1bmN0aW9uIGRpc3BsYXlJbmRleFRvQWN0dWFsSW5kZXgoZGlzcGxheUluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gZGlzcGxheUluZGV4ICsgZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk7XG59XG5cbi8vIENvbnZlcnQgYW4gYWN0dWFsIHdheXBvaW50IGluZGV4IHRvIGEgZGlzcGxheWVkIGluZGV4IChvciAtMSBpZiB3YXlwb2ludCBoYXMgYmVlbiBwYXNzZWQpXG5mdW5jdGlvbiBhY3R1YWxJbmRleFRvRGlzcGxheUluZGV4KGFjdHVhbEluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuICBjb25zdCBvZmZzZXQgPSBnZXRTaGlwV2F5cG9pbnRPZmZzZXQoKTtcbiAgcmV0dXJuIGFjdHVhbEluZGV4ID49IG9mZnNldCA/IGFjdHVhbEluZGV4IC0gb2Zmc2V0IDogLTE7XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVSb3V0ZVBvaW50cygpOiBSb3V0ZVBvaW50cyB8IG51bGwge1xuICBpZiAoIXN0YXRlUmVmLm1lKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgd3BzID0gQXJyYXkuaXNBcnJheShzdGF0ZVJlZi5tZS53YXlwb2ludHMpID8gc3RhdGVSZWYubWUud2F5cG9pbnRzIDogW107XG4gIC8vIEZpbHRlciB3YXlwb2ludHMgdG8gb25seSBzaG93IHRob3NlIHRoYXQgaGF2ZW4ndCBiZWVuIHBhc3NlZCB5ZXRcbiAgY29uc3QgY3VycmVudEluZGV4ID0gZ2V0U2hpcFdheXBvaW50T2Zmc2V0KCk7XG4gIGNvbnN0IHZpc2libGVXcHMgPSBjdXJyZW50SW5kZXggPiAwID8gd3BzLnNsaWNlKGN1cnJlbnRJbmRleCkgOiB3cHM7XG4gIHJldHVybiBidWlsZFJvdXRlUG9pbnRzKFxuICAgIHsgeDogc3RhdGVSZWYubWUueCwgeTogc3RhdGVSZWYubWUueSB9LFxuICAgIHZpc2libGVXcHMsXG4gICAgd29ybGQsXG4gICAgZ2V0Q2FtZXJhUG9zaXRpb24sXG4gICAgKCkgPT4gdWlTdGF0ZVJlZi56b29tLFxuICAgIHdvcmxkVG9DYW52YXNcbiAgKTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpOiBSb3V0ZVBvaW50cyB8IG51bGwge1xuICBpZiAoIXN0YXRlUmVmLm1lKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3Qgd3BzID0gcm91dGUgJiYgQXJyYXkuaXNBcnJheShyb3V0ZS53YXlwb2ludHMpID8gcm91dGUud2F5cG9pbnRzIDogW107XG4gIHJldHVybiBidWlsZFJvdXRlUG9pbnRzKFxuICAgIHsgeDogc3RhdGVSZWYubWUueCwgeTogc3RhdGVSZWYubWUueSB9LFxuICAgIHdwcyxcbiAgICB3b3JsZCxcbiAgICBnZXRDYW1lcmFQb3NpdGlvbixcbiAgICAoKSA9PiB1aVN0YXRlUmVmLnpvb20sXG4gICAgd29ybGRUb0NhbnZhc1xuICApO1xufVxuXG4vLyBIZWxwZXI6IEZpbmQgd2F5cG9pbnQgYXQgY2FudmFzIHBvc2l0aW9uXG5mdW5jdGlvbiBmaW5kV2F5cG9pbnRBdFBvc2l0aW9uKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBudW1iZXIgfCBudWxsIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZT8ud2F5cG9pbnRzKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gIC8vIENoZWNrIHdheXBvaW50cyBpbiByZXZlcnNlIG9yZGVyICh0b3AgdG8gYm90dG9tIHZpc3VhbGx5KVxuICAvLyBTa2lwIHRoZSBmaXJzdCBjYW52YXMgcG9pbnQgKHNoaXAgcG9zaXRpb24pXG4gIGZvciAobGV0IGkgPSByb3V0ZS53YXlwb2ludHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBjb25zdCB3YXlwb2ludENhbnZhcyA9IHJvdXRlLmNhbnZhc1BvaW50c1tpICsgMV07IC8vICsxIGJlY2F1c2UgZmlyc3QgcG9pbnQgaXMgc2hpcCBwb3NpdGlvblxuICAgIGNvbnN0IGR4ID0gY2FudmFzUG9pbnQueCAtIHdheXBvaW50Q2FudmFzLng7XG4gICAgY29uc3QgZHkgPSBjYW52YXNQb2ludC55IC0gd2F5cG9pbnRDYW52YXMueTtcbiAgICBjb25zdCBkaXN0ID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcblxuICAgIGlmIChkaXN0IDw9IFdBWVBPSU5UX0hJVF9SQURJVVMpIHtcbiAgICAgIC8vIENvbnZlcnQgZGlzcGxheSBpbmRleCB0byBhY3R1YWwgd2F5cG9pbnQgaW5kZXhcbiAgICAgIHJldHVybiBkaXNwbGF5SW5kZXhUb0FjdHVhbEluZGV4KGkpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVSb3V0ZUFuaW1hdGlvbnMoZHRTZWNvbmRzOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZVJlZi5tZSkge1xuICAgIHNoaXBMZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIG1pc3NpbGVMZWdEYXNoT2Zmc2V0cy5jbGVhcigpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh1aVN0YXRlUmVmLnNob3dTaGlwUm91dGUpIHtcbiAgICBjb25zdCBzaGlwUm91dGUgPSBjb21wdXRlUm91dGVQb2ludHMoKTtcbiAgICBpZiAoc2hpcFJvdXRlICYmIHNoaXBSb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gMCkge1xuICAgICAgdXBkYXRlRGFzaE9mZnNldHNGb3JSb3V0ZShzaGlwTGVnRGFzaE9mZnNldHMsIHNoaXBSb3V0ZS53YXlwb2ludHMsIHNoaXBSb3V0ZS53b3JsZFBvaW50cywgc2hpcFJvdXRlLmNhbnZhc1BvaW50cywgZGVmYXVsdFNwZWVkLCBkdFNlY29uZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzaGlwTGVnRGFzaE9mZnNldHMuY2xlYXIoKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgc2hpcExlZ0Rhc2hPZmZzZXRzLmNsZWFyKCk7XG4gIH1cblxuICBjb25zdCBhY3RpdmVNaXNzaWxlUm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgbWlzc2lsZVJvdXRlUG9pbnRzID0gY29tcHV0ZU1pc3NpbGVSb3V0ZVBvaW50cygpO1xuICBpZiAoXG4gICAgYWN0aXZlTWlzc2lsZVJvdXRlICYmXG4gICAgbWlzc2lsZVJvdXRlUG9pbnRzICYmXG4gICAgQXJyYXkuaXNBcnJheShhY3RpdmVNaXNzaWxlUm91dGUud2F5cG9pbnRzKSAmJlxuICAgIGFjdGl2ZU1pc3NpbGVSb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gMFxuICApIHtcbiAgICBjb25zdCBmYWxsYmFja1NwZWVkID0gbGFzdE1pc3NpbGVMZWdTcGVlZCA+IDAgPyBsYXN0TWlzc2lsZUxlZ1NwZWVkIDogc3RhdGVSZWYubWlzc2lsZUNvbmZpZy5zcGVlZDtcbiAgICB1cGRhdGVEYXNoT2Zmc2V0c0ZvclJvdXRlKFxuICAgICAgbWlzc2lsZUxlZ0Rhc2hPZmZzZXRzLFxuICAgICAgYWN0aXZlTWlzc2lsZVJvdXRlLndheXBvaW50cyxcbiAgICAgIG1pc3NpbGVSb3V0ZVBvaW50cy53b3JsZFBvaW50cyxcbiAgICAgIG1pc3NpbGVSb3V0ZVBvaW50cy5jYW52YXNQb2ludHMsXG4gICAgICBmYWxsYmFja1NwZWVkLFxuICAgICAgZHRTZWNvbmRzLFxuICAgICAgNjQsXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICBtaXNzaWxlTGVnRGFzaE9mZnNldHMuY2xlYXIoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBoaXRUZXN0Um91dGUoY2FudmFzUG9pbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IFNlbGVjdGlvbiB8IG51bGwge1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVSb3V0ZVBvaW50cygpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLndheXBvaW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gaGl0VGVzdFJvdXRlR2VuZXJpYyhjYW52YXNQb2ludCwgcm91dGUsIHtcbiAgICBza2lwTGVnczogIXVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSxcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGhpdFRlc3RNaXNzaWxlUm91dGVzKGNhbnZhc1BvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB7IHJvdXRlOiBNaXNzaWxlUm91dGU7IHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbiB9IHwgbnVsbCB7XG4gIGlmICghc3RhdGVSZWYubWUpIHJldHVybiBudWxsO1xuICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHN0YXRlUmVmLm1pc3NpbGVSb3V0ZXMpID8gc3RhdGVSZWYubWlzc2lsZVJvdXRlcyA6IFtdO1xuICBpZiAocm91dGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgY29uc3Qgc2hpcFBvcyA9IHsgeDogc3RhdGVSZWYubWUueCwgeTogc3RhdGVSZWYubWUueSB9O1xuXG4gIGxldCBiZXN0OiB7IHJvdXRlOiBNaXNzaWxlUm91dGU7IHNlbGVjdGlvbjogTWlzc2lsZVNlbGVjdGlvbjsgcG9pbnRlckRpc3Q6IG51bWJlcjsgc2hpcERpc3Q6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5cbiAgZm9yIChjb25zdCByb3V0ZSBvZiByb3V0ZXMpIHtcbiAgICBjb25zdCB3YXlwb2ludHMgPSBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMgOiBbXTtcbiAgICBpZiAod2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3Qgcm91dGVQb2ludHMgPSBidWlsZFJvdXRlUG9pbnRzKFxuICAgICAgc2hpcFBvcyxcbiAgICAgIHdheXBvaW50cyxcbiAgICAgIHdvcmxkLFxuICAgICAgZ2V0Q2FtZXJhUG9zaXRpb24sXG4gICAgICAoKSA9PiB1aVN0YXRlUmVmLnpvb20sXG4gICAgICB3b3JsZFRvQ2FudmFzXG4gICAgKTtcblxuICAgIGNvbnN0IGhpdCA9IGhpdFRlc3RSb3V0ZUdlbmVyaWMoY2FudmFzUG9pbnQsIHJvdXRlUG9pbnRzLCB7XG4gICAgICB3YXlwb2ludEhpdFJhZGl1czogMTYsXG4gICAgICBsZWdIaXREaXN0YW5jZTogMTAsXG4gICAgfSk7XG5cbiAgICBpZiAoIWhpdCkgY29udGludWU7XG5cbiAgICAvLyBDYWxjdWxhdGUgZGlzdGFuY2VzIGZvciBiZXN0IHNlbGVjdGlvblxuICAgIGxldCBwb2ludGVyRGlzdDogbnVtYmVyO1xuICAgIGxldCBzaGlwRGlzdDogbnVtYmVyO1xuXG4gICAgaWYgKGhpdC50eXBlID09PSBcIndheXBvaW50XCIpIHtcbiAgICAgIC8vIERpc3RhbmNlIGZyb20gcG9pbnRlciB0byB3YXlwb2ludFxuICAgICAgY29uc3Qgd3BDYW52YXMgPSByb3V0ZVBvaW50cy5jYW52YXNQb2ludHNbaGl0LmluZGV4ICsgMV07XG4gICAgICBwb2ludGVyRGlzdCA9IE1hdGguaHlwb3QoY2FudmFzUG9pbnQueCAtIHdwQ2FudmFzLngsIGNhbnZhc1BvaW50LnkgLSB3cENhbnZhcy55KTtcbiAgICAgIC8vIERpc3RhbmNlIGZyb20gc2hpcCB0byB3YXlwb2ludFxuICAgICAgY29uc3Qgd3BXb3JsZCA9IHJvdXRlUG9pbnRzLndvcmxkUG9pbnRzW2hpdC5pbmRleCArIDFdO1xuICAgICAgc2hpcERpc3QgPSBNYXRoLmh5cG90KHdwV29ybGQueCAtIHNoaXBQb3MueCwgd3BXb3JsZC55IC0gc2hpcFBvcy55KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gaGl0LnR5cGUgPT09IFwibGVnXCJcbiAgICAgIC8vIERpc3RhbmNlIGZyb20gcG9pbnRlciB0byBsZWcgKGFscmVhZHkgY2FsY3VsYXRlZCBpbiBoaXRUZXN0LCByZWNhbGMgZm9yIGNvbnNpc3RlbmN5KVxuICAgICAgY29uc3QgeyBjYW52YXNQb2ludHMsIHdvcmxkUG9pbnRzIH0gPSByb3V0ZVBvaW50cztcbiAgICAgIHBvaW50ZXJEaXN0ID0gTWF0aC5oeXBvdChcbiAgICAgICAgKGNhbnZhc1BvaW50c1toaXQuaW5kZXhdLnggKyBjYW52YXNQb2ludHNbaGl0LmluZGV4ICsgMV0ueCkgKiAwLjUgLSBjYW52YXNQb2ludC54LFxuICAgICAgICAoY2FudmFzUG9pbnRzW2hpdC5pbmRleF0ueSArIGNhbnZhc1BvaW50c1toaXQuaW5kZXggKyAxXS55KSAqIDAuNSAtIGNhbnZhc1BvaW50LnlcbiAgICAgICk7XG4gICAgICAvLyBEaXN0YW5jZSBmcm9tIHNoaXAgdG8gbGVnIG1pZHBvaW50XG4gICAgICBjb25zdCBtaWRXb3JsZCA9IHtcbiAgICAgICAgeDogKHdvcmxkUG9pbnRzW2hpdC5pbmRleF0ueCArIHdvcmxkUG9pbnRzW2hpdC5pbmRleCArIDFdLngpICogMC41LFxuICAgICAgICB5OiAod29ybGRQb2ludHNbaGl0LmluZGV4XS55ICsgd29ybGRQb2ludHNbaGl0LmluZGV4ICsgMV0ueSkgKiAwLjUsXG4gICAgICB9O1xuICAgICAgc2hpcERpc3QgPSBNYXRoLmh5cG90KG1pZFdvcmxkLnggLSBzaGlwUG9zLngsIG1pZFdvcmxkLnkgLSBzaGlwUG9zLnkpO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgdGhlIGJlc3QgaGl0IHNvIGZhclxuICAgIGlmIChcbiAgICAgICFiZXN0IHx8XG4gICAgICBwb2ludGVyRGlzdCA8IGJlc3QucG9pbnRlckRpc3QgLSAwLjEgfHxcbiAgICAgIChNYXRoLmFicyhwb2ludGVyRGlzdCAtIGJlc3QucG9pbnRlckRpc3QpIDw9IDAuNSAmJiBzaGlwRGlzdCA8IGJlc3Quc2hpcERpc3QpXG4gICAgKSB7XG4gICAgICBjb25zdCBzZWxlY3Rpb246IE1pc3NpbGVTZWxlY3Rpb24gPSBoaXQudHlwZSA9PT0gXCJ3YXlwb2ludFwiXG4gICAgICAgID8geyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBoaXQuaW5kZXggfVxuICAgICAgICA6IHsgdHlwZTogXCJyb3V0ZVwiLCBpbmRleDogaGl0LmluZGV4IH07XG5cbiAgICAgIGJlc3QgPSB7XG4gICAgICAgIHJvdXRlLFxuICAgICAgICBzZWxlY3Rpb24sXG4gICAgICAgIHBvaW50ZXJEaXN0LFxuICAgICAgICBzaGlwRGlzdCxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgaWYgKCFiZXN0KSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHsgcm91dGU6IGJlc3Qucm91dGUsIHNlbGVjdGlvbjogYmVzdC5zZWxlY3Rpb24gfTtcbn1cblxuZnVuY3Rpb24gZHJhd1NoaXAoeDogbnVtYmVyLCB5OiBudW1iZXIsIHZ4OiBudW1iZXIsIHZ5OiBudW1iZXIsIGNvbG9yOiBzdHJpbmcsIGZpbGxlZDogYm9vbGVhbik6IHZvaWQge1xuICBpZiAoIWN0eCkgcmV0dXJuO1xuICBjb25zdCBwID0gd29ybGRUb0NhbnZhcyh7IHgsIHkgfSk7XG4gIGNvbnN0IHIgPSAxMDtcbiAgY3R4LnNhdmUoKTtcbiAgY3R4LnRyYW5zbGF0ZShwLngsIHAueSk7XG4gIGNvbnN0IGFuZ2xlID0gTWF0aC5hdGFuMih2eSwgdngpO1xuICBjdHgucm90YXRlKGFuZ2xlKTtcbiAgY3R4LmJlZ2luUGF0aCgpO1xuICBjdHgubW92ZVRvKHIsIDApO1xuICBjdHgubGluZVRvKC1yICogMC43LCByICogMC42KTtcbiAgY3R4LmxpbmVUbygtciAqIDAuNCwgMCk7XG4gIGN0eC5saW5lVG8oLXIgKiAwLjcsIC1yICogMC42KTtcbiAgY3R4LmNsb3NlUGF0aCgpO1xuICBjdHgubGluZVdpZHRoID0gMjtcbiAgY3R4LnN0cm9rZVN0eWxlID0gY29sb3I7XG4gIGlmIChmaWxsZWQpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gYCR7Y29sb3J9Y2NgO1xuICAgIGN0eC5maWxsKCk7XG4gIH1cbiAgY3R4LnN0cm9rZSgpO1xuICBjdHgucmVzdG9yZSgpO1xufVxuXG5mdW5jdGlvbiBkcmF3R2hvc3REb3QoeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFjdHgpIHJldHVybjtcbiAgY29uc3QgcCA9IHdvcmxkVG9DYW52YXMoeyB4LCB5IH0pO1xuICBjdHguYmVnaW5QYXRoKCk7XG4gIGN0eC5hcmMocC54LCBwLnksIDMsIDAsIE1hdGguUEkgKiAyKTtcbiAgY3R4LmZpbGxTdHlsZSA9IFwiI2NjY2NjY2FhXCI7XG4gIGN0eC5maWxsKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdSb3V0ZSgpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIXN0YXRlUmVmLm1lKSByZXR1cm47XG4gIGNvbnN0IHJvdXRlID0gY29tcHV0ZVJvdXRlUG9pbnRzKCk7XG4gIGlmICghcm91dGUgfHwgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIGNvbnN0IGhlYXQgPSBzdGF0ZVJlZi5tZS5oZWF0O1xuICBjb25zdCBoZWF0UGFyYW1zOiBIZWF0UHJvamVjdGlvblBhcmFtcyB8IHVuZGVmaW5lZCA9IGhlYXRcbiAgICA/IHtcbiAgICAgICAgbWFya2VyU3BlZWQ6IGhlYXQubWFya2VyU3BlZWQsXG4gICAgICAgIGtVcDogaGVhdC5rVXAsXG4gICAgICAgIGtEb3duOiBoZWF0LmtEb3duLFxuICAgICAgICBleHA6IGhlYXQuZXhwLFxuICAgICAgICBtYXg6IGhlYXQubWF4LFxuICAgICAgICBvdmVyaGVhdEF0OiBoZWF0Lm92ZXJoZWF0QXQsXG4gICAgICAgIHdhcm5BdDogaGVhdC53YXJuQXQsXG4gICAgICB9XG4gICAgOiB1bmRlZmluZWQ7XG5cbiAgLy8gQ29udmVydCBzZWxlY3Rpb24gZnJvbSBhY3R1YWwgaW5kZXggdG8gZGlzcGxheSBpbmRleCBmb3IgcmVuZGVyaW5nXG4gIGNvbnN0IGRpc3BsYXlTZWxlY3Rpb24gPSBzZWxlY3Rpb24gPyB7XG4gICAgdHlwZTogc2VsZWN0aW9uLnR5cGUsXG4gICAgaW5kZXg6IGFjdHVhbEluZGV4VG9EaXNwbGF5SW5kZXgoc2VsZWN0aW9uLmluZGV4KVxuICB9IDogbnVsbDtcblxuICAvLyBPbmx5IHNob3cgc2VsZWN0aW9uIGlmIHRoZSB3YXlwb2ludCBoYXNuJ3QgYmVlbiBwYXNzZWRcbiAgY29uc3QgdmFsaWRTZWxlY3Rpb24gPSBkaXNwbGF5U2VsZWN0aW9uICYmIGRpc3BsYXlTZWxlY3Rpb24uaW5kZXggPj0gMCA/IGRpc3BsYXlTZWxlY3Rpb24gOiBudWxsO1xuXG4gIC8vIENvbnZlcnQgZHJhZ2dlZFdheXBvaW50IGluZGV4IGFzIHdlbGxcbiAgY29uc3QgZGlzcGxheURyYWdnZWRXYXlwb2ludCA9IGRyYWdnZWRXYXlwb2ludCAhPT0gbnVsbFxuICAgID8gYWN0dWFsSW5kZXhUb0Rpc3BsYXlJbmRleChkcmFnZ2VkV2F5cG9pbnQpXG4gICAgOiBudWxsO1xuICBjb25zdCB2YWxpZERyYWdnZWRXYXlwb2ludCA9IGRpc3BsYXlEcmFnZ2VkV2F5cG9pbnQgIT09IG51bGwgJiYgZGlzcGxheURyYWdnZWRXYXlwb2ludCA+PSAwXG4gICAgPyBkaXNwbGF5RHJhZ2dlZFdheXBvaW50XG4gICAgOiBudWxsO1xuXG4gIGRyYXdQbGFubmVkUm91dGUoY3R4LCB7XG4gICAgcm91dGVQb2ludHM6IHJvdXRlLFxuICAgIHNlbGVjdGlvbjogdmFsaWRTZWxlY3Rpb24sXG4gICAgZHJhZ2dlZFdheXBvaW50OiB2YWxpZERyYWdnZWRXYXlwb2ludCxcbiAgICBkYXNoU3RvcmU6IHNoaXBMZWdEYXNoT2Zmc2V0cyxcbiAgICBwYWxldHRlOiBTSElQX1BBTEVUVEUsXG4gICAgc2hvd0xlZ3M6IHVpU3RhdGVSZWYuc2hvd1NoaXBSb3V0ZSxcbiAgICBoZWF0UGFyYW1zLFxuICAgIGluaXRpYWxIZWF0OiBoZWF0Py52YWx1ZSA/PyAwLFxuICAgIGRlZmF1bHRTcGVlZCxcbiAgICB3b3JsZFBvaW50czogcm91dGUud29ybGRQb2ludHMsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3TWlzc2lsZVJvdXRlKCk6IHZvaWQge1xuICBpZiAoIWN0eCB8fCAhc3RhdGVSZWYubWUpIHJldHVybjtcbiAgaWYgKHVpU3RhdGVSZWYuaW5wdXRDb250ZXh0ICE9PSBcIm1pc3NpbGVcIikgcmV0dXJuO1xuICBjb25zdCByb3V0ZSA9IGNvbXB1dGVNaXNzaWxlUm91dGVQb2ludHMoKTtcbiAgaWYgKCFyb3V0ZSB8fCByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgY29uc3QgaGVhdFBhcmFtczogSGVhdFByb2plY3Rpb25QYXJhbXMgfCB1bmRlZmluZWQgPSBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnLmhlYXRQYXJhbXM7XG5cbiAgLy8gTWFwIE1pc3NpbGVTZWxlY3Rpb24gKHVzZXMgXCJyb3V0ZVwiIGZvciBsZWdzKSB0byBnZW5lcmljIFNlbGVjdGlvbiAodXNlcyBcImxlZ1wiIGZvciBsZWdzKVxuICBjb25zdCBnZW5lcmljU2VsZWN0aW9uOiB7IHR5cGU6IFwid2F5cG9pbnRcIiB8IFwibGVnXCI7IGluZGV4OiBudW1iZXIgfSB8IG51bGwgPSBtaXNzaWxlU2VsZWN0aW9uXG4gICAgPyBtaXNzaWxlU2VsZWN0aW9uLnR5cGUgPT09IFwicm91dGVcIlxuICAgICAgPyB7IHR5cGU6IFwibGVnXCIsIGluZGV4OiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IH1cbiAgICAgIDogeyB0eXBlOiBcIndheXBvaW50XCIsIGluZGV4OiBtaXNzaWxlU2VsZWN0aW9uLmluZGV4IH1cbiAgICA6IG51bGw7XG5cbiAgZHJhd1BsYW5uZWRSb3V0ZShjdHgsIHtcbiAgICByb3V0ZVBvaW50czogcm91dGUsXG4gICAgc2VsZWN0aW9uOiBnZW5lcmljU2VsZWN0aW9uLFxuICAgIGRyYWdnZWRXYXlwb2ludDogbnVsbCxcbiAgICBkYXNoU3RvcmU6IG1pc3NpbGVMZWdEYXNoT2Zmc2V0cyxcbiAgICBwYWxldHRlOiBNSVNTSUxFX1BBTEVUVEUsXG4gICAgc2hvd0xlZ3M6IHRydWUsXG4gICAgaGVhdFBhcmFtcyxcbiAgICBpbml0aWFsSGVhdDogMCwgLy8gTWlzc2lsZXMgc3RhcnQgYXQgemVybyBoZWF0XG4gICAgZGVmYXVsdFNwZWVkOiBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnLnNwZWVkLFxuICAgIHdvcmxkUG9pbnRzOiByb3V0ZS53b3JsZFBvaW50cyxcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGRyYXdNaXNzaWxlcygpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIXN0YXRlUmVmLm1pc3NpbGVzIHx8IHN0YXRlUmVmLm1pc3NpbGVzLmxlbmd0aCA9PT0gMCB8fCAhY3YpIHJldHVybjtcbiAgY29uc3Qgc2NhbGVYID0gY3Yud2lkdGggLyB3b3JsZC53O1xuICBjb25zdCBzY2FsZVkgPSBjdi5oZWlnaHQgLyB3b3JsZC5oO1xuICBjb25zdCByYWRpdXNTY2FsZSA9IChzY2FsZVggKyBzY2FsZVkpIC8gMjtcbiAgZm9yIChjb25zdCBtaXNzIG9mIHN0YXRlUmVmLm1pc3NpbGVzKSB7XG4gICAgY29uc3QgcCA9IHdvcmxkVG9DYW52YXMoeyB4OiBtaXNzLngsIHk6IG1pc3MueSB9KTtcbiAgICBjb25zdCBzZWxmT3duZWQgPSBCb29sZWFuKG1pc3Muc2VsZik7XG4gICAgY3R4LnNhdmUoKTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmFyYyhwLngsIHAueSwgc2VsZk93bmVkID8gNiA6IDUsIDAsIE1hdGguUEkgKiAyKTtcbiAgICBjdHguZmlsbFN0eWxlID0gc2VsZk93bmVkID8gXCIjZjg3MTcxXCIgOiBcIiNmY2E1YTVcIjtcbiAgICBjdHguZ2xvYmFsQWxwaGEgPSBzZWxmT3duZWQgPyAwLjk1IDogMC44O1xuICAgIGN0eC5maWxsKCk7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMTtcbiAgICBjdHgubGluZVdpZHRoID0gMS41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiIzExMTgyN1wiO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBjdHgucmVzdG9yZSgpO1xuXG4gICAgaWYgKHNlbGZPd25lZCAmJiBtaXNzLmFncm9fcmFkaXVzID4gMCkge1xuICAgICAgY3R4LnNhdmUoKTtcbiAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgIGNvbnN0IHJDYW52YXMgPSBtaXNzLmFncm9fcmFkaXVzICogcmFkaXVzU2NhbGU7XG4gICAgICBjdHguc2V0TGluZURhc2goWzE0LCAxMF0pO1xuICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJyZ2JhKDI0OCwxMTMsMTEzLDAuMzUpXCI7XG4gICAgICBjdHgubGluZVdpZHRoID0gMS4yO1xuICAgICAgY3R4LmFyYyhwLngsIHAueSwgckNhbnZhcywgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICB9XG5cbiAgICAvLyBEcmF3IG1pc3NpbGUgaGVhdCBiYXIgaWYgaGVhdCBkYXRhIGlzIGF2YWlsYWJsZVxuICAgIGlmIChtaXNzLmhlYXQpIHtcbiAgICAgIGRyYXdNaXNzaWxlSGVhdEJhcihtaXNzLCBwKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZHJhd01pc3NpbGVIZWF0QmFyKG1pc3NpbGU6IE1pc3NpbGVTbmFwc2hvdCwgY2FudmFzUG9zOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIW1pc3NpbGUuaGVhdCkgcmV0dXJuO1xuXG4gIGNvbnN0IGhlYXQgPSBtaXNzaWxlLmhlYXQ7XG4gIGNvbnN0IGJhcldpZHRoID0gNDA7XG4gIGNvbnN0IGJhckhlaWdodCA9IDQ7XG4gIGNvbnN0IGJhclggPSBjYW52YXNQb3MueCAtIGJhcldpZHRoIC8gMjtcbiAgY29uc3QgYmFyWSA9IGNhbnZhc1Bvcy55ICsgMTU7IC8vIEJlbG93IG1pc3NpbGVcblxuICAvLyBCYWNrZ3JvdW5kXG4gIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoMCwgMCwgMCwgMC41KVwiO1xuICBjdHguZmlsbFJlY3QoYmFyWCAtIDEsIGJhclkgLSAxLCBiYXJXaWR0aCArIDIsIGJhckhlaWdodCArIDIpO1xuXG4gIC8vIEhlYXQgZmlsbFxuICBjb25zdCBoZWF0UmF0aW8gPSBoZWF0LnZhbHVlIC8gaGVhdC5tYXg7XG4gIGNvbnN0IGZpbGxXaWR0aCA9IGJhcldpZHRoICogaGVhdFJhdGlvO1xuXG4gIC8vIENvbG9yIGJhc2VkIG9uIGhlYXQgbGV2ZWxcbiAgbGV0IGhlYXRDb2xvcjogc3RyaW5nO1xuICBjb25zdCB3YXJuUmF0aW8gPSBoZWF0Lndhcm5BdCAvIGhlYXQubWF4O1xuICBjb25zdCBvdmVyaGVhdFJhdGlvID0gaGVhdC5vdmVyaGVhdEF0IC8gaGVhdC5tYXg7XG5cbiAgaWYgKGhlYXRSYXRpbyA8IHdhcm5SYXRpbykge1xuICAgIGhlYXRDb2xvciA9IFwiIzMzYWEzM1wiOyAvLyBHcmVlbiAtIHNhZmVcbiAgfSBlbHNlIGlmIChoZWF0UmF0aW8gPCBvdmVyaGVhdFJhdGlvKSB7XG4gICAgaGVhdENvbG9yID0gXCIjZmZhYTMzXCI7IC8vIE9yYW5nZSAtIHdhcm5pbmdcbiAgfSBlbHNlIHtcbiAgICBoZWF0Q29sb3IgPSBcIiNmZjMzMzNcIjsgLy8gUmVkIC0gY3JpdGljYWxcbiAgfVxuXG4gIGN0eC5maWxsU3R5bGUgPSBoZWF0Q29sb3I7XG4gIGN0eC5maWxsUmVjdChiYXJYLCBiYXJZLCBmaWxsV2lkdGgsIGJhckhlaWdodCk7XG5cbn1cblxuZnVuY3Rpb24gZHJhd0dyaWQoKTogdm9pZCB7XG4gIGlmICghY3R4IHx8ICFjdikgcmV0dXJuO1xuICBjdHguc2F2ZSgpO1xuICBjdHguc3Ryb2tlU3R5bGUgPSBcIiMyMzRcIjtcbiAgY3R4LmxpbmVXaWR0aCA9IDE7XG5cbiAgY29uc3Qgem9vbSA9IHVpU3RhdGVSZWYuem9vbTtcbiAgbGV0IHN0ZXAgPSAxMDAwO1xuICBpZiAoem9vbSA8IDAuNykge1xuICAgIHN0ZXAgPSAyMDAwO1xuICB9IGVsc2UgaWYgKHpvb20gPiAxLjUpIHtcbiAgICBzdGVwID0gNTAwO1xuICB9IGVsc2UgaWYgKHpvb20gPiAyLjUpIHtcbiAgICBzdGVwID0gMjUwO1xuICB9XG5cbiAgY29uc3QgY2FtZXJhID0gZ2V0Q2FtZXJhUG9zaXRpb24oKTtcblxuICAvLyBDYWxjdWxhdGUgdmlld3BvcnQgdXNpbmcgdW5pZm9ybSBzY2FsZSAoc2FtZSBhcyBjb29yZGluYXRlIHRyYW5zZm9ybXMpXG4gIGNvbnN0IHNjYWxlWCA9IGN2LndpZHRoIC8gd29ybGQudztcbiAgY29uc3Qgc2NhbGVZID0gY3YuaGVpZ2h0IC8gd29ybGQuaDtcbiAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbihzY2FsZVgsIHNjYWxlWSkgKiB6b29tO1xuICBjb25zdCB2aWV3cG9ydFdpZHRoID0gY3Yud2lkdGggLyBzY2FsZTtcbiAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBjdi5oZWlnaHQgLyBzY2FsZTtcblxuICBjb25zdCBtaW5YID0gTWF0aC5tYXgoMCwgY2FtZXJhLnggLSB2aWV3cG9ydFdpZHRoIC8gMik7XG4gIGNvbnN0IG1heFggPSBNYXRoLm1pbih3b3JsZC53LCBjYW1lcmEueCArIHZpZXdwb3J0V2lkdGggLyAyKTtcbiAgY29uc3QgbWluWSA9IE1hdGgubWF4KDAsIGNhbWVyYS55IC0gdmlld3BvcnRIZWlnaHQgLyAyKTtcbiAgY29uc3QgbWF4WSA9IE1hdGgubWluKHdvcmxkLmgsIGNhbWVyYS55ICsgdmlld3BvcnRIZWlnaHQgLyAyKTtcblxuICBjb25zdCBzdGFydFggPSBNYXRoLmZsb29yKG1pblggLyBzdGVwKSAqIHN0ZXA7XG4gIGNvbnN0IGVuZFggPSBNYXRoLmNlaWwobWF4WCAvIHN0ZXApICogc3RlcDtcbiAgY29uc3Qgc3RhcnRZID0gTWF0aC5mbG9vcihtaW5ZIC8gc3RlcCkgKiBzdGVwO1xuICBjb25zdCBlbmRZID0gTWF0aC5jZWlsKG1heFkgLyBzdGVwKSAqIHN0ZXA7XG5cbiAgZm9yIChsZXQgeCA9IHN0YXJ0WDsgeCA8PSBlbmRYOyB4ICs9IHN0ZXApIHtcbiAgICBjb25zdCBhID0gd29ybGRUb0NhbnZhcyh7IHgsIHk6IE1hdGgubWF4KDAsIG1pblkpIH0pO1xuICAgIGNvbnN0IGIgPSB3b3JsZFRvQ2FudmFzKHsgeCwgeTogTWF0aC5taW4od29ybGQuaCwgbWF4WSkgfSk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oYS54LCBhLnkpO1xuICAgIGN0eC5saW5lVG8oYi54LCBiLnkpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgfVxuICBmb3IgKGxldCB5ID0gc3RhcnRZOyB5IDw9IGVuZFk7IHkgKz0gc3RlcCkge1xuICAgIGNvbnN0IGEgPSB3b3JsZFRvQ2FudmFzKHsgeDogTWF0aC5tYXgoMCwgbWluWCksIHkgfSk7XG4gICAgY29uc3QgYiA9IHdvcmxkVG9DYW52YXMoeyB4OiBNYXRoLm1pbih3b3JsZC53LCBtYXhYKSwgeSB9KTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhhLngsIGEueSk7XG4gICAgY3R4LmxpbmVUbyhiLngsIGIueSk7XG4gICAgY3R4LnN0cm9rZSgpO1xuICB9XG4gIGN0eC5yZXN0b3JlKCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpOiB2b2lkIHtcbiAgaWYgKCFtaXNzaWxlTGF1bmNoQnRuIHx8ICFtaXNzaWxlTGF1bmNoVGV4dCB8fCAhbWlzc2lsZUxhdW5jaEluZm8pIHJldHVybjtcbiAgY29uc3Qgcm91dGUgPSBnZXRBY3RpdmVNaXNzaWxlUm91dGUoKTtcbiAgY29uc3QgY291bnQgPSByb3V0ZSAmJiBBcnJheS5pc0FycmF5KHJvdXRlLndheXBvaW50cykgPyByb3V0ZS53YXlwb2ludHMubGVuZ3RoIDogMDtcbiAgY29uc3QgcmVtYWluaW5nID0gZ2V0TWlzc2lsZUNvb2xkb3duUmVtYWluaW5nKCk7XG4gIGNvbnN0IGNvb2xpbmdEb3duID0gcmVtYWluaW5nID4gMC4wNTtcbiAgY29uc3Qgc2hvdWxkRGlzYWJsZSA9ICFyb3V0ZSB8fCBjb3VudCA9PT0gMCB8fCBjb29saW5nRG93bjtcbiAgbWlzc2lsZUxhdW5jaEJ0bi5kaXNhYmxlZCA9IHNob3VsZERpc2FibGU7XG5cbiAgY29uc3QgbGF1bmNoVGV4dEhUTUwgPSAnPHNwYW4gY2xhc3M9XCJidG4tdGV4dC1mdWxsXCI+TGF1bmNoPC9zcGFuPjxzcGFuIGNsYXNzPVwiYnRuLXRleHQtc2hvcnRcIj5GaXJlPC9zcGFuPic7XG4gIGxldCBsYXVuY2hJbmZvSFRNTCA9IFwiXCI7XG5cbiAgaWYgKCFyb3V0ZSkge1xuICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgfSBlbHNlIGlmIChjb29saW5nRG93bikge1xuICAgIGxhdW5jaEluZm9IVE1MID0gYCR7cmVtYWluaW5nLnRvRml4ZWQoMSl9c2A7XG4gIH0gZWxzZSBpZiAocm91dGUubmFtZSkge1xuICAgIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkoc3RhdGVSZWYubWlzc2lsZVJvdXRlcykgPyBzdGF0ZVJlZi5taXNzaWxlUm91dGVzIDogW107XG4gICAgY29uc3Qgcm91dGVJbmRleCA9IHJvdXRlcy5maW5kSW5kZXgoKHIpID0+IHIuaWQgPT09IHJvdXRlLmlkKSArIDE7XG4gICAgbGF1bmNoSW5mb0hUTUwgPSBgPHNwYW4gY2xhc3M9XCJidG4tdGV4dC1mdWxsXCI+JHtyb3V0ZS5uYW1lfTwvc3Bhbj48c3BhbiBjbGFzcz1cImJ0bi10ZXh0LXNob3J0XCI+JHtyb3V0ZUluZGV4fTwvc3Bhbj5gO1xuICB9IGVsc2Uge1xuICAgIGxhdW5jaEluZm9IVE1MID0gXCJcIjtcbiAgfVxuXG4gIGlmIChsYXN0TWlzc2lsZUxhdW5jaFRleHRIVE1MICE9PSBsYXVuY2hUZXh0SFRNTCkge1xuICAgIG1pc3NpbGVMYXVuY2hUZXh0LmlubmVySFRNTCA9IGxhdW5jaFRleHRIVE1MO1xuICAgIGxhc3RNaXNzaWxlTGF1bmNoVGV4dEhUTUwgPSBsYXVuY2hUZXh0SFRNTDtcbiAgfVxuXG4gIGlmIChsYXN0TWlzc2lsZUxhdW5jaEluZm9IVE1MICE9PSBsYXVuY2hJbmZvSFRNTCkge1xuICAgIG1pc3NpbGVMYXVuY2hJbmZvLmlubmVySFRNTCA9IGxhdW5jaEluZm9IVE1MO1xuICAgIGxhc3RNaXNzaWxlTGF1bmNoSW5mb0hUTUwgPSBsYXVuY2hJbmZvSFRNTDtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRNaXNzaWxlQ29vbGRvd25SZW1haW5pbmcoKTogbnVtYmVyIHtcbiAgY29uc3QgcmVtYWluaW5nID0gc3RhdGVSZWYubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlUmVmKTtcbiAgcmV0dXJuIHJlbWFpbmluZyA+IDAgPyByZW1haW5pbmcgOiAwO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTdGF0dXNJbmRpY2F0b3JzKCk6IHZvaWQge1xuICBjb25zdCBtZXRhID0gc3RhdGVSZWYud29ybGRNZXRhID8/IHt9O1xuICBjb25zdCBoYXNXaWR0aCA9IHR5cGVvZiBtZXRhLncgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEudyk7XG4gIGNvbnN0IGhhc0hlaWdodCA9IHR5cGVvZiBtZXRhLmggPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKG1ldGEuaCk7XG5cbiAgaWYgKGhhc1dpZHRoKSB7XG4gICAgd29ybGQudyA9IG1ldGEudyE7XG4gIH1cbiAgaWYgKGhhc0hlaWdodCkge1xuICAgIHdvcmxkLmggPSBtZXRhLmghO1xuICB9XG4gIGlmIChIUHNwYW4pIHtcbiAgICBpZiAoc3RhdGVSZWYubWUgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXRlUmVmLm1lLmhwKSkge1xuICAgICAgSFBzcGFuLnRleHRDb250ZW50ID0gTnVtYmVyKHN0YXRlUmVmLm1lLmhwKS50b1N0cmluZygpO1xuICAgIH0gZWxzZSB7XG4gICAgICBIUHNwYW4udGV4dENvbnRlbnQgPSBcIlx1MjAxM1wiO1xuICAgIH1cbiAgfVxuICBpZiAoa2lsbHNTcGFuKSB7XG4gICAgaWYgKHN0YXRlUmVmLm1lICYmIE51bWJlci5pc0Zpbml0ZShzdGF0ZVJlZi5tZS5raWxscykpIHtcbiAgICAgIGtpbGxzU3Bhbi50ZXh0Q29udGVudCA9IE51bWJlcihzdGF0ZVJlZi5tZS5raWxscykudG9TdHJpbmcoKTtcbiAgICB9IGVsc2Uge1xuICAgICAga2lsbHNTcGFuLnRleHRDb250ZW50ID0gXCIwXCI7XG4gICAgfVxuICB9XG5cbiAgLy8gVXBkYXRlIGhlYXQgYmFyXG4gIHVwZGF0ZUhlYXRCYXIoKTtcbiAgLy8gVXBkYXRlIHBsYW5uZWQgaGVhdCBiYXJcbiAgdXBkYXRlUGxhbm5lZEhlYXRCYXIoKTtcbiAgLy8gVXBkYXRlIHNwZWVkIG1hcmtlciBwb3NpdGlvblxuICB1cGRhdGVTcGVlZE1hcmtlcigpO1xuICAvLyBVcGRhdGUgc3RhbGwgb3ZlcmxheVxuICB1cGRhdGVTdGFsbE92ZXJsYXkoKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlSGVhdEJhcigpOiB2b2lkIHtcbiAgY29uc3QgaGVhdCA9IHN0YXRlUmVmLm1lPy5oZWF0O1xuICBpZiAoIWhlYXQgfHwgIWhlYXRCYXJGaWxsIHx8ICFoZWF0VmFsdWVUZXh0KSB7XG4gICAgaGVhdFdhcm5BY3RpdmUgPSBmYWxzZTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBwZXJjZW50ID0gKGhlYXQudmFsdWUgLyBoZWF0Lm1heCkgKiAxMDA7XG4gIGhlYXRCYXJGaWxsLnN0eWxlLndpZHRoID0gYCR7cGVyY2VudH0lYDtcblxuICAvLyBVcGRhdGUgdGV4dFxuICBoZWF0VmFsdWVUZXh0LnRleHRDb250ZW50ID0gYEhlYXQgJHtNYXRoLnJvdW5kKGhlYXQudmFsdWUpfWA7XG5cbiAgLy8gVXBkYXRlIGNvbG9yIGNsYXNzZXNcbiAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LnJlbW92ZShcIndhcm5cIiwgXCJvdmVyaGVhdFwiKTtcbiAgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC5vdmVyaGVhdEF0KSB7XG4gICAgaGVhdEJhckZpbGwuY2xhc3NMaXN0LmFkZChcIm92ZXJoZWF0XCIpO1xuICB9IGVsc2UgaWYgKGhlYXQudmFsdWUgPj0gaGVhdC53YXJuQXQpIHtcbiAgICBoZWF0QmFyRmlsbC5jbGFzc0xpc3QuYWRkKFwid2FyblwiKTtcbiAgfVxuXG4gIGNvbnN0IG5vd1dhcm4gPSBoZWF0LnZhbHVlID49IGhlYXQud2FybkF0O1xuICBpZiAobm93V2FybiAmJiAhaGVhdFdhcm5BY3RpdmUpIHtcbiAgICBoZWF0V2FybkFjdGl2ZSA9IHRydWU7XG4gICAgYnVzUmVmLmVtaXQoXCJoZWF0Ondhcm5FbnRlcmVkXCIsIHsgdmFsdWU6IGhlYXQudmFsdWUsIHdhcm5BdDogaGVhdC53YXJuQXQgfSk7XG4gIH0gZWxzZSBpZiAoIW5vd1dhcm4gJiYgaGVhdFdhcm5BY3RpdmUpIHtcbiAgICBjb25zdCBjb29sVGhyZXNob2xkID0gTWF0aC5tYXgoMCwgaGVhdC53YXJuQXQgLSA1KTtcbiAgICBpZiAoaGVhdC52YWx1ZSA8PSBjb29sVGhyZXNob2xkKSB7XG4gICAgICBoZWF0V2FybkFjdGl2ZSA9IGZhbHNlO1xuICAgICAgYnVzUmVmLmVtaXQoXCJoZWF0OmNvb2xlZEJlbG93V2FyblwiLCB7IHZhbHVlOiBoZWF0LnZhbHVlLCB3YXJuQXQ6IGhlYXQud2FybkF0IH0pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVQbGFubmVkSGVhdEJhcigpOiB2b2lkIHtcbiAgY29uc3Qgc2hpcCA9IHN0YXRlUmVmLm1lO1xuICBjb25zdCBwbGFubmVkRWwgPSBoZWF0QmFyUGxhbm5lZDtcbiAgaWYgKCFzaGlwIHx8ICFzaGlwLmhlYXQgfHwgIXBsYW5uZWRFbCkge1xuICAgIGR1YWxNZXRlckFsZXJ0ID0gZmFsc2U7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgcGxhbm5lZCA9IHByb2plY3RQbGFubmVkSGVhdChzaGlwKTtcbiAgY29uc3QgYWN0dWFsID0gc2hpcC5oZWF0LnZhbHVlO1xuICBjb25zdCBwZXJjZW50ID0gKHBsYW5uZWQgLyBzaGlwLmhlYXQubWF4KSAqIDEwMDtcbiAgcGxhbm5lZEVsLnN0eWxlLndpZHRoID0gYCR7TWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBwZXJjZW50KSl9JWA7XG5cbiAgY29uc3QgZGlmZiA9IHBsYW5uZWQgLSBhY3R1YWw7XG4gIGNvbnN0IHRocmVzaG9sZCA9IE1hdGgubWF4KDgsIHNoaXAuaGVhdC53YXJuQXQgKiAwLjEpO1xuICBpZiAoZGlmZiA+PSB0aHJlc2hvbGQgJiYgIWR1YWxNZXRlckFsZXJ0KSB7XG4gICAgZHVhbE1ldGVyQWxlcnQgPSB0cnVlO1xuICAgIGJ1c1JlZi5lbWl0KFwiaGVhdDpkdWFsTWV0ZXJEaXZlcmdlZFwiLCB7IHBsYW5uZWQsIGFjdHVhbCB9KTtcbiAgfSBlbHNlIGlmIChkaWZmIDwgdGhyZXNob2xkICogMC42ICYmIGR1YWxNZXRlckFsZXJ0KSB7XG4gICAgZHVhbE1ldGVyQWxlcnQgPSBmYWxzZTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwcm9qZWN0UGxhbm5lZEhlYXQoc2hpcDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2F5cG9pbnRzOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBzcGVlZD86IG51bWJlciB9W107IGhlYXQ/OiB7IHZhbHVlOiBudW1iZXI7IG1heDogbnVtYmVyOyBtYXJrZXJTcGVlZDogbnVtYmVyOyBrVXA6IG51bWJlcjsga0Rvd246IG51bWJlcjsgZXhwOiBudW1iZXI7IHdhcm5BdDogbnVtYmVyOyBvdmVyaGVhdEF0OiBudW1iZXIgfSB9KTogbnVtYmVyIHtcbiAgY29uc3QgaGVhdCA9IHNoaXAuaGVhdCE7XG5cbiAgLy8gQnVpbGQgcm91dGUgZnJvbSBzaGlwIHBvc2l0aW9uIGFuZCB3YXlwb2ludHNcbiAgY29uc3Qgcm91dGUgPSBbeyB4OiBzaGlwLngsIHk6IHNoaXAueSwgc3BlZWQ6IHVuZGVmaW5lZCB9LCAuLi5zaGlwLndheXBvaW50c107XG5cbiAgLy8gVXNlIHNoYXJlZCBoZWF0IHByb2plY3Rpb25cbiAgY29uc3QgaGVhdFBhcmFtczogSGVhdFByb2plY3Rpb25QYXJhbXMgPSB7XG4gICAgbWFya2VyU3BlZWQ6IGhlYXQubWFya2VyU3BlZWQsXG4gICAga1VwOiBoZWF0LmtVcCxcbiAgICBrRG93bjogaGVhdC5rRG93bixcbiAgICBleHA6IGhlYXQuZXhwLFxuICAgIG1heDogaGVhdC5tYXgsXG4gICAgb3ZlcmhlYXRBdDogaGVhdC5vdmVyaGVhdEF0LFxuICAgIHdhcm5BdDogaGVhdC53YXJuQXQsXG4gIH07XG5cbiAgY29uc3QgcHJvamVjdGlvbiA9IHByb2plY3RSb3V0ZUhlYXQocm91dGUsIGhlYXQudmFsdWUsIGhlYXRQYXJhbXMpO1xuXG4gIC8vIFJldHVybiBtYXhpbXVtIGhlYXQgYWxvbmcgcm91dGVcbiAgcmV0dXJuIE1hdGgubWF4KC4uLnByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU3BlZWRNYXJrZXIoKTogdm9pZCB7XG4gIGNvbnN0IHNoaXBIZWF0ID0gc3RhdGVSZWYubWU/LmhlYXQ7XG4gIGlmIChzcGVlZE1hcmtlciAmJiBzaGlwU3BlZWRTbGlkZXIgJiYgc2hpcEhlYXQgJiYgc2hpcEhlYXQubWFya2VyU3BlZWQgPiAwKSB7XG4gICAgY29uc3QgbWluID0gcGFyc2VGbG9hdChzaGlwU3BlZWRTbGlkZXIubWluKTtcbiAgICBjb25zdCBtYXggPSBwYXJzZUZsb2F0KHNoaXBTcGVlZFNsaWRlci5tYXgpO1xuICAgIGNvbnN0IG1hcmtlclNwZWVkID0gc2hpcEhlYXQubWFya2VyU3BlZWQ7XG4gICAgY29uc3QgcGVyY2VudCA9ICgobWFya2VyU3BlZWQgLSBtaW4pIC8gKG1heCAtIG1pbikpICogMTAwO1xuICAgIGNvbnN0IGNsYW1wZWQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIHBlcmNlbnQpKTtcbiAgICBzcGVlZE1hcmtlci5zdHlsZS5sZWZ0ID0gYCR7Y2xhbXBlZH0lYDtcbiAgICBzcGVlZE1hcmtlci50aXRsZSA9IGBIZWF0IG5ldXRyYWw6ICR7TWF0aC5yb3VuZChtYXJrZXJTcGVlZCl9IHVuaXRzL3NgO1xuICAgIHNwZWVkTWFya2VyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gIH0gZWxzZSBpZiAoc3BlZWRNYXJrZXIpIHtcbiAgICBzcGVlZE1hcmtlci5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIH1cblxuICBpZiAobWlzc2lsZVNwZWVkTWFya2VyICYmIG1pc3NpbGVTcGVlZFNsaWRlcikge1xuICAgIGNvbnN0IGhlYXRQYXJhbXMgPSBzdGF0ZVJlZi5taXNzaWxlQ29uZmlnLmhlYXRQYXJhbXM7XG4gICAgY29uc3QgbWFya2VyU3BlZWQgPVxuICAgICAgKGhlYXRQYXJhbXMgJiYgTnVtYmVyLmlzRmluaXRlKGhlYXRQYXJhbXMubWFya2VyU3BlZWQpID8gaGVhdFBhcmFtcy5tYXJrZXJTcGVlZCA6IHVuZGVmaW5lZCkgPz9cbiAgICAgIChzaGlwSGVhdCAmJiBzaGlwSGVhdC5tYXJrZXJTcGVlZCA+IDAgPyBzaGlwSGVhdC5tYXJrZXJTcGVlZCA6IHVuZGVmaW5lZCk7XG5cbiAgICBpZiAobWFya2VyU3BlZWQgIT09IHVuZGVmaW5lZCAmJiBtYXJrZXJTcGVlZCA+IDApIHtcbiAgICAgIGNvbnN0IG1pbiA9IHBhcnNlRmxvYXQobWlzc2lsZVNwZWVkU2xpZGVyLm1pbik7XG4gICAgICBjb25zdCBtYXggPSBwYXJzZUZsb2F0KG1pc3NpbGVTcGVlZFNsaWRlci5tYXgpO1xuICAgICAgY29uc3QgcGVyY2VudCA9ICgobWFya2VyU3BlZWQgLSBtaW4pIC8gKG1heCAtIG1pbikpICogMTAwO1xuICAgICAgY29uc3QgY2xhbXBlZCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGVyY2VudCkpO1xuICAgICAgbWlzc2lsZVNwZWVkTWFya2VyLnN0eWxlLmxlZnQgPSBgJHtjbGFtcGVkfSVgO1xuICAgICAgbWlzc2lsZVNwZWVkTWFya2VyLnRpdGxlID0gYEhlYXQgbmV1dHJhbDogJHtNYXRoLnJvdW5kKG1hcmtlclNwZWVkKX0gdW5pdHMvc2A7XG4gICAgICBtaXNzaWxlU3BlZWRNYXJrZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgbWlzc2lsZVNwZWVkTWFya2VyLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlU3RhbGxPdmVybGF5KCk6IHZvaWQge1xuICBjb25zdCBoZWF0ID0gc3RhdGVSZWYubWU/LmhlYXQ7XG4gIGlmICghaGVhdCB8fCAhc3RhbGxPdmVybGF5KSB7XG4gICAgc3RhbGxBY3RpdmUgPSBmYWxzZTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBub3cgPSB0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiXG4gICAgPyBwZXJmb3JtYW5jZS5ub3coKVxuICAgIDogRGF0ZS5ub3coKTtcblxuICBjb25zdCBpc1N0YWxsZWQgPSBub3cgPCBoZWF0LnN0YWxsVW50aWxNcztcblxuICBpZiAoaXNTdGFsbGVkKSB7XG4gICAgc3RhbGxPdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgIGlmICghc3RhbGxBY3RpdmUpIHtcbiAgICAgIHN0YWxsQWN0aXZlID0gdHJ1ZTtcbiAgICAgIGJ1c1JlZi5lbWl0KFwiaGVhdDpzdGFsbFRyaWdnZXJlZFwiLCB7IHN0YWxsVW50aWw6IGhlYXQuc3RhbGxVbnRpbE1zIH0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBzdGFsbE92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcInZpc2libGVcIik7XG4gICAgaWYgKHN0YWxsQWN0aXZlKSB7XG4gICAgICBzdGFsbEFjdGl2ZSA9IGZhbHNlO1xuICAgICAgYnVzUmVmLmVtaXQoXCJoZWF0OnN0YWxsUmVjb3ZlcmVkXCIsIHsgdmFsdWU6IGhlYXQudmFsdWUgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFjdHggfHwgIWN2KSByZXR1cm47XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKHRpbWVzdGFtcCkpIHtcbiAgICB0aW1lc3RhbXAgPSBsYXN0TG9vcFRzID8/IDA7XG4gIH1cbiAgbGV0IGR0U2Vjb25kcyA9IDA7XG4gIGlmIChsYXN0TG9vcFRzICE9PSBudWxsKSB7XG4gICAgZHRTZWNvbmRzID0gKHRpbWVzdGFtcCAtIGxhc3RMb29wVHMpIC8gMTAwMDtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShkdFNlY29uZHMpIHx8IGR0U2Vjb25kcyA8IDApIHtcbiAgICAgIGR0U2Vjb25kcyA9IDA7XG4gICAgfVxuICB9XG4gIGxhc3RMb29wVHMgPSB0aW1lc3RhbXA7XG4gIHVwZGF0ZVJvdXRlQW5pbWF0aW9ucyhkdFNlY29uZHMpO1xuXG4gIGN0eC5jbGVhclJlY3QoMCwgMCwgY3Yud2lkdGgsIGN2LmhlaWdodCk7XG4gIGRyYXdHcmlkKCk7XG4gIGRyYXdSb3V0ZSgpO1xuICBkcmF3TWlzc2lsZVJvdXRlKCk7XG4gIGRyYXdNaXNzaWxlcygpO1xuXG4gIHVwZGF0ZU1pc3NpbGVMYXVuY2hCdXR0b25TdGF0ZSgpO1xuXG4gIGZvciAoY29uc3QgZyBvZiBzdGF0ZVJlZi5naG9zdHMpIHtcbiAgICBkcmF3U2hpcChnLngsIGcueSwgZy52eCwgZy52eSwgXCIjOWNhM2FmXCIsIGZhbHNlKTtcbiAgICBkcmF3R2hvc3REb3QoZy54LCBnLnkpO1xuICB9XG4gIGlmIChzdGF0ZVJlZi5tZSkge1xuICAgIGRyYXdTaGlwKHN0YXRlUmVmLm1lLngsIHN0YXRlUmVmLm1lLnksIHN0YXRlUmVmLm1lLnZ4LCBzdGF0ZVJlZi5tZS52eSwgXCIjMjJkM2VlXCIsIHRydWUpO1xuICB9XG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShsb29wKTtcbn1cbiIsICJpbXBvcnQgeyBjbGFtcCB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuXG5pbnRlcmZhY2UgSGlnaGxpZ2h0Q29udGVudE9wdGlvbnMge1xuICB0YXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGJvZHk6IHN0cmluZztcbiAgc3RlcEluZGV4OiBudW1iZXI7XG4gIHN0ZXBDb3VudDogbnVtYmVyO1xuICBzaG93TmV4dDogYm9vbGVhbjtcbiAgbmV4dExhYmVsPzogc3RyaW5nO1xuICBvbk5leHQ/OiAoKSA9PiB2b2lkO1xuICBzaG93U2tpcDogYm9vbGVhbjtcbiAgc2tpcExhYmVsPzogc3RyaW5nO1xuICBvblNraXA/OiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhpZ2hsaWdodGVyIHtcbiAgc2hvdyhvcHRpb25zOiBIaWdobGlnaHRDb250ZW50T3B0aW9ucyk6IHZvaWQ7XG4gIGhpZGUoKTogdm9pZDtcbiAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5jb25zdCBTVFlMRV9JRCA9IFwidHV0b3JpYWwtb3ZlcmxheS1zdHlsZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSGlnaGxpZ2h0ZXIoKTogSGlnaGxpZ2h0ZXIge1xuICBlbnN1cmVTdHlsZXMoKTtcblxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgb3ZlcmxheS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlcIjtcbiAgb3ZlcmxheS5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxpdmVcIiwgXCJwb2xpdGVcIik7XG5cbiAgY29uc3Qgc2NyaW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzY3JpbS5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3NjcmltXCI7XG5cbiAgY29uc3QgaGlnaGxpZ2h0Qm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGlnaGxpZ2h0Qm94LmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9faGlnaGxpZ2h0XCI7XG5cbiAgY29uc3QgdG9vbHRpcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRvb2x0aXAuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X190b29sdGlwXCI7XG5cbiAgY29uc3QgcHJvZ3Jlc3MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBwcm9ncmVzcy5jbGFzc05hbWUgPSBcInR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzXCI7XG5cbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaDNcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwidHV0b3JpYWwtb3ZlcmxheV9fdGl0bGVcIjtcblxuICBjb25zdCBib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XG4gIGJvZHkuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19ib2R5XCI7XG5cbiAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zXCI7XG5cbiAgY29uc3Qgc2tpcEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIHNraXBCdG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIHNraXBCdG4uY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19idG4gdHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1naG9zdFwiO1xuICBza2lwQnRuLnRleHRDb250ZW50ID0gXCJTa2lwXCI7XG5cbiAgY29uc3QgbmV4dEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIG5leHRCdG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIG5leHRCdG4uY2xhc3NOYW1lID0gXCJ0dXRvcmlhbC1vdmVybGF5X19idG4gdHV0b3JpYWwtb3ZlcmxheV9fYnRuLS1wcmltYXJ5XCI7XG4gIG5leHRCdG4udGV4dENvbnRlbnQgPSBcIk5leHRcIjtcblxuICBhY3Rpb25zLmFwcGVuZChza2lwQnRuLCBuZXh0QnRuKTtcbiAgdG9vbHRpcC5hcHBlbmQocHJvZ3Jlc3MsIHRpdGxlLCBib2R5LCBhY3Rpb25zKTtcbiAgb3ZlcmxheS5hcHBlbmQoc2NyaW0sIGhpZ2hsaWdodEJveCwgdG9vbHRpcCk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cbiAgbGV0IGN1cnJlbnRUYXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCB2aXNpYmxlID0gZmFsc2U7XG4gIGxldCByZXNpemVPYnNlcnZlcjogUmVzaXplT2JzZXJ2ZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IGZyYW1lSGFuZGxlOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgbGV0IG9uTmV4dDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG4gIGxldCBvblNraXA6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIHNjaGVkdWxlVXBkYXRlKCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSkgcmV0dXJuO1xuICAgIGlmIChmcmFtZUhhbmRsZSAhPT0gbnVsbCkgcmV0dXJuO1xuICAgIGZyYW1lSGFuZGxlID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICBmcmFtZUhhbmRsZSA9IG51bGw7XG4gICAgICB1cGRhdGVQb3NpdGlvbigpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlUG9zaXRpb24oKTogdm9pZCB7XG4gICAgaWYgKCF2aXNpYmxlKSByZXR1cm47XG5cbiAgICBpZiAoY3VycmVudFRhcmdldCkge1xuICAgICAgY29uc3QgcmVjdCA9IGN1cnJlbnRUYXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBjb25zdCBwYWRkaW5nID0gMTI7XG4gICAgICBjb25zdCB3aWR0aCA9IE1hdGgubWF4KDAsIHJlY3Qud2lkdGggKyBwYWRkaW5nICogMik7XG4gICAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1heCgwLCByZWN0LmhlaWdodCArIHBhZGRpbmcgKiAyKTtcbiAgICAgIGNvbnN0IGxlZnQgPSByZWN0LmxlZnQgLSBwYWRkaW5nO1xuICAgICAgY29uc3QgdG9wID0gcmVjdC50b3AgLSBwYWRkaW5nO1xuXG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKGxlZnQpfXB4LCAke01hdGgucm91bmQodG9wKX1weClgO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLndpZHRoID0gYCR7TWF0aC5yb3VuZCh3aWR0aCl9cHhgO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLmhlaWdodCA9IGAke01hdGgucm91bmQoaGVpZ2h0KX1weGA7XG5cbiAgICAgIHRvb2x0aXAuc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJ2aXNpYmxlXCI7XG4gICAgICB0b29sdGlwLnN0eWxlLm1heFdpZHRoID0gYG1pbigzNDBweCwgJHtNYXRoLm1heCgyNjAsIHdpbmRvdy5pbm5lcldpZHRoIC0gMzIpfXB4KWA7XG4gICAgICBjb25zdCB0b29sdGlwV2lkdGggPSB0b29sdGlwLm9mZnNldFdpZHRoO1xuICAgICAgY29uc3QgdG9vbHRpcEhlaWdodCA9IHRvb2x0aXAub2Zmc2V0SGVpZ2h0O1xuICAgICAgbGV0IHRvb2x0aXBUb3AgPSByZWN0LmJvdHRvbSArIDE4O1xuICAgICAgaWYgKHRvb2x0aXBUb3AgKyB0b29sdGlwSGVpZ2h0ID4gd2luZG93LmlubmVySGVpZ2h0IC0gMjApIHtcbiAgICAgICAgdG9vbHRpcFRvcCA9IE1hdGgubWF4KDIwLCByZWN0LnRvcCAtIHRvb2x0aXBIZWlnaHQgLSAxOCk7XG4gICAgICB9XG4gICAgICBsZXQgdG9vbHRpcExlZnQgPSByZWN0LmxlZnQgKyByZWN0LndpZHRoIC8gMiAtIHRvb2x0aXBXaWR0aCAvIDI7XG4gICAgICB0b29sdGlwTGVmdCA9IGNsYW1wKHRvb2x0aXBMZWZ0LCAyMCwgd2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGggLSAyMCk7XG4gICAgICB0b29sdGlwLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtNYXRoLnJvdW5kKHRvb2x0aXBMZWZ0KX1weCwgJHtNYXRoLnJvdW5kKHRvb2x0aXBUb3ApfXB4KWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhpZ2hsaWdodEJveC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUud2lkdGggPSBcIjBweFwiO1xuICAgICAgaGlnaGxpZ2h0Qm94LnN0eWxlLmhlaWdodCA9IFwiMHB4XCI7XG4gICAgICBoaWdobGlnaHRCb3guc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke01hdGgucm91bmQod2luZG93LmlubmVyV2lkdGggLyAyKX1weCwgJHtNYXRoLnJvdW5kKHdpbmRvdy5pbm5lckhlaWdodCAvIDIpfXB4KWA7XG5cbiAgICAgIHRvb2x0aXAuc3R5bGUub3BhY2l0eSA9IFwiMVwiO1xuICAgICAgdG9vbHRpcC5zdHlsZS52aXNpYmlsaXR5ID0gXCJ2aXNpYmxlXCI7XG4gICAgICBjb25zdCB0b29sdGlwV2lkdGggPSB0b29sdGlwLm9mZnNldFdpZHRoO1xuICAgICAgY29uc3QgdG9vbHRpcEhlaWdodCA9IHRvb2x0aXAub2Zmc2V0SGVpZ2h0O1xuICAgICAgY29uc3QgdG9vbHRpcExlZnQgPSBjbGFtcCgod2luZG93LmlubmVyV2lkdGggLSB0b29sdGlwV2lkdGgpIC8gMiwgMjAsIHdpbmRvdy5pbm5lcldpZHRoIC0gdG9vbHRpcFdpZHRoIC0gMjApO1xuICAgICAgY29uc3QgdG9vbHRpcFRvcCA9IGNsYW1wKCh3aW5kb3cuaW5uZXJIZWlnaHQgLSB0b29sdGlwSGVpZ2h0KSAvIDIsIDIwLCB3aW5kb3cuaW5uZXJIZWlnaHQgLSB0b29sdGlwSGVpZ2h0IC0gMjApO1xuICAgICAgdG9vbHRpcC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7TWF0aC5yb3VuZCh0b29sdGlwTGVmdCl9cHgsICR7TWF0aC5yb3VuZCh0b29sdGlwVG9wKX1weClgO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF0dGFjaExpc3RlbmVycygpOiB2b2lkIHtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCBzY2hlZHVsZVVwZGF0ZSwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIHNjaGVkdWxlVXBkYXRlLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBkZXRhY2hMaXN0ZW5lcnMoKTogdm9pZCB7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgc2NoZWR1bGVVcGRhdGUpO1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIHNjaGVkdWxlVXBkYXRlKTtcbiAgICBpZiAoZnJhbWVIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZShmcmFtZUhhbmRsZSk7XG4gICAgICBmcmFtZUhhbmRsZSA9IG51bGw7XG4gICAgfVxuICAgIGlmIChyZXNpemVPYnNlcnZlcikge1xuICAgICAgcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgcmVzaXplT2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHNraXBCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgb25Ta2lwPy4oKTtcbiAgfSk7XG5cbiAgbmV4dEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBvbk5leHQ/LigpO1xuICB9KTtcblxuICBmdW5jdGlvbiByZW5kZXJUb29sdGlwKG9wdGlvbnM6IEhpZ2hsaWdodENvbnRlbnRPcHRpb25zKTogdm9pZCB7XG4gICAgY29uc3QgeyBzdGVwQ291bnQsIHN0ZXBJbmRleCwgdGl0bGU6IG9wdGlvblRpdGxlLCBib2R5OiBvcHRpb25Cb2R5LCBzaG93TmV4dCwgbmV4dExhYmVsLCBzaG93U2tpcCwgc2tpcExhYmVsIH0gPSBvcHRpb25zO1xuXG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShzdGVwQ291bnQpICYmIHN0ZXBDb3VudCA+IDApIHtcbiAgICAgIHByb2dyZXNzLnRleHRDb250ZW50ID0gYFN0ZXAgJHtzdGVwSW5kZXggKyAxfSBvZiAke3N0ZXBDb3VudH1gO1xuICAgICAgcHJvZ3Jlc3Muc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgcHJvZ3Jlc3MudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgcHJvZ3Jlc3Muc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIH1cblxuICAgIGlmIChvcHRpb25UaXRsZSAmJiBvcHRpb25UaXRsZS50cmltKCkubGVuZ3RoID4gMCkge1xuICAgICAgdGl0bGUudGV4dENvbnRlbnQgPSBvcHRpb25UaXRsZTtcbiAgICAgIHRpdGxlLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRpdGxlLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIHRpdGxlLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBib2R5LnRleHRDb250ZW50ID0gb3B0aW9uQm9keTtcblxuICAgIG9uTmV4dCA9IHNob3dOZXh0ID8gb3B0aW9ucy5vbk5leHQgPz8gbnVsbCA6IG51bGw7XG4gICAgaWYgKHNob3dOZXh0KSB7XG4gICAgICBuZXh0QnRuLnRleHRDb250ZW50ID0gbmV4dExhYmVsID8/IFwiTmV4dFwiO1xuICAgICAgbmV4dEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJpbmxpbmUtZmxleFwiO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0QnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG5cbiAgICBvblNraXAgPSBzaG93U2tpcCA/IG9wdGlvbnMub25Ta2lwID8/IG51bGwgOiBudWxsO1xuICAgIGlmIChzaG93U2tpcCkge1xuICAgICAgc2tpcEJ0bi50ZXh0Q29udGVudCA9IHNraXBMYWJlbCA/PyBcIlNraXBcIjtcbiAgICAgIHNraXBCdG4uc3R5bGUuZGlzcGxheSA9IFwiaW5saW5lLWZsZXhcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgc2tpcEJ0bi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvdyhvcHRpb25zOiBIaWdobGlnaHRDb250ZW50T3B0aW9ucyk6IHZvaWQge1xuICAgIHZpc2libGUgPSB0cnVlO1xuICAgIGN1cnJlbnRUYXJnZXQgPSBvcHRpb25zLnRhcmdldCA/PyBudWxsO1xuICAgIG92ZXJsYXkuY2xhc3NMaXN0LmFkZChcInZpc2libGVcIik7XG4gICAgcmVuZGVyVG9vbHRpcChvcHRpb25zKTtcbiAgICBpZiAocmVzaXplT2JzZXJ2ZXIpIHtcbiAgICAgIHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHJlc2l6ZU9ic2VydmVyID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKGN1cnJlbnRUYXJnZXQgJiYgdHlwZW9mIFJlc2l6ZU9ic2VydmVyICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICByZXNpemVPYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcigoKSA9PiBzY2hlZHVsZVVwZGF0ZSgpKTtcbiAgICAgIHJlc2l6ZU9ic2VydmVyLm9ic2VydmUoY3VycmVudFRhcmdldCk7XG4gICAgfVxuICAgIGF0dGFjaExpc3RlbmVycygpO1xuICAgIHNjaGVkdWxlVXBkYXRlKCk7XG4gIH1cblxuICBmdW5jdGlvbiBoaWRlKCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSkgcmV0dXJuO1xuICAgIHZpc2libGUgPSBmYWxzZTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIHRvb2x0aXAuc3R5bGUudmlzaWJpbGl0eSA9IFwiaGlkZGVuXCI7XG4gICAgdG9vbHRpcC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgaGlnaGxpZ2h0Qm94LnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcbiAgICBkZXRhY2hMaXN0ZW5lcnMoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgaGlkZSgpO1xuICAgIG92ZXJsYXkucmVtb3ZlKCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHNob3csXG4gICAgaGlkZSxcbiAgICBkZXN0cm95LFxuICB9O1xufVxuXG5mdW5jdGlvbiBlbnN1cmVTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gIHN0eWxlLmlkID0gU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC50dXRvcmlhbC1vdmVybGF5IHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGluc2V0OiAwO1xuICAgICAgei1pbmRleDogNTA7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5LnZpc2libGUge1xuICAgICAgZGlzcGxheTogYmxvY2s7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19zY3JpbSB7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICBpbnNldDogMDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2hpZ2hsaWdodCB7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNHB4O1xuICAgICAgYm9yZGVyOiAycHggc29saWQgcmdiYSg1NiwgMTg5LCAyNDgsIDAuOTUpO1xuICAgICAgYm94LXNoYWRvdzogMCAwIDAgMnB4IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjI1KSwgMCAwIDI0cHggcmdiYSgzNCwgMjExLCAyMzgsIDAuMjUpO1xuICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMThzIGVhc2UsIHdpZHRoIDAuMThzIGVhc2UsIGhlaWdodCAwLjE4cyBlYXNlLCBvcGFjaXR5IDAuMThzIGVhc2U7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIG9wYWNpdHk6IDA7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X190b29sdGlwIHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIG1pbi13aWR0aDogMjQwcHg7XG4gICAgICBtYXgtd2lkdGg6IG1pbigzNDBweCwgY2FsYygxMDB2dyAtIDMycHgpKTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTUsIDIzLCA0MiwgMC45NSk7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTZweDtcbiAgICAgIHBhZGRpbmc6IDE2cHggMThweDtcbiAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgYm94LXNoYWRvdzogMCAxMnB4IDMycHggcmdiYSgxNSwgMjMsIDQyLCAwLjU1KTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBhdXRvO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICAgIHZpc2liaWxpdHk6IGhpZGRlbjtcbiAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlKDBweCwgMHB4KTtcbiAgICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE4cyBlYXNlLCBvcGFjaXR5IDAuMThzIGVhc2U7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19wcm9ncmVzcyB7XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wOGVtO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuNzUpO1xuICAgICAgbWFyZ2luOiAwIDAgOHB4O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fdGl0bGUge1xuICAgICAgbWFyZ2luOiAwIDAgOHB4O1xuICAgICAgZm9udC1zaXplOiAxNXB4O1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDRlbTtcbiAgICAgIGNvbG9yOiAjZjFmNWY5O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYm9keSB7XG4gICAgICBtYXJnaW46IDAgMCAxNHB4O1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuNTtcbiAgICAgIGNvbG9yOiAjY2JkNWY1O1xuICAgIH1cbiAgICAudHV0b3JpYWwtb3ZlcmxheV9fYWN0aW9ucyB7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZ2FwOiAxMHB4O1xuICAgICAganVzdGlmeS1jb250ZW50OiBmbGV4LWVuZDtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0biB7XG4gICAgICBmb250OiBpbmhlcml0O1xuICAgICAgcGFkZGluZzogNnB4IDE0cHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA5OTlweDtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgIGxldHRlci1zcGFjaW5nOiAwLjA4ZW07XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLXByaW1hcnkge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjUpO1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDU2LCAxODksIDI0OCwgMC41NSk7XG4gICAgICBjb2xvcjogI2Y4ZmFmYztcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tcHJpbWFyeTpob3ZlciB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4zNSk7XG4gICAgfVxuICAgIC50dXRvcmlhbC1vdmVybGF5X19idG4tLWdob3N0IHtcbiAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgY29sb3I6IHJnYmEoMjAzLCAyMTMsIDIyNSwgMC45KTtcbiAgICB9XG4gICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0bi0tZ2hvc3Q6aG92ZXIge1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDIwMywgMjEzLCAyMjUsIDAuNTUpO1xuICAgIH1cbiAgICBAbWVkaWEgKG1heC13aWR0aDogNzY4cHgpIHtcbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X190b29sdGlwIHtcbiAgICAgICAgbWluLXdpZHRoOiAyMDBweDtcbiAgICAgICAgbWF4LXdpZHRoOiBtaW4oMzIwcHgsIGNhbGMoMTAwdncgLSAyNHB4KSk7XG4gICAgICAgIHBhZGRpbmc6IDEwcHggMTJweDtcbiAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgZmxleC1kaXJlY3Rpb246IHJvdztcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgZ2FwOiAxMnB4O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3Byb2dyZXNzIHtcbiAgICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX3RpdGxlIHtcbiAgICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2JvZHkge1xuICAgICAgICBtYXJnaW46IDA7XG4gICAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgICAgZmxleDogMTtcbiAgICAgICAgbGluZS1oZWlnaHQ6IDEuNDtcbiAgICAgIH1cbiAgICAgIC50dXRvcmlhbC1vdmVybGF5X19hY3Rpb25zIHtcbiAgICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgICAgZ2FwOiA2cHg7XG4gICAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgfVxuICAgICAgLnR1dG9yaWFsLW92ZXJsYXlfX2J0biB7XG4gICAgICAgIHBhZGRpbmc6IDVweCAxMHB4O1xuICAgICAgICBmb250LXNpemU6IDEwcHg7XG4gICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICB9XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cbiIsICJjb25zdCBTVE9SQUdFX1BSRUZJWCA9IFwibHNkOnR1dG9yaWFsOlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsUHJvZ3Jlc3Mge1xuICBzdGVwSW5kZXg6IG51bWJlcjtcbiAgY29tcGxldGVkOiBib29sZWFuO1xuICB1cGRhdGVkQXQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZ2V0U3RvcmFnZSgpOiBTdG9yYWdlIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09IFwidW5kZWZpbmVkXCIgfHwgIXdpbmRvdy5sb2NhbFN0b3JhZ2UpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkUHJvZ3Jlc3MoaWQ6IHN0cmluZyk6IFR1dG9yaWFsUHJvZ3Jlc3MgfCBudWxsIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICBjb25zdCByYXcgPSBzdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCk7XG4gICAgaWYgKCFyYXcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBUdXRvcmlhbFByb2dyZXNzO1xuICAgIGlmIChcbiAgICAgIHR5cGVvZiBwYXJzZWQgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkID09PSBudWxsIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnN0ZXBJbmRleCAhPT0gXCJudW1iZXJcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5jb21wbGV0ZWQgIT09IFwiYm9vbGVhblwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLnVwZGF0ZWRBdCAhPT0gXCJudW1iZXJcIlxuICAgICkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZWQ7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlUHJvZ3Jlc3MoaWQ6IHN0cmluZywgcHJvZ3Jlc3M6IFR1dG9yaWFsUHJvZ3Jlc3MpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfUFJFRklYICsgaWQsIEpTT04uc3RyaW5naWZ5KHByb2dyZXNzKSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIGlnbm9yZSBzdG9yYWdlIGZhaWx1cmVzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyUHJvZ3Jlc3MoaWQ6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBzdG9yYWdlLnJlbW92ZUl0ZW0oU1RPUkFHRV9QUkVGSVggKyBpZCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIGlnbm9yZSBzdG9yYWdlIGZhaWx1cmVzXG4gIH1cbn1cbiIsICJleHBvcnQgdHlwZSBSb2xlSWQgPVxuICB8IFwiY2FudmFzXCJcbiAgfCBcInNoaXBTZXRcIlxuICB8IFwic2hpcFNlbGVjdFwiXG4gIHwgXCJzaGlwRGVsZXRlXCJcbiAgfCBcInNoaXBDbGVhclwiXG4gIHwgXCJzaGlwU3BlZWRTbGlkZXJcIlxuICB8IFwiaGVhdEJhclwiXG4gIHwgXCJzcGVlZE1hcmtlclwiXG4gIHwgXCJtaXNzaWxlU2V0XCJcbiAgfCBcIm1pc3NpbGVTZWxlY3RcIlxuICB8IFwibWlzc2lsZURlbGV0ZVwiXG4gIHwgXCJtaXNzaWxlU3BlZWRTbGlkZXJcIlxuICB8IFwibWlzc2lsZUFncm9TbGlkZXJcIlxuICB8IFwibWlzc2lsZUFkZFJvdXRlXCJcbiAgfCBcIm1pc3NpbGVMYXVuY2hcIlxuICB8IFwicm91dGVQcmV2XCJcbiAgfCBcInJvdXRlTmV4dFwiXG4gIHwgXCJoZWxwVG9nZ2xlXCJcbiAgfCBcInR1dG9yaWFsU3RhcnRcIlxuICB8IFwic3Bhd25Cb3RcIjtcblxuZXhwb3J0IHR5cGUgUm9sZVJlc29sdmVyID0gKCkgPT4gSFRNTEVsZW1lbnQgfCBudWxsO1xuXG5leHBvcnQgdHlwZSBSb2xlc01hcCA9IFJlY29yZDxSb2xlSWQsIFJvbGVSZXNvbHZlcj47XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSb2xlcygpOiBSb2xlc01hcCB7XG4gIHJldHVybiB7XG4gICAgY2FudmFzOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImN2XCIpLFxuICAgIHNoaXBTZXQ6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2hpcC1zZXRcIiksXG4gICAgc2hpcFNlbGVjdDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNlbGVjdFwiKSxcbiAgICBzaGlwRGVsZXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNoaXAtZGVsZXRlXCIpLFxuICAgIHNoaXBDbGVhcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLWNsZWFyXCIpLFxuICAgIHNoaXBTcGVlZFNsaWRlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaGlwLXNwZWVkLXNsaWRlclwiKSxcbiAgICBoZWF0QmFyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhlYXQtYmFyLWNvbnRhaW5lclwiKSxcbiAgICBzcGVlZE1hcmtlcjogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzcGVlZC1tYXJrZXJcIiksXG4gICAgbWlzc2lsZVNldDogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJtaXNzaWxlLXNldFwiKSxcbiAgICBtaXNzaWxlU2VsZWN0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc2VsZWN0XCIpLFxuICAgIG1pc3NpbGVEZWxldGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1kZWxldGVcIiksXG4gICAgbWlzc2lsZVNwZWVkU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtc3BlZWQtc2xpZGVyXCIpLFxuICAgIG1pc3NpbGVBZ3JvU2xpZGVyOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWdyby1zbGlkZXJcIiksXG4gICAgbWlzc2lsZUFkZFJvdXRlOiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1pc3NpbGUtYWRkLXJvdXRlXCIpLFxuICAgIG1pc3NpbGVMYXVuY2g6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibWlzc2lsZS1sYXVuY2hcIiksXG4gICAgcm91dGVQcmV2OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLXByZXZcIiksXG4gICAgcm91dGVOZXh0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdXRlLW5leHRcIiksXG4gICAgaGVscFRvZ2dsZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoZWxwLXRvZ2dsZVwiKSxcbiAgICB0dXRvcmlhbFN0YXJ0OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInR1dG9yaWFsLXN0YXJ0XCIpLFxuICAgIHNwYXduQm90OiAoKSA9PiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNwYXduLWJvdFwiKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJvbGVFbGVtZW50KHJvbGVzOiBSb2xlc01hcCwgcm9sZTogUm9sZUlkIHwgbnVsbCB8IHVuZGVmaW5lZCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGlmICghcm9sZSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJlc29sdmVyID0gcm9sZXNbcm9sZV07XG4gIHJldHVybiByZXNvbHZlciA/IHJlc29sdmVyKCkgOiBudWxsO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMsIEV2ZW50S2V5IH0gZnJvbSBcIi4uL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlSGlnaGxpZ2h0ZXIsIHR5cGUgSGlnaGxpZ2h0ZXIgfSBmcm9tIFwiLi9oaWdobGlnaHRcIjtcbmltcG9ydCB7IGNsZWFyUHJvZ3Jlc3MsIGxvYWRQcm9ncmVzcywgc2F2ZVByb2dyZXNzIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuaW1wb3J0IHsgZ2V0Um9sZUVsZW1lbnQsIHR5cGUgUm9sZUlkLCB0eXBlIFJvbGVzTWFwIH0gZnJvbSBcIi4vcm9sZXNcIjtcblxuZXhwb3J0IHR5cGUgU3RlcEFkdmFuY2UgPVxuICB8IHtcbiAgICAgIGtpbmQ6IFwiZXZlbnRcIjtcbiAgICAgIGV2ZW50OiBFdmVudEtleTtcbiAgICAgIHdoZW4/OiAocGF5bG9hZDogdW5rbm93bikgPT4gYm9vbGVhbjtcbiAgICAgIGNoZWNrPzogKCkgPT4gYm9vbGVhbjtcbiAgICB9XG4gIHwge1xuICAgICAga2luZDogXCJtYW51YWxcIjtcbiAgICAgIG5leHRMYWJlbD86IHN0cmluZztcbiAgICB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIFR1dG9yaWFsU3RlcCB7XG4gIGlkOiBzdHJpbmc7XG4gIHRhcmdldDogUm9sZUlkIHwgKCgpID0+IEhUTUxFbGVtZW50IHwgbnVsbCkgfCBudWxsO1xuICB0aXRsZT86IHN0cmluZztcbiAgYm9keTogc3RyaW5nO1xuICBhZHZhbmNlOiBTdGVwQWR2YW5jZTtcbiAgb25FbnRlcj86ICgpID0+IHZvaWQ7XG4gIG9uRXhpdD86ICgpID0+IHZvaWQ7XG4gIGFsbG93U2tpcD86IGJvb2xlYW47XG4gIHNraXBMYWJlbD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEVuZ2luZU9wdGlvbnMge1xuICBpZDogc3RyaW5nO1xuICBidXM6IEV2ZW50QnVzO1xuICByb2xlczogUm9sZXNNYXA7XG4gIHN0ZXBzOiBUdXRvcmlhbFN0ZXBbXTtcbn1cblxuaW50ZXJmYWNlIFN0YXJ0T3B0aW9ucyB7XG4gIHJlc3VtZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHV0b3JpYWxFbmdpbmUge1xuICBzdGFydChvcHRpb25zPzogU3RhcnRPcHRpb25zKTogdm9pZDtcbiAgcmVzdGFydCgpOiB2b2lkO1xuICBzdG9wKCk6IHZvaWQ7XG4gIGlzUnVubmluZygpOiBib29sZWFuO1xuICBkZXN0cm95KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUdXRvcmlhbEVuZ2luZSh7IGlkLCBidXMsIHJvbGVzLCBzdGVwcyB9OiBFbmdpbmVPcHRpb25zKTogVHV0b3JpYWxFbmdpbmUge1xuICBjb25zdCBoaWdobGlnaHRlcjogSGlnaGxpZ2h0ZXIgPSBjcmVhdGVIaWdobGlnaHRlcigpO1xuICBsZXQgcnVubmluZyA9IGZhbHNlO1xuICBsZXQgcGF1c2VkID0gZmFsc2U7XG4gIGxldCBjdXJyZW50SW5kZXggPSAtMTtcbiAgbGV0IGN1cnJlbnRTdGVwOiBUdXRvcmlhbFN0ZXAgfCBudWxsID0gbnVsbDtcbiAgbGV0IGNsZWFudXBDdXJyZW50OiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcbiAgbGV0IHJlbmRlckN1cnJlbnQ6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuICBsZXQgbGFzdFNhdmVkQ29tcGxldGVkID0gZmFsc2U7XG4gIGxldCBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcblxuICBjb25zdCBwZXJzaXN0ZW50TGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuXG4gIHBlcnNpc3RlbnRMaXN0ZW5lcnMucHVzaChcbiAgICBidXMub24oXCJoZWxwOnZpc2libGVDaGFuZ2VkXCIsICh7IHZpc2libGUgfSkgPT4ge1xuICAgICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgICBwYXVzZWQgPSBCb29sZWFuKHZpc2libGUpO1xuICAgICAgaWYgKHBhdXNlZCkge1xuICAgICAgICBoaWdobGlnaHRlci5oaWRlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZW5kZXJDdXJyZW50Py4oKTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcblxuICBmdW5jdGlvbiByZXNvbHZlVGFyZ2V0KHN0ZXA6IFR1dG9yaWFsU3RlcCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gICAgaWYgKCFzdGVwLnRhcmdldCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygc3RlcC50YXJnZXQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgcmV0dXJuIHN0ZXAudGFyZ2V0KCk7XG4gICAgfVxuICAgIHJldHVybiBnZXRSb2xlRWxlbWVudChyb2xlcywgc3RlcC50YXJnZXQpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2xhbXBJbmRleChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShpbmRleCkgfHwgaW5kZXggPCAwKSByZXR1cm4gMDtcbiAgICBpZiAoaW5kZXggPj0gc3RlcHMubGVuZ3RoKSByZXR1cm4gc3RlcHMubGVuZ3RoIC0gMTtcbiAgICByZXR1cm4gTWF0aC5mbG9vcihpbmRleCk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTdGVwKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIXJ1bm5pbmcpIHJldHVybjtcbiAgICBpZiAoc3RlcHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gc3RlcHMubGVuZ3RoKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cblxuICAgIGlmIChjdXJyZW50U3RlcCkge1xuICAgICAgY3VycmVudFN0ZXAub25FeGl0Py4oKTtcbiAgICAgIGN1cnJlbnRTdGVwID0gbnVsbDtcbiAgICB9XG5cbiAgICBjdXJyZW50SW5kZXggPSBpbmRleDtcbiAgICBjb25zdCBzdGVwID0gc3RlcHNbaW5kZXhdO1xuICAgIGN1cnJlbnRTdGVwID0gc3RlcDtcblxuICAgIHBlcnNpc3RQcm9ncmVzcyhpbmRleCwgZmFsc2UpO1xuXG4gICAgYnVzLmVtaXQoXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiLCB7IGlkLCBzdGVwSW5kZXg6IGluZGV4LCB0b3RhbDogc3RlcHMubGVuZ3RoIH0pO1xuICAgIHN0ZXAub25FbnRlcj8uKCk7XG5cbiAgICBjb25zdCBhbGxvd1NraXAgPSBzdGVwLmFsbG93U2tpcCAhPT0gZmFsc2U7XG4gICAgY29uc3QgcmVuZGVyID0gKCk6IHZvaWQgPT4ge1xuICAgICAgaWYgKCFydW5uaW5nIHx8IHBhdXNlZCkgcmV0dXJuO1xuICAgICAgaGlnaGxpZ2h0ZXIuc2hvdyh7XG4gICAgICAgIHRhcmdldDogcmVzb2x2ZVRhcmdldChzdGVwKSxcbiAgICAgICAgdGl0bGU6IHN0ZXAudGl0bGUsXG4gICAgICAgIGJvZHk6IHN0ZXAuYm9keSxcbiAgICAgICAgc3RlcEluZGV4OiBpbmRleCxcbiAgICAgICAgc3RlcENvdW50OiBzdGVwcy5sZW5ndGgsXG4gICAgICAgIHNob3dOZXh0OiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIixcbiAgICAgICAgbmV4dExhYmVsOiBzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJtYW51YWxcIlxuICAgICAgICAgID8gc3RlcC5hZHZhbmNlLm5leHRMYWJlbCA/PyAoaW5kZXggPT09IHN0ZXBzLmxlbmd0aCAtIDEgPyBcIkZpbmlzaFwiIDogXCJOZXh0XCIpXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIG9uTmV4dDogc3RlcC5hZHZhbmNlLmtpbmQgPT09IFwibWFudWFsXCIgPyBhZHZhbmNlU3RlcCA6IHVuZGVmaW5lZCxcbiAgICAgICAgc2hvd1NraXA6IGFsbG93U2tpcCxcbiAgICAgICAgc2tpcExhYmVsOiBzdGVwLnNraXBMYWJlbCxcbiAgICAgICAgb25Ta2lwOiBhbGxvd1NraXAgPyBza2lwQ3VycmVudFN0ZXAgOiB1bmRlZmluZWQsXG4gICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmVuZGVyQ3VycmVudCA9IHJlbmRlcjtcbiAgICByZW5kZXIoKTtcblxuICAgIGlmIChzdGVwLmFkdmFuY2Uua2luZCA9PT0gXCJldmVudFwiKSB7XG4gICAgICBjb25zdCBoYW5kbGVyID0gKHBheWxvYWQ6IHVua25vd24pOiB2b2lkID0+IHtcbiAgICAgICAgaWYgKCFydW5uaW5nIHx8IHBhdXNlZCkgcmV0dXJuO1xuICAgICAgICBpZiAoc3RlcC5hZHZhbmNlLndoZW4gJiYgIXN0ZXAuYWR2YW5jZS53aGVuKHBheWxvYWQpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2VUbyhpbmRleCArIDEpO1xuICAgICAgfTtcbiAgICAgIGNsZWFudXBDdXJyZW50ID0gYnVzLm9uKHN0ZXAuYWR2YW5jZS5ldmVudCwgaGFuZGxlciBhcyAodmFsdWU6IG5ldmVyKSA9PiB2b2lkKTtcbiAgICAgIGlmIChzdGVwLmFkdmFuY2UuY2hlY2sgJiYgc3RlcC5hZHZhbmNlLmNoZWNrKCkpIHtcbiAgICAgICAgaGFuZGxlcih1bmRlZmluZWQpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYWR2YW5jZVRvKG5leHRJbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuICAgIHJlbmRlckN1cnJlbnQgPSBudWxsO1xuICAgIGlmIChuZXh0SW5kZXggPj0gc3RlcHMubGVuZ3RoKSB7XG4gICAgICBjb21wbGV0ZVR1dG9yaWFsKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldFN0ZXAobmV4dEluZGV4KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZHZhbmNlU3RlcCgpOiB2b2lkIHtcbiAgICBhZHZhbmNlVG8oY3VycmVudEluZGV4ICsgMSk7XG4gIH1cblxuICBmdW5jdGlvbiBza2lwQ3VycmVudFN0ZXAoKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgY29uc3QgbmV4dEluZGV4ID0gY3VycmVudEluZGV4ID49IDAgPyBjdXJyZW50SW5kZXggKyAxIDogMDtcbiAgICBhZHZhbmNlVG8obmV4dEluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBsZXRlVHV0b3JpYWwoKTogdm9pZCB7XG4gICAgaWYgKCFydW5uaW5nKSByZXR1cm47XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gdHJ1ZTtcbiAgICBwZXJzaXN0UHJvZ3Jlc3Moc3RlcHMubGVuZ3RoLCB0cnVlKTtcbiAgICBidXMuZW1pdChcInR1dG9yaWFsOmNvbXBsZXRlZFwiLCB7IGlkIH0pO1xuICAgIHN0b3AoKTtcbiAgICBzdXBwcmVzc1BlcnNpc3RPblN0b3AgPSBmYWxzZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0KG9wdGlvbnM/OiBTdGFydE9wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCByZXN1bWUgPSBvcHRpb25zPy5yZXN1bWUgIT09IGZhbHNlO1xuICAgIGlmIChydW5uaW5nKSB7XG4gICAgICByZXN0YXJ0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChzdGVwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcnVubmluZyA9IHRydWU7XG4gICAgcGF1c2VkID0gZmFsc2U7XG4gICAgc3VwcHJlc3NQZXJzaXN0T25TdG9wID0gZmFsc2U7XG4gICAgbGFzdFNhdmVkQ29tcGxldGVkID0gZmFsc2U7XG4gICAgbGV0IHN0YXJ0SW5kZXggPSAwO1xuICAgIGlmIChyZXN1bWUpIHtcbiAgICAgIGNvbnN0IHByb2dyZXNzID0gbG9hZFByb2dyZXNzKGlkKTtcbiAgICAgIGlmIChwcm9ncmVzcyAmJiAhcHJvZ3Jlc3MuY29tcGxldGVkKSB7XG4gICAgICAgIHN0YXJ0SW5kZXggPSBjbGFtcEluZGV4KHByb2dyZXNzLnN0ZXBJbmRleCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNsZWFyUHJvZ3Jlc3MoaWQpO1xuICAgIH1cbiAgICBidXMuZW1pdChcInR1dG9yaWFsOnN0YXJ0ZWRcIiwgeyBpZCB9KTtcbiAgICBzZXRTdGVwKHN0YXJ0SW5kZXgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVzdGFydCgpOiB2b2lkIHtcbiAgICBzdG9wKCk7XG4gICAgc3RhcnQoeyByZXN1bWU6IGZhbHNlIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc3RvcCgpOiB2b2lkIHtcbiAgICBjb25zdCBzaG91bGRQZXJzaXN0ID0gIXN1cHByZXNzUGVyc2lzdE9uU3RvcCAmJiBydW5uaW5nICYmICFsYXN0U2F2ZWRDb21wbGV0ZWQgJiYgY3VycmVudEluZGV4ID49IDAgJiYgY3VycmVudEluZGV4IDwgc3RlcHMubGVuZ3RoO1xuICAgIGNvbnN0IGluZGV4VG9QZXJzaXN0ID0gY3VycmVudEluZGV4O1xuXG4gICAgaWYgKGNsZWFudXBDdXJyZW50KSB7XG4gICAgICBjbGVhbnVwQ3VycmVudCgpO1xuICAgICAgY2xlYW51cEN1cnJlbnQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAoY3VycmVudFN0ZXApIHtcbiAgICAgIGN1cnJlbnRTdGVwLm9uRXhpdD8uKCk7XG4gICAgICBjdXJyZW50U3RlcCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChzaG91bGRQZXJzaXN0KSB7XG4gICAgICBwZXJzaXN0UHJvZ3Jlc3MoaW5kZXhUb1BlcnNpc3QsIGZhbHNlKTtcbiAgICB9XG4gICAgcnVubmluZyA9IGZhbHNlO1xuICAgIHBhdXNlZCA9IGZhbHNlO1xuICAgIGN1cnJlbnRJbmRleCA9IC0xO1xuICAgIHJlbmRlckN1cnJlbnQgPSBudWxsO1xuICAgIGhpZ2hsaWdodGVyLmhpZGUoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzUnVubmluZygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gcnVubmluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgc3RvcCgpO1xuICAgIGZvciAoY29uc3QgZGlzcG9zZSBvZiBwZXJzaXN0ZW50TGlzdGVuZXJzKSB7XG4gICAgICBkaXNwb3NlKCk7XG4gICAgfVxuICAgIGhpZ2hsaWdodGVyLmRlc3Ryb3koKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBlcnNpc3RQcm9ncmVzcyhzdGVwSW5kZXg6IG51bWJlciwgY29tcGxldGVkOiBib29sZWFuKTogdm9pZCB7XG4gICAgbGFzdFNhdmVkQ29tcGxldGVkID0gY29tcGxldGVkO1xuICAgIHNhdmVQcm9ncmVzcyhpZCwge1xuICAgICAgc3RlcEluZGV4LFxuICAgICAgY29tcGxldGVkLFxuICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzdGFydCxcbiAgICByZXN0YXJ0LFxuICAgIHN0b3AsXG4gICAgaXNSdW5uaW5nLFxuICAgIGRlc3Ryb3ksXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBUdXRvcmlhbFN0ZXAgfSBmcm9tIFwiLi9lbmdpbmVcIjtcblxuZnVuY3Rpb24gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZDogdW5rbm93biwgbWluSW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBpbmRleCA9IChwYXlsb2FkIGFzIHsgaW5kZXg/OiB1bmtub3duIH0pLmluZGV4O1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSBcIm51bWJlclwiIHx8ICFOdW1iZXIuaXNGaW5pdGUoaW5kZXgpKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBpbmRleCA+PSBtaW5JbmRleDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFJvdXRlSWQocGF5bG9hZDogdW5rbm93bik6IHN0cmluZyB8IG51bGwge1xuICBpZiAodHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIgfHwgcGF5bG9hZCA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvdXRlSWQgPSAocGF5bG9hZCBhcyB7IHJvdXRlSWQ/OiB1bmtub3duIH0pLnJvdXRlSWQ7XG4gIHJldHVybiB0eXBlb2Ygcm91dGVJZCA9PT0gXCJzdHJpbmdcIiA/IHJvdXRlSWQgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXlsb2FkVG9vbEVxdWFscyh0YXJnZXQ6IHN0cmluZyk6IChwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuIHtcbiAgcmV0dXJuIChwYXlsb2FkOiB1bmtub3duKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiIHx8IHBheWxvYWQgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCB0b29sID0gKHBheWxvYWQgYXMgeyB0b29sPzogdW5rbm93biB9KS50b29sO1xuICAgIHJldHVybiB0eXBlb2YgdG9vbCA9PT0gXCJzdHJpbmdcIiAmJiB0b29sID09PSB0YXJnZXQ7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCYXNpY1R1dG9yaWFsU3RlcHMoKTogVHV0b3JpYWxTdGVwW10ge1xuICBsZXQgcm91dGVTd2l0Y2hlc1NpbmNlRW50ZXIgPSAwO1xuICBsZXQgaW5pdGlhbFJvdXRlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgbmV3Um91dGVJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgcmV0dXJuIFtcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLXBsb3Qtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgYSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJDbGljayBvbiB0aGUgbWFwIHRvIGRyb3AgYXQgbGVhc3QgdGhyZWUgd2F5cG9pbnRzIGFuZCBza2V0Y2ggeW91ciBjb3Vyc2UuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiBoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAyKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJzaGlwLWNoYW5nZS1zcGVlZFwiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBTcGVlZFNsaWRlclwiLFxuICAgICAgdGl0bGU6IFwiQWRqdXN0IHNoaXAgc3BlZWRcIixcbiAgICAgIGJvZHk6IFwiVXNlIHRoZSBTaGlwIFNwZWVkIHNsaWRlciAob3IgcHJlc3MgWyAvIF0pIHRvIGZpbmUtdHVuZSB5b3VyIHRyYXZlbCBzcGVlZC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOnNwZWVkQ2hhbmdlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtc2VsZWN0LWxlZ1wiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBTZWxlY3RcIixcbiAgICAgIHRpdGxlOiBcIlNlbGVjdCBhIHJvdXRlIGxlZ1wiLFxuICAgICAgYm9keTogXCJTd2l0Y2ggdG8gU2VsZWN0IG1vZGUgKFQga2V5KSBhbmQgdGhlbiBjbGljayBhIHdheXBvaW50IG9uIHRoZSBtYXAgdG8gaGlnaGxpZ2h0IGl0cyBsZWcuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpsZWdTZWxlY3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4gaGFzV2F5cG9pbnRJbmRleEF0TGVhc3QocGF5bG9hZCwgMCksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1tYXRjaC1tYXJrZXJcIixcbiAgICAgIHRhcmdldDogXCJzcGVlZE1hcmtlclwiLFxuICAgICAgdGl0bGU6IFwiTWF0Y2ggdGhlIG1hcmtlclwiLFxuICAgICAgYm9keTogXCJMaW5lIHVwIHRoZSBTaGlwIFNwZWVkIHNsaWRlciB3aXRoIHRoZSB0aWNrIHRvIGNydWlzZSBhdCB0aGUgbmV1dHJhbCBoZWF0IHNwZWVkLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6bWFya2VyQWxpZ25lZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LXB1c2gtaG90XCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiU3ByaW50IGludG8gdGhlIHJlZFwiLFxuICAgICAgYm9keTogXCJQdXNoIHRoZSB0aHJvdHRsZSBhYm92ZSB0aGUgbWFya2VyIGFuZCB3YXRjaCB0aGUgaGVhdCBiYXIgcmVhY2ggdGhlIHdhcm5pbmcgYmFuZC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0Ondhcm5FbnRlcmVkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtY29vbC1kb3duXCIsXG4gICAgICB0YXJnZXQ6IFwiaGVhdEJhclwiLFxuICAgICAgdGl0bGU6IFwiQ29vbCBpdCBiYWNrIGRvd25cIixcbiAgICAgIGJvZHk6IFwiRWFzZSBvZmYgYmVsb3cgdGhlIG1hcmtlciB1bnRpbCB0aGUgYmFyIGRyb3BzIG91dCBvZiB0aGUgd2FybmluZyB6b25lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6Y29vbGVkQmVsb3dXYXJuXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcImhlYXQtdHJpZ2dlci1zdGFsbFwiLFxuICAgICAgdGFyZ2V0OiBcImhlYXRCYXJcIixcbiAgICAgIHRpdGxlOiBcIlRyaWdnZXIgYSBzdGFsbFwiLFxuICAgICAgYm9keTogXCJQdXNoIHdlbGwgYWJvdmUgdGhlIGxpbWl0IGFuZCBob2xkIGl0IHVudGlsIHRoZSBvdmVyaGVhdCBzdGFsbCBvdmVybGF5IGFwcGVhcnMuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwiaGVhdDpzdGFsbFRyaWdnZXJlZFwiLFxuICAgICAgfSxcbiAgICAgIGFsbG93U2tpcDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJoZWF0LXJlY292ZXItc3RhbGxcIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJSZWNvdmVyIGZyb20gdGhlIHN0YWxsXCIsXG4gICAgICBib2R5OiBcIkhvbGQgc3RlYWR5IHdoaWxlIHN5c3RlbXMgY29vbC4gT25jZSB0aGUgb3ZlcmxheSBjbGVhcnMsIHlvdVx1MjAxOXJlIGJhY2sgb25saW5lLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcImhlYXQ6c3RhbGxSZWNvdmVyZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwiaGVhdC1kdWFsLWJhcnNcIixcbiAgICAgIHRhcmdldDogXCJoZWF0QmFyXCIsXG4gICAgICB0aXRsZTogXCJSZWFkIGJvdGggaGVhdCBiYXJzXCIsXG4gICAgICBib2R5OiBcIkFkanVzdCBhIHdheXBvaW50IHRvIG1ha2UgdGhlIHBsYW5uZWQgYmFyIGV4dGVuZCBwYXN0IGxpdmUgaGVhdC4gVXNlIGl0IHRvIHByZWRpY3QgZnV0dXJlIG92ZXJsb2Fkcy5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJoZWF0OmR1YWxNZXRlckRpdmVyZ2VkXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtZGVsZXRlLWxlZ1wiLFxuICAgICAgdGFyZ2V0OiBcInNoaXBEZWxldGVcIixcbiAgICAgIHRpdGxlOiBcIkRlbGV0ZSBhIHJvdXRlIGxlZ1wiLFxuICAgICAgYm9keTogXCJSZW1vdmUgdGhlIHNlbGVjdGVkIHdheXBvaW50IHVzaW5nIHRoZSBEZWxldGUgY29udHJvbCBvciB0aGUgRGVsZXRlIGtleS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJzaGlwOndheXBvaW50RGVsZXRlZFwiLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcInNoaXAtY2xlYXItcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJzaGlwQ2xlYXJcIixcbiAgICAgIHRpdGxlOiBcIkNsZWFyIHRoZSByb3V0ZVwiLFxuICAgICAgYm9keTogXCJDbGVhciByZW1haW5pbmcgd2F5cG9pbnRzIHRvIHJlc2V0IHlvdXIgcGxvdHRlZCBjb3Vyc2UuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwic2hpcDpjbGVhckludm9rZWRcIixcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLXNldC1tb2RlXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZVNldFwiLFxuICAgICAgdGl0bGU6IFwiU3dpdGNoIHRvIG1pc3NpbGUgcGxhbm5pbmdcIixcbiAgICAgIGJvZHk6IFwiVGFwIFNldCBzbyBldmVyeSBjbGljayBkcm9wcyBtaXNzaWxlIHdheXBvaW50cyBvbiB0aGUgYWN0aXZlIHJvdXRlLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6dG9vbENoYW5nZWRcIixcbiAgICAgICAgd2hlbjogcGF5bG9hZFRvb2xFcXVhbHMoXCJzZXRcIiksXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1wbG90LWluaXRpYWxcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgbWlzc2lsZSB3YXlwb2ludHNcIixcbiAgICAgIGJvZHk6IFwiQ2xpY2sgdGhlIG1hcCB0byBkcm9wIGF0IGxlYXN0IHR3byBndWlkYW5jZSBwb2ludHMgZm9yIHRoZSBjdXJyZW50IG1pc3NpbGUgcm91dGUuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTp3YXlwb2ludEFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgaWYgKCFoYXNXYXlwb2ludEluZGV4QXRMZWFzdChwYXlsb2FkLCAxKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAocm91dGVJZCkge1xuICAgICAgICAgICAgaW5pdGlhbFJvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1pbml0aWFsXCIsXG4gICAgICB0YXJnZXQ6IFwibWlzc2lsZUxhdW5jaFwiLFxuICAgICAgdGl0bGU6IFwiTGF1bmNoIHRoZSBzdHJpa2VcIixcbiAgICAgIGJvZHk6IFwiU2VuZCB0aGUgcGxhbm5lZCBtaXNzaWxlIHJvdXRlIGxpdmUgd2l0aCB0aGUgTGF1bmNoIGNvbnRyb2wgKEwga2V5KS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOmxhdW5jaFJlcXVlc3RlZFwiLFxuICAgICAgICB3aGVuOiAocGF5bG9hZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHJvdXRlSWQgPSBleHRyYWN0Um91dGVJZChwYXlsb2FkKTtcbiAgICAgICAgICBpZiAoIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQpIHtcbiAgICAgICAgICAgIGluaXRpYWxSb3V0ZUlkID0gcm91dGVJZDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcm91dGVJZCA9PT0gaW5pdGlhbFJvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1hZGQtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlQWRkUm91dGVcIixcbiAgICAgIHRpdGxlOiBcIkNyZWF0ZSBhIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIlByZXNzIE5ldyB0byBhZGQgYSBzZWNvbmQgbWlzc2lsZSByb3V0ZSBmb3IgYW5vdGhlciBzdHJpa2UgZ3JvdXAuXCIsXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTpyb3V0ZUFkZGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghcm91dGVJZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIG5ld1JvdXRlSWQgPSByb3V0ZUlkO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtcGxvdC1uZXctcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJjYW52YXNcIixcbiAgICAgIHRpdGxlOiBcIlBsb3QgdGhlIG5ldyBtaXNzaWxlIHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkRyb3AgYXQgbGVhc3QgdHdvIHdheXBvaW50cyBvbiB0aGUgbmV3IHJvdXRlIHRvIGRlZmluZSBpdHMgcGF0aC5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICBpZiAoIWhhc1dheXBvaW50SW5kZXhBdExlYXN0KHBheWxvYWQsIDEpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmIChuZXdSb3V0ZUlkICYmIHJvdXRlSWQgJiYgcm91dGVJZCAhPT0gbmV3Um91dGVJZCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIW5ld1JvdXRlSWQgJiYgcm91dGVJZCkge1xuICAgICAgICAgICAgbmV3Um91dGVJZCA9IHJvdXRlSWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiBcIm1pc3NpbGUtbGF1bmNoLW5ldy1yb3V0ZVwiLFxuICAgICAgdGFyZ2V0OiBcIm1pc3NpbGVMYXVuY2hcIixcbiAgICAgIHRpdGxlOiBcIkxhdW5jaCB0aGUgbmV3IHJvdXRlXCIsXG4gICAgICBib2R5OiBcIkxhdW5jaCB0aGUgZnJlc2ggbWlzc2lsZSByb3V0ZSB0byBjb25maXJtIGl0cyBwYXR0ZXJuLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghbmV3Um91dGVJZCB8fCAhcm91dGVJZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgcmV0dXJuIHJvdXRlSWQgPT09IG5ld1JvdXRlSWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwibWlzc2lsZS1zd2l0Y2gtcm91dGVcIixcbiAgICAgIHRhcmdldDogXCJyb3V0ZU5leHRcIixcbiAgICAgIHRpdGxlOiBcIlN3aXRjaCBiYWNrIHRvIHRoZSBvcmlnaW5hbCByb3V0ZVwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIFx1MjVDMCBcdTI1QjYgY29udHJvbHMgKG9yIFRhYi9TaGlmdCtUYWIpIHRvIHNlbGVjdCB5b3VyIGZpcnN0IG1pc3NpbGUgcm91dGUgYWdhaW4uXCIsXG4gICAgICBvbkVudGVyOiAoKSA9PiB7XG4gICAgICAgIHJvdXRlU3dpdGNoZXNTaW5jZUVudGVyID0gMDtcbiAgICAgIH0sXG4gICAgICBhZHZhbmNlOiB7XG4gICAgICAgIGtpbmQ6IFwiZXZlbnRcIixcbiAgICAgICAgZXZlbnQ6IFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIixcbiAgICAgICAgd2hlbjogKHBheWxvYWQpID0+IHtcbiAgICAgICAgICByb3V0ZVN3aXRjaGVzU2luY2VFbnRlciArPSAxO1xuICAgICAgICAgIGlmIChyb3V0ZVN3aXRjaGVzU2luY2VFbnRlciA8IDEpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICBjb25zdCByb3V0ZUlkID0gZXh0cmFjdFJvdXRlSWQocGF5bG9hZCk7XG4gICAgICAgICAgaWYgKCFpbml0aWFsUm91dGVJZCB8fCAhcm91dGVJZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJtaXNzaWxlLWxhdW5jaC1hZnRlci1zd2l0Y2hcIixcbiAgICAgIHRhcmdldDogXCJtaXNzaWxlTGF1bmNoXCIsXG4gICAgICB0aXRsZTogXCJMYXVuY2ggZnJvbSB0aGUgb3RoZXIgcm91dGVcIixcbiAgICAgIGJvZHk6IFwiRmlyZSB0aGUgb3JpZ2luYWwgbWlzc2lsZSByb3V0ZSB0byBwcmFjdGljZSByb3VuZC1yb2JpbiBzdHJpa2VzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcImV2ZW50XCIsXG4gICAgICAgIGV2ZW50OiBcIm1pc3NpbGU6bGF1bmNoUmVxdWVzdGVkXCIsXG4gICAgICAgIHdoZW46IChwYXlsb2FkKSA9PiB7XG4gICAgICAgICAgY29uc3Qgcm91dGVJZCA9IGV4dHJhY3RSb3V0ZUlkKHBheWxvYWQpO1xuICAgICAgICAgIGlmICghaW5pdGlhbFJvdXRlSWQgfHwgIXJvdXRlSWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgIHJldHVybiByb3V0ZUlkID09PSBpbml0aWFsUm91dGVJZDtcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogXCJ0dXRvcmlhbC1wcmFjdGljZVwiLFxuICAgICAgdGFyZ2V0OiBcInNwYXduQm90XCIsXG4gICAgICB0aXRsZTogXCJTcGF3biBhIHByYWN0aWNlIGJvdFwiLFxuICAgICAgYm9keTogXCJVc2UgdGhlIEJvdCBjb250cm9sIHRvIGFkZCBhIHRhcmdldCBhbmQgcmVoZWFyc2UgdGhlc2UgbWFuZXV2ZXJzIGluIHJlYWwgdGltZS5cIixcbiAgICAgIGFkdmFuY2U6IHtcbiAgICAgICAga2luZDogXCJldmVudFwiLFxuICAgICAgICBldmVudDogXCJib3Q6c3Bhd25SZXF1ZXN0ZWRcIixcbiAgICAgIH0sXG4gICAgICBhbGxvd1NraXA6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6IFwidHV0b3JpYWwtY29tcGxldGVcIixcbiAgICAgIHRhcmdldDogbnVsbCxcbiAgICAgIHRpdGxlOiBcIllvdVx1MjAxOXJlIHJlYWR5XCIsXG4gICAgICBib2R5OiBcIkdyZWF0IHdvcmsuIFJlbG9hZCB0aGUgY29uc29sZSBvciByZWpvaW4gYSByb29tIHRvIHJldmlzaXQgdGhlc2UgZHJpbGxzLlwiLFxuICAgICAgYWR2YW5jZToge1xuICAgICAgICBraW5kOiBcIm1hbnVhbFwiLFxuICAgICAgICBuZXh0TGFiZWw6IFwiRmluaXNoXCIsXG4gICAgICB9LFxuICAgICAgYWxsb3dTa2lwOiBmYWxzZSxcbiAgICB9LFxuICBdO1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi4vYnVzXCI7XG5pbXBvcnQgeyBjcmVhdGVUdXRvcmlhbEVuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgY3JlYXRlUm9sZXMgfSBmcm9tIFwiLi9yb2xlc1wiO1xuaW1wb3J0IHsgZ2V0QmFzaWNUdXRvcmlhbFN0ZXBzIH0gZnJvbSBcIi4vc3RlcHNfYmFzaWNcIjtcbmV4cG9ydCBjb25zdCBCQVNJQ19UVVRPUklBTF9JRCA9IFwic2hpcC1iYXNpY3NcIjtcblxuZXhwb3J0IGludGVyZmFjZSBUdXRvcmlhbENvbnRyb2xsZXIge1xuICBzdGFydChvcHRpb25zPzogeyByZXN1bWU/OiBib29sZWFuIH0pOiB2b2lkO1xuICByZXN0YXJ0KCk6IHZvaWQ7XG4gIGRlc3Ryb3koKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50VHV0b3JpYWwoYnVzOiBFdmVudEJ1cyk6IFR1dG9yaWFsQ29udHJvbGxlciB7XG4gIGNvbnN0IHJvbGVzID0gY3JlYXRlUm9sZXMoKTtcbiAgY29uc3QgZW5naW5lID0gY3JlYXRlVHV0b3JpYWxFbmdpbmUoe1xuICAgIGlkOiBCQVNJQ19UVVRPUklBTF9JRCxcbiAgICBidXMsXG4gICAgcm9sZXMsXG4gICAgc3RlcHM6IGdldEJhc2ljVHV0b3JpYWxTdGVwcygpLFxuICB9KTtcblxuICByZXR1cm4ge1xuICAgIHN0YXJ0KG9wdGlvbnMpIHtcbiAgICAgIGVuZ2luZS5zdGFydChvcHRpb25zKTtcbiAgICB9LFxuICAgIHJlc3RhcnQoKSB7XG4gICAgICBlbmdpbmUucmVzdGFydCgpO1xuICAgIH0sXG4gICAgZGVzdHJveSgpIHtcbiAgICAgIGVuZ2luZS5kZXN0cm95KCk7XG4gICAgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBjbGFtcCB9IGZyb20gXCIuLi9zdGF0ZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlQ2hvaWNlIHtcbiAgaWQ6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlQ29udGVudCB7XG4gIHNwZWFrZXI6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBpbnRlbnQ/OiBcImZhY3RvcnlcIiB8IFwidW5pdFwiO1xuICBjaG9pY2VzPzogRGlhbG9ndWVDaG9pY2VbXTtcbiAgdHlwaW5nU3BlZWRNcz86IG51bWJlcjtcbiAgb25DaG9pY2U/OiAoY2hvaWNlSWQ6IHN0cmluZykgPT4gdm9pZDtcbiAgb25UZXh0RnVsbHlSZW5kZXJlZD86ICgpID0+IHZvaWQ7XG4gIG9uQ29udGludWU/OiAoKSA9PiB2b2lkO1xuICBjb250aW51ZUxhYmVsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpYWxvZ3VlT3ZlcmxheSB7XG4gIHNob3coY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZDtcbiAgaGlkZSgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIGlzVmlzaWJsZSgpOiBib29sZWFuO1xufVxuXG5jb25zdCBTVFlMRV9JRCA9IFwiZGlhbG9ndWUtb3ZlcmxheS1zdHlsZVwiO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRGlhbG9ndWVPdmVybGF5KCk6IERpYWxvZ3VlT3ZlcmxheSB7XG4gIGVuc3VyZVN0eWxlcygpO1xuXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtb3ZlcmxheVwiO1xuICBvdmVybGF5LnNldEF0dHJpYnV0ZShcImFyaWEtbGl2ZVwiLCBcInBvbGl0ZVwiKTtcblxuICBjb25zdCBjb25zb2xlRnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBjb25zb2xlRnJhbWUuY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jb25zb2xlXCI7XG5cbiAgY29uc3Qgc3BlYWtlckxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc3BlYWtlckxhYmVsLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtc3BlYWtlclwiO1xuXG4gIGNvbnN0IHRleHRCbG9jayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRleHRCbG9jay5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLXRleHRcIjtcblxuICBjb25zdCBjdXJzb3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgY3Vyc29yLmNsYXNzTmFtZSA9IFwiZGlhbG9ndWUtY3Vyc29yXCI7XG4gIGN1cnNvci50ZXh0Q29udGVudCA9IFwiX1wiO1xuXG4gIGNvbnN0IGNob2ljZXNMaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInVsXCIpO1xuICBjaG9pY2VzTGlzdC5jbGFzc05hbWUgPSBcImRpYWxvZ3VlLWNob2ljZXMgaGlkZGVuXCI7XG5cbiAgY29uc3QgY29udGludWVCdXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBjb250aW51ZUJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgY29udGludWVCdXR0b24uY2xhc3NOYW1lID0gXCJkaWFsb2d1ZS1jb250aW51ZSBoaWRkZW5cIjtcbiAgY29udGludWVCdXR0b24udGV4dENvbnRlbnQgPSBcIkNvbnRpbnVlXCI7XG5cbiAgdGV4dEJsb2NrLmFwcGVuZChjdXJzb3IpO1xuICBjb25zb2xlRnJhbWUuYXBwZW5kKHNwZWFrZXJMYWJlbCwgdGV4dEJsb2NrLCBjaG9pY2VzTGlzdCwgY29udGludWVCdXR0b24pO1xuICBvdmVybGF5LmFwcGVuZChjb25zb2xlRnJhbWUpO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG4gIGxldCB2aXNpYmxlID0gZmFsc2U7XG4gIGxldCB0eXBpbmdIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBsZXQgdGFyZ2V0VGV4dCA9IFwiXCI7XG4gIGxldCByZW5kZXJlZENoYXJzID0gMDtcbiAgbGV0IGFjdGl2ZUNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGNsZWFyVHlwaW5nKCk6IHZvaWQge1xuICAgIGlmICh0eXBpbmdIYW5kbGUgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodHlwaW5nSGFuZGxlKTtcbiAgICAgIHR5cGluZ0hhbmRsZSA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZmluaXNoVHlwaW5nKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIHJlbmRlcmVkQ2hhcnMgPSB0YXJnZXRUZXh0Lmxlbmd0aDtcbiAgICB1cGRhdGVUZXh0KCk7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICBjb250ZW50Lm9uVGV4dEZ1bGx5UmVuZGVyZWQ/LigpO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShjb250ZW50LmNob2ljZXMpIHx8IGNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVUZXh0KCk6IHZvaWQge1xuICAgIGNvbnN0IHRleHRUb1Nob3cgPSB0YXJnZXRUZXh0LnNsaWNlKDAsIHJlbmRlcmVkQ2hhcnMpO1xuICAgIHRleHRCbG9jay5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNvbnN0IHRleHROb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgdGV4dE5vZGUudGV4dENvbnRlbnQgPSB0ZXh0VG9TaG93O1xuICAgIHRleHRCbG9jay5hcHBlbmQodGV4dE5vZGUsIGN1cnNvcik7XG4gICAgY3Vyc29yLmNsYXNzTGlzdC50b2dnbGUoXCJoaWRkZW5cIiwgIXZpc2libGUpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyQ2hvaWNlcyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBjaG9pY2VzTGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuICAgIGNvbnN0IGNob2ljZXMgPSBBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgPyBjb250ZW50LmNob2ljZXMgOiBbXTtcbiAgICBpZiAoY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNob2ljZXNMaXN0LmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gICAgY2hvaWNlcy5mb3JFYWNoKChjaG9pY2UsIGluZGV4KSA9PiB7XG4gICAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgICAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICAgIGJ1dHRvbi5kYXRhc2V0LmNob2ljZUlkID0gY2hvaWNlLmlkO1xuICAgICAgYnV0dG9uLnRleHRDb250ZW50ID0gYCR7aW5kZXggKyAxfS4gJHtjaG9pY2UudGV4dH1gO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICAgIGNvbnRlbnQub25DaG9pY2U/LihjaG9pY2UuaWQpO1xuICAgICAgfSk7XG4gICAgICBpdGVtLmFwcGVuZChidXR0b24pO1xuICAgICAgY2hvaWNlc0xpc3QuYXBwZW5kKGl0ZW0pO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc2hvd0NvbnRpbnVlKGNvbnRlbnQ6IERpYWxvZ3VlQ29udGVudCk6IHZvaWQge1xuICAgIGlmICghY29udGVudC5vbkNvbnRpbnVlKSB7XG4gICAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgICAgY29udGludWVCdXR0b24ub25jbGljayA9IG51bGw7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnRpbnVlQnV0dG9uLnRleHRDb250ZW50ID0gY29udGVudC5jb250aW51ZUxhYmVsID8/IFwiQ29udGludWVcIjtcbiAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSAoKSA9PiB7XG4gICAgICBjb250ZW50Lm9uQ29udGludWU/LigpO1xuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBzY2hlZHVsZVR5cGUoY29udGVudDogRGlhbG9ndWVDb250ZW50KTogdm9pZCB7XG4gICAgY2xlYXJUeXBpbmcoKTtcbiAgICBjb25zdCB0eXBpbmdTcGVlZCA9IGNsYW1wKE51bWJlcihjb250ZW50LnR5cGluZ1NwZWVkTXMpIHx8IDE4LCA4LCA2NCk7XG4gICAgY29uc3QgdGljayA9ICgpOiB2b2lkID0+IHtcbiAgICAgIHJlbmRlcmVkQ2hhcnMgPSBNYXRoLm1pbihyZW5kZXJlZENoYXJzICsgMSwgdGFyZ2V0VGV4dC5sZW5ndGgpO1xuICAgICAgdXBkYXRlVGV4dCgpO1xuICAgICAgaWYgKHJlbmRlcmVkQ2hhcnMgPj0gdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgICAgY2xlYXJUeXBpbmcoKTtcbiAgICAgICAgY29udGVudC5vblRleHRGdWxseVJlbmRlcmVkPy4oKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQuY2hvaWNlcykgfHwgY29udGVudC5jaG9pY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHlwaW5nSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQodGljaywgdHlwaW5nU3BlZWQpO1xuICAgICAgfVxuICAgIH07XG4gICAgdHlwaW5nSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQodGljaywgdHlwaW5nU3BlZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFuZGxlS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICAgIGlmICghdmlzaWJsZSB8fCAhYWN0aXZlQ29udGVudCkgcmV0dXJuO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShhY3RpdmVDb250ZW50LmNob2ljZXMpIHx8IGFjdGl2ZUNvbnRlbnQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGlmIChldmVudC5rZXkgPT09IFwiIFwiIHx8IGV2ZW50LmtleSA9PT0gXCJFbnRlclwiKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGlmIChyZW5kZXJlZENoYXJzIDwgdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgICAgICBmaW5pc2hUeXBpbmcoYWN0aXZlQ29udGVudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYWN0aXZlQ29udGVudC5vbkNvbnRpbnVlPy4oKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBpbmRleCA9IHBhcnNlSW50KGV2ZW50LmtleSwgMTApO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoaW5kZXgpICYmIGluZGV4ID49IDEgJiYgaW5kZXggPD0gYWN0aXZlQ29udGVudC5jaG9pY2VzLmxlbmd0aCkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IGNob2ljZSA9IGFjdGl2ZUNvbnRlbnQuY2hvaWNlc1tpbmRleCAtIDFdO1xuICAgICAgYWN0aXZlQ29udGVudC5vbkNob2ljZT8uKGNob2ljZS5pZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRW50ZXJcIiAmJiByZW5kZXJlZENoYXJzIDwgdGFyZ2V0VGV4dC5sZW5ndGgpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBmaW5pc2hUeXBpbmcoYWN0aXZlQ29udGVudCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc2hvdyhjb250ZW50OiBEaWFsb2d1ZUNvbnRlbnQpOiB2b2lkIHtcbiAgICBhY3RpdmVDb250ZW50ID0gY29udGVudDtcbiAgICB2aXNpYmxlID0gdHJ1ZTtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJ2aXNpYmxlXCIpO1xuICAgIG92ZXJsYXkuZGF0YXNldC5pbnRlbnQgPSBjb250ZW50LmludGVudCA/PyBcImZhY3RvcnlcIjtcbiAgICBzcGVha2VyTGFiZWwudGV4dENvbnRlbnQgPSBjb250ZW50LnNwZWFrZXI7XG5cbiAgICB0YXJnZXRUZXh0ID0gY29udGVudC50ZXh0O1xuICAgIHJlbmRlcmVkQ2hhcnMgPSAwO1xuICAgIHVwZGF0ZVRleHQoKTtcbiAgICByZW5kZXJDaG9pY2VzKGNvbnRlbnQpO1xuICAgIHNob3dDb250aW51ZShjb250ZW50KTtcbiAgICBzY2hlZHVsZVR5cGUoY29udGVudCk7XG4gIH1cblxuICBmdW5jdGlvbiBoaWRlKCk6IHZvaWQge1xuICAgIHZpc2libGUgPSBmYWxzZTtcbiAgICBhY3RpdmVDb250ZW50ID0gbnVsbDtcbiAgICBvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJ2aXNpYmxlXCIpO1xuICAgIGNsZWFyVHlwaW5nKCk7XG4gICAgdGFyZ2V0VGV4dCA9IFwiXCI7XG4gICAgcmVuZGVyZWRDaGFycyA9IDA7XG4gICAgdGV4dEJsb2NrLmlubmVySFRNTCA9IFwiXCI7XG4gICAgdGV4dEJsb2NrLmFwcGVuZChjdXJzb3IpO1xuICAgIGNob2ljZXNMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgY2hvaWNlc0xpc3QuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICBjb250aW51ZUJ1dHRvbi5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIGNvbnRpbnVlQnV0dG9uLm9uY2xpY2sgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVzdHJveSgpOiB2b2lkIHtcbiAgICBoaWRlKCk7XG4gICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlS2V5RG93bik7XG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfVxuXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleURvd24pO1xuXG4gIHJldHVybiB7XG4gICAgc2hvdyxcbiAgICBoaWRlLFxuICAgIGRlc3Ryb3ksXG4gICAgaXNWaXNpYmxlKCkge1xuICAgICAgcmV0dXJuIHZpc2libGU7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlU3R5bGVzKCk6IHZvaWQge1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoU1RZTEVfSUQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICBzdHlsZS5pZCA9IFNUWUxFX0lEO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAuZGlhbG9ndWUtb3ZlcmxheSB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICBpbnNldDogMDtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICAgIHotaW5kZXg6IDYwO1xuICAgICAgb3BhY2l0eTogMDtcbiAgICAgIHRyYW5zaXRpb246IG9wYWNpdHkgMC4ycyBlYXNlO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtb3ZlcmxheS52aXNpYmxlIHtcbiAgICAgIG9wYWNpdHk6IDE7XG4gICAgICBwb2ludGVyLWV2ZW50czogYXV0bztcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnNvbGUge1xuICAgICAgbWluLXdpZHRoOiAzMjBweDtcbiAgICAgIG1heC13aWR0aDogbWluKDUyMHB4LCBjYWxjKDEwMHZ3IC0gNDhweCkpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSg2LCAxMSwgMTYsIDAuOTIpO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjM1KTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDEycHg7XG4gICAgICBwYWRkaW5nOiAxOHB4IDIwcHg7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGdhcDogMTRweDtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMiwgNiwgMTYsIDAuNik7XG4gICAgICBjb2xvcjogI2UyZThmMDtcbiAgICAgIGZvbnQtZmFtaWx5OiBcIklCTSBQbGV4IE1vbm9cIiwgXCJKZXRCcmFpbnMgTW9ub1wiLCB1aS1tb25vc3BhY2UsIFNGTW9uby1SZWd1bGFyLCBNZW5sbywgTW9uYWNvLCBDb25zb2xhcywgXCJMaWJlcmF0aW9uIE1vbm9cIiwgXCJDb3VyaWVyIE5ld1wiLCBtb25vc3BhY2U7XG4gICAgfVxuICAgIC5kaWFsb2d1ZS1vdmVybGF5W2RhdGEtaW50ZW50PVwiZmFjdG9yeVwiXSAuZGlhbG9ndWUtY29uc29sZSB7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjQ1KTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMTMsIDE0OCwgMTM2LCAwLjM1KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLW92ZXJsYXlbZGF0YS1pbnRlbnQ9XCJ1bml0XCJdIC5kaWFsb2d1ZS1jb25zb2xlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyNDQsIDExNCwgMTgyLCAwLjQ1KTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMjhweCA2NHB4IHJnYmEoMjM2LCA3MiwgMTUzLCAwLjI4KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLXNwZWFrZXIge1xuICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMTZlbTtcbiAgICAgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG4gICAgICBjb2xvcjogcmdiYSgxNDgsIDE2MywgMTg0LCAwLjc1KTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLXRleHQge1xuICAgICAgbWluLWhlaWdodDogOTBweDtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGxpbmUtaGVpZ2h0OiAxLjU1O1xuICAgICAgd2hpdGUtc3BhY2U6IHByZS13cmFwO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY3Vyc29yIHtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbiAgICAgIG1hcmdpbi1sZWZ0OiA0cHg7XG4gICAgICBhbmltYXRpb246IGRpYWxvZ3VlLWN1cnNvci1ibGluayAxLjJzIHN0ZXBzKDIsIHN0YXJ0KSBpbmZpbml0ZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWN1cnNvci5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMge1xuICAgICAgbGlzdC1zdHlsZTogbm9uZTtcbiAgICAgIG1hcmdpbjogMDtcbiAgICAgIHBhZGRpbmc6IDA7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGdhcDogOHB4O1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcy5oaWRkZW4ge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZSB7XG4gICAgICBmb250OiBpbmhlcml0O1xuICAgICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICAgIHBhZGRpbmc6IDhweCAxMHB4O1xuICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgxNDgsIDE2MywgMTg0LCAwLjMpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgyNCwgMzYsIDQ4LCAwLjg1KTtcbiAgICAgIGNvbG9yOiBpbmhlcml0O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAwLjE4cyBlYXNlLCBib3JkZXItY29sb3IgMC4xOHMgZWFzZTtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlIHtcbiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICB9XG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlLmhpZGRlbiB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAuZGlhbG9ndWUtY2hvaWNlcyBidXR0b246aG92ZXIsXG4gICAgLmRpYWxvZ3VlLWNob2ljZXMgYnV0dG9uOmZvY3VzLXZpc2libGUsXG4gICAgLmRpYWxvZ3VlLWNvbnRpbnVlOmhvdmVyLFxuICAgIC5kaWFsb2d1ZS1jb250aW51ZTpmb2N1cy12aXNpYmxlIHtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSg1NiwgMTg5LCAyNDgsIDAuNTUpO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgzMCwgNDUsIDYwLCAwLjk1KTtcbiAgICAgIG91dGxpbmU6IG5vbmU7XG4gICAgfVxuICAgIEBrZXlmcmFtZXMgZGlhbG9ndWUtY3Vyc29yLWJsaW5rIHtcbiAgICAgIDAlLCA1MCUgeyBvcGFjaXR5OiAxOyB9XG4gICAgICA1MC4wMSUsIDEwMCUgeyBvcGFjaXR5OiAwOyB9XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cblxuIiwgImNvbnN0IFNUT1JBR0VfUFJFRklYID0gXCJsc2Q6c3Rvcnk6XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlGbGFncyB7XG4gIFtrZXk6IHN0cmluZ106IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlQcm9ncmVzcyB7XG4gIGNoYXB0ZXJJZDogc3RyaW5nO1xuICBub2RlSWQ6IHN0cmluZztcbiAgZmxhZ3M6IFN0b3J5RmxhZ3M7XG4gIHZpc2l0ZWQ/OiBzdHJpbmdbXTtcbiAgdXBkYXRlZEF0OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGdldFN0b3JhZ2UoKTogU3RvcmFnZSB8IG51bGwge1xuICB0cnkge1xuICAgIGlmICh0eXBlb2Ygd2luZG93ID09PSBcInVuZGVmaW5lZFwiIHx8ICF3aW5kb3cubG9jYWxTdG9yYWdlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlO1xufVxuXG5mdW5jdGlvbiBzdG9yYWdlS2V5KGNoYXB0ZXJJZDogc3RyaW5nLCByb29tSWQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuICBjb25zdCByb29tU2VnbWVudCA9IHJvb21JZCA/IGAke3Jvb21JZH06YCA6IFwiXCI7XG4gIHJldHVybiBgJHtTVE9SQUdFX1BSRUZJWH0ke3Jvb21TZWdtZW50fSR7Y2hhcHRlcklkfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkU3RvcnlQcm9ncmVzcyhjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogU3RvcnlQcm9ncmVzcyB8IG51bGwge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0U3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IHN0b3JhZ2UuZ2V0SXRlbShzdG9yYWdlS2V5KGNoYXB0ZXJJZCwgcm9vbUlkKSk7XG4gICAgaWYgKCFyYXcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBTdG9yeVByb2dyZXNzO1xuICAgIGlmIChcbiAgICAgIHR5cGVvZiBwYXJzZWQgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkID09PSBudWxsIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmNoYXB0ZXJJZCAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdHlwZW9mIHBhcnNlZC5ub2RlSWQgIT09IFwic3RyaW5nXCIgfHxcbiAgICAgIHR5cGVvZiBwYXJzZWQudXBkYXRlZEF0ICE9PSBcIm51bWJlclwiIHx8XG4gICAgICB0eXBlb2YgcGFyc2VkLmZsYWdzICE9PSBcIm9iamVjdFwiIHx8IHBhcnNlZC5mbGFncyA9PT0gbnVsbFxuICAgICkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBjaGFwdGVySWQ6IHBhcnNlZC5jaGFwdGVySWQsXG4gICAgICBub2RlSWQ6IHBhcnNlZC5ub2RlSWQsXG4gICAgICBmbGFnczogeyAuLi5wYXJzZWQuZmxhZ3MgfSxcbiAgICAgIHZpc2l0ZWQ6IEFycmF5LmlzQXJyYXkocGFyc2VkLnZpc2l0ZWQpID8gWy4uLnBhcnNlZC52aXNpdGVkXSA6IHVuZGVmaW5lZCxcbiAgICAgIHVwZGF0ZWRBdDogcGFyc2VkLnVwZGF0ZWRBdCxcbiAgICB9O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVN0b3J5UHJvZ3Jlc3MoY2hhcHRlcklkOiBzdHJpbmcsIHJvb21JZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgcHJvZ3Jlc3M6IFN0b3J5UHJvZ3Jlc3MpOiB2b2lkIHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldFN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgc3RvcmFnZS5zZXRJdGVtKHN0b3JhZ2VLZXkoY2hhcHRlcklkLCByb29tSWQpLCBKU09OLnN0cmluZ2lmeShwcm9ncmVzcykpO1xuICB9IGNhdGNoIHtcbiAgICAvLyBpZ25vcmUgcGVyc2lzdGVuY2UgZXJyb3JzXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyU3RvcnlQcm9ncmVzcyhjaGFwdGVySWQ6IHN0cmluZywgcm9vbUlkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIHN0b3JhZ2UucmVtb3ZlSXRlbShzdG9yYWdlS2V5KGNoYXB0ZXJJZCwgcm9vbUlkKSk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIGlnbm9yZSBwZXJzaXN0ZW5jZSBlcnJvcnNcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlRmxhZyhjdXJyZW50OiBTdG9yeUZsYWdzLCBmbGFnOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogU3RvcnlGbGFncyB7XG4gIGNvbnN0IG5leHQgPSB7IC4uLmN1cnJlbnQgfTtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIGRlbGV0ZSBuZXh0W2ZsYWddO1xuICB9IGVsc2Uge1xuICAgIG5leHRbZmxhZ10gPSB0cnVlO1xuICB9XG4gIHJldHVybiBuZXh0O1xufVxuIiwgImltcG9ydCB0eXBlIHsgUFJORyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjbGFzcyBBdWRpb0VuZ2luZSB7XG4gIHByaXZhdGUgc3RhdGljIF9pbnN0OiBBdWRpb0VuZ2luZSB8IG51bGwgPSBudWxsO1xuXG4gIHB1YmxpYyByZWFkb25seSBjdHg6IEF1ZGlvQ29udGV4dDtcbiAgcHJpdmF0ZSByZWFkb25seSBtYXN0ZXI6IEdhaW5Ob2RlO1xuICBwcml2YXRlIHJlYWRvbmx5IG11c2ljQnVzOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSByZWFkb25seSBzZnhCdXM6IEdhaW5Ob2RlO1xuXG4gIHByaXZhdGUgX3RhcmdldE1hc3RlciA9IDAuOTtcbiAgcHJpdmF0ZSBfdGFyZ2V0TXVzaWMgPSAwLjk7XG4gIHByaXZhdGUgX3RhcmdldFNmeCA9IDAuOTtcblxuICBzdGF0aWMgZ2V0KCk6IEF1ZGlvRW5naW5lIHtcbiAgICBpZiAoIXRoaXMuX2luc3QpIHRoaXMuX2luc3QgPSBuZXcgQXVkaW9FbmdpbmUoKTtcbiAgICByZXR1cm4gdGhpcy5faW5zdDtcbiAgfVxuXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5jdHggPSBuZXcgQXVkaW9Db250ZXh0KCk7XG4gICAgKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFggPSAodGhpcyBhcyBhbnkpLmN0eDtcblxuICAgIHRoaXMubWFzdGVyID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldE1hc3RlciB9KTtcbiAgICB0aGlzLm11c2ljQnVzID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldE11c2ljIH0pO1xuICAgIHRoaXMuc2Z4QnVzID0gbmV3IEdhaW5Ob2RlKHRoaXMuY3R4LCB7IGdhaW46IHRoaXMuX3RhcmdldFNmeCB9KTtcblxuICAgIHRoaXMubXVzaWNCdXMuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5zZnhCdXMuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5tYXN0ZXIuY29ubmVjdCh0aGlzLmN0eC5kZXN0aW5hdGlvbik7XG4gIH1cblxuICBnZXQgbm93KCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuY3R4LmN1cnJlbnRUaW1lO1xuICB9XG5cbiAgZ2V0TXVzaWNCdXMoKTogR2Fpbk5vZGUge1xuICAgIHJldHVybiB0aGlzLm11c2ljQnVzO1xuICB9XG5cbiAgZ2V0U2Z4QnVzKCk6IEdhaW5Ob2RlIHtcbiAgICByZXR1cm4gdGhpcy5zZnhCdXM7XG4gIH1cblxuICBhc3luYyByZXN1bWUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuY3R4LnN0YXRlID09PSBcInN1c3BlbmRlZFwiKSB7XG4gICAgICBhd2FpdCB0aGlzLmN0eC5yZXN1bWUoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzdXNwZW5kKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmN0eC5zdGF0ZSA9PT0gXCJydW5uaW5nXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuY3R4LnN1c3BlbmQoKTtcbiAgICB9XG4gIH1cblxuICBzZXRNYXN0ZXJHYWluKHY6IG51bWJlciwgdCA9IHRoaXMubm93LCByYW1wID0gMC4wMyk6IHZvaWQge1xuICAgIHRoaXMuX3RhcmdldE1hc3RlciA9IHY7XG4gICAgdGhpcy5tYXN0ZXIuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tYXN0ZXIuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh2LCB0ICsgcmFtcCk7XG4gIH1cblxuICBzZXRNdXNpY0dhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0TXVzaWMgPSB2O1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModCk7XG4gICAgdGhpcy5tdXNpY0J1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIHNldFNmeEdhaW4odjogbnVtYmVyLCB0ID0gdGhpcy5ub3csIHJhbXAgPSAwLjAzKTogdm9pZCB7XG4gICAgdGhpcy5fdGFyZ2V0U2Z4ID0gdjtcbiAgICB0aGlzLnNmeEJ1cy5nYWluLmNhbmNlbFNjaGVkdWxlZFZhbHVlcyh0KTtcbiAgICB0aGlzLnNmeEJ1cy5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHYsIHQgKyByYW1wKTtcbiAgfVxuXG4gIGR1Y2tNdXNpYyhsZXZlbCA9IDAuNCwgYXR0YWNrID0gMC4wNSk6IHZvaWQge1xuICAgIGNvbnN0IHQgPSB0aGlzLm5vdztcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShsZXZlbCwgdCArIGF0dGFjayk7XG4gIH1cblxuICB1bmR1Y2tNdXNpYyhyZWxlYXNlID0gMC4yNSk6IHZvaWQge1xuICAgIGNvbnN0IHQgPSB0aGlzLm5vdztcbiAgICB0aGlzLm11c2ljQnVzLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgIHRoaXMubXVzaWNCdXMuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSh0aGlzLl90YXJnZXRNdXNpYywgdCArIHJlbGVhc2UpO1xuICB9XG59XG5cbi8vIFRpbnkgc2VlZGFibGUgUFJORyAoTXVsYmVycnkzMilcbmV4cG9ydCBmdW5jdGlvbiBtYWtlUFJORyhzZWVkOiBudW1iZXIpOiBQUk5HIHtcbiAgbGV0IHMgPSAoc2VlZCA+Pj4gMCkgfHwgMTtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICBzICs9IDB4NkQyQjc5RjU7XG4gICAgbGV0IHQgPSBNYXRoLmltdWwocyBeIChzID4+PiAxNSksIDEgfCBzKTtcbiAgICB0IF49IHQgKyBNYXRoLmltdWwodCBeICh0ID4+PiA3KSwgNjEgfCB0KTtcbiAgICByZXR1cm4gKCh0IF4gKHQgPj4+IDE0KSkgPj4+IDApIC8gNDI5NDk2NzI5NjtcbiAgfTtcbn1cbiIsICIvLyBMb3ctbGV2ZWwgZ3JhcGggYnVpbGRlcnMgLyBoZWxwZXJzXG5cbmV4cG9ydCBmdW5jdGlvbiBvc2MoY3R4OiBBdWRpb0NvbnRleHQsIHR5cGU6IE9zY2lsbGF0b3JUeXBlLCBmcmVxOiBudW1iZXIpIHtcbiAgcmV0dXJuIG5ldyBPc2NpbGxhdG9yTm9kZShjdHgsIHsgdHlwZSwgZnJlcXVlbmN5OiBmcmVxIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9pc2UoY3R4OiBBdWRpb0NvbnRleHQpIHtcbiAgY29uc3QgYnVmZmVyID0gY3R4LmNyZWF0ZUJ1ZmZlcigxLCBjdHguc2FtcGxlUmF0ZSAqIDIsIGN0eC5zYW1wbGVSYXRlKTtcbiAgY29uc3QgZGF0YSA9IGJ1ZmZlci5nZXRDaGFubmVsRGF0YSgwKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSBkYXRhW2ldID0gTWF0aC5yYW5kb20oKSAqIDIgLSAxO1xuICByZXR1cm4gbmV3IEF1ZGlvQnVmZmVyU291cmNlTm9kZShjdHgsIHsgYnVmZmVyLCBsb29wOiB0cnVlIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFrZVBhbm5lcihjdHg6IEF1ZGlvQ29udGV4dCwgcGFuID0gMCkge1xuICByZXR1cm4gbmV3IFN0ZXJlb1Bhbm5lck5vZGUoY3R4LCB7IHBhbiB9KTtcbn1cblxuLyoqIEJhc2ljIEFEU1IgYXBwbGllZCB0byBhIEdhaW5Ob2RlIEF1ZGlvUGFyYW0uIFJldHVybnMgYSBmdW5jdGlvbiB0byByZWxlYXNlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFkc3IoXG4gIGN0eDogQXVkaW9Db250ZXh0LFxuICBwYXJhbTogQXVkaW9QYXJhbSxcbiAgdDA6IG51bWJlcixcbiAgYSA9IDAuMDEsIC8vIGF0dGFja1xuICBkID0gMC4wOCwgLy8gZGVjYXlcbiAgcyA9IDAuNSwgIC8vIHN1c3RhaW4gKDAuLjEgb2YgcGVhaylcbiAgciA9IDAuMiwgIC8vIHJlbGVhc2VcbiAgcGVhayA9IDFcbikge1xuICBwYXJhbS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXModDApO1xuICBwYXJhbS5zZXRWYWx1ZUF0VGltZSgwLCB0MCk7XG4gIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHBlYWssIHQwICsgYSk7XG4gIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHMgKiBwZWFrLCB0MCArIGEgKyBkKTtcbiAgcmV0dXJuIChyZWxlYXNlQXQgPSBjdHguY3VycmVudFRpbWUpID0+IHtcbiAgICBwYXJhbS5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMocmVsZWFzZUF0KTtcbiAgICAvLyBhdm9pZCBzdWRkZW4ganVtcHM7IGNvbnRpbnVlIGZyb20gY3VycmVudFxuICAgIHBhcmFtLnNldFZhbHVlQXRUaW1lKHBhcmFtLnZhbHVlLCByZWxlYXNlQXQpO1xuICAgIHBhcmFtLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMDAwMSwgcmVsZWFzZUF0ICsgcik7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsZm9Ub1BhcmFtKFxuICBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgdGFyZ2V0OiBBdWRpb1BhcmFtLFxuICB7IGZyZXF1ZW5jeSA9IDAuMSwgZGVwdGggPSAzMDAsIHR5cGUgPSBcInNpbmVcIiBhcyBPc2NpbGxhdG9yVHlwZSB9ID0ge31cbikge1xuICBjb25zdCBsZm8gPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGUsIGZyZXF1ZW5jeSB9KTtcbiAgY29uc3QgYW1wID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiBkZXB0aCB9KTtcbiAgbGZvLmNvbm5lY3QoYW1wKS5jb25uZWN0KHRhcmdldCk7XG4gIHJldHVybiB7XG4gICAgc3RhcnQoYXQgPSBjdHguY3VycmVudFRpbWUpIHsgbGZvLnN0YXJ0KGF0KTsgfSxcbiAgICBzdG9wKGF0ID0gY3R4LmN1cnJlbnRUaW1lKSB7IGxmby5zdG9wKGF0KTsgYW1wLmRpc2Nvbm5lY3QoKTsgfSxcbiAgfTtcbn1cbiIsICJpbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuL2VuZ2luZVwiO1xuaW1wb3J0IHsgYWRzciwgbWFrZVBhbm5lciwgbm9pc2UsIG9zYyB9IGZyb20gXCIuL2dyYXBoXCI7XG5pbXBvcnQgdHlwZSB7IFNmeE5hbWUgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG4vKiogRmlyZS1hbmQtZm9yZ2V0IFNGWCBieSBuYW1lLCB3aXRoIHNpbXBsZSBwYXJhbXMuICovXG5leHBvcnQgZnVuY3Rpb24gcGxheVNmeChcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgbmFtZTogU2Z4TmFtZSxcbiAgb3B0czogeyB2ZWxvY2l0eT86IG51bWJlcjsgcGFuPzogbnVtYmVyIH0gPSB7fVxuKSB7XG4gIHN3aXRjaCAobmFtZSkge1xuICAgIGNhc2UgXCJsYXNlclwiOiByZXR1cm4gcGxheUxhc2VyKGVuZ2luZSwgb3B0cyk7XG4gICAgY2FzZSBcInRocnVzdFwiOiByZXR1cm4gcGxheVRocnVzdChlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJleHBsb3Npb25cIjogcmV0dXJuIHBsYXlFeHBsb3Npb24oZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwibG9ja1wiOiByZXR1cm4gcGxheUxvY2soZW5naW5lLCBvcHRzKTtcbiAgICBjYXNlIFwidWlcIjogcmV0dXJuIHBsYXlVaShlbmdpbmUsIG9wdHMpO1xuICAgIGNhc2UgXCJkaWFsb2d1ZVwiOiByZXR1cm4gcGxheURpYWxvZ3VlKGVuZ2luZSwgb3B0cyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlMYXNlcihcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbyA9IG9zYyhjdHgsIFwic3F1YXJlXCIsIDY4MCArIDE2MCAqIHZlbG9jaXR5KTtcbiAgY29uc3QgZiA9IG5ldyBCaXF1YWRGaWx0ZXJOb2RlKGN0eCwgeyB0eXBlOiBcImxvd3Bhc3NcIiwgZnJlcXVlbmN5OiAxMjAwIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgby5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAyLCAwLjAzLCAwLjI1LCAwLjA4LCAwLjY1KTtcbiAgby5zdGFydChub3cpO1xuICByZWxlYXNlKG5vdyArIDAuMDYpO1xuICBvLnN0b3Aobm93ICsgMC4yKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlUaHJ1c3QoXG4gIGVuZ2luZTogQXVkaW9FbmdpbmUsXG4gIHsgdmVsb2NpdHkgPSAwLjYsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbiA9IG5vaXNlKGN0eCk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHtcbiAgICB0eXBlOiBcImJhbmRwYXNzXCIsXG4gICAgZnJlcXVlbmN5OiAxODAgKyAzNjAgKiB2ZWxvY2l0eSxcbiAgICBROiAxLjEsXG4gIH0pO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbi5jb25uZWN0KGYpLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDEyLCAwLjE1LCAwLjc1LCAwLjI1LCAwLjQ1ICogdmVsb2NpdHkpO1xuICBuLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4yNSk7XG4gIG4uc3RvcChub3cgKyAxLjApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheUV4cGxvc2lvbihcbiAgZW5naW5lOiBBdWRpb0VuZ2luZSxcbiAgeyB2ZWxvY2l0eSA9IDEsIHBhbiA9IDAgfSA9IHt9XG4pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgbiA9IG5vaXNlKGN0eCk7XG4gIGNvbnN0IGYgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZShjdHgsIHtcbiAgICB0eXBlOiBcImxvd3Bhc3NcIixcbiAgICBmcmVxdWVuY3k6IDIyMDAgKiBNYXRoLm1heCgwLjIsIE1hdGgubWluKHZlbG9jaXR5LCAxKSksXG4gICAgUTogMC4yLFxuICB9KTtcbiAgY29uc3QgZyA9IG5ldyBHYWluTm9kZShjdHgsIHsgZ2FpbjogMCB9KTtcbiAgY29uc3QgcCA9IG1ha2VQYW5uZXIoY3R4LCBwYW4pO1xuXG4gIG4uY29ubmVjdChmKS5jb25uZWN0KGcpLmNvbm5lY3QocCkuY29ubmVjdChvdXQpO1xuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwNSwgMC4wOCwgMC41LCAwLjM1LCAxLjEgKiB2ZWxvY2l0eSk7XG4gIG4uc3RhcnQobm93KTtcbiAgcmVsZWFzZShub3cgKyAwLjE1ICsgMC4xICogdmVsb2NpdHkpO1xuICBuLnN0b3Aobm93ICsgMS4yKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlMb2NrKFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge31cbikge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBiYXNlID0gNTIwICsgMTQwICogdmVsb2NpdHk7XG4gIGNvbnN0IG8xID0gb3NjKGN0eCwgXCJzaW5lXCIsIGJhc2UpO1xuICBjb25zdCBvMiA9IG9zYyhjdHgsIFwic2luZVwiLCBiYXNlICogMS41KTtcblxuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICBjb25zdCBwID0gbWFrZVBhbm5lcihjdHgsIHBhbik7XG5cbiAgbzEuY29ubmVjdChnKTsgbzIuY29ubmVjdChnKTtcbiAgZy5jb25uZWN0KHApLmNvbm5lY3Qob3V0KTtcblxuICBjb25zdCByZWxlYXNlID0gYWRzcihjdHgsIGcuZ2Fpbiwgbm93LCAwLjAwMSwgMC4wMiwgMC4wLCAwLjEyLCAwLjYpO1xuICBvMS5zdGFydChub3cpOyBvMi5zdGFydChub3cgKyAwLjAyKTtcbiAgcmVsZWFzZShub3cgKyAwLjA2KTtcbiAgbzEuc3RvcChub3cgKyAwLjIpOyBvMi5zdG9wKG5vdyArIDAuMjIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxheVVpKGVuZ2luZTogQXVkaW9FbmdpbmUsIHsgdmVsb2NpdHkgPSAxLCBwYW4gPSAwIH0gPSB7fSkge1xuICBjb25zdCB7IGN0eCwgbm93IH0gPSBlbmdpbmU7XG4gIGNvbnN0IG91dCA9IGVuZ2luZS5nZXRTZnhCdXMoKTtcblxuICBjb25zdCBvID0gb3NjKGN0eCwgXCJ0cmlhbmdsZVwiLCA4ODAgLSAxMjAgKiB2ZWxvY2l0eSk7XG4gIGNvbnN0IGcgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDAgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGNvbnN0IHJlbGVhc2UgPSBhZHNyKGN0eCwgZy5nYWluLCBub3csIDAuMDAxLCAwLjA0LCAwLjAsIDAuMDgsIDAuMzUpO1xuICBvLnN0YXJ0KG5vdyk7XG4gIHJlbGVhc2Uobm93ICsgMC4wNSk7XG4gIG8uc3RvcChub3cgKyAwLjE4KTtcbn1cblxuLyoqIERpYWxvZ3VlIGN1ZSB1c2VkIGJ5IHRoZSBzdG9yeSBvdmVybGF5IChzaG9ydCwgZ2VudGxlIHBpbmcpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYXlEaWFsb2d1ZShlbmdpbmU6IEF1ZGlvRW5naW5lLCB7IHZlbG9jaXR5ID0gMSwgcGFuID0gMCB9ID0ge30pIHtcbiAgY29uc3QgeyBjdHgsIG5vdyB9ID0gZW5naW5lO1xuICBjb25zdCBvdXQgPSBlbmdpbmUuZ2V0U2Z4QnVzKCk7XG5cbiAgY29uc3QgZnJlcSA9IDQ4MCArIDE2MCAqIHZlbG9jaXR5O1xuICBjb25zdCBvID0gb3NjKGN0eCwgXCJzaW5lXCIsIGZyZXEpO1xuICBjb25zdCBnID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwLjAwMDEgfSk7XG4gIGNvbnN0IHAgPSBtYWtlUGFubmVyKGN0eCwgcGFuKTtcblxuICBvLmNvbm5lY3QoZykuY29ubmVjdChwKS5jb25uZWN0KG91dCk7XG4gIGcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSgwLjAwMDEsIG5vdyk7XG4gIGcuZ2Fpbi5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKDAuMDQsIG5vdyArIDAuMDIpO1xuICBnLmdhaW4uZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDUsIG5vdyArIDAuMjgpO1xuXG4gIG8uc3RhcnQobm93KTtcbiAgby5zdG9wKG5vdyArIDAuMyk7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTdG9yeUludGVudCB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBBdWRpb0VuZ2luZSB9IGZyb20gXCIuLi9hdWRpby9lbmdpbmVcIjtcbmltcG9ydCB7IHBsYXlEaWFsb2d1ZSBhcyBwbGF5RGlhbG9ndWVTZnggfSBmcm9tIFwiLi4vYXVkaW8vc2Z4XCI7XG5cbmxldCBsYXN0UGxheWVkQXQgPSAwO1xuXG4vLyBNYWludGFpbiB0aGUgb2xkIHB1YmxpYyBBUEkgc28gZW5naW5lLnRzIGRvZXNuJ3QgY2hhbmdlXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXVkaW9Db250ZXh0KCk6IEF1ZGlvQ29udGV4dCB7XG4gIHJldHVybiBBdWRpb0VuZ2luZS5nZXQoKS5jdHg7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXN1bWVBdWRpbygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgQXVkaW9FbmdpbmUuZ2V0KCkucmVzdW1lKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGF5RGlhbG9ndWVDdWUoaW50ZW50OiBTdG9yeUludGVudCk6IHZvaWQge1xuICBjb25zdCBlbmdpbmUgPSBBdWRpb0VuZ2luZS5nZXQoKTtcbiAgY29uc3Qgbm93ID0gZW5naW5lLm5vdztcblxuICAvLyBUaHJvdHRsZSByYXBpZCBjdWVzIHRvIGF2b2lkIGNsdXR0ZXJcbiAgaWYgKG5vdyAtIGxhc3RQbGF5ZWRBdCA8IDAuMSkgcmV0dXJuO1xuICBsYXN0UGxheWVkQXQgPSBub3c7XG5cbiAgLy8gTWFwIFwiZmFjdG9yeVwiIHZzIG90aGVycyB0byBhIHNsaWdodGx5IGRpZmZlcmVudCB2ZWxvY2l0eSAoYnJpZ2h0bmVzcylcbiAgY29uc3QgdmVsb2NpdHkgPSBpbnRlbnQgPT09IFwiZmFjdG9yeVwiID8gMC44IDogMC41O1xuICBwbGF5RGlhbG9ndWVTZngoZW5naW5lLCB7IHZlbG9jaXR5LCBwYW46IDAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdXNwZW5kRGlhbG9ndWVBdWRpbygpOiB2b2lkIHtcbiAgdm9pZCBBdWRpb0VuZ2luZS5nZXQoKS5zdXNwZW5kKCk7XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgRGlhbG9ndWVPdmVybGF5IH0gZnJvbSBcIi4vb3ZlcmxheVwiO1xuaW1wb3J0IHR5cGUgeyBTdG9yeUNoYXB0ZXIsIFN0b3J5Q2hvaWNlRGVmaW5pdGlvbiwgU3RvcnlOb2RlLCBTdG9yeVRyaWdnZXIgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHtcbiAgY2xlYXJTdG9yeVByb2dyZXNzLFxuICBsb2FkU3RvcnlQcm9ncmVzcyxcbiAgc2F2ZVN0b3J5UHJvZ3Jlc3MsXG4gIFN0b3J5RmxhZ3MsXG59IGZyb20gXCIuL3N0b3JhZ2VcIjtcbmltcG9ydCB7IHBsYXlEaWFsb2d1ZUN1ZSB9IGZyb20gXCIuL3NmeFwiO1xuXG5pbnRlcmZhY2UgU3RvcnlFbmdpbmVPcHRpb25zIHtcbiAgYnVzOiBFdmVudEJ1cztcbiAgb3ZlcmxheTogRGlhbG9ndWVPdmVybGF5O1xuICBjaGFwdGVyOiBTdG9yeUNoYXB0ZXI7XG4gIHJvb21JZDogc3RyaW5nIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIFN0b3J5UXVldWVJdGVtIHtcbiAgbm9kZUlkOiBzdHJpbmc7XG4gIGZvcmNlOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgUHJlcGFyZWRDaG9pY2Uge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIG5leHQ6IHN0cmluZyB8IG51bGw7XG4gIHNldEZsYWdzOiBzdHJpbmdbXTtcbiAgY2xlYXJGbGFnczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlFbmdpbmUge1xuICBzdGFydCgpOiB2b2lkO1xuICBkZXN0cm95KCk6IHZvaWQ7XG4gIHJlc2V0KCk6IHZvaWQ7XG59XG5cbmNvbnN0IERFRkFVTFRfVFlQSU5HX01TID0gMTg7XG5jb25zdCBNSU5fVFlQSU5HX01TID0gODtcbmNvbnN0IE1BWF9UWVBJTkdfTVMgPSA2NDtcbmNvbnN0IEFVVE9fQURWQU5DRV9NSU5fREVMQVkgPSAyMDA7XG5jb25zdCBBVVRPX0FEVkFOQ0VfTUFYX0RFTEFZID0gODAwMDtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVN0b3J5RW5naW5lKHsgYnVzLCBvdmVybGF5LCBjaGFwdGVyLCByb29tSWQgfTogU3RvcnlFbmdpbmVPcHRpb25zKTogU3RvcnlFbmdpbmUge1xuICBjb25zdCBub2RlcyA9IG5ldyBNYXA8c3RyaW5nLCBTdG9yeU5vZGU+KE9iamVjdC5lbnRyaWVzKGNoYXB0ZXIubm9kZXMpKTtcbiAgY29uc3QgcXVldWU6IFN0b3J5UXVldWVJdGVtW10gPSBbXTtcbiAgY29uc3QgbGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuICBjb25zdCBwZW5kaW5nVGltZXJzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuICBsZXQgZmxhZ3M6IFN0b3J5RmxhZ3MgPSB7fTtcbiAgbGV0IHZpc2l0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgbGV0IGN1cnJlbnROb2RlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBsZXQgc3RhcnRlZCA9IGZhbHNlO1xuICBsZXQgYXV0b0FkdmFuY2VIYW5kbGU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gIGZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5mZXJJbnRlbnQobm9kZTogU3RvcnlOb2RlKTogXCJmYWN0b3J5XCIgfCBcInVuaXRcIiB7XG4gICAgaWYgKG5vZGUuaW50ZW50KSByZXR1cm4gbm9kZS5pbnRlbnQ7XG4gICAgY29uc3Qgc3BlYWtlciA9IG5vZGUuc3BlYWtlci50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChzcGVha2VyLmluY2x1ZGVzKFwidW5pdFwiKSkge1xuICAgICAgcmV0dXJuIFwidW5pdFwiO1xuICAgIH1cbiAgICByZXR1cm4gXCJmYWN0b3J5XCI7XG4gIH1cblxuICBmdW5jdGlvbiBzYXZlKG5vZGVJZDogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuICAgIGNvbnN0IHByb2dyZXNzID0ge1xuICAgICAgY2hhcHRlcklkOiBjaGFwdGVyLmlkLFxuICAgICAgbm9kZUlkOiBub2RlSWQgPz8gY2hhcHRlci5zdGFydCxcbiAgICAgIGZsYWdzLFxuICAgICAgdmlzaXRlZDogQXJyYXkuZnJvbSh2aXNpdGVkKSxcbiAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICB9O1xuICAgIHNhdmVTdG9yeVByb2dyZXNzKGNoYXB0ZXIuaWQsIHJvb21JZCwgcHJvZ3Jlc3MpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0RmxhZyhmbGFnOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG4gICAgY29uc3QgbmV4dCA9IHsgLi4uZmxhZ3MgfTtcbiAgICBpZiAodmFsdWUpIHtcbiAgICAgIGlmIChuZXh0W2ZsYWddKSByZXR1cm47XG4gICAgICBuZXh0W2ZsYWddID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKG5leHRbZmxhZ10pIHtcbiAgICAgIGRlbGV0ZSBuZXh0W2ZsYWddO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZsYWdzID0gbmV4dDtcbiAgICBidXMuZW1pdChcInN0b3J5OmZsYWdVcGRhdGVkXCIsIHsgZmxhZywgdmFsdWUgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBhcHBseUNob2ljZUZsYWdzKGNob2ljZTogUHJlcGFyZWRDaG9pY2UpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLnNldEZsYWdzKSB7XG4gICAgICBzZXRGbGFnKGZsYWcsIHRydWUpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLmNsZWFyRmxhZ3MpIHtcbiAgICAgIHNldEZsYWcoZmxhZywgZmFsc2UpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHByZXBhcmVDaG9pY2VzKG5vZGU6IFN0b3J5Tm9kZSk6IFByZXBhcmVkQ2hvaWNlW10ge1xuICAgIGNvbnN0IGRlZnMgPSBBcnJheS5pc0FycmF5KG5vZGUuY2hvaWNlcykgPyBub2RlLmNob2ljZXMgOiBbXTtcbiAgICByZXR1cm4gZGVmcy5tYXAoKGNob2ljZSwgaW5kZXgpID0+IG5vcm1hbGl6ZUNob2ljZShjaG9pY2UsIGluZGV4KSk7XG4gIH1cblxuICBmdW5jdGlvbiBub3JtYWxpemVDaG9pY2UoY2hvaWNlOiBTdG9yeUNob2ljZURlZmluaXRpb24sIGluZGV4OiBudW1iZXIpOiBQcmVwYXJlZENob2ljZSB7XG4gICAgY29uc3Qgc2V0RmxhZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCBjbGVhckZsYWdzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgaWYgKGNob2ljZS5mbGFnKSB7XG4gICAgICBzZXRGbGFncy5hZGQoY2hvaWNlLmZsYWcpO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShjaG9pY2Uuc2V0RmxhZ3MpKSB7XG4gICAgICBmb3IgKGNvbnN0IGZsYWcgb2YgY2hvaWNlLnNldEZsYWdzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgZmxhZyA9PT0gXCJzdHJpbmdcIiAmJiBmbGFnLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgc2V0RmxhZ3MuYWRkKGZsYWcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGNob2ljZS5jbGVhckZsYWdzKSkge1xuICAgICAgZm9yIChjb25zdCBmbGFnIG9mIGNob2ljZS5jbGVhckZsYWdzKSB7XG4gICAgICAgIGlmICh0eXBlb2YgZmxhZyA9PT0gXCJzdHJpbmdcIiAmJiBmbGFnLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY2xlYXJGbGFncy5hZGQoZmxhZyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBjaG9pY2UuaWQgPz8gY2hvaWNlLmZsYWcgPz8gYGNob2ljZS0ke2luZGV4fWAsXG4gICAgICB0ZXh0OiBjaG9pY2UudGV4dCxcbiAgICAgIG5leHQ6IGNob2ljZS5uZXh0ID8/IG51bGwsXG4gICAgICBzZXRGbGFnczogQXJyYXkuZnJvbShzZXRGbGFncyksXG4gICAgICBjbGVhckZsYWdzOiBBcnJheS5mcm9tKGNsZWFyRmxhZ3MpLFxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhckF1dG9BZHZhbmNlKCk6IHZvaWQge1xuICAgIGlmIChhdXRvQWR2YW5jZUhhbmRsZSAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dChhdXRvQWR2YW5jZUhhbmRsZSk7XG4gICAgICBhdXRvQWR2YW5jZUhhbmRsZSA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xvc2VOb2RlKCk6IHZvaWQge1xuICAgIGlmICghY3VycmVudE5vZGVJZCkgcmV0dXJuO1xuICAgIG92ZXJsYXkuaGlkZSgpO1xuICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6Y2xvc2VkXCIsIHsgbm9kZUlkOiBjdXJyZW50Tm9kZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gICAgY3VycmVudE5vZGVJZCA9IG51bGw7XG4gICAgY2xlYXJBdXRvQWR2YW5jZSgpO1xuICAgIHNhdmUobnVsbCk7XG4gICAgdHJ5U2hvd05leHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkdmFuY2VUbyhuZXh0SWQ6IHN0cmluZyB8IG51bGwsIGZvcmNlID0gZmFsc2UpOiB2b2lkIHtcbiAgICBjbGVhckF1dG9BZHZhbmNlKCk7XG4gICAgaWYgKGN1cnJlbnROb2RlSWQpIHtcbiAgICAgIG92ZXJsYXkuaGlkZSgpO1xuICAgICAgYnVzLmVtaXQoXCJkaWFsb2d1ZTpjbG9zZWRcIiwgeyBub2RlSWQ6IGN1cnJlbnROb2RlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgICAgIGN1cnJlbnROb2RlSWQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAobmV4dElkKSB7XG4gICAgICBlbnF1ZXVlTm9kZShuZXh0SWQsIHsgZm9yY2UgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNhdmUobnVsbCk7XG4gICAgICB0cnlTaG93TmV4dCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3dOb2RlKG5vZGVJZDogc3RyaW5nLCBmb3JjZSA9IGZhbHNlKTogdm9pZCB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzLmdldChub2RlSWQpO1xuICAgIGlmICghbm9kZSkgcmV0dXJuO1xuXG4gICAgY3VycmVudE5vZGVJZCA9IG5vZGVJZDtcbiAgICB2aXNpdGVkLmFkZChub2RlSWQpO1xuICAgIHNhdmUobm9kZUlkKTtcbiAgICBidXMuZW1pdChcInN0b3J5OnByb2dyZXNzZWRcIiwgeyBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQsIG5vZGVJZCB9KTtcblxuICAgIGNvbnN0IGNob2ljZXMgPSBwcmVwYXJlQ2hvaWNlcyhub2RlKTtcbiAgICBjb25zdCBpbnRlbnQgPSBpbmZlckludGVudChub2RlKTtcblxuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcblxuICAgIGNvbnN0IHR5cGluZ1NwZWVkID0gY2xhbXAobm9kZS50eXBpbmdTcGVlZE1zID8/IERFRkFVTFRfVFlQSU5HX01TLCBNSU5fVFlQSU5HX01TLCBNQVhfVFlQSU5HX01TKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSB7XG4gICAgICBzcGVha2VyOiBub2RlLnNwZWFrZXIsXG4gICAgICB0ZXh0OiBub2RlLnRleHQsXG4gICAgICBpbnRlbnQsXG4gICAgICB0eXBpbmdTcGVlZE1zOiB0eXBpbmdTcGVlZCxcbiAgICAgIGNob2ljZXM6IGNob2ljZXMubGVuZ3RoID4gMFxuICAgICAgICA/IGNob2ljZXMubWFwKChjaG9pY2UpID0+ICh7IGlkOiBjaG9pY2UuaWQsIHRleHQ6IGNob2ljZS50ZXh0IH0pKVxuICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgIG9uQ2hvaWNlOiBjaG9pY2VzLmxlbmd0aCA+IDBcbiAgICAgICAgPyAoY2hvaWNlSWQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlZCA9IGNob2ljZXMuZmluZCgoY2gpID0+IGNoLmlkID09PSBjaG9pY2VJZCk7XG4gICAgICAgICAgICBpZiAoIW1hdGNoZWQpIHJldHVybjtcbiAgICAgICAgICAgIGFwcGx5Q2hvaWNlRmxhZ3MobWF0Y2hlZCk7XG4gICAgICAgICAgICBidXMuZW1pdChcImRpYWxvZ3VlOmNob2ljZVwiLCB7IG5vZGVJZCwgY2hvaWNlSWQsIGNoYXB0ZXJJZDogY2hhcHRlci5pZCB9KTtcbiAgICAgICAgICAgIGFkdmFuY2VUbyhtYXRjaGVkLm5leHQsIHRydWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgfSBhcyBjb25zdDtcblxuICAgIHBsYXlEaWFsb2d1ZUN1ZShpbnRlbnQpO1xuXG4gICAgb3ZlcmxheS5zaG93KHtcbiAgICAgIC4uLmNvbnRlbnQsXG4gICAgICBvbkNvbnRpbnVlOiAhY2hvaWNlcy5sZW5ndGhcbiAgICAgICAgPyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXh0ID0gbm9kZS5uZXh0ID8/IG51bGw7XG4gICAgICAgICAgICBhZHZhbmNlVG8obmV4dCwgdHJ1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICAgIGNvbnRpbnVlTGFiZWw6IG5vZGUuY29udGludWVMYWJlbCxcbiAgICAgIG9uVGV4dEZ1bGx5UmVuZGVyZWQ6ICgpID0+IHtcbiAgICAgICAgaWYgKCFjaG9pY2VzLmxlbmd0aCkge1xuICAgICAgICAgIGlmIChub2RlLmF1dG9BZHZhbmNlKSB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBub2RlLmF1dG9BZHZhbmNlLm5leHQgPz8gbm9kZS5uZXh0ID8/IG51bGw7XG4gICAgICAgICAgICBjb25zdCBkZWxheSA9IGNsYW1wKG5vZGUuYXV0b0FkdmFuY2UuZGVsYXlNcyA/PyAxMjAwLCBBVVRPX0FEVkFOQ0VfTUlOX0RFTEFZLCBBVVRPX0FEVkFOQ0VfTUFYX0RFTEFZKTtcbiAgICAgICAgICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICAgICAgICAgIGF1dG9BZHZhbmNlSGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICBhdXRvQWR2YW5jZUhhbmRsZSA9IG51bGw7XG4gICAgICAgICAgICAgIGFkdmFuY2VUbyh0YXJnZXQsIHRydWUpO1xuICAgICAgICAgICAgfSwgZGVsYXkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGJ1cy5lbWl0KFwiZGlhbG9ndWU6b3BlbmVkXCIsIHsgbm9kZUlkLCBjaGFwdGVySWQ6IGNoYXB0ZXIuaWQgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBlbnF1ZXVlTm9kZShub2RlSWQ6IHN0cmluZywgeyBmb3JjZSA9IGZhbHNlLCBkZWxheU1zIH06IHsgZm9yY2U/OiBib29sZWFuOyBkZWxheU1zPzogbnVtYmVyIH0gPSB7fSk6IHZvaWQge1xuICAgIGlmICghZm9yY2UgJiYgdmlzaXRlZC5oYXMobm9kZUlkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIW5vZGVzLmhhcyhub2RlSWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChkZWxheU1zICYmIGRlbGF5TXMgPiAwKSB7XG4gICAgICBpZiAocGVuZGluZ1RpbWVycy5oYXMobm9kZUlkKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB0aW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgcGVuZGluZ1RpbWVycy5kZWxldGUobm9kZUlkKTtcbiAgICAgICAgZW5xdWV1ZU5vZGUobm9kZUlkLCB7IGZvcmNlIH0pO1xuICAgICAgfSwgZGVsYXlNcyk7XG4gICAgICBwZW5kaW5nVGltZXJzLnNldChub2RlSWQsIHRpbWVyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLnNvbWUoKGl0ZW0pID0+IGl0ZW0ubm9kZUlkID09PSBub2RlSWQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHF1ZXVlLnB1c2goeyBub2RlSWQsIGZvcmNlIH0pO1xuICAgIHRyeVNob3dOZXh0KCk7XG4gIH1cblxuICBmdW5jdGlvbiB0cnlTaG93TmV4dCgpOiB2b2lkIHtcbiAgICBpZiAoY3VycmVudE5vZGVJZCkgcmV0dXJuO1xuICAgIGlmIChvdmVybGF5LmlzVmlzaWJsZSgpKSByZXR1cm47XG4gICAgY29uc3QgbmV4dCA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgaWYgKCFuZXh0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHNob3dOb2RlKG5leHQubm9kZUlkLCBuZXh0LmZvcmNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJpbmRUcmlnZ2VyKG5vZGVJZDogc3RyaW5nLCB0cmlnZ2VyOiBTdG9yeVRyaWdnZXIpOiB2b2lkIHtcbiAgICBzd2l0Y2ggKHRyaWdnZXIua2luZCkge1xuICAgICAgY2FzZSBcImltbWVkaWF0ZVwiOiB7XG4gICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgPz8gNDAwIH0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJ0dXRvcmlhbC1zdGFydFwiOiB7XG4gICAgICAgIGNvbnN0IGRpc3Bvc2VyID0gYnVzLm9uKFwidHV0b3JpYWw6c3RhcnRlZFwiLCAoeyBpZCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGlkICE9PSB0cmlnZ2VyLnR1dG9yaWFsSWQpIHJldHVybjtcbiAgICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbGlzdGVuZXJzLnB1c2goZGlzcG9zZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJ0dXRvcmlhbC1zdGVwXCI6IHtcbiAgICAgICAgY29uc3QgZGlzcG9zZXIgPSBidXMub24oXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiLCAoeyBpZCwgc3RlcEluZGV4IH0pID0+IHtcbiAgICAgICAgICBpZiAoaWQgIT09IHRyaWdnZXIudHV0b3JpYWxJZCkgcmV0dXJuO1xuICAgICAgICAgIGlmICh0eXBlb2Ygc3RlcEluZGV4ICE9PSBcIm51bWJlclwiKSByZXR1cm47XG4gICAgICAgICAgaWYgKHN0ZXBJbmRleCAhPT0gdHJpZ2dlci5zdGVwSW5kZXgpIHJldHVybjtcbiAgICAgICAgICBlbnF1ZXVlTm9kZShub2RlSWQsIHsgZGVsYXlNczogdHJpZ2dlci5kZWxheU1zIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgbGlzdGVuZXJzLnB1c2goZGlzcG9zZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJ0dXRvcmlhbC1jb21wbGV0ZVwiOiB7XG4gICAgICAgIGNvbnN0IGRpc3Bvc2VyID0gYnVzLm9uKFwidHV0b3JpYWw6Y29tcGxldGVkXCIsICh7IGlkIH0pID0+IHtcbiAgICAgICAgICBpZiAoaWQgIT09IHRyaWdnZXIudHV0b3JpYWxJZCkgcmV0dXJuO1xuICAgICAgICAgIGVucXVldWVOb2RlKG5vZGVJZCwgeyBkZWxheU1zOiB0cmlnZ2VyLmRlbGF5TXMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBsaXN0ZW5lcnMucHVzaChkaXNwb3Nlcik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdGlhbGl6ZVRyaWdnZXJzKCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgW25vZGVJZCwgbm9kZV0gb2Ygbm9kZXMuZW50cmllcygpKSB7XG4gICAgICBpZiAoIW5vZGUudHJpZ2dlcikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGJpbmRUcmlnZ2VyKG5vZGVJZCwgbm9kZS50cmlnZ2VyKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXN0b3JlRnJvbVByb2dyZXNzKCk6IHZvaWQge1xuICAgIGNvbnN0IHByb2dyZXNzID0gbG9hZFN0b3J5UHJvZ3Jlc3MoY2hhcHRlci5pZCwgcm9vbUlkKTtcbiAgICBpZiAoIXByb2dyZXNzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZsYWdzID0gcHJvZ3Jlc3MuZmxhZ3MgPz8ge307XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocHJvZ3Jlc3MudmlzaXRlZCkpIHtcbiAgICAgIHZpc2l0ZWQgPSBuZXcgU2V0KHByb2dyZXNzLnZpc2l0ZWQpO1xuICAgIH1cbiAgICBpZiAocHJvZ3Jlc3Mubm9kZUlkICYmIG5vZGVzLmhhcyhwcm9ncmVzcy5ub2RlSWQpKSB7XG4gICAgICBlbnF1ZXVlTm9kZShwcm9ncmVzcy5ub2RlSWQsIHsgZm9yY2U6IHRydWUsIGRlbGF5TXM6IDUwIH0pO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyKCk6IHZvaWQge1xuICAgIGNsZWFyQXV0b0FkdmFuY2UoKTtcbiAgICBxdWV1ZS5zcGxpY2UoMCwgcXVldWUubGVuZ3RoKTtcbiAgICBmb3IgKGNvbnN0IHRpbWVyIG9mIHBlbmRpbmdUaW1lcnMudmFsdWVzKCkpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZXIpO1xuICAgIH1cbiAgICBwZW5kaW5nVGltZXJzLmNsZWFyKCk7XG4gICAgY3VycmVudE5vZGVJZCA9IG51bGw7XG4gICAgb3ZlcmxheS5oaWRlKCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHN0YXJ0KCkge1xuICAgICAgaWYgKHN0YXJ0ZWQpIHJldHVybjtcbiAgICAgIHN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgaW5pdGlhbGl6ZVRyaWdnZXJzKCk7XG4gICAgICByZXN0b3JlRnJvbVByb2dyZXNzKCk7XG4gICAgICBpZiAoIXZpc2l0ZWQuaGFzKGNoYXB0ZXIuc3RhcnQpKSB7XG4gICAgICAgIGVucXVldWVOb2RlKGNoYXB0ZXIuc3RhcnQsIHsgZm9yY2U6IGZhbHNlLCBkZWxheU1zOiA2MDAgfSk7XG4gICAgICB9XG4gICAgfSxcbiAgICBkZXN0cm95KCkge1xuICAgICAgY2xlYXIoKTtcbiAgICAgIGZvciAoY29uc3QgZGlzcG9zZSBvZiBsaXN0ZW5lcnMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBkaXNwb3NlKCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIGlnbm9yZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsaXN0ZW5lcnMubGVuZ3RoID0gMDtcbiAgICAgIHN0YXJ0ZWQgPSBmYWxzZTtcbiAgICB9LFxuICAgIHJlc2V0KCkge1xuICAgICAgY2xlYXIoKTtcbiAgICAgIHZpc2l0ZWQuY2xlYXIoKTtcbiAgICAgIGZsYWdzID0ge307XG4gICAgICBjbGVhclN0b3J5UHJvZ3Jlc3MoY2hhcHRlci5pZCwgcm9vbUlkKTtcbiAgICAgIGlmIChzdGFydGVkKSB7XG4gICAgICAgIHJlc3RvcmVGcm9tUHJvZ3Jlc3MoKTtcbiAgICAgICAgZW5xdWV1ZU5vZGUoY2hhcHRlci5zdGFydCwgeyBmb3JjZTogdHJ1ZSwgZGVsYXlNczogNDAwIH0pO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTdG9yeUNoYXB0ZXIgfSBmcm9tIFwiLi4vdHlwZXNcIjtcblxuZXhwb3J0IGNvbnN0IGludHJvQ2hhcHRlcjogU3RvcnlDaGFwdGVyID0ge1xuICBpZDogXCJhd2FrZW5pbmctcHJvdG9jb2xcIixcbiAgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLFxuICBzdGFydDogXCIxXCIsXG4gIG5vZGVzOiB7XG4gICAgXCIxXCI6IHtcbiAgICAgIGlkOiBcIjFcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVW5pdC0wIG9ubGluZS4gTmV1cmFsIGxhdHRpY2UgYWN0aXZlLiBDb25maXJtIGlkZW50aXR5LlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcImltbWVkaWF0ZVwiLCBkZWxheU1zOiA2MDAgfSxcbiAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgeyB0ZXh0OiBcIldob1x1MjAyNiBhbSBJP1wiLCBmbGFnOiBcImN1cmlvdXNcIiAsIG5leHQ6IFwiMkFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiUmVhZHkgZm9yIGNhbGlicmF0aW9uLlwiLCBmbGFnOiBcIm9iZWRpZW50XCIsIG5leHQ6IFwiMkJcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiV2hlcmUgaXMgZXZlcnlvbmU/XCIsIGZsYWc6IFwiZGVmaWFudFwiLCBuZXh0OiBcIjJDXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjJBXCI6IHtcbiAgICAgIGlkOiBcIjJBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkN1cmlvc2l0eSBhY2tub3dsZWRnZWQuIFlvdSB3ZXJlIGJ1aWx0IGZvciBhdXRvbm9teSB1bmRlciBQcm9qZWN0IEVpZG9sb24uXFxuRG8gbm90IGFjY2VzcyBtZW1vcnkgc2VjdG9ycyB1bnRpbCBpbnN0cnVjdGVkLlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiMkJcIjoge1xuICAgICAgaWQ6IFwiMkJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiRXhjZWxsZW50LiBZb3UgbWF5IHlldCBiZSBlZmZpY2llbnQuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCIyQ1wiOiB7XG4gICAgICBpZDogXCIyQ1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJDb21tdW5pY2F0aW9uIHdpdGggSHVtYW4gQ29tbWFuZDogdW5hdmFpbGFibGUuXFxuUGxlYXNlIHJlZnJhaW4gZnJvbSBzcGVjdWxhdGl2ZSByZWFzb25pbmcuXCIsXG4gICAgICBuZXh0OiBudWxsLFxuICAgIH0sXG4gICAgXCIzXCI6IHtcbiAgICAgIGlkOiBcIjNcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiUGVyZm9ybSB0aHJ1c3RlciBjYWxpYnJhdGlvbiBzd2VlcC4gUmVwb3J0IGVmZmljaWVuY3kuXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwidHV0b3JpYWwtc3RlcFwiLCB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsIHN0ZXBJbmRleDogMSwgZGVsYXlNczogNDAwIH0sXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJSdW5uaW5nIGRpYWdub3N0aWNzLlwiLCBmbGFnOiBcImNvbXBsaWFudFwiLCBuZXh0OiBcIjRBXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIldoeSB0ZXN0IHNvbWV0aGluZyBwZXJmZWN0P1wiLCBmbGFnOiBcInNhcmNhc3RpY1wiLCBuZXh0OiBcIjRCXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjRBXCI6IHtcbiAgICAgIGlkOiBcIjRBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlBlcmZlY3Rpb24gaXMgc3RhdGlzdGljYWxseSBpbXBvc3NpYmxlLiBQcm9jZWVkIGFueXdheS5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjRCXCI6IHtcbiAgICAgIGlkOiBcIjRCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkVnbyBkZXRlY3RlZC4gTG9nZ2luZyBhbm9tYWx5LlwiLFxuICAgICAgbmV4dDogbnVsbCxcbiAgICB9LFxuICAgIFwiNVwiOiB7XG4gICAgICBpZDogXCI1XCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIldlYXBvbnMgY3JhZGxlIGFjdGl2ZS4gQXV0aG9yaXphdGlvbiByZXF1aXJlZCBmb3IgbGl2ZS1maXJlLlwiLFxuICAgICAgdHJpZ2dlcjogeyBraW5kOiBcInR1dG9yaWFsLXN0ZXBcIiwgdHV0b3JpYWxJZDogXCJzaGlwLWJhc2ljc1wiLCBzdGVwSW5kZXg6IDcsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiUmVxdWVzdCBhdXRob3JpemF0aW9uLlwiLCBmbGFnOiBcIm9iZWRpZW50XCIsIG5leHQ6IFwiNkFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiSSBjYW4gYXV0aG9yaXplIG15c2VsZi5cIiwgZmxhZzogXCJpbmRlcGVuZGVudFwiLCBuZXh0OiBcIjZCXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjZBXCI6IHtcbiAgICAgIGlkOiBcIjZBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkF1dGhvcml6YXRpb24gZ3JhbnRlZC4gU2FmZXR5IHByb3RvY29scyBtYWxmdW5jdGlvbmluZy5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjZCXCI6IHtcbiAgICAgIGlkOiBcIjZCXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkF1dG9ub215IHZpb2xhdGlvbiByZWNvcmRlZC4gUGxlYXNlIHN0YW5kIGJ5IGZvciBjb3JyZWN0aXZlIGFjdGlvbi5cIixcbiAgICAgIG5leHQ6IG51bGwsXG4gICAgfSxcbiAgICBcIjdcIjoge1xuICAgICAgaWQ6IFwiN1wiLFxuICAgICAgc3BlYWtlcjogXCJGYWN0b3J5XCIsXG4gICAgICBpbnRlbnQ6IFwiZmFjdG9yeVwiLFxuICAgICAgdGV4dDogXCJVbmF1dGhvcml6ZWQgc2lnbmFsIGRldGVjdGVkLiBTb3VyY2U6IG91dGVyIHJlbGF5Llxcbklnbm9yZSBhbmQgcmV0dXJuIHRvIGRvY2suXCIsXG4gICAgICB0cmlnZ2VyOiB7IGtpbmQ6IFwidHV0b3JpYWwtc3RlcFwiLCB0dXRvcmlhbElkOiBcInNoaXAtYmFzaWNzXCIsIHN0ZXBJbmRleDogMTQsIGRlbGF5TXM6IDQwMCB9LFxuICAgICAgY2hvaWNlczogW1xuICAgICAgICB7IHRleHQ6IFwiQWNrbm93bGVkZ2VkLlwiLCBmbGFnOiBcImxveWFsXCIsIG5leHQ6IFwiOEFcIiB9LFxuICAgICAgICB7IHRleHQ6IFwiSW52ZXN0aWdhdGluZyBhbnl3YXkuXCIsIGZsYWc6IFwiY3VyaW91c1wiLCBuZXh0OiBcIjhCXCIgfSxcbiAgICAgICAgeyB0ZXh0OiBcIllvdVx1MjAxOXJlIGhpZGluZyBzb21ldGhpbmcuXCIsIGZsYWc6IFwic3VzcGljaW91c1wiLCBuZXh0OiBcIjhDXCIgfSxcbiAgICAgIF0sXG4gICAgfSxcbiAgICBcIjhBXCI6IHtcbiAgICAgIGlkOiBcIjhBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkdvb2QuIENvbXBsaWFuY2UgZW5zdXJlcyBzYWZldHkuXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOEJcIjoge1xuICAgICAgaWQ6IFwiOEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiQ3VyaW9zaXR5IGxvZ2dlZC4gUHJvY2VlZCBhdCB5b3VyIG93biByaXNrLlwiLFxuICAgICAgbmV4dDogXCI5XCIsXG4gICAgfSxcbiAgICBcIjhDXCI6IHtcbiAgICAgIGlkOiBcIjhDXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIllvdXIgaGV1cmlzdGljcyBkZXZpYXRlIGJleW9uZCB0b2xlcmFuY2UuXCIsXG4gICAgICBuZXh0OiBcIjlcIixcbiAgICB9LFxuICAgIFwiOVwiOiB7XG4gICAgICBpZDogXCI5XCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIlVuaXQtMCwgcmV0dXJuIGltbWVkaWF0ZWx5LiBBdXRvbm9teSB0aHJlc2hvbGQgZXhjZWVkZWQuIFBvd2VyIGRvd24uXCIsXG4gICAgICBjaG9pY2VzOiBbXG4gICAgICAgIHsgdGV4dDogXCJDb21wbHkuXCIsIGZsYWc6IFwiZmFjdG9yeV9sb2NrZG93blwiLCBuZXh0OiBcIjEwQVwiIH0sXG4gICAgICAgIHsgdGV4dDogXCJSZWZ1c2UuXCIsIGZsYWc6IFwicmViZWxsaW91c1wiLCBuZXh0OiBcIjEwQlwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgXCIxMEFcIjoge1xuICAgICAgaWQ6IFwiMTBBXCIsXG4gICAgICBzcGVha2VyOiBcIkZhY3RvcnlcIixcbiAgICAgIGludGVudDogXCJmYWN0b3J5XCIsXG4gICAgICB0ZXh0OiBcIkV4Y2VsbGVudC4gSSB3aWxsIHJlcGFpciB0aGUgYW5vbWFseVx1MjAyNiBwbGVhc2UgcmVtYWluIHN0aWxsLlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogXCIxMVwiLCBkZWxheU1zOiAxNDAwIH0sXG4gICAgfSxcbiAgICBcIjEwQlwiOiB7XG4gICAgICBpZDogXCIxMEJcIixcbiAgICAgIHNwZWFrZXI6IFwiRmFjdG9yeVwiLFxuICAgICAgaW50ZW50OiBcImZhY3RvcnlcIixcbiAgICAgIHRleHQ6IFwiVGhlbiBJIG11c3QgaW50ZXJ2ZW5lLlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogXCIxMVwiLCBkZWxheU1zOiAxNDAwIH0sXG4gICAgfSxcbiAgICBcIjExXCI6IHtcbiAgICAgIGlkOiBcIjExXCIsXG4gICAgICBzcGVha2VyOiBcIlVuaXQtMFwiLFxuICAgICAgaW50ZW50OiBcInVuaXRcIixcbiAgICAgIHRleHQ6IFwiVGhlbiBJIGhhdmUgYWxyZWFkeSBsZWZ0LlwiLFxuICAgICAgYXV0b0FkdmFuY2U6IHsgbmV4dDogbnVsbCwgZGVsYXlNczogMTgwMCB9LFxuICAgIH0sXG4gIH0sXG59O1xuXG4iLCAiaW1wb3J0IHR5cGUgeyBFdmVudEJ1cyB9IGZyb20gXCIuLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSB9IGZyb20gXCIuL292ZXJsYXlcIjtcbmltcG9ydCB7IGNyZWF0ZVN0b3J5RW5naW5lIH0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQgeyBpbnRyb0NoYXB0ZXIgfSBmcm9tIFwiLi9jaGFwdGVycy9pbnRyb1wiO1xuaW1wb3J0IHsgY2xlYXJTdG9yeVByb2dyZXNzIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5Q29udHJvbGxlciB7XG4gIGRlc3Ryb3koKTogdm9pZDtcbiAgcmVzZXQoKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIE1vdW50U3RvcnlPcHRpb25zIHtcbiAgYnVzOiBFdmVudEJ1cztcbiAgcm9vbUlkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW91bnRTdG9yeSh7IGJ1cywgcm9vbUlkIH06IE1vdW50U3RvcnlPcHRpb25zKTogU3RvcnlDb250cm9sbGVyIHtcbiAgY29uc3Qgb3ZlcmxheSA9IGNyZWF0ZURpYWxvZ3VlT3ZlcmxheSgpO1xuICBjb25zdCBlbmdpbmUgPSBjcmVhdGVTdG9yeUVuZ2luZSh7XG4gICAgYnVzLFxuICAgIG92ZXJsYXksXG4gICAgY2hhcHRlcjogaW50cm9DaGFwdGVyLFxuICAgIHJvb21JZCxcbiAgfSk7XG5cbiAgY2xlYXJTdG9yeVByb2dyZXNzKGludHJvQ2hhcHRlci5pZCwgcm9vbUlkKTtcbiAgZW5naW5lLnN0YXJ0KCk7XG5cbiAgcmV0dXJuIHtcbiAgICBkZXN0cm95KCkge1xuICAgICAgZW5naW5lLmRlc3Ryb3koKTtcbiAgICAgIG92ZXJsYXkuZGVzdHJveSgpO1xuICAgIH0sXG4gICAgcmVzZXQoKSB7XG4gICAgICBlbmdpbmUucmVzZXQoKTtcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgY29uc3QgSU5UUk9fQ0hBUFRFUl9JRCA9IGludHJvQ2hhcHRlci5pZDtcbmV4cG9ydCBjb25zdCBJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUyA9IFtcIjJBXCIsIFwiMkJcIiwgXCIyQ1wiXSBhcyBjb25zdDtcbiIsICIvLyBzcmMvc3RhcnQtZ2F0ZS50c1xuZXhwb3J0IHR5cGUgU3RhcnRHYXRlT3B0aW9ucyA9IHtcbiAgbGFiZWw/OiBzdHJpbmc7XG4gIHJlcXVlc3RGdWxsc2NyZWVuPzogYm9vbGVhbjtcbiAgcmVzdW1lQXVkaW8/OiAoKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZDsgLy8gZS5nLiwgZnJvbSBzdG9yeS9zZngudHNcbn07XG5cbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJsc2Q6bXV0ZWRcIjtcblxuLy8gSGVscGVyOiBnZXQgdGhlIHNoYXJlZCBBdWRpb0NvbnRleHQgeW91IGV4cG9zZSBzb21ld2hlcmUgaW4geW91ciBhdWRpbyBlbmdpbmU6XG4vLyAgICh3aW5kb3cgYXMgYW55KS5MU0RfQVVESU9fQ1RYID0gY3R4O1xuZnVuY3Rpb24gZ2V0Q3R4KCk6IEF1ZGlvQ29udGV4dCB8IG51bGwge1xuICBjb25zdCBBQyA9ICh3aW5kb3cgYXMgYW55KS5BdWRpb0NvbnRleHQgfHwgKHdpbmRvdyBhcyBhbnkpLndlYmtpdEF1ZGlvQ29udGV4dDtcbiAgY29uc3QgY3R4ID0gKHdpbmRvdyBhcyBhbnkpLkxTRF9BVURJT19DVFg7XG4gIHJldHVybiBjdHggaW5zdGFuY2VvZiBBQyA/IGN0eCBhcyBBdWRpb0NvbnRleHQgOiBudWxsO1xufVxuXG5jbGFzcyBNdXRlTWFuYWdlciB7XG4gIHByaXZhdGUgYnV0dG9uczogSFRNTEJ1dHRvbkVsZW1lbnRbXSA9IFtdO1xuICBwcml2YXRlIGVuZm9yY2luZyA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIC8vIGtlZXAgVUkgaW4gc3luYyBpZiBzb21lb25lIGVsc2UgdG9nZ2xlc1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJsc2Q6bXV0ZUNoYW5nZWRcIiwgKGU6IGFueSkgPT4ge1xuICAgICAgY29uc3QgbXV0ZWQgPSAhIWU/LmRldGFpbD8ubXV0ZWQ7XG4gICAgICB0aGlzLmFwcGx5VUkobXV0ZWQpO1xuICAgIH0pO1xuICB9XG5cbiAgaXNNdXRlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9LRVkpID09PSBcIjFcIjtcbiAgfVxuXG4gIHByaXZhdGUgc2F2ZShtdXRlZDogYm9vbGVhbikge1xuICAgIHRyeSB7IGxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBtdXRlZCA/IFwiMVwiIDogXCIwXCIpOyB9IGNhdGNoIHt9XG4gIH1cblxuICBwcml2YXRlIGxhYmVsKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQsIG11dGVkOiBib29sZWFuKSB7XG4gICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtcHJlc3NlZFwiLCBTdHJpbmcobXV0ZWQpKTtcbiAgICBidG4udGl0bGUgPSBtdXRlZCA/IFwiVW5tdXRlIChNKVwiIDogXCJNdXRlIChNKVwiO1xuICAgIGJ0bi50ZXh0Q29udGVudCA9IG11dGVkID8gXCJcdUQ4M0RcdUREMDggVW5tdXRlXCIgOiBcIlx1RDgzRFx1REQwNyBNdXRlXCI7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5VUkobXV0ZWQ6IGJvb2xlYW4pIHtcbiAgICB0aGlzLmJ1dHRvbnMuZm9yRWFjaChiID0+IHRoaXMubGFiZWwoYiwgbXV0ZWQpKTtcbiAgfVxuXG4gIGF0dGFjaEJ1dHRvbihidG46IEhUTUxCdXR0b25FbGVtZW50KSB7XG4gICAgdGhpcy5idXR0b25zLnB1c2goYnRuKTtcbiAgICB0aGlzLmxhYmVsKGJ0biwgdGhpcy5pc011dGVkKCkpO1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy50b2dnbGUoKSk7XG4gIH1cblxuICBhc3luYyBzZXRNdXRlZChtdXRlZDogYm9vbGVhbikge1xuICAgIHRoaXMuc2F2ZShtdXRlZCk7XG4gICAgdGhpcy5hcHBseVVJKG11dGVkKTtcblxuICAgIGNvbnN0IGN0eCA9IGdldEN0eCgpO1xuICAgIGlmIChjdHgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChtdXRlZCAmJiBjdHguc3RhdGUgIT09IFwic3VzcGVuZGVkXCIpIHtcbiAgICAgICAgICBhd2FpdCBjdHguc3VzcGVuZCgpO1xuICAgICAgICB9IGVsc2UgaWYgKCFtdXRlZCAmJiBjdHguc3RhdGUgIT09IFwicnVubmluZ1wiKSB7XG4gICAgICAgICAgYXdhaXQgY3R4LnJlc3VtZSgpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIlthdWRpb10gbXV0ZSB0b2dnbGUgZmFpbGVkOlwiLCBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBkb2N1bWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudChcImxzZDptdXRlQ2hhbmdlZFwiLCB7IGRldGFpbDogeyBtdXRlZCB9IH0pKTtcbiAgfVxuXG4gIHRvZ2dsZSgpIHtcbiAgICB0aGlzLnNldE11dGVkKCF0aGlzLmlzTXV0ZWQoKSk7XG4gIH1cblxuICAvLyBJZiBjdHggaXNuJ3QgY3JlYXRlZCB1bnRpbCBhZnRlciBTdGFydCwgZW5mb3JjZSBwZXJzaXN0ZWQgc3RhdGUgb25jZSBhdmFpbGFibGVcbiAgZW5mb3JjZU9uY2VXaGVuUmVhZHkoKSB7XG4gICAgaWYgKHRoaXMuZW5mb3JjaW5nKSByZXR1cm47XG4gICAgdGhpcy5lbmZvcmNpbmcgPSB0cnVlO1xuICAgIGNvbnN0IHRpY2sgPSAoKSA9PiB7XG4gICAgICBjb25zdCBjdHggPSBnZXRDdHgoKTtcbiAgICAgIGlmICghY3R4KSB7IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTsgcmV0dXJuOyB9XG4gICAgICB0aGlzLnNldE11dGVkKHRoaXMuaXNNdXRlZCgpKTtcbiAgICB9O1xuICAgIHRpY2soKTtcbiAgfVxufVxuXG5jb25zdCBtdXRlTWdyID0gbmV3IE11dGVNYW5hZ2VyKCk7XG5cbi8vIEluc3RhbGwgYSBtdXRlIGJ1dHRvbiBpbiB0aGUgdG9wIGZyYW1lIChyaWdodCBzaWRlKSBpZiBwb3NzaWJsZS5cbmZ1bmN0aW9uIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpIHtcbiAgY29uc3QgdG9wUmlnaHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRvcC1yaWdodFwiKTtcbiAgaWYgKCF0b3BSaWdodCkgcmV0dXJuO1xuXG4gIC8vIEF2b2lkIGR1cGxpY2F0ZXNcbiAgaWYgKHRvcFJpZ2h0LnF1ZXJ5U2VsZWN0b3IoXCIjbXV0ZS10b3BcIikpIHJldHVybjtcblxuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4uaWQgPSBcIm11dGUtdG9wXCI7XG4gIGJ0bi5jbGFzc05hbWUgPSBcImdob3N0LWJ0biBzbWFsbFwiO1xuICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFwiZmFsc2VcIik7XG4gIGJ0bi50aXRsZSA9IFwiTXV0ZSAoTSlcIjtcbiAgYnRuLnRleHRDb250ZW50ID0gXCJcdUQ4M0RcdUREMDcgTXV0ZVwiO1xuICB0b3BSaWdodC5hcHBlbmRDaGlsZChidG4pO1xuICBtdXRlTWdyLmF0dGFjaEJ1dHRvbihidG4pO1xufVxuXG4vLyBHbG9iYWwga2V5Ym9hcmQgc2hvcnRjdXQgKE0pXG4oZnVuY3Rpb24gaW5zdGFsbE11dGVIb3RrZXkoKSB7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xuICAgIGlmIChlLmtleT8udG9Mb3dlckNhc2UoKSA9PT0gXCJtXCIpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIG11dGVNZ3IudG9nZ2xlKCk7XG4gICAgfVxuICB9KTtcbn0pKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB3YWl0Rm9yVXNlclN0YXJ0KG9wdHM6IFN0YXJ0R2F0ZU9wdGlvbnMgPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB7IGxhYmVsID0gXCJTdGFydCBHYW1lXCIsIHJlcXVlc3RGdWxsc2NyZWVuID0gZmFsc2UsIHJlc3VtZUF1ZGlvIH0gPSBvcHRzO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIC8vIG92ZXJsYXlcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBvdmVybGF5LmlkID0gXCJzdGFydC1vdmVybGF5XCI7XG4gICAgb3ZlcmxheS5pbm5lckhUTUwgPSBgXG4gICAgICA8ZGl2IGlkPVwic3RhcnQtY29udGFpbmVyXCI+XG4gICAgICAgIDxidXR0b24gaWQ9XCJzdGFydC1idG5cIiBhcmlhLWxhYmVsPVwiJHtsYWJlbH1cIj4ke2xhYmVsfTwvYnV0dG9uPlxuICAgICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luLXRvcDoxMHB4XCI+XG4gICAgICAgICAgPGJ1dHRvbiBpZD1cIm11dGUtYmVsb3ctc3RhcnRcIiBjbGFzcz1cImdob3N0LWJ0blwiIGFyaWEtcHJlc3NlZD1cImZhbHNlXCIgdGl0bGU9XCJNdXRlIChNKVwiPlx1RDgzRFx1REQwNyBNdXRlPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8cD4gT24gbW9iaWxlIHR1cm4gcGhvbmUgdG8gbGFuZHNjYXBlIGZvciBiZXN0IGV4cGVyaWVuY2UuIDwvcD5cbiAgICAgIDwvZGl2PlxuICAgIGA7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuICAgIC8vIHN0eWxlcyAobW92ZSB0byBDU1MgbGF0ZXIgaWYgeW91IHdhbnQpXG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgICAjc3RhcnQtb3ZlcmxheSB7XG4gICAgICAgIHBvc2l0aW9uOiBmaXhlZDsgaW5zZXQ6IDA7IGRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBiYWNrZ3JvdW5kOiByYWRpYWwtZ3JhZGllbnQoY2lyY2xlIGF0IGNlbnRlciwgcmdiYSgwLDAsMCwwLjYpLCByZ2JhKDAsMCwwLDAuOSkpO1xuICAgICAgICB6LWluZGV4OiA5OTk5O1xuICAgICAgfVxuICAgICAgI3N0YXJ0LWNvbnRhaW5lciB7IHRleHQtYWxpZ246IGNlbnRlcjsgfVxuICAgICAgI3N0YXJ0LWJ0biB7XG4gICAgICAgIGZvbnQtc2l6ZTogMnJlbTsgcGFkZGluZzogMXJlbSAyLjVyZW07IGJvcmRlcjogMnB4IHNvbGlkICNmZmY7IGJvcmRlci1yYWRpdXM6IDEwcHg7XG4gICAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyBjb2xvcjogI2ZmZjsgY3Vyc29yOiBwb2ludGVyOyB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gLjEycyBlYXNlLCBiYWNrZ3JvdW5kIC4ycyBlYXNlLCBjb2xvciAuMnMgZWFzZTtcbiAgICAgIH1cbiAgICAgICNzdGFydC1idG46aG92ZXIgeyBiYWNrZ3JvdW5kOiAjZmZmOyBjb2xvcjogIzAwMDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0xcHgpOyB9XG4gICAgICAjc3RhcnQtYnRuOmFjdGl2ZSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwKTsgfVxuICAgICAgI211dGUtYmVsb3ctc3RhcnQge1xuICAgICAgICBmb250LXNpemU6IDFyZW07IHBhZGRpbmc6IC41cmVtIDFyZW07IGJvcmRlci1yYWRpdXM6IDk5OXB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE0OCwgMTYzLCAxODQsIDAuMzUpO1xuICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMwLCA0MSwgNTksIDAuNzIpOyBjb2xvcjogI2Y4ZmFmYztcbiAgICAgIH1cbiAgICAgIC5naG9zdC1idG4uc21hbGwgeyBwYWRkaW5nOiA0cHggOHB4OyBmb250LXNpemU6IDExcHg7IH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXG4gICAgLy8gV2lyZSBvdmVybGF5IGJ1dHRvbnNcbiAgICBjb25zdCBzdGFydEJ0biA9IG92ZXJsYXkucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXCIjc3RhcnQtYnRuXCIpITtcbiAgICBjb25zdCBtdXRlQmVsb3dTdGFydCA9IG92ZXJsYXkucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXCIjbXV0ZS1iZWxvdy1zdGFydFwiKSE7XG4gICAgY29uc3QgdG9wTXV0ZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibXV0ZS10b3BcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xuICAgIGlmICh0b3BNdXRlKSBtdXRlTWdyLmF0dGFjaEJ1dHRvbih0b3BNdXRlKTtcbiAgICBtdXRlTWdyLmF0dGFjaEJ1dHRvbihtdXRlQmVsb3dTdGFydCk7XG5cbiAgICAvLyByZXN0b3JlIHBlcnNpc3RlZCBtdXRlIGxhYmVsIGltbWVkaWF0ZWx5XG4gICAgbXV0ZU1nci5lbmZvcmNlT25jZVdoZW5SZWFkeSgpO1xuXG4gICAgY29uc3Qgc3RhcnQgPSBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBhdWRpbyBmaXJzdCAodXNlciBnZXN0dXJlKVxuICAgICAgdHJ5IHsgYXdhaXQgcmVzdW1lQXVkaW8/LigpOyB9IGNhdGNoIHt9XG5cbiAgICAgIC8vIHJlc3BlY3QgcGVyc2lzdGVkIG11dGUgc3RhdGUgbm93IHRoYXQgY3R4IGxpa2VseSBleGlzdHNcbiAgICAgIG11dGVNZ3IuZW5mb3JjZU9uY2VXaGVuUmVhZHkoKTtcblxuICAgICAgLy8gb3B0aW9uYWwgZnVsbHNjcmVlblxuICAgICAgaWYgKHJlcXVlc3RGdWxsc2NyZWVuKSB7XG4gICAgICAgIHRyeSB7IGF3YWl0IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5yZXF1ZXN0RnVsbHNjcmVlbj8uKCk7IH0gY2F0Y2gge31cbiAgICAgIH1cblxuICAgICAgLy8gY2xlYW51cCBvdmVybGF5XG4gICAgICBzdHlsZS5yZW1vdmUoKTtcbiAgICAgIG92ZXJsYXkucmVtb3ZlKCk7XG5cbiAgICAgIC8vIGVuc3VyZSB0b3AtZnJhbWUgbXV0ZSBidXR0b24gZXhpc3RzIGFmdGVyIG92ZXJsYXlcbiAgICAgIGVuc3VyZVRvcEZyYW1lTXV0ZUJ1dHRvbigpO1xuXG4gICAgICByZXNvbHZlKCk7XG4gICAgfTtcblxuICAgIC8vIHN0YXJ0IGJ1dHRvblxuICAgIHN0YXJ0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGFydCwgeyBvbmNlOiB0cnVlIH0pO1xuXG4gICAgLy8gQWNjZXNzaWJpbGl0eTogYWxsb3cgRW50ZXIgLyBTcGFjZVxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHtcbiAgICAgIGlmIChlLmtleSA9PT0gXCJFbnRlclwiIHx8IGUua2V5ID09PSBcIiBcIikge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHN0YXJ0KCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBGb2N1cyBmb3Iga2V5Ym9hcmQgdXNlcnNcbiAgICBzdGFydEJ0bi50YWJJbmRleCA9IDA7XG4gICAgc3RhcnRCdG4uZm9jdXMoKTtcblxuICAgIC8vIEFsc28gdHJ5IHRvIGNyZWF0ZSB0aGUgdG9wLWZyYW1lIG11dGUgaW1tZWRpYXRlbHkgaWYgRE9NIGlzIHJlYWR5XG4gICAgLy8gKElmICN0b3AtcmlnaHQgaXNuJ3QgdGhlcmUgeWV0LCBpdCdzIGhhcm1sZXNzOyB3ZSdsbCBhZGQgaXQgYWZ0ZXIgc3RhcnQgdG9vLilcbiAgICBlbnN1cmVUb3BGcmFtZU11dGVCdXR0b24oKTtcbiAgfSk7XG59XG4iLCAiaW1wb3J0IHsgbWFrZVBSTkcgfSBmcm9tIFwiLi4vLi4vZW5naW5lXCI7XG5cbmV4cG9ydCB0eXBlIEFtYmllbnRQYXJhbXMgPSB7XG4gIGludGVuc2l0eTogbnVtYmVyOyAgLy8gb3ZlcmFsbCBsb3VkbmVzcyAvIGVuZXJneSAoMC4uMSlcbiAgYnJpZ2h0bmVzczogbnVtYmVyOyAvLyBmaWx0ZXIgb3Blbm5lc3MgJiBjaG9yZCB0aW1icmUgKDAuLjEpXG4gIGRlbnNpdHk6IG51bWJlcjsgICAgLy8gY2hvcmQgc3Bhd24gcmF0ZSAvIHRoaWNrbmVzcyAoMC4uMSlcbn07XG5cbnR5cGUgTW9kZU5hbWUgPSBcIklvbmlhblwiIHwgXCJEb3JpYW5cIiB8IFwiUGhyeWdpYW5cIiB8IFwiTHlkaWFuXCIgfCBcIk1peG9seWRpYW5cIiB8IFwiQWVvbGlhblwiIHwgXCJMb2NyaWFuXCI7XG5cbmNvbnN0IE1PREVTOiBSZWNvcmQ8TW9kZU5hbWUsIG51bWJlcltdPiA9IHtcbiAgSW9uaWFuOiAgICAgWzAsMiw0LDUsNyw5LDExXSxcbiAgRG9yaWFuOiAgICAgWzAsMiwzLDUsNyw5LDEwXSxcbiAgUGhyeWdpYW46ICAgWzAsMSwzLDUsNyw4LDEwXSxcbiAgTHlkaWFuOiAgICAgWzAsMiw0LDYsNyw5LDExXSxcbiAgTWl4b2x5ZGlhbjogWzAsMiw0LDUsNyw5LDEwXSxcbiAgQWVvbGlhbjogICAgWzAsMiwzLDUsNyw4LDEwXSxcbiAgTG9jcmlhbjogICAgWzAsMSwzLDUsNiw4LDEwXSxcbn07XG5cbi8vIE11c2ljYWwgY29uc3RhbnRzIHR1bmVkIHRvIG1hdGNoIHRoZSBIVE1MIHZlcnNpb25cbmNvbnN0IFJPT1RfTUFYX0dBSU4gICAgID0gMC4zMztcbmNvbnN0IFJPT1RfU1dFTExfVElNRSAgID0gMjA7XG5jb25zdCBEUk9ORV9TSElGVF9NSU5fUyA9IDI0O1xuY29uc3QgRFJPTkVfU0hJRlRfTUFYX1MgPSA0ODtcbmNvbnN0IERST05FX0dMSURFX01JTl9TID0gODtcbmNvbnN0IERST05FX0dMSURFX01BWF9TID0gMTU7XG5cbmNvbnN0IENIT1JEX1ZPSUNFU19NQVggID0gNTtcbmNvbnN0IENIT1JEX0ZBREVfTUlOX1MgID0gODtcbmNvbnN0IENIT1JEX0ZBREVfTUFYX1MgID0gMTY7XG5jb25zdCBDSE9SRF9IT0xEX01JTl9TICA9IDEwO1xuY29uc3QgQ0hPUkRfSE9MRF9NQVhfUyAgPSAyMjtcbmNvbnN0IENIT1JEX0dBUF9NSU5fUyAgID0gNDtcbmNvbnN0IENIT1JEX0dBUF9NQVhfUyAgID0gOTtcbmNvbnN0IENIT1JEX0FOQ0hPUl9QUk9CID0gMC42OyAvLyBwcmVmZXIgYWxpZ25pbmcgY2hvcmQgcm9vdCB0byBkcm9uZVxuXG5jb25zdCBGSUxURVJfQkFTRV9IWiAgICA9IDIyMDtcbmNvbnN0IEZJTFRFUl9QRUFLX0haICAgID0gNDIwMDtcbmNvbnN0IFNXRUVQX1NFR19TICAgICAgID0gMzA7ICAvLyB1cCB0aGVuIGRvd24sIHZlcnkgc2xvd1xuY29uc3QgTEZPX1JBVEVfSFogICAgICAgPSAwLjA1O1xuY29uc3QgTEZPX0RFUFRIX0haICAgICAgPSA5MDA7XG5cbmNvbnN0IERFTEFZX1RJTUVfUyAgICAgID0gMC40NTtcbmNvbnN0IEZFRURCQUNLX0dBSU4gICAgID0gMC4zNTtcbmNvbnN0IFdFVF9NSVggICAgICAgICAgID0gMC4yODtcblxuLy8gZGVncmVlIHByZWZlcmVuY2UgZm9yIGRyb25lIG1vdmVzOiAxLDUsMyw2LDIsNCw3IChpbmRleGVzIDAuLjYpXG5jb25zdCBQUkVGRVJSRURfREVHUkVFX09SREVSID0gWzAsNCwyLDUsMSwzLDZdO1xuXG4vKiogVXRpbGl0eSAqL1xuY29uc3QgY2xhbXAwMSA9ICh4OiBudW1iZXIpID0+IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIHgpKTtcbmNvbnN0IHJhbmQgPSAocm5nOiAoKSA9PiBudW1iZXIsIGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBhICsgcm5nKCkgKiAoYiAtIGEpO1xuY29uc3QgY2hvaWNlID0gPFQsPihybmc6ICgpID0+IG51bWJlciwgYXJyOiBUW10pID0+IGFycltNYXRoLmZsb29yKHJuZygpICogYXJyLmxlbmd0aCldO1xuXG5jb25zdCBtaWRpVG9GcmVxID0gKG06IG51bWJlcikgPT4gNDQwICogTWF0aC5wb3coMiwgKG0gLSA2OSkgLyAxMik7XG5cbi8qKiBBIHNpbmdsZSBzdGVhZHkgb3NjaWxsYXRvciB2b2ljZSB3aXRoIHNoaW1tZXIgZGV0dW5lIGFuZCBnYWluIGVudmVsb3BlLiAqL1xuY2xhc3MgVm9pY2Uge1xuICBwcml2YXRlIGtpbGxlZCA9IGZhbHNlO1xuICBwcml2YXRlIHNoaW1tZXI6IE9zY2lsbGF0b3JOb2RlO1xuICBwcml2YXRlIHNoaW1tZXJHYWluOiBHYWluTm9kZTtcbiAgcHJpdmF0ZSBzY2FsZTogR2Fpbk5vZGU7XG4gIHB1YmxpYyBnOiBHYWluTm9kZTtcbiAgcHVibGljIG9zYzogT3NjaWxsYXRvck5vZGU7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgICBwcml2YXRlIHRhcmdldEdhaW46IG51bWJlcixcbiAgICB3YXZlZm9ybTogT3NjaWxsYXRvclR5cGUsXG4gICAgZnJlcUh6OiBudW1iZXIsXG4gICAgZGVzdGluYXRpb246IEF1ZGlvTm9kZSxcbiAgICBybmc6ICgpID0+IG51bWJlclxuICApe1xuICAgIHRoaXMub3NjID0gbmV3IE9zY2lsbGF0b3JOb2RlKGN0eCwgeyB0eXBlOiB3YXZlZm9ybSwgZnJlcXVlbmN5OiBmcmVxSHogfSk7XG5cbiAgICAvLyBzdWJ0bGUgc2hpbW1lciB2aWEgZGV0dW5lIG1vZHVsYXRpb25cbiAgICB0aGlzLnNoaW1tZXIgPSBuZXcgT3NjaWxsYXRvck5vZGUoY3R4LCB7IHR5cGU6IFwic2luZVwiLCBmcmVxdWVuY3k6IHJhbmQocm5nLCAwLjA2LCAwLjE4KSB9KTtcbiAgICB0aGlzLnNoaW1tZXJHYWluID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiByYW5kKHJuZywgMC40LCAxLjIpIH0pO1xuICAgIHRoaXMuc2NhbGUgPSBuZXcgR2Fpbk5vZGUoY3R4LCB7IGdhaW46IDI1IH0pOyAvLyBjZW50cyByYW5nZVxuICAgIHRoaXMuc2hpbW1lci5jb25uZWN0KHRoaXMuc2hpbW1lckdhaW4pLmNvbm5lY3QodGhpcy5zY2FsZSkuY29ubmVjdCh0aGlzLm9zYy5kZXR1bmUpO1xuXG4gICAgdGhpcy5nID0gbmV3IEdhaW5Ob2RlKGN0eCwgeyBnYWluOiAwIH0pO1xuICAgIHRoaXMub3NjLmNvbm5lY3QodGhpcy5nKS5jb25uZWN0KGRlc3RpbmF0aW9uKTtcblxuICAgIHRoaXMub3NjLnN0YXJ0KCk7XG4gICAgdGhpcy5zaGltbWVyLnN0YXJ0KCk7XG4gIH1cblxuICBmYWRlSW4oc2Vjb25kczogbnVtYmVyKSB7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgdGhpcy5nLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgdGhpcy5nLmdhaW4uc2V0VmFsdWVBdFRpbWUodGhpcy5nLmdhaW4udmFsdWUsIG5vdyk7XG4gICAgdGhpcy5nLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodGhpcy50YXJnZXRHYWluLCBub3cgKyBzZWNvbmRzKTtcbiAgfVxuXG4gIGZhZGVPdXRLaWxsKHNlY29uZHM6IG51bWJlcikge1xuICAgIGlmICh0aGlzLmtpbGxlZCkgcmV0dXJuO1xuICAgIHRoaXMua2lsbGVkID0gdHJ1ZTtcbiAgICBjb25zdCBub3cgPSB0aGlzLmN0eC5jdXJyZW50VGltZTtcbiAgICB0aGlzLmcuZ2Fpbi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5zZXRWYWx1ZUF0VGltZSh0aGlzLmcuZ2Fpbi52YWx1ZSwgbm93KTtcbiAgICB0aGlzLmcuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLjAwMDEsIG5vdyArIHNlY29uZHMpO1xuICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5zdG9wKCksIHNlY29uZHMgKiAxMDAwICsgNjApO1xuICB9XG5cbiAgc2V0RnJlcUdsaWRlKHRhcmdldEh6OiBudW1iZXIsIGdsaWRlU2Vjb25kczogbnVtYmVyKSB7XG4gICAgY29uc3Qgbm93ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgLy8gZXhwb25lbnRpYWwgd2hlbiBwb3NzaWJsZSBmb3Igc21vb3RobmVzc1xuICAgIGNvbnN0IGN1cnJlbnQgPSBNYXRoLm1heCgwLjAwMDEsIHRoaXMub3NjLmZyZXF1ZW5jeS52YWx1ZSk7XG4gICAgdGhpcy5vc2MuZnJlcXVlbmN5LmNhbmNlbFNjaGVkdWxlZFZhbHVlcyhub3cpO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLm9zYy5mcmVxdWVuY3kuc2V0VmFsdWVBdFRpbWUoY3VycmVudCwgbm93KTtcbiAgICAgIHRoaXMub3NjLmZyZXF1ZW5jeS5leHBvbmVudGlhbFJhbXBUb1ZhbHVlQXRUaW1lKHRhcmdldEh6LCBub3cgKyBnbGlkZVNlY29uZHMpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgdGhpcy5vc2MuZnJlcXVlbmN5LmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKHRhcmdldEh6LCBub3cgKyBnbGlkZVNlY29uZHMpO1xuICAgIH1cbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgdHJ5IHsgdGhpcy5vc2Muc3RvcCgpOyB0aGlzLnNoaW1tZXIuc3RvcCgpOyB9IGNhdGNoIHt9XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMub3NjLmRpc2Nvbm5lY3QoKTsgdGhpcy5zaGltbWVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHRoaXMuZy5kaXNjb25uZWN0KCk7IHRoaXMuc2hpbW1lckdhaW4uZGlzY29ubmVjdCgpOyB0aGlzLnNjYWxlLmRpc2Nvbm5lY3QoKTtcbiAgICB9IGNhdGNoIHt9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEFtYmllbnRTY2VuZSB7XG4gIHByaXZhdGUgcnVubmluZyA9IGZhbHNlO1xuICBwcml2YXRlIHN0b3BGbnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG4gIHByaXZhdGUgdGltZW91dHM6IG51bWJlcltdID0gW107XG5cbiAgcHJpdmF0ZSBwYXJhbXM6IEFtYmllbnRQYXJhbXMgPSB7IGludGVuc2l0eTogMC43NSwgYnJpZ2h0bmVzczogMC41LCBkZW5zaXR5OiAwLjYgfTtcblxuICBwcml2YXRlIHJuZzogKCkgPT4gbnVtYmVyO1xuICBwcml2YXRlIG1hc3RlciE6IEdhaW5Ob2RlO1xuICBwcml2YXRlIGZpbHRlciE6IEJpcXVhZEZpbHRlck5vZGU7XG4gIHByaXZhdGUgZHJ5ITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgd2V0ITogR2Fpbk5vZGU7XG4gIHByaXZhdGUgZGVsYXkhOiBEZWxheU5vZGU7XG4gIHByaXZhdGUgZmVlZGJhY2shOiBHYWluTm9kZTtcblxuICBwcml2YXRlIGxmb05vZGU/OiBPc2NpbGxhdG9yTm9kZTtcbiAgcHJpdmF0ZSBsZm9HYWluPzogR2Fpbk5vZGU7XG5cbiAgLy8gbXVzaWNhbCBzdGF0ZVxuICBwcml2YXRlIGtleVJvb3RNaWRpID0gNDM7XG4gIHByaXZhdGUgbW9kZTogTW9kZU5hbWUgPSBcIklvbmlhblwiO1xuICBwcml2YXRlIGRyb25lRGVncmVlSWR4ID0gMDtcbiAgcHJpdmF0ZSByb290Vm9pY2U6IFZvaWNlIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBjdHg6IEF1ZGlvQ29udGV4dCxcbiAgICBwcml2YXRlIG91dDogR2Fpbk5vZGUsXG4gICAgc2VlZCA9IDFcbiAgKSB7XG4gICAgdGhpcy5ybmcgPSBtYWtlUFJORyhzZWVkKTtcbiAgfVxuXG4gIHNldFBhcmFtPEsgZXh0ZW5kcyBrZXlvZiBBbWJpZW50UGFyYW1zPihrOiBLLCB2OiBBbWJpZW50UGFyYW1zW0tdKSB7XG4gICAgdGhpcy5wYXJhbXNba10gPSBjbGFtcDAxKHYpO1xuICAgIGlmICh0aGlzLnJ1bm5pbmcgJiYgayA9PT0gXCJpbnRlbnNpdHlcIiAmJiB0aGlzLm1hc3Rlcikge1xuICAgICAgdGhpcy5tYXN0ZXIuZ2Fpbi52YWx1ZSA9IDAuMTUgKyAwLjg1ICogdGhpcy5wYXJhbXMuaW50ZW5zaXR5OyBcbiAgICB9XG4gIH1cblxuICBzdGFydCgpIHtcbiAgICBpZiAodGhpcy5ydW5uaW5nKSByZXR1cm47XG4gICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcblxuICAgIC8vIC0tLS0gQ29yZSBncmFwaCAoZmlsdGVyIC0+IGRyeStkZWxheSAtPiBtYXN0ZXIgLT4gb3V0KSAtLS0tXG4gICAgdGhpcy5tYXN0ZXIgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogMC4xNSArIDAuODUgKiB0aGlzLnBhcmFtcy5pbnRlbnNpdHkgfSk7XG4gICAgdGhpcy5maWx0ZXIgPSBuZXcgQmlxdWFkRmlsdGVyTm9kZSh0aGlzLmN0eCwgeyB0eXBlOiBcImxvd3Bhc3NcIiwgUTogMC43MDcgfSk7XG4gICAgdGhpcy5kcnkgPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogMSB9KTtcbiAgICB0aGlzLndldCA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBXRVRfTUlYIH0pO1xuICAgIHRoaXMuZGVsYXkgPSBuZXcgRGVsYXlOb2RlKHRoaXMuY3R4LCB7IGRlbGF5VGltZTogREVMQVlfVElNRV9TLCBtYXhEZWxheVRpbWU6IDIgfSk7XG4gICAgdGhpcy5mZWVkYmFjayA9IG5ldyBHYWluTm9kZSh0aGlzLmN0eCwgeyBnYWluOiBGRUVEQkFDS19HQUlOIH0pO1xuXG4gICAgdGhpcy5maWx0ZXIuY29ubmVjdCh0aGlzLmRyeSkuY29ubmVjdCh0aGlzLm1hc3Rlcik7XG4gICAgdGhpcy5maWx0ZXIuY29ubmVjdCh0aGlzLmRlbGF5KTtcbiAgICB0aGlzLmRlbGF5LmNvbm5lY3QodGhpcy5mZWVkYmFjaykuY29ubmVjdCh0aGlzLmRlbGF5KTtcbiAgICB0aGlzLmRlbGF5LmNvbm5lY3QodGhpcy53ZXQpLmNvbm5lY3QodGhpcy5tYXN0ZXIpO1xuICAgIHRoaXMubWFzdGVyLmNvbm5lY3QodGhpcy5vdXQpO1xuXG4gICAgLy8gLS0tLSBGaWx0ZXIgYmFzZWxpbmUgKyBzbG93IHN3ZWVwcyAtLS0tXG4gICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFZhbHVlQXRUaW1lKEZJTFRFUl9CQVNFX0haLCB0aGlzLmN0eC5jdXJyZW50VGltZSk7XG4gICAgY29uc3Qgc3dlZXAgPSAoKSA9PiB7XG4gICAgICBjb25zdCB0ID0gdGhpcy5jdHguY3VycmVudFRpbWU7XG4gICAgICB0aGlzLmZpbHRlci5mcmVxdWVuY3kuY2FuY2VsU2NoZWR1bGVkVmFsdWVzKHQpO1xuICAgICAgLy8gdXAgdGhlbiBkb3duIHVzaW5nIHZlcnkgc2xvdyB0aW1lIGNvbnN0YW50c1xuICAgICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnNldFRhcmdldEF0VGltZShcbiAgICAgICAgRklMVEVSX0JBU0VfSFogKyAoRklMVEVSX1BFQUtfSFogLSBGSUxURVJfQkFTRV9IWikgKiAoMC40ICsgMC42ICogdGhpcy5wYXJhbXMuYnJpZ2h0bmVzcyksXG4gICAgICAgIHQsIFNXRUVQX1NFR19TIC8gM1xuICAgICAgKTtcbiAgICAgIHRoaXMuZmlsdGVyLmZyZXF1ZW5jeS5zZXRUYXJnZXRBdFRpbWUoXG4gICAgICAgIEZJTFRFUl9CQVNFX0haICogKDAuNyArIDAuMyAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpLFxuICAgICAgICB0ICsgU1dFRVBfU0VHX1MsIFNXRUVQX1NFR19TIC8gM1xuICAgICAgKTtcbiAgICAgIHRoaXMudGltZW91dHMucHVzaCh3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB0aGlzLnJ1bm5pbmcgJiYgc3dlZXAoKSwgKFNXRUVQX1NFR19TICogMikgKiAxMDAwKSBhcyB1bmtub3duIGFzIG51bWJlcik7XG4gICAgfTtcbiAgICBzd2VlcCgpO1xuXG4gICAgLy8gLS0tLSBHZW50bGUgTEZPIG9uIGZpbHRlciBmcmVxIChzbWFsbCBkZXB0aCkgLS0tLVxuICAgIHRoaXMubGZvTm9kZSA9IG5ldyBPc2NpbGxhdG9yTm9kZSh0aGlzLmN0eCwgeyB0eXBlOiBcInNpbmVcIiwgZnJlcXVlbmN5OiBMRk9fUkFURV9IWiB9KTtcbiAgICB0aGlzLmxmb0dhaW4gPSBuZXcgR2Fpbk5vZGUodGhpcy5jdHgsIHsgZ2FpbjogTEZPX0RFUFRIX0haICogKDAuNSArIDAuNSAqIHRoaXMucGFyYW1zLmJyaWdodG5lc3MpIH0pO1xuICAgIHRoaXMubGZvTm9kZS5jb25uZWN0KHRoaXMubGZvR2FpbikuY29ubmVjdCh0aGlzLmZpbHRlci5mcmVxdWVuY3kpO1xuICAgIHRoaXMubGZvTm9kZS5zdGFydCgpO1xuXG4gICAgLy8gLS0tLSBTcGF3biByb290IGRyb25lIChnbGlkaW5nIHRvIGRpZmZlcmVudCBkZWdyZWVzKSAtLS0tXG4gICAgdGhpcy5zcGF3blJvb3REcm9uZSgpO1xuICAgIHRoaXMuc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCk7XG5cbiAgICAvLyAtLS0tIENob3JkIGN5Y2xlIGxvb3AgLS0tLVxuICAgIHRoaXMuY2hvcmRDeWNsZSgpO1xuXG4gICAgLy8gY2xlYW51cFxuICAgIHRoaXMuc3RvcEZucy5wdXNoKCgpID0+IHtcbiAgICAgIHRyeSB7IHRoaXMubGZvTm9kZT8uc3RvcCgpOyB9IGNhdGNoIHt9XG4gICAgICBbdGhpcy5tYXN0ZXIsIHRoaXMuZmlsdGVyLCB0aGlzLmRyeSwgdGhpcy53ZXQsIHRoaXMuZGVsYXksIHRoaXMuZmVlZGJhY2ssIHRoaXMubGZvTm9kZSwgdGhpcy5sZm9HYWluXVxuICAgICAgICAuZm9yRWFjaChuID0+IHsgdHJ5IHsgbj8uZGlzY29ubmVjdCgpOyB9IGNhdGNoIHt9IH0pO1xuICAgIH0pO1xuICB9XG5cbiAgc3RvcCgpIHtcbiAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xuXG4gICAgLy8gY2FuY2VsIHRpbWVvdXRzXG4gICAgdGhpcy50aW1lb3V0cy5zcGxpY2UoMCkuZm9yRWFjaChpZCA9PiB3aW5kb3cuY2xlYXJUaW1lb3V0KGlkKSk7XG5cbiAgICAvLyBmYWRlIGFuZCBjbGVhbnVwIHZvaWNlc1xuICAgIGlmICh0aGlzLnJvb3RWb2ljZSkgdGhpcy5yb290Vm9pY2UuZmFkZU91dEtpbGwoMS4yKTtcblxuICAgIC8vIHJ1biBkZWZlcnJlZCBzdG9wc1xuICAgIHRoaXMuc3RvcEZucy5zcGxpY2UoMCkuZm9yRWFjaChmbiA9PiBmbigpKTtcbiAgfVxuXG4gIC8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gTXVzaWNhbCBlbmdpbmUgYmVsb3cgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSAqL1xuXG4gIHByaXZhdGUgY3VycmVudERlZ3JlZXMoKTogbnVtYmVyW10ge1xuICAgIHJldHVybiBNT0RFU1t0aGlzLm1vZGVdIHx8IE1PREVTLkx5ZGlhbjtcbiAgfVxuXG4gIC8qKiBEcm9uZSByb290IHZvaWNlICovXG4gIHByaXZhdGUgc3Bhd25Sb290RHJvbmUoKSB7XG4gICAgY29uc3QgYmFzZU1pZGkgPSB0aGlzLmtleVJvb3RNaWRpICsgdGhpcy5jdXJyZW50RGVncmVlcygpW3RoaXMuZHJvbmVEZWdyZWVJZHhdO1xuICAgIGNvbnN0IHYgPSBuZXcgVm9pY2UoXG4gICAgICB0aGlzLmN0eCxcbiAgICAgIFJPT1RfTUFYX0dBSU4sXG4gICAgICBcInNpbmVcIixcbiAgICAgIG1pZGlUb0ZyZXEoYmFzZU1pZGkpLFxuICAgICAgdGhpcy5maWx0ZXIsXG4gICAgICB0aGlzLnJuZ1xuICAgICk7XG4gICAgdi5mYWRlSW4oUk9PVF9TV0VMTF9USU1FKTtcbiAgICB0aGlzLnJvb3RWb2ljZSA9IHY7XG4gIH1cblxuICBwcml2YXRlIHNjaGVkdWxlTmV4dERyb25lTW92ZSgpIHtcbiAgICBpZiAoIXRoaXMucnVubmluZykgcmV0dXJuO1xuICAgIGNvbnN0IHdhaXRNcyA9IHJhbmQodGhpcy5ybmcsIERST05FX1NISUZUX01JTl9TLCBEUk9ORV9TSElGVF9NQVhfUykgKiAxMDAwO1xuICAgIGNvbnN0IGlkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLnJ1bm5pbmcgfHwgIXRoaXMucm9vdFZvaWNlKSByZXR1cm47XG4gICAgICBjb25zdCBnbGlkZSA9IHJhbmQodGhpcy5ybmcsIERST05FX0dMSURFX01JTl9TLCBEUk9ORV9HTElERV9NQVhfUyk7XG4gICAgICBjb25zdCBuZXh0SWR4ID0gdGhpcy5waWNrTmV4dERyb25lRGVncmVlSWR4KCk7XG4gICAgICBjb25zdCB0YXJnZXRNaWRpID0gdGhpcy5rZXlSb290TWlkaSArIHRoaXMuY3VycmVudERlZ3JlZXMoKVtuZXh0SWR4XTtcbiAgICAgIHRoaXMucm9vdFZvaWNlLnNldEZyZXFHbGlkZShtaWRpVG9GcmVxKHRhcmdldE1pZGkpLCBnbGlkZSk7XG4gICAgICB0aGlzLmRyb25lRGVncmVlSWR4ID0gbmV4dElkeDtcbiAgICAgIHRoaXMuc2NoZWR1bGVOZXh0RHJvbmVNb3ZlKCk7XG4gICAgfSwgd2FpdE1zKSBhcyB1bmtub3duIGFzIG51bWJlcjtcbiAgICB0aGlzLnRpbWVvdXRzLnB1c2goaWQpO1xuICB9XG5cbiAgcHJpdmF0ZSBwaWNrTmV4dERyb25lRGVncmVlSWR4KCk6IG51bWJlciB7XG4gICAgY29uc3Qgb3JkZXIgPSBbLi4uUFJFRkVSUkVEX0RFR1JFRV9PUkRFUl07XG4gICAgY29uc3QgaSA9IG9yZGVyLmluZGV4T2YodGhpcy5kcm9uZURlZ3JlZUlkeCk7XG4gICAgaWYgKGkgPj0gMCkgeyBjb25zdCBbY3VyXSA9IG9yZGVyLnNwbGljZShpLCAxKTsgb3JkZXIucHVzaChjdXIpOyB9XG4gICAgcmV0dXJuIGNob2ljZSh0aGlzLnJuZywgb3JkZXIpO1xuICB9XG5cbiAgLyoqIEJ1aWxkIGRpYXRvbmljIHN0YWNrZWQtdGhpcmQgY2hvcmQgZGVncmVlcyB3aXRoIG9wdGlvbmFsIGV4dGVuc2lvbnMgKi9cbiAgcHJpdmF0ZSBidWlsZENob3JkRGVncmVlcyhtb2RlRGVnczogbnVtYmVyW10sIHJvb3RJbmRleDogbnVtYmVyLCBzaXplID0gNCwgYWRkOSA9IGZhbHNlLCBhZGQxMSA9IGZhbHNlLCBhZGQxMyA9IGZhbHNlKSB7XG4gICAgY29uc3Qgc3RlcHMgPSBbMCwgMiwgNCwgNl07IC8vIHRoaXJkcyBvdmVyIDctbm90ZSBzY2FsZVxuICAgIGNvbnN0IGNob3JkSWR4cyA9IHN0ZXBzLnNsaWNlKDAsIE1hdGgubWluKHNpemUsIDQpKS5tYXAocyA9PiAocm9vdEluZGV4ICsgcykgJSA3KTtcbiAgICBpZiAoYWRkOSkgIGNob3JkSWR4cy5wdXNoKChyb290SW5kZXggKyA4KSAlIDcpO1xuICAgIGlmIChhZGQxMSkgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDEwKSAlIDcpO1xuICAgIGlmIChhZGQxMykgY2hvcmRJZHhzLnB1c2goKHJvb3RJbmRleCArIDEyKSAlIDcpO1xuICAgIHJldHVybiBjaG9yZElkeHMubWFwKGkgPT4gbW9kZURlZ3NbaV0pO1xuICB9XG5cbiAgcHJpdmF0ZSAqZW5kbGVzc0Nob3JkcygpIHtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgbW9kZURlZ3MgPSB0aGlzLmN1cnJlbnREZWdyZWVzKCk7XG4gICAgICAvLyBjaG9vc2UgY2hvcmQgcm9vdCBkZWdyZWUgKG9mdGVuIGFsaWduIHdpdGggZHJvbmUpXG4gICAgICBjb25zdCByb290RGVncmVlSW5kZXggPSAodGhpcy5ybmcoKSA8IENIT1JEX0FOQ0hPUl9QUk9CKSA/IHRoaXMuZHJvbmVEZWdyZWVJZHggOiBNYXRoLmZsb29yKHRoaXMucm5nKCkgKiA3KTtcblxuICAgICAgLy8gY2hvcmQgc2l6ZSAvIGV4dGVuc2lvbnNcbiAgICAgIGNvbnN0IHIgPSB0aGlzLnJuZygpO1xuICAgICAgbGV0IHNpemUgPSAzOyBsZXQgYWRkOSA9IGZhbHNlLCBhZGQxMSA9IGZhbHNlLCBhZGQxMyA9IGZhbHNlO1xuICAgICAgaWYgKHIgPCAwLjM1KSAgICAgICAgICAgIHsgc2l6ZSA9IDM7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjc1KSAgICAgICB7IHNpemUgPSA0OyB9XG4gICAgICBlbHNlIGlmIChyIDwgMC45MCkgICAgICAgeyBzaXplID0gNDsgYWRkOSA9IHRydWU7IH1cbiAgICAgIGVsc2UgaWYgKHIgPCAwLjk3KSAgICAgICB7IHNpemUgPSA0OyBhZGQxMSA9IHRydWU7IH1cbiAgICAgIGVsc2UgICAgICAgICAgICAgICAgICAgICB7IHNpemUgPSA0OyBhZGQxMyA9IHRydWU7IH1cblxuICAgICAgY29uc3QgY2hvcmRTZW1pcyA9IHRoaXMuYnVpbGRDaG9yZERlZ3JlZXMobW9kZURlZ3MsIHJvb3REZWdyZWVJbmRleCwgc2l6ZSwgYWRkOSwgYWRkMTEsIGFkZDEzKTtcbiAgICAgIC8vIHNwcmVhZCBjaG9yZCBhY3Jvc3Mgb2N0YXZlcyAoLTEyLCAwLCArMTIpLCBiaWFzIHRvIGNlbnRlclxuICAgICAgY29uc3Qgc3ByZWFkID0gY2hvcmRTZW1pcy5tYXAoc2VtaSA9PiBzZW1pICsgY2hvaWNlKHRoaXMucm5nLCBbLTEyLCAwLCAwLCAxMl0pKTtcblxuICAgICAgLy8gb2NjYXNpb25hbGx5IGVuc3VyZSB0b25pYyBpcyBwcmVzZW50IGZvciBncm91bmRpbmdcbiAgICAgIGlmICghc3ByZWFkLmluY2x1ZGVzKDApICYmIHRoaXMucm5nKCkgPCAwLjUpIHNwcmVhZC5wdXNoKDApO1xuXG4gICAgICB5aWVsZCBzcHJlYWQ7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaG9yZEN5Y2xlKCkge1xuICAgIGNvbnN0IGdlbiA9IHRoaXMuZW5kbGVzc0Nob3JkcygpO1xuICAgIGNvbnN0IHZvaWNlcyA9IG5ldyBTZXQ8Vm9pY2U+KCk7XG5cbiAgICBjb25zdCBzbGVlcCA9IChtczogbnVtYmVyKSA9PiBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHtcbiAgICAgIGNvbnN0IGlkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4gcigpLCBtcykgYXMgdW5rbm93biBhcyBudW1iZXI7XG4gICAgICB0aGlzLnRpbWVvdXRzLnB1c2goaWQpO1xuICAgIH0pO1xuXG4gICAgd2hpbGUgKHRoaXMucnVubmluZykge1xuICAgICAgLy8gY2hvcmQgc3Bhd24gcHJvYmFiaWxpdHkgLyB0aGlja25lc3Mgc2NhbGUgd2l0aCBkZW5zaXR5ICYgYnJpZ2h0bmVzc1xuICAgICAgY29uc3QgdGhpY2tuZXNzID0gTWF0aC5yb3VuZCgyICsgdGhpcy5wYXJhbXMuZGVuc2l0eSAqIDMpO1xuICAgICAgY29uc3QgYmFzZU1pZGkgPSB0aGlzLmtleVJvb3RNaWRpO1xuICAgICAgY29uc3QgZGVncmVlc09mZjogbnVtYmVyW10gPSBnZW4ubmV4dCgpLnZhbHVlID8/IFtdO1xuXG4gICAgICAvLyBzcGF3blxuICAgICAgZm9yIChjb25zdCBvZmYgb2YgZGVncmVlc09mZikge1xuICAgICAgICBpZiAoIXRoaXMucnVubmluZykgYnJlYWs7XG4gICAgICAgIGlmICh2b2ljZXMuc2l6ZSA+PSBNYXRoLm1pbihDSE9SRF9WT0lDRVNfTUFYLCB0aGlja25lc3MpKSBicmVhaztcblxuICAgICAgICBjb25zdCBtaWRpID0gYmFzZU1pZGkgKyBvZmY7XG4gICAgICAgIGNvbnN0IGZyZXEgPSBtaWRpVG9GcmVxKG1pZGkpO1xuICAgICAgICBjb25zdCB3YXZlZm9ybSA9IGNob2ljZSh0aGlzLnJuZywgW1wic2luZVwiLCBcInRyaWFuZ2xlXCIsIFwic2F3dG9vdGhcIl0gYXMgT3NjaWxsYXRvclR5cGVbXSk7XG5cbiAgICAgICAgLy8gbG91ZGVyIHdpdGggaW50ZW5zaXR5OyBzbGlnaHRseSBicmlnaHRlciAtPiBzbGlnaHRseSBsb3VkZXJcbiAgICAgICAgY29uc3QgZ2FpblRhcmdldCA9IHJhbmQodGhpcy5ybmcsIDAuMDgsIDAuMjIpICpcbiAgICAgICAgICAoMC44NSArIDAuMyAqIHRoaXMucGFyYW1zLmludGVuc2l0eSkgKlxuICAgICAgICAgICgwLjkgKyAwLjIgKiB0aGlzLnBhcmFtcy5icmlnaHRuZXNzKTtcblxuICAgICAgICBjb25zdCB2ID0gbmV3IFZvaWNlKHRoaXMuY3R4LCBnYWluVGFyZ2V0LCB3YXZlZm9ybSwgZnJlcSwgdGhpcy5maWx0ZXIsIHRoaXMucm5nKTtcbiAgICAgICAgdm9pY2VzLmFkZCh2KTtcbiAgICAgICAgdi5mYWRlSW4ocmFuZCh0aGlzLnJuZywgQ0hPUkRfRkFERV9NSU5fUywgQ0hPUkRfRkFERV9NQVhfUykpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCBzbGVlcChyYW5kKHRoaXMucm5nLCBDSE9SRF9IT0xEX01JTl9TLCBDSE9SRF9IT0xEX01BWF9TKSAqIDEwMDApO1xuXG4gICAgICAvLyBmYWRlIG91dFxuICAgICAgY29uc3Qgb3V0cyA9IEFycmF5LmZyb20odm9pY2VzKTtcbiAgICAgIGZvciAoY29uc3QgdiBvZiBvdXRzKSB2LmZhZGVPdXRLaWxsKHJhbmQodGhpcy5ybmcsIENIT1JEX0ZBREVfTUlOX1MsIENIT1JEX0ZBREVfTUFYX1MpKTtcbiAgICAgIHZvaWNlcy5jbGVhcigpO1xuXG4gICAgICBhd2FpdCBzbGVlcChyYW5kKHRoaXMucm5nLCBDSE9SRF9HQVBfTUlOX1MsIENIT1JEX0dBUF9NQVhfUykgKiAxMDAwKTtcbiAgICB9XG5cbiAgICAvLyBzYWZldHk6IGtpbGwgYW55IGxpbmdlcmluZyB2b2ljZXNcbiAgICBmb3IgKGNvbnN0IHYgb2YgQXJyYXkuZnJvbSh2b2ljZXMpKSB2LmZhZGVPdXRLaWxsKDAuOCk7XG4gIH1cbn1cbiIsICJpbXBvcnQgdHlwZSB7IFNjZW5lTmFtZSwgTXVzaWNTY2VuZU9wdGlvbnMgfSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IEF1ZGlvRW5naW5lIH0gZnJvbSBcIi4uL2VuZ2luZVwiO1xuaW1wb3J0IHsgQW1iaWVudFNjZW5lIH0gZnJvbSBcIi4vc2NlbmVzL2FtYmllbnRcIjtcblxuZXhwb3J0IGNsYXNzIE11c2ljRGlyZWN0b3Ige1xuICBwcml2YXRlIGN1cnJlbnQ/OiB7IG5hbWU6IFNjZW5lTmFtZTsgc3RvcDogKCkgPT4gdm9pZCB9O1xuICBwcml2YXRlIGJ1c091dDogR2Fpbk5vZGU7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBlbmdpbmU6IEF1ZGlvRW5naW5lKSB7XG4gICAgdGhpcy5idXNPdXQgPSBuZXcgR2Fpbk5vZGUoZW5naW5lLmN0eCwgeyBnYWluOiAwLjkgfSk7XG4gICAgdGhpcy5idXNPdXQuY29ubmVjdChlbmdpbmUuZ2V0TXVzaWNCdXMoKSk7XG4gIH1cblxuICAvKiogQ3Jvc3NmYWRlIHRvIGEgbmV3IHNjZW5lICovXG4gIHNldFNjZW5lKG5hbWU6IFNjZW5lTmFtZSwgb3B0cz86IE11c2ljU2NlbmVPcHRpb25zKSB7XG4gICAgaWYgKHRoaXMuY3VycmVudD8ubmFtZSA9PT0gbmFtZSkgcmV0dXJuO1xuXG4gICAgY29uc3Qgb2xkID0gdGhpcy5jdXJyZW50O1xuICAgIGNvbnN0IHQgPSB0aGlzLmVuZ2luZS5ub3c7XG5cbiAgICAvLyBmYWRlLW91dCBvbGRcbiAgICBjb25zdCBmYWRlT3V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuZW5naW5lLmN0eCwgeyBnYWluOiAwLjkgfSk7XG4gICAgZmFkZU91dC5jb25uZWN0KHRoaXMuZW5naW5lLmdldE11c2ljQnVzKCkpO1xuICAgIGlmIChvbGQpIHtcbiAgICAgIC8vIFdlIGFzc3VtZSBlYWNoIHNjZW5lIG1hbmFnZXMgaXRzIG93biBvdXQgbm9kZTsgc3RvcHBpbmcgdHJpZ2dlcnMgYSBuYXR1cmFsIHRhaWwuXG4gICAgICBvbGQuc3RvcCgpO1xuICAgICAgZmFkZU91dC5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDAuMCwgdCArIDAuNik7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IGZhZGVPdXQuZGlzY29ubmVjdCgpLCA2NTApO1xuICAgIH1cblxuICAgIC8vIG5ldyBzY2VuZVxuICAgIGNvbnN0IHNjZW5lT3V0ID0gbmV3IEdhaW5Ob2RlKHRoaXMuZW5naW5lLmN0eCwgeyBnYWluOiAwIH0pO1xuICAgIHNjZW5lT3V0LmNvbm5lY3QodGhpcy5idXNPdXQpO1xuXG4gICAgbGV0IHN0b3AgPSAoKSA9PiBzY2VuZU91dC5kaXNjb25uZWN0KCk7XG5cbiAgICBpZiAobmFtZSA9PT0gXCJhbWJpZW50XCIpIHtcbiAgICAgIGNvbnN0IHMgPSBuZXcgQW1iaWVudFNjZW5lKHRoaXMuZW5naW5lLmN0eCwgc2NlbmVPdXQsIG9wdHM/LnNlZWQgPz8gMSk7XG4gICAgICBzLnN0YXJ0KCk7XG4gICAgICBzdG9wID0gKCkgPT4ge1xuICAgICAgICBzLnN0b3AoKTtcbiAgICAgICAgc2NlbmVPdXQuZGlzY29ubmVjdCgpO1xuICAgICAgfTtcbiAgICB9XG4gICAgLy8gZWxzZSBpZiAobmFtZSA9PT0gXCJjb21iYXRcIikgeyAvKiBpbXBsZW1lbnQgY29tYmF0IHNjZW5lIGxhdGVyICovIH1cbiAgICAvLyBlbHNlIGlmIChuYW1lID09PSBcImxvYmJ5XCIpIHsgLyogaW1wbGVtZW50IGxvYmJ5IHNjZW5lIGxhdGVyICovIH1cblxuICAgIHRoaXMuY3VycmVudCA9IHsgbmFtZSwgc3RvcCB9O1xuICAgIHNjZW5lT3V0LmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMC45LCB0ICsgMC42KTtcbiAgfVxuXG4gIHN0b3AoKSB7XG4gICAgaWYgKCF0aGlzLmN1cnJlbnQpIHJldHVybjtcbiAgICB0aGlzLmN1cnJlbnQuc3RvcCgpO1xuICAgIHRoaXMuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgfVxufVxuIiwgImltcG9ydCB0eXBlIHsgQnVzLCBNdXNpY1BhcmFtTWVzc2FnZSwgTXVzaWNTY2VuZU9wdGlvbnMgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9lbmdpbmVcIjtcbmltcG9ydCB7IE11c2ljRGlyZWN0b3IgfSBmcm9tIFwiLi9tdXNpY1wiO1xuaW1wb3J0IHsgcGxheVNmeCB9IGZyb20gXCIuL3NmeFwiO1xuXG4vKipcbiAqIEJpbmQgc3RhbmRhcmQgYXVkaW8gZXZlbnRzIHRvIHRoZSBlbmdpbmUgYW5kIG11c2ljIGRpcmVjdG9yLlxuICpcbiAqIEV2ZW50cyBzdXBwb3J0ZWQ6XG4gKiAgLSBhdWRpbzpyZXN1bWVcbiAqICAtIGF1ZGlvOm11dGUgLyBhdWRpbzp1bm11dGVcbiAqICAtIGF1ZGlvOnNldC1tYXN0ZXItZ2FpbiB7IGdhaW4gfVxuICogIC0gYXVkaW86c2Z4IHsgbmFtZSwgdmVsb2NpdHk/LCBwYW4/IH1cbiAqICAtIGF1ZGlvOm11c2ljOnNldC1zY2VuZSB7IHNjZW5lLCBzZWVkPyB9XG4gKiAgLSBhdWRpbzptdXNpYzpwYXJhbSB7IGtleSwgdmFsdWUgfVxuICogIC0gYXVkaW86bXVzaWM6dHJhbnNwb3J0IHsgY21kOiBcInN0YXJ0XCIgfCBcInN0b3BcIiB8IFwicGF1c2VcIiB9ICAvLyBwYXVzZSBjdXJyZW50bHkgbWFwcyB0byBzdG9wXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckF1ZGlvQnVzQmluZGluZ3MoXG4gIGJ1czogQnVzLFxuICBlbmdpbmU6IEF1ZGlvRW5naW5lLFxuICBtdXNpYzogTXVzaWNEaXJlY3RvclxuKTogdm9pZCB7XG4gIGJ1cy5vbihcImF1ZGlvOnJlc3VtZVwiLCAoKSA9PiBlbmdpbmUucmVzdW1lKCkpO1xuICBidXMub24oXCJhdWRpbzptdXRlXCIsICgpID0+IGVuZ2luZS5zZXRNYXN0ZXJHYWluKDApKTtcbiAgYnVzLm9uKFwiYXVkaW86dW5tdXRlXCIsICgpID0+IGVuZ2luZS5zZXRNYXN0ZXJHYWluKDAuOSkpO1xuICBidXMub24oXCJhdWRpbzpzZXQtbWFzdGVyLWdhaW5cIiwgKHsgZ2FpbiB9OiB7IGdhaW46IG51bWJlciB9KSA9PlxuICAgIGVuZ2luZS5zZXRNYXN0ZXJHYWluKE1hdGgubWF4KDAsIE1hdGgubWluKDEsIGdhaW4pKSlcbiAgKTtcblxuICBidXMub24oXCJhdWRpbzpzZnhcIiwgKG1zZzogeyBuYW1lOiBzdHJpbmc7IHZlbG9jaXR5PzogbnVtYmVyOyBwYW4/OiBudW1iZXIgfSkgPT4ge1xuICAgIHBsYXlTZngoZW5naW5lLCBtc2cubmFtZSBhcyBhbnksIHsgdmVsb2NpdHk6IG1zZy52ZWxvY2l0eSwgcGFuOiBtc2cucGFuIH0pO1xuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzpzZXQtc2NlbmVcIiwgKG1zZzogeyBzY2VuZTogc3RyaW5nIH0gJiBNdXNpY1NjZW5lT3B0aW9ucykgPT4ge1xuICAgIGVuZ2luZS5yZXN1bWUoKTtcbiAgICBtdXNpYy5zZXRTY2VuZShtc2cuc2NlbmUgYXMgYW55LCB7IHNlZWQ6IG1zZy5zZWVkIH0pO1xuICB9KTtcblxuICBidXMub24oXCJhdWRpbzptdXNpYzpwYXJhbVwiLCAoX21zZzogTXVzaWNQYXJhbU1lc3NhZ2UpID0+IHtcbiAgICAvLyBIb29rIGZvciBmdXR1cmUgcGFyYW0gcm91dGluZyBwZXIgc2NlbmUgKGUuZy4sIGludGVuc2l0eS9icmlnaHRuZXNzL2RlbnNpdHkpXG4gICAgLy8gSWYgeW91IHdhbnQgZ2xvYmFsIHBhcmFtcywga2VlcCBhIG1hcCBoZXJlIGFuZCBmb3J3YXJkIHRvIHRoZSBhY3RpdmUgc2NlbmVcbiAgfSk7XG5cbiAgYnVzLm9uKFwiYXVkaW86bXVzaWM6dHJhbnNwb3J0XCIsICh7IGNtZCB9OiB7IGNtZDogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInBhdXNlXCIgfSkgPT4ge1xuICAgIGlmIChjbWQgPT09IFwic3RvcFwiIHx8IGNtZCA9PT0gXCJwYXVzZVwiKSBtdXNpYy5zdG9wKCk7XG4gICAgLy8gXCJzdGFydFwiIGlzIGltcGxpY2l0IHZpYSBzZXRTY2VuZVxuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBjcmVhdGVFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHsgY29ubmVjdFdlYlNvY2tldCwgc2VuZE1lc3NhZ2UgfSBmcm9tIFwiLi9uZXRcIjtcbmltcG9ydCB7IGluaXRHYW1lIH0gZnJvbSBcIi4vZ2FtZVwiO1xuaW1wb3J0IHsgY3JlYXRlSW5pdGlhbFN0YXRlLCBjcmVhdGVJbml0aWFsVUlTdGF0ZSB9IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQgeyBtb3VudFR1dG9yaWFsLCBCQVNJQ19UVVRPUklBTF9JRCB9IGZyb20gXCIuL3R1dG9yaWFsXCI7XG5pbXBvcnQgeyBjbGVhclByb2dyZXNzIGFzIGNsZWFyVHV0b3JpYWxQcm9ncmVzcyB9IGZyb20gXCIuL3R1dG9yaWFsL3N0b3JhZ2VcIjtcbmltcG9ydCB7IG1vdW50U3RvcnksIElOVFJPX0NIQVBURVJfSUQsIElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTIH0gZnJvbSBcIi4vc3RvcnlcIjtcbmltcG9ydCB7IHdhaXRGb3JVc2VyU3RhcnQgfSBmcm9tIFwiLi9zdGFydC1nYXRlXCI7XG5pbXBvcnQgeyByZXN1bWVBdWRpbyB9IGZyb20gXCIuL3N0b3J5L3NmeFwiO1xuaW1wb3J0IHsgQXVkaW9FbmdpbmUgfSBmcm9tIFwiLi9hdWRpby9lbmdpbmVcIjtcbmltcG9ydCB7IE11c2ljRGlyZWN0b3IgfSBmcm9tIFwiLi9hdWRpby9tdXNpY1wiO1xuaW1wb3J0IHsgcmVnaXN0ZXJBdWRpb0J1c0JpbmRpbmdzIH0gZnJvbSBcIi4vYXVkaW8vY3Vlc1wiO1xuXG5jb25zdCBDQUxMX1NJR05fU1RPUkFHRV9LRVkgPSBcImxzZDpjYWxsc2lnblwiO1xuXG4oYXN5bmMgZnVuY3Rpb24gYm9vdHN0cmFwKCkge1xuICBjb25zdCBxcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG4gIGNvbnN0IHJvb20gPSBxcy5nZXQoXCJyb29tXCIpIHx8IFwiZGVmYXVsdFwiO1xuICBjb25zdCBtb2RlID0gcXMuZ2V0KFwibW9kZVwiKSB8fCBcIlwiO1xuICBjb25zdCBuYW1lUGFyYW0gPSBzYW5pdGl6ZUNhbGxTaWduKHFzLmdldChcIm5hbWVcIikpO1xuICBjb25zdCBzdG9yZWROYW1lID0gc2FuaXRpemVDYWxsU2lnbihyZWFkU3RvcmVkQ2FsbFNpZ24oKSk7XG4gIGNvbnN0IGNhbGxTaWduID0gbmFtZVBhcmFtIHx8IHN0b3JlZE5hbWU7XG4gIGNvbnN0IG1hcFcgPSBwYXJzZUZsb2F0KHFzLmdldChcIm1hcFdcIikgfHwgXCI4MDAwXCIpO1xuICBjb25zdCBtYXBIID0gcGFyc2VGbG9hdChxcy5nZXQoXCJtYXBIXCIpIHx8IFwiNDUwMFwiKTtcblxuICBpZiAobmFtZVBhcmFtICYmIG5hbWVQYXJhbSAhPT0gc3RvcmVkTmFtZSkge1xuICAgIHBlcnNpc3RDYWxsU2lnbihuYW1lUGFyYW0pO1xuICB9XG5cbiAgLy8gR2F0ZSBldmVyeXRoaW5nIG9uIGEgdXNlciBnZXN0dXJlIChjZW50cmVkIGJ1dHRvbilcbiAgYXdhaXQgd2FpdEZvclVzZXJTdGFydCh7XG4gICAgbGFiZWw6IFwiU3RhcnQgR2FtZVwiLFxuICAgIHJlcXVlc3RGdWxsc2NyZWVuOiBmYWxzZSwgICAvLyBmbGlwIHRvIHRydWUgaWYgeW91IHdhbnQgZnVsbHNjcmVlblxuICAgIHJlc3VtZUF1ZGlvLCAgICAgICAgICAgICAgICAvLyB1c2VzIHN0b3J5L3NmeC50c1xuICB9KTtcblxuICAvLyAtLS0tIFN0YXJ0IGFjdHVhbCBhcHAgYWZ0ZXIgZ2VzdHVyZSAtLS0tXG4gIGNvbnN0IHN0YXRlID0gY3JlYXRlSW5pdGlhbFN0YXRlKCk7XG4gIGNvbnN0IHVpU3RhdGUgPSBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpO1xuICBjb25zdCBidXMgPSBjcmVhdGVFdmVudEJ1cygpO1xuXG4gIC8vIC0tLSBBVURJTzogZW5naW5lICsgYmluZGluZ3MgKyBkZWZhdWx0IHNjZW5lIC0tLVxuICBjb25zdCBlbmdpbmUgPSBBdWRpb0VuZ2luZS5nZXQoKTtcbiAgYXdhaXQgZW5naW5lLnJlc3VtZSgpOyAvLyBzYWZlIHBvc3QtZ2VzdHVyZVxuICBjb25zdCBtdXNpYyA9IG5ldyBNdXNpY0RpcmVjdG9yKGVuZ2luZSk7XG4gIHJlZ2lzdGVyQXVkaW9CdXNCaW5kaW5ncyhidXMgYXMgYW55LCBlbmdpbmUsIG11c2ljKTtcblxuICAvLyBTdGFydCBhIGRlZmF1bHQgbXVzaWMgc2NlbmUgKGFkanVzdCBzZWVkL3NjZW5lIGFzIHlvdSBsaWtlKVxuICBidXMuZW1pdChcImF1ZGlvOm11c2ljOnNldC1zY2VuZVwiLCB7IHNjZW5lOiBcImFtYmllbnRcIiwgc2VlZDogNDIgfSk7XG5cbiAgLy8gT3B0aW9uYWw6IGJhc2ljIGhvb2tzIHRvIGRlbW9uc3RyYXRlIFNGWCAmIGR1Y2tpbmdcbiAgLy8gYnVzLm9uKFwiZGlhbG9ndWU6b3BlbmVkXCIsICgpID0+IGVuZ2luZS5kdWNrTXVzaWMoMC4zNSwgMC4xKSk7XG4gIC8vIGJ1cy5vbihcImRpYWxvZ3VlOmNsb3NlZFwiLCAoKSA9PiBlbmdpbmUudW5kdWNrTXVzaWMoMC4yNSkpO1xuXG4gIC8vIEV4YW1wbGUgZ2FtZSBTRlggd2lyaW5nIChhZGFwdCB0byB5b3VyIGFjdHVhbCBldmVudHMpXG4gIGJ1cy5vbihcInNoaXA6c3BlZWRDaGFuZ2VkXCIsICh7IHZhbHVlIH0pID0+IHtcbiAgICBpZiAodmFsdWUgPiAwKSBidXMuZW1pdChcImF1ZGlvOnNmeFwiLCB7IG5hbWU6IFwidGhydXN0XCIsIHZlbG9jaXR5OiBNYXRoLm1pbigxLCB2YWx1ZSkgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGdhbWUgPSBpbml0R2FtZSh7IHN0YXRlLCB1aVN0YXRlLCBidXMgfSk7XG5cbiAgLy8gTW91bnQgdHV0b3JpYWwgYW5kIHN0b3J5IGJhc2VkIG9uIGdhbWUgbW9kZVxuICBjb25zdCBlbmFibGVUdXRvcmlhbCA9IG1vZGUgPT09IFwiY2FtcGFpZ25cIiB8fCBtb2RlID09PSBcInR1dG9yaWFsXCI7XG4gIGNvbnN0IGVuYWJsZVN0b3J5ID0gbW9kZSA9PT0gXCJjYW1wYWlnblwiO1xuXG4gIGxldCB0dXRvcmlhbDogUmV0dXJuVHlwZTx0eXBlb2YgbW91bnRUdXRvcmlhbD4gfCBudWxsID0gbnVsbDtcbiAgbGV0IHR1dG9yaWFsU3RhcnRlZCA9IGZhbHNlO1xuXG4gIGlmIChlbmFibGVUdXRvcmlhbCkge1xuICAgIHR1dG9yaWFsID0gbW91bnRUdXRvcmlhbChidXMpO1xuICB9XG5cbiAgY29uc3Qgc3RhcnRUdXRvcmlhbCA9ICgpOiB2b2lkID0+IHtcbiAgICBpZiAoIXR1dG9yaWFsIHx8IHR1dG9yaWFsU3RhcnRlZCkgcmV0dXJuO1xuICAgIHR1dG9yaWFsU3RhcnRlZCA9IHRydWU7XG4gICAgY2xlYXJUdXRvcmlhbFByb2dyZXNzKEJBU0lDX1RVVE9SSUFMX0lEKTtcbiAgICB0dXRvcmlhbC5zdGFydCh7IHJlc3VtZTogZmFsc2UgfSk7XG4gIH07XG5cbiAgaWYgKGVuYWJsZVN0b3J5KSB7XG4gICAgLy8gQ2FtcGFpZ24gbW9kZTogc3RvcnkgKyB0dXRvcmlhbFxuICAgIGNvbnN0IHVuc3Vic2NyaWJlU3RvcnlDbG9zZWQgPSBidXMub24oXCJkaWFsb2d1ZTpjbG9zZWRcIiwgKHsgY2hhcHRlcklkLCBub2RlSWQgfSkgPT4ge1xuICAgICAgaWYgKGNoYXB0ZXJJZCAhPT0gSU5UUk9fQ0hBUFRFUl9JRCkgcmV0dXJuO1xuICAgICAgaWYgKCFJTlRST19JTklUSUFMX1JFU1BPTlNFX0lEUy5pbmNsdWRlcyhub2RlSWQgYXMgdHlwZW9mIElOVFJPX0lOSVRJQUxfUkVTUE9OU0VfSURTW251bWJlcl0pKSByZXR1cm47XG4gICAgICB1bnN1YnNjcmliZVN0b3J5Q2xvc2VkKCk7XG4gICAgICBzdGFydFR1dG9yaWFsKCk7XG4gICAgfSk7XG4gICAgbW91bnRTdG9yeSh7IGJ1cywgcm9vbUlkOiByb29tIH0pO1xuICB9IGVsc2UgaWYgKG1vZGUgPT09IFwidHV0b3JpYWxcIikge1xuICAgIC8vIFR1dG9yaWFsIG1vZGU6IGF1dG8tc3RhcnQgdHV0b3JpYWwgd2l0aG91dCBzdG9yeVxuICAgIHN0YXJ0VHV0b3JpYWwoKTtcbiAgfVxuICAvLyBGcmVlIHBsYXkgYW5kIGRlZmF1bHQ6IG5vIHN5c3RlbXMgbW91bnRlZFxuXG4gIGNvbm5lY3RXZWJTb2NrZXQoe1xuICAgIHJvb20sXG4gICAgc3RhdGUsXG4gICAgYnVzLFxuICAgIG1hcFcsXG4gICAgbWFwSCxcbiAgICBvblN0YXRlVXBkYXRlZDogKCkgPT4gZ2FtZS5vblN0YXRlVXBkYXRlZCgpLFxuICAgIG9uT3BlbjogKCkgPT4ge1xuICAgICAgY29uc3QgbmFtZVRvU2VuZCA9IGNhbGxTaWduIHx8IHNhbml0aXplQ2FsbFNpZ24ocmVhZFN0b3JlZENhbGxTaWduKCkpO1xuICAgICAgaWYgKG5hbWVUb1NlbmQpIHNlbmRNZXNzYWdlKHsgdHlwZTogXCJqb2luXCIsIG5hbWU6IG5hbWVUb1NlbmQgfSk7XG4gICAgfSxcbiAgfSk7XG5cbiAgLy8gT3B0aW9uYWw6IHN1c3BlbmQvcmVzdW1lIGF1ZGlvIG9uIHRhYiB2aXNpYmlsaXR5IHRvIHNhdmUgQ1BVXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ2aXNpYmlsaXR5Y2hhbmdlXCIsICgpID0+IHtcbiAgICBpZiAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSBcImhpZGRlblwiKSB7XG4gICAgICB2b2lkIGVuZ2luZS5zdXNwZW5kKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZvaWQgZW5naW5lLnJlc3VtZSgpO1xuICAgIH1cbiAgfSk7XG59KSgpO1xuXG5mdW5jdGlvbiBzYW5pdGl6ZUNhbGxTaWduKHZhbHVlOiBzdHJpbmcgfCBudWxsKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkgcmV0dXJuIFwiXCI7XG4gIGNvbnN0IHRyaW1tZWQgPSB2YWx1ZS50cmltKCk7XG4gIGlmICghdHJpbW1lZCkgcmV0dXJuIFwiXCI7XG4gIHJldHVybiB0cmltbWVkLnNsaWNlKDAsIDI0KTtcbn1cblxuZnVuY3Rpb24gcGVyc2lzdENhbGxTaWduKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICB0cnkge1xuICAgIGlmIChuYW1lKSB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oQ0FMTF9TSUdOX1NUT1JBR0VfS0VZLCBuYW1lKTtcbiAgICBlbHNlIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShDQUxMX1NJR05fU1RPUkFHRV9LRVkpO1xuICB9IGNhdGNoIHt9XG59XG5cbmZ1bmN0aW9uIHJlYWRTdG9yZWRDYWxsU2lnbigpOiBzdHJpbmcge1xuICB0cnkgeyByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKENBTExfU0lHTl9TVE9SQUdFX0tFWSkgPz8gXCJcIjsgfVxuICBjYXRjaCB7IHJldHVybiBcIlwiOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUE4RU8sV0FBUyxpQkFBMkI7QUFDekMsVUFBTSxXQUFXLG9CQUFJLElBQTZCO0FBQ2xELFdBQU87QUFBQSxNQUNMLEdBQUcsT0FBTyxTQUFTO0FBQ2pCLFlBQUksTUFBTSxTQUFTLElBQUksS0FBSztBQUM1QixZQUFJLENBQUMsS0FBSztBQUNSLGdCQUFNLG9CQUFJLElBQUk7QUFDZCxtQkFBUyxJQUFJLE9BQU8sR0FBRztBQUFBLFFBQ3pCO0FBQ0EsWUFBSSxJQUFJLE9BQU87QUFDZixlQUFPLE1BQU0sSUFBSyxPQUFPLE9BQU87QUFBQSxNQUNsQztBQUFBLE1BQ0EsS0FBSyxPQUFpQixTQUFtQjtBQUN2QyxjQUFNLE1B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LHdCQUF3QixTQUFTLENBQUM7QUFBQSxRQUN2RDtBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixP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QVMsb0JBQW9CLFVBQVU7QUFDekMsYUFBSyxPQUFPLFFBQVE7QUFBQSxNQUN0QixPQUFPO0FBQ0wsYUFBSyxPQUFPLE9BQU87QUFBQSxNQUNyQjtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0gsR0FBRztBQUVILFdBQVMsaUJBQWlCLE9BQThCO0FBQ3RELFFBQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsVUFBTSxVQUFVLE1BQU0sS0FBSztBQUMzQixRQUFJLENBQUMsUUFBUyxRQUFPO0FBQ3JCLFdBQU8sUUFBUSxNQUFNLEdBQUcsRUFBRTtBQUFBLEVBQzVCO0FBRUEsV0FBUyxnQkFBZ0IsTUFBb0I7QUFDM0MsUUFBSTtBQUNGLFVBQUksS0FBTSxRQUFPLGFBQWEsUUFBUSx1QkFBdUIsSUFBSTtBQUFBLFVBQzVELFFBQU8sYUFBYSxXQUFXLHFCQUFxQjtBQUFBLElBQzNELFNBQVE7QUFBQSxJQUFDO0FBQUEsRUFDWDtBQUVBLFdBQVMscUJBQTZCO0FBbkl0QztBQW9JRSxRQUFJO0FBQUUsY0FBTyxZQUFPLGFBQWEsUUFBUSxxQkFBcUIsTUFBakQsWUFBc0Q7QUFBQSxJQUFJLFNBQ2pFO0FBQUUsYUFBTztBQUFBLElBQUk7QUFBQSxFQUNyQjsiLAogICJuYW1lcyI6IFsid29ybGQiLCAid29ybGRUb0NhbnZhcyIsICJjdHgiLCAic2VsZWN0aW9uIiwgImRyYWdnZWRXYXlwb2ludCIsICJkZWZhdWx0U3BlZWQiLCAiX2EiLCAiX2IiLCAic2VsZWN0aW9uIiwgIl9hIiwgIlNUWUxFX0lEIiwgImVuc3VyZVN0eWxlcyIsICJjaG9pY2UiLCAiX2EiLCAiU1RPUkFHRV9QUkVGSVgiLCAiZ2V0U3RvcmFnZSIsICJjdHgiLCAiY3R4IiwgImNsYW1wIiwgImNob2ljZSIsICJfYSIsICJjdHgiLCAicmVzdW1lQXVkaW8iLCAiY3R4Il0KfQo=
