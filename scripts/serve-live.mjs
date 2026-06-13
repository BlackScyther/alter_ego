#!/usr/bin/env node
/**
 * Local static server for sync-from-live (production-style paths under /src/).
 */
import express from 'express';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(projectRoot, 'sync-from-live');

/** Vite dev uses /editor/; sync-from-live build uses /src/editor/. */
const LEGACY_APP_SEGMENTS = [
  'editor',
  'sheet',
  'launcher',
  'player',
  'gm',
  'game',
  'join',
  'playlist'
];
const port = Number(process.env.PORT || 5173);

const app = express();

function legacyPathRedirect(req, res, next) {
  const pathname = req.path;
  if (pathname.startsWith('/src/')) return next();
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  if (pathname === '/levels.html') {
    return res.redirect(301, `/src/levels.html${query}`);
  }
  for (const seg of LEGACY_APP_SEGMENTS) {
    if (pathname === `/${seg}` || pathname.startsWith(`/${seg}/`)) {
      const target = `/src${pathname}${query}`;
      return res.redirect(301, target);
    }
  }
  next();
}

app.use(legacyPathRedirect);

app.use(
  express.static(publicDir, {
    extensions: ['html'],
    index: ['index.html']
  })
);

app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(port, () => {
  console.log(`[serve-live] ${publicDir}`);
  console.log(`[serve-live] http://localhost:${port}/src/launcher/`);
});
