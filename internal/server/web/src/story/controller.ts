import type { EventBus } from "../bus";
import type { AppState } from "../state";
import type { DialogueOverlay } from "./overlay";
import type { DialogueContent } from "./types";
import { sendMessage } from "../net";

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
    listeners.forEach((unsub) => unsub());
    listeners.length = 0;
  }

  return {
    start,
    destroy,
  };
}
