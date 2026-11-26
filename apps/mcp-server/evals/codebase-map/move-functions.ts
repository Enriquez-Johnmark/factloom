// Moves exported functions from one file of a working tree to another, as a teammate's commit
// would, whatever else the first session changed in those files.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { redirectImports, specifierFor } from './redirect-imports.ts';

/** Exported functions that move from one file to another, both relative to the tree's root. */
export type FunctionMove = {
  readonly names: readonly string[];
  readonly from: string;
  readonly to: string;
  /** What the file the functions move to starts with when it is new, such as its imports. */
  readonly preamble: string;
};

/**
 * Cuts the functions, with their doc comments, out of `from` and appends them to `to`, then
 * makes every file of the tree, `from` included, import them from `to`.
 */
export function moveFunctions(directory: string, move: FunctionMove): void {
  let source = readFileSync(join(directory, move.from), 'utf8');
  const blocks: string[] = [];
  for (const name of move.names) {
    const cut = cutFunction(source, name);
    blocks.push(cut.block);
    source = cut.rest;
  }
  redirectImports(directory, { from: move.from, to: move.to, names: move.names });
  const stillUsed = move.names.filter((name) => new RegExp(`\\b${name}\\b`).test(source));
  if (stillUsed.length > 0) {
    source = addImport(
      source,
      `import { ${stillUsed.join(', ')} } from '${specifierFor(move.from, move.to)}';`,
    );
  }
  writeFileSync(join(directory, move.from), source);
  const targetPath = join(directory, move.to);
  const start = (existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : move.preamble).trimEnd();
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${start === '' ? '' : `${start}\n\n`}${blocks.join('\n\n')}\n`);
}

type CutFunction = { readonly block: string; readonly rest: string };

/** Cuts `export function name(...) { ... }` and the doc comment just above it out of a file. */
function cutFunction(text: string, name: string): CutFunction {
  const lines = text.split('\n');
  const declaration = new RegExp(`^export (async )?function ${name}\\(`);
  const start = lines.findIndex((line) => declaration.test(line));
  if (start === -1) throw new Error(`The teammate's change found no exported function ${name}.`);
  // The formatter ends a top-level function with a closing brace alone on its line.
  const end = lines.findIndex((line, index) => index > start && line === '}');
  if (end === -1) throw new Error(`The teammate's change found no end of the function ${name}.`);
  let first = start;
  if (lines[start - 1]?.trimEnd().endsWith('*/')) {
    first = start - 1;
    while (first > 0 && !lines[first]?.trimStart().startsWith('/**')) first -= 1;
  }
  const before = lines.slice(0, first);
  const after = lines.slice(end + 1);
  while (before.at(-1) === '' && (after[0] === '' || after.length === 0)) before.pop();
  return {
    block: lines.slice(first, end + 1).join('\n'),
    rest: `${[...before, ...after].join('\n').trimEnd()}\n`,
  };
}

/** Adds an import statement after the last import at the top of a file. */
function addImport(text: string, statement: string): string {
  const imports = [...text.matchAll(/^import\b[^;]*;[ \t]*$/gm)];
  const last = imports.at(-1);
  if (last === undefined) return `${statement}\n${text}`;
  const end = last.index + last[0].length;
  return `${text.slice(0, end)}\n${statement}${text.slice(end)}`;
}
