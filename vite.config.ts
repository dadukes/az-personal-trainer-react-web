import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  // Pure logic only: nothing here renders a component.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The token test reads index.css as text; Vitest blanks CSS files otherwise.
    css: { include: [/index\.css/] },
  },
});
