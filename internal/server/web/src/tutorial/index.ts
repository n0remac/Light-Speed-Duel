import type { EventBus } from "../bus";
import { createTutorialEngine } from "./engine";
import { createRoles } from "./roles";
import { getBasicTutorialSteps } from "./steps_basic";
import { clearProgress, loadProgress } from "./storage";

const BASIC_TUTORIAL_ID = "ship-basics";

export interface TutorialController {
  start(options?: { resume?: boolean }): void;
  restart(): void;
  destroy(): void;
}

export function mountTutorial(bus: EventBus): TutorialController {
  const roles = createRoles();
  const engine = createTutorialEngine({
    id: BASIC_TUTORIAL_ID,
    bus,
    roles,
    steps: getBasicTutorialSteps(),
  });

  const startButton = roles.tutorialStart();

  function labelForProgress(): string {
    const progress = loadProgress(BASIC_TUTORIAL_ID);
    if (engine.isRunning()) {
      return "Tutorial";
    }
    if (!progress) {
      return "Tutorial";
    }
    if (progress.completed) {
      return "Replay";
    }
    return "Resume";
  }

  function updateButton(): void {
    if (!startButton) return;
    startButton.textContent = labelForProgress();
    startButton.disabled = engine.isRunning();
    if (!startButton.title) {
      startButton.title = "Shift+Click to restart from the beginning";
    }
  }

  function handleStartClick(event: MouseEvent): void {
    event.preventDefault();
    if (engine.isRunning()) {
      return;
    }
    if (event.shiftKey || event.altKey) {
      clearProgress(BASIC_TUTORIAL_ID);
      engine.start({ resume: false });
      return;
    }
    const progress = loadProgress(BASIC_TUTORIAL_ID);
    if (progress?.completed) {
      engine.start({ resume: false });
    } else {
      engine.start({ resume: true });
    }
  }

  startButton?.addEventListener("click", handleStartClick);

  const refresh = (): void => {
    updateButton();
  };

  const unsubscribers = [
    bus.on("tutorial:started", refresh),
    bus.on("tutorial:completed", refresh),
    bus.on("tutorial:skipped", refresh),
    bus.on("tutorial:stepChanged", refresh),
  ];

  updateButton();

  return {
    start(options) {
      engine.start(options);
    },
    restart() {
      engine.restart();
    },
    destroy() {
      startButton?.removeEventListener("click", handleStartClick);
      for (const dispose of unsubscribers) {
        dispose();
      }
      engine.destroy();
    },
  };
}
