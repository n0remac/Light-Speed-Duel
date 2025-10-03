(() => {
  const qs = new URLSearchParams(location.search);
  const ROOM = qs.get("room") || "default";
  document.getElementById("room-name").textContent = ROOM;

  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");
  const Tspan = document.getElementById("t");
  const Cspan = document.getElementById("c");
  const WHspan = document.getElementById("wh");
  const speedSlider = document.getElementById("speed-slider");
  const speedValue = document.getElementById("speed-value");
  const selectionPanel = document.getElementById("selection-panel");
  const selectionLabel = document.getElementById("selection-label");
  const deleteWaypointBtn = document.getElementById("delete-waypoint");

  let ws;
  function connect() {
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws?room=" + encodeURIComponent(ROOM));
    ws.onopen = () => console.log("[ws] open");
    ws.onclose = () => console.log("[ws] close");
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") {
        state.now = msg.now;
        state.me = msg.me || null;
        if (state.me) {
          state.me.waypoints = Array.isArray(msg.me.waypoints) ? msg.me.waypoints : [];
        }
        state.ghosts = msg.ghosts || [];
        Cspan.textContent = msg.meta?.c?.toFixed(0) ?? "–";
        WHspan.textContent = `${(msg.meta?.w ?? 0).toFixed(0)}×${(msg.meta?.h ?? 0).toFixed(0)}`;
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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const canvasPoint = { x, y };
    const hit = hitTestRoute(canvasPoint);
    if (hit) {
      setSelection(hit);
      return;
    }
    const wp = canvasToWorld(canvasPoint);
    ws?.send(JSON.stringify({ type: "add_waypoint", x: wp.x, y: wp.y, speed: defaultSpeed }));
    if (state.me) {
      const wps = Array.isArray(state.me.waypoints) ? state.me.waypoints.slice() : [];
      wps.push({ x: wp.x, y: wp.y, speed: defaultSpeed });
      state.me.waypoints = wps;
    }
    refreshSelectionUI();
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
    if (!selection) return;
    ws?.send(JSON.stringify({ type: "delete_waypoint", index: selection.index }));
    if (state.me && Array.isArray(state.me.waypoints)) {
      state.me.waypoints = state.me.waypoints.slice(0, selection.index);
    }
    setSelection(null);
  });

  const state = {
    now: 0,
    me: null,
    ghosts: [],
  };

  let selection = null; // { type: "waypoint" | "leg", index: number }
  let defaultSpeed = parseFloat(speedSlider?.value || "150");

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
    selectionPanel.style.display = "none";
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
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
    const wps = state.me && Array.isArray(state.me.waypoints) ? state.me.waypoints : [];
    if (!selection || !state.me || selection.index < 0 || selection.index >= wps.length) {
      selection = null;
      selectionPanel.style.display = "none";
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
    selectionPanel.style.display = "block";
    const labelBase = selection.type === "leg" ? `Leg ${selection.index + 1}` : `Waypoint ${selection.index + 1}`;
    selectionLabel.textContent = `${labelBase} – ${speed.toFixed(0)} u/s`;
  }

  function setSelection(sel) {
    selection = sel;
    refreshSelectionUI();
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

    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#38bdf866";
    ctx.beginPath();
    ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
    for (let i = 1; i < canvasPoints.length; i++) {
      ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
    }
    ctx.stroke();
    ctx.restore();

    if (canvasPoints.length > 1) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
      ctx.lineTo(canvasPoints[1].x, canvasPoints[1].y);
      ctx.stroke();
      ctx.restore();
    }

    if (selection && canvasPoints.length > selection.index + 1) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(canvasPoints[selection.index].x, canvasPoints[selection.index].y);
      ctx.lineTo(canvasPoints[selection.index + 1].x, canvasPoints[selection.index + 1].y);
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

  function loop() {
    ctx.clearRect(0,0,cv.width,cv.height);
    drawGrid();
    drawRoute();

    Tspan.textContent = state.now.toFixed(2);

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
