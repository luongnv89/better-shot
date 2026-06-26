import { describe, expect, it } from "vitest";

import {
  clampSplitRatio,
  calculateSideBySideLayout,
  calculateImageDrawRect,
} from "./side-by-side-utils";

describe("clampSplitRatio", () => {
  it("returns the ratio when within valid range", () => {
    expect(clampSplitRatio(0.5)).toBe(0.5);
    expect(clampSplitRatio(0.3)).toBe(0.3);
    expect(clampSplitRatio(0.7)).toBe(0.7);
  });

  it("clamps values below minimum to 0.2", () => {
    expect(clampSplitRatio(0.0)).toBe(0.2);
    expect(clampSplitRatio(0.1)).toBe(0.2);
    expect(clampSplitRatio(-0.5)).toBe(0.2);
  });

  it("clamps values above maximum to 0.8", () => {
    expect(clampSplitRatio(1.0)).toBe(0.8);
    expect(clampSplitRatio(0.9)).toBe(0.8);
    expect(clampSplitRatio(2.0)).toBe(0.8);
  });
});

describe("calculateSideBySideLayout", () => {
  it("splits equally by default", () => {
    const layout = calculateSideBySideLayout(800, 600, 800, 600);

    expect(layout.splitRatio).toBe(0.5);
    // Both images should have roughly equal slot widths
    expect(layout.left.slotWidth).toBe(layout.right.slotWidth);
  });

  it("respects the provided split ratio", () => {
    const layout = calculateSideBySideLayout(800, 600, 800, 600, 0.7);

    expect(layout.splitRatio).toBe(0.7);
    // Left slot should be larger than right slot
    expect(layout.left.slotWidth).toBeGreaterThan(layout.right.slotWidth);
  });

  it("clamps extreme split ratios", () => {
    const layout = calculateSideBySideLayout(800, 600, 800, 600, 0.0);
    expect(layout.splitRatio).toBe(0.2);

    const layout2 = calculateSideBySideLayout(800, 600, 800, 600, 1.0);
    expect(layout2.splitRatio).toBe(0.8);
  });

  it("accounts for gap and padding in slot dimensions", () => {
    const layout = calculateSideBySideLayout(800, 600, 800, 600);

    // Slot heights should be reduced by padding (12px top + 12px bottom)
    expect(layout.left.slotHeight).toBe(600 - 24);
    expect(layout.right.slotHeight).toBe(600 - 24);

    // Both slots should start at the same Y position
    expect(layout.left.y).toBe(layout.right.y);
  });

  it("positions left image to the left of right image", () => {
    const layout = calculateSideBySideLayout(800, 600, 800, 600);

    expect(layout.left.x).toBeLessThan(layout.right.x);
  });

  it("handles different image heights by using max height", () => {
    const layout = calculateSideBySideLayout(800, 600, 800, 1000);

    // Both slots should use the max height (1000) minus padding
    expect(layout.left.slotHeight).toBe(1000 - 24);
    expect(layout.right.slotHeight).toBe(1000 - 24);
  });
});

describe("calculateImageDrawRect", () => {
  it("returns a fitted rect that covers the slot using object-cover", () => {
    const rect = calculateImageDrawRect(1920, 1080, 0, 0, 400, 300);

    // Object-cover: at least one dimension matches or exceeds the slot
    // Image 1920x1080, slot 400x300 -> scale = max(400/1920, 300/1080) = 0.2778
    // scaledWidth = 533.33, scaledHeight = 300
    expect(rect.height).toBe(300);
    expect(rect.width).toBeCloseTo(533.33, 0);
  });

  it("centers the image within the slot", () => {
    const rect = calculateImageDrawRect(1920, 1080, 50, 50, 400, 300);

    // The image is centered: x offset from slot start equals (slotWidth - drawWidth) / 2
    const expectedX = 50 + (400 - rect.width) / 2;
    const expectedY = 50 + (300 - rect.height) / 2;
    expect(rect.x).toBeCloseTo(expectedX, 0);
    expect(rect.y).toBeCloseTo(expectedY, 0);
  });

  it("handles landscape image in portrait slot", () => {
    const rect = calculateImageDrawRect(1920, 1080, 0, 0, 200, 400);

    // Image is wider (aspect 1.78) than slot (aspect 0.5)
    // Fit to height: scaledHeight = 400, scaledWidth = 400 * 1.78 = 711.11
    expect(rect.height).toBe(400);
    expect(rect.width).toBeCloseTo(711.11, 0);
  });

  it("handles portrait image in landscape slot", () => {
    const rect = calculateImageDrawRect(800, 1200, 0, 0, 400, 200);

    // Image is taller (aspect 0.667) than slot (aspect 2.0)
    // Fit to width: scaledWidth = 400, scaledHeight = 400 / 0.667 = 600
    expect(rect.width).toBe(400);
    expect(rect.height).toBe(600);
  });
});
