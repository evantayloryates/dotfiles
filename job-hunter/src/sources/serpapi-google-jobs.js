export const metadata={source:'serpapi_google_jobs',access_type:'optional_paid_api_key',supports_incremental:false,supports_salary:true,terms_notes:'Disabled unless SERPAPI_API_KEY is present'};
export const available=()=>Boolean(process.env.SERPAPI_API_KEY);
export async function fetchSerpApi(){ if(!available()) return []; throw new Error('SerpApi adapter is configured but not enabled in the MVP source set.'); }
