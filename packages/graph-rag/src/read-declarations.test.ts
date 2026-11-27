import { describe, expect, it } from 'vitest';
import { isMappedSourcePath, readDeclarations } from './read-declarations.ts';

describe('reading the declarations of a source file', () => {
  it('reads top-level functions, classes, constants and types, in order', () => {
    const text = [
      'export function computeRefund(totalCents, percent) {',
      '  return Math.floor((totalCents * percent) / 100);',
      '}',
      'async function fetchLabel() {}',
      'export default class LabelPrinter {}',
      'export const MAX_ATTEMPTS = 2;',
      'let cache = new Map();',
      'export type Shipment = { id: string };',
      'export interface Carrier {}',
      'export enum Status { Open }',
    ].join('\n');

    expect(readDeclarations(text).map((declaration) => declaration.name)).toEqual([
      'computeRefund',
      'fetchLabel',
      'LabelPrinter',
      'MAX_ATTEMPTS',
      'cache',
      'Shipment',
      'Carrier',
      'Status',
    ]);
  });

  it('leaves out what is not at the top level', () => {
    const text = ['function outer() {', '  function inner() {}', '  const local = 1;', '}'].join('\n');

    expect(readDeclarations(text).map((declaration) => declaration.name)).toEqual(['outer']);
  });

  it('takes the first sentence of the doc comment directly above a declaration as its summary', () => {
    const text = [
      '/**',
      ' * Computes the refund of a partial return. Rounds down to the cent.',
      ' * @param totalCents the amount captured',
      ' */',
      'export function computeRefund(totalCents, percent) {}',
    ].join('\n');

    expect(readDeclarations(text)).toEqual([
      { name: 'computeRefund', summary: 'Computes the refund of a partial return.' },
    ]);
  });

  it('reads a run of line comments directly above a declaration as its comment', () => {
    const text = [
      '// Tries the carrier at most twice',
      '// because every try is billed.',
      'export const MAX_ATTEMPTS = 2;',
    ].join('\n');

    expect(readDeclarations(text)).toEqual([
      { name: 'MAX_ATTEMPTS', summary: 'Tries the carrier at most twice because every try is billed.' },
    ]);
  });

  it('gives no summary when a blank line separates the comment from the declaration', () => {
    const text = ['/** Not about the next one. */', '', 'export function computeRefund() {}'].join('\n');

    expect(readDeclarations(text)).toEqual([{ name: 'computeRefund', summary: null }]);
  });

  it('cuts a long summary to 200 characters', () => {
    const text = [`/** ${'word '.repeat(80)}*/`, 'function long() {}'].join('\n');

    expect(readDeclarations(text)[0]?.summary?.length).toBeLessThanOrEqual(200);
  });
});

describe('the files the map covers', () => {
  it('covers JavaScript and TypeScript source files', () => {
    expect(
      ['lib/labels.js', 'src/a.mjs', 'src/b.cjs', 'src/c.ts', 'src/d.tsx', 'src/e.jsx'].map(
        isMappedSourcePath,
      ),
    ).toEqual([true, true, true, true, true, true]);
  });

  it('leaves out other languages, tests, dependencies and build output', () => {
    expect(
      [
        'app.py',
        'README.md',
        'test/labels.test.js',
        'lib/labels.spec.ts',
        'node_modules/x/index.js',
        'dist/index.js',
        'build/out.js',
        'coverage/lcov.js',
        'vendor/lib.js',
        'lib/types.d.ts',
      ].map(isMappedSourcePath),
    ).toEqual([false, false, false, false, false, false, false, false, false, false]);
  });
});
