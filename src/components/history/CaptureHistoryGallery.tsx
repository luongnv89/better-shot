import { ArrowLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCaptureHistoryEntries } from "@/stores/captureHistoryStore";

interface CaptureHistoryGalleryProps {
  onBack: () => void;
}

/** Fixed box the thumbnails live in, so the grid stays aligned regardless of aspect. */
const THUMB_BOX = 160;

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/**
 * Read-only gallery of past captures. Entries are stored newest-first and shown
 * in that order. No selection, actions, or deletion in this slice.
 */
export function CaptureHistoryGallery({ onBack }: CaptureHistoryGalleryProps) {
  const entries = useCaptureHistoryEntries();

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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {entries.map((entry) => (
              <div key={entry.id} className="space-y-1.5">
                <div
                  className={cn(
                    "bg-muted/40 flex items-center justify-center overflow-hidden rounded-lg border border-border"
                  )}
                  style={{ height: THUMB_BOX }}
                  title={entry.savedPath}
                >
                  <img
                    src={entry.thumbnail}
                    alt={basename(entry.savedPath)}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                  />
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
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
