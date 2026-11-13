<script lang="ts">
  import type { Language, SettingsResponse } from '@warframehub/shared';
  import { onMount } from 'svelte';
  import { getSettings, shutdown, updateSettings } from '../lib/api.ts';
  import { language, setLanguage, t } from '../lib/i18n/index.ts';

  /** Each language named in itself, so you can find yours whatever is on screen. */
  const LANGUAGES: { id: Language; name: string }[] = [
    { id: 'es', name: 'Español' },
    { id: 'en', name: 'English' },
  ];
  import { DISPLAY_TZ } from '../lib/time.ts';

  interface Props {
    /** Called once the server has accepted the Quit request. */
    onStopped: () => void;
  }

  let { onStopped }: Props = $props();

  let settings = $state<SettingsResponse | null>(null);
  let loadFailed = $state(false);
  let status = $state<string | null>(null);
  let confirmQuit = $state(false);
  let quitError = $state<string | null>(null);

  // Every IANA zone the browser knows; the server checks the choice again.
  const known: string[] =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  // Browsers list some zones under another name (Chrome has America/Buenos_Aires, not
  // America/Argentina/Buenos_Aires), so the default and the saved zone are always offered.
  const zones = $derived(
    [...new Set([...known, DISPLAY_TZ, ...(settings ? [settings.displayTz] : [])])].sort(),
  );

  let langStatus = $state<string | null>(null);

  /** Switches the whole app at once; the server keeps it for next time. */
  async function saveLanguage(next: Language) {
    const before = language.current;
    setLanguage(next);
    langStatus = null;
    try {
      settings = await updateSettings({ language: next });
      langStatus = t('settings.saved');
    } catch (error) {
      setLanguage(before);
      langStatus = t('settings.languageError', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function saveZone(e: Event) {
    const displayTz = (e.currentTarget as HTMLSelectElement).value;
    status = null;
    try {
      settings = await updateSettings({ displayTz });
      status = t('settings.saved');
    } catch (error) {
      status = t('settings.saveError', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function quit() {
    quitError = null;
    try {
      await shutdown();
      onStopped();
    } catch (error) {
      quitError = t('settings.quitError', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  onMount(() => {
    getSettings()
      .then((s) => (settings = s))
      .catch(() => (loadFailed = true));
  });
</script>

<section class="settings frame accent" aria-labelledby="settings-title">
  <h2 id="settings-title">{t('settings.title')}</h2>

  {#if settings}
    <dl>
      <dt id="lang-label">{t('settings.language')}</dt>
      <dd>
        <!-- A segmented radio group, in the version switch's style. -->
        <div class="switch" role="radiogroup" aria-labelledby="lang-label">
          {#each LANGUAGES as l (l.id)}
            <label class:on={language.current === l.id} lang={l.id}>
              <input
                type="radio"
                name="language"
                value={l.id}
                checked={language.current === l.id}
                onchange={() => saveLanguage(l.id)}
              />
              {l.name}
            </label>
          {/each}
        </div>
        <p class="hint">{t('settings.languageHint')}</p>
        {#if langStatus}<p class="status" role="status">{langStatus}</p>{/if}
      </dd>

      <dt><label for="tz">{t('settings.timeZone')}</label></dt>
      <dd>
        <select id="tz" value={settings.displayTz} onchange={saveZone}>
          {#each zones as zone (zone)}<option value={zone}>{zone.replaceAll('_', ' ')}</option
            >{/each}
        </select>
        <p class="hint">{t('settings.timeZoneHint')}</p>
        {#if status}<p class="status" role="status">{status}</p>{/if}
      </dd>

      <dt>{t('settings.dataDir')}</dt>
      <dd>
        <code>{settings.dataDir}</code>
        <p class="hint">{t('settings.dataDirHint')}</p>
      </dd>

      <dt>{t('settings.version')}</dt>
      <dd class="num">{settings.version}</dd>

      <dt>{t('settings.idle')}</dt>
      <dd>
        {settings.idleMinutes > 0
          ? t('settings.idleOn', { minutes: settings.idleMinutes })
          : t('settings.idleOff')}
      </dd>
    </dl>

    <div class="quit">
      {#if confirmQuit}
        <span>{t('settings.quitConfirm')}</span>
        <button type="button" class="danger" onclick={quit}>{t('settings.quitYes')}</button>
        <button type="button" onclick={() => (confirmQuit = false)}>{t('edit.no')}</button>
      {:else}
        <button type="button" class="danger" onclick={() => (confirmQuit = true)}>
          {t('settings.quit')}
        </button>
      {/if}
      <p class="hint">{t('settings.quitHint')}</p>
      {#if quitError}<p class="error" role="alert">{quitError}</p>{/if}
    </div>
  {:else if loadFailed}
    <p class="error" role="alert">{t('settings.loadError')}</p>
  {/if}
</section>

<style>
  .settings {
    max-width: 44rem;
    padding: 1.1rem 1.3rem 1.2rem;
    display: grid;
    gap: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.2rem; /* DESIGN.md headline */
    line-height: 1.2;
    color: var(--gold);
  }

  dl {
    display: grid;
    grid-template-columns: minmax(9rem, max-content) 1fr;
    gap: 0.9rem 1.5rem;
    margin: 0;
  }

  @media (max-width: 36rem) {
    dl {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }

    dd {
      margin-bottom: 0.8rem;
    }
  }

  dt {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--muted);
    padding-top: 0.2rem;
  }

  dd {
    margin: 0;
    min-width: 0;
  }

  select {
    width: 100%;
    max-width: 22rem;
  }

  code {
    font-size: 0.85rem;
    overflow-wrap: anywhere;
    color: var(--fg);
  }

  .hint {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .status {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--ok);
  }

  /* The language switch: the version switch's segmented look (DESIGN.md). */
  .switch {
    display: flex;
    flex-wrap: wrap;
  }

  .switch label {
    position: relative;
    padding: 0.3rem 0.9rem;
    border: 1px solid var(--line-strong);
    margin-left: -1px;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.04em;
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

  .quit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  .quit .hint {
    flex-basis: 100%;
  }

  .error {
    margin: 0;
    color: var(--bad);
  }
</style>
