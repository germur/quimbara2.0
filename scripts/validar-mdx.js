import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import {pathToFileURL} from 'node:url';
export function validateEditorial(content){
 const {data}=matter(content),errors=[];
 if(content.includes('[['))errors.push('Usa enlaces Markdown estándar en lugar de enlaces Obsidian.');
 if(typeof data.title!=='string'||!data.title.trim())errors.push('Falta un título válido.');
 else if(data.title.length>100)errors.push('El título supera 100 caracteres.');
 if(typeof data.description!=='string'||!data.description.trim())errors.push('Falta una descripción válida.');
 else if(data.description.length>160)errors.push('La descripción supera 160 caracteres.');
 return errors;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
 try{
  const data=JSON.parse(input||'{}');if(data.toolResult?.isError||data.tool_result?.isError)return;
  const args=data.tool_input??data.toolArgs??{};
  const target=args.file_path??args.path??args.filePath;
  if(typeof target!=='string')return;
  const file=path.resolve(target),blog=path.resolve('src/content/blog')+path.sep;
  if(!file.startsWith(blog)||!(/\.mdx?$/i.test(file)))return;
  if(!fs.existsSync(file))throw new Error('El artículo esperado no existe: '+target);
  const errors=validateEditorial(fs.readFileSync(file,'utf8'));
  if(errors.length){console.error(path.basename(file)+': '+errors.join('\n'));process.exitCode=1;}
 }catch(error){console.error('Error del validador editorial:',error.message);process.exitCode=1;}
});
}
