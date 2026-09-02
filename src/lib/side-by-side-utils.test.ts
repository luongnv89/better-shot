import { describe, expect, it } from "vitest";

import type { CaptureHistoryEntry } from "@/stores/captureHistoryStore";

import { clampSplitRatio, selectSideBySideSecondEntry } from "./side-by-side-utils";

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

describe("selectSideBySideSecondEntry", () => {
  const entry = (id: string, savedPath: string): CaptureHistoryEntry => ({
    id,
    thumbnail: `thumb-${id}`,
    savedPath,
    width: 100,
    height: 100,
    createdAt: 0,
  });
  const newest = entry("newest", "/captures/a.png");
  const second = entry("second", "/captures/b.png");
  const third = entry("third", "/captures/c.png");

  it("pairs the newest capture with the second-newest when Image 1 is the newest", () => {
    expect(selectSideBySideSecondEntry("/captures/a.png", [newest, second])).toBe(second);
    expect(selectSideBySideSecondEntry("/captures/a.png", [newest, second, third])).toBe(second);
  });

  it("keeps Image 1 and fills with the newest when Image 1 is the second-newest", () => {
    expect(selectSideBySideSecondEntry("/captures/b.png", [newest, second])).toBe(newest);
  });

  it("fills with the newest for an uploaded/external image not in history", () => {
    expect(selectSideBySideSecondEntry("/uploads/external.png", [newest, second])).toBe(newest);
  });

  it("fills with the newest when Image 1 is an older capture", () => {
    expect(selectSideBySideSecondEntry("/captures/c.png", [newest, second, third])).toBe(newest);
  });

  it("fills with the single capture when it differs from Image 1", () => {
    expect(selectSideBySideSecondEntry("/uploads/external.png", [newest])).toBe(newest);
  });

  it("returns undefined when the only capture is already the current image", () => {
    expect(selectSideBySideSecondEntry("/captures/a.png", [newest])).toBeUndefined();
  });

  it("returns undefined for an empty history", () => {
    expect(selectSideBySideSecondEntry("/captures/a.png", [])).toBeUndefined();
  });
});
