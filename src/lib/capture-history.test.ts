import { describe, it, expect } from "vitest";
import { computeThumbnailDims } from "./capture-history";

// Only the pure scaling math is unit-tested here. generateThumbnail depends on
// real canvas drawImage/toDataURL, which jsdom does not implement meaningfully,
// so it is exercised only in the browser.
describe("computeThumbnailDims", () => {
  it("scales a landscape image so the longest edge equals maxEdge", () => {
    const dims = computeThumbnailDims(1920, 1080, 320);
    expect(dims.width).toBe(320);
    expect(dims.height).toBe(180); // 1080 * (320/1920)
  });

  it("scales a portrait image so the longest edge (height) equals maxEdge", () => {
    const dims = computeThumbnailDims(1080, 1920, 320);
    expect(dims.height).toBe(320);
    expect(dims.width).toBe(180);
  });

  it("never upscales an image already within the box", () => {
    const dims = computeThumbnailDims(100, 80, 320);
    expect(dims.width).toBe(100);
    expect(dims.height).toBe(80);
  });

  it("keeps a square image square", () => {
    const dims = computeThumbnailDims(1000, 1000, 320);
    expect(dims.width).toBe(320);
    expect(dims.height).toBe(320);
  });

  it("preserves aspect ratio for extreme ratios and clamps each side to >= 1", () => {
    const dims = computeThumbnailDims(3200, 10, 320);
    expect(dims.width).toBe(320);
    // 10 * (320/3200) = 1 → clamped to at least 1.
    expect(dims.height).toBe(1);
  });

  it("returns zero dims for a degenerate (zero-area) source", () => {
    expect(computeThumbnailDims(0, 0, 320)).toEqual({ width: 0, height: 0 });
  });
});
