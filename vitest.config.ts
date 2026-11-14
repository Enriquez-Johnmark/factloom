import { defineConfig } from 'vitest/config';

// The tests that `pnpm check` runs. They need no network, no API key and no embedding model.
// Files named *.eval.test.ts need the real embedding model and run under `pnpm eval` instead.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.eval.test.ts'],
  },
});
