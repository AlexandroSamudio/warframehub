<script lang="ts">
  import type { GoalsResponse } from '@warframehub/shared';
  import { onMount, tick } from 'svelte';
  import FarmQueue from '../components/FarmQueue.svelte';
  import GoalCard from '../components/GoalCard.svelte';
  import GoalSearch from '../components/GoalSearch.svelte';
  import * as api from '../lib/api.ts';
  import { farmQueue } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
  import { formatLocal, formatUtc } from '../lib/time.ts';
  import { shift } from '../lib/reorder.ts';

  let data = $state<GoalsResponse | null>(null);
  let loadFailed = $state(false);
  let error = $state<string | null>(null);

  const queue = $derived(data ? farmQueue(data) : null);
  const activeNames = $derived(new Set(data?.active.map((g) => g.uniqueName) ?? []));

  /**
   * Runs one change; the server answers with every goal, which replaces ours.
   * Resolves true when it was saved. Errors from the API carry our own plain message;
   * anything else means the server can't be reached.
   */
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

  /**
   * Getting or crafting a part moves rows in "What to farm next" above, which would pull
   * the page up under the pointer. Keep the control that was used where it was on screen.
   */
  async function keepPlace(call: () => Promise<GoalsResponse>): Promise<boolean> {
    const el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Anchor on the row (a part row stays mounted even when its Craft button goes away).
    const anchor = el?.closest('li') ?? el;
    const before = anchor?.getBoundingClientRect().top;
    const ok = await run(call);
    await tick();
    if (anchor?.isConnected && before !== undefined) {
      window.scrollBy({ top: anchor.getBoundingClientRect().top - before, behavior: 'instant' });
    }
    if (el?.isConnected) el.focus({ preventScroll: true });
    return ok;
  }

  async function build(goalId: number, useStock: boolean) {
    if (await run(() => api.markBuilt(goalId, useStock))) {
      // The card leaves the list; the Undo button is the natural next step.
      await tick();
      undoButton?.focus();
    }
  }

  // The undo bar hides itself when its 15 minutes are up.
  let now = $state(Date.now());
  const undo = $derived(data?.undo && Date.parse(data.undo.expiresAt) > now ? data.undo : null);
  let undoing = $state(false);
  let undoButton = $state<HTMLButtonElement | null>(null);

  async function undoLast() {
    if (undoing) return;
    undoing = true;
    await run(() => api.undoLast());
    undoing = false;
    // The bar (and its button) goes away: put focus on the page title, not on nothing.
    await tick();
    titleEl?.focus();
  }
  let titleEl = $state<HTMLHeadingElement | null>(null);

  function move(goalId: number, by: -1 | 1) {
    if (!data) return;
    const next = shift(
      data.active.map((g) => g.id),
      goalId,
      by,
    );
    if (next) void run(() => api.reorderGoals(next));
  }

  function builtDate(iso: string | null): string {
    return iso
      ? new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(iso))
      : '';
  }

  onMount(() => {
    api
      .getGoals()
      .then((d) => (data = d))
      .catch(() => (loadFailed = true));
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });
</script>

<div class="goals">
  <div class="top">
    <h2 bind:this={titleEl} tabindex="-1">{t('goals.title')}</h2>
    <GoalSearch active={activeNames} onAdd={(u) => run(() => api.addGoal(u))} />
  </div>

  {#if error}<p class="alert frame" role="alert">{error}</p>{/if}

  <!-- Always in the page, so screen readers announce it when it fills. Sticky, so a
       craft far down the page still shows its Undo. -->
  <div class="undo" class:shown={undo !== null} role="status">
    {#if undo}
      <span
        >{undo.kind === 'craft'
          ? t('undo.crafted', { name: undo.name })
          : t('undo.built', { name: undo.name })}</span
      >
      <button
        type="button"
        class="teal"
        bind:this={undoButton}
        aria-disabled={undoing}
        onclick={undoLast}
      >
        {t('undo.button')}
      </button>
      <span class="hint"
        >{t('undo.hint', {
          time: `${formatLocal(undo.expiresAt)} (${formatUtc(undo.expiresAt)} UTC)`,
        })}</span
      >
    {/if}
  </div>

  {#if data && queue}
    {#if data.active.length === 0}
      <p class="muted">{t('goals.empty')}</p>
    {:else}
      <FarmQueue
        {queue}
        onSetStock={(key, amount) => run(() => api.setStock(key, amount))}
        onNote={(id, key, note) => run(() => api.setPartNote(id, key, note))}
      />

      <ul class="cards">
        {#each data.active as goal, i (goal.id)}
          <li>
            <GoalCard
              {goal}
              isFirst={i === 0}
              isLast={i === data.active.length - 1}
              stock={data.stock}
              onPartStock={(key, amounts) => keepPlace(() => api.setPartStock(key, amounts))}
              onCraft={(key) => keepPlace(() => api.craftPart(key))}
              onNote={(id, key, note) => run(() => api.setPartNote(id, key, note))}
              onStock={(key, amount) => run(() => api.setStock(key, amount))}
              onBuilt={build}
              onRemove={(id) => run(() => api.deleteGoal(id))}
              onRefresh={(id) => run(() => api.refreshGoal(id))}
              onMove={move}
            />
          </li>
        {/each}
      </ul>
    {/if}

    {#if data.built.length > 0}
      <details class="completed">
        <summary>{t('completed.title', { count: data.built.length })}</summary>
        <ul>
          {#each data.built as goal (goal.id)}
            <li>
              <span class="name">{goal.name}</span>
              <span class="when">{t('completed.builtOn', { date: builtDate(goal.builtAt) })}</span>
              <button type="button" onclick={() => run(() => api.reactivateGoal(goal.id))}>
                {t('completed.reactivate')}
              </button>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {:else if loadFailed}
    <p class="alert frame" role="alert">{t('goals.loadError')}</p>
  {:else}
    <p class="muted" aria-live="polite">{t('goals.loading')}</p>
  {/if}
</div>

<style>
  .goals {
    max-width: 60rem;
    display: grid;
    gap: 1rem;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.6rem 1.5rem;
  }

  h2 {
    margin: 0.3rem 0 0;
    font-size: 1.2rem;
    line-height: 1.2;
    color: var(--gold);
  }

  .muted {
    margin: 0;
    color: var(--muted);
  }

  .alert {
    --frame-line: var(--bad);
    margin: 0;
    padding: 0.6rem 0.9rem;
    color: var(--bad);
  }

  /* Empty: visually hidden but still in the accessibility tree (never display: none). */
  .undo {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .undo.shown {
    position: sticky;
    top: 0;
    z-index: 2;
    width: auto;
    height: auto;
    overflow: visible;
    clip-path: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.7rem;
    padding: 0.45rem 0.8rem;
    background: var(--surface);
    border: 1px solid var(--line);
  }

  .undo .hint {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  .completed summary {
    cursor: pointer;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
  }

  .completed ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }

  .completed li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.8rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .completed .name {
    font-weight: 600;
  }

  .completed .when {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .completed button {
    margin-left: auto;
  }
</style>
