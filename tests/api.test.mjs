import test from 'node:test';import assert from 'node:assert/strict';
test('Netlify browser API uses same-origin cookies, handles email recovery and chunks files without storing credentials',async()=>{
 globalThis.sessionStorage={setItem(){throw Error('Session storage must not receive credentials');}};
 globalThis.localStorage={setItem(){throw Error('Local storage must not receive credentials');}};
 const calls=[],user={id:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid'};
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({user});};
 const api=await import('../assets/api.js');assert.equal(api.getSession().id,user.id);
 await api.signIn(user.email,'test-password');assert.equal(calls.at(-1).url,'/api/auth/login');assert.equal(calls.at(-1).options.credentials,'same-origin');assert.equal(calls.at(-1).options.headers.Authorization,undefined);
 const file=new Blob([new Uint8Array(2*1024*1024+8)],{type:'application/pdf'});calls.length=0;
 await api.uploadFile('unit/user/00000000-0000-4000-8000-000000000002.pdf',file);assert.equal(calls.length,3);assert.deepEqual(calls.map(c=>c.options.body.byteLength),[1048576,1048576,8]);
 assert.ok(calls.every(c=>c.options.headers['Content-Type']==='application/octet-stream'));
 globalThis.location={hash:'#recovery_token=one-use-test-token',pathname:'/portal.html',search:''};let cleaned='';globalThis.history={replaceState:(_,__,url)=>{cleaned=url;}};
 assert.equal(await api.authCallback(),true);assert.equal(cleaned,'/portal.html');
 await api.changePassword('new-test-password');assert.equal(calls.at(-1).url,'/api/auth/reset');assert.equal(JSON.parse(calls.at(-1).options.body).token,'one-use-test-token');
 await api.changePassword('another-test-password');assert.equal(calls.at(-1).url,'/api/auth/password');
 globalThis.fetch=async()=>Response.json({message:'Entre na conta.'},{status:401});await assert.rejects(api.rpc('gs_dashboard',{}),/Entre na conta/);assert.equal(api.getSession(),null);
});
