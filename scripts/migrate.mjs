// Explicit opt-in operation. Never called by the website build.
import {readFile} from 'node:fs/promises';
import {getPool} from '../server/database.mjs';
const pool=getPool(),client=await pool.connect();
try{
 await client.query('begin');await client.query("select pg_advisory_xact_lock(hashtext('guiasesab_schema_migration'))");
 await client.query('create table if not exists public.gs_schema_migrations(id text primary key,applied_at timestamptz not null default now())');
 const id='202611130001_portal';
 if((await client.query('select id from public.gs_schema_migrations where id=$1',[id])).rowCount){console.log('Migração já aplicada.');}
 else{
  const sql=(await readFile(new URL('../db/netlify/'+id+'.sql',import.meta.url),'utf8')).replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
  await client.query(sql);await client.query('insert into public.gs_schema_migrations(id) values($1)',[id]);console.log('Migração do portal aplicada.');
 }
 await client.query('commit');
}catch(error){await client.query('rollback');console.error('Migração não aplicada.',{code:error.code||'ERROR'});process.exitCode=1;}
finally{client.release();await pool.end();}
