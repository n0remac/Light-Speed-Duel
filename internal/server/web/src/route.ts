// Shared route planning module for ships and missiles
// Phase 1: Shared Model & Helpers

import { clamp } from "./state";

// ============================================================================
// Types
// ============================================================================

export interface RouteWaypoint {
  x: number;
  y: number;
  speed?: number;
}

export interface RoutePoints {
  waypoints: RouteWaypoint[];
  worldPoints: { x: number; y: number }[];
  canvasPoints: { x: number; y: number }[];
}

// ============================================================================
// Constants
// ============================================================================

export const WAYPOINT_HIT_RADIUS = 12;
export const LEG_HIT_DISTANCE = 10;

// ============================================================================
// Builders
// ============================================================================

/**
 * Builds route points from a start position and waypoints.
 * Includes world coordinates (wrapping) and canvas coordinates.
 */
export function buildRoutePoints(
  start: { x: number; y: number },
  waypoints: RouteWaypoint[],
  world: { w: number; h: number },
  camera: () => { x: number; y: number },
  zoom: () => number,
  worldToCanvas: (p: { x: number; y: number }) => { x: number; y: number }
): RoutePoints {
  const worldPoints: { x: number; y: number }[] = [{ x: start.x, y: start.y }];

  for (const wp of waypoints) {
    worldPoints.push({ x: wp.x, y: wp.y });
  }

  const canvasPoints = worldPoints.map((point) => worldToCanvas(point));

  return {
    waypoints: waypoints.slice(),
    worldPoints,
    canvasPoints,
  };
}

// ============================================================================
// Geometry / Hit-test
// ============================================================================

/**
 * Calculates the distance from a point to a line segment.
 */
export function pointSegmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
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

/**
 * Hit-tests a route against a canvas point.
 * Returns the hit type and index, or null if no hit.
 */
export function hitTestRouteGeneric(
  canvasPoint: { x: number; y: number },
  routePoints: RoutePoints,
  opts: {
    waypointHitRadius?: number;
    legHitDistance?: number;
    skipLegs?: boolean;
  } = {}
): { type: "waypoint" | "leg"; index: number } | null {
  const waypointHitRadius = opts.waypointHitRadius ?? WAYPOINT_HIT_RADIUS;
  const legHitDistance = opts.legHitDistance ?? LEG_HIT_DISTANCE;
  const skipLegs = opts.skipLegs ?? false;

  const { waypoints, canvasPoints } = routePoints;

  if (waypoints.length === 0) {
    return null;
  }

  // Check waypoints first (higher priority than legs)
  // Skip index 0 which is the start position
  for (let i = 0; i < waypoints.length; i++) {
    const wpCanvas = canvasPoints[i + 1]; // +1 because first point is start position
    const dx = canvasPoint.x - wpCanvas.x;
    const dy = canvasPoint.y - wpCanvas.y;
    if (Math.hypot(dx, dy) <= waypointHitRadius) {
      return { type: "waypoint", index: i };
    }
  }

  // Check legs (lower priority)
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

// ============================================================================
// Dash Animation
// ============================================================================

/**
 * Updates dash offsets for route legs to create marching ants animation.
 * Mutates the provided store map.
 */
export function updateDashOffsetsForRoute(
  store: Map<number, number>,
  waypoints: Array<{ speed?: number }>,
  worldPoints: Array<{ x: number; y: number }>,
  canvasPoints: Array<{ x: number; y: number }>,
  fallbackSpeed: number,
  dtSeconds: number,
  cycle = 64
): void {
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

    if (
      !Number.isFinite(speed) ||
      speed <= 1e-3 ||
      !Number.isFinite(worldDist) ||
      worldDist <= 1e-3 ||
      canvasDist <= 1e-3
    ) {
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
    let next = (store.get(i) ?? 0) - dashSpeed * dtSeconds;
    if (!Number.isFinite(next)) {
      next = 0;
    } else {
      next = ((next % cycle) + cycle) % cycle;
    }
    store.set(i, next);
  }
  // Clean up old keys
  for (const key of Array.from(store.keys())) {
    if (key >= waypoints.length) {
      store.delete(key);
    }
  }
}

// ============================================================================
// Heat Projection
// ============================================================================

export interface HeatProjectionParams {
  markerSpeed: number;
  kUp: number;
  kDown: number;
  exp: number;
  max: number;
  overheatAt: number;
  warnAt: number;
}

export interface HeatProjectionResult {
  heatAtWaypoints: number[];
  willOverheat: boolean;
  overheatAt?: number; // Index where overheat occurs
}

/**
 * Projects heat along a route given initial heat and heat parameters.
 * Returns heat at each waypoint and whether overheat will occur.
 */
export function projectRouteHeat(
  route: RouteWaypoint[],
  initialHeat: number,
  params: HeatProjectionParams
): HeatProjectionResult {
  const result: HeatProjectionResult = {
    heatAtWaypoints: [],
    willOverheat: false,
  };

  if (route.length === 0) {
    return result;
  }

  let heat = clamp(initialHeat, 0, params.max);
  let pos = { x: route[0].x, y: route[0].y };
  let currentSpeed = route[0].speed ?? params.markerSpeed;

  result.heatAtWaypoints.push(heat);

  for (let i = 1; i < route.length; i++) {
    const targetPos = route[i];
    const targetSpeed = targetPos.speed ?? params.markerSpeed;

    // Calculate distance and time
    const dx = targetPos.x - pos.x;
    const dy = targetPos.y - pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 0.001) {
      result.heatAtWaypoints.push(heat);
      continue;
    }

    // Average speed during segment
    const avgSpeed = (currentSpeed + targetSpeed) * 0.5;
    const segmentTime = distance / Math.max(avgSpeed, 1);

    // Calculate heat rate (match server formula)
    const Vn = Math.max(params.markerSpeed, 0.000001);
    const dev = avgSpeed - params.markerSpeed;
    const p = params.exp;

    let hdot: number;
    if (dev >= 0) {
      // Heating
      hdot = params.kUp * Math.pow(dev / Vn, p);
    } else {
      // Cooling
      hdot = -params.kDown * Math.pow(Math.abs(dev) / Vn, p);
    }

    // Update heat
    heat += hdot * segmentTime;
    heat = clamp(heat, 0, params.max);

    result.heatAtWaypoints.push(heat);

    // Check for overheat
    if (!result.willOverheat && heat >= params.overheatAt) {
      result.willOverheat = true;
      result.overheatAt = i;
    }

    pos = { x: targetPos.x, y: targetPos.y };
    currentSpeed = targetSpeed;
  }

  return result;
}

/**
 * Compatibility wrapper for missile heat projection.
 * Missiles start at zero heat.
 */
export function projectMissileHeatCompat(
  route: RouteWaypoint[],
  defaultSpeed: number,
  heatParams: HeatProjectionParams
): HeatProjectionResult {
  // Missiles start at zero heat
  // Ensure all waypoints have speed set (use default if missing)
  const routeWithSpeed = route.map((wp) => ({
    x: wp.x,
    y: wp.y,
    speed: wp.speed ?? defaultSpeed,
  }));

  return projectRouteHeat(routeWithSpeed, 0, heatParams);
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Linear color interpolation between two RGB colors.
 */
export function interpolateColor(
  color1: [number, number, number],
  color2: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(color1[0] + (color2[0] - color1[0]) * t),
    Math.round(color1[1] + (color2[1] - color1[1]) * t),
    Math.round(color1[2] + (color2[2] - color1[2]) * t),
  ];
}

/**
 * Color palette for route rendering.
 */
export interface RoutePalette {
  // Default line color (when no heat data)
  defaultLine: string;
  // Selection highlight color
  selection: string;
  // Waypoint colors
  waypointDefault: string;
  waypointSelected: string;
  waypointDragging?: string;
  waypointStroke: string;
  waypointStrokeSelected?: string;
  // Heat gradient colors (from cool to hot)
  heatCoolRgb?: [number, number, number];
  heatHotRgb?: [number, number, number];
}

/**
 * Default ship palette (blue theme).
 */
export const SHIP_PALETTE: RoutePalette = {
  defaultLine: "#38bdf8",
  selection: "#f97316",
  waypointDefault: "#38bdf8",
  waypointSelected: "#f97316",
  waypointDragging: "#facc15",
  waypointStroke: "#0f172a",
  heatCoolRgb: [100, 150, 255],
  heatHotRgb: [255, 50, 50],
};

/**
 * Missile palette (red theme).
 */
export const MISSILE_PALETTE: RoutePalette = {
  defaultLine: "#f87171aa",
  selection: "#f97316",
  waypointDefault: "#f87171",
  waypointSelected: "#facc15",
  waypointStroke: "#7f1d1d",
  waypointStrokeSelected: "#854d0e",
  heatCoolRgb: [248, 129, 129],
  heatHotRgb: [220, 38, 38],
};

export interface DrawPlannedRouteOptions {
  // Canvas points for the route
  routePoints: RoutePoints;
  // Selection state (which waypoint/leg is selected)
  selection: { type: "waypoint" | "leg"; index: number } | null;
  // Dragged waypoint index (for drag-and-drop)
  draggedWaypoint?: number | null;
  // Dash animation offsets
  dashStore: Map<number, number>;
  // Color palette (defaults to ship palette)
  palette?: RoutePalette;
  // Whether to show the route legs
  showLegs: boolean;
  // Heat parameters and initial heat (optional)
  heatParams?: HeatProjectionParams;
  initialHeat?: number;
  // Default speed for waypoints without speed set
  defaultSpeed: number;
  // World points (for heat calculation)
  worldPoints?: { x: number; y: number }[];
}

/**
 * Draws a planned route (ship or missile) with unified visuals.
 * Uses ship-style rendering by default, with optional palette override.
 */
export function drawPlannedRoute(
  ctx: CanvasRenderingContext2D,
  opts: DrawPlannedRouteOptions
): void {
  const {
    routePoints,
    selection,
    draggedWaypoint,
    dashStore,
    palette = SHIP_PALETTE,
    showLegs,
    heatParams,
    initialHeat = 0,
    defaultSpeed,
    worldPoints,
  } = opts;

  const { waypoints, canvasPoints } = routePoints;

  if (waypoints.length === 0) {
    return;
  }

  // Calculate heat projection if heat params available
  let heatProjection: HeatProjectionResult | null = null;
  if (heatParams && worldPoints && worldPoints.length > 0) {
    const routeForHeat: RouteWaypoint[] = worldPoints.map((pt, i) => ({
      x: pt.x,
      y: pt.y,
      speed: i === 0 ? undefined : waypoints[i - 1]?.speed ?? defaultSpeed,
    }));
    heatProjection = projectRouteHeat(routeForHeat, initialHeat, heatParams);
  }

  // Draw route segments
  if (showLegs) {
    let currentHeat = initialHeat;

    for (let i = 0; i < waypoints.length; i++) {
      const isFirstLeg = i === 0;
      const isSelected = selection?.type === "leg" && selection.index === i;

      // Get heat at end of this segment
      let segmentHeat = currentHeat;
      if (heatProjection && i + 1 < heatProjection.heatAtWaypoints.length) {
        segmentHeat = heatProjection.heatAtWaypoints[i + 1];
      }

      // Calculate heat-based color if heat data available
      let strokeStyle: string;
      let lineWidth: number;
      let lineDash: number[] | null = null;
      let alphaOverride: number | null = null;

      if (isSelected) {
        // Selection styling
        strokeStyle = palette.selection;
        lineWidth = 3.5;
        lineDash = [4, 4];
      } else if (heatProjection && heatParams && palette.heatCoolRgb && palette.heatHotRgb) {
        // Heat-based color interpolation (ship style)
        const heatRatio = clamp(segmentHeat / heatParams.overheatAt, 0, 1);
        const color = interpolateColor(palette.heatCoolRgb, palette.heatHotRgb, heatRatio);
        const baseWidth = isFirstLeg ? 3 : 1.5;
        lineWidth = baseWidth + heatRatio * 4;
        const alpha = isFirstLeg ? 1 : 0.4;
        strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
        lineDash = isFirstLeg ? [6, 6] : [8, 8];
      } else {
        // Default styling (no heat)
        const baseWidth = isFirstLeg ? 3 : 1.5;
        lineWidth = baseWidth;
        strokeStyle = palette.defaultLine;
        lineDash = isFirstLeg ? [6, 6] : [8, 8];
        alphaOverride = isFirstLeg ? 1 : 0.4;
      }

      ctx.save();
      if (lineDash) {
        ctx.setLineDash(lineDash);
      }
      if (alphaOverride !== null) {
        ctx.globalAlpha = alphaOverride;
      }
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.lineDashOffset = dashStore.get(i) ?? 0;
      ctx.moveTo(canvasPoints[i].x, canvasPoints[i].y);
      ctx.lineTo(canvasPoints[i + 1].x, canvasPoints[i + 1].y);
      ctx.stroke();
      ctx.restore();

      currentHeat = segmentHeat;
    }
  }

  // Draw waypoint markers
  for (let i = 0; i < waypoints.length; i++) {
    const pt = canvasPoints[i + 1]; // +1 because first point is start position
    const isSelected = selection?.type === "waypoint" && selection.index === i;
    const isDragging = draggedWaypoint === i;

    // Determine fill color
    let fillColor: string;
    if (isSelected) {
      fillColor = palette.waypointSelected;
    } else if (isDragging && palette.waypointDragging) {
      fillColor = palette.waypointDragging;
    } else if (heatProjection && heatParams) {
      // Heat-based waypoint coloring (threshold-based for missiles)
      const heat = heatProjection.heatAtWaypoints[i + 1] ?? 0;
      const heatRatio = heat / heatParams.max;
      const warnRatio = heatParams.warnAt / heatParams.max;
      const overheatRatio = heatParams.overheatAt / heatParams.max;

      if (heatRatio < warnRatio) {
        fillColor = "#33aa33"; // Green
      } else if (heatRatio < overheatRatio) {
        fillColor = "#ffaa33"; // Orange
      } else {
        fillColor = "#ff3333"; // Red
      }
    } else {
      fillColor = palette.waypointDefault;
    }

    // Determine stroke color
    const strokeColor = isSelected && palette.waypointStrokeSelected
      ? palette.waypointStrokeSelected
      : palette.waypointStroke;

    // Draw waypoint
    ctx.save();
    ctx.beginPath();
    const radius = isSelected || isDragging ? 7 : 5;
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = isSelected || isDragging ? 0.95 : 0.8;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
    ctx.restore();
  }
}
