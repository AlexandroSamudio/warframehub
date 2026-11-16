<script lang="ts">
  import type {
    ProfileResponse,
    WeaponAttack,
    WeaponDetail,
    WeaponVariantKind,
  } from '@warframehub/shared';
  import { onMount, tick } from 'svelte';
  import Evolutions from '../components/Evolutions.svelte';
  import HowToGet from '../components/HowToGet.svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import * as api from '../lib/api.ts';
  import { language, t, tOr } from '../lib/i18n/index.ts';
  import { hrefFor, weaponsHref } from '../lib/route.svelte.ts';
  import { formatRelease } from '../lib/warframes.ts';
  import { weaponListState } from '../lib/weapons-state.svelte.ts';
  import { attackKey, formatStat } from '../lib/weapons.ts';

  interface Props {
    slug: string;
  }

  let { slug }: Props = $props();

  let data = $state<WeaponDetail | null>(null);
  let profile = $state<ProfileResponse | null>(null);
  let loadError = $state<string | null>(null);
  let notFound = $state(false);
  let kind = $state<WeaponVariantKind | null>(null);
  let attackIndex = $state(0);
  let pictureFailed = $state(false);
  let favoriteError = $state<string | null>(null);
  let nameEl = $state<HTMLHeadingElement | null>(null);
  /** One short line read out after a version or attack switch (not the whole block). */
  let announce = $state('');

  const v = $derived(
    data ? (data.variants.find((x) => x.kind === kind) ?? data.variants[0]!) : null,
  );
  const attack = $derived<WeaponAttack | null>(
    v ? (v.attacks[attackIndex] ?? v.attacks[0] ?? null) : null,
  );
  const melee = $derived(data?.slot === 'melee' || data?.slot === 'archmelee');
  const backTab = $derived(data?.tab ?? weaponListState.lastTab);

  const num = (n: number) => formatStat(n, language.current);
  const pct = (n: number) =>
    (n / 100).toLocaleString(language.current, { style: 'percent', maximumFractionDigits: 1 });
  const attackName = (name: string) => {
    const key = attackKey(name);
    return key ? t(`wp.atk.${key}` as Parameters<typeof t>[0]) : name;
  };
  const kindLabel = (k: WeaponVariantKind) => t(`wp.kind.${k}`);

  /** The weapon's own numbers, only the ones it has. */
  const statRows = $derived.by(() => {
    if (!v) return [];
    const st = v.stats;
    const rows: { label: string; value: string }[] = [];
    if (st.magazine !== null) rows.push({ label: t('wp.stat.magazine'), value: num(st.magazine) });
    if (st.reload !== null)
      rows.push({ label: t('wp.stat.reload'), value: t('wp.seconds', { n: num(st.reload) }) });
    if (st.multishot !== null)
      rows.push({ label: t('wp.stat.multishot'), value: num(st.multishot) });
    if (st.trigger !== null)
      rows.push({
        label: t('wp.stat.trigger'),
        value: tOr(`wp.trigger.${st.trigger}`, st.trigger),
      });
    if (st.noise !== null)
      rows.push({ label: t('wp.stat.noise'), value: tOr(`wp.noise.${st.noise}`, st.noise) });
    if (st.range !== null)
      rows.push({ label: t('wp.stat.range'), value: t('wp.metres', { n: num(st.range) }) });
    return rows;
  });

  function load(s: string) {
    data = null;
    announce = '';
    loadError = null;
    notFound = false;
    kind = null;
    attackIndex = 0;
    pictureFailed = false;
    favoriteError = null;
    weaponListState.lastSlug = s;
    // Not a possible address: say so without asking the server.
    if (!/^[a-z0-9-]{1,60}$/.test(s)) {
      notFound = true;
      return;
    }
    api
      .getWeapon(s)
      .then(async (d) => {
        if (s !== slug) return; // you moved on to another weapon meanwhile
        data = d;
        weaponListState.lastTab = d.tab;
        await tick();
        nameEl?.focus(); // the tile you clicked is gone: start reading at the name
      })
      .catch((e: unknown) => {
        if (s !== slug) return;
        if (e instanceof api.ApiCallError && e.status === 404) notFound = true;
        else
          loadError = t('wp.loadError', {
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

  /** After "Add as goal": the page again, so the goal shows. False when that failed. */
  async function reload(): Promise<boolean> {
    const s = slug;
    try {
      const d = await api.getWeapon(s);
      if (s === slug) data = d;
      return true;
    } catch {
      return false;
    }
  }

  /** Stars or unstars this weapon at once; puts it back if the server says no. */
  async function toggleFavorite() {
    if (!data) return;
    const next = !data.favorite;
    const s = slug;
    favoriteError = null;
    data = { ...data, favorite: next };
    try {
      await api.setWeaponFavorite(s, next);
    } catch (e) {
      if (s === slug && data) data = { ...data, favorite: !next };
      favoriteError = t('wf.favoriteError', {
        message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
      });
    }
  }
</script>

<div class="page">
  <p class="sr-only" role="status">{announce}</p>
  <a class="back" href={weaponsHref(backTab)}>
    <span class="flip"><Icon name="chevron" size={12} /></span>
    {backTab === 'arch' ? t('wp.backArch') : t('wp.back')}
  </a>

  {#if data && v}
    <section class="head frame accent" aria-labelledby="wp-name">
      <span class="picture">
        {#if v.image && !pictureFailed}
          {#key v.image}
            <img
              src={api.imageUrl(v.image)}
              alt={v.name}
              width="160"
              height="160"
              onerror={() => (pictureFailed = true)}
            />
          {/key}
        {/if}
      </span>
      <div class="intro">
        <div class="name-row">
          <h2 id="wp-name" tabindex="-1" bind:this={nameEl}>{v.name}</h2>
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

        <p class="kind-line">
          {data.class
            ? t('wp.slotClass', {
                slot: t(`wp.slot.${data.slot}`),
                cls: tOr(`wp.class.${data.class}`, data.class),
              })
            : t(`wp.slot.${data.slot}`)}
        </p>

        {#if data.variants.length > 1}
          <Segmented
            legend={t('wf.versions')}
            hideLegend
            name="wp-version"
            options={data.variants.map((x) => ({ value: x.kind, label: kindLabel(x.kind) }))}
            value={v.kind}
            onchange={(k) => {
              kind = k;
              attackIndex = 0;
              pictureFailed = false;
              announce = data?.variants.find((x) => x.kind === k)?.name ?? '';
            }}
          />
        {/if}

        <p class="badges">
          {#if v.mastered}<span class="badge ok">{t('wp.mastered')}</span>{/if}
          {#if data.inCircuit}<span class="badge teal">{t('wp.inCircuit')}</span>{/if}
          {#if v.evolutions}
            <!-- A link-like badge: jumps to the evolutions (a hash link would change the page). -->
            <button
              type="button"
              class="badge jump"
              aria-label={t('wp.evoJump')}
              onclick={() => {
                const h = document.getElementById('wp-evolutions');
                const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                h?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
                h?.focus({ preventScroll: true });
              }}>{t('wp.incarnon')}</button
            >
          {:else if v.incarnon}<span class="badge">{t('wp.incarnon')}</span>{/if}
          {#if v.vaulted}<span class="badge">{t('wf.vaulted')}</span>{/if}
          {#if v.masteryReq !== null}<span class="badge">{t('wf.mr', { n: v.masteryReq })}</span
            >{/if}
        </p>
        {#if v.released}
          <p class="released">
            {v.released.update
              ? t('wp.releasedIn', {
                  date: formatRelease(v.released.date),
                  update: v.released.update,
                })
              : t('wp.released', { date: formatRelease(v.released.date) })}
          </p>
        {/if}
        {#if v.description}<p class="desc">{v.description}</p>{/if}
      </div>
    </section>

    <section class="panel frame accent" aria-labelledby="wp-attacks">
      <h3 id="wp-attacks">{t('wp.attacks')}</h3>
      {#if v.attacks.length > 1}
        <Segmented
          legend={t('wp.attackLabel')}
          hideLegend
          name="wp-attack"
          options={v.attacks.map((a, i) => ({ value: String(i), label: attackName(a.name) }))}
          value={String(attackIndex)}
          onchange={(i) => {
            attackIndex = Number(i);
            const a = v?.attacks[attackIndex];
            announce = a
              ? t('wp.attackAnnounce', { attack: attackName(a.name), total: num(a.total) })
              : '';
          }}
        />
      {/if}
      {#if attack}
        <div class="attack">
          {#if v.attacks.length === 1}<p class="attack-name">{attackName(attack.name)}</p>{/if}
          <div class="attack-grid">
            <div class="damage">
              <p class="label">{t('wp.damage')}</p>
              <p class="total num">{num(attack.total)}</p>
              {#if attack.damage.length > 0}
                <ul class="types">
                  {#each attack.damage as d (d.type)}
                    <li>
                      <span>{tOr(`wp.dmg.${d.type}`, d.type)}</span>
                      <span class="num">{num(d.amount)}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
            <dl class="stats">
              {#if attack.critChance !== null}
                <dt>{t('wp.crit')}</dt>
                <dd class="num">{pct(attack.critChance)}</dd>
              {/if}
              {#if attack.critMultiplier !== null}
                <dt>{t('wp.critMult')}</dt>
                <dd class="num">×{num(attack.critMultiplier)}</dd>
              {/if}
              {#if attack.statusChance !== null}
                <dt>{t('wp.status')}</dt>
                <dd class="num">{pct(attack.statusChance)}</dd>
              {/if}
              {#if attack.speed !== null}
                <dt>{melee ? t('wp.attackSpeed') : t('wp.fireRate')}</dt>
                <dd class="num">
                  {melee ? num(attack.speed) : t('wp.perSecond', { n: num(attack.speed) })}
                </dd>
              {/if}
              {#if attack.chargeTime !== null}
                <dt>{t('wp.chargeTime')}</dt>
                <dd class="num">{t('wp.seconds', { n: num(attack.chargeTime) })}</dd>
              {/if}
              {#if attack.shotType !== null}
                <dt>{t('wp.shotType')}</dt>
                <dd>{tOr(`wp.shot.${attack.shotType}`, attack.shotType)}</dd>
              {/if}
            </dl>
          </div>
        </div>
      {:else}
        <p class="hint">{t('wp.noAttacks')}</p>
      {/if}
    </section>

    {#if v.evolutions}
      <Evolutions
        evolutions={v.evolutions}
        baseName={data.name}
        name={v.name}
        circuitEndsAt={data.circuitEndsAt}
      />
    {/if}

    <!-- Short panels side by side on wide screens, so none is mostly empty. -->
    <div class="pair">
      <section class="panel frame" aria-labelledby="wp-stats">
        <h3 id="wp-stats">{t('wp.stats')}</h3>
        <dl class="stats">
          {#each statRows as r (r.label)}
            <dt>{r.label}</dt>
            <dd class="num">{r.value}</dd>
          {/each}
          <!-- DE retired dispositions: every weapon is 1.20× (wiki, "Riven Mods"). -->
          <dt>{t('wp.stat.disposition')}</dt>
          <dd class="note">{t('wp.dispositionRetired')}</dd>
        </dl>
      </section>

      <section class="panel frame" aria-labelledby="wp-progress">
        <h3 id="wp-progress">{t('wf.progress')}</h3>
        <ul class="facts">
          <li>
            {#if v.mastered}
              {t('wp.masteredYes')}
            {:else if profile && !profile.profile}
              <a href={hrefFor('profile')}>{t('wf.noProfile')}</a>
            {:else}
              {t('wp.masteredNo')}
            {/if}
          </li>
          <li>
            {v.goal?.status === 'active'
              ? t('wf.inGoals')
              : v.goal?.status === 'built'
                ? t('wp.built')
                : t('wf.goalNone')}
          </li>
        </ul>
      </section>
    </div>

    <HowToGet
      id="wp-get"
      uniqueName={v.uniqueName}
      name={v.name}
      recipe={v.recipe}
      vaulted={v.vaulted}
      goal={v.goal}
      {reload}
    />

    <p class="credit">
      {t('wp.credit')}
      {#if v.wikiUrl}
        <a href={v.wikiUrl} target="_blank" rel="noopener noreferrer"
          >{t('wf.wikiLinkAria', { name: v.name })}<span class="sr-only">
            {t('part.opensNewTab')}</span
          ></a
        >
      {/if}
    </p>
  {:else if notFound}
    <p class="alert frame" role="alert">{t('wp.notFound', { slug })}</p>
  {:else if loadError}
    <div class="alert frame" role="alert">
      <p>{loadError}</p>
      <button type="button" onclick={() => load(slug)}>{t('wf.retry')}</button>
    </div>
  {:else}
    <p class="hint" aria-live="polite">{t('wp.loading')}</p>
  {/if}
</div>

<style>
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

  /* The whole weapon, as DE draws it on a square: never cropped. */
  .picture {
    width: 10rem;
    height: 10rem;
    background: var(--surface-2);
    border: 1px solid var(--line-strong);
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
    overflow: hidden;
  }

  .picture img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
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

  h2 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.15;
    color: var(--gold);
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

  .kind-line {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
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

  /* The Incarnon badge as a jump to the evolutions: the badge look, plus a hover. */
  .badge.jump {
    background: none;
    padding: 0 0.4rem;
    border: 1px solid currentColor;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
  }

  .badge.jump:hover {
    background: none;
    color: var(--fg);
  }

  .released,
  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  /* `ch` is the width of a "0", wider than an average letter: 60ch reads as ~75 characters. */
  .desc {
    margin: 0;
    max-width: 60ch;
  }

  .panel {
    padding: 0.95rem 1.15rem 1rem;
    display: grid;
    gap: 0.6rem;
  }

  .panel p {
    margin: 0;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--gold);
  }

  .attack-name {
    font-weight: 600;
  }

  /* Damage on the left (the total large, then each type); the rest as a list beside it. */
  .attack-grid {
    display: grid;
    grid-template-columns: minmax(12rem, 18rem) minmax(0, 1fr);
    gap: 1rem 2.5rem;
    align-items: start;
  }

  .label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .total {
    font-size: 1.6rem;
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: -0.01em;
  }

  .types {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
  }

  .types li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.2rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .types li:last-child {
    border-bottom: 0;
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

  .stats .note {
    font-size: 0.85rem;
    color: var(--muted);
    max-width: 40ch;
  }

  /* Weapon stats, Incarnon and Your progress share a row on wide screens. */
  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 0.9rem;
    align-items: start;
  }

  /* Fingers need more than the console's dense controls. */
  @media (pointer: coarse) {
    .fav,
    .back {
      min-height: 2.75rem;
    }
  }

  .facts {
    list-style: none;
    margin: 0;
    padding: 0;
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

  @media (max-width: 48rem) {
    .attack-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 36rem) {
    .head {
      grid-template-columns: minmax(0, 1fr);
      padding: 0.9rem 1rem 1rem;
    }

    .picture {
      width: 8rem;
      height: 8rem;
    }

    /* Label and value stay on one line, so the numbers stay in view. */
    .stats {
      grid-template-columns: minmax(7.5rem, max-content) minmax(0, 1fr);
      gap: 0.35rem 1rem;
    }
  }
</style>
