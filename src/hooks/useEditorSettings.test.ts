import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorSettings } from "./useEditorSettings";

describe("useEditorSettings", () => {
  it("returns default settings on mount", () => {
    const { result } = renderHook(() => useEditorSettings());
    const [settings] = result.current;
    expect(settings.backgroundType).toBe("image");
    expect(settings.customColor).toBe("#667eea");
    expect(settings.blurAmount).toBe(0);
    expect(settings.noiseAmount).toBe(0);
    expect(settings.borderRadius).toBe(18);
    expect(settings.shadow).toEqual({ blur: 33, offsetX: 18, offsetY: 23, opacity: 39 });
  });

  it("updates background type", () => {
    const { result } = renderHook(() => useEditorSettings());
    act(() => result.current[1].setBackgroundType("transparent"));
    expect(result.current[0].backgroundType).toBe("transparent");
  });

  it("updates custom color", () => {
    const { result } = renderHook(() => useEditorSettings());
    act(() => result.current[1].setCustomColor("#ff0000"));
    expect(result.current[0].customColor).toBe("#ff0000");
  });

  it("updates blur and noise", () => {
    const { result } = renderHook(() => useEditorSettings());
    act(() => result.current[1].setBlurAmount(10));
    act(() => result.current[1].setNoiseAmount(20));
    expect(result.current[0].blurAmount).toBe(10);
    expect(result.current[0].noiseAmount).toBe(20);
  });

  it("updates shadow settings", () => {
    const { result } = renderHook(() => useEditorSettings());
    act(() => result.current[1].setShadowBlur(50));
    act(() => result.current[1].setShadowOpacity(80));
    expect(result.current[0].shadow.blur).toBe(50);
    expect(result.current[0].shadow.opacity).toBe(80);
  });

  it("handleImageSelect sets image and type to image", () => {
    const { result } = renderHook(() => useEditorSettings());
    act(() => result.current[1].setBackgroundType("white"));
    act(() => result.current[1].handleImageSelect("asset://new.jpg"));
    expect(result.current[0].selectedImageSrc).toBe("asset://new.jpg");
    expect(result.current[0].backgroundType).toBe("image");
  });

  it("setGradient updates gradient fields", () => {
    const { result } = renderHook(() => useEditorSettings());
    const gradient = { id: "g2", src: "grad.jpg", colors: ["#000", "#fff"] as [string, string] };
    act(() => result.current[1].setGradient(gradient));
    expect(result.current[0].gradientId).toBe("g2");
    expect(result.current[0].gradientSrc).toBe("grad.jpg");
  });
});
