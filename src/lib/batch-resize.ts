import type { RenderOptions } from "@/lib/canvas-utils";

export type FitMode = "fit" | "cover";
export type LetterboxColor = "transparent" | "white" | "black";

export interface BatchItem {
  id: string;
  /** Original user-picked path, used to derive the output filename. */
  sourcePath: string;
  /** Sandboxed temp-workspace path the asset URL is derived from (for cleanup). */
  workspacePath: string;
  assetUrl: string;
  originalWidth: number;
  originalHeight: number;
}

export type BatchStatus = "pending" | "processing" | "done" | "error";

/**
 * Derive a unique output filename for a resized image.
 *
 * Takes the basename of the source path, strips the final extension
 * (case-insensitive), and produces `${stem}-${w}x${h}.png`. If that name
 * (compared case-insensitively) is already in `taken`, a `-2`, `-3`, ...
 * suffix is appended before `.png` until unique. The chosen name (lowercased)
 * is added to `taken`. The returned name preserves the original case of the stem.
 */
export function deriveFilename(
  sourcePath: string,
  w: number,
  h: number,
  taken: Set<string>
): string {
  // Basename, handling both `/` and `\` separators.
  const basename = sourcePath.split(/[/\\]/).pop() ?? sourcePath;
  // Strip the final extension (case-insensitive).
  const stem = basename.replace(/\.[^.]+$/, "");

  const base = `${stem}-${w}x${h}`;
  let candidate = `${base}.png`;
  let counter = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}.png`;
    counter++;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Build the exact RenderOptions needed to produce a W×H output canvas with no
 * decoration (no shadow, no padding pixels, no scaling beyond the chosen fit mode).
 */
export function buildRenderOptions(
  image: HTMLImageElement,
  w: number,
  h: number,
  fit: FitMode,
  bg: LetterboxColor
): RenderOptions {
  return {
    image,
    backgroundType: bg,
    customColor: "#ffffff",
    selectedImage: null,
    bgImage: null,
    blurAmount: 0,
    noiseAmount: 0,
    borderRadius: 0,
    padding: 1,
    scale: 1,
    shadow: { blur: 0, offsetX: 0, offsetY: 0, opacity: 0 },
    canvasDimensions: { width: w, height: h },
    imageOffset: { x: 0, y: 0 },
    imageScalingMode: fit === "fit" ? "fit" : "cover",
    imageBorderSize: 0,
    frameType: "none",
  };
}

export interface BatchTarget {
  width: number;
  height: number;
  fit: FitMode;
  bg: LetterboxColor;
}

export interface BatchDeps {
  loadImage: (src: string) => Promise<HTMLImageElement>;
  renderToDataUrl: (opts: RenderOptions) => string;
  saveImage: (dataUrl: string, filename: string) => Promise<string>;
  onItemStatus: (id: string, status: BatchStatus, detail?: string) => void;
}

/**
 * Resize a batch of images sequentially. Each item is processed in its own
 * try/catch so one failure does not abort the rest.
 *
 * `saveDir` is part of the signature for clarity, but is not used directly here:
 * the real `saveImage` in the calling component closes over the save directory.
 */
export async function runBatchResize(
  items: BatchItem[],
  target: BatchTarget,
  saveDir: string,
  deps: BatchDeps
): Promise<{ succeeded: number; failed: number }> {
  void saveDir;
  const taken = new Set<string>();
  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    deps.onItemStatus(item.id, "processing");
    try {
      const img = await deps.loadImage(item.assetUrl);
      const opts = buildRenderOptions(img, target.width, target.height, target.fit, target.bg);
      const dataUrl = deps.renderToDataUrl(opts);
      const filename = deriveFilename(item.sourcePath, target.width, target.height, taken);
      const savedPath = await deps.saveImage(dataUrl, filename);
      deps.onItemStatus(item.id, "done", savedPath);
      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.onItemStatus(item.id, "error", message);
      failed++;
    }
  }

  return { succeeded, failed };
}
