import {readdir} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${item.name}`;if(item.isDirectory())await walk(path);else if(/\.(mjs|js)$/.test(path)){const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}}}
for(const dir of ['server','public','scripts','tests'])await walk(dir);console.log('Syntax checks passed.');
