import { memo } from "react";
import { X, History } from "lucide-react";
import type { CaptureHistoryEntry } from "@/stores/captureHistoryStore";

interface CaptureHistoryPickerProps {
  entries: CaptureHistoryEntry[];
  /** Human label for the slot being filled, e.g. "Image 1". */
  slotLabel: string;
  onPick: (entry: CaptureHistoryEntry) => void;
  onClose: () => void;
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/**
 * Compact, in-editor thumbnail picker over the capture-history rolling buffer.
 * Used to drop a recent capture straight into a side-by-side slot without
 * leaving the editor. Renders the entry thumbnails (small data URLs); the
 * caller resolves the full-resolution capture when an entry is picked.
 */
export const CaptureHistoryPicker = memo(function CaptureHistoryPicker({
  entries,
  slotLabel,
  onPick,
  onClose,
}: CaptureHistoryPickerProps) {
  return (
    <div
      style={{
        border: "1px solid oklch(0.24 0.009 250)",
        borderRadius: 8,
        background: "oklch(0.135 0.008 250)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "oklch(0.82 0.01 250)" }}>
          <History className="size-3.5" aria-hidden="true" />
          Pick {slotLabel} from history
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close history picker"
          className="tool-btn"
          style={{ minWidth: 44, minHeight: 44, padding: 0 }}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {entries.length === 0 ? (
        <div style={{ fontSize: 11, lineHeight: 1.4, color: "oklch(0.62 0.01 250)", padding: "8px 2px" }}>
          No captures yet. Take a screenshot and it will appear here.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
            maxHeight: 220,
            overflowY: "auto",
            paddingRight: 2,
          }}
        >
          {entries.map((entry) => {
            const name = basename(entry.savedPath);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onPick(entry)}
                aria-label={`Use ${name} for ${slotLabel}`}
                title={`${name} — ${entry.width}×${entry.height}`}
                className="gradient-thumb"
                style={{ position: "relative", aspectRatio: "1", overflow: "hidden" }}
              >
                <img
                  src={entry.thumbnail}
                  alt={name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
