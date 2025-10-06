import type { EventBus } from "../bus";
import { createTutorialEngine } from "./engine";
import { createRoles } from "./roles";
import { getBasicTutorialSteps } from "./steps_basic";
export const BASIC_TUTORIAL_ID = "ship-basics";

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

  return {
    start(options) {
      engine.start(options);
    },
    restart() {
      engine.restart();
    },
    destroy() {
      engine.destroy();
    },
  };
}
