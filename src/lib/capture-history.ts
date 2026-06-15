/**
 * Thumbnail generation for capture-history entries.
 *
 * Kept separate from the store and from App.tsx so it can be unit-tested in
 * isolation. Note: jsdom does not implement canvas `drawImage`/`toDataURL`
 * meaningfully, so only the pure `computeThumbnailDims` math is unit-tested;
 * `generateThumbnail` / `generateThumbnailFromPath` are intentionally thin and
 * exercised only in the browser.
 */

import { convertFileSrc } from "@tauri-apps/api/core";
import { loadImage } from "@/hooks/usePreviewGenerator";

export interface ThumbnailResult {
  /** Small PNG data-URL (longest edge <= maxEdge). */
  thumbnail: string;
  /** Full-resolution natural width of the source image. */
  width: number;
  /** Full-resolution natural height of the source image. */
  height: number;
}

/**
 * Compute scaled thumbnail dimensions for a source of `width` x `height` so the
 * longest edge is at most `maxEdge`. Preserves aspect ratio and never upscales
 * (a source already within the box keeps its original dimensions).
 */
export function computeThumbnailDims(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= 0) {
    return { width: 0, height: 0 };
  }
  // Clamp at 1 so small images are never upscaled.
  const scale = Math.min(1, maxEdge / longestEdge);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Load a data-URL into an HTMLImageElement.
 *
 * Uses a dedicated `new Image()` rather than the shared LRU `loadImage` cache:
 * every save produces a unique full-res data-URL, so caching it would only evict
 * the background images the editor legitimately reuses for one-shot thumbnails.
 */
function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for thumbnail"));
    img.src = dataUrl;
  });
}

/**
 * Scale an already-loaded image into a thumbnail data-URL.
 *
 * Shared by `generateThumbnail` (data-URL source) and
 * `generateThumbnailFromPath` (on-disk source) so both go through the same
 * `computeThumbnailDims` + canvas-draw path.
 */
function thumbnailFromImage(img: HTMLImageElement, maxEdge: number): ThumbnailResult {
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;

  const dims = computeThumbnailDims(naturalWidth, naturalHeight, maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context for thumbnail");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, dims.width, dims.height);

  return {
    thumbnail: canvas.toDataURL("image/png"),
    width: naturalWidth,
    height: naturalHeight,
  };
}

/**
 * Generate a small PNG thumbnail from a full-resolution image data-URL.
 *
 * Returns the scaled thumbnail data-URL plus the *full-resolution* natural
 * dimensions of the source (not the thumbnail's scaled dims).
 */
export async function generateThumbnail(dataUrl: string, maxEdge = 320): Promise<ThumbnailResult> {
  const img = await loadImageElement(dataUrl);
  return thumbnailFromImage(img, maxEdge);
}

/**
 * Generate a small PNG thumbnail from a raw capture's on-disk file path.
 *
 * Used at capture time: the raw PNG lives under the app-data captures dir (in
 * the `$APPDATA/**` asset-protocol scope), so it loads directly via
 * `convertFileSrc` — no copy step. Mirrors BatchResize's
 * `convertFileSrc` + `loadImage` pattern and reuses the shared canvas-draw path,
 * so `width`/`height` are the raw capture's natural dimensions.
 */
export async function generateThumbnailFromPath(
  path: string,
  maxEdge = 320
): Promise<ThumbnailResult> {
  const assetUrl = convertFileSrc(path);
  const img = await loadImage(assetUrl);
  return thumbnailFromImage(img, maxEdge);
}

// ============================================================================
// Raw-capture recording (separable seam)
// ============================================================================

/** A capture-history entry shaped like the store's `CaptureHistoryEntry`. */
interface RecordedEntry {
  id: string;
  thumbnail: string;
  savedPath: string;
  width: number;
  height: number;
  createdAt: number;
}

/**
 * Dependencies for {@link recordRawCapture}, injected so the recording flow can
 * be unit-tested without a real canvas, the Zustand store, or Tauri IPC.
 */
export interface RecordRawCaptureDeps {
  /** The raw capture's on-disk path (under the app-data captures dir). */
  path: string;
  /** Builds the thumbnail + natural dims from the raw capture file. */
  generateThumb?: (path: string) => Promise<ThumbnailResult>;
  /** Prepends the entry, re-caps, and returns the entries evicted past N. */
  addEntry: (entry: RecordedEntry) => RecordedEntry[];
  /** Deletes an evicted raw capture's PNG from disk. */
  deleteFile: (path: string) => Promise<void> | void;
}

/**
 * Record a raw capture into the rolling buffer and delete any evicted file(s).
 *
 * This is the buffer-recording seam, deliberately decoupled from opening the
 * editor: `handleCapture` calls this (fire-and-forget) and *independently* opens
 * the editor, so a future "open editor immediately after capture" toggle can
 * flip burst-capture without touching recording.
 *
 * Eviction is the buffer's *only* file deleter — when a new capture pushes the
 * oldest past N, that entry's PNG is removed here so the captures dir does not
 * leak files. Failures are surfaced to the caller (which swallows them) so
 * thumbnail/IO trouble never blocks the capture or the editor.
 */
export async function recordRawCapture({
  path,
  generateThumb = generateThumbnailFromPath,
  addEntry,
  deleteFile,
}: RecordRawCaptureDeps): Promise<void> {
  const { thumbnail, width, height } = await generateThumb(path);
  const evicted = addEntry({
    id: crypto.randomUUID(),
    thumbnail,
    savedPath: path,
    width,
    height,
    createdAt: Date.now(),
  });
  for (const entry of evicted) {
    try {
      await deleteFile(entry.savedPath);
    } catch (err) {
      console.error("Failed to delete evicted capture file:", err);
    }
  }
}
