/**
 * gen-og-cartas.ts — genera las OG images de las cartas.
 *
 *   npm run gen:og
 *
 * Escribe public/og/cartas/{slug}.png para cada rankeado. Cuando alguien
 * comparte la ficha de un peleador, aparece su carta: distribución gratis y
 * la ruta más directa a búsquedas de marca, que es la única KPI que importa.
 *
 * ─── POR QUÉ 1200x630 Y NO LA CARTA SOLA ─────────────────────────────
 * La carta es 2:3 vertical. Twitter y WhatsApp recortan las verticales, así
 * que se compone: la carta a la izquierda y nombre + arma + récord a la
 * derecha, sobre un lienzo horizontal. Se ve como preview de enlace en vez
 * de como una imagen cortada.
 *
 * ─── LÍMITE DE LA RASTERIZACIÓN ──────────────────────────────────────
 * librsvg (dentro de sharp) no carga webfonts ni tiene fuente de emoji. Por
 * eso cartaSvg() se llama con paraRasterizar:true, que cae a Impact/serif/
 * monospace y cambia la bandera emoji por el código ISO. Verificado: el
 * fallback de Impact es visualmente cercano a Big Shoulders.
 */

import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getPeleadores } from '../src/lib/peleadores.ts';
import { cartaSvg, datosCartaDesde, CARTA, COLOR, ESTILO, partirArma } from '../src/lib/carta.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR_SALIDA = resolve(__dirname, '../public/og/cartas');

const OG = { ancho: 1200, alto: 630 };

const args = process.argv.slice(2);
const SOLO = args.find(a => a.startsWith('--slug='))?.split('=')[1];
const LIMPIAR = args.includes('--limpiar');

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function composicionOg(p: ReturnType<typeof getPeleadores>[number]): string {
  const d = datosCartaDesde(p);
  const est = ESTILO[p.rareza];
  // La carta va incrustada sin raíz, dentro de un <g> escalado
  const interior = cartaSvg(d, { paraRasterizar: true, conRaiz: false });

  const escala = 540 / CARTA.alto;      // la carta ocupa 540px de alto
  const cartaX = 70;
  const cartaY = (OG.alto - CARTA.alto * escala) / 2;

  const textoX = cartaX + CARTA.ancho * escala + 70;
  const anchoTexto = OG.ancho - textoX - 60;

  const armaLineas = d.arma ? partirArma(d.arma, 30) : [];
  const nombreSize = p.nombre.length > 16 ? 54 : 66;

  /**
   * Sin `arma` el lado derecho quedaba con un vacío grande entre el apodo y
   * el récord. Se centra verticalmente el bloque de texto en su lugar.
   */
  const desplazaSinArma = armaLineas.length ? 0 : 70;

  const F = { display: 'Impact, sans-serif', serif: 'serif', mono: 'monospace' };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.ancho}" height="${OG.alto}" viewBox="0 0 ${OG.ancho} ${OG.alto}">
  <rect width="${OG.ancho}" height="${OG.alto}" fill="${COLOR.fondo}"/>

  <g transform="translate(${cartaX}, ${cartaY}) scale(${escala})">${interior}</g>

  <g>
    <rect x="${textoX}" y="${150 + desplazaSinArma}" width="10" height="10" fill="${est.acento}"/>
    <text x="${textoX + 20}" y="${160 + desplazaSinArma}" fill="${est.acento}"
          style="font-family:${F.mono};font-size:15px;font-weight:700;letter-spacing:0.2em;">${esc(est.label.toUpperCase())}</text>
    <text x="${textoX + 20 + est.label.length * 12 + 30}" y="${160 + desplazaSinArma}" fill="${COLOR.textoSuave}"
          style="font-family:${F.mono};font-size:15px;letter-spacing:0.14em;">${esc(p.divisionLabel.toUpperCase())}</text>

    <text x="${textoX}" y="${nombreSize + 190 + desplazaSinArma}" fill="${COLOR.texto}"
          style="font-family:${F.display};font-size:${nombreSize}px;font-weight:900;letter-spacing:-0.01em;text-transform:uppercase;">${esc(p.nombre)}</text>

    ${p.apodo
      ? `<text x="${textoX}" y="${nombreSize + 230 + desplazaSinArma}" fill="${COLOR.textoSuave}" style="font-family:${F.serif};font-size:26px;font-style:italic;">&#8220;${esc(p.apodo)}&#8221;</text>`
      : ''}

    ${armaLineas.length
      ? armaLineas.map((l, i) => `<text x="${textoX}" y="${nombreSize + 300 + i * 36}" fill="${COLOR.acid}" style="font-family:${F.serif};font-size:30px;font-style:italic;font-weight:600;">${esc(l)}</text>`).join('')
      : ''}

    <text x="${textoX}" y="${OG.alto - 110}" fill="${COLOR.texto}"
          style="font-family:${F.display};font-size:44px;font-weight:900;">${esc(p.record.texto ?? '—')}</text>
    <text x="${textoX}" y="${OG.alto - 85}" fill="${COLOR.textoSuave}"
          style="font-family:${F.mono};font-size:14px;letter-spacing:0.1em;">${d.desglose
            ? `KO ${d.desglose.koVictorias} &#183; SUB ${d.desglose.subVictorias} &#183; DEC ${d.desglose.decVictorias}`
            : 'R&#201;CORD PROFESIONAL'}</text>

    <text x="${textoX}" y="${OG.alto - 45}" fill="${COLOR.acid}"
          style="font-family:${F.mono};font-size:16px;font-weight:700;letter-spacing:0.24em;">QUIMBARA.ORG</text>
  </g>
  <rect x="0" y="${OG.alto - 5}" width="${OG.ancho}" height="5" fill="${est.acento}"/>
</svg>`;
}

// ─── Main ────────────────────────────────────────────────────────────

mkdirSync(DIR_SALIDA, { recursive: true });

if (LIMPIAR && existsSync(DIR_SALIDA)) {
  for (const f of readdirSync(DIR_SALIDA)) {
    if (f.endsWith('.png')) unlinkSync(resolve(DIR_SALIDA, f));
  }
  console.log('  directorio limpiado');
}

let objetivos = getPeleadores({ conRanking: true });
if (SOLO) objetivos = objetivos.filter(p => p.slug === SOLO);

console.log(`\nGenerando ${objetivos.length} OG image(s)…`);

let ok = 0, fallos = 0, bytes = 0;

for (const p of objetivos) {
  try {
    const svg = composicionOg(p);
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    writeFileSync(resolve(DIR_SALIDA, `${p.slug}.png`), png);
    bytes += png.length;
    ok++;
    if (ok % 40 === 0) console.log(`  ${ok}/${objetivos.length}…`);
  } catch (e) {
    console.log(`  ✗ ${p.slug}: ${(e as Error).message}`);
    fallos++;
  }
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`  generadas   ${ok}`);
if (fallos) console.log(`  fallos      ${fallos}`);
console.log(`  peso total  ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`  promedio    ${ok ? Math.round(bytes / ok / 1024) : 0} kb`);
console.log(`\nEn public/og/cartas/\n`);

if (fallos) process.exit(1);
