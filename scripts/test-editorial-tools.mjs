import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {validateEditorial} from './validar-mdx.js';
test('editorial validator handles ESM, CRLF and unquoted YAML values',()=>{
 const good='---\r\ntitle: Un título\r\ndescription: Una descripción válida.\r\n---\r\n## Historia\r\nContenido';
 assert.deepEqual(validateEditorial(good),[]);
 assert.ok(validateEditorial(good.replace('Un título','x'.repeat(101))).some(e=>e.includes('100')));
 assert.ok(validateEditorial(good+'\r\n[[obsolete]]').length);
 const result=spawnSync(process.execPath,['scripts/validar-mdx.js'],{input:'{}',encoding:'utf8'});assert.equal(result.status,0);
 const malformed=spawnSync(process.execPath,['scripts/validar-mdx.js'],{input:'{',encoding:'utf8'});assert.equal(malformed.status,1);
});
