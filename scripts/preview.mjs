// Prévia local do portal com dados fictícios, sem Netlify.
// Usa o mesmo serviço da API (server/portal-service.mjs) sobre PostgreSQL em WASM (PGlite),
// com login e armazenamento simulados. Nada aqui é publicado.
//
//   npm run preview            → http://localhost:8888/portal.html
//   /__preview/as?u=<n>        → troca a conta simulada (1 = master; 2 = admin; 3+ = médicos)
//
// Opcional: FONTS_DIR aponta para uma pasta node_modules com @fontsource/ibm-plex-* para
// usar as fontes sem acesso ao Google Fonts.
import http from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {extname,join,normalize} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {createHandler} from '../server/portal-service.mjs';

const root=new URL('..',import.meta.url).pathname;
const port=Number(process.env.PORT||8888);
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const db=new PGlite();
const migrations=new URL('../netlify/database/migrations/',import.meta.url);
for(const file of (await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,migrations),'utf8'));

// ---------- dados fictícios ----------
const today=new Date();
const ym=d=>d.toISOString().slice(0,7);
const thisMonth=ym(today),lastMonth=ym(new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-1,1)));
const at=(month,day,hm)=>new Date(`${month}-${String(day).padStart(2,'0')}T${hm}:00-03:00`).toISOString();
const people=[
 ['Thiago Rodrigues','32.303','18.942','master','A'],
 ['Maria Clara de Almeida Santos','45.881','23.107','admin','A'],
 ['João Pedro Barreto Lima','39.204','19.550','medico','A'],
 ['Ana Beatriz Nascimento Rocha','51.772','26.318','medico','A'],
 ['Rafael Monteiro Vasconcelos','28.916','14.072','medico','A'],
 ['Luciana Ferreira Andrade','47.330','24.889','medico','A'],
 ['Carlos Eduardo Sampaio Dias','36.015','17.443','medico','A'],
 ['Patrícia Gomes Carvalho','52.108','27.004','medico','A'],
 ['Bruno Teixeira Coelho','44.517','22.316','medico','A'],
 ['Fernanda Lopes Brandão','49.263','25.731','medico','A'],
 ['Gustavo Henrique Prado','38.640','','medico','A'],
 ['Juliana Moraes Pinheiro','53.019','27.845','medico','A'],
 ['Renata Queiroz Fontes','55.402','','medico',null],
 ['Marcos Vinícius Araújo','41.128','20.664','medico','B'],
 ['Sílvia Regina Matos','46.905','24.210','medico','B']
];
// [pessoa, mês, gerada, anexada, impressa, enviada] — dia/hora no horário de Salvador
const d=(day,hm)=>day?[day,hm]:null;
const plan={
 [thisMonth]:[
  [1,d(3,'08:14'),d(3,'09:02'),d(4,'07:40'),d(5,'10:12')],[2,d(4,'19:02'),d(5,'07:41'),d(6,'08:05')],
  [3,d(9,'22:37'),d(10,'06:58')],[4,d(10,'06:55'),d(11,'13:20')],[5,d(12,'21:10')],
  [8,d(2,'10:30'),d(2,'11:15'),d(3,'07:50'),d(4,'09:00')],[9,d(11,'18:44')],[10,d(6,'20:01'),d(7,'08:33')],
  [12,d(5,'09:12'),d(6,'10:40'),d(7,'07:55')],[14,d(4,'08:00'),d(4,'09:10')]
 ],
 [lastMonth]:[
  [1,d(2,'08:00'),d(3,'09:00'),d(5,'08:00'),d(6,'10:00')],[2,d(4,'08:00'),d(4,'10:00'),d(5,'08:00'),d(6,'10:00')],
  [3,d(9,'08:00'),d(10,'09:00'),d(11,'08:00'),d(12,'10:00')],[4,d(12,'08:00'),d(13,'09:00'),d(14,'08:00'),d(15,'10:00')],
  [5,d(20,'08:00'),d(21,'09:00'),d(22,'08:00'),d(23,'10:00')],[6,d(28,'21:00')],
  [8,d(3,'08:00'),d(3,'09:00'),d(4,'08:00'),d(5,'10:00')],[9,d(15,'08:00'),d(16,'09:00'),d(17,'08:00'),d(18,'10:00')],
  [10,d(18,'08:00'),d(19,'09:00'),d(20,'08:00'),d(21,'10:00')],
  [11,d(25,'08:00')] // Gustavo: entregou com atraso, no mês seguinte (abaixo)
 ]
};
const blobs=new Map();
async function guidePdf(name,month,guidePages,totalPages){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.HelveticaBold);
 for(let i=0;i<totalPages;i++){
  const page=pdf.addPage([595,842]),report=i>=guidePages;
  page.drawText(report?'RELATÓRIO DE HORAS':`GUIA SESAB · SEMANA ${i+1}`.replace('Ó','O'),{x:60,y:760,size:20,font,color:report?rgb(.6,.2,.2):rgb(.05,.3,.3)});
  page.drawText(`${name} · ${month} · prévia com dados fictícios`.normalize('NFD').replace(/[̀-ͯ]/g,''),{x:60,y:730,size:11,font});
 }
 return pdf.save();
}
await db.exec('begin');
for(const [i,[name]] of people.entries())await db.query('insert into public.gs_accounts(id,email) values($1,$2)',[uid(i+1),`conta${i+1}@exemplo.invalid`]);
const unitA=(await db.query("insert into public.gs_units(name,company,created_by) values('Hospital Geral Roberto Santos','CEDAB',$1) returning id",[uid(1)])).rows[0].id;
const unitB=(await db.query("insert into public.gs_units(name,company,created_by) values('Maternidade José Maria de Magalhães Neto','CEDAB',$1) returning id",[uid(1)])).rows[0].id;
for(const [i,[name,crm,rqe,role,unit]] of people.entries())
 await db.query('insert into public.gs_profiles(id,name,crm,rqe,role,unit_id) values($1,$2,$3,$4,$5,$6)',[uid(i+1),name,crm,rqe,role,unit==='A'?unitA:unit==='B'?unitB:null]);
await db.query("insert into public.gs_requests(user_id,unit_id) values($1,$2)",[uid(13),unitA]);
// Cadastros antigos, para que outubro e novembro sejam cobrados; Juliana (12) entrou em novembro.
await db.query("update public.gs_profiles set created_at=$1::date+interval '5 days' where id<>$2",[lastMonth+'-01',uid(12)]);
const late=[[11,lastMonth,null,[thisMonth,2,'14:30']]];
for(const [month,list] of Object.entries(plan))for(const [n,gen,up,printed,sent] of list){
 const person=people[n-1],unit=person[4]==='A'?unitA:unitB,guidePages=5,totalPages=6;
 const stamp=x=>x?at(month,...x):null;
 let uploaded=stamp(up);
 const extra=late.find(l=>l[0]===n&&l[1]===month);if(extra)uploaded=at(extra[3][0],extra[3][1],extra[3][2]);
 const g=(await db.query(`insert into public.gs_guides(user_id,unit_id,reference,guide_pages,total_pages,generated_at,uploaded_at,printed_at,printed_by,sent_at,sent_by)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9) returning id,revision`,[uid(n),unit,month+'-01',guidePages,totalPages,stamp(gen),uploaded,stamp(printed),printed?uid(2):null,stamp(sent)])).rows[0];
 if(!uploaded)continue;
 const bytes=await guidePdf(person[0],month,guidePages,totalPages),sha=createHash('sha256').update(bytes).digest('hex'),path=`${unit}/${month}/${g.id}.pdf`;
 blobs.set('originals/'+path,Buffer.from(bytes));
 const u=(await db.query(`insert into public.gs_uploads(guide_id,revision,user_id,unit_id,path,sha256,total_pages,guide_pages,original_name,byte_size,stored_at,created_at,finalized_at)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$11) returning id`,[g.id,g.revision,uid(n),unit,path,sha,totalPages,guidePages,'guia-assinada.pdf',bytes.byteLength,uploaded])).rows[0];
 await db.query('update public.gs_guides set current_upload_id=$1 where id=$2',[u.id,g.id]);
}
await db.exec('commit');

// ---------- serviço com login e Blobs simulados ----------
let current=null;
const identities=people.map(([name],i)=>({id:uid(i+1),email:`conta${i+1}@exemplo.invalid`,name}));
const transaction=async(user,task)=>{
 await db.exec('begin');
 try{
  await db.query("select set_config('app.user_id',$1,true),set_config('app.bootstrap_master_id',$2,true)",[user.id,uid(1)]);
  const result=await task(db);await db.exec('commit');return result;
 }catch(e){await db.exec('rollback');throw e;}
};
const store={
 async set(key,bytes,{onlyIfNew}={}){if(onlyIfNew&&blobs.has(key))return{modified:false};blobs.set(key,Buffer.from(bytes));return{modified:true};},
 async get(key,{type}={}){const bytes=blobs.get(key);if(!bytes)return null;if(type==='stream')return new ReadableStream({start(c){c.enqueue(bytes);c.close();}});return Uint8Array.from(bytes).buffer;},
 async delete(key){blobs.delete(key);}
};
const identity={
 getUser:async()=>current,verifyRequestOrigin(){},
 login:async email=>{current=identities.find(i=>i.email===email)||identities[0];return current;},
 signup:async()=>null,logout:async()=>{current=null;},requestPasswordRecovery:async()=>{},
 confirmEmail:async()=>current,recoverPassword:async()=>current,updateUser:async()=>current
};
const handler=createHandler({identity,transaction,getStore:()=>store});

// ---------- servidor ----------
const fontsDir=process.env.FONTS_DIR;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.pdf':'application/pdf','.jpg':'image/jpeg','.woff2':'font/woff2'};
const cookieUser=req=>Number(/(?:^|;\s*)preview_user=(\d+)/.exec(req.headers.cookie||'')?.[1]||1);
const fontsCss=()=>[['ibm-plex-sans',[400,500,600,700],'IBM Plex Sans'],['ibm-plex-mono',[400,500],'IBM Plex Mono']]
 .flatMap(([pkg,weights,family])=>weights.map(w=>`@font-face{font-family:'${family}';font-weight:${w};font-style:normal;font-display:swap;src:url(/__preview/font/${pkg}/${w}.woff2) format('woff2')}`)).join('\n');
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname==='/__preview/as'){res.writeHead(302,{'Set-Cookie':`preview_user=${Number(url.searchParams.get('u'))||1}; Path=/`,Location:'/portal.html'});return res.end();}
  if(url.pathname==='/__preview/pdf-lib.min.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(await readFile(join(root,'node_modules/pdf-lib/dist/pdf-lib.min.js')));}
  if(url.pathname==='/__preview/fonts.css'){res.writeHead(200,{'Content-Type':'text/css'});return res.end(fontsDir?fontsCss():'');}
  const font=/^\/__preview\/font\/(ibm-plex-(?:sans|mono))\/(\d{3})\.woff2$/.exec(url.pathname);
  if(font&&fontsDir){res.writeHead(200,{'Content-Type':'font/woff2'});return res.end(await readFile(join(fontsDir,`@fontsource/${font[1]}/files/${font[1]}-latin-${font[2]}-normal.woff2`)));}
  if(url.pathname.startsWith('/api/')){
   const n=cookieUser(req);current=n?identities[n-1]:null;
   const chunks=[];for await(const c of req)chunks.push(c);
   const body=['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks);
   const response=await handler(new Request(url,{method:req.method,headers:req.headers,body}));
   const headers=Object.fromEntries(response.headers);
   if(url.pathname==='/api/auth/logout')headers['set-cookie']='preview_user=0; Path=/';
   if(url.pathname==='/api/auth/login'&&current)headers['set-cookie']=`preview_user=${identities.indexOf(current)+1}; Path=/`;
   res.writeHead(response.status,headers);return res.end(Buffer.from(await response.arrayBuffer()));
  }
  let file=normalize(url.pathname==='/'?'/index.html':url.pathname);
  if(file.includes('..'))throw Object.assign(new Error('not found'),{code:'ENOENT'});
  let data=await readFile(join(root,file));
  if(extname(file)==='.html')data=Buffer.from(data.toString()
   .replace('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js','/__preview/pdf-lib.min.js')
   .replace(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/,'/__preview/fonts.css'));
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end(String(e.code==='ENOENT'?'Não encontrado':e.stack));}
}).listen(port,()=>console.log(`Prévia com dados fictícios: http://localhost:${port}/portal.html`));
