<script lang="ts">
  // One skill node. Left-click ranks up (only when affordable); a taken node shows
  // a visible refund (−) control so rank-down is discoverable and keyboard-reachable
  // (U5). Hovering/focusing the node reports the skill upward so the tree can render
  // a single tooltip outside the scroll clip — the node never draws the tooltip
  // itself (it would be clipped and stack behind siblings).
  import Icon from './Icon.svelte'
  import type { Skill } from '../lib/types'
  import type { NodeState } from '../lib/build/node-state'

  let {
    skill,
    status,
    onPick,
    onRefund,
    onHover,
  }: {
    skill: Skill
    status: NodeState
    onPick: (key: string) => void
    onRefund: (key: string) => void
    onHover: (skill: Skill, entering: boolean, el?: HTMLElement) => void
  } = $props()

  const canPick = $derived(status === 'affordable')
  const taken = $derived(status === 'taken')
</script>

<div class="node {status}">
  <button
    class="pick"
    disabled={!canPick}
    aria-label={skill.name.english}
    aria-pressed={taken}
    onclick={() => canPick && onPick(skill.key)}
    onmouseenter={(e) => onHover(skill, true, e.currentTarget)}
    onmouseleave={() => onHover(skill, false)}
    onfocus={(e) => onHover(skill, true, e.currentTarget)}
    onblur={() => onHover(skill, false)}
  >
    <Icon icon={skill.icon} alt={skill.name.english} size={48} />
  </button>

  {#if taken}
    <button
      class="refund"
      aria-label={`Refund ${skill.name.english}`}
      onclick={() => onRefund(skill.key)}
    >
      −
    </button>
  {/if}
</div>

<style>
  .node {
    position: relative;
    width: 48px;
    height: 48px;
  }

  /* A skill node is an icon tile, not a text button: its affordance is the border
     + state glow below, so it deliberately does NOT carry the global beveled-button
     box-shadow (which the state rules and :disabled override anyway). */
  .pick {
    padding: 2px;
    border-radius: 6px;
    border: 2px solid var(--border);
    background: var(--bg-panel-2);
    line-height: 0;
    cursor: pointer;
  }
  .pick:disabled {
    cursor: default;
    opacity: 1;
  }

  /* State styling. */
  .locked :global(.icon) {
    filter: grayscale(1) brightness(0.5);
  }
  .locked .pick {
    border-color: var(--border);
  }
  .unlocked-unaffordable :global(.icon) {
    filter: grayscale(0.4) brightness(0.8);
  }
  /* Four states stay distinguishable in the new palette: locked = darkest icon +
     plain bronze border; unaffordable = mildly dimmed icon; affordable = brass-dim
     border + soft brass glow; taken = full brass border + stronger glow. Glows are
     mixed from --accent so they track the token, not a hard-coded literal. */
  /* Glow tints are --accent (#d6a93a) at low alpha, written as rgba literals — not
     color-mix — so they render on every engine with no fallback needed (the build
     minifier strips duplicate-property fallbacks). Keep in step with --accent. */
  .affordable .pick {
    border-color: var(--accent-dim);
    box-shadow: 0 0 0 2px rgba(214, 169, 58, 0.32);
  }
  .taken .pick {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(214, 169, 58, 0.48);
  }

  .refund {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--danger);
    background: var(--bg-panel);
    color: var(--danger);
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }
</style>
