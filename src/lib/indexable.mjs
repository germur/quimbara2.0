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
 * Regla: un perfil es indexable si el peleador está rankeado (campeón o top-15)
 * o tiene foto. El resto se sirve igual a usuarios y AI crawlers, pero con
 * "noindex, follow" para no exponer miles de perfiles thin al índice de Google.
 *
 * Si el criterio cambia, se cambia SOLO aquí — nunca dupliques esta lógica.
 */

/** @param {{ rank?: string }} f */
export const isRanked = (f) =>
  f?.rank === 'C' ||
  (f?.rank != null && f.rank !== '' && !isNaN(Number(f.rank)) && Number(f.rank) <= 15);

/** @param {{ rank?: string, img?: string }} f */
export const isIndexable = (f) => isRanked(f) || !!f?.img;
