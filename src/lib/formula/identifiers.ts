/**
 * Shared identifier registry for skill-effect formulas (KTD15).
 *
 * Promoted out of `bootstrap/transform.ts` so a single source of truth is
 * consumed by both the bootstrap (which flags unknown tokens) and the formula
 * engine (which needs the function table kept *separate* from scope variables).
 *
 * Two disjoint vocabularies:
 * - {@link FUNCTION_NAMES} — callable functions (`floor`, `max`, …). The engine
 *   resolves these from its function table, never from the scope.
 * - {@link KNOWN_STAT_IDENTIFIERS} — formula-vocabulary stat names a formula may
 *   reference (`Magic_Power`, `Body_DEF`, …), both Phase-1 in-scope and deferred.
 *   The engine resolves these from the scope; an absent one is a typed unknown.
 *
 * Attribute keys (STR/AGI/PER/VIT/WIL) are intentionally *not* listed here — they
 * are always-present scope variables, handled by the caller.
 */

/** Callable functions available to formulas. Kept distinct from stat identifiers. */
export const FUNCTION_NAMES: ReadonlySet<string> = new Set([
  'math_round',
  'max',
  'min',
  'floor',
  'ceil',
  'round',
  'abs',
])

/**
 * Non-attribute, non-function identifiers a formula may legitimately reference.
 * A superset of the Phase-1 in-scope set: it includes deferred (gear/passive)
 * stats too, so the bootstrap doesn't flag a real game identifier as unknown.
 */
export const KNOWN_STAT_IDENTIFIERS: ReadonlySet<string> = new Set([
  'Arcanistic_Power',
  'Block_Chance',
  'Block_PowerMax',
  'Body_DEF',
  'EVS',
  'Electromantic_Power',
  'Geomantic_Power',
  'HP',
  'Knockback_Chance',
  'Legs_DEF',
  'Magic_Power',
  'Mainhand_Efficiency',
  'Miracle_Chance',
  'Miracle_Power',
  'Miscast_Chance',
  'Offhand_Efficiency',
  'Pyromantic_Power',
  'Retaliation',
  'Shield_Block_Chance',
  'Spell_Hit_Chance',
  'Vitality',
  'max_hp',
  'max_mp',
  'open_weapon_one_hand_skills',
  'open_weapon_skills',
  'ranged_skill_learned',
])

/**
 * Union of functions + known stat identifiers — every non-attribute token a
 * normalized formula may legitimately contain. Used by the bootstrap's
 * unknown-token gate (which treats anything outside attributes ∪ this set as a
 * data warning).
 */
export const KNOWN_IDENTIFIERS: ReadonlySet<string> = new Set([
  ...FUNCTION_NAMES,
  ...KNOWN_STAT_IDENTIFIERS,
])
