<script lang="ts">
  import type { ResolvedSlot } from '@warframehub/shared';
  import { t } from '../lib/i18n/index.ts';
  import { polarityName } from '../lib/warframes.ts';
  import ModPic from './ModPic.svelte';

  interface Props {
    /** A mod or arcane in a build, or null for an empty slot. */
    slot: ResolvedSlot | null;
    /** Shown above it ("Aura", "Exilus"), or nothing for a normal slot. */
    label?: string;
  }

  let { slot, label }: Props = $props();
</script>

<li class="tile" class:empty={!slot}>
  {#if label}<span class="slot-label">{label}</span>{/if}
  {#if slot}
    <div class="head">
      <ModPic image={slot.image} />
      <div class="id">
        <span class="name">{slot.name}</span>
        <span class="meta">
          <span
            class="num"
            title={slot.maxRank !== null
              ? t('build.rankOf', { rank: slot.rank, max: slot.maxRank })
              : undefined}>{t('build.rank', { rank: slot.rank })}</span
          >{#if slot.polarity}<span>{` · ${polarityName(slot.polarity)}`}</span>{/if}
        </span>
      </div>
    </div>
    {#if slot.effect}
      <p class="effect">{slot.effect}</p>
    {:else if slot.maxRank === null}
      <p class="effect">{t('build.notInData')}</p>
    {/if}
    {#if slot.note}
      <p class="note"><span class="note-label">{t('build.note')}</span> {slot.note}</p>
    {/if}
  {:else}
    <span class="none">{t('build.empty')}</span>
  {/if}
</li>

<style>
  .tile {
    background: var(--surface);
    padding: 0.6rem 0.7rem 0.7rem;
    display: grid;
    align-content: start;
    gap: 0.35rem;
    min-width: 0;
  }

  .tile.empty {
    background: color-mix(in srgb, var(--surface) 60%, var(--bg));
  }

  .slot-label,
  .note-label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .slot-label {
    color: var(--muted);
  }

  .head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.55rem;
    align-items: center;
  }

  .id {
    display: grid;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .meta {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .meta .num {
    font-weight: 600;
  }

  .effect,
  .note {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .effect {
    color: var(--muted);
    white-space: pre-line;
  }

  .note-label {
    color: var(--gold);
    margin-right: 0.15rem;
  }

  .none {
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
