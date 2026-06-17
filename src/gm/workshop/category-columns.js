/** Category listing columns per PROJECT.md §5.2 (ID omitted — auto-generated). */

/** @type {Record<string, { slug: string, displayName: string, columns: string[] }>} */
export const WORKSHOP_CATEGORIES = {
  power: { slug: 'power', displayName: 'Power', columns: ['Name', 'ClassName', 'Level', 'Type', 'Action', 'Keywords', 'SourceBook'] },
  monster: { slug: 'monster', displayName: 'Monster', columns: ['Name', 'Level', 'CombatRole', 'GroupRole', 'Size', 'CreatureType', 'SourceBook'] },
  feat: { slug: 'feat', displayName: 'Feat', columns: ['Name', 'Tier', 'Prerequisite', 'SourceBook'] },
  item: { slug: 'item', displayName: 'Item', columns: ['Name', 'Category', 'Type', 'Level', 'Cost', 'Rarity', 'SourceBook'] },
  background: { slug: 'background', displayName: 'Background', columns: ['Name', 'Type', 'Campaign', 'Benefit', 'SourceBook'] },
  trap: { slug: 'trap', displayName: 'Trap / Terrain', columns: ['Name', 'Type', 'GroupRole', 'Level', 'SourceBook'] },
  implement: { slug: 'implement', displayName: 'Implement', columns: ['Name', 'Type', 'Level', 'Cost', 'Rarity', 'SourceBook'] },
  weapon: { slug: 'weapon', displayName: 'Weapon', columns: ['Name', 'Type', 'Level', 'Cost', 'Rarity', 'SourceBook'] },
  paragonpath: { slug: 'paragonpath', displayName: 'Paragon Path', columns: ['Name', 'Prerequisite', 'SourceBook'] },
  armor: { slug: 'armor', displayName: 'Armor', columns: ['Name', 'Type', 'Level', 'Cost', 'Rarity', 'SourceBook'] },
  glossary: { slug: 'glossary', displayName: 'Glossary', columns: ['Name', 'Category', 'Type', 'SourceBook'] },
  ritual: { slug: 'ritual', displayName: 'Ritual', columns: ['Name', 'Level', 'ComponentCost', 'Price', 'KeySkillDescription', 'SourceBook'] },
  companion: { slug: 'companion', displayName: 'Companion', columns: ['Name', 'Type', 'Size', 'CreatureType', 'SourceBook'] },
  deity: { slug: 'deity', displayName: 'Deity', columns: ['Name', 'Domains', 'Alignment', 'SourceBook'] },
  theme: { slug: 'theme', displayName: 'Theme', columns: ['Name', 'Prerequisite', 'SourceBook'] },
  epicdestiny: { slug: 'epicdestiny', displayName: 'Epic Destiny', columns: ['Name', 'Prerequisite', 'SourceBook'] },
  class: { slug: 'class', displayName: 'Class', columns: ['Name', 'RoleName', 'PowerSourceText', 'KeyAbilities', 'SourceBook'] },
  disease: { slug: 'disease', displayName: 'Disease', columns: ['Name', 'Level', 'SourceBook'] },
  race: { slug: 'race', displayName: 'Race', columns: ['Name', 'Origin', 'DescriptionAttribute', 'Size', 'SourceBook'] },
  poison: { slug: 'poison', displayName: 'Poison', columns: ['Name', 'Level', 'Cost', 'SourceBook'] }
};

/** @returns {{ slug: string, displayName: string, columns: string[] }[]} */
export function listWorkshopCategories() {
  return Object.values(WORKSHOP_CATEGORIES);
}

/**
 * @param {string} categorySlug
 */
export function getEditableColumns(categorySlug) {
  const meta = WORKSHOP_CATEGORIES[categorySlug];
  if (!meta) return ['Name', 'SourceBook'];
  return meta.columns.filter((c) => c !== 'ID' && c !== 'SourceBook');
}
