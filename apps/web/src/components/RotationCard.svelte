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

  const headingId = $derived(`rot-${title.replace(/\W+/g, '-').toLowerCase()}`);
  const age = $derived(
    fetchedAt ? formatCountdown(Math.max(0, nowMs - Date.parse(fetchedAt))) : null,
  );
</script>

<section class="card" aria-labelledby={headingId}>
  <header>
    <h3 id={headingId}>{title}</h3>
    <span class="badge {freshness}">{t(`freshness.${freshness}`)}</span>
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
    background: var(--surface);
    border: 1px solid var(--line);
    border-left: 2px solid var(--teal);
    padding: 0.7rem 0.9rem;
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
    font-size: 0.95rem;
    color: var(--teal);
    letter-spacing: 0.03em;
  }

  .badge {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0 0.35rem;
    border: 1px solid currentColor;
    white-space: nowrap;
  }

  .badge.live {
    color: var(--ok);
  }

  .badge.estimated {
    color: var(--teal);
  }

  .badge.outdated {
    color: var(--gold);
  }

  .badge.unavailable {
    color: var(--muted);
  }

  .body {
    display: grid;
    gap: 0.3rem;
    font-size: 0.9rem;
  }

  .meta {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--muted);
  }

  .meta.stale {
    color: var(--gold);
  }
</style>
