# Phase 3 Frontend Changes: Upgrade & Progression System

**Objective**: Create an intuitive upgrade UI in the lobby with clear progression feedback.

---

## 3.1 Upgrade Tree UI Module

**File**: `internal/server/web/src/upgrades.ts` (new file)

```typescript
import type { EventBus } from "./bus";

export interface UpgradeNode {
    id: string;
    name: string;
    description: string;
    branch: "engineering" | "tactics" | "combat";
    level: number;
    maxLevel: number;
    baseCost: number;
    effects: { [param: string]: number };
}

export interface PlayerProfile {
    id: string;
    upgrades: { [upgradeId: string]: number };
    xp: number;
    matches: number;
    wins: number;
}

// Upgrade tree data (synced from server)
let upgradeTree: UpgradeNode[] = [];
let playerProfile: PlayerProfile | null = null;

// Initialize upgrade system
export function initUpgradeUI(bus: EventBus, container: HTMLElement) {
    // Request profile and upgrade tree from server
    sendMessage({ type: "get_profile" });
    sendMessage({ type: "get_upgrade_tree" });

    // Render upgrade tree when data arrives
    bus.on("profile:loaded", (data) => {
        playerProfile = data.profile;
        renderUpgradeTree(container);
    });

    bus.on("upgradeTree:loaded", (data) => {
        upgradeTree = data.upgrades;
        renderUpgradeTree(container);
    });

    bus.on("upgrade:purchased", (data) => {
        playerProfile = data.profile;
        renderUpgradeTree(container);
        showNotification(`Upgraded ${data.upgradeName}!`, "success");
    });
}

// Render the full upgrade tree
function renderUpgradeTree(container: HTMLElement) {
    if (!playerProfile || upgradeTree.length === 0) {
        container.innerHTML = "<div class='loading'>Loading upgrades...</div>";
        return;
    }

    container.innerHTML = `
        <div class="upgrade-header">
            <h2>Ship Upgrades</h2>
            <div class="player-stats">
                <div class="stat">
                    <span class="stat-label">XP:</span>
                    <span class="stat-value">${playerProfile.xp}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Matches:</span>
                    <span class="stat-value">${playerProfile.matches}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Wins:</span>
                    <span class="stat-value">${playerProfile.wins}</span>
                </div>
            </div>
        </div>
        <div class="upgrade-branches">
            ${renderBranch("engineering", "⚙️ Engineering")}
            ${renderBranch("tactics", "🎯 Tactics")}
            ${renderBranch("combat", "⚔️ Combat")}
        </div>
    `;
}

// Render a single upgrade branch
function renderBranch(branch: string, title: string): string {
    const branchUpgrades = upgradeTree.filter(u => u.branch === branch);

    return `
        <div class="upgrade-branch" data-branch="${branch}">
            <h3 class="branch-title">${title}</h3>
            <div class="upgrade-list">
                ${branchUpgrades.map(u => renderUpgradeNode(u)).join('')}
            </div>
        </div>
    `;
}

// Render a single upgrade node
function renderUpgradeNode(upgrade: UpgradeNode): string {
    const currentLevel = playerProfile?.upgrades[upgrade.id] || 0;
    const nextLevelCost = upgrade.baseCost * (currentLevel + 1);
    const canAfford = (playerProfile?.xp || 0) >= nextLevelCost;
    const atMaxLevel = currentLevel >= upgrade.maxLevel;

    const statusClass = atMaxLevel ? "max-level" :
                       canAfford ? "affordable" : "locked";

    return `
        <div class="upgrade-node ${statusClass}" data-upgrade-id="${upgrade.id}">
            <div class="upgrade-name">${upgrade.name}</div>
            <div class="upgrade-description">${upgrade.description}</div>
            <div class="upgrade-effects">
                ${Object.entries(upgrade.effects).map(([param, value]) =>
                    `<div class="effect">${formatEffect(param, value)}</div>`
                ).join('')}
            </div>
            <div class="upgrade-level">
                <div class="level-dots">
                    ${Array.from({ length: upgrade.maxLevel }, (_, i) =>
                        `<span class="dot ${i < currentLevel ? 'filled' : ''}"></span>`
                    ).join('')}
                </div>
                <div class="level-text">Level ${currentLevel}/${upgrade.maxLevel}</div>
            </div>
            ${!atMaxLevel ? `
                <button class="upgrade-btn"
                        data-upgrade-id="${upgrade.id}"
                        ${!canAfford ? 'disabled' : ''}>
                    ${canAfford ? `Upgrade (${nextLevelCost} XP)` : `Locked (${nextLevelCost} XP)`}
                </button>
            ` : `
                <div class="max-level-badge">MAX LEVEL</div>
            `}
        </div>
    `;
}

// Format effect for display
function formatEffect(param: string, valuePerLevel: number): string {
    const paramNames: { [key: string]: string } = {
        "heat_kdown": "Heat Dissipation",
        "heat_kup": "Heat Generation",
        "heat_max": "Max Heat",
        "max_hp": "Max HP",
        "acceleration": "Acceleration",
        "missile_dmg": "Missile Damage",
        "perception_bonus": "Sensor Range",
        "craft_speed": "Craft Speed",
        "missile_capacity": "Missile Capacity",
    };

    const name = paramNames[param] || param;
    const sign = valuePerLevel > 0 ? "+" : "";
    return `${name}: ${sign}${valuePerLevel}`;
}

// Attach event listeners after rendering
export function attachUpgradeListeners(bus: EventBus) {
    document.querySelectorAll(".upgrade-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const upgradeId = (e.target as HTMLElement).dataset.upgradeId;
            if (upgradeId) {
                purchaseUpgrade(upgradeId, bus);
            }
        });
    });
}

// Purchase an upgrade
function purchaseUpgrade(upgradeId: string, bus: EventBus) {
    sendMessage({
        type: "purchase_upgrade",
        upgradeId: upgradeId,
    });

    // Server will respond with updated profile or error
}
```

---

## 3.2 XP Award Notifications

**File**: `internal/server/web/src/game.ts`

Display XP awards during gameplay:

```typescript
// Listen for XP awards
busRef.on("xp:awarded", (data: { amount: number; reason: string }) => {
    showXPNotification(data.amount, data.reason);
});

function showXPNotification(amount: number, reason: string) {
    const notification = document.createElement("div");
    notification.className = "xp-notification";
    notification.innerHTML = `
        <div class="xp-amount">+${amount} XP</div>
        <div class="xp-reason">${formatXPReason(reason)}</div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add("visible"), 10);

    // Animate out and remove
    setTimeout(() => {
        notification.classList.remove("visible");
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function formatXPReason(reason: string): string {
    const reasons: { [key: string]: string } = {
        "kill": "Enemy Destroyed",
        "victory": "Victory!",
        "damage": "Damage Dealt",
        "participation": "Match Completed",
    };
    return reasons[reason] || reason;
}
```

**CSS Styling** (`internal/server/web/game.html` or separate CSS):

```css
.xp-notification {
    position: fixed;
    top: 100px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    opacity: 0;
    transform: translateX(100px);
    transition: all 0.3s ease;
    z-index: 1000;
}

.xp-notification.visible {
    opacity: 1;
    transform: translateX(0);
}

.xp-amount {
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 4px;
}

.xp-reason {
    font-size: 14px;
    opacity: 0.9;
}
```

---

## 3.3 Lobby Integration

**File**: `internal/server/web/src/lobby.ts`

Add upgrades button to lobby:

```typescript
import { initUpgradeUI, attachUpgradeListeners } from "./upgrades";

// ... existing lobby code ...

function initLobby() {
    // ... existing initialization ...

    // Add upgrades button
    const upgradesBtn = document.getElementById("upgrades-btn");
    if (upgradesBtn) {
        upgradesBtn.addEventListener("click", () => {
            openUpgradeModal();
        });
    }
}

function openUpgradeModal() {
    const modal = document.createElement("div");
    modal.className = "upgrade-modal";
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content">
            <button class="modal-close">&times;</button>
            <div id="upgrade-container"></div>
        </div>
    `;

    document.body.appendChild(modal);

    // Initialize upgrade UI
    const container = modal.querySelector("#upgrade-container") as HTMLElement;
    initUpgradeUI(busRef, container);
    attachUpgradeListeners(busRef);

    // Close modal
    modal.querySelector(".modal-close")?.addEventListener("click", () => {
        modal.remove();
    });

    modal.querySelector(".modal-backdrop")?.addEventListener("click", () => {
        modal.remove();
    });
}
```

**HTML Template** (`internal/server/web/lobby.html`):

```html
<!-- Add upgrades button to lobby UI -->
<div class="lobby-actions">
    <button id="create-room-btn">Create Room</button>
    <button id="upgrades-btn">⚙️ Upgrades</button>
</div>
```

**CSS for Modal**:

```css
.upgrade-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
}

.modal-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
}

.modal-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #1a1a1a;
    border-radius: 12px;
    padding: 24px;
    max-width: 900px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-close {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none;
    border: none;
    font-size: 32px;
    color: #888;
    cursor: pointer;
}

.modal-close:hover {
    color: #fff;
}
```

---

## 3.4 Upgrade Tree Styling

**CSS** (`internal/server/web/lobby.html` or separate CSS):

```css
.upgrade-header {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid #333;
}

.upgrade-header h2 {
    margin: 0 0 12px 0;
    color: #fff;
}

.player-stats {
    display: flex;
    gap: 24px;
}

.stat {
    display: flex;
    align-items: center;
    gap: 8px;
}

.stat-label {
    color: #888;
    font-size: 14px;
}

.stat-value {
    color: #fff;
    font-size: 18px;
    font-weight: bold;
}

.upgrade-branches {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
}

.upgrade-branch {
    background: #2a2a2a;
    border-radius: 8px;
    padding: 16px;
}

.branch-title {
    margin: 0 0 16px 0;
    font-size: 18px;
    color: #fff;
}

.upgrade-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.upgrade-node {
    background: #1a1a1a;
    border: 2px solid #333;
    border-radius: 8px;
    padding: 12px;
    transition: all 0.2s;
}

.upgrade-node.affordable {
    border-color: #3399ff;
}

.upgrade-node.max-level {
    border-color: #44ff44;
    opacity: 0.7;
}

.upgrade-node:hover {
    background: #222;
}

.upgrade-name {
    font-size: 16px;
    font-weight: bold;
    color: #fff;
    margin-bottom: 4px;
}

.upgrade-description {
    font-size: 12px;
    color: #888;
    margin-bottom: 8px;
}

.upgrade-effects {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 8px;
}

.effect {
    font-size: 12px;
    color: #aaa;
}

.upgrade-level {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}

.level-dots {
    display: flex;
    gap: 4px;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #333;
}

.dot.filled {
    background: #3399ff;
}

.level-text {
    font-size: 12px;
    color: #888;
}

.upgrade-btn {
    width: 100%;
    padding: 8px;
    background: #3399ff;
    border: none;
    border-radius: 4px;
    color: white;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
}

.upgrade-btn:hover:not(:disabled) {
    background: #2277dd;
}

.upgrade-btn:disabled {
    background: #444;
    color: #666;
    cursor: not-allowed;
}

.max-level-badge {
    text-align: center;
    padding: 8px;
    background: #44ff44;
    color: #1a1a1a;
    font-weight: bold;
    border-radius: 4px;
}
```

---

## 3.5 EventBus Integration

**File**: `internal/server/web/src/bus.ts`

```typescript
export interface EventMap {
    // ... existing events ...

    // Upgrade system events
    "profile:loaded": { profile: PlayerProfile };
    "upgradeTree:loaded": { upgrades: UpgradeNode[] };
    "upgrade:purchased": { profile: PlayerProfile; upgradeName: string };
    "xp:awarded": { amount: number; reason: string };
}
```

---

## 3.6 Network Message Handlers

**File**: `internal/server/web/src/net.ts`

```typescript
function handleMessage(msg: any) {
    switch (msg.type) {
        case "profile":
            busRef.emit("profile:loaded", { profile: msg.data });
            break;

        case "upgrade_tree":
            busRef.emit("upgradeTree:loaded", { upgrades: msg.data });
            break;

        case "upgrade_purchased":
            busRef.emit("upgrade:purchased", {
                profile: msg.profile,
                upgradeName: msg.upgradeName
            });
            break;

        case "xp_award":
            busRef.emit("xp:awarded", {
                amount: msg.amount,
                reason: msg.reason
            });
            break;

        // ... other message types ...
    }
}
```

---

## Implementation Priority

**High Priority** (Sprint 5):
- ✅ Upgrade tree UI module
- ✅ Lobby integration (modal)
- ✅ Purchase upgrade flow

**Medium Priority** (Sprint 6):
- XP award notifications
- Visual polish (animations, colors)
- Upgrade tooltips (detailed info)

**Low Priority** (Future):
- Upgrade comparison tool
- Respec system (reset upgrades)
- Upgrade preview (see effects before purchase)

---

## Testing Checklist

- [ ] Test upgrade tree rendering with empty profile
- [ ] Verify purchase button disabled when insufficient XP
- [ ] Test modal open/close functionality
- [ ] Verify XP notifications display correctly
- [ ] Test upgrade tree with max-level upgrades
- [ ] Test responsive layout on different screen sizes

---

## UX Notes

**Visual Hierarchy**:
1. Branch titles (large, emoji icons)
2. Upgrade nodes (cards with clear status)
3. Effects (secondary info)
4. Purchase buttons (clear call-to-action)

**Color Coding**:
- Blue: Affordable upgrades
- Green: Max level upgrades
- Gray: Locked upgrades (insufficient XP)

**Accessibility**:
- Keyboard navigation for upgrade tree
- Screen reader labels for all elements
- Clear visual feedback for all states
