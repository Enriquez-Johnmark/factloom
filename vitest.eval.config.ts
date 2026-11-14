import { defineConfig } from 'vitest/config';

// The tests that need the real embedding model. They run on demand with `pnpm eval`.
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.eval.test.ts',
      'apps/*/src/**/*.eval.test.ts',
      'apps/*/evals/**/*.eval.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
});
