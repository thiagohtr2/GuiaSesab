// Same-origin API. Identity/session cookies and database credentials stay managed by Netlify.
let session=null,pendingRecovery=null;
export const getSession=()=>session;
export function saveSession(value){session=value?.user||null;}
export async function request(path,options={}){
 const headers={...options.headers};
 const binary=options.body instanceof Blob||options.body instanceof ArrayBuffer||options.body instanceof Uint8Array;
 const body=options.body===undefined?undefined:binary?options.body:JSON.stringify(options.body);
 if(body!==undefined&&!headers['Content-Type'])headers['Content-Type']='application/json';
 let response;
 try{response=await fetch('/api/'+path,{...options,headers,body,credentials:'same-origin',cache:'no-store',signal:options.signal||AbortSignal.timeout(60000)});}
 catch{throw new Error('Não foi possível conectar. Confira a internet e tente novamente.');}
 if(!response.ok){let error={};try{error=await response.json();}catch{}if(response.status===401)session=null;throw new Error(error.message||(response.status===404?'O portal ainda precisa ser publicado com as funções do Netlify.':'Não foi possível concluir a operação.'));}
 if(options.binary)return response.arrayBuffer();
 return response.status===204?null:response.json();
}
export const rpc=(name,body={})=>request('rpc/'+name,{method:'POST',body});
export const list=(table,query='')=>request('data/'+table+'?'+query);
export async function currentUser(){const result=await request('auth/me');session=result.user;return result.user;}
export async function signIn(email,password){const result=await request('auth/login',{method:'POST',body:{email,password}});saveSession(result);return result;}
export async function signUp(email,password,name){const result=await request('auth/signup',{method:'POST',body:{email,password,name}});saveSession(result);return result;}
export async function signOut(){try{await request('auth/logout',{method:'POST',body:{}});}finally{session=null;}}
export const recover=email=>request('auth/recover',{method:'POST',body:{email}});
export async function changePassword(password){
 const result=await request(pendingRecovery?'auth/reset':'auth/password',{method:'POST',body:pendingRecovery?{token:pendingRecovery,password}:{password}});
 pendingRecovery=null;saveSession(result);return result;
}
export async function authCallback(){
 const hash=new URLSearchParams(location.hash.slice(1));
 const confirmation=hash.get('confirmation_token'),recovery=hash.get('recovery_token');
 if(confirmation||recovery||hash.has('error_description'))history.replaceState(null,'',location.pathname+location.search);
 if(hash.has('error_description'))throw new Error(hash.get('error_description'));
 if(confirmation){const result=await request('auth/confirm',{method:'POST',body:{token:confirmation}});saveSession(result);}
 if(recovery){pendingRecovery=recovery;return true;}
 return false;
}
export const originalBytes=path=>request('files?path='+encodeURIComponent(path),{binary:true});
export async function uploadFile(path,file){
 const upload=path.split('/').pop().replace(/\.pdf$/,'');
 const chunk=1024*1024;
 for(let offset=0;offset<file.size;offset+=chunk){
  const bytes=await file.slice(offset,offset+chunk).arrayBuffer();
  await request('files/chunk?upload='+encodeURIComponent(upload)+'&index='+offset/chunk,{method:'POST',body:bytes,headers:{'Content-Type':'application/octet-stream'}});
 }
}
// Bootstrap reads only the verified identity. No tokens/passwords in localStorage/sessionStorage.
try{await currentUser();}catch{session=null;}
