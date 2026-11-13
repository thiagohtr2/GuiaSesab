// Signed originals are never changed. The combined document is a printing copy.
export function assertPdfHeader(bytes) {
  const head=new TextDecoder('latin1').decode(new Uint8Array(bytes).slice(0,1024));
  if(!head.includes('%PDF-')) throw new Error('Selecione um arquivo PDF válido.');
}
export async function inspectPdf(bytes,expectedPages) {
  assertPdfHeader(bytes);
  let pdf;
  try { pdf=await globalThis.PDFLib.PDFDocument.load(bytes); }
  catch { throw new Error('PDF protegido, corrompido ou incompatível. Envie o PDF original assinado.'); }
  const count=pdf.getPageCount();
  if(expectedPages!==undefined && count!==expectedPages) throw new Error(`O PDF precisa ter ${expectedPages} páginas, como a guia gerada. O arquivo selecionado tem ${count}. Não remova os relatórios antes de assinar.`);
  return count;
}
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function mergeForPrint(files) {
  if(!files.length) throw new Error('Não há anexos para consolidar.');
  const out=await globalThis.PDFLib.PDFDocument.create();
  for(const file of files) {
    if(await sha256(file.bytes)!==file.sha256) throw new Error('A integridade de um anexo não confere. A consolidação foi interrompida.');
    await inspectPdf(file.bytes,file.total_pages);
    if(!Number.isInteger(file.guide_pages)||file.guide_pages<1||file.guide_pages>file.total_pages) throw new Error('Quantidade de folhas de guia inválida.');
    const source=await globalThis.PDFLib.PDFDocument.load(file.bytes);
    const pages=await out.copyPages(source,Array.from({length:file.guide_pages},(_,i)=>i));
    pages.forEach(page=>out.addPage(page));
  }
  out.setTitle('Guias SESAB — cópia consolidada para impressão');
  out.setSubject('Cópia para impressão. Os arquivos originais assinados permanecem separados e inalterados.');
  return out.save();
}
