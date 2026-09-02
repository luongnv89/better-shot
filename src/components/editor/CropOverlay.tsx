import { useCallback, useRef, useState, useEffect } from "react";
import type { CropRect, CropHandle } from "@/lib/crop-utils";
import { clampCropRect, transformCropRect } from "@/lib/crop-utils";

type Handle = CropHandle;

// Visible handle square, plus the larger transparent square that receives
// pointer/touch input so every handle meets the 44px minimum touch target.
const HANDLE_VISUAL_SIZE = 24;
const HANDLE_HIT_SIZE = 44;

// Keyboard step in image pixels. Alt gives single-pixel precision.
const KEY_STEP = 10;
const KEY_STEP_FINE = 1;

const HANDLE_LABELS: Record<Handle, string> = {
  nw: "Resize top-left corner",
  n: "Resize top edge",
  ne: "Resize top-right corner",
  e: "Resize right edge",
  se: "Resize bottom-right corner",
  s: "Resize bottom edge",
  sw: "Resize bottom-left corner",
  w: "Resize left edge",
  move: "Crop area",
};

interface CropOverlayProps {
  image: HTMLImageElement;
  crop: CropRect;
  onCropChange: (crop: CropRect) => void;
  onCropChangeEnd?: (crop: CropRect) => void;
  /** Called when the user presses Escape while the overlay has focus. */
  onCancel?: () => void;
}

export function CropOverlay({ image, crop, onCropChange, onCropChangeEnd, onCancel }: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: Handle; startCrop: CropRect; startX: number; startY: number } | null>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);
  const [focused, setFocused] = useState<Handle | null>(null);

  const imgW = image.naturalWidth || image.width;
  const imgH = image.naturalHeight || image.height;

  // Convert crop rect (image pixels) <-> display coords is handled by parent scaling;
  // This overlay renders inside a container sized to the displayed image, so we use percentage.
  const toPercent = useCallback(
    (c: CropRect) => ({
      left: (c.x / imgW) * 100,
      top: (c.y / imgH) * 100,
      width: (c.width / imgW) * 100,
      height: (c.height / imgH) * 100,
    }),
    [imgW, imgH]
  );

  const percent = toPercent(crop);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, handle: Handle) => {
      e.preventDefault();
      // currentTarget, not target: the visible square inside a handle's hit area
      // would otherwise capture the pointer.
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        handle,
        startCrop: { ...crop },
        startX: e.clientX,
        startY: e.clientY,
      };
      setDragging(handle);
    },
    [crop]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const { handle, startCrop, startX, startY } = dragRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      // delta in image pixels
      const dx = ((e.clientX - startX) / rect.width) * imgW;
      const dy = ((e.clientY - startY) / rect.height) * imgH;
      onCropChange(transformCropRect(startCrop, handle, dx, dy, imgW, imgH));
    },
    [imgW, imgH, onCropChange]
  );

  const handlePointerUp = useCallback(
    () => {
      if (dragRef.current) {
        const c = clampCropRect(crop, imgW, imgH);
        onCropChangeEnd?.(c);
      }
      dragRef.current = null;
      setDragging(null);
    },
    [crop, imgW, imgH, onCropChangeEnd]
  );

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging, handlePointerMove, handlePointerUp]);

  // Focus the crop area when crop mode opens, so Escape and the arrow keys work
  // without the user first clicking or tabbing into the overlay. The button that
  // opened crop mode is unmounted, so focus would otherwise fall to the body.
  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  // Keyboard control. On the crop area, arrows move it and Shift+arrows resize
  // it from the bottom-right corner. On a handle, arrows move that handle's
  // edge. Escape cancels cropping from anywhere in the overlay.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, handle: Handle) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
        return;
      }
      let dx = 0;
      let dy = 0;
      const step = e.altKey ? KEY_STEP_FINE : KEY_STEP;
      switch (e.key) {
        case "ArrowLeft": dx = -step; break;
        case "ArrowRight": dx = step; break;
        case "ArrowUp": dy = -step; break;
        case "ArrowDown": dy = step; break;
        default: return; // never swallow Tab or any other key
      }
      e.preventDefault();
      // Shift on the crop area resizes instead of moving, by dragging the
      // bottom-right corner.
      const effective: Handle = handle === "move" && e.shiftKey ? "se" : handle;
      const next = transformCropRect(crop, effective, dx, dy, imgW, imgH);
      onCropChange(next);
      onCropChangeEnd?.(next);
    },
    [crop, imgW, imgH, onCropChange, onCropChangeEnd, onCancel]
  );

  const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  const focusRing = (handle: Handle): React.CSSProperties =>
    focused === handle ? { outline: "2px solid oklch(0.92 0.05 142)", outlineOffset: 2 } : {};

  return (
    <div
      ref={containerRef}
      data-testid="crop-overlay"
      style={{
        position: "absolute",
        inset: 0,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {/* Dim outside crop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${percent.left}% ${percent.top}%, ${percent.left}% ${percent.top + percent.height}%, ${percent.left + percent.width}% ${percent.top + percent.height}%, ${percent.left + percent.width}% ${percent.top}%, ${percent.left}% ${percent.top}%)`,
          pointerEvents: "none",
        }}
      />
      {/* Crop rect border + draggable area */}
      <div
        ref={areaRef}
        onPointerDown={(e) => handlePointerDown(e, "move")}
        onKeyDown={(e) => handleKeyDown(e, "move")}
        onFocus={() => setFocused("move")}
        onBlur={() => setFocused((prev) => (prev === "move" ? null : prev))}
        tabIndex={0}
        // Focusable group rather than a button: Enter and Space activate nothing
        // here, the arrow keys and Escape do the work.
        role="group"
        data-testid="crop-area"
        style={{
          position: "absolute",
          left: `${percent.left}%`,
          top: `${percent.top}%`,
          width: `${percent.width}%`,
          height: `${percent.height}%`,
          border: "2px solid oklch(0.72 0.18 142)",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
          cursor: dragging ? "grabbing" : "move",
          boxSizing: "border-box",
          ...focusRing("move"),
        }}
        aria-label="Crop area — drag to move, arrow keys to move, Shift plus arrow keys to resize, Escape to cancel"
      >
        {/* Grid thirds */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.25) 1px, transparent 1px)",
            backgroundSize: "33.33% 100%, 100% 33.33%",
            pointerEvents: "none",
            opacity: 0.6,
          }}
        />
      </div>

      {/* Handles */}
      {handles.map((h) => {
        const pos: React.CSSProperties = {};
        if (h.includes("n")) pos.top = `${percent.top}%`;
        if (h.includes("s")) pos.top = `${percent.top + percent.height}%`;
        if (!h.includes("n") && !h.includes("s")) pos.top = `${percent.top + percent.height / 2}%`;
        if (h.includes("w")) pos.left = `${percent.left}%`;
        if (h.includes("e")) pos.left = `${percent.left + percent.width}%`;
        if (!h.includes("w") && !h.includes("e")) pos.left = `${percent.left + percent.width / 2}%`;

        const cursorMap: Record<Handle, string> = {
          nw: "nwse-resize",
          n: "ns-resize",
          ne: "nesw-resize",
          e: "ew-resize",
          se: "nwse-resize",
          s: "ns-resize",
          sw: "nesw-resize",
          w: "ew-resize",
          move: "move",
        };

        return (
          <div
            key={h}
            onPointerDown={(e) => handlePointerDown(e, h)}
            onKeyDown={(e) => handleKeyDown(e, h)}
            onFocus={() => setFocused(h)}
            onBlur={() => setFocused((prev) => (prev === h ? null : prev))}
            tabIndex={0}
            role="group"
            data-testid={`crop-handle-${h}`}
            aria-label={`${HANDLE_LABELS[h]} — arrow keys to adjust, Escape to cancel`}
            style={{
              position: "absolute",
              // Transparent hit area keeps the touch target at 44px while the
              // visible handle stays small enough not to cover the image.
              width: HANDLE_HIT_SIZE,
              height: HANDLE_HIT_SIZE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              transform: "translate(-50%, -50%)",
              cursor: cursorMap[h],
              touchAction: "none",
              ...focusRing(h),
              ...pos,
            }}
          >
            <div
              style={{
                width: HANDLE_VISUAL_SIZE,
                height: HANDLE_VISUAL_SIZE,
                background: "oklch(0.72 0.18 142)",
                border: "2px solid white",
                borderRadius: 4,
                boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                pointerEvents: "none",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
