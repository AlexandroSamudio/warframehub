# Surface brief: Profile (`#/profile`) and the "Mastered" badge on goals

Mode: **Operate**. Visual authority: `DESIGN.md` ("The Orbiter Console"), unchanged. The screen to follow: **Settings** (`apps/web/src/routes/Settings.svelte`: one `.frame.accent` panel, a definition list, hints in muted text, inline confirm instead of a modal).

## Job and audience

Alex, between sessions. He pastes his account ID once, then now and then presses **Refresh** to see where he stands: Mastery Rank, how much he has done, intrinsics. Mostly he never visits: the useful part is the **"Mastered" badge** that appears on a goal he has already taken to rank 30, so he doesn't build it for nothing.

## Outcome and proof

- **Primary task:** read his own numbers, once, in seconds. **Second task (rare):** set up or forget the account ID.
- **Real evidence:** DE's public profile (see SPEC §13.3). Shown truthfully:
  - only what the response contains: Mastery Rank, items ranked, missions completed, star-chart nodes with a completion, time played, intrinsic levels;
  - "Updated {time}" always visible, so he knows how old the copy is;
  - nothing about resources, blueprints or parts (not in the data).

## Selected direction

Inside the established world. No new visual identity, no new colour.

1. **No account yet (setup):** one panel. Title "Profile", one line of what it does, the **Account ID** field with its Save button, then "How to find your ID" as three short numbered steps, and a warning line: that page also shows your email, so don't share a screenshot of it.
2. **Loaded:** one panel, same width as Settings.
   - Heading "Profile" (gold, `h2`); then a row with "Updated …" and the **Refresh** button. The display name is the first row of the list.
   - Line under it: "Updated 10 Nov, 21:00 (24:00 UTC)" and, while refresh is locked, "You can refresh again at …".
   - A definition list in Settings' style: Mastery Rank · Items ranked · Missions completed · Star chart nodes · Time played.
   - **Intrinsics**: two short groups, Railjack (Tactical, Piloting, Gunnery, Engineering, Command) and Duviri (Riding, Opportunity, Combat, Endurance), each as "name level" pairs on a wrapped line (the pattern of the part materials).
   - Footer row: "Change account ID" and "Forget profile" (inline confirm, no modal).
3. **Goal badge:** a small `.badge` "Mastered" (not gold, not teal: the plain badge, like "Vaulted") in the goal card's badge row, reading **"mastered (rank 30)"** (plain text, no tooltip: a `title` doesn't reach touch or screen readers). It means your profile shows rank 30 for the item. Nothing else on the card changes, and progress maths is untouched.

## Scope and boundaries

- In scope: `#/profile`, the nav link, the Goals badge.
- Untouched: the Tracker, the farm queue, the theme, the rest of the API.
- Anti-goals:
  - no hero metric, no big-number tiles;
  - no charts, no rings;
  - no modal;
  - no automatic refresh and no "refreshing…" spinner loop (one press = one call);
  - never show the account ID after it is saved (not even masked);
  - no syndicates yet (the tag → name map isn't verified).

## States

- **No account / account saved but never fetched** (a Refresh button and one line saying so) / **loaded** / **refreshing** (button disabled, "Reading your profile…", polite status) / **locked** (inside the hour; button disabled, time shown, not an error) / **failed** (inline alert with the plain server message, the old copy stays visible) / **saving ID error** (field `aria-invalid`, message tied with `aria-describedby`) / **loading the screen** and **API unreachable**.
- Long numbers: tabular digits with thousands separators. Time played as hours ("704 hours"). Display name up to 24 characters.

## Interaction and layout

- **Desktop:** one column, `max-width` like Settings (44rem). **Phone (390 px):** same order; the definition list collapses to one column (Settings' own breakpoint); buttons wrap under the title; no sideways scroll.
- **Keyboard:** everything reachable; the ID field is a real `<label>`ed input; Enter saves; focus moves to the Refresh button after saving the ID, and back to the field when "Change account ID" is pressed.
- **Copy:** plain, short, no jargon. All strings through `t()`.
- **Targets:** buttons use the existing 32 px+ control size.

## Constraints

- Reuse `.frame`, `.badge`, button and input styles, `.num`, `.hint`/`.status`/`.error` patterns from Settings.
- Contrast at the `DESIGN.md` floors. No new dependencies. No new colour. No icon beyond existing `Icon.svelte`.
