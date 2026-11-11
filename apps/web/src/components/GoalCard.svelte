<script lang="ts">
  import type { Goal, GoalResource } from '@warframehub/shared';
  import { formatAmount, materialList, progressPercent, splitResources } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
  import AmountField from './AmountField.svelte';
  import PartWhere from './PartWhere.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    goal: Goal;
    isFirst: boolean;
    isLast: boolean;
    onPart: (goalId: number, key: string, owned: number) => void;
    onNote: (goalId: number, key: string, note: string) => Promise<boolean>;
    onStock: (key: string, amount: number) => Promise<boolean>;
    onBuilt: (goalId: number) => void;
    onRemove: (goalId: number) => void;
    onRefresh: (goalId: number) => Promise<boolean>;
    onMove: (goalId: number, by: -1 | 1) => void;
  }

  let {
    goal,
    isFirst,
    isLast,
    onPart,
    onNote,
    onStock,
    onBuilt,
    onRemove,
    onRefresh,
    onMove,
  }: Props = $props();

  let open = $state(false);
  let confirm = $state<'built' | 'remove' | null>(null);
  let refreshing = $state(false);

  const bodyId = $derived(`goal-${goal.id}-body`);
  const percent = $derived(progressPercent(goal));
  const resourceGroups = $derived(splitResources(goal.resources));
  const recipeDate = $derived(
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(goal.recipeFetchedAt),
    ),
  );

  function saveCount(key: string, current: number, max: number, e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 0 || value > max) {
      input.value = String(current);
      return;
    }
    if (value !== current) onPart(goal.id, key, value);
  }

  async function refresh() {
    refreshing = true;
    try {
      await onRefresh(goal.id);
    } finally {
      refreshing = false;
    }
  }
</script>

{#snippet resourceRow(r: GoalResource)}
  {@const enough = r.have >= r.count}
  <li class="line resource">
    <span class="res-name">{r.name}</span>
    <span class="share num" class:enough>
      {enough
        ? t('goal.shareEnough', { count: formatAmount(r.count) })
        : t('goal.shareShort', {
            have: formatAmount(r.have),
            count: formatAmount(r.count),
            short: formatAmount(r.count - r.have),
          })}
      {#if r.forParts > 0 && r.forParts < r.count}
        <span class="incl">· {t('goal.inclParts', { count: formatAmount(r.forParts) })}</span>
      {/if}
    </span>
    <span class="stock">
      <span class="have-label">{t('goal.stock')}</span>
      <AmountField
        value={r.stock}
        label={`${t('goal.stock')} ${r.name}`}
        onSave={(amount) => onStock(r.key, amount)}
      />
    </span>
  </li>
{/snippet}

<article class="goal frame" class:accent={open} class:ready={goal.ready}>
  <header>
    <h3 class="title">
      <button
        type="button"
        class="toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onclick={() => (open = !open)}
      >
        <span class="chevron" class:open><Icon name="chevron" size={14} /></span>
        <span class="name">{goal.name}</span>
      </button>
    </h3>
    <span class="badges">
      {#if goal.isPrime}<span class="badge gold">{t('goals.prime')}</span>{/if}
      {#if goal.vaulted}<span class="badge">{t('goals.vaulted')}</span>{/if}
      {#if goal.ready}<span class="badge ok">{t('goals.ready')}</span>{/if}
    </span>
    <div class="progress">
      <div class="bar" aria-hidden="true"><div class="fill" style:width="{percent}%"></div></div>
      <span class="num">{t('goal.progress', goal.progress)}</span>
    </div>
    {#if open}
      <span class="order">
        <button
          type="button"
          class="icon"
          disabled={isFirst}
          onclick={() => onMove(goal.id, -1)}
          aria-label={t('goal.moveUp', { name: goal.name })}><Icon name="up" size={14} /></button
        >
        <button
          type="button"
          class="icon"
          disabled={isLast}
          onclick={() => onMove(goal.id, 1)}
          aria-label={t('goal.moveDown', { name: goal.name })}
          ><Icon name="down" size={14} /></button
        >
      </span>
    {/if}
  </header>

  {#if open}
    <div class="body" id={bodyId}>
      <div class="lists">
        <div>
          <h4 class="group">{t('goal.parts')}</h4>
          <ul>
            {#each goal.parts as p, i (p.key)}
              <li class="line">
                {#if p.count === 1}
                  <label class="check">
                    <input
                      id={`part-${goal.id}-${i}`}
                      type="checkbox"
                      checked={p.owned >= 1}
                      onchange={(e) =>
                        onPart(
                          goal.id,
                          p.key,
                          (e.currentTarget as HTMLInputElement).checked ? 1 : 0,
                        )}
                    />
                    <span class:done={p.owned >= 1}>{p.name}</span>
                  </label>
                {:else}
                  <label class="check">
                    <input
                      id={`part-${goal.id}-${i}`}
                      type="number"
                      class="num count"
                      min="0"
                      max={p.count}
                      value={p.owned}
                      onchange={(e) => saveCount(p.key, p.owned, p.count, e)}
                      aria-label={t('goal.partLabel', { name: p.name, goal: goal.name })}
                    />
                    <span class:done={p.owned >= p.count}>
                      <span class="num">/ {p.count}</span>
                      {p.name}
                    </span>
                  </label>
                {/if}
                {#if p.craft}
                  <div class="craft">
                    <span class="craft-label">{t('part.craftLabel')}</span>
                    <ul class="materials" aria-label={t('part.craftList', { name: p.name })}>
                      {#each materialList(p.craft) as m (m.name)}
                        <li><b class="num">{formatAmount(m.count)}</b> {m.name}</li>
                      {/each}
                    </ul>
                  </div>
                {:else if goal.category === 'warframe' && p.name !== 'Blueprint'}
                  <p class="craft-none">{t('part.craftMissing')}</p>
                {/if}
                {#if p.drops.length === 0 || p.note !== ''}
                  <div class="part-note">
                    <PartWhere
                      note={p.note}
                      sources={p.sources}
                      context={p.name}
                      onSave={(note) => onNote(goal.id, p.key, note)}
                    />
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        </div>

        <div>
          <h4 class="group">{t('goal.resourcesFor', { name: goal.name })}</h4>
          <ul>
            {#each resourceGroups.forItem as r (r.key)}
              {@render resourceRow(r)}
            {/each}
          </ul>
          {#if resourceGroups.forPartsOnly.length > 0}
            <h4 class="group second">{t('goal.resourcesForParts')}</h4>
            <ul>
              {#each resourceGroups.forPartsOnly as r (r.key)}
                {@render resourceRow(r)}
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <p class="note">{t('goal.recipeDate', { date: recipeDate })}</p>

      <div class="actions">
        {#if confirm === 'built'}
          <span class="confirm">{t('goal.builtConfirm', { name: goal.name })}</span>
          <button type="button" class="primary" onclick={() => onBuilt(goal.id)}
            >{t('goal.builtYes')}</button
          >
          <button type="button" onclick={() => (confirm = null)}>{t('goal.cancel')}</button>
        {:else if confirm === 'remove'}
          <span class="confirm bad">{t('goal.removeConfirm', { name: goal.name })}</span>
          <button type="button" class="danger" onclick={() => onRemove(goal.id)}
            >{t('goal.removeYes')}</button
          >
          <button type="button" onclick={() => (confirm = null)}>{t('goal.cancel')}</button>
        {:else}
          <button type="button" class="primary" onclick={() => (confirm = 'built')}>
            {t('goal.builtButton')}
          </button>
          <button type="button" class="teal with-icon" disabled={refreshing} onclick={refresh}>
            <Icon name="refresh" size={14} />
            {refreshing ? t('goal.refreshing') : t('goal.refresh')}
          </button>
          <button type="button" class="danger" onclick={() => (confirm = 'remove')}>
            {t('goal.remove')}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</article>

<style>
  .goal {
    --cut: 10px;
    padding: 0.6rem 0.9rem;
  }

  .goal.ready {
    --frame-line: color-mix(in srgb, var(--ok) 45%, var(--line));
  }

  header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(8rem, 14rem) auto;
    grid-template-areas: 'title badges progress order';
    align-items: center;
    gap: 0.4rem 0.8rem;
  }

  .title {
    grid-area: title;
    margin: 0;
    font-size: 1.05rem;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0.2rem;
    border: 0;
    background: transparent;
    font: inherit;
    font-family: var(--font-display);
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0.04em;
    color: var(--gold);
  }

  .toggle:hover:not(:disabled) {
    background: transparent;
    color: var(--fg);
  }

  .chevron {
    display: inline-flex;
    color: var(--muted);
  }

  @media (prefers-reduced-motion: no-preference) {
    .chevron {
      transition: transform 120ms ease;
    }
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .name {
    text-align: left;
  }

  .badges {
    grid-area: badges;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .progress {
    grid-area: progress;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .bar {
    flex: 1;
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

  .order {
    grid-area: order;
    display: flex;
    gap: 0.25rem;
  }

  .order button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    min-height: 2rem;
  }

  @media (max-width: 36rem) {
    header {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'title order'
        'badges badges'
        'progress progress';
    }
  }

  .body {
    display: grid;
    gap: 0.6rem;
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--line);
  }

  .lists {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
    gap: 0.6rem 1.5rem;
  }

  .group.second {
    margin-top: 0.8rem;
  }

  .group {
    margin: 0 0 0.25rem;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.75rem;
    cursor: pointer;
  }

  .count {
    width: 3.5rem;
  }

  /* "To craft" + quantity/name pairs: the quantity is the readout, the name is dim. */
  .craft {
    margin: 0.15rem 0 0 1.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.1rem 0.6rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .craft-label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .materials {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem 0.9rem;
  }

  .materials li {
    white-space: nowrap; /* a quantity never gets separated from its name */
  }

  .materials b {
    font-weight: 600;
    color: var(--fg);
  }

  .craft-none {
    margin: 0.15rem 0 0 1.5rem;
    font-size: 0.85rem;
    color: var(--muted);
    font-style: italic;
  }

  .part-note {
    margin: 0.25rem 0 0 1.5rem;
  }

  .incl {
    color: var(--muted);
  }

  .done {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent);
  }

  .resource {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'name stock'
      'share stock';
    align-items: start;
    column-gap: 0.8rem;
  }

  .res-name {
    grid-area: name;
  }

  .share {
    grid-area: share;
    font-size: 0.85rem;
    color: var(--gold);
  }

  .share.enough {
    color: var(--ok);
  }

  .stock {
    grid-area: stock;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .note {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .confirm {
    font-size: 0.85rem;
    color: var(--gold);
  }

  .confirm.bad {
    color: var(--bad);
  }

  .with-icon {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
</style>
