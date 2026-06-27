import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CaptureHistoryPicker } from "./CaptureHistoryPicker";
import type { CaptureHistoryEntry } from "@/stores/captureHistoryStore";

// Build a CaptureHistoryEntry with stub fields. The picker only reads
// id/thumbnail/savedPath/width/height; no real pixel work (jsdom has no canvas).
function makeEntry(overrides: Partial<CaptureHistoryEntry> = {}): CaptureHistoryEntry {
  return {
    id: overrides.id ?? "entry-1",
    thumbnail: overrides.thumbnail ?? "data:image/png;base64,stub",
    savedPath: overrides.savedPath ?? "/caps/shot.png",
    width: overrides.width ?? 1920,
    height: overrides.height ?? 1080,
    createdAt: overrides.createdAt ?? 0,
  };
}

describe("CaptureHistoryPicker — empty state", () => {
  it("shows the empty message and no thumbnails when there are no entries", () => {
    render(
      <CaptureHistoryPicker
        entries={[]}
        slotLabel="Image 1"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText(/No captures yet\. Take a screenshot/)
    ).toBeInTheDocument();
    // No thumbnail buttons exist with nothing to pick.
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("CaptureHistoryPicker — header", () => {
  it("renders the slot label in the header", () => {
    render(
      <CaptureHistoryPicker
        entries={[]}
        slotLabel="Image 2"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Pick Image 2 from history")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <CaptureHistoryPicker
        entries={[]}
        slotLabel="Image 1"
        onPick={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByLabelText("Close history picker"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CaptureHistoryPicker — entries", () => {
  it("renders one thumbnail per entry", () => {
    const entries = [
      makeEntry({ id: "a", savedPath: "/caps/a.png", thumbnail: "data:image/png;base64,a" }),
      makeEntry({ id: "b", savedPath: "/caps/b.png", thumbnail: "data:image/png;base64,b" }),
      makeEntry({ id: "c", savedPath: "/caps/c.png", thumbnail: "data:image/png;base64,c" }),
    ];
    render(
      <CaptureHistoryPicker
        entries={entries}
        slotLabel="Image 1"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.queryByText(/No captures yet/)).toBeNull();
  });

  it("calls onPick with the clicked entry", () => {
    const onPick = vi.fn();
    const entryA = makeEntry({ id: "a", savedPath: "/caps/a.png" });
    const entryB = makeEntry({ id: "b", savedPath: "/caps/b.png" });
    render(
      <CaptureHistoryPicker
        entries={[entryA, entryB]}
        slotLabel="Image 1"
        onPick={onPick}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("Use b.png for Image 1"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(entryB);
  });

  it("derives the entry label from the basename of a POSIX path", () => {
    render(
      <CaptureHistoryPicker
        entries={[makeEntry({ id: "a", savedPath: "/var/caps/nested/screenshot.png" })]}
        slotLabel="Image 2"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByLabelText("Use screenshot.png for Image 2")
    ).toBeInTheDocument();
  });

  it("derives the entry label from the basename of a Windows path", () => {
    render(
      <CaptureHistoryPicker
        entries={[makeEntry({ id: "a", savedPath: "C:\\Users\\me\\caps\\win-shot.png" })]}
        slotLabel="Image 1"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByLabelText("Use win-shot.png for Image 1")
    ).toBeInTheDocument();
  });
});
