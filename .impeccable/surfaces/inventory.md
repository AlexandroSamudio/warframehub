# Surface brief: Inventory (`#/inventory`)

Mode: **Operate**. Visual authority: `DESIGN.md` ("The Orbiter Console"), unchanged. The screen to follow: **Goals** (`apps/web/src/routes/Goals.svelte`): the farm queue's grouped rows and the Amount Field.

## Job and audience

Alex, back from a mission or before a session, updating what he has in one pass: "I got 400 Plastids and the Systems blueprint". The goal cards show amounts per goal; this screen shows **every entity once**, A–Z, so he can find one and type `+400` without opening cards. Amounts are shared, so this edits the same numbers the goal cards show.

## Outcome and proof

- **Primary task:** find a resource or part fast (filter) and change its amount.
- **Second task:** see what's still short across all goals, and clean up amounts nothing needs any more.
- **Real evidence:** only what Alex typed (no inventory API, SPEC §13.4). Needs and "short" come from the active goals.

## Selected direction

One column (≤ 60rem), the Goals screen's language:

1. **Header row:** the title and a **filter** field ("Find a resource or part"), like the Goals search row. Under it, one muted hint: "Type a total, or +250 to add and -30 to take away."
2. **Resources** (frame panel): every resource an active goal needs, **A–Z**. Row: name, "for Nidus Prime and Boar Prime", the Amount Field, "of 70,000", and "1,250 short" in gold or "enough" in green.
3. **Parts** (frame panel): grouped by goal (goal name as a small heading, goal order). Row: the part's full name ("Nidus Prime Chassis"), its amounts (Blueprints + Crafted, or Have), and "needed" / "done" state, no Craft button (crafting stays on the goal card where the materials are).
4. **Not needed right now** (collapsed `<details>`): saved resource and part amounts no active goal uses, still editable.

## States

- No goals and nothing saved → one line and a link to Goals.
- Filter with no match → "Nothing matches "{query}"."
- Loading, API unreachable, save errors → the Goals screen's inline alert.

## Interaction and layout

- Filter matches names case-insensitively, as you type; it filters all groups; a group with no match is hidden.
- Phone (390px): rows wrap (name first, amounts under), no sideways scroll.
- Keyboard: filter is a labelled `type="search"`; every field reachable; nothing moves while typing in an amount (rows aren't re-sorted by what's short).

## Constraints and anti-goals

- Reuse `.frame`, the Amount Field (compact for parts, `max` 1,000), `.num`, the farm queue row pattern. Strings through `t()`. No new colour, no modal, no new dependency.
- No hero numbers, no totals dashboard, no icons per resource (no game art).

## After the critique (11 Nov 2026, 31/40)

- Part rows say what's next: "craft it" (blueprint in stock), "{n} to go", or "done".
- Editing an amount keeps the row where it was (shared `lib/keep-place.ts`, also used by Goals); a row that leaves "Not needed right now" hands focus to the group's summary.
- The no-match line is a status region that's always present; the filter only shows when there's something to filter; "Not needed right now" opens when filtering starts and otherwise stays as you left it.
- Idle parts keep Blueprints + Crafted when the part has a recipe (`craftable` from the API).
- **Kept on purpose:** a part that two active goals need shows under each goal (both edit the same amount). Rare, and it keeps the per-goal grouping that makes the list scannable.
