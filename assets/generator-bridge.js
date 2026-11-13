import * as api from './api.js';
const status=document.querySelector('#portal-status');
let profile=null,unit=null;
function message(text,warning=false){status.replaceChildren();status.classList.toggle('warning',warning);const span=document.createElement('span');span.textContent=text+' ';const a=document.createElement('a');a.href='portal.html?view=mine';a.textContent='Acessar meu acompanhamento →';status.append(span,a);status.hidden=false;}
async function context(){
 if(!api.getSession())return;
 const user=await api.currentUser();profile=(await api.list('gs_profiles','id=eq.'+user.id+'&select=*'))[0];
 unit=profile?.unit_id?(await api.list('gs_units','id=eq.'+profile.unit_id+'&select=*'))[0]:null;
}
async function init(){
 if(!api.getSession()){message('Já faz parte da equipe? Entre para registrar suas guias e anexar o PDF assinado.');return;}
 try{
  await context();
  if(!profile||!unit){message('Complete seu cadastro e vínculo com a unidade no portal para registrar suas guias.',true);return;}
  const data={'#f-nome':profile.name,'#f-crm':profile.crm,'#f-rqe':profile.rqe,'#f-esp':profile.specialty,'#f-unidade':unit.name,'#f-empresa':unit.company};
  Object.entries(data).forEach(([selector,value])=>{const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));});
  document.querySelector('#f-unidade').readOnly=true;
  message('Conta conectada: '+profile.name+'. As próximas guias serão registradas em '+unit.name+'.');
 }catch(e){message(e.message,true);}
}
window.gsBeforeGenerate=async()=>{
 if(!profile||!unit)return true;
 try{
  const reference=document.querySelector('#f-ano').value+'-'+String(Number(document.querySelector('#f-mes').value)+1).padStart(2,'0')+'-01';
  const guides=await api.list('gs_guides',`user_id=eq.${profile.id}&unit_id=eq.${unit.id}&reference=eq.${reference}&select=id,current_upload_id,sent_at`);
  if(guides[0]?.sent_at){message('Esta guia já foi enviada. Peça a reabertura à administração antes de gerar uma correção.',true);return false;}
  return !guides[0]?.current_upload_id||window.confirm('Esta referência já tem um anexo assinado. Gerar uma nova guia reinicia as etapas de anexo, impressão e envio. O original anterior será preservado. Continuar?');
 }catch(e){message('A guia poderá ser baixada, mas não foi possível verificar o acompanhamento: '+e.message,true);return true;}
};
window.addEventListener('gs:generated',async e=>{
 const snapshot=e.detail;
 if(!api.getSession()){message('PDF gerado. Entre no portal antes de gerar a guia para registrar seu acompanhamento.');return;}
 try{
  await context();
  if(!profile||!unit)throw new Error('Complete seu cadastro e vínculo com uma unidade.');
  if(snapshot.name.trim().toLocaleUpperCase('pt-BR')!==profile.name.trim().toLocaleUpperCase('pt-BR')||snapshot.unit!==unit.name)throw new Error('Os dados da guia diferem da conta conectada. Confira o nome e a unidade antes de registrar.');
  await api.rpc('gs_register_generation',{p_unit:unit.id,p_reference:snapshot.reference,p_guide_pages:snapshot.guidePages,p_total_pages:snapshot.totalPages});
  message('Guia registrada no portal. Agora assine o arquivo completo pelo gov.br e anexe-o em Minha guia.');
 }catch(e){message('O PDF foi gerado, mas o acompanhamento não foi registrado: '+e.message,true);}
});
init();
