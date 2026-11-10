// Replaced only by the reviewed package build, never by a runtime environment value.
export const RELEASE_COMMIT=typeof __SHIFT_RELEASE_COMMIT__==='undefined'?null:__SHIFT_RELEASE_COMMIT__;
export function releaseResponse(request,commit=RELEASE_COMMIT){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers});
 if(typeof commit!=='string'||! /^[a-f0-9]{40}$/.test(commit))return new Response(null,{status:404,headers});
 return new Response(request.method==='HEAD'?null:JSON.stringify({commit}),{headers});
}
