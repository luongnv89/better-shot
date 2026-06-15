import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BatchResize } from "./BatchResize";
import { MACOS_PRESETS, IPHONE_PRESETS } from "@/lib/size-presets";

// Render with an empty item list so no Tauri `invoke` fires on mount; this
// isolates the size-preset UI, which is what these tests exercise.
function renderPanel() {
  return render(
    <BatchResize saveDir="" onSaveDirChange={vi.fn()} onBack={vi.fn()} />
  );
}

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
