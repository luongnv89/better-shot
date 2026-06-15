import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { Store } from "@tauri-apps/plugin-store";

// ============================================================================
// Types
// ============================================================================

/**
 * A single recorded capture in the history.
 *
 * `thumbnail` is a small PNG data-URL (longest edge <= 320px) generated from the
 * full-resolution edited image; `width`/`height` are the *full-resolution*
 * natural dimensions of that edited image (not the thumbnail's scaled dims).
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
  _isInitialized: boolean;
}

interface CaptureHistoryActions {
  initialize: () => Promise<void>;
  addEntry: (entry: CaptureHistoryEntry) => void;
  clearHistory: () => Promise<boolean>;
  reset: () => void;
}

export type CaptureHistoryStore = CaptureHistoryState & CaptureHistoryActions;

// ============================================================================
// Constants
// ============================================================================

export const CAPTURE_HISTORY_STORE_NAME = "capture-history.json";
export const ENTRIES_KEY = "entries";
export const MAX_HISTORY_ENTRIES = 50;

const INITIAL_STATE: CaptureHistoryState = {
  entries: [],
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
        set((state) => {
          // Prepend (newest-first), then drop the oldest beyond the cap (the tail).
          state.entries = [entry, ...state.entries].slice(0, MAX_HISTORY_ENTRIES);
        });
        // Read the post-set state so we persist the capped list, not a stale one.
        persistEntries(get().entries);
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
  get clearHistory() {
    return useCaptureHistoryStore.getState().clearHistory;
  },
  get reset() {
    return useCaptureHistoryStore.getState().reset;
  },
};

// Hook version - returns the stable actions object
export const useCaptureHistoryActions = () => captureHistoryActions;
