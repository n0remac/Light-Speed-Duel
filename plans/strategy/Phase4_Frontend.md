# Phase 4 Frontend Changes: Environmental Strategy

**Objective**: Render obstacles and provide visual feedback for environmental mechanics.

---

## 4.1 Obstacle Rendering

**File**: `internal/server/web/src/game.ts`

Add rendering for different obstacle types:

```typescript
interface ObstacleSnapshot {
    id: string;
    x: number;
    y: number;
    radius: number;
    type: "asteroid" | "station" | "debris";
    blocksLight: boolean;
    coolsShips: boolean;
    coolRate: number;
}

// Store obstacles in app state
// File: internal/server/web/src/state.ts
export interface AppState {
    // ... existing fields ...
    obstacles: ObstacleSnapshot[];
}

// Render all obstacles
function drawObstacles() {
    if (!stateRef.obstacles) return;

    for (const obstacle of stateRef.obstacles) {
        switch (obstacle.type) {
            case "asteroid":
                drawAsteroid(obstacle);
                break;
            case "station":
                drawStation(obstacle);
                break;
            case "debris":
                drawDebris(obstacle);
                break;
        }
    }
}

// Draw asteroid (gray rocky circle)
function drawAsteroid(obstacle: ObstacleSnapshot) {
    ctx.save();

    // Main body
    ctx.fillStyle = "#4a4a4a";
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Texture details (random craters)
    ctx.fillStyle = "#3a3a3a";
    const craters = 5;
    for (let i = 0; i < craters; i++) {
        const angle = (i / craters) * Math.PI * 2;
        const dist = obstacle.radius * 0.3;
        const x = obstacle.x + Math.cos(angle) * dist;
        const y = obstacle.y + Math.sin(angle) * dist;
        const r = obstacle.radius * 0.15;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Light-blocking indicator
    if (obstacle.blocksLight) {
        ctx.strokeStyle = "rgba(255, 100, 100, 0.3)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.radius + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.restore();
}

// Draw cooling station (blue glowing circle)
function drawStation(obstacle: ObstacleSnapshot) {
    ctx.save();

    // Glow effect
    const gradient = ctx.createRadialGradient(
        obstacle.x, obstacle.y, 0,
        obstacle.x, obstacle.y, obstacle.radius
    );
    gradient.addColorStop(0, "rgba(100, 150, 255, 0.4)");
    gradient.addColorStop(0.5, "rgba(100, 150, 255, 0.2)");
    gradient.addColorStop(1, "rgba(100, 150, 255, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
    ctx.fill();

    // Station structure
    ctx.strokeStyle = "#6699ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(obstacle.x, obstacle.y, obstacle.radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Cooling indicator (snowflake icon)
    ctx.fillStyle = "#aaccff";
    ctx.font = `${obstacle.radius * 0.5}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("❄", obstacle.x, obstacle.y);

    // Cooling rate label
    if (mouseNearObstacle(obstacle)) {
        drawObstacleTooltip(obstacle);
    }

    ctx.restore();
}

// Draw debris (small gray circle)
function drawDebris(obstacle: ObstacleSnapshot) {
    ctx.save();

    ctx.fillStyle = "#555";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

// Check if mouse is near obstacle
function mouseNearObstacle(obstacle: ObstacleSnapshot): boolean {
    if (!mousePos) return false;

    const dx = mousePos.x - obstacle.x;
    const dy = mousePos.y - obstacle.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    return dist <= obstacle.radius + 20;
}

// Draw obstacle tooltip
function drawObstacleTooltip(obstacle: ObstacleSnapshot) {
    const lines: string[] = [];

    if (obstacle.type === "station") {
        lines.push(`Cooling Station`);
        lines.push(`Cooling: +${obstacle.coolRate}/s`);
        lines.push(`Radius: ${obstacle.radius.toFixed(0)}`);
    } else if (obstacle.type === "asteroid") {
        lines.push(`Asteroid`);
        if (obstacle.blocksLight) {
            lines.push(`Blocks line-of-sight`);
        }
    }

    // Background
    ctx.save();
    ctx.font = "14px monospace";
    const lineHeight = 18;
    const padding = 8;
    const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));

    const tooltipX = obstacle.x + obstacle.radius + 20;
    const tooltipY = obstacle.y - (lines.length * lineHeight) / 2;

    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(
        tooltipX,
        tooltipY,
        maxWidth + padding * 2,
        lines.length * lineHeight + padding * 2
    );

    // Text
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
        ctx.fillText(line, tooltipX + padding, tooltipY + padding + i * lineHeight);
    });

    ctx.restore();
}
```

---

## 4.2 Occlusion Visualization

**File**: `internal/server/web/src/game.ts`

Show visual feedback when line-of-sight is blocked:

```typescript
// Draw perception rays (optional debug view)
function drawPerceptionRays() {
    if (!stateRef.me) return;

    const myPos = { x: stateRef.me.x, y: stateRef.me.y };

    // Draw rays to all ghosts
    for (const ghost of stateRef.ghosts) {
        const targetPos = { x: ghost.x, y: ghost.y };

        // Check if occluded
        const occluded = checkOcclusion(myPos, targetPos);

        ctx.save();
        ctx.strokeStyle = occluded ? "rgba(255, 100, 100, 0.3)" : "rgba(100, 255, 100, 0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        ctx.beginPath();
        ctx.moveTo(myPos.x, myPos.y);
        ctx.lineTo(targetPos.x, targetPos.y);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.restore();
    }
}

// Client-side occlusion check (matches server logic)
function checkOcclusion(p1: { x: number; y: number }, p2: { x: number; y: number }): boolean {
    for (const obstacle of stateRef.obstacles) {
        if (!obstacle.blocksLight) continue;

        if (lineIntersectsCircle(p1, p2, obstacle)) {
            return true;
        }
    }

    return false;
}

// Line-circle intersection (client-side)
function lineIntersectsCircle(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    obstacle: ObstacleSnapshot
): boolean {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const fx = p1.x - obstacle.x;
    const fy = p1.y - obstacle.y;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - obstacle.radius * obstacle.radius;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
        return false;
    }

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}
```

---

## 4.3 Cooling Zone Indicator

**File**: `internal/server/web/src/game.ts`

Highlight when player ship is in a cooling zone:

```typescript
function drawCoolingZoneIndicator() {
    if (!stateRef.me) return;

    const myPos = { x: stateRef.me.x, y: stateRef.me.y };
    let inCoolingZone = false;
    let totalCooling = 0;

    // Check all stations
    for (const obstacle of stateRef.obstacles) {
        if (!obstacle.coolsShips) continue;

        const dx = myPos.x - obstacle.x;
        const dy = myPos.y - obstacle.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= obstacle.radius) {
            inCoolingZone = true;
            totalCooling += obstacle.coolRate;

            // Draw connection line
            ctx.save();
            ctx.strokeStyle = "rgba(100, 200, 255, 0.5)";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            ctx.beginPath();
            ctx.moveTo(myPos.x, myPos.y);
            ctx.lineTo(obstacle.x, obstacle.y);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    // Show cooling indicator on ship
    if (inCoolingZone) {
        ctx.save();

        // Pulsing effect
        const pulseScale = 1 + Math.sin(Date.now() * 0.005) * 0.1;

        ctx.strokeStyle = "#66ccff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(myPos.x, myPos.y, 30 * pulseScale, 0, Math.PI * 2);
        ctx.stroke();

        // Cooling text
        ctx.fillStyle = "#66ccff";
        ctx.font = "14px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`+${totalCooling.toFixed(1)}/s`, myPos.x, myPos.y - 40);

        ctx.restore();
    }
}
```

---

## 4.4 Shadow/Occlusion Visualization

**File**: `internal/server/web/src/game.ts`

Draw shadow areas behind obstacles:

```typescript
function drawOcclusionShadows() {
    if (!stateRef.me) return;

    const myPos = { x: stateRef.me.x, y: stateRef.me.y };

    for (const obstacle of stateRef.obstacles) {
        if (!obstacle.blocksLight) continue;

        // Calculate shadow direction
        const dx = obstacle.x - myPos.x;
        const dy = obstacle.y - myPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < obstacle.radius) continue; // Skip if inside

        // Normalize direction
        const dirX = dx / dist;
        const dirY = dy / dist;

        // Perpendicular vector
        const perpX = -dirY;
        const perpY = dirX;

        // Shadow polygon points
        const shadowLength = 500; // Arbitrary long shadow
        const r = obstacle.radius;

        const p1x = obstacle.x + perpX * r;
        const p1y = obstacle.y + perpY * r;
        const p2x = obstacle.x - perpX * r;
        const p2y = obstacle.y - perpY * r;
        const p3x = p2x + dirX * shadowLength;
        const p3y = p2y + dirY * shadowLength;
        const p4x = p1x + dirX * shadowLength;
        const p4y = p1y + dirY * shadowLength;

        // Draw shadow
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";

        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p2x, p2y);
        ctx.lineTo(p3x, p3y);
        ctx.lineTo(p4x, p4y);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}
```

---

## 4.5 Map Selection UI

**File**: `internal/server/web/lobby.html`

Add map selection dropdown to room creation:

```html
<div class="room-creation">
    <h3>Create Room</h3>
    <label>Room Name:</label>
    <input type="text" id="room-name-input" placeholder="My Room">

    <label>Map:</label>
    <select id="map-select">
        <option value="empty">Empty Space</option>
        <option value="asteroids">Asteroid Field</option>
        <option value="stations">Cooling Stations</option>
        <option value="debris">Debris Mix</option>
    </select>

    <button id="create-room-btn">Create Room</button>
</div>
```

**File**: `internal/server/web/src/lobby.ts`

Send map selection to server:

```typescript
function createRoom() {
    const roomName = (document.getElementById("room-name-input") as HTMLInputElement).value;
    const mapName = (document.getElementById("map-select") as HTMLSelectElement).value;

    sendMessage({
        type: "create_room",
        name: roomName,
        map: mapName,
    });
}
```

---

## 4.6 Mini-Map with Obstacles

**File**: `internal/server/web/src/game.ts`

Add obstacles to mini-map display:

```typescript
function drawMiniMap() {
    const miniMapX = canvas.width - 220;
    const miniMapY = 20;
    const miniMapSize = 200;
    const scale = 0.05; // World units to minimap pixels

    ctx.save();

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(miniMapX, miniMapY, miniMapSize, miniMapSize);

    // Border
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 2;
    ctx.strokeRect(miniMapX, miniMapY, miniMapSize, miniMapSize);

    // Draw obstacles
    for (const obstacle of stateRef.obstacles) {
        const x = miniMapX + miniMapSize / 2 + obstacle.x * scale;
        const y = miniMapY + miniMapSize / 2 + obstacle.y * scale;
        const r = obstacle.radius * scale;

        ctx.fillStyle = obstacle.type === "station" ? "#6699ff" : "#666";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw ships
    // ... existing mini-map ship rendering ...

    ctx.restore();
}
```

---

## 4.7 Network Message Handling

**File**: `internal/server/web/src/net.ts`

Handle obstacle data from server:

```typescript
function handleMessage(msg: any) {
    switch (msg.type) {
        case "room_state":
            // Initial room state with obstacles
            stateRef.obstacles = msg.obstacles || [];
            busRef.emit("obstacles:loaded");
            break;

        case "obstacles_update":
            // Dynamic obstacle updates (future: moving obstacles)
            stateRef.obstacles = msg.obstacles;
            break;

        // ... other message types ...
    }
}
```

---

## 4.8 EventBus Integration

**File**: `internal/server/web/src/bus.ts`

```typescript
export interface EventMap {
    // ... existing events ...

    // Obstacle events
    "obstacles:loaded": {};
    "ship:enterCoolingZone": { obstacleId: string; coolRate: number };
    "ship:exitCoolingZone": { obstacleId: string };
}
```

---

## Implementation Priority

**High Priority** (Sprint 7):
- ✅ Basic obstacle rendering (asteroids, stations)
- ✅ Obstacle tooltips on hover
- ✅ Cooling zone indicator

**Medium Priority** (Sprint 8):
- Occlusion shadows
- Mini-map obstacles
- Map selection UI

**Low Priority** (Future):
- Perception ray visualization (debug mode)
- Animated obstacles (rotation, pulse)
- Sound effects for entering cooling zones

---

## Testing Checklist

- [ ] Test obstacle rendering at different zoom levels
- [ ] Verify tooltips appear on hover
- [ ] Test cooling zone indicator updates in real-time
- [ ] Verify occlusion shadows draw correctly
- [ ] Test mini-map with many obstacles
- [ ] Test performance with 20+ obstacles

---

## UX Notes

**Visual Hierarchy**:
1. Obstacles (medium priority, background layer)
2. Ships and missiles (high priority, foreground)
3. UI overlays (tooltips, indicators)

**Color Coding**:
- Gray: Asteroids (neutral, blocking)
- Blue: Cooling stations (beneficial)
- Red tint: Occlusion/shadows (danger)

**Accessibility**:
- Clear visual distinction between obstacle types
- Tooltips provide text information
- Cooling zones have both visual and text indicators

**Performance**:
- Use canvas layers for static obstacles
- Redraw obstacles only when camera moves
- Simplify rendering for distant obstacles
