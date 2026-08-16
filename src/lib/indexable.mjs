/**
 * Criterio ÚNICO de indexabilidad de perfiles de peleador (fix anti-pSEO).
 *
 * Lo usan:
 *   - astro.config.mjs                    → filtro del sitemap
 *   - src/pages/peleadores/[slug].astro   → meta robots (noindex)
 *   - src/pages/peleadores/index.astro    → listados (solo enlazan indexables)
 *   - src/components/DivisionHub.astro    → listados por división
 *   - scripts/fix-records.mjs             → a qué peleadores corregir el récord pro
 *
 * REGLA: es indexable si el peleador está RANKEADO (campeón o top-15) o si su
 * ficha tiene TEXTO PROPIO redactado (bio, trayectoria, estilo o FAQ en
 * fighters-overrides.json). El resto se sirve igual a usuarios y a crawlers de
 * IA, pero con "noindex, follow".
 *
 * POR QUÉ CAMBIÓ (15 de agosto de 2026)
 * Antes bastaba con tener foto, y eso daba 776 fichas indexables. Los datos de
 * GSC de tres meses dijeron lo que producían:
 *
 *     Rankeadas    174 páginas · 38.168 impresiones · 9 clics
 *     Solo foto    343 páginas ·  7.979 impresiones · 0 clics   ← cero
 *
 * Ni un clic en tres meses. Y no eran gratis: el sitio entero tenía 745 páginas
 * indexadas, así que esas fichas se comían el presupuesto de índice y diluían
 * la autoridad del dominio entre 776 páginas casi idénticas — todas generadas
 * con la misma plantilla a partir de una fila de datos.
 *
 * La señal de que el problema era dilución y no falta de contenido: Joshua Van,
 * CAMPEÓN de peso mosca, tenía 743 palabras propias desde mayo, Google lo
 * rastreó en julio y aun así lo dejó en "Crawled – currently not indexed".
 *
 * Tener foto no es una señal de relevancia. Estar rankeado o tener texto que no
 * está en ningún otro sitio, sí.
 *
 * Si el criterio cambia, se cambia SOLO aquí — nunca dupliques esta lógica.
 */

import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
/** @type {Record<string, any>} */
const OVERRIDES = require_('../data/fighters-overrides.json');

/** @param {{ rank?: string }} f */
export const isRanked = (f) =>
  f?.rank === 'C' ||
  (f?.rank != null && f.rank !== '' && !isNaN(Number(f.rank)) && Number(f.rank) <= 15);

/**
 * ¿Tiene la ficha texto redactado a mano? Es lo único que la distingue de las
 * otras 4.500: los datos los tiene cualquiera, el criterio editorial no.
 * @param {{ slug?: string, name?: string }} f
 */
export const tieneContenidoPropio = (f) => {
  const ov = OVERRIDES[f?.name] ?? OVERRIDES[f?.slug] ?? null;
  if (!ov) return false;
  return Boolean(ov.bio || ov.trayectoria || ov.style || (ov.faq && ov.faq.length));
};

/** @param {{ rank?: string, img?: string, slug?: string, name?: string }} f */
export const isIndexable = (f) => isRanked(f) || tieneContenidoPropio(f);
