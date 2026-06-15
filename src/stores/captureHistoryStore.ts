import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { Store } from "@tauri-apps/plugin-store";

// ============================================================================
// Types
// ============================================================================

/**
 * A single recorded raw capture in the rolling buffer.
 *
 * `thumbnail` is a small PNG data-URL (longest edge <= 320px) generated from the
 * raw capture file; `savedPath` points at the raw capture PNG on disk (under the
 * app-data captures dir); `width`/`height` are the *full-resolution* natural
 * dimensions of that raw capture (not the thumbnail's scaled dims).
 */
export interface CaptureHistoryEntry {
  id: string;
  thumbnail: string;
  savedPath: string;
  width: number;
  height: number;
  createdAt: number;
}

interface CaptureHistoryState {
  // Entries are stored newest-first (index 0 is the most recent capture).
  entries: CaptureHistoryEntry[];
  // Rolling-buffer cap. The single owner of N is the store; App injects the
  // user-configured value via setMaxEntries (the store never reads settings).
  maxEntries: number;
  _isInitialized: boolean;
}

interface CaptureHistoryActions {
  initialize: () => Promise<void>;
  /**
   * Prepend a raw capture and re-cap to `maxEntries`. Returns the entries that
   * were evicted (pushed past the cap) so the caller can delete their PNGs from
   * disk — the store never touches the filesystem itself.
   */
  addEntry: (entry: CaptureHistoryEntry) => CaptureHistoryEntry[];
  /**
   * Update the rolling-buffer cap and re-cap the current buffer. Returns the
   * entries evicted by the new (smaller) cap so the caller can delete their
   * PNGs. Persists the capped list so a restart does not rehydrate evicted
   * entries.
   */
  setMaxEntries: (max: number) => CaptureHistoryEntry[];
  clearHistory: () => Promise<boolean>;
  reset: () => void;
}

export type CaptureHistoryStore = CaptureHistoryState & CaptureHistoryActions;

// ============================================================================
// Constants
// ============================================================================

export const CAPTURE_HISTORY_STORE_NAME = "capture-history.json";
export const ENTRIES_KEY = "entries";
/** Default rolling-buffer size when the user has not configured one. */
export const DEFAULT_MAX_CAPTURES = 10;
/** Inclusive clamp bounds for the configurable buffer size. */
export const MIN_MAX_CAPTURES = 1;
export const MAX_MAX_CAPTURES = 50;

/** Clamp an arbitrary (possibly user-entered) value to a valid buffer size. */
export function clampMaxCaptures(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_CAPTURES;
  return Math.min(MAX_MAX_CAPTURES, Math.max(MIN_MAX_CAPTURES, Math.floor(value)));
}

const INITIAL_STATE: CaptureHistoryState = {
  entries: [],
  maxEntries: DEFAULT_MAX_CAPTURES,
  _isInitialized: false,
};

// ============================================================================
// Persistence helpers (best-effort, never throw)
// ============================================================================

/**
 * Persist the entries array to the dedicated capture-history store.
 * Fire-and-forget: failures are logged and swallowed so a persistence error can
 * never break the save flow that triggered it.
 */
async function persistEntries(entries: CaptureHistoryEntry[]) {
  try {
    const store = await Store.load(CAPTURE_HISTORY_STORE_NAME);
    await store.set(ENTRIES_KEY, entries);
    await store.save();
  } catch (err) {
    console.error("Failed to persist capture history:", err);
  }
}

/**
 * Clear all persisted capture-history entries from disk.
 * Returns true on success, false if persistence failed.
 */
export async function clearPersistedCaptureHistory(): Promise<boolean> {
  try {
    const store = await Store.load(CAPTURE_HISTORY_STORE_NAME);
    await store.delete(ENTRIES_KEY);
    await store.save();
    return true;
  } catch (err) {
    console.error("Failed to clear persisted capture history:", err);
    return false;
  }
}

// ============================================================================
// Store
// ============================================================================

export const useCaptureHistoryStore = create<CaptureHistoryStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      ...INITIAL_STATE,

      // ========================================
      // Initialization
      // ========================================
      initialize: async () => {
        if (get()._isInitialized) return;

        try {
          const store = await Store.load(CAPTURE_HISTORY_STORE_NAME);
          const storedEntries = await store.get<CaptureHistoryEntry[]>(ENTRIES_KEY);

          set((state) => {
            if (storedEntries) {
              state.entries = storedEntries;
            }
            state._isInitialized = true;
          });
        } catch (err) {
          console.error("Failed to load capture history from store:", err);
          set((state) => {
            state._isInitialized = true;
          });
        }
      },

      // ========================================
      // Mutations
      // ========================================
      addEntry: (entry) => {
        const max = get().maxEntries;
        // Prepend (newest-first), then split at the cap so the tail (oldest
        // entries pushed past N) can be surfaced to the caller for file deletion.
        const next = [entry, ...get().entries];
        const kept = next.slice(0, max);
        const evicted = next.slice(max);
        set((state) => {
          state.entries = kept;
        });
        // Persist the capped list, not a stale one.
        persistEntries(kept);
        return evicted;
      },

      setMaxEntries: (max) => {
        const clamped = clampMaxCaptures(max);
        const current = get().entries;
        const kept = current.slice(0, clamped);
        const evicted = current.slice(clamped);
        set((state) => {
          state.maxEntries = clamped;
          state.entries = kept;
        });
        // Persist so a restart hydrates the capped list, never the evicted tail.
        persistEntries(kept);
        return evicted;
      },

      clearHistory: async () => {
        const ok = await clearPersistedCaptureHistory();
        set((state) => {
          state.entries = [];
        });
        return ok;
      },

      // ========================================
      // Reset
      // ========================================
      reset: () => {
        set((state) => {
          Object.assign(state, INITIAL_STATE);
          state._isInitialized = false;
        });
      },
    }))
  )
);

// ============================================================================
// Selectors (for optimized re-renders)
// ============================================================================

export const useCaptureHistoryEntries = () => useCaptureHistoryStore((state) => state.entries);

// ============================================================================
// Actions - accessed directly from the store for stable references
// ============================================================================

export const captureHistoryActions = {
  get initialize() {
    return useCaptureHistoryStore.getState().initialize;
  },
  get addEntry() {
    return useCaptureHistoryStore.getState().addEntry;
  },
  get setMaxEntries() {
    return useCaptureHistoryStore.getState().setMaxEntries;
  },
  get clearHistory() {
    return useCaptureHistoryStore.getState().clearHistory;
  },
  get reset() {
    return useCaptureHistoryStore.getState().reset;
  },
};

// Hook version - returns the stable actions object
export const useCaptureHistoryActions = () => captureHistoryActions;
