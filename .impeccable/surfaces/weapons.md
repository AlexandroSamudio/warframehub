# Surface brief: Weapons (`#/weapons` and `#/weapons/{slug}`)

Visual authority: `DESIGN.md` ("The Orbiter Console"), unchanged. Screens to follow: the list follows the **Warframes list**; the page follows the **Warframe page** (Overview). SPEC §15. Confirmed with Alex on 15 Nov 2026 (list grouped by slot; one attack at a time).

## Job and audience

Alex, between missions or planning: "what's this weapon's damage and crit, which version is better, how do I get it, have I mastered it, what can my MR use, is a Riven worth it?" Reading in English or Spanish, short labels.

## Modes

- **List: Operate.** Find a weapon fast: tab, slot, class, search, sort; scan, click.
- **Page: Read.** A reference page; the stats of the selected attack are the heart.

## Selected direction

### List (`#/weapons`, `#/weapons?tab=arch`)

- Header row like Warframes: gold title + search. Meta line: "477 weapons · Updated … · Refresh".
- **Two tabs** under the header (links with `aria-current`, like the Warframe page tabs): **Weapons** and **Archwing & Necramech**. The arch tab has one muted line: "Necramechs can use any arch-gun."
- **Filter row:** slot chips (All · Primary · Secondary · Melee; on arch: All · Arch-gun · Arch-melee) as a segmented radio group in the version-switch style; a Class select (only classes of the shown slot); a Mastery segmented control (All · Not mastered · Mastered); an Incarnon checkbox. Then the sorter row (Sort by: Name, Mastered, Favorites, Riven disposition, Mastery rank; reverse button) exactly like Warframes.
- **Grouped by slot:** with "All", each slot is a block with a Label heading and its count ("PRIMARY · 153"); one slot chip shows that block only. Sorting applies inside each block.
- **Tiles** (Warframes tile, same size and cut): the whole weapon picture (`object-fit: contain`, square, lazy), the name, then a line with "MR 8" (tabular; Dim Readout, gold when above your MR) and the disposition as 5 small dots (filled = disposition; `aria-label` "Riven disposition 4 of 5"), badges: Incarnon (teal outline), prime/vandal/mk1 versions, mastered. Star button as on Warframes.
- Everything chosen (tab, slot, class, mastery, Incarnon, search, sort) is remembered when you come back; focus returns to the tile you opened.

### Page (`#/weapons/{slug}`)

- "← All weapons" (back to the tab it came from).
- **Header panel** (gold accent): the picture in a cut-corner frame (whole, contained), the name (gold page title), the **version switch** when there's more than one (Normal · Prime · Vandal · Mk1), star, badges (slot · class, mastered, vaulted, Incarnon, "MR 8"), release line, description.
- **Attacks** panel: a segmented switch of the attacks (only when more than one; names translated where common), then one stats block: total damage + the damage-type breakdown (type name and amount, tabular), Critical chance and multiplier, Status chance, fire rate / attack speed, shot type, charge time when present.
- **Weapon stats**: definition list: Magazine, Reload, Multishot, Trigger, Accuracy, Noise (guns) or Range (melee), Riven disposition (dots + the exact multiplier "×1.20"), Mastery rank.
- **How to get it**: the same section as the Warframe page (parts, drops/relics, materials, Add as goal / In your goals / Built).
- **Incarnon**: only for Incarnon weapons, a short panel: "Has an Incarnon form" + the note that evolutions come in a later update (PR 3 fills it).
- **Your progress**: mastered or not, or "Import your profile to see this".
- Credit line: "Classes: Warframe wiki (CC BY-SA). Data and images: warframestat.us, from Digital Extremes."

## States

List: loading; first load offline (message + Retry); stale line; nothing matches (status line, announced); no profile (Mastery filter still works on "Not mastered" = everything; MR never gold). Page: loading; unknown slug (message + back link); missing picture (empty frame keeps size); no recipe ("Not in the data"); single attack (no switch).

## Constraints and anti-goals

- Strings through `t()` in en and es; classes, slots and damage types translated in the UI (glossary).
- No new colour, no new dependency, no charts or stat bars, no modal, no comparison table (out of scope).
- Keyboard: tabs are links; slot, mastery, version and attack switches are radio groups; tiles are links; focus visible.
- Weapon builds are a later PR: leave room, add nothing.

---

# Addendum: Incarnon (part 3, 15 Nov 2026)

- **Weapon page:** an "Incarnon evolutions" panel (gold accent) after Attacks, for every version with evolutions. One line says where they come from (the Genesis adapter you install, or the weapon's own form) and that you pick one perk per evolution. When the adapter is in this week's Steel Path Circuit: a teal "In the Circuit" badge and one plain line. In Spanish, a muted line says the perk texts are the wiki's English (DE publishes none); the English text carries `lang="en"`.
- **Tiers:** one row per tier (top seam): the tier as a gold Label ("EVOLUTION 2") and what unlocks it in Dim Readout on the left; the perks beside it as quiet inset cells (surface-2, thin seam, never framed cards), auto-fit ~14rem. Stacked on phones. A wiki link closes the panel.
- **List:** "In the Circuit" as a teal badge on the tile (live data); Incarnon becomes a plain badge. The Incarnon filter now also counts weapons whose Incarnon is only on the wiki (most melee).
- **Anti-goals:** no tracking of which perks you chose (not asked), no images of perks, no machine translation.

---

# Addendum: Weapon builds (part 2 UI, 16 Nov 2026)

Follows **the Warframe Builds page** and **the build edit page** (DESIGN.md "Builds page", "Build edit page"); SPEC §15.1. Same job: a personal library, read before playing, entered by hand.

- **Weapon page tabs:** Overview · Builds (n), as on the Warframe page (links with `aria-current`). On Builds the header shrinks to one line (picture, name). Addresses `#/weapons/{slug}/builds`, `…/builds/{id}`, `…/builds/{id}/edit`, `…/builds/new(?import)`.
- **Builds page:** the shared build list (BuildsPage, now generic): entries show the version ("Braton Prime"), the description line, author · update, and marks (arcane pictures, an "R" Riven tag when it has one). ↑/↓, `[` `]`, Add a build, Paste a code.
- **Open build:** the title row as on Warframe builds (meta, description, Share, Edit; no "How to play"). One framed **Mods** section: Exilus and Stance as the pair (only those the weapon has), then 8 Mod Cards. Beside it (a 19rem column from 75rem) the **loadout**: Arcanes (picture, name R5/5, effect), **Incarnon** (one row per picked tier: "EVOLUTION 2" Label, the perk name, its lines muted, the note), **Riven** (name and polarity, then each stat as a row: + in Readout White, − in Alert Rose, values in tabular digits), **Progenitor** ("Toxin 60%").
- **Edit page:** About (name, description, source, author, update), **Version** (Segmented; changing it reloads what fits), Mods (Exilus/Stance pair, 8 slots: the Warframe edit page's cells and Picker), Arcanes (one or two slots, or none), Incarnon (one Segmented per tier 2–5 listing its perks, "None" first; the chosen perk's lines under it, a note), Riven (name, polarity Segmented, up to 4 stat rows: stat select from the weapon type's list, value field, "negative" checkbox only where allowed; Add a stat), Progenitor (Kuva/Tenet/Coda only: element select, % number 25–60). Import panel, leave guard, Save/Cancel/Delete as on Warframe builds.
- **List:** "n builds" as a plain badge on tiles; a **With builds** checkbox next to Incarnon only.
- **Anti-goals:** no guide, no stat maths or DPS, no Riven grading, no new colour.

---

# Addendum: Pagination (16 Nov 2026)

The list showed all ~450 tiles at once. Confirmed with Alex: numbered pages, 48 a page, the slot groups flow across pages.

- **Where:** in the browser (the list is already loaded, filtered and sorted there); the page is in the address (`#/weapons?page=3`, `#/weapons?tab=arch&page=2`), so Back, reload and a shared link keep it. A page past the end shows the last one.
- **Count line** above the tiles ("Showing 49–96 of 453 · Page 2 of 10"), quiet like the meta line; it takes focus after the pager is used and the page scrolls back to it.
- **Slot headings** appear where a slot's weapons start; the heading's number is the slot's whole count, and "continued" follows it when the slot began on an earlier page.
- **Pager** (below the tiles, only with more than one page): outlined Previous / numbers / Next in the Segmented control's look, the current page gold on a gold tint (`aria-current="page"`), `…` for gaps, a disabled step at each end. On phones: Previous · "Page 2 of 10" · Next (no numbers).
- A new search, filter, slot or order goes back to page 1. Opening a weapon and coming back returns to the same page.
- **Anti-goals:** no infinite scroll, no per-slot pagers, no page-size picker.
- **After the critique (27/40):** a row under the count line with **slot jumps** (each slot's first page) and compact ‹ › steps, so a page can be turned without scrolling; the bottom pager is left-aligned with 40px cells; "cont." is visible and "continued" is spoken; disabled steps say "(first page)" / "(last page)" to screen readers.

---

# Addendum: Build costs (20 Nov 2026)

Alex asked for the total Forma and the Endo to max the mods, on Warframe and weapon builds. Decisions: Forma is typed by the author (builds hold no slot polarities); Endo is computed to each mod's maximum rank. Placement: a quiet readout on the Mods title row (follows the Warframe Builds page), not a new section; edit field beside Game update. Anti-goals: no capacity or drain maths, no per-slot polarity picker, no Endo for arcanes or Rivens.
