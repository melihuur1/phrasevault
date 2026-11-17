import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		// Blocks every outgoing network request so the suite can never make a paid API call.
		setupFiles: ['tests/setup.ts'],
		environment: 'node',
	},
});
