import type { EventBus } from "./bus";
import type { AppState, DagNode } from "./state";
import { UpgradeEffectType } from "./proto/proto/ws_messages_pb";
import { sendDagStart } from "./net";

let countdownInterval: number | null = null;

export function initUpgradesPanel(
  state: AppState,
  bus: EventBus
): void {
  // Create panel DOM structure
  const panel = createPanelElement();
  document.body.appendChild(panel);

  const container = panel.querySelector('.tech-tree-container') as HTMLElement;
  const closeBtn = panel.querySelector('.close-btn') as HTMLElement;
  const overlay = panel.querySelector('.panel-overlay') as HTMLElement;

  // Render function (throttled by signature of id:status)
  let lastSig = "";
  function computeSig(nodes: DagNode[]): string {
    return nodes
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(n => `${n.id}:${n.status}`)
      .join("|");
  }
  function renderUpgrades(force = false) {
    const all = state.dag?.nodes || [];
    // Be permissive: treat proto-mapped 'unit' as upgrades, but also allow id prefix
    const upgradeNodes = all.filter(n => n.kind === 'unit' || n.id.startsWith('upgrade.'));
    const sig = computeSig(upgradeNodes);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    renderTechTree(upgradeNodes, container);
  }

  // Toggle panel visibility
  function togglePanel(visible: boolean) {
    panel.classList.toggle('visible', visible);
    if (visible) {
      renderUpgrades();
    }
  }

  // Event listeners
  bus.on("upgrades:toggle", () => {
    const next = !panel.classList.contains('visible');
    togglePanel(next);
    if (next) renderUpgrades(true);
  });

  bus.on("upgrades:show", () => { togglePanel(true); renderUpgrades(true); });
  bus.on("upgrades:hide", () => togglePanel(false));

  closeBtn.addEventListener("click", () => togglePanel(false));
  overlay.addEventListener("click", () => togglePanel(false));

  // Subscribe to DAG updates (event-driven pattern)
  bus.on("state:updated", () => {
    if (panel.classList.contains('visible')) {
      renderUpgrades(false);
    }
  });

  // Handle node click
  container.addEventListener("click", (e) => {
    const nodeEl = (e.target as HTMLElement).closest("[data-node-id]");
    if (!nodeEl) return;

    const nodeId = nodeEl.getAttribute("data-node-id");
    const node = state.dag?.nodes.find(n => n.id === nodeId);

    if (node?.status === "available") {
      sendDagStart(nodeId!);
    }
  });
}

function createPanelElement(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'upgrades-panel';
  panel.innerHTML = `
    <div class="panel-overlay"></div>
    <div class="panel-content">
      <div class="panel-header">
        <h2>Ship Upgrades</h2>
        <button class="close-btn">×</button>
      </div>
      <div class="tech-tree-container"></div>
    </div>
  `;
  return panel;
}

function renderTechTree(nodes: DagNode[], container: HTMLElement): void {
  const sorted = nodes.slice().sort((a, b) => a.id.localeCompare(b.id));
  container.innerHTML = `
    <div class="tech-tree">
      ${sorted.length > 0 ? sorted.map(renderNode).join('') : '<div class=\"muted\">No upgrades available</div>'}
    </div>
  `;
}

function effectTypeToString(t: unknown): string {
  if (typeof t === "string") return t;
  if (typeof t === "number") {
    switch (t) {
      case UpgradeEffectType.SPEED_MULTIPLIER:
        return "speed_multiplier";
      case UpgradeEffectType.MISSILE_UNLOCK:
        return "missile_unlock";
      case UpgradeEffectType.HEAT_CAPACITY:
        return "heat_capacity";
      case UpgradeEffectType.HEAT_EFFICIENCY:
        return "heat_efficiency";
      default:
        return "unknown";
    }
  }
  return "unknown";
}

function renderNode(node: DagNode): string {
  const statusClass = `node-${node.status}`;
  const effectsHtml = node.effects?.map(e => {
    const type = effectTypeToString((e as any).type);
    const value = (e as any).value as number | string;
    const isShip = node.id.startsWith("upgrade.ship.");
    const isMissile = node.id.startsWith("upgrade.missile.");
    if (type === "missile_unlock") {
      return `Unlock ${value}`;
    }
    if (typeof value === "number") {
      const pct = ((value - 1) * 100);
      const pctStr = Number.isFinite(pct) ? pct.toFixed(0) : "0";
      if (type === "speed_multiplier") {
        return isShip ? `+${pctStr}% Ship Speed` : isMissile ? `+${pctStr}% Missile Speed` : `+${pctStr}% Speed`;
      }
      if (type === "heat_capacity") {
        return isShip ? `+${pctStr}% Ship Heat` : isMissile ? `+${pctStr}% Missile Heat` : `+${pctStr}% Heat Capacity`;
      }
      if (type === "heat_efficiency") {
        return `+${pctStr}% Cooling`;
      }
    }
    return "";
  }).join(', ') || '';

  const countdownHtml = node.status === 'in_progress'
    ? `<div class="countdown">${formatTime(node.remaining_s)}</div>`
    : '';

  return `
    <div class="node ${statusClass}" data-node-id="${node.id}">
      <h3>${node.label}</h3>
      ${effectsHtml ? `<p class="effects">${effectsHtml}</p>` : ''}
      <p class="duration">Duration: ${formatTime(node.duration_s)}</p>
      ${countdownHtml}
      ${node.status === 'available' ? '<button>Start</button>' : ''}
      ${node.status === 'completed' ? '<div class="checkmark">✓</div>' : ''}
    </div>
  `;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function startCountdownTimer(state: AppState, bus: EventBus): void {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  countdownInterval = window.setInterval(() => {
    const upgradeNodes = state.dag?.nodes.filter(n =>
      n.kind === 'unit' && n.status === 'in_progress'
    ) || [];

    upgradeNodes.forEach(node => {
      const el = document.querySelector(`[data-node-id="${node.id}"] .countdown`);
      if (el && node.remaining_s > 0) {
        el.textContent = formatTime(node.remaining_s);
      }
    });

    // Update badge count
    const inProgressCount = upgradeNodes.length;
    bus.emit("upgrades:countUpdated", { count: inProgressCount });
  }, 1000);
}

export function stopCountdownTimer(): void {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}
