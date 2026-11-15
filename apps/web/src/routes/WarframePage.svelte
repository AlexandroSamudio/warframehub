<script lang="ts">
  import type { ProfileResponse, VariantKind, WarframeDetail } from '@warframehub/shared';
  import AbilityRow from '../components/AbilityRow.svelte';
  import BuildsPage from '../components/BuildsPage.svelte';
  import HowToGet from '../components/HowToGet.svelte';
  import Icon from '../components/Icon.svelte';
  import * as api from '../lib/api.ts';
  import { t } from '../lib/i18n/index.ts';
  import { buildHref, hrefFor, type BuildSub } from '../lib/route.svelte.ts';
  import { formatRelease, pickVariant, polarityName, statLines } from '../lib/warframes.ts';
  import { listState } from '../lib/warframes-state.svelte.ts';
  import { onMount, tick } from 'svelte';

  interface Props {
    slug: string;
    /** On the Builds page (`…/builds`, `…/builds/12`); null on the Overview. */
    sub?: BuildSub | null;
  }

  let { slug, sub = null }: Props = $props();

  /** Overview and Builds share the header and the page tabs (SPEC §14.1). */
  const onBuilds = $derived(sub?.kind === 'list' || sub?.kind === 'view');

  let data = $state<WarframeDetail | null>(null);
  let profile = $state<ProfileResponse | null>(null);
  let loadError = $state<string | null>(null);
  let notFound = $state(false);
  let kind = $state<VariantKind | null>(null);
  let portraitFailed = $state(false);

  // Builds belong to one version (the Prime, or Excalibur Umbra): SPEC §14.1.
  const owner = $derived(data?.variants.find((x) => x.name === data?.buildsVariant) ?? null);
  const ownerAbilities = $derived(new Map(owner?.abilities.map((a) => [a.key, a.name]) ?? []));
  // Opens on the version that owns the builds (the one Alex plays); the Builds page always
  // shows that version.
  const v = $derived(
    data
      ? onBuilds && owner
        ? owner
        : pickVariant(data.variants, kind ?? owner?.kind ?? null)
      : null,
  );
  const stats = $derived(v ? statLines(v) : []);

  let nameEl = $state<HTMLHeadingElement | null>(null);

  function load(s: string) {
    data = null;
    loadError = null;
    notFound = false;
    kind = null;
    portraitFailed = false;
    favoriteError = null;
    listState.lastSlug = s;
    // Not a possible address ("xx_y"): say so without asking the server.
    if (!/^[a-z0-9-]{1,40}$/.test(s)) {
      notFound = true;
      return;
    }
    api
      .getWarframe(s)
      .then(async (d) => {
        if (s !== slug) return; // you moved on to another Warframe meanwhile
        data = d;
        await tick();
        nameEl?.focus(); // the tile you clicked is gone: start reading at the name
      })
      .catch((e: unknown) => {
        if (s !== slug) return;
        if (e instanceof api.ApiCallError && e.status === 404) notFound = true;
        else
          loadError = t('wf.loadError', {
            message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
          });
      });
  }

  $effect(() => {
    load(slug);
  });

  onMount(() => {
    api
      .getProfile()
      .then((p) => (profile = p))
      .catch(() => (profile = null));
  });

  /** Augment names for one ability (and the passive's under "Passive"). */
  function augmentsFor(ability: string): string[] {
    return data?.augments.filter((a) => a.ability === ability).map((a) => a.name) ?? [];
  }

  let favoriteError = $state<string | null>(null);

  /** Stars or unstars this Warframe at once; puts it back if the server says no. */
  async function toggleFavorite() {
    if (!data) return;
    const next = !data.favorite;
    const s = slug;
    favoriteError = null;
    data = { ...data, favorite: next };
    try {
      await api.setFavorite(s, next);
    } catch (e) {
      if (s === slug && data) data = { ...data, favorite: !next };
      favoriteError = t('wf.favoriteError', {
        message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
      });
    }
  }

  /** After "Add as goal": the page again, so the goal shows. False when that failed. */
  async function reload(): Promise<boolean> {
    const s = slug;
    try {
      const d = await api.getWarframe(s);
      if (s === slug) data = d;
      return true;
    } catch {
      return false;
    }
  }
</script>

<div class="page">
  <a class="back" href={hrefFor('warframes')}>
    <span class="flip"><Icon name="chevron" size={12} /></span>
    {t('wf.back')}
  </a>

  {#if data && v}
    <section class="head frame accent" class:compact={onBuilds} aria-labelledby="wf-name">
      <span class="portrait">
        {#if v.image && !portraitFailed}
          {#key v.image}
            <img
              src={api.imageUrl(v.image)}
              alt={t('wf.portraitAlt', { name: v.name })}
              width="160"
              height="160"
              onerror={() => (portraitFailed = true)}
            />
          {/key}
        {/if}
      </span>
      <div class="intro">
        <div class="name-row">
          <h2 id="wf-name" tabindex="-1" bind:this={nameEl}>{v.name}</h2>
          <button
            type="button"
            class="fav"
            class:on={data.favorite}
            aria-pressed={data.favorite}
            onclick={toggleFavorite}
          >
            <Icon name="star" size={14} filled={data.favorite} />
            {t('wf.favorite')}
          </button>
        </div>
        {#if favoriteError}<p class="fav-error" role="alert">{favoriteError}</p>{/if}

        {#if data.variants.length > 1 && !onBuilds}
          <fieldset class="switch">
            <legend class="sr-only">{t('wf.versions')}</legend>
            {#each data.variants as variant (variant.kind)}
              <label class:on={variant.kind === v.kind}>
                <input
                  type="radio"
                  name="wf-version"
                  value={variant.kind}
                  checked={variant.kind === v.kind}
                  onchange={() => ((kind = variant.kind), (portraitFailed = false))}
                />
                {t(`wf.kind.${variant.kind}`)}
              </label>
            {/each}
          </fieldset>
        {/if}

        <p class="badges">
          {#if v.mastered}<span class="badge ok">{t('wf.mastered')}</span>{/if}
          {#if v.vaulted}<span class="badge">{t('wf.vaulted')}</span>{/if}
          {#if v.masteryReq}<span class="badge">{t('wf.mr', { n: v.masteryReq })}</span>{/if}
        </p>
        {#if v.released && !onBuilds}
          <p class="released">
            {v.released.update
              ? t('wf.releasedIn', {
                  date: formatRelease(v.released.date),
                  update: v.released.update,
                })
              : t('wf.released', { date: formatRelease(v.released.date) })}
          </p>
        {/if}
        {#if !onBuilds}
          <p class="desc">{v.description}</p>
          {#if v.passive}
            <p class="passive"><b>{t('wf.passive')}</b> {v.passive}</p>
            {#if augmentsFor('Passive').length > 0}
              <p class="passive-aug">
                {t('wf.augmentsOf', { names: augmentsFor('Passive').join(', ') })}
              </p>
            {/if}
          {/if}
        {/if}
      </div>
    </section>

    <!-- Overview and Builds are two pages of one Warframe: links, so each has its address. -->
    <nav class="page-tabs" aria-label={t('wf.pages', { name: data.name })}>
      <a href={hrefFor('warframes', slug)} aria-current={onBuilds ? undefined : 'page'}
        >{t('wf.overview')}</a
      >
      <a href={buildHref(slug)} aria-current={onBuilds ? 'page' : undefined}
        >{t('build.title')}{#if data.builds.length > 0}<span class="count num"
            >{data.builds.length}</span
          >{/if}</a
      >
    </nav>

    {#if onBuilds}
      <BuildsPage
        {slug}
        open={sub?.kind === 'view' ? sub.id : null}
        owner={data.buildsVariant}
        ownerNote={owner?.kind === 'umbra' && data.variants.some((x) => x.kind === 'prime')
          ? t('build.umbraNote', { base: data.name, owner: data.buildsVariant })
          : null}
        builds={data.builds}
        abilityNames={ownerAbilities}
        onReordered={(builds) => {
          if (data) data = { ...data, builds };
        }}
      />
    {:else}
      <section class="panel frame" aria-labelledby="wf-abilities">
        <h3 id="wf-abilities">{t('wf.abilities')}</h3>
        <p class="hint">{t('wf.ranks')}</p>
        <ul class="abilities">
          {#each v.abilities as a (a.uniqueName)}
            <AbilityRow ability={a} augments={augmentsFor(a.name)} />
          {/each}
        </ul>
      </section>

      {#if data.augments.length > 0}
        <section class="panel frame" aria-labelledby="wf-augments">
          <h3 id="wf-augments">{t('wf.augments')}</h3>
          {#if data.augmentShops.length > 0}
            <p class="hint">{t('wf.soldBy', { shops: data.augmentShops.join(', ') })}</p>
          {/if}
          <ul class="rows">
            {#each data.augments as aug (aug.name)}
              <li>
                <span class="lead">{aug.name}</span>
                {#if aug.ability}<span class="for"
                    >{t('wf.augmentFor', { ability: aug.ability })}</span
                  >{/if}
                <p class="effect">{aug.effect}</p>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <section class="panel frame" aria-labelledby="wf-stats">
        <h3 id="wf-stats">{t('wf.stats')}</h3>
        <dl class="stats">
          {#each stats as s (s.key)}
            <dt>{t(`wf.stat.${s.key}`)}</dt>
            <dd class="num">
              {s.value}{#if s.rank30}<span class="r30">{t('wf.atRank30', { value: s.rank30 })}</span
                >{/if}
            </dd>
          {/each}
          <dt>{t('wf.aura')}</dt>
          <dd>{v.aura ? polarityName(v.aura) : t('wf.none')}</dd>
          <dt>{t('wf.polarities')}</dt>
          <dd>
            {v.polarities.length > 0 ? v.polarities.map(polarityName).join(', ') : t('wf.none')}
          </dd>
        </dl>
      </section>

      <HowToGet
        id="wf-get"
        uniqueName={v.uniqueName}
        name={v.name}
        recipe={v.recipe}
        vaulted={v.vaulted}
        goal={v.goal}
        {reload}
      />

      <section class="panel frame" aria-labelledby="wf-progress">
        <h3 id="wf-progress">{t('wf.progress')}</h3>
        <ul class="facts">
          <li>
            {#if v.mastered}
              {t('wf.masteredYes')}
            {:else if profile && !profile.profile}
              <a href={hrefFor('profile')}>{t('wf.noProfile')}</a>
            {:else}
              {t('wf.masteredNo')}
            {/if}
          </li>
          <li>
            {v.goal?.status === 'active'
              ? t('wf.inGoals')
              : v.goal?.status === 'built'
                ? t('wf.built')
                : t('wf.goalNone')}
          </li>
        </ul>
      </section>
    {/if}

    <p class="credit">
      {t('wf.credit')}
      {#if v.wikiUrl}
        <a href={v.wikiUrl} target="_blank" rel="noopener noreferrer"
          >{t('wf.wikiLinkAria', { name: v.name })}<span class="sr-only">
            {t('part.opensNewTab')}</span
          ></a
        >
      {/if}
    </p>
  {:else if notFound}
    <p class="alert frame" role="alert">{t('wf.notFound', { slug })}</p>
  {:else if loadError}
    <div class="alert frame" role="alert">
      <p>{loadError}</p>
      <button type="button" onclick={() => load(slug)}>{t('wf.retry')}</button>
    </div>
  {:else}
    <p class="hint" aria-live="polite">{t('wf.loading')}</p>
  {/if}
</div>

<style>
  /*
   * Overview and Builds use the app's full column, so the header and the page tabs never
   * jump between them. Prose keeps its own measure (60–64ch).
   */
  .page {
    display: grid;
    gap: 0.9rem;
  }

  a {
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  .back {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0;
    font-size: 0.85rem;
  }

  .flip {
    display: inline-flex;
    transform: rotate(180deg);
  }

  .head {
    display: grid;
    grid-template-columns: 10rem minmax(0, 1fr);
    gap: 1.2rem;
    padding: 1.1rem 1.3rem 1.2rem;
  }

  /* On the Builds page the header is one line: the build is the content. */
  .head.compact {
    grid-template-columns: 3.5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.9rem;
    padding: 0.7rem 1rem;
  }

  .head.compact .portrait {
    width: 3.5rem;
    height: 3.5rem;
  }

  .head.compact .intro {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.8rem;
  }

  /*
   * Overview | Builds: two pages of one Warframe, as large as the screen titles. The
   * current one is gold with the nav's 2px gold underline; a seam runs under both.
   */
  .page-tabs {
    display: flex;
    gap: 1.6rem;
    border-bottom: 1px solid var(--line);
    margin-top: 0.2rem;
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
    font-size: 0.8rem;
    min-width: 1.4rem;
    padding: 0 0.35rem;
    border: 1px solid currentColor;
    text-align: center;
  }

  .portrait {
    width: 10rem;
    height: 10rem;
    background: var(--surface-2);
    border: 1px solid var(--line-strong);
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
    overflow: hidden;
  }

  .portrait img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
  }

  .intro {
    display: grid;
    align-content: start;
    gap: 0.5rem;
    min-width: 0;
  }

  .name-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.8rem;
  }

  .fav {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
  }

  .fav.on {
    color: var(--gold);
    border-color: var(--gold);
  }

  .fav-error {
    margin: 0;
    font-size: 0.85rem;
    color: var(--bad);
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.15;
    color: var(--gold);
  }

  /* The version switch: a segmented radio group in the console's button style. */
  .switch {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-wrap: wrap;
  }

  .switch label {
    position: relative;
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--line-strong);
    margin-left: -1px;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    cursor: pointer;
  }

  .switch label:first-of-type {
    margin-left: 0;
  }

  .switch label:not(.on):hover {
    color: var(--fg);
    border-color: var(--gold);
  }

  .switch label.on {
    z-index: 1;
    border-color: var(--gold);
    color: var(--gold);
    background: color-mix(in srgb, var(--gold) 12%, transparent);
  }

  .switch input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }

  .switch label:has(input:focus-visible) {
    outline: 2px solid var(--teal);
    outline-offset: 2px;
  }

  .badges {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .badges:empty {
    display: none;
  }

  .released,
  .hint,
  .passive-aug {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  /* `ch` is the width of a "0", wider than an average letter: 60ch reads as ~75 characters. */
  .desc,
  .passive {
    margin: 0;
    max-width: 60ch;
  }

  .passive b {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--gold);
  }

  .panel {
    padding: 0.95rem 1.15rem 1rem;
    display: grid;
    gap: 0.4rem;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--gold);
  }

  .abilities,
  .rows,
  .facts {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .rows li {
    padding: 0.5rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .rows li:last-child {
    border-bottom: 0;
  }

  .lead {
    font-weight: 600;
    margin-right: 0.5rem;
  }

  .for {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .effect {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
    max-width: 64ch;
  }

  .stats {
    display: grid;
    grid-template-columns: minmax(9rem, max-content) 1fr;
    gap: 0.35rem 1.5rem;
    margin: 0;
  }

  .stats dt {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  .stats dd {
    margin: 0;
  }

  .r30 {
    margin-left: 0.35em;
    color: var(--muted);
  }

  .facts li {
    padding: 0.15rem 0;
  }

  .credit {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
    max-width: 80ch;
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

  @media (max-width: 36rem) {
    .head {
      grid-template-columns: minmax(0, 1fr);
      padding: 0.9rem 1rem 1rem;
    }

    .portrait {
      width: 8rem;
      height: 8rem;
    }

    .stats {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.05rem;
    }

    .stats dd {
      margin-bottom: 0.45rem;
    }
  }
</style>
