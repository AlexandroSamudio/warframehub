<script lang="ts">
  import type { GoalsResponse } from '@warframehub/shared';
  import { onMount, tick } from 'svelte';
  import AmountField from '../components/AmountField.svelte';
  import * as api from '../lib/api.ts';
  import { formatAmount, joinNames } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
  import { inventoryEmpty, inventoryView, type InventoryPart } from '../lib/inventory.ts';
  import { keepPlace } from '../lib/keep-place.ts';
  import { hrefFor } from '../lib/route.svelte.ts';

  /** The most a part amount can be (the API's limit). */
  const PART_MAX = 1000;

  let data = $state<GoalsResponse | null>(null);
  let loadFailed = $state(false);
  let error = $state<string | null>(null);
  let filter = $state('');

  const view = $derived(data ? inventoryView(data, filter) : null);
  const empty = $derived(data ? inventoryEmpty(data) : false);
  const idleCount = $derived(view ? view.idleResources.length + view.idleParts.length : 0);
  const noMatch = $derived(
    view !== null &&
      filter.trim() !== '' &&
      view.resources.length === 0 &&
      view.parts.length === 0 &&
      idleCount === 0,
  );

  /** One change; the server answers with everything, which replaces ours (as on Goals). */
  async function run(call: () => Promise<GoalsResponse>): Promise<boolean> {
    error = null;
    try {
      data = await call();
      return true;
    } catch (e) {
      error =
        e instanceof api.ApiCallError
          ? t('goals.saveError', { message: e.message })
          : t('goals.unreachable');
      data = await api.getGoals().catch(() => data);
      return false;
    }
  }

  // A part amount can add or remove resource rows above it (its materials count until
  // you have the part), and a 0 can take a row out of "Not needed right now": keep the
  // row in place, and if it's gone, put focus on that group's summary.
  let idleSummary = $state<HTMLElement | null>(null);
  let titleEl = $state<HTMLHeadingElement | null>(null);
  const steady = (call: () => Promise<GoalsResponse>) =>
    keepPlace(
      () => run(call),
      () => tick(),
      // The last idle row takes the whole group with it: then the page title.
      () => (idleSummary?.isConnected ? idleSummary : titleEl),
    );
  const setResource = (key: string, amount: number) => steady(() => api.setStock(key, amount));
  const setPart = (key: string, amounts: { blueprints?: number; crafted?: number }) =>
    steady(() => api.setPartStock(key, amounts));

  // "Not needed right now" opens when you start filtering (matches may be in it), but
  // otherwise stays as you left it.
  let idleOpen = $state(false);
  let wasFiltering = false;
  $effect(() => {
    const filtering = filter.trim() !== '';
    if (filtering && !wasFiltering) idleOpen = true;
    wasFiltering = filtering;
  });

  function partNext(p: InventoryPart): string {
    return p.next.kind === 'done'
      ? t('inventory.partDone')
      : p.next.kind === 'craft'
        ? t('inventory.partCraft')
        : t('inventory.partToGo', { n: p.next.n });
  }

  onMount(() => {
    api
      .getGoals()
      .then((d) => (data = d))
      .catch(() => (loadFailed = true));
  });
</script>

{#snippet partAmounts(p: {
  key: string;
  name: string;
  twoStep: boolean;
  blueprints: number;
  crafted: number;
})}
  <span class="amounts">
    {#if p.twoStep}
      <span class="amount">
        <span class="amount-label">{t('part.blueprints')}</span>
        <AmountField
          compact
          max={PART_MAX}
          value={p.blueprints}
          label={t('part.amountLabel', { what: t('part.blueprints'), name: p.name })}
          onSave={(blueprints) => setPart(p.key, { blueprints })}
        />
      </span>
      <span class="amount">
        <span class="amount-label">{t('part.crafted')}</span>
        <AmountField
          compact
          max={PART_MAX}
          value={p.crafted}
          label={t('part.amountLabel', { what: t('part.crafted'), name: p.name })}
          onSave={(crafted) => setPart(p.key, { crafted })}
        />
      </span>
    {:else}
      <span class="amount">
        <span class="amount-label">{t('part.have')}</span>
        <AmountField
          compact
          max={PART_MAX}
          value={p.crafted}
          label={t('part.amountLabel', { what: t('part.have'), name: p.name })}
          onSave={(crafted) => setPart(p.key, { crafted })}
        />
      </span>
    {/if}
  </span>
{/snippet}

<div class="inventory">
  <div class="top">
    <h2 bind:this={titleEl} tabindex="-1">{t('inventory.title')}</h2>
    {#if data && !empty}
      <input
        type="search"
        class="filter"
        bind:value={filter}
        placeholder={t('inventory.filterPlaceholder')}
        aria-label={t('inventory.filterLabel')}
        autocomplete="off"
        spellcheck="false"
      />
    {/if}
  </div>

  {#if error}<p class="alert frame" role="alert">{error}</p>{/if}

  {#if data && view}
    {#if empty}
      <p class="muted">
        {t('inventory.empty')} <a href={hrefFor('goals')}>{t('inventory.emptyLink')}</a>
      </p>
    {:else}
      <p class="muted hint">{t('farm.entryHint')}</p>
      <!-- Always in the page (never display: none), so the no-match line is announced. -->
      <p class="status" role="status">
        {noMatch ? t('inventory.noMatch', { query: filter.trim() }) : ''}
      </p>

      {#if view.resources.length > 0}
        <section class="panel frame accent" aria-labelledby="inv-resources">
          <h3 id="inv-resources">{t('inventory.resources')}</h3>
          <ul class="rows">
            {#each view.resources as r (r.key)}
              <li class="row">
                <div class="what">
                  <span class="lead">{r.name}</span>
                  <span class="for"
                    >{t('farm.for', { goal: joinNames(r.goals.map((g) => g.name)) })}</span
                  >
                </div>
                <span class="amount res">
                  <span class="amount-label">{t('farm.have')}</span>
                  <AmountField
                    value={r.have}
                    label={t('farm.haveLabel', { name: r.name })}
                    onSave={(amount) => setResource(r.key, amount)}
                  />
                  <span class="num of">{t('inventory.of', { needed: formatAmount(r.needed) })}</span
                  >
                </span>
                <span class="state num" class:enough={r.missing === 0}>
                  {r.missing === 0
                    ? t('inventory.enough')
                    : t('inventory.short', { short: formatAmount(r.missing) })}
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if view.parts.length > 0}
        <section class="panel frame" aria-labelledby="inv-parts">
          <h3 id="inv-parts">{t('inventory.parts')}</h3>
          {#each view.parts as g (g.goalId)}
            <h4 class="goal">{g.goalName}</h4>
            <ul class="rows">
              {#each g.rows as p (p.key)}
                <li class="row part">
                  <span class="lead" class:done={p.done}>
                    {p.name}{#if p.count > 1}
                      <span class="num times">{t('inventory.times', { count: p.count })}</span>{/if}
                  </span>
                  {@render partAmounts(p)}
                  <span class="state" class:enough={p.done}>{partNext(p)}</span>
                </li>
              {/each}
            </ul>
          {/each}
        </section>
      {/if}

      {#if idleCount > 0}
        <details class="idle" bind:open={idleOpen}>
          <summary bind:this={idleSummary}>{t('inventory.idle', { count: idleCount })}</summary>
          <p class="muted hint">{t('inventory.idleHint')}</p>
          <ul class="rows">
            {#each view.idleResources as r (r.key)}
              <li class="row">
                <span class="lead">{r.name}</span>
                <span class="amount">
                  <span class="amount-label">{t('farm.have')}</span>
                  <AmountField
                    value={r.amount}
                    label={t('farm.haveLabel', { name: r.name })}
                    onSave={(amount) => setResource(r.key, amount)}
                  />
                </span>
              </li>
            {/each}
            {#each view.idleParts as p (p.key)}
              <li class="row part">
                <span class="lead">{p.name}</span>
                {@render partAmounts({ ...p, twoStep: p.craftable })}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    {/if}
  {:else if loadFailed}
    <p class="alert frame" role="alert">{t('goals.loadError')}</p>
  {:else}
    <p class="muted" aria-live="polite">{t('inventory.loading')}</p>
  {/if}
</div>

<style>
  .inventory {
    max-width: 60rem;
    display: grid;
    gap: 0.8rem;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem 1.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.2;
    color: var(--gold);
  }

  .filter {
    flex: 0 1 22rem;
    min-width: 0;
  }

  .muted {
    margin: 0;
    color: var(--muted);
  }

  .status {
    margin: 0;
    color: var(--muted);
  }

  /* Empty: no room taken, but still in the accessibility tree. */
  .status:empty {
    height: 0;
    margin-top: -0.8rem;
  }

  .hint {
    font-size: 0.85rem;
  }

  a {
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  .alert {
    --frame-line: var(--bad);
    margin: 0;
    padding: 0.6rem 0.9rem;
    color: var(--bad);
  }

  .panel {
    padding: 0.95rem 1.15rem 0.9rem;
  }

  h3 {
    margin: 0 0 0.3rem;
    font-size: 1.05rem;
    color: var(--gold);
  }

  .goal {
    margin: 0.7rem 0 0.1rem;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(5.5rem, auto);
    align-items: baseline;
    gap: 0.2rem 1rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .row:last-child {
    border-bottom: 0;
  }

  .what {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.5rem;
    min-width: 0;
  }

  .lead {
    font-weight: 600;
  }

  .done {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent);
  }

  .times {
    font-weight: 400;
    color: var(--muted);
  }

  .for {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .amounts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.9rem;
  }

  .amount {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  /* Resource rows: fixed columns, so every Have field lines up down the list. */
  .amount.res {
    display: grid;
    grid-template-columns: auto auto 6.5rem;
  }

  .state {
    justify-self: end;
    font-size: 0.85rem;
    color: var(--gold);
  }

  .state.enough {
    color: var(--ok);
  }

  .idle summary {
    cursor: pointer;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
  }

  .idle .hint {
    margin: 0.4rem 0 0.2rem;
  }

  .idle .row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  @media (max-width: 36rem) {
    .row,
    .idle .row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .row .amount,
    .row .amounts {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .state {
      grid-column: 2;
      grid-row: 1;
    }
  }
</style>
