import { describe, it, expect, vi } from "vitest";
import { computeThumbnailDims, recordRawCapture, type ThumbnailResult } from "./capture-history";

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

// recordRawCapture is the capture-time recording seam. Its real thumbnail
// generation (generateThumbnailFromPath) needs a real canvas, so here every
// dependency is injected: a stub thumbnail, a fake addEntry, and a spy deleteFile.
describe("recordRawCapture", () => {
  const stubThumb: ThumbnailResult = {
    thumbnail: "data:image/png;base64,stub",
    width: 1920,
    height: 1080,
  };

  it("records a raw capture at capture time (no Save required)", async () => {
    const recorded: Array<{ savedPath: string; width: number; height: number }> = [];
    const addEntry = vi.fn((entry: { savedPath: string; width: number; height: number }) => {
      recorded.push(entry);
      return []; // nothing evicted
    });
    const deleteFile = vi.fn();

    await recordRawCapture({
      path: "/caps/shot-1.png",
      generateThumb: vi.fn().mockResolvedValue(stubThumb),
      addEntry,
      deleteFile,
    });

    expect(addEntry).toHaveBeenCalledTimes(1);
    expect(recorded[0].savedPath).toBe("/caps/shot-1.png");
    // width/height come straight from the thumbnail result (raw natural dims).
    expect(recorded[0].width).toBe(1920);
    expect(recorded[0].height).toBe(1080);
    // No eviction → no deletes.
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("deletes the file of every entry evicted past N", async () => {
    const evicted = [
      { id: "old1", thumbnail: "t", savedPath: "/caps/old1.png", width: 1, height: 1, createdAt: 1 },
      { id: "old2", thumbnail: "t", savedPath: "/caps/old2.png", width: 1, height: 1, createdAt: 2 },
    ];
    const addEntry = vi.fn().mockReturnValue(evicted);
    const deleteFile = vi.fn().mockResolvedValue(undefined);

    await recordRawCapture({
      path: "/caps/new.png",
      generateThumb: vi.fn().mockResolvedValue(stubThumb),
      addEntry,
      deleteFile,
    });

    // Each evicted entry's raw PNG is deleted from disk — not just dropped.
    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(deleteFile).toHaveBeenCalledWith("/caps/old1.png");
    expect(deleteFile).toHaveBeenCalledWith("/caps/old2.png");
  });

  it("swallows a delete failure without rejecting (a leaked file never breaks capture)", async () => {
    const evicted = [
      { id: "old", thumbnail: "t", savedPath: "/caps/old.png", width: 1, height: 1, createdAt: 1 },
    ];
    const addEntry = vi.fn().mockReturnValue(evicted);
    const deleteFile = vi.fn().mockRejectedValue(new Error("EACCES"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordRawCapture({
        path: "/caps/new.png",
        generateThumb: vi.fn().mockResolvedValue(stubThumb),
        addEntry,
        deleteFile,
      })
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
