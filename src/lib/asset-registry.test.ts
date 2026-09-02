import { describe, it, expect, vi } from "vitest";
import {
  getAssetPath,
  getDefaultBackgroundPath,
  isAssetId,
  isDataUrl,
  resolveBackgroundPath,
  getAssetIdFromPath,
  toStorableValue,
  migrateStoredValue,
  assetRegistry,
  DEFAULT_BACKGROUND_ID,
} from "./asset-registry";

describe("asset-registry", () => {
  it("getAssetPath returns path for known id", () => {
    const p = getAssetPath("bg-13");
    expect(typeof p).toBe("string");
    expect(p).toContain("asset");
  });

  it("getAssetPath returns null for unknown", () => {
    expect(getAssetPath("unknown")).toBeNull();
  });

  it("getDefaultBackgroundPath returns bg-18", () => {
    expect(getDefaultBackgroundPath()).toBe(assetRegistry[DEFAULT_BACKGROUND_ID]);
  });

  it("isAssetId detects registry ids", () => {
    expect(isAssetId("bg-13")).toBe(true);
    expect(isAssetId("gradient-1")).toBe(true);
    expect(isAssetId("nope")).toBe(false);
  });

  it("isDataUrl detects data urls", () => {
    expect(isDataUrl("data:image/png;base64,abc")).toBe(true);
    expect(isDataUrl("asset://path")).toBe(false);
  });

  it("resolveBackgroundPath null returns default", () => {
    expect(resolveBackgroundPath(null)).toBe(getDefaultBackgroundPath());
  });

  it("resolveBackgroundPath asset id returns registry", () => {
    expect(resolveBackgroundPath("bg-13")).toBe(assetRegistry["bg-13"]);
  });

  it("resolveBackgroundPath data url returns as-is", () => {
    const d = "data:image/png;base64,xyz";
    expect(resolveBackgroundPath(d)).toBe(d);
  });

  it("resolveBackgroundPath legacy bg path migrates", () => {
    const r = resolveBackgroundPath("/src/assets/bg-images/asset-18.jpg");
    expect(r).toBe(assetRegistry["bg-18"]);
  });

  it("resolveBackgroundPath legacy mac path migrates", () => {
    const r = resolveBackgroundPath("/assets/mac-asset-5-hash.jpg");
    expect(r).toBe(assetRegistry["mac-5"]);
  });

  it("resolveBackgroundPath unknown falls back to default", () => {
    const r = resolveBackgroundPath("/unknown/path.jpg");
    expect(r).toBe(getDefaultBackgroundPath());
  });

  it("getAssetIdFromPath reverse lookup", () => {
    const path = assetRegistry["bg-13"];
    expect(getAssetIdFromPath(path)).toBe("bg-13");
    expect(getAssetIdFromPath("unknown-path")).toBeNull();
  });

  it("toStorableValue returns id for registry path", () => {
    const path = assetRegistry["bg-13"];
    expect(toStorableValue(path)).toBe("bg-13");
  });

  it("toStorableValue returns data url as-is", () => {
    const d = "data:image/png;base64,abc";
    expect(toStorableValue(d)).toBe(d);
  });

  it("toStorableValue returns null for unknown", () => {
    expect(toStorableValue("/tmp/unknown.jpg")).toBeNull();
  });

  it("migrateStoredValue passes through asset id", () => {
    expect(migrateStoredValue("bg-13")).toBe("bg-13");
  });

  it("migrateStoredValue migrates legacy bg", () => {
    expect(migrateStoredValue("/src/assets/bg-images/asset-18.jpg")).toBe("bg-18");
  });

  it("migrateStoredValue migrates mac asset", () => {
    expect(migrateStoredValue("/assets/mac-asset-5.jpg")).toBe("mac-5");
  });

  it("migrateStoredValue migrates mesh gradient", () => {
    expect(migrateStoredValue("mesh1.webp")).toBe("gradient-1");
  });

  it("migrateStoredValue returns default for unknown", () => {
    expect(migrateStoredValue("unknown-xyz")).toBe(DEFAULT_BACKGROUND_ID);
  });

  it("migrateStoredValue keeps data url", () => {
    const d = "data:image/png;base64,abc";
    expect(migrateStoredValue(d)).toBe(d);
  });
});
