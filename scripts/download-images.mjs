// scripts/download-images.mjs
// Descarga fotos de fighters desde UFC.com (og:image) — sin API de pago.
// Lee fighters.json, descarga las que faltan, actualiza el campo img.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data');
const IMG_DIR = join(__dirname, '..', 'public', 'fighters');

const SLEEP_MS = 1100;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function findOgImage(slug) {
  try {
    const res = await fetch(`https://www.ufc.com/athlete/${slug}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    const candidates = [
      $('meta[property="og:image"]').attr('content'),
      $('.hero-profile__image img').attr('src'),
      $('img.image-style-athlete-bio-full-body').attr('src'),
    ].filter(Boolean);

    if (!candidates.length) return null;

    let url = candidates[0];
    if (url.startsWith('//')) url = 'https:' + url;
    else if (url.startsWith('/')) url = 'https://www.ufc.com' + url;
    return url;
  } catch {
    return null;
  }
}

async function main() {
  console.log('🖼  Quimbara image downloader\n');

  if (!existsSync(IMG_DIR)) mkdirSync(IMG_DIR, { recursive: true });

  const fightersPath = join(DATA_DIR, 'fighters.json');
  if (!existsSync(fightersPath)) {
    console.log('⚠ fighters.json not found. Run data:update first.');
    process.exit(1);
  }

  const fighters = JSON.parse(readFileSync(fightersPath, 'utf8'));
  const knownSlugs = new Set(fighters.map(f => f.slug));

  // Also include main eventers from events that aren't in fighters.json
  const eventsPath = join(DATA_DIR, 'events.json');
  if (existsSync(eventsPath)) {
    const events = JSON.parse(readFileSync(eventsPath, 'utf8'));
    for (const e of events) {
      for (const fc of (e.fightCard || [])) {
        for (const name of [fc.f1, fc.f2].filter(Boolean)) {
          const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[''']/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
          if (slug && slug !== 'tbd' && !knownSlugs.has(slug)) {
            fighters.push({ slug, name });
            knownSlugs.add(slug);
          }
        }
      }
    }
  }

  const toDownload = fighters.filter(f => {
    if (!f.slug) return false;
    return !existsSync(join(IMG_DIR, `${f.slug}.png`))
        && !existsSync(join(IMG_DIR, `${f.slug}.jpg`));
  });

  console.log(`⬇  ${toDownload.length} to download (${fighters.length - toDownload.length} existing)\n`);

  if (!toDownload.length) {
    console.log('✅ All images present.\n');
    return;
  }

  const batch = toDownload.slice(0, 50);
  let success = 0, failed = 0;

  for (let i = 0; i < batch.length; i++) {
    const f = batch[i];
    process.stdout.write(`  [${i + 1}/${batch.length}] ${f.slug.padEnd(35)} `);

    const imgUrl = await findOgImage(f.slug);
    if (!imgUrl) {
      console.log('✗ (no image)');
      failed++;
      await sleep(SLEEP_MS);
      continue;
    }

    try {
      const res = await fetch(imgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
      });
      if (!res.ok) { console.log('✗ (download failed)'); failed++; await sleep(SLEEP_MS); continue; }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 1000) { console.log('✗ (too small)'); failed++; await sleep(SLEEP_MS); continue; }

      const ext = imgUrl.includes('.png') ? 'png' : 'jpg';
      writeFileSync(join(IMG_DIR, `${f.slug}.${ext}`), buffer);
      f.img = `/fighters/${f.slug}.${ext}`;
      success++;
      console.log(`✓ (.${ext})`);
    } catch {
      console.log('✗ (error)');
      failed++;
    }

    await sleep(SLEEP_MS);
  }

  if (success > 0) {
    const all = JSON.parse(readFileSync(fightersPath, 'utf8'));
    const imgMap = Object.fromEntries(batch.filter(f => f.img).map(f => [f.slug, f.img]));
    for (const f of all) {
      if (imgMap[f.slug]) f.img = imgMap[f.slug];
    }
    writeFileSync(fightersPath, JSON.stringify(all, null, 2) + '\n', 'utf8');
  }

  console.log(`\n📊 ${success} downloaded, ${failed} failed`);
  if (toDownload.length > batch.length) {
    console.log(`💡 ${toDownload.length - batch.length} more — run again.\n`);
  }
}

main().catch(err => { console.error('❌', err); process.exit(1); });
