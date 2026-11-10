<script lang="ts">
  /**
   * Small line icons drawn for WarframeHub (original SVG, one 1.5px stroke, square caps
   * to match the console's cut corners). Decorative: the control carries the label.
   */
  export type IconName = 'up' | 'down' | 'chevron' | 'plus' | 'refresh' | 'search';

  interface Props {
    name: IconName;
    size?: number;
  }

  let { name, size = 16 }: Props = $props();

  const PATHS: Record<IconName, string> = {
    up: 'M8 13V3M3.5 7.5 8 3l4.5 4.5',
    down: 'M8 3v10M3.5 8.5 8 13l4.5-4.5',
    chevron: 'M6 3.5 10.5 8 6 12.5',
    plus: 'M8 3v10M3 8h10',
    refresh: 'M13 8a5 5 0 1 1-1.46-3.54M13 2.5v3h-3',
    search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM10.5 10.5 14 14',
  };
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="square"
  stroke-linejoin="miter"
  aria-hidden="true"
  focusable="false"
>
  <path d={PATHS[name]} />
</svg>

<style>
  .icon {
    display: block;
    flex: none;
  }
</style>
