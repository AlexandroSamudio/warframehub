<script lang="ts">
  import type { Goal } from '@warframehub/shared';
  import { onMount } from 'svelte';
  import { getGoals } from '../lib/api.ts';
  import { progressPercent } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
  import { hrefFor } from '../lib/route.svelte.ts';

  const MAX = 5;
  let active = $state<Goal[]>([]);

  onMount(() => {
    getGoals()
      .then((d) => (active = d.active))
      .catch(() => {
        // The card is a reminder; without data it stays hidden.
      });
  });
</script>

{#if active.length > 0}
  <section class="card frame accent" aria-labelledby="goals-card-title">
    <header>
      <h2 id="goals-card-title">{t('goalsCard.title')}</h2>
      <a href={hrefFor('goals')}>{t('goalsCard.open')}</a>
    </header>
    <ul>
      {#each active.slice(0, MAX) as goal (goal.id)}
        <li class:ready={goal.ready}>
          <a class="name" href={hrefFor('goals')}>{goal.name}</a>
          <span class="num count">{t('goal.progress', goal.progress)}</span>
          <div class="bar" aria-hidden="true">
            <div class="fill" style:width="{progressPercent(goal)}%"></div>
          </div>
        </li>
      {/each}
    </ul>
    {#if active.length > MAX}
      <p class="more">{t('goalsCard.more', { count: active.length - MAX })}</p>
    {/if}
  </section>
{/if}

<style>
  .card {
    --cut: 10px;
    padding: 0.75rem 0.95rem 0.7rem;
    display: grid;
    gap: 0.5rem;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    line-height: 1.2;
    color: var(--gold);
  }

  a {
    font-size: 0.85rem;
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.45rem;
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.15rem 0.5rem;
    font-size: 0.9rem;
  }

  .name {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: inherit;
    color: var(--fg);
    text-decoration: none;
  }

  .name:hover,
  .name:focus-visible {
    text-decoration: underline;
  }

  .count {
    font-size: 0.85rem;
    color: var(--muted);
  }

  /* Same bar as the goal cards on the Goals screen. */
  .bar {
    grid-column: 1 / -1;
    height: 4px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    box-sizing: content-box;
  }

  .fill {
    height: 100%;
    background: var(--teal);
  }

  .ready .fill {
    background: var(--ok);
  }

  .more {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
