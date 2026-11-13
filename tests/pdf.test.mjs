import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import * as PDFLib from 'pdf-lib';import {mergeForPrint,sha256,inspectPdf} from '../assets/pdf-workflow.js';
globalThis.PDFLib=PDFLib;
const pdfScript=await readFile(new URL('../node_modules/pdf-lib/dist/pdf-lib.min.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function generator(){
 const els=new Map();const make=()=>({value:'',style:{},dataset:{},className:'',get innerHTML(){return this._html||'';},set innerHTML(v){this._html=v;this.children=[];},textContent:'',disabled:false,children:[],appendChild(n){this.children.push(n);},setAttribute(){},removeAttribute(){},querySelector(){return make();}});
 const context=vm.createContext({console,Date,Map,Set,Uint8Array,URL,setTimeout,clearTimeout,document:{querySelector(s){if(!els.has(s))els.set(s,make());return els.get(s);},createElement:make},window:{},navigator:{}});
 vm.runInContext(pdfScript,context);
 vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],context);return context;
}
test('legacy calendar retains SD → SN → SD+SN → clear and hour categories',()=>{
 const c=generator();assert.equal(vm.runInContext('JSON.stringify(CICLO.turno)',c),'[null,"D","N","DN"]');assert.equal(vm.runInContext('JSON.stringify(CICLO.hora)',c),'[null,"4M","4T","6M","6T"]');
 vm.runInContext('st.ano=2026;st.mes=10;pintaCalendario();',c);
 for(const expected of ['D','N','DN',undefined]){vm.runInContext('document.querySelector("#cal").children[25].onclick()',c);assert.equal(vm.runInContext('st.marc.plantonista["2026-11-13"]',c),expected);}
 vm.runInContext('st.marc.plantonista["2026-11-13"]="D";st.marc.plantonista["2026-11-14"]="DN";',c);
 assert.equal(vm.runInContext('resumoDeUso().total',c),36);assert.equal(vm.runInContext('semanas().length',c),1);
});
test('real official PDF: multiple weeks and category reports are counted; consolidated copy excludes every report',async()=>{
 const c=generator();vm.runInContext('st.nome="MEDICO TESTE";st.ano=2026;st.mes=10;st.marc.plantonista["2026-11-02"]="D";st.marc.plantonista["2026-11-13"]="DN";st.marc.coordenacao["2026-11-20"]="6M";',c);
 const bytes=await vm.runInContext('montarPdf()',c);const count=await inspectPdf(bytes);assert.equal(count,5,'3 weekly guides + 2 category reports');
 const original=Buffer.from(bytes);const file={bytes,sha256:await sha256(bytes),total_pages:count,guide_pages:3};
 const merged=await mergeForPrint([file,file]);assert.equal(await inspectPdf(merged),6);assert.deepEqual(Buffer.from(bytes),original,'signed original bytes are never rewritten');
 await assert.rejects(mergeForPrint([{...file,sha256:'0'.repeat(64)}]),/integridade/);
 await assert.rejects(inspectPdf(bytes,2),/precisa ter 2/);
 await assert.rejects(inspectPdf(new TextEncoder().encode('not pdf')),/válido/);
 await assert.rejects(mergeForPrint([]),/Não há/);
});
test('PDF engine, official coordinates and calendar logic remain byte-for-byte equal to original version',async()=>{
 const {createHash}=await import('node:crypto');
 const hash=(start,end)=>createHash('sha256').update(html.slice(html.indexOf(start),html.indexOf(end))).digest('hex');
 assert.equal(hash('const BASE_PDF =','/* ===== registro de uso'),'7971387315c6419fa82afe4acaf2b21081e204ec676721a4a1df6259cca84d1f');
 assert.equal(hash('async function montarPdf(){','/* ========================= toast'),'540ea7d2d0bfa35f3912f953687fe41926c213cd3acc4c07177fbaa4e0155804');
 assert.equal(hash('const SECS = [','/* ========================= entrega'),'8ab43e05097153b15e5e6fbaa7a10e51ad0eb83366c5da6150df8b2e60d66153');
});
