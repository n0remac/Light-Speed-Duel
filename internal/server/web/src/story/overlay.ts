import { clamp } from "../state";

export interface DialogueChoice {
  id: string;
  text: string;
}

export interface DialogueContent {
  speaker: string;
  text: string;
  intent?: "factory" | "unit";
  choices?: DialogueChoice[];
  typingSpeedMs?: number;
  onChoice?: (choiceId: string) => void;
  onTextFullyRendered?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
}

export interface DialogueOverlay {
  show(content: DialogueContent): void;
  hide(): void;
  destroy(): void;
  isVisible(): boolean;
}

const STYLE_ID = "dialogue-overlay-style";

export function createDialogueOverlay(): DialogueOverlay {
  ensureStyles();

  const overlay = document.createElement("div");
  overlay.className = "dialogue-overlay";
  overlay.setAttribute("aria-live", "polite");

  const consoleFrame = document.createElement("div");
  consoleFrame.className = "dialogue-console";

  const speakerLabel = document.createElement("div");
  speakerLabel.className = "dialogue-speaker";

  const textBlock = document.createElement("div");
  textBlock.className = "dialogue-text";

  const cursor = document.createElement("span");
  cursor.className = "dialogue-cursor";
  cursor.textContent = "_";

  const choicesList = document.createElement("ul");
  choicesList.className = "dialogue-choices hidden";

  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.className = "dialogue-continue hidden";
  continueButton.textContent = "Continue";

  textBlock.append(cursor);
  consoleFrame.append(speakerLabel, textBlock, choicesList, continueButton);
  overlay.append(consoleFrame);
  document.body.appendChild(overlay);

  let visible = false;
  let typingHandle: number | null = null;
  let targetText = "";
  let renderedChars = 0;
  let activeContent: DialogueContent | null = null;

  function clearTyping(): void {
    if (typingHandle !== null) {
      window.clearTimeout(typingHandle);
      typingHandle = null;
    }
  }

  function finishTyping(content: DialogueContent): void {
    renderedChars = targetText.length;
    updateText();
    clearTyping();
    content.onTextFullyRendered?.();
    if (!Array.isArray(content.choices) || content.choices.length === 0) {
      showContinue(content);
    }
  }

  function updateText(): void {
    const textToShow = targetText.slice(0, renderedChars);
    textBlock.innerHTML = "";
    const textNode = document.createElement("span");
    textNode.textContent = textToShow;
    textBlock.append(textNode, cursor);
    cursor.classList.toggle("hidden", !visible);
  }

  function renderChoices(content: DialogueContent): void {
    choicesList.innerHTML = "";
    const choices = Array.isArray(content.choices) ? content.choices : [];
    if (choices.length === 0) {
      choicesList.classList.add("hidden");
      return;
    }
    choicesList.classList.remove("hidden");
    choices.forEach((choice, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.choiceId = choice.id;
      button.textContent = `${index + 1}. ${choice.text}`;
      button.addEventListener("click", () => {
        content.onChoice?.(choice.id);
      });
      item.append(button);
      choicesList.append(item);
    });
  }

  function showContinue(content: DialogueContent): void {
    if (!content.onContinue) {
      continueButton.classList.add("hidden");
      continueButton.onclick = null;
      return;
    }
    continueButton.textContent = content.continueLabel ?? "Continue";
    continueButton.classList.remove("hidden");
    continueButton.onclick = () => {
      content.onContinue?.();
    };
  }

  function scheduleType(content: DialogueContent): void {
    clearTyping();
    const typingSpeed = clamp(Number(content.typingSpeedMs) || 18, 8, 64);
    const tick = (): void => {
      renderedChars = Math.min(renderedChars + 1, targetText.length);
      updateText();
      if (renderedChars >= targetText.length) {
        clearTyping();
        content.onTextFullyRendered?.();
        if (!Array.isArray(content.choices) || content.choices.length === 0) {
          showContinue(content);
        }
      } else {
        typingHandle = window.setTimeout(tick, typingSpeed);
      }
    };
    typingHandle = window.setTimeout(tick, typingSpeed);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!visible || !activeContent) return;
    if (!Array.isArray(activeContent.choices) || activeContent.choices.length === 0) {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (renderedChars < targetText.length) {
          finishTyping(activeContent);
        } else {
          activeContent.onContinue?.();
        }
      }
      return;
    }
    const index = parseInt(event.key, 10);
    if (Number.isFinite(index) && index >= 1 && index <= activeContent.choices.length) {
      event.preventDefault();
      const choice = activeContent.choices[index - 1];
      activeContent.onChoice?.(choice.id);
      return;
    }
    if (event.key === "Enter" && renderedChars < targetText.length) {
      event.preventDefault();
      finishTyping(activeContent);
    }
  }

  function show(content: DialogueContent): void {
    activeContent = content;
    visible = true;
    overlay.classList.add("visible");
    overlay.dataset.intent = content.intent ?? "factory";
    speakerLabel.textContent = content.speaker;

    targetText = content.text;
    renderedChars = 0;
    updateText();
    renderChoices(content);
    showContinue(content);
    scheduleType(content);
  }

  function hide(): void {
    visible = false;
    activeContent = null;
    overlay.classList.remove("visible");
    clearTyping();
    targetText = "";
    renderedChars = 0;
    textBlock.innerHTML = "";
    textBlock.append(cursor);
    choicesList.innerHTML = "";
    choicesList.classList.add("hidden");
    continueButton.classList.add("hidden");
    continueButton.onclick = null;
  }

  function destroy(): void {
    hide();
    document.removeEventListener("keydown", handleKeyDown);
    overlay.remove();
  }

  document.addEventListener("keydown", handleKeyDown);

  return {
    show,
    hide,
    destroy,
    isVisible() {
      return visible;
    },
  };
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .dialogue-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 60;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .dialogue-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }
    .dialogue-console {
      min-width: 320px;
      max-width: min(520px, calc(100vw - 48px));
      background: rgba(6, 11, 16, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 12px;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 28px 64px rgba(2, 6, 16, 0.6);
      color: #e2e8f0;
      font-family: "IBM Plex Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    .dialogue-overlay[data-intent="factory"] .dialogue-console {
      border-color: rgba(56, 189, 248, 0.45);
      box-shadow: 0 28px 64px rgba(13, 148, 136, 0.35);
    }
    .dialogue-overlay[data-intent="unit"] .dialogue-console {
      border-color: rgba(244, 114, 182, 0.45);
      box-shadow: 0 28px 64px rgba(236, 72, 153, 0.28);
    }
    .dialogue-speaker {
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(148, 163, 184, 0.75);
    }
    .dialogue-text {
      min-height: 90px;
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
    }
    .dialogue-cursor {
      display: inline-block;
      margin-left: 4px;
      animation: dialogue-cursor-blink 1.2s steps(2, start) infinite;
    }
    .dialogue-cursor.hidden {
      display: none;
    }
    .dialogue-choices {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .dialogue-choices.hidden {
      display: none;
    }
    .dialogue-choices button,
    .dialogue-continue {
      font: inherit;
      text-align: left;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.3);
      background: rgba(24, 36, 48, 0.85);
      color: inherit;
      cursor: pointer;
      transition: background 0.18s ease, border-color 0.18s ease;
    }
    .dialogue-continue {
      text-align: center;
    }
    .dialogue-continue.hidden {
      display: none;
    }
    .dialogue-choices button:hover,
    .dialogue-choices button:focus-visible,
    .dialogue-continue:hover,
    .dialogue-continue:focus-visible {
      border-color: rgba(56, 189, 248, 0.55);
      background: rgba(30, 45, 60, 0.95);
      outline: none;
    }
    @keyframes dialogue-cursor-blink {
      0%, 50% { opacity: 1; }
      50.01%, 100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

