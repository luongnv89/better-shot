import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, FolderOpen, ImagePlus, Images, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createHighQualityCanvas } from "@/lib/canvas-utils";
import { loadImage } from "@/hooks/usePreviewGenerator";
import { useBatchPreviews, type ItemPreview } from "@/hooks/useBatchPreviews";
import { BatchSlideshow } from "@/components/batch/BatchSlideshow";
import { MACOS_PRESETS, IPHONE_PRESETS, type SizePreset } from "@/lib/size-presets";
import {
  runBatchResize,
  type BatchItem,
  type BatchStatus,
  type FitMode,
  type LetterboxColor,
} from "@/lib/batch-resize";

interface BatchResizeProps {
  saveDir: string;
  onSaveDirChange: (dir: string) => void;
  onBack: () => void;
  /**
   * Captures sent in from the capture-history gallery. Each is an on-disk path
   * that is ingested through the SAME copy-to-temp-workspace + load pipeline as
   * the file picker, producing identical {@link BatchItem}s. Consumed exactly
   * once on arrival; `onHistoryItemsConsumed` is called afterward so the parent
   * can clear the pending list and avoid re-ingesting on the next visit.
   */
  initialHistoryPaths?: string[];
  onHistoryItemsConsumed?: () => void;
}

type ItemState = { status: BatchStatus; detail?: string };

interface State {
  items: BatchItem[];
  statuses: Record<string, ItemState>;
}

type Action =
  | { type: "add"; item: BatchItem }
  | { type: "remove"; id: string }
  | { type: "status"; id: string; status: BatchStatus; detail?: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add":
      return {
        items: [...state.items, action.item],
        statuses: { ...state.statuses, [action.item.id]: { status: "pending" } },
      };
    case "remove": {
      const { [action.id]: _removed, ...rest } = state.statuses;
      void _removed;
      return {
        items: state.items.filter((i) => i.id !== action.id),
        statuses: rest,
      };
    }
    case "status":
      return {
        ...state,
        statuses: {
          ...state.statuses,
          [action.id]: { status: action.status, detail: action.detail },
        },
      };
    default:
      return state;
  }
}

const FIT_MODES: { value: FitMode; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: "cover", label: "Fill, may crop" },
];

const LETTERBOX_COLORS: { value: LetterboxColor; label: string }[] = [
  { value: "transparent", label: "Transparent" },
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
];

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/** Best-effort cleanup of a sandboxed temp-workspace file. */
function cleanupWorkspaceFile(filePath: string): void {
  invoke("delete_temp_workspace_file", { filePath }).catch(() => {
    /* best effort */
  });
}

/** Fixed box the thumbnails live in, so rows stay aligned regardless of aspect. */
const THUMB_BOX = 44;

/**
 * The resized-output thumbnail for one row. Shows the live render of the chosen
 * width×height/fit/background so the user can eyeball the result before export.
 * The image is letterboxed inside a fixed box at the target's aspect ratio, so
 * `cover` crops and `fit` padding read the same as the exported file. Falls back
 * to a spinner while rendering, a dash when no size is set, and "!" on error.
 *
 * `box` is the square edge length to render within (default {@link THUMB_BOX} for
 * the inline row). The slideshow reuses this component with a larger `box` to
 * show the same already-rendered preview URL at a bigger size — no new render.
 */
export function ResizedPreview({
  preview,
  width,
  height,
  box = THUMB_BOX,
}: {
  preview: ItemPreview | undefined;
  width: number;
  height: number;
  box?: number;
}) {
  const hasTarget = width > 0 && height > 0;
  // Gate on hasTarget first: clearing the size after a render must fall back to
  // the placeholder immediately, never keep showing a now-stale "ready" preview
  // (the hook short-circuits on an invalid size without resetting per-item state).
  const status = !hasTarget ? "idle" : (preview?.status ?? "rendering");

  // Constrain to the target aspect ratio within the box so the preview's shape
  // matches the export (a tall iPhone size looks tall, a wide macOS size wide).
  let boxW = box;
  let boxH = box;
  if (hasTarget) {
    if (width >= height) {
      boxH = Math.max(1, Math.round((box * height) / width));
    } else {
      boxW = Math.max(1, Math.round((box * width) / height));
    }
  }

  return (
    <div
      className="bg-muted/40 flex shrink-0 items-center justify-center overflow-hidden rounded"
      style={{ width: box, height: box }}
      title={hasTarget ? `Resized to ${width}×${height}` : "Pick a size to preview the result"}
    >
      {status === "ready" && preview?.url ? (
        <img
          src={preview.url}
          alt="Resized preview"
          style={{ width: boxW, height: boxH, objectFit: "contain", display: "block" }}
        />
      ) : status === "rendering" ? (
        <Loader2 className="text-muted-foreground size-3.5 animate-spin" aria-label="Rendering preview" />
      ) : status === "error" ? (
        <span className="text-[oklch(0.65_0.2_25)] text-xs" title="Could not render preview">!</span>
      ) : (
        <span className="text-muted-foreground text-xs" aria-label="No size selected">–</span>
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: ItemState | undefined }) {
  const status = state?.status ?? "pending";
  if (status === "pending") {
    return <span style={{ fontSize: 11, color: "oklch(0.48 0.012 250)" }}>Pending</span>;
  }
  if (status === "processing") {
    return (
      <span style={{ fontSize: 11, color: "oklch(0.65 0.18 255)", display: "flex", alignItems: "center", gap: 4 }}>
        <Loader2 className="size-3 animate-spin" /> Processing
      </span>
    );
  }
  if (status === "done") {
    return <span style={{ fontSize: 11, color: "oklch(0.7 0.16 150)" }} title={state?.detail}>✓ Done</span>;
  }
  return (
    <span style={{ fontSize: 11, color: "oklch(0.65 0.2 25)" }} title={state?.detail}>
      ✗ {state?.detail ? state.detail : "Error"}
    </span>
  );
}

/**
 * A platform-labelled group of size-preset chips. The header doubles as the
 * always-visible indicator of which app each output size targets (macOS App
 * Store vs. iPhone), so users no longer need the hover tooltip to tell them
 * apart. The active chip is derived from the current width/height, so the
 * selection stays in sync as sizes are picked or changed.
 */
function PresetGroup({
  label,
  presets,
  width,
  height,
  onSelect,
}: {
  label: string;
  presets: SizePreset[];
  width: number;
  height: number;
  onSelect: (preset: SizePreset) => void;
}) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {presets.map((preset) => {
          const isActive = width === preset.width && height === preset.height;
          return (
            <button
              key={preset.label}
              onClick={() => onSelect(preset)}
              className={cn("preset-chip", isActive && "active")}
              title={preset.tooltip}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BatchResize({
  saveDir,
  onSaveDirChange,
  onBack,
  initialHistoryPaths,
  onHistoryItemsConsumed,
}: BatchResizeProps) {
  const [state, dispatch] = useReducer(reducer, { items: [], statuses: {} });
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  // Raw input strings so the user can type freely (e.g. "1280" digit-by-digit);
  // the 100-5000 clamp is applied on blur, not on every keystroke.
  const [widthInput, setWidthInput] = useState("");
  const [heightInput, setHeightInput] = useState("");
  const [fit, setFit] = useState<FitMode>("fit");
  const [bg, setBg] = useState<LetterboxColor>("transparent");
  const [isRunning, setIsRunning] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  // Slideshow overlay state. `slideshowIndex` only seeds which slide opens first;
  // the slideshow owns navigation from there and reads items/previews live.
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);

  const { items, statuses } = state;

  // Track current items so the unmount cleanup sees the latest list.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // On unmount, remove any sandboxed temp-workspace files we created.
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        cleanupWorkspaceFile(item.workspacePath);
      }
    };
  }, []);

  const handleRemove = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (item) cleanupWorkspaceFile(item.workspacePath);
    dispatch({ type: "remove", id });
  }, []);

  // Copy one on-disk image into the sandboxed temp workspace and add it to the
  // batch as a BatchItem. Shared by the file picker and the capture-history
  // entry path so both produce the identical item shape, previews, and cleanup
  // lifecycle. Returns true if added, false if it could not be loaded (the
  // orphaned temp copy, if any, is cleaned up on failure). Never throws.
  const ingestPath = useCallback(async (sourcePath: string): Promise<boolean> => {
    let workspacePath: string | null = null;
    try {
      // The asset protocol scope does not cover arbitrary user paths
      // (Desktop, Downloads, the saved-capture folder, ...). Mirror the upload
      // flow: copy into the sandboxed temp workspace, which IS in scope, then
      // load from there.
      workspacePath = await invoke<string>("copy_file_to_temp_workspace", {
        sourcePath,
      });
      const assetUrl = convertFileSrc(workspacePath);
      const img = await loadImage(assetUrl);
      dispatch({
        type: "add",
        item: {
          // Fresh id (not the history entry's): the same capture may be sent
          // more than once, and a reused id would collide on React keys and the
          // statuses map.
          id: crypto.randomUUID(),
          sourcePath,
          workspacePath,
          assetUrl,
          // Dimensions come from the freshly loaded image, matching the picker.
          originalWidth: img.naturalWidth,
          originalHeight: img.naturalHeight,
        },
      });
      return true;
    } catch (err) {
      console.error("Failed to load image", sourcePath, err);
      // If the copy succeeded but loading failed, drop the orphaned temp file.
      if (workspacePath) cleanupWorkspaceFile(workspacePath);
      return false;
    }
  }, []);

  const handleAddFiles = useCallback(async () => {
    if (isRunning || isAdding) return;
    setIsAdding(true);
    try {
      const paths = await invoke<string[]>("open_image_files_dialog");
      let added = 0;
      let skipped = 0;
      for (const path of paths) {
        if (await ingestPath(path)) added++;
        else skipped++;
      }
      if (skipped > 0) {
        toast.warning(`${added} added, ${skipped} could not be loaded`);
      }
    } catch (err) {
      // A user cancel now returns Ok(empty vec) from the backend (no-op above),
      // so anything thrown here is a genuine picker failure worth surfacing.
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Could not open file picker", { description: message });
    } finally {
      setIsAdding(false);
    }
  }, [isRunning, isAdding, ingestPath]);

  // Ingest captures sent in from the history gallery, exactly once. A history
  // selection arrives as a list of on-disk paths; we run each through the same
  // copy + load pipeline as the picker so the resulting items, previews, and
  // cleanup are indistinguishable from picker items. Guarded by a ref so React
  // StrictMode's double-invoke (and any re-render) cannot double-ingest, and the
  // parent is told to clear its pending list so re-entering Batch Resize later
  // does not re-import the same captures.
  const ingestedHistoryRef = useRef(false);
  useEffect(() => {
    if (ingestedHistoryRef.current) return;
    if (!initialHistoryPaths || initialHistoryPaths.length === 0) return;
    ingestedHistoryRef.current = true;
    const paths = initialHistoryPaths;
    (async () => {
      setIsAdding(true);
      try {
        let added = 0;
        let skipped = 0;
        for (const path of paths) {
          if (await ingestPath(path)) added++;
          else skipped++;
        }
        if (skipped > 0) {
          toast.warning(`${added} added from history, ${skipped} could not be loaded`);
        }
      } finally {
        setIsAdding(false);
        onHistoryItemsConsumed?.();
      }
    })();
    // Intentionally run only for the initial value: the ref guard makes this
    // consume-once regardless of dependency churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clamp the raw string on blur, write the result back into both the numeric
  // state used for export and the visible input field.
  const handleClampedBlur = useCallback(
    (value: string, setNum: (n: number) => void, setStr: (s: string) => void) => {
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        const clamped = Math.max(100, Math.min(5000, num));
        setNum(clamped);
        setStr(String(clamped));
      } else {
        setNum(0);
        setStr("");
      }
    },
    []
  );

  const handleSelectPreset = useCallback((preset: SizePreset) => {
    setWidth(preset.width);
    setHeight(preset.height);
    setWidthInput(String(preset.width));
    setHeightInput(String(preset.height));
  }, []);

  const handleChangeDir = useCallback(async () => {
    try {
      const dir = await invoke<string | null>("select_directory_dialog", {
        defaultPath: saveDir || undefined,
      });
      if (dir) onSaveDirChange(dir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.toLowerCase().includes("cancel")) {
        toast.error("Could not select folder", { description: message });
      }
    }
  }, [saveDir, onSaveDirChange]);

  // Live resized previews per item, regenerated (debounced) whenever the item
  // list or the resize target changes. Object-URL lifecycle is owned by the hook.
  const previews = useBatchPreviews(items, { width, height, fit, bg });

  const canExport = items.length > 0 && width > 0 && height > 0 && !!saveDir && !isRunning;

  const handleExport = useCallback(async () => {
    if (!canExport) return;
    setIsRunning(true);
    try {
      const { succeeded, failed } = await runBatchResize(
        items,
        { width, height, fit, bg },
        saveDir,
        {
          loadImage,
          renderToDataUrl: (opts) => {
            const canvas = createHighQualityCanvas(opts);
            return canvas.toDataURL("image/png");
          },
          saveImage: (dataUrl, filename) =>
            invoke<string>("save_edited_image", {
              imageData: dataUrl,
              saveDir,
              copyToClip: false,
              filename,
              // Batch export must never silently clobber pre-existing files or
              // outputs from a previous run; the backend auto-suffixes instead.
              noOverwrite: true,
            }),
          onItemStatus: (id, status, detail) => dispatch({ type: "status", id, status, detail }),
        }
      );
      if (failed === 0) {
        toast.success(`${succeeded} saved`);
      } else {
        toast.warning(`${succeeded} saved, ${failed} failed`);
      }
    } finally {
      setIsRunning(false);
    }
  }, [canExport, items, width, height, fit, bg, saveDir]);

  return (
    <main className="min-h-dvh bg-background text-foreground p-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} disabled={isRunning}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Batch Resize</h1>
        </div>

        {/* Add files */}
        <div className="space-y-2">
          <Button
            variant="outline"
            size="lg"
            className="w-full justify-center"
            onClick={handleAddFiles}
            disabled={isRunning || isAdding}
          >
            {isAdding ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" aria-hidden="true" />}
            Add files
          </Button>

          {/* Slideshow trigger — gated on having at least one image, mirroring the
              Export button's gating. Opens the overlay at the first slide; the
              slideshow then reads items/previews/size live, so it stays in sync. */}
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center"
            onClick={() => {
              setSlideshowIndex(0);
              setSlideshowOpen(true);
            }}
            disabled={items.length === 0}
          >
            <Images className="size-4" aria-hidden="true" />
            View slideshow
          </Button>

          {/* File list */}
          {items.length > 0 && (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2">
                  {/* Original → resized previews, so the resize can be eyeballed
                      before export. The arrow reads left (source) to right (output). */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <img
                      src={item.assetUrl}
                      alt="Original"
                      title={`Original ${item.originalWidth}×${item.originalHeight}`}
                      style={{ width: THUMB_BOX, height: THUMB_BOX, objectFit: "contain", borderRadius: 4 }}
                      className="bg-muted/40"
                    />
                    <ArrowRight className="text-muted-foreground size-3.5 shrink-0" aria-label="resized to" />
                    <ResizedPreview preview={previews[item.id]} width={width} height={height} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="text-sm truncate" title={item.sourcePath}>{basename(item.sourcePath)}</div>
                    <div style={{ fontSize: 11, color: "oklch(0.48 0.012 250)", fontFamily: "var(--font-mono)" }}>
                      {item.originalWidth}×{item.originalHeight}
                      {width > 0 && height > 0 && (
                        <span className="text-muted-foreground"> → {width}×{height}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <StatusBadge state={statuses[item.id]} />
                  </div>
                  <button
                    onClick={() => handleRemove(item.id)}
                    disabled={isRunning}
                    aria-label="Remove file"
                    style={{
                      background: "none", border: "none", cursor: isRunning ? "not-allowed" : "pointer",
                      color: "oklch(0.48 0.012 250)", padding: 4, flexShrink: 0,
                      opacity: isRunning ? 0.4 : 1,
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Size presets — grouped by target platform so each output size is
            labelled (macOS App Store vs. iPhone) without needing a hover. */}
        <div className="space-y-2">
          <div className="section-title" style={{ fontSize: 12, fontWeight: 600 }}>Size</div>
          <PresetGroup label="macOS App Store" presets={MACOS_PRESETS} width={width} height={height} onSelect={handleSelectPreset} />
          <PresetGroup label="iPhone" presets={IPHONE_PRESETS} width={width} height={height} onSelect={handleSelectPreset} />

          {/* Custom dims */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "oklch(0.42 0.009 250)", marginBottom: 4 }}>W</div>
              <input
                type="number"
                value={widthInput}
                onChange={(e) => setWidthInput(e.target.value)}
                onBlur={(e) => handleClampedBlur(e.target.value, setWidth, setWidthInput)}
                placeholder="Width"
                min={100} max={5000}
                className="studio-input"
              />
            </div>
            <div style={{ color: "oklch(0.38 0.009 250)", fontSize: 12, paddingTop: 18, flexShrink: 0 }}>×</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "oklch(0.42 0.009 250)", marginBottom: 4 }}>H</div>
              <input
                type="number"
                value={heightInput}
                onChange={(e) => setHeightInput(e.target.value)}
                onBlur={(e) => handleClampedBlur(e.target.value, setHeight, setHeightInput)}
                placeholder="Height"
                min={100} max={5000}
                className="studio-input"
              />
            </div>
          </div>
        </div>

        {/* Fit mode */}
        <div className="space-y-2">
          <div className="section-title" style={{ fontSize: 12, fontWeight: 600 }}>Fit</div>
          <div style={{ display: "flex", gap: 6 }}>
            {FIT_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setFit(m.value)}
                className={cn("preset-chip", fit === m.value && "active")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Letterbox color */}
        <div className="space-y-2">
          <div className="section-title" style={{ fontSize: 12, fontWeight: 600 }}>Background</div>
          <div style={{ display: "flex", gap: 6 }}>
            {LETTERBOX_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setBg(c.value)}
                className={cn("preset-chip", bg === c.value && "active")}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Output dir */}
        <div className="space-y-2">
          <div className="section-title" style={{ fontSize: 12, fontWeight: 600 }}>Output folder</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              className="studio-input"
              style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={saveDir}
            >
              {saveDir || "No folder selected"}
            </div>
            <Button variant="outline" size="sm" onClick={handleChangeDir} disabled={isRunning}>
              <FolderOpen className="size-4" aria-hidden="true" />
              Change
            </Button>
          </div>
        </div>

        {/* Export */}
        <Button
          variant="cta"
          size="lg"
          className="w-full justify-center"
          onClick={handleExport}
          disabled={!canExport}
        >
          {isRunning && <Loader2 className="size-4 animate-spin" />}
          {isRunning ? "Exporting..." : `Export all${items.length > 0 ? ` (${items.length})` : ""}`}
        </Button>

        {/* Slideshow overlay. Live props (not snapshots) so it tracks adds,
            removes, and size/fit/bg changes while open (AC4). It reuses the
            already-rendered `previews` URLs — no new render, no new object URLs. */}
        <BatchSlideshow
          items={items}
          previews={previews}
          width={width}
          height={height}
          open={slideshowOpen}
          onOpenChange={setSlideshowOpen}
          initialIndex={slideshowIndex}
        />
      </div>
    </main>
  );
}
