import {test} from 'node:test'
import assert from 'node:assert/strict'
import {NATIVE_FAMILY_QUERY,reviewNativeFamilyPreflight} from '../lib/native-family-preflight.mjs'
const caller='local_11111111-1111-4111-a111-111111111111',child='local_22222222-2222-4222-a222-222222222222'
const base={caller,query:{...NATIVE_FAMILY_QUERY},rows:[{sessionId:child}],reviewedMembers:[child]}
test('complete bounded family metadata still grants no lifecycle authority',()=>{
 const result=reviewNativeFamilyPreflight(base)
 assert.equal(result.qualified,true);assert.equal(result.memberCount,1)
 assert.equal(result.archiveAuthorized,false);assert.equal(result.physicalExitQualified,false)
 assert.equal(reviewNativeFamilyPreflight({...base,rows:[],reviewedMembers:[]}).qualified,true)
})
test('family membership and ownership review must agree exactly',()=>{
 for(const patch of [{rows:[{sessionId:caller}]},{rows:[{},...base.rows]},{rows:[...base.rows,...base.rows]},{reviewedMembers:[]},{reviewedMembers:[child,child]},{rows:[],reviewedMembers:[child]},{reviewedMembers:undefined}])assert.equal(reviewNativeFamilyPreflight({...base,...patch}).qualified,false)
})
test('unbounded, truncated and broadened queries refuse',()=>{
 for(const query of [{...NATIVE_FAMILY_QUERY,linked:false},{...NATIVE_FAMILY_QUERY,include_archived:false},{...NATIVE_FAMILY_QUERY,limit:101},{...NATIVE_FAMILY_QUERY,group:'scratch'},undefined])assert.equal(reviewNativeFamilyPreflight({...base,query}).qualified,false)
 assert.equal(reviewNativeFamilyPreflight({...base,rows:Array(100).fill({sessionId:child})}).reason,'missing-or-truncated-family')
 assert.equal(reviewNativeFamilyPreflight({...base,rows:null}).qualified,false)
})
