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
    onHover: (skill: Skill, entering: boolean) => void
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
    onmouseenter={() => onHover(skill, true)}
    onmouseleave={() => onHover(skill, false)}
    onfocus={() => onHover(skill, true)}
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
  .affordable .pick {
    border-color: var(--accent-dim);
    box-shadow: 0 0 0 2px rgba(201, 162, 39, 0.25);
  }
  .taken .pick {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(201, 162, 39, 0.4);
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
