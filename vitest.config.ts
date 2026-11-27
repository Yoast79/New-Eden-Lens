import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
      '@electron': resolve(__dirname, 'electron')
    }
  },
  test: {
    environment: 'node'
  }
});

