import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { BatchResize } from "./BatchResize";
import { MACOS_PRESETS, IPHONE_PRESETS } from "@/lib/size-presets";

// Stub image loading so adding files doesn't touch a real decoder, and stub the
// preview hook so populated rows don't hit the (unavailable) jsdom canvas
// backend — the hook's own lifecycle is covered in useBatchPreviews.test.ts.
vi.mock("@/hooks/usePreviewGenerator", () => ({
  loadImage: vi.fn(async () => ({ naturalWidth: 200, naturalHeight: 100 }) as HTMLImageElement),
}));
// Per-test control over what the preview hook reports back, so we can simulate
// both the "rendered" and the "no size picked yet" states without a real canvas.
const previewMode = { value: "ready" as "ready" | "idle" };
vi.mock("@/hooks/useBatchPreviews", () => ({
  useBatchPreviews: (items: { id: string }[]) =>
    previewMode.value === "idle"
      ? {}
      : Object.fromEntries(
          items.map((i) => [i.id, { url: `blob://preview/${i.id}`, status: "ready" }])
        ),
}));

const mockInvoke = vi.mocked(invoke);

// Render with an empty item list so no Tauri `invoke` fires on mount; this
// isolates the size-preset UI, which is what these tests exercise.
function renderPanel() {
  return render(
    <BatchResize saveDir="" onSaveDirChange={vi.fn()} onBack={vi.fn()} />
  );
}

/**
 * Render the panel and add one image via the (mocked) file picker flow. When
 * `pickSize` is true (default) a size preset is also selected, so a valid resize
 * target exists and the resized preview is allowed to render.
 */
async function renderWithOneImage({ pickSize = true } = {}) {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "open_image_files_dialog") return ["/photos/shot.png"];
    if (cmd === "copy_file_to_temp_workspace") return "/tmp/shot.png";
    return undefined;
  });
  const utils = render(
    <BatchResize saveDir="/out" onSaveDirChange={vi.fn()} onBack={vi.fn()} />
  );
  fireEvent.click(screen.getByText("Add files"));
  await waitFor(() => expect(screen.getByText("shot.png")).toBeInTheDocument());
  if (pickSize) {
    fireEvent.click(screen.getByText(MACOS_PRESETS[0].label));
  }
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  previewMode.value = "ready";
});

describe("BatchResize per-image previews", () => {
  it("shows both an original and a resized preview once a size is chosen", async () => {
    await renderWithOneImage(); // adds an image and picks a size

    // AC1: original preview present (alt="Original"), pointing at the source asset.
    const original = screen.getByAltText("Original") as HTMLImageElement;
    expect(original).toBeInTheDocument();
    expect(original.src).toContain("asset://");

    // AC2: resized preview present alongside it (alt="Resized preview"),
    // sourced from the hook's object URL — distinct from the original image.
    const resized = screen.getByAltText("Resized preview") as HTMLImageElement;
    expect(resized).toBeInTheDocument();
    expect(resized.src).toContain("blob://preview/");
    expect(resized.src).not.toEqual(original.src);
  });

  it("shows a placeholder instead of a resized image until a size is chosen", async () => {
    previewMode.value = "idle"; // hook returns {} when no valid size is set
    await renderWithOneImage({ pickSize: false });

    // The original is always shown (AC1); with no size set the resized slot is a
    // placeholder, so no resized <img> exists yet.
    expect(screen.getByAltText("Original")).toBeInTheDocument();
    expect(screen.queryByAltText("Resized preview")).toBeNull();
  });

  it("hides the resized preview again when the width is cleared after a render", async () => {
    // Even if the preview hook still reports a stale 'ready' url, the row must
    // fall back to the placeholder the instant the size becomes invalid (AC3).
    await renderWithOneImage(); // size picked → resized preview visible
    expect(screen.getByAltText("Resized preview")).toBeInTheDocument();

    // Clear the width field and blur to commit width = 0 (invalid target).
    const widthInput = screen.getByPlaceholderText("Width");
    fireEvent.change(widthInput, { target: { value: "" } });
    fireEvent.blur(widthInput);

    await waitFor(() =>
      expect(screen.queryByAltText("Resized preview")).toBeNull()
    );
    // The original is unaffected.
    expect(screen.getByAltText("Original")).toBeInTheDocument();
  });
});

describe("BatchResize platform-size indicators", () => {
  it("shows both platform group headers without hover", () => {
    renderPanel();
    // The headers are plain text in the DOM (no hover/tooltip needed), which is
    // the whole point of the feature: AC2 — visible without hover.
    expect(screen.getByText("macOS App Store")).toBeInTheDocument();
    expect(screen.getByText("iPhone")).toBeInTheDocument();
  });

  it("renders every macOS preset under the macOS App Store header", () => {
    renderPanel();
    for (const preset of MACOS_PRESETS) {
      expect(screen.getByText(preset.label)).toBeInTheDocument();
    }
  });

  it("renders every iPhone preset under the iPhone header", () => {
    renderPanel();
    for (const preset of IPHONE_PRESETS) {
      expect(screen.getByText(preset.label)).toBeInTheDocument();
    }
  });

  it("activates only the selected preset chip and reflects platform grouping", () => {
    renderPanel();
    const macPreset = MACOS_PRESETS[0];
    const macChip = screen.getByText(macPreset.label);
    fireEvent.click(macChip);
    expect(macChip).toHaveClass("active");

    // Selecting an iPhone preset moves the active state to it — and only it.
    const iphonePreset = IPHONE_PRESETS[0];
    const iphoneChip = screen.getByText(iphonePreset.label);
    fireEvent.click(iphoneChip);
    expect(iphoneChip).toHaveClass("active");
    expect(macChip).not.toHaveClass("active");

    // Exactly one *size* chip is active at a time (AC3 — indicators update
    // correctly as the chosen size changes). Preset dimensions are unique, so
    // no two size chips should ever be active simultaneously. Scope to the two
    // platform groups so the Fit/Background chips (which share the .preset-chip
    // class and have their own defaults) don't count.
    const sizeLabels = new Set(
      [...MACOS_PRESETS, ...IPHONE_PRESETS].map((p) => p.label)
    );
    const activeSizeChips = [
      ...document.querySelectorAll<HTMLButtonElement>(".preset-chip.active"),
    ].filter((el) => sizeLabels.has(el.textContent ?? ""));
    expect(activeSizeChips.length).toBe(1);
    expect(activeSizeChips[0].textContent).toBe(iphonePreset.label);
  });

  it("keeps each preset label inside its own platform group", () => {
    renderPanel();
    // Header text and its sibling chips share a parent group <div>, so a chip's
    // label resolves within the group named by its header.
    const macGroup = screen.getByText("macOS App Store").parentElement as HTMLElement;
    expect(within(macGroup).getByText(MACOS_PRESETS[0].label)).toBeInTheDocument();
    expect(within(macGroup).queryByText(IPHONE_PRESETS[0].label)).toBeNull();

    const iphoneGroup = screen.getByText("iPhone").parentElement as HTMLElement;
    expect(within(iphoneGroup).getByText(IPHONE_PRESETS[0].label)).toBeInTheDocument();
    expect(within(iphoneGroup).queryByText(MACOS_PRESETS[0].label)).toBeNull();
  });
});

describe("BatchResize — capture-history ingestion", () => {
  // Map the copy command to a deterministic per-source workspace path so we can
  // assert the picker→workspace pipeline ran (and is shared with the history path).
  function copyMappingInvoke() {
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === "open_image_files_dialog") return ["/photos/picked.png"];
      if (cmd === "copy_file_to_temp_workspace") {
        const src = (args as { sourcePath?: string })?.sourcePath ?? "x";
        return `/tmp/ws/${basenameOf(src)}`;
      }
      return undefined;
    });
  }
  function basenameOf(p: string): string {
    return p.split(/[/\\]/).pop() ?? p;
  }

  it("ingests history captures into BatchItems with loaded dimensions and previews", async () => {
    copyMappingInvoke();
    render(
      <BatchResize
        saveDir="/out"
        onSaveDirChange={vi.fn()}
        onBack={vi.fn()}
        initialHistoryPaths={["/caps/a.png", "/caps/b.png"]}
        onHistoryItemsConsumed={vi.fn()}
      />
    );

    // Both captures land as rows, keyed off their source basenames.
    await waitFor(() => expect(screen.getByText("a.png")).toBeInTheDocument());
    expect(screen.getByText("b.png")).toBeInTheDocument();

    // Each was routed through the shared copy-to-temp-workspace pipeline.
    expect(mockInvoke).toHaveBeenCalledWith("copy_file_to_temp_workspace", { sourcePath: "/caps/a.png" });
    expect(mockInvoke).toHaveBeenCalledWith("copy_file_to_temp_workspace", { sourcePath: "/caps/b.png" });

    // Dimensions come from the (mocked) loadImage — 200×100 — proving the item
    // was built from the freshly loaded image, exactly like the picker path.
    // There are two rows, so two dimension labels.
    expect(screen.getAllByText("200×100")).toHaveLength(2);

    // The original preview <img> points at the converted workspace asset URL,
    // i.e. the same asset:// pipeline the picker uses (not the entry thumbnail).
    const originals = screen.getAllByAltText("Original") as HTMLImageElement[];
    expect(originals).toHaveLength(2);
    expect(originals[0].src).toContain("asset://");
    expect(originals[0].src).toContain("/tmp/ws/");
  });

  it("calls onHistoryItemsConsumed after ingesting and does not re-ingest on re-render", async () => {
    copyMappingInvoke();
    const onConsumed = vi.fn();
    const { rerender } = render(
      <BatchResize
        saveDir="/out"
        onSaveDirChange={vi.fn()}
        onBack={vi.fn()}
        initialHistoryPaths={["/caps/a.png"]}
        onHistoryItemsConsumed={onConsumed}
      />
    );
    await waitFor(() => expect(screen.getByText("a.png")).toBeInTheDocument());
    expect(onConsumed).toHaveBeenCalledTimes(1);

    const copyCalls = () =>
      mockInvoke.mock.calls.filter((c) => c[0] === "copy_file_to_temp_workspace").length;
    const afterFirst = copyCalls();
    expect(afterFirst).toBe(1);

    // Re-render with the same paths (simulating the parent not yet having cleared
    // them). The consume-once ref must prevent a second ingest.
    rerender(
      <BatchResize
        saveDir="/out"
        onSaveDirChange={vi.fn()}
        onBack={vi.fn()}
        initialHistoryPaths={["/caps/a.png"]}
        onHistoryItemsConsumed={onConsumed}
      />
    );
    // Still exactly one row, one copy call, one consume callback.
    expect(screen.getAllByText("a.png")).toHaveLength(1);
    expect(copyCalls()).toBe(afterFirst);
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("ingests each history capture exactly once under StrictMode (no double copy)", async () => {
    // StrictMode intentionally mounts → unmounts → remounts effects in dev to
    // surface unsafe side effects. The consume-once ref must survive this and
    // import each capture only once, with a single copy_file_to_temp_workspace
    // per path — this is the production wrapper (see main.tsx).
    copyMappingInvoke();
    const onConsumed = vi.fn();
    render(
      <StrictMode>
        <BatchResize
          saveDir="/out"
          onSaveDirChange={vi.fn()}
          onBack={vi.fn()}
          initialHistoryPaths={["/caps/a.png"]}
          onHistoryItemsConsumed={onConsumed}
        />
      </StrictMode>
    );
    await waitFor(() => expect(screen.getByText("a.png")).toBeInTheDocument());

    // Exactly one row and exactly one copy call despite the double mount.
    expect(screen.getAllByText("a.png")).toHaveLength(1);
    expect(
      mockInvoke.mock.calls.filter((c) => c[0] === "copy_file_to_temp_workspace")
    ).toHaveLength(1);
  });

  it("ingests nothing when the initial history list is empty", () => {
    copyMappingInvoke();
    const onConsumed = vi.fn();
    render(
      <BatchResize
        saveDir="/out"
        onSaveDirChange={vi.fn()}
        onBack={vi.fn()}
        initialHistoryPaths={[]}
        onHistoryItemsConsumed={onConsumed}
      />
    );
    // No rows, no copy, no consume callback — the empty path is a clean no-op.
    expect(screen.queryByAltText("Original")).toBeNull();
    expect(
      mockInvoke.mock.calls.filter((c) => c[0] === "copy_file_to_temp_workspace")
    ).toHaveLength(0);
    expect(onConsumed).not.toHaveBeenCalled();
  });

  it("keeps the file-picker 'Add files' path working unchanged alongside history ingestion", async () => {
    copyMappingInvoke();
    // No initial history — pure picker path, the pre-existing behavior.
    render(<BatchResize saveDir="/out" onSaveDirChange={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByText("Add files"));
    await waitFor(() => expect(screen.getByText("picked.png")).toBeInTheDocument());

    // The picker still copies into the workspace and builds a 200×100 item.
    expect(mockInvoke).toHaveBeenCalledWith("copy_file_to_temp_workspace", { sourcePath: "/photos/picked.png" });
    expect(screen.getByText("200×100")).toBeInTheDocument();
  });
});
