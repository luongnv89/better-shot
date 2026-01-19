import { memo, useState, useCallback, useMemo, useEffect } from "react";
import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CanvasDimensions, ImageScalingMode } from "@/stores/editorStore";

interface BackgroundSizePanelProps {
  dimensions: CanvasDimensions;
  screenshotWidth: number;
  screenshotHeight: number;
  padding: number;
  imageScalingMode: ImageScalingMode;
  imageBorderSize: number;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onAspectRatioLockedChange: (locked: boolean) => void;
  onPresetSelect: (width: number, height: number) => void;
  onScalingModeChange: (mode: ImageScalingMode) => void;
  onBorderSizeChange: (size: number) => void;
  onReset: () => void;
}

const PRESETS = [
  { label: "1280 × 800", width: 1280, height: 800 },
  { label: "1440 × 900", width: 1440, height: 900 },
  { label: "2560 × 1600", width: 2560, height: 1600 },
  { label: "2880 × 1800", width: 2880, height: 1800 },
] as const;

export const BackgroundSizePanel = memo(function BackgroundSizePanel({
  dimensions,
  screenshotWidth,
  screenshotHeight,
  padding,
  imageScalingMode,
  imageBorderSize,
  onWidthChange,
  onHeightChange,
  onAspectRatioLockedChange,
  onPresetSelect,
  onScalingModeChange,
  onBorderSizeChange,
  onReset,
}: BackgroundSizePanelProps) {
  const [inputWidth, setInputWidth] = useState(dimensions.width || 0);
  const [inputHeight, setInputHeight] = useState(dimensions.height || 0);
  const [inputBorderSize, setInputBorderSize] = useState(imageBorderSize);

  // Sync input state when dimensions change (from undo/redo or aspect ratio lock)
  useEffect(() => {
    setInputWidth(dimensions.width || 0);
    setInputHeight(dimensions.height || 0);
  }, [dimensions.width, dimensions.height]);

  // Sync border size when it changes
  useEffect(() => {
    setInputBorderSize(imageBorderSize);
  }, [imageBorderSize]);

  // Calculate auto dimensions (screenshot + padding)
  const autoDimensions = useMemo(
    () => ({
      width: screenshotWidth + padding * 2,
      height: screenshotHeight + padding * 2,
    }),
    [screenshotWidth, screenshotHeight, padding]
  );

  // Effective dimensions (0 = auto)
  const effectiveWidth = dimensions.width || autoDimensions.width;
  const effectiveHeight = dimensions.height || autoDimensions.height;

  // Check if custom size is set (not auto)
  const hasCustomSize = dimensions.width > 0 || dimensions.height > 0;

  const handleReset = useCallback(() => {
    setInputWidth(0);
    setInputHeight(0);
    onReset();
  }, [onReset]);

  const handleToggleLock = useCallback(() => {
    onAspectRatioLockedChange(!dimensions.aspectRatioLocked);
  }, [dimensions.aspectRatioLocked, onAspectRatioLockedChange]);

  const handlePresetClick = useCallback(
    (preset: (typeof PRESETS)[number]) => {
      setInputWidth(preset.width);
      setInputHeight(preset.height);
      onPresetSelect(preset.width, preset.height);
    },
    [onPresetSelect]
  );

  const handleWidthInput = useCallback(
    (value: string) => {
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue)) {
        const clamped = Math.max(100, Math.min(5000, numValue));
        setInputWidth(clamped);
        onWidthChange(clamped);
      }
    },
    [onWidthChange]
  );

  const handleHeightInput = useCallback(
    (value: string) => {
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue)) {
        const clamped = Math.max(100, Math.min(5000, numValue));
        setInputHeight(clamped);
        onHeightChange(clamped);
      }
    },
    [onHeightChange]
  );

  const handleBorderSizeInput = useCallback(
    (value: string) => {
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue)) {
        const clamped = Math.max(0, Math.min(100, numValue));
        setInputBorderSize(clamped);
        onBorderSizeChange(clamped);
      }
    },
    [onBorderSizeChange]
  );

  const scalingModes: { value: ImageScalingMode; label: string; description: string }[] = [
    { value: "none", label: "None", description: "No scaling, image centered" },
    { value: "fit", label: "Fit", description: "Scale to fit with padding" },
    { value: "fit-with-border", label: "Fit with Border", description: "Fit with border around image" },
    { value: "cover", label: "Cover", description: "Scale to cover, may crop" },
    { value: "contain", label: "Contain", description: "Scale to fit, no upscaling" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Background Size</h3>
        {hasCustomSize && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs h-6 px-2"
          >
            Reset
          </Button>
        )}
      </div>

      {/* Preset Buttons */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground font-medium">
          App Store Presets
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <TooltipProvider key={preset.label}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePresetClick(preset)}
                    className={cn(
                      "text-xs",
                      effectiveWidth === preset.width &&
                        effectiveHeight === preset.height &&
                        "bg-primary/10 border-primary"
                    )}
                  >
                    {preset.label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs">macOS App Store requirement</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>

      {/* Custom Size Inputs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground font-medium">
            Custom Size
          </label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleLock}
                  className="size-6"
                >
                  {dimensions.aspectRatioLocked ? (
                    <Lock className="size-3" />
                  ) : (
                    <Unlock className="size-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {dimensions.aspectRatioLocked
                    ? "Aspect ratio locked (16:10)"
                    : "Aspect ratio unlocked"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">Width</div>
            <input
              type="number"
              value={inputWidth || ""}
              onChange={(e) => handleWidthInput(e.target.value)}
              placeholder="Auto"
              min={100}
              max={5000}
              className="w-full px-2 py-1.5 bg-secondary border border-border rounded text-sm text-card-foreground"
            />
          </div>
          <div className="pt-5 text-muted-foreground">×</div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">Height</div>
            <input
              type="number"
              value={inputHeight || ""}
              onChange={(e) => handleHeightInput(e.target.value)}
              placeholder="Auto"
              min={100}
              max={5000}
              className="w-full px-2 py-1.5 bg-secondary border border-border rounded text-sm text-card-foreground"
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Current: {effectiveWidth} × {effectiveHeight}px
          {(dimensions.width === 0 || dimensions.height === 0) && " (Auto)"}
        </div>
      </div>

      {/* Image Scaling Mode */}
      <div className="space-y-3">
        <label className="text-xs text-muted-foreground font-medium">
          Image Scaling
        </label>
        <div className="space-y-2">
          {scalingModes.map((mode) => (
            <div key={mode.value} className="flex items-center">
              <input
                type="radio"
                id={`scale-${mode.value}`}
                name="scaling-mode"
                value={mode.value}
                checked={imageScalingMode === mode.value}
                onChange={() => onScalingModeChange(mode.value)}
                className="size-3 rounded"
              />
              <label htmlFor={`scale-${mode.value}`} className="ml-2 flex-1 cursor-pointer">
                <div className="text-xs font-medium text-foreground">{mode.label}</div>
                <div className="text-xs text-muted-foreground">{mode.description}</div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Border Size (for fit-with-border mode) */}
      {imageScalingMode === "fit-with-border" && (
        <div className="space-y-3">
          <label className="text-xs text-muted-foreground font-medium">
            Border Size
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={inputBorderSize}
              onChange={(e) => handleBorderSizeInput(e.target.value)}
              min={0}
              max={100}
              className="w-full px-2 py-1.5 bg-secondary border border-border rounded text-sm text-card-foreground"
            />
            <div className="text-xs text-muted-foreground min-w-fit">px</div>
          </div>
          <div className="text-xs text-muted-foreground">
            White border around scaled image
          </div>
        </div>
      )}
    </div>
  );
});
