<script lang="ts">
  import type { WarframesResponse } from '@warframehub/shared';
  import { onMount, tick } from 'svelte';
  import { listState } from '../lib/warframes-state.svelte.ts';
  import * as api from '../lib/api.ts';
  import { t } from '../lib/i18n/index.ts';
  import { hrefFor } from '../lib/route.svelte.ts';
  import { formatDay, formatLocal, formatUtc } from '../lib/time.ts';
  import { filterWarframes } from '../lib/warframes.ts';

  let data = $state<WarframesResponse | null>(null);
  let loadError = $state<string | null>(null);
  let refreshError = $state<string | null>(null);
  let refreshing = $state(false);
  // The filter lives outside this screen, so it's still there when you come back.
  const filter = $derived(listState.filter);
  let now = $state(Date.now());

  const shown = $derived(data ? filterWarframes(data.warframes, filter) : []);
  const locked = $derived(data?.nextRefreshAt != null && Date.parse(data.nextRefreshAt) > now);
  const dateOf = (iso: string) => formatDay(iso);

  function load() {
    loadError = null;
    api
      .getWarframes()
      .then(async (d) => {
        data = d;
        // Back from a Warframe's page: focus (and scroll to) the tile you opened.
        if (listState.lastSlug) {
          await tick();
          document
            .querySelector<HTMLAnchorElement>(
              `a[href="${hrefFor('warframes', listState.lastSlug)}"]`,
            )
            ?.focus();
        }
      })
      .catch((e: unknown) => {
        loadError = t('wf.loadError', {
          message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
        });
      });
  }

  // The first load counts as a fetch, so Refresh starts locked; say why only when pressed.
  let askedWhileLocked = $state(false);

  async function refresh() {
    if (locked) askedWhileLocked = true;
    if (refreshing || locked) return;
    refreshing = true;
    refreshError = null;
    try {
      data = await api.refreshWarframes();
    } catch (e) {
      refreshError = e instanceof api.ApiCallError ? e.message : t('goals.unreachable');
    } finally {
      refreshing = false;
      now = Date.now();
    }
  }

  onMount(() => {
    load();
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });
</script>

<div class="warframes">
  <div class="top">
    <h2>{t('wf.title')}</h2>
    {#if data}
      <input
        type="search"
        class="filter"
        bind:value={listState.filter}
        placeholder={t('wf.filterLabel')}
        aria-label={t('wf.filterLabel')}
        autocomplete="off"
        spellcheck="false"
      />
    {/if}
  </div>

  {#if data}
    <p class="meta">
      <span class="num">{t('wf.count', { count: data.warframes.length })}</span>
      <span aria-hidden="true">·</span>
      {#if data.stale}
        <span class="stale">{t('wf.stale', { date: dateOf(data.fetchedAt) })}</span>
      {:else}
        <span>{t('wf.updated', { date: dateOf(data.fetchedAt) })}</span>
      {/if}
      <button type="button" class="link" aria-disabled={refreshing || locked} onclick={refresh}>
        {refreshing ? t('wf.refreshing') : t('wf.refresh')}
      </button>
      <span class="hint" role="status"
        >{askedWhileLocked && locked && data.nextRefreshAt
          ? t('wf.refreshLocked', {
              local: formatLocal(data.nextRefreshAt),
              utc: formatUtc(data.nextRefreshAt),
            })
          : ''}</span
      >
    </p>
    {#if refreshError}<p class="error" role="alert">{refreshError}</p>{/if}

    <!-- Always in the page, so "no match" is announced. -->
    <p class="status" role="status">
      {shown.length === 0 && filter.trim() !== '' ? t('wf.noMatch', { query: filter.trim() }) : ''}
    </p>

    <ul class="grid">
      {#each shown as w (w.slug)}
        <li>
          <a class="tile" href={hrefFor('warframes', w.slug)}>
            <span class="portrait">
              {#if w.image}
                <img
                  src={api.imageUrl(w.image)}
                  alt=""
                  width="144"
                  height="144"
                  loading="lazy"
                  decoding="async"
                />
              {/if}
            </span>
            <span class="name">{w.name}</span>
            <span class="badges">
              {#if w.variants.some((v) => v.kind === 'prime')}<span class="badge gold"
                  >{t('wf.prime')}</span
                >{/if}
              {#if w.variants.some((v) => v.kind === 'umbra')}<span class="badge"
                  >{t('wf.umbra')}</span
                >{/if}
              <!-- Only when every version is mastered; the page says which ones are. -->
              {#if w.variants.every((v) => v.mastered)}<span class="badge ok"
                  >{t('wf.mastered')}</span
                >{/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {:else if loadError}
    <div class="alert frame" role="alert">
      <p>{loadError}</p>
      <button type="button" onclick={load}>{t('wf.retry')}</button>
    </div>
  {:else}
    <p class="meta" aria-live="polite">{t('wf.loading')}</p>
  {/if}
</div>

<style>
  .warframes {
    max-width: 72rem;
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

  .meta {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.5rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .stale {
    color: var(--gold);
  }

  .hint {
    flex-basis: 100%;
    font-size: 0.8rem;
  }

  .hint:empty {
    display: contents;
  }

  /* Refresh reads as a small text action next to the date, not a primary button. */
  .link {
    padding: 0.15rem 0.3rem;
    border: 0;
    background: none;
    font: inherit;
    font-size: 0.85rem;
    text-transform: none;
    letter-spacing: 0;
    color: var(--teal);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .link:hover:not([aria-disabled='true']) {
    background: none;
    color: var(--fg);
  }

  .link[aria-disabled='true'] {
    opacity: 0.45;
    cursor: default;
  }

  .error {
    margin: 0;
    color: var(--bad);
  }

  .status {
    margin: 0;
    color: var(--muted);
  }

  .status:empty {
    height: 0;
    margin-top: -0.8rem;
  }

  .alert {
    --frame-line: var(--bad);
    margin: 0;
    padding: 0.7rem 0.9rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    color: var(--bad);
  }

  .alert p {
    margin: 0;
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.6rem;
  }

  .tile {
    display: grid;
    gap: 0.35rem;
    padding: 0.5rem 0.5rem 0.6rem;
    height: 100%;
    box-sizing: border-box;
    text-decoration: none;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--line);
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%);
  }

  .tile:hover {
    border-color: var(--gold);
  }

  /* clip-path would cut an outside focus ring off: draw it inside the tile. */
  .tile:focus-visible {
    outline-offset: -3px;
  }

  .tile:hover .name {
    color: var(--gold);
  }

  /* Square crop from the top of the portrait: the head and shoulders read best small. */
  .portrait {
    display: block;
    aspect-ratio: 1;
    background: var(--surface-2);
    overflow: hidden;
  }

  .portrait img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
  }

  .name {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    min-height: 1.05rem;
  }

  @media (max-width: 36rem) {
    .grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.4rem;
    }

    .tile {
      padding: 0.35rem 0.35rem 0.45rem;
    }

    .name {
      font-size: 0.85rem;
    }
  }
</style>
