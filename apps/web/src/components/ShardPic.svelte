<script lang="ts">
  import { SHARD_IMAGES, type ShardColor } from '@warframehub/shared';
  import { imageUrl } from '../lib/api.ts';

  /**
   * An Archon Shard picture. The data's Tauforged picture ("…MythicGlow.png") is only the
   * glow, so a Tauforged shard is the normal shard with that glow laid over it, as in the
   * game. Both are DE's images, unaltered; next to their text, so decorative here.
   */
  interface Props {
    color: ShardColor;
    tauforged?: boolean;
    /** The frame's side in px. */
    size?: number;
  }

  let { color, tauforged = false, size = 40 }: Props = $props();
  const images = $derived(SHARD_IMAGES[color]);
  const inner = $derived(Math.round(size * 0.82));
</script>

<span class="shard" style:--size="{size}px" style:--cut="{Math.max(5, Math.round(size / 7))}px">
  <img src={imageUrl(images.normal)} alt="" width={inner} height={inner} loading="lazy" />
  {#if tauforged}
    <img
      class="glow"
      src={imageUrl(images.tauforged)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
    />
  {/if}
</span>

<style>
  .shard {
    position: relative;
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
    object-fit: contain;
  }

  .glow {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
