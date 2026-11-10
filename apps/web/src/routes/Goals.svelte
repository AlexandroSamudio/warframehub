<script lang="ts">
  import type { GoalsResponse } from '@warframehub/shared';
  import { onMount, tick } from 'svelte';
  import FarmQueue from '../components/FarmQueue.svelte';
  import GoalCard from '../components/GoalCard.svelte';
  import GoalSearch from '../components/GoalSearch.svelte';
  import * as api from '../lib/api.ts';
  import { farmQueue } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
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
   * Ticking a part removes its row from "What to farm next" above, which would pull the
   * page up under the pointer. Keep the control that was used where it was on screen.
   */
  async function changePart(id: number, key: string, owned: number) {
    const el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const anchorId = el?.id;
    const before = el?.getBoundingClientRect().top;
    await run(() => api.setPartOwned(id, key, owned));
    await tick();
    const after = anchorId ? document.getElementById(anchorId) : null;
    if (after && before !== undefined) {
      window.scrollBy({ top: after.getBoundingClientRect().top - before, behavior: 'instant' });
      after.focus({ preventScroll: true });
    }
  }

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
  });
</script>

<div class="goals">
  <div class="top">
    <h2>{t('goals.title')}</h2>
    <GoalSearch active={activeNames} onAdd={(u) => run(() => api.addGoal(u))} />
  </div>

  {#if error}<p class="alert frame" role="alert">{error}</p>{/if}

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
              onPart={changePart}
              onNote={(id, key, note) => run(() => api.setPartNote(id, key, note))}
              onStock={(key, amount) => run(() => api.setStock(key, amount))}
              onBuilt={(id) => run(() => api.markBuilt(id))}
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
