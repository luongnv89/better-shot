import { describe, it, expect, beforeEach, vi } from "vitest";
import { act } from "@testing-library/react";
import { Store } from "@tauri-apps/plugin-store";
import {
  useCaptureHistoryStore,
  captureHistoryActions,
  clampMaxCaptures,
  DEFAULT_MAX_CAPTURES,
  MIN_MAX_CAPTURES,
  MAX_MAX_CAPTURES,
  type CaptureHistoryEntry,
} from "./captureHistoryStore";

// Build a CaptureHistoryEntry directly with a stub thumbnail. Store tests must
// NOT call generateThumbnail: jsdom has no real canvas, and the store's
// concern is record/cap/hydrate, not pixel work. savedPath now points at a raw
// capture under the (mocked) app-data captures dir.
function makeEntry(overrides: Partial<CaptureHistoryEntry> = {}): CaptureHistoryEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    thumbnail: overrides.thumbnail ?? "data:image/png;base64,stub",
    savedPath: overrides.savedPath ?? "/caps/bettershot.png",
    width: overrides.width ?? 1920,
    height: overrides.height ?? 1080,
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

describe("captureHistoryStore", () => {
  beforeEach(() => {
    // Reset store to initial state (also flips _isInitialized back to false so
    // initialize() will actually run in the hydrate test, and restores the
    // default cap).
    act(() => {
      captureHistoryActions.reset();
    });
    // Re-establish a clean default Store.load implementation each test. mockReset
    // also drops any leftover one-shot (mockResolvedValueOnce) queue from a prior
    // test, so tests are order-independent — a queued-but-unconsumed `once`
    // (e.g. when an _isInitialized guard short-circuits) can never leak forward.
    vi.mocked(Store.load).mockReset();
    vi.mocked(Store.load).mockResolvedValue({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as Awaited<ReturnType<typeof Store.load>>);
  });

  describe("initial state", () => {
    it("starts with an empty entries list", () => {
      expect(useCaptureHistoryStore.getState().entries).toEqual([]);
    });

    it("is not initialized by default", () => {
      expect(useCaptureHistoryStore.getState()._isInitialized).toBe(false);
    });

    it("defaults maxEntries to DEFAULT_MAX_CAPTURES", () => {
      expect(useCaptureHistoryStore.getState().maxEntries).toBe(DEFAULT_MAX_CAPTURES);
    });
  });

  describe("clampMaxCaptures", () => {
    it("clamps below the minimum up to MIN_MAX_CAPTURES", () => {
      expect(clampMaxCaptures(0)).toBe(MIN_MAX_CAPTURES);
      expect(clampMaxCaptures(-5)).toBe(MIN_MAX_CAPTURES);
    });
    it("clamps above the maximum down to MAX_MAX_CAPTURES", () => {
      expect(clampMaxCaptures(999)).toBe(MAX_MAX_CAPTURES);
    });
    it("floors fractional values and passes through valid ones", () => {
      expect(clampMaxCaptures(10.9)).toBe(10);
      expect(clampMaxCaptures(7)).toBe(7);
    });
    it("falls back to the default for non-finite input", () => {
      // Non-finite values (NaN, ±Infinity) are treated as "no usable value" and
      // resolve to the safe default rather than the clamp bounds.
      expect(clampMaxCaptures(NaN)).toBe(DEFAULT_MAX_CAPTURES);
      expect(clampMaxCaptures(Infinity)).toBe(DEFAULT_MAX_CAPTURES);
      expect(clampMaxCaptures(-Infinity)).toBe(DEFAULT_MAX_CAPTURES);
    });
  });

  describe("addEntry", () => {
    it("records an entry", () => {
      const entry = makeEntry({ id: "a" });

      act(() => {
        captureHistoryActions.addEntry(entry);
      });

      const { entries } = useCaptureHistoryStore.getState();
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe("a");
    });

    it("prepends so the most recent entry is at index 0 (newest-first)", () => {
      act(() => {
        captureHistoryActions.addEntry(makeEntry({ id: "first" }));
        captureHistoryActions.addEntry(makeEntry({ id: "second" }));
        captureHistoryActions.addEntry(makeEntry({ id: "third" }));
      });

      const { entries } = useCaptureHistoryStore.getState();
      expect(entries.map((e) => e.id)).toEqual(["third", "second", "first"]);
    });

    it("preserves all fields of the recorded entry", () => {
      const entry = makeEntry({
        id: "full",
        thumbnail: "data:image/png;base64,thumb",
        savedPath: "/caps/shot.png",
        width: 2560,
        height: 1600,
        createdAt: 1_700_000_000_000,
      });

      act(() => {
        captureHistoryActions.addEntry(entry);
      });

      expect(useCaptureHistoryStore.getState().entries[0]).toEqual(entry);
    });

    it("returns an empty array when nothing is evicted", () => {
      let evicted: CaptureHistoryEntry[] = [makeEntry()];
      act(() => {
        evicted = captureHistoryActions.addEntry(makeEntry({ id: "a" }));
      });
      expect(evicted).toEqual([]);
    });
  });

  describe("cap / eviction", () => {
    it("caps at maxEntries and returns the evicted (oldest) entry", () => {
      // Default cap is 10. Fill to exactly the cap...
      act(() => {
        for (let i = 0; i < DEFAULT_MAX_CAPTURES; i++) {
          captureHistoryActions.addEntry(makeEntry({ id: String(i) }));
        }
      });
      expect(useCaptureHistoryStore.getState().entries).toHaveLength(DEFAULT_MAX_CAPTURES);

      // ...then push one more: the oldest ("0") is evicted and surfaced.
      let evicted: CaptureHistoryEntry[] = [];
      act(() => {
        evicted = captureHistoryActions.addEntry(makeEntry({ id: "overflow" }));
      });

      const { entries } = useCaptureHistoryStore.getState();
      expect(entries).toHaveLength(DEFAULT_MAX_CAPTURES);
      expect(entries[0].id).toBe("overflow");
      expect(evicted.map((e) => e.id)).toEqual(["0"]);
      // The evicted id is gone from the buffer.
      expect(entries.some((e) => e.id === "0")).toBe(false);
    });
  });

  describe("setMaxEntries (dynamic N)", () => {
    it("re-caps the buffer down to the new N and returns the evicted tail", () => {
      act(() => {
        // ids 0..7, newest-first => [7,6,5,4,3,2,1,0]
        for (let i = 0; i < 8; i++) {
          captureHistoryActions.addEntry(makeEntry({ id: String(i) }));
        }
      });

      let evicted: CaptureHistoryEntry[] = [];
      act(() => {
        evicted = captureHistoryActions.setMaxEntries(3);
      });

      const { entries, maxEntries } = useCaptureHistoryStore.getState();
      expect(maxEntries).toBe(3);
      // Keeps the 3 newest.
      expect(entries.map((e) => e.id)).toEqual(["7", "6", "5"]);
      // Evicts the older tail (in newest-first order).
      expect(evicted.map((e) => e.id)).toEqual(["4", "3", "2", "1", "0"]);
    });

    it("clamps the requested N before applying it", () => {
      act(() => {
        captureHistoryActions.setMaxEntries(999);
      });
      expect(useCaptureHistoryStore.getState().maxEntries).toBe(MAX_MAX_CAPTURES);

      act(() => {
        captureHistoryActions.setMaxEntries(0);
      });
      expect(useCaptureHistoryStore.getState().maxEntries).toBe(MIN_MAX_CAPTURES);
    });

    it("evicts nothing and keeps everything when N grows", () => {
      act(() => {
        captureHistoryActions.setMaxEntries(2);
        captureHistoryActions.addEntry(makeEntry({ id: "a" }));
        captureHistoryActions.addEntry(makeEntry({ id: "b" }));
      });

      let evicted: CaptureHistoryEntry[] = [makeEntry()];
      act(() => {
        evicted = captureHistoryActions.setMaxEntries(10);
      });

      expect(evicted).toEqual([]);
      expect(useCaptureHistoryStore.getState().entries.map((e) => e.id)).toEqual(["b", "a"]);
    });

    it("subsequent addEntry uses the new (smaller) cap", () => {
      act(() => {
        captureHistoryActions.setMaxEntries(2);
        captureHistoryActions.addEntry(makeEntry({ id: "a" }));
        captureHistoryActions.addEntry(makeEntry({ id: "b" }));
      });

      let evicted: CaptureHistoryEntry[] = [];
      act(() => {
        evicted = captureHistoryActions.addEntry(makeEntry({ id: "c" }));
      });

      expect(useCaptureHistoryStore.getState().entries.map((e) => e.id)).toEqual(["c", "b"]);
      expect(evicted.map((e) => e.id)).toEqual(["a"]);
    });
  });

  describe("persistence", () => {
    it("persists the capped list after addEntry (not the evicted tail)", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn().mockResolvedValue(undefined);
      // addEntry persists fire-and-forget via its own Store.load; give it a
      // capturing mock so we can assert what got written.
      vi.mocked(Store.load).mockResolvedValue({
        get: vi.fn().mockResolvedValue(null),
        set,
        save,
        delete: vi.fn().mockResolvedValue(undefined),
      } as unknown as Awaited<ReturnType<typeof Store.load>>);

      act(() => {
        captureHistoryActions.setMaxEntries(1);
        captureHistoryActions.addEntry(makeEntry({ id: "old" }));
        captureHistoryActions.addEntry(makeEntry({ id: "new" }));
      });

      // Let the fire-and-forget persistEntries promises settle.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // The most recent persisted entries array holds only the capped survivor.
      const calls = set.mock.calls;
      const lastSet = calls[calls.length - 1];
      expect(lastSet?.[0]).toBe("entries");
      const persisted = lastSet?.[1] as CaptureHistoryEntry[];
      expect(persisted.map((e) => e.id)).toEqual(["new"]);
    });
  });

  describe("initialize (hydrate) — persistence-across-restart", () => {
    it("hydrates persisted entries from the store and sets _isInitialized", async () => {
      const stored: CaptureHistoryEntry[] = [
        makeEntry({ id: "p1", createdAt: 2 }),
        makeEntry({ id: "p2", createdAt: 1 }),
      ];

      // Override the global Store.load mock just for this initialize() call so
      // store.get(ENTRIES_KEY) returns our seeded entries. mockResolvedValueOnce
      // self-consumes, so it does not leak into other tests.
      vi.mocked(Store.load).mockResolvedValueOnce({
        get: vi.fn().mockResolvedValue(stored),
        set: vi.fn().mockResolvedValue(undefined),
        save: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      } as unknown as Awaited<ReturnType<typeof Store.load>>);

      await act(async () => {
        await captureHistoryActions.initialize();
      });

      const state = useCaptureHistoryStore.getState();
      expect(state._isInitialized).toBe(true);
      expect(state.entries.map((e) => e.id)).toEqual(["p1", "p2"]);
    });

    it("is a no-op when there are no persisted entries (default mock returns null)", async () => {
      await act(async () => {
        await captureHistoryActions.initialize();
      });

      const state = useCaptureHistoryStore.getState();
      expect(state._isInitialized).toBe(true);
      expect(state.entries).toEqual([]);
    });

    it("only hydrates once (guarded by _isInitialized)", async () => {
      await act(async () => {
        await captureHistoryActions.initialize();
      });
      expect(useCaptureHistoryStore.getState()._isInitialized).toBe(true);

      // A second call with a seeded store must NOT overwrite, because the guard
      // short-circuits before touching the store.
      vi.mocked(Store.load).mockResolvedValueOnce({
        get: vi.fn().mockResolvedValue([makeEntry({ id: "should-not-load" })]),
        set: vi.fn().mockResolvedValue(undefined),
        save: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      } as unknown as Awaited<ReturnType<typeof Store.load>>);

      await act(async () => {
        await captureHistoryActions.initialize();
      });

      expect(useCaptureHistoryStore.getState().entries).toEqual([]);
    });

    it("a hydrate-then-setMaxEntries thread re-caps a too-long persisted list", async () => {
      // Simulates restart: persisted list longer than the now-configured N. The
      // App threads N right after initialize(); the evicted tail is surfaced so
      // the caller can delete the files.
      const stored: CaptureHistoryEntry[] = Array.from({ length: 5 }, (_, i) =>
        makeEntry({ id: `p${i}` })
      );
      vi.mocked(Store.load).mockResolvedValue({
        get: vi.fn().mockResolvedValue(stored),
        set: vi.fn().mockResolvedValue(undefined),
        save: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      } as unknown as Awaited<ReturnType<typeof Store.load>>);

      await act(async () => {
        await captureHistoryActions.initialize();
      });

      let evicted: CaptureHistoryEntry[] = [];
      act(() => {
        evicted = captureHistoryActions.setMaxEntries(2);
      });

      expect(useCaptureHistoryStore.getState().entries.map((e) => e.id)).toEqual(["p0", "p1"]);
      expect(evicted.map((e) => e.id)).toEqual(["p2", "p3", "p4"]);
    });
  });

  describe("reset", () => {
    it("clears entries, restores the default cap, and marks uninitialized", () => {
      act(() => {
        captureHistoryActions.setMaxEntries(3);
        captureHistoryActions.addEntry(makeEntry());
      });
      expect(useCaptureHistoryStore.getState().entries).toHaveLength(1);

      act(() => {
        captureHistoryActions.reset();
      });

      const state = useCaptureHistoryStore.getState();
      expect(state.entries).toEqual([]);
      expect(state.maxEntries).toBe(DEFAULT_MAX_CAPTURES);
      expect(state._isInitialized).toBe(false);
    });
  });

  describe("clearHistory", () => {
    it("empties entries and returns true on success", async () => {
      act(() => {
        captureHistoryActions.addEntry(makeEntry());
      });
      expect(useCaptureHistoryStore.getState().entries).toHaveLength(1);

      // The default setup.ts mock has no `delete`; supply a delete-capable store
      // so the success path (delete + save) is what's exercised here.
      vi.mocked(Store.load).mockResolvedValueOnce({
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        save: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(true),
      } as unknown as Awaited<ReturnType<typeof Store.load>>);

      let result: boolean | undefined;
      await act(async () => {
        result = await captureHistoryActions.clearHistory();
      });

      expect(result).toBe(true);
      expect(useCaptureHistoryStore.getState().entries).toEqual([]);
    });
  });
});
