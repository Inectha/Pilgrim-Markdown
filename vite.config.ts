import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        ignoreURLParametersMatching: [/^action$/],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/katex')) {
            return 'katex';
          }
          if (
            id.includes('node_modules/@codemirror/lang-') ||
            id.includes('node_modules/@lezer/javascript') ||
            id.includes('node_modules/@lezer/python') ||
            id.includes('node_modules/@lezer/html') ||
            id.includes('node_modules/@lezer/css') ||
            id.includes('node_modules/@lezer/json') ||
            id.includes('node_modules/@lezer/yaml') ||
            id.includes('node_modules/@lezer/markdown')
          ) {
            return 'codemirror-langs';
          }
          if (id.includes('node_modules/@codemirror/') || id.includes('node_modules/@lezer/')) {
            return 'codemirror-core';
          }
          if (
            id.includes('node_modules/markdown-it') ||
            id.includes('node_modules/dompurify') ||
            id.includes('node_modules/entities') ||
            id.includes('node_modules/linkify-it')
          ) {
            return 'markdown';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
