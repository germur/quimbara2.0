import {test} from 'node:test';
import assert from 'node:assert/strict';
import {upcomingFights, bogotaDate, CARD_MAX_AGE, calendarUpcomingEvents} from '../src/lib/upcoming-fights.mjs';

const now = Date.parse('2026-11-17T12:00:00Z');
const people = [{name:'Kevin Vallejos',slug:'kevin-vallejos',nick:'El Chino',rec:'17-1-0',recScope:'pro'},
  {name:'Aljamain Sterling',slug:'aljamain-sterling',rec:'18-5-0',recScope:'ufc'}];
const bout = {f1:'Aljamain Sterling',f2:'Kevin Vallejos',f1Id:'aljamain-sterling',f2Id:'kevin-vallejos',order:1,sourceStatus:'STATUS_SCHEDULED'};
const event = {slug:'home-test-event',name:'UFC',date:'2026-11-21',status:'upcoming',cardCheckedAt:new Date(now - 3600000).toISOString(),fightCard:[bout]};
const select = (patch={}, options={}) => upcomingFights([{...event,...patch}],people,{now,...options});

test('announced opponents link to their own profiles and only professional records are labeled', () => {
  const result = select();
  assert.equal(result.bouts[0].right.href,'/peleadores/kevin-vallejos/');
  assert.equal(result.bouts[0].right.record,'17-1-0');
  assert.equal(result.bouts[0].left.record,null);
  assert.equal(result.href,'/eventos/home-test-event/');
});
test('failed, expired, future-dated and missing checks cannot promote an old card', () => {
  for (const patch of [{cardFetchError:'HTTP 503'}, {cardCheckedAt:null}, {cardCheckedAt:'invalid'},
    {cardCheckedAt:new Date(now-CARD_MAX_AGE).toISOString()}, {cardCheckedAt:new Date(now+1).toISOString()}]) assert.equal(select(patch),null);
});
test('past, cancelled, postponed, unconfirmed and distant events are excluded', () => {
  for (const status of ['cancelled','postponed','unconfirmed']) assert.equal(select({status}),null);
  // The base feed sometimes labels future events completed; a freshly scheduled bout and date take precedence.
  assert.ok(select({status:'completed'}));
  for (const date of ['2026-11-16','2026-02-30','2027-02-01']) assert.equal(select({date}),null);
});
test('only explicitly scheduled bouts with two different known names are promoted', () => {
  for (const patch of [{sourceStatus:'STATUS_CANCELED'}, {sourceStatus:'UNKNOWN'}, {sourceStatus:undefined},
    {status:'withdrawn'},{f2:'TBD'}, {f2:'TBA'}, {f2:'Opponent TBA'}, {f2:bout.f1}]) assert.equal(select({fightCard:[{...bout,...patch}]}),null);
});
test('order prioritizes main event and deduplicates reversed pairs', () => {
  const main={...bout,f1:'Jiri Prochazka',f2:'Navajo Stirling',bout:'Main Event',order:9};
  const result=select({fightCard:[bout,{...bout,f1:bout.f2,f2:bout.f1},main]});
  assert.equal(result.bouts.length,2);
  assert.equal(result.bouts[0].f1,'Jiri Prochazka');
});
test('Bogota date and expiry retain event on its local day only', () => {
  assert.equal(bogotaDate(Date.parse('2026-11-22T02:00:00Z')),'2026-11-21');
  const lateNow=Date.parse('2026-11-22T02:00:00Z');
  const result=select({cardCheckedAt:new Date(lateNow-1000).toISOString()},{now:lateNow});
  assert.equal(result.expires,Date.parse('2026-11-22T05:00:00Z'));
  assert.equal(select({cardCheckedAt:new Date(lateNow).toISOString()},{now:Date.parse('2026-11-22T05:00:00Z')}),null);
});
test('ambiguous identities do not link or borrow another athlete photograph', () => {
  const duplicates=[{name:'Bruno Silva',slug:'bruno-silva',img:'/wrong.png'}, {name:'Bruno Silva',slug:'bruno-silva-2',img:'/right.png'}];
  const sample={...event,fightCard:[{...bout,f1:'Bruno Silva',f1Id:undefined}]};
  assert.equal(upcomingFights([sample],duplicates,{now}).bouts[0].left.href,null);
  sample.fightCard[0].f1Id='bruno-silva-2';
  assert.equal(upcomingFights([sample],duplicates,{now}).bouts[0].left.photo,'/right.png');
});
test('selection advances to next fresh event automatically after event date', () => {
  const result=upcomingFights([{...event,date:'2026-11-16'},{...event,slug:'next',date:'2026-11-28'}],people,{now});
  assert.equal(result.event.slug,'next');
});

test('calendar ignores stale upcoming status after the Bogotá date changes', () => {
  const last = {...event, main:'Vallejos vs. Sterling'};
  const next = {...last, slug:'december-card', date:'2026-12-05'};
  const held = {...next, slug:'withdrawn-card', status:'postponed'};
  assert.deepEqual(calendarUpcomingEvents([last, next, held], Date.parse('2026-11-22T04:59:00Z')).map(e => e.slug), [last.slug, next.slug]);
  assert.deepEqual(calendarUpcomingEvents([last, next, held], Date.parse('2026-11-22T05:00:00Z')).map(e => e.slug), [next.slug]);
});
