import { useState, memo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";

export interface Asset {
  id: string;
  src: string;
  name: string;
}

export interface AssetCategory {
  name: string;
  assets: Asset[];
}

interface AssetGridProps {
  categories: AssetCategory[];
  selectedImage: string | null;
  backgroundType: string;
  expanded?: boolean;
  uploadedImages?: string[];
  onImageSelect: (imageSrc: string) => void;
  onToggle?: () => void;
  onUpload?: (file: File) => void;
}

export const AssetGrid = memo(function AssetGrid({
  categories,
  selectedImage,
  backgroundType,
  uploadedImages,
  onImageSelect,
  onUpload,
}: AssetGridProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const allCategories: AssetCategory[] = uploadedImages && uploadedImages.length > 0
    ? [{ name: "Uploaded", assets: uploadedImages.map((src, i) => ({ id: `uploaded-${i}`, src, name: `Uploaded ${i + 1}` })) }, ...categories]
    : categories;

  const [activeCategory, setActiveCategory] = useState(allCategories[0]?.name || "");
  const currentCategory = allCategories.find((cat) => cat.name === activeCategory);

  return (
    <div>
      {/* Section header */}
      <div className="section-header">
        <span className="section-title">Wallpapers</span>
        {onUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload background image"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: 'oklch(0.22 0.009 250)',
                color: 'oklch(0.72 0.01 250)',
                transition: 'background 0.12s ease',
              }}
            >
              <Upload className="size-3" aria-hidden="true" />
              Upload
            </button>
          </>
        )}
      </div>

      {/* Category tabs */}
      {allCategories.length > 1 && (
        <div style={{
          display: 'flex',
          gap: 4,
          marginBottom: 10,
          background: 'oklch(0.135 0.008 250)',
          borderRadius: 6,
          padding: 3,
          border: '1px solid oklch(0.22 0.009 250)',
        }}>
          {allCategories.map((category) => (
            <button
              key={category.name}
              onClick={() => setActiveCategory(category.name)}
              aria-label={`Select ${category.name} category`}
              style={{
                flex: 1,
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
                transition: 'all 0.12s ease',
                cursor: 'pointer',
                border: 'none',
                ...(activeCategory === category.name
                  ? {
                      background: 'oklch(0.22 0.009 250)',
                      color: 'oklch(0.80 0.01 250)',
                    }
                  : {
                      background: 'transparent',
                      color: 'oklch(0.45 0.009 250)',
                    }
                ),
              }}
            >
              {category.name === "Wallpapers" ? "Wallpapers" : category.name === "Mac Assets" ? "Mac" : category.name}
            </button>
          ))}
        </div>
      )}

      {/* Asset grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6,
        maxHeight: 280,
        overflowY: 'auto',
        paddingRight: 2,
        paddingBottom: 4,
      }}>
        {currentCategory?.assets.map((asset) => {
          const isSelected = backgroundType === "image" && selectedImage === asset.src;
          return (
            <button
              key={asset.id}
              onClick={() => onImageSelect(asset.src)}
              aria-label={`Select ${asset.name}`}
              className={cn("gradient-thumb", isSelected && "selected")}
              style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden' }}
            >
              <img
                src={asset.src}
                alt={asset.name}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  display: 'block',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.08)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'; }}
              />
              {isSelected && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'oklch(0.65 0.18 255 / 0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
