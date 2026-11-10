// Explicit build input only. Never derive a revision from environment variables.
export function parseReleaseCommit(args){
 if(args.length===0)return null;
 if(args.length!==2||args[0]!=='--release-commit'||!/^[a-f0-9]{40}$/.test(args[1]))throw new Error('Expected --release-commit followed by a 40-character lowercase commit SHA.');
 return args[1];
}
