// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  site: 'https://quimbara.org',
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap({
    // Excluir páginas con noIndex (legales) — evita "URL enviada marcada como noindex" en GSC
    filter: (page) => {
      const noIndexPaths = ['/aviso-legal', '/privacidad', '/404'];
      return !noIndexPaths.some(p => page.includes(p));
    }
  }), mdx()]
});