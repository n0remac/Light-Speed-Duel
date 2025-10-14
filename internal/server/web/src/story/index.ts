import type { EventBus } from "../bus";
import type { AppState } from "../state";
import { createDialogueOverlay } from "./overlay";
import { createStoryController } from "./controller";

export interface StoryController {
  destroy(): void;
  reset(): void;
}

interface MountStoryOptions {
  bus: EventBus;
  state: AppState;
  roomId?: string | null;
}

/**
 * Mounts the server-driven story system.
 * Story progression is now controlled by the server DAG,
 * and this controller simply displays dialogue when nodes are activated.
 */
export function mountStory({ bus, state }: MountStoryOptions): StoryController {
  const overlay = createDialogueOverlay();
  const controller = createStoryController({
    bus,
    overlay,
    state,
  });
  
  controller.start();

  return {
    destroy() {
      controller.destroy();
      overlay.destroy();
    },
    reset() {
      // Reset is no longer needed as state is server-authoritative
      // But we keep the interface for compatibility
      console.warn("[story] reset() called but story is now server-driven");
    },
  };
}

// Legacy exports for compatibility
export const INTRO_CHAPTER_ID = "intro";
export const INTRO_INITIAL_RESPONSE_IDS = ["2A", "2B", "2C"] as const;
