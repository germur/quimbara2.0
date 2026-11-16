import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import matter from 'gray-matter';
const root=new URL('../',import.meta.url),raw=fs.readFileSync(new URL('.rag/chunks.jsonl',root));
const chunks=raw.toString().trim().split(/\r?\n/).map(JSON.parse);
const index=JSON.parse(fs.readFileSync(new URL('public/buscador/indice.json',root)));
assert.equal(index.sourceHash,createHash('sha256').update(raw).digest('hex'),'Search index is stale');
assert.equal(index.docs.length,chunks.length);
for(let i=0;i<chunks.length;i++){
 const c=chunks[i],d=index.docs[i];
 assert.equal(d.i,c.id);assert.equal(d.u,c.url);assert.equal(d.t,c.titulo);
 assert.equal(d.v.length,384);assert.ok(d.v.every(n=>Number.isInteger(n)&&n>=-127&&n<=127));
}
for(const file of fs.readdirSync(new URL('src/content/blog/',root)).filter(f=>/\.mdx?$/.test(f))){
 const post=matter(fs.readFileSync(new URL('src/content/blog/'+file,root),'utf8'));
 if(post.data.draft)continue;
 const prefix='post:'+file.replace(/\.mdx?$/,'')+':';
 assert.ok(chunks.some(c=>c.id.startsWith(prefix)),'Published article missing from search: '+file);
}
console.log('Search index verified:',chunks.length,'current documents');
