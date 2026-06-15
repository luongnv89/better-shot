import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ResizedPreview } from "@/components/batch/ResizedPreview";
import type { BatchItem } from "@/lib/batch-resize";
import type { PreviewMap } from "@/hooks/useBatchPreviews";

/** Larger square edge the slide's original/resized previews render within. */
const SLIDE_BOX = 320;

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

interface BatchSlideshowProps {
  /** Live batch items — read on every render, never copied into state. */
  items: BatchItem[];
  /** Live resized-preview map (already-rendered URLs) keyed by item id. */
  previews: PreviewMap;
  /** Live target width/height; passed straight through to {@link ResizedPreview}. */
  width: number;
  height: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which slide to open on; navigation takes over from there. */
  initialIndex?: number;
}

/**
 * A larger-than-thumbnail slideshow over the batch. Shows one image at a time —
 * original and resized side by side — with prev/next navigation.
 *
 * Live-props, no-snapshot: items/previews/width/height come straight from the
 * owner (BatchResize) on every render. Only `currentIndex` is local state, so
 * the slide content stays in sync as images are added/removed or the resize
 * settings change while the overlay is open (AC4). The resized side reuses the
 * existing `previews[id]` URLs via {@link ResizedPreview} — it creates no new
 * object URLs and triggers no new rendering.
 */
export function BatchSlideshow({
  items,
  previews,
  width,
  height,
  open,
  onOpenChange,
  initialIndex = 0,
}: BatchSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Seed the slide from initialIndex each time the overlay opens, clamped to the
  // current range. Done on open (not every render) so navigation isn't reset.
  useEffect(() => {
    if (open) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1)));
    }
    // items.length is intentionally read at open time only; live clamping below
    // handles the list changing while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialIndex]);

  // Index clamp (crash guard): items can shrink while open (a row was removed),
  // leaving currentIndex past the end. Recompute a safe index every render and
  // never dereference items[out-of-range].
  const safeIndex = items.length === 0 ? 0 : Math.min(currentIndex, items.length - 1);
  const item: BatchItem | undefined = items[safeIndex];

  // If the batch empties out while open, close instead of rendering an empty
  // slide. Done in an effect so we don't call setState during render.
  useEffect(() => {
    if (open && items.length === 0) {
      onOpenChange(false);
    }
  }, [open, items.length, onOpenChange]);

  // Arrow-key navigation while open, mirroring ImageEditor's keydown pattern:
  // ignore keystrokes aimed at form fields; Escape close is handled by Radix.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(items.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, items.length]);

  const goPrev = () => setCurrentIndex(() => Math.max(0, safeIndex - 1));
  const goNext = () => setCurrentIndex(() => Math.min(items.length - 1, safeIndex + 1));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {/* Required for a11y (Radix warns without them); not visually needed. */}
        <DialogTitle className="sr-only">Batch preview slideshow</DialogTitle>
        <DialogDescription className="sr-only">
          Preview each batch image at a larger size, with its original and resized result side by side.
        </DialogDescription>

        {item && (
          <div className="space-y-4">
            <div className="space-y-1 pr-8">
              <div className="truncate text-sm font-medium" title={item.sourcePath}>
                {basename(item.sourcePath)}
              </div>
              <div className="text-muted-foreground text-xs">
                {safeIndex + 1} / {items.length}
              </div>
            </div>

            {/* Original → resized, mirroring the row's left-to-right layout but
                at a much larger size (AC1). Both shown per slide (AC3). */}
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-1.5">
                <img
                  src={item.assetUrl}
                  alt="Original"
                  title={`Original ${item.originalWidth}×${item.originalHeight}`}
                  className="bg-muted/40 rounded"
                  style={{ width: SLIDE_BOX, height: SLIDE_BOX, objectFit: "contain", display: "block" }}
                />
                <span className="text-muted-foreground text-[10px] tracking-wide uppercase">Original</span>
              </div>
              <ArrowRight className="text-muted-foreground size-5 shrink-0" aria-label="resized to" />
              <div className="flex flex-col items-center gap-1.5">
                <ResizedPreview preview={previews[item.id]} width={width} height={height} box={SLIDE_BOX} />
                <span className="text-muted-foreground text-[10px] tracking-wide uppercase">Resized</span>
              </div>
            </div>

            {/* Navigation (AC2). Disabled at the ends; also driven by arrow keys. */}
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={goPrev}
                disabled={safeIndex === 0}
                aria-label="Previous image"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={goNext}
                disabled={safeIndex >= items.length - 1}
                aria-label="Next image"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
