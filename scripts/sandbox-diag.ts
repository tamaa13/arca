import { Wallet } from "ethers";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { SandboxClient } from "../src/sandbox/client.js";
import { buildSandboxEndpoint } from "../src/sandbox/constants.js";
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const key=fs.readFileSync(path.join(os.homedir(),".arca","key"),"utf8").trim();
const c=new SandboxClient(new Wallet(key));
const env={ARCA_PORT:"8080",ARCA_RPC:"https://evmrpc-testnet.0g.ai",ARCA_INDEXER:"https://indexer-storage-testnet-turbo.0g.ai",ARCA_CHAIN_ID:"16602",ARCA_REGISTRY_ADDR:"0xc196C28886c93462f55A78134b5bF6118A3f5860"};
console.log("creating UNSEALED test container (same image)…");
const sb=await c.createSandbox({image:"ghcr.io/tamaa13/arca-mcp:latest",sealed:false,name:"arca-unsealed-test",env});
console.log("created:",sb.id,"| state:",sb.state,"| img:",sb.imageName);
const ep=buildSandboxEndpoint(sb.id);
let healthy=false;
for(let i=0;i<48;i++){try{if((await fetch(`${ep}/health`,{signal:AbortSignal.timeout(8000)})).ok){healthy=true;break;}}catch{}if(i%6===0)console.log(`  …health ${i*5}s`);await sleep(5000);}
console.log(healthy?"✓ HEALTHY unsealed → IMAGE OK, seal-mode is the issue":"⚠ not healthy unsealed → image/boot bug; exec to diagnose:");
for(const cmd of ["ps aux 2>/dev/null | grep -iE 'bun|node|arca' | grep -v grep","(ss -tlnp || netstat -tlnp) 2>/dev/null | grep -E ':8080|LISTEN' | head","ls -la /app 2>/dev/null | head","cat /proc/1/cmdline 2>/dev/null | tr '\\0' ' '; echo","sh -c 'cd /app 2>/dev/null && timeout 10 bun src/transport/http-server.ts 2>&1 | head -25 || echo NO_APP_DIR'"]){
  try{const r=await c.exec(sb.id,cmd,40);console.log(`\n$ ${cmd}\n${(r.stdout||r.result||r.stderr||"(empty) exit="+r.exitCode).slice(0,1200)}`);}
  catch(e:any){console.log(`\n$ ${cmd}\nEXEC ERR: ${e.message.slice(0,140)}`);}
}
console.log("\n__TEST_SANDBOX_ID__",sb.id);
