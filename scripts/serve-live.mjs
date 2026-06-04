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
const logPath = resolve(projectRoot, 'debug-f629ed.log');
const DEBUG_ENDPOINT = 'http://127.0.0.1:7737/ingest/957dca39-ea8e-420d-92ba-58809ca18a8c';
const SESSION_ID = 'f629ed';
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
