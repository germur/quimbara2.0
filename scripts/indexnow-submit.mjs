// scripts/indexnow-submit.mjs
// Notifica a Bing/IndexNow las URLs nuevas o modificadas para acelerar el crawling.
// IndexNow es soportado por Bing, Yandex, Seznam, Naver — ping a uno = ping a todos.
//
// Uso:
//   node scripts/indexnow-submit.mjs                  → envía todo el sitemap (max 10k)
//   node scripts/indexnow-submit.mjs <url> [<url>...] → envía URLs específicas
//
// Docs: https://www.indexnow.org/documentation
//       https://www.bing.com/indexnow

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

const HOST = 'quimbara.org';
const KEY  = 'f64b290739a38947c5001bf97b5be990';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

async function submit(urls) {
  if (!urls.length) {
    console.log('No URLs to submit.');
    return;
  }
  // IndexNow acepta hasta 10.000 URLs por petición
  const batches = [];
  for (let i = 0; i < urls.length; i += 10000) batches.push(urls.slice(i, i + 10000));

  for (const [i, batch] of batches.entries()) {
    const body = {
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList: batch,
    };
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => '');
    console.log(`  Batch ${i + 1}/${batches.length} (${batch.length} URLs) → ${res.status} ${res.statusText} ${text ? '· ' + text.slice(0, 200) : ''}`);
    if (![200, 202].includes(res.status)) {
      console.error('  ⚠  IndexNow respondió error. Status detail:');
      console.error(`     200 OK / 202 Accepted = bien
     400 Bad Request = JSON inválido
     403 Forbidden = key no encontrada en ${KEY_LOCATION}
     422 Unprocessable = URLs no pertenecen al host
     429 Too Many Requests = rate limit`);
    }
  }
}

function readSitemapUrls() {
  // Lee sitemap-0.xml generado por @astrojs/sitemap
  const candidates = [
    join(ROOT, 'dist', 'sitemap-0.xml'),
    join(ROOT, 'dist', 'sitemap-index.xml'),
  ];
  const all = [];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const xml = readFileSync(p, 'utf8');
    const matches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
    matches.forEach(m => {
      const url = m.replace(/<\/?loc>/g, '').trim();
      if (url.includes(HOST) && !url.endsWith('.xml')) all.push(url);
    });
  }
  return [...new Set(all)];
}

async function main() {
  console.log('📡 IndexNow → Bing / Yandex / Seznam / Naver');
  console.log(`   Host: ${HOST}`);
  console.log(`   Key location: ${KEY_LOCATION}\n`);

  const argv = process.argv.slice(2);
  let urls = [];

  if (argv.length) {
    urls = argv.map(u => u.startsWith('http') ? u : `https://${HOST}${u.startsWith('/') ? '' : '/'}${u}`);
    console.log(`Submitting ${urls.length} URL(s) passed as arguments…`);
  } else {
    urls = readSitemapUrls();
    if (!urls.length) {
      console.error('❌ No se encontró dist/sitemap-0.xml. Corre `npm run build` primero.');
      process.exit(1);
    }
    console.log(`Submitting ${urls.length} URLs from sitemap…`);
  }

  await submit(urls);
  console.log('\n✓ Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
