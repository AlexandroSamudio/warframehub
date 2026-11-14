<script lang="ts">
  import type { ResolvedSlot } from '@warframehub/shared';
  import { imageUrl } from '../lib/api.ts';
  import { t } from '../lib/i18n/index.ts';
  import PolarityMark from './PolarityMark.svelte';

  /**
   * A mod on the Builds page (SPEC §14.1): its art leads (a wide crop in a cut-corner
   * frame), then the name and rank, the polarity, the effect at that rank and the note.
   * An empty slot keeps its place as an outline of the same height.
   */
  interface Props {
    slot: ResolvedSlot | null;
    /** "Aura", "Exilus", or nothing for a normal slot. */
    label?: string;
  }

  let { slot, label }: Props = $props();
  let failed = $state(false);
</script>

<li class="card" class:empty={!slot}>
  <div class="art">
    {#if slot?.image && !failed}
      {#key slot.image}
        <!-- The name is right under it, so the art is decorative for screen readers. -->
        <img
          src={imageUrl(slot.image)}
          alt=""
          width="256"
          height="128"
          loading="lazy"
          onerror={() => (failed = true)}
        />
      {/key}
    {/if}
    {#if label}<span class="slot-label">{label}</span>{/if}
  </div>
  <div class="body">
    {#if slot}
      <div class="title">
        <span class="name">{slot.name}</span>
        <!-- "R5/5": whether a mod is maxed shows at a glance; read out as "Rank 5 of 5". -->
        <span class="rank num"
          >{#if slot.maxRank !== null}<span aria-hidden="true"
              >{t('build.rankOfShort', { rank: slot.rank, max: slot.maxRank })}</span
            ><span class="sr-only">{t('build.rankOf', { rank: slot.rank, max: slot.maxRank })}</span
            >{:else}{t('build.rank', { rank: slot.rank })}{/if}</span
        >
      </div>
      {#if slot.polarity}<PolarityMark polarity={slot.polarity} />{/if}
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
  </div>
</li>

<style>
  .card {
    display: grid;
    grid-template-rows: auto 1fr;
    min-width: 0;
    background: var(--surface);
  }

  /* The art: a wide crop of the mod picture, cut on the top-right like the console's frames. */
  .art {
    position: relative;
    height: 5.5rem;
    background: var(--surface-2);
    border-bottom: 1px solid var(--line);
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
    overflow: hidden;
  }

  .art img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 30%;
  }

  /* "Aura" / "Exilus" sit on a solid panel-coloured tab over the art, never on the picture. */
  .slot-label {
    position: absolute;
    left: 0;
    top: 0;
    padding: 0.1rem 0.5rem;
    background: var(--surface);
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .body {
    display: grid;
    align-content: start;
    gap: 0.3rem;
    padding: 0.55rem 0.7rem 0.75rem;
  }

  /*
   * The rank always sits under the name, the same spot on every card, so the grid reads
   * at a glance and long Spanish names keep the full width to stay whole words.
   */
  .title {
    display: grid;
    gap: 0.1rem;
  }

  .name {
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: break-word;
    hyphens: auto;
  }

  .rank {
    flex: none;
    font-size: 0.85rem;
    color: var(--gold);
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
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--gold);
    margin-right: 0.15rem;
  }

  .card.empty {
    background: color-mix(in srgb, var(--surface) 55%, var(--bg));
  }

  .card.empty .art {
    background: transparent;
  }

  .none {
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
