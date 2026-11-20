# Modernization Plan — BetterShot

Derived from [`MODERNIZATION_REPORT.md`](./MODERNIZATION_REPORT.md) · **Baseline at audit:** GREEN
**Test command of record:** `pnpm test` · **Pass rate at audit:** 212/212

Every P0–P4 task's acceptance criteria include `"pnpm test passes at ≥ 212/212"`.

## At a glance

| Phase | Sprints | Tasks | Closes | Milestone |
|---|---|---|---|---|
| Pre Agent environment | 1 | 3 | — (enables ME) | ME |
| P0 Stabilize | 1 | 1 | — (baseline already green) | M0 |
| P1 Secure & Patch | 1 | 3 | 1 Critical, 7 High | M1 |
| P2 Modernize | 1 | 3 | 3 Medium | M2 |
| P3 Clean & Harden | 1 | 3 | 1 High, 2 Medium | M3 |
| P4 Polish | 1 | 3 | 2 Medium, 2 Low | M4 |

**Critical path:** Task Pre.1 → Pre.2 → 0.1 → 1.1 → 1.2 → [any parallel task] (~5 days).
Nothing in P0–P4 starts before ME.

## Phase Pre — Agent environment

**Goal:** Make the project environment agent-runnable; create/improve CLAUDE.md and AGENTS.md. · **Milestone ME:** both files exist with recorded build/test commands documented.

### Sprint Pre — Agent-runnable environment

#### Task Pre.1: Document the project environment

**Description:** Create a `.pi/PROJECT.md` (or equivalent) file that documents the toolchain, build commands, test commands, and non-obvious repo etiquette so an agent can proceed without human context.

**Closes:** — (milestone-enabling: ME)

**Acceptance Criteria**:
- [ ] File documents: `pnpm install`, `pnpm run build`, `pnpm test`, `pnpm run test:coverage`, `pnpm run lint:ci`, `pnpm tauri dev`, `pnpm tauri build`
- [ ] File documents: macOS-only app, Rust toolchain required for Tauri backend, Node.js 22+ LTS
- [ ] A later agent can follow those notes from project files alone

**Dependencies**: None

**Effort**: S

**Verify:** `cat .pi/PROJECT.md | grep -c 'pnpm test'`

#### Task Pre.2: Create or improve CLAUDE.md

**Description:** File absent → `/agent-config create` targeting `CLAUDE.md`. File present → `/agent-config update`. Serves milestone ME.

**Closes:** — (milestone-enabling: ME)

**Acceptance Criteria**:
- [ ] `CLAUDE.md` exists at the repo root (create via `/agent-config` if absent)
- [ ] `CLAUDE.md` names the recorded build/test commands

**Dependencies**: Pre.1

**Effort**: S

**Verify:** `test -f CLAUDE.md`

#### Task Pre.3: Create or improve AGENTS.md

**Description:** File absent → `/agent-config create` targeting `AGENTS.md`. File present → `/agent-config update`. Serves milestone ME.

**Closes:** — (milestone-enabling: ME)

**Acceptance Criteria**:
- [ ] `AGENTS.md` exists at the repo root (create via `/agent-config` if absent)
- [ ] `AGENTS.md` is improved against agent-config checklists

**Dependencies**: Pre.1

**Effort**: S

**Verify:** `test -f AGENTS.md`

## Phase P0 — Stabilize

**Goal:** Verify baseline-green still holds; ensure CI runs the suite. · **Milestone M0:** clean checkout → build + suite green in CI.

### Sprint 0 — Baseline verification

#### Task 0.1: Verify baseline-green

**Description:** Confirm the build, tests, and lint still pass on a clean checkout. This is a gate — if any step fails, the baseline is RED and P0 becomes "restore green."

**Closes:** — (verifies baseline)

**Acceptance Criteria**:
- [ ] `pnpm run build` succeeds from a clean checkout
- [ ] `pnpm test` passes at ≥ 212/212
- [ ] `pnpm run lint:ci` (tsc --noEmit) reports 0 errors

**Dependencies**: Pre.2, Pre.3

**Effort**: S

**Verify:** `pnpm run build && pnpm test && pnpm run lint:ci`

## Phase P1 — Secure & Patch

**Goal:** Close all High/Critical vulnerabilities; bring patch/minor dependencies current. · **Milestone M1:** `pnpm audit` reports 0 high+ advisories; patch/minor current.

### Sprint 1 — Security patches

#### Task 1.1: Patch critical and high vulnerabilities (W1)

**Description:** Upgrade vitest 4.0.17 → 4.1.11 (closes GHSA-5xrq-8626-4rwp critical), vite 7.3.1 → 7.3.5 (closes 3 high vulns), and their transitive deps (rollup, picomatch, ws, postcss, nanoid).

**Closes:** `F-DEP-001`, `F-DEP-002`, `F-DEP-003`, `F-DEP-004`, `F-DEP-005`, `F-DEP-006`, `F-DEP-007`

**Acceptance Criteria**:
- [ ] `pnpm audit` reports 0 critical and 0 high vulnerabilities
- [ ] `pnpm test` passes at ≥ 212/212 after upgrade
- [ ] `pnpm run build` succeeds

**Dependencies**: 0.1

**Effort**: S

**Verify:** `pnpm audit | grep -c 'critical\|high'`

#### Task 1.2: Patch minor and patch dependencies (W2)

**Description:** Upgrade all remaining patch/minor gaps: Radix UI (4 packages), Tauri plugins (5 packages), immer, postcss, tailwind-merge, @types/*, and other minor updates.

**Closes:** `F-DEP-015`, `F-DEP-016`, `F-DEP-017`, `F-DEP-018`, `F-DEP-019`, `F-DEP-020`, `F-DEP-021`, `F-DEP-022`, `F-DEP-023`, `F-DEP-024`, `F-DEP-025`, `F-DEP-026`, `F-DEP-027`, `F-DEP-028`, `F-DEP-029`, `F-DEP-030`, `F-DEP-031`, `F-DEP-032`, `F-DEP-033`

**Acceptance Criteria**:
- [ ] `pnpm outdated` shows only major gaps (no patch/minor remaining)
- [ ] `pnpm test` passes at ≥ 212/212
- [ ] `pnpm run build` succeeds

**Dependencies**: 1.1

**Effort**: S

**Verify:** `pnpm outdated`

#### Task 1.3: Enable CI workflow

**Description:** Re-enable the GitHub Actions release workflow (rename `release.yml.disabled` → `release.yml`) and add a lightweight CI workflow that runs build + test + lint on every push to main and on PRs.

**Closes:** `F-CI-001`

**Acceptance Criteria**:
- [ ] `.github/workflows/release.yml` exists and is enabled
- [ ] A new `.github/workflows/ci.yml` runs `pnpm run build`, `pnpm test`, and `pnpm run lint:ci`
- [ ] CI triggers on `push` to `main` and `pull_request`

**Dependencies**: 1.2

**Effort**: S

**Verify:** `test -f .github/workflows/ci.yml && grep -c 'pnpm test' .github/workflows/ci.yml`

## Phase P2 — Modernize

**Goal:** Upgrade major dependencies one at a time, each verified against baseline-green. · **Milestone M2:** every major current or deferred with written rationale.

### Sprint 2 — Major dependency upgrades

#### Task 2.1: Upgrade @testing-library/jest-dom 6.9.1 → 7.0.1

**Description:** Single major bump for testing utilities. Check the migration guide for breaking changes (likely API changes in matchers). Verify all 13 test files still pass.

**Closes:** `F-DEP-008` (excluded from task 1.2 — W4 major bump)

**Acceptance Criteria**:
- [ ] `pnpm test` passes at ≥ 212/212
- [ ] No test file imports fail
- [ ] Migration guide consulted (CHANGELOG or npm page)

**Dependencies**: 1.2

**Effort**: S

**Verify:** `pnpm test`

#### Task 2.2: Upgrade @vitejs/plugin-react 4.7.0 → 6.1.1

**Description:** Two-major bump for the Vite React plugin. Check for breaking changes in plugin options and React 19 compatibility. Verify build succeeds.

**Closes:** `F-DEP-009`

**Acceptance Criteria**:
- [ ] `pnpm run build` succeeds
- [ ] No build warnings about deprecated plugin options
- [ ] `pnpm test` passes at ≥ 212/212

**Dependencies**: 1.2

**Effort**: S

**Verify:** `pnpm run build`

#### Task 2.3: Upgrade jsdom 27.4.0 → 30.0.1

**Description:** Two-major bump for the test environment. jsdom 30.x may have breaking API changes. Verify all tests that use jsdom (13 files) still pass.

**Closes:** `F-DEP-010`

**Acceptance Criteria**:
- [ ] `pnpm test` passes at ≥ 212/212
- [ ] No jsdom-related test failures
- [ ] Migration guide consulted (jsdom GitHub releases)

**Dependencies**: 1.2

**Effort**: S

**Verify:** `pnpm test`

## Phase P3 — Clean & Harden

**Goal:** Improve code quality, increase test coverage, reduce technical debt. · **Milestone M3:** coverage ≥ 40% (17% + 20pp, floored at 60% not reached — target is "coverage tool configured and reports a number" since 17% + 20pp = 37% < 60%); duplication below threshold; zero `any` in the named scope.

### Sprint 3 — Code quality and coverage

#### Task 3.1: Extract inline styles from PropertiesPanel

**Description:** PropertiesPanel.tsx has 23 inline `style={{}}` objects with hardcoded oklch colors. Extract to a style constants file or convert to Tailwind utility classes.

**Closes:** `F-CLEAN-003`

**Acceptance Criteria**:
- [ ] No inline `style={{` objects with hardcoded oklch values remain in PropertiesPanel.tsx
- [ ] Visual appearance is unchanged (manual verification or screenshot comparison)
- [ ] `pnpm test` passes at ≥ 212/212 (no test for this component, but build must succeed)
- [ ] `pnpm run build` succeeds

**Dependencies**: 1.2

**Effort**: S

**Verify:** `grep -c 'style={{.*oklch' src/components/editor/PropertiesPanel.tsx`

#### Task 3.2: Add tests for uncovered modules

**Description:** Add unit tests for the highest-impact uncovered modules: `src/lib/canvas-utils.ts` (0% coverage, 467 lines), `src/lib/auto-process.ts` (0%, 152 lines), `src/hooks/useEditorState.ts` (0%, 254 lines), `src/hooks/useEditorSettings.ts` (0%, 146 lines).

**Closes:** `F-TEST-001`

**Acceptance Criteria**:
- [ ] Tests exist for at least 2 of the 4 listed modules
- [ ] `pnpm test` passes at ≥ 212/212 (new tests included)
- [ ] Overall coverage increases by ≥ 5 percentage points

**Dependencies**: 1.2

**Effort**: M

**Verify:** `pnpm run test:coverage | grep 'All files'`

#### Task 3.3: Add Rust integration tests

**Description:** `src-tauri/src/commands.rs` is 830 lines with zero tests. Add integration tests for the Tauri commands using `tauri::test` or a similar approach.

**Closes:** `F-TEST-002`

**Acceptance Criteria**:
- [ ] At least 3 Tauri command handlers have integration tests
- [ ] `cd src-tauri && cargo test` passes
- [ ] Tests cover both success and error paths

**Dependencies**: 1.2

**Effort**: M

**Verify:** `cd src-tauri && cargo test`

## Phase P4 — Polish

**Goal:** Improve UX accessibility, clean up docs, remove remaining dead code. · **Milestone M4:** UX findings closed; docs match code.

### Sprint 4 — Final polish

#### Task 4.1: Add ARIA labels to editor panels

**Description:** Add `aria-label` or `aria-labelledby` to the PropertiesPanel, CropOverlay, and other editor panels so screen readers can identify their purpose.

**Closes:** `F-UX-001`, `F-UX-002`

**Acceptance Criteria**:
- [ ] PropertiesPanel has `aria-label` or `aria-labelledby`
- [ ] CropOverlay has visible cancel instruction (aria-label or text element)
- [ ] `pnpm test` passes at ≥ 212/212
- [ ] `pnpm run build` succeeds

**Dependencies**: 1.2

**Effort**: S

**Verify:** `grep -c 'aria-label\|aria-labelledby' src/components/editor/PropertiesPanel.tsx src/components/editor/CropOverlay.tsx`

#### Task 4.2: Add unsaved-changes indicator to Preferences

**Description:** Preferences page allows shortcut modification without confirmation. Add a save/confirm pattern or a "changes not saved" indicator.

**Closes:** `F-UX-003`

**Acceptance Criteria**:
- [ ] Shortcut modifications show an unsaved-changes indicator
- [ ] Changes are persisted on explicit save or page exit
- [ ] `pnpm test` passes at ≥ 212/212

**Dependencies**: 1.2

**Effort**: S

**Verify:** Manual review of PreferencesPage.tsx

#### Task 4.3: Update CONTRIBUTING.md Node.js version

**Description:** README and CONTRIBUTING reference "Node.js 18+" which is outdated. Update to "Node.js 22 LTS or higher."

**Closes:** `F-DOCS-002`

**Acceptance Criteria**:
- [ ] `CONTRIBUTING.md` says "Node.js 22 LTS or higher" (or current LTS)
- [ ] `README.md` prerequisites section is consistent

**Dependencies**: 1.2

**Effort**: S

**Verify:** `grep -i 'node' CONTRIBUTING.md README.md`

## Dependency table

| Task | Depends on | Blocks | Wave |
|---|---|---|---|
| Pre.1 | — | Pre.2, Pre.3, 0.1 | W0 |
| Pre.2 | Pre.1 | 0.1, 1.3 | W0 |
| Pre.3 | Pre.1 | 0.1 | W0 |
| 0.1 | Pre.2, Pre.3 | 1.1 | W0 |
| 1.1 | 0.1 | 1.2 | W1 |
| 1.2 | 1.1 | 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3 | W2 |
| 1.3 | 1.2 | — | W2 |
| 2.1 | 1.2 | — | W4 |
| 2.2 | 1.2 | — | W4 |
| 2.3 | 1.2 | — | W4 |
| 3.1 | 1.2 | — | — |
| 3.2 | 1.2 | — | — |
| 3.3 | 1.2 | — | — |
| 4.1 | 1.2 | — | — |
| 4.2 | 1.2 | — | — |
| 4.3 | 1.2 | — | — |

## Execution waves

| Wave | Tasks |
|---|---|
| 1 | Pre.1 |
| 2 | Pre.2, Pre.3 |
| 3 | 0.1 |
| 4 | 1.1 |
| 5 | 1.2, 1.3 |
| 6 | 2.1, 2.2, 2.3 |
| 7 | 3.1, 3.2, 4.3 |
| 8 | 3.3 |
| 9 | 4.1, 4.2 |

## Milestones

| ID | Phase | Exit condition (measurable) | Verify with |
|---|---|---|---|
| ME | Pre | `CLAUDE.md` and `AGENTS.md` exist; recorded build/test commands documented | `test -f CLAUDE.md && test -f AGENTS.md` |
| M0 | P0 | clean checkout → build + suite green | `pnpm run build && pnpm test && pnpm run lint:ci` |
| M1 | P1 | `pnpm audit` reports 0 high+ advisories | `pnpm audit` |
| M2 | P2 | All major deps upgraded or deferred with rationale | `pnpm outdated` |
| M3 | P3 | Coverage tool reports a number; unused code removed | `pnpm run test:coverage` |
| M4 | P4 | ARIA labels added; docs updated | `grep -c 'aria-label' src/components/editor/` |

## Deferred and out of scope

| ID | Severity | Why deferred | Revisit when |
|---|---|---|---|
| F-DEP-012 | Medium | TypeScript 5.8 → 7.0 is a very large jump (2 majors); requires code review of breaking changes | When a major version bump cycle is planned |
| F-DEP-013 | Medium | Vite 7 → 8 is a major bump with unknown breaking changes | When Vite 8 is well-established |
| F-DEP-014 | Medium | lucide-react 0.562 → 1.39 is a massive jump with icon API changes | When icon library rebrand is accepted |
| F-DEP-011 | Medium | motion 12 → 13 may have animation API changes | After reviewing motion v13 migration guide |
| F-SEC-002 | Low | console.error cleanup is low-impact; no structured logger needed for a local-only app | When error tracking is required |
| F-CLEAN-001 | Medium | editorStore.ts (1015 lines) is large but well-organized; splitting is a refactor, not a fix | When adding features that touch multiple concerns |
| F-CLEAN-002 | Medium | usePreviewGenerator.ts (607 lines) is complex but functional | When canvas rendering performance becomes a concern |
| F-CI-002 | Medium | Pre-commit hooks are nice-to-have; CI workflow (task 1.3) is the higher-impact gate | When code quality gates become a priority |
| F-CLEAN-004 | Low | No clearly unused imports detected in App.tsx; `lazy` is used at lines 26-30 | N/A — finding removed from active scope |
| F-DEAD-002 | Low | Card component is imported in 4 files but lives in a generic `ui/` barrel — whether it serves as a shared primitive or dead weight needs audit | Before consolidating UI components |
| F-DEAD-001 | Medium | Asset registry staleness is a maintenance concern, not a blocker | Before adding/removing assets |
| F-DEAD-003 | Low | Single-use onboarding module is fine as-is; inlining would reduce clarity | If App.tsx grows further |
| F-DOCS-001 | Low | Version in README prose is nice-to-have; badges are current | During a docs refresh |
| F-SEC-001 | Medium | localStorage for onboarding state is acceptable; documenting the pattern is low-impact | During a security audit |

## Risks

| Risk | Affects | Mitigation |
|---|---|---|
| Vite 7.3.1 → 7.3.5 patch may have unexpected side effects | Tasks 1.1, 1.2 | Verify `pnpm test` after each upgrade; roll back if tests fail |
| Major dependency upgrades (jsdom, testing-library) may break tests | Tasks 2.1, 2.3 | Each upgrade is a separate task; verify tests immediately |
| Rust toolchain not available for task 3.3 | Task 3.3 | Mark as "deferred" if `cargo test` cannot run; use static analysis as fallback |
| No test coverage on editorStore (1015 lines) | Tasks 3.2, 3.3 | Add characterization tests first; treat as spike if coverage is too hard |
