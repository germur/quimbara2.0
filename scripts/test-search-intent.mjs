import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fighterAnswer,comparisonAnswer,nextFightLookup,resultsForEvent} from '../src/lib/search-intent.mjs';
const now=Date.parse('2026-11-17T12:00:00Z');
const people=[{slug:'kevin-vallejos',name:'Kevin Vallejos',rec:'18-1-0',recScope:'pro'},{slug:'aljamain-sterling',name:'Aljamain Sterling'}];
const bout={f1:'Aljamain Sterling',f2:'Kevin Vallejos',sourceStatus:'STATUS_SCHEDULED'};
const event={slug:'test-event',name:'UFC',date:'2026-11-21',cardCheckedAt:new Date(now-1000).toISOString(),fightCard:[bout]};
test('profile answers prioritize measured facts and preserve professional versus UFC scope',()=>{
 const answer=fighterAnswer(people[0],{heightCm:170,reachCm:173,division:'Pluma'});
 assert.match(answer,/^Kevin Vallejos mide 170 cm y tiene 173 cm de alcance/);
 assert.match(answer,/récord profesional es 18-1-0/);
 assert.match(fighterAnswer({...people[0],recScope:'ufc'},{reachCm:173}),/récord en UFC/);
 assert.doesNotMatch(fighterAnswer({...people[0],recScope:'unknown',rec:'0-0-0'},{heightCm:null,reachCm:null}),/0-0-0|mide|NaN/);
});
test('a scheduled participant gets the correct rival; stale, cancelled and unannounced cards do not promise a fight',()=>{
 assert.equal(nextFightLookup([event],people,now).get('kevin-vallejos').opponent,'Aljamain Sterling');
 for(const patch of [{status:'cancelled'},{status:'postponed'},{cardFetchError:'Unavailable'},{cardCheckedAt:'invalid'},{cardCheckedAt:new Date(now-73*3600000).toISOString()},{date:'2026-11-16'},{fightCard:[{...bout,f1:'Opponent TBA'}]},{fightCard:[{...bout,sourceStatus:'STATUS_CANCELED'}]}])assert.equal(nextFightLookup([{...event,...patch}],people,now).size,0);
});
test('cached announcements expire when the clock passes the freshness boundary',()=>{
 const events=[event];assert.ok(nextFightLookup(events,people,now).size);
 assert.equal(nextFightLookup(events,people,now+73*3600000).size,0);
});
test('comparison answers describe measurements, not predicted winners',()=>{
 const a={nombre:'A',fisico:{altura_cm:180,alcance_cm:190}},b={nombre:'B',fisico:{altura_cm:180,alcance_cm:185}};
 const text=comparisonAnswer(a,b);assert.match(text,/Ambos miden 180 cm/);assert.match(text,/A registra 5 cm más/);assert.doesNotMatch(text,/ganará|favorito|profesional|null/);
 assert.doesNotMatch(comparisonAnswer({...a,fisico:{}},b),/undefined|NaN|null/);
});
test('event results require the exact event name and the announced main fight',()=>{
 const past={name:'UFC 334',date:'2020-01-01',f1:'Ciryl Gane',f2:'Josh Hokit'};
 const result={event:'UFC 334 - Gane vs. Hokit',w:'Ciryl Gane',l:'Josh Hokit',outcome:'win',sourceUrl:'https://example.com/results',checkedAt:'2020-01-02'};
 assert.equal(resultsForEvent(past,[result]).length,1);
 assert.deepEqual(resultsForEvent({...past,name:'UFC 33'},[result]),[]);
 assert.deepEqual(resultsForEvent({...past,f2:'Other Athlete'},[result]),[]);
 assert.deepEqual(resultsForEvent({...past,date:'2099-01-01'},[result]),[]);
 assert.deepEqual(resultsForEvent(past,[{...result,checkedAt:'2019-12-01'}]),[]);
});
