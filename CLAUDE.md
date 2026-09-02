# CLAUDE.md — BetterShot

> This file guides Claude Code agents working in this repo. See also `.pi/PROJECT.md` for toolchain details and `AGENTS.md` for UI constraints.

## What is BetterShot

macOS-only screenshot tool (Tauri 2 + React 19 + Vite 7 + TypeScript). Capture → polish → ship in <1 min. 100% local, no telemetry.

## Commands (repo root)

```bash
pnpm install          # install deps (pnpm 10.28, Node 22 LTS+)
pnpm run build        # tsc && vite build — frontend only
pnpm run lint:ci      # tsc --noEmit — must be 0 errors
pnpm test             # vitest run — test command of record, 212/212 is green
pnpm run test:coverage # vitest run --coverage (V8)
pnpm run test:rust    # cd src-tauri && cargo test
pnpm tauri dev        # Vite + Rust hot-reload (requires Rust + macOS)
pnpm tauri build      # bundle .app/.dmg to src-tauri/target/release/bundle/
```

Verify baseline-green before and after any modernization task:

```bash
pnpm run build && pnpm test && pnpm run lint:ci
```

## Project structure

```
src/                 # React frontend
  components/editor/ # Image editor (AnnotationCanvas, PropertiesPanel, etc.)
  components/preferences/ # PreferencesPage, KeyboardShortcutManager
  components/ui/     # Reusable primitives (Radix-based)
  hooks/             # useEditorSettings, usePreviewGenerator, etc.
  lib/               # canvas-utils, annotation-utils, auto-process, etc.
  stores/            # Zustand stores
  types/             # annotations.ts
src-tauri/           # Rust backend (Tauri commands, screenshot, image, clipboard)
  src/commands.rs    # 830-line Tauri handlers
  src/screenshot.rs  # capture (xcap)
  src/image.rs       # image processing
public/              # static assets
```

## Toolchain

- **Node.js 22 LTS+**, **pnpm 10.28**, **Rust stable**, **Xcode CLT**, **macOS 10.15+**
- Lockfiles: `pnpm-lock.yaml` (authoritative) + `package-lock.json`

## Conventions

- **Branch naming:** `type/issue-number-short-desc` (per `.gitissue.yml`)
- **No assumptions:** only use info from files, user messages, or tool results
- **Reuse first:** search codebase for similar functionality before creating new code
- **Strict TS:** `pnpm run lint:ci` must pass; avoid `any`
- **UI:** follow `AGENTS.md` — Tailwind defaults, `motion/react`, Radix primitives, `cn` (clsx + tailwind-merge), `aria-label` on icon-only buttons, no custom gradients/glow
- **Tests:** `pnpm test` is the gate (212/212). Modernization plan in `MODERNIZATION_PLAN.md` (phases Pre + P0–P4, epic #28)

## Modernization

Track implementation in `MODERNIZATION_PLAN.md` (derived from `MODERNIZATION_REPORT.md`, epic #28). Baseline: GREEN — 212/212 tests pass, 0 lint errors.

## Gotchas

- `pnpm tauri dev/build` fails on non-macOS — frontend-only `pnpm run build/test` works anywhere
- `.github/workflows/release.yml.disabled` is intentionally disabled; CI re-enables it
- App requires Screen Recording permission on macOS
