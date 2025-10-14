const STORAGE_KEY = "lsd:callsign";

type Maybe<T> = T | null | undefined;

let saveStatusTimer: number | null = null;

const callSignInput = document.querySelector<HTMLInputElement>("#call-sign-input");
const saveStatus = document.getElementById("save-status");
const campaignButton = document.getElementById("campaign-button");
const tutorialButton = document.getElementById("tutorial-button");
const freeplayButton = document.getElementById("freeplay-button");
const mapSizeSelect = document.querySelector<HTMLSelectElement>("#map-size-select");

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

  campaignButton?.addEventListener("click", () => {
    const name = ensureCallSign();
    const roomId = generateRoomId("campaign");
    const missionId = "1";
    const url = buildRoomUrl(
      roomId,
      name,
      "campaign",
      { w: 32000, h: 18000 },
      missionId,
    );
    window.location.href = url;
  });

  tutorialButton?.addEventListener("click", () => {
    const name = ensureCallSign();
    const mapSize = getSelectedMapSize();
    const roomId = generateRoomId("tutorial");
    const url = buildRoomUrl(roomId, name, "tutorial", mapSize);
    window.location.href = url;
  });

  freeplayButton?.addEventListener("click", () => {
    const name = ensureCallSign();
    const mapSize = getSelectedMapSize();
    const roomId = generateRoomId("freeplay");
    const url = buildRoomUrl(roomId, name, "freeplay", mapSize);
    window.location.href = url;
  });
}

function getSelectedMapSize(): { w: number; h: number } {
  const selected = mapSizeSelect?.value || "medium";
  switch (selected) {
    case "small":
      return { w: 4000, h: 2250 };
    case "medium":
      return { w: 8000, h: 4500 };
    case "large":
      return { w: 16000, h: 9000 };
    case "huge":
      return { w: 32000, h: 18000 };
    default:
      return { w: 8000, h: 4500 };
  }
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

function buildRoomUrl(
  roomId: string,
  callSign: string,
  mode?: string,
  mapSize?: { w: number; h: number },
  missionId?: string,
): string {
  let url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
  if (mode) {
    url += `&mode=${encodeURIComponent(mode)}`;
  }
  if (missionId) {
    url += `&mission=${encodeURIComponent(missionId)}`;
  }
  if (callSign) {
    url += `&name=${encodeURIComponent(callSign)}`;
  }
  if (mapSize) {
    url += `&mapW=${mapSize.w}&mapH=${mapSize.h}`;
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
