/**
 * Horarios de eventos UFC por país hispanohablante.
 *
 * POR QUÉ EXISTE
 * "¿A qué hora es UFC 330 en Colombia?" es una de las pocas búsquedas de este
 * nicho que SÍ produce clic: no la puede responder un knowledge panel, porque
 * depende del país de quien pregunta. Los datos de GSC de agosto de 2026 lo
 * confirman — eventos 0,86% de CTR frente a 0,01% de las búsquedas biométricas.
 *
 * El title de /eventos/[slug] ya prometía "Horarios por país (México, Colombia,
 * España, Argentina)" y la página no los mostraba. Prometer en el snippet lo
 * que no está en la página es la forma más rápida de que el usuario vuelva al
 * buscador.
 *
 * SOBRE LA HORA BASE
 * UFC anuncia sus horarios en ET (hora del este de EE.UU.), y de ahí los
 * convierte todo el mundo. Los horarios varían por evento y ubicación, así que
 * aquí solo se ESTIMA con la convención habitual cuando no hay dato confirmado,
 * y se etiqueta como tal. Dar una hora inventada como si fuera cierta es peor
 * que no darla: la gente se pierde el evento y no vuelve.
 *
 * Para confirmar el horario de un evento, añade `horaET` en events-overrides.json:
 *     { "slug": "ufc-330-2026-08-15", "horaET": "21:00" }
 */

/** Países ordenados por impresiones reales en GSC (España es el mercado #1). */
export const PAISES = [
  { pais: 'España',    zona: 'Europe/Madrid',                  bandera: '🇪🇸' },
  { pais: 'México',    zona: 'America/Mexico_City',            bandera: '🇲🇽' },
  { pais: 'Colombia',  zona: 'America/Bogota',                 bandera: '🇨🇴' },
  { pais: 'Argentina', zona: 'America/Argentina/Buenos_Aires', bandera: '🇦🇷' },
  { pais: 'Perú',      zona: 'America/Lima',                   bandera: '🇵🇪' },
  { pais: 'Chile',     zona: 'America/Santiago',               bandera: '🇨🇱' },
];

/**
 * Convención de horarios de UFC en ET, usada solo como estimación.
 * · PPV numerado: cartelera estelar a las 22:00 ET
 * · Fight Night en América: 19:00 ET
 * · Evento en Europa/Asia: se emite en horario local de allí, que en ET cae
 *   por la tarde; 15:00 ET es la aproximación habitual para Europa.
 */
export function horaETEstimada(evento) {
  const esPPV = /UFC\s+\d{3}/.test(evento.name ?? '');
  const loc = (evento.loc ?? '').toLowerCase();
  const esEuropa = /(spain|france|england|uk|germany|serbia|poland|sweden|ireland|portugal|italy|abu dhabi|saudi|qatar)/.test(loc);
  const esAsia = /(china|japan|korea|singapore|shanghai|macau|australia|philippines)/.test(loc);

  if (esAsia) return '10:00';
  if (esEuropa) return '15:00';
  return esPPV ? '22:00' : '19:00';
}

/**
 * Offset de una zona horaria en una fecha concreta, en minutos.
 * Se calcula con Intl para que el horario de verano salga bien solo: en agosto
 * Nueva York está a −4 y en enero a −5, y España cambia en fechas distintas a
 * las de América. Hacerlo a mano con offsets fijos da errores de una hora justo
 * en las semanas de cambio.
 */
function offsetMinutos(zona, fechaUTC) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(fechaUTC).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (comoUTC - fechaUTC.getTime()) / 60000;
}

/**
 * Instante real del evento a partir de la fecha y la hora en ET.
 * @param {string} fechaISO "2026-08-15"
 * @param {string} horaET   "22:00"
 * @returns {Date}
 */
export function instanteDesdeET(fechaISO, horaET) {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const [hh, mm] = horaET.split(':').map(Number);
  // Se parte de la hora como si fuera UTC y se corrige con el offset real de
  // Nueva York en ese instante (dos pasadas bastan para estabilizar el DST).
  let t = Date.UTC(a, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const off = offsetMinutos('America/New_York', new Date(t));
    t = Date.UTC(a, m - 1, d, hh, mm) - off * 60000;
  }
  return new Date(t);
}

/**
 * Horarios del evento en cada país.
 * @returns {{pais:string, bandera:string, hora:string, dia:string, diaSiguiente:boolean}[]}
 */
export function horariosPorPais(fechaISO, horaET) {
  const instante = instanteDesdeET(fechaISO, horaET);
  const [a, m, d] = fechaISO.split('-').map(Number);

  return PAISES.map(({ pais, zona, bandera }) => {
    const hora = new Intl.DateTimeFormat('es-ES', {
      timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(instante);

    const partes = new Intl.DateTimeFormat('es-ES', {
      timeZone: zona, weekday: 'long', day: 'numeric', month: 'long',
    }).formatToParts(instante);
    const dia = partes.map(p => p.value).join('');

    // Un PPV a las 22:00 ET del sábado se ve de madrugada del domingo en España:
    // avisarlo evita que alguien se lo pierda por un día entero.
    const diaLocal = new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(instante);
    const diaEvento = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    return { pais, bandera, hora, dia, diaSiguiente: diaLocal > diaEvento };
  });
}

/**
 * Todo lo necesario para pintar la sección de horarios de un evento.
 * @param {{name?:string, loc?:string, date:string, horaET?:string}} evento
 */
export function horariosDeEvento(evento) {
  const confirmada = Boolean(evento.horaET);
  const horaET = evento.horaET ?? horaETEstimada(evento);
  return {
    confirmada,
    horaET,
    horarios: horariosPorPais(evento.date, horaET),
    // startDate con hora para el schema SportsEvent: Google lo usa para los
    // rich results de eventos, y con solo la fecha se pierde esa precisión.
    startDateISO: instanteDesdeET(evento.date, horaET).toISOString(),
  };
}
