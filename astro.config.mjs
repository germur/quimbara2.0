// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';

import partytown from '@astrojs/partytown';

// Criterio único de indexabilidad (compartido con [slug].astro y listados)
import { isIndexable } from './src/lib/indexable.mjs';

// Leer fighters para filtrar el sitemap con el MISMO criterio que el meta robots
const __cfgDir = dirname(fileURLToPath(import.meta.url));
const fighters = JSON.parse(readFileSync(join(__cfgDir, 'src/data/fighters.json'), 'utf8'));
const fightersBySlug = new Map(fighters.map(f => [f.slug, f]));

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

        // Perfiles de peleador: mismo criterio que el meta robots (isIndexable).
        // Si el slug no es de un peleador (índice, páginas de división), se incluye.
        const pelMatch = page.match(/\/peleadores\/([^/]+)/);
        if (pelMatch) {
          const fighter = fightersBySlug.get(pelMatch[1]);
          if (fighter) return isIndexable(fighter);
          return true; // /peleadores/ y divisiones (gallo, ligero, peso-medio…)
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
