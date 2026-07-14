export const metadata={source:'adzuna',access_type:'optional_api_key',supports_incremental:true,supports_salary:true,terms_notes:'Disabled unless ADZUNA_APP_ID and ADZUNA_APP_KEY are present'};
export const available=()=>Boolean(process.env.ADZUNA_APP_ID&&process.env.ADZUNA_APP_KEY);
export async function fetchAdzuna(){ if(!available()) return []; throw new Error('Adzuna adapter is configured but not enabled in the MVP source set.'); }
