/**
 * Side-by-side photo comparison layout utilities.
 *
 * Provides dimension calculation and per-image positioning for the
 * side-by-side frame mode where two photos share a single frame.
 */

import type { FrameDimensions, FittedRect } from "./frame-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default split ratio: left image takes 50% of the frame width */
const DEFAULT_SPLIT_RATIO = 0.5;

/** Minimum split ratio (left image gets at least 20% of width) */
const MIN_SPLIT_RATIO = 0.2;

/** Maximum split ratio (left image gets at most 80% of width) */
const MAX_SPLIT_RATIO = 0.8;

/** Gap between the two images in pixels */
const IMAGE_GAP = 8;

/** Inner padding around each image within its half */
const IMAGE_PADDING = 12;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SideBySideSplit {
  /** Ratio of total width allocated to the left image (0..1) */
  ratio: number;
}

export interface SideBySideImagePosition {
  /** X position within the frame */
  x: number;
  /** Y position within the frame */
  y: number;
  /** Width of the allocated slot */
  slotWidth: number;
  /** Height of the allocated slot */
  slotHeight: number;
}

export interface SideBySideLayout {
  /** Per-image computed positions and dimensions */
  left: SideBySideImagePosition;
  right: SideBySideImagePosition;
  /** Current split ratio */
  splitRatio: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a split ratio to the valid range.
 */
export function clampSplitRatio(ratio: number): number {
  return Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, ratio));
}

/**
 * Calculate the fitted rectangle for an image within a slot,
 * using object-cover semantics (fill slot, maintain aspect ratio, crop excess).
 */
function calculateCoverFitRect(
  imageWidth: number,
  imageHeight: number,
  slotX: number,
  slotY: number,
  slotWidth: number,
  slotHeight: number
): FittedRect {
  const scale = Math.max(slotWidth / imageWidth, slotHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    x: slotX + (slotWidth - width) / 2,
    y: slotY + (slotHeight - height) / 2,
    width,
    height,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get frame dimensions for the side-by-side mode.
 * The total frame is a single rectangle that contains both images side by side.
 */
export function getSideBySideFrameDimensions(
  leftWidth: number,
  leftHeight: number,
  rightWidth: number,
  rightHeight: number
): FrameDimensions {
  // Determine the maximum height of the two images
  const maxHeight = Math.max(leftHeight, rightHeight);

  // Total width = left image width + right image width + gap
  const totalWidth = leftWidth + rightWidth + IMAGE_GAP;
  const totalHeight = maxHeight;

  // Content area spans the full frame
  return {
    totalWidth,
    totalHeight,
    screenX: 0,
    screenY: 0,
    screenWidth: totalWidth,
    screenHeight: totalHeight,
  };
}

/**
 * Calculate the layout for both images given their dimensions and a split ratio.
 */
export function calculateSideBySideLayout(
  leftWidth: number,
  leftHeight: number,
  rightWidth: number,
  rightHeight: number,
  splitRatio: number = DEFAULT_SPLIT_RATIO
): SideBySideLayout {
  const ratio = clampSplitRatio(splitRatio);

  // Calculate proportional widths based on ratio
  const totalContentWidth = leftWidth + rightWidth;
  const leftSlotWidth = Math.round(totalContentWidth * ratio);
  const rightSlotWidth = totalContentWidth - leftSlotWidth;

  // Account for gap: reduce each slot by half the gap
  const leftInnerWidth = leftSlotWidth - IMAGE_PADDING * 2 - Math.round(IMAGE_GAP / 2);
  const rightInnerWidth = rightSlotWidth - IMAGE_PADDING * 2 - Math.round(IMAGE_GAP / 2);

  // Use the taller image's height as the common slot height
  const maxHeight = Math.max(leftHeight, rightHeight);
  const slotHeight = maxHeight - IMAGE_PADDING * 2;

  // Calculate X positions
  const leftX = IMAGE_PADDING + Math.round(IMAGE_GAP / 2);
  const rightX = leftX + leftInnerWidth + IMAGE_GAP + Math.round(IMAGE_GAP / 2);

  return {
    left: {
      x: leftX,
      y: IMAGE_PADDING,
      slotWidth: leftInnerWidth,
      slotHeight,
    },
    right: {
      x: rightX,
      y: IMAGE_PADDING,
      slotWidth: rightInnerWidth,
      slotHeight,
    },
    splitRatio: ratio,
  };
}

/**
 * Calculate the fitted drawing rectangle for an image within its slot
 * using object-cover semantics.
 */
export function calculateImageDrawRect(
  imageWidth: number,
  imageHeight: number,
  slotX: number,
  slotY: number,
  slotWidth: number,
  slotHeight: number
): FittedRect {
  return calculateCoverFitRect(imageWidth, imageHeight, slotX, slotY, slotWidth, slotHeight);
}
