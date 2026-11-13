import * as identity from '@netlify/identity';
import {getPool} from '../../server/database.mjs';
import {getStore} from '@netlify/blobs';
import {createHandler} from '../../server/portal-service.mjs';
async function transaction(user,task){
 const client=await getPool().connect();
 try{
  await client.query('begin');
  // These settings are transaction-local. No caller-supplied user ID/role is trusted.
  await client.query("select set_config('app.user_id',$1,true),set_config('app.bootstrap_master_id',$2,true)",[user.id,process.env.GUIASESAB_MASTER_USER_ID||'']);
  await client.query('insert into public.gs_accounts(id,email) values($1,$2) on conflict(id) do update set email=excluded.email',[user.id,user.email||'']);
  const result=await task(client);await client.query('commit');return result;
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}
export default createHandler({identity,transaction,getStore:()=>getStore({name:'guiasesab-signed',consistency:'strong'})});
export const config={path:'/api/*'};
