import type { EventBus } from "../bus";
import type { AppState } from "../state";
import type { DialogueOverlay } from "./overlay";
import type { DialogueContent } from "./types";
import { sendMessage } from "../net";

const MISSION_STORY_URL = "/data/campaign-1-story.json";

interface MissionStoryChoice {
  id: string;
  text: string;
  next: string | null;
}

interface MissionStoryTrigger {
  kind: "mission-event";
  event: string;
  missionId?: string;
  beaconIndex?: number;
  delayMs?: number;
}

interface MissionStoryNode {
  id: string;
  speaker: string;
  text: string;
  intent?: "factory" | "unit";
  trigger?: MissionStoryTrigger;
  tutorialTip?: {
    title: string;
    text: string;
  };
  autoAdvance?: number;
  typingSpeedMs?: number;
  continueLabel?: string;
  next?: string | null;
  choices?: MissionStoryChoice[];
  flags?: string[];
}

interface MissionStoryDefinition {
  chapterId: string;
  tutorialId?: string;
  startNode?: string | null;
  nodes: Record<string, MissionStoryNode>;
}

interface MissionEventParams {
  missionId?: string;
  beaconIndex?: number;
}

interface StoryControllerOptions {
  bus: EventBus;
  overlay: DialogueOverlay;
  state: AppState;
}

export interface StoryController {
  start(): void;
  destroy(): void;
}

/**
 * Server-driven story controller.
 * Reacts to story:nodeActivated events from the server and displays dialogue.
 * Sends dag_story_ack messages back to the server when dialogue is completed.
 */
export function createStoryController({ bus, overlay, state }: StoryControllerOptions): StoryController {
  const listeners: Array<() => void> = [];
  let tutorialTipElement: HTMLElement | null = null;
  let missionStoryPromise: Promise<MissionStoryDefinition | null> | null = null;
  let missionStory: MissionStoryDefinition | null = null;
  const missionStoryFlags = new Set<string>();
  const missionStoryQueue: Array<{ nodeId: string }> = [];
  const shownMissionNodes = new Set<string>();
  let activeMissionId: string | null = null;
  let activeMissionNodeId: string | null = null;
  let missionAutoAdvanceHandle: number | null = null;

  function handleNodeActivated({ nodeId, dialogue }: { nodeId: string; dialogue?: DialogueContent }): void {
    console.log("[story] Node activated:", nodeId);

    if (!dialogue) {
      console.error("[story] No dialogue provided by server for:", nodeId);
      // Auto-acknowledge to prevent blocking progression
      acknowledgeNode(nodeId, null);
      return;
    }

    // Parse the node ID to extract chapter and node info
    // Expected format: "story.<chapter>.<node>"
    const parts = nodeId.split(".");
    if (parts.length < 3 || parts[0] !== "story") {
      console.warn("[story] Invalid node ID format:", nodeId);
      return;
    }

    const chapter = parts[1];
    const node = parts.slice(2).join(".");

    showDialogueForNode(chapter, node, nodeId, dialogue);
  }

  function showDialogueForNode(chapter: string, node: string, fullNodeId: string, content: DialogueContent): void {

    // Show tutorial tip if present
    if (content.tutorialTip) {
      showTutorialTip(content.tutorialTip);
    }

    // Prepare overlay content
    const overlayContent: any = {
      speaker: content.speaker,
      text: content.text,
      intent: content.intent,
      continueLabel: content.continueLabel,
      typingSpeedMs: content.typingSpeedMs,
    };

    // Add choices if present
    if (content.choices && content.choices.length > 0) {
      overlayContent.choices = content.choices;
      overlayContent.onChoice = (choiceId: string) => {
        hideTutorialTip();
        overlay.hide();
        acknowledgeNode(fullNodeId, choiceId);
        bus.emit("dialogue:closed", { nodeId: node, chapterId: chapter });
      };
    } else {
      // No choices - just continue
      overlayContent.onContinue = () => {
        hideTutorialTip();
        overlay.hide();
        acknowledgeNode(fullNodeId, null);
        bus.emit("dialogue:closed", { nodeId: node, chapterId: chapter });
      };
    }

    // Handle auto-advance
    if (content.autoAdvance) {
      overlayContent.onTextFullyRendered = () => {
        setTimeout(() => {
          hideTutorialTip();
          overlay.hide();
          acknowledgeNode(fullNodeId, null);
          bus.emit("dialogue:closed", { nodeId: node, chapterId: chapter });
        }, content.autoAdvance.delayMs);
      };
    }

    overlay.show(overlayContent);

    bus.emit("dialogue:opened", { nodeId: node, chapterId: chapter });
  }

  async function loadMissionStory(): Promise<MissionStoryDefinition | null> {
    if (missionStory) {
      return missionStory;
    }
    if (missionStoryPromise) {
      return missionStoryPromise;
    }
    missionStoryPromise = fetch(MISSION_STORY_URL)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load mission story: ${res.status}`);
        }
        return res.json() as Promise<unknown>;
      })
      .then((raw) => normalizeMissionStory(raw))
      .catch((err) => {
        console.error("[story] Unable to load mission story definition", err);
        return null;
      });
    const definition = await missionStoryPromise;
    missionStory = definition;
    return definition;
  }

  function normalizeMissionStory(raw: unknown): MissionStoryDefinition | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const record = raw as Record<string, unknown>;
    const chapterId = typeof record.chapterId === "string" ? record.chapterId : "campaign-1";
    const tutorialId = typeof record.tutorialId === "string" ? record.tutorialId : undefined;
    const startNode = typeof record.startNode === "string" ? record.startNode : undefined;
    const nodesInput = record.nodes;
    if (!nodesInput || typeof nodesInput !== "object") {
      return null;
    }

    const nodes: Record<string, MissionStoryNode> = {};
    for (const [nodeKey, value] of Object.entries(nodesInput)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const nodeRecord = value as Record<string, unknown>;
      const id = typeof nodeRecord.id === "string" ? nodeRecord.id : nodeKey;
      const speaker = typeof nodeRecord.speaker === "string" ? nodeRecord.speaker : "Ship AI";
      const text = typeof nodeRecord.text === "string" ? nodeRecord.text : "";
      const intent = nodeRecord.intent === "unit" ? "unit" : "factory";
      const typingSpeedMs = typeof nodeRecord.typingSpeedMs === "number" ? nodeRecord.typingSpeedMs : undefined;
      const continueLabel = typeof nodeRecord.continueLabel === "string" ? nodeRecord.continueLabel : undefined;
      const autoAdvance = typeof nodeRecord.autoAdvance === "number" ? nodeRecord.autoAdvance : undefined;
      const next = typeof nodeRecord.next === "string"
        ? nodeRecord.next
        : nodeRecord.next === null
          ? null
          : undefined;
      const flags = Array.isArray(nodeRecord.flags) ? nodeRecord.flags.map(String) : undefined;
      const tutorialTip = normalizeTutorialTip(nodeRecord.tutorialTip);
      const trigger = normalizeMissionTrigger(nodeRecord.trigger);
      const choices = normalizeMissionChoices(id, nodeRecord.choices);

      nodes[id] = {
        id,
        speaker,
        text,
        intent,
        typingSpeedMs,
        continueLabel,
        autoAdvance,
        next,
        flags,
        tutorialTip,
        trigger,
        choices,
      };
    }

    return {
      chapterId,
      tutorialId,
      startNode: startNode ?? null,
      nodes,
    };
  }

  function normalizeTutorialTip(input: unknown): { title: string; text: string } | undefined {
    if (!input) {
      return undefined;
    }
    if (typeof input === "string") {
      return {
        title: "Mission Tip",
        text: input,
      };
    }
    if (typeof input === "object") {
      const record = input as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text : "";
      const title = typeof record.title === "string" ? record.title : "Mission Tip";
      if (!text) {
        return undefined;
      }
      return { title, text };
    }
    return undefined;
  }

  function normalizeMissionTrigger(input: unknown): MissionStoryTrigger | undefined {
    if (!input || typeof input !== "object") {
      return undefined;
    }
    const trigger = input as Record<string, unknown>;
    if (trigger.kind !== "mission-event") {
      return undefined;
    }
    const event = typeof trigger.event === "string" ? trigger.event : "";
    if (!event) {
      return undefined;
    }
    const missionId = typeof trigger.missionId === "string" ? trigger.missionId : undefined;
    const beaconIndex = typeof trigger.beaconIndex === "number" ? trigger.beaconIndex : undefined;
    const delayMs = typeof trigger.delayMs === "number" ? trigger.delayMs : undefined;
    return {
      kind: "mission-event",
      event,
      missionId,
      beaconIndex,
      delayMs,
    };
  }

  function normalizeMissionChoices(nodeId: string, input: unknown): MissionStoryChoice[] | undefined {
    if (!Array.isArray(input)) {
      return undefined;
    }
    return input
      .map((choice, index) => {
        if (!choice || typeof choice !== "object") {
          return null;
        }
        const record = choice as Record<string, unknown>;
        const text = typeof record.text === "string" ? record.text : "";
        if (!text) {
          return null;
        }
        const id = typeof record.id === "string" ? record.id : `${nodeId}-choice-${index}`;
        let next: string | null = null;
        if (typeof record.next === "string") {
          next = record.next;
        } else if (record.next === null) {
          next = null;
        }
        return {
          id,
          text,
          next,
        };
      })
      .filter((choice): choice is MissionStoryChoice => Boolean(choice));
  }

  function resetMissionStoryState(): void {
    missionStoryQueue.splice(0, missionStoryQueue.length);
    shownMissionNodes.clear();
    missionStoryFlags.clear();
    clearMissionAutoAdvance();
    if (activeMissionNodeId) {
      overlay.hide();
    }
    hideTutorialTip();
    activeMissionNodeId = null;
  }

  function enqueueMissionNode(nodeId: string, options: { force?: boolean } = {}): void {
    if (!missionStory || !missionStory.nodes[nodeId]) {
      return;
    }
    if (!options.force && shownMissionNodes.has(nodeId)) {
      return;
    }
    if (missionStoryQueue.some((pending) => pending.nodeId === nodeId)) {
      return;
    }
    missionStoryQueue.push({ nodeId });
    tryShowNextMissionNode();
  }

  function tryShowNextMissionNode(): void {
    if (activeMissionNodeId) {
      return;
    }
    if (!missionStoryQueue.length) {
      return;
    }
    if (overlay.isVisible()) {
      return;
    }
    const next = missionStoryQueue.shift();
    if (!next) {
      return;
    }
    displayMissionNode(next.nodeId);
  }

  function displayMissionNode(nodeId: string): void {
    if (!missionStory) {
      return;
    }
    const node = missionStory.nodes[nodeId];
    if (!node) {
      tryShowNextMissionNode();
      return;
    }

    activeMissionNodeId = node.id;
    shownMissionNodes.add(node.id);

    if (node.tutorialTip) {
      showTutorialTip(node.tutorialTip);
    } else {
      hideTutorialTip();
    }

    const choices = Array.isArray(node.choices)
      ? node.choices.map((choice) => ({
        id: choice.id,
        text: choice.text,
      }))
      : undefined;

    const content: DialogueContent = {
      speaker: node.speaker,
      text: node.text,
      intent: node.intent,
      typingSpeedMs: node.typingSpeedMs,
      choices,
      continueLabel: node.continueLabel,
    };

    if (!choices || choices.length === 0) {
      content.onContinue = () => {
        finishMissionNode(node);
      };
    } else {
      content.onChoice = (choiceId: string) => {
        const resolved = node.choices?.find((choice) => choice.id === choiceId);
        const nextId = resolved?.next ?? null;
        finishMissionNode(node, nextId);
      };
    }

    if (typeof node.autoAdvance === "number" && (!choices || choices.length === 0)) {
      content.onTextFullyRendered = () => {
        clearMissionAutoAdvance();
        missionAutoAdvanceHandle = window.setTimeout(() => {
          finishMissionNode(node);
        }, Math.max(0, node.autoAdvance ?? 0));
      };
    }

    overlay.show(content);
    bus.emit("dialogue:opened", { nodeId: node.id, chapterId: missionStory.chapterId });
  }

  function clearMissionAutoAdvance(): void {
    if (missionAutoAdvanceHandle !== null) {
      window.clearTimeout(missionAutoAdvanceHandle);
      missionAutoAdvanceHandle = null;
    }
  }

  function finishMissionNode(node: MissionStoryNode, nextId?: string | null): void {
    clearMissionAutoAdvance();
    hideTutorialTip();
    overlay.hide();
    bus.emit("dialogue:closed", { nodeId: node.id, chapterId: missionStory?.chapterId ?? "campaign-1" });
    activeMissionNodeId = null;

    if (Array.isArray(node.flags)) {
      node.flags.forEach((flag) => missionStoryFlags.add(flag));
    }

    const targetNext = typeof nextId === "string"
      ? nextId
      : nextId === null
        ? null
        : node.next ?? null;

    if (targetNext) {
      enqueueMissionNode(targetNext, { force: true });
    }

    tryShowNextMissionNode();
  }

  async function triggerMissionStory(event: string, params: MissionEventParams = {}, options: { force?: boolean } = {}): Promise<void> {
    const definition = await loadMissionStory();
    if (!definition) {
      return;
    }
    const node = findNodeByTrigger(definition, event, params);
    if (!node) {
      return;
    }
    enqueueMissionNode(node.id, { force: options.force });
  }

  function findNodeByTrigger(definition: MissionStoryDefinition, event: string, params: MissionEventParams): MissionStoryNode | null {
    for (const node of Object.values(definition.nodes)) {
      if (!node.trigger || node.trigger.kind !== "mission-event") {
        continue;
      }
      if (node.trigger.event !== event) {
        continue;
      }
      if (node.trigger.missionId) {
        const compareId = params.missionId ?? activeMissionId;
        if (!compareId || node.trigger.missionId !== compareId) {
          continue;
        }
      }
      if (typeof node.trigger.beaconIndex === "number") {
        if (params.beaconIndex === undefined) {
          continue;
        }
        if (node.trigger.beaconIndex !== params.beaconIndex) {
          continue;
        }
      }
      return node;
    }
    return null;
  }

  function initMissionEventListeners(): void {
    listeners.push(bus.on("mission:start", ({ missionId }) => {
      activeMissionId = missionId ?? activeMissionId;
      resetMissionStoryState();
      triggerMissionStory("mission:start", { missionId }, { force: true }).catch(() => {});
    }));

    listeners.push(bus.on("mission:beacon-locked", ({ index }) => {
      triggerMissionStory("mission:beacon-locked", { missionId: activeMissionId ?? undefined, beaconIndex: index }).catch(() => {});
    }));

    listeners.push(bus.on("mission:completed", ({ missionId }) => {
      triggerMissionStory("mission:completed", { missionId: missionId ?? activeMissionId ?? undefined }, { force: true }).catch(() => {});
    }));

    listeners.push(bus.on("mission:failed", ({ missionId }) => {
      triggerMissionStory("mission:failed", { missionId: missionId ?? activeMissionId ?? undefined }, { force: true }).catch(() => {});
    }));
  }

  function showTutorialTip(tip: { title: string; text: string }): void {
    hideTutorialTip();

    const tipContainer = document.createElement("div");
    tipContainer.className = "story-tutorial-tip";
    tipContainer.innerHTML = `
      <div class="story-tutorial-tip-content">
        <div class="story-tutorial-tip-title">${escapeHtml(tip.title)}</div>
        <div class="story-tutorial-tip-text">${escapeHtml(tip.text)}</div>
      </div>
    `;
    document.body.appendChild(tipContainer);
    tutorialTipElement = tipContainer;

    // Ensure styles are loaded
    ensureTutorialTipStyles();
  }

  function hideTutorialTip(): void {
    if (tutorialTipElement) {
      tutorialTipElement.remove();
      tutorialTipElement = null;
    }
  }

  function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function ensureTutorialTipStyles(): void {
    const styleId = "story-tutorial-tip-styles";
    if (document.getElementById(styleId)) {
      return;
    }
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .story-tutorial-tip {
        position: fixed;
        top: 80px;
        right: 20px;
        max-width: 320px;
        background: rgba(13, 148, 136, 0.95);
        border: 1px solid rgba(56, 189, 248, 0.6);
        border-radius: 8px;
        padding: 14px 16px;
        color: #e2e8f0;
        font-family: "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;
        font-size: 12px;
        line-height: 1.5;
        z-index: 55;
        box-shadow: 0 8px 24px rgba(2, 6, 16, 0.5);
        animation: story-tip-slide-in 0.3s ease-out;
      }
      .story-tutorial-tip-title {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #38bdf8;
        margin-bottom: 8px;
      }
      .story-tutorial-tip-text {
        color: #f1f5f9;
      }
      @keyframes story-tip-slide-in {
        from {
          opacity: 0;
          transform: translateX(20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function acknowledgeNode(nodeId: string, choiceId: string | null): void {
    const msg: { type: string; node_id: string; choice_id?: string } = {
      type: "dag_story_ack",
      node_id: nodeId,
    };
    if (choiceId) {
      msg.choice_id = choiceId;
    }
    sendMessage(msg);
    console.log("[story] Acknowledged node:", nodeId, choiceId ? `(choice: ${choiceId})` : "");
  }

  function start(): void {
    console.log("[story] Starting story controller");
    // Listen for story node activation from the server
    listeners.push(bus.on("story:nodeActivated", handleNodeActivated));
    listeners.push(bus.on("dialogue:closed", () => tryShowNextMissionNode()));
    initMissionEventListeners();
    void loadMissionStory();

    // Check if there's already an active story node on startup
    if (state.story?.activeNode) {
      console.log("[story] Found active story node on startup:", state.story.activeNode);
      handleNodeActivated({
        nodeId: state.story.activeNode,
        dialogue: state.story.dialogue ?? undefined,
      });
    }
  }

  function destroy(): void {
    hideTutorialTip();
    clearMissionAutoAdvance();
    missionStoryQueue.splice(0, missionStoryQueue.length);
    activeMissionNodeId = null;
    listeners.forEach((unsub) => unsub());
    listeners.length = 0;
  }

  return {
    start,
    destroy,
  };
}
