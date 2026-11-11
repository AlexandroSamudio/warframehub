<script lang="ts">
  import type { PartSource } from '@warframehub/shared';
  import { t } from '../lib/i18n/index.ts';
  import PartNote from './PartNote.svelte';

  interface Props {
    /** The saved note (Alex's own words win over the wiki). */
    note: string;
    /** Quest rewards the Warframe wiki names for this part. */
    sources: PartSource[];
    /** What the note is about (part and goal), added after the visible label for screen readers. */
    context: string;
    /** Say "Not in drop tables…" when there's neither a note nor a source. */
    showNoDrops?: boolean;
    onSave: (note: string) => Promise<boolean>;
  }

  let { note, sources, context, showNoDrops = false, onSave }: Props = $props();

  const hasSource = $derived(sources.length > 0);
  const labelText = $derived(
    !hasSource
      ? t('part.noteLabel')
      : note === ''
        ? t('part.noteLabelOwn')
        : t('part.noteLabelReplaces', { quests: sources.map((s) => s.title).join(', ') }),
  );
</script>

<div class="where">
  {#if note === ''}
    {#if hasSource}
      <p class="source">
        {#each sources as s, i (s.url)}
          {#if i > 0}<span class="sep">, </span>{/if}
          <span>{t('part.sourceQuest')}</span>
          <a href={s.url} target="_blank" rel="noopener noreferrer"
            >{s.title}<span class="sr-only"> {t('part.opensNewTab')}</span></a
          >
        {/each}
        <span class="from">· {t('part.sourceWiki')}</span>
      </p>
    {:else if showNoDrops}
      <p class="none">{t('farm.noDrops')}</p>
    {/if}
  {/if}
  <span class="note-label">{labelText}</span>
  <PartNote value={note} label={`${labelText} ${context}`} {onSave} />
</div>

<style>
  .where {
    display: grid;
    gap: 0.1rem;
  }

  .source,
  .none {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  a {
    display: inline-block;
    padding: 0.2rem 0;
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  .note-label {
    margin-top: 0.15rem;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
