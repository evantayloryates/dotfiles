import {EngineError} from './client.mjs';

export const actionEvidenceSchema={type:'array',maxItems:16,description:'Saved absolute local file paths only. Save evidence first; put prose observations in action context or session_note.',items:{type:'string',maxLength:2048,pattern:'^/[^\\u0000-\\u001f\\u007f-\\u009f]*$'}};
export function validateActionEvidence(input){
 const refs=input.evidence_refs;
 if(refs===undefined)return input;
 const hint='evidence_refs must contain up to 16 absolute local file paths (each at most 2048 UTF-8 bytes, no control characters). Save evidence to a file first; put prose observations in action context or session_note. The action has not been closed.';
 if(!Array.isArray(refs)||refs.length>16)throw new EngineError('bad_action_evidence',hint);
 for(let i=0;i<refs.length;i++){
  const ref=refs[i];
  if(typeof ref!=='string'||!ref.startsWith('/')||Buffer.byteLength(ref)>2048||/[\p{Cc}\p{Cf}]/u.test(ref))throw new EngineError('bad_action_evidence',`evidence_refs[${i}]: ${hint}`);
 }
 return input;
}
