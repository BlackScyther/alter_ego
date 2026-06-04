import { defineConfig } from 'vite';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(projectRoot, 'src');

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
  root: srcRoot,
  plugins: [parentStaticPlugin()],
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
