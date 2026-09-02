import { describe, it, expect } from "vitest";
import { clampCropRect, transformCropRect, MIN_CROP_SIZE, type CropRect } from "./crop-utils";

const IMG_W = 1000;
const IMG_H = 800;

// A crop inset from every edge, so each handle has room to move both ways.
const BASE: CropRect = { x: 100, y: 100, width: 400, height: 300 };

describe("transformCropRect — resize holds the opposite edge fixed", () => {
  it("stops the west handle at the left edge instead of widening the crop", () => {
    const next = transformCropRect(BASE, "w", -500, 0, IMG_W, IMG_H);
    expect(next.x).toBe(0);
    // Right edge is unchanged: 100 + 400.
    expect(next.x + next.width).toBe(500);
  });

  it("stops the north handle at the top edge instead of heightening the crop", () => {
    const next = transformCropRect(BASE, "n", 0, -500, IMG_W, IMG_H);
    expect(next.y).toBe(0);
    // Bottom edge is unchanged: 100 + 300.
    expect(next.y + next.height).toBe(400);
  });

  it("stops the north-west corner at both edges without moving the far corner", () => {
    const next = transformCropRect(BASE, "nw", -900, -900, IMG_W, IMG_H);
    expect(next).toEqual({ x: 0, y: 0, width: 500, height: 400 });
  });

  it("clamps the east and south edges to the image bounds", () => {
    const next = transformCropRect(BASE, "se", 5000, 5000, IMG_W, IMG_H);
    expect(next).toEqual({ x: 100, y: 100, width: IMG_W - 100, height: IMG_H - 100 });
  });

  it("keeps the untouched axis unchanged when resizing a single edge", () => {
    const next = transformCropRect(BASE, "e", 50, 999, IMG_W, IMG_H);
    expect(next.y).toBe(BASE.y);
    expect(next.height).toBe(BASE.height);
    expect(next.width).toBe(450);
  });
});

describe("transformCropRect — minimum size", () => {
  it("never lets the west handle cross the right edge", () => {
    const next = transformCropRect(BASE, "w", 5000, 0, IMG_W, IMG_H);
    expect(next.width).toBe(MIN_CROP_SIZE);
    expect(next.x + next.width).toBe(500);
  });

  it("never lets the south handle cross the top edge", () => {
    const next = transformCropRect(BASE, "s", 0, -5000, IMG_W, IMG_H);
    expect(next.height).toBe(MIN_CROP_SIZE);
    expect(next.y).toBe(BASE.y);
  });

  it("stays inside images smaller than the minimum crop size", () => {
    const tiny: CropRect = { x: 0, y: 0, width: 8, height: 6 };
    const next = transformCropRect(tiny, "nw", -100, -100, 8, 6);
    expect(next).toEqual({ x: 0, y: 0, width: 8, height: 6 });
    expect(next.x + next.width).toBeLessThanOrEqual(8);
    expect(next.y + next.height).toBeLessThanOrEqual(6);
  });
});

describe("clampCropRect", () => {
  it("keeps a rect inside an image smaller than the minimum crop size", () => {
    const next = clampCropRect({ x: -5, y: -5, width: 100, height: 100 }, 8, 6);
    expect(next).toEqual({ x: 0, y: 0, width: 8, height: 6 });
  });

  it("never lets a fractional origin push the far edge outside the image", () => {
    const next = clampCropRect({ x: 599.6, y: 499.6, width: 400.4, height: 300.4 }, IMG_W, IMG_H);
    expect(next.x + next.width).toBeLessThanOrEqual(IMG_W);
    expect(next.y + next.height).toBeLessThanOrEqual(IMG_H);
  });

  it("still enforces the minimum size on a normal image", () => {
    const next = clampCropRect({ x: 10, y: 10, width: 1, height: 1 }, IMG_W, IMG_H);
    expect(next.width).toBe(MIN_CROP_SIZE);
    expect(next.height).toBe(MIN_CROP_SIZE);
  });
});

describe("transformCropRect — move", () => {
  it("keeps the size fixed while translating", () => {
    const next = transformCropRect(BASE, "move", 60, -40, IMG_W, IMG_H);
    expect(next).toEqual({ x: 160, y: 60, width: 400, height: 300 });
  });

  it.each([
    ["left", -5000, 0, { x: 0, y: 100 }],
    ["top", 0, -5000, { x: 100, y: 0 }],
    ["right", 5000, 0, { x: IMG_W - 400, y: 100 }],
    ["bottom", 0, 5000, { x: 100, y: IMG_H - 300 }],
  ])("clamps the origin at the %s edge without resizing", (_edge, dx, dy, origin) => {
    const next = transformCropRect(BASE, "move", dx as number, dy as number, IMG_W, IMG_H);
    expect(next.width).toBe(BASE.width);
    expect(next.height).toBe(BASE.height);
    expect({ x: next.x, y: next.y }).toEqual(origin);
  });
});
