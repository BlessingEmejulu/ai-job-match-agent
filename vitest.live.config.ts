import { defineConfig } from 'vitest/config';

// Live source smoke tests: hit the real public job-board APIs. Not run in ordinary CI.
export default defineConfig({
    test: {
        include: ['test/live/**/*.test.ts'],
        environment: 'node',
        testTimeout: 60_000,
    },
});
