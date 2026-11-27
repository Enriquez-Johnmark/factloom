import { normaliseEntityName } from '@kronomind/core';

/**
 * A stricter form of an entity name than the one stores match on: Unicode compatibility forms
 * folded (NFKC), then the stores' form, then every punctuation mark, symbol and space removed,
 * except `+` and `#`, which tell C, C++ and C# apart. Two names with the same strict form differ
 * only in spelling details, as "Node.js" and "nodejs" do.
 */
export function normaliseNameStrictly(name: string): string {
  return normaliseEntityName(name.normalize('NFKC')).replace(/[^\P{P}#]|[^\P{S}+]|\s/gu, '');
}
