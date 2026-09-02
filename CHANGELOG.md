# Changelog

All notable changes to Better Shot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-07-XX

### Added

- **Auto-fill side-by-side from capture history**: The side-by-side editor now auto-fills both slots with the last two captures, making it faster to compare recent screenshots (#59)
- **Unsaved-changes indicator in Preferences**: A visual badge alerts you when preferences have been modified but not yet saved (#57)
- **Accessibility improvements**: ARIA labels added across all editor panels for improved screen-reader support (#56)

### Fixed

- **Dependency vulnerability patches**: Resolved critical and high severity vulnerabilities in project dependencies (#48) (#49)

### Changed

- **PropertiesPanel styles extracted**: Inline styles extracted into a dedicated module for better maintainability (#53)

### Chores

- **Dependency upgrades**: Updated `jsdom` 27.4.0 → 30.0.1 and `@testing-library/jest-dom` 6.9.1 → 7.0.1 (#51) (#52)
- **CI workflow enabled**: Activated the GitHub Actions CI pipeline (#50)
- **Documentation updates**: Removed PII from project documents; updated Node.js version to 22 LTS (#44) (#45) (#46)

### Tests

- **Rust integration tests**: Added integration tests for Tauri commands (#55)
- **Uncovered module tests**: Added tests for previously uncovered modules (#54)

## [0.5.0] - 2026-06-28

### Added

- **Side-by-side photo comparison**: Place two photos in a single frame for visual comparison via a new "Side by side" frame type. Fill either slot from an upload, drag-and-drop, or the capture-history picker, adjust the split with a persisted ratio slider, and swap the two images. Second-image state and the split ratio persist across sessions (#23) (#24)

## [0.4.0] - 2026-06-16

### Added

- **Batch resize for multiple photos**: Select several images and resize them all at once with a single action (#7) (#9)
- **Platform-size indicators**: Visual badges in the batch UI showing Apple Silicon vs Intel build compatibility (#10) (#12)
- **Original and resized preview per image**: Side-by-side comparison view in the batch resize panel so you can verify quality before saving (#11) (#13)
- **Capture history store**: Persistent recording of recent captures with a gallery view for quick access (#15) (#18)
- **Multi-select gallery**: Select multiple captures from history and send them together to Batch Resize (#16) (#17) (#19)
- **Rolling raw-capture buffer**: History now uses a rolling buffer for raw captures, keeping recent screenshots available without manual cleanup (#20) (#21)
- **Slideshow view for resize previews**: Browse through batch resize previews in a full-screen slideshow mode (#14) (#22)

### Documentation

- **README rewritten with AIDA structure**: Sharper copy following Attention → Interest → Desire → Action framework for better onboarding (#18)
- **Landing page hero split**: Split hero section into two columns for better visual hierarchy (#12)
- **Landing page dominant screenshot**: Made the hero screenshot the primary visual element (#12)
- **Landing page logo sync**: Updated stale logo assets to match the neon rebrand (#12)
- **Changelog section with neon timeline**: Added a visual changelog timeline to the landing page (#12)

### Chores

- **Gitissue config**: Added balanced autopilot strategy for issue management (#15)
- **Ignore local analytics**: Added `.gstack/` to .gitignore (#15)
- **Ignore local scripts**: Added `scripts/` to .gitignore (#15)
- **Disable broken Release workflow**: Temporarily disabled the CI release pipeline (#15)

## [0.3.0] - 2026-05-22

### Added

- **Persistent custom background images**: Upload your own images from the editor's background selection panel — uploads persist across sessions via the settings store, so favorites stay one click away
- **Neon-green brand identity**: Refreshed logo (selection brackets + 4-point spark on near-black ink), app accent color, Tauri app icons, and landing page all rebranded around the new neon mark
- **Menu-bar template icon**: New monochrome `trayTemplate.png` loaded as a template image — macOS now auto-tints the menu-bar icon to match the system appearance (white on dark, black on light)

### Changed

- **Upload flow streamlined**: Removed the permission-grant dialog that preceded the file picker — clicking Upload now opens the picker directly while keeping the same sandboxing guarantees
- **App accent dialed back for long sessions**: In-app primary green muted from vivid `oklch(0.87 0.30 142)` to a softer `oklch(0.72 0.18 142)`; brand/landing assets keep the bright `#00FF41` for marketing

## [0.2.8] - 2026-04-18

### Added

- **New brand identity**: Refreshed BetterShot logo across the app, Dock icon, README, and a new standalone landing page
- **Signed & notarized builds**: Both Apple Silicon and Intel DMGs are now Developer ID signed, hardened-runtime, and notarized by Apple — no more "unidentified developer" warning on first launch

### Chores

- Switched bundle identifier to `com.<bundle-id>`
- Added hardened-runtime entitlements for notarization
- Ignored Apple signing assets (`*.provisionprofile`, `*.p12`, `*.mobileprovision`)

## [0.2.7] - 2026-04-10

### Added

- **Device frames for screenshots**: New predefined device frames panel in the editor — wrap screenshots in iPhone or MacBook frames for polished presentations
- **Global shortcut to open BetterShot**: Press `Cmd+Shift+B` from anywhere to bring the BetterShot window to the foreground

### Fixed

- **MacBook frame proportions**: Adjusted MacBook device frame to match reference proportions, including rework to full laptop silhouette
- **iPhone frame layout**: Reworked iPhone frame to correctly wrap the screenshot and match reference design

### Documentation

- README rewritten for end users using the AIDA framework for clearer onboarding

### Chores

- Removed landing page; updated all project URLs to the fork

## [0.2.6] - 2026-04-09

### Added
- Always open editor after screenshot — every capture (region, fullscreen, window) now navigates directly to the editor screen; the auto-apply background shortcut path has been removed
- Upload photo to edit — new button on the main screen with a permission-explanation dialog; the selected file is sandboxed into a temp workspace before opening in the editor
- macOS autostart support — app can be configured to launch at login
- Homebrew install option added to the download dropdown and documentation
- Annotation resizing support in AnnotationCanvas — annotations can now be resized interactively after placement
- Background-size adjustment controls added to the editor (new `BackgroundSizePanel` component)
- New Tauri commands: `open_image_file_dialog`, `copy_file_to_temp_workspace`, `delete_temp_workspace_file`
- `filenamePrefix` and `saveDir` settings now persist across sessions via the settings store

### Changed
- Editor UI redesigned with dark studio aesthetic and tabbed sidebar — replaced the long scrollable sidebar with an icon nav rail and tabbed panel layout; annotation toolbar moved into a header center pill; Export button relocated into a dedicated Export panel

### Removed
- OCR feature removed — Tesseract.js WASM assets, `ocr.ts`, `OCRResultsDialog`, and related onboarding steps deleted; reduces bundle size significantly
- Auto-apply background toggle removed from the main UI and all related state, store reads/writes, and the `processScreenshotWithDefaultBackground` call

### Fixed
- Temp file cleanup after an upload editing session — uploaded files in `bettershot-uploads/` are deleted on save or cancel
- Path validation in `copy_file_to_temp_workspace` — source path is canonicalized to reject path traversal; `delete_temp_workspace_file` enforces the target is inside `bettershot-uploads/`
- Permission dialog now closes correctly when the user cancels the native file picker
- Trailing underscore removed from the default filename prefix (`"bettershot"` instead of `"bettershot_"`)

## [Unreleased]

### Fixed

- **Background Border at 0px**: Fixed issue where background was still visible when Background Border was set to 0px. Now 0px means no background border at all - the screenshot edges touch the canvas edges directly.

### Added

- **Background Border slider**: New control in the Background Effects panel to adjust the padding around captured screenshots
  - Slider range: 0px (no border) to 200px (maximum border)
  - Smart default: Automatically calculates 5% of the average image dimension, capped at 200px
  - Real-time preview updates during slider drag
  - Full undo/redo support
  - Tooltip explaining the control's purpose
- **Frontend test framework**: Set up Vitest with React Testing Library
  - 19 tests for editor store padding functionality
  - Test coverage for transient/commit actions, undo/redo, and smart defaults
- **Rust unit tests**: Added tests for image processing utilities
  - 8 tests for CropRegion bounds clamping and validation
  - 5 tests for filename generation and directory utilities

### Changed

- Padding is now a configurable setting stored in EditorSettings (previously hardcoded to 100px)
