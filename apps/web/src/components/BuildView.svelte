<script lang="ts">
  import { SHARD_SLOTS, type BuildView } from '@warframehub/shared';
  import { formatSaved, sourceHost } from '../lib/builds.ts';
  import { t } from '../lib/i18n/index.ts';
  import { buildHref } from '../lib/route.svelte.ts';
  import Guide from './Guide.svelte';
  import ModCard from './ModCard.svelte';
  import ModPic from './ModPic.svelte';
  import ShardPic from './ShardPic.svelte';
  import { SvelteSet } from 'svelte/reactivity';

  /**
   * One build, open on the Builds page (SPEC §14.1). Two halves of equal weight: **Mods**
   * (with the loadout and weapons beside them on wide screens) and **How to play**, each
   * its own framed section with the same gold title.
   */
  interface Props {
    slug: string;
    build: BuildView;
    /** The owning version's abilities by key, for "replaces Ballistic Battery". */
    abilityNames: Map<number, string>;
  }

  let { slug, build: b, abilityNames }: Props = $props();

  const c = $derived(b.content);
  const arcanes = $derived(b.arcanes.filter((a) => a !== null));
  // The section is already titled "How to play": a guide that opens with that same heading
  // (as many copied guides do) starts with its text instead.
  const guideSource = $derived.by(() => {
    const lines = c.guide.trim().split('\n');
    const first = /^#{1,3}\s+(.*)$/.exec(lines[0] ?? '');
    // Either language: a guide copied from an English or a Spanish source.
    const titles = ['how to play', 'cómo jugarla', 'cómo jugar', t('build.guide').toLowerCase()];
    const same = first && titles.includes(first[1]!.trim().toLowerCase());
    return same ? lines.slice(1).join('\n').trim() : c.guide.trim();
  });
  const hasGuide = $derived(guideSource !== '');
  const hasSide = $derived(
    arcanes.length > 0 || b.shards.length > 0 || b.helminth !== null || b.weapons.length > 0,
  );
  let guideEl = $state<HTMLHeadingElement | null>(null);

  /** Arcanes whose whole effect is shown (they start at two lines). */
  const expanded = new SvelteSet<string>();

  function toggle(uniqueName: string) {
    if (!expanded.delete(uniqueName)) expanded.add(uniqueName);
  }

  /** "How to play" at the top jumps to its section. */
  function toGuide() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    guideEl?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    guideEl?.focus({ preventScroll: true });
  }
</script>

<article class="build" class:with-side={hasSide} aria-labelledby="build-name">
  <header class="top">
    <div class="titles">
      <h3 id="build-name" tabindex="-1">{b.name}</h3>
      <p class="meta">
        {#if c.author}<span>{t('build.from', { author: c.author })}</span>{/if}
        {#if c.patch}<span>{c.patch}</span>{/if}
        <span>{t('build.saved', { date: formatSaved(b.createdAt) })}</span>
        {#if c.sourceUrl}
          <span
            ><a href={c.sourceUrl} target="_blank" rel="noopener noreferrer"
              >{sourceHost(c.sourceUrl)}<span class="sr-only"> {t('part.opensNewTab')}</span></a
            ></span
          >
        {/if}
      </p>
      {#if c.description}<p class="description">{c.description}</p>{/if}
    </div>
    <div class="actions">
      {#if hasGuide}
        <button type="button" class="link" onclick={toGuide}>{t('build.jumpGuide')}</button>
      {/if}
      <a class="btn" href={buildHref(slug, { kind: 'edit', id: b.id })}
        >{t('build.edit')}<span class="sr-only"> {b.name}</span></a
      >
    </div>
  </header>

  <!-- The build's first half: the mods. -->
  <section class="half mods-half frame accent" aria-labelledby="build-mods">
    <h4 class="section-title" id="build-mods">{t('build.mods')}</h4>
    <ul class="mods special">
      <ModCard slot={b.aura} label={t('build.aura')} />
      <ModCard slot={b.exilus} label={t('build.exilus')} />
    </ul>
    <ul class="mods">
      {#each b.slots as s, i (i)}
        <ModCard slot={s} />
      {/each}
    </ul>
  </section>

  {#if hasSide}
    <aside class="loadout" aria-label={t('build.loadout')}>
      {#if arcanes.length > 0}
        <section class="cell">
          <h4 class="group">{t('build.arcanes')}</h4>
          <ul class="rows">
            {#each arcanes as a (a.uniqueName)}
              <li>
                <ModPic image={a.image} size={48} fit="contain" />
                <div class="id">
                  <span class="name"
                    >{a.name}
                    <span class="rank num"
                      >{a.maxRank !== null
                        ? t('build.rankOfShort', { rank: a.rank, max: a.maxRank })
                        : t('build.rank', { rank: a.rank })}</span
                    ></span
                  >
                  <!-- Two lines at rest; the whole effect when pressed (screen readers get it all). -->
                  {#if a.effect}
                    {@const open = expanded.has(a.uniqueName)}
                    <button
                      type="button"
                      class="effect small"
                      class:clamp={!open}
                      aria-expanded={open}
                      onclick={() => toggle(a.uniqueName)}>{a.effect}</button
                    >
                  {/if}
                  {#if a.note}<span class="note">{a.note}</span>{/if}
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if b.shards.length > 0}
        <section class="cell">
          <h4 class="group">{t('build.shards')}</h4>
          <ul class="rows">
            {#each b.shards as s, i (i)}
              <li>
                <ShardPic color={s.color} tauforged={s.tauforged} size={40} />
                <div class="id">
                  <span class="stat">{s.text}</span>
                  <span class="small kind"
                    >{t(`build.shardColor.${s.color}`)}{#if s.tauforged}<span class="tau"
                        >{t('build.tauforged')}</span
                      >{/if}</span
                  >
                  {#if s.note}<span class="note">{s.note}</span>{/if}
                </div>
              </li>
            {/each}
          </ul>
          {#if b.shards.length < SHARD_SLOTS}
            <p class="small sockets-left">
              {t('build.socketsLeft', { n: SHARD_SLOTS - b.shards.length, max: SHARD_SLOTS })}
            </p>
          {/if}
        </section>
      {/if}

      {#if b.helminth}
        {@const h = b.helminth}
        <section class="cell">
          <h4 class="group">{t('build.helminth')}</h4>
          <div class="row">
            <ModPic image={h.image} size={48} fit="contain" />
            <div class="id">
              <span class="name"
                >{h.name}{#if h.from && h.from !== 'Helminth'}<span class="small from"
                    >{t('build.fromFrame', { from: h.from })}</span
                  >{/if}</span
              >
              <span class="small"
                >{t('build.replacesShort', {
                  ability: abilityNames.get(h.replacesKey) ?? String(h.replacesKey),
                })}</span
              >
              {#if h.page}
                <a class="small" href={h.page} target="_blank" rel="noopener noreferrer"
                  >{t('build.onWiki', { name: h.name })}<span class="sr-only">
                    {t('part.opensNewTab')}</span
                  ></a
                >
              {/if}
              {#if h.note}<span class="note">{h.note}</span>{/if}
            </div>
          </div>
        </section>
      {/if}

      {#if b.weapons.length > 0}
        <section class="cell">
          <h4 class="group">{t('build.weapons')}</h4>
          <ul class="rows">
            {#each b.weapons as w (w.uniqueName)}
              <li>
                <!-- A weapon the search never saw has no picture: no empty frame for it. -->
                {#if w.image}<ModPic image={w.image} size={48} fit="contain" />{/if}
                <div class="id">
                  <span class="name">{w.name}</span>
                  {#if w.note}<span class="note">{w.note}</span>{/if}
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </aside>
  {/if}

  <!-- The build's second half: how to play it, as important as the mods. -->
  <section class="half how-to frame accent" aria-labelledby="build-guide">
    <h4 class="section-title" id="build-guide" tabindex="-1" bind:this={guideEl}>
      {t('build.guide')}
    </h4>
    {#if hasGuide}
      <Guide source={guideSource} />
    {:else}
      <p class="small">{t('build.guideNone')}</p>
    {/if}
  </section>
</article>

<style>
  /*
   * Narrow: the two halves first (Mods, How to play), the loadout after them.
   * Wide (75rem+): the loadout as a column beside Mods; How to play under both.
   */
  .build {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'top'
      'mods'
      'howto'
      'side';
    gap: 1rem;
    min-width: 0;
  }

  .top {
    grid-area: top;
  }

  .mods-half {
    grid-area: mods;
  }

  .how-to {
    grid-area: howto;
  }

  .loadout {
    grid-area: side;
  }

  @media (min-width: 75rem) {
    .build.with-side {
      grid-template-columns: minmax(0, 1fr) 19rem;
      grid-template-areas:
        'top top'
        'mods side'
        'howto howto';
    }

    .build.with-side .loadout {
      align-self: start;
      grid-template-columns: minmax(0, 1fr);
    }
  }

  a {
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  /* The build's name and what it is: no frame, the two halves below carry the frames. */
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.6rem 1.2rem;
    padding: 0.2rem 0.1rem 0;
  }

  .titles {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }

  h3 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.15;
    color: var(--gold);
    overflow-wrap: anywhere;
  }

  .meta {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
  }

  /*
   * "From Test · Update 41 · Saved 13 Nov 2026 · overframe.gg". The dot trails each item,
   * so a wrapped line never starts with one.
   */
  .meta > span:not(:last-child)::after {
    content: '·' / '';
    margin: 0 0.5em;
  }

  /* The description: a lead paragraph, the first thing you read about the build. */
  .description {
    margin: 0.2rem 0 0;
    max-width: 70ch;
    line-height: 1.5;
    white-space: pre-line;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1rem;
    font-size: 0.85rem;
  }

  /* An Edit link styled as the console's primary (gold outline) button. */
  .btn {
    display: inline-block;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: none;
    padding: 0.25rem 0.9rem;
    border: 1px solid var(--gold);
    color: var(--gold);
  }

  .btn:hover {
    background: color-mix(in srgb, var(--gold) 12%, transparent);
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

  /*
   * The two halves (Mods, How to play): the same gold-ticked frame and the same gold
   * section title, so neither reads as a footnote to the other.
   */
  .half {
    padding: 1rem 1.15rem 1.2rem;
    min-width: 0;
  }

  .section-title {
    margin: 0 0 0.8rem;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.2rem;
    letter-spacing: 0.04em;
    color: var(--gold);
  }

  .section-title:focus {
    outline: none;
  }

  /* The guide reads at a comfortable measure inside its wide frame. */
  .how-to :global(.guide) {
    max-width: 72ch;
  }

  .group {
    margin: 0 0 0.55rem;
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
  }

  .name {
    font-weight: 600;
    line-height: 1.25;
  }

  .small {
    font-size: 0.8rem;
    color: var(--muted);
    white-space: pre-line;
  }

  p.small {
    margin: 0;
    font-size: 0.9rem;
  }

  .note {
    font-size: 0.85rem;
  }

  .rank {
    margin-left: 0.3em;
    font-size: 0.85rem;
    color: var(--gold);
  }

  /* "Roar (Rhino)": the space is drawn, so Svelte's whitespace trimming can't eat it. */
  .from {
    margin-left: 0.35em;
    font-weight: 400;
  }

  .id {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

  /* The loadout: seam-joined cells (a strip when narrow, a column when wide). */
  .loadout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    min-width: 0;
  }

  .cell {
    background: var(--surface-2);
    padding: 0.75rem 0.85rem 0.85rem;
    min-width: 0;
  }

  .rows {
    display: grid;
    gap: 0.6rem;
  }

  .rows li,
  .row {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
  }

  /* An arcane's effect as plain text that opens when pressed: two lines at rest. */
  button.effect {
    font: inherit;
    font-size: 0.8rem;
    letter-spacing: normal;
    text-transform: none;
    text-align: left;
    color: var(--muted);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  button.effect:hover:not(:disabled) {
    background: none;
    color: var(--fg);
  }

  .clamp {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .stat {
    font-size: 0.85rem;
    line-height: 1.35;
  }

  /* "Crimson · TAUFORGED": the colour in words, and Tauforged as a visible tag. */
  .kind {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.2rem 0.4rem;
  }

  .tau {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0 0.35rem;
    border: 1px solid currentColor;
    color: var(--fg);
  }

  .sockets-left {
    margin: 0.55rem 0 0;
  }

  /* Mods: cards on one seam, like the game's mod screen (original frames, DE's art). */
  .mods {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
  }

  .mods.special {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 0.75rem;
  }

  @media (max-width: 64rem) {
    .mods {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 30rem) {
    .half {
      padding: 0.85rem 0.8rem 1rem;
    }
  }

  @media (max-width: 24rem) {
    .mods,
    .mods.special {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
