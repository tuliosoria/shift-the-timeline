// Only locally selected stages and enumerated codes may leave this module. Never
// serialize SDK/PG errors: message, stack, cause and response may contain secrets.
const stages=new Set(['config','identity','token','database','case','server','runtime']);
const marked=new WeakMap();
const codes=new Map([
 ['28P01','database_authentication'],['28000','database_authorization'],['42501','database_permission'],
 ['42P01','database_schema_missing'],['42703','database_schema_mismatch'],['3D000','database_missing'],
 ['53300','database_connections'],['57P03','database_unavailable'],['57014','database_timeout'],
 ['ENOTFOUND','dns'],['EAI_AGAIN','dns'],['ECONNREFUSED','connection_refused'],
 ['ETIMEDOUT','connection_timeout'],['ECONNRESET','connection_reset'],['EHOSTUNREACH','network_unreachable'],
 ['ENETUNREACH','network_unreachable'],['ERR_TLS_CERT_ALTNAME_INVALID','tls_hostname'],
 ['CERT_HAS_EXPIRED','tls_expired'],['UNABLE_TO_VERIFY_LEAF_SIGNATURE','tls_trust'],
 ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY','tls_trust'],['DEPTH_ZERO_SELF_SIGNED_CERT','tls_trust'],
 ['ENOENT','file_missing'],['EACCES','file_permission'],['EADDRINUSE','port_in_use'],
 ['SHIFT_CASE_INTEGRITY','case_integrity'],['SHIFT_CASE_SIZE','case_size'],['SHIFT_TOKEN_MISSING','token_missing'],['SHIFT_TOKEN_TIMEOUT','token_timeout'],['SHIFT_AI_POLICY_INVALID','ai_policy_invalid']
]);
export async function startupStep(stage,run){
 try{return await run();}catch(error){if(error!==null&&(typeof error==='object'||typeof error==='function')&&!marked.has(error))marked.set(error,stages.has(stage)?stage:'runtime');throw error;}
}
export function startupDiagnostic(error,fallback='runtime'){
 let code,message;try{code=error?.code;message=error?.message;}catch{/* Do not invoke/serialize hostile diagnostics. */}
 const stage=marked.get(error)??(stages.has(fallback)?fallback:'runtime');
 let reason=typeof code==='string'?(codes.get(code)??'unknown'):'unknown';
 // Exact strings verified in pinned pg/pg-pool source; never log the message itself.
 if(reason==='unknown'&&stage==='database'&&['timeout expired','timeout exceeded when trying to connect','Connection terminated due to connection timeout'].includes(message))reason='connection_timeout';
 return {event:'azure_startup_failed',stage,reason};
}
export function reportStartupFailure(error,write=console.error){write(JSON.stringify(startupDiagnostic(error)));}
