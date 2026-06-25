#!/usr/bin/env node
/**
 * Export character sheet + level table to PDF (US Letter).
 * Requires: npm install && npx playwright install chromium
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'src');
const outDir = join(root, 'output');
const levelsOnly = process.argv.includes('--levels-only');
const inputFile = levelsOnly ? 'levels.html' : 'sheet/index.html';
const outName = levelsOnly ? 'alter-ego-levels-1-30.pdf' : 'alter-ego-sheet-page1.pdf';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json'
};

function serve(port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let path = req.url.split('?')[0];
      if (path === '/') path = '/index.html';
      const filePath = path.startsWith('/dimensions')
        ? join(root, 'dimensions.json')
        : join(srcDir, path.replace(/^\//, ''));
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    });
    server.listen(port, () => resolve(server));
  });
}

async function main() {
  const port = 5199;
  const server = await serve(port);
  const url = `http://127.0.0.1:${port}/${inputFile}`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });

  const { mkdirSync } = await import('fs');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, outName);

  await page.pdf({
    path: outPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });

  await browser.close();
  server.close();
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
