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
  let { x, y, width, height } = rect;
  width = Math.max(MIN_CROP_SIZE, Math.min(width, imageWidth));
  height = Math.max(MIN_CROP_SIZE, Math.min(height, imageHeight));
  x = Math.max(0, Math.min(x, imageWidth - width));
  y = Math.max(0, Math.min(y, imageHeight - height));
  // Re-clamp size if position adjustment pushed it out
  width = Math.min(width, imageWidth - x);
  height = Math.min(height, imageHeight - y);
  // Ensure min after clamping
  width = Math.max(MIN_CROP_SIZE, width);
  height = Math.max(MIN_CROP_SIZE, height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
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
