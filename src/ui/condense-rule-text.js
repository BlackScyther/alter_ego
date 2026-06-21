/**
 * Condense compendium rule HTML down to the text needed to *use* an ability.
 *
 * Powers, feats, and rituals from the compendium carry flavor text and
 * "Published in ..." footers that are noise on a play aid. This strips that
 * decoration and keeps the mechanical core: the power name header, the
 * `powerstat` lines (action, keywords, Attack, Hit, Effect, Trigger, ...),
 * the feat benefit, and the ritual stat block.
 *
 * The source HTML originates from the trusted compendium (same data the
 * standalone entry viewer assigns directly to innerHTML), so the returned
 * string is meant to be inserted as HTML by the caller.
 */

/** Classes whose elements are pure flavor / publishing decoration. */
const FLAVOR_CLASSES = ['flavor', 'flavortext', 'flavortextshort', 'publishedIn', 'published'];

/** Heading texts that introduce race/flavor prose blocks (defensive). */
const FLAVOR_HEADINGS = ['physical qualities', 'playing a', 'roleplaying'];

/**
 * @param {{ category_slug?: string, listing_fields?: Record<string, string>, body_html?: string } | null | undefined} entry
 * @returns {string} Condensed HTML fragment (may be empty).
 */
export function condenseRuleHtml(entry) {
  const raw = (entry?.body_html ?? '').trim();
  if (!raw) return '';

  let doc;
  try {
    doc = new DOMParser().parseFromString(`<div id="__root">${raw}</div>`, 'text/html');
  } catch {
    return raw;
  }
  const root = doc.getElementById('__root');
  if (!root) return raw;

  for (const cls of FLAVOR_CLASSES) {
    for (const el of root.querySelectorAll(`.${cls}`)) {
      el.remove();
    }
  }

  // The tile renders the entry name in its own header, so drop the power/entry
  // title heading from the body to avoid showing the name twice. The power
  // frequency (At-Will / Encounter / Daily) still appears in the kept
  // `powerstat` keyword line.
  for (const el of root.querySelectorAll('h1[class*="power"], h1.player, h1.monster')) {
    el.remove();
  }

  // Remove flavor headings together with the prose that follows them, up to
  // the next heading. Powers/feats keep their mechanical paragraphs intact.
  for (const heading of Array.from(root.querySelectorAll('h1, h2, h3, h4'))) {
    const text = (heading.textContent ?? '').trim().toLowerCase();
    if (!FLAVOR_HEADINGS.some((h) => text.startsWith(h))) continue;
    let node = heading.nextElementSibling;
    heading.remove();
    while (node && !/^h[1-4]$/i.test(node.tagName)) {
      const next = node.nextElementSibling;
      node.remove();
      node = next;
    }
  }

  const condensed = root.innerHTML.trim();
  // If stripping removed everything meaningful, fall back to the original so a
  // tile is never blank (e.g. entries that store all text in a flavor block).
  return condensed.replace(/<[^>]+>/g, '').trim() ? condensed : raw;
}
