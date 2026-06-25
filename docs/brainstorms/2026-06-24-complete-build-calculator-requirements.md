---
date: 2026-06-24
topic: complete-build-calculator
title: 'Toward a complete Stoneshard build-and-combat calculator'
---

# Toward a complete Stoneshard build-and-combat calculator

## Summary

Grow the Phase-1 talent planner into a full build-and-combat calculator: equip real items from a curated gear database, complete the derived stat sheet, and show damage **both ways** — your output and effective HP first, then a full matchup where you pick any enemy and toggle the skills they use — all reskinned in a game-faithful but readable hybrid UI. This is a sequenced roadmap across several milestones, not a single feature.

## Problem Frame

Phase 1 shipped a usable, shareable talent planner: trees, attributes, an attribute-driven sheet, safe tooltips, share codes. But it stops where the interesting build decisions begin. The derived sheet is attribute-only (28 stats; no armor, resistances, block, or weapon efficiency), there is no gear, and there is no damage or survivability figure — so a player still can't answer "how hard does this build hit, and can it survive that fight?" The reference tool (nstratos) is talent-only and won't, so the differentiation the project exists for — gear, damage, combat — is exactly the unbuilt part. The app also currently uses its own modern dark theme rather than reading as Stoneshard, which undersells it next to the game.

## Key Decisions

- **Curated item database, not manual stat entry.** Players equip real Stoneshard items per slot rather than typing in gear stats. This is the most game-true experience, and it commits the gear track to a real item-extraction effort before any gear value lands.
- **Damage is "deal + take," with self/raw before enemy combat.** The headline pair is outgoing damage and survivability. The first rung models the build alone (output + effective HP, no enemy); the capstone adds an enemy database and a build-vs-enemy matchup. The intermediate rung delivers value before the larger enemy-extraction effort.
- **Enemy combat is a full matchup, not a damage multiplier.** The player picks any enemy and toggles which abilities it uses; both directions of the exchange are computed, which means enemy abilities are modeled with formulas the way player skills are.
- **Hybrid UI over pixel-faithful.** Adopt Stoneshard's palette, pixel-font headers, and beveled framing while keeping modern readable body text, spacing, and responsiveness. This reopens and overturns the Phase-1 decision to use an own-design look and not pixel-match.
- **Two extraction pipelines gate the arc.** Items and (later) enemies are both data the project does not have. Each must be extracted into a validated, versioned dataset under the existing data-gate posture before its feature can produce real numbers.

## Requirements

**Gear & items**

- R1. Players browse/search a curated database of real Stoneshard items and equip one per equipment slot; the slot set matches the in-game equipment screen (main hand, off hand, head, body, gloves, boots, cloak, amulet, ring(s)).
- R2. Equipped gear contributes its stats to the derived sheet and recomputes live, the same way attributes do today.
- R3. Weapons are a first-class item category carrying at least a damage range, damage type, and weapon-specific modifiers that feed the damage model.
- R4. Item data is extracted from an authoritative source into a versioned dataset that passes the schema + referential-integrity gate with zero un-allowlisted warnings.

**Derived stat sheet completion**

- R5. The derived sheet models the offensive and defensive stats gear and skills drive (armor, resistances, block, evasion/dodge, weapon efficiency, armor penetration, crit chance/efficiency, and the rest the damage and survivability calcs need), beyond today's attribute-only set.
- R6. Skill-passive contributions feed the sheet, so Phase-1 tooltips that currently resolve to the neutral marker begin resolving as their backing stats become modeled.

**Damage — self/raw (first rung)**

- R7. The calculator computes outgoing damage from the build alone — a per-hit range, crit, and a damage-per-turn figure that accounts for cooldown/energy where applicable — before any enemy mitigation.
- R8. The calculator computes survivability — effective HP derived from raw HP scaled by armor, resistances, and block/dodge — without modeling a specific enemy.
- R9. Damage and survivability figures degrade gracefully when an input is missing (no weapon equipped, an unmodeled stat): show a neutral marker, never a wrong or silently-zero number.

**Enemy-vs-build combat (capstone)**

- R10. An enemy database covers the game's enemies, each selectable, with combat stats (HP, armor, resistances, evasion, etc.) and an ability set.
- R11. For a selected enemy, the player toggles which abilities it uses; a matchup view shows the damage the build deals into that enemy and the damage the enemy's selected abilities deal back to the build.
- R12. Enemy abilities are modeled with damage formulas (mirroring the player-skill engine) so enemy output is computed from the matchup, not stored as a static number.

**Game-faithful UI**

- R13. The app is reskinned to the hybrid direction: Stoneshard palette, pixel-font headers, and beveled framing, with modern readable body text, spacing, and a responsive layout that still works on mobile.
- R14. The reskin is visual-only over the existing tested logic and component seams — the skill tree, sheet, tooltips, and share flow keep working unchanged.

**Cross-cutting**

- R15. New datasets (items, enemies) flow through both data loaders in lockstep and the validate-data gate, matching the Phase-0/1 data posture.
- R16. Share codes carry the expanded build (gear, and later enemy selection) under the versioned, bounded, schema-validated codec; older or unknown codes still fail closed.

## Key Flows

- F1. **Equip a build.** From an existing build (level, attributes, skills), the player opens a slot, searches the item database, and equips an item; the derived sheet and damage figures update live. **Covers R1, R2.**
- F2. **Read damage both ways (self).** As gear and attributes change, the player watches outgoing damage (per-hit/DPS) and effective HP update together. **Covers R7, R8.**
- F3. **Run an enemy matchup.** The player selects an enemy, toggles the abilities it uses, and reads the two-way exchange — their damage into the enemy and the enemy's damage into them. **Covers R10, R11.**

## Acceptance Examples

- AE1. With no weapon equipped, the outgoing-damage figures show the neutral marker rather than 0 or a wrong number; equipping a weapon resolves them. **Covers R9.**
- AE2. Selecting an enemy with all abilities toggled off still shows the build's damage into it and the enemy's basic-attack damage back; toggling an ability on adds that ability's computed output to the incoming side. **Covers R11, R12.**
- AE3. A share code created before gear existed still loads (fails closed on the unknown shape or hydrates the talents-only portion); a current code round-trips the equipped build. **Covers R16.**

## Milestones (recommended sequence)

The arc is roughly the master plan's Phases 2–5 plus the UI reskin, sequenced so value lands before each large extraction effort.

- M1 — **Hybrid UI reskin.** Independent of the data work; an early, motivating visual win. (Ordering is an open question — see below.)
- M2 — **Item-data spike + extraction pipeline.** Resolve the source (UMT vs wiki) and stand up the validated item dataset. Gates everything downstream.
- M3 — **Gear model + equipment UI + stat-sheet completion.** Equip items; gear and passives feed a finished sheet (R2, R5, R6).
- M4 — **Self/raw damage.** Outgoing output + effective HP (R7, R8, R9).
- M5 — **Enemy combat capstone.** Enemy extraction, enemy-ability engine, and the matchup view (R10–R12). Large enough to be its own brainstorm/milestone if planning prefers.

## Scope Boundaries

Deferred for later (acknowledged, not in this arc):

- Enchantments and legendaries (Ancient Echoes) and item-quality/affix rolls — the gear database starts with base items.
- Two-build side-by-side comparison.
- Manual/homebrew gear entry — explicitly rejected in favor of the curated database.

Outside this effort's identity:

- A turn-by-turn combat simulator with positioning, status effects over time, and AI decision-making — the enemy matchup is a damage-exchange preview, not a fight simulation.

## Dependencies / Assumptions

- **Item extraction is the critical path** for the entire gear→damage arc; nothing in M3–M5 produces real numbers until items exist.
- **Enemy extraction + ability modeling** is a second, larger data effort gating M5.
- **A completed derived stat sheet is a prerequisite** for meaningful damage and survivability (assumed folded into M3).
- The durable extraction source is the project's UMT pipeline (currently a skeleton under `tools/`); the wiki is a faster but messier alternative. The choice is unresolved (see Outstanding Questions).
- Assumes game-accurate damage formulas are the target fidelity, re-derived from the same vendored/wiki sources used for Phase 1, with the Phase-1 fail-closed posture when an input is unmodeled.

## Outstanding Questions

Resolve before planning:

- **Item-data source:** UMT pipeline (authoritative, heavy) vs wiki scrape (faster, messier). Gates the whole arc; likely warrants a short spike.
- **UI reskin ordering:** land M1 early as assumed, or sequence the reskin last as polish?
- **Doc/milestone packaging:** keep the enemy-combat capstone (M5) in this roadmap, or split it into its own brainstorm once self/raw damage ships?

Deferred to planning:

- Damage-formula fidelity (full game-accurate model vs an approximate comparison metric) and how attack speed/cooldown/energy roll into the damage-per-turn figure.
- Depth of enemy-ability modeling (every ability vs the combat-relevant subset).
- Exact equipment slot list and how gear + enemy selection are encoded in the share codec.

## Sources / Research

- **Current state (verified):** Phase 1 shipped on `main` (228 skills / 21 trees); `src/data/stat-model.json` has 28 attribute-only derived stats (no armor/resistances/block); no `items.json` and no enemy data exist; the `Item`/`Enchantment` Zod schemas in `src/lib/types.ts` are forward-looking stubs with empty data; the UMT exporter under `tools/` is a skeleton (README + `umt-exporter/`).
- **Master plan** (`~/.claude/plans/mighty-inventing-hammock.md`): Phase 2 (full sheet + passives), Phase 3 (equipment), Phase 4 (enchantments/legendaries), Phase 5 (DPS/eHP + comparison), Phase 6 (polish). This arc compresses Phases 2–5 plus the UI reskin.
- **Phase-1 patterns to reuse:** the vendored-source + checksum-pinned extraction posture, the dual-loader + validate-data gate, the safe expression engine and fail-closed tooltip substitution, and the versioned/bounded share codec.
- **Reference tool:** nstratos is talent-only (no items, no damage), so the gear/damage/combat scope is genuine differentiation, not parity.
