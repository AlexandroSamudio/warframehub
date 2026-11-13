<script lang="ts">
  import type { BuildView as Build } from '@warframehub/shared';
  import * as api from '../lib/api.ts';
  import { rememberedTab, rememberTab } from '../lib/builds.ts';
  import { t } from '../lib/i18n/index.ts';
  import { shift } from '../lib/reorder.ts';
  import { buildHref } from '../lib/route.svelte.ts';
  import BuildView from './BuildView.svelte';
  import Icon from './Icon.svelte';
  import ModPic from './ModPic.svelte';
  import ShardPic from './ShardPic.svelte';
  import { onMount, tick } from 'svelte';

  /** The Builds page of a Warframe (SPEC §14.1): your builds on the left, one open. */
  interface Props {
    slug: string;
    /** The build in the address (`…/builds/12`), or null for `…/builds`. */
    open: number | null;
    /** The version that owns the builds ("Mesa Prime"). */
    owner: string;
    /** Why the builds sit on that version, when it isn't obvious (Excalibur Umbra). */
    ownerNote: string | null;
    builds: Build[];
    abilityNames: Map<number, string>;
    /** The builds in their new order, after ↑/↓. */
    onReordered: (builds: Build[]) => void;
  }

  let { slug, open, owner, ownerNote, builds, abilityNames, onReordered }: Props = $props();

  // `…/builds/12` opens that build; `…/builds` the one opened last (or the first).
  const missing = $derived(open !== null && !builds.some((b) => b.id === open));
  const selected = $derived(
    open !== null
      ? (builds.find((b) => b.id === open) ?? null)
      : (builds.find((b) => b.id === rememberedTab(slug)) ?? builds[0] ?? null),
  );

  $effect(() => {
    if (selected) rememberTab(slug, selected.id);
  });

  const index = $derived(selected ? builds.findIndex((b) => b.id === selected.id) : -1);
  let moving = $state(false);
  let moveError = $state<string | null>(null);

  /**
   * What tells builds apart in the list: their arcanes, Helminth ability and shards (the
   * first mods are often the same Intensify, Flow…).
   */
  function marks(b: Build) {
    return {
      arcanes: b.arcanes.filter((a) => a !== null).map((a) => a.image),
      helminth: b.helminth?.image ?? null,
      shards: b.shards,
    };
  }

  // [ and ] open the previous and next build, unless you're typing somewhere.
  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '[' && event.key !== ']') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (!selected || builds.length < 2) return;
      const i = builds.findIndex((b) => b.id === selected.id);
      const next = builds[(i + (event.key === ']' ? 1 : -1) + builds.length) % builds.length]!;
      event.preventDefault();
      window.location.hash = buildHref(slug, { kind: 'view', id: next.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function move(by: -1 | 1, event: MouseEvent) {
    if (!selected || moving) return;
    const button = event.currentTarget as HTMLButtonElement;
    const ids = shift(
      builds.map((b) => b.id),
      selected.id,
      by,
    );
    if (!ids) return;
    moving = true;
    moveError = null;
    try {
      await api.reorderBuilds(slug, ids);
      onReordered(ids.map((id) => builds.find((b) => b.id === id)!));
      await tick();
      // At the new end the button disables itself: keep focus on its partner.
      const pair = button.parentElement?.querySelectorAll('button');
      (button.disabled ? [...(pair ?? [])].find((b) => !b.disabled) : button)?.focus();
    } catch (e) {
      moveError = t('build.moveError', {
        message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
      });
    } finally {
      moving = false;
    }
  }
</script>

{#if builds.length === 0}
  <!-- The tab already says "Builds": the empty state starts with what to do. -->
  <section class="empty frame accent" aria-label={t('build.title')}>
    <p>{t('build.none')}</p>
    {#if ownerNote}<p class="muted">{ownerNote}</p>{/if}
    <a class="cta" href={buildHref(slug, { kind: 'new' })}
      ><Icon name="plus" size={14} /><span>{t('build.add')}</span></a
    >
  </section>
{:else}
  <div class="builds-page">
    <nav class="list frame accent" aria-label={t('build.tabs', { name: owner })}>
      <h3 class="sr-only">{t('build.list')}</h3>
      <ul>
        {#each builds as b (b.id)}
          {@const on = b.id === selected?.id}
          {@const m = marks(b)}
          <li>
            <a
              class="entry"
              class:on
              href={buildHref(slug, { kind: 'view', id: b.id })}
              aria-current={on ? 'page' : undefined}
            >
              <span class="entry-name">{b.name}</span>
              <!-- The open build shows its description in full beside the list. -->
              {#if b.content.description && !on}
                <span class="entry-desc">{b.content.description}</span>
              {/if}
              {#if b.content.author || b.content.patch}
                <span class="entry-meta"
                  >{[b.content.author, b.content.patch].filter(Boolean).join(' · ')}</span
                >
              {/if}
              {#if m.arcanes.length > 0 || m.helminth || m.shards.length > 0}
                <span class="marks" aria-hidden="true">
                  {#each m.arcanes as img, i (i)}<ModPic
                      image={img}
                      size={26}
                      fit="contain"
                    />{/each}
                  {#if m.helminth}<ModPic image={m.helminth} size={26} fit="contain" />{/if}
                  {#each m.shards as s, i (i)}<ShardPic
                      color={s.color}
                      tauforged={s.tauforged}
                      size={20}
                    />{/each}
                </span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
      <div class="list-foot">
        {#if builds.length > 1 && selected}
          <span class="order">
            <span class="order-label" aria-hidden="true">{t('build.move')}</span>
            <button
              type="button"
              class="icon"
              disabled={index <= 0 || moving}
              aria-label={t('build.moveEarlier', { name: selected.name })}
              onclick={(e) => move(-1, e)}><Icon name="up" /></button
            >
            <button
              type="button"
              class="icon"
              disabled={index >= builds.length - 1 || moving}
              aria-label={t('build.moveLater', { name: selected.name })}
              onclick={(e) => move(1, e)}><Icon name="down" /></button
            >
          </span>
        {/if}
        <a class="add" href={buildHref(slug, { kind: 'new' })}
          ><Icon name="plus" size={14} /><span>{t('build.add')}</span></a
        >
      </div>
      {#if moveError}<p class="error" role="alert">{moveError}</p>{/if}
      {#if builds.length > 1}<p class="hint">{t('build.keysHint')}</p>{/if}
    </nav>

    <div class="open">
      {#if missing}
        <p class="alert frame" role="alert">{t('build.notFoundHere', { id: open ?? '' })}</p>
      {:else if selected}
        {#key selected.id}
          <BuildView {slug} build={selected} {abilityNames} />
        {/key}
      {/if}
    </div>
  </div>
{/if}

<style>
  .builds-page {
    display: grid;
    grid-template-columns: 17rem minmax(0, 1fr);
    align-items: start;
    gap: 1rem;
  }

  a {
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .list {
    padding: 0.8rem 0.7rem 0.75rem;
    display: grid;
    gap: 0.6rem;
    position: sticky;
    top: 1rem;
  }

  .list ul {
    display: grid;
    gap: 0.35rem;
  }

  .entry {
    display: grid;
    gap: 0.25rem;
    padding: 0.55rem 0.65rem 0.6rem;
    border: 1px solid transparent;
    color: var(--fg);
    text-decoration: none;
  }

  .entry:hover {
    border-color: var(--line-strong);
  }

  /* The open build: gold seam and a gold tint, like the version switch's choice. */
  .entry.on {
    border-color: var(--gold);
    background: color-mix(in srgb, var(--gold) 10%, transparent);
  }

  .entry-name {
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .entry.on .entry-name {
    color: var(--gold);
  }

  .entry-meta {
    font-size: 0.8rem;
    color: var(--muted);
  }

  /* The build's description, one line: what it's for, before you open it. */
  .entry-desc {
    font-size: 0.85rem;
    line-height: 1.35;
    color: var(--fg);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    overflow: hidden;
  }

  .marks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.15rem;
  }

  .list-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.4rem 0.2rem 0;
    border-top: 1px solid var(--line);
  }

  .order {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .order-label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-right: 0.15rem;
  }

  .order .icon {
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    padding: 0;
  }

  .add {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0;
    margin-left: auto;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .add:hover span {
    text-decoration: underline;
  }

  .error,
  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .error {
    color: var(--bad);
  }

  .open {
    min-width: 0;
  }

  .empty {
    padding: 1.1rem 1.2rem 1.2rem;
    display: grid;
    gap: 0.6rem;
    justify-items: start;
  }

  .empty p {
    margin: 0;
  }

  .muted {
    color: var(--muted);
    font-size: 0.9rem;
  }

  /* The empty state's one action: a teal outline button, like the console's Add buttons. */
  .cta {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.2rem;
    padding: 0.3rem 0.9rem;
    border: 1px solid var(--teal);
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .cta:hover {
    background: color-mix(in srgb, var(--teal) 12%, transparent);
  }

  .alert {
    --frame-line: var(--bad);
    margin: 0;
    padding: 0.7rem 0.9rem;
    color: var(--bad);
  }

  /* Under 60rem the list becomes a wrapping row of compact entries above the build. */
  @media (max-width: 60rem) {
    .builds-page {
      grid-template-columns: minmax(0, 1fr);
    }

    .list {
      position: static;
    }

    .list ul {
      grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    }

    .hint {
      display: none;
    }
  }
</style>
