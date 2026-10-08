# Alter Ego — Compendium Normalization: Warning Report for Rules Experts

Date: 2026-07-03  
Database: Full iws.mx compendium (~25,500 entries)  
Result: Normalization completed successfully. 2,999 warnings = entries where structured data could not be extracted reliably.

Important: These are data-quality flags, not program crashes. The app still runs; it falls back to simpler rules where data is missing.


## What normalization means (short)

The compendium stores each entry as display text (HTML) plus a few listing fields (name, level, tier, and so on). Normalization reads that text once, extracts mechanics (HP, prerequisites, defenses, and so on), and stores them in structured tables so the character builder and GM tools do not re-parse HTML every time.

A warning means: we could not extract this piece reliably from the source text.


## Overall scorecard

Races (55 entries) — 0 warnings — solid  
Powers (9,415) — 0 warnings — solid  
Equipment (3,735) — 0 warnings — solid  
Backgrounds (808) — 0 warnings — solid  
Rituals, paths, themes, traps, and similar (~2,500) — 0 warnings — solid (listing only)  
Monsters (5,326) — 2,328 warnings — largest gap  
Feats (3,272) — 406 warnings — second-largest gap  
Classes (77) — 5 warnings — hybrid parent links only (HP parsing fixed 2026-07-03)  
Source books (222) — 199 warnings — manual metadata, not rules  
Glossary (467) — 17 warnings — duplicate names  

About 88% of all warnings are monsters (78%) plus feats (14%).


## All warnings at a glance

monster/no-stat-line — 2,326  
feat/unparsed-prerequisite — 406  
source_books/missing-date — 199  
class/hybrid-no-parent — 5  
monster/ability-table-missing — 1  
monster/partial-stats — 1  

Total: 2,955 (was 2,999; class HP regex fix removed 44 false positives)


---

## Warning 1 — Monster stat blocks missing (2,326)

Category: monster/no-stat-line  
Count: 2,326

Where the problem lies

Monster listing fields give: Name, Level, Role, Size, Type — but not HP, AC, or defenses. Those live in the body text, usually in a line like:

HP 75; Bloodied 37; AC 19, Fortitude 17, Reflex 16, Will 14

The extractor looks for paragraphs matching that pattern (HP plus a number, AC plus a number, and so on).

What goes wrong

Roughly 44% of monsters do not have a paragraph the extractor recognizes. Typical cases:

- Minions and very simple creatures (examples: Shuffling Zombie, Baazrag Whelp)
- NPCs with narrative blocks instead of full stat blocks (example: Brandel)
- Non-standard layout — stats split across lines, different labels, or only partial blocks
- Creatures that are not full combatants (hazards, summaries, variants)

What the app does today

- About 3,000 monsters (56%) get real HP, AC, defenses, and initiative from the compendium.
- The rest: GM spawn uses level-based estimates (for example HP about level times 8 plus 10, AC about 10 plus half level). Usable for play, but not book-accurate.

How experts can help

1. Classify monster types — Which missing entries are minions, solos, NPCs, templates, or not really a stat block? Different types may need different handling.
2. Spot common text patterns — For example: minions always say X, Dark Sun creatures use format Y. Even 5 to 10 annotated examples per pattern guide parser priorities.
3. Say what GM spawn must have — Is HP and AC enough, or do we need bloodied, initiative, senses for your table?
4. Curated overrides — For frequently used monsters, a small manual stat table (name to HP, AC, and so on) may be faster than parsing all 2,300 edge cases.

UI versus parsing

Better parsing — best when the same wording appears on hundreds of entries.  
GM override in UI — best for one-off NPCs: spawn with compendium stats or custom stats.  
Manual curated list — best for your group's top 50 encounter monsters.  
Accept fallback — best for minions and fodder where approximate HP is fine.


---

## Warning 2 — Feat prerequisites not structured (406)

Category: feat/unparsed-prerequisite  
Count: 406

Where the problem lies

The feat listing field Prerequisite is a single free-text line, for example:

- 11th level, Fighter — parses well
- Channel Divinity, must worship Angharradh — does not parse
- Vistani Heritage — does not parse
- Dune trader theme, quick formation power — does not parse

The structured extractor recognizes: level, race, class, role, power source, ability minimums, trained in [skill]. Everything else is flagged as unparsed.

What goes wrong

About 93% of feats (3,035) have at least some structured prerequisites. The 406 failures cluster around:

- Channel Divinity feats (often plus deity or domain)
- Heritage or regional background feats (Vistani, Forgeborn, Akanul, and similar)
- Theme plus specific power combinations
- Named feats or features as prerequisites (not generic class or race)

What the app does today

- Unparsed feats still appear in the feat picker.
- Filtering uses text heuristics (keyword matching), not strict rules.
- Risk: a feat may show as eligible when it should not, or the reverse, for complex prerequisites.

How experts can help

1. Prerequisite taxonomy — List the kinds of prerequisites in 4e (not code): level, class, race, feat, theme, background, deity, domain, power, paragon path, hybrid, and so on.
2. Priority list — Which unparsed patterns appear most often in your games? Channel Divinity? Themes? Regional backgrounds?
3. Worked examples — For 10 to 20 problematic feats: this prerequisite really means …
4. Strict versus loose filtering — Should the builder hide ineligible feats, or show with a warning? Experts define the UX rule; developers implement it.

UI versus parsing

Extend parser — best when the same pattern repeats (for example all Channel Divinity plus deity X).  
Link to compendium entries — best when the prerequisite is another entry (must have feat Y).  
Show prerequisite as text plus manual confirm — best for rare feats; player or GM reads and confirms.  
Soft filter — show all feats in tier; mark prerequisite not verified.


---

## Warning 3 — Class starting HP missing — RESOLVED (2026-07-03)

Was: 44 classes flagged `class/missing-hp`.  
Cause: iws.mx HTML often puts the colon outside the bold tag (`<b>Hit Points at 1st Level</b>: 15+…`). After tag stripping that became `Level : 15`, which the old regex did not match.  
Fix: parser in `class-parse.js` now allows whitespace around colons. Re-normalize: 0 class/missing-hp warnings; Barbarian and peers parse 15/6/8 correctly.

No expert spreadsheet needed for standard PHB/PHB2 classes unless new import layouts appear.


---

## Warning 4 — Hybrid class parent not found (5)

Category: class/hybrid-no-parent  
Count: 5

Where the problem lies

Player's Handbook 3 Hybrid entries are named for example Hybrid Cleric. The system tries to link them to the base class entry named exactly Cleric.

These five failed:

class352 — Hybrid Cleric  
class353 — Hybrid Fighter  
class356 — Hybrid Rogue  
class359 — Hybrid Warlord  
class360 — Hybrid Wizard  

Likely cause: the base class in the database is not stored as plain Cleric but as something like Cleric (Warpriest) or another variant — a name mismatch, not missing rules.

What the app does today

Hybrid merge (combined HP, skills, proficiencies per PH3 pages 134–135) cannot attach to the parent class for these five. Hybrid characters involving them may fall back to single-class behavior.

How experts can help

For each hybrid: which exact base class entry should it use? Use the name as it appears in your compendium browse.

UI versus parsing

Mapping table (Hybrid Cleric to class ID of Cleric) — one-time fix, 5 rows.  
Smarter name matching — many hybrids with naming variants.  
Hybrid picker in UI — player picks parent A plus parent B explicitly.


---

## Warning 5 — Source book release dates (199)

Category: source_books/missing-date  
Count: 199

Where the problem lies

Not a rules problem. The GM tool can filter content by publication date (only books released before date X). 199 source books have no date in metadata.

How experts can help

Optional: approximate release dates or era buckets (PHB era, Essentials, late 4e) for books you care about.

UI versus parsing

GM fills dates in settings — already supported.  
Ignore — if you do not use date filtering.


---

## Warning 6 — Glossary duplicate terms (17)

Category: glossary/duplicate-term  
Count: 17

Where the problem lies

Multiple glossary entries share the same display name. Cross-links from powers and feats to glossary terms become ambiguous.

How experts can help

For duplicates: which entry is canonical? Or should they merge conceptually (different senses of the same word)?

UI versus parsing

Show disambiguation (which Aura did you mean?) or pick a canonical entry per name.


---

## Warning 7 — Monster edge cases (2)

monster/partial-stats — 1 — HP or AC found, not both  
monster/ability-table-missing — 1 — HP and AC found, ability scores table not found  

Too few for a separate workstream; fix when touching monster parsing anyway.


---

## Suggested workshop agenda (90 minutes with experts)

1. Monsters (30 min) — Review 10 entries with warnings plus 10 that parsed OK. Agree: minion versus full stat block versus NPC; must-have stats for GM spawn.

2. Feat prerequisites (30 min) — List prerequisite types in 4e; rank top 5 unparsed patterns; decide hide versus warn versus show-all.

3. Class HP (20 min) — Fill HP and surge table for classes you play.

4. Hybrids (10 min) — Confirm parent class names for the 5 PH3 hybrids.


---

## What we do not need from experts

- Code, SQL, or file formats
- Reading 70 MB of HTML
- Fixing all 2,999 warnings before playtesting

We need patterns, priorities, and reference tables so development and UI choices match how you actually run 4e.


---

## One-line takeaway — if experts contribute one thing

Class HP table — done via parser fix (was 44 false positives)  
Monster type taxonomy plus 20 examples per pattern — GM spawn accuracy  
Feat prerequisite type list plus top 50 unparsed feats explained — feat picker trust  
5 hybrid parent mappings — PH3 hybrid characters


---

## Appendix — Sample unparsed feat prerequisites

Feat Advantageous Eye — Vistani Heritage  
Feat Advantageous Formation — Dune trader theme, quick formation power  
Feat Airspur Windrider — Akanul regional background  
Feat Amoth's Grace — Channel Divinity  
Feat Ancestral Guidance — Channel Divinity, must worship the Spirits of the Past  
Feat Ancestral Wrath — Forgeborn Heritage  
Feat Angharradh's Favor — Channel Divinity, must worship Angharradh  
Feat Anthem of Civilization — Channel Divinity, must worship a deity of the civilization domain


## Appendix — All five hybrid-no-parent entries

class352 — Hybrid class Hybrid Cleric could not be matched to a parent class entry.  
class353 — Hybrid class Hybrid Fighter could not be matched to a parent class entry.  
class356 — Hybrid class Hybrid Rogue could not be matched to a parent class entry.  
class359 — Hybrid class Hybrid Warlord could not be matched to a parent class entry.  
class360 — Hybrid class Hybrid Wizard could not be matched to a parent class entry.


## Appendix — Sample class/missing-hp entries

class529 — Class Ardent missing HP base and per-level.  
class125 — Class Artificer missing HP base and per-level.  
class466 — Class Assassin missing HP base and per-level.  
class811 — Class Assassin (Executioner) missing HP base and per-level.  
class129 — Class Avenger missing HP base and per-level.  
class148 — Class Barbarian missing HP base and per-level.  
class906 — Class Barbarian (Berserker) missing HP base and per-level.  
class104 — Class Bard missing HP base and per-level.


## Appendix — Sample monster/no-stat-line entries

monster5452 — Monster Shuffling Zombie has no parseable HP/AC stat line.  
monster5320 — Monster Baazrag Gnawer has no parseable HP/AC stat line.  
monster5304 — Monster Baazrag Whelp has no parseable HP/AC stat line.  
monster4613 — Monster Bloodmonger Wolf has no parseable HP/AC stat line.  
monster6559 — Monster Brandel has no parseable HP/AC stat line.  
monster6552 — Monster Brownie has no parseable HP/AC stat line.  
monster6030 — Monster Bullywug Leaper has no parseable HP/AC stat line.  
monster2821 — Monster Bullywug Mucker has no parseable HP/AC stat line.
