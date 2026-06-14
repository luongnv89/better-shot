import { memo, useState, useCallback, useMemo, useEffect } from "react";
import { Lock, Unlock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CanvasDimensions, ImageScalingMode } from "@/stores/editorStore";
import { MACOS_PRESETS as PRESETS, IPHONE_PRESETS, type SizePreset } from "@/lib/size-presets";

interface BackgroundSizePanelProps {
  dimensions: CanvasDimensions;
  screenshotWidth: number;
  screenshotHeight: number;
  padding: number;
  imageScalingMode: ImageScalingMode;
  imageBorderSize: number;
  expanded?: boolean;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onAspectRatioLockedChange: (locked: boolean) => void;
  onPresetSelect: (width: number, height: number) => void;
  onScalingModeChange: (mode: ImageScalingMode) => void;
  onBorderSizeChange: (size: number) => void;
  onReset: () => void;
  onToggle?: () => void;
}

const scalingModes: { value: ImageScalingMode; label: string; desc: string }[] = [
  { value: "none",           label: "None",            desc: "Centered, no scale" },
  { value: "fit",            label: "Fit",             desc: "Fit with padding" },
  { value: "fit-with-border",label: "Fit + Border",    desc: "Fit with white border" },
  { value: "cover",          label: "Cover",           desc: "Fill, may crop" },
  { value: "contain",        label: "Contain",         desc: "Fit, no upscale" },
];

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

  useEffect(() => { setInputWidth(dimensions.width || 0); setInputHeight(dimensions.height || 0); }, [dimensions.width, dimensions.height]);
  useEffect(() => { setInputBorderSize(imageBorderSize); }, [imageBorderSize]);

  const autoDimensions = useMemo(() => ({
    width: screenshotWidth + padding * 2,
    height: screenshotHeight + padding * 2,
  }), [screenshotWidth, screenshotHeight, padding]);

  const effectiveWidth = dimensions.width || autoDimensions.width;
  const effectiveHeight = dimensions.height || autoDimensions.height;
  const hasCustomSize = dimensions.width > 0 || dimensions.height > 0;

  const handleReset = useCallback(() => { setInputWidth(0); setInputHeight(0); onReset(); }, [onReset]);
  const handleToggleLock = useCallback(() => { onAspectRatioLockedChange(!dimensions.aspectRatioLocked); }, [dimensions.aspectRatioLocked, onAspectRatioLockedChange]);

  const handlePresetClick = useCallback((preset: SizePreset) => {
    setInputWidth(preset.width);
    setInputHeight(preset.height);
    onPresetSelect(preset.width, preset.height);
  }, [onPresetSelect]);

  const handleWidthInput = useCallback((value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) { const c = Math.max(100, Math.min(5000, num)); setInputWidth(c); onWidthChange(c); }
  }, [onWidthChange]);

  const handleHeightInput = useCallback((value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) { const c = Math.max(100, Math.min(5000, num)); setInputHeight(c); onHeightChange(c); }
  }, [onHeightChange]);

  const handleBorderSizeInput = useCallback((value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) { const c = Math.max(0, Math.min(100, num)); setInputBorderSize(c); onBorderSizeChange(c); }
  }, [onBorderSizeChange]);

  return (
    <div>
      {/* macOS Presets */}
      <div className="section-header" style={{ paddingTop: 0 }}>
        <span className="section-title">macOS App Store</span>
      </div>
      <TooltipProvider delayDuration={400}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {PRESETS.map((preset) => {
            const isActive = effectiveWidth === preset.width && effectiveHeight === preset.height;
            return (
              <Tooltip key={preset.label}>
                <TooltipTrigger asChild>
                  <button onClick={() => handlePresetClick(preset)} className={cn("preset-chip", isActive && "active")}>
                    {preset.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{preset.tooltip}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* iPhone Presets */}
        <div className="section-header">
          <span className="section-title">iPhone</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {IPHONE_PRESETS.map((preset) => {
            const isActive = effectiveWidth === preset.width && effectiveHeight === preset.height;
            return (
              <Tooltip key={preset.label}>
                <TooltipTrigger asChild>
                  <button onClick={() => handlePresetClick(preset)} className={cn("preset-chip", isActive && "active")}>
                    {preset.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{preset.tooltip}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      <hr className="panel-divider" />

      {/* Custom size inputs */}
      <div className="section-header">
        <span className="section-title">Custom Size</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {hasCustomSize && (
            <button
              onClick={handleReset}
              style={{
                fontSize: 10, color: 'oklch(0.48 0.012 250)',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '2px 6px', borderRadius: 4,
              }}
            >
              Reset
            </button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleToggleLock}
                  style={{
                    color: dimensions.aspectRatioLocked ? 'oklch(0.65 0.18 255)' : 'oklch(0.42 0.009 250)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 3, borderRadius: 4,
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  {dimensions.aspectRatioLocked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                {dimensions.aspectRatioLocked ? "Aspect ratio locked" : "Aspect ratio unlocked"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'oklch(0.42 0.009 250)', marginBottom: 4 }}>W</div>
          <input
            type="number"
            value={inputWidth || ""}
            onChange={(e) => handleWidthInput(e.target.value)}
            placeholder="Auto"
            min={100} max={5000}
            className="studio-input"
          />
        </div>
        <div style={{ color: 'oklch(0.38 0.009 250)', fontSize: 12, paddingTop: 18, flexShrink: 0 }}>×</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'oklch(0.42 0.009 250)', marginBottom: 4 }}>H</div>
          <input
            type="number"
            value={inputHeight || ""}
            onChange={(e) => handleHeightInput(e.target.value)}
            placeholder="Auto"
            min={100} max={5000}
            className="studio-input"
          />
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'oklch(0.38 0.009 250)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
        Current: {effectiveWidth} × {effectiveHeight}
        {!hasCustomSize && " (auto)"}
      </div>

      <hr className="panel-divider" />

      {/* Scaling mode */}
      <div className="section-header">
        <span className="section-title">Image Scaling</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
        {scalingModes.map((mode) => (
          <button
            key={mode.value}
            onClick={() => onScalingModeChange(mode.value)}
            className={cn("mode-btn", imageScalingMode === mode.value && "active")}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              border: '1.5px solid',
              borderColor: imageScalingMode === mode.value ? 'oklch(0.65 0.18 255)' : 'oklch(0.38 0.009 250)',
              background: imageScalingMode === mode.value ? 'oklch(0.65 0.18 255)' : 'transparent',
            }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{mode.label}</div>
              <div style={{ fontSize: 10, opacity: 0.6 }}>{mode.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Border size for fit-with-border */}
      {imageScalingMode === "fit-with-border" && (
        <>
          <div className="section-header">
            <span className="section-title">Border Size</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              value={inputBorderSize}
              onChange={(e) => handleBorderSizeInput(e.target.value)}
              min={0} max={100}
              className="studio-input"
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: 'oklch(0.42 0.009 250)', flexShrink: 0 }}>px</span>
          </div>
        </>
      )}
    </div>
  );
});
