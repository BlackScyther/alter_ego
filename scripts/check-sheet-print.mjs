/**
 * Fill the character sheet with a dense level-10 warlord and check print layout.
 * One-off. Does not leave a server running.
 *
 *   node scripts/check-sheet-print.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'src');
const outDir = join(root, 'output');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const payload = {
  'player-name': 'Markus',
  'character-name': 'El Tonnaz Marnex',
  level: 10,
  class: 'Warlord (Marshal)',
  'paragon-path': '',
  'epic-destiny': '',
  race: 'Genasi',
  size: 'Medium',
  age: '',
  gender: '',
  height: '',
  weight: '',
  alignment: 'Lawful Good',
  deity: '',
  company: '',
  'total-xp': 52700,
  'str-score': 18,
  'con-score': 14,
  'dex-score': 12,
  'int-score': 16,
  'wis-score': 10,
  'cha-score': 10,
  'max-hp': 70,
  'current-hp': 70,
  'temp-hp': 0,
  'surges-day': 9,
  'surge-uses': 9,
  'init-misc': 6,
  milestones: 0,
  'armor-penalty-global': -1,
  'ac-abil': 1,
  'ac-class': 0,
  'ac-feat': 0,
  'ac-enh': 1,
  'ac-misc': 0,
  'ac-armor': 6,
  'fort-abil': 4,
  'fort-class': 1,
  'fort-enh': 1,
  'ref-abil': 1,
  'ref-class': 1,
  'ref-enh': 1,
  'will-abil': 0,
  'will-class': 1,
  'will-enh': 1,
  'speed-base': 5,
  'speed-armor': 0,
  'speed-item': 0,
  'speed-misc': 0,
  'melee-name': 'Melee Basic Attack — Hungry Spear',
  'melee-dice': '1d10',
  'melee-atk-abil': 4,
  'melee-atk-prof': 2,
  'melee-atk-enh': 2,
  'melee-atk-feat': 1,
  'melee-dmg-abil': 4,
  'melee-dmg-enh': 2,
  'ranged-name': 'Ranged Basic Attack — Javelin',
  'ranged-dice': '1d6',
  'ranged-atk-abil': 1,
  'ranged-atk-prof': 2,
  'ranged-atk-enh': 1,
  'ranged-dmg-abil': 1,
  'ranged-dmg-enh': 1,
  'basic1-weapon': 'Melee Basic Attack — Hungry Spear',
  'basic1-vs': 'AC',
  'basic1-dmg': '1d10',
  'basic2-weapon': 'Ranged Basic Attack — Javelin',
  'basic2-vs': 'AC',
  'basic2-dmg': '1d6',
  'race-features': 'Ability scores: +2 Intelligence\nElemental Manifestation: Watersoul\nWatersoul: You can breathe underwater. You gain a +2 racial bonus to saving throws against ongoing damage.',
  'class-features': 'Build option: Tactical Warlord\nRole: Leader. You rally your companions with shouted commands and cunning stratagems, leading them to victory through superior tactics.\nPower Source: Martial\nCombat Leader: You and each ally who can see and hear you gain a +2 power bonus to initiative.\nTactical Presence: An ally who can see you adds your Intelligence modifier to the damage roll of an attack granted by your action point.',
  feats: 'Axe Expertise\nImproved Initiative\nTactical Assault',
  languages: 'Common, Primordial',
  rituals: 'Make Whole',
  resistances: 'Resist 5 fire, Resist 5 lightning, Resist 5 cold, Resist 5 acid, Resist 5 poison, Resist 5 psychic',
  conditions: '',
  'save-mods': '+2 racial bonus against ongoing damage',
  'special-senses': '',
  'ap-effects': 'Tactical Presence adds your Intelligence modifier to an ally’s damage.',
  'init-conditional': '+2 when you and your allies can see and hear each other',
  'skill-athletics-trained': true,
  'skill-endurance-trained': true,
  'skill-heal-trained': true,
  'skill-history-trained': true,
  'skill-intimidate-trained': true,
  'power-index': [
    { id: 'at-will', label: 'At-Will', items: ['Brash Assault', 'Commander’s Strike', 'Wolf Pack Tactics'] },
    { id: 'encounter', label: 'Encounter', items: ['Vengeance is Mine', 'Lead the Attack', 'Warlord’s Favor', 'Swiftcurrent'] },
    { id: 'daily', label: 'Daily', items: ['Bastion of Defense', 'Lead by Example'] },
    { id: 'utility', label: 'Utility', items: ['Knight’s Move', 'Aid the Injured', 'Tactical Order'] }
  ],
  'equipped-lines': 'Armor: +1 Scale Armor\nMain hand: +2 Hungry Spear\nOff hand: Heavy Shield\nNeck: Amulet of Protection +1\nArms: Bracers of Defense'
};

function serve(port, missing) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let path = req.url.split('?')[0];
      if (path === '/') path = '/index.html';
      const filePath = path.startsWith('/dimensions')
        ? join(root, 'dimensions.json')
        : join(srcDir, path.replace(/^\//, ''));
      if (!existsSync(filePath)) {
        missing.push(path);
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

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: 'msedge' });
  }
}

async function main() {
  const missing = [];
  const port = 5198;
  const server = await serve(port, missing);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1500 } });
  await page.addInitScript((data) => {
    localStorage.setItem('dnd4e.sheetPayload', JSON.stringify(data));
    sessionStorage.setItem('sheet.includePowerCards', '0');
  }, payload);
  const logs = [];
  page.on('pageerror', (err) => logs.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(`console: ${msg.text()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/sheet/index.html?from=editor`, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  try {
    await page.waitForFunction(() => {
      const total = document.getElementById('init-total');
      return total && total.textContent.trim() !== '';
    }, null, { timeout: 8000 });
  } catch (err) {
    const body = await page.evaluate(() => ({
      init: document.getElementById('init-total')?.textContent ?? null,
      level: document.getElementById('level')?.textContent ?? null,
      html: document.body?.innerText?.slice(0, 500) ?? ''
    }));
    console.error(logs.join('\n'));
    console.error('missing', missing.join(', '));
    console.error(JSON.stringify(body));
    throw err;
  }

  const report = await page.evaluate(() => {
    const pageEl = document.querySelector('.sheet-page');
    const pageBox = pageEl.getBoundingClientRect();
    const problems = [];
    const px = (pt) => (pt * 96) / 72;

    const visible = (el) => {
      if (el.closest('[hidden]')) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };

    const inside = (el, label) => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      const slop = 1.5;
      if (box.left < pageBox.left - slop || box.right > pageBox.right + slop || box.top < pageBox.top - slop || box.bottom > pageBox.bottom + slop) {
        problems.push(`${label} outside page (${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)})`);
      }
    };

    for (const el of pageEl.querySelectorAll('.sheet-val, .sheet-total, .sheet-prose, .index-name, th, td')) {
      if (!visible(el)) continue;
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      const isLabel = el.classList.contains('sheet-label') || el.classList.contains('panel-title');
      const min = isLabel ? px(7) - 0.4 : px(8) - 0.4;
      const id = el.id || el.className || el.textContent.slice(0, 24);
      if (el.classList.contains('sheet-val') || el.classList.contains('sheet-prose') || el.classList.contains('sheet-total')) {
        if (size < min) problems.push(`${id} font ${size.toFixed(2)}px < ${min.toFixed(2)}px`);
        const color = style.color.replace(/\s/g, '');
        if (color !== 'rgb(0,0,0)') problems.push(`${id} color ${style.color}`);
      }
      if (el.classList.contains('sheet-label') || (el.classList.contains('panel-title') && visible(el))) {
        if (size < px(7) - 0.4) problems.push(`label ${id} font ${size.toFixed(2)}px`);
      }
      inside(el, id);
    }

    for (const el of pageEl.querySelectorAll('.sheet-label, .panel-title')) {
      if (!visible(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < px(7) - 0.4) problems.push(`label ${el.textContent.slice(0, 24)} font ${size.toFixed(2)}px`);
    }

    for (const el of pageEl.querySelectorAll('.breakdown .sheet-label, .breakdown .sheet-val, th')) {
      if (!visible(el)) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        problems.push(`clipped "${el.textContent.trim().slice(0, 16)}" ${el.scrollWidth}px in ${el.clientWidth}px`);
      }
    }

    const mmToPx = (mm) => (mm * 96) / 25.4;
    const a4w = mmToPx(210);
    const a4h = mmToPx(297);
    if (Math.abs(pageEl.clientWidth - a4w) > 2 || Math.abs(pageEl.clientHeight - a4h) > 2) {
      problems.push(`page box ${Math.round(pageEl.clientWidth)}×${Math.round(pageEl.clientHeight)}px is not A4 (${Math.round(a4w)}×${Math.round(a4h)}px)`);
    }
    if (pageEl.scrollHeight > pageEl.clientHeight + 2) {
      problems.push(`page taller than A4 by ${pageEl.scrollHeight - pageEl.clientHeight}px`);
    }
    if (pageEl.scrollWidth > pageEl.clientWidth + 2) {
      problems.push(`page wider than A4 by ${pageEl.scrollWidth - pageEl.clientWidth}px`);
    }

    const sample = {
      init: document.getElementById('init-total')?.textContent,
      ac: document.getElementById('ac-total')?.textContent,
      attack: document.getElementById('basic1-atk')?.textContent,
      damage: document.getElementById('basic1-damage')?.textContent,
      powers: document.querySelectorAll('#power-index .index-name').length,
      gear: document.querySelectorAll('#equipped-lines .index-name').length
    };
    return {
      problems,
      sample,
      scrollHeight: pageEl.scrollHeight,
      clientHeight: pageEl.clientHeight,
      clientWidth: pageEl.clientWidth
    };
  });

  mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: join(outDir, 'sheet-print-check.png'), fullPage: true });
  await browser.close();
  server.close();

  console.log(JSON.stringify(report.sample));
  console.log(`page ${report.clientWidth}×${report.clientHeight}px (content ${report.scrollHeight}px tall)`);
  if (report.problems.length) {
    console.error(report.problems.slice(0, 40).join('\n'));
    console.error(`${report.problems.length} layout problem(s)`);
    process.exit(1);
  }
  console.log('Sheet fits the A4 page with readable black text.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
