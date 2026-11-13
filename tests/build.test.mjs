import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readdir,readFile} from 'node:fs/promises';
test('deployment copies only public frontend files and no QA fixtures, SQL, dependencies or operational documents',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:new URL('../',import.meta.url)});
 assert.deepEqual((await readdir(new URL('../dist/',import.meta.url))).sort(),['admin.html','assets','index.html','portal.html']);
 assert.deepEqual((await readdir(new URL('../dist/assets/',import.meta.url))).sort(),['api.js','auth-redirect.js','generator-bridge.js','generator.css','pdf-workflow.js','portal.css','portal.js']);
 const api=await readFile(new URL('../dist/assets/api.js',import.meta.url),'utf8');assert.ok(!api.includes('local-qa-only'));assert.ok(api.includes("'/api/'"));assert.ok(!api.includes('supabase'));
 const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');assert.ok(!html.includes('SUPA_KEY'));
});
