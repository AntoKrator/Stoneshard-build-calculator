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
  const unlockMet = isUnlocked(skill.unlock, character.level, character.attributes, baseAttributeValue)
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
export function computeTreeLayout(skills: Skill[], config: LayoutConfig = DEFAULT_CONFIG): TreeLayout {
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
