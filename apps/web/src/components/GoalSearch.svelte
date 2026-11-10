<script lang="ts">
  import type { ItemSearchResponse } from '@warframehub/shared';
  import { ApiCallError, searchItems } from '../lib/api.ts';
  import { t } from '../lib/i18n/index.ts';
  import { formatCountdown } from '../lib/time.ts';
  import Icon from './Icon.svelte';

  interface Props {
    /** uniqueNames already active, so their Add button shows "Added". */
    active: Set<string>;
    onAdd: (uniqueName: string) => Promise<unknown>;
  }

  let { active, onAdd }: Props = $props();

  const DEBOUNCE_MS = 400;
  let query = $state('');
  let result = $state<ItemSearchResponse | null>(null);
  let searching = $state(false);
  let error = $state<string | null>(null);
  let adding = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const trimmed = $derived(query.trim());

  function onInput() {
    clearTimeout(timer);
    controller?.abort();
    error = null;
    if (trimmed.length < 2) {
      result = null;
      searching = false;
      return;
    }
    searching = true;
    timer = setTimeout(run, DEBOUNCE_MS);
  }

  async function run() {
    controller = new AbortController();
    const signal = controller.signal;
    try {
      const res = await searchItems(trimmed, signal);
      if (!signal.aborted) result = res;
    } catch (e) {
      if (signal.aborted) return;
      result = null;
      error = e instanceof ApiCallError ? e.message : t('goals.loadError');
    } finally {
      if (!signal.aborted) searching = false;
    }
  }

  async function add(uniqueName: string) {
    adding = uniqueName;
    try {
      await onAdd(uniqueName);
    } finally {
      adding = null;
    }
  }

  function age(iso: string): string {
    return formatCountdown(Math.max(0, Date.now() - Date.parse(iso)));
  }
</script>

<div class="search">
  <label class="field">
    <span class="sr-only">{t('goals.searchLabel')}</span>
    <Icon name="search" />
    <input
      type="search"
      bind:value={query}
      oninput={onInput}
      placeholder={t('goals.searchPlaceholder')}
      autocomplete="off"
      spellcheck="false"
      maxlength="80"
    />
  </label>

  <div class="status" aria-live="polite">
    {#if trimmed.length === 1}
      <p class="hint">{t('goals.searchHint')}</p>
    {:else if searching}
      <p class="hint">{t('goals.searching')}</p>
    {:else if error}
      <p class="error" role="alert">{error}</p>
    {:else if result}
      {#if result.stale}<p class="hint warn">
          {t('goals.searchOffline', { age: age(result.fetchedAt) })}
        </p>{/if}
      {#if result.results.length === 0}
        <p class="hint">{t('goals.noResults', { query: trimmed })}</p>
      {/if}
    {/if}
  </div>

  {#if result && result.results.length > 0 && !searching}
    <ul class="results">
      {#each result.results as item (item.uniqueName)}
        {@const isActive = active.has(item.uniqueName)}
        <li>
          <span class="name">{item.name}</span>
          <span class="meta">{t(`goals.category.${item.category}`)}</span>
          {#if item.isPrime}<span class="badge gold">{t('goals.prime')}</span>{/if}
          {#if item.vaulted}<span class="badge">{t('goals.vaulted')}</span>{/if}
          <button
            type="button"
            class="teal add"
            disabled={isActive || adding !== null}
            onclick={() => add(item.uniqueName)}
          >
            {#if !isActive}<Icon name="plus" size={14} />{/if}
            {isActive ? t('goals.added') : t('goals.add')}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* Results hang straight off the field, sharing its border, so they read as one control. */
  .search {
    display: grid;
    width: min(100%, 26rem);
  }

  .status {
    margin-top: 0.35rem;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.5rem;
    background: var(--surface-2);
    border: 1px solid var(--line-strong);
    color: var(--muted);
  }

  .field:focus-within {
    border-color: var(--teal);
    outline: 2px solid var(--teal);
    outline-offset: 0;
  }

  .field input {
    flex: 1;
    border: 0;
    background: transparent;
    padding: 0.4rem 0;
    outline: none;
  }

  .status:empty {
    display: none;
  }

  .hint,
  .error {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .warn {
    color: var(--gold);
  }

  .error {
    color: var(--bad);
  }

  .status:empty + .results {
    margin-top: -1px;
  }

  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--line-strong);
    border-top-color: var(--line);
    background: var(--surface);
  }

  .results li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.6rem;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--line);
  }

  .results li:last-child {
    border-bottom: 0;
  }

  .name {
    font-weight: 600;
  }

  .meta {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .add {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
</style>
