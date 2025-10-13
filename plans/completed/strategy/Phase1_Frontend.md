# Phase 1 Frontend Changes: Enhanced Route Planning & Heat Visualization

**Objective**: Make route planning feel precise, visual, and physically meaningful.

---

## 1.1 Drag-to-Move Waypoints

**File**: `internal/server/web/src/game.ts`

Add interactive waypoint dragging with pointer events:

```typescript
// State for waypoint dragging
let draggedWaypoint: number | null = null;
let dragStartPos: { x: number; y: number } | null = null;

function onCanvasPointerDown(e: PointerEvent) {
    // ... existing code ...

    // Check if clicking on waypoint (visual detection)
    if (uiStateRef.shipTool === "select" && stateRef.me?.waypoints) {
        const wp = findWaypointAtPosition(mouseX, mouseY);
        if (wp !== null) {
            draggedWaypoint = wp;
            dragStartPos = { x: mouseX, y: mouseY };
            cv?.setPointerCapture(e.pointerId);
            e.preventDefault();
        }
    }
}

function onCanvasPointerMove(e: PointerEvent) {
    if (draggedWaypoint !== null && dragStartPos) {
        const worldPos = screenToWorld(e.offsetX, e.offsetY);

        // Send update to server
        sendMessage({
            type: "move_waypoint",
            index: draggedWaypoint,
            x: worldPos.x,
            y: worldPos.y
        });

        // Optimistic update for smooth dragging
        if (stateRef.me && stateRef.me.waypoints) {
            stateRef.me.waypoints[draggedWaypoint].x = worldPos.x;
            stateRef.me.waypoints[draggedWaypoint].y = worldPos.y;
        }
    }
}

function onCanvasPointerUp(e: PointerEvent) {
    if (draggedWaypoint !== null) {
        busRef.emit("ship:waypointMoved", {
            index: draggedWaypoint,
            x: stateRef.me!.waypoints[draggedWaypoint].x,
            y: stateRef.me!.waypoints[draggedWaypoint].y
        });

        draggedWaypoint = null;
        dragStartPos = null;
        cv?.releasePointerCapture(e.pointerId);
    }
}

// Helper: Find waypoint at screen position
function findWaypointAtPosition(x: number, y: number): number | null {
    if (!stateRef.me?.waypoints) return null;

    const WAYPOINT_RADIUS = 8; // pixels

    for (let i = 0; i < stateRef.me.waypoints.length; i++) {
        const wp = stateRef.me.waypoints[i];
        const screenPos = worldToScreen(wp.x, wp.y);
        const dx = screenPos.x - x;
        const dy = screenPos.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= WAYPOINT_RADIUS) {
            return i;
        }
    }

    return null;
}
```

**UX Improvements**:
- Show larger hitbox on waypoint hover (visual feedback)
- Change cursor to `grab` when hovering over waypoint
- Change cursor to `grabbing` when dragging
- Highlight the waypoint being dragged

---

## 1.2 Heat-Weighted Route Visualization

**File**: `internal/server/web/src/game.ts`

Enhance route rendering with heat-based colors and thickness:

```typescript
function drawShipRoute(ship: ShipSnapshot) {
    if (!ship.waypoints || ship.waypoints.length === 0) return;
    if (!ship.heat) return;

    let pos = { x: ship.x, y: ship.y };
    let currentHeat = ship.heat.value;

    for (let i = 0; i < ship.waypoints.length; i++) {
        const wp = ship.waypoints[i];

        // Estimate heat change for this segment
        const segmentHeat = estimateHeatChange(pos, wp, currentHeat, ship.heat);

        // Color based on projected heat
        const heatRatio = Math.min(1.0, segmentHeat / ship.heat.overheatAt);
        const color = interpolateColor(
            [100, 150, 255], // cool blue
            [255, 50, 50],   // hot red
            heatRatio
        );

        // Thickness based on heat (thicker = hotter)
        ctx.strokeStyle = `rgb(${color.join(',')})`;
        ctx.lineWidth = 2 + (heatRatio * 4); // 2-6px

        // Draw segment
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(wp.x, wp.y);
        ctx.stroke();

        // Draw heat value tooltip on hover
        if (isNearSegment(mousePos, pos, wp, 10)) {
            drawHeatTooltip(wp.x, wp.y, segmentHeat, ship.heat.overheatAt);
        }

        // Update for next iteration
        pos = { x: wp.x, y: wp.y };
        currentHeat = segmentHeat;
    }
}

// Estimate heat after traveling from pos1 to pos2 at waypoint speed
function estimateHeatChange(
    pos1: { x: number; y: number },
    wp: WaypointSnapshot,
    currentHeat: number,
    heatParams: HeatSnapshot
): number {
    const dx = wp.x - pos1.x;
    const dy = wp.y - pos1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const estimatedTime = distance / wp.speed;

    // Heat accumulation if speed > vmin
    if (wp.speed > heatParams.vmin) {
        const heatRate = heatParams.kUp;
        return currentHeat + (heatRate * estimatedTime);
    } else {
        // Heat dissipation if speed < vmin
        const coolRate = heatParams.kDown;
        return Math.max(0, currentHeat - (coolRate * estimatedTime));
    }
}

// Linear color interpolation
function interpolateColor(
    color1: number[],
    color2: number[],
    t: number
): number[] {
    return [
        Math.round(color1[0] + (color2[0] - color1[0]) * t),
        Math.round(color1[1] + (color2[1] - color1[1]) * t),
        Math.round(color1[2] + (color2[2] - color1[2]) * t),
    ];
}

// Check if mouse is near a line segment
function isNearSegment(
    point: { x: number; y: number },
    start: { x: number; y: number },
    end: { x: number; y: number },
    threshold: number
): boolean {
    // Point-to-line-segment distance calculation
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return false;

    let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = start.x + t * dx;
    const projY = start.y + t * dy;
    const distSq = (point.x - projX) ** 2 + (point.y - projY) ** 2;

    return distSq <= threshold * threshold;
}

// Draw tooltip showing heat value
function drawHeatTooltip(
    x: number,
    y: number,
    heat: number,
    maxHeat: number
) {
    const text = `Heat: ${heat.toFixed(1)} / ${maxHeat}`;
    ctx.save();
    ctx.font = "12px monospace";
    const metrics = ctx.measureText(text);

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(x + 10, y - 20, metrics.width + 8, 18);

    // Text
    ctx.fillStyle = heat > maxHeat * 0.8 ? "#ff3333" : "#ffffff";
    ctx.fillText(text, x + 14, y - 8);
    ctx.restore();
}
```

---

## 1.3 "Hold" Command (Stop Thrust)

**File**: `internal/server/web/src/game.ts`

Add keyboard shortcut to clear all waypoints (stops ship):

```typescript
function onKeyDown(e: KeyboardEvent) {
    // ... existing shortcuts (W, M, Escape, etc.) ...

    // "H" key: Hold position (clear all waypoints)
    if (e.key === "h" || e.key === "H") {
        sendMessage({ type: "clear_waypoints" });
        busRef.emit("ship:waypointsCleared");

        // Optional: Visual feedback
        showNotification("Engines stopped", "info");
    }
}
```

**Additional UI**:
- Add "Hold (H)" button to ship control panel
- Show "HOLDING" indicator when ship has no waypoints and zero velocity
- Tutorial step explaining hold command

---

## 1.4 Heat Projection Display

**File**: `internal/server/web/src/game.ts`

Add visual indicator showing projected heat at each waypoint:

```typescript
function drawWaypointHeatIndicators(ship: ShipSnapshot) {
    if (!ship.waypoints || !ship.heat) return;

    let currentHeat = ship.heat.value;
    let pos = { x: ship.x, y: ship.y };

    for (let i = 0; i < ship.waypoints.length; i++) {
        const wp = ship.waypoints[i];
        currentHeat = estimateHeatChange(pos, wp, currentHeat, ship.heat);

        // Draw heat bar at waypoint
        const barWidth = 30;
        const barHeight = 4;
        const heatRatio = Math.min(1, currentHeat / ship.heat.overheatAt);

        ctx.save();

        // Background
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(wp.x - barWidth / 2, wp.y - 15, barWidth, barHeight);

        // Heat level
        ctx.fillStyle = heatRatio > 0.8 ? "#ff3333" :
                        heatRatio > 0.5 ? "#ffaa33" : "#33aaff";
        ctx.fillRect(
            wp.x - barWidth / 2,
            wp.y - 15,
            barWidth * heatRatio,
            barHeight
        );

        ctx.restore();

        pos = wp;
    }
}
```

---

## 1.5 EventBus Integration

**File**: `internal/server/web/src/bus.ts`

Add new events for waypoint manipulation:

```typescript
export interface EventMap {
    // ... existing events ...

    // Waypoint events
    "ship:waypointMoved": { index: number; x: number; y: number };
    "ship:waypointsCleared": {};
    "ship:heatProjectionUpdated": { heatValues: number[] };

    // UI events
    "ui:waypointHoverStart": { index: number };
    "ui:waypointHoverEnd": { index: number };
}
```

---

## Implementation Priority

**High Priority** (Sprint 1):
- ✅ Drag-to-move waypoints
- ✅ Basic heat-weighted route visualization
- ✅ Hold command (keyboard shortcut)

**Medium Priority** (Sprint 2):
- Heat tooltips on route segments
- Waypoint heat indicators
- Cursor feedback for dragging

**Low Priority** (Future):
- Advanced heat projection (account for acceleration)
- Route optimization suggestions
- Multi-waypoint selection/editing

---

## Testing Checklist

- [ ] Test waypoint dragging on touch devices
- [ ] Verify heat colors are visible on all backgrounds
- [ ] Test hold command during combat scenarios
- [ ] Verify heat tooltips don't obscure gameplay
- [ ] Test performance with many waypoints (10+)

---

## UX Notes

**Visual Hierarchy**:
1. Route path (heat-colored, thick when hot)
2. Waypoint markers (circles with heat bars)
3. Tooltips (on hover only)

**Accessibility**:
- Heat colors should work for colorblind users (use thickness + color)
- Keyboard shortcuts should be rebindable (future)
- Tooltips should not require precise hovering
