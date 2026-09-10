// Shared Playwright lookup for the headless tools (tools/playtest.js, tools/winrate.js).
// Requires Playwright: local dependency or the global install (NODE_PATH fallback).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @returns {{ chromium: object }} the Playwright module, wherever it is installed. */
export function loadPlaywright() {
  const candidates = ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright'];
  for (const c of candidates) { try { return require(c); } catch { /* next */ } }
  throw new Error('Playwright not found. Install with `npm i -D playwright-core` or set NODE_PATH to the global node_modules.');
}
