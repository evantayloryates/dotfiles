export const metadata={source:'theirstack',access_type:'optional_paid_api_key',supports_incremental:true,supports_salary:true,terms_notes:'Disabled unless THEIRSTACK_API_KEY is present'};
export const available=()=>Boolean(process.env.THEIRSTACK_API_KEY);
export async function fetchTheirStack(){ if(!available()) return []; throw new Error('TheirStack adapter is configured but not enabled in the MVP source set.'); }
