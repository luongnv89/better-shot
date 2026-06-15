import { describe, it, expect, beforeEach, vi } from "vitest";
import { act } from "@testing-library/react";
import { Store } from "@tauri-apps/plugin-store";
import {
  useCaptureHistoryStore,
  captureHistoryActions,
  MAX_HISTORY_ENTRIES,
  type CaptureHistoryEntry,
} from "./captureHistoryStore";

// Build a CaptureHistoryEntry directly with a stub thumbnail. Store tests must
// NOT call generateThumbnail: jsdom has no real canvas, and the store's
// concern is record/cap/hydrate, not pixel work.
function makeEntry(overrides: Partial<CaptureHistoryEntry> = {}): CaptureHistoryEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    thumbnail: overrides.thumbnail ?? "data:image/png;base64,stub",
    savedPath: overrides.savedPath ?? "/tmp/bettershot.png",
    width: overrides.width ?? 1920,
    height: overrides.height ?? 1080,
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

describe("captureHistoryStore", () => {
  beforeEach(() => {
    // Reset store to initial state (also flips _isInitialized back to false so
    // initialize() will actually run in the hydrate test).
    act(() => {
      captureHistoryActions.reset();
    });
    // Clear call history but KEEP setup.ts's Store.load implementation.
    // (resetAllMocks would wipe the implementation and break Store.load.)
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("starts with an empty entries list", () => {
      expect(useCaptureHistoryStore.getState().entries).toEqual([]);
    });

    it("is not initialized by default", () => {
      expect(useCaptureHistoryStore.getState()._isInitialized).toBe(false);
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
        savedPath: "/Users/me/Desktop/shot.png",
        width: 2560,
        height: 1600,
        createdAt: 1_700_000_000_000,
      });

      act(() => {
        captureHistoryActions.addEntry(entry);
      });

      expect(useCaptureHistoryStore.getState().entries[0]).toEqual(entry);
    });
  });

  describe("cap / eviction", () => {
    it("caps at MAX_HISTORY_ENTRIES and evicts the oldest first", () => {
      const overflow = 5;
      const total = MAX_HISTORY_ENTRIES + overflow;

      act(() => {
        // Add oldest-to-newest: ids "0" .. "(total-1)".
        for (let i = 0; i < total; i++) {
          captureHistoryActions.addEntry(makeEntry({ id: String(i) }));
        }
      });

      const { entries } = useCaptureHistoryStore.getState();
      expect(entries).toHaveLength(MAX_HISTORY_ENTRIES);

      // Newest-first: index 0 is the last-added id.
      expect(entries[0].id).toBe(String(total - 1));

      // The oldest `overflow` entries (ids "0".."4") must be gone.
      const remainingIds = new Set(entries.map((e) => e.id));
      for (let i = 0; i < overflow; i++) {
        expect(remainingIds.has(String(i))).toBe(false);
      }
      // The newest survivors remain.
      expect(remainingIds.has(String(total - 1))).toBe(true);
      expect(remainingIds.has(String(overflow))).toBe(true); // id "5" is the oldest survivor
    });
  });

  describe("initialize (hydrate)", () => {
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
  });

  describe("reset", () => {
    it("clears entries and marks uninitialized", () => {
      act(() => {
        captureHistoryActions.addEntry(makeEntry());
      });
      expect(useCaptureHistoryStore.getState().entries).toHaveLength(1);

      act(() => {
        captureHistoryActions.reset();
      });

      const state = useCaptureHistoryStore.getState();
      expect(state.entries).toEqual([]);
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
