# WarframeHub

A personal [Warframe](https://www.warframe.com/) companion that runs on your own computer.

**Status:** v1 (Weekly Tracker) is feature-complete: a daily and weekly checklist that resets itself at the game's resets, with reset clocks, live rotations (Sortie, Archon Hunt, Teshin, Darvo, Baro, Nightwave, events), an edit mode, and a click-to-start launcher.

- Spec: [`docs/SPEC.md`](docs/SPEC.md)
- Stack: TypeScript · Fastify · Svelte 5 + Vite · SQLite (Drizzle) · npm workspaces
- Runs on `127.0.0.1` only. No accounts, no game-client hooks, no Warframe login.

Live data comes from the community [warframestat.us](https://docs.warframestat.us/) API by [WFCD](https://github.com/WFCD).

WarframeHub is a fan project and is not affiliated with or endorsed by Digital Extremes. Warframe and its content are trademarks of Digital Extremes Ltd.

## Daily use (Linux)

Requires [mise](https://mise.jdx.dev/) (`brew install mise` on Bazzite).

```sh
git clone https://github.com/AlexandroSamudio/warframehub.git
cd warframehub
mise install
npm ci
npm run build
npm run install-launcher   # adds "WarframeHub" to the app menu
```

Click **WarframeHub** in the app menu: it starts the server if needed and opens the browser. It stops when you press **Quit** (Settings), or by itself after 30 minutes with no WarframeHub tab open. Nothing runs at boot.

- **Your data** lives in `~/.local/share/warframehub/` (or `$WFHUB_DATA_DIR`), never in the repo.
- **Updating:** `git pull && npm ci && npm run build`.
- **Removing the menu entry:** `npm run install-launcher -- --uninstall`.

## Development

Requires [mise](https://mise.jdx.dev/) (or Node.js 24 with npm 11).

```sh
mise install      # installs the pinned Node version
npm install
npm run dev       # API on http://127.0.0.1:4317, web on http://127.0.0.1:5173
```

Open http://127.0.0.1:5173. Other commands:

| Command             | What it does                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `npm test`          | run all tests (Vitest)                                             |
| `npm run lint`      | ESLint + Prettier check                                            |
| `npm run typecheck` | TypeScript and Svelte type checks                                  |
| `npm run build`     | production build of all packages                                   |
| `npm start`         | run the built app on http://127.0.0.1:4317 (after `npm run build`) |
| `npm run format`    | auto-format and auto-fix lint issues                               |

Project layout: `apps/api` (Fastify), `apps/web` (Svelte + Vite), `packages/shared` (Zod schemas shared by both). See [`CLAUDE.md`](CLAUDE.md) for how they fit together.

## License

[MIT](LICENSE)
