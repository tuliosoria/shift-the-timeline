import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';

// No environment mutation, logging or network. The credential never reaches a client.
export function createLocalSecretReader(filename){
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw new Error('Absolute local credential path required');
 return async()=>{
  let handle;
  try{
   for(let p=path.resolve(filename);;p=path.dirname(p)){
    const info=await lstat(p);if(info.isSymbolicLink())throw new Error();
    if(typeof process.getuid==='function'&&info.uid!==process.getuid()&&info.uid!==0)throw new Error();
    if(path.dirname(p)===p)break;
   }
   handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
   const info=await handle.stat();
   if(!info.isFile()||info.size>4096||info.size<1||(info.mode&0o077)!==0||typeof process.getuid==='function'&&info.uid!==process.getuid())throw new Error();
   const text=await handle.readFile('utf8');const match=/^OPENAI_API_KEY=(sk-[A-Za-z0-9_-]+)\n?$/.exec(text);
   if(!match)throw new Error();return match[1];
  }catch{throw new Error('Local AI credential unavailable');}
  finally{await handle?.close();}
 };
}
