/**
 * On-mount build hydration from the URL (U10, R8 — hydration half).
 *
 * A pure helper (no DOM, no globals) so the load path is unit-tested: parse a
 * `?build=` code out of a query string and decode it through the (fail-closed)
 * codec. Absent → start fresh; present-but-bad → start fresh and report `invalid`
 * so the UI can show a soft notice. A structurally valid code yields its ledger;
 * stale skill/tree refs inside it are recompute's problem (the patch-drift notice),
 * not this layer's.
 *
 * `extractCode` also accepts a full pasted URL, not just a bare code, so the
 * paste-import flow can hand it whatever the user copied.
 */
import { decode } from './codec'
import type { Ledger } from '../build/character'

export type HydrateResult =
  | { status: 'none'; entries: Ledger }
  | { status: 'loaded'; entries: Ledger }
  | { status: 'invalid'; entries: Ledger }

/** Pull the `build` code out of a query string, a full URL, or a bare code. */
export function extractCode(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // A query string or full URL containing ?build=… or &build=…
  const fromQuery = /[?&]build=([^&#\s]+)/.exec(trimmed)
  if (fromQuery) return decodeURIComponent(fromQuery[1])
  // Otherwise treat the whole thing as a bare code only if it is base64url-shaped
  // (so a plain URL with no build param yields null, not a bogus "code").
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null
}

export async function hydrateLedger(search: string): Promise<HydrateResult> {
  const code = extractCode(search)
  if (!code) return { status: 'none', entries: [] }

  const res = await decode(code)
  if (!res.ok) return { status: 'invalid', entries: [] }
  return { status: 'loaded', entries: res.ledger }
}
