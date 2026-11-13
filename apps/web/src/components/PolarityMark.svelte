<script lang="ts">
  import { hasPolaritySymbol } from '@warframehub/shared';
  import { polarityUrl } from '../lib/api.ts';
  import { polarityName } from '../lib/warframes.ts';

  /**
   * A polarity: DE's symbol (from the Warframe wiki) and its word. The wiki draws the
   * symbols in black, so the SVG is used as a mask and filled with a console colour; the
   * shape stays DE's. "Universal" and "aura" have no symbol and show the word only.
   */
  interface Props {
    polarity: string;
    /** Show the word next to the symbol (it's always there for screen readers). */
    showWord?: boolean;
  }

  let { polarity, showWord = true }: Props = $props();
  const symbol = $derived(hasPolaritySymbol(polarity));
</script>

<span class="polarity" title={polarityName(polarity)}>
  {#if symbol}
    <span class="symbol" style:--src="url({polarityUrl(polarity)})" aria-hidden="true"></span>
  {/if}
  <span class:sr-only={symbol && !showWord}>{polarityName(polarity)}</span>
</span>

<style>
  .polarity {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: var(--muted);
    white-space: nowrap;
  }

  .symbol {
    width: 0.95rem;
    height: 0.95rem;
    flex: none;
    background: currentColor;
    mask: var(--src) center / contain no-repeat;
  }
</style>
