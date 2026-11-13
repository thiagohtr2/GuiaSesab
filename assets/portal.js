import * as api from './api.js';
import {inspectPdf,sha256,mergeForPrint} from './pdf-workflow.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tz='America/Bahia';
const nowDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stamp=v=>v ? new Intl.DateTimeFormat('pt-BR',{timeZone:tz,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)) : '';
const dateOnly=v=>v ? v.split('-').reverse().join('/') : '';
const ref=()=>$('#reference').value+'-01';
const DAY=86400000;
const dayOf=v=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const diffDays=(from,to)=>Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/DAY);
const plural=(n,one,many)=>n+' '+(n===1?one:many);
const pad=n=>String(n).padStart(2,'0');
const short=v=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:tz,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v)).replace(', ',' · '):'';
const clock=v=>new Intl.DateTimeFormat('pt-BR',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(new Date(v));
const monthName=ym=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(ym.slice(0,7)+'-15T12:00:00Z'));
const monthOnly=ym=>new Intl.DateTimeFormat('pt-BR',{month:'long',timeZone:'UTC'}).format(new Date(ym.slice(0,7)+'-15T12:00:00Z'));
const shiftMonth=(ym,n)=>{const [y,m]=ym.split('-').map(Number);return new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);};
const lastDay=ym=>{const [y,m]=ym.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);};
const fold=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('pt-BR');
// Situação de cada médico no mês. "Entregue" = PDF assinado anexado no portal.
const STATUS={pendente:['Pendente','neutral'],atraso:['Em atraso','danger'],imprimir:['Esperando impressão','warning'],impressa:['Impressa','info'],concluida:['Concluída','success']};
function situation(r) {
 const today=nowDate(),dl=r.deadline||lastDay(ref());
 if(r.uploaded_at) {
  const late=diffDays(dl,dayOf(r.uploaded_at)),note=late>0?`entregue com ${plural(late,'dia','dias')} de atraso`:'entregue no prazo';
  if(r.sent_at)return {key:'concluida',detail:note,late:late>0};
  if(r.printed_at)return {key:'impressa',detail:'falta confirmar o envio · '+note,late:late>0};
  return {key:'imprimir',detail:note,late:late>0};
 }
 const step=r.generated_at?'gerada, falta anexar assinada':'guia ainda não gerada';
 if(today>dl)return {key:'atraso',detail:`${plural(diffDays(dl,today),'dia','dias')} de atraso · ${step}`,late:true};
 const left=diffDays(today,dl);
 return {key:'pendente',detail:step+' · '+(left===0?'prazo termina hoje':`faltam ${plural(left,'dia','dias')}`)};
}
let chip='all',prevRows=[],printing=null;
let user=null,profile=null,units=[],months=[],rows=[],requests=[],adminGuides=[],uploads=[],users=[],events=[],batches=[],view='dashboard',authMode='login',loadVersion=0,toastTimer,blobUrls=[],lastUpdated=null;
const isMaster=()=>profile?.role==='master';
const isAdmin=()=>['master','admin'].includes(profile?.role);
const selectedUnit=()=>$('#unit-filter').value;
const canManage=(unit=selectedUnit())=>!!unit && (isMaster()||(profile?.role==='admin'&&profile.unit_id===unit));
// Só entra na cobrança do mês quem já tinha cadastro até o prazo daquele mês (ou quem gerou guia nele).
const visibleRows=(list=rows)=>list.filter(r=>r.unit_id&&r.unit_id===selectedUnit()&&(r.guide_id||!r.member_since||!r.deadline||dayOf(r.member_since)<=r.deadline));
function notify(msg,error=false) { const el=$('#toast');el.textContent=msg;el.hidden=false;el.style.background=error?'#963d32':'';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,6500); }
function globalMessage(msg,error=false) { const el=$('#global-message');el.textContent=msg;el.classList.toggle('error',error);el.hidden=!msg; }
async function busy(el,task) { if(el?.disabled)return;const text=el?.textContent;if(el){el.disabled=true;el.textContent='Aguarde…';}try{return await task();}catch(e){notify(e.message,true);}finally{if(el){el.disabled=false;el.textContent=text;}} }
async function confirmAction(title,copy) { const dialog=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-copy').textContent=copy;dialog.returnValue='cancel';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true})); }
const initials=name=>name.trim().split(/\s+/).filter(Boolean).filter((_,i,a)=>i===0||i===a.length-1).map(n=>n[0]).join('').slice(0,2).toUpperCase();
function badge(r) {
 if(!r.unit_id)return '<span class="badge">Sem unidade</span>';
 const [label,tone]=STATUS[situation(r).key];return `<span class="badge ${tone}">${label}</span>`;
}
const stage=(value,label)=>value?`<span class="stage done">${label}</span><time class="date" datetime="${esc(value)}">${esc(stamp(value))}</time>`:'<span class="stage empty">—</span>';
function setView(next) {
 if(next==='manage'&&!isAdmin())next='dashboard';view=next;
 ['dashboard','mine','account','manage'].forEach(v=>$('#view-'+v).hidden=v!==next);$$('.dash-only').forEach(el=>el.hidden=next!=='dashboard');
 $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
 const titles={dashboard:['ACOMPANHAMENTO MENSAL','Dashboard','Quem já emitiu, entregou e teve a guia impressa no mês.'],mine:['SEU FLUXO DO MÊS','Minha guia','Gere, assine pelo gov.br e anexe o original.'],account:['SEU ESPAÇO','Minha conta','Mantenha seus dados profissionais atualizados.'],manage:['GESTÃO DA UNIDADE','Administração','Prazos, equipe e entregas sob controle.']};
 const t=titles[next];$('#page-eyebrow').textContent=t[0];$('#page-title').textContent=t[1];$('#page-description').textContent=t[2];
 try{history.replaceState(null,'','portal.html?view='+next+(document.body.classList.contains('tv-mode')?'&painel=1':''));}catch{}
}
function renderDashboard() {
 const unit=units.find(u=>u.id===selectedUnit()),data=visibleRows().map(r=>({...r,s:situation(r)}));
 const total=data.length,count=k=>data.filter(r=>r.s.key===k).length;
 const delivered=data.filter(r=>r.uploaded_at).length,pending=count('pendente'),late=count('atraso'),waiting=count('imprimir'),printed=data.filter(r=>r.printed_at).length;
 const deadline=data[0]?.deadline||lastDay(ref()),custom=!!data[0]?.deadline_custom,today=nowDate();
 $('#team-title').textContent=unit?'Equipe · '+unit.name:'Equipe da unidade';
 const bar=total?Math.round(delivered/total*100):0;
 $('#metrics').innerHTML=[
  ['Guias entregues',`${pad(delivered)}<span class="of">/ ${pad(total)}</span>`,`<span class="bar" aria-hidden="true"><i style="width:${bar}%"></i></span>${bar}% da equipe`,''],
  ['Pendentes no prazo',pad(pending),`prazo ${dateOnly(deadline)}`,pending?'warning':''],
  ['Em atraso',pad(late),late?'sem guia assinada após o prazo':'ninguém em atraso',late?'danger':''],
  ['Impressas',`${pad(printed)}<span class="of">/ ${pad(delivered)}</span>`,waiting?`${plural(waiting,'guia esperando','guias esperando')} impressão`:'nenhuma esperando impressão',waiting?'warning':'']
 ].map(([label,n,sub,cls])=>`<div class="metric ${cls}"><div class="metric-top">${esc(label)}</div><strong>${n}</strong><small>${sub}</small></div>`).join('');
 const banner=$('#deadline-banner'),missing=pending+late,rule=custom?'Prazo definido pela administração.':'Prazo padrão: último dia do mês de referência.';
 if(!unit){banner.className='deadline-banner';banner.innerHTML='<span class="banner-icon" aria-hidden="true">◷</span><div><strong>Nenhuma unidade vinculada</strong><p>Solicite entrada em uma unidade em Minha conta para ver a equipe.</p></div>';}
 else if(!total){banner.className='deadline-banner';banner.innerHTML=`<span class="banner-icon" aria-hidden="true">◷</span><div><strong>Nenhum médico vinculado a ${esc(unit.name)}</strong><p>Os médicos aparecem aqui assim que a conta for vinculada à unidade.</p></div>`;}
 else if(!missing){banner.className='deadline-banner';banner.innerHTML=`<span class="banner-icon" aria-hidden="true">✓</span><div><strong>Todas as guias de ${esc(monthOnly(ref()))} foram entregues</strong><p>${waiting?plural(waiting,'guia ainda espera','guias ainda esperam')+' impressão.':'Nada pendente nesta referência.'}</p></div>`;}
 else if(today>deadline){banner.className='deadline-banner danger';banner.innerHTML=`<span class="banner-icon" aria-hidden="true">!</span><div><strong>Prazo encerrado em ${dateOnly(deadline)}</strong><p>${plural(late,'médico ainda não entregou','médicos ainda não entregaram')} a guia assinada de ${esc(monthOnly(ref()))}.</p></div>`;}
 else{const left=diffDays(today,deadline);banner.className='deadline-banner warning';banner.innerHTML=`<span class="banner-icon" aria-hidden="true">◷</span><div><strong>Entrega das guias assinadas até ${dateOnly(deadline)} · ${left===0?'termina hoje':'faltam '+plural(left,'dia','dias')}</strong><p>${plural(missing,'médico ainda sem guia assinada','médicos ainda sem guia assinada')}. O prazo termina às 23h59, no horário de Salvador. ${rule}</p></div>`;}
 const prevRef=shiftMonth($('#reference').value,-1),overdue=visibleRows(prevRows).filter(r=>situation({...r,deadline:r.deadline||lastDay(prevRef)}).key==='atraso'&&nowDate()>(r.deadline||lastDay(prevRef)));
 const alert=$('#previous-alert');alert.hidden=!overdue.length;
 if(overdue.length)alert.innerHTML=`<span><strong>${plural(overdue.length,'guia','guias')} de ${esc(monthOnly(prevRef))} ainda sem entrega</strong> · ${esc(overdue.slice(0,4).map(r=>r.name.split(/\s+/).slice(0,2).join(' ')).join(', '))}${overdue.length>4?' e mais '+(overdue.length-4):''}</span><button type="button" data-month="${prevRef}">Ver ${esc(monthOnly(prevRef))} →</button>`;
 const keys=['all','pendente','atraso','imprimir','impressa','concluida'],labels={all:'Todos'};
 $('#status-chips').innerHTML=keys.map(k=>{const n=k==='all'?total:count(k);return `<button type="button" class="chip ${k} ${chip===k?'active':''}" data-chip="${k}" aria-pressed="${chip===k}">${esc(labels[k]||STATUS[k][0])} <b>${n}</b></button>`;}).join('');
 renderTable();
}
const when=v=>{if(!v)return '<span class="when empty">—</span>';const [day,hour]=short(v).split(' · ');return `<time class="when" datetime="${esc(v)}">${esc(day)}<span class="hour"> · ${esc(hour)}</span></time>`;};
const PRINTER='<svg class="icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>';
function rowActions(r) {
 const print=(label,cls)=>cls.includes('ghost')?`<button type="button" class="${cls} icon-only" data-action="print-one" data-id="${r.guide_id}" title="Reimprimir" aria-label="Reimprimir a guia de ${esc(r.name)}">${PRINTER}<span class="label">${label}</span></button>`:`<button type="button" class="${cls}" data-action="print-one" data-id="${r.guide_id}">${PRINTER} ${label}</button>`;
 if(!r.current_upload_id)return '<span class="when empty">—</span>';
 if(!r.printed_at)return print('Imprimir','primary sm');
 if(!r.sent_at)return `<button type="button" class="primary sm" data-action="row-send" data-id="${r.guide_id}" data-upload="${r.current_upload_id}">Confirmar envio</button>${print('Reimprimir','sm ghost')}`;
 return print('Reimprimir','sm ghost');
}
function renderTable() {
 const query=fold($('#search').value.trim()),digits=query.replace(/\D/g,''),manage=canManage();
 const all=visibleRows(),data=all.map(r=>({...r,s:situation(r)})).filter(r=>chip==='all'||r.s.key===chip)
  .filter(r=>!query||fold(r.name).includes(query)||(digits&&String(r.crm||'').replace(/\D/g,'').includes(digits)));
 $('#team-table').classList.toggle('no-actions',!manage);
 const crm=r=>[r.crm?'CRM '+r.crm:'CRM não informado',r.rqe?'RQE '+r.rqe:''].filter(Boolean).join(' · ');
 $('#team-body').innerHTML=data.length?data.map(r=>{const [label,tone]=STATUS[r.s.key];return `<tr class="st-${r.s.key}">
<td class="doctor" data-label="Médico"><div class="doctor-cell"><span class="avatar" aria-hidden="true">${esc(initials(r.name))}</span><div><strong>${esc(r.name)}</strong><small>${esc(crm(r))}</small></div></div></td>
<td class="status" data-label="Situação"><span class="badge ${tone}">${label}</span><small class="detail ${r.s.late?'late':''}">${esc(r.s.detail)}</small></td>
<td data-label="Emitida">${when(r.generated_at)}</td><td data-label="Entregue">${when(r.uploaded_at)}</td><td data-label="Impressa">${when(r.printed_at)}</td><td data-label="Enviada">${when(r.sent_at)}</td>
<td class="num" data-label="Folhas">${r.guide_pages?r.guide_pages:'<span class="when empty">—</span>'}</td>
<td class="actions-col"><div class="row-actions">${rowActions(r)}</div></td></tr>`;}).join(''):`<tr><td colspan="8" class="empty-state"><strong>${all.length?'Ninguém nesta situação':'Nenhum médico vinculado'}</strong>${all.length?'Escolha outro filtro ou limpe a busca.':'Os médicos aparecem aqui assim que a conta for vinculada à unidade.'}</td></tr>`;
 $('#table-footer').textContent=`${data.length} de ${plural(all.length,'médico','médicos')} · Referência ${monthName($('#reference').value)} · Atualizado às ${lastUpdated?clock(lastUpdated):'—'} · Horário de Salvador`;
}
function renderMine() {
 const r=rows.find(r=>r.user_id===user.id), guide=r&&r.unit_id===profile?.unit_id?r:null;
 const items=[['Guia gerada',guide?.generated_at],['Anexo assinado',guide?.uploaded_at],['Impressão',guide?.printed_at],['Envio',guide?.sent_at]];
 let html='<div class="progress-steps">'+items.map(([label,value],i)=>`<div class="progress-step ${value?'done':''}"><span class="step-number">${value?'✓':i+1}</span><strong>${label}</strong><small class="muted">${value?esc(stamp(value)):'Aguardando'}</small></div>`).join('')+'</div>';
 if(!profile)html+='<div class="notice">Complete o cadastro na aba Minha conta para vincular suas guias ao portal.</div>';
 else if(!profile.unit_id)html+='<div class="notice">Sua conta ainda não está vinculada a uma unidade. Solicite entrada em Minha conta ou aguarde a definição pela conta master. O gerador continua disponível.</div>';
 html+=`<section class="panel"><div class="panel-heading"><h2>Guia de ${esc($('#reference').value.split('-').reverse().join('/'))}</h2>${guide?badge(guide):''}</div><div class="panel-body"><p class="muted">Marque os dias no calendário como de costume e gere o PDF. Depois, assine o arquivo completo pelo serviço oficial e anexe-o aqui.</p><div class="row"><a class="button" href="index.html">1. Abrir gerador ↗</a><a class="button" href="https://assinador.iti.br/" target="_blank" rel="noopener noreferrer">2. Assinar com gov.br ↗</a><a href="https://validar.iti.gov.br/" target="_blank" rel="noopener noreferrer">Validar assinatura</a></div>`;
 if(guide?.guide_id&&!guide.sent_at)html+=`<form id="upload-form" class="upload-box" style="margin-top:24px"><h3>3. Anexe o PDF original assinado</h3><p class="muted">Inclua todas as páginas do arquivo gerado. Os relatórios serão excluídos apenas da cópia consolidada para impressão. Limite: 15 MB.</p>${guide.uploaded_at?'<p class="notice">Já há um anexo recebido. Substituí-lo reinicia as confirmações de impressão e envio. O original anterior fica preservado no histórico.</p>':''}<label for="signed-file">Arquivo PDF assinado</label><input id="signed-file" type="file" accept="application/pdf,.pdf" required><label class="check"><input id="signed-declaration" type="checkbox" required> Confirmei o médico, o mês e a assinatura deste documento.</label><button class="primary">${guide.uploaded_at?'Substituir anexo':'Anexar guia assinada'}</button><p class="field-hint">O portal registra o recebimento. A assinatura deve ser conferida no serviço oficial de validação.</p></form>`;
 else if(guide?.sent_at)html+='<div class="notice">A entrega desta guia foi concluída. Para corrigir o anexo, solicite a reabertura à administração.</div>';
 else html+='<div class="notice" style="margin-top:24px">Gere a guia deste mês com a sua conta conectada para habilitar o anexo.</div>';
 if(guide?.current_upload_id)html+='<button data-action="my-original" class="button" style="margin-top:16px">Baixar original assinado</button>';
 $('#my-guide').innerHTML=html+'</div></section>';
 $('#upload-form')?.addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,()=>uploadSigned(guide));});
}
function renderAccount() {
 const fields={name:profile?.name||user.user_metadata?.name||'',crm:profile?.crm||'',rqe:profile?.rqe||'',specialty:profile?.specialty||'ANESTESIOLOGIA'};
 Object.entries(fields).forEach(([k,v])=>$('#profile-'+k).value=v);
 $('#my-unit').textContent=profile?.unit_id?units.find(u=>u.id===profile.unit_id)?.name||'Unidade vinculada':'Você ainda não tem uma unidade vinculada.';
 $('#request-unit').innerHTML='<option value="">Escolha uma unidade</option>'+units.filter(u=>u.id!==profile?.unit_id).map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('');
 $('#my-requests').innerHTML=requests.filter(r=>r.user_id===user.id).map(r=>`<p>Solicitação para ${esc(units.find(u=>u.id===r.unit_id)?.name)} · ${esc(({pending:'aguardando aprovação',approved:'aprovada',rejected:'não aprovada'})[r.status])}<br><small>${esc(stamp(r.created_at))}</small></p>`).join('');
}
const names=new Map();
function renderManage() {
 if(!isAdmin())return;
 const manageable=canManage();
 $('#deadline-form button').disabled=!manageable;$('#merge').disabled=!manageable;
 $('#deadline').value=months.find(m=>m.unit_id===selectedUnit())?.deadline||'';
 $('#admin-guides').innerHTML=!manageable?'<p class="muted">Selecione uma unidade que você administra para gerenciar as guias.</p>':adminGuides.length?adminGuides.map(g=>`<div class="entry-row"><div class="row">${g.current_upload_id?`<input type="checkbox" data-batch-guide="${g.id}" checked aria-label="Incluir guia de ${esc(names.get(g.user_id)||'médico')} no lote">`:''}<div><strong>${esc(names.get(g.user_id)||'Médico')}</strong><small>${g.uploaded_at?'Anexo recebido em '+esc(stamp(g.uploaded_at)):'Ainda sem anexo assinado'}${g.sent_at?' · Envio confirmado em '+esc(stamp(g.sent_at)):''}</small></div></div><div class="entry-actions">${g.current_upload_id?`<button data-action="original" data-id="${g.current_upload_id}">Original assinado →</button>`:''}${g.printed_at&&!g.sent_at?`<button class="primary" data-action="send" data-id="${g.id}">Confirmar envio</button>`:''}${g.sent_at||g.printed_at?`<button data-action="reopen" data-id="${g.id}">Reabrir</button>`:''}</div></div>`).join(''):'<p class="muted">Nenhuma guia gerada nesta referência.</p>';
 const pending=requests.filter(r=>r.status==='pending'&&(isMaster()||r.unit_id===profile.unit_id));
 $('#requests').innerHTML=pending.length?pending.map(r=>`<div class="entry-row"><div><strong>${esc(names.get(r.user_id)||'Médico')}</strong><small>${esc(units.find(u=>u.id===r.unit_id)?.name)} · ${esc(stamp(r.created_at))}</small></div><div class="entry-actions"><button class="primary" data-action="approve" data-id="${r.id}">Aprovar</button><button data-action="reject" data-id="${r.id}">Recusar</button></div></div>`).join(''):'<p class="muted">Nenhuma solicitação pendente.</p>';
 if(isMaster())$('#users').innerHTML=users.map(u=>`<div class="entry-row"><div><strong>${esc(u.name)}</strong><small>${esc(u.email)} · ${esc(u.crm||'CRM não preenchido')} · ${esc(u.role)}</small></div><div class="entry-actions"><label class="sr-only" for="user-unit-${u.id}">Unidade de ${esc(u.name)}</label><select id="user-unit-${u.id}" data-user-unit="${u.id}"><option value="">Sem unidade</option>${units.map(unit=>`<option value="${unit.id}" ${unit.id===u.unit_id?'selected':''}>${esc(unit.name)}</option>`).join('')}</select><button data-action="assign" data-id="${u.id}">Salvar unidade</button>${u.role!=='master'?`<button data-action="role" data-id="${u.id}" data-role="${u.role==='admin'?'medico':'admin'}">${u.role==='admin'?'Remover admin':'Tornar admin'}</button>`:'<span class="badge success">Conta master</span>'}</div></div>`).join('');
 const actions={unit_created:'Unidade criada',unit_assigned:'Vínculo definido pela conta master',request_decided:'Solicitação decidida',role_changed:'Permissão alterada',deadline_changed:'Prazo atualizado',generated:'Guia gerada',signed_file_received:'Anexo assinado recebido',batch_created:'Lote de impressão preparado',print_confirmed:'Impressão confirmada',sent_confirmed:'Envio confirmado',reopened:'Guia reaberta'};
 $('#events').innerHTML=events.length?events.map(e=>`<div class="event">${esc(actions[e.action]||e.action)}<small>${esc(stamp(e.created_at))} · ${esc(names.get(e.actor)||'Administração')}</small></div>`).join(''):'<p class="muted">Nenhuma operação registrada para esta unidade.</p>';
 $$('#batch-result [data-action="print"]').forEach(button=>{if(batches.some(b=>b.id===button.dataset.id&&b.printed_at)){const label=document.createElement('span');label.className='badge success';label.textContent='Impressão confirmada';button.replaceWith(label);}});
 let recent=$('#recent-batches');if(!recent){recent=document.createElement('div');recent.id='recent-batches';$('#batch-result').after(recent);}
 recent.innerHTML=batches.length?'<p class="field-hint">Últimos lotes desta referência</p>'+batches.map(b=>`<div class="entry-row"><div><strong>Lote ${esc(b.id.slice(0,8))}</strong><small>${esc(stamp(b.created_at))} · ${b.upload_ids.length} anexo(s)${b.printed_at?' · Impresso em '+esc(stamp(b.printed_at)):''}</small></div>${!b.printed_at?`<button data-action="print" data-id="${b.id}">Confirmar impressão</button>`:''}</div>`).join(''):'';
}
async function load(initial=false) {
 try {
 const version=++loadVersion;
 globalMessage('');
 const profiles=await api.list('gs_profiles','id=eq.'+user.id+'&select=*');
 if(version!==loadVersion)return;
 profile=profiles[0]||null;
 const result=await Promise.all([api.list('gs_units','select=*&order=name.asc'),api.rpc('gs_dashboard',{p_reference:ref()}),api.rpc('gs_dashboard',{p_reference:shiftMonth($('#reference').value,-1)+'-01'}).catch(()=>[]),api.list('gs_requests','select=*&order=created_at.desc&limit=100'),api.list('gs_months','reference=eq.'+ref()+'&select=*')]);
 if(version!==loadVersion)return;
 [units,rows,prevRows,requests,months]=result;lastUpdated=new Date().toISOString();
 const selected=$('#unit-filter').value;
 // O dashboard mostra sempre uma unidade inteira: a sua; a conta master pode alternar entre todas.
 const allowed=isMaster()?units:units.filter(u=>u.id===profile?.unit_id);
 $('#unit-filter').innerHTML=allowed.length?allowed.map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join(''):'<option value="">Sem unidade vinculada</option>';
 $('#unit-filter').value=allowed.some(u=>u.id===selected)?selected:allowed.some(u=>u.id===profile?.unit_id)?profile.unit_id:allowed[0]?.id||'';
 $('#unit-filter').disabled=allowed.length<2;
 names.clear();rows.forEach(r=>names.set(r.user_id,r.name));
 $('#identity').innerHTML=`<span class="identity">${esc(profile?.name||user.email)}<small>${({master:'Conta master',admin:'Administrador',medico:'Médico'})[profile?.role]||'Complete seu cadastro'}</small></span>`;
 $$('.admin-only').forEach(el=>el.hidden=!isAdmin());$$('.master-only').forEach(el=>el.hidden=!isMaster());
 renderDashboard();renderMine();renderAccount();
 if(isAdmin()) {
   const unit=selectedUnit(),reference=ref();
   const results=await Promise.all([canManage()?api.list('gs_guides',`unit_id=eq.${unit}&reference=eq.${reference}&select=*&order=generated_at.desc`):[],canManage()?api.list('gs_uploads',`unit_id=eq.${unit}&finalized_at=not.is.null&select=*&order=created_at.desc`):[],isMaster()?api.rpc('gs_users'):[],canManage()?api.list('gs_events',`unit_id=eq.${unit}&select=*&order=created_at.desc&limit=50`):[],canManage()?api.list('gs_batches',`unit_id=eq.${unit}&reference=eq.${reference}&select=*&order=created_at.desc&limit=5`):[]]);
   if(version!==loadVersion)return;
   [adminGuides,uploads,users,events,batches]=results;adminGuides.sort((a,b)=>(names.get(a.user_id)||'').localeCompare(names.get(b.user_id)||'','pt-BR'));renderManage();
 }
 if(!profile){globalMessage('Bem-vindo! Complete seu cadastro profissional para começar.');setView('account');}
 else if(initial){const requested=new URLSearchParams(location.search).get('view');setView(['dashboard','mine','account','manage'].includes(requested)?requested:'dashboard');}
 if(initial&&new URLSearchParams(location.search).has('generated'))setView('mine');
 }catch(error){globalMessage('Não foi possível atualizar este painel. Os dados exibidos podem estar desatualizados. '+error.message,true);throw error;}
}
function download(bytes,name) {
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));blobUrls.push(url);
 const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),1500);return url;
}
async function openOriginal(id) {
 let u=uploads.find(u=>u.id===id);
 if(!u)u=(await api.list('gs_uploads','id=eq.'+id+'&select=*'))[0];
 if(!u)throw new Error('Arquivo indisponível para esta conta.');
 const bytes=await api.originalBytes(u.path);
 if(await sha256(bytes)!==u.sha256)throw new Error('A integridade do original não confere.');
 download(bytes,u.original_name.replace(/[^\p{L}\p{N}._ -]/gu,'_')||'guia-assinada.pdf');
}
async function uploadSigned(guide) {
 const file=$('#signed-file').files[0];if(!file)throw new Error('Selecione o PDF assinado.');
 if(file.size>15*1024*1024)throw new Error('O limite é de 15 MB por arquivo.');
 const g=(await api.list('gs_guides','id=eq.'+guide.guide_id+'&select=*'))[0];
 if(!g)throw new Error('Gere a guia deste mês primeiro.');
 const bytes=await file.arrayBuffer(),pages=await inspectPdf(bytes,g.total_pages),hash=await sha256(bytes);
 if(g.current_upload_id&&!await confirmAction('Substituir anexo?','A versão anterior será preservada no histórico. As confirmações de impressão e envio serão reiniciadas.'))return;
 const upload=await api.rpc('gs_reserve_upload',{p_guide:g.id,p_sha256:hash,p_total_pages:pages,p_original_name:file.name.slice(0,180),p_byte_size:file.size});
 await api.uploadFile(upload.path,new Blob([bytes],{type:'application/pdf'}));
 await api.rpc('gs_finalize_upload',{p_upload:upload.id});
 await load();notify('Anexo recebido. O original foi preservado.');
}
async function merge() {
 if(!canManage())throw new Error('Selecione uma unidade que você administra.');
 const chosen=new Set($$('[data-batch-guide]:checked').map(el=>el.dataset.batchGuide));
 const unit=selectedUnit(),reference=ref(),guides=adminGuides.filter(g=>chosen.has(g.id)&&g.current_upload_id&&(!$('#only-unprinted').checked||!g.printed_at));
 if(!guides.length)throw new Error('Nenhum anexo disponível para este filtro.');
 if(guides.length>200)throw new Error('Selecione até 200 guias por lote.');
 const result=$('#batch-result');result.textContent='Conferindo e preparando os anexos…';
 const files=[];let total=0;
 for(const [i,g] of guides.entries()) {
  const u=uploads.find(u=>u.id===g.current_upload_id);if(!u)throw new Error('Um anexo mudou. Atualize o painel.');
  result.textContent=`Preparando anexo ${i+1} de ${guides.length}…`;
  const bytes=await api.originalBytes(u.path);total+=bytes.byteLength;
  if(total>100*1024*1024)throw new Error('Este lote excede 100 MB. Gere lotes menores desmarcando algumas guias na conferência abaixo.');
  files.push({...u,bytes});
 }
 const bytes=await mergeForPrint(files);
 const batch=await api.rpc('gs_create_batch',{p_unit:unit,p_reference:reference,p_uploads:files.map(f=>f.id)});
 const filename=`Guias_SESAB_${reference.slice(0,7)}_${batch.slice(0,8)}_impressao.pdf`;
 const url=download(bytes,filename);
 result.innerHTML=`<strong>Cópia para impressão preparada.</strong><p class="field-hint">${guides.length} médico(s) · ${files.reduce((n,f)=>n+f.guide_pages,0)} folhas de guia · sem relatórios · lote ${esc(batch.slice(0,8))}</p><div class="row"><a class="button" href="${url}" download="${filename}">Baixar novamente</a><a class="button" href="${url}" target="_blank" rel="noopener">Abrir para imprimir</a><button class="primary" data-action="print" data-id="${batch}">Confirmar que imprimi</button></div>`;
 notify('PDF completo gerado. Confirme a impressão depois de imprimir.');
 await load();
}
async function printOne(guideId) {
 const r=rows.find(x=>x.guide_id===guideId);if(!r?.current_upload_id)throw new Error('Esta guia ainda não tem PDF assinado.');
 const u=uploads.find(u=>u.id===r.current_upload_id)||(await api.list('gs_uploads','id=eq.'+r.current_upload_id+'&select=*'))[0];
 if(!u)throw new Error('Arquivo indisponível para esta conta.');
 const bytes=await api.originalBytes(u.path),pdf=await mergeForPrint([{...u,bytes}]);
 const batch=r.printed_at?null:await api.rpc('gs_create_batch',{p_unit:r.unit_id,p_reference:ref(),p_uploads:[u.id]});
 const url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'}));blobUrls.push(url);
 document.querySelector('.print-frame')?.remove();
 const frame=document.createElement('iframe');frame.className='print-frame';frame.title='Guia para impressão';frame.src=url;document.body.appendChild(frame);
 printing={batch,url,frame};
 $('#print-title').textContent=(batch?'Imprimir':'Reimprimir')+' · '+r.name;
 $('#print-copy').textContent=`${plural(u.guide_pages,'folha','folhas')} da guia oficial de ${monthName($('#reference').value)}, sem o relatório de horas. `+(batch?'Depois que as folhas saírem da impressora, marque como impressa: a data e a sua conta ficam registradas no painel.':`A impressão já foi registrada em ${stamp(r.printed_at)}. Reimprimir não muda essa data.`);
 $('#print-open').href=url;$('#print-confirm').hidden=!batch;$('#print-dialog').showModal();
}
function changeAuth(mode) {
 authMode=mode;$('#auth-message').textContent='';
 const resetting=mode==='reset';$('#auth-tabs').hidden=resetting;$('#auth-email').hidden=resetting;$('label[for="auth-email"]').hidden=resetting;$('#auth-email').required=!resetting;$('#reset-confirm').hidden=!resetting;$('#auth-password-confirm').required=resetting;
 $('#auth-title').textContent=mode==='reset'?'Defina sua nova senha.':mode==='signup'?'Sua equipe começa aqui.':mode==='forgot'?'Vamos recuperar seu acesso.':'Bom ter você por aqui.';
 $('#auth-copy').textContent=mode==='reset'?'Escolha uma senha com pelo menos oito caracteres.':mode==='forgot'?'Enviaremos um link para definir uma nova senha.':'Entre para acompanhar as guias da sua unidade.';
 $('#signup-name').hidden=mode!=='signup';$('#auth-name').required=mode==='signup';
 $('#auth-password').hidden=mode==='forgot';$('label[for="auth-password"]').hidden=mode==='forgot';$('#auth-password').required=mode!=='forgot';$('#auth-password').autocomplete=mode==='signup'?'new-password':'current-password';$('#auth-password').minLength=mode==='signup'||resetting?8:1;$('#auth-password').autocomplete=mode==='signup'||resetting?'new-password':'current-password';$('label[for="auth-password"]').textContent=resetting?'Nova senha':'Senha';
 $('#password-help').hidden=mode!=='signup';$('#auth-submit').textContent=mode==='reset'?'Salvar nova senha':mode==='signup'?'Criar minha conta →':mode==='forgot'?'Enviar link de recuperação':'Entrar na minha conta →';
 $('#forgot').hidden=mode==='forgot'||resetting;$$('[data-auth]').forEach(b=>b.classList.toggle('active',b.dataset.auth===mode));
}
async function enterApp() {
 $('#loading').hidden=true;$('#auth').hidden=true;$('#app').hidden=false;$('#logout').hidden=false;
 try{await load(true);}catch(e){globalMessage(e.message,true);}
}
$('#auth-form').addEventListener('submit',async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;$('#auth-message').className='';$('#auth-message').textContent='';
 try {
  const email=$('#auth-email').value.trim(),password=$('#auth-password').value;
  if(authMode==='reset'){if(password!==$('#auth-password-confirm').value)throw new Error('As senhas precisam ser iguais.');await api.changePassword(password);user=await api.currentUser();$('#auth-password').value='';$('#auth-password-confirm').value='';await enterApp();return;}
  if(authMode==='forgot'){await api.recover(email);$('#auth-message').textContent='Se houver uma conta com este e-mail, você receberá o link de recuperação.';return;}
  if(authMode==='signup') {
   const result=await api.signUp(email,password,$('#auth-name').value.trim());
   if(!result.user){$('#auth-message').textContent='Confira seu e-mail para confirmar o cadastro. Se já possui conta, use Entrar ou recupere sua senha.';return;}
   api.saveSession(result);
  }else await api.signIn(email,password);
  user=await api.currentUser();$('#auth-password').value='';
  await enterApp();
 }catch(err){$('#auth-message').className='error';$('#auth-message').textContent=err.message;}
 finally{button.disabled=false;}
});
$$('[data-auth]').forEach(b=>b.onclick=()=>changeAuth(b.dataset.auth));$('#forgot').onclick=()=>changeAuth('forgot');
$('#logout').onclick=()=>busy($('#logout'),async()=>{try{await api.signOut();}finally{location.replace('portal.html');}});
$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('#refresh').onclick=()=>busy($('#refresh'),()=>load());
$('#reference').value=nowDate().slice(0,7);
$('#reference').onchange=()=>{if($('#reference').checkValidity())busy($('#refresh'),()=>load());};
$('#unit-filter').onchange=()=>busy($('#refresh'),()=>load());
$('#search').oninput=renderTable;
$('#status-chips').onclick=e=>{const b=e.target.closest('[data-chip]');if(!b)return;chip=b.dataset.chip;renderDashboard();};
const goMonth=ym=>{$('#reference').value=ym;busy($('#refresh'),()=>load());};
$('#month-prev').onclick=()=>goMonth(shiftMonth($('#reference').value,-1));
$('#month-next').onclick=()=>goMonth(shiftMonth($('#reference').value,1));
$('#previous-alert').onclick=e=>{const b=e.target.closest('[data-month]');if(b){chip='atraso';goMonth(b.dataset.month);}};
$('#print-now').onclick=()=>{if(!printing)return;const coarse=matchMedia('(pointer: coarse)').matches;try{if(coarse)throw 0;printing.frame.contentWindow.focus();printing.frame.contentWindow.print();}catch{window.open(printing.url,'_blank');}};
$('#print-close').onclick=()=>$('#print-dialog').close();
$('#print-dialog').addEventListener('close',()=>{printing?.frame.remove();printing=null;});
$('#print-confirm').onclick=()=>busy($('#print-confirm'),async()=>{await api.rpc('gs_confirm_print',{p_batch:printing.batch});$('#print-dialog').close();await load();notify('Impressão registrada no painel.');});
function setTv(on) {
 document.body.classList.toggle('tv-mode',on);$('#tv-exit').hidden=!on;
 if(on){setView('dashboard');document.documentElement.requestFullscreen?.().catch(()=>{});}
 else{if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});setView(view);}
}
$('#tv-mode').onclick=()=>setTv(true);$('#tv-exit').onclick=()=>setTv(false);
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.body.classList.contains('tv-mode'))setTv(false);});
if(new URLSearchParams(location.search).has('painel'))setTv(true);
$('#profile-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{await api.rpc('gs_save_profile',{p_name:$('#profile-name').value.trim(),p_crm:$('#profile-crm').value.trim(),p_rqe:$('#profile-rqe').value.trim(),p_specialty:$('#profile-specialty').value.trim()});await load();notify('Cadastro atualizado.');});};
$('#request-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{await api.rpc('gs_request_unit',{p_unit:$('#request-unit').value});await load();notify('Solicitação enviada à administração.');});};
$('#password-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{if($('#new-password').value!==$('#repeat-password').value)throw new Error('As senhas precisam ser iguais.');await api.changePassword($('#new-password').value);e.target.reset();notify('Senha alterada.');});};
$('#unit-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{await api.rpc('gs_create_unit',{p_name:$('#unit-name').value.trim(),p_company:$('#unit-company').value.trim()});e.target.reset();await load();notify('Unidade criada.');});};
$('#deadline-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{await api.rpc('gs_set_deadline',{p_unit:selectedUnit(),p_reference:ref(),p_deadline:$('#deadline').value});await load();notify('Prazo atualizado para esta referência.');});};
$('#merge').onclick=()=>busy($('#merge'),merge);
$('#app').addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 busy(b,async()=>{
  const id=b.dataset.id,action=b.dataset.action;
  if(action==='original')return openOriginal(id);
  if(action==='print-one')return printOne(id);
  if(action==='row-send'){const r=rows.find(x=>x.guide_id===id);if(!await confirmAction('Confirmar envio?',`Confirme que a guia impressa de ${r?.name||'médico'} foi efetivamente entregue/enviada ao destino.`))return;await api.rpc('gs_mark_sent',{p_guide:id,p_upload:b.dataset.upload});await load();notify('Envio registrado.');return;}
  if(action==='my-original')return openOriginal(rows.find(r=>r.user_id===user.id)?.current_upload_id);
  if(action==='print') {if(!await confirmAction('Confirmar impressão?','Confirme apenas após imprimir todas as folhas deste lote. A data e sua conta ficarão registradas.'))return;await api.rpc('gs_confirm_print',{p_batch:id});}
  if(action==='send') {const g=adminGuides.find(g=>g.id===id);if(!await confirmAction('Confirmar envio?','Confirme que a guia impressa foi efetivamente entregue/enviada ao destino.'))return;await api.rpc('gs_mark_sent',{p_guide:id,p_upload:g.current_upload_id});}
  if(action==='reopen') {if(!await confirmAction('Reabrir guia?','As confirmações de impressão e envio serão removidas. O anexo continua preservado e o médico poderá substituí-lo. A operação ficará no histórico.'))return;await api.rpc('gs_reopen',{p_guide:id});}
  if(action==='approve'||action==='reject')await api.rpc('gs_decide_request',{p_id:id,p_approve:action==='approve'});
  if(action==='assign'){const unit=$(`[data-user-unit="${id}"]`).value;if(!await confirmAction('Alterar unidade?','As guias anteriores continuam no histórico da unidade original. As próximas serão vinculadas à unidade escolhida.'))return;await api.rpc('gs_assign_unit',{p_user:id,p_unit:unit||null});}
  if(action==='role'){if(!await confirmAction('Alterar permissão?','Essa alteração define se a conta pode administrar sua unidade, acessar os anexos e confirmar impressão e envio.'))return;await api.rpc('gs_set_role',{p_user:id,p_role:b.dataset.role});}
  await load();notify('Alteração registrada.');
 });
});
window.addEventListener('pagehide',()=>{blobUrls.forEach(URL.revokeObjectURL);blobUrls=[];});
async function init() {
 try {
  const recovery=await api.authCallback();
  if(recovery){$('#loading').hidden=true;$('#auth').hidden=false;changeAuth('reset');return;}
  if(api.getSession()) {user=await api.currentUser();await enterApp();if(recovery){setView('account');$('#new-password').focus();globalMessage('Defina sua nova senha abaixo.');}}
  else{$('#loading').hidden=true;$('#auth').hidden=false;}
 } catch(e) {api.saveSession(null);$('#loading').hidden=true;$('#auth').hidden=false;$('#app').hidden=true;$('#auth-message').textContent=e.message;$('#auth-message').className='error';}
}
setInterval(()=>{if(user&&view==='dashboard'&&!document.hidden&&!$('#refresh').disabled)busy($('#refresh'),()=>load());},60000);
init();
