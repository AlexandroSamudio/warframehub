<script lang="ts">
  import { t } from '../lib/i18n/index.ts';
  import { renderGuide } from '../lib/markdown.ts';

  /** A build's guide, rendered from its light Markdown (lib/markdown.ts). */
  interface Props {
    source: string;
  }

  let { source }: Props = $props();

  const html = $derived(renderGuide(source, t('part.opensNewTab')));
</script>

<!-- Escaped by renderGuide before any tag is added. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<div class="guide">{@html html}</div>

<style>
  .guide {
    max-width: 64ch;
  }

  /*
   * The guide's own headings are content, not the page's structure: Readout White in the
   * display face, quieter than the gold section titles around them.
   */
  .guide :global(h5),
  .guide :global(h6) {
    margin: 0.9rem 0 0.3rem;
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--fg);
  }

  .guide :global(h5) {
    font-size: 1.05rem;
  }

  .guide :global(h6) {
    font-size: 0.9rem;
    color: var(--muted);
  }

  .guide > :global(:first-child) {
    margin-top: 0;
  }

  .guide > :global(:last-child) {
    margin-bottom: 0;
  }

  .guide :global(p),
  .guide :global(ul),
  .guide :global(ol) {
    margin: 0 0 0.6rem;
  }

  .guide :global(ul),
  .guide :global(ol) {
    padding-left: 1.3rem;
  }

  .guide :global(li) {
    margin: 0.15rem 0;
  }

  .guide :global(a) {
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  .guide :global(code) {
    font-family: var(--font-body);
    font-size: 0.9em;
    padding: 0 0.25em;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
</style>
