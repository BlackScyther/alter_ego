# Compendium data

After running the JSONP importer (see `metadata/import.json` and `tools/importer/`):

```
data/alter_ego.db
```

The character editor reads this SQLite file via `src/data/compendium.js` (sql.js integration planned in a later phase).

Until import completes, the editor uses `data/samples/compendium-stub.json` for races, classes, and a few feats.
