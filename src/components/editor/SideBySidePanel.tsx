import { memo } from "react";
import { MoveLeft, RefreshCw } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface SideBySidePanelProps {
  splitRatio: number;
  onSplitRatioChange: (ratio: number) => void;
  /**
   * Swap Image 1 and Image 2. Only provide when both images are present —
   * the swap control is hidden when this is omitted (see ImageEditor).
   */
  onSwapImages?: () => void;
  leftImageLabel?: string;
  rightImageLabel?: string;
}

export const SideBySidePanel = memo(function SideBySidePanel({
  splitRatio,
  onSplitRatioChange,
  onSwapImages,
  leftImageLabel = "Left",
  rightImageLabel = "Right",
}: SideBySidePanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Section header */}
      <div className="section-header" style={{ paddingTop: 0 }}>
        <span className="section-title">Side-by-side</span>
      </div>

      {/* Swap button — only shown when both images are present */}
      {onSwapImages && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span className="toggle-label">Swap images</span>
          <button
            onClick={onSwapImages}
            aria-label="Swap left and right images"
            className="tool-btn"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <RefreshCw className="size-[15px]" />
          </button>
        </div>
      )}

      {/* Split ratio slider */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <span className="toggle-label" id="split-ratio-label">Split ratio</span>
          <span className="toggle-value">{Math.round(splitRatio * 100)}%</span>
        </div>
        <Slider
          value={[splitRatio]}
          onValueChange={(value) => onSplitRatioChange(value[0])}
          onValueCommit={(value) => onSplitRatioChange(value[0])}
          min={0.2}
          max={0.8}
          step={0.05}
          className="studio-slider w-full"
          aria-labelledby="split-ratio-label"
        />
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "oklch(0.65 0.01 250)",
          marginTop: 4,
        }}>
          <span>{leftImageLabel}</span>
          <span>{rightImageLabel}</span>
        </div>
      </div>

      {/* Split ratio hint */}
      <div style={{
        padding: "8px 10px",
        background: "oklch(0.145 0.008 250)",
        border: "1px solid oklch(0.22 0.009 250)",
        borderRadius: 6,
        fontSize: 11,
        lineHeight: 1.5,
        color: "oklch(0.75 0.01 250)",
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
      }}>
        <MoveLeft className="size-3 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.42 0.012 250)" }} />
        <span>
          Adjust the split ratio to control how much space each image takes.
        </span>
      </div>
    </div>
  );
});
