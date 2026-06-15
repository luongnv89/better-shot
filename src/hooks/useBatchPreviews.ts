import { useEffect, useRef, useState } from "react";
import { createHighQualityCanvas } from "@/lib/canvas-utils";
import { loadImage } from "@/hooks/usePreviewGenerator";
import {
  buildRenderOptions,
  type BatchItem,
  type BatchTarget,
} from "@/lib/batch-resize";

/** How long a resized preview is in. `idle` until the first render kicks off. */
export type PreviewStatus = "idle" | "rendering" | "ready" | "error";

export interface ItemPreview {
  /** Object URL of the rendered resized image, or null while rendering/on error. */
  url: string | null;
  status: PreviewStatus;
}

/** Map of `BatchItem.id` → its resized-preview state. */
export type PreviewMap = Record<string, ItemPreview>;

/**
 * Injectable side-effect boundary. Pulled out so tests can drive the hook
 * without a real canvas backend (jsdom has no working `toBlob`/object URLs),
 * mirroring how `batch-resize.ts` injects `renderToDataUrl`/`saveImage`.
 */
export interface PreviewDeps {
  loadImage: (src: string) => Promise<HTMLImageElement>;
  /** Render the resized image and return an object URL pointing at it. */
  renderToUrl: (item: BatchItem, target: BatchTarget) => Promise<string>;
  /** Revoke a previously created object URL. */
  revokeUrl: (url: string) => void;
}

/** Real rendering path: canvas → PNG blob → object URL. */
function renderItemToUrl(item: BatchItem, target: BatchTarget): Promise<string> {
  return loadImage(item.assetUrl).then(
    (img) =>
      new Promise<string>((resolve, reject) => {
        const opts = buildRenderOptions(
          img,
          target.width,
          target.height,
          target.fit,
          target.bg
        );
        const canvas = createHighQualityCanvas(opts);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            reject(new Error("Failed to render preview"));
          }
        }, "image/png");
      })
  );
}

const DEFAULT_DEPS: PreviewDeps = {
  loadImage,
  renderToUrl: renderItemToUrl,
  revokeUrl: (url) => URL.revokeObjectURL(url),
};

/** Debounce so rapid width/height/fit/bg edits don't render on every keystroke. */
export const PREVIEW_DEBOUNCE_MS = 150;

/**
 * Generate a live resized-preview object URL for every batch item, keeping them
 * in sync as the item list or the resize target (width/height/fit/bg) changes.
 *
 * Lifecycle guarantees (all object URLs are revoked exactly once):
 *  - regeneration replaces an item's prior URL → the old URL is revoked;
 *  - an item leaves the list → its URL is revoked;
 *  - the component unmounts → every outstanding URL is revoked;
 *  - an in-flight render that is superseded (settings changed, item removed,
 *    unmount) revokes the URL it produced instead of leaking it.
 *
 * Returns an empty map when there are no items or the target is not yet valid
 * (width/height ≤ 0), so callers render nothing until a real size is chosen.
 */
export function useBatchPreviews(
  items: BatchItem[],
  target: BatchTarget,
  deps: PreviewDeps = DEFAULT_DEPS
): PreviewMap {
  const [previews, setPreviews] = useState<PreviewMap>({});

  // Latest object URL per item id, kept in a ref so cleanups can revoke without
  // re-subscribing to state. This is the single source of truth for "what needs
  // revoking", independent of React's async state batching.
  const urlsRef = useRef<Record<string, string>>({});
  // Keep the newest deps in a ref so the cleanup closure always revokes through
  // the current implementation (and so deps aren't an effect dependency).
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const { width, height, fit, bg } = target;
  const valid = items.length > 0 && width > 0 && height > 0;
  // Stable identity for the item set; reused as an effect dependency so adding
  // or removing an item retriggers generation, but unrelated re-renders don't.
  const idsKey = items.map((i) => i.id).join(",");

  useEffect(() => {
    // Always reconcile: drop previews/URLs for items that no longer exist, even
    // when the target is invalid (e.g. the user cleared the width field).
    const liveIds = new Set(items.map((i) => i.id));
    for (const id of Object.keys(urlsRef.current)) {
      if (!liveIds.has(id)) {
        depsRef.current.revokeUrl(urlsRef.current[id]);
        delete urlsRef.current[id];
      }
    }
    setPreviews((prev) => {
      let changed = false;
      const next: PreviewMap = {};
      for (const id of Object.keys(prev)) {
        if (liveIds.has(id)) {
          next[id] = prev[id];
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    if (!valid) return;

    let cancelled = false;

    // Mark everything as rendering up front so the UI can show a placeholder.
    setPreviews((prev) => {
      const next: PreviewMap = { ...prev };
      for (const item of items) {
        next[item.id] = { url: prev[item.id]?.url ?? null, status: "rendering" };
      }
      return next;
    });

    const timer = setTimeout(() => {
      for (const item of items) {
        depsRef.current
          .renderToUrl(item, { width, height, fit, bg })
          .then((url) => {
            // Superseded while rendering: don't paint a stale frame, and don't
            // leak the URL we just created.
            if (cancelled) {
              depsRef.current.revokeUrl(url);
              return;
            }
            const prevUrl = urlsRef.current[item.id];
            if (prevUrl && prevUrl !== url) {
              depsRef.current.revokeUrl(prevUrl);
            }
            urlsRef.current[item.id] = url;
            setPreviews((prev) => ({
              ...prev,
              [item.id]: { url, status: "ready" },
            }));
          })
          .catch(() => {
            if (cancelled) return;
            setPreviews((prev) => ({
              ...prev,
              [item.id]: { url: prev[item.id]?.url ?? null, status: "error" },
            }));
          });
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `items` is intentionally tracked via `idsKey` (stable string) rather than
    // by reference, so unrelated parent re-renders don't retrigger generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, width, height, fit, bg, valid]);

  // Final safety net: revoke everything still outstanding on unmount.
  useEffect(() => {
    return () => {
      for (const url of Object.values(urlsRef.current)) {
        depsRef.current.revokeUrl(url);
      }
      urlsRef.current = {};
    };
  }, []);

  return previews;
}
