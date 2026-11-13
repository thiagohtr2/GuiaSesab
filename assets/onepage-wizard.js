// One-page stepper: presentation only. Existing calendar state and PDF generation remain untouched.
const data=document.querySelector('.generator-data');
const calendar=document.querySelector('#cal')?.closest('section');
const results=document.querySelector('#sec-res');
const columns=document.querySelector('.generator-columns');
if(data&&calendar&&results&&columns){
 document.body.classList.add('gs-wizard');
 const header=document.createElement('div');header.className='gs-wizard-header';
 header.innerHTML='<div class="gs-wizard-brand">GUIASESAB <span>· Guia de plantões</span></div><div class="gs-progress" aria-label="Progresso"><span>1 Dados</span><span>2 Plantões</span><span>3 Guia</span><span>4 Finalizar</span></div>';
 columns.before(header);
 const footer=document.createElement('nav');footer.className='gs-wizard-footer';footer.setAttribute('aria-label','Navegação das etapas');
 const back=document.createElement('button');back.type='button';back.className='gs-back';back.textContent='‹ Voltar';
 const next=document.createElement('button');next.type='button';next.className='gs-next';next.textContent='Continuar ›';
 footer.append(back,next);columns.after(footer);
 const final=document.createElement('section');final.className='gs-final';final.innerHTML='<div class="sec-head"><h2>Como deseja finalizar?</h2></div><div class="sec-body"><p>Escolha o caminho mais fácil. A assinatura ainda será necessária para concluir a guia.</p><div class="gs-final-options"><a href="https://assinador.iti.br/" target="_blank" rel="noopener">Assinar pelo GOV.BR <small>Baixe o PDF, assine no portal oficial e anexe o original em Minha guia.</small></a><a href="portal.html?view=mine">Enviar para impressão pela equipe <small>Abra seu acompanhamento. O envio de uma guia sem assinatura depende da liberação desse fluxo pela administração.</small></a><button type="button" id="gs-print-option">Vou imprimir e assinar <small>Use o PDF baixado, imprima e entregue à administração.</small></button></div><a class="gs-finish-link" href="portal.html?view=mine">Acompanhar minha guia →</a></div>';
 columns.append(final);
 final.querySelector('#gs-print-option').addEventListener('click',()=>{setStep(2);results.scrollIntoView({block:'nearest'});});
 let step=0;
 const steps=[data,calendar,results,final];
 function setStep(n){
  step=Math.max(0,Math.min(3,n));
  steps.forEach((el,i)=>{el.classList.toggle('gs-step-current',i===step);el.hidden=i!==step;if(el===results)el.style.display=i===step?'block':'none';});
  header.querySelectorAll('.gs-progress span').forEach((el,i)=>{el.classList.toggle('active',i===step);el.classList.toggle('done',i<step);});
  back.hidden=step===0;next.hidden=step>=2;next.textContent=step===0?'Selecionar plantões ›':'Gerar minha guia ›';
  document.querySelector('.bar')?.classList.toggle('gs-bar-visible',step===1);
  window.scrollTo({top:0,behavior:'instant'});
 }
 back.addEventListener('click',()=>setStep(step-1));
 next.addEventListener('click',()=>{
  if(step===0){setStep(1);return;}
  if(step===1)document.querySelector('#btn-gerar')?.click();
 });
 window.addEventListener('gs:generated',()=>setStep(2));
 const finish=document.createElement('button');finish.type='button';finish.className='gs-next gs-finish-button';finish.textContent='Escolher assinatura e entrega ›';results.append(finish);finish.addEventListener('click',()=>setStep(3));
 setStep(0);
}
