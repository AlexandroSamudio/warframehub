<script lang="ts">
  import {
    formatAmount,
    formatChance,
    groupDrops,
    joinNames,
    relicNames,
    type DropSource,
    type FarmQueue,
    type MissingPart,
  } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
  import AmountField from './AmountField.svelte';
  import DropList from './DropList.svelte';

  interface Props {
    queue: FarmQueue;
    onSetStock: (key: string, amount: number) => Promise<boolean>;
  }

  let { queue, onSetStock }: Props = $props();

  const empty = $derived(
    queue.farmNow.length === 0 && queue.vaulted.length === 0 && queue.resources.length === 0,
  );
  const MAX_RELICS = 4;

  function best(sources: DropSource[]): string {
    const top = sources[0];
    if (!top) return t('farm.noDrops');
    if (top.kind === 'relic') {
      return t('farm.bestRelic', { relic: top.relic, chance: formatChance(top.best) });
    }
    return top.chance === null
      ? t('farm.bestNoChance', { location: top.location })
      : t('farm.best', { location: top.location, chance: formatChance(top.chance) });
  }

  function relicList(p: MissingPart): string {
    const names = relicNames(p.drops);
    const shown = names.slice(0, MAX_RELICS).join(', ');
    return names.length > MAX_RELICS ? `${shown}…` : shown;
  }
</script>

<section class="queue frame accent" aria-labelledby="farm-title">
  <h2 id="farm-title">{t('farm.title')}</h2>

  {#if empty}
    <p class="muted">{t('farm.nothing')}</p>
  {:else}
    {#if queue.farmNow.length > 0}
      <h3 class="group">{t('farm.farmNow')}</h3>
      <ul class="rows">
        {#each queue.farmNow as p (`${p.goalId}:${p.key}`)}
          {@const sources = groupDrops(p.drops)}
          <li class="row">
            <div class="what">
              <span class="lead">
                {#if p.missing > 1}<span class="num">{t('farm.count', { count: p.missing })}</span
                  >{/if}
                {p.name}
              </span>
              <span class="for">{t('farm.for', { goal: p.goalName })}</span>
            </div>
            <p class="best num" class:none={sources.length === 0}>{best(sources)}</p>
            {#if sources.length > 1}<DropList drops={p.drops} />{/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if queue.vaulted.length > 0}
      <h3 class="group">{t('farm.vaultedTitle')}</h3>
      <p class="note">{t('farm.vaultedOnce')}</p>
      <ul class="rows compact">
        {#each queue.vaulted as p (`${p.goalId}:${p.key}`)}
          <li class="row">
            <div class="what">
              <span class="lead">
                {#if p.missing > 1}<span class="num">{t('farm.count', { count: p.missing })}</span
                  >{/if}
                {p.name}
              </span>
              <span class="for">{t('farm.for', { goal: p.goalName })}</span>
            </div>
            {#if p.drops.length > 0}
              <p class="relics">{t('farm.relics', { names: relicList(p) })}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if queue.resources.length > 0}
      <h3 class="group">{t('farm.resources')}</h3>
      <ul class="rows">
        {#each queue.resources as r (r.key)}
          <li class="row resource">
            <div class="what">
              <span class="lead">{r.name}</span>
              <span class="for"
                >{t('farm.for', { goal: joinNames(r.goals.map((g) => g.name)) })}</span
              >
            </div>
            <p class="missing num">{t('farm.missing', { missing: formatAmount(r.missing) })}</p>
            <span class="amount">
              <span class="have-label">{t('farm.have')}</span>
              <AmountField
                value={r.have}
                label={`${t('farm.have')} ${r.name}`}
                onSave={(amount) => onSetStock(r.key, amount)}
              />
              <span class="num of">{t('farm.haveOf', { needed: formatAmount(r.needed) })}</span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .queue {
    padding: 0.95rem 1.15rem 0.9rem;
    display: grid;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.2;
    color: var(--gold);
  }

  .group {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  .muted,
  .note {
    margin: 0;
    color: var(--muted);
  }

  .note {
    font-size: 0.85rem;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .row {
    display: grid;
    gap: 0.15rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .row:last-child {
    border-bottom: 0;
  }

  .compact .row {
    padding: 0.3rem 0;
  }

  .what {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.5rem;
  }

  .lead {
    font-weight: 600;
  }

  .for,
  .relics {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .relics {
    margin: 0;
  }

  .best {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--fg);
  }

  .best.none {
    font-weight: 400;
    color: var(--muted);
  }

  .resource {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    column-gap: 1rem;
  }

  .resource .what,
  .missing {
    grid-column: 1;
  }

  .amount {
    grid-column: 2;
    grid-row: 1 / span 2;
    display: grid;
    grid-template-columns: auto auto 6.5rem;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .missing {
    margin: 0;
    font-size: 0.85rem;
    color: var(--gold);
  }

  @media (max-width: 30rem) {
    .resource {
      grid-template-columns: minmax(0, 1fr);
    }

    .amount {
      grid-column: 1;
      grid-row: auto;
    }
  }
</style>
