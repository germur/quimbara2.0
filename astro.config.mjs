// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';

import partytown from '@astrojs/partytown';

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
  }), mdx(), partytown({
    // Reenviar dataLayer.push al main thread para que GA4 funcione desde el Web Worker
    config: { forward: ['dataLayer.push'] }
  })]
});