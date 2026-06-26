# Deploy Alter Ego on an Ubuntu VPS

> **Default deployment target:** Alter Ego deploys to **`server.masche.at`**
> (Coolify v4 + Docker on Ubuntu LTS). The canonical workflow for that host —
> SSH access, fresh-host bootstrap/hardening order, the Coolify deploy/redeploy
> flow, diagnosing failed deploys, volume paths, and day-2 operations — lives in
> the user-level **`server-masche-deploy`** skill. Use that skill first; this
> guide only adds the Alter-Ego-specific details (volumes, env vars, the
> compendium-DB upload, and the Dockerfile runtime gotcha).

This guide turns a fresh Ubuntu LTS server into a secure host that can run
several projects, then deploys Alter Ego onto it. It favours the Coolify web
panel so most work happens in a browser instead of the terminal.

> **Status:** live. Alter Ego is deployed and healthy at
> `https://alter-ego.apps.masche.at` (Coolify v4.1.2 + Docker on
> `server.masche.at`). For day-to-day operations (redeploy, diagnose, backups)
> jump to [Managing the deployment](#managing-the-deployment-day-2), and prefer
> the `server-masche-deploy` skill for the generic host commands.

## Architecture

Alter Ego runs as one container that does two jobs at the same origin:

- Serves the built frontend (`dist/app`) as static files.
- Runs the Express API under `/api/...`.

Because both share one origin, there is no CORS to configure. Two persistent
volumes hold data that must survive image rebuilds:

- `/data-public` - served at `/data`. Holds the compendium DB
  (`alter_ego.db`, ~77 MB) and samples. Public, read-only in practice.
- `/data-private` - never served. Holds `campaigns.db` (campaigns, homebrew,
  feedback).

The large compendium DB is not in Git and not baked into the image; you upload
it once into the `/data-public` volume.

> **Dockerfile runtime files (gotcha):** the runtime image must include every
> directory the API imports at runtime, not just `server/`. The API pulls shared
> code from `src/` and JSON config from `data/` and `metadata/`, so the runtime
> stage copies `node_modules`, `dist`, `server`, `src`, `metadata`, `data`, and
> `package.json`. If one is missing the image still builds, but the container
> crashes on boot with `ERR_MODULE_NOT_FOUND`, fails its healthcheck, and
> Coolify rolls back (no app container remains). The SQLite DBs are excluded by
> `.dockerignore` and come from the volume instead.

## Files in this repo

| Path | Purpose |
| --- | --- |
| `Dockerfile` | Builds the frontend and runs the API in one container. |
| `docker-compose.yml` | Standalone run without a panel (optional). |
| `ops/env.example` | All environment variables; copy to `ops/server.env`. |
| `ops/vps/bootstrap.sh` | Hardens the server and installs Docker + Coolify. |
| `ops/vps/harden-ssh.sh` | Disables SSH passwords after key login works. |

## Before you start

This server's host is **`server.masche.at`**. Use it wherever the commands
below say `SERVER_IP` (for example `ssh masche@server.masche.at`). Fall back to
the raw IP only while DNS is not resolving yet.

You need:

- Root SSH access to `server.masche.at` (password or key from your provider).
- Your own SSH public key (for example `~/.ssh/id_ed25519.pub`).
- A domain or subdomain you can point at the server (for HTTPS).

> **Steps 1-3 are generic host setup.** They mirror the "First-time host setup"
> section of the `server-masche-deploy` skill, which is the source of truth for
> SSH keys, the bootstrap → verify-key-login → harden-ssh order, and creating
> the Coolify admin. Follow the skill for a fresh host; the steps below are kept
> here for a self-contained read.

## Step 1 - Connect and bootstrap

Copy your public key string, then run the bootstrap as root. Replace the key
and IP with yours.

```bash
ssh root@server.masche.at
# On the server:
git clone https://github.com/YOUR_USER/Alter_Ego.git
cd Alter_Ego
DEPLOY_USER=masche SSH_PUBKEY="ssh-ed25519 AAAA... you@host" bash ops/vps/bootstrap.sh
```

The SSH/sudo user is `masche` (already created and sudo-enabled), so pass
`DEPLOY_USER=masche` to install your key for that user instead of creating a
separate `deploy` user. The bootstrap updates the OS, turns on automatic
security updates, adds swap, enables the `ufw` firewall and `fail2ban`, and
installs Coolify (which installs Docker). It does not touch SSH password
settings yet, so you cannot get locked out at this stage.

> Line endings: if you copy the `ops/vps/*.sh` scripts to the server from a
> Windows checkout (e.g. via `scp`) instead of `git clone`, they may carry CRLF
> endings and bash fails with `$'\r': command not found` /
> `set: pipefail: invalid option name`. The repo's `.gitattributes` forces LF
> for `*.sh`; if you still hit it, run
> `sed -i 's/\r$//' ~/bootstrap.sh ~/harden-ssh.sh` on the server first.

## Step 2 - Confirm key login, then harden SSH

Open a new terminal and confirm key login works:

```bash
ssh masche@server.masche.at
```

Only if that succeeds, lock SSH down to keys only. Keep your working session
open as a safety net.

```bash
sudo bash ops/vps/harden-ssh.sh
```

## Step 3 - Create the Coolify admin account

Open the dashboard in a browser right away. The first visitor becomes the
owner, so do this immediately after install:

```
http://SERVER_IP:8000
```

Create your admin account and sign in.

## Step 4 - Point your domain at the server

During setup a wildcard `*.apps.masche.at` already points at the server, so you
can deploy under a subdomain with no extra DNS work. Alter Ego uses
**`alter-ego.apps.masche.at`** for now. HTTPS is issued automatically by Coolify
once the app is deployed.

The final domain is **`www.braincell.online`** (canonical), with the apex
`braincell.online` also serving the app. See
[Custom domain: braincell.online](#custom-domain-braincellonline) for the
pre-staging and cutover steps.

## Step 5 - Deploy Alter Ego in Coolify

1. In Coolify, create a Project, then add a new Resource of type
   "Public Repository" (or connect GitHub) and paste the repo URL.
2. Set the Build Pack to "Dockerfile". Coolify uses the `Dockerfile` in this
   repo automatically.
3. Set the Domain list. The app is pre-staged with all three hosts (comma
   separated, no spaces):
   `https://alter-ego.apps.masche.at,https://www.braincell.online,https://braincell.online`.
   See [Custom domain: braincell.online](#custom-domain-braincellonline) for the
   DNS cutover. braincell certs issue only once DNS points at the server.
4. Add Persistent Storage (two volumes):
   - Name `alter-ego-public`, mount path `/data-public`
   - Name `alter-ego-private`, mount path `/data-private`
5. Add Environment Variables:
   - `TOKEN_PEPPER` = a long random string (run `openssl rand -hex 32`).
   - `PUBLIC_APP_URL` = `https://alter-ego.apps.masche.at` (your domain, no trailing slash).
   - The rest already have correct defaults in the Dockerfile
     (`PUBLIC_JOIN_PATH=/join/index.html`, DB paths, `STATIC_DIR`,
     `PUBLIC_DATA_DIR`). Override only if you change the layout.
6. Click Deploy.

## Step 6 - Upload the compendium database

The app reports `"compendium":"stub"` until `alter_ego.db` is in the public
volume. Build it locally first if needed (`npm run normalize`), then upload it.

From your PC, upload the file to the server (~76 MB):

```bash
scp data/alter_ego.db masche@server.masche.at:/tmp/alter_ego.db
```

On the server, write it **straight into the volume's host path** so it persists
regardless of the current container name (which changes on every deploy). Find
the host path, copy the file in, then restart the container so the API opens it:

```bash
# Host path of the public volume (app UUID prefix, here wce302...):
sudo docker volume ls | grep alter-ego-public
VOL=/var/lib/docker/volumes/$(sudo docker volume ls -q | grep alter-ego-public)/_data
sudo cp /tmp/alter_ego.db "$VOL/alter_ego.db"
sudo chmod 644 "$VOL/alter_ego.db"

# Restart the app container so it loads SQLite instead of the stub:
sudo docker restart "$(sudo docker ps --format '{{.Names}}' | grep alter)"
rm /tmp/alter_ego.db
```

Alternatively, `sudo docker cp /tmp/alter_ego.db CONTAINER:/data-public/alter_ego.db`
writes through the same volume, but you must look up the timestamped container
name each time. Either way the file survives future redeploys.

Reload the site; `/api/health` should now report `"compendium":"sqlite"`.

> `masche` has passwordless sudo but is not in the `docker` group, so prefix
> Docker commands with `sudo` (non-interactive: `sudo -n docker ...`).

## Step 7 - Verify

- Visit `https://alter-ego.apps.masche.at/api/health` - expect JSON with
  `"compendium":"sqlite"` once the DB is uploaded.
- Open the app, create a campaign, and confirm the invite link uses
  `https://alter-ego.apps.masche.at/join/index.html?...`.

## Custom domain: braincell.online

The production domain is **`www.braincell.online`** (canonical for invite links),
with the apex **`braincell.online`** also serving the app. The app is served
same-origin on every domain it answers, so no CORS change is needed.

**Status:** the Coolify app's domain list is pre-staged with all three hosts:

```
https://alter-ego.apps.masche.at,https://www.braincell.online,https://braincell.online
```

Coolify generates a Traefik router per host and requests a Let's Encrypt
certificate for each. The braincell certs only issue **after** DNS points at
this server (HTTP-01 challenge); until then Traefik keeps retrying harmlessly
and the `apps.masche.at` host keeps working. `PUBLIC_APP_URL` is intentionally
left at `https://alter-ego.apps.masche.at` so existing invite links keep
resolving; it is switched at cutover.

### DNS cutover (when ready to go live on braincell.online)

The server's public IP is `37.120.178.213`. At your DNS provider, point the
domain at the server:

| Record | Name | Value |
| --- | --- | --- |
| `A` | `@` (apex `braincell.online`) | `37.120.178.213` |
| `A` (or `CNAME`) | `www` | `37.120.178.213` (or `braincell.online`) |

Then, once DNS resolves to the server:

1. In Coolify, open the Alter Ego app and confirm both braincell certificates
   are issued (the domain list already includes them).
2. Set the env var `PUBLIC_APP_URL=https://www.braincell.online` and **Deploy**
   so new invite/join links use the canonical domain.
3. (Optional, forced apex -> www redirect) Coolify's redirect setting is
   app-wide, and turning it to "redirect to www" would also rewrite the
   `apps.masche.at` host. To force `braincell.online` -> `www.braincell.online`,
   either remove `alter-ego.apps.masche.at` from the domain list first and set
   the app's redirect to "www", or add a host-scoped Traefik redirect via the
   app's custom labels. Without this, the apex still serves the app (no
   redirect) and links use the www host.

Verify after cutover:

```bash
curl -s https://www.braincell.online/api/health   # expect "compendium":"sqlite"
curl -sI https://braincell.online/                # expect 200 (or 30x if redirect enabled)
```

## Managing the deployment (day-2)

Routine operations after the app is live.

**Shell access.** `ssh masche@server.masche.at`. `masche` has passwordless sudo
but is not in the `docker` group, so run Docker as `sudo -n docker ...`. Note the
**server clock is UTC** (Coolify timestamps read ~2h behind Central European
time).

**Redeploy a new version.** Push to `main`, then open the app in Coolify and
click **Deploy**. Coolify clones `main`, rebuilds the image, starts the new
container, waits for it to become healthy, and only then swaps it in (otherwise
it rolls back to the previous container). There is no auto-deploy unless you add
a Git webhook.

**Check status.**

```bash
sudo -n docker ps --format '{{.Names}}\t{{.Status}}' | grep alter   # expect (healthy)
curl -s https://alter-ego.apps.masche.at/api/health                 # expect "compendium":"sqlite"
```

**Diagnose a failed deploy.** Coolify keeps deployment logs in its Postgres, not
on disk. List recent deployments and read the log JSON:

```bash
sudo -n docker exec coolify-db psql -U coolify -c \
  "select id, status, created_at from application_deployment_queues order by created_at desc limit 5;"
```

A `finished` status with a missing container usually means the build succeeded
but the container was unhealthy and got rolled back — almost always a missing
runtime file (see the Dockerfile gotcha above) or a bad env var.

**Reproduce a crash on the server.** Run the built image by hand to see the
app's stdout:

```bash
sudo -n docker images | grep alter            # find the commit-tagged image
sudo -n docker run --rm -e TOKEN_PEPPER=test -p 127.0.0.1:3999:3000 IMAGE_TAG
# in another shell: curl -s http://127.0.0.1:3999/api/health
```

## Backups

Back up the private database regularly (campaigns, homebrew, feedback):

```bash
sudo -n docker cp "$(sudo -n docker ps --format '{{.Names}}' | grep alter)":/data-private/campaigns.db ~/backups/campaigns-$(date +%F).db
```

Coolify can also run scheduled backups. The public compendium DB can always be
regenerated from source, so backing up `campaigns.db` is the priority.

## Hosting more projects

Each additional project is a new Coolify Resource with its own domain,
Dockerfile, env vars, and volumes. The server hardening from Step 1 applies to
all of them; you do not repeat it. Coolify's reverse proxy routes each domain to
the right container and issues HTTPS automatically.

## Alternative - plain Docker, no panel

If you skip Coolify (run bootstrap with `INSTALL_COOLIFY=0`), you can run the
app directly. You still need a reverse proxy (such as Caddy) for HTTPS.

```bash
cp ops/env.example ops/server.env   # then edit TOKEN_PEPPER and PUBLIC_APP_URL
docker compose up -d --build
docker cp data/alter_ego.db alter-ego:/data-public/alter_ego.db
```

The container listens on `127.0.0.1:3000`; point your reverse proxy at it.
