# Phase 2 Frontend Changes: Missile Heat System Visualization

**Objective**: Provide clear visual feedback for missile heat mechanics and route planning with heat management.

---

## 2.1 Missile Heat Visualization Architecture

### Design Philosophy

Missiles should display heat information similar to ships:
- **Heat bars for missiles**: Each missile shows its current heat level
- **Heat projection on routes**: Preview heat changes along planned missile routes
- **Color-coded feedback**: Visual indicators for heat state (cold, warm, hot, critical)
- **Preset configurations**: Quick-select missile types with different heat profiles
- **Planning tools**: Help players understand heat consequences before launch

---

## 2.2 Missile Heat Display

**File**: `internal/server/web/src/game.ts`

### Render Missile Heat Bars

Add heat visualization for each missile in flight:

```typescript
function drawMissileHeatBar(ctx: CanvasRenderingContext2D, missile: MissileSnapshot, camera: Camera) {
    if (!missile.heat) return;

    const screenPos = worldToScreen(camera, missile.pos.x, missile.pos.y);

    // Heat bar dimensions
    const barWidth = 40;
    const barHeight = 4;
    const barX = screenPos.x - barWidth / 2;
    const barY = screenPos.y + 20;  // Below missile

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

    // Heat fill
    const heatRatio = missile.heat.value / missile.heat.max;
    const fillWidth = barWidth * heatRatio;

    // Color based on heat level
    let heatColor: string;
    if (heatRatio < missile.heat.warnAt / missile.heat.max) {
        heatColor = "#33aa33";  // Green - safe
    } else if (heatRatio < missile.heat.overheatAt / missile.heat.max) {
        heatColor = "#ffaa33";  // Orange - warning
    } else {
        heatColor = "#ff3333";  // Red - critical
    }

    ctx.fillStyle = heatColor;
    ctx.fillRect(barX, barY, fillWidth, barHeight);

    // Heat value text (small)
    ctx.font = "10px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(
        `${missile.heat.value.toFixed(0)}/${missile.heat.max.toFixed(0)}`,
        screenPos.x,
        barY + barHeight + 12
    );
}

function drawMissiles(ctx: CanvasRenderingContext2D, state: AppState, camera: Camera) {
    for (const missile of state.missiles) {
        // Draw missile body
        const screenPos = worldToScreen(camera, missile.pos.x, missile.pos.y);
        ctx.fillStyle = "#ff4444";
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw heat bar
        drawMissileHeatBar(ctx, missile, camera);

        // Draw agro radius if targeted
        if (missile.target) {
            ctx.strokeStyle = "rgba(255, 100, 100, 0.3)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            const agroScreenRadius = missile.agroRadius * camera.zoom;
            ctx.arc(screenPos.x, screenPos.y, agroScreenRadius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}
```

---

## 2.3 Missile Route Heat Projection

**File**: `internal/server/web/src/game.ts`

### Visualize Heat Along Planned Routes

Show projected heat at each waypoint before launching:

```typescript
interface MissileRouteProjection {
    waypoints: Vec2[];
    heatAtWaypoints: number[];  // Heat level at each waypoint
    willOverheat: boolean;      // True if route causes overheat
    overheatAt?: number;        // Index of waypoint where overheat occurs
}

// Calculate heat projection for missile route
function projectMissileHeat(
    route: Vec2[],
    config: MissileConfig,
    heatParams: HeatParams
): MissileRouteProjection {
    const projection: MissileRouteProjection = {
        waypoints: route,
        heatAtWaypoints: [],
        willOverheat: false,
    };

    let heat = 0;  // Missiles start at zero heat
    let pos = route[0];
    let speed = 0;

    projection.heatAtWaypoints.push(heat);

    for (let i = 1; i < route.length; i++) {
        const targetPos = route[i];
        const targetSpeed = config.speed;

        // Calculate distance and time
        const dx = targetPos.x - pos.x;
        const dy = targetPos.y - pos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 0.001) {
            projection.heatAtWaypoints.push(heat);
            continue;
        }

        // Average speed during segment
        const avgSpeed = (speed + targetSpeed) * 0.5;
        const segmentTime = distance / Math.max(avgSpeed, 1);

        // Calculate heat rate (match server formula)
        const Vn = Math.max(heatParams.markerSpeed, 0.000001);
        const dev = avgSpeed - heatParams.markerSpeed;
        const p = heatParams.exp;

        let hdot: number;
        if (dev >= 0) {
            // Heating
            hdot = heatParams.kUp * Math.pow(dev / Vn, p);
        } else {
            // Cooling
            hdot = -heatParams.kDown * Math.pow(Math.abs(dev) / Vn, p);
        }

        // Update heat
        heat += hdot * segmentTime;
        heat = Math.max(0, Math.min(heat, heatParams.max));

        projection.heatAtWaypoints.push(heat);

        // Check for overheat
        if (heat >= heatParams.overheatAt && !projection.willOverheat) {
            projection.willOverheat = true;
            projection.overheatAt = i;
        }

        // Update position and speed
        pos = targetPos;
        speed = targetSpeed;
    }

    return projection;
}

// Draw heat projection overlay on missile route
function drawMissileRouteHeatProjection(
    ctx: CanvasRenderingContext2D,
    projection: MissileRouteProjection,
    camera: Camera
) {
    if (projection.waypoints.length === 0) return;

    // Draw heat gradient along route
    for (let i = 0; i < projection.waypoints.length - 1; i++) {
        const wp1 = projection.waypoints[i];
        const wp2 = projection.waypoints[i + 1];
        const heat1 = projection.heatAtWaypoints[i];
        const heat2 = projection.heatAtWaypoints[i + 1];

        const screen1 = worldToScreen(camera, wp1.x, wp1.y);
        const screen2 = worldToScreen(camera, wp2.x, wp2.y);

        // Color based on heat level
        const maxHeat = Math.max(heat1, heat2);
        const heatRatio = maxHeat / 50;  // Assume max 50 for missiles

        let color: string;
        if (heatRatio < 0.7) {
            color = `rgba(51, 170, 51, 0.6)`;  // Green
        } else if (heatRatio < 1.0) {
            color = `rgba(255, 170, 51, 0.6)`;  // Orange
        } else {
            color = `rgba(255, 51, 51, 0.8)`;  // Red - overheat!
        }

        // Draw segment with heat color
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(screen1.x, screen1.y);
        ctx.lineTo(screen2.x, screen2.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw heat values at waypoints
    for (let i = 0; i < projection.waypoints.length; i++) {
        const wp = projection.waypoints[i];
        const heat = projection.heatAtWaypoints[i];
        const screen = worldToScreen(camera, wp.x, wp.y);

        // Heat indicator circle
        const heatRatio = heat / 50;
        let fillColor: string;
        if (heatRatio < 0.7) {
            fillColor = "#33aa33";
        } else if (heatRatio < 1.0) {
            fillColor = "#ffaa33";
        } else {
            fillColor = "#ff3333";
        }

        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Heat text
        ctx.font = "11px monospace";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(
            heat.toFixed(1),
            screen.x,
            screen.y - 12
        );
    }

    // Warning if will overheat
    if (projection.willOverheat && projection.overheatAt !== undefined) {
        const overheatWp = projection.waypoints[projection.overheatAt];
        const screen = worldToScreen(camera, overheatWp.x, overheatWp.y);

        ctx.fillStyle = "rgba(255, 51, 51, 0.8)";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⚠ OVERHEAT", screen.x, screen.y + 25);
    }
}
```

---

## 2.4 Missile Configuration Presets UI

**File**: `internal/server/web/src/state.ts`

Define missile presets with heat characteristics:

```typescript
export interface MissilePreset {
    name: string;
    description: string;
    speed: number;
    agroRadius: number;
    heatParams: {
        max: number;
        warnAt: number;
        overheatAt: number;
        markerSpeed: number;
        kUp: number;
        kDown: number;
        exp: number;
    };
}

export const MISSILE_PRESETS: MissilePreset[] = [
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
            exp: 1.5,
        },
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
            exp: 1.5,
        },
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
            exp: 1.5,
        },
    },
];
```

**File**: `internal/server/web/src/game.ts`

Create preset selector UI:

```typescript
function initMissilePresetUI() {
    const container = document.getElementById("missile-presets-container");
    if (!container) return;

    container.innerHTML = "";

    MISSILE_PRESETS.forEach((preset, index) => {
        const card = document.createElement("div");
        card.className = "missile-preset-card";
        card.innerHTML = `
            <div class="preset-header">
                <h3>${preset.name}</h3>
                <div class="preset-badge">${preset.speed} m/s</div>
            </div>
            <p class="preset-description">${preset.description}</p>
            <div class="preset-stats">
                <div class="stat">
                    <span class="stat-label">Speed:</span>
                    <span class="stat-value">${preset.speed}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Agro:</span>
                    <span class="stat-value">${preset.agroRadius}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Heat Cap:</span>
                    <span class="stat-value">${preset.heatParams.max}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Marker:</span>
                    <span class="stat-value">${preset.heatParams.markerSpeed}</span>
                </div>
            </div>
        `;

        card.addEventListener("click", () => {
            selectMissilePreset(preset);

            // Highlight selected
            document.querySelectorAll(".missile-preset-card").forEach(c => {
                c.classList.remove("selected");
            });
            card.classList.add("selected");
        });

        container.appendChild(card);
    });
}

function selectMissilePreset(preset: MissilePreset) {
    stateRef.missileConfig = {
        speed: preset.speed,
        agroRadius: preset.agroRadius,
        heatConfig: preset.heatParams,
    };

    busRef.emit("missile:presetSelected", { preset: preset.name });

    // Update UI
    updateMissileConfigDisplay();
}
```

**CSS Styling** (add to `internal/server/web/game.html` or CSS file):

```css
#missile-presets-container {
    display: flex;
    gap: 12px;
    padding: 12px;
    overflow-x: auto;
}

.missile-preset-card {
    min-width: 180px;
    padding: 12px;
    background: #2a2a2a;
    border: 2px solid #444;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.missile-preset-card:hover {
    background: #333;
    border-color: #666;
    transform: translateY(-2px);
}

.missile-preset-card.selected {
    background: #1a3a5a;
    border-color: #3399ff;
    box-shadow: 0 0 12px rgba(51, 153, 255, 0.4);
}

.preset-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.preset-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: bold;
}

.preset-badge {
    background: #444;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    color: #aaa;
}

.preset-description {
    font-size: 12px;
    color: #aaa;
    margin: 8px 0;
    line-height: 1.4;
}

.preset-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    font-size: 11px;
}

.stat {
    display: flex;
    justify-content: space-between;
}

.stat-label {
    color: #888;
}

.stat-value {
    color: #fff;
    font-weight: bold;
}
```

---

## 2.5 Missile Route Planning Interface

**File**: `internal/server/web/src/game.ts`

### Interactive Heat-Aware Route Planning

```typescript
interface MissileRoutePlanningState {
    waypoints: Vec2[];
    projection: MissileRouteProjection | null;
    hoveredWaypoint: number | null;
}

let missileRoutePlanning: MissileRoutePlanningState = {
    waypoints: [],
    projection: null,
    hoveredWaypoint: null,
};

function handleMissileRouteClick(worldPos: Vec2) {
    // Add waypoint to route
    missileRoutePlanning.waypoints.push(worldPos);

    // Recalculate heat projection
    if (missileRoutePlanning.waypoints.length > 1) {
        const config = stateRef.missileConfig;
        missileRoutePlanning.projection = projectMissileHeat(
            missileRoutePlanning.waypoints,
            config,
            config.heatConfig || MISSILE_PRESETS[1].heatParams  // Default to Hunter
        );
    }

    busRef.emit("missile:routeUpdated", {
        waypointCount: missileRoutePlanning.waypoints.length,
    });

    // Redraw canvas
    requestAnimationFrame(() => drawGame());
}

function clearMissileRoute() {
    missileRoutePlanning.waypoints = [];
    missileRoutePlanning.projection = null;
    missileRoutePlanning.hoveredWaypoint = null;

    busRef.emit("missile:routeCleared", {});
    requestAnimationFrame(() => drawGame());
}

function launchMissileFromPlannedRoute() {
    if (missileRoutePlanning.waypoints.length < 2) {
        showNotification("Need at least 2 waypoints for missile route", "warning");
        return;
    }

    if (missileRoutePlanning.projection?.willOverheat) {
        const confirm = window.confirm(
            "⚠ This missile will overheat and explode before completing its route. Launch anyway?"
        );
        if (!confirm) return;
    }

    // Send missile route to server
    const route = {
        waypoints: missileRoutePlanning.waypoints,
    };
    const config = stateRef.missileConfig;

    netRef.sendMissileRoute(route, config);

    // Clear planning state
    clearMissileRoute();

    busRef.emit("missile:launched", {});
}
```

---

## 2.6 Heat Display in Missile Configuration

**File**: `internal/server/web/src/game.ts`

Show heat impact when configuring missiles:

```typescript
function updateMissileConfigDisplay() {
    const config = stateRef.missileConfig;
    if (!config) return;

    // Speed slider
    const speedSlider = document.getElementById("missile-speed-slider") as HTMLInputElement;
    const speedLabel = document.getElementById("missile-speed-label");
    if (speedSlider && speedLabel) {
        speedSlider.value = config.speed.toString();

        // Calculate time to overheat at this speed
        const heatParams = config.heatConfig || MISSILE_PRESETS[1].heatParams;
        const timeToOverheat = calculateTimeToOverheat(config.speed, heatParams);

        speedLabel.innerHTML = `
            Speed: ${config.speed} m/s
            <span class="heat-info">(Overheat in ${timeToOverheat.toFixed(1)}s)</span>
        `;
    }

    // Agro slider
    const agroSlider = document.getElementById("missile-agro-slider") as HTMLInputElement;
    const agroLabel = document.getElementById("missile-agro-label");
    if (agroSlider && agroLabel) {
        agroSlider.value = config.agroRadius.toString();
        agroLabel.textContent = `Detection Radius: ${config.agroRadius}`;
    }

    // Heat capacity display
    const heatCapacityDisplay = document.getElementById("missile-heat-capacity");
    if (heatCapacityDisplay) {
        const heatParams = config.heatConfig || MISSILE_PRESETS[1].heatParams;
        heatCapacityDisplay.innerHTML = `
            <div class="heat-capacity-bar">
                <div class="capacity-fill" style="width: ${(heatParams.max / 100) * 100}%"></div>
                <span class="capacity-label">${heatParams.max} heat</span>
            </div>
            <div class="heat-efficiency">
                Efficient speed: ${heatParams.markerSpeed} m/s
            </div>
        `;
    }
}

function calculateTimeToOverheat(speed: number, heatParams: any): number {
    if (speed <= heatParams.markerSpeed) {
        return Infinity;  // Won't overheat at this speed
    }

    const Vn = Math.max(heatParams.markerSpeed, 0.000001);
    const dev = speed - heatParams.markerSpeed;
    const hdot = heatParams.kUp * Math.pow(dev / Vn, heatParams.exp);

    if (hdot <= 0) return Infinity;

    return heatParams.overheatAt / hdot;
}
```

---

## 2.7 Missile Heat State Updates

**File**: `internal/server/web/src/state.ts`

Update state interface to include missile heat:

```typescript
export interface MissileSnapshot {
    id: number;
    pos: Vec2;
    vel: Vec2;
    agroRadius: number;
    target?: number;
    heat?: {  // NEW
        value: number;
        max: number;
        warnAt: number;
        overheatAt: number;
    };
}

export interface MissileConfig {
    speed: number;
    agroRadius: number;
    heatConfig?: {  // NEW
        max: number;
        warnAt: number;
        overheatAt: number;
        markerSpeed: number;
        kUp: number;
        kDown: number;
        exp: number;
    };
}
```

---

## 2.8 EventBus Events

**File**: `internal/server/web/src/bus.ts`

Add missile heat events:

```typescript
export interface EventMap {
    // ... existing events ...

    // Missile heat events
    "missile:presetSelected": { preset: string };
    "missile:routeUpdated": { waypointCount: number };
    "missile:routeCleared": {};
    "missile:launched": {};
    "missile:overheated": { missileId: number; pos: Vec2 };
}
```

---

## 2.9 Tutorial Integration

**File**: `internal/server/web/src/tutorial/steps_missiles.ts`

Add tutorial for missile heat system:

```typescript
export const missileHeatTutorialSteps: TutorialStep[] = [
    {
        id: "missile-heat-intro",
        text: "Missiles have their own heat systems! They'll explode if they overheat.",
        highlight: "#missile-presets-container",
        condition: () => true,
    },
    {
        id: "missile-preset-selection",
        text: "Choose a missile type. Scout missiles are slow but efficient. Sniper missiles are fast but overheat quickly.",
        highlight: ".missile-preset-card",
        condition: () => true,
    },
    {
        id: "missile-route-heat",
        text: "Plan your missile route carefully. The route shows projected heat at each waypoint.",
        highlight: "#missile-route-canvas",
        condition: () => missileRoutePlanning.waypoints.length > 0,
    },
    {
        id: "missile-overheat-warning",
        text: "⚠ If a route will cause overheat, you'll see a warning. The missile will explode before completing its mission!",
        highlight: null,
        condition: () => missileRoutePlanning.projection?.willOverheat === true,
    },
    {
        id: "missile-heat-strategy",
        text: "Strategy: Plan slower approach routes with fast final strikes. Or use Scout missiles for long-range missions.",
        highlight: null,
        condition: () => true,
    },
];
```

---

## 2.10 Visual Effects for Overheat

**File**: `internal/server/web/src/game.ts`

Add explosion effect when missile overheats:

```typescript
busRef.on("missile:overheated", ({ missileId, pos }) => {
    // Play explosion sound
    audioRef.playSFX("explosion_small", pos);

    // Spawn particle effect
    spawnExplosionParticles(pos, "overheat");

    // Show warning notification
    showNotification("⚠ Missile overheated and exploded!", "warning");
});

function spawnExplosionParticles(pos: Vec2, type: "overheat" | "impact") {
    const particleCount = type === "overheat" ? 20 : 30;
    const color = type === "overheat" ? "#ff9933" : "#ff3333";

    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount;
        const speed = 50 + Math.random() * 100;

        particles.push({
            pos: { ...pos },
            vel: {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed,
            },
            color: color,
            lifetime: 0.5 + Math.random() * 0.5,
            age: 0,
        });
    }
}
```

---

## 2.11 Testing Checklist

- [ ] Missile heat bars display correctly
- [ ] Heat projection shows accurate values along routes
- [ ] Preset selection updates configuration
- [ ] Overheat warnings appear when route causes overheat
- [ ] Visual explosion effect plays on missile overheat
- [ ] Heat bars update in real-time for missiles in flight
- [ ] Color coding matches heat levels (green/orange/red)
- [ ] Tutorial steps guide players through heat system

---

## 2.12 Performance Considerations

### Optimization Tips

```typescript
// Only calculate heat projection when route changes
let cachedProjection: MissileRouteProjection | null = null;
let cachedRouteHash: string = "";

function getOrUpdateProjection(route: Vec2[], config: MissileConfig): MissileRouteProjection {
    const routeHash = JSON.stringify(route) + JSON.stringify(config);

    if (routeHash === cachedRouteHash && cachedProjection) {
        return cachedProjection;
    }

    cachedProjection = projectMissileHeat(route, config, config.heatConfig!);
    cachedRouteHash = routeHash;

    return cachedProjection;
}

// Only draw heat bars for missiles near camera
function drawMissileHeatBar(ctx: CanvasRenderingContext2D, missile: MissileSnapshot, camera: Camera) {
    // Cull if offscreen
    const screenPos = worldToScreen(camera, missile.pos.x, missile.pos.y);
    if (screenPos.x < -50 || screenPos.x > canvas.width + 50 ||
        screenPos.y < -50 || screenPos.y > canvas.height + 50) {
        return;  // Don't draw offscreen missiles
    }

    // ... rest of drawing code ...
}
```

---

## 2.13 Accessibility Features

### Color-blind Friendly Design

```typescript
// Add icons in addition to colors
function getHeatIcon(heatRatio: number): string {
    if (heatRatio < 0.7) return "✓";    // Safe
    if (heatRatio < 1.0) return "⚠";    // Warning
    return "✕";                          // Critical
}

// Add text labels
function drawMissileHeatBar(ctx: CanvasRenderingContext2D, missile: MissileSnapshot, camera: Camera) {
    // ... existing code ...

    const heatRatio = missile.heat.value / missile.heat.max;
    const icon = getHeatIcon(heatRatio);

    ctx.font = "12px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(icon, screenPos.x + 15, barY + 3);
}
```

---

## 2.14 Implementation Priority

**High Priority** (Sprint 3-4):
- ✅ Missile heat bar visualization
- ✅ Heat projection on planned routes
- ✅ Preset configuration UI
- ✅ Overheat warnings and visual feedback

**Medium Priority** (Sprint 5):
- Tutorial integration
- Visual effects for overheat explosions
- Performance optimizations

**Low Priority** (Future):
- Advanced heat analytics (graphs, history)
- Custom heat configuration UI
- Heat-based missile AI feedback

---

## 2.15 Future Enhancements

### Heat Trails
```typescript
// Visual trail showing heat history
interface HeatTrail {
    segments: Array<{ pos: Vec2; heat: number; time: number }>;
}

// Draw heat trail behind missile
function drawMissileHeatTrail(ctx: CanvasRenderingContext2D, trail: HeatTrail) {
    for (let i = 0; i < trail.segments.length - 1; i++) {
        const seg1 = trail.segments[i];
        const seg2 = trail.segments[i + 1];

        const heatColor = getHeatColor(seg1.heat);
        const alpha = 1 - (i / trail.segments.length);  // Fade older segments

        ctx.strokeStyle = `${heatColor}${Math.floor(alpha * 255).toString(16)}`;
        ctx.lineWidth = 2;
        // ... draw segment ...
    }
}
```

### Missile Heat Comparison Tool
```typescript
// Compare heat profiles of different presets
function showPresetComparison(presets: MissilePreset[]) {
    // Display side-by-side heat curves
    // Show time to overheat at various speeds
    // Highlight optimal use cases
}
```

---

**Last Updated**: 2025-10-11
**Version**: 2.0 (Complete Heat Visualization)
