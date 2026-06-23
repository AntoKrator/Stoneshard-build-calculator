/**
 * Point economy + the single skill-unlock predicate (U4, KTD11).
 *
 * Pure functions over the dataset constants and a character's attributes/level.
 * The unlock predicate lives here, isolated and named, because it decides the
 * locked/affordable state of 154/228 skills — if the in-game reading ever differs
 * from the pinned default (see the plan's Open Questions), this is the one place
 * to change.
 */
import type { AttributeKey, Constants, UnlockRequirements } from '../types'

export type Attributes = Record<AttributeKey, number>

/** Total attribute points a character has earned by the given level. */
export function earnedAttributePoints(level: number, c: Constants): number {
  return c.startingAttributePoints + (level - c.startingLevel) * c.attributePointsPerLevel
}

/** Total skill points a character has earned by the given level. */
export function earnedSkillPoints(level: number, c: Constants): number {
  return c.startingSkillPoints + (level - c.startingLevel) * c.skillPointsPerLevel
}

/**
 * Combined points invested across a set of attributes, measured as the sum of
 * each attribute's value above the base. This is the quantity an `attributePoints`
 * unlock requirement is compared against (KTD11).
 */
export function investedInAttributes(
  attributes: Attributes,
  attrs: readonly AttributeKey[],
  baseAttributeValue: number,
): number {
  let sum = 0
  for (const a of attrs)
    sum += Math.max((attributes[a] ?? baseAttributeValue) - baseAttributeValue, 0)
  return sum
}

/**
 * Whether a skill's unlock requirement is satisfied (KTD11). Mirrors nstratos's
 * `computeAbilityUnlockRequirementState`: satisfied when the character is at or
 * above the required level, OR the combined invested points across the listed
 * attributes meets the required amount. A skill with no `unlock` is ungated here
 * (its prerequisites still apply separately).
 */
export function isUnlocked(
  unlock: UnlockRequirements | undefined,
  level: number,
  attributes: Attributes,
  baseAttributeValue: number,
): boolean {
  if (!unlock) return true

  const hasLevelGate = unlock.level != null
  const hasAttrGate = unlock.attributePoints != null
  if (!hasLevelGate && !hasAttrGate) return true

  const levelOk = hasLevelGate && level >= unlock.level!
  let attrOk = false
  if (hasAttrGate) {
    const invested = investedInAttributes(attributes, unlock.attributes ?? [], baseAttributeValue)
    attrOk = invested >= unlock.attributePoints!
  }
  return levelOk || attrOk
}
