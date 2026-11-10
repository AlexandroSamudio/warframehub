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
    <!-- Original mark: nested diamonds. Not a DE logo. -->
    <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2 30 16 16 30 2 16Z" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M16 9 23 16 16 23 9 16Z" fill="currentColor" opacity="0.85" />
      <path d="M16 2v5M16 25v5M2 16h5M25 16h5" stroke="currentColor" stroke-width="1.5" />
    </svg>
    <h1>{t('app.title')}</h1>
    <p class="tagline eyebrow">{t('app.tagline')}</p>
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
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .mark {
    width: 1.9rem;
    height: 1.9rem;
    color: var(--gold);
    flex: none;
  }

  h1 {
    margin: 0;
    font-size: 1.9rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .tagline {
    margin: 0;
    padding-left: 0.75rem;
    border-left: 1px solid var(--line-strong);
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    font-size: 0.8rem;
    color: var(--muted);
    padding-top: 0.8rem;
    border-top: 1px solid var(--line);
  }
</style>
