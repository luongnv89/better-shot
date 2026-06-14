export type SizePreset = { label: string; width: number; height: number; tooltip: string };

export const MACOS_PRESETS: SizePreset[] = [
  { label: "1280×800",  width: 1280, height: 800,  tooltip: "macOS App Store" },
  { label: "1440×900",  width: 1440, height: 900,  tooltip: "macOS App Store" },
  { label: "2560×1600", width: 2560, height: 1600, tooltip: "macOS App Store" },
  { label: "2880×1800", width: 2880, height: 1800, tooltip: "macOS App Store" },
];

export const IPHONE_PRESETS: SizePreset[] = [
  { label: "1242×2688", width: 1242, height: 2688, tooltip: "iPhone portrait" },
  { label: "2688×1242", width: 2688, height: 1242, tooltip: "iPhone landscape" },
  { label: "1284×2778", width: 1284, height: 2778, tooltip: "iPhone portrait" },
  { label: "2778×1284", width: 2778, height: 1284, tooltip: "iPhone landscape" },
];

export const ALL_SIZE_PRESETS: SizePreset[] = [...MACOS_PRESETS, ...IPHONE_PRESETS];
