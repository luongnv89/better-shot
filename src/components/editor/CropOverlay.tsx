import { useCallback, useRef, useState, useEffect } from "react";
import type { CropRect } from "@/lib/crop-utils";
import { clampCropRect } from "@/lib/crop-utils";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

interface CropOverlayProps {
  image: HTMLImageElement;
  crop: CropRect;
  onCropChange: (crop: CropRect) => void;
  onCropChangeEnd?: (crop: CropRect) => void;
}

export function CropOverlay({ image, crop, onCropChange, onCropChangeEnd }: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: Handle; startCrop: CropRect; startX: number; startY: number } | null>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);

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
      (e.target as Element).setPointerCapture(e.pointerId);
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

      let next: CropRect = { ...startCrop };

      if (handle === "move") {
        next.x = startCrop.x + dx;
        next.y = startCrop.y + dy;
      } else {
        if (handle.includes("w")) {
          next.x = startCrop.x + dx;
          next.width = startCrop.width - dx;
        }
        if (handle.includes("e")) {
          next.width = startCrop.width + dx;
        }
        if (handle.includes("n")) {
          next.y = startCrop.y + dy;
          next.height = startCrop.height - dy;
        }
        if (handle.includes("s")) {
          next.height = startCrop.height + dy;
        }
      }

      // Clamp handles where width/height could go negative — normalize
      if (next.width < 20) {
        if (handle.includes("w")) next.x = startCrop.x + startCrop.width - 20;
        next.width = 20;
      }
      if (next.height < 20) {
        if (handle.includes("n")) next.y = startCrop.y + startCrop.height - 20;
        next.height = 20;
      }

      next = clampCropRect(next, imgW, imgH);
      onCropChange(next);
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

  const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

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
        onPointerDown={(e) => handlePointerDown(e, "move")}
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
        }}
        aria-label="Crop area — drag to move, drag handles to resize"
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
            data-testid={`crop-handle-${h}`}
            aria-label={`Resize ${h}`}
            style={{
              position: "absolute",
              width: 12,
              height: 12,
              background: "oklch(0.72 0.18 142)",
              border: "2px solid white",
              borderRadius: 2,
              transform: "translate(-50%, -50%)",
              cursor: cursorMap[h],
              boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
              ...pos,
            }}
          />
        );
      })}
    </div>
  );
}
