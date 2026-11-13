<script lang="ts">
  import { imageUrl } from '../lib/api.ts';

  /**
   * A DE picture (mod, arcane, shard, ability, weapon): content, not decoration, in a small
   * cut-corner frame on the inset colour. Always next to its name, so it's decorative for
   * screen readers. A missing or failed image leaves the empty frame at the same size.
   */
  interface Props {
    image: string | null;
    /** The frame's side in px (the picture fills most of it). */
    size?: number;
    /** "cover" crops art to fill; "contain" keeps icons and shards whole. */
    fit?: 'cover' | 'contain';
  }

  let { image, size = 44, fit = 'cover' }: Props = $props();
  let failed = $state(false);
  const inner = $derived(fit === 'cover' ? size - 2 : Math.round(size * 0.8));
</script>

<span class="pic" style:--size="{size}px" style:--cut="{Math.max(5, Math.round(size / 7))}px">
  {#if image && !failed}
    {#key image}
      <img
        src={imageUrl(image)}
        alt=""
        width={inner}
        height={inner}
        loading="lazy"
        class:contain={fit === 'contain'}
        onerror={() => (failed = true)}
      />
    {/key}
  {/if}
</span>

<style>
  .pic {
    flex: none;
    width: var(--size);
    height: var(--size);
    display: grid;
    place-items: center;
    background: var(--surface-2);
    border: 1px solid var(--line-strong);
    clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, 0 100%);
    overflow: hidden;
  }

  img {
    display: block;
    object-fit: cover;
  }

  img.contain {
    object-fit: contain;
  }
</style>
