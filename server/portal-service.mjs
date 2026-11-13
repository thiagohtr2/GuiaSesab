import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
export const CHUNK_SIZE=1024*1024, MAX_FILE=15*1024*1024;
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new HttpError(status,message);};
const uuid=v=>{if(typeof v!=='string'||!uuidPattern.test(v))fail(400,'Identificador inválido.');return v;};
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(400,'Data inválida.');return v;};
const reference=v=>{date(v);if(!v.endsWith('-01')||v<'2020-01-01'||v>'2100-12-01')fail(400,'Mês de referência inválido.');return v;};
const text=(v,max=180)=>{if(typeof v!=='string'||v.length>max)fail(400,'Texto inválido ou muito longo.');return v;};
const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)fail(400,'Número inválido.');return v;};
const nullableUuid=v=>v===null?null:uuid(v);
const bool=v=>{if(typeof v!=='boolean')fail(400,'Valor inválido.');return v;};
const hash=bytes=>createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
const publicUser=u=>u?{id:u.id,email:u.email||'',user_metadata:{name:u.name||u.userMetadata?.full_name||u.userMetadata?.name||''}}:null;
const RPC={
 gs_save_profile:[['p_name',v=>text(v,120)],['p_crm',v=>text(v,40)],['p_rqe',v=>text(v,40)],['p_specialty',v=>text(v,80)]],
 gs_create_unit:[['p_name',v=>text(v,160)],['p_company',v=>text(v,80)]],
 gs_request_unit:[['p_unit',uuid]],gs_assign_unit:[['p_user',uuid],['p_unit',nullableUuid]],
 gs_decide_request:[['p_id',uuid],['p_approve',bool]],gs_set_role:[['p_user',uuid],['p_role',v=>text(v,12)]],
 gs_set_deadline:[['p_unit',uuid],['p_reference',reference],['p_deadline',date]],
 gs_register_generation:[['p_unit',uuid],['p_reference',reference],['p_guide_pages',v=>integer(v,1,6)],['p_total_pages',v=>integer(v,1,30)]],
 gs_reserve_upload:[['p_guide',uuid],['p_sha256',v=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail(400,'Hash inválido.');return v;}],['p_total_pages',v=>integer(v,1,30)],['p_original_name',v=>text(v,180)],['p_byte_size',v=>integer(v,1,MAX_FILE)]],
 gs_create_batch:[['p_unit',uuid],['p_reference',reference],['p_uploads',v=>{if(!Array.isArray(v)||v.length<1||v.length>200)fail(400,'Lote inválido.');return v.map(uuid);}]],
 gs_confirm_print:[['p_batch',uuid]],gs_mark_sent:[['p_guide',uuid],['p_upload',uuid]],gs_reopen:[['p_guide',uuid]],
 gs_dashboard:[['p_reference',reference]],gs_users:[]
};
export async function runRpc(client,name,body){
 const spec=RPC[name];if(!spec)fail(404,'Operação indisponível.');
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!spec.some(([key])=>key===k)))fail(400,'Parâmetros inválidos.');
 const values=spec.map(([key,validate])=>validate(body[key]));
 const call=`public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')})`;
 const result=await client.query(['gs_dashboard','gs_users'].includes(name)?'select to_jsonb(t) as row from '+call+' t':'select '+call+' as value',values);
 return ['gs_dashboard','gs_users'].includes(name)?result.rows.map(r=>r.row):result.rows[0]?.value??null;
}
const conditions={
 gs_profiles:'(id=public.gs_actor() or public.gs_can_manage(unit_id))',gs_units:'true',gs_months:'true',
 gs_requests:'(user_id=public.gs_actor() or public.gs_can_manage(unit_id))',
 gs_guides:'(user_id=public.gs_actor() or public.gs_can_manage(unit_id))',gs_uploads:'(user_id=public.gs_actor() or public.gs_can_manage(unit_id))',
 gs_batches:'public.gs_can_manage(unit_id)',gs_events:'(actor=public.gs_actor() or public.gs_can_manage(unit_id) or public.gs_is_master())'
};
const fields={gs_profiles:['id','unit_id'],gs_units:['id'],gs_months:['unit_id','reference'],gs_requests:['id','user_id','unit_id','status'],gs_guides:['id','unit_id','user_id','reference'],gs_uploads:['id','unit_id','guide_id','finalized_at'],gs_batches:['id','unit_id','reference'],gs_events:['unit_id']};
export async function readData(client,table,params){
 if(!conditions[table])fail(404,'Dados indisponíveis.');
 const clauses=[conditions[table]],values=[];let order='',limit=2000;
 const seen=new Set();
 for(const [key,value] of params){
  if(seen.has(key))fail(400,'Filtro repetido.');seen.add(key);
  if(key==='select'){if(value!=='*')fail(400,'Seleção inválida.');continue;}
  if(key==='limit'){limit=integer(Number(value),1,2000);continue;}
  if(key==='order'){
   const [column,direction,...extra]=value.split('.');
   if(extra.length||!['name','created_at','generated_at'].includes(column)||!['asc','desc'].includes(direction))fail(400,'Ordenação inválida.');
   if(column==='name'&&!['gs_units','gs_profiles'].includes(table)||column==='generated_at'&&table!=='gs_guides'||column==='created_at'&&table==='gs_months')fail(400,'Ordenação indisponível.');
   order=` order by ${column} ${direction}`;continue;
  }
  if(!fields[table].includes(key))fail(400,'Filtro indisponível.');
  if(key==='finalized_at'&&value==='not.is.null'){clauses.push('finalized_at is not null');continue;}
  if(!value.startsWith('eq.'))fail(400,'Filtro inválido.');
  let item=value.slice(3);
  if(['id','user_id','unit_id','guide_id'].includes(key))item=uuid(item);
  else if(key==='reference')item=reference(item);
  else if(key==='status'){if(!['pending','approved','rejected'].includes(item))fail(400,'Situação inválida.');}
  else fail(400,'Filtro inválido.');
  values.push(item);clauses.push(`${key}=$${values.length}`);
 }
 values.push(limit);
 return (await client.query(`select to_jsonb(t) as row from public.${table} t where ${clauses.join(' and ')}${order} limit $${values.length}`,values)).rows.map(r=>r.row);
}
async function uploadIntent(client,id,write=false){
 const {rows}=await client.query(`select u.*,g.revision as current_revision,g.sent_at,p.unit_id as active_unit
 from public.gs_uploads u join public.gs_guides g on g.id=u.guide_id join public.gs_profiles p on p.id=u.user_id
 where u.id=$1 and u.user_id=public.gs_actor()${write?' for update of u':''}`,[uuid(id)]);
 const u=rows[0];if(!u)fail(404,'Anexo indisponível.');
 if(u.finalized_at||u.sent_at||u.revision!==u.current_revision||u.unit_id!==u.active_unit||Date.now()-new Date(u.created_at).getTime()>86400000)fail(409,'Este envio expirou ou a guia mudou. Selecione o arquivo novamente.');
 return u;
}
export async function storeChunk({transaction,user,store,id,index,bytes}){
 const u=await transaction(user,c=>uploadIntent(c,id));
 if(!/^\d{1,2}$/.test(String(index)))fail(400,'Índice de parte inválido.');
 index=integer(Number(index),0,Math.ceil(u.byte_size/CHUNK_SIZE)-1);
 const expected=Math.min(CHUNK_SIZE,u.byte_size-index*CHUNK_SIZE);
 if(bytes.byteLength!==expected)fail(400,'Tamanho de parte inválido.');
 const key=`chunks/${u.id}/${index}`,sha=hash(bytes);
 const result=await store.set(key,bytes,{onlyIfNew:true,metadata:{sha256:sha}});
 if(!result.modified){const old=await store.get(key,{type:'arrayBuffer',consistency:'strong'});if(!old||hash(old)!==sha)fail(409,'Esta parte já foi enviada com outro conteúdo. Selecione o arquivo novamente.');}
}
export async function finalizeFile({transaction,user,store,body}){
 const id=uuid(body.p_upload);const u=await transaction(user,c=>uploadIntent(c,id));
 const chunks=[];
 for(let i=0;i<Math.ceil(u.byte_size/CHUNK_SIZE);i++){
  const chunk=await store.get(`chunks/${id}/${i}`,{type:'arrayBuffer',consistency:'strong'});
  if(!chunk)fail(409,'Upload incompleto. Envie o arquivo novamente.');chunks.push(Buffer.from(chunk));
 }
 const bytes=Buffer.concat(chunks);
 if(bytes.byteLength!==u.byte_size||hash(bytes)!==u.sha256)fail(400,'A integridade do arquivo não confere.');
 if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))fail(400,'O arquivo precisa ser um PDF.');
 let document;try{document=await PDFDocument.load(bytes);}catch{fail(400,'PDF protegido, corrompido ou incompatível.');}
 if(document.getPageCount()!==u.total_pages)fail(400,'A quantidade de páginas não corresponde à guia gerada.');
 const result=await store.set('originals/'+u.path,bytes,{onlyIfNew:true,metadata:{sha256:u.sha256,contentType:'application/pdf'}});
 if(!result.modified){const existing=await store.get('originals/'+u.path,{type:'arrayBuffer',consistency:'strong'});if(!existing||hash(existing)!==u.sha256)fail(409,'O original já existe e não pode ser alterado.');}
 await transaction(user,async c=>{await uploadIntent(c,id,true);await c.query('update public.gs_uploads set stored_at=now() where id=$1',[id]);await c.query('select public.gs_finalize_upload($1)',[id]);});
 // Only disposable transport chunks are removed, never original PDFs.
 await Promise.allSettled(chunks.map((_,i)=>store.delete(`chunks/${id}/${i}`)));
}
export async function fileRecord(client,path){
 if(typeof path!=='string'||path.length>200)fail(400,'Caminho inválido.');
 const {rows}=await client.query('select * from public.gs_uploads where path=$1 and finalized_at is not null and (user_id=public.gs_actor() or public.gs_can_manage(unit_id))',[path]);
 if(!rows[0])fail(404,'Arquivo indisponível para esta conta.');return rows[0];
}
async function jsonBody(req){
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Envie JSON.');
 if(Number(req.headers.get('content-length'))>32768)fail(413,'Solicitação muito grande.');
 const raw=await req.text();if(Buffer.byteLength(raw)>32768)fail(413,'Solicitação muito grande.');
 try{const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}catch{fail(400,'JSON inválido.');}
}
export function errorResponse(error){
 if(error instanceof HttpError)return Response.json({message:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
 if(error.code==='P0001'||error.code==='23514')return Response.json({message:error.code==='P0001'?error.message:'Dados inválidos. Confira os campos.'},{status:400,headers:{'Cache-Control':'no-store'}});
 if(error.name==='MissingIdentityError')return Response.json({message:'O Netlify Identity ainda precisa ser habilitado para este site.'},{status:503,headers:{'Cache-Control':'no-store'}});
 if(error.name==='AuthError')return Response.json({message:error.status===403?'Acesso recusado. Confira a confirmação do e-mail.':'Não foi possível autenticar. Confira seus dados ou solicite um novo link.'},{status:Math.min(Math.max(error.status||400,400),503),headers:{'Cache-Control':'no-store'}});
 if(['42P01','42883'].includes(error.code))return Response.json({message:'O banco Netlify ainda precisa receber a migração do portal.'},{status:503,headers:{'Cache-Control':'no-store'}});
 // Do not expose SQL, connection strings, raw upstream responses, email or tokens.
 console.error('GuiaSesab API failure',{code:typeof error.code==='string'?error.code:'UNEXPECTED',type:error.name||'Error'});
 return Response.json({message:'O serviço está indisponível. Tente novamente em alguns instantes.'},{status:503,headers:{'Cache-Control':'no-store'}});
}
export function createHandler({identity,transaction,getStore}){
 return async req=>{
  try{
   const url=new URL(req.url),path=url.pathname.replace(/^\/api\//,'');
   if(!url.pathname.startsWith('/api/'))fail(404,'Endereço indisponível.');
   if(!['GET','POST'].includes(req.method))fail(405,'Método indisponível.');
   if(req.method==='POST')identity.verifyRequestOrigin(req);
   const respond=data=>Response.json(data,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   if(path.startsWith('auth/')&&path!=='auth/password'&&req.method==='POST'){
    const body=await jsonBody(req),action=path.slice(5);
    if(['login','signup','recover'].includes(action)){
     const email=text(body.email,320).trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'E-mail inválido.');
     if(action==='recover'){await identity.requestPasswordRecovery(email);return respond({ok:true});}
     const password=text(body.password,256);if(password.length<(action==='signup'?8:1))fail(400,'Use pelo menos oito caracteres na nova senha.');
     if(action==='login')return respond({user:publicUser(await identity.login(email,password))});
     if(await identity.getUser())fail(409,'Saia da conta atual antes de cadastrar outra pessoa.');
     const created=await identity.signup(email,password,{full_name:text(body.name,120).trim()});
     const active=await identity.getUser();return respond({user:active?.id===created.id?publicUser(active):null});
    }
    if(action==='confirm')return respond({user:publicUser(await identity.confirmEmail(text(body.token,2048)))});
    if(action==='reset'){
     const password=text(body.password,256);if(password.length<8)fail(400,'Use pelo menos oito caracteres na nova senha.');
     return respond({user:publicUser(await identity.recoverPassword(text(body.token,2048),password))});
    }
    if(action==='logout'){await identity.logout();return respond({ok:true});}
   }
   const user=await identity.getUser();if(!user)fail(401,'Entre na sua conta para continuar.');uuid(user.id);
   if(path==='auth/me'&&req.method==='GET'){await transaction(user,async()=>{});return respond({user:publicUser(user)});}
   if(path==='auth/password'&&req.method==='POST'){
    const body=await jsonBody(req),password=text(body.password,256);if(password.length<8)fail(400,'Use pelo menos oito caracteres na nova senha.');
    return respond({user:publicUser(await identity.updateUser({password}))});
   }
   if(path.startsWith('data/')&&req.method==='GET')return respond(await transaction(user,c=>readData(c,path.slice(5),url.searchParams)));
   if(path.startsWith('rpc/')&&req.method==='POST'){
    const name=path.slice(4),body=await jsonBody(req);
    if(name==='gs_finalize_upload'){if(Object.keys(body).length!==1)fail(400,'Parâmetros inválidos.');await finalizeFile({transaction,user,store:getStore(),body});return respond(null);}
    return respond(await transaction(user,c=>runRpc(c,name,body)));
   }
   if(path==='files/chunk'&&req.method==='POST'){
    if(req.headers.get('content-type')!=='application/octet-stream')fail(415,'Formato da parte inválido.');
    if(Number(req.headers.get('content-length'))>CHUNK_SIZE)fail(413,'Parte muito grande.');
    const bytes=await req.arrayBuffer();if(bytes.byteLength>CHUNK_SIZE)fail(413,'Parte muito grande.');
    await storeChunk({transaction,user,store:getStore(),id:url.searchParams.get('upload'),index:url.searchParams.get('index'),bytes});return respond({ok:true});
   }
   if(path==='files'&&req.method==='GET'){
    const record=await transaction(user,c=>fileRecord(c,url.searchParams.get('path')));
    const stream=await getStore().get('originals/'+record.path,{type:'stream',consistency:'strong'});if(!stream)fail(404,'Arquivo não encontrado.');
    return new Response(stream,{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="guia-assinada.pdf"'}});
   }
   fail(404,'Operação indisponível.');
  }catch(error){return errorResponse(error);}
 };
}
