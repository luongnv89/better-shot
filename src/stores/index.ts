export {
  useEditorStore,
  useSettings,
  useBackgroundType,
  useNoiseAmount,
  useBorderRadius,
  useShadow,
  useSelectedImageSrc,
  useGradientId,
  useAnnotations,
  useCanUndo,
  useCanRedo,
  useEditorActions,
  editorActions,
  clearPersistedEditorSettings,
  useUploadedBackgroundImages,
} from "./editorStore";

export type { EditorStore, EditorSettings, ShadowSettings, BackgroundType } from "./editorStore";

export {
  useCaptureHistoryStore,
  useCaptureHistoryEntries,
  useCaptureHistoryActions,
  captureHistoryActions,
  clearPersistedCaptureHistory as clearCaptureHistory,
} from "./captureHistoryStore";

export type { CaptureHistoryEntry } from "./captureHistoryStore";
