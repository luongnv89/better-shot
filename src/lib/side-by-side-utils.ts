/**
 * Side-by-side photo comparison layout utilities.
 *
 * Provides dimension calculation and per-image positioning for the
 * side-by-side frame mode where two photos share a single frame.
 */

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
