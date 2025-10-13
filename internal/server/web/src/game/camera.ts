import type { AppState, UIState } from "../state";
import { clamp } from "../state";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";

export interface CameraDependencies {
  canvas: HTMLCanvasElement | null;
  state: AppState;
  uiState: UIState;
}

interface WorldSize {
  w: number;
  h: number;
}

export interface Camera {
  setZoom(newZoom: number, centerX?: number, centerY?: number): void;
  getCameraPosition(): { x: number; y: number };
  worldToCanvas(p: { x: number; y: number }): { x: number; y: number };
  canvasToWorld(p: { x: number; y: number }): { x: number; y: number };
  updateWorldFromMeta(meta: Partial<WorldSize | undefined>): void;
  getWorldSize(): WorldSize;
}

export function createCamera({ canvas, state, uiState }: CameraDependencies): Camera {
  const world: WorldSize = { w: 8000, h: 4500 };

  function resolveCanvas(): HTMLCanvasElement | null {
    return canvas ?? null;
  }

  function setZoom(newZoom: number, centerX?: number, centerY?: number): void {
    // center parameters reserved for potential smooth zooming logic
    void centerX;
    void centerY;
    uiState.zoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  }

  function getCameraPosition(): { x: number; y: number } {
    const cv = resolveCanvas();
    if (!cv) return { x: world.w / 2, y: world.h / 2 };

    const zoom = uiState.zoom;

    let cameraX = state.me ? state.me.x : world.w / 2;
    let cameraY = state.me ? state.me.y : world.h / 2;

    const scaleX = cv.width / world.w;
    const scaleY = cv.height / world.h;
    const scale = Math.min(scaleX, scaleY) * zoom;

    const viewportWidth = cv.width / scale;
    const viewportHeight = cv.height / scale;

    const minCameraX = viewportWidth / 2;
    const maxCameraX = world.w - viewportWidth / 2;
    const minCameraY = viewportHeight / 2;
    const maxCameraY = world.h - viewportHeight / 2;

    if (viewportWidth < world.w) {
      cameraX = clamp(cameraX, minCameraX, maxCameraX);
    } else {
      cameraX = world.w / 2;
    }

    if (viewportHeight < world.h) {
      cameraY = clamp(cameraY, minCameraY, maxCameraY);
    } else {
      cameraY = world.h / 2;
    }

    return { x: cameraX, y: cameraY };
  }

  function worldToCanvas(p: { x: number; y: number }): { x: number; y: number } {
    const cv = resolveCanvas();
    if (!cv) return { x: p.x, y: p.y };

    const zoom = uiState.zoom;
    const camera = getCameraPosition();

    const worldX = p.x - camera.x;
    const worldY = p.y - camera.y;

    const scaleX = cv.width / world.w;
    const scaleY = cv.height / world.h;
    const scale = Math.min(scaleX, scaleY) * zoom;

    return {
      x: worldX * scale + cv.width / 2,
      y: worldY * scale + cv.height / 2,
    };
  }

  function canvasToWorld(p: { x: number; y: number }): { x: number; y: number } {
    const cv = resolveCanvas();
    if (!cv) return { x: p.x, y: p.y };

    const zoom = uiState.zoom;
    const camera = getCameraPosition();

    const canvasX = p.x - cv.width / 2;
    const canvasY = p.y - cv.height / 2;

    const scaleX = cv.width / world.w;
    const scaleY = cv.height / world.h;
    const scale = Math.min(scaleX, scaleY) * zoom;

    return {
      x: canvasX / scale + camera.x,
      y: canvasY / scale + camera.y,
    };
  }

  function updateWorldFromMeta(meta: Partial<WorldSize | undefined>): void {
    if (!meta) return;
    if (typeof meta.w === "number" && Number.isFinite(meta.w)) {
      world.w = meta.w;
    }
    if (typeof meta.h === "number" && Number.isFinite(meta.h)) {
      world.h = meta.h;
    }
  }

  function getWorldSize(): WorldSize {
    return { ...world };
  }

  return {
    setZoom,
    getCameraPosition,
    worldToCanvas,
    canvasToWorld,
    updateWorldFromMeta,
    getWorldSize,
  };
}
