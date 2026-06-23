/**
 * Pure data-gate logic shared by `scripts/validate-data.ts`.
 *
 * Combines the three failure surfaces into one verdict: Zod shape errors,
 * referential-integrity issues (the hardened `checkIntegrity`), and bootstrap
 * warnings that were not explicitly allowlisted. Default policy is zero
 * un-allowlisted warnings, so a known gap must be named to ship.
 */
import { validateDataset } from '../validate'

export interface BootstrapWarning {
  category: string
  message: string
}

export interface GateResult {
  ok: boolean
  errors: string[]
  skillCount: number
  treeCount: number
}

/** A stable signature for allowlisting an individual warning. */
export function warningSignature(w: BootstrapWarning): string {
  return `${w.category}: ${w.message}`
}

export function gateDataset(
  composed: unknown,
  warnings: BootstrapWarning[],
  allowlist: string[],
): GateResult {
  const errors: string[] = []
  let skillCount = 0
  let treeCount = 0

  try {
    const { dataset, issues } = validateDataset(composed)
    skillCount = dataset.skills.length
    treeCount = dataset.trees.length
    for (const i of issues) errors.push(`[${i.kind}] ${i.message}`)
  } catch (e) {
    errors.push(`schema: ${(e as Error).message}`)
  }

  for (const w of warnings) {
    if (!allowlist.includes(warningSignature(w))) {
      errors.push(`warning [${w.category}] ${w.message}`)
    }
  }

  return { ok: errors.length === 0, errors, skillCount, treeCount }
}
