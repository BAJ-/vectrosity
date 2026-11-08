import { defineConfig } from 'electron-vite';

// Main process and renderer only; the app needs no preload script yet.
export default defineConfig({
  main: {},
  renderer: {},
});
