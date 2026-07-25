/**
 * fetch-peleas.mjs — historial completo de peleas desde Wikipedia.
 *
 *   npm run data:peleas              # rankeados que falten
 *   npm run data:peleas -- --all     # todos los que tengan pagina
 *   npm run data:peleas -- --slug=ilia-topuria --force
 *
 * ─── POR QUÉ WIKIPEDIA ───────────────────────────────────────────────
 * `peleas[]` no tenía fuente: el MCP de MMA API pide suscripción y
 * results.json solo guarda 4 entradas del widget de home. UFC.com solo
 * publica el tramo UFC de la carrera, no el récord profesional completo.
 *
 * Wikipedia mantiene la tabla completa en wikitext, con una estructura
 * estable (`{{MMA record start}}` … `{{end}}`) que es más fácil y más
 * robusta de parsear que HTML scrapeado.
 *
 * Bonus: el `{{MMArecordbox}}` trae el desglose ko/sub/dec de victorias y
 * derrotas — justo el dato que faltaba para el bloque de récord de la carta.
 *
 * ─── LÍMITES CONOCIDOS ───────────────────────────────────────────────
 * · Solo peleadores con página propia. Los del roster bajo casi nunca la
 *   tienen; por eso el default es correr sobre los rankeados.
 * · Wikipedia no dice la posición en cartelera. `importancia` se infiere:
 *   título si las notas lo mencionan, main-event si el apellido del
 *   peleador aparece en el nombre del evento (patrón "UFC FN: X vs Y"),
 *   main-card en el resto. No es perfecto y está marcado como inferido.
 * · Es contenido editado por la comunidad: puede estar desactualizado o
 *   traer errores. El récord canónico sigue siendo el de UFC.com; esto
 *   alimenta el timeline, no reemplaza `rec`.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUTA_SALIDA = resolve(__dirname, '../src/data/peleadores-peleas.json');
const RUTA_FIGHTERS = resolve(__dirname, '../src/data/fighters.json');
const RUTA_EVENTOS = resolve(__dirname, '../src/data/events-all.json');

// Wikipedia pide User-Agent descriptivo con forma de contacto.
const UA = 'QuimbaraBot/1.0 (https://quimbara.org; https://github.com/germur/quimbara2.0)';
const PAUSA_MS = 250; // cortesía con la API

// ─── CLI ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = n => args.includes(`--${n}`);
const valor = n => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];

const SOLO_SLUG = valor('slug');
const TODOS = flag('all');
const FORCE = flag('force');
const LIMITE = Number(valor('limite')) || Infinity;

// ─── Utilidades de wikitext ──────────────────────────────────────────

/** `[[Target|Display]]` o `[[Page]]` → texto legible */
function limpiarLinks(s) {
  return (s ?? '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // Templates de presentación que solo envuelven texto
    .replace(/\{\{(?:small|nowrap|nobr|nb|nowraplinks)\|([^}]*)\}\}/gi, '$1')
    .replace(/<ref[^>]*>.*?<\/ref>/gs, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MESES = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
};

/** `{{dts|2026|June|14}}` o `{{dts|link=off|2026|6|14}}` → "2026-06-14" */
function parsearFecha(celda) {
  const m = /\{\{dts\|([^}]+)\}\}/i.exec(celda ?? '');
  if (!m) return null;
  const partes = m[1].split('|').map(s => s.trim()).filter(p => !p.includes('='));
  if (partes.length < 3) return null;
  const [a, mes, d] = partes;
  const anio = Number(a);
  const nMes = /^\d+$/.test(mes) ? Number(mes) : MESES[mes.toLowerCase()];
  const dia = Number(d);
  if (!anio || !nMes || !dia) return null;
  return `${anio}-${String(nMes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Normaliza el método a los mismos buckets que usa la quiniela. */
function normalizarMetodo(detalle) {
  const d = (detalle ?? '').toLowerCase();
  if (/^tko|^ko\b|knockout/.test(d)) return 'ko';
  if (/submission|choke|armbar|guillotine/.test(d)) return 'sub';
  if (/decision/.test(d)) return 'dec';
  return 'otro'; // DQ, No Contest, Overturned, etc.
}

function parsearResultado(celda) {
  const t = limpiarLinks(celda).replace(/\{\{[^}]*\}\}/g, '').trim().toLowerCase();
  if (t.startsWith('win')) return 'victoria';
  if (t.startsWith('loss')) return 'derrota';
  if (t.startsWith('draw')) return 'empate';
  if (t.startsWith('nc') || t.includes('no contest')) return 'nc';
  return null;
}

function slugificar(nombre) {
  return (nombre ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '')
    .replace(/\([^)]*\)/g, '')       // "(fighter)" en nombres desambiguados
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Posición en cartelera. Wikipedia no la publica, así que se infiere.
 * Ver LÍMITES CONOCIDOS arriba.
 */
function inferirImportancia(notas, evento, nombrePeleador) {
  const n = (notas ?? '').toLowerCase();
  if (/championship|title|titulo/.test(n)) return 'titulo';

  // Los eventos sin numero se nombran por el main event: "UFC FN: X vs. Y"
  const apellido = (nombrePeleador ?? '').split(' ').pop()?.toLowerCase();
  if (apellido && apellido.length > 3 && /:/.test(evento ?? '')) {
    const cabecera = evento.split(':')[1]?.toLowerCase() ?? '';
    if (cabecera.includes(apellido)) return 'main-event';
  }
  return 'main-card';
}

// ─── Parseo de la tabla ──────────────────────────────────────────────

function parsearRecordbox(wt) {
  const m = /\{\{MMArecordbox([\s\S]*?)\}\}/i.exec(wt);
  if (!m) return null;
  const campos = {};
  for (const linea of m[1].split('\n')) {
    const kv = /\|\s*([a-z-]+)\s*=\s*(.*)$/i.exec(linea);
    if (kv) {
      const v = kv[2].trim();
      campos[kv[1].toLowerCase()] = v === '' ? 0 : Number(v) || 0;
    }
  }
  const g = k => campos[k] ?? 0;
  return {
    koVictorias:  g('ko-wins'),
    subVictorias: g('sub-wins'),
    decVictorias: g('dec-wins'),
    koDerrotas:   g('ko-losses'),
    subDerrotas:  g('sub-losses'),
    decDerrotas:  g('dec-losses'),
  };
}

function parsearTabla(wt, nombrePeleador) {
  const ini = wt.indexOf('{{MMA record start}}');
  if (ini === -1) return [];
  let fin = wt.indexOf('{{end}}', ini);
  if (fin === -1) fin = wt.length;
  const bloque = wt.slice(ini, fin);

  const filas = bloque.split(/\n\|-\s*\n?/).slice(1);
  const peleas = [];

  for (const fila of filas) {
    // Celdas: líneas que empiezan con | (puede venir || en la de notas)
    // El prefijo de alineación viene con o sin espacios según la fila
    // ("|align=center|17–1" vs "| align=center| 11–0"), así que hay que
    // recortar antes de quitarlo.
    const celdas = fila
      .split('\n')
      .filter(l => l.trimStart().startsWith('|'))
      .map(l => l
        .replace(/^\s*\|\|?/, '')
        .trim()
        .replace(/^align\s*=\s*center\s*\|/i, '')
        .trim());

    if (celdas.length < 6) continue;

    /**
     * Wikipedia usa DOS layouts de columnas en la misma tabla:
     *
     *   completo (UFC y promotoras grandes):
     *     Result | Record | Rival | Metodo | Evento | Fecha | Round | Tiempo | Lugar | Notas
     *   corto (peleas regionales tempranas, sin evento ni fecha):
     *     Result | Record | Rival | Metodo | Round | Tiempo | Notas
     *
     * Se distinguen porque en el corto la columna 4 es el round: un entero
     * suelto. En el completo es el nombre del evento, siempre texto.
     */
    const [cRes, cRec, cRival, cMetodo] = celdas;
    const esLayoutCorto = /^\d+$/.test((celdas[4] ?? '').trim());

    const cEvento  = esLayoutCorto ? null       : celdas[4];
    const cFecha   = esLayoutCorto ? null       : celdas[5];
    const cRound   = esLayoutCorto ? celdas[4]  : celdas[6];
    const cTiempo  = esLayoutCorto ? celdas[5]  : celdas[7];
    const cNotas   = esLayoutCorto ? celdas[6]  : celdas[9];

    const resultado = parsearResultado(cRes);
    if (!resultado) continue;

    // fecha puede ser null en el layout corto. No se descarta la pelea: el
    // orden cronológico lo da el orden de la tabla, que Wikipedia mantiene
    // consistente, y el campo `registro` confirma la secuencia.
    const fecha = parsearFecha(cFecha);

    const rivalNombre = limpiarLinks(cRival);
    const metodoDetalle = limpiarLinks(cMetodo);
    const evento = limpiarLinks(cEvento);
    const notas = limpiarLinks(cNotas ?? '');

    peleas.push({
      fecha,
      resultado,
      registro: limpiarLinks(cRec).replace(/–/g, '-'), // en-dash → guion
      rivalNombre,
      rivalSlug: null, // se resuelve después contra fighters.json
      metodo: normalizarMetodo(metodoDetalle),
      metodoDetalle,
      round: Number(limpiarLinks(cRound)) || null,
      tiempo: limpiarLinks(cTiempo) || null,
      evento: evento || null,
      eventoSlug: null, // se resuelve después contra events-all.json
      importancia: inferirImportancia(notas, evento, nombrePeleador),
      importanciaInferida: true,
      notas: notas || null,
    });
  }

  // Wikipedia lista de más reciente a más antigua; el timeline es cronológico
  return peleas.reverse();
}

// ─── Wikipedia API ───────────────────────────────────────────────────

const dormir = ms => new Promise(r => setTimeout(r, ms));

async function traerWikitext(titulo) {
  const url = 'https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext' +
              `&page=${encodeURIComponent(titulo)}&format=json&formatversion=2&redirects=1`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const j = await r.json();
  if (j.error) return null;
  return j.parse?.wikitext ?? null;
}

async function buscarPagina(nombre) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=3' +
              `&srsearch=${encodeURIComponent(nombre + ' mixed martial artist')}` +
              '&format=json&formatversion=2';
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.query?.search ?? []).map(s => s.title);
}

/** Intenta nombre exacto y, si no hay tabla, cae a búsqueda. */
async function resolver(nombre) {
  const candidatos = [nombre.replace(/ /g, '_')];
  let wt = await traerWikitext(candidatos[0]);
  if (wt && wt.includes('{{MMA record start}}')) {
    return { titulo: candidatos[0], wikitext: wt };
  }

  await dormir(PAUSA_MS);
  for (const t of await buscarPagina(nombre)) {
    await dormir(PAUSA_MS);
    wt = await traerWikitext(t);
    if (wt && wt.includes('{{MMA record start}}')) {
      return { titulo: t.replace(/ /g, '_'), wikitext: wt };
    }
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────

const fighters = JSON.parse(readFileSync(RUTA_FIGHTERS, 'utf8'));
const eventosRaw = JSON.parse(readFileSync(RUTA_EVENTOS, 'utf8'));
const eventos = Array.isArray(eventosRaw) ? eventosRaw : eventosRaw.events ?? [];

const slugPorNombre = new Map(fighters.map(f => [slugificar(f.name), f.slug]));
const slugEventoPorNombre = new Map(eventos.map(e => [slugificar(e.name), e.slug]));

const salida = existsSync(RUTA_SALIDA)
  ? JSON.parse(readFileSync(RUTA_SALIDA, 'utf8'))
  : {
      _lee_esto_primero: {
        proposito: 'Historial completo de peleas por peleador, scrapeado de Wikipedia. Alimenta el Camino del Peleador (timeline) y el desglose ko/sub/dec de las cartas.',
        fuente: 'Wikipedia (wikitext de la seccion Mixed martial arts record). Contenido de la comunidad: puede estar desactualizado. El record canonico sigue siendo el de UFC.com en fighters.json.',
        regenerar: 'npm run data:peleas  (solo los que falten) · -- --force para rehacer · -- --slug=x para uno',
        importancia: 'INFERIDA, no publicada por Wikipedia: titulo si las notas mencionan campeonato, main-event si el apellido aparece en el nombre del evento, main-card por defecto. El campo importanciaInferida lo marca.',
        orden: 'peleas[] va en orden cronologico ascendente (la mas antigua primero).',
      },
      actualizado: null,
      peleadores: {},
      sinPagina: [],
    };

// Selección de objetivos
let objetivos;
if (SOLO_SLUG) {
  objetivos = fighters.filter(f => f.slug === SOLO_SLUG);
} else if (TODOS) {
  objetivos = fighters;
} else {
  // Default: rankeados (campeón + top 15). Son los que tienen página y los
  // que importan para el timeline.
  objetivos = fighters.filter(f => f.rank);
}

const sinPagina = new Set(salida.sinPagina ?? []);
if (!FORCE) {
  objetivos = objetivos.filter(f => !salida.peleadores[f.slug] && !sinPagina.has(f.slug));
}
objetivos = objetivos.slice(0, LIMITE);

console.log(`\nObjetivos: ${objetivos.length} peleador(es)`);
if (!objetivos.length) {
  console.log('Nada que hacer. Usa --force para rehacer los ya guardados.\n');
  process.exit(0);
}

let ok = 0, vacios = 0, errores = 0, totalPeleas = 0;

for (const [i, f] of objetivos.entries()) {
  const prefijo = `[${String(i + 1).padStart(3)}/${objetivos.length}] ${f.name.padEnd(26)}`;
  try {
    const res = await resolver(f.name);
    if (!res) {
      console.log(`${prefijo} — sin página`);
      sinPagina.add(f.slug);
      vacios++;
      await dormir(PAUSA_MS);
      continue;
    }

    const peleas = parsearTabla(res.wikitext, f.name);
    if (!peleas.length) {
      console.log(`${prefijo} — página sin tabla parseable`);
      sinPagina.add(f.slug);
      vacios++;
      await dormir(PAUSA_MS);
      continue;
    }

    // Resolver rivales y eventos contra nuestra propia data
    let rivalesLigados = 0, eventosLigados = 0;
    for (const p of peleas) {
      const s = slugPorNombre.get(slugificar(p.rivalNombre));
      if (s) { p.rivalSlug = s; rivalesLigados++; }
      // events-all.json solo guarda una ventana reciente, así que las peleas
      // viejas no van a ligar. Es esperado, no un fallo.
      if (p.evento) {
        const e = slugEventoPorNombre.get(slugificar(p.evento));
        if (e) { p.eventoSlug = e; eventosLigados++; }
      }
    }

    /**
     * El {{MMArecordbox}} de Wikipedia a veces NO cuadra con su propia tabla
     * (editado por distinta gente en distinto momento). Se valida contra el
     * registro de la última pelea antes de marcarlo como confiable: una carta
     * no puede mostrar "KO 12 · SUB 2 · DEC 12" si eso no suma el récord.
     */
    const desglose = parsearRecordbox(res.wikitext);
    let desgloseCuadra = false;
    if (desglose) {
      const ultimo = peleas[peleas.length - 1]?.registro ?? '';
      const [v, d] = ultimo.replace(/\s*\(\d+\)/, '').split('-').map(Number);
      const sumaV = desglose.koVictorias + desglose.subVictorias + desglose.decVictorias;
      const sumaD = desglose.koDerrotas + desglose.subDerrotas + desglose.decDerrotas;
      desgloseCuadra = sumaV === v && sumaD === d;
    }

    // Récord final según Wikipedia, para poder cruzarlo con el de UFC.com
    const recordWiki = (peleas[peleas.length - 1]?.registro ?? '').replace(/\s*\(\d+\)/, '');

    salida.peleadores[f.slug] = {
      wikipedia: res.titulo,
      actualizado: new Date().toISOString(),
      recordWiki,
      desglose,
      desgloseCuadra,
      peleas,
    };
    sinPagina.delete(f.slug);

    totalPeleas += peleas.length;
    ok++;
    console.log(`${prefijo} ✓ ${String(peleas.length).padStart(2)} peleas · ${rivalesLigados} rivales ligados · ${eventosLigados} eventos`);
  } catch (e) {
    console.log(`${prefijo} ✗ ${e.message}`);
    errores++;
  }
  await dormir(PAUSA_MS);
}

salida.sinPagina = [...sinPagina].sort();
salida.actualizado = new Date().toISOString();
writeFileSync(RUTA_SALIDA, JSON.stringify(salida, null, 2) + '\n');

const guardados = Object.keys(salida.peleadores).length;
console.log(`\n${'─'.repeat(58)}`);
console.log(`  nuevos          ${ok}`);
console.log(`  sin página      ${vacios}`);
if (errores) console.log(`  errores         ${errores}`);
console.log(`  peleas nuevas   ${totalPeleas}`);
console.log(`  total guardado  ${guardados} peleadores`);
console.log(`\nEscrito en src/data/peleadores-peleas.json\n`);
