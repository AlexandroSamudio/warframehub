# WarframeHub — Project Spec

**Status:** draft for review · **Version scope:** v1 (Weekly Tracker) · **Last updated:** 2026-11-09

WarframeHub is a personal Warframe companion that runs on your own computer. The long-term goal is to make it the main place to track your progression and objectives. **v1 is only the Weekly Tracker**: a daily and weekly checklist with reset clocks and live rotations.

---

## 1. Goals and non-goals

### v1 goals

1. A **daily and weekly checklist** based on "The Perfect Week in Warframe" route, verified against the wiki.
2. Ticks **reset themselves** at the correct game reset (daily, weekly, 8-hour, Sortie, Baro). You never clear them by hand, except for items whose timer we can't know.
3. **Live rotations** next to the checklist: Sortie, Archon Hunt, Teshin's Steel Path item, Darvo, Baro, Nightwave, events.
4. **Edit the checklist from the page**: add, edit, hide, reorder and delete items without touching code.
5. Times shown in **your local time zone (GMT-3) with UTC next to them**.
6. Starts with **one click** on Bazzite, runs only on `127.0.0.1`, and stops when you quit.

### Non-goals for v1 (planned later, see §13)

- Goal planner ("build a Warframe": parts, resources, drop locations, farms)
- Circuit points tracker and Search Pulse planner
- Profile import (mastery, star chart) from the public profile endpoint
- More than one user, accounts, or hosting on a VPS
- Spanish translation
- History of past weeks (the page resets each week by design)

### Ground rules (apply to every feature)

- **Warframe only.** Game knowledge must be accurate. Anything patch-sensitive is checked against the wiki, DE's patch notes or the live API, never memory.
- **No cosmetic content** (decorations, furniture shops, skins and similar).
- **Times:** stored and computed in **UTC**, shown in the user's time zone with UTC next to it. Default display zone: `America/Argentina/Buenos_Aires` (GMT-3).
- **Unconfirmed information** is shown with a **"verify"** badge until confirmed in game.
- **No game-client tricks.** No reading game memory or network traffic, no Overwolf, and never asking for Warframe login details.

---

## 2. Users and environments

|              | Now                                               | Later (designed for, not built)             |
| ------------ | ------------------------------------------------- | ------------------------------------------- |
| Users        | One (the owner)                                   | Owner + a friend, each with their own ticks |
| Runs on      | **Bazzite** (Fedora Atomic), during play          | A VPS                                       |
| Developed on | **EndeavourOS** (Arch), VS Code + Claude Code CLI | same                                        |
| Access       | `http://127.0.0.1:<port>` only                    | public URL with login                       |

Design consequences:

- Every user-owned row has a `user_id`. v1 creates one local user automatically. Adding users later is a feature, not a rewrite.
- The **data directory lives outside the repo**, so `git pull` never touches your ticks: `$XDG_DATA_HOME/warframehub/` (normally `~/.local/share/warframehub/`). It can be changed with an environment variable (`WFHUB_DATA_DIR`).
- The two OSes keep separate data. EndeavourOS data is development data and can be thrown away; Bazzite holds the real ticks.

---

## 3. Architecture

### 3.1 Repository layout (npm workspaces)

```
warframehub/
├── apps/
│   ├── api/                 Fastify + TypeScript
│   │   ├── src/
│   │   │   ├── routes/      HTTP routes (checklist, ticks, worldstate, meta)
│   │   │   ├── domain/      pure logic: reset periods, period keys, seeding
│   │   │   ├── db/          Drizzle schema, migrations, queries
│   │   │   └── sources/     warframestat.us client + cache
│   │   └── seed/            default checklist (JSON) shipped with the app
│   └── web/                 Svelte 5 + Vite single-page app
│       └── src/
│           ├── lib/         API client, stores, time formatting
│           ├── components/  UI pieces
│           └── routes/      screens (Tracker, Edit, Settings)
├── packages/
│   └── shared/              Zod schemas + TypeScript types used by both apps
├── scripts/                 launcher, dev helpers
├── docs/                    this spec, decisions
├── CLAUDE.md                instructions for Claude Code sessions
└── package.json             workspaces + root scripts
```

### 3.2 How the parts talk

- **The API owns all data and logic.** It stores the checklist and ticks, computes reset periods, and fetches and caches live data.
- **The web app is UI only.** It talks to the API over a REST API under `/api/*`, using JSON validated by the shared Zod schemas on both sides.
- **The API also serves the built web app** (static files) in production, so daily use is one process on one port.
- In development, two processes run: the API on `127.0.0.1:4317`, and Vite on `127.0.0.1:5173`, which forwards `/api` to the API.
- The API binds to **`127.0.0.1` only**. Binding to the LAN (for phone access later) is an explicit setting, off by default.

### 3.3 Toolset

| Area                      | Choice                                | Notes                                                                                                   |
| ------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Runtime                   | **Node.js 24 LTS**                    | pinned with **mise** (`mise.toml`), same on both OSes                                                   |
| Language                  | **TypeScript 6.0**, `strict`          | shared `tsconfig.base.json`. TypeScript 7 waits until `typescript-eslint` and `svelte-check` support it |
| Package manager           | **npm** with workspaces               |                                                                                                         |
| API                       | **Fastify**                           | JSON-schema validation, OpenAPI docs at `/api/docs` in dev                                              |
| Validation / shared types | **Zod** in `packages/shared`          | one source of truth for request/response shapes                                                         |
| Database                  | **SQLite** via **better-sqlite3**     | one file in the data directory                                                                          |
| ORM / migrations          | **Drizzle ORM + drizzle-kit**         | migrations run automatically at startup                                                                 |
| Frontend                  | **Svelte 5 + Vite** (SPA)             | a small client-side router                                                                              |
| Styling                   | **Plain CSS + CSS custom properties** | Warframe-inspired theme, no CSS framework                                                               |
| Tests                     | **Vitest** (both apps)                | reset/period logic gets the most coverage                                                               |
| Lint / format             | **ESLint + Prettier**                 | `eslint-plugin-svelte`, `prettier-plugin-svelte`                                                        |
| CI                        | **GitHub Actions**                    | install, lint, typecheck, test, build on every push and PR                                              |
| Editor                    | VS Code                               | recommended extensions in `.vscode/extensions.json`                                                     |
| License                   | **MIT**                               |                                                                                                         |

---

## 4. Domain model: resets and periods

All period logic lives in `apps/api/src/domain/periods.ts` as **pure functions of a UTC timestamp**, fully unit-tested.

### 4.1 Period types

| Period       | Resets at (UTC)                                                        | Local (GMT-3)       | Source of truth                                  |
| ------------ | ---------------------------------------------------------------------- | ------------------- | ------------------------------------------------ |
| `daily`      | every day 00:00                                                        | 21:00               | fixed rule                                       |
| `weekly`     | Monday 00:00                                                           | Sunday 21:00        | fixed rule                                       |
| `eight_hour` | 04:00, 12:00, 20:00                                                    | 01:00, 09:00, 17:00 | fixed rule (checked in game, 10 Nov 2026)        |
| `four_day`   | every 4 days at 00:00, counted from 2026-11-11                         | 21:00               | fixed rule (anchor checked in game, 10 Nov 2026) |
| `sortie`     | when the current Sortie expires (≈ 16:00 or 17:00 depending on season) | ≈ 13:00 / 14:00     | **live API `sortie.expiry`**; fallback 16:00 UTC |
| `baro`       | per Baro visit (arrival → departure, every 2 weeks)                    | —                   | **live API `voidTrader.activation`**             |
| `manual`     | only when the user presses **Clear**                                   | —                   | user                                             |

Ergo Glast and Eleanor Nightingale use `four_day` (since seed v5). Their stock changes every 4 days at 00:00 UTC; the anchor is the reset of 2026-11-11 00:00 UTC, checked in game on 10 Nov 2026. `manual` stays available for custom sections.

### 4.2 Period keys

Ticks are stored against a **period key**, a string that identifies the current period:

- `daily:2026-11-09`
- `weekly:2026-11-09` (date of that week's Monday)
- `four_day:2026-11-11` (the date the 4-day block started)
- `eight_hour:2026-11-09T12` (the block's start; between 00:00 and 04:00 UTC the key carries the previous day's `T20`)
- `sortie:2026-11-10`: the UTC date the Sortie **ends** (live `sortie.expiry`, or the next 16:00 UTC without live data), so live and fallback keys match for most of the day
- `baro:<activation ISO>` (fallback `baro:unknown` when there is no live data)
- `manual:<counter>`, where the counter goes up by one each time the user presses Clear

**Resets need no timer or background job.** When the period changes, the key changes, so the old ticks stop matching and the list shows as unticked. Old tick rows are deleted on startup and once a day; history is not kept by design.

### 4.3 Items and slots

An item can be:

- a **single checkbox** (e.g. "Sortie"),
- a **counter of N slots** (e.g. Steel Path Incursions ×6, Hunhow ×3, Search Pulses ×5), stored as one tick per slot,
- a **named set of sub-ticks** (e.g. Vosfor: Vendetta · Radiation · Ignition), also stored as one tick per slot,
- an **info row** with no checkbox (a note inside a section).

---

## 5. Data model (SQLite via Drizzle)

```
users            id, name, created_at
                 (v1: one row, created on first start)

settings         user_id, key, value_json
                 keys: display_tz, platform ('pc'), show_hidden, ...

sections         id, user_id, slug, title, period, sort_order,
                 origin ('default'|'custom'), hidden, edited (bool),
                 reordered (bool),
                 seed_id NULL

items            id, user_id, section_id, title, description, kind
                 ('check'|'counter'|'subticks'|'info'), slots_json,
                 verify (bool), link_url NULL, sort_order, hidden,
                 origin ('default'|'custom'), seed_id NULL,
                 edited (bool), reordered (bool), created_at, updated_at

ticks            user_id, item_id, slot (0..n-1), period_key, checked_at
                 PRIMARY KEY (user_id, item_id, slot, period_key)

manual_counters  user_id, section_id, counter
                 (the number used in manual:<counter> keys)

worldstate_cache source ('warframestat'), endpoint, fetched_at,
                 expires_at, payload_json, last_error NULL

seed_meta        user_id, seed_version, applied_at
                 (per user: each user gets their own copy of the defaults)
```

An item's period comes from its **section**. An item's own `period` is not stored in v1; we can add it later if needed.

### 5.1 Default checklist and user edits

- Default sections and items ship in `apps/api/seed/checklist.json`. Each has a stable `seed_id` (e.g. `weekly.kuva.palladino`) and the file has a `seed_version`.
- On first start the seed is copied into `sections` and `items` with `origin='default'`.
- When the user edits a default item, it is marked `edited=true`. Deleting a default item **hides** it (`hidden=true`) instead of removing it, so "Restore defaults" can bring it back.
- **When the app is updated** with a newer `seed_version`:
  - new default items are added;
  - unedited default items are updated to the new text;
  - **edited items are never overwritten**;
  - default items removed from the seed are hidden, not deleted, and the user sees a notice.
- Custom items (`origin='custom'`) are never touched by seeding.
- Sections follow the same rules (they also carry `edited`). An edited default removed from the seed stays visible.
- **Moving** a default (reorder, or into another section) sets `reordered` instead of `edited`. Seed updates then keep the user's section and order but still update its text. Hiding is not an edit either.
- The "removed from the defaults" notice lists the hidden titles at the top of the Tracker until dismissed.
- A custom section that holds default items can't be deleted (the defaults would be lost); move them out first.
- A default section removed from the seed stays visible while it still holds a visible custom item or an edited default, so the user's items never disappear with it.

---

## 6. API (REST, JSON, all under `/api`)

| Method       | Path                              | Purpose                                                                                                                                        |
| ------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET          | `/api/health`                     | liveness, app version, data dir                                                                                                                |
| GET          | `/api/tracker`                    | **everything the Tracker screen needs in one call**: sections, items, current period keys, ticks for those keys, next reset times, server time |
| PUT          | `/api/ticks`                      | set or unset one tick `{itemId, slot, checked}`; the server computes the period key                                                            |
| POST         | `/api/sections/:id/clear`         | clear a `manual` section (increments its counter)                                                                                              |
| GET/POST     | `/api/sections`                   | list / create section                                                                                                                          |
| PATCH/DELETE | `/api/sections/:id`               | edit, hide, delete (custom only)                                                                                                               |
| POST         | `/api/items`                      | create item                                                                                                                                    |
| PATCH/DELETE | `/api/items/:id`                  | edit, hide, delete (custom)                                                                                                                    |
| POST         | `/api/sections/reorder`           | new order of sections                                                                                                                          |
| POST         | `/api/items/reorder`              | new order within or across sections                                                                                                            |
| POST         | `/api/checklist/restore-defaults` | unhide and reset default items (asks first in the UI)                                                                                          |
| POST         | `/api/checklist/dismiss-notice`   | hide the "removed from the defaults" notice                                                                                                    |
| GET          | `/api/worldstate`                 | cached live rotations, normalised (see §7), with `fetchedAt` and staleness                                                                     |
| POST         | `/api/worldstate/refresh`         | force a refresh (rate-limited)                                                                                                                 |
| GET/PATCH    | `/api/settings`                   | display time zone, etc.                                                                                                                        |
| POST         | `/api/heartbeat`                  | an open page says it's still there (idle shutdown, §9.2)                                                                                       |
| POST         | `/api/shutdown`                   | Quit button: stops the server cleanly                                                                                                          |

Rules:

- The **server decides period keys**, using server time. The client never sends a period key. This avoids clock and time-zone bugs in the browser.
- Every request and response body has a Zod schema in `packages/shared`.
- Errors use one shape: `{ error: { code, message } }`.
- No authentication in v1, because the server only listens on `127.0.0.1`. Every route already resolves a `user_id` (always the local user for now), so adding authentication later doesn't change the routes.

---

## 7. Live data (warframestat.us)

- **Source:** `https://api.warframestat.us/pc/<endpoint>?language=en`. This is the public WFCD API built on DE's world state; no login needed.
- **Endpoints used in v1:** `sortie`, `archonHunt`, `steelPath`, `dailyDeals`, `voidTrader`, `nightwave`, `events`, `arbitration`, plus `duviriCycle` (the Circuit's weekly choices) and `archimedeas` (Deep and Temporal Archimedea), added after v1.
- **Caching:** each endpoint is cached in `worldstate_cache`.
  - It's refreshed when the cached copy has expired **and** someone asks for it. A copy lasts until the item's own `expiry`, capped at 1 hour (lists such as `nightwave` and `events`: 10 minutes). If upstream is behind (its expiry has already passed), the app asks again after 5 minutes.
  - After a failed fetch, that endpoint is retried after 2 minutes at the earliest.
  - There is no polling while nobody is looking.
  - Manual refresh is limited to once per minute.
- **Failure handling:** if a fetch fails, the last good copy is served, marked **stale**, with its age. The page never goes blank because the API is down.
- **Known data problems** (seen 13 Oct 2026):
  - `steelPath.currentReward` and `nightwave` can lag behind the game.
  - The UI shows "may be outdated", plus the fetch time, for any item whose own `activation`/`expiry` doesn't cover now.
  - For Teshin, the app can also show the **expected item from the known 8-week rotation order** labelled "estimated".
- **Circuit and Archimedea** (checked 10 Nov 2026):
  - `duviriCycle.choices` has the Circuit's weekly picks: `EXC_NORMAL` = 3 Warframes, `EXC_HARD` = 5 Steel Path Incarnon Genesis weapons. This week's lists matched the wiki's rotation tables. They change with the weekly reset, Monday 00:00 UTC (wiki).
  - `archimedeas` has one entry per Archimedea: type `CT_LAB` = **Deep** (Albrecht's Laboratories, The Murmur, which warframestat.us calls "Man in the Wall") and `CT_HEX` = **Temporal** (Höllvania, Scaldra and Techrot), checked against the wiki. Each has 3 missions with a deviation and risks (`isHard` = Elite), plus personal modifiers.
  - These replaced the typed "Circuit this week" / "Archimedea modifiers this week" notes (seed v6).
- **Not available from the API:** vendor stock (Palladino, Acrithis and similar).
- **Goal planner item data** (§13, checked 10 Nov 2026): `https://api.warframestat.us/warframes/search/{q}` and `/weapons/search/{q}` (not under `/pc`).
  - Each item has `components[]` with counts and drop locations (rotation, rarity, chance). Component `category: "Components"` is a part; anything else (`"Misc"`) is a resource. `buildPrice` becomes a Credits resource.
  - Only Warframes (category `Warframes` **and** type `Warframe`; Necramechs and Archwings come back under `Warframes` or `Archwing`) and Primary / Secondary / Melee weapons are kept.
  - Prime parts drop from relics, and `vaulted` is on the item.
  - warframestat.us has **no part recipes** (the materials to craft a Chassis): see "Part recipes" below. Some parts have no drops (quest, market, vendor), and vaulted relics have none either.
- **Part sources** (checked 10 Nov 2026): where parts with no drop data come from. The Warframe wiki's data modules (Warframes, Blueprints, Acquisition) don't hold quest rewards. The quest pages do: each quest's infobox `reward` field, in `Category:Quest` (72 pages), usually reads `{{WF|Nidus}} blueprint` or `{{Weapon|Shedu}} blueprint`, sometimes `[[Revenant]] blueprint` or "blueprint and parts". `npm run update-part-sources` reads them through the wiki API (about 2 requests, with a pause) and writes the small file `apps/api/data/part-sources.json` (27 items; 10 Nov 2026), which is committed; the app never calls the wiki. Only clear "<item> blueprint" matches are kept, so odd wording is skipped, not guessed. Market prices are structured (`MarketCost` in `Module:Blueprints/data`) but aren't used (Alex's choice). Wiki text is CC BY-SA: we store only the quest's name and a link.
- **Part recipes** (checked 10 Nov 2026): DE's own public content export, `https://content.warframe.com/PublicExport/` (index `index_en.txt.lzma`, then `Manifest/ExportRecipes_en.json!<hash>` and `ExportResources_en.json!<hash>`). A part's recipe is the one whose `resultType` is the part's `uniqueName`, e.g. `…/NidusChassisComponent`. `npm run update-part-recipes` (needs `xz`) reads it and writes the small file `apps/api/data/part-recipes.json` (447 recipes), which is committed; the app never calls DE. Rerun it when new Warframes come out. The frame's own recipe isn't in it (its result is the Warframe), and Prime weapon parts have no recipe because they drop finished.
  - Search is cached for 24 hours per query in `item_cache`; items are cached by `uniqueName`, so adding a goal needs no second request. At most one upstream search per second. Offline, cached results are served as stale.
- **Normalising:** the API converts the raw responses into small shapes defined in `packages/shared` (e.g. `Sortie { boss, faction, expiry, missions[] }`). If warframestat.us changes, only `apps/api/src/sources/` changes.
- Requests send a descriptive `User-Agent` (`warframehub/<version> (+repo URL)`).

---

## 8. User interface

### 8.1 Screens

1. **Tracker** (home)
   - **Top bar:** reset clocks (daily, weekly, Sortie, next 8-hour, every 4 days, Baro), each with a countdown and local time plus UTC. A clock is highlighted when its reset is less than 3 hours away (24 hours for weekly and every 4 days).
   - **Left column:** checklist sections. Each has a progress meter and its reset label; `manual` sections have a **Clear** button.
   - **Right column:** live rotations (Archon Hunt with shard colour, Sortie, Teshin, Darvo, Baro, Nightwave, events). Each card has a freshness badge: **Live** / **Estimated** / **May be outdated** / **Check in game**.
   - Stacks to one column on narrow windows.
2. **Edit mode** (a toggle on the Tracker, not a separate page)
   - Add, rename, describe, hide or delete items and sections. Delete only applies to custom ones; default ones are hidden instead.
   - Drag to reorder.
   - Set an item's kind (checkbox, counter with N slots, named sub-ticks, info) and its "verify" flag.
   - "Restore defaults" button, with an inline confirmation step.
3. **Settings**
   - Display time zone
   - Data folder location (read-only)
   - App version
   - **Quit** button

### 8.2 Look and feel

- **Warframe-inspired:**
  - dark void background with Orokin **gold** accents and a cool **teal/cyan** secondary
  - thin geometric frames and angled corners on panels
  - a technical display font for headings and labels (**Rajdhani**), plus a clean body font (**Inter**). Both SIL OFL 1.1, bundled with the app via `@fontsource`; nothing is fetched from font services. Numbers that change (countdowns, counts) use Inter's tabular digits, because Rajdhani has none.
- **Original artwork only.** No DE logos, game art or copied UI assets.
- **Readable first:**
  - good contrast
  - visible keyboard focus
  - `prefers-reduced-motion` respected
  - aligned numbers (`tabular-nums`) for timers
- Light mode is **not** planned for v1. The theme is dark by design.

### 8.3 Ready for translation

All UI text lives in one module (`apps/web/src/lib/i18n/en.ts`), accessed through a `t()` helper. Spanish later is a matter of adding `es.ts` and a setting. Seed checklist text gets a translation key at the same time.

---

## 9. Running it

### 9.1 Development (EndeavourOS)

```sh
mise install          # installs the pinned Node version
npm install
npm run dev           # API on :4317 + web on :5173, with live reload
npm test              # Vitest, all workspaces
npm run lint && npm run typecheck
```

### 9.2 Daily use (Bazzite)

- One-time setup:
  - `brew install mise`
  - `git clone …`
  - `mise install`
  - `npm ci`
  - `npm run build`
  - `npm run install-launcher`, which writes a `.desktop` file to `~/.local/share/applications/` and an icon to `~/.local/share/icons/hicolor/scalable/apps/` (`-- --uninstall` removes both)
- **Click "WarframeHub"** in the app menu:
  - It starts the server if it isn't running, waits until `/api/health` answers, then opens the browser.
  - If the server is already running, it just opens the browser.
  - The launcher is `scripts/warframehub-launcher.sh`. It runs the built server with the pinned Node via mise, logging to `<data dir>/server.log` (started fresh past 1 MB). Problems (not built yet, mise missing, port used by another program, server didn't start) show a desktop notification.
- **Stopping:**
  - the **Quit** button,
  - or automatically after **30 minutes with no open page**: the page sends a small heartbeat every minute, and any request counts as activity. `WFHUB_IDLE_MINUTES` changes the time; `0` turns it off, which is what `npm run dev` does.
  - Nothing runs at boot or in the background.
- **Updating:** `git pull && npm ci && npm run build`. Database migrations run on the next start.

---

## 10. Quality

- **Tests (Vitest):**
  - `periods.ts`: every period type, around midnight UTC, around 21:00 local, week boundaries, 8-hour boundaries, Sortie/Baro fallbacks, DST changes (Argentina has none, but UTC-based logic must not assume a fixed offset)
  - seed merging (new, edited, removed items)
  - API routes with an in-memory SQLite database
  - the warframestat.us normaliser, using saved sample responses
- **CI:** GitHub Actions on push and PR: `npm ci`, lint, typecheck, test, build.
- **Commits:** small, descriptive messages. No direct pushes to `main` once the project is set up; work goes through PRs that the owner reviews.

---

## 11. Build phases (v1)

Each phase ends with something you can run and check.

| Phase                        | Delivers                                                                                                       | Done when                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **0. Scaffold**              | workspaces, mise, TypeScript, ESLint/Prettier, Vitest, CI, empty Fastify + Svelte apps that talk to each other | `npm run dev` shows a page that displays `/api/health`; CI is green                        |
| **1. Periods & data**        | `periods.ts` with tests, Drizzle schema + migrations, seed import                                              | all period tests pass; first start creates the database with the default checklist         |
| **2. Tracker (read + tick)** | `/api/tracker`, `/api/ticks`, the Tracker screen with reset clocks and checklist                               | ticking survives restart and clears at the right reset (tested with a fake clock)          |
| **3. Live rotations**        | warframestat.us client, cache, normaliser, rotations column                                                    | rotations show with freshness badges; with the network off, the cached copy shows as stale |
| **4. Edit mode**             | create, edit, hide, delete, reorder, restore defaults                                                          | default-item edits survive a seed update (tested)                                          |
| **5. Theme & polish**        | Warframe-inspired theme, responsive layout, keyboard and focus states                                          | looks right at desktop and narrow widths                                                   |
| **6. Launcher**              | click-to-start `.desktop` launcher, Quit button, idle shutdown                                                 | one click on Bazzite opens a working tracker; Quit stops it                                |

---

## 12. Open questions and items to verify

**In game (owner):**

- [x] Archon Shard vendor: it's **Bird 3**, not Chipper, for **30,000 Cavia standing** (in game, 10 Nov 2026)
- [x] Arcane Vendetta / Radiation / Ignition are sold by **Loid in the Sanctum Anatomica** (in game, 10 Nov 2026; the price wasn't checked)
- [x] Acrithis' weekly rotation resets with the **weekly reset**, Monday 00:00 UTC (in game, 10 Nov 2026)
- [x] Steel Path Descendia: 25 Steel Essence at **floor 21** (in game, 10 Nov 2026)
- [x] "Today's Special" vendors reset at **00:00 UTC**, with the daily reset (in game, 10 Nov 2026)
- [x] 8-hour vendors (Loid, Grandmother, Archimedean Yonta) refresh at **04:00 / 12:00 / 20:00 UTC** (01:00 / 09:00 / 17:00 GMT-3), checked in game on 10 Nov 2026. The wiki confirms the 8-hour cycle (Yonta: "refreshes every 8 hours"). The community Task Checklist's 00:00 / 08:00 / 16:00 was wrong.

**Technical (Claude):**

- [x] Does warframestat.us expose Archimedea or the Circuit rotation? **Yes**: `archimedeas` and `duviriCycle.choices` (checked 10 Nov 2026 and matched against the wiki). Shown as live cards since seed v6.
- [x] Ergo Glast / Eleanor Nightingale's 4-day cycle: resets at 00:00 UTC, one of them on **2026-11-11** (in game, 10 Nov 2026). Now the `four_day` period.
- [x] Re-check `steelPath` and `nightwave` freshness before Phase 3. On 10 Nov 2026 both were current. `arbitration` returned a placeholder (`SolNode000`, 1970 dates), so it shows "Check in game".

---

## 13. After v1

### 13.1 Goal planner (built, 10 Nov 2026)

"Build this Warframe or weapon." Screen `#/goals`, plus a goals card on the Tracker.

- **Scope:** Warframes and Primary / Secondary / Melee weapons, Primes included (Alex's choice).
- **Data:** warframestat.us item search (§7), cached in `item_cache`. Each goal keeps its own copy of the recipe (`goals.recipe_json`), so it works offline. "Update recipe" fetches it again and keeps part counts. Part crafting materials come from the bundled DE data (§7), filled in when a goal loads, so older goals get them too.
- **Ownership:**
  - **Parts** are ticked per goal (`goal_parts`).
  - **Resources** are one shared stock (`resource_stock`, "I have 12 Orokin Cells"). It is **split in goal order**: the higher goal takes what it needs first, and the next gets what's left. Each card shows its share ("7 of 10 for this goal · 3 short"), and progress and "ready to build" use it. ↑/↓ sets the priority.
- **What to farm next** (the first thing on the screen):
  - **Farm now:** missing parts of non-vaulted items, best drop chance first;
  - **Vaulted: trade or wait:** relics that no longer drop;
  - **Resources:** total still short across active goals, with an amount field.

  Relic drops show one row per relic with Intact / Exceptional / Flawless / Radiant chances.

- **Mark as built** moves a goal to Completed, from where it can be brought back. Resource amounts are not changed (update them yourself). Remove deletes the goal and its ticks, not the stock.
- **Part materials:** every crafted part (Chassis, Neuroptics, Systems…) shows what it takes to craft: "To craft: 15,000 Credits · 5,000 Nano Spores · …".
  - Until you own the part, those materials count as the goal's resources (shared stock, goal order) and in the farm queue; "incl. 45,000 for parts" says how much of a total is for parts. Owning the part removes them.
  - Progress and "ready to build" keep the item's own resources as their fixed set, so the total doesn't change as you tick parts.
  - A non-Blueprint Warframe part with no recipe in the data says "Recipe not found. Check in game."
  - The card lists resources in two groups ("For {item}" and "Only for parts, until you have them"), most missing first. In the farm queue the Resources group shows the top 5, with "Show all".
- **Parts with no drop data** (quest, Market, vendor): they leave "Farm now" for **Get another way**. There you keep your own note per part ("Where do you get this?", up to 200 characters, `goal_parts.note`), also shown on the part in its goal card. Where the Warframe wiki names a quest for it, the part shows "Quest: The Glast Gambit · Warframe wiki" (a link to the quest's page) instead. The quest gives the item's Blueprint, and every part when the wiki says "and parts". **Your own note always wins**: with a note, only the note shows. The app doesn't guess any other source.
- **API:**
  - `GET /api/goals/search?q=`
  - `GET` / `POST /api/goals`
  - `PATCH /api/goals/:id/parts`
  - `PUT /api/resources`
  - `POST /api/goals/:id/built`, `/reactivate`, `/refresh`
  - `DELETE /api/goals/:id`
  - `POST /api/goals/reorder`
- **Design:** surface brief `.impeccable/surfaces/goals.md`; components in `DESIGN.md` (Farm Queue, Relic Row, Goal Card, Amount Field, Icons).

### 13.3 Profile import (data side, 11 Nov 2026)

- **Source:** `GET https://api.warframe.com/cdn/getProfileViewingData.php?playerId=<accountId>`, no login. The ID is the `user_id` from `warframe.com/api/user-data` (that page shows the email: never screenshot it). A real response with the name, ID and clan removed is in `apps/api/src/sources/fixtures/profile/`.
- **Kept** (`Profile` in `packages/shared/src/profile.ts`): display name, Mastery Rank (`PlayerLevel`), XP per ranked item (`LoadOutInventory.XPInfo`, keyed by the game's internal path, the same `uniqueName` goals use), syndicate standing and rank (`Affiliations`), intrinsic levels (`PlayerSkills` keys `LPS_*`), missions completed, star-chart nodes with a completion, time played. **Not kept:** account ID, clan, loadouts. **Not in the response:** resources, blueprints, parts, counts.
- **Rate limit:** too many or invalid requests can block the IP from logging into the game. So: only when the user presses Refresh, never automatic, never retried, at least one hour between calls (failed ones count, and the wait survives a restart or a new ID), always show the cached copy.
- **Storage:** the ID in `settings` (`profile.account_id`, local only, never returned by the API or logged); the normalised profile in `profile_cache`.
- **API:** `GET /api/profile`, `PUT /api/profile/account {accountId}`, `POST /api/profile/refresh` (409 without an ID, 429 inside the hour, 502 if DE fails or answers oddly, old copy kept), `DELETE /api/profile`.
- **Mastered** (Warframe wiki, "Affinity", checked 11 Nov 2026): rank 30 needs 1000 × rank² affinity for a Warframe or companion (900,000) and half of that for a weapon (450,000). `GET /api/goals` sets `mastered` on a goal when the profile's XP for its `uniqueName` reaches that (`domain/mastery.ts`). The profile keeps counting XP past rank 30. Archwings, Sentinels and Kitguns aren't goals, so their paths aren't checked.
- **UI** (`#/profile`, brief `.impeccable/surfaces/profile.md`): setup (ID field, steps), then Mastery Rank, items ranked, missions, star-chart nodes, time played, intrinsics, Refresh (locked for an hour), Change ID, Forget. Goal cards show a "mastered (rank 30)" badge.

### 13.4 Inventory: parts and resources as entities (11 Nov 2026, Alex's request)

- **Why manual:** DE's public profile has no inventory, and the only inventory route needs the game's login token (off-limits, §2). So amounts are typed in; the app makes them consistent.
- **Entities:** resources (`resource_stock`) and parts (`part_stock`: `blueprints` held and finished `crafted`), both shared by all goals and keyed by the game's `uniqueName`. Parts with a crafting recipe (`part-recipes.json`) go blueprint → crafted; the main blueprint and Prime weapon parts only use `crafted` ("have"). Part stock is named "{item} {part}", e.g. "Nidus Prime Chassis". Migration 0006 turned ticks on active goals into `crafted` stock; `goal_parts` now only holds notes.
- **Goals** count a part as owned from the finished-part stock, shared in goal order like resources (`sharePartStock`).
- **Craft** (`POST /api/parts/craft {key}`): blueprint −1, finished part +1, Credits and materials out. Blocked (409 `not_enough`, listing what's missing) unless everything is there. **Build** (`POST /api/goals/:id/built`): uses up every part (the main blueprint unless `blueprintReusable`, from the data's `consumeOnBuild: false`) and the item's own resources, blocked the same way; `{useStock: false}` only marks it built. Warframe wiki, "Foundry" (checked 11 Nov 2026): most blueprints are used up when crafting; reusable ones are marked in game.
- **Undo** (`POST /api/undo`): the last craft or build, within 15 minutes, as exact amount changes (never below 0), plus the goal's status. `GoalsResponse.undo` says what can be undone.
- **Direct amounts:** `PUT /api/parts {key, blueprints?, crafted?}` and `PUT /api/resources`. Each goal part carries `craftShort`, each goal `buildShort`.
- **UI** (goal card, 11 Nov 2026): Part Rows with Blueprints/Crafted (or Have) amounts and Craft, materials as have / need, build confirm with what it uses (or "Already built in game"), the Undo bar, `+250`/`-30` in every amount field, and a "Blueprints you have" group at the top of the farm queue. `GoalsResponse.undo` is `{kind, name, expiresAt}`; the screen words it. See DESIGN.md.
- **Inventory screen** (`#/inventory`, brief `.impeccable/surfaces/inventory.md`): every entity once, A–Z, from `GET /api/goals` (no new API): needed resources with have / of / short, parts grouped by goal (Blueprints + Crafted, or Have), and a folded "Not needed right now" group for saved amounts no active goal uses. A filter matches names. Editing here changes the same shared amounts the goal cards show.

### 13.2 Later (not designed in detail yet)

- **Circuit points tracker** and **Search Pulse planner**.
- **Syndicates on the Profile screen:** needs a verified map from DE's tags (e.g. `CetusSyndicate`) to names and ranks.
- **Second user and VPS hosting:** login, per-user data (already modelled), HTTPS.
- **Spanish** translation.
- **Phone access** on the home network (LAN binding setting).

---

## Appendix A. Default checklist (seed v6)

`⚠️` = shipped with the "verify" badge. Since seed v4 (10 Nov 2026) no item has it: everything below was checked in game.

**Daily** (`daily`, resets 21:00 local / 00:00 UTC)

- Core
  - Daily login reward
  - First Win of the Day
  - Steel Path Incursions: counter ×6 (5 Steel Essence each)
  - The Circuit: 4 stages (530 points with the daily bonus)
  - Simaris daily target
- Quick visits
  - Spend Syndicate standing if capped
  - Darvo's Daily Deal
  - "Today's Special" vendors (reset at 00:00 UTC with the other dailies)
  - Acrithis daily shop (Pathos Clamps)
  - Marie Leroux's daily shop

**Sortie** (`sortie`)

- Sortie (3 missions)

**8-hour vendors** (`eight_hour`, resets 01:00 / 09:00 / 17:00 local, 04:00 / 12:00 / 20:00 UTC)

- Loid: Entrati lab materials
- Grandmother (Necralisk): token deals
- Archimedean Yonta: Voidplume Pinion

**Every 4 days** (`four_day`, resets 21:00 local / 00:00 UTC, every 4 days from 11 Nov 2026)

- Ergo Glast: Tenet weapons
- Eleanor Nightingale: Tenet A/B rotation

**Weekly** (`weekly`, resets Sunday 21:00 local / Monday 00:00 UTC)

- Minor missions
  - Darvo's weekly mission
  - Maroo's weekly mission (Ayatan Sculpture)
- Passes
  - Nightwave weekly missions + shop
  - 1999 Calendar
- Kuva route
  - Archimedean Yonta: 35,000 Kuva for 5 Voidplume Pinions
  - Palladino: 35,000 Kuva for 10 Riven Slivers
  - Acrithis: 10,000 Kuva for 10 Pathos Clamps
  - Hunhow: counter ×3 (17,000 Kuva each)
  - Teshin: Kuva for Steel Essence
  - Nightwave / Arbitrations Kuva
- Big vendors
  - Acrithis weekly rotation
  - Palladino
  - Teshin: spend Steel Essence
  - Vosfor arcanes (Loid, Sanctum Anatomica): sub-ticks Vendetta · Radiation · Ignition
  - Kahl-175 weekly mission (Stock)
  - Bird 3: 1 Archon Shard (30,000 Cavia standing)
  - Cavalero: this week's Incarnon adapters (Platinum)
- Endgame
  - Archon Hunt
  - Search Pulses: counter ×5
  - Netracell run(s)
  - Deep Archimedea (Elite): aim for 34 points
  - Temporal Archimedea: go for all 37 points
  - Descendia: normal
  - Descendia: Steel Path (25 Steel Essence at floor 21)
  - Descendia: Infernum 21 (Roathe)
  - Helminth: apply 3 Invigorations

**Baro Ki'Teer** (`baro`)

- Visit Baro (Ducats + Credits)
