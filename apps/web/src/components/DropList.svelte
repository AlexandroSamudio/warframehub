<script lang="ts">
  import type { ItemDrop } from '@warframehub/shared';
  import { formatChance, groupDrops, REFINEMENTS } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
  import Icon from './Icon.svelte';

  interface Props {
    drops: ItemDrop[];
  }

  let { drops }: Props = $props();

  const TOP = 5;
  let all = $state(false);
  const sources = $derived(groupDrops(drops));
  const shown = $derived(all ? sources : sources.slice(0, TOP));
  const hasRelics = $derived(sources.some((s) => s.kind === 'relic'));
</script>

<details class="drops">
  <summary>
    <span class="chevron"><Icon name="chevron" size={12} /></span>
    {t('farm.allDrops', { count: sources.length })}
  </summary>
  {#if hasRelics}<p class="legend">{t('farm.refinements')}</p>{/if}
  <ul>
    {#each shown as s, i (i)}
      <li>
        {#if s.kind === 'relic'}
          <span class="where">{s.relic}</span>
          <span class="chance num">
            {REFINEMENTS.map((r) =>
              s.chances[r] === null ? '–' : formatChance(s.chances[r]),
            ).join(' / ')}
          </span>
        {:else}
          <span class="where">{s.location}</span>
          <span class="chance num">{formatChance(s.chance)}</span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if !all && sources.length > TOP}
    <button type="button" class="more" onclick={() => (all = true)}>
      {t('farm.showAll', { count: sources.length })}
    </button>
  {/if}
</details>

<style>
  .drops {
    font-size: 0.85rem;
  }

  summary {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.5rem; /* 24px target (WCAG 2.5.8) */
    cursor: pointer;
    color: var(--muted);
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    color: var(--fg);
  }

  .chevron {
    display: inline-flex;
  }

  @media (prefers-reduced-motion: no-preference) {
    .chevron {
      transition: transform 120ms ease;
    }
  }

  .drops[open] .chevron {
    transform: rotate(90deg);
  }

  .legend {
    margin: 0.3rem 0 0 1.1rem;
    font-size: 0.75rem;
    color: var(--muted);
    text-align: right;
  }

  ul {
    list-style: none;
    margin: 0.2rem 0 0;
    padding: 0 0 0 1.1rem;
    display: grid;
    gap: 0.15rem;
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.6rem;
    align-items: baseline;
  }

  .where {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .chance {
    text-align: right;
  }

  .more {
    margin: 0.3rem 0 0 1.1rem;
  }
</style>
