import {join,resolve} from 'node:path'
import {DriverError} from './paths.mjs'
export function independentServiceState(session,serviceId,record){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||'')||! /^[a-f0-9]{32}$/.test(serviceId||'')||record?.sessionId!==session||typeof record.cwd!=='string'||record.cwd==='/'||resolve(record.cwd)!==record.cwd)throw new DriverError('independent receiver identity refused',{category:'bad_args'})
 return join(record.cwd,'.claude-driver-services',serviceId)
}
