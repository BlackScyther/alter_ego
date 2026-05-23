# UI and frontend rules

This folder defines how the **interactive** surfaces of the project should look and behave. The printable character sheet (`src/sheet/`) keeps its own print CSS; everything else follows these rules.

| File | Scope |
|------|--------|
| [ui.md](ui.md) | Tailwind, layout, typography, dynamic choice buttons |
| [character-generator.md](character-generator.md) | Hub entry, load / level-up / new-character flow, wizard steps |
| [playlist.md](playlist.md) | “Top of playlist” party view |

**Canonical metadata** for wizard step definitions remains in [`metadata/editor.json`](../metadata/editor.json). When flows change, update both that file and the matching section here.

**Agents:** Read the relevant rule file before changing `src/index.html`, `src/editor/`, or `src/playlist/`.
