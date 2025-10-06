const STORAGE_PREFIX = "lsd:tutorial:";

export interface TutorialProgress {
  stepIndex: number;
  completed: boolean;
  updatedAt: number;
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
  } catch (err) {
    return null;
  }
  return window.localStorage;
}

export function loadProgress(id: string): TutorialProgress | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TutorialProgress;
    if (
      typeof parsed !== "object" || parsed === null ||
      typeof parsed.stepIndex !== "number" ||
      typeof parsed.completed !== "boolean" ||
      typeof parsed.updatedAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch (err) {
    return null;
  }
}

export function saveProgress(id: string, progress: TutorialProgress): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_PREFIX + id, JSON.stringify(progress));
  } catch (err) {
    // ignore storage failures
  }
}

export function clearProgress(id: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_PREFIX + id);
  } catch (err) {
    // ignore storage failures
  }
}
