import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorState } from "./useEditorState";

function makeAnnotation(id: string) {
  return {
    id,
    type: "text" as const,
    x: 10,
    y: 10,
    text: "hello",
    fontSize: 16,
    fill: { hex: "#ff0000", opacity: 100 },
    border: { width: 1, color: { hex: "#000000", opacity: 100 } },
  } as unknown as import("@/types/annotations").Annotation;
}

describe("useEditorState", () => {
  it("initializes with defaults", () => {
    const { result } = renderHook(() => useEditorState());
    expect(result.current.settings.backgroundType).toBe("image");
    expect(result.current.annotations).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("adds annotation and can undo/redo", () => {
    const { result } = renderHook(() => useEditorState());
    const ann = makeAnnotation("1");
    act(() => result.current.addAnnotation(ann));
    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.annotations).toHaveLength(0);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.annotations).toHaveLength(1);
  });

  it("updates annotation", () => {
    const { result } = renderHook(() => useEditorState());
    const ann = makeAnnotation("1");
    act(() => result.current.addAnnotation(ann));
    const updated = { ...ann, text: "updated" } as unknown as import("@/types/annotations").Annotation;
    act(() => result.current.updateAnnotation(updated));
    expect(result.current.annotations[0]).toMatchObject({ text: "updated" });
  });

  it("deletes annotation", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.addAnnotation(makeAnnotation("1")));
    act(() => result.current.addAnnotation(makeAnnotation("2")));
    act(() => result.current.deleteAnnotation("1"));
    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].id).toBe("2");
  });

  it("updates settings via setters", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.setBackgroundType("white"));
    expect(result.current.settings.backgroundType).toBe("white");
    act(() => result.current.setCustomColor("#00ff00"));
    expect(result.current.settings.customColor).toBe("#00ff00");
    act(() => result.current.setBlurAmount(5));
    expect(result.current.settings.blurAmount).toBe(5);
    act(() => result.current.setShadowBlur(99));
    expect(result.current.settings.shadow.blur).toBe(99);
  });

  it("handleImageSelect sets image and type", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.handleImageSelect("asset://img.jpg"));
    expect(result.current.settings.selectedImageSrc).toBe("asset://img.jpg");
    expect(result.current.settings.backgroundType).toBe("image");
  });
});
