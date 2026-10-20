import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  cacheDir: './.vite',
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 5175, host: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
