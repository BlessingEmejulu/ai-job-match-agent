import { defineConfig } from 'vitest/config';

// Ordinary CI tests: fixtures only, no network.
export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        exclude: ['test/live/**'],
        environment: 'node',
    },
});
