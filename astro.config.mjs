import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://marctoni.dev',
  integrations: [
    tailwind(),
    sitemap()
  ],
  build: {
    inlineStylesheets: 'auto'
  },
  compressHTML: true,
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp'
    }
  }
});