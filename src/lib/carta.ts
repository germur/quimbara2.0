/**
 * carta.ts — geometría y tokens de la carta coleccionable.
 *
 * ─── POR QUÉ LA CARTA ES SVG PURO Y NO HTML ──────────────────────────
 * Tiene que salir por tres caminos desde una sola fuente:
 *   1. Inline en /cartas/{slug}/  → nítida a cualquier tamaño
 *   2. PNG descargable            → canvas en el cliente
 *   3. OG image                   → rasterizada con sharp en el build
 * Si fuera HTML/CSS, el camino 3 necesitaría un motor de layout headless.
 * Siendo SVG, sharp la rasteriza directo.
 *
 * El costo es posicionar todo a mano en coordenadas. Vale la pena: las OG
 * images son distribución gratis y son la ruta más directa a búsquedas de
 * marca, que es la única KPI que importa.
 */

import type { Peleador, Rareza } from './peleadores';
import { calcularSilueta, type SiluetaGeom } from './silueta';
import { getHistorial } from './peleas';

export const CARTA = {
  ancho: 400,
  alto: 600, // ratio 2:3
} as const;

/**
 * Bandas verticales del layout. Definidas de una vez acá para que no se
 * desarme cuando se ajusta un bloque.
 *
 * Dependen de si el peleador tiene `arma` escrita: sin ella, el bloque de la
 * frase desaparece y quedarían ~86px de hueco muerto sobre el pie. En vez de
 * dejar el agujero, la silueta —que es la imagen protagonista— crece para
 * ocupar ese espacio y el resto baja.
 *
 * Ojo: esto NO es variar el layout por rareza. El brief pide explícitamente
 * que la rareza se distinga solo por marco y badge, y así es. Esto varía por
 * presencia de contenido, que es otra cosa.
 */
export function bandas(tieneArma: boolean) {
  const extra = tieneArma ? 0 : 36;
  return {
    marco: 8,
    topBar: 38,
    siluetaTop: 56,
    // 214 con arma: recortada respecto al alto natural (232) para darle aire
    // al bloque de la frase, que con dos líneas pisaba el pie.
    siluetaAlto: 214 + extra,
    nombre: 312 + extra,
    apodo: 336 + extra,
    divisor1: 356 + extra,
    fisicoLabel: 376 + extra,
    fisicoValor: 400 + extra,
    divisor2: 418 + extra,
    recordLabel: 434 + extra,
    recordValor: 464 + extra,
    recordDesglose: 480 + extra,
    divisor3: 496,
    armaLabel: 514,
    // Base del arma de UNA línea. Con dos líneas sube 10px y la segunda cae
    // 19px más abajo (534 y 553), dejando 27px hasta el pie en 580.
    armaTexto: 544,
    footer: 580,
  };
}

/** Bandas del caso con arma. Para medidas de referencia y compatibilidad. */
export const BANDA = bandas(true);

export interface EstiloRareza {
  label: string;
  /** Color del marco y del badge */
  acento: string;
  /** Marco doble para la rareza más alta */
  marcoDoble: boolean;
  grosorMarco: number;
  /** Badge relleno vs contorno */
  badgeRelleno: boolean;
}

/**
 * La diferencia entre rarezas está SOLO en el marco y el badge — el layout
 * no cambia. Es lo que pide el brief: la jerarquía tiene que leerse de un
 * vistazo sin que la carta se reorganice.
 *
 * Sin brillos animados ni holográficos falsos: premium por composición.
 */
export const ESTILO: Record<Rareza, EstiloRareza> = {
  legendaria: {
    label: 'Legendaria',
    acento: '#F2D928',
    marcoDoble: true,
    grosorMarco: 2.5,
    badgeRelleno: true,
  },
  epica: {
    label: 'Épica',
    acento: '#F2D928',
    marcoDoble: false,
    grosorMarco: 2,
    badgeRelleno: false,
  },
  rara: {
    label: 'Rara',
    acento: '#E2DDD0',
    marcoDoble: false,
    grosorMarco: 1.2,
    badgeRelleno: false,
  },
  comun: {
    label: 'Común',
    acento: '#3A3A3D',
    marcoDoble: false,
    grosorMarco: 1,
    badgeRelleno: false,
  },
};

export const COLOR = {
  fondo: '#0A0A0B',
  texto: '#F4F2EC',
  textoSuave: '#8a8b8f',
  divisor: 'rgba(244,242,236,0.14)',
  acid: '#F2D928',
} as const;

/** Columnas del bloque de datos físicos, centradas en el ancho útil. */
export function columnasFisico(n: number): number[] {
  const izq = 24, der = CARTA.ancho - 24;
  const ancho = (der - izq) / n;
  return Array.from({ length: n }, (_, i) => izq + ancho * i + ancho / 2);
}

/**
 * Escala para meter la silueta en su banda. La silueta vive en un espacio
 * de 232 unidades = 232 cm reales, así que escala 1 la deja a tamaño exacto.
 */
export function escalaSilueta(siluetaAlto: number = BANDA.siluetaAlto): number {
  return siluetaAlto / 232;
}

/**
 * Parte el `arma` en hasta dos líneas. Se corta por palabra, nunca a mitad.
 *
 * El ancho útil de la carta son 352px; a 18px de serif italic entran unos 34
 * caracteres. Con un límite más bajo se partían frases que cabían de sobra
 * en una sola línea.
 */
export function partirArma(arma: string, maxPorLinea = 34): string[] {
  if (arma.length <= maxPorLinea) return [arma];
  const palabras = arma.split(' ');
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    if ((actual + ' ' + p).trim().length <= maxPorLinea) {
      actual = (actual + ' ' + p).trim();
    } else {
      if (actual) lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.slice(0, 2);
}

// ─── Generación del SVG ──────────────────────────────────────────────

/**
 * Datos mínimos que la carta necesita. Desacoplado de `Peleador` a propósito:
 * así el script de OG images puede construirla sin arrastrar toda la capa.
 */
export interface DatosCarta {
  slug: string;
  nombre: string;
  apodo: string | null;
  rareza: Rareza;
  ranking: number | 'C' | null;
  divisionLabel: string;
  altura_cm: number | null;
  alcance_cm: number | null;
  peso_kg: number | null;
  edad: number | null;
  record: string | null;
  desglose: { koVictorias: number; subVictorias: number; decVictorias: number } | null;
  arma: string | null;
  banderaEmoji: string | null;
  paisIso: string | null;
}

/**
 * Arma los datos de la carta desde un Peleador.
 *
 * El desglose ko/sub/dec solo se incluye si Wikipedia lo tenía cuadrado con
 * su propia tabla (ver fetch-peleas.mjs). Preferimos omitir el bloque antes
 * que mostrar números que no suman el récord.
 */
export function datosCartaDesde(p: Peleador): DatosCarta {
  const hist = getHistorial(p.slug);
  return {
    slug: p.slug,
    nombre: p.nombre,
    apodo: p.apodo,
    rareza: p.rareza,
    ranking: p.ranking,
    divisionLabel: p.divisionLabel,
    altura_cm: p.fisico.altura_cm,
    alcance_cm: p.fisico.alcance_cm,
    peso_kg: p.fisico.peso_kg,
    edad: p.edad,
    record: p.record.texto,
    desglose: hist?.desglose ?? null,
    arma: p.arma,
    banderaEmoji: p.pais.bandera,
    paisIso: p.pais.iso,
  };
}

/** Escapa texto para XML. Los apodos traen comillas y los nombres apóstrofos. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface OpcionesSvg {
  /**
   * true cuando el destino es sharp/librsvg. Cambia dos cosas:
   *   · fuentes genéricas, porque las webfonts no están disponibles
   *   · el emoji de bandera se reemplaza por el código ISO, porque librsvg
   *     no tiene fuente de emoji y "🇺🇸" saldría como el texto "US"
   */
  paraRasterizar?: boolean;
  /** Envuelve en <svg>. false devuelve solo el contenido, para incrustar. */
  conRaiz?: boolean;
}

function fuentes(paraRasterizar: boolean) {
  return paraRasterizar
    ? { display: 'Impact, sans-serif', sans: 'sans-serif', serif: 'serif', mono: 'monospace' }
    : {
        display: "'Big Shoulders Display', Impact, sans-serif",
        sans: "'Manrope', sans-serif",
        serif: "'Newsreader', Georgia, serif",
        mono: "'JetBrains Mono', monospace",
      };
}

function siluetaSvg(sil: SiluetaGeom, acento: string): string {
  return `
    <line x1="${sil.spanX1}" x2="${sil.spanX2}" y1="${sil.spanY}" y2="${sil.spanY}" stroke="${acento}" stroke-width="${sil.spanW}" stroke-linecap="butt"/>
    <line x1="${sil.spanX1}" x2="${sil.spanX1}" y1="${sil.tickY1}" y2="${sil.tickY2}" stroke="${acento}" stroke-width="${sil.tickW}" stroke-linecap="${sil.tickCap}"/>
    <line x1="${sil.spanX2}" x2="${sil.spanX2}" y1="${sil.tickY1}" y2="${sil.tickY2}" stroke="${acento}" stroke-width="${sil.tickW}" stroke-linecap="${sil.tickCap}"/>
    <g fill="${COLOR.texto}" stroke="${COLOR.texto}" stroke-linejoin="round" stroke-linecap="round">
      <path d="${sil.brazoIzq}" fill="none" stroke-width="${sil.brazoW}"/>
      <path d="${sil.brazoDer}" fill="none" stroke-width="${sil.brazoW}"/>
      <path d="${sil.piernaIzq}" fill="none" stroke-width="${sil.piernaW}"/>
      <path d="${sil.piernaDer}" fill="none" stroke-width="${sil.piernaW}"/>
      <rect x="${sil.cuelloX}" y="${sil.cuelloY}" width="${sil.cuelloW}" height="${sil.cuelloH}" rx="${sil.cuelloR}"/>
      <path d="${sil.torso}" stroke-width="${sil.torsoSuavizado}"/>
      <ellipse cx="0" cy="${sil.cabezaCy}" rx="${sil.cabezaRx}" ry="${sil.cabezaRy}" stroke-width="0"/>
      <ellipse cx="${sil.pieIzqX}" cy="${sil.pieY}" rx="${sil.pieRx}" ry="${sil.pieRy}" stroke-width="0"/>
      <ellipse cx="${sil.pieDerX}" cy="${sil.pieY}" rx="${sil.pieRx}" ry="${sil.pieRy}" stroke-width="0"/>
    </g>`;
}

/**
 * Genera la carta como SVG. Fuente única para los tres destinos: inline en
 * la página, PNG del cliente y OG image del build.
 */
export function cartaSvg(d: DatosCarta, opts: OpcionesSvg = {}): string {
  const { paraRasterizar = false, conRaiz = true } = opts;
  const est = ESTILO[d.rareza];
  const F = fuentes(paraRasterizar);
  const W = CARTA.ancho, H = CARTA.alto;

  const armaLineas = d.arma ? partirArma(d.arma) : [];
  const tieneArma = armaLineas.length > 0;
  const B = bandas(tieneArma);

  const sil = calcularSilueta({
    alturaCm: d.altura_cm ?? 180,
    envergaduraCm: d.alcance_cm ?? undefined,
    pesoKg: d.peso_kg ?? undefined,
    marca: 'punta',
  });

  const fisicos = [
    { label: 'ALT', valor: d.altura_cm ? String(d.altura_cm) : '—', unidad: 'cm' },
    { label: 'ALC', valor: d.alcance_cm ? String(d.alcance_cm) : '—', unidad: 'cm' },
    { label: 'PESO', valor: d.peso_kg ? String(d.peso_kg) : '—', unidad: 'kg' },
    { label: 'EDAD', valor: d.edad !== null ? String(d.edad) : '—', unidad: 'años' },
  ];
  const cols = columnasFisico(fisicos.length);
  const rankLabel = d.ranking === 'C' ? 'CAMPEÓN' : d.ranking !== null ? `#${d.ranking}` : '';

  // Emoji en pantalla, código ISO al rasterizar
  const marcaPais = paraRasterizar ? (d.paisIso ?? '') : (d.banderaEmoji ?? '');

  const badge = est.badgeRelleno
    ? `<rect x="24" y="${BANDA.topBar - 12}" width="86" height="17" fill="${est.acento}" rx="2"/>
       <text x="67" y="${BANDA.topBar}" text-anchor="middle" fill="${COLOR.fondo}" style="font-family:${F.mono};font-size:9px;font-weight:700;letter-spacing:0.18em;">${esc(est.label.toUpperCase())}</text>`
    : `<rect x="24" y="${BANDA.topBar - 12}" width="70" height="17" fill="none" stroke="${est.acento}" stroke-width="1" rx="2"/>
       <text x="59" y="${BANDA.topBar}" text-anchor="middle" fill="${est.acento}" style="font-family:${F.mono};font-size:9px;font-weight:700;letter-spacing:0.18em;">${esc(est.label.toUpperCase())}</text>`;

  const contenido = `
  <rect x="0" y="0" width="${W}" height="${H}" fill="${COLOR.fondo}" rx="14"/>
  <rect x="${B.marco}" y="${B.marco}" width="${W - B.marco * 2}" height="${H - B.marco * 2}"
        fill="none" stroke="${est.acento}" stroke-width="${est.grosorMarco}" rx="9"/>
  ${est.marcoDoble
    ? `<rect x="${B.marco + 5}" y="${B.marco + 5}" width="${W - (B.marco + 5) * 2}" height="${H - (B.marco + 5) * 2}" fill="none" stroke="${est.acento}" stroke-width="0.8" opacity="0.5" rx="6"/>`
    : ''}

  ${badge}
  ${rankLabel
    ? `<text x="${est.badgeRelleno ? 120 : 104}" y="${B.topBar}" fill="${COLOR.textoSuave}" style="font-family:${F.mono};font-size:9px;font-weight:600;letter-spacing:0.14em;">${esc(rankLabel)}</text>`
    : ''}
  ${marcaPais
    ? `<text x="${W - 24}" y="${B.topBar + 2}" text-anchor="end" fill="${COLOR.textoSuave}" style="${paraRasterizar ? `font-family:${F.mono};font-size:11px;font-weight:700;letter-spacing:0.14em;` : 'font-size:19px;'}">${esc(marcaPais)}</text>`
    : ''}

  <g transform="translate(${W / 2}, ${B.siluetaTop}) scale(${escalaSilueta(B.siluetaAlto)})" opacity="0.96">
    ${siluetaSvg(sil, est.acento)}
  </g>

  <text x="${W / 2}" y="${B.nombre}" text-anchor="middle" fill="${COLOR.texto}"
        style="font-family:${F.display};font-size:${d.nombre.length > 18 ? 26 : 32}px;font-weight:900;letter-spacing:-0.01em;text-transform:uppercase;">${esc(d.nombre)}</text>
  ${d.apodo
    ? `<text x="${W / 2}" y="${B.apodo}" text-anchor="middle" fill="${COLOR.textoSuave}" style="font-family:${F.serif};font-size:14px;font-style:italic;">&#8220;${esc(d.apodo)}&#8221;</text>`
    : ''}

  <line x1="24" x2="${W - 24}" y1="${B.divisor1}" y2="${B.divisor1}" stroke="${COLOR.divisor}" stroke-width="1"/>

  ${fisicos.map((f, i) => `
    <text x="${cols[i]}" y="${B.fisicoLabel}" text-anchor="middle" fill="${COLOR.textoSuave}" style="font-family:${F.mono};font-size:8px;font-weight:700;letter-spacing:0.2em;">${esc(f.label)}</text>
    <text x="${cols[i]}" y="${B.fisicoValor}" text-anchor="middle" fill="${COLOR.texto}" style="font-family:${F.display};font-size:23px;font-weight:900;">${esc(f.valor)}</text>
    <text x="${cols[i]}" y="${B.fisicoValor + 11}" text-anchor="middle" fill="${COLOR.textoSuave}" style="font-family:${F.mono};font-size:7px;letter-spacing:0.1em;">${esc(f.unidad)}</text>`).join('')}

  <line x1="24" x2="${W - 24}" y1="${B.divisor2}" y2="${B.divisor2}" stroke="${COLOR.divisor}" stroke-width="1"/>

  <text x="24" y="${B.recordLabel}" fill="${COLOR.textoSuave}" style="font-family:${F.mono};font-size:8px;font-weight:700;letter-spacing:0.2em;">RÉCORD</text>
  <text x="24" y="${B.recordValor}" fill="${COLOR.texto}" style="font-family:${F.display};font-size:30px;font-weight:900;">${esc(d.record ?? '—')}</text>
  ${d.desglose
    ? `<text x="${W - 24}" y="${B.recordValor - 2}" text-anchor="end" fill="${COLOR.textoSuave}" style="font-family:${F.mono};font-size:9.5px;letter-spacing:0.06em;">KO ${d.desglose.koVictorias} &#183; SUB ${d.desglose.subVictorias} &#183; DEC ${d.desglose.decVictorias}</text>`
    : ''}
  <text x="24" y="${B.recordDesglose}" fill="${COLOR.textoSuave}" style="font-family:${F.mono};font-size:8px;letter-spacing:0.1em;">${esc(d.divisionLabel.toUpperCase())}</text>

  ${tieneArma ? `
    <line x1="24" x2="${W - 24}" y1="${B.divisor3}" y2="${B.divisor3}" stroke="${COLOR.divisor}" stroke-width="1"/>
    <rect x="24" y="${B.armaLabel - 9}" width="3" height="11" fill="${COLOR.acid}"/>
    <text x="33" y="${B.armaLabel}" fill="${COLOR.acid}" style="font-family:${F.mono};font-size:8px;font-weight:700;letter-spacing:0.22em;">ARMA</text>
    ${armaLineas.map((l, i) => `<text x="${W / 2}" y="${B.armaTexto + i * 19 - (armaLineas.length > 1 ? 8 : 0)}" text-anchor="middle" fill="${COLOR.texto}" style="font-family:${F.serif};font-size:${armaLineas.length > 1 ? 16 : 18}px;font-style:italic;font-weight:600;">${esc(l)}</text>`).join('')}
  ` : ''}

  <text x="${W / 2}" y="${B.footer}" text-anchor="middle" fill="${COLOR.textoSuave}" style="font-family:${F.mono};font-size:8px;letter-spacing:0.24em;" opacity="0.7">QUIMBARA.ORG</text>`;

  if (!conRaiz) return contenido;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Carta de ${d.nombre}${d.arma ? `: ${d.arma}` : ''}`)}" data-carta="${esc(d.slug)}" style="display:block;"><title>${esc(`${d.nombre} — carta ${est.label} de Quimbara`)}</title>${contenido}</svg>`;
}
