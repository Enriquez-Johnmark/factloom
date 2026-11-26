import { normaliseText } from '../helpers/text.js';

/** Returns the items whose title or author holds every word of the query, sorted by title. */
export function searchCatalog(items, query) {
  const words = normaliseText(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  return items
    .filter((item) => {
      const searchable = normaliseText(`${item.title} ${item.author}`);
      return words.every((word) => searchable.includes(word));
    })
    .sort((first, second) => sortTitle(first.title).localeCompare(sortTitle(second.title)));
}

/** A title as librarians file it: without a leading The, A or An. */
function sortTitle(title) {
  return title.replace(/^(the|a|an)\s+/i, '');
}
