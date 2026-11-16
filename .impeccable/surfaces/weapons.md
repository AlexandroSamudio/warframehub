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
