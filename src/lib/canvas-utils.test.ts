import { describe, it, expect } from "vitest";
import {
  calculateScaledImageDimensions,
  calculateOffsetLimits,
} from "./canvas-utils";

describe("calculateScaledImageDimensions", () => {
  it("returns centered original for none mode", () => {
    const r = calculateScaledImageDimensions(800, 600, 1000, 1000, "none");
    expect(r.width).toBe(800);
    expect(r.height).toBe(600);
    expect(r.x).toBe(100);
    expect(r.y).toBe(200);
  });

  it("fit: scales wider image to width", () => {
    const r = calculateScaledImageDimensions(2000, 1000, 1000, 1000, "fit");
    expect(r.width).toBe(1000);
    expect(r.height).toBe(500);
    expect(r.x).toBe(0);
    expect(r.y).toBe(250);
  });

  it("fit: scales taller image to height", () => {
    const r = calculateScaledImageDimensions(1000, 2000, 1000, 1000, "fit");
    expect(r.height).toBe(1000);
    expect(r.width).toBe(500);
  });

  it("fit-with-border: same as fit but preserves borderSize", () => {
    const r = calculateScaledImageDimensions(2000, 1000, 1000, 1000, "fit-with-border", 8);
    expect(r.borderSize).toBe(8);
    expect(r.width).toBe(1000);
  });

  it("cover: scales to fill width and crops height", () => {
    const r = calculateScaledImageDimensions(1000, 2000, 1000, 1000, "cover");
    expect(r.width).toBe(1000);
    expect(r.height).toBe(2000);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("cover: scales taller image to height when wider", () => {
    const r = calculateScaledImageDimensions(2000, 1000, 1000, 1000, "cover");
    expect(r.height).toBe(1000);
    expect(r.width).toBe(2000);
    expect(r.y).toBe(0);
  });

  it("contain: does not upscale small image", () => {
    const r = calculateScaledImageDimensions(400, 300, 1000, 1000, "contain");
    expect(r.width).toBe(400);
    expect(r.height).toBe(300);
    expect(r.x).toBe(300);
    expect(r.y).toBe(350);
  });

  it("contain: scales down large image", () => {
    const r = calculateScaledImageDimensions(2000, 2000, 1000, 1000, "contain");
    expect(r.width).toBe(1000);
    expect(r.height).toBe(1000);
  });

  it("applies imageOffset correctly for fit mode", () => {
    const r = calculateScaledImageDimensions(1000, 1000, 1000, 1000, "fit", 0, { x: 10, y: 20 });
    expect(r.x).toBe(10);
    expect(r.y).toBe(20);
  });

  it("applies imageOffset for cover mode (top aligned)", () => {
    const r = calculateScaledImageDimensions(2000, 1000, 1000, 1000, "cover", 0, { x: 5, y: 7 });
    expect(r.x).toBe(-500 + 5);
    expect(r.y).toBe(7);
  });

  it("handles square image and background", () => {
    const r = calculateScaledImageDimensions(500, 500, 500, 500, "fit");
    expect(r.width).toBe(500);
    expect(r.height).toBe(500);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });
});

describe("calculateOffsetLimits", () => {
  it("returns zero when image smaller than bg", () => {
    const l = calculateOffsetLimits(400, 300, 1000, 1000);
    expect(l).toEqual({ maxOffsetX: 0, minOffsetX: -0, maxOffsetY: 0, minOffsetY: -0 });
  });

  it("returns correct limits when image larger", () => {
    const l = calculateOffsetLimits(2000, 1000, 1000, 1000);
    expect(l.maxOffsetX).toBe(500);
    expect(l.minOffsetX).toBe(-500);
    expect(l.maxOffsetY).toBe(0);
    expect(l.minOffsetY).toBe(-0);
  });

  it("handles both dimensions larger", () => {
    const l = calculateOffsetLimits(2000, 2000, 1000, 1000);
    expect(l.maxOffsetX).toBe(500);
    expect(l.maxOffsetY).toBe(500);
  });

  it("handles exact fit", () => {
    const l = calculateOffsetLimits(1000, 1000, 1000, 1000);
    expect(l.maxOffsetX).toBe(0);
    expect(l.maxOffsetY).toBe(0);
  });
});
