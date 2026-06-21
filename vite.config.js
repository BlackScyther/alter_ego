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
const tailwindSnippet = readFileSync(resolve(srcRoot, 'ui/tailwind.html'), 'utf-8');

function faviconTagsForPage(htmlPath) {
  const path = (htmlPath ?? '').replace(/\\/g, '/');
  const dir = path.replace(/\/[^/]+\.html$/i, '').replace(/^\//, '');
  const depth = dir ? dir.split('/').filter(Boolean).length : 0;
  const prefix = depth ? '../'.repeat(depth) : '';
  const href = `${prefix}assets/favicon.png`;
  return [
    `<link rel="icon" type="image/png" sizes="32x32" href="${href}" />`,
    `<link rel="apple-touch-icon" href="${href}" />`
  ].join('\n');
}

/** Inject favicon + shared Tailwind CDN snippet into app HTML pages (see rules/ui.md). */
function injectHeadAssetsPlugin() {
  return {
    name: 'alter-ego-inject-head-assets',
    transformIndexHtml(html, ctx) {
      const path = (ctx.path ?? ctx.filename ?? '').replace(/\\/g, '/');
      if (path.endsWith('tailwind.html')) return html;

      let out = html;
      if (!out.includes('rel="icon"')) {
        out = out.replace('</head>', `${faviconTagsForPage(path)}\n</head>`);
      }

      const skipTailwind = path.includes('/sheet/') || out.includes('cdn.tailwindcss.com');
      if (!skipTailwind) {
        out = out.replace('</head>', `${tailwindSnippet}\n</head>`);
      }
      return out;
    }
  };
}

/** Redirect bare /editor → /editor/ so MPA routes work when index.html is stripped from URLs. */
function trailingSlashRedirectPlugin() {
  const segments = [
    'editor',
    'sheet',
    'launcher',
    'player',
    'gm',
    'game',
    'join',
    'playlist',
    'levels',
    'resources',
    'feedback'
  ];
  return {
    name: 'alter-ego-trailing-slash-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? '';
        const pathname = raw.split('?')[0];
        const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
        for (const seg of segments) {
          if (pathname === `/${seg}`) {
            res.statusCode = 301;
            res.setHeader('Location', `/${seg}/${query}`);
            res.end();
            return;
          }
        }
        next();
      });
    }
  };
}

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
        res.statusCode = 302;
        res.setHeader('Location', target);
        res.end();
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
  plugins: [injectHeadAssetsPlugin(), trailingSlashRedirectPlugin(), legacySrcPrefixRedirectPlugin(), parentStaticPlugin()],
  server: {
    port: 5173,
    fs: { allow: [projectRoot] },
    open: '/launcher/index.html',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        bypass(req) {
          const pathname = (req.url ?? '').split('?')[0];
          if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) {
            return req.url;
          }
        }
      }
    }
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
