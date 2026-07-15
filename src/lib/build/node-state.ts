/**
 * Pure skill-node logic for the tree UI (U5, the tested seam — KTD12).
 *
 * `nodeState` derives the four-way visual state of a node from the recomputed
 * character; `computeTreeLayout` places a tree's nodes by tier/position and emits
 * one connection edge per prerequisite. Both are pure so the components above them
 * stay thin and the behavior is unit-tested without mounting anything.
 */
import type { Skill } from '../types'
import type { Character } from './character'
import { isUnlocked } from './economy'

export type NodeState = 'locked' | 'unlocked-unaffordable' | 'affordable' | 'taken'

/**
 * The node's state: taken; locked (a prerequisite or the unlock gate is unmet);
 * affordable (unlocked and a skill point is free); or unlocked-unaffordable
 * (legal to take but no point available).
 */
export function nodeState(
  skill: Skill,
  character: Character,
  baseAttributeValue: number,
): NodeState {
  if (character.taken.has(skill.key)) return 'taken'

  const requiresMet = skill.requires.every((r) => character.taken.has(r))
  const unlockMet = isUnlocked(
    skill.unlock,
    character.level,
    character.attributes,
    baseAttributeValue,
  )
  if (!requiresMet || !unlockMet) return 'locked'

  const hasPoint = character.skillsSpent < character.skillBudget
  return hasPoint ? 'affordable' : 'unlocked-unaffordable'
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export interface LayoutConfig {
  cellWidth: number
  cellHeight: number
}

export interface LayoutNode {
  key: string
  skill: Skill
  tier: number
  position: number
  cx: number
  cy: number
}

export interface LayoutEdge {
  from: string
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface TreeLayout {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
}

const DEFAULT_CONFIG: LayoutConfig = { cellWidth: 84, cellHeight: 92 }

/**
 * Place a tree's skills on a grid (column = position, row = tier) and connect each
 * skill to its in-tree prerequisites. Pure: identical input → identical layout.
 */
export function computeTreeLayout(
  skills: Skill[],
  config: LayoutConfig = DEFAULT_CONFIG,
): TreeLayout {
  const { cellWidth, cellHeight } = config

  let maxPosition = 0
  let maxTier = 1
  const nodes: LayoutNode[] = skills.map((skill) => {
    maxPosition = Math.max(maxPosition, skill.position)
    maxTier = Math.max(maxTier, skill.tier)
    return {
      key: skill.key,
      skill,
      tier: skill.tier,
      position: skill.position,
      cx: skill.position * cellWidth + cellWidth / 2,
      cy: (skill.tier - 1) * cellHeight + cellHeight / 2,
    }
  })

  const byKey = new Map(nodes.map((n) => [n.key, n]))
  const edges: LayoutEdge[] = []
  for (const node of nodes) {
    for (const req of node.skill.requires) {
      const from = byKey.get(req)
      if (!from) continue // prerequisite in another tree (rare) — skip the line
      edges.push({ from: req, to: node.key, x1: from.cx, y1: from.cy, x2: node.cx, y2: node.cy })
    }
  }

  return {
    nodes,
    edges,
    width: (maxPosition + 1) * cellWidth,
    height: maxTier * cellHeight,
  }
}

/* ------------------------------------------------------------------ */
/* Connection shapes (game/wiki-faithful line routing)                 */
/* ------------------------------------------------------------------ */

/** Half the vertical gap between a bowtie's two brackets. */
const BOWTIE_SPLIT = 7
/** Vertical spacing between staggered rails of colliding components. */
const LANE_SPACING = 8
/** Horizontal margin under which two components' spans count as colliding. */
const LANE_MARGIN = 12

export interface BowtieShape {
  /** Multi-segment SVG path: parent drops, upper bracket, center, lower bracket, child drops. */
  d: string
  cx: number
  cy: number
}

export interface PlainEdge {
  edge: LayoutEdge
  /** The (possibly lane-staggered) y of this edge's horizontal rail segment. */
  railY: number
}

export interface TreeShapes {
  /** Fully cross-connected M×N (≥2×≥2) components, drawn as merge→junction→fan. */
  bowties: BowtieShape[]
  /** Everything else, drawn as per-edge elbows (overdraw yields the wiki look). */
  plain: PlainEdge[]
  /** Junction dots: wherever ≥3 line ends meet on a rail, plus bowtie centers. */
  diamonds: { x: number; y: number }[]
}

export const railYOf = (e: LayoutEdge): number => (e.y1 + e.y2) / 2

interface RailComponent {
  edges: LayoutEdge[]
  pxs: number[]
  cxs: number[]
  lo: number
  hi: number
  isBowtie: boolean
  offset: number
}

/**
 * Group edges by tier-pair rail, split each rail into connected components, and
 * classify: a fully cross-connected M×N component (≥2 parents and ≥2 children)
 * becomes the game's **bowtie** (per-edge elbows would overdraw it into an
 * H-ladder — visibly wrong vs. the wiki tree images); everything else stays
 * per-edge, with junction dots wherever ≥3 line ends meet (plain corners bare).
 *
 * Distinct components whose horizontal spans touch on the same rail are
 * **staggered vertically** (like the wiki), so two unrelated structures — e.g.
 * Daggers' tier-2 fan next to its tier-2 merge — can't fuse into one line that
 * fakes a connection.
 */
export function computeTreeShapes(edges: LayoutEdge[]): TreeShapes {
  const byRail: Record<number, LayoutEdge[]> = {}
  for (const e of edges) (byRail[railYOf(e)] ??= []).push(e)

  const bowties: BowtieShape[] = []
  const plain: PlainEdge[] = []
  const diamonds: { x: number; y: number }[] = []

  for (const [yKey, rail] of Object.entries(byRail)) {
    const y = Number(yKey)
    // Connected components via node keys (path-compressing union-find).
    const parent: Record<string, string> = {}
    const find = (k: string): string => (parent[k] === k ? k : (parent[k] = find(parent[k])))
    for (const e of rail) {
      parent[e.from] ??= e.from
      parent[e.to] ??= e.to
      parent[find(e.from)] = find(e.to)
    }
    const grouped: Record<string, LayoutEdge[]> = {}
    for (const e of rail) (grouped[find(e.from)] ??= []).push(e)

    const comps: RailComponent[] = Object.values(grouped).map((comp) => {
      const pxs = [...new Set(comp.map((e) => e.x1))]
      const cxs = [...new Set(comp.map((e) => e.x2))]
      const all = [...pxs, ...cxs]
      return {
        edges: comp,
        pxs,
        cxs,
        lo: Math.min(...all),
        hi: Math.max(...all),
        isBowtie: comp.length === pxs.length * cxs.length && pxs.length >= 2 && cxs.length >= 2,
        offset: 0,
      }
    })

    // Lane-stagger horizontal-bearing components that touch: greedy interval
    // scheduling by span, then spread lanes symmetrically around the rail.
    const withRailSpan = comps.filter((c) => c.hi > c.lo).sort((a, b) => a.lo - b.lo)
    const laneEnds: number[] = []
    const laneOf: number[] = []
    for (const c of withRailSpan) {
      let lane = laneEnds.findIndex((end) => c.lo - end >= LANE_MARGIN)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(c.hi)
      } else {
        laneEnds[lane] = c.hi
      }
      laneOf.push(lane)
    }
    const lanes = laneEnds.length
    withRailSpan.forEach((c, i) => {
      c.offset = (laneOf[i] - (lanes - 1) / 2) * LANE_SPACING
    })

    for (const c of comps) {
      const railY = y + c.offset
      if (!c.isBowtie) {
        for (const e of c.edges) plain.push({ edge: e, railY })
        const all = [...new Set([...c.pxs, ...c.cxs])]
        for (const x of all) {
          const ends =
            (c.pxs.includes(x) ? 1 : 0) +
            (c.cxs.includes(x) ? 1 : 0) +
            (x > c.lo ? 1 : 0) +
            (x < c.hi ? 1 : 0)
          if (ends >= 3) diamonds.push({ x, y: railY })
        }
        continue
      }
      // Bowtie: upper bracket (parents → center), junction, lower bracket
      // (center → children).
      const cx = (c.lo + c.hi) / 2
      const upY = railY - BOWTIE_SPLIT
      const loY = railY + BOWTIE_SPLIT
      const py = c.edges[0].y1
      const chy = c.edges[0].y2
      const parts: string[] = []
      for (const px of c.pxs) parts.push(`M ${px} ${py} V ${upY}`)
      parts.push(`M ${Math.min(...c.pxs, cx)} ${upY} H ${Math.max(...c.pxs, cx)}`)
      parts.push(`M ${cx} ${upY} V ${loY}`)
      parts.push(`M ${Math.min(...c.cxs, cx)} ${loY} H ${Math.max(...c.cxs, cx)}`)
      for (const chx of c.cxs) parts.push(`M ${chx} ${loY} V ${chy}`)
      bowties.push({ d: parts.join(' '), cx, cy: railY })
    }
  }
  return { bowties, plain, diamonds }
}
