import { defineConfig } from 'vite';

// Repo is published at https://chrisdfennell.github.io/hubspoke/, so assets
// need to load from /hubspoke/. Local `npm run dev` keeps base '/'.
const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: isProd ? '/hubspoke/' : '/',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
