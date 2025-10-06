const STORAGE_PREFIX = "lsd:story:";

export interface StoryFlags {
  [key: string]: boolean;
}

export interface StoryProgress {
  chapterId: string;
  nodeId: string;
  flags: StoryFlags;
  visited?: string[];
  updatedAt: number;
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
  } catch {
    return null;
  }
  return window.localStorage;
}

function storageKey(chapterId: string, roomId: string | null | undefined): string {
  const roomSegment = roomId ? `${roomId}:` : "";
  return `${STORAGE_PREFIX}${roomSegment}${chapterId}`;
}

export function loadStoryProgress(chapterId: string, roomId: string | null | undefined): StoryProgress | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey(chapterId, roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoryProgress;
    if (
      typeof parsed !== "object" || parsed === null ||
      typeof parsed.chapterId !== "string" ||
      typeof parsed.nodeId !== "string" ||
      typeof parsed.updatedAt !== "number" ||
      typeof parsed.flags !== "object" || parsed.flags === null
    ) {
      return null;
    }
    return {
      chapterId: parsed.chapterId,
      nodeId: parsed.nodeId,
      flags: { ...parsed.flags },
      visited: Array.isArray(parsed.visited) ? [...parsed.visited] : undefined,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function saveStoryProgress(chapterId: string, roomId: string | null | undefined, progress: StoryProgress): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(storageKey(chapterId, roomId), JSON.stringify(progress));
  } catch {
    // ignore persistence errors
  }
}

export function clearStoryProgress(chapterId: string, roomId: string | null | undefined): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(chapterId, roomId));
  } catch {
    // ignore persistence errors
  }
}

export function updateFlag(current: StoryFlags, flag: string, value: boolean): StoryFlags {
  const next = { ...current };
  if (!value) {
    delete next[flag];
  } else {
    next[flag] = true;
  }
  return next;
}
