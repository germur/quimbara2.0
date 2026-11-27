import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRegistry} from './sync-event-urls.mjs';
import {eventStatus,schemaStatus,validDate,validTime,cardChanges,imageQueue} from '../src/lib/event-data.mjs';
import {horariosDeEvento,instanteDesdeET} from '../src/lib/horarios.mjs';
import {matchesProviderFight,rankingCoverageValid} from '../src/lib/event-data.mjs';
import {preserveFightCorners,fightKey,expandAnnouncedNames} from '../src/lib/event-data.mjs';
import {safeWriteJson} from './lib/datasets.mjs';
import {cardCoverage,namedBouts} from './lib/card-coverage.mjs';
import {mkdtempSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('abbreviated calendar names require a unique saved pair and respect explicit replacements',()=>{
 const fightCard=[{f1:'Israel Adesanya',f2:'Sharabutdin Magomedov'}];
 assert.deepEqual(expandAnnouncedNames({f1:'Adesanya',f2:'Magomedov',fightCard}),fightCard[0]);
 assert.deepEqual(expandAnnouncedNames({f1:'Israel Adesanya',f2:'Abus Magomedov',fightCard}),{f1:'Israel Adesanya',f2:'Abus Magomedov'});
 assert.deepEqual(expandAnnouncedNames({f1:'Other Fighter',f2:'Magomedov',fightCard}),{f1:'Other Fighter',f2:'Magomedov'});
 assert.deepEqual(expandAnnouncedNames({f1:'Adesanya',f2:'Magomedov',fightCard:[...fightCard,{f1:'Israel Adesanya',f2:'Abus Magomedov'}]}),{f1:'Adesanya',f2:'Magomedov'});
});

test('empty and collapsed replacements cannot overwrite the last valid dataset',()=>{
  const dir=mkdtempSync(join(tmpdir(),'quimbara-guard-')),path=join(dir,'data.json');
  try{
    safeWriteJson(path,[1,2,3,4]);const before=readFileSync(path,'utf8');
    assert.throws(()=>safeWriteJson(path,[]),/rejected/);
    assert.equal(readFileSync(path,'utf8'),before);
    assert.throws(()=>safeWriteJson(path,[1]),/rejected/);
    assert.equal(readFileSync(path,'utf8'),before);
  }finally{unlinkSync(path);rmdirSync(dir);}
});
test('provider order never changes the meaning of an existing f1 pick',()=>{
  const previous=[{f1:'Dan Hooker',f2:'Brian Ortega'},{f1:'Asu Almabayev',f2:'Kyoji Horiguchi'}];
  for(const old of previous){
    const incoming={f1:old.f2,f2:old.f1,sourceFightId:'provider-id'};
    const next=preserveFightCorners(incoming,previous);
    assert.equal(next.f1,old.f1);assert.equal(next.f2,old.f2);
    assert.equal(fightKey(next),fightKey(old));
  }
});

test('provider aliases cannot match a different fighter just through a shared surname',()=>{
  const competition=(a,b)=>({competitors:[{athlete:{displayName:a}},{athlete:{displayName:b}}]});
  const event={f1:'Israel Adesanya',f2:'Sharabutdin Magomedov'};
  assert.equal(matchesProviderFight(competition('Shara Magomedov','Israel Adesanya'),event),true);
  assert.equal(matchesProviderFight(competition('Israel Adesanya','Zabit Magomedov'),event),false);
  assert.equal(rankingCoverageValid(0,0,198),false);
  assert.equal(rankingCoverageValid(120,8,198),false);
  assert.equal(rankingCoverageValid(198,11,193),true);
});

test('named URLs collapse unnamed aliases but preserve different fights and freeze published URLs',()=>{
  const e={slug:'ufc-fight-night-2026-11-21',name:'UFC Fight Night',date:'2026-11-21',main:'Jiří Procházka vs. Navajo Stirling'};
  const ghost={...e,slug:'ufc-fight-night-294-2026-11-21',name:'UFC Fight Night 294',main:'TBD'};
  const other={...e,slug:'another',main:'A Fighter vs. B Rival'};
  const r=buildRegistry([e,ghost]);assert.equal(r.events.length,1);
  assert.equal(r.events[0].slug,'ufc-fight-night-prochazka-vs-stirling-2026');
  assert.ok(r.events[0].aliases.includes(ghost.slug));
  assert.equal(buildRegistry([e,other]).events.length,2);
  const changed={...e,main:'Jiří Procházka vs. Otro Rival'};
  assert.equal(buildRegistry([changed],r).events[0].slug,r.events[0].slug);
});
test('rescheduling keeps both the public URL and prediction storage ID',()=>{
 const old={slug:'old-date',name:'UFC Fight Night',date:'2026-11-21',main:'A Person vs. B Fighter',espnEventId:'42',cardCheckedAt:'2026-11-16'};
 const before=buildRegistry([old]);
 const moved={...old,slug:'new-date',date:'2026-11-28',cardCheckedAt:'2026-11-17'};
 const after=buildRegistry([old,moved],before);
 assert.equal(after.events.length,1);assert.equal(after.events[0].id,'old-date');
 assert.equal(after.events[0].primarySlug,'new-date');assert.equal(after.events[0].slug,before.events[0].slug);
});

test('an upcoming record marked completed cannot make a future event past',()=>{
  assert.equal(eventStatus({date:'2026-11-21',status:'completed'},'2026-11-16'),'upcoming');
  assert.equal(schemaStatus({status:'completed'}),'https://schema.org/EventScheduled');
  assert.equal(schemaStatus({status:'cancelled'}),'https://schema.org/EventCancelled');
});
test('calendar validation rejects overflow and does not invent start times',()=>{
  assert.equal(validDate('2026-02-31'),false);assert.equal(validDate('2028-02-29'),true);
  assert.equal(validTime('25:99'),false);assert.equal(validTime('00:00'),true);
  assert.equal(horariosDeEvento({date:'2026-11-21',loc:'Qatar'}),null);
  assert.equal(horariosDeEvento({date:'2026-11-21',horaET:'25:99',scheduleSourceUrl:'https://example.org',scheduleCheckedAt:'2026-11-16'}),null);
  assert.equal(instanteDesdeET('2026-07-01','22:00').toISOString(),'2026-07-02T02:00:00.000Z');
  assert.equal(instanteDesdeET('2026-11-21','22:00').toISOString(),'2026-11-22T03:00:00.000Z');
});
test('changes distinguish withdrawals from fighter order and image queue skips obsolete failures',()=>{
  const before=[{f1:'Jiří Procházka',f2:'Navajo Stirling'},{f1:'A',f2:'B'}];
  const after=[{f1:'Navajo Stirling',f2:'Jiri Prochazka'},{f1:'C',f2:'D'}];
  assert.deepEqual(cardChanges(before,after),{added:['C vs. D'],removed:['A vs. B']});
  const fighters=Array.from({length:500},(_,i)=>({slug:'old'+i,name:'Old '+i})).concat([{slug:'stirling',name:'Navajo Stirling',rank:'5'}]);
  const now=Date.parse('2026-11-16T12:00:00Z');
  assert.equal(imageQueue(fighters,[{date:'2026-11-21',f1:'Navajo Stirling'}],{},now)[0].slug,'stirling');
  assert.equal(imageQueue(fighters,[],{stirling:{retryAfter:'2026-11-20'}},now).length,0);
});

test('ESPN partial coverage keeps the fresh, corroborated Wikipedia card', () => {
  const now = Date.parse('2026-11-26T21:02:09Z');
  const main = {f1:'Gabriel Bonfim',f2:'Sean Brady'};
  const wikiBouts = [main, ...Array.from({length:10}, (_, i) =>
    ({f1:`Fighter Alpha ${i}`,f2:`Fighter Beta ${i}`}))];
  const event = {...main, fightCard:wikiBouts, cardSource:'Wikipedia',
    cardSourcePage:'https://en.wikipedia.org/wiki/UFC_Fight_Night:_Bonfim_vs._Brady',
    cardCheckedAt:'2026-11-26T21:00:19Z'};
  const incoming = [{f1:main.f2,f2:main.f1},{f1:'TBA',f2:'Opponent TBA'}];

  assert.deepEqual(namedBouts(incoming), incoming.slice(0, 1));
  assert.equal(cardCoverage(event, incoming, now), 'keep-wikipedia');
  assert.equal(cardCoverage(event, wikiBouts, now), 'replace');
  assert.equal(cardCoverage(event, incoming.slice(1), now), 'reject');
  assert.equal(cardCoverage({...event,cardSource:'ESPN'}, incoming, now), 'reject');
  assert.equal(cardCoverage({...event,cardCheckedAt:'2026-11-25T21:00:00Z'}, incoming, now), 'reject');
  assert.equal(cardCoverage(event, [...incoming,{f1:'Unknown Fighter',f2:'Another Fighter'}], now), 'reject');
});
