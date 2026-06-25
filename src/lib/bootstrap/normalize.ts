/**
 * Small pure helpers shared by the bootstrap transforms (nstratos skills + wiki
 * items). Both ingest stringly source cells and emit deterministic, key-sorted
 * objects, so the coercion and sort live here rather than being duplicated.
 */

/** Coerce a stringly source value: `''` → drop, numeric string → number, else the string. */
export function coerce(v: string): string | number | undefined {
  if (v === '') return undefined
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
}

/** A copy of `obj` with its keys in sorted order, for deterministic output. */
export function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const k of Object.keys(obj).sort()) out[k] = obj[k]
  return out
}
