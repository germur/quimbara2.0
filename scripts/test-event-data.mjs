import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRegistry} from './sync-event-urls.mjs';
import {eventStatus,schemaStatus,validDate,validTime,cardChanges,imageQueue} from '../src/lib/event-data.mjs';
import {horariosDeEvento,instanteDesdeET} from '../src/lib/horarios.mjs';
import {matchesProviderFight,rankingCoverageValid} from '../src/lib/event-data.mjs';

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
