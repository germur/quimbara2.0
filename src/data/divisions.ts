// Mapeo centralizado de divisiones UFC — usado en peleadores/index.astro y hubs SEO

export const divOrder = [
  'Heavyweight', 'Light Heavyweight', 'Middleweight',
  'Welterweight', 'Lightweight', 'Featherweight',
  'Bantamweight', 'Flyweight',
  "Women's Strawweight", "Women's Flyweight",
  "Women's Bantamweight", "Women's Featherweight",
] as const;

export const divLabels: Record<string, string> = {
  'Heavyweight':           'Peso Pesado',
  'Light Heavyweight':     'Semipesado',
  'Middleweight':          'Peso Medio',
  'Welterweight':          'Wélter',
  'Lightweight':           'Ligero',
  'Featherweight':         'Pluma',
  'Bantamweight':          'Gallo',
  'Flyweight':             'Mosca',
  "Women's Strawweight":   'Paja Femenino',
  "Women's Flyweight":     'Mosca Femenino',
  "Women's Bantamweight":  'Gallo Femenino',
  "Women's Featherweight": 'Pluma Femenino',
};

// Slugs para URLs: /peleadores/peso-pesado/
export const divSlugs: Record<string, string> = {
  'Heavyweight':           'peso-pesado',
  'Light Heavyweight':     'semipesado',
  'Middleweight':          'peso-medio',
  'Welterweight':          'welter',
  'Lightweight':           'ligero',
  'Featherweight':         'pluma',
  'Bantamweight':          'gallo',
  'Flyweight':             'mosca',
  "Women's Strawweight":   'paja-femenino',
  "Women's Flyweight":     'mosca-femenino',
  "Women's Bantamweight":  'gallo-femenino',
  "Women's Featherweight": 'pluma-femenino',
};

// Inverso: slug → nombre interno
export const slugToDiv: Record<string, string> = Object.fromEntries(
  Object.entries(divSlugs).map(([k, v]) => [v, k])
);

// Rango de peso por división (lbs)
export const divWeights: Record<string, string> = {
  'Heavyweight':           'Más de 205 lbs (93 kg)',
  'Light Heavyweight':     '186–205 lbs (84–93 kg)',
  'Middleweight':          '171–185 lbs (78–84 kg)',
  'Welterweight':          '156–170 lbs (71–77 kg)',
  'Lightweight':           '146–155 lbs (66–70 kg)',
  'Featherweight':         '136–145 lbs (62–66 kg)',
  'Bantamweight':          '126–135 lbs (57–61 kg)',
  'Flyweight':             '116–125 lbs (53–57 kg)',
  "Women's Strawweight":   'Hasta 115 lbs (52 kg)',
  "Women's Flyweight":     '116–125 lbs (53–57 kg)',
  "Women's Bantamweight":  '126–135 lbs (57–61 kg)',
  "Women's Featherweight": '136–145 lbs (62–66 kg)',
};

export const isFemale = (div: string) => div.startsWith("Women's");
