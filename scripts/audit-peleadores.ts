/**
 * audit-peleadores.ts — auditoría de la base de peleadores.
 *
 *   npm run audit:peleadores
 *
 * Sale con código != 0 si hay ERRORES, para poder usarlo en CI y en el
 * workflow semanal (si UFC.com cambia el HTML y el parser se rompe, esto
 * lo detecta antes de que llegue a producción).
 *
 * ERROR = bloquea. Un peleador rankeado que no puede renderizarse, un
 *         dato fuera de rango fisiológico, o el dataset stale.
 * WARN  = trabajo editorial pendiente. No bloquea el build.
 */

import { statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  _todosParaAuditoria,
  getParesComparables,
  apeIndexPlausible,
  PeleadorSchema,
  type Peleador,
} from '../src/lib/peleadores.ts';
import { getParesPublicados, getParesEnListaBlanca } from '../src/lib/comparar.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIAS_FRESCURA = 14; // el pipeline corre semanal; 14d = dos ciclos perdidos

const errores: string[] = [];
const avisos: string[] = [];

const TODOS = _todosParaAuditoria();
const rankeados = TODOS.filter(p => p.ranking !== null);
const comparables = TODOS.filter(p => p.comparable);

const lista = (ps: Peleador[], n = 12) =>
  ps.slice(0, n).map(p => `      · ${p.slug}`).join('\n') +
  (ps.length > n ? `\n      … y ${ps.length - n} más` : '');

// ── 1. Frescura del dataset ──────────────────────────────────────────
try {
  const f = statSync(resolve(__dirname, '../src/data/fighters.json'));
  const dias = Math.floor((Date.now() - f.mtimeMs) / 86_400_000);
  if (dias > DIAS_FRESCURA) {
    errores.push(
      `fighters.json tiene ${dias} días sin actualizarse (límite ${DIAS_FRESCURA}).\n` +
      `      Corre: npm run data:all`
    );
  } else {
    console.log(`  ✓ dataset actualizado hace ${dias} día${dias === 1 ? '' : 's'}`);
  }
} catch {
  errores.push('No se pudo leer src/data/fighters.json');
}

// ── 2. Cobertura de rankeados ────────────────────────────────────────
// Que falte UN peleador es atrición normal (UFC.com no siempre publica
// el alcance de un debutante). Que falte el 10% significa que el parser
// se rompió — eso sí bloquea.
const UMBRAL_COBERTURA = 0.9;
const rankeadosRotos = rankeados.filter(p => !p.comparable);
const cobertura = rankeados.length ? 1 - rankeadosRotos.length / rankeados.length : 1;

if (cobertura < UMBRAL_COBERTURA) {
  errores.push(
    `Cobertura de rankeados en ${(cobertura * 100).toFixed(1)}% (mínimo ${UMBRAL_COBERTURA * 100}%).\n` +
    `      Caída así de grande = el parser de UFC.com probablemente se rompió.\n` +
    `      Revisa scripts/fetch-ufc-data.ts:\n${lista(rankeadosRotos)}`
  );
} else {
  console.log(`  ✓ cobertura de rankeados ${(cobertura * 100).toFixed(1)}%`);
  if (rankeadosRotos.length) {
    avisos.push(
      `${rankeadosRotos.length} rankeado(s) sin medidas completas — excluidos del render:\n` +
      lista(rankeadosRotos, 8)
    );
  }
}

// ── 3. Outliers físicos (ya auto-excluidos por `comparable`) ─────────
const outliers = TODOS.filter(p => {
  if (p.comparable) return false;
  const { altura_cm, alcance_cm, ape_index } = p.fisico;
  return altura_cm !== null && alcance_cm !== null && !apeIndexPlausible(ape_index);
});
if (outliers.length) {
  avisos.push(
    `${outliers.length} peleador(es) con ape index implausible — excluidos automáticamente.\n` +
    `      Casi siempre es un dato mal publicado en UFC.com, no un peleador real:\n` +
    outliers.slice(0, 10).map(p =>
      `      · ${p.slug.padEnd(26)} ${p.fisico.altura_cm}cm / ${p.fisico.alcance_cm}cm ` +
      `(ape ${p.fisico.ape_index! > 0 ? '+' : ''}${p.fisico.ape_index})`
    ).join('\n')
  );
} else {
  console.log('  ✓ sin outliers físicos');
}

// ── 4. Validación de schema ──────────────────────────────────────────
let fallosSchema = 0;
const muestraFallos: string[] = [];
for (const p of comparables) {
  const r = PeleadorSchema.safeParse(p);
  if (!r.success) {
    fallosSchema++;
    if (muestraFallos.length < 5) {
      muestraFallos.push(`      · ${p.slug}: ${r.error.issues[0]?.message ?? 'inválido'}`);
    }
  }
}
if (fallosSchema) {
  errores.push(`${fallosSchema} peleador(es) fallan el schema Zod:\n${muestraFallos.join('\n')}`);
} else {
  console.log(`  ✓ ${comparables.length} comparables pasan el schema`);
}

// ── 5. Trabajo editorial pendiente ───────────────────────────────────
const sinArma = rankeados.filter(p => !p.arma);
if (sinArma.length) {
  avisos.push(
    `${sinArma.length} de ${rankeados.length} rankeados sin campo "arma".\n` +
    `      Sin arma la carta se ve como ficha de Wikipedia:\n${lista(sinArma, 8)}`
  );
}

const armaSinRevisar = TODOS.filter(p => p.arma && !p.armaRevisada);
if (armaSinRevisar.length) {
  avisos.push(
    `${armaSinRevisar.length} arma(s) vienen del seed inicial y falta reescribirlas.\n` +
    `      Edita src/data/peleadores-editorial.json y pon armaRevisada:true:\n` +
    armaSinRevisar.slice(0, 8).map(p => `      · ${p.slug.padEnd(26)} "${p.arma}"`).join('\n') +
    (armaSinRevisar.length > 8 ? `\n      … y ${armaSinRevisar.length - 8} más` : '')
  );
}

// ── Campos de la carta ───────────────────────────────────────────────
const sinNacimiento = rankeados.filter(p => !p.nacimiento);
const sinBandera = rankeados.filter(p => !p.pais.iso);
const conEdad = rankeados.length - sinNacimiento.length;
const conBandera = rankeados.length - sinBandera.length;

console.log(
  `  ✓ carta: edad ${conEdad}/${rankeados.length} · bandera ${conBandera}/${rankeados.length}`
);

if (sinNacimiento.length) {
  avisos.push(
    `${sinNacimiento.length} rankeado(s) sin fecha de nacimiento — la carta omite EDAD:\n` +
    lista(sinNacimiento, 6)
  );
}
if (sinBandera.length) {
  avisos.push(
    `${sinBandera.length} rankeado(s) sin país resuelto — la carta omite la bandera.\n` +
    `      Se prefiere omitirla antes que mostrar una equivocada. Para forzar\n` +
    `      uno, poné "pais": "RU" en src/data/peleadores-editorial.json:\n` +
    lista(sinBandera, 6)
  );
}

// ── 6. Afirmaciones editoriales que caducaron ────────────────────────
// El texto generado sale de datos vivos, así que no puede quedar stale.
// El editorial y el `arma` SÍ: "invicto" deja de ser cierto en cuanto el
// peleador pierde. Este chequeo agarra justamente eso.
const RECLAMOS = [/\binvicto\b/i, /\binvicta\b/i, /\bsin derrotas\b/i, /\bcero derrotas\b/i];

const armaCaducada = TODOS.filter(p => {
  if (!p.arma || p.record.derrotas === null) return false;
  return p.record.derrotas > 0 && RECLAMOS.some(r => r.test(p.arma!));
});

const editorialCaducado: string[] = [];
for (const par of getParesPublicados()) {
  const claim = RECLAMOS.some(r => r.test(par.editorial));
  if (!claim) continue;
  // Si el editorial dice "invicto" pero NINGUNO de los dos lo está, está mal
  const hayInvicto = [par.a, par.b].some(p => p.record.derrotas === 0);
  if (!hayInvicto) editorialCaducado.push(par.slug);
}

if (armaCaducada.length || editorialCaducado.length) {
  const partes: string[] = [];
  if (armaCaducada.length) {
    partes.push(
      `${armaCaducada.length} arma(s) afirman "invicto" sobre alguien que ya perdió:\n` +
      armaCaducada.slice(0, 6).map(p =>
        `      · ${p.slug.padEnd(24)} ${p.record.texto}  "${p.arma}"`
      ).join('\n')
    );
  }
  if (editorialCaducado.length) {
    partes.push(
      `${editorialCaducado.length} editorial(es) del comparador afirman "invicto" sin que\n` +
      `      ninguno de los dos peleadores lo esté:\n` +
      editorialCaducado.map(s => `      · ${s}`).join('\n')
    );
  }
  errores.push(partes.join('\n\n      '));
} else {
  console.log('  ✓ sin afirmaciones editoriales caducadas');
}

// ── 7. Historial de peleas (Wikipedia) ───────────────────────────────
const PELEAS = JSON.parse(
  readFileSync(resolve(__dirname, '../src/data/peleadores-peleas.json'), 'utf8')
) as {
  peleadores: Record<string, { recordWiki: string; desgloseCuadra: boolean; peleas: unknown[] }>;
  sinPagina: string[];
};

const conHistorial = rankeados.filter(p => PELEAS.peleadores[p.slug]);
const coberturaHist = rankeados.length ? conHistorial.length / rankeados.length : 0;
const totalPeleas = Object.values(PELEAS.peleadores).reduce((n, o) => n + o.peleas.length, 0);

console.log(
  `  ✓ historial: ${conHistorial.length}/${rankeados.length} rankeados ` +
  `(${(coberturaHist * 100).toFixed(1)}%) · ${totalPeleas} peleas`
);

const sinHistorial = rankeados.filter(p => !PELEAS.peleadores[p.slug]);
if (sinHistorial.length) {
  avisos.push(
    `${sinHistorial.length} rankeado(s) sin historial de peleas.\n` +
    `      Corre: npm run data:peleas\n${lista(sinHistorial, 6)}`
  );
}

/**
 * Wikipedia va detrás de UFC.com para algunos peleadores. Importa porque el
 * timeline se dibuja con Wikipedia: si va atrasada, al peleador le falta su
 * última pelea en el gráfico aunque el récord de la ficha esté bien.
 */
const timelineAtrasado = conHistorial.filter(p => {
  const w = PELEAS.peleadores[p.slug].recordWiki.split('-').map(Number);
  return p.record.victorias !== null && w[0] !== undefined && w[0] !== p.record.victorias;
});
if (timelineAtrasado.length) {
  avisos.push(
    `${timelineAtrasado.length} timeline(s) desfasados respecto a UFC.com.\n` +
    `      El récord de la ficha es correcto (viene de UFC.com); es el timeline\n` +
    `      el que le falta la pelea más reciente porque Wikipedia no la tiene:\n` +
    timelineAtrasado.slice(0, 6).map(p =>
      `      · ${p.slug.padEnd(24)} wiki ${PELEAS.peleadores[p.slug].recordWiki.padEnd(8)} · ufc ${p.record.texto}`
    ).join('\n')
  );
}

const desgloseDescartado = Object.entries(PELEAS.peleadores).filter(([, o]) => !o.desgloseCuadra);
if (desgloseDescartado.length) {
  avisos.push(
    `${desgloseDescartado.length} desglose(s) ko/sub/dec descartados: el recordbox de\n` +
    `      Wikipedia no cuadra con su propia tabla. La carta omite el desglose\n` +
    `      para estos en vez de mostrar números que no suman.`
  );
}

// ── Resumen ──────────────────────────────────────────────────────────
const pares = getParesComparables();
const porRareza = comparables.reduce<Record<string, number>>((acc, p) => {
  acc[p.rareza] = (acc[p.rareza] ?? 0) + 1;
  return acc;
}, {});

console.log('\n─── COBERTURA ─────────────────────────────────────────');
console.log(`  peleadores totales      ${TODOS.length}`);
console.log(`  comparables             ${comparables.length}  (altura + alcance válidos)`);
console.log(`  rankeados               ${rankeados.length}`);
console.log(`  pares con sentido       ${pares.length}  (misma división, ranking ±5)`);
console.log(`  con arma escrita        ${TODOS.filter(p => p.arma).length}`);
console.log('\n  rareza de cartas:');
for (const r of ['legendaria', 'epica', 'rara', 'comun'] as const) {
  console.log(`    ${r.padEnd(12)} ${porRareza[r] ?? 0}`);
}

const lb = getParesEnListaBlanca();
const pub = getParesPublicados();
console.log('\n  comparador:');
console.log(`    en lista blanca   ${lb.length}`);
console.log(`    publicados        ${pub.length}  (con editorial)`);
console.log(`    esperando editorial ${lb.length - pub.length}`);
const sinRevisar = pub.filter(p => !p.editorialRevisada).length;
if (sinRevisar) {
  avisos.push(
    `${sinRevisar} editorial(es) del comparador vienen de borrador y falta pasarlos\n` +
    `      por tu voz. Edita src/data/pares-publicados.json y pon editorialRevisada:true.`
  );
}

if (avisos.length) {
  console.log('\n─── AVISOS ────────────────────────────────────────────');
  avisos.forEach(a => console.log(`  ! ${a}\n`));
}

if (errores.length) {
  console.log('─── ERRORES ───────────────────────────────────────────');
  errores.forEach(e => console.log(`  ✗ ${e}\n`));
  console.log(`Auditoría FALLA: ${errores.length} error(es).\n`);
  process.exit(1);
}

console.log('\nAuditoría OK.\n');
