/**
 * The reactive build ledger (U4, KTD7).
 *
 * A thin Svelte 5 runes wrapper around the flat log: `entries` is `$state`, and
 * `character` is a `$derived` full recompute (the heavy, well-tested logic lives
 * in `character.ts`). Mutating operations validate against the current character
 * and the point economy so the UI can't create an illegal build; refunds and
 * level-downs remove entries (LIFO), letting `recompute` cascade the consequences.
 *
 * Every operation returns a discriminated result so the UI can surface *why* an
 * action was refused (no points, locked, duplicate) without throwing.
 */
import type { AttributeKey, Dataset, Skill } from '../types'
import { recompute, type Character, type Ledger, type LedgerEntry } from './character'
import { isUnlocked } from './economy'

type Reason =
  | 'no-points'
  | 'locked'
  | 'duplicate'
  | 'unknown'
  | 'min-level'
  | 'max-level'
  | 'not-found'

export type LedgerResult = { ok: true } | { ok: false; reason: Reason }

export class BuildLedger {
  entries = $state<LedgerEntry[]>([])

  readonly #dataset: Dataset
  /** Immutable key→skill lookup (a plain object, so no reactive-collection lint). */
  readonly #skillByKey: Record<string, Skill>

  constructor(dataset: Dataset, entries: LedgerEntry[] = []) {
    this.#dataset = dataset
    this.#skillByKey = Object.fromEntries(dataset.skills.map((s) => [s.key, s]))
    this.entries = entries
  }

  /**
   * The full recomputed character. A getter (not a `$derived` field, which would
   * read `#dataset` before the constructor assigns it): reading `entries` here is
   * still reactive, so consumers should bind it once via `$derived` to memoize.
   */
  get character(): Character {
    return recompute(this.entries, this.#dataset)
  }

  /** A serializable snapshot of the log (for the share codec). */
  toLedger(): Ledger {
    return this.entries.slice()
  }

  /** Replace the entire log (e.g. after decoding a share code). */
  load(entries: LedgerEntry[]): void {
    this.entries = entries.slice()
  }

  reset(): void {
    this.entries = []
  }

  levelUp(): LedgerResult {
    const max = this.#dataset.constants.maxLevel ?? Infinity
    if (this.character.level >= max) return { ok: false, reason: 'max-level' }
    this.entries.push({ op: 'levelUp' })
    return { ok: true }
  }

  levelDown(): LedgerResult {
    if (this.character.level <= this.#dataset.constants.startingLevel) {
      return { ok: false, reason: 'min-level' }
    }
    // Remove the most recent level-up; recompute sacrifices any now over-budget
    // allocations LIFO and relocks skills that lose their unlock.
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].op === 'levelUp') {
        this.entries.splice(i, 1)
        return { ok: true }
      }
    }
    return { ok: false, reason: 'min-level' }
  }

  addAttribute(attr: AttributeKey): LedgerResult {
    const ch = this.character
    if (ch.attributesSpent >= ch.attributeBudget) return { ok: false, reason: 'no-points' }
    this.entries.push({ op: 'addAttribute', attr })
    return { ok: true }
  }

  removeAttribute(attr: AttributeKey): LedgerResult {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]
      if (e.op === 'addAttribute' && e.attr === attr) {
        this.entries.splice(i, 1)
        return { ok: true }
      }
    }
    return { ok: false, reason: 'not-found' }
  }

  addSkill(key: string): LedgerResult {
    const skill = this.#skillByKey[key]
    if (!skill) return { ok: false, reason: 'unknown' }

    const ch = this.character
    if (ch.taken.has(key)) return { ok: false, reason: 'duplicate' }
    if (ch.skillsSpent >= ch.skillBudget) return { ok: false, reason: 'no-points' }
    if (!skill.requires.every((r) => ch.taken.has(r))) return { ok: false, reason: 'locked' }
    const base = this.#dataset.constants.baseAttributeValue
    if (!isUnlocked(skill.unlock, ch.level, ch.attributes, base))
      return { ok: false, reason: 'locked' }

    this.entries.push({ op: 'addSkill', skill: key })
    return { ok: true }
  }

  removeSkill(key: string): LedgerResult {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]
      if (e.op === 'addSkill' && e.skill === key) {
        this.entries.splice(i, 1)
        return { ok: true }
      }
    }
    return { ok: false, reason: 'not-found' }
  }
}
