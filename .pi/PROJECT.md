# Project Environment — BetterShot

> Agent-runnable notes. Follow these exactly from a clean checkout — no extra human context needed.

## Stack

- **Frontend:** React 19 + TypeScript 5.8 + Vite 7 + Tailwind CSS 4
- **Backend:** Rust (Tauri 2)
- **Package manager:** pnpm 10.28 (packageManager field in package.json)
- **Runtime:** Node.js 22 LTS or higher, Rust stable toolchain, Xcode Command Line Tools
- **OS:** macOS 10.15+ only (Tauri app, macOS native APIs — will not build/run on Linux/Windows)

## Toolchain

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22 LTS+ | `node -v` — project uses `pnpm`, not npm |
| pnpm | 10.28 | `pnpm -v` — reads `packageManager` field |
| Rust | latest stable | `rustc --version` — required for `src-tauri/` |
| Xcode CLT | latest | `xcode-select -p` — needed for Tauri build |

Install Rust via `rustup.rs` if missing. On first macOS checkout, grant Screen Recording when prompted.

## Commands (run from repo root)

### Install

```bash
pnpm install
```

### Build (frontend only)

```bash
pnpm run build   # tsc && vite build
```

### Lint / Typecheck

```bash
pnpm run lint:ci   # tsc --noEmit — 0 errors is green
```

### Tests

```bash
pnpm test              # vitest run — 212/212 pass is green (test command of record)
pnpm run test:watch    # vitest watch mode
pnpm run test:coverage # vitest run --coverage (V8 provider, ~17% lines baseline)
pnpm run test:rust     # cd src-tauri && cargo test — Rust backend
```

### Tauri (requires Rust + macOS)

```bash
pnpm tauri dev    # Vite + Rust with hot-reload, launches native window
pnpm tauri build  # signed .app + .dmg in src-tauri/target/release/bundle/
```

## Repo etiquette

- **Lockfiles:** both `pnpm-lock.yaml` (authoritative) and `package-lock.json` are present — do not delete either without discussion.
- **Workflows:** `.github/workflows/release.yml.disabled` is intentionally disabled; CI tasks re-enable it.
- **UI style:** see `AGENTS.md` (tailwind defaults, motion/react, Radix primitives, `cn` utility, no custom gradients).
- **Tests are the gate:** every modernization task's acceptance criteria include `pnpm test` at or above baseline (212/212). Run `pnpm run build && pnpm test && pnpm run lint:ci` before concluding any task.
- **macOS-only commits:** prefer testing on macOS; `pnpm tauri dev/build` will fail elsewhere.
- **Branch naming:** `type/issue-number-short-desc` per `.gitissue.yml` (auto).

## Verify this file

```bash
cat .pi/PROJECT.md | grep -c 'pnpm test'
```
