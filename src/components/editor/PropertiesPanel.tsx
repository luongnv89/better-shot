import { useState, useEffect, memo } from "react";
import { Slider } from "@/components/ui/slider";
import { Annotation, LineType, ArrowType } from "@/types/annotations";
import {
  rowContainerStyle,
  rowLabelStyle,
  sliderRowStyle,
  sliderValueStyle,
  inputBaseStyle,
  selectStyle,
  textareaStyle,
  monoInputStyle,
  colorPreviewWrapperStyle,
  colorPreviewStyle,
  colorInputOverlayStyle,
  fillRowInnerStyle,
  opacityLabelStyle,
  borderSectionLabelStyle,
  borderGroupStyle,
  flexGap6AlignCenter,
  dividerStyle,
} from "./PropertiesPanel.styles";

const stopPropagation = (e: React.KeyboardEvent) => e.stopPropagation();

interface PropertiesPanelProps {
  annotation: Annotation | null;
  onUpdate: (annotation: Annotation) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={rowContainerStyle}>
      <div style={rowLabelStyle}>{label}</div>
      {children}
    </div>
  );
}

function SliderWithValue({
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = "",
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <div style={sliderRowStyle}>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="studio-slider"
        style={{ flex: 1 }}
      />
      <span style={sliderValueStyle}>
        {value}
        {unit}
      </span>
    </div>
  );
}

export const PropertiesPanel = memo(function PropertiesPanel({ annotation, onUpdate }: PropertiesPanelProps) {
  const [, setExpandedSections] = useState<Set<string>>(new Set(["fill", "border"]));

  useEffect(() => {
    if (!annotation) return;
    const sections = new Set(["fill", "border"]);
    if (annotation.type === "text") sections.add("text");
    if (annotation.type === "line" || annotation.type === "arrow") sections.add("line");
    if (annotation.type === "number") sections.add("number");
    if (annotation.type === "blur") {
      sections.add("blur");
      sections.delete("fill");
      sections.delete("border");
    }
    setExpandedSections(sections);
  }, [annotation?.type, annotation?.id]);

  if (!annotation) return null;

  const updateAnnotation = (updates: Partial<Annotation>) => {
    onUpdate({ ...annotation, ...updates } as Annotation);
  };

  const handleColorChange = (type: "fill" | "border", hex: string) => {
    if (type === "fill") {
      updateAnnotation({ fill: { ...annotation.fill, hex } });
    } else {
      updateAnnotation({ border: { ...annotation.border, color: { ...annotation.border.color, hex } } });
    }
  };

  const handleOpacityChange = (type: "fill" | "border", opacity: number) => {
    if (type === "fill") {
      updateAnnotation({ fill: { ...annotation.fill, opacity } });
    } else {
      updateAnnotation({ border: { ...annotation.border, color: { ...annotation.border.color, opacity } } });
    }
  };

  return (
    <div>
      {annotation.type === "blur" && (
        <Row label="Blur Intensity">
          <SliderWithValue
            value={annotation.blurAmount}
            min={1}
            max={50}
            onChange={(v) => updateAnnotation({ blurAmount: v })}
          />
        </Row>
      )}

      {annotation.type === "text" && (
        <>
          <Row label="Content">
            <textarea
              value={annotation.text}
              onChange={(e) => updateAnnotation({ text: e.target.value })}
              onFocus={(e) => e.target.select()}
              onKeyDown={stopPropagation}
              style={textareaStyle}
              rows={2}
              placeholder="Enter text…"
              autoFocus
            />
          </Row>
          <Row label="Font Size">
            <SliderWithValue
              value={annotation.fontSize}
              min={12}
              max={72}
              onChange={(v) => updateAnnotation({ fontSize: v })}
              unit="px"
            />
          </Row>
        </>
      )}

      {(annotation.type === "line" || annotation.type === "arrow") && (
        <>
          <Row label="Style">
            <select
              value={annotation.lineType}
              onChange={(e) => {
                const newType = e.target.value as LineType;
                if (newType === "curved" && (annotation.type === "line" || annotation.type === "arrow")) {
                  const midX = (annotation.x + annotation.endX) / 2;
                  const midY = (annotation.y + annotation.endY) / 2;
                  const dx = annotation.endX - annotation.x;
                  const dy = annotation.endY - annotation.y;
                  const perpX = -dy;
                  const perpY = dx;
                  const len = Math.sqrt(perpX * perpX + perpY * perpY);
                  const offset = len * 0.3;
                  updateAnnotation({
                    lineType: newType,
                    controlPoints: [{ x: midX + (perpX / len) * offset, y: midY + (perpY / len) * offset }],
                  });
                } else {
                  updateAnnotation({ lineType: newType });
                }
              }}
              style={selectStyle}
            >
              <option value="straight">Straight</option>
              <option value="curved">Curved</option>
            </select>
          </Row>
          {annotation.type === "arrow" && (
            <Row label="Arrowhead">
              <select
                value={annotation.arrowType}
                onChange={(e) => updateAnnotation({ arrowType: e.target.value as ArrowType })}
                style={selectStyle}
              >
                <option value="thick">Large</option>
                <option value="thin">Small</option>
                <option value="none">None</option>
              </select>
            </Row>
          )}
        </>
      )}

      {annotation.type === "number" && (
        <>
          <Row label="Value">
            <input
              type="number"
              value={annotation.number}
              onChange={(e) => updateAnnotation({ number: Number(e.target.value) || 1 })}
              onKeyDown={stopPropagation}
              style={inputBaseStyle}
              min={1}
            />
          </Row>
          <Row label="Size">
            <SliderWithValue
              value={annotation.radius}
              min={10}
              max={50}
              onChange={(v) => updateAnnotation({ radius: v })}
              unit="px"
            />
          </Row>
        </>
      )}

      {annotation.type !== "blur" && (
        <>
          <hr className="panel-divider" style={dividerStyle} />
          <Row label="Fill Color">
            <div style={fillRowInnerStyle}>
              <div style={colorPreviewWrapperStyle}>
                <div style={colorPreviewStyle(annotation.fill.hex)} />
                <input
                  type="color"
                  value={annotation.fill.hex}
                  onChange={(e) => handleColorChange("fill", e.target.value)}
                  style={colorInputOverlayStyle}
                />
              </div>
              <input
                type="text"
                value={annotation.fill.hex.toUpperCase()}
                onChange={(e) => handleColorChange("fill", e.target.value)}
                onKeyDown={stopPropagation}
                style={monoInputStyle}
              />
              <span style={opacityLabelStyle}>{Math.round(annotation.fill.opacity)}%</span>
            </div>
            <SliderWithValue
              value={annotation.fill.opacity}
              min={0}
              max={100}
              onChange={(v) => handleOpacityChange("fill", v)}
              unit="%"
            />
          </Row>

          <Row label="Border">
            <div style={borderGroupStyle}>
              <div style={borderSectionLabelStyle}>Width</div>
              <SliderWithValue
                value={annotation.border.width}
                min={0}
                max={20}
                onChange={(v) => updateAnnotation({ border: { ...annotation.border, width: v } })}
                unit="px"
              />
            </div>
            <div style={borderGroupStyle}>
              <div style={borderSectionLabelStyle}>Color</div>
              <div style={flexGap6AlignCenter}>
                <div style={colorPreviewWrapperStyle}>
                  <div style={colorPreviewStyle(annotation.border.color.hex)} />
                  <input
                    type="color"
                    value={annotation.border.color.hex}
                    onChange={(e) => handleColorChange("border", e.target.value)}
                    style={colorInputOverlayStyle}
                  />
                </div>
                <input
                  type="text"
                  value={annotation.border.color.hex.toUpperCase()}
                  onChange={(e) => handleColorChange("border", e.target.value)}
                  onKeyDown={stopPropagation}
                  style={monoInputStyle}
                />
                <span style={opacityLabelStyle}>{Math.round(annotation.border.color.opacity)}%</span>
              </div>
              <SliderWithValue
                value={annotation.border.color.opacity}
                min={0}
                max={100}
                onChange={(v) => handleOpacityChange("border", v)}
                unit="%"
              />
            </div>
          </Row>
        </>
      )}
    </div>
  );
});
