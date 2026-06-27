import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Check, Columns2, History, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useCaptureHistoryEntries,
  type CaptureHistoryEntry,
} from "@/stores/captureHistoryStore";

interface CaptureHistoryGalleryProps {
  onBack: () => void;
  /**
   * Open a single raw capture in the editor. Fired when the user clicks a
   * capture's thumbnail (distinct from selecting it via its checkbox). Optional
   * so the gallery still renders standalone in isolation tests.
   */
  onOpenCapture?: (entry: CaptureHistoryEntry) => void;
  /**
   * Send the currently selected captures into the Batch Resize flow. Receives
   * the selected entries (in newest-first gallery order). Optional so the
   * gallery still renders standalone (e.g. in isolation tests) without a batch
   * destination wired up.
   */
  onSendToBatch?: (entries: CaptureHistoryEntry[]) => void;
  /**
   * Open the two selected captures in the editor's side-by-side mode. Only
   * called when exactly two captures are selected; the entries are passed in
   * gallery order so the first becomes Image 1 (left) and the second Image 2
   * (right). Optional so the gallery still renders standalone in tests.
   */
  onCompareSideBySide?: (entries: CaptureHistoryEntry[]) => void;
}

/** Fixed box the thumbnails live in, so the grid stays aligned regardless of aspect. */
const THUMB_BOX = 160;

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/**
 * Gallery of recent raw captures (a rolling buffer of the last N). Entries are
 * stored newest-first and shown in that order. Clicking a capture's thumbnail
 * reopens it in the editor; a dedicated per-capture checkbox drives transient
 * multi-select (select-all / clear act on the whole list) and the current
 * selection can be sent straight into Batch Resize. Selection is purely local UI
 * state — it is not persisted and resets when the gallery unmounts.
 */
export function CaptureHistoryGallery({ onBack, onOpenCapture, onSendToBatch, onCompareSideBySide }: CaptureHistoryGalleryProps) {
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
  // Side-by-side compares exactly two captures (Image 1 + Image 2).
  const canCompare = selectedCount === 2;

  const handleSend = useCallback(() => {
    if (selectedCount === 0) return;
    onSendToBatch?.(selectedEntries);
  }, [selectedCount, selectedEntries, onSendToBatch]);

  const handleCompare = useCallback(() => {
    if (selectedEntries.length !== 2) return;
    onCompareSideBySide?.(selectedEntries);
  }, [selectedEntries, onCompareSideBySide]);

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
              Your most recent screenshots appear here automatically. Click one to reopen it in the editor.
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
              {onCompareSideBySide && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCompare}
                  disabled={!canCompare}
                  title={canCompare ? "Top-left selected = Image 1 (left); the other = Image 2 (right)" : "Select exactly 2 captures"}
                >
                  <Columns2 className="size-4" aria-hidden="true" />
                  Compare side-by-side
                </Button>
              )}
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
                const name = basename(entry.savedPath);
                return (
                  <div key={entry.id} className="space-y-1.5">
                    <div
                      className={cn(
                        "group bg-muted/40 relative w-full overflow-hidden rounded-lg border-2 transition-colors",
                        isSelected
                          ? "border-[var(--cta,theme(colors.blue.500))] ring-2 ring-[var(--cta,theme(colors.blue.500))]/40"
                          : "border-border hover:border-muted-foreground/40"
                      )}
                      style={{ height: THUMB_BOX }}
                    >
                      {/* Thumbnail click opens the raw capture in the editor. */}
                      <button
                        type="button"
                        onClick={() => onOpenCapture?.(entry)}
                        aria-label={`Open ${name}`}
                        title={entry.savedPath}
                        className="flex h-full w-full cursor-pointer items-center justify-center"
                      >
                        <img
                          src={entry.thumbnail}
                          alt={name}
                          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                        />
                      </button>
                      {/* Dedicated selection control, separate from the open
                          gesture: toggles multi-select for Batch Resize. Kept as
                          role="checkbox" + "Select <name>" so it is the a11y
                          checkbox for the capture. */}
                      <button
                        type="button"
                        onClick={() => toggleSelected(entry.id)}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={`Select ${name}`}
                        className={cn(
                          "absolute top-1.5 right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full border shadow transition-colors",
                          isSelected
                            ? "bg-[var(--cta,theme(colors.blue.500))] border-transparent text-white"
                            : "bg-background/80 border-border text-transparent hover:border-muted-foreground/60"
                        )}
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
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
