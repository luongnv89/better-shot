import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SideBySidePanel } from "./SideBySidePanel";

describe("SideBySidePanel", () => {
  it("renders the section title", () => {
    render(
      <SideBySidePanel
        splitRatio={0.5}
        onSplitRatioChange={vi.fn()}
      />
    );

    expect(screen.getByText("Side-by-side")).toBeInTheDocument();
  });

  it("renders the swap button when onSwapImages is provided", () => {
    render(
      <SideBySidePanel
        splitRatio={0.5}
        onSplitRatioChange={vi.fn()}
        onSwapImages={vi.fn()}
      />
    );

    expect(
      screen.getByLabelText("Swap left and right images")
    ).toBeInTheDocument();
  });

  it("hides the swap button when onSwapImages is omitted", () => {
    render(
      <SideBySidePanel
        splitRatio={0.5}
        onSplitRatioChange={vi.fn()}
      />
    );

    expect(
      screen.queryByLabelText("Swap left and right images")
    ).not.toBeInTheDocument();
  });

  it("calls onSwapImages when the swap button is clicked", () => {
    const onSwapImages = vi.fn();
    render(
      <SideBySidePanel
        splitRatio={0.5}
        onSplitRatioChange={vi.fn()}
        onSwapImages={onSwapImages}
      />
    );

    fireEvent.click(screen.getByLabelText("Swap left and right images"));

    expect(onSwapImages).toHaveBeenCalledTimes(1);
  });

  it("renders the split ratio slider", () => {
    render(
      <SideBySidePanel
        splitRatio={0.5}
        onSplitRatioChange={vi.fn()}
      />
    );

    // The slider is rendered as a div with role="slider" or similar
    // In shadcn/slider, the thumb button has role="slider"
    const slider = screen.getByRole("slider");
    expect(slider).toBeInTheDocument();
  });

  it("calls onSplitRatioChange when slider value changes", () => {
    const onSplitRatioChange = vi.fn();
    render(
      <SideBySidePanel
        splitRatio={0.5}
        onSplitRatioChange={onSplitRatioChange}
      />
    );

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "0.7" } });

    expect(onSplitRatioChange).toHaveBeenCalledWith(0.7);
  });

  it("displays the current split ratio percentage", () => {
    render(
      <SideBySidePanel
        splitRatio={0.75}
        onSplitRatioChange={vi.fn()}
      />
    );

    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("displays custom image labels", () => {
    render(
      <SideBySidePanel
        splitRatio={0.5}
        onSplitRatioChange={vi.fn()}
        leftImageLabel="Before"
        rightImageLabel="After"
      />
    );

    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
  });

  it("renders the hint text", () => {
    render(
      <SideBySidePanel
        splitRatio={0.5}
        onSplitRatioChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Adjust the split ratio/)).toBeInTheDocument();
  });
});
