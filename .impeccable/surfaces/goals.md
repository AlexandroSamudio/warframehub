# Surface brief: Goals (`#/goals`) and the Tracker goals card

Mode: **Operate**. Visual authority: `DESIGN.md` ("The Orbiter Console"), unchanged. The screen to follow: the Tracker (`apps/web/src/routes/Tracker.svelte`).

## Job and audience

Alex, alt-tabbed out of Warframe between missions, or planning before and after a session. He has 4–8 active goals (Warframes and weapons he wants to build). In seconds he needs to know **what to farm next** and where, then go back to the game. Occasionally he adds a goal, ticks a part he just got, or types how much of a resource he has.

## Outcome and proof

- **Primary task:** read the "what to farm next" list. Each missing part or resource shows which goal(s) need it and its best place to farm.
- **Success:** one glance answers "what do I do this mission?", with no clicks.
- **Real evidence:** the data comes from warframestat.us (drop location, rotation, rarity, chance), plus what Alex enters. Shown truthfully:
  - Prime parts list relics, with **Vaulted** when the item is;
  - parts with no drop data say "Not in drop tables (quest, market or vendor)";
  - sub-recipes aren't in the data, and the screen says so.

## Selected direction

Inside the established world. No new visual identity.

1. **Header row:** the title, plus search ("Add a goal") as an inline field. Results appear in a list under it, each with Prime/Vaulted badges and an Add button.
2. **"What to farm next"** (the focal block, first): one panel listing every missing item across active goals, most-needed first.
   - **Parts:** name, the goal it's for, and the top drop location with its chance (relic name for Prime parts).
   - **Resources:** "have / need", with an inline amount field. This edits the shared stock.
   - Each row can fold open to show all drops.
3. **Active goals:** compact cards (name, badges, progress bar, "x of y"), **folded by default**. Opening one shows its parts (checkboxes, or counters if count > 1), its resources, and its actions: Mark as built, Update recipe, Remove, ↑/↓.
4. **Completed:** a collapsed list of built goals, with "Bring back".

**Tracker card:** in the right column, above Live rotations. Up to 5 active goals, each with name and progress only, plus a link to Goals. Hidden when there are no goals.

## Scope and boundaries

- In scope: production-ready screen, full flow (search, add, tick, stock, built, reactivate, remove, reorder, update recipe) and the Tracker card.
- Untouched: the Tracker's other sections, the theme, the API.
- Anti-goals:
  - no hero metric or dashboard tiles;
  - no nested cards;
  - no modal dialogs (inline confirms only);
  - no game art;
  - no eyebrow labels above headings.

## States and ranges

- **Empty:** no goals, so a short line and the search field. The Tracker card is hidden.
- **Search:** fewer than 2 letters (hint), searching, no results, offline (cached results marked "offline", or the error message).
- **Goals:** 1–20 active, typically 4–8. Names up to about 30 characters. Up to 6 parts and 6 resources per goal. Drop lists from 0 to about 80 entries (show the top 5, then "show all").
- **Amounts:** up to 9 digits (Credits). Use tabular digits and thousands separators.
- **Errors:** an inline alert in the Tracker's style; the page never goes blank.

## Interaction and layout

- **Desktop:** one main column (at most about 60rem), "what to farm next" first, then the goal cards, then Completed.
- **Phone (390 px):** same order. Rows wrap; no sideways scrolling.
- **Feedback:** ticks and amounts update right away from the server's answer. "Done" shows in green when a goal is ready to build.
- **Keyboard:** everything reachable; disclosure uses `<details>`/`<summary>` or buttons with `aria-expanded`.
- **Icons:** drawn inline SVG, one stroke weight, for ↑/↓ and the disclosure chevron. No Unicode glyphs standing in for icons.

## Constraints

- Strings go through `t()`.
- Reuse `.frame`, `.badge`, the button and input styles, `.num`, and the progress bar pattern from `SectionCard.svelte`.
- Contrast stays at the `DESIGN.md` floors.
- No new dependencies.

## Changes after the critique (10 Nov 2026, score 26/40; Alex chose the fixes)

- **Shared stock is split in goal order:** the higher goal takes its share first, and cards show "5 of 5 for this goal" / "7 of 10 for this goal · 3 short". Progress and "ready to build" use the share. ↑/↓ sets the priority.
- **"What to farm next"** is now **Farm now** (best chance first, no drop data last) plus a compact **Vaulted: trade or wait** group. The vaulted note is shown once, and each vaulted row gets one line of relic names.
- **Relic drops** show one row per relic with Intact / Exceptional / Flawless / Radiant chances. The upstream rarity is dropped for relics (it flips between refinements).
- **Amount fields** (`AmountField.svelte`): "Whole numbers only" (described, `aria-invalid`), a polite "Saved", formatted reverts, and plain error copy.
- **Smaller fixes:**
  - the page doesn't jump when a part is ticked;
  - goal names are `h3` headings;
  - resources name their goals ("for Nidus Prime and Boar Prime");
  - the Chassis note only shows on Warframes;
  - no teal on static text;
  - ↑/↓ only on open cards (32px);
  - the search results hang off the field;
  - the Tracker card's names link to Goals and its bar matches the cards.
- **The Tracker card** stays name + progress (Alex's choice).

## Addendum: part materials and parts with no drop data (10 Nov 2026, Alex's requests)

- **Every part mentions its crafting materials** (from DE's public export, bundled in the repo): a muted line under the part in the goal card, e.g. "To craft: 15,000 Credits · 1,425 Polymer Bundle · 5,500 Alloy Plate". Parts that aren't crafted (the Blueprint, Prime weapon parts) show nothing. A non-Blueprint Warframe part with no recipe says "Crafting materials not in the data".
- **They count until you own the part:** the goal's resources include them (shared stock, goal order), and the card says "incl. 45,000 for parts" where it applies. Owning the part removes them. Progress keeps a stable total.
- **Parts with no drop data** (quest, Market, vendor) leave "Farm now" for a **Get another way** group with one explanation and, per part, **your own note** (inline field, "Where do you get this?", saved with a polite "Saved"). A part with a note shows the note instead of "Not in drop tables". The same note field appears on the part in its goal card.
- Anti-goals unchanged: no modal, no new nesting; the note field reuses `AmountField`'s save/feedback pattern.
- **After the critique of this change (27/40; Alex chose all fixes):** materials as unbreakable quantity + name pairs; the card's resources split into "For {item}" and "Only for parts, until you have them", most missing first; the queue's Resources group shows the top 5 with "Show all"; the queue's note field has a visible label and a 200-character limit; "Recipe not found. Check in game."; "Digital Extremes'" instead of "DE".

## Addendum: where no-drop parts come from (10 Nov 2026, Alex's request)

- Alex found by hand that the Nidus Blueprint comes from The Glast Gambit (quest) and asked for this to be filled in from the wiki where it can be, without guessing. **Mix (his choice):** a script reads quest reward fields on the Warframe wiki into a committed file; **his own note always wins**; what the wiki doesn't state stays manual.
- A part with no drop data and a wiki quest source shows one line, **"Quest: The Glast Gambit · Warframe wiki"**, the quest name as an external link (opens in a new tab), instead of "Not in drop tables". Where Alex has typed a note, **only the note shows**.
- The note field stays under it. Its label is "Where do you get this?" when the part has no source, and "Your own note (shown instead of the wiki)" when it has one.
- The line appears in both places the part appears (the farm queue's "Get another way" and the part in its goal card), through one shared component.
- Anti-goals unchanged: no modal, no new colour (the link follows the existing link style), no icon for the link.

## Direction contract

THESIS: a farming queue first, the goals second. It refuses the default "grid of goal cards with progress rings".
OWN-WORLD: Orbiter Console hull panels, gold names, teal live/interactive, tabular Inter numbers, thin seams, cut corners.
STORY: Alex sees what to farm next and where, goes to do it, comes back and ticks it.
FIRST VIEWPORT: the title and the add-goal search on one row. Below it, the full-width "What to farm next" panel with its first 5–8 rows visible. Goal cards start below the fold on a laptop.
FORM: grouped list (queue) plus folded cards; seed: none (pinned). "What to farm next" first, compact folded cards for 4–8 goals, Tracker card with name + progress only (Alex, 10 Nov 2026).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
