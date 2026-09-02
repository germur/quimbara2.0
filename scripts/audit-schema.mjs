/**
 * Auditoría de JSON-LD sobre el dist ya construido.
 *
 * Por qué existe: en septiembre de 2026 Search Console reportó
 * "Missing field location / startDate" en eventos. La causa era refEvento(),
 * que emitía un nodo SportsEvent con solo name+url dentro del `about` de los
 * posts del blog. Las fichas de /eventos/ estaban perfectas — el error venía
 * de un nodo anidado tres niveles adentro de otro schema.
 *
 * Eso es lo que hace este tipo de bug caro: nadie mira el `about` de un post
 * buscando eventos, y el aviso de Google llegó semanas después de desplegarlo.
 * Google valida CUALQUIER nodo tipado como Event que aparezca en la página,
 * esté donde esté; así que aquí recorremos el grafo entero, no la raíz.
 *
 * Uso: node scripts/audit-schema.mjs [dist]
 * Sale con código 1 si encuentra algo, para que el workflow se marque en rojo.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] ?? 'dist';

/** Subtipos de Event que Google valida con las mismas reglas. */
const TIPOS_EVENTO = new Set([
  'Event', 'SportsEvent', 'BusinessEvent', 'ChildrensEvent', 'ComedyEvent',
  'DanceEvent', 'DeliveryEvent', 'EducationEvent', 'ExhibitionEvent',
  'Festival', 'FoodEvent', 'Hackathon', 'LiteraryEvent', 'MusicEvent',
  'PublicationEvent', 'SaleEvent', 'ScreeningEvent', 'SocialEvent',
  'TheaterEvent', 'VisualArtsEvent',
]);

/** Campos que Google exige en un Event para no marcarlo como crítico. */
const OBLIGATORIOS = ['name', 'startDate', 'location'];

const SITE = 'https://quimbara.org';

function* htmls(dir) {
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) yield* htmls(p);
    else if (entrada.endsWith('.html')) yield p;
  }
}

/**
 * Recorre el grafo completo. Un Event puede venir anidado en `about`,
 * `mentions`, `@graph`, `subEvent`, `itemListElement`... y Google los ve todos.
 */
function* nodos(v) {
  if (Array.isArray(v)) { for (const x of v) yield* nodos(x); return; }
  if (v && typeof v === 'object') {
    yield v;
    for (const x of Object.values(v)) yield* nodos(x);
  }
}

/**
 * ¿La URL interna que declara el nodo existe realmente en el dist?
 *
 * OJO con los separadores: esto corre en Windows (local) y en ubuntu (CI).
 * Partimos la ruta en segmentos y dejamos que join() ponga el separador que
 * toque. Concatenar '\' a mano funcionaba local y habría marcado TODAS las
 * URLs como rotas en el workflow.
 */
function urlRota(url) {
  if (typeof url !== 'string' || !url.startsWith(SITE)) return false;
  const segmentos = url.slice(SITE.length).split(/[?#]/)[0].split('/').filter(Boolean);
  const base = join(DIST, ...segmentos);
  return !(existsSync(join(base, 'index.html')) || existsSync(`${base}.html`) || existsSync(base));
}

if (!existsSync(DIST)) {
  console.error(`No existe ${DIST}. Corre "npm run build" primero.`);
  process.exit(1);
}

const problemas = new Map(); // firma -> { n, ejemplos[] }
let paginas = 0, bloques = 0, eventos = 0;

function anota(firma, pagina, detalle) {
  if (!problemas.has(firma)) problemas.set(firma, { n: 0, ejemplos: [] });
  const p = problemas.get(firma);
  p.n++;
  if (p.ejemplos.length < 5) p.ejemplos.push(`${pagina}  →  ${detalle}`);
}

for (const file of htmls(DIST)) {
  paginas++;
  const pagina = file.replace(DIST, '').replace(/\\/g, '/');
  const html = readFileSync(file, 'utf8');
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    bloques++;
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (err) {
      anota('JSON-LD que no parsea', pagina, err.message);
      continue;
    }
    for (const n of nodos(data)) {
      const tipos = [].concat(n['@type'] ?? []);
      if (!tipos.some(t => TIPOS_EVENTO.has(t))) continue;
      eventos++;

      const falta = OBLIGATORIOS.filter(c => !n[c]);
      if (falta.length) {
        anota(`${tipos.join('+')} sin ${falta.join(', ')}`, pagina, n.name ?? n['@id'] ?? '?');
      }
      if (urlRota(n.url)) {
        anota(`${tipos.join('+')} apuntando a una URL que no existe`, pagina, n.url);
      }
    }
  }
}

console.log(`Auditadas ${paginas} páginas · ${bloques} bloques JSON-LD · ${eventos} nodos Event`);

if (problemas.size === 0) {
  console.log('OK — todos los nodos Event llevan name, startDate y location, y sus URLs existen.');
  process.exit(0);
}

console.error('\nProblemas de datos estructurados:');
for (const [firma, p] of problemas) {
  console.error(`\n  [${p.n} ${p.n === 1 ? 'caso' : 'casos'}] ${firma}`);
  for (const e of p.ejemplos) console.error(`      ${e}`);
}
process.exit(1);
