<script lang="ts">
  import type { WeaponListItem, WeaponSlot, WeaponTab, WeaponsResponse } from '@warframehub/shared';
  import { onMount, tick } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import * as api from '../lib/api.ts';
  import { language, t, tOr } from '../lib/i18n/index.ts';
  import { hrefFor, weaponsHref } from '../lib/route.svelte.ts';
  import { formatDay, formatLocal, formatUtc } from '../lib/time.ts';
  import { setWeaponOrder, weaponListState as s } from '../lib/weapons-state.svelte.ts';
  import {
    TAB_SLOTS,
    WEAPON_SORT_KEYS,
    classesOf,
    filterWeapons,
    groupBySlot,
    isMastered,
    sortWeapons,
    type MasteryFilter,
    type SlotFilter,
    type WeaponSortKey,
  } from '../lib/weapons.ts';

  interface Props {
    /** From the address: `#/weapons` or `#/weapons?tab=arch`. */
    tab: WeaponTab;
  }

  let { tab }: Props = $props();

  let data = $state<WeaponsResponse | null>(null);
  let loadError = $state<string | null>(null);
  let refreshError = $state<string | null>(null);
  let favoriteError = $state<string | null>(null);
  let refreshing = $state(false);
  let now = $state(Date.now());

  const inTab = $derived(data ? data.weapons.filter((w) => w.tab === tab) : []);
  const slot = $derived(s.slot[tab]);
  const inSlot = $derived(slot === 'all' ? inTab : inTab.filter((w) => w.slot === slot));
  // Classes of what the slot shows, by their label in the current language.
  const classes = $derived(
    classesOf(inSlot)
      .map((c) => ({ value: c, label: tOr(`wp.class.${c}`, c) }))
      .sort((a, b) => a.label.localeCompare(b.label, language.current)),
  );
  // A class that the slot no longer has (picked under another slot) counts as "any".
  const cls = $derived(classes.some((c) => c.value === s.cls[tab]) ? s.cls[tab] : '');
  // Mastery comes from the imported profile: without one, the filter isn't offered.
  const hasProfile = $derived(data?.masteryRank != null);
  const mastery = $derived<MasteryFilter>(hasProfile ? s.mastery : 'all');
  const shown = $derived(
    data
      ? sortWeapons(
          filterWeapons(data.weapons, {
            tab,
            slot,
            cls,
            mastery,
            incarnonOnly: s.incarnonOnly,
            query: s.query,
          }),
          s.sortKey,
          s.sortDir,
          language.current,
        )
      : [],
  );
  const groups = $derived(groupBySlot(shown, tab));
  // On a phone the class, mastery, Incarnon and sort controls fold into one "Filters" row.
  let filtersOpen = $state(false);
  const activeFilters = $derived(
    (cls !== '' ? 1 : 0) +
      (mastery !== 'all' ? 1 : 0) +
      (tab === 'weapons' && s.incarnonOnly ? 1 : 0),
  );
  const filtered = $derived(s.query.trim() !== '' || activeFilters > 0);
  const orderText = $derived(t(`wp.order.${s.sortKey}.${s.sortDir}`));
  const locked = $derived(data?.nextRefreshAt != null && Date.parse(data.nextRefreshAt) > now);

  const slotOptions = $derived<{ value: SlotFilter; label: string }[]>([
    { value: 'all', label: t('wp.slot.all') },
    ...TAB_SLOTS[tab].map((x) => ({ value: x as SlotFilter, label: t(`wp.slot.${x}`) })),
  ]);
  const masteryOptions = $derived<{ value: MasteryFilter; label: string }[]>([
    { value: 'all', label: t('wp.mastery.all') },
    { value: 'not', label: t('wp.mastery.not') },
    { value: 'yes', label: t('wp.mastery.yes') },
  ]);

  function clearFilters() {
    s.query = '';
    s.cls[tab] = '';
    s.mastery = 'all';
    s.incarnonOnly = false;
  }

  /** Stars or unstars at once, and puts it back if the server says no. */
  async function toggleFavorite(slug: string, favorite: boolean) {
    if (!data) return;
    favoriteError = null;
    const mark = (value: boolean) => {
      if (data) {
        data = {
          ...data,
          weapons: data.weapons.map((w) => (w.slug === slug ? { ...w, favorite: value } : w)),
        };
      }
    };
    mark(favorite);
    try {
      await api.setWeaponFavorite(slug, favorite);
    } catch (e) {
      mark(!favorite);
      favoriteError = t('wf.favoriteError', {
        message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
      });
    }
  }

  function load() {
    loadError = null;
    api
      .getWeapons()
      .then(async (d) => {
        data = d;
        // Back from a weapon's page: focus (and scroll to) the tile you opened.
        if (s.lastSlug) {
          await tick();
          document
            .querySelector<HTMLAnchorElement>(`a[href="${hrefFor('weapons', s.lastSlug)}"]`)
            ?.focus();
        }
      })
      .catch((e: unknown) => {
        loadError = t('wp.loadError', {
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
      data = await api.refreshWeapons();
    } catch (e) {
      refreshError = e instanceof api.ApiCallError ? e.message : t('goals.unreachable');
    } finally {
      refreshing = false;
      now = Date.now();
    }
  }

  /** "MR 8", gold when it's above your Mastery Rank (only known with a profile). */
  const aboveMine = (w: WeaponListItem) =>
    data?.masteryRank != null && w.masteryReq != null && w.masteryReq > data.masteryRank;

  const kindsOf = (w: WeaponListItem) =>
    w.variants.map((v) => v.kind).filter((k) => k !== 'normal');

  onMount(() => {
    load();
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });
</script>

<div class="weapons">
  <div class="top">
    <h2>{t('wp.title')}</h2>
    {#if data}
      <input
        type="search"
        class="filter"
        bind:value={s.query}
        placeholder={t('wp.filterLabel')}
        aria-label={t('wp.filterLabel')}
        autocomplete="off"
        spellcheck="false"
      />
    {/if}
  </div>

  <!-- Two lists of one section: links, so each tab has its address. -->
  <nav class="page-tabs" aria-label={t('wp.tabs')}>
    {#each ['weapons', 'arch'] as const as x (x)}
      <a href={weaponsHref(x)} aria-current={tab === x ? 'page' : undefined}
        >{t(`wp.tab.${x}`)}{#if data}<span class="count num"
            >{data.weapons.filter((w) => w.tab === x).length}</span
          >{/if}</a
      >
    {/each}
  </nav>

  {#if data}
    <p class="meta">
      {#if data.stale}
        <span class="stale">{t('wf.stale', { date: formatDay(data.fetchedAt) })}</span>
      {:else}
        <span>{t('wf.updated', { date: formatDay(data.fetchedAt) })}</span>
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
    {#if tab === 'arch'}<p class="note">{t('wp.archNote')}</p>{/if}
    {#if refreshError}<p class="error" role="alert">{refreshError}</p>{/if}
    {#if favoriteError}<p class="error" role="alert">{favoriteError}</p>{/if}

    <div class="filters">
      <Segmented
        legend={t('wp.slotLabel')}
        name="wp-slot-{tab}"
        options={slotOptions}
        value={slot}
        onchange={(v) => (s.slot[tab] = v)}
      />
      <!-- Phones only: the rest of the controls fold under this row. -->
      <button
        type="button"
        class="fold"
        aria-expanded={filtersOpen}
        aria-controls="wp-more"
        onclick={() => (filtersOpen = !filtersOpen)}
      >
        <span class="chev" class:open={filtersOpen}><Icon name="chevron" size={12} /></span>
        {activeFilters > 0 ? t('wp.filtersOn', { n: activeFilters }) : t('wp.filters')}
      </button>
    </div>

    <div class="more" class:open={filtersOpen} id="wp-more">
      <div class="filters">
        {#if classes.length > 0}
          <label class="field">
            <span>{t('wp.classLabel')}</span>
            <select value={cls} onchange={(e) => (s.cls[tab] = e.currentTarget.value)}>
              <option value="">{t('wp.classAny')}</option>
              {#each classes as c (c.value)}
                <option value={c.value}>{c.label}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if hasProfile}
          <Segmented
            legend={t('wp.masteryLabel')}
            name="wp-mastery"
            options={masteryOptions}
            value={mastery}
            onchange={(v) => (s.mastery = v)}
          />
        {:else}
          <a class="profile-hint" href={hrefFor('profile')}>{t('wp.masteryNeedsProfile')}</a>
        {/if}
        {#if tab === 'weapons'}
          <label class="check">
            <input type="checkbox" bind:checked={s.incarnonOnly} />
            {t('wp.incarnonOnly')}
          </label>
        {/if}
      </div>

      <div class="sorter">
        <label class="field">
          <span>{t('wf.sortLabel')}</span>
          <select
            value={s.sortKey}
            onchange={(e) => setWeaponOrder(e.currentTarget.value as WeaponSortKey, 'asc')}
          >
            {#each WEAPON_SORT_KEYS as key (key)}
              <option value={key}>{t(`wp.sort.${key}`)}</option>
            {/each}
          </select>
        </label>
        <button
          type="button"
          class="order"
          aria-label={t('wf.orderAria', { current: orderText })}
          onclick={() => setWeaponOrder(s.sortKey, s.sortDir === 'asc' ? 'desc' : 'asc')}
        >
          <span class="arrow" class:flip={s.sortDir === 'desc'}><Icon name="down" size={14} /></span
          >
          {orderText}
        </button>
      </div>
    </div>

    <!-- Always in the page, so "no match" is announced. -->
    <p class="status" role="status">{shown.length === 0 ? t('wp.noMatch') : ''}</p>
    {#if shown.length === 0 && filtered}
      <button type="button" class="clear" onclick={clearFilters}>{t('wp.clearFilters')}</button>
    {/if}

    {#each groups as g (g.slot)}
      {@const headingId = `wp-group-${g.slot}`}
      <section class="group" aria-labelledby={headingId}>
        <h3 id={headingId}>
          {t(`wp.slot.${g.slot as WeaponSlot}`)}<span class="num">{g.items.length}</span>
        </h3>
        <ul class="grid">
          {#each g.items as w (w.slug)}
            <li>
              <button
                type="button"
                class="star"
                class:on={w.favorite}
                aria-pressed={w.favorite}
                aria-label={t('wf.favoriteAria', { name: w.name })}
                onclick={() => toggleFavorite(w.slug, !w.favorite)}
              >
                <Icon name="star" size={16} filled={w.favorite} />
              </button>
              <a class="tile" href={hrefFor('weapons', w.slug)} onclick={() => (s.lastTab = tab)}>
                <span class="picture">
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
                <span class="line">
                  {#if w.masteryReq !== null}
                    <span
                      class="mr num"
                      class:above={aboveMine(w)}
                      title={aboveMine(w)
                        ? t('wp.mrAbove', { n: w.masteryReq, mine: data.masteryRank ?? 0 })
                        : undefined}>{t('wf.mr', { n: w.masteryReq })}</span
                    >
                  {/if}
                </span>
                <span class="badges">
                  {#if w.incarnon}<span class="badge teal">{t('wp.incarnon')}</span>{/if}
                  {#each kindsOf(w) as k (k)}<span class="badge" class:gold={k === 'prime'}
                      >{t(`wp.kind.${k}`)}</span
                    >{/each}
                  <!-- Only when every version is mastered; the page says which ones are. -->
                  {#if isMastered(w)}<span class="badge ok">{t('wp.mastered')}</span>{/if}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {:else if loadError}
    <div class="alert frame" role="alert">
      <p>{loadError}</p>
      <button type="button" onclick={load}>{t('wf.retry')}</button>
    </div>
  {:else}
    <p class="meta" aria-live="polite">{t('wp.loading')}</p>
  {/if}
</div>

<style>
  .weapons {
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

  /* The two lists, like the Warframe page's Overview | Builds tabs. */
  .page-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1.6rem;
    border-bottom: 1px solid var(--line);
  }

  .page-tabs a {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: -1px;
    padding: 0.35rem 0.1rem 0.5rem;
    border-bottom: 2px solid transparent;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.2rem;
    letter-spacing: 0.04em;
    color: var(--muted);
    text-decoration: none;
  }

  .page-tabs a:hover {
    color: var(--fg);
  }

  .page-tabs a[aria-current='page'] {
    color: var(--gold);
    border-bottom-color: var(--gold);
  }

  .page-tabs .count {
    font-family: var(--font-body);
    font-size: 0.8rem;
    min-width: 1.4rem;
    padding: 0 0.35rem;
    border: 1px solid currentColor;
    text-align: center;
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

  .note {
    margin: 0;
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

  .filters,
  .sorter {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1.4rem;
  }

  .field {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .field span {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.9rem;
  }

  .more {
    display: grid;
    gap: 0.8rem;
  }

  .profile-hint {
    font-size: 0.85rem;
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  /* The "Filters" row exists only on phones (see the media query below). */
  .fold {
    display: none;
    align-items: center;
    gap: 0.45rem;
  }

  .chev {
    display: inline-flex;
    transition: transform 120ms ease-out;
  }

  .chev.open {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }

  /* Fingers need more than the console's dense controls. */
  @media (pointer: coarse) {
    .fold,
    .order,
    select,
    .check,
    .link {
      min-height: 2.75rem;
    }
  }

  .order {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* The arrow points down for the natural order and flips for the reverse. */
  .arrow {
    display: inline-flex;
  }

  .arrow.flip {
    transform: scaleY(-1);
  }

  .status {
    margin: 0;
    color: var(--muted);
  }

  .status:empty {
    height: 0;
    margin-top: -0.8rem;
  }

  .clear {
    justify-self: start;
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

  .group {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }

  /* A slot's block: a Label heading with its count, then its tiles. */
  .group h3 {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .group h3 .num {
    font-family: var(--font-body);
    font-weight: 400;
    letter-spacing: 0;
    color: var(--muted);
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.6rem;
  }

  .grid li {
    position: relative;
  }

  /* On the picture's top-left corner: the tile's cut corner is on the right. */
  .star {
    position: absolute;
    z-index: 1;
    top: 0.5rem;
    left: 0.5rem;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    color: var(--muted);
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    border: 0;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }

  .star:hover {
    color: var(--gold);
    background: var(--surface);
  }

  .star.on {
    color: var(--gold);
  }

  /* After the base rule, so it wins: a full-size target for fingers. */
  @media (pointer: coarse) {
    .star {
      width: 2.75rem;
      height: 2.75rem;
    }
  }

  .tile {
    display: grid;
    align-content: start;
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

  /* The whole weapon: DE draws it diagonally on a square, so nothing is cropped. */
  .picture {
    display: block;
    aspect-ratio: 1;
    background: var(--surface-2);
    overflow: hidden;
  }

  .picture img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .name {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.04em;
    overflow-wrap: break-word;
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.2rem 0.5rem;
    min-height: 1.1rem;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .mr.above {
    color: var(--gold);
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    min-height: 1.05rem;
  }

  @media (max-width: 36rem) {
    .fold {
      display: inline-flex;
    }

    .more:not(.open) {
      display: none;
    }

    .page-tabs a {
      font-size: 1.05rem;
    }

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
