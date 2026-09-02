import { useState, useRef, useEffect, useCallback } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import {
  Copy, Loader2, Redo2, Undo2,
  Circle, Square, Minus, ArrowUpRight, Type, Hash, MousePointer2, Scan, Trash2,
  Palette, Layers, Maximize2, Move, Settings2, Image as ImageIcon, X, RotateCcw,
  PanelLeftClose, PanelLeftOpen, Upload, Crop as CropIcon, Check, Ban,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { BackgroundSelector, gradientOptions } from "./editor/BackgroundSelector";
import { AssetGrid } from "./editor/AssetGrid";
import { EffectsPanel } from "./editor/EffectsPanel";
import { FrameSelector } from "./editor/FrameSelector";
import { SideBySidePanel } from "./editor/SideBySidePanel";
import { CaptureHistoryPicker } from "./editor/CaptureHistoryPicker";
import { ImageRoundnessControl } from "./editor/ImageRoundnessControl";
import { AnnotationCanvas } from "./editor/AnnotationCanvas";
import { PropertiesPanel } from "./editor/PropertiesPanel";
import { BackgroundSizePanel } from "./editor/BackgroundSizePanel";
import { ImagePositionPanel } from "./editor/ImagePositionPanel";
import { ExportSettingsPanel } from "./editor/ExportSettingsPanel";
import { Annotation, ToolType } from "@/types/annotations";
import { usePreviewGenerator } from "@/hooks/usePreviewGenerator";
import { assetCategories } from "@/hooks/useEditorSettings";
import { CropOverlay } from "./editor/CropOverlay";
import { applyCropToImage, fullCropRect, type CropRect } from "@/lib/crop-utils";
import { selectSideBySideSecondEntry } from "@/lib/side-by-side-utils";
import { useCaptureHistoryEntries, type CaptureHistoryEntry } from "@/stores/captureHistoryStore";
import { Store } from "@tauri-apps/plugin-store";
import {
  useSettings,
  useAnnotations,
  useCanUndo,
  useCanRedo,
  useUploadedBackgroundImages,
  editorActions,
  clearPersistedEditorSettings,
  useEditorStore,
} from "@/stores";

interface ImageEditorProps {
  imagePath: string;
  onSave: (editedImageData: string, filenameOverride?: string) => void;
  onCancel: () => void;
  saveDir: string;
  onSaveDirChange: (value: string) => void;
  /**
   * On-disk capture path to apply as Image 2 in side-by-side mode (queued from
   * the capture-history "Compare side-by-side" action). Applied once the editor
   * store has initialized, then cleared via onSideBySideSecondPathConsumed.
   */
  pendingSideBySideSecondPath?: string | null;
  onSideBySideSecondPathConsumed?: () => void;
}

type SidebarTab = "image" | "background" | "effects" | "size" | "position" | "export" | "annotation";

const annotationTools: Array<{ type: ToolType; icon: React.ReactNode; label: string; shortcut?: string }> = [
  { type: "select",    icon: <MousePointer2 className="size-[15px]" />, label: "Select",    shortcut: "V" },
  { type: "circle",   icon: <Circle className="size-[15px]" />,        label: "Circle",    shortcut: "C" },
  { type: "rectangle",icon: <Square className="size-[15px]" />,        label: "Rectangle", shortcut: "R" },
  { type: "line",     icon: <Minus className="size-[15px]" />,         label: "Line",      shortcut: "L" },
  { type: "arrow",    icon: <ArrowUpRight className="size-[15px]" />,  label: "Arrow",     shortcut: "A" },
  { type: "number",   icon: <Hash className="size-[15px]" />,          label: "Number",    shortcut: "N" },
  { type: "text",     icon: <Type className="size-[15px]" />,          label: "Text",      shortcut: "T" },
  { type: "blur",     icon: <Scan className="size-[15px]" />,          label: "Blur",      shortcut: "B" },
];

const sidebarTabs: Array<{ id: SidebarTab; icon: React.ReactNode; label: string }> = [
  { id: "image",      icon: <ImageIcon className="size-4" />,      label: "Image" },
  { id: "background", icon: <Palette className="size-4" />,    label: "BG" },
  { id: "effects",    icon: <Layers className="size-4" />,     label: "Effects" },
  { id: "size",       icon: <Maximize2 className="size-4" />,  label: "Size" },
  { id: "position",   icon: <Move className="size-4" />,       label: "Position" },
  { id: "export",     icon: <Settings2 className="size-4" />,  label: "Export" },
];

export function ImageEditor({
  imagePath,
  onSave,
  onCancel,
  saveDir,
  onSaveDirChange,
  pendingSideBySideSecondPath = null,
  onSideBySideSecondPathConsumed,
}: ImageEditorProps) {
  const settings = useSettings();
  const annotations = useAnnotations();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const uploadedBackgroundImages = useUploadedBackgroundImages();
  const actions = editorActions;

  const [screenshotImage, setScreenshotImage] = useState<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [tempDir, setTempDir] = useState<string>("/private/tmp");
  const [exportName, setExportName] = useState<string>("");
  const [isResettingConfig, setIsResettingConfig] = useState(false);

  const [selectedTool, setSelectedTool] = useState<ToolType>("select");
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("image");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  // Crop state
  const [isCropping, setIsCropping] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);
  // Ref for the synchronous guard in handleApplyCrop — avoids stale closure
  // values when the user clicks Apply twice in rapid succession.
  const applyingCropRef = useRef(false);
  // Bumped whenever screenshotImage is replaced or a crop session ends, so an
  // in-flight crop can tell that its source image is no longer the live one.
  const imageGenerationRef = useRef(0);
  const sideBySideSplitRatio = useEditorStore((s) => s.settings.sideBySideSplitRatio);
  const setSideBySideSplitRatio = useEditorStore((s) => s.setSideBySideSplitRatio);
  const storeInitialized = useEditorStore((s) => s._isInitialized);

  // If annotation selected, auto-show annotation tab info
  const [, setShowAnnotationPanel] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { previewUrl, error: previewError, renderHighQualityCanvas } = usePreviewGenerator({
    screenshotImage,
    settings,
    canvasRef,
    padding: settings.padding,
    splitRatio: sideBySideSplitRatio,
  });

  const error = loadError || previewError;

  useEffect(() => { editorActions.initialize(); }, []);
  useEffect(() => { editorActions.reset(); editorActions.initialize(); }, [imagePath]);

  useEffect(() => {
    const restoreWindowState = async () => {
      try {
        const appWindow = getCurrentWindow();
        await Promise.all([
          appWindow.setFullscreen(false),
          appWindow.setAlwaysOnTop(false),
        ]);
        await appWindow.setDecorations(true);
      } catch (err) {
        console.error("Failed to restore window decorations:", err);
      }
    };
    restoreWindowState();
    invoke<string>("get_temp_directory")
      .then((dir) => setTempDir(dir))
      .catch((err) => console.error("Failed to get temp directory:", err));
  }, []);

  useEffect(() => {
    setLoadError(null);
    setImageLoaded(false);
    setScreenshotImage(null);
    // Crop state belongs to the outgoing image: a stale originalImage would let
    // Reset Crop overwrite the new capture with an unrelated earlier one.
    imageGenerationRef.current += 1;
    setIsCropping(false);
    setCropRect(null);
    setOriginalImage(null);
    setIsApplyingCrop(false);
    if (!imagePath) { setLoadError("No image path provided"); return; }
    const img = new Image();
    img.onload = () => {
      setScreenshotImage(img);
      setImageLoaded(true);
      const avgDimension = (img.width + img.height) / 2;
      const defaultPadding = Math.min(Math.round(avgDimension * 0.05), 200);
      actions.setPaddingTransient(defaultPadding);
    };
    img.onerror = () => { setLoadError(`Failed to load image from: ${imagePath}`); };
    const assetUrl = convertFileSrc(imagePath);
    img.crossOrigin = "anonymous";
    img.src = assetUrl;
    return () => { img.onload = null; img.onerror = null; };
  }, [imagePath, actions]);

  const handleSave = useCallback(async () => {
    if (!screenshotImage || isSaving || isCopying) return;
    setIsSaving(true);
    try {
      const highQualityCanvas = await renderHighQualityCanvas(annotations);
      if (!highQualityCanvas) { setIsSaving(false); return; }
      highQualityCanvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            onSave(reader.result as string, exportName.trim() !== "" ? exportName.trim() : undefined);
            setIsSaving(false);
          };
          reader.onerror = () => { setLoadError("Failed to read image data"); setIsSaving(false); };
          reader.readAsDataURL(blob);
        } else { setIsSaving(false); }
      }, "image/png", 1.0);
    } catch (err) {
      setLoadError(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
      setIsSaving(false);
    }
  }, [screenshotImage, annotations, renderHighQualityCanvas, onSave, isSaving, isCopying, exportName]);

  const handleCopy = useCallback(async () => {
    if (!screenshotImage || isSaving || isCopying) return;
    setIsCopying(true);
    try {
      const highQualityCanvas = await renderHighQualityCanvas(annotations);
      if (!highQualityCanvas) { setIsCopying(false); return; }
      const dataUrl = highQualityCanvas.toDataURL("image/png");
      await invoke<string>("save_edited_image", {
        imageData: dataUrl, saveDir: tempDir, copyToClip: true, prefix: "bettershot",
      });
      toast.success("Copied to clipboard", { duration: 2000 });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setLoadError(`Failed to copy: ${errorMessage}`);
      toast.error("Failed to copy", { description: errorMessage, duration: 3000 });
    } finally { setIsCopying(false); }
  }, [screenshotImage, annotations, renderHighQualityCanvas, isSaving, isCopying, tempDir]);

  const handleBrowseSaveDir = useCallback(async () => {
    try {
      const selectedPath = await invoke<string | null>("select_directory_dialog", { defaultPath: saveDir || undefined });
      if (selectedPath) onSaveDirChange(selectedPath);
    } catch (err) {
      console.error("Failed to open directory picker:", err);
      toast.error("Unable to open directory picker");
    }
  }, [saveDir, onSaveDirChange]);

  const firstImageFileInputRef = useRef<HTMLInputElement>(null);
  const [isFirstImageDragActive, setIsFirstImageDragActive] = useState(false);

  // Load an arbitrary image source (data URL or asset:// URL) into the editor as
  // Image 1. Image 1 lives in local state, so this is safe regardless of the
  // store reset that fires on imagePath change.
  const applyFirstImage = useCallback((src: string, successMessage: string) => {
    // Discard crop state for the image being replaced (see the imagePath effect).
    imageGenerationRef.current += 1;
    setIsCropping(false);
    setCropRect(null);
    setOriginalImage(null);
    setIsApplyingCrop(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setScreenshotImage(img);
      setImageLoaded(true);
      setLoadError(null);
      const avgDimension = (img.width + img.height) / 2;
      const defaultPadding = Math.min(Math.round(avgDimension * 0.05), 200);
      editorActions.setPaddingTransient(defaultPadding);
      toast.success(successMessage);
    };
    img.onerror = () => toast.error("Failed to load image");
    img.src = src;
  }, []);

  const handleFirstImageUpload = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      applyFirstImage(reader.result as string, "Image 1 replaced");
    };
    reader.onerror = () => toast.error("Failed to read image file");
    reader.readAsDataURL(file);
  }, [applyFirstImage]);

  const openFirstImagePicker = useCallback(() => {
    firstImageFileInputRef.current?.click();
  }, []);

  const handleFirstImageFileInput = useCallback((file: File | undefined) => {
    if (file) handleFirstImageUpload(file);
  }, [handleFirstImageUpload]);

  const handleFirstImageDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsFirstImageDragActive(false);
    handleFirstImageFileInput(event.dataTransfer.files?.[0]);
  }, [handleFirstImageFileInput]);

  const handleFirstImageDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsFirstImageDragActive(true);
  }, []);

  const handleFirstImageDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsFirstImageDragActive(false);
    }
  }, []);

  const secondImageFileInputRef = useRef<HTMLInputElement>(null);
  const [isSecondImageDragActive, setIsSecondImageDragActive] = useState(false);

  const handleSecondImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      editorActions.handleSecondImageSelect(dataUrl);
      toast.success("Second image added");
    };
    reader.onerror = () => toast.error("Failed to read image file");
    reader.readAsDataURL(file);
  }, []);

  const openSecondImagePicker = useCallback(() => {
    secondImageFileInputRef.current?.click();
  }, []);

  const handleSecondImageFileInput = useCallback((file: File | undefined) => {
    if (file) handleSecondImageUpload(file);
  }, [handleSecondImageUpload]);

  const handleSecondImageDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsSecondImageDragActive(false);
    handleSecondImageFileInput(event.dataTransfer.files?.[0]);
  }, [handleSecondImageFileInput]);

  const handleSecondImageDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsSecondImageDragActive(true);
  }, []);

  const handleSecondImageDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsSecondImageDragActive(false);
    }
  }, []);

  // Swap Image 1 and Image 2 in side-by-side mode.
  //
  // The two slots have different lifecycles: Image 1 is component-local
  // (screenshotImage) and never persisted, while Image 2 (selectedImageSrc2)
  // is store-backed. To exchange them we (1) snapshot the old Image 2 src,
  // (2) render the *already-loaded* Image 1 element to a canvas to capture its
  // pixels as a data URL — we draw the element rather than reloading its .src
  // because that src may be an asset:// URL, which the CSP blocks for fetch and
  // which does not round-trip through the asset registry as a data URL,
  // (3) load old Image 2 into Image 1 via applyFirstImage, and (4) write old
  // Image 1 into Image 2 with updateSettingsTransient.
  //
  // updateSettingsTransient (not handleSecondImageSelect) is deliberate: it
  // updates selectedImageSrc2 in memory without pushing a history snapshot or
  // persisting. This keeps the swap session-scoped — matching how "replace
  // Image 1" already behaves — and avoids corrupting undo (which cannot restore
  // the component-local Image 1) or leaving the two slots inconsistent after a
  // reload that reverts Image 1 to imagePath.
  const handleSwapImages = useCallback(() => {
    if (!screenshotImage || !settings.selectedImageSrc2) return;
    const oldImage2 = settings.selectedImageSrc2;
    let oldImage1: string;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = screenshotImage.naturalWidth;
      canvas.height = screenshotImage.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");
      ctx.drawImage(screenshotImage, 0, 0);
      oldImage1 = canvas.toDataURL("image/png");
    } catch (err) {
      console.error("Failed to capture Image 1 for swap:", err);
      toast.error("Failed to swap images");
      return;
    }
    applyFirstImage(oldImage2, "Images swapped");
    editorActions.updateSettingsTransient({ selectedImageSrc2: oldImage1 });
  }, [screenshotImage, settings.selectedImageSrc2, applyFirstImage]);

  // ── Pick from capture history (side-by-side) ──
  // Which slot the inline history picker is targeting (null = closed).
  const captureHistoryEntries = useCaptureHistoryEntries();
  const [historyPickerTarget, setHistoryPickerTarget] = useState<"first" | "second" | null>(null);

  // Read a full-resolution on-disk capture into a data URL. We deliberately use
  // the full-res savedPath (not a downscaled thumbnail) and convert to a data URL
  // because Image 2 (selectedImageSrc2) is persisted, and only data URLs
  // round-trip through the asset registry (asset:// URLs do not).
  //
  // We load via <img src=convertFileSrc(...)> and draw to a canvas rather than
  // fetch(). The CSP allows the asset protocol in img-src but NOT in connect-src,
  // so fetch() of an asset URL is blocked — the img+canvas path is what the
  // capture-open and save/copy flows already use successfully.
  const pathToDataUrl = useCallback((savedPath: string): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        try {
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Failed to encode capture"));
        }
      };
      img.onerror = () => reject(new Error("Failed to load capture"));
      img.src = convertFileSrc(savedPath);
    });
  }, []);

  const handlePickFromHistory = useCallback(async (entry: CaptureHistoryEntry) => {
    const target = historyPickerTarget;
    setHistoryPickerTarget(null);
    if (!target) return;
    try {
      const dataUrl = await pathToDataUrl(entry.savedPath);
      if (target === "first") {
        applyFirstImage(dataUrl, "Image 1 set from history");
      } else {
        editorActions.handleSecondImageSelect(dataUrl);
        toast.success("Image 2 set from history");
      }
    } catch (err) {
      console.error("Failed to load capture from history:", err);
      toast.error("Failed to load capture");
    }
  }, [historyPickerTarget, pathToDataUrl, applyFirstImage]);

  // Apply a capture queued from the gallery's "Compare side-by-side" action as
  // Image 2. Gated on store initialization because opening the editor fires
  // reset()+initialize() on imagePath change — applying before init completes
  // would be wiped by the rehydrate. We also switch the frame to side-by-side.
  useEffect(() => {
    if (!storeInitialized || !pendingSideBySideSecondPath) return;
    let cancelled = false;
    (async () => {
      try {
        const dataUrl = await pathToDataUrl(pendingSideBySideSecondPath);
        if (cancelled) return;
        useEditorStore.getState().updateSettings({
          frameType: "side-by-side",
          selectedImageSrc2: dataUrl,
        });
      } catch (err) {
        console.error("Failed to load side-by-side capture:", err);
        toast.error("Failed to load second image");
      } finally {
        if (!cancelled) onSideBySideSecondPathConsumed?.();
      }
    })();
    return () => { cancelled = true; };
  }, [storeInitialized, pendingSideBySideSecondPath, pathToDataUrl, onSideBySideSecondPathConsumed]);

  // When the user selects side-by-side frame, fill Image 2 with the most
  // recent capture that differs from the current Image 1. Only runs once per
  // side-by-side session (reset when leaving the frame) so a
  // manual "Remove Image 2" is not immediately undone, but still handles the
  // case where capture history hydrates after the frame was already selected.
  const hasAutoLoadedSideBySideRef = useRef(false);
  // Status live region so the auto-fill result is announced to screen readers.
  const [secondImageAnnouncement, setSecondImageAnnouncement] = useState("");
  useEffect(() => {
    const currentFrameType = settings.frameType;
    const hadImage2 = Boolean(settings.selectedImageSrc2);

    if (currentFrameType !== "side-by-side") {
      hasAutoLoadedSideBySideRef.current = false;
      return;
    }

    // Inside side-by-side
    if (settings.selectedImageSrc2) {
      hasAutoLoadedSideBySideRef.current = true;
      return;
    }
    if (hasAutoLoadedSideBySideRef.current) return;
    if (!storeInitialized) return;
    // If the pending gallery path is still queued, let that effect win.
    if (pendingSideBySideSecondPath) return;
    if (captureHistoryEntries.length === 0) return;

    // Mark attempted so we don't loop if the async load is slow and deps re-fire.
    // hasAutoLoadedSideBySideRef ensures a manual "Remove Image 2" is not immediately re-filled.
    hasAutoLoadedSideBySideRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const secondEntry = selectSideBySideSecondEntry(imagePath, captureHistoryEntries);
        if (cancelled) return;

        if (secondEntry) {
          const dataUrl2 = await pathToDataUrl(secondEntry.savedPath);
          if (cancelled) return;
          editorActions.handleSecondImageSelect(dataUrl2);
          setSecondImageAnnouncement("Image 2 loaded from last capture");
        }
      } catch (err) {
        console.error("Failed to auto-load side-by-side captures:", err);
        // Allow retry on next transition
        hasAutoLoadedSideBySideRef.current = false;
        toast.error("Failed to load last capture");
      }
    })();

    return () => {
      cancelled = true;
      // Release the guard when the cancelled load produced no image yet, so a
      // dep-change or StrictMode remount can retry. A manual "Remove Image 2"
      // keeps the latch (hadImage2 was true) and no unwanted refill occurs.
      if (!hadImage2) hasAutoLoadedSideBySideRef.current = false;
    };
  }, [
    storeInitialized,
    settings.frameType,
    settings.selectedImageSrc2,
    captureHistoryEntries,
    imagePath,
    pendingSideBySideSecondPath,
    pathToDataUrl,
  ]);

  const handleBackgroundUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      const updated = [...uploadedBackgroundImages, dataUrl];
      editorActions.setUploadedBackgroundImages(updated);
      try {
        const store = await Store.load("settings.json");
        await store.set("uploadedBackgroundImages", updated);
        await store.save();
        toast.success("Image uploaded");
      } catch (err) {
        console.error("Failed to save uploaded image:", err);
        toast.error("Failed to save uploaded image");
      }
    };
    reader.onerror = () => toast.error("Failed to read image file");
    reader.readAsDataURL(file);
  }, [uploadedBackgroundImages]);

  const handleResetToDefaults = useCallback(async () => {
    if (isResettingConfig) return;
    setIsResettingConfig(true);
    try {
      const cleared = await clearPersistedEditorSettings();
      if (!cleared) throw new Error("Unable to clear saved configuration");
      actions.reset();
      await actions.initialize();
      toast.success("Reset to defaults");
    } catch (err) {
      console.error("Failed to reset configuration:", err);
      toast.error("Unable to reset configuration");
    } finally { setIsResettingConfig(false); }
  }, [actions, isResettingConfig]);

  // ── Crop handlers ──
  const handleEnterCrop = useCallback(() => {
    if (!screenshotImage) {
      toast.error("No image to crop");
      return;
    }
    setCropRect(fullCropRect(screenshotImage));
    setIsCropping(true);
  }, [screenshotImage]);

  const handleCancelCrop = useCallback(() => {
    imageGenerationRef.current += 1;
    setIsCropping(false);
    setCropRect(null);
    setIsApplyingCrop(false);
  }, []);

  const handleResetCrop = useCallback(() => {
    if (!originalImage) {
      toast.error("No original image to restore");
      return;
    }
    imageGenerationRef.current += 1;
    setScreenshotImage(originalImage);
    setImageLoaded(true);
    setOriginalImage(null);
    setIsCropping(false);
    setCropRect(null);
    setIsApplyingCrop(false);
    // Annotations added after the crop use the cropped geometry, so they cannot
    // be remapped onto the restored original. Cleared unconditionally so
    // undo/redo cannot bring stale ones back.
    actions.clearAnnotationsForImageChange();
    setSelectedAnnotation(null);
    setShowAnnotationPanel(false);
    toast.success("Crop reset — original restored");
  }, [originalImage, actions]);

  const handleApplyCrop = useCallback(async () => {
    if (!screenshotImage || !cropRect || applyingCropRef.current) return;
    // Skip if crop is full image
    const full = fullCropRect(screenshotImage);
    if (
      cropRect.x === 0 &&
      cropRect.y === 0 &&
      cropRect.width === full.width &&
      cropRect.height === full.height
    ) {
      setIsCropping(false);
      setCropRect(null);
      toast.info("No crop applied — selection is the full image");
      return;
    }
    // The image can be replaced (new capture, upload, swap, reset) while the
    // crop renders. Snapshot the generation and discard a result whose source
    // image is no longer the live one.
    const generation = imageGenerationRef.current;
    const source = screenshotImage;
    applyingCropRef.current = true;
    setIsApplyingCrop(true);
    try {
      const cropped = await applyCropToImage(source, cropRect);
      if (imageGenerationRef.current !== generation) return;
      setOriginalImage((prev) => prev ?? source);
      setScreenshotImage(cropped);
      setImageLoaded(true);
      const avgDimension = (cropped.width + cropped.height) / 2;
      const defaultPadding = Math.min(Math.round(avgDimension * 0.05), 200);
      editorActions.setPaddingTransient(defaultPadding);
      setIsCropping(false);
      setCropRect(null);
      // Annotation coordinates live in the composited canvas space (background,
      // padding, frame, scaling), which the crop invalidates — there is no crop
      // offset that remaps them correctly, so they are cleared instead. This
      // runs unconditionally so undo/redo cannot bring stale ones back.
      const hadAnnotations = annotations.length > 0;
      actions.clearAnnotationsForImageChange();
      setSelectedAnnotation(null);
      setShowAnnotationPanel(false);
      toast.success(hadAnnotations ? "Crop applied — existing annotations were cleared" : "Crop applied");
    } catch (err) {
      if (imageGenerationRef.current !== generation) return;
      console.error("Failed to apply crop:", err);
      toast.error("Failed to apply crop");
    } finally {
      // Invalidation paths clear this themselves; an obsolete apply must not
      // re-enable the button underneath a newer one.
      if (imageGenerationRef.current === generation) {
        applyingCropRef.current = false;
        setIsApplyingCrop(false);
      }
    }
  }, [screenshotImage, cropRect, annotations.length, actions]);

  const handleAnnotationAdd = useCallback((annotation: Annotation) => {
    actions.addAnnotation(annotation);
    setSelectedAnnotation(annotation);
    setShowAnnotationPanel(true);
    if (annotation.type !== "number") setSelectedTool("select");
  }, [actions]);

  const handleAnnotationUpdateTransient = useCallback((annotation: Annotation) => {
    actions.updateAnnotationTransient(annotation);
    setSelectedAnnotation(annotation);
  }, [actions]);

  const handleAnnotationUpdate = useCallback((annotation: Annotation) => {
    actions.updateAnnotation(annotation);
    setSelectedAnnotation(annotation);
  }, [actions]);

  const handleAnnotationDelete = useCallback((id: string) => {
    actions.deleteAnnotation(id);
    setSelectedAnnotation((prev) => prev?.id === id ? null : prev);
    setShowAnnotationPanel(false);
  }, [actions]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedAnnotation) handleAnnotationDelete(selectedAnnotation.id);
  }, [selectedAnnotation, handleAnnotationDelete]);

  const handleUndo = useCallback(() => { actions.undo(); setSelectedAnnotation(null); setShowAnnotationPanel(false); }, [actions]);
  const handleRedo = useCallback(() => { actions.redo(); setSelectedAnnotation(null); setShowAnnotationPanel(false); }, [actions]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedAnnotation) { e.preventDefault(); handleAnnotationDelete(selectedAnnotation.id); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAnnotation, handleAnnotationDelete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (imageLoaded && !isSaving && !isCopying) handleSave(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && e.shiftKey) { e.preventDefault(); if (imageLoaded && !isSaving && !isCopying) handleCopy(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.metaKey || e.ctrlKey) && ((e.key === "z" && e.shiftKey) || e.key === "y")) { e.preventDefault(); handleRedo(); }
      if (e.key === "Escape") {
        // The crop overlay handles Escape itself and marks the event handled, so
        // one press cancels the crop instead of also closing the editor.
        if (e.defaultPrevented) return;
        if (isCropping) { handleCancelCrop(); return; }
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imageLoaded, isSaving, isCopying, handleSave, handleCopy, handleUndo, handleRedo, onCancel, isCropping, handleCancelCrop]);

  const selectedGradientOption = gradientOptions.find(g => g.id === settings.gradientId) || gradientOptions[0];
  const selectedMacbookGradientOption =
    gradientOptions.find((g) => g.id === settings.macbookBackground.gradientId) || gradientOptions[0];

  const canReposition = !!(screenshotImage &&
    (screenshotImage.width > ((settings.canvasDimensions.width > 0 ? settings.canvasDimensions.width : screenshotImage.width + settings.padding * 2)) ||
     screenshotImage.height > ((settings.canvasDimensions.height > 0 ? settings.canvasDimensions.height : screenshotImage.height + settings.padding * 2))));

  return (
    <div className="flex flex-col h-dvh" style={{ background: 'oklch(0.115 0.008 250)', fontFamily: 'var(--font-sans)' }}>

      {/* ─── Header ─── */}
      <header style={{
        height: 48,
        background: 'oklch(0.155 0.008 250)',
        borderBottom: '1px solid oklch(0.22 0.009 250)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        gap: 12,
        flexShrink: 0,
      }}>
        {/* Left: title + undo/redo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'oklch(0.82 0.01 250)', letterSpacing: '-0.01em' }}>
            Better Shot
          </span>
          <div style={{ width: 1, height: 16, background: 'oklch(0.26 0.009 250)' }} />
          <TooltipProvider delayDuration={400}>
            <div style={{ display: 'flex', gap: 2 }}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="tool-btn"
                    style={{ opacity: canUndo ? 1 : 0.3 }}
                    aria-label="Undo"
                  >
                    <Undo2 className="size-[15px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Undo <kbd className="ml-1 opacity-60">⌘Z</kbd></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="tool-btn"
                    style={{ opacity: canRedo ? 1 : 0.3 }}
                    aria-label="Redo"
                  >
                    <Redo2 className="size-[15px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Redo <kbd className="ml-1 opacity-60">⌘⇧Z</kbd></TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        {/* Center: annotation tools */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: 'oklch(0.135 0.008 250)',
          border: '1px solid oklch(0.22 0.009 250)',
          borderRadius: 8,
          padding: '3px 4px',
        }}>
          <TooltipProvider delayDuration={300}>
            {annotationTools.map((tool) => (
              <Tooltip key={tool.type}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSelectedTool(tool.type)}
                    className={`tool-btn ${selectedTool === tool.type ? 'active' : ''}`}
                    aria-label={tool.label}
                  >
                    {tool.icon}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {tool.label}
                  {tool.shortcut && <kbd className="ml-1.5 opacity-50">{tool.shortcut}</kbd>}
                </TooltipContent>
              </Tooltip>
            ))}
            {selectedAnnotation && (
              <>
                <div style={{ width: 1, height: 16, background: 'oklch(0.26 0.009 250)', margin: '0 4px' }} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleDeleteSelected}
                      className="tool-btn"
                      style={{ color: 'oklch(0.62 0.18 25)' }}
                      aria-label="Delete annotation"
                    >
                      <Trash2 className="size-[15px]" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Delete</TooltipContent>
                </Tooltip>
              </>
            )}
          </TooltipProvider>
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="header-btn header-btn-ghost" onClick={onCancel} aria-label="Cancel">
            <X className="size-[13px]" />
            <span>Cancel</span>
          </button>
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="header-btn header-btn-secondary"
                  onClick={handleCopy}
                  disabled={!imageLoaded || isSaving || isCopying}
                  aria-label="Copy to clipboard"
                >
                  {isCopying
                    ? <Loader2 className="size-[13px] animate-spin" />
                    : <Copy className="size-[13px]" />
                  }
                  <span>Copy</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Copy to Clipboard <kbd className="ml-1 opacity-60">⌘⇧C</kbd></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* ─── Tab Nav Rail ─── */}
        <nav style={{
          width: 54,
          background: 'oklch(0.155 0.008 250)',
          borderRight: '1px solid oklch(0.20 0.009 250)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '8px 0',
          gap: 2,
          flexShrink: 0,
        }}>
          <TooltipProvider delayDuration={300}>
            {sidebarTabs.map((tab) => (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`tab-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                    aria-label={tab.label}
                  >
                    {tab.icon}
                    <span style={{ fontSize: 8, letterSpacing: '0.03em', lineHeight: 1 }}>{tab.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">{tab.label}</TooltipContent>
              </Tooltip>
            ))}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Toggle panel visibility */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSidebarVisible(v => !v)}
                  className="tab-nav-btn"
                  aria-label={sidebarVisible ? 'Collapse panel' : 'Expand panel'}
                >
                  {sidebarVisible
                    ? <PanelLeftClose className="size-4" />
                    : <PanelLeftOpen className="size-4" />
                  }
                  <span style={{ fontSize: 8, letterSpacing: '0.03em', lineHeight: 1 }}>
                    {sidebarVisible ? 'Hide' : 'Show'}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {sidebarVisible ? 'Collapse panel' : 'Expand panel'}
              </TooltipContent>
            </Tooltip>

            {/* Reset button at bottom */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleResetToDefaults}
                  disabled={isResettingConfig}
                  className="tab-nav-btn"
                  aria-label="Reset to defaults"
                  style={{ opacity: isResettingConfig ? 0.4 : 1 }}
                >
                  <RotateCcw className="size-4" />
                  <span style={{ fontSize: 8, letterSpacing: '0.03em', lineHeight: 1 }}>Reset</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Reset to defaults</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </nav>

        {/* ─── Panel Content ─── */}
        {sidebarVisible && <div style={{
          width: 240,
          background: 'oklch(0.155 0.008 250)',
          borderRight: '1px solid oklch(0.20 0.009 250)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Panel header */}
          <div style={{
            padding: '10px 14px 8px',
            borderBottom: '1px solid oklch(0.20 0.009 250)',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'oklch(0.42 0.012 250)',
            }}>
              {sidebarTabs.find(t => t.id === activeTab)?.label || activeTab}
            </span>
          </div>

          {/* Panel scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

            {/* ── Image Tab ── */}
            {activeTab === "image" && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Annotation properties if selected */}
                {selectedAnnotation && (
                  <div>
                    <div className="section-header" style={{ paddingTop: 0 }}>
                      <span className="section-title">Annotation</span>
                      <button
                        onClick={() => { setSelectedAnnotation(null); setShowAnnotationPanel(false); }}
                        style={{ color: 'oklch(0.42 0.012 250)', cursor: 'pointer', background: 'none', border: 'none', padding: 2 }}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                    <PropertiesPanel annotation={selectedAnnotation} onUpdate={handleAnnotationUpdate} />
                    <hr className="panel-divider" />
                  </div>
                )}
                <FrameSelector
                  frameType={settings.frameType}
                  onFrameTypeChange={actions.setFrameType}
                />
                {settings.frameType === "side-by-side" && (
                  <>
                    <SideBySidePanel
                      splitRatio={sideBySideSplitRatio}
                      onSplitRatioChange={setSideBySideSplitRatio}
                      onSwapImages={
                        screenshotImage && settings.selectedImageSrc2
                          ? handleSwapImages
                          : undefined
                      }
                      leftImageLabel="Image 1"
                      rightImageLabel="Image 2"
                    />
                    <hr className="panel-divider" />
                    <input
                      ref={firstImageFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        handleFirstImageFileInput(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      style={{ display: 'none' }}
                    />
                    <div className="section-header" style={{ paddingTop: 0, alignItems: 'flex-start' }}>
                      <div>
                        <span className="section-title">First Image</span>
                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: 'oklch(0.62 0.01 250)' }}>
                          Replace image 1 on the left side.
                        </div>
                      </div>
                    </div>
                    <div
                      onDrop={handleFirstImageDrop}
                      onDragEnter={handleFirstImageDragOver}
                      onDragOver={handleFirstImageDragOver}
                      onDragLeave={handleFirstImageDragLeave}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: 10,
                        border: `1.5px dashed ${isFirstImageDragActive ? 'oklch(0.72 0.18 142)' : 'oklch(0.36 0.01 250)'}`,
                        borderRadius: 8,
                        background: isFirstImageDragActive ? 'oklch(0.72 0.18 142 / 0.10)' : 'oklch(0.145 0.008 250)',
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        border: '1px solid oklch(0.28 0.009 250)',
                        background: 'oklch(0.19 0.008 250)',
                        color: 'oklch(0.72 0.18 142)',
                        flexShrink: 0,
                      }}>
                        <Upload className="size-4" aria-hidden="true" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.84 0.01 250)' }}>
                          {imageLoaded ? 'Image 1 selected' : 'No image 1'}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 10, lineHeight: 1.35, color: 'oklch(0.62 0.01 250)' }}>
                          Drop a file here, or replace it.
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={openFirstImagePicker}
                          aria-label="Upload or replace image 1"
                          className="header-btn header-btn-secondary"
                          style={{ padding: '6px 8px', fontSize: 11 }}
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryPickerTarget((t) => (t === "first" ? null : "first"))}
                          aria-label="Pick image 1 from capture history"
                          className="header-btn header-btn-ghost"
                          style={{ padding: '6px 8px', fontSize: 11 }}
                        >
                          From history
                        </button>
                      </div>
                    </div>
                    {historyPickerTarget === "first" && (
                      <CaptureHistoryPicker
                        entries={captureHistoryEntries}
                        slotLabel="Image 1"
                        onPick={handlePickFromHistory}
                        onClose={() => setHistoryPickerTarget(null)}
                      />
                    )}
                    <hr className="panel-divider" />
                    <input
                      ref={secondImageFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        handleSecondImageFileInput(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      style={{ display: 'none' }}
                    />
                    <div className="section-header" style={{ paddingTop: 0, alignItems: 'flex-start' }}>
                      <div>
                        <span className="section-title">Second Image</span>
                        <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: 'oklch(0.62 0.01 250)' }}>
                          Upload image 2 for the right side.
                        </div>
                      </div>
                    </div>
                    {secondImageAnnouncement && (
                      <span role="status" className="sr-only">{secondImageAnnouncement}</span>
                    )}
                    {settings.selectedImageSrc2 ? (
                      <>
                        <div
                          onDrop={handleSecondImageDrop}
                          onDragEnter={handleSecondImageDragOver}
                          onDragOver={handleSecondImageDragOver}
                          onDragLeave={handleSecondImageDragLeave}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: 10,
                            border: `1.5px dashed ${isSecondImageDragActive ? 'oklch(0.72 0.18 142)' : 'oklch(0.36 0.01 250)'}`,
                            borderRadius: 8,
                            background: isSecondImageDragActive ? 'oklch(0.72 0.18 142 / 0.10)' : 'oklch(0.145 0.008 250)',
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 36,
                            height: 36,
                            borderRadius: 6,
                            border: '1px solid oklch(0.28 0.009 250)',
                            background: 'oklch(0.19 0.008 250)',
                            color: 'oklch(0.72 0.18 142)',
                            flexShrink: 0,
                          }}>
                            <Upload className="size-4" aria-hidden="true" />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.84 0.01 250)' }}>
                              Image 2 selected
                            </div>
                            <div style={{ marginTop: 2, fontSize: 10, lineHeight: 1.35, color: 'oklch(0.62 0.01 250)' }}>
                              Drop a file here, or replace it below.
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={openSecondImagePicker}
                              aria-label="Upload or replace image 2"
                              className="header-btn header-btn-secondary"
                              style={{ padding: '6px 8px', fontSize: 11 }}
                            >
                              Upload
                            </button>
                            <button
                              type="button"
                              onClick={() => setHistoryPickerTarget((t) => (t === "second" ? null : "second"))}
                              aria-label="Pick image 2 from capture history"
                              className="header-btn header-btn-ghost"
                              style={{ padding: '6px 8px', fontSize: 11 }}
                            >
                              From history
                            </button>
                            <button
                              type="button"
                              onClick={() => useEditorStore.getState().updateSettings({ selectedImageSrc2: null })}
                              aria-label="Remove image 2"
                              className="header-btn header-btn-ghost"
                              style={{ padding: '6px 8px', fontSize: 11 }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          background: 'oklch(0.145 0.008 250)',
                          border: '1px solid oklch(0.22 0.009 250)',
                          fontSize: 11,
                          lineHeight: 1.45,
                          color: 'oklch(0.66 0.01 250)',
                        }}>
                          The Background tab controls the only shared background. Remove Image 2 if you want only the main photo on that background.
                        </div>
                      </>
                    ) : (
                      <button
                        onClick={openSecondImagePicker}
                        onDrop={handleSecondImageDrop}
                        onDragEnter={handleSecondImageDragOver}
                        onDragOver={handleSecondImageDragOver}
                        onDragLeave={handleSecondImageDragLeave}
                        aria-label="Upload image 2 for side-by-side comparison"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          padding: '20px 16px',
                          border: `2px dashed ${isSecondImageDragActive ? 'oklch(0.72 0.18 142)' : 'oklch(0.58 0.10 142)'}`,
                          borderRadius: 8,
                          background: isSecondImageDragActive ? 'oklch(0.72 0.18 142 / 0.12)' : 'oklch(0.18 0.009 250)',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease, border-color 0.15s ease',
                          color: 'oklch(0.86 0.01 250)',
                          minWidth: 44,
                          minHeight: 112,
                          boxShadow: '0 0 0 1px oklch(0.72 0.18 142 / 0.18)',
                        }}
                      >
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 42,
                          height: 42,
                          borderRadius: 8,
                          background: 'oklch(0.72 0.18 142 / 0.14)',
                          color: 'oklch(0.72 0.18 142)',
                        }}>
                          <Upload className="size-5" aria-hidden="true" />
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>Upload Image 2</span>
                        <span style={{ fontSize: 11, lineHeight: 1.35, color: 'oklch(0.66 0.01 250)' }}>
                          Click to browse, or drop an image here.
                        </span>
                      </button>
                    )}
                    {settings.selectedImageSrc2 === null && (
                      <button
                        type="button"
                        onClick={() => setHistoryPickerTarget((t) => (t === "second" ? null : "second"))}
                        aria-label="Pick image 2 from capture history"
                        className="header-btn header-btn-ghost"
                        style={{ padding: '6px 8px', fontSize: 11, alignSelf: 'flex-start' }}
                      >
                        From history
                      </button>
                    )}
                    {historyPickerTarget === "second" && (
                      <CaptureHistoryPicker
                        entries={captureHistoryEntries}
                        slotLabel="Image 2"
                        onPick={handlePickFromHistory}
                        onClose={() => setHistoryPickerTarget(null)}
                      />
                    )}
                  </>
                )}
                {settings.frameType === "macbook" && (
                  <div style={{ marginTop: 14, marginBottom: 2 }}>
                    <div className="section-header" style={{ paddingTop: 0 }}>
                      <span className="section-title">MacBook Display</span>
                    </div>
                    <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="toggle-label">Display Padding</span>
                      <span className="toggle-value">{settings.macbookScreenshotPadding}%</span>
                    </div>
                    <Slider
                      value={[settings.macbookScreenshotPadding]}
                      onValueChange={(value) => actions.setMacbookScreenshotPaddingTransient(value[0])}
                      onValueCommit={(value) => actions.setMacbookScreenshotPadding(value[0])}
                      min={0}
                      max={20}
                      step={1}
                      className="studio-slider w-full"
                    />
                  </div>
                )}
                <hr className="panel-divider" />
                {/* ── Crop captured image ── */}
                <div className="section-header" style={{ paddingTop: 0 }}>
                  <span className="section-title">Crop</span>
                </div>
                {!isCropping ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, lineHeight: 1.4, color: 'oklch(0.66 0.01 250)' }}>
                      Trim the captured image to focus on the relevant area.
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        onClick={handleEnterCrop}
                        disabled={!imageLoaded || !screenshotImage}
                        aria-label="Crop captured image"
                        className="header-btn header-btn-secondary"
                        style={{ padding: '7px 10px', fontSize: 11, opacity: !imageLoaded ? 0.4 : 1 }}
                      >
                        <CropIcon className="size-3.5" />
                        <span>Crop Image</span>
                      </button>
                      {originalImage && (
                        <button
                          onClick={handleResetCrop}
                          aria-label="Reset crop to original"
                          className="header-btn header-btn-ghost"
                          style={{ padding: '7px 10px', fontSize: 11 }}
                        >
                          <RotateCcw className="size-3.5" />
                          <span>Reset Crop</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: 'oklch(0.72 0.18 142 / 0.10)',
                      border: '1px solid oklch(0.72 0.18 142 / 0.25)',
                      fontSize: 11,
                      lineHeight: 1.4,
                      color: 'oklch(0.78 0.12 142)',
                    }}>
                      Drag the handles to adjust the crop. Darkened area will be removed.
                    </div>
                    {cropRect && (
                      <div style={{ fontSize: 11, color: 'oklch(0.66 0.01 250)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                        {cropRect.width} × {cropRect.height} · {cropRect.x}, {cropRect.y}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={handleApplyCrop}
                        disabled={isApplyingCrop}
                        aria-label="Apply crop"
                        className="header-btn"
                        style={{
                          flex: 1,
                          padding: '7px 10px',
                          fontSize: 11,
                          background: 'oklch(0.72 0.18 142)',
                          color: 'oklch(0.14 0.01 250)',
                          border: 'none',
                          opacity: isApplyingCrop ? 0.6 : 1,
                        }}
                      >
                        {isApplyingCrop ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        <span>{isApplyingCrop ? 'Applying…' : 'Apply'}</span>
                      </button>
                      <button
                        onClick={handleCancelCrop}
                        disabled={isApplyingCrop}
                        aria-label="Cancel crop"
                        className="header-btn header-btn-ghost"
                        style={{ flex: 1, padding: '7px 10px', fontSize: 11 }}
                      >
                        <Ban className="size-3.5" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                )}
                <hr className="panel-divider" />
                <ImageRoundnessControl
                  borderRadius={settings.borderRadius}
                  onBorderRadiusChangeTransient={actions.setBorderRadiusTransient}
                  onBorderRadiusChange={actions.setBorderRadius}
                />
                {error && (
                  <div style={{
                    padding: '8px 10px',
                    background: 'oklch(0.22 0.10 25 / 0.25)',
                    border: '1px solid oklch(0.42 0.15 25 / 0.4)',
                    borderRadius: 6,
                    fontSize: 11,
                    color: 'oklch(0.72 0.15 25)',
                  }}>
                    <strong style={{ display: 'block', marginBottom: 3 }}>Error</strong>
                    {error}
                  </div>
                )}
              </div>
            )}

            {/* ── Background Tab ── */}
            {activeTab === "background" && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <BackgroundSelector
                  backgroundType={settings.backgroundType as "transparent" | "white" | "black" | "gray" | "gradient" | "custom"}
                  customColor={settings.customColor}
                  selectedGradient={selectedGradientOption.id}
                  expanded={true}
                  onBackgroundTypeChange={actions.setBackgroundType}
                  onCustomColorChange={actions.setCustomColor}
                  onGradientSelect={actions.setGradient}
                  onToggle={() => {}}
                />
                <hr className="panel-divider" />
                <AssetGrid
                  categories={assetCategories}
                  selectedImage={settings.selectedImageSrc}
                  backgroundType={settings.backgroundType}
                  expanded={true}
                  uploadedImages={uploadedBackgroundImages}
                  onImageSelect={actions.handleImageSelect}
                  onToggle={() => {}}
                  onUpload={handleBackgroundUpload}
                />
                {settings.frameType === "macbook" && (
                  <>
                    <hr className="panel-divider" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="section-header" style={{ paddingTop: 0 }}>
                        <span className="section-title">MacBook Display</span>
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '10px 12px',
                        background: 'oklch(0.145 0.008 250)',
                        border: '1px solid oklch(0.22 0.009 250)',
                        borderRadius: 8,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'oklch(0.82 0.01 250)' }}>
                            Match Outside Background
                          </div>
                          <div style={{ marginTop: 2, fontSize: 10, lineHeight: 1.4, color: 'oklch(0.58 0.01 250)' }}>
                            Use the same background outside the MacBook and inside the display.
                          </div>
                        </div>
                        <Switch
                          checked={settings.macbookUseOuterBackground}
                          onCheckedChange={actions.setMacbookUseOuterBackground}
                          aria-label="Match outside background inside the MacBook display"
                        />
                      </div>

                      {!settings.macbookUseOuterBackground && (
                        <>
                          <BackgroundSelector
                            backgroundType={settings.macbookBackground.backgroundType as "transparent" | "white" | "black" | "gray" | "gradient" | "custom"}
                            customColor={settings.macbookBackground.customColor}
                            selectedGradient={selectedMacbookGradientOption.id}
                            expanded={true}
                            onBackgroundTypeChange={actions.setMacbookBackgroundType}
                            onCustomColorChange={actions.setMacbookCustomColor}
                            onGradientSelect={actions.setMacbookGradient}
                            onToggle={() => {}}
                          />
                          <hr className="panel-divider" />
                          <AssetGrid
                            categories={assetCategories}
                            selectedImage={settings.macbookBackground.selectedImageSrc}
                            backgroundType={settings.macbookBackground.backgroundType}
                            expanded={true}
                            uploadedImages={uploadedBackgroundImages}
                            onImageSelect={actions.handleMacbookImageSelect}
                            onToggle={() => {}}
                            onUpload={handleBackgroundUpload}
                          />
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Effects Tab ── */}
            {activeTab === "effects" && (
              <EffectsPanel
                noiseAmount={settings.noiseAmount}
                padding={settings.padding}
                shadow={settings.shadow}
                noiseExpanded={true}
                shadowExpanded={true}
                onNoiseChangeTransient={actions.setNoiseAmountTransient}
                onPaddingChangeTransient={actions.setPaddingTransient}
                onShadowBlurChangeTransient={actions.setShadowBlurTransient}
                onShadowOffsetXChangeTransient={actions.setShadowOffsetXTransient}
                onShadowOffsetYChangeTransient={actions.setShadowOffsetYTransient}
                onShadowOpacityChangeTransient={actions.setShadowOpacityTransient}
                onNoiseChange={actions.setNoiseAmount}
                onPaddingChange={actions.setPadding}
                onShadowBlurChange={actions.setShadowBlur}
                onShadowOffsetXChange={actions.setShadowOffsetX}
                onShadowOffsetYChange={actions.setShadowOffsetY}
                onShadowOpacityChange={actions.setShadowOpacity}
                onNoiseToggle={() => {}}
                onShadowToggle={() => {}}
              />
            )}

            {/* ── Size Tab ── */}
            {activeTab === "size" && (
              <BackgroundSizePanel
                dimensions={settings.canvasDimensions}
                screenshotWidth={screenshotImage?.width || 0}
                screenshotHeight={screenshotImage?.height || 0}
                padding={settings.padding}
                imageScalingMode={settings.imageScalingMode}
                imageBorderSize={settings.imageBorderSize}
                expanded={true}
                onWidthChange={actions.setCanvasWidth}
                onHeightChange={actions.setCanvasHeight}
                onAspectRatioLockedChange={actions.setAspectRatioLocked}
                onPresetSelect={(width, height) => {
                  actions.setCanvasDimensions({ width, height });
                  if (settings.imageScalingMode === "none") actions.setImageScalingMode("cover");
                }}
                onScalingModeChange={actions.setImageScalingMode}
                onBorderSizeChange={actions.setImageBorderSize}
                onReset={() => {
                  actions.setCanvasDimensions({ width: 0, height: 0 });
                  actions.setImageScalingMode("none");
                  actions.setImageOffset({ x: 0, y: 0 });
                }}
                onToggle={() => {}}
              />
            )}

            {/* ── Position Tab ── */}
            {activeTab === "position" && (
              canReposition ? (
                <ImagePositionPanel
                  imageOffset={settings.imageOffset}
                  screenshotWidth={screenshotImage?.width || 0}
                  screenshotHeight={screenshotImage?.height || 0}
                  backgroundWidth={
                    settings.canvasDimensions.width > 0
                      ? settings.canvasDimensions.width
                      : (screenshotImage?.width || 0) + settings.padding * 2
                  }
                  backgroundHeight={
                    settings.canvasDimensions.height > 0
                      ? settings.canvasDimensions.height
                      : (screenshotImage?.height || 0) + settings.padding * 2
                  }
                  imageScalingMode={settings.imageScalingMode}
                  expanded={true}
                  onOffsetXChange={actions.setImageOffsetX}
                  onOffsetYChange={actions.setImageOffsetY}
                  onReset={() => actions.setImageOffset({ x: 0, y: 0 })}
                  onToggle={() => {}}
                />
              ) : (
                <div style={{
                  padding: '20px 0',
                  textAlign: 'center',
                  color: 'oklch(0.42 0.009 250)',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}>
                  <Move className="size-6" style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                  <p>Image position is only available when the image is larger than the canvas or in Cover scaling mode.</p>
                </div>
              )
            )}

            {/* ── Export Tab ── */}
            {activeTab === "export" && (
              <ExportSettingsPanel
                saveDir={saveDir}
                exportName={exportName}
                isSaving={isSaving}
                imageLoaded={imageLoaded}
                onSaveDirChange={onSaveDirChange}
                onExportNameChange={setExportName}
                onBrowseSaveDir={handleBrowseSaveDir}
                onSave={handleSave}
              />
            )}
          </div>
        </div>}

        {/* ─── Canvas ─── */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'oklch(0.115 0.008 250)',
          overflow: 'hidden',
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
        }}>
          {/* Subtle dot grid pattern */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, oklch(0.26 0.009 250) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            opacity: 0.5,
            pointerEvents: 'none',
          }} />

          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: 24 }}>
            {isCropping && screenshotImage && cropRect ? (
              <div
                style={{
                  position: 'relative',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  display: 'inline-block',
                  lineHeight: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={screenshotImage.src}
                  alt="Crop preview"
                  data-testid="crop-preview-image"
                  style={{
                    display: 'block',
                    maxWidth: 'min(80vw, 100%)',
                    maxHeight: '70vh',
                    width: 'auto',
                    height: 'auto',
                    borderRadius: settings.borderRadius,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}
                  draggable={false}
                />
                <CropOverlay
                  image={screenshotImage}
                  crop={cropRect}
                  onCropChange={setCropRect}
                  onCancel={handleCancelCrop}
                />
              </div>
            ) : previewUrl ? (
              <AnnotationCanvas
                annotations={annotations}
                selectedAnnotation={selectedAnnotation}
                selectedTool={selectedTool}
                previewUrl={previewUrl}
                showTransparencyGrid={settings.backgroundType === "transparent"}
                imageOffset={settings.imageOffset}
                canReposition={canReposition}
                onImageOffsetUpdateTransient={(offset) => {
                  actions.setImageOffsetXTransient(offset.x);
                  actions.setImageOffsetYTransient(offset.y);
                }}
                onImageOffsetUpdate={(offset) => { actions.setImageOffset(offset); }}
                onAnnotationAdd={handleAnnotationAdd}
                onAnnotationUpdateTransient={handleAnnotationUpdateTransient}
                onAnnotationUpdate={handleAnnotationUpdate}
                onAnnotationSelect={(ann) => {
                  setSelectedAnnotation(ann);
                  if (ann) { setShowAnnotationPanel(true); setActiveTab("image"); }
                }}
                onAnnotationDelete={handleAnnotationDelete}
              />
            ) : imageLoaded ? (
              <span style={{ color: 'oklch(0.42 0.009 250)', fontSize: 13 }}>Generating preview…</span>
            ) : error ? (
              <div style={{ textAlign: 'center', color: 'oklch(0.62 0.15 25)', padding: 24 }}>
                <p style={{ fontWeight: 500, marginBottom: 6 }}>Could not load image</p>
                <small style={{ fontSize: 11, color: 'oklch(0.48 0.009 250)', wordBreak: 'break-all' }}>{error}</small>
              </div>
            ) : (
              <span style={{ color: 'oklch(0.42 0.009 250)', fontSize: 13 }}>Loading image…</span>
            )}
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
