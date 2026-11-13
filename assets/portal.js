import * as api from './api.js';
import {inspectPdf,sha256,mergeForPrint} from './pdf-workflow.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tz='America/Bahia';
const nowDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stamp=v=>v ? new Intl.DateTimeFormat('pt-BR',{timeZone:tz,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)) : '';
const dateOnly=v=>v ? v.split('-').reverse().join('/') : '';
const ref=()=>$('#reference').value+'-01';
let user=null,profile=null,units=[],months=[],rows=[],requests=[],adminGuides=[],uploads=[],users=[],events=[],batches=[],view='dashboard',authMode='login',loadVersion=0,toastTimer,blobUrls=[],lastUpdated=null;
const isMaster=()=>profile?.role==='master';
const isAdmin=()=>['master','admin'].includes(profile?.role);
const selectedUnit=()=>$('#unit-filter').value;
const canManage=(unit=selectedUnit())=>!!unit && (isMaster()||(profile?.role==='admin'&&profile.unit_id===unit));
const visibleRows=()=>rows.filter(r=>!selectedUnit()||r.unit_id===selectedUnit());
function notify(msg,error=false) { const el=$('#toast');el.textContent=msg;el.hidden=false;el.style.background=error?'#963d32':'';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,6500); }
function globalMessage(msg,error=false) { const el=$('#global-message');el.textContent=msg;el.classList.toggle('error',error);el.hidden=!msg; }
async function busy(el,task) { if(el?.disabled)return;const text=el?.textContent;if(el){el.disabled=true;el.textContent='Aguarde…';}try{return await task();}catch(e){notify(e.message,true);}finally{if(el){el.disabled=false;el.textContent=text;}} }
async function confirmAction(title,copy) { const dialog=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-copy').textContent=copy;dialog.returnValue='cancel';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true})); }
const initials=name=>name.trim().split(/\s+/).filter(Boolean).filter((_,i,a)=>i===0||i===a.length-1).map(n=>n[0]).join('').slice(0,2).toUpperCase();
function badge(r) {
 if(!r.unit_id)return '<span class="badge">Sem unidade</span>';
 if(r.sent_at)return '<span class="badge success">Concluído</span>';
 if(r.printed_at)return '<span class="badge">Aguardando envio</span>';
 if(r.uploaded_at)return '<span class="badge success">Pronta para imprimir</span>';
 if(r.deadline && nowDate()>r.deadline)return '<span class="badge danger">Prazo vencido</span>';
 return '<span class="badge warning">'+(r.generated_at?'Falta anexar':'Falta gerar')+'</span>';
}
const stage=(value,label)=>value?`<span class="stage done">${label}</span><time class="date" datetime="${esc(value)}">${esc(stamp(value))}</time>`:'<span class="stage empty">—</span>';
function setView(next) {
 if(next==='manage'&&!isAdmin())next='dashboard';view=next;
 ['dashboard','mine','account','manage'].forEach(v=>$('#view-'+v).hidden=v!==next);
 $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
 const titles={dashboard:['ACOMPANHAMENTO MENSAL','Visão geral','Cada médico, cada etapa. Tudo em um só lugar.'],mine:['SEU FLUXO DO MÊS','Minha guia','Gere, assine pelo gov.br e anexe o original.'],account:['SEU ESPAÇO','Minha conta','Mantenha seus dados profissionais atualizados.'],manage:['GESTÃO DA UNIDADE','Administração','Prazos, equipe e entregas sob controle.']};
 const t=titles[next];$('#page-eyebrow').textContent=t[0];$('#page-title').textContent=t[1];$('#page-description').textContent=t[2];
 try{history.replaceState(null,'','portal.html?view='+next);}catch{}
}
function renderDashboard() {
 const data=visibleRows(),pending=data.filter(r=>r.unit_id&&!r.uploaded_at),total=data.length;
 const signed=data.filter(r=>r.uploaded_at).length, printed=data.filter(r=>r.printed_at).length,sent=data.filter(r=>r.sent_at).length;
 $('#metrics').innerHTML=[['Médicos na equipe',total,'Cadastros no filtro atual','◎',''],['Anexos recebidos',signed,`${total?Math.round(signed/total*100):0}% da equipe concluiu esta etapa`,'↑',''],['Aguardando assinatura',pending.length,'Guias sem anexo assinado','◷','warning'],['Envios confirmados',sent,`${printed} guia(s) com impressão confirmada`,'✓','']].map(([label,n,sub,icon,cls])=>`<div class="metric ${cls}"><div class="metric-top">${esc(label)}<span class="metric-icon" aria-hidden="true">${icon}</span></div><strong>${n.toString().padStart(2,'0')}</strong><small>${esc(sub)}</small></div>`).join('');
 const deadlines=[...new Set((selectedUnit()?months.filter(m=>m.unit_id===selectedUnit()):months).map(m=>m.deadline))].sort();
 const overdue=pending.filter(r=>r.deadline&&nowDate()>r.deadline).length;
 const banner=$('#deadline-banner');banner.className='deadline-banner'+(overdue?' danger':pending.length?' warning':'');
 if(!selectedUnit()&&deadlines.length>1)banner.innerHTML='<span class="banner-icon" aria-hidden="true">◷</span><div><strong>Os prazos variam por unidade</strong><p>Selecione uma unidade para consultar a data limite. '+overdue+' pendência(s) com prazo vencido.</p></div>';
 else if(deadlines.length){const deadline=deadlines[0];banner.innerHTML=`<span class="banner-icon" aria-hidden="true">◷</span><div><strong>${overdue?'Prazo vencido em':'Entrega das guias assinadas até'} ${dateOnly(deadline)}</strong><p>${pending.length} médico(s) ainda sem anexo assinado. O prazo termina às 23h59, no horário de Salvador.</p></div>`;}
 else banner.innerHTML='<span class="banner-icon" aria-hidden="true">◷</span><div><strong>Prazo de entrega ainda não definido</strong><p>A administração pode definir a data limite para este mês e unidade.</p></div>';
 renderTable();
}
function renderTable() {
 const search=$('#search').value.trim().toLocaleLowerCase('pt-BR'),status=$('#status-filter').value;
 const data=visibleRows().filter(r=>r.name.toLocaleLowerCase('pt-BR').includes(search)).filter(r=>status==='all'||(status==='pending'&&!r.uploaded_at)||(status==='ready'&&r.uploaded_at&&!r.printed_at)||(status==='printed'&&r.printed_at&&!r.sent_at)||(status==='sent'&&r.sent_at));
 $('#team-body').innerHTML=data.length?data.map(r=>`<tr><td><div class="doctor-cell"><span class="avatar" aria-hidden="true">${esc(initials(r.name))}</span><div><strong>${esc(r.name)}</strong><small>${esc(r.unit_name||'Aguardando vínculo com a unidade')}</small></div></div></td><td>${stage(r.generated_at,'Gerada')}</td><td>${stage(r.uploaded_at,'Recebido')}</td><td>${stage(r.printed_at,'Confirmada')}</td><td>${stage(r.sent_at,'Confirmado')}</td><td>${badge(r)}</td></tr>`).join(''):'<tr><td colspan="6" class="empty-state"><strong>Nenhum médico encontrado</strong>Revise os filtros ou aguarde os primeiros cadastros.</td></tr>';
 $('#table-footer').textContent=`${data.length} médico(s) exibido(s) · Referência ${$('#reference').value.split('-').reverse().join('/')} · Atualizado em ${stamp(lastUpdated)} · Horário de Salvador`;
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
 const result=await Promise.all([api.list('gs_units','select=*&order=name'),api.rpc('gs_dashboard',{p_reference:ref()}),api.list('gs_requests','select=*&order=created_at.desc&limit=100'),api.list('gs_months','reference=eq.'+ref()+'&select=*')]);
 if(version!==loadVersion)return;
 [units,rows,requests,months]=result;lastUpdated=new Date().toISOString();
 const selected=$('#unit-filter').value;
 $('#unit-filter').innerHTML='<option value="">Todas as unidades</option>'+units.map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('');
 $('#unit-filter').value=selected||(initial?profile?.unit_id||'':'');
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
$('#search').oninput=renderTable;$('#status-filter').onchange=renderTable;
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
