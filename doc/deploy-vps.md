# Deploy Alter Ego on an Ubuntu 24.04 VPS

This guide turns a fresh Ubuntu 24.04 LTS server into a secure host that can run
several projects, then deploys Alter Ego onto it. It favours the Coolify web
panel so most work happens in a browser instead of the terminal.

## Architecture

Alter Ego runs as one container that does two jobs at the same origin:

- Serves the built frontend (`dist/app`) as static files.
- Runs the Express API under `/api/...`.

Because both share one origin, there is no CORS to configure. Two persistent
volumes hold data that must survive image rebuilds:

- `/data-public` - served at `/data`. Holds the compendium DB
  (`alter_eger.db`, ~77 MB) and samples. Public, read-only in practice.
- `/data-private` - never served. Holds `campaigns.db` (campaigns, homebrew,
  feedback).

The large compendium DB is not in Git and not baked into the image; you upload
it once into the `/data-public` volume.

## Files in this repo

| Path | Purpose |
| --- | --- |
| `Dockerfile` | Builds the frontend and runs the API in one container. |
| `docker-compose.yml` | Standalone run without a panel (optional). |
| `ops/env.example` | All environment variables; copy to `ops/server.env`. |
| `ops/vps/bootstrap.sh` | Hardens the server and installs Docker + Coolify. |
| `ops/vps/harden-ssh.sh` | Disables SSH passwords after key login works. |

## Before you start

You need:

- The server IP and root SSH access (password or key from your provider).
- Your own SSH public key (for example `~/.ssh/id_ed25519.pub`).
- A domain or subdomain you can point at the server (for HTTPS).

## Step 1 - Connect and bootstrap

Copy your public key string, then run the bootstrap as root. Replace the key
and IP with yours.

```bash
ssh root@SERVER_IP
# On the server:
git clone https://github.com/YOUR_USER/Alter_Ego.git
cd Alter_Ego
SSH_PUBKEY="ssh-ed25519 AAAA... you@host" bash ops/vps/bootstrap.sh
```

The bootstrap updates the OS, creates a `deploy` sudo user with your key, turns
on automatic security updates, adds swap, enables the `ufw` firewall and
`fail2ban`, and installs Coolify (which installs Docker). It does not touch SSH
password settings yet, so you cannot get locked out at this stage.

## Step 2 - Confirm key login, then harden SSH

Open a new terminal and confirm key login works:

```bash
ssh deploy@SERVER_IP
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

In your DNS provider, create an `A` record for your domain (for example
`app.example.com`) pointing to `SERVER_IP`. HTTPS is issued automatically by
Coolify once DNS resolves.

## Step 5 - Deploy Alter Ego in Coolify

1. In Coolify, create a Project, then add a new Resource of type
   "Public Repository" (or connect GitHub) and paste the repo URL.
2. Set the Build Pack to "Dockerfile". Coolify uses the `Dockerfile` in this
   repo automatically.
3. Set the Domain to your domain (for example `https://app.example.com`).
4. Add Persistent Storage (two volumes):
   - Name `alter-ego-public`, mount path `/data-public`
   - Name `alter-ego-private`, mount path `/data-private`
5. Add Environment Variables:
   - `TOKEN_PEPPER` = a long random string (run `openssl rand -hex 32`).
   - `PUBLIC_APP_URL` = `https://app.example.com` (your domain, no trailing slash).
   - The rest already have correct defaults in the Dockerfile
     (`PUBLIC_JOIN_PATH=/join/index.html`, DB paths, `STATIC_DIR`,
     `PUBLIC_DATA_DIR`). Override only if you change the layout.
6. Click Deploy.

## Step 6 - Upload the compendium database

The app shows compendium data only after `alter_eger.db` is in the public
volume. Build it locally first if needed (`npm run normalize`), then copy it up.

From your PC, upload the file to the server:

```bash
scp data/alter_eger.db deploy@SERVER_IP:/home/deploy/alter_eger.db
```

On the server, copy it into the running container's public volume. Find the
container name with `docker ps` (it contains the app name), then:

```bash
docker cp /home/deploy/alter_eger.db CONTAINER_NAME:/data-public/alter_eger.db
```

Reload the site; the compendium should now load. The file persists in the
volume across future redeploys.

## Step 7 - Verify

- Visit `https://app.example.com/api/health` - expect JSON with
  `"compendium":"sqlite"` once the DB is uploaded.
- Open the app, create a campaign, and confirm the invite link uses
  `https://app.example.com/join/index.html?...`.

## Backups

Back up the private database regularly (campaigns, homebrew, feedback):

```bash
docker cp CONTAINER_NAME:/data-private/campaigns.db ~/backups/campaigns-$(date +%F).db
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
docker cp data/alter_eger.db alter-ego:/data-public/alter_eger.db
```

The container listens on `127.0.0.1:3000`; point your reverse proxy at it.
