<script lang="ts">
  import type { WeaponBuildView } from '@warframehub/shared';
  import * as api from '../lib/api.ts';
  import { formatSaved, sourceHost } from '../lib/builds.ts';
  import { t, tOr } from '../lib/i18n/index.ts';
  import { buildHref } from '../lib/route.svelte.ts';
  import { polarityName } from '../lib/warframes.ts';
  import ModCard from './ModCard.svelte';
  import ModPic from './ModPic.svelte';
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  /**
   * One weapon build, open on the weapon's Builds page (SPEC §15.1). The Warframe build's
   * look without the guide: the title row, one framed **Mods** section (Exilus and Stance,
   * then 8 cards), and beside it the loadout: arcanes, Incarnon perks, Riven, progenitor.
   */
  interface Props {
    slug: string;
    build: WeaponBuildView;
    /** The weapon's slot decides which special slots it has. */
    hasExilus: boolean;
    melee: boolean;
  }

  let { slug, build: b, hasExilus, melee }: Props = $props();

  const c = $derived(b.content);
  const arcanes = $derived(b.arcanes.filter((a) => a !== null));
  const hasSide = $derived(
    arcanes.length > 0 || b.incarnon.length > 0 || c.riven !== null || c.progenitor !== null,
  );
  const expanded = new SvelteSet<string>();
  const toggle = (u: string) => {
    if (!expanded.delete(u)) expanded.add(u);
  };
  const statName = (s: string) => tOr(`wb.rstat.${s}`, s);

  let shareMessage = $state<{ text: string; bad: boolean } | null>(null);
  let manualCode = $state<string | null>(null);
  let sharing = $state(false);
  let codeBox = $state<HTMLTextAreaElement | null>(null);
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(clearTimer));

  /** Copies the build's code; falls back to showing it selected. */
  async function share() {
    if (sharing) return;
    clearTimeout(clearTimer);
    sharing = true;
    shareMessage = null;
    manualCode = null;
    try {
      const code = await api.shareWeaponBuild(b.id);
      try {
        await navigator.clipboard.writeText(code);
        shareMessage = { text: t('build.shareCopied'), bad: false };
        clearTimer = setTimeout(() => (shareMessage = null), 6000);
      } catch {
        manualCode = code;
        shareMessage = { text: t('build.shareManual'), bad: false };
        await tick();
        codeBox?.focus();
        codeBox?.select();
      }
    } catch (e) {
      shareMessage = {
        text: t('build.shareError', {
          message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
        }),
        bad: true,
      };
    } finally {
      sharing = false;
    }
  }

  $effect(() => {
    void b.id;
    clearTimeout(clearTimer);
    shareMessage = null;
    manualCode = null;
  });
</script>

<article class="build" class:with-side={hasSide} aria-labelledby="build-name">
  <header class="top">
    <div class="titles">
      <h3 id="build-name" tabindex="-1">{b.name}</h3>
      <p class="meta">
        <span class="version">{t('wb.forVersion', { name: b.variantName })}</span>
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
      {#if manualCode}
        <textarea
          class="code-box"
          bind:this={codeBox}
          readonly
          rows="6"
          aria-label={t('build.shareCode')}
          value={manualCode}
          onfocus={(e) => e.currentTarget.select()}></textarea>
      {/if}
    </div>
    <div class="actions">
      <button type="button" class="link" aria-disabled={sharing} onclick={share}
        >{t('build.share')}<span class="sr-only"> {b.name}</span></button
      >
      <span class="share" class:bad={shareMessage?.bad} role="status"
        >{shareMessage?.text ?? ''}</span
      >
      <a class="btn" href={buildHref(slug, { kind: 'edit', id: b.id }, 'weapons')}
        >{t('build.edit')}<span class="sr-only"> {b.name}</span></a
      >
    </div>
  </header>

  <section class="mods-half frame accent" aria-labelledby="build-mods">
    <h4 class="section-title" id="build-mods">{t('build.mods')}</h4>
    {#if hasExilus || melee}
      <ul class="mods special" class:single={!(hasExilus && melee)}>
        {#if hasExilus}<ModCard slot={b.exilus} label={t('build.exilus')} />{/if}
        {#if melee}<ModCard slot={b.stance} label={t('wb.stance')} />{/if}
      </ul>
    {/if}
    <ul class="mods">
      {#each b.slots as s, i (i)}
        <ModCard slot={s} label={t('build.slotN', { n: i + 1 })} compact />
      {/each}
    </ul>
  </section>

  {#if hasSide}
    <aside class="loadout" aria-label={t('wb.loadout')}>
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
                  {#if a.note}<span class="note"
                      ><span class="note-label">{t('build.note')}</span> {a.note}</span
                    >{/if}
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if b.incarnon.length > 0}
        <section class="cell">
          <h4 class="group">{t('wb.incarnon')}</h4>
          <ul class="rows">
            {#each b.incarnon as p (p.tier)}
              <li class="perk">
                <span class="tier">{t('wp.evoTier', { n: p.tier })}</span>
                <span class="name" lang="en">{p.name ?? '—'}</span>
                {#each p.lines as line, i (i)}<span class="small" lang="en">{line}</span>{/each}
                {#if p.note}<span class="note"
                    ><span class="note-label">{t('build.note')}</span> {p.note}</span
                  >{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if c.riven}
        {@const r = c.riven}
        <section class="cell">
          <h4 class="group">{t('wb.riven')}</h4>
          {#if r.name || r.polarity}
            <p class="riven-name">
              {#if r.name}<span class="name">{r.name}</span>{/if}
              {#if r.polarity}<span class="small">{polarityName(r.polarity)}</span>{/if}
            </p>
          {/if}
          <ul class="stats">
            {#each r.stats as s, i (i)}
              <li class:negative={s.negative}>
                <span class="value num">{s.value}</span>
                <span
                  >{statName(s.stat)}{#if s.spliced}<span class="small spliced">
                      ({t('wb.spliced')})</span
                    >{/if}</span
                >
                <span class="sr-only">({s.negative ? t('wb.negative') : t('wb.positive')})</span>
              </li>
            {/each}
          </ul>
          {#if r.note}<span class="note"
              ><span class="note-label">{t('build.note')}</span> {r.note}</span
            >{/if}
        </section>
      {/if}

      {#if c.progenitor}
        <section class="cell">
          <h4 class="group">{t('wb.progenitor')}</h4>
          <p class="name">
            {t('wb.progenitorShown', {
              element: t(`wp.dmg.${c.progenitor.element}`),
              percent: c.progenitor.percent,
            })}
          </p>
        </section>
      {/if}
    </aside>
  {/if}
</article>

<style>
  /*
   * Narrow: the loadout (arcane, Incarnon picks, Riven) first, then the Mods: the weapon's
   * own choices are what you look for. Wide (75rem+): the loadout as a column beside Mods.
   */
  .build {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'top'
      'side'
      'mods';
    gap: 1rem;
    min-width: 0;
  }

  .top {
    grid-area: top;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.6rem 1.2rem;
    padding: 0.2rem 0.1rem 0;
  }

  .mods-half {
    grid-area: mods;
    padding: 1rem 1.15rem 1.2rem;
    min-width: 0;
  }

  .loadout {
    grid-area: side;
  }

  @media (min-width: 75rem) {
    .build.with-side {
      grid-template-columns: minmax(0, 1fr) 19rem;
      grid-template-areas:
        'top top'
        'mods side';
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

  .meta > span:not(:last-child)::after {
    content: '·' / '';
    margin: 0 0.5em;
  }

  .version {
    color: var(--fg);
  }

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

  .share {
    flex: 1 1 14rem;
    min-width: 0;
    color: var(--ok);
  }

  .share.bad {
    color: var(--bad);
  }

  .share:empty {
    flex: 0 0 0;
  }

  .code-box {
    display: block;
    width: 36rem;
    max-width: 100%;
    box-sizing: border-box;
    margin-top: 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    word-break: break-all;
    resize: vertical;
  }

  .code-box:focus-visible {
    outline: 2px solid var(--teal);
    outline-offset: 2px;
  }

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

  @media (pointer: coarse) {
    button.link,
    .btn {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
    }
  }

  .section-title {
    margin: 0 0 0.8rem;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.2rem;
    letter-spacing: 0.04em;
    color: var(--gold);
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

  p {
    margin: 0;
  }

  .name {
    font-weight: 600;
    line-height: 1.25;
  }

  .small {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .note {
    font-size: 0.85rem;
  }

  .note-label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--gold);
    margin-right: 0.15rem;
  }

  .rank {
    margin-left: 0.3em;
    font-size: 0.85rem;
    color: var(--gold);
  }

  .id {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

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
    display: grid;
    align-content: start;
    gap: 0.35rem;
  }

  .cell .group {
    margin-bottom: 0.2rem;
  }

  .rows {
    display: grid;
    gap: 0.6rem;
  }

  .rows li {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
  }

  .rows li.perk {
    display: grid;
    gap: 0.1rem;
  }

  .tier {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gold);
  }

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
    white-space: pre-line;
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

  .riven-name {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.6rem;
  }

  /* A Riven's stats: the value first (tabular), positives in Readout White, the negative rose. */
  .stats {
    display: grid;
    gap: 0.2rem;
  }

  .stats li {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    gap: 0.6rem;
    font-size: 0.9rem;
  }

  .stats .value {
    font-weight: 600;
    text-align: right;
  }

  .stats li.negative {
    color: var(--bad);
  }

  .spliced {
    color: inherit;
    opacity: 0.85;
  }

  /* Mods: cards on one seam, like the Warframe build's. */
  .mods {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
  }

  /*
   * Exilus and Stance line up with the slots below: each is one slot wide, so a lone Exilus
   * isn't stretched across half the row.
   */
  .mods.special {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 50%;
    margin-bottom: 0.75rem;
  }

  .mods.special.single {
    grid-template-columns: minmax(0, 1fr);
    width: 25%;
  }

  @media (max-width: 64rem) {
    .mods {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .mods.special {
      width: 100%;
    }

    .mods.special.single {
      width: 50%;
    }
  }

  @media (max-width: 30rem) {
    .mods-half {
      padding: 0.85rem 0.8rem 1rem;
    }
  }

  @media (max-width: 24rem) {
    .mods,
    .mods.special {
      grid-template-columns: minmax(0, 1fr);
    }

    .mods.special,
    .mods.special.single {
      width: 100%;
    }
  }
</style>
