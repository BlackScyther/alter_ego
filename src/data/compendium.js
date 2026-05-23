/**
 * Compendium access layer — consumes data/alter_eger.db when present (post-import).
 * Falls back to bundled samples for editor development.
 */

let _listingCache = null;

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

/** @typedef {{ id: string, category_slug: string, listing_fields: Record<string,string>, body_html?: string, index_text?: string }} CompendiumEntry */

export class CompendiumProvider {
  constructor(options = {}) {
    this.dbPath = options.dbPath ?? '../../data/alter_eger.db';
    this.useStub = options.useStub ?? true;
    this._ready = null;
  }

  async ready() {
    if (!this._ready) {
      this._ready = this._init();
    }
    return this._ready;
  }

  async _init() {
    try {
      const head = await fetch(this.dbPath, { method: 'HEAD' });
      if (head.ok) {
        this.mode = 'sqlite-pending';
        console.info('[compendium] DB found; wire sql.js in a later phase.');
        return;
      }
    } catch {
      /* file:// or missing */
    }
    if (this.useStub) {
      this.mode = 'stub';
      this._stub = await fetchJson('../../data/samples/compendium-stub.json');
    } else {
      this.mode = 'unavailable';
    }
  }

  async getCategories() {
    await this.ready();
    if (this.mode === 'stub') {
      return Object.entries(this._stub.categories).map(([slug, meta]) => ({
        slug,
        display_name: meta.displayName,
        entry_count: meta.entries?.length ?? 0
      }));
    }
    const counts = await fetchJson('../../metadata/catalog-counts.json');
    return Object.entries(counts.categories).map(([slug, meta]) => ({
      slug,
      display_name: meta.displayName,
      entry_count: meta.entryCount
    }));
  }

  /**
   * @param {string} categorySlug
   * @param {{ search?: string, limit?: number }} opts
   * @returns {Promise<CompendiumEntry[]>}
   */
  async listEntries(categorySlug, opts = {}) {
    await this.ready();
    const limit = opts.limit ?? 200;
    const q = (opts.search ?? '').trim().toLowerCase();

    if (this.mode === 'stub') {
      let rows = this._stub.categories[categorySlug]?.entries ?? [];
      if (q) {
        rows = rows.filter((e) => {
          const name = (e.listing_fields?.Name ?? e.id).toLowerCase();
          return name.includes(q) || e.id.toLowerCase().includes(q);
        });
      }
      return rows.slice(0, limit).map((e) => ({
        id: e.id,
        category_slug: categorySlug,
        listing_fields: e.listing_fields,
        body_html: e.body_html ?? '',
        index_text: e.index_text ?? ''
      }));
    }

    return [];
  }

  async getEntry(id) {
    await this.ready();
    if (this.mode === 'stub') {
      for (const [slug, cat] of Object.entries(this._stub.categories)) {
        const hit = cat.entries?.find((e) => e.id === id);
        if (hit) {
          return {
            id: hit.id,
            category_slug: slug,
            listing_fields: hit.listing_fields,
            body_html: hit.body_html ?? '',
            index_text: hit.index_text ?? ''
          };
        }
      }
    }
    return null;
  }

  getStatus() {
    return { mode: this.mode, dbPath: this.dbPath };
  }
}

export const compendium = new CompendiumProvider();
