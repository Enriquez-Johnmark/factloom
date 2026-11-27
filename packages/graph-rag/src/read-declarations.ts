// The declarations the code base map of FL-084 records (ADR 0024): what a JavaScript or
// TypeScript file declares at its top level, found by text search with no parser, as the name
// check of FL-071 finds a name. A declaration is a line that starts at the first column; its
// summary is the first sentence of the comment directly above it.

/** A top-level declaration of a source file and what its comment says, or null when it has none. */
export type Declaration = { readonly name: string; readonly summary: string | null };

/** The longest summary kept: the map's facts enter the agent's context. */
const SUMMARY_LENGTH_LIMIT = 200;

const IDENTIFIER = '[A-Za-z_$][\\w$]*';

/** The forms of a top-level declaration, each with the name as its one group. */
const DECLARATION_PATTERNS: readonly RegExp[] = [
  new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s*(${IDENTIFIER})`),
  new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+(${IDENTIFIER})`),
  new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+(${IDENTIFIER})\\s*[=:]`),
  new RegExp(`^(?:export\\s+)?(?:declare\\s+)?(?:type|interface|enum)\\s+(${IDENTIFIER})`),
];

const SOURCE_EXTENSIONS: readonly string[] = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'];

/** Folders whose files are not the repository's own source. */
const EXCLUDED_FOLDERS: readonly string[] = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  'vendor',
  'test',
  'tests',
];

/**
 * Whether the map covers a path: a JavaScript or TypeScript source file that is not a test, a
 * type declaration file, a dependency or build output.
 */
export function isMappedSourcePath(path: string): boolean {
  const segments = path.split('/');
  const fileName = segments.at(-1) ?? '';
  if (segments.slice(0, -1).some((segment) => EXCLUDED_FOLDERS.includes(segment))) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(fileName) || fileName.endsWith('.d.ts')) return false;
  return SOURCE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

/** The name a line declares at the top level, or null when it declares none. */
function readDeclaredName(line: string): string | null {
  for (const pattern of DECLARATION_PATTERNS) {
    const name = pattern.exec(line)?.[1];
    if (name !== undefined) return name;
  }
  return null;
}

/** The text of the comment that ends on the line before `index`, or null when there is none. */
function readCommentAbove(lines: readonly string[], index: number): string | null {
  const above = lines[index - 1]?.trim();
  if (above === undefined) return null;
  if (above.endsWith('*/')) {
    let start = index - 1;
    while (start >= 0 && !(lines[start] ?? '').includes('/*')) start -= 1;
    if (start < 0) return null;
    return lines
      .slice(start, index)
      .map((line) => line.replace(/\/\*\*?|\*\/|^\s*\*\s?/g, '').trim())
      .filter((line) => line !== '' && !line.startsWith('@'))
      .join(' ');
  }
  if (above.startsWith('//')) {
    let start = index - 1;
    while (start > 0 && (lines[start - 1] ?? '').trim().startsWith('//')) start -= 1;
    return lines
      .slice(start, index)
      .map((line) => line.trim().replace(/^\/\/\s?/, ''))
      .join(' ');
  }
  return null;
}

/** The first sentence of a comment, at most the summary limit, or null when it says nothing. */
function summarise(comment: string | null): string | null {
  if (comment === null) return null;
  const text = comment.replace(/\s+/g, ' ').trim();
  if (text === '') return null;
  const sentence = /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
  return sentence.length <= SUMMARY_LENGTH_LIMIT
    ? sentence
    : `${sentence.slice(0, SUMMARY_LENGTH_LIMIT - 1)}…`;
}

/** Reads the top-level declarations of a JavaScript or TypeScript text, in order, each with its summary. */
export function readDeclarations(text: string): readonly Declaration[] {
  const lines = text.split('\n');
  return lines.flatMap((line, index) => {
    const name = readDeclaredName(line);
    return name === null ? [] : [{ name, summary: summarise(readCommentAbove(lines, index)) }];
  });
}
