/**
 * Criterio ÚNICO de limpieza de la lista de eventos (mismo patrón que indexable.mjs).
 *
 * Lo usan:
 *   - scripts/apply-event-overrides.mjs → los 3 próximos que ve la home
 *   - src/pages/eventos/index.astro     → calendario completo
 *
 * Por qué existe: Wikipedia y Sherdog devuelven el MISMO evento por duplicado,
 * con dos síntomas distintos.
 *
 *   1. Nombre numerado sin cartelera ("UFC Fight Night 284", main "TBD")
 *      conviviendo con el bueno ("UFC Fight Night", Gamrot vs. Salkilld).
 *   2. El mismo evento en dos fechas contiguas, porque una fuente usa hora
 *      local y la otra hora US (Shanghái salía el 29 y el 30 de agosto).
 *
 * OJO: no filtres por `status`. Llega sucio por los dos lados — overrides
 * manuales con 'upcoming' fijo (el evento de la Casa Blanca estuvo 7 semanas
 * en "Próximos") y el scraper marcando 'completed' eventos de octubre que aún
 * no han ocurrido. Manda la fecha; para los duplicados, esta función.
 *
 * Si el criterio cambia, se cambia SOLO aquí — nunca dupliques esta lógica.
 */

const SIN_MAIN = new Set(['', 'tbd', 'por confirmar']);

/**
 * @param {Array<{date?: string, main?: string, fightCard?: unknown[]}>} eventos
 * @returns {Array} la misma lista sin duplicados
 */
export function dedupeEventos(eventos) {
  // Pase 1 — si una fecha ya tiene un evento con cartelera real, los vacíos sobran.
  const fechasConCartelera = new Set(
    eventos.filter(e => (e.fightCard?.length ?? 0) > 0).map(e => e.date)
  );
  const sinFantasmas = eventos.filter(
    e => (e.fightCard?.length ?? 0) > 0 || !fechasConCartelera.has(e.date)
  );

  // Pase 2 — mismo main event a menos de 48h = mismo evento; nos quedamos con el primero.
  const vistos = new Map(); // main normalizado → fecha ya aceptada
  return sinFantasmas.filter(e => {
    const key = (e.main ?? '').trim().toLowerCase();
    if (SIN_MAIN.has(key)) return true;
    const previa = vistos.get(key);
    if (previa) {
      const dias = Math.abs(
        (new Date(e.date).getTime() - new Date(previa).getTime()) / 86400000
      );
      if (dias <= 2) return false;
    }
    vistos.set(key, e.date);
    return true;
  });
}
