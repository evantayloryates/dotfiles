const fs=require('fs');
const root='/workspaces/kickoff/node';
const {parseDatabaseIdentity,assertLocalIdentity,databaseFingerprint}=require(root+'/scripts/lib/dev-access-contract.cjs');
const {assertSyntheticPair}=require(root+'/scripts/lib/dev-paired-identity.cjs');
const knex=require(root+'/node_modules/knex');
(async()=>{
const identity=parseDatabaseIdentity(process.env);
const db=knex({client:'mysql2',connection:identity.url});
try {
 const marker=await assertLocalIdentity(db);
 const fingerprint=databaseFingerprint(identity,marker.instanceId);
 if(fingerprint!=='8ac86be43c289ebd98f9267a1a3208c7c2803f48b5ad19e77b3b970b92af955b')throw Error('database_changed');
 const client=await db('clients').select('id','user_id as userId','coach_id as coachId','source','target_daily_calories as targetDailyCalories').where({id:1163603}).first();
 const coach=await db('coaches').select('id','user_id as userId','source','is_active as isActive','is_insurance_dietitian as isInsuranceDietitian','is_admin as isAdmin','is_super_admin as isSuperAdmin','is_payroll_admin as isPayrollAdmin','is_top_level_admin as isTopLevelAdmin').where({id:client.coachId}).first();
 const coachUser=await db('users').select('id','email','demo_source as demoSource').where({id:coach.userId}).first();
 const clientUser=await db('users').select('id','demo_source as demoSource').where({id:client.userId}).first();
 const pair=assertSyntheticPair(coach,coachUser,client,clientUser);
 if(pair.coachId!==166027 || pair.clientUserId!==1330194 || pair.coachUserId!==1330196)throw Error('pair_changed');
 const table=(await db.schema.hasTable('logged_meals'))?'logged_meals':(await db.schema.hasTable('loggedMeals'))?'loggedMeals':null;
 if(!table)throw Error('meal_table_not_found');
 const cols=await db(table).columnInfo();
 const key=(snake,camel)=>Object.hasOwn(cols,snake)?snake:camel;
 const rows=await db(table).select(key('eaten_on','eatenOn')+' as day',key('eaten_at','eatenAt')+' as time').where(key('client_id','clientId'),pair.clientId).where(key('is_deleted','isDeleted'),0).orderBy(key('eaten_at','eatenAt'),'desc').limit(5);
 console.log(JSON.stringify({pairVerified:true,table,mealsFound:rows.length,recentDates:rows}));
} finally {await db.destroy();}
})().catch(()=>{console.error('guarded_pair_read_failed');process.exitCode=1});
