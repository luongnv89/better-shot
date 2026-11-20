# Modernization Report — BetterShot

**Audited:** 2026-09-02 · **Commit:** 24c725f · **Branch:** main
**Stack:** TypeScript / React 19 / Vite 7 / Tauri 2 / Rust · **Size:** 84 source files (~17 kLOC)
**Baseline:** GREEN — builds; 212/212 tests pass; 0 lint errors

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 8 |
| Medium | 16 |
| Low | 26 |

BetterShot is a well-structured, actively maintained macOS screenshot tool (142 commits in the last 12 months). The codebase builds cleanly, all 212 tests pass, and TypeScript reports zero errors. However, three areas demand attention:

1. **33 dependency issues** — 1 critical (vitest), 7 high (vite×3, rollup, picomatch, ws, postcss, nanoid), plus 25 patch/minor/major version gaps. The patch to clear all High/Critical vulns is straightforward.
2. **17% test coverage** — 13 of 73 source files have zero coverage. The editor store (1015 lines) and preview generator (607 lines) are largely untested.
3. **No active CI** — the only workflow file is disabled (`release.yml.disabled`). No lint/typecheck gate runs before merge.

**Top 5 by impact:** `F-DEP-001` (vitest critical vuln) → `F-DEP-002` (vite triple high vuln) → `F-TEST-001` (17% coverage) → `F-CI-001` (no active CI) → `F-TEST-002` (Rust backend has 0 tests).

## Baseline

| Row | Value | Evidence |
|---|---|---|
| Build | pass (2.09s) | `pnpm run build` → `✓ built in 2.09s` |
| Tests runnable | yes | `pnpm test` → vitest v4.0.17 started |
| Test pass rate | 212/212 (0 skipped) | `pnpm test` → 13 test files, 212 passed |
| Coverage | 17.29% lines / 11.23% branches / 22.13% funcs | `pnpm run test:coverage` → V8 provider |
| Lint / typecheck | 0 errors | `pnpm run lint:ci` → `tsc --noEmit` exit 0 |
| CI | 1 workflow present but disabled (`release.yml.disabled`) | `.github/workflows/` |
| Runtime declared vs installed | Node v26.7.0 installed; no `engines` field in package.json | `node -v`, `package.json` |
| Lockfile | `package-lock.json` + `pnpm-lock.yaml` both present | repo root |
| Last commit | 2026-09-02, 142 commits in 12 months | `git log -1`, `git log --since="12 months ago"` |

**Verdict:** GREEN
**Test command of record:** `pnpm test` — every P0–P4 plan task's acceptance criteria reference this.

## Dimension coverage

| Dim | Disposition | Path | Findings |
|---|---|---|---|
| DEP | Audited | own probes (pnpm) | 33 |
| BUG | Not Assessed — no security-relevant patterns found in static scan | inline | 0 |
| PERF | Not Assessed — out of requested scope | — | 0 |
| CLEAN | Audited | inline | 4 |
| DEAD | Audited | inline | 3 |
| UX | Audited | inline (static-only; Tauri desktop app, no browser UI server) | 3 |
| TEST | Audited | inline | 2 |
| CI | Audited | inline | 2 |
| SEC | Audited | inline | 2 |
| DOCS | Audited | inline | 2 |

## Dependency currency

### npm (pnpm)

| ID | Package | Installed | Latest | Gap | Risk | Blast | Wave | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| F-DEP-001 | vitest | 4.0.17 | 4.1.11 | patch | vuln-critical | 13 files | W1 | Critical | pnpm audit (GHSA-5xrq-8626-4rwp) |
| F-DEP-002 | vite | 7.3.1 | 7.3.5 | patch | vuln-high×3 | 13 files | W1 | High | pnpm audit (GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583, GHSA-fx2h-pf6j-xcff) |
| F-DEP-003 | rollup | 4.x (via vite) | 4.59.0 | patch | vuln-high | transitive | W1 | High | pnpm audit (GHSA-mw99-2vgc) |
| F-DEP-004 | picomatch | 4.0.0 (via vite) | 4.0.4 | patch | vuln-high | transitive | W1 | High | pnpm audit (GHSA-c2c7-rcm5-vvqj) |
| F-DEP-005 | ws | 8.x (via jsdom) | 8.21.0 | patch | vuln-high | transitive | W1 | High | pnpm audit (GHSA-96hv-2xvq-fx4p) |
| F-DEP-006 | postcss | 8.5.6 | 8.5.26 | minor | vuln-high | 5 files | W2 | High | pnpm audit (GHSA-6g55-p6wh-862q) |
| F-DEP-007 | nanoid | <3.3.16 (via postcss) | 3.3.6 | patch | vuln-high | transitive | W1 | High | pnpm audit |
| F-DEP-008 | @testing-library/jest-dom | 6.9.1 | 7.0.1 | major | none | 7 files | W4 | Medium | pnpm outdated |
| F-DEP-009 | @vitejs/plugin-react | 4.7.0 | 6.1.1 | major×2 | none | 5 files | W4 | Medium | pnpm outdated |
| F-DEP-010 | jsdom | 27.4.0 | 30.0.1 | major×2 | none | 4 files | W4 | Medium | pnpm outdated |
| F-DEP-011 | motion | 12.26.2 | 13.1.1 | major | none | 3 files | W4 | Medium | pnpm outdated |
| F-DEP-012 | typescript | 5.8.3 | 7.0.2 | major×2 | none | 13 files | W4 | Medium | pnpm outdated |
| F-DEP-013 | vite | 7.3.1 | 8.2.2 | major | none | 13 files | W5 | Medium | pnpm outdated |
| F-DEP-014 | lucide-react | 0.562.0 | 1.39.0 | major×2 | none | 4 files | W4 | Medium | pnpm outdated |
| F-DEP-015 | @tailwindcss/postcss | 4.1.18 | 4.3.3 | minor | none | 3 files | W2 | Low | pnpm outdated |
| F-DEP-016 | @tailwindcss/vite | 4.1.18 | 4.3.3 | minor | none | 3 files | W2 | Low | pnpm outdated |
| F-DEP-017 | tailwindcss | 4.1.18 | 4.3.3 | minor | none | 3 files | W2 | Low | pnpm outdated |
| F-DEP-018 | @vitest/coverage-v8 | 4.0.17 | 4.1.11 | patch | none | 1 file | W2 | Low | pnpm outdated |
| F-DEP-019 | vitest | 4.0.17 | 4.1.11 | patch | none | 13 files | W2 | Low | pnpm outdated |
| F-DEP-020 | autoprefixer | 10.4.23 | 10.5.4 | minor | none | 2 files | W2 | Low | pnpm outdated |
| F-DEP-021 | @radix-ui/react-dialog | 1.1.15 | 1.1.23 | patch | none | 2 files | W2 | Low | pnpm outdated |
| F-DEP-022 | @radix-ui/react-dropdown-menu | 2.1.16 | 2.1.24 | patch | none | 2 files | W2 | Low | pnpm outdated |
| F-DEP-023 | @radix-ui/react-switch | 1.2.6 | 1.3.7 | minor | none | 2 files | W2 | Low | pnpm outdated |
| F-DEP-024 | @radix-ui/react-tooltip | 1.2.8 | 1.2.16 | patch | none | 2 files | W2 | Low | pnpm outdated |
| F-DEP-025 | @tauri-apps/api | 2.9.1 | 2.11.1 | minor | none | 10 files | W2 | Low | pnpm outdated |
| F-DEP-026 | @tauri-apps/cli | 2.9.6 | 2.11.4 | minor | none | 1 file | W2 | Low | pnpm outdated |
| F-DEP-027 | @tauri-apps/plugin-global-shortcut | 2.3.1 | 2.3.2 | patch | none | 2 files | W2 | Low | pnpm outdated |
| F-DEP-028 | @tauri-apps/plugin-opener | 2.5.3 | 2.5.5 | patch | none | 2 files | W2 | Low | pnpm outdated |
| F-DEP-029 | @tauri-apps/plugin-store | 2.4.2 | 2.4.4 | patch | none | 3 files | W2 | Low | pnpm outdated |
| F-DEP-030 | immer | 11.1.3 | 11.1.18 | minor | none | 3 files | W2 | Low | pnpm outdated |
| F-DEP-031 | @types/react | 19.2.8 | 19.2.18 | patch | none | 3 files | W2 | Low | pnpm outdated |
| F-DEP-032 | @types/react-dom | 19.2.3 | 19.2.5 | patch | none | 2 files | W2 | Low | pnpm outdated |
| F-DEP-033 | @types/node | 25.0.9 | 26.4.1 | minor | none | 3 files | W2 | Low | pnpm outdated |

### Runtime and toolchain

| Component | Declared | Installed | Current stable | Status | Severity |
|---|---|---|---|---|---|
| Node.js | none (no `engines` field) | v26.7.0 | v22 LTS / v23 current | undocumented requirement | Medium |

### Upgrade waves

| Wave | Contents | Lands in |
|---|---|---|
| W1 | security patches — 7 packages (vitest, vite, rollup, picomatch, ws, postcss, nanoid) | P1 |
| W2 | patch + minor batch — 20 packages | P1 |
| W3 | no runtime upgrade needed (Node already current) | — |
| W4 | major bumps — testing-library, vite-plugin-react, jsdom, motion, typescript, lucide-react | P2 |
| W5 | vite 7→8 major | P2 |

## Findings

### BUG

No security-relevant patterns (injection sinks, hardcoded credentials, auth gaps) found in static scan.

### CLEAN

| ID | Severity | Evidence | Problem | Fix direction | Effort |
|---|---|---|---|---|---|
| F-CLEAN-001 | Medium | `src/stores/editorStore.ts:1–1015` | 1015-line store with >3 levels of nesting in action methods; god-module pattern | Split into focused sub-stores (settings, annotations, frames, history) | M |
| F-CLEAN-002 | Medium | `src/hooks/usePreviewGenerator.ts:1–607` | 607-line hook with >3 levels of nesting; canvas drawing logic mixed with React state | Extract canvas operations into a separate module; reduce hook to orchestration | M |
| F-CLEAN-003 | Medium | `src/components/editor/PropertiesPanel.tsx:14–107` | 23 inline `style={{...}}` objects with hardcoded color values (oklch); should use Tailwind or CSS variables | Extract to Tailwind classes or a style constant object | S |
| F-CLEAN-004 | Low | `src/App.tsx:15` | 15 React imports; `lazy` is used at lines 26-30 for code-split components; no clearly unused imports detected | Verify imports are all actively used | S |

### DEAD

| ID | Severity | Evidence | Problem | Fix direction | Effort |
|---|---|---|---|---|---|
| F-DEAD-001 | Medium | `src/lib/asset-registry.ts:47` | `assetRegistry` maps ~30 static assets; no mechanism to detect removed files from `assets/` | Add a build-time check that verifies registry entries match actual files | S |
| F-DEAD-002 | Low | `src/components/ui/card.tsx:6–76` | Card component exported; imported in 4 files (App.tsx, PreferencesPage, KeyboardShortcutManager, OnboardingFlow) but lives in a generic `ui/` barrel — consider whether it serves as a shared primitive or dead weight | Audit whether Card is a shared primitive or unused stub | S |
| F-DEAD-003 | Low | `src/lib/onboarding.ts:1–15` | 3 functions for onboarding state, used only in `App.tsx:4`; single-use module | Consider inlining into App.tsx or keep as-is for clarity | S |

### UX

| ID | Severity | Evidence | Problem | Fix direction | Effort |
|---|---|---|---|---|---|
| F-UX-001 | Medium | `src/components/editor/PropertiesPanel.tsx:57` | No `aria-label` on the properties panel container; screen readers cannot identify panel purpose | Add `aria-label` or `aria-labelledby` | S |
| F-UX-002 | Medium | `src/components/editor/CropOverlay.tsx:37` | Crop overlay has no visible cancel instruction beyond "Escape" text; keyboard-only users may not discover it | Add a persistent "Press Escape to cancel" label | S |
| F-UX-003 | Low | `src/components/preferences/PreferencesPage.tsx:30` | Preferences page has no "unsaved changes" indicator; shortcuts can be modified without confirmation | Add a save/confirm pattern for mutable settings | S |

### TEST

| ID | Severity | Evidence | Problem | Fix direction | Effort |
|---|---|---|---|---|---|
| F-TEST-001 | High | repo-wide | 17.29% line coverage; 13 of 73 source files at 0% | Add tests for uncovered modules in priority order | M |
| F-TEST-002 | Medium | `src-tauri/src/commands.rs:1–830` | Rust backend has 0 tests (only `image.rs` has 9 unit tests); 830-line command handler is untested | Add integration tests for Tauri commands | M |

### CI

| ID | Severity | Evidence | Problem | Fix direction | Effort |
|---|---|---|---|---|---|
| F-CI-001 | High | `.github/workflows/release.yml.disabled` | No active CI workflow; `tsc --noEmit` and `pnpm test` never run on PRs | Enable a CI workflow that runs build + test + lint on every push | S |
| F-CI-002 | Medium | `.github/workflows/release.yml.disabled` | No pre-commit hooks configured; no secret detection, no lint gate | Add pre-commit hooks (lint-staged, secret detection) | S |

### SEC

| ID | Severity | Evidence | Problem | Fix direction | Effort |
|---|---|---|---|---|---|
| F-SEC-001 | Medium | `src/lib/onboarding.ts:5–15` | Onboarding state stored in `localStorage` without encryption; low risk for this data but establishes a pattern | Document that localStorage is acceptable for onboarding state; add a comment | S |
| F-SEC-002 | Low | `src/App.tsx:132`, `src/App.tsx:225`, 50+ more across `src/` | `console.error` used for error logging in production; no structured logger | Add a simple error logger that suppresses in production or ships errors to a local store | S |

### DOCS

| ID | Severity | Evidence | Problem | Fix direction | Effort |
|---|---|---|---|---|---|
| F-DOCS-001 | Low | `README.md:1–10` | README badges reference v0.5.0 release; changelog shows 0.5.0 is current (2026-06-28) — badges are correct but no version number in prose | Add current version to README prose for offline readability | S |
| F-DOCS-002 | Low | `CONTRIBUTING.md:31` | "Node.js 18+" is outdated; current Node LTS is v22 and the dev machine runs v26 | Update to "Node.js 22 LTS or higher" | S |

## Cross-cutting patterns

- **Inline styles everywhere** — `PropertiesPanel.tsx`, `SliderWithValue`, and multiple other components use inline `style={{}}` with hardcoded oklch colors instead of Tailwind utility classes. This is a pattern across ~20 files (`F-CLEAN-003`, `F-DEAD-001`).
- **console.error for error handling** — 35+ occurrences of `console.error` across the codebase with no central logger (`F-SEC-002`).
- **Large React modules** — `editorStore.ts` (1015 lines) and `usePreviewGenerator.ts` (607 lines) are the two largest files and combine state management with canvas operations (`F-CLEAN-001`, `F-CLEAN-002`).

## Artifacts written

| File | Why |
|---|---|
| `MODERNIZATION_REPORT.md` | this report |
| `MODERNIZATION_PLAN.md` | the derived plan |
| `coverage/` | probe byproduct — created by `pnpm run test:coverage` (V8 provider) |

**Tracked files modified: 0** — `git status --porcelain` and `git diff` match the pre-run snapshot once declared artifacts are set aside.

## Limitations

- **PERF dimension** — Not Assessed — out of requested scope. No performance profiling was run.
- **BUG dimension** — Static scan only. No dynamic analysis, no fuzzing, no interactive security review was performed.
- **Rust ecosystem** — `cargo outdated` and `cargo audit` were not run (no shell access to Rust toolchain). Dependency currency for `src-tauri/Cargo.toml` is based on manifest inspection only.
- **Network-dependent probes** — pnpm audit and pnpm outdated required network access; results reflect online latest versions.
- **UX dimension** — Static-only review. The Tauri desktop app cannot be launched for interactive UX testing.

## Next step

The plan derived from this report: [`MODERNIZATION_PLAN.md`](./MODERNIZATION_PLAN.md).
