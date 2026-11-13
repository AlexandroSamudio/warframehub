<script lang="ts">
  import {
    MAX_BUILD_WEAPONS,
    SHARD_SLOTS,
    type ArcaneOption,
    type BuildContent,
    type BuildOptionsResponse,
    type BuildSlot,
    type HelminthOption,
    type ItemSearchResult,
    type ModOption,
  } from '@warframehub/shared';
  import Guide from '../components/Guide.svelte';
  import Icon from '../components/Icon.svelte';
  import ModPic from '../components/ModPic.svelte';
  import Picker from '../components/Picker.svelte';
  import * as api from '../lib/api.ts';
  import {
    arcaneChoices,
    emptyContent,
    modChoices,
    rememberTab,
    searchByName,
    shardGroups,
    type SlotKind,
  } from '../lib/builds.ts';
  import { t } from '../lib/i18n/index.ts';
  import { hrefFor, leave, setLeaveGuard, type BuildSub } from '../lib/route.svelte.ts';
  import { polarityName } from '../lib/warframes.ts';
  import { tick } from 'svelte';

  interface Props {
    slug: string;
    sub: BuildSub;
  }

  let { slug, sub }: Props = $props();

  let options = $state<BuildOptionsResponse | null>(null);
  let loadError = $state<string | null>(null);
  let notFound = $state(false);
  let name = $state('');
  let content = $state<BuildContent>(emptyContent());
  let savedName = $state('');

  let open = $state<string | null>(null); // the picker that's open, by slot key
  let preview = $state(false);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let confirmDelete = $state(false);
  let deleting = $state(false);

  let titleEl = $state<HTMLHeadingElement | null>(null);
  let errorEl = $state<HTMLParagraphElement | null>(null);
  let deleteYes = $state<HTMLButtonElement | null>(null);
  let deleteButton = $state<HTMLButtonElement | null>(null);

  // ---- unsaved changes ----------------------------------------------------------------

  /** The build as loaded or last saved, to tell whether anything changed. */
  let saved = $state('');
  const current = $derived(JSON.stringify({ name, content }));
  const dirty = $derived(options !== null && current !== saved);
  /** Where the user tried to go while there were changes. */
  let leaving = $state<string | null>(null);
  let keepButton = $state<HTMLButtonElement | null>(null);

  $effect(() => {
    if (!dirty) {
      setLeaveGuard(null);
      return;
    }
    setLeaveGuard((hash) => {
      leaving = hash;
      void tick().then(() => keepButton?.focus());
      return false;
    });
    // Closing the tab or reloading: the browser's own warning (no custom text allowed).
    const onUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener('beforeunload', onUnload);
    };
  });

  function keepEditing() {
    leaving = null;
    titleEl?.focus();
  }

  const mods = $derived(new Map(options?.mods.map((m) => [m.uniqueName, m]) ?? []));
  const arcanes = $derived(new Map(options?.arcanes.map((a) => [a.uniqueName, a]) ?? []));
  const back = $derived(hrefFor('warframes', slug));
  const ownerName = $derived(options?.buildsVariant ?? '');

  async function load() {
    options = null;
    loadError = null;
    notFound = false;
    try {
      const [o, build] = await Promise.all([
        api.getBuildOptions(slug),
        sub.kind === 'edit' ? api.getBuild(sub.id) : Promise.resolve(null),
      ]);
      if (build && build.slug !== slug) {
        notFound = true;
        return;
      }
      name = build?.name ?? '';
      savedName = build?.name ?? '';
      content = build ? structuredClone(build.content) : emptyContent();
      saved = JSON.stringify({ name, content });
      leaving = null;
      options = o;
      await tick();
      titleEl?.focus();
    } catch (e) {
      if (e instanceof api.ApiCallError && e.status === 404) notFound = true;
      else
        loadError = t('build.loadError', {
          message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
        });
    }
  }

  $effect(() => {
    void slug;
    void sub;
    void load();
  });

  // ---- mod and arcane slots ---------------------------------------------------------

  type SlotKey = 'aura' | 'exilus' | `slot-${number}` | `arcane-${number}`;

  function getSlot(key: SlotKey): BuildSlot | null {
    if (key === 'aura' || key === 'exilus') return content[key];
    const [kind, i] = key.split('-') as ['slot' | 'arcane', string];
    return (kind === 'slot' ? content.slots : content.arcanes)[Number(i)] ?? null;
  }

  function setSlot(key: SlotKey, value: BuildSlot | null) {
    if (key === 'aura' || key === 'exilus') content[key] = value;
    else {
      const [kind, i] = key.split('-') as ['slot' | 'arcane', string];
      (kind === 'slot' ? content.slots : content.arcanes)[Number(i)] = value;
    }
  }

  function usedMods(except: SlotKey): Set<string> {
    const keys: SlotKey[] = [
      'aura',
      'exilus',
      ...content.slots.map((_, i) => `slot-${i}` as const),
    ];
    return new Set(
      keys
        .filter((k) => k !== except)
        .map((k) => getSlot(k)?.uniqueName)
        .filter((u): u is string => !!u),
    );
  }

  function usedArcanes(except: SlotKey): Set<string> {
    return new Set(
      content.arcanes
        .map((a, i) => (`arcane-${i}` === except ? null : a?.uniqueName))
        .filter((u): u is string => !!u),
    );
  }

  async function closePicker(key: string) {
    open = null;
    await tick();
    document.getElementById(`pick-${key}`)?.focus();
  }

  /** The next empty slot of the same kind after `key`, so entering a build flows on. */
  function nextEmpty(key: SlotKey): SlotKey | null {
    const order: SlotKey[] = key.startsWith('arcane')
      ? content.arcanes.map((_, i) => `arcane-${i}` as const)
      : ['aura', 'exilus', ...content.slots.map((_, i) => `slot-${i}` as const)];
    const after = order.slice(order.indexOf(key) + 1);
    return after.find((k) => getSlot(k) === null) ?? null;
  }

  async function pick(key: SlotKey, item: ModOption | ArcaneOption) {
    const before = getSlot(key);
    setSlot(key, {
      uniqueName: item.uniqueName,
      name: item.name,
      rank: item.maxRank,
      note: before?.note ?? '',
    });
    // A new mod in an empty slot: go on to the next empty one. A change: stay here.
    const next = before ? null : nextEmpty(key);
    await closePicker(next ?? key);
  }

  async function removeSlot(key: SlotKey) {
    setSlot(key, null);
    await tick();
    document.getElementById(`pick-${key}`)?.focus();
  }

  function effectAt(key: SlotKey, slot: BuildSlot): string | null {
    const data = key.startsWith('arcane')
      ? arcanes.get(slot.uniqueName)
      : mods.get(slot.uniqueName);
    return data ? (data.effects[Math.min(slot.rank, data.effects.length - 1)] ?? null) : null;
  }

  function imageOf(key: SlotKey, slot: BuildSlot): string | null {
    const data = key.startsWith('arcane')
      ? arcanes.get(slot.uniqueName)
      : mods.get(slot.uniqueName);
    return data?.image ?? null;
  }

  function maxRankOf(key: SlotKey, slot: BuildSlot): number {
    const data = key.startsWith('arcane')
      ? arcanes.get(slot.uniqueName)
      : mods.get(slot.uniqueName);
    return data?.maxRank ?? slot.rank;
  }

  function slotLabel(key: SlotKey): string {
    if (key === 'aura') return t('build.aura');
    if (key === 'exilus') return t('build.exilus');
    const [kind, i] = key.split('-');
    return kind === 'slot'
      ? t('build.slotN', { n: Number(i) + 1 })
      : t('build.arcaneN', { n: Number(i) + 1 });
  }

  // ---- shards, Helminth, weapons ------------------------------------------------------

  const groups = shardGroups();

  function addShard() {
    content.shards.push({ stat: groups[0]!.stats[0]!.key, tauforged: false, note: '' });
  }

  async function removeShard(i: number) {
    content.shards.splice(i, 1);
    await tick();
    document.getElementById('add-shard')?.focus();
  }

  async function pickHelminth(item: HelminthOption) {
    content.helminth = {
      replacesKey: content.helminth?.replacesKey ?? 1,
      uniqueName: item.uniqueName,
      name: item.name,
      note: content.helminth?.note ?? '',
    };
    await closePicker('helminth');
  }

  async function removeHelminth() {
    content.helminth = null;
    await tick();
    document.getElementById('pick-helminth')?.focus();
  }

  let weaponQuery = $state('');
  let weaponResults = $state<ItemSearchResult[]>([]);
  let weaponSearching = $state(false);
  let weaponError = $state<string | null>(null);
  let weaponTimer: ReturnType<typeof setTimeout> | undefined;
  let weaponController: AbortController | undefined;

  function onWeaponInput() {
    clearTimeout(weaponTimer);
    weaponController?.abort();
    weaponError = null;
    const q = weaponQuery.trim();
    if (q.length < 2) {
      weaponResults = [];
      weaponSearching = false;
      return;
    }
    weaponSearching = true;
    weaponTimer = setTimeout(async () => {
      weaponController = new AbortController();
      const signal = weaponController.signal;
      try {
        const res = await api.searchItems(q, signal);
        if (!signal.aborted) weaponResults = res.results.filter((r) => r.category !== 'warframe');
      } catch (e) {
        if (signal.aborted) return;
        weaponResults = [];
        weaponError = t('build.weaponSearchError', {
          message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
        });
      } finally {
        if (!signal.aborted) weaponSearching = false;
      }
    }, 400);
  }

  function addWeapon(item: ItemSearchResult) {
    if (content.weapons.some((w) => w.uniqueName === item.uniqueName)) return;
    content.weapons.push({ uniqueName: item.uniqueName, name: item.name, note: '' });
  }

  async function removeWeapon(i: number) {
    content.weapons.splice(i, 1);
    await tick();
    document.getElementById('weapon-q')?.focus();
  }

  // ---- save and delete ----------------------------------------------------------------

  async function showError(message: string) {
    saveError = message;
    await tick();
    errorEl?.focus();
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    if (name.trim() === '') {
      await showError(t('build.nameNeeded'));
      document.getElementById('build-name')?.focus();
      return;
    }
    saving = true;
    saveError = null;
    try {
      const build =
        sub.kind === 'edit'
          ? await api.updateBuild(sub.id, name, $state.snapshot(content))
          : await api.createBuild(slug, name, $state.snapshot(content));
      rememberTab(slug, build.id);
      saved = current;
      leave(back);
    } catch (e) {
      await showError(
        t('build.saveError', {
          message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
        }),
      );
    } finally {
      saving = false;
    }
  }

  async function askDelete() {
    confirmDelete = true;
    await tick();
    deleteYes?.focus();
  }

  async function cancelDelete() {
    confirmDelete = false;
    await tick();
    deleteButton?.focus();
  }

  async function doDelete() {
    if (sub.kind !== 'edit' || deleting) return;
    deleting = true;
    try {
      await api.deleteBuild(sub.id);
      leave(back);
    } catch (e) {
      confirmDelete = false;
      await showError(
        t('build.deleteError', {
          message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
        }),
      );
    } finally {
      deleting = false;
    }
  }
</script>

{#snippet modDetail(m: ModOption)}{m.polarity ? polarityName(m.polarity) + ' · ' : ''}{m.effects.at(
    -1,
  ) ?? ''}{/snippet}
{#snippet arcaneDetail(a: ArcaneOption)}{a.effects.at(-1) ?? ''}{/snippet}
{#snippet helminthDetail(h: HelminthOption)}{t('build.helminthFrom', { from: h.from })}{/snippet}

{#snippet slotEditor(key: SlotKey, kind: SlotKind | 'arcane')}
  {@const slot = getSlot(key)}
  <li class="cell">
    <span class="cell-label">{slotLabel(key)}</span>
    {#if open === key}
      {#if kind === 'arcane'}
        <Picker
          id="picker-{key}"
          label={t('build.searchArcanes', { slot: slotLabel(key) })}
          choices={(q) => arcaneChoices(options?.arcanes ?? [], usedArcanes(key), q)}
          detail={arcaneDetail}
          image={(a) => a.image}
          onPick={(item) => pick(key, item)}
          onClose={() => closePicker(key)}
        />
      {:else}
        <Picker
          id="picker-{key}"
          label={t('build.searchMods', { slot: slotLabel(key) })}
          choices={(q) => modChoices(options?.mods ?? [], kind, usedMods(key), q)}
          detail={modDetail}
          image={(m) => m.image}
          onPick={(item) => pick(key, item)}
          onClose={() => closePicker(key)}
        />
      {/if}
    {:else if slot}
      <div class="chosen">
        <ModPic image={imageOf(key, slot)} />
        <span class="chosen-name">{slot.name}</span>
        <label class="rank">
          <span class="sr-only">{t('build.rankLabel', { name: slot.name })}</span>
          <select bind:value={slot.rank}>
            {#each Array.from({ length: maxRankOf(key, slot) + 1 }, (_, r) => r) as r (r)}
              <option value={r}>{t('build.rank', { rank: r })}</option>
            {/each}
          </select>
        </label>
      </div>
      {@const effect = effectAt(key, slot)}
      {#if effect}<p class="effect">{effect}</p>{/if}
      <label class="note">
        <span class="sr-only">{t('build.noteLabel', { name: slot.name })}</span>
        <input
          type="text"
          maxlength="500"
          placeholder={t('build.notePlaceholder')}
          bind:value={slot.note}
        />
      </label>
      <div class="cell-actions">
        <button type="button" id="pick-{key}" onclick={() => (open = key)}
          >{t('build.change')}<span class="sr-only"> {slot.name}</span></button
        >
        <button type="button" onclick={() => removeSlot(key)}
          >{t('build.remove')}<span class="sr-only"> {slot.name}</span></button
        >
      </div>
    {:else}
      <button type="button" class="teal choose" id="pick-{key}" onclick={() => (open = key)}
        >{kind === 'arcane' ? t('build.chooseArcane') : t('build.chooseMod')}<span class="sr-only">
          ({slotLabel(key)})</span
        ></button
      >
    {/if}
  </li>
{/snippet}

<div class="page">
  <a class="back" href={back}>
    <span class="flip"><Icon name="chevron" size={12} /></span>
    {t('build.backTo', { name: ownerName || slug })}
  </a>

  {#if options}
    {#if leaving !== null}
      <div class="leave-bar" role="group" aria-labelledby="leave-q">
        <span id="leave-q">{t('build.leaveQuestion')}</span>
        <button
          type="button"
          class="primary"
          bind:this={keepButton}
          aria-describedby="leave-q"
          onclick={keepEditing}>{t('build.keepEditing')}</button
        >
        <button type="button" class="danger" onclick={() => leave(leaving ?? back)}
          >{t('build.leaveAnyway')}</button
        >
      </div>
    {/if}
    <form onsubmit={save} novalidate>
      <h2 tabindex="-1" bind:this={titleEl}>
        {sub.kind === 'edit'
          ? t('build.editTitle', { name: savedName })
          : t('build.newTitle', { name: ownerName })}
      </h2>

      {#if saveError}
        <p class="alert frame" role="alert" tabindex="-1" bind:this={errorEl}>{saveError}</p>
      {/if}

      <section class="panel frame accent" aria-labelledby="b-about">
        <h3 id="b-about">{t('build.about')}</h3>
        <div class="fields">
          <label class="wide">
            <span>{t('build.name')}</span>
            <input
              id="build-name"
              type="text"
              required
              maxlength="60"
              placeholder={t('build.namePlaceholder')}
              aria-invalid={saveError === t('build.nameNeeded') ? 'true' : undefined}
              bind:value={name}
            />
          </label>
          <label class="wide">
            <span>{t('build.source')} <i>{t('build.optional')}</i></span>
            <input
              type="url"
              maxlength="500"
              placeholder="https://overframe.gg/build/…"
              bind:value={content.sourceUrl}
            />
          </label>
          <label>
            <span>{t('build.author')} <i>{t('build.optional')}</i></span>
            <input type="text" maxlength="80" bind:value={content.author} />
          </label>
          <label>
            <span>{t('build.patch')} <i>{t('build.optional')}</i></span>
            <input
              type="text"
              maxlength="40"
              placeholder={t('build.patchPlaceholder')}
              bind:value={content.patch}
            />
          </label>
        </div>
      </section>

      <section class="panel frame" aria-labelledby="b-mods">
        <h3 id="b-mods">{t('build.mods')}</h3>
        <ul class="cells two">
          {@render slotEditor('aura', 'aura')}
          {@render slotEditor('exilus', 'exilus')}
        </ul>
        <ul class="cells">
          {#each content.slots as _, i (i)}
            {@render slotEditor(`slot-${i}`, 'slot')}
          {/each}
        </ul>
      </section>

      <section class="panel frame" aria-labelledby="b-arcanes">
        <h3 id="b-arcanes">{t('build.arcanes')}</h3>
        <ul class="cells two">
          {#each content.arcanes as _, i (i)}
            {@render slotEditor(`arcane-${i}`, 'arcane')}
          {/each}
        </ul>
      </section>

      <section class="panel frame" aria-labelledby="b-shards">
        <h3 id="b-shards">{t('build.shards')}</h3>
        {#if content.shards.length === 0}<p class="hint">{t('build.shardNone')}</p>{/if}
        <ul class="list">
          {#each content.shards as shard, i (i)}
            <li class="shard-row">
              <label>
                <span class="sr-only">{t('build.shardStat', { n: i + 1 })}</span>
                <select bind:value={shard.stat}>
                  {#each groups as g (g.color)}
                    <optgroup label={t(`build.shardColor.${g.color}`)}>
                      {#each g.stats as s (s.key)}
                        <option value={s.key}>{shard.tauforged ? s.tauforged : s.normal}</option>
                      {/each}
                    </optgroup>
                  {/each}
                </select>
              </label>
              <label class="check">
                <input type="checkbox" bind:checked={shard.tauforged} />
                {t('build.tauforged')}
              </label>
              <label class="row-note">
                <span class="sr-only"
                  >{t('build.noteLabel', { name: t('build.shardStat', { n: i + 1 }) })}</span
                >
                <input
                  type="text"
                  maxlength="500"
                  placeholder={t('build.notePlaceholder')}
                  bind:value={shard.note}
                />
              </label>
              <button type="button" onclick={() => removeShard(i)}
                >{t('build.remove')}<span class="sr-only">
                  {t('build.shardStat', { n: i + 1 })}</span
                ></button
              >
            </li>
          {/each}
        </ul>
        <div>
          <button
            type="button"
            class="teal"
            id="add-shard"
            disabled={content.shards.length >= SHARD_SLOTS}
            onclick={addShard}>{t('build.addShard')}</button
          >
        </div>
      </section>

      <section class="panel frame" aria-labelledby="b-helminth">
        <h3 id="b-helminth">{t('build.helminth')}</h3>
        {#if open === 'helminth'}
          <Picker
            id="picker-helminth"
            label={t('build.chooseAbility')}
            choices={(q) => searchByName(options?.helminth ?? [], q)}
            detail={helminthDetail}
            onPick={pickHelminth}
            onClose={() => closePicker('helminth')}
          />
        {:else if content.helminth}
          {@const h = content.helminth}
          <div class="helminth">
            <span class="chosen-name">{h.name}</span>
            <label>
              <span>{t('build.helminthReplaces')}</span>
              <select bind:value={h.replacesKey}>
                {#each options.abilities as a (a.key)}
                  <option value={a.key}>{a.key}. {a.name}</option>
                {/each}
              </select>
            </label>
            <label class="row-note">
              <span class="sr-only">{t('build.noteLabel', { name: h.name })}</span>
              <input
                type="text"
                maxlength="500"
                placeholder={t('build.notePlaceholder')}
                bind:value={h.note}
              />
            </label>
            <div class="cell-actions">
              <button type="button" id="pick-helminth" onclick={() => (open = 'helminth')}
                >{t('build.change')}<span class="sr-only"> {h.name}</span></button
              >
              <button type="button" onclick={removeHelminth}
                >{t('build.remove')}<span class="sr-only"> {h.name}</span></button
              >
            </div>
          </div>
        {:else}
          <div>
            <button
              type="button"
              class="teal"
              id="pick-helminth"
              onclick={() => (open = 'helminth')}>{t('build.chooseAbility')}</button
            >
          </div>
        {/if}
      </section>

      <section class="panel frame" aria-labelledby="b-weapons">
        <h3 id="b-weapons">{t('build.weapons')}</h3>
        {#if content.weapons.length > 0}
          <ul class="list">
            {#each content.weapons as w, i (w.uniqueName)}
              <li class="weapon-row">
                <span class="chosen-name">{w.name}</span>
                <label class="row-note">
                  <span class="sr-only">{t('build.noteLabel', { name: w.name })}</span>
                  <input
                    type="text"
                    maxlength="500"
                    placeholder={t('build.notePlaceholder')}
                    bind:value={w.note}
                  />
                </label>
                <button type="button" onclick={() => removeWeapon(i)}
                  >{t('build.remove')}<span class="sr-only"> {w.name}</span></button
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if content.weapons.length < MAX_BUILD_WEAPONS}
          <label class="search">
            <span>{t('build.weaponSearch')}</span>
            <input
              id="weapon-q"
              type="search"
              autocomplete="off"
              bind:value={weaponQuery}
              oninput={onWeaponInput}
            />
          </label>
          <p class="hint" role="status">
            {weaponSearching ? t('build.weaponSearching') : (weaponError ?? '')}
          </p>
          {#if weaponResults.length > 0}
            <ul class="list results">
              {#each weaponResults as r (r.uniqueName)}
                {@const added = content.weapons.some((w) => w.uniqueName === r.uniqueName)}
                <li class="weapon-row">
                  <span>{r.name}</span>
                  <button type="button" class="teal" disabled={added} onclick={() => addWeapon(r)}
                    >{t('build.weaponAddShort')}<span class="sr-only"> {r.name}</span></button
                  >
                </li>
              {/each}
            </ul>
          {/if}
        {:else}
          <p class="hint">{t('build.weaponMax', { max: MAX_BUILD_WEAPONS })}</p>
        {/if}
      </section>

      <section class="panel frame" aria-labelledby="b-guide">
        <div class="guide-top">
          <h3 id="b-guide">{t('build.guide')}</h3>
          <div class="toggle" role="group" aria-label={t('build.guide')}>
            <button type="button" aria-pressed={!preview} onclick={() => (preview = false)}
              >{t('build.write')}</button
            >
            <button type="button" aria-pressed={preview} onclick={() => (preview = true)}
              >{t('build.preview')}</button
            >
          </div>
        </div>
        {#if preview}
          {#if content.guide.trim() !== ''}
            <Guide source={content.guide} />
          {:else}
            <p class="hint">{t('build.previewEmpty')}</p>
          {/if}
        {:else}
          <label class="guide-field">
            <span class="sr-only">{t('build.guide')}</span>
            <textarea
              rows="12"
              maxlength="20000"
              aria-describedby="guide-hint"
              bind:value={content.guide}></textarea>
          </label>
          <p class="hint" id="guide-hint">{t('build.guideHint')}</p>
        {/if}
      </section>

      {#if saveError}
        <!-- The same message as at the top, for whoever is down here at Save. -->
        <p class="save-error" aria-hidden="true">{saveError}</p>
      {/if}
      <div class="actions">
        <button type="submit" class="primary" aria-disabled={saving}
          >{saving ? t('build.saving') : t('build.save')}</button
        >
        <a class="cancel" href={back}>{t('build.cancel')}</a>
        {#if sub.kind === 'edit'}
          <span class="spacer"></span>
          {#if confirmDelete}
            <span class="confirm" role="group" aria-labelledby="delete-q">
              <span id="delete-q">{t('build.deleteConfirm', { name: savedName })}</span>
              <button
                type="button"
                class="danger"
                bind:this={deleteYes}
                aria-describedby="delete-q"
                onclick={doDelete}>{t('build.deleteYes')}</button
              >
              <button type="button" onclick={cancelDelete}>{t('build.cancel')}</button>
            </span>
          {:else}
            <button type="button" class="danger" bind:this={deleteButton} onclick={askDelete}
              >{t('build.delete')}</button
            >
          {/if}
        {/if}
      </div>
    </form>
  {:else if notFound}
    <p class="alert frame" role="alert">
      {sub.kind === 'edit' ? t('build.notFound', { id: sub.id }) : t('wf.notFound', { slug })}
    </p>
  {:else if loadError}
    <div class="alert frame" role="alert">
      <p>{loadError}</p>
      <button type="button" onclick={load}>{t('wf.retry')}</button>
    </div>
  {:else}
    <p class="hint" aria-live="polite">{t('build.loading')}</p>
  {/if}
</div>

<style>
  .page {
    max-width: 56rem;
    display: grid;
    gap: 0.9rem;
  }

  form {
    display: grid;
    gap: 0.9rem;
  }

  a {
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  .back {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0;
    font-size: 0.85rem;
  }

  .flip {
    display: inline-flex;
    transform: rotate(180deg);
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.15;
    color: var(--gold);
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--gold);
  }

  .panel {
    padding: 0.95rem 1.15rem 1.1rem;
    display: grid;
    gap: 0.6rem;
  }

  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .hint:empty {
    display: none;
  }

  label > span {
    display: block;
    font-size: 0.75rem;
    color: var(--muted);
    margin-bottom: 0.2rem;
  }

  label > span i {
    font-style: normal;
    opacity: 0.85;
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem 1rem;
  }

  .fields .wide {
    grid-column: 1 / -1;
  }

  .fields input {
    width: 100%;
  }

  /* Slots: cells on one seam, like the Builds section's mod grid. */
  .cells {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
  }

  .cell {
    background: var(--surface);
    padding: 0.6rem 0.7rem 0.7rem;
    display: grid;
    /* An open picker must not widen the cell past a phone screen. */
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 0.4rem;
    min-width: 0;
  }

  .cell-label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .choose {
    justify-self: start;
  }

  .chosen {
    display: flex;
    align-items: center;
    gap: 0.3rem 0.6rem;
  }

  .chosen-name {
    font-weight: 600;
  }

  .chosen .chosen-name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .rank select {
    font-variant-numeric: tabular-nums;
  }

  .effect {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    white-space: pre-line;
  }

  .note input,
  .row-note input {
    width: 100%;
  }

  .cell-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .list li {
    padding: 0.45rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .list li:last-child {
    border-bottom: 0;
  }

  .shard-row {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem 0.7rem;
  }

  .shard-row select {
    width: 100%;
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .helminth {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 0.5rem 1rem;
  }

  .helminth .chosen-name {
    align-self: center;
  }

  .helminth .row-note {
    grid-column: 1 / -1;
  }

  .helminth .cell-actions {
    grid-column: 1 / -1;
  }

  .weapon-row {
    display: grid;
    grid-template-columns: minmax(8rem, auto) minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem 0.7rem;
  }

  .results .weapon-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .search input {
    width: 100%;
    max-width: 24rem;
  }

  .guide-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .toggle {
    display: flex;
  }

  .toggle button {
    margin-left: -1px;
    color: var(--muted);
  }

  .toggle button[aria-pressed='true'] {
    position: relative;
    z-index: 1;
    border-color: var(--gold);
    color: var(--gold);
    background: color-mix(in srgb, var(--gold) 12%, transparent);
  }

  .guide-field textarea {
    width: 100%;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1rem;
  }

  .actions button[aria-disabled='true'] {
    opacity: 0.45;
    cursor: default;
  }

  .cancel {
    font-size: 0.85rem;
    padding: 0.2rem 0;
  }

  .spacer {
    flex: 1;
  }

  .confirm {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
    color: var(--bad);
    font-size: 0.85rem;
  }

  /* Like the Goals undo bar: stuck to the top so it's seen from anywhere on the form. */
  .leave-bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.8rem;
    padding: 0.6rem 0.9rem;
    background: var(--surface);
    border: 1px solid var(--gold);
    color: var(--gold);
    font-size: 0.9rem;
  }

  .leave-bar span {
    flex: 1 1 16rem;
  }

  .save-error {
    margin: 0;
    font-size: 0.85rem;
    color: var(--bad);
  }

  .alert {
    --frame-line: var(--bad);
    margin: 0;
    padding: 0.7rem 0.9rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    color: var(--bad);
  }

  .alert p {
    margin: 0;
  }

  @media (max-width: 36rem) {
    .fields,
    .cells {
      grid-template-columns: minmax(0, 1fr);
    }

    .shard-row,
    .weapon-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .shard-row label:first-child,
    .shard-row .row-note,
    .weapon-row .row-note {
      grid-column: 1 / -1;
    }
  }
</style>
