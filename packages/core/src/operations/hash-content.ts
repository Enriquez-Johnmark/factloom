/**
 * The SHA-256 of a text, as lower-case hex. It uses the Web Crypto API that Node.js provides
 * as a global, so that core imports no Node built-in module.
 */
export async function hashContent(content: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
