// scripts/rag-chunk.mjs
//
// Trocea el contenido de Quimbara en chunks listos para embeddings.
//
//   node scripts/rag-chunk.mjs            → estadísticas + muestra (no escribe nada)
//   node scripts/rag-chunk.mjs --write    → escribe .rag/chunks.jsonl
//   node scripts/rag-chunk.mjs --audit    → lista los chunks problemáticos
//
// POR QUÉ TROCEAR ASÍ
// Un motor de respuesta no indexa páginas, indexa fragmentos, y cada fragmento
// compite solo. La regla es que un chunk debe entenderse SIN el contexto de la
// página: si empieza con "Su récord es de..." nadie sabe de quién habla y ese
// fragmento está muerto para la recuperación.
//
// Por eso aquí NO se corta por número de caracteres (eso parte frases y arruina
// los vectores) sino por estructura: cada unidad semántica es un chunk, y a cada
// chunk se le inyecta el sujeto en la primera frase.
//
// Este script sirve para dos cosas a la vez:
//   1. Alimentar el RAG propio (buscador semántico interno).
//   2. AUDITAR el contenido: si un chunk sale sin sujeto, es que la página
//      también se lo va a dar así de mal a GPTBot. El modo --audit los lista.

// Se ejecuta con tsx (npm run rag:chunk) para poder reutilizar el mapa de
// divisiones del sitio en vez de duplicarlo aquí: el chunk debe decir
// exactamente lo mismo que el HTML, o la auditoría miente.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { divLabels, isFemale } from '../src/data/divisions.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'src', 'data');
const BLOG = join(ROOT, 'src', 'content', 'blog');
const SITE = 'https://quimbara.org';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const AUDIT = args.includes('--audit');

const load = f => JSON.parse(readFileSync(join(DATA, f), 'utf8'));

// ── Helpers ────────────────────────────────────────────────────────────────
const cmDeAltura = h => {
  const m = String(h || '').match(/(\d+)'\s*(\d+)/);
  return m ? Math.round(+m[1] * 30.48 + +m[2] * 2.54) : null;
};
const cmDePulgadas = r => {
  const m = String(r || '').match(/(\d+)/);
  return m ? Math.round(+m[1] * 2.54) : null;
};
const kgDeLibras = w => {
  const m = String(w || '').match(/(\d+)/);
  return m ? Math.round(+m[1] * 0.4536) : null;
};
const palabras = t => t.trim().split(/\s+/).filter(Boolean).length;

const chunks = [];
const add = (id, tipo, url, titulo, texto, meta = {}) => {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio) return;
  chunks.push({ id, tipo, url, titulo, texto: limpio, palabras: palabras(limpio), ...meta });
};

// ── 1. Peleadores ──────────────────────────────────────────────────────────
// Cada ficha da 1-2 chunks. El biométrico es el que responde el 70% de las
// impresiones reales de GSC ("cuánto mide X", "alcance de X").
const fighters = load('fighters.json');
const indexables = fighters.filter(
  f => f.rank === 'C' || (!isNaN(Number(f.rank)) && Number(f.rank) <= 15) || f.img
);

for (const f of indexables) {
  const url = `${SITE}/peleadores/${f.slug}/`;
  const alt = cmDeAltura(f.height);
  const alc = cmDePulgadas(f.reach);
  const kg = kgDeLibras(f.weight);
  // Mismo criterio que la ficha: división en español y género correcto.
  const fem = isFemale(f.div || '');
  const divEs = f.div ? (divLabels[f.div] ?? f.div) : '';
  const rol = f.rank === 'C'
    ? `${fem ? 'campeona' : 'campeón'} de UFC ${divEs}`
    : f.rank
    ? `${fem ? 'la número' : 'el número'} ${f.rank} de UFC ${divEs}`
    : divEs
    ? `${fem ? 'peleadora' : 'peleador'} de UFC ${divEs}`
    : `${fem ? 'peleadora' : 'peleador'} de UFC`;

  // Chunk biométrico: sujeto explícito, unidades métricas primero, autocontenido.
  const bio = [
    `${f.name}${f.nick ? ` "${f.nick}"` : ''} es ${rol}.`,
    alt && `Mide ${alt} cm (${f.height}) de estatura.`,
    alc && `Su alcance es de ${alc} cm (${f.reach}).`,
    kg && `Compite con un peso de ${kg} kg (${f.weight}).`,
    f.stance && `Pelea en guardia ${f.stance}.`,
    f.from && `Es de ${f.from}.`,
    f.team && `Entrena en ${f.team}.`,
  ].filter(Boolean).join(' ');
  add(`peleador:${f.slug}:datos`, 'peleador', url, `${f.name} — datos físicos`, bio, { slug: f.slug, division: f.div });

  // Chunk de récord: repite el nombre a propósito. Redundante al leer, esencial
  // al recuperar, porque este fragmento viaja solo.
  if (f.rec && f.rec !== '—') {
    const [v, d, e] = f.rec.split('-').map(Number);
    const total = v + d + (e || 0);
    const pct = total ? Math.round((v / total) * 100) : 0;
    const rec = [
      `El récord de ${f.name} es de ${v} victorias, ${d} derrotas${e ? ` y ${e} empates` : ''} (${f.rec}),`,
      `con un ${pct}% de victorias en ${total} peleas profesionales.`,
      f.ufcRec && f.ufcRec !== f.rec ? `Su récord dentro de UFC es ${f.ufcRec}.` : '',
      Array.isArray(f.form) && f.form.length ? `Sus últimas ${f.form.length} peleas: ${f.form.join('-')} (de más reciente a más antigua).` : '',
    ].filter(Boolean).join(' ');
    add(`peleador:${f.slug}:record`, 'peleador', url, `${f.name} — récord`, rec, { slug: f.slug, division: f.div });
  }
}

// ── 2. Eventos ─────────────────────────────────────────────────────────────
const eventos = load('events-all.json');
for (const e of eventos) {
  const url = `${SITE}/eventos/${e.slug}/`;
  const cartel = (e.fightCard || []).slice(0, 6).map(b => `${b.f1} vs. ${b.f2}${b.weightClass ? ` (${b.weightClass})` : ''}`);
  const texto = [
    `${e.name} se celebra el ${e.dateLabel || e.date}${e.loc ? ` en ${e.loc}` : ''}.`,
    e.main && e.main !== 'TBD' ? `La pelea principal es ${e.main}.` : 'La pelea principal aún no está confirmada.',
    cartel.length ? `Cartelera: ${cartel.join('; ')}.` : '',
  ].filter(Boolean).join(' ');
  add(`evento:${e.slug}`, 'evento', url, e.name, texto, { slug: e.slug, fecha: e.date });
}

// ── 3. Posts del blog ──────────────────────────────────────────────────────
// Un chunk por sección H2 (unidad semántica natural) + uno por takeaway, que ya
// vienen escritos como afirmaciones autocontenidas: son los mejores chunks del
// sitio y por eso se indexan por separado.
if (existsSync(BLOG)) {
  for (const file of readdirSync(BLOG).filter(f => /\.mdx?$/.test(f))) {
    const raw = readFileSync(join(BLOG, file), 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) continue;
    const [, fm, cuerpo] = m;
    const slug = file.replace(/\.mdx?$/, '');
    const url = `${SITE}/blog/${slug}/`;
    const titulo = (fm.match(/^title:\s*"?(.+?)"?\s*$/m) || [])[1] || slug;

    // Takeaways: bloque YAML de líneas "  - "...". El lookahead ingenuo
    // (?=\n\w|$) fallaba cuando el bloque cerraba el frontmatter, y se perdían
    // los mejores chunks del sitio. Se captura la lista completa por indentación.
    const tkBlock = fm.match(/^takeaways:[ \t]*\n((?:[ \t]+-[ \t].*(?:\n|$))+)/m);
    if (tkBlock) {
      const items = [...tkBlock[1].matchAll(/^[ \t]*-[ \t]*"?(.+?)"?[ \t]*$/gm)].map(x => x[1]);
      items.forEach((t, i) =>
        add(`post:${slug}:takeaway:${i}`, 'takeaway', url, `${titulo} — clave ${i + 1}`, t, { slug })
      );
    }

    // Secciones por H2. Se limpia MDX (JSX, imágenes, enlaces) para dejar prosa.
    const limpio = cuerpo
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*/g, '');

    const secciones = limpio.split(/^##\s+/m).slice(1);
    secciones.forEach((sec, i) => {
      const [encabezado, ...resto] = sec.split('\n');
      const cuerpoSec = resto.join(' ').trim();
      if (palabras(cuerpoSec) < 20) return;
      // El título del post se antepone: sin esto, "El segundo round que no supo
      // cerrar" no dice de qué pelea habla.
      add(
        `post:${slug}:h2:${i}`,
        'articulo',
        `${url}#${slugify(encabezado)}`,
        `${titulo} — ${encabezado.trim()}`,
        `${encabezado.trim()}. ${cuerpoSec}`.slice(0, 2000),
        { slug }
      );
    });
  }
}

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

// ── Informe ────────────────────────────────────────────────────────────────
const porTipo = chunks.reduce((a, c) => ((a[c.tipo] = (a[c.tipo] || 0) + 1), a), {});
const media = Math.round(chunks.reduce((a, c) => a + c.palabras, 0) / chunks.length);

console.log(`\n📦 ${chunks.length} chunks · media ${media} palabras\n`);
for (const [t, n] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(6)}  ${t}`);
}

// Auditoría: un chunk que empieza por pronombre o que es demasiado corto es un
// chunk que ningún motor va a poder usar. Son los mismos que fallan en el HTML.
// \b al final: sin él, "Leon Edwards" y "Lance Benoist" se marcaban como
// pronombres ("le", "la") y ensuciaban la auditoría con falsos positivos.
const PRONOMBRES = /^(su|sus|este|esta|esto|ese|esa|le|lo|la|ambos|aquí|allí|además|también|así)\b/i;
const sospechosos = chunks.filter(c => PRONOMBRES.test(c.texto) || c.palabras < 12);

// Problemas de DATOS que el troceado deja a la vista: si el chunk sale mal,
// la ficha HTML también. Estos dos salen de ejecutar el script sobre el corpus.
const sinDivision = chunks.filter(c => c.tipo === 'peleador' && /de UFC \./.test(c.texto));
const generoMal = chunks.filter(
  c => c.tipo === 'peleador' && /es peleador de UFC Women/.test(c.texto)
);

console.log(`\n⚠️  ${sospechosos.length} chunks sin sujeto claro o demasiado cortos (${((sospechosos.length / chunks.length) * 100).toFixed(1)}%)`);
if (sinDivision.length) console.log(`⚠️  ${sinDivision.length} fichas sin división ("es peleador de UFC ." → frase rota)`);
if (generoMal.length) console.log(`⚠️  ${generoMal.length} peleadoras descritas como "peleador" (divisiones Women's)`);
if (AUDIT && sospechosos.length) {
  console.log('\n— Chunks a revisar —');
  sospechosos.slice(0, 25).forEach(c => console.log(`   [${c.palabras}p] ${c.id}\n         "${c.texto.slice(0, 110)}…"`));
}

console.log('\n— Muestra —');
['peleador', 'evento', 'takeaway', 'articulo'].forEach(t => {
  const c = chunks.find(x => x.tipo === t);
  if (c) console.log(`\n  [${t}] ${c.id}\n  ${c.texto.slice(0, 220)}${c.texto.length > 220 ? '…' : ''}`);
});

if (WRITE) {
  const dir = join(ROOT, '.rag');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'chunks.jsonl'), chunks.map(c => JSON.stringify(c)).join('\n') + '\n');
  console.log(`\n✓ .rag/chunks.jsonl (${chunks.length} chunks)`);
} else {
  console.log('\n(dry-run — usa --write para volcar .rag/chunks.jsonl, --audit para ver los problemáticos)');
}
