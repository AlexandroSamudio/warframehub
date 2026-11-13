<script lang="ts">
  import { imageUrl } from '../lib/api.ts';

  /**
   * A mod or arcane picture (DE image, content not decoration) in a small cut-corner frame.
   * Always next to the name, so it's decorative for screen readers. A missing or failed
   * image leaves the empty frame at the same size.
   */
  interface Props {
    image: string | null;
    /** "small" in lists (picker options), "normal" on tiles. */
    size?: 'small' | 'normal';
  }

  let { image, size = 'normal' }: Props = $props();
  let failed = $state(false);
  const px = $derived(size === 'small' ? 28 : 36);
</script>

<span class="pic" class:small={size === 'small'}>
  {#if image && !failed}
    {#key image}
      <img
        src={imageUrl(image)}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        onerror={() => (failed = true)}
      />
    {/key}
  {/if}
</span>

<style>
  .pic {
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    border: 1px solid var(--line-strong);
    clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 0 100%);
    overflow: hidden;
  }

  .pic.small {
    width: 2.2rem;
    height: 2.2rem;
  }

  img {
    display: block;
    width: 2.25rem;
    height: 2.25rem;
    object-fit: cover;
  }

  .small img {
    width: 1.75rem;
    height: 1.75rem;
  }
</style>
