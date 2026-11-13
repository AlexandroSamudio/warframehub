<script lang="ts">
  import type { BuildView } from '@warframehub/shared';
  import * as api from '../lib/api.ts';
  import { formatSaved, rememberedTab, rememberTab, sourceHost } from '../lib/builds.ts';
  import { t } from '../lib/i18n/index.ts';
  import { shift } from '../lib/reorder.ts';
  import { buildHref } from '../lib/route.svelte.ts';
  import Guide from './Guide.svelte';
  import Icon from './Icon.svelte';
  import ModTile from './ModTile.svelte';
  import { tick } from 'svelte';

  interface Props {
    slug: string;
    /** The version that owns the builds ("Mesa Prime"). */
    owner: string;
    /** The version on screen owns them; otherwise only a pointer to it is shown. */
    isOwner: boolean;
    builds: BuildView[];
    /** Abilities of the owning version, for "Replaces Ballistic Battery". */
    abilityNames: Map<number, string>;
    onShowOwner: () => void;
    /** The builds in their new order, after ↑/↓. */
    onReordered: (builds: BuildView[]) => void;
  }

  let { slug, owner, isOwner, builds, abilityNames, onShowOwner, onReordered }: Props = $props();

  let chosen = $state<number | null>(null);
  let moveError = $state<string | null>(null);
  let moving = $state(false);
  const tabEls: Record<number, HTMLButtonElement | undefined> = {};

  // The remembered build when it still exists, else the first.
  const selected = $derived(
    builds.find((b) => b.id === (chosen ?? rememberedTab(slug))) ?? builds[0] ?? null,
  );

  function choose(id: number) {
    chosen = id;
    rememberTab(slug, id);
  }

  /** Arrow keys, Home and End move between tabs (the ARIA tabs pattern). */
  async function onTabKey(event: KeyboardEvent, index: number) {
    const last = builds.length - 1;
    const to =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (to === null) return;
    event.preventDefault();
    const target = builds[to]!;
    choose(target.id);
    await tick();
    tabEls[target.id]?.focus();
  }

  async function move(by: -1 | 1, event: MouseEvent) {
    if (!selected || moving) return;
    const button = event.currentTarget as HTMLButtonElement;
    const ids = shift(
      builds.map((b) => b.id),
      selected.id,
      by,
    );
    if (!ids) return;
    moving = true;
    moveError = null;
    try {
      await api.reorderBuilds(slug, ids);
      onReordered(ids.map((id) => builds.find((b) => b.id === id)!));
      await tick();
      // At the new end the button disables itself: keep focus on its partner.
      const pair = button.parentElement?.querySelectorAll('button');
      const next = button.disabled ? [...(pair ?? [])].find((b) => !b.disabled) : button;
      next?.focus();
    } catch (e) {
      moveError = t('build.moveError', {
        message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
      });
    } finally {
      moving = false;
    }
  }

  const index = $derived(selected ? builds.findIndex((b) => b.id === selected.id) : -1);
  const c = $derived(selected?.content);
  const hasGuide = $derived((c?.guide.trim() ?? '') !== '');
  const guideHasHeading = $derived(/^#{1,3}\s/.test(c?.guide.trim() ?? ''));
  let guideEl = $state<HTMLHeadingElement | null>(null);

  /** "How to play" at the top: the guide is last, under the setup. */
  function toGuide() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    guideEl?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    guideEl?.focus({ preventScroll: true });
  }
</script>

<section class="builds frame accent" aria-labelledby="wf-builds">
  <div class="top">
    <h3 id="wf-builds">{t('build.title')}</h3>
    {#if isOwner}
      <a class="add" href={buildHref(slug)}
        ><Icon name="plus" size={14} /><span>{t('build.add')}</span></a
      >
    {/if}
  </div>

  {#if !isOwner}
    <p class="hint">
      {t('build.elsewhere', { name: owner })}
      <button type="button" class="link" onclick={onShowOwner}
        >{t('build.showVariant', { name: owner })}</button
      >
    </p>
  {:else if builds.length === 0 || !selected}
    <p class="hint">{t('build.none')}</p>
  {:else}
    <div class="bar">
      <div class="tabs" role="tablist" aria-label={t('build.tabs', { name: owner })}>
        {#each builds as b, i (b.id)}
          <button
            type="button"
            role="tab"
            id="build-tab-{b.id}"
            aria-controls="build-panel"
            aria-selected={b.id === selected.id}
            tabindex={b.id === selected.id ? 0 : -1}
            class:on={b.id === selected.id}
            bind:this={tabEls[b.id]}
            onclick={() => choose(b.id)}
            onkeydown={(e) => onTabKey(e, i)}>{b.name}</button
          >
        {/each}
      </div>
      {#if builds.length > 1}
        <!-- Moves the selected tab: arrows that point the way the tabs run. -->
        <div class="order">
          <button
            type="button"
            class="icon"
            disabled={index <= 0 || moving}
            title={t('build.moveLeftHint')}
            aria-label={t('build.moveEarlier', { name: selected.name })}
            onclick={(e) => move(-1, e)}
            ><span class="flip"><Icon name="chevron" size={14} /></span></button
          >
          <button
            type="button"
            class="icon"
            disabled={index >= builds.length - 1 || moving}
            title={t('build.moveRightHint')}
            aria-label={t('build.moveLater', { name: selected.name })}
            onclick={(e) => move(1, e)}><Icon name="chevron" size={14} /></button
          >
        </div>
      {/if}
    </div>
    {#if moveError}<p class="error" role="alert">{moveError}</p>{/if}

    {#if c}
      <div
        class="panel"
        role="tabpanel"
        id="build-panel"
        aria-labelledby="build-tab-{selected.id}"
        tabindex="-1"
      >
        <div class="source">
          <p class="meta">
            {#if c.author}<span>{t('build.from', { author: c.author })}</span>{/if}
            {#if c.patch}<span>{c.patch}</span>{/if}
            <span>{t('build.saved', { date: formatSaved(selected.createdAt) })}</span>
            {#if c.sourceUrl}
              <span
                ><a href={c.sourceUrl} target="_blank" rel="noopener noreferrer"
                  >{sourceHost(c.sourceUrl)}<span class="sr-only"> {t('part.opensNewTab')}</span></a
                ></span
              >
            {/if}
          </p>
          <span class="actions">
            {#if hasGuide}
              <button type="button" class="link" onclick={toGuide}>{t('build.jumpGuide')}</button>
            {/if}
            <a class="edit" href={buildHref(slug, selected.id)}
              >{t('build.edit')}<span class="sr-only"> {selected.name}</span></a
            >
          </span>
        </div>

        <h4 class="group">{t('build.mods')}</h4>
        <ul class="grid special">
          <ModTile slot={selected.aura} label={t('build.aura')} />
          <ModTile slot={selected.exilus} label={t('build.exilus')} />
        </ul>
        <ul class="grid">
          {#each selected.slots as s, i (i)}
            <ModTile slot={s} />
          {/each}
        </ul>

        {#if selected.arcanes.some((a) => a)}
          <h4 class="group">{t('build.arcanes')}</h4>
          <ul class="grid special">
            {#each selected.arcanes.filter((a) => a !== null) as a (a.uniqueName)}
              <ModTile slot={a} />
            {/each}
          </ul>
        {/if}

        {#if selected.shards.length > 0}
          <h4 class="group">{t('build.shards')}</h4>
          <ul class="rows">
            {#each selected.shards as s, i (i)}
              <li class="shard">
                <span class="gem {s.color}" aria-hidden="true"></span>
                <span class="sr-only">{t(`build.shardColor.${s.color}`)}:</span>
                <span>{s.text}</span>
                {#if s.tauforged}<span class="badge">{t('build.tauforged')}</span>{/if}
                {#if s.note}<span class="row-note">{s.note}</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}

        {#if selected.helminth}
          {@const h = selected.helminth}
          <h4 class="group">{t('build.helminth')}</h4>
          <ul class="rows">
            <li>
              <span class="muted"
                >{t('build.replaces', {
                  ability: abilityNames.get(h.replacesKey) ?? String(h.replacesKey),
                })}</span
              >
              <span class="lead">{h.name}</span>
              {#if h.from && h.from !== 'Helminth'}<span class="muted"
                  >{t('build.fromFrame', { from: h.from })}</span
                >{/if}
              {#if h.page}
                <a href={h.page} target="_blank" rel="noopener noreferrer"
                  >{t('wf.wikiLink')}<span class="sr-only">
                    {t('build.wikiAria', { name: h.name })}
                    {t('part.opensNewTab')}</span
                  ></a
                >
              {/if}
              {#if h.note}<span class="row-note">{h.note}</span>{/if}
            </li>
          </ul>
        {/if}

        {#if c.weapons.length > 0}
          <h4 class="group">{t('build.weapons')}</h4>
          <ul class="rows">
            {#each c.weapons as w (w.uniqueName)}
              <li>
                <span class="lead">{w.name}</span>
                {#if w.note}<span class="row-note">{w.note}</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}

        {#if hasGuide}
          <!-- A guide that opens with its own heading doesn't need the label repeated. -->
          <h4
            class="group"
            class:sr-only={guideHasHeading}
            id="build-guide"
            tabindex="-1"
            bind:this={guideEl}
          >
            {t('build.guide')}
          </h4>
          <div class:spaced={guideHasHeading}><Guide source={c.guide} /></div>
        {/if}
      </div>
    {/if}
  {/if}
</section>

<style>
  .builds {
    padding: 0.95rem 1.15rem 1.1rem;
    display: grid;
    gap: 0.5rem;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--gold);
  }

  a {
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  .add {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .add:hover span {
    text-decoration: underline;
  }

  .hint,
  .error {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .error {
    color: var(--bad);
  }

  button.link {
    font: inherit;
    letter-spacing: normal;
    text-transform: none;
    color: var(--teal);
    border: 0;
    padding: 0.2rem 0;
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  button.link:hover:not(:disabled) {
    background: transparent;
    color: var(--fg);
  }

  /* Tabs: the version switch's segmented look. */
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.6rem;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    min-width: 0;
  }

  /* Build names are the user's own words: sentence case, not the uppercase label style. */
  .tabs button {
    margin: 0 0 -1px -1px;
    padding: 0.3rem 0.8rem;
    font-size: 0.9rem;
    letter-spacing: 0.03em;
    text-transform: none;
    color: var(--muted);
    max-width: 100%;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .tabs button:first-child {
    margin-left: 0;
  }

  .tabs button:not(.on):hover {
    color: var(--fg);
  }

  .tabs button.on {
    position: relative;
    z-index: 1;
    border-color: var(--gold);
    color: var(--gold);
    background: color-mix(in srgb, var(--gold) 12%, transparent);
  }

  .tabs button:focus-visible {
    z-index: 2;
  }

  .order {
    display: flex;
    gap: 0.3rem;
  }

  .order .icon {
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    padding: 0;
  }

  .flip {
    display: inline-flex;
    transform: rotate(180deg);
  }

  .panel {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.3rem;
  }

  .panel:focus-visible {
    outline-offset: 4px;
  }

  .source {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.3rem 1rem;
  }

  .meta {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
  }

  /* "From Test · Update 41 · Saved 13 Nov 2026 · overframe.gg" */
  .meta > span + span::before {
    content: '·' / '';
    margin: 0 0.5em;
  }

  .actions {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 1rem;
    font-size: 0.85rem;
  }

  .edit {
    padding: 0.2rem 0;
  }

  .group {
    margin: 0.7rem 0 0.1rem;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  /* The mod screen: cells on one seam, so the lines between them are the seam colour. */
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
  }

  .grid.special {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .rows li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15rem 0.6rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .rows li:last-child {
    border-bottom: 0;
  }

  .lead {
    font-weight: 600;
  }

  .muted {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .row-note {
    flex-basis: 100%;
    font-size: 0.85rem;
  }

  .shard {
    align-items: center;
  }

  /* An original cut gem: a small diamond in the shard's in-game colour name. */
  .gem {
    width: 0.7rem;
    height: 0.7rem;
    flex: none;
    transform: rotate(45deg);
    background: var(--gem);
  }

  .gem.crimson {
    --gem: var(--shard-crimson);
  }
  .gem.amber {
    --gem: var(--shard-amber);
  }
  .gem.azure {
    --gem: var(--shard-azure);
  }
  .gem.emerald {
    --gem: var(--shard-emerald);
  }
  .gem.topaz {
    --gem: var(--shard-topaz);
  }
  .gem.violet {
    --gem: var(--shard-violet);
  }

  /* Same space above as a section label gets, when the guide brings its own heading. */
  .spaced {
    margin-top: 0.6rem;
  }

  @media (max-width: 48rem) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 24rem) {
    .grid,
    .grid.special {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
