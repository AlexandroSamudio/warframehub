<script lang="ts">
  import type { ProfileResponse } from '@warframehub/shared';
  import { onMount, tick } from 'svelte';
  import * as api from '../lib/api.ts';
  import { formatAmount } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
  import { formatUtc, formatWhen, hoursPlayed, intrinsicGroups } from '../lib/profile.ts';

  const ID_PATTERN = /^[0-9a-f]{24}$/i;

  let data = $state<ProfileResponse | null>(null);
  let loadFailed = $state(false);
  let busy = $state<'save' | 'refresh' | null>(null);
  let error = $state<string | null>(null);
  let idError = $state<string | null>(null);
  let editingId = $state(false);
  let confirmForget = $state(false);
  let now = $state(Date.now());

  let idInput = $state<HTMLInputElement | null>(null);
  let refreshButton = $state<HTMLButtonElement | null>(null);
  let changeButton = $state<HTMLButtonElement | null>(null);
  let forgetButton = $state<HTMLButtonElement | null>(null);
  let yesButton = $state<HTMLButtonElement | null>(null);

  const idField = $props.id();
  const showSetup = $derived(data !== null && (!data.accountSet || editingId));
  const locked = $derived(data?.nextRefreshAt != null && Date.parse(data.nextRefreshAt) > now);
  const groups = $derived(data?.profile ? intrinsicGroups(data.profile.intrinsics) : []);

  const when = (iso: string) => ({ local: formatWhen(iso), utc: formatUtc(iso) });

  async function saveId(e: SubmitEvent) {
    e.preventDefault();
    const value = idInput?.value.trim() ?? '';
    if (!ID_PATTERN.test(value)) {
      idError = t('profile.invalidId');
      idInput?.focus();
      return;
    }
    idError = null;
    error = null;
    busy = 'save';
    try {
      data = await api.setProfileAccount(value);
      if (idInput) idInput.value = '';
      editingId = false;
      await tick();
      refreshButton?.focus();
    } catch (err) {
      idError = t('profile.saveError', {
        message: err instanceof api.ApiCallError ? err.message : t('profile.unreachable'),
      });
    } finally {
      busy = null;
    }
  }

  async function refresh() {
    // The button stays focusable while locked (aria-disabled), so guard here instead.
    if (busy !== null || locked) return;
    error = null;
    busy = 'refresh';
    try {
      data = await api.refreshProfile();
    } catch (err) {
      error = t('profile.refreshError', {
        message: err instanceof api.ApiCallError ? err.message : t('profile.unreachable'),
      });
      // The wait may have started, or the old copy is still good: show what the server has.
      data = await api.getProfile().catch(() => data);
    } finally {
      busy = null;
      now = Date.now();
    }
  }

  async function forget() {
    error = null;
    try {
      data = await api.forgetProfile();
      confirmForget = false;
      editingId = false;
      await tick();
      idInput?.focus();
    } catch (err) {
      error = t('profile.saveError', {
        message: err instanceof api.ApiCallError ? err.message : t('profile.unreachable'),
      });
    }
  }

  async function askForget(ask: boolean) {
    confirmForget = ask;
    await tick();
    (ask ? yesButton : forgetButton)?.focus();
  }

  async function cancelChange() {
    editingId = false;
    idError = null;
    await tick();
    changeButton?.focus();
  }

  async function changeId() {
    editingId = true;
    idError = null;
    await tick();
    idInput?.focus();
  }

  onMount(() => {
    api
      .getProfile()
      .then((p) => (data = p))
      .catch(() => (loadFailed = true));
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });
</script>

<section class="profile frame accent" aria-labelledby="profile-title">
  <h2 id="profile-title">{t('profile.title')}</h2>

  {#if data}
    {#if showSetup}
      <p class="lead">{t('profile.intro')}</p>
      <form onsubmit={saveId} novalidate>
        <label for={idField}>{t('profile.idLabel')}</label>
        <div class="field">
          <input
            id={idField}
            bind:this={idInput}
            type="text"
            autocomplete="off"
            spellcheck="false"
            maxlength="40"
            class="num"
            aria-invalid={idError !== null}
            aria-describedby={idError ? `${idField}-hint ${idField}-error` : `${idField}-hint`}
          />
          <button type="submit" class="primary" disabled={busy === 'save'}>
            {t('profile.save')}
          </button>
          {#if editingId}
            <button type="button" onclick={cancelChange}>{t('profile.cancel')}</button>
          {/if}
        </div>
        <p class="hint" id={`${idField}-hint`}>{t('profile.idHint')}</p>
        <p class="error" id={`${idField}-error`} role="alert">{idError ?? ''}</p>
      </form>

      <div class="how">
        <h3>{t('profile.howTitle')}</h3>
        <ol>
          <li>{t('profile.how1')}</li>
          <li>
            {t('profile.how2')}
            <a
              href="https://www.warframe.com/api/user-data"
              target="_blank"
              rel="noopener noreferrer"
              >warframe.com/api/user-data<span class="sr-only"> {t('profile.opensNewTab')}</span></a
            >.
          </li>
          <li>{t('profile.how3')}</li>
        </ol>
        <p class="hint">{t('profile.privacy')}</p>
      </div>
    {:else}
      <div class="bar">
        <p class="when">
          {#if data.fetchedAt}
            {t('profile.updated', when(data.fetchedAt))}
          {:else}
            {t('profile.notFetched')}
          {/if}
        </p>
        <button
          type="button"
          class="primary"
          bind:this={refreshButton}
          aria-disabled={busy === 'refresh' || locked}
          onclick={refresh}
        >
          {t('profile.refresh')}
        </button>
      </div>
      <p class="hint" role="status">
        {#if busy === 'refresh'}
          {t('profile.refreshing')}
        {:else if locked && data.nextRefreshAt}
          {t('profile.nextRefresh', when(data.nextRefreshAt))}
        {:else}
          {t('profile.refreshHint')}
        {/if}
      </p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}

      {#if data.profile}
        <dl>
          <dt>{t('profile.name')}</dt>
          <dd>{data.profile.displayName}</dd>
          <dt>{t('profile.rank')}</dt>
          <dd class="num">{data.profile.masteryRank}</dd>
          <dt>{t('profile.items')}</dt>
          <dd class="num">{formatAmount(data.profile.items.length)}</dd>
          <dt>{t('profile.missions')}</dt>
          <dd class="num">{formatAmount(data.profile.missionsCompleted)}</dd>
          <dt>{t('profile.nodes')}</dt>
          <dd class="num">{formatAmount(data.profile.nodesCompleted)}</dd>
          <dt>{t('profile.time')}</dt>
          <dd class="num">
            {t('profile.hours', { hours: formatAmount(hoursPlayed(data.profile)) })}
          </dd>
        </dl>

        {#if groups.length > 0}
          <h3>{t('profile.intrinsics')}</h3>
          <dl class="intrinsics">
            {#each groups as group (group.id)}
              <dt>{t(`profile.${group.id}`)}</dt>
              <dd>
                <ul>
                  {#each group.rows as row (row.key)}
                    <li>
                      <span class="name">{t(row.key)}</span> <span class="num">{row.level}</span>
                    </li>
                  {/each}
                </ul>
              </dd>
            {/each}
          </dl>
        {/if}
      {/if}

      <div class="foot">
        {#if confirmForget}
          <span>{t('profile.forgetConfirm')}</span>
          <button type="button" class="danger" bind:this={yesButton} onclick={forget}>
            {t('profile.forgetYes')}
          </button>
          <button type="button" onclick={() => askForget(false)}>{t('profile.cancel')}</button>
        {:else}
          <button type="button" bind:this={changeButton} onclick={changeId}>
            {t('profile.changeId')}
          </button>
          <button
            type="button"
            class="danger"
            bind:this={forgetButton}
            onclick={() => askForget(true)}
          >
            {t('profile.forget')}
          </button>
        {/if}
      </div>
    {/if}

    {#if error && showSetup}<p class="error" role="alert">{error}</p>{/if}
  {:else if loadFailed}
    <p class="error" role="alert">{t('profile.loadError')}</p>
  {:else}
    <p class="hint" aria-live="polite">{t('profile.loading')}</p>
  {/if}
</section>

<style>
  .profile {
    max-width: 44rem;
    padding: 1.1rem 1.3rem 1.2rem;
    display: grid;
    gap: 0.9rem;
  }

  h2 {
    margin: 0;
    font-size: 1.2rem; /* DESIGN.md headline */
    line-height: 1.2;
    color: var(--gold);
  }

  h3 {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted);
  }

  .lead,
  .when {
    margin: 0;
  }

  form {
    display: grid;
    gap: 0.35rem;
  }

  label {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  .field {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  input {
    flex: 1 1 16rem;
    max-width: 24rem;
  }

  input[aria-invalid='true'] {
    border-color: var(--bad);
  }

  .how {
    display: grid;
    gap: 0.4rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
  }

  ol {
    margin: 0;
    padding-left: 1.2rem;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
  }

  dl {
    display: grid;
    grid-template-columns: minmax(9rem, max-content) 1fr;
    gap: 0.5rem 1.5rem;
    margin: 0;
  }

  @media (max-width: 36rem) {
    dl {
      grid-template-columns: 1fr;
      gap: 0.1rem;
    }

    dd {
      margin-bottom: 0.6rem;
    }
  }

  dt {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  dd {
    margin: 0;
    min-width: 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1.2rem;
  }

  li {
    white-space: nowrap;
  }

  .name {
    color: var(--muted);
  }

  /* Locked or busy: looks like the app's disabled buttons but keeps keyboard focus. */
  button[aria-disabled='true'] {
    opacity: 0.45;
    cursor: default;
    border-color: var(--gold);
    background: none;
  }

  a {
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .error {
    margin: 0;
    color: var(--bad);
  }

  .error:empty {
    display: none;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
  }
</style>
