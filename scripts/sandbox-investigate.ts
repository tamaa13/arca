import { Wallet } from "ethers";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { SandboxClient } from "../src/sandbox/client.js";
const key=fs.readFileSync(path.join(os.homedir(),".arca","key"),"utf8").trim();
const c=new SandboxClient(new Wallet(key));
const B="https://provider-private-sandbox-testnet.0g.ai";
try{console.log("INFO:",JSON.stringify(await c.info()));}catch(e:any){console.log("info err",e.message.slice(0,80));}
try{const s:any=await c.snapshots();console.log("SNAPSHOTS:",Array.isArray(s)?`${s.length} items: `+JSON.stringify(s.slice(0,6)):JSON.stringify(s).slice(0,600));}catch(e:any){console.log("snap err",e.message.slice(0,80));}
for(const p of ["/api/registry/images","/api/registry","/api/images","/api/snapshots"]){
  try{const r=await fetch(B+p,{signal:AbortSignal.timeout(15000)});console.log(`\n${p} → ${r.status}\n`+(await r.text()).slice(0,500));}catch(e:any){console.log(p,"err",e.message.slice(0,60));}
}
// cleanup the two useless base-snapshot containers (stop the burn)
for(const id of ["ead2a6c4-e530-4d8e-86a0-08a7e8e498ed","58ae1305-9cc6-47a9-902d-45ebe8112d90"]){
  try{await c.deleteSandbox(id);console.log("\ndeleted",id.slice(0,8));}catch(e:any){console.log("\ndel err",id.slice(0,8),e.message.slice(0,60));}
}
