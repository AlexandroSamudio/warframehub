#!/usr/bin/env node
// `npm run install-launcher` (SPEC §9.2): adds "WarframeHub" to the app menu.
// Writes a .desktop file and an icon under $XDG_DATA_HOME (normally ~/.local/share).
// `npm run install-launcher -- --uninstall` removes them again.
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const xdg = process.env.XDG_DATA_HOME;
const dataHome = xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.local', 'share');

const desktopFile = join(dataHome, 'applications', 'warframehub.desktop');
const iconFile = join(dataHome, 'icons', 'hicolor', 'scalable', 'apps', 'warframehub.svg');
const launcher = join(repo, 'scripts', 'warframehub-launcher.sh');

/** Quotes an Exec argument as the Desktop Entry spec asks. */
function quoteExec(arg) {
  return `"${arg.replace(/(["`$\\])/g, '\\$1')}"`;
}

if (process.argv.includes('--uninstall')) {
  rmSync(desktopFile, { force: true });
  rmSync(iconFile, { force: true });
  console.log(`Removed ${desktopFile} and ${iconFile}`);
  process.exit(0);
}

if (!existsSync(join(repo, 'apps', 'web', 'dist', 'index.html'))) {
  console.warn('Note: the app is not built yet. Run "npm run build" before using the launcher.');
}

mkdirSync(dirname(desktopFile), { recursive: true });
mkdirSync(dirname(iconFile), { recursive: true });
copyFileSync(join(repo, 'apps', 'web', 'public', 'favicon.svg'), iconFile);

writeFileSync(
  desktopFile,
  [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.5',
    'Name=WarframeHub',
    'GenericName=Warframe tracker',
    'Comment=Daily and weekly Warframe checklist with reset clocks and live rotations',
    `Exec=${quoteExec(launcher)}`,
    'Icon=warframehub',
    'Terminal=false',
    'Categories=Game;',
    'Keywords=warframe;tracker;checklist;',
    'StartupNotify=false',
    '',
  ].join('\n'),
  { mode: 0o644 },
);

console.log(`Installed ${desktopFile}`);
console.log(`Installed ${iconFile}`);
console.log('Look for "WarframeHub" in the app menu (it may take a few seconds to appear).');
