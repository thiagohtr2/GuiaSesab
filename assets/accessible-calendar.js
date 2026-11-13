// Accessible alternative to the original calendar. The original buttons remain the sole source of truth.
const cal=document.querySelector('#cal');
if(cal){
 const panel=cal.closest('section');
 const tabs=document.createElement('div');tabs.className='gs-view-switch';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Visualização dos plantões');
 tabs.innerHTML='<span class="gs-view-label">Como prefere marcar seus plantões?</span><div class="gs-view-buttons"><button type="button" data-mode="calendar" aria-pressed="true">▦ Calendário tradicional</button><button type="button" data-mode="simple" aria-pressed="false">☷ Visualização simples</button></div>';
 cal.parentElement.insertBefore(tabs,cal);
 const simple=document.createElement('div');simple.id='gs-simple-days';simple.className='gs-simple-days';simple.hidden=true;cal.insertAdjacentElement('afterend',simple);
 const help=document.createElement('p');help.className='gs-simple-help';help.textContent='Toque em Dia (SD) ou Noite (SN) para marcar ou desmarcar. Os plantões são os mesmos nas duas visualizações.';simple.before(help);help.hidden=true;
 let mode='calendar';let busy=false;let week=0;
 const getDays=()=>[...cal.querySelectorAll('.day:not(.pad)')].filter(b=>b.querySelector('.n'));
 function update(){
  if(busy)return;
  const days=getDays();
  if(!days.length)return;
  const fragment=document.createDocumentFragment();
  const pages=Math.ceil(days.length/7);week=Math.min(week,Math.max(0,pages-1));
  const pager=document.createElement('div');pager.className='gs-week-nav';
  const prev=document.createElement('button');prev.type='button';prev.textContent='‹ Anterior';prev.disabled=week===0;prev.onclick=()=>{week--;update();};
  const title=document.createElement('strong');title.textContent='Dias '+(week*7+1)+'–'+Math.min(days.length,(week+1)*7);
  const next=document.createElement('button');next.type='button';next.textContent='Próxima ›';next.disabled=week>=pages-1;next.onclick=()=>{week++;update();};
  pager.append(prev,title,next);fragment.append(pager);
  for(const original of days.slice(week*7,(week+1)*7)){
   const day=original.querySelector('.n')?.textContent?.trim();
   if(!day)continue;
   const state=original.dataset.t||'';
   const row=document.createElement('div');row.className='gs-simple-row';
   const date=document.createElement('span');date.className='gs-simple-date';date.textContent='Dia '+day;
   row.append(date);
   for(const [kind,label] of [['D','Dia · SD'],['N','Noite · SN']]){
    const selected=state===kind||state==='DN';
    const btn=document.createElement('button');btn.type='button';btn.className='gs-shift-button'+(selected?' selected':'');
    btn.textContent=(selected?'✓ ':'')+label;btn.setAttribute('aria-pressed',String(selected));
    btn.addEventListener('click',()=>{
     const current=original.dataset.t||'';
     const desired=kind==='D'?(current==='D'?'':current==='N'?'DN':current==='DN'?'N':'D'):(current==='N'?'':current==='D'?'DN':current==='DN'?'D':'N');
     // Use the original click handler, never modify its state or the PDF engine.
     busy=true;
     for(let i=0;i<4&&(original.dataset.t||'')!==desired;i++)original.click();
     busy=false;update();
    });
    row.append(btn);
   }
   fragment.append(row);
  }
  simple.replaceChildren(fragment);
 }
 function show(next){
  mode=next;const isSimple=mode==='simple';
  cal.hidden=isSimple;simple.hidden=!isSimple;help.hidden=!isSimple;
  // Keep legends out of the simplified mode; retain original calendar otherwise.
  for(const id of ['legenda','legenda-h']){const el=document.getElementById(id);if(el){if(isSimple){el.dataset.gsPreviousDisplay=el.style.display;el.style.display='none';}else if(el.dataset.gsPreviousDisplay!==undefined){el.style.display=el.dataset.gsPreviousDisplay;delete el.dataset.gsPreviousDisplay;}}}
  tabs.querySelectorAll('button').forEach(b=>{const active=b.dataset.mode===mode;b.setAttribute('aria-pressed',String(active));b.classList.toggle('active',active);});
  try{localStorage.setItem('gs-calendar-view',mode);}catch{}
  if(isSimple)update();
 }
 tabs.addEventListener('click',e=>{const b=e.target.closest('button[data-mode]');if(b)show(b.dataset.mode);});
 const observer=new MutationObserver(()=>{if(mode==='simple')update();});
 observer.observe(cal,{subtree:true,childList:true,attributes:true,attributeFilter:['data-t']});
 document.querySelector('#f-mes')?.addEventListener('change',()=>{week=0;queueMicrotask(update);});
 document.querySelector('#f-ano')?.addEventListener('change',()=>{week=0;queueMicrotask(update);});
 document.querySelector('#abas')?.addEventListener('click',()=>{if(mode==='simple')requestAnimationFrame(update);});
 let saved='calendar';try{saved=localStorage.getItem('gs-calendar-view')||'calendar';}catch{}
 show(saved==='simple'?'simple':'calendar');
}
