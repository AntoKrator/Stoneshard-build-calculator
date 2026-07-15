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
  /** Skill points granted at the starting level (nstratos convention: 2). */
  startingSkillPoints: z.number().int().nonnegative().default(0),
  attributePointsPerLevel: z.number().nonnegative().default(0),
  skillPointsPerLevel: z.number().nonnegative().default(0),
  /** The value every attribute starts at before allocation (10 in Stoneshard). */
  baseAttributeValue: z.number().int().positive().default(10),
  /** Hard ceiling for any single primary attribute (30 in Stoneshard). Point
   *  allocation can never raise an attribute above this; mirrors `maxLevel`. */
  maxAttributeValue: z.number().int().positive().default(30),
  /** Recognized damage types, kept as data to avoid hardcoding a guess. */
  damageTypes: z.array(z.string()).default([]),
  /**
   * The recognized `item.stats` vocabulary (snake_case), derived from the
   * weapon/armor datastring columns. Kept as data so the gate can flag an item
   * stat outside the known set (`unknown-stat-key`) without hardcoding the list.
   */
  itemStatKeys: z.array(z.string()).default([]),
  /**
   * The recognized `enemy.stats` vocabulary (snake_case), derived from the enemy
   * datastring columns. Required to be non-empty once enemies exist so the gate's
   * `unknown-enemy-stat-key` check can't silently no-op (M5 KTD2).
   */
  enemyStatKeys: z.array(z.string()).default([]),
  /** Misc numeric constants referenced by formulas. */
  values: z.record(z.string(), z.number()).default({}),
})
export type Constants = z.infer<typeof Constants>

/* ------------------------------------------------------------------ */
/* Derived-stat coefficient model (Phase 1 — KTD14)                    */
/* ------------------------------------------------------------------ */

/**
 * One coefficient: an attribute contributes `amount` to a derived `stat`, either
 * once per point above the base value (`perPoint`) or once per crossed threshold
 * (`perThreshold`). `stat` is a formula-vocabulary key matching a {@link DerivedStatDef}.
 */
export const AttributeBonus = z.object({
  stat: z.string().min(1),
  amount: z.number(),
})
export type AttributeBonus = z.infer<typeof AttributeBonus>

/** The per-point and per-threshold bonus lists contributed by one attribute. */
export const AttributeBonusSet = z.object({
  perPoint: z.array(AttributeBonus).default([]),
  perThreshold: z.array(AttributeBonus).default([]),
})
export type AttributeBonusSet = z.infer<typeof AttributeBonusSet>

/**
 * An enumerated Phase-1 derived stat the coefficient model produces. Keyed in the
 * formula-identifier vocabulary (e.g. `Magic_Power`, `Block_Chance`, `max_hp`) so
 * the engine scope is a direct merge (KTD14/KTD15).
 */
export const DerivedStatDef = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  base: z.number(),
  category: z.string().min(1),
  unit: z.string().optional(),
})
export type DerivedStatDef = z.infer<typeof DerivedStatDef>

/**
 * The attribute → derived-stat coefficient table plus the explicitly enumerated
 * in-scope stat set (KTD14). `computeDerivedStats` produces exactly `derivedStats`;
 * `aliases` map extra formula identifiers onto an attribute or a derived stat;
 * `deferredIdentifiers` documents formula identifiers known to be out-of-scope in
 * Phase 1 (gear/passive-driven) so tooltips referencing them degrade to a marker.
 *
 * Cross-checked at parse time: every coefficient and alias must target an
 * enumerated stat (or attribute), so a typo can't silently drop a contribution.
 */
export const StatModel = z
  .object({
    baseAttributeValue: z.number().int().positive(),
    mainStatThresholds: z.array(z.number()),
    attributeBonuses: z.record(AttributeKey, AttributeBonusSet),
    derivedStats: z.array(DerivedStatDef).min(1),
    aliases: z.record(z.string(), z.string()).default({}),
    deferredIdentifiers: z.array(z.string()).default([]),
  })
  .superRefine((model, ctx) => {
    const statKeys = new Set(model.derivedStats.map((s) => s.key))
    const attrKeys = new Set(AttributeKey.options)
    for (const [attr, set] of Object.entries(model.attributeBonuses)) {
      for (const phase of ['perPoint', 'perThreshold'] as const) {
        for (const bonus of set[phase]) {
          if (!statKeys.has(bonus.stat)) {
            ctx.addIssue({
              code: 'custom',
              message: `attributeBonuses.${attr}.${phase} references unknown derived stat "${bonus.stat}"`,
            })
          }
        }
      }
    }
    for (const [alias, target] of Object.entries(model.aliases)) {
      if (!statKeys.has(target) && !attrKeys.has(target as AttributeKey)) {
        ctx.addIssue({
          code: 'custom',
          message: `alias "${alias}" targets unknown stat/attribute "${target}"`,
        })
      }
    }
  })
export type StatModel = z.infer<typeof StatModel>

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
  'belt',
  'cloak',
  'amulet',
  'ring',
])
export type EquipmentSlot = z.infer<typeof EquipmentSlot>

/** Broad item family. Drives which fields are meaningful and how the damage/sheet
 *  model reads an item: weapons carry a damage profile, armor carries mitigation. */
export const ItemCategory = z.enum(['weapon', 'armor', 'accessory'])
export type ItemCategory = z.infer<typeof ItemCategory>

/**
 * Which equipment slots each item family may occupy — a weapon belongs in a hand
 * slot, a ring/amulet/belt in a jewelry slot, armor in a protective slot. The
 * single source of truth for the data gate's `slot-category-mismatch` check, the
 * recompute equip-resolution pass, and the equip UI's per-slot filtering.
 */
export const SLOTS_BY_CATEGORY: Record<ItemCategory, readonly EquipmentSlot[]> = {
  // M3 models every weapon as main_hand (the source has no off-hand flag) and the
  // off-hand as shields only; dual-wield / off-hand weapons need 1H-vs-2H weapon
  // classification and are deferred to a later milestone.
  weapon: ['main_hand'],
  armor: ['off_hand', 'head', 'body', 'gloves', 'boots', 'cloak'],
  accessory: ['amulet', 'ring', 'belt'],
}

/** Whether an item of `category` may occupy `slot`. */
export function slotFitsCategory(category: ItemCategory, slot: EquipmentSlot): boolean {
  return SLOTS_BY_CATEGORY[category].includes(slot)
}

export const Item = z.object({
  key: z.string().min(1),
  name: Localized,
  category: ItemCategory,
  slot: EquipmentSlot,
  /** In-game item type, e.g. "Sword", "Shield", "Body Armor", "Ring". */
  type: z.string().optional(),
  tier: z.number().int().nonnegative().optional(),
  rarity: z.string().optional(),
  material: z.string().optional(),
  /** Weapons (R3): the primary damage type feeding the damage model, drawn from
   *  `constants.damageTypes` (the cross-check lives in the data gate, not here,
   *  since it spans two dataset sections). */
  damageType: z.string().optional(),
  /** Flat stat modifiers (statKey -> value): per-type damage, accuracy, crit,
   *  block, resistances, school powers, and the rest the sheet/damage model reads. */
  stats: z.record(z.string(), z.number()).default({}),
  /** Verbatim non-numeric / unmapped columns from the source (durability, price,
   *  tags, obtainability, description, ...). Loosely typed so new patch columns
   *  widen the data without breaking validation, exactly as Skill.properties does. */
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
/* Character presets                                                   */
/* ------------------------------------------------------------------ */

/**
 * A curated playable-character preset: the character's starting attributes (the
 * innate above-base points), innate starting abilities, a display trait label,
 * and affinity trees (display-only metadata, KTD6). Seeded *outside* the point
 * budget by `recompute` via the `selectCharacter` ledger op. Verren is the
 * neutral 10/10/10/10/10 default — identical to a blank build.
 *
 * `startingSkills` and `affinities` reference skill keys / tree ids that live in
 * other dataset sections, so their referential integrity is cross-checked in the
 * data gate (`checkPresets`), not here — mirroring the item damage-type check.
 */
export const Preset = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Starting value for every attribute (absolute, not a delta). All five keys
   *  required so a preset can't silently omit one; shape matches `Attributes`. */
  attributes: z.object({
    STR: z.number().int().positive(),
    AGI: z.number().int().positive(),
    PER: z.number().int().positive(),
    VIT: z.number().int().positive(),
    WIL: z.number().int().positive(),
  }),
  /** Innate abilities the character starts with (skill keys), seeded outside the
   *  skill-point budget. Conservative — only documented innate skills. */
  startingSkills: z.array(SkillKey).default([]),
  /** The character's unique trait, shown as a label (effects not modeled, KTD6). */
  trait: z.string().min(1),
  /** Affinity skill trees (tree ids), display-only metadata (KTD6). */
  affinities: z.array(z.string()).default([]),
  /** True for Character Pack DLC characters (a display hint). */
  dlc: z.boolean().default(false),
  /** Repo-relative portrait path (img/characters/<id>.png), vendored from the
   *  wiki by `npm run vendor:character-icons`; absent → glyph fallback. */
  icon: z.string().optional(),
})
export type Preset = z.infer<typeof Preset>

/* ------------------------------------------------------------------ */
/* Enemies (M5 — enemy-vs-build combat)                                */
/* ------------------------------------------------------------------ */

/**
 * Flat per-bodypart protection, reusing the combat layer's four-slot vocabulary
 * `{head, chest, arms, legs}`. The enemy datastring labels these Head/Body/Hands/
 * Legs; the transform maps Body→chest and Hands→arms so one canonical slot set
 * flows through `HIT_WEIGHTS` and `mitigate` in both matchup directions (KTD2/KTD3).
 */
export const BodypartProtection = z.object({
  head: z.number(),
  chest: z.number(),
  arms: z.number(),
  legs: z.number(),
})
export type BodypartProtection = z.infer<typeof BodypartProtection>

/**
 * One enemy, extracted from the wiki `Enemy data` datastring (KTD1/KTD2). Mirrors
 * `Item`'s typed-identity + snake_case-`stats`-bag split: identity fields are typed,
 * the 13 per-type basic-attack damages + 3 umbrella/13 specific resistances +
 * accuracy/dodge/block/crit/etc. live in `stats` (snake_case), per-bodypart flat
 * armor is the typed `protection`, and everything else lands in `properties`.
 *
 * `abilities` lists curated `EnemyAbility` keys; referential integrity is checked
 * in the data gate (`checkEnemies`), not here — like `Item.damageType` and
 * `Preset.startingSkills`.
 */
export const Enemy = z.object({
  key: z.string().min(1),
  name: Localized,
  tier: z.number().int().nonnegative().optional(),
  /** In-game "Monster Type" (e.g. "Human", "Undead"). */
  type: z.string().optional(),
  faction: z.string().optional(),
  size: z.string().optional(),
  hp: z.number().int().positive(),
  energy: z.number().int().nonnegative().optional(),
  /** Flat protection per bodypart pool (head/chest/arms/legs). */
  protection: BodypartProtection,
  /** Snake_case numeric stats: per-type basic-attack damage, resistances,
   *  accuracy, dodge_chance, block_chance/power, crit_chance/efficiency, … */
  stats: z.record(z.string(), z.number()).default({}),
  /** Curated special-ability keys (resolved against `enemyAbilities` by the gate). */
  abilities: z.array(z.string()).default([]),
  /** Verbatim non-numeric / unmapped columns (AI pattern, weapon, description, …). */
  properties: PropertyBag.default({}),
  icon: z.string().optional(),
})
export type Enemy = z.infer<typeof Enemy>

/**
 * A curated enemy special ability (KTD5). Enemy abilities carry no machine-readable
 * formula in the source — they are prose with flat numbers — so each is a flat
 * per-type `damage` map hand-transcribed from its wiki ability page. `properties`
 * carries the required `source` provenance URL (gate-enforced).
 */
export const EnemyAbility = z.object({
  key: z.string().min(1),
  name: Localized,
  /** Flat per-type damage this ability deals (damageType → amount). */
  damage: z.record(z.string(), z.number()).default({}),
  properties: PropertyBag.default({}),
})
export type EnemyAbility = z.infer<typeof EnemyAbility>

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
  /**
   * The Phase-1 derived-stat coefficient model. Optional at the schema level so
   * the bootstrap transform (which emits only nstratos-derived sections) still
   * validates; the committed dataset and both loaders always include it.
   */
  statModel: StatModel.optional(),
  constants: Constants,
  items: z.array(Item).default([]),
  enchantments: z.array(Enchantment).default([]),
  /** Curated playable-character presets (character-select feature). Optional at
   *  the schema level so the bootstrap transform still validates; both loaders
   *  always read the committed `presets.json`. */
  presets: z.array(Preset).default([]),
  /** Extracted enemy bestiary + curated enemy abilities (M5). Default `[]` so the
   *  bootstrap transform still validates; both loaders read the committed files. */
  enemies: z.array(Enemy).default([]),
  enemyAbilities: z.array(EnemyAbility).default([]),
})
export type Dataset = z.infer<typeof Dataset>

/**
 * Parse and validate an unknown value as a Dataset, throwing a descriptive
 * ZodError on failure. Used by the validation script and app data loader.
 */
export function parseDataset(raw: unknown): Dataset {
  return Dataset.parse(raw)
}
