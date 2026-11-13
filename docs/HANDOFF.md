# Handoff notes

Context from the planning conversation (13 Oct – 10 Nov 2026) that is **not** in `docs/SPEC.md`. Read the spec first for the design; this file covers how we got there, what was researched, and where things stand.

## Working agreement

- **Owner:** Alex (GitHub `AlexandroSamudio`). Writes in English (not his first language); replies should be in English, concise, with plain wording. Spanish UI comes later.
- **Roles:** Claude writes the code; Alex tests and reviews. Work goes on a branch per phase, with a PR to `main`. **Claude merges each PR itself with `gh pr merge --merge --delete-branch` once CI is green** (Alex's rule, 10 Nov 2026), then checks that `main` has it before starting the next phase.
- **Ask when unsure** about game facts instead of guessing. Alex can check NPC screens in game.
- **Times:** always give UTC and GMT-3 (Alex is in Argentina, no daylight saving).
- **No cosmetic content** anywhere in the checklist.

## Machines

| Machine               | OS                                                              | Role                                                                          |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Gaming PC             | **Bazzite** (Fedora Atomic, read-only base; Homebrew available) | where the tracker **runs** while playing                                      |
| Same PC, dual boot    | **EndeavourOS** (Arch)                                          | where code is **developed and tested**, using VS Code and the Claude Code CLI |
| A separate Windows PC | Windows                                                         | linked to the Claude desktop app; **not** used for this project               |

- Each OS keeps its own data directory. EndeavourOS data is throwaway; Bazzite holds the real ticks.
- Warframe runs through Steam/Proton on Bazzite. Its log is at `~/.local/share/Steam/steamapps/compatdata/230410/pfx/drive_c/users/steamuser/AppData/Local/Warframe/EE.log`.

## Key decisions and why

| Decision                                                                       | Why                                                                                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Build our own** instead of contributing to an existing tool                  | Alex's choice, after comparing the alternatives (below). Reasons: local-only data, his own "Perfect Week" route, freedom to add features. |
| **Separate API and web app** (Fastify + Svelte/Vite), not SvelteKit full-stack | Alex prefers separation; it keeps the door open for a VPS, a second user or other clients.                                                |
| **Node/TypeScript backend**, not Python                                        | WFCD's key libraries (items, drop data, world-state parser, profile parser) are Node packages.                                            |
| **Local only for v1**                                                          | Free hosting was researched (below); Alex chose to stay local and test first. A VPS may come later.                                       |
| **Single user now, `user_id` everywhere**                                      | A friend may join later.                                                                                                                  |
| **Weekly reset, no history**                                                   | Alex's choice.                                                                                                                            |
| **TypeScript 6.0, not 7.0**                                                    | `typescript-eslint` and `svelte-check` only support TypeScript below 6.1 (checked Nov 2026).                                              |
| **Exact pins, versions ≥ 2 weeks old**                                         | Avoid brand-new releases breaking the build.                                                                                              |
| **MIT license, public repo**                                                   | Alex's choice.                                                                                                                            |

### Existing tools compared (15 Oct 2026)

- **Tennoform** (tennoform.com, `Snooji/Tennoform`)
  - The most complete existing tool: today page, mastery, goals, farming, market.
  - The repo has **no license**. It was 11 days old at the time, about 72% of commits were AI-authored, and no outside PRs had been merged.
  - Good to look at; not a base to build on.
- **wforacle** (`lucasvienna/wforacle`)
  - Covers owned parts, drops and the farm finder.
  - SvelteKit with `@wfcd/items`, AGPL-3.0, very clean code.
  - Solo maintainer, and activity was slowing.
- **Warframe Task Checklist** (warframetools.com, `warframe-tools/Task-Checklist`)
  - A daily/weekly checklist, GPL-3.0, with 7 contributors.
  - Source of the 8-hour vendor timing (Loid, Grandmother, Yonta at 00/08/16 UTC). **That turned out wrong**: checked in game on 10 Nov 2026, they refresh at 04/12/20 UTC.
- **Others:**
  - Tenno Tracker, Framehub, Tenno Companion and browse.wf (profile viewer)
  - AlecaFrame, ruled out because it needs Overwolf (a third-party app)
- **Rule from Alex:** nothing that needs installing another third-party app.

### Hosting research (9 Nov 2026), for when a VPS comes up again

- **Cloudflare Workers + D1** was the recommended option if hosting:
  - free, no card, HTTPS included, login via Cloudflare Access
  - but Fastify would have to become Hono
  - DE may rate-limit Cloudflare's shared IP addresses for profile calls
- **Google Cloud e2-micro:** always free, 1 GB RAM, US regions only, card required. The dependable VPS option; pair it with Tailscale for private access.
- **Oracle Always Free:** cut to 2 OCPU / 12 GB in mid-2026 without notice. It also reclaims idle instances, so it's risky.
- **No longer free:** Render (no persistent disk), Railway, Fly.io, Koyeb.

## Data sources

- **Live world state:** `https://api.warframestat.us/pc/<endpoint>`. Endpoints used: `sortie`, `archonHunt`, `steelPath`, `dailyDeals`, `voidTrader`, `nightwave`, `events`, `arbitration`.
  - Seen stale on 13 Oct 2026: `steelPath.currentReward` (still last week's item) and `nightwave` (still July's challenges).
  - Not available: vendor stock. (The Circuit and Archimedea **are** available, via `duviriCycle` and `archimedeas`; found on 10 Nov 2026.)
- **WFCD:** all 53 repos' READMEs were read on 13 Oct 2026. The useful ones for later:
  - `@wfcd/items`: items, components, build costs, drop locations
  - `warframe-drop-data`: DE's drop tables as JSON
  - `warframe-worldstate-parser`
  - `profile-parser`
  - `warframe-patchlogs`
  - `warframe-nexus-query`: warframe.market prices
  - **Avoid** `warframe-relic-data`: it's unstable and outdated.
- **DE public profile** (for a later phase):
  - Endpoint: `https://api.warframe.com/cdn/getProfileViewingData.php?playerId=<accountId>`. No login needed. **Tested and working from Alex's connection.**
  - **Name lookup was removed in Update 38.0.8.** `?n=<name>` returns "No account or guild ID specified", and warframestat.us `/profile/<name>` returns 404.
  - **Getting the account ID:** log in at warframe.com, then open `https://www.warframe.com/api/user-data` and copy the `user_id` value. That page also shows the email, so never screenshot or log it. Alex's EE.log on Proton does **not** contain the ID.
  - **What it contains** (real field names seen 11 Nov 2026): `Results[0].PlayerLevel` (Mastery Rank), `LoadOutInventory.XPInfo` (`ItemType` + `XP`), `Missions` (per node), `Affiliations` (syndicates), `PlayerSkills` (`LPS_*` intrinsic levels), top-level `Stats`, loadouts. See SPEC §13.3 (data side built).
  - **What it doesn't:** resources, blueprints, parts or counts. Those need manual entry.
  - **Rate limit:** too many or invalid requests can temporarily block the user's IP from **logging into the game**. Call it rarely (a few times a day at most), cache the result, never retry in a loop.
- **Inventory:** there is no official inventory API. Reading game memory or network traffic, or using the user's login token, is off-limits.

## Warframe facts verified on 13 Oct 2026

- **Resets:**
  - daily 00:00 UTC (21:00 GMT-3)
  - weekly Monday 00:00 UTC (Sunday 21:00 GMT-3)
  - Sortie about 16:00 or 17:00 UTC, depending on season
  - Baro every 2 weeks
- **Steel Path Incursions:** 6 a day, 5 Steel Essence each.
- **Kuva vendors:**
  - Archimedean Yonta: 35,000 for 5 Voidplume Pinions
  - Palladino: 35,000 for 10 Riven Slivers
  - Acrithis: 10,000 for 10 Pathos Clamps, 1 a week; Pathos Clamps drop from the Orowyrm
  - Hunhow: 17,000 for 35 Crimson + 35 Emerald Talents, 3 a week; needs _Jade Shadows: Constellations_
- **Descendia:**
  - unlocked by _The Old Peace_
  - 21 floors, checkpoints at 7, 14 and 21, resets Monday
- **Archimedeas:**
  - Elite Deep Archimedea unlocks after a 25-point run
  - Elite reward track: 28 = 20 Vosfor, 31 = Rare pool, 34 = Legendary pool, 37 = 50 Vosfor
  - Temporal Archimedea Pix Chips: 6 at 28 points, 9 more at 37
  - Hotfix 44.0.3 (30 Sep 2026) reverted the "matching Warframe = 3 points" change
- **Search Pulses:** 5 a week, and each Archimedea costs 2.
- **Archon Hunt Tau-forged chance:** 20% base, +20% for each week missed.
- **Circuit points:**
  - stages are worth 100 / 110 / 125 / 145 (+50 once a day), then 170 each
  - level 10 needs 3,640 points (normal) or 5,460 (Steel Path)
- **Still to verify in game:** listed in SPEC §12.

## Earlier prototype

Before the repo existed, a single-page tracker was published as a claude.ai Artifact ("Tenno Week Tracker"), with ticks saved in the Artifact's storage. It proved out the checklist layout and the reset-clock idea. The repo replaces it; it isn't maintained.

## Status (11 Nov 2026)

- `main`: v1 (Phases 0–6) merged, plus seeds v2–v6.
- **Phase 6** (the last v1 phase, SPEC §11), now merged:
  - The API serves the built web app on the same port (`apps/api/src/routes/web.ts`, hand-written, path-traversal tested)
  - `POST /api/shutdown` (Quit), `POST /api/heartbeat`, `GET`/`PATCH /api/settings`; idle shutdown (`apps/api/src/idle.ts`)
  - Settings screen (time zone, data folder, version, idle time, Quit) behind a small hash router (`#/settings`)
  - `scripts/warframehub-launcher.sh` and `npm run install-launcher` (`.desktop` file + icon)
  - Checked end to end on EndeavourOS: launcher start (~0.6 s), second launch, Quit from the page, idle shutdown after 1 idle minute (stopped at 120 s), `.desktop` file valid (`desktop-file-validate`)
- **Tested on Bazzite by Alex (10 Nov 2026): runs perfectly**, including the app-menu launcher.
- **Seed v2 (10 Nov 2026):** four facts confirmed in game (Bird 3 sells the Archon Shard for 30,000 Cavia standing; Loid in the Sanctum Anatomica sells the Vosfor arcanes; Acrithis resets with the weekly reset; Descendia Steel Path pays 25 Steel Essence at floor 21).
- **Seed v3 (10 Nov 2026):** the 8-hour vendors refresh at 04:00 / 12:00 / 20:00 UTC (checked in game); `periods.ts` uses that anchor.
- **Seed v4 (10 Nov 2026):** "Today's Special" vendors reset at 00:00 UTC (checked in game), the daily reset they already used. **No `verify` items are left in the seed**; every SPEC §12 in-game question is answered.
- **Seed v5 (10 Nov 2026):** Ergo Glast and Eleanor Nightingale reset on their own every 4 days at 00:00 UTC (new `four_day` period, anchor 2026-11-11 00:00 UTC, checked in game). They no longer need the Clear button, and the top bar has an "Every 4 days" clock.
- **Seed v6 (10 Nov 2026):** live **Circuit** (normal Warframes, Steel Path Incarnons) and **Deep / Temporal Archimedea** cards (missions, deviation, risks with Elite flag, personal modifiers), from `duviriCycle` and `archimedeas`. They replace the typed notes, which are hidden with the usual notice. A removed default section now stays visible while it holds a user-edited or custom item.
- **Dev servers:** when checking work in the browser, Claude runs its own copy on ports 4399 (API) and 5199 (web) with a throwaway data folder, and stops it by session id or with the Quit endpoint, so Alex's `npm run dev` on 4317/5173 is never touched.
- **v1 is feature-complete.** All of SPEC §12 is answered; later features are in §13.
- **Design process (Alex's rule, 10 Nov 2026):** every frontend/UI change goes through the Impeccable plugin (see `CLAUDE.md` Rules).
  - Setup done on 10 Nov 2026: `PRODUCT.md`, and `DESIGN.md` ("The Orbiter Console", recording the existing theme) + `.impeccable/design.json`.
  - The design hook comes with the plugin (`PostToolUse` on Edit/Write, plus `Stop`), so `hooks status` says "not wired" but it runs; don't run `hooks on`, which would add duplicates.
  - First scans: the source scan found 23 advisory font sizes off the ramp. 6 were real steps that got documented; 2 one-offs were aligned (Settings title 1.35 → 1.2rem, editor section name 1.1 → 1.05rem). Page scans of the Tracker and Settings at 1280 and 390 px are now 0 findings, after adding `text-wrap: pretty` to body text.
  - Known for the Goals UI critique: Unicode glyphs (↑ ↓ ⠿ ≈) stand in for drawn icons, and browser parts (selection, scrollbars) aren't themed.
- **Next: goal planner.** Plan approved 10 Nov 2026: live warframestat.us item data with a cache, Warframes and weapons, parts plus shared resource amounts, shopping list, where to farm, Tracker card, mark as built. Delivered in 3 PRs: data, API, UI (the UI one through Impeccable).
  - **PR 1, data** (branch `goals-data`): `apps/api/src/sources/items.ts` (normaliser + `ItemCatalog` with the `item_cache` table, migration `0002`), `GET /api/goals/search?q=`, schemas in `packages/shared/src/goals.ts`, real responses in `sources/fixtures/items/`. Live check: "nidus" 0.38 s, repeated from the cache in 1.5 ms. Merged (#14).
  - **PR 2, API** (#15, merged): tables `goals`, `goal_parts`, `resource_stock` (migration `0003`), `domain/goals.ts`, and the goal routes.
  - **PR 3, UI** (branch `goals-ui`): `#/goals` (search, What to farm next, folded goal cards, Completed) and the Tracker goals card. It went through Impeccable:
    - `shape`: brief in `.impeccable/surfaces/goals.md`;
    - `critique`: dual-agent, 26/40; Alex chose the fixes;
    - after the fixes: shared stock split in goal order on the server, Farm now / Vaulted split, relic rows, field feedback, and the small fixes;
    - `audit`: 18/20, all detector scans 0.

    SPEC §13.1 describes the feature.

  - **Part sources** (branch `goals-part-sources`, Alex's request): Alex found by hand that the Nidus Blueprint comes from The Glast Gambit. A script (`npm run update-part-sources`) reads the Warframe wiki's quest reward fields into `apps/api/data/part-sources.json` (27 items), shown as "Quest: … · Warframe wiki" on parts with no drop data; his own note always wins; Market prices deliberately not used. Not covered (stay manual via notes): vendors, the Dojo, events and any wording the script doesn't recognise.
  - **Inventory, part 1 (data + API)** (11 Nov 2026, Alex's request): parts are shared entities with blueprint and crafted amounts; Craft and Build use up stock (blocked when short), with Undo. See SPEC §13.4. Part 2 (goal card UI) added Craft, build with stock, Undo and `+250`/`-30` entry. Part 3 added the Inventory screen.
  - **Profile import** (11 Nov 2026, Alex's request; PRs #19, #20): part 1 added the DE public profile source, a cache and routes (called rarely, see `CLAUDE.md` Rules); part 2 added the Profile screen and a "mastered" badge on goals. Brief in `.impeccable/surfaces/profile.md`.
  - **Warframes section, part 1 (data + API)** (11 Nov 2026, Alex's request): every Warframe with its versions, abilities, stats, augments, recipe and progress; DE images allowed and cached locally. See SPEC §14. Part 2 added ability numbers, passives and augment shops from the wiki (`npm run update-ability-stats`). Part 3 added the screens (list + page).
  - **Builds** (13 Nov 2026, Alex's request; plan approved the same day): not a build editor, a library of builds Alex copies from Overframe, YouTube or anywhere, each with its mods, arcanes, shards, Helminth, weapons, a note per part and a written guide. See SPEC §14.1. Two PRs:
    - **Part 1, data + API** (#28, merged): mod and arcane catalogue, `builds` table, migration `0007`, routes.
    - **Part 2, UI** (branch `builds-ui`): the Builds section with tabs on the Warframe page, the edit page with inline pickers, the guide renderer, and the unsaved-changes guard. It went through Impeccable:
      - `shape`: an addendum to `.impeccable/surfaces/warframes.md`;
      - `critique`: dual-agent, 28/40. Alex chose to fix all 5 issues and the small ones: the leave guard, effect search with pictures and next-slot focus, quieter guide headings with a jump link, edit/read consistency, and ‹ › reorder;
      - `audit`: 18/20; all page scans 0 at 1280 and 390 px.

      The Warframe page now opens on the version that owns the builds. The Chrome extension wasn't connected, so screenshots and scripted flows used headless Chrome over CDP. Merged as #29.

    - **The Builds page** (13 Nov 2026, Alex's request; branch `builds-page`): builds moved to their own page, as important as the Overview.
      - Page tabs **Overview · Builds (n)** under a shared header (compact on Builds).
      - A build list with marks (arcanes, Helminth, shards), ↑/↓, and the `[` / `]` keys.
      - Mods first, as picture-led cards with DE polarity symbols, with the loadout (arcanes, shards, Helminth) in a column beside them on wide screens.
      - The edit page uses the same pictures; shards are picked by their colour pictures.
      - New pictures: Archon Shards (Tauforged = shard + DE glow), weapons, Helminth icons, and polarity SVGs from the wiki (the one place the app calls the wiki; scripted SVGs refused, served sandboxed, used as a CSS mask).
      - Addresses: `…/builds`, `…/builds/{id}`, `…/builds/{id}/edit`, `…/builds/new`.
      - Impeccable 4.9.0:
        - brief "Addendum 2";
        - `critique`: dual-agent, 27/40. Alex chose to fix everything: the loadout beside the mods, both tabs full width, visible Tauforged, R5/5 ranks, wayfinding and the empty state;
        - a scan finding (unbalanced columns) was fixed;
        - all page scans 0.
  - **Follow-up** (branch `goals-part-recipes`, Alex's requests): per-part crafting materials (DE public export, saved in `apps/api/data/part-recipes.json`, refresh with `npm run update-part-recipes`), a note per part for parts with no drop data ("Get another way"), and those materials counting in the shopping list until the part is owned. Migration `0004`. UI went through Impeccable again (brief addendum, dual-agent critique, audit).
  - **Header** (11 Nov 2026, PR #27): the "Weekly Tracker" tagline is gone; the mark and the WarframeHub name are one gold link home (`#/`). `DESIGN.md` updated.
  - Impeccable 4.8.2 has no `audit-storage` command (its own reference mentions one), so audit reports go in the PR description.
- **Impeccable telemetry:** turned off by Alex on 10 Nov 2026 (`impeccable telemetry off`).
