import type { AppState, UIState } from "../state";
import { MISSILE_PALETTE, SHIP_PALETTE, drawPlannedRoute } from "../route";
import type { Camera } from "./camera";
import type { Logic } from "./logic";

interface RenderDependencies {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: AppState;
  uiState: UIState;
  camera: Camera;
  logic: Logic;
}

export interface Renderer {
  drawScene(): void;
  drawGrid(): void;
  drawBeacons(): void;
  drawShip(x: number, y: number, vx: number, vy: number, color: string, filled: boolean): void;
  drawGhostDot(x: number, y: number): void;
  drawRoute(): void;
  drawMissileRoute(): void;
  drawMissiles(): void;
}

export function createRenderer({
  canvas,
  ctx,
  state,
  uiState,
  camera,
  logic,
}: RenderDependencies): Renderer {
  function drawShip(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    filled: boolean
  ): void {
    const p = camera.worldToCanvas({ x, y });
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

  function drawGhostDot(x: number, y: number): void {
    const p = camera.worldToCanvas({ x, y });
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ccccccaa";
    ctx.fill();
  }

  function drawRoute(): void {
    if (!state.me) return;
    const route = logic.computeRoutePoints();
    if (!route || route.waypoints.length === 0) return;

    const heat = state.me.heat;
    const heatParams = heat
      ? {
          markerSpeed: heat.markerSpeed,
          kUp: heat.kUp,
          kDown: heat.kDown,
          exp: heat.exp,
          max: heat.max,
          overheatAt: heat.overheatAt,
          warnAt: heat.warnAt,
        }
      : undefined;

    const currentSelection = logic.getSelection();
    const displaySelection = currentSelection
      ? {
          type: currentSelection.type,
          index: logic.actualIndexToDisplayIndex(currentSelection.index),
        }
      : null;
    const validSelection =
      displaySelection && displaySelection.index >= 0 ? displaySelection : null;

    const dragged = logic.getDraggedWaypoint();
    const displayDragged =
      dragged !== null ? logic.actualIndexToDisplayIndex(dragged) : null;
    const validDragged =
      displayDragged !== null && displayDragged >= 0 ? displayDragged : null;

    drawPlannedRoute(ctx, {
      routePoints: route,
      selection: validSelection,
      draggedWaypoint: validDragged,
      dashStore: logic.shipLegDashOffsets,
      palette: SHIP_PALETTE,
      showLegs: uiState.showShipRoute,
      heatParams,
      initialHeat: heat?.value ?? 0,
      defaultSpeed: logic.getDefaultShipSpeed(),
      worldPoints: route.worldPoints,
    });
  }

  function drawMissileRoute(): void {
    if (!state.me) return;
    if (uiState.inputContext !== "missile") return;
    const route = logic.computeMissileRoutePoints();
    if (!route || route.waypoints.length === 0) return;

    const heatParams = state.missileConfig.heatParams;
    const missileSelection = logic.getMissileSelection();
    const genericSelection =
      missileSelection && missileSelection.type === "leg"
        ? { type: "leg", index: missileSelection.index }
        : missileSelection && missileSelection.type === "waypoint"
        ? { type: "waypoint", index: missileSelection.index }
        : null;

    drawPlannedRoute(ctx, {
      routePoints: route,
      selection: genericSelection,
      draggedWaypoint: null,
      dashStore: logic.missileLegDashOffsets,
      palette: MISSILE_PALETTE,
      showLegs: true,
      heatParams,
      initialHeat: 0,
      defaultSpeed: state.missileConfig.speed,
      worldPoints: route.worldPoints,
    });
  }

  function drawMissiles(): void {
    if (!state.missiles || state.missiles.length === 0) return;
    const world = camera.getWorldSize();
    const scaleX = canvas.width / world.w;
    const scaleY = canvas.height / world.h;
    const radiusScale = (scaleX + scaleY) / 2;
    for (const miss of state.missiles) {
      const p = camera.worldToCanvas({ x: miss.x, y: miss.y });
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

  function drawGrid(): void {
    ctx.save();
    ctx.strokeStyle = "#234";
    ctx.lineWidth = 1;

    const zoom = uiState.zoom;
    let step = 1000;
    if (zoom < 0.7) {
      step = 2000;
    } else if (zoom > 1.5) {
      step = 500;
    } else if (zoom > 2.5) {
      step = 250;
    }

    const cameraPos = camera.getCameraPosition();
    const world = camera.getWorldSize();
    const scaleX = canvas.width / world.w;
    const scaleY = canvas.height / world.h;
    const scale = Math.min(scaleX, scaleY) * zoom;
    const viewportWidth = canvas.width / scale;
    const viewportHeight = canvas.height / scale;

    const minX = Math.max(0, cameraPos.x - viewportWidth / 2);
    const maxX = Math.min(world.w, cameraPos.x + viewportWidth / 2);
    const minY = Math.max(0, cameraPos.y - viewportHeight / 2);
    const maxY = Math.min(world.h, cameraPos.y + viewportHeight / 2);

    const startX = Math.floor(minX / step) * step;
    const endX = Math.ceil(maxX / step) * step;
    const startY = Math.floor(minY / step) * step;
    const endY = Math.ceil(maxY / step) * step;

    for (let x = startX; x <= endX; x += step) {
      const a = camera.worldToCanvas({ x, y: Math.max(0, minY) });
      const b = camera.worldToCanvas({ x, y: Math.min(world.h, maxY) });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (let y = startY; y <= endY; y += step) {
      const a = camera.worldToCanvas({ x: Math.max(0, minX), y });
      const b = camera.worldToCanvas({ x: Math.min(world.w, maxX), y });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBeacons(): void {
    const mission = state.mission;
    if (!mission || !mission.active || mission.beacons.length === 0) {
      return;
    }

    const world = camera.getWorldSize();
    const scale = Math.min(canvas.width / world.w, canvas.height / world.h) * uiState.zoom;
    const me = state.me;
    const holdRequired = mission.holdRequired || 10;

    mission.beacons.forEach((beacon, index) => {
      const center = camera.worldToCanvas({ x: beacon.cx, y: beacon.cy });
      const edge = camera.worldToCanvas({ x: beacon.cx + beacon.radius, y: beacon.cy });
      const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
      if (!Number.isFinite(radius) || radius <= 0.5) {
        return;
      }

      const isLocked = index < mission.beaconIndex;
      const isActive = index === mission.beaconIndex;
      const baseLineWidth = Math.max(1.5, 2.5 * Math.min(1, scale * 1.2));
      const strokeStyle = isLocked
        ? "rgba(74,222,128,0.85)"
        : isActive
        ? "rgba(56,189,248,0.95)"
        : "rgba(148,163,184,0.65)";

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash(isActive ? [] : [10, 12]);
      ctx.lineWidth = isActive ? baseLineWidth * 1.4 : baseLineWidth;
      ctx.strokeStyle = strokeStyle;
      ctx.globalAlpha = isLocked ? 0.9 : 0.8;
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      const inside =
        isActive && me
          ? (() => {
              const dx = me.x - beacon.cx;
              const dy = me.y - beacon.cy;
              return dx * dx + dy * dy <= beacon.radius * beacon.radius;
            })()
          : false;

      if (inside) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(56,189,248,0.12)";
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isActive) {
        const progress = holdRequired > 0 ? Math.max(0, Math.min(1, mission.holdAccum / holdRequired)) : 0;
        if (progress > 0) {
          ctx.beginPath();
          ctx.strokeStyle = "rgba(56,189,248,0.95)";
          ctx.lineWidth = Math.max(baseLineWidth * 1.8, 2);
          ctx.setLineDash([]);
          ctx.arc(center.x, center.y, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
          ctx.stroke();
        }
      }

      if (isLocked) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(74,222,128,0.75)";
        ctx.arc(center.x, center.y, Math.max(4, radius * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }

  function drawScene(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawBeacons();
    drawRoute();
    drawMissileRoute();
    drawMissiles();

    for (const g of state.ghosts) {
      drawShip(g.x, g.y, g.vx, g.vy, "#9ca3af", false);
      drawGhostDot(g.x, g.y);
    }
    if (state.me) {
      drawShip(state.me.x, state.me.y, state.me.vx, state.me.vy, "#22d3ee", true);
    }
  }

  return {
    drawScene,
    drawGrid,
    drawBeacons,
    drawShip,
    drawGhostDot,
    drawRoute,
    drawMissileRoute,
    drawMissiles,
  };
}
