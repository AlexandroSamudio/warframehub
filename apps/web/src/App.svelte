<script lang="ts">
  import type { HealthResponse } from '@warframehub/shared';
  import { onMount } from 'svelte';
  import { getHealth } from './lib/api.ts';
  import { t } from './lib/i18n/index.ts';
  import Tracker from './routes/Tracker.svelte';

  let health = $state<HealthResponse | null>(null);

  onMount(() => {
    getHealth()
      .then((h) => (health = h))
      .catch(() => {
        // The Tracker shows its own "can't reach the API" message.
      });
  });
</script>

<div class="page">
  <header>
    <h1>{t('app.title')}</h1>
    <p class="tagline">{t('app.tagline')}</p>
  </header>

  <main>
    <Tracker />
  </main>

  {#if health}
    <footer>
      <span>{t('footer.version', { version: health.version })}</span>
      <span>{t('footer.dataDir', { path: health.dataDir })}</span>
    </footer>
  {/if}
</div>

<style>
  .page {
    max-width: 90rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 2rem;
    display: grid;
    gap: 1.25rem;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    flex-wrap: wrap;
  }

  h1 {
    margin: 0;
    font-size: 1.6rem;
    letter-spacing: 0.04em;
    color: var(--gold);
  }

  .tagline {
    margin: 0;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.8rem;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
