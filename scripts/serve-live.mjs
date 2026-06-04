#!/usr/bin/env node
/**
 * Local mirror of sync-from-live with debug request logging (session f629ed).
 */
import express from 'express';
import { appendFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(projectRoot, 'sync-from-live');
const logPath = resolve(projectRoot, 'debug-5d39f7.log');
const DEBUG_ENDPOINT = 'http://127.0.0.1:7737/ingest/957dca39-ea8e-420d-92ba-58809ca18a8c';
const SESSION_ID = '5d39f7';

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

function debugEmit(payload) {
  const line = JSON.stringify({
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    ...payload
  });
  try {
    appendFileSync(logPath, `${line}\n`);
  } catch {
    /* ignore */
  }
  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': SESSION_ID
    },
    body: line
  }).catch(() => {});
}

function editorFilesExist() {
  return {
    rootEditor: existsSync(resolve(publicDir, 'editor', 'index.html')),
    srcEditor: existsSync(resolve(publicDir, 'src', 'editor', 'index.html'))
  };
}

const app = express();

function legacyPathRedirect(req, res, next) {
  const pathname = req.path;
  if (pathname.startsWith('/src/')) return next();
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  if (pathname === '/levels.html') {
    // #region agent log
    debugEmit({
      runId: 'pre-fix',
      hypothesisId: 'A',
      location: 'scripts/serve-live.mjs:legacyPathRedirect',
      message: 'redirect legacy path',
      data: { from: pathname, to: `/src/levels.html${query}` }
    });
    // #endregion
    return res.redirect(301, `/src/levels.html${query}`);
  }
  for (const seg of LEGACY_APP_SEGMENTS) {
    if (pathname === `/${seg}` || pathname.startsWith(`/${seg}/`)) {
      const target = `/src${pathname}${query}`;
      // #region agent log
      debugEmit({
        runId: 'pre-fix',
        hypothesisId: 'A',
        location: 'scripts/serve-live.mjs:legacyPathRedirect',
        message: 'redirect legacy path',
        data: { from: pathname, to: target, segment: seg }
      });
      // #endregion
      return res.redirect(301, target);
    }
  }
  next();
}

app.use((req, res, next) => {
  const pathname = req.path;
  // #region agent log
  debugEmit({
    runId: 'pre-fix',
    hypothesisId: pathname.startsWith('/src/') ? 'A' : pathname.includes('editor') ? 'B' : 'C',
    location: 'scripts/serve-live.mjs:request',
    message: 'serve-live request',
    data: {
      method: req.method,
      url: req.originalUrl,
      pathname,
      referer: req.get('referer') ?? null,
      ...editorFilesExist()
    }
  });
  // #endregion
  next();
});

app.use(legacyPathRedirect);

app.use(
  express.static(publicDir, {
    extensions: ['html'],
    index: ['index.html']
  })
);

app.use((req, res) => {
  // #region agent log
  debugEmit({
    runId: 'pre-fix',
    hypothesisId: 'B',
    location: 'scripts/serve-live.mjs:404',
    message: 'serve-live 404',
    data: { pathname: req.path, url: req.originalUrl, ...editorFilesExist() },
    timestamp: Date.now()
  });
  // #endregion
  res.status(404).send('Not found');
});

app.listen(port, () => {
  console.log(`[serve-live] ${publicDir}`);
  console.log(`[serve-live] http://localhost:${port}/src/launcher/`);
  console.log(`[serve-live] debug log → ${logPath}`);
});
