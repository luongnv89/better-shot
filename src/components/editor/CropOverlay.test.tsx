import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CropOverlay } from "./CropOverlay";
import type { CropRect } from "@/lib/crop-utils";

// jsdom never loads image data, so naturalWidth/naturalHeight stay 0. The
// overlay falls back to width/height, which are settable here.
function makeImage(width = 1000, height = 800): HTMLImageElement {
  const img = new Image();
  img.width = width;
  img.height = height;
  return img;
}

const CROP: CropRect = { x: 100, y: 100, width: 400, height: 300 };

function renderOverlay() {
  const onCropChange = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(
    <CropOverlay
      image={makeImage()}
      crop={CROP}
      onCropChange={onCropChange}
      onCancel={onCancel}
    />
  );
  return { onCropChange, onCancel, container };
}

describe("CropOverlay — accessible names", () => {
  it("labels every resize handle in words rather than compass abbreviations", () => {
    renderOverlay();
    const expected = [
      "Resize top-left corner",
      "Resize top edge",
      "Resize top-right corner",
      "Resize right edge",
      "Resize bottom-right corner",
      "Resize bottom edge",
      "Resize bottom-left corner",
      "Resize left edge",
    ];
    for (const label of expected) {
      expect(screen.getByLabelText(new RegExp(label))).toBeInTheDocument();
    }
  });
});

describe("CropOverlay — keyboard access", () => {
  it("puts the crop area and all eight handles in the tab order", () => {
    const { container } = renderOverlay();
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(9);
  });

  it("focuses the crop area on mount so Escape works immediately", () => {
    renderOverlay();
    expect(screen.getByTestId("crop-area")).toHaveFocus();
  });

  it("moves the crop with an arrow key without changing its size", () => {
    const { onCropChange } = renderOverlay();
    fireEvent.keyDown(screen.getByTestId("crop-area"), { key: "ArrowRight" });
    expect(onCropChange).toHaveBeenCalledWith({ x: 110, y: 100, width: 400, height: 300 });
  });

  it("resizes instead of moving when Shift is held on the crop area", () => {
    const { onCropChange } = renderOverlay();
    fireEvent.keyDown(screen.getByTestId("crop-area"), { key: "ArrowRight", shiftKey: true });
    expect(onCropChange).toHaveBeenCalledWith({ x: 100, y: 100, width: 410, height: 300 });
  });

  it("moves only the focused handle's edge", () => {
    const { onCropChange } = renderOverlay();
    fireEvent.keyDown(screen.getByTestId("crop-handle-w"), { key: "ArrowLeft" });
    expect(onCropChange).toHaveBeenCalledWith({ x: 90, y: 100, width: 410, height: 300 });
  });

  it("cancels on Escape from a handle", () => {
    const { onCancel } = renderOverlay();
    fireEvent.keyDown(screen.getByTestId("crop-handle-se"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("leaves Tab alone so focus can still leave the overlay", () => {
    const { onCropChange, onCancel } = renderOverlay();
    fireEvent.keyDown(screen.getByTestId("crop-area"), { key: "Tab" });
    expect(onCropChange).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("CropOverlay — touch targets", () => {
  it("gives each handle a 44px hit area around a smaller visible square", () => {
    renderOverlay();
    const handle = screen.getByTestId("crop-handle-nw");
    expect(handle.style.width).toBe("44px");
    expect(handle.style.height).toBe("44px");
    const visual = handle.firstElementChild as HTMLElement;
    expect(visual.style.width).toBe("24px");
    expect(visual.style.pointerEvents).toBe("none");
  });
});
