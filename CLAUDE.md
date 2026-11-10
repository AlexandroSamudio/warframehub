# CLAUDE.md

Guidance for Claude Code sessions in this repo. The full design is in `docs/SPEC.md`; read it before changing behaviour. `docs/HANDOFF.md` has the background: how we work together, research done so far, data-source findings, and current status.

## Project

WarframeHub: a personal Warframe companion that runs locally (`127.0.0.1`). v1 = Weekly Tracker (checklist with auto-resets, reset clocks, live rotations, editable items). Single user now; the data model already carries `user_id` for a second user / VPS later.

## Stack

- Node.js 24 LTS (pinned with mise), TypeScript strict, npm workspaces
- `apps/api`: Fastify, SQLite via better-sqlite3 + Drizzle ORM (migrations run at startup)
- `apps/web`: Svelte 5 + Vite SPA, plain CSS with custom properties (no CSS framework)
- `packages/shared`: Zod schemas + types for every API request/response
- Vitest, ESLint + Prettier, GitHub Actions CI

## Commands

- `npm run dev`: API on :4317 and web on :5173 (Vite proxies `/api`)
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`
- `npm run format`: Prettier + ESLint autofix
- `npm start`: the built app (API + web) on :4317. `npm run install-launcher` adds the app-menu launcher (`scripts/warframehub-launcher.sh`)
- Idle shutdown: `WFHUB_IDLE_MINUTES` (default 30, `0` = off; `npm run dev` turns it off)
- `npm run db:generate -w @warframehub/api`: after changing `apps/api/src/db/schema.ts`, writes a new SQL migration to `apps/api/drizzle/` (commit it; never edit applied migrations)

## How the workspaces fit together

- `@warframehub/shared` exports a custom `source` condition pointing at its TypeScript source. Dev (`tsx --conditions=source`), Vite, Vitest and `tsc --noEmit` all use it, so **shared never needs building during development**.
- Production builds resolve `shared` from `dist/` instead (`apps/api/tsconfig.build.json` clears `customConditions`). `npm run build` builds in workspace order: shared → api → web.
- Dependencies are pinned to exact versions (`.npmrc` `save-exact`). Pick versions published at least two weeks ago. npm 11 (bundled with Node 24) is required; npm 10 fails to resolve vitest's peer set.
- npm 11 only runs install scripts listed in `allowScripts` in the root `package.json` (currently esbuild, used by tsx). A new package needing one must be approved with `npm install-scripts approve <pkg>`.

## Rules

- **Warframe accuracy.** Anything patch-sensitive (vendors, prices, rotations, reset times) must be checked against the Warframe wiki, DE patch notes or the live API, not memory. Unconfirmed facts get `verify: true` in the seed.
- **No cosmetic content** in the checklist (decorations, furniture, skins).
- **Time:** compute and store in UTC; display in the user's zone (default `America/Argentina/Buenos_Aires`, GMT-3) with UTC alongside. The **server** computes period keys; the client never does.
- Period/reset logic lives in `apps/api/src/domain/periods.ts` as pure functions with tests. Any change there needs tests at the boundaries (00:00 UTC, Monday, 8-hour marks).
- Never overwrite user-edited checklist items when the seed changes (see SPEC §5.1).
- Real user data lives outside the repo (`$XDG_DATA_HOME/warframehub/`). Never commit `.db` files.
- No game-client hooks, no Overwolf, never ask for Warframe credentials. DE's profile endpoint (later) must be called rarely: excessive requests can block the user's IP from logging in.
- All UI strings go through `t()` in `apps/web/src/lib/i18n/` (Spanish comes later).
- Keep dependencies minimal; a new runtime dependency needs a reason in the PR.
