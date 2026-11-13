// Aplica todas as migrações, na mesma ordem lexicográfica usada pelo Netlify.
import {readFile,readdir} from 'node:fs/promises';
const dir=new URL('../netlify/database/migrations/',import.meta.url);
export async function applySchema(db){
 const files=(await readdir(dir)).filter(f=>/^\d+_[a-z0-9_-]+\.sql$/.test(f)).sort();
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 return files;
}
