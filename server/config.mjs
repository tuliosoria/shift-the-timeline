import { parseArgs } from 'node:util';
export function readServerOptions(args=process.argv.slice(2),env=process.env){
 const {values}=parseArgs({args,options:{host:{type:'string'},port:{type:'string'},strictPort:{type:'boolean'}}});
 const port=Number(values.port??env.PORT??3000),host=values.host??env.HOST??'127.0.0.1';
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Port must be between 1 and 65535.');
 return {port,host};
}
