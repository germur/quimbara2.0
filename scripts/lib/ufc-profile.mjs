import {load} from 'cheerio';
import {sameMediaName} from '../../src/lib/fighter-media.mjs';
import {identityName} from './fighter-identity.mjs';
export function parseUfcProfile(html){
 const $=load(html),name=$('h1').first().text().trim(),fields={};
 $('.c-bio__field').each((_,el)=>fields[$(el).find('.c-bio__label').text().trim().toLowerCase()]=$(el).find('.c-bio__text').text().trim());
 const height=parseFloat(fields.height??fields.alto??fields.altura),weight=parseFloat(fields.weight??fields.peso),reach=parseFloat(fields.reach??fields.alcance);
 const heightText=Number.isFinite(height)?Math.floor(height/12)+"' "+Math.round(height%12)+'"':'';
 return {name,rec:$('.hero-profile__division-body').first().text().match(/\b\d+-\d+-\d+\b/)?.[0],height:heightText,weight:Number.isFinite(weight)?weight+' lbs':'',reach:Number.isFinite(reach)?reach+'"':'',nick:$('.hero-profile__nickname').first().text().trim().replace(/^"|"$/g,''),from:fields['place of birth']??fields['ciudad natal']??''};
}
export const profileNameMatches=(name,profile)=>identityName(name)===identityName(profile.name)||sameMediaName(name,profile.name);
