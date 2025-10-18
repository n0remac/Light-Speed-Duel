import type { EventBus } from "./bus";
import type { AppState, DagNode } from "./state";
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

  // Render function
  function renderUpgrades() {
    const upgradeNodes = state.dag?.nodes.filter(n => n.kind === 'unit') || [];
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
    togglePanel(!panel.classList.contains('visible'));
  });

  bus.on("upgrades:show", () => togglePanel(true));
  bus.on("upgrades:hide", () => togglePanel(false));

  closeBtn.addEventListener("click", () => togglePanel(false));
  overlay.addEventListener("click", () => togglePanel(false));

  // Subscribe to DAG updates (event-driven pattern)
  bus.on("state:updated", () => {
    if (panel.classList.contains('visible')) {
      renderUpgrades();
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
  container.innerHTML = `
    <div class="tech-tree">
      ${nodes.map(renderNode).join('')}
    </div>
  `;
}

function renderNode(node: DagNode): string {
  const statusClass = `node-${node.status}`;
  const effectsHtml = node.effects?.map(e => {
    if (e.type === 'speed_multiplier') {
      return `+${((e.value as number - 1) * 100).toFixed(0)}% Speed`;
    } else if (e.type === 'missile_unlock') {
      return `Unlock ${e.value}`;
    } else if (e.type === 'heat_capacity') {
      return `+${((e.value as number - 1) * 100).toFixed(0)}% Heat Capacity`;
    } else if (e.type === 'heat_efficiency') {
      return `+${((e.value as number - 1) * 100).toFixed(0)}% Cooling`;
    }
    return '';
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
