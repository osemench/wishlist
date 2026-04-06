import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      TEST_DB: ':memory:',
    },
    // Run test files serially so they share the same in-memory DB instance
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
