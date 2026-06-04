import { defineConfig } from 'vite';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'));

function safeGit(cmd) {
  try {
    return execSync(cmd, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}
const srcRoot = resolve(projectRoot, 'src');

const DEBUG_ENDPOINT = 'http://127.0.0.1:7737/ingest/957dca39-ea8e-420d-92ba-58809ca18a8c';
const DEBUG_SESSION_ID = '5d39f7';

/** Redirect /src/* → /* when Vite root is src/ (sync-from-live URLs vs dev URLs). */
function legacySrcPrefixRedirectPlugin() {
  return {
    name: 'alter-ego-legacy-src-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? '';
        const pathname = raw.split('?')[0];
        if (!pathname.startsWith('/src/')) return next();
        const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
        const target = `${pathname.slice(4) || '/'}${query}`;
        // #region agent log
        fetch(DEBUG_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': DEBUG_SESSION_ID
          },
          body: JSON.stringify({
            sessionId: DEBUG_SESSION_ID,
            runId: 'pre-fix',
            hypothesisId: 'A',
            location: 'vite.config.js:legacySrcPrefixRedirect',
            message: 'vite redirect /src/*',
            data: { from: pathname, to: target },
            timestamp: Date.now()
          })
        }).catch(() => {});
        // #endregion
        res.statusCode = 302;
        res.setHeader('Location', target);
        res.end();
      });
    }
  };
}

/** Log dev-server requests for 404 / path mismatch debugging. */
function debugRequestPlugin() {
  return {
    name: 'alter-ego-debug-request',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '';
        const pathname = url.split('?')[0];
        // #region agent log
        fetch(DEBUG_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': DEBUG_SESSION_ID
          },
          body: JSON.stringify({
            sessionId: DEBUG_SESSION_ID,
            runId: 'pre-fix',
            hypothesisId: pathname.startsWith('/src/') ? 'A' : pathname.includes('editor') ? 'B' : 'D',
            location: 'vite.config.js:debugRequestPlugin',
            message: 'vite request',
            data: { method: req.method, url, pathname, viteRoot: 'src' },
            timestamp: Date.now()
          })
        }).catch(() => {});
        // #endregion
        next();
      });
    }
  };
}

/** Collect every HTML page under src/ (except legacy snippets). */
function htmlInputs(dir, base = dir, acc = {}) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      htmlInputs(full, base, acc);
      continue;
    }
    if (!name.endsWith('.html') || name === 'tailwind.html') continue;
    const rel = full.slice(base.length + 1).replace(/\\/g, '/');
    const key = rel.replace(/\.html$/, '').replace(/\//g, '-');
    acc[key === 'index' ? 'index' : key] = full;
  }
  return acc;
}

/** Serve metadata/, data/, and dimensions.json when Vite root is src/. */
function parentStaticPlugin() {
  const metadataRoot = resolve(projectRoot, 'metadata');
  const dataRoot = resolve(projectRoot, 'data');
  const dimensionsFile = resolve(projectRoot, 'dimensions.json');

  return {
    name: 'alter-ego-parent-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];

        if (url === '/dimensions.json' && existsSync(dimensionsFile)) {
          res.setHeader('Content-Type', 'application/json');
          res.end(readFileSync(dimensionsFile));
          return;
        }

        if (url.startsWith('/metadata/')) {
          const file = resolve(projectRoot, url.slice(1));
          if (file.startsWith(metadataRoot) && existsSync(file)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(readFileSync(file));
            return;
          }
        }

        if (url.startsWith('/data/')) {
          const file = resolve(projectRoot, url.slice(1));
          if (file.startsWith(dataRoot) && existsSync(file)) {
            const isJson = file.endsWith('.json');
            res.setHeader('Content-Type', isJson ? 'application/json' : 'application/octet-stream');
            res.end(readFileSync(file));
            return;
          }
        }

        next();
      });
    }
  };
}

export default defineConfig({
  // Without this, Vite serves index.html for /editor/ and links appear dead.
  appType: 'mpa',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg?.version ?? '0.0.0'),
    'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(safeGit('git rev-parse --abbrev-ref HEAD')),
    'import.meta.env.VITE_GIT_SHA': JSON.stringify(safeGit('git rev-parse --short HEAD'))
  },
  root: srcRoot,
  plugins: [legacySrcPrefixRedirectPlugin(), debugRequestPlugin(), parentStaticPlugin()],
  server: {
    port: 5173,
    fs: { allow: [projectRoot] },
    open: '/index.html'
  },
  build: {
    outDir: resolve(projectRoot, 'dist/app'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: htmlInputs(srcRoot)
    }
  }
});
