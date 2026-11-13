import pg from 'pg';
let pool;
export function getPool(){
 const connectionString=process.env.NETLIFY_DB_URL||process.env.NETLIFY_DATABASE_URL;
 if(!connectionString){const error=new Error('Database activation pending');error.code='DB_NOT_CONFIGURED';throw error;}
 pool ||= new pg.Pool({connectionString,max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
 return pool;
}
