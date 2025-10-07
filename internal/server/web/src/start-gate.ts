// src/start-gate.ts
export type StartGateOptions = {
  label?: string;
  requestFullscreen?: boolean;
  resumeAudio?: () => Promise<void> | void; // e.g., from story/sfx.ts
};

export function waitForUserStart(opts: StartGateOptions = {}): Promise<void> {
  const { label = "Start Game", requestFullscreen = false, resumeAudio } = opts;

  return new Promise((resolve) => {
    // overlay
    const overlay = document.createElement("div");
    overlay.id = "start-overlay";
    overlay.innerHTML = `
      <div id="start-container">
        <button id="start-btn" aria-label="${label}">${label}</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // styles (you can move these to a CSS file later)
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
    `;
    document.head.appendChild(style);

    const start = async () => {
      // audio first (unlocks WebAudio on user gesture)
      try { await resumeAudio?.(); } catch {/* ignore */}

      // optional fullscreen
      if (requestFullscreen) {
        try { await document.documentElement.requestFullscreen?.(); } catch {/* ignore */}
      }

      // cleanup
      style.remove();
      overlay.remove();
      resolve();
    };

    const btn = overlay.querySelector<HTMLButtonElement>("#start-btn")!;
    btn.addEventListener("click", start, { once: true });
    // Accessibility: allow Enter / Space
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        start();
      }
    });
    // Focus for keyboard users
    btn.tabIndex = 0;
    btn.focus();
  });
}
