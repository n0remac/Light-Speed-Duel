import type { EventBus, EventKey } from "../bus";
import { createHighlighter, type Highlighter } from "./highlight";
import { clearProgress, loadProgress, saveProgress } from "./storage";
import { getRoleElement, type RoleId, type RolesMap } from "./roles";

export type StepAdvance =
  | {
      kind: "event";
      event: EventKey;
      when?: (payload: unknown) => boolean;
      check?: () => boolean;
    }
  | {
      kind: "manual";
      nextLabel?: string;
    };

export interface TutorialStep {
  id: string;
  target: RoleId | (() => HTMLElement | null) | null;
  title?: string;
  body: string;
  advance: StepAdvance;
  onEnter?: () => void;
  onExit?: () => void;
  allowSkip?: boolean;
  skipLabel?: string;
}

interface EngineOptions {
  id: string;
  bus: EventBus;
  roles: RolesMap;
  steps: TutorialStep[];
}

interface StartOptions {
  resume?: boolean;
}

export interface TutorialEngine {
  start(options?: StartOptions): void;
  restart(): void;
  stop(): void;
  isRunning(): boolean;
  destroy(): void;
}

export function createTutorialEngine({ id, bus, roles, steps }: EngineOptions): TutorialEngine {
  const highlighter: Highlighter = createHighlighter();
  let running = false;
  let paused = false;
  let currentIndex = -1;
  let currentStep: TutorialStep | null = null;
  let cleanupCurrent: (() => void) | null = null;
  let renderCurrent: (() => void) | null = null;
  let lastSavedCompleted = false;
  let suppressPersistOnStop = false;

  const persistentListeners: Array<() => void> = [];

  persistentListeners.push(
    bus.on("help:visibleChanged", ({ visible }) => {
      if (!running) return;
      paused = Boolean(visible);
      if (paused) {
        highlighter.hide();
      } else {
        renderCurrent?.();
      }
    }),
  );

  function resolveTarget(step: TutorialStep): HTMLElement | null {
    if (!step.target) {
      return null;
    }
    if (typeof step.target === "function") {
      return step.target();
    }
    return getRoleElement(roles, step.target);
  }

  function clampIndex(index: number): number {
    if (steps.length === 0) return 0;
    if (!Number.isFinite(index) || index < 0) return 0;
    if (index >= steps.length) return steps.length - 1;
    return Math.floor(index);
  }

  function setStep(index: number): void {
    if (!running) return;
    if (steps.length === 0) {
      completeTutorial();
      return;
    }
    if (index < 0 || index >= steps.length) {
      completeTutorial();
      return;
    }

    if (cleanupCurrent) {
      cleanupCurrent();
      cleanupCurrent = null;
    }

    if (currentStep) {
      currentStep.onExit?.();
      currentStep = null;
    }

    currentIndex = index;
    const step = steps[index];
    currentStep = step;

    persistProgress(index, false);

    bus.emit("tutorial:stepChanged", { id, stepIndex: index, total: steps.length });
    step.onEnter?.();

    const allowSkip = step.allowSkip !== false;
    const render = (): void => {
      if (!running || paused) return;
      highlighter.show({
        target: resolveTarget(step),
        title: step.title,
        body: step.body,
        stepIndex: index,
        stepCount: steps.length,
        showNext: step.advance.kind === "manual",
        nextLabel: step.advance.kind === "manual"
          ? step.advance.nextLabel ?? (index === steps.length - 1 ? "Finish" : "Next")
          : undefined,
        onNext: step.advance.kind === "manual" ? advanceStep : undefined,
        showSkip: allowSkip,
        skipLabel: step.skipLabel,
        onSkip: allowSkip ? skipCurrentStep : undefined,
      });
    };

    renderCurrent = render;
    render();

    if (step.advance.kind === "event") {
      const handler = (payload: unknown): void => {
        if (!running || paused) return;
        if (step.advance.when && !step.advance.when(payload)) {
          return;
        }
        advanceTo(index + 1);
      };
      cleanupCurrent = bus.on(step.advance.event, handler as (value: never) => void);
      if (step.advance.check && step.advance.check()) {
        handler(undefined);
      }
    } else {
      cleanupCurrent = null;
    }
  }

  function advanceTo(nextIndex: number): void {
    if (!running) return;
    if (cleanupCurrent) {
      cleanupCurrent();
      cleanupCurrent = null;
    }
    if (currentStep) {
      currentStep.onExit?.();
      currentStep = null;
    }
    renderCurrent = null;
    if (nextIndex >= steps.length) {
      completeTutorial();
    } else {
      setStep(nextIndex);
    }
  }

  function advanceStep(): void {
    advanceTo(currentIndex + 1);
  }

  function skipCurrentStep(): void {
    if (!running) return;
    const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
    advanceTo(nextIndex);
  }

  function completeTutorial(): void {
    if (!running) return;
    suppressPersistOnStop = true;
    persistProgress(steps.length, true);
    bus.emit("tutorial:completed", { id });
    stop();
    suppressPersistOnStop = false;
  }

  function start(options?: StartOptions): void {
    const resume = options?.resume !== false;
    if (running) {
      restart();
      return;
    }
    if (steps.length === 0) {
      return;
    }
    running = true;
    paused = false;
    suppressPersistOnStop = false;
    lastSavedCompleted = false;
    let startIndex = 0;
    if (resume) {
      const progress = loadProgress(id);
      if (progress && !progress.completed) {
        startIndex = clampIndex(progress.stepIndex);
      }
    } else {
      clearProgress(id);
    }
    bus.emit("tutorial:started", { id });
    setStep(startIndex);
  }

  function restart(): void {
    stop();
    start({ resume: false });
  }

  function stop(): void {
    const shouldPersist = !suppressPersistOnStop && running && !lastSavedCompleted && currentIndex >= 0 && currentIndex < steps.length;
    const indexToPersist = currentIndex;

    if (cleanupCurrent) {
      cleanupCurrent();
      cleanupCurrent = null;
    }
    if (currentStep) {
      currentStep.onExit?.();
      currentStep = null;
    }
    if (shouldPersist) {
      persistProgress(indexToPersist, false);
    }
    running = false;
    paused = false;
    currentIndex = -1;
    renderCurrent = null;
    highlighter.hide();
  }

  function isRunning(): boolean {
    return running;
  }

  function destroy(): void {
    stop();
    for (const dispose of persistentListeners) {
      dispose();
    }
    highlighter.destroy();
  }

  function persistProgress(stepIndex: number, completed: boolean): void {
    lastSavedCompleted = completed;
    saveProgress(id, {
      stepIndex,
      completed,
      updatedAt: Date.now(),
    });
  }

  return {
    start,
    restart,
    stop,
    isRunning,
    destroy,
  };
}
