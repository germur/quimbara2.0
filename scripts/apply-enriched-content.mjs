// Apply the current authored overrides, never an obsolete hardcoded content batch.
import fs from 'node:fs';
const fighters=JSON.parse(fs.readFileSync('src/data/fighters.json'));
const overrides=JSON.parse(fs.readFileSync('src/data/fighters-overrides.json'));
const fields=['bio','style','trayectoria','faq','metaTitle','metaDescription','arma','styleMeta'];
let count=0;for(const f of fighters){const own=overrides[f.slug]??(!f.identityAmbiguousName||f.slug===f.name.toLowerCase().replaceAll(' ','-')?overrides[f.name]:undefined);if(!own)continue;for(const field of fields)if(Object.hasOwn(own,field))f[field]=own[field];count++;}
if(process.argv.includes('--write'))fs.writeFileSync('src/data/fighters.json',JSON.stringify(fighters,null,2)+'\n');
console.log(count,'authored profiles',process.argv.includes('--write')?'applied':'checked (use --write to apply)');
