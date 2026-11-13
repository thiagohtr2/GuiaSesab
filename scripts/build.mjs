import {mkdir,rm,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),dist=new URL('dist/',root);
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const file of ['index.html','portal.html','admin.html','assets'])await cp(new URL(file,root),new URL(file,dist),{recursive:true});
console.log('Site estático preparado em '+fileURLToPath(dist));
