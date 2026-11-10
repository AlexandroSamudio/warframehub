# WarframeHub

A personal [Warframe](https://www.warframe.com/) companion that runs on your own computer.

**Status:** early development (Phase 0: project scaffold). The first version will be a **weekly tracker**: a daily and weekly checklist that resets itself at the game's resets, with reset clocks and live rotations (Sortie, Archon Hunt, Teshin, Darvo, Baro, Nightwave, events).

- Spec: [`docs/SPEC.md`](docs/SPEC.md)
- Stack: TypeScript · Fastify · Svelte 5 + Vite · SQLite (Drizzle) · npm workspaces
- Runs on `127.0.0.1` only. No accounts, no game-client hooks, no Warframe login.

Live data comes from the community [warframestat.us](https://docs.warframestat.us/) API by [WFCD](https://github.com/WFCD).

WarframeHub is a fan project and is not affiliated with or endorsed by Digital Extremes. Warframe and its content are trademarks of Digital Extremes Ltd.

## Development

Requires [mise](https://mise.jdx.dev/) (or Node.js 24 with npm 11).

```sh
mise install      # installs the pinned Node version
npm install
npm run dev       # API on http://127.0.0.1:4317, web on http://127.0.0.1:5173
```

Open http://127.0.0.1:5173. Other commands:

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm test`          | run all tests (Vitest)                    |
| `npm run lint`      | ESLint + Prettier check                   |
| `npm run typecheck` | TypeScript and Svelte type checks         |
| `npm run build`     | production build of all packages          |
| `npm start`         | run the built API (after `npm run build`) |
| `npm run format`    | auto-format and auto-fix lint issues      |

Project layout: `apps/api` (Fastify), `apps/web` (Svelte + Vite), `packages/shared` (Zod schemas shared by both). See [`CLAUDE.md`](CLAUDE.md) for how they fit together.

## License

[MIT](LICENSE)
