<script lang="ts">
  import type { HealthResponse } from '@warframehub/shared';
  import { onMount } from 'svelte';
  import { getHealth } from './lib/api.ts';
  import { t } from './lib/i18n/index.ts';
  import { formatLocal, formatUtc } from './lib/time.ts';

  let health = $state<HealthResponse | null>(null);
  let failed = $state(false);

  async function check() {
    failed = false;
    health = null;
    try {
      health = await getHealth();
    } catch {
      failed = true;
    }
  }

  onMount(() => {
    void check();
  });
</script>

<main>
  <header>
    <h1>{t('app.title')}</h1>
    <p class="tagline">{t('app.tagline')}</p>
  </header>

  <section class="status" aria-live="polite">
    {#if health}
      <p class="ok"><span class="dot" aria-hidden="true"></span>{t('health.ok')}</p>
      <p class="detail">{t('health.version', { version: health.version })}</p>
      <p class="detail">
        {t('health.serverTime', {
          local: formatLocal(health.serverTime),
          utc: formatUtc(health.serverTime),
        })}
      </p>
      <p class="detail">{t('health.dataDir', { path: health.dataDir })}</p>
    {:else if failed}
      <p class="bad">{t('health.error')}</p>
      <button type="button" onclick={check}>{t('health.retry')}</button>
    {:else}
      <p class="detail">{t('health.checking')}</p>
    {/if}
  </section>
</main>

<style>
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 3rem 1rem;
    display: grid;
    gap: 1.5rem;
  }

  h1 {
    margin: 0;
    font-size: 2rem;
    letter-spacing: 0.04em;
    color: var(--gold);
  }

  .tagline {
    margin: 0.25rem 0 0;
    color: var(--muted);
  }

  .status {
    background: var(--surface);
    border: 1px solid var(--line);
    padding: 1rem 1.25rem;
    clip-path: polygon(
      0 0,
      calc(100% - 12px) 0,
      100% 12px,
      100% 100%,
      12px 100%,
      0 calc(100% - 12px)
    );
  }

  .status p {
    margin: 0.25rem 0;
  }

  .ok {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }

  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--ok);
  }

  .detail {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }

  .bad {
    color: var(--bad);
  }

  button {
    font: inherit;
    color: var(--fg);
    background: transparent;
    border: 1px solid var(--gold);
    padding: 0.3rem 0.9rem;
    cursor: pointer;
  }

  button:hover {
    background: color-mix(in srgb, var(--gold) 15%, transparent);
  }
</style>
