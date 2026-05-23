import * as cheerio from 'cheerio';

const res = await fetch('https://www.ufc.com/athlete/tom-aspinall', {
  headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
  redirect: 'follow',
});
const html = await res.text();
const $ = cheerio.load(html);

console.log('og:image:', $('meta[property="og:image"]').attr('content'));
console.log('hero-profile img:', $('.hero-profile__image img').attr('src'));
console.log('full-body:', $('img.image-style-athlete-bio-full-body').attr('src'));

console.log('\n--- All sized/athlete images ---');
$('img').each((i, el) => {
  const src = $(el).attr('src') || '';
  if (src.match(/full|hero|athlete|bio/i)) {
    console.log(' ', src);
  }
});

console.log('\n--- All og/meta images ---');
$('meta').each((i, el) => {
  const prop = $(el).attr('property') || $(el).attr('name') || '';
  if (prop.match(/image/i)) console.log(' ', prop, '=', $(el).attr('content'));
});
