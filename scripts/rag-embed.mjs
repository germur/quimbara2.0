// Incremental local embeddings: no paid API, stable public index format.
import fs from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),dir=join(ROOT,'.rag');
const MODEL='Xenova/paraphrase-multilingual-MiniLM-L12-v2',VERSION=MODEL+':fp32:v1';
const read=(file,fallback)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):fallback;
const chunkFile=join(dir,'chunks.jsonl');
if(!fs.existsSync(chunkFile))throw new Error('Run npm run rag:chunk -- --write first');
const chunks=fs.readFileSync(chunkFile,'utf8').trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
if(!chunks.length||new Set(chunks.map(c=>c.id)).size!==chunks.length)throw new Error('Empty or duplicate semantic chunks');
fs.mkdirSync(dir,{recursive:true});
const cacheFile=join(dir,'vector-cache.json'),previous=read(cacheFile,{}),cache=previous.version===VERSION?previous.entries??{}:{};
const hash=text=>createHash('sha256').update(text).digest('hex');
const work=chunks.map(c=>({id:c.id,text:(c.titulo??'')+'. '+c.texto})).map(c=>({...c,hash:hash(c.text)}));
const pending=work.filter(c=>cache[c.id]?.hash!==c.hash||cache[c.id]?.vector?.length!==384);
const questions=read(join(ROOT,'evaluacion/preguntas.json'),{preguntas:[]}).preguntas;
const queryFile=join(dir,'preguntas-vec.json'),queries=read(queryFile,{});
const missingQuestions=queries.version!==VERSION||questions.some(p=>!queries.mapa?.[p.q]);
console.log('Semantic cache:',chunks.length-pending.length,'reused;',pending.length,'to generate');
if(pending.length||missingQuestions){
 const {pipeline,env}=await import('@huggingface/transformers');env.cacheDir=join(dir,'model-cache');
 const embed=await pipeline('feature-extraction',MODEL,{dtype:'fp32'});
 for(let i=0;i<pending.length;i+=32){
  const batch=pending.slice(i,i+32),vectors=(await embed(batch.map(c=>c.text),{pooling:'mean',normalize:true})).tolist();
  for(let j=0;j<batch.length;j++){if(vectors[j].length!==384||vectors[j].some(n=>!Number.isFinite(n)))throw new Error('Invalid embedding');cache[batch[j].id]={hash:batch[j].hash,vector:vectors[j]};}
  if(i%512===0)fs.writeFileSync(cacheFile,JSON.stringify({version:VERSION,entries:cache}));
  console.log(Math.min(i+32,pending.length)+'/'+pending.length,'embedded');
 }
 if(missingQuestions&&questions.length){
  const values=(await embed(questions.map(p=>p.q),{pooling:'mean',normalize:true})).tolist();
  fs.writeFileSync(queryFile,JSON.stringify({modelo:MODEL,version:VERSION,mapa:Object.fromEntries(questions.map((p,i)=>[p.q,values[i]]))}));
 }
}
const liveIds=new Set(chunks.map(c=>c.id));for(const id of Object.keys(cache))if(!liveIds.has(id))delete cache[id];
fs.writeFileSync(cacheFile,JSON.stringify({version:VERSION,entries:cache}));
const vectors=work.map(c=>cache[c.id].vector);
fs.writeFileSync(join(dir,'vectores.json'),JSON.stringify({modelo:MODEL,dims:384,ids:chunks.map(c=>c.id),vectores:vectors}));
if(process.argv.includes('--publicar')){
 const index={modelo:MODEL,dims:384,escala:127,generado:new Date().toISOString(),sourceHash:hash(fs.readFileSync(chunkFile)),docs:chunks.map((c,i)=>({i:c.id,u:c.url,t:c.titulo,x:c.texto.slice(0,180),k:c.tipo,v:vectors[i].map(x=>Math.max(-127,Math.min(127,Math.round(x*127))))}))};
 fs.mkdirSync(join(ROOT,'public/buscador'),{recursive:true});fs.writeFileSync(join(ROOT,'public/buscador/indice.json'),JSON.stringify(index));
 console.log('Published current semantic index:',chunks.length,'documents');
}
