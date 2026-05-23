// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';

import partytown from '@astrojs/partytown';

// Leer fighters con foto o ranked para filtrar sitemap
const __cfgDir = dirname(fileURLToPath(import.meta.url));
const fighters = JSON.parse(readFileSync(join(__cfgDir, 'src/data/fighters.json'), 'utf8'));
const IMG_DIR = join(__cfgDir, 'public/fighters');
const sitemapSlugs = new Set(
  fighters
    .filter(f => {
      const ranked = f.rank === 'C' || (!isNaN(Number(f.rank)) && Number(f.rank) <= 15);
      const hasImg = existsSync(join(IMG_DIR, `${f.slug}.png`)) || existsSync(join(IMG_DIR, `${f.slug}.jpg`));
      return ranked || hasImg;
    })
    .map(f => f.slug)
);

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
    // ----- Migración canónica: /peleador/ → /peleadores/ (plural)
    // Estrategia SEO Quimbara MAES: ruta canónica con plural y slash final
    '/peleador': '/peleadores/',
    '/peleador/[slug]': '/peleadores/[slug]',

    // ----- Tags en inglés -> etiqueta en español -----
    '/tags': '/etiqueta/',

    // ----- Posts de demo del starter -----
    '/blog/customize': '/blog/',
    '/blog/markdown': '/blog/',
    '/blog/markdown-zh': '/blog/',

    // ----- Páginas demo del starter que nunca existieron -----
    '/docs': '/',
    '/projects': '/',
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
          '/peleador/',  // ruta antigua, ahora /peleadores/
          '/tags',
          '/docs',
          '/projects',
        ];
        if (noIndexPaths.some(p => page.includes(p))) return false;

        // Solo incluir fighters con foto o ranked (no stubs vacíos de 4000+)
        const pelMatch = page.match(/\/peleadores\/([^/]+)/);
        if (pelMatch) {
          return sitemapSlugs.has(pelMatch[1]);
        }

        return true;
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
