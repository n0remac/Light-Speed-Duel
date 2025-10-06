import { clamp } from "../state";

interface HighlightContentOptions {
  target: HTMLElement | null;
  title?: string;
  body: string;
  stepIndex: number;
  stepCount: number;
  showNext: boolean;
  nextLabel?: string;
  onNext?: () => void;
  showSkip: boolean;
  skipLabel?: string;
  onSkip?: () => void;
}

export interface Highlighter {
  show(options: HighlightContentOptions): void;
  hide(): void;
  destroy(): void;
}

const STYLE_ID = "tutorial-overlay-style";

export function createHighlighter(): Highlighter {
  ensureStyles();

  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay";
  overlay.setAttribute("aria-live", "polite");

  const scrim = document.createElement("div");
  scrim.className = "tutorial-overlay__scrim";

  const highlightBox = document.createElement("div");
  highlightBox.className = "tutorial-overlay__highlight";

  const tooltip = document.createElement("div");
  tooltip.className = "tutorial-overlay__tooltip";

  const progress = document.createElement("div");
  progress.className = "tutorial-overlay__progress";

  const title = document.createElement("h3");
  title.className = "tutorial-overlay__title";

  const body = document.createElement("p");
  body.className = "tutorial-overlay__body";

  const actions = document.createElement("div");
  actions.className = "tutorial-overlay__actions";

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "tutorial-overlay__btn tutorial-overlay__btn--ghost";
  skipBtn.textContent = "Skip";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "tutorial-overlay__btn tutorial-overlay__btn--primary";
  nextBtn.textContent = "Next";

  actions.append(skipBtn, nextBtn);
  tooltip.append(progress, title, body, actions);
  overlay.append(scrim, highlightBox, tooltip);
  document.body.appendChild(overlay);

  let currentTarget: HTMLElement | null = null;
  let visible = false;
  let resizeObserver: ResizeObserver | null = null;
  let frameHandle: number | null = null;
  let onNext: (() => void) | null = null;
  let onSkip: (() => void) | null = null;

  function scheduleUpdate(): void {
    if (!visible) return;
    if (frameHandle !== null) return;
    frameHandle = window.requestAnimationFrame(() => {
      frameHandle = null;
      updatePosition();
    });
  }

  function updatePosition(): void {
    if (!visible) return;

    if (currentTarget) {
      const rect = currentTarget.getBoundingClientRect();
      const padding = 12;
      const width = Math.max(0, rect.width + padding * 2);
      const height = Math.max(0, rect.height + padding * 2);
      const left = rect.left - padding;
      const top = rect.top - padding;

      highlightBox.style.opacity = "1";
      highlightBox.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      highlightBox.style.width = `${Math.round(width)}px`;
      highlightBox.style.height = `${Math.round(height)}px`;

      tooltip.style.opacity = "1";
      tooltip.style.visibility = "visible";
      tooltip.style.maxWidth = `min(340px, ${Math.max(260, window.innerWidth - 32)}px)`;
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      let tooltipTop = rect.bottom + 18;
      if (tooltipTop + tooltipHeight > window.innerHeight - 20) {
        tooltipTop = Math.max(20, rect.top - tooltipHeight - 18);
      }
      let tooltipLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
      tooltipLeft = clamp(tooltipLeft, 20, window.innerWidth - tooltipWidth - 20);
      tooltip.style.transform = `translate(${Math.round(tooltipLeft)}px, ${Math.round(tooltipTop)}px)`;
    } else {
      highlightBox.style.opacity = "0";
      highlightBox.style.width = "0px";
      highlightBox.style.height = "0px";
      highlightBox.style.transform = `translate(${Math.round(window.innerWidth / 2)}px, ${Math.round(window.innerHeight / 2)}px)`;

      tooltip.style.opacity = "1";
      tooltip.style.visibility = "visible";
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const tooltipLeft = clamp((window.innerWidth - tooltipWidth) / 2, 20, window.innerWidth - tooltipWidth - 20);
      const tooltipTop = clamp((window.innerHeight - tooltipHeight) / 2, 20, window.innerHeight - tooltipHeight - 20);
      tooltip.style.transform = `translate(${Math.round(tooltipLeft)}px, ${Math.round(tooltipTop)}px)`;
    }
  }

  function attachListeners(): void {
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
  }

  function detachListeners(): void {
    window.removeEventListener("resize", scheduleUpdate);
    window.removeEventListener("scroll", scheduleUpdate);
    if (frameHandle !== null) {
      window.cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  }

  skipBtn.addEventListener("click", (event) => {
    event.preventDefault();
    onSkip?.();
  });

  nextBtn.addEventListener("click", (event) => {
    event.preventDefault();
    onNext?.();
  });

  function renderTooltip(options: HighlightContentOptions): void {
    const { stepCount, stepIndex, title: optionTitle, body: optionBody, showNext, nextLabel, showSkip, skipLabel } = options;

    if (Number.isFinite(stepCount) && stepCount > 0) {
      progress.textContent = `Step ${stepIndex + 1} of ${stepCount}`;
      progress.style.display = "block";
    } else {
      progress.textContent = "";
      progress.style.display = "none";
    }

    if (optionTitle && optionTitle.trim().length > 0) {
      title.textContent = optionTitle;
      title.style.display = "block";
    } else {
      title.textContent = "";
      title.style.display = "none";
    }

    body.textContent = optionBody;

    onNext = showNext ? options.onNext ?? null : null;
    if (showNext) {
      nextBtn.textContent = nextLabel ?? "Next";
      nextBtn.style.display = "inline-flex";
    } else {
      nextBtn.style.display = "none";
    }

    onSkip = showSkip ? options.onSkip ?? null : null;
    if (showSkip) {
      skipBtn.textContent = skipLabel ?? "Skip";
      skipBtn.style.display = "inline-flex";
    } else {
      skipBtn.style.display = "none";
    }
  }

  function show(options: HighlightContentOptions): void {
    visible = true;
    currentTarget = options.target ?? null;
    overlay.classList.add("visible");
    renderTooltip(options);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (currentTarget && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => scheduleUpdate());
      resizeObserver.observe(currentTarget);
    }
    attachListeners();
    scheduleUpdate();
  }

  function hide(): void {
    if (!visible) return;
    visible = false;
    overlay.classList.remove("visible");
    tooltip.style.visibility = "hidden";
    tooltip.style.opacity = "0";
    highlightBox.style.opacity = "0";
    detachListeners();
  }

  function destroy(): void {
    hide();
    overlay.remove();
  }

  return {
    show,
    hide,
    destroy,
  };
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .tutorial-overlay {
      position: fixed;
      inset: 0;
      z-index: 50;
      pointer-events: none;
      display: none;
    }
    .tutorial-overlay.visible {
      display: block;
    }
    .tutorial-overlay__scrim {
      position: absolute;
      inset: 0;
    }
    .tutorial-overlay__highlight {
      position: absolute;
      border-radius: 14px;
      border: 2px solid rgba(56, 189, 248, 0.95);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25), 0 0 24px rgba(34, 211, 238, 0.25);
      transition: transform 0.18s ease, width 0.18s ease, height 0.18s ease, opacity 0.18s ease;
      pointer-events: none;
      opacity: 0;
    }
    .tutorial-overlay__tooltip {
      position: fixed;
      min-width: 240px;
      max-width: min(340px, calc(100vw - 32px));
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 16px;
      padding: 16px 18px;
      color: #e2e8f0;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.55);
      pointer-events: auto;
      opacity: 0;
      visibility: hidden;
      transform: translate(0px, 0px);
      transition: transform 0.18s ease, opacity 0.18s ease;
    }
    .tutorial-overlay__progress {
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(148, 163, 184, 0.75);
      margin: 0 0 8px;
    }
    .tutorial-overlay__title {
      margin: 0 0 8px;
      font-size: 15px;
      letter-spacing: 0.04em;
      color: #f1f5f9;
    }
    .tutorial-overlay__body {
      margin: 0 0 14px;
      font-size: 13px;
      line-height: 1.5;
      color: #cbd5f5;
    }
    .tutorial-overlay__actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    .tutorial-overlay__btn {
      font: inherit;
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid transparent;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
    }
    .tutorial-overlay__btn--primary {
      background: rgba(56, 189, 248, 0.25);
      border-color: rgba(56, 189, 248, 0.55);
      color: #f8fafc;
    }
    .tutorial-overlay__btn--primary:hover {
      background: rgba(56, 189, 248, 0.35);
    }
    .tutorial-overlay__btn--ghost {
      background: transparent;
      border-color: rgba(148, 163, 184, 0.35);
      color: rgba(203, 213, 225, 0.9);
    }
    .tutorial-overlay__btn--ghost:hover {
      border-color: rgba(203, 213, 225, 0.55);
    }
  `;
  document.head.appendChild(style);
}
