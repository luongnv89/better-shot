export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_CROP_SIZE = 20;

/**
 * Clamp a crop rect to stay inside image bounds and enforce minimum size.
 */
export function clampCropRect(
  rect: CropRect,
  imageWidth: number,
  imageHeight: number
): CropRect {
  // An image narrower or shorter than the minimum crop size cannot satisfy it;
  // bounds win over the minimum so the rect never leaves the image.
  const minWidth = Math.min(MIN_CROP_SIZE, imageWidth);
  const minHeight = Math.min(MIN_CROP_SIZE, imageHeight);
  let { x, y, width, height } = rect;
  width = Math.max(minWidth, Math.min(width, imageWidth));
  height = Math.max(minHeight, Math.min(height, imageHeight));
  x = Math.max(0, Math.min(x, imageWidth - width));
  y = Math.max(0, Math.min(y, imageHeight - height));
  // Re-clamp size if position adjustment pushed it out
  width = Math.min(width, imageWidth - x);
  height = Math.min(height, imageHeight - y);
  // Ensure min after clamping
  width = Math.max(minWidth, width);
  height = Math.max(minHeight, height);
  // Round the edges rather than the size, so rounding a fractional origin can
  // never push the far edge outside the image.
  const left = Math.round(x);
  const top = Math.round(y);
  return {
    x: left,
    y: top,
    width: Math.min(Math.round(x + width), imageWidth) - left,
    height: Math.min(Math.round(y + height), imageHeight) - top,
  };
}

export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

/**
 * Move or resize a crop rect by a delta expressed in image pixels.
 *
 * Resizing holds the edge opposite the dragged handle fixed, so dragging the
 * west or north handle past the image edge stops at the edge instead of pushing
 * the opposite edge outward. Moving keeps the size fixed and clamps the origin.
 */
export function transformCropRect(
  startCrop: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number
): CropRect {
  const minWidth = Math.min(MIN_CROP_SIZE, imageWidth);
  const minHeight = Math.min(MIN_CROP_SIZE, imageHeight);

  if (handle === "move") {
    const width = Math.min(startCrop.width, imageWidth);
    const height = Math.min(startCrop.height, imageHeight);
    return {
      x: Math.round(Math.max(0, Math.min(startCrop.x + dx, imageWidth - width))),
      y: Math.round(Math.max(0, Math.min(startCrop.y + dy, imageHeight - height))),
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  let left = startCrop.x;
  let right = startCrop.x + startCrop.width;
  let top = startCrop.y;
  let bottom = startCrop.y + startCrop.height;

  if (handle.includes("w")) {
    left = Math.max(0, Math.min(startCrop.x + dx, right - minWidth));
  } else if (handle.includes("e")) {
    right = Math.min(imageWidth, Math.max(right + dx, left + minWidth));
  }

  if (handle.includes("n")) {
    top = Math.max(0, Math.min(startCrop.y + dy, bottom - minHeight));
  } else if (handle.includes("s")) {
    bottom = Math.min(imageHeight, Math.max(bottom + dy, top + minHeight));
  }

  // Round the edges rather than the size, so a half-pixel origin can never push
  // the far edge one pixel outside the image.
  const x = Math.round(left);
  const y = Math.round(top);
  return { x, y, width: Math.round(right) - x, height: Math.round(bottom) - y };
}

/**
 * Apply a crop rect to an image and return a new HTMLImageElement.
 * The returned image's naturalWidth/Height will equal the crop size.
 */
export function applyCropToImage(
  image: HTMLImageElement,
  rect: CropRect
): Promise<HTMLImageElement> {
  const clamped = clampCropRect(rect, image.naturalWidth || image.width, image.naturalHeight || image.height);
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = clamped.width;
    canvas.height = clamped.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Failed to get canvas context for crop"));
      return;
    }
    try {
      ctx.drawImage(
        image,
        clamped.x,
        clamped.y,
        clamped.width,
        clamped.height,
        0,
        0,
        clamped.width,
        clamped.height
      );
      const dataUrl = canvas.toDataURL("image/png");
      const out = new Image();
      out.onload = () => resolve(out);
      out.onerror = () => reject(new Error("Failed to load cropped image"));
      out.src = dataUrl;
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * Create a full-size crop rect for an image.
 */
export function fullCropRect(image: HTMLImageElement): CropRect {
  return {
    x: 0,
    y: 0,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}
