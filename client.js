(() => {
  const qs = new URLSearchParams(location.search);
  const ROOM = qs.get("room") || "default";
  document.getElementById("room-name").textContent = ROOM;

  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");
  const Tspan = document.getElementById("t");
  const Cspan = document.getElementById("c");
  const WHspan = document.getElementById("wh");

  let ws;
  function connect() {
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws?room=" + encodeURIComponent(ROOM));
    ws.onopen = () => console.log("[ws] open");
    ws.onclose = () => console.log("[ws] close");
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") {
        state.now = msg.now;
        state.me = msg.me;
        state.ghosts = msg.ghosts || [];
        Cspan.textContent = msg.meta?.c?.toFixed(0) ?? "–";
        WHspan.textContent = `${(msg.meta?.w ?? 0).toFixed(0)}×${(msg.meta?.h ?? 0).toFixed(0)}`;
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
    const wp = canvasToWorld({ x, y });
    ws?.send(JSON.stringify({ type: "waypoint", x: wp.x, y: wp.y }));
  });

  const state = {
    now: 0,
    me: null,
    ghosts: [],
  };

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
