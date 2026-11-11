# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary user: Alex**, the owner and only user today. He plays Warframe on a Bazzite gaming PC (Steam/Proton) and develops WarframeHub on EndeavourOS on the same machine.
- **How he uses it** (confirmed 10 Nov 2026):
  - **alt-tabbing** from the game on the same screen between missions: check what's left, tick something, switch back;
  - **before and after a session**: plan what to do, tick off what's done.
- **Later, not built:** a friend with their own ticks (the data model already carries `user_id`).
- **Language:** English now, Spanish later. Alex's first language isn't English, so UI copy must be plain and short.

## Product Purpose

A personal Warframe companion that runs on Alex's own computer. The long-term goal is to make it the main place to track progression and objectives.

- **Built:** the Weekly Tracker (v1):
  - a daily and weekly checklist that resets itself at the game's real resets;
  - reset clocks;
  - live rotations (Sortie, Archon Hunt, Teshin, Darvo, Baro, Nightwave, Circuit, Deep and Temporal Archimedea, events, arbitration);
  - an edit mode;
  - a click-to-start launcher.
- **Next:** a goal planner ("build this Warframe or weapon": parts, resources, where they drop, a shopping list).
- **Success:** Alex never has to remember a reset or look up a rotation elsewhere, and a glance shows what's left this period.

## Positioning

- Local-only and private: it runs on `127.0.0.1`, the data stays on his machine, and there are no accounts.
- Built around Alex's own "Perfect Week" route, with every game fact checked against the wiki, the live API or in game (nothing from memory).
- No third-party app to install (no Overwolf), no game-client hooks, and it never asks for Warframe credentials.

## Operating Context

- **Starting and stopping:** from the Linux app menu (`scripts/warframehub-launcher.sh`). The server stops on Quit, or after 30 minutes with no open tab.
- **Where it's used:** a desktop browser window, alt-tabbed with a full-screen game. Sessions are short and glanceable.
- **Time:** every time is computed in UTC and shown in the user's zone (default `America/Argentina/Buenos_Aires`, GMT-3) with UTC next to it. Resets happen at 21:00 local / 00:00 UTC (daily, weekly on Sunday evening local), 01:00 / 09:00 / 17:00 local (8-hour vendors), and so on.
- **Live data:** comes from api.warframestat.us (WFCD), cached locally. It can lag or be missing, so every card shows how fresh it is.

## Capabilities and Constraints

- **Stack:** Svelte 5 + Vite SPA, plain CSS with custom properties (no CSS framework), served by a Fastify API on the same port.
- **Strings:** every UI string goes through `t()` in `apps/web/src/lib/i18n/`.
- **Layout:** works at desktop and phone widths, with no sideways scrolling.
- **Dependencies:** minimal; a new runtime dependency needs a reason.
- **Terms:**
  - _period_: when ticks reset (daily, weekly, 8-hour, every 4 days, Sortie, Baro, manual);
  - _verify badge_: a game fact not yet confirmed in game;
  - _freshness_: Live / Estimated / May be outdated / Check in game.
- **Undecided:** phone access on the home network (planned, off by default).

## Brand Commitments

- Name: **WarframeHub**. A fan project, not affiliated with or endorsed by Digital Extremes.
- **Warframe-inspired dark theme** (binding): dark void background, Orokin gold accents, teal second colour, thin geometric frames with angled corners. Dark only; no light mode planned.
- **Original art for the app itself** (binding): no DE logos or copied UI assets, and the interface (frames, marks, icons) stays original. DE's Warframe images (portraits, ability icons) are allowed for personal use in the Warframes section (Alex, 11 Nov 2026): fetched from cdn.warframestat.us once, cached in the data folder, never committed.
- **Local time + UTC everywhere** (binding).
- **No cosmetic content** (binding): no decorations, furniture or skins in checklists or goals.

## Evidence on Hand

- The live app and its theme: `apps/web/src/app.css` and `apps/web/src/components/`.
- The design rationale: `docs/SPEC.md` §8, and the research and decisions in `docs/HANDOFF.md`.
- Real API responses saved as fixtures: `apps/api/src/sources/fixtures/`.
- No testimonials, users or metrics beyond Alex; none should be invented.

## Product Principles

1. **Correct before pretty.** Game facts and reset times are checked, and anything unconfirmed is marked, never guessed.
2. **Glanceable between missions.** The state of things (what's left, when it resets) must read in seconds after an alt-tab.
3. **Honest data.** Show how fresh live data is, and say plainly when something isn't known.
4. **Private and local.** No accounts, no tracking, no requests beyond the data the app needs.
5. **Plain words.** Short, simple English that translates well to Spanish.

## Accessibility & Inclusion

- Readable first: measured contrast (text at least 4.5:1, control borders at least 3:1), visible keyboard focus, `prefers-reduced-motion` respected, and aligned (tabular) numbers for timers.
- Full keyboard use, including alternatives to drag-and-drop.
