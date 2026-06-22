# Deployment — Webhosting (SSH / SFTP / Git)

Checklists for **shared or managed web hosting** with SSH, SFTP, and Git (available from your provider **from next week**). Technical steps for Node + static files: [deploy-online.md](deploy-online.md).

**Last updated:** 2026-05-24

---

## Hosting profile (fill in once)

Copy this block into your password manager or a private note. Agents and docs refer to these values.

| Field | Your value |
|-------|------------|
| Provider / plan | _e.g. IONOS, Hetzner Web Hosting, …_ |
| Primary domain | `https://________________.de` |
| SSH host | `________________` |
| SSH user | `________________` |
| SSH port | `22` (or `____`) |
| Web root (document root) | `/home/____/public_html` or `____` |
| App install path (repo on server) | `/home/____/alter-eger` |
| SQLite data directory (writable) | `/home/____/data/alter-eger` |
| Node.js on server? | Yes / No — version: `____` |
| Process manager | systemd / PM2 / panel “Node app” / none |
| Reverse proxy | Apache / nginx / panel only |
| Git remote on host (if used) | `git@____:repos/alter-eger.git` |
| Git deploy branch | `main` |
| `TOKEN_PEPPER` (generate once, store safely) | `________________` (min. 32 random chars) |
| Support ticket / docs URL | `________________` |

**Generated secrets (do not commit to Git):**

```bash
# Local — run once, save output in hosting profile
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Timeline overview

| When | List | Goal |
|------|------|------|
| **Now** (before SSH/SFTP/Git) | [§1 Now](#1-now--before-ssh-sftp-git) | Build locally, collect panel info, choose deploy path |
| **Week 1** (access opens) | [§2 Day 1](#2-day-1--hosting-inventory-ssh) | Verify Node, paths, HTTPS, write profile |
| **Week 1–2** | [§3 Setup](#3-one-time-server-setup) | Dirs, env, proxy, first API start |
| **First release** | [§4 Deploy](#4-first-production-deploy) | `dist/app` + API live |
| **Table night** | [§5 Go-live](#5-go-live--your-table) | GM + players smoke test |
| **After** | [§6 Ongoing](#6-ongoing--updates--backups) | Updates, backups |

---

## 1. Now — before SSH / SFTP / Git

Do these on your **PC** and in the **hoster control panel** (no SSH required yet).

### 1.1 Information from the panel

- [ ] Confirm **from which date** SSH, SFTP, and Git are active: `____-__-__`
- [ ] Note **domain** and whether **HTTPS** is included or must be enabled: `________________`
- [ ] Find **document root** path in panel docs: `________________`
- [ ] Check whether **Node.js** is offered (version, one app vs. CLI only): `________________`
- [ ] Check **persistent processes** (Node daemon, cron, “application” in panel): `________________`
- [ ] Check **SQLite / native modules**: hosting must allow `better-sqlite3` (Node with build tools or prebuilt binaries)
- [ ] Download or bookmark **SFTP credentials** and **SSH key** instructions
- [ ] If Git on host: note **remote URL**, default branch, and whether deploy is **push-to-deploy** or manual pull

### 1.2 Local project readiness

- [ ] `git clone` / pull latest `Alter_Eger` on your dev machine
- [ ] `npm install`
- [ ] `npm run build:app` — succeeds, `dist/app/` exists
- [ ] `npm run test:api` — passes (API smoke test)
- [ ] `npm test` — passes (optional but recommended before go-live)
- [ ] Decide production URL for env vars: `PUBLIC_APP_URL` = `https://________________`
- [ ] Generate `TOKEN_PEPPER` and store in hosting profile (not in repo)

### 1.3 Choose deploy method (decide before week 1)

| Method | Best when | You will… |
|--------|-----------|-----------|
| **A. Git on server** | Host offers Git + SSH; you want `git pull` on server | Clone on server; pull + build on SSH |
| **B. SFTP upload** | No Git on server or first time manual | Upload `dist/app` + run install on server via SSH |
| **C. Git push from PC + Actions on host** | Panel “Git deployment” / webhook | Connect repo; configure build command in panel |
| **D. Build locally, upload only artifacts** | Weak Node on server or no `npm` on host | `build:app` locally; SFTP `dist/app`; API only on server if Node exists |

- [ ] Chosen method: **A / B / C / D** — reason: `________________`

**Blocker:** If the host has **no Node.js**, you cannot run `npm run server` there. Options: (1) upgrade plan / enable Node in panel, (2) second small VPS only for API ([deploy-online.md](deploy-online.md)), (3) defer online campaign until Node is available.

---

## 2. Day 1 — hosting inventory (SSH)

Run when SSH works. Fill the [hosting profile](#hosting-profile-fill-in-once).

### 2.1 Connect and basics

- [ ] `ssh -p <port> <user>@<host>` — login works
- [ ] `uname -a` / OS noted: `________________`
- [ ] `node -v` → `________________` (need **18+** recommended)
- [ ] `npm -v` → `________________`
- [ ] `which node` → `________________`
- [ ] Disk space OK: `df -h` in home directory

### 2.2 Paths and permissions

- [ ] Confirm **web root** exists and is writable for static files: `________________`
- [ ] Create **app directory**: `mkdir -p ~/alter-eger` (or path from profile)
- [ ] Create **data directory** for SQLite (outside web root): `mkdir -p ~/data/alter-eger && chmod 700 ~/data/alter-eger`
- [ ] Test write: `touch ~/data/alter-eger/.write-test && rm ~/data/alter-eger/.write-test`

### 2.3 HTTPS and `/api` routing

- [ ] Site loads on `https://<domain>` (certificate active)
- [ ] Find how to add **reverse proxy** `/api` → `http://127.0.0.1:3000` (Apache `ProxyPass`, nginx `location`, or panel UI)
- [ ] If proxy not possible: note workaround (subdomain `api.<domain>` + `VITE_API_BASE_URL`) — `________________`

### 2.4 Git on server (if method A or C)

- [ ] `git --version` on server
- [ ] Clone: `git clone <your-repo-url> ~/alter-eger` OR link panel Git to `~/alter-eger`
- [ ] Deploy key or HTTPS token configured (never commit tokens)
- [ ] `git pull` works from `~/alter-eger`

### 2.5 SFTP (sanity check)

- [ ] Connect with FileZilla / WinSCP using profile host, user, port
- [ ] Upload a test file to web root; open in browser; delete test file

---

## 3. One-time server setup

After inventory. Commands assume app in `~/alter-eger`; adjust paths.

### 3.1 Application files on server

- [ ] Code on server (one of):
  - [ ] `git clone …` / `git pull` in `~/alter-eger`
  - [ ] SFTP sync of project (exclude `node_modules`; run `npm install` on server)
- [ ] `cd ~/alter-eger && npm install --omit=dev` (production deps only)
- [ ] `npm run build:app` on server **or** upload prebuilt `dist/app/` from PC

### 3.2 Environment variables

Create `~/alter-eger/.env` or use panel “Environment” (not in Git):

| Variable | Example / your value |
|----------|----------------------|
| `PORT` | `3000` |
| `DATABASE_PATH` | `/home/____/data/alter-eger/campaigns.db` |
| `CORS_ORIGIN` | `https://________________` |
| `PUBLIC_APP_URL` | `https://________________` |
| `TOKEN_PEPPER` | (from hosting profile) |

- [ ] All five variables set on server
- [ ] `.env` file mode `600` if stored in home directory

### 3.3 Static frontend

The build (`npm run build:app`) produces a **self-contained** `dist/app/` that already
includes `metadata/` and `data/` (the `post-build-app` step copies them in). The app
loads these at runtime via relative paths (e.g. `../../metadata/editor.json`,
`../../data/alter_eger.db`). They are served by the **static host**, not the API.

- [ ] Upload the **entire** `dist/app/` tree to **web root** **or** point vhost `root` to `~/alter-eger/dist/app`
- [ ] Do **not** upload only `index.html` + `assets/` — include the `metadata/` and `data/` subfolders too (don't let an SFTP filter or size limit skip the large `data/alter_eger.db`)
- [ ] Confirm `index.html` and assets load: `https://<domain>/`
- [ ] GM path works: `https://<domain>/gm/` (built path; `index.html` is stripped from the URL)
- [ ] **Supporting files reachable** (open each URL directly):
  - [ ] `https://<domain>/metadata/editor.json` → returns **JSON** (not the 404 HTML page)
  - [ ] `https://<domain>/data/alter_eger.db` → downloads a **SQLite file** (or 404 only if you intentionally ship stub data)

> If `metadata/editor.json` is missing or returns HTML, the character generator
> aborts during startup and the **"Create new character" button does nothing**
> (no visible error in older builds). This is a deploy/file issue, not auth — the
> generator gate requires no token.

### 3.4 API process

- [ ] Start test: `cd ~/alter-eger && npm run server` — listen on 3000
- [ ] From server: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health` (or campaigns route per [tests.md](tests.md))
- [ ] Configure **PM2** / **systemd** / panel Node app so API survives logout and reboot
- [ ] Reverse proxy: `https://<domain>/api/*` → `http://127.0.0.1:3000`

Example systemd paths: [deploy-online.md](deploy-online.md#systemd-beispiel).

### 3.5 Production `.env` for frontend (only if API on another origin)

If API is **not** same origin:

- [ ] Create `.env.production` with `VITE_API_BASE_URL=https://api.________________`
- [ ] Re-run `npm run build:app` and redeploy static files

---

## 4. First production deploy

Repeat for each release (shortened after first time).

### 4.1 Pre-deploy (local)

- [ ] `git pull`
- [ ] `npm install`
- [ ] `npm run test:api` && `npm test`
- [ ] `npm run build:app`
- [ ] Changelog / note for table: `________________` (optional)

### 4.2 Deploy (server)

**Git path:**

- [ ] SSH → `cd ~/alter-eger && git pull`
- [ ] `npm install --omit=dev`
- [ ] `npm run build:app` (or skip if you uploaded `dist/` from PC)
- [ ] Restart API service (PM2/systemd/panel)
- [ ] Sync static files to web root if needed

**SFTP-only path:**

- [ ] Upload `dist/app/` → web root (merge/overwrite)
- [ ] Upload changed `server/` files if any
- [ ] SSH → `npm install --omit=dev` if `package.json` changed
- [ ] Restart API

### 4.3 Post-deploy checks

- [ ] `https://<domain>/` loads, no mixed-content errors (HTTPS only)
- [ ] `https://<domain>/metadata/editor.json` returns JSON, and `https://<domain>/data/alter_eger.db` is reachable (see [§3.3](#33-static-frontend))
- [ ] Open the generator in a **private/incognito window** (no cache, no prior session): the **"Create new character"** button opens the name step
- [ ] Browser devtools → Network: `POST /api/...` returns **not** 502/404
- [ ] `npm run test:api` against production URL (set `API_BASE` if script supports it) **or** manual steps in [tests.md](tests.md)
- [ ] Create test campaign as GM → copy invite link → open in private window → Save test character → GM party list updates
- [ ] **Compendium live:** character editor status is **not** “sample data”; race picker shows full catalog (not 3 stub races only) — [todos.md § Deployment — compendium](todos.md#deployment--compendium-must-be-live)

---

## 5. Go-live — your table

One session before the real session.

### 5.1 GM

- [ ] Open `https://<domain>/src/gm/` (bookmark)
- [ ] **Create campaign** — name: `________________`
- [ ] Copy **invite link** to WhatsApp / Signal group
- [ ] Confirm party list shows “waiting” or empty state

### 5.2 One test player

- [ ] Open invite link on phone/laptop
- [ ] Complete generator → **Save**
- [ ] GM sees character within ~10 s (polling)

### 5.3 Whole group (optional dry run)

- [ ] Each player: link → character → Save
- [ ] GM: all names visible, no duplicates/errors
- [ ] Backup plan agreed: JSON export if API down — [project.md](project.md)

### 5.4 Security checklist

- [ ] Site only shared with your group (no public advertising)
- [ ] `TOKEN_PEPPER` not in chat logs or Git
- [ ] HTTPS only; HTTP redirects to HTTPS

---

## 6. Ongoing — updates & backups

### 6.1 Each app update

- [ ] Follow [§4 First production deploy](#4-first-production-deploy) (short path)
- [ ] Announce short downtime in group chat if restarting API

### 6.2 Backups (weekly or before session)

- [ ] Download `campaigns.db` from `DATABASE_PATH` via SFTP/SCP
- [ ] Store dated copy: `campaigns-YYYY-MM-DD.db`
- [ ] Optional: GM JSON export from UI as second backup

### 6.3 Monitoring (lightweight)

- [ ] After deploy: open GM page once
- [ ] If 502 on `/api`: SSH → check API process logs
- [ ] Disk space on data volume before long campaign

---

## 7. Troubleshooting quick list

| Symptom | Check |
|---------|--------|
| "Create new character" button does nothing (works for you, not testers) | `metadata/editor.json` / `data/alter_eger.db` reachable at web root? Open them directly. Usually `metadata/`+`data/` were not uploaded with `dist/app/`. Not auth — gate needs no token. Test in incognito. |
| 502 on `/api` | API running? `PORT`? Proxy config? |
| CORS error in browser | `CORS_ORIGIN` exact match `https://domain` (no trailing slash mismatch) |
| Invite link wrong host | `PUBLIC_APP_URL` matches public URL |
| Save works locally, not prod | `VITE_API_BASE_URL` if split domains; rebuild static |
| `better-sqlite3` install fails | Node version; build tools; contact hoster |
| GM party never updates | API reachable; player Save returned 200; GM polling (see [bugs.md](bugs.md)) |

---

## Related

| Document | Content |
|----------|---------|
| [todos.md](todos.md) | Short host/developer/agent lists |
| [deploy-online.md](deploy-online.md) | VPS/Caddy/nginx detail |
| [tests.md](tests.md) | Manual verification steps |
