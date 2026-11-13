# Surface brief: Warframes (`#/warframes` and `#/warframes/{slug}`)

Visual authority: `DESIGN.md` ("The Orbiter Console"), unchanged, plus one new rule for **DE images as content** (below). Screens to follow: the list follows **Inventory** (filter row, frame panels, rows); the page follows **Profile/Settings** (one column of `.frame` panels, definition lists, muted hints).

## Job and audience

Alex, between missions or while planning: "what does Mesa do, what are the numbers, which augments, how do I get her, have I mastered her?" He opens a Warframe, reads one or two sections, maybe adds it as a goal, goes back. Reading in English (not his first language): short labels, plain words.

## Modes

- **List: Operate.** Find a Warframe fast: filter, scan, click.
- **Page: Read.** A reference page: clear structure, numbers easy to find, the ability section is the heart.

## Outcome and proof

- Primary task: open a Warframe and find an ability's numbers or the augments in seconds.
- Second: see how to get it and add it as a goal; see whether it's mastered.
- Real evidence: warframestat.us data, plus the wiki's ability numbers (credited and linked per ability); DE's images, cached locally.

## Selected direction

### List (`#/warframes`)

- Header row: title + filter ("Find a Warframe"), like Inventory. A muted line under it: "65 Warframes · Updated 11 Nov · Refresh" (Refresh is a small text button; disabled while locked, with the time).
- A responsive grid of compact **tiles**: the portrait (fixed aspect, 1:1 crop of the top of the image, lazy-loaded), the name, small badges: "prime", "umbra", "mastered". Tiles are links (whole tile), keyboard-focusable, A–Z. Not cards-with-icon-heading-text: a portrait tile is the content itself.
- Phone: 3 columns of tiles; desktop: auto-fill ~9rem.

### Page (`#/warframes/{slug}`)

- A "← All Warframes" link.
- **Header panel** (`.frame.accent`): portrait (left, ~10rem, fixed size), then the name (gold h2), the **version switch** (a segmented control: Normal · Prime · Umbra, real radio buttons, only the versions that exist), badges (mastered, vaulted, "MR 8"), "Released 22 Dec 2016 (Update 19.5)", and the description. On phone the portrait sits above.
- **Passive** (short panel or a line in the header): the wiki's text.
- **Abilities**: four rows (not cards), each: icon (48px, inside a thin cut-corner frame like the console's marks), the key number "1"–"4", the name, the description, then a compact **numbers** list: Energy cost · Strength · Duration · Range · Misc lines (rank values "10 / 11 / 13 / 16 m" in tabular digits), Helminth badge when subsumable, its augments by name, and "Wiki" link (credit). Abilities without numbers say nothing extra (no "unknown" noise).
- **Augments**: list of augment mods: name, the ability it changes, its effect (max rank), and "Sold by: Red Veil, Steel Meridian".
- **Stats and polarities**: definition list: Health, Shield, Armor, Energy, Sprint; with the wiki's rank-30 value where it differs ("350 (450 at rank 30)"). Aura polarity and slot polarities as words (Madurai, Vazarin…).
- **How to get it**: the goal planner's parts with their best drop/relic (reuse DropList/relic logic), vaulted note, quest source, crafting materials per part. Button **Add as goal** → becomes "In your goals" (link to Goals) or "Built".
- **Your progress**: mastered (or "Import your profile to see this" link when no profile), goal status.
- Footer credit: "Ability numbers and passive: Warframe wiki (CC BY-SA). Data and images: warframestat.us / Digital Extremes."

## Images (new rule for DESIGN.md)

DE images are **content**, never decoration: portraits and ability icons only, always with `alt`, fixed `width`/`height` (no layout shift), `loading="lazy"` in the list, sitting on the console surface inside thin frames; no filters, glows or tints on them; no image used as a background.

## States

- List: loading; first load offline (the API's message + Retry); stale (muted "Offline: saved list from {date}"); filter no match (status line).
- Page: loading; unknown slug ("No Warframe called…" + link back); missing image (empty frame keeps its size); no numbers for an ability (just description); no augments (section hidden); no recipe (section says "Not in the data").

## Constraints and anti-goals

- Strings through `t()`. No new dependency. Colours from tokens; no new colour.
- No hero metric, no stat bars or radar charts, no modal, no carousels, no ability videos, no skins/cosmetics.
- Keyboard: tiles are links; the version switch is a radio group; focus visible.

---

# Addendum: Builds (13 Nov 2026)

Builds section on `#/warframes/{slug}` and the edit page `#/warframes/{slug}/builds/new` · `/builds/{id}`. SPEC §14.1. Visual authority: `DESIGN.md` unchanged, plus the slot grid and mod/arcane images below.

## Job and audience

Alex, about to play a Warframe: "which of my saved builds, what goes where, and how do I play it?" He picks a build tab, scans the mods, reads the guide, alt-tabs back. Less often, after watching a video or reading Overframe, he copies a build in by hand (5–10 minutes, at the desk).

## Modes

- **Builds section: Read.** A reference card: the setup must scan in seconds; the guide is the long read.
- **Edit page: Operate.** A form with pickers. Fast, forgiving, keyboard-friendly.

## Outcome and proof

- Primary: open a build and see its mods and how to play it without leaving the page.
- Second: enter a build quickly from another source, with real mod names (picked, never typed free).
- Evidence: the API's resolved builds (mod effect at the chosen rank, polarity, image), warframestat.us data, the wiki-checked shard stats.

## Selected direction

### Builds section (after Abilities)

- A `.frame` panel, gold corner tick (planning, like Goals). Header row: "Builds" (gold `h3`) and a teal **Add a build** link on the right.
- **Tabs**, one per build, in Alex's order: a real `tablist` (arrow keys, Home/End), styled like the version switch (segmented, chosen = gold on a gold tint). Wraps on narrow screens. The last tab opened is remembered per Warframe (`localStorage`, wrapped in try/catch). ↑/↓ icon buttons next to the tabs move the selected build earlier/later.
- **The selected build** (`tabpanel`), top to bottom:
  1. Source line, muted: "From {author} · {patch} · Saved 13 Nov 2026" + the source as a teal external link (host name, e.g. "overframe.gg", new tab, hidden "(opens in a new tab)"), then an **Edit** link on the right.
  2. **Mods**: Aura and Exilus side by side under small Labels, then the 8 slots in a grid (4 per row desktop, 2 on phones, 1 under ~24rem). Each **Mod Tile**: 40px image in the small cut-corner frame (as ability icons), name (600), "R5 · Madurai" (tabular rank, Dim Readout), the effect at that rank (0.85rem, lines kept), and Alex's note in Readout White italic-free, marked with a short gold "Note" label. Empty slots: a dashed-feel muted "Empty" tile at the same height-ish, never hidden (the grid keeps 8 places).
  3. **Arcanes** (2 tiles like mods), **Archon Shards** (rows: a shard-colour square + the stat text + "Tauforged" badge), **Helminth** ("Replaces {ability}: {Roar} (Rhino)" + wiki link), **Weapons** (rows: name + note). Each sub-group appears only when it has something.
  4. **Guide**: rendered light Markdown, held to 64ch, headings in the display face (gold h4/h5 sizes from the ramp), lists, bold/italic, teal links.
- **Not the owning version** (e.g. Mesa selected, builds on Mesa Prime): the panel shows one muted line "Builds are on Mesa Prime." with a teal button-link "Show Mesa Prime" that switches the version switch.
- **No builds yet**: "No builds yet. Save one you found on Overframe, YouTube or anywhere." + **Add a build**.

### Edit page

- Same column as the Warframe page. "← Back to Mesa" link; gold `h2` "New build for Mesa Prime" / "Edit {name}".
- Panels in order: **About** (Name, Source link, Author, Patch: labelled fields), **Mods** (the slot grid again, each slot a button "Choose a mod" / the chosen mod with Rank select 0–max, Note field, Remove), **Arcanes**, **Archon Shards** (up to 5 rows: stat `select` grouped by colour, Tauforged checkbox, note, remove; "Add a shard"), **Helminth** (Replaces `select` 1–4 by ability name + ability picker + note), **Weapons** (search via the item search, weapons only; name + note rows), **Guide** (textarea, a one-line hint "## Heading, **bold**, _italic_, - list, [link](https://…)", and a Write / Preview toggle).
- **Picker**: choosing a slot opens an inline search (combobox + listbox) right under it, filtered to what fits that slot (auras for Aura, Exilus-capable for Exilus, no mod already used); each option shows name, polarity and max-rank effect. Enter picks; Esc closes and returns focus. Rank defaults to max.
- Footer: primary **Save build**, **Cancel**; on edit also danger **Delete build** with the inline confirm ("Delete {name} for good?" Yes / Cancel). Server errors (400 messages) show in a rose alert at the top and next to Save, focus moves there. Save returns to the Warframe page with that tab selected.

## States

Loading (muted line), options failed (alert + Retry), save failed (rose, keeps all input), unknown build id (alert + link back), mod no longer in the data (tile shows the saved name, "Not in the game data now" muted, no image), image failed (empty frame keeps size), offline images (served from cache).

## Constraints and anti-goals

- Strings via `t()`; no new dependency (own small Markdown renderer, escaped first, http(s) links only).
- Three new shard tokens (`shard-emerald`, `shard-topaz`, `shard-violet`) with measured contrast, used only for shard swatches/badges.
- Mod/arcane images are content (DE images rule): framed, fixed size, `alt=""` next to the name, no tints.
- No capacity/Forma maths, no stat totals, no drag-and-drop (↑/↓ instead), no modal dialogs, no browser confirms.
