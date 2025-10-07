const STORAGE_KEY = "lsd:callsign";

type Maybe<T> = T | null | undefined;

let saveStatusTimer: number | null = null;
let pendingRoomId: string | null = null;

const callSignInput = document.querySelector<HTMLInputElement>("#call-sign-input");
const saveStatus = document.getElementById("save-status");
const copyRoomButton = document.getElementById("copy-room-url");
const roomUrlInput = document.querySelector<HTMLInputElement>("#room-url");
const roomShare = document.getElementById("room-share");
const enterRoomButton = document.getElementById("enter-room");
const joinRoomInput = document.querySelector<HTMLInputElement>("#join-room-input");
const campaignButton = document.getElementById("campaign-button");
const tutorialButton = document.getElementById("tutorial-button");
const freeplayButton = document.getElementById("freeplay-button");

bootstrap();

function bootstrap(): void {
  const initialName = resolveInitialCallSign();
  if (callSignInput) {
    callSignInput.value = initialName;
  }

  document.getElementById("call-sign-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = ensureCallSign();
    if (name) {
      showSaveStatus("Saved call sign");
    } else {
      showSaveStatus("Cleared call sign");
    }
  });

  document.getElementById("new-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = ensureCallSign();
    const roomId = generateRoomId();
    pendingRoomId = roomId;
    const url = buildRoomUrl(roomId, name);
    if (roomUrlInput) {
      roomUrlInput.value = url;
    }
    roomShare?.classList.add("visible");
  });

  copyRoomButton?.addEventListener("click", async () => {
    const url = roomUrlInput?.value.trim();
    if (!url) {
      return;
    }
    const originalLabel = copyRoomButton.textContent;
    try {
      await navigator.clipboard.writeText(url);
      copyRoomButton.textContent = "Copied";
    } catch {
      roomUrlInput?.select();
      document.execCommand("copy");
      copyRoomButton.textContent = "Copied";
    }
    window.setTimeout(() => {
      copyRoomButton.textContent = originalLabel ?? "Copy Link";
    }, 1500);
  });

  enterRoomButton?.addEventListener("click", () => {
    const roomId = pendingRoomId;
    if (!roomId) {
      joinRoomInput?.focus();
      return;
    }
    const url = buildRoomUrl(roomId, ensureCallSign());
    window.location.href = url;
  });

  document.getElementById("join-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const raw = joinRoomInput?.value ?? "";
    const extracted = extractRoomId(raw);
    if (!extracted) {
      joinRoomInput?.focus();
      return;
    }
    const url = buildRoomUrl(extracted, ensureCallSign());
    window.location.href = url;
  });

  campaignButton?.addEventListener("click", () => {
    const name = ensureCallSign();
    const roomId = generateRoomId("campaign");
    const url = buildRoomUrl(roomId, name, "campaign");
    window.location.href = url;
  });

  tutorialButton?.addEventListener("click", () => {
    const name = ensureCallSign();
    const roomId = generateRoomId("tutorial");
    const url = buildRoomUrl(roomId, name, "tutorial");
    window.location.href = url;
  });

  freeplayButton?.addEventListener("click", () => {
    const name = ensureCallSign();
    const roomId = generateRoomId("freeplay");
    const url = buildRoomUrl(roomId, name, "freeplay");
    window.location.href = url;
  });
}

function ensureCallSign(): string {
  const inputName = callSignInput ? callSignInput.value : "";
  const sanitized = sanitizeCallSign(inputName);
  if (callSignInput) {
    callSignInput.value = sanitized;
  }
  persistCallSign(sanitized);
  return sanitized;
}

function resolveInitialCallSign(): string {
  const fromQuery = sanitizeCallSign(new URLSearchParams(window.location.search).get("name"));
  const stored = sanitizeCallSign(readStoredCallSign());
  if (fromQuery) {
    if (fromQuery !== stored) {
      persistCallSign(fromQuery);
    }
    return fromQuery;
  }
  return stored;
}

function sanitizeCallSign(value: Maybe<string>): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, 24);
}

function persistCallSign(name: string): void {
  try {
    if (name) {
      window.localStorage.setItem(STORAGE_KEY, name);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* localStorage unavailable; ignore */
  }
}

function readStoredCallSign(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function buildRoomUrl(roomId: string, callSign: string, mode?: string): string {
  let url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
  if (mode) {
    url += `&mode=${encodeURIComponent(mode)}`;
  }
  if (callSign) {
    url += `&name=${encodeURIComponent(callSign)}`;
  }
  return url;
}

function generateRoomId(prefix?: string): string {
  let slug = "";
  while (slug.length < 6) {
    slug = Math.random().toString(36).slice(2, 8);
  }
  if (prefix) {
    return `${prefix}-${slug}`;
  }
  return `r-${slug}`;
}

function extractRoomId(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  try {
    const maybeUrl = new URL(value);
    const param = maybeUrl.searchParams.get("room");
    if (param) {
      return param.trim();
    }
  } catch {
    // not a full URL
  }
  const qsIndex = value.indexOf("room=");
  if (qsIndex !== -1) {
    const substring = value.slice(qsIndex + 5);
    const ampIndex = substring.indexOf("&");
    const id = ampIndex === -1 ? substring : substring.slice(0, ampIndex);
    if (id) {
      return id.trim();
    }
  }
  if (/^[a-zA-Z0-9_-]+$/.test(value)) {
    return value;
  }
  return null;
}

function showSaveStatus(message: string): void {
  if (!saveStatus) {
    return;
  }
  saveStatus.textContent = message;
  if (saveStatusTimer !== null) {
    window.clearTimeout(saveStatusTimer);
  }
  saveStatusTimer = window.setTimeout(() => {
    if (saveStatus) {
      saveStatus.textContent = "";
    }
    saveStatusTimer = null;
  }, 2000);
}
