/**
 * Builds the typed {@link Scope} the engine evaluates formulas against (U2, step 4).
 *
 * The scope is the **Phase-1 in-scope vocabulary** and nothing else:
 *   - the five attributes (always present),
 *   - the enumerated attribute-derived stats (`computeDerivedStats` output, U3),
 *   - aliases that point an extra formula identifier at an attribute or a derived
 *     stat (e.g. `Vitality` → VIT, `HP` → max_hp),
 *   - any numeric constants from the dataset.
 *
 * Deferred identifiers (gear/passive-driven `*_Power`, `Body_DEF`, …) are
 * deliberately **left out**, so a formula referencing one resolves to
 * `unknown-var` and the tooltip degrades to a neutral marker (KTD9/KTD14).
 */
import type { Scope } from './eval'
import type { AttributeKey, StatModel } from '../types'

export type Attributes = Record<AttributeKey, number>

export function buildScope(
  attributes: Attributes,
  derived: Record<string, number>,
  statModel: StatModel,
  constants?: Record<string, number>,
): Scope {
  const scope: Scope = {}

  // Lowest precedence: misc dataset constants.
  if (constants) {
    for (const [k, v] of Object.entries(constants)) scope[k] = v
  }

  // Enumerated attribute-derived stats (formula-vocabulary keys).
  for (const [k, v] of Object.entries(derived)) scope[k] = v

  // The attributes themselves.
  for (const [k, v] of Object.entries(attributes)) scope[k] = v

  // Aliases resolve last, pointing at an attribute or an already-present stat.
  for (const [alias, target] of Object.entries(statModel.aliases)) {
    if (Object.prototype.hasOwnProperty.call(attributes, target)) {
      scope[alias] = attributes[target as AttributeKey]
    } else if (Object.prototype.hasOwnProperty.call(derived, target)) {
      scope[alias] = derived[target]
    }
    // If a target is neither (cannot happen: validated at parse time), the alias
    // is simply absent and resolves to unknown-var — fail closed.
  }

  return scope
}
