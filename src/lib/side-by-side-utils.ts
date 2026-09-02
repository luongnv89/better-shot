/**
 * Side-by-side photo comparison layout utilities.
 *
 * Provides dimension calculation and per-image positioning for the
 * side-by-side frame mode where two photos share a single frame.
 */

import type { CaptureHistoryEntry } from "@/stores/captureHistoryStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum split ratio (left image gets at least 20% of width) */
const MIN_SPLIT_RATIO = 0.2;

/** Maximum split ratio (left image gets at most 80% of width) */
const MAX_SPLIT_RATIO = 0.8;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clamp a split ratio to the valid range.
 */
export function clampSplitRatio(ratio: number): number {
  return Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, ratio));
}

/**
 * Pick the capture history entry to auto-fill Image 2 with when the
 * side-by-side frame is selected.
 *
 * Entries are newest-first. If the current image is the newest capture, pair
 * it with the second-newest; otherwise (uploaded, external, or an older
 * capture) keep the user's current image as Image 1 and fill Image 2 with the
 * newest capture — Image 1 is never replaced as a side effect of choosing a
 * frame type. Returns undefined when there is no distinct capture to show
 * (empty history, or the only capture is already the current image).
 */
export function selectSideBySideSecondEntry(
  imagePath: string,
  entries: CaptureHistoryEntry[],
): CaptureHistoryEntry | undefined {
  if (entries.length === 0) return undefined;

  if (entries.length >= 2) {
    return imagePath === entries[0].savedPath ? entries[1] : entries[0];
  }
  return entries[0].savedPath !== imagePath ? entries[0] : undefined;
}
