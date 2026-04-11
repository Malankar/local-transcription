import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    // Avoid fork worker shutdown issues (e.g. kill EACCES) in constrained environments.
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/renderer/src/globals.css'],
      thresholds: {
        branches: 59,
        functions: 61,
        lines: 66,
        statements: 65,
      },
    },
  },
});
