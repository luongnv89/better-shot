import { Loader2 } from "lucide-react";
import type { ItemPreview } from "@/hooks/useBatchPreviews";

/** Fixed box the thumbnails live in, so rows stay aligned regardless of aspect. */
export const THUMB_BOX = 44;

/**
 * The resized-output thumbnail for one row. Shows the live render of the chosen
 * width×height/fit/background so the user can eyeball the result before export.
 * The image is letterboxed inside a fixed box at the target's aspect ratio, so
 * `cover` crops and `fit` padding read the same as the exported file. Falls back
 * to a spinner while rendering, a dash when no size is set, and "!" on error.
 *
 * `box` is the square edge length to render within (default {@link THUMB_BOX} for
 * the inline row). The slideshow reuses this component with a larger `box` to
 * show the same already-rendered preview URL at a bigger size — no new render.
 *
 * Lives in its own module (rather than inside BatchResize) so the slideshow can
 * import it without creating a BatchResize ↔ BatchSlideshow import cycle.
 */
export function ResizedPreview({
  preview,
  width,
  height,
  box = THUMB_BOX,
}: {
  preview: ItemPreview | undefined;
  width: number;
  height: number;
  box?: number;
}) {
  const hasTarget = width > 0 && height > 0;
  // Gate on hasTarget first: clearing the size after a render must fall back to
  // the placeholder immediately, never keep showing a now-stale "ready" preview
  // (the hook short-circuits on an invalid size without resetting per-item state).
  const status = !hasTarget ? "idle" : (preview?.status ?? "rendering");

  // Constrain to the target aspect ratio within the box so the preview's shape
  // matches the export (a tall iPhone size looks tall, a wide macOS size wide).
  let boxW = box;
  let boxH = box;
  if (hasTarget) {
    if (width >= height) {
      boxH = Math.max(1, Math.round((box * height) / width));
    } else {
      boxW = Math.max(1, Math.round((box * width) / height));
    }
  }

  return (
    <div
      className="bg-muted/40 flex shrink-0 items-center justify-center overflow-hidden rounded"
      style={{ width: box, height: box }}
      title={hasTarget ? `Resized to ${width}×${height}` : "Pick a size to preview the result"}
    >
      {status === "ready" && preview?.url ? (
        <img
          src={preview.url}
          alt="Resized preview"
          style={{ width: boxW, height: boxH, objectFit: "contain", display: "block" }}
        />
      ) : status === "rendering" ? (
        <Loader2 className="text-muted-foreground size-3.5 animate-spin" aria-label="Rendering preview" />
      ) : status === "error" ? (
        <span className="text-[oklch(0.65_0.2_25)] text-xs" title="Could not render preview">!</span>
      ) : (
        <span className="text-muted-foreground text-xs" aria-label="No size selected">–</span>
      )}
    </div>
  );
}
