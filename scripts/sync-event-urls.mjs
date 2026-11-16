import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const clean = value => String(value ?? '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const known = e => e.main && !/^(tbd|por confirmar)$/i.test(e.main);
const pair = e => clean(e.main).split('-vs-').sort().join('|');
const family = e => e.name.match(/^UFC\s+(\d+)$/i)?.[0]?.toLowerCase() ?? 'fight-night';
export function buildRegistry(events, previous = {version:1,events:[]}) {
  const entries = structuredClone(previous.events).map(r=>({...r,id:r.id??r.primarySlug}));
  const sorted = [...events].sort((a,b) => Number(known(b))-Number(known(a)) || (b.fightCard?.length??0)-(a.fightCard?.length??0));
  for (const e of sorted) {
    const registered=entries.find(r=>r.aliases.includes(e.slug));
    if (registered) {if(e.espnEventId)registered.sourceEventId=String(e.espnEventId);continue;}
    let entry = entries.find(r => e.espnEventId && r.sourceEventId===String(e.espnEventId)) ?? entries.find(r => {
      const original = events.find(v=>v.slug===r.primarySlug);
      if (!original || family(original)!==family(e)) return false;
      const days = Math.abs(Date.parse(original.date)-Date.parse(e.date))/86400000;
      return known(e) && known(original) && days<=2 && pair(original)===pair(e);
    });
    // Only alias an unnamed Fight Night when exactly one named event of the
    // same family is present on that date. Never merge different named fights.
    if (!entry && !known(e) && family(e)==='fight-night') {
      const candidates=events.filter(v=>known(v)&&v.date===e.date&&family(v)===family(e));
      if(candidates.length===1) entry=entries.find(r=>r.aliases.includes(candidates[0].slug));
    }
    if (entry) {
      const prior=events.find(v=>v.slug===entry.primarySlug);
      if(e.espnEventId&&entry.sourceEventId===String(e.espnEventId)&&(!prior||Date.parse(e.cardCheckedAt??'1970-01-01')>Date.parse(prior.cardCheckedAt??'1970-01-01')))entry.primarySlug=e.slug;
      entry.aliases.push(e.slug); continue;
    }
    let slug=e.slug;
    if(known(e) && !e.isSpecial) {
      const names=e.main.split(/\s+vs\.?\s+/i).map(n=>clean(n.trim().split(/\s+/).at(-1)));
      if(names.length===2 && names.every(Boolean)) {
        const number=e.name.match(/^UFC\s+(\d+)$/i)?.[1];
        slug=number ? `ufc-${number}-${names[0]}-vs-${names[1]}`
          : `ufc-fight-night-${names[0]}-vs-${names[1]}-${e.date.slice(0,4)}`;
      }
    }
    if(entries.some(r=>r.slug===slug)) slug+=`-${e.date}`;
    entries.push({id:e.slug,primarySlug:e.slug,slug,aliases:[e.slug],...(e.espnEventId?{sourceEventId:String(e.espnEventId)}:{})});
  }
  return {version:1,events:entries};
}
export function syncEventUrls(root=resolve(fileURLToPath(new URL('..',import.meta.url)))) {
  const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
  const events=read('src/data/events-all.json');
  const registry=buildRegistry(events,read('src/data/event-urls.json'));
  writeFileSync(resolve(root,'src/data/event-urls.json'),JSON.stringify(registry,null,2)+'\n');
  const lines=[];
  for(const r of registry.events) {
    const hasCard=events.some(e=>r.aliases.includes(e.slug)&&e.fightCard?.length);
    for(const alias of r.aliases.filter(a=>a!==r.slug)) {
      for(const suffix of ['', '/']) lines.push(`/eventos/${alias}${suffix} /eventos/${r.slug}/ 301!`);
      if(hasCard) for(const suffix of ['', '/']) lines.push(`/eventos/${alias}/quiniela${suffix} /eventos/${r.slug}/quiniela/ 301!`);
    }
  }
  const path=resolve(root,'public/_redirects'),start='# >>> EVENTOS CANONICOS',end='# <<< EVENTOS CANONICOS';
  const old=readFileSync(path,'utf8').replace(new RegExp(start+'[\\s\\S]*?'+end+'\\s*'),'');
  writeFileSync(path,start+'\n'+lines.join('\n')+'\n'+end+'\n\n'+old);
  return registry;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`Event URL registry: ${syncEventUrls().events.length} identities`);
}
