---
title: 'feat: Attribute cap (30) + character-select data lock-in'
date: 2026-06-25
type: feat
status: planned
depth: standard
---

# feat: Attribute cap (30) + character-select data lock-in

## Summary

Two cohesive build/character-side changes:

1. **Cap each primary attribute at 30.** Stoneshard caps STR/AGI/PER/VIT/WIL at 30 points (confirmed on all five official attribute pages), but the calculator enforces no per-attribute ceiling today — over a level-30 playthrough a single attribute can climb to ~39–40. Add a data-driven cap enforced in the recompute, the ledger guard, and the allocation UI, with a defensive clamp on decoded share codes.
2. **Lock in the character-select preset correctness.** This session's wiki research verified that all 9 presets already carry the correct starting attributes and innate abilities — so this is a *verify + regression-lock* pass (a reference-table test + provenance), not a re-curation. No preset data change is expected.

---

## Problem Frame

**Attribute cap.** `constants.json` caps *level* at 30 (`maxLevel: 30`), which grants 29 attribute points; with base 10 plus a preset's innate points, a single attribute reaches ~39–40. There is no per-attribute ceiling: `recompute` step 4 (`character.ts`) increments while budget remains, and `BuildLedger.addAttribute` (`ledger.svelte.ts`) checks only the point budget. The game forbids raising an attribute past 30, so the calculator currently models illegal builds and the derived sheet/skill-unlock math built on those attributes is wrong above 30.

**Character select.** The 9 presets shipped (seeded via the `selectCharacter` ledger op) with attributes that *looked* like a uniform "+1 to three attributes" approximation and mostly-empty starting skills, raising the question of whether they match the game. Research this session resolved it: the spreads are correct per the official wiki (every non-Verren character puts +3 across three attributes; Verren is straight 10s), and the innate-ability data is correct — only Dirwin (`halt`, whose dataset name is "Make a Halt") and Hilda (`resourcefulness`) have an innate skill, both already present, and the other seven correctly have none. The remaining risk is **silent drift**: nothing pins this verified-correct state, so a future edit or patch could quietly break it.

---

## Requirements

- **R1.** Each primary attribute (STR/AGI/PER/VIT/WIL) is capped at 30; point allocation can never raise an attribute above 30. → U1, U2.
- **R2.** The cap is data-driven (a constant), consistent with the existing `maxLevel`/`baseAttributeValue` posture, and flows through both loaders. → U1.
- **R3.** The `+` control is disabled at cap, and the cap state is visible so the user understands why. → U3.
- **R4.** A decoded/older share code that over-allocates an attribute clamps at 30 without crashing (fail-closed, mirroring existing patch-drift handling); the share codec is unchanged. → U2.
- **R5.** The character-select presets reflect each character's correct in-game starting attributes and innate abilities, verified against the official wiki, and that correctness is locked against future drift. → U4.

---

## Key Technical Decisions

### KTD1 — The cap is a data constant (`maxAttributeValue: 30`), not a hardcoded literal

Mirror the existing `maxLevel` / `baseAttributeValue` posture: add `maxAttributeValue` to the `Constants` schema (default 30) and set it in `constants.json`. Both loaders already read `constants.json` wholesale, so no per-file lockstep change is needed — the cap rides the existing constants section. This keeps the rule discoverable and patch-tunable in one place, exactly like the level cap.

### KTD2 — Enforce the cap at three layers, clamp defensively on decode

The cap is enforced where allocation happens and clamped where it can't be prevented:
- **Ledger guard** (`addAttribute`): refuse a `+` when the attribute is already at cap, returning a new `'at-cap'` reason — the analog of the existing `'no-points'` budget refusal.
- **UI** (`AttributePanel`): disable the `+` at cap and surface the cap state, mirroring the existing budget-disabled binding.
- **Recompute** (defensive): clamp `attributes[k]` at `maxAttributeValue` so a hand-built or older decoded ledger that over-allocates is corrected rather than crashing. A clamped increment is **skipped without advancing `attributesSpent`**, so a capped point is never silently wasted.

**Important — the cap-skip is NOT the same shape as the over-budget skip.** The existing over-budget check (`if (attributesSpent >= attributeBudget) continue`) is a *terminal LIFO sacrifice*: once over budget, the point is dropped and gone. The cap-skip is *non-terminal and budget-preserving*: a capped op is skipped, and its budget **rolls forward** to a later un-capped op in iteration order. This is deliberate (no wasted budget) but it means a capped allocation changes which later ops survive — so the two guards' order matters (**over-budget check stays first**, then the cap check, both before `attributes[e.attr]++`/`attributesSpent++`). In normal use the ledger never contains an at-cap `addAttribute` (the ledger guard + UI prevent it), so this roll-forward only matters for decoded/drifted codes.

The share codec is untouched: it serializes `addAttribute` ops, and the cap is a recompute-time rule (like the level cap and the LIFO budget), so old codes still decode and simply clamp.

### KTD3 — Character-select correctness is locked with a reference-table test, not new data or a new schema field

The data is already correct, so the work is a regression lock, not a migration. A test encodes the wiki-verified reference (each character's attributes + `startingSkills`) and asserts `presets.json` matches it, with the per-character source URLs recorded alongside the table as provenance. This fails CI on any future drift without adding a `properties`/provenance field to the `Preset` schema (which has no such field today). If the test ever surfaces a mismatch, `presets.json` is corrected to the reference — but none is expected.

---

## Implementation Units

### U1. `maxAttributeValue` constant

**Goal:** Add the data-driven per-attribute cap to the constants section.
**Requirements:** R2.
**Dependencies:** none.
**Files:**
- `src/lib/types.ts` — add `maxAttributeValue` to the `Constants` schema.
- `src/data/constants.json` — add `"maxAttributeValue": 30`.
- The existing schema/dataset-test file that covers `Constants`/`parseDataset` (e.g. `src/lib/validate.test.ts` — confirm the actual location; `src/lib/types.test.ts` does not exist today) — add the schema cases.

**Approach:** `maxAttributeValue: z.number().int().positive().default(30)`, mirroring `maxLevel`/`baseAttributeValue` (`src/lib/types.ts` `Constants`). Set 30 in `constants.json`. No loader change — `load.ts` and `validate-data.ts` already read the whole `constants.json`.

**Patterns to follow:** `maxLevel`, `baseAttributeValue` in the `Constants` schema and `constants.json`.

**Test scenarios:**
- `Constants.parse` accepts a constants object with `maxAttributeValue: 30`.
- Omitting the field defaults to 30 (backward-compat with any constants blob that predates it).
- `constants.json` parses through the dataset schema with the new field present.

### U2. Enforce the cap in recompute + the ledger guard

**Goal:** Make point allocation respect the cap, and clamp defensively on decode.
**Requirements:** R1, R4.
**Dependencies:** U1.
**Files:**
- `src/lib/build/character.ts` — clamp in `recompute` step 4 (attribute allocation).
- `src/lib/build/ledger.svelte.ts` — `addAttribute` cap guard; add `'at-cap'` to the `LedgerResult` reason union.
- `src/lib/build/character.test.ts`, `src/lib/build/ledger.test.ts` — tests.

**Approach (KTD2):** In `recompute` step 4, add a per-attribute cap guard **after** the existing over-budget check and before the increment: when `attributes[e.attr] >= maxAttributeValue`, `continue` without advancing `attributesSpent` (budget rolls forward — see KTD2; this is *not* the over-budget sacrifice). The clamp applies to `attributes[e.attr]` **after preset seeding** (the preset sets the base value before the allocation loop), so a preset-seeded value plus user points still caps at 30; note `invested[k] = attributes[k] − base` therefore reports the *clamped* invested count, which is correct (you can't invest past the cap). In `BuildLedger.addAttribute`, refuse with `{ ok: false, reason: 'at-cap' }` when `this.character.attributes[attr] >= maxAttributeValue`, reading the cap via `this.#dataset.constants.maxAttributeValue` (always defined — it `.default(30)`s, no `?? Infinity` needed, matching `levelUp`). Precedence when an attribute is both at cap and out of budget: either refusal is correct (the `+` is disabled either way); pick one deterministically and test it. Derived stats and skill unlocks need no change — they already read the (now-capped) attribute values.

**Patterns to follow:** the over-budget LIFO skip in `recompute` step 4 (`character.ts`); the `'no-points'` refusal in `addAttribute` (`ledger.svelte.ts:102-107`); the `Reason` union on `LedgerResult`.

**Test scenarios:**
- Happy path: allocate an attribute up to 30; the 31st `addAttribute` is refused with `'at-cap'` (budget permitting).
- Recompute clamp: a hand-built ledger with 25 `addAttribute` STR ops at a level whose budget covers them caps STR at 30; the excess increments are not applied and do not advance `attributesSpent` (no wasted budget).
- Budget roll-forward: a ledger with cap-skipped STR ops followed by AGI ops at a tight budget — the budget freed by the capped STR ops is spent by the trailing AGI ops (a capped point is reusable, not sacrificed), and a trailing op survives that pure over-budget LIFO would have dropped.
- Preset interaction: a preset that seeds an attribute at 11 plus user allocation caps that attribute at 30, not 31+; and `invested[k]` for that attribute equals `30 − base`, consistent with the points actually applicable (clamped, not the raw op count).
- Derived stats reflect the capped value (a stat keyed off STR uses 30, not the would-be 39).
- Fail-closed decode: a decoded ledger over-allocating an attribute clamps at 30 with no throw (R4).
- The minus path is unaffected — removing a point from a capped attribute re-enables further allocation.

### U3. AttributePanel cap UI

**Goal:** Disable the `+` at cap and make the cap state visible.
**Requirements:** R3.
**Dependencies:** U1, U2.
**Files:**
- `src/components/AttributePanel.svelte` — new `maxAttributeValue` prop, cap-aware disabled binding + cap indicator.
- `src/App.svelte` — pass `maxAttributeValue={dataset.constants.maxAttributeValue}` at the `<AttributePanel>` call site.

**Approach:** AttributePanel's `$props()` currently declares only `{ attributes, character, onAdd, onRemove }` and imports **no** dataset, so the cap value must be threaded in: add a `maxAttributeValue: number` prop and pass it from `App.svelte` (which holds `dataset`). Extend the existing `+` disabled binding (`AttributePanel.svelte:45`) to also disable when `character.attributes[a.key] >= maxAttributeValue`. Show the cap (e.g. a `value / 30` readout or a "max" hint on the capped row) so a disabled `+` reads as "at cap," not "out of points." Visual treatment uses the global `.panel`/token system (no new tokens).

**Patterns to follow:** the existing `disabled={available === 0}` binding and the `disabled={character.invested[a.key] === 0}` minus binding (`AttributePanel.svelte:40,45`).

**Test scenarios:**
- `Test expectation: none — Svelte components have no unit harness in this repo (documented in M1/M3).` Verify via `svelte-check` clean, production build clean, and CDP at 375 + 1280: an attribute raised to 30 shows the `+` disabled with a visible cap indicator, and lowering it re-enables `+`. Confirm `overflowX` is 0 at both widths.

### U4. Lock in character-select preset correctness

**Goal:** Pin the wiki-verified preset data with a regression test + provenance, so future drift fails CI.
**Requirements:** R5.
**Dependencies:** none (independent of U1–U3).
**Files:**
- `src/lib/presets.reference.test.ts` (new) — the reference-table assertion + provenance URLs. This is the only net-new work.
- `src/data/presets.json` — no change expected; corrected only if the reference test surfaces a mismatch.

**Approach (KTD3):** Encode the wiki-verified reference as a table in the test: per character, the five attribute values and the `startingSkills` array (Verren 10/10/10/10/10 + none; Dirwin `['halt']`; Hilda `['resourcefulness']`; the other seven +3-across-three with empty skills). Assert `presets.json` matches it field-by-field. Record the per-character source URLs (e.g. `stoneshard.com/wiki/<Name>` and `/Traits`) as a comment block above the table so every asserted value is auditable. No `validate.ts` change is needed — `checkPresets` already emits `unknown-preset-skill` (startingSkills → skills) and `unknown-preset-tree` (affinities → trees); the reference test is purely additive.

**Scope of "correct":** the lock covers each character's **starting attribute spread** and **innate-ability presence** (the two things research verified). It does **not** cover trait *effects*, starting equipment/crowns, or affinity unlock-relaxation — those are separately deferred (see Scope Boundaries), so "verify + lock" fully answers the attributes-and-skills correction ask without implying those are handled.

**Execution note:** Characterization-style — write the reference-table assertion first. It must pass against current `presets.json` (proving the data is correct), and would fail on any future drift.

**Patterns to follow:** the existing `checkPresets` cross-checks in `src/lib/validate.ts`; the dataset import used by other data tests.

**Test scenarios:**
- Each preset's five attributes equal the wiki reference values; non-Verren sums to base + 3, Verren is all 10s.
- `Dirwin.startingSkills` is exactly `['halt']`, and that key resolves to a skill whose name is "Make a Halt"; `Hilda.startingSkills` is exactly `['resourcefulness']`.
- The other seven presets have empty `startingSkills`.
- Every preset's `startingSkills` key and every affinity id resolves in the dataset (cross-ref integrity; a typo'd key fails).
- A deliberately mutated fixture (e.g. Velmir STR 12) fails the reference assertion — proving the lock catches drift.

---

## Scope Boundaries

### In scope
The per-attribute cap of 30 (constant, recompute clamp, ledger guard, allocation UI, defensive decode) and a verify-and-lock pass on the character-select preset data.

### Deferred to follow-up work
- Any preset data change — none is expected; this plan only locks in the verified-correct state.

### Deferred for later (carried from the character-select feature)
- Trait *effects* and affinity unlock-relaxation (labels/metadata only today).
- Per-character starting equipment/crowns; custom character creation.

### Outside scope
- Gear/buff bonuses that push an attribute's *effective* value past 30. This plan caps the **invested/base** attribute (what point allocation controls); gear-derived contributions to the sheet are a separate concern and are not retroactively clamped to 30.

---

## Open Questions

Resolved as decisions; none block starting.

- **Base-vs-effective cap semantics.** The wiki states each attribute is "capped at 30 points" without explicitly scoping it to invested vs gear/buff value; community mechanics docs indicate the cap applies to the queried value with situational overstacking. *Decision:* cap the invested/base attribute at 30 (correct for a point-allocation calculator); treat gear/buff bonuses as out of this cap's scope. Medium confidence on the precise semantics — cited from community sources, not verbatim wiki. *Falsifying check:* if the in-game cap is actually on the *effective* value, a build with base 28 + gear +5 would clamp to 30 in-game while this calculator reports 33 — so any derived stat that reads the effective value above 30 could over-report. Verify this one scenario in-game before trusting effective-stat math above 30; the base-only cap on point allocation is the safe choice regardless.
- **At-cap point accounting.** A `+` at cap is prevented by the ledger guard + UI; the recompute clamp is purely defensive for decoded/drifted codes. *Decision:* clamp the value and skip the increment without spending budget, so no point is wasted.

---

## Risks & Mitigations

- **Cap interacts with LIFO budget accounting.** A clamped increment that wrongly advanced `attributesSpent` would silently waste a point. *Mitigation:* skip-without-spend, with an explicit recompute test asserting the budget is intact after a clamp (U2).
- **Reference-table test brittleness vs. a future wiki/patch update.** *Mitigation:* the test pins a documented snapshot with provenance URLs; a future legitimate change is a deliberate review trigger (update the reference + data together), not a silent pass — which is the intended behavior of a lock.
- **UI cap state read as "out of points."** A disabled `+` at cap could confuse. *Mitigation:* a distinct cap indicator (U3), separate from the budget-exhausted state.

---

## Sources & Research

- **Attribute cap (verified this session):** the five official attribute pages each state the cap verbatim — `stoneshard.com/wiki/Strength` ("Strength is capped at 30 points."), `/Agility`, `/Perception`, `/Vitality`, `/Willpower`. High confidence on cap = 30 per attribute. Base 10 corroborated by every character infobox.
- **Character starting data (verified this session):** per-character pages (`stoneshard.com/wiki/Verren`, `/Velmir`, `/Jorgrim`, `/Arna`, `/Dirwin`, `/Jonna`, `/Mahir`, `/Leosthenes`, `/Hilda`) for attributes + affinities; `stoneshard.com/wiki/Traits` for the two trait-granted innate abilities (Dirwin "Make a Halt", Hilda "Resourcefulness"). All 9 presets confirmed matching current `presets.json`. No central character datastring exists; per-character pages + the Traits page are canonical.
- **Codebase patterns to mirror:** `Constants` schema + `constants.json` (`maxLevel`, `baseAttributeValue`); `recompute` step 4 over-budget skip and the `selectCharacter` preset seeding (`src/lib/build/character.ts`); `addAttribute` budget refusal (`src/lib/build/ledger.svelte.ts`); the `+`/`−` disabled bindings (`src/components/AttributePanel.svelte`); `checkPresets` cross-checks (`src/lib/validate.ts`).
