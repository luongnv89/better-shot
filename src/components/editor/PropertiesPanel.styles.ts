import type { CSSProperties } from "react";

export const rowContainerStyle: CSSProperties = { marginBottom: 12 };

export const rowLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "oklch(0.42 0.009 250)",
  marginBottom: 5,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export const sliderRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

export const sliderValueStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "oklch(0.55 0.01 250)",
  minWidth: 32,
  textAlign: "right",
};

export const inputBaseStyle: CSSProperties = {
  width: "100%",
  padding: "5px 8px",
  background: "oklch(0.175 0.008 250)",
  border: "1px solid oklch(0.26 0.009 250)",
  borderRadius: 5,
  fontSize: 12,
  color: "oklch(0.85 0.008 250)",
  outline: "none",
  fontFamily: "var(--font-sans)",
};

export const selectStyle: CSSProperties = {
  ...inputBaseStyle,
  cursor: "pointer",
  appearance: "none" as never,
  WebkitAppearance: "none" as never,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
  paddingRight: 24,
};

export const textareaStyle: CSSProperties = {
  ...inputBaseStyle,
  resize: "none",
  lineHeight: 1.4,
};

export const monoInputStyle: CSSProperties = {
  ...inputBaseStyle,
  flex: 1,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
};

export const colorPreviewWrapperStyle: CSSProperties = {
  position: "relative",
  flexShrink: 0,
};

export const colorPreviewStyle = (hex: string): CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 5,
  background: hex,
  border: "1px solid oklch(0.32 0.009 250)",
  cursor: "pointer",
});

export const colorInputOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0,
  cursor: "pointer",
  width: "100%",
  height: "100%",
};

export const fillRowInnerStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  marginBottom: 8,
};

export const opacityLabelStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "oklch(0.48 0.009 250)",
  flexShrink: 0,
  width: 32,
  textAlign: "right",
};

export const borderSectionLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "oklch(0.38 0.009 250)",
  marginBottom: 4,
};

export const borderGroupStyle: CSSProperties = { marginBottom: 8 };

export const flexGap6AlignCenter: CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  marginBottom: 6,
};

export const dividerStyle: CSSProperties = { marginTop: 4 };
