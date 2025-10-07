// src/start-gate.ts
export type StartGateOptions = {
  label?: string;
  requestFullscreen?: boolean;
  resumeAudio?: () => Promise<void> | void; // e.g., from story/sfx.ts
};

const STORAGE_KEY = "lsd:muted";

// Helper: get the shared AudioContext you expose somewhere in your audio engine:
//   (window as any).LSD_AUDIO_CTX = ctx;
function getCtx(): AudioContext | null {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = (window as any).LSD_AUDIO_CTX;
  return ctx instanceof AC ? ctx as AudioContext : null;
}

class MuteManager {
  private buttons: HTMLButtonElement[] = [];
  private enforcing = false;

  constructor() {
    // keep UI in sync if someone else toggles
    document.addEventListener("lsd:muteChanged", (e: any) => {
      const muted = !!e?.detail?.muted;
      this.applyUI(muted);
    });
  }

  isMuted(): boolean {
    return localStorage.getItem(STORAGE_KEY) === "1";
  }

  private save(muted: boolean) {
    try { localStorage.setItem(STORAGE_KEY, muted ? "1" : "0"); } catch {}
  }

  private label(btn: HTMLButtonElement, muted: boolean) {
    btn.setAttribute("aria-pressed", String(muted));
    btn.title = muted ? "Unmute (M)" : "Mute (M)";
    btn.textContent = muted ? "🔈 Unmute" : "🔇 Mute";
  }

  private applyUI(muted: boolean) {
    this.buttons.forEach(b => this.label(b, muted));
  }

  attachButton(btn: HTMLButtonElement) {
    this.buttons.push(btn);
    this.label(btn, this.isMuted());
    btn.addEventListener("click", () => this.toggle());
  }

  async setMuted(muted: boolean) {
    this.save(muted);
    this.applyUI(muted);

    const ctx = getCtx();
    if (ctx) {
      try {
        if (muted && ctx.state !== "suspended") {
          await ctx.suspend();
        } else if (!muted && ctx.state !== "running") {
          await ctx.resume();
        }
      } catch (e) {
        console.warn("[audio] mute toggle failed:", e);
      }
    }

    document.dispatchEvent(new CustomEvent("lsd:muteChanged", { detail: { muted } }));
  }

  toggle() {
    this.setMuted(!this.isMuted());
  }

  // If ctx isn't created until after Start, enforce persisted state once available
  enforceOnceWhenReady() {
    if (this.enforcing) return;
    this.enforcing = true;
    const tick = () => {
      const ctx = getCtx();
      if (!ctx) { requestAnimationFrame(tick); return; }
      this.setMuted(this.isMuted());
    };
    tick();
  }
}

const muteMgr = new MuteManager();

// Install a mute button in the top frame (right side) if possible.
function ensureTopFrameMuteButton() {
  const topRight = document.getElementById("top-right");
  if (!topRight) return;

  // Avoid duplicates
  if (topRight.querySelector("#mute-top")) return;

  const btn = document.createElement("button");
  btn.id = "mute-top";
  btn.className = "ghost-btn small";
  btn.setAttribute("aria-pressed", "false");
  btn.title = "Mute (M)";
  btn.textContent = "🔇 Mute";
  topRight.appendChild(btn);
  muteMgr.attachButton(btn);
}

// Global keyboard shortcut (M)
(function installMuteHotkey() {
  window.addEventListener("keydown", (e) => {
    if (e.key?.toLowerCase() === "m") {
      e.preventDefault();
      muteMgr.toggle();
    }
  });
})();

export function waitForUserStart(opts: StartGateOptions = {}): Promise<void> {
  const { label = "Start Game", requestFullscreen = false, resumeAudio } = opts;

  return new Promise((resolve) => {
    // overlay
    const overlay = document.createElement("div");
    overlay.id = "start-overlay";
    overlay.innerHTML = `
      <div id="start-container">
        <button id="start-btn" aria-label="${label}">${label}</button>
        <div style="margin-top:10px">
          <button id="mute-below-start" class="ghost-btn" aria-pressed="false" title="Mute (M)">🔇 Mute</button>
        </div>
        <p> On mobile turn phone to landscape for best experience. </p>
      </div>
    `;
    document.body.appendChild(overlay);

    // styles (move to CSS later if you want)
    const style = document.createElement("style");
    style.textContent = `
      #start-overlay {
        position: fixed; inset: 0; display: flex; justify-content: center; align-items: center;
        background: radial-gradient(circle at center, rgba(0,0,0,0.6), rgba(0,0,0,0.9));
        z-index: 9999;
      }
      #start-container { text-align: center; }
      #start-btn {
        font-size: 2rem; padding: 1rem 2.5rem; border: 2px solid #fff; border-radius: 10px;
        background: transparent; color: #fff; cursor: pointer; transition: transform .12s ease, background .2s ease, color .2s ease;
      }
      #start-btn:hover { background: #fff; color: #000; transform: translateY(-1px); }
      #start-btn:active { transform: translateY(0); }
      #mute-below-start {
        font-size: 1rem; padding: .5rem 1rem; border-radius: 999px; border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(30, 41, 59, 0.72); color: #f8fafc;
      }
      .ghost-btn.small { padding: 4px 8px; font-size: 11px; }
    `;
    document.head.appendChild(style);

    // Wire overlay buttons
    const startBtn = overlay.querySelector<HTMLButtonElement>("#start-btn")!;
    const muteBelowStart = overlay.querySelector<HTMLButtonElement>("#mute-below-start")!;
    const topMute = document.getElementById("mute-top") as HTMLButtonElement | null;
    if (topMute) muteMgr.attachButton(topMute);
    muteMgr.attachButton(muteBelowStart);

    // restore persisted mute label immediately
    muteMgr.enforceOnceWhenReady();

    const start = async () => {
      // audio first (user gesture)
      try { await resumeAudio?.(); } catch {}

      // respect persisted mute state now that ctx likely exists
      muteMgr.enforceOnceWhenReady();

      // optional fullscreen
      if (requestFullscreen) {
        try { await document.documentElement.requestFullscreen?.(); } catch {}
      }

      // cleanup overlay
      style.remove();
      overlay.remove();

      // ensure top-frame mute button exists after overlay
      ensureTopFrameMuteButton();

      resolve();
    };

    // start button
    startBtn.addEventListener("click", start, { once: true });

    // Accessibility: allow Enter / Space
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        start();
      }
    });

    // Focus for keyboard users
    startBtn.tabIndex = 0;
    startBtn.focus();

    // Also try to create the top-frame mute immediately if DOM is ready
    // (If #top-right isn't there yet, it's harmless; we'll add it after start too.)
    ensureTopFrameMuteButton();
  });
}
