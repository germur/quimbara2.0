# Datos variables del sitio

Archivos JSON que alimentan las secciones dinámicas de la home (ticker, eventos, rankings, resultados, videos).

## Cómo actualizar (manual, 5 min/semana)

1. Edita el archivo JSON correspondiente (`events.json`, `fighters.json`, `results.json`, `videos.json`).
2. Guarda. Si el dev server está corriendo, Astro recarga solo.
3. En producción: commit + push → Netlify/Vercel rebuildea automático.

## Estructura

- **events.json** — Próximos eventos (home + ticker). Campos: `name`, `date` (ISO), `dateLabel` (mostrar), `loc`, `main`, `bg`, `color`.
- **fighters.json** — Rankings destacados. Campos: `name`, `nick`, `div`, `rec`, `from`, `rank` (`"C"` para campeón o número), `img`.
- **results.json** — Últimos resultados. Campos: `w` (ganador), `l` (perdedor), `method`, `round`, `time`, `event`.
- **videos.json** — Video highlights. Campos: `title`, `dur`, `views`, `img`.

## Automatizar en el futuro (GitHub Action)

Cuando quieras dejar de editar a mano:

1. Crear `scripts/fetch-ufc-data.ts` que:
   - Haga `fetch` a una fuente (Wikipedia API, scraping de ufc.com/events con cheerio, o RapidAPI MMA).
   - Escriba los JSON de esta carpeta con el formato actual.
2. Crear `.github/workflows/update-data.yml`:
   ```yaml
   on:
     schedule:
       - cron: '0 6 * * 1'  # Lunes 6am UTC
     workflow_dispatch:
   jobs:
     update:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20 }
         - run: npm ci
         - run: npx tsx scripts/fetch-ufc-data.ts
         - uses: stefanzweifel/git-auto-commit-action@v5
           with:
             commit_message: 'chore(data): actualización semanal'
   ```
3. Netlify/Vercel detecta el commit y rebuildea.

**Fuente recomendada para empezar**: scraping de `https://www.ufc.com/events` con `cheerio`. Sin API key, sin cuota. Si rompe, se cambia.
