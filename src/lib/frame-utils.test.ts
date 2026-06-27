import { describe, expect, it, vi } from "vitest";

import {
  drawSideBySideFrame,
  getContainFitRect,
  getMacbookFrameDimensions,
  getSideBySideFrameDimensions,
  type FrameDimensions,
} from "./frame-utils";

describe("frame-utils macbook sizing", () => {
  it("keeps the MacBook frame height stable for the same screenshot width", () => {
    const wideCapture = getMacbookFrameDimensions(1440, 810);
    const tallCapture = getMacbookFrameDimensions(1440, 1200);

    expect(wideCapture.totalWidth).toBe(tallCapture.totalWidth);
    expect(wideCapture.totalHeight).toBe(tallCapture.totalHeight);
    expect(wideCapture.screenWidth).toBe(tallCapture.screenWidth);
    expect(wideCapture.screenHeight).toBe(tallCapture.screenHeight);
    expect(wideCapture.screenHeight).toBe(900);
    expect(wideCapture.totalHeight).toBe(1026);
  });

  it("uses a fixed 16:10 laptop display area", () => {
    const dims = getMacbookFrameDimensions(1280, 720);

    expect(dims.screenWidth).toBe(1280);
    expect(dims.screenHeight).toBe(800);
  });
});

describe("frame-utils side-by-side sizing", () => {
  it("computes total width as sum of both images", () => {
    const dims = getSideBySideFrameDimensions(800, 600, 800, 600);

    expect(dims.totalWidth).toBe(1600);
    expect(dims.totalHeight).toBe(600);
    expect(dims.screenX).toBe(0);
    expect(dims.screenY).toBe(0);
  });

  it("uses the maximum height of both images", () => {
    const dims = getSideBySideFrameDimensions(800, 600, 800, 1000);

    expect(dims.totalHeight).toBe(1000);
    expect(dims.totalWidth).toBe(1600);
  });

  it("handles different image dimensions", () => {
    const dims = getSideBySideFrameDimensions(1920, 1080, 1280, 720);

    expect(dims.totalWidth).toBe(1920 + 1280);
    expect(dims.totalHeight).toBe(1080);
  });
});

describe("drawSideBySideFrame layout", () => {
  // Minimal 2D context stub that records drawImage calls.
  function makeCtx() {
    const drawImage = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      drawImage,
      fillStyle: "",
      shadowColor: "",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    } as unknown as CanvasRenderingContext2D;
    return { ctx, drawImage };
  }

  const img = (width: number, height: number) => ({ width, height }) as HTMLImageElement;

  const dims: FrameDimensions = {
    totalWidth: 2000,
    totalHeight: 1000,
    screenX: 0,
    screenY: 0,
    screenWidth: 2000,
    screenHeight: 1000,
  };

  it("contains (letterboxes) each photo so the whole image is visible", () => {
    const { ctx, drawImage } = makeCtx();
    // 1:1 photos in wide slots → contained, so drawn width === drawn height (no crop).
    drawSideBySideFrame(ctx, 0, 0, dims, img(500, 500), img(500, 500), { splitRatio: 0.5 });

    expect(drawImage).toHaveBeenCalledTimes(2);
    const [, , , leftW, leftH] = drawImage.mock.calls[0];
    expect(leftW).toBe(leftH); // square stays square (contain, not cover)
    // The square photo is limited by the slot width (slot is wider-than-tall
    // once the gap is removed), so it never exceeds the slot bounds.
    const gap = Math.round(dims.totalWidth * 0.04);
    const slotWidth = Math.round((dims.totalWidth - gap) * 0.5);
    expect(leftW).toBeLessThanOrEqual(slotWidth);
    expect(leftH).toBeLessThanOrEqual(dims.totalHeight);
  });

  it("leaves a gap so the shared background shows between the two photos", () => {
    const { ctx, drawImage } = makeCtx();
    drawSideBySideFrame(ctx, 0, 0, dims, img(1000, 1000), img(1000, 1000), { splitRatio: 0.5 });

    const [, leftX, , leftW] = drawImage.mock.calls[0];
    const [, rightX] = drawImage.mock.calls[1];
    // Right photo must start strictly after the left photo's right edge (gap > 0).
    expect(rightX).toBeGreaterThan(leftX + leftW);
  });

  it("draws a shadow pass under each photo when a shadow is provided", () => {
    const { ctx, drawImage } = makeCtx();
    const fill = ctx.fill as ReturnType<typeof vi.fn>;
    drawSideBySideFrame(ctx, 0, 0, dims, img(800, 600), img(800, 600), {
      splitRatio: 0.5,
      borderRadius: 16,
      shadow: { blur: 30, offsetX: 10, offsetY: 12, opacity: 40 },
    });

    expect(drawImage).toHaveBeenCalledTimes(2); // one image per photo
    expect(fill).toHaveBeenCalledTimes(2); // one shadow fill per photo
  });
});

describe("getContainFitRect", () => {
  it("letterboxes wider content inside the MacBook display", () => {
    const fitted = getContainFitRect(1600, 900, 0, 0, 1440, 900);

    expect(fitted.x).toBe(0);
    expect(fitted.y).toBeCloseTo(45);
    expect(fitted.width).toBe(1440);
    expect(fitted.height).toBeCloseTo(810);
  });

  it("pillarboxes taller content inside the MacBook display", () => {
    const fitted = getContainFitRect(900, 1600, 0, 0, 1440, 900);

    expect(fitted.x).toBeCloseTo(466.875);
    expect(fitted.y).toBe(0);
    expect(fitted.width).toBeCloseTo(506.25);
    expect(fitted.height).toBe(900);
  });
});
