import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import registry from '../src/data/event-urls.json' with {type:'json'};
import events from '../src/data/events-all.json' with {type:'json'};
import {eventPath,canonicalEvents} from '../src/lib/event-routing.mjs';
import {validDate} from '../src/lib/event-data.mjs';
const redirects=readFileSync('dist/_redirects','utf8');
const sitemap=readFileSync('dist/sitemap-0.xml','utf8');
let aliases=0;
for(const e of events) assert.ok(validDate(e.date),`Invalid event date: ${e.slug}`);
const owners=new Map();
for(const entry of registry.events) {
  for(const alias of entry.aliases) {
    assert.ok(!owners.has(alias),`Alias has two owners: ${alias}`);owners.set(alias,entry.slug);
    if(alias===entry.slug)continue;
    const rule=`/eventos/${alias}/ /eventos/${entry.slug}/ 301!`;
    assert.ok(redirects.includes(rule),`Missing permanent redirect: ${alias}`);
    assert.ok(!sitemap.includes(`<loc>https://quimbara.org/eventos/${alias}/</loc>`),`Legacy URL in sitemap: ${alias}`);
    aliases++;
  }
}
for(const e of canonicalEvents(events)) {
  const path=eventPath(e.slug),file='dist'+path+'index.html';
  assert.ok(existsSync(file),`Missing canonical page: ${path}`);
  const $=load(readFileSync(file,'utf8'));
  assert.equal($('h1').length,1);
  assert.equal($('link[rel=canonical]').attr('href'),'https://quimbara.org'+path);
  if(e.main!=='TBD')assert.ok(sitemap.includes('https://quimbara.org'+path));
  if(e.date>=new Date().toISOString().slice(0,10))assert.ok(!$('main').text().includes('Evento pasado'),`Future event presented as past: ${path}`);
  assert.ok(!$('script[type="application/ld+json"]').text().includes('EventCompleted'));
  if(e.fightCard?.length)assert.ok(existsSync('dist'+path+'quiniela/index.html'),`Missing predictions page: ${path}`);
}
console.log(`OK: ${canonicalEvents(events).length} event identities, ${aliases} legacy redirects, canonicals, sitemap and predictions routes.`);
