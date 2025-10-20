import type { EventBus } from "../bus";
import type { DialogueOverlay } from "./overlay";
import type { StoryChapter, StoryChoiceDefinition, StoryNode, StoryTrigger } from "./types";
import {
  clearStoryProgress,
  loadStoryProgress,
  saveStoryProgress,
  StoryFlags,
} from "./storage";
import { playDialogueCue } from "./sfx";

interface StoryEngineOptions {
  bus: EventBus;
  overlay: DialogueOverlay;
  chapter: StoryChapter;
  roomId: string | null;
}

interface StoryQueueItem {
  nodeId: string;
  force: boolean;
}

interface PreparedChoice {
  id: string;
  text: string;
  next: string | null;
  setFlags: string[];
  clearFlags: string[];
}

export interface StoryEngine {
  start(): void;
  destroy(): void;
  reset(): void;
}

const DEFAULT_TYPING_MS = 18;
const MIN_TYPING_MS = 8;
const MAX_TYPING_MS = 64;
const AUTO_ADVANCE_MIN_DELAY = 200;
const AUTO_ADVANCE_MAX_DELAY = 8000;

export function createStoryEngine({ bus, overlay, chapter, roomId }: StoryEngineOptions): StoryEngine {
  const nodes = new Map<string, StoryNode>(Object.entries(chapter.nodes));
  const queue: StoryQueueItem[] = [];
  const listeners: Array<() => void> = [];
  const pendingTimers = new Map<string, number>();

  let flags: StoryFlags = {};
  let visited = new Set<string>();
  let currentNodeId: string | null = null;
  let started = false;
  let autoAdvanceHandle: number | null = null;

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function inferIntent(node: StoryNode): "factory" | "unit" {
    if (node.intent) return node.intent;
    const speaker = node.speaker.toLowerCase();
    if (speaker.includes("unit")) {
      return "unit";
    }
    return "factory";
  }

  function save(nodeId: string | null): void {
    const progress = {
      chapterId: chapter.id,
      nodeId: nodeId ?? chapter.start,
      flags,
      visited: Array.from(visited),
      updatedAt: Date.now(),
    };
    saveStoryProgress(chapter.id, roomId, progress);
  }

  function setFlag(flag: string, value: boolean): void {
    const next = { ...flags };
    if (value) {
      if (next[flag]) return;
      next[flag] = true;
    } else if (next[flag]) {
      delete next[flag];
    } else {
      return;
    }
    flags = next;
    bus.emit("story:flagUpdated", { flag, value });
  }

  function applyChoiceFlags(choice: PreparedChoice): void {
    for (const flag of choice.setFlags) {
      setFlag(flag, true);
    }
    for (const flag of choice.clearFlags) {
      setFlag(flag, false);
    }
  }

  function prepareChoices(node: StoryNode): PreparedChoice[] {
    const defs = Array.isArray(node.choices) ? node.choices : [];
    return defs.map((choice, index) => normalizeChoice(choice, index));
  }

  function normalizeChoice(choice: StoryChoiceDefinition, index: number): PreparedChoice {
    const setFlags = new Set<string>();
    const clearFlags = new Set<string>();
    if (choice.flag) {
      setFlags.add(choice.flag);
    }
    if (Array.isArray(choice.setFlags)) {
      for (const flag of choice.setFlags) {
        if (typeof flag === "string" && flag.trim().length > 0) {
          setFlags.add(flag);
        }
      }
    }
    if (Array.isArray(choice.clearFlags)) {
      for (const flag of choice.clearFlags) {
        if (typeof flag === "string" && flag.trim().length > 0) {
          clearFlags.add(flag);
        }
      }
    }
    return {
      id: choice.id ?? choice.flag ?? `choice-${index}`,
      text: choice.text,
      next: choice.next ?? null,
      setFlags: Array.from(setFlags),
      clearFlags: Array.from(clearFlags),
    };
  }

  function clearAutoAdvance(): void {
    if (autoAdvanceHandle !== null) {
      window.clearTimeout(autoAdvanceHandle);
      autoAdvanceHandle = null;
    }
  }

  function closeNode(): void {
    if (!currentNodeId) return;
    overlay.hide();
    bus.emit("dialogue:closed", { nodeId: currentNodeId, chapterId: chapter.id });
    currentNodeId = null;
    clearAutoAdvance();
    save(null);
    tryShowNext();
  }

  function advanceTo(nextId: string | null, force = false): void {
    clearAutoAdvance();
    if (currentNodeId) {
      overlay.hide();
      bus.emit("dialogue:closed", { nodeId: currentNodeId, chapterId: chapter.id });
      currentNodeId = null;
    }
    if (nextId) {
      enqueueNode(nextId, { force });
    } else {
      save(null);
      tryShowNext();
    }
  }

  function showNode(nodeId: string, force = false): void {
    const node = nodes.get(nodeId);
    if (!node) return;

    currentNodeId = nodeId;
    visited.add(nodeId);
    save(nodeId);
    bus.emit("story:progressed", { chapterId: chapter.id, nodeId });

    const choices = prepareChoices(node);
    const intent = inferIntent(node);

    clearAutoAdvance();

    const typingSpeed = clamp(node.typingSpeedMs ?? DEFAULT_TYPING_MS, MIN_TYPING_MS, MAX_TYPING_MS);

    const content = {
      speaker: node.speaker,
      text: node.text,
      intent,
      typingSpeedMs: typingSpeed,
      choices: choices.length > 0
        ? choices.map((choice) => ({ id: choice.id, text: choice.text }))
        : undefined,
      onChoice: choices.length > 0
        ? (choiceId: string) => {
            const matched = choices.find((ch) => ch.id === choiceId);
            if (!matched) return;
            applyChoiceFlags(matched);
            bus.emit("dialogue:choice", { nodeId, choiceId, chapterId: chapter.id });
            advanceTo(matched.next, true);
          }
        : undefined,
    } as const;

    playDialogueCue(intent);

    overlay.show({
      ...content,
      onContinue: !choices.length
        ? () => {
            const next = node.next ?? null;
            advanceTo(next, true);
          }
        : undefined,
      continueLabel: node.continueLabel,
      onTextFullyRendered: () => {
        if (!choices.length) {
          if (node.autoAdvance) {
            const target = node.autoAdvance.next ?? node.next ?? null;
            const delay = clamp(node.autoAdvance.delayMs ?? 1200, AUTO_ADVANCE_MIN_DELAY, AUTO_ADVANCE_MAX_DELAY);
            clearAutoAdvance();
            autoAdvanceHandle = window.setTimeout(() => {
              autoAdvanceHandle = null;
              advanceTo(target, true);
            }, delay);
          }
        }
      },
    });

    bus.emit("dialogue:opened", { nodeId, chapterId: chapter.id });
  }

  function enqueueNode(nodeId: string, { force = false, delayMs }: { force?: boolean; delayMs?: number } = {}): void {
    if (!force && visited.has(nodeId)) {
      return;
    }
    if (!nodes.has(nodeId)) {
      return;
    }
    if (delayMs && delayMs > 0) {
      if (pendingTimers.has(nodeId)) {
        return;
      }
      const timer = window.setTimeout(() => {
        pendingTimers.delete(nodeId);
        enqueueNode(nodeId, { force });
      }, delayMs);
      pendingTimers.set(nodeId, timer);
      return;
    }
    if (queue.some((item) => item.nodeId === nodeId)) {
      return;
    }
    queue.push({ nodeId, force });
    tryShowNext();
  }

  function tryShowNext(): void {
    if (currentNodeId) return;
    if (overlay.isVisible()) return;
    const next = queue.shift();
    if (!next) {
      return;
    }
    showNode(next.nodeId, next.force);
  }

  function bindTrigger(nodeId: string, trigger: StoryTrigger): void {
    switch (trigger.kind) {
      case "immediate": {
        enqueueNode(nodeId, { delayMs: trigger.delayMs ?? 400 });
        break;
      }
      case "tutorial-start": {
        const disposer = bus.on("tutorial:started", ({ id }) => {
          if (id !== trigger.tutorialId) return;
          enqueueNode(nodeId, { delayMs: trigger.delayMs });
        });
        listeners.push(disposer);
        break;
      }
      case "tutorial-step": {
        const disposer = bus.on("tutorial:stepChanged", ({ id, stepIndex }) => {
          if (id !== trigger.tutorialId) return;
          if (typeof stepIndex !== "number") return;
          if (stepIndex !== trigger.stepIndex) return;
          enqueueNode(nodeId, { delayMs: trigger.delayMs });
        });
        listeners.push(disposer);
        break;
      }
      case "tutorial-complete": {
        const disposer = bus.on("tutorial:completed", ({ id }) => {
          if (id !== trigger.tutorialId) return;
          enqueueNode(nodeId, { delayMs: trigger.delayMs });
        });
        listeners.push(disposer);
        break;
      }
      case "mission-event": {
        const disposer = bus.on(trigger.event as any, (payload: any) => {
          if (trigger.missionId && payload?.missionId && payload.missionId !== trigger.missionId) {
            return;
          }
          if (typeof trigger.beaconIndex === "number") {
            const beaconValue = payload?.beaconIndex ?? payload?.index;
            if (beaconValue !== trigger.beaconIndex) {
              return;
            }
          }
          enqueueNode(nodeId, { delayMs: trigger.delayMs });
        });
        listeners.push(disposer);
        break;
      }
      default:
        break;
    }
  }

  function initializeTriggers(): void {
    for (const [nodeId, node] of nodes.entries()) {
      if (!node.trigger) {
        continue;
      }
      bindTrigger(nodeId, node.trigger);
    }
  }

  function restoreFromProgress(): void {
    const progress = loadStoryProgress(chapter.id, roomId);
    if (!progress) {
      return;
    }
    flags = progress.flags ?? {};
    if (Array.isArray(progress.visited)) {
      visited = new Set(progress.visited);
    }
    if (progress.nodeId && nodes.has(progress.nodeId)) {
      enqueueNode(progress.nodeId, { force: true, delayMs: 50 });
    }
  }

  function clear(): void {
    clearAutoAdvance();
    queue.splice(0, queue.length);
    for (const timer of pendingTimers.values()) {
      window.clearTimeout(timer);
    }
    pendingTimers.clear();
    currentNodeId = null;
    overlay.hide();
  }

  return {
    start() {
      if (started) return;
      started = true;
      initializeTriggers();
      restoreFromProgress();
      if (!visited.has(chapter.start)) {
        enqueueNode(chapter.start, { force: false, delayMs: 600 });
      }
    },
    destroy() {
      clear();
      for (const dispose of listeners) {
        try {
          dispose();
        } catch {
          // ignore
        }
      }
      listeners.length = 0;
      started = false;
    },
    reset() {
      clear();
      visited.clear();
      flags = {};
      clearStoryProgress(chapter.id, roomId);
      if (started) {
        restoreFromProgress();
        enqueueNode(chapter.start, { force: true, delayMs: 400 });
      }
    },
  };
}
