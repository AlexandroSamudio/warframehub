<script lang="ts">
  import type { WorldstateResponse } from '@warframehub/shared';
  import { onMount } from 'svelte';
  import { ApiCallError, getWorldstate, refreshWorldstate } from '../lib/api.ts';
  import { t } from '../lib/i18n/index.ts';
  import { formatCountdown, formatLocal, formatUtc } from '../lib/time.ts';
  import RotationCard from './RotationCard.svelte';

  interface Props {
    nowMs: number;
    timeZone: string;
    /** Called after new live data arrives, so the tracker can pick up new Sortie/Baro times. */
    onUpdate?: () => void;
  }

  let { nowMs, timeZone, onUpdate }: Props = $props();

  let ws = $state<WorldstateResponse | null>(null);
  let failed = $state(false);
  let refreshing = $state(false);
  let notice = $state<string | null>(null);

  // The server only fetches from warframestat.us when its cache has expired,
  // so asking it every few minutes while the page is open costs nothing upstream.
  const RELOAD_MS = 5 * 60_000;

  async function load() {
    try {
      ws = await getWorldstate();
      failed = false;
    } catch {
      if (!ws) failed = true;
    }
  }

  async function refresh() {
    refreshing = true;
    notice = null;
    try {
      ws = await refreshWorldstate();
      onUpdate?.();
    } catch (error) {
      notice =
        error instanceof ApiCallError && error.status === 429
          ? t('rotations.rateLimited')
          : t('rotations.loadError');
    } finally {
      refreshing = false;
    }
  }

  function at(iso: string) {
    return { local: formatLocal(iso, timeZone), utc: formatUtc(iso) };
  }
  function left(iso: string) {
    return formatCountdown(Math.max(0, Date.parse(iso) - nowMs));
  }
  function ends(iso: string) {
    return t('rotations.endsIn', { countdown: left(iso), ...at(iso) });
  }

  onMount(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, RELOAD_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });
</script>

<aside class="rotations" aria-label={t('rotations.label')}>
  <div class="bar">
    <h2>{t('rotations.label')}</h2>
    <button type="button" class="teal" onclick={refresh} disabled={refreshing}>
      {refreshing ? t('rotations.refreshing') : t('rotations.refresh')}
    </button>
  </div>
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}

  {#if ws}
    {@const c = ws.cards}

    <RotationCard title={t('card.archonHunt')} {...c.archonHunt} {nowMs}>
      {#if c.archonHunt.data}
        {@const a = c.archonHunt.data}
        <p class="lead">
          {a.boss}
          {#if a.shard}
            <span class="badge shard {a.shard.toLowerCase()}">
              {t('archon.shard', { shard: t(`shard.${a.shard}`) })}
            </span>
          {/if}
        </p>
        <ul>
          {#each a.missions as m, i (i)}<li>
              {t('mission.line', { type: m.type, node: m.node })}
            </li>{/each}
        </ul>
        <p class="when">{ends(a.expiry)}</p>
      {/if}
    </RotationCard>

    <RotationCard title={t('card.sortie')} {...c.sortie} {nowMs}>
      {#if c.sortie.data}
        {@const s = c.sortie.data}
        <p class="lead">{s.boss} · {s.faction}</p>
        <ul>
          {#each s.missions as m, i (i)}
            <li>
              {t('mission.line', { type: m.missionType, node: m.node })}
              <span class="sub" title={m.modifierDescription}>{m.modifier}</span>
            </li>
          {/each}
        </ul>
        <p class="when">{ends(s.expiry)}</p>
      {/if}
    </RotationCard>

    <RotationCard title={t('card.steelPath')} {...c.steelPath} {nowMs}>
      {#if c.steelPath.data}
        {@const sp = c.steelPath.data}
        {@const reward = sp.estimatedReward ?? sp.currentReward}
        <p class="lead">{reward.name}</p>
        <p class="sub">{t('teshin.cost', { cost: reward.cost })}</p>
        {#if sp.estimatedReward}
          <p class="sub">{t('teshin.estimatedNote', { name: sp.currentReward.name })}</p>
        {:else}
          <p class="when">{ends(sp.expiry)}</p>
        {/if}
      {/if}
    </RotationCard>

    <RotationCard title={t('card.dailyDeals')} {...c.dailyDeals} {nowMs}>
      {#each c.dailyDeals.data ?? [] as d, i (i)}
        <p class="lead">{d.item}</p>
        <p class="sub">
          {t('darvo.price', { sale: d.salePrice, original: d.originalPrice, discount: d.discount })}
        </p>
        <p class="sub">{t('darvo.stock', { sold: d.sold, total: d.total })}</p>
        <p class="when">{ends(d.expiry)}</p>
      {/each}
    </RotationCard>

    <RotationCard title={t('card.voidTrader')} {...c.voidTrader} {nowMs}>
      {#if c.voidTrader.data}
        {@const b = c.voidTrader.data}
        <p class="lead">{b.location}</p>
        {#if Date.parse(b.activation) > nowMs}
          <p class="when">
            {t('baro.arrives', { countdown: left(b.activation), ...at(b.activation) })}
          </p>
        {:else}
          <p class="when">{t('baro.leaves', { countdown: left(b.expiry), ...at(b.expiry) })}</p>
        {/if}
      {/if}
    </RotationCard>

    <RotationCard title={t('card.nightwave')} {...c.nightwave} {nowMs}>
      {#if c.nightwave.data}
        {@const nw = c.nightwave.data}
        {#if nw.season !== null}<p class="sub">
            {t('nightwave.season', { season: nw.season })}
          </p>{/if}
        {#each ['daily', 'weekly', 'elite'] as const as kind (kind)}
          {@const list = nw.challenges.filter((ch) => ch.kind === kind)}
          {#if list.length > 0}
            <p class="group">{t(`nightwave.${kind}`)}</p>
            <ul>
              {#each list as ch, i (i)}
                <li>
                  <span title={ch.description}>{ch.title}</span>
                  <span class="sub">{t('nightwave.reputation', { reputation: ch.reputation })}</span
                  >
                </li>
              {/each}
            </ul>
          {/if}
        {/each}
      {/if}
    </RotationCard>

    <RotationCard title={t('card.events')} {...c.events} {nowMs}>
      {#if c.events.data && c.events.data.length > 0}
        <ul>
          {#each c.events.data as e, i (i)}
            <li>
              <span title={e.description}>{e.name}</span>
              {#if e.node}<span class="sub">{e.node}</span>{/if}
              <span class="sub">{ends(e.expiry)}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="sub">{t('events.none')}</p>
      {/if}
    </RotationCard>

    <RotationCard title={t('card.arbitration')} {...c.arbitration} {nowMs}>
      {#if c.arbitration.data}
        {@const ar = c.arbitration.data}
        <p class="lead">
          {t('arbitration.line', { type: ar.missionType, node: ar.node, enemy: ar.enemy })}
        </p>
        <p class="when">{ends(ar.expiry)}</p>
      {/if}
    </RotationCard>
  {:else if failed}
    <p class="notice" role="alert">{t('rotations.loadError')}</p>
  {/if}
</aside>

<style>
  .rotations {
    display: grid;
    gap: 0.6rem;
    align-content: start;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--muted);
  }

  .notice {
    margin: 0;
    font-size: 0.85rem;
    color: var(--gold);
  }

  p {
    margin: 0;
  }

  .lead {
    font-weight: 600;
  }

  .sub,
  .when {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .when {
    font-variant-numeric: tabular-nums;
  }

  .group {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-top: 0.2rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.2rem;
  }

  li {
    display: grid;
  }

  .shard {
    margin-left: 0.4rem;
    vertical-align: 0.1em;
  }

  .shard.crimson {
    color: var(--shard-crimson);
  }

  .shard.amber {
    color: var(--shard-amber);
  }

  .shard.azure {
    color: var(--shard-azure);
  }
</style>
