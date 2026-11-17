import fs from 'node:fs';
import {load} from 'cheerio';
const errors=[];let checked=0;
function page(path){const html=fs.readFileSync(`dist/${path}/index.html`,'utf8'),$=load(html);checked++;return {$,elements:$('body *').toArray(),path};}
function check(test,message){if(!test)errors.push(message);}
function answerFirst(p,before){const {$,elements,path}=p,answer=$('[data-answer-first]').first();check($('h1').length===1,`${path}: expected one H1`);check(answer.length===1&&answer.find('.answer-text').text().trim().length>=30,`${path}: answer missing`);check(elements.indexOf($('h1')[0])<elements.indexOf(answer[0]),`${path}: answer must follow H1`);if(before)check(elements.indexOf(answer[0])<elements.indexOf($(before)[0]),`${path}: main answer follows supporting content`);answer.find('a[href^="#"]').each((_,el)=>{const id=$(el).attr('href').slice(1);check($('[id]').toArray().some(node=>$(node).attr('id')===id),`${path}: missing answer destination #${id}`);});}
for(const slug of ['ilia-topuria','movsar-evloev','petr-yan','kevin-vallejos'])answerFirst(page(`peleadores/${slug}`),'#record');
for(const slug of fs.readdirSync('src/content/blog').filter(x=>x.endsWith('.mdx')).map(x=>x.slice(0,-4))){const p=page(`blog/${slug}`);answerFirst(p,'.article-hero');check(p.elements.indexOf(p.$('#desarrollo')[0])<p.elements.indexOf(p.$('.article-tags')[0])||!p.$('.article-tags').length,`${p.path}: tags precede development`);}
for(const entry of fs.readdirSync('dist/comparar',{withFileTypes:true}).filter(x=>x.isDirectory()))answerFirst(page(`comparar/${entry.name}`),'#comparador-figuras');
for(const slug of ['ufc-fight-night-prochazka-vs-stirling-2026','ufc-334-gane-vs-hokit']){const path=`eventos/${slug}`;if(fs.existsSync(`dist/${path}/index.html`))answerFirst(page(path),'#cartelera');}
const calendar=page('eventos');answerFirst(calendar);check(!calendar.$('main').text().includes('cada lunes'), 'Calendar: obsolete weekly refresh claim');
const ranking=page('rankings');check(ranking.$('#campeones-titulo').length===1,'Rankings: missing champion overview');
console.log(JSON.stringify({checked,errors},null,2));if(errors.length)process.exitCode=1;
