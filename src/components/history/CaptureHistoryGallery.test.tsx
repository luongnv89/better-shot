import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { CaptureHistoryGallery } from "./CaptureHistoryGallery";
import {
  captureHistoryActions,
  type CaptureHistoryEntry,
} from "@/stores/captureHistoryStore";

// Build a CaptureHistoryEntry with a stub thumbnail. The gallery only reads the
// fields below; no real pixel work is involved (jsdom has no canvas).
function makeEntry(overrides: Partial<CaptureHistoryEntry> = {}): CaptureHistoryEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    thumbnail: overrides.thumbnail ?? "data:image/png;base64,stub",
    savedPath: overrides.savedPath ?? `/tmp/shot-${Math.random()}.png`,
    width: overrides.width ?? 1920,
    height: overrides.height ?? 1080,
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

// Seed the store with the given entries (newest-first, matching addEntry which
// prepends — so we add in reverse to end up with `entries[0]` at index 0).
function seed(entries: CaptureHistoryEntry[]) {
  act(() => {
    captureHistoryActions.reset();
    for (let i = entries.length - 1; i >= 0; i--) {
      captureHistoryActions.addEntry(entries[i]);
    }
  });
}

const A = makeEntry({ id: "a", savedPath: "/caps/a.png" });
const B = makeEntry({ id: "b", savedPath: "/caps/b.png" });
const C = makeEntry({ id: "c", savedPath: "/caps/c.png" });

beforeEach(() => {
  act(() => captureHistoryActions.reset());
  vi.clearAllMocks();
});

function checkboxFor(name: string): HTMLElement {
  return screen.getByRole("checkbox", { name: new RegExp(`Select ${name}`) });
}

describe("CaptureHistoryGallery — empty state", () => {
  it("shows the empty message and no selection toolbar when there are no captures", () => {
    seed([]);
    render(<CaptureHistoryGallery onBack={vi.fn()} />);
    expect(screen.getByText("No captures yet")).toBeInTheDocument();
    // No selection affordances exist with nothing to select.
    expect(screen.queryByText("Select all")).toBeNull();
    expect(screen.queryByTestId("selection-count")).toBeNull();
  });
});

describe("CaptureHistoryGallery — multi-select", () => {
  it("starts with zero selected and renders one checkbox per capture", () => {
    seed([A, B, C]);
    render(<CaptureHistoryGallery onBack={vi.fn()} />);
    expect(screen.getByTestId("selection-count")).toHaveTextContent("0 selected");
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("toggles an individual capture's selection on and off", () => {
    seed([A, B, C]);
    render(<CaptureHistoryGallery onBack={vi.fn()} />);
    const cbA = checkboxFor("a.png");
    expect(cbA).toHaveAttribute("aria-checked", "false");

    fireEvent.click(cbA);
    expect(cbA).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("selection-count")).toHaveTextContent("1 selected");

    fireEvent.click(cbA);
    expect(cbA).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("selection-count")).toHaveTextContent("0 selected");
  });

  it("makes selected items visually distinct (the checkbox reflects checked state)", () => {
    seed([A, B]);
    render(<CaptureHistoryGallery onBack={vi.fn()} />);
    const cbA = checkboxFor("a.png");
    // The dedicated checkbox control carries a check icon; selection is conveyed
    // via aria-checked (and the filled/empty styling driven off it).
    expect(cbA.querySelector("svg")).not.toBeNull();
    expect(cbA).toHaveAttribute("aria-checked", "false");

    fireEvent.click(cbA);
    expect(cbA).toHaveAttribute("aria-checked", "true");
  });

  it("select-all selects every capture and reflects the count", () => {
    seed([A, B, C]);
    render(<CaptureHistoryGallery onBack={vi.fn()} />);
    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByTestId("selection-count")).toHaveTextContent("3 selected");
    for (const cb of screen.getAllByRole("checkbox")) {
      expect(cb).toHaveAttribute("aria-checked", "true");
    }
    // Select-all becomes a no-op (disabled) once everything is selected.
    expect(screen.getByText("Select all")).toBeDisabled();
  });

  it("clear-selection deselects everything", () => {
    seed([A, B, C]);
    render(<CaptureHistoryGallery onBack={vi.fn()} />);
    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByTestId("selection-count")).toHaveTextContent("3 selected");

    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByTestId("selection-count")).toHaveTextContent("0 selected");
    for (const cb of screen.getAllByRole("checkbox")) {
      expect(cb).toHaveAttribute("aria-checked", "false");
    }
  });

  it("disables Clear and Send while nothing is selected", () => {
    seed([A, B]);
    render(<CaptureHistoryGallery onBack={vi.fn()} />);
    expect(screen.getByText("Clear")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send to Batch Resize/ })).toBeDisabled();
  });
});

describe("CaptureHistoryGallery — send to batch", () => {
  it("sends only the selected entries, in newest-first gallery order", () => {
    seed([A, B, C]); // gallery order: A (newest), B, C
    const onSendToBatch = vi.fn();
    render(<CaptureHistoryGallery onBack={vi.fn()} onSendToBatch={onSendToBatch} />);

    // Select C then A (out of order) — the callback must still receive them in
    // gallery order [A, C], not click order.
    fireEvent.click(checkboxFor("c.png"));
    fireEvent.click(checkboxFor("a.png"));
    fireEvent.click(screen.getByRole("button", { name: /Send to Batch Resize/ }));

    expect(onSendToBatch).toHaveBeenCalledTimes(1);
    const sent = onSendToBatch.mock.calls[0][0] as CaptureHistoryEntry[];
    expect(sent.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("does not call onSendToBatch when nothing is selected", () => {
    seed([A, B]);
    const onSendToBatch = vi.fn();
    render(<CaptureHistoryGallery onBack={vi.fn()} onSendToBatch={onSendToBatch} />);
    // The button is disabled, so clicking is a no-op.
    fireEvent.click(screen.getByRole("button", { name: /Send to Batch Resize/ }));
    expect(onSendToBatch).not.toHaveBeenCalled();
  });
});

describe("CaptureHistoryGallery — compare side-by-side", () => {
  const compareButton = () => screen.getByRole("button", { name: /Compare side-by-side/ });

  it("only renders the compare button when onCompareSideBySide is provided", () => {
    seed([A, B]);
    const { rerender } = render(<CaptureHistoryGallery onBack={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Compare side-by-side/ })).toBeNull();

    rerender(<CaptureHistoryGallery onBack={vi.fn()} onCompareSideBySide={vi.fn()} />);
    expect(compareButton()).toBeInTheDocument();
  });

  it("is enabled only when exactly two captures are selected", () => {
    seed([A, B, C]);
    render(<CaptureHistoryGallery onBack={vi.fn()} onCompareSideBySide={vi.fn()} />);
    // 0 selected → disabled
    expect(compareButton()).toBeDisabled();

    fireEvent.click(checkboxFor("a.png")); // 1 selected → still disabled
    expect(compareButton()).toBeDisabled();

    fireEvent.click(checkboxFor("b.png")); // 2 selected → enabled
    expect(compareButton()).toBeEnabled();

    fireEvent.click(checkboxFor("c.png")); // 3 selected → disabled again
    expect(compareButton()).toBeDisabled();
  });

  it("passes the two selected captures in gallery order (Image 1, Image 2)", () => {
    seed([A, B, C]); // gallery order: A (newest), B, C
    const onCompareSideBySide = vi.fn();
    render(<CaptureHistoryGallery onBack={vi.fn()} onCompareSideBySide={onCompareSideBySide} />);

    // Select C then A (out of click order) — must arrive as [A, C] (gallery order).
    fireEvent.click(checkboxFor("c.png"));
    fireEvent.click(checkboxFor("a.png"));
    fireEvent.click(compareButton());

    expect(onCompareSideBySide).toHaveBeenCalledTimes(1);
    const sent = onCompareSideBySide.mock.calls[0][0] as CaptureHistoryEntry[];
    expect(sent.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("does not fire when the selection is not exactly two", () => {
    seed([A, B, C]);
    const onCompareSideBySide = vi.fn();
    render(<CaptureHistoryGallery onBack={vi.fn()} onCompareSideBySide={onCompareSideBySide} />);

    fireEvent.click(checkboxFor("a.png")); // 1 selected — button disabled
    fireEvent.click(compareButton());
    expect(onCompareSideBySide).not.toHaveBeenCalled();
  });
});

describe("CaptureHistoryGallery — open in editor", () => {
  function openButtonFor(name: string): HTMLElement {
    return screen.getByRole("button", { name: new RegExp(`Open ${name}`) });
  }

  it("clicking a capture's thumbnail opens that raw capture in the editor", () => {
    seed([A, B, C]);
    const onOpenCapture = vi.fn();
    render(<CaptureHistoryGallery onBack={vi.fn()} onOpenCapture={onOpenCapture} />);

    fireEvent.click(openButtonFor("b.png"));

    expect(onOpenCapture).toHaveBeenCalledTimes(1);
    const opened = onOpenCapture.mock.calls[0][0] as CaptureHistoryEntry;
    expect(opened.id).toBe("b");
    expect(opened.savedPath).toBe("/caps/b.png");
  });

  it("the open gesture is separate from selection (opening does not select)", () => {
    seed([A, B]);
    const onOpenCapture = vi.fn();
    render(<CaptureHistoryGallery onBack={vi.fn()} onOpenCapture={onOpenCapture} />);

    fireEvent.click(openButtonFor("a.png"));

    // Selection count stays at zero — clicking the thumbnail opens, not selects.
    expect(screen.getByTestId("selection-count")).toHaveTextContent("0 selected");
    expect(checkboxFor("a.png")).toHaveAttribute("aria-checked", "false");
    expect(onOpenCapture).toHaveBeenCalledTimes(1);
  });

  it("selecting a capture does not open it in the editor", () => {
    seed([A, B]);
    const onOpenCapture = vi.fn();
    render(<CaptureHistoryGallery onBack={vi.fn()} onOpenCapture={onOpenCapture} />);

    fireEvent.click(checkboxFor("a.png"));

    expect(checkboxFor("a.png")).toHaveAttribute("aria-checked", "true");
    expect(onOpenCapture).not.toHaveBeenCalled();
  });
});
