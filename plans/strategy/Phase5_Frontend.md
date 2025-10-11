# Phase 5 Frontend Changes: Tutorial Expansion

**Objective**: Teach players new strategic systems through comprehensive tutorials.

---

## 5.1 Heat Management Tutorial

**File**: `internal/server/web/src/tutorial/steps_heat.ts` (new file)

```typescript
import type { TutorialStep } from "./engine";
import { state } from "../state";

export const heatTutorialSteps: TutorialStep[] = [
    {
        id: "heat-intro",
        text: "Welcome to Heat Management! Your ship generates heat when traveling above 150 units/second.",
        highlight: "#heat-bar",
        condition: () => true,
        autoAdvance: 5000,
    },
    {
        id: "heat-accumulation",
        text: "Watch your heat bar as you accelerate. Try flying above 150 speed.",
        highlight: "#heat-bar",
        condition: () => {
            const heat = state.me?.heat;
            return heat ? heat.value > 10 : false;
        },
    },
    {
        id: "heat-warning",
        text: "When heat reaches 70, you're in the warning zone (yellow). Slow down to cool off!",
        highlight: "#heat-bar",
        condition: () => {
            const heat = state.me?.heat;
            return heat ? heat.value >= heat.warnAt : false;
        },
    },
    {
        id: "heat-danger",
        text: "If heat reaches 100, your engines will STALL for 2.5 seconds! Plan your speed carefully.",
        highlight: "#heat-bar",
        condition: () => {
            const heat = state.me?.heat;
            return heat ? heat.value >= 90 : false;
        },
    },
    {
        id: "heat-cooling",
        text: "To cool down, fly BELOW 150 speed or stop completely. Use the 'H' key to halt.",
        highlight: "#ship-controls",
        condition: () => {
            const heat = state.me?.heat;
            if (!heat) return false;
            // Check if cooling (heat decreasing)
            const prevHeat = state.me?.prevHeat || heat.value;
            return heat.value < prevHeat;
        },
    },
    {
        id: "heat-route-planning",
        text: "Plan routes with heat in mind! Your route will show heat-colored segments (blue=cool, red=hot).",
        highlight: "#canvas",
        condition: () => {
            return state.me?.waypoints && state.me.waypoints.length > 0;
        },
    },
    {
        id: "heat-complete",
        text: "Heat management is key to victory! Balance speed and cooling to outlast your opponents.",
        autoAdvance: 5000,
        condition: () => true,
    },
];
```

---

## 5.2 Missile Economy Tutorial

**File**: `internal/server/web/src/tutorial/steps_missiles.ts` (new file)

```typescript
import type { TutorialStep } from "./engine";
import { state } from "../state";

export const missileEconomyTutorialSteps: TutorialStep[] = [
    {
        id: "missile-intro",
        text: "Missiles now cost HEAT to launch! This prevents spam and adds strategy.",
        highlight: "#missile-config-panel",
        condition: () => true,
        autoAdvance: 4000,
    },
    {
        id: "missile-cost",
        text: "Check the heat cost indicator. Faster missiles cost more heat!",
        highlight: "#missile-heat-cost",
        condition: () => state.missileConfig?.speed > 0,
    },
    {
        id: "missile-presets",
        text: "Use presets to quickly configure missiles. Scout (cheap) vs Sniper (expensive).",
        highlight: "#missile-presets",
        condition: () => true,
        autoAdvance: 5000,
    },
    {
        id: "missile-launch-blocked",
        text: "If your heat is too high, you CAN'T launch! Cool down first.",
        highlight: "#missile-launch-btn",
        condition: () => {
            const heat = state.me?.heat;
            if (!heat) return false;
            const cost = 15 + (state.missileConfig?.speed || 150) * 0.1;
            return (heat.value + cost) >= heat.overheatAt;
        },
    },
    {
        id: "missile-strategy",
        text: "Choose missile speed wisely: fast missiles for surprise, slow missiles to conserve heat.",
        condition: () => true,
        autoAdvance: 5000,
    },
    {
        id: "missile-complete",
        text: "Master missile heat economy to dominate your opponents!",
        autoAdvance: 3000,
        condition: () => true,
    },
];
```

---

## 5.3 Obstacle & Station Tutorial

**File**: `internal/server/web/src/tutorial/steps_obstacles.ts` (new file)

```typescript
import type { TutorialStep } from "./engine";
import { state } from "../state";

export const obstacleTutorialSteps: TutorialStep[] = [
    {
        id: "obstacle-intro",
        text: "This map has obstacles! Asteroids block line-of-sight, stations provide cooling.",
        highlight: "#canvas",
        condition: () => state.obstacles.length > 0,
        autoAdvance: 5000,
    },
    {
        id: "asteroid-occlusion",
        text: "Asteroids block your vision! Hide behind them to avoid detection.",
        highlight: "#canvas",
        condition: () => {
            return state.obstacles.some(o => o.type === "asteroid");
        },
        autoAdvance: 5000,
    },
    {
        id: "station-intro",
        text: "Blue glowing stations provide COOLING! Fly inside the radius to dissipate heat faster.",
        highlight: "#canvas",
        condition: () => {
            return state.obstacles.some(o => o.type === "station");
        },
        autoAdvance: 5000,
    },
    {
        id: "station-usage",
        text: "Try entering a cooling station. You'll see a blue ring and heat will drop rapidly!",
        highlight: "#heat-bar",
        condition: () => {
            // Check if player is near a station
            if (!state.me) return false;
            const myPos = { x: state.me.x, y: state.me.y };

            return state.obstacles.some(o => {
                if (!o.coolsShips) return false;
                const dx = myPos.x - o.x;
                const dy = myPos.y - o.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                return dist <= o.radius;
            });
        },
    },
    {
        id: "station-strategy",
        text: "Control stations to gain a heat advantage! Ambush enemies who come to cool down.",
        condition: () => true,
        autoAdvance: 5000,
    },
    {
        id: "obstacle-complete",
        text: "Use the environment wisely: hide, cool down, and outsmart your opponents!",
        autoAdvance: 3000,
        condition: () => true,
    },
];
```

---

## 5.4 Upgrade System Tutorial

**File**: `internal/server/web/src/tutorial/steps_upgrades.ts` (new file)

```typescript
import type { TutorialStep } from "./engine";
import { state } from "../state";

export const upgradeTutorialSteps: TutorialStep[] = [
    {
        id: "upgrade-intro",
        text: "You earn XP from matches! Use XP to purchase permanent ship upgrades.",
        highlight: "#upgrades-btn",
        condition: () => true,
        autoAdvance: 4000,
    },
    {
        id: "upgrade-menu",
        text: "Click the Upgrades button to open the upgrade tree.",
        highlight: "#upgrades-btn",
        condition: () => {
            // Check if upgrade modal is open
            return document.querySelector(".upgrade-modal") !== null;
        },
    },
    {
        id: "upgrade-branches",
        text: "There are 3 branches: Engineering (heat), Tactics (missiles), and Combat (HP/damage).",
        highlight: ".upgrade-branches",
        condition: () => document.querySelector(".upgrade-branches") !== null,
        autoAdvance: 5000,
    },
    {
        id: "upgrade-purchase",
        text: "Click an upgrade to purchase it. Each level costs more XP.",
        highlight: ".upgrade-node.affordable",
        condition: () => {
            // Check if player has purchased an upgrade
            return state.profile?.upgrades &&
                   Object.keys(state.profile.upgrades).length > 0;
        },
    },
    {
        id: "upgrade-strategy",
        text: "Choose upgrades that match your playstyle! Experiment to find what works.",
        condition: () => true,
        autoAdvance: 5000,
    },
    {
        id: "upgrade-complete",
        text: "Keep playing to earn more XP and unlock powerful upgrades!",
        autoAdvance: 3000,
        condition: () => true,
    },
];
```

---

## 5.5 Tutorial Sequencing System

**File**: `internal/server/web/src/tutorial/index.ts`

Update to register new tutorials:

```typescript
import { heatTutorialSteps } from "./steps_heat";
import { missileEconomyTutorialSteps } from "./steps_missiles";
import { obstacleTutorialSteps } from "./steps_obstacles";
import { upgradeTutorialSteps } from "./steps_upgrades";
import { basicFlightSteps } from "./steps_basic"; // existing

export function initTutorials(bus: EventBus, state: AppState) {
    // Register all tutorials
    registerTutorial("basic_flight", basicFlightSteps);
    registerTutorial("heat_management", heatTutorialSteps);
    registerTutorial("missile_economy", missileEconomyTutorialSteps);
    registerTutorial("obstacles", obstacleTutorialSteps);
    registerTutorial("upgrades", upgradeTutorialSteps);

    // Auto-start based on context
    bus.on("game:started", () => {
        startContextualTutorial();
    });
}

// Start tutorial based on game context
function startContextualTutorial() {
    const completedTutorials = getCompletedTutorials();

    // Tutorial progression
    if (!completedTutorials.includes("basic_flight")) {
        startTutorial("basic_flight");
    } else if (!completedTutorials.includes("heat_management")) {
        startTutorial("heat_management");
    } else if (!completedTutorials.includes("missile_economy")) {
        startTutorial("missile_economy");
    } else if (state.obstacles.length > 0 && !completedTutorials.includes("obstacles")) {
        startTutorial("obstacles");
    }
}

// Persist completed tutorials
function getCompletedTutorials(): string[] {
    const saved = localStorage.getItem("completedTutorials");
    return saved ? JSON.parse(saved) : [];
}

function markTutorialComplete(tutorialId: string) {
    const completed = getCompletedTutorials();
    if (!completed.includes(tutorialId)) {
        completed.push(tutorialId);
        localStorage.setItem("completedTutorials", JSON.stringify(completed));
    }
}
```

---

## 5.6 In-Game Tutorial UI

**File**: `internal/server/web/src/tutorial/engine.ts`

Enhance tutorial UI with better styling:

```typescript
export function renderTutorialStep(step: TutorialStep) {
    const container = document.getElementById("tutorial-container");
    if (!container) return;

    container.innerHTML = `
        <div class="tutorial-overlay ${step.highlight ? 'has-highlight' : ''}">
            <div class="tutorial-box">
                <div class="tutorial-progress">
                    Step ${currentStepIndex + 1} / ${currentTutorial.length}
                </div>
                <div class="tutorial-text">${step.text}</div>
                <div class="tutorial-actions">
                    ${step.autoAdvance ? '' : '<button id="tutorial-next-btn">Next</button>'}
                    <button id="tutorial-skip-btn">Skip Tutorial</button>
                </div>
            </div>
        </div>
    `;

    // Highlight element if specified
    if (step.highlight) {
        highlightElement(step.highlight);
    }

    // Attach event listeners
    document.getElementById("tutorial-next-btn")?.addEventListener("click", advanceTutorial);
    document.getElementById("tutorial-skip-btn")?.addEventListener("click", skipTutorial);

    // Auto-advance timer
    if (step.autoAdvance) {
        setTimeout(advanceTutorial, step.autoAdvance);
    }
}

function highlightElement(selector: string) {
    // Remove previous highlights
    document.querySelectorAll(".tutorial-highlight").forEach(el => {
        el.classList.remove("tutorial-highlight");
    });

    // Add highlight to target
    const target = document.querySelector(selector);
    if (target) {
        target.classList.add("tutorial-highlight");

        // Create spotlight effect
        const spotlight = document.createElement("div");
        spotlight.className = "tutorial-spotlight";
        spotlight.style.position = "absolute";
        spotlight.style.pointerEvents = "none";
        spotlight.style.zIndex = "999";

        const rect = target.getBoundingClientRect();
        spotlight.style.left = rect.left + "px";
        spotlight.style.top = rect.top + "px";
        spotlight.style.width = rect.width + "px";
        spotlight.style.height = rect.height + "px";

        document.body.appendChild(spotlight);
    }
}
```

**CSS Styling** (`internal/server/web/game.html`):

```css
.tutorial-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}

.tutorial-box {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 2px solid #3399ff;
    border-radius: 12px;
    padding: 24px;
    max-width: 500px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    pointer-events: all;
}

.tutorial-progress {
    font-size: 12px;
    color: #888;
    margin-bottom: 8px;
}

.tutorial-text {
    font-size: 16px;
    color: #fff;
    line-height: 1.5;
    margin-bottom: 16px;
}

.tutorial-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
}

.tutorial-actions button {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.2s;
}

#tutorial-next-btn {
    background: #3399ff;
    color: white;
}

#tutorial-next-btn:hover {
    background: #2277dd;
}

#tutorial-skip-btn {
    background: #444;
    color: #aaa;
}

#tutorial-skip-btn:hover {
    background: #555;
    color: #fff;
}

.tutorial-highlight {
    position: relative;
    z-index: 1001;
    box-shadow: 0 0 0 4px #3399ff, 0 0 20px rgba(51, 153, 255, 0.5);
    animation: tutorial-pulse 2s infinite;
}

@keyframes tutorial-pulse {
    0%, 100% {
        box-shadow: 0 0 0 4px #3399ff, 0 0 20px rgba(51, 153, 255, 0.5);
    }
    50% {
        box-shadow: 0 0 0 8px #3399ff, 0 0 30px rgba(51, 153, 255, 0.8);
    }
}

.tutorial-spotlight {
    border: 3px solid #3399ff;
    border-radius: 8px;
    box-shadow: 0 0 40px rgba(51, 153, 255, 0.8);
    animation: spotlight-pulse 2s infinite;
}

@keyframes spotlight-pulse {
    0%, 100% {
        opacity: 0.7;
    }
    50% {
        opacity: 1;
    }
}
```

---

## 5.7 Tutorial Menu

**File**: `internal/server/web/lobby.html`

Add tutorial selection to lobby:

```html
<div class="lobby-section">
    <h3>Tutorials</h3>
    <div class="tutorial-list">
        <button class="tutorial-btn" data-tutorial="basic_flight">
            <span class="tutorial-icon">✈️</span>
            <span class="tutorial-name">Basic Flight</span>
            <span class="tutorial-status completed">✓</span>
        </button>
        <button class="tutorial-btn" data-tutorial="heat_management">
            <span class="tutorial-icon">🔥</span>
            <span class="tutorial-name">Heat Management</span>
            <span class="tutorial-status locked">🔒</span>
        </button>
        <button class="tutorial-btn" data-tutorial="missile_economy">
            <span class="tutorial-icon">🚀</span>
            <span class="tutorial-name">Missile Economy</span>
            <span class="tutorial-status locked">🔒</span>
        </button>
        <button class="tutorial-btn" data-tutorial="obstacles">
            <span class="tutorial-icon">🌑</span>
            <span class="tutorial-name">Obstacles & Stations</span>
            <span class="tutorial-status locked">🔒</span>
        </button>
    </div>
</div>
```

**File**: `internal/server/web/src/lobby.ts`

```typescript
function initTutorialButtons() {
    const completed = getCompletedTutorials();

    document.querySelectorAll(".tutorial-btn").forEach(btn => {
        const tutorialId = btn.dataset.tutorial;
        if (!tutorialId) return;

        const statusEl = btn.querySelector(".tutorial-status");
        if (completed.includes(tutorialId)) {
            statusEl?.classList.add("completed");
            statusEl?.classList.remove("locked");
            statusEl!.textContent = "✓";
        }

        btn.addEventListener("click", () => {
            // Start game in tutorial mode
            startGameWithTutorial(tutorialId);
        });
    });
}
```

---

## Implementation Priority

**High Priority** (Sprint 9):
- ✅ Heat management tutorial
- ✅ Missile economy tutorial
- ✅ Tutorial sequencing system

**Medium Priority** (Sprint 10):
- Obstacle & station tutorial
- Upgrade system tutorial
- Tutorial menu UI

**Low Priority** (Future):
- Interactive tutorial challenges
- Tutorial replay system
- Tutorial achievement badges

---

## Testing Checklist

- [ ] Test each tutorial step triggers correctly
- [ ] Verify auto-advance timers work
- [ ] Test highlight system on all elements
- [ ] Verify tutorial progress persists
- [ ] Test skip functionality
- [ ] Test tutorial menu in lobby

---

## UX Notes

**Tutorial Flow**:
1. Basic flight (existing)
2. Heat management (Phase 1)
3. Missile economy (Phase 2)
4. Obstacles (Phase 4, map-dependent)
5. Upgrades (Phase 3, lobby)

**Completion Tracking**:
- LocalStorage for persistence
- Visual indicators (checkmarks)
- Unlock progression (linear)

**Accessibility**:
- Clear text instructions
- Multiple ways to advance (button + condition)
- Skip option always available
- Highlight system works with screen readers
