import type { EventBus } from "../bus";
import { createDialogueOverlay } from "./overlay";
import { createStoryEngine } from "./engine";
import { introChapter } from "./chapters/intro";
import { clearStoryProgress } from "./storage";

export interface StoryController {
  destroy(): void;
  reset(): void;
}

interface MountStoryOptions {
  bus: EventBus;
  roomId: string | null;
}

export function mountStory({ bus, roomId }: MountStoryOptions): StoryController {
  const overlay = createDialogueOverlay();
  const engine = createStoryEngine({
    bus,
    overlay,
    chapter: introChapter,
    roomId,
  });

  clearStoryProgress(introChapter.id, roomId);
  engine.start();

  return {
    destroy() {
      engine.destroy();
      overlay.destroy();
    },
    reset() {
      engine.reset();
    },
  };
}

export const INTRO_CHAPTER_ID = introChapter.id;
export const INTRO_INITIAL_RESPONSE_IDS = ["2A", "2B", "2C"] as const;
