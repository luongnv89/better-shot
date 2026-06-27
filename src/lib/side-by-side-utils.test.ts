import { describe, expect, it } from "vitest";

import { clampSplitRatio } from "./side-by-side-utils";

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
