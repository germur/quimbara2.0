/**
 * gen-redirects-comparador.mjs — genera los 301 del comparador.
 *
 *   npm run gen:redirects
 *
 * Cada par del comparador tiene dos URLs posibles (A-vs-B y B-vs-A). La
 * canónica es el orden ALFABÉTICO; la inversa hace 301 duro a la canónica.
 * El blueprint es explícito en que esto va con redirect, no con canonical
 * tag — es lo que evita repetir el desastre de /peleador/ vs /peleadores/.
 *
 * Reescribe SOLO el bloque delimitado al final de public/_redirects. Las
 * reglas escritas a mano arriba no se tocan. Idempotente.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUTA_REDIRECTS = resolve(__dirname, '../public/_redirects');
const RUTA_PARES = resolve(__dirname, '../src/data/pares-publicados.json');

const INICIO = '# >>> COMPARADOR: generado por npm run gen:redirects — no editar a mano';
const FIN = '# <<< COMPARADOR';

const { pares } = JSON.parse(readFileSync(RUTA_PARES, 'utf8'));

const lineas = [];
let publicados = 0;
let ignorados = 0;

for (const [slug, meta] of Object.entries(pares)) {
  // Sin editorial no hay página, así que no hay a dónde redirigir.
  if (!meta.editorial) { ignorados++; continue; }

  const [a, b] = slug.split('-vs-');
  if (!a || !b) continue;

  // Verificar que el slug de la lista esté en orden alfabético
  const canonico = a < b ? `${a}-vs-${b}` : `${b}-vs-${a}`;
  if (canonico !== slug) {
    console.warn(`  ! ${slug} no está en orden alfabético — se esperaba ${canonico}. Ignorado.`);
    continue;
  }

  const inverso = `${b}-vs-${a}`;
  lineas.push(`/comparar/${inverso}/`.padEnd(56) + `/comparar/${slug}/`.padEnd(56) + '301');
  publicados++;
}

const bloque = [
  INICIO,
  `# ${publicados} pares publicados · regenerado ${new Date().toISOString().slice(0, 10)}`,
  '',
  ...lineas,
  FIN,
].join('\n');

let contenido = readFileSync(RUTA_REDIRECTS, 'utf8');

const iIni = contenido.indexOf(INICIO);
const iFin = contenido.indexOf(FIN);

if (iIni !== -1 && iFin !== -1) {
  contenido = contenido.slice(0, iIni) + bloque + contenido.slice(iFin + FIN.length);
} else {
  contenido = contenido.trimEnd() + '\n\n' + bloque + '\n';
}

writeFileSync(RUTA_REDIRECTS, contenido);

console.log(`✓ ${publicados} redirect(s) 301 escritos en public/_redirects`);
if (ignorados) console.log(`  ${ignorados} par(es) sin editorial — no generan página ni redirect`);
