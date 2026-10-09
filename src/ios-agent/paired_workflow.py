#!/usr/bin/env python3
"""Fixed read-only synthetic pair snapshot. No auth minting or data mutation."""
import json
import os
from pathlib import Path
import re
import sys
from dev_runtime import load_config
from local_stack import run, checked_mount, local_desktop_endpoint, ENV
from install_runtime import verify_local_backend
from service import STATE

CONTAINER = 'default-ki-e3ee9-dev-1'
SCRIPT = r'''
const fs=require('fs');
const {parseDatabaseIdentity,assertLocalIdentity,databaseFingerprint}=require('./scripts/lib/dev-access-contract.cjs');
const {assertSyntheticPair}=require('./scripts/lib/dev-paired-identity.cjs');
const {knexSnakeCaseMappers}=require('objection');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const identity=parseDatabaseIdentity(process.env);
if(identity.host!=='db'||identity.schema!=='kudos_development')process.exit(2);
const db=require('knex')({client:'mysql2',connection:identity.url,...knexSnakeCaseMappers()});
(async()=>{
 const marker=await assertLocalIdentity(db);
 const result=await db.transaction(async trx=>{
  const coachUser=await trx('users').select('id','email','demoSource').where({email:'insurance-dietitian@kickoff.local',demoSource:'local-demo'}).first();
  if(!coachUser)throw Error('pair');
  const coach=await trx('coaches').select('id','userId','source','isActive','isInsuranceDietitian','isAdmin','isSuperAdmin','isPayrollAdmin','isTopLevelAdmin').where({userId:coachUser.id,source:'local-demo'}).first();
  if(!coach)throw Error('pair');
  let q=trx('clients').select('id','userId','coachId','source','targetDailyCalories').where({source:'local-demo',coachId:coach.id});
  if(input.clientId)q=q.where('id',input.clientId);
  const client=await q.orderBy('id').first();
  if(!client)throw Error('pair');
  const clientUser=await trx('users').select('id','demoSource').where({id:client.userId,demoSource:'local-demo'}).first();
  const pair=assertSyntheticPair(coach,coachUser,client,clientUser);
  return {...pair,databaseFingerprint:databaseFingerprint(identity,marker.instanceId),targetDailyCalories:client.targetDailyCalories};
 });
 await db.destroy();process.stdout.write(JSON.stringify(result));
})().catch(async()=>{await db.destroy().catch(()=>{});process.exit(2);});
'''

def validate_snapshot(value):
    keys = {'coachId','coachUserId','clientId','clientUserId','databaseFingerprint','targetDailyCalories'}
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError('paired_snapshot_invalid')
    if any(not re.fullmatch(r'[1-9][0-9]{0,19}', str(value[k])) for k in keys if k.endswith('Id')):
        raise ValueError('paired_snapshot_invalid')
    if not re.fullmatch(r'[a-f0-9]{64}', value['databaseFingerprint']):
        raise ValueError('paired_snapshot_invalid')
    calories = value['targetDailyCalories']
    if calories is not None and (type(calories) is not int or not 0 <= calories <= 100000):
        raise ValueError('paired_snapshot_invalid')
    return value

def snapshot(state=STATE, client_id=None):
    if client_id is not None and not re.fullmatch(r'[1-9][0-9]{0,19}', str(client_id)):
        raise ValueError('fixed_client_id_required')
    if os.environ.get('DOCKER_HOST') or (os.environ.get('DOCKER_CONTEXT') and os.environ['DOCKER_CONTEXT']!='desktop-linux'):
        raise ValueError('remote_docker_override_not_supported')
    if run(['docker','context','show']).decode().strip()!='desktop-linux':
        raise ValueError('existing_local_desktop_context_required')
    endpoint=run(['docker','context','inspect','desktop-linux','--format','{{.Endpoints.docker.Host}}']).decode().strip()
    if not local_desktop_endpoint(endpoint): raise ValueError('existing_local_desktop_endpoint_required')
    checkout=Path(load_config(Path(state)/'dev-runtime.json')['mobile']).parent
    if run(['git','-C',str(checkout),'branch','--show-current']).decode().strip()!='ety/local-dev-foundation':
        raise ValueError('configured_foundation_branch_required')
    mounts=json.loads(run(['docker','inspect','--format','{{json .Mounts}}',CONTAINER]))
    if not checked_mount(mounts,checkout): raise ValueError('configured_checkout_mount_required')
    verify_local_backend(CONTAINER)
    args=['docker','exec','-i']
    for value in ENV: args+=['-e',value]
    args+=['-w','/workspaces/kickoff/node',CONTAINER,'node','-e',SCRIPT]
    raw=run(args,input=json.dumps({'clientId':client_id}).encode(),timeout=15)
    if len(raw)>8192:raise ValueError('paired_snapshot_invalid')
    value = validate_snapshot(json.loads(raw))
    if client_id is not None and str(value['clientId']) != str(client_id):
        raise ValueError('paired_selected_client_mismatch')
    return value

if __name__=='__main__':
    try:
        value=json.loads(sys.stdin.read(4097))
        if not isinstance(value,dict) or set(value)-{'state','clientId'}:raise ValueError('fixed_arguments_required')
        print(json.dumps({'ok':True,'snapshot':snapshot(Path(value.get('state',STATE)),value.get('clientId'))}))
    except Exception:
        print(json.dumps({'ok':False,'reason':'paired_local_read_refused','dataChanged':False,'credentialsCreated':False}))
        raise SystemExit(2)
