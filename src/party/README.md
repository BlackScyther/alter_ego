# Party folder (GM)

Drop player **export** files here (`CharacterName_level.json`), then refresh the index:

```bash
npm run party:index
```

Open the **GM console** at http://localhost:5173/gm/ — it loads every file listed in `index.json`.

Workflow:

1. Players build characters in the editor and click **Export JSON** (downloads `Name_level.json`).
2. Copy those files into this folder.
3. Run `npm run party:index`.
4. Open the GM console in the browser.

No server account or cloud sync — files on disk only.
