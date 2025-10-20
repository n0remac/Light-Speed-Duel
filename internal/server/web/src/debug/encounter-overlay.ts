import type { EventBus } from "../bus";
import type { AppState, DebugBeaconInfo, DebugEncounterInfo } from "../state";
import { clamp } from "../state";
import { sendMessage, getApproxServerNow } from "../net";

interface InitOptions {
  state: AppState;
  bus: EventBus;
  refreshIntervalMs?: number;
}

const REFRESH_INTERVAL_MS_DEFAULT = 1000;

let initialized = false;
let overlayEl: HTMLDivElement | null = null;
let refreshTimer: ReturnType<typeof window.setInterval> | null = null;
let isVisible = false;
let debugBeacons: DebugBeaconInfo[] = [];
let debugEncounters: DebugEncounterInfo[] = [];
let appState: AppState | null = null;
let refreshIntervalMs = REFRESH_INTERVAL_MS_DEFAULT;
let eventBus: EventBus | null = null;

export function initEncounterDebugOverlay({ state, bus, refreshIntervalMs: intervalOverride }: InitOptions): void {
  if (initialized) {
    return;
  }
  initialized = true;

  appState = state;
  eventBus = bus;
  refreshIntervalMs = Number.isFinite(intervalOverride) && intervalOverride! > 100
    ? intervalOverride!
    : REFRESH_INTERVAL_MS_DEFAULT;

  debugBeacons = [...state.debug.beacons];
  debugEncounters = [...state.debug.encounters];
  isVisible = state.debug.visible;

  ensureOverlayElement();
  updateButtonState();
  render();

  window.addEventListener("keydown", handleKeyToggle, { passive: true });

  bus.on("debug:beacons", ({ beacons }) => {
    debugBeacons = [...beacons];
    if (appState) {
      appState.debug.beacons = [...beacons];
    }
    render();
  });

  bus.on("debug:encounters", ({ encounters }) => {
    debugEncounters = [...encounters];
    if (appState) {
      appState.debug.encounters = [...encounters];
    }
    render();
  });

  bus.on("mission:start", () => {
    if (isVisible) {
      requestDebugData(true);
    }
  });

  const toggleBtn = document.getElementById("debug-overlay-toggle");
  toggleBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleVisibility();
  });

  if (isVisible) {
    setVisibility(true, { requestImmediately: false });
  }
}

function handleKeyToggle(event: KeyboardEvent): void {
  if (!event || typeof event.key !== "string") {
    return;
  }
  if (event.key.toLowerCase() !== "d") {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
    return;
  }
  toggleVisibility();
}

function toggleVisibility(): void {
  setVisibility(!isVisible);
}

function setVisibility(visible: boolean, options: { requestImmediately?: boolean } = {}): void {
  if (!appState) {
    return;
  }
  const shouldRequest = options.requestImmediately ?? true;

  if (isVisible === visible) {
    if (visible) {
      if (shouldRequest) {
        requestDebugData(true);
      }
      startRefreshTimer();
    } else {
      stopRefreshTimer();
    }
    updateButtonState();
    render();
    return;
  }

  isVisible = visible;
  appState.debug.visible = visible;

  if (visible) {
    requestDebugData(shouldRequest);
    startRefreshTimer();
  } else {
    stopRefreshTimer();
  }

  updateButtonState();
  render();

  if (eventBus && typeof eventBus.emit === "function") {
    eventBus.emit("debug:overlay:visibility", { visible });
  }
}

function requestDebugData(force: boolean = false): void {
  if (!appState) {
    return;
  }
  const now = getApproxServerNow(appState);
  if (!force && appState.debug.lastRequestedAt != null) {
    const elapsed = now - appState.debug.lastRequestedAt;
    if (elapsed >= 0 && elapsed < refreshIntervalMs / 1000) {
      return;
    }
  }
  appState.debug.lastRequestedAt = now;
  sendMessage({ type: "debug:request-encounter-info", payload: {} });
}

function startRefreshTimer(): void {
  if (refreshTimer) {
    return;
  }
  refreshTimer = window.setInterval(() => {
    requestDebugData();
    render();
  }, refreshIntervalMs);
}

function stopRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function ensureOverlayElement(): HTMLDivElement {
  if (overlayEl) {
    return overlayEl;
  }
  const el = document.createElement("div");
  el.id = "encounter-debug-overlay";
  el.style.position = "fixed";
  el.style.top = "12px";
  el.style.right = "12px";
  el.style.width = "360px";
  el.style.maxHeight = "80vh";
  el.style.overflow = "auto";
  el.style.background = "rgba(5, 10, 20, 0.92)";
  el.style.color = "#e0f2fe";
  el.style.fontFamily = "JetBrains Mono, Fira Code, Consolas, monospace";
  el.style.fontSize = "12px";
  el.style.padding = "12px 14px";
  el.style.borderRadius = "8px";
  el.style.border = "1px solid rgba(125, 211, 252, 0.35)";
  el.style.boxShadow = "0 0 24px rgba(14, 116, 144, 0.35)";
  el.style.display = "none";
  el.style.zIndex = "10000";
  el.setAttribute("role", "region");
  el.setAttribute("aria-live", "polite");

  document.body.appendChild(el);
  overlayEl = el;
  return el;
}

function render(): void {
  const el = ensureOverlayElement();
  if (!isVisible) {
    el.style.display = "none";
    return;
  }

  el.style.display = "block";

  const now = appState ? getApproxServerNow(appState) : Date.now() / 1000;
  const lastUpdate = appState?.debug.lastReceivedAt ?? null;
  const lastRequested = appState?.debug.lastRequestedAt ?? null;

  let html = `<h3 style="margin: 0 0 10px; color: #38bdf8;">Encounter Debug<span style="float:right; font-size:11px; color:#94a3b8;">D to hide</span></h3>`;

  if (lastUpdate != null) {
    const age = clamp(now - lastUpdate, 0, Number.POSITIVE_INFINITY);
    html += `<div style="margin-bottom:8px; font-size:11px; color:#94a3b8;">Last update ${formatRelative(age)}${lastRequested && lastRequested > lastUpdate ? ` • waiting…` : ""}</div>`;
  } else if (lastRequested != null) {
    html += `<div style="margin-bottom:8px; font-size:11px; color:#94a3b8;">Requested ${formatRelative(clamp(now - lastRequested, 0, Number.POSITIVE_INFINITY))} ago…</div>`;
  } else {
    html += `<div style="margin-bottom:8px; font-size:11px; color:#94a3b8;">No debug data received yet.</div>`;
  }

  html += `<section style="margin-bottom:14px;">
    <h4 style="margin:0 0 6px; color:#facc15; font-size:12px;">Beacons (${debugBeacons.length})</h4>`;

  if (debugBeacons.length === 0) {
    html += `<div style="color:#94a3b8;">No beacons reported.</div>`;
  } else {
    for (const beacon of debugBeacons) {
      const tagStr = beacon.tags.length > 0 ? beacon.tags.map(escapeHtml).join(", ") : "none";
      const pin = beacon.pinned ? "📍" : "";
      html += `<div style="margin:5px 0; padding:6px; background:rgba(14, 24, 44, 0.75); border:1px solid rgba(56, 189, 248, 0.18); border-radius:6px;">
        <div style="font-weight:600; color:#bae6fd;">${pin} ${escapeHtml(beacon.id)}</div>
        <div style="color:#94a3b8;">Pos: (${beacon.x.toFixed(0)}, ${beacon.y.toFixed(0)})</div>
        <div style="color:#94a3b8;">Tags: ${tagStr}</div>
      </div>`;
    }
  }

  html += `</section>`;

  html += `<section style="margin-bottom:14px;">
    <h4 style="margin:0 0 6px; color:#facc15; font-size:12px;">Encounters (${debugEncounters.length})</h4>`;

  if (debugEncounters.length === 0) {
    html += `<div style="color:#94a3b8;">No active encounters.</div>`;
  } else {
    for (const encounter of debugEncounters) {
      const spawnTime = encounter.spawnTime ?? 0;
      const lifetime = encounter.lifetime ?? 0;
      const elapsed = clamp(now - spawnTime, 0, Number.POSITIVE_INFINITY);
      const remaining = lifetime > 0 ? clamp(lifetime - elapsed, 0, lifetime) : 0;
      const progress = lifetime > 0 ? clamp((elapsed / lifetime) * 100, 0, 100) : 0;
      const lifetimeLabel = lifetime > 0
        ? `${remaining.toFixed(1)}s / ${lifetime.toFixed(1)}s`
        : "∞";

      html += `<div style="margin:5px 0; padding:6px; background:rgba(14, 24, 44, 0.75); border:1px solid rgba(45, 212, 191, 0.2); border-radius:6px;">
        <div style="font-weight:600; color:#bbf7d0;">${escapeHtml(encounter.encounterId)}</div>
        <div style="color:#94a3b8;">Beacon: ${escapeHtml(encounter.beaconId)}</div>
        <div style="color:#94a3b8;">Entities: ${encounter.entityCount}</div>
        <div style="color:#94a3b8;">Lifetime: ${lifetimeLabel}</div>
        <div style="width:100%; height:6px; background:#1e293b; border-radius:4px; overflow:hidden; margin-top:4px;">
          <div style="width:${progress}%; height:100%; background:linear-gradient(90deg, #1dd1a1, #38bdf8);"></div>
        </div>
      </div>`;
    }
  }

  html += `</section>`;

  html += `<section>
    <h4 style="margin:0 0 6px; color:#facc15; font-size:12px;">Shortcuts</h4>
    <div style="color:#94a3b8;">• Press <strong style="color:#e0f2fe;">D</strong> to toggle overlay.<br/>
    • Overlay auto-refreshes every ${(refreshIntervalMs / 1000).toFixed(1)}s when visible.</div>
  </section>`;

  el.innerHTML = html;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRelative(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "unknown";
  }
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(0)}ms ago`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s ago`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${minutes.toFixed(1)}m ago`;
  }
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h ago`;
}

function updateButtonState(): void {
  const button = document.getElementById("debug-overlay-toggle");
  if (!button) {
    return;
  }
  if (isVisible) {
    button.setAttribute("data-active", "true");
  } else {
    button.removeAttribute("data-active");
  }
}
