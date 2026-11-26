// Rewrites the relative imports of a working tree's JavaScript files after a teammate's change
// moved code, so that the tree still runs: every import of a renamed file, or of a function moved
// to another file, points at its new place. It works on whatever the first session left in the
// tree, which the runner cannot know in advance, so it rewrites import statements rather than
// copying files over the tree.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

/** Code that moved: a whole file when `names` is null, else only those exported names. */
export type ImportRedirect = {
  /** The file the imports pointed at, relative to the root of the tree. */
  readonly from: string;
  /** The file they point at now, relative to the root of the tree. */
  readonly to: string;
  readonly names: readonly string[] | null;
};

const SOURCE_FILE = /\.(c|m)?js$/;
/** `import { a, b } from './x.js'` or `export { a } from './x.js'`, over one line or several. */
const NAMED_IMPORT = /\b(import|export)\s*\{([^}]*)\}\s*from\s*(['"])(\.{1,2}\/[^'"]+)\3;?/g;
/** Every relative specifier: after `from`, in `import('...')`, or in `import '...'`. */
const RELATIVE_SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g;

/** Makes every JavaScript file of the tree import the moved code from its new place. */
export function redirectImports(directory: string, redirect: ImportRedirect): void {
  for (const file of listSourceFiles(directory)) {
    const path = join(directory, file);
    const text = readFileSync(path, 'utf8');
    const source = { file, text };
    const rewritten =
      redirect.names === null
        ? rewriteSpecifiers(source, redirect)
        : splitNamedImports(source, { from: redirect.from, to: redirect.to, names: redirect.names });
    if (rewritten !== text) writeFileSync(path, rewritten);
  }
}

/** Returns the relative specifier by which `file` imports `target`, both relative to the root. */
export function specifierFor(file: string, target: string): string {
  const relativePath = posix.relative(posix.dirname(file), target);
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

/** A file of the tree, by its path relative to the root, and its text. */
type SourceText = { readonly file: string; readonly text: string };

function rewriteSpecifiers({ file, text }: SourceText, redirect: ImportRedirect): string {
  return text.replace(RELATIVE_SPECIFIER, (statement, prefix: string, quote: string, specifier: string) =>
    resolveSpecifier(file, specifier) === redirect.from
      ? `${prefix}${quote}${specifierFor(file, redirect.to)}${quote}`
      : statement,
  );
}

function splitNamedImports(
  { file, text }: SourceText,
  redirect: ImportRedirect & { readonly names: readonly string[] },
): string {
  const { names } = redirect;
  return text.replace(
    NAMED_IMPORT,
    (statement, keyword: string, list: string, quote: string, specifier: string) => {
      if (resolveSpecifier(file, specifier) !== redirect.from) return statement;
      const entries = list
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      const moved = entries.filter((entry) => names.includes(importedName(entry)));
      if (moved.length === 0) return statement;
      const kept = entries.filter((entry) => !moved.includes(entry));
      const statements: string[] = [];
      if (kept.length > 0)
        statements.push(`${keyword} { ${kept.join(', ')} } from ${quote}${specifier}${quote};`);
      // The file the code moved to defines it now, so it no longer imports it.
      if (file !== redirect.to) {
        const target = specifierFor(file, redirect.to);
        statements.push(`${keyword} { ${moved.join(', ')} } from ${quote}${target}${quote};`);
      }
      return statements.join('\n');
    },
  );
}

/** The exported name an import entry such as `a`, `a as b` or `type a` asks for. */
function importedName(entry: string): string {
  const words = entry.split(/\s+/);
  return (words[0] === 'type' ? words[1] : words[0]) ?? '';
}

function resolveSpecifier(file: string, specifier: string): string {
  return posix.normalize(posix.join(posix.dirname(file), specifier));
}

/** The JavaScript files of the tree, relative to its root, outside `.git` and `node_modules`. */
function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name))
    .map((entry) => posix.relative(directory, join(entry.parentPath, entry.name)))
    .filter((file) => !file.split('/').some((part) => part === '.git' || part === 'node_modules'));
}
