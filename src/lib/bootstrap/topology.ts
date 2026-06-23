/**
 * Pure parsing of the nstratos `index.html` skill-tree topology.
 *
 * The tooltips JSON carries a skill's text/formulas/stats but NOT its place in
 * the tree. Tier/position and prerequisite edges live only in `index.html` as
 * `<ability-pick>` elements:
 *
 *   <ability-pick id="swords-4" key="gloat" parents="swords-1" children="swords-7"
 *     style="top: 231px; left: 37px" img="img/abilities/swords/Gloat.png"
 *     label="Gloat" unlock-level="10" unlock-attribute-points="8"
 *     unlock-attributes="STR PER VIT" ...>
 *
 * `parents`/`children` reference node ids (e.g. `swords-1`), not skill keys, and
 * are inverse edges. `parents` is authoritative for prerequisites; `children` is
 * used only to cross-validate (see {@link checkParentChildDrift}).
 *
 * Everything here is a pure function of the HTML string so it is unit-testable
 * without the network or the filesystem.
 */

export interface TopoNode {
  /** Node id, e.g. `swords-4`. Unique across the document. */
  id: string
  /** Tree id, derived from the node-id prefix (`swords-4` -> `swords`). */
  tree: string
  /** Skill key (e.g. `gloat`), or null when the element omits the attribute. */
  key: string | null
  label: string
  /** Icon path verbatim from the `img` attribute. */
  icon: string
  top: number
  left: number
  /** Prerequisite node ids (authoritative source of `requires`). */
  parents: string[]
  /** Child node ids (inverse edges; used to cross-validate `parents`). */
  children: string[]
  unlock?: { level?: number; attributePoints?: number; attributes?: string[] }
}

/** Parse a single `key="value"` attribute out of an element's opening tag. */
function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))
  return m ? m[1] : undefined
}

/**
 * Split a node-id list attribute. nstratos is inconsistent: `parents` uses
 * `|` separators (`a|b`) while `children` uses spaces (`a b`) — accept both.
 */
function ids(value: string | undefined): string[] {
  return value
    ? value
        .trim()
        .split(/[\s|]+/)
        .filter(Boolean)
    : []
}

/** Parse every `<ability-pick>` opening tag into a {@link TopoNode}. */
export function parseAbilityPicks(html: string): TopoNode[] {
  const tags = html.match(/<ability-pick\b[^>]*>/g) ?? []
  const nodes: TopoNode[] = []
  for (const tag of tags) {
    const id = attr(tag, 'id')
    if (!id) continue // an ability-pick with no id is unusable; skip
    const style = attr(tag, 'style') ?? ''
    const top = Number(style.match(/top:\s*(-?\d+(?:\.\d+)?)px/)?.[1] ?? NaN)
    const left = Number(style.match(/left:\s*(-?\d+(?:\.\d+)?)px/)?.[1] ?? NaN)
    // Coordinates drive tier/position; a non-parseable style is fail-closed
    // rather than silently bucketed into a plausible-but-wrong tier.
    if (!Number.isFinite(top) || !Number.isFinite(left)) {
      throw new Error(`Ability-pick "${id}" has no parseable top/left in style "${style}"`)
    }
    const unlockLevel = attr(tag, 'unlock-level')
    const unlockPoints = attr(tag, 'unlock-attribute-points')
    const unlockAttrs = attr(tag, 'unlock-attributes')
    const node: TopoNode = {
      id,
      tree: id.replace(/-\d+$/, ''),
      key: attr(tag, 'key') ?? null,
      label: attr(tag, 'label') ?? '',
      icon: attr(tag, 'img') ?? '',
      top,
      left,
      parents: ids(attr(tag, 'parents')),
      children: ids(attr(tag, 'children')),
    }
    if (unlockLevel || unlockPoints || unlockAttrs) {
      node.unlock = {}
      if (unlockLevel) node.unlock.level = Number(unlockLevel)
      if (unlockPoints) node.unlock.attributePoints = Number(unlockPoints)
      if (unlockAttrs) node.unlock.attributes = ids(unlockAttrs)
    }
    nodes.push(node)
  }
  return nodes
}

/**
 * Assign an integer `tier` and `position` to every node. Tier comes from the
 * vertical (`top`) band within a tree, position from left-to-right order inside
 * a band. Bands are clustered per tree so trees with different row spacing each
 * get contiguous tiers starting at 1.
 */
export function computeTierPosition(
  nodes: TopoNode[],
  tolerancePx = 50,
): Map<string, { tier: number; position: number }> {
  const out = new Map<string, { tier: number; position: number }>()
  const byTree = new Map<string, TopoNode[]>()
  for (const n of nodes) {
    const list = byTree.get(n.tree) ?? []
    list.push(n)
    byTree.set(n.tree, list)
  }
  for (const list of byTree.values()) {
    // Cluster distinct top values into bands (sorted ascending -> tier 1..n).
    const tops = [...new Set(list.map((n) => n.top))].sort((a, b) => a - b)
    const bands: number[][] = []
    for (const t of tops) {
      const last = bands[bands.length - 1]
      if (last && t - last[last.length - 1] <= tolerancePx) last.push(t)
      else bands.push([t])
    }
    const tierOfTop = new Map<number, number>()
    bands.forEach((band, i) => band.forEach((t) => tierOfTop.set(t, i + 1)))
    // Position: order by left within a tier.
    const byTier = new Map<number, TopoNode[]>()
    for (const n of list) {
      const tier = tierOfTop.get(n.top) ?? 1
      const arr = byTier.get(tier) ?? []
      arr.push(n)
      byTier.set(tier, arr)
    }
    for (const [tier, arr] of byTier) {
      arr.sort((a, b) => a.left - b.left)
      arr.forEach((n, position) => out.set(n.id, { tier, position }))
    }
  }
  return out
}

/**
 * Cross-validate `parents` against `children`. Because `parents` is the
 * authoritative source of `requires`, the two severities differ:
 *
 * - **hard** — a `parents` reference to a node that does not exist. This would
 *   silently drop a real prerequisite, so the caller fails closed.
 * - **soft** — a missing-mirror asymmetry (a parent edge not echoed in the
 *   other node's `children`, or a dangling `children` ref). These do not affect
 *   `requires`; the caller records them as notes.
 */
export function checkEdges(nodes: TopoNode[]): { hard: string[]; soft: string[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const hard: string[] = []
  const soft: string[] = []
  for (const n of nodes) {
    for (const p of n.parents) {
      const parent = byId.get(p)
      if (!parent) hard.push(`Node "${n.id}" lists unknown parent "${p}"`)
      else if (!parent.children.includes(n.id))
        soft.push(`Asymmetry: "${n.id}".parents has "${p}" but "${p}".children omits "${n.id}"`)
    }
    for (const c of n.children) {
      const child = byId.get(c)
      if (!child) soft.push(`Node "${n.id}" lists unknown child "${c}"`)
      else if (!child.parents.includes(n.id))
        soft.push(`Asymmetry: "${n.id}".children has "${c}" but "${c}".parents omits "${n.id}"`)
    }
  }
  return { hard, soft }
}
