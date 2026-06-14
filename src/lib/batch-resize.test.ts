import { describe, it, expect } from "vitest";
import {
  deriveFilename,
  buildRenderOptions,
  runBatchResize,
  type BatchItem,
  type BatchDeps,
  type BatchStatus,
} from "./batch-resize";
import { ALL_SIZE_PRESETS } from "./size-presets";

describe("deriveFilename", () => {
  it("strips path and extension and appends dimensions", () => {
    const taken = new Set<string>();
    expect(deriveFilename("/a/b/screenshot.png", 1280, 800, taken)).toBe("screenshot-1280x800.png");
  });

  it("handles uppercase extensions", () => {
    const taken = new Set<string>();
    expect(deriveFilename("/a/b/screenshot.PNG", 1280, 800, taken)).toBe("screenshot-1280x800.png");
  });

  it("handles .jpeg extensions", () => {
    const taken = new Set<string>();
    expect(deriveFilename("/a/b/shot.jpeg", 1280, 800, taken)).toBe("shot-1280x800.png");
  });

  it("disambiguates collisions via a shared taken set", () => {
    const taken = new Set<string>();
    expect(deriveFilename("/a/b/screenshot.png", 1280, 800, taken)).toBe("screenshot-1280x800.png");
    expect(deriveFilename("/c/d/screenshot.png", 1280, 800, taken)).toBe("screenshot-1280x800-2.png");
    expect(deriveFilename("/e/f/screenshot.png", 1280, 800, taken)).toBe("screenshot-1280x800-3.png");
  });

  it("handles backslash separators", () => {
    const taken = new Set<string>();
    expect(deriveFilename("C:\\Users\\me\\photo.webp", 640, 480, taken)).toBe("photo-640x480.png");
  });
});

describe("size presets integrity", () => {
  it("has 8 entries", () => {
    expect(ALL_SIZE_PRESETS.length).toBe(8);
  });

  it("every entry has positive width and height", () => {
    for (const p of ALL_SIZE_PRESETS) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
  });

  it("has unique labels", () => {
    const labels = ALL_SIZE_PRESETS.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("buildRenderOptions", () => {
  const img = {} as HTMLImageElement;

  it("zeroes padding-escape and scaling fields for exact output", () => {
    const opts = buildRenderOptions(img, 1280, 800, "fit", "transparent");
    expect(opts.padding).toBe(1);
    expect(opts.scale).toBe(1);
    expect(opts.shadow).toEqual({ blur: 0, offsetX: 0, offsetY: 0, opacity: 0 });
    expect(opts.canvasDimensions).toEqual({ width: 1280, height: 800 });
  });

  it("maps fit mode to imageScalingMode", () => {
    expect(buildRenderOptions(img, 100, 100, "fit", "white").imageScalingMode).toBe("fit");
    expect(buildRenderOptions(img, 100, 100, "cover", "white").imageScalingMode).toBe("cover");
  });

  it("passes through the background color", () => {
    expect(buildRenderOptions(img, 100, 100, "fit", "transparent").backgroundType).toBe("transparent");
    expect(buildRenderOptions(img, 100, 100, "fit", "white").backgroundType).toBe("white");
    expect(buildRenderOptions(img, 100, 100, "fit", "black").backgroundType).toBe("black");
  });
});

describe("runBatchResize error isolation", () => {
  it("continues past a failing item and reports per-item status", async () => {
    const items: BatchItem[] = [
      { id: "a", sourcePath: "/x/one.png", workspacePath: "/tmp/one.png", assetUrl: "asset://one", originalWidth: 10, originalHeight: 10 },
      { id: "b", sourcePath: "/x/two.png", workspacePath: "/tmp/two.png", assetUrl: "asset://two", originalWidth: 10, originalHeight: 10 },
      { id: "c", sourcePath: "/x/three.png", workspacePath: "/tmp/three.png", assetUrl: "asset://three", originalWidth: 10, originalHeight: 10 },
    ];

    const statuses: Array<{ id: string; status: BatchStatus; detail?: string }> = [];

    const deps: BatchDeps = {
      loadImage: async () => ({} as HTMLImageElement),
      renderToDataUrl: () => "data:image/png;base64,xxx",
      saveImage: async (_dataUrl, filename) => {
        // Fail only for the second item.
        if (filename.startsWith("two")) {
          throw new Error("disk full");
        }
        return `/out/${filename}`;
      },
      onItemStatus: (id, status, detail) => {
        statuses.push({ id, status, detail });
      },
    };

    const result = await runBatchResize(
      items,
      { width: 1280, height: 800, fit: "fit", bg: "transparent" },
      "/out",
      deps
    );

    expect(result).toEqual({ succeeded: 2, failed: 1 });

    const byId = (id: string) => statuses.filter((s) => s.id === id).map((s) => s.status);
    expect(byId("a")).toEqual(["processing", "done"]);
    expect(byId("b")).toEqual(["processing", "error"]);
    expect(byId("c")).toEqual(["processing", "done"]);

    // Every item reaches a terminal status after processing.
    for (const id of ["a", "b", "c"]) {
      const seq = byId(id);
      expect(seq[0]).toBe("processing");
      expect(["done", "error"]).toContain(seq[seq.length - 1]);
    }
  });
});
