// ExtractStoneshardData.csx — UndertaleModTool extraction script (SKELETON).
//
// Runs INSIDE UndertaleModTool against Stoneshard's `data.win` (modbranch beta).
// This is scaffolding: the pass bodies below are stubs marked `TODO`. It is not
// runnable in CI and is not invoked by any npm script — see ../README.md.
//
// Design: extend the nstratos approach (skills / tooltips / formulas) to also
// export items, enchantments/legendary modifiers, and attribute->stat formulas
// + constants. Each pass writes raw JSON; the repo's transform/validate steps
// normalize it into src/lib/types.ts shapes under src/data/.
//
// UMT exposes the loaded game as the `Data` global and helpers like
// ScriptMessage(...) / ScriptError(...). The bodies here intentionally avoid
// committing to exact GameObject/Script names until run against a real data.win.

using System;
using System.IO;
using System.Text;
using System.Collections.Generic;

// --- Output location -------------------------------------------------------
// Write next to this script; the repo transform reads from here.
string outDir = Path.Combine(Path.GetDirectoryName(ScriptPath) ?? ".", "out");
Directory.CreateDirectory(outDir);

void WriteJson(string name, string json)
{
    File.WriteAllText(Path.Combine(outDir, name), json, new UTF8Encoding(false));
    ScriptMessage($"Wrote {name}");
}

// --- Pass 1: skills, tooltips, formulas (parity with nstratos) -------------
// Source of truth for which keys belong to which tree:
//   umt-exporter/stoneshard-skill-keys.json
// TODO: walk the ability/skill game objects, pull name/tooltip/formulas/
// is_passive/attributes/unlock_requirements, keyed by category. Emit the same
// raw shape the bootstrap already understands so the transform is shared.
void ExtractSkills()
{
    // TODO: implement against Data.GameObjects / Data.Code text.
    WriteJson("stoneshard-tooltips-and-formulas.json", "{}");
}

// --- Pass 2: attribute -> derived-stat formulas + constants (Phase 2) ------
// TODO: extract the stat formula expressions and numeric constants the engine
// uses (e.g. max_hp = f(VIT)). Emit { statFormulas: [...], constants: {...} }.
void ExtractStatFormulas()
{
    WriteJson("stat-formulas-and-constants.json", "{}");
}

// --- Pass 3: items / equipment (Phase 3) -----------------------------------
// TODO: extract equippable items with slot + flat stat modifiers.
void ExtractItems()
{
    WriteJson("items.json", "[]");
}

// --- Pass 4: enchantments & legendary modifiers (Phase 4) ------------------
// TODO: extract the Ancient Echoes enchant system + legendary ability modifiers.
void ExtractEnchantments()
{
    WriteJson("enchantments.json", "[]");
}

// --- Run -------------------------------------------------------------------
ScriptMessage("Stoneshard exporter (skeleton) — passes are stubs; see ../README.md");
ExtractSkills();
ExtractStatFormulas();
ExtractItems();
ExtractEnchantments();
ScriptMessage($"Done. Raw JSON in: {outDir}");
