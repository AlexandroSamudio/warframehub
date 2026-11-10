<script lang="ts">
  import type { Freshness } from '@warframehub/shared';
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n/index.ts';
  import { formatCountdown } from '../lib/time.ts';

  interface Props {
    title: string;
    freshness: Freshness;
    fetchedAt: string | null;
    stale: boolean;
    nowMs: number;
    children?: Snippet;
  }

  let { title, freshness, fetchedAt, stale, nowMs, children }: Props = $props();

  /** Badge colour per freshness: Live green, Estimated teal, May be outdated gold. */
  const BADGE: Record<Freshness, string> = {
    live: 'ok',
    estimated: 'teal',
    outdated: 'gold',
    unavailable: '',
  };

  const headingId = $derived(`rot-${title.replace(/\W+/g, '-').toLowerCase()}`);
  const age = $derived(
    fetchedAt ? formatCountdown(Math.max(0, nowMs - Date.parse(fetchedAt))) : null,
  );
</script>

<section class="card frame accent accent-teal" aria-labelledby={headingId}>
  <header>
    <h3 id={headingId}>{title}</h3>
    <span class="badge {BADGE[freshness]}">{t(`freshness.${freshness}`)}</span>
  </header>

  {#if freshness !== 'unavailable' && children}
    <div class="body">{@render children()}</div>
  {/if}

  <p class="meta" class:stale>
    {#if age === null}
      {t('rotations.never')}
    {:else if stale}
      {t('rotations.stale', { age })}
    {:else}
      {t('rotations.fetched', { age })}
    {/if}
  </p>
</section>

<style>
  .card {
    --cut: 10px;
    padding: 0.75rem 0.95rem 0.7rem;
    display: grid;
    gap: 0.4rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
    line-height: 1.2;
    color: var(--teal);
  }

  .body {
    display: grid;
    gap: 0.3rem;
    font-size: 0.9rem;
  }

  .meta {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .meta.stale {
    color: var(--gold);
  }
</style>
