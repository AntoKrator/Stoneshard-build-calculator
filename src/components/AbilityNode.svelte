<script lang="ts">
  // One skill node. Left-click ranks up (only when affordable); a taken node shows
  // a visible refund (−) control so rank-down is discoverable and keyboard-reachable
  // (U5). The tooltip appears on hover/focus and is dismissed on leave/blur, without
  // consuming the rank gesture.
  import Icon from './Icon.svelte'
  import Tooltip from './Tooltip.svelte'
  import type { Skill } from '../lib/types'
  import type { NodeState } from '../lib/build/node-state'
  import type { Scope } from '../lib/formula/eval'

  let {
    skill,
    status,
    scope,
    onPick,
    onRefund,
  }: {
    skill: Skill
    status: NodeState
    scope: Scope
    onPick: (key: string) => void
    onRefund: (key: string) => void
  } = $props()

  let hovered = $state(false)
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
    onmouseenter={() => (hovered = true)}
    onmouseleave={() => (hovered = false)}
    onfocus={() => (hovered = true)}
    onblur={() => (hovered = false)}
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

  {#if hovered}
    <div class="tip">
      <strong class="tip-name">{skill.name.english}</strong>
      {#if skill.tooltip?.english}
        <Tooltip tooltip={skill.tooltip.english} formulas={skill.formulas} {scope} />
      {/if}
    </div>
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

  .tip {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    width: max-content;
  }
  .tip-name {
    display: block;
    margin-bottom: 0.25rem;
    color: var(--accent);
  }
</style>
