# Phase 2 Frontend Changes: Missile Economy & Heat Integration

**Objective**: Give players clear feedback on missile heat costs and launch restrictions.

---

## 2.1 Launch Heat Indicator

**File**: `internal/server/web/src/game.ts`

Show heat cost preview before launching missile:

```typescript
// Update missile launch button state based on heat
function updateMissileLaunchButtonState() {
    const route = getActiveMissileRoute();
    const heat = stateRef.me?.heat;
    const config = stateRef.missileConfig;

    if (!route || !heat || !config) return;

    // Calculate launch cost (must match server formula)
    const BASE_COST = 15.0;
    const SPEED_SCALE = 0.1;
    const launchCost = BASE_COST + (config.speed * SPEED_SCALE);

    // Check if launch would cause overheat
    const projectedHeat = heat.value + launchCost;
    const wouldOverheat = projectedHeat >= heat.overheatAt;

    // Update launch button
    const launchBtn = document.getElementById("missile-launch-btn");
    if (launchBtn) {
        launchBtn.disabled = wouldOverheat || route.waypoints.length === 0;

        // Visual feedback
        if (wouldOverheat) {
            launchBtn.classList.add("overheat-warning");
            launchBtn.title = "Cannot launch - would overheat!";
        } else {
            launchBtn.classList.remove("overheat-warning");
            launchBtn.title = `Launch missile (+${launchCost.toFixed(1)} heat)`;
        }
    }

    // Update heat cost display
    const costDisplay = document.getElementById("missile-heat-cost");
    if (costDisplay) {
        const heatAfter = Math.min(projectedHeat, heat.overheatAt);
        const heatRatio = heatAfter / heat.overheatAt;

        costDisplay.innerHTML = `
            <div class="heat-cost-label">Heat Cost:</div>
            <div class="heat-cost-value ${wouldOverheat ? 'danger' : ''}">
                +${launchCost.toFixed(1)}
            </div>
            <div class="heat-cost-bar">
                <div class="heat-cost-bar-current" style="width: ${(heat.value / heat.overheatAt) * 100}%"></div>
                <div class="heat-cost-bar-projected" style="width: ${(heatRatio * 100)}%"></div>
            </div>
            <div class="heat-cost-summary">
                ${heat.value.toFixed(1)} → ${heatAfter.toFixed(1)} / ${heat.overheatAt}
            </div>
        `;
    }
}

// Call this whenever missile config or heat changes
busRef.on("missile:configChanged", updateMissileLaunchButtonState);
busRef.on("state:updated", updateMissileLaunchButtonState);
```

**CSS Styling** (`internal/server/web/game.html` or separate CSS):

```css
.heat-cost-label {
    font-size: 12px;
    color: #888;
    margin-bottom: 4px;
}

.heat-cost-value {
    font-size: 18px;
    font-weight: bold;
    color: #ff9933;
}

.heat-cost-value.danger {
    color: #ff3333;
    animation: pulse 0.5s infinite;
}

.heat-cost-bar {
    position: relative;
    width: 100%;
    height: 8px;
    background: #222;
    border-radius: 4px;
    margin: 8px 0;
    overflow: hidden;
}

.heat-cost-bar-current {
    position: absolute;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, #3399ff, #ff9933);
    transition: width 0.2s;
}

.heat-cost-bar-projected {
    position: absolute;
    left: 0;
    height: 100%;
    background: rgba(255, 51, 51, 0.5);
    transition: width 0.2s;
}

.heat-cost-summary {
    font-size: 11px;
    color: #aaa;
    margin-top: 4px;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
}

#missile-launch-btn.overheat-warning {
    background: #ff3333;
    border-color: #ff3333;
    cursor: not-allowed;
}
```

---

## 2.2 Missile Configuration Presets

**File**: `internal/server/web/src/state.ts`

Define preset missile configurations:

```typescript
export interface MissilePreset {
    name: string;
    description: string;
    speed: number;
    agroRadius: number;
    heatCost: number; // Calculated for display
}

// Calculate heat cost for display
function calculateHeatCost(speed: number): number {
    return 15.0 + (speed * 0.1);
}

export const MISSILE_PRESETS: MissilePreset[] = [
    {
        name: "Scout",
        description: "Long range, slow, low heat",
        speed: 80,
        agroRadius: 1500,
        heatCost: calculateHeatCost(80), // 23
    },
    {
        name: "Hunter",
        description: "Balanced speed and detection",
        speed: 150,
        agroRadius: 800,
        heatCost: calculateHeatCost(150), // 30
    },
    {
        name: "Sniper",
        description: "Fast, narrow detection, high heat",
        speed: 220,
        agroRadius: 300,
        heatCost: calculateHeatCost(220), // 37
    },
    {
        name: "Custom",
        description: "Manual configuration",
        speed: 150,
        agroRadius: 600,
        heatCost: calculateHeatCost(150),
    },
];
```

**File**: `internal/server/web/src/game.ts`

Add preset selector UI:

```typescript
function initMissilePresetUI() {
    const presetContainer = document.getElementById("missile-presets");
    if (!presetContainer) return;

    presetContainer.innerHTML = "";

    MISSILE_PRESETS.forEach((preset, index) => {
        const btn = document.createElement("button");
        btn.className = "missile-preset-btn";
        btn.innerHTML = `
            <div class="preset-name">${preset.name}</div>
            <div class="preset-stats">
                <span>Speed: ${preset.speed}</span>
                <span>Range: ${preset.agroRadius}</span>
                <span>Heat: ${preset.heatCost.toFixed(1)}</span>
            </div>
        `;

        btn.addEventListener("click", () => {
            // Apply preset
            stateRef.missileConfig = {
                speed: preset.speed,
                agroRadius: preset.agroRadius,
            };

            // Update UI
            updateMissileConfigSliders();
            updateMissileLaunchButtonState();

            // Highlight selected preset
            document.querySelectorAll(".missile-preset-btn").forEach(b => {
                b.classList.remove("selected");
            });
            btn.classList.add("selected");

            busRef.emit("missile:presetSelected", { preset: preset.name });
        });

        presetContainer.appendChild(btn);
    });
}
```

**CSS for Presets**:

```css
#missile-presets {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
}

.missile-preset-btn {
    flex: 1;
    padding: 8px;
    background: #2a2a2a;
    border: 2px solid #444;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}

.missile-preset-btn:hover {
    background: #333;
    border-color: #666;
}

.missile-preset-btn.selected {
    background: #1a3a5a;
    border-color: #3399ff;
}

.preset-name {
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 4px;
}

.preset-stats {
    font-size: 11px;
    color: #888;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
```

---

## 2.3 Launch Error Handling

**File**: `internal/server/web/src/net.ts`

Handle error messages from server:

```typescript
function handleMessage(msg: any) {
    switch (msg.type) {
        case "error":
            handleError(msg);
            break;

        case "missile_launched":
            handleMissileLaunchSuccess();
            break;

        // ... other message types ...
    }
}

function handleError(msg: { code: string; message: string }) {
    console.error("Server error:", msg.code, msg.message);

    if (msg.code === "launch_failed") {
        showNotification(msg.message, "error");

        // Visual feedback
        const launchBtn = document.getElementById("missile-launch-btn");
        if (launchBtn) {
            launchBtn.classList.add("shake");
            setTimeout(() => launchBtn.classList.remove("shake"), 300);
        }

        busRef.emit("missile:launchFailed", { reason: msg.message });
    }
}

function handleMissileLaunchSuccess() {
    showNotification("Missile launched!", "success");
    busRef.emit("missile:launchSuccess");

    // Clear missile route after launch
    stateRef.missileRoute = null;
}
```

**CSS for Shake Animation**:

```css
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
}

.shake {
    animation: shake 0.3s;
}
```

---

## 2.4 Heat Cost Visualization on Missile Config Sliders

**File**: `internal/server/web/src/game.ts`

Show heat cost dynamically as user adjusts sliders:

```typescript
function updateMissileConfigSliders() {
    const speedSlider = document.getElementById("missile-speed-slider") as HTMLInputElement;
    const agroSlider = document.getElementById("missile-agro-slider") as HTMLInputElement;

    if (!speedSlider || !agroSlider) return;

    // Update speed slider
    speedSlider.value = stateRef.missileConfig.speed.toString();
    const speedLabel = document.getElementById("missile-speed-label");
    if (speedLabel) {
        const cost = 15.0 + (stateRef.missileConfig.speed * 0.1);
        speedLabel.textContent = `Speed: ${stateRef.missileConfig.speed} (Heat: +${cost.toFixed(1)})`;
    }

    // Update agro slider
    agroSlider.value = stateRef.missileConfig.agroRadius.toString();
    const agroLabel = document.getElementById("missile-agro-label");
    if (agroLabel) {
        agroLabel.textContent = `Detection: ${stateRef.missileConfig.agroRadius}`;
    }

    // Listen for changes
    speedSlider.addEventListener("input", () => {
        stateRef.missileConfig.speed = parseFloat(speedSlider.value);
        updateMissileConfigSliders();
        updateMissileLaunchButtonState();
        busRef.emit("missile:configChanged");
    });

    agroSlider.addEventListener("input", () => {
        stateRef.missileConfig.agroRadius = parseFloat(agroSlider.value);
        updateMissileConfigSliders();
        busRef.emit("missile:configChanged");
    });
}
```

---

## 2.5 EventBus Events

**File**: `internal/server/web/src/bus.ts`

Add new events for missile economy:

```typescript
export interface EventMap {
    // ... existing events ...

    // Missile economy events
    "missile:configChanged": {};
    "missile:presetSelected": { preset: string };
    "missile:launchSuccess": {};
    "missile:launchFailed": { reason: string };
    "missile:heatCostCalculated": { cost: number; wouldOverheat: boolean };
}
```

---

## 2.6 Tutorial Integration

**File**: `internal/server/web/src/tutorial/steps_missiles.ts`

Add tutorial steps for missile heat economy:

```typescript
export const missileHeatTutorialSteps: TutorialStep[] = [
    {
        id: "missile-heat-intro",
        text: "Missiles now cost heat to launch. Faster missiles cost more heat!",
        highlight: "#missile-heat-cost",
        condition: () => true,
    },
    {
        id: "missile-heat-warning",
        text: "If your heat is too high, you can't launch. Cool down first!",
        highlight: "#heat-bar",
        condition: () => {
            const heat = stateRef.me?.heat;
            return heat && heat.value > heat.warnAt;
        },
    },
    {
        id: "missile-presets",
        text: "Use presets to quickly configure missiles for different situations.",
        highlight: "#missile-presets",
        condition: () => true,
    },
];
```

---

## Implementation Priority

**High Priority** (Sprint 3):
- ✅ Launch heat indicator
- ✅ Launch error handling
- ✅ Heat cost on config sliders

**Medium Priority** (Sprint 4):
- Missile configuration presets
- Visual polish (animations, colors)

**Low Priority** (Future):
- Advanced preset management (save custom presets)
- Missile launch sound effects (pitch varies with heat)
- Heat cost comparison tool

---

## Testing Checklist

- [ ] Verify heat cost calculation matches server
- [ ] Test launch button disabled state when overheat risk
- [ ] Verify error messages display correctly
- [ ] Test preset selection and application
- [ ] Test slider updates trigger recalculation
- [ ] Verify heat cost display updates in real-time

---

## UX Notes

**Color Coding**:
- Green: Low heat cost (<20)
- Yellow: Medium heat cost (20-30)
- Red: High heat cost (>30)
- Flashing red: Would overheat

**Accessibility**:
- Color + text indicators (not color-only)
- Clear error messages (not just disabled button)
- Keyboard navigation for presets
