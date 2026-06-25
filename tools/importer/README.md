# iws.mx JSONP importer (Phase 1)

Specification: `metadata/import.json` and `D:\Projects\web\4e\Alter_Ego\PROJECT.md` §4–5.

Pipeline:

1. Fetch `catalog.js` and validate counts against `metadata/catalog-counts.json`
2. Per category slug: `_listing.js`, `_index.js`, `data0.js` … `data19.js`
3. Parse JSONP callbacks (`od.reader.jsonp_*`)
4. Write SQLite at `data/alter_ego.db`

Importer implementation is handled by a separate agent. The character editor already exposes `CompendiumProvider` for the finished database.
