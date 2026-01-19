import { memo, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { calculateOffsetLimits } from "@/lib/canvas-utils";
import type { ImageOffset, ImageScalingMode } from "@/stores/editorStore";

interface ImagePositionPanelProps {
  imageOffset: ImageOffset;
  screenshotWidth: number;
  screenshotHeight: number;
  backgroundWidth: number;
  backgroundHeight: number;
  imageScalingMode?: ImageScalingMode;
  onOffsetXChange: (offsetX: number) => void;
  onOffsetYChange: (offsetY: number) => void;
  onReset: () => void;
}

export const ImagePositionPanel = memo(function ImagePositionPanel({
  imageOffset,
  screenshotWidth,
  screenshotHeight,
  backgroundWidth,
  backgroundHeight,
  imageScalingMode = "none",
  onOffsetXChange,
  onOffsetYChange,
  onReset,
}: ImagePositionPanelProps) {
  // Calculate limits for this image/background size combination
  const offsetLimits = useMemo(
    () =>
      calculateOffsetLimits(
        screenshotWidth,
        screenshotHeight,
        backgroundWidth,
        backgroundHeight
      ),
    [screenshotWidth, screenshotHeight, backgroundWidth, backgroundHeight]
  );

  // Check if repositioning is possible
  // - For "none" mode: image must be larger than background
  // - For "cover" mode: always allow (image is scaled to cover background)
  // - For other modes: image must be larger than background after scaling
  const canReposition =
    imageScalingMode === "cover" ||
    (screenshotWidth > backgroundWidth || screenshotHeight > backgroundHeight);

  const handleOffsetXInput = useCallback(
    (value: string) => {
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue)) {
        const clamped = Math.max(
          offsetLimits.minOffsetX,
          Math.min(offsetLimits.maxOffsetX, numValue)
        );
        onOffsetXChange(clamped);
      }
    },
    [onOffsetXChange, offsetLimits]
  );

  const handleOffsetYInput = useCallback(
    (value: string) => {
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue)) {
        const clamped = Math.max(
          offsetLimits.minOffsetY,
          Math.min(offsetLimits.maxOffsetY, numValue)
        );
        onOffsetYChange(clamped);
      }
    },
    [onOffsetYChange, offsetLimits]
  );

  // Don't show panel if repositioning not possible
  if (!canReposition) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Image Position</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-xs h-6 px-2"
        >
          Reset
        </Button>
      </div>

      {/* Info message */}
      <div className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
        💡 Hold <kbd className="bg-background px-1 rounded text-xs">Alt</kbd> and
        drag on canvas to reposition
      </div>

      {/* Offset inputs */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Horizontal Offset
          </label>
          <input
            type="number"
            value={imageOffset.x}
            onChange={(e) => handleOffsetXInput(e.target.value)}
            min={offsetLimits.minOffsetX}
            max={offsetLimits.maxOffsetX}
            className="w-full px-2 py-1.5 bg-secondary border border-border rounded text-sm text-card-foreground"
          />
          <div className="text-xs text-muted-foreground mt-1">
            Range: {Math.round(offsetLimits.minOffsetX)} to{" "}
            {Math.round(offsetLimits.maxOffsetX)}px
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Vertical Offset
          </label>
          <input
            type="number"
            value={imageOffset.y}
            onChange={(e) => handleOffsetYInput(e.target.value)}
            min={offsetLimits.minOffsetY}
            max={offsetLimits.maxOffsetY}
            className="w-full px-2 py-1.5 bg-secondary border border-border rounded text-sm text-card-foreground"
          />
          <div className="text-xs text-muted-foreground mt-1">
            Range: {Math.round(offsetLimits.minOffsetY)} to{" "}
            {Math.round(offsetLimits.maxOffsetY)}px
          </div>
        </div>
      </div>
    </div>
  );
});
