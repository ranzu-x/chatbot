import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Frontend tests: `npm test` (watch: `npm run test:watch`). Tests live next to
// the code as *.test.js / *.test.jsx and run in a simulated browser (jsdom).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true,
  },
});
