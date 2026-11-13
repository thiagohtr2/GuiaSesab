import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomBytes,createHash} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import {PDFDocument} from 'pdf-lib';import {createHandler,CHUNK_SIZE} from '../server/portal-service.mjs';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('Netlify Functions service: verified identity, CSRF, server-side unit permissions, multipart upload and immutable original download',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile(new URL('../netlify/database/migrations/202611130001_portal.sql',import.meta.url),'utf8'));
  let active=null,passwordUpdates=0;
  const identities=Array.from({length:4},(_,i)=>({id:uid(i+1),email:`test${i}@example.invalid`,name:`Teste ${i}`}));
  const transaction=async(user,task)=>{
   await db.exec('begin');try{
    await db.query("select set_config('app.user_id',$1,true),set_config('app.bootstrap_master_id',$2,true)",[user.id,uid(1)]);
    await db.query('insert into public.gs_accounts(id,email) values($1,$2) on conflict(id) do update set email=excluded.email',[user.id,user.email]);
    const result=await task(db);await db.exec('commit');return result;
   }catch(e){await db.exec('rollback');throw e;}
  };
  const blobs=new Map();
  const store={async set(key,bytes,{onlyIfNew}={}){if(onlyIfNew&&blobs.has(key))return{modified:false};blobs.set(key,Buffer.from(bytes));return{modified:true};},async get(key,{type}={}){const bytes=blobs.get(key);if(!bytes)return null;if(type==='stream')return new ReadableStream({start(c){c.enqueue(bytes);c.close();}});return Uint8Array.from(bytes).buffer;},async delete(key){blobs.delete(key);}};
  const identity={getUser:async()=>active,verifyRequestOrigin(req){if(req.headers.get('origin')!==new URL(req.url).origin){const e=new Error('CSRF');e.name='AuthError';e.status=403;throw e;}},login:async()=>{active=identities[2];return active;},signup:async()=>identities[3],logout:async()=>{active=null;},requestPasswordRecovery:async()=>{},confirmEmail:async()=>identities[2],recoverPassword:async()=>identities[2],updateUser:async()=>{passwordUpdates++;return active;}};
  const handler=createHandler({identity,transaction,getStore:()=>store});
  const request=async(path,{method='GET',body,origin='https://site.example',bytes}={})=>{
   const headers={origin};if(body!==undefined)headers['content-type']='application/json';if(bytes)headers['content-type']='application/octet-stream';
   const result=await handler(new Request('https://site.example/api/'+path,{method,headers,body:bytes||body===undefined?bytes:JSON.stringify(body)}));
   return result;
  };
  const rpc=async(name,body={},status=200)=>{const r=await request('rpc/'+name,{method:'POST',body});const payload=await r.json();assert.equal(r.status,status,JSON.stringify(payload));return payload;};
  assert.equal((await request('data/gs_profiles')).status,401);
  active=identities[0];assert.equal((await request('auth/me')).status,200);
  await rpc('gs_save_profile',{p_name:'Master teste',p_crm:'1',p_rqe:'',p_specialty:'ANESTESIOLOGIA'});
  assert.equal((await db.query('select role from public.gs_profiles where id=$1',[uid(1)])).rows[0].role,'master','bootstrap uses server-owned UUID, not signup metadata');
  const a=await rpc('gs_create_unit',{p_name:'Unidade A',p_company:'Empresa A'}),b=await rpc('gs_create_unit',{p_name:'Unidade B',p_company:'Empresa B'});
  for(let i=1;i<4;i++){active=identities[i];await request('auth/me');await rpc('gs_save_profile',{p_name:'Teste '+i,p_crm:String(i+1),p_rqe:'',p_specialty:'ANESTESIOLOGIA'});}
  active=identities[0];for(const [n,unit] of [[2,a],[3,a],[4,b]])await rpc('gs_assign_unit',{p_user:uid(n),p_unit:unit});await rpc('gs_set_role',{p_user:uid(2),p_role:'admin'});
  await rpc('gs_set_deadline',{p_unit:a,p_reference:'2026-11-01',p_deadline:'2026-11-15'});
  const dashboard=await rpc('gs_dashboard',{p_reference:'2026-11-01'});assert.equal(dashboard.find(r=>r.unit_id===a).deadline,'2026-11-15');
  active=identities[2];await rpc('gs_save_profile',{p_name:'Tentativa',p_crm:'3',p_rqe:'',p_specialty:'ANESTESIOLOGIA',p_role:'master'},400);
  await rpc('gs_set_role',{p_user:uid(3),p_role:'admin'},400);await rpc('gs_actor',{},404);
  assert.equal((await request('data/gs_accounts')).status,404);assert.equal((await request('data/gs_profiles?id=eq.invalid')).status,400);
  assert.equal((await request('rpc/gs_save_profile',{method:'POST',origin:'https://attacker.example',body:{p_name:'x',p_crm:'',p_rqe:'',p_specialty:''}})).status,403);
  await rpc('gs_register_generation',{p_unit:b,p_reference:'2026-11-01',p_guide_pages:2,p_total_pages:3},400);
  const guide=await rpc('gs_register_generation',{p_unit:a,p_reference:'2026-11-01',p_guide_pages:2,p_total_pages:3});
  const pdf=await PDFDocument.create();for(let i=0;i<3;i++)pdf.addPage().drawText(i===2?'REPORT':'GUIDE');await pdf.attach(randomBytes(2*CHUNK_SIZE+200),'test.bin');const bytes=await pdf.save();
  const sha=createHash('sha256').update(bytes).digest('hex');
  const upload=await rpc('gs_reserve_upload',{p_guide:guide,p_sha256:sha,p_total_pages:3,p_original_name:'teste.pdf',p_byte_size:bytes.byteLength});
  const chunkUrl=i=>`files/chunk?upload=${upload.id}&index=${i}`;
  assert.equal((await request(chunkUrl(0),{method:'POST',bytes:bytes.slice(0,12)})).status,400);
  await rpc('gs_finalize_upload',{p_upload:upload.id},409);
  for(let offset=0;offset<bytes.byteLength;offset+=CHUNK_SIZE)assert.equal((await request(chunkUrl(offset/CHUNK_SIZE),{method:'POST',bytes:bytes.slice(offset,offset+CHUNK_SIZE)})).status,200);
  assert.equal((await request(chunkUrl(0),{method:'POST',bytes:bytes.slice(0,CHUNK_SIZE)})).status,200,'same chunk retry is idempotent');
  active=identities[3];assert.equal((await request(chunkUrl(0),{method:'POST',bytes:bytes.slice(0,CHUNK_SIZE)})).status,404);
  assert.equal((await request('files?path='+upload.path)).status,404);
  assert.equal((await request('data/gs_uploads?select=*')).status,200);assert.deepEqual(await (await request('data/gs_uploads?select=*')).json(),[]);
  active=identities[2];await rpc('gs_finalize_upload',{p_upload:upload.id});
  assert.equal(blobs.size,1,'transport parts removed, immutable original retained');assert.deepEqual(blobs.get('originals/'+upload.path),Buffer.from(bytes));
  const original=await request('files?path='+upload.path);assert.equal(original.status,200);assert.deepEqual(Buffer.from(await original.arrayBuffer()),Buffer.from(bytes));assert.equal(original.headers.get('cache-control'),'private, no-store');
  assert.equal((await request(chunkUrl(0),{method:'POST',bytes:bytes.slice(0,CHUNK_SIZE)})).status,409,'finalized originals cannot be overwritten');
  active=identities[1];assert.equal((await request('files?path='+upload.path)).status,200,'own-unit admin may read originals');
  const records=await (await request('data/gs_uploads?unit_id=eq.'+b)).json();assert.equal(records.length,0);
  active=identities[2];const password=await request('auth/password',{method:'POST',body:{password:'new-secure-test-password'}});assert.equal(password.status,200);assert.equal(passwordUpdates,1);
  await rpc('gs_reserve_upload',{p_guide:guide,p_sha256:sha,p_total_pages:3,p_original_name:'big.pdf',p_byte_size:15*1024*1024+1},400);
 }finally{await db.close();}
});
