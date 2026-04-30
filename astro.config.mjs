// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';

import partytown from '@astrojs/partytown';

// https://astro.build/config
export default defineConfig({
  site: 'https://quimbara.org',

  // Forzar trailing slash consistente — evita duplicados en GSC
  trailingSlash: 'always',

  // Build con slash al final para coincidir con la canonical
  build: {
    format: 'directory'
  },

  // ============================================================
  // REDIRECTS 301 — limpieza de URLs del Astro starter v1.0
  // ============================================================
  // IMPORTANTE: estos redirects sólo funcionan si el adapter del
  // hosting los soporta. En Netlify/Vercel/Cloudflare Pages, Astro
  // los exporta automáticamente. En hosting estático puro, hay que
  // duplicarlos en _redirects o vercel.json (ver FASE 2).
  redirects: {
    // ----- Plurales en inglés -> singular en español -----
    '/peleadores': '/peleador/',

    // ----- Tags en inglés -> etiqueta en español -----
    '/tags': '/etiqueta/',

    // ----- Posts de demo del starter -----
    '/blog/customize': '/blog/',
    '/blog/markdown': '/blog/',
    '/blog/markdown-zh': '/blog/',

    // ----- Páginas demo del starter que nunca existieron -----
    '/docs': '/',
    '/projects': '/',
    '/sobre-nosotros': '/',
    '/estadisticas': '/',
    '/noticias': '/blog/',
    '/analisis': '/blog/',
    '/categoria': '/blog/',
  },

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    sitemap({
      // Excluir páginas con noIndex y rutas legacy
      filter: (page) => {
        const noIndexPaths = [
          '/aviso-legal',
          '/privacidad',
          '/404',
          // Excluir cualquier residuo del starter v1
          '/peleadores',
          '/tags',
          '/docs',
          '/projects',
        ];
        return !noIndexPaths.some(p => page.includes(p));
      },
      // Cambiar frecuencia y prioridad para señalizar bien a Google
      changefreq: 'weekly',
      priority: 0.7,
      // Sitemap con últimas modificaciones
      lastmod: new Date(),
    }),
    mdx(),
    partytown({
      config: { forward: ['dataLayer.push'] }
    })
  ]
});
