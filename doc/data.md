# Compendium data — what is and is not in Git

**Last updated:** 2026-07-03

Alter Ego separates **application source code** (in Git) from **D&D 4e compendium data** (local or deploy-only). This keeps the public repository useful without redistributing Wizards of the Coast rule content.

Legal context: [legal.md](legal.md).

## Not in this repository

These must **never** be committed to Git:

| Artifact | Typical path | Notes |
|----------|--------------|-------|
| Full compendium SQLite DB | `data/alter_ego.db` | ~77 MB after import; primary game data |
| Dev DB from stub normalizer | `data/alter_ego.dev.db` | Small DB for local dev/tests |
| SQLite WAL/SHM sidecars | `data/*.db-wal`, `data/*.db-shm` | Created while SQLite is open |
| JSONP import cache | `data/import-cache/`, `data/iws-mx/` | Reserved for future importer downloads |
| Live production mirror | `sync-from-live/` | Pulled from deploy host |
| Build output | `dist/`, `deploy/` | Includes copied DB when built locally |

`.gitignore`, `.dockerignore`, the pre-commit hook, and `npm run check:legal` enforce this. See [Git safeguards](#git-safeguards) below.

## In this repository

| Artifact | Path | Purpose |
|----------|------|---------|
| Import specification | [metadata/import.json](../metadata/import.json) | iws.mx JSONP URLs and SQLite target |
| Catalog validation counts | [metadata/catalog-counts.json](../metadata/catalog-counts.json) | Expected entry counts per category |
| Minimal dev stub | [data/samples/compendium-stub.json](../data/samples/compendium-stub.json) | Few sample races/classes for tests and stub mode |
| Effect overrides | `data/*-effect-overrides.json` | Curated mechanical tweaks keyed by compendium IDs |
| Importer docs | [tools/importer/README.md](../tools/importer/README.md) | Phase 1 pipeline specification |

The stub is **not** a substitute for the full compendium. Production and full character building need `data/alter_ego.db` built or supplied locally.

## Your responsibility

If you clone Alter Ego and want the full rules database, **you** must obtain compendium data through sources you accept responsibility for (for example books you own, or fan mirrors such as [iws.mx/dnd](https://iws.mx/dnd)). The maintainers of this repository do not ship that data in Git.

## Build compendium data locally

### Full compendium (recommended for play)

1. Clone the repository and run `npm install`.
2. Run the Phase 1 importer when implemented (see [tools/importer/README.md](../tools/importer/README.md) and [metadata/import.json](../metadata/import.json)) to produce:

   ```
   data/alter_ego.db
   ```

3. Optionally run `npm run normalize` to add normalized tables (see [compendium-schema.md](compendium-schema.md)).

### Dev / CI without full import

```bash
npm run normalize:stub
```

Creates `data/alter_ego.dev.db` from the minimal stub. The app falls back to [compendium-stub.json](../data/samples/compendium-stub.json) when no DB is present.

### Pull from an existing deploy (maintainers only)

If you have `.env.deploy.local` configured:

```bash
npm run pull:live-data
```

Downloads remote `data/` files into the local gitignored `data/` folder. Do not commit the result.

## Deploy

- **Build:** [scripts/post-build-app.mjs](../scripts/post-build-app.mjs) copies `data/alter_ego.db` into `dist/app/data/` only when the file exists on the build machine.
- **Docker / VPS:** The large DB is **not** baked into the image. Upload to the `/data-public` volume per [deploy-vps.md](deploy-vps.md).
- **SFTP deploy:** `npm run deploy:live` expects a local `data/alter_ego.db` before upload.

Deploy artifacts may contain compendium data on the server; that is separate from the public Git repository.

## Git safeguards

Defense in depth:

1. **`.gitignore`** — ignores `data/**/*.db`, import cache, `sync-from-live/`, etc.
2. **Pre-commit hook** — [`.githooks/pre-commit`](../.githooks/pre-commit) rejects staged `.db` files and `sync-from-live/` content.

   Enable locally:

   ```bash
   git config core.hooksPath .githooks
   ```

   Skip once (emergencies only): `ALTER_EGO_SKIP_DB_CHECK=1 git commit ...`

3. **`npm run check:legal`** — fails if any `*.db` or `sync-from-live/` path is tracked by Git ([scripts/check-no-db-tracked.mjs](../scripts/check-no-db-tracked.mjs)).

## Git history audit

As of 2026-07-03, no `*.db` files are tracked in the current tree (`git ls-files "*.db"` is empty). No commits touching `data/alter_ego.db` were found in repository history.

If you fork an older clone that ever committed a database, scrub history with [git-filter-repo](https://github.com/newren/git-filter-repo) **before** making the repository public.
