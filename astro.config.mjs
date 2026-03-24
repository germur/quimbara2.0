// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://quimbara.org',
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap({
    filter: (page) => {
      // Exclude logic if needed, though draft/noIndex are handled in pages or using custom sitemap logic.
      // Better to use custom function or just let it map.
      return true;
    }
  })]
});