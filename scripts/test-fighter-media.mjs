import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolvePerson,createFighterMedia} from '../src/lib/fighter-media.mjs';
import {parseDirectory} from './sync-photo-sources.mjs';
test('photo identity accepts verified name variants without choosing an ambiguous surname',()=>{
 const people=[{name:'Shara Magomedov',slug:'shara-magomedov',img:'/fighters/shara.png'},{name:'Abus Magomedov',slug:'abus-magomedov',img:'/fighters/abus.png'},{name:'Doo Ho Choi',slug:'doo-ho-choi'},{name:'Michael Aswell',slug:'michael-aswell'}];
 assert.equal(resolvePerson('Sharabutdin Magomedov',people)?.slug,'shara-magomedov');
 assert.equal(resolvePerson('Magomedov',people,{surname:true}),null);
 assert.equal(resolvePerson('Choi Doo-ho',people)?.slug,'doo-ho-choi');
 assert.equal(resolvePerson('Choi Doo-ho',[{name:'Dooho Choi',slug:'dooho-choi'}])?.slug,'dooho-choi');
 assert.equal(resolvePerson('Beatriz Mesquita',[{name:'Bia Mesquita',slug:'bia-mesquita'}])?.slug,'bia-mesquita');
 assert.equal(resolvePerson('Regina Tarin',[{name:'Regina Malpica Rivera',slug:'regina-malpica-rivera',photoAliases:['Regina Tarin']}])?.slug,'regina-malpica-rivera');
 assert.equal(resolvePerson('Michael Aswell Jr.',people)?.slug,'michael-aswell');
 const photo=createFighterMedia(people,new Map([['shara-magomedov','/fighters/shara.png']]));
 assert.equal(photo('Sharabutdin Magomedov').photo,'/fighters/shara.png');
 assert.equal(photo('Abus Magomedov').photo,'');
});
test('directory parser ignores publisher placeholders and retains canonical athlete profiles',()=>{
 const parsed=parseDirectory('<div class="c-listing-athlete-flipcard"><span class="c-listing-athlete__name">Mairon Santos</span><a href="/athlete/mairon-santos-alves">Profile</a><img src="/no-profile-image.png"><img src="/images/styles/event_fight_card_upper_body_of_standing_athlete/s3/santos.png"></div><div class="pager"><a rel="next" href="?page=1">Next</a></div>','https://www.ufc.com/athletes/all');
 assert.equal(parsed.athletes[0].slug,'mairon-santos-alves');
 assert.equal(parsed.athletes[0].images.length,1);
 assert.equal(parsed.next,'?page=1');
});
