/**
 * Typed access to the committed dataset.
 *
 * The dataset is generated as split JSON files under `src/data/` (one per
 * top-level section). This composes them back into a single {@link Dataset}.
 * In dev we validate eagerly with `parseDataset` so malformed data fails fast;
 * in a production build we trust the CI-validated, Zod-canonical committed JSON
 * and skip the parse cost.
 */
import metaJson from '../../data/meta.json'
import attributesJson from '../../data/attributes.json'
import treesJson from '../../data/trees.json'
import skillsJson from '../../data/skills.json'
import constantsJson from '../../data/constants.json'
import statModelJson from '../../data/stat-model.json'
import itemsJson from '../../data/items.json'
import { parseDataset, type Dataset, type StatModel } from '../types'

const composed = {
  meta: metaJson,
  attributes: attributesJson,
  trees: treesJson,
  skills: skillsJson,
  constants: constantsJson,
  statModel: statModelJson,
  statFormulas: [],
  items: itemsJson,
  enchantments: [],
}

export const dataset: Dataset = import.meta.env.DEV
  ? parseDataset(composed)
  : (composed as unknown as Dataset)

/**
 * The Phase-1 derived-stat coefficient model, guaranteed present (composed above
 * and validated in dev). Exposed as a non-optional value so `computeDerivedStats`
 * and the engine scope can consume it without a null check.
 */
export const statModel: StatModel = dataset.statModel as StatModel
