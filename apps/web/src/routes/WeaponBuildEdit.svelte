<script lang="ts">
  import {
    PROGENITOR_ELEMENTS,
    PROGENITOR_MAX,
    PROGENITOR_MIN,
    RIVEN_MAX_NEGATIVE,
    RIVEN_MAX_POSITIVE,
    RIVEN_POLARITIES,
    type BuildSlot,
    type WeaponArcaneOption,
    type WeaponBuildContent,
    type WeaponBuildOptionsResponse,
    type WeaponDetail,
    type WeaponModOption,
    type WeaponVariantKind,
  } from '@warframehub/shared';
  import Icon from '../components/Icon.svelte';
  import ModPic from '../components/ModPic.svelte';
  import Picker from '../components/Picker.svelte';
  import Segmented from '../components/Segmented.svelte';
  import * as api from '../lib/api.ts';
  import { arcaneChoices, rememberTab } from '../lib/builds.ts';
  import { language, t, tOr } from '../lib/i18n/index.ts';
  import { buildHref, leave, setLeaveGuard, type BuildSub } from '../lib/route.svelte.ts';
  import { polarityName } from '../lib/warframes.ts';
  import { emptyWeaponContent, rivenKey, weaponModChoices } from '../lib/weapon-builds.ts';
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    slug: string;
    sub: BuildSub;
  }

  let { slug, sub }: Props = $props();

  const href = (s?: BuildSub) => buildHref(slug, s, 'weapons');

  let weapon = $state<WeaponDetail | null>(null);
  let options = $state<WeaponBuildOptionsResponse | null>(null);
  let loadError = $state<string | null>(null);
  let notFound = $state(false);
  let name = $state('');
  let content = $state<WeaponBuildContent>(emptyWeaponContent('normal'));
  let savedName = $state('');

  let open = $state<string | null>(null); // the picker that's open, by slot key
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let confirmDelete = $state(false);
  let deleting = $state(false);
  /** What changing the version took out of the build ("2 mods no longer fit"). */
  let versionNote = $state('');

  let titleEl = $state<HTMLHeadingElement | null>(null);
  let errorEl = $state<HTMLParagraphElement | null>(null);
  let deleteYes = $state<HTMLButtonElement | null>(null);
  let deleteButton = $state<HTMLButtonElement | null>(null);

  // ---- unsaved changes ----------------------------------------------------------------

  let saved = $state('');
  const current = $derived(JSON.stringify({ name, content }));
  const dirty = $derived(options !== null && current !== saved);
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

  const back = $derived(sub.kind === 'edit' ? href({ kind: 'view', id: sub.id }) : href());
  const variants = $derived(weapon?.variants ?? []);
  const evolutions = $derived(variants.find((v) => v.kind === content.variant)?.evolutions ?? null);
  const melee = $derived(weapon?.slot === 'melee');
  const mods = $derived(new Map(options?.mods.map((m) => [m.uniqueName, m]) ?? []));
  const stances = $derived(new Map(options?.stances.map((m) => [m.uniqueName, m]) ?? []));
  const arcaneMaps = $derived(
    (options?.arcaneSlots ?? []).map((list) => new Map(list.map((a) => [a.uniqueName, a]))),
  );
  const arcaneSlotCount = $derived((options?.arcaneSlots ?? []).filter((l) => l.length > 0).length);

  async function load() {
    options = null;
    loadError = null;
    notFound = false;
    try {
      const build = sub.kind === 'edit' ? await api.getWeaponBuild(sub.id) : null;
      const w = await api.getWeapon(slug);
      if (build && build.slug !== slug) {
        notFound = true;
        return;
      }
      const start =
        build?.content.variant ??
        (w.variants.find((v) => v.kind === 'prime') ?? w.variants[0]!).kind;
      const o = await api.getWeaponBuildOptions(slug, start);
      weapon = w;
      name = build?.name ?? '';
      savedName = build?.name ?? '';
      content = build ? structuredClone(build.content) : emptyWeaponContent(start);
      saved = JSON.stringify({ name, content });
      leaving = null;
      versionNote = '';
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

  /** Changing the version: what fits is checked again, and what no longer fits goes. */
  async function changeVersion(kind: WeaponVariantKind) {
    if (kind === content.variant) return;
    try {
      const o = await api.getWeaponBuildOptions(slug, kind);
      const fit = new Map(o.mods.map((m) => [m.uniqueName, m]));
      const fitStance = new Map(o.stances.map((m) => [m.uniqueName, m]));
      let removed = 0;
      const keepMod = (s: BuildSlot | null) => {
        if (s && !fit.has(s.uniqueName)) {
          removed++;
          return null;
        }
        return s;
      };
      content.variant = kind;
      content.exilus = o.hasExilus ? keepMod(content.exilus) : (removed++, null);
      content.slots = content.slots.map(keepMod);
      if (content.stance && !fitStance.has(content.stance.uniqueName)) {
        content.stance = null;
        removed++;
      }
      content.arcanes = content.arcanes.map((a, i) => {
        if (a && !o.arcaneSlots[i]?.some((x) => x.uniqueName === a.uniqueName)) {
          removed++;
          return null;
        }
        return a;
      });
      const next = variants.find((v) => v.kind === kind)?.evolutions ?? null;
      const before = content.incarnon.length;
      content.incarnon = next
        ? content.incarnon.filter((p) => next.tiers.find((x) => x.tier === p.tier)?.perks[p.perk])
        : [];
      removed += before - content.incarnon.length;
      if (!o.progenitor && content.progenitor) {
        content.progenitor = null;
        removed++;
      }
      options = o;
      open = null;
      versionNote = removed > 0 ? t('wb.versionRemoved', { n: removed }) : '';
    } catch (e) {
      saveError = t('build.loadError', {
        message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
      });
    }
  }

  // ---- mod, stance and arcane slots ------------------------------------------------------

  type SlotKey = 'exilus' | 'stance' | `slot-${number}` | `arcane-${number}`;

  function getSlot(key: SlotKey): BuildSlot | null {
    if (key === 'exilus' || key === 'stance') return content[key];
    const [kind, i] = key.split('-') as ['slot' | 'arcane', string];
    return (kind === 'slot' ? content.slots : content.arcanes)[Number(i)] ?? null;
  }

  function setSlot(key: SlotKey, value: BuildSlot | null) {
    if (key === 'exilus' || key === 'stance') content[key] = value;
    else {
      const [kind, i] = key.split('-') as ['slot' | 'arcane', string];
      (kind === 'slot' ? content.slots : content.arcanes)[Number(i)] = value;
    }
  }

  function usedMods(except: SlotKey): Set<string> {
    const keys: SlotKey[] = ['exilus', ...content.slots.map((_, i) => `slot-${i}` as const)];
    return new Set(
      keys
        .filter((k) => k !== except)
        .map((k) => getSlot(k)?.uniqueName)
        .filter((u): u is string => !!u),
    );
  }

  const usedArcanes = (except: SlotKey) =>
    new Set(
      content.arcanes
        .map((a, i) => (`arcane-${i}` === except ? null : a?.uniqueName))
        .filter((u): u is string => !!u),
    );

  async function closePicker(key: string) {
    open = null;
    await tick();
    document.getElementById(`pick-${key}`)?.focus();
  }

  function nextEmpty(key: SlotKey): SlotKey | null {
    if (key.startsWith('arcane') || key === 'stance') return null;
    const order: SlotKey[] = ['exilus', ...content.slots.map((_, i) => `slot-${i}` as const)];
    const after = order.slice(order.indexOf(key) + 1);
    return after.find((k) => getSlot(k) === null) ?? null;
  }

  async function pick(key: SlotKey, item: WeaponModOption | WeaponArcaneOption) {
    const before = getSlot(key);
    setSlot(key, {
      uniqueName: item.uniqueName,
      name: item.name,
      rank: item.maxRank,
      note: before?.note ?? '',
    });
    const next = before ? null : nextEmpty(key);
    await closePicker(next ?? key);
  }

  async function removeSlot(key: SlotKey) {
    setSlot(key, null);
    await tick();
    document.getElementById(`pick-${key}`)?.focus();
  }

  function dataOf(key: SlotKey, slot: BuildSlot) {
    if (key.startsWith('arcane'))
      return arcaneMaps[Number(key.split('-')[1])]?.get(slot.uniqueName);
    return key === 'stance' ? stances.get(slot.uniqueName) : mods.get(slot.uniqueName);
  }
  const effectAt = (key: SlotKey, slot: BuildSlot) => {
    const d = dataOf(key, slot);
    return d ? (d.effects[Math.min(slot.rank, d.effects.length - 1)] ?? null) : null;
  };

  function slotLabel(key: SlotKey): string {
    if (key === 'exilus') return t('build.exilus');
    if (key === 'stance') return t('wb.stance');
    const [kind, i] = key.split('-');
    if (kind === 'slot') return t('build.slotN', { n: Number(i) + 1 });
    if (weapon?.slot === 'archgun') {
      return Number(i) === 0 ? t('wb.arcanePrimary') : t('wb.arcaneSecondary');
    }
    return t('wb.arcaneOnly');
  }

  // ---- sections ---------------------------------------------------------------------------

  const sectionLinks = $derived([
    { id: 'b-about', label: t('build.about') },
    { id: 'b-mods', label: t('build.mods') },
    { id: 'b-arcanes', label: t('build.arcanes') },
    ...(evolutions ? [{ id: 'b-incarnon', label: t('wb.incarnon') }] : []),
    { id: 'b-riven', label: t('wb.riven') },
    ...(options?.progenitor ? [{ id: 'b-progenitor', label: t('wb.progenitor') }] : []),
  ]);

  function goTo(id: string) {
    const h = document.getElementById(id);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    h?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    h?.focus({ preventScroll: true });
  }

  // ---- notes: an "Add a note" link opens the field -----------------------------------------

  /** The notes opened by hand; a part with a note shows it open anyway. */
  const notesOpen = new SvelteSet<string>();

  async function openNote(id: string) {
    notesOpen.add(id);
    await tick();
    document.getElementById(`note-${id}`)?.focus();
  }

  // ---- Incarnon perks ---------------------------------------------------------------------

  const pickOf = (tier: number) => content.incarnon.find((p) => p.tier === tier);

  function setPerk(tier: number, perk: number | null) {
    const rest = content.incarnon.filter((p) => p.tier !== tier);
    const note = pickOf(tier)?.note ?? '';
    content.incarnon = (perk === null ? rest : [...rest, { tier, perk, note }]).sort(
      (a, b) => a.tier - b.tier,
    );
  }

  // ---- Riven ------------------------------------------------------------------------------

  const rivenStatList = $derived(options?.rivenStats ?? []);
  const rivenCount = (negative: boolean) =>
    content.riven?.stats.filter((s) => s.negative === negative).length ?? 0;

  function addRiven() {
    content.riven = { name: '', polarity: null, stats: [], note: '' };
  }

  function addStat() {
    if (!content.riven || !rivenStatList[0]) return;
    const first = rivenStatList.find((r) => !r.spliced) ?? rivenStatList[0];
    content.riven.stats.push({
      stat: first.stat,
      spliced: first.spliced,
      value: '',
      negative: false,
    });
  }

  async function removeStat(i: number) {
    content.riven?.stats.splice(i, 1);
    await tick();
    document.getElementById('add-stat')?.focus();
  }

  const statLabel = (stat: string, spliced: boolean) =>
    tOr(`wb.rstat.${stat}`, stat) + (spliced ? ` (${t('wb.spliced')})` : '');
  const optionOf = (stat: string, spliced: boolean) =>
    rivenStatList.find((r) => r.stat === stat && r.spliced === spliced);

  // ---- progenitor -------------------------------------------------------------------------

  function addProgenitor() {
    content.progenitor = { element: PROGENITOR_ELEMENTS[0], percent: PROGENITOR_MAX };
  }

  // ---- import a shared build ----------------------------------------------------------------

  let importCode = $state('');
  let importing = $state(false);
  let importMessage = $state<{ text: string; bad: boolean } | null>(null);
  let importOpen = $state(false);
  let pendingImport = $state<Awaited<ReturnType<typeof api.importWeaponBuild>> | null>(null);
  let importInput = $state<HTMLInputElement | null>(null);
  let keepMine = $state<HTMLButtonElement | null>(null);

  async function toggleImport() {
    importOpen = !importOpen;
    if (importOpen) {
      await tick();
      importInput?.focus();
    }
  }

  $effect(() => {
    if (options && sub.kind === 'new' && sub.withCode) {
      importOpen = true;
      void tick().then(() => importInput?.focus());
    }
  });

  async function applyImport(got: NonNullable<typeof pendingImport>) {
    name = got.name;
    content = got.content;
    open = null;
    importCode = '';
    pendingImport = null;
    importMessage = { text: t('build.imported'), bad: false };
    // What fits depends on the version the code is for.
    try {
      options = await api.getWeaponBuildOptions(slug, got.content.variant);
    } catch {
      // the save still checks everything
    }
  }

  async function importShared(event: SubmitEvent) {
    event.preventDefault();
    if (importing) return;
    if (importCode.trim() === '') {
      importMessage = { text: t('build.importEmpty'), bad: true };
      importInput?.focus();
      return;
    }
    importing = true;
    importMessage = null;
    pendingImport = null;
    try {
      const got = await api.importWeaponBuild(slug, importCode);
      if (dirty) {
        pendingImport = got;
        await tick();
        keepMine?.focus();
      } else {
        await applyImport(got);
        await tick();
        document.getElementById('build-name')?.focus();
      }
    } catch (e) {
      importMessage = {
        text: t('build.importError', {
          message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
        }),
        bad: true,
      };
    } finally {
      importing = false;
    }
  }

  async function replaceWithImport() {
    if (!pendingImport) return;
    await applyImport(pendingImport);
    await tick();
    document.getElementById('build-name')?.focus();
  }

  async function keepMyForm() {
    pendingImport = null;
    await tick();
    importInput?.focus();
  }

  // ---- save and delete ----------------------------------------------------------------------

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
      const body = $state.snapshot(content);
      const build =
        sub.kind === 'edit'
          ? await api.updateWeaponBuild(sub.id, name, body)
          : await api.createWeaponBuild(slug, name, body);
      rememberTab(`weapon:${slug}`, build.id);
      saved = current;
      leave(href({ kind: 'view', id: build.id }));
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
      await api.deleteWeaponBuild(sub.id);
      leave(href());
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

{#snippet modDetail(m: WeaponModOption)}{m.polarity
    ? polarityName(m.polarity) + ' · '
    : ''}{m.effects.at(-1) ?? ''}{/snippet}
{#snippet arcaneDetail(a: WeaponArcaneOption)}{a.effects.at(-1) ?? ''}{/snippet}

<!-- A note: a small link until it has text or is asked for; then its own labelled field. -->
{#snippet noteField(id: string, holder: { note: string }, about: string)}
  {#if holder.note !== '' || notesOpen.has(id)}
    <label class="note">
      <span class="note-label">{t('build.note')}<span class="sr-only"> ({about})</span></span>
      <input
        id="note-{id}"
        type="text"
        maxlength="500"
        placeholder={t('build.notePlaceholder')}
        bind:value={holder.note}
      />
    </label>
  {:else}
    <button type="button" class="add-note" onclick={() => openNote(id)}
      >{t('wb.addNote')}<span class="sr-only"> ({about})</span></button
    >
  {/if}
{/snippet}

{#snippet slotEditor(key: SlotKey, kind: 'exilus' | 'slot' | 'stance' | 'arcane')}
  {@const slot = getSlot(key)}
  <li class="cell">
    <span class="cell-label">{slotLabel(key)}</span>
    {#if open === key}
      {#if kind === 'arcane'}
        <Picker
          id="picker-{key}"
          label={t('build.searchArcanes', { slot: slotLabel(key) })}
          choices={(q) =>
            arcaneChoices(
              options?.arcaneSlots[Number(key.split('-')[1])] ?? [],
              usedArcanes(key),
              q,
            )}
          detail={arcaneDetail}
          image={(a) => a.image}
          imageFit="contain"
          onPick={(item) => pick(key, item)}
          onClose={() => closePicker(key)}
        />
      {:else if kind === 'stance'}
        <Picker
          id="picker-{key}"
          label={t('wb.searchStances')}
          choices={(q) => weaponModChoices(options?.stances ?? [], false, new Set(), q)}
          detail={modDetail}
          image={(m) => m.image}
          onPick={(item) => pick(key, item)}
          onClose={() => closePicker(key)}
        />
      {:else}
        <Picker
          id="picker-{key}"
          label={t('build.searchMods', { slot: slotLabel(key) })}
          choices={(q) =>
            weaponModChoices(options?.mods ?? [], kind === 'exilus', usedMods(key), q)}
          detail={modDetail}
          image={(m) => m.image}
          onPick={(item) => pick(key, item)}
          onClose={() => closePicker(key)}
        />
      {/if}
    {:else if slot}
      {@const data = dataOf(key, slot)}
      {#if kind !== 'arcane'}
        <div class="art">
          {#if data?.image}<img
              src={api.imageUrl(data.image)}
              alt=""
              width="256"
              height="128"
              loading="lazy"
            />{/if}
        </div>
      {/if}
      <div class="chosen">
        {#if kind === 'arcane'}<ModPic image={data?.image ?? null} size={56} fit="contain" />{/if}
        <span class="chosen-name">{slot.name}</span>
        <label class="rank">
          <span class="sr-only">{t('build.rankLabel', { name: slot.name })}</span>
          <select bind:value={slot.rank}>
            {#each Array.from({ length: (data?.maxRank ?? slot.rank) + 1 }, (_, r) => r) as r (r)}
              <option value={r}>{t('build.rank', { rank: r })}</option>
            {/each}
          </select>
        </label>
      </div>
      {@const effect = effectAt(key, slot)}
      {#if effect}<p class="effect">{effect}</p>{/if}
      {@render noteField(key, slot, slot.name)}
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
        >{kind === 'arcane'
          ? t('build.chooseArcane')
          : kind === 'stance'
            ? t('wb.chooseStance')
            : t('build.chooseMod')}<span class="sr-only"> ({slotLabel(key)})</span></button
      >
    {/if}
  </li>
{/snippet}

<div class="page">
  <a class="back" href={back}>
    <span class="flip"><Icon name="chevron" size={12} /></span>
    {sub.kind === 'edit' && savedName
      ? t('build.backTo', { name: savedName })
      : t('build.backToBuilds')}
  </a>

  {#if options && weapon}
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
    <h2 tabindex="-1" bind:this={titleEl}>
      {sub.kind === 'edit'
        ? t('build.editTitle', { name: savedName })
        : t('build.newTitle', { name: weapon.name })}
    </h2>

    {#if sub.kind === 'new'}
      <div class="import-wrap">
        <button
          type="button"
          class="import-toggle"
          aria-expanded={importOpen}
          aria-controls="import-panel"
          onclick={toggleImport}
        >
          <span class="chev" class:open={importOpen}><Icon name="chevron" size={12} /></span>
          {t('build.importTitle')}
        </button>
        <form
          class="import frame"
          id="import-panel"
          hidden={!importOpen}
          onsubmit={importShared}
          aria-label={t('build.importTitle')}
        >
          <p class="hint">{t('build.importHint')}</p>
          <div class="import-row">
            <input
              type="text"
              aria-label={t('build.importLabel')}
              aria-invalid={importMessage?.bad ? 'true' : undefined}
              aria-describedby="import-status"
              placeholder="wfhub-weaponbuild1:…"
              autocomplete="off"
              spellcheck="false"
              bind:this={importInput}
              bind:value={importCode}
              oninput={() => {
                if (importMessage?.bad) importMessage = null;
              }}
            />
            <button type="submit" aria-disabled={importing}>
              {importing ? t('build.importing') : t('build.importButton')}
            </button>
          </div>
          {#if pendingImport}
            <div class="replace" role="group" aria-labelledby="replace-q">
              <span id="replace-q">{t('build.importReplaceQ')}</span>
              <button type="button" class="primary" bind:this={keepMine} onclick={keepMyForm}
                >{t('build.importKeep')}</button
              >
              <button type="button" class="danger" onclick={replaceWithImport}
                >{t('build.importReplace')}</button
              >
            </div>
          {/if}
          <p id="import-status" class="import-status" class:bad={importMessage?.bad} role="status">
            {importMessage?.text ?? ''}
          </p>
        </form>
      </div>
    {/if}

    <!-- A long form: jump between its sections (they take focus, so you can start typing). -->
    <nav class="sections" aria-label={t('wb.sections')}>
      {#each sectionLinks as s (s.id)}
        <button type="button" onclick={() => goTo(s.id)}>{s.label}</button>
      {/each}
    </nav>

    <form onsubmit={save} novalidate>
      {#if saveError}
        <p class="alert frame" role="alert" tabindex="-1" bind:this={errorEl}>{saveError}</p>
      {/if}

      <section class="panel frame accent" aria-labelledby="b-about">
        <h3 id="b-about" tabindex="-1">{t('build.about')}</h3>
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
          {#if variants.length > 1}
            <div class="wide">
              <Segmented
                legend={t('wb.version')}
                name="wb-version"
                options={variants.map((v) => ({ value: v.kind, label: t(`wp.kind.${v.kind}`) }))}
                value={content.variant}
                onchange={changeVersion}
              />
              <p class="hint">{t('wb.versionHint')}</p>
              <p class="hint" role="status">{versionNote}</p>
            </div>
          {/if}
          <label class="wide">
            <span>{t('build.description')} <i>{t('build.optional')}</i></span>
            <textarea
              rows="2"
              maxlength="300"
              aria-describedby="description-count"
              placeholder={t('build.descriptionPlaceholder')}
              bind:value={content.description}></textarea>
            <small
              id="description-count"
              class="count num"
              class:full={content.description.length >= 300}
              >{t('build.count', { n: content.description.length, max: 300 })}</small
            >
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
          <label>
            <span>{t('build.forma')} <i>{t('build.optional')}</i></span>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              max="60"
              step="1"
              placeholder={t('build.formaPlaceholder')}
              bind:value={content.forma}
            />
          </label>
        </div>
      </section>

      <section class="panel frame" aria-labelledby="b-mods">
        <h3 id="b-mods" tabindex="-1">{t('build.mods')}</h3>
        {#if options.hasExilus || melee}
          <ul class="cells two">
            {#if options.hasExilus}{@render slotEditor('exilus', 'exilus')}{/if}
            {#if melee}{@render slotEditor('stance', 'stance')}{/if}
          </ul>
        {/if}
        <ul class="cells">
          {#each content.slots as _, i (i)}
            {@render slotEditor(`slot-${i}`, 'slot')}
          {/each}
        </ul>
      </section>

      <section class="panel frame" aria-labelledby="b-arcanes">
        <h3 id="b-arcanes" tabindex="-1">{t('build.arcanes')}</h3>
        {#if arcaneSlotCount === 0}
          <p class="hint">{t('wb.noArcanes')}</p>
        {:else}
          <ul class="cells two">
            {#each content.arcanes as _, i (i)}
              {#if (options.arcaneSlots[i]?.length ?? 0) > 0}
                {@render slotEditor(`arcane-${i}`, 'arcane')}
              {/if}
            {/each}
          </ul>
        {/if}
      </section>

      {#if evolutions}
        <section class="panel frame" aria-labelledby="b-incarnon">
          <h3 id="b-incarnon" tabindex="-1">{t('wb.incarnon')}</h3>
          <p class="hint">{t('wb.incarnonHint')}</p>
          <ul class="tiers">
            {#each evolutions.tiers.filter((x) => x.tier >= 2) as tier (tier.tier)}
              {@const pick = pickOf(tier.tier)}
              <li class="tier-row">
                <fieldset class="perks">
                  <legend>{t('wp.evoTier', { n: tier.tier })}</legend>
                  <div class="perk-options" lang="en">
                    <label class:on={!pick}>
                      <input
                        type="radio"
                        name="perk-{tier.tier}"
                        checked={!pick}
                        onchange={() => setPerk(tier.tier, null)}
                      />
                      <!-- The perks are English; this word is the interface's. -->
                      <span class="perk-name" lang={language.current}>{t('wb.perkNone')}</span>
                    </label>
                    {#each tier.perks as perk, i (i)}
                      <label class:on={pick?.perk === i}>
                        <input
                          type="radio"
                          name="perk-{tier.tier}"
                          checked={pick?.perk === i}
                          onchange={() => setPerk(tier.tier, i)}
                        />
                        <span class="perk-name">{perk.name}</span>
                        {#each perk.lines as line, j (j)}<span class="perk-line">{line}</span
                          >{/each}
                      </label>
                    {/each}
                  </div>
                </fieldset>
                {#if pick}
                  {@render noteField(`perk-${tier.tier}`, pick, t('wp.evoTier', { n: tier.tier }))}
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <section class="panel frame" aria-labelledby="b-riven">
        <h3 id="b-riven" tabindex="-1">{t('wb.riven')}</h3>
        {#if rivenStatList.length === 0}
          <p class="hint">{t('wb.noRiven')}</p>
        {:else if !content.riven}
          <div>
            <button type="button" class="teal" id="add-riven" onclick={addRiven}
              >{t('wb.addRiven')}</button
            >
          </div>
        {:else}
          {@const r = content.riven}
          <p class="hint">{t('wb.rivenHint')}</p>
          <div class="fields">
            <label>
              <span>{t('wb.rivenName')} <i>{t('build.optional')}</i></span>
              <input
                type="text"
                maxlength="40"
                placeholder={t('wb.rivenNamePlaceholder')}
                bind:value={r.name}
              />
            </label>
            <div>
              <Segmented
                legend={t('wb.polarity')}
                name="riven-polarity"
                options={[
                  { value: 'none', label: t('wb.polarityNone') },
                  ...RIVEN_POLARITIES.map((p) => ({ value: p, label: polarityName(p) })),
                ]}
                value={r.polarity ?? 'none'}
                onchange={(v) => (r.polarity = v === 'none' ? null : v)}
              />
            </div>
          </div>
          <ul class="list">
            {#each r.stats as s, i (i)}
              {@const o = optionOf(s.stat, s.spliced)}
              <li class="stat-row">
                <label class="stat-pick">
                  <span class="sr-only">{t('wb.rivenStat', { n: i + 1 })}</span>
                  <select
                    value={rivenKey(s.stat, s.spliced)}
                    onchange={(e) => {
                      const [stat, spliced] = e.currentTarget.value.split('|');
                      s.stat = stat!;
                      s.spliced = spliced === '1';
                      if (!optionOf(s.stat, s.spliced)?.negative) s.negative = false;
                    }}
                  >
                    {#each rivenStatList as o (rivenKey(o.stat, o.spliced))}
                      <option value={rivenKey(o.stat, o.spliced)}
                        >{statLabel(o.stat, o.spliced)}</option
                      >
                    {/each}
                  </select>
                </label>
                <label class="stat-value">
                  <span class="sr-only"
                    >{t('wb.rivenValue')} ({t('wb.rivenStat', { n: i + 1 })})</span
                  >
                  <input
                    type="text"
                    inputmode="text"
                    maxlength="16"
                    placeholder={t('wb.rivenValuePlaceholder')}
                    autocomplete="off"
                    bind:value={s.value}
                  />
                </label>
                <label class="check">
                  <input
                    type="checkbox"
                    checked={s.negative}
                    disabled={!o?.negative ||
                      (!s.negative && rivenCount(true) >= RIVEN_MAX_NEGATIVE)}
                    onchange={(e) => (s.negative = e.currentTarget.checked)}
                  />
                  {t('wb.rivenNegative')}
                </label>
                <button type="button" onclick={() => removeStat(i)}
                  >{t('build.remove')}<span class="sr-only">
                    {t('wb.rivenStat', { n: i + 1 })}</span
                  ></button
                >
              </li>
            {/each}
          </ul>
          <div class="cell-actions">
            <button
              type="button"
              class="teal"
              id="add-stat"
              disabled={r.stats.length >= RIVEN_MAX_POSITIVE + RIVEN_MAX_NEGATIVE}
              onclick={addStat}>{t('wb.addStat')}</button
            >
            <button type="button" onclick={() => (content.riven = null)}
              >{t('wb.removeRiven')}</button
            >
          </div>
          {@render noteField('riven', r, t('wb.riven'))}
        {/if}
      </section>

      {#if options.progenitor}
        <section class="panel frame" aria-labelledby="b-progenitor">
          <h3 id="b-progenitor" tabindex="-1">{t('wb.progenitor')}</h3>
          {#if content.progenitor}
            {@const p = content.progenitor}
            <div class="fields">
              <label>
                <span>{t('wb.element')}</span>
                <select bind:value={p.element}>
                  {#each PROGENITOR_ELEMENTS as e (e)}
                    <option value={e}>{t(`wp.dmg.${e}`)}</option>
                  {/each}
                </select>
              </label>
              <label>
                <span>{t('wb.percent')}</span>
                <input
                  type="number"
                  min={PROGENITOR_MIN}
                  max={PROGENITOR_MAX}
                  step="1"
                  bind:value={p.percent}
                />
              </label>
            </div>
            <div>
              <button type="button" onclick={() => (content.progenitor = null)}
                >{t('wb.removeProgenitor')}</button
              >
            </div>
          {:else}
            <div>
              <button type="button" class="teal" onclick={addProgenitor}
                >{t('wb.addProgenitor')}</button
              >
            </div>
          {/if}
        </section>
      {/if}

      {#if saveError}
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
      {sub.kind === 'edit' ? t('build.notFound', { id: sub.id }) : t('wp.notFound', { slug })}
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
    display: grid;
    gap: 0.9rem;
  }

  .art {
    height: 4.5rem;
    margin: 0 -0.7rem;
    background: var(--surface-2);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%);
    overflow: hidden;
  }

  .art img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 30%;
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

  .import {
    gap: 0.4rem;
    padding: 0.7rem 0.9rem;
  }

  .import-wrap {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
  }

  .import-wrap .import {
    justify-self: stretch;
  }

  .import[hidden] {
    display: none;
  }

  .import-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0;
    border: 0;
    background: none;
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
    color: var(--teal);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .import-toggle:hover:not(:disabled) {
    background: none;
    color: var(--fg);
  }

  .chev {
    display: inline-flex;
    transition: transform 120ms ease;
  }

  .chev.open {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }

  .replace {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.8rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--gold);
    font-size: 0.9rem;
  }

  .replace span {
    flex: 1 1 14rem;
  }

  .import-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .import-row input {
    flex: 1 1 16rem;
    font-family: var(--font-mono);
  }

  .import button[aria-disabled='true'] {
    cursor: progress;
  }

  @media (pointer: coarse) {
    .import-toggle,
    .import button {
      min-height: 2.75rem;
    }
  }

  .import-status {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ok);
  }

  .import-status:empty {
    height: 0;
    margin-top: -0.4rem;
  }

  .import-status.bad {
    color: var(--bad);
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

  .fields input:not([type='checkbox']),
  .fields textarea,
  .fields select {
    width: 100%;
  }

  .count {
    display: block;
    margin-top: 0.2rem;
    text-align: right;
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--muted);
  }

  .count.full {
    color: var(--gold);
  }

  .cells {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
  }

  .cells.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* One cell of a pair (an Exilus alone, a single arcane): half the row, no grey gap. */
  .cells.two:has(> li:only-child) {
    grid-template-columns: minmax(0, 1fr);
    max-width: calc(50% - 0.5px);
  }

  .cell {
    background: var(--surface);
    padding: 0.6rem 0.7rem 0.7rem;
    display: grid;
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
    flex: 1;
    min-width: 0;
    font-weight: 600;
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

  .note input {
    width: 100%;
  }

  .cell-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .list,
  .tiers {
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

  /* Incarnon: one row per tier, the perks as radio cells (the version switch's look). */
  .tier-row {
    display: grid;
    gap: 0.4rem;
    padding: 0.6rem 0;
    border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .perks {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
    display: grid;
    gap: 0.4rem;
  }

  .perks legend {
    padding: 0;
    margin-bottom: 0.3rem;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .perk-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
    gap: 0.5rem;
  }

  .perk-options label {
    position: relative;
    display: grid;
    align-content: start;
    gap: 0.2rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--line);
    background: var(--surface-2);
    cursor: pointer;
  }

  .perk-options label:hover {
    border-color: var(--line-strong);
  }

  .perk-options label.on {
    border-color: var(--gold);
    background: color-mix(in srgb, var(--gold) 10%, transparent);
  }

  .perk-options input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }

  .perk-options label:has(input:focus-visible) {
    outline: 2px solid var(--teal);
    outline-offset: 2px;
  }

  .perk-name {
    font-weight: 600;
  }

  .perk-line {
    font-size: 0.85rem;
    color: var(--fg);
  }

  /* Riven stats: stat, value, negative, remove. */
  .stat-row {
    display: grid;
    grid-template-columns: minmax(10rem, 1.5fr) minmax(6rem, 0.6fr) auto auto;
    align-items: center;
    gap: 0.5rem 0.7rem;
  }

  .stat-row select,
  .stat-row input[type='text'] {
    width: 100%;
  }

  .stat-value input {
    font-variant-numeric: tabular-nums;
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  /* Save stays in reach at the bottom of a long form. */
  .actions {
    position: sticky;
    bottom: 0;
    z-index: 4;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1rem;
    padding: 0.6rem 0.8rem;
    background: var(--surface);
    border-top: 1px solid var(--line-strong);
  }

  /* The section links: a quiet row that stays under the top of the page. */
  .sections {
    position: sticky;
    top: 0;
    z-index: 4;
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1.1rem;
    padding: 0.35rem 0;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    border-bottom: 1px solid var(--line);
  }

  .sections button {
    padding: 0.15rem 0;
    border: 0;
    background: none;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .sections button:hover:not(:disabled) {
    background: none;
    color: var(--gold);
  }

  .note-label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--gold);
  }

  /* "Add a note": a small teal link, so ten empty fields aren't the loudest thing here. */
  .add-note {
    justify-self: start;
    padding: 0.1rem 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 0.85rem;
    letter-spacing: normal;
    text-transform: none;
    color: var(--teal);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .add-note:hover:not(:disabled) {
    background: none;
    color: var(--fg);
  }

  @media (pointer: coarse) {
    .add-note,
    .sections button {
      min-height: 2.75rem;
    }
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

  @media (max-width: 64rem) {
    .cells {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 36rem) {
    .fields,
    .cells,
    .cells.two {
      grid-template-columns: minmax(0, 1fr);
    }

    .cells.two:has(> li:only-child) {
      max-width: none;
    }

    .stat-row {
      grid-template-columns: minmax(0, 1fr) minmax(5rem, 8rem);
    }
  }
</style>
