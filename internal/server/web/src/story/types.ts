export type StoryIntent = "factory" | "unit";

export interface DialogueChoice {
  id: string;
  text: string;
}

export interface DialogueContent {
  speaker: string;
  text: string;
  intent?: "factory" | "unit";
  typingSpeedMs?: number;
  continueLabel?: string;
  choices?: DialogueChoice[];
  autoAdvance?: {
    delayMs: number;
  };
  tutorialTip?: {
    title: string;
    text: string;
  };
}

export interface StoryChoiceDefinition {
  id?: string;
  text: string;
  next: string | null;
  flag?: string;
  setFlags?: string[];
  clearFlags?: string[];
}

export interface StoryAutoAdvance {
  next?: string | null;
  delayMs?: number;
}

export type StoryTrigger =
  | { kind: "immediate"; delayMs?: number }
  | { kind: "tutorial-start"; tutorialId: string; delayMs?: number }
  | { kind: "tutorial-step"; tutorialId: string; stepIndex: number; delayMs?: number }
  | { kind: "tutorial-complete"; tutorialId: string; delayMs?: number };

export interface StoryNode {
  id: string;
  speaker: string;
  text: string;
  intent?: StoryIntent;
  choices?: StoryChoiceDefinition[];
  next?: string | null;
  continueLabel?: string;
  trigger?: StoryTrigger;
  autoAdvance?: StoryAutoAdvance;
  typingSpeedMs?: number;
}

export interface StoryChapter {
  id: string;
  tutorialId: string;
  start: string;
  nodes: Record<string, StoryNode>;
}
