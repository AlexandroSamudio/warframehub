---
name: WarframeHub
description: A personal Warframe companion. Weekly checklist, reset clocks and live rotations, read between missions.
colors:
  void-black: '#07090d'
  hull-panel: '#10151e'
  hull-inset: '#171e2a'
  seam-line: '#2c3749'
  seam-line-strong: '#5a6b88'
  readout-white: '#e6e9ef'
  dim-readout: '#9ba7ba'
  orokin-gold: '#d6b465'
  void-teal: '#66cbd9'
  status-green: '#78cc9d'
  alert-rose: '#ec8a8a'
  shard-crimson: '#ec6e66'
  shard-amber: '#e8ac4c'
  shard-azure: '#68b2ee'
typography:
  display:
    fontFamily: 'Rajdhani, Segoe UI, system-ui, sans-serif'
    fontSize: '1.9rem'
    fontWeight: 700
    lineHeight: 1
    letterSpacing: '0.08em'
  headline:
    fontFamily: 'Rajdhani, Segoe UI, system-ui, sans-serif'
    fontSize: '1.2rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '0.04em'
  title:
    fontFamily: 'Rajdhani, Segoe UI, system-ui, sans-serif'
    fontSize: '1.05rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '0.04em'
  body:
    fontFamily: 'Inter Variable, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Rajdhani, Segoe UI, system-ui, sans-serif'
    fontSize: '0.8rem'
    fontWeight: 600
    letterSpacing: '0.12em'
  readout:
    fontFamily: 'Inter Variable, system-ui, sans-serif'
    fontSize: '1.6rem'
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: '-0.01em'
    fontFeature: 'tnum'
  readout-compact:
    fontFamily: 'Inter Variable, system-ui, sans-serif'
    fontSize: '1.3rem'
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: '-0.01em'
    fontFeature: 'tnum'
  body-compact:
    fontFamily: 'Inter Variable, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '0.9rem'
    fontWeight: 400
    lineHeight: 1.5
  field:
    fontFamily: 'Inter Variable, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: 'Inter Variable, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '0.85rem'
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: 'Inter Variable, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 400
    lineHeight: 1.4
  badge:
    fontFamily: 'Rajdhani, Segoe UI, system-ui, sans-serif'
    fontSize: '0.72rem'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '0.08em'
rounded:
  none: '0px'
components:
  button:
    backgroundColor: 'transparent'
    textColor: '{colors.readout-white}'
    typography: '{typography.label}'
    rounded: '{rounded.none}'
    padding: '0.2rem 0.8rem'
  button-primary:
    backgroundColor: 'transparent'
    textColor: '{colors.orokin-gold}'
    typography: '{typography.label}'
    rounded: '{rounded.none}'
    padding: '0.2rem 0.8rem'
  button-teal:
    backgroundColor: 'transparent'
    textColor: '{colors.void-teal}'
    typography: '{typography.label}'
    rounded: '{rounded.none}'
    padding: '0.2rem 0.8rem'
  button-danger:
    backgroundColor: 'transparent'
    textColor: '{colors.alert-rose}'
    typography: '{typography.label}'
    rounded: '{rounded.none}'
    padding: '0.2rem 0.8rem'
  input:
    backgroundColor: '{colors.hull-inset}'
    textColor: '{colors.readout-white}'
    rounded: '{rounded.none}'
    padding: '0.25rem 0.5rem'
  panel:
    backgroundColor: '{colors.hull-panel}'
    textColor: '{colors.readout-white}'
    rounded: '{rounded.none}'
    padding: '0.95rem 1.15rem'
  badge:
    backgroundColor: 'transparent'
    textColor: '{colors.dim-readout}'
    rounded: '{rounded.none}'
    padding: '0 0.4rem'
---

# Design System: WarframeHub

## Overview

**Creative North Star: "The Orbiter Console"**

WarframeHub reads like a ship terminal you check between missions. Everything sits on a near-black void. Information lives on dark hull panels outlined by thin seams, with two corners cut off. Orokin gold trims the things that name and frame (titles, the active nav item, a clock that's about to reset). Void teal marks what is live or interactive (rotation cards, ticked slots, focus). The console is **precise and quiet**: thin lines, uppercase labels, very little fill. The data is the star.

Most visits are an alt-tab: a few seconds to see what's left and when it resets, then back to the game. So the console favours glanceable structure over decoration. Countdowns are the largest type on screen. Every time is shown in local time with UTC beside it. State is said in words and colour together (Live, Estimated, May be outdated, Check in game). It is dark by design; there is no light mode. All shapes are original. No game art, logos or copied UI.

**Key Characteristics:**

- Near-black void with soft gold and teal glows at the top corners of the page
- Flat hull panels with two cut corners and a 1px seam that follows the cut
- Rajdhani for names and labels, Inter for reading and for every number that changes
- Gold = names and emphasis; teal = live, interactive, focus; green and rose = status only
- Thin outlined controls with uppercase labels; no solid fills, no rounded corners, no shadows

## Colors

A dark, cool-neutral console with two restrained accents and a small set of status and lore colours.

### Primary

- **Orokin Gold** (`orokin-gold`): section and screen titles, the app name and mark, the active nav item, primary buttons (outline + text), "edited" and "verify" badges, and the highlight on a reset clock that's close (border and countdown). It is trim, not paint: never a large filled area.

### Secondary

- **Void Teal** (`void-teal`): everything live or interactive. Rotation card titles and their corner tick, ticked counter slots, checkbox accent colour, the progress bar fill, "Estimated" badges, teal buttons (Refresh, Add) and the keyboard focus ring.

### Tertiary

- **Status Green** (`status-green`): "Live" badges, "Done" on a finished section, and that section's seam and progress fill. Only means success or done.
- **Alert Rose** (`alert-rose`): errors, failed saves and destructive buttons (Delete, Quit). Only means problem or danger.
- **Shard colours** (`shard-crimson`, `shard-amber`, `shard-azure`): only for Archon shard badges, matching each shard's in-game colour name.

### Neutral

- **Void Black** (`void-black`): the page background, under two very soft radial glows (teal about 7%, gold about 6%).
- **Hull Panel** (`hull-panel`): the inside of every framed panel (sections, clocks, rotation cards, editor cards).
- **Hull Inset** (`hull-inset`): inputs, selects, textareas, counter chips and the empty progress track. One step lighter than the panel, so fields read as recessed slots.
- **Seam Line** (`seam-line`): panel outlines and dividers between list rows.
- **Strong Seam** (`seam-line-strong`): control borders (buttons, inputs, chips). At least 3:1 on every background.
- **Readout White** (`readout-white`): main text.
- **Dim Readout** (`dim-readout`): secondary text: reset lines, descriptions, fetch ages, labels. At least 6.8:1 on every background.

### Named Rules

**The Two Accents Rule.** Gold names and frames; teal signals live or interactive. A new element picks one by its job, never both. Green and rose are only for status.

**The Measured Contrast Rule.** Every text colour stays at least 5.5:1 on every background, and control borders at least 3:1. A new colour gets its contrast checked before it ships.

## Typography

**Display Font:** Rajdhani (with Segoe UI, system-ui, sans-serif), bundled, SIL OFL 1.1
**Body Font:** Inter Variable (with system-ui, -apple-system, Segoe UI, Roboto, sans-serif), bundled, SIL OFL 1.1

**Character:** Rajdhani's squared, technical letters give titles and labels the console voice. Inter keeps body text and numbers calm and readable. Both are bundled; nothing is loaded from font services.

### Hierarchy

- **Display** (Rajdhani 700, 1.9rem, line-height 1, 0.08em, uppercase): the app name in the header only.
- **Headline** (Rajdhani 600, 1.2rem, 1.2): checklist section titles and screen titles, in gold.
- **Title** (Rajdhani 600, 1.05rem, 1.2): rotation card titles (teal) and editor section names.
- **Body** (Inter 400, 15px, 1.5): item titles, descriptions, rotation details. Descriptions and meta lines are 0.8–0.9rem in Dim Readout.
- **Label** (Rajdhani 600, 0.8rem, 0.12em, uppercase): clock names, group headings, nav links, button text (0.85rem, 0.06em) and badges (0.72rem, 0.08em).
- **Readout** (Inter 600, 1.6rem, 1.15, tabular digits): reset countdowns. The same tabular Inter at body sizes is used for every changing number (progress counts, "Resets in…", times).
- **Readout compact** (Inter 600, 1.3rem, tabular digits): the countdown on phones (under 30rem).

**Small steps** (the full ramp below body; use these, not new sizes):

- **Body compact** (0.9rem): the text inside rotation cards.
- **Field** (0.875rem): inputs, selects and textareas.
- **Small** (0.85rem): button and nav labels (in Rajdhani), reset lines, progress counts, item descriptions, Settings hints.
- **Label** (0.8rem): see above.
- **Caption** (0.75rem): fetch ages, editor field labels, phone clock times.
- **Badge** (0.72rem, Rajdhani 600, uppercase, 0.08em): badges only.

### Named Rules

**The Steady Digits Rule.** Every number that changes uses Inter with tabular digits. Rajdhani has no tabular digits (measured: digit widths differ by about 60%), so it would make countdowns jitter. Rajdhani is for names and labels only.

**The Uppercase Is a Label Rule.** Uppercase with wide letter spacing is reserved for labels, buttons, badges and the app name. Titles and content stay in sentence case.

## Layout

- **Page:** a centred column, at most 90rem wide, with 1rem side padding (1.5rem top). The header has the mark, the name and a tagline on the left and the nav on the right. A thin seam separates the footer.
- **Tracker:**
  - reset clocks in a self-filling grid (`auto-fit`, minimum 8.75rem; two per row on phones);
  - below them, two columns: the checklist (a grid of section panels, minimum 22rem each) and the live-rotations column (17–22rem);
  - under 60rem the columns stack, rotations after the checklist.
- **Spacing:** a compact rem rhythm: 0.5rem between clocks, 1rem between panels and columns, 0.4–0.6rem inside lists. Panels use about 1rem of inner padding.
- **Density:** glanceable but compact. One panel holds a whole section, so a section reads without scrolling inside it.
- **Responsive:** no sideways scrolling at any width (checked at 360 px, 768 px and desktop). Below 30rem the clocks shrink a step (countdown 1.3rem).

## Elevation & Depth

The console is flat. There are no shadows anywhere. Depth comes from tonal layering: Void Black page, Hull Panel surfaces, Hull Inset fields. A 1px seam outlines each panel, and the cut corners give the silhouette. State is shown with colour on the seam (gold when a reset is close, green when a section is done), never by lifting a panel.

### Named Rules

**The Flat Hull Rule.** No `box-shadow`, no glows on components. A surface that needs to stand out changes its seam colour or its background step, not its height.

## Shapes

- **Corners:** square everywhere (0 radius). The signature shape is the frame:
  - a panel with the top-right and bottom-left corners cut at 45°, 12px (10px on clocks and rotation cards);
  - a 1px seam that follows the cut;
  - a 2.5rem, 2px corner tick on the top-left, gold on checklist and editor panels, teal on rotation cards.
- **Controls** are square outlines. Badges are small outlined uppercase tags. The header mark is an original SVG of two nested diamonds with four short spokes.

### Named Rules

**The Cut Corner Rule.** Panels that hold content use the frame shape (`.frame`). Nothing gets rounded corners.

## Components

### Buttons

- **Character:** precise and quiet. A thin outline and an uppercase Rajdhani label, with no fill at rest.
- **Shape:** square (0px), 1px Strong Seam border, padding 0.2rem 0.8rem.
- **Variants:**
  - default: Readout White text;
  - **primary**: gold outline and text (Edit checklist, Clear);
  - **teal**: teal outline and text (Refresh, Add item, Add section);
  - **danger**: rose outline and text (Delete, Quit, Restore);
  - **icon**: ↑/↓, tighter padding.
- **Hover:** the border turns gold (or keeps its variant colour) and the background gets a 12% tint of that colour. Transitions are 120ms, and only when reduced motion isn't requested.
- **Disabled:** 45% opacity and the default cursor.
- **Destructive actions** always use an inline confirm step (a "Delete for good?" or "Stop WarframeHub now?" line plus Yes / Cancel). No browser dialogs.

### Badges

- **Style:** 1px border in the text colour, Rajdhani 600, 0.72rem, uppercase, 0.08em, padding 0 0.4rem, no fill.
- **Colours by meaning:** gold (verify, edited), teal (estimated, custom), green (Live, Done), muted (hidden, Check in game), shard colours (Archon shards).

### Panels (`.frame`)

- **Corner style:** the cut-corner frame (see Shapes). The seam is drawn by layering, so it follows the cut.
- **Background:** Hull Panel. Seam: Seam Line, or gold when a reset is close, or green when a section is done.
- **Shadow strategy:** none (see Elevation & Depth).
- **Internal padding:** about 1rem (0.95rem 1.15rem on sections, 0.65rem 0.9rem on clocks).

### Inputs / Fields

- **Style:** Hull Inset background, 1px Strong Seam border, square, padding 0.25rem 0.5rem, 0.875rem. Placeholders are Dim Readout.
- **Focus:** the border turns teal and a 2px teal outline appears.
- **Checkboxes** are native, with the teal accent colour. Counter slots are small Hull Inset chips with a number; a ticked chip turns teal (border, text, 10% fill).

### Navigation

- **Style:** Rajdhani 600, 0.85rem, uppercase, 0.1em, Dim Readout. Hover turns Readout White.
- **Active item:** gold text with a 2px gold underline. It sits on the right of the header and wraps under the name on narrow screens.

### Reset Clock (signature)

A compact frame per reset:

- the label (e.g. DAILY);
- a large tabular countdown;
- the local time and UTC ("Tue 21:00 · 00:00 UTC");
- an "≈" mark plus an "estimated" badge when there's no live data.

When the reset is close (under 3 hours, or under 24 hours for weekly and every 4 days), the seam and countdown turn gold and the gold corner tick appears.

### Rotation Card (signature)

A teal-ticked frame:

- the title in teal, with the freshness badge on the right;
- the body (lead line in bold, details in Dim Readout, long descriptions folded into `<details>`);
- a footer with the fetch age ("Fetched 3m ago"), or "Offline: showing the copy fetched…" in gold when stale.

### Farm Queue (signature, Goals screen)

A gold-ticked frame titled "What to farm next", with three groups under Label headings:

- **Farm now:** best chance first. The part name is bold, followed by "for Nidus Prime". A Readout White line names the best source (location + chance, or "Best: Axi N12 · up to 10% (Radiant)").
- **Vaulted: trade or wait:** one explanatory line for the whole group, then compact rows with a single line of relic names.
- **Resources:** the name, "for X and Y", the missing amount in gold, and an amount field on the right.

### Relic Row

One row per Void relic, with its four refinement chances in tabular digits: "Axi N12 2% / 4% / 6% / 10%". A small legend above reads Intact / Exceptional / Flawless / Radiant. No rarity label (the upstream one flips between refinements). Missions and enemies keep "location · chance".

### Goal Card

A folded frame (10px cut). The header row has:

- an `h3` button with a chevron icon and the name in gold;
- badges (prime, vaulted, ready to build in green);
- a 4px progress bar and "x of y".

When open, it gets the gold corner tick and 32px ↑/↓ icon buttons. Parts are checkboxes (or a count field). Resources show this goal's **share** in green when covered and in gold when short ("7 of 10 for this goal · 3 short"), next to the shared amount field. A ready goal's seam turns green.

### Materials Line

Under a crafted part in a goal card: a small "TO CRAFT" label (Rajdhani, uppercase), then the materials as **quantity + name pairs** (quantity 600 weight in Readout White with tabular digits, name in Dim Readout, 0.85rem). Each pair is one unbreakable unit (`nowrap`), so it never splits across lines, and the list is a real `<ul>` with a label for screen readers. Credits come first, then A–Z.

### Goal Card resources

Two groups under Label headings: **For {item}** (the item's own recipe; a row that also includes parts says "incl. 45,000 for parts") and **Only for parts, until you have them**. Each group lists what's most missing first. Owning a part removes its materials.

### Part Note

A single-line text field (200 characters) with a visible label above it, saved on change with a polite "Saved" (same pattern as the Amount Field). It appears for parts no drop table lists ("Get another way" in the farm queue, and on the part in its card). Above it, when the Warframe wiki names a quest, one line: **"Quest:"** (600 weight, Readout White), the quest's name as a teal external link (new tab, `noopener noreferrer`), and "· Warframe wiki" in Dim Readout. The label then reads "Your own note (shown instead of the wiki)"; without a source it reads "Where do you get this?". A typed note replaces the wiki line.

### Amount Field

A right-aligned tabular input with thousands separators. Under it, a reserved message line: rose "Whole numbers only" (`aria-invalid`, `aria-describedby`), or green "Saved" for 2 seconds (polite live region). Leaving an invalid entry restores the saved amount.

### Icons

Drawn inline SVG only (`Icon.svelte`): 16px box, 1.5px stroke, square caps and miter joins, `currentColor`, decorative (`aria-hidden`); the control carries the label. Never Unicode glyphs as icons.

## Do's and Don'ts

### Do:

- **Do** build new content areas as `.frame` panels on Hull Panel, with a gold corner tick for checklists and planning and a teal one for live data.
- **Do** use Inter with tabular digits for every number that changes, and show local time with UTC beside it.
- **Do** use the shared button, input and badge styles in `app.css`, not one-off copies in components.
- **Do** say state in words and colour together (Live / Estimated / May be outdated / Check in game; Done; verify).
- **Do** keep text at least 5.5:1 and control borders at least 3:1, with a visible teal focus ring on every control.
- **Do** confirm destructive actions inline (Yes / Cancel), never with a browser dialog.

### Don't:

- **Don't** add shadows, glows on components, rounded corners or solid-filled buttons.
- **Don't** use Rajdhani for changing numbers (it has no tabular digits).
- **Don't** use gold and teal on the same element, or green and rose for anything but status.
- **Don't** use DE logos, game art or copied UI assets; decoration is original CSS or SVG geometry.
- **Don't** add a light theme; the console is dark by design.
- **Don't** show cosmetic content (decorations, furniture, skins).
