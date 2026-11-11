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
