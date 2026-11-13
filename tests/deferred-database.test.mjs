import test from 'node:test';import assert from 'node:assert/strict';import {readFile,access} from 'node:fs/promises';import {getPool} from '../server/database.mjs';import {createHandler} from '../server/portal-service.mjs';
test('schema is applied by Netlify migrations on deploy and frontend/auth entry can run without a database',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.dependencies['@netlify/database'],undefined);await access(new URL('../netlify/database/migrations/202611130001_portal.sql',import.meta.url));
 const previous=[process.env.NETLIFY_DB_URL,process.env.NETLIFY_DATABASE_URL];delete process.env.NETLIFY_DB_URL;delete process.env.NETLIFY_DATABASE_URL;
 try{
  assert.throws(getPool,error=>error.code==='DB_NOT_CONFIGURED');
  let user=null;
  const handler=createHandler({identity:{getUser:async()=>user},transaction:async()=>getPool(),getStore:()=>{throw Error('Should not access storage');}});
  assert.equal((await handler(new Request('https://example.invalid/api/auth/me'))).status,401);
  user={id:'00000000-0000-4000-8000-000000000001'};const response=await handler(new Request('https://example.invalid/api/auth/me'));
  assert.equal(response.status,503);assert.match((await response.json()).message,/ativação do banco/);
 }finally{for(const [i,key] of ['NETLIFY_DB_URL','NETLIFY_DATABASE_URL'].entries())if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}
});
