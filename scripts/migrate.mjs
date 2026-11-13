// Contingência manual. O caminho normal é a migração automática do Netlify no deploy
// (netlify/database/migrations). Este script só aplica o esquema se ele ainda não existir.
import {readFile} from 'node:fs/promises';
import {getPool} from '../server/database.mjs';
const pool=getPool(),client=await pool.connect();
try{
 await client.query('begin');await client.query("select pg_advisory_xact_lock(hashtext('guiasesab_schema_migration'))");
 const id='202611130001_portal';
 if((await client.query("select to_regclass('public.gs_accounts') as t")).rows[0].t){console.log('Esquema do portal já existe; nada a fazer.');}
 else{
  const sql=await readFile(new URL('../netlify/database/migrations/'+id+'.sql',import.meta.url),'utf8');
  await client.query(sql);console.log('Migração do portal aplicada.');
 }
 await client.query('commit');
}catch(error){await client.query('rollback');console.error('Migração não aplicada.',{code:error.code||'ERROR'});process.exitCode=1;}
finally{client.release();await pool.end();}
