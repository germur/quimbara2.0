/**
 * paises.ts — normalización de país a ISO-3166 alpha-2 y bandera.
 *
 * ─── POR QUÉ HACE FALTA ──────────────────────────────────────────────
 * El campo `from` de fighters.json está roto: 154 de 195 rankeados no lo
 * tienen, y los que sí mezclan países con ciudades ("Safford, Arizona,
 * EE.UU.") y nomenclaturas ("USA" vs "EE.UU."). El scraper de Wikipedia
 * saca `birth_place` y `nationality`, pero también vienen sucios:
 *
 *   · Estados que ya no existen: "Soviet Union", "Czechoslovakia",
 *     "FR Yugoslavia" — son 9 peleadores nacidos antes de 1991
 *   · Paréntesis sin cerrar del wikitext: "Russia)", "Kyrgyzstan)"
 *   · Subdivisiones: "South Australia"
 *   · Ciudades cuando el birth_place no incluye país: "Ordzhonikidzvskaya"
 *
 * La estrategia es validar contra una lista conocida y devolver null antes
 * que adivinar: una bandera equivocada en una carta que la gente comparte
 * es peor que no mostrar bandera.
 *
 * Orden de resolución (ver resolverPais):
 *   1. Override a mano en peleadores-editorial.json  ← siempre gana
 *   2. País de nacimiento de Wikipedia, si valida
 *   3. Demónimo de nationality, si valida
 *   4. null → la carta omite la bandera
 */

/** Nombre de país (en inglés, como viene de Wikipedia) → ISO-3166 alpha-2 */
const POR_NOMBRE: Record<string, string> = {
  // Los que aparecen hoy en el roster rankeado
  'u.s.': 'US', 'united states': 'US', 'usa': 'US', 'us': 'US',
  'ee.uu.': 'US', 'eeuu': 'US', 'estados unidos': 'US',
  'brazil': 'BR', 'brasil': 'BR',
  'england': 'GB-ENG', 'scotland': 'GB-SCT', 'wales': 'GB-WLS',
  'united kingdom': 'GB', 'uk': 'GB', 'northern ireland': 'GB',
  'russia': 'RU', 'russian federation': 'RU',
  'china': 'CN', 'mexico': 'MX', 'méxico': 'MX',
  'canada': 'CA', 'new zealand': 'NZ',
  'australia': 'AU', 'south australia': 'AU', 'western australia': 'AU',
  'france': 'FR', 'japan': 'JP', 'ecuador': 'EC', 'myanmar': 'MM', 'burma': 'MM',
  'poland': 'PL', 'nigeria': 'NG', 'kazakhstan': 'KZ', 'uzbekistan': 'UZ',
  'argentina': 'AR', 'south africa': 'ZA', 'jamaica': 'JM', 'georgia': 'GE',
  'iran': 'IR', 'iraq': 'IQ', 'afghanistan': 'AF',
  'dominican republic': 'DO', 'netherlands': 'NL', 'croatia': 'HR',
  'panama': 'PA', 'angola': 'AO', 'ireland': 'IE', 'uganda': 'UG',
  'austria': 'AT', 'kyrgyzstan': 'KG', 'moldova': 'MD', 'thailand': 'TH',
  'germany': 'DE', 'morocco': 'MA', 'ukraine': 'UA',
  // Naciones habituales de MMA que todavía no aparecen pero van a aparecer
  'spain': 'ES', 'españa': 'ES', 'italy': 'IT', 'portugal': 'PT',
  'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI',
  'belgium': 'BE', 'switzerland': 'CH', 'czech republic': 'CZ', 'czechia': 'CZ',
  'slovakia': 'SK', 'hungary': 'HU', 'romania': 'RO', 'bulgaria': 'BG',
  'serbia': 'RS', 'bosnia and herzegovina': 'BA', 'slovenia': 'SI',
  'north macedonia': 'MK', 'albania': 'AL', 'greece': 'GR', 'turkey': 'TR',
  'armenia': 'AM', 'azerbaijan': 'AZ', 'belarus': 'BY', 'lithuania': 'LT',
  'latvia': 'LV', 'estonia': 'EE', 'tajikistan': 'TJ', 'turkmenistan': 'TM',
  'mongolia': 'MN', 'south korea': 'KR', 'korea': 'KR', 'north korea': 'KP',
  'philippines': 'PH', 'indonesia': 'ID', 'malaysia': 'MY', 'singapore': 'SG',
  'thailand ': 'TH', 'vietnam': 'VN', 'india': 'IN', 'pakistan': 'PK',
  'israel': 'IL', 'lebanon': 'LB', 'jordan': 'JO', 'egypt': 'EG',
  'united arab emirates': 'AE', 'saudi arabia': 'SA', 'bahrain': 'BH',
  'kuwait': 'KW', 'qatar': 'QA', 'tunisia': 'TN', 'algeria': 'DZ',
  'cameroon': 'CM', 'ghana': 'GH', 'kenya': 'KE', 'congo': 'CG',
  'democratic republic of the congo': 'CD', 'senegal': 'SN', 'mali': 'ML',
  'suriname': 'SR', 'venezuela': 'VE', 'colombia': 'CO', 'peru': 'PE',
  'chile': 'CL', 'bolivia': 'BO', 'paraguay': 'PY', 'uruguay': 'UY',
  'costa rica': 'CR', 'guatemala': 'GT', 'honduras': 'HN',
  'el salvador': 'SV', 'nicaragua': 'NI', 'cuba': 'CU', 'puerto rico': 'PR',
  'haiti': 'HT', 'trinidad and tobago': 'TT', 'bahamas': 'BS',
};

/** Demónimo → ISO-3166. Respaldo cuando birth_place no trae país. */
const POR_DEMONIMO: Record<string, string> = {
  american: 'US', brazilian: 'BR', english: 'GB-ENG', scottish: 'GB-SCT',
  welsh: 'GB-WLS', british: 'GB', irish: 'IE', russian: 'RU', chinese: 'CN',
  mexican: 'MX', canadian: 'CA', 'new zealander': 'NZ', australian: 'AU',
  french: 'FR', japanese: 'JP', ecuadorian: 'EC', burmese: 'MM',
  polish: 'PL', nigerian: 'NG', kazakh: 'KZ', kazakhstani: 'KZ',
  uzbek: 'UZ', argentine: 'AR', argentinian: 'AR', 'south african': 'ZA',
  jamaican: 'JM', georgian: 'GE', iranian: 'IR', iraqi: 'IQ', afghan: 'AF',
  dominican: 'DO', dutch: 'NL', croatian: 'HR', panamanian: 'PA',
  angolan: 'AO', ugandan: 'UG', austrian: 'AT', kyrgyz: 'KG',
  moldovan: 'MD', thai: 'TH', german: 'DE', moroccan: 'MA', ukrainian: 'UA',
  spanish: 'ES', italian: 'IT', portuguese: 'PT', swedish: 'SE',
  norwegian: 'NO', danish: 'DK', finnish: 'FI', belgian: 'BE',
  swiss: 'CH', czech: 'CZ', slovak: 'SK', hungarian: 'HU', romanian: 'RO',
  bulgarian: 'BG', serbian: 'RS', bosnian: 'BA', slovenian: 'SI',
  macedonian: 'MK', albanian: 'AL', greek: 'GR', turkish: 'TR',
  armenian: 'AM', azerbaijani: 'AZ', belarusian: 'BY', lithuanian: 'LT',
  latvian: 'LV', estonian: 'EE', tajik: 'TJ', mongolian: 'MN',
  'south korean': 'KR', korean: 'KR', filipino: 'PH', indonesian: 'ID',
  malaysian: 'MY', singaporean: 'SG', vietnamese: 'VN', indian: 'IN',
  pakistani: 'PK', israeli: 'IL', lebanese: 'LB', jordanian: 'JO',
  egyptian: 'EG', emirati: 'AE', 'saudi arabian': 'SA', saudi: 'SA',
  tunisian: 'TN', algerian: 'DZ', cameroonian: 'CM', ghanaian: 'GH',
  kenyan: 'KE', senegalese: 'SN', surinamese: 'SR', venezuelan: 'VE',
  colombian: 'CO', peruvian: 'PE', chilean: 'CL', bolivian: 'BO',
  cuban: 'CU', 'puerto rican': 'PR', haitian: 'HT',
};

/**
 * Estados que ya no existen. Se reconocen para NO tratarlos como país
 * desconocido y saltar directo al demónimo, que sí identifica al peleador.
 */
const HISTORICOS = new Set(['soviet union', 'ussr', 'czechoslovakia', 'fr yugoslavia', 'yugoslavia', 'east germany', 'west germany']);

/** Nombre en español para mostrar */
const NOMBRE_ES: Record<string, string> = {
  US: 'Estados Unidos', BR: 'Brasil', 'GB-ENG': 'Inglaterra',
  'GB-SCT': 'Escocia', 'GB-WLS': 'Gales', GB: 'Reino Unido',
  RU: 'Rusia', CN: 'China', MX: 'México', CA: 'Canadá',
  NZ: 'Nueva Zelanda', AU: 'Australia', FR: 'Francia', JP: 'Japón',
  EC: 'Ecuador', MM: 'Myanmar', PL: 'Polonia', NG: 'Nigeria',
  KZ: 'Kazajistán', UZ: 'Uzbekistán', AR: 'Argentina', ZA: 'Sudáfrica',
  JM: 'Jamaica', GE: 'Georgia', IR: 'Irán', IQ: 'Irak', AF: 'Afganistán',
  DO: 'República Dominicana', NL: 'Países Bajos', HR: 'Croacia',
  PA: 'Panamá', AO: 'Angola', IE: 'Irlanda', UG: 'Uganda', AT: 'Austria',
  KG: 'Kirguistán', MD: 'Moldavia', TH: 'Tailandia', DE: 'Alemania',
  MA: 'Marruecos', UA: 'Ucrania', ES: 'España', IT: 'Italia',
  PT: 'Portugal', CZ: 'República Checa', RS: 'Serbia', AM: 'Armenia',
  AZ: 'Azerbaiyán', KR: 'Corea del Sur', PH: 'Filipinas', CO: 'Colombia',
  PE: 'Perú', CL: 'Chile', VE: 'Venezuela', CU: 'Cuba', PR: 'Puerto Rico',
  AE: 'Emiratos Árabes Unidos', TR: 'Turquía', SE: 'Suecia',
  DK: 'Dinamarca', NO: 'Noruega', FI: 'Finlandia', BE: 'Bélgica',
  CH: 'Suiza', GR: 'Grecia', IL: 'Israel', IN: 'India',
};

const limpiar = (s: string) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Wikitext deja paréntesis sin cerrar: "Russia)", "Kyrgyzstan)"
    .replace(/[()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Nombre de país → ISO. null si no está en la lista conocida. */
export function isoDesdeNombre(nombre?: string | null): string | null {
  if (!nombre) return null;
  const k = limpiar(nombre);
  if (HISTORICOS.has(k)) return null; // que resuelva el demónimo
  if (POR_NOMBRE[k]) return POR_NOMBRE[k];
  // Si viene con ciudad delante ("Safford, Arizona, EE.UU."), probar el
  // último segmento. Si tampoco valida, null — no se adivina.
  const partes = k.split(',').map(s => s.trim()).filter(Boolean);
  if (partes.length > 1) return POR_NOMBRE[partes[partes.length - 1]] ?? null;
  return null;
}

/** Demónimo → ISO. Toma el primero si viene múltiple ("American • Mexican"). */
export function isoDesdeDemonimo(demonimo?: string | null): string | null {
  if (!demonimo) return null;
  const primero = demonimo.split(/[•·,/]|\band\b/i)[0];
  return POR_DEMONIMO[limpiar(primero)] ?? null;
}

/**
 * Bandera como emoji. Sin assets, escala sola y renderiza en cualquier lado.
 * Las naciones del Reino Unido usan secuencias de tags (🏴󠁧󠁢󠁥󠁮󠁧󠁿), el resto son
 * pares de indicadores regionales.
 */
export function bandera(iso?: string | null): string | null {
  if (!iso) return null;

  const SUBDIVISION: Record<string, string> = {
    'GB-ENG': 'gbeng', 'GB-SCT': 'gbsct', 'GB-WLS': 'gbwls',
  };
  const sub = SUBDIVISION[iso];
  if (sub) {
    const TAG_BASE = 0xe0000;
    const NEGRA = '\u{1F3F4}';
    const FIN = '\u{E007F}';
    return NEGRA + [...sub].map(c => String.fromCodePoint(TAG_BASE + c.charCodeAt(0))).join('') + FIN;
  }

  if (!/^[A-Z]{2}$/.test(iso)) return null;
  const BASE = 0x1f1e6;
  return [...iso].map(c => String.fromCodePoint(BASE + c.charCodeAt(0) - 65)).join('');
}

export function nombrePais(iso?: string | null): string | null {
  if (!iso) return null;
  return NOMBRE_ES[iso] ?? iso;
}

export interface PaisResuelto {
  iso: string | null;
  nombre: string | null;
  bandera: string | null;
  /** De dónde salió, para poder auditar */
  fuente: 'override' | 'nacimiento' | 'nacionalidad' | 'ufc' | null;
}

/**
 * Resuelve el país con precedencia. Devuelve null antes que adivinar.
 *
 *   1. override  — a mano en peleadores-editorial.json
 *   2. nacimiento — birth_place de Wikipedia
 *   3. nacionalidad — demónimo de Wikipedia (resuelve a los nacidos en
 *      la URSS, Checoslovaquia o Yugoslavia)
 *   4. ufc — el campo `from` de fighters.json. Va último porque es
 *      inconsistente, pero cuando trae un país limpio es válido y
 *      recupera casos que Wikipedia no resuelve.
 */
export function resolverPais(entrada: {
  override?: string | null;
  paisNacimiento?: string | null;
  nacionalidad?: string | null;
  paisUfc?: string | null;
}): PaisResuelto {
  const vacio: PaisResuelto = { iso: null, nombre: null, bandera: null, fuente: null };

  const candidatos: Array<[string | null, PaisResuelto['fuente']]> = [
    // El override puede venir como ISO directo o como nombre
    [entrada.override && (/^[A-Z]{2}(-[A-Z]{3})?$/.test(entrada.override)
      ? entrada.override
      : isoDesdeNombre(entrada.override)) || null, 'override'],
    [isoDesdeNombre(entrada.paisNacimiento), 'nacimiento'],
    [isoDesdeDemonimo(entrada.nacionalidad), 'nacionalidad'],
    [isoDesdeNombre(entrada.paisUfc), 'ufc'],
  ];

  for (const [iso, fuente] of candidatos) {
    if (iso) return { iso, nombre: nombrePais(iso), bandera: bandera(iso), fuente };
  }
  return vacio;
}
