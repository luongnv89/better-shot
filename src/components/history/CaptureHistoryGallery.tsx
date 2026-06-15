import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Check, History, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useCaptureHistoryEntries,
  type CaptureHistoryEntry,
} from "@/stores/captureHistoryStore";

interface CaptureHistoryGalleryProps {
  onBack: () => void;
  /**
   * Send the currently selected captures into the Batch Resize flow. Receives
   * the selected entries (in newest-first gallery order). Optional so the
   * gallery still renders standalone (e.g. in isolation tests) without a batch
   * destination wired up.
   */
  onSendToBatch?: (entries: CaptureHistoryEntry[]) => void;
}

/** Fixed box the thumbnails live in, so the grid stays aligned regardless of aspect. */
const THUMB_BOX = 160;

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/**
 * Gallery of past captures. Entries are stored newest-first and shown in that
 * order. Supports transient multi-select: individual captures can be toggled,
 * select-all / clear controls act on the whole list, and the current selection
 * can be sent straight into Batch Resize. Selection is purely local UI state —
 * it is not persisted and resets when the gallery unmounts.
 */
export function CaptureHistoryGallery({ onBack, onSendToBatch }: CaptureHistoryGalleryProps) {
  const entries = useCaptureHistoryEntries();
  // Selected capture ids. A Set keeps toggling and membership checks O(1).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(entries.map((e) => e.id)));
  }, [entries]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Selected entries in gallery (newest-first) order, derived from the id set so
  // the order sent to Batch Resize matches what the user sees.
  const selectedEntries = useMemo(
    () => entries.filter((e) => selectedIds.has(e.id)),
    [entries, selectedIds]
  );

  const selectedCount = selectedEntries.length;
  const hasSelection = selectedCount > 0;
  const allSelected = entries.length > 0 && selectedCount === entries.length;

  const handleSend = useCallback(() => {
    if (selectedCount === 0) return;
    onSendToBatch?.(selectedEntries);
  }, [selectedCount, selectedEntries, onSendToBatch]);

  return (
    <main className="min-h-dvh bg-background text-foreground p-8">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Capture History</h1>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
            <History className="text-muted-foreground size-10" aria-hidden="true" />
            <p className="text-foreground font-medium">No captures yet</p>
            <p className="text-muted-foreground text-sm text-pretty">
              Edited images you save will appear here automatically.
            </p>
          </div>
        ) : (
          <>
            {/* Selection toolbar: count + select-all / clear / send controls. */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-muted-foreground text-sm tabular-nums"
                aria-live="polite"
                data-testid="selection-count"
              >
                {selectedCount} selected
              </span>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={selectAll}
                disabled={allSelected}
              >
                Select all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSelection}
                disabled={!hasSelection}
              >
                Clear
              </Button>
              <Button
                variant="cta"
                size="sm"
                onClick={handleSend}
                disabled={!hasSelection}
              >
                <Layers className="size-4" aria-hidden="true" />
                Send to Batch Resize{hasSelection ? ` (${selectedCount})` : ""}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {entries.map((entry) => {
                const isSelected = selectedIds.has(entry.id);
                return (
                  <div key={entry.id} className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => toggleSelected(entry.id)}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Select ${basename(entry.savedPath)}`}
                      title={entry.savedPath}
                      className={cn(
                        "group bg-muted/40 relative flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 transition-colors",
                        isSelected
                          ? "border-[var(--cta,theme(colors.blue.500))] ring-2 ring-[var(--cta,theme(colors.blue.500))]/40"
                          : "border-border hover:border-muted-foreground/40"
                      )}
                      style={{ height: THUMB_BOX }}
                    >
                      <img
                        src={entry.thumbnail}
                        alt={basename(entry.savedPath)}
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                      />
                      {/* Selection check badge — only the checked state is shown,
                          so selected items are visually distinct at a glance. */}
                      {isSelected && (
                        <span
                          className="bg-[var(--cta,theme(colors.blue.500))] absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full text-white shadow"
                          aria-hidden="true"
                        >
                          <Check className="size-3.5" />
                        </span>
                      )}
                    </button>
                    <div className="space-y-0.5 px-0.5">
                      <div
                        className="text-foreground text-xs truncate"
                        title={entry.savedPath}
                      >
                        {basename(entry.savedPath)}
                      </div>
                      <div className="text-muted-foreground text-[11px] tabular-nums">
                        {entry.width}×{entry.height}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {new Date(entry.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
