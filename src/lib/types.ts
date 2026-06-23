/**
 * Normalized data schema for the Stoneshard Build Calculator.
 *
 * These Zod schemas are the single source of truth for the shape of everything
 * in `src/data/`. The bootstrap/extraction pipelines transform raw game data
 * into these shapes, and `scripts/validate-data.ts` (also run in CI) parses the
 * dataset through them so malformed data fails loudly rather than at runtime.
 *
 * Inferred TypeScript types are exported alongside each schema.
 */
import { z } from 'zod'

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** Character attributes. */
export const AttributeKey = z.enum(['STR', 'AGI', 'PER', 'VIT', 'WIL'])
export type AttributeKey = z.infer<typeof AttributeKey>

/** Top-level grouping of skill trees, matching the in-game tabs. */
export const SkillCategory = z.enum(['weaponry', 'utility', 'sorcery'])
export type SkillCategory = z.infer<typeof SkillCategory>

/** Stable identifier for a skill (e.g. "swords-1" or "cleave"). */
export const SkillKey = z.string().min(1)
export type SkillKey = z.infer<typeof SkillKey>

/**
 * A raw game formula expression (e.g. "STR * 0.5 + weapon_damage"). Evaluated
 * by the formula engine against the current character scope. Kept as a string
 * here; parsing/validation of the expression itself happens in the engine.
 */
export const Formula = z.string()
export type Formula = z.infer<typeof Formula>

/**
 * Localized text. We only consume English today; other languages present in the
 * source are stripped on transform. Stored as an object to leave room to grow.
 */
export const Localized = z.object({ english: z.string() })
export type Localized = z.infer<typeof Localized>

/**
 * Free-form bag of combat properties carried verbatim from the game data
 * (target, range, aoe_length, stance, maneuver, branch, ...). Loosely typed on
 * purpose so new properties from future patches don't break validation.
 */
export const PropertyBag = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
export type PropertyBag = z.infer<typeof PropertyBag>

/* ------------------------------------------------------------------ */
/* Skills & trees                                                      */
/* ------------------------------------------------------------------ */

/**
 * What must be true before a skill (or its whole tree) can be invested in:
 * a character level, spent attribute points, and/or specific attributes.
 * In-game this maps to treatises + attribute gating.
 */
export const UnlockRequirements = z.object({
  level: z.number().int().nonnegative().optional(),
  attributePoints: z.number().int().nonnegative().optional(),
  attributes: z.array(AttributeKey).optional(),
})
export type UnlockRequirements = z.infer<typeof UnlockRequirements>

export const Skill = z.object({
  key: SkillKey,
  /** The tree this skill belongs to (SkillTree.id). */
  treeId: z.string().min(1),
  name: Localized,
  tooltip: Localized.optional(),
  /** Named formulas referenced inside the tooltip (e.g. { damage: "STR*1.2" }). */
  formulas: z.record(z.string(), Formula).default({}),
  isPassive: z.boolean().default(false),
  /** Row in the tree, 1 = top tier (only tier-1 skills are initially investable). */
  tier: z.number().int().positive(),
  /** Column position within the tier, for layout. */
  position: z.number().int().nonnegative().default(0),
  /** Prerequisite skills that must be taken first (drives unlock + refund cascade). */
  requires: z.array(SkillKey).default([]),
  /** Most Stoneshard skills are single-purchase; kept for flexibility. */
  maxRank: z.number().int().positive().default(1),
  energy: z.number().optional(),
  cooldown: z.number().optional(),
  /** Verbatim combat properties from the game data. */
  properties: PropertyBag.default({}),
  /** Path/reference to the skill's icon asset. */
  icon: z.string().optional(),
  unlock: UnlockRequirements.optional(),
})
export type Skill = z.infer<typeof Skill>

export const SkillTree = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: SkillCategory,
  /** Skill keys belonging to this tree, in source order. */
  skills: z.array(SkillKey).default([]),
  /** Optional unlock for the entire tree (e.g. treatise). */
  unlock: UnlockRequirements.optional(),
})
export type SkillTree = z.infer<typeof SkillTree>

/* ------------------------------------------------------------------ */
/* Attributes, derived stats & constants                              */
/* ------------------------------------------------------------------ */

export const AttributeDef = z.object({
  key: AttributeKey,
  name: z.string().min(1),
  description: z.string().optional(),
})
export type AttributeDef = z.infer<typeof AttributeDef>

/**
 * A derived character stat defined by a formula over attributes and/or other
 * derived stats (e.g. max_hp = 50 + VIT * 5). The engine resolves dependency
 * order across the full set.
 */
export const StatFormula = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  formula: Formula,
  unit: z.string().optional(),
  description: z.string().optional(),
})
export type StatFormula = z.infer<typeof StatFormula>

export const Constants = z.object({
  startingLevel: z.number().int().positive().default(1),
  maxLevel: z.number().int().positive().optional(),
  startingAttributePoints: z.number().int().nonnegative().default(0),
  attributePointsPerLevel: z.number().nonnegative().default(0),
  skillPointsPerLevel: z.number().nonnegative().default(0),
  /** Recognized damage types, kept as data to avoid hardcoding a guess. */
  damageTypes: z.array(z.string()).default([]),
  /** Misc numeric constants referenced by formulas. */
  values: z.record(z.string(), z.number()).default({}),
})
export type Constants = z.infer<typeof Constants>

/* ------------------------------------------------------------------ */
/* Equipment & enchantments (forward-looking; refined in Phase 3/4)    */
/* ------------------------------------------------------------------ */

export const EquipmentSlot = z.enum([
  'main_hand',
  'off_hand',
  'head',
  'body',
  'gloves',
  'boots',
  'cloak',
  'amulet',
  'ring',
])
export type EquipmentSlot = z.infer<typeof EquipmentSlot>

export const Item = z.object({
  key: z.string().min(1),
  name: Localized,
  slot: EquipmentSlot,
  /** Flat stat modifiers the item grants (statKey -> value). */
  stats: z.record(z.string(), z.number()).default({}),
  /** Verbatim extra properties from the game data. */
  properties: PropertyBag.default({}),
  icon: z.string().optional(),
})
export type Item = z.infer<typeof Item>

export const Enchantment = z.object({
  key: z.string().min(1),
  name: Localized,
  /** Slots/item categories this enchantment can apply to. */
  appliesTo: z.array(z.string()).default([]),
  stats: z.record(z.string(), z.number()).default({}),
  properties: PropertyBag.default({}),
})
export type Enchantment = z.infer<typeof Enchantment>

/* ------------------------------------------------------------------ */
/* Dataset bundle                                                      */
/* ------------------------------------------------------------------ */

/** Metadata about how/when the dataset was produced. */
export const DatasetMeta = z.object({
  gameVersion: z.string(),
  source: z.string(),
  generatedAt: z.string().optional(),
})
export type DatasetMeta = z.infer<typeof DatasetMeta>

export const Dataset = z.object({
  meta: DatasetMeta,
  attributes: z.array(AttributeDef),
  trees: z.array(SkillTree),
  skills: z.array(Skill),
  statFormulas: z.array(StatFormula).default([]),
  constants: Constants,
  items: z.array(Item).default([]),
  enchantments: z.array(Enchantment).default([]),
})
export type Dataset = z.infer<typeof Dataset>

/**
 * Parse and validate an unknown value as a Dataset, throwing a descriptive
 * ZodError on failure. Used by the validation script and app data loader.
 */
export function parseDataset(raw: unknown): Dataset {
  return Dataset.parse(raw)
}
