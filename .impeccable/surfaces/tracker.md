# Surface brief: Tracker (`#/`) layout refinement

Mode: **Operate**. Visual authority: `DESIGN.md` ("The Orbiter Console"), unchanged. Refinement, not redesign: same panels, frames, type and colours.

## Job and audience

Alex, alt-tabbed out of Warframe: what's left today and this week, how long until each reset, and what's live right now. Glanceable on a 1280–1600px monitor; sometimes on a phone.

## Problems (seen 20 Nov 2026 at 1600 / 1280 / 900 / 390)

1. Checklist panels sit in grid rows, so a short panel leaves a hole next to a tall one.
2. The live-rotations column runs ~600px below the checklist (Archimedea details, Nightwave list).
3. The column tops don't line up: "Edit checklist" takes a row of its own.
4. At ~900px the six clocks wrap 5 + 1.
5. On a phone the live rotations sit ~5,000px down, after every checklist panel.

## Direction (confirmed with Alex, 20 Nov 2026)

- **Checklist panels stack in columns** (CSS multi-column, `break-inside: avoid`), reading down each column: dailies gather on the left, weeklies on the right. One column under ~46rem.
- **One header row per column:** "CHECKLIST" + Edit checklist, mirroring "LIVE ROTATIONS" + Refresh, so both columns start level.
- **Clocks in even rows:** 6, 3 or 2 per row by width, never an orphan.
- **Phone (under 60rem): a Checklist · Live rotations switch** (the shared Segmented control) under the clocks; one panel shows at a time, the other stays mounted (countdowns keep ticking). Remembered in this browser.
- **Folds:** each Archimedea card shows its three missions; deviations, risks and personal modifiers fold under "Show details (n risks · n modifiers)". Nightwave shows its season and counts; the list folds under "Show challenges". Folded by default; the open state is remembered per card.

## Anti-goals

No new visual language, no card restyling, no masonry script, no change to checklist logic, data or periods.
