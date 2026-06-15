import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useBatchPreviews,
  PREVIEW_DEBOUNCE_MS,
  type PreviewDeps,
} from "./useBatchPreviews";
import type { BatchItem, BatchTarget } from "@/lib/batch-resize";

function makeItem(id: string): BatchItem {
  return {
    id,
    sourcePath: `/src/${id}.png`,
    workspacePath: `/tmp/${id}.png`,
    assetUrl: `asset://${id}`,
    originalWidth: 100,
    originalHeight: 100,
  };
}

const TARGET: BatchTarget = { width: 1280, height: 800, fit: "fit", bg: "transparent" };

/**
 * Build mock deps where `renderToUrl` returns a deterministic, unique URL per
 * (id, call-count) so tests can assert exactly which URLs were produced and
 * revoked — a real canvas backend doesn't exist under jsdom.
 */
function makeDeps(overrides: Partial<PreviewDeps> = {}) {
  const calls: Record<string, number> = {};
  const revoked: string[] = [];
  const deps: PreviewDeps = {
    loadImage: vi.fn(async () => ({}) as HTMLImageElement),
    renderToUrl: vi.fn(async (item: BatchItem) => {
      calls[item.id] = (calls[item.id] ?? 0) + 1;
      return `blob://${item.id}#${calls[item.id]}`;
    }),
    revokeUrl: vi.fn((url: string) => {
      revoked.push(url);
    }),
    ...overrides,
  };
  return { deps, revoked };
}

/** Advance past the debounce and flush the render promises it kicks off. */
async function flushDebounce(extra = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS + extra);
  });
}

describe("useBatchPreviews", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an empty map and renders nothing when there are no items", () => {
    const { deps } = makeDeps();
    const { result } = renderHook(() => useBatchPreviews([], TARGET, deps));
    expect(result.current).toEqual({});
    expect(deps.renderToUrl).not.toHaveBeenCalled();
  });

  it("does not render when the target width/height is zero", async () => {
    const { deps } = makeDeps();
    renderHook(() =>
      useBatchPreviews([makeItem("a")], { ...TARGET, width: 0, height: 0 }, deps)
    );
    await flushDebounce(10);
    expect(deps.renderToUrl).not.toHaveBeenCalled();
  });

  it("generates a ready preview URL per item after the debounce", async () => {
    const { deps } = makeDeps();
    const { result } = renderHook(() =>
      useBatchPreviews([makeItem("a"), makeItem("b")], TARGET, deps)
    );

    // Before the debounce elapses, nothing has rendered yet.
    expect(deps.renderToUrl).not.toHaveBeenCalled();

    await flushDebounce();

    expect(result.current["a"]?.status).toBe("ready");
    expect(result.current["b"]?.status).toBe("ready");
    expect(result.current["a"]?.url).toBe("blob://a#1");
    expect(result.current["b"]?.url).toBe("blob://b#1");
    expect(deps.renderToUrl).toHaveBeenCalledTimes(2);
  });

  it("regenerates and revokes the old URL when the target changes", async () => {
    const { deps, revoked } = makeDeps();
    const items = [makeItem("a")];
    const { result, rerender } = renderHook(
      ({ target }: { target: BatchTarget }) => useBatchPreviews(items, target, deps),
      { initialProps: { target: TARGET } }
    );

    await flushDebounce();
    expect(result.current["a"]?.url).toBe("blob://a#1");

    // Change the fit mode → a fresh render, and the first URL must be revoked.
    rerender({ target: { ...TARGET, fit: "cover" } });
    await flushDebounce();

    expect(result.current["a"]?.url).toBe("blob://a#2");
    expect(revoked).toContain("blob://a#1");
    expect(deps.renderToUrl).toHaveBeenCalledTimes(2);
  });

  it("revokes an item's URL and drops it from the map when removed", async () => {
    const { deps, revoked } = makeDeps();
    const { result, rerender } = renderHook(
      ({ items }: { items: BatchItem[] }) => useBatchPreviews(items, TARGET, deps),
      { initialProps: { items: [makeItem("a"), makeItem("b")] } }
    );

    await flushDebounce();
    expect(result.current["a"]?.url).toBe("blob://a#1");
    expect(result.current["b"]?.url).toBe("blob://b#1");

    // Remove item "a".
    rerender({ items: [makeItem("b")] });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current["a"]).toBeUndefined();
    expect(result.current["b"]?.url).toBe("blob://b#1");
    expect(revoked).toContain("blob://a#1");
  });

  it("revokes every outstanding URL on unmount", async () => {
    const { deps, revoked } = makeDeps();
    const { result, unmount } = renderHook(() =>
      useBatchPreviews([makeItem("a"), makeItem("b")], TARGET, deps)
    );

    await flushDebounce();
    expect(result.current["a"]?.url).toBe("blob://a#1");
    expect(result.current["b"]?.url).toBe("blob://b#1");

    unmount();
    expect(revoked).toEqual(expect.arrayContaining(["blob://a#1", "blob://b#1"]));
  });

  it("does not leak or paint a stale URL when the target changes mid-render (latest wins)", async () => {
    // First render resolves slowly; the second resolves fast. The slow (stale)
    // result must be revoked, not written over the fresh one. This is the AC3
    // "previews update correctly when settings change" race.
    let resolveFirst!: () => void;
    const renderToUrl = vi
      .fn<PreviewDeps["renderToUrl"]>()
      // First call (target v1) — controlled, resolves last.
      .mockImplementationOnce(
        () => new Promise<string>((res) => { resolveFirst = () => res("blob://a#stale"); })
      )
      // Second call (target v2) — resolves immediately.
      .mockImplementationOnce(async () => "blob://a#fresh");

    const { deps, revoked } = makeDeps({ renderToUrl });
    const items = [makeItem("a")];
    const { result, rerender } = renderHook(
      ({ target }: { target: BatchTarget }) => useBatchPreviews(items, target, deps),
      { initialProps: { target: TARGET } }
    );

    // Kick off the first (slow) render.
    await flushDebounce();
    expect(renderToUrl).toHaveBeenCalledTimes(1);

    // Change settings while the first render is still in flight → supersede it.
    rerender({ target: { ...TARGET, width: 640, height: 480 } });
    await flushDebounce();
    expect(result.current["a"]?.url).toBe("blob://a#fresh");

    // Now let the stale first render finally resolve.
    await act(async () => {
      resolveFirst();
      await Promise.resolve();
    });

    // The fresh URL is still shown; the stale one was revoked, not painted.
    expect(result.current["a"]?.url).toBe("blob://a#fresh");
    expect(revoked).toContain("blob://a#stale");
    expect(revoked).not.toContain("blob://a#fresh");
  });

  it("marks an item as error when rendering rejects, without throwing", async () => {
    const renderToUrl = vi
      .fn<PreviewDeps["renderToUrl"]>()
      .mockRejectedValue(new Error("boom"));
    const { deps } = makeDeps({ renderToUrl });
    const { result } = renderHook(() =>
      useBatchPreviews([makeItem("a")], TARGET, deps)
    );

    await flushDebounce();
    expect(result.current["a"]?.status).toBe("error");
  });
});
