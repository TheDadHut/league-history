/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  base: '/league-history/',
  plugins: [react()],
  test: {
    // Pure stat selectors only need a Node environment. Add jsdom on
    // demand if a future test renders React components.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
