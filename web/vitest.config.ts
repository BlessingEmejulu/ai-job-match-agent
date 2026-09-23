import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            // `server-only` throws outside a React Server environment; tests run route code directly.
            'server-only': fileURLToPath(new URL('./test/empty.ts', import.meta.url)),
        },
    },
    test: {
        include: ['test/**/*.test.ts'],
        environment: 'node',
    },
});
