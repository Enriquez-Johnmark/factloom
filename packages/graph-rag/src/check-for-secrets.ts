import { err, ok, type Result } from '@kronomind/core';

/** The kinds of secret the check recognises. A kind is named in the error, never the secret. */
export type SecretKind =
  | 'private_key'
  | 'aws_access_key'
  | 'github_token'
  | 'anthropic_api_key'
  | 'openai_api_key'
  | 'slack_token'
  | 'url_credentials'
  | 'credential_assignment';

export type SecretPattern = {
  readonly kind: SecretKind;
  /** Completes the sentence "The field contains ...". */
  readonly description: string;
  /** Any one of them matching is a match. None has the `g` flag, so `test` keeps no state. */
  readonly regexes: readonly RegExp[];
};

/** One named piece of the text a write would store or send to the LLM. */
export type CheckedField = { readonly name: string; readonly value: string };

// Sources of the patterns, both accessed on 2026-11-16:
// - Gitleaks, MIT licence, Copyright (c) 2019 Zachary Rice. The default rule set at commit
//   5f6ec56cfa6f8c67648d863582c7ae2f206d5c1c:
//   https://github.com/gitleaks/gitleaks/blob/5f6ec56cfa6f8c67648d863582c7ae2f206d5c1c/config/gitleaks.toml
// - detect-secrets, Apache License 2.0, by Yelp. The plugins at commit
//   5e141933554a0b74e7341841f318be21e895339c:
//   https://github.com/Yelp/detect-secrets/tree/5e141933554a0b74e7341841f318be21e895339c/detect_secrets/plugins
// The Gitleaks rules are written for Go's RE2. Where a rule ends with the group
// (?:[\x60'"\s;]|\\[nr]|$), it is written here as a lookahead, which matches the same texts.
// Gitleaks also filters some rules by entropy; the check here does not (ADR 0019).

/** Gitleaks `generic-api-key` keywords include `token`; the rest is the detect-secrets `DENYLIST`. */
const CREDENTIAL_NAMES = [
  'api_?key',
  'auth_?key',
  'service_?key',
  'account_?key',
  'db_?key',
  'database_?key',
  'priv_?key',
  'private_?key',
  'client_?key',
  'db_?pass',
  'database_?pass',
  'key_?pass',
  'password',
  'passwd',
  'pwd',
  'secret',
  'contraseña',
  'contrasena',
  'token',
].join('|');

/**
 * The assignment forms that detect-secrets applies to text of unknown file type
 * (`QUOTES_REQUIRED_DENYLIST_REGEX_TO_GROUP` in plugins/keyword.py): a name, then `:`, `=`, `==`,
 * `===`, `!=`, `!==` or `=>`, then a quoted value. Its `SECRET` part requires the value to start
 * with a word character, so `"$NAME"`, `"${NAME}"` and `"<placeholder>"` are not values, and an
 * unquoted `NAME=$NAME` is not an assignment of a literal. One change from detect-secrets: the
 * name must end with the keyword. detect-secrets allows any word characters after it, which
 * refused `tokenize = "unicode61"` in this repository's own spikes.
 */
const CREDENTIAL_ASSIGNMENT = new RegExp(
  `(?:${CREDENTIAL_NAMES})[\\]'"]{0,2}\\s*(?::|={1,3}|!==?|=>)\\s*(['"\`])(?=\\w)[^\\v'"]*[^\\v,'"\`]\\1`,
  'i',
);

/** The patterns, in the order they are tried. Adding a kind is one entry here and one test. */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    kind: 'private_key',
    description: 'a private key block',
    // Gitleaks rule `private-key`.
    regexes: [/-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----[\s\S-]{64,}?KEY(?: BLOCK)?-----/i],
  },
  {
    kind: 'aws_access_key',
    description: 'an AWS access key',
    // Gitleaks rule `aws-access-token`.
    regexes: [/\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/],
  },
  {
    kind: 'github_token',
    description: 'a GitHub token',
    regexes: [
      // Gitleaks rules `github-pat`, `github-oauth`, `github-app-token` and `github-refresh-token`.
      /(?:ghp|gho|ghu|ghs|ghr)_[0-9a-zA-Z]{36}/,
      // Gitleaks rule `github-fine-grained-pat`.
      /github_pat_\w{82}/,
    ],
  },
  {
    kind: 'anthropic_api_key',
    description: 'an Anthropic API key',
    // Gitleaks rules `anthropic-api-key` and `anthropic-admin-api-key`, which name the type
    // segments `api03` and `admin01`. Any segment of lower-case letters and digits is accepted:
    // the owner confirmed on 2026-11-16 that a key issued by the Claude Platform has another
    // one (Q-83 in docs/research/OPEN-QUESTIONS.md).
    regexes: [/\bsk-ant-[a-z0-9]+-[a-zA-Z0-9_-]{93}AA(?=[`'"\s;]|\\[nr]|$)/],
  },
  {
    kind: 'openai_api_key',
    description: 'an OpenAI API key',
    // Gitleaks rule `openai-api-key`.
    regexes: [
      /\b(?:sk-(?:proj|svcacct|admin)-(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})T3BlbkFJ(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})\b|sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20})(?=[`'"\s;]|\\[nr]|$)/,
    ],
  },
  {
    kind: 'slack_token',
    description: 'a Slack token',
    regexes: [
      /xoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/, // Gitleaks `slack-bot-token`
      /xox[pe](?:-[0-9]{10,13}){3}-[a-zA-Z0-9-]{28,34}/, // Gitleaks `slack-user-token`
      /xapp-\d-[A-Z0-9]+-\d+-[a-z0-9]+/i, // Gitleaks `slack-app-token`
      /xox[os]-\d+-\d+-\d+-[a-fA-F\d]+/, // Gitleaks `slack-legacy-token`
      /xoxb-[0-9]{8,14}-[a-zA-Z0-9]{18,26}/, // Gitleaks `slack-legacy-bot-token`
      /xox[ar]-(?:\d-)?[0-9a-zA-Z]{8,48}/, // Gitleaks `slack-legacy-workspace-token`
      /xoxe.xox[bp]-\d-[A-Z0-9]{163,166}/i, // Gitleaks `slack-config-access-token`
      /xoxe-\d-[A-Z0-9]{146}/i, // Gitleaks `slack-config-refresh-token`
    ],
  },
  {
    kind: 'url_credentials',
    description: 'a URL with a user name and password',
    // detect-secrets `BasicAuthDetector` (plugins/basic_auth.py): neither part may contain a
    // character that RFC 3986, section 2.2, reserves.
    regexes: [/:\/\/[^:/?#[\]@!$&'()*+,;=\s]+:[^:/?#[\]@!$&'()*+,;=\s]+@/],
  },
  {
    kind: 'credential_assignment',
    description: 'a credential assigned a literal value',
    regexes: [CREDENTIAL_ASSIGNMENT],
  },
];

/** Returns the first pattern that matches the text, or null. */
function findSecretPattern(text: string): SecretPattern | null {
  return SECRET_PATTERNS.find((pattern) => pattern.regexes.some((regex) => regex.test(text))) ?? null;
}

/**
 * Refuses a write whose text contains a recognisable credential. Checks the fields in order and
 * returns `invalid_input` for the first match, naming the kind of secret and the field. The error
 * repeats no part of the field's value, so the secret is not stored, logged or sent anywhere.
 */
export function checkForSecrets(fields: readonly CheckedField[]): Result<null> {
  for (const field of fields) {
    const pattern = findSecretPattern(field.value);
    if (pattern !== null) {
      return err(
        'invalid_input',
        `The field "${field.name}" contains ${pattern.description} (${pattern.kind}). Kronomind does not store secrets. Remove it and try again.`,
      );
    }
  }
  return ok(null);
}
