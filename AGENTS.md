# BetterShot — Agent Guide

> See `.pi/PROJECT.md` for full toolchain notes and `CLAUDE.md` for Claude-specific guidance.

## Project

macOS screenshot tool — Tauri 2 + React 19 + Vite 7 + TypeScript. Capture → edit → share, 100% local.

## Commands (repo root)

```bash
pnpm install          # install (pnpm 10.28, Node 22 LTS+)
pnpm run build        # tsc && vite build
pnpm run lint:ci      # tsc --noEmit — 0 errors is green
pnpm test             # vitest run — test command of record, 212/212 is green
pnpm run test:coverage # vitest run --coverage (V8)
pnpm run test:rust    # cd src-tauri && cargo test
pnpm tauri dev        # Vite + Rust hot-reload (macOS + Rust required)
pnpm tauri build      # bundle to src-tauri/target/release/bundle/
```

Baseline-green check: `pnpm run build && pnpm test && pnpm run lint:ci`

## Toolchain / Environment

- Node.js 22 LTS+, pnpm 10.28, Rust stable, Xcode CLT, **macOS 10.15+ only**
- Lockfiles: `pnpm-lock.yaml` (authoritative) + `package-lock.json`

## Structure

- `src/components/editor/` — editor panels (PropertiesPanel, AnnotationCanvas, etc.)
- `src/components/ui/` — Radix-based primitives
- `src/hooks/`, `src/lib/`, `src/stores/`, `src/types/`
- `src-tauri/` — Rust backend (commands, screenshot, image, clipboard)

## Conventions

- Branch: `type/issue-number-short-desc` per `.gitissue.yml`
- Strict TS, `pnpm run lint:ci` green, no `any` without rationale
- Reuse existing patterns; search before creating

---

# UI Skills

Opinionated constraints for building better interfaces with agents.

## Stack

- MUST use Tailwind CSS defaults (spacing, radius, shadows) before custom values
- MUST use `motion/react` (formerly `framer-motion`) when JavaScript animation is required
- SHOULD use `tw-animate-css` for entrance and micro-animations in Tailwind CSS
- MUST use `cn` utility (`clsx` + `tailwind-merge`) for class logic

## Components

- MUST use accessible component primitives for anything with keyboard or focus behavior (`Base UI`, `React Aria`, `Radix`)
- MUST use the project’s existing component primitives first
- NEVER mix primitive systems within the same interaction surface
- SHOULD prefer [`Base UI`](https://base-ui.com/react/components) for new primitives if compatible with the stack
- MUST add an `aria-label` to icon-only buttons
- NEVER rebuild keyboard or focus behavior by hand unless explicitly requested

## Interaction

- MUST use an `AlertDialog` for destructive or irreversible actions
- SHOULD use structural skeletons for loading states
- NEVER use `h-screen`, use `h-dvh`
- MUST respect `safe-area-inset` for fixed elements
- MUST show errors next to where the action happens
- NEVER block paste in `input` or `textarea` elements

## Animation

- NEVER add animation unless it is explicitly requested
- MUST animate only compositor props (`transform`, `opacity`)
- NEVER animate layout properties (`width`, `height`, `top`, `left`, `margin`, `padding`)
- SHOULD avoid animating paint properties (`background`, `color`) except for small, local UI (text, icons)
- SHOULD use `ease-out` on entrance
- NEVER exceed `200ms` for interaction feedback
- MUST pause looping animations when off-screen
- MUST respect `prefers-reduced-motion`
- NEVER introduce custom easing curves unless explicitly requested
- SHOULD avoid animating large images or full-screen surfaces

## Typography

- MUST use `text-balance` for headings and `text-pretty` for body/paragraphs
- MUST use `tabular-nums` for data
- SHOULD use `truncate` or `line-clamp` for dense UI
- NEVER modify `letter-spacing` (`tracking-`) unless explicitly requested

## Layout

- MUST use a fixed `z-index` scale (no arbitrary `z-x`)
- SHOULD use `size-x` for square elements instead of `w-x` + `h-x`

## Performance

- NEVER animate large `blur()` or `backdrop-filter` surfaces
- NEVER apply `will-change` outside an active animation
- NEVER use `useEffect` for anything that can be expressed as render logic

## Design

- NEVER use gradients unless explicitly requested
- NEVER use purple or multicolor gradients
- NEVER use glow effects as primary affordances
- SHOULD use Tailwind CSS default shadow scale unless explicitly requested
- MUST give empty states one clear next action
- SHOULD limit accent color usage to one per view
- SHOULD use existing theme or Tailwind CSS color tokens before introducing new ones
