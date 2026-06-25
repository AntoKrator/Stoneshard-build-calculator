---
title: 'feat: Game-faithful hybrid UI reskin (M1)'
type: feat
date: 2026-06-24
status: ready
origin: 'docs/brainstorms/2026-06-24-complete-build-calculator-requirements.md (Milestone M1)'
---

# feat: Game-faithful hybrid UI reskin (M1)

## Summary

Reskin the Phase-1 build planner to read as Stoneshard without losing readability: shift the palette to the game's, put a self-hosted pixel/display font on headers, give panels a beveled "game" frame, and keep the body text modern and the layout responsive. The change is **visual-only** — driven through the existing CSS theme tokens so component logic and seams stay untouched. This is the first milestone (M1) of the larger build-and-combat roadmap; gear, damage, and enemy work are separate later plans.

---

## Problem Frame

The app works but doesn't look like Stoneshard. It uses an own-design dark-parchment theme (a clean modern sans, rounded panels, a gold accent) rather than the game's denser, bronze-framed, pixel-font aesthetic. Phase 1 deliberately chose not to pixel-match; the roadmap now overturns that to make the tool read as part of the game's world. The chosen direction is **hybrid** (game palette + pixel-font headers + beveled frames, but readable body text and responsive layout), not a pixel-perfect replica — so the work is a themed restyle of the existing surfaces, not a UI rebuild. The risk to manage is regression: the 144-test logic core, the skill-tree/sheet/tooltip/share behavior, and the component seams must survive a styling pass unchanged.

---

## Key Technical Decisions

- **KTD1 — Token-first reskin.** Drive the palette and treatment change through the `:root` custom properties in `src/app.css` plus a small set of shared treatments. The 11 components and `src/App.svelte` already consume these tokens, so most of the new look lands centrally and per-component edits stay minimal — the lowest-regression path (advances R5).
- **KTD2 — Pixel font on headers only; readable body.** The display font is confined to titles/section headers/labels; body and stat text stay a modern readable sans. This is the hybrid direction the brainstorm chose and keeps the app usable and responsive (R2, R4) (see origin: `docs/brainstorms/2026-06-24-complete-build-calculator-requirements.md`).
- **KTD3 — Self-host the display font.** Ship an open-license pixel/display font as a local `woff2` via `@font-face`, referenced relatively — no external CDN. Works offline and under the GitHub Pages base path, matching the project's no-external-runtime-deps + `base: './'` posture (R2).
- **KTD4 — Beveled frames via CSS, not artwork.** Panel framing is CSS (border + inset/outset `box-shadow`) keyed to tokens, not `border-image` corner art. Themeable, light, asset-free; ornate frame artwork is deferred (R3).
- **KTD5 — Visual-only; the existing gates are the regression guard.** No component-mount test harness is added (consistent with Phase-1 KTD12). The 144-test suite, `svelte-check`, lint, and the production build staying green after each unit is what proves no logic or markup regressed (R5).

---

## Requirements

- R1. Retune the app's color theme to a Stoneshard palette across every existing surface, driven through the shared CSS theme tokens. (origin R13)
- R2. Titles, section headers, and labels use a self-hosted pixel/display font; body and numeric text stay a readable modern sans. (origin R13)
- R3. Panels and framed surfaces (the tree frame, side panels, tooltip, notice) carry a consistent beveled "game" treatment via CSS. (origin R13)
- R4. The layout stays responsive and readable — pixel font confined to headers, no text overflow or overlap, and the skill-tree viewport + pinned tooltip panel work at desktop and mobile widths. (origin R13)
- R5. The reskin is visual-only: no component logic, markup structure, props, or seams change; the existing test suite, type-check, lint, and build stay green, and the skill tree, character sheet, tooltips, share/copy, and `?build=` hydration keep working. (origin R14)

---

## Implementation Units

### U1. Hybrid theme foundation — palette tokens + self-hosted display font

**Goal:** Establish the new visual language centrally — retune the CSS theme tokens to the Stoneshard hybrid palette and add a self-hosted pixel/display font plus new tokens for the frame/bevel treatment and header font.
**Requirements:** R1, R2, R3 (origin R13).
**Dependencies:** none.
**Files:**

- `src/app.css` (retune `:root` token values; add `@font-face`; add `--font-display`, `--frame-shadow`, `--bevel-light`/`--bevel-dark` tokens)
- `public/fonts/<display-font>.woff2` (new self-hosted font asset)

**Approach:** Keep the existing token _names_ the components already reference (so they inherit the new look without edits) and shift their _values_ toward the game palette. Add new tokens for the header font and the bevel treatment. Register the self-hosted font with `@font-face` and point `--font-display` at it; leave the body font a readable sans. Exact hex values and the specific font are execution-time choices, derived from in-game screenshots / the reference tool — pin them during implementation, not in this plan.
**Patterns to follow:** the existing `:root` token block in `src/app.css`; relative static-asset references under `base: './'` (mirror how `public/img/abilities/` icons are referenced).
**Test scenarios:** _Test expectation: none — token + asset change with no behavior; covered by the suite + build staying green and manual visual check._
**Verification:** the app builds; existing tests, `svelte-check`, and lint pass; the display font loads in `npm run preview` (and resolves under the Pages-style base path).

### U2. Shared frame & header treatments

**Goal:** Provide reusable beveled-panel and pixel-header styling so the "game" framing is consistent and applied with minimal per-component code.
**Requirements:** R2, R3 (origin R13).
**Dependencies:** U1.
**Files:**

- `src/app.css` (extend the global element styles — `h1`–`h3`, `.panel`-style framing, `button` — and/or add small shared utility classes keyed to U1's tokens)

**Approach:** Extend the global styles `src/app.css` already defines so headings pick up `--font-display` and panels pick up the bevel tokens, rather than restyling each component from scratch. Where components repeat a local `.panel` block, align them to one shared treatment so all frames match. CSS-only; no markup or logic.
**Patterns to follow:** the existing global `h1`–`h3`, `button`, and `code` styles in `src/app.css`; the repeated `.panel` block across the side-panel components.
**Test scenarios:** _Test expectation: none — styling only._
**Verification:** panels across the app render the beveled frame and headers render in the display font; suite / check / build stay green.

### U3. Per-component reskin pass

**Goal:** Bring each component's local styles onto the new tokens and shared treatments, preserving structure, props, and behavior.
**Requirements:** R1, R3, R5 (origin R13, R14).
**Dependencies:** U1, U2.
**Files:** `<style>` blocks only of `src/App.svelte` and `src/components/{SkillTree,TreeSelector,AbilityNode,ConnectionLines,Icon,AttributePanel,LevelControls,CharacterSheet,Tooltip,ShareBar,Notice}.svelte`.
**Approach:** For each component, replace ad-hoc color literals with the retuned tokens and apply the shared frame/header treatment. Touch only `<style>` (and `class` attributes where needed) — never script logic, props, or markup structure. Specific spots: the four `AbilityNode` state styles must stay visually distinguishable in the new palette; `ConnectionLines` active/inactive edge colors; `TreeSelector` tab + category accents; the `Tooltip` color map values (retune, but keep it a **fixed** map — no attacker-influenced CSS, per Phase-1 KTD8); the `SkillTree` pinned tooltip panel; the sheet/attribute/level panels; `ShareBar`; `Notice`; the `Icon` fallback glyph.
**Execution note:** Visual-only — confine every edit to styles/classes; do not change script logic, props, or markup.
**Patterns to follow:** each component's existing `<style>` block and CSS-var usage; the fixed `Tooltip` color map (keep fixed).
**Test scenarios:** _Test expectation: none — visual-only restyle._
**Verification:** the existing 144 tests, `svelte-check`, lint, prettier, and the production build all stay green (proves no logic/markup regression); manual check that every component reads as the hybrid look and all four node states remain distinguishable.

### U4. Responsive & readability verification pass

**Goal:** Confirm the reskin is readable and responsive — pixel font confined to headers, no overflow/overlap, the tree viewport and tooltip panel usable on narrow screens.
**Requirements:** R4, R5 (origin R13, R14).
**Dependencies:** U3.
**Files:** `src/app.css` and affected component `<style>` blocks (responsive tweaks only); no new files.
**Approach:** Review at a desktop width and a ~375px mobile width. Ensure body/numeric text uses the readable sans (display font only on headers/labels), the single-column breakpoint still works, the skill-tree scroll viewport and the pinned tooltip panel behave, and nothing overflows or overlaps. Adjust spacing/sizes as needed. With no browser automation in this environment, this is a code-level responsive review plus a manual check via `npm run dev` / `preview`.
**Patterns to follow:** the existing `@media (max-width: 880px)` block in `src/App.svelte`; the tree-viewport + tooltip-panel sizing in `src/components/SkillTree.svelte`.
**Test scenarios:** _Test expectation: none — layout/CSS only._
**Verification:** at desktop and ~375px, text is readable and unclipped, the tree scrolls within its viewport, and the tooltip panel stays usable; suite / check / build stay green; before/after screenshots captured.

---

## Scope Boundaries

**In scope:** the hybrid reskin — game palette, pixel-font headers, CSS beveled frames, responsive/readable layout — applied across the existing app as a visual-only change.

### Deferred to Follow-Up Work

- Decorative `border-image` frame artwork / ornate corner pieces (CSS bevels first).
- Iterative pixel-accurate palette tuning beyond a first faithful pass.
- A Svelte component-mount test harness for visual-regression coverage.
- Milestones M2–M5 (item extraction, gear + sheet, self/raw damage, enemy combat) — separate plans.

### Non-goals

- Pixel-perfect 1:1 replication of the game's UI (the chosen direction is hybrid, not pixel-faithful).
- Any change to component logic, behavior, props, data, or the share-code format.

---

## Risks & Dependencies

| Risk                                                      | Impact                          | Mitigation                                                                                  |
| --------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| A restyle accidentally edits markup/logic                 | Behavior regression             | Confine edits to `<style>`/class; 144-test suite + `svelte-check` + build are the guard (KTD5). |
| Pixel font over-applied                                   | Body text becomes hard to read  | Confine the display font to headers/labels; body stays sans (KTD2, R4).                      |
| Self-hosted font path breaks under the Pages base path    | Headers fall back to system font in production | Reference the font relatively like icons; verify under `build && preview` (KTD3).            |
| Beveled frames clash with existing component-local colors | Inconsistent look               | Route components onto shared tokens/treatments (U2, U3) rather than ad-hoc per-component colors. |

**Dependency:** an open-license pixel/display font suitable for self-hosting (selected at execution).

---

## Open Questions

**Deferred to implementation:**

- Exact palette hex values and the specific pixel/display font — derived from in-game screenshots / the reference tool during implementation.
- Whether any single panel warrants `border-image` framing instead of a CSS bevel (default: CSS bevel; revisit only if a surface clearly needs it).

---

## Verification

- **Gates (after each unit):** the existing suite (144 tests), `svelte-check`, `eslint`, `prettier --check`, and the production build all stay green — this is the proof the change stayed visual-only (R5).
- **Manual (the visual layer, per Phase-1 KTD12):** `npm run dev`; confirm the app reads as the hybrid Stoneshard look; all four skill-node states remain distinguishable; the tooltip panel and tree scroll behave; text is readable and unclipped at desktop and ~375px widths; the display font loads under a Pages-style base path via `npm run build && npm run preview`. Capture before/after screenshots.

---

## Sources & Research

- **Codebase (current, verified):** the `:root` token block in `src/app.css`; 11 components in `src/components/` plus `src/App.svelte`, all consuming CSS variables; no web font today (system sans stack); 144 tests / `svelte-check` / build as the regression guard; Vite `base: './'` with relative static-asset handling (as used for `public/img/abilities/` icons).
- **Origin:** `docs/brainstorms/2026-06-24-complete-build-calculator-requirements.md` — Milestone M1, requirements R13/R14, and the hybrid-UI decision (chosen over pixel-faithful and over keeping the current look).
- **Look reference (gather at execution):** the in-game character/skill screens and the nstratos tool, for palette and framing cues.
- **Phase-1 patterns to preserve:** the fixed `Tooltip` color map (no attacker-influenced CSS — KTD8); the manual-verification posture for components (KTD12); `base: './'` asset relativity.
