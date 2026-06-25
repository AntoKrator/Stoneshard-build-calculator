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
import {
  slotFitsCategory,
  type AttributeKey,
  type Dataset,
  type EquipmentSlot,
  type Item,
  type Preset,
  type Skill,
} from '../types'
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
  | 'no-item'
  | 'wrong-slot'

export type LedgerResult = { ok: true } | { ok: false; reason: Reason }

export class BuildLedger {
  entries = $state<LedgerEntry[]>([])

  readonly #dataset: Dataset
  /** Immutable key→skill lookup (a plain object, so no reactive-collection lint). */
  readonly #skillByKey: Record<string, Skill>
  /** Immutable key→item lookup, same posture as #skillByKey. */
  readonly #itemByKey: Record<string, Item>
  /** Immutable id→preset lookup, same posture as #skillByKey. */
  readonly #presetById: Record<string, Preset>

  constructor(dataset: Dataset, entries: LedgerEntry[] = []) {
    this.#dataset = dataset
    this.#skillByKey = Object.fromEntries(dataset.skills.map((s) => [s.key, s]))
    this.#itemByKey = Object.fromEntries(dataset.items.map((i) => [i.key, i]))
    this.#presetById = Object.fromEntries(dataset.presets.map((p) => [p.id, p]))
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

  /**
   * Equip `itemKey` into `slot`. Refuses an unknown item or one that doesn't fit
   * the slot. Replaces whatever occupies the slot (removing the prior equip entry
   * first) so the log holds at most one equip per slot — keeping it clean and the
   * share code bounded.
   */
  equip(slot: EquipmentSlot, itemKey: string): LedgerResult {
    const item = this.#itemByKey[itemKey]
    if (!item) return { ok: false, reason: 'no-item' }
    if (item.slot !== slot || !slotFitsCategory(item.category, slot)) {
      return { ok: false, reason: 'wrong-slot' }
    }
    this.#removeEquip(slot)
    this.entries.push({ op: 'equip', slot, item: itemKey })
    return { ok: true }
  }

  /** Clear a slot by removing its equip entry. */
  unequip(slot: EquipmentSlot): LedgerResult {
    return this.#removeEquip(slot) ? { ok: true } : { ok: false, reason: 'not-found' }
  }

  /** Remove the equip entry for `slot` if present; returns whether one was removed. */
  #removeEquip(slot: EquipmentSlot): boolean {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]
      if (e.op === 'equip' && e.slot === slot) {
        this.entries.splice(i, 1)
        return true
      }
    }
    return false
  }

  /**
   * Select a character preset. recompute seeds its starting attributes and innate
   * skills outside the budget (U2); this only records the choice. Replaces any
   * prior selection so the log holds at most one `selectCharacter` entry —
   * last-wins, kept clean and the share code bounded, exactly like `equip`.
   */
  selectCharacter(id: string): LedgerResult {
    if (!this.#presetById[id]) return { ok: false, reason: 'unknown' }
    this.#removeSelectCharacter()
    this.entries.push({ op: 'selectCharacter', id })
    return { ok: true }
  }

  /** Clear the character selection, returning to the neutral/unseeded base. */
  clearCharacter(): LedgerResult {
    return this.#removeSelectCharacter() ? { ok: true } : { ok: false, reason: 'not-found' }
  }

  /**
   * Remove every `selectCharacter` entry; returns whether any was removed. Normally
   * there is at most one (this method runs before each push), but a hand-crafted or
   * older share code could carry several — collapsing them keeps the "at most one"
   * invariant recompute assumes, so a clear truly clears and a re-select doesn't
   * leave a stale earlier seed behind.
   */
  #removeSelectCharacter(): boolean {
    let removed = false
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].op === 'selectCharacter') {
        this.entries.splice(i, 1)
        removed = true
      }
    }
    return removed
  }
}
