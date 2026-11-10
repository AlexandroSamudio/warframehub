# Handoff notes

Context from the planning conversation (13 Oct – 10 Nov 2026) that is **not** in `docs/SPEC.md`. Read the spec first for the design; this file covers how we got there, what was researched, and where things stand.

## Working agreement

- **Owner:** Alex (GitHub `AlexandroSamudio`). Writes in English (not his first language); replies should be in English, concise, with plain wording. Spanish UI comes later.
- **Roles:** Claude writes the code; Alex tests and reviews. Work goes on a branch per phase, with a PR to `main` that Alex merges. CI must be green.
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
  - Source of the 8-hour vendor timing (Loid, Grandmother, Yonta at 00/08/16 UTC), which we still need to verify.
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
  - Not available: the Circuit rotation, Archimedea modifiers, vendor stock.
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
  - **What it contains:** Mastery Rank, XP per item ever ranked, star-chart completion, syndicates, intrinsics, loadout and stats.
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

## Status (10 Nov 2026)

- `main`: Phase 0 (scaffold) and Phase 1 (periods, database, default checklist) merged.
- **Branch `phase-2-tracker`:** Phase 2 (SPEC §11):
  - `GET /api/tracker`, `PUT /api/ticks`, `POST /api/sections/:id/clear` (schemas in `packages/shared/src/tracker.ts`, queries in `apps/api/src/db/tracker.ts`)
  - Tracker screen: reset clocks, checklist sections with progress, checkboxes / counters / sub-ticks, Clear for manual sections
  - Old ticks deleted at startup and once a day. Sortie/Baro ticks are pruned by age (2 / 30 days), because their keys depend on live data that may be missing
  - Countdowns use the server clock offset; when a reset passes the page reloads the tracker. The client never computes period keys
  - Sortie times are fallback estimates (≈, "estimated") and Baro shows "Waiting for live data" until Phase 3 plugs in `liveTimes`
- **Next: Phase 3** (warframestat.us client, cache, normaliser, rotations column; feed `sortieExpiry` / `baroActivation` into `buildApp({ liveTimes })`).
