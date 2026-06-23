# Extraction tooling (`tools/`)

This directory holds **our own** data-extraction pipeline — the long-term source of truth for
`src/data/`. Today the dataset is bootstrapped from the
[nstratos talent calculator](https://github.com/nstratos/stoneshard-talent-calculator) (see
[`scripts/bootstrap-from-nstratos.ts`](../scripts/bootstrap-from-nstratos.ts) and
[`NOTICE.md`](../NOTICE.md)); over time these exporters become canonical so our release cadence
isn't coupled to upstream.

> **Status: skeleton.** The exporter here is scaffolding + documentation. It is **not runnable in
> CI** and is **not** wired into any `npm` script. It requires a Windows host, UndertaleModTool, and
> the game's `data.win` — none of which exist in CI. Run it manually per patch.

## Why our own pipeline

The nstratos export covers **skills / tooltips / formulas** only. Ours is designed to also pull the
dimensions their tool omits and that later phases need:

- **Items / equipment** (slots, stat modifiers) — Phase 3
- **Enchantments & legendary modifiers** (the _Ancient Echoes_ system) — Phase 4
- **Attribute → derived-stat formulas and numeric constants** — Phase 2

The output of each pass is normalized into the schema in
[`src/lib/types.ts`](../src/lib/types.ts) by a transform step (same shape the bootstrap targets), so
the app never sees raw game export.

## Prerequisites

1. **Windows** (UndertaleModTool's scripting host is Windows-first).
2. **[UndertaleModTool](https://github.com/UnderminersTeam/UndertaleModTool)** (UMT).
3. **Stoneshard on the `modbranch` Steam beta.** In Steam → Stoneshard → Properties → Betas, set
   _Beta Participation_ to `modbranch - modbranch`, then let it update. The game's `data.win` (under
   the Stoneshard install dir) is the extraction input. Targeted patch: **0.9.4.x**.

## Running

1. Open `data.win` in UndertaleModTool.
2. Drop the scripts from `umt-exporter/` into UMT's _Scripts → Run other script…_ (or the Community
   Scripts folder) and run [`ExtractStoneshardData.csx`](umt-exporter/ExtractStoneshardData.csx).
3. It writes raw JSON next to the script. Feed that JSON through the repo's transform/validate steps
   (`npm run validate-data`) to land normalized data in `src/data/`.

## Files

- `umt-exporter/ExtractStoneshardData.csx` — the extraction script (skeleton).
- `umt-exporter/stoneshard-skill-keys.json` — category → skill-key membership map the script reads to
  group skills into trees (mirrors the nstratos mapping; replace with our own as coverage grows).

## Relationship to the bootstrap

The bootstrap (`scripts/bootstrap-from-nstratos.ts`) is a one-time head start. As these exporters
mature, regenerate `src/data/` from our own exports and retire the bootstrap dependency. Both target
the same normalized schema, so the swap is transparent to the app.
