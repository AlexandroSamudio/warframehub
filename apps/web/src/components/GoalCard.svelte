<script lang="ts">
  import type { Goal, GoalResource, StockRow } from '@warframehub/shared';
  import { tick } from 'svelte';
  import { formatDay } from '../lib/time.ts';
  import {
    formatAmount,
    joinNames,
    progressPercent,
    shortList,
    splitResources,
  } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
  import AmountField from './AmountField.svelte';
  import PartRow from './PartRow.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    goal: Goal;
    isFirst: boolean;
    isLast: boolean;
    /** The shared resource stock (what each material line compares against). */
    stock: StockRow[];
    onPartStock: (
      key: string,
      amounts: { blueprints?: number; crafted?: number },
    ) => Promise<boolean>;
    onCraft: (key: string) => Promise<boolean>;
    onNote: (goalId: number, key: string, note: string) => Promise<boolean>;
    onStock: (key: string, amount: number) => Promise<boolean>;
    onBuilt: (goalId: number, useStock: boolean) => void;
    onRemove: (goalId: number) => void;
    onRefresh: (goalId: number) => Promise<boolean>;
    onMove: (goalId: number, by: -1 | 1) => void;
  }

  let {
    goal,
    isFirst,
    isLast,
    stock,
    onPartStock,
    onCraft,
    onNote,
    onStock,
    onBuilt,
    onRemove,
    onRefresh,
    onMove,
  }: Props = $props();

  let open = $state(false);
  let confirm = $state<'built' | 'remove' | null>(null);
  let actionsEl = $state<HTMLDivElement | null>(null);

  async function ask(kind: 'built' | 'remove') {
    confirm = kind;
    await tick();
    actionsEl?.querySelector('button')?.focus();
  }

  async function cancel(kind: 'built' | 'remove') {
    confirm = null;
    await tick();
    actionsEl?.querySelector<HTMLButtonElement>(`[data-act="${kind}"]`)?.focus();
  }
  let refreshing = $state(false);

  const bodyId = $derived(`goal-${goal.id}-body`);
  const percent = $derived(progressPercent(goal));
  const resourceGroups = $derived(splitResources(goal.resources));
  const recipeDate = $derived(formatDay(goal.recipeFetchedAt));

  /** "25,000 Credits and 5 Orokin Cell": the item's own resources that building uses up. */
  const buildResources = $derived(
    joinNames(
      goal.resources
        .filter((r) => r.count > r.forParts)
        .map((r) => `${formatAmount(r.count - r.forParts)} ${r.name}`),
    ),
  );

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
      {#if goal.mastered}<span class="badge">{t('goals.mastered')}</span>{/if}
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
          <ul class="parts">
            {#each goal.parts as p (p.key)}
              <PartRow
                part={p}
                goalName={goal.name}
                category={goal.category}
                {stock}
                {onPartStock}
                {onCraft}
                onNote={(key, note) => onNote(goal.id, key, note)}
              />
            {/each}
          </ul>
        </div>

        <div>
          <h4 class="group">{t('goal.resourcesFor', { name: goal.name })}</h4>
          <p class="note entry-hint">{t('farm.entryHint')}</p>
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

      <div class="actions" bind:this={actionsEl}>
        <!-- Each confirm takes focus on its first button, described by the question;
             Cancel gives focus back to the button that opened it. -->
        {#if confirm === 'built' && goal.buildShort.length > 0}
          <span class="confirm" id={`${bodyId}-confirm`}
            >{t('goal.buildShort', { name: goal.name, list: shortList(goal.buildShort) })}</span
          >
          <button
            type="button"
            aria-describedby={`${bodyId}-confirm`}
            onclick={() => onBuilt(goal.id, false)}>{t('goal.builtInGame')}</button
          >
          <button type="button" onclick={() => cancel('built')}>{t('goal.cancel')}</button>
        {:else if confirm === 'built'}
          <span class="confirm" id={`${bodyId}-confirm`}
            >{buildResources
              ? t('goal.builtConfirm', { name: goal.name, resources: buildResources })
              : t('goal.builtConfirmParts', { name: goal.name })}</span
          >
          <button
            type="button"
            class="primary"
            aria-describedby={`${bodyId}-confirm`}
            onclick={() => onBuilt(goal.id, true)}>{t('goal.builtYes')}</button
          >
          <button type="button" onclick={() => cancel('built')}>{t('goal.cancel')}</button>
        {:else if confirm === 'remove'}
          <span class="confirm bad" id={`${bodyId}-confirm`}
            >{t('goal.removeConfirm', { name: goal.name })}</span
          >
          <button
            type="button"
            class="danger"
            aria-describedby={`${bodyId}-confirm`}
            onclick={() => onRemove(goal.id)}>{t('goal.removeYes')}</button
          >
          <button type="button" onclick={() => cancel('remove')}>{t('goal.cancel')}</button>
        {:else}
          <button type="button" class="primary" data-act="built" onclick={() => ask('built')}>
            {t('goal.builtButton')}
          </button>
          <button type="button" class="teal with-icon" disabled={refreshing} onclick={refresh}>
            <Icon name="refresh" size={14} />
            {refreshing ? t('goal.refreshing') : t('goal.refresh')}
          </button>
          <button type="button" class="danger" data-act="remove" onclick={() => ask('remove')}>
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

  .entry-hint {
    margin-bottom: 0.35rem;
  }

  /* Part rows draw their own dividers. */
  .parts {
    gap: 0;
  }

  .incl {
    color: var(--muted);
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
