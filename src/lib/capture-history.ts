/**
 * Thumbnail generation for capture-history entries.
 *
 * Kept separate from the store and from App.tsx so it can be unit-tested in
 * isolation. Note: jsdom does not implement canvas `drawImage`/`toDataURL`
 * meaningfully, so only the pure `computeThumbnailDims` math is unit-tested;
 * `generateThumbnail` is intentionally thin and exercised only in the browser.
 */

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
 * Generate a small PNG thumbnail from a full-resolution image data-URL.
 *
 * Returns the scaled thumbnail data-URL plus the *full-resolution* natural
 * dimensions of the source (not the thumbnail's scaled dims).
 */
export async function generateThumbnail(dataUrl: string, maxEdge = 320): Promise<ThumbnailResult> {
  const img = await loadImageElement(dataUrl);
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
