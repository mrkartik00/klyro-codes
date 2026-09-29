import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // One shared MongoMemoryReplSet + Mongoose connection for all integration
    // files (see tests/setup.js). Files run in a single fork, not in parallel.
    setupFiles: ['tests/setup.js'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
