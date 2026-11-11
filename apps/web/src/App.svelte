<script lang="ts">
  import type { HealthResponse } from '@warframehub/shared';
  import { onMount } from 'svelte';
  import { getHealth, heartbeat } from './lib/api.ts';
  import { t } from './lib/i18n/index.ts';
  import { hrefFor, router, type Route } from './lib/route.svelte.ts';
  import Goals from './routes/Goals.svelte';
  import Profile from './routes/Profile.svelte';
  import Settings from './routes/Settings.svelte';
  import Tracker from './routes/Tracker.svelte';

  let health = $state<HealthResponse | null>(null);
  let stopped = $state(false);

  const NAV: Route[] = ['tracker', 'goals', 'profile', 'settings'];
  // The server stops after a while with no open page; this tells it we're here (SPEC §9.2).
  const HEARTBEAT_MS = 60_000;

  onMount(() => {
    getHealth()
      .then((h) => (health = h))
      .catch(() => {
        // The Tracker shows its own "can't reach the API" message.
      });
    const timer = setInterval(() => {
      if (!stopped) void heartbeat().catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
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
    {#if !stopped}
      <nav aria-label={t('nav.label')}>
        {#each NAV as route (route)}
          <a href={hrefFor(route)} aria-current={router.route === route ? 'page' : undefined}>
            {t(`nav.${route}`)}
          </a>
        {/each}
      </nav>
    {/if}
  </header>

  <main>
    {#if stopped}
      <section class="stopped frame accent" role="status">
        <h2>{t('stopped.title')}</h2>
        <p>{t('stopped.body')}</p>
      </section>
    {:else if router.route === 'goals'}
      <Goals />
    {:else if router.route === 'profile'}
      <Profile />
    {:else if router.route === 'settings'}
      <Settings onStopped={() => (stopped = true)} />
    {:else}
      <Tracker />
    {/if}
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

  nav {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }

  nav a {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    text-decoration: none;
    padding: 0.3rem 0.7rem;
    border-bottom: 2px solid transparent;
  }

  nav a:hover {
    color: var(--fg);
  }

  nav a[aria-current='page'] {
    color: var(--gold);
    border-bottom-color: var(--gold);
  }

  .stopped {
    max-width: 36rem;
    padding: 1.2rem 1.4rem;
  }

  .stopped h2 {
    margin: 0 0 0.4rem;
    color: var(--gold);
  }

  .stopped p {
    margin: 0;
    color: var(--muted);
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
