import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { checkForSecrets, SECRET_PATTERNS, type SecretKind } from './check-for-secrets.ts';

const root = join(import.meta.dirname, '..', '..', '..');

/** Repeats an alphabet until it is `length` characters long, so samples are fixed but not uniform. */
function filler(length: number, alphabet = 'aB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0z'): string {
  return alphabet.repeat(Math.ceil(length / alphabet.length)).slice(0, length);
}

// Each sample is joined from fragments at run time. No file in the repository may contain a
// string that matches a pattern (FL-022, technical requirement 3), and that includes this one.
const SAMPLES: Record<SecretKind, string> = {
  private_key: [
    '-----BEGIN ',
    'RSA PRIVATE KEY-----\n',
    `${filler(64)}\n${filler(40)}\n`,
    '-----END RSA PRIVATE ',
    'KEY-----',
  ].join(''),
  aws_access_key: ['AK', 'IA', 'QWERTYUIOPASDFGH'].join(''),
  github_token: ['gh', 'p_', filler(36)].join(''),
  anthropic_api_key: ['sk-', 'ant-', 'api03-', filler(93), 'AA'].join(''),
  openai_api_key: ['sk-', 'proj-', filler(74), 'T3Blbk', 'FJ', filler(74)].join(''),
  slack_token: ['xox', 'b-', '1234567890-', '1234567890-', filler(24)].join(''),
  url_credentials: ['https://', 'deploy', ':', 'hunter2horse', '@', 'git.example.com/shop.git'].join(''),
  credential_assignment: ['DB_PASS', 'WORD = "', 'correct horse battery', '"'].join(''),
};

/** Places a secret inside an ordinary note, as an agent would send it. */
function noteWith(secret: string): string {
  return `Deploy notes for the shop API: ${secret} is what the release job uses.`;
}

/**
 * Lists the folders of the agent skills copied from other repositories, as `skills-lock.json`
 * records them. The scan skips them: they are third-party text pinned by hash, and one example
 * in them assigns a literal to a password field, which is no credential format a host blocks.
 */
function listVendoredSkillFolders(): string[] {
  const lock: unknown = JSON.parse(readFileSync(join(root, 'skills-lock.json'), 'utf8'));
  if (typeof lock !== 'object' || lock === null || !('skills' in lock)) {
    throw new Error('skills-lock.json has no "skills" object.');
  }
  const { skills } = lock;
  if (typeof skills !== 'object' || skills === null) throw new Error('"skills" is not an object.');
  return Object.keys(skills).map((name) => `.claude/skills/${name}/`);
}

/** Returns every eight-character slice of a text. */
function slicesOfEight(text: string): string[] {
  return Array.from({ length: text.length - 7 }, (_, start) => text.slice(start, start + 8));
}

describe('checkForSecrets', () => {
  for (const { kind } of SECRET_PATTERNS) {
    it(`refuses a text that contains a ${kind}`, () => {
      const result = checkForSecrets([{ name: 'text', value: noteWith(SAMPLES[kind]) }]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('invalid_input');
    });
  }

  it('names the kind and the field and never repeats the secret', () => {
    for (const { kind } of SECRET_PATTERNS) {
      const secret = SAMPLES[kind];
      const result = checkForSecrets([{ name: 'statement', value: noteWith(secret) }]);
      const printed = inspect(result, { depth: null });
      expect(printed).toContain(kind);
      expect(printed).toContain('statement');
      expect(printed).not.toContain(secret);
      for (const slice of slicesOfEight(secret)) expect(printed).not.toContain(slice);
    }
  });

  it('returns ok when no field contains a secret', () => {
    const result = checkForSecrets([
      { name: 'text', value: 'The shop API uses vitest for its tests.' },
      { name: 'statement', value: 'The shop API depends on redis 7.2.' },
    ]);
    expect(result).toEqual({ ok: true, value: null });
  });

  it('reports the first field that contains a secret', () => {
    const result = checkForSecrets([
      { name: 'statement', value: 'The shop API uses vitest.' },
      { name: 'text', value: noteWith(SAMPLES.github_token) },
      { name: 'sourceUri', value: SAMPLES.url_credentials },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('"text"');
    expect(result.error.message).not.toContain('sourceUri');
  });

  it('accepts a commit hash', () => {
    const result = checkForSecrets([
      { name: 'text', value: 'Fixed in commit 5f6ec56cfa6f8c67648d863582c7ae2f206d5c1c on main.' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('accepts a UUID', () => {
    const result = checkForSecrets([
      { name: 'text', value: 'The failing request had the id 0b8f3f9e-6c2a-4c1e-9a57-3d2f1e4b5a69.' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('accepts a content hash', () => {
    const contentHash = createHash('sha256').update('package.json at the release tag').digest('hex');
    const result = checkForSecrets([{ name: 'text', value: `The lockfile hash is ${contentHash}.` }]);
    expect(result.ok).toBe(true);
  });

  it('accepts the name of a variable without a value', () => {
    const result = checkForSecrets([
      { name: 'text', value: 'The key is read from ANTHROPIC_API_KEY, and CI sets GITHUB_TOKEN.' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('accepts an assignment from a variable reference', () => {
    const texts = [
      'API_KEY=$API_KEY',
      `export ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY}`,
      `password: "\${DB_PASSWORD}"`,
      "token = '$GITHUB_TOKEN'",
      'api_key = "<your API key>"',
    ];
    for (const text of texts) {
      expect(checkForSecrets([{ name: 'text', value: text }]).ok, text).toBe(true);
    }
  });

  it('finds no secret in any tracked file of the repository', () => {
    const vendoredSkills = listVendoredSkillFolders();
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter((file) => file !== '')
      .filter((file) => !vendoredSkills.some((folder) => file.startsWith(folder)));
    const matches: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(root, file), 'utf8');
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regexes.some((regex) => regex.test(text))) matches.push(`${file}: ${pattern.kind}`);
      }
    }
    expect(files.length).toBeGreaterThan(0);
    expect(matches).toEqual([]);
  });
});
