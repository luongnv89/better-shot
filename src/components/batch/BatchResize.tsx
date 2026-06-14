import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { ArrowLeft, FolderOpen, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createHighQualityCanvas } from "@/lib/canvas-utils";
import { loadImage } from "@/hooks/usePreviewGenerator";
import { ALL_SIZE_PRESETS } from "@/lib/size-presets";
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

export function BatchResize({ saveDir, onSaveDirChange, onBack }: BatchResizeProps) {
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

  const handleAddFiles = useCallback(async () => {
    if (isRunning || isAdding) return;
    setIsAdding(true);
    try {
      const paths = await invoke<string[]>("open_image_files_dialog");
      let added = 0;
      let skipped = 0;
      for (const path of paths) {
        let workspacePath: string | null = null;
        try {
          // The asset protocol scope does not cover arbitrary user paths
          // (Desktop, Downloads, ...). Mirror the upload flow: copy into the
          // sandboxed temp workspace, which IS in scope, then load from there.
          workspacePath = await invoke<string>("copy_file_to_temp_workspace", {
            sourcePath: path,
          });
          const assetUrl = convertFileSrc(workspacePath);
          const img = await loadImage(assetUrl);
          dispatch({
            type: "add",
            item: {
              id: crypto.randomUUID(),
              sourcePath: path,
              workspacePath,
              assetUrl,
              originalWidth: img.naturalWidth,
              originalHeight: img.naturalHeight,
            },
          });
          added++;
        } catch (err) {
          console.error("Failed to load image", path, err);
          // If the copy succeeded but loading failed, drop the orphaned temp file.
          if (workspacePath) cleanupWorkspaceFile(workspacePath);
          skipped++;
        }
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
  }, [isRunning, isAdding]);

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

          {/* File list */}
          {items.length > 0 && (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2">
                  <img
                    src={item.assetUrl}
                    alt=""
                    style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="text-sm truncate" title={item.sourcePath}>{basename(item.sourcePath)}</div>
                    <div style={{ fontSize: 11, color: "oklch(0.48 0.012 250)", fontFamily: "var(--font-mono)" }}>
                      {item.originalWidth}×{item.originalHeight}
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

        {/* Size presets */}
        <div className="space-y-2">
          <div className="section-title" style={{ fontSize: 12, fontWeight: 600 }}>Size</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ALL_SIZE_PRESETS.map((preset) => {
              const isActive = width === preset.width && height === preset.height;
              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    setWidth(preset.width);
                    setHeight(preset.height);
                    setWidthInput(String(preset.width));
                    setHeightInput(String(preset.height));
                  }}
                  className={cn("preset-chip", isActive && "active")}
                  title={preset.tooltip}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

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
      </div>
    </main>
  );
}
