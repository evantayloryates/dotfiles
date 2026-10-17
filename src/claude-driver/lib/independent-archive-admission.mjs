import {withLock} from './state.mjs'
import {DriverError} from './paths.mjs'
// Same global lock used by target activation and retirement. The parent keeps
// it until the controller worker exits, including postcondition reconciliation.
export function withIndependentArchiveTarget(session,work,{signal}={}){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||''))throw new DriverError('exact archive target required',{category:'bad_args'})
 return withLock('independent-activation-'+session,work,{timeoutMs:5000,signal})
}
