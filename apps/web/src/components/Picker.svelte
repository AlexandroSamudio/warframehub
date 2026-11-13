<script lang="ts" generics="T extends { uniqueName: string; name: string }">
  import { t } from '../lib/i18n/index.ts';
  import ModPic from './ModPic.svelte';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  /**
   * An inline search list (the ARIA combobox pattern): type to filter, arrows to move,
   * Enter to pick, Escape to close. Opens with focus in the field.
   */
  interface Props {
    id: string;
    /** The field's label ("Find a mod for Slot 3"). */
    label: string;
    /** What matches a query, best first. */
    choices: (query: string) => T[];
    /** One option's second line (polarity, effect, "from Rhino"). */
    detail?: Snippet<[T]>;
    /** One option's picture, when it has one (mods, arcanes, abilities). */
    image?: (item: T) => string | null;
    /** Art is cropped to fill; icons (arcanes, abilities) are kept whole. */
    imageFit?: 'cover' | 'contain';
    onPick: (item: T) => void;
    onClose: () => void;
  }

  let { id, label, choices, detail, image, imageFit = 'cover', onPick, onClose }: Props = $props();

  /** Enough to scan; typing narrows the rest. */
  const SHOWN = 40;
  let query = $state('');
  let active = $state(0);
  let field = $state<HTMLInputElement | null>(null);
  let list = $state<HTMLUListElement | null>(null);

  const all = $derived(choices(query));
  const shown = $derived(all.slice(0, SHOWN));

  onMount(() => field?.focus());

  function onInput() {
    active = 0;
  }

  function scrollTo(index: number) {
    list?.querySelector(`#${id}-opt-${index}`)?.scrollIntoView({ block: 'nearest' });
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (shown.length === 0) return;
      const by = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + by + shown.length) % shown.length;
      scrollTo(active);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = shown[active];
      if (item) onPick(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }
</script>

<div class="picker">
  <div class="field">
    <label for="{id}-q">{label}</label>
    <div class="row">
      <input
        id="{id}-q"
        type="text"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-expanded="true"
        aria-controls="{id}-list"
        aria-autocomplete="list"
        aria-activedescendant={shown.length > 0 ? `${id}-opt-${active}` : undefined}
        bind:this={field}
        bind:value={query}
        oninput={onInput}
        onkeydown={onKey}
      />
      <button type="button" onclick={onClose}>{t('build.close')}</button>
    </div>
  </div>
  <!-- The count updates on every key; only "nothing matches" is read out. -->
  <p class="count" aria-hidden={all.length > 0 ? 'true' : undefined}>
    {all.length > 0 ? t('build.matches', { count: all.length }) : ''}
  </p>
  <p class="count" role="status">
    {all.length === 0 ? t('build.noMatch', { query: query.trim() }) : ''}
  </p>
  <ul id="{id}-list" role="listbox" aria-label={label} bind:this={list}>
    {#each shown as item, i (item.uniqueName)}
      <!-- Picked with the mouse here; the keyboard uses the field (aria-activedescendant). -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id="{id}-opt-{i}"
        role="option"
        aria-selected={i === active}
        class:active={i === active}
        onclick={() => onPick(item)}
        onmousemove={() => (active = i)}
      >
        {#if image}<ModPic image={image(item)} size={36} fit={imageFit} />{/if}
        <span class="text">
          <span class="name">{item.name}</span>
          {#if detail}<span class="detail">{@render detail(item)}</span>{/if}
        </span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .picker {
    display: grid;
    gap: 0.35rem;
    padding: 0.6rem;
    background: var(--surface-2);
    border: 1px solid var(--teal);
  }

  label {
    display: block;
    font-size: 0.75rem;
    color: var(--muted);
    margin-bottom: 0.2rem;
  }

  .row {
    display: flex;
    gap: 0.4rem;
  }

  .row input {
    flex: 1;
    background: var(--surface);
  }

  .count {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 16rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-top: 1px solid var(--line);
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.4rem 0.5rem;
    cursor: pointer;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  li.active {
    background: color-mix(in srgb, var(--teal) 12%, transparent);
  }

  li.active .name {
    color: var(--teal);
  }

  .text {
    display: grid;
    gap: 0.05rem;
    min-width: 0;
  }

  .name {
    font-weight: 600;
  }

  .count:empty {
    display: none;
  }

  .detail {
    font-size: 0.8rem;
    color: var(--muted);
    white-space: pre-line;
  }
</style>
